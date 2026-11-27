/**
 * 성채방어 랭킹 + 플레이 기록 서버 (구글 앱스 스크립트, 무료)
 *
 * 설치 방법 (5분)
 * 1) https://sheets.google.com 에서 새 스프레드시트를 만든다. (이름 예: 성채방어 기록)
 * 2) 메뉴 [확장 프로그램] → [Apps Script] 를 열고, 이 파일 내용을 전부 붙여넣고 저장한다.
 * 3) 오른쪽 위 [배포] → [새 배포] → 유형 [웹 앱]
 *      실행 사용자: 나 / 액세스 권한: 모든 사용자  → [배포] (권한 승인 창이 뜨면 허용)
 * 4) 나온 "웹 앱 URL"(https://script.google.com/macros/s/.../exec)을 복사해
 *    config.js 의 API_URL 에 붙여넣고 커밋/푸시한다.
 *
 * 시트에는 'scores'(랭킹)와 'logs'(플레이 기록) 탭이 자동으로 만들어진다.
 * 코드를 고쳐 다시 배포할 때는 [배포] → [배포 관리] → 연필 → 버전 "새 버전" 으로 올려야 같은 주소가 유지된다.
 *
 * 주의: 점수는 브라우저가 보낸 값이라 조작할 수 있다. 여기서는 범위만 검사한다(아래 valid).
 */
var MAX_ROUND = 999; // 무한 모드

function sheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  else if (sh.getLastColumn() < header.length) sh.getRange(1, 1, 1, header.length).setValues([header]); // 나중에 늘어난 열(닉네임 등)의 제목을 채운다
  return sh;
}
function scores_() {
  var sh = sheet_('scores', ['시각', '이름', '점수', '라운드', '승리', '처치', '시간(초)', '버전', 'pid', 'run', 'seed', '모드', '한마디', '상세(JSON)']);
  if (!sh.getRange(1, 13).getValue()) { sh.getRange(1, 13).setValue('한마디'); sh.getRange(1, 14).setValue('상세(JSON)'); } // 예전 시트에는 새 열 머리글을 채운다
  return sh;
}
// 한 판의 상세(라운드별 선택 기록)를 시트 한 칸(5만 자 제한)에 들어가도록 줄여서 문자열로 만든다
function pack_(d) {
  if (!d || typeof d !== 'object') return '';
  var t = JSON.stringify(d);
  if (t.length > 45000 && d.log && d.log.length) { var c = JSON.parse(t); while (JSON.stringify(c).length > 45000 && c.log.length > 20) c.log = c.log.slice(Math.floor(c.log.length * 0.1)); t = JSON.stringify(c); }
  return t.length > 49000 ? '' : t;
}
function logs_() { return sheet_('logs', ['시각', '상태', '버전', 'pid', 'run', 'seed', '라운드', '막', '승리', '처치', '게임시간(초)', '실제시간(초)', '성채HP', '골드', '구매수', '유닛', '강화', '전직', '성채피해원인', '렉(횟수/ms)', '환경', '라운드별기록(JSON)', '모드', '닉네임']); }

function errors_() { return sheet_('errors', ['시각', '버전', 'pid', 'run', '위치', '메시지', '스택', '라운드', '게임시간', 'seed', '유닛', '적', '성채HP', '강화', '화면', '브라우저', '실제시간']); }

function feedback_() { return sheet_('feedback', ['시각', '종류', '내용', '닉네임', '라운드', '버전', 'pid', '화면', '브라우저']); }

function games_() { return sheet_('games', ['시각', '기록시각', 'pid', '버전', '모드', '라운드', '승리', '처치', '시간(초)', '번 골드', '쓴 골드', '점수', '인구', '성 레벨', '상세(JSON)', '닉네임']); }

function valid_(o) {
  return o && typeof o.score === 'number' && o.round >= 1 && o.round <= MAX_ROUND && o.kills >= 0 && o.kills < 100000 &&
    o.score <= (MAX_ROUND + 1) * 100000 + 99999 && o.time >= (o.round - 1) * 8; // 라운드는 40초마다 넘어가므로, 라운드 수에 비해 게임 시간이 너무 짧으면 거부
}


// ── 유저 목록: 기기 ID(pid) ↔ 닉네임. 닉네임이 담긴 요청이 올 때마다 갱신 ──
function users_() { return sheet_('users', ['pid', '닉네임', '처음 접속', '마지막 접속', '판 수', '이전 닉네임']); }
function cleanName_(v) { return String(v || '').replace(/[<>&"'`]/g, '').trim().slice(0, 12); }
function userRow_(us, pid) { var f = us.getRange('A:A').createTextFinder(String(pid)).matchEntireCell(true).findNext(); return f ? f.getRow() : 0; }
function touchUser_(pid, name, now, game) {
  name = cleanName_(name); if (!pid || (!name && !game)) return;
  var lk = LockService.getScriptLock(); lk.waitLock(20000);
  try {
    var us = users_(), r = userRow_(us, pid);
    if (!r) { if (name) us.appendRow([String(pid), name, now, now, game ? 1 : 0, '']); return; }
    var cur = us.getRange(r, 1, 1, 6).getValues()[0];
    if (name && String(cur[1]) !== name) { var prev = String(cur[5] || ''); if (cur[1]) prev = (prev ? prev + ', ' : '') + cur[1]; us.getRange(r, 2).setValue(name); us.getRange(r, 6).setValue(prev.slice(-200)); }
    us.getRange(r, 4).setValue(now); if (game) us.getRange(r, 5).setValue((+cur[4] || 0) + 1);
  } finally { lk.releaseLock(); }
}
function userName_(pid) { var us = users_(), r = userRow_(us, pid); return r ? String(us.getRange(r, 2).getValue() || '') : ''; }
// 예전 랭킹 기록으로 유저 목록 채우기 (pid마다 가장 최근 닉네임)
function backfillUsers() {
  var sc = scores_(), last = sc.getLastRow(), n = 0; if (last < 2) return 0;
  var v = sc.getRange(2, 1, last - 1, 9).getValues(), latest = {};
  for (var i = 0; i < v.length; i++) if (v[i][8] && v[i][1]) latest[String(v[i][8])] = [cleanName_(v[i][1]), v[i][0]];
  var us = users_();
  for (var p in latest) if (!userRow_(us, p)) { us.appendRow([p, latest[p][0], latest[p][1], latest[p][1], 0, '']); n++; }
  return n;
}

// ── 랭킹 자동 등록: 같은 기기(pid)가 예전에 쓴 닉네임으로, 랭킹에 없는 판을 채운다 ──
function scoreOf_(win, round, kills, time) { return (round + (win ? 1 : 0)) * 100000 + (win ? Math.max(0, 99999 - Math.floor(time)) : Math.min(99999, kills)); }
function nameOf_(sc, pid) { // 이 pid가 랭킹에 마지막으로 쓴 닉네임
  var last = sc.getLastRow(); if (last < 2 || !pid) return '';
  var v = sc.getRange(2, 2, last - 1, 8).getValues(); // 이름(2) … pid(9)
  for (var i = v.length - 1; i >= 0; i--) if (String(v[i][7]) === String(pid) && v[i][0]) return String(v[i][0]);
  return '';
}
function scoreRow_(sc, pid, round, kills, win) { // 같은 판(같은 pid·라운드·처치·승리)이 이미 랭킹에 있으면 그 행 번호
  var last = sc.getLastRow(); if (last < 2) return 0;
  var from = Math.max(2, last - 3000), v = sc.getRange(from, 4, last - from + 1, 6).getValues(); // 라운드(4) 승리(5) 처치(6) … pid(9)
  for (var i = v.length - 1; i >= 0; i--) if (String(v[i][5]) === String(pid) && +v[i][0] === +round && +v[i][2] === +kills && (v[i][1] === 'Y') === !!win) return from + i;
  return 0;
}
function autoScore_(sc, g, d, now) { // g = 통계 한 판 {pid, round, kills, win, time, mode, v, earned, spent, pop, castle}
  if (!g.pid || !(g.round >= 2)) return false;
  var name = cleanName_(g.name) || userName_(g.pid) || nameOf_(sc, g.pid); if (!name) return false; // 판과 함께 온 닉네임 → 유저 목록 → 예전 랭킹 닉네임 // 판과 함께 온 닉네임 → 없으면 이 기기가 예전에 쓴 닉네임
  if (scoreRow_(sc, g.pid, g.round, g.kills, g.win)) return false;
  var o = { score: scoreOf_(g.win, g.round, g.kills, g.time), round: g.round, kills: g.kills, time: g.time }; if (!valid_(o)) return false;
  var det = d && typeof d === 'object' ? d : {}; det.earned = g.earned; det.spent = g.spent; det.pop = g.pop; det.castle = g.castle; det.auto = 1;
  sc.appendRow([now, name, o.score, g.round, g.win ? 'Y' : 'N', g.kills, g.time, g.v, g.pid, '', '', g.mode === 'free' ? 'free' : 'normal', '', pack_(det)]);
  return true;
}
// 예전 기록 채우기: Apps Script 편집기에서 이 함수를 골라 [실행]하거나, ?action=backfill&key=READ_KEY 로 부른다
function backfillScores() {
  backfillUsers();
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sc = scores_(), gs = games_(), last = gs.getLastRow(), n = 0, now = new Date(); if (last < 2) return 0;
    var v = gs.getRange(2, 1, last - 1, Math.max(15, gs.getLastColumn())).getValues();
    for (var i = 0; i < v.length; i++) { var r = v[i], d = null; try { d = r[14] ? JSON.parse(r[14]) : null; } catch (er) {}
      if (autoScore_(sc, { name: r[15] || '', pid: r[2], v: r[3], mode: r[4], round: +r[5], win: r[6] === 'Y', kills: +r[7], time: +r[8], earned: r[9], spent: r[10], pop: r[12], castle: r[13] }, d, now)) n++; }
    return n;
  } finally { lock.releaseLock(); }
}

function doPost(e) {
  var out = { ok: false };
  try {
    var o = JSON.parse(e.postData.contents), now = new Date();
    if (o.pid && o.type !== 'error' && o.type !== 'game') touchUser_(o.pid, o.name, now, false); // 유저 목록 갱신 (판 수는 통계 한 판이 올 때 센다)
    if (o.type === 'score') {
      if (valid_(o)) {
        var lk = LockService.getScriptLock(); lk.waitLock(20000);
        try {
          var scs = scores_(), row = o.pid ? scoreRow_(scs, o.pid, o.round, o.kills, o.win) : 0;
          if (row) { scs.getRange(row, 2).setValue(String(o.name || '').slice(0, 12)); scs.getRange(row, 10).setValue(o.run || ''); if (o.msg) scs.getRange(row, 13).setValue(String(o.msg).replace(/[<>&"'`]/g, '').slice(0, 30)); if (o.detail) scs.getRange(row, 14).setValue(pack_(o.detail)); } // 자동 등록된 같은 판이면 그 행을 채운다
          else scs.appendRow([now, String(o.name || '').slice(0, 12), o.score, o.round, o.win ? 'Y' : 'N', o.kills, o.time, o.v, o.pid, o.run, o.seed, o.mode === 'free' ? 'free' : 'normal', String(o.msg || '').replace(/[<>&"'`]/g, '').slice(0, 30), pack_(o.detail)]);
        } finally { lk.releaseLock(); }
        out.ok = true;
      } else out.error = 'invalid';
    } else if (o.type === 'error') { // 게임 중 발생한 오류 (멈춤 원인 추적용)
      errors_().appendRow([now, o.v, o.pid, o.run, o.where, o.msg, o.stack, o.round, o.t, o.seed, o.units, o.enemies, o.coreHp, JSON.stringify(o.cards), o.w + 'x' + o.h, o.ua, o.real]);
      out.ok = true;
    } else if (o.type === 'feedback') { // 설정 창의 '개발자에게 피드백'
      var txt = String(o.text || '').slice(0, 1000);
      if (txt) { feedback_().appendRow([now, String(o.cat || '').slice(0, 10), txt, String(o.name || '').slice(0, 12), o.round || 0, o.v, o.pid, o.env ? o.env.w + 'x' + o.env.h : '', o.env ? String(o.env.ua || '').slice(0, 120) : '']); out.ok = true; } else out.error = 'empty';
    } else if (o.type === 'msg') { // 이미 올라간 기록에 한마디를 붙인다 (같은 pid·run의 가장 최근 기록)
      var sh0 = scores_(), last0 = sh0.getLastRow(), txt0 = String(o.msg || '').replace(/[<>&"'`]/g, '').slice(0, 30);
      if (o.pid && o.run && txt0 && last0 > 1) { var f0 = Math.max(2, last0 - 400), v0 = sh0.getRange(f0, 9, last0 - f0 + 1, 2).getValues(); for (var k0 = v0.length - 1; k0 >= 0; k0--) if (String(v0[k0][0]) === String(o.pid) && String(v0[k0][1]) === String(o.run)) { sh0.getRange(f0 + k0, 13).setValue(txt0); out.ok = true; break; } }
    } else if (o.type === 'game') { // 게임 안 통계의 한 판 기록 (같은 pid·기록시각은 한 번만)
      if (o.pid && o.at && o.round >= 1 && o.round <= MAX_ROUND && o.kills >= 0 && o.kills < 100000) {
        var sh = games_(), last = sh.getLastRow(), dup = false;
        if (last > 1) { var from = Math.max(2, last - 400), vals = sh.getRange(from, 2, last - from + 1, 2).getValues(); for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(o.at) && String(vals[i][1]) === String(o.pid)) { dup = true; break; } }
        if (!dup) sh.appendRow([now, o.at, o.pid, o.v, o.mode === 'free' ? 'free' : 'normal', o.round, o.win ? 'Y' : 'N', o.kills, o.time, o.earned, o.spent, o.score, o.pop, o.castle, pack_(o.d), String(o.name || '').replace(/[<>&"'`]/g, '').slice(0, 12)]);
        if (!dup) touchUser_(o.pid, o.name, now, true);
        if (!dup) { var lk2 = LockService.getScriptLock(); lk2.waitLock(20000); try { out.ranked = autoScore_(scores_(), o, o.d, now); } finally { lk2.releaseLock(); } } // 랭킹 등록을 안 하고 끝낸 판도 예전 닉네임으로 랭킹에 올린다
        out.ok = true;
      } else out.error = 'invalid';
    } else if (o.type === 'log') {
      logs_().appendRow([now, o.status, o.v, o.pid, o.run, o.seed, o.round, o.act, o.win ? 'Y' : 'N', o.kills, o.time, o.real, o.coreHp, o.gold, o.buys,
        JSON.stringify(o.units), JSON.stringify(o.cards), JSON.stringify(o.jobs), JSON.stringify(o.coreDmgBy), o.lag ? o.lag.n + '/' + o.lag.ms : '', JSON.stringify(o.env), JSON.stringify(o.timeline).slice(0, 45000), o.mode === 'free' ? 'free' : 'normal', String(o.name || '').replace(/[<>&"'`]/g, '').slice(0, 12)]);
      out.ok = true;
    }
  } catch (err) { out.error = String(err); }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// 개발자용 읽기 전용 조회: ?action=logs|errors|feedback&key=비밀키&n=20 (최근 n줄, 최대 50)
// 비밀키는 코드에 적지 않고 [프로젝트 설정] → [스크립트 속성]에 READ_KEY 라는 이름으로 넣는다. 속성이 없으면 이 기능은 꺼져 있다.
function readTab_(e) {
  var want = PropertiesService.getScriptProperties().getProperty('READ_KEY');
  if (!want || String(e.parameter.key || '') !== want) return { ok: false, error: 'denied' };
  var name = e.parameter.action, fn = name === 'logs' ? logs_ : name === 'errors' ? errors_ : name === 'feedback' ? feedback_ : name === 'games' ? games_ : name === 'users' ? users_ : null;
  if (!fn) return { ok: false, error: 'bad action' };
  var sh = fn(), n = Math.min(50, Math.max(1, +(e.parameter.n || 20))), last = sh.getLastRow(), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (last < 2) return { ok: true, head: head, rows: [] };
  var from = Math.max(2, last - n + 1), rows = sh.getRange(from, 1, last - from + 1, sh.getLastColumn()).getValues().map(function (r) { return r.map(function (c) { return c instanceof Date ? c.toISOString() : (typeof c === 'string' && c.length > 6000 ? c.slice(0, 6000) : c); }); });
  return { ok: true, head: head, rows: rows };
}

function doGet(e) {
  if (e.parameter && e.parameter.action === 'backfill') { var want = PropertiesService.getScriptProperties().getProperty('READ_KEY'); var res = want && String(e.parameter.key || '') === want ? { ok: true, added: backfillScores() } : { ok: false, error: 'denied' }; return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON); }
  if (e.parameter && ['logs', 'errors', 'feedback', 'games', 'users'].indexOf(e.parameter.action) >= 0) return ContentService.createTextOutput(JSON.stringify(readTab_(e))).setMimeType(ContentService.MimeType.JSON);
  var n = Math.min(50, Math.max(1, +(e.parameter.n || 20))), rows = scores_().getDataRange().getValues(), list = [];
  for (var i = 1; i < rows.length; i++) list.push({ name: rows[i][1], score: rows[i][2], round: rows[i][3], win: rows[i][4] === 'Y', kills: rows[i][5], time: rows[i][6], mode: rows[i][11] === 'free' ? 'free' : 'normal', at: new Date(rows[i][0]).getTime(), msg: String(rows[i][12] || ''), row: i });
  list.sort(function (a, b) { return b.score - a.score; });
  // 같은 이름은 점수가 높은 기록 3개까지만 남긴다
  var seen = {}, uniq = []; list.forEach(function (x) { var k = String(x.name); seen[k] = (seen[k] || 0) + 1; if (seen[k] <= 3) uniq.push(x); });
  var out = uniq.slice(0, n); out.forEach(function (x) { var t = rows[x.row][13]; if (t) { try { x.d = JSON.parse(t); } catch (er) {} } delete x.row; }); // 상세 기록도 함께 내려보낸다
  return ContentService.createTextOutput(JSON.stringify({ ok: true, list: out })).setMimeType(ContentService.MimeType.JSON);
}
