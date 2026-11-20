// Static collision for the city: every building, container, palm trunk and lamp post is a box or
// a circle in a uniform grid. Circles (people, car corners) are pushed out of them, and rays
// (bullets, police line of sight, the camera) are stopped by them.
import { CITY } from './config.js';

const CELL = 16;

export const WORLD_BOUNDS = { x0: -6, z0: -6, x1: CITY.size + CITY.beach - 12, z1: CITY.size + 24 };

export function createCollision(map) {
  const cols = Math.ceil((WORLD_BOUNDS.x1 + 40) / CELL) + 2;
  const rows = Math.ceil((WORLD_BOUNDS.z1 + 40) / CELL) + 2;
  const grid = Array.from({ length: cols * rows }, () => []);
  const shapes = [];

  const cellIndex = (cx, cz) => (cx + 1) + (cz + 1) * cols;
  function insert(shape) {
    shapes.push(shape);
    const cx0 = Math.max(-1, Math.floor(shape.x0 / CELL));
    const cz0 = Math.max(-1, Math.floor(shape.z0 / CELL));
    const cx1 = Math.min(cols - 2, Math.floor(shape.x1 / CELL));
    const cz1 = Math.min(rows - 2, Math.floor(shape.z1 / CELL));
    for (let cz = cz0; cz <= cz1; cz += 1) for (let cx = cx0; cx <= cx1; cx += 1) grid[cellIndex(cx, cz)].push(shape);
  }

  for (const b of map.buildings) insert({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: b.h, circle: false });
  for (const c of map.containers) insert({ x0: c.x - c.w / 2, z0: c.z - c.d / 2, x1: c.x + c.w / 2, z1: c.z + c.d / 2, h: c.h, circle: false });
  for (const p of map.palms) insert({ x0: p.x - 0.35, z0: p.z - 0.35, x1: p.x + 0.35, z1: p.z + 0.35, h: p.h, circle: true, cx: p.x, cz: p.z, r: 0.35 });
  for (const l of map.lamps) insert({ x0: l.x - 0.15, z0: l.z - 0.15, x1: l.x + 0.15, z1: l.z + 0.15, h: 6.5, circle: true, cx: l.x, cz: l.z, r: 0.15 });

  let stamp = 0;
  function nearby(x0, z0, x1, z1, out) {
    stamp += 1;
    out.length = 0;
    const cx0 = Math.max(-1, Math.floor(x0 / CELL));
    const cz0 = Math.max(-1, Math.floor(z0 / CELL));
    const cx1 = Math.min(cols - 2, Math.floor(x1 / CELL));
    const cz1 = Math.min(rows - 2, Math.floor(z1 / CELL));
    for (let cz = cz0; cz <= cz1; cz += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        for (const s of grid[cellIndex(cx, cz)]) {
          if (s.stamp === stamp) continue;
          s.stamp = stamp;
          out.push(s);
        }
      }
    }
    return out;
  }

  const scratch = [];
  const result = { x: 0, z: 0, nx: 0, nz: 0, hit: false, depth: 0 };

  /** Pushes a circle at (x, z) of radius r out of everything it overlaps; also keeps it in the world. */
  function resolveCircle(x, z, r) {
    result.hit = false;
    result.nx = 0;
    result.nz = 0;
    result.depth = 0;
    for (const s of nearby(x - r, z - r, x + r, z + r, scratch)) {
      if (s.circle) {
        const dx = x - s.cx;
        const dz = z - s.cz;
        const dist = Math.hypot(dx, dz);
        const min = r + s.r;
        if (dist < min && dist > 1e-6) {
          const push = min - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
          result.hit = true;
          result.nx += dx / dist;
          result.nz += dz / dist;
          result.depth = Math.max(result.depth, push);
        }
        continue;
      }
      const px = Math.max(s.x0, Math.min(x, s.x1));
      const pz = Math.max(s.z0, Math.min(z, s.z1));
      let dx = x - px;
      let dz = z - pz;
      let dist = Math.hypot(dx, dz);
      if (dist < r) {
        if (dist < 1e-6) {
          // The centre is inside the box: leave by the nearest face.
          const exits = [[x - s.x0, -1, 0], [s.x1 - x, 1, 0], [z - s.z0, 0, -1], [s.z1 - z, 0, 1]];
          exits.sort((a, b) => a[0] - b[0]);
          const [depth, ex, ez] = exits[0];
          x += ex * (depth + r);
          z += ez * (depth + r);
          dx = ex;
          dz = ez;
          dist = 1;
          result.depth = Math.max(result.depth, depth + r);
        } else {
          const push = r - dist;
          x += (dx / dist) * push;
          z += (dz / dist) * push;
          result.depth = Math.max(result.depth, push);
        }
        result.hit = true;
        result.nx += dx / dist;
        result.nz += dz / dist;
      }
    }
    if (x < WORLD_BOUNDS.x0 + r) { x = WORLD_BOUNDS.x0 + r; result.hit = true; result.nx += 1; }
    if (x > WORLD_BOUNDS.x1 - r) { x = WORLD_BOUNDS.x1 - r; result.hit = true; result.nx -= 1; }
    if (z < WORLD_BOUNDS.z0 + r) { z = WORLD_BOUNDS.z0 + r; result.hit = true; result.nz += 1; }
    const south = x < CITY.pitch * 5 ? WORLD_BOUNDS.z1 : CITY.size + 1;
    if (z > south - r) { z = south - r; result.hit = true; result.nz -= 1; }
    const len = Math.hypot(result.nx, result.nz);
    if (len > 0) {
      result.nx /= len;
      result.nz /= len;
    }
    result.x = x;
    result.z = z;
    return result;
  }

  /**
   * Distance along a 3D ray to the first solid it meets, or maxDist. The ray is marched through
   * the grid in short steps, which is plenty at bullet ranges.
   */
  function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const step = 0.5;
    let best = maxDist;
    const minX = Math.min(ox, ox + dx * maxDist);
    const maxX = Math.max(ox, ox + dx * maxDist);
    const minZ = Math.min(oz, oz + dz * maxDist);
    const maxZ = Math.max(oz, oz + dz * maxDist);
    const list = nearby(minX, minZ, maxX, maxZ, scratch);
    for (const s of list) {
      // Slab test against the box (circles use their bounding box: close enough for trunks).
      let t0 = 0;
      let t1 = best;
      const slab = (o, d, lo, hi) => {
        if (Math.abs(d) < 1e-8) return o >= lo && o <= hi;
        let a = (lo - o) / d;
        let b = (hi - o) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
        return t0 <= t1;
      };
      if (slab(ox, dx, s.x0, s.x1) && slab(oz, dz, s.z0, s.z1) && slab(oy, dy, -1, s.h)) best = Math.min(best, t0);
    }
    void step;
    if (oy + dy * best < 0 && dy < 0) best = Math.min(best, -oy / dy);
    return best;
  }

  /** True when the straight line between two points at eye height is clear of buildings. */
  function lineOfSight(x0, z0, x1, z1, y = 1.6) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return true;
    return raycast(x0, y, z0, dx / len, 0, dz / len, len) >= len - 0.5;
  }

  /** True when a circle at (x, z) overlaps nothing solid. */
  function isFree(x, z, r) {
    for (const s of nearby(x - r, z - r, x + r, z + r, scratch)) {
      const px = Math.max(s.x0, Math.min(x, s.x1));
      const pz = Math.max(s.z0, Math.min(z, s.z1));
      if (Math.hypot(x - px, z - pz) < r) return false;
    }
    return true;
  }

  return { resolveCircle, raycast, lineOfSight, isFree, shapes };
}
