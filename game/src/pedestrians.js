// Civilians on the sidewalks: they stroll around their block, stop to chat, scatter from
// gunfire, explosions and speeding cars, sometimes swing back when punched, and are spawned and
// cleared in a ring around the player so the streets always look lived in.
import { CITY, POPULATION } from './config.js';
import { faceToward, moveActor, removeActor, spawnActor } from './characters.js';
import { rand } from './rng.js';

function ringCorners(block) {
  const inset = CITY.sidewalk / 2;
  return [
    { x: block.x0 + inset, z: block.z0 + inset },
    { x: block.x1 - inset, z: block.z0 + inset },
    { x: block.x1 - inset, z: block.z1 - inset },
    { x: block.x0 + inset, z: block.z1 - inset },
  ];
}

function blockNear(game, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const b of game.map.walkAreas) {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const d = Math.hypot(cx - x, cz - z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function assignStroll(a, block) {
  const corners = ringCorners(block);
  let nearest = 0;
  let bestD = Infinity;
  corners.forEach((c, i) => {
    const d = Math.hypot(c.x - a.x, c.z - a.z);
    if (d < bestD) {
      bestD = d;
      nearest = i;
    }
  });
  a.brain.block = block;
  a.brain.corner = nearest;
  a.brain.dir = rand.chance(0.5) ? 1 : -1;
  a.brain.walkSpeed = rand.range(1.2, 1.8);
  a.state = 'walk';
}

export function spawnPedestrian(game, minDist = 22, maxDist = POPULATION.spawnFar * 0.8) {
  const p = game.player.actor;
  for (let tries = 0; tries < 12; tries += 1) {
    const block = rand.pick(game.map.walkAreas);
    const corners = ringCorners(block);
    const k = rand.int(0, 3);
    const c0 = corners[k];
    const c1 = corners[(k + 1) % 4];
    const t = rand.next();
    const x = c0.x + (c1.x - c0.x) * t;
    const z = c0.z + (c1.z - c0.z) * t;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < minDist || d > maxDist) continue;
    if (!game.collision.isFree(x, z, 0.5)) continue;
    const a = spawnActor(game, 'civilian', x, z);
    assignStroll(a, block);
    a.brain.brave = rand.chance(0.15);
    return a;
  }
  return null;
}

function fleeFrom(a, x, z, time) {
  if (a.dead || a.role !== 'civilian') return;
  a.state = 'flee';
  a.brain.fleeFrom = { x, z };
  a.brain.fleeTime = time;
}

export function createPedestrians(game) {
  game.events.on('gunfire', ({ x, z, radius }) => {
    for (const a of game.actors) {
      if (a.role === 'civilian' && Math.hypot(a.x - x, a.z - z) < radius) fleeFrom(a, x, z, rand.range(6, 10));
    }
  });
  game.events.on('vehicleExploded', (v) => {
    for (const a of game.actors) if (Math.hypot(a.x - v.x, a.z - v.z) < 40) fleeFrom(a, v.x, v.z, 8);
  });
  game.events.on('actorHurt', ({ actor, source }) => {
    if (actor.role !== 'civilian') return;
    if (source === 'player' && actor.brain.brave && game.player.current === 0) {
      actor.state = 'fight';
      return;
    }
    const s = source === 'player' ? game.player.actor : source;
    fleeFrom(actor, s?.x ?? actor.x, s?.z ?? actor.z, 10);
  });
  game.events.on('actorKilled', ({ actor }) => {
    for (const a of game.actors) if (a !== actor && Math.hypot(a.x - actor.x, a.z - actor.z) < 25) fleeFrom(a, actor.x, actor.z, 9);
  });

  function update(dt) {
    const p = game.player.actor;
    let count = 0;
    for (const a of [...game.actors]) {
      if (a.role !== 'civilian') continue;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (!a.persistent && (d > POPULATION.despawn * 0.75 || (a.dead && a.deadTime > 25 && d > 40))) {
        removeActor(game, a);
        continue;
      }
      count += 1;
      if (a.dead) continue;
      think(a, dt);
    }
    if (count < game.pedTarget && rand.chance(dt * 10)) spawnPedestrian(game);
  }

  function think(a, dt) {
    const b = a.brain;
    if (a.state === 'flee') {
      b.fleeTime -= dt;
      const dx = a.x - b.fleeFrom.x;
      const dz = a.z - b.fleeFrom.z;
      const len = Math.hypot(dx, dz) || 1;
      // Run away, bending sideways when a wall is in the way.
      const wobble = Math.sin(a.phase * 0.3 + a.id) * 0.5;
      const vx = (dx / len) * Math.cos(wobble) - (dz / len) * Math.sin(wobble);
      const vz = (dz / len) * Math.cos(wobble) + (dx / len) * Math.sin(wobble);
      const hit = moveActor(game, a, vx * 6.2, vz * 6.2, dt);
      if (hit) b.fleeFrom = { x: a.x - vz * 3, z: a.z + vx * 3 };
      faceToward(a, Math.atan2(a.vx, a.vz), dt, 12);
      if (b.fleeTime <= 0) assignStroll(a, blockNear(game, a.x, a.z));
      return;
    }
    if (a.state === 'fight') {
      const p = game.player.actor;
      const dx = p.x - a.x;
      const dz = p.z - a.z;
      const d = Math.hypot(dx, dz);
      faceToward(a, Math.atan2(dx, dz), dt, 10);
      if (d > 1.4) moveActor(game, a, (dx / d) * 5, (dz / d) * 5, dt);
      else {
        moveActor(game, a, 0, 0, dt);
        a.cooldown -= dt;
        if (a.cooldown <= 0) {
          a.cooldown = 0.9;
          game.combat.punch(a);
        }
      }
      if (d > 30 || p.inVehicle || p.dead) assignStroll(a, blockNear(game, a.x, a.z));
      return;
    }
    if (a.state === 'idle') {
      b.idle -= dt;
      moveActor(game, a, 0, 0, dt);
      if (b.idle <= 0) a.state = 'walk';
      return;
    }
    // Strolling the block.
    if (!b.block) assignStroll(a, blockNear(game, a.x, a.z));
    const corners = ringCorners(b.block);
    const target = corners[b.corner];
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) {
      b.corner = (b.corner + b.dir + 4) % 4;
      if (rand.chance(0.15)) {
        a.state = 'idle';
        b.idle = rand.range(2, 6);
      }
      return;
    }
    const s = b.walkSpeed;
    moveActor(game, a, (dx / d) * s, (dz / d) * s, dt, 6);
    faceToward(a, Math.atan2(dx, dz), dt, 6);
    // Speeding cars coming straight at them make them jump aside.
    for (const v of game.vehicles) {
      const sp = Math.hypot(v.vx, v.vz);
      if (sp < 12) continue;
      const rx = a.x - v.x;
      const rz = a.z - v.z;
      const dist = Math.hypot(rx, rz);
      if (dist < 14 && (rx * v.vx + rz * v.vz) / (dist * sp) > 0.85) fleeFrom(a, v.x, v.z, 3);
    }
  }

  return { update, fleeFrom };
}
