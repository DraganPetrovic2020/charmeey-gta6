// The sky and the sun: a gradient sky dome with a sun glow, the sun light with its shadow box
// following the player, the fill light, the fog, and the colours of each hour from dawn through
// a pink-orange sunset to a blue night.
import * as THREE from '../vendor/three.min.js';

/** Key colours through the day: [hour, zenith, horizon, sun colour, sun intensity, ambient]. */
const KEYS = [
  [0, 0x050b1e, 0x1b2550, 0x8fa8ff, 0.25, 0.32],
  [5, 0x0d1735, 0x3a3d6e, 0x9fb0ff, 0.25, 0.34],
  [6.3, 0x3f5a9a, 0xffa27a, 0xffb27a, 1.2, 0.55],
  [8, 0x3d8bdc, 0xbfe3ff, 0xfff0d8, 2.6, 0.85],
  [13, 0x2f7fe0, 0xcdeaff, 0xffffff, 3.1, 0.95],
  [16.5, 0x3a83d6, 0xffe0b0, 0xffe3b5, 2.8, 0.85],
  [18.2, 0x3f4f9e, 0xff8a5c, 0xff9a5a, 2.1, 0.7],
  [19.3, 0x2a2a66, 0xff5e78, 0xff7a6a, 0.9, 0.5],
  [20.5, 0x0b1230, 0x2c2a5e, 0x8fa8ff, 0.3, 0.36],
  [24, 0x050b1e, 0x1b2550, 0x8fa8ff, 0.25, 0.32],
];

const vertexShader = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const fragmentShader = `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float night;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);
  // Stars at night.
  vec3 cell = floor(d * 220.0);
  float star = step(0.9975, hash(cell)) * night * smoothstep(0.05, 0.4, d.y);
  col += vec3(star);
  // Warm haze band at the horizon.
  col = mix(col, horizon * 1.08, smoothstep(0.12, 0.0, abs(d.y)) * 0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

function lerpKeys(hour) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i += 1) {
    if (hour >= KEYS[i][0] && hour <= KEYS[i + 1][0]) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const t = (hour - a[0]) / Math.max(0.0001, b[0] - a[0]);
  const mix = (ca, cb) => new THREE.Color(ca).lerp(new THREE.Color(cb), t);
  return { zenith: mix(a[1], b[1]), horizon: mix(a[2], b[2]), sun: mix(a[3], b[3]), intensity: a[4] + (b[4] - a[4]) * t, ambient: a[5] + (b[5] - a[5]) * t };
}

export function createSky(scene, renderer) {
  const uniforms = {
    zenith: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunColor: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    night: { value: 0 },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false, fog: false }));
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const box = 110;
  Object.assign(sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box, near: 1, far: 600 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  const fill = new THREE.HemisphereLight(0xbfdcff, 0xd9b48a, 0.9);
  scene.add(fill);
  scene.fog = new THREE.Fog(0xffffff, 160, 900);

  const state = { hour: 12, night: 0 };

  /** Moves the sun to the hour and keeps the shadow box on `focus` (a Vector3). */
  function update(hour, focus) {
    state.hour = hour;
    const k = lerpKeys(hour);
    // The sun rises behind the city in the west (-x) and sets over the ocean in the east (+x).
    const angle = ((hour - 6) / 12) * Math.PI;
    const elevation = Math.sin(angle);
    const dir = new THREE.Vector3(-Math.cos(angle), Math.max(elevation, -0.3), 0.35).normalize();
    const lightDir = dir.clone();
    // Keep the light low but not grazing at sunset so the city stays readable.
    if (lightDir.y < 0.28) {
      lightDir.y = 0.28;
      lightDir.normalize();
    }
    sun.position.copy(focus).addScaledVector(lightDir, 300);
    sun.target.position.copy(focus);
    sun.color.copy(k.sun);
    sun.intensity = k.intensity;
    fill.intensity = k.ambient;
    fill.color.copy(k.zenith).lerp(new THREE.Color(0xffffff), 0.55);
    fill.groundColor.copy(k.horizon).multiplyScalar(0.6);
    uniforms.zenith.value.copy(k.zenith);
    uniforms.horizon.value.copy(k.horizon);
    uniforms.sunColor.value.copy(k.sun);
    uniforms.sunDir.value.copy(dir);
    state.night = THREE.MathUtils.clamp(1 - (k.intensity - 0.3) / 1.4, 0, 1);
    uniforms.night.value = state.night;
    scene.fog.color.copy(k.horizon).lerp(k.zenith, 0.25);
    dome.position.copy(focus);
    renderer.toneMappingExposure = 1.0 + state.night * 0.25;
  }

  return { update, state, sun };
}
