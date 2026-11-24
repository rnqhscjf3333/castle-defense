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
function logs_() { return sheet_('logs', ['시각', '상태', '버전', 'pid', 'run', 'seed', '라운드', '막', '승리', '처치', '게임시간(초)', '실제시간(초)', '성채HP', '골드', '구매수', '유닛', '강화', '전직', '성채피해원인', '렉(횟수/ms)', '환경', '라운드별기록(JSON)', '모드']); }

function errors_() { return sheet_('errors', ['시각', '버전', 'pid', 'run', '위치', '메시지', '스택', '라운드', '게임시간', 'seed', '유닛', '적', '성채HP', '강화', '화면', '브라우저', '실제시간']); }

function feedback_() { return sheet_('feedback', ['시각', '종류', '내용', '닉네임', '라운드', '버전', 'pid', '화면', '브라우저']); }

function valid_(o) {
  return o && typeof o.score === 'number' && o.round >= 1 && o.round <= MAX_ROUND && o.kills >= 0 && o.kills < 100000 &&
    o.score <= (MAX_ROUND + 1) * 100000 + 99999 && o.time >= (o.round - 1) * 8; // 라운드는 40초마다 넘어가므로, 라운드 수에 비해 게임 시간이 너무 짧으면 거부
}

function doPost(e) {
  var out = { ok: false };
  try {
    var o = JSON.parse(e.postData.contents), now = new Date();
    if (o.type === 'score') {
      if (valid_(o)) {
        scores_().appendRow([now, String(o.name || '').slice(0, 12), o.score, o.round, o.win ? 'Y' : 'N', o.kills, o.time, o.v, o.pid, o.run, o.seed, o.mode === 'free' ? 'free' : 'normal', String(o.msg || '').replace(/[<>&"'`]/g, '').slice(0, 30), pack_(o.detail)]);
        out.ok = true;
      } else out.error = 'invalid';
    } else if (o.type === 'error') { // 게임 중 발생한 오류 (멈춤 원인 추적용)
      errors_().appendRow([now, o.v, o.pid, o.run, o.where, o.msg, o.stack, o.round, o.t, o.seed, o.units, o.enemies, o.coreHp, JSON.stringify(o.cards), o.w + 'x' + o.h, o.ua, o.real]);
      out.ok = true;
    } else if (o.type === 'feedback') { // 설정 창의 '개발자에게 피드백'
      var txt = String(o.text || '').slice(0, 1000);
      if (txt) { feedback_().appendRow([now, String(o.cat || '').slice(0, 10), txt, String(o.name || '').slice(0, 12), o.round || 0, o.v, o.pid, o.env ? o.env.w + 'x' + o.env.h : '', o.env ? String(o.env.ua || '').slice(0, 120) : '']); out.ok = true; } else out.error = 'empty';
    } else if (o.type === 'log') {
      logs_().appendRow([now, o.status, o.v, o.pid, o.run, o.seed, o.round, o.act, o.win ? 'Y' : 'N', o.kills, o.time, o.real, o.coreHp, o.gold, o.buys,
        JSON.stringify(o.units), JSON.stringify(o.cards), JSON.stringify(o.jobs), JSON.stringify(o.coreDmgBy), o.lag ? o.lag.n + '/' + o.lag.ms : '', JSON.stringify(o.env), JSON.stringify(o.timeline).slice(0, 45000), o.mode === 'free' ? 'free' : 'normal']);
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
  var name = e.parameter.action, fn = name === 'logs' ? logs_ : name === 'errors' ? errors_ : name === 'feedback' ? feedback_ : null;
  if (!fn) return { ok: false, error: 'bad action' };
  var sh = fn(), n = Math.min(50, Math.max(1, +(e.parameter.n || 20))), last = sh.getLastRow(), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (last < 2) return { ok: true, head: head, rows: [] };
  var from = Math.max(2, last - n + 1), rows = sh.getRange(from, 1, last - from + 1, sh.getLastColumn()).getValues().map(function (r) { return r.map(function (c) { return c instanceof Date ? c.toISOString() : (typeof c === 'string' && c.length > 6000 ? c.slice(0, 6000) : c); }); });
  return { ok: true, head: head, rows: rows };
}

function doGet(e) {
  if (e.parameter && e.parameter.action) return ContentService.createTextOutput(JSON.stringify(readTab_(e))).setMimeType(ContentService.MimeType.JSON);
  var n = Math.min(50, Math.max(1, +(e.parameter.n || 20))), rows = scores_().getDataRange().getValues(), list = [];
  for (var i = 1; i < rows.length; i++) list.push({ name: rows[i][1], score: rows[i][2], round: rows[i][3], win: rows[i][4] === 'Y', kills: rows[i][5], time: rows[i][6], mode: rows[i][11] === 'free' ? 'free' : 'normal', at: new Date(rows[i][0]).getTime(), msg: String(rows[i][12] || ''), row: i });
  list.sort(function (a, b) { return b.score - a.score; });
  // 같은 이름의 중복 기록은 최고 점수만 남긴다
  var seen = {}, uniq = []; list.forEach(function (x) { var k = x.name + '|' + x.mode; if (!seen[k]) { seen[k] = 1; uniq.push(x); } });
  var out = uniq.slice(0, n); out.forEach(function (x) { var t = rows[x.row][13]; if (t) { try { x.d = JSON.parse(t); } catch (er) {} } delete x.row; }); // 상세 기록도 함께 내려보낸다
  return ContentService.createTextOutput(JSON.stringify({ ok: true, list: out })).setMimeType(ContentService.MimeType.JSON);
}
