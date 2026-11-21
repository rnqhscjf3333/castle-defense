// node tools/winrate.mjs [N] [OVR-json] — 봇(smart 가중치)이 100라운드까지 플레이했을 때 구간별 통과율
//   30R/50R/80R/100R 통과율 = 해당 라운드의 보스를 쓰러뜨리고 다음으로 넘어간(또는 100R는 클리어한) 비율
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const C = require('../core.js');
const DT = 1 / 30;
const BASE = JSON.parse(JSON.stringify(C.CFG));
function deepAssign(dst, src) { for (const k in src) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) deepAssign(dst[k] ??= {}, src[k]); else dst[k] = src[k]; } }
const W = existsSync(join(HERE, 'weights.json')) ? JSON.parse(readFileSync(join(HERE, 'weights.json'), 'utf8')) : {};
const wOf = c => Math.max(0.001, W[c.key] ?? W[c.id] ?? W.default ?? 1);
function runOne(task) {
  deepAssign(C.CFG, JSON.parse(JSON.stringify(BASE))); if (task.ovr) deepAssign(C.CFG, task.ovr);
  const S = C.createGame(task.seed), rnd = C.mulberry32(task.seed * 7919 + 13), ratio = { sword: 3, archer: 2, priest: 1 };
  let step = 0; const maxSteps = Math.ceil((C.PREP_TIME + 101 * 130) / DT);
  while (!S.over && step < maxSteps) {
    if (S.cinematic) { C.endCinematic(S); continue; }
    if (S.jobs.offer) { C.pickJob(S, Math.floor(rnd() * S.jobs.offer.list.length)); continue; }
    if (S.cOffer) { C.pickCastle(S, Math.floor(rnd() * S.cOffer.list.length)); continue; }
    if (S.cards.offer) {
      const offer = S.cards.offer, w = offer.map(wOf);
      if (S.cards.rerolls > 0 && Math.max(...w) < 1.2) { C.reroll(S); continue; }
      let r = rnd() * w.reduce((a, b) => a + b, 0), i = 0; while (i < offer.length - 1 && (r -= w[i]) > 0) i++; C.pickCard(S, i); continue;
    }
    if (step % 15 === 0) {
      const cnt = { sword: 0, archer: 0, priest: 0 }; for (const u of S.units) if (cnt[u.type] !== undefined) cnt[u.type]++;
      for (const t of Object.keys(ratio).sort((a, b) => cnt[a] / ratio[a] - cnt[b] / ratio[b])) { const r = C.buy(S, t); if (r.ok || r.reason === 'gold') break; if (r.reason === 'pop') { C.upgradeCastle(S); break; } }
      if (S.gold > C.castleCost(S) * 1.6) C.upgradeCastle(S);
    }
    C.tick(S, DT); step++;
  }
  return { round: S.round, win: !!S.win, over: !!S.over };
}
if (!isMainThread) parentPort.on('message', m => parentPort.postMessage({ id: m.id, result: runOne(m.task) }));
else {
  const n = +process.argv[2] || 40, ovr = process.argv[3] ? JSON.parse(process.argv[3]) : null, t0 = Date.now();
  const tasks = Array.from({ length: n }, (_, i) => ({ seed: 20000 + i, ovr }));
  const nw = Math.max(1, Math.min(cpus().length - 1, n)), workers = Array.from({ length: nw }, () => new Worker(fileURLToPath(import.meta.url))), res = new Array(n); let next = 0, done = 0;
  await new Promise(resolve => { for (const w of workers) { const feed = () => { if (next < n) { const id = next++; w.postMessage({ id, task: tasks[id] }); } }; w.on('message', m => { res[m.id] = m.result; if (++done === n) resolve(); else feed(); }); w.on('error', e => { console.error(e); process.exit(1); }); feed(); } });
  workers.forEach(w => w.terminate());
  const pass = R => res.filter(r => r.win || r.round > R).length / n; // 해당 라운드 보스를 넘긴 비율
  const f = x => (x * 100).toFixed(0).padStart(3) + '%';
  console.log(`N=${n} (${((Date.now() - t0) / 1000).toFixed(0)}초) | 30R ${f(pass(30))} | 50R ${f(pass(50))} | 80R ${f(pass(80))} | 100R 클리어 ${f(res.filter(r => r.win).length / n)}`);
  const h = {}; for (const r of res) { const k = r.win ? 'WIN' : Math.floor(r.round / 5) * 5; h[k] = (h[k] || 0) + 1; } console.log('종료 라운드 분포(5단위):', JSON.stringify(h));
}
