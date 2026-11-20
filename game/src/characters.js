// People as things in the world: civilians, police officers, Sunset Syndicate gunmen and
// story characters. Spawning with a look per role, moving with collision, health and armour,
// getting hit by cars, dying, and keeping their models posed.
import { PLAYER } from './config.js';
import { buildPerson, posePerson, SKIN_TONES } from './models.js';
import { rand } from './rng.js';
import { vehicleCircles } from './vehicles.js';

const SHIRTS = [0xf4a261, 0x2a9d8f, 0xe76f51, 0xffffff, 0x8ecae6, 0xffb703, 0xcdb4db, 0x90be6d, 0xf28482, 0x6d6875, 0xe9edc9];
const PANTS = [0x264653, 0x3d405b, 0xd4c5a9, 0x6c757d, 0x1d3557, 0xa68a64, 0xf1faee];
const HAIR = [0x1b1b1b, 0x3b2a1a, 0x6f4e37, 0xc9a66b, 0x8b8b8b, 0x2b1d0e];

export function lookFor(role) {
  if (role === 'player') return { shirt: 0x1fb5a8, pattern: 'floral', sleeve: 0x1fb5a8, pants: 0xe8dcc0, skin: 0xc98f5e, hair: 0x1b1410, shoes: 0xf1f1f1, belt: 0x5a3b1e, extra: null };
  if (role === 'cop') return { shirt: 0x1d3a6e, longSleeve: true, pants: 0x14213d, skin: rand.pick(SKIN_TONES), hair: 0x1b1b1b, shoes: 0x111111, extra: 'cap' };
  if (role === 'gang' || role === 'boss') return { shirt: role === 'boss' ? 0xf8f8f8 : 0xff7b2e, pants: role === 'boss' ? 0xf8f8f8 : 0x22223b, skin: rand.pick(SKIN_TONES), hair: rand.pick(HAIR), shoes: 0x111111, extra: role === 'boss' ? 'shades' : 'bandana' };
  if (role === 'mari') return { shirt: 0xff5d8f, pants: 0x2b2d42, skin: 0xc68642, hair: 0x2b1d0e, shoes: 0xffffff, extra: null };
  if (role === 'teo') return { shirt: 0xffd166, pants: 0x3d405b, skin: 0xe0ac69, hair: 0x1b1b1b, shoes: 0xef476f, extra: 'shades' };
  if (role === 'ines') return { shirt: 0x8ecae6, pants: 0x023047, skin: 0xffdbac, hair: 0xc9a66b, shoes: 0x111111, extra: 'shades' };
  return { shirt: rand.pick(SHIRTS), pants: rand.pick(PANTS), skin: rand.pick(SKIN_TONES), hair: rand.pick(HAIR), shoes: rand.pick([0x222222, 0xffffff, 0x8d6e63]), extra: rand.chance(0.2) ? 'shades' : null };
}

let nextId = 1;

export function spawnActor(game, role, x, z, options = {}) {
  const model = buildPerson(options.look ?? lookFor(role));
  game.scene.add(model.group);
  const a = {
    id: nextId++,
    kind: 'actor',
    role,
    model,
    x, z,
    y: 0,
    vy: 0,
    heading: options.heading ?? rand.next() * Math.PI * 2,
    vx: 0,
    vz: 0,
    health: options.health ?? (role === 'boss' ? 400 : role === 'cop' ? 110 : role === 'gang' ? 90 : 60),
    armor: 0,
    dead: false,
    deadTime: 0,
    weapon: options.weapon ?? 0,
    ammo: Infinity,
    cooldown: rand.next(),
    phase: rand.next() * 6,
    moveSpeed: 0,
    aiming: false,
    punch: 0,
    state: options.state ?? 'walk',
    target: null,
    persistent: !!options.persistent,
    tag: options.tag ?? null,
    brain: {},
    radius: PLAYER.radius,
  };
  if (a.weapon > 0) model.gun.visible = true;
  game.actors.push(a);
  syncActorMesh(a, 0);
  return a;
}

export function removeActor(game, a) {
  game.scene.remove(a.model.group);
  const index = game.actors.indexOf(a);
  if (index >= 0) game.actors.splice(index, 1);
  a.removed = true;
}

/** Hurts an actor (armour first). `source` is 'player' or an actor; dir pushes the body. */
export function damageActor(game, a, amount, source, dirX = 0, dirZ = 0) {
  if (a.dead) return;
  if (a.armor > 0) {
    const soak = Math.min(a.armor, amount * 0.7);
    a.armor -= soak;
    amount -= soak;
  }
  a.health -= amount;
  a.hurtTime = 0.25;
  game.effects.blood(a.x, 1.2, a.z, dirX, dirZ);
  if (source === 'player' && a !== game.player.actor) {
    if (a.role === 'cop') game.crime('damageCop', a.x, a.z);
    a.brain.provoked = true;
  }
  if (a.health <= 0) killActor(game, a, source, dirX, dirZ);
  else game.events.emit('actorHurt', { actor: a, source });
}

export function killActor(game, a, source, dirX = 0, dirZ = 0) {
  if (a.dead) return;
  a.dead = true;
  a.health = 0;
  a.deadTime = 0;
  a.vx = dirX * 4;
  a.vz = dirZ * 4;
  a.model.gun.visible = false;
  if (Math.abs(dirX) + Math.abs(dirZ) > 0) a.heading = Math.atan2(-dirX, -dirZ);
  game.events.emit('actorKilled', { actor: a, source });
}

/** Moves an actor toward its wanted velocity, with collision against the city. */
export function moveActor(game, a, wantX, wantZ, dt, accel = 14) {
  const k = Math.min(1, accel * dt);
  a.vx += (wantX - a.vx) * k;
  a.vz += (wantZ - a.vz) * k;
  let x = a.x + a.vx * dt;
  let z = a.z + a.vz * dt;
  const res = game.collision.resolveCircle(x, z, a.radius);
  x = res.x;
  z = res.z;
  // Step around vehicles rather than through them.
  for (const v of game.vehicles) {
    if (Math.abs(v.x - x) > 5 || Math.abs(v.z - z) > 5) continue;
    for (const c of vehicleCircles(v)) {
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + a.radius;
      if (d < min && d > 1e-4) {
        x += (dx / d) * (min - d);
        z += (dz / d) * (min - d);
      }
    }
  }
  a.moveSpeed = Math.hypot(x - a.x, z - a.z) / Math.max(dt, 1e-4);
  a.x = x;
  a.z = z;
  return res.hit;
}

/** Turns an actor smoothly to face a heading. */
export function faceToward(a, heading, dt, rate = 10) {
  let d = heading - a.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  a.heading += d * Math.min(1, rate * dt);
}

/** Cars moving fast enough knock people over; returns nothing, raises events and crimes. */
export function checkVehicleHits(game) {
  for (const v of game.vehicles) {
    const speed = Math.hypot(v.vx, v.vz);
    if (speed < 3.5) continue;
    for (const a of game.actors) {
      if (a.dead || a.inVehicle) continue;
      if (Math.abs(a.x - v.x) > 4 || Math.abs(a.z - v.z) > 4) continue;
      for (const c of vehicleCircles(v)) {
        if (Math.hypot(a.x - c.x, a.z - c.z) < c.r + a.radius + 0.1) {
          const dmg = speed * speed * 0.9;
          const nx = v.vx / speed;
          const nz = v.vz / speed;
          const source = v.driver === 'player' ? 'player' : null;
          if (source === 'player') game.crime('hitPed', a.x, a.z);
          damageActor(game, a, dmg, source, nx, nz);
          a.vx = v.vx * 0.8;
          a.vz = v.vz * 0.8;
          a.vy = Math.min(8, speed * 0.35);
          game.audio.thud(a.x, a.z);
          v.vx *= 0.92;
          v.vz *= 0.92;
          break;
        }
      }
    }
  }
}

export function syncActorMesh(a, dt) {
  const g = a.model.group;
  g.position.set(a.x, a.y, a.z);
  g.rotation.y = a.heading;
  const stride = Math.min(1, a.moveSpeed / 5);
  a.phase += dt * (3 + a.moveSpeed * 1.5);
  if (a.punch > 0) a.punch = Math.max(0, a.punch - dt * 4);
  posePerson(a.model, a.phase, stride, a.aiming && !a.dead, a.dead, a.punch);
}

/** Bodies slide to a stop and fall; living people get gravity after being thrown. */
export function updateActorBodies(game, dt) {
  for (const a of game.actors) {
    if (a.inVehicle) {
      a.model.group.visible = false;
      continue;
    }
    a.model.group.visible = !a.hidden;
    if (a.y > 0 || a.vy > 0) {
      a.vy -= PLAYER.gravity * dt;
      a.y = Math.max(0, a.y + a.vy * dt);
      if (a.y === 0) a.vy = 0;
    }
    if (a.dead) {
      a.deadTime += dt;
      a.vx *= Math.exp(-4 * dt);
      a.vz *= Math.exp(-4 * dt);
      const res = game.collision.resolveCircle(a.x + a.vx * dt, a.z + a.vz * dt, a.radius);
      a.x = res.x;
      a.z = res.z;
      a.moveSpeed = 0;
    }
    if (a.hurtTime > 0) a.hurtTime -= dt;
    syncActorMesh(a, dt);
  }
}
