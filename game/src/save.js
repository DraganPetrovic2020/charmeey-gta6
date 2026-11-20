// Saving and loading in the browser's localStorage: story progress, money, weapons and ammo,
// health and armour, where Nico stands, the hour, found mixtapes and the stats page.
import { SAVE_KEY } from './config.js';

export function writeSave(game) {
  const player = game.player;
  const a = player.actor;
  const data = {
    version: 1,
    savedAt: Date.now(),
    progress: { ...game.progress, tapes: [...game.progress.tapes], passed: [...game.progress.passed] },
    stats: { ...game.stats },
    hour: game.hour,
    player: {
      x: player.vehicle ? player.vehicle.x : a.x,
      z: player.vehicle ? player.vehicle.z : a.z,
      heading: a.heading,
      health: Math.max(1, a.health),
      armor: a.armor,
      owned: player.owned,
      ammo: player.ammo.map((n) => (Number.isFinite(n) ? n : -1)),
      clip: player.clip.map((n) => (Number.isFinite(n) ? n : -1)),
      current: player.current,
    },
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1) return null;
    data.player.ammo = data.player.ammo.map((n) => (n < 0 ? Infinity : n));
    data.player.clip = data.player.clip.map((n) => (n < 0 ? Infinity : n));
    return data;
  } catch {
    return null;
  }
}

export function describeSave(data) {
  if (!data) return '';
  const when = new Date(data.savedAt);
  const missions = data.progress.mission;
  return `Saved ${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${missions}/7 missions · $${data.progress.money.toLocaleString('en-US')}`;
}
