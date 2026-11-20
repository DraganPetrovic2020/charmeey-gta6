// Nico, the player: walking, sprinting and jumping relative to the camera, getting into any car
// (pulling the driver out), driving it, getting out, choosing weapons and reloading. Shooting
// itself is in combat.js; the wanted level is in police.js.
import { PLAYER, WEAPONS } from './config.js';
import { faceToward, moveActor, spawnActor } from './characters.js';
import { rand } from './rng.js';

export function createPlayer(game, x, z, heading) {
  const actor = spawnActor(game, 'player', x, z, { heading, health: PLAYER.maxHealth, persistent: true });
  actor.isPlayer = true;
  const player = {
    actor,
    vehicle: null,
    money: 0,
    owned: WEAPONS.map((w, i) => i === 0),
    ammo: WEAPONS.map((w, i) => (i === 0 ? Infinity : 0)),
    clip: WEAPONS.map((w, i) => (i === 0 ? Infinity : 0)),
    current: 0,
    reload: 0,
    stamina: 1,
    enterCooldown: 0,
    lastVehicle: null,
  };
  return player;
}

export function giveWeapon(player, index, ammo) {
  player.owned[index] = true;
  player.ammo[index] += ammo;
  if (player.clip[index] === 0) refillClip(player, index);
}

function refillClip(player, index) {
  const w = WEAPONS[index];
  const need = w.mag - player.clip[index];
  const take = Math.min(need, player.ammo[index]);
  player.clip[index] += take;
  player.ammo[index] -= take;
}

export function selectWeapon(player, step) {
  for (let k = 1; k <= WEAPONS.length; k += 1) {
    const i = (player.current + step * k + WEAPONS.length * 4) % WEAPONS.length;
    if (player.owned[i] && (i === 0 || player.clip[i] + player.ammo[i] > 0)) {
      player.current = i;
      player.reload = 0;
      return;
    }
  }
}

/** Starts a reload when there is something to load. */
export function startReload(player) {
  const i = player.current;
  if (i === 0 || player.reload > 0) return;
  if (player.clip[i] >= WEAPONS[i].mag || player.ammo[i] <= 0) return;
  player.reload = i === 3 ? 1.6 : 1.1;
}

function nearestEnterable(game, actor) {
  let best = null;
  let bestDist = 4.2;
  for (const v of game.vehicles) {
    if (v.dead || v.burn > 0) continue;
    const d = Math.hypot(v.x - actor.x, v.z - actor.z) - v.spec.length * 0.25;
    if (d < bestDist) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}

export function enterVehicle(game, v) {
  const player = game.player;
  const actor = player.actor;
  if (v.driver && v.driver !== 'player') {
    // Pull the driver out: they run off, or fight back if they are police.
    const side = { x: actor.x, z: actor.z };
    const role = v.driver === 'police' ? 'cop' : 'civilian';
    const ejected = spawnActor(game, role, side.x + rand.range(-1, 1), side.z + rand.range(-1, 1), { state: role === 'cop' ? 'hunt' : 'flee', weapon: role === 'cop' ? 1 : 0 });
    ejected.brain.fleeFrom = { x: v.x, z: v.z };
    ejected.brain.fleeTime = 8;
    if (v.driver === 'police') game.crime('stealSeen', v.x, v.z, true);
    else game.crime('jack', v.x, v.z);
    game.audio.shout(v.x, v.z);
  }
  v.driver = 'player';
  v.ai = null;
  v.siren = false;
  v.persistent = true;
  player.vehicle = v;
  player.lastVehicle = v;
  actor.inVehicle = v;
  actor.aiming = false;
  player.enterCooldown = 0.4;
  game.events.emit('enteredVehicle', v);
  game.hud.toast(v.spec.name, 'vehicle');
}

export function exitVehicle(game) {
  const player = game.player;
  const v = player.vehicle;
  if (!v) return;
  const actor = player.actor;
  // Step out on the driver's (left) side, or the other side if that is blocked.
  const lx = Math.cos(v.heading);
  const lz = -Math.sin(v.heading);
  let out = { x: v.x + lx * (v.spec.width / 2 + 0.7), z: v.z + lz * (v.spec.width / 2 + 0.7) };
  if (!game.collision.isFree(out.x, out.z, 0.4)) out = { x: v.x - lx * (v.spec.width / 2 + 0.7), z: v.z - lz * (v.spec.width / 2 + 0.7) };
  actor.x = out.x;
  actor.z = out.z;
  actor.heading = v.heading;
  actor.vx = v.vx * 0.3;
  actor.vz = v.vz * 0.3;
  actor.inVehicle = null;
  v.driver = null;
  v.controls.throttle = 0;
  v.controls.brake = 0;
  v.controls.handbrake = 1;
  player.vehicle = null;
  player.enterCooldown = 0.4;
  game.events.emit('exitedVehicle', v);
}

function updateOnFoot(game, dt, input, cam) {
  const player = game.player;
  const a = player.actor;
  const { x, y } = input.axes();
  const sprint = input.held('ShiftLeft') || input.held('ShiftRight');
  const aiming = input.mouse.aim || input.mouse.fire;
  const fx = Math.sin(cam.yaw);
  const fz = Math.cos(cam.yaw);
  // Camera right is (-fz, fx) in this world's handedness.
  let mx = fx * y - fz * x;
  let mz = fz * y + fx * x;
  const len = Math.hypot(mx, mz);
  if (sprint && len > 0) player.stamina = Math.max(0, player.stamina - dt * 0.12);
  else player.stamina = Math.min(1, player.stamina + dt * 0.2);
  const speed = aiming ? PLAYER.walk * 0.8 : sprint && player.stamina > 0.05 ? PLAYER.run : PLAYER.walk;
  if (len > 0) {
    mx /= len;
    mz /= len;
  }
  moveActor(game, a, mx * speed, mz * speed, dt);
  if (aiming) faceToward(a, cam.yaw, dt, 20);
  else if (len > 0) faceToward(a, Math.atan2(mx, mz), dt, PLAYER.turn);
  a.aiming = aiming && player.current !== 0;
  a.model.gun.visible = player.current !== 0;
  if (input.pressed('Space') && a.y === 0) a.vy = PLAYER.jump;

  if ((input.pressed('KeyF') || input.pressed('Enter')) && player.enterCooldown <= 0) {
    const v = nearestEnterable(game, a);
    if (v) enterVehicle(game, v);
  }
}

function updateDriving(game, dt, input) {
  const player = game.player;
  const v = player.vehicle;
  const a = player.actor;
  const { x, y } = input.axes();
  const c = v.controls;
  c.throttle = y > 0 ? 1 : 0;
  c.brake = y < 0 ? 1 : 0;
  c.steer = -x;
  c.handbrake = input.held('Space') ? 1 : 0;
  a.x = v.x;
  a.z = v.z;
  a.heading = v.heading;
  if (input.pressed('KeyH')) game.audio.horn();
  if (v.dead || v.burn > 0 && v.burn < 1.2) {
    exitVehicle(game);
    return;
  }
  if ((input.pressed('KeyF') || input.pressed('Enter')) && player.enterCooldown <= 0) {
    const speed = Math.abs(v.speed);
    exitVehicle(game);
    // Bailing out of a moving car: Nico hits the tarmac rolling.
    if (speed > 9) {
      a.vx = v.vx * 0.5;
      a.vz = v.vz * 0.5;
      a.vy = 3;
      a.health -= Math.min(30, speed * 0.6);
      game.audio.thud(a.x, a.z);
    }
  }
}

export function updatePlayer(game, dt, input, cam) {
  const player = game.player;
  if (player.actor.dead) return;
  player.enterCooldown -= dt;
  if (input.mouse.wheel !== 0) selectWeapon(player, input.mouse.wheel);
  for (let i = 0; i < WEAPONS.length; i += 1) {
    if (input.pressed(`Digit${i + 1}`) && player.owned[i]) {
      player.current = i;
      player.reload = 0;
    }
  }
  if (input.pressed('KeyR')) startReload(player);
  if (player.reload > 0) {
    player.reload -= dt;
    if (player.reload <= 0) {
      refillClip(player, player.current);
      player.reload = 0;
    }
  }
  if (player.vehicle) updateDriving(game, dt, input);
  else updateOnFoot(game, dt, input, cam);
}

export { refillClip };
