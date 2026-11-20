// Low-poly models built from boxes: people (with jointed arms and legs for walking, aiming and
// falling) and every vehicle body (sedan, sports car, pickup, convertible, van, cab and police
// cruiser), each with wheels, glass, head and tail lights.
import * as THREE from '../vendor/three.min.js';
import { VEHICLES } from './config.js';
import { MeshBuilder } from './meshkit.js';

const materialCache = new Map();
export function solid(color, options = {}) {
  const key = `${color}|${JSON.stringify(options)}`;
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...options }));
  return materialCache.get(key);
}

const boxCache = new Map();
function boxGeometry(w, h, d, oy = 0) {
  const key = `${w},${h},${d},${oy}`;
  if (!boxCache.has(key)) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, oy, 0);
    boxCache.set(key, g);
  }
  return boxCache.get(key);
}

function part(w, h, d, color, oy = 0) {
  const mesh = new THREE.Mesh(boxGeometry(w, h, d, oy), solid(color));
  mesh.castShadow = true;
  return mesh;
}

export const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4226];

const personMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });

function merged(build, material = personMaterial) {
  const b = new MeshBuilder();
  build(b);
  const mesh = new THREE.Mesh(b.build(), material);
  mesh.castShadow = true;
  return mesh;
}

/**
 * A person facing +z, feet at y = 0. `look` sets shirt, pants, skin, hair and extras
 * ('cap' for police, 'shades', 'bandana' for gang members). Each body segment is one merged
 * mesh with vertex colours, so a crowd stays cheap to draw.
 */
export function buildPerson(look) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  const skin = look.skin;
  // Tapered torso (a broad chest over a narrower waist), belt, neck and head in one mesh.
  const torso = merged((b) => {
    if (!look.pattern) {
      b.cbox(0, 0.43, 0, 0.5, 0.38, 0.27, look.shirt);
      b.cbox(0, 0.13, 0, 0.42, 0.26, 0.24, look.shirt);
    }
    b.cbox(0, 0.02, 0, 0.43, 0.08, 0.25, look.belt ?? 0x2b2116);
    b.cbox(0, 0.66, 0, 0.11, 0.08, 0.11, skin);
    b.cbox(0, 0.83, 0, 0.23, 0.27, 0.24, skin);
    b.cbox(0, 0.98, 0, 0.25, 0.07, 0.26, look.hair);
    b.cbox(0, 0.9, -0.11, 0.25, 0.16, 0.06, look.hair);
    b.cbox(0, 0.86, 0.125, 0.15, 0.035, 0.01, 0x1a1a1a);
    b.cbox(0, 0.81, 0.135, 0.04, 0.06, 0.04, skin);
    if (look.extra === 'cap') {
      b.cbox(0, 1.01, 0, 0.27, 0.08, 0.28, 0x14213d);
      b.cbox(0, 0.97, 0.17, 0.25, 0.025, 0.12, 0x14213d);
    }
    if (look.extra === 'shades' || look.extra === 'cap') b.cbox(0, 0.86, 0.13, 0.22, 0.06, 0.02, 0x111111);
    if (look.extra === 'bandana') b.cbox(0, 0.74, 0.01, 0.25, 0.1, 0.25, 0xff4d1a);
  });
  hips.add(torso);
  if (look.pattern) {
    const shirt = new THREE.Mesh(boxGeometry(0.5, 0.38, 0.27, 0.43), patternMaterial(look.pattern, look.shirt));
    const waist = new THREE.Mesh(boxGeometry(0.42, 0.26, 0.24, 0.13), shirt.material);
    shirt.castShadow = waist.castShadow = true;
    hips.add(shirt, waist);
  }
  // Arms: a short sleeve, a bare forearm (or a long sleeve) and a hand.
  const arm = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.58, 0);
    const sleeve = look.sleeve ?? look.shirt;
    pivot.add(merged((b) => {
      b.cbox(0, -0.12, 0, 0.15, 0.27, 0.15, sleeve);
      b.cbox(0, -0.39, 0, 0.11, 0.3, 0.11, look.longSleeve ? sleeve : skin);
      b.cbox(0, -0.58, 0, 0.11, 0.1, 0.12, skin);
    }));
    return pivot;
  };
  const armL = arm(0.32);
  const armR = arm(-0.32);
  hips.add(armL, armR);
  const leg = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, 0);
    pivot.add(merged((b) => {
      b.cbox(0, -0.24, 0, 0.19, 0.48, 0.2, look.pants);
      b.cbox(0, -0.68, 0, 0.16, 0.42, 0.17, look.pants);
      b.cbox(0, -0.9, 0.05, 0.17, 0.1, 0.29, look.shoes ?? 0x222222);
    }));
    return pivot;
  };
  const legL = leg(0.11);
  const legR = leg(-0.11);
  hips.add(legL, legR);
  const gun = part(0.07, 0.13, 0.36, 0x1b1b1b, 0);
  gun.position.set(0, -0.6, 0.14);
  gun.visible = false;
  armR.add(gun);
  return { group, body, hips, torso, armL, armR, legL, legR, gun };
}

const patternCache = new Map();
/** A shirt with a painted print (Nico's flowered shirt). */
function patternMaterial(kind, base) {
  const key = `${kind}|${base}`;
  if (patternCache.has(key)) return patternCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `#${new THREE.Color(base).getHexString()}`;
  ctx.fillRect(0, 0, 64, 64);
  const flower = (x, y, r, color) => {
    ctx.fillStyle = color;
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.fillStyle = '#0b7a5e';
  for (const [x, y] of [[8, 40], [40, 10], [52, 46], [22, 58]]) ctx.fillRect(x - 6, y - 2, 12, 4);
  flower(14, 14, 5, '#ff5d8f');
  flower(44, 30, 6, '#ffffff');
  flower(20, 46, 5, '#ff8a3d');
  flower(56, 6, 4, '#ff5d8f');
  flower(58, 58, 5, '#ffffff');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  patternCache.set(key, m);
  return m;
}

/**
 * Poses a person: `phase` walks the legs, `speed` (0..1) scales the stride, `aim` raises the
 * gun arm, `dead` lays the body down.
 */
export function posePerson(model, phase, speed, aim, dead, punch = 0) {
  if (dead) {
    model.body.rotation.x = -Math.PI / 2;
    model.body.position.y = 0.18;
    model.armL.rotation.set(0, 0, 0.9);
    model.armR.rotation.set(0, 0, -0.9);
    model.legL.rotation.set(0, 0, 0.15);
    model.legR.rotation.set(0, 0, -0.15);
    return;
  }
  model.body.rotation.x = 0;
  const swing = Math.sin(phase) * 0.75 * speed;
  model.body.position.y = Math.abs(Math.cos(phase)) * 0.06 * speed;
  model.legL.rotation.set(swing, 0, 0);
  model.legR.rotation.set(-swing, 0, 0);
  model.hips.rotation.x = speed * 0.08;
  if (aim) {
    model.armR.rotation.set(-Math.PI / 2 + 0.05, 0, 0);
    model.armL.rotation.set(-Math.PI / 2 + 0.25, 0, -0.45);
  } else if (punch > 0) {
    model.armR.rotation.set(-Math.PI / 2 * punch, 0, 0);
    model.armL.rotation.set(-swing * 0.8, 0, 0.05);
  } else {
    model.armL.rotation.set(-swing * 0.8, 0, 0.05);
    model.armR.rotation.set(swing * 0.8, 0, -0.05);
  }
}

// ---------------------------------------------------------------------------------------------
// Vehicles

const lightMaterials = {
  head: new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff2c0, emissiveIntensity: 0.3 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x8a0d0d, emissive: 0xff1a1a, emissiveIntensity: 0.4 }),
  red: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0022, emissiveIntensity: 0 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x1a5cff, emissiveIntensity: 0 }),
};
export function setVehicleNightLights(night) {
  lightMaterials.head.emissiveIntensity = 0.3 + night * 2.5;
  lightMaterials.tail.emissiveIntensity = 0.4 + night * 1.6;
}
export function setPoliceFlash(t) {
  const on = Math.floor(t * 6) % 2 === 0;
  lightMaterials.red.emissiveIntensity = on ? 4 : 0.1;
  lightMaterials.blue.emissiveIntensity = on ? 0.1 : 4;
}

const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
wheelGeometry.rotateZ(Math.PI / 2);
const hubGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.32, 8);
hubGeometry.rotateZ(Math.PI / 2);
const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.8, roughness: 0.3 });

const GLASS = 0x1d2a38;
const TRIM = 0x202224;

/** Adds the body boxes of one model kind to a builder; returns where its lights go. */
function shapeBody(b, kind, L, W, H, paint, accent) {
  const hl = L / 2;
  const hw = W / 2;
  if (kind === 'sunbus') {
    b.box(-hw, 0.35, -hl, hw, H, hl, paint);
    b.box(-hw - 0.01, 1.35, -hl + 1.4, hw + 0.01, 2.0, hl - 0.4, GLASS);
    b.box(-hw + 0.1, 1.2, hl - 0.01, hw - 0.1, 2.05, hl + 0.01, GLASS);
    b.box(-hw - 0.02, 0.8, -hl, hw + 0.02, 1.0, hl, accent);
    return { front: hl, rear: -hl, lightY: 0.75 };
  }
  if (kind === 'mule') {
    b.box(-hw, 0.4, -hl, hw, 1.15, hl, paint);
    b.box(-hw + 0.08, 1.15, 0.0, hw - 0.08, 1.85, 1.45, GLASS);
    b.box(-hw + 0.08, 1.85, -0.05, hw - 0.08, 1.95, 1.5, paint);
    b.box(-hw, 1.15, -hl, -hw + 0.12, 1.55, -0.2, paint);
    b.box(hw - 0.12, 1.15, -hl, hw, 1.55, -0.2, paint);
    b.box(-hw, 1.15, -hl, hw, 1.55, -hl + 0.12, paint);
    b.box(-hw - 0.05, 0.35, hl - 0.15, hw + 0.05, 0.6, hl + 0.1, 0x9a9a9a);
    return { front: hl, rear: -hl, lightY: 0.85 };
  }
  if (kind === 'vortex') {
    b.box(-hw, 0.28, -hl, hw, 0.78, hl, paint);
    b.box(-hw + 0.25, 0.78, -0.9, hw - 0.25, 1.12, 0.6, GLASS);
    b.box(-hw + 0.3, 1.12, -0.75, hw - 0.3, 1.16, 0.45, paint);
    b.box(-hw + 0.1, 0.95, -hl, hw - 0.1, 1.0, -hl + 0.35, TRIM);
    b.box(-hw + 0.3, 0.78, -hl + 0.1, -hw + 0.4, 0.95, -hl + 0.25, TRIM);
    b.box(hw - 0.4, 0.78, -hl + 0.1, hw - 0.3, 0.95, -hl + 0.25, TRIM);
    b.box(-hw - 0.01, 0.5, -0.6, hw + 0.01, 0.62, 1.4, accent);
    return { front: hl, rear: -hl, lightY: 0.6 };
  }
  if (kind === 'cabana') {
    b.box(-hw, 0.32, -hl, hw, 0.95, hl, paint);
    b.box(-hw + 0.1, 0.95, 0.55, hw - 0.1, 1.35, 0.62, GLASS);
    b.box(-hw + 0.25, 0.7, -1.3, hw - 0.25, 1.15, -0.9, 0xf3e9d2);
    b.box(-hw + 0.25, 0.7, -0.2, hw - 0.25, 1.15, 0.15, 0xf3e9d2);
    b.box(-hw - 0.01, 0.62, -hl, hw + 0.01, 0.7, hl, 0xffffff);
    return { front: hl, rear: -hl, lightY: 0.7 };
  }
  // Sedan family: brava, cab, cruiser.
  b.box(-hw, 0.32, -hl, hw, 0.95, hl, paint);
  b.box(-hw + 0.12, 0.95, -1.2, hw - 0.12, 1.42, 0.85, GLASS);
  b.box(-hw + 0.16, 1.42, -1.1, hw - 0.16, 1.48, 0.75, kind === 'cruiser' ? 0xf4f4f4 : paint);
  if (kind === 'cruiser') {
    b.box(-hw - 0.01, 0.4, -1.1, hw + 0.01, 0.95, 0.9, 0xf4f4f4);
    b.box(-hw - 0.02, 0.32, hl - 0.1, hw + 0.02, 0.62, hl + 0.2, 0x111111);
  }
  if (kind === 'cab') b.box(-0.3, 1.48, -0.3, 0.3, 1.72, 0.0, 0xfff2a8);
  b.box(-hw - 0.01, 0.55, -hl, hw + 0.01, 0.62, hl, accent);
  return { front: hl, rear: -hl, lightY: 0.72 };
}

/** A vehicle model facing +z, wheels touching y = 0. */
export function buildVehicleModel(modelId, color) {
  const spec = VEHICLES[modelId];
  const group = new THREE.Group();
  const b = new MeshBuilder();
  const accent = modelId === 'cruiser' ? 0x2b59c3 : modelId === 'cab' ? 0x111111 : new THREE.Color(color).multiplyScalar(0.55).getHex();
  const lights = shapeBody(b, modelId, spec.length, spec.width, spec.height, color, accent);
  const body = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.08 }));
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const hw = spec.width / 2;
  const lb = new MeshBuilder();
  lb.box(-hw + 0.15, lights.lightY - 0.12, lights.front - 0.02, -hw + 0.55, lights.lightY + 0.08, lights.front + 0.04);
  lb.box(hw - 0.55, lights.lightY - 0.12, lights.front - 0.02, hw - 0.15, lights.lightY + 0.08, lights.front + 0.04);
  group.add(new THREE.Mesh(lb.build(), lightMaterials.head));
  const tb = new MeshBuilder();
  tb.box(-hw + 0.12, lights.lightY - 0.1, lights.rear - 0.04, -hw + 0.6, lights.lightY + 0.08, lights.rear + 0.02);
  tb.box(hw - 0.6, lights.lightY - 0.1, lights.rear - 0.04, hw - 0.12, lights.lightY + 0.08, lights.rear + 0.02);
  group.add(new THREE.Mesh(tb.build(), lightMaterials.tail));

  if (spec.police) {
    const red = new THREE.Mesh(boxGeometry(0.55, 0.16, 0.3), lightMaterials.red);
    red.position.set(0.3, 1.56, -0.2);
    const blue = new THREE.Mesh(boxGeometry(0.55, 0.16, 0.3), lightMaterials.blue);
    blue.position.set(-0.3, 1.56, -0.2);
    group.add(red, blue);
  }

  const wheels = [];
  const axle = spec.length / 2 - 0.85;
  for (const [x, z] of [[hw - 0.12, axle], [-hw + 0.12, axle], [hw - 0.12, -axle], [-hw + 0.12, -axle]]) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(x, 0.38, z);
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.add(new THREE.Mesh(hubGeometry, hubMaterial));
    wheel.castShadow = true;
    steerPivot.add(wheel);
    group.add(steerPivot);
    wheels.push({ pivot: steerPivot, wheel, front: z > 0 });
  }
  return { group, body, wheels };
}
