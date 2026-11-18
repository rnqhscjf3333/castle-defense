/* 성채방어 — 화면/입력/UI. 게임 규칙은 core.js(CastleCore)에만 있다. */
(function () {
  'use strict';
  const C = window.CastleCore, CFG = C.CFG, W = CFG.world.w, H = CFG.world.h, CX = CFG.world.cx, CY = CFG.world.cy;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const params = new URLSearchParams(location.search);
  const STEP = 1 / 30;

  let S = null;              // 게임 상태
  let running = false, paused = false, speed = 1;
  let cam = { x: CX, y: CY, zoom: 1 };
  let vw = 0, vh = 0, dpr = 1;
  const A2 = window.Audio2;
  const fx = [];             // 화면 효과 (게임 규칙과 무관)
  // 직업별 공격·치유 색: 전직마다 화살/베기/치유 광선의 색이 달라 구분된다. 치명타는 주황, 엘리트 적은 금·보라.
  const JOBC = { knight: '#7cc0ff', paladin: '#d6efff', fighter: '#ff9a4a', blademaster: '#ff4a3a', sniper: '#ffe14a', deadeye: '#ffb81a', ranger: '#6bffa3', stormarcher: '#4ae6ff',
    cleric: '#ffe28a', highcleric: '#fff4b8', bishop: '#8fd0ff', archbishop: '#c8a0ff' };
  const UNITC = { golem: '#c8a46a', hero: '#ffe14a', marksman: '#ffd23a', repeater: '#cfe3ff' };
  const atkColor = (job, ut) => (job && JOBC[job]) || UNITC[ut] || '#dfe9ff';
  let eliteToasts = 0, numFont = '', numFx = 0;             // 화면에 떠 있는 피해/치유 숫자 수 (상한을 두어 부하를 막는다)
  const fxPool = [];         // 쓰고 난 효과 객체를 재사용 (GC 부담을 줄인다)
  function addFx(o) {
    if (fx.length >= 300) return;
    const f = fxPool.length ? fxPool.pop() : {};
    f.k = o.k; f.x = o.x; f.y = o.y; f.tx = o.tx; f.ty = o.ty; f.t = o.t || 0; f.max = o.max; f.c = o.c; f.r = o.r; f.big = o.big; f.enemy = o.enemy; f.small = o.small; f.v = o.v; f.n = o.n; f.a = o.a;
    fx.push(f);
  }
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // ───────────── 크기/카메라 ─────────────
  let renderScale = 1; // 프레임이 느리면 자동으로 낮춘다 (adaptResolution)
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2) * renderScale;
    vw = window.innerWidth; vh = window.innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    clampCam();
  }
  let zoomFloor = 1; // 시작 연출 중에만 낮춰서 지도 전체보다 더 멀리서 시작한다
  function minZoom() { return Math.max(0.3, Math.min(vw / W, vh / H) * 0.9); }
  function clampCam() {
    cam.zoom = Math.max(minZoom() * zoomFloor, Math.min(1.8, cam.zoom));
    const hw = vw / 2 / cam.zoom, hh = vh / 2 / cam.zoom;
    cam.x = W > hw * 2 ? Math.max(hw, Math.min(W - hw, cam.x)) : W / 2;
    cam.y = H > hh * 2 ? Math.max(hh, Math.min(H - hh, cam.y)) : H / 2;
  }
  const toWorld = (sx, sy) => [(sx - vw / 2) / cam.zoom + cam.x, (sy - vh / 2) / cam.zoom + cam.y];
  function zoomAt(sx, sy, factor) {
    const [wx, wy] = toWorld(sx, sy);
    cam.zoom *= factor; clampCam();
    cam.x = wx - (sx - vw / 2) / cam.zoom; cam.y = wy - (sy - vh / 2) / cam.zoom; clampCam();
  }
  function centerOnCore() { cam.x = CX; cam.y = CY; clampCam(); }

  // ───────────── 입력: 드래그 이동 / 핀치 확대 ─────────────
  const ptrs = new Map();
  let drag = null, pinch = null;
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 일부 환경에서 지원 안 함 */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    else if (ptrs.size === 2) {
      drag = null;
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = pinch.zoom * (d / pinch.d), f = target / cam.zoom;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, f);
    } else if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) { cam.x = drag.cx - dx / cam.zoom; cam.y = drag.cy - dy / cam.zoom; clampCam(); }
    }
  });
  function endPtr(e) {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) drag = null;
    else if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: true }; }
  }
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0012)); }, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // 미니맵: 누르거나 끌면 이동

  // ───────────── UI ─────────────
  let toastT = null, bannerT = null;
  // 알림은 아래에서 쌓이고, 새 알림이 오면 이전 알림은 위로 밀려나며 흐려졌다가 사라진다
  function toast(t) {
    const box = $('toast'), d = document.createElement('div'); d.className = 'tmsg'; d.textContent = t;
    box.insertBefore(d, box.firstChild); // column-reverse: 첫 자식이 맨 아래
    requestAnimationFrame(() => d.classList.add('in'));
    for (let k = 1; k < box.children.length; k++) box.children[k].classList.add('old');
    const kill = el => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    setTimeout(() => kill(d), 2600);
    const live = Array.from(box.children).filter(c => !c.classList.contains('out')); // (이미 사라지는 중인 것은 제외 — 예전엔 이것 때문에 무한 반복이 났다)
    for (let k = live.length - 1; k >= 5; k--) kill(live[k]);
  }
  function banner(t, boss) { const el = $('banner'); el.textContent = t; el.classList.toggle('boss', !!boss); el.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), boss ? 3200 : 1900); }
  const DESC = { sword: '체력 높은 전위', archer: '멀리서 공격', priest: '아군을 치유' };
  const KEYS = ['1', '2', '3'];

  const ucards = {};
  C.UNIT_TYPES.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'btn panel ucard';
    b.innerHTML = '<div class="nm"><span class="nmt"></span><span class="cnt"></span></div><div class="ds"></div><div class="cost"></div><span class="delta"></span><div class="cdfill"></div><span class="key">' + KEYS[i] + '</span>';
    b.querySelector('.nmt').textContent = CFG.units[t].name;
    b.querySelector('.ds').textContent = DESC[t];
    b.addEventListener('click', () => doBuy(t));
    $('units').appendChild(b);
    ucards[t] = { el: b, cnt: b.querySelector('.cnt'), cost: b.querySelector('.cost'), cd: b.querySelector('.cdfill'), delta: b.querySelector('.delta') };
  });
  function doBuy(t) {
    if (!S || !running || paused) return;
    const r = C.buy(S, t);
    if (!r.ok) A2.play('deny');
    if (!r.ok) toast({ gold: '골드가 부족해요', cooldown: '잠시 후 다시 생산할 수 있어요', pop: '인구가 가득 찼어요 — 성채를 업그레이드하면 늘어납니다' }[r.reason] || '생산할 수 없어요');
  }
  // 성채 업그레이드 버튼 (소환 버튼 옆): 골드로 성채를 올리면 인구 상한·체력·공격력·사거리가 오르고 특정 레벨마다 대포가 늘어난다
  const castleBtn = document.createElement('button'); castleBtn.className = 'btn panel ucard castlecard';
  castleBtn.innerHTML = '<div class="nm"><span class="nmt">성채</span><span class="cnt"></span></div><div class="ds"></div><div class="cost"></div><span class="key">4</span>';
  castleBtn.addEventListener('click', () => doCastle());
  $('units').appendChild(castleBtn);
  const cb = { lv: castleBtn.querySelector('.cnt'), ds: castleBtn.querySelector('.ds'), cost: castleBtn.querySelector('.cost') };
  function doCastle() {
    if (!S || !running || paused) return;
    const r = C.upgradeCastle(S);
    if (!r.ok) { A2.play('deny'); toast(r.reason === 'max' ? '성채가 최대 레벨입니다' : '골드가 부족해요'); }
  }
  $('btnCenter').addEventListener('click', centerOnCore);
  const soundLabel = () => { $('btnSound').textContent = A2.state.muted ? '소리 끔' : '소리 켬'; };
  $('btnSound').addEventListener('click', () => { A2.init(); A2.toggleMute(); soundLabel(); }); soundLabel();
  $('btnPause').addEventListener('click', () => { paused = !paused; $('btnPause').textContent = paused ? '계속' : '일시정지'; });
  $('btnSpeed').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; $('btnSpeed').textContent = speed + '×'; });
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (S && S.cinematic) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') endCine(); return; }
    if (S && (S.cards.offer || S.jobs.offer)) { // 카드/전직 선택 중에는 1·2·3이 선택, R이 다시 뽑기(카드만)
      if (e.key === '1' || e.key === '2' || e.key === '3') choose(+e.key - 1);
      else if ((e.key === 'r' || e.key === 'R') && S.cards.offer && !S.jobs.offer) C.reroll(S);
      return;
    }
    if (e.key === '1' || e.key === '2' || e.key === '3') doBuy(C.UNIT_TYPES[+e.key - 1]);
    if (e.key === '4') doCastle();
    else if (e.key === 'u' || e.key === 'U') $('btnUp').click();
    else if (e.key === ' ') { e.preventDefault(); $('btnPause').click(); }
    else if (e.key === 'h' || e.key === 'H') centerOnCore();
    else if (e.key === 'm' || e.key === 'M') { A2.init(); A2.toggleMute(); soundLabel(); }
  });

  const last = {};
  function setText(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }
  const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  // 보스 체력 바 (화면 위 가운데): 이름, 체력 숫자, 현재 상태, 가진 패턴
  const PAT = { dash: '돌진', summon: '소환', artillery: '포격', shield: '방어막', rage: '분노', rush: '강습', blink: '순간이동', leap: '도약', siege: '원거리 포격' };
  const DBK = { stun: ['기절', '#ffe14a'], poison: ['중독', '#7be04a'], weak: ['공격력 감소', '#ff6b6b'], wound: ['치유 감소', '#c77dff'] };
  // 보스 등장 컷신: 모습·이름·대사가 잠깐 나왔다가 사라진다 (게임은 멈추지 않는다)
  let biTimer = 0, biRaf = 0;
  function showBossIntro(ev) {
    const el = $('bossIntro'), c2 = $('biCv').getContext('2d'); setText('biName', ev.name);
    $('biLine').textContent = ev.line ? '“' + ev.line + '”' : '';
    el.classList.remove('hidden'); clearTimeout(biTimer); cancelAnimationFrame(biRaf);
    const fake = { team: 'e', kind: 'boss', id: 7, x: 0, y: 0, r: ev.r || 30, look: ev.look, flash: 0, swing: 0 }, t0 = performance.now();
    (function loop() {
      const now = performance.now(); if (now - t0 > 2300) return;
      fake.x += 0.35; fake.swing = ((now - t0) % 1400) < 220 ? 0.2 : 0; fake.aim = 0;
      c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, 240, 240); const k = 44 / (ev.r || 30);
      c2.translate(120 - fake.x * k, 160); c2.scale(k, k); Figures.draw(c2, fake, now); biRaf = requestAnimationFrame(loop);
    })();
    biTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }
  // 길 열기: 라운드가 올라 길이 늘어나면 먼지 구름이 성채에서 바깥으로 퍼지며 새 길이 나타난다
  let pendingPortal = 0;
  function syncPortal() { if (!pendingPortal || currentOffer()) return; const n = pendingPortal; pendingPortal = 0; addFx({ k: 'ring', x: CX, y: CY, t: 0, max: 0.8, c: '#ff3b3b', big: true }); setTimeout(() => banner('붉은 포탈이 하나 더 열렸습니다 (' + n + '/8)'), 1600); }
  function syncRoads() {
    const want = S.spawnPts || 2, have = Scenery.roadCount; if (want === have) return;
    if (want > have && currentOffer()) return; // 선택지를 다 고른 뒤에 새 길을 보여준다
    Scenery.setRoadCount(want);
    if (want > have && S.round >= 2) {
      for (let i = have; i < want; i++) { const pts = Scenery.roadPts(i); for (let k = 0; k < pts.length; k += 2) { const p = pts[k]; for (let m = 0; m < 2; m++) addFx({ k: 'dust', x: p[0] + (Math.random() - 0.5) * 40, y: p[1] + (Math.random() - 0.5) * 30, t: -k * 0.05 - Math.random() * 0.25, max: 1.5 + Math.random() * 0.6, r: 20 + Math.random() * 18 }); } }
      A2.play('cine');
      setTimeout(() => banner('새로운 길이 열렸습니다'), 1600); // 라운드 안내 배너 다음에 알린다
    }
  }
  // 새로운 종류의 적이 처음 나오면 왼쪽 위에 모습·이름·능력을 잠깐 보여준다
  // 새 적 소개 창에서 보여줄 얼굴 위치 [가운데 x, 가운데 y, 얼굴 반지름] (그림 기준 좌표, 발 기준 위쪽이 -)
  const NE_FACE = { grunt: [0, -13, 7.5], shield: [-1, -19, 10], archer: [0, -13, 7.5], bomber: [0, -13, 7.5], shaman: [0, -16, 9.5], wolf: [-6, -6, 10], bat: [0, -12, 5.5], boar: [-6, -8, 15],
    spider: [0, -3, 11], ghost: [0, -8, 9], captain: [0, -17, 9], ironshield: [0, -25, 12.5], crossbow: [0, -17, 8], sapper: [0, -15, 8], warlock: [0, -17, 9.5], ogre: [0, -32, 16.5], direwolf: [-10, -5, 11], wyvern: [0, -18, 9], wraith: [0, -10, 10.5], brute: [0, -25, 13.5], boss: [0, -47, 25] };
  const neQ = []; let neBusy = false;
  function showNewEnemy(kind) { if (CFG.enemies[kind]) neQ.push(kind); if (!neBusy) nextNewEnemy(); }
  function nextNewEnemy() {
    const kind = neQ.shift(), el = $('newEnemy'); if (!kind) { neBusy = false; el.classList.add('hidden'); return; }
    neBusy = true; const cfg = CFG.enemies[kind], cv2 = $('neCv'), c2 = cv2.getContext('2d');
    setText('neName', cfg.name); setText('neDesc', cfg.desc || ''); el.classList.remove('hidden');
    const fake = { team: 'e', kind, id: 3, x: 0, y: 0, r: cfg.r, flash: 0, swing: 0, type: kind }; const t0 = performance.now();
    (function loop() {
      const now = performance.now(), el2 = now - t0; if (el2 > 5200) { el.classList.add('hidden'); setTimeout(nextNewEnemy, 600); return; }
      fake.x += 0.5; fake.y = 0; c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, 88, 88);
      const f = NE_FACE[kind] || [0, -14, 8], k = Math.min(6, 28 / f[2]); // 몸 전체가 아니라 얼굴이 가운데 오도록 맞춘다
      c2.translate(44 - (fake.x + f[0]) * k, 46 - f[1] * k); c2.scale(k, k); Figures.draw(c2, fake, now);
      requestAnimationFrame(loop);
    })();
  }
  // 엘리트: 발밑의 금빛 불꽃 고리 + 머리 위 왕관 표시
  function eliteGlow(e, now, z) {
    const pu = 0.5 + 0.5 * Math.sin(now * 0.008 + e.id);
    ctx.globalAlpha = 0.22 + 0.14 * pu; ctx.fillStyle = '#ffb21a'; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.5, e.r * 1.5, e.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.5, e.r * 1.5, e.r * 0.62, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  function enrageGlow(e, now, z) { // 40초 넘게 살아 격노한 적: 붉은 불길 고리
    const pu = 0.5 + 0.5 * Math.sin(now * 0.012 + e.id);
    ctx.globalAlpha = 0.25 + 0.2 * pu; ctx.strokeStyle = '#ff3b2a'; ctx.lineWidth = 2.2 / z; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.5, e.r * 1.25, e.r * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  function legendGlow(e, now, z) { // 전설 유닛: 일렁이는 빛 고리
    const pu = 0.5 + 0.5 * Math.sin(now * 0.007 + e.id), c = e.type === 'legendsword' ? '255,107,255' : '125,255,232';
    ctx.globalAlpha = 0.25 + 0.2 * pu; ctx.fillStyle = 'rgb(' + c + ')'; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.6, e.r * 1.9, e.r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = 'rgb(' + c + ')'; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.6, e.r * 1.9, e.r * 0.75, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  function eliteMark(e, z) {
    const y = e.y + Figures.headTop(e) - (e.hp < e.max ? 15 : 6), k = 1 / Math.max(0.7, z), w = 6 * k;
    ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 1 * k; ctx.beginPath();
    ctx.moveTo(e.x - w, y); ctx.lineTo(e.x - w, y - 5 * k); ctx.lineTo(e.x - w / 2, y - 2.5 * k); ctx.lineTo(e.x, y - 6.5 * k); ctx.lineTo(e.x + w / 2, y - 2.5 * k); ctx.lineTo(e.x + w, y - 5 * k); ctx.lineTo(e.x + w, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function updateBossBar() {
    const b = S.enemies.find(e => e.kind === 'boss'), el = $('bossbar');
    if (!b) { if (!el.hidden) el.hidden = true; return; }
    if (el.hidden) el.hidden = false;
    const pct = Math.max(0, b.hp / b.max * 100);
    $('bossFill').style.width = pct + '%';
    setText('bossName', b.bossName);
    setText('bossHpTxt', Math.ceil(b.hp).toLocaleString() + ' / ' + b.max.toLocaleString() + '  (' + Math.ceil(pct) + '%)');
    const shielded = b.shieldT > 0, rage = !!b.enraged;
    el.classList.toggle('shielded', shielded); el.classList.toggle('rage', rage && !shielded);
    let st = shielded ? '방어막 — 받는 피해 ' + Math.round(b.shieldRed * 100) + '% 감소' : b.dashT > 0 ? '돌진 중!' : rage ? '분노 — 더 빠르고 강해졌다' : '패턴: ' + Object.keys(b.abil).map(k => k === 'debuff' ? b.abil.debuff.map(d => DBK[d.kind][0]).join('·') : PAT[k]).join(' · ');
    if (b.grow > 1.04) st += '  |  공격력 ×' + b.grow.toFixed(1) + (b.grow >= CFG.balance.bossGrowMax - 0.01 ? ' (최대)' : ' ↑');
    setText('bossState', st);
  }
  function updateCastleBtn() {
    const lv = S.castle.lv, max = lv >= CFG.castle.max, cost = C.castleCost(S), full = C.popCount(S) >= C.popCap(S);
    const key = lv + '|' + (max ? 0 : cost) + '|' + S.core.cannons + '|' + (S.gold >= cost) + '|' + full;
    if (cb.key === key) return; cb.key = key;
    cb.lv.textContent = 'Lv.' + lv; cb.ds.textContent = max ? '최대 레벨 · 인구 제한 없음' : '인구 +' + C.popGain(lv + 1) + ' · 공격·체력↑' + (CFG.castle.cannonLv.includes(lv + 1) ? ' · 대포 +1' : '');
    cb.cost.textContent = max ? 'MAX' : cost + 'G'; castleBtn.classList.toggle('off', max || S.gold < cost); castleBtn.classList.toggle('need', full && !max);
  }
  function updateHud() {
    const c = S.core;
    const bi = C.bossInfo(S, S.round), nb = C.bossInfo(S, S.round + 1), rt = $('roundTxt');
    setText('roundTxt', '라운드 ' + Math.max(1, S.round) + (S.round > C.MAX_ROUND ? ' · 무한' : ' / ' + C.MAX_ROUND));
    rt.classList.toggle('boss', !!bi); rt.classList.toggle('nextboss', !bi && !!nb); rt.classList.toggle('act2', S.act === 2 && !bi && !nb);
    updateBossBar(); updateCastleBtn();
    setText('timeTxt', fmtTime(S.t));
    setText('hpTxt', String(Math.ceil(c.hp)));
    setText('gold', String(Math.floor(S.gold)));
    { const sp = C.specialCount(S); setText('unitTxt', C.popCount(S) + (C.popCap(S) < 1e8 ? '/' + C.popCap(S) : '') + (sp ? ' · 특수 ' + sp : '')); } // 인구/상한 + 특수 유닛은 따로
    setText('killTxt', String(S.kills));
    const pct = Math.max(0, c.hp / c.max * 100);
    const f = $('hpfill'); f.style.width = pct + '%'; f.style.background = pct > 50 ? 'var(--ok)' : pct > 25 ? 'var(--gold)' : 'var(--danger)';
    for (const t of C.UNIT_TYPES) {
      const u = ucards[t], cost = C.unitCostOf(S, t), cd = S.buyCd[t] > 0 ? S.buyCd[t] / CFG.units[t].buyCd : 0;
      if (u.last !== undefined && cost > u.last) { // 가격이 오르면 숫자가 붉게 튀고 +N이 떠오른다
        u.cost.classList.remove('up'); void u.cost.offsetWidth; u.cost.classList.add('up');
        u.delta.textContent = '+' + (cost - u.last); u.delta.classList.remove('show'); void u.delta.offsetWidth; u.delta.classList.add('show');
      }
      u.last = cost;
      let n = 0; for (const x of S.units) if (!x.dead && x.type === t) n++; if (u.n !== n) { u.n = n; u.cnt.textContent = '×' + n; }
      u.cost.textContent = cost + 'G';
      u.cd.style.height = (cd * 100) + '%';
      const cant = S.gold < cost || C.popCount(S) >= C.popCap(S);
      u.el.classList.toggle('off', cant);
    }
  }

  // ───────────── 업그레이드 선택창 / 강화 목록 ─────────────
  const CAT_NAME = { unit: '유닛 강화', core: '성채 강화', summon: '특수 소환' };
  const RAR_NAME = { common: '일반', rare: '희귀', epic: '영웅', legend: '전설' };
  let shownOffer = null, shownKind = null;
  // ── 선택창 이펙트 (등급: common 0 · rare 1 · epic 2 · legend 3) ──
  const RANK = { common: 0, rare: 1, epic: 2, legend: 3 }, RCOL = ['#9fb0cc', '#7cc0ff', '#ffd166', '#ff9bff'];
  const rankOf = (c, job) => job ? 2 : RANK[c.rar] || 0;
  function sparks(x, y, n, color, dist, dur) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = dist * (0.4 + Math.random() * 0.8), s = document.createElement('i'); s.className = 'pspark';
      s.style.cssText = 'left:' + x + 'px;top:' + y + 'px;--c:' + (i % 3 === 2 && color === RCOL[3] ? '#7dffe8' : color) + ';--dx:' + Math.cos(a) * d + 'px;--dy:' + Math.sin(a) * d + 'px;--d:' + (dur * (0.7 + Math.random() * 0.6)) + 's';
      document.body.appendChild(s); setTimeout(() => s.remove(), dur * 1400);
    }
  }
  function flash(color, a) { const f = document.createElement('div'); f.className = 'pflash'; f.style.cssText = '--c:' + color + ';--a:' + a; document.body.appendChild(f); setTimeout(() => f.remove(), 800); }
  function ring(x, y, color, s) { const r = document.createElement('div'); r.className = 'pring'; r.style.cssText = 'left:' + x + 'px;top:' + y + 'px;--c:' + color + ';--s:' + s; document.body.appendChild(r); setTimeout(() => r.remove(), 800); }
  function revealFx(box, list, job, reroll) {
    let top = 0;
    [...box.children].forEach((b, i) => {
      const rk = rankOf(list[i], job); top = Math.max(top, rk);
      if (rk >= 1) setTimeout(() => { const r = b.getBoundingClientRect(); sparks(r.left + r.width / 2, r.top + r.height / 2, [0, 6, 12, 26][rk], RCOL[rk], 40 + rk * 35, 0.8); if (rk >= 2) ring(r.left + r.width / 2, r.top + r.height / 2, RCOL[rk], 8 + rk * 3); }, 200 + i * (reroll ? 70 : 90));
    });
    if (reroll) A2.play('reroll'); if (top >= 1) setTimeout(() => A2.play('reveal' + top), 260);
    if (top >= 2) flash(RCOL[top], top === 3 ? 0.5 : 0.22);
  }
  function pickFx(i, job) {
    const b = $('pickCards').children[i]; if (!b) return;
    const list = job ? S.jobs.offer && S.jobs.offer.list : S.cards.offer, rk = rankOf(list && list[i] || {}, job), r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, Z = 0.84; // #pickBox는 zoom .84
    const g = b.cloneNode(true); g.classList.remove('enter', 'flip'); g.classList.add('picked'); g.style.cssText = 'zoom:' + Z + ';left:' + r.left / Z + 'px;top:' + r.top / Z + 'px;width:' + r.width / Z + 'px;height:' + r.height / Z + 'px';
    document.body.appendChild(g); setTimeout(() => g.remove(), 800);
    ring(cx, cy, RCOL[rk], 6 + rk * 4); sparks(cx, cy, [10, 18, 30, 52][rk], RCOL[rk], 70 + rk * 40, 0.75);
    if (rk >= 1) flash(RCOL[rk], [0, 0.12, 0.25, 0.5][rk]);
  }
  const currentOffer = () => (S && S.jobs.offer) ? { kind: 'job', list: S.jobs.offer.list, ref: S.jobs.offer } : (S && S.cards.offer) ? { kind: 'card', list: S.cards.offer, ref: S.cards.offer } : null;
  function syncPicker() {
    const cur = S && S.cinematic ? null : currentOffer(), ref = cur ? cur.ref : null;
    if (ref === shownOffer) { if (cur && cur.kind === 'card') updateReroll(); return; }
    const wasCard = shownKind === 'card'; shownOffer = ref; shownKind = cur ? cur.kind : null;
    const el = $('picker');
    if (!cur) { el.classList.add('hidden'); return; }
    const job = cur.kind === 'job', box = $('pickCards'); box.innerHTML = '';
    if (job) {
      const rw = S.jobs.offer.reward;
      $('pickTitle').textContent = S.jobs.offer.boss + (rw ? ' 처치! 보스 보상' : ' 처치! 전직');
      $('pickSub').textContent = rw ? '강력한 용병이나 강화 효과 중 하나를 고르세요' : '직업 하나를 골라 강화해요 — 이미 전직한 직업은 한 단계 더 강해져요';
    } else {
      $('pickTitle').textContent = '라운드 ' + (S.round - 1) + ' 돌파 · 업그레이드 선택';
      $('pickSub').textContent = S.cards.boss ? '보스 격파 보상 — 희귀 이상 카드가 한 장 이상 나와요' : '카드를 한 장 고르세요';
    }
    $('btnReroll').style.display = job ? 'none' : '';
    $('pickHint').textContent = job ? '1·2·3 선택 · 고르는 동안 시간이 멈춰요' : '1·2·3 선택 · R 다시 뽑기 · 고르는 동안 시간이 멈춰요';
    cur.list.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = job ? 'pcard job' : 'pcard rar-' + c.rar + ' cat-' + c.cat;
      const tags = document.createElement('div'); tags.className = 'tags';
      const cat = document.createElement('span'); cat.className = 'cat'; cat.textContent = job ? (c.reward ? '보스 보상' : c.tier + '단계 전직') : CAT_NAME[c.cat];
      const rar = document.createElement('span'); rar.className = 'rar'; rar.textContent = job ? (c.reward ? '영웅' : c.className) : RAR_NAME[c.rar];
      tags.append(cat, rar);
      b.append(tags);
      if (job) {
        const hist = c.reward ? null : C.describeJobs(S).find(j => j.type === c.type);
        if (hist) { const fr = document.createElement('div'); fr.className = 'from'; fr.textContent = c.className + ' › ' + hist.names.join(' › '); b.append(fr); }
      }
      const pn = document.createElement('div'); pn.className = 'pn'; pn.textContent = c.name;
      const pd = document.createElement('div'); pd.className = 'pd'; pd.textContent = c.desc;
      const pk = document.createElement('span'); pk.className = 'pk'; pk.textContent = String(i + 1);
      b.append(pn, pd, pk);
      b.style.setProperty('--i', i); b.classList.add(!job && wasCard && !el.classList.contains('hidden') ? 'flip' : 'enter');
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });
    revealFx(box, cur.list, job, !job && wasCard && !el.classList.contains('hidden'));
    if (!job) updateReroll();
    el.classList.remove('hidden');
  }
  function updateReroll() { const b = $('btnReroll'), n = S.cards.rerolls; b.textContent = '다시 뽑기 (' + n + ')'; b.disabled = n <= 0; }
  function choose(i) { if (!S) return; if (currentOffer() && !$('picker').classList.contains('hidden')) pickFx(i, !!S.jobs.offer); if (S.jobs.offer) C.pickJob(S, i); else if (S.cards.offer) C.pickCard(S, i); }
  $('btnReroll').addEventListener('click', () => { if (S) C.reroll(S); });

  function renderUpgrades() {
    const el = $('upl'); if (!S) return;
    const list = C.describeTaken(S), jobs = C.describeJobs(S);
    el.innerHTML = '';
    if (!list.length && !jobs.length) { el.textContent = '아직 선택한 강화가 없어요'; return; }
    for (const j of jobs) { const row = document.createElement('div'); row.className = 'it epic'; const a = document.createElement('span'); a.textContent = j.className + ' 전직'; const b = document.createElement('b'); b.textContent = j.names.join(' › '); row.append(a, b); el.appendChild(row); }
    for (const it of list) {
      const row = document.createElement('div'); row.className = 'it ' + it.rar;
      const a = document.createElement('span'); a.textContent = it.name;
      const b = document.createElement('b'); b.textContent = 'Lv ' + it.lv;
      row.append(a, b); el.appendChild(row);
    }
  }
  $('btnUp').addEventListener('click', () => { const el = $('upl'); el.hidden = !el.hidden; if (!el.hidden) renderUpgrades(); });

  // ───────────── 이벤트 → 화면 효과 ─────────────
  // 이벤트 → 효과음 (위치가 있는 소리는 확대·거리에 따라 크기가 달라진다)
  const SHOT_SND = { a: 'shotA', ea: 'shotEA', c: 'shotC', t: 'shotT', b: 'shotB', es: 'shotES' };
  function playEv(ev) {
    switch (ev.type) {
      case 'shot': A2.play(SHOT_SND[ev.c] || 'shotA', ev.x, ev.y); break;
      case 'melee': A2.play('sword', ev.x, ev.y); break;
      case 'kill': A2.play(ev.boss ? 'bigBoom' : 'kill', ev.x, ev.y); break;
      case 'udead': A2.play('udead', ev.x, ev.y); break;
      case 'bossShock': A2.play('bigBoom', ev.x, ev.y); break;
      case 'bossBlink': A2.play('cast', ev.x1, ev.y1); break;
      case 'heroSkill': A2.play(ev.kind === 'marksman' ? 'shotB' : 'bigBoom', ev.x, ev.y); break;
      case 'heal': A2.play('heal', ev.tx, ev.ty); break;
      case 'spawn': A2.play('spawn', ev.x, ev.y); break;
      case 'chain': A2.play('chain', ev.x, ev.y); break;
      case 'boom': A2.play(ev.big ? 'bigBoom' : 'boom', ev.x, ev.y); break;
      case 'picked': A2.play('card'); break;
      case 'promote': A2.play('job'); break;
      case 'bossSpawn': A2.alarm(); showBossIntro(ev); break;
      case 'bossDash': A2.play('dash', ev.x, ev.y); break;
      case 'bossShield': A2.play('shield', ev.x, ev.y); break;
      case 'bossSummon': A2.play('summon', ev.x, ev.y); break;
      case 'bossRage': A2.play('rage', ev.x, ev.y); break;
      case 'priceUp': A2.play('buy'); break;
      case 'crit': A2.play('crit', ev.x, ev.y); break;
      case 'bossCast': A2.play('cast', ev.x, ev.y); break;
      case 'debuffHit': A2.play(ev.kind === 'stun' ? 'stun' : 'debuff', ev.x, ev.y); break;
      case 'roundClear': A2.play('clear'); break;
      case 'act2': A2.play('cine'); break;
      case 'endlessStart': A2.play('cine'); break;
      case 'castleUp': A2.play('cine'); break;
      case 'over': A2.play(ev.win ? 'win' : 'lose'); break;
    }
  }
  function handleEvents() {
    for (const ev of C.drainEvents(S)) {
      playEv(ev);
      if (ev.type === 'banner') banner(ev.text, ev.boss);
      else if (ev.type === 'shot') { /* 소리만 있는 이벤트 */ }
      else if (ev.type === 'crit') addFx({ k: 'crit', x: ev.x, y: ev.y, t: 0, max: 0.4, c: '#ffd23f' });
      else if (ev.type === 'bossCast') { addFx({ k: 'zone', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.warn, c: DBK[ev.kind][1] }); toast('보스가 ' + DBK[ev.kind][0] + ' 광역기를 시전!'); }
      else if (ev.type === 'debuffHit') addFx({ k: 'boom', x: ev.x, y: ev.y, r: ev.r, t: 0, max: 0.4, big: false, enemy: true, c: DBK[ev.kind][1] });
      else if (ev.type === 'roundClear') banner('라운드 ' + ev.round + ' 클리어!');
      else if (ev.type === 'bossWipe') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.9, c: '#ffffff', big: true }); toast('보스 처치! 남은 적이 모두 쓰러졌어요'); }
      else if (ev.type === 'kill') { addFx({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: ev.boss ? 0.8 : 0.3, c: ev.boss ? '#c77dff' : '#ff8a5c', big: ev.boss }); }
      else if (ev.type === 'udead') addFx({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: 0.4, c: '#8fb7ff' });
      else if (ev.type === 'heal') { addFx({ k: 'beam', x: ev.x, y: ev.y - 11, tx: ev.tx, ty: ev.ty - 7, t: 0, max: ev.aoe ? 0.3 : 0.45, c: ev.enemy ? '#ffb86b' : (ev.job && JOBC[ev.job]) || '#6bffa3', small: !!ev.aoe }); if (!ev.aoe) addFx({ k: 'heal', x: ev.tx, y: ev.ty, t: 0, max: 0.5 }); }
      else if (ev.type === 'spawn') { addFx({ k: 'summon', x: ev.x, y: ev.y, t: 0, max: 0.8 }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.55, c: '#8fd0ff', big: true }); }
      else if (ev.type === 'chain') { addFx({ k: 'line', x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, t: 0, max: 0.25, c: ev.small ? '#b9f5c8' : '#9ad0ff', small: ev.small }); }
      else if (ev.type === 'boom') { addFx({ k: 'boom', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.big ? 0.6 : 0.3, big: ev.big, enemy: ev.enemy }); }
      else if (ev.type === 'num') {
        const zz = cam.zoom; if (numFx >= 70 || (zz < 0.45 && !ev.crit) || Math.abs(ev.x - cam.x) > vw / 2 / zz + 40 || Math.abs(ev.y - cam.y) > vh / 2 / zz + 40) continue;
        if (fx.length >= 300) continue; numFx++; addFx({ k: 'num', x: ev.x + (Math.random() - 0.5) * 14, y: ev.y, t: 0, max: ev.crit ? 0.95 : 0.75, v: Math.round(ev.v), n: ev.heal ? 'h' : ev.crit ? 'c' : ev.team === 'u' ? 'u' : 'e' });
      }
      else if (ev.type === 'newEnemy') showNewEnemy(ev.kind);
      else if (ev.type === 'castleUp') { addFx({ k: 'ring', x: CX, y: CY, t: 0, max: 0.9, c: '#ffd166', big: true, r: 150 }); addFx({ k: 'ring', x: CX, y: CY, t: -0.15, max: 0.8, c: '#ffffff', r: 110 }); addFx({ k: 'summon', x: CX, y: CY + 30, t: 0, max: 0.9 }); toast('성채 Lv.' + ev.lv + (ev.pop < 1e8 ? ' — 인구 상한 ' + ev.pop : ' — 최대 레벨: 인구 제한 없음') + (ev.cannons > 1 ? ' · 대포 ' + ev.cannons + '문' : '')); }
      else if (ev.type === 'melee') { if (fx.length < 220 && cam.zoom > 0.4) addFx({ k: 'slash', x: ev.tx, y: ev.ty, a: Math.atan2(ev.ty - ev.y, ev.tx - ev.x), t: 0, max: 0.2, c: atkColor(ev.job, ev.ut) }); }
      else if (ev.type === 'emelee') { if (fx.length < 220 && cam.zoom > 0.4) { addFx({ k: 'slash', x: ev.tx, y: ev.ty, a: Math.atan2(ev.ty - ev.y, ev.tx - ev.x), t: 0, max: 0.26, c: '#ff4adf', big: true }); } }
      else if (ev.type === 'bossShock') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.55, c: '#ffcf40', r: ev.r, big: true }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: -0.08, max: 0.5, c: '#ff5a3a', r: ev.r * 0.7 }); for (let i = 0; i < 5; i++) addFx({ k: 'dust', x: ev.x + (Math.random() - 0.5) * ev.r, y: ev.y + (Math.random() - 0.5) * ev.r * 0.6, t: -Math.random() * 0.1, max: 0.9, r: 16 }); }
      else if (ev.type === 'bossBlink') { for (const [x, y] of [[ev.x0, ev.y0], [ev.x1, ev.y1]]) { addFx({ k: 'ring', x, y, t: 0, max: 0.6, c: '#c77dff', big: true }); addFx({ k: 'summon', x, y, t: 0, max: 0.7 }); } toast('보스가 순간이동했습니다!'); }
      else if (ev.type === 'bossLeap') { addFx({ k: 'zone', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.air, c: '#ff9a3a' }); toast('보스가 도약합니다!'); }
      else if (ev.type === 'portalOpen') pendingPortal = ev.n;
      else if (ev.type === 'bossSlam') addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.4, c: '#ff5a3a', r: ev.r, big: true });
      else if (ev.type === 'enrage') toast('적이 오래 살아남아 격노합니다! 점점 더 강해져요');
      else if (ev.type === 'elite') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.6, c: '#ffd84a', big: true }); if (eliteToasts < 3) { eliteToasts++; toast('엘리트 ' + CFG.enemies[ev.kind].name + ' 출현! 훨씬 강하고 큽니다'); } }
      else if (ev.type === 'poisonPool') addFx({ k: 'pool', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.dur });
      else if (ev.type === 'reward') toast('보상 획득: ' + ev.name);
      else if (ev.type === 'heroSkill') {
        if (ev.kind === 'marksman') addFx({ k: 'beam', x: ev.x, y: ev.y - 11, tx: ev.tx, ty: ev.ty - 7, t: 0, max: 0.4, c: '#ffe14a' });
        else { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.55, c: ev.kind === 'hero' ? '#ffe14a' : '#c8a46a', big: true }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: -0.08, max: 0.5, c: '#ffffff' }); }
      }
      else if (ev.type === 'revive') { addFx({ k: 'heal', x: ev.x, y: ev.y, t: 0, max: 0.8 }); toast('아군이 부활했어요'); }
      else if (ev.type === 'picked') { toast(ev.name + ' 획득'); renderUpgrades(); }
      else if (ev.type === 'notice') toast(ev.text);
      else if (ev.type === 'espawn') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: ev.boss ? 0.9 : 0.45, c: '#ff5a5a', big: ev.boss }); }
      else if (ev.type === 'priceUp') toast('소환으로 모든 유닛 가격이 올랐어요');
      else if (ev.type === 'promote') {
        banner(ev.className + ' → ' + ev.name + ' 전직!'); renderUpgrades();
        for (const u of S.units) if (u.type === ev.unitType && fx.length < 300) addFx({ k: 'ring', x: u.x, y: u.y, t: 0, max: 0.7, c: '#ffd166' });
      }
      else if (ev.type === 'bossDash') addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.5, c: '#ffb21a' });
      else if (ev.type === 'bossShield') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.6, c: '#8fd8ff' }); toast('보스가 방어막을 둘렀어요'); }
      else if (ev.type === 'bossSummon') { for (let k = 0; k < 3; k++) addFx({ k: 'ring', x: ev.x, y: ev.y, t: -k * 0.12, max: 0.7, c: '#ff6b6b', big: true }); toast('보스가 ' + (CFG.enemies[ev.kind] ? CFG.enemies[ev.kind].name : '졸개') + ' ' + ev.n + '마리를 불렀어요!'); }
      else if (ev.type === 'bossRage') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.8, c: '#ff3b1a' }); banner(ev.name + ' 분노!'); }
      else if (ev.type === 'over') { if (ev.win) showEnd(true); else startDefeat(); }
    }
  }

  // ───────────── 렌더링 ─────────────
  const COL = {
    bg: '#0f131b', grid: 'rgba(120,140,180,.07)', border: '#3a4660', ring: 'rgba(255,107,107,.18)',
    sword: '#5aa9ff', archer: '#6bdc8b', priest: '#ffe08a', grunt: '#ff6b6b', shield: '#c0504d', boss: '#c77dff',
    golem: '#8aa0c8', hero: '#ffd166', turret: '#ffb86b',
  };
  function poly(x, y, r, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath();
  }
  function hpBar(e) {
    if (e.hp >= e.max) return;
    const w = Math.max(20, e.r * 2.4), x = e.x - w / 2, y = e.y + Figures.headTop(e) - 8;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = e.team === 'u' ? '#6bdc8b' : '#ff7a7a'; ctx.fillRect(x, y, w * Math.max(0, e.hp / e.max), 4);
  }
  // 보스 발밑 효과: 분노 = 붉은 기운, 돌진 = 속도선
  function bossAura(e, now, z) {
    if (e.enraged) { ctx.globalAlpha = 0.25 + 0.1 * Math.sin(now * 0.015); ctx.fillStyle = '#ff2a1a'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 8, e.r * 1.5, e.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (e.dashT > 0 && e._ang !== undefined) {
      ctx.strokeStyle = 'rgba(255,200,120,.7)'; ctx.lineWidth = 3 / z; ctx.lineCap = 'round';
      for (let k = -2; k <= 2; k++) { const ox = Math.cos(e._ang + Math.PI / 2) * k * 8, oy = Math.sin(e._ang + Math.PI / 2) * k * 8; ctx.beginPath(); ctx.moveTo(e.x + ox - Math.cos(e._ang) * 18, e.y + oy - Math.sin(e._ang) * 18); ctx.lineTo(e.x + ox - Math.cos(e._ang) * (60 + Math.abs(k) * 6), e.y + oy - Math.sin(e._ang) * (60 + Math.abs(k) * 6)); ctx.stroke(); }
    }
  }
  // 상태이상 표시: 머리 위 아이콘 (기절=별, 중독=초록 방울, 공격력 감소=붉은 화살표, 치유 감소=보라 십자)
  function statusMarks(e, now, z) {
    const top = e.y + Figures.headTop(e); let x = e.x - ((+!!(e.stunT > 0) + +!!(e.poisonT > 0) + +!!(e.weakT > 0) + +!!(e.woundT > 0)) - 1) * 6, y = top - 8; const s = 1 / Math.max(0.7, z) * 1.05;
    if (e.stunT > 0) { ctx.fillStyle = '#ffe14a'; for (let i = 0; i < 3; i++) { const a = now * 0.008 + i * 2.09; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * 9 * s, top - 4 + Math.sin(a) * 3 * s, 2.4 * s, 0, 7); ctx.fill(); } x += 0; }
    if (e.poisonT > 0) { ctx.fillStyle = '#7be04a'; ctx.beginPath(); ctx.arc(x, y, 3.2 * s, 0, 7); ctx.fill(); ctx.fillRect(x - 0.8 * s, y - 7 * s, 1.6 * s, 3 * s); x += 12 * s; }
    if (e.weakT > 0) { ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 3 * s); ctx.lineTo(x + 4 * s, y - 3 * s); ctx.lineTo(x, y + 4 * s); ctx.fill(); x += 12 * s; }
    if (e.woundT > 0) { ctx.fillStyle = '#c77dff'; ctx.fillRect(x - 1.5 * s, y - 4 * s, 3 * s, 8 * s); ctx.fillRect(x - 4 * s, y - 1.5 * s, 8 * s, 3 * s); }
  }
  const drawList = [], byY = (p, q) => p.y - q.y, LITE_AT = 140;
  let liteMode = false, drawnCount = 0;
  function drawWorld(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, vw, vh);
    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, (vw / 2 - cam.x * z) * dpr, (vh / 2 - cam.y * z) * dpr);
    const x0 = Math.max(0, cam.x - vw / 2 / z), x1 = Math.min(W, cam.x + vw / 2 / z), y0 = Math.max(0, cam.y - vh / 2 / z), y1 = Math.min(H, cam.y + vh / 2 / z);
    // 맵 바닥: 풀밭, 흙길, 돌바닥 광장, 덤불·바위·꽃 (조각으로 캐시)
    const p0 = performance.now();
    Scenery.drawGround(ctx, x0, y0, x1, y1);
    // 적 출현 포탈: 길 위의 붉은 룬 원 (화면 바로 밖에서 적이 나타난다)
    const angs = C.spawnAngles(S.spawnPts || 2);
    for (const a of angs) { const px = CX + Math.cos(a) * C.SPAWN_RING, py = CY + Math.sin(a) * C.SPAWN_RING; if (px > x0 - 60 && px < x1 + 60 && py > y0 - 40 && py < y1 + 40) Scenery.drawPortal(ctx, px, py, now); }
    for (const a of C.extraAngles(S.extraPts || 0)) { const px = CX + Math.cos(a) * C.EXTRA_RING, py = CY + Math.sin(a) * C.EXTRA_RING; if (px > x0 - 60 && px < x1 + 60 && py > y0 - 40 && py < y1 + 40) Scenery.drawPortal(ctx, px, py, now); }

    const c = S.core;
    // 성채 사거리
    ctx.strokeStyle = 'rgba(90,169,255,.18)'; ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.arc(c.x, c.y, c.range, 0, Math.PI * 2); ctx.stroke();
    // 보급 오라 범위
    if (S.aura.on) {
      ctx.fillStyle = 'rgba(107,220,139,.05)'; ctx.beginPath(); ctx.arc(c.x, c.y, S.aura.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(107,220,139,.35)'; ctx.lineWidth = 1.5 / z; ctx.setLineDash([10 / z, 8 / z]); ctx.stroke(); ctx.setLineDash([]);
    }
    // 성채 (포신이 적을 향해 돌고, 체력이 줄면 금·연기·불)
    Scenery.drawCastle(ctx, c, now);

    const p1 = performance.now(); ema('ground', p1 - p0);
    // 유닛 + 적: 아래쪽에 있는 개체가 앞에 오도록 y 순서로 그린다
    // 화면 밖 개체는 그리지 않고(컬링), 적이 많거나 멀리서 볼 때는 간단한 그림을 쓴다(LOD)
    const mx = 100, vx0 = cam.x - vw / 2 / z - mx, vx1 = cam.x + vw / 2 / z + mx, vy0 = cam.y - vh / 2 / z - mx, vy1 = cam.y + vh / 2 / z + mx;
    const all = drawList; all.length = 0; let nEn = 0;
    for (let i = 0; i < S.units.length; i++) { const u = S.units[i]; if (u.x > vx0 && u.x < vx1 && u.y > vy0 && u.y < vy1) all.push(u); }
    for (let i = 0; i < S.enemies.length; i++) { const e = S.enemies[i]; if (e.x > vx0 && e.x < vx1 && e.y > vy0 && e.y < vy1) { all.push(e); nEn++; } }
    Scenery.visibleTrees(x0, y0, x1, y1, all);
    const lite = nEn > LITE_AT || z < 0.5; liteMode = lite; drawnCount = all.length;
    all.sort(byY);
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (e._tree) { Scenery.drawTree(ctx, e, now); continue; }
      if (e.team === 'e' && e.enr && !lite) enrageGlow(e, now, z);
      if (e.team === 'u' && e.type && e.type.startsWith('legend')) legendGlow(e, now, z);
      if (e.elite) eliteGlow(e, now, z);
      if (lite && e.team === 'e' && e.kind !== 'boss') { Figures.drawLite(ctx, e); if (e.elite) eliteMark(e, z); continue; }
      if (e.kind === 'boss') bossAura(e, now, z);
      Figures.draw(ctx, e, now);
      if (e.elite) eliteMark(e, z);
      if (e.team === 'u' && (e.stunT > 0 || e.poisonT > 0 || e.weakT > 0 || e.woundT > 0)) statusMarks(e, now, z);
      if (e.kind === 'boss' && e.shieldT > 0) { ctx.globalAlpha = 0.28 + 0.12 * Math.sin(now * 0.012); ctx.fillStyle = '#8fd8ff'; ctx.beginPath(); ctx.arc(e.x, e.y - 6, e.r * 1.7, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.9; ctx.strokeStyle = '#d8f2ff'; ctx.lineWidth = 2.5 / z; ctx.stroke(); ctx.globalAlpha = 1; }
      if (e.hp < e.max || e.kind === 'boss') hpBar(e);
    }
    const p2 = performance.now(); ema('ents', p2 - p1);
    // 투사체: 지면 그림자 + 높이만큼 위로 뜬 몸체 (포물선). 화살은 날아가는 방향으로 기울어진다.
    for (const sh of S.shots) {
      if (sh.aoe) { // 보스 포격: 떨어질 지점을 미리 경고
        const pp = Math.min(1, sh.p), tx = sh.t.x, ty = sh.t.y;
        ctx.globalAlpha = 0.12 + 0.18 * pp; ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(tx, ty, sh.aoe, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(now * 0.02); ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2.5 / z; ctx.setLineDash([8 / z, 6 / z]); ctx.beginPath(); ctx.arc(tx, ty, sh.aoe, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(tx, ty, sh.aoe * (1 - pp), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sh.x, sh.y, 4, 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      const px = sh.x, py = sh.y - sh.h, ang = Math.atan2(sh.vy - sh.vh, sh.vx);
      if (sh.color === 'c') { // 성채 포탄
        ctx.fillStyle = '#2b3446'; ctx.strokeStyle = '#9fb4d6'; ctx.lineWidth = 1 / z; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(px - 1.5, py - 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
      } else if (sh.color === 'es') { // 보스 포탄
        ctx.globalAlpha = 0.45; ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#3a2418'; ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else { // 화살 / 포탑 볼트
        const len = sh.color === 't' ? 9 : 14, jc = sh.job && JOBC[sh.job];
        let col = sh.color === 'ea' ? '#c0503a' : sh.color === 't' ? '#ffb86b' : jc || (sh.color === 'a' && sh.job === null ? '#e8e0cc' : '#e8e0cc');
        if (sh.color === 'ea' && sh.elite) col = '#ff4adf'; // 엘리트 적의 화살
        if (sh.crit) col = '#ff8a1a'; // 치명타 화살
        if (sh.crit || (sh.elite && sh.color === 'ea')) { ctx.globalAlpha = 0.4; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, sh.crit ? 7 : 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
        const hx = px + Math.cos(ang) * len * 0.5, hy = py + Math.sin(ang) * len * 0.5, tx2 = px - Math.cos(ang) * len * 0.5, ty2 = py - Math.sin(ang) * len * 0.5;
        ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx2, ty2); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = sh.color === 'ea' ? '#5a1f18' : '#cfd6e4'; ctx.beginPath(); ctx.moveTo(hx + Math.cos(ang) * 4, hy + Math.sin(ang) * 4); ctx.lineTo(hx + Math.cos(ang + 2.5) * 3, hy + Math.sin(ang + 2.5) * 3); ctx.lineTo(hx + Math.cos(ang - 2.5) * 3, hy + Math.sin(ang - 2.5) * 3); ctx.closePath(); ctx.fill();
      }
    }
    // 화면 효과
    numFont = '';
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; if (f.t < 0) continue; // 시작 지연 중
      const p = f.t / f.max;
      if (f.k === 'burst') { ctx.globalAlpha = 1 - p; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, (f.big ? 20 : 8) + p * (f.big ? 50 : 16), 0, Math.PI * 2); ctx.fill(); }
      else if (f.k === 'slash') { // 근접 타격 궤적: 전직·유닛별 색 (엘리트 적은 분홍)
        const w = f.big ? 4.5 : 3, r0 = f.big ? 20 : 15; ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = w * (1 - p * 0.6) / z * 1.1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(f.x - Math.cos(f.a) * 6, f.y - Math.sin(f.a) * 6, r0 * (0.7 + p * 0.5), f.a - 0.95, f.a + 0.95); ctx.stroke(); ctx.globalAlpha = 1;
      }
      else if (f.k === 'pool') { // 독 웅덩이: 남아 있는 동안 초록 독기가 일렁인다
        const fade = Math.min(1, (f.max - f.t) / 1.2, f.t / 0.3 + 0.2), pu = 0.5 + 0.5 * Math.sin(now * 0.006);
        ctx.globalAlpha = (0.2 + 0.08 * pu) * fade; ctx.fillStyle = '#66d63a'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = '#8dff5a'; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.97 + 0.03 * pu), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#b8ff8a'; for (let i = 0; i < 6; i++) { const a = i * 1.047 + now * 0.0004, rr = f.r * (0.3 + 0.5 * ((i * 0.37 + f.t * 0.3) % 1)), by = (f.t * 18 + i * 9) % 30; ctx.globalAlpha = 0.55 * fade * (1 - by / 30); ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr - by, 2.2, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      else if (f.k === 'dust') { // 먼지 구름: 퍼지며 떠오르다 사라진다
        const a = (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8) * 0.5, rr = f.r * (0.6 + p * 1.4);
        ctx.globalAlpha = a; ctx.fillStyle = '#b79b72'; ctx.beginPath(); ctx.arc(f.x, f.y - p * 22, rr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#d8c3a0'; ctx.beginPath(); ctx.arc(f.x - rr * 0.25, f.y - p * 26 - rr * 0.2, rr * 0.65, 0, Math.PI * 2); ctx.fill();
      }
      else if (f.k === 'summon') { // 소환: 빛기둥 + 바닥 마법진 + 떠오르는 불꽃
        const a = 1 - p, h = 70 * Math.min(1, p * 4) * (1 - p * 0.3), w = 11 * (1 - p * 0.6);
        const g = ctx.createLinearGradient(0, f.y - h, 0, f.y + 4); g.addColorStop(0, 'rgba(140,210,255,0)'); g.addColorStop(1, 'rgba(190,235,255,' + (0.75 * a).toFixed(2) + ')');
        ctx.fillStyle = g; ctx.fillRect(f.x - w, f.y - h, w * 2, h + 4);
        ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.ellipse(f.x, f.y + 3, 16 * (0.6 + p * 0.6), 7 * (0.6 + p * 0.6), 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#e8f7ff'; for (let i = 0; i < 6; i++) { const an = i * 1.047 + p * 2, rx = Math.cos(an) * 12, ry = -p * 46 - (i % 3) * 6; ctx.fillRect(f.x + rx - 1, f.y + ry, 2, 2); }
      }
      else if (f.k === 'ring') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = (f.big ? 4 : 2) / z; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + p * (f.big ? 60 : 24), 0, Math.PI * 2); ctx.stroke(); }
      else if (f.k === 'line') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = (f.small ? 1.5 : 3) / z; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
      else if (f.k === 'beam') { // 사제 치유 광선: 누가 누구를 치유하는지 보이도록 굵은 빛줄기 + 끝점 광채
        const a = 1 - p, w = (f.small ? 2.2 : 4) / z, pulse = 0.75 + 0.25 * Math.sin(now * 0.03);
        ctx.lineCap = 'round'; ctx.globalAlpha = a * 0.35; ctx.strokeStyle = f.c; ctx.lineWidth = w * 3.2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke();
        ctx.globalAlpha = a * pulse; ctx.strokeStyle = '#eafff1'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke();
        ctx.globalAlpha = a * 0.55; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.tx, f.ty, (f.small ? 6 : 11) / z * (0.6 + 0.4 * p), 0, Math.PI * 2); ctx.fill(); ctx.lineCap = 'butt';
      }
      else if (f.k === 'zone') { // 보스 광역 상태이상 예고 범위
        const pu = 0.5 + 0.5 * Math.sin(now * 0.02); ctx.globalAlpha = 0.16 + 0.14 * pu; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = f.c; ctx.lineWidth = 3 / z; ctx.setLineDash([10 / z, 7 / z]); ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.5; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - p), 0, Math.PI * 2); ctx.stroke();
      }
      else if (f.k === 'num') { // 피해/치유 숫자: 적 피해(노랑) · 치명타(주황, 크게) · 아군 피해(빨강) · 치유(초록)
        const crit = f.n === 'c', big = crit ? 18 : 12, pop = crit ? 1 + 0.5 * Math.max(0, 1 - p * 6) : 1;
        ctx.globalAlpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1; const fs = Math.round(big * pop / z * 10) / 10;
        if (numFont !== fs + f.n) { ctx.font = (crit ? '900 ' : '700 ') + fs + 'px system-ui, sans-serif'; numFont = fs + f.n; }
        ctx.textAlign = 'center'; const yy = f.y - 8 / z - p * (crit ? 34 : 24) / z, txt = (f.n === 'h' ? '+' : '') + f.v + (crit ? '!' : '');
        if (numFx < 40) { ctx.lineWidth = 3 / z; ctx.strokeStyle = 'rgba(20,10,10,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(txt, f.x, yy); }
        ctx.fillStyle = f.n === 'c' ? '#ff9a1f' : f.n === 'e' ? '#fff0a8' : f.n === 'u' ? '#ff5a5a' : '#6bff9a'; ctx.fillText(txt, f.x, yy);
      }
      else if (f.k === 'crit') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = 2.5 / z; const rr = (6 + p * 16) / z * 1.2; ctx.beginPath(); for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + Math.PI / 4; ctx.moveTo(f.x + Math.cos(an) * rr * 0.4, f.y - 10 + Math.sin(an) * rr * 0.4); ctx.lineTo(f.x + Math.cos(an) * rr, f.y - 10 + Math.sin(an) * rr); } ctx.stroke(); }
      else if (f.k === 'boom') { ctx.globalAlpha = (1 - p) * 0.5; ctx.fillStyle = f.enemy ? '#ff5a3a' : f.big ? '#ff9f43' : '#ffd166'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * p), 0, Math.PI * 2); ctx.fill(); }
      else if (f.k === 'heal') { ctx.globalAlpha = 1 - p; ctx.fillStyle = '#9dffb0'; const y = f.y - 12 - p * 16; ctx.fillRect(f.x - 1.5, y - 5, 3, 10); ctx.fillRect(f.x - 5, y - 1.5, 10, 3); }
      ctx.globalAlpha = 1;
    }
    ema('rest', performance.now() - p2);
    // 2막: 어두운 밤 (성채 주변만 횃불로 밝다)
    if (S.act === 2 && !S.cinematic) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); Scenery.drawNight(ctx, vw, vh, (CX - cam.x) * z + vw / 2, (CY - cam.y) * z + vh / 2, z, now); }
    // 무한 모드(51라운드~): 하늘이 붉게 물들고 점점 짙어진다
    if (S.round > C.MAX_ROUND) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const k = Math.min(1, (S.round - C.MAX_ROUND) / 12), pulse = 0.5 + 0.5 * Math.sin(now / 700);
      ctx.fillStyle = 'rgba(170,10,10,' + (0.2 + 0.12 * k + 0.04 * pulse).toFixed(3) + ')'; ctx.fillRect(0, 0, vw, vh);
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      g.addColorStop(0, 'rgba(60,0,0,0)'); g.addColorStop(1, 'rgba(60,0,0,' + (0.45 + 0.2 * k).toFixed(2) + ')'); ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    // 화면 밖/UI에 가려진 위험 방향 표시
    drawEdgeWarnings(now);
  }
  // 화면 위에서 UI가 차지하는 영역들(HUD, 미니맵, 버튼 열, 보스 바, 하단 유닛 카드)의 실제 크기
  const bossArrows = [], enemyArrows = [];
  let uiCache = [], uiAge = 999;
  // 프레임마다 DOM 크기를 읽으면 레이아웃을 강제하므로 약 4프레임에 한 번만 다시 읽는다
  function uiRects(force) {
    if (!force && uiAge < 4) { uiAge++; return uiCache; }
    uiAge = 0; const out = [];
    for (const sel of ['#hud', '#modeBar', '#tools', '#bossbar', '#units']) {
      const el = document.querySelector(sel); if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) out.push({ sel, l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    uiCache = out; return out;
  }
  // 화면 밖이거나 UI에 가려진 적의 위치를 가장자리 화살표로 알려준다 (보스는 크게+이름/거리, 일반 적은 작은 삼각형을 방향별로 묶어서).
  // 보스는 몸이 커서 UI 근처(여백 안)에만 와도 가려진 것으로 본다.
  function drawEdgeWarnings(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bossArrows.length = 0; enemyArrows.length = 0;
    const z = cam.zoom, R = uiRects(), find = sel => R.find(r => r.sel === sel);
    const units = find('#units');
    // 화살표를 놓을 수 있는 안전 영역: UI를 피한 가운데 구역
    const sx0 = 12, sx1 = vw - 12, sy0 = 22, sy1 = (units ? units.t : vh) - 10;
    const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2, hw = Math.max(40, (sx1 - sx0) / 2 - 34), hh = Math.max(30, (sy1 - sy0) / 2 - 34);
    const inUI = (x, y, m) => R.some(r => x > r.l - m && x < r.r + m && y > r.t - m && y < r.b + m);
    const spot = a => { // 안전 영역 가장자리 위치. 모서리의 HUD·미니맵 등에 겹치면 중심 쪽으로 밀어서 UI를 벗어난다.
      const dx = Math.cos(a), dy = Math.sin(a), t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
      let px = cx + dx * t, py = cy + dy * t;
      for (let i = 0; i < 80 && inUI(px, py, 12); i++) { px -= dx * 5; py -= dy * 5; }
      return [px, py, dx, dy];
    };
    const hidden = (sx, sy, pad) => { // [화면 밖인가, 가린 UI]
      if (sx < 0 || sx > vw || sy < 0 || sy > vh) return { outside: true };
      const c = R.find(r => sx > r.l - pad && sx < r.r + pad && sy > r.t - pad && sy < r.b + pad); return c ? { covered: c } : null;
    };
    const bins = new Map();
    for (const e of S.enemies) {
      const sx = (e.x - cam.x) * z + vw / 2, sy = (e.y - cam.y) * z + vh / 2, isBoss = e.kind === 'boss';
      const hd = hidden(sx, sy, isBoss ? 30 + 45 * z : 10 + 8 * z);
      if (!hd) continue;
      const a = Math.atan2(sy - cy, sx - cx);
      if (isBoss) { // 보스: 크고 눈에 띄는 화살표 + 이름/거리
        const [px, py, dx, dy] = spot(a), pulse = 1 + 0.18 * Math.sin(now * 0.012);
        bossArrows.push({ x: px, y: py, angle: a, why: hd.outside ? 'offscreen' : 'ui:' + hd.covered.sel });
        ctx.save(); ctx.translate(px, py); ctx.rotate(a); ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ff3b4a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-10, -17); ctx.lineTo(-3, 0); ctx.lineTo(-10, 17); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        const dist = Math.round(Math.hypot(Math.max(0, Math.abs(e.x - cam.x) - vw / 2 / z), Math.max(0, Math.abs(e.y - cam.y) - vh / 2 / z))); // 화면 끝에서 보스까지의 거리
        ctx.font = '700 13px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 4;
        const lx = px - dx * 38, ly = py - dy * 38 + 4, label = e.bossName + ' · ' + dist;
        ctx.strokeText(label, lx, ly); ctx.fillText(label, lx, ly); ctx.textAlign = 'left';
      } else { // 일반 적: 방향별로 묶어 작은 삼각형 (많을수록 커지고 진해짐)
        const k = Math.round(a / 0.35), b = bins.get(k) || { a: 0, n: 0, why: hd.outside ? 'offscreen' : 'ui:' + hd.covered.sel }; b.a = a; b.n++; bins.set(k, b);
      }
    }
    for (const b of bins.values()) {
      const [px, py] = spot(b.a), sz = 8 + Math.min(8, b.n * 0.4);
      enemyArrows.push({ x: px, y: py, angle: b.a, n: b.n, why: b.why });
      ctx.globalAlpha = Math.min(0.9, 0.35 + b.n * 0.05); ctx.fillStyle = '#ff6b6b'; poly(px, py, sz, 3, b.a); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  // ───────────── 2막 전환 연출 ─────────────
  // 1막 마지막 보스를 쓰러뜨리면: 화면이 어두워지고 → 길이 늘어나고(바닥을 새로 그림) → 마왕의 군세가 온다는 문구 → 2막 시작. 건너뛰기 가능.
  let cine = null;
  const CINES = { endless: { end: 10.6, title: '마왕 처치!', steps: [
    { t: 1.6, text: '마왕을 물리쳤다!\n쓰러진 병사들은 돌아오지 않지만…' },
    { t: 4.8, text: '하지만 마왕의 몸에서 나온 붉은 기운이\n더 강한 적들을 부르고 있다' },
    { t: 8.0, text: '끝없는 적들에게서\n최대한 오래 살아남자' } ] } };
  const CINE_STEPS = [
    { t: 1.6, text: '하늘이 어두워진다…' },
    { t: 3.7, text: '숨겨진 길이 열렸다' },
    { t: 5.8, text: '마왕의 군세가 몰려온다\n50라운드까지 버텨라' },
  ];
  function cineSetText(txt) { const el = $('cineText'); el.classList.remove('show'); setTimeout(() => { if (!cine) return; el.textContent = txt; el.classList.add('show'); }, 380); }
  function startCine(name, kind) {
    cine = { t0: performance.now(), step: -1, swapped: kind === 'endless', kind };
    $('cineTitle').textContent = name + ' 처치!'; $('cineText').textContent = ''; $('cineText').classList.remove('show'); $('cineTitle').classList.remove('show');
    $('cine').classList.remove('hidden'); requestAnimationFrame(() => { $('cine').classList.add('on'); $('cineTitle').classList.add('show'); });
  }
  function stepCine(now) {
    const t = (now - cine.t0) / 1000;
    if (!cine.swapped && t > 1.3) { cine.swapped = true; Scenery.setAct(2, true); } // 화면이 완전히 가려진 뒤 길/바닥을 새로 만든다
    const steps = cine.kind === 'endless' ? CINES.endless.steps : CINE_STEPS;
    while (cine.step + 1 < steps.length && t >= steps[cine.step + 1].t) { cine.step++; cineSetText(steps[cine.step].text); }
    if (t > (cine.kind === 'endless' ? CINES.endless.end : 7.9)) endCine();
  }
  function endCine() {
    if (!cine) return;
    if (!cine.swapped) Scenery.setAct(2, true);
    cine = null; C.endCinematic(S);
    $('cine').classList.remove('on'); setTimeout(() => { if (!cine) $('cine').classList.add('hidden'); }, 950);
  }
  $('cineSkip').addEventListener('click', endCine);
  $('cine').addEventListener('click', e => { if (e.target === $('cine')) endCine(); });

  // ───────────── 시작/종료 ─────────────
  function newGame() {
    openingSeen = true;
    const seed = params.get('seed') ? +params.get('seed') : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const mm = params.get('mode') || store.get('cd-mode'), mode = mm === 'free' || mm === 'hold' ? mm : 'normal';
    S = C.createGame(seed, mode); S.captureEvents = true; Net.begin(S); syncModeBar();
    fx.length = 0; numFx = 0; paused = false; speed = 1; shownOffer = null; $('picker').classList.add('hidden'); renderUpgrades();
    $('btnPause').textContent = '일시정지'; $('btnSpeed').textContent = '1×';
    for (const k in last) delete last[k];
    for (const t of C.UNIT_TYPES) { ucards[t].last = undefined; ucards[t].n = undefined; }
    cine = null; $('cine').classList.add('hidden'); $('cine').classList.remove('on'); Scenery.setAct(1, false);
    const sr = +params.get('startRound'); if (sr > 1) C.jumpToRound(S, sr); // 디버그: 해당 라운드로 바로 시작
    centerOnCore();
    // 디버그: ?warp=초 → 봇이 미리 진행 (스크린샷/점검용)
    if (params.get('bot')) startBot();
    running = true;
  }
  let botT = 0;
  function startBot() { window.__bot = true; }
  function botAct() {
    if (S.cinematic && !params.get('nopick')) C.endCinematic(S);
    if (S.jobs.offer && !params.get('nopick')) C.pickJob(S, 0);
    if (S.cards.offer && !params.get('nopick')) C.pickCard(S, 0);
    botT += STEP; if (botT < 0.4) return; botT = 0;
    for (const t of ['sword', 'archer', 'sword', 'archer', 'priest']) { const r = C.buy(S, t); if (r.reason === 'pop') { C.upgradeCastle(S); break; } }
  }

  // ───────────── 패배 연출 ─────────────
  let defeating = false;
  function startDefeat() {
    if (defeating) return; defeating = true; running = true; // 효과가 계속 흘러가도록
    const d = $('defeat'); d.classList.remove('hidden'); requestAnimationFrame(() => d.classList.add('on'));
    $('cv').classList.add('defeating'); document.body.classList.add('defeating'); A2.play('bigBoom'); A2.play('rage');
    for (let i = 0; i < 9; i++) setTimeout(() => {
      const a = Math.random() * 6.283, r = Math.random() * 70, x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
      addFx({ k: 'ring', x, y, t: 0, max: 0.7, c: i % 2 ? '#ffb347' : '#ff4a2a', r: 70 + Math.random() * 60, big: true }); addFx({ k: 'ring', x, y, t: -0.08, max: 0.55, c: '#ffffff', r: 40 });
      for (let k = 0; k < 6; k++) addFx({ k: 'dust', x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 30, t: 0, max: 1.2, r: 16 + Math.random() * 16 });
      A2.play(i % 3 ? 'boom' : 'bigBoom');
    }, 150 + i * 260);
    setTimeout(() => { const d2 = $('defeat'); d2.classList.remove('on'); setTimeout(() => d2.classList.add('hidden'), 400); $('cv').classList.remove('defeating'); document.body.classList.remove('defeating'); defeating = false; showEnd(false); }, 3600);
  }
  function showEnd(win) {
    running = false;
    const best = +(store.get('cd-best') || 0);
    const reached = S.round;
    if (reached > best) store.set('cd-best', String(reached));
    $('ovTitle').textContent = win ? '방어 성공!' : '성채가 무너졌어요';
    $('ovBody').innerHTML = '<div class="stat"><div><b>' + reached + '</b>도달 라운드</div><div><b>' + S.kills + '</b>처치</div><div><b>' + fmtTime(S.t) + '</b>시간</div></div>'
      + '<p>최고 기록: ' + Math.max(best, reached) + '라운드</p>'
      + '<div id="regbox"><input id="nameIn" maxlength="12" placeholder="닉네임 (최대 12자)" autocomplete="off"><button id="regBtn">랭킹 등록</button></div><div id="rankbox"></div>';
    $('go').textContent = '다시 시작'; $('btnRank').classList.add('hidden');
    $('overlay').classList.remove('hidden');
    Net.sendLog(S, 'end');
    const ended = S, myScore = Net.scoreOf(S.win, S.round, S.kills, S.t);
    $('nameIn').value = Net.name();
    const reg = async () => {
      const name = $('nameIn').value; $('regBtn').disabled = true; $('regBtn').textContent = '등록 중…';
      await Net.submit(ended, name); $('regbox').remove(); showRank(myScore);
    };
    $('regBtn').addEventListener('click', reg);
    $('nameIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') reg(); });
    $('nameIn').addEventListener('keyup', e => e.stopPropagation());
    showRank(null);
  }
  // 랭킹 표: 서버가 있으면 서버 순위, 없으면 이 브라우저의 개인 기록
  async function showRank(mine) {
    const box = $('rankbox'); if (!box) return; box.innerHTML = '<p>랭킹 불러오는 중…</p>';
    const r = await Net.top(10); if (!$('rankbox')) return;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let hit = false;
    const rows = r.list.map((e, i) => { const me = mine != null && !hit && e.score === mine; if (me) hit = true; return '<tr' + (me ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td>' + esc(e.name) + (e.mode === 'free' ? ' <span class="mtag">자유</span>' : e.mode === 'hold' ? ' <span class="mtag">수비</span>' : '') + '</td><td>' + (e.win ? '클리어' : e.round + '라운드') + '</td><td>' + fmtTime(e.time) + '</td></tr>'; }).join('');
    box.innerHTML = '<div class="rankhead">' + (r.server ? '전체 랭킹' : (Net.configured ? '서버에 연결하지 못해 내 기록만 표시' : '내 기록 (서버 미설정)')) + '</div>'
      + (rows ? '<table class="rank"><tr><th>#</th><th>이름</th><th>기록</th><th>시간</th></tr>' + rows + '</table>' : '<p>아직 기록이 없어요.</p>');
  }
  // 모드 전환: 왼쪽 위 라운드 표시 아래에서 언제든 바꿀 수 있다 (기본: 성채 주변 방어 / 자유: 범위 안의 적을 멀리까지 추격)
  function syncModeBar() { if (!S) return; for (const b of document.querySelectorAll('#modeBar button')) b.classList.toggle('on', b.dataset.mode === S.mode); }
  for (const b of document.querySelectorAll('#modeBar button')) b.addEventListener('click', () => {
    if (!S) return; S.mode = ['free', 'hold'].includes(b.dataset.mode) ? b.dataset.mode : 'normal'; store.set('cd-mode', S.mode); syncModeBar();
    toast(S.mode === 'hold' ? '수비 모드: 유닛이 자기 자리를 지키며 사거리 안의 적만 공격합니다' : S.mode === 'free' ? '자유 모드: 유닛이 범위 안의 적을 멀리까지 쫓아가 공격합니다' : '기본 모드: 유닛이 성채 주변을 지키며 싸웁니다');
  });
  $('btnRank').addEventListener('click', () => { $('ovBody').innerHTML = '<div id="rankbox"></div>'; showRank(null); $('btnRank').classList.add('hidden'); $('go').textContent = '게임 시작'; });
  // 플레이 도중 창을 닫거나 숨길 때도 기록을 남긴다 (개선 자료)
  const abandon = () => { if (S && running && !S.over) Net.sendLog(S, 'abandon', true); };
  window.addEventListener('pagehide', abandon);
  document.addEventListener('visibilitychange', () => { if (document.hidden) abandon(); });
  // ───────────── 오프닝 만화 컷신: 컷을 터치할 때마다 다음 컷이 효과와 함께 나타난다 ─────────────
  let openingSeen = false, comicOn = false;
  function playOpening(done) {
    const el = $('comic'), imgs = Array.from(el.querySelectorAll('.cp')); let idx = 0, over = false; comicOn = true;
    const wait = Promise.all(imgs.map(im => im.complete ? 1 : new Promise(r => { im.onload = im.onerror = r; })));
    document.body.classList.add('comicOn'); imgs.forEach(im => im.classList.remove('in')); el.classList.remove('hidden', 'out', 'shake', 'rumble'); $('comicHint').textContent = '화면을 터치하면 다음 컷 ▶';
    const flash = (c) => { const f = $('comicFlash'); f.className = ''; void f.offsetWidth; f.className = c; };
    const fxOf = [null,
      () => { A2.play('page'); },
      () => { A2.play('page'); flash('go'); },
      () => { A2.play('rumble'); el.classList.add('rumble'); flash('red'); setTimeout(() => el.classList.remove('rumble'), 1300); },
      () => { A2.play('horn'); el.classList.add('shake'); flash('go'); const l = $('comicLines'); l.className = ''; void l.offsetWidth; l.className = 'go'; setTimeout(() => el.classList.remove('shake'), 600); $('comicHint').textContent = '화면을 터치하면 시작 ▶'; },
    ];
    const show = () => { idx++; const im = imgs[idx - 1]; im.classList.add('in'); fxOf[idx] && fxOf[idx](); if (matchMedia('(max-aspect-ratio: 1/1)').matches) setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), 80); };
    const finish = () => { if (over) return; over = true; comicOn = false; document.body.classList.remove('comicOn'); el.classList.add('out'); setTimeout(() => { el.classList.add('hidden'); el.classList.remove('out'); }, 600); el.removeEventListener('click', advance); window.removeEventListener('keydown', key, true); done(); };
    const advance = e => { if (e && e.target && e.target.id === 'comicSkip') return; if (idx < 4) show(); else finish(); };
    const key = e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); advance(); } else if (e.key === 'Escape') { e.stopPropagation(); finish(); } };
    el.addEventListener('click', advance); window.addEventListener('keydown', key, true);
    $('comicSkip').onclick = e => { e.stopPropagation(); finish(); };
    wait.then(() => { if (!over) show(); });
  }
  $('go').addEventListener('click', () => {
    if ($('go').dataset.back) { delete $('go').dataset.back; $('overlay').classList.add('hidden'); return; }
    A2.init(); $('overlay').classList.add('hidden');
    if (!openingSeen && !params.get('nointro')) { openingSeen = true; playOpening(() => newGame()); } else newGame();
  });


  // ───────────── 타이틀 화면 · 시작 연출 ─────────────
  let intro = null;
  function startIntro() { // 구름이 걷히면서 멀리서 성채로 확대된다
    const cl = $('clouds'); cl.innerHTML = '';
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + 0.4, d = i % 2 ? 14 : 26, c = document.createElement('i'); c.style.cssText = '--x:' + (Math.cos(a) * d).toFixed(1) + 'vmax;--y:' + (Math.sin(a) * d * 0.7).toFixed(1) + 'vmax;width:' + (46 + (i * 7) % 24) + 'vmax'; cl.appendChild(c); }
    cl.classList.remove('hidden'); document.body.classList.add('introOn');
    intro = { t0: performance.now(), z1: Math.max(cam.zoom, 0.9) }; zoomFloor = 0.5; cam.zoom = minZoom() * 0.5; centerOnCore(); A2.play('horn');
    setTimeout(() => cl.classList.add('hidden'), 3800);
  }
  function stepIntro(now) {
    const t = (now - intro.t0) / 1000, k = Math.min(1, Math.max(0, (t - 0.5) / 3.0)), e = 1 - Math.pow(1 - k, 3);
    { const z0 = minZoom() * 0.5; cam.zoom = z0 + (intro.z1 - z0) * e; } centerOnCore();
    if (t > 3.7) { intro = null; zoomFloor = 1; clampCam(); document.body.classList.remove('introOn'); }
  }
  const titleEl = $('title');
  function showTitle() { titleEl.classList.remove('hidden', 'out', 'menu'); $('tMsg').textContent = ''; $('tVer').textContent = 'v' + ((window.CD_CONFIG || {}).VERSION || ''); }
  function openMenu() { if (titleEl.classList.contains('menu')) return; titleEl.classList.add('menu'); A2.init(); A2.play('ui'); }
  function startFromTitle() {
    A2.init(); titleEl.classList.add('out'); setTimeout(() => titleEl.classList.add('hidden'), 520);
    if (!openingSeen && !params.get('nointro')) { openingSeen = true; playOpening(() => { newGame(); startIntro(); }); } else { newGame(); startIntro(); }
  }
  titleEl.addEventListener('click', e => { if (!titleEl.classList.contains('menu')) openMenu(); });
  window.addEventListener('keydown', e => { if (!titleEl.classList.contains('hidden') && !titleEl.classList.contains('out')) { if (!titleEl.classList.contains('menu')) { e.preventDefault(); e.stopPropagation(); openMenu(); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); startFromTitle(); } } }, true);
  $('mStart').addEventListener('click', e => { e.stopPropagation(); startFromTitle(); });
  $('mHow').addEventListener('click', e => { e.stopPropagation(); $('howto').classList.remove('hidden'); });
  $('howClose').addEventListener('click', () => $('howto').classList.add('hidden'));
  $('mRank').addEventListener('click', e => { e.stopPropagation(); $('ovTitle').textContent = '랭킹'; $('ovBody').innerHTML = '<div id="rankbox"></div>'; $('go').textContent = '닫기'; $('go').dataset.back = '1'; $('btnRank').classList.add('hidden'); $('overlay').classList.remove('hidden'); showRank(null); });
  $('mQuit').addEventListener('click', e => { e.stopPropagation(); window.close(); setTimeout(() => { $('tMsg').textContent = '브라우저에서는 직접 종료할 수 없어요. 탭이나 창을 닫아 주세요.'; }, 150); });

  // ───────────── 메인 루프 ─────────────
  let prev = performance.now(), acc = 0;
  const perf = { tick: 0, hud: 0, draw: 0, mini: 0, ground: 0, ents: 0, rest: 0, frame: 0, dt: 16.7 };
  let slowT = 0, fastT = 0, perfEl = null, perfT = 0;
  // 프레임 간격이 계속 길면(렉) 캔버스 해상도를 낮추고, 여유가 생기면 되돌린다
  function adaptResolution(rawMs) {
    if (!running || paused || document.visibilityState !== 'visible' || rawMs > 200) { slowT = fastT = 0; return; }
    perf.dt += (rawMs - perf.dt) * 0.08;
    if (perf.dt > 27) { slowT += rawMs; fastT = 0; } else if (perf.dt < 19) { fastT += rawMs; slowT = 0; } else { slowT = fastT = 0; }
    if (slowT > 2500 && renderScale > 0.55) { renderScale = Math.max(0.55, +(renderScale - 0.2).toFixed(2)); slowT = 0; resize(); }
    else if (fastT > 10000 && renderScale < 1) { renderScale = Math.min(1, +(renderScale + 0.2).toFixed(2)); fastT = 0; resize(); }
  }
  const ema = (k, v) => { perf[k] += (v - perf[k]) * 0.1; };
  function updateMood() {
    const boss = S.enemies.some(e => e.kind === 'boss');
    A2.setMood(S.act === 2 || S.round > C.MAX_ROUND ? (boss ? 'dark2' : 'dark') : (boss ? 'boss' : 'calm'));
  }
  // 프레임 하나에서 오류가 나도 게임 루프가 멈추지 않게 하고, 오류는 서버로 보낸다
  let errStreak = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    try { frameBody(now); errStreak = 0; }
    catch (err) {
      Net.sendError(err && err.message, err && err.stack, 'frame');
      if (++errStreak === 1) toast('오류가 발생했어요. 기록을 보냈습니다');
      if (errStreak >= 90 && running) { // 계속 같은 오류면 멈추고 안내
        running = false; $('ovTitle').textContent = '오류가 발생했어요';
        $('ovBody').innerHTML = '<p>죄송해요, 게임에 문제가 생겼어요. 오류 기록은 개발자에게 전송했습니다.<br>다시 시작해 주세요.</p>'; $('overlay').classList.remove('hidden'); errStreak = 0;
      }
    }
  }
  function frameBody(now) {
    if (intro) stepIntro(now);
    const f0 = performance.now();
    if (running && !paused && document.visibilityState === 'visible' && now - prev < 1000) Net.lag(now - prev);
    adaptResolution(now - prev);
    const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
    if (S && running && !paused && !intro) {
      acc += dt * speed;
      let n = 0;
      const k0 = performance.now();
      while (acc >= STEP && n < 8 * speed) { if (window.__bot) botAct(); C.tick(S, STEP); acc -= STEP; n++; if (S.over) break; }
      ema('tick', performance.now() - k0);
      if (acc > STEP * 8) acc = 0;
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt * speed; if (f.t >= f.max) { if (f.k === 'num') numFx--; fx[i] = fx[fx.length - 1]; fx.pop(); fxPool.push(f); } } // 끝난 효과는 풀로 돌려보낸다
    }
    if (S) {
      if (S.cinematic && !cine) startCine(S.cinematic.name, S.cinematic.kind);
      if (cine) stepCine(now);
      else if (Scenery.act !== S.act) Scenery.setAct(S.act, true); // 불러오기/재시작/점프 시 막에 맞는 배경으로
      if (!cine && S.act === 1) syncRoads();
      syncPortal();
      const h0 = performance.now(); Net.sample(S, perf, renderScale); A2.setView({ x: cam.x, y: cam.y, zoom: cam.zoom, vw, vh }); updateMood(); handleEvents(); syncPicker(); updateHud(); const h1 = performance.now(); drawWorld(now); const h2 = performance.now();
      ema('hud', h1 - h0); ema('draw', h2 - h1);
    }
    ema('frame', performance.now() - f0);
    if (perfEl && now - perfT > 500) { perfT = now; perfEl.textContent = '프레임 ' + perf.dt.toFixed(1) + 'ms (' + (1000 / Math.max(1, perf.dt)).toFixed(0) + 'fps)\n작업 ' + perf.frame.toFixed(1) + 'ms = 틱 ' + perf.tick.toFixed(1) + ' + 그리기 ' + perf.draw.toFixed(1) + '\n적 ' + (S ? S.enemies.length : 0) + ' 아군 ' + (S ? S.units.length : 0) + ' 투사체 ' + (S ? S.shots.length : 0) + '\n그린 개체 ' + drawnCount + (liteMode ? ' (간단 모드)' : '') + '\n해상도 ' + Math.round(renderScale * 100) + '%'; }
  }

  if (params.get('perf')) { perfEl = $('perf'); perfEl.hidden = false; }
  window.addEventListener('keydown', e => { if (e.key === 'F3') { e.preventDefault(); perfEl = perfEl ? null : $('perf'); $('perf').hidden = !perfEl; } });
  window.addEventListener('resize', () => { uiAge = 999; });
  window.addEventListener('resize', resize);
  Net.setSource(() => S);
  Scenery.init(C);
  resize();
  S = C.createGame(1); // 시작 화면 뒤에 보일 빈 맵
  centerOnCore();
  if (!params.get('bot') && !params.get('notitle')) showTitle(); else $('overlay').classList.add('hidden');
  if (params.get('bot')) { $('overlay').classList.add('hidden'); newGame(); const warp = +params.get('warp') || 0; for (let i = 0; i < warp / STEP && !S.over; i++) { botAct(); C.tick(S, STEP); } if (+params.get('round')) { C.jumpToRound(S, +params.get('round')); C.tick(S, STEP); } C.drainEvents(S); if (S.over) showEnd(S.win); cam.zoom = +params.get('zoom') || 0.5; clampCam(); }
  requestAnimationFrame(frame);
  window.__game = { toast, get S() { return S; }, cam, CastleCore: C, get bossArrows() { return bossArrows; }, get enemyArrows() { return enemyArrows; }, perf, get liteMode() { return liteMode; }, get drawnCount() { return drawnCount; }, get renderScale() { return renderScale; }, get fxPoolSize() { return fxPool.length; }, uiRects, skipCinematic: () => $('cineSkip').click() };
})();
