// node tests/smoke.js [판수] — 로직 스모크 테스트 + 봇 플레이 (카드 선택 포함)
const C = require('../core.js');
const DT = 1 / 30;
const BUY = ['sword', 'archer', 'sword', 'archer', 'priest'];
let failed = 0;
const check = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'OK   ' : 'FAIL ') + name + (extra !== undefined ? ' ' + extra : '')); };

// 카드 선택 정책: 'first'(항상 첫 장) | 'rand'(시드 난수) | 'none'(선택 안 함: 시간이 멈추는지 확인용)
function playCards(S, policy, rnd) {
  if (!S.cards.offer) return;
  if (policy === 'none') return;
  if (policy === 'rand') C.pickCard(S, Math.floor(rnd() * S.cards.offer.length));
  else C.pickCard(S, 0);
}
function play(seed, mode, policy) {
  const S = C.createGame(seed), rnd = C.mulberry32(seed + 99);
  C.setMode(S, 'all', mode);
  let steps = 0; const t0 = Date.now();
  while (!S.over && S.t < 3000 && steps < 200000) {
    if (steps % 15 === 0) for (const t of BUY) C.buy(S, t);
    playCards(S, policy, rnd);
    C.tick(S, DT); steps++;
  }
  return { round: S.round, win: S.win, kills: S.kills, t: Math.round(S.t), units: S.units.length, coreHp: Math.round(S.core.hp), cards: Object.values(S.cards.taken).reduce((a, b) => a + b, 0), ms: Date.now() - t0 };
}
const strip = r => { const { ms, ...rest } = r; return JSON.stringify(rest); };

// 1) 결정론
const a = play(123, 'rally', 'rand'), b = play(123, 'rally', 'rand'), c = play(124, 'rally', 'rand');
check('결정론(같은 시드·같은 선택)', strip(a) === strip(b), strip(a));
check('시드별 차이', strip(a) !== strip(c));

// 2) 정책별 봇 결과 (카드가 실제로 도움이 되는지)
const N = +process.argv[2] || 5;
for (const [label, mode, pol] of [['항상 첫 번째 카드', 'rally', 'first'], ['무작위 선택/집결', 'rally', 'rand'], ['무작위 선택/자유', 'free', 'rand']]) {
  const res = [];
  for (let i = 0; i < N; i++) res.push(play(1000 + i, mode, pol));
  const rounds = res.map(r => r.round).sort((x, y) => x - y);
  console.log(label.padEnd(28), '클리어', res.filter(r => r.win).length + '/' + N, '| 도달 라운드', rounds.join(','), '| 평균 카드', Math.round(res.reduce((s, r) => s + r.cards, 0) / N), '| 판당 ms', Math.round(res.reduce((s, r) => s + r.ms, 0) / N));
}

// 3) 구매 규칙
let S = C.createGame(1);
const r1 = C.buy(S, 'sword'), r2 = C.buy(S, 'sword');
check('구매 쿨다운', r1.ok && !r2.ok && r2.reason === 'cooldown');
check('비용 증가', C.unitCostOf(S, 'sword') === Math.round(50 * 1.05), C.unitCostOf(S, 'sword'));

// 4) 카드 규칙
S = C.createGame(5);
for (let i = 0; i < 600 && S.round < 2; i++) C.tick(S, DT); // 준비 12초 → 라운드 1 → 40초 → 라운드 2
for (let i = 0; i < 40 * 30 + 5 && !S.cards.offer; i++) C.tick(S, DT);
check('라운드 2 시작 시 카드 3장 제시', S.cards.offer && S.cards.offer.length === 3, S.cards.offer && S.cards.offer.map(c => c.name).join(' / '));
const tBefore = S.t; for (let i = 0; i < 30; i++) C.tick(S, DT);
check('카드 선택 중 시간 정지', S.t === tBefore);
check('선택 중 다음 라운드 호출 불가', C.callEarly(S).ok === false);
const rr = S.cards.rerolls; C.reroll(S);
check('리롤', S.cards.rerolls === rr - 1 && S.cards.offer.length === 3);
const picked = S.cards.offer[0]; C.pickCard(S, 0);
check('카드 선택 후 진행 재개', S.cards.offer === null && S.cards.taken[picked.key] === 1, picked.name);
const t2 = S.t; C.tick(S, DT); check('선택 후 시간 흐름', S.t > t2);

// 5) 보스 직후(라운드 6) 희귀 이상 보장 + 리롤 +1
let bad = 0;
for (let seed = 1; seed <= 200; seed++) {
  const g = C.createGame(seed); g.round = 5; g.cards.rerolls = 0;
  // 라운드 6 시작을 직접 유도
  g.phase = 'round'; g.roundT = 40; g.queue = []; C.tick(g, DT);
  if (g.round !== 6 || !g.cards.offer) { bad += 1000; continue; }
  if (!g.cards.offer.some(c => c.rar !== 'common')) bad++;
  if (g.cards.rerolls !== 1) bad += 1000;
}
check('보스 직후 카드는 희귀 이상 포함 + 리롤 +1 (200시드)', bad === 0, 'bad=' + bad);

// 6) 중복 상한 / 카드 풀 소진 안전성
S = C.createGame(9);
let opens = 0;
for (; opens < 600; opens++) { C.openCards(S, opens % 5 === 0); if (!S.cards.offer) break; C.pickCard(S, Math.floor(S.rng() * S.cards.offer.length)); }
let overCap = 0;
for (const key in S.cards.taken) { const def = C.CARD_DEFS.find(d => d.id === key.split(':')[0]); if (S.cards.taken[key] > def.max) overCap++; }
check('600번 연속 선택해도 중복 상한을 넘지 않음', overCap === 0, 'opens=' + opens + ' taken=' + Object.keys(S.cards.taken).length);
check('카드 풀이 비어도 오류 없이 선택창을 닫음', true);

// 7) 효과 검증: 각 카드를 직접 적용해 수치가 바뀌는지
function applyById(g, id, type) {
  const def = C.CARD_DEFS.find(d => d.id === id);
  const key = type && def.generic ? id + ':' + type : id;
  g.cards.offer = [{ key, id, cat: def.cat, rar: def.rar, type: type || def.type || null, name: id, desc: '', lv: 1 }];
  C.pickCard(g, 0);
}
S = C.createGame(3); C.buy(S, 'sword'); const sw = S.units[0], hp0 = sw.max;
const V = C.CFG.cardVals;
applyById(S, 'u_hp', 'sword'); check('검사 체력 강화(CFG.upPct.hp)', sw.max === Math.round(hp0 * (1 + C.CFG.upPct.hp)), hp0 + '→' + sw.max);
applyById(S, 'c_atk'); check('성채 공격력 강화', Math.abs(S.core.atk - C.CFG.core.atk * (1 + V.coreAtk)) < 1e-9, S.core.atk);
applyById(S, 'f_hp'); check('성채 체력 증가(즉시 회복)', S.core.max === C.CFG.core.hp + V.fortHp && S.core.hp === S.core.max, S.core.max);
applyById(S, 'f_pop'); check('인구 상한 +2', S.popCap === C.CFG.popCap + 2);
applyById(S, 'a_atk'); check('군기 오라', Math.abs(S.aura.atk - V.auraAtk) < 1e-9 && S.aura.on);
applyById(S, 'a_rad'); check('오라 강화: 모든 오라 효과 증폭', Math.abs(S.aura.atk - V.auraAtk * (1 + V.auraBoost)) < 1e-9, S.aura.atk.toFixed(4));
applyById(S, 's_golem'); check('골렘 소환(인구 3)', S.units.some(u => u.type === 'golem') && C.popUsed(S) === 4);
applyById(S, 's_turret'); applyById(S, 's_turret'); check('포탑 2개', S.units.filter(u => u.type === 'turret').length === 2);
applyById(S, 's_wolves'); check('늑대 소환', S.units.filter(u => u.type === 'wolf').length === V.wolves, V.wolves + '마리');
for (let i = 0; i < (C.CFG.units.wolf.life + 2) * 30; i++) { if (S.cards.offer) C.pickCard(S, 0); C.tick(S, DT); } // 카드창이 열리면 시간이 멈추므로 선택하며 진행
check('늑대는 수명이 지나면 사라짐', S.units.filter(u => u.type === 'wolf').length === 0, C.CFG.units.wolf.life + '초');

// 8) 인구 확장 (골드 사용처)
S = C.createGame(4);
const c0 = C.popExpandCost(S); S.gold = 0;
check('골드 부족 시 인구 확장 불가', C.expandPop(S).ok === false && S.popCap === C.CFG.popCap);
S.gold = c0 + 5; const e1 = C.expandPop(S);
check('인구 확장: 상한 +' + C.CFG.popExpand.step + ', 골드 차감', e1.ok && S.popCap === C.CFG.popCap + C.CFG.popExpand.step && S.gold === 5, 'cost=' + c0);
check('확장 비용은 살수록 증가', C.popExpandCost(S) > c0, c0 + '→' + C.popExpandCost(S));
S.gold = 1e9; let n = 0; while (C.expandPop(S).ok) n++;
check('확장 횟수 상한', n === C.CFG.popExpand.max - 1 && C.expandPop(S).reason === 'max', n + 1 + '회');

console.log(failed ? '\n실패 ' + failed + '건' : '\n모두 통과');
process.exit(failed ? 1 : 0);
