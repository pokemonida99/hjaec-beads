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
let DPR = 1, VW = 0, VH = 0;
const V = { s: 1, ox: 0, oy: 0 };          // 邏輯座標 → CSS px：x*s+ox
const FIT = { x0: -40, x1: 1040, y0: -70, y1: 1240 };

let W = Core.makeLevel(7);
let state = 'intro';           // intro | count | play | outro | result
let paused = false;
let runSeed = 1;
let fx = { ripples: [], parts: [], texts: [], ghosts: [], trails: [] };
let stats = { perfect: 0, splits: 0, merges: 0, bonus: 0 };
let lastStep = -1, outroAt = 0, resultShown = false, finalScore = 0;
let hintMsg = null;        // {text, cls, until}
let kb = { x: 500, y: 520, on: false, keys: {} };
let demo = { wait: 1, target: null, px: 500, py: 520, on: true, reset: 0 };
let grabbedBy = null;      // 'pointer' | 'key' | 'demo'

// ---------- 版面 ----------
function resize() {
  VW = innerWidth; VH = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  cv.width = under.width = Math.round(VW * DPR); cv.height = under.height = Math.round(VH * DPR);
  const r = $('#stage').getBoundingClientRect();
  const sw = Math.max(200, r.width - 24), sh = Math.max(200, r.height + 12);
  V.s = Math.min(sw / (FIT.x1 - FIT.x0), sh / (FIT.y1 - FIT.y0));
  V.ox = r.left + r.width / 2 - 500 * V.s;
  V.oy = r.top + r.height / 2 + 6 - ((FIT.y0 + FIT.y1) / 2) * V.s;
  buildBg();
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
  if (B.bar >= 0 && B.inBar === 0) {
    const x = lerp(-450, 1450, B.f);
    const gr = uctx.createLinearGradient(x - 180, 0, x + 180, 0);
    const a = (play ? 0.2 : 0.11) * Math.sin(B.f * Math.PI);
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
    gr.addColorStop(0, `rgba(230,20,30,${neon})`); gr.addColorStop(1, 'rgba(230,20,30,0)');
    ctx.fillStyle = gr; ctx.fillRect(x, 0, w, cv.height);
  }

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
  // 示範模式與鍵盤的游標
  const cur = state === 'intro' && demo.on && W.held ? { x: demo.px, y: demo.py, on: !!W.held } : kb.on && state === 'play' ? { x: kb.x, y: kb.y, on: grabbedBy === 'key' } : null;
  if (cur) {
    const X = V.ox + cur.x * V.s, Y = V.oy + cur.y * V.s;
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X, Y, cur.on ? 9 : 13, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(X, Y, 3, 0, TAU); ctx.fill();
  }
  for (const tx of fx.texts) {
    const q = tx.t / tx.life, X = V.ox + tx.x * V.s, Y = V.oy + tx.y * V.s - q * 34;
    ctx.globalAlpha = q < 0.15 ? q / 0.15 : 1 - Math.max(0, (q - 0.6) / 0.4);
    ctx.font = `800 ${tx.size}px ${getComputedStyle(document.documentElement).getPropertyValue('--num')}, "PingFang TC", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(60,0,4,.85)'; ctx.strokeText(tx.text, X, Y);
    ctx.fillStyle = tx.color; ctx.fillText(tx.text, X, Y);
    ctx.globalAlpha = 1;
  }
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
function floatText(text, x, y, color = '#fff', size = 20) { fx.texts.push({ text, x, y, color, size, t: 0, life: 0.9 }); }
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
  fx.trails = fx.trails.filter(tr => tr.a > 0);
}

// ---------- 遊戲流程 ----------
const timeLeft = () => state === 'play' ? Math.max(0, Sound.GAME_START + Sound.GAME_LEN - Sound.pos()) : state === 'count' ? 20 : 0;
function score() { return Math.min(1, Core.share(W) + stats.bonus); }

function show(id, on) { $(id).hidden = !on; }
function screen(name) {
  show('#intro', name === 'intro'); show('#intro-actions', name === 'intro');
  show('#hud', name === 'play'); show('#controls', name === 'play');
  show('#result', name === 'result');
}

function newLevel(seed) {
  W = Core.makeLevel(seed);
  fx = { ripples: [], parts: [], texts: [], ghosts: [], trails: [] };
  stats = { perfect: 0, splits: 0, merges: 0, bonus: 0 };
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
  finalScore = score();
  state = 'outro'; outroAt = performance.now() / 1000;
  if (early) Sound.play('game', onSongEnd, 0.03, 11 * 16);   // 直接跳到收尾和弦
  // 水珠往車頭滑落：大顆先走，越大越快
  for (const d of W.drops) { d.slide = 0.05 + Math.random() * 0.25 + (1 - clamp(d.r / 120)) * 0.35; d.vy = 0; d.vx = 0; }
  const b = Core.biggest(W.drops); if (b) b.slide = 0;
  saveBest();
}

function saveBest() {
  try {
    const best = +localStorage.getItem('hjaec-beads-best') || 0;
    if (finalScore > best) localStorage.setItem('hjaec-beads-best', String(finalScore));
    stats.best = Math.max(best, finalScore); stats.newBest = finalScore > best;
  } catch (e) { stats.best = finalScore; }
}
function loadBest() { try { return +localStorage.getItem('hjaec-beads-best') || 0; } catch (e) { return 0; } }

const TITLES = {
  S: ['一顆到底', '鍍膜師傅看了都點頭。'],
  A: ['撥水漂亮', '可以去洗下一台了。'],
  B: ['還有幾顆在偷懶', '再慢一點、再穩一點。'],
  C: ['水珠各自散步中', '大顆的要拖慢一點。'],
  F: ['引擎蓋還在下雨', '按住一顆，慢慢靠向另一顆。'],
};
function showResult() {
  resultShown = true; state = 'result';
  const g = Core.grade(finalScore), [t1, t2] = TITLES[g];
  $('#final').textContent = g;
  $('#result-title').textContent = t1;
  $('#summary').innerHTML = `${t2}<br>最大水珠佔 <b>${Math.round(Core.share(W) * 100)}%</b>　踩拍合併 <b>${stats.perfect}</b> 次　斷開 <b>${stats.splits}</b> 次`;
  $('#record').textContent = stats.newBest ? `新紀錄！分數 ${Math.round(finalScore * 100)}` : `分數 ${Math.round(finalScore * 100)}　最佳 ${Math.round(stats.best * 100)}`;
  screen('result');
}

function goHome() {
  state = 'intro'; newLevel(7); demo = { wait: 1.2, target: null, px: 500, py: 520, on: true, reset: 0 };
  screen('intro'); updateBest();
  if (Sound.ready) Sound.play('title');
}
function updateBest() { const b = loadBest(); $('#best').textContent = b ? `最佳 ${Core.grade(b)} · ${Math.round(b * 100)} 分` : ''; }

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
          stats.perfect++; stats.bonus = Math.min(0.08, stats.bonus + 0.005);
          ripple(e.to.x, e.to.y, e.to.r, 40 + e.to.r * 0.4, 'rgba(255,214,140,A)', 0.55, 0.9);
          sparkles(e.bx, e.by, 3, 120);
          floatText(stats.perfect > 1 ? `踩拍 ×${stats.perfect}` : '踩拍！', e.to.x, e.to.y - e.to.r - 24, '#ffd98a', 22);
          Sound.sfx.perfect(stats.perfect);
          hint(`踩在拍子上！合併更亮`, 'good', 1);
        } else Sound.sfx.merge(stats.merges, e.to.r > 90);
      } else if (e.held) Sound.sfx.merge(stats.merges, false);
    } else if (e.type === 'split') {
      if (state === 'play') { stats.splits++; Sound.sfx.split(); hint('水珠拉斷了，放慢一點', 'warn', 1.4); }
      grabbedBy = null;
      spray(e.x, e.y, 14, 420, 5);
      floatText('斷了！', e.x, e.y - e.r - 20, '#ff6b70', 22);
      ripple(e.x, e.y, e.r * 0.5, 60, 'rgba(255,120,120,A)', 0.4, 0.8);
    }
  }
}

function hint(text, cls = '', dur = 1.2) { hintMsg = { text, cls, until: performance.now() / 1000 + dur }; }

// 下雨：配樂裡的高音水滴聲響時，新的小水珠落下
function rain(B) {
  if (B.name !== 'game') return;
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
      if (B.p >= Sound.GAME_START - 0.01) { state = 'play'; hint('按住水珠，慢慢拖向另一顆', '', 3); }
      Core.step(W, dt);
    } else if (state === 'play') {
      keyTick(dt);
      onEvents(Core.step(W, dt), B);
      rain(B);
      if (timeLeft() <= 0) endGame(false);
    } else if (state === 'outro' || state === 'result') outroTick(dt, t);
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

function hud(B, t) {
  if (state !== 'count' && state !== 'play') return;
  const left = timeLeft();
  $('#time').textContent = left.toFixed(1);
  $('#time').classList.toggle('hurry', state === 'play' && left < 4);
  $('#time').style.transform = `scale(${1 + B.env * (left < 4 && state === 'play' ? 0.12 : 0.05)})`;
  $('#progress').style.width = `${(state === 'play' ? 1 - left / 20 : 0) * 100}%`;
  const sc = score();
  $('#grade').textContent = Core.grade(sc);
  $('#pct').textContent = Math.round(sc * 100) + '%';
  const big = Core.biggest(W.drops);
  $('#pieces').textContent = `水珠 ${W.drops.length} 顆 · 最大 ${big ? (big.r * 2 * HOOD.cm).toFixed(1) : 0} cm`;
  const h = $('#hint');
  let text, cls = '';
  if (state === 'count') { const n = Math.max(0, Math.floor(B.p / Sound.SPB)); text = B.p < 0 ? '準備' : ['3', '2', '1', '開始！'][Math.min(3, n)]; cls = 'count'; }
  else if (hintMsg && t < hintMsg.until) { text = hintMsg.text; cls = hintMsg.cls; }
  else if (W.held && W.held.stress > 0.35) { text = '太快了！快斷了'; cls = 'warn'; }
  else if (left < 4) { text = `最後 ${Math.ceil(left)} 秒！`; cls = 'warn'; }
  else text = W.held ? '慢慢拖，碰到就會聚起來' : left > 14 ? '按住水珠，慢慢拖向另一顆' : '合併的瞬間踩在拍子上，加分';
  if (h.textContent !== text) h.textContent = text;
  h.className = cls;
}

// ---------- 操作 ----------
let activePointer = null;
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sound.init();
  if (state === 'intro') { if (Sound.songName() !== 'title') Sound.play('title'); return; }
  if (state !== 'play' || paused || activePointer != null) return;
  const [x, y] = toL(e.clientX, e.clientY);
  const pad = Math.max(14, 22 / V.s);
  const d = Core.hit(W, x, y, pad);
  if (!d) return;
  activePointer = e.pointerId; cv.setPointerCapture(e.pointerId);
  Core.release(W); Core.grab(W, d, x, y); grabbedBy = 'pointer'; kb.on = false;
  Sound.sfx.grab();
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== activePointer || grabbedBy !== 'pointer') return;
  const [x, y] = toL(e.clientX, e.clientY);
  Core.pointer(W, x, y);
});
const up = e => {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
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
}
addEventListener('keydown', e => {
  if (e.key.startsWith('Arrow')) { kb.keys[e.key] = true; e.preventDefault(); }
  else if (e.key === ' ' || e.key === 'Enter') {
    if (state === 'intro' && !(e.target.closest && e.target.closest('button,a'))) { startGame(); e.preventDefault(); return; }
    if (state === 'play' && !paused) {
      e.preventDefault(); kb.on = true;
      if (grabbedBy === 'key') { Core.release(W); grabbedBy = null; }
      else { const d = Core.hit(W, kb.x, kb.y, 30); if (d) { Core.release(W); Core.grab(W, d, kb.x, kb.y); grabbedBy = 'key'; Sound.sfx.grab(); } }
    }
  } else if (e.key === 'Escape') { if (state === 'play' || state === 'count') togglePause(); else closeModals(); }
});
addEventListener('keyup', e => { if (e.key.startsWith('Arrow')) kb.keys[e.key] = false; });

// ---------- 按鈕 ----------
function togglePause(force) {
  const p = force ?? !paused;
  if (p === paused) return;
  paused = p;
  if (p) { Core.release(W); grabbedBy = null; activePointer = null; Sound.pause(); $('#modal-title').textContent = '暫停中'; $('#resume').textContent = '繼續'; show('#modal', true); }
  else { Sound.resume(); show('#modal', false); }
}
function closeModals() {
  if (!$('#modal').hidden) { if (paused) togglePause(false); else show('#modal', false); }
  show('#share-panel', false);
}
$('#start').onclick = () => startGame();
$('#help').onclick = () => {
  if (state === 'play' || state === 'count') { togglePause(true); $('#modal-title').textContent = '玩法說明'; return; }
  $('#modal-title').textContent = '玩法說明'; $('#resume').textContent = '知道了'; show('#modal', true);
};
$('#resume').onclick = () => closeModals();
$('#pause').onclick = () => togglePause(true);
$('#finish').onclick = () => endGame(true);
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
function shareImage() {
  const w = 1080, h = 1350, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#0f0f11'; g.fillRect(0, 0, w, h);
  // 引擎蓋截圖
  const hx = (V.ox - 30 * V.s) * DPR, hy = (V.oy - 30 * V.s) * DPR, hw = 1060 * V.s * DPR, hh = 1150 * V.s * DPR;
  const sh = 760, sw = sh * hw / hh;
  g.globalAlpha = 0.9; g.drawImage(under, hx, hy, hw, hh, (w - sw) / 2, 330, sw, sh); g.globalAlpha = 1;
  const gr = g.createLinearGradient(0, 300, 0, 1150); gr.addColorStop(0, '#0f0f11'); gr.addColorStop(0.25, 'rgba(15,15,17,.2)'); gr.addColorStop(0.8, 'rgba(15,15,17,.2)'); gr.addColorStop(1, '#0f0f11');
  g.fillStyle = gr; g.fillRect(0, 300, w, 860);
  g.fillStyle = '#d9141c'; g.fillRect(0, 0, w, 10);
  drawMark(g, 110, 120, 84);
  g.fillStyle = '#f3f1ec'; g.font = '700 40px "PingFang TC", sans-serif'; g.textBaseline = 'middle';
  g.fillText('紅分子 HJAEC', 176, 100);
  g.fillStyle = '#94918b'; g.font = '500 28px "PingFang TC", sans-serif'; g.fillText('水珠聚一顆 · 鍍膜撥水小遊戲', 176, 146);
  const gd = Core.grade(finalScore);
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(217,20,28,.8)'; g.shadowBlur = 50;
  g.font = '800 380px "Barlow Condensed", "Avenir Next Condensed", sans-serif'; g.fillText(gd, w / 2, 700);
  g.shadowBlur = 0;
  g.font = '800 64px "PingFang TC", sans-serif'; g.fillText(TITLES[gd][0], w / 2, 1000);
  g.fillStyle = '#cfccc6'; g.font = '500 36px "PingFang TC", sans-serif';
  g.fillText(`最大水珠佔 ${Math.round(Core.share(W) * 100)}%　踩拍合併 ${stats.perfect} 次`, w / 2, 1080);
  g.fillStyle = '#d9141c'; g.font = '700 34px "PingFang TC", sans-serif'; g.fillText('hjaec.com', w / 2, 1250);
  const url = c.toDataURL('image/png');
  $('#share-image').src = url; $('#download').href = url;
  show('#share-panel', true);
}

// ---------- 開始 ----------
addEventListener('resize', resize);
if (document.fonts) document.fonts.ready.then(resize);
resize(); updateBest();
requestAnimationFrame(frame);
window.__game = { get W() { return W; }, get state() { return state; }, get stats() { return stats; }, startGame, endGame, V, run };   // 測試用
})();
