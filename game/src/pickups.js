// Pickups lying around Palmera Keys: health, body armour, cash, weapons and the twelve lost
// Sunwave mixtapes to collect, plus mission items. They spin, glow, and are taken by walking
// (or driving, for cash and tapes) through them; health and armour come back after a while.
import * as THREE from '../vendor/three.min.js';
import { CITY, PLAYER, WEAPONS } from './config.js';
import { giveWeapon } from './player.js';

const KINDS = {
  health: { color: 0xff3355, label: 'Health' },
  armor: { color: 0x3fa7ff, label: 'Body Armour' },
  cash: { color: 0x5dff7a, label: 'Cash' },
  weapon: { color: 0xffb03a, label: 'Weapon' },
  tape: { color: 0xff5fd2, label: 'Mixtape' },
  item: { color: 0xffe34a, label: 'Item' },
};

const shapes = {
  health: new THREE.BoxGeometry(0.7, 0.7, 0.25),
  armor: new THREE.OctahedronGeometry(0.45),
  cash: new THREE.BoxGeometry(0.7, 0.3, 0.45),
  weapon: new THREE.BoxGeometry(0.2, 0.3, 0.9),
  tape: new THREE.BoxGeometry(0.7, 0.45, 0.12),
  item: new THREE.BoxGeometry(0.8, 0.55, 0.25),
};

/** Where the twelve mixtapes are hidden: parks, alleys, the beach and the docks. */
export const TAPE_SPOTS = [
  [CITY.size + 40, 120], [CITY.size + 30, 610], [5 * 88 + 52, 88 + 52], [16 + 36, 3 * 88 + 52],
  [7 * 88 + 44, 6 * 88 + 60], [9 * 88 + 52, 4 * 88 + 52], [60, CITY.size + 20], [3 * 88 + 52, CITY.size + 18],
  [2 * 88 + 52, 2 * 88 + 52], [6 * 88 + 46, 8 * 88 + 48], [4 * 88 + 8, 9 * 88 + 8], [8 * 88 + 8, 1 * 88 + 30],
];

export function createPickups(game) {
  const list = [];

  function spawn(kind, x, z, data = {}) {
    const def = KINDS[kind];
    const material = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.55, roughness: 0.4 });
    const mesh = new THREE.Mesh(shapes[kind], material);
    mesh.castShadow = true;
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.6, depthWrite: false, fog: false }));
    glow.position.y = 0.2;
    const group = new THREE.Group();
    group.add(mesh, glow);
    group.position.set(x, 0, z);
    game.scene.add(group);
    const p = { kind, x, z, data, group, mesh, active: true, respawn: 0, t: Math.random() * 6 };
    list.push(p);
    return p;
  }

  function remove(p) {
    game.scene.remove(p.group);
    const i = list.indexOf(p);
    if (i >= 0) list.splice(i, 1);
  }

  function collect(p) {
    const player = game.player;
    const a = player.actor;
    switch (p.kind) {
      case 'health':
        if (a.health >= PLAYER.maxHealth) return false;
        a.health = Math.min(PLAYER.maxHealth, a.health + 50);
        game.hud.toast('+50 Health', 'good');
        break;
      case 'armor':
        if (a.armor >= PLAYER.maxArmor) return false;
        a.armor = Math.min(PLAYER.maxArmor, a.armor + 50);
        game.hud.toast('+50 Armour', 'good');
        break;
      case 'cash':
        game.addMoney(p.data.amount ?? 100);
        break;
      case 'weapon': {
        const w = WEAPONS[p.data.weapon];
        giveWeapon(player, p.data.weapon, p.data.ammo ?? w.mag * 3);
        game.hud.toast(`${w.name} picked up`, 'good');
        break;
      }
      case 'tape': {
        game.progress.tapes[p.data.id] = true;
        const found = game.progress.tapes.filter(Boolean).length;
        game.addMoney(250);
        game.hud.toast(`Sunwave mixtape ${found}/12 found`, 'tape');
        if (found === 12) {
          game.addMoney(10000);
          game.hud.bigMessage('ALL MIXTAPES FOUND', 'The Gulf Carbine is now free at Iron Coast Arms', 'gold');
        }
        break;
      }
      case 'item':
        game.events.emit('itemCollected', p.data.id);
        game.hud.toast(p.data.label ?? 'Got it', 'good');
        break;
      default:
        break;
    }
    game.audio.pickup();
    return true;
  }

  /** The fixed pickups placed when a game starts or loads. */
  function populate() {
    const places = game.map.places;
    spawn('health', places.hospital.x, places.hospital.z + 5, { respawn: 40 });
    spawn('health', places.safehouse.x, places.safehouse.z + 6, { respawn: 60 });
    spawn('armor', places.police.x + 6, places.police.z + 1, { respawn: 90 });
    spawn('armor', 5 * 88 + 52, 1 * 88 + 40, { respawn: 90 });
    spawn('weapon', places.safehouse.x + 1, places.safehouse.z - 6, { weapon: 1, ammo: 42, respawn: 120 });
    spawn('weapon', 7 * 88 + 40, 6 * 88 + 40, { weapon: 2, ammo: 96, respawn: 180 });
    spawn('weapon', 2 * 88 + 18, 9 * 88 + 30, { weapon: 3, ammo: 18, respawn: 180 });
    spawn('health', 0 * 88 + 52, 3 * 88 + 40, { respawn: 60 });
    spawn('health', CITY.size + 22, 400, { respawn: 60 });
    TAPE_SPOTS.forEach(([x, z], id) => {
      if (!game.progress.tapes[id]) spawn('tape', x, z, { id });
    });
  }

  function update(dt) {
    const a = game.player.actor;
    const inCar = !!game.player.vehicle;
    for (const p of [...list]) {
      p.t += dt;
      if (!p.active) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          p.active = true;
          p.group.visible = true;
        }
        continue;
      }
      p.mesh.position.y = 1 + Math.sin(p.t * 2.5) * 0.15;
      p.mesh.rotation.y += dt * 2;
      const reach = inCar ? 3 : 1.3;
      if (inCar && !(p.kind === 'cash' || p.kind === 'tape' || p.kind === 'item')) continue;
      if (a.dead || Math.hypot(a.x - p.x, a.z - p.z) > reach) continue;
      if (!collect(p)) continue;
      if (p.data.respawn) {
        p.active = false;
        p.respawn = p.data.respawn;
        p.group.visible = false;
      } else remove(p);
    }
  }

  function clearAll() {
    for (const p of [...list]) remove(p);
  }

  return { spawn, remove, update, populate, clearAll, list };
}
