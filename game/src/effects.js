// Visual effects: particle systems for smoke, fire, sparks, blood, dust and explosions (soft
// point sprites, glowing ones blended additively), bullet tracers, muzzle flashes and the
// short-lived light of a blast.
import * as THREE from '../vendor/three.min.js';
import { rand } from './rng.js';

const vertexShader = `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
void main() {
  vAlpha = alpha;
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (520.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = `
varying float vAlpha;
varying vec3 vTint;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.1, d);
  gl_FragColor = vec4(vTint, vAlpha * soft);
}`;

function createSystem(scene, capacity, additive) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(capacity * 3);
  const tint = new Float32Array(capacity * 3);
  const size = new Float32Array(capacity);
  const alpha = new Float32Array(capacity);
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  const particles = [];
  for (let i = 0; i < capacity; i += 1) particles.push({ life: 0 });
  let cursor = 0;
  return {
    emit(x, y, z, vx, vy, vz, life, size0, size1, color, a0 = 1, gravity = 0, drag = 0) {
      const p = particles[cursor];
      cursor = (cursor + 1) % capacity;
      Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, size0, size1, a0, gravity, drag });
      p.color = color instanceof THREE.Color ? color : new THREE.Color(color);
    },
    update(dt) {
      for (let i = 0; i < capacity; i += 1) {
        const p = particles[i];
        if (p.life <= 0) {
          alpha[i] = 0;
          size[i] = 0;
          continue;
        }
        p.life -= dt;
        p.vy -= p.gravity * dt;
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < 0.05) {
          p.y = 0.05;
          p.vy = Math.abs(p.vy) * 0.3;
        }
        const t = 1 - Math.max(0, p.life) / p.max;
        position[i * 3] = p.x;
        position[i * 3 + 1] = p.y;
        position[i * 3 + 2] = p.z;
        tint[i * 3] = p.color.r;
        tint[i * 3 + 1] = p.color.g;
        tint[i * 3 + 2] = p.color.b;
        size[i] = p.size0 + (p.size1 - p.size0) * t;
        alpha[i] = p.a0 * (1 - t) * Math.min(1, t * 8 + 0.3);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.tint.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
      geometry.attributes.alpha.needsUpdate = true;
    },
  };
}

export function createEffects(scene) {
  const glow = createSystem(scene, 1400, true);
  const dust = createSystem(scene, 1600, false);

  // Tracers: a pool of short line segments that fade out.
  const tracerCount = 64;
  const tracerPositions = new Float32Array(tracerCount * 6);
  const tracerGeometry = new THREE.BufferGeometry();
  tracerGeometry.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3));
  const tracerMaterial = new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
  const tracers = new THREE.LineSegments(tracerGeometry, tracerMaterial);
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerLife = new Float32Array(tracerCount);
  let tracerCursor = 0;

  // A few pooled lights for muzzle flashes and blasts.
  const flashes = [];
  for (let i = 0; i < 4; i += 1) {
    const light = new THREE.PointLight(0xffb060, 0, 14, 2);
    scene.add(light);
    flashes.push({ light, life: 0, max: 1, power: 0 });
  }
  let flashCursor = 0;
  function flash(x, y, z, power, life, color = 0xffb060) {
    const f = flashes[flashCursor];
    flashCursor = (flashCursor + 1) % flashes.length;
    f.light.position.set(x, y, z);
    f.light.color.set(color);
    f.light.distance = power > 50 ? 40 : 14;
    f.life = life;
    f.max = life;
    f.power = power;
  }

  const fx = {
    smoke(x, y, z, dark = false) {
      const shade = dark ? rand.range(0.08, 0.2) : rand.range(0.5, 0.7);
      dust.emit(x + rand.range(-0.3, 0.3), y, z + rand.range(-0.3, 0.3), rand.range(-0.4, 0.4), rand.range(1.2, 2.4), rand.range(-0.4, 0.4), rand.range(1.5, 2.6), 0.8, 3.2, new THREE.Color(shade, shade, shade), 0.55, -0.3, 0.6);
    },
    fire(x, y, z) {
      glow.emit(x + rand.range(-0.6, 0.6), y, z + rand.range(-0.6, 0.6), rand.range(-0.3, 0.3), rand.range(2, 4), rand.range(-0.3, 0.3), rand.range(0.4, 0.8), 1.4, 0.3, new THREE.Color().setHSL(rand.range(0.02, 0.1), 1, 0.55), 0.9);
    },
    sparks(x, y, z, count = 10) {
      for (let i = 0; i < count; i += 1) {
        glow.emit(x, y, z, rand.range(-6, 6), rand.range(1, 6), rand.range(-6, 6), rand.range(0.2, 0.5), 0.18, 0.05, 0xffd27a, 1, 14, 1);
      }
    },
    blood(x, y, z, dx, dz) {
      for (let i = 0; i < 8; i += 1) {
        dust.emit(x, y, z, dx * 2 + rand.range(-1.5, 1.5), rand.range(0, 2.5), dz * 2 + rand.range(-1.5, 1.5), rand.range(0.3, 0.6), 0.25, 0.15, 0xa4161a, 0.9, 9, 1);
      }
    },
    dust(x, y, z) {
      dust.emit(x + rand.range(-0.4, 0.4), y, z + rand.range(-0.4, 0.4), rand.range(-0.5, 0.5), rand.range(0.2, 0.8), rand.range(-0.5, 0.5), rand.range(0.6, 1.2), 0.5, 1.8, 0xc9c2b3, 0.35, 0, 1);
    },
    impact(x, y, z) {
      for (let i = 0; i < 4; i += 1) glow.emit(x, y, z, rand.range(-3, 3), rand.range(0, 3), rand.range(-3, 3), 0.2, 0.15, 0.04, 0xffe0a0, 1, 10, 2);
      dust.emit(x, y, z, 0, 0.5, 0, 0.5, 0.3, 0.9, 0xb5ada0, 0.5);
    },
    muzzle(x, y, z) {
      glow.emit(x, y, z, 0, 0, 0, 0.06, 0.9, 0.4, 0xffd27a, 1);
      flash(x, y, z, 6, 0.06);
    },
    tracer(x0, y0, z0, x1, y1, z1) {
      const i = tracerCursor;
      tracerCursor = (tracerCursor + 1) % tracerCount;
      tracerPositions.set([x0, y0, z0, x1, y1, z1], i * 6);
      tracerLife[i] = 0.07;
    },
    explosion(x, y, z) {
      for (let i = 0; i < 70; i += 1) {
        const a = rand.next() * Math.PI * 2;
        const s = rand.range(2, 11);
        glow.emit(x, y, z, Math.cos(a) * s, rand.range(1, 9), Math.sin(a) * s, rand.range(0.4, 1.1), rand.range(2, 4), 0.5, new THREE.Color().setHSL(rand.range(0.0, 0.12), 1, rand.range(0.45, 0.65)), 1, -1, 2.5);
      }
      for (let i = 0; i < 40; i += 1) {
        const a = rand.next() * Math.PI * 2;
        const s = rand.range(1, 5);
        const shade = rand.range(0.1, 0.3);
        dust.emit(x, y + 1, z, Math.cos(a) * s, rand.range(2, 7), Math.sin(a) * s, rand.range(2, 4), 2, 7, new THREE.Color(shade, shade, shade), 0.7, -0.4, 1.2);
      }
      fx.sparks(x, y, z, 30);
      flash(x, y + 2, z, 120, 0.6, 0xff8a3a);
    },
    update(dt) {
      glow.update(dt);
      dust.update(dt);
      for (let i = 0; i < tracerCount; i += 1) {
        if (tracerLife[i] > 0) {
          tracerLife[i] -= dt;
          if (tracerLife[i] <= 0) tracerPositions.fill(0, i * 6, i * 6 + 6);
        }
      }
      tracerGeometry.attributes.position.needsUpdate = true;
      for (const f of flashes) {
        if (f.life > 0) {
          f.life -= dt;
          f.light.intensity = Math.max(0, f.life / f.max) * f.power;
        } else f.light.intensity = 0;
      }
    },
  };
  return fx;
}
