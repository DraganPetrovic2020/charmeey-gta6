// Plays Palmera Heat in headless Chrome to catch broken paths before a person finds them
// (Node 22+, standard library only). Uses real keyboard and mouse events through the DevTools
// protocol for the basics (title menu, walking, stealing and driving a car, shooting), then
// drives the story through window.__game: every mission is started and its steps are completed,
// a five-star chase runs, and the player is wasted and busted. Prints a line per check and any
// page error; exits 1 if anything failed.
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
const chromePath = process.env.CHROME ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => existsSync(p))!;
const profile = join(tmpdir(), `palmera-play-${process.pid}`);
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
let id = 1;
const pending = new Map<number, (v: any) => void>();
const errors: string[] = [];
let sid = '';
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(String(e.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!(msg);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a: any) => a.value ?? a.description).join(' '));
});
const send = (method: string, params: object = {}): Promise<any> => {
  const n = id++;
  ws.send(JSON.stringify({ id: n, method, params, sessionId: sid || undefined }));
  return new Promise((ok) => pending.set(n, ok));
};
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
async function js(expression: string): Promise<any> {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(`${expression}: ${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
}
const KEYS: Record<string, number> = { KeyV: 86, KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, KeyF: 70, Space: 32, KeyE: 69, Escape: 27, Digit2: 50 };
async function key(code: string, type: 'keyDown' | 'keyUp') {
  await send('Input.dispatchKeyEvent', { type, code, key: code.replace(/^Key|^Digit/, '').toLowerCase(), windowsVirtualKeyCode: KEYS[code] });
}
/** Waits until the game clock has advanced by `seconds` (the software renderer is slow). */
async function waitGame(seconds: number) {
  const t0 = await js('__game.time');
  for (let i = 0; i < 600; i += 1) {
    await sleep(100);
    if ((await js('__game.time')) - t0 >= seconds) return;
  }
}
async function hold(code: string, seconds: number) {
  await key(code, 'keyDown');
  await waitGame(seconds);
  await key(code, 'keyUp');
}
async function tap(code: string) {
  await key(code, 'keyDown');
  await sleep(250);
  await key(code, 'keyUp');
  await sleep(250);
}

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

const { result: target } = await send('Target.createTarget', { url: 'about:blank' });
const { result: att } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
sid = att.sessionId;
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
await sleep(4000);

check('title screen shows', await js(`!document.getElementById('title-screen').classList.contains('hidden')`));
await js(`document.querySelector('#title-menu [data-action="new"]').click()`);
await sleep(800);
check('new game starts', await js(`!document.getElementById('hud').classList.contains('hidden')`));
await waitGame(0.5);
check('the opening scene plays', await js(`__game.missions.inCutscene`));
for (let i = 0; i < 6 && (await js(`__game.missions.inCutscene`)); i += 1) await tap('Space');
check('Space skips the scene', !(await js(`__game.missions.inCutscene`)));
check('first objective is to get a car', (await js(`document.getElementById('objective').textContent`)).includes('car'));
const start = await js(`({x: __game.player.actor.x, z: __game.player.actor.z})`);
await hold('KeyW', 1.5);
const walked = await js(`Math.hypot(__game.player.actor.x - ${start.x}, __game.player.actor.z - ${start.z})`);
check('W walks the player', walked > 2, `${walked.toFixed(1)} m`);

// Put a car beside Nico and steal it with F.
await js(`(() => { const g = __game; const a = g.player.actor; const c = g.map.places.busStation.curb; const v = g.vehicles.find(v => !v.spec.police && !v.dead); v.x = c.x; v.z = c.z; v.heading = c.heading; v.vx = v.vz = 0; a.x = c.x - Math.cos(c.heading) * 2.4; a.z = c.z + Math.sin(c.heading) * 2.4; return v.id; })()`);
await tap('KeyF');
await sleep(300);
check('F enters a car', await js(`!!__game.player.vehicle`));
await hold('KeyW', 2.5);
const speed = await js(`Math.abs(__game.player.vehicle?.speed ?? 0)`);
check('W drives the car', speed > 5, `${(speed * 3.6).toFixed(0)} km/h`);
await hold('KeyS', 3);
await tap('KeyF');
await sleep(300);
check('F gets out', await js(`!__game.player.vehicle`));

// Shoot a pistol in the street: heat should rise.
await js(`(() => { const p = __game.player; p.owned[1] = true; p.clip[1] = 14; p.ammo[1] = 50; p.current = 1; })()`);
for (let i = 0; i < 8; i += 1) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 });
  await sleep(90);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 });
  await sleep(200);
}
const heat = await js(`__game.police.wanted.heat`);
check('gunfire raises heat', heat > 0, `heat ${heat.toFixed(1)}`);

await js(`__game.police.setStars(5)`);
await js(`__game.player.actor.health = 100000`);
await waitGame(12);
const chase = await js(`({ cops: __game.vehicles.filter(v => v.police === 'chase').length, officers: __game.actors.filter(a => a.role === 'cop').length, heli: __game.police.heli.group.visible, health: __game.player.actor.health })`);
check('five stars bring cruisers', chase.cops >= 2, JSON.stringify(chase));
check('five stars bring the helicopter', chase.heli);
await js(`__game.player.actor.health = 100`);

await js(`(() => { const a = __game.player.actor; __game.player.vehicle = null; a.inVehicle = null; a.health = 1; a.armor = 0; })()`);
await js(`(() => { const g = __game; const a = g.player.actor; const m = g.combat; m.blast(a.x, a.z, 4, 300, null); })()`);
await waitGame(0.3);
check('player can be wasted', await js(`!!__game.death && __game.death.kind === 'wasted'`));
await waitGame(2.5);
check('respawn at hospital', await js(`!__game.death && !__game.player.actor.dead && __game.police.wanted.stars === 0`));

// Busted: one star and an officer right beside Nico.
await js(`(async () => { const g = __game; const a = g.player.actor; g.police.setStars(1); (await import('./src/characters.js')).spawnActor(g, 'cop', a.x + 0.9, a.z, { state: 'hunt', weapon: 1, persistent: true }); })()`);
for (let i = 0; i < 12 && !(await js(`!!__game.death`)); i += 1) await waitGame(0.5);
check('player can be busted', await js(`!!__game.death && __game.death.kind === 'busted'`));
await waitGame(2.5);

// Vigilante: steal a cruiser, press V, wreck the suspect.
await js(`(async () => { const g = __game; const a = g.player.actor; const { spawnVehicle } = await import('./src/vehicles.js'); const v = spawnVehicle(g, 'cruiser', a.x + 3, a.z, 0, { driver: null }); (await import('./src/player.js')).enterVehicle(g, v); })()`);
await tap('KeyV');
await waitGame(0.5);
check('V starts Vigilante in a cruiser', await js(`__game.activities.active`));
await js(`(async () => { const g = __game; const t = g.vehicles.find((v) => v.tag === 'suspect'); (await import('./src/vehicles.js')).explodeVehicle(g, t); })()`);
await waitGame(4);
check('wrecking the suspect clears a level', await js(`__game.activities.active && __game.vehicles.some((v) => v.tag === 'suspect' && !v.dead)`));
await js(`(async () => { (await import('./src/player.js')).exitVehicle(__game); })()`);
await waitGame(0.3);
check('leaving the cruiser ends Vigilante', !(await js(`__game.activities.active`)));

// The story: start every mission and push each step to done.
const story = await js(`(async () => {
  const g = __game;
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const log = [];
  for (let i = 0; i < 7; i += 1) {
    g.police.clear();
    g.progress.mission = i;
    g.missions.forceStart(i);
    let guard = 0;
    while (g.missions.active && guard < 40) {
      guard += 1;
      const st = g.missions.state;
      const step = st.step;
      const s = st.stepState;
      const p = g.player;
      const a = p.actor;
      const anyCar = () => g.vehicles.find((v) => !v.dead && !v.spec.police && v !== st.missionCar);
      if (st.cutscene) { g.missions.update(10, true); await wait(30); continue; }
      switch (step.type) {
        case 'getCar': { const v = anyCar(); v.x = a.x + 2; v.z = a.z; g.input.mouse.fire = false; (await import('./src/player.js')).enterVehicle(g, v); break; }
        case 'goto': { const t = s.at; const ent = p.vehicle ?? a; if (step.inVehicle && !p.vehicle) { const v = anyCar(); (await import('./src/player.js')).enterVehicle(g, v); } (p.vehicle ?? a).x = t.x; (p.vehicle ?? a).z = t.z; if (p.vehicle) { p.vehicle.vx = p.vehicle.vz = 0; p.vehicle.speed = 0; } a.x = t.x; a.z = t.z; void ent; break; }
        case 'wanted': g.police.clear(); break;
        case 'stealCar': (await import('./src/player.js')).enterVehicle(g, s.car); break;
        case 'deliverCar': { const c = st.missionCar; c.x = s.at.curb.x; c.z = s.at.curb.z; c.vx = c.vz = 0; c.speed = 0; break; }
        case 'chase': (await import('./src/vehicles.js')).explodeVehicle(g, s.van); break;
        case 'pickup': { const it = s.item; if (p.vehicle) (await import('./src/player.js')).exitVehicle(g); a.x = it.x; a.z = it.z; break; }
        case 'eliminate': for (const t of s.targets) if (!t.dead) (await import('./src/characters.js')).killActor(g, t, 'player', 0, 1); break;
        case 'race': { const [x, z] = step.checkpoints[s.i]; if (!p.vehicle) (await import('./src/player.js')).enterVehicle(g, anyCar()); p.vehicle.x = x; p.vehicle.z = z; a.x = x; a.z = z; break; }
        default: break;
      }
      await wait(250);
    }
    log.push([i, g.progress.mission, guard]);
    if (g.player.vehicle) (await import('./src/player.js')).exitVehicle(g);
    await wait(300);
  }
  return log;
})()`);
check('all seven missions can be passed', story.every(([i, m]: number[]) => m === i + 1), JSON.stringify(story));

// Save and load round trip.
await js(`__game.saveGame(false)`);
const saved = await js(`JSON.parse(localStorage.getItem('palmera-heat-save-v1')).progress.mission`);
check('save writes progress', saved === 7, `mission ${saved}`);
await js(`document.querySelector('#pause-menu [data-action="quit"]').click()`);
await sleep(600);
await js(`document.querySelector('#title-menu [data-action="continue"]').click()`);
await sleep(800);
check('continue loads the save', await js(`__game.progress.mission === 7 && !document.getElementById('hud').classList.contains('hidden')`));

// Let the city run on its own for a while: traffic, peds, police patrols.
await waitGame(10);
const crowd = await js(`({ cars: __game.vehicles.length, people: __game.actors.length })`);
check('streets are populated', crowd.cars > 10 && crowd.people > 15, JSON.stringify(crowd));
const fps = await js(`new Promise((ok) => { let n = 0; const t0 = performance.now(); const f = () => { n += 1; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else ok(n / 2); }; requestAnimationFrame(f); })`);
console.log(`     frames per second in software-rendered headless Chrome: ${fps}`);

for (const e of errors) console.log('page error:', e);
check('no page errors', errors.length === 0, `${errors.length}`);
ws.close();
chrome.kill();
server.close();
setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ } process.exit(failed ? 1 : 0); }, 300);
