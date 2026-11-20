// Boot and the main loop of Palmera Heat. Moves between the title screen (a slow flight over the
// beachfront at sunset), play, the pause menu and the WASTED / BUSTED cards; feeds the mouse to
// the camera and the keys to the player; runs the world in short fixed steps; draws the HUD.
//
// ?shot=<name>&seed=<n> stages a screenshot scene instead (see shots.js) and sets
// window.__shotReady once it is painted.
import { CITY } from './config.js';
import { createInput } from './input.js';
import { createGame } from './game.js';
import { createMenus } from './menus.js';
import { readSave } from './save.js';
import { updatePlayer } from './player.js';
import { reseedLive } from './rng.js';
import { stageShot } from './shots.js';

const SUBSTEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '', 10);
if (Number.isInteger(seed)) reseedLive(seed);

const canvas = document.getElementById('game');
const input = createInput(canvas);
const game = createGame(canvas, input);
let screen = 'title';
let titleAngle = 0;

const menus = createMenus(game, {
  newGame() {
    game.newGame();
    startPlay();
    game.hud.bigMessage('PALMERA KEYS', 'Walk into the pink marker to start the story', 'title');
  },
  continueGame() {
    const save = readSave();
    if (!save) return;
    game.loadGame(save);
    startPlay();
    game.hud.toast('Welcome back to Palmera Keys', 'good');
  },
  resume() {
    menus.closePause();
    screen = 'play';
    input.lockPointer();
  },
  quit() {
    menus.closePause();
    showTitle();
  },
});
game.menus = menus;
game.input = input;
window.__game = game;

function startPlay() {
  screen = 'play';
  menus.hideTitle();
  game.hud.show(true);
  game.audio.init();
  input.lockPointer();
  game.player.actor.hidden = false;
}

function showTitle() {
  screen = 'title';
  game.hud.show(false);
  input.releasePointer();
  // A living city to fly over behind the logo.
  game.resetWorld(CITY.size + 12, 470, Math.PI);
  game.player.actor.hidden = true;
  game.hour = 17.6;
  menus.showTitle();
}

canvas.addEventListener('click', () => {
  game.audio.init();
  if (screen === 'play' && !menus.state.shopOpen) input.lockPointer();
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && screen === 'play' && !menus.state.shopOpen && !game.missions.inCutscene && !game.death) openPause();
});

function openPause() {
  screen = 'pause';
  input.releasePointer();
  menus.openPause();
}

game.events.on('busted', () => {
  if (game.death) return;
  game.death = { kind: 'busted', t: 0 };
  game.stats.busted += 1;
  const fine = Math.min(game.progress.money, 500);
  game.addMoney(-fine);
  menus.showDeath('busted', `PKPD kept your weapons and a $${fine} fine.`);
});
game.events.on('playerDied', () => {
  if (game.death) return;
  game.death = { kind: 'wasted', t: 0 };
  game.stats.wasted += 1;
  const bill = Math.min(game.progress.money, 300);
  game.addMoney(-bill);
  canvas.classList.add('dead');
  menus.showDeath('wasted', `Bayview Medical sends a bill for $${bill}.`);
});

function simulate(dt, controls) {
  const steps = Math.max(1, Math.ceil(dt / SUBSTEP - 0.01));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) game.step(h, controls);
}

function titleFrame(dt) {
  titleAngle += dt * 0.05;
  const cx = CITY.size - 40;
  const cz = 470;
  game.camera.position.set(cx + Math.cos(titleAngle) * 120, 42 + Math.sin(titleAngle * 0.7) * 8, cz + Math.sin(titleAngle) * 120);
  game.camera.lookAt(cx - 30, 14, cz);
  game.camera.fov = 55;
  game.camera.updateProjectionMatrix();
  const a = game.player.actor;
  a.x = cx;
  a.z = cz;
  simulate(dt, false);
}

function playFrame(dt) {
  const player = game.player;
  if (input.pressed('Escape') || input.pressed('KeyP')) {
    if (menus.state.shopOpen) menus.closeShop();
    else if (!game.death) {
      openPause();
      return;
    }
  }
  if (input.pressed('KeyT')) {
    game.radioOn = game.audio.toggleRadio();
    game.hud.toast(game.radioOn ? 'Radio on: Sunwave FM 88.4' : 'Radio off');
  }
  let controls = false;
  if (player.vehicle) {
    // With the player's hands off the wheel (menus, cutscenes, death) the car rolls to a stop.
    const c = player.vehicle.controls;
    c.throttle = 0;
    c.brake = 1;
    c.steer = 0;
  }
  if (game.death) {
    game.death.t += dt;
    dt *= game.death.kind === 'wasted' ? 0.35 : 0.5;
    if (game.death.t > 3.6) {
      game.respawn(game.death.kind);
      game.death = null;
      canvas.classList.remove('dead');
      menus.hideDeath();
    }
  } else if (menus.state.shopOpen) {
    menus.updateShop(input);
    if (!menus.state.shopOpen) input.lockPointer();
  } else if (game.missions.inCutscene) {
    const skip = input.pressed('Space') || input.pressed('Enter') || input.mouse.firePressed;
    game.missions.update(dt, skip);
  } else {
    controls = true;
    game.camRig.turn(input.mouse.dx, input.mouse.dy);
    updatePlayer(game, dt, input, game.camRig);
    game.missions.update(dt, false);
    game.places.update(dt, input);
  }
  simulate(dt, controls);
  const aiming = controls && !player.vehicle && player.current !== 0 && (input.mouse.aim || input.mouse.fire);
  game.camRig.update(dt, player.actor, player.vehicle, aiming);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (screen === 'title') titleFrame(dt);
  else if (screen === 'play') playFrame(dt);
  if (screen === 'pause' && (input.pressed('Escape') || input.pressed('KeyP'))) {
    if (menus.controlsOpen) menus.closeControls();
    else {
      menus.closePause();
      screen = 'play';
      input.lockPointer();
    }
  }
  if (screen !== 'title') {
    game.hud.update(game, dt);
    game.minimap.draw(dt, game.camRig.yaw);
  }
  game.audio.update(screen === 'play' ? game.player.vehicle : null, screen === 'play' ? game.sirenDistance ?? Infinity : Infinity, screen !== 'play');
  game.render(dt);
  input.endFrame();
}

if (shot) {
  stageShot(shot, game, menus).then(() => {
    let painted = 0;
    const paint = () => {
      game.render(0);
      painted += 1;
      if (painted < 3) requestAnimationFrame(paint);
      else window.__shotReady = true;
    };
    requestAnimationFrame(paint);
  });
} else {
  showTitle();
  requestAnimationFrame(frame);
}
