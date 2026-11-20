// Vehicles as things in the world: spawning, arcade driving physics (grip, drift on the
// handbrake, reverse), crashes against the city and each other, damage, smoke, fire and
// explosions. Who is at the wheel (player, traffic, police, a mission) only sets the controls.
import * as THREE from '../vendor/three.min.js';
import { VEHICLES } from './config.js';
import { buildVehicleModel } from './models.js';
import { rand } from './rng.js';
import { groundHeight } from './citymap.js';

let nextId = 1;
const charred = new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 1 });

export function spawnVehicle(game, modelId, x, z, heading, options = {}) {
  const spec = VEHICLES[modelId];
  const color = options.color ?? rand.pick(spec.colors);
  const model = buildVehicleModel(modelId, color);
  model.originalPaint = color;
  game.scene.add(model.group);
  const v = {
    id: nextId++,
    kind: 'vehicle',
    modelId,
    spec,
    color,
    model,
    x, z, heading,
    vx: 0, vz: 0,
    speed: 0,
    steer: 0,
    health: spec.health,
    burn: 0,
    dead: false,
    deadTime: 0,
    driver: options.driver ?? null,
    controls: { throttle: 0, brake: 0, steer: 0, handbrake: 0 },
    ai: null,
    siren: !!spec.police,
    persistent: !!options.persistent,
    tag: options.tag ?? null,
    lastHitBy: null,
    smokeTimer: 0,
  };
  game.vehicles.push(v);
  syncVehicleMesh(v, 0);
  return v;
}

export function removeVehicle(game, v) {
  game.scene.remove(v.model.group);
  const index = game.vehicles.indexOf(v);
  if (index >= 0) game.vehicles.splice(index, 1);
  v.removed = true;
}

/** The two collision circles of a vehicle (front and rear), radius half its width. */
export function vehicleCircles(v) {
  const r = v.spec.width / 2;
  const off = v.spec.length / 2 - r;
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  return [
    { x: v.x + fx * off, z: v.z + fz * off, r },
    { x: v.x - fx * off, z: v.z - fz * off, r },
  ];
}

export function damageVehicle(game, v, amount, source = null) {
  if (v.dead) return;
  v.health -= amount;
  if (source) v.lastHitBy = source;
  if (v.health <= 0 && v.burn === 0) v.burn = 4 + rand.next() * 2;
  if (source === 'player' && v.spec.police) game.crime?.('damageCop', v.x, v.z);
}

export function explodeVehicle(game, v) {
  if (v.dead) return;
  v.dead = true;
  v.health = 0;
  v.burn = 0;
  v.controls.throttle = 0;
  v.vx *= 0.3;
  v.vz *= 0.3;
  v.model.body.material = charred;
  game.effects.explosion(v.x, 1, v.z);
  game.audio.explosion(v.x, v.z);
  game.events.emit('vehicleExploded', v);
  // The blast hurts everyone close by and throws the cars around.
  for (const other of game.vehicles) {
    if (other === v || other.dead) continue;
    const d = Math.hypot(other.x - v.x, other.z - v.z);
    if (d < 9) {
      damageVehicle(game, other, (9 - d) * 60, v.lastHitBy);
      other.vx += ((other.x - v.x) / (d + 0.1)) * (9 - d) * 1.5;
      other.vz += ((other.z - v.z) / (d + 0.1)) * (9 - d) * 1.5;
    }
  }
  game.combat.blast(v.x, v.z, 8, 120, v.lastHitBy);
}

function driveStep(v, dt) {
  const s = v.spec;
  const c = v.controls;
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  const rx = -fz;
  const rz = fx;
  let vf = v.vx * fx + v.vz * fz;
  let vr = v.vx * rx + v.vz * rz;
  const health = Math.max(0.35, v.health / s.health);
  const throttle = v.dead ? 0 : c.throttle;
  const brake = v.dead ? 0 : c.brake;
  const handbrake = v.dead ? 1 : c.handbrake;

  if (throttle > 0) {
    if (vf < -0.5) vf += s.accel * 1.8 * dt;
    else if (vf < s.top * health) vf += s.accel * throttle * (1 - (vf / s.top) * 0.55) * dt;
  }
  if (brake > 0) {
    if (vf > 0.5) vf -= 30 * brake * dt;
    else if (vf > -s.top * 0.3) vf -= s.accel * 0.7 * brake * dt;
  }
  vf -= vf * 0.1 * dt;
  vf -= Math.sign(vf) * Math.min(Math.abs(vf), (throttle > 0 ? 0.3 : 2.2) * dt);
  if (handbrake > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 8 * dt);

  const grip = handbrake > 0 ? s.grip * 0.16 : s.grip;
  vr *= Math.exp(-grip * dt);

  const targetSteer = (c.steer * 0.62) / (1 + Math.abs(vf) * 0.04);
  v.steer += (targetSteer - v.steer) * Math.min(1, 9 * dt);
  const wheelbase = s.length * 0.62;
  let yaw = (vf * Math.tan(v.steer)) / wheelbase;
  if (handbrake > 0 && Math.abs(vf) > 5) yaw *= 1.45;
  v.heading += yaw * dt;

  const nfx = Math.sin(v.heading);
  const nfz = Math.cos(v.heading);
  v.vx = nfx * vf - nfz * vr;
  v.vz = nfz * vf + nfx * vr;
  v.speed = vf;
  v.slip = Math.abs(vr);
  v.x += v.vx * dt;
  v.z += v.vz * dt;
}

function collideWithCity(game, v) {
  const circles = vehicleCircles(v);
  let worst = 0;
  for (let k = 0; k < circles.length; k += 1) {
    const c = circles[k];
    const res = game.collision.resolveCircle(c.x, c.z, c.r);
    if (!res.hit) continue;
    const dx = res.x - c.x;
    const dz = res.z - c.z;
    v.x += dx;
    v.z += dz;
    const impact = -(v.vx * res.nx + v.vz * res.nz);
    if (impact > 0) {
      v.vx += res.nx * impact * 1.25;
      v.vz += res.nz * impact * 1.25;
      // Scrape speed off along the wall and twist the car away from it.
      v.vx *= 0.92;
      v.vz *= 0.92;
      const side = Math.sin(v.heading) * res.nz - Math.cos(v.heading) * res.nx;
      v.heading += (k === 0 ? 1 : -1) * side * Math.min(impact, 12) * 0.012;
      worst = Math.max(worst, impact);
    }
  }
  if (worst > 4) {
    damageVehicle(game, v, worst * worst * 1.1, v.driver === 'player' ? null : null);
    game.effects.sparks(v.x + Math.sin(v.heading) * 2, 0.8, v.z + Math.cos(v.heading) * 2, Math.min(20, worst * 2));
    if (v.driver === 'player') {
      game.audio.crash(Math.min(1, worst / 20));
      game.cameraShake(Math.min(0.6, worst / 25));
    }
  }
}

function collidePair(game, a, b) {
  const ca = vehicleCircles(a);
  const cb = vehicleCircles(b);
  for (const p of ca) {
    for (const q of cb) {
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      const dist = Math.hypot(dx, dz);
      const min = p.r + q.r;
      if (dist >= min || dist < 1e-4) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const ma = a.spec.mass;
      const mb = b.spec.mass;
      const push = (min - dist) / (ma + mb);
      a.x += nx * push * mb;
      a.z += nz * push * mb;
      b.x -= nx * push * ma;
      b.z -= nz * push * ma;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel < 0) {
        const j = (-1.3 * rel) / (1 / ma + 1 / mb);
        a.vx += (j / ma) * nx;
        a.vz += (j / ma) * nz;
        b.vx -= (j / mb) * nx;
        b.vz -= (j / mb) * nz;
        const hit = -rel;
        if (hit > 6) {
          const srcA = b.driver === 'player' ? 'player' : null;
          const srcB = a.driver === 'player' ? 'player' : null;
          // One crash is one hit: cars grinding together do not keep taking damage.
          if (game.time - (a.crashAt ?? -9) > 0.6) damageVehicle(game, a, hit * hit * 0.4, srcA);
          if (game.time - (b.crashAt ?? -9) > 0.6) damageVehicle(game, b, hit * hit * 0.4, srcB);
          a.crashAt = game.time;
          b.crashAt = game.time;
          game.effects.sparks((p.x + q.x) / 2, 0.8, (p.z + q.z) / 2, Math.min(24, hit * 2));
          if (a.driver === 'player' || b.driver === 'player') {
            game.audio.crash(Math.min(1, hit / 18));
            game.cameraShake(Math.min(0.5, hit / 25));
          }
          game.events.emit('vehicleCrash', { a, b, hit });
        }
      }
      return;
    }
  }
}

export function syncVehicleMesh(v, dt) {
  const g = v.model.group;
  g.position.set(v.x, groundHeight(v.x), v.z);
  g.rotation.y = v.heading;
  const lean = THREE.MathUtils.clamp((v.slip ?? 0) * 0.008 * Math.sign(v.steer), -0.06, 0.06);
  v.model.body.rotation.z = lean;
  for (const w of v.model.wheels) {
    w.wheel.rotation.x += (v.speed * dt) / 0.38;
    if (w.front) w.pivot.rotation.y = v.steer;
  }
}

export function updateVehicles(game, dt) {
  const list = game.vehicles;
  for (const v of list) {
    if (v.dead) {
      v.deadTime += dt;
      v.vx *= Math.exp(-2 * dt);
      v.vz *= Math.exp(-2 * dt);
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      if (rand.chance(dt * 6)) game.effects.smoke(v.x, 1.4, v.z, true);
      continue;
    }
    driveStep(v, dt);
    collideWithCity(game, v);
    // Smoke when badly hurt, then fire, then the bang.
    const share = v.health / v.spec.health;
    v.smokeTimer -= dt;
    if (share < 0.4 && v.smokeTimer <= 0) {
      v.smokeTimer = share < 0.2 ? 0.05 : 0.15;
      const fx = Math.sin(v.heading) * (v.spec.length / 2 - 0.6);
      const fz = Math.cos(v.heading) * (v.spec.length / 2 - 0.6);
      game.effects.smoke(v.x + fx, 1.2, v.z + fz, share < 0.2);
    }
    if (v.burn > 0) {
      v.burn -= dt;
      if (rand.chance(dt * 30)) game.effects.fire(v.x, 1.2, v.z);
      if (v.burn <= 0) explodeVehicle(game, v);
    }
  }
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (Math.abs(a.x - b.x) > 7 || Math.abs(a.z - b.z) > 7) continue;
      collidePair(game, a, b);
    }
  }
  for (const v of list) syncVehicleMesh(v, dt);
}
