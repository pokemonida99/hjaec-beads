// 水珠物理（純邏輯，瀏覽器與 node 共用；改數值後跑 node tools/sim.js）
(function (root) {
'use strict';

// 引擎蓋邏輯尺寸：寬 1000，上緣接擋風玻璃、下緣是車頭弧線
const HOOD = { w: 1000, h: 1100, cm: 0.12 };   // 1 單位 = 0.12 cm（顯示用）
const CFG = {
  count: 118,          // 開局水珠數
  mergeK: 0.92,        // 兩顆中心距 < (r1+r2)*mergeK 就合併
  follow: 16,          // 拖曳時水珠跟手的速度（越大越跟手）
  v0: 950, vr: 24, vp: 0.7,   // 安全速度 vmax(r) = v0 * (vr / r)^vp
  stressUp: 9, stressDown: 2.2,   // 超速累積「拉力」，滿 1 就斷
  friction: 7,         // 沒被拖的水珠滑行阻力
  splitCool: 0.45,     // 斷開後幾秒內碎片不會馬上黏回去
  mergeGrace: 0,       // 合併後幾秒不累積拉力（0：快速掃過密集水珠一樣會斷）
};

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; }; }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 引擎蓋邊界：左右兩側往車頭微微外擴，車頭是弧線
function leftAt(y) { return 70 - 40 * (y / HOOD.h); }
function rightAt(y) { return HOOD.w - leftAt(y); }
function bottomAt(x) { const u = (x - 500) / 500; return 1035 + 55 * (1 - u * u); }
function keepInside(d) {
  const m = 6;
  d.y = clamp(d.y, d.r + m + 4, bottomAt(d.x) - d.r - m);
  d.x = clamp(d.x, leftAt(d.y) + d.r + m, rightAt(d.y) - d.r - m);
}

let nextId = 1;
function makeDrop(x, y, r) {
  return { id: nextId++, x, y, r, vx: 0, vy: 0, stress: 0, cool: 0, grace: 0,
    w2: 0, w2v: 0, p2: 0, w3: 0, w3v: 0, p3: 0, age: 0 };
}

// 開局：大小不一的水珠，不重疊
function makeLevel(seed) {
  const R = rng(seed || 1), drops = [];
  const sizes = [];
  for (let i = 0; i < CFG.count; i++) {
    const k = R();
    sizes.push(k < 0.55 ? 7 + R() * 9 : k < 0.88 ? 16 + R() * 13 : 30 + R() * 15);
  }
  sizes.sort((a, b) => b - a);
  for (const r of sizes) {
    for (let tries = 0; tries < 400; tries++) {
      const y = r + 20 + R() * (HOOD.h - 2 * r - 60);
      const x = leftAt(y) + r + 12 + R() * (rightAt(y) - leftAt(y) - 2 * r - 24);
      if (y > bottomAt(x) - r - 12) continue;
      if (drops.every(o => Math.hypot(o.x - x, o.y - y) > o.r + r + 10)) {
        const d = makeDrop(x, y, r); d.p2 = R() * 6.28; d.p3 = R() * 6.28; drops.push(d); break;
      }
    }
  }
  return { drops, total: totalArea(drops), held: null, ox: 0, oy: 0, tx: 0, ty: 0, t: 0 };
}

const totalArea = drops => drops.reduce((s, d) => s + d.r * d.r, 0);
const biggest = drops => drops.reduce((m, d) => (!m || d.r > m.r ? d : m), null);
const vmax = r => CFG.v0 * Math.pow(CFG.vr / r, CFG.vp);

function hit(W, x, y, pad = 14) {
  let best = null;
  for (const d of W.drops) {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist < d.r + pad && (!best || dist - d.r < best.k)) best = { d, k: dist - d.r };
  }
  return best && best.d;
}

function grab(W, d, px, py) {
  W.held = d; W.ox = d.x - px; W.oy = d.y - py; W.tx = d.x; W.ty = d.y; d.stress = 0;
}
function release(W) { W.held = null; }
function pointer(W, px, py) { W.tx = px + W.ox; W.ty = py + W.oy; }

function kick(d, amt, rnd) {   // 合併／斷開時讓水珠晃一下
  d.w2v += amt * 9; d.p2 = rnd * 6.28; d.w3v += amt * 6; d.p3 = rnd * 3.1;
}

function merge(W, a, b, ev) {
  // a 吸收 b（a 是被拖的那顆，或比較大的那顆）
  const A = a.r * a.r, B = b.r * b.r, S = A + B;
  const held = W.held === a;
  const ox = a.x, oy = a.y;
  if (!held) { a.x = (a.x * A + b.x * B) / S; a.y = (a.y * A + b.y * B) / S; }
  else { a.x += (b.x - a.x) * B / S * 0.35; a.y += (b.y - a.y) * B / S * 0.35; W.ox += a.x - ox; W.oy += a.y - oy; }
  a.r = Math.sqrt(S); a.grace = CFG.mergeGrace;
  kick(a, Math.min(0.12, B / S * 0.5 + 0.03), (b.x * 7 + b.y) % 1);
  keepInside(a);
  ev.push({ type: 'merge', x: b.x, y: b.y, bx: b.x, by: b.y, br: b.r, to: a, r: a.r, held, gain: B });
}

function split(W, d, ev, R) {
  const sp = Math.hypot(d.vx, d.vy) || 1, ux = -d.vx / sp, uy = -d.vy / sp;   // 往拖曳的反方向散開
  const n = d.r > 110 ? 4 : d.r > 45 ? 3 : 2;
  const fr = n === 2 ? [0.6, 0.4] : n === 3 ? [0.46, 0.32, 0.22] : [0.4, 0.26, 0.2, 0.14];
  const A = d.r * d.r, pieces = [];
  let cx = d.x, cy = d.y;
  fr.forEach((f, i) => {
    const r = Math.sqrt(A * f);
    let p;
    if (i === 0) { d.r = r; p = d; }
    else {
      const prev = pieces[i - 1], side = (i % 2 ? 1 : -1) * 0.55;
      const dx = ux + -uy * side, dy = uy + ux * side, L = Math.hypot(dx, dy);
      cx = prev.x + dx / L * (prev.r + r + 10); cy = prev.y + dy / L * (prev.r + r + 10);
      p = makeDrop(cx, cy, r); W.drops.push(p);
      p.vx = dx / L * 160; p.vy = dy / L * 160;
    }
    p.cool = CFG.splitCool; p.stress = 0; kick(p, 0.14, R()); keepInside(p); pieces.push(p);
  });
  d.vx *= 0.2; d.vy *= 0.2;
  W.held = null;
  ev.push({ type: 'split', x: d.x, y: d.y, r: Math.sqrt(A), pieces });
}

// 推進一步；回傳事件
function step(W, dt, R) {
  R = R || Math.random;
  const ev = [];
  W.t += dt;
  const h = W.held;
  for (const d of W.drops) {
    d.age += dt; d.cool = Math.max(0, d.cool - dt); d.grace = Math.max(0, d.grace - dt);
    if (d === h) {
      const k = 1 - Math.exp(-CFG.follow * dt);
      const nx = d.x + (W.tx - d.x) * k, ny = d.y + (W.ty - d.y) * k;
      const px = d.x, py = d.y;
      d.x = nx; d.y = ny; keepInside(d);
      d.vx = (d.x - px) / dt; d.vy = (d.y - py) / dt;
      const over = Math.hypot(d.vx, d.vy) / vmax(d.r) - 1;
      if (over > 0 && d.grace <= 0) d.stress += over * CFG.stressUp * dt;
      else d.stress = Math.max(0, d.stress - CFG.stressDown * dt);
    } else {
      const f = Math.exp(-CFG.friction * dt);
      d.vx *= f; d.vy *= f; d.x += d.vx * dt; d.y += d.vy * dt; keepInside(d);
      d.stress = Math.max(0, d.stress - CFG.stressDown * dt);
    }
    // 晃動：彈簧＋阻尼
    d.w2v += (-170 * d.w2 - 7 * d.w2v) * dt; d.w2 += d.w2v * dt;
    d.w3v += (-260 * d.w3 - 9 * d.w3v) * dt; d.w3 += d.w3v * dt;
  }
  if (h && h.stress >= 1) split(W, h, ev, R);

  // 合併（被拖的那顆優先吃別人）
  const ds = W.drops;
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (let i = 0; i < ds.length; i++) {
      const a = ds[i]; if (!a) continue;
      for (let j = i + 1; j < ds.length; j++) {
        const b = ds[j]; if (!b) continue;
        if (a.cool > 0 && b.cool > 0) continue;
        const dx = a.x - b.x, dy = a.y - b.y, lim = (a.r + b.r) * CFG.mergeK;
        if (dx * dx + dy * dy > lim * lim) continue;
        let big = a, small = b;
        if (W.held === b || (W.held !== a && b.r > a.r)) { big = b; small = a; }
        merge(W, big, small, ev);
        ds[ds.indexOf(small)] = null; any = true;
        if (small === a) break;
      }
    }
    W.drops = ds.filter(Boolean);
    if (!any) break;
    ds.length = 0; ds.push(...W.drops);
  }
  return ev;
}

function share(W) { const b = biggest(W.drops); return b ? b.r * b.r / W.total : 0; }

function addDrop(W, x, y, r) { const d = makeDrop(x, y, r); keepInside(d); W.drops.push(d); W.total += r * r; kick(d, 0.1, Math.random()); return d; }

const GRADES = [['S', 0.8], ['A', 0.6], ['B', 0.4], ['C', 0.22], ['F', 0]];
function grade(score) { return GRADES.find(g => score >= g[1])[0]; }

const Core = { HOOD, CFG, rng, leftAt, rightAt, bottomAt, makeLevel, step, hit, grab, release, pointer,
  share, biggest, vmax, addDrop, totalArea, grade, GRADES, keepInside };
if (typeof module !== 'undefined') module.exports = Core; else root.Core = Core;
})(this);
