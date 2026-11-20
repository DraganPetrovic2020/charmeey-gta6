// Things drawn in the world to show where to go: glowing cylinders on the ground for mission
// destinations, shops and the safehouse, and bobbing arrows over targets to chase or kill.
import * as THREE from '../vendor/three.min.js';

const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
cylinderGeometry.translate(0, 0.5, 0);
const ringGeometry = new THREE.RingGeometry(0.85, 1, 40);
ringGeometry.rotateX(-Math.PI / 2);
const arrowGeometry = new THREE.ConeGeometry(0.55, 1.1, 4);
arrowGeometry.rotateX(Math.PI);

function glowMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
}

export function createMarkers(scene) {
  const live = new Set();

  /** A column of light at (x, z) with the given radius. Returns a handle with remove(). */
  function column(x, z, radius, color = 0xffd23f, height = 3) {
    const group = new THREE.Group();
    const cyl = new THREE.Mesh(cylinderGeometry, glowMaterial(color, 0.28));
    cyl.scale.set(radius, height, radius);
    const ring = new THREE.Mesh(ringGeometry, glowMaterial(color, 0.8));
    ring.scale.set(radius, 1, radius);
    ring.position.y = 0.25;
    group.add(cyl, ring);
    group.position.set(x, 0, z);
    scene.add(group);
    const handle = { group, x, z, radius, kind: 'column', t: Math.random() * 6, remove: () => { scene.remove(group); live.delete(handle); } };
    live.add(handle);
    return handle;
  }

  /** An arrow that follows a thing (anything with x, z) above its head or roof. */
  function arrow(target, color = 0xff3b3b, height = 3.2) {
    const mesh = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({ color, fog: false }));
    scene.add(mesh);
    const handle = { mesh, target, height, kind: 'arrow', t: 0, remove: () => { scene.remove(mesh); live.delete(handle); } };
    live.add(handle);
    return handle;
  }

  function update(dt) {
    for (const h of live) {
      h.t += dt;
      if (h.kind === 'column') {
        const s = 1 + Math.sin(h.t * 3) * 0.04;
        h.group.children[1].scale.set(h.radius * s, 1, h.radius * s);
        h.group.children[0].material.opacity = 0.22 + Math.sin(h.t * 2) * 0.06;
      } else {
        const t = h.target;
        h.mesh.visible = !t.removed && !t.dead;
        h.mesh.position.set(t.x, h.height + Math.sin(h.t * 4) * 0.25 + (t.spec ? t.spec.height : 0), t.z);
        h.mesh.rotation.y += dt * 2.5;
      }
    }
  }

  function clearAll() {
    for (const h of [...live]) h.remove();
  }

  return { column, arrow, update, clearAll };
}
