// Side activities between story missions. Vigilante: steal a PKPD Cruiser and press V to take
// calls from dispatch; each call is a suspect's car fleeing somewhere in the city that has to be
// wrecked before the clock runs out. Every level pays more and makes the suspects faster.
import { spawnTrafficCar } from './traffic.js';

const SUSPECT_MODELS = ['brava', 'mule', 'cabana', 'vortex'];

export function createActivities(game) {
  const st = { active: false, level: 0, target: null, arrow: null, timer: 0, wait: 0 };

  function clearTarget() {
    st.arrow?.remove();
    st.arrow = null;
    if (st.target) st.target.persistent = false;
    st.target = null;
  }

  function nextCall() {
    clearTarget();
    const model = SUSPECT_MODELS[Math.min(SUSPECT_MODELS.length - 1, Math.floor(st.level / 2))];
    const car = spawnTrafficCar(game, 70, 170, model);
    if (!car) {
      st.wait = 0.5;
      return;
    }
    car.persistent = true;
    car.tag = 'suspect';
    car.ai.cruise = 15 + st.level * 1.5;
    st.target = car;
    st.arrow = game.markers.arrow(car, 0xff3b3b);
    st.timer = 100 + st.level * 5;
    game.hud.radio([{ name: 'PKPD Dispatch', color: '#7fb2ff', text: `Level ${st.level + 1}: suspect fleeing in a ${car.spec.name}. Take them down.` }]);
    game.hud.objective('Vigilante: wreck the ~suspect~ car');
  }

  function start() {
    st.active = true;
    st.level = 0;
    game.hud.bigMessage('VIGILANTE', 'Wreck the suspects before they get away', 'title');
    nextCall();
  }

  function stop(reason) {
    if (!st.active) return;
    st.active = false;
    clearTarget();
    game.hud.timer(null);
    game.hud.targetBar(null);
    game.hud.objective('');
    game.hud.bigMessage('VIGILANTE OVER', reason, 'red');
    game.stats.vigilanteBest = Math.max(game.stats.vigilanteBest ?? 0, st.level);
  }

  game.events.on('vehicleExploded', (v) => {
    if (!st.active || v !== st.target) return;
    st.level += 1;
    const reward = 300 + st.level * 250;
    game.addMoney(reward, false);
    game.hud.bigMessage('SUSPECT DOWN', `+$${reward} · level ${st.level} cleared`, 'gold');
    game.audio.passed();
    clearTarget();
    st.wait = 3;
  });

  function update(dt, input) {
    const v = game.player.vehicle;
    if (!st.active) {
      if (v && v.modelId === 'cruiser' && !game.missions.active && !game.missions.inCutscene) {
        game.hud.hint('<kbd>V</kbd> Start Vigilante duty');
        if (input.pressed('KeyV')) start();
      }
      return;
    }
    if (!v || v.modelId !== 'cruiser') {
      stop('You left the cruiser');
      return;
    }
    if (game.missions.active) {
      stop('A story mission started');
      return;
    }
    if (input.pressed('KeyV')) {
      stop('Off duty');
      return;
    }
    if (st.wait > 0) {
      st.wait -= dt;
      if (st.wait <= 0) nextCall();
      return;
    }
    const t = st.target;
    if (!t || t.removed) {
      nextCall();
      return;
    }
    st.timer -= dt;
    game.hud.timer(st.timer);
    game.hud.targetBar(t.health / t.spec.health, 'Suspect');
    const d = Math.hypot(t.x - v.x, t.z - v.z);
    if (d < 70 && t.ai) t.ai.panic = 2;
    if (st.timer <= 0 || d > 340) stop('The suspect got away');
  }

  function blips() {
    if (!st.active || !st.target || st.target.dead) return [];
    return [{ x: st.target.x, z: st.target.z, color: '#ff3b3b', big: true }];
  }

  return { update, blips, stop, get active() { return st.active; } };
}
