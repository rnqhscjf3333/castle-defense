/* 성채방어 — 게임 로직 (렌더링/DOM 없음)
 * 브라우저(window.CastleCore)와 Node(require)에서 모두 쓸 수 있다.
 * 시드 난수 + 고정 시간 단계(tick(dt))만 사용하므로 결정론적이다.
 * → 같은 코드로 밸런스 시뮬레이션과 서버 검증을 돌릴 수 있다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CastleCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────── 설정값 (초기값: 밸런스 시뮬레이터로 조정 예정) ─────────────
  const W = 3000, H = 3000, CX = W / 2, CY = H / 2;
  const MAX_ROUND = 30;
  const ROUND_TIME = 40;   // 한 라운드 최대 시간(초). 적이 남아도 다음 라운드가 시작된다.
  const SPAWN_TIME = 25;   // 라운드 시작 후 이 시간 동안 적이 나뉘어 나온다.
  const PREP_TIME = 0;     // 라운드는 시작하자마자 자동으로 진행된다 (준비 시간 없음)
  const SPAWN_RING = 700;  // 중앙에서 스폰 지점까지 거리 (맵 끝에서 오래 걸어오지 않고 화면 바로 밖에서 나타난다)
  const ENRAGE_AFTER = 60; // 한 적이 이 시간(초) 이상 살아 있으면 점점 강해진다.

  const CFG = {
    world: { w: W, h: H, cx: CX, cy: CY },
    startGold: 0,   // 첫 라운드는 성채 혼자 버티며 처치 골드로 첫 유닛을 뽑는다
    leash: 240,           // 유닛이 성채로부터 추격할 수 있는 최대 거리
    ai: {
      bias: 0.08,         // 평소(적이 멀 때) 대기 자리가 적 방향으로 쏠리는 정도 (0 = 사방에 고르게, 1 = 전부 적 방향)
      biasAlert: 0.6,     // 적이 alertRange 안으로 들어오면 이만큼까지 서서히 쏠린다
      alertRange: 420,    // 성채에서 이 거리 안에 적이 있으면 경계 상태
      sway: 6,            // 대기 중 살짝 흔들리는 폭(px) — 가만히 서 있는 느낌을 줄인다
      homeR: { sword: 170, archer: 110, priest: 70, golem: 150, hero: 140 }, // 역할별 대기 반경
    },
    core: { hp: 1000, atk: 20, rate: 1.0, range: 260, r: 46 },
    units: {
      sword:  { name: '검사', cost: 50, hp: 120, atk: 12, rate: 1.0, range: 30,  speed: 90, r: 10, buyCd: 1.2, aggro: 220 },
      archer: { name: '궁수', cost: 60, hp: 60,  atk: 10, rate: 1.2, range: 220, speed: 80, r: 9,  buyCd: 1.5, aggro: 260 },
      priest: { name: '사제', cost: 80, hp: 70,  atk: 0,  rate: 0,   range: 0,   speed: 80, r: 9,  buyCd: 2.5, aggro: 0,
                heal: 14, healRate: 1.5, healRange: 200 },
      // 카드로만 얻는 유닛
      golem:  { name: '골렘', hp: 900, atk: 35, rate: 0.8, range: 40,  speed: 55,  r: 18, aggro: 220, priceSteps: 3 }, // priceSteps: 소환하면 모든 유닛 가격이 이만큼 오른다 (직접 뽑는 유닛은 1)
      hero:   { name: '용사', hp: 350, atk: 40, rate: 1.3, range: 30,  speed: 100, r: 12, aggro: 260, priceSteps: 2 },
      turret: { name: '포탑', hp: 300, atk: 18, rate: 1.5, range: 240, speed: 0,   r: 11, priceSteps: 1 },
    },
    enemies: {
      grunt:  { name: '돌격병', hp: 30, dmg: 6,  speed: 70, r: 9,  range: 20, rate: 1.0, gold: 4,   aggro: 110 },
      shield: { name: '방패병', hp: 90, dmg: 8,  speed: 45, r: 13, range: 22, rate: 1.0, gold: 8,   aggro: 90 },
      boss:   { name: '보스',   hp: 0,  dmg: 25, speed: 40, r: 30, range: 36, rate: 0.8, gold: 150, aggro: 180 },
      archer: { name: '사수',   hp: 28, dmg: 6,  speed: 52, r: 9,  range: 200, rate: 0.8, gold: 7,  aggro: 230, ranged: true }, // 멀리서 화살을 쏜다
      bomber: { name: '폭파병', hp: 22, dmg: 26, speed: 100, r: 9, range: 12, rate: 1.0, gold: 6,  aggro: 170, blast: 60 },  // 닿으면 폭발해 범위 피해
      shaman: { name: '주술사', hp: 45, dmg: 0,  speed: 50, r: 10, range: 0,  rate: 0,   gold: 12, aggro: 0,   healRange: 140, healPct: 0.12, healRate: 1.6, keep: 260 }, // 뒤에서 아군 적을 치유
      brute:  { name: '거한',   hp: 240, dmg: 16, speed: 34, r: 17, range: 26, rate: 0.7, gold: 20, aggro: 100 },           // 느리고 단단하다
    },
    // 일반 적 등장표: from 라운드부터 가중치 w로 섞여 나온다 (라운드가 갈수록 종류가 늘어난다)
    spawn: { grunt: { from: 1, w: 6 }, shield: { from: 3, w: 3 }, archer: { from: 4, w: 2.5 }, bomber: { from: 7, w: 2.2 }, shaman: { from: 10, w: 1.3 }, brute: { from: 13, w: 1.4 } },
    // 보스: 5라운드마다, 라운드 시작과 함께 나온다. 체력은 고정 수치표, 고유 패턴을 가진다 (수치는 밸런스에서 조정)
    bosses: {
      5:  { name: '돌격왕',    hp: 600,   look: { body: '#b5472a', head: '#e6c9a0', weapon: 'axe' },    abil: { dash: { cd: 7, dur: 1.4, mul: 3 } } },
      10: { name: '소환사',    hp: 2000,  look: { body: '#3f6fb5', head: '#cfe0f0', weapon: 'staff' },  abil: { summon: { cd: 9, n: 4, kind: 'grunt' } } },
      15: { name: '포격대장',  hp: 5000,  look: { body: '#6b7a3a', head: '#e0d6b0', weapon: 'cannon' }, abil: { artillery: { cd: 5, dmg: 60, radius: 90, count: 1, flight: 1.6 }, summon: { cd: 14, n: 2, kind: 'archer' } } },
      20: { name: '철벽 장군', hp: 12000, look: { body: '#6a737f', head: '#d8dde6', weapon: 'shield' }, abil: { shield: { cd: 12, dur: 4, red: 0.8 }, dash: { cd: 10, dur: 1.2, mul: 2.5 }, summon: { cd: 12, n: 3, kind: 'shield' } } },
      25: { name: '광전사',    hp: 25000, look: { body: '#a3252d', head: '#f0cfa8', weapon: 'twin' },   abil: { rage: { at: 0.5, speed: 1.4, rate: 1.5, dmg: 1.5 }, dash: { cd: 6, dur: 1.2, mul: 3 }, artillery: { cd: 6, dmg: 90, radius: 100, count: 2, flight: 1.5 } } },
      30: { name: '마왕',      hp: 60000, look: { body: '#4a2a6a', head: '#d9c6e6', weapon: 'sword' },  abil: { summon: { cd: 8, n: 3, kind: 'bomber' }, artillery: { cd: 5, dmg: 120, radius: 110, count: 2, flight: 1.5 }, shield: { cd: 14, dur: 3, red: 0.7 }, rage: { at: 0.4, speed: 1.4, rate: 1.5, dmg: 1.5 } } },
    },
    // 전직: 보스를 처치하면 직업(검사/궁수/사제) 하나를 골라 승급시킨다. 1단계에서 갈래를 고르고, 2단계로 한 번 더 강화된다.
    jobs: {
      sword: {
        t1: [
          { id: 'knight', name: '기사', desc: '체력 +60%, 받는 피해 -20%', mods: { hp: 0.6, def: 0.2 } },
          { id: 'fighter', name: '투사', desc: '공격력 +50%, 공격 속도 +20%', mods: { atk: 0.5, rate: 0.2 } },
        ],
        t2: {
          knight: [{ id: 'paladin', name: '성기사', desc: '체력 +50%, 받는 피해 -15%, 초당 체력 2% 회복', mods: { hp: 0.5, def: 0.15, regen: 0.02 } }],
          fighter: [{ id: 'blademaster', name: '검성', desc: '공격력 +60%, 주변 적에게 50% 베기 피해', mods: { atk: 0.6, cleave: 0.5 } }],
        },
      },
      archer: {
        t1: [
          { id: 'sniper', name: '저격수', desc: '공격력 +60%, 사거리 +60, 공격 속도 -15%', mods: { atk: 0.6, range: 60, rate: -0.15 } },
          { id: 'ranger', name: '속사수', desc: '공격 속도 +50%, 이동 속도 +15%', mods: { rate: 0.5, speed: 0.15 } },
        ],
        t2: {
          sniper: [{ id: 'deadeye', name: '명사수', desc: '공격력 +50%, 화살이 뒤의 적 1명을 관통', mods: { atk: 0.5, pierce: 1 } }],
          ranger: [{ id: 'stormarcher', name: '폭풍사수', desc: '공격 속도 +40%, 3번째 공격마다 화살 2발', mods: { rate: 0.4, multi: 3 } }],
        },
      },
      priest: {
        t1: [
          { id: 'cleric', name: '성직자', desc: '치유량 +60%, 치유 범위 +60', mods: { heal: 0.6, healRange: 60 } },
          { id: 'bishop', name: '주교', desc: '치유량 +20%, 쓰러진 아군을 라운드당 1회 부활', mods: { heal: 0.2, revive: 1 } },
        ],
        t2: {
          cleric: [{ id: 'highcleric', name: '대성직자', desc: '치유량 +50%, 치유 속도 +30%', mods: { heal: 0.5, healRate: 0.3 } }],
          bishop: [{ id: 'archbishop', name: '대주교', desc: '치유량 +30%, 부활 +1회', mods: { heal: 0.3, revive: 1 } }],
        },
      },
    },
    shots: { arc: 0.28, arcMin: 12, arcMax: 110, minT: 0.22 }, // 포물선 투사체: 거리에 비례해 높이 솟았다 떨어진다
    arrowSpeed: 430, shellSpeed: 360, enemyArrowSpeed: 400,
    balance: {
      countBase: 8, countLinear: 3, countQuad: 0.08, // 라운드별 적 수 = base + linear·r + quad·r²
      hpSlope: 0.055, hpSlopeLate: 0.16, lateFrom: 20, // 체력 배율: 선형, lateFrom(대혼란) 이후 기울기 증가
      dmgShare: 0.5,                                  // 공격력은 체력 증가분의 이 비율만 반영
      lateSpeed: 1.1,                                 // 대혼란 이후 적 이동 속도 배율
    },
    economy: { costGrowth: 1.06 }, // (임시값: 1.05는 너무 쉽고 1.08은 어려웠음 — 밸런스는 나중에 재조정) // 유닛을 하나 뽑을 때마다 모든 유닛의 비용이 이 배율만큼 오른다 (인구 제한은 없다)
    healAfterRound: 0.30, // 새 라운드 시작 시 생존 유닛 회복 비율
    // 카드/강화 수치
    upPct: { hp: 0.30, atk: 0.15, rate: 0.10, speed: 0.12 },
    auraBase: 300,
    cardVals: {                       // 카드 수치 (설명 문구와 효과가 모두 여기서 읽는다)
      coreAtk: 0.40, coreRate: 0.25, coreRange: 45, fortHp: 600, repair: 0.15, thorn: 0.9,
      guard: 0.30, charge: 0.40, chargeRate: 0.15, revive: 0.70, pierce: 0.40, bomb: 4.0, bombStep: 1.5,
      auraHeal: 0.025, auraAtk: 0.08, auraDef: 0.08, auraDefCap: 0.40, auraSpd: 0.06, auraBoost: 0.15,
    },
    rerolls: 2,
    rarityWeight: { common: 70, rare: 25, epic: 5 },
  };
  const UNIT_TYPES = ['sword', 'archer', 'priest']; // 직접 생산 가능한 유닛

  // ───────────── 유틸 ─────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // 공간 해시 격자: 근처 개체만 검사해서 개체 수가 많아도 느려지지 않게 한다.
  const gkey = (cx, cy) => (cx + 100) * 1000 + (cy + 100);
  function makeGrid(cell) { return { cell, map: new Map() }; }
  function gridAdd(g, e) {
    const k = gkey(Math.floor(e.x / g.cell), Math.floor(e.y / g.cell));
    let a = g.map.get(k);
    if (!a) { a = []; g.map.set(k, a); }
    a.push(e);
  }
  // (x,y)에서 가장자리 거리 range 이내의 가장 가까운 살아 있는 개체
  function nearest(g, x, y, range) {
    const c = g.cell, reach = range + 32;
    const x0 = Math.floor((x - reach) / c), x1 = Math.floor((x + reach) / c);
    const y0 = Math.floor((y - reach) / c), y1 = Math.floor((y + reach) / c);
    let best = null, bd = Infinity;
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const arr = g.map.get(gkey(cx, cy)); if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i]; if (e.dead) continue;
        const d = Math.hypot(e.x - x, e.y - y) - e.r;
        if (d <= range && d < bd) { bd = d; best = e; }
      }
    }
    return best;
  }
  function separate(list, g) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (e.dead || e.type === 'turret') continue;
      const cx = Math.floor(e.x / g.cell), cy = Math.floor(e.y / g.cell);
      for (let ax = cx - 1; ax <= cx + 1; ax++) for (let ay = cy - 1; ay <= cy + 1; ay++) {
        const arr = g.map.get(gkey(ax, ay)); if (!arr) continue;
        for (let j = 0; j < arr.length; j++) {
          const o = arr[j]; if (o === e || o.dead) continue;
          const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), m = e.r + o.r;
          if (d < m) {
            if (d < 0.001) { e.x += 0.5; continue; }
            const p = (m - d) * 0.35;
            e.x += (dx / d) * p; e.y += (dy / d) * p;
          }
        }
      }
    }
  }
  function moveToward(e, tx, ty, dt, stop, speedMul) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d <= stop || d < 0.001) return;
    const step = Math.min(e.speed * (speedMul || 1) * dt, d - stop);
    e.x += (dx / d) * step; e.y += (dy / d) * step;
  }

  // ───────────── 난이도 곡선 ─────────────
  // 체력은 선형, R20 이후 "대혼란" 단계에서 증가율이 커진다. 공격력은 체력 증가의 절반만 반영.
  // 난이도 수치는 CFG.balance에 모여 있다 (시뮬레이터가 덮어써서 조정한다)
  const enemyCount = r => { const b = CFG.balance; return Math.floor(b.countBase + b.countLinear * r + b.countQuad * r * r); };
  const hpMul = r => { const b = CFG.balance; return 1 + b.hpSlope * (Math.min(r, b.lateFrom) - 1) + b.hpSlopeLate * Math.max(0, r - b.lateFrom); };
  const dmgMul = r => 1 + CFG.balance.dmgShare * (hpMul(r) - 1);
  const spawnPointCount = r => (r >= 10 ? 6 : 4);
  // 스폰 지점 방향: 큰 길 4개(90도 간격) + 10라운드부터 샛길 2개(대각선). 배경의 길도 이 각도를 따른다.
  const spawnAngles = pts => { const b = 0.4, a = [0, 1, 2, 3].map(k => b + k * Math.PI / 2); if (pts >= 6) a.push(b + Math.PI / 4, b + 5 * Math.PI / 4); return a.slice(0, pts); };
  const enemySpeedMul = r => (r >= CFG.balance.lateFrom ? CFG.balance.lateSpeed : 1);
  // 비용 = 기본 비용 × 배율^(지금까지 뽑은 유닛 수). 모든 유닛 종류가 함께 오른다.
  const unitCostOf = (S, type) => Math.round(CFG.units[type].cost * Math.pow(CFG.economy.costGrowth, S.buyCount));

  // ───────────── 카드 정의 ─────────────
  const TN = { sword: '검사', archer: '궁수', priest: '사제' };
  const STAT_NAME = { hp: '체력', atk: '공격력', rate: '공격 속도', speed: '이동 속도' };
  // cat: unit(유닛 강화) / core(성채 강화) / summon(특수 소환)
  const CARD_DEFS = [
    // 유닛 강화 — 대상 유닛 종류는 카드가 나올 때 정해진다
    { id: 'u_hp',    cat: 'unit', rar: 'common', max: 5, generic: 'hp' },
    { id: 'u_atk',   cat: 'unit', rar: 'common', max: 5, generic: 'atk' },
    { id: 'u_rate',  cat: 'unit', rar: 'common', max: 4, generic: 'rate' },
    // 유닛 특성 (종류 고정)
    { id: 'u_guard',   cat: 'unit', rar: 'rare', max: 3, type: 'sword',  name: '검사 · 방어 자세', desc: l => '성채 주변(300)에서 검사가 받는 피해 -' + Math.round(V().guard * 100 * l) + '%' },
    { id: 'u_charge',  cat: 'unit', rar: 'rare', max: 2, type: 'sword',  name: '검사 · 돌진',      desc: l => '검사 접근 속도 +' + Math.round(V().charge * 100 * l) + '%, 공격 속도 +' + Math.round(V().chargeRate * 100 * l) + '%' },
    { id: 'u_pierce',  cat: 'unit', rar: 'rare', max: 3, type: 'archer', name: '궁수 · 관통 화살', desc: l => '화살이 뒤의 적 ' + l + '명에게 ' + Math.round(V().pierce * 100) + '% 피해' },
    { id: 'u_multi',   cat: 'unit', rar: 'rare', max: 3, type: 'archer', name: '궁수 · 연사',      desc: l => (5 - l) + '번째 공격마다 화살 2발' },
    { id: 'u_aoeheal', cat: 'unit', rar: 'rare', max: 3, type: 'priest', name: '사제 · 광역 치유', desc: l => '치유 대상 주변 아군도 ' + 35 * l + '% 회복' },
    { id: 'u_revive',  cat: 'unit', rar: 'epic', max: 3, type: 'priest', name: '사제 · 부활',      desc: l => '쓰러진 아군을 라운드당 ' + l + '회 체력 ' + Math.round(V().revive * 100) + '%로 부활' },
    // 성채 — 포격
    { id: 'c_atk',    cat: 'core', rar: 'common', max: 5, name: '성채 · 공격력',   desc: l => '성채 공격력 +' + Math.round(V().coreAtk * 100 * l) + '%' },
    { id: 'c_rate',   cat: 'core', rar: 'common', max: 4, name: '성채 · 공격 속도', desc: l => '성채 공격 속도 +' + Math.round(V().coreRate * 100 * l) + '%' },
    { id: 'c_range',  cat: 'core', rar: 'common', max: 3, name: '성채 · 사거리',   desc: l => '성채 사거리 +' + V().coreRange * l },
    { id: 'c_splash', cat: 'core', rar: 'rare',   max: 3, name: '폭발탄',          desc: l => '성채 탄이 맞은 적 주변 ' + (50 + 10 * l) + ' 범위에 50% 피해' },
    { id: 'c_chain',  cat: 'core', rar: 'rare',   max: 3, name: '연쇄 번개',       desc: l => '성채 공격이 주변 적 ' + (l + 1) + '마리로 전이 (60%)' },
    { id: 'c_bomb',   cat: 'core', rar: 'epic',   max: 3, name: '대형 포탄',       desc: l => (11 - l) + '초마다 적이 가장 밀집한 곳에 대폭격 (성채 공격력 ×' + (V().bomb + V().bombStep * (l - 1)) + ')' },
    // 성채 — 보급 오라 (성채 주변 아군 대상)
    { id: 'a_heal', cat: 'core', rar: 'common', max: 5, name: '치유 오라', desc: l => '오라 안 아군이 초당 최대 체력의 ' + +(V().auraHeal * 100 * l).toFixed(1) + '% 회복' },
    { id: 'a_atk',  cat: 'core', rar: 'common', max: 5, name: '군기 오라', desc: l => '오라 안 아군 공격력 +' + Math.round(V().auraAtk * 100 * l) + '%' },
    { id: 'a_def',  cat: 'core', rar: 'common', max: 5, name: '철벽 오라', desc: l => '오라 안 아군 받는 피해 -' + Math.min(Math.round(V().auraDefCap * 100), Math.round(V().auraDef * 100 * l)) + '%' },
    { id: 'a_spd',  cat: 'core', rar: 'common', max: 4, name: '신속 오라', desc: l => '오라 안 아군 이동·공격 속도 +' + Math.round(V().auraSpd * 100 * l) + '%' },
    { id: 'a_rad',  cat: 'core', rar: 'common', max: 4, name: '오라 강화', desc: l => '모든 오라 효과 +' + Math.round(V().auraBoost * 100 * l) + '%', needsAura: true },
    // 성채 — 요새
    { id: 'f_hp',     cat: 'core', rar: 'common', max: 5, name: '성채 · 체력',   desc: l => '성채 최대 체력 +' + V().fortHp * l + ' (즉시 회복)' },
    { id: 'f_repair', cat: 'core', rar: 'rare',   max: 3, name: '자동 수리',     desc: l => '라운드가 바뀔 때 성채 체력 ' + Math.round(V().repair * 100 * l) + '% 회복' },
    { id: 'f_thorn',  cat: 'core', rar: 'rare',   max: 3, name: '가시 방벽',     desc: l => '성채를 때린 적에게 그 피해의 ' + Math.round(V().thorn * 100 * l) + '% 반사' },
    // 특수 소환
    { id: 's_turret', cat: 'summon', rar: 'rare',   max: 3,  name: '자동 포탑',       desc: l => '성채 옆에 자동 포탑 설치 (' + l + '/3) · 설치하면 모든 유닛 가격이 오른다' },
    { id: 's_golem',  cat: 'summon', rar: 'epic',   max: 1,  name: '골렘 소환',       desc: () => '거대한 탱커 골렘을 영구 소환 · 소환하면 모든 유닛 가격이 오른다' },
    { id: 's_hero',   cat: 'summon', rar: 'epic',   max: 1,  name: '용사 소환',       desc: () => '강력한 근접 영웅 용사를 영구 소환 · 소환하면 모든 유닛 가격이 오른다' },
  ];
  const V = () => CFG.cardVals;
  const DEF = Object.fromEntries(CARD_DEFS.map(d => [d.id, d]));
  const AURA_IDS = ['a_heal', 'a_atk', 'a_def', 'a_spd'];

  function genericText(def, type, lv) {
    const p = Math.round(CFG.upPct[def.generic] * 100 * lv * (type === 'priest' ? 2 : 1));
    const priest = type === 'priest';
    const stat = def.generic === 'atk' && priest ? '치유량' : def.generic === 'rate' && priest ? '치유 속도' : STAT_NAME[def.generic];
    return { name: TN[type] + ' · ' + stat, desc: TN[type] + ' ' + stat + ' +' + p + '% (Lv ' + lv + '/' + def.max + ')' };
  }
  function makeCard(S, def, type) {
    const key = type && def.generic ? def.id + ':' + type : def.id;
    const lv = (S.cards.taken[key] || 0) + 1;
    let name, desc;
    if (def.generic) ({ name, desc } = genericText(def, type, lv));
    else { name = def.name; desc = def.desc(lv) + (def.max > 1 && def.max < 99 ? ' (Lv ' + lv + '/' + def.max + ')' : ''); }
    return { key, id: def.id, cat: def.cat, rar: def.rar, type: type || def.type || null, name, desc, lv };
  }
  const taken = (S, id) => S.cards.taken[id] || 0;

  // 지금 나올 수 있는 카드 후보
  function eligible(S) {
    const out = [];
    const owned = UNIT_TYPES.filter(t => S.units.some(u => u.type === t && !u.dead));
    for (const def of CARD_DEFS) {
      if (def.generic) {
        for (const t of UNIT_TYPES) if (taken(S, def.id + ':' + t) < def.max) out.push({ def, type: t, w: owned.includes(t) ? 3 : 1 });
      } else if (taken(S, def.id) < def.max) {
        if (def.needsAura && !AURA_IDS.some(a => taken(S, a) > 0)) continue;
        // 유닛 특성은 해당 유닛을 이미 가진 경우에 더 자주 나온다
        out.push({ def, type: def.type || null, w: def.type && owned.includes(def.type) ? 3 : 1 });
      }
    }
    return out;
  }
  function rollRarity(S) {
    const w = CFG.rarityWeight, tot = w.common + w.rare + w.epic;
    const r = S.rng() * tot;
    return r < w.common ? 'common' : r < w.common + w.rare ? 'rare' : 'epic';
  }
  function pickFrom(S, cands) {
    const tot = cands.reduce((a, c) => a + c.w, 0);
    let r = S.rng() * tot;
    for (const c of cands) { if ((r -= c.w) < 0) return c; }
    return cands[cands.length - 1];
  }
  function generateOffer(S, guarantee) {
    const pool = eligible(S), offer = [], used = new Set();
    const take = rar => {
      let cands = pool.filter(c => (!rar || c.def.rar === rar) && !used.has(c.def.id + ':' + (c.type || '')));
      if (!cands.length) cands = pool.filter(c => !used.has(c.def.id + ':' + (c.type || '')));
      if (!cands.length) return null;
      const c = pickFrom(S, cands); used.add(c.def.id + ':' + (c.type || ''));
      return makeCard(S, c.def, c.type);
    };
    for (let i = 0; i < 3; i++) { const c = take(rollRarity(S)); if (c) offer.push(c); }
    if (guarantee && offer.length && !offer.some(c => c.rar !== 'common')) {
      const c = take(S.rng() < 0.8 ? 'rare' : 'epic');
      if (c && c.rar !== 'common') offer[0] = c;
    }
    return offer;
  }
  function openCards(S, boss) {
    if (boss) S.cards.rerolls += 1;
    S.cards.boss = boss;
    S.cards.offer = generateOffer(S, boss);
    if (!S.cards.offer.length) S.cards.offer = null;
  }
  function reroll(S) {
    if (!S.cards.offer || S.cards.rerolls <= 0) return false;
    S.cards.rerolls--; S.cards.offer = generateOffer(S, S.cards.boss);
    return true;
  }
  // ───────────── 전직 ─────────────
  function jobOptions(S) {
    const out = [];
    for (const type of UNIT_TYPES) {
      const ids = S.jobs[type].ids, tier = ids.length, j = CFG.jobs[type];
      const defs = tier === 0 ? j.t1 : tier === 1 ? (j.t2[ids[0]] || []) : [];
      for (const d of defs) out.push({ type, className: CFG.units[type].name, tier: tier + 1, id: d.id, name: d.name, desc: d.desc });
    }
    return out;
  }
  function openJobs(S, bossName) {
    const opts = jobOptions(S); if (!opts.length) return;
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(S.rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    S.jobs.offer = { boss: bossName, list: opts.slice(0, 3) };
  }
  function pickJob(S, idx) {
    const o = S.jobs.offer && S.jobs.offer.list[idx]; if (!o) return false;
    const before = S.jobMods[o.type].revive;
    S.jobs[o.type].ids.push(o.id); S.jobs.offer = null;
    recompute(S); S.reviveLeft += S.jobMods[o.type].revive - before;
    for (const u of S.units) if (u.type === o.type && !u.dead) refreshUnit(S, u);
    emit(S, { type: 'promote', unitType: o.type, className: o.className, name: o.name, tier: o.tier });
    return true;
  }
  function describeJobs(S) {
    return UNIT_TYPES.filter(t => S.jobs[t].ids.length).map(t => ({ type: t, className: CFG.units[t].name, names: S.jobs[t].ids.map(id => jobDef(t, id).name) }));
  }

  function pickCard(S, idx) {
    const c = S.cards.offer && S.cards.offer[idx]; if (!c) return false;
    S.cards.taken[c.key] = (S.cards.taken[c.key] || 0) + 1;
    S.cards.offer = null;
    if (c.cat === 'unit' && DEF[c.id].generic) {
      const stat = DEF[c.id].generic; S.up[c.type][stat]++;
      for (const u of S.units) if (u.type === c.type && !u.dead) refreshUnit(S, u);
    }
    const oldMax = S.core.max;
    recompute(S);
    if (S.core.max > oldMax) S.core.hp += S.core.max - oldMax;
    const summon = { s_turret: 'turret', s_golem: 'golem', s_hero: 'hero' }[c.id];
    if (summon) { addUnit(S, summon); S.buyCount += CFG.units[summon].priceSteps || 1; emit(S, { type: 'priceUp' }); } // 특수 소환도 유닛 가격을 올린다
    emit(S, { type: 'picked', name: c.name });
    return true;
  }
  // 카드 선택 결과로 달라지는 값을 한 곳에서 다시 계산
  function recompute(S) {
    const L = id => taken(S, id), c = S.core, b = CFG.core;
    const v = V();
    c.max = b.hp + v.fortHp * L('f_hp');
    c.atk = b.atk * (1 + v.coreAtk * L('c_atk'));
    c.rate = b.rate * (1 + v.coreRate * L('c_rate'));
    c.range = b.range + v.coreRange * L('c_range');
    const boost = 1 + v.auraBoost * L('a_rad');
    S.aura = { heal: v.auraHeal * L('a_heal') * boost, atk: v.auraAtk * L('a_atk') * boost, def: Math.min(v.auraDefCap, v.auraDef * L('a_def') * boost), spd: v.auraSpd * L('a_spd') * boost, r: CFG.auraBase,
               on: AURA_IDS.some(a => L(a) > 0) };
    S.jobMods = { sword: jobModsOf(S, 'sword'), archer: jobModsOf(S, 'archer'), priest: jobModsOf(S, 'priest') };
    S.perks = { guard: L('u_guard'), charge: L('u_charge'), pierce: L('u_pierce'), multi: L('u_multi'), aoeHeal: L('u_aoeheal'), revive: L('u_revive'),
                splash: L('c_splash'), chain: L('c_chain'), bomb: L('c_bomb'), thorn: L('f_thorn'), repair: L('f_repair') };
  }
  // 전직 효과 합산 (유닛 종류별)
  const zeroMods = () => ({ hp: 0, atk: 0, rate: 0, speed: 0, def: 0, regen: 0, cleave: 0, range: 0, pierce: 0, multi: 0, heal: 0, healRange: 0, healRate: 0, revive: 0 });
  function jobDef(type, id) {
    const j = CFG.jobs[type]; if (!j) return null;
    for (const d of j.t1) if (d.id === id) return d;
    for (const k in j.t2) for (const d of j.t2[k]) if (d.id === id) return d;
    return null;
  }
  function jobModsOf(S, type) {
    const m = zeroMods(), ids = S.jobs[type] ? S.jobs[type].ids : [];
    for (const id of ids) { const d = jobDef(type, id); if (!d) continue; for (const k in d.mods) { if (k === 'multi') m.multi = m.multi ? Math.min(m.multi, d.mods.multi) : d.mods.multi; else m[k] += d.mods[k]; } }
    return m;
  }
  const pierceCount = S => S.perks.pierce + S.jobMods.archer.pierce;
  // 유닛 종류별 강화 수치 반영
  function statsOf(S, type) {
    // 사제는 유닛 수가 적어서 강화 효과를 2배로 쳐 준다
    const k = type === 'priest' ? 2 : 1;
    const b = CFG.units[type], l = S.up[type] || { hp: 0, atk: 0, rate: 0, speed: 0 }, p = Object.fromEntries(Object.entries(CFG.upPct).map(([n, v]) => [n, v * k]));
    const jm = (S.jobMods && S.jobMods[type]) || zeroMods();
    return {
      max: Math.round(b.hp * (1 + p.hp * l.hp) * (1 + jm.hp)), atk: b.atk * (1 + p.atk * l.atk) * (1 + jm.atk), rate: b.rate * (1 + p.rate * l.rate) * (1 + jm.rate),
      speed: b.speed * (1 + p.speed * l.speed) * (1 + jm.speed), heal: (b.heal || 0) * (1 + p.atk * l.atk) * (1 + jm.heal),
      healRate: b.healRate ? b.healRate / ((1 + p.rate * l.rate) * (1 + jm.healRate)) : 0, range: (b.range || 0) + jm.range, healRange: (b.healRange || 0) + jm.healRange,
    };
  }
  function refreshUnit(S, u) {
    const s = statsOf(S, u.type);
    if (s.max > u.max) u.hp += s.max - u.max;
    u.max = s.max; u.atk = s.atk; u.rate = s.rate; u.speed = s.speed; u.heal = s.heal; u.healRate = s.healRate; u.range = s.range; u.healRange = s.healRange;
    const ids = S.jobs[u.type] ? S.jobs[u.type].ids : []; u.job = ids.length ? ids[ids.length - 1] : null; u.jobTier = ids.length;
    if (u.hp > u.max) u.hp = u.max;
  }
  function describeTaken(S) {
    const out = [];
    for (const key in S.cards.taken) {
      const [id, type] = key.split(':'), def = DEF[id], lv = S.cards.taken[key];
      const name = def.generic ? genericText(def, type, lv).name : def.name;
      out.push({ key, name, lv, rar: def.rar });
    }
    return out;
  }

  // ───────────── 게임 생성 ─────────────
  function createGame(seed) {
    const S = {
      seed: seed >>> 0, rng: mulberry32(seed >>> 0),
      t: 0, phase: 'prep', prepT: PREP_TIME, round: 0, roundT: 0,
      queue: [], spawnT: 0, spawnGap: 1, spawnPts: 4,
      gold: CFG.startGold, buyCount: 0,
      core: { x: CX, y: CY, hp: CFG.core.hp, max: CFG.core.hp, r: CFG.core.r, atk: CFG.core.atk, rate: CFG.core.rate, range: CFG.core.range, cd: 0, flash: 0, aim: -Math.PI / 2, swing: 0 },
      units: [], enemies: [], shots: [],
      kills: 0, nextId: 1,
      spawnN: 0, buyCd: { sword: 0, archer: 0, priest: 0 },
      threat: 0, over: false, win: false,
      captureEvents: false, events: [],
      gU: makeGrid(48), gE: makeGrid(48),
      cards: { offer: null, rerolls: CFG.rerolls, taken: {}, boss: false },
      up: { sword: { hp: 0, atk: 0, rate: 0, speed: 0 }, archer: { hp: 0, atk: 0, rate: 0, speed: 0 }, priest: { hp: 0, atk: 0, rate: 0, speed: 0 } },
      aura: null, perks: null, bombCd: 8, reviveLeft: 0, jobMods: null, biasNow: 0.08,
      jobs: { sword: { ids: [] }, archer: { ids: [] }, priest: { ids: [] }, offer: null },
    };
    recompute(S);
    return S;
  }
  function emit(S, ev) { if (S.captureEvents && S.events.length < 600) S.events.push(ev); }
  function drainEvents(S) { const e = S.events; S.events = []; return e; }

  // ───────────── 유닛 추가 (생산/소환 공통) ─────────────
  function addUnit(S, type) {
    const cfg = CFG.units[type], st = statsOf(S, type);
    const a = S.rng() * Math.PI * 2, rr = 70 + S.rng() * 20;
    const ha = S.spawnN++ * 2.39996323 + S.rng() * 0.3, hr = (CFG.ai.homeR[type] || 120) * (0.9 + 0.2 * S.rng()); // 황금각으로 사방에 퍼뜨림
    let x = CX + Math.cos(a) * rr, y = CY + Math.sin(a) * rr;
    if (type === 'turret') {
      const n = S.units.filter(u => u.type === 'turret' && !u.dead).length, ta = n * Math.PI + 0.8;
      x = CX + Math.cos(ta) * 105; y = CY + Math.sin(ta) * 105;
    }
    const u = {
      id: S.nextId++, type, team: 'u', x, y,
      hp: st.max, max: st.max, atk: st.atk, rate: st.rate, range: st.range, speed: st.speed, r: cfg.r,
      heal: st.heal, healRate: st.healRate, healRange: st.healRange,
      job: (S.jobs[type] && S.jobs[type].ids.length) ? S.jobs[type].ids[S.jobs[type].ids.length - 1] : null, jobTier: S.jobs[type] ? S.jobs[type].ids.length : 0,
      cd: 0, flash: 0, swing: 0, dead: false, ha, hr, hx: CX + Math.cos(ha) * hr, hy: CY + Math.sin(ha) * hr,
      aura: 0, n: 0,
    };
    S.units.push(u);
    emit(S, { type: 'spawn', x: u.x, y: u.y });
    return u;
  }

  // ───────────── 플레이어 행동 ─────────────
  function buy(S, type) {
    if (S.over) return { ok: false, reason: 'over' };
    if (!UNIT_TYPES.includes(type)) return { ok: false, reason: 'type' };
    const cfg = CFG.units[type];
    if (S.buyCd[type] > 0) return { ok: false, reason: 'cooldown' };
    const cost = unitCostOf(S, type);
    if (S.gold < cost) return { ok: false, reason: 'gold' };
    S.gold -= cost; S.buyCd[type] = cfg.buyCd; S.buyCount++;
    return { ok: true, unit: addUnit(S, type), cost };
  }

  // ───────────── 라운드 ─────────────
  function startRound(S) {
    S.phase = 'round'; S.round++; S.roundT = 0;
    const r = S.round;
    S.reviveLeft = S.perks.revive + S.jobMods.priest.revive;
    if (r > 1) {
      S.gold += 15 + 2 * r;
      for (const u of S.units) if (!u.dead) u.hp = Math.min(u.max, u.hp + u.max * CFG.healAfterRound);
      if (S.perks.repair) S.core.hp = Math.min(S.core.max, S.core.hp + S.core.max * V().repair * S.perks.repair);
    }
    S.spawnPts = spawnPointCount(r);
    const n = enemyCount(r), q = [];
    const kinds = Object.keys(CFG.spawn).filter(k => r >= CFG.spawn[k].from), tot = kinds.reduce((t, k) => t + CFG.spawn[k].w, 0);
    for (let i = 0; i < n; i++) {
      let x = S.rng() * tot, pick = kinds[0];
      for (const k of kinds) { if ((x -= CFG.spawn[k].w) < 0) { pick = k; break; } }
      q.push(pick);
    }
    const boss = CFG.bosses[r];
    if (boss) q.unshift('boss'); // 보스 라운드에는 시작과 동시에 보스가 나온다
    S.queue = q; S.spawnGap = SPAWN_TIME / q.length; S.spawnT = 0;
    let text = '라운드 ' + r;
    if (r === 10) text += ' · 스폰 지점 증가';
    if (r === 20) text += ' · 대혼란';
    emit(S, boss ? { type: 'banner', text: '⚠ 보스 라운드 · ' + boss.name, boss: true } : { type: 'banner', text });
    const next = CFG.bosses[r + 1];
    if (next) emit(S, { type: 'notice', text: '다음 라운드 보스: ' + next.name });
    if (r >= 2) openCards(S, (r - 1) % 5 === 0); // 라운드를 넘길 때마다 업그레이드 선택 (보스 클리어 직후엔 희귀 이상 보장)
  }
  // 적 한 마리 만들기. x,y를 주지 않으면 스폰 지점에서 나온다.
  function spawnEnemy(S, kind, x, y) {
    const cfg = CFG.enemies[kind], r = S.round;
    if (x === undefined) {
      const angs = spawnAngles(S.spawnPts), k = Math.floor(S.rng() * angs.length);
      const ang = angs[k] + (S.rng() - 0.5) * 0.12;
      x = clamp(CX + Math.cos(ang) * SPAWN_RING + (S.rng() - 0.5) * 80, 20, W - 20);
      y = clamp(CY + Math.sin(ang) * SPAWN_RING + (S.rng() - 0.5) * 80, 20, H - 20);
    }
    const bd = kind === 'boss' ? (CFG.bosses[r] || CFG.bosses[30]) : null;
    const hp = bd ? bd.hp : Math.round(cfg.hp * hpMul(r));
    const e = {
      id: S.nextId++, kind, team: 'e', x, y, hp, max: hp, dmg: cfg.dmg * dmgMul(r), rate: cfg.rate, range: cfg.range,
      speed: cfg.speed * enemySpeedMul(r), r: cfg.r, gold: cfg.gold, aggro: cfg.aggro,
      cd: 0, age: 0, flash: 0, swing: 0, dead: false,
      ranged: !!cfg.ranged, blast: cfg.blast || 0, healRange: cfg.healRange || 0, healPct: cfg.healPct || 0, healRate: cfg.healRate || 0, keep: cfg.keep || 0,
      speedMul: 1, rateMul: 1, dmgMul: 1, shieldT: 0, shieldRed: 0, dashT: 0,
    };
    if (bd) {
      e.bossName = bd.name; e.look = bd.look; e.abil = bd.abil; e.t = {};
      for (const k in bd.abil) e.t[k] = (bd.abil[k].cd || 0) * 0.6; // 첫 패턴은 조금 일찍
      emit(S, { type: 'bossSpawn', name: bd.name });
    }
    S.enemies.push(e);
    emit(S, { type: 'espawn', x, y, boss: !!bd }); // 나타나는 순간 효과
    return e;
  }

  // ───────────── 피해/사망 ─────────────
  function hitCore(S, dmg) {
    const c = S.core; c.hp -= dmg; c.flash = 0.12;
    if (c.hp <= 0 && !S.over) { c.hp = 0; S.over = true; S.win = false; emit(S, { type: 'over', win: false }); }
  }
  function damage(S, tgt, dmg) {
    if (tgt.dead) return;
    if (tgt.team === 'e' && tgt.shieldT > 0) dmg *= 1 - tgt.shieldRed; // 보스 방어막 동안 피해 감소
    if (tgt.team === 'u') {
      let red = 0;
      if (tgt.aura) red += S.aura.def;
      if (S.perks.guard && tgt.type === 'sword' && Math.hypot(tgt.x - CX, tgt.y - CY) <= 300) red += V().guard * S.perks.guard;
      if (S.jobMods && S.jobMods[tgt.type]) red += S.jobMods[tgt.type].def; // 전직 방어
      dmg *= 1 - Math.min(0.7, red);
    }
    tgt.hp -= dmg; tgt.flash = 0.1;
    if (tgt.hp > 0) return;
    if (tgt.team === 'u' && S.reviveLeft > 0 && tgt.type !== 'turret' && S.units.some(p => p.type === 'priest' && !p.dead && p !== tgt)) {
      S.reviveLeft--; tgt.hp = tgt.max * V().revive; emit(S, { type: 'revive', x: tgt.x, y: tgt.y }); return;
    }
    tgt.dead = true;
    if (tgt.team === 'e') {
      S.gold += tgt.gold; S.kills++; emit(S, { type: 'kill', x: tgt.x, y: tgt.y, boss: tgt.kind === 'boss' });
      if (tgt.kind === 'boss' && S.round < MAX_ROUND) openJobs(S, tgt.bossName); // 보스를 처치하면 전직 선택
    }
    else emit(S, { type: 'udead', x: tgt.x, y: tgt.y });
  }
  // 투사체: 지면 위치(x,y)는 목표를 향해 직선으로 가고, 높이(h)가 포물선을 그린다. 도착하면 피해.
  function fire(S, from, tgt, dmg, spd, color, extra) {
    const dx = tgt.x - from.x, dy = tgt.y - from.y, d = Math.hypot(dx, dy), cf = CFG.shots;
    const T = extra && extra.T ? extra.T : Math.max(cf.minT, d / spd);
    const H = clamp(cf.arc * d + cf.arcMin, cf.arcMin, cf.arcMax);
    S.shots.push(Object.assign({ x: from.x, y: from.y, sx: from.x, sy: from.y, p: 0, T, H, h: 0, vx: 0, vy: 0, vh: 0, t: tgt, dmg, color }, extra || null));
  }
  // 도착한 투사체 처리
  function resolveShot(S, s) {
    if (s.aoe) { // 보스 포격: 떨어진 지점 주변 범위 피해
      for (const u of S.units) if (!u.dead && Math.hypot(u.x - s.t.x, u.y - s.t.y) <= s.aoe + u.r) damage(S, u, s.dmg);
      if (Math.hypot(S.core.x - s.t.x, S.core.y - s.t.y) <= s.aoe + S.core.r) hitCore(S, s.dmg);
      emit(S, { type: 'boom', x: s.t.x, y: s.t.y, r: s.aoe, big: true, enemy: true });
    } else if (s.t === S.core) hitCore(S, s.dmg);
    else { damage(S, s.t, s.dmg); onShotHit(S, s); }
  }
  // 성채 탄 / 화살의 추가 효과 (폭발, 전이, 관통)
  function onShotHit(S, s) {
    const t = s.t;
    if (s.color === 'c') {
      if (S.perks.splash) {
        const R = 50 + 10 * S.perks.splash;
        for (const e of S.enemies) if (!e.dead && e !== t && Math.hypot(e.x - t.x, e.y - t.y) <= R + e.r) damage(S, e, s.dmg * 0.5);
        emit(S, { type: 'boom', x: t.x, y: t.y, r: R });
      }
      if (S.perks.chain) {
        const seen = new Set([t]); let cur = t;
        for (let i = 0; i < S.perks.chain + 1; i++) {
          let best = null, bd = 140;
          for (const e of S.enemies) { if (e.dead || seen.has(e)) continue; const d = Math.hypot(e.x - cur.x, e.y - cur.y); if (d < bd) { bd = d; best = e; } }
          if (!best) break;
          seen.add(best); emit(S, { type: 'chain', x: cur.x, y: cur.y, tx: best.x, ty: best.y });
          damage(S, best, s.dmg * 0.6); cur = best;
        }
      }
    } else if (s.pierce) {
      const seen = new Set([t]); let cur = t;
      for (let i = 0; i < pierceCount(S); i++) {
        let best = null, bd = 80;
        for (const e of S.enemies) { if (e.dead || seen.has(e)) continue; const d = Math.hypot(e.x - cur.x, e.y - cur.y); if (d < bd) { bd = d; best = e; } }
        if (!best) break;
        seen.add(best); emit(S, { type: 'chain', x: cur.x, y: cur.y, tx: best.x, ty: best.y, small: true });
        damage(S, best, s.dmg * V().pierce); cur = best;
      }
    }
  }
  function bigBomb(S) {
    const lv = S.perks.bomb, c = S.core;
    const cand = S.enemies.filter(e => !e.dead && Math.hypot(e.x - c.x, e.y - c.y) <= c.range + 360);
    if (!cand.length) { S.bombCd = 1; return; }
    const step = Math.max(1, Math.floor(cand.length / 40));
    let best = null, bn = -1;
    for (let i = 0; i < cand.length; i += step) {
      let n = 0; for (const e of cand) if (Math.hypot(e.x - cand[i].x, e.y - cand[i].y) <= 120) n++;
      if (n > bn) { bn = n; best = cand[i]; }
    }
    const dmg = c.atk * (V().bomb + V().bombStep * (lv - 1));
    for (const e of cand) if (!e.dead && Math.hypot(e.x - best.x, e.y - best.y) <= 120 + e.r) damage(S, e, dmg);
    emit(S, { type: 'boom', x: best.x, y: best.y, r: 120, big: true });
    S.bombCd = 11 - lv;
  }

  // ───────────── 유닛 AI ─────────────
  function lowestAlly(S, u, range) {
    let best = null, bp = 1;
    for (const a of S.units) {
      if (a.dead || a.hp >= a.max) continue;
      if (Math.hypot(a.x - u.x, a.y - u.y) - a.r > range) continue;
      const p = a.hp / a.max; if (p < bp) { bp = p; best = a; }
    }
    return best;
  }
  function updatePriest(S, u, dt) {
    u.cd -= dt;
    const spm = 1 + (u.aura ? S.aura.spd : 0);
    const near = nearest(S.gE, u.x, u.y, 90);
    if (near) {
      const dx = u.x - near.x, dy = u.y - near.y, d = Math.hypot(dx, dy) || 1;
      u.x += (dx / d) * u.speed * spm * dt; u.y += (dy / d) * u.speed * spm * dt;
    } else {
      const hurt = lowestAlly(S, u, 420);
      if (hurt && hurt !== u) moveToward(u, hurt.x, hurt.y, dt, u.healRange * 0.6, spm);
      else moveToward(u, u.hx, u.hy, dt, 6, spm);
    }
    if (u.cd <= 0) {
      const t = lowestAlly(S, u, u.healRange);
      if (t) {
        const amt = u.heal * (1 + (u.aura ? S.aura.atk : 0));
        t.hp = Math.min(t.max, t.hp + amt); u.cd = u.healRate / spm; u.swing = 0.35; u.aim = Math.atan2(t.y - u.y, t.x - u.x);
        emit(S, { type: 'heal', x: u.x, y: u.y, tx: t.x, ty: t.y });
        if (S.perks.aoeHeal) {
          for (const a of S.units) if (!a.dead && a !== t && Math.hypot(a.x - t.x, a.y - t.y) <= 120) a.hp = Math.min(a.max, a.hp + amt * 0.35 * S.perks.aoeHeal);
        }
      }
    }
  }
  function updateFighter(S, u, dt) {
    u.cd -= dt;
    const melee = u.range < 60;
    const spm = 1 + (u.aura ? S.aura.spd : 0);
    const atk = u.atk * (1 + (u.aura ? S.aura.atk : 0));
    const fromCore = Math.hypot(u.x - CX, u.y - CY);
    const cfg = CFG.units[u.type], aggro = cfg.aggro;
    const rush = (u.type === 'sword' && S.perks.charge) ? 1 + V().charge * S.perks.charge : 1;
    const stopFor = tgt => (melee ? u.range + u.r + tgt.r - 2 : u.range * 0.85 + tgt.r);
    let tgt = nearest(S.gE, u.x, u.y, aggro);
    if (tgt && Math.hypot(tgt.x - CX, tgt.y - CY) > CFG.leash) tgt = null; // 성채에서 너무 먼 적은 쫓지 않는다
    if (tgt && fromCore <= CFG.leash + 40) moveToward(u, tgt.x, tgt.y, dt, stopFor(tgt), spm * rush);
    else moveToward(u, u.hx, u.hy, dt, 6, spm);
    if (u.cd <= 0) {
      const t = nearest(S.gE, u.x, u.y, u.range + u.r);
      if (t) {
        const chargeRate = (u.type === 'sword' && S.perks.charge) ? 1 + V().chargeRate * S.perks.charge : 1;
        u.cd = 1 / (u.rate * spm * chargeRate); u.swing = 0.25; u.aim = Math.atan2(t.y - u.y, t.x - u.x);
        if (melee) {
          damage(S, t, atk);
          const cl = S.jobMods[u.type] ? S.jobMods[u.type].cleave : 0; // 검성: 주변 적에게 베기 피해
          if (cl) for (const o of S.enemies) if (!o.dead && o !== t && Math.hypot(o.x - t.x, o.y - t.y) <= 46 + o.r) damage(S, o, atk * cl);
        } else {
          const arrow = pierceCount(S) > 0 && u.type === 'archer' || S.perks.pierce ? { pierce: true } : null;
          fire(S, u, t, atk, CFG.arrowSpeed, 'a', arrow);
          u.n++;
          const every = Math.min(S.perks.multi ? 5 - S.perks.multi : 99, S.jobMods.archer.multi || 99);
          if (u.type === 'archer' && every < 99 && u.n % every === 0) fire(S, u, t, atk, CFG.arrowSpeed, 'a', arrow);
        }
      }
    }
  }
  function updateTurret(S, u, dt) {
    u.cd -= dt;
    if (u.cd > 0) return;
    const t = nearest(S.gE, u.x, u.y, u.range);
    if (t) { u.cd = 1 / (u.rate * (1 + (u.aura ? S.aura.spd : 0))); u.swing = 0.2; u.aim = Math.atan2(t.y - u.y, t.x - u.x); fire(S, u, t, u.atk * (1 + (u.aura ? S.aura.atk : 0)), CFG.arrowSpeed + 60, 't'); }
  }

  // ───────────── 적 AI ─────────────
  // 보스 고유 패턴: 돌진 / 소환 / 포격 / 방어막 / 분노. 속도·공격 배율은 e.speedMul 등에 반영된다.
  function bossTick(S, e, dt) {
    const A = e.abil;
    e.speedMul = 1; e.rateMul = 1; e.dmgMul = 1;
    if (A.rage && e.hp <= e.max * A.rage.at) {
      if (!e.enraged) { e.enraged = true; emit(S, { type: 'bossRage', name: e.bossName, x: e.x, y: e.y }); }
      e.speedMul *= A.rage.speed; e.rateMul = A.rage.rate; e.dmgMul = A.rage.dmg;
    }
    if (A.dash) {
      if (e.dashT > 0) { e.dashT -= dt; e.speedMul *= A.dash.mul; }
      else { e.t.dash -= dt; if (e.t.dash <= 0) { e.dashT = A.dash.dur; e.t.dash = A.dash.cd; emit(S, { type: 'bossDash', x: e.x, y: e.y }); } }
    }
    if (A.shield) {
      if (e.shieldT > 0) e.shieldT -= dt;
      else { e.t.shield -= dt; if (e.t.shield <= 0) { e.shieldT = A.shield.dur; e.shieldRed = A.shield.red; e.t.shield = A.shield.cd; emit(S, { type: 'bossShield', x: e.x, y: e.y }); } }
    }
    if (A.summon) {
      e.t.summon -= dt;
      if (e.t.summon <= 0) {
        e.t.summon = A.summon.cd;
        for (let i = 0; i < A.summon.n; i++) { const a = S.rng() * Math.PI * 2, d = 60 + S.rng() * 40; spawnEnemy(S, A.summon.kind, clamp(e.x + Math.cos(a) * d, 20, W - 20), clamp(e.y + Math.sin(a) * d, 20, H - 20)); }
        emit(S, { type: 'bossSummon', x: e.x, y: e.y });
      }
    }
    if (A.artillery) {
      e.t.artillery -= dt;
      if (e.t.artillery <= 0) {
        e.t.artillery = A.artillery.cd;
        const near = S.units.filter(u => !u.dead && Math.hypot(u.x - e.x, u.y - e.y) <= 900);
        for (let i = 0; i < A.artillery.count; i++) {
          const tg = near.length ? near[Math.floor(S.rng() * near.length)] : S.core;
          const gt = { x: tg.x + (S.rng() - 0.5) * 40, y: tg.y + (S.rng() - 0.5) * 40, r: 0 }; // 떨어질 지점 (미리 표시된다)
          fire(S, e, gt, A.artillery.dmg * dmgMul(S.round) / Math.max(1, dmgMul(S.round) * 0.6), 0, 'es', { T: A.artillery.flight, aoe: A.artillery.radius });
        }
        e.swing = 0.4;
      }
    }
  }
  function explode(S, e) {
    const R = e.blast;
    for (const u of S.units) if (!u.dead && Math.hypot(u.x - e.x, u.y - e.y) <= R + u.r) damage(S, u, e.dmg);
    if (Math.hypot(S.core.x - e.x, S.core.y - e.y) <= R + S.core.r) hitCore(S, e.dmg);
    emit(S, { type: 'boom', x: e.x, y: e.y, r: R, enemy: true });
    e.dead = true; // 자폭: 골드/처치 수 없음
  }
  function updateShaman(S, e, dt) {
    e.cd -= dt;
    const c = S.core;
    if (Math.hypot(c.x - e.x, c.y - e.y) > e.keep) moveToward(e, c.x, c.y, dt, e.keep, 1);
    if (e.cd <= 0) {
      const hurt = [];
      for (const a of S.enemies) if (!a.dead && a !== e && a.hp < a.max && Math.hypot(a.x - e.x, a.y - e.y) <= e.healRange) hurt.push(a);
      if (hurt.length) {
        hurt.sort((p, q) => p.hp / p.max - q.hp / q.max);
        for (const a of hurt.slice(0, 3)) { a.hp = Math.min(a.max, a.hp + a.max * e.healPct); emit(S, { type: 'heal', x: e.x, y: e.y, tx: a.x, ty: a.y, enemy: true }); }
        e.cd = e.healRate; e.swing = 0.35; e.aim = Math.atan2(hurt[0].y - e.y, hurt[0].x - e.x);
      } else e.cd = 0.4;
    }
  }
  function updateEnemy(S, e, dt) {
    e.cd -= dt; e.age += dt;
    let boost = 1;
    if (e.age > ENRAGE_AFTER) boost += 0.1 * Math.ceil((e.age - ENRAGE_AFTER) / 10);
    if (e.abil) bossTick(S, e, dt);
    if (e.kind === 'shaman') return updateShaman(S, e, dt);
    const c = S.core, spm = e.speedMul, dmg = e.dmg * boost * e.dmgMul, cdTime = 1 / (e.rate * e.rateMul || 1);
    const tgt = nearest(S.gU, e.x, e.y, e.aggro);
    if (e.ranged) { // 사수: 사거리 끝에서 멈춰 포물선 화살을 쏜다
      const t = tgt || c, d = Math.hypot(t.x - e.x, t.y - e.y) - t.r - e.r;
      if (d > e.range * 0.9) moveToward(e, t.x, t.y, dt, e.range * 0.9 + t.r + e.r, spm);
      if (e.cd <= 0 && d <= e.range) { e.cd = cdTime; e.swing = 0.25; e.aim = Math.atan2(t.y - e.y, t.x - e.x); fire(S, e, t, dmg, CFG.enemyArrowSpeed, 'ea'); }
      return;
    }
    const t = tgt || c;
    moveToward(e, t.x, t.y, dt, e.blast ? e.r + t.r - 4 : e.range + e.r + t.r - 2, spm); // 폭파병은 닿을 때까지 접근
    const reach = Math.hypot(t.x - e.x, t.y - e.y) - t.r - e.r;
    if (e.blast) { if (reach <= 6) explode(S, e); return; } // 폭파병: 닿으면 터진다
    if (e.cd <= 0 && reach <= e.range + 2) {
      e.cd = cdTime; e.swing = 0.25; e.aim = Math.atan2(t.y - e.y, t.x - e.x);
      if (t === c) { hitCore(S, dmg); if (S.perks.thorn) damage(S, e, dmg * V().thorn * S.perks.thorn); }
      else damage(S, t, dmg);
    }
  }

  // ───────────── 한 틱 진행 ─────────────
  function tick(S, dt) {
    if (S.over || S.cards.offer || S.jobs.offer) return; // 카드/전직 선택 중에는 시간이 멈춘다
    S.t += dt;
    for (const k in S.buyCd) if (S.buyCd[k] > 0) S.buyCd[k] -= dt;

    // 라운드 진행
    if (S.phase === 'prep') { S.prepT -= dt; if (S.prepT <= 0) startRound(S); }
    else {
      S.roundT += dt;
      if (S.queue.length) {
        S.spawnT -= dt;
        while (S.spawnT <= 0 && S.queue.length) { spawnEnemy(S, S.queue.shift()); S.spawnT += S.spawnGap; }
      }
      if (S.roundT >= ROUND_TIME && S.round < MAX_ROUND) startRound(S);
      if (S.cards.offer) return; // 방금 새 라운드가 열리며 카드창이 떴다
    }

    // 격자 갱신 + 오라 판정 + 소환수 수명
    S.gU.map.clear(); S.gE.map.clear();
    const A = S.aura;
    for (const u of S.units) {
      if (u.dead) continue;
      u.aura = A.on && Math.hypot(u.x - CX, u.y - CY) <= A.r ? 1 : 0;
      if (u.aura && A.heal > 0 && u.hp < u.max) u.hp = Math.min(u.max, u.hp + u.max * A.heal * dt);
      gridAdd(S.gU, u);
    }
    for (const e of S.enemies) if (!e.dead) gridAdd(S.gE, e);

    // 위협 방향 (성채에서 가장 가까운 적 쪽, 부드럽게 회전)
    let near = null, nd = 1500;
    for (const e of S.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - CX, e.y - CY); if (d < nd) { nd = d; near = e; } }
    if (near) S.threat += wrapAngle(Math.atan2(near.y - CY, near.x - CX) - S.threat) * Math.min(1, 2 * dt);

    // 성채 공격 + 대형 포탄
    const c = S.core; c.cd -= dt; c.flash = Math.max(0, c.flash - dt); c.swing = Math.max(0, c.swing - dt);
    if (c.cd <= 0) {
      const t = nearest(S.gE, c.x, c.y, c.range);
      if (t) { c.cd = 1 / c.rate; c.swing = 0.22; c.aim = Math.atan2(t.y - c.y, t.x - c.x); fire(S, c, t, c.atk, CFG.shellSpeed, 'c'); }
    }
    if (S.perks.bomb) { S.bombCd -= dt; if (S.bombCd <= 0) bigBomb(S); }

    // 유닛: 대기 자리는 사방에 퍼지되 적이 오는 쪽으로 약간 쏠린다
    // 경계 상태에 따라 쏠림을 부드럽게 바꾼다
    S.biasNow += ((nd < CFG.ai.alertRange ? CFG.ai.biasAlert : CFG.ai.bias) - S.biasNow) * Math.min(1, 1.5 * dt);
    const bias = S.biasNow;
    for (const u of S.units) {
      if (u.dead) continue;
      u.flash = Math.max(0, u.flash - dt); u.swing = Math.max(0, u.swing - dt);
      if (u.type === 'turret') { updateTurret(S, u, dt); continue; }
      const jm = S.jobMods[u.type];
      if (jm && jm.regen && u.hp < u.max) u.hp = Math.min(u.max, u.hp + u.max * jm.regen * dt);
      const a = S.threat + wrapAngle(u.ha - S.threat) * (1 - bias);
      u.hx = CX + Math.cos(a) * u.hr + Math.sin(S.t * 0.6 + u.id * 1.7) * CFG.ai.sway; u.hy = CY + Math.sin(a) * u.hr + Math.cos(S.t * 0.5 + u.id * 2.3) * CFG.ai.sway;
      if (u.type === 'priest') updatePriest(S, u, dt); else updateFighter(S, u, dt);
      u.x = clamp(u.x, 10, W - 10); u.y = clamp(u.y, 10, H - 10);
    }
    for (const e of S.enemies) { if (e.dead) continue; e.flash = Math.max(0, e.flash - dt); e.swing = Math.max(0, e.swing - dt); updateEnemy(S, e, dt); }
    separate(S.units, S.gU); separate(S.enemies, S.gE);

    // 투사체 (포물선)
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const s = S.shots[i];
      if (s.t.dead) { S.shots.splice(i, 1); continue; }
      s.p += dt / s.T;
      const p = Math.min(1, s.p), tx = s.t.x, ty = s.t.y;
      s.x = s.sx + (tx - s.sx) * p; s.y = s.sy + (ty - s.sy) * p;
      s.h = 4 * s.H * p * (1 - p);
      s.vx = (tx - s.sx) / s.T; s.vy = (ty - s.sy) / s.T; s.vh = 4 * s.H * (1 - 2 * p) / s.T; // 화면에서 화살 방향을 그리기 위한 속도
      if (s.p >= 1) { resolveShot(S, s); S.shots.splice(i, 1); }
    }

    // 정리
    if (S.units.some(u => u.dead)) S.units = S.units.filter(u => !u.dead);
    if (S.enemies.some(e => e.dead)) S.enemies = S.enemies.filter(e => !e.dead);

    // 승리 판정: 마지막 라운드의 적을 전부 처치
    if (S.round >= MAX_ROUND && S.queue.length === 0 && S.enemies.length === 0 && !S.over) {
      S.over = true; S.win = true; emit(S, { type: 'over', win: true });
    }
  }

  return {
    CFG, MAX_ROUND, ROUND_TIME, SPAWN_TIME, PREP_TIME, SPAWN_RING, UNIT_TYPES, CARD_DEFS,
    createGame, tick, buy, spawnAngles, pickJob, describeJobs, jobOptions, spawnEnemy, bossInfo: r => CFG.bosses[r] || null, drainEvents, pickCard, reroll, describeTaken, openCards,
    unitCostOf, enemyCount, hpMul, dmgMul, mulberry32,
  };
});
