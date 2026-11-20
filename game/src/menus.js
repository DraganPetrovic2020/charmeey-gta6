// The menus: the title screen (continue, new game, controls, sound), the pause screen with the
// city map, stats and save, the controls card, the Iron Coast Arms shop, and the WASTED and
// BUSTED cards.
import { WEAPONS } from './config.js';
import { describeSave, readSave } from './save.js';
import { giveWeapon } from './player.js';

const $ = (id) => document.getElementById(id);

export function createMenus(game, handlers) {
  const title = $('title-screen');
  const pause = $('pause-screen');
  const controls = $('controls-screen');
  const shop = $('shop');
  const death = $('death-screen');
  const state = { screen: 'title', shopOpen: false };

  function bind(container, actions) {
    container.querySelectorAll('button[data-action]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        game.audio.init();
        game.audio.ui();
        actions[b.dataset.action]?.(b);
      });
    });
  }

  bind(title, {
    continue: () => handlers.continueGame(),
    new: () => handlers.newGame(),
    controls: () => controls.classList.remove('hidden'),
    sound: (b) => {
      const muted = game.audio.toggleMute();
      b.textContent = `Sound: ${muted ? 'Off' : 'On'}`;
    },
  });
  bind(pause, {
    resume: () => handlers.resume(),
    save: () => {
      if (game.missions.active) game.hud.toast('You cannot save during a mission', 'bad');
      else game.saveGame(false);
      refreshStats();
    },
    controls: () => controls.classList.remove('hidden'),
    radio: (b) => {
      game.radioOn = game.audio.toggleRadio();
      b.textContent = `Radio: ${game.radioOn ? 'On' : 'Off'}`;
    },
    quit: () => handlers.quit(),
  });
  bind(controls, { back: () => controls.classList.add('hidden') });

  function refreshTitle() {
    const save = readSave();
    title.querySelector('[data-action="continue"]').disabled = !save;
    $('save-info').textContent = save ? describeSave(save) : 'No saved game yet';
  }

  function refreshStats() {
    const s = game.stats;
    const p = game.progress;
    const rows = [
      ['Story missions', `${p.mission} / 7`],
      ['Mixtapes found', `${p.tapes.filter(Boolean).length} / 12`],
      ['Money', `$${p.money.toLocaleString('en-US')}`],
      ['Cars stolen', s.carsStolen],
      ['Distance driven', `${(s.driven / 1000).toFixed(1)} km`],
      ['Highest wanted level', '★'.repeat(s.maxStars) || '-'],
      ['Wasted / Busted', `${s.wasted} / ${s.busted}`],
    ];
    $('stats').innerHTML = rows.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  }

  function renderShop() {
    const list = $('shop-list');
    const player = game.player;
    const rows = [];
    WEAPONS.forEach((w, i) => {
      if (w.melee) return;
      const free = w.id === 'rifle' && game.progress.tapes.filter(Boolean).length === 12;
      const owned = player.owned[i];
      const price = owned ? w.ammoPrice : free ? 0 : w.price;
      const what = owned ? `${w.name} ammo (+${w.mag * 2})` : w.name;
      rows.push(`<span class="k">${i}</span><span class="${owned ? 'owned' : ''}">${what}</span><span class="price">$${price}</span>`);
    });
    rows.push(`<span class="k">5</span><span>Body armour (full)</span><span class="price">$300</span>`);
    list.innerHTML = rows.join('');
  }

  function buy(key) {
    const player = game.player;
    if (key === 5) {
      if (game.progress.money < 300 || player.actor.armor >= 100) return false;
      game.addMoney(-300);
      player.actor.armor = 100;
      return true;
    }
    const w = WEAPONS[key];
    if (!w || w.melee) return false;
    const free = w.id === 'rifle' && game.progress.tapes.filter(Boolean).length === 12;
    const owned = player.owned[key];
    const price = owned ? w.ammoPrice : free ? 0 : w.price;
    if (game.progress.money < price) {
      game.hud.toast('Not enough cash', 'bad');
      return false;
    }
    game.addMoney(-price);
    giveWeapon(player, key, owned ? w.mag * 2 : w.mag * 3);
    player.current = key;
    return true;
  }

  return {
    state,
    showTitle() {
      state.screen = 'title';
      refreshTitle();
      title.classList.remove('hidden');
      pause.classList.add('hidden');
    },
    hideTitle() {
      title.classList.add('hidden');
    },
    openPause() {
      state.screen = 'pause';
      refreshStats();
      game.minimap.drawFull($('full-map'));
      pause.classList.remove('hidden');
    },
    closePause() {
      pause.classList.add('hidden');
      controls.classList.add('hidden');
      state.screen = 'play';
    },
    openShop() {
      state.shopOpen = true;
      renderShop();
      shop.classList.remove('hidden');
      game.input.releasePointer();
    },
    closeShop() {
      state.shopOpen = false;
      shop.classList.add('hidden');
    },
    /** Number keys buy while the shop is open. */
    updateShop(input) {
      for (let k = 1; k <= 5; k += 1) {
        if (input.pressed(`Digit${k}`)) {
          if (buy(k)) {
            game.audio.cash();
            renderShop();
          }
        }
      }
      if (input.pressed('Escape') || input.pressed('KeyE')) this.closeShop();
    },
    showDeath(kind, text) {
      death.className = kind;
      death.querySelector('h1').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
      death.querySelector('p').textContent = text;
    },
    hideDeath() {
      death.className = 'hidden';
    },
    get controlsOpen() {
      return !controls.classList.contains('hidden');
    },
    closeControls() {
      controls.classList.add('hidden');
    },
  };
}
