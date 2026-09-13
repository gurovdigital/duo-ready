#!/usr/bin/env node
/* duo-check - read a website at every iPhone Duo pose.
 *
 * Opens each URL in headless Chrome at every pose of a book-style foldable
 * (iPhone Duo sizes by default), with touch input emulated, scrolls the whole
 * page so lazy content loads, and reports:
 *   - controls narrower than 240px that straddle the vertical centre line of
 *     an opened pose (the crease), with their text and page position
 *   - pages that scroll sideways at any pose
 *
 * Usage:
 *   node duo-check.mjs https://example.com [https://example.com/pricing ...]
 *   node duo-check.mjs https://example.com --out ./report --shots
 *
 * Exit code 1 when any crease hit or sideways scroll is found, so it can gate
 * a deploy. Needs Node 22+ (built-in WebSocket) and Google Chrome.
 * CHROME_PATH overrides the browser location. */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const POSES = [
  // name, width, height, opened (has a crease)
  ['closed-portrait', 466, 678, false],
  ['closed-landscape', 678, 466, false],
  // Apple's spec sheet panel implies 626 x 890 points opened; App Store
  // Connect's screenshot size implies 669 x 951. Check both until one is
  // confirmed on the device.
  ['open-890', 890, 626, true],
  ['open-951', 951, 669, true],
  // The inner screen ignores orientation; turned, the crease runs across.
  ['open-turned', 669, 951, false],
  ['split-view', 475, 669, false],
];
const NARROW = 240;

const args = process.argv.slice(2);
const urls = args.filter((a) => /^https?:\/\//.test(a));
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : './duo-report';
const withShots = args.includes('--shots');
if (!urls.length) {
  console.error('Usage: node duo-check.mjs <url> [url ...] [--out dir] [--shots]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const hit = candidates.find((c) => fs.existsSync(c));
  if (!hit) {
    console.error('Google Chrome not found. Set CHROME_PATH.');
    process.exit(2);
  }
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) =>
  new Promise((res, rej) =>
    http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));

const port = 9222 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-check-'));
const chrome = spawn(findChrome(), [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--remote-allow-origins=*', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const shutdown = () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(130); });

let version;
for (let i = 0; i < 150 && !version; i++) { try { version = await getJSON(`http://127.0.0.1:${port}/json/version`); } catch { await sleep(200); } }
if (!version) { console.error('Chrome did not start.'); process.exit(2); }

const ws = new WebSocket(version.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const id = ++seq;
  const t = setTimeout(() => { pending.delete(id); res({ error: 'timeout' }); }, 30000);
  pending.set(id, (m) => { clearTimeout(t); res(m.result || { error: m.error }); });
  ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
});

const PROBE = `(() => {
  const vw = innerWidth, mid = vw / 2;
  const sel = el => {
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls.length ? '.' + cls.join('.') : '');
  };
  const controls = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[onclick]')]
    .filter(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.left < mid - 2 && r.right > mid + 2; });
  const hits = controls.filter(el => el.getBoundingClientRect().width < ${NARROW}).map(el => {
    const r = el.getBoundingClientRect();
    return { selector: sel(el), text: (el.textContent || el.getAttribute('aria-label') || el.placeholder || '').trim().replace(/\\s+/g, ' ').slice(0, 60),
             left: Math.round(r.left), right: Math.round(r.right), pageY: Math.round(r.top + scrollY), width: Math.round(r.width) };
  });
  return JSON.stringify({ width: vw, scrollWidth: document.scrollingElement.scrollWidth, crease: mid, hits, wideRowsCrossing: controls.length - hits.length });
})()`;

const results = [];
for (const url of urls) {
  for (const [pose, W, H, opened] of POSES) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => send(m, p, sessionId);
    await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
    await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await S('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
    await S('Page.enable');
    await S('Page.navigate', { url });
    await sleep(6000);
    // Walk the page so lazy sections render; the crease check then sees them all.
    const h = (await S('Runtime.evaluate', { expression: 'document.scrollingElement.scrollHeight', returnByValue: true })).result?.value || H;
    for (let y = 0, n = 0; y < h && n < 60; y += Math.round(H * 0.8), n++) {
      await S('Runtime.evaluate', { expression: `document.documentElement.style.scrollBehavior='auto';scrollTo(0,${y})` });
      await sleep(180);
    }
    await S('Runtime.evaluate', { expression: 'scrollTo(0,0)' });
    await sleep(800);
    const raw = (await S('Runtime.evaluate', { expression: PROBE, returnByValue: true })).result?.value;
    const r = raw ? JSON.parse(raw) : { error: 'probe failed' };
    const entry = { url, pose, width: W, height: H, opened, sideways: r.scrollWidth > r.width, hits: opened ? r.hits || [] : [], wideRowsCrossing: opened ? r.wideRowsCrossing : 0 };
    results.push(entry);

    if (withShots && opened && entry.hits.length) {
      await S('Runtime.evaluate', { expression: `(()=>{const d=document.createElement('div');d.style.cssText='position:fixed;top:0;bottom:0;left:50%;border-left:2px dashed #e8836b;z-index:2147483647;pointer-events:none';document.body.appendChild(d);return 1})()` });
      for (const [i, hit] of entry.hits.slice(0, 12).entries()) {
        await S('Runtime.evaluate', { expression: `scrollTo(0, Math.max(0, ${hit.pageY} - ${Math.round(H / 2)}))` });
        await sleep(500);
        const shot = await S('Page.captureScreenshot', { format: 'png' });
        if (shot.data) {
          const slug = new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
          fs.writeFileSync(path.join(outDir, `${slug}-${pose}-${String(i + 1).padStart(2, '0')}.png`), Buffer.from(shot.data, 'base64'));
        }
      }
    }
    await send('Target.closeTarget', { targetId });
    process.stdout.write(`${entry.hits.length || entry.sideways ? '✗' : '✓'} ${url} ${pose}${entry.hits.length ? ` - ${entry.hits.length} on the crease` : ''}${entry.sideways ? ' - scrolls sideways' : ''}\n`);
  }
}

fs.writeFileSync(path.join(outDir, 'duo-report.json'), JSON.stringify(results, null, 2));

const md = ['# Duo-ready check', '', `Checked ${new Date().toISOString().slice(0, 10)} in headless Chrome with touch input emulated. Emulation, not the device: confirm on hardware before you publish a verdict.`, ''];
const failing = results.filter((r) => r.hits.length || r.sideways);
md.push(failing.length ? `**${failing.length} pose(s) need work.**` : '**No crease hits and no sideways scrolling at any pose.**', '');
for (const url of urls) {
  md.push(`## ${url}`, '', '| Pose | Size | Crease hits | Sideways scroll |', '|---|---|---|---|');
  for (const r of results.filter((x) => x.url === url)) md.push(`| ${r.pose} | ${r.width} × ${r.height} | ${r.opened ? r.hits.length : '-'} | ${r.sideways ? 'yes' : 'no'} |`);
  md.push('');
  for (const r of results.filter((x) => x.url === url && x.hits.length)) {
    md.push(`### ${r.pose}: controls on the crease (x = ${r.width / 2})`, '', '| Element | Text | Spans x | Page y |', '|---|---|---|---|');
    for (const h of r.hits) md.push(`| \`${h.selector}\` | ${h.text.replace(/\|/g, '/') || '-'} | ${h.left}-${h.right} | ${h.pageY} |`);
    md.push('');
  }
}
fs.writeFileSync(path.join(outDir, 'duo-report.md'), md.join('\n'));
console.log(`\nReport: ${path.join(outDir, 'duo-report.md')}`);
shutdown();
process.exit(failing.length ? 1 : 0);
