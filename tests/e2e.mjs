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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__errs = []; window.addEventListener("error", e => window.__errs.push(e.message));' });
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
  check('가격이 오르면 카드에 +N 표시', await ev("(()=>{const d=document.querySelectorAll('.ucard .delta')[1]; return d.textContent.startsWith('+') && d.classList.contains('show');})()"), await ev("document.querySelectorAll('.ucard .delta')[1].textContent"));

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

  // 2.5) 전직 선택창: 보스 처치 보상 (선택 중 시간 정지, 키보드 선택, 강화 목록 반영)
  await open('?bot=1&nopick=1&seed=21&zoom=1', 800); // nopick: 봇이 선택창을 자동으로 넘기지 않게
  await ev("(()=>{const g=__game,C=g.CastleCore,S=g.S; S.jobs.offer={boss:'돌격왕', list:C.jobOptions(S).slice(0,3)};})()"); await sleep(500);
  check('전직 선택창 표시 (3개, 전직 스타일, 제목에 보스 이름)', await ev("(()=>{const p=document.getElementById('picker'); return !p.classList.contains('hidden') && document.querySelectorAll('#pickCards .pcard.job').length===3 && document.getElementById('pickTitle').textContent.includes('돌격왕') && document.getElementById('pickTitle').textContent.includes('전직');})()"), await ev("document.getElementById('pickTitle').textContent"));
  check('전직 선택창에는 다시 뽑기 버튼이 없음', await ev("getComputedStyle(document.getElementById('btnReroll')).display==='none'"));
  const jt0 = await ev('__game.S.t'); await sleep(600); check('전직 선택 중 시간 정지', (await ev('__game.S.t')) === jt0);
  const pickedJob = await ev('__game.S.jobs.offer.list[0].name');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '1', code: 'Digit1', text: '1' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1' }); await sleep(500);
  check('키보드 1번으로 전직 → 창 닫힘, 시간 재개', await ev("document.getElementById('picker').classList.contains('hidden') && __game.S.jobs.offer===null") && (await ev('__game.S.t')) > jt0, pickedJob);
  await ev("document.getElementById('btnUp').click()");
  check('강화 목록에 전직 이력 표시', (await ev("document.getElementById('upl').textContent")).includes(pickedJob) && (await ev("document.getElementById('upl').textContent")).includes('전직'), await ev("document.getElementById('upl').textContent"));

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

  // 3.2) 맵 배경/성채 그래픽이 로드되고 그려짐
  await open('?bot=1&warp=120&seed=3&zoom=1', 1200);
  check('배경·성채 렌더러 로드 (Scenery)', await ev("typeof window.Scenery === 'object' && typeof Scenery.drawCastle === 'function' && Scenery.visibleTrees(0,0,3000,3000).length > 300"), String(await ev("Scenery.visibleTrees(0,0,3000,3000).length")) + '그루');
  check('캔버스에 풀밭색이 칠해짐 (예전 격자 배경 아님)', await ev("(()=>{const c=document.getElementById('cv'); const x=c.getContext('2d'); const d=x.getImageData(Math.round(c.width*0.1), Math.round(c.height*0.5), 1, 1).data; return d[1] > d[0] && d[1] > d[2] && d[1] > 60;})()"));

  // 3.5) 보스 라운드 표시: 라운드 표시, 보스 체력 바, 화면 밖 보스는 미니맵/화살표 대상
  await open('?bot=1&warp=100&round=5&seed=3&zoom=1', 1200); // 5라운드 시작 직후
  check('보스 라운드 표시 (라운드 문구에 보스, 빨간색)', (await ev("document.getElementById('roundTxt').textContent")).includes('보스') && await ev("document.getElementById('roundTxt').classList.contains('boss')"), await ev("document.getElementById('roundTxt').textContent"));
  check('보스 체력 바가 화면 맨 위에 작고 얇게 표시됨 (높이 ≤ 64px)', await ev("(()=>{const b=document.getElementById('bossbar'); if(b.hidden) return false; const r=b.getBoundingClientRect(); return r.width>=170 && r.top<=8 && r.height<=64 && document.getElementById('bossName').textContent===__game.CastleCore.bossInfo(__game.S,5).name && document.getElementById('bossHpTxt').textContent.includes('/');})()"), await ev("document.getElementById('bossName').textContent + ' ' + document.getElementById('bossHpTxt').textContent"));
  // 보스가 가까워서 화면 안일 수 있으니 카메라를 멀리 옮겨 '화면 밖 보스' 상황을 만들고, 그려도 오류가 없는지 확인한다
  await ev("(()=>{__game.cam.x = 300; __game.cam.y = 300;})()"); await sleep(400);
  check('보스가 화면 밖일 때(화살표 표시 경로)도 오류 없이 그려짐', await ev("(()=>{const b=__game.S.enemies.find(e=>e.kind==='boss'); const c=__game.cam; return !!b && (Math.abs(b.x-c.x)>500 || Math.abs(b.y-c.y)>350);})()") && (await ev("window.__errs ? window.__errs.length : 0")) === 0);
  await ev("(()=>{__game.cam.x = 1500; __game.cam.y = 1500;})()");
  check('보스 정보 제공 (5라운드 보스 이름이 실제 등장한 보스와 같음, 30라운드는 암흑 기사단장, 50라운드는 마왕)', await ev("(()=>{const C=__game.CastleCore,S=__game.S; const r=C.bossInfo(S,5), b=S.enemies.find(e=>e.kind==='boss'); return !!r && !!b && r.name===b.bossName && C.bossInfo(S,30).name==='암흑 기사단장' && C.bossInfo(S,50).name==='마왕' && C.bossInfo(S,7)===null;})()"));
  const bmax = await ev("__game.S.enemies.find(e=>e.kind==='boss').max");
  await ev("(()=>{const b=__game.S.enemies.find(e=>e.kind==='boss'); b.hp = b.max / 2;})()"); await sleep(400);
  const barTxt = await ev("document.getElementById('bossHpTxt').textContent"), barW = await ev("document.getElementById('bossFill').style.width");
  check('보스 체력 바가 실제 체력(절반)을 따라감', barTxt.includes(Math.ceil(bmax / 2).toLocaleString('en-US') + ' / ' + bmax.toLocaleString('en-US')) && barW === '50%', barTxt + ' / 폭 ' + barW);

  // 3.7) 보스 위치 화살표: 화면 밖뿐 아니라 UI에 가려진 위치(위·아래·모서리)에서도 나온다
  await ev("document.getElementById('btnPause').click()");
  const place = async (px, py) => { await ev(`(()=>{const g=__game,b=g.S.enemies.find(e=>e.kind==='boss'); g.cam.x=1500; g.cam.y=1500; g.cam.zoom=1; const vw=innerWidth, vh=innerHeight; b.x=1500+(${px}-vw/2); b.y=1500+(${py}-vh/2);})()`); await sleep(350); return ev("JSON.stringify({a:__game.bossArrows, r:__game.uiRects()})").then(JSON.parse); };
  const VW = await ev('innerWidth'), VH = await ev('innerHeight');
  const insideUI = (x, y, rects) => rects.some(r => x > r.l && x < r.r && y > r.t && y < r.b);
  let o = await place(500, 330);
  check('보스가 UI에 안 가려진 화면 안이면 화살표 없음', o.a.length === 0, JSON.stringify(o.a));
  o = await place(VW - 100, 22); const bb = o.r.find(r => r.sel === '#bossbar');
  check('보스가 오른쪽 위 보스 바 뒤에 있으면 화살표 표시 (UI에 안 가려짐)', o.a.length === 1 && o.a[0].why === 'ui:#bossbar' && !insideUI(o.a[0].x, o.a[0].y, o.r), JSON.stringify(o.a[0]));
  o = await place(500, VH - 30); const un = o.r.find(r => r.sel === '#units');
  check('보스가 아래쪽 유닛 카드 뒤에 있으면 화살표 표시 (카드 위에, UI에 안 가려짐)', o.a.length === 1 && o.a[0].why === 'ui:#units' && o.a[0].y < un.t && !insideUI(o.a[0].x, o.a[0].y, o.r), JSON.stringify(o.a[0]));
  o = await place(60, 40);
  check('보스가 왼쪽 위 HUD 뒤에 있으면 화살표 표시', o.a.length === 1 && o.a[0].why === 'ui:#hud' && !insideUI(o.a[0].x, o.a[0].y, o.r), JSON.stringify(o.a[0]));
  o = await place(VW - 40, 40);
  check('보스가 오른쪽 위 구석(보스 바·버튼 열) 뒤에 있으면 화살표 표시', o.a.length === 1 && /ui:#(bossbar|tools)/.test(o.a[0].why) && !insideUI(o.a[0].x, o.a[0].y, o.r), JSON.stringify(o.a[0]));
  const tl = o.r.find(r => r.sel === '#tools'); o = await place(VW - 30, tl.b - 8); // 미니맵에서 충분히 떨어진 버튼 열 아래쪽
  check('보스가 오른쪽 버튼 열 뒤에 있으면 화살표 표시', o.a.length === 1 && o.a[0].why === 'ui:#tools' && !insideUI(o.a[0].x, o.a[0].y, o.r), JSON.stringify(o.a[0]));
  o = await place(-300, 350);
  check('화면 밖(왼쪽)이면 기존처럼 화살표, 왼쪽을 가리킴', o.a.length === 1 && o.a[0].why === 'offscreen' && Math.abs(Math.abs(o.a[0].angle) - Math.PI) < 0.5 && !insideUI(o.a[0].x, o.a[0].y, o.r), JSON.stringify(o.a[0]));
  o = await place(500, 200);
  check('UI 바로 옆이지만 보이는 위치면 화살표 없음', o.a.length === 0, JSON.stringify(o.a));
  await ev("document.getElementById('btnPause').click()");

  // 3.8) 일반 적 화살표도 보스와 같은 규칙: 화면 밖이거나 UI에 가려지면 안전 영역 가장자리에 작은 삼각형
  await open('?bot=1&nopick=1&seed=7&zoom=1', 800);
  await ev("(()=>{const g=__game; g.S.enemies.length=0; g.S.queue=[]; document.getElementById('btnPause').click();})()");
  const placeE = async (pts) => { await ev(`(()=>{const g=__game,C=g.CastleCore,S=g.S; S.enemies.length=0; g.cam.x=1500; g.cam.y=1500; g.cam.zoom=1; const vw=innerWidth, vh=innerHeight; for(const [px,py] of ${JSON.stringify(pts)}){ C.spawnEnemy(S,'grunt',1500+(px-vw/2),1500+(py-vh/2)); }})()`); await sleep(350); return ev("JSON.stringify({a:__game.enemyArrows, r:__game.uiRects()})").then(JSON.parse); };
  const VW2 = await ev('innerWidth'), VH2 = await ev('innerHeight');
  let oe = await placeE([[500, 330]]);
  check('UI에 안 가려진 화면 안의 일반 적은 삼각형 없음', oe.a.length === 0, JSON.stringify(oe.a));
  oe = await placeE([[500, VH2 - 24]]); const un2 = oe.r.find(r => r.sel === '#units');
  check('아래쪽 유닛 카드에 가려진 일반 적도 삼각형 표시 (카드 위, UI에 안 가려짐)', oe.a.length === 1 && oe.a[0].why === 'ui:#units' && oe.a[0].y < un2.t && !insideUI(oe.a[0].x, oe.a[0].y, oe.r), JSON.stringify(oe.a[0]));
  oe = await placeE([[60, 40]]);
  check('왼쪽 위 HUD에 가려진 일반 적도 삼각형 표시 (HUD에 안 가려짐)', oe.a.length === 1 && oe.a[0].why === 'ui:#hud' && !insideUI(oe.a[0].x, oe.a[0].y, oe.r), JSON.stringify(oe.a[0]));
  oe = await placeE([[500, 20]]);
  check('보스 바가 없을 때 위쪽 가운데의 일반 적은 가려지지 않아 삼각형 없음', oe.a.length === 0, JSON.stringify(oe.a));
  oe = await placeE([[-200, 300], [-220, 330], [-240, 310]]);
  check('화면 밖 같은 방향의 여러 적은 하나의 삼각형으로 묶임 (n=3)', oe.a.length === 1 && oe.a[0].n === 3 && oe.a[0].why === 'offscreen', JSON.stringify(oe.a));
  await ev("(()=>{__game.S.enemies.length=0;})()");

  // 3.9) 2막 전환 연출: 보스 처치 후 연출 → 건너뛰기 → 2막(새 길, 어두운 맵)
  await open('?bot=1&nopick=1&seed=7&zoom=1', 800);
  check('시작은 1막, 배경도 1막', await ev("__game.S.act === 1 && Scenery.act === 1"));
  await ev("(()=>{const S=__game.S; S.act = 2; S.cinematic = { name: '암흑 기사단장' };})()"); await sleep(900);
  check('2막 연출이 화면을 덮음 (제목에 보스 이름)', await ev("(()=>{const c=document.getElementById('cine'); return !c.classList.contains('hidden') && c.classList.contains('on') && document.getElementById('cineTitle').textContent.includes('암흑 기사단장');})()"));
  const ct0 = await ev('__game.S.t'); await sleep(600); check('연출 중에는 시간이 멈춤', (await ev('__game.S.t')) === ct0);
  await sleep(1300); check('연출 도중 화면이 가려지면 배경이 2막(새 길)으로 바뀜', await ev("Scenery.act === 2"));
  await ev("__game.skipCinematic()"); await sleep(400);
  check('건너뛰기 → 연출 종료, 시간 재개', await ev("__game.S.cinematic === null") && (await ev('__game.S.t')) > ct0, 't ' + ct0.toFixed(1) + '→' + (await ev('__game.S.t')).toFixed(1));
  await sleep(1100); check('연출 오버레이가 사라짐', await ev("document.getElementById('cine').classList.contains('hidden')"));
  check('HUD에 2막 표시', (await ev("document.getElementById('roundTxt').textContent")).includes('2막'), await ev("document.getElementById('roundTxt').textContent"));
  // 31라운드로 점프: 스폰 지점 8곳(포탈), 미니맵 길 8갈래
  await open('?bot=1&nopick=1&startRound=31&seed=7&zoom=1', 1200);
  check('startRound=31 → 2막, 스폰 지점 8곳, 배경도 2막', await ev("(()=>{const S=__game.S; return S.act===2 && S.spawnPts===8 && Scenery.act===2 && S.round===31;})()"), await ev("JSON.stringify({round:__game.S.round, pts:__game.S.spawnPts, act:__game.S.act})"));

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
