// The radar in the corner and the full map on the pause screen: the city painted once onto an
// offscreen canvas, then drawn turned with the camera, with blips for the player, police, mission
// targets, shops and pickups, and a GPS line along the roads to the current waypoint.
import { CITY } from './config.js';
import { DISTRICTS, nearestNode, nodeCoord } from './citymap.js';
import { routeBetween } from './traffic.js';

const SCALE = 1;

function paintCity(map) {
  const w = Math.ceil(CITY.size + CITY.beach + 40);
  const h = Math.ceil(CITY.size + 60);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.translate(20, 20);
  ctx.fillStyle = '#2a6f97';
  ctx.fillRect(-20, -20, w, h);
  ctx.fillStyle = '#d8c7a0';
  ctx.fillRect(CITY.size, -8, CITY.beach - 8, CITY.size + 16);
  ctx.fillStyle = '#3c4148';
  ctx.fillRect(-8, -8, CITY.size + 10, CITY.size + 10);
  ctx.fillRect(-8, CITY.size, CITY.pitch * 5 + 8, 26);
  for (const b of map.blocks) {
    const tint = b.park ? '#5f9a4a' : DISTRICTS[b.district].color;
    ctx.fillStyle = '#9b958a';
    ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    ctx.fillStyle = tint;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(b.x0 + 3, b.z0 + 3, b.x1 - b.x0 - 6, b.z1 - b.z0 - 6);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(40,40,48,0.55)';
  for (const b of map.buildings) ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  ctx.fillStyle = '#55acc8';
  for (const p of map.pools) ctx.fillRect(p.x0, p.z0, p.x1 - p.x0, p.z1 - p.z0);
  // Road centre lines.
  ctx.strokeStyle = 'rgba(255,214,90,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const v = nodeCoord(i);
    ctx.beginPath();
    ctx.moveTo(v, 0);
    ctx.lineTo(v, CITY.size);
    ctx.moveTo(0, v);
    ctx.lineTo(CITY.size, v);
    ctx.stroke();
  }
  return { canvas: c, ox: 20, oy: 20 };
}

const PLACE_ICONS = {
  save: { color: '#5fe3ff', label: 'H' },
  hospital: { color: '#ff4d6d', label: '+' },
  police: { color: '#7fb2ff', label: 'P' },
  respray: { color: '#ffd23f', label: '$' },
  gunshop: { color: '#ff8c42', label: 'G' },
};

export function createMinimap(canvas, game) {
  const ctx = canvas.getContext('2d');
  const city = paintCity(game.map);
  let route = [];
  let routeTimer = 0;
  let routeKey = '';

  function updateRoute(dt, from, to) {
    routeTimer -= dt;
    if (!to) {
      route = [];
      return;
    }
    const key = `${Math.round(to.x)},${Math.round(to.z)}`;
    if (routeTimer > 0 && key === routeKey) return;
    routeTimer = 0.6;
    routeKey = key;
    const a = nearestNode(from.x, from.z);
    const b = nearestNode(to.x, to.z);
    const nodes = routeBetween(a, b);
    route = [{ x: from.x, z: from.z }, ...nodes.map((n) => ({ x: nodeCoord(n.i), z: nodeCoord(n.j) })), { x: to.x, z: to.z }];
  }

  function collectBlips() {
    const out = [];
    for (const p of Object.values(game.map.places)) {
      const icon = PLACE_ICONS[p.kind];
      if (icon) out.push({ x: p.x, z: p.z, color: icon.color, label: icon.label, place: true });
    }
    for (const pk of game.pickups.list) {
      if (pk.active && pk.kind === 'tape') out.push({ x: pk.x, z: pk.z, color: '#ff5fd2', small: true, hideFar: true });
    }
    const flash = Math.floor(game.time * 4) % 2 === 0;
    for (const v of game.vehicles) {
      if (v.spec.police && !v.dead && v.police === 'chase') out.push({ x: v.x, z: v.z, color: flash ? '#ff3355' : '#3f7bff', cop: true });
    }
    for (const a of game.actors) {
      if (a.role === 'cop' && !a.dead && a.state !== 'patrol') out.push({ x: a.x, z: a.z, color: flash ? '#3f7bff' : '#ff3355', small: true });
    }
    if (game.police.heli.group.visible) out.push({ x: game.police.heli.x, z: game.police.heli.z, color: '#3f7bff', label: 'H', cop: true });
    return out.concat(game.missions.blips());
  }

  function drawBlip(b, x, y, size) {
    ctx.beginPath();
    if (b.waypoint) {
      ctx.moveTo(x, y - size * 1.4);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size * 1.4);
      ctx.lineTo(x - size, y);
      ctx.closePath();
    } else ctx.arc(x, y, b.small ? size * 0.5 : b.big ? size * 1.15 : size, 0, Math.PI * 2);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.stroke();
    if (b.label) {
      ctx.fillStyle = '#111';
      ctx.font = `bold ${Math.round(size * 1.3)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, x, y + 0.5);
    }
  }

  /** Draws the round radar centred on the player, turned with the camera. */
  function draw(dt, yaw) {
    const player = game.player;
    const p = player.actor;
    const target = game.missions.waypoint;
    updateRoute(dt, p, target);
    const w = canvas.width;
    const h = canvas.height;
    const speed = player.vehicle ? Math.hypot(player.vehicle.vx, player.vehicle.vz) : 0;
    const zoom = (w / 220) * (1.25 - Math.min(0.55, speed / 70));
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2a6f97';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(yaw + Math.PI);
    ctx.scale(zoom, zoom);
    ctx.translate(-p.x * SCALE, -p.z * SCALE);
    ctx.drawImage(city.canvas, -city.ox, -city.oy);
    if (route.length > 1) {
      ctx.strokeStyle = '#b06cff';
      ctx.lineWidth = 5 / zoom + 2;
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(route[0].x, route[0].z);
      for (const pt of route) ctx.lineTo(pt.x, pt.z);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Blips are drawn upright, clamped to the rim when off the radar.
    const radius = w / 2 - 10;
    const cos = Math.cos(yaw + Math.PI);
    const sin = Math.sin(yaw + Math.PI);
    for (const b of collectBlips()) {
      const dx = (b.x - p.x) * zoom;
      const dz = (b.z - p.z) * zoom;
      let x = dx * cos - dz * sin;
      let y = dx * sin + dz * cos;
      const r = Math.hypot(x, y);
      if (r > radius) {
        if (b.hideFar || (b.place && !b.big)) continue;
        x = (x / r) * radius;
        y = (y / r) * radius;
      }
      drawBlip(b, w / 2 + x, h / 2 + y, 6);
    }
    // The player arrow points along the facing.
    const facing = (player.vehicle ? player.vehicle.heading : p.heading) - yaw;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-facing);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    // North marker on the rim.
    const nxp = w / 2 + sin * radius;
    const nyp = h / 2 - cos * radius;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText('N', nxp, nyp);
    ctx.fillText('N', nxp, nyp);
  }

  /** The whole city on a big canvas, for the pause map. */
  function drawFull(target) {
    const tctx = target.getContext('2d');
    const w = target.width;
    const h = target.height;
    const s = Math.min(w / city.canvas.width, h / city.canvas.height);
    tctx.fillStyle = '#2a6f97';
    tctx.fillRect(0, 0, w, h);
    const ox = (w - city.canvas.width * s) / 2;
    const oy = (h - city.canvas.height * s) / 2;
    tctx.drawImage(city.canvas, ox, oy, city.canvas.width * s, city.canvas.height * s);
    const toScreen = (x, z) => [ox + (x + city.ox) * s, oy + (z + city.oy) * s];
    tctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    tctx.textAlign = 'center';
    const labels = [['PALM HEIGHTS', 400, 110], ['DOWNTOWN MERIDIAN', 440, 440], ['OLD TOWN CALLE', 180, 520], ['SALTWATER HARBOR', 200, 830], ['CORAL BEACH', 820, 470]];
    for (const [text, x, z] of labels) {
      const [sx, sy] = toScreen(x, z);
      tctx.lineWidth = 4;
      tctx.strokeStyle = 'rgba(0,0,0,0.7)';
      tctx.strokeText(text, sx, sy);
      tctx.fillStyle = '#fff6e0';
      tctx.fillText(text, sx, sy);
    }
    for (const b of collectBlips()) {
      const [sx, sy] = toScreen(b.x, b.z);
      tctx.beginPath();
      tctx.arc(sx, sy, b.big ? 8 : b.small ? 3 : 6, 0, Math.PI * 2);
      tctx.fillStyle = b.color;
      tctx.fill();
      tctx.strokeStyle = '#000';
      tctx.lineWidth = 1.5;
      tctx.stroke();
      if (b.label) {
        tctx.fillStyle = '#111';
        tctx.font = 'bold 9px sans-serif';
        tctx.textBaseline = 'middle';
        tctx.fillText(b.label, sx, sy + 0.5);
      }
    }
    const p = game.player.actor;
    const [px, py] = toScreen(p.x, p.z);
    tctx.beginPath();
    tctx.arc(px, py, 7, 0, Math.PI * 2);
    tctx.fillStyle = '#ffffff';
    tctx.fill();
    tctx.lineWidth = 3;
    tctx.strokeStyle = '#2ee6d6';
    tctx.stroke();
  }

  return { draw, drawFull };
}
