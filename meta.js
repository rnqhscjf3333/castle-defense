// 이 브라우저에 쌓이는 기록: 판별 기록(통계) · 도감 · 업적. 서버와 무관하게 localStorage에만 저장한다.
(function () {
  'use strict';
  const KEY = 'cd-meta';
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const blank = () => ({ v: 1, games: [], codex: { units: {}, enemies: {}, bosses: {} }, tot: { kills: 0, spent: 0, earned: 0, games: 0, wins: 0, bossKills: 0, time: 0 }, best: { round: 0, pop: 0, castle: 1, hold: 0, free: 0, normal: 0 }, ach: {} });
  let M = blank();
  try { const j = JSON.parse(ls.get(KEY) || 'null'); if (j && j.v === 1) M = Object.assign(blank(), j, { codex: Object.assign(blank().codex, j.codex), tot: Object.assign(blank().tot, j.tot), best: Object.assign(blank().best, j.best) }); } catch (e) {}
  const save = () => ls.set(KEY, JSON.stringify(M));

  // 업적: val(M, C) 이 goal 이상이면 달성
  const nUnits = () => Object.keys(M.codex.units).length, nEn = () => Object.keys(M.codex.enemies).length + Object.keys(M.codex.bosses).length;
  const ACH = [
    { id: 'k1', name: '첫 사냥', desc: '몬스터 100마리 처치', goal: 100, val: () => M.tot.kills },
    { id: 'k2', name: '사냥꾼', desc: '몬스터 1,000마리 처치', goal: 1000, val: () => M.tot.kills },
    { id: 'k3', name: '학살자', desc: '몬스터 5,000마리 처치', goal: 5000, val: () => M.tot.kills },
    { id: 'k4', name: '전장의 악몽', desc: '몬스터 20,000마리 처치', goal: 20000, val: () => M.tot.kills },
    { id: 'g1', name: '짠돌이 졸업', desc: '골드 1,000 사용', goal: 1000, val: () => M.tot.spent },
    { id: 'g2', name: '큰손', desc: '골드 10,000 사용', goal: 10000, val: () => M.tot.spent },
    { id: 'g3', name: '재벌', desc: '골드 50,000 사용', goal: 50000, val: () => M.tot.spent },
    { id: 'g4', name: '성을 사들인 자', desc: '골드 200,000 사용', goal: 200000, val: () => M.tot.spent },
    { id: 'r1', name: '풋내기 수비대', desc: '10라운드 도달', goal: 10, val: () => M.best.round },
    { id: 'r2', name: '노련한 수비대', desc: '20라운드 도달', goal: 20, val: () => M.best.round },
    { id: 'r3', name: '1막의 끝', desc: '30라운드 도달', goal: 30, val: () => M.best.round },
    { id: 'r4', name: '마왕의 문턱', desc: '50라운드 도달', goal: 50, val: () => M.best.round },
    { id: 'r5', name: '끝나지 않는 밤', desc: '60라운드 도달', goal: 60, val: () => M.best.round },
    { id: 'r6', name: '전설의 수문장', desc: '70라운드 도달', goal: 70, val: () => M.best.round },
    { id: 'w1', name: '마왕 토벌', desc: '마왕을 처치해 50라운드 클리어', goal: 1, val: () => M.tot.wins },
    { id: 'b1', name: '보스 사냥꾼', desc: '보스 10마리 처치', goal: 10, val: () => M.tot.bossKills },
    { id: 'b2', name: '보스 학살자', desc: '보스 50마리 처치', goal: 50, val: () => M.tot.bossKills },
    { id: 'p1', name: '군대의 시작', desc: '유닛 20명을 동시에 보유', goal: 20, val: () => M.best.pop },
    { id: 'p2', name: '대군', desc: '유닛 50명을 동시에 보유', goal: 50, val: () => M.best.pop },
    { id: 'c1', name: '난공불락', desc: '성을 최대 레벨까지 강화', goal: 8, val: () => M.best.castle },
    { id: 'h1', name: '붙박이 수비', desc: '수비 모드로 30라운드 도달', goal: 30, val: () => M.best.hold },
    { id: 'f1', name: '자유로운 영혼', desc: '자유 모드로 30라운드 도달', goal: 30, val: () => M.best.free },
    { id: 'n1', name: '단골', desc: '게임 20판 플레이', goal: 20, val: () => M.tot.games },
    { id: 'n2', name: '중독', desc: '게임 100판 플레이', goal: 100, val: () => M.tot.games },
    { id: 'd1', name: '병력 수집가', desc: '도감에 유닛 6종 등록', goal: 6, val: () => nUnits() },
    { id: 'd2', name: '박물학자', desc: '도감에 몬스터 15종 등록', goal: 15, val: () => nEn() },
  ];

  let run = null, onUnlock = null;
  function begin() { run = { kills: 0, spent: 0, earned: 0 }; }
  // 진행 중 게임의 집계를 합친다 (라운드가 바뀔 때·종료할 때 부른다). 새로 달성한 업적 목록을 돌려준다.
  function sync(S, C) {
    if (!run) begin(); const st = S.stats; if (!st) return [];
    for (const k in st.made) M.codex.units[k] = 1;
    for (const k in st.seenE) M.codex.enemies[k] = 1;
    for (const k in st.seenB) M.codex.bosses[k] = 1;
    M.tot.kills += S.kills - run.kills; run.kills = S.kills;
    M.tot.spent += st.spent - run.spent; run.spent = st.spent;
    M.tot.earned += st.earned - run.earned; run.earned = st.earned;
    const b = M.best, pop = C.popCount(S);
    b.round = Math.max(b.round, S.round); b.pop = Math.max(b.pop, pop); b.castle = Math.max(b.castle, S.castle.lv);
    if ((S.endless || S.win) && !run.won) { run.won = true; M.tot.wins++; }
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
    M.games.unshift({ at: Date.now(), mode: S.mode, round: S.round, win: !!S.win, kills: S.kills, time: Math.round(S.t), earned: Math.round(S.stats.earned), spent: Math.round(S.stats.spent), score: score || 0, pop: C.popCount(S), castle: S.castle.lv });
    M.games.length = Math.min(M.games.length, 100);
    run = null; check(); save();
  }
  window.Meta = { ACH, data: () => M, begin, sync, finish, onUnlock: f => { onUnlock = f; }, reset() { M = blank(); save(); } };
})();
