// 平衡測試：node tools/sim.js [局數]
// 機器人模擬玩家：抓離最大那顆最近的水珠，以安全速度的 pace 倍拖過去；每次拖之間停頓 react 秒
const Core = require('../js/core.js');
const N = +process.argv[2] || 40;

function play(seed, pace, react, mode) {
  const W = Core.makeLevel(seed), R = Core.rng(seed * 7 + 1);
  const dt = 1 / 60;
  let wait = 0.4, target = null, px = 0, py = 0, splits = 0;
  for (let t = 0; t < 20; t += dt) {
    if (!W.held) {
      wait -= dt;
      if (wait <= 0) {
        const B = Core.biggest(W.drops);
        let best = null;
        for (const d of W.drops) if (d !== B) {
          const k = Math.hypot(d.x - B.x, d.y - B.y) - d.r - B.r;
          if (!best || k < best.k) best = { d, k };
        }
        if (!best) break;
        // mode big：拖大的去吃小的；mode small：拖小的去撞大的
        const [g, to] = mode === 'big' ? [B, best.d] : [best.d, B];
        px = g.x; py = g.y; Core.grab(W, g, px, py); target = to;
      }
    } else {
      const d = W.held, sp = Core.vmax(d.r) * pace * (0.85 + R() * 0.3);
      const dx = target.x - px, dy = target.y - py, L = Math.hypot(dx, dy) || 1;
      const s = Math.min(L, sp * dt);
      px += dx / L * s; py += dy / L * s;
      Core.pointer(W, px, py);
      if (!W.drops.includes(target) || L < 2) { Core.release(W); wait = react; }
    }
    for (const e of Core.step(W, dt, R)) if (e.type === 'split') { splits++; wait = react; }
  }
  return { share: Core.share(W), splits, left: W.drops.length };
}

for (const [pace, react, mode, label] of [
  [0.8, 0.35, 'small', '穩穩拖小的去撞大的'],
  [0.8, 0.35, 'big', '穩穩拖大的去吃'],
  [1.3, 0.25, 'small', '有點急'],
  [2.0, 0.2, 'small', '亂甩'],
  [0.6, 0.6, 'small', '慢吞吞新手'],
]) {
  const rs = [];
  for (let s = 1; s <= N; s++) rs.push(play(s, pace, react, mode));
  const avg = rs.reduce((a, r) => a + r.share, 0) / N;
  const sp = rs.reduce((a, r) => a + r.splits, 0) / N;
  const g = {}; rs.forEach(r => { const k = Core.grade(r.share); g[k] = (g[k] || 0) + 1; });
  console.log(label.padEnd(12, '　'), '平均', (avg * 100).toFixed(1) + '%', '斷開', sp.toFixed(1), '評等', JSON.stringify(g));
}

// 掃地機：抓最大顆，用 speed 單位/秒在引擎蓋上來回掃（測「亂掃會不會一直斷」）
function sweep(seed, speed) {
  const W = Core.makeLevel(seed), R = Core.rng(seed), dt = 1 / 60;
  let splits = 0, ang = R() * 6.28, px = 0, py = 0, wait = 0;
  for (let t = 0; t < 20; t += dt) {
    if (!W.held) {
      if ((wait -= dt) > 0) { Core.step(W, dt, R); continue; }
      const B = Core.biggest(W.drops); px = B.x; py = B.y; Core.grab(W, B, px, py);
    }
    px += Math.cos(ang) * speed * dt; py += Math.sin(ang) * speed * dt;
    if (px < 80 || px > 920) { ang = Math.PI - ang; px = Math.max(80, Math.min(920, px)); }
    if (py < 80 || py > 1000) { ang = -ang; py = Math.max(80, Math.min(1000, py)); }
    Core.pointer(W, px, py);
    for (const e of Core.step(W, dt, R)) if (e.type === 'split') { splits++; wait = 0.25; }
  }
  return { share: Core.share(W), splits };
}
for (const sp of [300, 600, 1000, 1600]) {
  const rs = []; for (let s = 1; s <= N; s++) rs.push(sweep(s, sp));
  console.log(`來回掃 ${sp}/s`.padEnd(12, '　'), '平均', (rs.reduce((a, r) => a + r.share, 0) / N * 100).toFixed(1) + '%', '斷開', (rs.reduce((a, r) => a + r.splits, 0) / N).toFixed(1));
}
