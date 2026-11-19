/* 성 지키기 — 게임 로직 (렌더링/DOM 없음)
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
  const MAX_ROUND = 50;     // 마왕이 나오는 마지막 라운드
  const ACT1_END = 30;      // 1막의 마지막 라운드 (이 라운드의 보스를 처치하면 2막이 열린다)
  const ROUND_TIME = 40;   // 한 라운드 최대 시간(초). 적이 남아도 다음 라운드가 시작된다.
  const SPAWN_TIME = 25;   // 라운드 시작 후 이 시간 동안 적이 나뉘어 나온다.
  const PREP_TIME = 0;     // 라운드는 시작하자마자 자동으로 진행된다 (준비 시간 없음)
  const SPAWN_RING = 700;  // 중앙에서 스폰 지점까지 거리 (맵 끝에서 오래 걸어오지 않고 화면 바로 밖에서 나타난다)
  const ENRAGE_AFTER = 40; // 한 적이 이 시간(초)보다 오래 살아 있으면 점점 강해진다 (공격력·이동 속도).
  const enrageMul = age => Math.min(4, 1 + 0.03 * Math.max(0, age - ENRAGE_AFTER)); // 40초 뒤부터 초당 +3%, 최대 4배

  const CFG = {
    world: { w: W, h: H, cx: CX, cy: CY },
    startGold: 210, // 검사·궁수·사제를 한 명씩(어떤 순서로든, 가격 상승 포함 최대 204) 뽑을 수 있는 금액
    leash: 240,           // 유닛이 성으로부터 추격할 수 있는 최대 거리
    ai: {
      bias: 0.08,         // 평소(적이 멀 때) 대기 자리가 적 방향으로 쏠리는 정도 (0 = 사방에 고르게, 1 = 전부 적 방향)
      biasAlert: 0.6,     // 적이 alertRange 안으로 들어오면 이만큼까지 서서히 쏠린다
      alertRange: 420,    // 성에서 이 거리 안에 적이 있으면 경계 상태
      sway: 6,            // 대기 중 살짝 흔들리는 폭(px) — 가만히 서 있는 느낌을 줄인다
      homeBias: 0.9, // 목표를 고를 때 '원래 자리에서의 거리'를 반영하는 정도 (0이면 가장 가까운 적만 쫓음)
      homeR: { sword: 170, archer: 110, priest: 100, golem: 150, hero: 140, marksman: 125, repeater: 100 }, // 역할별 대기 반경
    },
    core: { hp: 1000, atk: 20, rate: 1.0, range: 260, r: 46, blockR: 64 }, // blockR: 성 원형 안으로 아군이 들어올 수 없다
    units: {
      sword:  { name: '검사', cost: 50, hp: 120, atk: 12, rate: 1.0, range: 30,  speed: 90, r: 10, buyCd: 1.2, aggro: 220, dbl: 0.15 },
      archer: { name: '궁수', cost: 60, hp: 67,  atk: 11, rate: 1.2, range: 220, speed: 80, r: 9,  buyCd: 1.5, aggro: 260 },
      priest: { name: '사제', cost: 80, hp: 85,  atk: 0,  rate: 0,   range: 0,   speed: 80, r: 9,  buyCd: 2.5, aggro: 0,
                heal: 12, healRate: 2.4, healRange: 200 },
      undead: { name: '망자', cost: 0, hp: 40, atk: 6, rate: 1.0, range: 26, speed: 88, r: 9, buyCd: 1, aggro: 200, priceSteps: 0, line: 'none' }, // 사령 성 갈래가 되살린 임시 아군
      // 카드로만 얻는 유닛
      // 카드로 얻는 특수 유닛. line = 어느 직업 계열의 강화·전직을 받는지 (sword·archer·priest = 해당 직업, core = 성 강화)
      golem:  { name: '골렘', hp: 1500, atk: 52, rate: 0.8, range: 40,  speed: 55,  r: 18, aggro: 220, priceSteps: 0, line: 'sword' }, // priceSteps: 소환하면 모든 유닛 가격이 이만큼 오른다 (직접 뽑는 유닛은 1, 특수 유닛은 모두 0)
      legendsword:  { name: '검왕',   hp: 2600, atk: 150, rate: 1.4, range: 36,  speed: 105, r: 15, aggro: 320, priceSteps: 0, line: 'sword' },                 // 전설: 압도적인 전사
      legendarcher: { name: '궁신',   hp: 650,  atk: 180, rate: 0.6, range: 380, speed: 90,  r: 13, aggro: 420, priceSteps: 0, line: 'archer', pierce: 3 },   // 전설: 압도적인 궁수
      hero:   { name: '용사', hp: 560, atk: 62, rate: 1.3, range: 30,  speed: 100, r: 12, aggro: 260, priceSteps: 0, line: 'sword' },
      turret: { name: '포탑', hp: 300, atk: 18, rate: 1.5, range: 240, speed: 0,   r: 11, priceSteps: 0, line: 'core', static: true, shot: 't' },
      marksman: { name: '명궁', hp: 280, atk: 66, rate: 0.7, range: 300, speed: 85, r: 11, aggro: 330, priceSteps: 0, line: 'archer', pierce: 1 },       // 긴 사거리·높은 공격력의 영웅 궁수 (화살이 1명 관통)
      repeater: { name: '연노병', hp: 85, atk: 6, rate: 3.2, range: 190, speed: 88, r: 9, aggro: 250, priceSteps: 0, line: 'archer' },                    // 빠르게 연사하는 석궁병
      ballista: { name: '발리스타', hp: 380, atk: 52, rate: 0.45, range: 340, speed: 0, r: 13, priceSteps: 0, line: 'archer', static: true, shot: 'b', pierce: 2 }, // 설치형 대형 석궁 (적 2명 관통)
    },
    // 영웅 스킬: 영웅 등급 유닛이 쿨타임마다 자동 시전 (사거리 안에 적이 있을 때)
    heroSkill: {
      legendsword:  { name: '질풍 돌진',  cd: 7, r: 420, kind: 'dash', mul: 7, w: 26, dist: 380, spd: 620 }, // 적진을 향해 돌진하며 지나가는 길의 적을 모두 벤다
      legendarcher: { name: '천궁 폭우',  cd: 8, r: 420, kind: 'rain', mul: 0.9, rad: 125, dur: 4, every: 0.4 }, // 적 위에 화살비 지대를 만들어 잠시 동안 범위 피해
      hero:     { name: '일섬',      cd: 5, r: 130, mul: 6.0 },              // 주변 적 전체에 큰 베기 피해
      golem:    { name: '대지 강타',  cd: 7, r: 160, mul: 4.5, slow: 3 },     // 주변 적에게 피해 + 3초간 감속
      marksman: { name: '일제 사격',  cd: 6, r: 340, mul: 4.5, n: 6 },        // 가까운 적 6명을 동시에 저격
    },
    enemies: {
      grunt:  { name: '돌격병', hp: 30, dmg: 6,  speed: 70, r: 9,  range: 20, rate: 1.0, gold: 4,   aggro: 110 },
      shield: { name: '방패병', hp: 90, dmg: 8,  speed: 45, r: 13, range: 22, rate: 1.0, gold: 8,   aggro: 90, rres: 0.5, desc: '원거리 피해를 50% 방어합니다.' },
      boss:   { name: '보스',   hp: 0,  dmg: 25, speed: 40, r: 30, range: 36, rate: 0.8, gold: 150, aggro: 180 },
      archer: { name: '사수',   hp: 28, dmg: 6,  speed: 52, r: 9,  range: 200, rate: 0.8, gold: 7,  aggro: 230, ranged: true, desc: '멀리서 화살을 쏩니다.' }, // 멀리서 화살을 쏜다
      bomber: { name: '폭파병', hp: 22, dmg: 26, speed: 100, r: 9, range: 12, rate: 1.0, gold: 6,  aggro: 170, blast: 60, desc: '아군에게 달려가 폭발합니다.' },  // 닿으면 폭발해 범위 피해
      shaman: { name: '주술사', hp: 45, dmg: 0,  speed: 50, r: 10, range: 0,  rate: 0,   gold: 12, aggro: 0,   healRange: 140, healPct: 0.05, healRate: 2.4, keep: 260, desc: '다른 적을 치유합니다.' }, // 뒤에서 아군 적을 치유
      wolf:   { name: '늑대',   hp: 26, dmg: 7,  speed: 125, r: 9,  range: 18, rate: 1.1, gold: 5,  aggro: 200, desc: '매우 빠르게 달려옵니다.' },
      bat:    { name: '박쥐',   hp: 22, dmg: 6,  speed: 95,  r: 8,  range: 16, rate: 1.0, gold: 6,  aggro: 240, air: true, desc: '공중형이라 궁수 계열과 포탑만 공격할 수 있습니다.' },
      boar:   { name: '멧돼지', hp: 130, dmg: 13, speed: 62, r: 14, range: 22, rate: 0.9, gold: 12, aggro: 200, rush: 1.9, desc: '멀리서 빠르게 돌진합니다.' },
      spider: { name: '독거미', hp: 52, dmg: 8,  speed: 60,  r: 10, range: 18, rate: 1.0, gold: 9,  aggro: 150, poison: 5, desc: '물린 아군을 중독시킵니다.' },
      ghost:  { name: '유령',   hp: 75, dmg: 10, speed: 58,  r: 10, range: 20, rate: 0.9, gold: 11, aggro: 140, mres: 0.5, desc: '근접 피해를 50% 방어합니다.' },
      captain:   { name: '정예 돌격병',   hp: 95,  dmg: 12, speed: 82,  r: 11, range: 22, rate: 1.1, gold: 9,  aggro: 130, desc: '더 빠르고 단단한 돌격병입니다.' },
      ironshield:{ name: '철갑 방패병',   hp: 300, dmg: 12, speed: 42,  r: 15, range: 24, rate: 0.9, gold: 18, aggro: 90,  rres: 0.3, desc: '원거리 피해를 70% 방어합니다.' },
      crossbow:  { name: '석궁 사수',     hp: 55,  dmg: 14, speed: 50,  r: 10, range: 260, rate: 0.7, gold: 14, aggro: 280, ranged: true, desc: '아주 멀리서 강한 화살을 쏩니다.' },
      sapper:    { name: '공병',          hp: 70,  dmg: 55, speed: 90,  r: 10, range: 12, rate: 1.0, gold: 13, aggro: 180, blast: 110, desc: '넓은 범위로 폭발합니다.' },
      warlock:   { name: '흑마법사',      hp: 120, dmg: 0,  speed: 48,  r: 11, range: 0,  rate: 0,   gold: 22, aggro: 0, healRange: 160, healPct: 0.07, healRate: 2.2, keep: 280, desc: '다른 적을 더 강하게 치유합니다.' },
      ogre:      { name: '오우거',        hp: 800, dmg: 36, speed: 36,  r: 21, range: 30, rate: 0.6, gold: 45, aggro: 100, desc: '거대하고 매우 단단합니다.' },
      direwolf:  { name: '광포한 늑대',   hp: 90,  dmg: 14, speed: 150, r: 11, range: 20, rate: 1.2, gold: 12, aggro: 220, desc: '늑대보다 훨씬 빠르고 강합니다.' },
      wyvern:    { name: '와이번',        hp: 160, dmg: 18, speed: 110, r: 12, range: 18, rate: 0.9, gold: 22, aggro: 260, air: true, desc: '강한 공중형이라 궁수 계열과 포탑만 공격할 수 있습니다.' },
      wraith:    { name: '망령',          hp: 160, dmg: 24, speed: 70,  r: 12, range: 22, rate: 0.9, gold: 20, aggro: 150, mres: 0.3, desc: '근접 피해를 70% 방어합니다.' },
      brute:  { name: '거한',   hp: 240, dmg: 16, speed: 34, r: 17, range: 26, rate: 0.7, gold: 20, aggro: 100, desc: '느리지만 매우 단단합니다.' },           // 느리고 단단하다
    },
    // 일반 적 등장표: from 라운드부터 가중치 w로 섞여 나온다 (라운드가 갈수록 종류가 늘어난다)
    spawn: { grunt: { from: 1, w: 6 }, shield: { from: 3, w: 3 }, archer: { from: 4, w: 2.5 }, bomber: { from: 7, w: 2.2 }, shaman: { from: 10, w: 1.3 }, brute: { from: 13, w: 1.4 }, wolf: { from: 5, w: 2.2 }, bat: { from: 9, w: 1.6 }, boar: { from: 11, w: 1.4 }, spider: { from: 14, w: 1.5 }, ghost: { from: 18, w: 1.4 },
      captain: { from: 24, w: 1.8 }, direwolf: { from: 27, w: 1.5 }, crossbow: { from: 26, w: 1.5 }, ironshield: { from: 28, w: 1.3 }, sapper: { from: 30, w: 1.2 }, warlock: { from: 32, w: 1.0 }, ogre: { from: 34, w: 1.1 }, wyvern: { from: 36, w: 1.0 }, wraith: { from: 40, w: 1.0 } },
    // 보스: 5라운드마다, 라운드 시작과 함께 나온다. 일반 보스 5종은 게임마다 무작위 순서로 5·10·15·20·25라운드에 한 번씩,
    // 2막(35·40·45라운드)에는 다시 섞어서 3종이 나온다. 30라운드는 암흑 기사단장, 50라운드는 마왕 고정. 체력은 라운드별 표(보스가 누구든 같은 라운드면 같은 체력),
    // 패턴 강도는 라운드에 맞춰 조정된다(scaleAbil). 풀 보스의 패턴 수치는 15라운드 기준.
    bossHp: { 5: 1300, 10: 4000, 15: 9000, 20: 17000, 25: 29000, 30: 32000, 35: 40000, 40: 58000, 45: 75000, 50: 175000 },
    bossPool: [
      { id: 'charger', line: '전부 짓밟아 주마!',    name: '돌격왕',    look: { body: '#b5472a', head: '#e6c9a0', weapon: 'axe' },    abil: { dash: { cd: 7, dur: 1.4, mul: 3 }, debuff: [{ kind: 'stun', cd: 12, r: 105 }] } },
      { id: 'summoner', line: '나의 종들이여, 일어나라!',   name: '소환사',    look: { body: '#3f6fb5', head: '#cfe0f0', weapon: 'staff' },  abil: { summon: { cd: 9, n: 4, kind: 'grunt' }, debuff: [{ kind: 'weak', cd: 12, r: 150 }] } },
      { id: 'bombardier', line: '온 땅을 불바다로 만들어 주지!', name: '포격대장',  look: { body: '#6b7a3a', head: '#e0d6b0', weapon: 'cannon' }, abil: { artillery: { cd: 5, dmg: 60, radius: 90, count: 1, flight: 1.6 }, summon: { cd: 14, n: 2, kind: 'archer' }, debuff: [{ kind: 'poison', cd: 12, r: 135 }] } },
      { id: 'warden', line: '이 성벽, 내가 부숴 주겠다.',     name: '철벽 장군', look: { body: '#6a737f', head: '#d8dde6', weapon: 'shield' }, abil: { shield: { cd: 12, dur: 4, red: 0.8 }, dash: { cd: 10, dur: 1.2, mul: 2.5 }, summon: { cd: 12, n: 3, kind: 'shield' }, debuff: [{ kind: 'wound', cd: 13, r: 170 }] } },
      { id: 'berserker', line: '피가... 피가 끓는다!',  name: '광전사',    look: { body: '#a3252d', head: '#f0cfa8', weapon: 'twin' },   abil: { rage: { at: 0.5, speed: 1.4, rate: 1.5, dmg: 1.3 }, dash: { cd: 6, dur: 1.2, mul: 3 }, artillery: { cd: 7, dmg: 55, radius: 100, count: 1, flight: 1.5 }, debuff: [{ kind: 'stun', cd: 11, r: 95 }] } },
    ],
    // 1막 마지막(30라운드) 보스: 암흑 기사단장. 처치하면 연출과 함께 2막이 열린다.
    act1Boss: { id: 'darkknight', line: '어둠 앞에 무릎을 꿇어라.', name: '암흑 기사단장', look: { body: '#2b2f3f', head: '#2e3140', weapon: 'sword', style: 'darkknight' }, abil: { summon: { cd: 10, n: 2, kind: 'bomber' }, artillery: { cd: 6, dmg: 70, radius: 105, count: 2, flight: 1.5 }, shield: { cd: 16, dur: 3, red: 0.6 }, rage: { at: 0.35, speed: 1.3, rate: 1.4, dmg: 1.4 }, debuff: [{ kind: 'stun', cd: 13, r: 110 }, { kind: 'wound', cd: 15, r: 160 }] } },
    // 최종 보스(50라운드): 마왕
    finalBoss: { id: 'overlord', line: '모든 것은 이 어둠 속에서 끝난다.', name: '마왕', r: 38, look: { body: '#2a2438', head: '#ebe6f4', weapon: 'sword', crown: true, style: 'overlord' }, abil: { summon: { cd: 7, n: 4, kind: 'bomber' }, artillery: { cd: 5, dmg: 130, radius: 115, count: 2, flight: 1.4 }, shield: { cd: 12, dur: 3.5, red: 0.7 }, rage: { at: 0.4, speed: 1.4, rate: 1.5, dmg: 1.5 }, dash: { cd: 9, dur: 1.2, mul: 2.5 }, debuff: [{ kind: 'stun', cd: 10, r: 120 }, { kind: 'poison', cd: 11, r: 150 }, { kind: 'weak', cd: 13, r: 170 }, { kind: 'wound', cd: 14, r: 170 }] } },
    // 마왕(50라운드): 1·2형태. 체력·공격을 너프하는 대신 한 번 쓰러져도 각성해서 부활한다
    finalNerf: { hp: 0.6, dmg: 0.78, hp2: 0.6, cdMul: 0.85, rageAt: 0.5, reviveT: 3.4, r: 44, name: '각성한 마왕', look: { body: '#7a1424', head: '#ecd2c4', weapon: 'sword', crown: true, p2: true, style: 'overlord' } },
    bossDeathT: 2.8,       // 보스 사망 연출 길이(초): 이 동안 시간이 멈추고 카메라가 보스를 비춘다
    // 보스 보상: 전직이 모두 끝난 뒤(35라운드~)에는 보스를 처치하면 이 중 3가지가 제시된다
    rewards: [
      { id: 'r_knights', name: '용병 기사단', desc: '강력한 용병 용사 3명이 합류 (스킬 [일섬]) — 전군 강화와 같은 수준으로 강력', units: ['hero', 'hero', 'hero'] },
      { id: 'r_snipers', name: '저격 용병단', desc: '용병 명궁 3명이 합류 (스킬 [일제 사격])', units: ['marksman', 'marksman', 'marksman'] },
      { id: 'r_golem',   name: '철갑 용병단', desc: '거대한 용병 골렘 2명 + 용병 용사 2명이 합류', units: ['golem', 'golem', 'hero', 'hero'] },
      { id: 'r_army',    name: '전군 강화',   desc: '검사·궁수·사제 모두 체력·공격력 강화 +2단계', up: 2 },
      { id: 'r_fort',    name: '성 대개수', desc: '성이 즉시 2레벨 올라갑니다 (인구·체력·공격력·사거리 상승, 대포 추가) + 체력 완전 회복', castle: 2 },
    ],
    // 성 트리: 성 레벨 4·7·10에서 갈래를 고른다 (마탑 · 수호 · 사령 → 각각 공격형/방어형 → 최종형)
    castleTree: {
      lv: [4, 7, 10],
      roots: [
        { id: 'arcane', name: '마탑', kind: '마법', desc: '성이 9초마다 가장 밀집한 적 무리에 마법 폭발(성 공격력 ×3, 범위 90)을 일으킵니다.', par: { blast: { cd: 9, mul: 3, r: 90, n: 1, zone: 0, zmul: 0, slow: 0, freeze: 0 } } },
        { id: 'guardian', name: '수호', kind: '지원', desc: '성이 6초마다 주변 아군(범위 230)을 최대 체력의 10%만큼 치유합니다.', par: { pulse: { cd: 6, heal: 0.10, r: 230, shield: 0, dmg: 0 } } },
        { id: 'necro', name: '사령', kind: '소환', desc: '적이 죽으면 7% 확률로 그 자리에서 아군 병사(망자)로 부활시킵니다. 망자는 7초 동안 싸우고 사라지며, 사제의 부활 대상이 아닙니다 (최대 6명).', par: { raise: { chance: 0.07, dur: 7, max: 6, hp: 0.6, atk: 0.5, elite: 0, bounty: 0 } } },
      ],
      t2: {
        arcane: [
          { id: 'storm', name: '폭풍 마법진', kind: '공격형', desc: '폭발이 4초 동안 타오르는 불길 지대를 남깁니다.', par: { blast: { zone: 4, zmul: 0.45 } } },
          { id: 'frost', name: '빙결 결계', kind: '방어형', desc: '폭발이 적을 3.5초 감속시키고, 성이 받는 피해 -10%.', par: { blast: { slow: 3.5 }, cdef: 0.1 } },
        ],
        guardian: [
          { id: 'judge', name: '성스러운 심판', kind: '공격형', desc: '치유 파동이 범위 안의 적에게도 피해(성 공격력 ×2.5)를 줍니다.', par: { pulse: { dmg: 2.5 } } },
          { id: 'aegis', name: '수호 방벽', kind: '방어형', desc: '파동이 아군에게 최대 체력 12%의 보호막도 씌우고, 성이 받는 피해 -10%.', par: { pulse: { shield: 0.12 }, cdef: 0.1 } },
        ],
        necro: [
          { id: 'horde', name: '망자의 군세', kind: '공격형', desc: '적을 병사로 부활시킬 확률 12%, 최대 10명, 망자 공격력 +60%.', par: { raise: { chance: 0.05, max: 4, atk: 0.3 } } },
          { id: 'bind', name: '영혼 결속', kind: '방어형', desc: '망자 지속 12초, 체력 +67%, 성이 받는 피해 -10%.', par: { raise: { dur: 5, hp: 0.4 }, cdef: 0.1 } },
        ],
      },
      t3: {
        storm: [
          { id: 'meteor', name: '운석 낙하', kind: '극딜형', desc: '폭발이 서로 다른 무리에 떨어지는 운석 3발로 늘어납니다.', par: { blast: { n: 2, cd: 2 } } },
          { id: 'inferno', name: '대화염', kind: '지속형', desc: '불길 지대가 7초 동안 더 넓고 강하게 타오릅니다.', par: { blast: { zone: 3, zmul: 0.25, r: 30 } } },
        ],
        frost: [
          { id: 'zero', name: '절대영도', kind: '제어형', desc: '폭발이 적을 1.6초 동안 완전히 얼립니다 (보스는 짧게).', par: { blast: { freeze: 1.6 } } },
          { id: 'shatter', name: '빙하 파쇄', kind: '공격형', desc: '폭발 피해 ×1.7, 감속 5초.', par: { blast: { mul: 2.1, slow: 1.5 } } },
        ],
        judge: [
          { id: 'wrath', name: '천벌', kind: '극딜형', desc: '심판 피해가 성 공격력 ×5로 강해지고 더 자주 내려옵니다.', par: { pulse: { dmg: 2.5, cd: -1 } } },
          { id: 'radiance', name: '성광 폭발', kind: '광역형', desc: '파동 범위 +100, 치유 +5%, 피해 +1.', par: { pulse: { r: 100, heal: 0.05, dmg: 1 } } },
        ],
        aegis: [
          { id: 'bastion', name: '불사 결계', kind: '생존형', desc: '성이 무너질 때 한 번 체력 50%로 되살아납니다. 보호막 +5%.', par: { pulse: { shield: 0.05 }, lastStand: 1 } },
          { id: 'fortress', name: '전군 방벽', kind: '지원형', desc: '보호막 +12%, 파동 간격 1.5초 단축.', par: { pulse: { shield: 0.12, cd: -1.5 } } },
        ],
        horde: [
          { id: 'legion', name: '망자 군단', kind: '물량형', desc: '되살릴 확률 +6%, 최대 +6명.', par: { raise: { chance: 0.06, max: 6 } } },
          { id: 'deathknight', name: '죽음의 기사', kind: '정예형', desc: '엘리트 적도 병사로 부활시키고, 망자 체력·공격력 +60%.', par: { raise: { elite: 1, hp: 0.6, atk: 0.6 } } },
        ],
        bind: [
          { id: 'harvest', name: '영혼 수확', kind: '경제형', desc: '적을 병사로 부활시킬 때마다 그 적의 골드만큼 받습니다. 확률 +3%.', par: { raise: { bounty: 1, chance: 0.03, dur: 2 } } },
          { id: 'immortal', name: '불멸의 망자', kind: '지속형', desc: '망자 지속 +8초, 최대 +2명, 체력 +30%.', par: { raise: { dur: 8, max: 2, hp: 0.3 } } },
        ],
      },
    },
    // 전직: 보스를 처치하면 직업(검사/궁수/사제) 하나를 골라 승급시킨다. 1단계에서 갈래를 고르고, 2단계로 한 번 더 강화된다.
    promo: { t1: [5, 15, 20], t2: [30, 35, 40] }, // 보스 라운드: 1차 승급(5·15·20) · 2차 승급(30·35·40) — 그 밖의 보스(10·25·45~)는 보상
    jobs: {
      sword: {
        t1: [
          { id: 'knight', name: '나이트', desc: '큰 방패를 든 수호 전사. 체력 +80%, 피해 16% 방어', mods: { hp: 0.8, def: 0.16 } },
          { id: 'blade', name: '블레이드', desc: '긴 검을 쓰는 공격형 검사. 공격력 +50%, 공격 속도 +20%, 연속 공격 +12%', mods: { atk: 0.5, rate: 0.2, dbl: 0.12 } },
        ],
        t2: {
          knight: [
            { id: 'paladin', name: '팔라딘', desc: '성스러운 갑옷과 철퇴. 체력 +50%, 피해 11% 방어, 초당 체력 2% 회복', mods: { hp: 0.5, def: 0.11, regen: 0.02 } },
            { id: 'warlord', name: '워로드', desc: '뿔 투구에 가시 방패. 체력 +40%, 공격력 +30%, 받은 피해의 30%를 때린 적에게 되돌림', mods: { hp: 0.4, atk: 0.3, reflect: 0.3 } },
          ],
          blade: [
            { id: 'blademaster', name: '검성', desc: '쌍검의 달인. 공격력 +60%, 주변 적에게 50% 베기, 연속 공격 +10%', mods: { atk: 0.6, cleave: 0.5, dbl: 0.1 } },
            { id: 'berserker', name: '버서커', desc: '방패 없이 거대한 검을 휘두름. 공격력 +80%, 광역 베기 35%, 체력이 낮을수록 최대 +100% 더 강해짐', mods: { atk: 0.8, cleave: 0.35, berserk: 1.0 } },
          ],
        },
      },
      archer: {
        t1: [
          { id: 'sniper', name: '저격수', desc: '장궁으로 멀리서 쏨. 공격력 +60%, 사거리 +60, 공격 속도 -15%', mods: { atk: 0.6, range: 60, rate: -0.15 } },
          { id: 'ranger', name: '속사수', desc: '짧은 활로 연사. 공격 속도 +50%, 이동 속도 +15%', mods: { rate: 0.5, speed: 0.15 } },
        ],
        t2: {
          sniper: [
            { id: 'deadeye', name: '명사수', desc: '황금 조준경 장궁. 공격력 +50%, 화살이 뒤의 적 1명을 관통', mods: { atk: 0.5, pierce: 1 } },
            { id: 'gunner', name: '포격수', desc: '폭탄 석궁. 맞은 적 주변 범위에 60% 폭발 피해, 공격력 +35%, 공격 속도 -10%', mods: { atk: 0.35, rate: -0.1, splash: 0.6 } },
          ],
          ranger: [
            { id: 'stormarcher', name: '폭풍사수', desc: '세 갈래 질풍 화살. 공격 속도 +40%, 치명타 확률 +15%', mods: { rate: 0.4, crit: 0.15 } },
            { id: 'hunter', name: '사냥꾼', desc: '표식 석궁. 맞은 적이 4초간 받는 피해 +30%, 공격력 +20%, 이동 속도 +20%', mods: { atk: 0.2, speed: 0.2, mark: 0.3 } },
          ],
        },
      },
      priest: {
        t1: [
          { id: 'cleric', name: '성직자', desc: '광륜의 치유사. 치유량 +35%, 치유 범위 +40', mods: { heal: 0.35, healRange: 40 } },
          { id: 'bishop', name: '주교', desc: '주교관과 지팡이. 치유량 +12%, 쓰러진 아군을 라운드당 1회 부활', mods: { heal: 0.12, revive: 1 } },
        ],
        t2: {
          cleric: [
            { id: 'highcleric', name: '대성직자', desc: '거대한 광륜. 치유량 +30%, 치유 속도 +15%', mods: { heal: 0.3, healRate: 0.15 } },
            { id: 'warden', name: '수호사제', desc: '푸른 등불의 수호자. 치유량 +15%, 치유한 아군에게 치유량의 60%만큼 보호막 (최대 체력의 30%까지)', mods: { heal: 0.15, ward: 0.6 } },
          ],
          bishop: [
            { id: 'archbishop', name: '대주교', desc: '황금 십자 지팡이. 치유량 +18%, 부활 +1회', mods: { heal: 0.18, revive: 1 } },
            { id: 'templar', name: '전투사제', desc: '철퇴와 갑옷의 성전사. 성스러운 구체로 사거리 170 안의 적을 직접 공격, 부활 +1회', mods: { revive: 1, smite: 1 } },
          ],
        },
      },
    },
    shots: { arc: 0.28, arcMin: 12, arcMax: 110, minT: 0.22 }, // 포물선 투사체: 거리에 비례해 높이 솟았다 떨어진다
    arrowSpeed: 430, shellSpeed: 360, enemyArrowSpeed: 400,
    balance: {
      countBase: 8, countLinear: 3, countQuad: 0.08, // 라운드별 적 수 = base + linear·r + quad·r²
      hpSlope: 0.125, hpSlopeLate: 0.14, lateFrom: 20, // 체력 배율: 선형, lateFrom(대혼란) 이후 기울기 증가
      dmgShare: 0.5,                                  // 공격력은 체력 증가분의 이 비율만 반영
      lateSpeed: 1.1,                                 // 대혼란 이후 적 이동 속도 배율
      enemyHp: 0.31, enemyDmg: 0.5,                    // 모든 적(보스 포함)의 체력/공격력 배율
      bossHp: 1,                                      // 보스 체력에 추가로 곱하는 배율
      // 2막(31라운드~): 적이 강해지는 폭이 더 크다
      countPost: 3,                                   // 2막에서는 라운드마다 적이 이만큼 늘어난다 (1막 말 수 + 이 값 × 경과 라운드)
      hpSlopePost: 0.30,                              // 2막 체력 증가 기울기 (라운드당)
      postSpeed: 1.08,                                // 2막 적 이동 속도 배율
      meleeHp: 1.25, rangedDmg: 1.25,                  // 근접 적은 체력, 원거리 적은 공격력을 더 높게 (못 잡으면 쌓인다)
      bossSplash: 0.25, bossSplashR: 35,               // 보스 기본 공격의 범위 피해: 주변 아군이 받는 비율, 반경(+보스 크기)
      healCap: 0.10,                                  // 한 유닛이 1초 동안 치유로 회복할 수 있는 최대 비율(최대 체력 기준). 사제를 많이 뽑아도 불사가 되지 않게 한다
      bomberCoreMul: 0.55, guardPerUnit: 0.008, guardMax: 0.4, // 성이 받는 피해: 폭파병 ×0.55, 살아 있는 병사 1명당 -0.8% (최대 -40%)
      bossGrow: 0.02, bossGrowDelay: 8, bossGrowMax: 2.6, // 보스 기본 공격: 등장 8초 뒤부터 초당 +2%씩 강해진다 (최대 ×2.6)
      summonRange: 600,                               // 보스가 성에서 이 거리 안에 들어와야 졸개 소환 시간이 흐른다
      shellCoreMul: 0.4,                              // 보스 포격이 성에 주는 피해 비율 (성벽이 튼튼하다)
      coreRepair: 0.04,                               // 라운드가 바뀔 때마다 성이 기본으로 복구하는 비율 (최대 체력 기준)
    },
    economy: { costAll: 1.045, costType: 0.015 }, prodMax: 5, // (임시값: 1.05는 너무 쉽고 1.08은 어려웠음 — 밸런스는 나중에 재조정) // 유닛을 하나 뽑을 때마다 모든 유닛의 비용이 이 배율만큼 오른다 (인구 제한은 없다)
    healAfterRound: 0.30, // 새 라운드 시작 시 생존 유닛 회복 비율
    // 카드/강화 수치
    upPct: { hp: 0.30, atk: 0.15, rate: 0.10, speed: 0.12 },
    auraBase: 170, // 성 광장(회색 원) 크기
    debuff: {                         // 보스 광역 상태이상 (아군에게 걸린다)
      stun: { name: '기절', dur: 1.2 },                // 행동 불가
      poison: { name: '중독', dur: 7, pct: 0.018, pool: 8 }, // pool: 독 웅덩이가 남아 있는 시간(초)    // 초당 최대 체력의 1.8% (죽지는 않고 1까지)
      weak: { name: '공격력 감소', dur: 7, mul: 0.75 }, // 공격력 ×0.75
      wound: { name: '치유 감소', dur: 8, mul: 0.5 },  // 받는 치유량 ×0.5
      warn: 1.1,                                      // 시전 후 효과가 터지기까지(예고 시간)
    },
    cardVals: {                       // 카드 수치 (설명 문구와 효과가 모두 여기서 읽는다)
      coreAtk: 0.40, coreRate: 0.25, coreRange: 45, fortHp: 600, repair: 0.15, thorn: 0.9,
      crit: 0.10, critMul: 2, archerRange: 0.12,
      guard: 0.24, charge: 0.40, chargeRate: 0.15, revive: 0.70, pierce: 0.40, bomb: 4.0, bombStep: 1.5,
      auraHeal: 0.025, auraAtk: 0.08, auraDef: 0.08, auraDefCap: 0.40, auraSpd: 0.06, auraBoost: 0.15,
    },
    rerolls: 2,
    // 성 업그레이드: 유닛 수(인구)에 상한이 있고, 골드로 성을 올리면 인구 상한·체력·공격력·사거리가 오르고 특정 레벨마다 대포가 1문씩 늘어난다
    castle: { max: 10, cost: [220, 380, 640, 1000, 1550, 2350, 3500, 5000, 7000], popBase: 8, popPer: 3, hp: 350, atk: 0.16, range: 22, rate: 0.06, cannonLv: [3, 5, 7] },
    // 엘리트: 일반 몬스터가 일정 확률로 훨씬 강하고 크게 나온다. 확률은 라운드가 갈수록 커져 최대 max
    elite: { from: 3, perRound: 0.0025, max: 0.10, hp: 3, dmg: 1.6, size: 1.35, gold: 4, speed: 1.05 },
    endless: { hpLin: 0.12, hpQuad: 0.0008, cnt: 0.022, bossBase: 60000, bossExp: 0.6, marMul: 0.9 }, // 무한 모드(51라운드~) 난이도 곡선: 체력 배율 1+lin·n+quad·n², 적 수 +cnt·n (n = 50라운드 이후 지난 라운드)
    dmgVar: 0.15,                     // 모든 공격 피해에 공격력 ±15% 오차
    legendChance: 0.007,              // 30라운드 이후, 카드 한 칸마다 전설 카드가 나올 확률 (아주 낮음)
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
  // 반경 r 안의 살아 있는 개체에 fn을 호출한다 (격자 조회: 전체를 훑지 않는다)
  function eachNear(g, x, y, r, fn) {
    const c = g.cell, reach = r + 30;
    const x0 = Math.floor((x - reach) / c), x1 = Math.floor((x + reach) / c), y0 = Math.floor((y - reach) / c), y1 = Math.floor((y + reach) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const arr = g.map.get(gkey(cx, cy)); if (!arr) continue;
      for (let i = 0; i < arr.length; i++) { const e = arr[i]; if (!e.dead && Math.hypot(e.x - x, e.y - y) <= r + e.r) fn(e); }
    }
  }
  // 중심 거리가 range 이내인 가장 가까운 개체 (이미 처리한 seen은 제외)
  function nearestExcl(g, x, y, range, seen) {
    const c = g.cell, reach = range + 32;
    const x0 = Math.floor((x - reach) / c), x1 = Math.floor((x + reach) / c), y0 = Math.floor((y - reach) / c), y1 = Math.floor((y + reach) / c);
    let best = null, bd = range;
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const arr = g.map.get(gkey(cx, cy)); if (!arr) continue;
      for (let i = 0; i < arr.length; i++) { const e = arr[i]; if (e.dead || seen.has(e)) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
    }
    return best;
  }
  function separate(list, g) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (e.dead || isStatic(e)) continue;
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
  const enemyCount = r => { const b = CFG.balance, f = x => Math.floor(b.countBase + b.countLinear * x + b.countQuad * x * x); return r > ACT1_END ? Math.floor((f(ACT1_END) + b.countPost * (r - ACT1_END)) * (1 + CFG.endless.cnt * endE(r))) : f(r); };
  // 무한 모드(51라운드~): 체력·공격·수·속도가 가파르게 오른다
  const endE = r => Math.max(0, r - MAX_ROUND);
  const endF = r => { const e = endE(r), E = CFG.endless; return e ? 1 + E.hpLin * e + E.hpQuad * e * e : 1; };
  const hpMul = r => { const b = CFG.balance; return endF(r) * (1 + b.hpSlope * (Math.min(r, b.lateFrom) - 1) + b.hpSlopeLate * Math.max(0, Math.min(r, ACT1_END) - b.lateFrom) + b.hpSlopePost * Math.max(0, r - ACT1_END)); };
  const dmgMul = r => 1 + CFG.balance.dmgShare * (hpMul(r) - 1);
  const spawnPointCount = r => (r > ACT1_END ? 8 : r > 15 ? 6 : r > 5 ? 4 : 2); // 기본 길 2개 → 5라운드 뒤 4개 → 15라운드 뒤 6개 → 2막 8개
  // 스폰 지점 방향: 큰 길 4개(90도 간격) + 10라운드부터 샛길 2개(대각선). 배경의 길도 이 각도를 따른다.
  // 무한 모드의 추가 포탈: 51라운드부터 5라운드마다 1개씩 (최대 8개), 길 사이사이에 기존 포탈보다 성에 가깝게 생긴다
  const EXTRA_RING = 480, EXTRA_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];
  const extraCount = r => r > MAX_ROUND ? Math.min(8, Math.floor((r - MAX_ROUND - 1) / 5) + 1) : 0;
  const extraAngles = n => EXTRA_ORDER.slice(0, n).map(k => 0.4 + Math.PI / 8 + k * Math.PI / 4);
  const spawnAngles = pts => { const b = 0.4, P = Math.PI; return [b, b + P, b + P / 2, b + 1.5 * P, b + P / 4, b + 1.25 * P, b + 0.75 * P, b + 1.75 * P].slice(0, pts); };
  const enemySpeedMul = r => (r >= CFG.balance.lateFrom ? CFG.balance.lateSpeed : 1) * (r > ACT1_END ? CFG.balance.postSpeed : 1) * Math.min(1.5, 1 + 0.012 * endE(r));
  // 비용 = 기본 비용 × 배율^(지금까지 뽑은 유닛 수). 모든 유닛 종류가 함께 오른다.
  // 가격 = 기본가 × (전체 인구 × 2%) × (같은 종류 인구 × 4%): 한 종류만 계속 뽑으면 예전(6%씩)과 비슷하고, 병력을 잃으면 가격도 같이 내려가 복구하기 쉽다
  const unitCostOf = (S, type) => { let all = 0, same = 0; for (const u of S.units) if (!u.dead && UNIT_TYPES.includes(u.type)) { all++; if (u.type === type) same++; } return Math.round(CFG.units[type].cost * Math.pow(CFG.economy.costAll, all) * Math.pow(1 + CFG.economy.costType, same)); };

  // ───────────── 카드 정의 ─────────────
  const TN = { sword: '검사', archer: '궁수', priest: '사제' };
  const STAT_NAME = { hp: '체력', atk: '공격력', rate: '공격 속도', speed: '이동 속도' };
  // cat: unit(유닛 강화) / core(성 강화) / summon(특수 소환)
  const CARD_DEFS = [
    // 유닛 강화 — 대상 유닛 종류는 카드가 나올 때 정해진다
    { id: 'u_hp',    cat: 'unit', rar: 'common', max: 5, generic: 'hp' },
    { id: 'u_atk',   cat: 'unit', rar: 'common', max: 5, generic: 'atk' },
    { id: 'u_rate',  cat: 'unit', rar: 'common', max: 4, generic: 'rate' },
    // 유닛 특성 (종류 고정)
    { id: 'u_guard',   cat: 'unit', rar: 'rare', max: 3, type: 'sword',  name: '검사 · 방어 자세', desc: l => '검사가 피해를 ' + Math.round(V().guard * 100 * l) + '% 방어' },
    { id: 'u_charge',  cat: 'unit', rar: 'rare', max: 2, type: 'sword',  name: '검사 · 돌진',      desc: l => '검사 접근 속도 +' + Math.round(V().charge * 100 * l) + '%, 공격 속도 +' + Math.round(V().chargeRate * 100 * l) + '%' },
    { id: 'u_pierce',  cat: 'unit', rar: 'rare', max: 3, type: 'archer', name: '궁수 · 관통 화살', desc: l => '화살이 뒤의 적 ' + l + '명에게 ' + Math.round(V().pierce * 100) + '% 피해' },
    { id: 'u_crit',    cat: 'unit', rar: 'rare', max: 3, type: 'archer', name: '궁수 · 치명타',    desc: l => '치명타 확률 +' + Math.round(V().crit * 100 * l) + '% (치명타 피해 ×' + V().critMul + ')' },
    { id: 'u_range',   cat: 'unit', rar: 'rare', max: 3, type: 'archer', name: '궁수 · 사거리',    desc: l => '궁수 계열 사거리 +' + Math.round(V().archerRange * 100 * l) + '%' },
    { id: 'u_aoeheal', cat: 'unit', rar: 'rare', max: 3, type: 'priest', name: '사제 · 광역 치유', desc: l => '치유 대상 바로 옆(붙어 있는) 아군도 ' + 35 * l + '% 회복' },
    { id: 'u_revive',  cat: 'unit', rar: 'epic', max: 3, type: 'priest', name: '사제 · 부활',      desc: l => '쓰러진 아군을 라운드당 ' + l + '회 체력 ' + Math.round(V().revive * 100) + '%로 부활' },
    // 성 — 포격
    { id: 'c_atk',    cat: 'core', rar: 'common', max: 5, name: '성 · 공격력',   desc: l => '성 공격력 +' + Math.round(V().coreAtk * 100 * l) + '%' },
    { id: 'c_rate',   cat: 'core', rar: 'common', max: 4, name: '성 · 공격 속도', desc: l => '성 공격 속도 +' + Math.round(V().coreRate * 100 * l) + '%' },
    { id: 'c_range',  cat: 'core', rar: 'common', max: 3, name: '성 · 사거리',   desc: l => '성 사거리 +' + V().coreRange * l },
    { id: 'c_splash', cat: 'core', rar: 'rare',   max: 3, name: '폭발탄',          desc: l => '성 탄이 맞은 적 주변 ' + (50 + 10 * l) + ' 범위에 50% 피해' },
    { id: 'c_chain',  cat: 'core', rar: 'rare',   max: 3, name: '연쇄 번개',       desc: l => '성 공격이 주변 적 ' + (l + 1) + '마리로 전이 (60%)' },
    { id: 'c_bomb',   cat: 'core', rar: 'epic',   max: 3, name: '대형 포탄',       desc: l => (11 - l) + '초마다 적이 가장 밀집한 곳에 대폭격 (성 공격력 ×' + (V().bomb + V().bombStep * (l - 1)) + ')' },
    // 성 — 보급 오라 (성 주변 아군 대상)
    { id: 'a_heal', cat: 'core', rar: 'common', max: 5, name: '치유 오라', desc: l => '오라 안 아군이 초당 최대 체력의 ' + +(V().auraHeal * 100 * l).toFixed(1) + '% 회복' },
    { id: 'a_atk',  cat: 'core', rar: 'common', max: 5, name: '군기 오라', desc: l => '오라 안 아군 공격력 +' + Math.round(V().auraAtk * 100 * l) + '%' },
    { id: 'a_def',  cat: 'core', rar: 'common', max: 5, name: '철벽 오라', desc: l => '오라 안 아군이 피해를 ' + Math.min(Math.round(V().auraDefCap * 100), Math.round(V().auraDef * 100 * l)) + '% 방어' },
    { id: 'a_spd',  cat: 'core', rar: 'common', max: 4, name: '신속 오라', desc: l => '오라 안 아군 이동·공격 속도 +' + Math.round(V().auraSpd * 100 * l) + '%' },
    { id: 'a_rad',  cat: 'core', rar: 'common', max: 4, name: '오라 강화', desc: l => '모든 오라 효과 +' + Math.round(V().auraBoost * 100 * l) + '%', needsAura: true },
    // 성 — 요새
    { id: 'f_hp',     cat: 'core', rar: 'common', max: 5, name: '성 · 체력',   desc: l => '성 최대 체력 +' + V().fortHp * l + ' (즉시 회복)' },
    { id: 'f_repair', cat: 'core', rar: 'rare',   max: 3, name: '자동 수리',     desc: l => '라운드가 바뀔 때 성 체력 ' + Math.round(V().repair * 100 * l) + '% 회복' },
    { id: 'f_thorn',  cat: 'core', rar: 'rare',   max: 3, name: '가시 방벽',     desc: l => '성을 때린 적에게 그 피해의 ' + Math.round(V().thorn * 100 * l) + '% 반사' },
    // 특수 소환
    { id: 's_turret', cat: 'summon', rar: 'rare',   max: 3,  name: '자동 포탑',       desc: l => '성 옆에 자동 포탑 설치 (' + l + '/3) · 성 공격력·공속·사거리 강화를 받음' },
    { id: 's_golem',  cat: 'summon', rar: 'epic',   max: 1,  name: '골렘 소환',       desc: () => '거대한 탱커 골렘을 영구 소환 · 검사 계열 · 스킬 [대지 강타]: 7초마다 주변 적에게 공격력 ×4.5 피해 + 3초 감속' },
    { id: 's_hero',   cat: 'summon', rar: 'epic',   max: 1,  name: '용사 소환',       desc: () => '강력한 근접 영웅 용사를 영구 소환 · 검사 계열 · 스킬 [일섬]: 5초마다 주변 적 전체에 공격력 ×6 베기' },
    // 궁수 계열 특수 유닛: 궁수 강화 카드와 궁수 전직(저격수·속사수 등)의 효과를 받는다
    { id: 'l_sword',  cat: 'summon', rar: 'legend', max: 1, name: '전설 · 검왕 강림', desc: () => '압도적인 전사 검왕을 영구 소환 · 검사 계열 · 스킬 [질풍 돌진]: 7초마다 적진으로 돌진하며 지나가는 길의 적 모두에게 공격력 ×7' },
    { id: 'l_archer', cat: 'summon', rar: 'legend', max: 1, name: '전설 · 궁신 강림', desc: () => '압도적인 궁수 궁신을 영구 소환 · 궁수 계열 · 화살이 적 3명 관통 · 스킬 [천궁 폭우]: 8초마다 적 위에 4초간 화살비 지대를 만들어 범위 안 적에게 계속 피해' },
    { id: 's_marksman',  cat: 'summon', rar: 'epic', max: 1, name: '명궁 소환',    desc: () => '사거리 300의 영웅 궁수를 영구 소환 · 궁수 계열 · 스킬 [일제 사격]: 6초마다 가까운 적 6명을 동시에 저격 (공격력 ×4.5)' },
    { id: 's_repeaters', cat: 'summon', rar: 'rare', max: 3, name: '연노병 소환',  desc: l => '연노병 2명을 영구 소환 (' + l + '/3) · 초당 3발 이상 빠르게 쏘는 석궁병 · 궁수 계열 (궁수 강화·전직 효과를 받음)' },
    { id: 's_ballista',  cat: 'summon', rar: 'rare', max: 2, name: '발리스타 설치', desc: l => '대형 석궁 발리스타를 성 옆에 설치 (' + l + '/2) · 큰 화살이 적 2명을 관통 · 궁수 계열 (궁수 강화·전직 효과를 받음)' },
  ];
  // 보스 개성 패턴: rush(등장하자마자 성 한복판으로 돌진 + 충격파) · blink(순간이동) · leap(밀집한 아군 위로 도약) · siege(멀리서 포격만)
  { const BA = id => CFG.bossPool.find(b => b.id === id).abil;
    Object.assign(BA('charger'), { rush: { mul: 5, until: 170, r: 120, stun: 0.9 } });
    Object.assign(BA('summoner'), { blink: { cd: 13, minR: 300, maxR: 460 } });
    Object.assign(BA('bombardier'), { siege: { dist: 235 } });
    Object.assign(BA('berserker'), { leap: { cd: 11, r: 110, mul: 1.4, air: 0.8 } });
    Object.assign(CFG.act1Boss.abil, { rush: { mul: 3.6, until: 180, r: 115, stun: 0.9 }, blink: { cd: 14, minR: 300, maxR: 460 } });
    Object.assign(CFG.finalBoss.abil, { rush: { mul: 3.6, until: 190, r: 125, stun: 1.0 }, blink: { cd: 14, minR: 320, maxR: 480 }, leap: { cd: 12, r: 115, mul: 1.5, air: 0.8 } });
  }
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
    const owned = UNIT_TYPES.filter(t => S.units.some(u => lineOf(u.type) === t && !u.dead));
    for (const def of CARD_DEFS) {
      if (def.rar === 'legend' || def.id === 'c_atk' || def.id === 'c_rate' || def.id === 'c_range' || def.id === 'f_hp') continue; // 성 능력치는 이제 성 업그레이드로 올린다 // 전설 카드는 아래 generateOffer에서 따로 (아주 낮은 확률)
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
    const legends = S.round > ACT1_END ? CARD_DEFS.filter(d => d.rar === 'legend' && taken(S, d.id) < d.max) : [];
    for (let i = 0; i < 3; i++) {
      if (legends.length && !offer.some(o => o.rar === 'legend') && S.rng() < CFG.legendChance) { const d = legends[Math.floor(S.rng() * legends.length)]; offer.push(makeCard(S, d, null)); continue; } // 30라운드 이후 아주 드물게 전설 카드
      const c = take(rollRarity(S)); if (c) offer.push(c);
    }
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
  // 승급 라운드(1차 5·15·20, 2차 30·35·40)의 보스를 잡으면 먼저 '승급할 캐릭터'를 고르고, 그 캐릭터의 갈래 2개 중 하나를 고른다. 그 밖의 보스는 보상.
  const promoTier = S => CFG.promo.t1.includes(S.round) ? 1 : CFG.promo.t2.includes(S.round) ? 2 : 0;
  function classOptions(S, type) { // 이 직업이 지금 고를 수 있는 전직 2개
    const ids = S.jobs[type].ids, j = CFG.jobs[type], defs = ids.length === 0 ? j.t1 : ids.length === 1 ? (j.t2[ids[0]] || []) : [];
    return defs.map(d => ({ type, className: CFG.units[type].name, tier: ids.length + 1, id: d.id, name: d.name, desc: d.desc }));
  }
  function openJobs(S, bossName) {
    const tier = promoTier(S), lines = tier ? UNIT_TYPES.filter(t => S.jobs[t].ids.length === tier - 1 && classOptions(S, t).length) : [];
    if (lines.length) {
      const list = lines.map(t => { const ids = S.jobs[t].ids; return { type: t, className: CFG.units[t].name, tier, stage: 'line', id: 'line_' + t, name: CFG.units[t].name, desc: tier === 1 ? '1차 전직 — 두 갈래 중 하나를 고릅니다.' : jobDef(t, ids[0]).name + ' 계열 2차 전직 — 두 갈래 중 하나를 고릅니다.' }; });
      S.jobs.offer = { boss: bossName, tier, stage: 'line', list }; return;
    }
    const left = CFG.castle.max - S.castle.lv; // 성이 이미 최대면 대개수는 제시하지 않고, 1레벨만 남았으면 1레벨로 안내한다
    const early = S.round < 30; // 초반 보스 보상은 너무 강한 용병(기사단·철갑)을 뺀다
    const pool = CFG.rewards.filter(r => (!r.castle || left > 0) && !(early && (r.id === 'r_knights' || r.id === 'r_golem'))).map(r => ({ type: 'reward', reward: true, className: '보스 보상', tier: 0, id: r.id, name: r.name, desc: r.castle && left < r.castle ? r.desc.replace('2레벨', left + '레벨') + ' (최대 레벨 도달)' : r.desc }));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(S.rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    S.jobs.offer = { boss: bossName, reward: true, list: pool.slice(0, 3) };
  }
  function jobBack(S) { const o = S.jobs.offer; if (!o || o.stage !== 'class') return false; S.jobs.offer = { boss: o.boss, tier: o.tier, stage: 'line', list: o.lineList }; return true; }
  function pickJob(S, idx) {
    const o = S.jobs.offer && S.jobs.offer.list[idx]; if (!o) return false;
    if (S.jobs.offer.stage === 'line') { // 1단계: 승급할 캐릭터를 골랐다 → 그 캐릭터의 전직 2개를 보여준다
      const f = S.jobs.offer; S.jobs.offer = { boss: f.boss, tier: f.tier, stage: 'class', line: o.type, lineList: f.list, list: classOptions(S, o.type) }; return true;
    }
    logEv(S, ['j', S.round, o.className + ' · ' + o.name, S.jobs.offer.list.map(x => x.className + ' · ' + x.name)]);
    if (o.reward) { // 보상: 용병 소환 / 전군 강화 / 성 보강
      const d = CFG.rewards.find(r => r.id === o.id); S.jobs.offer = null;
      if (d.units) for (const t of d.units) { const u = addUnit(S, t); u.x = CX + (S.rng() - 0.5) * 160; u.y = CY + 100 + S.rng() * 60; }
      if (d.up) { S.bossUp.hp += d.up; S.bossUp.atk += d.up; for (const u of S.units) if (!u.dead) refreshUnit(S, u); }
      if (d.castle) { for (let i = 0; i < d.castle; i++) upgradeCastle(S, true); S.core.hp = S.core.max; }
      emit(S, { type: 'reward', name: o.name }); return true;
    }
    const before = S.jobMods[o.type].revive;
    S.jobs[o.type].ids.push(o.id); S.jobs.offer = null;
    recompute(S); S.reviveLeft += S.jobMods[o.type].revive - before;
    for (const u of S.units) if (lineOf(u.type) === o.type && !u.dead) refreshUnit(S, u);
    emit(S, { type: 'promote', unitType: o.type, className: o.className, name: o.name, tier: o.tier });
    return true;
  }
  // 마왕 처치: 마왕에게 당한 병사들이 정신을 되찾는다 — 지금까지 쓰러진 유닛이 모두 돌아오고 전원 체력이 가득 찬다
  function reviveForEndless(S, boss) {
    S.endless = true; S.cinematic = { name: boss.bossName, kind: 'endless' };
    const n = 0; // (병사 부활·전원 회복은 없다)
    S.core.hp = Math.max(S.core.hp, S.core.max * 0.7);
    emit(S, { type: 'endlessStart', n });
  }
  function endCinematic(S) { if (S.cinematic) { const k = S.cinematic.kind; S.cinematic = null; emit(S, { type: k === 'endless' ? 'endlessGo' : 'act2start' }); } }
  // (테스트/디버그) r라운드가 다음 틱에 시작되도록 점프한다
  function jumpToRound(S, r) {
    S.round = r - 1; S.phase = 'round'; S.roundT = ROUND_TIME; S.pools.length = 0; S.rain.length = 0; S.queue = []; S.enemies.length = 0; S.shots.length = 0; S.zones.length = 0;
    if (r > ACT1_END) S.act = 2;
    return S;
  }
  // ───────────── 개발자 모드: r라운드에 맞는 성·강화·전직·유닛을 알아서 갖춰 준다 (골드 무한, 랭킹·기록 제외) ─────────────
  const DEV_GOLD = 1e9;
  const DEV_W = {"default": 1, "c_bomb": 3.28, "u_pierce": 2.75, "a_def": 2.7, "a_atk": 0.55, "a_heal": 1.19, "c_chain": 2.04, "s_hero": 2.03, "s_marksman": 1.63, "s_ballista": 1.23, "s_repeaters": 1.06, "u_aoeheal": 1.63, "u_charge": 1.1, "u_crit": 0.5, "u_range": 0.45, "s_golem": 0.55, "s_turret": 0.47, "c_atk": 0.9, "c_rate": 0.42, "c_splash": 0.85, "c_range": 0.34, "u_guard": 0.47, "u_revive": 0.42, "a_spd": 0.42, "a_rad": 1.18, "f_hp": 0.39, "f_repair": 0.39, "f_thorn": 0.32, "u_hp:sword": 0.55, "u_atk:sword": 0.55, "u_rate:sword": 0.44, "u_hp:archer": 0.82, "u_atk:archer": 0.47, "u_rate:archer": 0.91, "u_hp:priest": 0.39, "u_atk:priest": 0.39, "u_rate:priest": 0.41};
  function devSetup(S, r) {
    S.dev = true; S.gold = DEV_GOLD;
    const lv = clamp(1 + Math.floor(r / 6), 1, CFG.castle.max); for (let i = 1; i < lv; i++) upgradeCastle(S, true);
    autoCastle(S);
    const fill = frac => { // 검사 3 : 궁수 2 : 사제 1 비율로 인구를 채운다
      const want = Math.floor(Math.min(popCap(S) * frac, 10 + r, 90)), ratio = ['sword', 'sword', 'sword', 'archer', 'archer', 'priest'];
      for (let i = 0; popCount(S) < want && i < 400; i++) { const t = ratio[i % 6]; S.buyCd[t] = 0; S.gold = DEV_GOLD; if (!buy(S, t).ok) break; }
    };
    fill(0.5);
    const score = c => DEV_W[c.key] ?? DEV_W[c.id] ?? DEV_W.default ?? 1;
    const picks = Math.floor((r - 1) * 0.85);
    for (let i = 0; i < picks; i++) { openCards(S, i % 5 === 4); const o = S.cards.offer; if (!o) break; let bi = 0; for (let k = 1; k < o.length; k++) if (score(o[k]) > score(o[bi])) bi = k; pickCard(S, bi); }
    const prefer = ['r_army', 'r_fort', 'r_knights', 'r_snipers', 'r_golem']; let nb = 0;
    for (let br = 5; br < r; br += 5) { // 지나온 보스 라운드마다 승급 / 보상을 알아서 고른다
      S.round = br; openJobs(S, '개발자'); nb++;
      for (let g = 0; g < 3 && S.jobs.offer; g++) {
        const o = S.jobs.offer; let bi = 0;
        if (o.reward) { const k = o.list.findIndex(x => x.id === prefer[nb % prefer.length]); if (k >= 0) bi = k; }
        else if (o.stage === 'class') bi = (nb + (o.list[0].type === 'sword' ? 0 : o.list[0].type === 'archer' ? 1 : 0)) % o.list.length;
        pickJob(S, bi);
      }
    }
    autoCastle(S);
    fill(0.9);
    for (const u of S.units) if (!u.dead) { refreshUnit(S, u); u.hp = u.max; }
    S.core.hp = S.core.max; S.gold = DEV_GOLD;
    if (r > MAX_ROUND) S.endless = true;
    return jumpToRound(S, r);
  }
  function describeJobs(S) {
    return UNIT_TYPES.filter(t => S.jobs[t].ids.length).map(t => ({ type: t, className: CFG.units[t].name, names: S.jobs[t].ids.map(id => jobDef(t, id).name), descs: S.jobs[t].ids.map(id => jobDef(t, id).desc) }));
  }

  function pickCard(S, idx) {
    const c = S.cards.offer && S.cards.offer[idx]; if (!c) return false;
    S.cards.taken[c.key] = (S.cards.taken[c.key] || 0) + 1;
    logEv(S, ['c', S.round, c.name, S.cards.taken[c.key], S.cards.offer.map(o => o.name)]);
    S.cards.offer = null;
    if (c.cat === 'unit' && DEF[c.id].generic) {
      const stat = DEF[c.id].generic; S.up[c.type][stat]++;
      for (const u of S.units) if (lineOf(u.type) === c.type && !u.dead) refreshUnit(S, u);
    }
    const oldMax = S.core.max;
    recompute(S);
    if (c.id === 'u_range') for (const u of S.units) if (lineOf(u.type) === 'archer' && !u.dead) refreshUnit(S, u); // 사거리 카드는 이미 있는 궁수에게도 바로 적용
    if (S.core.max > oldMax) S.core.hp += S.core.max - oldMax;
    for (const u of S.units) if (lineOf(u.type) === 'core' && !u.dead) refreshUnit(S, u); // 포탑은 성 강화 카드를 받는다
    const summon = { s_turret: ['turret'], s_golem: ['golem'], s_hero: ['hero'], s_marksman: ['marksman'], s_repeaters: ['repeater', 'repeater'], s_ballista: ['ballista'], l_sword: ['legendsword'], l_archer: ['legendarcher'] }[c.id];
    if (summon) for (const t of summon) { addUnit(S, t); const steps = CFG.units[t].priceSteps | 0; if (steps > 0) { S.buyCount += steps; emit(S, { type: 'priceUp' }); } } // 특수 유닛(골렘·용사·포탑)은 priceSteps가 0이라 가격을 올리지 않는다
    emit(S, { type: 'picked', name: c.name });
    return true;
  }
  // 카드 선택 결과로 달라지는 값을 한 곳에서 다시 계산
  function recompute(S) {
    const L = id => taken(S, id), c = S.core, b = CFG.core;
    const v = V();
    const K = CFG.castle, kl = (S.castle ? S.castle.lv : 1) - 1;
    c.lv = kl + 1; c.cannons = 1 + K.cannonLv.filter(l => l <= kl + 1).length;
    c.max = b.hp + v.fortHp * L('f_hp') + K.hp * kl;
    c.atk = b.atk * (1 + v.coreAtk * L('c_atk') + K.atk * kl);
    c.rate = b.rate * (1 + v.coreRate * L('c_rate') + K.rate * kl);
    c.range = b.range + v.coreRange * L('c_range') + K.range * kl;
    const boost = 1 + v.auraBoost * L('a_rad');
    S.aura = { heal: v.auraHeal * L('a_heal') * boost, atk: v.auraAtk * L('a_atk') * boost, def: Math.min(v.auraDefCap, v.auraDef * L('a_def') * boost), spd: v.auraSpd * L('a_spd') * boost, r: CFG.auraBase,
               on: AURA_IDS.some(a => L(a) > 0) };
    S.jobMods = { sword: jobModsOf(S, 'sword'), archer: jobModsOf(S, 'archer'), priest: jobModsOf(S, 'priest') };
    S.perks = { guard: L('u_guard'), charge: L('u_charge'), pierce: L('u_pierce'), crit: L('u_crit'), archerRange: L('u_range'), aoeHeal: L('u_aoeheal'), revive: L('u_revive'),
                splash: L('c_splash'), chain: L('c_chain'), bomb: L('c_bomb'), thorn: L('f_thorn'), repair: L('f_repair') };
  }
  // 전직 효과 합산 (유닛 종류별)
  const zeroMods = () => ({ hp: 0, atk: 0, rate: 0, speed: 0, def: 0, regen: 0, cleave: 0, range: 0, pierce: 0, crit: 0, heal: 0, healRange: 0, healRate: 0, revive: 0, dbl: 0, reflect: 0, berserk: 0, splash: 0, mark: 0, ward: 0, smite: 0 });
  function jobDef(type, id) {
    const j = CFG.jobs[type]; if (!j) return null;
    for (const d of j.t1) if (d.id === id) return d;
    for (const k in j.t2) for (const d of j.t2[k]) if (d.id === id) return d;
    return null;
  }
  function jobModsOf(S, type) {
    const m = zeroMods(), ids = S.jobs[type] ? S.jobs[type].ids : [];
    for (const id of ids) { const d = jobDef(type, id); if (!d) continue; for (const k in d.mods) m[k] += d.mods[k]; }
    return m;
  }
  const lineOf = type => (CFG.units[type] && CFG.units[type].line) || type; // 어느 직업 계열의 강화를 받는가
  const isStatic = e => !!(e.team === 'u' && CFG.units[e.type] && CFG.units[e.type].static);
  const pierceCount = S => S.perks.pierce + S.jobMods.archer.pierce;
  // 유닛 종류별 강화 수치 반영
  function statsOf(S, type) {
    const b = CFG.units[type], line = lineOf(type);
    if (line === 'core') { // 포탑: 성 공격력·공속·사거리 강화를 받는다
      const v = V(), L = id => taken(S, id);
      return { max: b.hp, atk: S.core.atk, rate: S.core.rate, speed: b.speed, heal: 0, healRate: 0, range: S.core.range, healRange: 0 };
    }
    // 사제는 유닛 수가 적어서 강화 효과를 2배로 쳐 준다
    const k = 1; // 사제도 일반 유닛과 같은 강화 효과 (치유량·속도 카드 증가폭 축소)
    const l = S.up[line] || { hp: 0, atk: 0, rate: 0, speed: 0 }, p = Object.fromEntries(Object.entries(CFG.upPct).map(([n, v]) => [n, v * k]));
    const jm = (S.jobMods && S.jobMods[line]) || zeroMods();
    const bu = S.bossUp || { hp: 0, atk: 0 }, bh = 1 + p.hp * bu.hp, ba = 1 + p.atk * bu.atk; // 보스 보상 [전군 강화]는 일반 강화와 별개로 곱해진다
    return {
      max: Math.round(b.hp * (1 + p.hp * l.hp) * bh * (1 + jm.hp)), atk: b.atk * (1 + p.atk * l.atk) * ba * (1 + jm.atk), rate: b.rate * (1 + p.rate * l.rate) * (1 + jm.rate),
      speed: b.speed * (1 + p.speed * l.speed) * (1 + jm.speed), heal: (b.heal || 0) * (1 + p.atk * l.atk) * ba * (1 + jm.heal),
      healRate: b.healRate ? b.healRate / ((1 + p.rate * l.rate) * (1 + jm.healRate)) : 0, range: (b.range || 0) * (line === 'archer' ? 1 + V().archerRange * taken(S, 'u_range') : 1) + jm.range, healRange: (b.healRange || 0) + jm.healRange,
    };
  }
  function refreshUnit(S, u) {
    if (u.undead) return;
    const s = statsOf(S, u.type);
    if (s.max > u.max) u.hp += s.max - u.max;
    u.max = s.max; u.atk = s.atk; u.rate = s.rate; u.speed = s.speed; u.heal = s.heal; u.healRate = s.healRate; u.range = s.range; u.healRange = s.healRange;
    const ids = S.jobs[lineOf(u.type)] ? S.jobs[lineOf(u.type)].ids : []; u.job = ids.length ? ids[ids.length - 1] : null; u.jobTier = ids.length;
    if (u.hp > u.max) u.hp = u.max;
  }
  function describeTaken(S) {
    const out = [];
    for (const key in S.cards.taken) {
      const [id, type] = key.split(':'), def = DEF[id], lv = S.cards.taken[key];
      const gt = def.generic ? genericText(def, type, lv) : null, name = gt ? gt.name : def.name;
      out.push({ key, name, lv, rar: def.rar, max: def.max, cat: def.cat, desc: gt ? gt.desc : (def.desc ? def.desc(lv) : '') });
    }
    return out;
  }

  // ───────────── 게임 생성 ─────────────
  function createGame(seed, mode) {
    const S = {
      mode: mode === 'free' ? 'free' : 'normal', // free: 유닛이 성 주변에 머물지 않고 범위 안의 적을 어디까지든 쫓아간다
      seed: seed >>> 0, rng: mulberry32(seed >>> 0),
      t: 0, phase: 'prep', prepT: PREP_TIME, round: 0, roundT: 0, clearT: 0, zones: [], pools: [], rain: [],
      queue: [], spawnT: 0, spawnGap: 1, spawnPts: 2, extraPts: 0, fallen: [], endless: false, castle: { lv: 1 },
      gold: CFG.startGold, buyCount: 0,
      stats: { earned: CFG.startGold, spent: 0, killBy: {}, made: {}, seenE: {}, seenB: {}, peakPop: 0, bossKills: 0 }, // 기록·도감·업적·부정 확인용 집계
      core: { x: CX, y: CY, hp: CFG.core.hp, max: CFG.core.hp, r: CFG.core.r, atk: CFG.core.atk, rate: CFG.core.rate, range: CFG.core.range, cd: 0, flash: 0, aim: -Math.PI / 2, swing: 0 },
      units: [], enemies: [], shots: [], shotPool: [],
      kills: 0, nextId: 1,
      prod: [], spawnN: 0, buyCd: { sword: 0, archer: 0, priest: 0 },
      threat: 0, over: false, win: false,
      captureEvents: false, events: [], numQ: [],
      gU: makeGrid(48), gE: makeGrid(48), gA: makeGrid(48), seen: {},
      cards: { offer: null, rerolls: CFG.rerolls, taken: {}, boss: false },
      bossUp: { hp: 0, atk: 0 },
      up: { sword: { hp: 0, atk: 0, rate: 0, speed: 0 }, archer: { hp: 0, atk: 0, rate: 0, speed: 0 }, priest: { hp: 0, atk: 0, rate: 0, speed: 0 } },
      aura: null, perks: null, bombCd: 8, reviveLeft: 0, jobMods: null, biasNow: 0.08, coreDmgBy: {},
      cnodes: [], cOffer: null, cpar: null, log: [], act: 1, cinematic: null, bossDeath: null, // act 2: 30라운드 보스 처치 후. cinematic: 연출이 진행되는 동안 시간이 멈춘다
      jobs: { sword: { ids: [] }, archer: { ids: [] }, priest: { ids: [] }, offer: null },
    };
    // 일반 보스 5종의 등장 순서 (게임마다 무작위, 한 번씩)
    const shuffled = () => { const o = CFG.bossPool.map((_, i) => i); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(S.rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
    S.bossOrder = shuffled(); S.bossOrder2 = shuffled(); // 1막(5~25라운드)과 2막(35~45라운드)의 보스 순서
    recompute(S);
    return S;
  }
  function emit(S, ev) { if (S.captureEvents && S.events.length < 600) S.events.push(ev); }
  function drainEvents(S) { const e = S.events; S.events = []; return e; }

  // ───────────── 유닛 추가 (생산/소환 공통) ─────────────
  // 판 기록(통계 상세용): 어느 라운드에 무엇을 골랐는지·어떤 선택지가 있었는지·유닛을 몇 명 뽑았는지
  function logEv(S, e) { if (S.log.length < 700) S.log.push(e); }
  function logBuy(S, type) { const l = S.log[S.log.length - 1]; if (l && l[0] === 'u' && l[1] === S.round && l[2] === type) l[3]++; else if (!S.dev) logEv(S, ['u', S.round, type, 1]); }
  function addUnit(S, type) {
    S.stats.made[type] = 1; if (UNIT_TYPES.includes(type)) logBuy(S, type);
    const cfg = CFG.units[type], st = statsOf(S, type);
    const a = S.rng() * Math.PI * 2, rr = 86 + S.rng() * 20; // 성 원형 밖에서 나온다
    const ha = S.spawnN++ * 2.39996323 + S.rng() * 0.3, hr = (CFG.ai.homeR[type] || 120) * (0.9 + 0.2 * S.rng()); // 황금각으로 사방에 퍼뜨림
    let x = CX + Math.cos(a) * rr, y = CY + Math.sin(a) * rr;
    if (cfg.static) { // 설치형(포탑/발리스타): 성 둘레의 정해진 자리
      const n = S.units.filter(u => u.type === type && !u.dead).length, ta = n * Math.PI + (type === 'turret' ? 0.8 : 2.4), rad = type === 'turret' ? 105 : 140;
      x = CX + Math.cos(ta) * rad; y = CY + Math.sin(ta) * rad;
    }
    const u = {
      id: S.nextId++, type, team: 'u', x, y,
      hp: st.max, max: st.max, atk: st.atk, rate: st.rate, range: st.range, speed: st.speed, r: cfg.r,
      heal: st.heal, healRate: st.healRate, healRange: st.healRange,
      job: (S.jobs[lineOf(type)] && S.jobs[lineOf(type)].ids.length) ? S.jobs[lineOf(type)].ids[S.jobs[lineOf(type)].ids.length - 1] : null, jobTier: S.jobs[lineOf(type)] ? S.jobs[lineOf(type)].ids.length : 0,
      cd: 0, flash: 0, swing: 0, dead: false, ha, hr, hx: CX + Math.cos(ha) * hr, hy: CY + Math.sin(ha) * hr,
      aura: 0, n: 0,
    };
    S.units.push(u);
    emit(S, { type: 'spawn', x: u.x, y: u.y });
    return u;
  }

  // ───────────── 플레이어 행동 ─────────────
  // 인구: 설치형(포탑·발리스타)을 뺀 유닛 수. 상한은 성 레벨이 올릴 때마다 늘어난다 (카드·보상으로 얻는 특수 유닛은 상한과 무관하게 합류)
  // 성 레벨업마다 늘어나는 인구가 +1씩 커진다 (2레벨 +3, 3레벨 +4, 4레벨 +5 …)
  const popCap = S => { if (S.castle.lv >= CFG.castle.max) return 1e9; const n = S.castle.lv - 1; return CFG.castle.popBase + CFG.castle.popPer * n + n * (n - 1) / 2; };
  const popGain = lv => CFG.castle.popPer + (lv - 2); // lv 레벨로 올릴 때 늘어나는 인구
  const popCount = S => { let n = 0; for (const u of S.units) if (!u.dead && UNIT_TYPES.includes(u.type)) n++; return n; }; // 기본 3종만 인구에 포함
  const specialCount = S => { let n = 0; for (const u of S.units) if (!u.dead && !isStatic(u) && !UNIT_TYPES.includes(u.type)) n++; return n; }; // 특수 유닛(골렘·용사·전설 등)은 따로
  const castleCost = S => S.castle.lv >= CFG.castle.max ? Infinity : CFG.castle.cost[S.castle.lv - 1];
  function upgradeCastle(S, free) {
    if (S.over || S.castle.lv >= CFG.castle.max) return { ok: false, reason: 'max' };
    const cost = castleCost(S); if (!free && S.gold < cost) return { ok: false, reason: 'gold' };
    if (!free) { S.gold -= cost; S.stats.spent += cost; }
    const oldMax = S.core.max; S.castle.lv++; recompute(S);
    S.core.hp = Math.min(S.core.max, S.core.hp + (S.core.max - oldMax) + S.core.max * 0.1);
    for (const u of S.units) if (lineOf(u.type) === 'core' && !u.dead) refreshUnit(S, u); // 포탑도 성 강화를 받는다
    if (!free) logEv(S, ['k', S.round, S.castle.lv]);
    emit(S, { type: 'castleUp', lv: S.castle.lv, cannons: S.core.cannons, pop: popCap(S) });
    return { ok: true, cost: free ? 0 : cost };
  }
  function buy(S, type) {
    if (S.over) return { ok: false, reason: 'over' };
    if (!UNIT_TYPES.includes(type)) return { ok: false, reason: 'type' };
    const cfg = CFG.units[type];
    if (S.buyCd[type] > 0) return { ok: false, reason: 'cooldown' };
    if (popCount(S) >= popCap(S)) return { ok: false, reason: 'pop' };
    const cost = unitCostOf(S, type);
    if (S.gold < cost) return { ok: false, reason: 'gold' };
    S.gold -= cost; S.stats.spent += cost; S.buyCd[type] = cfg.buyCd; S.buyCount++;
    return { ok: true, unit: addUnit(S, type), cost };
  }

  // 생산 대기열: 누르는 즉시 골드를 내고 대기열(최대 prodMax)에 들어가 순서대로 생산된다. 완성되는 순간의 가격이 다르면 차액을 정산한다 (비싸졌으면 추가 지불, 싸졌으면 환급)
  function enqueue(S, type) {
    if (S.over) return { ok: false, reason: 'over' };
    if (!UNIT_TYPES.includes(type)) return { ok: false, reason: 'type' };
    if (S.prod.length >= CFG.prodMax) return { ok: false, reason: 'queue' };
    if (popCount(S) + S.prod.length >= popCap(S)) return { ok: false, reason: 'pop' };
    const cost = unitCostOf(S, type);
    if (S.gold < cost) return { ok: false, reason: 'gold' };
    S.gold -= cost; S.stats.spent += cost; S.prod.push({ type, paid: cost, t: 0, wait: false });
    return { ok: true, cost };
  }
  function cancelProd(S, i) { const p = S.prod[i]; if (!p) return false; S.gold += p.paid; S.stats.spent -= p.paid; S.prod.splice(i, 1); return true; }
  function updateProd(S, dt) {
    const p = S.prod[0]; if (!p) return;
    const need = CFG.units[p.type].buyCd; if (p.t < need) p.t += dt;
    if (p.t < need) return;
    const diff = unitCostOf(S, p.type) - p.paid;
    if (diff > S.gold) { p.wait = true; return; } // 가격이 올라 추가 비용이 모자라면 골드가 찰 때까지 기다린다
    p.wait = false; S.gold -= diff; S.stats.spent += diff; S.prod.shift(); S.buyCount++; addUnit(S, p.type);
  }
  // ───────────── 보스 ─────────────
  // 이번 게임에서 r라운드의 보스 (보스 라운드가 아니면 null). 30라운드는 최종 보스.
  function bossDefFor(S, r) {
    if (r === MAX_ROUND) return CFG.finalBoss;
    if (r === ACT1_END) return CFG.act1Boss;
    if (r > MAX_ROUND) return r % 5 === 0 ? CFG.bossPool[(r / 5) % CFG.bossPool.length] : null; // 무한 모드: 5라운드마다 보스 (마왕은 50라운드에만 나온다)
    if (r % 5 !== 0 || r < 5 || r > 45) return null;
    return r < ACT1_END ? CFG.bossPool[S.bossOrder[r / 5 - 1]] : CFG.bossPool[S.bossOrder2[(r - 35) / 5]];
  }
  const bossBaseHp = r => CFG.bossHp[r] || (r > MAX_ROUND ? CFG.endless.bossBase * Math.pow(endF(r), CFG.endless.bossExp) * (r % 10 === 0 ? CFG.endless.marMul : 1) : CFG.bossHp[MAX_ROUND]);
  const bossInfo = (S, r) => { const d = bossDefFor(S, r); return d ? Object.assign({ hp: bossBaseHp(r) }, d) : null; };
  // 풀 보스의 패턴 수치를 라운드에 맞춰 조정 (15라운드 = 기준). 일찍 나오면 약하게, 늦게 나오면 강하게.
  const SUMMON_UP = { grunt: 'captain', shield: 'ironshield', archer: 'crossbow', bomber: 'sapper', shaman: 'warlock' }; // 소환 졸개의 강화형
  const BLINK_MAX = 310; // 보스 순간이동 1회 최대 이동 거리
  function scaleAbil(abil, r) {
    const s = clamp(r / 15, 0.5, 2.2), out = {};
    for (const k in abil) {
      if (k === 'debuff') continue;
      const a = Object.assign({}, abil[k]);
      if (k === 'artillery') { a.dmg = Math.round(a.dmg * s); a.count = Math.max(1, Math.min(a.count + (r > ACT1_END ? 1 : 0), Math.ceil(r / 12))); }
      else if (k === 'summon') a.n = Math.max(2, Math.round(a.n * Math.min(1.8, s)));
      else if (k === 'dash') a.mul = 1 + (a.mul - 1) * Math.min(1, s + 0.35);
      else if (k === 'shield') a.red = a.red * Math.min(1, 0.55 + 0.45 * s);
      out[k] = a;
    }
    if (abil.debuff) out.debuff = abil.debuff.map(d => Object.assign({}, d));
    return out;
  }

  // ───────────── 라운드 ─────────────
  // ── 기록 검증(적당한 수준): 이 라운드까지 벌 수 있는 골드 상한과 비교한다 ──
  const KIND_AVG = r => { const ks = Object.keys(CFG.spawn).filter(k => r >= CFG.spawn[k].from), tot = ks.reduce((t, k) => t + CFG.spawn[k].w, 0); return ks.reduce((t, k) => t + CFG.spawn[k].w * CFG.enemies[k].gold, 0) / tot; };
  function goldBound(R) {
    let b = CFG.startGold + 100;
    for (let r = 1; r <= R; r++) {
      if (r > 1) b += 15 + 2 * r;
      const E = CFG.elite, ep = r >= E.from ? Math.min(E.max, (r - E.from + 1) * E.perRound) : 0;
      b += 1.6 * (enemyCount(r) * KIND_AVG(r) * (1 + ep * (E.gold - 1)) + (r % 5 === 0 && r >= 5 ? CFG.enemies.boss.gold : 0));
    }
    return Math.round(b);
  }
  function checkRun(S) {
    const st = S.stats, bound = goldBound(S.round), why = [];
    if (S.dev) why.push('개발자 모드');
    if (st.earned > bound) why.push('골드 수입 ' + Math.round(st.earned) + ' > 상한 ' + bound);
    if (st.spent > st.earned + 1) why.push('사용 골드가 수입보다 많음');
    if (S.gold > st.earned - st.spent + 1 || S.gold < st.earned - st.spent - 1) why.push('보유 골드가 수입-지출과 맞지 않음');
    let kb = 0; for (let r = 1; r <= S.round; r++) kb += enemyCount(r) * 3 + 60; if (S.kills > kb) why.push('처치 수가 너무 많음');
    return { ok: !why.length, bound, why };
  }
  function startRound(S) {
    S.phase = 'round'; S.round++; S.roundT = 0; S.clearT = 0;
    const r = S.round;
    S.reviveLeft = S.perks.revive + S.jobMods.priest.revive;
    if (r > 1) {
      S.gold += 15 + 2 * r; S.stats.earned += 15 + 2 * r;
      for (const u of S.units) if (!u.dead) u.hp = Math.min(u.max, u.hp + u.max * CFG.healAfterRound);
      S.core.hp = Math.min(S.core.max, S.core.hp + S.core.max * CFG.balance.coreRepair); // 기본 수리
      if (S.perks.repair) S.core.hp = Math.min(S.core.max, S.core.hp + S.core.max * V().repair * S.perks.repair);
    }
    S.spawnPts = spawnPointCount(r);
    { const ex = extraCount(r); if (ex > (S.extraPts || 0)) emit(S, { type: 'portalOpen', n: ex }); S.extraPts = ex; }
    const n = enemyCount(r), q = [];
    const kinds = Object.keys(CFG.spawn).filter(k => r >= CFG.spawn[k].from), tot = kinds.reduce((t, k) => t + CFG.spawn[k].w, 0);
    for (let i = 0; i < n; i++) {
      let x = S.rng() * tot, pick = kinds[0];
      for (const k of kinds) { if ((x -= CFG.spawn[k].w) < 0) { pick = k; break; } }
      q.push(pick);
    }
    const boss = bossDefFor(S, r);
    if (boss) q.unshift('boss'); // 보스 라운드에는 시작과 동시에 보스가 나온다
    S.queue = q; S.spawnGap = SPAWN_TIME / q.length; S.spawnT = 0;
    let text = '라운드 ' + r;
    if (r === 10) text += ' · 스폰 지점 증가';
    if (r === 20) text += ' · 대혼란';
    if (r === MAX_ROUND + 1) { text = '🩸 무한 모드 · 하늘이 붉게 물든다'; emit(S, { type: 'notice', text: '마왕을 쓰러뜨렸다! 이제부터 끝없이 강해지는 적을 버텨라' }); }
    else if (r > MAX_ROUND) text += ' · 무한';
    emit(S, boss ? { type: 'banner', text: '⚠ 보스 라운드 · ' + boss.name, boss: true } : { type: 'banner', text });
    const next = bossDefFor(S, r + 1);
    if (next) emit(S, { type: 'notice', text: '다음 라운드 보스: ' + next.name });
    if (r >= 2) openCards(S, (r - 1) % 5 === 0); // 라운드를 넘길 때마다 업그레이드 선택 (보스 클리어 직후엔 희귀 이상 보장)
  }
  // 적 한 마리 만들기. x,y를 주지 않으면 스폰 지점에서 나온다.
  function spawnEnemy(S, kind, x, y) {
    const cfg = CFG.enemies[kind], r = S.round;
    if (x === undefined) {
      const angs = spawnAngles(S.spawnPts), ex = extraAngles(S.extraPts || 0), k = Math.floor(S.rng() * (angs.length + ex.length));
      const isEx = k >= angs.length, ang = (isEx ? ex[k - angs.length] : angs[k]) + (S.rng() - 0.5) * 0.12, ring = isEx ? EXTRA_RING : SPAWN_RING;
      x = clamp(CX + Math.cos(ang) * ring + (S.rng() - 0.5) * 80, 20, W - 20);
      y = clamp(CY + Math.sin(ang) * ring + (S.rng() - 0.5) * 80, 20, H - 20);
    }
    const bd = kind === 'boss' ? (bossDefFor(S, r) || CFG.bossPool[0]) : null;
    const hp = Math.max(1, Math.round((bd ? bossBaseHp(r) * CFG.balance.bossHp : cfg.hp * hpMul(r)) * CFG.balance.enemyHp * (!bd && !cfg.ranged && !cfg.healRange ? CFG.balance.meleeHp : 1)));
    const E = CFG.elite, elite = !bd && E.max > 0 && r >= E.from && S.rng() < Math.min(E.max, (r - E.from + 1) * E.perRound);
    const e = {
      id: S.nextId++, kind, team: 'e', x, y, hp, max: hp, dmg: cfg.dmg * dmgMul(r) * CFG.balance.enemyDmg * (!bd && cfg.ranged ? CFG.balance.rangedDmg : 1), rate: cfg.rate, range: cfg.range,
      speed: cfg.speed * enemySpeedMul(r), r: (bd && bd.r) || cfg.r, gold: cfg.gold, aggro: cfg.aggro,
      cd: 0, age: 0, flash: 0, swing: 0, dead: false,
      ranged: !!cfg.ranged, blast: cfg.blast || 0, healRange: cfg.healRange || 0, healPct: cfg.healPct || 0, healRate: cfg.healRate || 0, keep: cfg.keep || 0,
      speedMul: 1, rateMul: 1, dmgMul: 1, shieldT: 0, shieldRed: 0, dashT: 0,
      air: !!cfg.air, rres: cfg.rres || 1, mres: cfg.mres || 1, rush: cfg.rush || 0, poison: cfg.poison || 0,
    };
    if (elite) { // 엘리트: 체력·공격·크기·보상 상향
      e.elite = true; e.max = e.hp = Math.round(e.hp * E.hp); e.dmg *= E.dmg; e.r = Math.round(e.r * E.size * 10) / 10; e.gold = Math.round(e.gold * E.gold); e.speed *= E.speed;
      emit(S, { type: 'elite', x, y, kind });
    }
    if (bd) {
      e.bossName = bd.name; e.look = bd.look; e.abil = (bd === CFG.finalBoss || bd === CFG.act1Boss) ? bd.abil : scaleAbil(bd.abil, r); e.t = {};
      for (const k in e.abil) if (!Array.isArray(e.abil[k])) e.t[k] = (e.abil[k].cd || 0) * 0.6; // 첫 패턴은 조금 일찍
      if (bd === CFG.finalBoss && r === MAX_ROUND) { const N = CFG.finalNerf; e.max = e.hp = Math.round(e.max * N.hp); e.max2 = Math.round(e.max / N.hp * N.hp2); e.dmg *= N.dmg; e.canRevive = true; }
      S.stats.seenB[bd.id] = 1;
      emit(S, { type: 'bossSpawn', name: bd.name, id: bd.id, line: bd.line, look: bd.look, r: e.r });
    }
    if (!bd) S.stats.seenE[kind] = 1;
    if (!bd && kind !== 'grunt' && !S.seen[kind]) { S.seen[kind] = 1; emit(S, { type: 'newEnemy', kind }); } // 처음 보는 종류: 소개 팝업
    S.enemies.push(e);
    emit(S, { type: 'espawn', x, y, boss: !!bd }); // 나타나는 순간 효과
    return e;
  }

  // ───────────── 피해/사망 ─────────────
  // ───────────── 보스 사망 연출 ─────────────
  // 보스 체력이 0이 되면: 남은 졸개가 모두 쓰러지고, 시간이 멈춘 채 보스의 사망 모션이 흐른 뒤 라운드가 끝난다.
  // 50라운드 마왕은 여기서 한 번 더 부활한다 (체력이 다시 차오르며 모습이 바뀐다).
  function beginBossDeath(S, b) {
    b.dying = true; b.hp = 0; b.shieldT = 0; b.dashT = 0; b.leapT = 0;
    const revive = !!b.canRevive && !b.p2 && !S.endless;
    S.gold += b.gold; S.stats.earned += b.gold; S.kills++; S.stats.killBy.boss = (S.stats.killBy.boss || 0) + 1; if (!revive) S.stats.bossKills++;
    emit(S, { type: 'kill', x: b.x, y: b.y, boss: true });
    S.queue.length = 0; S.zones.length = 0; S.pools.length = 0; S.rain.length = 0;
    for (const o of S.enemies) if (!o.dead && o !== b) { o.dead = true; emit(S, { type: 'kill', x: o.x, y: o.y, boss: false, wipe: true }); }
    S.bossDeath = { b, t: 0, dur: CFG.bossDeathT, stage: 'die', revive, t0: 0 };
    emit(S, { type: 'bossDying', x: b.x, y: b.y, r: b.r, name: b.bossName, id: b.kind, dur: CFG.bossDeathT, revive });
    emit(S, { type: 'bossWipe', x: b.x, y: b.y });
  }
  function p2Abil(abil) {
    const N = CFG.finalNerf, out = {};
    for (const k in abil) { const a = abil[k]; out[k] = Array.isArray(a) ? a.map(d => Object.assign({}, d, { cd: d.cd * N.cdMul })) : Object.assign({}, a, a.cd ? { cd: a.cd * N.cdMul } : {}); }
    if (out.rage) out.rage = Object.assign({}, out.rage, { at: N.rageAt });
    delete out.rush; return out;
  }
  function stepBossDeath(S, dt) {
    const D = S.bossDeath, b = D.b, N = CFG.finalNerf; D.t += dt;
    if (D.stage === 'die') {
      if (D.t < D.dur) return;
      if (D.revive) { // 각성: 모습이 바뀌고 체력이 0에서 다시 차오른다
        D.stage = 'revive'; D.t0 = D.t; b.p2 = true; b.bossName = N.name; b.look = N.look; b.r = N.r; b.max = b.max2; b.hp = 0; b.gold = 0;
        b.abil = p2Abil(b.abil); b.t = {}; for (const k in b.abil) if (!Array.isArray(b.abil[k])) b.t[k] = (b.abil[k].cd || 0) * 0.6;
        b.life = 0; b.enraged = false; b.rushDone = true; b.age = 0; b.enr = false; b.cd = 1;
        emit(S, { type: 'bossRevive', x: b.x, y: b.y, r: b.r, name: b.bossName, dur: N.reviveT });
        return;
      }
      b.dead = true; S.bossDeath = null; emit(S, { type: 'bossGone', x: b.x, y: b.y, r: b.r });
      if (S.round === ACT1_END && S.act === 1) { S.act = 2; S.cinematic = { name: b.bossName, kind: 'act2' }; emit(S, { type: 'act2', boss: b.bossName }); } // 1막 마지막 보스 처치 → 연출 후 2막
      if (S.round === MAX_ROUND && !S.endless) reviveForEndless(S, b); // 마왕 처치 → 연출과 함께 무한 모드가 시작된다
      openJobs(S, b.bossName); // 보스를 처치하면 전직 선택
      return;
    }
    const p = Math.min(1, (D.t - D.t0) / N.reviveT); b.hp = b.max * p * (2 - p); // 체력 바가 빠르게 차올랐다가 천천히 가득 찬다
    if (p >= 1) { b.hp = b.max; b.dying = false; S.bossDeath = null; emit(S, { type: 'bossRevived', x: b.x, y: b.y, name: b.bossName }); }
  }
  const coreGuard = S => { let n = 0; for (const u of S.units) if (!u.dead && !u.undead && !isStatic(u)) n++; return Math.min(CFG.balance.guardMax, CFG.balance.guardPerUnit * n); };
  function hitCore(S, dmg, src) {
    if (src === '폭파병') dmg *= CFG.balance.bomberCoreMul; // 폭파병은 성 피해가 전체의 대부분이라 성에 대한 폭발력을 줄였다
    dmg *= 1 - coreGuard(S); // 병사가 살아 있을수록 성이 덜 맞는다 (병사가 성을 지킨다)
    if (S.cpar && S.cpar.cdef) dmg *= 1 - S.cpar.cdef; // 빙결 결계·수호 방벽·영혼 결속: 성이 받는 피해 감소
    const c = S.core; c.hp -= dmg; c.flash = 0.12;
    const by = S.coreDmgBy; const k = src || '기타'; by[k] = (by[k] || 0) + dmg; // 어떤 공격에 성이 많이 맞는지 (밸런스 진단용)
    if (c.hp <= 0 && !S.over && S.cpar && S.cpar.lastStand && !S.lsUsed) { S.lsUsed = true; c.hp = c.max * 0.5; emit(S, { type: 'lastStand' }); return; } // 불사 결계: 한 번 되살아난다
    if (c.hp <= 0 && !S.over) { c.hp = 0; S.over = true; S.win = false; emit(S, { type: 'over', win: false }); }
  }
  // 피해/치유 숫자: 같은 대상에게 짧은 시간 들어온 양은 합쳐서 한 번에 표시 (이벤트 수를 줄인다). 치명타는 즉시 따로 표시.
  function numNote(S, t, v, kind) {
    if (kind === 'c') { emit(S, { type: 'num', x: t.x, y: t.y - t.r, v, team: t.team, crit: true }); return; }
    if (kind === 'h') t.nh = (t.nh || 0) + v; else t.nd = (t.nd || 0) + v;
    if (!t.nq) { t.nq = true; t.nT = S.t + 0.3; S.numQ.push(t); }
  }
  function flushNums(S) {
    const q = S.numQ; if (!q.length) return;
    let w = 0;
    for (let i = 0; i < q.length; i++) {
      const t = q[i];
      if (S.t < t.nT && !t.dead) { q[w++] = t; continue; }
      if (t.nd >= 1) emit(S, { type: 'num', x: t.x, y: t.y - t.r, v: t.nd, team: t.team });
      if (t.nh >= 1) emit(S, { type: 'num', x: t.x, y: t.y - t.r, v: t.nh, team: t.team, heal: true });
      t.nd = 0; t.nh = 0; t.nq = false;
    }
    q.length = w;
  }
  function damage(S, tgt, dmg, crit, src) {
    if (tgt.dead || tgt.dying) return;
    if (src && tgt.team === 'u' && !src.dead) { tgt.rv = src; tgt.rvT = 6; } // 맞은 유닛이 때린 적을 기억 (자유 모드 반격용)
    if (CFG.dmgVar) dmg *= 1 + (S.rng() * 2 - 1) * CFG.dmgVar; // 공격력 ±N% 오차
    if (tgt.team === 'e' && tgt.shieldT > 0) dmg *= 1 - tgt.shieldRed; // 보스 방어막 동안 피해 감소
    if (tgt.team === 'e' && tgt.markT > 0) dmg *= 1 + tgt.markAmp; // 사냥꾼의 표식
    if (tgt.team === 'u') {
      let red = 0;
      if (tgt.aura) red += S.aura.def;
      if (S.perks.guard && lineOf(tgt.type) === 'sword') red += V().guard * S.perks.guard;
      if (S.jobMods && S.jobMods[lineOf(tgt.type)]) red += S.jobMods[lineOf(tgt.type)].def; // 전직 방어
      dmg *= 1 - Math.min(0.7, red);
      if (tgt.ward > 0) { const ab = Math.min(tgt.ward, dmg); tgt.ward -= ab; dmg -= ab; if (ab > 0) tgt.wardFx = 0.25; } // 수호사제·수호 방벽의 보호막
      const rf = S.jobMods && S.jobMods[lineOf(tgt.type)] ? S.jobMods[lineOf(tgt.type)].reflect : 0;
      if (rf && src && src.team === 'e' && !src.dead && dmg > 0) damage(S, src, dmg * rf); // 워로드: 받은 피해의 일부를 되돌린다
    }
    tgt.hp -= dmg; tgt.flash = 0.1;
    if (S.captureEvents) numNote(S, tgt, dmg, crit ? 'c' : 'd');
    if (tgt.hp > 0) return;
    if (tgt.team === 'u' && S.reviveLeft > 0 && !isStatic(tgt) && !tgt.undead && S.units.some(p => p.type === 'priest' && !p.dead && p !== tgt)) {
      S.reviveLeft--; tgt.hp = tgt.max * V().revive; emit(S, { type: 'revive', x: tgt.x, y: tgt.y, ut: tgt.type, job: tgt.job, jt: tgt.jobTier }); return;
    }
    if (tgt.team === 'e' && tgt.kind === 'boss') { beginBossDeath(S, tgt); return; } // 보스는 사망 연출이 끝난 뒤에 쓰러진다
    tgt.dead = true;
    if (tgt.team === 'e') {
      S.gold += tgt.gold; S.stats.earned += tgt.gold; S.kills++; S.stats.killBy[tgt.kind] = (S.stats.killBy[tgt.kind] || 0) + 1; if (tgt.kind === 'boss') S.stats.bossKills++; emit(S, { type: 'kill', x: tgt.x, y: tgt.y, boss: tgt.kind === 'boss' });
      if (S.cpar && S.cpar.raise) raiseUndead(S, tgt);
    }
    else if (tgt.type === 'undead') emit(S, { type: 'undeadFade', x: tgt.x, y: tgt.y });
    else { if (S.fallen.length < 80) S.fallen.push(tgt.type); const k = src && src.team === 'e' ? { kind: src.kind, look: src.look, r: src.r, elite: !!src.elite } : null; emit(S, { type: 'udead', x: tgt.x, y: tgt.y, ut: tgt.type, job: tgt.job, jt: tgt.jobTier, by: k }); }
  }
  // 발사 위치: 몸 중심이 아니라 그림의 포구/활 위치 (조준 방향으로 len만큼 나간 지점, 높이 h0에서 출발)
  const MUZZLE = {
    c: { len: 32, h0: 0 },   // 성 대포 포구
    a: { len: 10, h0: 2.5 }, // 아군 궁수의 활
    ea: { len: 10, h0: 2.5 },// 적 사수의 활
    t: { len: 20, h0: 9.5 }, // 포탑 포신
    b: { len: 26, h0: 12 },  // 발리스타 석궁
    es: { len: 85, h0: 34 }, // 보스(포격대장) 어깨 대포
    h: { len: 8, h0: 10 },   // 전투사제의 성스러운 구체
    cm: { len: 14, h0: 36 }, // 갈래를 고른 성: 지붕 위 마법사의 지팡이 끝에서 나간다
    throw: { len: 0, h0: 62 },// 대포가 없는 보스: 머리 위로 던지듯 발사
  };
  // 투사체: 지면 위치(x,y)는 목표를 향해 직선으로 가고, 높이(h)가 포물선을 그린다. 도착하면 피해.
  function fire(S, from, tgt, dmg, spd, color, extra) {
    const m = (color === 'c' && from.cpath) ? MUZZLE.cm : (color === 'es' && !(from.look && from.look.weapon === 'cannon')) ? MUZZLE.throw : (MUZZLE[color] || { len: 0, h0: 0 });
    const ang = Math.atan2(tgt.y - from.y, tgt.x - from.x), sx = from.x + Math.cos(ang) * m.len, sy = from.y + Math.sin(ang) * m.len;
    const dx = tgt.x - sx, dy = tgt.y - sy, d = Math.hypot(dx, dy), cf = CFG.shots;
    const T = extra && extra.T ? extra.T : Math.max(cf.minT, d / spd);
    const H = clamp(cf.arc * d + cf.arcMin, cf.arcMin, cf.arcMax);
    const s = S.shotPool.length ? S.shotPool.pop() : {}; // 쓴 투사체 객체를 재사용 (풀링)
    s.x = sx; s.y = sy; s.sx = sx; s.sy = sy; s.p = 0; s.T = T; s.H = H; s.h = m.h0; s.h0 = m.h0; s.vx = 0; s.vy = 0; s.vh = 0; s.t = tgt; s.from = from; s.dmg = dmg; s.color = color; s.job = from.job || null; s.elite = !!from.elite;
    s.pierce = !!(extra && extra.pierce); s.pc = extra && extra.pc != null ? extra.pc : null; s.aoe = extra && extra.aoe ? extra.aoe : 0; s.crit = !!(extra && extra.crit); s.splash = extra && extra.splash || 0; s.mark = extra && extra.mark || 0;
    S.shots.push(s);
    emit(S, { type: 'shot', x: sx, y: sy, c: color });
  }
  // 도착한 투사체 처리
  function resolveShot(S, s) {
    if (s.aoe) { // 보스 포격: 떨어진 지점 주변 범위 피해
      for (const u of S.units) if (!u.dead && Math.hypot(u.x - s.t.x, u.y - s.t.y) <= s.aoe + u.r) damage(S, u, s.dmg, false, s.from);
      if (Math.hypot(S.core.x - s.t.x, S.core.y - s.t.y) <= s.aoe + S.core.r) hitCore(S, s.dmg * CFG.balance.shellCoreMul, '보스 포격');
      emit(S, { type: 'boom', x: s.t.x, y: s.t.y, r: s.aoe, big: true, enemy: true });
    } else if (s.t === S.core) hitCore(S, s.dmg, '화살(사수)');
    else {
      damage(S, s.t, s.dmg * (s.t.rres || 1), s.crit, s.from); onShotHit(S, s);
      if (s.mark && !s.t.dead) { s.t.markT = 4; s.t.markAmp = s.mark; emit(S, { type: 'marked', x: s.t.x, y: s.t.y }); } // 사냥꾼: 표식
      if (s.splash) { const R = 55, t = s.t; eachNear(S.gE, t.x, t.y, R, e => { if (e !== t) damage(S, e, s.dmg * s.splash); }); emit(S, { type: 'boom', x: t.x, y: t.y, r: R }); } // 포격수: 폭발 화살
    }
  }
  // 성 탄 / 화살의 추가 효과 (폭발, 전이, 관통)
  function onShotHit(S, s) {
    const t = s.t;
    if (s.color === 'c' || s.color === 't') { // 성 탄과 포탑 탄: 폭발·연쇄
      if (S.perks.splash) {
        const R = 50 + 10 * S.perks.splash;
        eachNear(S.gE, t.x, t.y, R, e => { if (e !== t) damage(S, e, s.dmg * 0.5); });
        emit(S, { type: 'boom', x: t.x, y: t.y, r: R });
      }
      if (S.perks.chain) {
        const seen = new Set([t]); let cur = t;
        for (let i = 0; i < S.perks.chain + 1; i++) {
          const best = nearestExcl(S.gE, cur.x, cur.y, 140, seen);
          if (!best) break;
          seen.add(best); emit(S, { type: 'chain', x: cur.x, y: cur.y, tx: best.x, ty: best.y });
          damage(S, best, s.dmg * 0.6); cur = best;
        }
      }
    } else if (s.pierce) {
      const seen = new Set([t]); let cur = t;
      for (let i = 0; i < (s.pc != null ? s.pc : pierceCount(S)); i++) {
        const best = nearestExcl(S.gE, cur.x, cur.y, 80, seen);
        if (!best) break;
        seen.add(best); emit(S, { type: 'chain', x: cur.x, y: cur.y, tx: best.x, ty: best.y, small: true });
        damage(S, best, s.dmg * V().pierce); cur = best;
      }
    }
  }

  // ───────────── 성 트리 (마탑 · 수호 · 사령) ─────────────
  const CT = () => CFG.castleTree;
  const ctNode = id => { const T = CT(); for (const r of T.roots) if (r.id === id) return r; for (const k in T.t2) for (const n of T.t2[k]) if (n.id === id) return n; for (const k in T.t3) for (const n of T.t3[k]) if (n.id === id) return n; return null; };
  function castleOptions(S, n) { // n번째 선택지 (0: 갈래, 1: 공격형/방어형, 2: 최종형)
    const T = CT(), c = S.cnodes;
    const list = n === 0 ? T.roots : n === 1 ? T.t2[c[0]] : T.t3[c[1]];
    return list.map(x => ({ id: x.id, name: x.name, kind: x.kind, desc: x.desc, tier: n + 1, cpath: n === 0 ? x.id : c[0], cvar: n === 1 ? x.id : c[1], cfin: n === 2 ? x.id : null }));
  }
  function checkCastleChoice(S) { const n = S.cnodes.length; if (!S.cOffer && n < 3 && S.castle.lv >= CT().lv[n]) S.cOffer = { tier: n, list: castleOptions(S, n) }; }
  function recomputeCastle(S) {
    const c = S.cnodes, par = {};
    for (const id of c) { const nd = ctNode(id); if (!nd) continue; for (const k in nd.par) { if (typeof nd.par[k] === 'object') { par[k] = par[k] || {}; for (const q in nd.par[k]) par[k][q] = (par[k][q] || 0) + nd.par[k][q]; } else par[k] = (par[k] || 0) + nd.par[k]; } }
    S.cpar = c.length ? par : null;
    S.core.cpath = c[0] || null; S.core.cvar = c[1] || null; S.core.cfin = c[2] || null; S.core.job = c[c.length - 1] || null;
  }
  function pickCastle(S, idx) {
    const o = S.cOffer && S.cOffer.list[idx]; if (!o) return false;
    logEv(S, ['n', S.round, o.name, S.cOffer.list.map(x => x.name)]);
    S.cnodes.push(o.id); S.cOffer = null; recomputeCastle(S);
    emit(S, { type: 'castlePick', name: o.name, id: o.id, cpath: S.core.cpath });
    checkCastleChoice(S); return true;
  }
  function autoCastle(S, pick) { // (개발자 모드·테스트) 성 갈래 선택을 자동으로 처리한다
    for (let i = 0; i < 3; i++) { checkCastleChoice(S); if (!S.cOffer) break; pickCastle(S, pick === undefined ? (S.cnodes.length + 1) % S.cOffer.list.length : Math.min(pick, S.cOffer.list.length - 1)); }
  }
  function describeCastle(S) { return S.cnodes.map(id => ctNode(id)).filter(Boolean).map(n => ({ id: n.id, name: n.name, kind: n.kind, desc: n.desc })); }
  function raiseUndead(S, e) { // 사령: 처치한 일반 적이 일정 확률로 망자가 되어 잠시 아군으로 싸운다
    const R = S.cpar.raise; if (!R || e.kind === 'boss' || (e.elite && !R.elite) || e.blast || S.rng() >= R.chance) return;
    let n = 0; for (const u of S.units) if (!u.dead && u.undead) n++; if (n >= R.max) return;
    const u = addUnit(S, 'undead'); u.undead = true; u.ttl = R.dur; u.x = e.x; u.y = e.y;
    u.max = u.hp = Math.min(6000, Math.max(30, e.max * R.hp)); u.atk = Math.max(3, e.dmg * R.atk); u.r = Math.max(8, Math.min(14, e.r)); u.tint = e.elite ? 1 : 0;
    if (R.bounty) { S.gold += e.gold * R.bounty; S.stats.earned += e.gold * R.bounty; }
    emit(S, { type: 'raise', x: e.x, y: e.y });
  }
  function castBlast(S) { // 마탑: 가장 밀집한 적 무리에 마법 폭발
    const B = S.cpar.blast, c = S.core, cand = S.enemies.filter(e => !e.dead && Math.hypot(e.x - c.x, e.y - c.y) <= c.range + 330);
    if (!cand.length) { S.cb = 1; return; }
    const step = Math.max(1, Math.floor(cand.length / 40)), used = [];
    for (let k = 0; k < Math.round(B.n); k++) {
      let best = null, bn = -1;
      for (let i = 0; i < cand.length; i += step) { const e = cand[i]; if (e.dead || used.some(p => Math.hypot(p[0] - e.x, p[1] - e.y) < B.r * 1.2)) continue; let n = 0; for (const o of cand) if (Math.hypot(o.x - e.x, o.y - e.y) <= B.r) n++; if (n > bn) { bn = n; best = e; } }
      if (!best) break; used.push([best.x, best.y]);
      const x = best.x, y = best.y, dmg = c.atk * B.mul;
      eachNear(S.gE, x, y, B.r, o => { damage(S, o, dmg); if (B.slow > 0) o.slowT = Math.max(o.slowT || 0, B.slow); if (B.freeze > 0) o.frozenT = Math.max(o.frozenT || 0, o.kind === 'boss' ? B.freeze * 0.35 : B.freeze); });
      if (B.zone > 0) S.rain.push({ x, y, r: B.r * 0.95, t: B.zone, tick: 0.3, mul: B.zmul, atk: c.atk, every: 0.5, fx: 'fire', fire: true });
      emit(S, { type: 'castleBlast', x, y, r: B.r, k, zone: B.zone, cvar: c.cvar, cfin: c.cfin, freeze: B.freeze > 0, slow: B.slow > 0 });
    }
    S.cb = B.cd;
  }
  function castPulse(S) { // 수호: 아군 치유·보호막, 공격형은 주변 적에게 피해
    const P = S.cpar.pulse, c = S.core;
    for (const u of S.units) { if (u.dead || u.undead || isStatic(u) || Math.hypot(u.x - c.x, u.y - c.y) > P.r) continue; if (P.heal > 0) applyHeal(S, u, u.max * P.heal); if (P.shield > 0) u.ward = Math.min(u.max * 0.3, (u.ward || 0) + u.max * P.shield); }
    if (P.heal > 0 && c.hp < c.max) c.hp = Math.min(c.max, c.hp + c.max * P.heal * 0.5);
    if (P.dmg > 0) eachNear(S.gE, c.x, c.y, P.r, o => damage(S, o, c.atk * P.dmg));
    emit(S, { type: 'castlePulse', r: P.r, cvar: c.cvar, cfin: c.cfin, dmg: P.dmg > 0, shield: P.shield > 0 });
    S.cp = Math.max(2, P.cd);
  }
  function castleSkillTick(S, dt) {
    const P = S.cpar; if (!P) return;
    if (P.blast) { S.cb = (S.cb === undefined ? P.blast.cd * 0.5 : S.cb) - dt; if (S.cb <= 0) castBlast(S); }
    if (P.pulse) { S.cp = (S.cp === undefined ? P.pulse.cd * 0.5 : S.cp) - dt; if (S.cp <= 0) castPulse(S); }
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
      if (a.dead || a.undead || a.hp >= a.max) continue; // 망자는 치유하지 않는다
      if (Math.hypot(a.x - u.x, a.y - u.y) - a.r > range) continue;
      const p = a.hp / a.max; if (p < bp) { bp = p; best = a; }
    }
    return best;
  }
  // 치유: 1초 동안 받을 수 있는 양에 상한(healCap)이 있고, 치유 감소 상태이면 줄어든다
  function applyHeal(S, t, amt) {
    if (t.undead) return; // 사제·오라·성 파동 모두 망자는 치유하지 않는다
    if (t.woundT > 0) amt *= CFG.debuff.wound.mul;
    t.hwT = (t.hwT || 0); if (S.t - t.hwT >= 1) { t.hwT = S.t; t.hw = 0; }
    const room = Math.max(0, t.max * CFG.balance.healCap - (t.hw || 0)); amt = Math.min(amt, room, t.max - t.hp);
    if (amt > 0) { t.hp += amt; t.hw = (t.hw || 0) + amt; if (S.captureEvents && t.team === 'u') numNote(S, t, amt, 'h'); }
    return amt;
  }
  function nearestBoth(S, x, y, range) {
    const a = nearest(S.gE, x, y, range), b = nearest(S.gA, x, y, range);
    if (!b) return a; if (!a) return b;
    return Math.hypot(a.x - x, a.y - y) <= Math.hypot(b.x - x, b.y - y) ? a : b;
  }
  function nearestUnit(S, x, y, range) {
    let best = null, bd = range;
    for (const u of S.units) { if (u.dead) continue; const d = Math.hypot(u.x - x, u.y - y); if (d < bd) { bd = d; best = u; } }
    return best;
  }
  function updatePriest(S, u, dt) {
    u.cd -= dt; if (S.jobMods.priest.smite) priestSmite(S, u, dt);
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
        applyHeal(S, t, amt); u.cd = u.healRate / spm; u.swing = 0.35; u.aim = Math.atan2(t.y - u.y, t.x - u.x);
        if (S.jobMods.priest.ward) t.ward = Math.min(t.max * 0.3, (t.ward || 0) + amt * S.jobMods.priest.ward); // 수호사제: 치유 + 보호막
        emit(S, { type: 'heal', x: u.x, y: u.y, tx: t.x, ty: t.y, job: u.job });
        if (S.perks.aoeHeal) {
          for (const a of S.units) if (!a.dead && !a.undead && a !== t && Math.hypot(a.x - t.x, a.y - t.y) <= 42) { applyHeal(S, a, amt * 0.35 * S.perks.aoeHeal); emit(S, { type: 'heal', x: t.x, y: t.y, tx: a.x, ty: a.y, aoe: true }); }
        }
      }
    }
  }
  function priestSmite(S, u, dt) { // 전투사제: 성스러운 구체로 가까운 적을 공격
    u.sc = (u.sc || 0) - dt; if (u.sc > 0) return;
    const t = nearest(S.gE, u.x, u.y, 170); if (!t) return;
    u.sc = 1.25; u.swing = 0.3; u.aim = Math.atan2(t.y - u.y, t.x - u.x);
    fire(S, u, t, u.heal * 1.15 * (1 + (u.aura ? S.aura.atk : 0)), CFG.arrowSpeed * 0.85, 'h');
  }
  function castHeroSkill(S, u, atk) {
    const sk = CFG.heroSkill[u.type];
    if (sk.kind === 'dash') { // 돌진: 가장 가까운 적을 향해 일직선으로 달려가며 길 위의 적을 모두 벤다
      const t = nearest(S.gE, u.x, u.y, sk.r * 0.9); if (!t) return;
      const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1;
      u.dash = { dx: dx / d, dy: dy / d, left: Math.min(sk.dist, d + 60), hit: new Set(), atk };
      emit(S, { type: 'heroSkill', kind: u.type, x: u.x, y: u.y, r: 60 }); u.swing = 0.4; return;
    }
    if (sk.kind === 'rain') { // 화살비: 가까운 적 위에 지대를 만든다
      const t = nearest(S.gE, u.x, u.y, sk.r * 0.9); if (!t) return;
      S.rain.push({ x: t.x, y: t.y, r: sk.rad, t: sk.dur, tick: 0.15, mul: sk.mul, atk, every: sk.every });
      emit(S, { type: 'rainZone', x: t.x, y: t.y, r: sk.rad, dur: sk.dur }); u.swing = 0.4; return;
    }
    if (sk.n) {
      const seen = new Set(), list = [];
      for (let i = 0; i < sk.n; i++) { const a = nearestExcl(S.gE, u.x, u.y, sk.r, seen), b = nearestExcl(S.gA, u.x, u.y, sk.r, seen), t = !b ? a : !a ? b : (Math.hypot(a.x - u.x, a.y - u.y) <= Math.hypot(b.x - u.x, b.y - u.y) ? a : b); if (!t) break; seen.add(t); list.push(t); }
      for (const t of list) { damage(S, t, atk * sk.mul * (t.rres || 1)); emit(S, { type: 'heroSkill', kind: u.type, x: u.x, y: u.y, tx: t.x, ty: t.y }); }
    } else {
      eachNear(S.gE, u.x, u.y, sk.r, o => { damage(S, o, atk * sk.mul * (o.mres || 1)); if (sk.slow) o.slowT = sk.slow; });
      emit(S, { type: 'heroSkill', kind: u.type, x: u.x, y: u.y, r: sk.r });
    }
    u.swing = 0.4;
  }
  function updateFighter(S, u, dt) {
    u.cd -= dt;
    const melee = u.range < 60;
    const spm = 1 + (u.aura ? S.aura.spd : 0);
    const bz = S.jobMods[lineOf(u.type)] ? S.jobMods[lineOf(u.type)].berserk : 0; // 버서커: 체력이 낮을수록 강해진다
    const atk = u.atk * (1 + (u.aura ? S.aura.atk : 0)) * (u.weakT > 0 ? CFG.debuff.weak.mul : 1) * (bz ? 1 + bz * (1 - Math.max(0, u.hp) / u.max) : 1);
    const fromCore = Math.hypot(u.x - CX, u.y - CY);
    if (u.dash) { // (돌진 중) 빠르게 직진하며 닿는 적을 한 번씩 벤다
      const dsh = u.dash, sk = CFG.heroSkill[u.type], step = Math.min(sk.spd * dt, dsh.left);
      u.x += dsh.dx * step; u.y += dsh.dy * step; dsh.left -= step; u.swing = 0.2;
      eachNear(S.gE, u.x, u.y, u.r + sk.w, o => { if (dsh.hit.has(o)) return; dsh.hit.add(o); damage(S, o, dsh.atk * sk.mul * (o.mres || 1)); });
      emit(S, { type: 'dashTrail', x: u.x, y: u.y });
      if (dsh.left <= 0.01) { u.dash = null; emit(S, { type: 'heroSkill', kind: u.type, x: u.x, y: u.y, r: 60 }); }
      return;
    }
    const hs = CFG.heroSkill[u.type];
    if (hs) { u.skT = (u.skT === undefined ? hs.cd * 0.5 : u.skT) - dt; if (u.skT <= 0 && (hs.n ? nearestBoth(S, u.x, u.y, hs.r * 0.9) : nearest(S.gE, u.x, u.y, hs.r * 0.9))) { u.skT = hs.cd; castHeroSkill(S, u, atk); } }
    const cfg = CFG.units[u.type], aggro = cfg.aggro;
    const rush = (lineOf(u.type) === 'sword' && S.perks.charge) ? 1 + V().charge * S.perks.charge : 1;
    const stopFor = tgt => (melee ? u.range + u.r + tgt.r - 2 : u.range * 0.85 + tgt.r);
    // 목표 선택: 내 위치에서 가까운 적과 '원래 자리(홈)' 근처의 적 중, 둘을 합친 거리가 짧은 쪽을 쫓는다 → 한쪽 입구로 우르르 몰리지 않고 각자 맡은 방향도 지킨다
    const find = (x, y) => (melee ? nearest(S.gE, x, y, aggro) : nearestBoth(S, x, y, aggro));
    let tgt = find(u.x, u.y);
    { const th = find(u.hx, u.hy); if (th && th !== tgt) { const sc = e => Math.hypot(e.x - u.x, e.y - u.y) + CFG.ai.homeBias * Math.hypot(e.x - u.hx, e.y - u.hy); if (!tgt || sc(th) < sc(tgt)) tgt = th; } }
    const free = S.mode === 'free';
    if (u.rvT > 0) { u.rvT -= dt; if (u.rvT <= 0) u.rv = null; }
    if (free && u.rv && !u.rv.dead && u.rv.hp > 0) tgt = u.rv; // (자유 모드) 사거리 밖이어도 나를 공격한 적에게 가서 반격한다
    if (!free && tgt && Math.hypot(tgt.x - CX, tgt.y - CY) > CFG.leash) tgt = null; // (기본 모드) 성에서 너무 먼 적은 쫓지 않는다
    if (tgt && (free || fromCore <= CFG.leash + 40)) moveToward(u, tgt.x, tgt.y, dt, stopFor(tgt), spm * rush);
    else moveToward(u, u.hx, u.hy, dt, 6, spm);
    if (u.cd <= 0) {
      const t = melee ? nearest(S.gE, u.x, u.y, u.range + u.r) : nearestBoth(S, u.x, u.y, u.range + u.r);
      if (t) {
        const chargeRate = (lineOf(u.type) === 'sword' && S.perks.charge) ? 1 + V().chargeRate * S.perks.charge : 1;
        u.cd = 1 / (u.rate * spm * chargeRate); u.swing = 0.25; u.aim = Math.atan2(t.y - u.y, t.x - u.x);
        if (melee) {
          emit(S, { type: 'melee', x: u.x, y: u.y, tx: t.x, ty: t.y, job: u.job, ut: u.type });
          damage(S, t, atk * (t.mres || 1));
          if (lineOf(u.type) === 'sword' && S.rng() < (cfg.dbl !== undefined ? cfg.dbl : 0.1) + S.jobMods.sword.dbl) { // 일정 확률로 한 번 더 벤다
            const t2 = t.dead ? nearest(S.gE, u.x, u.y, u.range + u.r) : t; emit(S, { type: 'melee', x: u.x, y: u.y, tx: (t2 || t).x, ty: (t2 || t).y, job: u.job, ut: u.type, dbl: true }); if (t2) damage(S, t2, atk * (t2.mres || 1)); u.cd *= 0.5;
          }
          const cl = S.jobMods[lineOf(u.type)] ? S.jobMods[lineOf(u.type)].cleave : 0; // 검성: 주변 적에게 베기 피해
          if (cl) eachNear(S.gE, t.x, t.y, 46, o => { if (o !== t) damage(S, o, atk * cl); });
        } else {
          const line = lineOf(u.type), pc = (line === 'archer' ? pierceCount(S) : 0) + (CFG.units[u.type].pierce | 0), jma = S.jobMods[line] || {}, arrow = (pc > 0 || jma.splash || jma.mark) ? Object.assign(pc > 0 ? { pierce: true, pc } : {}, jma.splash ? { splash: jma.splash } : {}, jma.mark ? { mark: jma.mark } : {}) : null;
          const cc = line === 'archer' ? V().crit * S.perks.crit + S.jobMods.archer.crit : 0;
          let dm = atk, isCrit = false; if (cc > 0 && S.rng() < cc) { dm *= V().critMul; isCrit = true; emit(S, { type: 'crit', x: t.x, y: t.y }); }
          fire(S, u, t, dm, CFG.arrowSpeed, 'a', isCrit ? Object.assign({ crit: true }, arrow) : arrow);
        }
      }
    }
  }
  // 설치형 유닛(포탑·발리스타): 제자리에서 사거리 안의 적을 쏜다
  function updateStatic(S, u, dt) {
    u.cd -= dt;
    if (u.cd > 0) return;
    const cfg = CFG.units[u.type], t = nearestBoth(S, u.x, u.y, u.range);
    if (!t) return;
    u.cd = 1 / (u.rate * (1 + (u.aura ? S.aura.spd : 0))); u.swing = 0.2; u.aim = Math.atan2(t.y - u.y, t.x - u.x);
    const dmg = u.atk * (1 + (u.aura ? S.aura.atk : 0)) * (u.weakT > 0 ? CFG.debuff.weak.mul : 1);
    if (cfg.shot === 'b') fire(S, u, t, dmg, CFG.arrowSpeed + 120, 'b', { pierce: true, pc: (cfg.pierce | 0) + pierceCount(S) }); // 발리스타: 큰 화살이 적을 꿰뚫는다
    else fire(S, u, t, dmg, CFG.arrowSpeed + 60, 't');
  }

  // ───────────── 적 AI ─────────────
  // 보스 고유 패턴: 돌진 / 소환 / 포격 / 방어막 / 분노. 속도·공격 배율은 e.speedMul 등에 반영된다.
  function bossTick(S, e, dt) {
    const A = e.abil;
    e.speedMul = 1; e.rateMul = 1; e.dmgMul = 1;
    e.life = (e.life || 0) + dt; const B = CFG.balance;
    e.grow = Math.min(B.bossGrowMax, 1 + B.bossGrow * Math.max(0, e.life - B.bossGrowDelay)); // 시간이 지날수록 기본 공격이 강해진다
    e.dmgMul = e.grow;
    if (A.rage && e.hp <= e.max * A.rage.at) {
      if (!e.enraged) { e.enraged = true; emit(S, { type: 'bossRage', name: e.bossName, x: e.x, y: e.y }); }
      e.speedMul *= A.rage.speed; e.rateMul = A.rage.rate; e.dmgMul *= A.rage.dmg;
    }
    if (A.rush && !e.rushDone) { // 등장하자마자 성 한복판으로 돌진, 도착하면 충격파로 주변 아군을 기절시킨다
      e.speedMul *= A.rush.mul;
      if (Math.hypot(e.x - CX, e.y - CY) <= A.rush.until || e.life > 7) {
        e.rushDone = true;
        for (const u of S.units) if (!u.dead && Math.hypot(u.x - e.x, u.y - e.y) <= A.rush.r + u.r) u.stunT = Math.max(u.stunT || 0, A.rush.stun);
        emit(S, { type: 'bossShock', x: e.x, y: e.y, r: A.rush.r });
      }
    }
    if (A.blink) { // 순간이동: 성을 기준으로 지금 있는 곳의 반대편 쪽으로 옮겨 간다
      e.t.blink -= dt;
      if (e.t.blink <= 0 && e.life > 2) {
        e.t.blink = A.blink.cd; const x0 = e.x, y0 = e.y, cur = Math.atan2(e.y - CY, e.x - CX), dc = Math.hypot(e.x - CX, e.y - CY);
        // 지금 있는 곳과 비슷한 거리의 옆자리로만 옮겨 간다 (너무 멀리 날아가지 않도록 이동 거리를 BLINK_MAX 이하로 제한)
        const d = clamp(dc + (S.rng() - 0.5) * 120, 160, Math.max(A.blink.maxR, dc)), maxArc = 2 * Math.asin(Math.min(1, BLINK_MAX / (2 * d))), arc = Math.min(maxArc, 0.7 + S.rng() * 0.6), ang = cur + (S.rng() < 0.5 ? -arc : arc);
        e.x = clamp(CX + Math.cos(ang) * d, 30, W - 30); e.y = clamp(CY + Math.sin(ang) * d, 30, H - 30);
        if (e.t.summon !== undefined) e.t.summon = Math.min(e.t.summon, 1.2); // 도착하자마자 졸개 소환
        emit(S, { type: 'bossBlink', x0, y0, x1: e.x, y1: e.y });
      }
    }
    if (A.leap) { // 도약: 아군이 가장 밀집한 곳을 향해 날아올라 내려찍는다
      if (e.leapT > 0) {
        e.leapT -= dt; e.speedMul = 0; const k = Math.min(1, dt / Math.max(0.03, e.leapT + dt)); e.x += (e.leapX - e.x) * k; e.y += (e.leapY - e.y) * k;
        if (e.leapT <= 0) {
          for (const u of S.units) if (!u.dead && Math.hypot(u.x - e.x, u.y - e.y) <= A.leap.r + u.r) { damage(S, u, e.dmg * e.dmgMul * A.leap.mul, false, e); u.stunT = Math.max(u.stunT || 0, 0.8); }
          emit(S, { type: 'bossShock', x: e.x, y: e.y, r: A.leap.r });
        }
      } else {
        e.t.leap -= dt;
        if (e.t.leap <= 0) {
          let best = null, bn = -1;
          for (const u of S.units) { if (u.dead || Math.hypot(u.x - e.x, u.y - e.y) > 650) continue; let n = 0; for (const o of S.units) if (!o.dead && Math.hypot(o.x - u.x, o.y - u.y) <= A.leap.r) n++; if (n > bn) { bn = n; best = u; } }
          if (!best) e.t.leap = 1.5;
          else { e.t.leap = A.leap.cd; e.leapT = A.leap.air; e.leapX = best.x; e.leapY = best.y; emit(S, { type: 'bossLeap', x: best.x, y: best.y, r: A.leap.r, air: A.leap.air, fx: e.x, fy: e.y }); }
        }
      }
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
      // 보스가 성 가까이(summonRange) 왔을 때만 소환 시간을 센다 → 화면에 보이는 곳에서 소환한다
      if (Math.hypot(e.x - CX, e.y - CY) <= CFG.balance.summonRange) e.t.summon -= dt;
      if (e.t.summon <= 0 && S.enemies.length >= 220) e.t.summon = 2; // 화면에 적이 너무 많으면 소환을 잠시 미룬다 (렉·멈춤 방지)
      if (e.t.summon <= 0) {
        e.t.summon = A.summon.cd;
        const toCore = Math.atan2(CY - e.y, CX - e.x); // 졸개는 보스 앞(성 방향)에 나온다
        const r = S.round, cnt = Math.min(Math.round(A.summon.n * clamp(1 + 0.035 * (r - 5), 1, 3.2)), 18), pUp = clamp((r - 15) / 45, 0, 0.75), nu = SUMMON_UP[A.summon.kind]; // 라운드가 지날수록 더 많이, 더 강한 졸개가 나온다
        for (let i = 0; i < cnt; i++) { const a = toCore + (S.rng() - 0.5) * 1.9, d = 75 + S.rng() * 55, kind = nu && S.rng() < pUp ? nu : A.summon.kind; spawnEnemy(S, kind, clamp(e.x + Math.cos(a) * d, 20, W - 20), clamp(e.y + Math.sin(a) * d, 20, H - 20)); }
        emit(S, { type: 'bossSummon', x: e.x, y: e.y, n: cnt, kind: A.summon.kind });
      }
    }
    if (A.debuff) {
      const near = Math.hypot(e.x - CX, e.y - CY) <= CFG.balance.summonRange + 120;
      A.debuff.forEach((d, i) => {
        const key = 'db' + i; if (e.t[key] === undefined) e.t[key] = d.cd * 0.7 + i * 2.5;
        if (near) e.t[key] -= dt;
        if (e.t[key] <= 0) { // 가까운 아군 한 명을 중심으로 광역 상태이상을 예고하고, 잠시 뒤 터뜨린다
          const tg = nearestUnit(S, e.x, e.y, 520);
          if (!tg) { e.t[key] = 1.5; return; }
          e.t[key] = d.cd; const warn = CFG.debuff.warn;
          S.zones.push({ x: tg.x, y: tg.y, r: d.r, t: warn, kind: d.kind });
          emit(S, { type: 'bossCast', x: tg.x, y: tg.y, r: d.r, kind: d.kind, warn, bx: e.x, by: e.y });
        }
      });
    }
    if (A.artillery) {
      e.t.artillery -= dt;
      if (e.t.artillery <= 0) {
        e.t.artillery = A.artillery.cd;
        const near = S.units.filter(u => !u.dead && Math.hypot(u.x - e.x, u.y - e.y) <= 900);
        for (let i = 0; i < A.artillery.count; i++) {
          const tg = near.length ? near[Math.floor(S.rng() * near.length)] : S.core;
          const gt = { x: tg.x + (S.rng() - 0.5) * 40, y: tg.y + (S.rng() - 0.5) * 40, r: 0 }; // 떨어질 지점 (미리 표시된다)
          fire(S, e, gt, A.artillery.dmg * CFG.balance.enemyDmg * e.dmgMul, 0, 'es', { T: A.artillery.flight, aoe: A.artillery.radius });
        }
        e.swing = 0.4;
      }
    }
  }
  function explode(S, e) {
    const R = e.blast;
    for (const u of S.units) if (!u.dead && Math.hypot(u.x - e.x, u.y - e.y) <= R + u.r) damage(S, u, e.dmg, false, e);
    if (Math.hypot(S.core.x - e.x, S.core.y - e.y) <= R + S.core.r) hitCore(S, e.dmg, '폭파병');
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
        for (const a of hurt.slice(0, 2)) { a.hp = Math.min(a.max, a.hp + a.max * e.healPct); emit(S, { type: 'heal', x: e.x, y: e.y, tx: a.x, ty: a.y, enemy: true }); }
        e.cd = e.healRate; e.swing = 0.35; e.aim = Math.atan2(hurt[0].y - e.y, hurt[0].x - e.x);
      } else e.cd = 0.4;
    }
  }
  function updateEnemy(S, e, dt) {
    e.cd -= dt; e.age += dt;
    if (e.frozenT > 0) { e.frozenT -= dt; return; } // 절대영도: 얼어붙음
    const boost = enrageMul(e.age);
    if (e.age > ENRAGE_AFTER && !e.enr) { e.enr = true; if (S.enrageSaid !== S.round) { S.enrageSaid = S.round; emit(S, { type: 'enrage' }); } }
    if (e.abil) bossTick(S, e, dt);
    if (e.kind === 'shaman') return updateShaman(S, e, dt);
    if (e.slowT > 0) e.slowT -= dt;
    const c = S.core, spm = e.speedMul * (e.slowT > 0 ? 0.45 : 1) * (boost > 1 ? Math.min(1.5, 1 + (boost - 1) * 0.2) : 1), dmg = e.dmg * boost * e.dmgMul, cdTime = 1 / (e.rate * e.rateMul || 1);
    const tgt = nearest(S.gU, e.x, e.y, e.aggro);
    if (e.leapT > 0) return; // 도약 중
    if (e.abil && e.abil.siege && !(tgt && Math.hypot(tgt.x - e.x, tgt.y - e.y) < 110)) { moveToward(e, c.x, c.y, dt, e.abil.siege.dist, spm); return; } // 멀리서 포격만 하는 보스
    if (e.ranged) { // 사수: 사거리 끝에서 멈춰 포물선 화살을 쏜다
      const t = tgt || c, d = Math.hypot(t.x - e.x, t.y - e.y) - t.r - e.r;
      if (d > e.range * 0.9) moveToward(e, t.x, t.y, dt, e.range * 0.9 + t.r + e.r, spm);
      if (e.cd <= 0 && d <= e.range) { e.cd = cdTime; e.swing = 0.25; e.aim = Math.atan2(t.y - e.y, t.x - e.x); fire(S, e, t, dmg, CFG.enemyArrowSpeed, 'ea'); }
      return;
    }
    const t = tgt || c;
    const far = e.rush && Math.hypot(t.x - e.x, t.y - e.y) > 110;
    moveToward(e, t.x, t.y, dt, e.blast ? e.r + t.r - 4 : e.range + e.r + t.r - 2, far ? spm * e.rush : spm); // 폭파병은 닿을 때까지 접근
    const reach = Math.hypot(t.x - e.x, t.y - e.y) - t.r - e.r;
    if (e.blast) { if (reach <= 6) explode(S, e); return; } // 폭파병: 닿으면 터진다
    if (e.cd <= 0 && reach <= e.range + 2) {
      e.cd = cdTime; e.swing = 0.25; e.aim = Math.atan2(t.y - e.y, t.x - e.x);
      if (t === c) { hitCore(S, dmg, e.kind === 'boss' ? '보스 근접' : '근접(' + (CFG.enemies[e.kind] ? CFG.enemies[e.kind].name : e.kind) + ')'); if (S.perks.thorn) damage(S, e, dmg * V().thorn * S.perks.thorn); }
      else {
        damage(S, t, dmg, false, e); if (e.poison && !t.dead) t.poisonT = Math.max(t.poisonT || 0, e.poison);
        if (e.kind === 'boss') { // 보스의 기본 공격은 범위 공격: 맞은 대상 주변의 아군도 함께 피해
          const R = CFG.balance.bossSplashR + e.r * 0.5; eachNear(S.gU, t.x, t.y, R, o => { if (o !== t) damage(S, o, dmg * CFG.balance.bossSplash, false, e); });
          emit(S, { type: 'bossSlam', x: t.x, y: t.y, r: R });
        } else if (e.elite) emit(S, { type: 'emelee', x: e.x, y: e.y, tx: t.x, ty: t.y });
      }
    }
  }

  // ───────────── 한 틱 진행 ─────────────
  function tick(S, dt) {
    if (S.over) return;
    if (S.dev && S.gold < 1e8) S.gold = DEV_GOLD; // 개발자 모드: 골드 무한
    if (S.bossDeath) { stepBossDeath(S, dt); return; } // 보스 사망·부활 연출 중에는 시간이 멈춘다
    checkCastleChoice(S);
    if (S.cards.offer || S.jobs.offer || S.cOffer || S.cinematic) return; // 카드/전직/성 선택, 연출 중에는 시간이 멈춘다
    S.t += dt;
    for (const k in S.buyCd) if (S.buyCd[k] > 0) S.buyCd[k] -= dt;
    updateProd(S, dt);

    // 라운드 진행
    if (S.phase === 'prep') { S.prepT -= dt; if (S.prepT <= 0) startRound(S); }
    else {
      S.roundT += dt;
      if (S.queue.length) {
        S.spawnT -= dt;
        while (S.spawnT <= 0 && S.queue.length) { spawnEnemy(S, S.queue.shift()); S.spawnT += S.spawnGap; }
      }
      const gate = S.round === ACT1_END && S.act === 1; // 30라운드는 보스를 처치해야(2막 연출) 다음 라운드로 넘어간다
      // 라운드는 적을 모두 처치하거나 보스를 처치해야 끝난다 (공중형이 남아 있어도 마찬가지)
      if (!gate && !S.hold && S.roundT >= 1 && !S.queue.length && !S.enemies.some(e => !e.dead)) startRound(S);
      if (S.cards.offer) return; // 방금 새 라운드가 열리며 카드창이 떴다
    }

    // 격자 갱신 + 오라 판정 + 소환수 수명
    S.gU.map.clear(); S.gE.map.clear(); S.gA.map.clear();
    const A = S.aura;
    for (const u of S.units) {
      if (u.dead) continue;
      u.aura = A.on && Math.hypot(u.x - CX, u.y - CY) <= A.r ? 1 : 0;
      if (u.aura && A.heal > 0 && !u.undead && u.hp < u.max) u.hp = Math.min(u.max, u.hp + u.max * A.heal * dt);
      gridAdd(S.gU, u);
    }
    for (const e of S.enemies) if (!e.dead) gridAdd(e.air ? S.gA : S.gE, e); // 공중형은 따로: 근접·성·범위 공격은 닿지 않고 궁수 계열·포탑만 겨눈다

    // 위협 방향 (성에서 가장 가까운 적 쪽, 부드럽게 회전)
    let near = null, nd = 1500;
    for (const e of S.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - CX, e.y - CY); if (d < nd) { nd = d; near = e; } }
    if (near) S.threat += wrapAngle(Math.atan2(near.y - CY, near.x - CX) - S.threat) * Math.min(1, 2 * dt);

    // 성 공격 + 대형 포탄
    const c = S.core; c.cd -= dt; c.flash = Math.max(0, c.flash - dt); c.swing = Math.max(0, c.swing - dt);
    if (c.cd <= 0) {
      const t = nearest(S.gE, c.x, c.y, c.range);
      if (t) {
        c.cd = 1 / c.rate; c.swing = 0.22; c.aim = Math.atan2(t.y - c.y, t.x - c.x); fire(S, c, t, c.atk, CFG.shellSpeed, 'c');
        if (c.cannons > 1) { const seen = new Set([t]); for (let i = 1; i < c.cannons; i++) { const t2 = nearestExcl(S.gE, c.x, c.y, c.range, seen) || t; seen.add(t2); fire(S, c, t2, c.atk, CFG.shellSpeed, 'c'); } } // 대포가 여러 문이면 서로 다른 적을 겨눈다
      }
    }
    if (S.perks.bomb) { S.bombCd -= dt; if (S.bombCd <= 0) bigBomb(S); }
    castleSkillTick(S, dt);

    // 유닛: 대기 자리는 사방에 퍼지되 적이 오는 쪽으로 약간 쏠린다
    // 경계 상태에 따라 쏠림을 부드럽게 바꾼다
    S.biasNow += ((nd < CFG.ai.alertRange ? CFG.ai.biasAlert : CFG.ai.bias) - S.biasNow) * Math.min(1, 1.5 * dt);
    const bias = S.biasNow;
    for (const u of S.units) {
      if (u.dead) continue;
      u.flash = Math.max(0, u.flash - dt); u.swing = Math.max(0, u.swing - dt); if (u.wardFx > 0) u.wardFx -= dt;
      if (u.undead && (u.ttl -= dt) <= 0) { u.dead = true; emit(S, { type: 'undeadFade', x: u.x, y: u.y }); continue; }
      if (u.stunT > 0 || u.poisonT > 0 || u.weakT > 0 || u.woundT > 0) {
        if (u.poisonT > 0) { u.poisonT -= dt; u.hp = Math.max(1, u.hp - u.max * CFG.debuff.poison.pct * dt); }
        if (u.weakT > 0) u.weakT -= dt; if (u.woundT > 0) u.woundT -= dt;
        if (u.stunT > 0) { u.stunT -= dt; continue; } // 기절: 이동도 공격도 못 한다
      }
      if (CFG.units[u.type].static) { updateStatic(S, u, dt); continue; }
      const jm = S.jobMods[lineOf(u.type)];
      if (jm && jm.regen && u.hp < u.max) u.hp = Math.min(u.max, u.hp + u.max * jm.regen * dt);
      const a = S.threat + wrapAngle(u.ha - S.threat) * (1 - bias);
      u.hx = CX + Math.cos(a) * u.hr + Math.sin(S.t * 0.6 + u.id * 1.7) * CFG.ai.sway; u.hy = CY + Math.sin(a) * u.hr + Math.cos(S.t * 0.5 + u.id * 2.3) * CFG.ai.sway;
      if (u.type === 'priest') updatePriest(S, u, dt); else updateFighter(S, u, dt);
      u.x = clamp(u.x, 10, W - 10); u.y = clamp(u.y, 10, H - 10);
      // 성 원형에는 들어올 수 없다: 반지름 안이면 바깥으로 밀어낸다 (유닛당 거리 계산 한 번이라 매우 싸다)
      const bx = u.x - CX, by = u.y - CY, bd = Math.hypot(bx, by), bmin = CFG.core.blockR + u.r * 0.6;
      if (bd < bmin) { if (bd < 1) { u.x = CX + bmin; } else { u.x = CX + bx / bd * bmin; u.y = CY + by / bd * bmin; } }
    }
    // 보스 상태이상 구역: 예고 시간이 지나면 범위 안의 아군에게 걸린다
    for (let i = S.zones.length - 1; i >= 0; i--) {
      const z = S.zones[i]; z.t -= dt; if (z.t > 0) continue;
      const D = CFG.debuff, dd = D[z.kind]; let hit = 0;
      for (const u of S.units) {
        if (u.dead || Math.hypot(u.x - z.x, u.y - z.y) > z.r + u.r) continue; hit++;
        if (z.kind === 'stun') u.stunT = Math.max(u.stunT || 0, dd.dur); else if (z.kind === 'poison') u.poisonT = Math.max(u.poisonT || 0, dd.dur);
        else if (z.kind === 'weak') u.weakT = Math.max(u.weakT || 0, dd.dur); else if (z.kind === 'wound') u.woundT = Math.max(u.woundT || 0, dd.dur);
      }
      emit(S, { type: 'debuffHit', x: z.x, y: z.y, r: z.r, kind: z.kind, hit }); S.zones.splice(i, 1);
      if (z.kind === 'poison') { S.pools.push({ x: z.x, y: z.y, r: z.r, t: dd.pool }); emit(S, { type: 'poisonPool', x: z.x, y: z.y, r: z.r, dur: dd.pool }); } // 독 웅덩이: 일정 시간 계속 중독
    }
    for (let i = S.rain.length - 1; i >= 0; i--) { // 화살비 지대: 남아 있는 동안 일정 간격으로 범위 안의 적을 맞힌다
      const rn = S.rain[i]; rn.t -= dt; if (rn.t <= 0) { S.rain.splice(i, 1); continue; }
      rn.tick -= dt; if (rn.tick <= 0) { rn.tick += rn.every; eachNear(S.gE, rn.x, rn.y, rn.r, o => damage(S, o, rn.atk * rn.mul * (rn.fire ? 1 : (o.rres || 1)))); emit(S, { type: rn.fire ? 'fireTick' : 'rainTick', x: rn.x, y: rn.y, r: rn.r }); }
    }
    for (let i = S.pools.length - 1; i >= 0; i--) {
      const pl = S.pools[i]; pl.t -= dt; if (pl.t <= 0) { S.pools.splice(i, 1); continue; }
      for (const u of S.units) if (!u.dead && Math.hypot(u.x - pl.x, u.y - pl.y) <= pl.r + u.r * 0.5) u.poisonT = Math.max(u.poisonT || 0, 1.5);
    }
    for (const e of S.enemies) { if (e.dead) continue; if (e.markT > 0) e.markT -= dt; e.flash = Math.max(0, e.flash - dt); e.swing = Math.max(0, e.swing - dt); updateEnemy(S, e, dt); }
    separate(S.units, S.gU); separate(S.enemies, S.gE);

    // 투사체 (포물선)
    for (let i = S.shots.length - 1; i >= 0; i--) {
      const s = S.shots[i];
      if (s.t.dead) { s.t = null; S.shotPool.push(s); S.shots.splice(i, 1); continue; }
      s.p += dt / s.T;
      const p = Math.min(1, s.p), tx = s.t.x, ty = s.t.y;
      s.x = s.sx + (tx - s.sx) * p; s.y = s.sy + (ty - s.sy) * p;
      s.h = 4 * s.H * p * (1 - p) + s.h0 * (1 - p); // 포구 높이에서 출발해 포물선을 그리며 지면 목표에 떨어진다
      s.vx = (tx - s.sx) / s.T; s.vy = (ty - s.sy) / s.T; s.vh = (4 * s.H * (1 - 2 * p) - s.h0) / s.T; // 화면에서 화살 방향을 그리기 위한 속도
      if (s.p >= 1) { resolveShot(S, s); s.t = null; S.shotPool.push(s); S.shots.splice(i, 1); }
    }

    if (S.captureEvents) flushNums(S);
    // 정리
    if (S.units.some(u => u.dead)) S.units = S.units.filter(u => !u.dead);
    if (S.enemies.some(e => e.dead)) S.enemies = S.enemies.filter(e => !e.dead);
  }

  return {
    CFG, MAX_ROUND, ACT1_END, extraAngles, EXTRA_RING, ROUND_TIME, SPAWN_TIME, PREP_TIME, SPAWN_RING, UNIT_TYPES, CARD_DEFS,
    createGame, tick, buy, devSetup, coreGuard, hitCore, pickCastle, autoCastle, castleOptions, describeCastle, jobBack, classOptions, enqueue, cancelProd, goldBound, checkRun, upgradeCastle, castleCost, popCap, popGain, popCount, specialCount, endCinematic, jumpToRound, spawnAngles, pickJob, describeJobs, jobOptions, spawnEnemy, bossInfo, drainEvents, pickCard, reroll, describeTaken, openCards,
    unitCostOf, enemyCount, hpMul, dmgMul, mulberry32, damage,
  };
});
