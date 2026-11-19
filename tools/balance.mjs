// 성 지키기 밸런스 시뮬레이터 — core.js를 그대로 재사용해 봇이 수천 판을 돌린다.
//   node tools/balance.mjs baseline [N]           정책별 클리어율/도달 라운드
//   node tools/balance.mjs cards [N] [정책]        카드별 기여도 (그 카드를 우선 선택했을 때 평균 도달 라운드 변화)
//   node tools/balance.mjs sweep <키> <값,값,…> [N]  수치 스윕 (balance.*, growth, startGold, leash, bias, 또는 점 표기: enemies.boss.dmg, bosses.5.hp …)
//   node tools/balance.mjs hist [N]                정책별 종료 라운드 분포
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
if (process.env.OVR) deepAssign(BASE, JSON.parse(process.env.OVR)); // 환경변수 OVR='{"balance":{...}}' 로 기준값을 한꺼번에 덮어쓴다 (조합 실험용)

function runOne(task) {
  deepAssign(C.CFG, JSON.parse(JSON.stringify(BASE))); deepAssign(C.CFG, task.overrides || {}); // 기준값을 매번 복사해서 쓴다 (배열 덮어쓰기가 기준값을 오염시키지 않게)
  const P = task.policy, S = C.createGame(task.seed, process.env.MODE), rnd = C.mulberry32(task.seed * 7919 + 13);
  const ratio = P.ratio || { sword: 3, archer: 2, priest: 1 }; // 검사 비중이 높은 구성이 가장 좋았다 (시뮬레이션)
  let step = 0;
  const maxSteps = Math.ceil((C.PREP_TIME + (P.endless ? 90 : C.MAX_ROUND) * 120 + 120) / DT);
  let act2At = -1;
  while (!S.over && step < maxSteps) {
    if (S.round > C.MAX_ROUND && !P.endless) { S.win = true; break; } // 마왕 처치 = 50라운드 클리어 (이후는 무한 모드)
    if (S.cinematic) { C.endCinematic(S); act2At = S.round; if (P.stopAct2) break; continue; } // 2막 연출은 바로 넘긴다 (30라운드 보스를 처치한 것)
    if (S.jobs.offer) { // 보스 처치 후 전직: jobPrefer가 제시되면 그것을, 아니면 무작위
      const lst = S.jobs.offer.list, pref = P.jobPrefer ? lst.findIndex(o => o.id === P.jobPrefer) : -1;
      C.pickJob(S, pref >= 0 ? pref : Math.floor(rnd() * lst.length)); continue;
    }
    if (S.cOffer) { C.pickCastle(S, P.castlePick !== undefined ? Math.min(P.castlePick, S.cOffer.list.length - 1) : Math.floor(rnd() * S.cOffer.list.length)); continue; } // 성 갈래
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
      for (const t of order) { const r = C.buy(S, t); if (r.ok || r.reason === 'gold') break; if (r.reason === 'pop') { C.upgradeCastle(S); break; } }
      if (S.gold > C.castleCost(S) * 1.6) C.upgradeCastle(S); // 골드가 넉넉하면 성도 올린다
    }
    C.tick(S, DT); step++;
  }
  const bossAt = {}; for (const r of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) { const bi = C.bossInfo(S, r); if (bi) bossAt[r] = bi.id; }
  return { bossAt, round: S.round, win: S.win, act2: S.act === 2, kills: S.kills, t: S.t, taken: S.cards.taken, coreDmgBy: S.coreDmgBy };
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
const clearOf = r => r.win; // 50라운드 클리어
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function summarize(rs) {
  const sc = rs.map(score);
  return { n: rs.length, act2: rs.filter(r => r.act2).length / rs.length, clear: rs.filter(r => r.win).length / rs.length, mean: mean(sc), sd: sd(sc), p10: pct(sc, 0.1), p50: pct(sc, 0.5), p90: pct(sc, 0.9), early: rs.filter(r => r.round < 8).length / rs.length };
}
const fmt = s => `30R보스 처치 ${(s.act2 * 100).toFixed(0).padStart(3)}% · 50R 클리어 ${(s.clear * 100).toFixed(0).padStart(3)}% | 평균 ${s.mean.toFixed(1).padStart(5)} (±${(s.sd / Math.sqrt(s.n)).toFixed(1)}) | 하위10% ${String(s.p10).padStart(2)} · 중앙 ${String(s.p50).padStart(2)} · 상위10% ${String(s.p90).padStart(2)} | 8라운드 전 사망 ${(s.early * 100).toFixed(0)}%`;
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
    const rows = [['무작위 카드', {}]];
    if (W) rows.push(['smart 카드', { weights: W, reroll: 1.2 }]);
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
      const ov = {}; if (key.includes('.')) { let o = ov; const ks = key.split('.'); for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = {}; o[ks.at(-1)] = v; } else if (['startGold', 'leash'].includes(key)) ov[key] = v; else if (key === 'growth') ov.economy = { costGrowth: v }; else if (key === 'bias') ov.ai = { bias: v }; else ov.balance = { [key]: v };
      console.log((key + '=' + v).padEnd(18), fmt(summarize(await runPolicy(policy, n, ov))));
    }
  } else if (cmd === 'hist') { // 정책별 사망(종료) 라운드 분포 + 승리 수
    const n = +a1 || 100, W = loadWeights();
    for (const [label, policy] of [['무작위 카드', {}], ['smart 카드', { weights: W, reroll: 1.2 }]]) {
      const rs = await runPolicy(policy, n), h = {}; for (const r of rs) { const k = r.win ? '승' : r.round; h[k] = (h[k] || 0) + 1; }
      const keys = Object.keys(h).sort((x, y) => (x === '승' ? 99 : +x) - (y === '승' ? 99 : +y));
      console.log(label.padEnd(12), fmt(summarize(rs)));
      console.log('  종료 라운드 분포:', keys.map(k => `${k}:${h[k]}`).join('  '));
    }
  } else if (cmd === 'jobs') { // 전직별 기여도: 그 직업이 제시되면 항상 고를 때의 클리어율/평균 라운드 변화
    const n = +a1 || 60, W = loadWeights(), base = { weights: W, reroll: 1.2 };
    const b = summarize(await runPolicy(base, n)); console.log('기준(전직 무작위)', fmt(b));
    const ids = []; for (const t of C.UNIT_TYPES) { const j = C.CFG.jobs[t]; for (const d of j.t1) ids.push([t, d.id, d.name]); for (const k in j.t2) for (const d of j.t2[k]) ids.push([t, d.id, d.name]); }
    const out = [];
    for (const [t, id, name] of ids) { const s2 = summarize(await runPolicy({ ...base, jobPrefer: id }, n)); out.push({ t, id, name, d: s2.mean - b.mean, clear: s2.clear }); }
    out.sort((x, y) => y.d - x.d);
    console.log('\n전직별 (평균 라운드 변화 / 클리어율). 잡음은 ±1 안팎');
    for (const o of out) console.log(C.CFG.units[o.t].name.padEnd(4), o.name.padEnd(8), (o.d >= 0 ? '+' : '') + o.d.toFixed(1).padStart(5), '| 클리어', (o.clear * 100).toFixed(0).padStart(3) + '%');
  } else if (cmd === 'where') { // 죽은 구간별로 그 구간 보스가 누구였는지 집계
    const n = +a1 || 80, W = loadWeights(), rs = await runPolicy({ weights: W, reroll: 1.2 }, n);
    const zones = [[24, 29, 25], [34, 38, 35], [39, 43, 40], [44, 48, 45], [15, 23, 20]];
    for (const [lo, hi, br] of zones) {
      const dead = rs.filter(r => !r.win && r.round >= lo && r.round <= hi), by = {};
      for (const r of dead) { const id = r.bossAt[br]; by[id] = (by[id] || 0) + 1; }
      const all = {}; for (const r of rs) if (r.round >= br || r.win) { const id = r.bossAt[br]; all[id] = (all[id] || 0) + 1; }
      console.log(`${lo}~${hi}라운드 사망 ${dead.length}명 | ${br}라운드 보스별:`, Object.keys(all).map(k => `${k} ${by[k] || 0}/${all[k]}`).join('  '));
    }
  } else if (cmd === 'coredmg') { // 성이 어떤 공격에 얼마나 맞는지 (판당 평균)
    const n = +a1 || 60, W = loadWeights(), rs = await runPolicy({ weights: W, reroll: 1.2 }, n), tot = {};
    for (const r of rs) for (const k in r.coreDmgBy) tot[k] = (tot[k] || 0) + r.coreDmgBy[k];
    const all = Object.values(tot).reduce((x, y) => x + y, 0);
    console.log('smart', fmt(summarize(rs)));
    for (const [k, v] of Object.entries(tot).sort((x, y) => y[1] - x[1])) console.log(' ', k.padEnd(14), (v / n).toFixed(0).padStart(6), '판당 피해', (v / all * 100).toFixed(0).padStart(3) + '%');
  } else if (cmd === 'policy') { // node tools/balance.mjs policy '{"ratio":{...}}' [N] — smart 기본 정책에 JSON을 덮어써서 평가
    const n = +a2 || 60, W = loadWeights(), p = { weights: W, reroll: 1.2, ...JSON.parse(a1 || '{}') };
    console.log((a1 || '{}').slice(0, 60).padEnd(60), fmt(summarize(await runPolicy(p, n))));
  } else if (cmd === 'smart') {
    const n = +a1 || 60, W = loadWeights();
    console.log('smart', fmt(summarize(await runPolicy({ weights: W, reroll: 1.2 }, n))));
  } else if (cmd === 'endhist') { // 무한 모드에서 죽은 라운드 분포
    const n = +a1 || 60, W = loadWeights(), rs = await runPolicy({ weights: W, reroll: 1.2, endless: true }, n), h = {};
    for (const r of rs) if (r.round > 50) h[r.round] = (h[r.round] || 0) + 1;
    console.log('51라운드 이후 사망 라운드:', JSON.stringify(h), '/', rs.filter(r => r.round > 50).length, '명');
  } else if (cmd === 'endless') { // node tools/balance.mjs endless [N] — 무한 모드까지 진행: 라운드별 생존율 (50·55·60·65·70라운드를 넘긴 비율)
    const n = +a1 || 60, W = loadWeights(), rs = await runPolicy({ weights: W, reroll: 1.2, endless: true }, n);
    const row = [30, 50, 55, 60, 65, 70, 80].map(r => `R${r} 돌파 ${(rs.filter(x => x.round > r).length / rs.length * 100).toFixed(0)}%`);
    console.log('endless', row.join(' · '), '| 평균 도달', (rs.reduce((t, x) => t + x.round, 0) / rs.length).toFixed(1));
  } else console.log('사용법: baseline|cards|sweep|smart (파일 상단 주석 참고)');
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}초, 워커 ${Math.min(cpus().length - 1, 99)}개)`);
}

if (isMainThread) main().catch(e => { console.error(e); process.exit(1); });
