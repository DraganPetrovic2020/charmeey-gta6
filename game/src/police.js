// The Palmera Keys Police Department and the wanted level: crimes add heat (more when an officer
// sees them), heat becomes one to five stars, cruisers are sent along the road grid to the last
// place the player was seen and ram the player's car, officers get out and give chase or open
// fire, a helicopter joins at four stars, and the stars fade once nobody has seen the player for
// long enough. Getting caught on foot is being busted.
import * as THREE from '../vendor/three.min.js';
import { CRIME, POLICE } from './config.js';
import { nearestNode, nodeCoord } from './citymap.js';
import { faceToward, moveActor, removeActor, spawnActor } from './characters.js';
import { rand } from './rng.js';
import { removeVehicle, spawnVehicle } from './vehicles.js';
import { lanePoint, neighbours, routeBetween, startCruising, driveTraffic, steerToward } from './traffic.js';
import { solid } from './models.js';

function buildHelicopter(scene) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 4.2), solid(0x101826, { metalness: 0.4, roughness: 0.4 }));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2, 1.3, 1.4), solid(0x1d2a38, { metalness: 0.6, roughness: 0.2 }));
  glass.position.set(0, 0.2, 2.2);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.4, 3), solid(0xf4f4f4));
  stripe.position.y = -0.2;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 5), solid(0x101826));
  tail.position.set(0, 0.4, -4.4);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.8), solid(0x101826));
  fin.position.set(0, 1.0, -6.8);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.35), solid(0x222222));
  rotor.position.y = 1.3;
  const rotor2 = rotor.clone();
  rotor2.rotation.y = Math.PI / 2;
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4), solid(0x333333));
  skidL.position.set(0.9, -1.3, 0);
  const skidR = skidL.clone();
  skidR.position.x = -0.9;
  const light = new THREE.SpotLight(0xe8f0ff, 0, 120, 0.22, 0.5, 1.2);
  light.position.set(0, -1, 1);
  const lightTarget = new THREE.Object3D();
  scene.add(lightTarget);
  light.target = lightTarget;
  g.add(body, glass, stripe, tail, fin, rotor, rotor2, skidL, skidR, light);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.visible = false;
  scene.add(g);
  return { group: g, rotor, rotor2, light, lightTarget, x: 0, z: 0, y: 40, angle: 0, cooldown: 2, health: 600 };
}

export function createPolice(game) {
  const wanted = { heat: 0, stars: 0, unseen: 0, seen: false, lastKnown: { x: 0, z: 0 }, bust: 0, flash: false, locked: false };
  const heli = buildHelicopter(game.scene);
  let patrolTimer = 0;

  function starsFor(heat) {
    let s = 0;
    for (let i = 0; i < CRIME.starHeat.length; i += 1) if (heat >= CRIME.starHeat[i] && CRIME.starHeat[i] > 0) s = i;
    return Math.min(5, s);
  }

  function copSees(x, z, range = CRIME.copSight) {
    for (const a of game.actors) {
      if (a.role !== 'cop' || a.dead) continue;
      if (Math.hypot(a.x - x, a.z - z) < range && game.collision.lineOfSight(a.x, a.z, x, z)) return true;
    }
    for (const v of game.vehicles) {
      if (!v.spec.police || v.dead || v.driver !== 'police') continue;
      if (Math.hypot(v.x - x, v.z - z) < range && game.collision.lineOfSight(v.x, v.z, x, z)) return true;
    }
    return heli.group.visible && Math.hypot(heli.x - x, heli.z - z) < 90;
  }

  function setStars(n, force = false) {
    const before = wanted.stars;
    wanted.stars = Math.max(0, Math.min(5, n));
    wanted.heat = Math.max(wanted.heat, CRIME.starHeat[wanted.stars] + 1);
    if (n === 0) wanted.heat = 0;
    if (wanted.stars > before) {
      game.audio.star();
      wanted.lastKnown = { x: game.player.actor.x, z: game.player.actor.z };
      wanted.unseen = 0;
    }
    if (force) wanted.locked = false;
  }

  /** A crime at (x, z): heat goes up, by more when police witness it. */
  function crime(type, x, z, witnessed = false) {
    const amount = CRIME[type] ?? (type === 'jack' ? 6 : 5);
    const seen = witnessed || copSees(x, z);
    wanted.heat += amount * (seen ? 1 : 0.45);
    const stars = starsFor(wanted.heat);
    if (stars > wanted.stars) {
      wanted.stars = stars;
      game.audio.star();
      game.hud.pulseStars();
    }
    if (seen || wanted.stars > 0) {
      wanted.lastKnown = { x, z };
      if (seen) wanted.unseen = 0;
    }
  }

  function clear() {
    wanted.heat = 0;
    wanted.stars = 0;
    wanted.unseen = 0;
    wanted.bust = 0;
    for (const a of game.actors) if (a.role === 'cop') a.state = 'patrol';
    for (const v of game.vehicles) {
      if (v.spec.police && v.driver === 'police' && v.police) {
        const n = nearestNode(v.x, v.z);
        const next = rand.pick(neighbours(n.i, n.j));
        startCruising(v, n, next);
        v.police = 'patrol';
        v.persistent = false;
      }
    }
  }

  game.events.on('actorKilled', ({ actor, source }) => {
    if (source !== 'player') return;
    if (actor.role === 'cop') crime('killCop', actor.x, actor.z);
    else if (actor.role === 'civilian') crime('killPed', actor.x, actor.z);
    else crime('killPed', actor.x, actor.z, false);
  });

  function spawnCruiser(mode) {
    const p = game.player.actor;
    for (let tries = 0; tries < 16; tries += 1) {
      const a = { i: rand.int(0, 10), j: rand.int(0, 10) };
      const b = rand.pick(neighbours(a.i, a.j));
      const pt = lanePoint(a, b, 0.5);
      const d = Math.hypot(pt.x - p.x, pt.z - p.z);
      const min = mode === 'patrol' ? 120 : 75;
      const max = mode === 'patrol' ? 220 : 150;
      if (d < min || d > max) continue;
      if (game.vehicles.some((v) => Math.hypot(v.x - pt.x, v.z - pt.z) < 10)) continue;
      const v = spawnVehicle(game, 'cruiser', pt.x, pt.z, pt.heading, { driver: 'police' });
      v.police = mode;
      if (mode === 'patrol') startCruising(v, a, b);
      else {
        v.persistent = true;
        v.ai = { route: [], routeTimer: 0 };
        const f = 12;
        v.vx = Math.sin(v.heading) * f;
        v.vz = Math.cos(v.heading) * f;
      }
      return v;
    }
    return null;
  }

  function deployOfficers(v) {
    v.driver = null;
    v.police = 'parked';
    v.controls.throttle = 0;
    v.controls.brake = 1;
    v.controls.handbrake = 1;
    const sides = [1, -1];
    for (const s of sides) {
      const ox = v.x + Math.cos(v.heading) * s * 2;
      const oz = v.z - Math.sin(v.heading) * s * 2;
      const cop = spawnActor(game, 'cop', ox, oz, { weapon: wanted.stars >= 4 ? 2 : 1, state: 'hunt', heading: v.heading, persistent: true });
      cop.brain.car = v;
    }
  }

  function chase(v, dt) {
    const p = game.player.actor;
    const target = game.player.vehicle ?? p;
    const d = Math.hypot(target.x - v.x, target.z - v.z);
    const direct = d < 55 && game.collision.lineOfSight(v.x, v.z, target.x, target.z, 1.0);
    if (!game.player.vehicle && d < 16 && Math.abs(v.speed) < 14) {
      deployOfficers(v);
      return;
    }
    if (direct) {
      // Aim a little ahead of a moving target to cut it off, and ram it.
      const lead = Math.min(1.2, d / 30);
      const tx = target.x + (target.vx ?? 0) * lead;
      const tz = target.z + (target.vz ?? 0) * lead;
      const theirs = game.player.vehicle ? Math.hypot(game.player.vehicle.vx, game.player.vehicle.vz) : 0;
      steerToward(v, tx, tz, game.player.vehicle ? Math.min(46, theirs + (d > 25 ? 14 : 5)) : 14, dt);
      return;
    }
    const ai = v.ai;
    ai.routeTimer -= dt;
    if (ai.routeTimer <= 0 || !ai.route.length) {
      ai.routeTimer = 2;
      const from = nearestNode(v.x, v.z);
      const goal = nearestNode(wanted.lastKnown.x, wanted.lastKnown.z);
      ai.route = routeBetween(from, goal);
      if (ai.route.length > 1) ai.route.shift();
    }
    const next = ai.route[0];
    if (!next) {
      steerToward(v, wanted.lastKnown.x, wanted.lastKnown.z, 20, dt);
      return;
    }
    const nx = nodeCoord(next.i);
    const nz = nodeCoord(next.j);
    if (Math.hypot(nx - v.x, nz - v.z) < 7) ai.route.shift();
    steerToward(v, nx, nz, 30, dt);
  }

  function updateCop(a, dt) {
    const p = game.player.actor;
    if (a.state === 'patrol' || wanted.stars === 0) {
      a.aiming = false;
      a.brain.patrolT = (a.brain.patrolT ?? rand.range(0, 10)) + dt;
      const ang = a.id + a.brain.patrolT * 0.1;
      moveActor(game, a, Math.sin(ang) * 1.4, Math.cos(ang) * 1.4, dt, 4);
      faceToward(a, ang, dt, 4);
      if (Math.hypot(a.x - p.x, a.z - p.z) > 160 && !a.removed) removeActor(game, a);
      return;
    }
    const target = game.player.vehicle ?? p;
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const d = Math.hypot(dx, dz);
    const sees = d < 60 && game.collision.lineOfSight(a.x, a.z, target.x, target.z);
    const shooting = wanted.stars >= 2 || a.brain.provoked;
    faceToward(a, Math.atan2(dx, dz), dt, 8);
    if (!shooting) {
      // One star: run up and make the arrest.
      a.aiming = false;
      if (d > 1.2) moveActor(game, a, (dx / d) * 6.5, (dz / d) * 6.5, dt);
      else moveActor(game, a, 0, 0, dt);
      return;
    }
    a.aiming = sees && d < 45;
    let want = 0;
    if (!sees || d > 22) want = 6.5;
    else if (d < 7) want = -2;
    const strafe = Math.sin(game.time * 0.8 + a.id) * 2.2;
    const ux = dx / (d || 1);
    const uz = dz / (d || 1);
    moveActor(game, a, ux * want - uz * strafe * (sees ? 1 : 0), uz * want + ux * strafe * (sees ? 1 : 0), dt);
    a.cooldown -= dt;
    if (sees && d < 50 && a.cooldown <= 0) {
      a.cooldown = rand.range(0.5, 1.2) * (a.weapon === 2 ? 0.4 : 1);
      game.combat.npcShoot(a, p, POLICE.copAccuracy[wanted.stars]);
    }
  }

  function updateHeli(dt) {
    const want = wanted.stars >= POLICE.heliStars;
    if (want && !heli.group.visible) {
      heli.group.visible = true;
      const p = game.player.actor;
      heli.x = p.x + 150;
      heli.z = p.z - 120;
      heli.y = 45;
    }
    if (!want && heli.group.visible) {
      heli.y += dt * 8;
      heli.x += dt * 30;
      if (heli.y > 90) heli.group.visible = false;
    }
    if (!heli.group.visible) return;
    const p = game.player.actor;
    if (want) {
      heli.angle += dt * 0.35;
      const tx = p.x + Math.cos(heli.angle) * 38;
      const tz = p.z + Math.sin(heli.angle) * 38;
      heli.x += (tx - heli.x) * Math.min(1, dt * 0.8);
      heli.z += (tz - heli.z) * Math.min(1, dt * 0.8);
      heli.y += (24 - heli.y) * Math.min(1, dt * 0.5);
      heli.cooldown -= dt;
      if (heli.cooldown <= 0 && wanted.stars >= 5) {
        heli.cooldown = 0.25;
        const gunner = { x: heli.x, y: heli.y - 3, z: heli.z, heading: Math.atan2(p.x - heli.x, p.z - heli.z), weapon: 4 };
        if (rand.chance(0.35)) game.combat.npcShoot(gunner, p, 0.2);
      }
    }
    heli.group.position.set(heli.x, heli.y, heli.z);
    heli.group.rotation.y = Math.atan2(p.x - heli.x, p.z - heli.z);
    heli.group.rotation.x = 0.12;
    heli.rotor.rotation.y += dt * 40;
    heli.rotor2.rotation.y = heli.rotor.rotation.y + Math.PI / 2;
    heli.lightTarget.position.set(p.x, 0, p.z);
    heli.light.intensity = game.sky.state.night > 0.4 ? 900 : 0;
  }

  function update(dt) {
    const p = game.player.actor;
    const px = p.x;
    const pz = p.z;
    // Is the player seen right now?
    wanted.seen = wanted.stars > 0 && copSees(px, pz);
    if (wanted.stars > 0) {
      if (wanted.seen) {
        wanted.unseen = 0;
        wanted.lastKnown = { x: px, z: pz };
      } else {
        wanted.unseen += dt;
        if (wanted.unseen > CRIME.searchTime + wanted.stars * 3 && !wanted.locked) {
          clear();
          game.events.emit('wantedLost');
        }
      }
    } else {
      wanted.heat = Math.max(0, wanted.heat - dt * 2);
    }
    wanted.flash = wanted.stars > 0 && !wanted.seen;

    // Keep the right number of cruisers on the hunt.
    const hunting = game.vehicles.filter((v) => v.police === 'chase' && !v.dead);
    const need = POLICE.carsPerStar[wanted.stars];
    if (hunting.length < need && rand.chance(dt * 1.5)) spawnCruiser('chase');
    patrolTimer -= dt;
    const patrols = game.vehicles.filter((v) => v.police === 'patrol' && !v.dead).length;
    if (patrolTimer <= 0 && patrols < 2) {
      patrolTimer = 6;
      spawnCruiser('patrol');
    }

    let sirenDistance = Infinity;
    for (const v of game.vehicles) {
      if (!v.spec.police || v.dead) continue;
      if (v.police === 'chase' && v.driver === 'police') {
        if (wanted.stars === 0) v.police = 'patrol';
        else chase(v, dt);
      } else if (v.police === 'patrol' && v.driver === 'police') {
        if (wanted.stars > 0 && Math.hypot(v.x - px, v.z - pz) < 120) {
          v.police = 'chase';
          v.persistent = true;
          v.ai = { route: [], routeTimer: 0 };
        } else if (v.ai?.to) driveTraffic(game, v, dt);
        else {
          const n = nearestNode(v.x, v.z);
          startCruising(v, n, rand.pick(neighbours(n.i, n.j)));
        }
      } else if (v.police === 'parked' && wanted.stars === 0 && Math.hypot(v.x - px, v.z - pz) > 120) {
        removeVehicle(game, v);
        continue;
      }
      v.siren = v.police === 'chase' && v.driver === 'police';
      if (v.siren) sirenDistance = Math.min(sirenDistance, Math.hypot(v.x - px, v.z - pz));
    }
    if (heli.group.visible) sirenDistance = Math.min(sirenDistance, Math.hypot(heli.x - px, heli.z - pz) * 1.5);

    // Officers on foot; extra ones join at higher stars near the player.
    let onFoot = 0;
    for (const a of [...game.actors]) {
      if (a.role !== 'cop' || a.dead) continue;
      onFoot += 1;
      updateCop(a, dt);
    }
    void onFoot;
    for (const a of [...game.actors]) {
      if (a.role === 'cop' && a.dead && a.deadTime > 30 && Math.hypot(a.x - px, a.z - pz) > 50) removeActor(game, a);
    }

    // Busted: an officer right beside a player who is on foot (or stopped in a car) and not fighting.
    let close = false;
    for (const a of game.actors) {
      if (a.role === 'cop' && !a.dead && a.state !== 'patrol' && Math.hypot(a.x - px, a.z - pz) < 1.8) close = true;
    }
    const slow = game.player.vehicle ? Math.abs(game.player.vehicle.speed) < 1 : p.moveSpeed < 3;
    if (wanted.stars > 0 && wanted.stars <= 2 && close && slow && !p.dead) {
      wanted.bust += dt;
      if (wanted.bust > POLICE.bustTime) {
        wanted.bust = 0;
        game.events.emit('busted');
      }
    } else wanted.bust = Math.max(0, wanted.bust - dt);

    updateHeli(dt);
    return sirenDistance;
  }

  return { wanted, crime, setStars, clear, update, copSees, heli, spawnCruiser };
}
