// Combat: the player's fists and guns (hitscan with spread, soft lock-on while aiming, tracers
// and muzzle flash), gunfire from police and gang members aimed at the player, explosions that
// hurt everyone nearby, and who is hit by what (people, cars or walls).
import * as THREE from '../vendor/three.min.js';
import { CRIME, WEAPONS } from './config.js';
import { damageActor } from './characters.js';
import { damageVehicle, vehicleCircles } from './vehicles.js';
import { rand } from './rng.js';
import { startReload } from './player.js';

const ACTOR_RADIUS = 0.42;

function rayCircle(ox, oz, dx, dz, cx, cz, r) {
  const fx = ox - cx;
  const fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return Infinity;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  const t1 = (-b + s) / (2 * a);
  if (t0 >= 0) return t0;
  if (t1 >= 0) return 0;
  return Infinity;
}

/** The first thing a ray meets: { t, actor | vehicle | null }. */
export function traceShot(game, o, d, range, ignoreActor, ignoreVehicle) {
  let best = { t: game.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range), actor: null, vehicle: null };
  for (const a of game.actors) {
    if (a === ignoreActor || a.dead || a.inVehicle) continue;
    if (Math.abs(a.x - o.x) > range + 2 || Math.abs(a.z - o.z) > range + 2) continue;
    const t = rayCircle(o.x, o.z, d.x, d.z, a.x, a.z, ACTOR_RADIUS);
    if (t < best.t) {
      const y = o.y + d.y * t;
      if (y >= a.y - 0.1 && y <= a.y + 1.95) best = { t, actor: a, vehicle: null };
    }
  }
  for (const v of game.vehicles) {
    if (v === ignoreVehicle) continue;
    if (Math.abs(v.x - o.x) > range + 4 || Math.abs(v.z - o.z) > range + 4) continue;
    for (const c of vehicleCircles(v)) {
      const t = rayCircle(o.x, o.z, d.x, d.z, c.x, c.z, c.r);
      if (t < best.t) {
        const y = o.y + d.y * t;
        if (y >= 0 && y <= v.spec.height + 0.1) best = { t, actor: null, vehicle: v };
      }
    }
  }
  return best;
}

export function createCombat(game) {
  const state = { cooldown: 0, aimTarget: null, lastShot: -10 };
  const tmpDir = new THREE.Vector3();

  function handPosition(a) {
    const fx = Math.sin(a.heading);
    const fz = Math.cos(a.heading);
    return { x: a.x + fx * 0.6 - fz * 0.34, y: a.y + 1.4, z: a.z + fz * 0.6 + fx * 0.34 };
  }

  function alertNearby(x, z, radius) {
    game.events.emit('gunfire', { x, z, radius });
    game.crime('shootNear', x, z);
  }

  /** Picks the lock-on target: the living person nearest the crosshair within a narrow cone. */
  function findAimTarget(camera, range) {
    camera.getWorldDirection(tmpDir);
    let best = null;
    let bestScore = 0.16;
    for (const a of game.actors) {
      if (a.dead || a.inVehicle || a.isPlayer) continue;
      const dx = a.x - camera.position.x;
      const dy = a.y + 1.2 - camera.position.y;
      const dz = a.z - camera.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > range + 6) continue;
      const cos = (dx * tmpDir.x + dy * tmpDir.y + dz * tmpDir.z) / dist;
      const angle = Math.acos(Math.min(1, cos));
      const hostile = a.role === 'cop' || a.role === 'gang' || a.role === 'boss' || a.brain.provoked;
      const score = angle * (hostile ? 0.7 : 1.3);
      if (score < bestScore && game.collision.lineOfSight(game.player.actor.x, game.player.actor.z, a.x, a.z, 1.4)) {
        best = a;
        bestScore = score;
      }
    }
    return best;
  }

  function punch(attacker) {
    attacker.punch = 1;
    const fx = Math.sin(attacker.heading);
    const fz = Math.cos(attacker.heading);
    game.audio.punch(attacker.x, attacker.z);
    for (const a of game.actors) {
      if (a === attacker || a.dead || a.inVehicle) continue;
      const dx = a.x - attacker.x;
      const dz = a.z - attacker.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.9 && (dx * fx + dz * fz) / (d + 1e-4) > 0.4) {
        damageActor(game, a, WEAPONS[0].damage + rand.range(0, 8), attacker.isPlayer ? 'player' : attacker, fx, fz);
        a.vx += fx * 3;
        a.vz += fz * 3;
        if (attacker.isPlayer) game.crime('shootNear', a.x, a.z);
        return;
      }
    }
  }

  /** The player's trigger: called every frame with whether fire is held and the aim state. */
  function updatePlayer(dt, fireHeld, firePressed, aiming, camera) {
    const player = game.player;
    const a = player.actor;
    state.cooldown -= dt;
    const w = WEAPONS[player.current];
    state.aimTarget = aiming && !player.vehicle && !w.melee ? findAimTarget(camera, w.range) : null;
    if (player.vehicle || a.dead) return;
    const wantsFire = w.id === 'pistol' || w.id === 'shotgun' ? firePressed || (fireHeld && state.cooldown < -0.15) : fireHeld;
    if (!wantsFire || state.cooldown > 0) return;
    if (w.melee) {
      state.cooldown = 1 / w.rate;
      punch(a);
      return;
    }
    if (player.reload > 0) return;
    if (player.clip[player.current] <= 0) {
      startReload(player);
      return;
    }
    state.cooldown = 1 / w.rate;
    player.clip[player.current] -= 1;
    state.lastShot = game.time;
    const hand = handPosition(a);
    camera.getWorldDirection(tmpDir);
    const origin = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    let base = tmpDir.clone();
    if (state.aimTarget) {
      const t = state.aimTarget;
      base = new THREE.Vector3(t.x - hand.x, t.y + 1.25 - hand.y, t.z - hand.z).normalize();
      origin.x = hand.x;
      origin.y = hand.y;
      origin.z = hand.z;
    }
    const pellets = w.pellets ?? 1;
    for (let p = 0; p < pellets; p += 1) {
      const d = base.clone();
      d.x += rand.range(-w.spread, w.spread);
      d.y += rand.range(-w.spread, w.spread) * 0.6;
      d.z += rand.range(-w.spread, w.spread);
      d.normalize();
      const hit = traceShot(game, origin, d, w.range, a, null);
      const hx = origin.x + d.x * hit.t;
      const hy = origin.y + d.y * hit.t;
      const hz = origin.z + d.z * hit.t;
      game.effects.tracer(hand.x, hand.y, hand.z, hx, hy, hz);
      if (hit.actor) damageActor(game, hit.actor, w.damage * rand.range(0.85, 1.15), 'player', d.x, d.z);
      else if (hit.vehicle) {
        damageVehicle(game, hit.vehicle, w.damage * 1.6, 'player');
        game.effects.sparks(hx, hy, hz, 4);
      } else if (hit.t < w.range) game.effects.impact(hx, hy, hz);
    }
    a.heading = Math.atan2(base.x, base.z);
    game.effects.muzzle(hand.x, hand.y, hand.z);
    game.audio.gunshot(w.id, a.x, a.z);
    game.cameraShake(w.id === 'shotgun' ? 0.25 : 0.06);
    alertNearby(a.x, a.z, 40);
    if (player.clip[player.current] <= 0) startReload(player);
  }

  /** An armed NPC shoots at a target actor (usually the player); accuracy is a hit chance. */
  function npcShoot(shooter, target, accuracy) {
    const w = WEAPONS[shooter.weapon] ?? WEAPONS[1];
    const hand = handPosition(shooter);
    const tx = target.x;
    const tz = target.z;
    const ty = target.inVehicle ? 1.0 : target.y + 1.2;
    const dist = Math.hypot(tx - hand.x, tz - hand.z);
    const moving = Math.hypot(target.vx ?? 0, target.vz ?? 0);
    const chance = accuracy * Math.max(0.25, 1 - dist / 70) * (moving > 5 ? 0.6 : 1);
    const hits = rand.next() < chance;
    const miss = hits ? 0 : rand.range(0.8, 2.2) * (rand.chance(0.5) ? 1 : -1);
    const dx = tx - hand.x + miss * Math.cos(shooter.heading);
    const dz = tz - hand.z - miss * Math.sin(shooter.heading);
    const dy = ty - hand.y + (hits ? 0 : rand.range(-0.4, 0.8));
    const len = Math.hypot(dx, dy, dz);
    const d = { x: dx / len, y: dy / len, z: dz / len };
    const hit = traceShot(game, hand, d, w.range, shooter, null);
    const ex = hand.x + d.x * hit.t;
    const ey = hand.y + d.y * hit.t;
    const ez = hand.z + d.z * hit.t;
    game.effects.tracer(hand.x, hand.y, hand.z, ex, ey, ez);
    game.effects.muzzle(hand.x, hand.y, hand.z);
    game.audio.gunshot(w.id, hand.x, hand.z);
    if (hit.actor) {
      damageActor(game, hit.actor, w.damage * (hit.actor.isPlayer ? 0.55 : 1), shooter, d.x, d.z);
      if (hit.actor.isPlayer) game.hud.flashDamage();
    } else if (hit.vehicle) {
      damageVehicle(game, hit.vehicle, w.damage * 1.2, shooter);
      game.effects.sparks(ex, ey, ez, 3);
      if (hit.vehicle.driver === 'player') game.hud.flashDamage();
    } else if (hit.t < w.range) game.effects.impact(ex, ey, ez);
    game.events.emit('gunfire', { x: hand.x, z: hand.z, radius: 30 });
  }

  /** An explosion: hurts and throws everyone within the radius. */
  function blast(x, z, radius, damage, source) {
    for (const a of game.actors) {
      if (a.dead || a.inVehicle) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < radius) {
        const k = 1 - d / radius;
        const nx = (a.x - x) / (d + 0.1);
        const nz = (a.z - z) / (d + 0.1);
        damageActor(game, a, damage * k, source === 'player' ? 'player' : null, nx, nz);
        a.vx += nx * 9 * k;
        a.vz += nz * 9 * k;
        a.vy = 5 * k;
      }
    }
    const p = game.player.actor;
    const pd = Math.hypot(p.x - x, p.z - z);
    if (pd < 40) game.cameraShake(Math.max(0, 0.9 - pd / 45));
    if (source === 'player') game.crime('shootNear', x, z);
  }

  return { state, updatePlayer, npcShoot, blast, punch, CRIME };
}
