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
check('한 유닛을 뽑으면 모든 유닛 종류의 가격이 오름', ['sword', 'archer', 'priest'].every(t => C.unitCostOf(S, t) > base[t]), JSON.stringify(base) + '→' + ['sword', 'archer', 'priest'].map(t => C.unitCostOf(S, t)));
check('가격 = 기본가 × 상승배율^뽑은 수', C.unitCostOf(S, 'archer') === Math.round(C.CFG.units.archer.cost * Math.pow(C.CFG.economy.costGrowth, 1)));
S.buyCd.sword = 0; S.buyCd.archer = 0;
const g0 = S.gold; C.buy(S, 'archer');
check('골드 차감과 구매 횟수 증가', S.gold === g0 - Math.round(C.CFG.units.archer.cost * C.CFG.economy.costGrowth) && S.buyCount === 2, 'buyCount=' + S.buyCount);
let many = C.createGame(2); many.gold = 1e9; let cnt = 0; for (let i = 0; i < 200; i++) { many.buyCd.sword = 0; if (C.buy(many, 'sword').ok) cnt++; }
check('(테스트 설정) 인구 상한을 크게 하면 200명도 뽑힘', cnt === 200 && many.units.length === 200, cnt + '명');
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
check('1라운드: 유닛 없이도 성채가 버티고 처치 골드를 얻음', S.core.hp > 0 && S.kills > 0 && S.gold > C.CFG.startGold, `처치 ${S.kills}, 골드 ${Math.round(S.gold)}, 성채 ${Math.round(S.core.hp)}`);
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
  check(`R${r} 보스 체력(절반 적용)/패턴`, b && b.max === Math.round(info.hp * C.CFG.balance.enemyHp) && Object.keys(b.abil).length >= 1, b && (b.bossName + ' hp=' + b.max + ' 패턴=' + Object.keys(b.abil).join(',')));
}
{ const g = C.createGame(77); g.captureEvents = true; g.round = 3; g.phase = 'round'; g.queue = []; g.roundT = C.ROUND_TIME; /* 4라운드가 시작될 때 다음(5라운드) 보스를 예고 */ C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0);
  check('보스 전 라운드(4라운드 시작)에 다음 라운드 보스 예고 알림', C.drainEvents(g).some(e => e.type === 'notice' && e.text.includes(C.bossInfo(g, 5).name))); }

// 11) 새 적의 행동
function arena(round, kinds, bossId) { const g = C.createGame(500 + round); g.hold = true; g.captureEvents = true; g.round = round; g.phase = 'round'; g.roundT = 0; g.queue = []; g.spawnPts = 4; if (bossId) { const idx = C.CFG.bossPool.findIndex(b => b.id === bossId), slot = round / 5 - 1, cur = g.bossOrder.indexOf(idx); if (cur >= 0) [g.bossOrder[slot], g.bossOrder[cur]] = [g.bossOrder[cur], g.bossOrder[slot]]; /* 이 라운드의 보스를 지정 */ } for (const [k, x, y] of kinds) C.spawnEnemy(g, k, x, y); return g; }
{ // 사수: 성채에서 멀리 떨어져 포물선 화살로 성채를 맞힌다
  const g = arena(5, [['archer', 1500, 1500 - 450]]); let arrow = null, hmax = 0, hp0 = g.core.hp, minD = 1e9; g.core.atk = 0; const ar0 = g.enemies[0];
  for (let i = 0; i < 30 * 40; i++) { C.tick(g, DT); minD = Math.min(minD, Math.hypot(ar0.x - 1500, ar0.y - 1500)); for (const s of g.shots) if (s.color === 'ea') { arrow = s; hmax = Math.max(hmax, s.h); } }
  check('사수는 멀리서 쏴서 성채를 맞힘 (근접 안 함)', arrow !== null && g.core.hp < hp0, `성채 ${Math.round(hp0)}→${Math.round(g.core.hp)}`);
  check('사수는 사거리 끝에서 멈춤 (근접하지 않음)', minD > 150, '최소 거리 ' + Math.round(minD));
  check('화살은 포물선 (높이가 솟았다 내려옴)', hmax > 10, 'h최대=' + hmax.toFixed(1)); }
{ // 폭파병: 닿으면 터져 범위 피해, 자신은 사라지고 처치 수는 올라가지 않음
  const g = arena(8, [['bomber', 1500, 1500 - 120]]); g.core.atk = 0; const hp0 = g.core.hp, k0 = g.kills; let boomed = false; // 성채가 먼저 처치하지 못하게 공격력 0
  for (let i = 0; i < 30 * 10; i++) { C.tick(g, DT); if (C.drainEvents(g).some(e => e.type === 'boom' && e.enemy)) boomed = true; }
  check('폭파병 자폭: 성채 피해 + 폭발 + 처치/골드 없음', boomed && g.core.hp < hp0 && g.enemies.length === 0 && g.kills === k0 && g.gold === C.CFG.startGold, `성채 ${Math.round(hp0)}→${Math.round(g.core.hp)}`); }
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
  C.tick(g, DT); // 성채가 사거리 안의 보스를 쏜다
  for (let i = 0; i < 30 * 3; i++) C.tick(g, DT);
  const withShield = hp0 - b.hp;
  const g2 = arena(20, [['boss', 1500 + 200, 1500]], 'warden'); const b2 = g2.enemies[0]; b2.speed = 0; b2.abil = {};  for (let i = 0; i < 30 * 3 + 1; i++) C.tick(g2, DT);
  const noShield = b2.max - b2.hp;
  check('방어막 동안 보스가 받는 피해가 크게 줄어듦', noShield > 0 && withShield < noShield * 0.5, `${withShield.toFixed(0)} vs ${noShield.toFixed(0)}`); }

// 13) 포물선 투사체 (아군 화살/성채 포탄)
{ const g = arena(1, [['grunt', 1500 + 200, 1500]]); g.gold = 1000; C.buy(g, 'archer'); const ar = g.units[0]; ar.x = 1500 - 40; ar.y = 1500; ar.hx = ar.x; ar.hy = ar.y;
  let hmax = 0, tFly = 0, seen = false; const hs = [];
  for (let i = 0; i < 30 * 6 && !seen; i++) { C.tick(g, DT); for (const s of g.shots) { hs.push(s.h); hmax = Math.max(hmax, s.h); tFly += 1; seen = true; } }
  check('아군 화살/성채 포탄도 포물선', hmax > 8 && hs.length >= 1, 'h최대=' + hmax.toFixed(1)); }


// 14) 특수 소환도 유닛 가격을 올린다
{ const g = C.createGame(31); g.gold = 1e6; const before = C.unitCostOf(g, 'sword'), bc = g.buyCount;
  applyById(g, 's_golem'); applyById(g, 's_hero'); applyById(g, 's_turret');
  check('골렘·용사·포탑 등 특수 유닛은 소환해도 가격을 올리지 않음', g.buyCount === bc && C.unitCostOf(g, 'sword') === before && ['golem', 'hero', 'turret'].every(t => C.CFG.units[t].priceSteps === 0), `${before}→${C.unitCostOf(g, 'sword')}`);
  g.buyCd.sword = 0; C.buy(g, 'sword'); check('직접 뽑는 유닛은 여전히 가격을 올림', C.unitCostOf(g, 'sword') > before);
  check('카드 설명에 인구 표기 없음', C.CARD_DEFS.every(d => !String(d.desc ? d.desc(1) : '').includes('인구'))); }

// 15) 전직: 보스를 처치하면 직업 선택, 선택하면 해당 직업이 강해진다
function killBoss(g) { const b = g.enemies.find(e => e.kind === 'boss'); b.hp = 1; b.shieldT = 0; g.core.atk = 1e6; for (let i = 0; i < 90 && !g.jobs.offer; i++) C.tick(g, DT); return b; }
{ const g = arena(5, [['boss', 1500, 1500 - 220]]); g.gold = 1e6; C.buy(g, 'sword'); g.buyCd.sword = 0; C.buy(g, 'archer'); g.buyCd.archer = 0; C.buy(g, 'priest');
  const b = killBoss(g);
  check('보스 처치 → 전직 선택(최대 3개) + 시간 정지', b.dead && g.jobs.offer && g.jobs.offer.list.length === 3 && g.jobs.offer.boss === b.bossName, g.jobs.offer && g.jobs.offer.list.map(o => o.className + ':' + o.name).join(' / '));
  const t0 = g.t; for (let i = 0; i < 20; i++) C.tick(g, DT); check('전직 선택 중 시간이 멈춤', g.t === t0);
  check('1단계 선택지는 직업마다 2갈래 중에서', g.jobs.offer.list.every(o => o.tier === 1));
  // 검사 → 기사 선택
  const knightIdx = g.jobs.offer.list.findIndex(o => o.id === 'knight');
  if (knightIdx < 0) { g.jobs.offer.list[0] = C.jobOptions(g).find(o => o.id === 'knight'); }
  const sw = g.units.find(u => u.type === 'sword'), hp0 = sw.max;
  C.pickJob(g, g.jobs.offer.list.findIndex(o => o.id === 'knight'));
  check('전직(기사): 체력 증가(CFG 수치), 직업 표시', Math.abs(sw.max - Math.round(hp0 * (1 + C.CFG.jobs.sword.t1[0].mods.hp))) <= 1 && sw.job === 'knight' && sw.jobTier === 1, `${hp0}→${sw.max}`);
  check('전직 선택 후 시간 재개', (() => { const t = g.t; C.tick(g, DT); return g.t > t; })());
  check('새로 뽑는 유닛도 전직 효과를 받음', (() => { g.buyCd.sword = 0; const n = C.buy(g, 'sword').unit; return n.max === sw.max && n.job === 'knight'; })());
  // 2단계: 기사 → 성기사 (같은 직업의 같은 갈래만 나옴)
  const opts2 = C.jobOptions(g).filter(o => o.type === 'sword');
  check('2단계 선택지는 선택한 갈래의 상위 직업만', opts2.length === 1 && opts2[0].id === 'paladin' && opts2[0].tier === 2, opts2.map(o => o.name).join());
  g.jobs.offer = { boss: 't', list: opts2 }; C.pickJob(g, 0);
  check('성기사: 체력 추가 증가 + 받는 피해 감소 + 재생 보정 합산', g.jobMods.sword.hp > 1.2 && g.jobMods.sword.def > 0.19 && g.jobMods.sword.regen === 0.02, JSON.stringify(g.jobMods.sword));
  sw.hp = sw.max * 0.5; const h0 = sw.hp; g.enemies.length = 0; g.queue = []; for (let i = 0; i < 60; i++) C.tick(g, DT);
  check('성기사 재생: 체력이 서서히 차오름', sw.hp > h0, Math.round(h0) + '→' + Math.round(sw.hp));
  check('최종 전직 이후 그 직업은 더 이상 제안되지 않음', C.jobOptions(g).every(o => o.type !== 'sword'));
  check('describeJobs에 전직 이력 표시', JSON.stringify(C.describeJobs(g).find(j => j.type === 'sword').names) === '["기사","성기사"]'); }
{ // 각 직업의 효과
  const g = C.createGame(41); g.gold = 1e7; for (const t of ['sword', 'archer', 'priest']) { g.buyCd[t] = 0; C.buy(g, t); }
  const ar = g.units.find(u => u.type === 'archer'), pr = g.units.find(u => u.type === 'priest'), r0 = ar.range, hr0 = pr.healRange, heal0 = pr.heal;
  const give = id => { const o = C.jobOptions(g).find(x => x.id === id); g.jobs.offer = { boss: 't', list: [o] }; C.pickJob(g, 0); };
  give('sniper'); check('저격수: 사거리 +60, 공격력 상승', ar.range === r0 + 60 && ar.atk > C.CFG.units.archer.atk * 1.5, `${r0}→${ar.range}`);
  give('deadeye'); check('명사수: 관통(화살이 뒤의 적을 맞힘) 효과 합산', g.jobMods.archer.pierce === 1);
  give('bishop'); const rl = g.reviveLeft; check('주교: 부활 횟수 즉시 +1', rl >= 1, 'reviveLeft=' + rl);
  give('archbishop'); check('대주교: 부활 +1 더 (라운드당 2회)', g.jobMods.priest.revive === 2);
  const pr2 = g.units.find(u => u.type === 'priest'); check('주교 계열: 치유량 증가', pr2.heal > heal0, `${heal0}→${pr2.heal.toFixed(1)}`);
  const g2 = C.createGame(42); g2.gold = 1e7; g2.buyCd.priest = 0; C.buy(g2, 'priest'); const p2 = g2.units[0], hr = p2.healRange;
  g2.jobs.offer = { boss: 't', list: [C.jobOptions(g2).find(x => x.id === 'cleric')] }; C.pickJob(g2, 0); check('성직자: 치유 범위 +40', p2.healRange === hr + 40, `${hr}→${p2.healRange}`);
  const g3 = C.createGame(43); g3.gold = 1e7; g3.buyCd.sword = 0; C.buy(g3, 'sword'); const s3 = g3.units[0], a0 = s3.atk;
  g3.jobs.offer = { boss: 't', list: [C.jobOptions(g3).find(x => x.id === 'fighter')] }; C.pickJob(g3, 0); check('투사: 공격력 +50%, 공격 속도 +20%', Math.abs(s3.atk / a0 - 1.5) < 1e-9 && Math.abs(s3.rate / C.CFG.units.sword.rate - 1.2) < 1e-9);
  g3.jobs.offer = { boss: 't', list: [C.jobOptions(g3).find(x => x.id === 'blademaster')] }; C.pickJob(g3, 0);
  // 검성 베기: 주변 적에게도 피해
  g3.enemies.length = 0; const e1 = C.spawnEnemy(g3, 'brute', s3.x + 30, s3.y), e2 = C.spawnEnemy(g3, 'brute', s3.x + 38, s3.y + 14); g3.core.atk = 0; g3.round = 5;
  const h1 = e1.hp, h2 = e2.hp; for (let i = 0; i < 40; i++) C.tick(g3, DT);
  check('검성: 주변 적에게도 베기 피해', e1.hp < h1 && e2.hp < h2, `${Math.round(h1 - e1.hp)} / ${Math.round(h2 - e2.hp)}`); }
{ // 30라운드 보스(암흑 기사단장) 처치 → 승리가 아니라 2막 연출, 시간 정지, 전직 선택
  const g = arena(30, [['boss', 1500, 1500 - 220]]); g.captureEvents = true; g.round = 30; g.queue = []; const b = g.enemies[0]; b.hp = 1; g.core.atk = 1e6; for (let i = 0; i < 90 && !g.cinematic; i++) C.tick(g, DT);
  check('30라운드 보스 처치: 게임이 끝나지 않고 2막 연출이 시작됨', b.dead && !g.over && g.act === 2 && !!g.cinematic && C.drainEvents(g).some(e => e.type === 'act2'), 'act=' + g.act);
  check('연출 중에는 시간이 멈춤', (() => { const t = g.t; for (let i = 0; i < 30; i++) C.tick(g, DT); return g.t === t; })());
  check('2막 연출과 함께 전직 선택도 제시됨', !!g.jobs.offer);
  C.pickJob(g, 0); C.tick(g, DT); check('전직을 골라도 연출이 끝나기 전엔 시간이 멈춰 있음', (() => { const t = g.t; C.tick(g, DT); return g.t === t; })());
  C.endCinematic(g); const t1 = g.t; C.tick(g, DT); check('연출이 끝나면 시간이 다시 흐름', g.t > t1); }
{ // 30라운드 보스가 살아 있으면 31라운드로 넘어가지 않는다 (보스를 처치해야 2막)
  const g = arena(30, [['boss', 1500, 1500 - 900]]); g.round = 30; g.queue = []; g.core.atk = 0; g.core.hp = g.core.max = 1e9; const b = g.enemies[0]; b.speed = 0; b.abil = {};
  for (let i = 0; i < 30 * 130; i++) C.tick(g, DT);
  check('30라운드 보스가 살아 있으면 130초가 지나도 라운드가 그대로 (게이트)', g.round === 30 && g.act === 1 && !b.dead, 'round=' + g.round);
  b.x = 1500; b.y = 1500 - 200; g.core.atk = 1e6; b.hp = 1; for (let i = 0; i < 90 && !g.cinematic; i++) C.tick(g, DT); C.endCinematic(g); if (g.jobs.offer) C.pickJob(g, 0); g.hold = false;
  for (let i = 0; i < 30 * 5; i++) C.tick(g, DT);
  check('보스를 처치하고 연출이 끝나면 곧바로 31라운드(2막)가 시작됨', g.round === 31 && g.act === 2, 'round=' + g.round); }
{ // 50라운드 마왕 처치 → 무한 모드(51라운드) 시작
  const g = arena(50, [['boss', 1500, 1500 - 220]]); g.act = 2; g.round = 50; g.queue = []; const b = g.enemies[0]; b.hp = 1; g.core.atk = 1e6; for (let i = 0; i < 90; i++) C.tick(g, DT);
  const cin = g.cinematic && g.cinematic.kind === 'endless'; C.endCinematic(g); if (g.jobs.offer) C.pickJob(g, 0); g.hold = false; for (let i = 0; i < 60; i++) C.tick(g, DT);
  check('마왕 처치 → 연출(endless) 후', cin);
  check('50라운드 마왕 처치 → 게임이 끝나지 않고 51라운드(무한)로', b.bossName === '마왕' && !g.over && g.round === 51, 'round ' + g.round);
  check('무한 모드는 라운드마다 점점 훨씬 강해짐', C.hpMul(60) > C.hpMul(50) * 1.8 && C.enemyCount(60) > C.enemyCount(50) * 1.15, `hp ×${(C.hpMul(60) / C.hpMul(50)).toFixed(1)} 수 ×${(C.enemyCount(60) / C.enemyCount(50)).toFixed(1)}`);
  const e55 = C.bossInfo(g, 55), e60 = C.bossInfo(g, 60); check('무한 모드 5라운드마다 보스(10라운드마다 마왕)', !!e55 && e60.name === '마왕' && C.bossInfo(g, 56) === null); }
{ // 2막 구조: 새 길(8방향), 더 가파른 난이도, 보스 라운드
  const a8 = C.spawnAngles(8), a6 = C.spawnAngles(6);
  check('2막 스폰 방향 8곳 (1막 6곳 + 새 길 2개, 중복 없음)', a8.length === 8 && new Set(a8.map(x => x.toFixed(3))).size === 8 && a6.every((x, i) => Math.abs(x - a8[i]) < 1e-9));
  const g = C.createGame(77); g.captureEvents = true; C.jumpToRound(g, 31); C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0);
  check('31라운드부터 스폰 지점이 8곳이고 2막 상태', g.spawnPts === 8 && g.act === 2, 'pts=' + g.spawnPts);
  const slopePre = (C.hpMul(30) - C.hpMul(25)) / 5, slopePost = (C.hpMul(40) - C.hpMul(35)) / 5;
  check('2막은 적이 강해지는 폭이 더 큼 (체력 증가 기울기)', slopePost > slopePre * 1.1, `${slopePre.toFixed(2)} → ${slopePost.toFixed(2)}/라운드`);
  check('2막 적 수 증가 (라운드당 +countPost, 1막 말 수 이어짐)', C.enemyCount(31) - C.enemyCount(30) === C.CFG.balance.countPost && C.enemyCount(50) > C.enemyCount(30));
  const g1 = C.createGame(78); C.jumpToRound(g1, 30); const sp1 = C.enemyCount(30);
  check('1막(≤30)은 act 1, 2막 진입은 보스 처치로만', g1.act === 1 && C.createGame(1).act === 1); }

// 16) 적은 맵 끝이 아니라 성채 근처(SPAWN_RING)에서 나타나 금방 도착한다
{ const g = arena(3, []); g.captureEvents = true; g.spawnPts = 6;
  const dists = []; for (let i = 0; i < 60; i++) { const e = C.spawnEnemy(g, 'grunt'); dists.push(Math.hypot(e.x - 1500, e.y - 1500)); }
  check('적 출현 위치는 성채에서 약 ' + C.SPAWN_RING + 'px (맵 끝이 아님)', dists.every(d => Math.abs(d - C.SPAWN_RING) < 120) && C.SPAWN_RING <= 800, `${Math.round(Math.min(...dists))}~${Math.round(Math.max(...dists))}`);
  check('출현 이벤트 발생 (나타나는 효과용)', C.drainEvents(g).filter(e => e.type === 'espawn').length === 60);
  const a4 = C.spawnAngles(4), a6 = C.spawnAngles(6);
  check('스폰 방향: 4곳(90° 간격) / 6곳(샛길 2개 추가), 중복 없음', a4.length === 4 && a6.length === 6 && new Set(a6.map(x => x.toFixed(3))).size === 6 && a6.slice(0, 4).every((x, i) => Math.abs(x - a4[i]) < 1e-9));
  const g2 = arena(3, [['grunt', 1500, 1500 - C.SPAWN_RING]]); g2.core.atk = 0; const gr = g2.enemies[0]; let tArrive = 0; for (let i = 0; i < 30 * 40; i++) { C.tick(g2, DT); if (Math.hypot(gr.x - 1500, gr.y - 1500) < 100) { tArrive = g2.t; break; } }
  check('출현 후 성채까지 도착이 빠름 (돌격병 15초 이내)', tArrive > 0 && tArrive < 15, tArrive.toFixed(1) + '초'); }

// 17) 유닛 기본 위치: 평소에는 사방으로 고르게, 적이 가까이 오면 그쪽으로 쏠림
function spreadOf(g) { const q = { up: 0, down: 0, left: 0, right: 0 }, ang = []; for (const u of g.units) { const dx = u.x - 1500, dy = u.y - 1500; dy < 0 ? q.up++ : q.down++; dx < 0 ? q.left++ : q.right++; ang.push(Math.atan2(dy, dx)); } ang.sort((a, b) => a - b); let gap = 0; for (let i = 0; i < ang.length; i++) { let d = ang[(i + 1) % ang.length] - ang[i]; if (d <= 0) d += 2 * Math.PI; gap = Math.max(gap, d); } return { q, gapDeg: gap * 180 / Math.PI }; }
{ const g = arena(3, []); g.gold = 1e7; for (const t of ['sword', 'archer', 'sword', 'priest', 'archer', 'sword', 'sword', 'archer', 'priest', 'sword', 'archer', 'sword']) { g.buyCd[t] = 0; C.buy(g, t); }
  for (let i = 0; i < 30 * 8; i++) C.tick(g, DT);
  const sp = spreadOf(g);
  check('적이 없을 때 유닛이 사방에 고르게 분포 (위/아래/좌/우 각각 4기 이상)', sp.q.up >= 4 && sp.q.down >= 4 && sp.q.left >= 4 && sp.q.right >= 4, JSON.stringify(sp.q));
  check('빈 각도가 크지 않음 (가장 큰 공백 < 100°)', sp.gapDeg < 100, Math.round(sp.gapDeg) + '°');
  // 위쪽에서 적이 성채 가까이 접근 → 서서히 그쪽으로 쏠림
  C.spawnEnemy(g, 'brute', 1500, 1500 - 380); g.core.atk = 0; const b0 = g.biasNow;
  for (let i = 0; i < 30 * 3; i++) C.tick(g, DT);
  check('적이 가까이 오면 위협 방향으로 서서히 모임 (쏠림 증가)', g.biasNow > b0 + 0.2, `bias ${b0.toFixed(2)}→${g.biasNow.toFixed(2)}`); }

// 18) 성채: 적을 향해 조준하고 쏠 때 반동 상태가 생김
{ const g = arena(3, [['grunt', 1500 + 200, 1500]]); let aimed = false, swung = false;
  for (let i = 0; i < 30 * 4; i++) { C.tick(g, DT); if (g.core.swing > 0) swung = true; if (swung && Math.abs(g.core.aim - 0) < 0.3) aimed = true; }
  check('성채가 적 방향으로 대포를 조준하고 발사 상태(swing)가 됨', swung && aimed, 'aim=' + g.core.aim.toFixed(2)); }

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
  check('성채 포탄은 성채 중심이 아니라 대포 포구(약 32px)에서 출발', first && Math.abs(d0 - 32) < 1.5, 'd=' + (d0 && d0.toFixed(1)));
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
  check('포격대장 포탄은 어깨 대포 끝(약 85px, 높이 34)에서 출발', sh && Math.abs(d - 85) < 1.5 && sh.h0 === 34, 'd=' + (d && d.toFixed(1))); }
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
  const fin = arena(30, [['boss', 1500, 800]]).enemies[0]; check('암흑 기사단장(30라운드)은 패턴 7종(상태이상·강습·순간이동 포함) 고정 수치', Object.keys(fin.abil).length === 7 && fin.abil.artillery.dmg === C.CFG.act1Boss.abil.artillery.dmg);
  const fin50 = arena(50, [['boss', 1500, 800]]).enemies[0]; check('마왕(50라운드)은 패턴 9종(상태이상 4가지·강습·순간이동·도약) 고정 수치, 더 큼', Object.keys(fin50.abil).length === 9 && fin50.abil.artillery.count === 2 && fin50.r > 33 && fin50.bossName === '마왕'); }

// 23) 졸개 소환: 성채 가까이 왔을 때만, 보스 앞(성채 방향)에 나온다
{ const g = arena(10, [['boss', 1500, 1500 - 1000]], 'summoner'); g.core.atk = 0; g.core.hp = g.core.max = 1e9; const b = g.enemies[0]; b.speed = 0; delete b.abil.blink; let early = 0;
  for (let i = 0; i < 30 * 30; i++) { C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0); } // 보스가 멀리(1000px) 정지: 소환 시간이 흐르지 않음
  check('보스가 성채에서 멀면(600px 밖) 졸개를 소환하지 않음', g.enemies.length === 1, '적 ' + g.enemies.length + '마리');
  b.x = 1500; b.y = 1500 - 500; g.captureEvents = true; let ev = null, minions = [];
  for (let i = 0; i < 30 * 20 && !ev; i++) { C.tick(g, DT); if (g.cards.offer) C.pickCard(g, 0); ev = C.drainEvents(g).find(e => e.type === 'bossSummon'); }
  minions = g.enemies.filter(e => e.kind !== 'boss');
  check('성채 가까이(500px) 오면 소환하고 마릿수가 알림에 담김', !!ev && ev.n === minions.length && minions.length >= 3, ev && `n=${ev.n}, 실제 ${minions.length}`);
  check('졸개는 보스 앞(성채 쪽)에 나옴 (보스보다 성채에 가까움)', minions.length > 0 && minions.every(m => Math.hypot(m.x - 1500, m.y - 1500) < Math.hypot(b.x - 1500, b.y - 1500) + 20), minions.map(m => Math.round(Math.hypot(m.x - 1500, m.y - 1500))).join(',') + ' vs 보스 ' + Math.round(Math.hypot(b.x - 1500, b.y - 1500)));
  const kinds = new Set(); for (const id of ['summoner', 'bombardier', 'warden']) { const gg = arena(15, [['boss', 1500, 1500 - 400]], id); gg.core.atk = 0; gg.core.hp = gg.core.max = 1e9; gg.enemies[0].speed = 0; for (let i = 0; i < 30 * 16; i++) { C.tick(gg, DT); if (gg.cards.offer) C.pickCard(gg, 0); } kinds.add(gg.enemies.filter(e => e.kind !== 'boss').map(e => e.kind)[0]); }
  check('소환사·포격대장·철벽 장군이 각자의 졸개(돌격병·사수·방패병)를 소환', ['grunt', 'archer', 'shield'].every(k => kinds.has(k)), [...kinds].join()); }

// 24) 성채 원형: 아군은 들어올 수 없다
{ const g = arena(3, []); g.gold = 1e7; for (const t of ['sword', 'archer', 'priest', 'sword', 'archer', 'priest', 'sword', 'sword', 'priest', 'archer']) { g.buyCd[t] = 0; C.buy(g, t); }
  let minD = 1e9; for (let i = 0; i < 30 * 20; i++) { if (i === 150) for (let k = 0; k < 6; k++) C.spawnEnemy(g, 'grunt', 1500 + (k - 3) * 60, 1500 - 300); C.tick(g, DT); for (const u of g.units) if (!C.CFG.units[u.type].static) minD = Math.min(minD, Math.hypot(u.x - 1500, u.y - 1500)); }
  check('아군(검사·궁수·사제)은 성채 원형(반지름 ' + C.CFG.core.blockR + ') 안으로 들어오지 않음', minD >= C.CFG.core.blockR - 0.5, '최소 거리 ' + minD.toFixed(1));
  const g2 = arena(3, []); g2.gold = 1e6; g2.buyCd.priest = 0; const pr = C.buy(g2, 'priest').unit; pr.x = 1500; pr.y = 1500; for (let i = 0; i < 5; i++) C.tick(g2, DT);
  check('성채 한가운데로 보내도 바로 원 밖으로 밀려남', Math.hypot(pr.x - 1500, pr.y - 1500) >= C.CFG.core.blockR - 0.5);
  check('사제의 대기 반경이 성채 원형 밖', C.CFG.ai.homeR.priest * 0.9 > C.CFG.core.blockR + 10); }
// 25) 방어 자세: 거리 조건 없이 검사 계열이 받는 피해 감소, 문구에도 300 없음
{ const g = arena(3, []); g.gold = 1e6; g.buyCd.sword = 0; const sw = C.buy(g, 'sword').unit; applyById(g, 'u_guard'); sw.x = 1500 + 800; sw.y = 1500; sw.hp = sw.max = 1e6;
  const e = C.spawnEnemy(g, 'grunt', sw.x + 15, sw.y); e.dmg = 100; e.cd = 0; e.hp = e.max = 1e9; g.core.atk = 0; const h0 = sw.hp; C.tick(g, DT); C.tick(g, DT);
  const taken = h0 - sw.hp; const expected = 100 * (1 - C.CFG.cardVals.guard);
  check('방어 자세: 성채에서 멀리 있어도(800px) 검사 피해 감소 적용', taken > 0 && Math.abs(taken - expected) < 1, taken.toFixed(1) + ' (기대 ' + expected.toFixed(1) + ')');
  check('방어 자세 문구에 "성채 주변(300)" 없음', !C.CARD_DEFS.find(d => d.id === 'u_guard').desc(1).includes('300') && !C.CARD_DEFS.some(d => String(d.desc ? d.desc(1) : '').includes('성채 주변(300)'))); }

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
  const b = g.enemies[0], k0 = g.kills; b.hp = 1; C.damage(g, b, 5);
  check('보스 처치 시 남은 졸개 전원 사망 + 대기 중이던 적도 취소', g.enemies.every(e => e.dead) && g.queue.length === 0, `생존 ${g.enemies.filter(e => !e.dead).length}, 대기 ${g.queue.length}`);
  check('졸개가 쓸려 죽어도 골드·처치 수는 보스 몫만', g.kills === k0 + 1);
  }
// 30) 보스는 시간이 지날수록 기본 공격이 강해진다
{ const g = arena(20, [['boss', 1500, 1500 - 900]], 'charger'); g.core.hp = g.core.max = 1e9; g.core.atk = 0; const b = g.enemies[0]; b.speed = 0; b.abil = {}; let g0 = 0;
  for (let i = 0; i < 30 * 8; i++) C.tick(g, DT); g0 = b.dmgMul;
  for (let i = 0; i < 30 * 20; i++) C.tick(g, DT); const g1 = b.dmgMul;
  for (let i = 0; i < 30 * 200; i++) C.tick(g, DT);
  check('보스: 등장 직후(8초)는 ×1, 28초에는 더 강함, 상한 이후 고정', g0 <= 1.001 && g1 > 1.4 && Math.abs(b.dmgMul - C.CFG.balance.bossGrowMax) < 1e-6, `${g0.toFixed(2)} → ${g1.toFixed(2)} → ${b.dmgMul.toFixed(2)}`); }
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
  { const { g, a } = mk('stun'); a.stunT = 2; const x0 = a.x; for (let i = 0; i < 30; i++) C.tick(g, DT); check('기절한 유닛은 움직이지 못함', Math.abs(a.x - x0) < 0.01 && a.stunT < 1.1); }
  { const { g, a } = mk('poison'); a.poisonT = 5; a.max = 1000; a.hp = 1000; for (let i = 0; i < 30 * 3; i++) C.tick(g, DT); const lost = 1000 - a.hp; check('중독: 초당 최대 체력 비율만큼 감소 (죽지는 않음)', Math.abs(lost - 3 * 1000 * C.CFG.debuff.poison.pct) < 12 && a.hp >= 1, `3초 ${lost.toFixed(1)} 감소`);
    a.poisonT = 500; a.hp = 5; for (let i = 0; i < 30 * 5; i++) C.tick(g, DT); check('중독으로는 죽지 않고 체력 1에서 멈춤', !a.dead && a.hp >= 1 - 1e-9); }
  { const { g, a } = mk('weak'); a.x = 1500 + 100; a.y = 1500; a.hx = a.x; a.hy = a.y; const e = C.spawnEnemy(g, 'brute', a.x + 25, a.y); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; const measure = () => { let d = 0; for (let i = 0; i < 30 * 6; i++) { const h = e.hp; C.tick(g, DT); d += h - e.hp; } return d; };
    const normal = measure(); a.weakT = 99; const weak = measure(); check('공격력 감소: 주는 피해가 약해짐', weak < normal * 0.9 && weak > normal * 0.6, `${normal.toFixed(0)} → ${weak.toFixed(0)}`); }
  { const { g, a } = mk('wound'); const run = wt => { a.max = 10000; a.woundT = wt; g.buyCd.priest = 0; g.gold = 1e6; const pr = C.buy(g, 'priest').unit; pr.x = a.x + 30; pr.y = a.y; let h = 0; for (let i = 0; i < 30 * 8; i++) { a.hp = 5000; C.tick(g, DT); h += Math.max(0, a.hp - 5000); a.woundT = wt; a.x = 1500 - 40; a.y = 1500 - 200; } pr.dead = true; g.units = g.units.filter(u => u !== pr); return h; };
    const n = run(0), w = run(99); check('치유 감소: 받는 치유가 줄어듦', w < n * 0.6 && n > 0, `${n.toFixed(0)} → ${w.toFixed(0)}`); } }
// 34) 적을 모두 처치(보스 포함)하면 라운드가 즉시 끝나고 다음 라운드 시작
{ const g = arena(3, [['grunt', 1500, 1000]]); g.hold = false; g.core.hp = g.core.max = 1e9; for (let i = 0; i < 60; i++) C.tick(g, DT); check('적이 남아 있으면 다음 라운드로 안 넘어감', g.round === 3);
  for (const e of g.enemies) e.dead = true; for (let i = 0; i < 5; i++) C.tick(g, DT); check('적을 모두 처치하면 즉시 다음 라운드', g.round === 4, 'round ' + g.round);
  const h = arena(10, [['boss', 1500, 1000]], 'summoner'); h.hold = false; h.core.hp = h.core.max = 1e9; for (let i = 0; i < 40; i++) C.tick(h, DT); const b = h.enemies.find(e => e.kind === 'boss'); C.damage(h, b, 1e12); if (h.jobs.offer) C.pickJob(h, 0); for (let i = 0; i < 40; i++) C.tick(h, DT); check('보스를 처치하면 즉시 다음 라운드', h.round === 11, 'round ' + h.round); }
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
  check('근접 유닛·성채는 공중형을 공격하지 못함', bat.hp === bat.max, `hp ${bat.hp}`);
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
  C.damage(h, h.enemies.find(e => e.kind === 'boss'), 1e12);
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
// 40) 자유 모드: 성채에서 먼 적도 쫓아감 (기본 모드는 안 쫓음)
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
// 42) 마왕 처치 시 쓰러진 병사 전원 부활 / 무한 모드 추가 포탈 / 보스 개성 패턴
{ const g = arena(50, [['boss', 1500, 1500 - 220]]); g.act = 2; g.round = 50; g.queue = []; g.gold = 1e7; g.core.hp = g.core.max;
  for (let i = 0; i < 3; i++) { g.buyCd.sword = 0; C.buy(g, 'sword'); g.buyCd.archer = 0; C.buy(g, 'archer'); }
  const before = g.units.length; for (let i = 0; i < 4; i++) { const u = g.units[i]; C.damage(g, u, 1e9); } for (let i = 0; i < 3; i++) C.tick(g, DT);
  const alive0 = g.units.filter(u => !u.dead).length, fallen = g.fallen.length;
  const b = g.enemies.find(e => e.kind === 'boss'); g.core.atk = 1e6; C.damage(g, b, 1e12);
  check('마왕 처치 → 쓰러진 병사가 전원 부활, 체력 가득', alive0 < before && g.units.filter(u => !u.dead).length === before && g.units.every(u => u.hp >= u.max - 1e-6) && fallen >= 4, `전 ${alive0} → 후 ${g.units.length} / 원래 ${before}, 전사 기록 ${fallen}`);
  check('연출 종류 endless', g.cinematic && g.cinematic.kind === 'endless');
  check('포탈: 51~55라운드 1개, 56라운드 2개 … 86라운드 이후 8개(총 16)', C.extraAngles(1).length === 1 && C.extraAngles(8).length === 8 && C.extraAngles(8).every(a => isFinite(a)));
  const h = C.createGame(9); h.captureEvents = true; for (const [r, want] of [[50, 0], [51, 1], [55, 1], [56, 2], [61, 3], [85, 7], [86, 8], [120, 8]]) { h.round = r - 1; h.phase = 'round'; h.queue = []; h.roundT = C.ROUND_TIME; h.enemies.length = 0; h.cards.offer = null; C.tick(h, DT); h.cards.offer = null; if (h.extraPts !== want) check('포탈 수 R' + r, false, `기대 ${want} 실제 ${h.extraPts}`); }
  check('포탈 수 곡선 확인 완료', true);
  const pts = []; h.extraPts = 8; h.spawnPts = 8; h.round = 90; for (let i = 0; i < 300; i++) { const e = C.spawnEnemy(h, 'grunt'); pts.push(Math.hypot(e.x - 1500, e.y - 1500)); }
  check('추가 포탈은 기존 포탈보다 성채에 가깝게 나옴 (거리 약 480 vs 700)', pts.some(d => d < 600) && pts.some(d => d > 650), `최소 ${Math.min(...pts).toFixed(0)} 최대 ${Math.max(...pts).toFixed(0)}`); }
{ // 보스 개성: 돌진(등장 직후 성채로), 순간이동, 도약
  const mk = id => { const g = arena(10, [['boss', 1500 + 900, 1500]], id); const b = g.enemies[0]; g.core.hp = g.core.max = 1e9; g.core.atk = 0; return { g, b }; };
  { const { g, b } = mk('charger'); const d0 = Math.hypot(b.x - 1500, b.y - 1500); for (let i = 0; i < 30 * 2; i++) C.tick(g, DT); check('돌격왕: 등장하자마자 성채 쪽으로 돌진', Math.hypot(b.x - 1500, b.y - 1500) < d0 - 350 || b.rushDone, `${d0.toFixed(0)} → ${Math.hypot(b.x - 1500, b.y - 1500).toFixed(0)}`); }
  { const { g, b } = mk('summoner'); g.captureEvents = true; let ev = null; b.speed = 0; for (let i = 0; i < 30 * 14 && !ev; i++) { C.tick(g, DT); ev = C.drainEvents(g).find(e => e.type === 'bossBlink') || null; }
    check('소환사: 순간이동', !!ev && Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0) > 300, ev ? `이동 거리 ${Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0).toFixed(0)}` : '없음'); }
  { const { g, b } = mk('berserker'); g.gold = 1e7; for (let i = 0; i < 4; i++) { g.buyCd.sword = 0; const u = C.buy(g, 'sword').unit; u.x = 1500 + 300 + i * 10; u.y = 1500; u.hx = u.x; u.hy = u.y; u.max = u.hp = 1e9; } b.x = 1500 + 400; b.y = 1500; b.speed = 0; g.captureEvents = true; let ev = null, sh = null;
    for (let i = 0; i < 30 * 12 && !sh; i++) { C.tick(g, DT); for (const e of C.drainEvents(g)) { if (e.type === 'bossLeap') ev = e; if (e.type === 'bossShock') sh = e; } }
    check('광전사: 아군이 몰린 곳으로 도약해 내려찍음', !!ev && !!sh && Math.hypot(b.x - 1500, b.y - 1500) < 330, ev ? '도약 후 거리 ' + Math.hypot(b.x - 1500, b.y - 1500).toFixed(0) : '없음'); }
  { const { g, b } = mk('bombardier'); for (let i = 0; i < 30 * 40; i++) C.tick(g, DT); const d = Math.hypot(b.x - 1500, b.y - 1500); check('포격대장: 성채에서 떨어져 포격만 함 (약 235)', d > 200 && d < 290, d.toFixed(0)); }
}
// 43) 인구 제한 + 성채 업그레이드(능력치·대포·인구)
{ C.CFG.castle.popBase = POP0; const g = C.createGame(3); g.gold = 1e9; let ok = 0, reason = null; for (let i = 0; i < 30; i++) { g.buyCd.sword = 0; const r = C.buy(g, 'sword'); if (r.ok) ok++; else { reason = r.reason; break; } }
  check('인구 상한(성채 1레벨=8)이 차면 더 못 뽑음 (reason pop)', C.popCount(g) === C.popCap(g) && C.popCap(g) === POP0 && reason === 'pop', `인구 ${C.popCount(g)}/${C.popCap(g)}`);
  const c0 = { max: g.core.max, atk: g.core.atk, range: g.core.range, cn: g.core.cannons }; g.gold = 0; const r0 = C.upgradeCastle(g);
  check('골드가 부족하면 업그레이드 불가', !r0.ok && r0.reason === 'gold' && g.castle.lv === 1);
  g.gold = 1e9; const r1 = C.upgradeCastle(g); g.buyCd.sword = 0;
  check('성채 업그레이드: 골드 차감, 인구 상한·체력·공격력·사거리 상승', r1.ok && g.castle.lv === 2 && g.gold === 1e9 - C.CFG.castle.cost[0] && C.popCap(g) === POP0 + 3 && g.core.max > c0.max && g.core.atk > c0.atk && g.core.range > c0.range, `체력 ${c0.max}→${g.core.max} 공격 ${c0.atk.toFixed(1)}→${g.core.atk.toFixed(1)} 사거리 ${c0.range}→${g.core.range}`);
  check('업그레이드 후 다시 뽑을 수 있음', C.buy(g, 'sword').ok);
  { const h2 = C.createGame(9); h2.gold = 1e9; const caps = [C.popCap(h2)]; for (let i = 0; i < 3; i++) { C.upgradeCastle(h2); caps.push(C.popCap(h2)); } check('인구 증가량이 레벨마다 +1씩 커짐 (+3, +4, +5)', caps[1] - caps[0] === 3 && caps[2] - caps[1] === 4 && caps[3] - caps[2] === 5, caps.join('→'));
    const before = C.popCount(h2); C.spawnUnit ? 0 : 0; const u = C.createGame(1); u.units.push({ team: 'u', type: 'golem', dead: false, x: 0, y: 0 }); check('특수 유닛은 인구에 포함되지 않고 따로 셈', C.popCount(u) === 0 && C.specialCount(u) === 1); }
  const cn = lv => { const h = C.createGame(4); h.gold = 1e9; for (let i = 1; i < lv; i++) C.upgradeCastle(h); return h.core.cannons; };
  check('대포: 3레벨 2문, 5레벨 3문, 7레벨 4문', cn(1) === 1 && cn(2) === 1 && cn(3) === 2 && cn(5) === 3 && cn(7) === 4 && cn(8) === 4, [1, 3, 5, 7].map(cn).join('/'));
  const h = arena(10, []); h.gold = 1e9; for (let i = 1; i < 7; i++) C.upgradeCastle(h); h.core.atk = 100; h.core.rate = 1; const es = []; for (let i = 0; i < 4; i++) { const e = C.spawnEnemy(h, 'brute', 1500 + 100 + i * 12, 1500 + i * 25); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; es.push(e); }
  h.core.cd = 0; C.tick(h, DT); check('여러 문의 대포는 서로 다른 적을 동시에 쏨', h.shots.length >= 3 && new Set(h.shots.map(s => s.t)).size >= 3, `발사 ${h.shots.length}, 서로 다른 목표 ${new Set(h.shots.map(s => s.t)).size}`);
  const f = C.createGame(5); f.round = 40; f.cards.offer = null; f.jobs.offer = { boss: 'x', reward: true, list: [{ type: 'reward', reward: true, id: 'r_fort', name: 'x', desc: '', className: '', tier: 0 }] }; C.pickJob(f, 0);
  check('보상 [성채 대개수]: 성채 2레벨 상승', f.castle.lv === 3);
  const ids = new Set(); for (let i = 0; i < 200; i++) { const g2 = C.createGame(300 + i); g2.round = 10; C.openCards(g2, false); for (const c of g2.cards.offer || []) ids.add(c.id); }
  check('성채 능력치 카드(공격력·속도·사거리·체력)는 더 이상 나오지 않음', !['c_atk', 'c_rate', 'c_range', 'f_hp'].some(x => ids.has(x))); C.CFG.castle.popBase = 999; }
// 44) 보스 순간이동 거리 제한 · 소환 졸개 성장 · 보상 성채 상한 · 목표 분산
{ let worst = 0, n = 0; for (let t = 0; t < 40; t++) { const g = arena(30, [['boss', 1500 + 400, 1500 + (t % 7) * 40]]); const b = g.enemies[0]; b.e = 0; g.captureEvents = true; b.abil.blink = { cd: 1, minR: 300, maxR: 460 }; b.t.blink = 0; b.life = 3; b.speed = 0;
    for (let i = 0; i < 30 * 8; i++) { C.tick(g, DT); for (const ev of g.events || []) if (ev.type === 'bossBlink') { worst = Math.max(worst, Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0)); n++; } g.events = []; } }
  check('순간이동 한 번의 이동 거리가 너무 멀지 않음 (≤ 350)', n > 20 && worst <= 350, `횟수 ${n}, 최대 ${worst.toFixed(0)}`); }
{ const cnt = r => { let tot = 0, up = 0; for (let t = 0; t < 12; t++) { const g = arena(r, [['boss', 1500, 800]]); const b = g.enemies[0]; b.speed = 0; b.abil = { summon: { cd: 5, n: 4, kind: 'grunt' } }; b.t = { summon: 0 }; g.enemies.length = 1; C.tick(g, DT); for (const e of g.enemies) if (e.kind !== 'boss') { tot++; if (e.kind === 'captain') up++; } } return [tot / 12, up / Math.max(1, tot)]; };
  const a = cnt(10), z = cnt(50); check('보스 소환: 라운드가 지날수록 졸개가 더 많고 강화형 비율이 늘어남', z[0] > a[0] * 1.8 && z[1] > a[1] + 0.3, `10R ${a[0].toFixed(1)}마리/강화 ${(a[1] * 100).toFixed(0)}% → 50R ${z[0].toFixed(1)}마리/강화 ${(z[1] * 100).toFixed(0)}%`); }
{ const o = lv => { const g = C.createGame(77); g.gold = 1e9; for (let i = 1; i < lv; i++) C.upgradeCastle(g); C.CFG.castle.popBase = 8; g.jobs.sword.ids = ['knight', 'paladin']; g.jobs.archer.ids = ['sniper', 'x']; g.jobs.priest.ids = ['a', 'b']; g.jobs.offer = null; C.jumpToRound(g, 40); const b = {}; try { const e = Object.create(null); } catch (e) {} g.round = 40; return g; };
  const full = o(8), one = o(7), none = o(1); const pool = g => { g.jobs.offer = null; const ids = new Set(); const offs = []; for (let i = 0; i < 40; i++) { const h = C.createGame(900 + i); h.castle.lv = g.castle.lv; h.jobs.sword.ids = ['knight', 'paladin']; h.jobs.archer.ids = ['sniper', 'x']; h.jobs.priest.ids = ['a', 'b']; h.jobs.offer = null; h.round = 40; const E = h.enemies; E.length = 0; const bs = C.spawnEnemy(h, 'boss', 1500, 800); C.damage(h, bs, 1e12); if (h.jobs.offer) for (const x of h.jobs.offer.list) ids.add(x.id + ':' + x.desc); } return ids; };
  C.CFG.castle.popBase = 999;
  const pf = pool(full), p1 = pool(one);
  check('성채가 이미 최대 레벨이면 [성채 대개수]가 제시되지 않음', ![...pf].some(x => x.startsWith('r_fort')), [...pf].length + '종');
  check('성채가 1레벨만 남았으면 안내문이 1레벨로 바뀜', [...p1].some(x => x.startsWith('r_fort') && x.includes('1레벨') && x.includes('최대 레벨')) || ![...p1].some(x => x.startsWith('r_fort')), [...p1].filter(x => x.startsWith('r_fort')).join('|') || '(이번 표본엔 안 나옴)'); }
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
// 46) 수비 모드: 자기 자리를 벗어나지 않는다
{ const run = mode => { const a = C.createGame(1, mode); a.hold = true; a.phase = 'round'; a.round = 10; a.queue = []; C.buy(a, 'sword'); const u = a.units[0]; u.x = u.hx = 1500 + 100; u.y = u.hy = 1500; const e = C.spawnEnemy(a, 'grunt', 1500 + 238, 1500); e.speed = 0; e.dmg = 0; e.hp = e.max = 1e9; for (let i = 0; i < 150; i++) C.tick(a, DT); return Math.hypot(u.x - u.hx, u.y - u.hy); };
  C.CFG.holdRadius = 40; const n = run('normal'), h = run('hold'); C.CFG.holdRadius = 75; check('수비 모드: 자리를 지키고, 기본 모드는 적을 쫓아감', h < 7 && n > h + 12, `수비 이동 ${h.toFixed(1)}px / 기본 ${n.toFixed(0)}px`); }
console.log(failed ? '\n실패 ' + failed + '건' : '\n모두 통과');
process.exit(failed ? 1 : 0);
