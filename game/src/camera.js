// The third-person camera: an over-the-shoulder orbit on foot (closer when aiming), a chase
// camera behind cars that swings back behind the bonnet when the mouse is left alone, a wider
// view and lens at speed, walls pulling it in, and shake from crashes and blasts.
import * as THREE from '../vendor/three.min.js';

export function createCameraRig(camera, collision) {
  const rig = {
    yaw: 0,
    pitch: 0.18,
    distance: 5.5,
    shake: 0,
    idle: 0,
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    cinematic: null,
  };

  rig.addShake = (amount) => {
    rig.shake = Math.min(1, rig.shake + amount);
  };

  /** Mouse (and arrow-free Q/E) turn the orbit. */
  rig.turn = (dx, dy) => {
    rig.yaw -= dx * 0.0025;
    rig.pitch = THREE.MathUtils.clamp(rig.pitch + dy * 0.002, -0.35, 1.1);
    if (dx !== 0 || dy !== 0) rig.idle = 0;
  };

  /** Puts the camera behind the target. `vehicle` switches to the chase camera. */
  rig.update = (dt, target, vehicle, aiming) => {
    rig.idle += dt;
    if (rig.cinematic) {
      camera.position.lerp(rig.cinematic.pos, Math.min(1, dt * 2));
      rig.look.lerp(rig.cinematic.look, Math.min(1, dt * 2));
      camera.lookAt(rig.look);
      return;
    }
    let want;
    let focus;
    let fov;
    if (vehicle) {
      const speed = Math.hypot(vehicle.vx, vehicle.vz);
      if (rig.idle > 1.2) {
        // Swing back behind the car, toward where it is travelling.
        const travel = speed > 2 ? Math.atan2(vehicle.vx, vehicle.vz) : vehicle.heading;
        const heading = vehicle.speed < -1 ? vehicle.heading : travel;
        let d = heading - rig.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        rig.yaw += d * Math.min(1, dt * 3);
        rig.pitch += (0.2 - rig.pitch) * Math.min(1, dt * 2);
      }
      const dist = vehicle.spec.length * 1.45 + 3 + speed * 0.06;
      const height = 1.6 + vehicle.spec.height * 0.6;
      focus = new THREE.Vector3(vehicle.x, height, vehicle.z);
      want = new THREE.Vector3(
        vehicle.x - Math.sin(rig.yaw) * dist * Math.cos(rig.pitch),
        height + Math.sin(rig.pitch) * dist + 0.8,
        vehicle.z - Math.cos(rig.yaw) * dist * Math.cos(rig.pitch),
      );
      fov = 62 + Math.min(18, speed * 0.4);
    } else {
      const dist = aiming ? 3.4 : 4.8;
      const side = aiming ? 0.95 : 0.5;
      const rx = -Math.cos(rig.yaw);
      const rz = Math.sin(rig.yaw);
      focus = new THREE.Vector3(target.x + rx * side, 1.65 + target.y, target.z + rz * side);
      want = new THREE.Vector3(
        focus.x - Math.sin(rig.yaw) * dist * Math.cos(rig.pitch),
        focus.y + Math.sin(rig.pitch) * dist + 0.2,
        focus.z - Math.cos(rig.yaw) * dist * Math.cos(rig.pitch),
      );
      fov = aiming ? 52 : 62;
    }
    // Pull in when a wall is between the target and the camera.
    const dir = want.clone().sub(focus);
    const len = dir.length();
    dir.divideScalar(len);
    const hit = collision.raycast(focus.x, focus.y, focus.z, dir.x, dir.y, dir.z, len);
    if (hit < len) want.copy(focus).addScaledVector(dir, Math.max(0.8, hit - 0.4));
    if (want.y < 0.4) want.y = 0.4;
    const follow = vehicle ? 1 - Math.exp(-dt * 12) : 1 - Math.exp(-dt * 22);
    rig.pos.lerp(want, follow);
    if (rig.pos.distanceTo(want) > 30) rig.pos.copy(want);
    camera.position.copy(rig.pos);
    rig.look.copy(focus);
    if (rig.shake > 0) {
      const s = rig.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
      rig.shake = Math.max(0, rig.shake - dt * 1.8);
    }
    camera.lookAt(rig.look);
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  };

  /** Snaps the camera into place (after a teleport or for a screenshot). */
  rig.snap = (target, vehicle) => {
    rig.pos.set(1e6, 0, 0);
    rig.update(1, target, vehicle, false);
    rig.pos.copy(camera.position);
  };

  return rig;
}
