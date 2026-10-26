// 泡沫版物理（純邏輯，瀏覽器與 node 共用；改數值後跑 node tools/sim_foam.js）
// 引擎蓋切成 20 單位的格子，每格存泡沫厚度；按下＝噴一坨，拖曳＝把附近的泡沫抹勻（總量不變），拖太快會破洞。
(function (root) {
'use strict';
const Core = root.Core || require('./core.js');
const { HOOD, leftAt, rightAt, bottomAt } = Core;
const CELL = 20, GW = Math.ceil(HOOD.w / CELL), GH = Math.ceil(HOOD.h / CELL);
const CFG = {
  cover: 0.5,          // 厚度到這裡才算蓋住
  sprayR: 60,          // 噴一下的範圍
  perfect: 52, good: 34, miss: 18,   // 噴一下的泡沫量：踩拍／接近／沒踩到
  fever: 1.4,          // FEVER 時噴量倍數
  brushR: 85,          // 抹開的範圍
  vlim: 1150,          // 拖曳安全速度（單位/秒）
  stressUp: 10, stressDown: 2.5,
  tearKeep: 0.3,       // 破洞時泡沫只剩這麼多
  start: 3, startAmt: 120,   // 開局車上已經有幾坨
};

function create(seed) {
  const R = Core.rng(seed || 1);
  const f = new Float32Array(GW * GH), inside = new Uint8Array(GW * GH), jx = new Float32Array(GW * GH), jy = new Float32Array(GW * GH), js = new Float32Array(GW * GH);
  let n = 0;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL, k = j * GW + i;
    if (y > 8 && y < bottomAt(x) - 8 && x > leftAt(y) + 8 && x < rightAt(y) - 8) { inside[k] = 1; n++; }
    jx[k] = (R() - 0.5) * CELL * 0.7; jy[k] = (R() - 0.5) * CELL * 0.7; js[k] = 0.8 + R() * 0.45;
  }
  const F = { f, inside, n, jx, jy, js, stress: 0, speed: 0, lx: null, ly: null };
  for (let i = 0; i < CFG.start; i++) spray(F, 200 + R() * 600, 200 + R() * 700, CFG.startAmt);
  return F;
}

function each(F, x, y, r, fn) {
  const i0 = Math.max(0, Math.floor((x - r) / CELL)), i1 = Math.min(GW - 1, Math.floor((x + r) / CELL));
  const j0 = Math.max(0, Math.floor((y - r) / CELL)), j1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * GW + i; if (!F.inside[k]) continue;
    const d = Math.hypot((i + 0.5) * CELL - x, (j + 0.5) * CELL - y);
    if (d < r) fn(k, d);
  }
}

// 噴一坨：中間厚、外圍薄
function spray(F, x, y, amt, r = CFG.sprayR) {
  let sum = 0; const ks = [], ws = [];
  each(F, x, y, r, (k, d) => { const w = Math.exp(-(d / r) * (d / r) * 2.2); ks.push(k); ws.push(w); sum += w; });
  if (!sum) return 0;
  for (let i = 0; i < ks.length; i++) F.f[ks[i]] += amt * ws[i] / sum;
  return amt;
}

// 抹開：刷子範圍內往平均厚度靠（總量守恆）；回傳 'tear' 表示拉破了
function brush(F, x, y, dt) {
  if (F.lx == null) { F.lx = x; F.ly = y; return null; }
  const L = Math.hypot(x - F.lx, y - F.ly);
  F.lx = x; F.ly = y;
  const v = dt > 0 ? L / dt : 0;
  F.speed += (v - F.speed) * Math.min(1, dt * 14);
  const over = F.speed / CFG.vlim - 1;
  if (over > 0) F.stress += over * CFG.stressUp * dt; else F.stress = Math.max(0, F.stress - CFG.stressDown * dt);
  if (F.stress >= 1) { tear(F, x, y); F.stress = 0; return 'tear'; }
  const r = CFG.brushR, k = Math.min(0.85, L / r * 2.4 + 0.04);
  let sw = 0, swf = 0; const ks = [], ws = [];
  each(F, x, y, r, (c, d) => { const w = 1 - d / r; ks.push(c); ws.push(w); sw += w; swf += w * F.f[c]; });
  if (!sw) return null;
  const avg = swf / sw;
  for (let i = 0; i < ks.length; i++) F.f[ks[i]] += k * ws[i] * (avg - F.f[ks[i]]);
  return null;
}
function lift(F) { F.lx = F.ly = null; F.speed = 0; F.stress = 0; }

function tear(F, x, y) {
  each(F, x, y, CFG.brushR * 0.85, k => { F.f[k] *= CFG.tearKeep; });
}

function coverage(F) {
  let c = 0; for (let k = 0; k < F.f.length; k++) if (F.inside[k] && F.f[k] >= CFG.cover) c++;
  return c / F.n;
}
function total(F) { let s = 0; for (let k = 0; k < F.f.length; k++) s += F.f[k]; return s; }
// 最需要泡沫的地方（給機器人與示範用）：找一格附近最空的位置
function emptiest(F, R) {
  let best = null;
  for (let t = 0; t < 40; t++) {
    const i = Math.floor(R() * GW), j = Math.floor(R() * GH), k = j * GW + i;
    if (!F.inside[k]) continue;
    let s = 0; each(F, (i + 0.5) * CELL, (j + 0.5) * CELL, 70, c => { s += Math.min(F.f[c], CFG.cover); });
    if (!best || s < best.s) best = { s, x: (i + 0.5) * CELL, y: (j + 0.5) * CELL };
  }
  return best;
}

const GRADES = [['S', 0.92], ['A', 0.8], ['B', 0.65], ['C', 0.45], ['F', 0]];
function grade(c) { return GRADES.find(g => c >= g[1])[0]; }

const Foam = { CELL, GW, GH, CFG, create, spray, brush, lift, tear, coverage, total, emptiest, grade, each };
if (typeof module !== 'undefined') module.exports = Foam; else root.Foam = Foam;
})(this);
