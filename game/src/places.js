// The places the player can use between missions: the safehouse bed (save the game and heal),
// Iron Coast Arms (the weapon shop), and Fresh Coat Garage (drive in, pay, and the paint job
// and repair lose the police).
import { PLAYER } from './config.js';

const RESPRAY_PRICE = 250;

export function createPlaces(game) {
  const places = game.map.places;
  const markers = [];
  let busy = 0;

  function placeMarkers() {
    markers.push(game.markers.column(places.safehouse.x, places.safehouse.z, 1.2, 0x5fe3ff, 2));
    markers.push(game.markers.column(places.gunshop.x, places.gunshop.z, 1.2, 0xff8c42, 2));
    markers.push(game.markers.column(places.respray.curb.x, places.respray.curb.z, 3.4, 0xffd23f, 2.5));
  }

  function update(dt, input) {
    busy -= dt;
    const player = game.player;
    const a = player.actor;
    if (a.dead || game.missions.inCutscene) return;
    const near = (p, r) => Math.hypot(a.x - p.x, a.z - p.z) < r;
    const use = input.pressed('KeyE');
    if (!player.vehicle && near(places.safehouse, 1.8)) {
      game.hud.hint('<kbd>E</kbd> Rest and save the game');
      if (use && busy <= 0) {
        busy = 1;
        a.health = PLAYER.maxHealth;
        game.saveGame(false);
      }
    }
    if (!player.vehicle && near(places.gunshop, 1.8)) {
      game.hud.hint('<kbd>E</kbd> Browse Iron Coast Arms');
      if (use && busy <= 0) {
        busy = 0.5;
        game.menus.openShop();
      }
    }
    const v = player.vehicle;
    if (v && near(places.respray.curb, 4)) {
      const stars = game.police.wanted.stars;
      if (stars === 0 && v.health >= v.spec.health) game.hud.hint('Fresh Coat Garage: come back when the car needs it');
      else if (game.police.wanted.seen && stars > 0) game.hud.hint('Fresh Coat Garage: not while the cops are watching!');
      else if (game.progress.money < RESPRAY_PRICE) game.hud.hint(`Fresh Coat Garage: a respray costs $${RESPRAY_PRICE}`);
      else if (Math.abs(v.speed) < 3 && busy <= 0) {
        busy = 3;
        game.addMoney(-RESPRAY_PRICE);
        game.police.clear();
        v.health = v.spec.health;
        v.burn = 0;
        const colors = v.spec.colors.filter((c) => c !== v.color);
        const fresh = colors.length ? colors[Math.floor(Math.random() * colors.length)] : v.color;
        v.color = fresh;
        repaint(v, fresh);
        game.hud.bigMessage('FRESH COAT', `New paint, no heat. -$${RESPRAY_PRICE}`, 'gold');
        game.audio.cash();
      }
    }
  }

  function repaint(v, color) {
    const colors = v.model.body.geometry.attributes.color;
    const target = new game.THREE.Color(color);
    const old = new game.THREE.Color(v.model.originalPaint ?? v.paintColor ?? 0);
    v.model.originalPaint = color;
    for (let i = 0; i < colors.count; i += 1) {
      if (Math.abs(colors.getX(i) - old.r) < 0.02 && Math.abs(colors.getY(i) - old.g) < 0.02 && Math.abs(colors.getZ(i) - old.b) < 0.02) colors.setXYZ(i, target.r, target.g, target.b);
    }
    colors.needsUpdate = true;
  }

  return { placeMarkers, update };
}
