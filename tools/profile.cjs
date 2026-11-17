// node --cpu-prof --cpu-prof-dir=tools/out/prof tools/profile.cjs [라운드] — 후반 상태의 틱 비용 측정 (규칙 코드만, 렌더링 제외)
const C = require('../core.js'); const DT = 1 / 30;
const startRound = +process.argv[2] || 45, secs = +process.argv[3] || 60;
const S = C.createGame(7); S.gold = 1e9; S.core.hp = S.core.max = 1e9;
// 카드/전직을 무작위로 골라 유닛과 강화가 쌓인 후반 상태를 만든다
const rnd = C.mulberry32(3);
C.jumpToRound(S, startRound); S.act = startRound > 30 ? 2 : 1;
const types = ['sword', 'archer', 'priest', 'sword', 'archer'];
let n = 0; const t0 = process.hrtime.bigint(); let ticks = 0, enemyMax = 0, shotMax = 0, unitMax = 0; const sample = [];
for (let i = 0; i < secs * 30; i++) {
  if (S.cinematic) C.endCinematic(S);
  if (S.jobs.offer) { C.pickJob(S, 0); continue; }
  if (S.cards.offer) { C.pickCard(S, Math.floor(rnd() * S.cards.offer.length)); continue; }
  if (i % 10 === 0 && S.units.length < 60) { const t = types[n++ % types.length]; S.buyCd[t] = 0; C.buy(S, t); }
  const a = process.hrtime.bigint(); C.tick(S, DT); const b = process.hrtime.bigint(); ticks++;
  if (i % 30 === 0) sample.push(Number(b - a) / 1e6);
  enemyMax = Math.max(enemyMax, S.enemies.length); shotMax = Math.max(shotMax, S.shots.length); unitMax = Math.max(unitMax, S.units.length);
  C.drainEvents(S);
}
const total = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`라운드 ${startRound}~${S.round}, 틱 ${ticks}개: 평균 ${(total / ticks).toFixed(2)}ms/틱 | 최대 적 ${enemyMax}, 아군 ${unitMax}, 투사체 ${shotMax}`);
console.log('초당 첫 틱 비용(ms) 샘플:', sample.slice(-12).map(x => x.toFixed(1)).join(' '));
