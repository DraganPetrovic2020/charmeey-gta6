// The Sunset Syndicate on foot: gunmen who guard a spot, take cover-ish positions, and open fire
// once the player comes close, shoots, or hurts one of them. Victor Kroll fights the same way
// with a carbine and far more health.
import { faceToward, moveActor } from './characters.js';
import { rand } from './rng.js';

export function updateGangMember(game, a, dt) {
  const p = game.player.actor;
  const target = game.player.vehicle ?? p;
  const dx = target.x - a.x;
  const dz = target.z - a.z;
  const d = Math.hypot(dx, dz);
  const b = a.brain;
  if (!b.home) b.home = { x: a.x, z: a.z };
  const sees = d < 70 && game.collision.lineOfSight(a.x, a.z, target.x, target.z);
  if (a.state === 'guard') {
    a.aiming = false;
    // Idle sway around the post until the player shows up.
    const t = game.time * 0.4 + a.id;
    moveActor(game, a, Math.sin(t) * 0.6, Math.cos(t * 0.7) * 0.6, dt, 3);
    faceToward(a, Math.atan2(Math.sin(t), Math.cos(t)), dt, 2);
    if ((sees && d < 38) || b.provoked || game.time - (b.alarm ?? -99) < 1) {
      a.state = 'attack';
      game.audio.shout(a.x, a.z);
      for (const o of game.actors) if (o !== a && o.role === 'gang' && o.state === 'guard' && Math.hypot(o.x - a.x, o.z - a.z) < 45) o.brain.alarm = game.time;
    }
    return;
  }
  faceToward(a, Math.atan2(dx, dz), dt, 9);
  a.aiming = sees;
  // Hold a fighting distance, strafe, and fall back toward the post if dragged too far.
  let want = 0;
  if (!sees || d > 26) want = 5.5;
  else if (d < 8) want = -3;
  const strafe = Math.sin(game.time * 1.1 + a.id * 2) * 2.6;
  const ux = dx / (d || 1);
  const uz = dz / (d || 1);
  let vx = ux * want - uz * strafe;
  let vz = uz * want + ux * strafe;
  const home = Math.hypot(a.x - b.home.x, a.z - b.home.z);
  if (home > 40) {
    vx += ((b.home.x - a.x) / home) * 3;
    vz += ((b.home.z - a.z) / home) * 3;
  }
  moveActor(game, a, vx, vz, dt);
  a.cooldown -= dt;
  if (sees && d < 55 && a.cooldown <= 0) {
    const burst = a.weapon === 2 || a.weapon === 4;
    a.cooldown = burst ? rand.range(0.12, 0.25) : rand.range(0.6, 1.3);
    if (burst && rand.chance(0.12)) a.cooldown = rand.range(1, 1.8);
    game.combat.npcShoot(a, p, a.role === 'boss' ? 0.32 : 0.24);
  }
}
