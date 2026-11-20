// Every texture in the game is painted here on a canvas at load time: building facades (with a
// matching night-light map), asphalt with lane markings, sidewalk tiles, sand, grass and water.
import * as THREE from '../vendor/three.min.js';
import { createRandom } from './rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(ctx, w, h, rng, count, colors, size = 2) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = rng.pick(colors);
    ctx.fillRect(rng.next() * w, rng.next() * h, size, size);
  }
}

/**
 * A facade of 8 bays by 8 floors. `style` sets the window shape; the second canvas lights a
 * random share of the windows for night.
 */
function facade(style, seed) {
  const rng = createRandom(seed);
  const size = 512;
  const cell = size / 8;
  const [c, ctx] = canvas(size, size);
  const [n, nctx] = canvas(size, size);
  nctx.fillStyle = '#000';
  nctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, rng, 3000, ['#f1f1f1', '#e8e8e8', '#fafafa'], 2);
  for (let fy = 0; fy < 8; fy += 1) {
    for (let fx = 0; fx < 8; fx += 1) {
      const x = fx * cell;
      const y = fy * cell;
      let wx = x + 8, wy = y + 12, ww = cell - 16, wh = cell - 22;
      if (style === 'tower') { wx = x + 2; wy = y + 4; ww = cell - 4; wh = cell - 10; }
      if (style === 'deco') { wx = x + 10; wy = y + 10; ww = cell - 20; wh = cell - 26; }
      if (style === 'warehouse') { wx = x + 4; wy = y + 6; ww = cell - 8; wh = 12; if (fy % 3 !== 0) continue; }
      if (style === 'house') { wx = x + 14; wy = y + 14; ww = cell - 28; wh = cell - 30; if (fx % 2 === 1) continue; }
      const glass = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      if (style === 'tower') {
        glass.addColorStop(0, '#3c5a78');
        glass.addColorStop(0.5, '#7fa6c4');
        glass.addColorStop(1, '#27405a');
      } else {
        glass.addColorStop(0, '#2c3e50');
        glass.addColorStop(0.6, '#5d7f99');
        glass.addColorStop(1, '#1e2b38');
      }
      ctx.fillStyle = glass;
      ctx.fillRect(wx, wy, ww, wh);
      if (style !== 'tower') {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(wx - 2, wy + wh, ww + 4, 3);
      }
      if (style === 'deco' && fx % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(x, y + cell - 6, cell, 4);
      }
      if (rng.chance(style === 'tower' ? 0.35 : 0.45)) {
        const warm = rng.pick(['#ffd58a', '#ffe9b8', '#fff3d6', '#bfe3ff']);
        nctx.fillStyle = warm;
        nctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = 'rgba(255,220,150,0.12)';
        ctx.fillRect(wx, wy, ww, wh);
      }
    }
  }
  if (style === 'shop') {
    // Ground-floor awnings in alternating stripes.
    for (let fx = 0; fx < 8; fx += 1) {
      const colors = ['#d9534f', '#2a9d8f', '#e9c46a', '#264653'];
      ctx.fillStyle = colors[fx % 4];
      ctx.fillRect(fx * cell + 4, size - cell + 4, cell - 8, 10);
    }
  }
  return { map: toTexture(c), night: toTexture(n) };
}

function roofTexture(seed) {
  const rng = createRandom(seed);
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#8e8a84';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 4000, ['#7f7b75', '#a29e97', '#8a857e', '#96918a'], 2);
  ctx.strokeStyle = 'rgba(60,60,60,0.35)';
  for (let i = 0; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Asphalt for one road segment: u runs across the road, v along it, one repeat every 16 m. */
function roadTexture() {
  const rng = createRandom(11);
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#4a4b4f';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 9000, ['#414246', '#55565b', '#3c3d41', '#5e5f63'], 2);
  // Double yellow centre line.
  ctx.fillStyle = '#e8b931';
  ctx.fillRect(124, 0, 3, 256);
  ctx.fillRect(130, 0, 3, 256);
  // Dashed white lane lines.
  ctx.fillStyle = '#e6e6e6';
  for (let y = 0; y < 256; y += 64) {
    ctx.fillRect(62, y, 3, 34);
    ctx.fillRect(191, y, 3, 34);
  }
  // Edge lines.
  ctx.fillRect(6, 0, 3, 256);
  ctx.fillRect(247, 0, 3, 256);
  return toTexture(c);
}

function intersectionTexture() {
  const rng = createRandom(12);
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#48494d';
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, 9000, ['#414246', '#55565b', '#3c3d41'], 2);
  // Zebra crossings on all four sides.
  ctx.fillStyle = '#dedede';
  for (let i = 20; i < 236; i += 22) {
    ctx.fillRect(i, 2, 12, 26);
    ctx.fillRect(i, 228, 12, 26);
    ctx.fillRect(2, i, 26, 12);
    ctx.fillRect(228, i, 26, 12);
  }
  return toTexture(c, false);
}

function tileTexture() {
  const rng = createRandom(13);
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#cfc8bb';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rng, 1500, ['#c4bdb0', '#d9d2c5', '#bdb6a9'], 2);
  ctx.strokeStyle = '#a9a294';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  return toTexture(c);
}

function noiseTexture(seed, base, colors, count) {
  const rng = createRandom(seed);
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, 256, rng, count, colors, 3);
  return toTexture(c);
}

function waterTexture() {
  const rng = createRandom(21);
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#1f8fb0');
  g.addColorStop(1, '#1a7ea3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i += 1) {
    ctx.strokeStyle = rng.pick(['rgba(255,255,255,0.18)', 'rgba(160,230,255,0.25)', 'rgba(10,60,90,0.2)']);
    ctx.lineWidth = rng.range(1, 2.5);
    const x = rng.next() * 256;
    const y = rng.next() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 8, y - 3, x + rng.range(12, 26), y);
    ctx.stroke();
  }
  return toTexture(c);
}

/** Paints every texture once and hands back the set. */
export function createTextures() {
  const styles = ['tower', 'deco', 'shop', 'house', 'warehouse'];
  const facades = {};
  styles.forEach((s, i) => { facades[s] = facade(s, 100 + i); });
  return {
    facades,
    roof: roofTexture(5),
    road: roadTexture(),
    intersection: intersectionTexture(),
    tile: tileTexture(),
    sand: noiseTexture(31, '#ecd3a0', ['#e3c78f', '#f3dfb6', '#dcc08a', '#f7e7c4'], 6000),
    grass: noiseTexture(32, '#7fae5a', ['#729f4f', '#8dbd66', '#6a9449', '#97c46f'], 7000),
    lot: noiseTexture(33, '#b7b1a6', ['#aaa499', '#c2bcb1', '#a19b90'], 5000),
    water: waterTexture(),
  };
}
