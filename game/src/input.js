// Keyboard and mouse: held keys, presses since the last frame, mouse look (pointer lock) and the
// fire / aim buttons and wheel. Games read intents (move, steer, fire) instead of raw keys.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { dx: 0, dy: 0, fire: false, aim: false, firePressed: false, wheel: 0, locked: false };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    held.add(e.code);
    pressed.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.fire = false;
    mouse.aim = false;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.fire = true;
      mouse.firePressed = true;
    }
    if (e.button === 2) mouse.aim = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.fire = false;
    if (e.button === 2) mouse.aim = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    if (!mouse.locked) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });
  window.addEventListener('wheel', (e) => {
    mouse.wheel += Math.sign(e.deltaY);
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
  });

  return {
    mouse,
    held: (code) => held.has(code),
    pressed: (code) => pressed.has(code),
    lockPointer() {
      if (!mouse.locked && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch {
          // Pointer lock may be refused (an embedded frame); the arrow keys still turn the camera.
        }
      }
    },
    releasePointer() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    /** Movement axes from WASD / arrows: x is right (+1) / left (-1), y is forward. */
    axes() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      return { x, y };
    },
    /** Call once per frame after the game has read this frame's presses and mouse motion. */
    endFrame() {
      pressed.clear();
      mouse.dx = 0;
      mouse.dy = 0;
      mouse.wheel = 0;
      mouse.firePressed = false;
    },
  };
}
