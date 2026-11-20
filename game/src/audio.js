// All sound is synthesised with Web Audio, no files: the car engine that follows the revs, tyre
// squeal, police sirens, gunshots per weapon, crashes, explosions, the horn, pickup and mission
// jingles, and Sunwave FM, a car radio playing a generated synthwave loop.

const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function createAudio() {
  let ctx = null;
  let master;
  let sfx;
  let music;
  let noiseBuffer;
  let engine = null;
  let siren = null;
  let squeal = null;
  const listener = { x: 0, z: 0 };
  const radio = { on: true, playing: false, nextTime: 0, step: 0 };
  let muted = false;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.connect(master);
    music = ctx.createGain();
    music.gain.value = 0;
    music.connect(master);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    engine = makeEngine();
    siren = makeSiren();
    squeal = makeSqueal();
  }

  function gainAt(x, z, range = 25) {
    if (x === undefined) return 1;
    const d = Math.hypot(x - listener.x, z - listener.z);
    return 1 / (1 + (d / range) * (d / range));
  }

  function noise(duration, filterType, freq, q, volume, attack = 0.002, when = 0, out = null) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(out ?? sfx);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
    return filter;
  }

  function tone(freq, duration, type, volume, when = 0, slideTo = null, out = null) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(out ?? sfx);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  function makeEngine() {
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    const b = ctx.createOscillator();
    b.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.value = 0;
    a.connect(filter);
    b.connect(filter);
    filter.connect(g).connect(sfx);
    a.start();
    b.start();
    return { a, b, filter, g };
  }

  function makeSiren() {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.9;
    const depth = ctx.createGain();
    depth.gain.value = 280;
    lfo.connect(depth).connect(o.frequency);
    o.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(sfx);
    o.start();
    lfo.start();
    return { g };
  }

  function makeSqueal() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 8;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(filter).connect(g).connect(sfx);
    src.start();
    return { g };
  }

  function scheduleRadio() {
    if (!ctx || !radio.playing) return;
    const beat = 60 / 104 / 2;
    while (radio.nextTime < ctx.currentTime + 0.25) {
      const s = radio.step;
      const t = radio.nextTime - ctx.currentTime;
      const chord = CHORDS[Math.floor(s / 16) % CHORDS.length];
      if (s % 2 === 0) tone(midi(chord[0] - 24), beat * 1.8, 'sawtooth', 0.12, t, null, music);
      tone(midi(chord[s % 3] + 12 + (s % 8 >= 4 ? 12 : 0)), beat * 0.9, 'square', 0.035, t, null, music);
      if (s % 4 === 0) tone(110, 0.18, 'sine', 0.35, t, 40, music);
      if (s % 8 === 4) {
        noise(0.16, "highpass", 1500, 0.7, 0.12, 0.002, t, music);
      }
      if (s % 16 === 0) for (const n of chord) tone(midi(n), beat * 14, 'triangle', 0.03, t, null, music);
      radio.step += 1;
      radio.nextTime += beat;
    }
  }

  return {
    init,
    get ready() { return !!ctx; },
    setListener(x, z) {
      listener.x = x;
      listener.z = z;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
    toggleRadio() {
      radio.on = !radio.on;
      return radio.on;
    },
    /** Called every frame with the player's car (or null), the nearest siren distance and the time. */
    update(vehicle, sirenDistance, paused) {
      if (!ctx) return;
      const now = ctx.currentTime;
      if (vehicle && !paused) {
        const speed = Math.abs(vehicle.speed);
        const gear = Math.min(4, Math.floor(speed / 11));
        const rpm = (speed - gear * 11) / 11;
        const base = 38 + gear * 6 + rpm * 70 + vehicle.controls.throttle * 12;
        engine.a.frequency.setTargetAtTime(base, now, 0.05);
        engine.b.frequency.setTargetAtTime(base * 0.5, now, 0.05);
        engine.filter.frequency.setTargetAtTime(300 + rpm * 900 + vehicle.controls.throttle * 500, now, 0.05);
        engine.g.gain.setTargetAtTime(0.09 + vehicle.controls.throttle * 0.06, now, 0.08);
        squeal.g.gain.setTargetAtTime(vehicle.slip > 4 && speed > 6 ? Math.min(0.12, vehicle.slip * 0.01) : 0, now, 0.05);
      } else {
        engine.g.gain.setTargetAtTime(0, now, 0.1);
        squeal.g.gain.setTargetAtTime(0, now, 0.05);
      }
      const sirenGain = paused || sirenDistance === Infinity ? 0 : 0.07 / (1 + (sirenDistance / 40) ** 2);
      siren.g.gain.setTargetAtTime(sirenGain, now, 0.1);
      const wantRadio = !!vehicle && radio.on && !paused;
      if (wantRadio && !radio.playing) {
        radio.playing = true;
        radio.nextTime = now + 0.05;
      }
      if (!wantRadio && radio.playing) radio.playing = false;
      music.gain.setTargetAtTime(wantRadio ? 0.5 : 0, now, 0.3);
      scheduleRadio();
    },
    gunshot(weaponId, x, z) {
      const v = gainAt(x, z, 40);
      if (weaponId === 'shotgun') {
        noise(0.45, 'lowpass', 1800, 0.8, 0.9 * v);
        tone(90, 0.25, 'sine', 0.6 * v, 0, 40);
      } else if (weaponId === 'rifle') {
        noise(0.25, 'bandpass', 2200, 0.7, 0.8 * v);
        tone(140, 0.15, 'square', 0.25 * v, 0, 50);
      } else if (weaponId === 'smg') {
        noise(0.12, 'bandpass', 2800, 0.9, 0.55 * v);
        tone(160, 0.08, 'square', 0.15 * v, 0, 70);
      } else {
        noise(0.2, 'bandpass', 2000, 0.8, 0.7 * v);
        tone(180, 0.12, 'square', 0.2 * v, 0, 60);
      }
    },
    punch(x, z) {
      tone(120, 0.12, 'sine', 0.5 * gainAt(x, z), 0, 50);
      noise(0.08, 'lowpass', 900, 0.5, 0.3 * gainAt(x, z));
    },
    explosion(x, z) {
      const v = gainAt(x, z, 60);
      noise(2.2, 'lowpass', 500, 0.6, 1.2 * v, 0.01);
      tone(60, 1.2, 'sine', 0.9 * v, 0, 25);
    },
    crash(strength) {
      noise(0.5, 'lowpass', 1200, 0.7, 0.4 + strength * 0.6);
      noise(0.3, 'bandpass', 3500, 2, 0.15 * strength);
    },
    thud(x, z) {
      tone(80, 0.2, 'sine', 0.6 * gainAt(x, z), 0, 40);
    },
    horn() {
      tone(392, 0.45, 'square', 0.12);
      tone(494, 0.45, 'square', 0.1);
    },
    shout(x, z) {
      tone(320, 0.3, 'sawtooth', 0.08 * gainAt(x, z), 0, 520);
    },
    pickup() {
      [72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.18, 'triangle', 0.18, i * 0.06));
    },
    cash() {
      [84, 88].forEach((n, i) => tone(midi(n), 0.12, 'square', 0.08, i * 0.07));
    },
    passed() {
      [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(midi(n), 0.4, 'triangle', 0.18, i * 0.09));
      [48, 55, 60].forEach((n) => tone(midi(n), 1.4, 'sawtooth', 0.06, 0.6));
    },
    failed() {
      [67, 63, 60, 55].forEach((n, i) => tone(midi(n), 0.35, 'sawtooth', 0.12, i * 0.16));
    },
    star() {
      tone(midi(81), 0.12, 'square', 0.1);
      tone(midi(76), 0.18, 'square', 0.1, 0.1);
    },
    ui() {
      tone(midi(84), 0.06, 'square', 0.06);
    },
  };
}
