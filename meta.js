// 이 브라우저에 쌓이는 기록: 판별 기록(통계) · 도감 · 업적. 서버와 무관하게 localStorage에만 저장한다.
(function () {
  'use strict';
  const KEY = 'cd-meta';
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const blank = () => ({ v: 1, games: [], codex: { units: {}, enemies: {}, bosses: {}, jobs: {}, castle: {} }, tot: { kills: 0, spent: 0, earned: 0, games: 0, wins: 0, bossKills: 0, time: 0 }, best: { round: 0, pop: 0, castle: 1, kills: 0, hold: 0, free: 0, normal: 0 }, ach: {} });
  let M = blank();
  try { const j = JSON.parse(ls.get(KEY) || 'null'); if (j && j.v === 1) M = Object.assign(blank(), j, { codex: Object.assign(blank().codex, j.codex), tot: Object.assign(blank().tot, j.tot), best: Object.assign(blank().best, j.best) }); } catch (e) {}
  const save = () => ls.set(KEY, JSON.stringify(M));

  // 업적: val(M, C) 이 goal 이상이면 달성
  const nUnits = () => Object.keys(M.codex.units).filter(k => k !== 'undead').length, nEn = () => Object.keys(M.codex.enemies).length + Object.keys(M.codex.bosses).length;
  let UNIT_ALL = 11, ENEMY_ALL = 27; try { const F = window.CastleCore.CFG; ENEMY_ALL = Object.keys(F.enemies).length - 1 + F.bossPool.length + 2 + 4; UNIT_ALL = window.CastleCore.UNIT_TYPES.length + 8; } catch (e) {}
  // 쉬운 업적부터 아주 어려운 업적까지 (모드와 무관한 기록만 센다)
  const ACH = [
    { id: 'k1', name: '첫 사냥', desc: '몬스터 100마리 처치', goal: 100, val: () => M.tot.kills },
    { id: 'k2', name: '사냥꾼', desc: '몬스터 1,000마리 처치', goal: 1000, val: () => M.tot.kills },
    { id: 'k3', name: '학살자', desc: '몬스터 5,000마리 처치', goal: 5000, val: () => M.tot.kills },
    { id: 'k4', name: '전장의 악몽', desc: '몬스터 20,000마리 처치', goal: 20000, val: () => M.tot.kills },
    { id: 'k5', name: '끝없는 사냥', desc: '몬스터 50,000마리 처치', goal: 50000, val: () => M.tot.kills },
    { id: 'k6', name: '전장의 지배자', desc: '몬스터 100,000마리 처치', goal: 100000, val: () => M.tot.kills },
    { id: 'k7', name: '죽음의 화신', desc: '몬스터 250,000마리 처치', goal: 250000, val: () => M.tot.kills },
    { id: 'k8', name: '전설의 학살자', desc: '몬스터 500,000마리 처치', goal: 500000, val: () => M.tot.kills },
    { id: 's1', name: '한 판의 학살', desc: '한 판에서 몬스터 3,000마리 처치', goal: 3000, val: () => M.best.kills || 0 },
    { id: 's2', name: '피의 전장', desc: '한 판에서 몬스터 6,000마리 처치', goal: 6000, val: () => M.best.kills || 0 },
    { id: 's3', name: '시체의 산', desc: '한 판에서 몬스터 10,000마리 처치', goal: 10000, val: () => M.best.kills || 0 },
    { id: 's4', name: '멈추지 않는 학살', desc: '한 판에서 몬스터 20,000마리 처치', goal: 20000, val: () => M.best.kills || 0 },
    { id: 'g1', name: '짠돌이 졸업', desc: '골드 1,000 사용', goal: 1000, val: () => M.tot.spent },
    { id: 'g2', name: '큰손', desc: '골드 10,000 사용', goal: 10000, val: () => M.tot.spent },
    { id: 'g3', name: '재벌', desc: '골드 50,000 사용', goal: 50000, val: () => M.tot.spent },
    { id: 'g4', name: '성을 사들인 자', desc: '골드 200,000 사용', goal: 200000, val: () => M.tot.spent },
    { id: 'g5', name: '황금의 군주', desc: '골드 500,000 사용', goal: 500000, val: () => M.tot.spent },
    { id: 'g6', name: '왕국의 재정', desc: '골드 1,000,000 사용', goal: 1000000, val: () => M.tot.spent },
    { id: 'g7', name: '전설의 재벌', desc: '골드 3,000,000 사용', goal: 3000000, val: () => M.tot.spent },
    { id: 'r1', name: '풋내기 수비대', desc: '10라운드 도달', goal: 10, val: () => M.best.round },
    { id: 'r2', name: '노련한 수비대', desc: '20라운드 도달', goal: 20, val: () => M.best.round },
    { id: 'r3', name: '1막의 끝', desc: '30라운드 도달', goal: 30, val: () => M.best.round },
    { id: 'r4', name: '마왕의 문턱', desc: '50라운드 도달', goal: 50, val: () => M.best.round },
    { id: 'r5', name: '끝나지 않는 밤', desc: '60라운드 도달', goal: 60, val: () => M.best.round },
    { id: 'r6', name: '전설의 수문장', desc: '70라운드 도달', goal: 70, val: () => M.best.round },
    { id: 'r7', name: '불굴의 방랑자', desc: '80라운드 도달', goal: 80, val: () => M.best.round },
    { id: 'r8', name: '백 번의 밤', desc: '100라운드 도달', goal: 100, val: () => M.best.round },
    { id: 'r9', name: '끝을 모르는 자', desc: '120라운드 도달', goal: 120, val: () => M.best.round },
    { id: 'r10', name: '영원의 파수꾼', desc: '150라운드 도달', goal: 150, val: () => M.best.round },
    { id: 'w1', name: '마왕 토벌', desc: '마왕을 처치해 50라운드 클리어', goal: 1, val: () => M.tot.wins },
    { id: 'w5', name: '용 사냥꾼', desc: '재앙의 용을 쓰러뜨려 게임 클리어', goal: 1, val: () => M.tot.clears || 0 },
    { id: 'w2', name: '마왕 사냥꾼', desc: '마왕 토벌 5번', goal: 5, val: () => M.tot.wins },
    { id: 'w3', name: '마왕의 천적', desc: '마왕 토벌 15번', goal: 15, val: () => M.tot.wins },
    { id: 'w4', name: '마왕 학살자', desc: '마왕 토벌 40번', goal: 40, val: () => M.tot.wins },
    { id: 'b1', name: '보스 사냥꾼', desc: '보스 10마리 처치', goal: 10, val: () => M.tot.bossKills },
    { id: 'b2', name: '보스 학살자', desc: '보스 50마리 처치', goal: 50, val: () => M.tot.bossKills },
    { id: 'b3', name: '보스 도살자', desc: '보스 150마리 처치', goal: 150, val: () => M.tot.bossKills },
    { id: 'b4', name: '보스 킬러', desc: '보스 400마리 처치', goal: 400, val: () => M.tot.bossKills },
    { id: 'b5', name: '보스의 악몽', desc: '보스 1,000마리 처치', goal: 1000, val: () => M.tot.bossKills },
    { id: 'p1', name: '군대의 시작', desc: '유닛 20명을 동시에 보유', goal: 20, val: () => M.best.pop },
    { id: 'p2', name: '대군', desc: '유닛 50명을 동시에 보유', goal: 50, val: () => M.best.pop },
    { id: 'p3', name: '거대한 군단', desc: '유닛 80명을 동시에 보유', goal: 80, val: () => M.best.pop },
    { id: 'p4', name: '끝없는 행렬', desc: '유닛 120명을 동시에 보유', goal: 120, val: () => M.best.pop },
    { id: 'c1', name: '난공불락', desc: '성을 최대 레벨까지 강화', goal: 10, val: () => M.best.castle },
    { id: 'n1', name: '단골', desc: '게임 20판 플레이', goal: 20, val: () => M.tot.games },
    { id: 'n2', name: '중독', desc: '게임 100판 플레이', goal: 100, val: () => M.tot.games },
    { id: 'n3', name: '이 구역의 수문장', desc: '게임 300판 플레이', goal: 300, val: () => M.tot.games },
    { id: 'n4', name: '성의 터줏대감', desc: '게임 700판 플레이', goal: 700, val: () => M.tot.games },
    { id: 'n5', name: '성의 주인', desc: '게임 1,500판 플레이', goal: 1500, val: () => M.tot.games },
    { id: 'd1', name: '병력 수집가', desc: '도감에 유닛 6종 등록', goal: 6, val: () => nUnits() },
    { id: 'd3', name: '전군 수집가', desc: '도감에 유닛 ' + UNIT_ALL + '종 모두 등록', goal: UNIT_ALL, val: () => nUnits() },
    { id: 'd2', name: '박물학자', desc: '도감에 몬스터 15종 등록', goal: 15, val: () => nEn() },
    { id: 'd4', name: '몬스터 박사', desc: '도감에 몬스터·보스 ' + ENEMY_ALL + '종 모두 등록', goal: ENEMY_ALL, val: () => nEn() },
  ];

  let run = null, onUnlock = null;
  function begin() { run = { kills: 0, spent: 0, earned: 0 }; }
  // 진행 중 게임의 집계를 합친다 (라운드가 바뀔 때·종료할 때 부른다). 새로 달성한 업적 목록을 돌려준다.
  function sync(S, C) {
    if (!run) begin(); const st = S.stats; if (!st) return [];
    for (const k in st.made) M.codex.units[k] = 1;
    for (const k in st.seenE) M.codex.enemies[k] = 1;
    for (const k in st.seenB) M.codex.bosses[k] = 1;
    for (const t in S.jobs) if (S.jobs[t] && S.jobs[t].ids) for (const id of S.jobs[t].ids) M.codex.jobs[id] = 1; // 실제로 전직한 직업
    for (const id of S.cnodes || []) M.codex.castle[id] = 1; // 실제로 고른 성 능력
    M.tot.kills += S.kills - run.kills; run.kills = S.kills;
    M.tot.spent += st.spent - run.spent; run.spent = st.spent;
    M.tot.earned += st.earned - run.earned; run.earned = st.earned;
    const b = M.best, pop = C.popCount(S);
    b.round = Math.max(b.round, S.round); b.kills = Math.max(b.kills || 0, S.kills); b.pop = Math.max(b.pop, pop); b.castle = Math.max(b.castle, S.castle.lv);
    if ((S.endless || S.win) && !run.won) { run.won = true; M.tot.wins++; }
    if (S.win && !run.cleared) { run.cleared = true; M.tot.clears = (M.tot.clears || 0) + 1; }
    if (S.mode in b) b[S.mode] = Math.max(b[S.mode], S.round);
    if (st.bossKills !== (run.boss || 0)) { M.tot.bossKills += st.bossKills - (run.boss || 0); run.boss = st.bossKills; }
    return check();
  }
  function check() {
    const fresh = [];
    for (const a of ACH) if (!M.ach[a.id] && a.val() >= a.goal) { M.ach[a.id] = Date.now(); fresh.push(a); }
    save(); if (fresh.length && onUnlock) onUnlock(fresh);
    return fresh;
  }
  // 한 판이 끝났을 때: 기록 한 줄을 남긴다
  function finish(S, C, score) {
    if (!run) begin();
    M.tot.games++; M.tot.time += Math.round(S.t);
    sync(S, C);
    M.games.unshift({ at: Date.now(), mode: S.mode, round: S.round, win: !!S.win, kills: S.kills, time: Math.round(S.t), earned: Math.round(S.stats.earned), spent: Math.round(S.stats.spent), score: score || 0, pop: C.popCount(S), castle: S.castle.lv, log: S.log, jobs: C.runSummary(S).jobs, cn: C.runSummary(S).cn });
    M.games.length = Math.min(M.games.length, 100); for (let i = 40; i < M.games.length; i++) delete M.games[i].log; // 자세한 기록은 최근 40판만 보관 (저장 공간)
    run = null; check(); save();
  }
  window.Meta = { ACH, data: () => M, begin, sync, finish, onUnlock: f => { onUnlock = f; }, reset() { M = blank(); save(); } };
})();
