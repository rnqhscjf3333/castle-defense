// node tests/e2e.mjs — 실제 시간으로 브라우저를 조작하는 E2E 점검 (Chrome DevTools 프로토콜, 외부 패키지 없음)
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CH = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL0 = process.env.URL0 || 'file://' + ROOT + '/index.html'; // URL0=https://…/ 로 배포본도 점검 가능
const PORT = 9300 + Math.floor(Math.random() * 500);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, cond, extra) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' ' + extra : '')); };

const profile = mkdtempSync(join(tmpdir(), 'cd-e2e-'));
const chrome = spawn(CH, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--window-size=1000,700', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const page = list.find(t => t.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch (e) { /* 아직 안 떴음 */ }
    await sleep(250);
  }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result)); return r.result.result.value; };
async function open(query, wait = 1200) { await send('Page.navigate', { url: URL0 + query }); await sleep(wait); }

try {
  await connect();
  await send('Page.enable'); await send('Runtime.enable');
  const errors = []; // 콘솔 오류 수집
  await send('Log.enable');

  // 1) 게임 루프가 실제 시간으로 흐르는지
  await open('?bot=1&seed=11&zoom=1', 800);
  const t0 = await ev('__game.S.t'); await sleep(3000); const t1 = await ev('__game.S.t');
  check('게임 시간이 실제 시간과 비슷하게 흐름(3초)', t1 - t0 > 2.4 && t1 - t0 < 3.8, (t1 - t0).toFixed(2) + '초');
  await ev("document.getElementById('btnSpeed').click()");
  const s0 = await ev('__game.S.t'), w0 = Date.now(); await sleep(2000); const s1 = await ev('__game.S.t'), real = (Date.now() - w0) / 1000;
  check('배속 2× (게임 시간 ÷ 실제 시간)', (s1 - s0) / real > 1.85 && (s1 - s0) / real < 2.15, ((s1 - s0) / real).toFixed(2) + '배');
  await ev("document.getElementById('btnSpeed').click(); document.getElementById('btnSpeed').click()"); // 3× → 1×
  await ev("document.getElementById('btnPause').click()"); const p0 = await ev('__game.S.t'); await sleep(800); const p1 = await ev('__game.S.t');
  check('일시정지 중 시간 정지', p1 === p0);
  await ev("document.getElementById('btnPause').click()");
  // 인구 제한/수동 라운드 버튼이 없고, 가격이 오르는지
  check('인구 확장·다음 라운드 버튼 없음', await ev("!document.getElementById('btnPop') && !document.getElementById('btnNext')"));
  await ev('__game.S.gold = 100000; __game.S.buyCd.sword = 0'); const price0 = await ev("(()=>{const t=document.querySelectorAll('.ucard .cost')[1].textContent; return +t.replace('G','');})()");
  await ev("document.querySelectorAll('.ucard')[0].click()"); await sleep(300);
  const price1 = await ev("(()=>{const t=document.querySelectorAll('.ucard .cost')[1].textContent; return +t.replace('G','');})()");
  check('유닛을 뽑으면 다른 유닛 카드의 가격도 오름', price1 > price0, price0 + 'G→' + price1 + 'G');

  // 2) 카드 선택: 열림 → 시간 정지 → 리롤 문구 갱신 → 키보드 선택 → 닫힘 → 시간 재개
  await open('?bot=1&nopick=1&warp=53&seed=11&zoom=1', 1200);
  check('카드창 표시', await ev("!document.getElementById('picker').classList.contains('hidden')"));
  const f0 = await ev('__game.S.t'); await sleep(700);
  check('카드창이 열린 동안 시간 정지', (await ev('__game.S.t')) === f0);
  const rr = await ev('__game.S.cards.rerolls');
  await ev("document.getElementById('btnReroll').click()"); await sleep(300);
  check('다시 뽑기 문구 갱신', (await ev("document.getElementById('btnReroll').textContent")).includes('(' + (rr - 1) + ')'), await ev("document.getElementById('btnReroll').textContent"));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '2', code: 'Digit2', text: '2' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '2', code: 'Digit2' });
  await sleep(500);
  check('키보드 2번으로 선택 → 카드창 닫힘', await ev("document.getElementById('picker').classList.contains('hidden') && __game.S.cards.offer === null"));
  const a0 = await ev('__game.S.t'); await sleep(1500); const a1 = await ev('__game.S.t');
  check('선택 후 시간 재개', a1 - a0 > 1.2, (a1 - a0).toFixed(2) + '초');
  check('강화 반영(토스트/목록)', await ev("(document.getElementById('btnUp').click(), document.getElementById('upl').textContent.includes('Lv 1'))"));

  // 3) 마우스 드래그(실제 입력 이벤트)로 화면 이동
  await open('?bot=1&seed=11&zoom=1', 800);
  const c0 = await ev('({x:__game.cam.x,y:__game.cam.y})');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 350, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 6; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500 - i * 25, y: 350 - i * 10, button: 'left', buttons: 1 }); await sleep(30); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 350, y: 290, button: 'left', clickCount: 1 });
  const c1 = await ev('({x:__game.cam.x,y:__game.cam.y})');
  check('마우스 드래그로 화면 이동', c1.x > c0.x + 80 && c1.y > c0.y + 30, JSON.stringify(c0) + '→' + JSON.stringify(c1));
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 500, y: 350, deltaX: 0, deltaY: -240 }); await sleep(100);
  check('마우스 휠 확대', (await ev('__game.cam.zoom')) > 1.1, String(await ev('__game.cam.zoom')));

  // 3.5) 보스 라운드 표시: 라운드 표시, 보스 체력 바, 화면 밖 보스는 미니맵/화살표 대상
  await open('?bot=1&warp=165&seed=3&zoom=1', 1200); // 5라운드(160초) 시작 직후
  check('보스 라운드 표시 (라운드 문구에 보스, 빨간색)', (await ev("document.getElementById('roundTxt').textContent")).includes('보스') && await ev("document.getElementById('roundTxt').classList.contains('boss')"), await ev("document.getElementById('roundTxt').textContent"));
  check('보스 체력 바가 위에 크게 표시됨', await ev("(()=>{const b=document.getElementById('bossbar'); if(b.hidden) return false; const r=b.getBoundingClientRect(); return r.width>=300 && r.top<20 && document.getElementById('bossName').textContent==='돌격왕' && document.getElementById('bossHpTxt').textContent.includes('/');})()"), await ev("document.getElementById('bossName').textContent + ' ' + document.getElementById('bossHpTxt').textContent"));
  check('보스가 화면 밖이어도 위치 표시 가능 (보스 존재 + 카메라 밖)', await ev("(()=>{const b=__game.S.enemies.find(e=>e.kind==='boss'); const c=__game.cam; return !!b && (Math.abs(b.x-c.x)>500 || Math.abs(b.y-c.y)>350);})()"));
  check('보스 정보 제공 (5라운드 보스 = 돌격왕)', await ev("(()=>{const r=__game.CastleCore.bossInfo(5); return !!r && r.name==='돌격왕';})()"));
  await ev("(()=>{const b=__game.S.enemies.find(e=>e.kind==='boss'); b.hp = 300;})()"); await sleep(400);
  const barTxt = await ev("document.getElementById('bossHpTxt').textContent"), barW = await ev("document.getElementById('bossFill').style.width");
  check('보스 체력 바가 실제 체력(300/600)을 따라감', barTxt.includes('300 / 600') && barW === '50%', barTxt + ' / 폭 ' + barW);

  // 4) 한 판 끝까지(디버그 가속) — 종료 화면이 뜨는지
  await open('?bot=1&warp=2400&seed=5&zoom=0.6', 1500); // 봇이 30라운드 끝까지(승리 또는 패배) 미리 진행한 상태
  check('종료 화면 표시(빨리감기 중 종료)', (await ev('__game.S.over')) && !(await ev("document.getElementById('overlay').classList.contains('hidden')")), '라운드 ' + await ev('__game.S.round'));
  const title = await ev("document.getElementById('ovTitle').textContent");
  check('결과 문구(승리/패배)', title === '방어 성공!' || title === '성채가 무너졌어요', title);
  await ev("document.getElementById('go').click()"); await sleep(500);
  check('다시 시작 → 새 게임', (await ev('__game.S.t')) < 2 && (await ev("document.getElementById('overlay').classList.contains('hidden')")), 't=' + await ev('__game.S.t'));
} catch (e) {
  failed++; console.log('FAIL 예외 ' + e.message);
} finally {
  try { ws && ws.close(); } catch (e) {}
  chrome.kill('SIGKILL');
  console.log(failed ? '\n실패 ' + failed + '건' : '\n모두 통과');
  process.exit(failed ? 1 : 0);
}
