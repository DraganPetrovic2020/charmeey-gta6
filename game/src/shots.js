// Screenshot scenes behind ?shot=<name>. Each one starts the real game, sets up a moment of play
// (a mission step, a wanted level, a car on a road) and then runs the real simulation forward,
// with a simple autopilot standing in for the player's hands, so the picture is the game's own.
import { CITY } from './config.js';
import { nodeCoord } from './citymap.js';
import { enterVehicle, giveWeapon } from './player.js';
import { spawnVehicle } from './vehicles.js';
import { startCruising, steerToward } from './traffic.js';
import { updatePlayer } from './player.js';

const STEP = 1 / 60;

function run(game, seconds, each) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    each?.(i * STEP);
    game.step(STEP, false);
  }
}

/** A fake input that holds the given mouse buttons and nothing else. */
function fakeInput(game, { aim = false, fire = false } = {}) {
  const input = game.input;
  input.mouse.aim = aim;
  input.mouse.fire = fire;
}

function chaseScene(game) {
  game.newGame();
  game.hour = 15.6;
  game.progress.money = 18450;
  game.progress.mission = 3;
  game.missions.forceStart(3);
  const car = game.missions.state.missionCar;
  const x = nodeCoord(10) - CITY.lane;
  const z = 240;
  car.x = x;
  car.z = z;
  car.heading = 0;
  enterVehicle(game, car);
  game.missions.skipTo(3);
  game.police.setStars(3);
  for (const [dx, dz] of [[0, -13], [7.2, -21], [0, -33]]) {
    const cop = spawnVehicle(game, 'cruiser', x + dx, z + dz, 0, { driver: 'police' });
    cop.police = 'chase';
    cop.persistent = true;
    cop.ai = { route: [], routeTimer: 0 };
    cop.vx = 0;
    cop.vz = 33;
  }
  // Evening traffic on the boulevard, both ways.
  for (const [lane, dz, model] of [[-1, 90, 'cab'], [-1, 160, 'brava'], [1, 120, 'mule'], [-1, 230, 'cabana'], [1, 210, 'brava']]) {
    const tx = nodeCoord(10) + lane * CITY.lane;
    // Right-hand traffic: the -x lane runs south (+z), the +x lane runs north.
    const t = spawnVehicle(game, model, tx, z + dz, lane > 0 ? Math.PI : 0, { driver: 'ai' });
    startCruising(t, lane > 0 ? { i: 10, j: 6 } : { i: 10, j: 2 }, lane > 0 ? { i: 10, j: 5 } : { i: 10, j: 3 });
    t.vz = lane > 0 ? -12 : 10;
  }
  car.vz = 34;
  run(game, 1.6, () => steerToward(car, x, car.z + 30, 42, STEP));
  // The player has swung the camera round with the mouse to watch the cruisers close in.
  game.camRig.yaw = Math.PI - 0.55;
  game.camRig.pitch = 0.22;
  game.camRig.idle = 0;
  game.camRig.snap(game.player.actor, car);
}

function titleScene(game, menus) {
  game.resetWorld(CITY.size + 12, 470, Math.PI);
  game.player.actor.hidden = true;
  game.hour = 17.7;
  run(game, 2);
  const cx = CITY.size - 40;
  game.camera.position.set(cx + Math.cos(0.4) * 120, 44, 470 + Math.sin(0.4) * 120);
  game.camera.lookAt(cx - 30, 14, 470);
  menus.showTitle();
  game.hud.show(false);
}

function combatScene(game) {
  game.newGame();
  game.hour = 16.2;
  game.progress.money = 9200;
  game.missions.forceStart(4);
  const a = game.player.actor;
  a.x = 372;
  a.z = nodeCoord(10) + 1.5;
  a.heading = -Math.PI / 2;
  a.health = 74;
  a.armor = 40;
  game.missions.skipTo(1);
  // The Syndicate gunmen have spotted Nico and spread out across the dock road.
  const spots = [[-13, -4], [-19, 5], [-25, -1], [-31, 7], [-38, -5], [-46, 2], [-55, 6]];
  game.missions.state.stepState.targets.forEach((t, i) => {
    t.x = a.x + spots[i][0];
    t.z = a.z + spots[i][1];
    t.brain.home = { x: t.x, z: t.z };
    t.state = 'attack';
  });
  giveWeapon(game.player, 2, 160);
  game.player.current = 2;
  game.camRig.yaw = -Math.PI / 2 + 0.1;
  game.camRig.pitch = 0.05;
  game.camRig.snap(a, null);
  fakeInput(game, { aim: true, fire: true });
  run(game, 0.75, () => {
    updatePlayer(game, STEP, game.input, game.camRig);
    game.combat.updatePlayer(STEP, true, false, true, game.camera);
    game.camRig.update(STEP, a, null, true);
  });
}

function mapScene(game, menus) {
  game.newGame();
  game.hour = 13.5;
  game.progress.mission = 3;
  game.progress.money = 7340;
  game.progress.tapes = game.progress.tapes.map((t, i) => i % 3 === 0);
  Object.assign(game.stats, { carsStolen: 23, driven: 41800, maxStars: 4, wasted: 2, busted: 1, kills: 31 });
  const a = game.player.actor;
  a.x = nodeCoord(4);
  a.z = nodeCoord(5) + 20;
  game.missions.refreshGiver();
  run(game, 0.5);
  game.camRig.snap(a, null);
  menus.openPause();
}

/** On foot on an Old Town sidewalk among the crowd, at a given hour. */
function streetScene(game, hour) {
  game.newGame();
  game.missions.reset();
  game.hour = hour;
  const a = game.player.actor;
  a.x = nodeCoord(3) + 10;
  a.z = nodeCoord(6) + 5;
  for (let i = 0; i < 20; i += 1) game.peds.update(0.5);
  run(game, 3);
  game.camRig.yaw = 0.6;
  game.camRig.pitch = 0.12;
  game.camRig.snap(a, null);
}

export async function stageShot(name, game, menus) {
  if (name === 'title') titleScene(game, menus);
  else if (name === 'combat') combatScene(game);
  else if (name === 'map') mapScene(game, menus);
  else if (name === 'street') streetScene(game, 11);
  else if (name === 'night') streetScene(game, 21.5);
  else chaseScene(game);
  if (name !== 'title') {
    menus.hideTitle();
    game.hud.show(true);
    game.hud.clearBig();
    for (let i = 0; i < 30; i += 1) game.hud.update(game, 0.1);
    game.minimap.draw(0.1, game.camRig.yaw);
  }
}
