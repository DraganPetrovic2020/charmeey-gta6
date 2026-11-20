// Plays the story: the next mission waits at its giver's marker; stepping in starts its opening
// scene, then each step (get a car, drive somewhere, lose the cops, chase and wreck a van, pick
// up an item, steal and deliver a car, clear out gunmen, race checkpoints) runs until done or
// failed. Passing pays the reward, saves, and opens the next mission.
import { MISSIONS, CAST } from './story.js';
import { removeActor, spawnActor } from './characters.js';
import { spawnVehicle } from './vehicles.js';
import { lanePoint, startCruising } from './traffic.js';
import { giveWeapon } from './player.js';

export function createMissions(game) {
  const st = {
    active: null,
    index: 0,
    step: null,
    stepState: null,
    giverMarker: null,
    giverNpc: null,
    cutscene: null,
    cleanup: [],
    objective: '',
    waypoint: null,
    timer: null,
    lastWreck: null,
    cooldown: 0,
  };

  const placeOf = (key) => game.map.places[key];

  function setObjective(text, waypoint = null) {
    st.objective = text;
    st.waypoint = waypoint;
    game.hud.objective(text);
  }

  function clearGiver() {
    st.giverMarker?.remove();
    st.giverMarker = null;
    if (st.giverNpc) removeActor(game, st.giverNpc);
    st.giverNpc = null;
  }

  /** Puts the next mission's marker (and its giver) out in the world. */
  function refreshGiver() {
    clearGiver();
    if (st.active) return;
    const m = MISSIONS[game.progress.mission];
    if (!m) return;
    const place = placeOf(m.giver);
    st.giverMarker = game.markers.column(place.x, place.z, 1.6, 0xff4fa3, 2.5);
    if (m.npc) {
      const inward = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[place.side];
      st.giverNpc = spawnActor(game, m.npc, place.x + inward[0] * 1.2, place.z + inward[1] * 1.2, { heading: Math.atan2(-inward[0], -inward[1]), persistent: true, health: 9999, state: 'npc' });
    }
  }

  function playScene(lines, onDone, focus) {
    const p = game.player.actor;
    const fx = focus?.x ?? p.x;
    const fz = focus?.z ?? p.z;
    const ang = game.camRig.yaw + 2.4;
    st.cutscene = { lines, i: 0, t: 0, onDone };
    game.camRig.cinematic = {
      pos: new game.THREE.Vector3(fx + Math.sin(ang) * 6, 2.6, fz + Math.cos(ang) * 6),
      look: new game.THREE.Vector3(fx, 1.4, fz),
    };
    game.hud.letterbox(true);
    showLine();
  }

  function showLine() {
    const c = st.cutscene;
    const [who, text] = c.lines[c.i];
    game.hud.dialogue(CAST[who].name, CAST[who].color, text);
  }

  function endScene() {
    const c = st.cutscene;
    st.cutscene = null;
    game.camRig.cinematic = null;
    game.hud.letterbox(false);
    game.hud.dialogue(null);
    c.onDone?.();
  }

  /** Advances the opening scene; Space, Enter or a click skips a line. */
  function updateScene(dt, skip) {
    const c = st.cutscene;
    c.t += dt;
    const [, text] = c.lines[c.i];
    const duration = 1.8 + text.length * 0.045;
    if (c.t > duration || skip) {
      c.i += 1;
      c.t = 0;
      if (c.i >= c.lines.length) endScene();
      else showLine();
    }
  }

  function start(m) {
    st.active = m;
    st.index = -1;
    game.player.vehicle && Math.abs(game.player.vehicle.speed) > 0 && (game.player.vehicle.vx = game.player.vehicle.vz = 0);
    st.giverMarker?.remove();
    st.giverMarker = null;
    game.hud.bigMessage(m.title.toUpperCase(), `Mission ${game.progress.mission + 1} of ${MISSIONS.length}`, 'title');
    playScene(m.intro, () => {
      if (m.give) {
        giveWeapon(game.player, m.give.weapon, m.give.ammo);
        game.player.current = m.give.weapon;
      }
      if (st.giverNpc) {
        removeActor(game, st.giverNpc);
        st.giverNpc = null;
      }
      nextStep();
    }, st.giverNpc ?? game.player.actor);
  }

  function cleanupStep() {
    for (const fn of st.cleanup) fn();
    st.cleanup = [];
    st.timer = null;
    game.hud.timer(null);
  }

  function nextStep() {
    cleanupStep();
    st.index += 1;
    const m = st.active;
    if (!m) return;
    if (st.index >= m.steps.length) {
      pass();
      return;
    }
    st.step = m.steps[st.index];
    st.stepState = {};
    beginStep(st.step, st.stepState);
  }

  function track(handle) {
    st.cleanup.push(() => handle.remove());
    return handle;
  }

  function beginStep(step, s) {
    const police = game.police;
    switch (step.type) {
      case 'getCar':
        setObjective(step.text);
        break;
      case 'goto': {
        const at = step.place ? placeOf(step.place) : step.at;
        s.at = at;
        track(game.markers.column(at.x, at.z, step.radius > 10 ? 6 : step.radius * 0.6, 0xffd23f, 3));
        setObjective(step.text, { x: at.x, z: at.z });
        break;
      }
      case 'talk':
        playScene(step.lines, nextStep, game.player.actor);
        break;
      case 'say':
        game.hud.radio(step.lines.map(([who, text]) => ({ name: CAST[who].name, color: CAST[who].color, text })));
        nextStep();
        break;
      case 'wanted':
        police.setStars(step.stars);
        setObjective(step.text);
        s.armed = 0.5;
        break;
      case 'wantedOnly':
        police.setStars(step.stars);
        nextStep();
        break;
      case 'stealCar': {
        const place = placeOf(step.place);
        const c = place.curb;
        const car = spawnVehicle(game, step.model, c.x, c.z, c.heading, { driver: null, persistent: true, color: step.color, tag: 'mission' });
        st.missionCar = car;
        s.car = car;
        track(game.markers.arrow(car, 0x4fc3ff));
        setObjective(step.text, { x: car.x, z: car.z });
        break;
      }
      case 'deliverCar': {
        const at = placeOf(step.place);
        s.at = at;
        track(game.markers.column(at.curb.x, at.curb.z, 4, 0xffd23f, 3));
        setObjective(step.text, { x: at.curb.x, z: at.curb.z });
        break;
      }
      case 'chase': {
        const pt = lanePoint(step.from, step.to, 0.4);
        const van = spawnVehicle(game, step.model, pt.x, pt.z, pt.heading, { driver: 'ai', persistent: true, tag: 'mission', color: 0xf4f0e6 });
        startCruising(van, step.from, step.to);
        van.ai.cruise = 18;
        van.health *= 0.8;
        s.van = van;
        track(game.markers.arrow(van, 0xff3b3b));
        st.cleanup.push(() => { van.persistent = false; });
        setObjective(step.text);
        break;
      }
      case 'pickup': {
        const w = st.lastWreck ?? { x: game.player.actor.x, z: game.player.actor.z };
        let x = w.x + 3;
        let z = w.z;
        if (!game.collision.isFree(x, z, 0.6)) x = w.x - 3;
        const item = game.pickups.spawn('item', x, z, { id: step.id, label: step.label });
        s.item = item;
        const off = game.events.on('itemCollected', (id) => { if (id === step.id) s.got = true; });
        st.cleanup.push(off);
        st.cleanup.push(() => { if (!s.got) game.pickups.remove(item); });
        setObjective(step.text, { x, z });
        break;
      }
      case 'eliminate': {
        s.targets = step.spawns.map((sp) => {
          const role = sp.role ?? 'gang';
          const a = spawnActor(game, role, sp.x, sp.z, { weapon: sp.weapon, state: 'guard', persistent: true, tag: 'mission', health: role === 'boss' ? 420 : 90 });
          if (role === 'boss') a.armor = 100;
          track(game.markers.arrow(a, role === 'boss' ? 0xffd23f : 0xff3b3b));
          return a;
        });
        st.cleanup.push(() => { for (const a of s.targets) a.persistent = false; });
        setObjective(step.text);
        break;
      }
      case 'race': {
        s.i = 0;
        st.timer = step.time;
        s.marker = null;
        const place = () => {
          s.marker?.remove();
          const [x, z] = step.checkpoints[s.i];
          s.marker = game.markers.column(x, z, 7, s.i === step.checkpoints.length - 1 ? 0x7dff6a : 0x45d4ff, 4);
          setObjective(`${step.text} (${s.i + 1}/${step.checkpoints.length})`, { x, z });
        };
        s.place = place;
        place();
        st.cleanup.push(() => s.marker?.remove());
        break;
      }
      default:
        nextStep();
    }
  }

  function updateStep(dt) {
    const step = st.step;
    const s = st.stepState;
    const player = game.player;
    const a = player.actor;
    switch (step.type) {
      case 'getCar':
        if (player.vehicle && !player.vehicle.dead) nextStep();
        break;
      case 'goto': {
        const d = Math.hypot(a.x - s.at.x, a.z - s.at.z);
        if (step.inVehicle && !player.vehicle) break;
        if (d < step.radius && (!player.vehicle || Math.abs(player.vehicle.speed) < 12)) {
          if (player.vehicle) player.vehicle.controls.handbrake = 1;
          nextStep();
        }
        break;
      }
      case 'wanted':
        s.armed -= dt;
        if (s.armed < 0 && game.police.wanted.stars === 0) {
          game.hud.toast('Lost the cops', 'good');
          nextStep();
        }
        break;
      case 'stealCar':
        if (s.car.dead || s.car.removed) fail('The Vortex was destroyed');
        else if (player.vehicle === s.car) nextStep();
        break;
      case 'deliverCar': {
        const car = st.missionCar;
        if (!car || car.dead || car.removed) {
          fail('The car was destroyed');
          break;
        }
        if (car.health < car.spec.health * step.minHealth) {
          fail('The car is wrecked');
          break;
        }
        if (player.vehicle !== car) {
          setObjective('Get back in the ~Vortex GT~', { x: car.x, z: car.z });
          s.out = true;
          break;
        }
        if (s.out) {
          s.out = false;
          setObjective(step.text, { x: s.at.curb.x, z: s.at.curb.z });
        }
        if (Math.hypot(car.x - s.at.curb.x, car.z - s.at.curb.z) < 6 && Math.abs(car.speed) < 6) {
          car.controls.handbrake = 1;
          nextStep();
        }
        break;
      }
      case 'chase': {
        const van = s.van;
        game.hud.targetBar(van.health / van.spec.health, 'Courier van');
        if (van.dead) {
          st.lastWreck = { x: van.x, z: van.z };
          game.hud.targetBar(null);
          nextStep();
          break;
        }
        const d = Math.hypot(van.x - a.x, van.z - a.z);
        if (d < 60 && van.ai) van.ai.panic = 2;
        st.waypoint = { x: van.x, z: van.z };
        if (d > 320) {
          game.hud.targetBar(null);
          fail('The courier van got away');
        }
        break;
      }
      case 'pickup':
        if (s.got) nextStep();
        break;
      case 'eliminate': {
        const left = s.targets.filter((t) => !t.dead).length;
        game.hud.counter(left > 0 ? `${left} left` : null);
        if (left === 0) {
          game.hud.counter(null);
          nextStep();
        }
        break;
      }
      case 'race': {
        st.timer -= dt;
        game.hud.timer(st.timer);
        const [x, z] = step.checkpoints[s.i];
        if (player.vehicle && Math.hypot(a.x - x, a.z - z) < 9) {
          game.audio.ui();
          s.i += 1;
          if (s.i >= step.checkpoints.length) {
            game.hud.toast(`Finished with ${st.timer.toFixed(1)}s to spare`, 'good');
            nextStep();
            break;
          }
          st.timer += 2;
          s.place();
        }
        if (st.timer <= 0) fail('Out of time');
        break;
      }
      default:
        break;
    }
  }

  function pass() {
    const m = st.active;
    cleanupStep();
    st.active = null;
    st.step = null;
    game.progress.mission += 1;
    game.progress.passed.push(m.id);
    game.addMoney(m.reward, false);
    game.stats.missions += 1;
    setObjective('');
    game.hud.bigMessage('MISSION PASSED', `$${m.reward.toLocaleString()}`, 'gold');
    game.audio.passed();
    if (game.progress.mission >= MISSIONS.length) {
      setTimeout(() => game.hud.bigMessage('PALMERA HEAT', 'Story complete. The Keys are yours: keep exploring, find every mixtape.', 'title'), 4500);
    }
    st.cooldown = 4;
    game.saveGame(true);
    refreshGiver();
    const next = MISSIONS[game.progress.mission];
    if (next) setTimeout(() => game.hud.toast(`New mission: ${next.title} (pink marker on the radar)`, 'tape'), 4000);
  }

  function fail(reason) {
    if (!st.active) return;
    cleanupStep();
    if (st.cutscene) endScene();
    st.active = null;
    st.step = null;
    st.missionCar = null;
    game.hud.counter(null);
    game.hud.targetBar(null);
    setObjective('');
    game.hud.bigMessage('MISSION FAILED', reason, 'red');
    game.audio.failed();
    st.cooldown = 5;
    refreshGiver();
  }

  game.events.on('playerDied', () => fail('You were wasted'));
  game.events.on('busted', () => fail('You were busted'));

  function update(dt, skip) {
    st.cooldown -= dt;
    if (st.cutscene) {
      updateScene(dt, skip);
      return;
    }
    if (st.active) {
      updateStep(dt);
      return;
    }
    const m = MISSIONS[game.progress.mission];
    if (!m || !st.giverMarker || st.cooldown > 0) return;
    const place = placeOf(m.giver);
    const a = game.player.actor;
    const d = Math.hypot(a.x - place.x, a.z - place.z);
    if (d < 2.2 && !a.dead) {
      if (game.police.wanted.stars > 0) game.hud.hint('Lose your wanted level to start the mission');
      else if (game.player.vehicle) game.hud.hint('Get out of the car to start the mission');
      else start(m);
    }
    if (st.giverNpc && d < 12) {
      st.giverNpc.heading = Math.atan2(a.x - st.giverNpc.x, a.z - st.giverNpc.z);
    }
  }

  /** Blips the minimap shows for the mission: the giver, targets and the destination. */
  function blips() {
    const out = [];
    if (!st.active) {
      const m = MISSIONS[game.progress.mission];
      if (m) {
        const p = placeOf(m.giver);
        out.push({ x: p.x, z: p.z, color: '#ff4fa3', label: CAST[(m.npc ?? 'nico').toUpperCase()]?.name?.[0] ?? 'N', big: true });
      }
      return out;
    }
    const s = st.stepState ?? {};
    if (s.targets) for (const t of s.targets) if (!t.dead) out.push({ x: t.x, z: t.z, color: t.role === 'boss' ? '#ffd23f' : '#ff3b3b' });
    if (s.van && !s.van.dead) out.push({ x: s.van.x, z: s.van.z, color: '#ff3b3b', big: true });
    if (s.car && !s.car.dead && game.player.vehicle !== s.car) out.push({ x: s.car.x, z: s.car.z, color: '#4fc3ff', big: true });
    if (st.waypoint) out.push({ x: st.waypoint.x, z: st.waypoint.z, color: '#ffd23f', big: true, waypoint: true });
    return out;
  }

  return {
    state: st,
    update,
    refreshGiver,
    blips,
    fail,
    get inCutscene() { return !!st.cutscene; },
    get active() { return st.active; },
    get waypoint() { return st.waypoint; },
    /** Drops any mission in progress without a banner (new game, loading). */
    reset() {
      cleanupStep();
      st.cutscene = null;
      game.camRig.cinematic = null;
      game.hud.letterbox(false);
      game.hud.dialogue(null);
      st.active = null;
      st.step = null;
      st.missionCar = null;
      st.waypoint = null;
      clearGiver();
    },
    /** Starts a mission straight away (used to stage screenshots). */
    forceStart(index) {
      game.progress.mission = index;
      clearGiver();
      start(MISSIONS[index]);
      while (st.cutscene) endScene();
    },
    skipTo(stepIndex) {
      while (st.active && st.index < stepIndex) nextStep();
    },
  };
}
