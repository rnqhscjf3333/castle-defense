// 랭킹 + 플레이 기록 전송. 서버가 없으면(config.js의 API_URL이 비어 있으면) 이 브라우저의 개인 랭킹만 쓴다.
// 서버로 보내는 값: 점수·라운드·선택한 강화/전직·유닛 구성·성이 어디서 맞았는지·성능 정보 (개인정보는 보내지 않는다. 이름은 사용자가 입력한 닉네임만).
(function () {
  'use strict';
  const CFG = window.CD_CONFIG || {};
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const API = (CFG.API_URL || '').trim();
  let pid = ls.get('cd-pid'); if (!pid) { pid = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); ls.set('cd-pid', pid); } // 익명 플레이어 ID (기기별 무작위 값)
  const QKEY = 'cd-outbox', LKEY = 'cd-local-rank';

  function scoreOf(win, round, kills, time) { return (round + (win ? 1 : 0)) * 100000 + (win ? Math.max(0, 99999 - Math.floor(time)) : Math.min(99999, kills)); }

  // ── 전송 큐: 실패하면 저장해두었다가 다음에 다시 보낸다 ──
  function loadQ() { try { return JSON.parse(ls.get(QKEY) || '[]'); } catch (e) { return []; } }
  function saveQ(q) { ls.set(QKEY, JSON.stringify(q.slice(-30))); }
  async function post(obj, keepalive) {
    // text/plain 으로 보내면 CORS 사전 요청이 없어 구글 앱스 스크립트에서도 동작한다
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(obj), keepalive: !!keepalive, redirect: 'follow' });
    return r.ok;
  }
  async function flush() {
    if (!API) return; const q = loadQ(); if (!q.length) return; const rest = [];
    for (const o of q) { try { if (!(await post(o))) rest.push(o); } catch (e) { rest.push(o); } }
    saveQ(rest);
  }
  function enqueue(o) { if (!API) return; const q = loadQ(); q.push(o); saveQ(q); flush(); }

  // ── 플레이 기록 ──
  const run = { id: null, start: 0, tl: [], lagMs: 0, lagN: 0, sent: false };
  function begin(S) { run.id = 'r' + Math.random().toString(36).slice(2, 9); run.start = Date.now(); run.tl = []; run.lagMs = 0; run.lagN = 0; run.sent = false; run.seed = S.seed; run.lastRound = 0; }
  function sample(S, perf, scale) { // 라운드가 바뀔 때마다 한 줄씩 남긴다
    if (!run.id || S.round === run.lastRound) return; run.lastRound = S.round;
    run.tl.push({ r: S.round, t: Math.round(S.t), hp: Math.round(S.core.hp), g: Math.round(S.gold), u: S.units.length, e: S.enemies.length, ms: +(perf.dt || 0).toFixed(1), sc: scale });
    if (run.tl.length > 60) run.tl.shift();
  }
  function lag(ms) { if (ms > 50) { run.lagMs += ms; run.lagN++; } }
  function summary(S, status) {
    const ut = {}; for (const u of S.units) if (!u.dead) ut[u.type] = (ut[u.type] || 0) + 1;
    const jobs = {}; for (const k of ['sword', 'archer', 'priest']) if (S.jobs[k]) jobs[k] = S.jobs[k].ids.slice();
    const by = Object.entries(S.coreDmgBy || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, Math.round(v)]);
    return {
      type: 'log', mode: S.mode, v: CFG.VERSION, pid, run: run.id, status, seed: S.seed, round: S.round, act: S.act, win: !!S.win, kills: S.kills, time: Math.round(S.t),
      coreHp: Math.round(S.core.hp), gold: Math.round(S.gold), buys: S.buyCount, earned: Math.round(S.stats.earned), spent: Math.round(S.stats.spent), chk: window.CastleCore.checkRun(S).ok, units: ut, cards: Object.assign({}, S.cards.taken), jobs, coreDmgBy: by, timeline: run.tl,
      lag: { n: run.lagN, ms: Math.round(run.lagMs) }, real: Math.round((Date.now() - run.start) / 1000),
      env: { ua: navigator.userAgent.slice(0, 140), w: innerWidth, h: innerHeight, dpr: window.devicePixelRatio || 1, touch: 'ontouchstart' in window, cores: navigator.hardwareConcurrency || 0 },
    };
  }
  function sendLog(S, status, beacon) {
    if (!CFG.SEND_LOG || !API || !run.id || run.sent || new URLSearchParams(location.search).get('bot')) return;
    if (S.round < 2 && status !== 'end') return; // 시작하자마자 나간 것은 기록하지 않는다
    run.sent = true; const o = summary(S, status);
    if (beacon && navigator.sendBeacon) { try { navigator.sendBeacon(API, new Blob([JSON.stringify(o)], { type: 'text/plain;charset=utf-8' })); return; } catch (e) {} }
    enqueue(o);
  }

  // ── 오류 보고: 게임이 멈추거나 예외가 나면 상태와 함께 서버로 보낸다 (같은 오류는 한 번만, 한 판에 최대 8건) ──
  let getS = () => null; const seenErr = {}; let errN = 0;
  function sendError(msg, stack, where) {
    try {
      msg = String(msg || 'unknown').slice(0, 300); stack = String(stack || '').slice(0, 900);
      const key = msg + '|' + stack.split('\n')[1]; if (seenErr[key] || errN >= 8) return; seenErr[key] = 1; errN++;
      if (new URLSearchParams(location.search).get('bot')) return;
      const S = getS(), o = { type: 'error', v: CFG.VERSION, pid, run: run.id, where: where || '', msg, stack, ua: navigator.userAgent.slice(0, 140), w: innerWidth, h: innerHeight, real: run.start ? Math.round((Date.now() - run.start) / 1000) : 0 };
      if (S) { o.round = S.round; o.t = Math.round(S.t); o.seed = S.seed; o.units = S.units.length; o.enemies = S.enemies.length; o.coreHp = Math.round(S.core.hp); o.cards = Object.assign({}, S.cards.taken); o.phase = S.phase; }
      const l = JSON.parse(ls.get('cd-errors') || '[]'); l.push({ at: Date.now(), msg, round: o.round }); ls.set('cd-errors', JSON.stringify(l.slice(-10))); // 서버가 없어도 이 브라우저에 남긴다
      enqueue(o);
    } catch (e) {}
  }
  window.addEventListener('error', e => sendError(e.message, e.error && e.error.stack, 'window ' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => sendError(e.reason && e.reason.message || String(e.reason), e.reason && e.reason.stack, 'promise'));

  // ── 랭킹 ──
  function localTop() { try { return JSON.parse(ls.get(LKEY) || '[]'); } catch (e) { return []; } }
  function addLocal(e) { const l = localTop(); l.push(e); l.sort((a, b) => b.score - a.score); ls.set(LKEY, JSON.stringify(l.slice(0, 20))); return l; }
  async function top(n) {
    if (!API) return { server: false, list: localTop().slice(0, n) };
    try {
      const r = await fetch(API + (API.includes('?') ? '&' : '?') + 'action=top&n=' + n, { redirect: 'follow' });
      const j = await r.json(); if (j && Array.isArray(j.list)) return { server: true, list: j.list };
    } catch (e) {}
    return { server: false, list: localTop().slice(0, n), failed: true };
  }
  async function submit(S, name) {
    name = String(name || '').replace(/[<>&"'`]/g, '').trim().slice(0, 12) || '이름없음'; ls.set('cd-name', name);
    const chk = window.CastleCore.checkRun(S); if (!chk.ok) { enqueue({ type: 'flag', v: CFG.VERSION, pid, run: run.id, seed: S.seed, name, round: S.round, kills: S.kills, earned: Math.round(S.stats.earned), bound: chk.bound, why: chk.why }); return { rejected: true, why: chk.why }; } // 골드 수입이 그 라운드까지 벌 수 있는 양을 넘으면 등록하지 않는다
    const e = { name, mode: S.mode, score: scoreOf(S.win, S.round, S.kills, S.t), round: S.round, win: !!S.win, kills: S.kills, time: Math.round(S.t), at: Date.now() };
    addLocal(e);
    if (API) { try { await post({ type: 'score', mode: S.mode, v: CFG.VERSION, pid, run: run.id, seed: S.seed, name, earned: Math.round(S.stats.earned), spent: Math.round(S.stats.spent), bound: chk.bound, score: e.score, round: e.round, win: e.win, kills: e.kills, time: e.time }); } catch (er) { enqueue({ type: 'score', v: CFG.VERSION, pid, run: run.id, seed: S.seed, name, score: e.score, round: e.round, win: e.win, kills: e.kills, time: e.time }); } }
    return e;
  }

  window.addEventListener('online', flush); setTimeout(flush, 2000);
  window.Net = { configured: !!API, pid, sendError, setSource: f => { getS = f; }, begin, sample, lag, sendLog, top, submit, scoreOf, name: () => ls.get('cd-name') || '', localTop };
})();
