// Takes the game's screenshots in desktop Chrome (Node 22+, standard library only): serves game/
// on a local port, starts headless Chrome with remote debugging, opens each scene listed in
// shots.json, waits for window.__shotReady, and saves a JPEG at 1280x720 into screenshots/.
// Console errors from the page are printed so a broken scene is caught here.
//
//   node shoot.ts                 every scene in shots.json
//   node shoot.ts chase           only scenes whose name contains "chase"
//   CHROME=/path/to/chrome node shoot.ts
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(join(here, 'game'));
const outDir = join(here, 'screenshots');
const filter = process.argv[2] ?? '';
const shots: { name: string; query: string; quality?: number }[] = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const WIDTH = 1280;
const HEIGHT = 720;

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = resolve(join(root, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
const port = (server.address() as { port: number }).port;

const chromePath = process.env.CHROME ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p));
if (!chromePath) throw new Error('Chrome not found: set CHROME');
const profile = join(tmpdir(), `palmera-shoot-${process.pid}`);
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${WIDTH},${HEIGHT}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl: string = await new Promise((ok, fail) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) ok(m[1]);
  });
  setTimeout(() => fail(new Error('Chrome did not start')), 20000);
});

const browser = new WebSocket(wsUrl);
await new Promise((ok) => browser.addEventListener('open', ok, { once: true }));
let nextId = 1;
const pending = new Map<number, (v: any) => void>();
const listeners: ((msg: any) => void)[] = [];
browser.addEventListener('message', (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!(msg);
    pending.delete(msg.id);
  } else for (const l of listeners) l(msg);
});
function send(method: string, params: object = {}, sessionId?: string): Promise<any> {
  const id = nextId++;
  browser.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((ok) => pending.set(id, ok));
}

mkdirSync(outDir, { recursive: true });
for (const s of shots) {
  if (filter && !s.name.includes(filter)) continue;
  const { result } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: att } = await send('Target.attachToTarget', { targetId: result.targetId, flatten: true });
  const sid = att.sessionId;
  const onMsg = (msg: any) => {
    if (msg.sessionId !== sid) return;
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) console.log(`  [${s.name}] console.${msg.params.type}:`, msg.params.args.map((a: any) => a.value ?? a.description).join(' '));
    if (msg.method === 'Runtime.exceptionThrown') console.log(`  [${s.name}] exception:`, msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  };
  listeners.push(onMsg);
  await send('Runtime.enable', {}, sid);
  await send('Page.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false }, sid);
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html${s.query}` }, sid);
  const started = Date.now();
  let ready = false;
  while (Date.now() - started < 90000) {
    const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true }, sid);
    if (r.result?.result?.value === true) {
      ready = true;
      break;
    }
    await new Promise((ok) => setTimeout(ok, 300));
  }
  if (!ready) console.log(`  [${s.name}] never became ready`);
  if (process.env.EVAL) {
    const r = await send('Runtime.evaluate', { expression: process.env.EVAL, returnByValue: true }, sid);
    console.log(`  [${s.name}] EVAL:`, JSON.stringify(r.result?.result?.value ?? r.result));
  }
  const shotRes = await send('Page.captureScreenshot', { format: 'jpeg', quality: s.quality ?? 86 }, sid);
  const bytes = Buffer.from(shotRes.result.data, 'base64');
  writeFileSync(join(outDir, s.name), bytes);
  console.log(`${s.name}: ${bytes.length} bytes in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await send('Target.closeTarget', { targetId: result.targetId });
}
browser.close();
chrome.kill();
server.close();
setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ } }, 500);
