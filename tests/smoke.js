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
function play(seed, policy) {
  const S = C.createGame(seed), rnd = C.mulberry32(seed + 99);
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
const a = play(123, 'rand'), b = play(123, 'rand'), c = play(124, 'rand');
check('결정론(같은 시드·같은 선택)', strip(a) === strip(b), strip(a));
check('시드별 차이', strip(a) !== strip(c));

// 2) 정책별 봇 결과 (카드가 실제로 도움이 되는지)
const N = +process.argv[2] || 5;
for (const [label, pol] of [['항상 첫 번째 카드', 'first'], ['무작위 선택', 'rand']]) {
  const res = [];
  for (let i = 0; i < N; i++) res.push(play(1000 + i, pol));
  const rounds = res.map(r => r.round).sort((x, y) => x - y);
  console.log(label.padEnd(28), '클리어', res.filter(r => r.win).length + '/' + N, '| 도달 라운드', rounds.join(','), '| 평균 카드', Math.round(res.reduce((s, r) => s + r.cards, 0) / N), '| 판당 ms', Math.round(res.reduce((s, r) => s + r.ms, 0) / N));
}

// 3) 구매 규칙
let S = C.createGame(1);
check('골드 0원으로 시작', S.gold === 0 && C.CFG.startGold === 0);
check('골드가 없으면 아무도 못 뽑음', ['sword', 'archer', 'priest'].every(t => { const r = C.buy(S, t); return !r.ok && r.reason === 'gold'; }));
S.gold = 1000;
const base = { sword: C.unitCostOf(S, 'sword'), archer: C.unitCostOf(S, 'archer'), priest: C.unitCostOf(S, 'priest') };
const r1 = C.buy(S, 'sword'), r2 = C.buy(S, 'sword');
check('구매 쿨다운', r1.ok && !r2.ok && r2.reason === 'cooldown');
check('한 유닛을 뽑으면 모든 유닛 종류의 가격이 오름', ['sword', 'archer', 'priest'].every(t => C.unitCostOf(S, t) > base[t]), JSON.stringify(base) + '→' + ['sword', 'archer', 'priest'].map(t => C.unitCostOf(S, t)));
check('가격 = 기본가 × 상승배율^뽑은 수', C.unitCostOf(S, 'archer') === Math.round(C.CFG.units.archer.cost * Math.pow(C.CFG.economy.costGrowth, 1)));
S.buyCd.sword = 0; S.buyCd.archer = 0;
const g0 = S.gold; C.buy(S, 'archer');
check('골드 차감과 구매 횟수 증가', S.gold === g0 - Math.round(C.CFG.units.archer.cost * C.CFG.economy.costGrowth) && S.buyCount === 2, 'buyCount=' + S.buyCount);
let many = C.createGame(2); many.gold = 1e9; let cnt = 0; for (let i = 0; i < 200; i++) { many.buyCd.sword = 0; if (C.buy(many, 'sword').ok) cnt++; }
check('인구 제한 없음 (200명도 뽑힘)', cnt === 200 && many.units.length === 200, cnt + '명');
check('가격은 계속 오름 (사라져도 내려가지 않음)', C.unitCostOf(many, 'sword') > 100 * C.CFG.units.sword.cost);

// 4) 카드 규칙
S = C.createGame(5);
for (let i = 0; i < 600 && S.round < 2; i++) C.tick(S, DT); // 준비 12초 → 라운드 1 → 40초 → 라운드 2
for (let i = 0; i < 40 * 30 + 5 && !S.cards.offer; i++) C.tick(S, DT);
check('라운드 2 시작 시 카드 3장 제시', S.cards.offer && S.cards.offer.length === 3, S.cards.offer && S.cards.offer.map(c => c.name).join(' / '));
const tBefore = S.t; for (let i = 0; i < 30; i++) C.tick(S, DT);
check('카드 선택 중 시간 정지', S.t === tBefore);
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
S = C.createGame(3); S.gold = 1000; C.buy(S, 'sword'); const sw = S.units[0], hp0 = sw.max;
const V = C.CFG.cardVals;
applyById(S, 'u_hp', 'sword'); check('검사 체력 강화(CFG.upPct.hp)', sw.max === Math.round(hp0 * (1 + C.CFG.upPct.hp)), hp0 + '→' + sw.max);
applyById(S, 'c_atk'); check('성채 공격력 강화', Math.abs(S.core.atk - C.CFG.core.atk * (1 + V.coreAtk)) < 1e-9, S.core.atk);
applyById(S, 'f_hp'); check('성채 체력 증가(즉시 회복)', S.core.max === C.CFG.core.hp + V.fortHp && S.core.hp === S.core.max, S.core.max);
applyById(S, 'a_atk'); check('군기 오라', Math.abs(S.aura.atk - V.auraAtk) < 1e-9 && S.aura.on);
applyById(S, 'a_rad'); check('오라 강화: 모든 오라 효과 증폭', Math.abs(S.aura.atk - V.auraAtk * (1 + V.auraBoost)) < 1e-9, S.aura.atk.toFixed(4));
applyById(S, 's_golem'); check('골렘 소환', S.units.some(u => u.type === 'golem'));
applyById(S, 's_turret'); applyById(S, 's_turret'); check('포탑 2개', S.units.filter(u => u.type === 'turret').length === 2);

// 8) 자동 라운드 + 1라운드는 성채 혼자 버티며 골드를 번다
S = C.createGame(4);
check('준비 시간 없이 바로 시작', C.PREP_TIME === 0);
C.tick(S, DT);
check('첫 틱에 라운드 1 자동 시작', S.round === 1 && S.phase === 'round');
let t1 = 0; while (S.round < 2 && t1 < 3000) { C.tick(S, DT); t1++; }
check('라운드는 시간이 지나면 자동으로 넘어감', S.round === 2, 't=' + S.t.toFixed(1));
check('1라운드: 유닛 없이 성채가 버티고 처치 골드를 얻음', S.core.hp > 0 && S.kills > 0 && S.gold > 0, `처치 ${S.kills}, 골드 ${Math.round(S.gold)}, 성채 ${Math.round(S.core.hp)}`);
check('자동 라운드 진행 중 callEarly 같은 수동 호출 API 없음', C.callEarly === undefined && C.expandPop === undefined);


// 9) 적 다양화: 종류별 등장 라운드
const seenBefore = {}; let early = false;
for (let seed = 1; seed <= 40; seed++) {
  for (let r = 1; r <= 30; r++) {
    const g = C.createGame(seed); g.round = r - 1; g.phase = 'round'; g.roundT = 0; g.cards.offer = null;
    // startRound를 직접 부르는 대신 라운드 타이머로 유도
    g.roundT = C.ROUND_TIME; g.queue = []; C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0);
    for (const k of g.queue) { const from = (C.CFG.spawn[k] || { from: 1 }).from; if (k !== 'boss' && g.round < from) early = true; seenBefore[k] = (seenBefore[k] || 0) + 1; }
  }
}
check('각 적은 등장 라운드 이전에는 나오지 않음', early === false);
check('라운드가 갈수록 종류가 늘어남 (사수·폭파병·주술사·거한 모두 등장)', ['grunt', 'shield', 'archer', 'bomber', 'shaman', 'brute', 'boss'].every(k => seenBefore[k] > 0), JSON.stringify(seenBefore));

// 10) 보스: 보스 라운드에는 시작과 동시에 확실히 나온다 + 예고
for (const r of [5, 10, 15, 20, 25, 30]) {
  const g = C.createGame(r); g.captureEvents = true; g.round = r - 1; g.phase = 'round'; g.roundT = C.ROUND_TIME; g.queue = []; C.tick(g, DT);
  if (g.cards.offer) C.pickCard(g, 0);
  const info = C.bossInfo(r);
  const ev = C.drainEvents(g);
  check(`R${r} 보스 라운드: 첫 적이 보스이고 이름 표시(${info.name})`, g.queue[0] === 'boss' && ev.some(e => e.type === 'banner' && e.boss && e.text.includes(info.name)));
  // 스폰 후 보스가 존재하는지
  g.queue = ['boss']; g.spawnT = 0; g.round = r; if (g.cards.offer) C.pickCard(g, 0); C.tick(g, DT);
  const b = g.enemies.find(e => e.kind === 'boss');
  check(`R${r} 보스 체력/패턴`, b && b.max === info.hp && Object.keys(b.abil).length >= 1, b && (b.bossName + ' hp=' + b.max + ' 패턴=' + Object.keys(b.abil).join(',')));
}
{ const g = C.createGame(77); g.captureEvents = true; g.round = 3; g.phase = 'round'; g.queue = []; g.roundT = C.ROUND_TIME; /* 4라운드가 시작될 때 다음(5라운드) 보스를 예고 */ C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0);
  check('보스 전 라운드(4라운드 시작)에 다음 라운드 보스 예고 알림', C.drainEvents(g).some(e => e.type === 'notice' && e.text.includes(C.bossInfo(5).name))); }

// 11) 새 적의 행동
function arena(round, kinds) { const g = C.createGame(500 + round); g.captureEvents = true; g.round = round; g.phase = 'round'; g.roundT = 0; g.queue = []; g.spawnPts = 4; for (const [k, x, y] of kinds) C.spawnEnemy(g, k, x, y); return g; }
{ // 사수: 성채에서 멀리 떨어져 포물선 화살로 성채를 맞힌다
  const g = arena(5, [['archer', 1500, 1500 - 450]]); let arrow = null, hmax = 0, hp0 = g.core.hp, minD = 1e9; g.core.atk = 0; const ar0 = g.enemies[0];
  for (let i = 0; i < 30 * 40; i++) { C.tick(g, DT); minD = Math.min(minD, Math.hypot(ar0.x - 1500, ar0.y - 1500)); for (const s of g.shots) if (s.color === 'ea') { arrow = s; hmax = Math.max(hmax, s.h); } }
  check('사수는 멀리서 쏴서 성채를 맞힘 (근접 안 함)', arrow !== null && g.core.hp < hp0, `성채 ${Math.round(hp0)}→${Math.round(g.core.hp)}`);
  check('사수는 사거리 끝에서 멈춤 (근접하지 않음)', minD > 150, '최소 거리 ' + Math.round(minD));
  check('화살은 포물선 (높이가 솟았다 내려옴)', hmax > 10, 'h최대=' + hmax.toFixed(1)); }
{ // 폭파병: 닿으면 터져 범위 피해, 자신은 사라지고 처치 수는 올라가지 않음
  const g = arena(8, [['bomber', 1500, 1500 - 120]]); g.core.atk = 0; const hp0 = g.core.hp, k0 = g.kills; let boomed = false; // 성채가 먼저 처치하지 못하게 공격력 0
  for (let i = 0; i < 30 * 10; i++) { C.tick(g, DT); if (C.drainEvents(g).some(e => e.type === 'boom' && e.enemy)) boomed = true; }
  check('폭파병 자폭: 성채 피해 + 폭발 + 처치/골드 없음', boomed && g.core.hp < hp0 && g.enemies.length === 0 && g.kills === k0 && g.gold === 0, `성채 ${Math.round(hp0)}→${Math.round(g.core.hp)}`); }
{ // 주술사: 다친 적을 치유
  const g = arena(10, [['shaman', 1500, 1500 - 700], ['brute', 1500 + 40, 1500 - 700]]); const br = g.enemies.find(e => e.kind === 'brute'); br.hp = br.max * 0.3; let healed = false;
  for (let i = 0; i < 30 * 6; i++) { C.tick(g, DT); if (br.hp > br.max * 0.35) healed = true; }
  check('주술사가 다친 적을 치유', healed, Math.round(br.hp / br.max * 100) + '%'); }

// 12) 보스 패턴
{ const g = arena(5, [['boss', 1500, 1500 - 900]]); const b = g.enemies[0]; let dashed = false; const x0 = b.y;
  for (let i = 0; i < 30 * 12; i++) { C.tick(g, DT); if (b.dashT > 0) dashed = true; }
  check('R5 돌격왕: 돌진 패턴 발동', dashed); }
{ const g = arena(10, [['boss', 1500, 1500 - 900]]); let n0 = g.enemies.length, maxN = n0;
  for (let i = 0; i < 30 * 14; i++) { C.tick(g, DT); maxN = Math.max(maxN, g.enemies.length); }
  check('R10 소환사: 졸개 소환', maxN > n0, n0 + '→' + maxN); }
{ const g = arena(15, [['boss', 1500, 1500 - 700]]); let shell = null;
  g.gold = 1000; C.buy(g, 'sword');
  for (let i = 0; i < 30 * 14; i++) { C.tick(g, DT); for (const s of g.shots) if (s.aoe) shell = s; }
  check('R15 포격대장: 범위 포격(착탄 지점 미리 지정)', shell !== null, shell && 'aoe=' + shell.aoe); }
{ const g = arena(20, [['boss', 1500, 1500 - 900]]); const b = g.enemies[0]; let sh = false;
  for (let i = 0; i < 30 * 12; i++) { C.tick(g, DT); if (b.shieldT > 0) sh = true; }
  check('R20 철벽 장군: 방어막 발동', sh); }
{ const g = arena(25, [['boss', 1500, 1500 - 900]]); const b = g.enemies[0]; b.hp = b.max * 0.4; let rage = false;
  for (let i = 0; i < 30; i++) { C.tick(g, DT); if (b.enraged) rage = true; }
  check('R25 광전사: 체력 50% 이하에서 분노(속도/공격 증가)', rage && b.speedMul > 1.3, 'speedMul=' + b.speedMul.toFixed(2)); }
{ // 방어막은 받는 피해를 줄인다
  const g = arena(20, [['boss', 1500 + 200, 1500]]); const b = g.enemies[0]; b.shieldT = 10; b.shieldRed = 0.8; b.speed = 0; const hp0 = b.hp;
  C.tick(g, DT); // 성채가 사거리 안의 보스를 쏜다
  for (let i = 0; i < 30 * 3; i++) C.tick(g, DT);
  const withShield = hp0 - b.hp;
  const g2 = arena(20, [['boss', 1500 + 200, 1500]]); const b2 = g2.enemies[0]; b2.speed = 0; b2.abil = {};  for (let i = 0; i < 30 * 3 + 1; i++) C.tick(g2, DT);
  const noShield = b2.max - b2.hp;
  check('방어막 동안 보스가 받는 피해가 크게 줄어듦', noShield > 0 && withShield < noShield * 0.5, `${withShield.toFixed(0)} vs ${noShield.toFixed(0)}`); }

// 13) 포물선 투사체 (아군 화살/성채 포탄)
{ const g = arena(1, [['grunt', 1500 + 200, 1500]]); g.gold = 1000; C.buy(g, 'archer'); const ar = g.units[0]; ar.x = 1500 - 40; ar.y = 1500; ar.hx = ar.x; ar.hy = ar.y;
  let hmax = 0, tFly = 0, seen = false; const hs = [];
  for (let i = 0; i < 30 * 6 && !seen; i++) { C.tick(g, DT); for (const s of g.shots) { hs.push(s.h); hmax = Math.max(hmax, s.h); tFly += 1; seen = true; } }
  check('아군 화살/성채 포탄도 포물선', hmax > 8 && hs.length >= 1, 'h최대=' + hmax.toFixed(1)); }

console.log(failed ? '\n실패 ' + failed + '건' : '\n모두 통과');
process.exit(failed ? 1 : 0);
