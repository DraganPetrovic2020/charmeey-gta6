// Runs the city on its own for a few in-game minutes without drawing (Node 22+, standard library
// only, headless Chrome), then reports how traffic and crowds are doing: wrecks, cars stuck in
// place, pile-ups, people count and frame cost. Used to tune traffic so the streets stay calm
// unless the player starts something.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(join(here, 'game'));
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = resolve(join(root, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
const port = (server.address() as { port: number }).port;
const chromePath = process.env.CHROME ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => existsSync(p))!;
const profile = join(tmpdir(), `palmera-soak-${process.pid}`);
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl: string = await new Promise((ok) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d.toString();
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) ok(m[1]);
  });
});
const ws = new WebSocket(wsUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
let n = 1;
let sid = '';
const pending = new Map<number, (v: any) => void>();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg);
  if (msg.method === 'Runtime.exceptionThrown') console.log('page error:', msg.params.exceptionDetails.exception?.description);
});
const send = (method: string, params: object = {}): Promise<any> => {
  const id = n++;
  ws.send(JSON.stringify({ id, method, params, sessionId: sid || undefined }));
  return new Promise((ok) => pending.set(id, ok));
};
const { result: t } = await send('Target.createTarget', { url: 'about:blank' });
sid = (await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })).result.sessionId;
await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html?seed=9` });
await new Promise((ok) => setTimeout(ok, 4000));

const minutes = Number(process.argv[2] ?? 3);
const report = await send('Runtime.evaluate', {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const g = __game;
    g.newGame();
    g.missions.reset();
    const a = g.player.actor;
    a.x = 448; a.z = 360;
    const out = [];
    const t0 = performance.now();
    for (let minute = 0; minute < ${minutes}; minute += 1) {
      let stuck = 0;
      for (let i = 0; i < 3600; i += 1) {
        // Wander the player around downtown so traffic keeps spawning and clearing.
        a.x = 448 + Math.sin((minute * 3600 + i) / 2000) * 150;
        a.z = 448 + Math.cos((minute * 3600 + i) / 2600) * 150;
        g.step(1 / 60, false);
      }
      const ai = g.vehicles.filter((v) => v.driver === 'ai');
      for (const v of ai) if (Math.abs(v.speed) < 0.5) stuck += 1;
      out.push({ minute: minute + 1, cars: g.vehicles.length, ai: ai.length, stuck, burning: g.vehicles.filter((v) => v.burn > 0).length, wrecks: g.vehicles.filter((v) => v.dead).length, people: g.actors.length, dead: g.actors.filter((x) => x.dead).length, stars: g.police.wanted.stars });
    }
    out.push({ msPerStep: ((performance.now() - t0) / (${minutes} * 3600)).toFixed(2) });
    return out;
  })()`,
});
for (const row of report.result?.result?.value ?? [report.result]) console.log(JSON.stringify(row));
ws.close();
chrome.kill();
server.close();
setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ } process.exit(0); }, 300);
