// Assembles Palmera Heat: renderer, scene, city, sky, every system, and the shared game object
// they all talk through. Also starting a new game, loading a save, one simulation step, the
// consequences of dying or being busted, and drawing a frame.
import * as THREE from '../vendor/three.min.js';
import { CITY, DAY_SECONDS, PLAYER, START_HOUR, WEAPONS } from './config.js';
import { createCityMap } from './citymap.js';
import { createTextures } from './textures.js';
import { buildCity } from './cityMeshes.js';
import { createCollision } from './collision.js';
import { createSky } from './sky.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createMarkers } from './markers.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createPedestrians } from './pedestrians.js';
import { createPickups } from './pickups.js';
import { createMissions } from './missions.js';
import { createPlaces } from './places.js';
import { createActivities } from './activities.js';
import { createEvents } from './events.js';
import { createCameraRig } from './camera.js';
import { createPlayer, exitVehicle } from './player.js';
import { removeVehicle, spawnVehicle, updateVehicles } from './vehicles.js';
import { checkVehicleHits, damageActor, removeActor, updateActorBodies } from './characters.js';
import { updateTraffic, panicTraffic } from './traffic.js';
import { updateGangMember } from './gangs.js';
import { setPoliceFlash, setVehicleNightLights } from './models.js';
import { writeSave } from './save.js';
import { rand } from './rng.js';

export function createGame(canvas, input) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.2, 3200);

  const map = createCityMap(7);
  const textures = createTextures();
  const city = buildCity(map, textures);
  scene.add(city.group);
  const collision = createCollision(map);
  const sky = createSky(scene, renderer);

  const game = {
    THREE, renderer, scene, camera, map, collision, sky, input,
    events: createEvents(),
    vehicles: [],
    actors: [],
    player: null,
    time: 0,
    hour: START_HOUR,
    trafficTarget: 22,
    pedTarget: 40,
    radioOn: true,
    progress: { mission: 0, passed: [], tapes: new Array(12).fill(false), money: 0 },
    stats: { carsStolen: 0, driven: 0, maxStars: 0, wasted: 0, busted: 0, kills: 0 },
    clockRunning: true,
    death: null,
  };
  game.effects = createEffects(scene);
  game.audio = createAudio();
  game.markers = createMarkers(scene);
  game.hud = createHud();
  game.camRig = createCameraRig(camera, collision);
  game.cameraShake = (amount) => game.camRig.addShake(amount);
  game.combat = createCombat(game);
  game.police = createPolice(game);
  game.crime = (...args) => game.police.crime(...args);
  game.peds = createPedestrians(game);
  game.pickups = createPickups(game);
  game.missions = createMissions(game);
  game.places = createPlaces(game);
  game.activities = createActivities(game);
  game.minimap = createMinimap(document.getElementById('radar'), game);

  // Headlights for the player's car after dark.
  const headlight = new THREE.SpotLight(0xfff1d0, 0, 60, 0.5, 0.6, 1.2);
  scene.add(headlight, headlight.target);
  game.updateHeadlight = () => {
    const v = game.player?.vehicle;
    const on = !!v && sky.state.night > 0.35;
    headlight.intensity = on ? 220 : 0;
    if (!on) return;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    headlight.position.set(v.x + fx * 2.2, 1.0, v.z + fz * 2.2);
    headlight.target.position.set(v.x + fx * 20, 0, v.z + fz * 20);
  };

  game.addMoney = (amount, toast = true) => {
    game.progress.money = Math.max(0, game.progress.money + amount);
    game.hud.bumpMoney();
    if (amount > 0) {
      game.audio.cash();
      if (toast) game.hud.toast(`+$${amount}`, 'good');
    }
  };

  game.saveGame = (auto) => {
    const ok = writeSave(game);
    game.hud.toast(ok ? (auto ? 'Autosaved' : 'Game saved') : 'Could not save (storage is off)', ok ? 'good' : 'bad');
  };

  // Rewards, stats and reactions that tie systems together.
  game.events.on('actorKilled', ({ actor, source }) => {
    if (actor.isPlayer) {
      game.events.emit('playerDied');
      return;
    }
    if (source === 'player') game.stats.kills += 1;
    if (actor.role === 'gang' || actor.role === 'boss') game.pickups.spawn('cash', actor.x, actor.z, { amount: actor.role === 'boss' ? 2500 : rand.int(60, 180) });
    else if (actor.role === 'civilian' && rand.chance(0.35)) game.pickups.spawn('cash', actor.x, actor.z, { amount: rand.int(10, 60) });
    else if (actor.role === 'cop' && rand.chance(0.5)) game.pickups.spawn('weapon', actor.x, actor.z, { weapon: actor.weapon || 1, ammo: 14 });
  });
  game.events.on('enteredVehicle', (v) => {
    if (!v.everPlayer) {
      v.everPlayer = true;
      game.stats.carsStolen += 1;
    }
  });
  game.events.on('vehicleExploded', (v) => {
    panicTraffic(game, v.x, v.z, 60);
    if (game.player && game.player.vehicle === v) {
      exitVehicle(game);
      damageActor(game, game.player.actor, 70, null, 0, 0);
    }
  });
  game.events.on('gunfire', ({ x, z }) => panicTraffic(game, x, z, 35));

  function clearWorld() {
    for (const v of [...game.vehicles]) removeVehicle(game, v);
    for (const a of [...game.actors]) removeActor(game, a);
    game.markers.clearAll();
    game.pickups.clearAll();
    game.police.clear();
    game.police.wanted.heat = 0;
    game.missions.reset();
    game.activities.stop('');
    game.hud.objective('');
  }

  /** Builds a fresh world around a starting point. */
  game.resetWorld = (x, z, heading) => {
    clearWorld();
    game.player = createPlayer(game, x, z, heading);
    game.camRig.yaw = heading;
    game.places.placeMarkers();
    game.pickups.populate();
    game.missions.refreshGiver();
    // Fill the streets at once rather than waiting for them to trickle in.
    for (let i = 0; i < 14; i += 1) updateTraffic(game, 0.5);
    game.camRig.snap(game.player.actor, null);
  };

  game.newGame = () => {
    game.progress = { mission: 0, passed: [], tapes: new Array(12).fill(false), money: 200 };
    game.stats = { carsStolen: 0, driven: 0, maxStars: 0, wasted: 0, busted: 0, kills: 0 };
    game.hour = START_HOUR;
    const start = map.places.busStation;
    game.resetWorld(start.x, start.z, -Math.PI / 2);
    // An unlocked sedan waits at the depot curb for Nico's first ride.
    const curb = start.curb;
    const ride = spawnVehicle(game, 'brava', curb.x - 1.6, curb.z + 9, 0, { driver: null, color: 0x2f4f6f });
    ride.parked = true;
  };

  game.loadGame = (save) => {
    game.progress = { ...save.progress };
    game.stats = { ...game.stats, ...save.stats };
    game.hour = save.hour;
    const p = save.player;
    game.resetWorld(p.x, p.z, p.heading);
    const player = game.player;
    player.actor.health = p.health;
    player.actor.armor = p.armor;
    player.owned = p.owned;
    player.ammo = p.ammo;
    player.clip = p.clip;
    player.current = p.current;
  };

  /** Respawns after WASTED (at the hospital) or BUSTED (at the police station). */
  game.respawn = (kind) => {
    const player = game.player;
    const place = kind === 'busted' ? map.places.police : map.places.hospital;
    if (player.vehicle) exitVehicle(game);
    const a = player.actor;
    a.dead = false;
    a.health = PLAYER.maxHealth;
    a.armor = 0;
    a.x = place.x;
    a.z = place.z;
    a.vx = a.vz = 0;
    a.heading = place.side === 'n' ? Math.PI : place.side === 's' ? 0 : place.side === 'e' ? Math.PI / 2 : -Math.PI / 2;
    if (kind === 'busted') {
      for (let i = 1; i < WEAPONS.length; i += 1) {
        player.ammo[i] = 0;
        player.clip[i] = 0;
        player.owned[i] = false;
      }
      player.current = 0;
    }
    game.police.clear();
    game.camRig.yaw = a.heading;
    game.camRig.snap(a, null);
    game.hour = (game.hour + 2) % 24;
  };

  function updateNightLights() {
    const night = sky.state.night;
    for (const m of city.nightMaterials) m.emissiveIntensity = m.emissiveMap === m.map ? 0.12 + night * 0.8 : night * 0.55;
    city.lampMaterial.emissiveIntensity = night * 4;
    city.poolMaterial.opacity = Math.max(0, night - 0.15) * 0.9;
    setVehicleNightLights(night);
  }

  /** One simulation step. `controls` is false on the title screen and during cutscenes. */
  game.step = (dt, controls) => {
    game.time += dt;
    if (game.clockRunning) game.hour = (game.hour + (dt * 24) / DAY_SECONDS) % 24;
    const player = game.player;
    if (player.vehicle) {
      player.actor.x = player.vehicle.x;
      player.actor.z = player.vehicle.z;
      player.actor.heading = player.vehicle.heading;
    }
    const before = player.vehicle ? { x: player.vehicle.x, z: player.vehicle.z } : null;
    if (controls && !player.actor.dead) {
      game.combat.updatePlayer(dt, input.mouse.fire, input.mouse.firePressed, input.mouse.aim, camera);
    }
    updateTraffic(game, dt);
    game.peds.update(dt);
    for (const a of game.actors) if ((a.role === 'gang' || a.role === 'boss') && !a.dead) updateGangMember(game, a, dt);
    game.sirenDistance = game.police.update(dt);
    updateVehicles(game, dt);
    checkVehicleHits(game);
    updateActorBodies(game, dt);
    game.pickups.update(dt);
    game.markers.update(dt);
    game.effects.update(dt);
    if (before && player.vehicle) game.stats.driven += Math.hypot(player.vehicle.x - before.x, player.vehicle.z - before.z);
    game.stats.maxStars = Math.max(game.stats.maxStars, game.police.wanted.stars);
    // Falling into the sea off the beach is fatal.
    const a = player.actor;
    if (!a.dead && a.x > CITY.size + CITY.beach - 14) damageActor(game, a, 200, null);
  };

  game.render = (dt) => {
    const a = game.player.actor;
    sky.update(game.hour, new THREE.Vector3(a.x, 0, a.z));
    updateNightLights();
    setPoliceFlash(game.time);
    game.updateHeadlight();
    city.water.material.map.offset.x = (game.time * 0.004) % 1;
    city.water.material.map.offset.y = (game.time * 0.002) % 1;
    game.audio.setListener(a.x, a.z);
    renderer.render(scene, camera);
    void dt;
  };

  game.resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  game.resize();
  window.addEventListener('resize', game.resize);
  return game;
}
