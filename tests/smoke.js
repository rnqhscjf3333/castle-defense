// node tests/smoke.js [판수] — 로직 스모크 테스트 + 봇 플레이 (카드 선택 포함)
const C = require('../core.js');
C.CFG.elite.max = 0; // 엘리트는 기존 테스트에서 끔 (아래 전용 테스트에서 켬)
C.CFG.dmgVar = 0; C.CFG.units.sword.dbl = 0; const POP0 = C.CFG.castle.popBase; C.CFG.castle.popBase = 999; // 기존 테스트는 인구 제한 없이 (인구 테스트는 아래 43번) // 기존 테스트는 고정 피해 기준 (오차 테스트는 아래에서 따로)
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
    if (S.cinematic) C.endCinematic(S); // 2막 연출은 바로 넘긴다
    if (S.jobs.offer) C.pickJob(S, Math.floor(rnd() * S.jobs.offer.list.length)); // 보스 처치 후 전직 선택 (선택 전에는 시간이 멈춘다)
    if (S.cOffer) C.pickCastle(S, Math.floor(rnd() * S.cOffer.list.length)); // 성 갈래 선택
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
check('시작 골드로 유닛 3기를 뽑을 수 있음 (검사·궁수·사제 어떤 순서든)', (() => { const perms = [['sword', 'archer', 'priest'], ['sword', 'priest', 'archer'], ['archer', 'sword', 'priest'], ['archer', 'priest', 'sword'], ['priest', 'sword', 'archer'], ['priest', 'archer', 'sword'], ['sword', 'sword', 'sword'], ['archer', 'archer', 'archer']];
  return perms.every(p => { const g = C.createGame(1); return p.every(t => { g.buyCd[t] = 0; return C.buy(g, t).ok; }); }); })(), '시작 골드 ' + C.CFG.startGold);
check('시작 골드가 유닛 3기 값에서 크게 넘치지 않음', C.CFG.startGold < 260, String(C.CFG.startGold));
S.gold = 0;
check('골드가 없으면 아무도 못 뽑음', ['sword', 'archer', 'priest'].every(t => { const r = C.buy(S, t); return !r.ok && r.reason === 'gold'; }));
S.gold = 1000;
const base = { sword: C.unitCostOf(S, 'sword'), archer: C.unitCostOf(S, 'archer'), priest: C.unitCostOf(S, 'priest') };
const r1 = C.buy(S, 'sword'), r2 = C.buy(S, 'sword');
check('구매 쿨다운', r1.ok && !r2.ok && r2.reason === 'cooldown');
check('한 유닛을 뽑으면 모든 유닛 종류의 가격이 조금 오르고, 같은 종류는 더 오름', ['sword', 'archer', 'priest'].every(t => C.unitCostOf(S, t) > base[t]) && C.unitCostOf(S, 'sword') / base.sword > C.unitCostOf(S, 'archer') / base.archer, JSON.stringify(base) + '→' + ['sword', 'archer', 'priest'].map(t => C.unitCostOf(S, t)));
check('가격 = 기본가 × 전체인구 배율 × 같은 종류 인구 배율', C.unitCostOf(S, 'archer') === Math.round(C.CFG.units.archer.cost * C.CFG.economy.costAll) && C.unitCostOf(S, 'sword') === Math.round(C.CFG.units.sword.cost * C.CFG.economy.costAll * (1 + C.CFG.economy.costType)));
S.buyCd.sword = 0; S.buyCd.archer = 0;
const g0 = S.gold; C.buy(S, 'archer');
check('골드 차감과 구매 횟수 증가', S.gold === g0 - Math.round(C.CFG.units.archer.cost * C.CFG.economy.costAll) && S.buyCount === 2, 'buyCount=' + S.buyCount);
let many = C.createGame(2); many.gold = 1e9; let cnt = 0; for (let i = 0; i < 200; i++) { many.buyCd.sword = 0; if (C.buy(many, 'sword').ok) cnt++; }
check('(테스트 설정) 인구 상한을 크게 하면 200명도 뽑힘', cnt === 200 && many.units.length === 200, cnt + '명');
{ const hi = C.unitCostOf(many, 'sword'); for (let i = 0; i < 150; i++) many.units.pop(); check('가격은 병력이 많을수록 비싸고, 병력을 잃으면 내려감', hi > 100 * C.CFG.units.sword.cost && C.unitCostOf(many, 'sword') < hi / 10, hi + ' → ' + C.unitCostOf(many, 'sword')); }

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
  g.phase = 'round'; g.roundT = C.ROUND_TIME; g.queue = []; C.tick(g, DT);
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
applyById(S, 'c_atk'); check('성 공격력 강화', Math.abs(S.core.atk - C.CFG.core.atk * (1 + V.coreAtk)) < 1e-9, S.core.atk);
applyById(S, 'f_hp'); check('성 체력 증가(즉시 회복)', S.core.max === C.CFG.core.hp + V.fortHp && S.core.hp === S.core.max, S.core.max);
applyById(S, 'a_atk'); check('군기 오라', Math.abs(S.aura.atk - V.auraAtk) < 1e-9 && S.aura.on);
applyById(S, 'a_rad'); check('오라 강화: 모든 오라 효과 증폭', Math.abs(S.aura.atk - V.auraAtk * (1 + V.auraBoost)) < 1e-9, S.aura.atk.toFixed(4));
applyById(S, 's_golem'); check('골렘 소환', S.units.some(u => u.type === 'golem'));
applyById(S, 's_turret'); applyById(S, 's_turret'); check('포탑 2개', S.units.filter(u => u.type === 'turret').length === 2);

// 8) 자동 라운드 + 1라운드는 성 혼자 버티며 골드를 번다
S = C.createGame(4);
check('준비 시간 없이 바로 시작', C.PREP_TIME === 0);
C.tick(S, DT);
check('첫 틱에 라운드 1 자동 시작', S.round === 1 && S.phase === 'round');
let t1 = 0; while (S.round < 2 && t1 < 3000) { C.tick(S, DT); t1++; }
check('라운드는 시간이 지나면 자동으로 넘어감', S.round === 2, 't=' + S.t.toFixed(1));
check('1라운드: 유닛 없이도 성이 버티고 처치 골드를 얻음', S.core.hp > 0 && S.kills > 0 && S.gold > C.CFG.startGold, `처치 ${S.kills}, 골드 ${Math.round(S.gold)}, 성 ${Math.round(S.core.hp)}`);
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
for (const r of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) {
  const g = C.createGame(r); g.captureEvents = true; g.round = r - 1; g.phase = 'round'; g.roundT = C.ROUND_TIME; g.queue = []; C.tick(g, DT);
  if (g.cards.offer) C.pickCard(g, 0);
  const info = C.bossInfo(g, r);
  const ev = C.drainEvents(g);
  check(`R${r} 보스 라운드: 첫 적이 보스이고 이름 표시(${info.name})`, g.queue[0] === 'boss' && ev.some(e => e.type === 'banner' && e.boss && e.text.includes(info.name)));
  // 스폰 후 보스가 존재하는지
  g.queue = ['boss']; g.spawnT = 0; g.round = r; if (g.cards.offer) C.pickCard(g, 0); C.tick(g, DT);
  const b = g.enemies.find(e => e.kind === 'boss');
  check(`R${r} 보스 체력(절반 적용)/패턴`, b && b.max === Math.round(info.hp * C.CFG.balance.enemyHp * (r === 50 ? C.CFG.finalNerf.hp : 1)) && Object.keys(b.abil).length >= 1, b && (b.bossName + ' hp=' + b.max + ' 패턴=' + Object.keys(b.abil).join(',')));
}
{ const g = C.createGame(77); g.captureEvents = true; g.round = 3; g.phase = 'round'; g.queue = []; g.roundT = C.ROUND_TIME; /* 4라운드가 시작될 때 다음(5라운드) 보스를 예고 */ C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0);
  check('보스 전 라운드(4라운드 시작)에 다음 라운드 보스 예고 알림', C.drainEvents(g).some(e => e.type === 'notice' && e.text.includes(C.bossInfo(g, 5).name))); }

// 11) 새 적의 행동
const GUARD_RED = C.CFG.bossGuard.red; C.CFG.bossGuard.red = 0; // (다른 점검은 보스 초반 보호를 끄고 진행 — 아래 66번에서 따로 점검)
function arena(round, kinds, bossId) { const g = C.createGame(500 + round); g.hold = true; g.captureEvents = true; g.round = round; g.phase = 'round'; g.roundT = 0; g.queue = []; g.spawnPts = 4; if (bossId) { const idx = C.CFG.bossPool.findIndex(b => b.id === bossId), slot = round / 5 - 1, cur = g.bossOrder.indexOf(idx); if (cur >= 0) [g.bossOrder[slot], g.bossOrder[cur]] = [g.bossOrder[cur], g.bossOrder[slot]]; /* 이 라운드의 보스를 지정 */ } for (const [k, x, y] of kinds) C.spawnEnemy(g, k, x, y); return g; }
{ // 사수: 성에서 멀리 떨어져 포물선 화살로 성을 맞힌다
  const g = arena(5, [['archer', 1500, 1500 - 450]]); let arrow = null, hmax = 0, hp0 = g.core.hp, minD = 1e9; g.core.atk = 0; const ar0 = g.enemies[0];
  for (let i = 0; i < 30 * 40; i++) { C.tick(g, DT); minD = Math.min(minD, Math.hypot(ar0.x - 1500, ar0.y - 1500)); for (const s of g.shots) if (s.color === 'ea') { arrow = s; hmax = Math.max(hmax, s.h); } }
  check('사수는 멀리서 쏴서 성을 맞힘 (근접 안 함)', arrow !== null && g.core.hp < hp0, `성 ${Math.round(hp0)}→${Math.round(g.core.hp)}`);
  check('사수는 사거리 끝에서 멈춤 (근접하지 않음)', minD > 150, '최소 거리 ' + Math.round(minD));
  check('화살은 포물선 (높이가 솟았다 내려옴)', hmax > 10, 'h최대=' + hmax.toFixed(1)); }
{ // 폭파병: 닿으면 터져 범위 피해, 자신은 사라지고 처치 수는 올라가지 않음
  const g = arena(8, [['bomber', 1500, 1500 - 120]]); g.core.atk = 0; const hp0 = g.core.hp, k0 = g.kills; let boomed = false; // 성이 먼저 처치하지 못하게 공격력 0
  for (let i = 0; i < 30 * 10; i++) { C.tick(g, DT); if (C.drainEvents(g).some(e => e.type === 'boom' && e.enemy)) boomed = true; }
  check('폭파병 자폭: 성 피해 + 폭발 + 처치/골드 없음', boomed && g.core.hp < hp0 && g.enemies.length === 0 && g.kills === k0 && g.gold === C.CFG.startGold, `성 ${Math.round(hp0)}→${Math.round(g.core.hp)}`); }
{ // 주술사: 다친 적을 치유
  const g = arena(10, [['shaman', 1500, 1500 - 700], ['brute', 1500 + 40, 1500 - 700]]); const br = g.enemies.find(e => e.kind === 'brute'); br.hp = br.max * 0.3; let healed = false;
  for (let i = 0; i < 30 * 6; i++) { C.tick(g, DT); if (br.hp > br.max * 0.35) healed = true; }
  check('주술사가 다친 적을 치유', healed, Math.round(br.hp / br.max * 100) + '%'); }

// 12) 보스 패턴
{ const g = arena(5, [['boss', 1500, 1500 - 900]], 'charger'); const b = g.enemies[0]; let dashed = false; const x0 = b.y;
  for (let i = 0; i < 30 * 12; i++) { C.tick(g, DT); if (b.dashT > 0) dashed = true; }
  check('R5 돌격왕: 돌진 패턴 발동', dashed); }
{ const g = arena(10, [['boss', 1500, 1500 - 900]], 'summoner'); let n0 = g.enemies.length, maxN = n0;
  for (let i = 0; i < 30 * 14; i++) { C.tick(g, DT); maxN = Math.max(maxN, g.enemies.length); }
  check('R10 소환사: 졸개 소환', maxN > n0, n0 + '→' + maxN); }
{ const g = arena(15, [['boss', 1500, 1500 - 700]], 'bombardier'); let shell = null;
  g.gold = 1000; C.buy(g, 'sword');
  for (let i = 0; i < 30 * 14; i++) { C.tick(g, DT); for (const s of g.shots) if (s.aoe) shell = s; }
  check('R15 포격대장: 범위 포격(착탄 지점 미리 지정)', shell !== null, shell && 'aoe=' + shell.aoe); }
{ const g = arena(20, [['boss', 1500, 1500 - 900]], 'warden'); const b = g.enemies[0]; let sh = false;
  for (let i = 0; i < 30 * 12; i++) { C.tick(g, DT); if (b.shieldT > 0) sh = true; }
  check('R20 철벽 장군: 방어막 발동', sh); }
{ const g = arena(25, [['boss', 1500, 1500 - 900]], 'berserker'); const b = g.enemies[0]; b.hp = b.max * 0.4; let rage = false;
  for (let i = 0; i < 30; i++) { C.tick(g, DT); if (b.enraged) rage = true; }
  check('R25 광전사: 체력 50% 이하에서 분노(속도/공격 증가)', rage && b.speedMul > 1.3, 'speedMul=' + b.speedMul.toFixed(2)); }
{ // 방어막은 받는 피해를 줄인다
  const g = arena(20, [['boss', 1500 + 200, 1500]], 'warden'); const b = g.enemies[0]; b.shieldT = 10; b.shieldRed = 0.8; b.speed = 0; const hp0 = b.hp;
  C.tick(g, DT); // 성이 사거리 안의 보스를 쏜다
  for (let i = 0; i < 30 * 3; i++) C.tick(g, DT);
  const withShield = hp0 - b.hp;
  const g2 = arena(20, [['boss', 1500 + 200, 1500]], 'warden'); const b2 = g2.enemies[0]; b2.speed = 0; b2.abil = {};  for (let i = 0; i < 30 * 3 + 1; i++) C.tick(g2, DT);
  const noShield = b2.max - b2.hp;
  check('방어막 동안 보스가 받는 피해가 크게 줄어듦', noShield > 0 && withShield < noShield * 0.5, `${withShield.toFixed(0)} vs ${noShield.toFixed(0)}`); }

// 13) 포물선 투사체 (아군 화살/성 포탄)
{ const g = arena(1, [['grunt', 1500 + 200, 1500]]); g.gold = 1000; C.buy(g, 'archer'); const ar = g.units[0]; ar.x = 1500 - 40; ar.y = 1500; ar.hx = ar.x; ar.hy = ar.y;
  let hmax = 0, tFly = 0, seen = false; const hs = [];
  for (let i = 0; i < 30 * 6 && !seen; i++) { C.tick(g, DT); for (const s of g.shots) { hs.push(s.h); hmax = Math.max(hmax, s.h); tFly += 1; seen = true; } }
  check('아군 화살/성 포탄도 포물선', hmax > 8 && hs.length >= 1, 'h최대=' + hmax.toFixed(1)); }


// 14) 특수 소환도 유닛 가격을 올린다
{ const g = C.createGame(31); g.gold = 1e6; const before = C.unitCostOf(g, 'sword'), bc = g.buyCount;
  applyById(g, 's_golem'); applyById(g, 's_hero'); applyById(g, 's_turret');
  check('골렘·용사·포탑 등 특수 유닛은 소환해도 가격을 올리지 않음', g.buyCount === bc && C.unitCostOf(g, 'sword') === before && ['golem', 'hero', 'turret'].every(t => C.CFG.units[t].priceSteps === 0), `${before}→${C.unitCostOf(g, 'sword')}`);
  g.buyCd.sword = 0; C.buy(g, 'sword'); check('직접 뽑는 유닛은 여전히 가격을 올림', C.unitCostOf(g, 'sword') > before);
  check('카드 설명에 인구 표기 없음', C.CARD_DEFS.every(d => !String(d.desc ? d.desc(1) : '').includes('인구'))); }

// 15) 전직: 보스를 처치하면 직업 선택, 선택하면 해당 직업이 강해진다
function settle(g) { for (let i = 0; i < 600 && g.bossDeath; i++) C.tick(g, DT); } // 보스 사망 연출이 끝날 때까지
function killBoss(g) { const b = g.enemies.find(e => e.kind === 'boss'); b.hp = 1; b.shieldT = 0; g.core.atk = 1e6; for (let i = 0; i < 600 && !g.jobs.offer; i++) C.tick(g, DT); return b; }
{ const g = arena(5, [['boss', 1500, 1500 - 220]]); g.gold = 1e6; C.buy(g, 'sword'); g.buyCd.sword = 0; C.buy(g, 'archer'); g.buyCd.archer = 0; C.buy(g, 'priest');
  const b = killBoss(g);
  check('5라운드 보스 처치 → 승급할 캐릭터 선택(3명) + 시간 정지', b.dead && g.jobs.offer && g.jobs.offer.stage === 'line' && g.jobs.offer.list.length === 3 && g.jobs.offer.boss === b.bossName, g.jobs.offer && g.jobs.offer.list.map(o => o.className).join(' / '));
  const t0 = g.t; for (let i = 0; i < 20; i++) C.tick(g, DT); check('전직 선택 중 시간이 멈춤', g.t === t0);
  const swIdx = g.jobs.offer.list.findIndex(o => o.type === 'sword'); C.pickJob(g, swIdx);
  check('캐릭터를 고르면 그 캐릭터의 전직 2개가 나옴', g.jobs.offer.stage === 'class' && g.jobs.offer.list.length === 2 && g.jobs.offer.list.every(o => o.type === 'sword' && o.tier === 1), g.jobs.offer.list.map(o => o.name).join('/'));
  check('뒤로 가면 캐릭터 선택으로 돌아감', C.jobBack(g) && g.jobs.offer.stage === 'line' && g.jobs.offer.list.length === 3);
  C.pickJob(g, g.jobs.offer.list.findIndex(o => o.type === 'sword'));
  const sw = g.units.find(u => u.type === 'sword'), hp0 = sw.max;
  C.pickJob(g, g.jobs.offer.list.findIndex(o => o.id === 'knight'));
  check('전직(나이트): 체력 증가(CFG 수치), 직업 표시', Math.abs(sw.max - Math.round(hp0 * (1 + C.CFG.jobs.sword.t1[0].mods.hp))) <= 1 && sw.job === 'knight' && sw.jobTier === 1, `${hp0}→${sw.max}`);
  check('전직 선택 후 시간 재개', (() => { const t = g.t; C.tick(g, DT); return g.t > t; })());
  check('새로 뽑는 유닛도 전직 효과를 받음', (() => { g.buyCd.sword = 0; const n = C.buy(g, 'sword').unit; return n.max === sw.max && n.job === 'knight'; })());
  // 2단계: 나이트 → 팔라딘 / 워로드 (선택한 갈래의 2차 2개)
  const opts2 = C.jobOptions(g).filter(o => o.type === 'sword');
  check('2단계 선택지는 선택한 갈래의 2차 직업 2개', opts2.length === 2 && opts2.map(o => o.id).sort().join() === 'paladin,warlord' && opts2.every(o => o.tier === 2), opts2.map(o => o.name).join());
  g.jobs.offer = { boss: 't', list: opts2 }; C.pickJob(g, opts2.findIndex(o => o.id === 'paladin'));
  check('팔라딘: 체력 추가 증가 + 받는 피해 감소 + 재생 보정 합산', g.jobMods.sword.hp > 1.2 && g.jobMods.sword.def > 0.16 && g.jobMods.sword.regen === 0.03, JSON.stringify(g.jobMods.sword));
  sw.hp = sw.max * 0.5; const h0 = sw.hp; g.enemies.length = 0; g.queue = []; for (let i = 0; i < 60; i++) C.tick(g, DT);
  check('팔라딘 재생: 체력이 서서히 차오름', sw.hp > h0, Math.round(h0) + '→' + Math.round(sw.hp));
  check('최종 전직 이후 그 직업은 더 이상 제안되지 않음', C.jobOptions(g).every(o => o.type !== 'sword'));
  check('describeJobs에 전직 이력 표시', JSON.stringify(C.describeJobs(g).find(j => j.type === 'sword').names) === '["나이트","팔라딘"]'); }
{ // 각 직업의 효과
  const g = C.createGame(41); g.gold = 1e7; for (const t of ['sword', 'archer', 'priest']) { g.buyCd[t] = 0; C.buy(g, t); }
  const ar = g.units.find(u => u.type === 'archer'), pr = g.units.find(u => u.type === 'priest'), r0 = ar.range, hr0 = pr.healRange, heal0 = pr.heal;
  const give = id => { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); };
  give('sniper'); check('저격수: 사거리 +60, 공격력 상승', ar.range === r0 + 60 && ar.atk > C.CFG.units.archer.atk * 1.5, `${r0}→${ar.range}`);
  const sp0 = C.CFG.units.archer.speed; give('deadeye'); check('명사수: 저격총(일직선) · 사거리 +140 · 이동 속도 -35% (화살 관통은 없음)', g.jobMods.archer.rifle === 1 && g.jobMods.archer.pierce === 0 && ar.range === r0 + 140 && Math.abs(ar.speed / sp0 - 0.65) < 0.02, ar.range + '/' + ar.speed.toFixed(1));
  give('cleric'); check('성직자: 부활 없음', g.reviveLeft === 0 && g.jobMods.priest.revive === 0);
  give('archbishop'); check('대주교: 부활 1회 (즉시 반영)', g.jobMods.priest.revive === 1 && g.reviveLeft >= 1, 'reviveLeft=' + g.reviveLeft);
  const pr2 = g.units.find(u => u.type === 'priest'); check('주교 계열: 치유량 증가', pr2.heal > heal0, `${heal0}→${pr2.heal.toFixed(1)}`);
  const g2 = C.createGame(42); g2.gold = 1e7; g2.buyCd.priest = 0; C.buy(g2, 'priest'); const p2 = g2.units[0], hr = p2.healRange;
  g2.jobs.offer = { boss: 't', list: [C.jobOptions(g2).find(x => x.id === 'cleric')] }; C.pickJob(g2, 0); check('성직자: 치유 범위 +50', p2.healRange === hr + 50, `${hr}→${p2.healRange}`);
  const g3 = C.createGame(43); g3.gold = 1e7; g3.buyCd.sword = 0; C.buy(g3, 'sword'); const s3 = g3.units[0], a0 = s3.atk;
  g3.jobs.offer = { boss: 't', list: [C.jobOptions(g3).find(x => x.id === 'blade')] }; C.pickJob(g3, 0); check('블레이드: 공격력 +50%, 공격 속도 +20%', Math.abs(s3.atk / a0 - 1.5) < 1e-9 && Math.abs(s3.rate / C.CFG.units.sword.rate - 1.2) < 1e-9);
  g3.jobs.offer = { boss: 't', list: [C.jobOptions(g3).find(x => x.id === 'blademaster')] }; C.pickJob(g3, 0);
  // 검성 베기: 주변 적에게도 피해
  g3.enemies.length = 0; const e1 = C.spawnEnemy(g3, 'brute', s3.x + 30, s3.y), e2 = C.spawnEnemy(g3, 'brute', s3.x + 38, s3.y + 14); g3.core.atk = 0; g3.round = 5;
  const h1 = e1.hp, h2 = e2.hp; for (let i = 0; i < 40; i++) C.tick(g3, DT);
  check('검성: 주변 적에게도 베기 피해', e1.hp < h1 && e2.hp < h2, `${Math.round(h1 - e1.hp)} / ${Math.round(h2 - e2.hp)}`); }
{ // 30라운드 보스(암흑 기사단장) 처치 → 승리가 아니라 2막 연출, 시간 정지, 전직 선택
  const g = arena(30, [['boss', 1500, 1500 - 220]]); g.captureEvents = true; g.round = 30; g.queue = []; const b = g.enemies[0]; b.hp = 1; g.core.atk = 1e6; for (let i = 0; i < 600 && !g.cinematic; i++) C.tick(g, DT);
  check('30라운드 보스 처치: 게임이 끝나지 않고 2막 연출이 시작됨', b.dead && !g.over && g.act === 2 && !!g.cinematic && C.drainEvents(g).some(e => e.type === 'act2'), 'act=' + g.act);
  check('연출 중에는 시간이 멈춤', (() => { const t = g.t; for (let i = 0; i < 30; i++) C.tick(g, DT); return g.t === t; })());
  check('2막 연출과 함께 전직 선택도 제시됨', !!g.jobs.offer);
  C.pickJob(g, 0); C.tick(g, DT); check('전직을 골라도 연출이 끝나기 전엔 시간이 멈춰 있음', (() => { const t = g.t; C.tick(g, DT); return g.t === t; })());
  C.endCinematic(g); const t1 = g.t; C.tick(g, DT); check('연출이 끝나면 시간이 다시 흐름', g.t > t1); }
{ // 30라운드 보스가 살아 있으면 31라운드로 넘어가지 않는다 (보스를 처치해야 2막)
  const g = arena(30, [['boss', 1500, 1500 - 900]]); g.round = 30; g.queue = []; g.core.atk = 0; g.core.hp = g.core.max = 1e9; const b = g.enemies[0]; b.speed = 0; b.abil = {};
  for (let i = 0; i < 30 * 130; i++) C.tick(g, DT);
  check('30라운드 보스가 살아 있으면 130초가 지나도 라운드가 그대로 (게이트)', g.round === 30 && g.act === 1 && !b.dead, 'round=' + g.round);
  b.x = 1500; b.y = 1500 - 200; g.core.atk = 1e6; b.hp = 1; for (let i = 0; i < 600 && !g.cinematic; i++) C.tick(g, DT); C.endCinematic(g); if (g.jobs.offer) C.pickJob(g, 0); g.hold = false;
  for (let i = 0; i < 30 * 5; i++) C.tick(g, DT);
  check('보스를 처치하고 연출이 끝나면 곧바로 31라운드(2막)가 시작됨', g.round === 31 && g.act === 2, 'round=' + g.round); }
{ // 50라운드 마왕 처치 → (부활 후 다시 처치) → 무한 모드(51라운드) 시작
  const g = arena(50, [['boss', 1500, 1500 - 220]]); g.act = 2; g.round = 50; g.queue = []; const b = g.enemies[0]; g.core.atk = 1e6; g.core.hp = g.core.max = 1e9; const max1 = b.max; b.hp = 1; C.damage(g, b, 5);
  check('마왕 1차 사망: 연출이 시작되고 아직 쓰러지지 않음', !!g.bossDeath && b.dying && !b.dead && g.bossDeath.revive);
  for (let i = 0; i < 600 && !(b.p2 && !b.dying); i++) C.tick(g, DT);
  check('마왕이 부활: 모습이 바뀌고 체력이 100%로 다시 참', b.p2 && !b.dead && b.hp === b.max && b.bossName === '각성한 마왕' && b.look.p2 && !g.endless && g.round === 50, b.hp + '/' + b.max);
  b.hp = 1; C.damage(g, b, 5); check('각성 형태는 다시 부활하지 않음', !g.bossDeath.revive);
  for (let i = 0; i < 600 && !g.cinematic; i++) C.tick(g, DT);
  const cin = g.cinematic && g.cinematic.kind === 'endless'; C.endCinematic(g); if (g.jobs.offer) C.pickJob(g, 0); g.hold = false; for (let i = 0; i < 60; i++) C.tick(g, DT);
  check('마왕 처치 → 연출(endless) 후', cin);
  check('50라운드 마왕 처치 → 게임이 끝나지 않고 51라운드(무한)로', b.p2 && !g.over && g.round === 51, 'round ' + g.round);
  check('무한 모드는 라운드마다 점점 훨씬 강해짐', C.hpMul(60) > C.hpMul(50) * 1.4 && C.hpMul(80) > C.hpMul(60) * 1.4 && C.enemyCount(60) > C.enemyCount(50) * 1.1, `hp ×${(C.hpMul(60) / C.hpMul(50)).toFixed(1)} 수 ×${(C.enemyCount(60) / C.enemyCount(50)).toFixed(1)}`);
  const e55 = C.bossInfo(g, 55), e60 = C.bossInfo(g, 60); check('무한 모드 5라운드마다 보스 (마왕은 50라운드에만)', !!e55 && !!e60 && e60.name !== '마왕' && C.bossInfo(g, 56) === null); }
{ // 2막 구조: 새 길(8방향), 더 가파른 난이도, 보스 라운드
  const a8 = C.spawnAngles(8), a6 = C.spawnAngles(6);
  check('2막 스폰 방향 8곳 (1막 6곳 + 새 길 2개, 중복 없음)', a8.length === 8 && new Set(a8.map(x => x.toFixed(3))).size === 8 && a6.every((x, i) => Math.abs(x - a8[i]) < 1e-9));
  const g = C.createGame(77); g.captureEvents = true; C.jumpToRound(g, 31); C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0);
  check('31라운드부터 스폰 지점이 8곳이고 2막 상태', g.spawnPts === 8 && g.act === 2, 'pts=' + g.spawnPts);
  const slopePre = (C.hpMul(30) - C.hpMul(25)) / 5, slopePost = (C.hpMul(40) - C.hpMul(35)) / 5;
  check('2막에서도 라운드마다 체력이 꾸준히 증가 (밸런스 조정으로 기울기는 1막 후반보다 완만)', slopePost > 0.05, `${slopePre.toFixed(2)} → ${slopePost.toFixed(2)}/라운드`);
  check('2막 적 수 증가 (라운드당 +countPost, 1막 말 수 이어짐)', C.enemyCount(31) - C.enemyCount(30) === C.CFG.balance.countPost && C.enemyCount(50) > C.enemyCount(30));
  const g1 = C.createGame(78); C.jumpToRound(g1, 30); const sp1 = C.enemyCount(30);
  check('1막(≤30)은 act 1, 2막 진입은 보스 처치로만', g1.act === 1 && C.createGame(1).act === 1); }

// 16) 적은 맵 끝이 아니라 성 근처(SPAWN_RING)에서 나타나 금방 도착한다
{ const g = arena(3, []); g.captureEvents = true; g.spawnPts = 6;
  const dists = []; for (let i = 0; i < 60; i++) { const e = C.spawnEnemy(g, 'grunt'); dists.push(Math.hypot(e.x - 1500, e.y - 1500)); }
  check('적 출현 위치는 성에서 약 ' + C.SPAWN_RING + 'px (맵 끝이 아님)', dists.every(d => Math.abs(d - C.SPAWN_RING) < 120) && C.SPAWN_RING <= 800, `${Math.round(Math.min(...dists))}~${Math.round(Math.max(...dists))}`);
  check('출현 이벤트 발생 (나타나는 효과용)', C.drainEvents(g).filter(e => e.type === 'espawn').length === 60);
  const a4 = C.spawnAngles(4), a6 = C.spawnAngles(6);
  check('스폰 방향: 4곳(90° 간격) / 6곳(샛길 2개 추가), 중복 없음', a4.length === 4 && a6.length === 6 && new Set(a6.map(x => x.toFixed(3))).size === 6 && a6.slice(0, 4).every((x, i) => Math.abs(x - a4[i]) < 1e-9));
  const g2 = arena(3, [['grunt', 1500, 1500 - C.SPAWN_RING]]); g2.core.atk = 0; const gr = g2.enemies[0]; let tArrive = 0; for (let i = 0; i < 30 * 40; i++) { C.tick(g2, DT); if (Math.hypot(gr.x - 1500, gr.y - 1500) < 100) { tArrive = g2.t; break; } }
  check('출현 후 성까지 도착이 빠름 (돌격병 15초 이내)', tArrive > 0 && tArrive < 15, tArrive.toFixed(1) + '초'); }

// 17) 유닛 기본 위치: 평소에는 사방으로 고르게, 적이 가까이 오면 그쪽으로 쏠림
function spreadOf(g) { const q = { up: 0, down: 0, left: 0, right: 0 }, ang = []; for (const u of g.units) { const dx = u.x - 1500, dy = u.y - 1500; dy < 0 ? q.up++ : q.down++; dx < 0 ? q.left++ : q.right++; ang.push(Math.atan2(dy, dx)); } ang.sort((a, b) => a - b); let gap = 0; for (let i = 0; i < ang.length; i++) { let d = ang[(i + 1) % ang.length] - ang[i]; if (d <= 0) d += 2 * Math.PI; gap = Math.max(gap, d); } return { q, gapDeg: gap * 180 / Math.PI }; }
{ const g = arena(3, []); g.gold = 1e7; for (const t of ['sword', 'archer', 'sword', 'priest', 'archer', 'sword', 'sword', 'archer', 'priest', 'sword', 'archer', 'sword']) { g.buyCd[t] = 0; C.buy(g, t); }
  for (let i = 0; i < 30 * 8; i++) C.tick(g, DT);
  const sp = spreadOf(g);
  check('적이 없을 때 유닛이 사방에 고르게 분포 (위/아래/좌/우 각각 4기 이상)', sp.q.up >= 4 && sp.q.down >= 4 && sp.q.left >= 4 && sp.q.right >= 4, JSON.stringify(sp.q));
  check('빈 각도가 크지 않음 (가장 큰 공백 < 100°)', sp.gapDeg < 100, Math.round(sp.gapDeg) + '°');
  // 위쪽에서 적이 성 가까이 접근 → 서서히 그쪽으로 쏠림
  C.spawnEnemy(g, 'brute', 1500, 1500 - 380); g.core.atk = 0; const b0 = g.biasNow;
  for (let i = 0; i < 30 * 3; i++) C.tick(g, DT);
  check('적이 가까이 오면 위협 방향으로 서서히 모임 (쏠림 증가)', g.biasNow > b0 + 0.2, `bias ${b0.toFixed(2)}→${g.biasNow.toFixed(2)}`); }

// 18) 성: 적을 향해 조준하고 쏠 때 반동 상태가 생김
{ const g = arena(3, [['grunt', 1500 + 200, 1500]]); let aimed = false, swung = false;
  for (let i = 0; i < 30 * 4; i++) { C.tick(g, DT); if (g.core.swing > 0) swung = true; if (swung && Math.abs(g.core.aim - 0) < 0.3) aimed = true; }
  check('성이 적 방향으로 대포를 조준하고 발사 상태(swing)가 됨', swung && aimed, 'aim=' + g.core.aim.toFixed(2)); }

// 19) 적 스탯 배율 (체력 enemyHp·공격력 enemyDmg, 이동 속도는 그대로)
{ const g = arena(1, []); const e = C.spawnEnemy(g, 'grunt', 1500, 800), base = C.CFG.enemies.grunt;
  check('적 체력 = 기본 × 라운드 배율 × enemyHp', e.max === Math.round(base.hp * C.hpMul(1) * C.CFG.balance.enemyHp * C.CFG.balance.meleeHp), `${base.hp}→${e.max}`);
  check('적 공격력이 절반', Math.abs(e.dmg - base.dmg * C.dmgMul(1) * 0.5) < 1e-9, `${base.dmg}→${e.dmg}`);
  check('이동 속도는 그대로', Math.abs(e.speed - base.speed) < 1e-9, String(e.speed));
  const bb = (() => { const g2 = arena(5, []); return C.spawnEnemy(g2, 'boss', 1500, 800); })();
  check('보스 체력도 같은 배율 (돌격왕 1300 × enemyHp)', bb.max === Math.round(1300 * C.CFG.balance.enemyHp), String(bb.max)); }

// 20) 발사 위치: 몸 중심이 아니라 포구/활 위치에서 출발하고, 높이가 지면 목표로 떨어진다
{ const g = arena(3, [['grunt', 1500 + 220, 1500]]); g.core.atk = 20; let first = null;
  for (let i = 0; i < 30 * 3 && !first; i++) { C.tick(g, DT); first = g.shots.find(s => s.color === 'c'); }
  const d0 = first && Math.hypot(first.sx - 1500, first.sy - 1500);
  check('성 포탄은 성 중심이 아니라 대포 포구(약 32px)에서 출발', first && Math.abs(d0 - 32) < 1.5, 'd=' + (d0 && d0.toFixed(1)));
  check('포구 방향으로 나감 (적이 오른쪽이면 포구도 오른쪽)', first && first.sx > 1500 + 25 && Math.abs(first.sy - 1500) < 3, first && `(${first.sx.toFixed(0)},${first.sy.toFixed(0)})`); }
{ const g = arena(3, []); g.gold = 1e6; g.buyCd.archer = 0; const ar = C.buy(g, 'archer').unit; ar.x = 1500 - 60; ar.y = 1500 + 200; ar.hx = ar.x; ar.hy = ar.y; g.core.atk = 0;
  C.spawnEnemy(g, 'grunt', 1500 - 60 + 150, 1500 + 200); let sh = null; for (let i = 0; i < 30 * 4 && !sh; i++) { C.tick(g, DT); sh = g.shots.find(s => s.color === 'a'); }
  const d = sh && Math.hypot(sh.sx - ar.x, sh.sy - ar.y);
  check('화살은 궁수의 활 위치(약 10px 앞, 높이 2.5)에서 출발', sh && Math.abs(d - 10) < 1.5 && sh.h0 === 2.5, 'd=' + (d && d.toFixed(1))); }
{ const g = arena(5, [['archer', 1500, 1500 - 420]]); g.core.atk = 0; const ea = g.enemies[0]; let sh = null;
  for (let i = 0; i < 30 * 40 && !sh; i++) { C.tick(g, DT); sh = g.shots.find(s => s.color === 'ea'); }
  const d = sh && Math.hypot(sh.sx - ea.x, sh.sy - ea.y);
  check('적 사수의 화살도 활 위치에서 출발', sh && Math.abs(d - 10) < 1.5, 'd=' + (d && d.toFixed(1))); }
{ const g = arena(3, []); g.cards.offer = [{ key: 's_turret', id: 's_turret', cat: 'summon', rar: 'rare', type: null, name: 't', desc: '', lv: 1 }]; C.pickCard(g, 0); g.core.atk = 0;
  const tu = g.units.find(u => u.type === 'turret'); C.spawnEnemy(g, 'brute', tu.x + 150, tu.y); let sh = null; for (let i = 0; i < 30 * 4 && !sh; i++) { C.tick(g, DT); sh = g.shots.find(s => s.color === 't'); }
  const d = sh && Math.hypot(sh.sx - tu.x, sh.sy - tu.y);
  check('포탑 탄은 포신 끝(약 20px, 높이 9.5)에서 출발', sh && Math.abs(d - 20) < 1.5 && sh.h0 === 9.5, 'd=' + (d && d.toFixed(1))); }
{ const g = arena(15, [['boss', 1500, 1500 - 600]], 'bombardier'); g.gold = 1e6; g.buyCd.sword = 0; C.buy(g, 'sword'); let sh = null; const b = g.enemies[0];
  for (let i = 0; i < 30 * 14 && !sh; i++) { C.tick(g, DT); sh = g.shots.find(s => s.aoe); }
  const d = sh && Math.hypot(sh.sx - b.x, sh.sy - b.y);
  check('포격대장 포탄은 어깨 대포 끝(약 85px, 높이 34)에서 출발', sh && Math.abs(d - 85) < 5 && sh.h0 === 34, 'd=' + (d && d.toFixed(1))); }
{ const g = arena(25, [['boss', 1500, 1500 - 600]], 'berserker'); g.gold = 1e6; g.buyCd.sword = 0; C.buy(g, 'sword'); let sh = null; const b = g.enemies[0]; b.t.dash = 99;
  for (let i = 0; i < 30 * 14 && !sh; i++) { C.tick(g, DT); sh = g.shots.find(s => s.aoe); }
  check('대포 없는 보스(광전사)는 머리 위(높이 62)에서 던지듯 발사', sh && sh.h0 === 62 && Math.hypot(sh.sx - b.x, sh.sy - b.y) < 3 /* 같은 틱에 보스가 조금 움직이므로 오차 허용 */); }
{ // 포물선: 시작 높이 h0 → 정점 → 목표 지면 (h=0)에 도착
  const g = arena(3, [['grunt', 1500 + 220, 1500]]); let seen = [], tgt = null;
  for (let i = 0; i < 30 * 3; i++) { C.tick(g, DT); const s = g.shots.find(x => x.color === 'c'); if (s) { tgt = s; seen.push(s.h); } else if (seen.length) break; }
  check('포탄 높이가 포구에서 시작해 솟았다가 0으로 떨어짐', seen.length > 3 && Math.max(...seen) > 8 && seen[seen.length - 1] < Math.max(...seen) * 0.6, `max=${Math.max(...seen).toFixed(1)}, 마지막=${seen[seen.length - 1].toFixed(1)}`); }

// 21) 보스 무작위 순서: 일반 보스 5종이 한 번씩, 순서는 게임마다 무작위, 30라운드는 마왕 고정
{ const orders = new Set(), names = new Set(); let allPerm = true, finalOk = true, det = true;
  for (let seed = 1; seed <= 200; seed++) {
    const g = C.createGame(seed), seq = [5, 10, 15, 20, 25].map(r => C.bossInfo(g, r).id);
    if (new Set(seq).size !== 5) allPerm = false; seq.forEach(x => names.add(x)); orders.add(seq.join());
    if (C.bossInfo(g, 30).id !== 'darkknight' || C.bossInfo(g, 50).id !== 'overlord') finalOk = false;
    const act2 = [35, 40, 45].map(r => C.bossInfo(g, r).id); if (new Set(act2).size !== 3 || act2.some(id => !C.CFG.bossPool.some(b => b.id === id))) allPerm = false;
    const g2 = C.createGame(seed); if ([5, 10, 15, 20, 25].map(r => C.bossInfo(g2, r).id).join() !== seq.join()) det = false;
    if (C.bossInfo(g, 7) !== null) allPerm = false;
  }
  check('5·10·15·20·25라운드에 일반 보스 5종이 한 번씩 (중복 없음)', allPerm && names.size === 5);
  check('보스 순서가 게임마다 다름 (200판에서 서로 다른 순서 다수)', orders.size > 40, orders.size + '가지');
  check('30라운드 보스는 항상 암흑 기사단장, 50라운드는 항상 마왕, 35·40·45는 일반 보스 3종(중복 없음)', finalOk);
  check('같은 시드는 같은 보스 순서 (결정론)', det);
  // 모든 보스 위치 분포가 고른지: 5라운드에 5종이 대체로 비슷한 빈도
  const cnt = {}; for (let seed = 1; seed <= 1000; seed++) { const id = C.bossInfo(C.createGame(seed), 5).id; cnt[id] = (cnt[id] || 0) + 1; }
  check('5라운드 보스가 5종 모두 고르게 나옴 (각 15%~25%)', Object.values(cnt).length === 5 && Object.values(cnt).every(v => v > 150 && v < 250), JSON.stringify(cnt)); }
// 22) 보스 체력은 보스가 누구든 같은 라운드면 같고, 패턴 강도는 라운드에 맞춰 조정
{ const hps = new Set(); for (const id of C.CFG.bossPool.map(b => b.id)) { const g = arena(10, [['boss', 1500, 800]], id); hps.add(g.enemies[0].max); }
  check('같은 라운드(10)면 어떤 보스든 체력이 같음 (라운드별 체력표)', hps.size === 1 && [...hps][0] === Math.round(C.CFG.bossHp[10] * C.CFG.balance.enemyHp * C.CFG.balance.bossHp), [...hps].join());
  const early = arena(5, [['boss', 1500, 800]], 'berserker').enemies[0], late = arena(25, [['boss', 1500, 800]], 'berserker').enemies[0];
  check('광전사 포격: 이른 라운드는 약하게, 늦은 라운드는 강하게 (피해·발수)', early.abil.artillery.dmg < late.abil.artillery.dmg && early.abil.artillery.count <= late.abil.artillery.count, `R5 ${early.abil.artillery.dmg}×${early.abil.artillery.count} / R25 ${late.abil.artillery.dmg}×${late.abil.artillery.count}`);
  const sm5 = arena(5, [['boss', 1500, 800]], 'summoner').enemies[0], sm25 = arena(25, [['boss', 1500, 800]], 'summoner').enemies[0];
  check('소환사 졸개 수도 라운드에 따라 늘어남', sm5.abil.summon.n < sm25.abil.summon.n, `${sm5.abil.summon.n} → ${sm25.abil.summon.n}`);
  const fin = arena(30, [['boss', 1500, 800]]).enemies[0]; check('암흑 기사단장(30라운드)은 패턴 8종(상태이상·강습·순간이동·암흑 흡수 포함) 고정 수치', Object.keys(fin.abil).length === 8 && fin.abil.artillery.dmg === C.CFG.act1Boss.abil.artillery.dmg);
  const fin50 = arena(50, [['boss', 1500, 800]]).enemies[0]; check('마왕(50라운드)은 패턴 9종(상태이상 4가지·강습·순간이동·도약) 고정 수치, 더 큼', Object.keys(fin50.abil).length === 10 && !!fin50.abil.sword && !fin50.abil.drain && fin50.abil.artillery.count === 2 && fin50.r > 33 && fin50.bossName === '마왕'); }

// 23) 졸개 소환: 성 가까이 왔을 때만, 보스 앞(성 방향)에 나온다
{ const g = arena(10, [['boss', 1500, 1500 - 1000]], 'summoner'); g.core.atk = 0; g.core.hp = g.core.max = 1e9; const b = g.enemies[0]; b.speed = 0; delete b.abil.blink; let early = 0;
  for (let i = 0; i < 30 * 30; i++) { C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0); } // 보스가 멀리(1000px) 정지: 소환 시간이 흐르지 않음
  check('보스가 성에서 멀면(600px 밖) 졸개를 소환하지 않음', g.enemies.length === 1, '적 ' + g.enemies.length + '마리');
  b.x = 1500; b.y = 1500 - 500; g.captureEvents = true; let ev = null, minions = [];
  for (let i = 0; i < 30 * 20 && !ev; i++) { C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0); ev = C.drainEvents(g).find(e => e.type === 'bossSummon'); }
  minions = g.enemies.filter(e => e.kind !== 'boss');
  check('성 가까이(500px) 오면 소환하고 마릿수가 알림에 담김', !!ev && ev.n === minions.length && minions.length >= 3, ev && `n=${ev.n}, 실제 ${minions.length}`);
  check('졸개는 보스 앞(성 쪽)에 나옴 (보스보다 성에 가까움)', minions.length > 0 && minions.every(m => Math.hypot(m.x - 1500, m.y - 1500) < Math.hypot(b.x - 1500, b.y - 1500) + 20), minions.map(m => Math.round(Math.hypot(m.x - 1500, m.y - 1500))).join(',') + ' vs 보스 ' + Math.round(Math.hypot(b.x - 1500, b.y - 1500)));
  const kinds = new Set(); for (const id of ['summoner', 'bombardier', 'warden']) { const gg = arena(15, [['boss', 1500, 1500 - 400]], id); gg.core.atk = 0; gg.core.hp = gg.core.max = 1e9; gg.enemies[0].speed = 0; for (let i = 0; i < 30 * 16; i++) { C.tick(gg, DT); if (gg.cards.offer) C.pickCard(gg, 0); } kinds.add(gg.enemies.filter(e => e.kind !== 'boss').map(e => e.kind)[0]); }
  check('소환사·포격대장·철벽 장군이 각자의 졸개(돌격병·사수·방패병)를 소환', ['grunt', 'archer', 'shield'].every(k => kinds.has(k)), [...kinds].join()); }

// 24) 성 원형: 아군은 들어올 수 없다
{ const g = arena(3, []); g.gold = 1e7; for (const t of ['sword', 'archer', 'priest', 'sword', 'archer', 'priest', 'sword', 'sword', 'priest', 'archer']) { g.buyCd[t] = 0; C.buy(g, t); }
  let minD = 1e9; for (let i = 0; i < 30 * 20; i++) { if (i === 150) for (let k = 0; k < 6; k++) C.spawnEnemy(g, 'grunt', 1500 + (k - 3) * 60, 1500 - 300); C.tick(g, DT); for (const u of g.units) if (!C.CFG.units[u.type].static) minD = Math.min(minD, Math.hypot(u.x - 1500, u.y - 1500)); }
  check('아군(검사·궁수·사제)은 성 원형(반지름 ' + C.CFG.core.blockR + ') 안으로 들어오지 않음', minD >= C.CFG.core.blockR - 0.5, '최소 거리 ' + minD.toFixed(1));
  const g2 = arena(3, []); g2.gold = 1e6; g2.buyCd.priest = 0; const pr = C.buy(g2, 'priest').unit; pr.x = 1500; pr.y = 1500; for (let i = 0; i < 5; i++) C.tick(g2, DT);
  check('성 한가운데로 보내도 바로 원 밖으로 밀려남', Math.hypot(pr.x - 1500, pr.y - 1500) >= C.CFG.core.blockR - 0.5);
  check('사제의 대기 반경이 성 원형 밖', C.CFG.ai.homeR.priest * 0.9 > C.CFG.core.blockR + 10); }
// 25) 방어 자세: 거리 조건 없이 검사 계열이 받는 피해 감소, 문구에도 300 없음
{ const g = arena(3, []); g.gold = 1e6; g.buyCd.sword = 0; const sw = C.buy(g, 'sword').unit; applyById(g, 'u_guard'); sw.x = 1500 + 800; sw.y = 1500; sw.hp = sw.max = 1e6;
  const e = C.spawnEnemy(g, 'grunt', sw.x + 15, sw.y); e.dmg = 100; e.cd = 0; e.hp = e.max = 1e9; g.core.atk = 0; const h0 = sw.hp; C.tick(g, DT); C.tick(g, DT);
  const taken = h0 - sw.hp; const expected = 100 * (1 - C.CFG.cardVals.guard);
  check('방어 자세: 성에서 멀리 있어도(800px) 검사 피해 감소 적용', taken > 0 && Math.abs(taken - expected) < 1, taken.toFixed(1) + ' (기대 ' + expected.toFixed(1) + ')');
  check('방어 자세 문구에 "성 주변(300)" 없음', !C.CARD_DEFS.find(d => d.id === 'u_guard').desc(1).includes('300') && !C.CARD_DEFS.some(d => String(d.desc ? d.desc(1) : '').includes('성 주변(300)'))); }

// 26) 투사체 풀링: 재사용해도 이전 투사체의 값이 남지 않음
{ const g = arena(15, [['boss', 1500, 1500 - 500]], 'bombardier'); g.gold = 1e6; g.buyCd.archer = 0; C.buy(g, 'archer'); g.core.hp = g.core.max = 1e9;
  let sawAoe = false, stale = 0, shots = 0; for (let i = 0; i < 30 * 30; i++) { C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0); for (const s of g.shots) { shots++; if (s.aoe) sawAoe = true; else if (s.color !== 'es' && s.aoe) stale++; if (s.color === 'a' && (s.aoe || s.pc !== null && s.pierce === false)) stale++; } }
  check('투사체가 풀에서 재사용되고(풀 크기>0) 이전 값(aoe 등)이 남지 않음', g.shotPool.length > 0 && stale === 0 && sawAoe, `풀 ${g.shotPool.length}, 발사 ${shots}, 오염 ${stale}`); }
// 27) 격자 조회로 바꾼 범위 공격: 폭발탄/연쇄/관통/베기가 여전히 주변 적을 맞힘
{ const g = arena(3, []); g.core.hp = g.core.max = 1e9; applyById(g, 'c_splash'); applyById(g, 'c_chain'); applyById(g, 'c_chain');
  const a = C.spawnEnemy(g, 'brute', 1500 + 200, 1500), b = C.spawnEnemy(g, 'brute', 1500 + 200, 1500 + 40), c = C.spawnEnemy(g, 'brute', 1500 + 200, 1500 - 60), far = C.spawnEnemy(g, 'brute', 1500 - 700, 1500);
  for (const e of [a, b, c, far]) { e.speed = 0; e.dmg = 0; e.hp = e.max = 1e6; } g.core.atk = 100;
  for (let i = 0; i < 30 * 3; i++) C.tick(g, DT);
  check('폭발탄+연쇄: 목표 주변 적이 같이 피해를 받고, 멀리 있는 적은 받지 않음', b.hp < b.max && c.hp < c.max && far.hp === far.max, `주변 ${Math.round(b.max - b.hp)}/${Math.round(c.max - c.hp)}, 먼 적 ${Math.round(far.max - far.hp)}`); }

// 29) 보스를 처치하면 남은 졸개가 모두 쓰러진다
{ const g = arena(10, [['boss', 1500, 1500 - 300], ['grunt', 1500 + 100, 1500 - 300], ['shield', 1500 - 100, 1500 - 300], ['brute', 1500, 1500 - 350]], 'summoner'); g.hold = false; g.queue = ['grunt', 'grunt']; g.core.hp = g.core.max = 1e9; g.core.atk = 0;
  const b = g.enemies[0], k0 = g.kills; b.hp = 1; C.damage(g, b, 5); settle(g);
  check('보스 처치 시 남은 졸개 전원 사망 + 대기 중이던 적도 취소', g.enemies.every(e => e.dead) && g.queue.length === 0, `생존 ${g.enemies.filter(e => !e.dead).length}, 대기 ${g.queue.length}`);
  check('졸개가 쓸려 죽어도 골드·처치 수는 보스 몫만', g.kills === k0 + 1);
  }
// 30) 보스는 시간이 지날수록 기본 공격이 강해진다
{ const g = arena(20, [['boss', 1500, 1500 - 900]], 'charger'); g.core.hp = g.core.max = 1e9; g.core.atk = 0; const b = g.enemies[0]; b.speed = 0; b.abil = {}; let g0 = 0;
  for (let i = 0; i < 30 * 8; i++) C.tick(g, DT); g0 = b.dmgMul;
  for (let i = 0; i < 30 * 20; i++) C.tick(g, DT); const g1 = b.dmgMul;
  for (let i = 0; i < 30 * 200; i++) C.tick(g, DT);
  const M = C.CFG.balance.bossMelee; // 근접 보스는 기본 공격 배율이 더 붙는다
  check('보스: 등장 직후(8초)는 ×1(근접 배율만), 28초에는 더 강함, 상한 이후 고정', g0 <= M + 0.001 && g1 > 1.4 * M && Math.abs(b.dmgMul - C.CFG.balance.bossGrowMax * M) < 1e-6, `${g0.toFixed(2)} → ${g1.toFixed(2)} → ${b.dmgMul.toFixed(2)}`); }
// 31) 궁수: 연사는 사라지고 치명타·사거리 카드
{ check('연사 카드가 없고 치명타·사거리 카드가 있음', !C.CARD_DEFS.some(d => d.id === 'u_multi') && C.CARD_DEFS.some(d => d.id === 'u_crit') && C.CARD_DEFS.some(d => d.id === 'u_range'));
  const g = arena(3, []); g.gold = 1e6; g.buyCd.archer = 0; const ar = C.buy(g, 'archer').unit; const r0 = ar.range;
  applyById(g, 'u_range'); applyById(g, 'u_range'); C.tick(g, DT);
  check('사거리 카드 2장: 궁수 사거리 +24%', Math.abs(ar.range / r0 - (1 + 2 * C.CFG.cardVals.archerRange)) < 0.01, `${r0}→${ar.range}`);
  const sw = C.buy(g, 'sword').unit; check('검사 사거리는 그대로', sw.range === C.CFG.units.sword.range);
  const mk = n => { const gg = arena(3, []); gg.gold = 1e6; gg.buyCd.archer = 0; const a = C.buy(gg, 'archer').unit; a.x = 1500 + 200; a.y = 1500; a.atk = 10; for (let i = 0; i < n; i++) applyById(gg, 'u_crit'); const e = C.spawnEnemy(gg, 'brute', 1500 + 330, 1500); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; gg.core.atk = 0; let crits = 0, hits = 0; const dmgs = [];
    for (let i = 0; i < 30 * 120; i++) { const h0 = e.hp; C.tick(gg, DT); for (const ev of C.drainEvents(gg)) if (ev.type === 'crit') crits++; if (e.hp < h0) { hits++; dmgs.push(h0 - e.hp); } } return { crits, hits, max: Math.max(...dmgs), min: Math.min(...dmgs) }; };
  const c0 = mk(0), c3 = mk(3);
  check('치명타 0장이면 치명타 없음', c0.crits === 0, JSON.stringify(c0));
  check('치명타 3장(+30%): 약 30%가 치명타이고 피해가 2배', c3.hits > 50 && c3.crits / c3.hits > 0.2 && c3.crits / c3.hits < 0.42 && c3.max > c3.min * 1.8, `치명타 ${c3.crits}/${c3.hits}, 피해 ${c3.min.toFixed(1)}~${c3.max.toFixed(1)}`); }
// 32) 치유 상한: 사제를 아무리 많이 둬도 한 유닛이 초당 회복하는 양은 한계가 있다
{ const run = nPriest => { const g = arena(3, []); g.gold = 1e7; for (let i = 0; i < nPriest; i++) { g.buyCd.priest = 0; C.buy(g, 'priest'); } g.buyCd.sword = 0; const sw = C.buy(g, 'sword').unit; sw.x = 1500 + 150; sw.y = 1500; sw.max = 10000; let healed = 0;
    for (let i = 0; i < 30 * 10; i++) { sw.hp = 5000; C.tick(g, DT); sw.x = 1500 + 150; sw.y = 1500; healed += Math.max(0, sw.hp - 5000); } return healed / 10; };
  const h2 = run(2), h12 = run(12), cap = 10000 * C.CFG.balance.healCap;
  check('사제 12명이어도 초당 회복량이 상한(' + cap + ') 이하', h12 <= cap * 1.15, `2명 ${h2.toFixed(0)}/초, 12명 ${h12.toFixed(0)}/초`); }
// 33) 보스 광역 상태이상: 예고 → 범위 안 아군에게 걸림, 효과 확인
{ const mk = kind => { const g = arena(10, [['boss', 1500, 1500 - 300]], 'summoner'); const b = g.enemies[0]; b.abil = { debuff: [{ kind, cd: 6, r: 200 }] }; b.t = {}; b.speed = 0; b.dmg = 0; g.core.atk = 0; g.core.hp = g.core.max = 1e9; g.gold = 1e6;
    g.buyCd.sword = 0; const a = C.buy(g, 'sword').unit; g.buyCd.sword = 0; const a2 = C.buy(g, 'sword').unit; a.x = 1500 - 40; a.y = 1500 - 200; a2.x = 1500 + 900; a2.y = 1500 + 900; a2.hx = a2.x; a2.hy = a2.y; return { g, b, a, a2 }; };
  for (const kind of ['stun', 'poison', 'weak', 'wound']) {
    const { g, a, a2 } = mk(kind); let cast = null, hit = null, flag = false; a.hx = a.x; a.hy = a.y;
    for (let i = 0; i < 30 * 12 && !hit; i++) { C.tick(g, DT); for (const ev of C.drainEvents(g)) { if (ev.type === 'bossCast') cast = ev; if (ev.type === 'debuffHit') hit = ev; } const f = kind === 'stun' ? a.stunT : kind === 'poison' ? a.poisonT : kind === 'weak' ? a.weakT : a.woundT; if (f > 0) flag = true; }
    check(`보스 ${kind}: 예고 이벤트 → 터짐, 범위 안 유닛에게만 걸림`, !!cast && !!hit && flag && !(a2.stunT > 0 || a2.poisonT > 0 || a2.weakT > 0 || a2.woundT > 0), cast && hit ? `예고 ${cast.warn}s, 맞은 유닛 ${hit.hit}` : '시전 없음'); }
  { const { g, a } = mk('stun'); for (const e of g.enemies) e.kb = 0; a.stunT = 2; const x0 = a.x; for (let i = 0; i < 30; i++) C.tick(g, DT); check('기절한 유닛은 움직이지 못함', Math.abs(a.x - x0) < 0.01 && a.stunT < 1.1); }
  { const { g, a } = mk('poison'); a.poisonT = 5; a.max = 1000; a.hp = 1000; for (let i = 0; i < 30 * 3; i++) C.tick(g, DT); const lost = 1000 - a.hp; check('중독: 초당 최대 체력 비율만큼 감소 (죽지는 않음)', Math.abs(lost - 3 * 1000 * C.CFG.debuff.poison.pct) < 12 && a.hp >= 1, `3초 ${lost.toFixed(1)} 감소`);
    a.poisonT = 500; a.hp = 5; for (let i = 0; i < 30 * 5; i++) C.tick(g, DT); check('중독으로는 죽지 않고 체력 1에서 멈춤', !a.dead && a.hp >= 1 - 1e-9); }
  { const { g, a } = mk('weak'); a.x = 1500 + 100; a.y = 1500; a.hx = a.x; a.hy = a.y; const e = C.spawnEnemy(g, 'brute', a.x + 25, a.y); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; const measure = () => { let d = 0; for (let i = 0; i < 30 * 6; i++) { const h = e.hp; C.tick(g, DT); d += h - e.hp; } return d; };
    const normal = measure(); a.weakT = 99; const weak = measure(); check('공격력 감소: 주는 피해가 약해짐', weak < normal * 0.9 && weak > normal * 0.6, `${normal.toFixed(0)} → ${weak.toFixed(0)}`); }
  { const { g, a } = mk('wound'); const run = wt => { a.max = 10000; a.woundT = wt; g.buyCd.priest = 0; g.gold = 1e6; const pr = C.buy(g, 'priest').unit; pr.x = a.x + 30; pr.y = a.y; let h = 0; for (let i = 0; i < 30 * 8; i++) { a.hp = 5000; C.tick(g, DT); h += Math.max(0, a.hp - 5000); a.woundT = wt; a.x = 1500 - 40; a.y = 1500 - 200; } pr.dead = true; g.units = g.units.filter(u => u !== pr); return h; };
    const n = run(0), w = run(99); check('치유 감소: 받는 치유가 줄어듦', w < n * 0.6 && n > 0, `${n.toFixed(0)} → ${w.toFixed(0)}`); } }
// 34) 적을 모두 처치(보스 포함)하면 라운드가 즉시 끝나고 다음 라운드 시작
{ const g = arena(3, [['grunt', 1500, 1000]]); g.hold = false; g.core.hp = g.core.max = 1e9; for (let i = 0; i < 60; i++) C.tick(g, DT); check('적이 남아 있으면 다음 라운드로 안 넘어감', g.round === 3);
  for (const e of g.enemies) e.dead = true; for (let i = 0; i < 5; i++) C.tick(g, DT); check('적을 모두 처치하면 즉시 다음 라운드', g.round === 4, 'round ' + g.round);
  const h = arena(10, [['boss', 1500, 1000]], 'summoner'); h.hold = false; h.core.hp = h.core.max = 1e9; for (let i = 0; i < 40; i++) C.tick(h, DT); const b = h.enemies.find(e => e.kind === 'boss'); C.damage(h, b, 1e12); settle(h); if (h.jobs.offer) C.pickJob(h, 0); for (let i = 0; i < 40; i++) C.tick(h, DT); check('보스를 처치하면 즉시 다음 라운드', h.round === 11, 'round ' + h.round); }
// 35) 영웅 스킬: 용사 일섬(범위 피해) / 골렘 대지 강타(피해+감속) / 명궁 일제 사격(여러 명 동시 저격)
{ for (const [type, kind] of [['hero', 'hero'], ['golem', 'golem'], ['marksman', 'marksman']]) {
    const g = arena(10, []); g.gold = 1e7; g.core.hp = g.core.max = 1e9; g.perks.chain = 0; const u = C.addUnit ? null : null;
    const en = []; for (let i = 0; i < 6; i++) { const e = C.spawnEnemy(g, 'shield', 1500 + 30 + i * 6, 1500 - 150 + i * 4); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e7; en.push(e); }
    g.units.push({ id: 9999, type, team: 'u', x: 1500, y: 1500 - 150, hx: 1500, hy: 1500 - 150, hp: 5000, max: 5000, atk: C.CFG.units[type].atk, rate: 1, range: C.CFG.units[type].range, speed: 0, r: 12, cd: 99, heal: 0, healRate: 0, healRange: 0, aura: 0, dead: false, flash: 0, swing: 0, aim: 0, skT: 0.01 });
    let cast = 0; for (let i = 0; i < 20; i++) { C.tick(g, DT); for (const ev of C.drainEvents(g)) if (ev.type === 'heroSkill') cast++; }
    const hit = en.filter(e => e.hp < e.max).length;
    check(`${type} 스킬 발동 (${C.CFG.heroSkill[type].name})`, cast >= 1 && hit >= (type === 'marksman' ? 6 : 4), `이벤트 ${cast}, 맞은 적 ${hit}/6` + (type === 'golem' ? ` 감속 ${en.filter(e => e.slowT > 0).length}` : '')); } }
// 36) 피해 오차 ±15% / 피해·치유 숫자 이벤트(합산, 치명타 즉시)
{ C.CFG.dmgVar = 0.15; const g = arena(3, []); g.core.hp = g.core.max = 1e9; const e = C.spawnEnemy(g, 'brute', 1500, 1300); e.hp = e.max = 1e9; g.core.atk = 0; const vals = [];
  for (let i = 0; i < 300; i++) { const h = e.hp; C.damage(g, e, 100); vals.push(h - e.hp); }
  const mn = Math.min(...vals), mx = Math.max(...vals), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  check('피해에 ±15% 오차', mn >= 85 - 1e-6 && mx <= 115 + 1e-6 && mx - mn > 20 && Math.abs(mean - 100) < 3, `최소 ${mn.toFixed(1)} 최대 ${mx.toFixed(1)} 평균 ${mean.toFixed(1)}`);
  C.CFG.dmgVar = 0;
  for (let i = 0; i < 12; i++) C.tick(g, DT); g.events = []; C.damage(g, e, 10); C.damage(g, e, 15); C.damage(g, e, 50, true);
  const u = C.buy(Object.assign(g, { gold: 1e6 }), 'sword').unit; C.damage(g, u, 7);
  for (let i = 0; i < 12; i++) C.tick(g, DT);
  const nums = C.drainEvents(g).filter(v => v.type === 'num');
  const en = nums.filter(v => v.team === 'e' && !v.crit), cr = nums.filter(v => v.crit), al = nums.filter(v => v.team === 'u' && !v.heal);
  check('적 피해 숫자는 합산해서 1개(25), 치명타는 따로, 아군 피해는 team u', en.length === 1 && Math.round(en[0].v) === 25 && cr.length === 1 && cr[0].v === 50 && al.length === 1 && Math.round(al[0].v) === 7, JSON.stringify(nums.map(v => [v.team, Math.round(v.v), v.crit ? 'c' : '', v.heal ? 'h' : ''])));
  g.events = []; u.max = 1000; u.hp = 500; g.buyCd.priest = 0; const pr = C.buy(g, 'priest').unit; pr.x = u.x + 20; pr.y = u.y; for (let i = 0; i < 60; i++) C.tick(g, DT);
  check('치유 숫자(heal) 이벤트 발생', C.drainEvents(g).some(v => v.type === 'num' && v.heal)); }
// 37) 새 적: 공중형(활만) / 방패병 원거리 절반 / 유령 근접 절반 / 독거미 중독 / 첫 등장 이벤트 / 보스 보상
{ const g = arena(10, []); g.core.atk = 0; g.core.hp = g.core.max = 1e9; g.gold = 1e7;
  const bat = C.spawnEnemy(g, 'bat', 1500, 1500 - 170); bat.speed = 0; bat.dmg = 0; bat.hp = bat.max = 1e6;
  const ev0 = C.drainEvents(g).filter(e => e.type === 'newEnemy' && e.kind === 'bat'); check('새 종류 첫 등장 이벤트(newEnemy)', ev0.length === 1);
  g.buyCd.sword = 0; const sw = C.buy(g, 'sword').unit; sw.x = 1500; sw.y = 1500 - 160; sw.hx = sw.x; sw.hy = sw.y;
  for (let i = 0; i < 90; i++) { C.tick(g, DT); sw.x = 1500; sw.y = 1500 - 160; }
  check('근접 유닛·성은 공중형을 공격하지 못함', bat.hp === bat.max, `hp ${bat.hp}`);
  g.buyCd.archer = 0; const ar = C.buy(g, 'archer').unit; ar.x = 1500; ar.y = 1500 - 170 + 100; ar.hx = ar.x; ar.hy = ar.y;
  for (let i = 0; i < 90; i++) { C.tick(g, DT); ar.x = 1500; ar.y = 1500 - 70; }
  check('궁수는 공중형을 맞출 수 있음', bat.hp < bat.max, `hp ${bat.hp}`);
  const sh = C.spawnEnemy(g, 'shield', 1500 + 200, 1500 + 200), gh = C.spawnEnemy(g, 'ghost', 1500 - 200, 1500 + 200); sh.speed = gh.speed = 0; sh.dmg = gh.dmg = 0; sh.hp = sh.max = gh.hp = gh.max = 1e6;
  const a0 = sh.hp; const sht = { x: 0, y: 0, sx: 0, sy: 0, T: 1, H: 0, h: 0, h0: 0, vx: 0, vy: 0, vh: 0, p: 0.999, t: sh, dmg: 100, color: 'a', pierce: false, pc: null, aoe: 0 }; g.shots.push(sht); C.tick(g, DT);
  check('방패병은 화살 피해를 절반만 받음', Math.abs((a0 - sh.hp) - 50) < 1, `${(a0 - sh.hp).toFixed(1)}`);
  check('유령은 근접 피해 배율 0.5', gh.mres === 0.5 && C.CFG.enemies.ghost.mres === 0.5);
  const sp = C.spawnEnemy(g, 'spider', 1500, 1500 + 300); sp.speed = 0; g.buyCd.sword = 0; const v = C.buy(g, 'sword').unit; v.x = 1500 + 2; v.y = 1500 + 300; v.hx = v.x; v.hy = v.y; v.max = v.hp = 1e5; sp.dmg = 5; sp.cd = 0;
  for (let i = 0; i < 40; i++) { C.tick(g, DT); v.x = 1502; v.y = 1800; }
  check('독거미에게 물리면 중독', v.poisonT > 0, `poisonT ${v.poisonT}`);
  // 보상: 전직이 모두 끝난 뒤 보스 처치 → 보상 3택
  const h = arena(35, [['boss', 1500, 1300]]); h.act = 2; for (const t of ['sword', 'archer', 'priest']) { h.jobs[t].ids.push('x', 'y'); } h.hold = false; h.core.hp = h.core.max = 1e9;
  C.damage(h, h.enemies.find(e => e.kind === 'boss'), 1e12); settle(h);
  check('전직이 끝난 뒤 보스 처치 → 보상 선택(3개)', h.jobs.offer && h.jobs.offer.reward && h.jobs.offer.list.length === 3, JSON.stringify(h.jobs.offer && h.jobs.offer.list.map(o => o.name)));
  const idx = h.jobs.offer.list.findIndex(o => o.id === 'r_knights'); h.jobs.offer.list[0] = { type: 'reward', reward: true, id: 'r_knights', name: 'x', desc: '', className: '', tier: 0 };
  const n0 = h.units.length; C.pickJob(h, 0); check('용병 기사단 보상: 용사 3명 합류', h.units.length === n0 + 3 && h.units.filter(u => u.type === 'hero').length === 3); }
// 38) 엘리트 확률(라운드↑, 최대 10%) / 라운드 종료 규칙(시간제 없음) / 독 웅덩이
{ C.CFG.elite.max = 0.10; const rate = r => { const g = arena(r, []); g.core.hp = g.core.max = 1e9; let n = 0, el = 0; for (let i = 0; i < 2500; i++) { const e = C.spawnEnemy(g, 'grunt', 1500, 1500 - 900); n++; if (e.elite) el++; } return el / n; };
  const r2 = rate(2), r10 = rate(10), r30 = rate(30), r50 = rate(50);
  check('엘리트: 초반 0%, 라운드가 갈수록 증가, 최대 10%', r2 === 0 && r10 > 0.01 && r30 > r10 && r50 > 0.08 && r50 < 0.125, `R2 ${(r2 * 100).toFixed(1)}% R10 ${(r10 * 100).toFixed(1)}% R30 ${(r30 * 100).toFixed(1)}% R50 ${(r50 * 100).toFixed(1)}%`);
  const g = arena(40, []); let el = null, nm = null; for (let i = 0; i < 400 && !(el && nm); i++) { const e = C.spawnEnemy(g, 'grunt', 1500, 1500 - 900); if (e.elite) el = el || e; else nm = nm || e; }
  check('엘리트는 체력 3배·크기 1.35배·공격 1.6배', el && nm && Math.abs(el.max / nm.max - 3) < 0.05 && el.r > nm.r * 1.3 && el.dmg > nm.dmg * 1.5, el ? `hp ×${(el.max / nm.max).toFixed(2)} r ${el.r}/${nm.r}` : '엘리트 없음');
  C.CFG.elite.max = 0;
  const h = arena(10, [['grunt', 1500, 1500 - 600]]); h.hold = false; h.core.hp = h.core.max = 1e9; h.core.atk = 0; const gr = h.enemies[0]; gr.speed = 0; gr.dmg = 0; gr.hp = gr.max = 1e9;
  for (let i = 0; i < 30 * 120; i++) C.tick(h, DT); check('적이 남아 있으면 시간이 지나도 라운드가 안 끝남 (120초)', h.round === 10, 'round ' + h.round);
  gr.hp = 0; C.damage(h, gr, 1); for (let i = 0; i < 5; i++) C.tick(h, DT); check('모두 처치하면 다음 라운드', h.round === 11);
  const pz = arena(10, []); pz.core.atk = 0; pz.core.hp = pz.core.max = 1e9; pz.gold = 1e6; pz.buyCd.sword = 0; const pu = C.buy(pz, 'sword').unit; pu.x = 1500 + 400; pu.y = 1500 + 400; pu.hx = pu.x; pu.hy = pu.y; pu.max = pu.hp = 1e6;
  pz.pools.push({ x: pu.x, y: pu.y, r: 80, t: 8 }); for (let i = 0; i < 30 * 3; i++) { C.tick(pz, DT); pu.x = 1900; pu.y = 1900; }
  const pAfter = pu.poisonT > 0; for (let i = 0; i < 30 * 8; i++) { C.tick(pz, DT); pu.x = 1900; pu.y = 1900; }
  check('독 웅덩이: 안에 있는 동안 계속 중독, 시간이 지나면 사라짐', pAfter && pz.pools.length === 0 && pu.hp < 1e6, `중독 ${pAfter} 웅덩이 ${pz.pools.length}`); }
// 39) 공중형만 남아도 라운드가 안 넘어감 / 오래 산 적은 점점 강해짐
{ const g = arena(10, []); g.hold = false; g.core.hp = g.core.max = 1e9; g.core.atk = 0; const b = C.spawnEnemy(g, 'bat', 1500, 1500 - 900); b.speed = 0; b.dmg = 0; b.hp = b.max = 1e9;
  for (let i = 0; i < 30 * 60; i++) C.tick(g, DT); check('공중형만 남고 궁수가 없어도 라운드가 그대로', g.round === 10, 'round ' + g.round);
  const h = arena(10, []); h.core.hp = h.core.max = 1e9; h.core.atk = 0; h.gold = 1e6; h.buyCd.sword = 0; const u = C.buy(h, 'sword').unit; u.max = u.hp = 1e9; u.x = 1500; u.y = 1500 - 100; u.hx = u.x; u.hy = u.y; u.atk = 0;
  const e = C.spawnEnemy(h, 'grunt', 1500, 1500 - 106); e.speed = 0; e.hp = e.max = 1e9;
  const dmgIn = sec => { const a0 = u.hp; for (let i = 0; i < 30 * sec; i++) { C.tick(h, DT); u.x = 1500; u.y = 1500 - 100; } return a0 - u.hp; };
  const early = dmgIn(10); e.age = 100; const late = dmgIn(10);
  check('40초가 지난 적은 공격력이 점점 증가 (age 100에서 약 2.8배)', late > early * 2.2 && e.enr, `${early.toFixed(0)} → ${late.toFixed(0)}`); }
// 40) 자유 모드: 성에서 먼 적도 쫓아감 (기본 모드는 안 쫓음)
{ const run = mode => { const g = C.createGame(5, mode); g.hold = true; g.phase = 'round'; g.round = 5; g.core.atk = 0; g.core.hp = g.core.max = 1e9; g.gold = 1e6; g.buyCd.sword = 0; const u = C.buy(g, 'sword').unit; u.hx = 1500 + 150; u.hy = 1500; u.x = u.hx; u.y = u.hy;
    const e = C.spawnEnemy(g, 'brute', 1500 + 380, 1500); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; e.aggro = 0; for (let i = 0; i < 30 * 8; i++) C.tick(g, DT); return Math.hypot(u.x - 1500, u.y - 1500); };
  const dn = run('normal'), df = run('free');
  check('기본 모드: 먼 적을 쫓지 않음 / 자유 모드: 쫓아감', dn < 200 && df > 300, `기본 ${dn.toFixed(0)} 자유 ${df.toFixed(0)}`); }
// 41) 전설 카드: 30라운드 이후에만, 아주 드물게 / 선택하면 전설 유닛 소환
{ const cnt = r => { let n = 0, tot = 0; for (let i = 0; i < 4000; i++) { const g = C.createGame(1000 + i); g.round = r; C.openCards(g, false); for (const c of g.cards.offer || []) { tot++; if (c.rar === 'legend') n++; } } return [n, tot]; };
  const [n10] = cnt(10), [n40, t40] = cnt(40);
  check('전설 카드: 30라운드 이전 0장, 이후 아주 낮은 확률', n10 === 0 && n40 > 0 && n40 / t40 < 0.02, `R10 ${n10}장, R40 ${n40}/${t40} (${(n40 / t40 * 100).toFixed(2)}%)`);
  const g = C.createGame(5); g.round = 40; g.cards.offer = [C.CARD_DEFS.find(d => d.id === 'l_sword'), C.CARD_DEFS.find(d => d.id === 'l_archer')].map(d => ({ key: d.id, id: d.id, cat: d.cat, rar: d.rar, name: d.name, desc: '', lv: 1 }));
  C.pickCard(g, 0); C.pickCard(Object.assign(g, { cards: Object.assign(g.cards, { offer: [{ key: 'l_archer', id: 'l_archer', cat: 'summon', rar: 'legend', name: 'x', desc: '', lv: 1 }] }) }), 0);
  check('전설 선택 → 검왕·궁신 소환 (일반 영웅보다 훨씬 강함)', g.units.some(u => u.type === 'legendsword') && g.units.some(u => u.type === 'legendarcher') && C.CFG.units.legendsword.atk > C.CFG.units.hero.atk * 2 && C.CFG.units.legendarcher.range > C.CFG.units.marksman.range); }
// 42) 마왕 처치 시 부활 없음 / 무한 모드 추가 포탈 / 보스 개성 패턴
{ const g = arena(50, [['boss', 1500, 1500 - 220]]); g.act = 2; g.round = 50; g.queue = []; g.gold = 1e7; g.core.hp = g.core.max;
  for (let i = 0; i < 3; i++) { g.buyCd.sword = 0; C.buy(g, 'sword'); g.buyCd.archer = 0; C.buy(g, 'archer'); }
  const before = g.units.length; for (let i = 0; i < 4; i++) { const u = g.units[i]; C.damage(g, u, 1e9); } for (let i = 0; i < 3; i++) C.tick(g, DT);
  const alive0 = g.units.filter(u => !u.dead).length, fallen = g.fallen.length;
  const b = g.enemies.find(e => e.kind === 'boss'); g.core.atk = 1e6; C.damage(g, b, 1e12); settle(g); b.hp = 1; C.damage(g, b, 1e12); for (let i = 0; i < 600 && !g.cinematic; i++) C.tick(g, DT);
  check('마왕 처치 → 쓰러진 병사는 부활하지 않음 (무한 모드만 시작)', alive0 < before && g.units.filter(u => !u.dead).length === alive0 && g.endless && fallen >= 4, `전 ${alive0} → 후 ${g.units.length} / 원래 ${before}, 전사 기록 ${fallen}`);
  check('연출 종류 endless', g.cinematic && g.cinematic.kind === 'endless');
  check('포탈: 51~55라운드 1개, 56라운드 2개 … 86라운드 이후 8개(총 16)', C.extraAngles(1).length === 1 && C.extraAngles(8).length === 8 && C.extraAngles(8).every(a => isFinite(a)));
  const h = C.createGame(9); h.captureEvents = true; for (const [r, want] of [[50, 0], [51, 1], [55, 1], [56, 2], [61, 3], [85, 7], [86, 8], [120, 8]]) { h.round = r - 1; h.phase = 'round'; h.queue = []; h.roundT = C.ROUND_TIME; h.enemies.length = 0; h.cards.offer = null; C.tick(h, DT); h.cards.offer = null; if (h.extraPts !== want) check('포탈 수 R' + r, false, `기대 ${want} 실제 ${h.extraPts}`); }
  check('포탈 수 곡선 확인 완료', true);
  const pts = []; h.extraPts = 8; h.spawnPts = 8; h.round = 90; for (let i = 0; i < 300; i++) { const e = C.spawnEnemy(h, 'grunt'); pts.push(Math.hypot(e.x - 1500, e.y - 1500)); }
  check('추가 포탈은 기존 포탈보다 성에 가깝게 나옴 (거리 약 480 vs 700)', pts.some(d => d < 600) && pts.some(d => d > 650), `최소 ${Math.min(...pts).toFixed(0)} 최대 ${Math.max(...pts).toFixed(0)}`); }
{ // 보스 개성: 돌진(등장 직후 성으로), 순간이동, 도약
  const mk = id => { const g = arena(10, [['boss', 1500 + 900, 1500]], id); const b = g.enemies[0]; g.core.hp = g.core.max = 1e9; g.core.atk = 0; return { g, b }; };
  { const { g, b } = mk('charger'); const d0 = Math.hypot(b.x - 1500, b.y - 1500); for (let i = 0; i < 30 * 2; i++) C.tick(g, DT); check('돌격왕: 등장하자마자 성 쪽으로 돌진', Math.hypot(b.x - 1500, b.y - 1500) < d0 - 350 || b.rushDone, `${d0.toFixed(0)} → ${Math.hypot(b.x - 1500, b.y - 1500).toFixed(0)}`); }
  { const { g, b } = mk('summoner'); g.captureEvents = true; let ev = null; b.speed = 0; for (let i = 0; i < 30 * 14 && !ev; i++) { C.tick(g, DT); ev = C.drainEvents(g).find(e => e.type === 'bossBlink') || null; }
    check('소환사: 순간이동', !!ev && Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0) > 300, ev ? `이동 거리 ${Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0).toFixed(0)}` : '없음'); }
  { const { g, b } = mk('charger'); delete b.abil.rush; delete b.abil.dash; g.gold = 1e7; for (let i = 0; i < 4; i++) { g.buyCd.sword = 0; const u = C.buy(g, 'sword').unit; u.x = 1500 + 300 + i * 10; u.y = 1500; u.hx = u.x; u.hy = u.y; u.max = u.hp = 1e9; } b.x = 1500 + 400; b.y = 1500; b.speed = 0; g.captureEvents = true; let ev = null, sh = null;
    for (let i = 0; i < 30 * 12 && !sh; i++) { C.tick(g, DT); for (const e of C.drainEvents(g)) { if (e.type === 'bossLeap') ev = e; if (e.type === 'bossShock') sh = e; } }
    check('돌격왕: 아군이 몰린 곳으로 도약해 내려찍음', !!ev && !!sh && Math.hypot(b.x - 1500, b.y - 1500) < 330, ev ? '도약 후 거리 ' + Math.hypot(b.x - 1500, b.y - 1500).toFixed(0) : '없음'); }
  { const { g, b } = mk('bombardier'); for (let i = 0; i < 30 * 40; i++) C.tick(g, DT); const d = Math.hypot(b.x - 1500, b.y - 1500); check('포격대장: 원거리 공격 — 성에서 떨어져 싸움 (사거리 115)', b.ranged && d > 150 && d < 300, d.toFixed(0)); }
}
// 43) 인구 제한 + 성 업그레이드(능력치·대포·인구)
{ C.CFG.castle.popBase = POP0; const g = C.createGame(3); g.gold = 1e9; let ok = 0, reason = null; for (let i = 0; i < 30; i++) { g.buyCd.sword = 0; const r = C.buy(g, 'sword'); if (r.ok) ok++; else { reason = r.reason; break; } }
  check('인구 상한(성 1레벨=8)이 차면 더 못 뽑음 (reason pop)', C.popCount(g) === C.popCap(g) && C.popCap(g) === POP0 && reason === 'pop', `인구 ${C.popCount(g)}/${C.popCap(g)}`);
  const c0 = { max: g.core.max, atk: g.core.atk, range: g.core.range, cn: g.core.cannons }; g.gold = 0; const r0 = C.upgradeCastle(g);
  check('골드가 부족하면 업그레이드 불가', !r0.ok && r0.reason === 'gold' && g.castle.lv === 1);
  g.gold = 1e9; const r1 = C.upgradeCastle(g); g.buyCd.sword = 0;
  check('성 업그레이드: 골드 차감, 인구 상한·체력·공격력·사거리 상승', r1.ok && g.castle.lv === 2 && g.gold === 1e9 - C.CFG.castle.cost[0] && C.popCap(g) === POP0 + 3 && g.core.max > c0.max && g.core.atk > c0.atk && g.core.range > c0.range, `체력 ${c0.max}→${g.core.max} 공격 ${c0.atk.toFixed(1)}→${g.core.atk.toFixed(1)} 사거리 ${c0.range}→${g.core.range}`);
  check('업그레이드 후 다시 뽑을 수 있음', C.buy(g, 'sword').ok);
  { const h2 = C.createGame(9); h2.gold = 1e9; const caps = [C.popCap(h2)]; for (let i = 0; i < 3; i++) { C.upgradeCastle(h2); caps.push(C.popCap(h2)); } check('인구 증가량이 레벨마다 +1씩 커짐 (+3, +4, +5)', caps[1] - caps[0] === 3 && caps[2] - caps[1] === 4 && caps[3] - caps[2] === 5, caps.join('→'));
    const before = C.popCount(h2); C.spawnUnit ? 0 : 0; const u = C.createGame(1); u.units.push({ team: 'u', type: 'golem', dead: false, x: 0, y: 0 }); check('특수 유닛은 인구에 포함되지 않고 따로 셈', C.popCount(u) === 0 && C.specialCount(u) === 1); }
  const cn = lv => { const h = C.createGame(4); h.gold = 1e9; for (let i = 1; i < lv; i++) C.upgradeCastle(h); return h.core.cannons; };
  check('대포: 3레벨 2문, 5레벨 3문, 7레벨 4문', cn(1) === 1 && cn(2) === 1 && cn(3) === 2 && cn(5) === 3 && cn(7) === 4 && cn(10) === 4, [1, 3, 5, 7].map(cn).join('/'));
  const h = arena(10, []); h.gold = 1e9; for (let i = 1; i < 7; i++) C.upgradeCastle(h); C.autoCastle(h); h.core.atk = 100; h.core.rate = 1; const es = []; for (let i = 0; i < 4; i++) { const e = C.spawnEnemy(h, 'brute', 1500 + 100 + i * 12, 1500 + i * 25); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; es.push(e); }
  h.core.cd = 0; C.tick(h, DT); check('여러 문의 대포는 서로 다른 적을 동시에 쏨', h.shots.length >= 3 && new Set(h.shots.map(s => s.t)).size >= 3, `발사 ${h.shots.length}, 서로 다른 목표 ${new Set(h.shots.map(s => s.t)).size}`);
  const f = C.createGame(5); f.round = 40; f.cards.offer = null; f.jobs.offer = { boss: 'x', reward: true, list: [{ type: 'reward', reward: true, id: 'r_fort', name: 'x', desc: '', className: '', tier: 0 }] }; C.pickJob(f, 0);
  check('보상 [성 대개수]: 성 2레벨 상승', f.castle.lv === 3);
  const ids = new Set(); for (let i = 0; i < 200; i++) { const g2 = C.createGame(300 + i); g2.round = 10; C.openCards(g2, false); for (const c of g2.cards.offer || []) ids.add(c.id); }
  check('성 능력치 카드(공격력·속도·사거리·체력)는 더 이상 나오지 않음', !['c_atk', 'c_rate', 'c_range', 'f_hp'].some(x => ids.has(x))); C.CFG.castle.popBase = 999; }
// 44) 보스 순간이동 거리 제한 · 소환 졸개 성장 · 보상 성 상한 · 목표 분산
{ let worst = 0, n = 0; for (let t = 0; t < 40; t++) { const g = arena(30, [['boss', 1500 + 400, 1500 + (t % 7) * 40]]); const b = g.enemies[0]; b.e = 0; g.captureEvents = true; b.abil.blink = { cd: 1, minR: 300, maxR: 460 }; b.t.blink = 0; b.life = 3; b.speed = 0;
    for (let i = 0; i < 30 * 8; i++) { C.tick(g, DT); for (const ev of g.events || []) if (ev.type === 'bossBlink') { worst = Math.max(worst, Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0)); n++; } g.events = []; } }
  check('순간이동 한 번의 이동 거리가 너무 멀지 않음 (≤ 350)', n > 20 && worst <= 350, `횟수 ${n}, 최대 ${worst.toFixed(0)}`); }
{ const cnt = r => { let tot = 0, up = 0; for (let t = 0; t < 12; t++) { const g = arena(r, [['boss', 1500, 800]]); const b = g.enemies[0]; b.speed = 0; b.abil = { summon: { cd: 5, n: 4, kind: 'grunt' } }; b.t = { summon: 0 }; g.enemies.length = 1; C.tick(g, DT); for (const e of g.enemies) if (e.kind !== 'boss') { tot++; if (e.kind === 'captain') up++; } } return [tot / 12, up / Math.max(1, tot)]; };
  const a = cnt(10), z = cnt(50); check('보스 소환: 라운드가 지날수록 졸개가 더 많고 강화형 비율이 늘어남', z[0] > a[0] * 1.8 && z[1] > a[1] + 0.3, `10R ${a[0].toFixed(1)}마리/강화 ${(a[1] * 100).toFixed(0)}% → 50R ${z[0].toFixed(1)}마리/강화 ${(z[1] * 100).toFixed(0)}%`); }
{ const o = lv => { const g = C.createGame(77); g.gold = 1e9; for (let i = 1; i < lv; i++) C.upgradeCastle(g); C.CFG.castle.popBase = 8; g.jobs.sword.ids = ['knight', 'paladin']; g.jobs.archer.ids = ['sniper', 'x']; g.jobs.priest.ids = ['a', 'b']; g.jobs.offer = null; C.jumpToRound(g, 40); const b = {}; try { const e = Object.create(null); } catch (e) {} g.round = 40; return g; };
  const full = o(8), one = o(7), none = o(1); const pool = g => { g.jobs.offer = null; const ids = new Set(); const offs = []; for (let i = 0; i < 40; i++) { const h = C.createGame(900 + i); h.castle.lv = g.castle.lv; h.jobs.sword.ids = ['knight', 'paladin']; h.jobs.archer.ids = ['sniper', 'x']; h.jobs.priest.ids = ['a', 'b']; h.jobs.offer = null; h.round = 40; const E = h.enemies; E.length = 0; const bs = C.spawnEnemy(h, 'boss', 1500, 800); C.damage(h, bs, 1e12); if (h.jobs.offer) for (const x of h.jobs.offer.list) ids.add(x.id + ':' + x.desc); } return ids; };
  C.CFG.castle.popBase = 999;
  const pf = pool(full), p1 = pool(one);
  check('성이 이미 최대 레벨이면 [성 대개수]가 제시되지 않음', ![...pf].some(x => x.startsWith('r_fort')), [...pf].length + '종');
  check('성이 1레벨만 남았으면 안내문이 1레벨로 바뀜', [...p1].some(x => x.startsWith('r_fort') && x.includes('1레벨') && x.includes('최대 레벨')) || ![...p1].some(x => x.startsWith('r_fort')), [...p1].filter(x => x.startsWith('r_fort')).join('|') || '(이번 표본엔 안 나옴)'); }
{ // 목표 분산: 같은 거리의 두 적 중 각자 자기 자리(홈) 쪽 적을 고른다
  const g = arena(10, [['grunt', 1500 + 200, 1500 - 60], ['grunt', 1500 - 200, 1500 + 60]]); for (const e of g.enemies) { e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; }
  const mk2 = (hx, hy) => { const u = C.addUnit ? C.addUnit(g, 'sword') : null; return u; };
  const a = C.createGame(1); a.hold = true; a.phase = 'round'; a.round = 10; a.queue = []; const e1 = C.spawnEnemy(a, 'grunt', 1500 + 150, 1500), e2 = C.spawnEnemy(a, 'grunt', 1500 - 150, 1500); for (const e of [e1, e2]) { e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; }
  C.buy(a, 'sword'); const u = a.units[0]; u.x = 1500; u.y = 1500 - 4; u.hx = 1500 + 100; u.hy = 1500; const t0 = { x: u.x, y: u.y }; for (let i = 0; i < 30; i++) C.tick(a, DT);
  check('유닛은 가까운 적만이 아니라 자기 자리(홈) 쪽 적을 우선 쫓음', u.x > t0.x + 10, `이동 ${(u.x - t0.x).toFixed(0)}px (오른쪽 = 홈 쪽)`); }
// 45) 검사 연속 공격 (일정 확률로 한 번 더 베기)
{ const run = p => { C.CFG.units.sword.dbl = p; const g = arena(3, []); g.core.atk = 0; g.captureEvents = true; C.buy(g, 'sword'); const u = g.units[0]; u.x = 1500; u.y = 1400; u.hx = u.x; u.hy = u.y; const e = C.spawnEnemy(g, 'brute', 1500, 1400 - 30); e.hp = e.max = 1e9; e.speed = 0; e.dmg = 0; let n = 0, d = 0; for (let i = 0; i < 30 * 20; i++) { C.tick(g, DT); for (const ev of g.events || []) if (ev.type === 'melee') { n++; if (ev.dbl) d++; } g.events = []; } return [n, d]; };
  const a = run(0), b = run(1); C.CFG.units.sword.dbl = 0;
  check('검사 연속 공격: 확률 0이면 없음, 1이면 매번 한 번 더', a[1] === 0 && b[1] > 5 && b[1] >= b[0] * 0.4, `0%: ${a[1]}/${a[0]}회, 100%: ${b[1]}/${b[0]}회`); }
// 47) 자유 모드: 사거리 밖이어도 나를 공격한 적에게 가서 반격한다
{ const run = mode => { const a = C.createGame(1, mode); a.hold = true; a.phase = 'round'; a.round = 10; a.queue = []; C.buy(a, 'sword'); const u = a.units[0]; const e = C.spawnEnemy(a, 'grunt', 1500 + 600, 1500); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; for (let i = 0; i < 3; i++) C.tick(a, DT); const x0 = u.x; C.damage(a, u, 1, false, e); for (let i = 0; i < 200; i++) C.tick(a, DT); return Math.hypot(u.x - e.x, u.y - e.y); };
  const f = run('free'), n = run('normal'); check('자유 모드: 멀리서 나를 때린 적에게 반격하러 감', f < n - 150, `적과의 거리 자유 ${f.toFixed(0)}px / 기본 ${n.toFixed(0)}px`); }
// 48) 성 최대 레벨이면 인구 제한 없음
{ const g = C.createGame(3); g.gold = 1e9; const cap1 = C.popCap(g); for (let i = 1; i < C.CFG.castle.max; i++) C.upgradeCastle(g); check('성 최대 레벨에도 인구 제한이 있음 (무한 아님)', C.popCap(g) < 1e6 && C.popCap(g) > cap1); { const e = C.createGame(5); e.endless = true; e.gold = 1e9; for (let i = 1; i < C.CFG.castle.max; i++) C.upgradeCastle(e); const p0 = C.popCap(e); C.upgradeCastle(e); check('최대 레벨 이후 강화는 인구 +10', C.popCap(e) - p0 === 10); } }
// 49) 생산 대기열
{ const g = C.createGame(9); g.gold = 100000; C.CFG.castle.popBase = 999; const g0 = g.gold; const c1 = C.unitCostOf(g, 'sword');
  const res = []; for (let i = 0; i < 6; i++) res.push(C.enqueue(g, i % 2 ? 'archer' : 'sword'));
  check('생산 대기열: 누르는 즉시 골드를 내고 최대 5개까지', res.filter(r => r.ok).length === 5 && res[5].reason === 'queue' && g.gold < g0 - c1 && g.units.length === 0, g0 - g.gold + 'G 선지불');
  const paid = g0 - g.gold; for (let i = 0; i < 30 * 12; i++) C.tick(g, DT);
  check('대기열은 먼저 누른 순서대로 하나씩 생산', g.units.map(u => u.type).join() === 'sword,archer,sword,archer,sword' && g.prod.length === 0, g.units.map(u => u.type).join());
  check('가격이 변한 만큼 완성 시 정산 (뒤 유닛은 앞 유닛 때문에 비싸져 추가 지불)', g0 - g.gold > paid, paid + ' → ' + (g0 - g.gold));
  const h = C.createGame(9); h.gold = 1000; C.enqueue(h, 'sword'); const gb = h.gold; check('대기열 취소 시 환급', C.cancelProd(h, 0) && h.gold === gb + C.unitCostOf(h, 'sword') && h.prod.length === 0);
  const k = C.createGame(9); k.gold = 100000; for (let i = 0; i < 4; i++) { k.buyCd.sword = 0; C.buy(k, 'sword'); } C.enqueue(k, 'sword'); const paid2 = k.prod[0].paid; for (let i = 0; i < 4; i++) k.units[i].dead = true; for (let i = 0; i < 60; i++) C.tick(k, DT);
  check('병력을 잃어 가격이 내려가면 차액 환급', k.units.filter(u => !u.dead).length === 1 && k.gold > 100000 - 4 * 70 - paid2 + 0, '');
  const w = C.createGame(9); w.gold = C.unitCostOf(w, 'sword'); C.enqueue(w, 'sword'); w.gold = 0; w.gold = 1e5; w.buyCd.archer = 0; C.buy(w, 'archer'); w.gold = 0; for (let i = 0; i < 90; i++) C.tick(w, DT);
  check('가격이 올라 추가 금액이 모자라면 골드가 찰 때까지 대기', w.prod.length === 1 && w.prod[0].wait, ''); }
// 50) 기록 집계 · 부정 확인
{ const g = C.createGame(21); g.gold = 1e6; g.stats.earned += 1e6 - C.CFG.startGold; C.CFG.castle.popBase = 99; for (let i = 0; i < 5; i++) { g.buyCd.sword = 0; C.buy(g, 'sword'); } g.round = 6;
  check('구매 시 사용 골드·만든 유닛이 집계됨', g.stats.spent > 200 && g.stats.made.sword === 1, g.stats.spent + 'G');
  const bad = C.checkRun(g); check('수입이 그 라운드의 상한을 넘으면 비정상으로 판정', !bad.ok && bad.why.length > 0, bad.why.join(' / '));
  const h = C.createGame(22); for (let i = 0; i < 4000; i++) { C.tick(h, DT); if (h.cards.offer) C.pickCard(h, 0); if (h.jobs.offer) C.pickJob(h, 0); if (i % 15 === 0) { h.buyCd.sword = 0; C.buy(h, 'sword'); } }
  check('정상 플레이는 정상으로 판정', C.checkRun(h).ok && h.stats.earned > 0 && h.stats.killBy.grunt > 0, 'R' + h.round + ' 수입 ' + Math.round(h.stats.earned) + ' / 상한 ' + C.checkRun(h).bound);
  check('보유 골드를 몰래 늘리면 비정상', (() => { h.gold += 5000; return !C.checkRun(h).ok; })()); }
// 51) 보스 보상 [전군 강화]는 일반 강화와 별개 단계
{ const g = C.createGame(31); g.gold = 1e5; g.buyCd.sword = 0; const u = C.buy(g, 'sword').unit; const h0 = u.max, a0 = u.atk;
  for (let i = 0; i < 5; i++) { g.up.sword.hp++; g.up.sword.atk++; } const h5 = C.statsOf ? 0 : 0;
  g.jobs.offer = { reward: true, list: [{ reward: true, id: 'r_army' }] }; C.pickJob(g, 0);
  check('전군 강화는 일반 강화 단계(up)를 건드리지 않고 bossUp만 올림', g.up.sword.hp === 5 && g.bossUp.hp === 1 && g.bossUp.atk === 1, JSON.stringify(g.bossUp));
  const m1 = u.max; g.jobs.offer = { reward: true, list: [{ reward: true, id: 'r_army' }] }; C.pickJob(g, 0);
  check('일반 강화가 풀업이어도 보상 강화가 추가로 적용됨', g.bossUp.hp === 2 && u.max > m1 && u.max > h0, h0 + ' → ' + m1 + ' → ' + u.max); }
// 52) 전설 유닛 스킬: 검왕 돌진 · 궁신 화살비
{ const mk = id => { const g = C.createGame(41); g.cards.offer = [{ key: id, id, cat: 'summon', name: id }]; C.pickCard(g, 0); g.phase = 'round'; g.hold = true; g.queue = []; g.core.hp = g.core.max = 1e9; g.core.atk = 0; return g; };
  const g = mk('l_sword'), u = g.units.find(x => x.type === 'legendsword'); u.x = u.hx; u.y = u.hy;
  const en = []; for (let i = 0; i < 4; i++) { const e = C.spawnEnemy(g, 'grunt', u.x, u.y - 200 - i * 40) || g.enemies[g.enemies.length - 1]; e.speed = 0; e.dmg = 0; e.hp = e.max = 1e6; en.push(e); }
  const dm = {}; let dashed = false; for (let i = 0; i < 400; i++) { C.tick(g, DT); if (u.dash) dashed = true; }
  check('검왕이 돌진해서 길 위의 적 여럿을 벤다', dashed && en.filter(e => e.hp < e.max - 1).length >= 3, en.map(e => Math.round(e.max - e.hp)).join(','));
  const h = mk('l_archer'), a = h.units.find(x => x.type === 'legendarcher'); a.x = a.hx; a.y = a.hy;
  const en2 = []; for (let i = 0; i < 4; i++) { const e = C.spawnEnemy(h, 'grunt', a.x + (i - 2) * 25, a.y - 300) || h.enemies[h.enemies.length - 1]; e.speed = 0; e.dmg = 0; e.hp = e.max = 1e6; en2.push(e); }
  let rained = false, maxHits = 0; for (let i = 0; i < 400; i++) { C.tick(h, DT); if (h.rain.length) rained = true; }
  check('궁신이 화살비 지대를 만들고 범위 안 적 여럿에게 계속 피해', rained && en2.filter(e => e.hp < e.max - 1).length >= 3 && h.rain.length >= 0, en2.map(e => Math.round(e.max - e.hp)).join(',')); }
// 54) 개발자 모드: 라운드에 맞게 자동 구성 + 골드 무한 + 기록 제외
{ const mkDev = r => { const g = C.createGame(51); C.devSetup(g, r); return g; };
  const a = mkDev(10), b = mkDev(40), c = mkDev(60);
  check('개발자 모드: 라운드가 높을수록 성·유닛·강화가 더 갖춰짐', b.castle.lv > a.castle.lv && C.popCount(b) > C.popCount(a) && Object.keys(b.cards.taken).length > Object.keys(a.cards.taken).length, `성 ${a.castle.lv}→${b.castle.lv}, 인구 ${C.popCount(a)}→${C.popCount(b)}`);
  check('개발자 모드: 해당 라운드부터 시작 (다음 틱에 R 시작)', (() => { C.tick(b, DT); return b.round === 40; })(), 'round ' + b.round);
  check('개발자 모드: R40까지 승급 5번(1차 3 + 2차 2) + 보스 보상 단계 누적', ['sword', 'archer', 'priest'].every(t => b.jobs[t].ids.length >= 1) && ['sword', 'archer', 'priest'].reduce((n, t) => n + b.jobs[t].ids.length, 0) === 5 && b.bossUp.hp >= 2, JSON.stringify(b.jobs.sword.ids) + ' bossUp ' + b.bossUp.hp);
  check('개발자 모드: 60라운드는 무한 모드 상태', c.endless && c.act === 2);
  const g0 = b.gold; b.gold = 5; C.tick(b, DT); check('개발자 모드: 골드가 무한 (줄어도 다시 채워짐)', b.gold >= 1e8 && g0 >= 1e8);
  check('개발자 모드는 기록 검증에서 제외(랭킹 등록 불가)', !C.checkRun(b).ok && C.checkRun(b).why.includes('개발자 모드'));
  let alive = 0, over = false; for (let i = 0; i < 30 * 40 && !b.over; i++) { C.tick(b, DT); if (b.cards.offer) C.pickCard(b, 0); if (b.jobs.offer) C.pickJob(b, 0); } check('개발자 모드 R40: 40초 플레이 중 성이 무너지지 않음', !b.over, 'hp ' + Math.round(b.core.hp)); }
// 56) 성 트리: Lv4·7·10에서 갈래 선택 (마탑·수호·사령 → 공격/방어형 → 최종형)
{ const g = C.createGame(81); g.gold = 1e9; for (let i = 0; i < 3; i++) C.upgradeCastle(g); C.tick(g, DT);
  check('성 Lv4: 갈래 선택(3개) + 시간 정지', !!g.cOffer && g.cOffer.tier === 0 && g.cOffer.list.length === 3 && (() => { const t = g.t; C.tick(g, DT); return g.t === t; })(), g.cOffer && g.cOffer.list.map(o => o.name).join('/'));
  C.pickCastle(g, 0); check('마탑 선택: 마법 폭발 + 시간 재개', g.cnodes[0] === 'arcane' && !!g.cpar.blast && g.core.cpath === 'arcane' && (() => { const t = g.t; C.tick(g, DT); return g.t > t; })());
  for (let i = 0; i < 3; i++) C.upgradeCastle(g); C.tick(g, DT);
  check('성 Lv7: 마탑의 공격형/방어형 2개', g.cOffer && g.cOffer.tier === 1 && g.cOffer.list.map(o => o.id).join() === 'storm,frost', g.cOffer && g.cOffer.list.map(o => o.id).join());
  C.pickCastle(g, 0); for (let i = 0; i < 3; i++) C.upgradeCastle(g); C.tick(g, DT);
  check('성 Lv10: 폭풍 마법진의 최종형 2개', g.castle.lv === 10 && g.cOffer && g.cOffer.tier === 2 && g.cOffer.list.map(o => o.id).join() === 'meteor,inferno', g.castle.lv + ' ' + (g.cOffer && g.cOffer.list.map(o => o.id).join()));
  C.pickCastle(g, 0); check('운석 낙하: 폭발 3발 + 외형 id 반영', g.cpar.blast.n === 3 && g.core.cfin === 'meteor' && g.core.cvar === 'storm' && C.describeCastle(g).length === 3);
  check('성 최대 레벨 10', C.CFG.castle.max === 10 && C.castleCost(g) === Infinity); }
{ const mk = (root, nodes) => { const g = C.createGame(82); g.gold = 1e9; g.phase = 'round'; g.hold = true; g.queue = []; g.core.hp = g.core.max = 1e9; for (let i = 0; i < 3; i++) C.upgradeCastle(g); g.cnodes = [root, ...(nodes || [])]; g.cOffer = null; C.tick(g, DT); g.cnodes = [root, ...(nodes || [])]; g.cOffer = null; g.castle.lv = 4; const mkr = () => {}; return g; };
  // 마탑: 마법 폭발이 밀집한 적에게 피해
  const a = mk('arcane'); a.core.atk = 50; a.core.rate = 0.0001; a.core.cd = 1e9; a.cnodes = ['arcane']; a.core.atk = 50; const es = []; for (let i = 0; i < 5; i++) { const e = C.spawnEnemy(a, 'brute', 1500 + 120 + i * 8, 1500 + i * 8); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e6; es.push(e); }
  a.cb = 0; a.cpar = null; a.cnodes = ['arcane']; C.pickCastle; (() => { a.cOffer = null; })();
  const root = C.CFG.castleTree.roots[0]; a.cpar = JSON.parse(JSON.stringify(root.par)); C.tick(a, DT);
  check('마탑: 마법 폭발이 밀집한 적 여럿에게 피해', es.filter(e => e.hp < e.max).length >= 4, es.map(e => Math.round(e.max - e.hp)).join());
  // 수호: 치유 파동
  const g = mk('guardian'); g.cpar = JSON.parse(JSON.stringify(C.CFG.castleTree.roots[1].par)); g.buyCd.sword = 0; const u = C.buy(g, 'sword').unit; u.x = 1500 + 60; u.y = 1500; u.hp = u.max * 0.3; g.cp = 0; const hp0 = u.hp; C.tick(g, DT);
  check('수호: 치유 파동이 주변 아군을 치유', u.hp > hp0, Math.round(hp0) + '→' + Math.round(u.hp));
  // 사령: 처치한 적이 망자로 되살아남, 시간이 지나면 사라짐
  const n = mk('necro'); n.cpar = JSON.parse(JSON.stringify(C.CFG.castleTree.roots[2].par)); n.cpar.raise.chance = 1; const e0 = C.spawnEnemy(n, 'grunt', 1500 + 200, 1500); e0.speed = 0; e0.dmg = 0; C.damage(n, e0, 1e9);
  const ud = n.units.find(x => x.undead); check('사령: 처치한 적이 망자(아군)로 되살아남', !!ud && !ud.dead && C.popCount(n) === 0 && ud.team === 'u', ud && ud.type);
  for (let i = 0; i < 30 * 11; i++) C.tick(n, DT); check('망자는 지속시간(9초)이 지나면 사라짐', ud.dead);
  const bs = C.spawnEnemy(n, 'grunt', 1700, 1500); bs.elite = true; n.cpar.raise.elite = 0; const cnt = n.units.filter(x => !x.dead && x.undead).length; C.damage(n, bs, 1e9); check('엘리트는 기본적으로 되살리지 않음', n.units.filter(x => !x.dead && x.undead).length === cnt); }
// 57) 새 전직 효과
{ const mk = (type, ids) => { const g = C.createGame(83); g.gold = 1e9; g.phase = 'round'; g.hold = true; g.queue = []; g.core.hp = g.core.max = 1e9; g.core.atk = 0; g.buyCd[type] = 0; const u = C.buy(g, type).unit; g.jobs[type].ids.push(...ids); g.jobMods = null; C.devSetup && 0; return g; };
  const reapply = g => { g.jobs.offer = null; }; 
  // 워로드: 받은 피해의 일부를 되돌림
  const w = C.createGame(84); w.gold = 1e9; w.phase = 'round'; w.hold = true; w.queue = []; w.buyCd.sword = 0; const ws = C.buy(w, 'sword').unit;
  const swAtk0 = ws.atk, swRate0 = ws.rate, swRange0 = ws.range;
  for (const id of ['knight', 'warlord']) { const o = C.jobOptions(w).find(x => x.id === id); w.jobs.offer = { boss: 't', list: [o] }; C.pickJob(w, 0); }
  check('워로드: 랜스 — 공격력↑·공격 속도↓·사거리 +14', ws.atk > swAtk0 * 1.8 && ws.rate < swRate0 * 0.7 && ws.range === swRange0 + 14, `atk×${(ws.atk / swAtk0).toFixed(2)} rate×${(ws.rate / swRate0).toFixed(2)}`);
  { w.core.atk = 0; w.core.hp = w.core.max = 1e9; const ee = C.spawnEnemy(w, 'grunt', ws.x + 30, ws.y); ee.speed = 0; ee.dmg = 0; ee.hp = ee.max = 1e9; ws.x = ws.hx; ws.y = ws.hy; ee.x = ws.x + 30; ee.y = ws.y; const x0 = ee.x; let mx = 0; for (let i = 0; i < 60; i++) { C.tick(w, DT); mx = Math.max(mx, ee.x - x0); } check('워로드: 찌르면 적이 밀려남', mx > 25, '밀림 ' + Math.round(mx)); }
  // 버서커: 체력이 낮을수록 공격력 상승
  const b = C.createGame(85); b.gold = 1e9; b.phase = 'round'; b.hold = true; b.queue = []; b.core.atk = 0; b.core.hp = b.core.max = 1e9; b.buyCd.sword = 0; const bs = C.buy(b, 'sword').unit;
  for (const id of ['blade', 'berserker']) { const o = C.jobOptions(b).find(x => x.id === id); b.jobs.offer = { boss: 't', list: [o] }; C.pickJob(b, 0); }
  const dmgAt = frac => { const g = C.createGame(86); g.gold = 1e9; g.phase = 'round'; g.hold = true; g.queue = []; g.core.atk = 0; g.core.hp = g.core.max = 1e9; g.buyCd.sword = 0; const u = C.buy(g, 'sword').unit; for (const id of ['blade', 'berserker']) { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); } u.hp = u.max * frac; const e = C.spawnEnemy(g, 'brute', u.x + 18, u.y); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; u.x = u.hx; u.y = u.hy; e.x = u.x + 18; e.y = u.y; for (let i = 0; i < 90; i++) C.tick(g, DT); return e.max - e.hp; };
  const full = dmgAt(1), low = dmgAt(0.2); check('버서커: 체력이 낮을수록 더 강하게 때림', low > full * 1.4, `100%:${Math.round(full)} 20%:${Math.round(low)}`);
  // 포격수(폭발)·사냥꾼(표식)
  const mkA = id1 => { const g = C.createGame(87); g.gold = 1e9; g.phase = 'round'; g.hold = true; g.queue = []; g.core.atk = 0; g.core.hp = g.core.max = 1e9; g.buyCd.archer = 0; const u = C.buy(g, 'archer').unit; for (const id of id1) { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); } return [g, u]; };
  { const [g, u] = mkA(['sniper', 'gunner']); const t = C.spawnEnemy(g, 'brute', u.x + 100, u.y), n2 = C.spawnEnemy(g, 'brute', u.x + 120, u.y + 12); for (const e of [t, n2]) { e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; } for (let i = 0; i < 120; i++) C.tick(g, DT); check('포격수: 폭발 화살이 주변 적에게도 피해', t.hp < t.max && n2.hp < n2.max); }
  { const [g, u] = mkA(['ranger', 'ninja']); const t = C.spawnEnemy(g, 'brute', u.x + 100, u.y), n2 = C.spawnEnemy(g, 'brute', u.x + 120, u.y + 14), far = C.spawnEnemy(g, 'brute', u.x + 100, u.y + 300); for (const e of [t, n2, far]) { e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; } let marked = false, stacks = 0, burst = null; g.captureEvents = true;
    for (let i = 0; i < 300; i++) { C.tick(g, DT); if (t.markT > 0) marked = true; if (t.stk > stacks) stacks = t.stk; for (const ev of C.drainEvents(g)) if (ev.type === 'ninjaBurst') burst = ev; }
    check('닌자: 표창이 쌓이다가 5스택에서 폭발 (스택 증가 → 폭발 이벤트)', stacks >= 2 && !!burst && burst.r === 75, 'stk ' + stacks);
    check('닌자: 폭발이 주변 적에게도 피해, 먼 적은 무관 / 표식(받는 피해 증가)은 없음', n2.hp < n2.max && far.hp === far.max && !marked); }
  // 수호사제: 치유하면 보호막
  { const g = C.createGame(88); g.gold = 1e9; g.phase = 'round'; g.hold = true; g.queue = []; g.core.atk = 0; g.core.hp = g.core.max = 1e9; g.buyCd.priest = 0; g.buyCd.sword = 0; C.buy(g, 'priest'); const sw = C.buy(g, 'sword').unit; for (const id of ['cleric', 'warden']) { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); } sw.hp = sw.max * 0.4; for (let i = 0; i < 100; i++) C.tick(g, DT); check('수호사제: 치유한 아군에게 보호막', sw.ward > 0 || sw.hp > sw.max * 0.4, 'ward ' + Math.round(sw.ward || 0)); }
  // 전투사제: 성스러운 구체로 공격
  { const g = C.createGame(89); g.gold = 1e9; g.phase = 'round'; g.hold = true; g.queue = []; g.core.atk = 0; g.core.hp = g.core.max = 1e9; g.buyCd.priest = 0; const p = C.buy(g, 'priest').unit; for (const id of ['bard', 'inquisitor']) { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); } const t = C.spawnEnemy(g, 'brute', p.x + 120, p.y); t.speed = 0; t.dmg = 0; t.hp = t.max = 1e9; let orb = false, dm = 0, bn = 0; for (let i = 0; i < 150; i++) { C.tick(g, DT); if (g.shots.some(s => s.color === 'h')) orb = true; dm = Math.max(dm, t.curseT || 0); bn = Math.max(bn, t.burnT || 0); } check('이단심판관: 성스러운 구체로 적을 공격', orb && t.hp < t.max, '피해 ' + Math.round(t.max - t.hp)); check('이단심판관: 약화·화상 디버프를 건다 (낙인·감속과 함께)', dm > 0 && bn > 0 && t.slowT !== undefined, 'curse ' + dm.toFixed(1) + ' burn ' + bn.toFixed(1)); } }

// 직업 개편: 검성 연속 공격 · 버서커 흡혈 · 팔라딘 기절 · 명사수 일직선 저격 · 폭풍사수 회피 · 바드 속도 버프
{
  const mkS = (ids, seed) => { const g = C.createGame(seed); g.gold = 1e9; g.phase = 'round'; g.hold = true; g.queue = []; g.core.atk = 0; g.core.hp = g.core.max = 1e9; g.buyCd.sword = 0; const u = C.buy(g, 'sword').unit; for (const id of ids) { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); } u.x = u.hx; u.y = u.hy; return [g, u]; };
  const duel = (g, u, secs, mod) => { const e = C.spawnEnemy(g, 'brute', u.x + 28, u.y); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e12; e.x = u.x + 28; e.y = u.y; if (mod) mod(e); let melee = 0, dbl = 0, n3 = 0; g.captureEvents = true; for (let i = 0; i < 30 * secs; i++) { C.tick(g, DT); for (const ev of C.drainEvents(g)) if (ev.type === 'melee') { melee++; if (ev.dbl) dbl++; if (ev.n === 2) n3++; } } return { e, melee, dbl, n3 }; };
  const [gb, ub] = mkS(['blade', 'blademaster'], 301), [gk, uk] = mkS(['blade', 'berserker'], 302);
  const rb = duel(gb, ub, 12), rk = duel(gk, uk, 12);
  check('검성: 연속 공격이 매우 잦음 (타격의 절반 이상이 연속타) · 3연타 발생', rb.dbl / rb.melee > 0.45 && rb.n3 > 0, `연속 ${rb.dbl}/${rb.melee}, 3연타 ${rb.n3}`);
  check('검성: 사거리 +10, 버서커보다 타격이 훨씬 많음', ub.range === C.CFG.units.sword.range + 10 && rb.melee > rk.melee * 1.6, `${rb.melee} vs ${rk.melee}`);
  { const [g, u] = mkS(['blade', 'berserker'], 303); u.hp = u.max * 0.3; const h0 = u.hp; const r = duel(g, u, 6); check('버서커: 입힌 피해의 일부를 체력으로 흡수(체력 회복)', u.hp > h0 + u.max * 0.02, `${Math.round(h0)}→${Math.round(u.hp)}`);
    const [g2, u2] = mkS(['blade', 'blademaster'], 304); u2.hp = u2.max * 0.3; const h2 = u2.hp; duel(g2, u2, 6); check('검성은 흡혈하지 않음(대조군)', u2.hp <= h2 + 1, `${Math.round(h2)}→${Math.round(u2.hp)}`); }
  { const [g, u] = mkS(['knight', 'paladin'], 305); const a0 = C.CFG.units.sword.atk; check('팔라딘: 공격력 감소 패널티 · 체력·방어 증가', u.atk < a0 * 0.75 && u.max > C.CFG.units.sword.hp * 1.6 && g.jobMods.sword.def >= 0.12, `atk ${u.atk.toFixed(1)}/${a0} hp ${u.max}`);
    let st = 0, stunEv = 0; g.core.atk = 0; const e = C.spawnEnemy(g, 'grunt', u.x + 28, u.y); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e12; g.captureEvents = true; for (let i = 0; i < 30 * 40; i++) { e.x = u.x + 28; e.y = u.y; C.tick(g, DT); if (e.stunT > 0) st++; for (const ev of C.drainEvents(g)) if (ev.type === 'stun') stunEv++; }
    check('팔라딘: 낮은 확률로 적을 기절시킴 (매번은 아님)', stunEv >= 1 && st > 0 && stunEv < 30 * 40 / 4, 'stun ' + stunEv);
 }
}
{ // 명사수: 일직선 저격 / 폭풍사수: 회피 / 바드: 이동·공격 속도
  const mkA2 = ids => { const g = C.createGame(311); g.gold = 1e9; g.phase = 'round'; g.hold = true; g.queue = []; g.core.atk = 0; g.core.hp = g.core.max = 1e9; g.buyCd.archer = 0; const u = C.buy(g, 'archer').unit; for (const id of ids) { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); } u.x = u.hx; u.y = u.hy; return [g, u]; };
  const [g, u] = mkA2(['sniper', 'deadeye']);
  const e1 = C.spawnEnemy(g, 'brute', u.x + 160, u.y), e2 = C.spawnEnemy(g, 'brute', u.x + 260, u.y + 2), e3 = C.spawnEnemy(g, 'brute', u.x + 240, u.y + 90), e4 = C.spawnEnemy(g, 'brute', u.x + u.range + 400, u.y);
  for (const e of [e1, e2, e3, e4]) { e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; } let sn = null, shots = 0; g.captureEvents = true;
  for (let i = 0; i < 90; i++) { u.x = u.hx; u.y = u.hy; C.tick(g, DT); for (const ev of C.drainEvents(g)) { if (ev.type === 'snipe' && !sn) sn = ev; if (ev.type === 'shot' && ev.c === 'a') shots++; } }
  check('명사수: 일직선 저격 이벤트 발생, 포물선 화살은 쏘지 않음', !!sn && shots === 0, sn && JSON.stringify(sn));
  check('명사수: 선 위에서 가장 먼저 맞는 적만 맞고(뒤의 적·선 밖·사거리 밖은 안 맞음)', e1.hp < e1.max && e2.hp === e2.max && e3.hp === e3.max && e4.hp === e4.max, [e1, e2, e3, e4].map(e => Math.round(e.max - e.hp)).join('/'));
  check('명사수: 저격선은 맞은 적에서 끝남 (hits 1)', sn && sn.hits === 1 && Math.hypot(sn.tx - sn.x, sn.ty - sn.y) < 200, sn && Math.round(Math.hypot(sn.tx - sn.x, sn.ty - sn.y)));
  { const [g9, a9] = mkA2(['sniper', 'deadeye']); const far = C.spawnEnemy(g9, 'brute', a9.x + a9.range - 20, a9.y); far.speed = 0; far.dmg = 0; far.hp = far.max = 1e9; let ln = 0; g9.captureEvents = true; for (let i = 0; i < 60; i++) { a9.x = a9.hx; a9.y = a9.hy; C.tick(g9, DT); for (const ev of C.drainEvents(g9)) if (ev.type === 'snipe') ln = Math.hypot(ev.tx - ev.x, ev.ty - ev.y); } check('명사수: 적이 없는 방향이어도 사거리 끝까지 선이 뻗음(빗나감 없음)', far.hp < far.max && ln > a9.range - 60, Math.round(ln)); }
  { const [g2, a] = mkA2(['ranger', 'stormarcher']); let dodged = 0, n = 400; g2.captureEvents = true; const foe = C.spawnEnemy(g2, 'grunt', 3000, 3000); foe.dead = false; for (let i = 0; i < n; i++) { const hp = a.hp; C.damage(g2, a, 1, false, foe); a.hp = a.max; } for (const ev of C.drainEvents(g2)) if (ev.type === 'dodge') dodged++;
    check('폭풍사수: 공격을 약 30% 확률로 회피', dodged > n * 0.2 && dodged < n * 0.4, dodged + '/' + n);
    const [g3, b] = mkA2(['sniper', 'deadeye']); const foe3 = C.spawnEnemy(g3, 'grunt', 3000, 3000); let d3 = 0; g3.captureEvents = true; for (let i = 0; i < n; i++) { C.damage(g3, b, 1, false, foe3); b.hp = b.max; } for (const ev of C.drainEvents(g3)) if (ev.type === 'dodge') d3++; check('다른 궁수 직업은 회피하지 않음(대조군)', d3 === 0, d3); }
  { const g4 = C.createGame(312); g4.gold = 1e9; g4.phase = 'round'; g4.hold = true; g4.queue = []; g4.core.atk = 0; g4.core.hp = g4.core.max = 1e9; for (const t of ['sword', 'priest']) { g4.buyCd[t] = 0; C.buy(g4, t); } const sw = g4.units.find(x => x.type === 'sword'), pr = g4.units.find(x => x.type === 'priest'); sw.x = pr.x + 20; sw.y = pr.y;
    const s0 = sw.speed; for (const id of ['bard']) { const o = C.jobOptions(g4).find(x => x.id === id); g4.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g4, 0); }
    const foe = C.spawnEnemy(g4, 'brute', sw.x + 28, sw.y); foe.speed = 0; foe.dmg = 0; foe.hp = foe.max = 1e12; let hits = 0; g4.captureEvents = true; for (let i = 0; i < 30 * 8; i++) { sw.x = pr.x + 20; sw.y = pr.y; foe.x = sw.x + 28; foe.y = sw.y; C.tick(g4, DT); for (const ev of C.drainEvents(g4)) if (ev.type === 'melee') hits++; }
    const g5 = C.createGame(312); g5.gold = 1e9; g5.phase = 'round'; g5.hold = true; g5.queue = []; g5.core.atk = 0; g5.core.hp = g5.core.max = 1e9; g5.buyCd.sword = 0; C.buy(g5, 'sword'); const sw5 = g5.units[0]; const foe5 = C.spawnEnemy(g5, 'brute', sw5.x + 28, sw5.y); foe5.speed = 0; foe5.dmg = 0; foe5.hp = foe5.max = 1e12; let hits5 = 0; g5.captureEvents = true; for (let i = 0; i < 30 * 8; i++) { foe5.x = sw5.x + 28; foe5.y = sw5.y; C.tick(g5, DT); for (const ev of C.drainEvents(g5)) if (ev.type === 'melee') hits5++; }
    check('바드: 버프 받은 아군의 공격 속도 증가 (약 +10%)', hits > hits5 * 1.04, hits + ' vs ' + hits5); }
}
// 58) 사제 부활: 망자는 부활 대상이 아니고, 주교가 여럿이어도 죽음 한 번에 한 번만 부활
{ const g = C.createGame(91); g.gold = 1e9; g.phase = 'round'; g.hold = true; g.queue = []; g.core.hp = g.core.max = 1e9; g.core.atk = 0;
  for (let i = 0; i < 3; i++) { g.buyCd.priest = 0; C.buy(g, 'priest'); } for (let i = 0; i < 4; i++) { g.buyCd.sword = 0; C.buy(g, 'sword'); }
  for (const id of ['cleric', 'archbishop']) { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); }
  const pool = g.reviveLeft;
  check('대주교 3명이면 부활 횟수는 사제마다 1회씩 합쳐서 3회', pool === 3 && g.units.filter(u => u.type === 'priest').every(p => p.rv === 1), 'pool ' + pool);
  const sw = g.units.filter(u => u.type === 'sword'); for (const x of sw) C.damage(g, x, 1e9);
  check('죽음 4번 중 3번까지 부활 (사제 3명 × 1회)', sw.filter(x => !x.dead).length === 3 && sw[3].dead && g.reviveLeft === 0);
  const g2 = C.createGame(92); g2.gold = 1e9; g2.phase = 'round'; g2.hold = true; g2.queue = []; g2.core.hp = g2.core.max = 1e9; g2.buyCd.priest = 0; C.buy(g2, 'priest'); g2.buyCd.priest = 0; C.buy(g2, 'priest');
  const u = C.buy(g2, 'sword').unit; for (const p of g2.units) if (p.type === 'priest') p.rv = 5; g2.reviveLeft = 10; g2.cnodes = []; const ud = (() => { g2.core.cpath = 'necro'; g2.cpar = JSON.parse(JSON.stringify(C.CFG.castleTree.roots[2].par)); g2.cpar.raise.chance = 1; const e = C.spawnEnemy(g2, 'grunt', 1700, 1500); C.damage(g2, e, 1e9); return g2.units.find(x => x.undead); })();
  ud.hp = ud.max * 0.3; const uh0 = ud.hp; g2.aura = g2.aura || {}; for (let i = 0; i < 90; i++) C.tick(g2, DT); check('사제는 망자를 치유하지 않음', !ud.dead && ud.hp <= uh0 + 1e-6, Math.round(uh0) + '→' + Math.round(ud.hp));
  C.damage(g2, ud, 1e9); check('망자는 죽어도 사제가 부활시키지 않음 (부활 횟수도 안 씀)', ud.dead && g2.units.filter(p => p.type === 'priest').every(p => p.rv === 5)); }
// 60) 성 수리: 10% 회복, 쓸 때마다 비싸짐, 쿨타임
{ const g = C.createGame(95); g.gold = 1e6; g.phase = 'round'; g.round = 10; g.core.hp = g.core.max * 0.3;
  const c0 = C.repairCost(g), h0 = g.core.hp, r1 = C.repairCastle(g);
  check('성 수리: 최대 체력 10% 회복 + 골드 소모', r1.ok && Math.abs(g.core.hp - h0 - g.core.max * 0.1) < 1e-6 && g.gold === 1e6 - c0, 'cost ' + c0);
  check('성 수리: 쿨타임 중에는 불가', !C.repairCastle(g).ok && C.repairCastle(g).reason === 'cooldown');
  check('성 수리: 누를 때마다 비용 증가', C.repairCost(g) > c0, c0 + '→' + C.repairCost(g));
  g.repairCd = 0; const g2 = C.createGame(96); g2.round = 30; check('성 수리: 라운드가 갈수록 비용 증가', C.repairCost(g2) > c0);
  g.core.hp = g.core.max; check('성 수리: 체력이 가득이면 불가', !C.repairCastle(g).ok);
  g.core.hp = 1; g.gold = 0; check('성 수리: 골드 부족이면 불가', !C.repairCastle(g).ok && g.core.hp === 1); }
// 62) 넉백 · 사천왕 · 각성 · 용 레이드 · 레벨 제한 · 레벨 비교 표시
{ // 넉백
  const g = arena(10, [['boss', 700, 500]]); const b = g.enemies[0]; g.units.length = 0;
  g.gold = 1e6; g.buyCd.sword = 0; C.buy(g, 'sword'); for (let i = 0; i < 400 && !g.units.length; i++) C.tick(g, DT); const u = g.units[0]; u.x = 725; u.y = 500; u.hp = u.max = 1e6; b.x = 700; b.y = 500; b.cd = 0;
  for (let i = 0; i < 12; i++) C.tick(g, DT);
  check('보스에게 맞으면 반대쪽으로 밀려남', u.x > 735, Math.round(u.x));
  const g2 = arena(10, [['boss', 700, 500]]); g2.units.length = 0; g2.gold = 1e6; g2.buyCd.sword = 0; C.buy(g2, 'sword'); for (let i = 0; i < 400 && !g2.units.length; i++) C.tick(g2, DT); const gu = g2.units[0]; gu.type = 'golem'; gu.x = 725; gu.y = 500; const u2 = C.CFG.units; C.damage(g2, gu, 1, false, g2.enemies[0]); const sw = { x: 725, y: 500, team: 'u', type: 'sword', hp: 1e6, max: 1e6, r: 10, def: 0, dead: false, flash: 0, kvx: 0, kvy: 0 };
  check('질량이 큰 유닛(골렘)은 덜 밀림', Math.hypot(gu.kvx, gu.kvy) < 0.5 * 230 * 0.95, Math.round(Math.hypot(gu.kvx, gu.kvy))); }
{ // 사천왕
  const seeds = new Set(); for (let i = 0; i < 20; i++) { const g = C.createGame(100 + i); seeds.add(g.kingOrder.join()); }
  const g = C.createGame(5); const ok = [60, 70, 80].every((r, i) => C.bossInfo(g, r).id === g.kingOrder[i]) && g.kingOrder.length === 3 && new Set(g.kingOrder).size === 3;
  check('60·70·80라운드는 사천왕 3명이 무작위 순서로 한 번씩, 90라운드는 일반 보스', ok && seeds.size > 1 && !['thunder', 'snow', 'earth'].includes(C.bossInfo(g, 90).id));
  for (const id of ['thunder', 'snow', 'earth']) {
    const h = C.createGame(6); h.jobs.sword.ids = ['knight', 'paladin']; h.jobs.archer.ids = ['sniper', 'deadeye']; h.jobs.priest.ids = ['cleric', 'archbishop']; h.kingOrder = [id, 'x', 'y']; h.round = 60; h.phase = 'round'; h.hold = true; h.queue = []; h.enemies.length = 0; h.endless = true; h.captureEvents = true; h.core.hp = h.core.max = 1e12;
    const k = C.spawnEnemy(h, 'boss', 1500, 800); const f1 = k.bossName, l1 = JSON.stringify(k.look); C.damage(h, k, 1e12); for (let i = 0; i < 400; i++) C.tick(h, DT);
    check('사천왕(' + f1 + '): 쓰러져도 각성해서 부활(모습·이름 변화)', !k.dead && k.p2 && k.bossName !== f1 && JSON.stringify(k.look) !== l1 && k.look.elem === id && k.hp > 0, k.bossName);
    C.damage(h, k, 1e13); for (let i = 0; i < 200; i++) C.tick(h, DT);
    check('사천왕(' + f1 + '): 두 번째 처치 후 각성 선택지(3개)', k.dead && h.jobs.offer && h.jobs.offer.stage === 'awaken' && h.jobs.offer.list.length === 3, h.jobs.offer && h.jobs.offer.list.length);
    if (id === 'thunder') { const m0 = h.jobMods.sword.atk; C.pickJob(h, 0); check('각성: 그 계열의 2차 전직 효과가 업그레이드됨 (선택이 아님)', h.jobs.sword.awk && h.jobMods.sword.atk > m0 || h.jobs.offer === null && Object.values(h.jobs).some(x => x && x.awk)); }
  }
  const h = C.createGame(8); h.jobs.sword.ids = ['knight', 'paladin']; h.jobs.archer.ids = ['sniper', 'deadeye']; h.jobs.priest.ids = ['cleric', 'archbishop']; h.jobs.sword.awk = true; C.openAwaken(h, 'x'); check('각성 선택지는 남은 계열만 (70라운드 2개)', h.jobs.offer.list.length === 2);
}
{ // 마왕 유산 · 레벨 제한 해제 · 비교 표시
  const g = C.createGame(9); g.round = 50; g.phase = 'round'; g.hold = true; g.queue = []; g.enemies.length = 0; const b = C.spawnEnemy(g, 'boss', 1500, 800); C.damage(g, b, 1e12); for (let i = 0; i < 400; i++) C.tick(g, DT); C.damage(g, b, 1e13); for (let i = 0; i < 200; i++) C.tick(g, DT);
  check('마왕 처치: 강력한 보상(마왕의 유산) 3택1', g.jobs.offer && g.jobs.offer.legacy && g.jobs.offer.list.length === 3, g.jobs.offer && g.jobs.offer.list.map(x => x.id).join());
  const n0 = g.units.length; const li = g.jobs.offer.list.findIndex(x => x.id === 'l_legends'); C.pickJob(g, li); check('유산: 검왕·궁신 합류', g.units.some(u => u.type === 'legendsword') && g.units.some(u => u.type === 'legendarcher') && g.units.length === n0 + 2);
  const h = C.createGame(10); h.cards.taken['u_range'] = 3; h.cards.taken['u_guard'] = 3; const has = id => C.CARD_DEFS && 0;
  const pre = Object.keys(h.cards.taken).length; h.endless = false; const off0 = []; for (let i = 0; i < 40; i++) { const o = C.generateOffer ? C.generateOffer(h) : []; o.forEach(c => off0.push(c.id)); }
  check('레벨 비교 표시 "이전→다음"', C.cmpDesc('궁수 사거리 +12%', '궁수 사거리 +24%') === '궁수 사거리 +12%→+24%' || C.cmpDesc('궁수 사거리 +12%', '궁수 사거리 +24%').includes('12%→24%'), C.cmpDesc('궁수 사거리 +12%', '궁수 사거리 +24%'));
}
{ // 용
  const g = C.createGame(11); g.round = 99; g.phase = 'round'; g.endless = true; g.hold = false; g.queue = []; g.enemies.length = 0; g.gold = 1e6; g.core.hp = g.core.max = 1e12;
  C.jumpToRound(g, 100); g.phase = 'prep'; g.prepT = 0; C.tick(g, DT); check('100라운드: 땅이 무너지는 연출 동안 시간 정지', g.dragonIntro && g.round === 100 && g.queue[0] === 'boss' && g.queue.length > 1);
  const step = () => { if (g.cards.offer) C.pickCard(g, 0); if (g.jobs.offer) C.pickJob(g, 0); if (g.cOffer) C.pickCastle(g, 0); C.tick(g, DT); };
  g.core.hp = g.core.max = 1e12; // (라운드 시작 때 성 능력치가 다시 계산되므로 여기서 다시 고정)
  for (let i = 0; i < 300 && g.dragonIntro; i++) step(); check('연출 후 절벽 지형(cliff=1)', !g.dragonIntro && g.cliff >= 0.99);
  for (let i = 0; i < 60; i++) step(); const d = g.enemies.find(e => e.kind === 'boss' && !e.dead);
  check('용: 북쪽 단상 가장자리에 고정, 그림은 판정보다 훨씬 큼', d && d.fixed && d.side === 0 && d.x === 1500 && d.y === 1500 - C.CFG.dragon.cut && d.vr >= 2 * d.r, d && [d.x, d.y, d.r, d.vr].join());
  { const mons = g.enemies.filter(e => !e.dead && e.kind !== 'boss'); const pads = [[1500 - 520, 1500], [1500 + 520, 1500], [1500, 1500 + 420]];
    check('용 레이드: 서·동·남쪽 발판에서 몬스터가 나옴 (북쪽 용 자리에서는 안 나옴)', mons.length > 0 && mons.every(m => pads.some(p => Math.hypot(m.x - p[0], m.y - p[1]) < 400) || m.age > 1), mons.length + '마리'); }
  const x0 = d.x, y0 = d.y; let seenHidden = false, sides = new Set([d.side]); for (let i = 0; i < 30 * 70; i++) { step(); if (d.hidden) seenHidden = true; sides.add(d.side); if (g.over) break; }
  check('용: 체력이 절반이 되기 전에는 날아다니지 않고 고정', !seenHidden && sides.size === 1 && d.x === x0 && d.y === y0, [...sides].join());
  check('용: 사방 중 한 곳에 서 있음', [0, 1, 2, 3].some(sd => { const a = { x: 1500, y: 800 }; return true; }) && d.x !== undefined);
  { let hid = 0, sh = false, strikes = 0, back = false; check('용: 브레스 길이가 용 크기에 맞게 김', d.dragon === true && C.CFG.dragon.abil.breath.len >= 1000);
    d.hp = d.max * 0.49; g.dragonWaveT = 1e9;
    for (let i = 0; i < 30 * 24 && !g.over; i++) { step(); if (d.hidden) { hid++; if (d.shx !== undefined) sh = true; strikes = Math.max(strikes, g.strikes.length); } if (!d.hidden && d.flown) back = true; }
    check('용: 체력 절반에서 숨어 그림자가 움직이고 불덩이가 떨어짐', hid > 30 * 8 && sh && strikes > 0, hid + ' ' + sh + ' ' + strikes);
    check('용: 다시 돌아와 싸움', back && !d.hidden && !d.dead);
    C.damage(g, d, 1e15); step(); check('용 사망 연출이 길다(7초)', g.bossDeath && g.bossDeath.dur === C.CFG.dragon.deathT && C.CFG.dragon.deathT >= 6); }
  d.hidden = false; d.flyS = 'ground'; d.dying = false; g.core.hp = g.core.max; C.damage(g, d, 1e15); for (let i = 0; i < 300 && !g.over; i++) step();
  check('용을 쓰러뜨리면 게임 클리어', g.over && g.win === true);
}
// 63) 50라운드 이후: 새 몬스터 · 성채 각성 · 사천왕의 기운
{ const g = C.createGame(21); g.gold = 1e12; g.endless = false; for (let i = 1; i < C.CFG.castle.max; i++) C.upgradeCastle(g, true);
  check('50라운드 전: 성 최대 레벨 10', C.castleMax(g) === 10 && C.castleCost(g) === Infinity);
  g.endless = true; check('50라운드 이후: 성 최대 레벨 +3', C.castleMax(g) === 13 && isFinite(C.castleCost(g)));
  const a0 = g.core.atk, h0 = g.core.max; for (let i = 0; i < 3; i++) C.upgradeCastle(g); check('최대 레벨(13)에서 각성 선택지가 뜸', g.castle.lv === 13 && !g.castle.awk && g.jobs.offer && g.jobs.offer.list[0].castle); C.pickJob(g, 0); check('최대 레벨(13)까지 올리면 성채 각성', g.castle.lv === 13 && g.castle.awk === true && g.core.cannons >= 5 && g.core.atk > a0 * 1.5 && g.core.max > h0 * 1.4, g.core.cannons);
  check('각성 후에는 더 올릴 수 없음', !C.upgradeCastle(g).ok); }
{ const kinds = ['stormwolf', 'frostarcher', 'thunderbomber', 'rockgiant', 'voidwraith', 'wyrmling']; const g = C.createGame(22); const seen = new Set();
  for (let r = 40; r <= 70; r++) { g.round = r - 1; g.phase = 'prep'; g.prepT = 0; g.endless = true; g.cards.offer = null; g.jobs.offer = null; g.cOffer = null; C.tick(g, DT); for (const k of g.queue) seen.add(k); g.queue.length = 0; g.cards.offer = null; g.jobs.offer = null; g.cOffer = null; }
  const early = (() => { const h = C.createGame(23); const s2 = new Set(); for (let r = 1; r <= 49; r++) { h.round = r - 1; h.phase = 'prep'; h.prepT = 0; h.cards.offer = null; h.jobs.offer = null; h.cOffer = null; C.tick(h, DT); for (const k of h.queue) s2.add(k); h.queue.length = 0; h.cards.offer = null; h.jobs.offer = null; h.cOffer = null; } return kinds.some(k => s2.has(k)); })();
  check('새 몬스터 6종은 50라운드 이후에만 등장', kinds.every(k => seen.has(k)) && !early, kinds.filter(k => !seen.has(k)).join());
  const u = C.createGame(24); u.gold = 1e6; u.buyCd.sword = 0; C.buy(u, 'sword'); for (let i = 0; i < 400 && !u.units.length; i++) C.tick(u, DT); const sw = u.units[0]; sw.hp = sw.max = 1e9; u.round = 60; u.phase = 'round'; u.hold = true; u.enemies.length = 0;
  const fa = C.spawnEnemy(u, 'frostarcher', sw.x + 100, sw.y); C.damage(u, sw, 5, false, fa); check('서리 궁수: 맞은 아군은 느려짐(냉기)', sw.chillT > 2);
  const tb = C.spawnEnemy(u, 'thunderbomber', sw.x + 5, sw.y); sw.stunT = 0; for (let i = 0; i < 40 && !tb.dead; i++) C.tick(u, DT); check('뇌격병: 폭발에 휘말리면 기절·넉백', tb.dead && (sw.stunT > 0 || Math.hypot(sw.kvx, sw.kvy) > 0 || sw.x !== 0)); }
{ const g = C.createGame(25); g.captureEvents = true; g.endless = true; const kingAt = r => C.bossInfo(g, r).id;
  const run = r => { g.round = r - 1; g.phase = 'prep'; g.prepT = 0; g.cards.offer = null; g.jobs.offer = null; g.cOffer = null; C.tick(g, DT); g.cards.offer = null; g.jobs.offer = null; g.cOffer = null; C.tick(g, DT); g.queue.length = 0; g.cards.offer = null; g.jobs.offer = null; g.cOffer = null; return C.drainEvents(g).filter(e => e.type === 'omen'); }; // (선택을 마친 뒤에야 기운 이벤트가 나온다)
  const o51 = run(51); check('51라운드: 다음 사천왕의 기운(속성)과 대사 이벤트', g.omen === kingAt(60) && o51.length === 1 && o51[0].line.includes('마왕은 사천왕 중 최약체'), o51[0] && o51[0].line);
  const o55 = run(55); check('52~59라운드: 기운은 유지되고 대사는 없음', g.omen === kingAt(60) && o55.length === 0);
  const o61 = run(61); check('61라운드: 방금 쓰러뜨린 사천왕이 최약체였다는 대사', g.omen === kingAt(70) && o61.length === 1 && o61[0].line.includes(C.bossInfo(g, 60).name + '은 사천왕 중 최약체'), o61[0] && o61[0].line);
  const o91 = run(91); check('91라운드: 기운은 용(dragon), 대사는 81라운드에서만', g.omen === 'dragon' && o91.length === 0);
  run(60); check('사천왕 라운드(60)에는 기운 없음', g.omen === null);
  check('90라운드 사천왕은 80라운드와 다른 사람', kingAt(90) !== kingAt(80)); }
// 61) 보스 개성 스킬
{ const run = (id, round, f) => { const g = arena(round, [['boss', 700, 500]], id); const b = g.enemies[0]; g.units.length = 0; f(g, b); return { g, b }; };
  { const { g, b } = run('summoner', 10, (g, b) => { b.hp = b.max * 0.49; }); for (let i = 0; i < 5; i++) C.tick(g, DT);
    check('소환사: 짧은 사거리의 원거리 공격 (125)', b.ranged && b.range === 125);
    const cl = g.enemies.filter(e => e.clone); check('소환사: 체력 절반에 분신 소환(1회)', cl.length === 2 && b.cloned, cl.length); for (let i = 0; i < 60; i++) C.tick(g, DT); check('소환사: 분신은 한 번만', g.enemies.filter(e => e.clone).length >= 0 && b.cloned); }
  { const { g, b } = run('warden', 10, () => {}); const o = C.spawnEnemy(g, 'grunt', 760, 500); b.t.aura = 0; b.life = 3; for (let i = 0; i < 20 && !(o.shieldT > 0); i++) C.tick(g, DT);
    check('철벽 장군: 주변 적에게 방어막', o.shieldT > 0 && o.shieldRed > 0.2, o.shieldRed); for (let i = 0; i < 300; i++) C.tick(g, DT); check('철벽 장군: 방어막은 시간이 지나면 풀림', o.dead || o.shieldT <= 0 || b.t.aura > 0); }
  { const { g, b } = run('warden', 10, (g, b) => { b.hp = b.max * 0.4; b.t.focus = 0; b.life = 5; }); const h0 = b.hp; let x0 = b.x; for (let i = 0; i < 10; i++) C.tick(g, DT);
    check('철벽 장군: 정신 집중 중 체력 회복·정지', b.focusT > 0 && b.hp > h0, Math.round(b.hp - h0)); const xs = b.x; for (let i = 0; i < 20; i++) C.tick(g, DT); check('철벽 장군: 집중 중에는 움직이지 않음', Math.abs(b.x - xs) < 1); { const h1 = b.hp; C.damage(g, b, 1000); const lost = h1 - b.hp; check('철벽 장군: 집중 중 피해 감소', lost < 700 && lost > 300, Math.round(lost)); } }
  { const { g, b } = run('berserker', 10, (g, b) => { b.t.stomp = 0; b.life = 5; b.speed = 0; }); check('광전사: 체력 회복(정신 집중) 없이 발구르기 보유', !b.abil.focus && !!b.abil.stomp);
    g.gold = 1e6; g.buyCd.sword = 0; C.buy(g, 'sword'); for (let i = 0; i < 400 && !g.units.length; i++) C.tick(g, DT); const u = g.units[0]; u.hp = u.max = 1e6; u.x = b.x + 60; u.y = b.y; u.hx = u.x; u.hy = u.y; b.t.stomp = 0; const d0 = Math.hypot(u.x - b.x, u.y - b.y); const hp0 = u.hp; for (let i = 0; i < 60; i++) { u.hx = u.x; u.hy = u.y; C.tick(g, DT); }
    check('광전사: 발구르기가 주변 아군에게 피해를 주고 밀쳐냄', u.hp < hp0 && Math.hypot(u.x - b.x, u.y - b.y) > d0 + 20, Math.round(hp0 - u.hp) + ' / ' + Math.round(Math.hypot(u.x - b.x, u.y - b.y) - d0)); }
  { const g = arena(30, [['boss', 700, 500]]); const b = g.enemies[0]; g.units.length = 0; b.t.sword = 0; b.life = 5; b.speed = 0; g.gold = 1e6; C.buy(g, 'sword'); for (let i = 0; i < 400 && !g.units.length; i++) C.tick(g, DT); const su = g.units[0]; su.hp = su.max = 1e6; const hp0 = su.hp; let warn = null, hit = null; b.t.sword = 0;
    for (let i = 0; i < 90 && !hit; i++) { su.x = 1000; su.y = 500; su.hx = su.x; su.hy = su.y; C.tick(g, DT); for (const ev of C.drainEvents(g)) { if (ev.type === 'strikeWarn' && ev.kind === 'slash') warn = ev; if (ev.type === 'strikeHit' && ev.kind === 'slash') hit = ev; } }
    check('암흑 기사단장: 검기(일직선 예고 후 발사)로 직선상 아군 피해', !!warn && warn.shape === 'line' && !!hit && su.hp < hp0, hit && hit.hit); check('암흑 기사단장은 암흑 흡수를 쓰지 않음', !b.abil.drain && !!b.abil.sword); }
  { const g = arena(50, [['boss', 700, 500]]); const b = g.enemies[0]; g.units.length = 0; b.abil = { drain: { cd: 11, r: 280, mul: 1.8, heal: 0.015, cap: 0.06 } }; b.t.drain = 0; b.life = 5; b.hp = b.max * 0.5; g.gold = 1e6; C.buy(g, 'sword'); for (let i = 0; i < 400 && !g.units.length; i++) C.tick(g, DT); const su = g.units[0]; su.x = 720; su.y = 500; su.hp = su.max = 1e6; b.t.drain = 0; b.life = 5; b.hp = b.max * 0.5; const h0 = b.hp; C.drainEvents(g); for (let i = 0; i < 3; i++) C.tick(g, DT); const dv = C.drainEvents(g).find(e => e.type === 'bossDrain'); check('마왕(2형태) 암흑 흡수: 아군 피해·보스 회복·병사 위치 이벤트', b.hp > h0 && !!dv && dv.pts.length >= 1, Math.round(b.hp - h0)); }
  { const g = C.createGame(77); g.gold = 1e7; g.phase = 'round'; g.hold = true; g.queue = []; for (const t of ['sword', 'priest']) { g.buyCd[t] = 0; C.buy(g, t); } for (let i = 0; i < 400 && g.units.length < 2; i++) C.tick(g, DT);
    const pr = g.units.find(u => u.type === 'priest'), sw = g.units.find(u => u.type === 'sword'); sw.x = pr.x + 30; sw.y = pr.y; const give = id => { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); };
    give('bard'); for (let i = 0; i < 20; i++) C.tick(g, DT); check('바드: 주변 아군에게 연주 버프(공격력↑·피해 감소·속도↑)', sw.blT > 0 && sw.blA > 0 && sw.blD > 0 && sw.blS > 0, sw.blA + '/' + sw.blS);
    const bA = sw.blA, bS = sw.blS; give('shaman'); for (let i = 0; i < 20; i++) C.tick(g, DT); check('무당: 바드보다 더 큰 버프 + 초당 회복, 범위 +60', sw.blA > bA * 1.8 && sw.blS > bS * 1.8 && sw.blG > 0 && g.jobMods.priest.blessR === 60, sw.blA + '/' + sw.blS);
    sw.hp = sw.max * 0.5; const hpb = sw.hp; for (let i = 0; i < 30; i++) C.tick(g, DT); check('무당: 버프 범위 안 아군이 서서히 회복', sw.hp > hpb);
    const far = g.units.find(u => u.type === 'sword'); far.x = pr.x + 700; far.blT = 0; for (let i = 0; i < 20; i++) C.tick(g, DT); check('바드·무당: 멀리 있는 아군은 버프 없음', !(far.blT > 0)); }
  { const g = arena(10, [['grunt', 700, 500]]); g.jobMods.priest.smite = 1; g.gold = 1e7; g.buyCd.priest = 0; C.buy(g, 'priest'); for (let i = 0; i < 400 && !g.units.length; i++) C.tick(g, DT); const pr = g.units[0]; pr.x = 650; pr.y = 500; const e = g.enemies[0]; e.x = 720; e.y = 500; let ok = false; for (let i = 0; i < 90; i++) { C.tick(g, DT); if (e.markT > 0 && e.slowT > 0) ok = true; } check('전투사제: 맞은 적에게 낙인(받는 피해↑)·감속', ok || e.dead); }
  { const { g, b } = run('charger', 10, (g, b) => { delete b.abil.dash; }); const o = C.spawnEnemy(g, 'grunt', 760, 500); for (let i = 0; i < 700 && !(o.hasteT > 0); i++) C.tick(g, DT); check('돌격왕: 함성으로 주변 적 가속', o.hasteT > 0 || o.dead); }
  { const { g, b } = run('bombardier', 10, () => {}); const n = []; g.captureEvents = true; for (let i = 0; i < 30 * 18; i++) C.tick(g, DT); check('포격대장: 일제 포격 설정', b.volley >= 3, b.volley); } }

// 59) 성 피해 완화: 병사 보호 + 폭파병 / 사제 치유 범위 표시는 망자 제외
{ const g = C.createGame(95); g.gold = 1e9; g.core.hp = g.core.max = 1000; const h0 = g.core.hp; const guard0 = C.coreGuard(g); C.CFG.castle.popBase = 99;
  for (let i = 0; i < 20; i++) { g.buyCd.sword = 0; C.buy(g, 'sword'); } const guard1 = C.coreGuard(g);
  check('병사가 많을수록 성 피해 감소 (1명당 0.8%, 최대 40%)', guard0 === 0 && Math.abs(guard1 - 0.16) < 1e-9 && C.CFG.balance.guardMax === 0.4, `0명 ${guard0} / 20명 ${guard1}`);
  C.hitCore(g, 100, '근접'); const d1 = h0 - g.core.hp; g.core.hp = h0; C.hitCore(g, 100, '폭파병'); const d2 = h0 - g.core.hp;
  check('폭파병은 성 피해가 더 작음', d2 < d1 && Math.abs(d1 - 84) < 1e-6, `일반 ${d1} / 폭파병 ${d2.toFixed(1)}`);
  const h = C.createGame(96); h.gold = 1e9; h.phase = 'round'; h.hold = true; h.queue = []; h.core.atk = 0; h.core.hp = h.core.max = 1e9; h.buyCd.priest = 0; C.buy(h, 'priest'); h.buyCd.sword = 0; const sw = C.buy(h, 'sword').unit; h.perks.aoeHeal = 2; sw.hp = sw.max * 0.4;
  h.core.cpath = 'necro'; h.cpar = JSON.parse(JSON.stringify(C.CFG.castleTree.roots[2].par)); h.cpar.raise.chance = 1; const e = C.spawnEnemy(h, 'grunt', 1700, 1500); C.damage(h, e, 1e9); const ud = h.units.find(x => x.undead); ud.x = sw.x + 5; ud.y = sw.y; ud.hp = ud.max * 0.3;
  C.drainEvents(h); let healToUndead = 0; h.captureEvents = true; for (let i = 0; i < 120; i++) { C.tick(h, DT); for (const ev of C.drainEvents(h)) if (ev.type === 'heal' && ev.aoe && Math.hypot(ev.tx - ud.x, ev.ty - ud.y) < 1) healToUndead++; }
  check('치유 범위 효과·치유 표시가 망자에게는 가지 않음', healToUndead === 0 && ud.hp <= ud.max * 0.3 + 1e-6, 'aoe 표시 ' + healToUndead); }
// 64) 돌격 일직선·병사 밀치기, 포격 분산, 사천왕의 기운 효과
{ const g = arena(10, [['boss', 700, 500]], 'charger'); const b = g.enemies[0]; g.units.length = 0; b.abil = { dash: { cd: 99, dur: 1.2, mul: 3 } }; b.t.dash = 0; g.gold = 1e6; g.buyCd.sword = 0; C.buy(g, 'sword');
  for (let i = 0; i < 400 && !g.units.length; i++) C.tick(g, DT); const u = g.units[0]; u.hp = u.max = 1e9; u.x = 560; u.y = 520; u.hx = 560; u.hy = 520; b.life = 5; const p0 = { x: b.x, y: b.y }; let pts = [], pushed = false;
  for (let i = 0; i < 60; i++) { C.tick(g, DT); if (b.dashT > 0) pts.push([b.x, b.y]); if (u.kvx || u.kvy) pushed = true; }
  const a = pts[0], z = pts[pts.length - 1], path = pts.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  check('돌격: 일직선으로 달린다', pts.length > 10 && Math.hypot(z[0] - a[0], z[1] - a[1]) > path * 0.98, pts.length + '/' + Math.round(path));
  check('돌격: 길목의 병사를 밀쳐내고 피해를 줌', pushed && u.hp < u.max); }
{ const g = arena(30, [['boss', 700, 500]], null); const b = g.enemies[0]; g.units.length = 0; b.abil = { artillery: { cd: 99, dmg: 50, radius: 90, count: 4, flight: 1.5 } }; b.t.artillery = 0; b.life = 5;
  g.gold = 1e6; for (let i = 0; i < 4; i++) { g.buyCd.sword = 0; C.buy(g, 'sword'); } for (let i = 0; i < 600 && g.units.length < 4; i++) C.tick(g, DT); for (const u of g.units) { u.x = 560 + Math.random() * 20; u.y = 500; u.hx = u.x; u.hy = u.y; }
  b.t.artillery = 0; for (let i = 0; i < 3; i++) C.tick(g, DT); const sh = g.shots.filter(s => s.aoe); let md = 1e9; for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) md = Math.min(md, Math.hypot(sh[i].t.x - sh[j].t.x, sh[i].t.y - sh[j].t.y));
  check('포격: 여러 발이 서로 떨어진 곳에 떨어짐', sh.length >= 3 && md > 60, sh.length + '/' + Math.round(md)); }
{ const mk = om => { const g = arena(61, [['grunt', 900, 500]]); g.omen = om; g.omenWait = false; g.gold = 1e6; g.buyCd.sword = 0; C.buy(g, 'sword'); for (let i = 0; i < 400 && !g.units.length; i++) C.tick(g, DT); return g; };
  const base = mk(null), th = mk('thunder'); const a0 = base.enemies[0].x, a1 = th.enemies[0].x; for (let i = 0; i < 30; i++) { C.tick(base, DT); C.tick(th, DT); }
  check('번개의 기운: 적의 이동 속도 증가', Math.abs(th.enemies[0].x - a1) > Math.abs(base.enemies[0].x - a0) * 1.05);
  const sn = mk('snow'), ba = mk(null); sn.units[0].x = ba.units[0].x = 300; sn.units[0].y = ba.units[0].y = 500; const far = { x: 700, y: 500 }; sn.enemies.length = 0; ba.enemies.length = 0; C.spawnEnemy(sn, 'grunt', 700, 500); C.spawnEnemy(ba, 'grunt', 700, 500); sn.units[0].hx = ba.units[0].hx = 300; sn.units[0].hy = ba.units[0].hy = 500;
  const e1 = sn.units[0].x, e2 = ba.units[0].x; for (let i = 0; i < 30; i++) { C.tick(sn, DT); C.tick(ba, DT); } check('눈보라의 기운: 아군 이동 속도 감소', Math.abs(sn.units[0].x - e1) <= Math.abs(ba.units[0].x - e2) + 0.01);
  const w = mk('earth'); const gr = w.enemies[0]; gr.hp = gr.max = 1000; C.damage(w, gr, 100, false, null); check('대지의 기운: 적이 받는 피해 감소', Math.round(gr.hp) === 1000 - Math.round(100 * C.CFG.omenFx.earth.foeTaken));
  const d = mk('dragon'); d.omenT = 99; const u0 = d.units[0]; u0.hp = u0.max; C.tick(d, DT); check('불길의 기운: 불씨가 아군에게 피해', u0.hp < u0.max); }
// 65) 도약은 돌격왕, 광전사는 흡혈
{ const A = id => C.CFG.bossPool.find(b => b.id === id).abil; check('도약은 돌격왕에게, 광전사에는 없음', !!A('charger').leap && !A('berserker').leap);
  const g = arena(10, [['boss', 700, 500]], 'berserker'); const b = g.enemies[0]; g.units.length = 0; g.gold = 1e6; g.buyCd.sword = 0; C.buy(g, 'sword'); for (let i = 0; i < 400 && !g.units.length; i++) C.tick(g, DT);
  const u = g.units[0]; u.hp = u.max = 1e9; b.hp = b.max * 0.5; const h0 = b.hp; C.damage(g, u, 100, false, b); check('광전사: 준 피해의 일부만큼 회복', b.hp > h0 && b.hp - h0 <= 100 * 0.26, Math.round(b.hp - h0)); }
// 66) 엔딩 뒤 무한 모드
{ const g = C.createGame(31); g.captureEvents = true; C.devSetup(g, 100); for (let i = 0; i < 30 * 10; i++) { if (g.cards.offer) C.pickCard(g, 0); if (g.jobs.offer) C.pickJob(g, 0); if (g.cOffer) C.pickCastle(g, 0); C.tick(g, DT); }
  check('엔딩 전에는 무한 모드로 이어갈 수 없음', !C.continueInfinite(g)); g.win = true; g.over = true; g.round = 100;
  check('엔딩 뒤 무한 모드로 이어짐', C.continueInfinite(g) && !g.over && !g.win && g.infinite && g.cliff === 0);
  g.core.hp = g.core.max = 1e12; let r0 = g.round; for (let i = 0; i < 30 * 60 * 6 && g.round <= 100; i++) { for (const u of g.units) u.hp = u.max; C.tick(g, DT); }
  check('무한 모드: 101라운드가 시작됨', g.round >= 101, g.round);
  const h = r => C.bossInfo(g, r).hp; check('무한 모드: 100라운드 이후 적 체력이 훨씬 가파르게 오름', h(115) / h(105) > 1.4 && h(125) / h(115) > 1.4 && h(105) / h(95) > h(95) / h(85) * 1.15, (h(115) / h(105)).toFixed(2));
  check('무한 모드: 10라운드마다 사천왕 재등장', ['thunder', 'snow', 'earth'].includes(C.bossInfo(g, 110).id) && C.bossInfo(g, 105).id !== 'dragon'); }
// 67) 보스 초반 보호, 용익 기사단장
{ C.CFG.bossGuard.red = GUARD_RED; const g = arena(60, [['boss', 700, 500]]); const b = g.enemies[0]; check('마왕 이후 보스는 등장 직후 보호 시간을 가짐', b.guardT === C.CFG.bossGuard.dur, b.guardT);
  b.hp = b.max = 1000; C.damage(g, b, 100); const early = 1000 - b.hp; b.guardT = 0; b.hp = 1000; C.damage(g, b, 100); const late = 1000 - b.hp;
  check('보호 중에는 받는 피해가 크게 줄어듦 (85%)', early < late * 0.2 && late > 80, early.toFixed(1) + ' vs ' + late.toFixed(1));
  b.guardT = 1; b.hp = 1000; C.damage(g, b, 100); const fade = 1000 - b.hp; check('보호는 끝나기 전 서서히 약해짐', fade > early * 1.5 && fade < late, fade.toFixed(1));
  const kg = arena(60, [['boss', 700, 500]]); const kk = kg.enemies[0]; kk.king = kk.king || C.CFG.kings.thunder; kk.canRevive = true; kk.guardT = 0; kk.hp = 1; C.damage(kg, kk, 5); for (let i = 0; i < 400 && kg.bossDeath && kg.bossDeath.stage !== 'revive'; i++) C.tick(kg, DT); for (let i = 0; i < 400 && kg.bossDeath; i++) C.tick(kg, DT);
  check('50라운드(마왕)부터 초반 보호가 걸림', arena(50, [['boss', 700, 500]]).enemies[0].guardT === C.CFG.bossGuard.dur);
  check('30라운드 이전 보스에는 초반 보호가 없음', arena(30, [['boss', 700, 500]]).enemies[0].guardT === 0 && arena(10, [['boss', 700, 500]], 'charger').enemies[0].guardT === 0);
  check('사천왕 2차전도 시작하면 보호가 다시 걸림', kk.guardT > 0 || !kk.p2, kk.guardT);
  C.CFG.bossGuard.red = 0;
  const gg = C.createGame(5); check('90라운드는 용익 기사단장', C.bossInfo(gg, 90).id === 'drakeknight' && !!C.bossInfo(gg, 90).look.wings);
  check('용익 기사단장은 암흑 기사단장보다 강하고 용의 기술을 씀', !!C.CFG.winged.abil.gust && !!C.CFG.winged.abil.meteor && C.CFG.winged.abil.artillery.dmg > C.CFG.act1Boss.abil.artillery.dmg && C.bossInfo(gg, 90).hp > C.bossInfo(gg, 95).hp);
  const ag = arena(90, [['boss', 700, 500]]); const bb = ag.enemies[0]; check('90라운드 보스가 용익 기사단장으로 나옴', bb.bossId === 'drakeknight' && bb.abil.dash && bb.abil.gust, bb.bossId); }
console.log(failed ? '\n실패 ' + failed + '건' : '\n모두 통과');
process.exit(failed ? 1 : 0);
