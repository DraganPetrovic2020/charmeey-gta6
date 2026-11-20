// The on-screen HUD: money, clock, health and armour, weapon and ammo, wanted stars, speed and
// district name, the radar, objective line, dialogue subtitles, radio messages, toasts, hints,
// mission timer and counters, big "MISSION PASSED" banners, cutscene bars and damage flash.
import { WEAPONS } from './config.js';
import { DISTRICTS, districtAt } from './citymap.js';

const $ = (id) => document.getElementById(id);

function formatObjective(text) {
  const safe = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return safe.replace(/~([^~]+)~/g, '<em>$1</em>');
}

export function createHud() {
  const el = {
    root: $('hud'), clock: $('clock'), weapon: $('weapon-name'), ammo: $('ammo'), money: $('money'),
    health: $('health-bar'), armor: $('armor-bar'), stars: $('stars'), district: $('district'), carName: $('car-name'),
    speed: $('speed'), station: $('station'), toasts: $('toasts'), hint: $('hint'), crosshair: $('crosshair'),
    timer: $('timer'), counter: $('counter'), targetBar: $('target-bar'), targetLabel: $('target-label'), targetFill: $('target-fill'),
    radioSub: $('radio-sub'), dialogue: $('dialogue'), speaker: $('speaker'), line: $('line'), objective: $('objective'),
    big: $('bigmsg'), letterbox: $('letterbox'), damage: $('damage'), status: $('status'), help: $('help'),
  };
  const starEls = [...el.stars.children];
  let shownMoney = -1;
  let lastDistrict = '';
  let districtTimer = 0;
  let bigTimer = 0;
  let hintTimer = 0;
  let radioQueue = [];
  let radioTimer = 0;
  let helpTimer = 30;
  const bigQueue = [];
  let bigToken = 0;

  const hud = {
    show(on) {
      el.root.classList.toggle('hidden', !on);
    },
    toast(text, kind = '') {
      const t = document.createElement('div');
      t.className = `toast ${kind}`;
      t.textContent = text;
      el.toasts.appendChild(t);
      while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
      setTimeout(() => t.remove(), 3200);
      el.status.textContent = text;
    },
    hint(html) {
      el.hint.innerHTML = html;
      el.hint.classList.add('show');
      hintTimer = 0.2;
    },
    objective(text) {
      el.objective.innerHTML = text ? formatObjective(text) : '';
      if (text) el.status.textContent = text.replace(/~/g, '');
    },
    dialogue(name, color, text) {
      if (!name) {
        el.dialogue.classList.remove('show');
        return;
      }
      el.speaker.textContent = `${name}:`;
      el.speaker.style.color = color;
      el.line.textContent = text;
      el.dialogue.classList.add('show');
      el.status.textContent = `${name}: ${text}`;
    },
    radio(lines) {
      radioQueue.push(...lines);
      if (radioTimer <= 0) radioTimer = 0.01;
    },
    letterbox(on) {
      el.letterbox.classList.toggle('on', on);
      el.objective.style.visibility = on ? 'hidden' : '';
    },
    bigMessage(title, sub = '', kind = 'gold') {
      bigQueue.push({ title, sub, kind });
      if (bigTimer <= 0) nextBig();
    },
    clearBig() {
      bigQueue.length = 0;
      bigTimer = 0;
      bigToken += 1;
      el.big.classList.remove('show');
    },
    timer(t) {
      if (t === null) {
        el.timer.textContent = '';
        return;
      }
      const s = Math.max(0, t);
      el.timer.textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      el.timer.classList.toggle('low', s < 10);
    },
    counter(text) {
      el.counter.textContent = text ?? '';
    },
    targetBar(frac, label = '') {
      el.targetBar.classList.toggle('show', frac !== null);
      if (frac === null) return;
      el.targetLabel.textContent = label;
      el.targetFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    },
    flashDamage() {
      el.damage.classList.add('hit');
      requestAnimationFrame(() => requestAnimationFrame(() => el.damage.classList.remove('hit')));
    },
    pulseStars() {
      el.stars.classList.remove('pulse');
      void el.stars.offsetWidth;
      el.stars.classList.add('pulse');
    },
    bumpMoney() {
      el.money.classList.remove('bump');
      void el.money.offsetWidth;
      el.money.classList.add('bump');
    },

    /** Refreshes everything from the game state; called once a frame. */
    update(game, dt) {
      const player = game.player;
      const a = player.actor;
      const hour = game.hour;
      el.clock.textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
      const w = WEAPONS[player.current];
      el.weapon.textContent = w.name;
      el.ammo.textContent = w.melee ? '' : player.reload > 0 ? 'RELOADING' : `${player.clip[player.current]} / ${player.ammo[player.current]}`;
      if (shownMoney !== game.progress.money) {
        shownMoney = game.progress.money;
        el.money.textContent = `$${shownMoney.toLocaleString('en-US')}`;
      }
      el.health.style.width = `${Math.max(0, a.health)}%`;
      el.armor.parentElement.style.visibility = a.armor > 0 ? 'visible' : 'hidden';
      el.armor.style.width = `${Math.max(0, a.armor)}%`;
      const stars = game.police.wanted.stars;
      starEls.forEach((s, i) => s.classList.toggle('on', i < stars));
      el.stars.classList.toggle('flash', game.police.wanted.flash);

      const district = districtAt(a.x, a.z);
      if (district !== lastDistrict) {
        lastDistrict = district;
        el.district.textContent = DISTRICTS[district].name;
        el.district.classList.add('show');
        districtTimer = 4;
      }
      districtTimer -= dt;
      if (districtTimer <= 0) el.district.classList.remove('show');
      const v = player.vehicle;
      if (v) {
        el.carName.textContent = v.spec.name;
        el.speed.innerHTML = `${Math.round(Math.abs(v.speed) * 3.6)}<small>km/h</small>`;
        el.station.textContent = game.radioOn ? '♫ SUNWAVE FM 88.4' : '';
      } else {
        el.carName.textContent = '';
        el.speed.textContent = '';
        el.station.textContent = '';
      }
      const driveBy = v && (player.current === 1 || player.current === 2);
      const armed = (!v || driveBy) && player.current !== 0 && !a.dead;
      el.crosshair.classList.toggle('show', armed && (game.input.mouse.aim || game.input.mouse.fire));
      el.crosshair.classList.toggle('locked', !!game.combat.state.aimTarget);

      if (hintTimer > 0) {
        hintTimer -= dt;
        if (hintTimer <= 0) el.hint.classList.remove('show');
      }
      helpTimer -= dt;
      el.help.style.display = helpTimer > 0 ? '' : 'none';

      if (radioTimer > 0) {
        radioTimer -= dt;
        if (radioTimer <= 0) {
          const next = radioQueue.shift();
          if (next) {
            el.radioSub.innerHTML = '';
            const b = document.createElement('b');
            b.style.color = next.color;
            b.textContent = `${next.name}: `;
            el.radioSub.append(b, document.createTextNode(next.text));
            radioTimer = 2.2 + next.text.length * 0.05;
          } else el.radioSub.textContent = '';
        }
      }
      if (bigTimer > 0) {
        bigTimer -= dt;
        if (bigTimer <= 0) {
          el.big.classList.remove('show');
          if (bigQueue.length) setTimeout(nextBig, 450);
        }
      }
    },
  };

  function nextBig() {
    const m = bigQueue.shift();
    if (!m) return;
    el.big.className = m.kind;
    el.big.querySelector('h1').textContent = m.title;
    el.big.querySelector('p').textContent = m.sub;
    const token = ++bigToken;
    requestAnimationFrame(() => { if (token === bigToken) el.big.classList.add('show'); });
    bigTimer = 3.4;
    el.status.textContent = `${m.title}. ${m.sub}`;
  }

  return hud;
}
