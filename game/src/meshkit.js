// A small geometry builder: quads and boxes with normals, UVs and vertex colours, merged into one
// BufferGeometry per material group. The city, the vehicles and the props are all built with it.
import * as THREE from '../vendor/three.min.js';

const tmpColor = new THREE.Color();

export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
  }

  /** a, b, c, d go round the quad; the winding is fixed to face along `normal`. */
  quad(a, b, c, d, normal, uv = [[0, 0], [1, 0], [1, 1], [0, 1]], color = 0xffffff) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0;
    tmpColor.set(color);
    const base = this.positions.length / 3;
    for (const [p, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [d, uv[3]]]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.uvs.push(t[0], t[1]);
      this.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
    }
    if (flip) this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * An axis-aligned box from (x0, y0, z0) to (x1, y1, z1). `uvScale` maps metres to texture
   * repeats on the sides ([u per metre, v per metre]); `faces` can leave out sides.
   */
  box(x0, y0, z0, x1, y1, z1, color = 0xffffff, uvScale = [1, 1], faces = 'nsewtb') {
    const [su, sv] = uvScale;
    const w = x1 - x0;
    const d = z1 - z0;
    const h = y1 - y0;
    const side = (len) => [[0, 0], [len * su, 0], [len * su, h * sv], [0, h * sv]];
    if (faces.includes('s')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], side(w), color);
    if (faces.includes('n')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], side(w), color);
    if (faces.includes('e')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], side(d), color);
    if (faces.includes('w')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], side(d), color);
    if (faces.includes('t')) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], [[x0 * su, z0 * su], [x0 * su, z1 * su], [x1 * su, z1 * su], [x1 * su, z0 * su]], color);
    if (faces.includes('b')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], undefined, color);
  }

  /** A box centred on (cx, cy, cz) with full sizes (w, h, d): handy for models. */
  cbox(cx, cy, cz, w, h, d, color) {
    this.box(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, color);
  }

  /** A horizontal quad at height y (a patch of ground) with UVs in metres times `scale`. */
  flat(x0, z0, x1, z1, y, color = 0xffffff, scale = 1) {
    this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], [[x0 * scale, z0 * scale], [x0 * scale, z1 * scale], [x1 * scale, z1 * scale], [x1 * scale, z0 * scale]], color);
  }

  get empty() {
    return this.indices.length === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}
