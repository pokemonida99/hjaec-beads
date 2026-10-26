// 配樂與音效：WebAudio 即時合成，120 BPM。遊戲畫面的節拍都跟這裡的時鐘走。
const Sound = (() => {
'use strict';
const BPM = 120, SPB = 60 / BPM, STEP = SPB / 4, BAR = SPB * 4;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// 和弦進行：Am  F  C  G ……最後兩小節 F  G7 推上去，收在 C
const CH = {
  Am: { root: 45, tones: [57, 60, 64, 67] },
  F: { root: 41, tones: [53, 57, 60, 64] },
  C: { root: 36, tones: [55, 60, 64, 67] },
  G: { root: 43, tones: [55, 59, 62, 67] },
  F2: { root: 41, tones: [53, 57, 60, 65] },
  G7: { root: 43, tones: [55, 59, 62, 65] },
  Cend: { root: 36, tones: [48, 55, 60, 64, 67, 72] },
};
const PROG = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'F2', 'G7'];
const LOOP = ['Am', 'F', 'C', 'G'];

// 遊戲曲：第 0 小節預備拍，1~10 小節＝20 秒遊戲，11~12 小節收尾
const GAME_START = BAR, GAME_LEN = BAR * 10, GAME_SONG_BARS = 13;
// 下雨：這些格子（第幾小節、第幾個 16 分音符）會有新的小水珠落下
const RAIN = new Set();
for (let b = 2; b <= 9; b++) { RAIN.add(b * 16 + 14); if (b >= 5) RAIN.add(b * 16 + 6); }

let ctx = null, master, musicBus, sfxBus, noiseBuf, verb;
let muted = false;
let fever = false;   // FEVER 時配樂多一層
let song = null, timer = null;

// 時鐘：聲音能播時跟 AudioContext 走（最準），播不了時改用系統時間；兩者切換時保持連續
let mode = 'perf', off = 0, last = 0, frozen = false;
const raw = () => mode === 'ctx' ? ctx.currentTime : performance.now() / 1000;
function now() {
  if (frozen) return last;
  const want = ctx && ctx.state === 'running' ? 'ctx' : 'perf';
  if (want !== mode) { mode = want; off = last - raw(); }
  last = raw() + off;
  return last;
}

function init() {
  if (ctx) { if (ctx.state === 'suspended' && !frozen) ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); }
  catch (e) { ctx = null; return; }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.15;
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
  master.connect(comp); comp.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.62; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  // 簡單的殘響（回授延遲），給水滴聲一點空間
  verb = ctx.createGain(); verb.gain.value = 0.25;
  const dl = ctx.createDelay(); dl.delayTime.value = SPB * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  verb.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(master);
  if (ctx.state === 'suspended') ctx.resume();
}

function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.03);
}

function pause() { now(); frozen = true; if (ctx) ctx.suspend(); }
function resume() {
  if (!frozen) return;
  frozen = false;
  if (ctx) { mode = 'perf'; ctx.resume(); }
  off = last - raw();
}

// ---------- 樂器 ----------
function env(g, t, a, peak, d, sus = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
}
function osc(type, f, t, len, dest) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  o.connect(dest); o.start(t); o.stop(t + len + 0.05); return o;
}
function noise(t, len, dest) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + len + 0.05); return s;
}
function gain(dest, v = 1) { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; }
function filt(dest, type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; }

const I = {
  kick(t, v = 1) {
    const g = gain(musicBus, 0); env(g, t, 0.003, 0.95 * v, 0.32);
    const o = osc('sine', 150, t, 0.4, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const c = gain(musicBus, 0); env(c, t, 0.001, 0.25 * v, 0.02);
    noise(t, 0.03, filt(c, 'highpass', 3000));
  },
  clap(t, v = 1) {
    const g = gain(musicBus, 0), f = filt(g, 'bandpass', 1500, 1.2);
    g.gain.setValueAtTime(0.0001, t);
    [0, 0.011, 0.022].forEach(o => { g.gain.setValueAtTime(0.5 * v, t + o); g.gain.exponentialRampToValueAtTime(0.08 * v, t + o + 0.009); });
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    noise(t, 0.22, f);
    const r = gain(verb, 0.4 * v); noise(t, 0.05, filt(r, 'bandpass', 1500));
  },
  snare(t, v = 1) {
    const g = gain(musicBus, 0); env(g, t, 0.002, 0.42 * v, 0.12);
    noise(t, 0.15, filt(g, 'bandpass', 1900, 0.9));
    const b = gain(musicBus, 0); env(b, t, 0.002, 0.3 * v, 0.08);
    osc('triangle', 190, t, 0.1, b);
  },
  hat(t, v = 1, open = false) {
    const g = gain(musicBus, 0); env(g, t, 0.001, (open ? 0.16 : 0.12) * v, open ? 0.2 : 0.035);
    noise(t, open ? 0.25 : 0.06, filt(g, 'highpass', 7600));
  },
  stick(t, hi) {
    const g = gain(musicBus, 0); env(g, t, 0.001, 0.35, 0.05);
    osc('sine', hi ? 1760 : 1320, t, 0.07, g);
  },
  bass(t, m, len, v = 1) {
    const g = gain(musicBus, 0); env(g, t, 0.005, 0.5 * v, len, 0.0001);
    const f = filt(g, 'lowpass', 900, 6);
    f.frequency.setValueAtTime(1300, t); f.frequency.exponentialRampToValueAtTime(220, t + len * 0.9);
    osc('sawtooth', mtof(m), t, len, f);
    osc('square', mtof(m - 12), t, len, gain(f, 0.5));
  },
  stab(t, notes, v = 1, len = 0.16) {
    const g = gain(musicBus, 0); env(g, t, 0.004, 0.085 * v, len);
    const f = filt(g, 'lowpass', 2400, 2);
    f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + len);
    notes.forEach(m => { osc('sawtooth', mtof(m) * 1.004, t, len, f); osc('sawtooth', mtof(m) * 0.996, t, len, f); });
  },
  pad(t, notes, len, v = 1) {
    const g = gain(musicBus, 0);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.35);
    g.gain.setValueAtTime(0.05 * v, t + len - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.4);
    const f = filt(g, 'lowpass', 1500, 0.5);
    notes.forEach(m => { osc('triangle', mtof(m), t, len + 0.4, f); osc('sawtooth', mtof(m) * 1.006, t, len + 0.4, gain(f, 0.25)); });
  },
  // 水滴聲：音高快速往上滑的正弦波
  bloop(t, m, v = 1, dest) {
    const out = dest || musicBus;
    const g = gain(out, 0); env(g, t, 0.003, 0.32 * v, 0.17);
    const o = osc('sine', mtof(m) * 0.62, t, 0.22, g); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.045);
    const r = gain(verb, 0); env(r, t, 0.003, 0.18 * v, 0.15);
    o.connect(r);
  },
  bell(t, m, v = 1) {
    const g = gain(sfxBus, 0); env(g, t, 0.002, 0.22 * v, 0.6);
    osc('sine', mtof(m), t, 0.7, g); osc('sine', mtof(m) * 2.76, t, 0.4, gain(g, 0.3));
    const r = gain(verb, 0); env(r, t, 0.002, 0.2 * v, 0.5); osc('sine', mtof(m), t, 0.6, r);
  },
  lead(t, m, v = 1, len = 0.11) {
    const g = gain(musicBus, 0); env(g, t, 0.003, 0.1 * v, len);
    const f = filt(g, 'lowpass', 3800, 3);
    osc('square', mtof(m), t, len, f); osc('sawtooth', mtof(m) * 1.007, t, len, gain(f, 0.6));
    const r = gain(verb, 0); env(r, t, 0.003, 0.05 * v, len); osc('square', mtof(m), t, len, r);
  },
  riser(t, len, v = 1) {
    const g = gain(musicBus, 0);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * v, t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
    const f = filt(g, 'bandpass', 400, 3);
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + len);
    noise(t, len + 0.1, f);
  },
  crash(t, v = 1) {
    const g = gain(musicBus, 0); env(g, t, 0.002, 0.3 * v, 1.8);
    noise(t, 1.5, filt(g, 'highpass', 4500));
    const r = gain(verb, 0); env(r, t, 0.002, 0.25 * v, 1); noise(t, 1, filt(r, 'highpass', 3000));
  },
};

// ---------- 曲子 ----------
const BASS_PAT = [[0, 0, 2], [3, 0, 1], [6, 12, 1], [8, 0, 2], [10, 7, 1], [11, 0, 1], [14, 12, 1]];
const ARP = [0, 3, 6, 8, 11, 14];

const SONGS = {
  // 標題：輕鬆版
  title: { bars: 4, loop: true, play(step, t) {
    const bar = Math.floor(step / 16), st = step % 16, ch = CH[LOOP[bar % 4]];
    if (st === 0) { I.pad(t, ch.tones, BAR - 0.1, 0.8); I.bass(t, ch.root, BAR * 0.9, 0.55); }
    if (st === 0 || st === 8) I.kick(t, 0.55);
    if (st % 2 === 0) I.hat(t, st % 4 === 2 ? 0.7 : 0.35);
    if ([0, 6, 10].includes(st) && (bar + st) % 3 !== 2) I.bloop(t, ch.tones[(st + bar) % 4] + 12, 0.45);
  } },
  // 遊戲：預備拍＋10 小節＋收尾
  game: { bars: GAME_SONG_BARS, loop: false, play(step, t) {
    const bar = Math.floor(step / 16), st = step % 16;
    if (bar === 0) {   // 預備拍：3、2、1、開始
      if (st % 4 === 0) I.stick(t, st === 12);
      I.hat(t, 0.25 + st / 40);
      if (st === 0) I.riser(t, BAR - 0.02, 0.8);
      return;
    }
    if (bar <= 10) {
      const ch = CH[PROG[bar - 1]];
      const hurry = bar >= 9;
      if (st % 4 === 0 && !(bar === 10 && st > 8)) I.kick(t, 1);
      if (bar >= 3 && (st === 4 || st === 12)) I.clap(t, 1);
      if (bar >= 5 || st % 2 === 0) I.hat(t, st % 2 ? 0.45 : 0.75, bar >= 3 && st % 4 === 2);
      for (const [s, iv, l] of BASS_PAT) if (s === st) I.bass(t, ch.root + iv, STEP * l * 0.95, 1);
      if (bar <= 2 && st === 0) I.pad(t, ch.tones, BAR - 0.05, 0.9);
      if (bar >= 3 && st % 4 === 2) I.stab(t, ch.tones.map(m => m + 12), hurry ? 1.15 : 1);
      if (bar >= 5) { const k = ARP.indexOf(st); if (k >= 0) I.bloop(t, ch.tones[k % ch.tones.length] + 12 + (k >= 4 ? 12 : 0), 0.55); }
      if (bar === 9 && st % 2 === 0 && st >= 8) I.snare(t, 0.3 + st / 40);
      if (bar === 10) { I.snare(t, 0.25 + st / 22); if (st === 0) I.riser(t, BAR - 0.02, 1.1); }
      if (RAIN.has(step)) I.bloop(t, 88 + (step % 3) * 2, 0.5);
      if (fever) {   // FEVER：16 分音符主旋律＋多一下拍手＋開放鈸
        const tn = ch.tones, seq = [0, 1, 2, 3, 2, 1, 3, 2];
        if (st % 2 === 0) I.lead(t, tn[seq[(st / 2 + bar) % 8]] + 24, st % 4 === 0 ? 1 : 0.7);
        if (st === 14) I.clap(t, 0.7);
        if (st % 4 === 2) I.hat(t, 0.9, true);
      }
      return;
    }
    if (bar === 11) {   // 收尾大和弦，水珠滑下車頭
      const c = CH.Cend;
      if (st === 0) { I.crash(t, 1); I.kick(t, 1.1); I.pad(t, c.tones, BAR * 2, 1.4); I.bass(t, c.root + 12, BAR * 1.6, 0.9); I.stab(t, c.tones.map(m => m + 12), 1.4, 0.4); }
      if (st >= 4 && st % 2 === 0) I.bloop(t, [96, 91, 88, 84, 79, 76][(st - 4) / 2] ?? 72, 0.5);
    }
  } },
  // 結算：慢慢晃的循環
  result: { bars: 4, loop: true, play(step, t) {
    const bar = Math.floor(step / 16), st = step % 16, ch = CH[LOOP[bar % 4]];
    if (st === 0) { I.pad(t, ch.tones, BAR - 0.1, 0.7); I.bass(t, ch.root, BAR * 0.9, 0.5); }
    if (st % 4 === 0) I.kick(t, 0.5);
    if (st === 4 || st === 12) I.clap(t, 0.35);
    if (st % 2 === 0) I.hat(t, 0.35, st % 4 === 2);
    if (st === 3 || st === 11) I.bloop(t, ch.tones[(bar + st) % 4] + 24, 0.35);
  } },
};

// ---------- 排程器 ----------
function play(name, onEnd, delay = 0.08, startStep = 0) {
  const t = now() + delay;
  song = { name, def: SONGS[name], t0: t - startStep * STEP, step: startStep, nextT: t, onEnd };
  if (!timer) timer = setInterval(tick, 25);
  tick();
}
function stop() { song = null; }
function tick() {
  if (!song) return;
  const look = now() + 0.12;
  while (song && song.nextT < look) {
    const def = song.def, total = def.bars * 16;
    if (song.step >= total) {
      if (def.loop) { song.step = 0; }
      else { const cb = song.onEnd; song = null; cb && cb(); return; }
    }
    if (ctx && mode === 'ctx' && !muted) { try { def.play(song.step, song.nextT - off); } catch (e) { console.warn(e); } }
    song.step++; song.nextT += STEP;
  }
}
// 目前曲子播到哪（秒），遊戲畫面依這個對拍
function pos() {
  if (!song) return -1;
  const lat = mode === 'ctx' ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;   // 扣掉喇叭延遲，畫面才會跟聽到的拍子對齊
  return now() - song.t0 - lat;
}
function songName() { return song && song.name; }

// ---------- 音效（立即播放，跟當下和弦同調） ----------
function chordAt(t) {
  if (song && song.name === 'game') { const bar = Math.floor(t / BAR); return CH[PROG[Math.min(9, Math.max(0, bar - 1))]]; }
  return CH[LOOP[Math.max(0, Math.floor(t / BAR)) % 4]];
}
const sfx = {
  merge(n, big) {
    if (!ctx || muted) return;
    const ch = chordAt(pos()), m = ch.tones[n % ch.tones.length] + 12 + 12 * Math.floor(n / ch.tones.length % 2);
    I.bloop(ctx.currentTime + 0.005, m - (big ? 12 : 0), 0.9, sfxBus);
  },
  perfect(n) {
    if (!ctx || muted) return;
    const ch = chordAt(pos());
    I.bell(ctx.currentTime + 0.005, ch.tones[n % 4] + 24, 0.9);
  },
  split() {
    if (!ctx || muted) return;
    const t = ctx.currentTime + 0.005;
    const g = gain(sfxBus, 0); env(g, t, 0.002, 0.35, 0.18);
    noise(t, 0.2, filt(g, 'bandpass', 3200, 1.5));
    [0, 0.05, 0.1].forEach((o, i) => I.bloop(t + o, 79 - i * 5, 0.6, sfxBus));
  },
  fever() {
    if (!ctx || muted) return;
    const t = ctx.currentTime + 0.005;
    I.crash(t, 0.8);
    [72, 76, 79, 84, 88].forEach((m, i) => I.bell(t + i * 0.05, m, 0.7));
  },
  // 噴泡沫：一陣往上掃的嘶聲＋踩拍時的和弦水滴
  spray(q) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + 0.005, len = q === 'perfect' ? 0.32 : 0.22;
    const g = gain(sfxBus, 0); env(g, t, 0.01, q === 'perfect' ? 0.42 : 0.28, len);
    const f = filt(g, 'bandpass', 1800, 0.8); f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(5200, t + len);
    noise(t, len + 0.05, f);
    if (q !== 'miss') { const ch = chordAt(pos()); [0, 1, 2].forEach(i => I.bloop(t + i * 0.035, ch.tones[i] + 24, 0.5, sfxBus)); }
  },
  stamp() { if (!ctx || muted) return; const t = ctx.currentTime + 0.005; I.kick(t, 0.9); I.clap(t + 0.01, 0.5); },
  grab() { if (ctx && !muted) I.bloop(ctx.currentTime + 0.005, 84, 0.25, sfxBus); },
  tap() { if (ctx && !muted) I.stick(ctx.currentTime + 0.005, true); },
};

function setFever(on) { fever = !!on; }

return { init, setMuted, setFever, get muted() { return muted; }, pause, resume, play, stop, pos, songName, sfx,
  BPM, SPB, STEP, BAR, GAME_START, GAME_LEN, RAIN, get ready() { return !!ctx; } };
})();
