// Traffic: cars that drive the road grid in the right-hand lane, pick a turn at each
// intersection, brake for whatever is ahead (honking, then overtaking), and parked cars along
// the curbs. Also the shared driving helpers police and mission cars use: steering toward a
// point, getting unstuck, and shortest routes over the grid.
import { CITY, POPULATION, TRAFFIC_MODELS } from './config.js';
import { nearestNode, nodeCoord } from './citymap.js';
import { rand } from './rng.js';
import { removeVehicle, spawnVehicle } from './vehicles.js';

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const N = CITY.blocks;
const inGrid = (i, j) => i >= 0 && j >= 0 && i <= N && j <= N;

export function neighbours(i, j) {
  const out = [];
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inGrid(i + di, j + dj)) out.push({ i: i + di, j: j + dj });
  return out;
}

/** Shortest route of intersections from one to another (breadth-first over the grid). */
export function routeBetween(from, to) {
  const key = (n) => n.i * 100 + n.j;
  const prev = new Map([[key(from), null]]);
  const queue = [from];
  while (queue.length) {
    const n = queue.shift();
    if (n.i === to.i && n.j === to.j) break;
    for (const m of neighbours(n.i, n.j)) {
      if (prev.has(key(m))) continue;
      prev.set(key(m), n);
      queue.push(m);
    }
  }
  const path = [];
  let n = to;
  while (n && prev.has(key(n))) {
    path.unshift(n);
    n = prev.get(key(n));
  }
  return path;
}

/** A point in the right-hand lane of the road from node a to node b, `t` of the way along. */
export function lanePoint(a, b, t, offset = CITY.lane) {
  const ax = nodeCoord(a.i);
  const az = nodeCoord(a.j);
  const bx = nodeCoord(b.i);
  const bz = nodeCoord(b.j);
  const len = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / len;
  const dz = (bz - az) / len;
  return { x: ax + (bx - ax) * t - dz * offset, z: az + (bz - az) * t + dx * offset, heading: Math.atan2(dx, dz) };
}

/** Sets a car's controls to drive toward (tx, tz) at about `speed`. */
export function steerToward(v, tx, tz, speed, dt) {
  const c = v.controls;
  const ai = v.ai ?? (v.ai = {});
  const desired = Math.atan2(tx - v.x, tz - v.z);
  const diff = wrapAngle(desired - v.heading);
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    c.throttle = 0;
    c.brake = 1;
    c.steer = -Math.sign(diff || 1);
    c.handbrake = 0;
    return;
  }
  c.steer = Math.max(-1, Math.min(1, diff * 2.4));
  const wanted = speed * (Math.abs(diff) > 0.6 ? 0.4 : Math.abs(diff) > 0.25 ? 0.7 : 1);
  if (v.speed < wanted - 0.5) {
    c.throttle = 1;
    c.brake = 0;
  } else if (v.speed > wanted + 2) {
    c.throttle = 0;
    c.brake = 0.7;
  } else {
    c.throttle = 0.25;
    c.brake = 0;
  }
  c.handbrake = 0;
  // Stuck against something while trying to go: back up and turn.
  if (c.throttle > 0.5 && Math.abs(v.speed) < 0.8) {
    ai.stuck = (ai.stuck ?? 0) + dt;
    if (ai.stuck > 1.4) {
      ai.reverse = 1.1;
      ai.stuck = 0;
    }
  } else ai.stuck = 0;
}

/** True when something (a car or a person) is in the way just ahead of the car. */
function obstacleAhead(game, v, ignore) {
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  const look = 5 + Math.max(0, v.speed) * 1.1;
  for (const o of game.vehicles) {
    if (o === v || o === ignore) continue;
    const dx = o.x - v.x;
    const dz = o.z - v.z;
    const ahead = dx * fx + dz * fz;
    if (ahead < 0 || ahead > look) continue;
    const side = Math.abs(-dx * fz + dz * fx);
    if (side < 2.3) return o;
  }
  for (const a of game.actors) {
    if (a.dead || a.inVehicle) continue;
    const dx = a.x - v.x;
    const dz = a.z - v.z;
    const ahead = dx * fx + dz * fz;
    if (ahead < 0 || ahead > look * 0.8) continue;
    if (Math.abs(-dx * fz + dz * fx) < 1.8) return a;
  }
  return null;
}

/** Starts an AI car on the road from node a toward node b. */
export function startCruising(v, a, b) {
  v.ai = { from: a, to: b, phase: 'approach', cruise: rand.range(10, 15), blocked: 0, overtake: 0, honk: 0 };
}

function pickNext(from, to) {
  const options = neighbours(to.i, to.j).filter((n) => n.i !== from.i || n.j !== from.j);
  return options.length ? rand.pick(options) : from;
}

export function driveTraffic(game, v, dt) {
  const ai = v.ai;
  if (!ai || !ai.to) return;
  const approach = lanePoint(ai.from, ai.to, 1 - (CITY.road / 2 + 3) / CITY.pitch, ai.overtake > 0 ? -CITY.lane : CITY.lane);
  let target = approach;
  if (ai.phase === 'exit') {
    target = lanePoint(ai.from, ai.to, (CITY.road / 2 + 4) / CITY.pitch, CITY.lane);
    if (Math.hypot(target.x - v.x, target.z - v.z) < 4) ai.phase = 'approach';
  } else if (Math.hypot(approach.x - v.x, approach.z - v.z) < 4.5) {
    const next = pickNext(ai.from, ai.to);
    ai.from = ai.to;
    ai.to = next;
    ai.phase = 'exit';
  }
  let speed = ai.cruise;
  const blocker = ai.overtake > 0 ? null : obstacleAhead(game, v, null);
  if (ai.overtake > 0) ai.overtake -= dt;
  if (blocker) {
    speed = 0;
    ai.blocked += dt;
    if (ai.blocked > 1.5 && ai.honk <= 0 && blocker.kind === 'vehicle' && blocker.driver === 'player') {
      game.audio.horn();
      ai.honk = 4;
    }
    if (ai.blocked > 3.5 && (blocker.kind === 'vehicle' && (blocker.driver !== 'ai' || blocker.dead))) {
      ai.overtake = 3;
      ai.blocked = 0;
    }
  } else ai.blocked = 0;
  ai.honk -= dt;
  if (ai.panic > 0) {
    ai.panic -= dt;
    speed = ai.cruise * 1.8;
  }
  if (speed === 0) {
    v.controls.throttle = 0;
    v.controls.brake = 1;
    v.controls.steer = 0;
    return;
  }
  steerToward(v, target.x, target.z, speed, dt);
}

function spawnPointNear(game, minDist, maxDist) {
  const p = game.player.actor;
  for (let tries = 0; tries < 20; tries += 1) {
    const a = { i: rand.int(0, N), j: rand.int(0, N) };
    const nbrs = neighbours(a.i, a.j);
    const b = rand.pick(nbrs);
    const pt = lanePoint(a, b, rand.range(0.25, 0.7));
    const d = Math.hypot(pt.x - p.x, pt.z - p.z);
    if (d < minDist || d > maxDist) continue;
    if (game.vehicles.some((v) => Math.hypot(v.x - pt.x, v.z - pt.z) < 12)) continue;
    return { a, b, pt };
  }
  return null;
}

/** Spawns a moving car on a random road between the near and far rings around the player. */
export function spawnTrafficCar(game, minDist = POPULATION.spawnNear, maxDist = POPULATION.spawnFar, modelId = null) {
  const spot = spawnPointNear(game, minDist, maxDist);
  if (!spot) return null;
  const v = spawnVehicle(game, modelId ?? rand.pick(TRAFFIC_MODELS), spot.pt.x, spot.pt.z, spot.pt.heading, { driver: 'ai' });
  startCruising(v, spot.a, spot.b);
  const f = v.ai.cruise * 0.7;
  v.vx = Math.sin(v.heading) * f;
  v.vz = Math.cos(v.heading) * f;
  return v;
}

function spawnParkedCar(game) {
  const p = game.player.actor;
  const near = nearestNode(p.x, p.z);
  const i = Math.max(0, Math.min(N - 1, near.i + rand.int(-2, 1)));
  const j = Math.max(0, Math.min(N - 1, near.j + rand.int(-2, 1)));
  const b = { i: rand.chance(0.5) ? i + 1 : i, j: rand.chance(0.5) ? j : j + 1 };
  const a = { i, j };
  if (a.i === b.i && a.j === b.j) b.i = Math.min(N, a.i + 1);
  const pt = lanePoint(a, b, rand.range(0.3, 0.7), CITY.road / 2 - 1.4);
  const d = Math.hypot(pt.x - p.x, pt.z - p.z);
  if (d < 25 || d > 160) return;
  if (game.vehicles.some((v) => Math.hypot(v.x - pt.x, v.z - pt.z) < 8)) return;
  const v = spawnVehicle(game, rand.pick(TRAFFIC_MODELS), pt.x, pt.z, pt.heading, { driver: null });
  v.parked = true;
  v.controls.handbrake = 1;
}

/** Keeps the street busy around the player and clears what is far away. */
export function updateTraffic(game, dt) {
  const p = game.player.actor;
  let moving = 0;
  let parked = 0;
  for (const v of [...game.vehicles]) {
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    if (!v.persistent && d > POPULATION.despawn && v !== game.player.vehicle) {
      removeVehicle(game, v);
      continue;
    }
    if (v.dead && v.deadTime > 40 && d > 60 && !v.persistent) {
      removeVehicle(game, v);
      continue;
    }
    if (v.driver === 'ai') {
      moving += 1;
      if (!v.dead && v.burn <= 0) driveTraffic(game, v, dt);
      else v.driver = null;
    }
    if (v.parked) parked += 1;
  }
  if (moving < game.trafficTarget && rand.chance(dt * 6)) spawnTrafficCar(game);
  if (parked < 10 && rand.chance(dt * 2)) spawnParkedCar(game);
}

/** Tells nearby drivers to floor it (gunfire, explosions). */
export function panicTraffic(game, x, z, radius) {
  for (const v of game.vehicles) {
    if (v.driver === 'ai' && v.ai && Math.hypot(v.x - x, v.z - z) < radius) v.ai.panic = 6;
  }
}
