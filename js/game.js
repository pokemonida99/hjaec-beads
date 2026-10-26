// 水珠聚一顆：畫面、操作、流程。節拍一律看 Sound.pos()（配樂時鐘）。
(() => {
'use strict';
const $ = s => document.querySelector(s);
const { HOOD, leftAt, rightAt, bottomAt } = Core;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

const cv = $('#cv'), ctx = cv.getContext('2d');
const under = document.createElement('canvas'), uctx = under.getContext('2d');
let bg = document.createElement('canvas');
let DPR = 1, VW = 0, VH = 0, stageR = { top: 0, h: 0 };
const V = { s: 1, ox: 0, oy: 0 };          // 邏輯座標 → CSS px：x*s+ox
const FIT = { x0: -40, x1: 1040, y0: -70, y1: 1240 };

let W = Core.makeLevel(7);
let state = 'intro';           // intro | count | play | outro | result
let paused = false;
let runSeed = 1;
let fx = { ripples: [], parts: [], texts: [], ghosts: [], trails: [] };
let stats = { perfect: 0, splits: 0, merges: 0, bonus: 0, combo: 0, maxCombo: 0, lastPB: -99, fever: false };
let flash = { gold: 0, red: 0 };   // 踩拍金光、斷開紅光
let lastStep = -1, outroAt = 0, resultShown = false, finalScore = 0;
let hintMsg = null;        // {text, cls, until}
let kb = { x: 500, y: 520, on: false, keys: {} };
let demo = { wait: 1, target: null, px: 500, py: 520, on: true, reset: 0 };
let grabbedBy = null;      // 'pointer' | 'key' | 'demo'
// 兩種玩法：drops＝水珠聚一顆、foam＝泡沫鋪滿車
let mode = /foam/.test(location.hash) ? 'foam' : 'drops';
let F = null;                                  // 泡沫格子（Foam.create）
let brushPt = { x: 500, y: 520, on: false, seen: false };   // 泡沫版手指位置
let lastSprayBeat = -99, rinseY = -1e9;
const dirtC = document.createElement('canvas'), foamL = document.createElement('canvas');
const MODE = {
  drops: { name: '水珠聚一顆', gauge: '撥水率', key: 'hjaec-beads-best', product: ['assets/coating.png', '紅分子 奈米陶瓷封體鍍膜'] },
  foam: { name: '泡沫鋪滿車', gauge: '覆蓋率', key: 'hjaec-foam-best', product: ['assets/shampoo.png', '紅分子 超效除汙高泡濃縮洗車精'] },
};
const gradeOf = v => mode === 'foam' ? Foam.grade(v) : Core.grade(v);

// ---------- 版面 ----------
function resize() {
  VW = innerWidth; VH = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = under.width = Math.round(VW * DPR); cv.height = under.height = Math.round(VH * DPR);
  const r = $('#stage').getBoundingClientRect();
  stageR = { top: r.top, h: r.height };
  const sw = Math.max(200, r.width - 24), sh = Math.max(200, r.height + 12);
  V.s = Math.min(sw / (FIT.x1 - FIT.x0), sh / (FIT.y1 - FIT.y0));
  V.ox = r.left + r.width / 2 - 500 * V.s;
  V.oy = r.top + r.height / 2 + 6 - ((FIT.y0 + FIT.y1) / 2) * V.s;
  buildBg();
  foamL.width = cv.width; foamL.height = cv.height;
  buildDirt();
}
const toL = (cx, cy) => [(cx - V.ox) / V.s, (cy - V.oy) / V.s];
const setL = c => c.setTransform(DPR * V.s, 0, 0, DPR * V.s, DPR * V.ox, DPR * V.oy);

// ---------- 車體與引擎蓋（只在改尺寸時畫一次） ----------
let HOOD_P, BODY_P;
function paths() {
  HOOD_P = new Path2D();
  HOOD_P.moveTo(leftAt(0), 0); HOOD_P.lineTo(rightAt(0), 0); HOOD_P.lineTo(rightAt(1036), 1036);
  for (let x = rightAt(1036); x >= leftAt(1036); x -= 16) HOOD_P.lineTo(x, bottomAt(x));
  HOOD_P.closePath();
  BODY_P = new Path2D();
  BODY_P.moveTo(-30, -40); BODY_P.lineTo(1030, -40); BODY_P.lineTo(1075, 320); BODY_P.lineTo(1088, 930);
  BODY_P.quadraticCurveTo(1092, 1170, 930, 1236); BODY_P.lineTo(70, 1236);
  BODY_P.quadraticCurveTo(-92, 1170, -88, 930); BODY_P.lineTo(-75, 320); BODY_P.closePath();
}
paths();

function buildBg() {
  bg.width = cv.width; bg.height = cv.height;
  const c = bg.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  // 洗車間地板
  c.fillStyle = '#111113'; c.fillRect(0, 0, VW, VH);
  const R = Core.rng(11);
  for (let i = 0; i < VW * VH / 90; i++) { c.fillStyle = `rgba(255,255,255,${R() * 0.025})`; c.fillRect(R() * VW, R() * VH, 1, 1); }
  setL(c);
  c.strokeStyle = 'rgba(230,220,190,.10)'; c.lineWidth = 10; c.setLineDash([60, 50]);
  c.beginPath(); c.moveTo(-260, -900); c.lineTo(-260, 2400); c.moveTo(1260, -900); c.lineTo(1260, 2400); c.stroke(); c.setLineDash([]);
  // 車身影子
  c.save(); c.filter = `blur(${Math.max(2, 26 * V.s * DPR) / DPR}px)`;
  c.fillStyle = 'rgba(0,0,0,.75)'; c.translate(0, 18); c.fill(BODY_P); c.restore();
  // 擋風玻璃
  const gl = new Path2D(); gl.moveTo(40, -46); gl.lineTo(960, -46); gl.lineTo(870, -330); gl.lineTo(130, -330); gl.closePath();
  let g = c.createLinearGradient(0, -330, 0, -46); g.addColorStop(0, '#0a0c10'); g.addColorStop(1, '#1d232b');
  c.fillStyle = g; c.fill(gl);
  c.save(); c.clip(gl); c.globalAlpha = 0.12; c.fillStyle = '#cfe2ff';
  c.beginPath(); c.moveTo(180, -46); c.lineTo(330, -46); c.lineTo(520, -330); c.lineTo(440, -330); c.fill();
  c.restore();
  c.strokeStyle = '#050506'; c.lineWidth = 9; c.lineCap = 'round';
  c.beginPath(); c.moveTo(150, -62); c.lineTo(470, -86); c.moveTo(560, -62); c.lineTo(880, -86); c.stroke();
  // 車身烤漆（葉子板、保桿）
  g = c.createLinearGradient(-90, 0, 1090, 0);
  g.addColorStop(0, '#3a0204'); g.addColorStop(0.07, '#7d070b'); g.addColorStop(0.5, '#a40c12'); g.addColorStop(0.93, '#7d070b'); g.addColorStop(1, '#3a0204');
  c.fillStyle = g; c.fill(BODY_P);
  // 頭燈座
  for (const sx of [1, -1]) {
    c.save(); if (sx < 0) { c.translate(1000, 0); c.scale(-1, 1); }
    const hl = new Path2D(); hl.moveTo(-70, 1000); hl.lineTo(170, 1052); hl.lineTo(205, 1098); hl.lineTo(-40, 1110); hl.closePath();
    c.fillStyle = '#0d0e11'; c.fill(hl); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 3; c.stroke(hl);
    c.restore();
  }
  // 水箱罩
  const gr = new Path2D(); gr.moveTo(250, 1118); gr.lineTo(750, 1118); gr.lineTo(720, 1205); gr.lineTo(280, 1205); gr.closePath();
  c.fillStyle = '#0b0b0d'; c.fill(gr);
  c.save(); c.clip(gr); c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 3;
  for (let x = 240; x < 780; x += 22) { c.beginPath(); c.moveTo(x, 1110); c.lineTo(x + 30, 1210); c.stroke(); c.beginPath(); c.moveTo(x + 30, 1110); c.lineTo(x, 1210); c.stroke(); }
  c.restore();
  drawMark(c, 500, 1161, 58);
  // 引擎蓋本體
  c.save(); c.clip(HOOD_P);
  g = c.createRadialGradient(500, 380, 60, 500, 520, 760);
  g.addColorStop(0, '#c4141c'); g.addColorStop(0.55, '#a00b11'); g.addColorStop(1, '#5c0306');
  c.fillStyle = g; c.fillRect(-50, -50, 1100, 1200);
  // 金屬漆亮片
  for (let i = 0; i < 9000; i++) {
    const x = R() * 1000, y = R() * 1100, k = R();
    c.fillStyle = k > 0.5 ? `rgba(255,190,190,${R() * 0.09})` : `rgba(40,0,0,${R() * 0.12})`;
    c.fillRect(x, y, 2.2, 2.2);
  }
  // 引擎蓋上的兩條稜線
  for (const [x0, x1] of [[300, 236], [700, 764]]) {
    c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,.20)'; c.beginPath(); c.moveTo(x0 + 5, 0); c.quadraticCurveTo((x0 + x1) / 2 + 9, 560, x1 + 5, 1100); c.stroke();
    c.lineWidth = 4; c.strokeStyle = 'rgba(255,220,220,.12)'; c.beginPath(); c.moveTo(x0 - 3, 0); c.quadraticCurveTo((x0 + x1) / 2 - 3, 560, x1 - 3, 1100); c.stroke();
  }
  // 靠擋風玻璃那端的天花板反光
  g = c.createLinearGradient(0, 0, 0, 260); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 1000, 260);
  c.restore();
  c.strokeStyle = 'rgba(10,0,0,.85)'; c.lineWidth = 5; c.stroke(HOOD_P);
  c.strokeStyle = 'rgba(255,200,200,.10)'; c.lineWidth = 2; c.save(); c.translate(0, 3); c.stroke(HOOD_P); c.restore();
}

// 泡沫版的髒引擎蓋：灰褐色污漬、泥點、水垢圈（沖水時被泡沫蓋到的地方會擦掉）
function buildDirt() {
  dirtC.width = cv.width; dirtC.height = cv.height;
  const c = dirtC.getContext('2d'), R = Core.rng(23);
  setL(c); c.save(); c.clip(HOOD_P);
  c.fillStyle = 'rgba(70,58,46,.32)'; c.fillRect(0, 0, 1000, 1100);
  for (let i = 0; i < 70; i++) {
    const x = R() * 1000, y = R() * 1100, r = 30 + R() * 110;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${80 + R() * 40 | 0},${64 + R() * 30 | 0},${48 + R() * 20 | 0},${0.25 + R() * 0.3})`); g.addColorStop(1, 'rgba(80,64,48,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${50 + R() * 50 | 0},${40 + R() * 30 | 0},30,${0.2 + R() * 0.5})`; c.beginPath(); c.arc(R() * 1000, R() * 1100, 1 + R() * 4, 0, TAU); c.fill(); }
  c.strokeStyle = 'rgba(200,190,170,.18)'; c.lineWidth = 2;
  for (let i = 0; i < 60; i++) { c.beginPath(); c.arc(R() * 1000, R() * 1100, 6 + R() * 14, 0, TAU); c.stroke(); }
  c.restore();
}
// 泡泡紋理：小泡泡的輪廓與亮點
const BUBBLES = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d'), R = Core.rng(5);
  for (let i = 0; i < 90; i++) {
    const x = R() * 160, y = R() * 160, r = 2 + R() * 9;
    for (const [dx, dy] of [[0, 0], [160, 0], [-160, 0], [0, 160], [0, -160]]) {
      g.strokeStyle = `rgba(150,160,175,${0.25 + R() * 0.25})`; g.lineWidth = 1; g.beginPath(); g.arc(x + dx, y + dy, r, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x + dx - r * 0.35, y + dy - r * 0.35, r * 0.22, 0, TAU); g.fill();
    }
  }
  return c;
})();

// 紅分子標誌（四個圓節點＋斜線），依官網 logo 重畫
const MARK = { nodes: [[.255, .27], [.69, .27], [.255, .72], [.69, .72]], ro: .095, ri: .063, lw: .032 };
function drawMark(c, cx, cy, s, ink = '#fff', fill = '#d9141c') {
  c.save(); c.translate(cx - s / 2, cy - s / 2);
  const sq = new Path2D(); sq.roundRect(0, 0, s, s, 0.075 * s);
  c.fillStyle = fill; c.fill(sq); c.clip(sq);
  c.strokeStyle = ink; c.lineWidth = MARK.lw * s;
  const [a, b, cc, d] = MARK.nodes.map(([x, y]) => [x * s, y * s]), ro = (MARK.ro - 0.004) * s;
  const seg = (x1, y1, x2, y2, e1, e2) => { const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    c.beginPath(); c.moveTo(x1 + ux * e1, y1 + uy * e1); c.lineTo(x2 - ux * e2, y2 - uy * e2); c.stroke(); };
  seg(a[0], a[1], 0.6 * s, -0.06 * s, ro, 0);
  seg(b[0], b[1], cc[0], cc[1], ro, ro);
  seg(d[0], d[1], 1.05 * s, 1.07 * s, ro, 0);
  for (const [x, y] of MARK.nodes) { c.beginPath(); c.arc(x * s, y * s, (MARK.ro + MARK.ri) / 2 * s, 0, TAU); c.lineWidth = (MARK.ro - MARK.ri) * s; c.stroke(); }
  c.restore();
}

// ---------- 水珠貼圖（預先畫好，每顆縮放使用） ----------
function sprite(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size / 2); return c; }
const SHADE = sprite(256, (c, h) => {
  let g = c.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.62, 'rgba(70,0,4,.06)'); g.addColorStop(0.86, 'rgba(40,0,2,.32)'); g.addColorStop(1, 'rgba(15,0,0,.72)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  c.globalCompositeOperation = 'lighter';
  g = c.createRadialGradient(h * 1.32, h * 1.4, 0, h * 1.32, h * 1.4, h * 0.62);
  g.addColorStop(0, 'rgba(255,150,120,.55)'); g.addColorStop(0.5, 'rgba(255,90,70,.18)'); g.addColorStop(1, 'rgba(255,60,60,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  // 左上邊緣的一圈亮邊
  c.globalCompositeOperation = 'source-over';
  c.strokeStyle = 'rgba(255,235,235,.28)'; c.lineWidth = 5; c.beginPath(); c.arc(h, h, h - 6, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
});
const SHADOW = sprite(128, (c, h) => {
  const g = c.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(25,0,0,.55)'); g.addColorStop(0.6, 'rgba(25,0,0,.35)'); g.addColorStop(1, 'rgba(25,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
});
const GLOW = sprite(128, (c, h) => {
  const g = c.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,240,230,.5)'); g.addColorStop(1, 'rgba(255,220,200,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
});

// ---------- 節拍 ----------
function beat() {
  const p = Sound.pos();
  if (p < 0) return { p, b: 0, f: 1, env: 0, bar: -1, st: -1, clap: 0 };
  const bf = p / Sound.SPB, b = Math.floor(bf), f = bf - b;
  const env = Math.exp(-f * 6);
  const bar = Math.floor(p / Sound.BAR), inBar = b % 4;
  const name = Sound.songName();
  const clapOn = name === 'game' ? bar >= 3 && bar <= 10 : name === 'result';
  const clap = clapOn && (inBar === 1 || inBar === 3) ? env : 0;
  return { p, b, f, env, bar, inBar, st: Math.floor(p / Sound.STEP), clap, name };
}

// ---------- 畫面 ----------
function drawScene(B, t) {
  // 1) 底圖＋會動的反光畫到 under（水珠折射會取樣這張）
  uctx.setTransform(1, 0, 0, 1, 0, 0);
  uctx.drawImage(bg, 0, 0);
  setL(uctx);
  uctx.save(); uctx.clip(BODY_P);
  uctx.globalCompositeOperation = 'lighter';
  // 天花板燈管在烤漆上的反光：三條，跟著拍子亮
  const play = state === 'play' || state === 'count';
  for (let i = 0; i < 3; i++) {
    const y = 250 + i * 300 + Math.sin(t * 0.35 + i * 2) * 14;
    const a = 0.055 + B.env * (play ? 0.07 : 0.04) * (i === B.inBar % 3 ? 1.6 : 0.7);
    const gr = uctx.createLinearGradient(0, y - 34, 0, y + 34);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,236,230,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    uctx.fillStyle = gr;
    uctx.beginPath(); uctx.moveTo(-100, y - 34); uctx.quadraticCurveTo(500, y - 64, 1100, y - 34); uctx.lineTo(1100, y + 34); uctx.quadraticCurveTo(500, y + 4, -100, y + 34); uctx.fill();
    uctx.fillStyle = `rgba(255,255,255,${a * 1.4})`;
    uctx.beginPath(); uctx.moveTo(-100, y - 2); uctx.quadraticCurveTo(500, y - 32, 1100, y - 2); uctx.lineTo(1100, y + 2); uctx.quadraticCurveTo(500, y - 28, -100, y + 2); uctx.fill();
  }
  // 每小節第一拍：一道光斜掃過引擎蓋
  if (B.bar >= 0 && (B.inBar === 0 || (stats.fever && state === 'play'))) {
    const x = lerp(-450, 1450, B.f);
    const gr = uctx.createLinearGradient(x - 180, 0, x + 180, 0);
    const a = (play ? (stats.fever ? 0.3 : 0.2) : 0.11) * Math.sin(B.f * Math.PI);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,245,240,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    uctx.fillStyle = gr; uctx.save(); uctx.transform(1, 0, -0.35, 1, 0, 0); uctx.fillRect(x - 600, -100, 1200, 1400); uctx.restore();
  }
  // 結尾滑落留下的亮面痕跡
  for (const tr of fx.trails) {
    uctx.strokeStyle = `rgba(255,235,230,${0.16 * tr.a})`; uctx.lineWidth = tr.w; uctx.lineCap = 'round';
    uctx.beginPath(); uctx.moveTo(tr.x0, tr.y0); uctx.lineTo(tr.x1, tr.y1); uctx.stroke();
  }
  uctx.globalCompositeOperation = 'source-over';
  uctx.restore();
  // 頭燈：跟著大鼓閃
  const drl = 0.35 + B.env * 0.65;
  uctx.save(); uctx.globalCompositeOperation = 'lighter';
  for (const sx of [1, -1]) {
    uctx.save(); if (sx < 0) { uctx.translate(1000, 0); uctx.scale(-1, 1); }
    uctx.strokeStyle = `rgba(255,255,255,${0.5 * drl})`; uctx.lineWidth = 7; uctx.lineCap = 'round';
    uctx.beginPath(); uctx.moveTo(-40, 1022); uctx.lineTo(150, 1062); uctx.stroke();
    uctx.globalAlpha = 0.35 * drl; uctx.drawImage(GLOW, -10, 980, 140, 110);
    uctx.restore();
  }
  uctx.restore();

  // 2) 合成到主畫面：輕微的拍點縮放
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const bump = 1 + (play ? B.env * 0.006 : 0);
  if (bump !== 1) {
    ctx.fillStyle = '#111113'; ctx.fillRect(0, 0, cv.width, cv.height);
    const cx = (V.ox + 500 * V.s) * DPR, cy = (V.oy + 540 * V.s) * DPR;
    ctx.setTransform(bump, 0, 0, bump, cx * (1 - bump), cy * (1 - bump));
  }
  ctx.drawImage(under, 0, 0);
  // 兩側紅色燈條：拍手時亮
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const neon = 0.12 + B.clap * 0.5 + (state === 'play' && timeLeft() < 4 ? 0.25 * B.env : 0);
  for (const side of [0, 1]) {
    const w = Math.min(90, VW * 0.12) * DPR, x = side ? cv.width - w : 0;
    const gr = ctx.createLinearGradient(side ? cv.width : 0, 0, x + (side ? 0 : w), 0);
    const nc = stats.fever && state === 'play' ? (B.b % 2 ? '255,190,40' : '255,60,30') : '230,20,30';
    gr.addColorStop(0, `rgba(${nc},${stats.fever && state === 'play' ? 0.3 + B.env * 0.5 : neon})`); gr.addColorStop(1, `rgba(${nc},0)`);
    ctx.fillStyle = gr; ctx.fillRect(x, 0, w, cv.height);
  }

  if (mode === 'foam') drawFoam(B, t);
  // 3) 水珠
  const pulse = 1 + B.env * (B.bar >= 0 ? 0.035 : 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const k = V.s * DPR;
  const sliding = state === 'outro' || state === 'result';
  if (sliding) { ctx.save(); setL(ctx); ctx.clip(HOOD_P); ctx.setTransform(1, 0, 0, 1, 0, 0); }   // 滑過車頭就消失
  for (const d of W.drops) {        // 影子先畫
    const X = (V.ox + d.x * V.s) * DPR, Y = (V.oy + d.y * V.s) * DPR, R = d.r * k * dropScale(d);
    if (d.fade != null) ctx.globalAlpha = d.fade;
    ctx.drawImage(SHADOW, X - R * 1.05 + R * 0.16, Y - R * 1.05 + R * 0.2, R * 2.1, R * 2.1);
    ctx.globalAlpha = 1;
  }
  const big = Core.biggest(W.drops);
  for (const d of W.drops) drawDrop(d, k, pulse, d === big, B);
  if (sliding) ctx.restore();
  for (const g of fx.ghosts) {
    const q = clamp(g.t / 0.12), x = lerp(g.x, g.to.x, q), y = lerp(g.y, g.to.y, q), r = g.r * (1 - q * 0.8);
    const X = (V.ox + x * V.s) * DPR, Y = (V.oy + y * V.s) * DPR, R = r * k;
    ctx.fillStyle = 'rgba(120,0,6,.55)'; ctx.beginPath(); ctx.arc(X, Y, R, 0, TAU); ctx.fill();
  }

  // 4) 特效
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const r of fx.ripples) {
    const q = r.t / r.life, X = V.ox + r.x * V.s, Y = V.oy + r.y * V.s;
    ctx.strokeStyle = r.color.replace('A', (1 - q) * r.a); ctx.lineWidth = Math.max(1, 2.5 * (1 - q));
    ctx.beginPath(); ctx.arc(X, Y, (r.r0 + r.grow * Math.pow(q, 0.6)) * V.s, 0, TAU); ctx.stroke();
  }
  for (const p of fx.parts) {
    const X = V.ox + p.x * V.s, Y = V.oy + p.y * V.s, q = p.t / p.life;
    if (p.kind === 'star') star(ctx, X, Y, p.size * V.s * (1 - q * 0.5), 1 - q, p.rot);
    else if (p.kind === 'puff') { ctx.fillStyle = `rgba(250,252,255,${0.85 * (1 - q)})`; ctx.beginPath(); ctx.arc(X, Y, p.size * V.s * (0.6 + q * 0.8), 0, TAU); ctx.fill(); }
    else { ctx.fillStyle = `rgba(255,225,220,${0.8 * (1 - q)})`; ctx.beginPath(); ctx.arc(X, Y, Math.max(0.8, p.size * V.s * (1 - q * 0.6)), 0, TAU); ctx.fill(); }
  }
  // 拖曳中的圈：越紅越快斷
  const h = W.held;
  if (h) {
    const X = V.ox + h.x * V.s, Y = V.oy + h.y * V.s, R = h.r * V.s * dropScale(h) + 7;
    const st = clamp(h.stress);
    ctx.strokeStyle = st > 0.05 ? `rgba(255,${Math.round(220 - 200 * st)},${Math.round(220 - 200 * st)},${0.55 + 0.4 * st})` : 'rgba(255,255,255,.45)';
    ctx.lineWidth = 1.5 + st * 2.5;
    ctx.setLineDash([4, 5]); ctx.lineDashOffset = -t * 30;
    ctx.beginPath(); ctx.arc(X, Y, R + st * 3 * Math.sin(t * 40), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  // 對拍縮圈：拖著水珠時，外圈在下一拍剛好縮到水珠邊緣
  if (h && state === 'play') {
    const X = V.ox + h.x * V.s, Y = V.oy + h.y * V.s, R = h.r * V.s * dropScale(h) + 5;
    const col = stats.fever ? '255,201,60' : '255,255,255';
    const ar = R + 64 * (1 - B.f);
    ctx.strokeStyle = `rgba(${col},${0.12 + 0.75 * B.f * B.f})`; ctx.lineWidth = 2 + 2 * B.f;
    ctx.beginPath(); ctx.arc(X, Y, ar, 0, TAU); ctx.stroke();
    if (B.f < 0.18) {
      const q = B.f / 0.18;
      ctx.strokeStyle = `rgba(${col},${0.9 * (1 - q)})`; ctx.lineWidth = 5 * (1 - q) + 1;
      ctx.beginPath(); ctx.arc(X, Y, R + q * 16, 0, TAU); ctx.stroke();
    }
  }
  // 示範模式與鍵盤的游標
  const cur = mode === 'foam' ? null : state === 'intro' && demo.on && W.held ? { x: demo.px, y: demo.py, on: !!W.held } : kb.on && state === 'play' ? { x: kb.x, y: kb.y, on: grabbedBy === 'key' } : null;
  if (cur) {
    const X = V.ox + cur.x * V.s, Y = V.oy + cur.y * V.s;
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X, Y, cur.on ? 9 : 13, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(X, Y, 3, 0, TAU); ctx.fill();
  }
  drawFoamCursor(B, t);
  drawBeatFrame(B);
  for (const tx of fx.texts) {
    const q = tx.t / tx.life, X = V.ox + tx.x * V.s, Y = V.oy + tx.y * V.s - q * 34;
    const pop = q < 0.12 ? 1.7 - q / 0.12 * 0.7 : 1;
    ctx.save(); ctx.translate(X, Y); ctx.scale(pop, pop); ctx.translate(-X, -Y);
    ctx.globalAlpha = q < 0.15 ? q / 0.15 : 1 - Math.max(0, (q - 0.6) / 0.4);
    ctx.font = `800 ${tx.size}px ${getComputedStyle(document.documentElement).getPropertyValue('--num')}, "PingFang TC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(60,0,4,.85)'; ctx.strokeText(tx.text, X, Y);
    ctx.fillStyle = tx.color; ctx.fillText(tx.text, X, Y);
    ctx.globalAlpha = 1; ctx.restore();
  }
}

// 泡沫層：每格畫一顆圓（厚度決定大小），先畫灰色影子再畫白色，最後貼泡泡紋理
function drawFoam(B, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(dirtC, 0, 0);
  if (!F) return;
  const L = foamL.getContext('2d');
  L.setTransform(1, 0, 0, 1, 0, 0); L.clearRect(0, 0, foamL.width, foamL.height);
  const k = V.s * DPR, C = Foam.CELL, GW = Foam.GW, cov = Foam.CFG.cover;
  const pulse = 1 + (B.bar >= 0 ? B.env * 0.05 : 0);
  const thin = new Path2D(), sh = new Path2D(), body = new Path2D();
  for (let j = 0; j < Foam.GH; j++) for (let i = 0; i < GW; i++) {
    const c = j * GW + i, f = F.f[c];
    if (f < 0.08 || !F.inside[c]) continue;
    const y0 = (j + 0.5) * C; if (y0 < rinseY) continue;
    const X = (V.ox + ((i + 0.5) * C + F.jx[c]) * V.s) * DPR, Y = (V.oy + (y0 + F.jy[c]) * V.s) * DPR;
    if (f < cov) { const r = C * 0.62 * k * F.js[c] * (0.5 + f); thin.moveTo(X + r, Y); thin.arc(X, Y, r, 0, TAU); continue; }
    const r = C * 0.62 * k * F.js[c] * Math.min(1.9, 0.95 + (f - cov) * 0.6) * pulse;
    sh.moveTo(X + r + 2 * DPR, Y + 3 * DPR); sh.arc(X + 2 * DPR, Y + 3 * DPR, r, 0, TAU);
    body.moveTo(X + r, Y); body.arc(X, Y, r, 0, TAU);
  }
  L.fillStyle = 'rgba(235,240,245,.42)'; L.fill(thin);
  L.fillStyle = 'rgba(150,158,170,1)'; L.fill(sh);
  L.fillStyle = stats.fever && state === 'play' ? '#fff8e6' : '#fbfcfd'; L.fill(body);
  L.globalCompositeOperation = 'source-atop';
  L.fillStyle = L.createPattern(BUBBLES, 'repeat'); L.fillRect(0, 0, foamL.width, foamL.height);
  L.globalCompositeOperation = 'source-over';
  ctx.drawImage(foamL, 0, 0);
  // 沖水：一條水幕從擋風玻璃往車頭掃
  if (state === 'outro' && rinseY > -100 && rinseY < 1150) {
    setL(ctx); ctx.save(); ctx.clip(HOOD_P);
    const g = ctx.createLinearGradient(0, rinseY - 90, 0, rinseY + 20);
    g.addColorStop(0, 'rgba(200,230,255,0)'); g.addColorStop(0.75, 'rgba(220,240,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,.85)');
    ctx.fillStyle = g; ctx.fillRect(0, rinseY - 90, 1000, 110);
    ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// 泡沫版的刷子圈與對拍縮圈
function drawFoamCursor(B, t) {
  if (mode !== 'foam' || !(state === 'play' || (state === 'intro' && demo.foamOn))) return;
  const p = state === 'intro' ? { x: demo.px, y: demo.py, on: true } : brushPt;
  if (!p.seen && state === 'play' && !p.on) return;
  const X = V.ox + p.x * V.s, Y = V.oy + p.y * V.s, R = Foam.CFG.brushR * V.s;
  const st = F ? clamp(F.stress) : 0;
  ctx.strokeStyle = p.on ? (st > 0.05 ? `rgba(255,${220 - 200 * st | 0},${220 - 200 * st | 0},${0.6 + 0.4 * st})` : 'rgba(255,255,255,.55)') : 'rgba(255,255,255,.22)';
  // 泡沫是白的，所以圈圈都先描一圈深色
  const ring = (r, col, w) => {
    ctx.lineWidth = w + 3; ctx.strokeStyle = 'rgba(20,6,8,.55)'; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.stroke();
  };
  const brushCol = ctx.strokeStyle;
  ctx.setLineDash([5, 6]); ctx.lineDashOffset = -t * 30;
  ring(R, brushCol, 1.5 + st * 2.5); ctx.setLineDash([]);
  if (state === 'play') {
    const col = stats.fever ? '255,201,60' : '255,52,60';
    ring(10 + (R + 50) * (1 - B.f), `rgba(${col},${0.2 + 0.8 * B.f * B.f})`, 2 + 2.5 * B.f);
    if (B.f < 0.18) { const q = B.f / 0.18; ring(10 + q * 22, `rgba(${col},${0.95 * (1 - q)})`, 5 * (1 - q) + 1.5); }
  }
}

// 整個畫面的邊框跟著拍子閃（Patapon 那種），第一拍最亮
function drawBeatFrame(B) {
  const live = state === 'play' || state === 'count';
  const W2 = VW, H2 = stageR.h;   // 只閃在儀表板與控制台之間的遊戲區
  ctx.save(); ctx.translate(0, stageR.top);
  let a = B.bar >= 0 ? B.env : 0;
  if (state === 'outro' || state === 'result') a *= 0.25;
  const strength = live ? (B.inBar === 0 ? 1 : 0.7) : 0.28;
  let col = '255,255,255';
  if (live && state === 'play' && timeLeft() < 4) col = '255,55,60';
  if (stats.fever && state === 'play') col = B.b % 2 ? '255,201,60' : '255,90,40';
  const edge = (c, k, len) => {
    const g = [[0, 0, 0, len, 0, 0, W2, len], [0, H2, 0, H2 - len, 0, H2 - len, W2, len], [0, 0, len, 0, 0, 0, len, H2], [W2, 0, W2 - len, 0, W2 - len, 0, len, H2]];
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of g) {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(${c},${k})`); gr.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = gr; ctx.fillRect(rx, ry, rw, rh);
    }
  };
  const k = a * strength;
  if (k > 0.01) {
    edge(col, 0.55 * k, 26 + 70 * k);
    const bw = 3 + 9 * k;
    ctx.fillStyle = `rgba(${col},${0.9 * k})`;
    ctx.fillRect(0, 0, W2, bw); ctx.fillRect(0, H2 - bw, W2, bw); ctx.fillRect(0, 0, bw, H2); ctx.fillRect(W2 - bw, 0, bw, H2);
  }
  if (flash.gold > 0) {
    ctx.fillStyle = `rgba(255,214,120,${0.1 * flash.gold})`; ctx.fillRect(0, 0, W2, H2);
    edge('255,214,120', 0.8 * flash.gold, 120 * flash.gold + 20);
  }
  if (flash.red > 0) edge('255,40,50', 0.7 * flash.red, 110 * flash.red + 20);
  ctx.restore();
}

function dropScale(d) {
  const a = d.age;
  return a < 0.16 ? 0.3 + 0.7 * (1 - Math.pow(1 - a / 0.16, 3)) : 1;
}

function drawDrop(d, k, pulse, isBig, B) {
  const X = (V.ox + d.x * V.s) * DPR, Y = (V.oy + d.y * V.s) * DPR;
  const R = d.r * k * dropScale(d) * pulse;
  if (R < 0.6) return;
  if (d.fade != null) ctx.globalAlpha = clamp(d.fade);
  const n = R < 5 ? 10 : R < 18 ? 18 : R < 50 ? 28 : 40;
  const held = d === W.held;
  const sp = Math.hypot(d.vx, d.vy), e = held || d.fade != null ? Math.min(0.22, sp / Core.vmax(d.r) * 0.1) : 0, vd = Math.atan2(d.vy, d.vx);
  const path = new Path2D();
  for (let i = 0; i <= n; i++) {
    const th = i / n * TAU;
    const f = 1 + d.w2 * Math.cos(2 * (th - d.p2)) + d.w3 * Math.cos(3 * (th - d.p3)) + e * Math.cos(2 * (th - vd));
    const x = X + Math.cos(th) * R * f, y = Y + Math.sin(th) * R * f;
    i ? path.lineTo(x, y) : path.moveTo(x, y);
  }
  ctx.save(); ctx.clip(path);
  if (R > 3) {
    // 折射：水珠裡看到周圍倒過來、縮小的景
    const m = 1.9;
    ctx.translate(X, Y); ctx.scale(-1, -1);
    ctx.drawImage(under, X - R * m, Y - R * m, R * 2 * m, R * 2 * m, -R * 1.08, -R * 1.08, R * 2.16, R * 2.16);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(170,10,20,.16)'; ctx.fill(path);
  } else { ctx.fillStyle = '#8c070d'; ctx.fill(path); }
  ctx.drawImage(SHADE, X - R * 1.04, Y - R * 1.04, R * 2.08, R * 2.08);
  ctx.restore();
  ctx.strokeStyle = 'rgba(35,0,2,.45)'; ctx.lineWidth = Math.max(0.8, R * 0.035); ctx.stroke(path);
  // 高光：拍點時更亮
  const hi = 0.78 + B.env * 0.22;
  ctx.save(); ctx.translate(X - R * 0.36, Y - R * 0.4); ctx.rotate(-0.65);
  ctx.fillStyle = `rgba(255,255,255,${hi})`;
  ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.7, R * 0.22), Math.max(0.5, R * 0.12), 0, 0, TAU); ctx.fill();
  ctx.restore();
  if (R > 9) { ctx.fillStyle = `rgba(255,255,255,${0.55 * hi})`; ctx.beginPath(); ctx.arc(X + R * 0.12, Y - R * 0.58, R * 0.05, 0, TAU); ctx.fill(); }
  if (isBig && B.bar >= 0 && R > 14) {
    ctx.globalCompositeOperation = 'lighter';
    star(ctx, X - R * 0.36, Y - R * 0.4, R * (0.35 + 0.45 * B.env), 0.35 + 0.6 * B.env, 0.3 + B.b * 0.4, 1);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
}

function star(c, x, y, r, a = 1, rot = 0, scale) {
  if (a <= 0 || r <= 0) return;
  c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha *= a;
  c.drawImage(GLOW, -r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
  c.fillStyle = '#fff';
  for (let i = 0; i < 2; i++) {
    c.beginPath(); c.moveTo(-r, 0); c.quadraticCurveTo(0, -r * 0.07, r, 0); c.quadraticCurveTo(0, r * 0.07, -r, 0); c.fill(); c.rotate(Math.PI / 2);
  }
  c.restore();
}

// ---------- 特效 ----------
function ripple(x, y, r0, grow, color = 'rgba(255,255,255,A)', life = 0.45, a = 0.7) { fx.ripples.push({ x, y, r0, grow, color, life, a, t: 0 }); }
function floatText(text, x, y, color = '#fff', size = 20) { const o = { text, x, y, color, size, t: 0, life: 0.9 }; fx.texts.push(o); return o; }
function spray(x, y, n, spd, size = 4) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = spd * (0.4 + Math.random() * 0.8);
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: size * (0.5 + Math.random()), t: 0, life: 0.35 + Math.random() * 0.3 }); }
}
function sparkles(x, y, n, spread) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = spread * (0.5 + Math.random());
    fx.parts.push({ kind: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 14 + Math.random() * 16, rot: Math.random(), t: 0, life: 0.5 + Math.random() * 0.3 }); }
}
function updateFx(dt) {
  for (const k of ['ripples', 'texts', 'ghosts']) { for (const e of fx[k]) e.t += dt; fx[k] = fx[k].filter(e => e.t < (e.life || 0.12)); }
  for (const p of fx.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
  fx.parts = fx.parts.filter(p => p.t < p.life);
  for (const tr of fx.trails) tr.a = Math.max(0, tr.a - dt * 0.25);
  flash.gold = Math.max(0, flash.gold - dt * 3); flash.red = Math.max(0, flash.red - dt * 2.5);
  fx.trails = fx.trails.filter(tr => tr.a > 0);
}

// ---------- 遊戲流程 ----------
const timeLeft = () => state === 'play' ? Math.max(0, Sound.GAME_START + Sound.GAME_LEN - Sound.pos()) : state === 'count' ? 20 : 0;
function score() { return mode === 'foam' ? (F ? Foam.coverage(F) : 0) : Math.min(1, Core.share(W) + stats.bonus); }

function show(id, on) { $(id).hidden = !on; }
function screen(name) {
  $('#game').className = name;
  show('#result', name === 'result');
  $('#engine-label').textContent = { intro: '開始', play: '收工', result: '再洗' }[name];
}

function newLevel(seed) {
  if (mode === 'foam') { F = Foam.create(seed); W = { drops: [], total: 1, held: null, ox: 0, oy: 0, tx: 0, ty: 0, t: 0 }; }
  else { F = null; W = Core.makeLevel(seed); }
  brushPt = { x: 500, y: 520, on: false, seen: false }; lastSprayBeat = -99; rinseY = -1e9;
  if (dirtC.width) buildDirt();
  fx = { ripples: [], parts: [], texts: [], ghosts: [], trails: [] };
  stats = { perfect: 0, splits: 0, merges: 0, bonus: 0, combo: 0, maxCombo: 0, lastPB: -99, fever: false };
  flash = { gold: 0, red: 0 };
  Sound.setFever(false);
}

function startGame() {
  Sound.init();
  runSeed = (Date.now() % 100000) + 1;
  newLevel(runSeed);
  state = 'count'; paused = false; resultShown = false; lastStep = -1; hintMsg = null; grabbedBy = null;
  screen('play');
  Sound.play('game', onSongEnd);
  cv.focus({ preventScroll: true });
}
function onSongEnd() { if (state === 'outro' || state === 'result') Sound.play('result', null, 0.02); }

function endGame(early) {
  if (state !== 'play') return;
  Core.release(W); grabbedBy = null;
  if (stats.fever) { stats.fever = false; Sound.setFever(false); }
  if (F) { Foam.lift(F); brushPt.on = false; }
  finalScore = score(); stats.share = mode === 'foam' ? finalScore : Core.share(W);   // 收工當下就記下來，之後水珠會滑落
  state = 'outro'; outroAt = performance.now() / 1000;
  if (early) Sound.play('game', onSongEnd, 0.03, 11 * 16);   // 直接跳到收尾和弦
  // 水珠往車頭滑落：大顆先走，越大越快
  for (const d of W.drops) { d.slide = 0.05 + Math.random() * 0.25 + (1 - clamp(d.r / 120)) * 0.35; d.vy = 0; d.vx = 0; }
  const b = Core.biggest(W.drops); if (b) b.slide = 0;
  saveBest();
}

function saveBest() {
  try {
    const best = +localStorage.getItem(MODE[mode].key) || 0;
    if (finalScore > best) localStorage.setItem(MODE[mode].key, String(finalScore));
    stats.best = Math.max(best, finalScore); stats.newBest = finalScore > best;
  } catch (e) { stats.best = finalScore; }
}
function loadBest() { try { return +localStorage.getItem(MODE[mode].key) || 0; } catch (e) { return 0; } }

const TITLES = {
  S: ['一顆到底', '鍍膜師傅看了都點頭。'],
  A: ['撥水漂亮', '可以去洗下一台了。'],
  B: ['還有幾顆在偷懶', '再慢一點、再穩一點。'],
  C: ['水珠各自散步中', '大顆的要拖慢一點。'],
  F: ['引擎蓋還在下雨', '按住一顆，慢慢靠向另一顆。'],
};
const TITLES_FOAM = {
  S: ['泡泡大滿貫', '整台都是綿密泡沫，髒污無處可躲。'],
  A: ['泡得漂亮', '只剩一點點縫，下次抹勻一點。'],
  B: ['還有幾塊沒泡到', '踩拍噴，泡沫會更多。'],
  C: ['泡沫不太夠', '別抹太快，泡沫會破。'],
  F: ['只泡到一角', '踩著拍子按下去噴泡沫，再慢慢抹開。'],
};
function showResult() {
  resultShown = true; state = 'result';
  const g = gradeOf(finalScore), [t1, t2] = (mode === 'foam' ? TITLES_FOAM : TITLES)[g];
  $('#final').textContent = g;
  $('#result-title').textContent = t1;
  $('#result-sub').textContent = t2;
  $('#ticket-no').textContent = `No. ${String(runSeed).padStart(5, '0')}　${new Date().toLocaleDateString('zh-TW')}`;
  const rows = mode === 'foam'
    ? [['泡沫覆蓋率', `${Math.round(stats.share * 100)}%`], ['踩拍噴泡', `${stats.perfect} 次`], ['最高連擊', `${stats.maxCombo} 連`], ['破洞', `${stats.splits} 次`], ['總分', `${Math.round(finalScore * 100)}`]]
    : [['最大水珠佔', `${Math.round(stats.share * 100)}%`], ['踩拍合併', `${stats.perfect} 次`], ['最高連擊', `${stats.maxCombo} 連`], ['斷開', `${stats.splits} 次`], ['總分', `${Math.round(finalScore * 100)}`]];
  $('#stamp span').textContent = mode === 'foam' ? '泡沫檢驗' : '撥水檢驗';
  $('.product img').src = MODE[mode].product[0]; $('.product b').textContent = MODE[mode].product[1];
  $('#rows').innerHTML = rows.map(([k, v]) => `<li>${k}<b>${v}</b></li>`).join('');
  $('#record').textContent = stats.newBest ? '★ 新紀錄' : `最佳紀錄 ${gradeOf(stats.best)} · ${Math.round(stats.best * 100)} 分`;
  screen('result');
  // 檢驗章晚一點蓋下去
  const st = $('#stamp'); st.classList.remove('hit'); st.style.opacity = 0;
  setTimeout(() => { st.style.opacity = ''; void st.offsetWidth; st.classList.add('hit'); Sound.sfx.stamp(); }, 450);
}

function goHome() {
  state = 'intro'; newLevel(7); demo = { wait: 1.2, target: null, px: 500, py: 520, on: true, reset: 0, foamOn: false, ang: 0, t: 0 };
  screen('intro'); updateBest();
  if (Sound.ready) Sound.play('title');
}
function updateBest() {
  const b = loadBest();
  $('#best').textContent = (b ? `最佳 ${gradeOf(b)} · ${Math.round(b * 100)} 分　` : '') + '點這裡換模式 ⇄';
  $('.title-plate .name').textContent = MODE[mode].name;
  $('#gauge-label').textContent = MODE[mode].gauge;
  document.body.dataset.mode = mode;
}
// 標題畫面點中間的牌子：切換水珠／泡沫
function switchMode() {
  if (state !== 'intro') return;
  mode = mode === 'foam' ? 'drops' : 'foam';
  history.replaceState(null, '', mode === 'foam' ? '#foam' : location.pathname + location.search);
  goHome(); Sound.sfx.stamp();
}

// ---------- 事件處理 ----------
function onEvents(ev, B) {
  for (const e of ev) {
    if (e.type === 'merge') {
      fx.ghosts.push({ x: e.bx, y: e.by, r: e.br, to: e.to, t: 0 });
      ripple(e.to.x, e.to.y, e.to.r * 0.9, 22 + e.br * 0.6, 'rgba(255,255,255,A)', 0.4, 0.45);
      if (state !== 'play') { if (state === 'intro' && Math.random() < 0.5) Sound.sfx.merge(stats.merges++ % 8, false); continue; }
      stats.merges++;
      if (e.held && e.br >= 12) {
        // 踩拍：吃掉夠大的水珠、而且時間離最近的拍點 70ms 以內
        const off = B.p - Math.round(B.p / Sound.SPB) * Sound.SPB;
        if (Math.abs(off) < 0.07) {
          // 連擊：上一次踩拍在 4 拍以內就接得上；4 連以上進入 FEVER
          const bi = Math.round(B.p / Sound.SPB);
          stats.combo = bi - stats.lastPB <= 4 ? stats.combo + 1 : 1; stats.lastPB = bi;
          stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
          stats.perfect++; stats.bonus = Math.min(0.12, stats.bonus + (stats.fever ? 0.01 : 0.005));
          flash.gold = 1;
          ripple(e.to.x, e.to.y, e.to.r, 60 + e.to.r * 0.5, 'rgba(255,214,140,A)', 0.55, 1);
          ripple(e.to.x, e.to.y, e.to.r * 1.1, 120 + e.to.r * 0.6, 'rgba(255,255,255,A)', 0.4, 0.6);
          sparkles(e.bx, e.by, 6, 200);
          fx.texts = fx.texts.filter(t => !t.combo);   // 新的連擊字取代舊的，不疊在一起
          floatText(stats.combo > 1 ? `${stats.combo} 連踩拍！` : '踩拍！', e.to.x, e.to.y - e.to.r - 26, stats.fever ? '#ffc93c' : '#ffe2a0', 30).combo = true;
          Sound.sfx.perfect(stats.combo);
          if (!stats.fever && stats.combo >= 4) {
            stats.fever = true; Sound.setFever(true); Sound.sfx.fever();
            sparkles(e.to.x, e.to.y, 14, 420);
            hint('FEVER！踩拍加倍', 'fever', 2.2);
          }
        } else Sound.sfx.merge(stats.merges, e.to.r > 90);
      } else if (e.held) Sound.sfx.merge(stats.merges, false);
    } else if (e.type === 'split') {
      if (state === 'play') {
        stats.splits++; Sound.sfx.split(); flash.red = 1;
        hint(stats.fever ? '斷了！FEVER 結束' : '水珠拉斷了，放慢一點', 'warn', 1.4);
        breakCombo();
      }
      grabbedBy = null;
      spray(e.x, e.y, 14, 420, 5);
      floatText('斷了！', e.x, e.y - e.r - 20, '#ff6b70', 22);
      ripple(e.x, e.y, e.r * 0.5, 60, 'rgba(255,120,120,A)', 0.4, 0.8);
    }
  }
}

function breakCombo() { stats.combo = 0; if (stats.fever) { stats.fever = false; Sound.setFever(false); } }
// 超過 4 拍沒踩到，連擊就斷
function comboTick(B) {
  if (stats.combo && B.b - stats.lastPB > 4) { if (stats.fever) hint('節奏斷了，FEVER 結束', 'warn', 1.2); breakCombo(); }
}

function hint(text, cls = '', dur = 1.2) { hintMsg = { text, cls, until: performance.now() / 1000 + dur }; }

// 泡沫版：按下去噴一坨（看踩拍準不準決定量），一拍只能噴一次
function foamPress(x, y, B) {
  brushPt = { x, y, on: true, seen: true };
  Foam.lift(F); Foam.brush(F, x, y, 0);
  const bi = Math.round(B.p / Sound.SPB);
  if (bi === lastSprayBeat) return;
  lastSprayBeat = bi;
  const off = Math.abs(B.p - bi * Sound.SPB);
  const q = off < 0.08 ? 'perfect' : off < 0.17 ? 'good' : 'miss';
  if (q === 'perfect') {
    stats.combo = bi - stats.lastPB <= 4 ? stats.combo + 1 : 1; stats.lastPB = bi;
    stats.maxCombo = Math.max(stats.maxCombo, stats.combo); stats.perfect++;
    flash.gold = 1;
    fx.texts = fx.texts.filter(t => !t.combo);
    floatText(stats.combo > 1 ? `${stats.combo} 連踩拍！` : '踩拍！', x, y - 110, stats.fever ? '#ffc93c' : '#ffe2a0', 30).combo = true;
    sparkles(x, y, 5, 200);
    Sound.sfx.perfect(stats.combo);
    if (!stats.fever && stats.combo >= 4) { stats.fever = true; Sound.setFever(true); Sound.sfx.fever(); sparkles(x, y, 14, 420); hint('FEVER！泡沫加量', 'fever', 2.2); }
  } else {
    if (stats.combo >= 2) hint(stats.fever ? '沒踩到拍，FEVER 結束' : '沒踩到拍', 'warn', 0.9);
    breakCombo();
    floatText(q === 'good' ? '差一點' : '沒踩到', x, y - 100, q === 'good' ? '#fff' : '#ff9a9e', 20);
  }
  Foam.spray(F, x, y, Foam.CFG[q] * (stats.fever ? Foam.CFG.fever : 1));
  ripple(x, y, 20, 90, 'rgba(255,255,255,A)', 0.45, 0.8);
  puff(x, y, q === 'perfect' ? 16 : 9);
  Sound.sfx.spray(q);
}
function foamRelease() { brushPt.on = false; if (F) Foam.lift(F); }
function puff(x, y, n) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 80 + Math.random() * 260;
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 6 + Math.random() * 9, t: 0, life: 0.4 + Math.random() * 0.3, kind: 'puff' }); }
}
function foamTick(dt) {
  if (!brushPt.on || !F) return;
  if (Foam.brush(F, brushPt.x, brushPt.y, dt) === 'tear') {
    stats.splits++; flash.red = 1; Sound.sfx.split();
    hint(stats.fever ? '泡沫破了！FEVER 結束' : '泡沫破洞了，抹慢一點', 'warn', 1.4);
    breakCombo();
    floatText('破洞！', brushPt.x, brushPt.y - 100, '#ff6b70', 24);
    spray(brushPt.x, brushPt.y, 16, 380, 4);
  }
}
function foamOutroTick(t) {
  const el = t - outroAt;
  const ny = -60 + el * 760;                          // 水幕往下掃
  if (F && ny > rinseY) {
    const c = dirtC.getContext('2d'); setL(c); c.globalCompositeOperation = 'destination-out';
    const C = Foam.CELL;
    for (let j = 0; j < Foam.GH; j++) {
      const y = (j + 0.5) * C; if (y <= rinseY || y > ny) continue;
      for (let i = 0; i < Foam.GW; i++) {
        const k = j * Foam.GW + i;
        if (F.inside[k] && F.f[k] >= Foam.CFG.cover) { c.beginPath(); c.arc((i + 0.5) * C, y, C * 0.95, 0, TAU); c.fill(); if (Math.random() < 0.04) sparkles((i + 0.5) * C, y, 1, 40); }
      }
    }
    c.globalCompositeOperation = 'source-over';
    rinseY = ny;
  }
  if (!resultShown && el > 2.3) showResult();
}

// 下雨：配樂裡的高音水滴聲響時，新的小水珠落下
function rain(B) {
  if (B.name !== 'game' || mode === 'foam') return;
  const st = B.st;
  if (st <= lastStep) return;
  for (let s = lastStep + 1; s <= st; s++) {
    if (!Sound.RAIN.has(s)) continue;
    for (let tries = 0; tries < 30; tries++) {
      const y = 60 + Math.random() * 940, x = leftAt(y) + 40 + Math.random() * (rightAt(y) - leftAt(y) - 80);
      const r = 6 + Math.random() * 4;
      if (W.drops.every(o => Math.hypot(o.x - x, o.y - y) > o.r + r + 12)) {
        Core.addDrop(W, x, y, r); ripple(x, y, r, 40, 'rgba(255,255,255,A)', 0.5, 0.6); spray(x, y, 5, 160, 2.2); break;
      }
    }
  }
  lastStep = st;
}

// ---------- 標題畫面的示範 ----------
function demoTick(dt) {
  if (!demo.on) return;
  if (mode === 'foam') {   // 示範：噴一下、繞圈抹開
    demo.t += dt; demo.reset += dt;
    if (demo.reset > 18 || Foam.coverage(F) > 0.8) { newLevel(7 + Math.floor(Math.random() * 50)); demo.reset = 0; demo.t = 0; }
    if (demo.t > 1.6 || !demo.foamOn) {
      const tg = Foam.emptiest(F, Math.random); demo.cx = tg.x; demo.cy = tg.y; demo.ang = Math.random() * TAU; demo.rad = 10; demo.t = 0;
      Foam.lift(F); Foam.spray(F, demo.cx, demo.cy, Foam.CFG.perfect); demo.foamOn = true;
      demo.px = demo.cx; demo.py = demo.cy; Foam.brush(F, demo.px, demo.py, 0);
      ripple(demo.cx, demo.cy, 20, 80, 'rgba(255,255,255,A)', 0.45, 0.6); puff(demo.cx, demo.cy, 8);
    }
    demo.ang += 500 * dt / Math.max(demo.rad, 30); demo.rad = Math.min(120, demo.rad + 70 * dt);
    demo.px = demo.cx + Math.cos(demo.ang) * demo.rad; demo.py = demo.cy + Math.sin(demo.ang) * demo.rad;
    Foam.brush(F, demo.px, demo.py, dt);
    return;
  }
  demo.reset += dt;
  if (demo.reset > 16 || W.drops.length < 4) { newLevel(7 + Math.floor(Math.random() * 50)); demo.reset = 0; demo.wait = 1; }
  if (!W.held) {
    demo.wait -= dt;
    if (demo.wait > 0) return;
    const B = Core.biggest(W.drops);
    let best = null;
    for (const d of W.drops) if (d !== B) { const k = Math.hypot(d.x - B.x, d.y - B.y) - d.r - B.r; if (!best || k < best.k) best = { d, k }; }
    if (!best) return;
    demo.px = B.x; demo.py = B.y; Core.grab(W, B, demo.px, demo.py); demo.target = best.d;
  } else {
    const d = W.held, sp = Core.vmax(d.r) * 0.55;
    const dx = demo.target.x - demo.px, dy = demo.target.y - demo.py, L = Math.hypot(dx, dy) || 1;
    const s = Math.min(L, sp * dt);
    demo.px += dx / L * s; demo.py += dy / L * s;
    Core.pointer(W, demo.px, demo.py);
    if (!W.drops.includes(demo.target) || L < 2) { Core.release(W); demo.wait = 0.5; }
  }
}

// ---------- 主迴圈 ----------
let lastT = performance.now() / 1000, beatShown = -1;
function frame() { requestAnimationFrame(frame); run(performance.now() / 1000); }
function run(t) {
  let dt = Math.min(0.05, t - lastT); lastT = t;
  if (paused) dt = 0;
  const B = beat();

  if (!paused) {
    if (state === 'intro') { demoTick(dt); onEvents(Core.step(W, dt), B); }
    else if (state === 'count') {
      if (B.p >= Sound.GAME_START - 0.01) { state = 'play'; hint(mode === 'foam' ? '踩著拍子按下去噴泡沫，再慢慢抹開' : '按住水珠，慢慢拖向另一顆', '', 3); }
      Core.step(W, dt);
    } else if (state === 'play') {
      keyTick(dt);
      if (mode === 'foam') foamTick(dt);
      onEvents(Core.step(W, dt), B);
      comboTick(B);
      rain(B);
      if (timeLeft() <= 0) endGame(false);
    } else if (state === 'outro' || state === 'result') { if (mode === 'foam') foamOutroTick(t); else outroTick(dt, t); }
    updateFx(dt);
  }
  drawScene(B, t);
  hud(B, t);
}

function outroTick(dt, t) {
  const el = t - outroAt;
  for (const d of W.drops) {
    if (el < d.slide) continue;
    d.vy += (500 + d.r * 9) * dt; d.y += d.vy * dt; d.age += dt;
    d.w2 = Math.min(0.12, d.vy / 4000);
    if (d.vy > 30 && Math.random() < 0.6) fx.trails.push({ x0: d.x, y0: d.y - d.vy * dt - d.r * 0.4, x1: d.x, y1: d.y - d.r * 0.4, w: d.r * 0.9, a: 1 });
    if (d.y - d.r > bottomAt(d.x) - 10) d.fade = 1 - (d.y - d.r - bottomAt(d.x) + 10) / 60;
  }
  const before = W.drops.length;
  W.drops = W.drops.filter(d => d.fade == null || d.fade > 0);
  if (W.drops.length < before && Math.random() < 0.5) spray(500 + (Math.random() - 0.5) * 700, 1060, 3, 140, 2);
  if (!resultShown && el > 2.1) showResult();
}

// 儀表板：撥水率錶的刻度
(() => {
  const g = $('#ticks'), NS = 'http://www.w3.org/2000/svg';
  for (let v = 0; v <= 100; v += 5) {
    const a = (-120 + 240 * v / 100) * Math.PI / 180, major = v % 10 === 0;
    const r0 = major ? 41 : 44, r1 = 49;
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', 60 + Math.sin(a) * r0); l.setAttribute('y1', 60 - Math.cos(a) * r0);
    l.setAttribute('x2', 60 + Math.sin(a) * r1); l.setAttribute('y2', 60 - Math.cos(a) * r1);
    l.setAttribute('stroke-width', major ? 2 : 1); g.appendChild(l);
    if (v % 20 === 0) {
      const tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', 60 + Math.sin(a) * 32); tx.setAttribute('y', 60 - Math.cos(a) * 32); tx.textContent = v; g.appendChild(tx);
    }
  }
})();
const UI = { time: $('#time'), grade: $('#grade'), pct: $('#pct'), combo: $('#combo'), pieces: $('#pieces'), hint: $('#hint'),
  needle: $('#needle'), shift: $('#shift'), leds: [...$('#shift').children], root: $('#game') };
let gaugeV = 0;
function hud(B, t) {
  const live = state === 'count' || state === 'play';
  const left = live ? timeLeft() : state === 'intro' ? 20 : 0;
  const tx = left.toFixed(1);
  if (UI.time.textContent !== tx) UI.time.textContent = tx;
  UI.time.classList.toggle('hurry', state === 'play' && left < 4);
  UI.root.style.setProperty('--beat', B.bar >= 0 ? B.env.toFixed(3) : 0);
  // 撥水率錶：指針有點慣性
  const sc = state === 'intro' ? (mode === 'foam' ? score() : Core.share(W)) : state === 'play' || state === 'count' ? score() : finalScore;
  gaugeV += (sc - gaugeV) * 0.12;
  UI.needle.style.transform = `rotate(${-120 + 240 * gaugeV + (live ? B.env * 1.5 : 0)}deg)`;
  UI.pct.textContent = Math.round(sc * 100);
  UI.grade.textContent = gradeOf(sc);
  UI.combo.textContent = stats.combo;
  const big = Core.biggest(W.drops);
  UI.pieces.textContent = mode === 'foam' ? `泡沫 ${F ? Math.round(Foam.total(F)) : 0} · 破洞 ${stats.splits}` : `${W.drops.length} 顆 · 最大 ${big ? (big.r * 2 * HOOD.cm).toFixed(1) : 0}cm`;
  // 換檔燈當節拍燈：從兩邊往中間亮，全亮＝拍點
  const on = B.bar >= 0;
  const k = on ? Math.ceil(B.f * 6) : 0, flashOn = on && B.f < 0.14;
  UI.leds.forEach((el, i) => { const d = Math.min(i, 11 - i); el.classList.toggle('on', on && d < k); });
  UI.shift.classList.toggle('flash', flashOn);
  UI.shift.classList.toggle('down', on && B.inBar === 0);
  UI.shift.classList.toggle('fever', stats.fever && state === 'play');
  UI.shift.classList.toggle('hurry', state === 'play' && left < 4);
  const h = UI.hint;
  let text, cls = '';
  const foam = mode === 'foam';
  if (state === 'intro') { text = !Sound.ready ? '點一下畫面開音樂' : foam ? '按「開始」：踩拍噴泡沫，把引擎蓋鋪滿' : '按右下「開始」發動，把水珠聚成一顆'; }
  else if (state === 'outro' || state === 'result') { text = '收工！看看工單'; cls = 'good'; }
  else if (state === 'count') { const n = Math.max(0, Math.floor(B.p / Sound.SPB)); text = B.p < 0 ? '準備' : ['3', '2', '1', '開始！'][Math.min(3, n)]; cls = 'count'; }
  else if (hintMsg && t < hintMsg.until) { text = hintMsg.text; cls = hintMsg.cls; }
  else if (W.held && W.held.stress > 0.35) { text = '太快了！快斷了'; cls = 'warn'; }
  else if (foam && brushPt.on && F && F.stress > 0.35) { text = '太快了！泡沫要破了'; cls = 'warn'; }
  else if (stats.fever) { text = `FEVER  ${stats.combo} 連`; cls = 'fever'; }
  else if (stats.combo >= 2) { text = `踩拍 ${stats.combo} 連・4 連進 FEVER`; cls = 'good'; }
  else if (left < 4) { text = `最後 ${Math.ceil(left)} 秒！`; cls = 'warn'; }
  else if (foam) text = brushPt.on ? '慢慢抹開，薄的地方不算數' : left > 14 ? '換檔燈全亮時按下去＝踩拍噴泡沫' : '哪裡還是髒的，就去哪裡噴';
  else text = W.held ? '外圈縮到水珠邊緣時撞上去＝踩拍' : left > 14 ? '按住水珠，慢慢拖向另一顆' : '邊框閃的瞬間合併，加分';
  if (h.textContent !== text) h.textContent = text;
  if (h.className !== cls) h.className = cls;
}

// ---------- 操作 ----------
let activePointer = null;
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sound.init();
  if (state === 'intro') { if (Sound.songName() !== 'title') Sound.play('title'); return; }
  if (state !== 'play' || paused || activePointer != null) return;
  const [x, y] = toL(e.clientX, e.clientY);
  if (mode === 'foam') { activePointer = e.pointerId; cv.setPointerCapture(e.pointerId); kb.on = false; foamPress(x, y, beat()); return; }
  const pad = Math.max(14, 22 / V.s);
  const d = Core.hit(W, x, y, pad);
  if (!d) return;
  activePointer = e.pointerId; cv.setPointerCapture(e.pointerId);
  Core.release(W); Core.grab(W, d, x, y); grabbedBy = 'pointer'; kb.on = false;
  Sound.sfx.grab();
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== activePointer) return;
  const [x, y] = toL(e.clientX, e.clientY);
  if (mode === 'foam') { brushPt.x = x; brushPt.y = y; return; }
  if (grabbedBy !== 'pointer') return;
  Core.pointer(W, x, y);
});
const up = e => {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  if (mode === 'foam') foamRelease();
  if (grabbedBy === 'pointer') { Core.release(W); grabbedBy = null; }
};
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);

// 鍵盤：方向鍵移游標、空白鍵抓放
function keyTick(dt) {
  const k = kb.keys, dx = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0), dy = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
  if (!dx && !dy) return;
  kb.on = true;
  const sp = grabbedBy === 'key' && W.held ? Math.min(420, Core.vmax(W.held.r) * 0.85) : 520;
  const L = Math.hypot(dx, dy);
  kb.x = clamp(kb.x + dx / L * sp * dt, 20, 980); kb.y = clamp(kb.y + dy / L * sp * dt, 20, 1080);
  if (grabbedBy === 'key') Core.pointer(W, kb.x, kb.y);
  if (mode === 'foam' && kb.down) { brushPt.x = kb.x; brushPt.y = kb.y; }
}
addEventListener('keydown', e => {
  if (e.key.startsWith('Arrow')) { kb.keys[e.key] = true; e.preventDefault(); }
  else if (e.key === ' ' || e.key === 'Enter') {
    if (!$('#boot').hidden && !$('#boot').classList.contains('gone')) { ignite(); e.preventDefault(); return; }
    if (state === 'intro' && !(e.target.closest && e.target.closest('button,a'))) { startGame(); e.preventDefault(); return; }
    if (state === 'play' && !paused && mode === 'foam') { e.preventDefault(); kb.on = true; if (!kb.down) { kb.down = true; foamPress(kb.x, kb.y, beat()); } return; }
    if (state === 'play' && !paused) {
      e.preventDefault(); kb.on = true;
      if (grabbedBy === 'key') { Core.release(W); grabbedBy = null; }
      else { const d = Core.hit(W, kb.x, kb.y, 30); if (d) { Core.release(W); Core.grab(W, d, kb.x, kb.y); grabbedBy = 'key'; Sound.sfx.grab(); } }
    }
  } else if (e.key === 'Escape') { if (state === 'play' || state === 'count') togglePause(); else closeModals(); }
});
addEventListener('keyup', e => {
  if (e.key.startsWith('Arrow')) kb.keys[e.key] = false;
  if ((e.key === ' ' || e.key === 'Enter') && kb.down) { kb.down = false; foamRelease(); }
});

// ---------- 按鈕 ----------
function togglePause(force) {
  const p = force ?? !paused;
  if (p === paused) return;
  paused = p;
  $('#pause').setAttribute('aria-pressed', p);
  if (p) { Core.release(W); grabbedBy = null; activePointer = null; if (F) foamRelease(); Sound.pause(); $('#modal-title').textContent = '暫停中'; $('#resume').textContent = '繼續'; show('#modal', true); }
  else { Sound.resume(); show('#modal', false); $('#help').setAttribute('aria-pressed', 'false'); }
}
function closeModals() {
  if (!$('#modal').hidden) { if (paused) togglePause(false); else show('#modal', false); }
  $('#help').setAttribute('aria-pressed', 'false');
  show('#share-panel', false);
}
$('#engine').onclick = () => {
  Sound.init();
  if (state === 'intro' || state === 'result') startGame();
  else if (state === 'play') endGame(true);
};
$('#help').onclick = () => {
  $('#help').setAttribute('aria-pressed', 'true');
  if (state === 'play' || state === 'count') { togglePause(true); $('#modal-title').textContent = '玩法說明'; return; }
  $('#modal-title').textContent = '玩法說明'; $('#resume').textContent = '知道了'; show('#modal', true);
};
$('#resume').onclick = () => closeModals();
$('.plate.center').addEventListener('click', () => switchMode());
$('#pause').onclick = () => { if (state === 'play' || state === 'count') togglePause(); };
// 開機封面：點一下才發動（瀏覽器規定要點過才能出聲）
function ignite() {
  const b = $('#boot'); if (b.classList.contains('gone')) return;
  Sound.init(); Sound.play('title'); Sound.sfx.stamp();
  b.classList.add('gone'); setTimeout(() => { b.hidden = true; }, 520);
}
$('#boot').addEventListener('pointerdown', e => { e.preventDefault(); ignite(); });
$('#restart').onclick = () => startGame();
$('#home').onclick = () => goHome();
$('#share').onclick = () => shareImage();
$('#close-share').onclick = () => show('#share-panel', false);
const soundBtn = $('#sound');
function setSound(on) {
  Sound.setMuted(!on); soundBtn.setAttribute('aria-pressed', on);
  try { localStorage.setItem('hjaec-beads-mute', on ? '0' : '1'); } catch (e) {}
}
soundBtn.onclick = () => { Sound.init(); setSound(Sound.muted); if (state === 'intro' && !Sound.songName()) Sound.play('title'); };
try { if (localStorage.getItem('hjaec-beads-mute') === '1') setSound(false); } catch (e) {}

document.addEventListener('visibilitychange', () => { if (document.hidden && (state === 'play' || state === 'count')) togglePause(true); });

// 擋掉放大、選取、長按選單
['gesturestart', 'gesturechange', 'dblclick', 'contextmenu', 'selectstart', 'dragstart'].forEach(n =>
  document.addEventListener(n, e => { if (!(e.target.closest && e.target.closest('.share-sheet'))) e.preventDefault(); }, { passive: false }));
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouch = 0;
document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouch < 320) e.preventDefault(); lastTouch = n; }, { passive: false });

// ---------- 結算圖 ----------
const COVER = new Image(); COVER.src = 'assets/cover_tall.jpg';
function shareImage() {
  const w = 1080, h = 1350, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#0f0f11'; g.fillRect(0, 0, w, h);
  // 底圖用封面（GPT 生的鍍膜水珠特寫），壓暗後放字
  if (COVER.complete && COVER.naturalWidth) {
    const k = Math.max(w / COVER.naturalWidth, h / COVER.naturalHeight), cw = COVER.naturalWidth * k, ch = COVER.naturalHeight * k;
    g.drawImage(COVER, (w - cw) / 2, (h - ch) / 2, cw, ch);
  }
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(8,8,10,.92)'); gr.addColorStop(0.45, 'rgba(8,8,10,.55)'); gr.addColorStop(1, 'rgba(8,8,10,.9)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d9141c'; g.fillRect(0, 0, w, 10);
  drawMark(g, 110, 120, 84);
  g.fillStyle = '#f3f1ec'; g.font = '700 40px "PingFang TC", sans-serif'; g.textBaseline = 'middle';
  g.fillText('紅分子 HJAEC', 176, 100);
  g.fillStyle = '#94918b'; g.font = '500 28px "PingFang TC", sans-serif'; g.fillText(`${MODE[mode].name} · 洗車節奏小遊戲`, 176, 146);
  const gd = gradeOf(finalScore);
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(217,20,28,.8)'; g.shadowBlur = 50;
  g.font = '800 380px "Barlow Condensed", "Avenir Next Condensed", sans-serif'; g.fillText(gd, w / 2, 700);
  g.shadowBlur = 0;
  g.font = '800 64px "PingFang TC", sans-serif'; g.fillText((mode === 'foam' ? TITLES_FOAM : TITLES)[gd][0], w / 2, 1000);
  g.fillStyle = '#cfccc6'; g.font = '500 36px "PingFang TC", sans-serif';
  g.fillText(mode === 'foam' ? `泡沫覆蓋 ${Math.round(stats.share * 100)}%　踩拍噴泡 ${stats.perfect} 次` : `最大水珠佔 ${Math.round(stats.share * 100)}%　踩拍合併 ${stats.perfect} 次`, w / 2, 1080);
  g.fillStyle = '#d9141c'; g.font = '700 34px "PingFang TC", sans-serif'; g.fillText('hjaec.com', w / 2, 1250);
  const url = c.toDataURL('image/jpeg', 0.9);
  $('#share-image').src = url; $('#download').href = url;
  show('#share-panel', true);
}

// ---------- 開始 ----------
addEventListener('resize', resize);
if (document.fonts) document.fonts.ready.then(resize);
resize(); newLevel(7); updateBest();
requestAnimationFrame(frame);
window.__game = { get W() { return W; }, get F() { return F; }, get mode() { return mode; }, get state() { return state; }, get stats() { return stats; }, startGame, endGame, switchMode, V, run };   // 測試用
})();
