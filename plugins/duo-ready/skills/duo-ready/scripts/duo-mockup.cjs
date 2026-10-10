#!/usr/bin/env node
/* duo-mockup - put any page on an opened foldable, crease drawn in.
 *
 * Renders a URL at the opened iPhone Duo size with touch input emulated,
 * then places the render in a device frame with the crease and a dashed
 * centre line - the picture that makes a fold problem obvious to a client.
 *
 * Usage:
 *   node duo-mockup.cjs 'https://example.com'
 *   node duo-mockup.cjs 'https://example.com' --scroll '.pricing' --label 'Before' --out before.png
 *   node duo-mockup.cjs 'https://example.com' --width 890 --scroll 1800
 *
 * --scroll takes a CSS selector (scrolled to the middle of the screen) or a
 * pixel offset. Needs Node 22+ and Google Chrome; CHROME_PATH overrides. */

'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const argv = process.argv.slice(2);
const url = argv.find((a) => /^https?:\/\//.test(a));
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
if (!url) { console.error('Usage: node duo-mockup.cjs <url> [--scroll selector|px] [--width 951|890] [--label text] [--out file.png]'); process.exit(2); }
const W = Number(opt('--width', 951));
if (W !== 951 && W !== 890) { console.error('--width must be 951 or 890.'); process.exit(2); }
const H = W === 890 ? 626 : 669;
const scroll = opt('--scroll', null);
const label = opt('--label', '');
const out = path.resolve(String(opt('--out', 'duo-mockup.png') ?? ''));
if (path.extname(out).toLowerCase() !== '.png') { console.error('--out must be a file name that ends in .png.'); process.exit(2); }

const chromePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find((c) => fs.existsSync(c));
if (!chromePath) { console.error('Google Chrome not found. Set CHROME_PATH.'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The code that runs inside the page. Each piece is a fixed function: the
// --scroll value is never pasted into its text, it goes in as an argument.
const FN_SCROLL_Y = `function (y) { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, y); return true; }`;
const FN_SCROLL_TO = `function (selector) {
  document.documentElement.style.scrollBehavior = 'auto';
  const e = document.querySelector(selector);
  if (e) e.scrollIntoView({ block: 'center' });
  return !!e;
}`;
const FN_BOX = `function () {
  const r = document.querySelector('.fig').getBoundingClientRect();
  return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
}`;
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Until Chrome runs there is nothing to clean up; main() replaces this.
let finish = async (code) => process.exit(code);

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-mockup-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    // Keep Chrome's own traffic low: this run needs the given page and nothing else.
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--no-pings',
    '--disable-default-apps', '--disable-client-side-phishing-detection', '--disable-domain-reliability', '--disable-breakpad', '--metrics-recording-only',
    '--disable-features=OptimizationHints,OptimizationHintsFetching,OptimizationGuideModelDownloading,OptimizationTargetPrediction,MediaRouter,Translate',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  const chromeGone = new Promise((r) => chrome.once('exit', r));
  // Last resort, when the process ends without finish(): kill Chrome, give its
  // helper processes a moment to stop writing, then remove the profile folder.
  const done = () => {
    if (chrome.exitCode === null && chrome.signalCode === null) {
      try { chrome.kill('SIGKILL'); } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
    }
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  };
  process.on('exit', done);
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
  // browser endpoint, into the profile folder that only this user can read.
  let endpoint;
  for (let i = 0; i < 150 && !endpoint; i++) {
    try {
      const [p, wsPath] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
      if (/^\d+$/.test(p) && /^\/devtools\/browser\/[\w-]+$/.test(wsPath || '')) endpoint = `ws://127.0.0.1:${p}${wsPath}`;
    } catch {}
    if (!endpoint) await sleep(200);
  }
  if (!endpoint) { console.error('Chrome did not start.'); return finish(2); }
  const ws = new WebSocket(endpoint); let seq = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('Could not connect to Chrome.'))); });
  ws.addEventListener('close', () => { if (!closing) { console.error('Lost the connection to Chrome.'); finish(2); } });
  const send = (method, params = {}, sessionId) => new Promise((res) => { const id = ++seq; const t = setTimeout(() => { pend.delete(id); res({}); }, 30000); pend.set(id, (m) => { clearTimeout(t); res(m.result || {}); }); ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })); });
  // A page must not be able to save files on this computer.
  await send('Browser.setDownloadBehavior', { behavior: 'deny' });
  const open = async (w, h, dpr, mobile) => { const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }); const S = (m, p) => send(m, p, sessionId); await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile }); await S('Page.enable'); return { S, targetId }; };
  // Run one of the fixed functions above in an isolated world of the page.
  const call = async (S, fn, ...values) => {
    const frameId = (await S('Page.getFrameTree')).frameTree?.frame?.id;
    const world = frameId ? (await S('Page.createIsolatedWorld', { frameId, worldName: 'duo-mockup' })).executionContextId : 0;
    return world ? (await S('Runtime.callFunctionOn', { functionDeclaration: fn, executionContextId: world, arguments: values.map((value) => ({ value })), returnByValue: true })).result?.value : undefined;
  };

  // 1. Render the page as the opened device sees it.
  const page = await open(W, H, 2, true);
  await page.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.S('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
  const nav = await page.S('Page.navigate', { url });
  if (nav.errorText) { console.error(`Could not load the page: ${String(nav.errorText).slice(0, 80)}`); return finish(1); }
  await sleep(6500);
  if (scroll) {
    if (/^\d+$/.test(scroll)) await call(page.S, FN_SCROLL_Y, Number(scroll));
    else await call(page.S, FN_SCROLL_TO, scroll);
    await sleep(1400);
  }
  const shot = await page.S('Page.captureScreenshot', { format: 'png' });
  await send('Target.closeTarget', { targetId: page.targetId });
  if (!shot.data) { console.error('Could not capture the page.'); return finish(1); }
  const dataUri = `data:image/png;base64,${shot.data}`;

  // 2. Frame it: the screen at a fixed width, the crease shaded, the centre dashed.
  const SCREEN_W = 700, SCREEN_H = Math.round((SCREEN_W * H) / W);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;background:#f4f1ea}
.fig{display:inline-flex;flex-direction:column;align-items:center;gap:28px;padding:96px 90px 72px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#2f3b3d}
.device{position:relative;background:#1b2023;border-radius:40px;padding:15px;box-shadow:inset 0 0 0 1.5px #2c3336,0 34px 56px -24px rgba(27,32,35,.5)}
.screen{position:relative;width:${SCREEN_W}px;height:${SCREEN_H}px;border-radius:27px;overflow:hidden;background:#000}
.screen img{display:block;width:100%;height:100%;object-fit:cover}
.crease{position:absolute;top:0;bottom:0;left:50%;width:24px;transform:translateX(-50%);background:linear-gradient(90deg,transparent,rgba(0,0,0,.14) 42%,rgba(255,255,255,.12) 58%,transparent)}
.fold{position:absolute;top:-34px;bottom:-34px;left:50%;border-left:2.5px dashed #e8836b;transform:translateX(-1.25px)}
.tag{position:absolute;top:-42px;left:50%;transform:translate(-50%,-100%);font-size:14px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#e8836b;white-space:nowrap}
.label{font-size:17px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
</style></head><body><div class="fig"><div class="device"><div class="screen"><img src="${dataUri}"><div class="crease"></div></div><div class="fold"></div><div class="tag">Crease · ${W} × ${H}</div></div>${label ? `<div class="label">${escapeHtml(label)}</div>` : ''}</div></body></html>`;
  const tmp = path.join(profile, 'frame.html');
  fs.writeFileSync(tmp, html);
  const frame = await open(1400, 1000, 2, false);
  await frame.S('Page.navigate', { url: pathToFileURL(tmp).href });
  await sleep(1500);
  const box = await call(frame.S, FN_BOX);
  if (!box || !(box.w > 0) || !(box.h > 0)) { console.error('Could not draw the mockup.'); return finish(1); }
  await frame.S('Emulation.setDeviceMetricsOverride', { width: box.w, height: box.h, deviceScaleFactor: 2, mobile: false });
  await sleep(400);
  const png = await frame.S('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: box.w, height: box.h, scale: 1 } });
  if (!png.data) { console.error('Could not capture the mockup.'); return finish(1); }
  fs.writeFileSync(out, Buffer.from(png.data, 'base64'));
  console.log(`Mockup: ${out}`);
  return finish(0);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  return finish(1);
});
