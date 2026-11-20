// The layout of Palmera Keys as plain data: the road grid and its intersections, each block's
// district and buildings, parks, palms, street lamps, harbor containers and the named places
// (safehouse, mission givers, hospital, police, shops). Nothing here touches three.js.
import { CITY } from './config.js';
import { createRandom } from './rng.js';

export const DISTRICTS = {
  beach: { name: 'Coral Beach', color: '#f5c98a' },
  harbor: { name: 'Saltwater Harbor', color: '#8d9aa6' },
  downtown: { name: 'Downtown Meridian', color: '#9fb4c9' },
  heights: { name: 'Palm Heights', color: '#a9cf8e' },
  oldtown: { name: 'Old Town Calle', color: '#e2a98a' },
};

const PARKS = new Set(['5,1', '0,3', '7,6', '9,4']);

const PASTELS = [0xffb3c7, 0xa8eadf, 0xfff0a6, 0xd2c2ff, 0xffcfa3, 0xa9d8ff, 0xf7f3ea, 0xffd6e8];
const WARM = [0xe9b98f, 0xd98c6a, 0xf2d8a7, 0xc9a38a, 0xe6c9b8, 0xb9cfa8, 0xf0e2c8, 0xd6a2a2];
const GLASS = [0x9fc3d9, 0x8fb0c8, 0xb8c9d6, 0x7f9fb8, 0xc2d3dd, 0xa6b8a8];
const INDUSTRIAL = [0x9aa3a8, 0x7e8a8f, 0xb4a48e, 0x8c7d6a, 0xa2b0b5];

export function nodeCoord(i) {
  return i * CITY.pitch + CITY.road / 2;
}

/** The intersection nearest a world point, as grid indices. */
export function nearestNode(x, z) {
  const clamp = (v) => Math.max(0, Math.min(CITY.blocks, Math.round((v - CITY.road / 2) / CITY.pitch)));
  return { i: clamp(x), j: clamp(z) };
}

export function districtOf(bi, bj) {
  if (bi >= 8) return 'beach';
  if (bj >= 7 && bi <= 4) return 'harbor';
  if (bi >= 3 && bi <= 6 && bj >= 3 && bj <= 6) return 'downtown';
  if (bj <= 2) return 'heights';
  return 'oldtown';
}

/** The district a world point is in (roads take the district of the block to their south-east). */
export function districtAt(x, z) {
  if (x > CITY.size) return 'beach';
  const bi = Math.max(0, Math.min(CITY.blocks - 1, Math.floor((x - CITY.road / 2) / CITY.pitch)));
  const bj = Math.max(0, Math.min(CITY.blocks - 1, Math.floor((z - CITY.road / 2) / CITY.pitch)));
  return districtOf(bi, bj);
}

function blockRect(bi, bj) {
  const x0 = bi * CITY.pitch + CITY.road;
  const z0 = bj * CITY.pitch + CITY.road;
  return { x0, z0, x1: x0 + CITY.block, z1: z0 + CITY.block };
}

/** A point on the sidewalk in the middle of one side of a block (side: n, s, e, w). */
export function sidewalkPoint(bi, bj, side, along = 0.5) {
  const r = blockRect(bi, bj);
  const inset = CITY.sidewalk / 2;
  const t = (a, b) => a + (b - a) * along;
  if (side === 'n') return { x: t(r.x0, r.x1), z: r.z0 + inset };
  if (side === 's') return { x: t(r.x0, r.x1), z: r.z1 - inset };
  if (side === 'w') return { x: r.x0 + inset, z: t(r.z0, r.z1) };
  return { x: r.x1 - inset, z: t(r.z0, r.z1) };
}

/** A point on the road just beside a block's side, in the right-hand lane facing the given way. */
export function curbPoint(bi, bj, side, along = 0.5) {
  const p = sidewalkPoint(bi, bj, side, along);
  const out = CITY.sidewalk / 2 + 3;
  if (side === 'n') return { x: p.x, z: p.z - out, heading: -Math.PI / 2 };
  if (side === 's') return { x: p.x, z: p.z + out, heading: Math.PI / 2 };
  if (side === 'w') return { x: p.x - out, z: p.z, heading: Math.PI };
  return { x: p.x + out, z: p.z, heading: 0 };
}

/** Named places: [block i, block j, side, label, kind]. */
const PLACE_TABLE = {
  safehouse: [1, 4, 'e', "Nico's Apartment", 'save'],
  cantina: [2, 6, 'n', "Mari's Cantina", 'giver'],
  poolhall: [0, 5, 'e', 'Eight Ball Hall', 'giver'],
  shipping: [2, 8, 'e', 'Duarte Shipping', 'giver'],
  hospital: [7, 5, 'w', 'Bayview Medical', 'hospital'],
  police: [6, 7, 'n', 'PKPD Central', 'police'],
  respray: [7, 3, 's', 'Fresh Coat Garage', 'respray'],
  gunshop: [2, 3, 'e', 'Iron Coast Arms', 'gunshop'],
  krollTower: [5, 4, 'w', 'Kroll Tower', 'landmark'],
  villa: [6, 1, 's', 'Kroll Villa', 'landmark'],
  harborGarage: [3, 9, 'n', 'Pier 9 Garage', 'landmark'],
  busStation: [1, 6, 'e', 'Calle Bus Depot', 'landmark'],
};

export function createCityMap(seed = 7) {
  const rng = createRandom(seed);
  const blocks = [];
  const buildings = [];
  const palms = [];
  const lamps = [];
  const containers = [];
  const pools = [];
  const places = {};

  for (const [key, [bi, bj, side, label, kind]] of Object.entries(PLACE_TABLE)) {
    const p = sidewalkPoint(bi, bj, side);
    places[key] = { key, label, kind, x: p.x, z: p.z, bi, bj, side, curb: curbPoint(bi, bj, side) };
  }
  const placeBlocks = new Map(Object.values(places).map((p) => [`${p.bi},${p.bj}`, p]));

  for (let bj = 0; bj < CITY.blocks; bj += 1) {
    for (let bi = 0; bi < CITY.blocks; bi += 1) {
      const rect = blockRect(bi, bj);
      const district = districtOf(bi, bj);
      const park = PARKS.has(`${bi},${bj}`);
      const block = { bi, bj, ...rect, district, park };
      blocks.push(block);
      const inner = { x0: rect.x0 + CITY.sidewalk, z0: rect.z0 + CITY.sidewalk, x1: rect.x1 - CITY.sidewalk, z1: rect.z1 - CITY.sidewalk };

      // Street lamps at the block's corners and mid-sides; palms along the curb in sunny districts.
      for (const [lx, lz] of [[rect.x0 + 1, rect.z0 + 1], [rect.x1 - 1, rect.z0 + 1], [rect.x0 + 1, rect.z1 - 1], [rect.x1 - 1, rect.z1 - 1]]) lamps.push({ x: lx, z: lz });
      if (district === 'beach' || district === 'heights' || district === 'oldtown' || park) {
        const step = district === 'beach' ? 12 : 18;
        for (let s = rect.x0 + 9; s < rect.x1 - 5; s += step) {
          palms.push({ x: s, z: rect.z0 + 1.2, h: rng.range(7, 12) });
          palms.push({ x: s + 4, z: rect.z1 - 1.2, h: rng.range(7, 12) });
        }
        for (let s = rect.z0 + 9; s < rect.z1 - 5; s += step) {
          palms.push({ x: rect.x0 + 1.2, z: s, h: rng.range(7, 12) });
          palms.push({ x: rect.x1 - 1.2, z: s + 4, h: rng.range(7, 12) });
        }
      }

      if (park) {
        for (let n = 0; n < 16; n += 1) palms.push({ x: rng.range(inner.x0 + 4, inner.x1 - 4), z: rng.range(inner.z0 + 4, inner.z1 - 4), h: rng.range(8, 14) });
        continue;
      }

      const place = placeBlocks.get(`${bi},${bj}`);
      fillBlock(rng, block, inner, buildings, palms, containers, pools, place);
    }
  }

  // The beach: palms along the boulevard and on the sand.
  for (let z = 20; z < CITY.size - 10; z += 14) {
    palms.push({ x: CITY.size + 4, z, h: rng.range(8, 13) });
    if (rng.chance(0.5)) palms.push({ x: CITY.size + rng.range(14, 50), z: z + rng.range(-5, 5), h: rng.range(7, 12) });
  }
  // Harbor docks along the southern seawall: rows of containers.
  for (let x = 30; x < CITY.pitch * 5; x += 7) {
    if (rng.chance(0.6)) containers.push({ x, z: CITY.size + 10, w: 6, d: 2.6, h: 2.6 * rng.int(1, 3), color: rng.pick([0xc0392b, 0x2471a3, 0xd68910, 0x1e8449, 0x7d3c98, 0x839192]), rot: 0 });
  }

  return { blocks, buildings, palms, lamps, containers, pools, places };
}

function addBuilding(buildings, x0, z0, x1, z1, h, color, style, name = null) {
  buildings.push({ x0, z0, x1, z1, h, color, style, name });
}

function fillBlock(rng, block, inner, buildings, palms, containers, pools, place) {
  const { district } = block;
  const w = inner.x1 - inner.x0;
  const d = inner.z1 - inner.z0;

  if (place && place.key === 'krollTower') {
    addBuilding(buildings, inner.x0 + 10, inner.z0 + 10, inner.x1 - 10, inner.z1 - 10, 150, 0x2e3440, 'tower', 'Kroll Tower');
    addBuilding(buildings, inner.x0 + 2, inner.z0 + 2, inner.x1 - 2, inner.z1 - 2, 9, 0xd8c7a0, 'deco');
    return;
  }
  if (place && place.key === 'villa') {
    addBuilding(buildings, inner.x0 + 14, inner.z0 + 6, inner.x1 - 14, inner.z0 + 30, 9, 0xfaf3e6, 'house', 'Kroll Villa');
    pools.push({ x0: inner.x0 + 18, z0: inner.z0 + 36, x1: inner.x1 - 18, z1: inner.z0 + 48 });
    return;
  }

  if (district === 'downtown') {
    const n = 2;
    for (let a = 0; a < n; a += 1) {
      for (let b = 0; b < n; b += 1) {
        const lx0 = inner.x0 + (w / n) * a + 2;
        const lz0 = inner.z0 + (d / n) * b + 2;
        const lx1 = lx0 + w / n - 4;
        const lz1 = lz0 + d / n - 4;
        const h = rng.range(30, 105);
        const color = rng.pick(GLASS);
        addBuilding(buildings, lx0, lz0, lx1, lz1, h, color, 'tower');
        if (rng.chance(0.55)) addBuilding(buildings, lx0 + 4, lz0 + 4, lx1 - 4, lz1 - 4, h + rng.range(10, 35), color, 'tower');
      }
    }
    return;
  }
  if (district === 'beach') {
    const rows = 3;
    for (let b = 0; b < rows; b += 1) {
      const lz0 = inner.z0 + (d / rows) * b + 1.5;
      const lz1 = lz0 + d / rows - 3;
      const h = rng.range(12, 34);
      addBuilding(buildings, inner.x0 + 6, lz0, inner.x1 - 2, lz1, h, rng.pick(PASTELS), 'deco');
    }
    return;
  }
  if (district === 'harbor') {
    if (rng.chance(0.5)) {
      addBuilding(buildings, inner.x0 + 2, inner.z0 + 2, inner.x1 - 2, inner.z0 + d * 0.55, rng.range(9, 14), rng.pick(INDUSTRIAL), 'warehouse');
      for (let x = inner.x0 + 4; x < inner.x1 - 7; x += 7.5) {
        if (rng.chance(0.7)) containers.push({ x: x + 3, z: inner.z1 - 8, w: 6, d: 2.6, h: 2.6 * rng.int(1, 2), color: rng.pick([0xc0392b, 0x2471a3, 0xd68910, 0x1e8449, 0x839192]), rot: 0 });
      }
    } else {
      addBuilding(buildings, inner.x0 + 2, inner.z0 + 2, inner.x0 + w * 0.48, inner.z1 - 2, rng.range(8, 12), rng.pick(INDUSTRIAL), 'warehouse');
      addBuilding(buildings, inner.x0 + w * 0.52, inner.z0 + 2, inner.x1 - 2, inner.z1 - 2, rng.range(8, 12), rng.pick(INDUSTRIAL), 'warehouse');
    }
    return;
  }
  if (district === 'heights') {
    for (let a = 0; a < 2; a += 1) {
      for (let b = 0; b < 2; b += 1) {
        const cx = inner.x0 + (w / 2) * (a + 0.5);
        const cz = inner.z0 + (d / 2) * (b + 0.5);
        const hw = rng.range(7, 10);
        const hd = rng.range(6, 9);
        addBuilding(buildings, cx - hw, cz - hd, cx + hw, cz + hd, rng.range(5, 9), rng.pick(PASTELS), 'house');
        if (rng.chance(0.5)) pools.push({ x0: cx - hw, z0: cz + hd + 2, x1: cx - hw + 8, z1: cz + hd + 7 });
        palms.push({ x: cx + hw + 3, z: cz - hd + 1, h: rng.range(7, 11) });
      }
    }
    return;
  }
  // Old Town: a dense row of low shops and apartments around a courtyard.
  const cols = 3;
  for (let a = 0; a < cols; a += 1) {
    for (let b = 0; b < cols; b += 1) {
      if (a === 1 && b === 1) continue;
      const lx0 = inner.x0 + (w / cols) * a + 1;
      const lz0 = inner.z0 + (d / cols) * b + 1;
      addBuilding(buildings, lx0, lz0, lx0 + w / cols - 2, lz0 + d / cols - 2, rng.range(6, 16), rng.pick(WARM), 'shop');
    }
  }
  palms.push({ x: (inner.x0 + inner.x1) / 2, z: (inner.z0 + inner.z1) / 2, h: 11 });
}
