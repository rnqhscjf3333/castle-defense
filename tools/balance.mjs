// 성채방어 밸런스 시뮬레이터 — core.js를 그대로 재사용해 봇이 수천 판을 돌린다.
//   node tools/balance.mjs baseline [N]           정책별 클리어율/도달 라운드
//   node tools/balance.mjs cards [N] [정책]        카드별 기여도 (그 카드를 우선 선택했을 때 평균 도달 라운드 변화)
//   node tools/balance.mjs sweep <키> <값,값,…> [N]  수치(balance.*, popCap, startGold, leash, bias) 스윕
//   node tools/balance.mjs smart [N]               저장된 가중치(tools/weights.json)로 smart 정책 평가
// 같은 시드를 모든 조건에 공통으로 써서 비교 잡음을 줄인다. 결과 지표: 도달 라운드(클리어=31).
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const C = require('../core.js');
const DT = 1 / 30;

// ───────────── 한 판 실행 (워커) ─────────────
const BASE = JSON.parse(JSON.stringify(C.CFG));
function deepAssign(dst, src) { for (const k in src) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) deepAssign(dst[k] ??= {}, src[k]); else dst[k] = src[k]; } }

function runOne(task) {
  deepAssign(C.CFG, BASE); deepAssign(C.CFG, task.overrides || {});
  const P = task.policy, S = C.createGame(task.seed), rnd = C.mulberry32(task.seed * 7919 + 13);
  const ratio = P.ratio || { sword: 2, archer: 2, priest: 1 };
  let step = 0;
  const maxSteps = Math.ceil((C.PREP_TIME + C.MAX_ROUND * C.ROUND_TIME + 120) / DT);
  while (!S.over && step < maxSteps) {
    if (S.cards.offer) {
      const offer = S.cards.offer, w = offer.map(c => weightOf(P, c));
      if (P.reroll && S.cards.rerolls > 0 && Math.max(...w) < P.reroll) { C.reroll(S); continue; }
      let tot = w.reduce((a, b) => a + b, 0), r = rnd() * tot, i = 0;
      while (i < offer.length - 1 && (r -= w[i]) > 0) i++;
      C.pickCard(S, i);
    }
    if (step % 15 === 0) {
      const cnt = { sword: 0, archer: 0, priest: 0 };
      for (const u of S.units) if (cnt[u.type] !== undefined) cnt[u.type]++;
      const order = Object.keys(ratio).sort((a, b) => cnt[a] / ratio[a] - cnt[b] / ratio[b]);
      for (const t of order) { const r = C.buy(S, t); if (r.ok || r.reason === 'gold' || r.reason === 'pop') break; }
      if (P.expand !== false && C.popUsed(S) >= S.popCap - 2) C.expandPop(S);
      if (P.early !== false && S.phase === 'round' && S.queue.length === 0 && S.enemies.length === 0 && S.round < C.MAX_ROUND) C.callEarly(S);
    }
    C.tick(S, DT); step++;
  }
  return { round: S.round, win: S.win, kills: S.kills, t: S.t, taken: S.cards.taken };
}
function weightOf(P, c) {
  const W = P.weights || {};
  let w = W[c.key] ?? W[c.id] ?? W.default ?? 1;
  if (P.prefer && (c.key === P.prefer || c.id === P.prefer)) w = 60;
  if (P.avoid && (c.key === P.avoid || c.id === P.avoid)) w = 0.001;
  return Math.max(0.001, w);
}

if (!isMainThread) parentPort.on('message', m => parentPort.postMessage({ id: m.id, result: runOne(m.task) }));

// ───────────── 병렬 실행 풀 (메인) ─────────────
async function pool(tasks) {
  const n = Math.max(1, Math.min(cpus().length - 1, tasks.length));
  const workers = Array.from({ length: n }, () => new Worker(fileURLToPath(import.meta.url)));
  const results = new Array(tasks.length); let next = 0, done = 0;
  await new Promise(resolve => {
    for (const w of workers) {
      const feed = () => { if (next < tasks.length) { const id = next++; w.postMessage({ id, task: tasks[id] }); } };
      w.on('message', m => { results[m.id] = m.result; done++; if (done === tasks.length) resolve(); else feed(); });
      w.on('error', e => { console.error(e); process.exit(1); });
      feed();
    }
  });
  workers.forEach(w => w.terminate());
  return results;
}

const score = r => (r.win ? C.MAX_ROUND + 1 : r.round);
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function summarize(rs) {
  const sc = rs.map(score);
  return { n: rs.length, clear: rs.filter(r => r.win).length / rs.length, mean: mean(sc), sd: sd(sc), p10: pct(sc, 0.1), p50: pct(sc, 0.5), p90: pct(sc, 0.9), early: rs.filter(r => r.round < 8).length / rs.length };
}
const fmt = s => `클리어 ${(s.clear * 100).toFixed(0).padStart(3)}% | 평균 ${s.mean.toFixed(1).padStart(5)} (±${(s.sd / Math.sqrt(s.n)).toFixed(1)}) | 하위10% ${String(s.p10).padStart(2)} · 중앙 ${String(s.p50).padStart(2)} · 상위10% ${String(s.p90).padStart(2)} | 8라운드 전 사망 ${(s.early * 100).toFixed(0)}%`;
const seeds = n => Array.from({ length: n }, (_, i) => 10000 + i);
const runPolicy = (policy, n, overrides) => pool(seeds(n).map(seed => ({ seed, policy, overrides })));
const loadWeights = () => { const f = join(HERE, 'weights.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };

// 모든 카드 그룹 키 (유닛 강화는 종류별로 구분)
function cardKeys() {
  const keys = [];
  for (const d of C.CARD_DEFS) { if (d.generic) for (const t of C.UNIT_TYPES) keys.push(d.id + ':' + t); else keys.push(d.id); }
  return keys;
}
const nameOf = key => { const [id, t] = key.split(':'); const d = C.CARD_DEFS.find(x => x.id === id); const TN = { sword: '검사', archer: '궁수', priest: '사제' }; return d.generic ? `${TN[t]}·${({ hp: '체력', atk: '공격력', rate: '공속', speed: '이속' })[d.generic]}` : d.name; };

async function main() {
  const [cmd, a1, a2, a3, a4] = process.argv.slice(2);
  const t0 = Date.now();
  if (cmd === 'baseline') {
    const n = +a1 || 60, W = loadWeights();
    const rows = [['무작위 카드', {}], ['무작위 카드 · 인구확장 안 함', { expand: false }], ['무작위 카드 · 다음 라운드 호출 안 함', { early: false }]];
    if (W) rows.push(['smart 카드', { weights: W, reroll: 1.2 }], ['smart 카드 · 인구확장 안 함', { weights: W, reroll: 1.2, expand: false }]);
    for (const [label, policy] of rows) console.log(label.padEnd(22), fmt(summarize(await runPolicy(policy, n))));
  } else if (cmd === 'cards') {
    const n = +a1 || 60, W = a2 === 'smart' ? loadWeights() : null;
    const base = { weights: W || undefined, reroll: W ? 1.2 : undefined };
    const b = summarize(await runPolicy(base, n));
    console.log(`기준(${W ? 'smart' : '무작위'} 정책)`.padEnd(14), fmt(b));
    const keys = cardKeys(), out = [];
    for (const key of keys) { const s = summarize(await runPolicy({ ...base, prefer: key }, n)); out.push({ key, name: nameOf(key), d: s.mean - b.mean, clear: s.clear, mean: s.mean }); }
    out.sort((x, y) => y.d - x.d);
    const se = b.sd / Math.sqrt(n) * Math.SQRT2;
    console.log(`\n카드를 보이면 항상 고를 때의 평균 도달 라운드 변화 (잡음 ±${se.toFixed(1)} 이내는 차이 없음으로 볼 것)`);
    for (const o of out) console.log(o.key.padEnd(16), o.name.padEnd(14), (o.d >= 0 ? '+' : '') + o.d.toFixed(1).padStart(5), '라운드 | 클리어', (o.clear * 100).toFixed(0).padStart(3) + '%', '|', '█'.repeat(Math.max(0, Math.round(o.d * 2))));
    mkdirSync(join(HERE, 'out'), { recursive: true });
    writeFileSync(join(HERE, 'out', 'cards.json'), JSON.stringify({ base: b, rows: out }, null, 1));
    // 가중치 저장: 효과가 클수록 높게 (smart 정책용)
    if (a3 === 'save') {
      const w = { default: 1 };
      for (const o of out) w[o.key] = Math.max(0.15, Math.min(8, 1 + o.d / 1.2));
      writeFileSync(join(HERE, 'weights.json'), JSON.stringify(w, null, 1)); console.log('\ntools/weights.json 저장');
    }
  } else if (cmd === 'sweep') {
    const key = a1, vals = (a2 || '').split(',').map(Number), n = +a3 || 40, W = loadWeights();
    const policy = W ? { weights: W, reroll: 1.2 } : {};
    for (const v of vals) {
      const ov = {}; if (['popCap', 'startGold', 'leash'].includes(key)) ov[key] = v; else if (key === 'bias') ov.ai = { bias: v }; else ov.balance = { [key]: v };
      console.log((key + '=' + v).padEnd(18), fmt(summarize(await runPolicy(policy, n, ov))));
    }
  } else if (cmd === 'smart') {
    const n = +a1 || 60, W = loadWeights();
    console.log('smart', fmt(summarize(await runPolicy({ weights: W, reroll: 1.2 }, n))));
  } else console.log('사용법: baseline|cards|sweep|smart (파일 상단 주석 참고)');
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}초, 워커 ${Math.min(cpus().length - 1, 99)}개)`);
}

if (isMainThread) main().catch(e => { console.error(e); process.exit(1); });
