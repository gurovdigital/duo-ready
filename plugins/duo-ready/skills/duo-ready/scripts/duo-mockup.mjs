#!/usr/bin/env node
/* duo-mockup - put any page on an opened foldable, crease drawn in.
 *
 * Renders a URL at the opened iPhone Duo size with touch input emulated,
 * then places the render in a device frame with the crease and a dashed
 * centre line - the picture that makes a fold problem obvious to a client.
 *
 * Usage:
 *   node duo-mockup.mjs https://example.com
 *   node duo-mockup.mjs https://example.com --scroll ".pricing" --label "Before" --out before.png
 *   node duo-mockup.mjs https://example.com --width 890 --scroll 1800
 *
 * --scroll takes a CSS selector (scrolled to the middle of the screen) or a
 * pixel offset. Needs Node 22+ and Google Chrome; CHROME_PATH overrides. */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const url = argv.find((a) => /^https?:\/\//.test(a));
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
if (!url) { console.error('Usage: node duo-mockup.mjs <url> [--scroll selector|px] [--width 951|890] [--label text] [--out file.png]'); process.exit(2); }
const W = Number(opt('--width', 951));
const H = W === 890 ? 626 : 669;
const scroll = opt('--scroll', null);
const label = opt('--label', '');
const out = path.resolve(opt('--out', 'duo-mockup.png'));

const chromePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean).find((c) => fs.existsSync(c));
if (!chromePath) { console.error('Google Chrome not found. Set CHROME_PATH.'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const port = 9222 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'duo-mockup-'));
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--remote-allow-origins=*', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const done = () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', done);

let v; for (let i = 0; i < 150 && !v; i++) { try { v = await getJSON(`http://127.0.0.1:${port}/json/version`); } catch { await sleep(200); } }
if (!v) { console.error('Chrome did not start.'); process.exit(2); }
const ws = new WebSocket(v.webSocketDebuggerUrl); let seq = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}, sessionId) => new Promise((res) => { const id = ++seq; const t = setTimeout(() => { pend.delete(id); res({}); }, 30000); pend.set(id, (m) => { clearTimeout(t); res(m.result || {}); }); ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })); });
const open = async (w, h, dpr, mobile) => { const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }); const S = (m, p) => send(m, p, sessionId); await S('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile }); await S('Page.enable'); return { S, targetId }; };

// 1. Render the page as the opened device sees it.
const page = await open(W, H, 2, true);
await page.S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await page.S('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
await page.S('Page.navigate', { url });
await sleep(6500);
if (scroll) {
  const expr = /^\d+$/.test(scroll)
    ? `(()=>{document.documentElement.style.scrollBehavior='auto';scrollTo(0,${scroll});return 1})()`
    : `(()=>{document.documentElement.style.scrollBehavior='auto';const e=document.querySelector(${JSON.stringify(scroll)});if(e)e.scrollIntoView({block:'center'});return !!e})()`;
  await page.S('Runtime.evaluate', { expression: expr, returnByValue: true });
  await sleep(1400);
}
const shot = await page.S('Page.captureScreenshot', { format: 'png' });
await send('Target.closeTarget', { targetId: page.targetId });
if (!shot.data) { console.error('Could not capture the page.'); process.exit(1); }
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
</style></head><body><div class="fig"><div class="device"><div class="screen"><img src="${dataUri}"><div class="crease"></div></div><div class="fold"></div><div class="tag">Crease · ${W} × ${H}</div></div>${label ? `<div class="label">${label.replace(/</g, '&lt;')}</div>` : ''}</div></body></html>`;
const tmp = path.join(profile, 'frame.html');
fs.writeFileSync(tmp, html);
const frame = await open(1400, 1000, 2, false);
await frame.S('Page.navigate', { url: 'file://' + tmp });
await sleep(1500);
const box = JSON.parse((await frame.S('Runtime.evaluate', { expression: `JSON.stringify((r=>({w:Math.ceil(r.width),h:Math.ceil(r.height)}))(document.querySelector('.fig').getBoundingClientRect()))`, returnByValue: true })).result.value);
await frame.S('Emulation.setDeviceMetricsOverride', { width: box.w, height: box.h, deviceScaleFactor: 2, mobile: false });
await sleep(400);
const png = await frame.S('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: box.w, height: box.h, scale: 1 } });
fs.writeFileSync(out, Buffer.from(png.data, 'base64'));
console.log(`Mockup: ${out}`);
done();
process.exit(0);
