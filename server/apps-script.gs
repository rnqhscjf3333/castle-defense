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
function scores_() { return sheet_('scores', ['시각', '이름', '점수', '라운드', '승리', '처치', '시간(초)', '버전', 'pid', 'run', 'seed']); }
function logs_() { return sheet_('logs', ['시각', '상태', '버전', 'pid', 'run', 'seed', '라운드', '막', '승리', '처치', '게임시간(초)', '실제시간(초)', '성채HP', '골드', '구매수', '유닛', '강화', '전직', '성채피해원인', '렉(횟수/ms)', '환경', '라운드별기록(JSON)']); }

function errors_() { return sheet_('errors', ['시각', '버전', 'pid', 'run', '위치', '메시지', '스택', '라운드', '게임시간', 'seed', '유닛', '적', '성채HP', '강화', '화면', '브라우저', '실제시간']); }

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
        scores_().appendRow([now, String(o.name || '').slice(0, 12), o.score, o.round, o.win ? 'Y' : 'N', o.kills, o.time, o.v, o.pid, o.run, o.seed]);
        out.ok = true;
      } else out.error = 'invalid';
    } else if (o.type === 'error') { // 게임 중 발생한 오류 (멈춤 원인 추적용)
      errors_().appendRow([now, o.v, o.pid, o.run, o.where, o.msg, o.stack, o.round, o.t, o.seed, o.units, o.enemies, o.coreHp, JSON.stringify(o.cards), o.w + 'x' + o.h, o.ua, o.real]);
      out.ok = true;
    } else if (o.type === 'log') {
      logs_().appendRow([now, o.status, o.v, o.pid, o.run, o.seed, o.round, o.act, o.win ? 'Y' : 'N', o.kills, o.time, o.real, o.coreHp, o.gold, o.buys,
        JSON.stringify(o.units), JSON.stringify(o.cards), JSON.stringify(o.jobs), JSON.stringify(o.coreDmgBy), o.lag ? o.lag.n + '/' + o.lag.ms : '', JSON.stringify(o.env), JSON.stringify(o.timeline).slice(0, 45000)]);
      out.ok = true;
    }
  } catch (err) { out.error = String(err); }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var n = Math.min(50, Math.max(1, +(e.parameter.n || 20))), rows = scores_().getDataRange().getValues(), list = [];
  for (var i = 1; i < rows.length; i++) list.push({ name: rows[i][1], score: rows[i][2], round: rows[i][3], win: rows[i][4] === 'Y', kills: rows[i][5], time: rows[i][6], at: new Date(rows[i][0]).getTime() });
  list.sort(function (a, b) { return b.score - a.score; });
  // 같은 이름의 중복 기록은 최고 점수만 남긴다
  var seen = {}, uniq = []; list.forEach(function (x) { if (!seen[x.name]) { seen[x.name] = 1; uniq.push(x); } });
  return ContentService.createTextOutput(JSON.stringify({ ok: true, list: uniq.slice(0, n) })).setMimeType(ContentService.MimeType.JSON);
}
