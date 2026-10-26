// 泡沫版平衡：node tools/sim_foam.js [局數]
// 機器人：每 every 拍在最空的地方噴一下（踩拍機率 hit），其餘時間以 speed 單位/秒繞圈抹開
const Core = require('../js/core.js');
const Foam = require('../js/foam.js');
const N = +process.argv[2] || 30, SPB = 0.5;

function play(seed, hit, speed, every, spread) {
  const F = Foam.create(seed), R = Core.rng(seed * 13 + 5), dt = 1 / 60;
  let combo = 0, fever = false, tears = 0, cx = 500, cy = 500, ang = 0, rad = 20;
  for (let b = 0; b < 40; b++) {
    if (b % every === 0) {
      const tgt = Foam.emptiest(F, R); cx = tgt.x; cy = tgt.y; ang = R() * 6.28; rad = 15;
      Foam.lift(F);
      const r = R(), q = r < hit ? 'perfect' : r < hit + (1 - hit) * 0.5 ? 'good' : 'miss';
      combo = q === 'perfect' ? combo + 1 : 0; fever = combo >= 4;
      Foam.spray(F, cx, cy, Foam.CFG[q] * (fever ? Foam.CFG.fever : 1));
    }
    for (let t = 0; t < SPB; t += dt) {
      if (!spread) continue;
      ang += speed * dt / Math.max(rad, 30); rad = Math.min(130, rad + 60 * dt);
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
      if (Foam.brush(F, x, y, dt) === 'tear') tears++;
    }
  }
  return { cov: Foam.coverage(F), tears };
}

for (const [hit, speed, every, spread, label] of [
  [0.9, 700, 1, true, '高手：每拍都踩、穩穩抹'],
  [0.6, 700, 1, true, '普通：六成踩拍'],
  [0.3, 600, 1, true, '亂按：三成踩拍'],
  [0.9, 700, 2, true, '隔拍噴、中間抹'],
  [0.9, 0, 1, false, '只噴不抹'],
  [0.6, 1600, 1, true, '抹太快'],
  [0.6, 2200, 1, true, '亂甩'],
]) {
  const rs = []; for (let s = 1; s <= N; s++) rs.push(play(s, hit, speed, every, spread));
  const g = {}; rs.forEach(r => { const k = Foam.grade(r.cov); g[k] = (g[k] || 0) + 1; });
  console.log(label.padEnd(14, '　'), '覆蓋', (rs.reduce((a, r) => a + r.cov, 0) / N * 100).toFixed(1) + '%', '破洞', (rs.reduce((a, r) => a + r.tears, 0) / N).toFixed(1), JSON.stringify(g));
}
