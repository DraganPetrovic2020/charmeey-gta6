// Turns the city map into three.js meshes: merged buildings per facade style (with night
// windows), roads and intersections, sidewalks and lots, the beach and ocean, and instanced
// palms, street lamps, containers, beach umbrellas and the shop signs.
import * as THREE from '../vendor/three.min.js';
import { CITY } from './config.js';
import { nodeCoord } from './citymap.js';
import { MeshBuilder } from './meshkit.js';
import { createRandom } from './rng.js';

const BAY = 4;
const FLOOR = 3.5;

function buildBuildings(map, tex, group, nightMaterials) {
  const walls = {};
  const roofs = new MeshBuilder();
  for (const b of map.buildings) {
    if (!walls[b.style]) walls[b.style] = new MeshBuilder();
    walls[b.style].box(b.x0, 0, b.z0, b.x1, b.h, b.z1, b.color, [1 / (8 * BAY), 1 / (8 * FLOOR)], 'nsew');
    roofs.box(b.x0, b.h, b.z0, b.x1, b.h + 0.01, b.z1, 0xffffff, [1 / 24, 1 / 24], 't');
    // Parapet and rooftop machinery keep the skyline from being flat boxes.
    roofs.box(b.x0, b.h, b.z0, b.x1, b.h + 0.8, b.z0 + 0.5, 0xd9d4cc, [0.1, 0.1], 'nsewt');
    roofs.box(b.x0, b.h, b.z1 - 0.5, b.x1, b.h + 0.8, b.z1, 0xd9d4cc, [0.1, 0.1], 'nsewt');
    if (b.x1 - b.x0 > 12 && b.h > 10) {
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      roofs.box(cx - 2, b.h, cz - 1.5, cx + 2, b.h + 2.2, cz + 1.5, 0xb0aca5, [0.2, 0.2], 'nsewt');
    }
    if (b.style === 'deco') {
      // A pastel crown band and a ground-floor canopy on the beachfront hotels.
      walls.deco.box(b.x0 - 0.4, b.h - 1.6, b.z0 - 0.4, b.x1 + 0.4, b.h - 0.6, b.z1 + 0.4, 0xffffff, [0, 0], 'nsew');
      walls.deco.box(b.x1, 3.2, b.z0 + 3, b.x1 + 2.2, 3.5, b.z1 - 3, 0xffffff, [0, 0], 'nsewtb');
    }
  }
  for (const [style, builder] of Object.entries(walls)) {
    const f = tex.facades[style];
    const material = new THREE.MeshStandardMaterial({
      map: f.map,
      vertexColors: true,
      roughness: style === 'tower' ? 0.35 : 0.85,
      metalness: style === 'tower' ? 0.08 : 0.0,
      emissiveMap: f.night,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0,
    });
    nightMaterials.push(material);
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const roofMesh = new THREE.Mesh(roofs.build(), new THREE.MeshStandardMaterial({ map: tex.roof, vertexColors: true, roughness: 0.95 }));
  roofMesh.receiveShadow = true;
  roofMesh.castShadow = true;
  group.add(roofMesh);
}

function buildGround(map, tex, group) {
  const roads = new MeshBuilder();
  const crossings = new MeshBuilder();
  const walks = new MeshBuilder();
  const lots = new MeshBuilder();
  const grass = new MeshBuilder();
  const half = CITY.road / 2;
  const n = CITY.blocks;
  const roadUV = 1 / 16;
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n; j += 1) {
      const cx = nodeCoord(i);
      const cz = nodeCoord(j);
      crossings.quad([cx - half, 0.02, cz - half], [cx - half, 0.02, cz + half], [cx + half, 0.02, cz + half], [cx + half, 0.02, cz - half], [0, 1, 0], [[0, 0], [0, 1], [1, 1], [1, 0]]);
      if (i < n) {
        // Road running east-west: u across (z), v along (x).
        const x0 = cx + half;
        const x1 = nodeCoord(i + 1) - half;
        roads.quad([x0, 0.02, cz - half], [x0, 0.02, cz + half], [x1, 0.02, cz + half], [x1, 0.02, cz - half], [0, 1, 0], [[0, x0 * roadUV], [1, x0 * roadUV], [1, x1 * roadUV], [0, x1 * roadUV]]);
      }
      if (j < n) {
        const z0 = cz + half;
        const z1 = nodeCoord(j + 1) - half;
        roads.quad([cx - half, 0.02, z0], [cx + half, 0.02, z0], [cx + half, 0.02, z1], [cx - half, 0.02, z1], [0, 1, 0], [[0, z0 * roadUV], [1, z0 * roadUV], [1, z1 * roadUV], [0, z1 * roadUV]]);
      }
    }
  }
  const sw = CITY.sidewalk;
  for (const b of map.blocks) {
    const y = 0.16;
    // Sidewalk ring with a curb face toward the road.
    walks.box(b.x0, 0, b.z0, b.x1, y, b.z0 + sw, 0xffffff, [0.25, 0.25], 'nsewt');
    walks.box(b.x0, 0, b.z1 - sw, b.x1, y, b.z1, 0xffffff, [0.25, 0.25], 'nsewt');
    walks.box(b.x0, 0, b.z0 + sw, b.x0 + sw, y, b.z1 - sw, 0xffffff, [0.25, 0.25], 'ewt');
    walks.box(b.x1 - sw, 0, b.z0 + sw, b.x1, y, b.z1 - sw, 0xffffff, [0.25, 0.25], 'ewt');
    const target = b.park || b.district === 'heights' ? grass : lots;
    target.flat(b.x0 + sw, b.z0 + sw, b.x1 - sw, b.z1 - sw, 0.12, 0xffffff, 1 / 12);
  }
  const add = (builder, material, receive = true) => {
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  };
  add(roads, new THREE.MeshStandardMaterial({ map: tex.road, roughness: 0.92 }));
  add(crossings, new THREE.MeshStandardMaterial({ map: tex.intersection, roughness: 0.92 }));
  add(walks, new THREE.MeshStandardMaterial({ map: tex.tile, vertexColors: true, roughness: 0.9 }));
  add(lots, new THREE.MeshStandardMaterial({ map: tex.lot, vertexColors: true, roughness: 0.95 }));
  add(grass, new THREE.MeshStandardMaterial({ map: tex.grass, vertexColors: true, roughness: 1 }));

  // Land under everything, the docks to the south, the beach to the east.
  const land = new MeshBuilder();
  land.flat(-8, -8, CITY.size + 2, CITY.size + 2, -0.02, 0xffffff, 1 / 10);
  land.flat(-8, CITY.size + 2, CITY.pitch * 5, CITY.size + 26, -0.02, 0xc8c8c8, 1 / 10);
  add(land, new THREE.MeshStandardMaterial({ map: tex.lot, vertexColors: true, roughness: 1 }));
  const sand = new MeshBuilder();
  sand.quad([CITY.size + 2, 0.0, -8], [CITY.size + 2, 0.0, CITY.size + 8], [CITY.size + CITY.beach, -0.9, CITY.size + 8], [CITY.size + CITY.beach, -0.9, -8], [0, 1, 0],
    [[0, 0], [0, (CITY.size + 16) / 12], [CITY.beach / 12, (CITY.size + 16) / 12], [CITY.beach / 12, 0]]);
  add(sand, new THREE.MeshStandardMaterial({ map: tex.sand, roughness: 1 }));

  // Seawall along the north, west and south edges.
  const wall = new MeshBuilder();
  wall.box(-9, -2, -9, CITY.size + 2, 0.9, -8, 0xd8d2c4, [0.2, 0.2]);
  wall.box(-9, -2, -9, -8, 0.9, CITY.size + 26, 0xd8d2c4, [0.2, 0.2]);
  wall.box(-9, -2, CITY.size + 26, CITY.pitch * 5, 0.9, CITY.size + 27, 0xd8d2c4, [0.2, 0.2]);
  wall.box(CITY.pitch * 5, -2, CITY.size + 2, CITY.pitch * 5 + 1, 0.9, CITY.size + 27, 0xd8d2c4, [0.2, 0.2]);
  wall.box(CITY.pitch * 5, -2, CITY.size + 2, CITY.size + 2, 0.9, CITY.size + 3, 0xd8d2c4, [0.2, 0.2]);
  add(wall, new THREE.MeshStandardMaterial({ map: tex.tile, vertexColors: true, roughness: 0.9 })).castShadow = true;
}

function buildWater(tex, group) {
  const geometry = new THREE.PlaneGeometry(5000, 5000);
  geometry.rotateX(-Math.PI / 2);
  tex.water.repeat.set(220, 220);
  const material = new THREE.MeshStandardMaterial({ map: tex.water, roughness: 0.18, metalness: 0.25, color: 0xbfefff });
  const water = new THREE.Mesh(geometry, material);
  water.position.set(CITY.size / 2, CITY.seaLevel, CITY.size / 2);
  water.receiveShadow = true;
  group.add(water);
  return water;
}

function palmGeometries() {
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 1, 7, 4);
  trunk.translate(0, 0.5, 0);
  // Bend the trunk a little so the palms lean like real ones.
  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + y * y * 1.3);
  }
  trunk.computeVertexNormals();
  const fronds = new MeshBuilder();
  const blades = 8;
  for (let k = 0; k < blades; k += 1) {
    const a = (k / blades) * Math.PI * 2;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const px = -dz * 0.45;
    const pz = dx * 0.45;
    const mid = [dx * 1.9, 0.25, dz * 1.9];
    const tip = [dx * 3.6, -0.9, dz * 3.6];
    fronds.quad([0, 0, 0], [mid[0] + px, mid[1], mid[2] + pz], [tip[0], tip[1], tip[2]], [mid[0] - px, mid[1], mid[2] - pz], [0, 1, 0], undefined, 0xffffff);
    fronds.quad([0, 0, 0], [mid[0] - px, mid[1], mid[2] - pz], [tip[0], tip[1], tip[2]], [mid[0] + px, mid[1], mid[2] + pz], [0, -1, 0], undefined, 0xffffff);
  }
  const crown = fronds.build();
  return { trunk, crown };
}

function buildPalms(map, group) {
  const { trunk, crown } = palmGeometries();
  const count = map.palms.length;
  const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 1 }), count);
  const crownMesh = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const rng = createRandom(77);
  const greens = [0x3f8f3a, 0x4fa043, 0x2f7d3b, 0x5aa84b];
  const c = new THREE.Color();
  map.palms.forEach((palm, i) => {
    const yaw = rng.range(0, Math.PI * 2);
    e.set(0, yaw, 0);
    q.setFromEuler(e);
    s.set(1, palm.h, 1);
    p.set(palm.x, 0, palm.z);
    m.compose(p, q, s);
    trunkMesh.setMatrixAt(i, m);
    const lean = 1.3;
    p.set(palm.x + Math.cos(yaw) * lean, palm.h, palm.z - Math.sin(yaw) * lean);
    e.set(rng.range(-0.15, 0.15), rng.range(0, Math.PI * 2), rng.range(-0.15, 0.15));
    q.setFromEuler(e);
    const sc = palm.h / 10;
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    crownMesh.setMatrixAt(i, m);
    crownMesh.setColorAt(i, c.set(rng.pick(greens)));
  });
  trunkMesh.castShadow = crownMesh.castShadow = true;
  group.add(trunkMesh, crownMesh);
}

function buildLamps(map, group) {
  const pole = new THREE.CylinderGeometry(0.08, 0.12, 6.5, 6);
  pole.translate(0, 3.25, 0);
  const head = new THREE.BoxGeometry(0.4, 0.2, 1.4);
  head.translate(0, 6.5, 0.5);
  const bulb = new THREE.BoxGeometry(0.3, 0.06, 1.0);
  bulb.translate(0, 6.38, 0.55);
  const n = map.lamps.length;
  const poles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.6, metalness: 0.5 }), n);
  const heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.6 }), n);
  const bulbMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffd27a, emissiveIntensity: 0 });
  const bulbs = new THREE.InstancedMesh(bulb, bulbMaterial, n);
  const m = new THREE.Matrix4();
  const cx = CITY.size / 2;
  map.lamps.forEach((lamp, i) => {
    m.makeRotationY(Math.atan2(cx - lamp.x, cx - lamp.z) + Math.PI);
    m.setPosition(lamp.x, 0, lamp.z);
    poles.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    bulbs.setMatrixAt(i, m);
  });
  poles.castShadow = true;
  group.add(poles, heads, bulbs);
  return bulbMaterial;
}

function buildContainers(map, group) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.3 }), map.containers.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  map.containers.forEach((box, i) => {
    m.makeScale(box.w, box.h, box.d);
    m.setPosition(box.x, 0, box.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(box.color));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}

function buildPools(map, group) {
  const b = new MeshBuilder();
  for (const p of map.pools) {
    b.box(p.x0 - 0.5, 0, p.z0 - 0.5, p.x1 + 0.5, 0.3, p.z1 + 0.5, 0xf4efe6, [0.2, 0.2], 'nsewt');
  }
  const water = new MeshBuilder();
  for (const p of map.pools) water.flat(p.x0, p.z0, p.x1, p.z1, 0.32, 0xffffff, 0.1);
  group.add(new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  group.add(new THREE.Mesh(water.build(), new THREE.MeshStandardMaterial({ color: 0x4fd6e8, roughness: 0.1, metalness: 0.2, emissive: 0x0a5f6e, emissiveIntensity: 0.4 })));
}

function buildUmbrellas(group) {
  const rng = createRandom(91);
  const top = new THREE.ConeGeometry(1.8, 0.7, 8);
  top.translate(0, 2.6, 0);
  const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5);
  pole.translate(0, 1.3, 0);
  const count = 46;
  const tops = new THREE.InstancedMesh(top, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), count);
  const poles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0xeeeeee }), count);
  const towels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 2), new THREE.MeshStandardMaterial({ color: 0xffffff }), count);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const x = CITY.size + rng.range(16, 52);
    const z = rng.range(20, CITY.size - 20);
    const y = -((x - CITY.size) / CITY.beach) * 0.9;
    m.makeTranslation(x, y, z);
    tops.setMatrixAt(i, m);
    poles.setMatrixAt(i, m);
    tops.setColorAt(i, c.set(rng.pick([0xff5d73, 0xffc93c, 0x2ec4b6, 0xff9f1c, 0x9b5de5, 0xffffff])));
    m.makeRotationY(rng.range(-0.5, 0.5));
    m.setPosition(x + 1.8, y + 0.03, z + 0.5);
    towels.setMatrixAt(i, m);
    towels.setColorAt(i, c.set(rng.pick([0xf15bb5, 0x00bbf9, 0xfee440, 0x00f5d4])));
  }
  tops.castShadow = true;
  group.add(tops, poles, towels);
}

/** A painted sign board for a named place, mounted on the building behind it. */
function signTexture(label, kind) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  const palette = { giver: ['#1d1033', '#ff5fa2'], save: ['#10283a', '#5fe3ff'], hospital: ['#f5f5f5', '#d62828'], police: ['#0b1d3a', '#7fb2ff'], respray: ['#1b1b1b', '#ffd23f'], gunshop: ['#2b1a12', '#ff8c42'], landmark: ['#202020', '#f5e6c8'] }[kind] ?? ['#222', '#fff'];
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = palette[1];
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = palette[1];
  ctx.font = 'bold 54px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = palette[1];
  ctx.shadowBlur = 14;
  ctx.fillText(label.toUpperCase(), 256, 66, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSigns(map, group, nightMaterials) {
  const geometry = new THREE.PlaneGeometry(8, 2);
  const facing = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 };
  const inward = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] };
  for (const place of Object.values(map.places)) {
    const material = new THREE.MeshStandardMaterial({ map: signTexture(place.label, place.kind), emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.6 });
    material.emissiveMap = material.map;
    nightMaterials.push(material);
    const sign = new THREE.Mesh(geometry, material);
    const [ix, iz] = inward[place.side];
    sign.position.set(place.x + ix * 2.7, 5.2, place.z + iz * 2.7);
    sign.rotation.y = facing[place.side];
    group.add(sign);
  }
}

/** Builds the whole static city into one group; returns it with the materials night lights. */
export function buildCity(map, tex) {
  const group = new THREE.Group();
  const nightMaterials = [];
  buildGround(map, tex, group);
  buildBuildings(map, tex, group, nightMaterials);
  const water = buildWater(tex, group);
  buildPalms(map, group);
  const lampMaterial = buildLamps(map, group);
  buildContainers(map, group);
  buildPools(map, group);
  buildUmbrellas(group);
  buildSigns(map, group, nightMaterials);
  return { group, nightMaterials, lampMaterial, water };
}
