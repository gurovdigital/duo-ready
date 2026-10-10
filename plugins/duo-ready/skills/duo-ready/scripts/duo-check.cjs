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
 *   node duo-check.cjs 'https://example.com' ['https://example.com/pricing' ...]
 *   node duo-check.cjs 'https://example.com' --out ./report --shots
 *
 * Exit code 1 when any crease hit or sideways scroll is found, or when a page
 * could not be checked, so it can gate a deploy. Needs Node 22+ (built-in
 * WebSocket) and Google Chrome.
 * CHROME_PATH overrides the browser location. */

'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
if (!urls.length || typeof outDir !== 'string' || !outDir || outDir.startsWith('--')) {
  console.error('Usage: node duo-check.cjs <url> [url ...] [--out dir] [--shots]');
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

// The code that runs inside the audited page. Each piece is a fixed function:
// no value is ever pasted into its text, values go in as arguments. The
// functions run in an isolated world, so the page cannot replace the built-in
// helpers they use (slice, JSON, Math and so on).
const FN_STATUS = `function () {
  const nav = performance.getEntriesByType('navigation')[0];
  return (nav && nav.responseStatus) || 0;
}`;
const FN_HEIGHT = `function () { return document.scrollingElement.scrollHeight; }`;
const FN_SCROLL = `function (y) { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, y); return 1; }`;
const FN_PROBE = `function (narrow) {
  const vw = innerWidth, mid = vw / 2;
  const sel = el => {
    const cls = (typeof el.className === 'string' ? el.className : '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
    return (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls.length ? '.' + cls.join('.') : '')).slice(0, 80);
  };
  const controls = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[onclick]')]
    .filter(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.left < mid - 2 && r.right > mid + 2; });
  const narrowOnes = controls.filter(el => el.getBoundingClientRect().width < narrow);
  const hits = narrowOnes.slice(0, 200).map(el => {
    const r = el.getBoundingClientRect();
    return { selector: sel(el), text: (el.textContent || el.getAttribute('aria-label') || el.placeholder || '').trim().replace(/\\s+/g, ' ').slice(0, 60),
             left: Math.round(r.left), right: Math.round(r.right), pageY: Math.round(r.top + scrollY), width: Math.round(r.width) };
  });
  return { width: vw, scrollWidth: document.scrollingElement.scrollWidth, crease: mid, hits, wideRowsCrossing: controls.length - narrowOnes.length };
}`;
const FN_CENTRE_LINE = `function () {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;bottom:0;left:50%;border-left:2px dashed #e8836b;z-index:2147483647;pointer-events:none';
  document.body.appendChild(d);
  return 1;
}`;

// Everything the probe returns still comes from the audited page: link text,
// ids and class names are the page's own words. So types, lengths and
// characters are enforced once more here, in Node, before anything is written
// to the report.
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f`|<>\[\]\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const safeHits = (list) => (Array.isArray(list) ? list.slice(0, 200) : []).map((h) => ({
  selector: clean(h?.selector, 80), text: clean(h?.text, 60),
  left: int(h?.left), right: int(h?.right), pageY: int(h?.pageY), width: int(h?.width),
}));

// Until Chrome runs there is nothing to clean up; main() replaces this.
let finish = async (code) => process.exit(code);

async function main() {
  const chromePath = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-check-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    // Keep Chrome's own traffic low: these runs need the audited page and nothing else.
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--no-pings',
    '--disable-default-apps', '--disable-client-side-phishing-detection', '--disable-domain-reliability', '--disable-breakpad', '--metrics-recording-only',
    '--disable-features=OptimizationHints,OptimizationHintsFetching,OptimizationGuideModelDownloading,OptimizationTargetPrediction,MediaRouter,Translate',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const chromeGone = new Promise((r) => chrome.once('exit', r));
  // Last resort, when the process ends without finish(): kill Chrome, give its
  // helper processes a moment to stop writing, then remove the profile folder.
  const shutdown = () => {
    if (chrome.exitCode === null && chrome.signalCode === null) {
      try { chrome.kill('SIGKILL'); } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    }
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  };
  process.on('exit', shutdown);
  // The normal way out: ask Chrome to close itself and wait until it has, so no
  // Chrome process and no profile folder stay behind. The same path runs when
  // the script is stopped from outside.
  let closing = false;
  finish = async (code) => {
    closing = true;
    try { chrome.kill('SIGTERM'); } catch {}
    await Promise.race([chromeGone, sleep(3000)]);
    process.exit(code);
  };
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) process.on(sig, () => finish(code));

  // With port 0 Chrome picks a free port and writes it, with the path of the
  // browser endpoint, into the profile folder that only this user can read. So
  // the script talks to the Chrome it started and to nothing else.
  let endpoint;
  for (let i = 0; i < 150 && !endpoint; i++) {
    try {
      const [p, wsPath] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
      if (/^\d+$/.test(p) && /^\/devtools\/browser\/[\w-]+$/.test(wsPath || '')) endpoint = `ws://127.0.0.1:${p}${wsPath}`;
    } catch {}
    if (!endpoint) await sleep(200);
  }
  if (!endpoint) { console.error('Chrome did not start.'); return finish(2); }

  const ws = new WebSocket(endpoint);
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('Could not connect to Chrome.'))); });
  ws.addEventListener('close', () => { if (!closing) { console.error('Lost the connection to Chrome.'); finish(2); } });
  const send = (method, params = {}, sessionId) => new Promise((res) => {
    const id = ++seq;
    const t = setTimeout(() => { pending.delete(id); res({ error: 'timeout' }); }, 30000);
    pending.set(id, (m) => { clearTimeout(t); res(m.result || { error: m.error }); });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
  // A page must not be able to save files on this computer.
  await send('Browser.setDownloadBehavior', { behavior: 'deny' });

  const checkPose = async (url, [pose, W, H, opened]) => {
    const entry = { url, pose, width: W, height: H, opened, failed: '', sideways: false, hits: [], wideRowsCrossing: 0 };
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    if (!targetId) { entry.failed = 'Chrome did not open a tab'; return entry; }
    try {
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      // One answer that does not come in time ends this pose, so a page that
      // blocks the browser cannot hold the whole run.
      const S = async (m, p) => { const r = await send(m, p, sessionId); if (r.error === 'timeout') throw new Error('Chrome did not answer in time'); return r; };
      await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
      await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await S('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
      await S('Page.enable');
      const nav = await S('Page.navigate', { url });
      await sleep(6000);

      const frameId = (await S('Page.getFrameTree')).frameTree?.frame?.id;
      const world = frameId ? (await S('Page.createIsolatedWorld', { frameId, worldName: 'duo-check' })).executionContextId : 0;
      const call = async (fn, ...values) => (world ? (await S('Runtime.callFunctionOn', { functionDeclaration: fn, executionContextId: world, arguments: values.map((value) => ({ value })), returnByValue: true })).result?.value : undefined);

      // A page that did not load, or that the server answered with an error
      // status, has not been checked. It must not count as a pass.
      const status = int(await call(FN_STATUS));
      // Walk the page so lazy sections render; the crease check then sees them all.
      const h = int(await call(FN_HEIGHT)) || H;
      for (let y = 0, n = 0; y < h && n < 60; y += Math.round(H * 0.8), n++) {
        await call(FN_SCROLL, y);
        await sleep(180);
      }
      await call(FN_SCROLL, 0);
      await sleep(800);
      const r = await call(FN_PROBE, NARROW);
      const ok = r && typeof r === 'object';
      entry.failed = clean(nav.errorText || (nav.error ? 'navigation failed' : '') || (status >= 400 ? `HTTP ${status}` : '') || (ok ? '' : 'probe failed'), 80);
      if (ok) {
        entry.sideways = int(r.scrollWidth) > int(r.width);
        entry.hits = opened ? safeHits(r.hits) : [];
        entry.wideRowsCrossing = opened ? int(r.wideRowsCrossing) : 0;
      }

      if (withShots && opened && entry.hits.length) {
        await call(FN_CENTRE_LINE);
        for (const [i, hit] of entry.hits.slice(0, 12).entries()) {
          await call(FN_SCROLL, Math.max(0, hit.pageY - Math.round(H / 2)));
          await sleep(500);
          const shot = await S('Page.captureScreenshot', { format: 'png' });
          if (shot.data) {
            const slug = new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
            fs.writeFileSync(path.join(outDir, `${slug}-${pose}-${String(i + 1).padStart(2, '0')}.png`), Buffer.from(shot.data, 'base64'));
          }
        }
      }
    } catch (e) {
      entry.failed = clean(e && e.message, 80) || 'check failed';
    } finally {
      await send('Target.closeTarget', { targetId });
    }
    return entry;
  };

  const results = [];
  for (const url of urls) {
    for (const poseDef of POSES) {
      const entry = await checkPose(url, poseDef);
      results.push(entry);
      process.stdout.write(`${entry.failed || entry.hits.length || entry.sideways ? '✗' : '✓'} ${url} ${entry.pose}${entry.failed ? ` - not checked: ${entry.failed}` : ''}${entry.hits.length ? ` - ${entry.hits.length} on the crease` : ''}${entry.sideways ? ' - scrolls sideways' : ''}\n`);
    }
  }

  fs.writeFileSync(path.join(outDir, 'duo-report.json'), JSON.stringify(results, null, 2));

  const md = ['# Duo-ready check', '', `Checked ${new Date().toISOString().slice(0, 10)} in headless Chrome with touch input emulated. Emulation, not the device: confirm on hardware before you publish a verdict.`, ''];
  const failing = results.filter((r) => r.failed || r.hits.length || r.sideways);
  const unchecked = results.filter((r) => r.failed).length;
  md.push(unchecked ? `**${unchecked} pose(s) could not be checked. This is not a pass.**` : failing.length ? `**${failing.length} pose(s) need work.**` : '**No crease hits and no sideways scrolling at any pose.**', '');
  for (const url of urls) {
    md.push(`## ${url}`, '', '| Pose | Size | Crease hits | Sideways scroll |', '|---|---|---|---|');
    for (const r of results.filter((x) => x.url === url)) md.push(`| ${r.pose} | ${r.width} × ${r.height} | ${r.failed ? `not checked: ${r.failed}` : r.opened ? r.hits.length : '-'} | ${r.failed ? 'not checked' : r.sideways ? 'yes' : 'no'} |`);
    md.push('');
    for (const r of results.filter((x) => x.url === url && x.hits.length)) {
      md.push(`### ${r.pose}: controls on the crease (x = ${r.width / 2})`, '', '| Element | Text | Spans x | Page y |', '|---|---|---|---|');
      for (const h of r.hits) md.push(`| \`${h.selector}\` | ${h.text.replace(/\|/g, '/') || '-'} | ${h.left}-${h.right} | ${h.pageY} |`);
      md.push('');
    }
  }
  fs.writeFileSync(path.join(outDir, 'duo-report.md'), md.join('\n'));
  console.log(`\nReport: ${path.join(outDir, 'duo-report.md')}`);
  return finish(failing.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  return finish(1);
});
