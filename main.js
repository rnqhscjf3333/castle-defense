/* 성 지키기 — 화면/입력/UI. 게임 규칙은 core.js(CastleCore)에만 있다. */
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
  const JOBC = { knight: '#7cc0ff', paladin: '#ffe9a0', warlord: '#d9dde8', blade: '#ff9a4a', blademaster: '#8fc8ff', berserker: '#ff4a3a', sniper: '#ffe14a', deadeye: '#ffb81a', gunner: '#ff8a2a', ranger: '#6bffa3', stormarcher: '#4ae6ff', hunter: '#ff5a5a',
    cleric: '#ffe28a', highcleric: '#fff4b8', warden: '#7ad0ff', bishop: '#c8a0ff', archbishop: '#ffd84a', templar: '#ffe9a0',
    arcane: '#b48aff', storm: '#ff9a3a', frost: '#9fd8ff', meteor: '#ff7a1a', inferno: '#ff5a1a', zero: '#eaf8ff', shatter: '#bfe8ff', guardian: '#ffe27a', judge: '#ffe27a', aegis: '#8fc4ff', wrath: '#fff2a0', radiance: '#fff6c0', bastion: '#ffe27a', fortress: '#8fc4ff', necro: '#3ae68a', horde: '#7affc8', bind: '#7affc8', legion: '#7affc8', deathknight: '#3ae68a', harvest: '#b8ffd8', immortal: '#3ae68a' };
  // 근접 타격 궤적 모양 (직업마다 크기·두께·갈래 수가 다르다)
  const SLASH = { berserker: { r: 30, w: 6, n: 1, span: 1.25 }, warlord: { r: 20, w: 5, n: 1, span: 0.9 }, paladin: { r: 19, w: 4.5, n: 1, span: 0.8, cross: 1 }, knight: { r: 15, w: 3.6, n: 1, span: 0.8 }, blademaster: { r: 22, w: 2, n: 2, span: 1.1 }, blade: { r: 19, w: 2.6, n: 1, span: 1.0 }, undead: { r: 14, w: 3, n: 1, span: 0.9 } };
  const JSHOT = { deadeye: 1, sniper: 1, gunner: 1, ranger: 1, stormarcher: 1, hunter: 1 };
  const CFAM = id => ['arcane', 'storm', 'frost', 'meteor', 'inferno', 'zero', 'shatter'].includes(id) ? 'arc' : ['guardian', 'judge', 'aegis', 'wrath', 'radiance', 'bastion', 'fortress'].includes(id) ? 'gua' : 'nec';
  const UNITC = { golem: '#c8a46a', hero: '#ffe14a', marksman: '#ffd23a', repeater: '#cfe3ff' };
  const atkColor = (job, ut) => (job && JOBC[job]) || UNITC[ut] || '#dfe9ff';
  let eliteToasts = 0, numFont = '', numFx = 0;             // 화면에 떠 있는 피해/치유 숫자 수 (상한을 두어 부하를 막는다)
  let shakeT = 0, shakeA = 0; function addShake(a, t) { if (a >= shakeA * (shakeT / 0.3 || 0) || shakeT <= 0) { shakeA = a; shakeT = t; } }
  const fxPool = [];         // 쓰고 난 효과 객체를 재사용 (GC 부담을 줄인다)
  function addFx(o) {
    if (fx.length >= 300) return;
    const f = fxPool.length ? fxPool.pop() : {};
    f.ang = o.ang; f.half = o.half; f.len = o.len; f.kind = o.kind; f.shape = o.shape; f.k = o.k; f.x = o.x; f.y = o.y; f.tx = o.tx; f.ty = o.ty; f.t = o.t || 0; f.max = o.max; f.c = o.c; f.r = o.r; f.big = o.big; f.enemy = o.enemy; f.small = o.small; f.v = o.v; f.n = o.n; f.a = o.a; f.w2 = o.w2; f.grow = o.grow; f.claw = o.claw;
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
  // ───────────── 사망·부활 알림 (왼쪽): 누가 누구에게 쓰러졌는지 얼굴로 보여준다 ─────────────
  const faceCache = {};
  function faceURL(d) { // d: { team, kind(적) | type(아군), job, jt, look, r }
    const key = d.team + (d.kind || d.type) + (d.job || '') + (d.jt || 0) + (d.look ? d.look.body : ''); if (faceCache[key]) return faceCache[key];
    const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 72; const c2 = cv2.getContext('2d');
    const cfg = d.team === 'u' ? CFG.units[d.type] : (CFG.enemies[d.kind] || CFG.enemies.grunt), r = d.r || (d.look && d.look.r) || cfg.r || 10;
    const e = d.team === 'u' ? { team: 'u', type: d.type, id: 1, x: 0, y: 0, r, flash: 0, swing: 0, aim: 0, hp: 1, max: 1, job: d.job || null, jobTier: d.jt || 0 }
      : { team: 'e', kind: d.look ? 'boss' : d.kind, type: d.kind, id: 3, x: 0, y: 0, r, flash: 0, swing: 0, look: d.look || undefined };
    const s = (r / 10) * 1.25, yc = Figures.headTop(e) + 5.5 * s, k = 72 / (19 * s);
    c2.translate(36, 36 - (yc - 3 * s) * k); c2.scale(k, k);
    try { Figures.draw(c2, e, 0); } catch (err) {}
    return (faceCache[key] = cv2.toDataURL());
  }
  function feedAdd(left, mid, right, text, cls) { // 얼굴 · 표시 · 얼굴 한 줄. 새 줄이 위에 들어오고 오래된 줄은 흐려지며 사라진다
    const box = $('feed'), d = document.createElement('div'); d.className = 'fe ' + (cls || '');
    const face = f => f ? '<img alt="" src="' + faceURL(f) + '">' : '<span class="ic">☠️</span>';
    d.innerHTML = face(left) + '<span class="ic">' + mid + '</span>' + face(right); // (이름 텍스트 없이 얼굴과 표시만)
    box.insertBefore(d, box.firstChild);
    requestAnimationFrame(() => d.classList.add('in'));
    for (let k = 1; k < box.children.length; k++) box.children[k].classList.add('old');
    const kill = el => { el.classList.add('out'); setTimeout(() => el.remove(), 450); };
    setTimeout(() => kill(d), 4800);
    const live = Array.from(box.children).filter(c => !c.classList.contains('out'));
    for (let k = live.length - 1; k >= 5; k--) kill(live[k]);
  }
  let sayT = 0;
  function saySpeech(name, text) { let el = $('bossSay'); if (!el) { el = document.createElement('div'); el.id = 'bossSay'; document.body.appendChild(el); } el.innerHTML = '<b></b><span></span>'; el.firstChild.textContent = name; el.lastChild.textContent = '“' + text + '”'; el.classList.add('show'); clearTimeout(sayT); sayT = setTimeout(() => el.classList.remove('show'), 2400); }
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
    const r = C.enqueue(S, t);
    if (!r.ok) A2.play('deny');
    if (!r.ok) toast({ gold: '골드가 부족해요', queue: '생산 대기열이 가득 찼어요 (최대 ' + CFG.prodMax + '개)', pop: '인구가 가득 찼어요 — 성을 업그레이드하면 늘어납니다' }[r.reason] || '생산할 수 없어요');
  }
  // 생산 대기열 표시: 칸을 누르면 취소(환급)
  const prodq = document.createElement('div'); prodq.id = 'prodq'; $('dockIn').insertBefore(prodq, $('units'));
  prodq.addEventListener('click', e => { const el = e.target.closest('.pq'); if (el && S && running && !paused) { C.cancelProd(S, +el.dataset.i); A2.play('deny'); } });
  let pqKey = '';
  function updateProdQ() {
    const L = S.prod, h = L.length ? L[0] : null, key = L.map(p => p.type + (p.wait ? 'w' : '')).join(',');
    if (key !== pqKey) { pqKey = key; prodq.innerHTML = L.map((p, i) => '<span class="pq' + (p.wait ? ' wait' : '') + '" data-i="' + i + '" title="누르면 취소하고 골드를 돌려받습니다">' + CFG.units[p.type].name + '<i></i></span>').join(''); }
    if (h && prodq.firstChild) prodq.firstChild.firstElementChild.style.width = Math.min(100, h.t / CFG.units[h.type].buyCd * 100) + '%';
  }
  // 성 업그레이드 버튼 (소환 버튼 옆): 골드로 성을 올리면 인구 상한·체력·공격력·사거리가 오르고 특정 레벨마다 대포가 늘어난다
  const castleBtn = document.createElement('button'); castleBtn.className = 'btn panel ucard castlecard';
  castleBtn.innerHTML = '<div class="nm"><span class="nmt">성</span><span class="cnt"></span></div><div class="ds"></div><div class="cost"></div><span class="key">4</span>';
  castleBtn.addEventListener('click', () => doCastle());
  castleBtn.insertAdjacentHTML('beforeend', '<div class="cdfill"></div>');
  $('units').appendChild(castleBtn);
  function doRepair() {
    if (!S || !running || paused) return;
    const r = C.repairCastle(S);
    if (!r.ok) { A2.play('deny'); toast(r.reason === 'gold' ? '골드가 부족해요' : r.reason === 'cooldown' ? '수리 쿨타임 중이에요' : r.reason === 'full' ? '성 체력이 가득 찼어요' : ''); }
  }
  const cb = { lv: castleBtn.querySelector('.cnt'), ds: castleBtn.querySelector('.ds'), cost: castleBtn.querySelector('.cost') };
  function doCastle() { // 성이 최대 레벨이면 같은 버튼이 수리 버튼이 된다
    if (!S || !running || paused) return;
    if (S.castle.lv >= C.castleMax(S)) return doRepair();
    const r = C.upgradeCastle(S);
    if (!r.ok) { A2.play('deny'); toast(r.reason === 'max' ? '성이 최대 레벨입니다' : '골드가 부족해요'); }
  }
  $('btnPause').addEventListener('click', () => { if (!running && !S) return; toggleModal('setMenu'); });
  $('btnInfo').addEventListener('click', () => { if (!S) return; toggleModal('infoPanel'); if (!$('infoPanel').classList.contains('hidden')) renderInfo(); });
  let shownSp = 0; // 보스전에는 자동으로 1배속, 끝나면 고른 배속으로 돌아간다
  const effSpeed = () => (S && !S.over && (S.dragonIntro || S.bossDeath || S.enemies.some(e => e.kind === 'boss' && !e.dead))) ? 1 : speed;
  const showSpeed = v => { if (v === shownSp) return; shownSp = v; for (const b of document.querySelectorAll('#speedBar button')) b.classList.toggle('on', +b.dataset.sp === v); };
  const setSpeed = v => { speed = v; showSpeed(effSpeed()); };
  for (const b of document.querySelectorAll('#speedBar button')) b.addEventListener('click', () => setSpeed(+b.dataset.sp));
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (anyModal()) { if (e.key === 'Escape' || (e.key === ' ' && !$('setMenu').classList.contains('hidden'))) { e.preventDefault(); closeModals(); } return; }
    if (S && S.cinematic) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') endCine(); return; }
    if (S && (S.cards.offer || S.jobs.offer || S.cOffer)) { // 카드/전직/성 선택 중에는 1·2·3이 선택, R이 다시 뽑기(카드만)
      if (e.key === '1' || e.key === '2' || e.key === '3') choose(+e.key - 1);
      else if ((e.key === 'Backspace' || e.key === 'b' || e.key === 'B') && S.jobs.offer && S.jobs.offer.stage === 'class') C.jobBack(S);
      else if ((e.key === 'r' || e.key === 'R') && S.cards.offer && !S.jobs.offer && !S.cOffer) C.reroll(S);
      return;
    }
    if (e.key === '1' || e.key === '2' || e.key === '3') doBuy(C.UNIT_TYPES[+e.key - 1]);
    if (e.key === '4') doCastle();
    else if (e.key === 'i' || e.key === 'I') $('btnInfo').click();
    else if (e.key === 'Escape') toggleModal('setMenu');
    else if (e.key === ' ') { e.preventDefault(); $('btnPause').click(); }
    else if (e.key === 'h' || e.key === 'H') centerOnCore();
    else if (e.key === 'm' || e.key === 'M') { A2.init(); A2.toggleMute(); toast(A2.state.muted ? '소리 끔 (M)' : '소리 켬 (M)'); }
  });

  const last = {};
  function setText(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }
  const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  // 보스 체력 바 (화면 위 가운데): 이름, 체력 숫자, 현재 상태, 가진 패턴
  const PAT = { dash: '돌진', summon: '소환', artillery: '포격', shield: '방어막', rage: '분노', rush: '강습', blink: '순간이동', leap: '도약', siege: '원거리 포격', clone: '분신', aura: '철벽 수호', roar: '함성', focus: '정신 집중', drain: '암흑 흡수', sword: '검기', claw: '긴 손톱', lance: '번개 창', shards: '얼음 파편', hammer: '대망치', bolt: '낙뢰', frost: '냉기', blizzard: '눈보라', stomp: '발구르기', quake: '지진', breath: '불길 숨결', tail: '꼬리 휘두르기', gust: '날갯짓', meteor: '불덩이 낙하', fly: '비행' };
  const DBK = { stun: ['기절', '#ffe14a'], poison: ['중독', '#7be04a'], weak: ['공격력 감소', '#ff6b6b'], wound: ['치유 감소', '#c77dff'] };
  // 보스 등장 컷신: 모습·이름·대사가 잠깐 나왔다가 사라진다 (게임은 멈추지 않는다)
  let biTimer = 0, biRaf = 0;
  function showBossIntro(ev) {
    const el = $('bossIntro'), c2 = $('biCv').getContext('2d'); setText('biName', ev.omen ? ev.name + '의 목소리' : ev.name);
    el.className = ev.omen ? 'omen omen-' + ev.omen : ''; el.querySelector('.bi-tag').textContent = ev.omen ? '— 다가오는 기운 —' : 'BOSS';
    $('biLine').textContent = ev.line ? '“' + ev.line + '”' : '';
    el.classList.remove('hidden'); clearTimeout(biTimer); cancelAnimationFrame(biRaf);
    const fake = { team: 'e', kind: 'boss', id: 7, x: 0, y: 0, r: ev.r || 30, look: ev.look, flash: 0, swing: 0 }, t0 = performance.now();
    (function loop() {
      const now = performance.now(); if (now - t0 > (ev.long ? 5200 : 2300)) return;
      fake.x += 0.35; fake.swing = ((now - t0) % 1400) < 220 ? 0.2 : 0; fake.aim = 0;
      c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, 240, 240); const k = 44 / (ev.r || 30);
      c2.translate(120 - fake.x * k, 160); c2.scale(k, k); Figures.draw(c2, fake, now); biRaf = requestAnimationFrame(loop);
    })();
    biTimer = setTimeout(() => el.classList.add('hidden'), ev.long ? 5000 : 2200);
  }
  // 길 열기: 라운드가 올라 길이 늘어나면 먼지 구름이 성에서 바깥으로 퍼지며 새 길이 나타난다
  let pendingPortal = 0;
  function syncPortal() { if (!pendingPortal || currentOffer()) return; const n = pendingPortal; pendingPortal = 0; addFx({ k: 'ring', x: CX, y: CY, t: 0, max: 0.8, c: '#ff3b3b', big: true }); setTimeout(() => banner('붉은 포탈이 하나 더 열렸습니다'), 1600); }
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
    let st = b.dying ? (S.bossDeath && S.bossDeath.stage === 'revive' ? '부활 중…' : '쓰러지는 중…') : shielded ? '방어막 — 피해를 ' + Math.round(b.shieldRed * 100) + '% 방어' : b.focusT > 0 ? '정신 집중 — 회복 중, 피해 ' + Math.round(b.abil.focus.red * 100) + '% 감소' : b.dashT > 0 ? '돌진 중!' : rage ? '분노 — 더 빠르고 강해졌다' : '패턴: ' + Object.keys(b.abil).map(k => k === 'debuff' ? b.abil.debuff.map(d => DBK[d.kind][0]).join('·') : PAT[k]).join(' · ');
    if (b.grow > 1.04) st += '  |  공격력 ×' + b.grow.toFixed(1) + (b.grow >= CFG.balance.bossGrowMax - 0.01 ? ' (최대)' : ' ↑');
    setText('bossState', st);
  }
  function updateCastleBtn() {
    const lv = S.castle.lv, max = lv >= C.castleMax(S);
    if (max) { // 최대 레벨: 수리 버튼 (골드로 성 체력 10% 회복, 쿨타임·누적 비용)
      const rc = C.repairCost(S), cdp = S.repairCd > 0 ? S.repairCd / CFG.repair.cd : 0, hpFull = S.core.hp >= S.core.max - 0.5;
      const k2 = 'R|' + rc + '|' + Math.round(cdp * 50) + '|' + (S.gold >= rc) + '|' + hpFull; if (cb.key === k2) return; cb.key = k2;
      castleBtn.querySelector('.nmt').textContent = '🔧 성 수리'; cb.lv.textContent = 'Lv.' + lv; cb.ds.textContent = '성 체력 +10% · 쿨타임 ' + CFG.repair.cd + '초'; cb.cost.textContent = rc + 'G';
      castleBtn.querySelector('.cdfill').style.height = (cdp * 100) + '%'; castleBtn.classList.toggle('off', S.gold < rc || hpFull); castleBtn.classList.remove('need'); return;
    }
    const cost = C.castleCost(S), full = C.popCount(S) >= C.popCap(S);
    const key = lv + '|' + cost + '|' + S.core.cannons + '|' + (S.gold >= cost) + '|' + full;
    if (cb.key === key) return; cb.key = key; castleBtn.querySelector('.nmt').textContent = '성';
    cb.lv.textContent = 'Lv.' + lv; cb.ds.textContent = max ? '최대 레벨 · 성 수리' : '인구 +' + C.popGain(lv + 1) + ' · 공격·체력↑' + (CFG.castle.cannonLv.includes(lv + 1) ? ' · 대포 +1' : '');
    cb.cost.textContent = max ? 'MAX' : cost + 'G'; castleBtn.classList.toggle('off', max || S.gold < cost); castleBtn.classList.toggle('need', full && !max);
  }
  function updateHud() {
    const c = S.core;
    const bi = C.bossInfo(S, S.round), nb = C.bossInfo(S, S.round + 1), rt = $('roundTxt');
    setText('roundTxt', '라운드 ' + Math.max(1, S.round) + ' / ' + C.FINAL_ROUND);
    rt.classList.toggle('boss', !!bi); rt.classList.toggle('nextboss', !bi && !!nb); rt.classList.toggle('act2', S.act === 2 && !bi && !nb);
    updateBossBar(); updateCastleBtn();
    setText('timeTxt', fmtTime(S.t));
    setText('hpTxt', String(Math.ceil(c.hp)));
    setText('gold', S.dev ? '∞' : String(Math.floor(S.gold)));
    { const sp = C.specialCount(S); setText('unitTxt', C.popCount(S) + '/' + C.popCap(S) + (sp ? ' · 특수 ' + sp : '')); } // 인구/상한 + 특수 유닛은 따로
    setText('killTxt', String(S.kills));
    const pct = Math.max(0, c.hp / c.max * 100);
    const f = $('hpfill'); f.style.width = pct + '%'; f.style.background = pct > 50 ? 'var(--ok)' : pct > 25 ? 'var(--gold)' : 'var(--danger)';
    updateProdQ();
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
      const cant = S.gold < cost || C.popCount(S) + S.prod.length >= C.popCap(S) || S.prod.length >= CFG.prodMax;
      u.el.classList.toggle('off', cant);
    }
  }

  // ───────────── 업그레이드 선택창 / 강화 목록 ─────────────
  const CAT_NAME = { unit: '유닛 강화', core: '성 강화', summon: '특수 소환' };
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
    const list = job ? (S.jobs.offer ? S.jobs.offer.list : S.cOffer && S.cOffer.list) : S.cards.offer, rk = rankOf(list && list[i] || {}, job), r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, Z = 0.84; // #pickBox는 zoom .84
    const g = b.cloneNode(true); g.classList.remove('enter', 'flip'); g.classList.add('picked'); g.style.cssText = 'zoom:' + Z + ';left:' + r.left / Z + 'px;top:' + r.top / Z + 'px;width:' + r.width / Z + 'px;height:' + r.height / Z + 'px';
    document.body.appendChild(g); setTimeout(() => g.remove(), 340);
    ring(cx, cy, RCOL[rk], 6 + rk * 4); sparks(cx, cy, [10, 18, 30, 52][rk], RCOL[rk], 70 + rk * 40, 0.42);
    if (rk >= 1) flash(RCOL[rk], [0, 0.12, 0.25, 0.5][rk]);
  }
  const currentOffer = () => (S && S.jobs.offer) ? { kind: 'job', list: S.jobs.offer.list, ref: S.jobs.offer } : (S && S.cOffer) ? { kind: 'castle', list: S.cOffer.list, ref: S.cOffer } : (S && S.cards.offer) ? { kind: 'card', list: S.cards.offer, ref: S.cards.offer } : null;
  // 성 선택지 미리보기: 고른 갈래를 반영한 성 그림 (선택지 카드 안에 들어간다)
  function castlePortrait(c) {
    const cv2 = document.createElement('canvas'); cv2.width = 220; cv2.height = 190; const c2 = cv2.getContext('2d');
    const fake = { x: 0, y: 0, lv: S ? S.castle.lv : 10, cannons: S ? S.core.cannons : 3, max: 1, hp: 1, flash: 0, swing: 0, cpath: c.cpath, cvar: c.cvar, cfin: c.cfin };
    c2.translate(110, 108); c2.scale(0.98, 0.98); Scenery.drawCastle(c2, fake, performance.now() * 0.9);
    return cv2.toDataURL();
  }
  const CARD_EMO = { c_splash: '💥', c_chain: '⚡', c_bomb: '💣', a_heal: '💚', a_def: '🛡️', a_atk: '⚔️', a_spd: '💨', a_rad: '🔆', f_repair: '🔧', f_thorn: '🌵', f_hp: '🧱', c_atk: '🎯', c_rate: '⏱️', c_range: '📡' };
  const SUMMON_UNIT = { s_turret: 'turret', s_golem: 'golem', s_hero: 'hero', s_marksman: 'marksman', s_repeaters: 'repeater', s_ballista: 'ballista', l_sword: 'legendsword', l_archer: 'legendarcher' };
  function cardIcon(c) { // 일반 강화 카드의 그림: 소환 카드는 그 유닛, 유닛 강화는 해당 직업(전직 모습), 성 강화는 상징 이모지
    const t = SUMMON_UNIT[c.id];
    if (t) return { src: portrait('u', t, CFG.units[t], null, null, true).toDataURL() };
    if (c.cat === 'unit' && c.type && CFG.units[c.type]) { const ids = S.jobs[c.type].ids; return { src: portrait('u', c.type, CFG.units[c.type], null, ids.length ? { job: ids[ids.length - 1], jobTier: ids.length } : null, true).toDataURL() }; }
    return { emo: CARD_EMO[c.id] || '🏰' };
  }
  function rewardIcon(id) {
    const one = t => portrait('u', t, CFG.units[t], null, null, true);
    if (id === 'r_knights') return one('hero').toDataURL();
    if (id === 'r_snipers') return one('marksman').toDataURL();
    if (id === 'r_golem') { const cv2 = document.createElement('canvas'); cv2.width = 220; cv2.height = 110; const c2 = cv2.getContext('2d'); c2.drawImage(one('golem'), 0, 0, 110, 110); c2.drawImage(one('hero'), 100, 0, 110, 110); return cv2.toDataURL(); }
    if (id === 'r_army') { const cv2 = document.createElement('canvas'); cv2.width = 260; cv2.height = 100; const c2 = cv2.getContext('2d'); C.UNIT_TYPES.forEach((t, i) => c2.drawImage(one(t), i * 80, 8, 92, 92)); c2.font = '800 22px sans-serif'; c2.fillStyle = '#ffd166'; c2.textAlign = 'center'; c2.strokeStyle = '#1a1405'; c2.lineWidth = 4; c2.strokeText('+2', 238, 30); c2.fillText('+2', 238, 30); return cv2.toDataURL(); }
    if (id === 'l_army') return rewardIcon('r_army');
    if (id === 'l_legends') { const cv2 = document.createElement('canvas'); cv2.width = 220; cv2.height = 110; const c2 = cv2.getContext('2d'); c2.drawImage(one('legendsword'), 0, 0, 110, 110); c2.drawImage(one('legendarcher'), 100, 0, 110, 110); return cv2.toDataURL(); }
    if (id === 'l_fort') return rewardIcon('r_fort');
    if (id === 'r_fort') return castlePortrait({ cpath: S.core.cpath, cvar: S.core.cvar, cfin: S.core.cfin });
    return '';
  }
  function syncPicker() {
    const cur = S && S.cinematic ? null : currentOffer(), ref = cur ? cur.ref : null;
    if (ref === shownOffer) { if (cur && cur.kind === 'card') updateReroll(); return; }
    const wasCard = shownKind === 'card'; shownOffer = ref; shownKind = cur ? cur.kind : null;
    const el = $('picker');
    if (!cur) { el.classList.add('hidden'); return; }
    const job = cur.kind === 'job' || cur.kind === 'castle', castle = cur.kind === 'castle', box = $('pickCards'); box.innerHTML = '';
    const JO = S.jobs.offer, stage = JO && JO.stage;
    $('pickBack').style.display = stage === 'class' ? '' : 'none';
    if (castle) {
      const n = S.cOffer.tier;
      $('pickTitle').textContent = '성 Lv.' + S.castle.lv + ' · ' + ['성의 능력 선택', '성의 강화 방향 선택', '성의 최종 형태 선택'][n];
      $('pickSub').textContent = ['마탑·수호·사령 중 하나를 고르세요 — 이후 성의 모습과 공격이 달라져요', '공격형과 방어형 중 하나를 고르세요', '마지막 선택이에요 — 성이 완성돼요'][n];
    } else if (job) {
      const rw = JO.reward;
      if (JO.legacy) { $('pickTitle').textContent = JO.boss + ' 처치! 마왕의 유산'; $('pickSub').textContent = '마왕을 쓰러뜨렸다 — 곧 찾아올 사천왕에 맞설 아주 강력한 보상 중 하나를 고르세요'; }
      else if (stage === 'awaken' && JO.boss === '성채') { $('pickTitle').textContent = '성채 각성'; $('pickSub').textContent = '성이 최대 레벨을 넘어섰어요 — 각성시켜 한 단계 더 강해져요'; }
      else if (stage === 'awaken') { $('pickTitle').textContent = JO.boss + ' 처치! 전직 각성'; $('pickSub').textContent = '아직 각성하지 않은 계열 중 하나의 2차 전직을 업그레이드해요 (고르지 않은 계열은 다음 사천왕 뒤에 각성)'; }
      else if (rw) { $('pickTitle').textContent = JO.boss + ' 처치! 보스 보상'; $('pickSub').textContent = '강력한 용병이나 강화 효과 중 하나를 고르세요'; }
      else if (stage === 'line') { $('pickTitle').textContent = JO.boss + ' 처치! ' + JO.tier + '차 승급'; $('pickSub').textContent = '승급시킬 캐릭터를 고르세요 — 다음 화면에서 두 가지 중 하나를 골라요'; }
      else if (stage !== 'class') { $('pickTitle').textContent = JO.boss + ' 처치! 전직'; $('pickSub').textContent = '직업 하나를 골라 강화해요'; }
      else { $('pickTitle').textContent = CFG.units[JO.line].name + ' ' + JO.tier + '차 전직'; $('pickSub').textContent = '두 가지 중 하나를 고르세요 — 외형과 공격 방식이 달라져요'; }
    } else {
      $('pickTitle').textContent = '라운드 ' + (S.round - 1) + ' 돌파 · 업그레이드 선택';
      $('pickSub').textContent = S.cards.boss ? '보스 격파 보상 — 희귀 이상 카드가 한 장 이상 나와요' : '카드를 한 장 고르세요';
    }
    $('btnReroll').style.display = job ? 'none' : '';
    $('pickHint').textContent = job ? '1·2·3 선택' + (stage === 'class' ? ' · B 뒤로' : '') + ' · 고르는 동안 시간이 멈춰요' : '1·2·3 선택 · R 다시 뽑기 · 고르는 동안 시간이 멈춰요';
    cur.list.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = job ? 'pcard job' + (castle ? ' castle' : '') : 'pcard hasimg rar-' + c.rar + ' cat-' + c.cat;
      const tags = document.createElement('div'); tags.className = 'tags';
      const cat = document.createElement('span'); cat.className = 'cat'; cat.textContent = castle ? ['능력 선택', '강화 방향', '최종 형태'][S.cOffer.tier] : job ? (c.awaken ? '전직 각성' : c.reward ? (JO.legacy ? '마왕의 유산' : '보스 보상') : c.stage === 'line' ? c.tier + '차 승급' : c.tier + '차 전직') : CAT_NAME[c.cat];
      const rar = document.createElement('span'); rar.className = 'rar'; rar.textContent = castle ? c.kind : job ? (c.reward ? '영웅' : c.className) : RAR_NAME[c.rar];
      tags.append(cat, rar);
      b.append(tags);
      if (!job) { // 일반 강화 카드 그림
        let ic = null; try { ic = cardIcon(c); } catch (err) {} if (ic) { if (ic.src) { const im = document.createElement('img'); im.className = 'pimg'; im.alt = ''; im.src = ic.src; b.append(im); } else { const d = document.createElement('div'); d.className = 'pimg emo'; d.textContent = ic.emo; b.append(d); } }
      }
      if (job && c.reward) { // 보스 보상 아이콘: 용병은 그 유닛 그림, 전군 강화는 세 직업, 성 대개수는 성 그림
        const im = document.createElement('img'); im.className = 'pimg'; im.alt = ''; try { im.src = rewardIcon(c.id); } catch (err) {} if (c.id === 'r_army' || c.id === 'r_golem' || c.id === 'l_army' || c.id === 'l_legends') im.classList.add('wide'); b.append(im);
      }
      if (job && !c.reward) { // 외형 미리보기
        const im = document.createElement('img'); im.className = 'pimg'; im.alt = '';
        try {
          if (castle || c.castle) im.src = castlePortrait(c);
          else if (c.stage === 'line') { const ids = S.jobs[c.type].ids; im.src = portrait('u', c.type, CFG.units[c.type], null, ids.length ? { job: ids[ids.length - 1], jobTier: ids.length } : null).toDataURL(); }
          else im.src = portrait('u', c.type, CFG.units[c.type], null, { job: c.jobId || c.id, jobTier: c.tier }).toDataURL();
        } catch (err) {}
        b.append(im);
      }
      if (job && !castle && !c.reward && c.stage !== 'line') { const hist = C.describeJobs(S).find(j => j.type === c.type); if (hist) { const fr = document.createElement('div'); fr.className = 'from'; fr.textContent = c.className + ' › ' + hist.names.join(' › '); b.append(fr); } }
      if (job && !castle && !c.reward && c.stage === 'line') { const hist = C.describeJobs(S).find(j => j.type === c.type); if (hist) { const fr = document.createElement('div'); fr.className = 'from'; fr.textContent = hist.names.join(' › '); b.append(fr); } }
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
  function choose(i) { if (!S) return; if (currentOffer() && !$('picker').classList.contains('hidden')) pickFx(i, !!(S.jobs.offer || S.cOffer)); if (S.jobs.offer) C.pickJob(S, i); else if (S.cOffer) C.pickCastle(S, i); else if (S.cards.offer) C.pickCard(S, i); }
  $('pickBack').addEventListener('click', () => { if (S) C.jobBack(S); });
  $('btnReroll').addEventListener('click', () => { if (S) C.reroll(S); });

  const MODALS = ['setMenu', 'infoPanel', 'metaPanel', 'devPanel'];
  const anyModal = () => MODALS.some(id => !$(id).classList.contains('hidden'));
  function openModal(id) { $(id).classList.remove('hidden'); if (S && running) paused = true; if (id === 'setMenu') { syncVol(); const ing = !!(S && running); $('setMenu').classList.toggle('titleMode', !ing); $('sResume').textContent = ing ? '계속하기' : '닫기'; } }
  function closeModals() { for (const id of MODALS) $(id).classList.add('hidden'); paused = false; }
  function toggleModal(id) { if (!$(id).classList.contains('hidden')) closeModals(); else if (!anyModal()) openModal(id); }
  for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => closeModals());
  for (const id of MODALS) $(id).addEventListener('click', e => { if (e.target === $(id)) closeModals(); });
  $('sResume').addEventListener('click', closeModals);
  // 소리: 배경음악·효과음 따로 슬라이더로 조절
  function syncNick() { const i = $('sNick'); if (i && document.activeElement !== i) i.value = Net.name(); }
  function syncVol() { syncNick(); const st = A2.state; $('sMus').value = Math.round(st.music * 100); $('sSfx').value = Math.round(st.sfx * 100); $('sMusV').textContent = $('sMus').value; $('sSfxV').textContent = $('sSfx').value; }
  const volInput = (id, set) => { const el = $(id); el.addEventListener('input', () => { A2.init(); if (A2.state.muted) A2.setMuted(false); set(+el.value / 100); $(id + 'V').textContent = el.value; }); };
  volInput('sMus', v => A2.setMusic(v)); volInput('sSfx', v => A2.setSfx(v));
  $('sSfx').addEventListener('change', () => A2.play('kill')); // 놓았을 때 효과음 미리듣기
  function recordAbandon() { if (S && running && !S.over && S.round >= 2 && !S.dev) { Meta.finish(S, C, 0); Net.sendLog(S, 'abandon', true); } }
  $('sNick').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('sNickSave').click(); }); $('sNick').addEventListener('keyup', e => e.stopPropagation());
  $('sNickSave').addEventListener('click', () => { const v = Net.setName($('sNick').value); if (v) { $('sNick').value = v; toast('닉네임을 "' + v + '"(으)로 바꿨어요'); } else toast('닉네임을 입력해 주세요'); });
  $('sRestart').addEventListener('click', () => { closeModals(); recordAbandon(); newGame(); });
  $('sMenu').addEventListener('click', () => { closeModals(); recordAbandon(); running = false; showTitle(); });
  $('btnToMenu').addEventListener('click', () => { $('overlay').classList.add('hidden'); running = false; showTitle(); openMenu(); });

  const f1 = n => Math.round(n * 10) / 10;
  const irow = (name, desc, cls, right) => '<div class="irow ' + (cls || '') + '"><div class="t"><span>' + name + '</span><b>' + (right || '') + '</b></div>' + (desc ? '<div class="d">' + desc + '</div>' : '') + '</div>';
  const statTable = rows => '<table>' + rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('') + '</table>';
  const UNIT_TEXT = { sword: '체력이 높은 전위. 적에게 붙어서 싸웁니다.', archer: '멀리서 화살을 쏩니다.', priest: '아군을 치유합니다.', golem: '거대한 용병. 체력이 매우 높습니다.', hero: '용병 용사. 스킬 [일섬]을 씁니다.', marksman: '긴 사거리의 명사수. 스킬 [일제 사격].', repeater: '빠르게 연사하는 석궁병.', turret: '성 곁에 설치된 자동 포탑.', ballista: '적 2명을 관통하는 설치형 대형 석궁.', legendsword: '전설의 검사. 스킬 [질풍 돌진].', legendarcher: '전설의 궁수. 스킬 [천궁 폭우].' };
  const SPECIALS = ['golem', 'hero', 'marksman', 'repeater', 'turret', 'ballista', 'legendsword', 'legendarcher'];
  function unitBlock(type, list) {
    const cfg = CFG.units[type], n = list.length, avg = k => list.reduce((t, u) => t + (u[k] || 0), 0) / Math.max(1, n);
    const hpNow = list.reduce((t, u) => t + u.hp, 0);
    const rows = n ? [['인원', n + '명'], ['체력', f1(avg('max')) + ' (현재 평균 ' + f1(hpNow / n) + ')'], ['공격력', f1(avg('atk'))], ['공격 속도', f1(avg('rate')) + '/초'], ['사거리', Math.round(avg('range'))], ['이동 속도', Math.round(avg('speed'))]]
      : [['인원', '0명'], ['기본 체력', cfg.hp], ['기본 공격력', cfg.atk], ['기본 사거리', cfg.range]];
    if (type === 'priest' && n) { rows.splice(2, 2, ['치유량', f1(avg('heal'))], ['치유 속도', f1(avg('healRate')) + '/초']); }
    const hs = CFG.heroSkill && CFG.heroSkill[type]; if (hs) rows.push(['스킬', hs.name + ' (' + hs.cd + '초마다)']);
    const job = n && list[0].job ? ' · ' + (C.describeJobs(S).find(j => CFG.units[j.type] === cfg) || { names: [] }).names.join(' › ') : '';
    let img = ''; try { img = '<img class="uimg" alt="" src="' + portrait('u', type, cfg, null, n && list[0].job ? { job: list[0].job, jobTier: list[0].jobTier } : null).toDataURL() + '">'; } catch (e) {}
    const jd = C.describeJobs(S).find(j => j.type === type), jtxt = jd ? jd.names.map((n, i) => '<b>' + n + '</b> — ' + jd.descs[i]).join('<br>') : (UNIT_TEXT[type] || '');
    return irow(cfg.name + job, '<div class="uwrap">' + img + '<div>' + jtxt + statTable(rows) + '</div></div>', '');
  }
  let infoTab = 'up';
  function renderInfo() {
    if (!S) return; const body = $('infoBody'); for (const b of document.querySelectorAll('#infoTabs button')) b.classList.toggle('on', b.dataset.t === infoTab);
    let h = '';
    if (infoTab === 'up') {
      const taken = C.describeTaken(S), jobs = C.describeJobs(S);
      let cimg = ''; try { cimg = '<img class="uimg" alt="" style="width:118px;height:104px;object-fit:contain" src="' + castlePortrait({ cpath: S.core.cpath, cvar: S.core.cvar, cfin: S.core.cfin }) + '">'; } catch (e) {}
      h += '<h3>성</h3>' + irow('성 Lv.' + S.castle.lv + (S.castle.awk ? ' (각성)' : S.castle.lv >= C.castleMax(S) ? ' (최대)' : ''), '<div class="uwrap">' + cimg + '<div>체력 ' + Math.round(S.core.hp) + '/' + Math.round(S.core.max) + ' · 공격력 ' + f1(S.core.atk) + ' · 사거리 ' + Math.round(S.core.range) + (S.core.cpath ? '' : ' · 대포 ' + S.core.cannons + '문') + '<br>인구 ' + C.popCount(S) + (C.popCap(S) < 1e8 ? '/' + C.popCap(S) : ' (제한 없음)') + '<br>병사 보호: 성이 받는 피해 -' + Math.round(C.coreGuard(S) * 100) + '% (병사 1명당 -' + CFG.balance.guardPerUnit * 100 + '%, 최대 -' + CFG.balance.guardMax * 100 + '%)</div></div>');
      { const cd = C.describeCastle(S), nxt = CFG.castleTree.lv[S.cnodes.length];
        h += '<h3>성 능력</h3>' + (cd.length ? cd.map((n, i) => irow(n.name, n.desc, i === 2 ? 'epic' : 'rare', n.kind)).join('') : '<div class="d">성 Lv.' + CFG.castleTree.lv[0] + '에서 마탑·수호·사령 중 한 가지를 고릅니다.</div>') + (nxt && cd.length ? '<div class="d" style="margin:2px 0 6px">다음 선택: 성 Lv.' + nxt + '</div>' : ''); }
      h += '<h3>전직</h3>' + (jobs.length ? jobs.map(j => irow(j.className, j.names.join(' › '), 'epic')).join('') : '<div class="d">아직 전직한 직업이 없어요 (보스를 처치하면 전직)</div>');
      for (const cat of ['unit', 'core', 'summon']) { const l = taken.filter(t => t.cat === cat); if (l.length) h += '<h3>' + CAT_NAME[cat] + '</h3>' + l.map(t => irow(t.name, t.desc, t.rar, 'Lv ' + t.lv + (t.max ? '/' + t.max : ''))).join(''); }
      if (S.bossUp && S.bossUp.hp) h += '<h3>보스 보상</h3>' + irow('전군 강화', '검사·궁수·사제 체력·공격력 강화 (일반 강화와 별개로 적용)', 'epic', 'Lv ' + S.bossUp.hp);
      if (!taken.length) h += '<div class="d" style="margin-top:8px">아직 선택한 강화가 없어요</div>';
    } else if (infoTab === 'unit') {
      for (const t of C.UNIT_TYPES) h += unitBlock(t, S.units.filter(u => !u.dead && u.type === t));
      const up = S.up; h += '<h3>누적 강화 단계</h3>' + C.UNIT_TYPES.map(t => irow(CFG.units[t].name, '체력 +' + up[t].hp + (S.bossUp.hp ? ' (+보상 ' + S.bossUp.hp + ')' : '') + ' · 공격 +' + up[t].atk + (S.bossUp.atk ? ' (+보상 ' + S.bossUp.atk + ')' : '') + ' · 속도 +' + up[t].rate + ' · 이동 +' + up[t].speed, '')).join('');
    } else {
      const alive = S.units.filter(u => !u.dead && !C.UNIT_TYPES.includes(u.type)); const kinds = SPECIALS.filter(t => alive.some(u => u.type === t));
      h += kinds.length ? kinds.map(t => unitBlock(t, alive.filter(u => u.type === t))).join('') : '<div class="d">아직 특수 유닛이 없어요.<br>카드의 [특수 소환]이나 보스 보상으로 얻을 수 있어요.</div>';
      if (S.fallen && S.fallen.length) h += '<h3>쓰러진 병사</h3><div class="d">' + S.fallen.length + '명 (사제의 부활로만 돌아와요)</div>';
    }
    body.innerHTML = h;
  }
  $('infoTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { infoTab = b.dataset.t; renderInfo(); $('infoBody').scrollTop = 0; } });

  // 도감 / 통계 / 업적
  const dfmt = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  const MODE_NAME = { normal: '기본', free: '자유', hold: '수비' };
  function portrait(team, kind, cfg, look, ext, face) { // 도감 그림 한 칸
    const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const c2 = cv2.getContext('2d');
    const r = (look && look.r) || cfg.r || 10, fake = team === 'u' ? { team: 'u', type: kind, id: 1, x: 0, y: 0, r, flash: 0, swing: 0, aim: 0, hp: 1, max: 1, job: null, jobTier: 0 } : { team: 'e', kind: look ? 'boss' : kind, type: kind, id: 3, x: 0, y: 0, r, flash: 0, swing: 0, look: look || undefined };
    if (ext) Object.assign(fake, ext);
    const BEAST = ['wolf', 'direwolf', 'boar', 'spider'], big = look || kind === 'ogre' || kind === 'brute';
    if (face && !BEAST.includes(kind)) { const sc = (r / 10) * 1.25, yc = Figures.headTop(fake) + (look ? 10 : big ? 2 : 7.5) * sc, k = 144 / ((look ? 30 : big ? 30 : 25) * sc); c2.translate(72, 72 - (yc - 3 * sc) * k); c2.scale(k, k); } // 도감: 얼굴이 잘리지 않게 머리 중심으로 확대 (네발 짐승은 전신)
    else { const k = Math.min(5, 52 / (r * (look ? 2.2 : 2.6))) * 2; c2.translate(72, 92 - r * 0.2 * k / 2); c2.scale(k, k); }
    try { Figures.draw(c2, fake, 0); } catch (e) {} return cv2;
  }
  let metaTab = 'codex', codexSel = null, listScroll = 0;
  const SKILL_TXT = { dash: '적진으로 돌진하며 지나가는 길의 적 모두를 벤다', rain: '적 위에 화살비 지대를 만들어 범위 안 적에게 계속 피해' };
  const SK_TXT = { dash: a => '돌진: ' + a.cd + '초마다 ' + a.dur + '초간 ' + a.mul.toFixed(1) + '배 속도로 가장 가까운 아군에게 달려듭니다' + (a.shock ? ' — 끝나면 충격파로 밀쳐냄' : ''), summon: a => '소환: ' + a.cd + '초마다 ' + ({ grunt: '돌격병', archer: '사수', shield: '방패병', bomber: '폭파병' }[a.kind] || a.kind) + ' ' + a.n + '명 (성 가까이 왔을 때)', artillery: a => '포격: ' + a.cd + '초마다 아군 위치에 포탄 ' + a.count + '발 (피해 ' + a.dmg + ', 범위 ' + a.radius + ', 착탄 지점 표시)' + (a.barrage ? ', ' + a.barrage + '번째마다 3배 일제 포격' : ''), shield: a => '방어막: ' + a.cd + '초마다 ' + a.dur + '초간 받는 피해 ' + Math.round(a.red * 100) + '% 감소', rage: a => '분노: 체력 ' + Math.round(a.at * 100) + '% 이하에서 속도 ×' + a.speed + ', 공격 속도 ×' + a.rate + ', 공격력 ×' + a.dmg, rush: a => '강습: 등장하자마자 가장 가까운 아군에게 돌진해 충격파로 기절시킵니다', blink: a => '순간이동: ' + a.cd + '초마다 성 둘레의 다른 자리로 이동하고 곧바로 졸개를 소환', leap: a => '도약: ' + a.cd + '초마다 아군이 가장 몰린 곳으로 뛰어올라 내려찍고 기절시킵니다', siege: () => '원거리 포격: 멀리서 포격만 합니다', clone: a => '분신: 체력 ' + Math.round(a.at * 100) + '%에서 분신 ' + a.n + '기 소환 (1회)', aura: a => '철벽 수호: ' + a.cd + '초마다 주변 적에게 ' + a.dur + '초간 방어막 (피해 ' + Math.round(a.red * 100) + '% 감소)', roar: a => '함성: ' + a.cd + '초마다 주변 적의 속도 +' + Math.round((a.speed - 1) * 100) + '% (' + a.dur + '초)', focus: a => '정신 집중: ' + a.cd + '초마다 ' + a.dur + '초간 정지하며 체력 ' + Math.round(a.heal * 100) + '% 회복, 그동안 받는 피해 ' + Math.round(a.red * 100) + '% 감소', bolt: a => '낙뢰: ' + a.cd + '초마다 아군 머리 위 ' + a.n + '곳에 번개 (범위 ' + a.r + ', 예고 후 피해·기절·밀침)', frost: a => '냉기: ' + a.cd + '초마다 ' + a.count + '곳(범위 ' + a.r + ')을 얼려 ' + a.dur + '초간 이동·공격이 느려짐', blizzard: a => '눈보라: ' + a.cd + '초마다 넓은 범위(' + a.r + ')를 얼리고 밀어냄', stomp: a => '발구르기: ' + a.cd + '초마다 주변(' + a.r + ') 아군을 피해와 함께 밀쳐냄', quake: a => '지진: ' + a.cd + '초마다 ' + a.n + '곳의 바닥이 솟구쳐 밀쳐냄', breath: a => '불길 숨결: ' + a.cd + '초마다 부채꼴(길이 ' + a.len + ') 불길 — 예고 후 큰 피해와 밀침', tail: () => '꼬리 휘두르기: 가까이 붙은 아군을 쓸어 멀리 날려 버림', gust: a => '날갯짓: ' + a.cd + '초마다 모두를 멀리 밀어냄', meteor: a => '불덩이 낙하: 체력 ' + Math.round(a.at * 100) + '% 이하에서 ' + a.cd + '초마다 ' + a.n + '개가 하늘에서 떨어짐', fly: a => '비행: 주기적으로 날아올라 사라졌다가 상·하·좌·우 다른 자리에 착지 (비행 중엔 공격 불가, 착지점에 큰 피해)', drain: a => '암흑 흡수(2형태): ' + a.cd + '초마다 주변 아군에게 검붉은 선을 이어 큰 피해를 주고 맞은 수만큼 체력 회복', claw: a => '긴 손톱(2형태): ' + a.cd + '초마다 부채꼴로 ' + a.n + '줄기의 손톱 베기 (길이 ' + a.len + ', 예고 후 큰 피해·밀침)', lance: a => '번개 창: ' + a.cd + '초마다 가까운 아군 ' + a.n + '명에게 번개 창을 일직선으로 관통시킴 (기절)', shards: a => '얼음 파편: ' + a.cd + '초마다 부채꼴(길이 ' + a.len + ') 얼음 가시 — 예고 후 피해와 함께 잠시 얼려 기절', hammer: a => '대망치: ' + a.cd + '초마다 아군이 가장 몰린 곳(범위 ' + a.r + ')에 거대한 망치를 내려쳐 큰 피해·기절·밀침', sword: a => '검기: ' + a.cd + '초마다 거대한 검기를 일직선으로 발사 (길이 ' + a.len + ', 폭 ' + a.width + ', 예고 후 큰 피해·밀침)' };
  const DB_TXT = { stun: '아군을 기절시키는', poison: '아군을 중독시키는', weak: '아군의 공격력을 낮추는', wound: '아군의 치유 효과를 낮추는' };
  function enemyTraits(c) { const t = []; if (c.air) t.push('공중 — 궁수 계열과 포탑만 공격 가능'); if (c.ranged) t.push('원거리 공격'); if (c.blast) t.push('폭발 (범위 ' + c.blast + ')'); if (c.rres && c.rres < 1) t.push('원거리 피해 ' + Math.round((1 - c.rres) * 100) + '% 방어'); if (c.mres && c.mres < 1) t.push('근접 피해 ' + Math.round((1 - c.mres) * 100) + '% 방어'); if (c.poison) t.push('공격이 중독을 겁니다'); if (c.rush) t.push('멀리서 ×' + c.rush + ' 속도로 돌진'); if (c.healRange) t.push('주변 적을 치유 (' + Math.round(c.healPct * 100) + '%/' + c.healRate + '초)'); return t; }
  function codexDetail(key) {
    const [k, a, b] = key.split(':'); let img = '', name = '', desc = '', rows = [], extra = '';
    const back = '<button class="backbtn" id="codexBack">← 도감으로</button>';
    if (k === 'u') {
      const c = CFG.units[a]; name = c.name; desc = UNIT_TEXT[a] || '';
      try { img = portrait('u', a, c, null, null, true).toDataURL(); } catch (e) {}
      rows = [['기본 체력', c.hp], ['기본 공격력', c.atk || c.heal || 0], ['공격 속도', f1(c.rate || c.healRate || 0) + '/초'], ['사거리', c.range || c.healRange || 0], ['이동 속도', c.speed || '설치형']];
      if (c.cost) rows.unshift(['기본 가격', c.cost + ' 골드']); if (c.pierce) rows.push(['관통', '적 ' + c.pierce + '명']); if (c.heal) rows.splice(1, 2, ['치유량', c.heal], ['치유 속도', f1(c.healRate) + '/초']);
      const hs = CFG.heroSkill[a]; if (hs) rows.push(['스킬', hs.name + ' (' + hs.cd + '초마다)']);
      const cd = C.CARD_DEFS.find(d => SUMMON_UNIT[d.id] === a); let sk = '';
      if (cd) { try { sk = String(cd.desc(1)); } catch (e) {} }
      if (hs && !sk) sk = hs.name + ': ' + (SKILL_TXT[hs.kind] || '');
      if (sk) extra += '<div class="d" style="margin:6px 0">' + sk + '</div>';
      const J = CFG.jobs[a]; if (J) extra += '<h3>전직</h3>' + J.t1.map(d => irow(d.name + ' (1차)', d.desc, 'rare') + (J.t2[d.id] || []).map(x => irow('└ ' + x.name + ' (2차)', x.desc, 'epic')).join('')).join('');
    } else if (k === 'e') {
      const c = CFG.enemies[a], sp = CFG.spawn[a]; name = c.name; desc = c.desc || '평범한 적입니다.';
      try { img = portrait('e', a, c, null, null, true).toDataURL(); } catch (e) {}
      rows = [['기본 체력', c.hp + ' (라운드마다 증가)'], ['기본 공격력', c.dmg || '—'], ['공격 속도', c.rate ? f1(c.rate) + '/초' : '—'], ['사거리', c.range || '—'], ['이동 속도', c.speed], ['처치 골드', c.gold], ['등장', sp ? sp.from + '라운드부터' : '특수 (소환·이벤트)']];
      const tr = enemyTraits(c); if (tr.length) extra += '<h3>특성</h3>' + tr.map(x => '<div class="d" style="margin:3px 0">• ' + x + '</div>').join('');
    } else if (k === 'b') {
      const all = CFG.bossPool.concat([CFG.act1Boss, CFG.finalBoss], Object.values(CFG.kings), [CFG.dragon]), bd = all.find(x => x.id === a), isK = !!CFG.kings[a]; name = bd.name; desc = bd.line ? '“' + bd.line + '”' : '';
      try { img = portrait('e', 'boss', CFG.enemies.boss, Object.assign({ r: bd.r || 30 }, bd.look), null, true).toDataURL(); } catch (e) {}
      const rd = bd === CFG.act1Boss ? '30라운드' : bd === CFG.finalBoss ? '50라운드' : isK ? '60·70·80라운드 (무작위 순서)' : bd === CFG.dragon ? '100라운드 (최종 보스, 몬스터 무리와 함께 싸우는 레이드)' : '5라운드마다 (무작위 순서)';
      rows = [['등장', rd], ['체력', '라운드별 표 (5R ' + CFG.bossHp[5] + ' → 50R ' + CFG.bossHp[50] + ')'], ['기본 공격력', CFG.enemies.boss.dmg + ' (시간이 지날수록 증가)'], ['기본 공격', bd.ranged ? '원거리 마법' : '범위 근접 공격']];
      const A = bd.abil; extra += '<h3>스킬</h3>' + Object.keys(A).filter(x => x !== 'debuff').map(x => '<div class="d" style="margin:4px 0">• ' + (SK_TXT[x] ? SK_TXT[x](A[x]) : x) + '</div>').join('') + (A.debuff || []).map(d => '<div class="d" style="margin:4px 0">• ' + DBK[d.kind][0] + ' 광역기: ' + d.cd + '초마다 ' + DB_TXT[d.kind] + ' 범위(' + d.r + ')를 예고 후 터뜨립니다</div>').join('');
      if (isK) extra += '<h3>각성 후 — ' + bd.awaken.name + '</h3><div class="d" style="margin:4px 0">쓰러지면 속성에 맞는 모습으로 각성해 부활합니다.</div>' + Object.keys(bd.abil2).filter(x => x !== 'debuff').map(x => '<div class="d" style="margin:4px 0">• ' + (SK_TXT[x] ? SK_TXT[x](bd.abil2[x]) : x) + '</div>').join('');
      if (bd === CFG.finalBoss) extra += '<div class="d" style="margin:8px 0">한 번 쓰러져도 각성해서 부활합니다. 첫 형태 처치 시 체력이 다시 차오릅니다.</div>';
    } else if (k === 'j') {
      const d = C.jobDef(a, b), c = CFG.units[a], t2 = !CFG.jobs[a].t1.some(x => x.id === b); name = d.name; desc = d.desc;
      try { img = portrait('u', a, c, null, { job: b, jobTier: t2 ? 2 : 1 }, true).toDataURL(); } catch (e) {}
      rows = [['직업', c.name + ' ' + (t2 ? '2차' : '1차') + ' 전직'], ['기본 체력', c.hp], ['기본 공격력', c.atk || c.heal || 0], ['사거리', c.range || 0]];
    } else {
      const n = C.ctNode(a), T = CFG.castleTree; name = n.name; desc = n.desc; let path = a, vr = null, fin = null;
      if (T.t2[a]) { path = a; } else for (const r in T.t2) { if (T.t2[r].some(x => x.id === a)) { path = r; vr = a; } else for (const v of T.t2[r]) if ((T.t3[v.id] || []).some(x => x.id === a)) { path = r; vr = v.id; fin = a; } }
      try { img = castlePortrait({ cpath: path, cvar: vr, cfin: fin }); } catch (e) {}
      rows = [['종류', n.kind || ''], ['선택 시점', '성 Lv.' + CFG.castleTree.lv[fin ? 2 : vr ? 1 : 0]]];
    }
    return back + '<div class="uwrap" style="margin-top:8px">' + (img ? '<img class="uimg" alt="" src="' + img + '" style="width:118px;height:104px;object-fit:contain">' : '') + '<div><h3 style="margin:0 0 4px">' + name + '</h3><div class="d">' + desc + '</div>' + statTable(rows) + '</div></div>' + extra;
  }
  function renderMeta() {
    const M = Meta.data(), body = $('metaBody'); for (const b of document.querySelectorAll('#metaTabs button')) b.classList.toggle('on', b.dataset.t === metaTab);
    $('metaTitle').textContent = metaTab === 'rank' ? '랭킹' : '컬렉션'; body.innerHTML = '';
    if (metaTab === 'codex') {
      const sect = (title, items) => {
        const seen = items.filter(i => i.seen).length, h3 = document.createElement('h3'); h3.textContent = title + ' ' + seen + '/' + items.length; body.appendChild(h3);
        const g = document.createElement('div'); g.className = 'cgrid';
        for (const it of items) { const c = document.createElement('div'); c.className = 'cc' + (it.seen ? '' : ' lock') + (it.det ? ' clk' : ''); if (it.det) c.dataset.det = it.det; if (it.img) { const im = document.createElement('img'); im.alt = ''; im.src = it.img; c.appendChild(im); } else c.appendChild(portrait(it.team, it.kind, it.cfg, it.look, it.ext || null, true)); const n = document.createElement('div'); n.className = 'n'; n.textContent = it.seen ? it.name : '???'; const s = document.createElement('div'); s.className = 's'; s.textContent = it.seen ? it.desc : (it.lockTxt || '아직 만나지 못했어요'); c.append(n, s); g.appendChild(c); }
        body.appendChild(g);
      };
      if (codexSel) { body.innerHTML = codexDetail(codexSel); return; }
      sect('유닛', C.UNIT_TYPES.concat(SPECIALS).map(t => ({ team: 'u', kind: t, cfg: CFG.units[t], name: CFG.units[t].name, desc: UNIT_TEXT[t] || '', seen: !!M.codex.units[t], det: 'u:' + t })));
      const logged = new Set(); for (const g of M.games) if (g.log) for (const e of g.log) if (e[0] === 'j' || e[0] === 'n') logged.add(e[2]); // 예전 기록에서 고른 이름도 인정
      { const items = []; for (const t of ['sword', 'archer', 'priest']) { const J = CFG.jobs[t]; J.t1.forEach(d => items.push({ team: 'u', kind: t, cfg: CFG.units[t], ext: { job: d.id, jobTier: 1 }, name: d.name, desc: '1차 · ' + CFG.units[t].name, lockTxt: '아직 선택하지 않았어요', seen: !!(M.codex.jobs[d.id] || logged.has(d.name)), det: 'j:' + t + ':' + d.id })); for (const k in J.t2) J.t2[k].forEach(d => items.push({ team: 'u', kind: t, cfg: CFG.units[t], ext: { job: d.id, jobTier: 2 }, name: d.name, desc: '2차 · ' + (J.t1.find(x => x.id === k) || {}).name, lockTxt: '아직 선택하지 않았어요', seen: !!(M.codex.jobs[d.id] || logged.has(d.name)), det: 'j:' + t + ':' + d.id })); } sect('전직', items); }
      { const T = CFG.castleTree, items = [], add = (n, tier, path, vr, fin, parent) => items.push({ name: n.name, desc: (tier === 1 ? '1단계' : tier === 2 ? '2단계 · ' : '최종 · ') + (tier === 1 ? '' : parent), img: castlePortrait({ cpath: path, cvar: vr, cfin: fin }), lockTxt: '아직 선택하지 않았어요', seen: !!(M.codex.castle[n.id] || logged.has(n.name)), det: 'c:' + n.id });
        for (const r of T.roots) { add(r, 1, r.id, null, null, ''); for (const a of T.t2[r.id]) { add(a, 2, r.id, a.id, null, r.name); for (const f of T.t3[a.id]) add(f, 3, r.id, a.id, f.id, a.name); } } sect('성', items); }
      sect('몬스터', Object.keys(CFG.enemies).filter(k => k !== 'boss').map(k => ({ team: 'e', kind: k, cfg: CFG.enemies[k], name: CFG.enemies[k].name, desc: CFG.enemies[k].desc || '', seen: !!M.codex.enemies[k], det: 'e:' + k })));
      sect('보스', CFG.bossPool.concat([CFG.act1Boss, CFG.finalBoss], Object.values(CFG.kings), [CFG.dragon]).map(b => ({ team: 'e', kind: 'boss', cfg: CFG.enemies.boss, look: Object.assign({ r: b.r || 30 }, b.look), name: b.name, desc: b.line ? '“' + b.line + '”' : '', seen: !!M.codex.bosses[b.id], det: 'b:' + b.id })));
    } else if (metaTab === 'rank') {
      body.innerHTML = '<div id="rankbox"></div>'; showRank(null);
    } else if (metaTab === 'stats' && statDetail !== null && M.games[statDetail]) {
      body.innerHTML = gameDetail(M.games[statDetail]);
    } else if (metaTab === 'stats') {
      const t = M.tot, h = Math.floor(t.time / 3600), mi = Math.floor(t.time % 3600 / 60);
      body.innerHTML = '<div class="sumrow"><div><b>' + t.games + '</b>플레이</div><div><b>' + t.kills.toLocaleString() + '</b>처치</div><div><b>' + M.best.round + '</b>최고 라운드</div><div><b>' + Math.round(t.spent).toLocaleString() + '</b>사용 골드</div><div><b>' + t.bossKills + '</b>보스 처치</div><div><b>' + h + '시간 ' + mi + '분</b>총 플레이</div></div>'
        + (M.games.length ? '<div class="mhint" style="margin:0 0 6px">기록을 누르면 자세히 볼 수 있어요</div><table class="gtable"><tr><th>날짜</th><th>성</th><th>라운드</th><th>처치</th><th>시간</th><th>번 골드</th></tr>' + M.games.map((g, gi) => '<tr class="clk" data-gi="' + gi + '"><td>' + dfmt(g.at) + '</td><td>' + (g.cn && g.cn.length ? g.cn[g.cn.length - 1] : '-') + '</td><td' + (g.round > C.MAX_ROUND ? ' class="win"' : '') + '>' + g.round + '</td><td>' + g.kills + '</td><td>' + fmtTime(g.time) + '</td><td>' + g.earned.toLocaleString() + '</td></tr>').join('') + '</table>' : '<div class="d">아직 끝난 게임이 없어요.</div>');
    } else {
      const done = Meta.ACH.filter(a => M.ach[a.id]).length; body.innerHTML = '<h3>달성 ' + done + '/' + Meta.ACH.length + '</h3>';
      for (const a of Meta.ACH) { const v = Math.min(a.goal, a.val()), ok = !!M.ach[a.id]; body.insertAdjacentHTML('beforeend', '<div class="arow' + (ok ? ' done' : '') + '"><div class="ic">' + (ok ? '★' : '☆') + '</div><div class="tx"><div class="nm">' + a.name + '</div><div class="ds">' + a.desc + '</div><div class="bar"><i style="width:' + (v / a.goal * 100) + '%"></i></div></div><div class="pc">' + Math.round(v).toLocaleString() + '/' + a.goal.toLocaleString() + '</div></div>'); }
    }
  }
  let statDetail = null;
  // 한 판의 상세: 라운드별로 고른 강화 카드·전직·성 업그레이드·뽑은 유닛, 그리고 그때 있었던 다른 선택지
  function gameDetail(g, backId) {
    const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let h = '<button class="backbtn" id="' + (backId || 'statBack') + '">← 목록으로</button><h3 style="margin-top:8px">' + (g.name ? esc(g.name) + ' · ' : '') + dfmt(g.at) + (g.win ? ' · 게임 클리어' : '') + '</h3>'
      + '<div class="pickrow"><div><b>전직</b> ' + (g.jobs ? (g.jobs.length ? g.jobs.map(j => esc(j[0]) + ': ' + esc(j[1])).join(' / ') : '없음') : '기록 없음') + '</div><div><b>성</b> ' + (g.cn ? (g.cn.length ? g.cn.map(esc).join(' › ') : '선택 없음') : '기록 없음') + '</div></div>'
      + '<div class="sumrow"><div><b>' + g.round + '</b>도달 라운드</div><div><b>' + g.kills.toLocaleString() + '</b>처치</div><div><b>' + fmtTime(g.time) + '</b>플레이 시간</div>' + (g.earned === undefined ? '' : '<div><b>' + g.earned.toLocaleString() + '</b>번 골드</div><div><b>' + (g.spent || 0).toLocaleString() + '</b>쓴 골드</div><div><b>Lv.' + (g.castle || 1) + ' · ' + (g.pop || 0) + '명</b>마지막 성 · 유닛</div>') + '</div>';
    if (!g.log) return h + '<div class="d">이 판의 자세한 라운드별 기록은 저장되어 있지 않아요.</div>';
    const rounds = new Map(), get = r => { if (!rounds.has(r)) rounds.set(r, []); return rounds.get(r); };
    for (const e of g.log) {
      const r = e[1], row = get(r);
      if (e[0] === 'c') row.push('<div>🃏 <b>' + esc(e[2]) + '</b> Lv ' + e[3] + '<span class="alt">선택지: ' + e[4].map((n, i) => n === e[2] ? '<u>' + esc(n) + '</u>' : esc(n)).join(' / ') + '</span></div>');
      else if (e[0] === 'j') row.push('<div>🎖 <b>' + esc(e[2]) + '</b><span class="alt">선택지: ' + e[3].map(n => n === e[2] ? '<u>' + esc(n) + '</u>' : esc(n)).join(' / ') + '</span></div>');
      else if (e[0] === 'n') row.push('<div>🏯 성 능력 <b>' + esc(e[2]) + '</b><span class="alt">선택지: ' + e[3].map(n => n === e[2] ? '<u>' + esc(n) + '</u>' : esc(n)).join(' / ') + '</span></div>');
      else if (e[0] === 'k') row.push('<div>🏰 성 <b>Lv ' + e[2] + '</b> 업그레이드</div>');
      else if (e[0] === 'u') { const last = row[row.length - 1]; const t = (CFG.units[e[2]] || {}).name + ' ×' + e[3]; if (last && last.startsWith('<div class="us">')) row[row.length - 1] = last.replace('</div>', ' · ' + t + '</div>'); else row.push('<div class="us">⚔️ 뽑은 유닛: ' + t + '</div>'); }
    }
    h += '<h3>라운드별 기록</h3>';
    for (const [r, row] of [...rounds.entries()].sort((a, b) => a[0] - b[0])) h += '<div class="lrow"><div class="lr">R' + r + '</div><div class="lb">' + row.join('') + '</div></div>';
    return h + (rounds.size ? '' : '<div class="d">기록이 없어요.</div>');
  }
  $('metaBody').addEventListener('click', e => {
    if (e.target.closest('#codexBack')) { codexSel = null; renderMeta(); $('metaBody').scrollTop = listScroll; return; }
    const cc = e.target.closest('.cc[data-det]'); if (cc) { if (cc.classList.contains('lock')) { toast(cc.querySelector('.s').textContent); return; } listScroll = $('metaBody').scrollTop; codexSel = cc.dataset.det; renderMeta(); $('metaBody').scrollTop = 0; return; }
    if (e.target.closest('#rankBack')) { rankScroll = listScroll; renderMeta(); return; }
    const rr = e.target.closest('tr[data-ri]'); if (rr) { const g = rankList[+rr.dataset.ri]; if (g) { listScroll = $('metaBody').scrollTop; const d = g.d || g.detail || {}; $('metaBody').innerHTML = gameDetail(Object.assign({}, g, d, { name: g.name, at: g.at || Date.now() }), 'rankBack'); $('metaBody').scrollTop = 0; } return; }
    if (e.target.closest('#statBack')) { statDetail = null; renderMeta(); $('metaBody').scrollTop = listScroll; return; } const tr = e.target.closest('tr[data-gi]'); if (tr) { listScroll = $('metaBody').scrollTop; statDetail = +tr.dataset.gi; renderMeta(); $('metaBody').scrollTop = 0; } });
  function openMeta(tab) { $('metaPanel').classList.toggle('rankOnly', tab === 'rank'); metaTab = tab; statDetail = null; codexSel = null; openModal('metaPanel'); renderMeta(); }
  $('metaTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { metaTab = b.dataset.t; statDetail = null; codexSel = null; renderMeta(); $('metaBody').scrollTop = 0; } });
  Meta.onUnlock(list => { for (const a of list) { toast('🏆 업적 달성: ' + a.name); } A2.play('ui'); });
  let lastSyncRound = 0, auraSec = 0;


  // ───────────── 이벤트 → 화면 효과 ─────────────
  // 이벤트 → 효과음 (위치가 있는 소리는 확대·거리에 따라 크기가 달라진다)
  const SHOT_SND = { a: 'shotA', ea: 'shotEA', c: 'shotC', t: 'shotT', b: 'shotB', es: 'shotES', em: 'shotC' };
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
      case 'castleBlast': A2.play('bigBoom', ev.x, ev.y); break;
      case 'castlePulse': A2.play('heal', CX, CY); break;
      case 'raise': A2.play('cast', ev.x, ev.y); break;
      case 'castlePick': A2.play('job'); break;
      case 'castleRepair': A2.play('heal', CX, CY); break;
      case 'bossDying': A2.play('bigBoom', ev.x, ev.y); break;
      case 'bossRevive': A2.alarm(); A2.play('rage'); break;
      case 'bossGone': A2.play('bigBoom', ev.x, ev.y); A2.play('boom', ev.x, ev.y); break;
      case 'bossDash': A2.play('dash', ev.x, ev.y); break;
      case 'bossShield': A2.play('shield', ev.x, ev.y); break;
      case 'bossSummon': A2.play('summon', ev.x, ev.y); break;
      case 'strikeWarn': A2.play('cast', ev.x, ev.y); break;
      case 'strikeHit': A2.play(ev.kind === 'bolt' || ev.kind === 'fire' || ev.kind === 'slam' ? 'bigBoom' : 'boom', ev.x, ev.y); break;
      case 'dragonIntro': A2.alarm(); A2.play('rumble'); break;
      case 'dragonRise': A2.play('bigBoom', ev.x, ev.y); A2.play('rage'); break;
      case 'dragonUp': case 'dragonLand': A2.play('bigBoom', ev.x, ev.y); break;
      case 'bossRage': A2.play('rage', ev.x, ev.y); break;
      case 'bossClone': case 'bossRoar': A2.play('rage', ev.x, ev.y); break;
      case 'bossDrain': A2.play('rage', ev.x, ev.y); break;
      case 'bossAura': A2.play('shield', ev.x, ev.y); break;
      case 'bossFocus': A2.play('heal', ev.x, ev.y); break;
      case 'priceUp': A2.play('buy'); break;
      case 'crit': A2.play('crit', ev.x, ev.y); break;
      case 'bossCast': A2.play('cast', ev.x, ev.y); break;
      case 'debuffHit': A2.play(ev.kind === 'stun' ? 'stun' : 'debuff', ev.x, ev.y); break;
      case 'roundClear': A2.play('clear'); break;
      case 'act2': A2.play('cine'); break;
      case 'endlessStart': A2.play('cine'); break;
      case 'castleUp': A2.play('cine'); break;
      case 'omen': A2.alarm(); break;
      case 'castleAwaken': A2.play('cine'); A2.play('win'); break;
      case 'over': A2.play(ev.win ? 'win' : 'lose'); break;
    }
  }
  function handleEvents() {
    for (const ev of C.drainEvents(S)) {
      playEv(ev);
      if (ev.type === 'banner') banner(ev.text, ev.boss);
      else if (ev.type === 'shot') { /* 소리만 있는 이벤트 */ }
      else if (ev.type === 'crit') addFx({ k: 'crit', x: ev.x, y: ev.y, t: 0, max: 0.4, c: '#ffd23f' });
      else if (ev.type === 'bossCast') { addFx({ k: 'zone', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.warn, c: DBK[ev.kind][1], kind: ev.kind }); toast('보스가 ' + DBK[ev.kind][0] + ' 광역기를 시전!'); }
      else if (ev.type === 'debuffHit') { addFx({ k: 'impact', x: ev.x, y: ev.y, r: ev.r, kind: ev.kind, t: 0, max: 0.9 }); if (ev.kind === 'stun') addShake(9, 0.3); addFx({ k: 'boom', x: ev.x, y: ev.y, r: ev.r, t: 0, max: 0.4, big: false, enemy: true, c: DBK[ev.kind][1] }); }
      else if (ev.type === 'roundClear') banner('라운드 ' + ev.round + ' 클리어!');
      else if (ev.type === 'castleBlast') {
        const col = JOBC[ev.cfin] || JOBC[ev.cvar] || JOBC.arcane, dl = -ev.k * 0.28;
        addFx({ k: 'beam', x: ev.x - 70, y: ev.y - 230, tx: ev.x, ty: ev.y, t: dl - 0.22, max: 0.22, c: col });
        addFx({ k: 'ring', x: ev.x, y: ev.y, t: dl, max: 0.7, c: col, r: ev.r * 1.25, big: true }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: dl - 0.08, max: 0.5, c: '#ffffff', r: ev.r * 0.7 });
        for (let i = 0; i < 6; i++) addFx({ k: 'dust', x: ev.x + (Math.random() - 0.5) * ev.r, y: ev.y + (Math.random() - 0.5) * ev.r * 0.7, t: dl, max: 0.9, r: 10 + Math.random() * 10 });
        if (ev.zone > 0) addFx({ k: 'pool', x: ev.x, y: ev.y, r: ev.r * 0.95, t: dl, max: ev.zone, c: ['#ff7a1a', '#ffb24a', '#ffe9a0'] });
        if (ev.freeze) addFx({ k: 'ring', x: ev.x, y: ev.y, t: dl, max: 0.9, c: '#eaf8ff', r: ev.r * 1.5, big: true });
      }
      else if (ev.type === 'castlePulse') { const col = JOBC[ev.cfin] || JOBC[ev.cvar] || JOBC.guardian; addFx({ k: 'ring', x: CX, y: CY, t: 0, max: 0.9, c: col, r: ev.r, big: true }); addFx({ k: 'ring', x: CX, y: CY, t: -0.12, max: 0.7, c: '#ffffff', r: ev.r * 0.7 }); if (ev.dmg) for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; addFx({ k: 'beam', x: CX + Math.cos(a) * 40, y: CY + Math.sin(a) * 40 - 8, tx: CX + Math.cos(a) * ev.r, ty: CY + Math.sin(a) * ev.r - 8, t: 0, max: 0.35, c: col, small: true }); } }
      else if (ev.type === 'raise') { addFx({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: 0.5, c: '#3ae68a', big: true }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.5, c: '#7affc8', r: 28 }); }
      else if (ev.type === 'undeadFade') addFx({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: 0.4, c: '#3ae68a' });
      else if (ev.type === 'marked') addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.35, c: '#ff5a5a', r: 16 });
      else if (ev.type === 'fireTick') { for (let i = 0; i < 2; i++) { const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * ev.r; addFx({ k: 'burst', x: ev.x + Math.cos(a) * rr, y: ev.y + Math.sin(a) * rr, t: 0, max: 0.4, c: i ? '#ffd23a' : '#ff7a1a' }); } }
      else if (ev.type === 'castleRepair') { addFx({ k: 'heal', x: ev.x, y: ev.y, t: 0, max: 0.9 }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.7, c: '#7dff9a', r: 60, big: true }); }
      else if (ev.type === 'castlePick') banner('성: ' + ev.name, true);
      else if (ev.type === 'lastStand') banner('불사 결계 발동! 성이 되살아났다', true);
      else if (ev.type === 'bossRevive') { toast('성 주변만 남기고 땅이 무너진다'); banner(ev.name === '각성한 마왕' ? '더이상!! 참지!! 않겠다!!' : ev.name + '!! 이제부터가 진짜다!!', true); for (let i = 0; i < 3; i++) addFx({ k: 'ring', x: ev.x, y: ev.y, t: -i * 0.35, max: 1.1, c: i % 2 ? '#ff7a3a' : '#ff2a4a', r: ev.r * 3, big: true }); }
      else if (ev.type === 'bossRevived') { banner('최후의 결전!', true); addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.8, c: '#ffffff', big: true }); }
      else if (ev.type === 'bossGone') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.9, c: '#ffffff', r: ev.r * 3.5, big: true }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: -0.1, max: 1, c: '#ffd166', r: ev.r * 2.5, big: true }); for (let k = 0; k < 14; k++) addFx({ k: 'dust', x: ev.x + (Math.random() - 0.5) * ev.r * 2.4, y: ev.y + (Math.random() - 0.5) * ev.r * 1.6, t: 0, max: 1.3, r: 14 + Math.random() * 18 }); }
      else if (ev.type === 'bossWipe') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.9, c: '#ffffff', big: true }); toast('남은 적이 모두 쓰러졌어요'); }
      else if (ev.type === 'kill') { addFx({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: ev.boss ? 0.8 : 0.3, c: ev.boss ? '#c77dff' : '#ff8a5c', big: ev.boss }); }
      else if (ev.type === 'udead') {
        addFx({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: 0.4, c: '#8fb7ff' });
        if (ev.ut) feedAdd(ev.by ? { team: 'e', kind: ev.by.kind, look: ev.by.look, r: ev.by.r } : null, '⚔️', { team: 'u', type: ev.ut, job: ev.job, jt: ev.jt }, (CFG.units[ev.ut] || {}).name + ' 쓰러짐', '');
      }
      else if (ev.type === 'heal') { addFx({ k: 'beam', x: ev.x, y: ev.y - 11, tx: ev.tx, ty: ev.ty - 7, t: 0, max: ev.aoe ? 0.3 : 0.45, c: ev.enemy ? '#ffb86b' : (ev.job && JOBC[ev.job]) || '#6bffa3', small: !!ev.aoe }); if (!ev.aoe) addFx({ k: 'heal', x: ev.tx, y: ev.ty, t: 0, max: 0.5 }); }
      else if (ev.type === 'spawn') { addFx({ k: 'summon', x: ev.x, y: ev.y, t: 0, max: 0.8 }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.55, c: '#8fd0ff', big: true }); }
      else if (ev.type === 'chain') { addFx({ k: 'line', x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, t: 0, max: 0.25, c: ev.small ? '#b9f5c8' : '#9ad0ff', small: ev.small }); }
      else if (ev.type === 'boom') { addFx({ k: 'boom', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.big ? 0.6 : 0.3, big: ev.big, enemy: ev.enemy }); }
      else if (ev.type === 'num') {
        const zz = cam.zoom; if (numFx >= 70 || (zz < 0.45 && !ev.crit) || Math.abs(ev.x - cam.x) > vw / 2 / zz + 40 || Math.abs(ev.y - cam.y) > vh / 2 / zz + 40) continue;
        if (fx.length >= 300) continue; numFx++; addFx({ k: 'num', x: ev.x + (Math.random() - 0.5) * 14, y: ev.y, t: 0, max: ev.crit ? 0.95 : 0.75, v: Math.round(ev.v), n: ev.heal ? 'h' : ev.crit ? 'c' : ev.team === 'u' ? 'u' : 'e' });
      }
      else if (ev.type === 'newEnemy') showNewEnemy(ev.kind);
      else if (ev.type === 'castleUp') { addFx({ k: 'ring', x: CX, y: CY, t: 0, max: 0.9, c: '#ffd166', big: true, r: 150 }); addFx({ k: 'ring', x: CX, y: CY, t: -0.15, max: 0.8, c: '#ffffff', r: 110 }); addFx({ k: 'summon', x: CX, y: CY + 30, t: 0, max: 0.9 }); toast('성 Lv.' + ev.lv + (ev.pop < 1e8 ? ' — 인구 상한 ' + ev.pop : ' — 최대 레벨: 인구 제한 없음') + (ev.cannons > 1 ? ' · 대포 ' + ev.cannons + '문' : '')); }
      else if (ev.type === 'melee') { if (fx.length < 220 && cam.zoom > 0.4) addFx({ k: 'slash', x: ev.tx, y: ev.ty, a: Math.atan2(ev.ty - ev.y, ev.tx - ev.x), t: 0, max: ev.job === 'berserker' ? 0.28 : 0.2, c: atkColor(ev.job, ev.ut), st: SLASH[ev.job] || SLASH[ev.ut] }); }
      else if (ev.type === 'emelee') { if (fx.length < 220 && cam.zoom > 0.4) { addFx({ k: 'slash', x: ev.tx, y: ev.ty, a: Math.atan2(ev.ty - ev.y, ev.tx - ev.x), t: 0, max: 0.26, c: '#ff4adf', big: true }); } }
      else if (ev.type === 'bossShock') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.55, c: '#ffcf40', r: ev.r, big: true }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: -0.08, max: 0.5, c: '#ff5a3a', r: ev.r * 0.7 }); for (let i = 0; i < 5; i++) addFx({ k: 'dust', x: ev.x + (Math.random() - 0.5) * ev.r, y: ev.y + (Math.random() - 0.5) * ev.r * 0.6, t: -Math.random() * 0.1, max: 0.9, r: 16 }); }
      else if (ev.type === 'bossBlink') { for (const [x, y] of [[ev.x0, ev.y0], [ev.x1, ev.y1]]) { addFx({ k: 'ring', x, y, t: 0, max: 0.6, c: '#c77dff', big: true }); addFx({ k: 'summon', x, y, t: 0, max: 0.7 }); } toast('보스가 순간이동했습니다!'); }
      else if (ev.type === 'bossLeap') { addFx({ k: 'zone', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.air, c: '#ff9a3a' }); toast('보스가 도약합니다!'); }
      else if (ev.type === 'portalOpen') pendingPortal = ev.n;
      else if (ev.type === 'bossSlam') addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.4, c: '#ff5a3a', r: ev.r, big: true });
      else if (ev.type === 'enrage') toast('적이 오래 살아남아 격노합니다! 점점 더 강해져요');
      else if (ev.type === 'elite') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.6, c: '#ffd84a', big: true }); if (eliteToasts < 3) { eliteToasts++; toast('엘리트 ' + CFG.enemies[ev.kind].name + ' 출현! 훨씬 강하고 큽니다'); } }
      else if (ev.type === 'rainZone') addFx({ k: 'pool', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.dur, c: ['#ffd84a', '#fff2a0', '#fff6c0'] });
      else if (ev.type === 'rainTick') { for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * ev.r, tx = ev.x + Math.cos(a) * rr, ty = ev.y + Math.sin(a) * rr; addFx({ k: 'beam', x: tx - 30, y: ty - 150, tx, ty, t: 0, max: 0.22, c: '#ffe98a' }); } }
      else if (ev.type === 'dashTrail') addFx({ k: 'dust', x: ev.x, y: ev.y, t: 0, max: 0.35, r: 12 });
      else if (ev.type === 'poisonPool') addFx({ k: 'pool', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.dur });
      else if (ev.type === 'reward') toast('보상 획득: ' + ev.name);
      else if (ev.type === 'heroSkill') {
        if (ev.kind === 'marksman') addFx({ k: 'beam', x: ev.x, y: ev.y - 11, tx: ev.tx, ty: ev.ty - 7, t: 0, max: 0.4, c: '#ffe14a' });
        else { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.55, c: ev.kind === 'hero' ? '#ffe14a' : '#c8a46a', big: true }); addFx({ k: 'ring', x: ev.x, y: ev.y, t: -0.08, max: 0.5, c: '#ffffff' }); }
      }
      else if (ev.type === 'dodge') { if (fx.length < 300) addFx({ k: 'ring', x: ev.x, y: ev.y - 4, t: 0, max: 0.3, c: '#bfe8ff', r: 14 }); }
      else if (ev.type === 'revive') {
        addFx({ k: 'heal', x: ev.x, y: ev.y, t: 0, max: 0.8 });
        const pr = S.units.find(u => u.type === 'priest' && !u.dead);
        if (ev.ut) feedAdd({ team: 'u', type: 'priest', job: pr && pr.job, jt: pr && pr.jobTier }, '✚', { team: 'u', type: ev.ut, job: ev.job, jt: ev.jt }, (CFG.units[ev.ut] || {}).name + ' 부활', 'rv'); else toast('아군이 부활했어요');
      }
      else if (ev.type === 'picked') { toast(ev.name + ' 획득'); }
      else if (ev.type === 'notice') toast(ev.text);
      else if (ev.type === 'espawn') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: ev.boss ? 0.9 : 0.45, c: '#ff5a5a', big: ev.boss }); }
      else if (ev.type === 'priceUp') toast('소환으로 모든 유닛 가격이 올랐어요');
      else if (ev.type === 'promote') {
        banner(ev.className + ' → ' + ev.name + ' 전직!');
        for (const u of S.units) if (u.type === ev.unitType && fx.length < 300) addFx({ k: 'ring', x: u.x, y: u.y, t: 0, max: 0.7, c: '#ffd166' });
      }
      else if (ev.type === 'bossSay') saySpeech(ev.name, ev.text);
      else if (ev.type === 'bossDash') addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.5, c: '#ffb21a' });
      else if (ev.type === 'bossShield') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.6, c: '#8fd8ff' }); toast('보스가 방어막을 둘렀어요'); }
      else if (ev.type === 'bossSummon') { for (let k = 0; k < 3; k++) addFx({ k: 'ring', x: ev.x, y: ev.y, t: -k * 0.12, max: 0.7, c: '#ff6b6b', big: true }); toast('보스가 ' + (CFG.enemies[ev.kind] ? CFG.enemies[ev.kind].name : '졸개') + ' ' + ev.n + '마리를 불렀어요!'); }
      else if (ev.type === 'bossClone') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.8, c: '#7fa8ff' }); banner('분신 소환!'); }
      else if (ev.type === 'bossDrain') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.8, c: '#8a0a1a' }); for (const p of ev.pts || []) addFx({ k: 'drainLn', x: ev.x, y: ev.y, tx: p.x, ty: p.y, t: 0, max: 0.9 }); toast('마왕이 검붉은 선으로 생명을 빨아들입니다'); }
      else if (ev.type === 'bossAura') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.7, c: '#8fd8ff' }); toast((ev.name || '보스') + '이(가) 주변 적에게 방어막을 둘렀어요'); }
      else if (ev.type === 'bossRoar') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.7, c: '#ffb04a' }); toast('돌격왕의 함성! 주변 적이 빨라집니다'); }
      else if (ev.type === 'bossFocus') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.8, c: '#6fe08a' }); toast((ev.name || '보스') + '이(가) 정신을 집중해 체력을 회복합니다'); }
      else if (ev.type === 'strikeWarn') addFx({ k: 'strikeW', x: ev.x, y: ev.y, r: ev.r, ang: ev.ang, half: ev.half, len: ev.len, kind: ev.kind, shape: ev.shape, w2: ev.w2, claw: ev.claw, t: 0, max: Math.max(0.2, ev.t) });
      else if (ev.type === 'strikeHit') { addFx({ k: 'strikeH', x: ev.x, y: ev.y, r: ev.r, ang: ev.ang, half: ev.half, len: ev.len, kind: ev.kind, shape: ev.shape, w2: ev.w2, claw: ev.claw, t: 0, max: ev.shape === 'cone' ? 0.7 : ev.shape === 'line' ? 0.6 : 0.55 }); if (ev.kind !== 'ice' || ev.r > 300) addShake(ev.kind === 'slam' ? 14 : ev.kind === 'wind' ? 5 : ev.r > 250 ? 12 : 6, ev.kind === 'slam' ? 0.45 : 0.3); }
      else if (ev.type === 'omen') { if (ev.id !== 'dragon') showBossIntro({ name: ev.name, line: ev.line, look: ev.look, r: ev.r, long: true, omen: ev.id }); toast(ev.id === 'dragon' ? '용의 기운이 맵 가장자리에 감돕니다' : '사천왕의 기운이 맵 가장자리에 감돕니다'); }
      else if (ev.type === 'castleAwaken') { banner('성채 각성!', true); for (let i = 0; i < 4; i++) addFx({ k: 'ring', x: CX, y: CY, t: -i * 0.12, max: 1.0, c: '#ffe27a', big: true, r: 200 }); addShake(8, 0.5); }
      else if (ev.type === 'dragonRise') { banner(ev.back ? '용이 하늘에서 내려온다!!' : '재앙의 용이 모습을 드러낸다!!', true); flash('#ff3a1a', ev.back ? 0.2 : 0.45); addShake(ev.back ? 4 : 14, ev.back ? 0.5 : 1.2); if (!ev.back) { // 단상 가장자리에 충격파와 먼지·불씨가 터진다
        for (let i = 0; i < 4; i++) addFx({ k: 'ring', x: ev.x, y: ev.y + 40, t: -i * 0.45, max: 1.3, c: i % 2 ? '#ff7a3a' : '#ffd9a0', grow: 420 + i * 80, big: true });
        for (let i = 0; i < 26; i++) addFx({ k: 'burst', x: ev.x + (Math.random() - 0.5) * 760, y: ev.y + 20 + Math.random() * 60, t: -Math.random() * 0.6, max: 0.9 + Math.random() * 0.8, c: i % 3 ? '#8a6a44' : '#ff8a2a', big: i % 4 === 0 }); } }
      else if (ev.type === 'dragonIntro') { { const zf = Math.min(vw / 1500, vh / 1250); cam.zoom = Math.max(minZoom(), Math.min(cam.zoom, zf)); centerOnCore(); clampCam(); } banner('땅이 갈라진다…', true); toast('성 주변만 남기고 모든 땅이 무너진다'); }
      else if (ev.type === 'dragonLand') { flash('#ffd9a0', 0.5); addShake(20, 1.0); // 착지: 충격파와 먼지
        for (let i = 0; i < 4; i++) addFx({ k: 'ring', x: ev.x, y: ev.y + 40, t: -i * 0.15, max: 1.1, c: i % 2 ? '#ff7a3a' : '#ffd9a0', grow: 520 + i * 90, big: true });
        for (let i = 0; i < 30; i++) addFx({ k: 'burst', x: ev.x + (Math.random() - 0.5) * 900, y: ev.y + 20 + Math.random() * 70, t: -Math.random() * 0.3, max: 0.9 + Math.random() * 0.8, c: i % 3 ? '#8a6a44' : '#ff8a2a', big: i % 4 === 0 }); A2.play('bigBoom', ev.x, ev.y); }
      else if (ev.type === 'dragonUp') { banner('용이 하늘로 날아오른다!', true); addShake(10, 0.6); }
      else if (ev.type === 'dragonAway') { toast('용이 구름 위로 사라졌다 — 땅 위를 도는 그림자를 따라 불덩이가 떨어진다!'); flash('#000000', 0.25); }
      else if (ev.type === 'bossClone') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.8, c: '#9ad0ff' }); toast((ev.name || '보스') + ' 분신술! 분신 ' + ev.n + '기'); }
      else if (ev.type === 'bossRage') { addFx({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.8, c: '#ff3b1a' }); banner(ev.name + ' 분노!'); }
      else if (ev.type === 'over') { if (ev.win) setTimeout(() => { if (!S || !S.win) return; if (params.get('nocine') || !running) showEnd(true); else playComic('ending', () => showEnd(true)); }, 600); else startDefeat(); }
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
  // 보스 사망 모션: 몸이 흔들리고 깜박이다가 주저앉으며 사라진다. 부활할 때는 새 모습으로 커지며 나타난다
  function drawDyingBoss(e, now) {
    const D = S.bossDeath; let a = 1, sx = 1, sy = 1, ox = 0, oy = 0, blink = false;
    if (D && D.b === e && e.dragon) { // 용: 포효하며 몸부림치다가 절벽 아래로 추락한다
      const p = Math.min(1, D.t / D.dur); ox = Math.sin(now * 0.07) * (p < 0.4 ? 6 : 3); blink = p < 0.45 && ((now / 80) | 0) % 2 === 0; e.fallK = p < 0.4 ? 0 : Math.min(1, (p - 0.4) / 0.6);
    } else if (D && D.b === e) {
      if (D.stage === 'die') {
        const p = Math.min(1, D.t / D.dur); ox = Math.sin(now * 0.09) * (1 - p * 0.5) * 4; blink = p < 0.8 && ((now / 70) | 0) % 2 === 0;
        if (p > 0.45) { const q = (p - 0.45) / 0.55; sy = 1 - 0.6 * q * q; sx = 1 + 0.25 * q; oy = q * 6; a = 1 - q * q * q; }
      } else {
        const p = Math.min(1, (D.t - D.t0) / CFG.finalNerf.reviveT); a = Math.min(1, p * 2.5); sx = sy = 0.75 + 0.25 * Math.min(1, p * 1.4); blink = p < 0.3 && ((now / 60) | 0) % 2 === 0;
        ctx.save(); ctx.globalAlpha = 0.35 * (1 - p); ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.ellipse(e.x, e.y - 8, e.r * (1.2 + p), e.r * (1.8 + p), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    const f0 = e.flash; e.flash = blink ? 0.1 : 0;
    ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(ox, oy); ctx.translate(e.x, e.y); ctx.scale(sx, sy); ctx.translate(-e.x, -e.y);
    Figures.draw(ctx, e, now); ctx.restore(); e.flash = f0; if (!e.dragon) e.fallK = 0;
  }
  // 보스 사망·부활 연출 카메라: 보스에게 이동·확대하고, 끝나면 원래 시점으로 돌아온다
  let dcam = null;
  function updateDeathCam(dt) {
    const D = S.bossDeath;
    if (D) {
      if (!dcam) dcam = { prev: { x: cam.x, y: cam.y, zoom: cam.zoom }, fxT: 0 };
      const b = D.b, k = 1 - Math.exp(-4 * dt);
      if (b.dragon) { const zt = Math.max(minZoom(), Math.min(1.1, vw / 1500, vh / 1050)); cam.x += (b.x - cam.x) * k; cam.y += (b.y - (b.vr || b.r) * 0.9 - cam.y) * k; cam.zoom += (zt - cam.zoom) * k; clampCam(); } // 용: 머리까지 보이도록 용에게 화면을 맞춘다
      else { cam.x += (b.x - cam.x) * k; cam.y += (b.y - 14 - cam.y) * k; cam.zoom += (Math.max(1.5, dcam.prev.zoom) - cam.zoom) * k; clampCam(); }
      if (b.dragon && D.stage === 'die') { const p = D.t / D.dur; if (p > 0.4 && Math.random() < 0.5) { const bx = b.x + (Math.random() - 0.5) * 900; addFx({ k: 'dust', x: bx, y: b.y + 10 + Math.random() * 30, t: 0, max: 1.2, r: 22 + Math.random() * 22 }); addFx({ k: 'burst', x: bx, y: b.y + Math.random() * 30, t: 0, max: 0.9, c: Math.random() < 0.5 ? '#8a6a44' : '#ff8a2a' }); } if (p > 0.4) addShake(10, 0.2); }
      if (D.stage === 'die' && (dcam.fxT -= dt) <= 0) { // 사망 중 터지는 불꽃과 연기
        dcam.fxT = b.dragon ? 0.1 : 0.16; const a = Math.random() * 6.283, rr0 = b.dragon ? (b.vr || b.r) * 0.8 : b.r * 0.9, r = Math.random() * rr0, x = b.x + Math.cos(a) * r, y = (b.dragon ? b.y - Math.random() * (b.vr || b.r) * 1.3 : b.y - 10) + Math.sin(a) * r * 0.7 * (b.dragon ? 0.3 : 1);
        addFx({ k: 'ring', x, y, t: 0, max: 0.55, c: Math.random() < 0.5 ? '#ffb347' : '#ff4a2a', r: 26 + Math.random() * 26, big: true });
        for (let i = 0; i < 2; i++) addFx({ k: 'dust', x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 20, t: 0, max: 1, r: 12 + Math.random() * 12 });
        if (Math.random() < 0.4) A2.play('boom', x, y);
      }
    } else if (dcam) {
      const k = 1 - Math.exp(-3.5 * dt); cam.x += (dcam.prev.x - cam.x) * k; cam.y += (dcam.prev.y - cam.y) * k; cam.zoom += (dcam.prev.zoom - cam.zoom) * k; clampCam();
      if (Math.abs(cam.x - dcam.prev.x) < 3 && Math.abs(cam.y - dcam.prev.y) < 3 && Math.abs(cam.zoom - dcam.prev.zoom) < 0.02) dcam = null;
    }
  }
  const ELEM_COL = { thunder: '#ffe14a', snow: '#8fd8ff', earth: '#c28a52' };
  function bossAura(e, now, z) {
    const el = e.look && e.look.elem; if (el && !e.dying) { // 사천왕: 속성 기운 (뇌=번개 불꽃, 설=눈송이, 토=떠오르는 돌)
      const col = ELEM_COL[el], p2 = e.look.p2; ctx.globalAlpha = (p2 ? 0.26 : 0.14) + 0.06 * Math.sin(now * 0.008); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(e.x, e.y + 8, e.r * (p2 ? 2.0 : 1.6), e.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9; const n = p2 ? 9 : 5;
      for (let i = 0; i < n; i++) { const a = now * 0.002 * (i % 2 ? 1 : -1) + i * 6.283 / n, rr = e.r * (1.1 + 0.5 * ((i * 7) % 3) / 3), px = e.x + Math.cos(a) * rr, py = e.y - e.r * 0.6 + Math.sin(a) * rr * 0.7;
        if (el === 'thunder') { if (Math.sin(now * 0.02 + i * 3) > 0.2) { ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.moveTo(px, py - 8); ctx.lineTo(px + 4, py - 1); ctx.lineTo(px - 3, py + 1); ctx.lineTo(px + 2, py + 9); ctx.stroke(); } }
        else if (el === 'snow') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py + ((now * 0.03 + i * 20) % 30) - 15, 2.4, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = '#8a6a44'; ctx.fillRect(px - 3, py - 3 - 6 * Math.abs(Math.sin(now * 0.004 + i)), 6, 6); } }
      ctx.globalAlpha = 1;
    }
    if (e.look && e.look.p2 && !e.dying) { ctx.globalAlpha = 0.22 + 0.08 * Math.sin(now * 0.01); ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 6, e.r * 1.7, e.r * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (e.enraged) { ctx.globalAlpha = 0.25 + 0.1 * Math.sin(now * 0.015); ctx.fillStyle = '#ff2a1a'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 8, e.r * 1.5, e.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (e.dashT > 0 && e._ang !== undefined) {
      ctx.strokeStyle = 'rgba(255,200,120,.7)'; ctx.lineWidth = 3 / z; ctx.lineCap = 'round';
      for (let k = -2; k <= 2; k++) { const ox = Math.cos(e._ang + Math.PI / 2) * k * 8, oy = Math.sin(e._ang + Math.PI / 2) * k * 8; ctx.beginPath(); ctx.moveTo(e.x + ox - Math.cos(e._ang) * 18, e.y + oy - Math.sin(e._ang) * 18); ctx.lineTo(e.x + ox - Math.cos(e._ang) * (60 + Math.abs(k) * 6), e.y + oy - Math.sin(e._ang) * (60 + Math.abs(k) * 6)); ctx.stroke(); }
    }
  }
  // 상태이상 표시: 머리 위 아이콘 (기절=별, 중독=초록 방울, 공격력 감소=붉은 화살표, 치유 감소=보라 십자)
  function statusMarks(e, now, z) {
    const top = e.y + Figures.headTop(e); let x = e.x - ((+!!(e.stunT > 0) + +!!(e.poisonT > 0) + +!!(e.weakT > 0) + +!!(e.woundT > 0) + +!!(e.chillT > 0)) - 1) * 6, y = top - 8; const s = 1 / Math.max(0.7, z) * 1.05;
    if (e.stunT > 0) { ctx.fillStyle = '#ffe14a'; for (let i = 0; i < 3; i++) { const a = now * 0.008 + i * 2.09; ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * 9 * s, top - 4 + Math.sin(a) * 3 * s, 2.4 * s, 0, 7); ctx.fill(); } x += 0; }
    if (e.poisonT > 0) { ctx.fillStyle = '#7be04a'; ctx.beginPath(); ctx.arc(x, y, 3.2 * s, 0, 7); ctx.fill(); ctx.fillRect(x - 0.8 * s, y - 7 * s, 1.6 * s, 3 * s); x += 12 * s; }
    if (e.weakT > 0) { ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 3 * s); ctx.lineTo(x + 4 * s, y - 3 * s); ctx.lineTo(x, y + 4 * s); ctx.fill(); x += 12 * s; }
    if (e.chillT > 0) { ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 1.6 * s; for (let i = 0; i < 3; i++) { const a = i * 1.047; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 4.5 * s, y - Math.sin(a) * 4.5 * s); ctx.lineTo(x + Math.cos(a) * 4.5 * s, y + Math.sin(a) * 4.5 * s); ctx.stroke(); } x += 12 * s; }
    if (e.woundT > 0) { ctx.fillStyle = '#c77dff'; ctx.fillRect(x - 1.5 * s, y - 4 * s, 3 * s, 8 * s); ctx.fillRect(x - 4 * s, y - 1.5 * s, 8 * s, 3 * s); }
  }

  // 하늘에서 떨어지는 물체: p(0→1)에 따라 그림자가 커지고 물체가 내려온다. 기절=거대한 망치, 중독=독약통, 약화=저주의 해골, 상처=가시 창, 얼음=고드름, 바위=바윗덩이, 불=운석
  function drawFall(ctx, kind, x, y, r, p, src) {
    const sz = Math.max(16, Math.min(r * 0.55, 90)), e = p * p, dy = (1 - e) * (420 + r), a = Math.min(1, p * 4);
    if (p > 0.97) return;
    ctx.save(); ctx.globalAlpha = 0.35 * e; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x, y, sz * (0.4 + 0.8 * e), sz * (0.2 + 0.4 * e), 0, 0, 6.283); ctx.fill();
    ctx.globalAlpha = a; ctx.translate(x, y - dy); ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.5, sz * 0.07);
    if (kind === 'stun' || kind === 'hammer') { // 거대한 망치
      ctx.rotate(Math.sin(p * 9) * 0.05); ctx.fillStyle = '#8a5a2a'; ctx.strokeStyle = '#2a1608'; ctx.fillRect(-sz * 0.09, -sz * 1.5, sz * 0.18, sz * 1.5); ctx.strokeRect(-sz * 0.09, -sz * 1.5, sz * 0.18, sz * 1.5);
      ctx.fillStyle = '#9aa3b0'; ctx.strokeStyle = '#2b303a'; ctx.fillRect(-sz * 0.62, -sz * 0.5, sz * 1.24, sz * 0.62); ctx.strokeRect(-sz * 0.62, -sz * 0.5, sz * 1.24, sz * 0.62);
      ctx.fillStyle = '#ffe14a'; ctx.fillRect(-sz * 0.62, -sz * 0.5, sz * 1.24, sz * 0.12); ctx.fillStyle = '#c9d2de'; ctx.fillRect(-sz * 0.56, -sz * 0.36, sz * 0.2, sz * 0.4);
    } else if (kind === 'poison') { // 독약통
      ctx.rotate(0.25 + p * 3); ctx.fillStyle = 'rgba(190,240,255,.55)'; ctx.strokeStyle = '#2a4a2a'; ctx.beginPath(); ctx.ellipse(0, 0, sz * 0.5, sz * 0.55, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6fe03a'; ctx.beginPath(); ctx.ellipse(0, sz * 0.12, sz * 0.43, sz * 0.4, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(190,240,255,.55)'; ctx.fillRect(-sz * 0.17, -sz * 0.9, sz * 0.34, sz * 0.4); ctx.strokeRect(-sz * 0.17, -sz * 0.9, sz * 0.34, sz * 0.4);
      ctx.fillStyle = '#8a5a2a'; ctx.fillRect(-sz * 0.22, -sz * 1.05, sz * 0.44, sz * 0.18);
      ctx.fillStyle = '#e8ffd0'; ctx.font = '900 ' + sz * 0.5 + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('☠', 0, sz * 0.25);
    } else if (kind === 'weak') { // 저주의 해골
      ctx.fillStyle = '#e8e2d2'; ctx.strokeStyle = '#2a1010'; ctx.beginPath(); ctx.arc(0, -sz * 0.1, sz * 0.62, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.fillRect(-sz * 0.33, sz * 0.3, sz * 0.66, sz * 0.38); ctx.strokeRect(-sz * 0.33, sz * 0.3, sz * 0.66, sz * 0.38);
      ctx.fillStyle = '#d02020'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * sz * 0.27, -sz * 0.1, sz * 0.17, sz * 0.2, 0, 0, 6.283); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,60,60,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, sz * 0.95, 0, 6.283); ctx.stroke();
    } else if (kind === 'wound') { // 가시 창
      ctx.fillStyle = '#c77dff'; ctx.strokeStyle = '#2a1040'; ctx.beginPath(); ctx.moveTo(0, sz * 1.1); ctx.lineTo(-sz * 0.3, -sz * 0.3); ctx.lineTo(0, -sz * 0.9); ctx.lineTo(sz * 0.3, -sz * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8c8ff'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * sz * 0.25, -sz * 0.1); ctx.lineTo(k * sz * 0.62, -sz * 0.4); ctx.lineTo(k * sz * 0.3, sz * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    } else if (kind === 'ice') { // 거대한 고드름
      ctx.fillStyle = '#d8f4ff'; ctx.strokeStyle = '#4f9ccc'; ctx.beginPath(); ctx.moveTo(0, sz * 1.1); ctx.lineTo(-sz * 0.34, -sz * 0.6); ctx.lineTo(sz * 0.34, -sz * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(-sz * 0.1, -sz * 0.5); ctx.lineTo(0, sz * 0.8); ctx.lineTo(-sz * 0.2, -sz * 0.5); ctx.fill();
    } else if (kind === 'rock') { // 바윗덩이
      ctx.rotate(p * 4); ctx.fillStyle = '#8a6a44'; ctx.strokeStyle = '#3a2a16'; ctx.beginPath(); for (let i = 0; i < 9; i++) { const an = i / 9 * 6.283, rr = sz * (0.62 + ((i * 5) % 3) * 0.14); ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6b4e2c'; ctx.beginPath(); ctx.arc(sz * 0.15, sz * 0.1, sz * 0.25, 0, 6.283); ctx.fill();
    } else { // 운석
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, sz * 1.1); g.addColorStop(0, '#fff1a0'); g.addColorStop(0.45, '#ff8a2a'); g.addColorStop(1, 'rgba(200,40,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, sz * 1.1, 0, 6.283); ctx.fill(); ctx.fillStyle = '#4a1a0a'; ctx.beginPath(); ctx.arc(0, 0, sz * 0.5, 0, 6.283); ctx.fill();
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-sz * 0.4, 0); ctx.lineTo(0, -sz * 2.4); ctx.lineTo(sz * 0.4, 0); ctx.fill();
    }
    ctx.restore();
  }
  // 광역 상태이상이 땅에 닿는 순간의 효과
  function drawImpact(ctx, f, p, z) {
    const a = 1 - p, r = f.r, x = f.x, y = f.y;
    ctx.save();
    if (f.kind === 'stun') { // 충격파 + 갈라진 땅 + 별
      ctx.globalAlpha = a * 0.7; ctx.strokeStyle = '#fff2a0'; ctx.lineWidth = 8 / z * a + 2 / z; ctx.beginPath(); ctx.arc(x, y, r * (0.2 + 0.8 * Math.min(1, p * 2.2)), 0, 6.283); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = '#3a2a14'; ctx.lineWidth = 3 / z; ctx.beginPath(); for (let i = 0; i < 8; i++) { const an = i * 0.785 + 0.3; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(an) * r * 0.45, y + Math.sin(an) * r * 0.35); ctx.lineTo(x + Math.cos(an + 0.15) * r * 0.75, y + Math.sin(an + 0.15) * r * 0.6); } ctx.stroke();
      ctx.fillStyle = '#ffe14a'; ctx.font = '900 ' + 22 / z + 'px sans-serif'; ctx.textAlign = 'center'; for (let i = 0; i < 5; i++) { const an = i * 1.256 + p * 3; ctx.fillText('★', x + Math.cos(an) * r * 0.55, y + Math.sin(an) * r * 0.4 - p * 40 / z); }
    } else if (f.kind === 'poison') { // 약병이 깨져 튀는 독
      ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#6fe03a'; ctx.beginPath(); ctx.arc(x, y, r * (0.3 + 0.7 * Math.min(1, p * 2.5)), 0, 6.283); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = '#a8ff6a'; for (let i = 0; i < 12; i++) { const an = i * 0.524 + 0.2, d = r * 0.85 * Math.min(1, p * 2.2) * (0.6 + (i % 3) * 0.2); ctx.beginPath(); ctx.arc(x + Math.cos(an) * d, y + Math.sin(an) * d * 0.8 - Math.sin(p * 3.1) * 26 / z, (5 - (i % 3)) / z * 1.3, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = 'rgba(190,240,255,.8)'; for (let i = 0; i < 6; i++) { const an = i * 1.05 + 0.5, d = r * 0.4 * Math.min(1, p * 3); ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * d, y + Math.sin(an) * d - 4); ctx.lineTo(x + Math.cos(an) * d + 6, y + Math.sin(an) * d + 4); ctx.lineTo(x + Math.cos(an) * d - 5, y + Math.sin(an) * d + 5); ctx.fill(); }
    } else if (f.kind === 'weak') { // 붉은 저주 문양
      ctx.globalAlpha = a * 0.6; ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 4 / z; ctx.beginPath(); ctx.arc(x, y, r * (0.4 + 0.6 * Math.min(1, p * 2)), 0, 6.283); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 5; i++) { const an = -1.57 + i * 2.513, rr = r * 0.7 * Math.min(1, p * 2.4); ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#ff6b6b'; ctx.globalAlpha = a; for (let i = 0; i < 8; i++) { const an = i * 0.785, d = r * 0.8 * p; ctx.fillRect(x + Math.cos(an) * d - 3, y + Math.sin(an) * d * 0.8 - p * 30 / z - 3, 6, 6); }
    } else { // wound: 보랏빛 가시가 솟아오름
      ctx.globalAlpha = a * 0.4; ctx.fillStyle = '#b060ff'; ctx.beginPath(); ctx.arc(x, y, r * (0.3 + 0.7 * Math.min(1, p * 3)), 0, 6.283); ctx.fill();
      ctx.globalAlpha = a; ctx.fillStyle = '#e0b8ff'; ctx.strokeStyle = '#5a2a90'; ctx.lineWidth = 1.5 / z; const h = 40 * Math.min(1, p * 4) * (1 - p * 0.4);
      for (let i = 0; i < 12; i++) { const an = i * 0.524 + 0.1, d = r * (0.3 + 0.55 * ((i * 7) % 5) / 5), bx = x + Math.cos(an) * d, by = y + Math.sin(an) * d * 0.8; ctx.beginPath(); ctx.moveTo(bx - 5, by); ctx.lineTo(bx, by - h); ctx.lineTo(bx + 5, by); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();
  }
  const STRIKE_COL = { bolt: '#ffe14a', ice: '#8fd8ff', rock: '#c28a52', fire: '#ff6a2a', wind: '#d8f2ff', slash: '#c8203a', hammer: '#d9a441', sweep: '#dfe3f0', slam: '#c28a52' };
  // ── 100라운드: 성 주변만 남기고 땅이 무너져 절벽이 된다 ──
  // 남는 땅 = 성 둘레 원 + 용이 서는 네 자리의 받침 + 그 사이를 잇는 십자 다리
  const DR = CFG.dragon, SAFE_R = 330, PAD_R = 190, BR_W = 80;
  // 무너진 땅의 남은 모양. 용 레이드(100R)는 북쪽을 직각으로 깎은 평평한 단상(용이 솟는 자리)에 서·동·남쪽 발판과 다리가 이어진다. 사천왕·마왕 2차전은 성 둘레 + 네 발판 + 십자 다리.
  const dragonMap = () => !S || !S.cliffTheme;
  const inSafe = (x, y, pad) => {
    if (dragonMap()) {
      const T = CY - DR.cut;
      if (Math.hypot(x - CX, y - CY) <= SAFE_R + pad && y >= T - pad) return true;
      if (y >= T - 10 - pad && y <= CY - 80) { const k = Math.max(0, (y - (T + 80)) / (CY - 80 - (T + 80))), hw = DR.plateau - (DR.plateau - 318) * k * k; if (Math.abs(x - CX) <= hw + pad) return true; }
      if (Math.abs(y - CY) <= BR_W + pad && Math.abs(x - CX) <= DR.anchorX + PAD_R) return true;
      if (Math.abs(x - CX) <= BR_W + pad && y >= CY && y <= CY + DR.anchorY + PAD_R) return true;
      return [[0, DR.anchorY], [-DR.anchorX, 0], [DR.anchorX, 0]].some(a => Math.hypot(x - CX - a[0], y - CY - a[1]) <= PAD_R + pad);
    }
    return Math.hypot(x - CX, y - CY) <= SAFE_R + pad; // 사천왕·마왕 2차전: 성 둘레의 원만 남는다
  };
  function safePath(c, dy) {
    c.beginPath(); const cx = CX, cy = CY + dy;
    if (dragonMap()) {
      const cut = DR.cut, T = cy - cut, xr = Math.sqrt(SAFE_R * SAFE_R - cut * cut), a1 = Math.atan2(-cut, xr), a2 = Math.atan2(-cut, -xr) + Math.PI * 2;
      c.moveTo(cx - xr, T); c.lineTo(cx + xr, T); c.arc(cx, cy, SAFE_R, a1, a2, false); c.closePath(); // 북쪽이 평평하게 깎인 성 둘레 땅
      { // 자연스러운 바위 단상: 울퉁불퉁한 윗면, 둥글게 깎인 모서리, 아래로 갈수록 좁아져 성 둘레 땅과 이어지는 어깨선 (용이 이 가장자리에서 솟는다)
        const P = DR.plateau, R = 80, rim = x => T - (22 + 9 * Math.sin(x * 0.021) + 7 * Math.sin(x * 0.047 + 1.3) + 4 * Math.sin(x * 0.11 + 0.4)), yj = CY + dy - 80;
        c.moveTo(cx - P + R, rim(-P + R));
        for (let x = -P + R + 12; x <= P - R; x += 12) c.lineTo(cx + x, rim(x));
        c.quadraticCurveTo(cx + P + 6, rim(P - R) - 4, cx + P - 4, T + R); // 오른쪽 모서리
        c.bezierCurveTo(cx + P + 8, T + 150, cx + 400, yj - 70, cx + 318, yj); // 오른쪽 어깨 → 성 둘레 땅
        c.lineTo(cx - 318, yj);
        c.bezierCurveTo(cx - 400, yj - 70, cx - P - 8, T + 150, cx - P + 4, T + R); // 왼쪽 어깨
        c.quadraticCurveTo(cx - P - 6, rim(-P + R) - 4, cx - P + R, rim(-P + R)); c.closePath();
      }
      for (const a of [[0, DR.anchorY], [-DR.anchorX, 0], [DR.anchorX, 0]]) { c.moveTo(cx + a[0] + PAD_R, cy + a[1]); c.arc(cx + a[0], cy + a[1], PAD_R, 0, Math.PI * 2); }
      c.rect(cx - DR.anchorX, cy - BR_W, DR.anchorX * 2, BR_W * 2); c.rect(cx - BR_W, cy, BR_W * 2, DR.anchorY);
      return;
    }
    c.moveTo(cx + SAFE_R, cy); c.arc(cx, cy, SAFE_R, 0, Math.PI * 2);
  }
  const CRACKS = (() => { let a = 12345; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }, out = []; for (let i = 0; i < 90; i++) { const x = r() * W, y = r() * H, pts = [[x, y]]; for (let k = 0; k < 4; k++) { const l = pts[pts.length - 1]; pts.push([l[0] + (r() - 0.5) * 120, l[1] + (r() - 0.3) * 90]); } out.push(pts); } return out; })();
  // 무너진 땅의 배경: 용(기본)·마왕(어둠)·설왕(얼음과 눈)·뇌왕(폭풍)·토왕(용암)마다 다르다
  const CLIFF_TH = {
    dragon: { bg: ['#2a1318', '#0e070c'], c1: [255, 90, 30], c2: [255, 200, 90], side: ['#4a3828', '#6a5238', '#85694a'], edge: '#2a1c10', tint: null },
    dark:   { bg: ['#1a0828', '#030107'], c1: [150, 40, 230], c2: [235, 170, 255], side: ['#1e1428', '#30224a', '#46326a'], edge: '#08040e', tint: 'rgba(40,10,70,0.30)' },
    snow:   { bg: ['#12385a', '#050f1c'], c1: [90, 190, 255], c2: [235, 250, 255], side: ['#5f95b8', '#98c4e0', '#d2eaf8'], edge: '#27526f', tint: 'rgba(225,244,255,0.38)' },
    thunder:{ bg: ['#241c40', '#06050f'], c1: [255, 210, 40], c2: [255, 255, 190], side: ['#3c3a50', '#575470', '#767294'], edge: '#16141f', tint: 'rgba(255,230,90,0.10)' },
    earth:  { bg: ['#4a1a06', '#150602'], c1: [255, 110, 20], c2: [255, 210, 80], side: ['#4a3420', '#6e4e2e', '#8e6a40'], edge: '#24160a', tint: 'rgba(120,70,20,0.22)' },
  };
  function cliffFx(th, now, x0, y0, x1, y1, z) { // 허공에 떠도는 입자 (배경 속성에 따라 다르다)
    const w = x1 - x0 + 120, h = y1 - y0 + 120;
    if (th === 'snow') { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 70; i++) { const sp = 40 + (i * 37) % 60, px = x0 - 60 + ((i * 193.7 + now * 0.012 * (sp / 60) + Math.sin(now * 0.001 + i) * 20) % w + w) % w, py = y0 - 60 + ((i * 331.3 + now * 0.05 * (sp / 60)) % h); ctx.globalAlpha = 0.55 + 0.4 * ((i * 7) % 3) / 2; ctx.beginPath(); ctx.arc(px, py, (1.5 + (i % 3)) / Math.sqrt(z) * 1.3, 0, 6.283); ctx.fill(); } ctx.globalAlpha = 1; }
    else if (th === 'dark') { for (let i = 0; i < 26; i++) { const ph = (now * 0.00012 * (0.6 + (i % 5) * 0.2) + i * 0.137) % 1, px = x0 - 60 + ((i * 271.9) % w), py = y0 - 60 + h * (1 - ph); ctx.globalAlpha = Math.sin(ph * 3.14) * 0.55; ctx.fillStyle = i % 4 ? '#7a2ab8' : '#c01a3a'; ctx.beginPath(); ctx.arc(px, py, (3 + i % 4) / Math.sqrt(z), 0, 6.283); ctx.fill(); } ctx.globalAlpha = 1; for (let i = 0; i < 5; i++) { const px = x0 - 60 + ((i * 523.1 + now * 0.01) % w), py = y0 + h * (0.15 + 0.17 * i), g = ctx.createRadialGradient(px, py, 0, px, py, 220); g.addColorStop(0, 'rgba(70,20,110,0.28)'); g.addColorStop(1, 'rgba(70,20,110,0)'); ctx.fillStyle = g; ctx.fillRect(px - 220, py - 220, 440, 440); } } // 검붉은 불씨와 보랏빛 안개
    else if (th === 'thunder') { const k = Math.floor(now / 900), ph = (now % 900) / 900; if (ph < 0.22) { const r = n => { const s = Math.sin(k * 91.7 + n * 12.9) * 43758.5; return s - Math.floor(s); }; ctx.strokeStyle = 'rgba(255,250,190,' + (1 - ph / 0.22) + ')'; ctx.lineWidth = 3 / z; ctx.lineJoin = 'miter'; for (let b = 0; b < 2; b++) { let px = x0 + r(b) * (x1 - x0), py = y0 - 40; ctx.beginPath(); ctx.moveTo(px, py); while (py < y1 + 40) { px += (r(py * 0.01 + b) - 0.5) * 90; py += 55 + r(px * 0.01) * 40; ctx.lineTo(px, py); } ctx.stroke(); } ctx.fillStyle = 'rgba(255,240,150,' + 0.12 * (1 - ph / 0.22) + ')'; ctx.fillRect(x0 - 60, y0 - 60, w, h); } }
    else { for (let i = 0; i < 34; i++) { const ph = (now * 0.0002 * (0.5 + (i % 5) * 0.25) + i * 0.173) % 1, px = x0 - 60 + ((i * 311.3 + Math.sin(now * 0.002 + i) * 14) % w), py = y0 - 60 + h * (1 - ph); ctx.globalAlpha = Math.sin(ph * 3.14) * 0.9; ctx.fillStyle = i % 3 ? '#ff8a2a' : '#ffd860'; ctx.beginPath(); ctx.arc(px, py, (1.6 + i % 3) / Math.sqrt(z), 0, 6.283); ctx.fill(); } ctx.globalAlpha = 1; } // 불씨
  }
  function drawCliff(now, x0, y0, x1, y1, z) {
    const TH = CLIFF_TH[S.cliffTheme] || CLIFF_TH.dragon, k = S.cliff, e = 1 - Math.pow(1 - k, 2), Rt = (1 - e) * 2100; // 가장자리부터 안쪽으로 무너져 들어온다
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - 60, y0 - 60, x1 - x0 + 120, y1 - y0 + 120); ctx.arc(CX, CY, Rt, 0, Math.PI * 2); ctx.clip('evenodd');
    const g = ctx.createRadialGradient(CX, CY, 300, CX, CY, 1500); g.addColorStop(0, TH.bg[0]); g.addColorStop(1, TH.bg[1]); ctx.fillStyle = g; ctx.fillRect(x0 - 60, y0 - 60, x1 - x0 + 120, y1 - y0 + 120);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const pu = 0.55 + 0.45 * Math.sin(now * 0.004), c1 = TH.c1.join(','), c2 = TH.c2.join(',');
    cliffFx(S.cliffTheme, now, x0, y0, x1, y1, z);
    for (const c of CRACKS) { if (c[0][0] < x0 - 130 || c[0][0] > x1 + 130 || c[0][1] < y0 - 130 || c[0][1] > y1 + 130) continue; ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.strokeStyle = 'rgba(' + c1 + ',' + (0.35 * pu) + ')'; ctx.lineWidth = 7 / z; ctx.stroke(); ctx.strokeStyle = 'rgba(' + c2 + ',' + (0.7 * pu) + ')'; ctx.lineWidth = 2 / z; ctx.stroke(); }
    ctx.fillStyle = TH.side[0]; safePath(ctx, 46); ctx.fill(); ctx.fillStyle = TH.side[1]; safePath(ctx, 26); ctx.fill(); ctx.fillStyle = TH.side[2]; safePath(ctx, 10); ctx.fill(); // 절벽의 옆면 (아래로 깊게)
    ctx.strokeStyle = TH.edge; ctx.lineWidth = 14; ctx.lineJoin = 'round'; safePath(ctx, 0); ctx.stroke(); // 벼랑 끝선 (안쪽 절반은 아래에서 땅이 덮는다)
    ctx.save(); safePath(ctx, 0); ctx.clip(); Scenery.drawGround(ctx, x0, y0, x1, y1); if (TH.tint) { ctx.fillStyle = TH.tint; ctx.fillRect(x0 - 60, y0 - 60, x1 - x0 + 120, y1 - y0 + 120); } ctx.restore(); // 남은 땅만 다시 풀밭으로 (속성에 맞게 물들인다)
    ctx.restore();
  }
  // 날아간 용의 그림자: 날개를 펄럭이는 거대한 검은 그림자가 땅 위를 지나간다
  function drawDragonShadow(e, now) {
    const s = (e.vr || 260) / 100, fl = Math.sin(now * 0.006) * 0.12; ctx.save(); ctx.translate(e.shx, e.shy); ctx.rotate((e.shAng || 0) + Math.PI / 2);
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#05030a';
    ctx.beginPath(); ctx.ellipse(0, 0, 16 * s, 46 * s, 0, 0, Math.PI * 2); ctx.fill(); // 몸통
    ctx.beginPath(); ctx.moveTo(0, 44 * s); ctx.quadraticCurveTo(6 * s, 70 * s, 0, 100 * s); ctx.quadraticCurveTo(-6 * s, 70 * s, 0, 44 * s); ctx.fill(); // 꼬리
    ctx.beginPath(); ctx.ellipse(0, -52 * s, 9 * s, 17 * s, 0, 0, Math.PI * 2); ctx.fill(); // 머리
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * 10 * s, -14 * s); ctx.quadraticCurveTo(k * 70 * s, (-48 + fl * 60) * s, k * 128 * s, (-8 + fl * 120) * s); ctx.lineTo(k * 100 * s, 6 * s); ctx.lineTo(k * 78 * s, 22 * s); ctx.lineTo(k * 58 * s, 18 * s); ctx.lineTo(k * 38 * s, 34 * s); ctx.quadraticCurveTo(k * 16 * s, 30 * s, k * 10 * s, 22 * s); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  let risePulse = 0;
  let dragonFramed = 0; // 용 등장 때 화면을 맞춘 보스
  let omLast = null; // 직전에 떠 있던 사천왕의 기운 (등장 후에도 잠시 남는다)
  const OMEN_COL = { thunder: '#ffd814', snow: '#6fd0ff', earth: '#b8803c', dragon: '#ff5a1a' };
  const drawList = [], byY = (p, q) => p.y - q.y, LITE_AT = 140;
  let liteMode = false, drawnCount = 0;
  function drawWorld(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, vw, vh);
    const z = cam.zoom;
    let shx = 0, shy = 0; if (S.bossDeath && S.bossDeath.stage === 'revive' && S.cliff > 0 && S.cliff < 1) { shx = (Math.random() - 0.5) * 8; shy = (Math.random() - 0.5) * 8; } else if (S.dragonIntro) { const k = Math.min(1, S.dragonIntro.t / 1.2) * (S.dragonIntro.t > S.dragonIntro.dur - 0.8 ? 0.3 : 1); shx = (Math.random() - 0.5) * 9 * k; shy = (Math.random() - 0.5) * 9 * k; } else if (shakeT > 0) { const k = Math.min(1, shakeT / 0.3); shx = (Math.random() - 0.5) * shakeA * k; shy = (Math.random() - 0.5) * shakeA * k; }
    ctx.setTransform(dpr * z, 0, 0, dpr * z, (vw / 2 - cam.x * z + shx) * dpr, (vh / 2 - cam.y * z + shy) * dpr);
    const x0 = Math.max(0, cam.x - vw / 2 / z), x1 = Math.min(W, cam.x + vw / 2 / z), y0 = Math.max(0, cam.y - vh / 2 / z), y1 = Math.min(H, cam.y + vh / 2 / z);
    // 맵 바닥: 풀밭, 흙길, 돌바닥 광장, 덤불·바위·꽃 (조각으로 캐시)
    const p0 = performance.now();
    Scenery.drawGround(ctx, x0, y0, x1, y1);
    const cliffOn = S.cliff > 0; if (cliffOn) drawCliff(now, x0, y0, x1, y1, z);
    for (const e of S.enemies) if (e.dragon && e.hidden && e.shx !== undefined) drawDragonShadow(e, now);
    for (const e of S.enemies) if (e.dragon && e.fromSky && e.riseT > 0) { const k = e.riseT / (e.riseDur || 3); ctx.save(); ctx.globalAlpha = 0.5 * (1 - k * 0.7); ctx.fillStyle = '#05030a'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 40, (140 + 330 * (1 - k)), (40 + 90 * (1 - k)), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } // 내려오는 용의 그림자가 커진다
    // 적 출현 포탈: 길 위의 붉은 룬 원 (화면 바로 밖에서 적이 나타난다)
    const angs = C.spawnAngles(S.spawnPts || 2);
    if (cliffOn && !S.cliffTheme && S.round === C.FINAL_ROUND && S.cliff >= 1) for (const pd of [[-DR.anchorX, 0], [DR.anchorX, 0], [0, DR.anchorY]]) Scenery.drawPortal(ctx, CX + pd[0], CY + pd[1], now); // 용 레이드: 서·동·남쪽 발판에서 몬스터가 나온다
    if (!cliffOn) for (const a of angs) { const px = CX + Math.cos(a) * C.SPAWN_RING, py = CY + Math.sin(a) * C.SPAWN_RING; if (px > x0 - 60 && px < x1 + 60 && py > y0 - 40 && py < y1 + 40) Scenery.drawPortal(ctx, px, py, now); }
    if (!cliffOn) for (const a of C.extraAngles(S.extraPts || 0)) { const px = CX + Math.cos(a) * C.EXTRA_RING, py = CY + Math.sin(a) * C.EXTRA_RING; if (px > x0 - 60 && px < x1 + 60 && py > y0 - 40 && py < y1 + 40) Scenery.drawPortal(ctx, px, py, now); }

    const c = S.core;
    // 성 사거리
    ctx.strokeStyle = 'rgba(90,169,255,.18)'; ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.arc(c.x, c.y, c.range, 0, Math.PI * 2); ctx.stroke();
    // 오라 범위: 바닥에 종류별 색(치유=초록, 방어=파랑, 공격=주황, 속도=노랑)으로 선명하게 깔린다
    if (S.aura.on) {
      const A = S.aura, R = A.r, kinds = [];
      if (A.heal > 0) kinds.push('#6bdc8b'); if (A.def > 0) kinds.push('#6ab8ff'); if (A.atk > 0) kinds.push('#ff8a5a'); if (A.spd > 0) kinds.push('#ffe27a');
      const gr = ctx.createRadialGradient(c.x, c.y, R * 0.3, c.x, c.y, R); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.22)');
      ctx.fillStyle = kinds[0]; ctx.globalAlpha = 0.13; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.fill();
      kinds.forEach((col, i) => { ctx.strokeStyle = col; ctx.globalAlpha = 0.8; ctx.lineWidth = 3 / z; ctx.setLineDash([14 / z, 9 / z]); ctx.lineDashOffset = (i % 2 ? 1 : -1) * now * 0.012 / z; ctx.beginPath(); ctx.arc(c.x, c.y, R - i * 7, 0, Math.PI * 2); ctx.stroke(); });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      if (A.heal > 0) { // 치유 오라: 1초마다 성에서 퍼져 나가는 약한 초록 파동 + 회복 중인 아군 위에 작은 치유 표시
        const ph = S.t % 1; ctx.strokeStyle = '#6bdc8b'; ctx.lineWidth = 6 / z; ctx.globalAlpha = (1 - ph) * 0.3; ctx.beginPath(); ctx.arc(c.x, c.y, R * (0.15 + 0.85 * ph), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        const sec = Math.floor(S.t); if (sec !== auraSec) { auraSec = sec; if (!paused && fx.length < 200) { let n = 0; for (const u of S.units) { if (u.dead || !u.aura || u.undead || u.hp >= u.max || n >= 10) continue; n++; addFx({ k: 'heal', x: u.x, y: u.y, t: 0, max: 0.55 }); } } }
      }
    }
    // 성 (포신이 적을 향해 돌고, 체력이 줄면 금·연기·불)
    Scenery.drawCastle(ctx, c, now);
    if (c.awk) { // 각성한 성채: 금빛 후광과 떠오르는 빛 입자
      const pu = 0.5 + 0.5 * Math.sin(now * 0.004); ctx.globalAlpha = 0.16 + 0.1 * pu; ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(c.x, c.y, 118 + 6 * pu, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffd34a'; ctx.lineWidth = 3 / z; ctx.beginPath(); ctx.arc(c.x, c.y, 112, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#fff3b0';
      for (let i = 0; i < 10; i++) { const a2 = i * 0.628 + now * 0.0004, rr = 100 + (i % 3) * 8; ctx.beginPath(); ctx.arc(c.x + Math.cos(a2) * rr, c.y + Math.sin(a2) * rr * 0.9 - ((now * 0.02 + i * 13) % 26), 2.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }

    const p1 = performance.now(); ema('ground', p1 - p0);
    // 유닛 + 적: 아래쪽에 있는 개체가 앞에 오도록 y 순서로 그린다
    // 화면 밖 개체는 그리지 않고(컬링), 적이 많거나 멀리서 볼 때는 간단한 그림을 쓴다(LOD)
    const mx = 100, vx0 = cam.x - vw / 2 / z - mx, vx1 = cam.x + vw / 2 / z + mx, vy0 = cam.y - vh / 2 / z - mx, vy1 = cam.y + vh / 2 / z + mx;
    const all = drawList; all.length = 0; let nEn = 0;
    for (let i = 0; i < S.units.length; i++) { const u = S.units[i]; if (u.x > vx0 && u.x < vx1 && u.y > vy0 && u.y < vy1) all.push(u); }
    for (let i = 0; i < S.enemies.length; i++) { const e = S.enemies[i]; if (e.hidden) continue; if (e.x > vx0 && e.x < vx1 && e.y > vy0 && e.y < vy1) { all.push(e); nEn++; } }
    if (cliffOn) { const n0 = all.length; Scenery.visibleTrees(x0, y0, x1, y1, all); let w = n0; for (let i = n0; i < all.length; i++) { const t = all[i]; if (inSafe(t.x, t.y, 20) || Math.hypot(t.x - CX, t.y - CY) <= Math.pow(1 - S.cliff, 2) * 2100) all[w++] = t; } all.length = w; } else Scenery.visibleTrees(x0, y0, x1, y1, all);
    const lite = nEn > LITE_AT || z < 0.5; liteMode = lite; drawnCount = all.length;
    all.sort(byY);
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (e._tree) { Scenery.drawTree(ctx, e, now); continue; }
      if (e.team === 'e' && e.enr && !lite) enrageGlow(e, now, z);
      if (e.team === 'u' && e.type && e.type.startsWith('legend')) legendGlow(e, now, z);
      if (e.elite) eliteGlow(e, now, z);
      if (lite && e.team === 'e' && e.kind !== 'boss') { Figures.drawLite(ctx, e); if (e.elite) eliteMark(e, z); continue; }
      if (e.undead) { ctx.globalAlpha = 0.4 + 0.15 * Math.sin(now * 0.01); ctx.fillStyle = '#3ae68a'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 6, e.r * 1.5, e.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      if (e.kind === 'boss') bossAura(e, now, z);
      if (e.team === 'u' && e.blT > 0 && !lite) { ctx.globalAlpha = 0.28 + 0.1 * Math.sin(now * 0.008); ctx.strokeStyle = '#ffe58a'; ctx.lineWidth = 1.6 / z; ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.6, e.r * 1.2, e.r * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      if (e.focusT > 0) { ctx.globalAlpha = 0.3 + 0.15 * Math.sin(now * 0.02); ctx.fillStyle = '#6fe08a'; ctx.beginPath(); ctx.arc(e.x, e.y - 6, e.r * (1.3 + 0.25 * Math.sin(now * 0.01)), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
      if (e.dying) drawDyingBoss(e, now); else Figures.draw(ctx, e, now);
      if (e.elite) eliteMark(e, z);
      if (e.team === 'u' && e.ward > 0) { ctx.globalAlpha = 0.22 + 0.1 * Math.sin(now * 0.01) + (e.wardFx > 0 ? 0.3 : 0); ctx.strokeStyle = '#8fd8ff'; ctx.fillStyle = '#8fd8ff'; ctx.lineWidth = 1.6 / z; ctx.beginPath(); ctx.arc(e.x, e.y - 4, e.r * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1; }
      if (e.team === 'e' && e.markT > 0) { ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 1.6 / z; ctx.globalAlpha = 0.9; const my = e.y + Figures.headTop(e) - 8, mr = 5 + Math.sin(now * 0.02); ctx.beginPath(); ctx.arc(e.x, my, mr, 0, Math.PI * 2); ctx.moveTo(e.x - mr - 3, my); ctx.lineTo(e.x + mr + 3, my); ctx.moveTo(e.x, my - mr - 3); ctx.lineTo(e.x, my + mr + 3); ctx.stroke(); ctx.globalAlpha = 1; }
      if (e.team === 'e' && e.frozenT > 0) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#bfe8ff'; ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.ellipse(e.x, e.y - 4, e.r * 1.3, e.r * 1.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1; }
      if (e.team === 'u' && (e.stunT > 0 || e.poisonT > 0 || e.weakT > 0 || e.woundT > 0)) statusMarks(e, now, z);
      if (e.shieldT > 0) { ctx.globalAlpha = 0.28 + 0.12 * Math.sin(now * 0.012); ctx.fillStyle = '#8fd8ff'; ctx.beginPath(); ctx.arc(e.x, e.y - 6, e.r * 1.7, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.9; ctx.strokeStyle = '#d8f2ff'; ctx.lineWidth = 2.5 / z; ctx.stroke(); ctx.globalAlpha = 1; }
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
      if (sh.color === 'h') { // 전투사제의 성스러운 구체
        const sp = 0.5 + 0.5 * Math.sin(now * 0.03 + sh.p * 20);
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(px, py, 8 + sp * 2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(px, py, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.4 / z; ctx.beginPath(); ctx.moveTo(px - 8, py); ctx.lineTo(px + 8, py); ctx.moveTo(px, py - 8); ctx.lineTo(px, py + 8); ctx.stroke();
      } else if (sh.color === 'c' && sh.job) { // 성 포탄: 갈래마다 다른 모양 (마탑=보라 마력구, 수호=금빛 성광, 사령=초록 혼불)
        const fam = CFAM(sh.job), col = JOBC[sh.job] || '#fff', ux = Math.cos(ang), uy = Math.sin(ang);
        for (let k = 4; k >= 1; k--) { ctx.globalAlpha = 0.12 * (5 - k); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px - ux * k * 5 + (fam === 'nec' ? Math.sin(now * 0.02 + k) * 2.5 : 0), py - uy * k * 5 + (fam === 'nec' ? Math.cos(now * 0.02 + k) * 2.5 : 0), 5.5 - k * 0.8, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 0.4; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = fam === 'nec' ? '#0e2a1a' : '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.arc(px, py, fam === 'gua' ? 5 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (fam === 'gua') { ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 1.4 / z; const r0 = now * 0.01; ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(px + Math.cos(r0 + k * 1.571) * 4, py + Math.sin(r0 + k * 1.571) * 4); ctx.lineTo(px + Math.cos(r0 + k * 1.571) * 11, py + Math.sin(r0 + k * 1.571) * 11); } ctx.stroke(); }
        if (fam === 'arc') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - 1.5, py - 1.5, 1.8, 0, Math.PI * 2); ctx.fill(); }
        if (fam === 'nec') { ctx.fillStyle = '#7affc8'; ctx.beginPath(); ctx.arc(px - 2, py - 1, 1.3, 0, Math.PI * 2); ctx.arc(px + 2, py - 1, 1.3, 0, Math.PI * 2); ctx.fill(); }
      } else if (sh.color === 'a' && JSHOT[sh.job] && !sh.crit) { // 직업별 화살/탄
        const J = sh.job, col = JOBC[J] || '#fff', ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
        if (J === 'gunner') { // 폭탄: 검은 구 + 주황 테두리 + 도화선 불꽃 + 연기 꼬리
          for (let k = 3; k >= 1; k--) { ctx.globalAlpha = 0.12 * (4 - k); ctx.fillStyle = '#8a8a96'; ctx.beginPath(); ctx.arc(px - ux * k * 5, py - uy * k * 5, 4 + k, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
          ctx.fillStyle = '#23232b'; ctx.strokeStyle = '#ff8a2a'; ctx.lineWidth = 1.8 / z; ctx.beginPath(); ctx.arc(px, py, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = Math.sin(now * 0.05) > 0 ? '#ffe36a' : '#ff5a1a'; ctx.beginPath(); ctx.arc(px + nx * 3 - ux * 3, py + ny * 3 - uy * 3 - 2, 1.8, 0, Math.PI * 2); ctx.fill();
        } else if (J === 'stormarcher') { // 세 갈래 질풍 화살
          ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
          for (const o of [-3.2, 0, 3.2]) { ctx.globalAlpha = o ? 0.7 : 1; ctx.beginPath(); ctx.moveTo(px + nx * o - ux * 8, py + ny * o - uy * 8); ctx.lineTo(px + nx * o + ux * 6, py + ny * o + uy * 6); ctx.stroke(); } ctx.globalAlpha = 1;
        } else if (J === 'hunter') { // 붉은 촉의 표식 화살
          ctx.strokeStyle = '#d8cfa8'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - ux * 7, py - uy * 7); ctx.lineTo(px + ux * 5, py + uy * 5); ctx.stroke();
          ctx.fillStyle = '#ff3a3a'; ctx.beginPath(); ctx.arc(px + ux * 6, py + uy * 6, 2.6, 0, Math.PI * 2); ctx.fill();
        } else { // 명사수(긴 황금 볼트 + 빛 꼬리) / 저격수(긴 노란 화살) / 속사수(짧고 빠른 화살)
          const len = J === 'deadeye' ? 26 : J === 'sniper' ? 20 : 9;
          if (J === 'deadeye') { ctx.globalAlpha = 0.35; ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - ux * len, py - uy * len); ctx.lineTo(px + ux * 4, py + uy * 4); ctx.stroke(); ctx.globalAlpha = 1; }
          ctx.strokeStyle = col; ctx.lineWidth = J === 'deadeye' ? 2.6 : J === 'sniper' ? 2.1 : 1.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - ux * len * 0.6, py - uy * len * 0.6); ctx.lineTo(px + ux * len * 0.4, py + uy * len * 0.4); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(px + ux * (len * 0.4 + 4), py + uy * (len * 0.4 + 4)); ctx.lineTo(px + ux * len * 0.4 + nx * 2.4, py + uy * len * 0.4 + ny * 2.4); ctx.lineTo(px + ux * len * 0.4 - nx * 2.4, py + uy * len * 0.4 - ny * 2.4); ctx.closePath(); ctx.fill();
        }
      } else if (sh.color === 'c') { // 성 포탄
        ctx.fillStyle = '#2b3446'; ctx.strokeStyle = '#9fb4d6'; ctx.lineWidth = 1 / z; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(px - 1.5, py - 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
      } else if (sh.color === 'em') { // 소환사의 마법구
        ctx.globalAlpha = 0.4; ctx.fillStyle = '#6fa8ff'; ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#cfe4ff'; ctx.strokeStyle = '#3f6fb5'; ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
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
        const st = f.st, w = st ? st.w : f.big ? 4.5 : 3, r0 = st ? st.r : f.big ? 20 : 15, sp = st ? st.span : 0.95; ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = w * (1 - p * 0.6) / z * 1.1; ctx.lineCap = 'round';
        for (let k = 0; k < (st ? st.n : 1); k++) { const off = st && st.n === 2 ? (k ? 0.3 : -0.3) : 0; ctx.beginPath(); ctx.arc(f.x - Math.cos(f.a + off) * 6, f.y - Math.sin(f.a + off) * 6, r0 * (0.7 + p * 0.5) * (k ? 0.85 : 1), f.a + off - sp, f.a + off + sp); ctx.stroke(); }
        if (st && st.cross) { ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.moveTo(f.x - 7, f.y); ctx.lineTo(f.x + 7, f.y); ctx.moveTo(f.x, f.y - 7); ctx.lineTo(f.x, f.y + 7); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      else if (f.k === 'pool') { // 독 웅덩이: 남아 있는 동안 초록 독기가 일렁인다
        const fade = Math.min(1, (f.max - f.t) / 1.2, f.t / 0.3 + 0.2), pu = 0.5 + 0.5 * Math.sin(now * 0.006);
        ctx.globalAlpha = (0.2 + 0.08 * pu) * fade; ctx.fillStyle = f.c ? f.c[0] : '#66d63a'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = f.c ? f.c[1] : '#8dff5a'; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.97 + 0.03 * pu), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = f.c ? f.c[2] : '#b8ff8a'; for (let i = 0; i < 6; i++) { const a = i * 1.047 + now * 0.0004, rr = f.r * (0.3 + 0.5 * ((i * 0.37 + f.t * 0.3) % 1)), by = (f.t * 18 + i * 9) % 30; ctx.globalAlpha = 0.55 * fade * (1 - by / 30); ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr - by, 2.2, 0, Math.PI * 2); ctx.fill(); }
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
      else if (f.k === 'ring') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = (f.big ? 4 : 2) / z; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + p * (f.grow || (f.big ? 60 : 24)), 0, Math.PI * 2); ctx.stroke(); }
      else if (f.k === 'line') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = (f.small ? 1.5 : 3) / z; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
      else if (f.k === 'beam') { // 사제 치유 광선: 누가 누구를 치유하는지 보이도록 굵은 빛줄기 + 끝점 광채
        const a = 1 - p, w = (f.small ? 2.2 : 4) / z, pulse = 0.75 + 0.25 * Math.sin(now * 0.03);
        ctx.lineCap = 'round'; ctx.globalAlpha = a * 0.35; ctx.strokeStyle = f.c; ctx.lineWidth = w * 3.2; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke();
        ctx.globalAlpha = a * pulse; ctx.strokeStyle = '#eafff1'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke();
        ctx.globalAlpha = a * 0.55; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.tx, f.ty, (f.small ? 6 : 11) / z * (0.6 + 0.4 * p), 0, Math.PI * 2); ctx.fill(); ctx.lineCap = 'butt';
      }
      else if (f.k === 'strikeW' && f.claw) { // 마왕의 손톱: 가늘고 긴 갈퀴 모양 예고
        const pu = 0.5 + 0.5 * Math.sin(now * 0.025), w = f.w2 / 2; ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang);
        ctx.globalAlpha = 0.16 + 0.16 * pu; ctx.fillStyle = '#c8203a'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(f.len * 0.4, -w * 1.3, f.len, 0); ctx.quadraticCurveTo(f.len * 0.4, w * 1.3, 0, 0); ctx.fill();
        ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ff6a7a'; ctx.lineWidth = 2 / z; ctx.setLineDash([12 / z, 8 / z]); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(f.len * p, -w * 0.6); ctx.lineTo(f.len * p, w * 0.6); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      }
      else if (f.k === 'strikeH' && f.claw) { // 손톱 자국: 굽은 검붉은 상처가 빠르게 길게 그어진다
        const a = 1 - p, hd = f.len * Math.min(1, p * 3.2), w = f.w2 / 2; ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang); ctx.lineCap = 'round';
        const g = ctx.createLinearGradient(0, 0, hd, 0); g.addColorStop(0, 'rgba(70,0,12,' + 0.9 * a + ')'); g.addColorStop(1, 'rgba(255,60,90,' + 0.9 * a + ')');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(hd * 0.4, -w * 1.1, hd, 0); ctx.quadraticCurveTo(hd * 0.4, w * 0.35, 0, 0); ctx.fill();
        ctx.globalAlpha = a; ctx.strokeStyle = '#fff0f2'; ctx.lineWidth = 3 / z; ctx.beginPath(); ctx.moveTo(hd * 0.05, -2); ctx.quadraticCurveTo(hd * 0.4, -w * 0.7, hd, 0); ctx.stroke();
        ctx.globalAlpha = a * 0.7; ctx.strokeStyle = '#ff3a5a'; ctx.lineWidth = 2 / z; for (let i = 0; i < 7; i++) { const d = hd * (0.2 + 0.11 * i), yy = -w * (0.25 + 0.5 * Math.sin(i * 1.7)) * 0.5; ctx.beginPath(); ctx.moveTo(d, yy); ctx.lineTo(d - 22, yy + 10 + (i % 3) * 3); ctx.stroke(); }
        ctx.restore(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      }
      else if (f.k === 'strikeW') { // 사천왕·용의 예고 범위 (원형 또는 부채꼴)
        const col = STRIKE_COL[f.kind] || '#ff6a2a', pu = 0.5 + 0.5 * Math.sin(now * 0.025);
        ctx.fillStyle = col; ctx.strokeStyle = col; ctx.globalAlpha = 0.14 + 0.16 * pu;
        ctx.beginPath(); if (f.shape === 'line') { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang); ctx.rect(0, -f.w2 / 2, f.len, f.w2); ctx.restore(); } else if (f.shape === 'cone') { ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.len, f.ang - f.half, f.ang + f.half); ctx.closePath(); } else ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.lineWidth = 3 / z; ctx.setLineDash([10 / z, 7 / z]); ctx.stroke(); ctx.setLineDash([]);
        if (f.shape === 'line') { ctx.globalAlpha = 0.5; ctx.lineWidth = 2 / z; ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang); ctx.beginPath(); ctx.moveTo(f.len * p, -f.w2 / 2); ctx.lineTo(f.len * p, f.w2 / 2); ctx.stroke(); ctx.restore(); }
        else if (f.shape !== 'cone') { ctx.globalAlpha = 0.55; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - p), 0, Math.PI * 2); ctx.stroke(); }
        else { ctx.globalAlpha = 0.5; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.arc(f.x, f.y, f.len * p, f.ang - f.half, f.ang + f.half); ctx.stroke(); }
        if (f.shape === 'circle' && f.kind !== 'bolt' && f.kind !== 'wind' && f.kind !== 'slash' && f.kind !== 'sweep' && f.kind !== 'slam') { ctx.globalAlpha = 1; drawFall(ctx, f.kind, f.x, f.y, f.r, p, 'strike'); }
        if (f.kind === 'sweep') { // 무기를 휘두르는 예고: 초승달 칼날 자국이 보스 둘레를 돈다
          ctx.save(); ctx.translate(f.x, f.y); ctx.lineCap = 'round'; const rot = p * p * 12.5;
          for (let i = 0; i < 3; i++) { const a0 = rot + i * 2.094; ctx.globalAlpha = 0.35 + 0.4 * p; ctx.strokeStyle = '#f2f4ff'; ctx.lineWidth = (7 + 5 * p) / z; ctx.beginPath(); ctx.arc(0, 0, f.r * 0.82, a0, a0 + 0.9); ctx.stroke(); ctx.globalAlpha = 0.25; ctx.lineWidth = 16 / z; ctx.strokeStyle = '#9fa8c8'; ctx.beginPath(); ctx.arc(0, 0, f.r * 0.82, a0 - 0.2, a0 + 0.9); ctx.stroke(); }
          ctx.restore(); ctx.lineCap = 'butt';
        }
        if (f.kind === 'slam') { // 내려찍기 예고: 바닥에 금이 모인다
          ctx.save(); ctx.translate(f.x, f.y); ctx.strokeStyle = '#3a2412'; ctx.lineWidth = 3 / z; ctx.globalAlpha = 0.4 + 0.5 * p;
          for (let i = 0; i < 9; i++) { const an = i * 0.7 + 0.3, r0 = f.r * (0.95 - 0.7 * p), r1 = r0 - f.r * 0.22; ctx.beginPath(); ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); ctx.lineTo(Math.cos(an + 0.08) * (r0 + r1) / 2, Math.sin(an + 0.08) * (r0 + r1) / 2); ctx.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); ctx.stroke(); }
          ctx.restore();
        }
        if (f.kind === 'bolt') { ctx.globalAlpha = 0.8; ctx.fillStyle = '#fff6b0'; ctx.beginPath(); ctx.arc(f.x, f.y, 5 + 4 * pu, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      else if (f.k === 'strikeH') { // 예고 범위가 터지는 순간의 효과: 낙뢰·얼음 가시·바위 충격파·불길·바람
        const col = STRIKE_COL[f.kind] || '#ff6a2a', a = 1 - p;
        if (f.shape === 'line' && f.kind === 'bolt') { // 번개 창: 지그재그 번개가 일직선으로 내리꽂힌다
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang); const hd = f.len * Math.min(1, p * 3);
          ctx.globalAlpha = a * 0.28; ctx.fillStyle = '#ffe14a'; ctx.fillRect(0, -f.w2 / 2, f.len, f.w2);
          for (const [lw, col2, al] of [[9, '#ffd21a', 0.55], [3.2, '#fffbe0', 1]]) { ctx.globalAlpha = a * al; ctx.strokeStyle = col2; ctx.lineWidth = lw / z * 1.4; ctx.lineJoin = 'miter'; ctx.beginPath(); ctx.moveTo(0, 0); for (let i = 1; i <= 16; i++) { const dx = hd * i / 16; ctx.lineTo(dx, (((i * 53 + Math.floor(f.x)) % 29) - 14) * f.w2 / 70); } ctx.stroke(); }
          ctx.globalAlpha = a; ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.moveTo(hd, -9); ctx.lineTo(hd + 30, 0); ctx.lineTo(hd, 9); ctx.closePath(); ctx.fill(); // 창끝
          ctx.restore();
        } else if (f.shape === 'line') { // 거대한 검기: 초승달 모양의 칼날이 일직선으로 날아간다
          const hd = f.len * Math.min(1, p * 2.2), tl = Math.max(0, hd - f.len * 0.5);
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang);
          const g = ctx.createLinearGradient(tl, 0, hd, 0); g.addColorStop(0, 'rgba(120,10,30,0)'); g.addColorStop(1, 'rgba(255,60,90,' + (0.85 * a) + ')');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(tl, -f.w2 * 0.15); ctx.lineTo(hd, -f.w2 * 0.5); ctx.lineTo(hd, f.w2 * 0.5); ctx.lineTo(tl, f.w2 * 0.15); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = a; ctx.fillStyle = '#ffe8ee'; ctx.strokeStyle = '#d0203c'; ctx.lineWidth = 4 / z; ctx.beginPath(); ctx.moveTo(hd - f.w2 * 0.1, -f.w2 * 0.55); ctx.quadraticCurveTo(hd + f.w2 * 0.45, 0, hd - f.w2 * 0.1, f.w2 * 0.55); ctx.quadraticCurveTo(hd + f.w2 * 0.1, 0, hd - f.w2 * 0.1, -f.w2 * 0.55); ctx.fill(); ctx.stroke();
          ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#ff3a5a'; for (let i = 0; i < 10; i++) ctx.fillRect(hd - (i * 0.09 + p * 0.1) * f.len * 0.5, ((i * 37) % 11 - 5) / 5 * f.w2 * 0.5, 14, 4);
          ctx.restore();
        } else if (f.kind === 'ice' && f.shape === 'cone') { // 얼음 파편: 부채꼴로 얼음 가시가 뻗어 나간다
          const gi = ctx.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.len); gi.addColorStop(0, 'rgba(235,250,255,' + (0.85 * a) + ')'); gi.addColorStop(0.6, 'rgba(120,200,255,' + (0.55 * a) + ')'); gi.addColorStop(1, 'rgba(120,200,255,0)');
          ctx.fillStyle = gi; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.len * Math.min(1, 0.4 + p * 1.5), f.ang - f.half, f.ang + f.half); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = a; ctx.fillStyle = '#e8f8ff'; ctx.strokeStyle = '#4f9ccc'; ctx.lineWidth = 1.5 / z;
          for (let i = 0; i < 16; i++) { const an = f.ang - f.half + (i + 0.5) / 16 * f.half * 2, d = f.len * (0.25 + 0.7 * ((i * 5) % 8) / 8) * Math.min(1, p * 2.4), h = 34 + (i % 3) * 14, bx = f.x + Math.cos(an) * d, by = f.y + Math.sin(an) * d; ctx.beginPath(); ctx.moveTo(bx - Math.sin(an) * 7, by + Math.cos(an) * 7); ctx.lineTo(bx + Math.cos(an) * h, by + Math.sin(an) * h); ctx.lineTo(bx + Math.sin(an) * 7, by - Math.cos(an) * 7); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        } else if (f.kind === 'bolt') {
          ctx.globalAlpha = a; ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = 5 / z; ctx.lineJoin = 'round'; ctx.beginPath(); let yy = f.y - 420, xx = f.x + 20; ctx.moveTo(xx, yy);
          for (let i = 1; i <= 7; i++) { yy = f.y - 420 + i * 60; xx = f.x + (i === 7 ? 0 : (((i * 37 + Math.floor(f.x)) % 41) - 20)); ctx.lineTo(xx, yy); } ctx.stroke();
          ctx.strokeStyle = col; ctx.lineWidth = 12 / z; ctx.globalAlpha = a * 0.35; ctx.stroke();
          ctx.globalAlpha = a * 0.55; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + 0.5 * p), 0, Math.PI * 2); ctx.fill();
        } else if (f.kind === 'ice') {
          ctx.globalAlpha = a * 0.45; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 0.7 * Math.min(1, p * 3)), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = a; ctx.fillStyle = '#e8f8ff'; ctx.strokeStyle = '#6fb8e8'; ctx.lineWidth = 1.5 / z;
          const n = Math.max(8, Math.min(22, Math.round(f.r / 14)));
          for (let i = 0; i < n; i++) { const an = i / n * 6.283 + 0.3, rr = f.r * (0.35 + 0.55 * ((i * 7) % 5) / 5), h = 26 * Math.min(1, p * 4) * (1 - p * 0.5), bx = f.x + Math.cos(an) * rr, by = f.y + Math.sin(an) * rr * 0.8; ctx.beginPath(); ctx.moveTo(bx - 5, by); ctx.lineTo(bx, by - h); ctx.lineTo(bx + 5, by); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        } else if (f.kind === 'sweep') { // 휘두른 무기의 궤적이 한 바퀴 퍼져 나간다
          ctx.save(); ctx.translate(f.x, f.y); ctx.lineCap = 'round'; const rr = f.r * (0.55 + 0.45 * Math.min(1, p * 2.2)), st = p * 6;
          for (let i = 0; i < 3; i++) { const a0 = st + i * 2.094; ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = (9 * a + 3) / z; ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + 1.5); ctx.stroke(); ctx.globalAlpha = a * 0.4; ctx.strokeStyle = '#aab4e0'; ctx.lineWidth = 22 / z * a; ctx.beginPath(); ctx.arc(0, 0, rr, a0 - 0.3, a0 + 1.5); ctx.stroke(); }
          ctx.globalAlpha = a * 0.5; ctx.strokeStyle = col; ctx.lineWidth = 4 / z; ctx.beginPath(); ctx.arc(0, 0, f.r * Math.min(1, p * 1.8), 0, Math.PI * 2); ctx.stroke();
          ctx.restore(); ctx.lineCap = 'butt';
        } else if (f.kind === 'rock' || f.kind === 'hammer' || f.kind === 'slam') {
          if (f.kind === 'hammer' || f.kind === 'slam') { ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 5 / z; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + 1.1 * p), 0, Math.PI * 2); ctx.stroke(); }
          ctx.globalAlpha = a * 0.6; ctx.strokeStyle = col; ctx.lineWidth = 8 / z * a + 2 / z; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.2 + 0.8 * p), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = a * 0.35; ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.6, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = a; ctx.fillStyle = '#8a6a44'; for (let i = 0; i < 9; i++) { const an = i * 0.7 + 0.4, d = f.r * (0.3 + 0.6 * p) * (0.7 + (i % 3) * 0.2), rh = 16 * Math.sin(Math.min(1, p * 1.6) * Math.PI); ctx.fillRect(f.x + Math.cos(an) * d - 4, f.y + Math.sin(an) * d * 0.8 - rh - 4, 8, 8); }
        } else if (f.kind === 'wind') {
          ctx.globalAlpha = a * 0.5; ctx.strokeStyle = col; ctx.lineWidth = 6 / z; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r * Math.min(1, p * 1.4 + k * 0.08) * 0.9, 0, Math.PI * 2); ctx.stroke(); }
        } else { // fire (낙하 불덩이·용의 숨결)
          if (f.shape === 'cone') {
            const g = ctx.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.len); g.addColorStop(0, 'rgba(255,240,160,' + (0.9 * a) + ')'); g.addColorStop(0.5, 'rgba(255,120,30,' + (0.7 * a) + ')'); g.addColorStop(1, 'rgba(180,30,10,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.arc(f.x, f.y, f.len * Math.min(1, 0.4 + p * 1.5), f.ang - f.half, f.ang + f.half); ctx.closePath(); ctx.fill();
            for (let i = 0; i < 22; i++) { const q = (p * 1.6 + i * 0.137) % 1, an = f.ang + ((i * 53 % 17) / 8 - 1) * f.half * 0.9, d = f.len * q; ctx.globalAlpha = a * (1 - q) * 0.9; ctx.fillStyle = i % 3 ? '#ff9a2a' : '#fff1a0'; ctx.beginPath(); ctx.arc(f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, (14 - q * 9) / z * 0.9 + 3, 0, 6.283); ctx.fill(); }
          } else {
            ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#ff9a2a'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + 0.5 * Math.min(1, p * 2.4)), 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = a; ctx.fillStyle = '#fff1a0'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.35 * (1 - p), 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      else if (f.k === 'zone') { // 보스 광역 상태이상 예고 범위
        const pu = 0.5 + 0.5 * Math.sin(now * 0.02); ctx.globalAlpha = 0.16 + 0.14 * pu; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = f.c; ctx.lineWidth = 3 / z; ctx.setLineDash([10 / z, 7 / z]); ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = 0.5; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - p), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1; drawFall(ctx, f.kind, f.x, f.y, f.r, p, 'zone');
      }
      else if (f.k === 'impact') drawImpact(ctx, f, p, z);
      else if (f.k === 'drainLn') { // 암흑 흡수: 마왕과 병사들을 잇는 검붉은 선 (잠시 출렁이며 사라진다)
        const a = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8, dx = f.tx - f.x, dy = f.ty - f.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, wv = Math.sin(now * 0.02 + L) * 14;
        ctx.lineCap = 'round'; ctx.strokeStyle = '#5a0614'; ctx.globalAlpha = a * 0.7; ctx.lineWidth = 6 / z; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.quadraticCurveTo((f.x + f.tx) / 2 + nx * wv, (f.y + f.ty) / 2 + ny * wv, f.tx, f.ty); ctx.stroke();
        ctx.strokeStyle = '#ff2a4a'; ctx.globalAlpha = a; ctx.lineWidth = 2.2 / z; ctx.stroke(); ctx.lineCap = 'butt';
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
    // 2막: 어두운 밤 (성 주변만 횃불로 밝다)
    if (S.act === 2 && !S.cinematic) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); Scenery.drawNight(ctx, vw, vh, (CX - cam.x) * z + vw / 2, (CY - cam.y) * z + vh / 2, z, now); }
    // 사천왕의 기운(51라운드~): 다음 사천왕의 속성이 화면 전체에 어둠처럼 번진다 (뇌=노랑 번개, 설=눈보라, 토=먼지, 용=불씨). 사천왕이 등장해도 잠시 남았다가 서서히 걷힌다.
    { let omId = S.omen, fade = 1, k = 0.45 + 0.55 * ((S.round - 1) % 10) / 9;
      if (omId) omLast = { id: omId, k, round: S.round, t0: 0 };
      else if (omLast && S.round >= omLast.round && S.round <= omLast.round + 1) { if (!omLast.t0) omLast.t0 = now; fade = 1 - (now - omLast.t0) / 14000; if (fade > 0) { omId = omLast.id; k = omLast.k; } else omLast = null; }
      else omLast = null;
      if (omId) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const col = OMEN_COL[omId] || '#ff5a1a', pulse = 0.5 + 0.5 * Math.sin(now / 700), hx = (CX - cam.x) * z + vw / 2, hy = (CY - cam.y) * z + vh / 2, hex = a2 => Math.round(Math.max(0, Math.min(1, a2)) * 255).toString(16).padStart(2, '0');
        const dark = { thunder: '#1a1608', snow: '#0a1c30', earth: '#1c1206', dragon: '#220808' }[omId] || '#120a14';
        ctx.globalAlpha = 1; ctx.fillStyle = col + hex((0.10 + 0.14 * k + 0.04 * pulse) * fade); ctx.fillRect(0, 0, vw, vh); // 화면 전체에 번지는 속성 빛
        const g = ctx.createRadialGradient(hx, hy, Math.min(vw, vh) * 0.22, hx, hy, Math.max(vw, vh) * 0.78); g.addColorStop(0, dark + '00'); g.addColorStop(1, dark + hex((0.45 + 0.35 * k) * fade)); ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh); // 성 주변만 밝고 바깥은 어둡게
        const n = Math.round((34 + 46 * k) * fade); ctx.globalAlpha = (0.45 + 0.35 * k) * Math.min(1, fade * 1.5);
        for (let i = 0; i < n; i++) {
          const sx = (Math.sin(i * 12.9898) * 0.5 + 0.5), sy = (Math.sin(i * 78.233) * 0.5 + 0.5);
          if (omId === 'snow') { const px = ((sx * vw + now * 0.03 * (0.6 + sy) + Math.sin(now * 0.001 + i) * 18) % vw + vw) % vw, py = ((sy * vh + now * 0.07 * (0.6 + sx)) % vh); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 1.6 + (i % 3), 0, Math.PI * 2); ctx.fill(); }
          else if (omId === 'thunder') { const ph = (now / 1700 + i * 0.37) % 1; if (ph < 0.06) { const px = sx * vw, py0 = sy * vh * 0.6; ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 2; ctx.globalAlpha = (1 - ph / 0.06) * 0.8; ctx.beginPath(); ctx.moveTo(px, py0); for (let q = 1; q <= 5; q++) ctx.lineTo(px + (((i * 31 + q * 17) % 41) - 20), py0 + q * 34); ctx.stroke(); ctx.globalAlpha = (0.45 + 0.35 * k) * Math.min(1, fade * 1.5); } }
          else if (omId === 'earth') { const ph = (now * 0.00008 * (0.6 + sy) + sx) % 1, px = ph * vw, py = sy * vh + Math.sin(now * 0.002 + i) * 8; ctx.fillStyle = i % 2 ? '#a07a4a' : '#6a4a2a'; ctx.fillRect(px, py, 3 + (i % 3), 3 + (i % 2)); }
          else { const ph = (now * 0.00007 * (0.6 + sx) + sy) % 1, px = sx * vw + Math.sin(now * 0.002 + i) * 10, py = vh * (1 - ph); ctx.fillStyle = i % 3 ? '#ff8a2a' : '#ffd060'; ctx.beginPath(); ctx.arc(px, py, 1.6 + (i % 2), 0, Math.PI * 2); ctx.fill(); }
        }
        if (omId === 'thunder' && Math.sin(now / 2300) > 0.985) { ctx.globalAlpha = 0.18 * fade; ctx.fillStyle = '#fff6b0'; ctx.fillRect(0, 0, vw, vh); } // 가끔 번쩍
        ctx.globalAlpha = 1;
      } }
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
  function startCine(name, kind) { // 1막 끝(30R)·마왕 처치(50R): 만화 컷신을 보여 주고, 끝나면 다음 막/무한 모드로
    cine = { comic: true, kind };
    playComic(kind === 'endless' ? 'endless' : kind === 'dragon' ? 'dragon' : 'act2', () => { if (!cine) return; cine = null; if (kind === 'act2') Scenery.setAct(2, true); C.endCinematic(S); });
    return;
    cine = { t0: performance.now(), step: -1, swapped: kind === 'endless', kind };
    $('cineTitle').textContent = name + ' 처치!'; $('cineText').textContent = ''; $('cineText').classList.remove('show'); $('cineTitle').classList.remove('show');
    $('cine').classList.remove('hidden'); requestAnimationFrame(() => { $('cine').classList.add('on'); $('cineTitle').classList.add('show'); });
  }
  function stepCine(now) {
    if (cine.comic) return;
    const t = (now - cine.t0) / 1000;
    if (!cine.swapped && t > 1.3) { cine.swapped = true; Scenery.setAct(2, true); } // 화면이 완전히 가려진 뒤 길/바닥을 새로 만든다
    const steps = cine.kind === 'endless' ? CINES.endless.steps : CINE_STEPS;
    while (cine.step + 1 < steps.length && t >= steps[cine.step + 1].t) { cine.step++; cineSetText(steps[cine.step].text); }
    if (t > (cine.kind === 'endless' ? CINES.endless.end : 7.9)) endCine();
  }
  function endCine() {
    if (!cine) return;
    if (cine.comic) { $('comicSkip').click(); return; }
    if (!cine.swapped) Scenery.setAct(2, true);
    cine = null; C.endCinematic(S);
    $('cine').classList.remove('on'); setTimeout(() => { if (!cine) $('cine').classList.add('hidden'); }, 950);
  }
  $('cineSkip').addEventListener('click', endCine);
  $('cine').addEventListener('click', e => { if (e.target === $('cine')) endCine(); });

  // ───────────── 시작/종료 ─────────────
  function newGame(devRound) {
    omLast = null; dragonFramed = 0;
    openingSeen = true;
    const seed = params.get('seed') ? +params.get('seed') : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const mm = params.get('mode'), mode = mm === 'free' ? mm : 'normal';
    S = C.createGame(seed, mode); S.captureEvents = true; Net.begin(S); syncModeBar();
    fx.length = 0; numFx = 0; paused = false; speed = 1; shownOffer = null; $('picker').classList.add('hidden');
    setSpeed(1); closeModals(); Meta.begin(); lastSyncRound = 0; $('btnToMenu').classList.add('hidden');
    for (const k in last) delete last[k];
    for (const t of C.UNIT_TYPES) { ucards[t].last = undefined; ucards[t].n = undefined; }
    cine = null; $('cine').classList.add('hidden'); $('cine').classList.remove('on'); Scenery.setAct(1, false);
    const sr = +params.get('startRound'); if (sr > 1) C.jumpToRound(S, sr); // 디버그: 해당 라운드로 바로 시작
    const dr = devRound || +params.get('dev'); if (dr > 1) C.devSetup(S, dr); // 개발자 모드: 라운드에 맞게 갖춰 시작 (골드 무한, 기록 제외)
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
    if (S.cOffer && !params.get('nopick')) C.pickCastle(S, 0);
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
    $('ovTitle').textContent = win ? '게임 클리어! 재앙의 용을 쓰러뜨렸다' : '성이 무너졌어요';
    $('ovBody').innerHTML = '<div class="stat"><div><b>' + reached + '</b>도달 라운드</div><div><b>' + S.kills + '</b>처치</div><div><b>' + fmtTime(S.t) + '</b>시간</div></div>'
      + '<p>최고 기록: ' + Math.max(best, reached) + '라운드</p>'
      + '<div id="regbox"><input id="nameIn" maxlength="12" placeholder="닉네임 (최대 12자)" autocomplete="off"><input id="msgIn" maxlength="30" placeholder="랭킹에 남길 한마디 (최대 30자)" autocomplete="off"><button id="regBtn">랭킹 등록</button></div><div id="rankbox"></div>';
    $('go').textContent = '다시 시작'; $('btnRank').classList.add('hidden'); $('btnToMenu').classList.remove('hidden');
    $('overlay').classList.remove('hidden');
    if (!S.dev) Meta.finish(S, C, Net.scoreOf(S.win, S.round, S.kills, S.t));
    Net.sendLog(S, 'end');
    const ended = S, myScore = Net.scoreOf(S.win, S.round, S.kills, S.t);
    $('nameIn').value = Net.name();
    if (S.dev) { $('regbox').remove(); $('ovBody').insertAdjacentHTML('beforeend', '<p style="color:#9fd8ff">개발자 모드로 한 판이라 기록·랭킹에 올리지 않아요.</p>'); showRank(null); return; }
    const reg = async () => {
      const name = $('nameIn').value; $('regBtn').disabled = true; $('regBtn').textContent = '등록 중…';
      const res = await Net.submit(ended, name, $('msgIn').value); $('regbox').remove(); if (res && res.rejected) { $('ovBody').insertAdjacentHTML('beforeend', '<p style="color:#ff9a9a">기록이 비정상적이라 랭킹에 올리지 않았어요.</p>'); } showRank(res && res.rejected ? null : myScore);
    };
    $('regBtn').addEventListener('click', reg);
    $('nameIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') reg(); });
    $('nameIn').addEventListener('keyup', e => e.stopPropagation());
    $('msgIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') reg(); }); $('msgIn').addEventListener('keyup', e => e.stopPropagation());
    showRank(null);
  }
  // 랭킹 표: 서버가 있으면 서버 순위, 없으면 이 브라우저의 개인 기록
  let rankList = [], rankScroll = null;
  async function showRank(mine) {
    const box = $('rankbox'); if (!box) return; box.innerHTML = '<p>랭킹 불러오는 중…</p>';
    const r = await Net.top(10); if (!$('rankbox')) return;
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let hit = false; rankList = r.list;
    const rows = r.list.map((e, i) => { const me = mine != null && !hit && e.score === mine; if (me) hit = true; return '<tr class="clk' + (me ? ' me' : '') + '" data-ri="' + i + '"><td>' + (i + 1) + '</td><td>' + esc(e.name) + (e.msg ? '<div class="rmsg">“' + esc(e.msg) + '”</div>' : '') + '</td><td>' + (e.win ? '클리어' : e.round + '라운드') + '</td><td>' + fmtTime(e.time) + '</td></tr>'; }).join('');
    box.innerHTML = '<div class="rankhead">' + (r.server ? '전체 랭킹' : (Net.configured ? '서버에 연결하지 못해 내 기록만 표시' : '내 기록 (서버 미설정)')) + '</div>'
      + (rows ? '<table class="rank"><tr><th>#</th><th>닉네임 · 한마디</th><th>기록</th><th>시간</th></tr>' + rows + '</table>' : '<p>아직 기록이 없어요.</p>');
    if (rankScroll !== null) { const mb = $('metaBody'); if (mb) mb.scrollTop = rankScroll; rankScroll = null; }
  }
  // 모드 전환: 왼쪽 위 라운드 표시 아래에서 언제든 바꿀 수 있다 (기본: 성 주변 방어 / 자유: 범위 안의 적을 멀리까지 추격)
  function syncModeBar() { if (!S) return; for (const b of document.querySelectorAll('#modeBar button')) b.classList.toggle('on', b.dataset.mode === S.mode); }
  for (const b of document.querySelectorAll('#modeBar button')) b.addEventListener('click', () => {
    if (!S) return; S.mode = b.dataset.mode === 'free' ? 'free' : 'normal'; syncModeBar();
    toast(S.mode === 'free' ? '자유 모드: 유닛이 범위 안의 적을 멀리까지 쫓아가 공격합니다' : '기본 모드: 유닛이 성 주변을 지키며 싸웁니다');
  });
  $('btnRank').addEventListener('click', () => { $('ovBody').innerHTML = '<div id="rankbox"></div>'; showRank(null); $('btnRank').classList.add('hidden'); $('go').textContent = '게임 시작'; });
  // 플레이 도중 창을 닫거나 숨길 때도 기록을 남긴다 (개선 자료)
  const abandon = () => { if (S && running && !S.over) Net.sendLog(S, 'abandon', true); };
  window.addEventListener('pagehide', abandon);
  document.addEventListener('visibilitychange', () => { if (document.hidden) abandon(); });
  // ───────────── 오프닝 만화 컷신: 컷을 터치할 때마다 다음 컷이 효과와 함께 나타난다 ─────────────
  let openingSeen = false, comicOn = false;
  const OPENING_HTML = $('comicStage').innerHTML; // 오프닝 4컷 (HTML에 들어 있는 원본)
  // 30라운드(암흑 기사단장 처치)·50라운드(마왕 처치) 컷신: 만화 한 장을 컷별로 잘라 둔 이미지를 오프닝처럼 한 컷씩 보여 준다 (위치는 원본 1586×992 기준 %)
  const COMIC_POS = {
    act2: [[1.13, 1.81, 56.75], [56.94, 1.92, 41.93], [0.82, 48.39, 44.45], [44.96, 48.49, 54.04]], // 암흑 군단의 진격 개시 (assets/a30_*)
    endless: [[1.07, 1.92, 59.08], [59.77, 1.71, 39.28], [0.69, 48.39, 43.19], [43.38, 48.39, 55.55]],
    dragon: [[0.69, 1.51, 54.79], [52.65, 1.61, 46.6], [0.76, 48.79, 50.0], [48.05, 48.79, 51.26]], // 보물을 깨운 붉은 용의 비상 (assets/d80_*)
    ending: [[0.91, 1.46, 52.99], [49.93, 1.46, 49.22], [0.91, 50.59, 48.37], [47.98, 50.59, 51.17]],
  };
  function playComic(name, done) {
    if (name === 'opening') $('comicStage').innerHTML = OPENING_HTML;
    const wide = name === 'ending'; $('comicStage').style.aspectRatio = wide ? '1536 / 1024' : ''; $('comicStage').style.width = wide ? 'min(97vw, calc((100vh - 62px) * 1.5))' : '';
    if (name !== 'opening') $('comicStage').innerHTML = COMIC_POS[name].map((p, i) => '<img class="cp" data-i="' + (i + 1) + '" src="assets/' + ({ act2: 'a30', dragon: 'd80' }[name] || name) + '_' + (i + 1) + '.webp?v=3" alt="" style="left:' + p[0] + '%;top:' + p[1] + '%;width:' + p[2] + '%">').join('');
    const el = $('comic'), imgs = Array.from(el.querySelectorAll('.cp')); let idx = 0, over = false; comicOn = true;
    const wait = Promise.all(imgs.map(im => im.complete ? 1 : new Promise(r => { im.onload = im.onerror = r; })));
    document.body.classList.add('comicOn'); imgs.forEach(im => im.classList.remove('in')); el.classList.remove('hidden', 'out', 'shake', 'rumble'); $('comicHint').textContent = '화면을 터치하면 다음 컷 ▶';
    const flash = (c) => { const f = $('comicFlash'); f.className = ''; void f.offsetWidth; f.className = c; };
    const endHint = name === 'opening' ? '화면을 터치하면 시작 ▶' : '화면을 터치하면 계속 ▶';
    const rumble = () => { A2.play('rumble'); el.classList.add('rumble'); flash('red'); setTimeout(() => el.classList.remove('rumble'), 1300); };
    const horn = () => { A2.play('horn'); el.classList.add('shake'); flash('go'); const l = $('comicLines'); l.className = ''; void l.offsetWidth; l.className = 'go'; setTimeout(() => el.classList.remove('shake'), 600); $('comicHint').textContent = endHint; };
    const FX = {
      opening: [null, () => { A2.play('page'); }, () => { A2.play('page'); flash('go'); }, rumble, horn],
      act2: [null, () => { A2.play('page'); }, () => { A2.play('rage'); flash('red'); }, horn, rumble],
      endless: [null, () => { A2.play('page'); }, () => { A2.play('page'); flash('go'); }, rumble, horn],
      dragon: [null, () => { A2.play('page'); }, () => { A2.play('rage'); flash('red'); }, () => { A2.play('rage'); }, rumble],
      ending: [null, () => { A2.play('page'); }, () => { A2.play('page'); flash('go'); }, () => { A2.play('page'); }, horn],
    };
    if (name !== 'opening') FX[name][4] = ((f) => () => { f(); $('comicHint').textContent = endHint; })(FX[name][4]);
    const fxOf = FX[name];
    const show = () => { idx++; const im = imgs[idx - 1]; im.classList.add('in'); fxOf[idx] && fxOf[idx](); if (matchMedia('(max-aspect-ratio: 1/1)').matches) setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), 80); };
    const finish = () => { if (over) return; over = true; comicOn = false; document.body.classList.remove('comicOn'); el.classList.add('out'); setTimeout(() => { el.classList.add('hidden'); el.classList.remove('out'); }, 600); el.removeEventListener('click', advance); window.removeEventListener('keydown', key, true); done(); };
    const advance = e => { if (e && e.target && e.target.id === 'comicSkip') return; if (idx < 4) show(); else finish(); };
    const key = e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); advance(); } else if (e.key === 'Escape') { e.stopPropagation(); finish(); } };
    el.addEventListener('click', advance); window.addEventListener('keydown', key, true);
    $('comicSkip').onclick = e => { e.stopPropagation(); finish(); };
    wait.then(() => { if (!over) show(); });
  }
  const playOpening = done => playComic('opening', done);
  $('go').addEventListener('click', () => {
    if ($('go').dataset.back) { delete $('go').dataset.back; $('overlay').classList.add('hidden'); return; }
    if (!Net.name() && !params.get('bot') && !params.get('nonick')) { ensureNick(() => $('go').click()); return; }
    A2.init(); $('overlay').classList.add('hidden');
    if (!openingSeen && !params.get('nointro')) { openingSeen = true; playOpening(() => newGame()); } else newGame();
  });


  // ───────────── 타이틀 화면 · 시작 연출 ─────────────
  let intro = null;
  function startIntro() { // 구름이 걷히면서 멀리서 성으로 확대된다
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
  // 닉네임이 저장돼 있지 않으면 시작 전에 입력받는다
  function ensureNick(cb) {
    if (Net.name() || params.get('bot') || params.get('nonick')) { cb(); return; }
    let el = $('nickModal'); if (!el) {
      el = document.createElement('div'); el.id = 'nickModal'; el.className = 'modal';
      el.innerHTML = '<div class="panel nk"><div class="nk-ic">🏰</div><h2>용사의 이름을 알려 주세요</h2><p class="nk-sub">랭킹과 기록에 이 이름이 남아요<br>설정에서 언제든 바꿀 수 있어요</p>'
        + '<div class="nk-field"><input id="nickIn" maxlength="12" placeholder="닉네임 입력" autocomplete="off" spellcheck="false"><span id="nickCnt">0/12</span></div>'
        + '<div id="nickErr"></div><div class="nk-row"><button id="nickDice" type="button">🎲 추천 이름</button><button id="nickOk" class="main" type="button" disabled>모험 시작</button></div></div>';
      document.body.appendChild(el);
    }
    el.classList.remove('hidden'); const inp = $('nickIn'), ok = $('nickOk'), cnt = $('nickCnt'), err = $('nickErr'); setTimeout(() => inp.focus(), 60);
    const A = ['용감한', '날쌘', '졸린', '불꽃', '푸른', '든든한', '느긋한', '재빠른', '은빛', '장난꾸러기'], B = ['기사', '궁수', '사제', '수호자', '여우', '고양이', '늑대', '곰돌이', '파수꾼', '모험가'];
    const upd = () => { const v = inp.value.replace(/[<>&"'`]/g, '').trim(); cnt.textContent = inp.value.length + '/12'; ok.disabled = !v; err.textContent = ''; };
    const go = () => { const v = Net.setName(inp.value); if (!v) { err.textContent = '닉네임을 입력해 주세요'; inp.focus(); return; } el.classList.add('hidden'); cb(); };
    inp.value = ''; upd(); inp.oninput = upd;
    $('nickDice').onclick = () => { inp.value = A[Math.floor(Math.random() * A.length)] + B[Math.floor(Math.random() * B.length)]; upd(); inp.focus(); };
    ok.onclick = go; inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && !e.isComposing) go(); }; inp.onkeyup = e => e.stopPropagation();
  }
  function startFromTitle(devRound) {
    if (!devRound && !Net.name() && !params.get('bot') && !params.get('nonick')) { ensureNick(() => startFromTitle(devRound)); return; }
    A2.init(); titleEl.classList.add('out'); setTimeout(() => titleEl.classList.add('hidden'), 520);
    if (!openingSeen && !params.get('nointro') && !devRound) { openingSeen = true; playOpening(() => { newGame(); startIntro(); }); } else { newGame(devRound); startIntro(); }
  }
  titleEl.addEventListener('click', e => { if (!titleEl.classList.contains('menu')) openMenu(); });
  window.addEventListener('keydown', e => { if (!titleEl.classList.contains('hidden') && !titleEl.classList.contains('out')) { if (anyModal()) { if (e.key === 'Escape') closeModals(); e.stopPropagation(); return; } if (!titleEl.classList.contains('menu')) { e.preventDefault(); e.stopPropagation(); openMenu(); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); startFromTitle(); } } }, true);
  $('mStart').addEventListener('click', e => { e.stopPropagation(); startFromTitle(); });
  // 개발자 모드: 라운드를 골라 그 라운드에 맞는 구성으로 시작 (골드 무한, 기록·랭킹 제외)
  const devRoundSet = v => { v = Math.max(2, Math.min(100, Math.round(+v || 2))); $('devRound').value = v; $('devRoundV').textContent = v + '라운드'; return v; };
  $('devRound').addEventListener('input', () => devRoundSet($('devRound').value));
  for (const b of document.querySelectorAll('#devPresets button')) b.addEventListener('click', () => devRoundSet(b.dataset.r));
  $('devGo').addEventListener('click', e => { e.stopPropagation(); const r = devRoundSet($('devRound').value); store.set('cd-devround', String(r)); closeModals(); startFromTitle(r); });
  $('mColl').addEventListener('click', e => { e.stopPropagation(); openMeta('codex'); });
  $('mRank').addEventListener('click', e => { e.stopPropagation(); openMeta('rank'); });
  $('tDev').addEventListener('click', e => { e.stopPropagation(); devRoundSet(+store.get('cd-devround') || 30); openModal('devPanel'); });
  $('tSet').addEventListener('click', e => { e.stopPropagation(); openModal('setMenu'); });
  $('mHow').addEventListener('click', e => { e.stopPropagation(); drawHowImgs(); $('howto').classList.remove('hidden'); });
  let howDrawn = false;
  function drawHowImgs() { // 게임 방법의 번호별 그림은 게임 안의 실제 그림을 그대로 쓴다
    if (howDrawn) return; howDrawn = true;
    const put = (cv, src) => { const c2 = cv.getContext('2d'); c2.clearRect(0, 0, 144, 144); if (src instanceof HTMLCanvasElement) c2.drawImage(src, 0, 0); };
    const U = t => portrait('u', t, CFG.units[t]), E = (k, c) => portrait('e', k, c || CFG.enemies[k]);
    const castleCv = lv => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const c2 = cv2.getContext('2d'); c2.translate(72, 80); c2.scale(0.62, 0.62); Scenery.drawCastle(c2, { x: 0, y: 0, lv, cannons: 3, max: 1, hp: 1, flash: 0, swing: 0 }, 0); return cv2; };
    const mk = {
      castle: () => castleCv(8), castleup: () => castleCv(12),
      view: () => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const c2 = cv2.getContext('2d'); c2.font = '64px serif'; c2.textAlign = 'center'; c2.fillText('🖐️', 72, 90); return cv2; },
      units: () => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const c2 = cv2.getContext('2d'); [['sword', 0], ['archer', 1], ['priest', 2]].forEach(([t, i]) => c2.drawImage(U(t), i * 40 - 8, 30, 80, 80)); return cv2; },
      gold: () => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const c2 = cv2.getContext('2d'); c2.font = '64px serif'; c2.textAlign = 'center'; c2.fillText('💰', 72, 90); return cv2; },
      cards: () => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const c2 = cv2.getContext('2d'); c2.font = '64px serif'; c2.textAlign = 'center'; c2.fillText('🃏', 72, 90); return cv2; },
      boss: () => portrait('e', 'boss', CFG.enemies.boss, Object.assign({ r: CFG.act1Boss.r || 30 }, CFG.act1Boss.look)),
      dragon: () => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const im = new Image(); im.onload = () => { const c2 = cv2.getContext('2d'), k = Math.min(144 / im.width, 144 / im.height); c2.drawImage(im, (144 - im.width * k) / 2, (144 - im.height * k) / 2, im.width * k, im.height * k); const t = document.querySelector('#howto .hi[data-hi=dragon]'); if (t) { const c3 = t.getContext('2d'); c3.clearRect(0, 0, 144, 144); c3.drawImage(cv2, 0, 0); } }; im.src = 'assets/dragon_2.webp'; return cv2; },
      mode: () => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const c2 = cv2.getContext('2d'); c2.font = '64px serif'; c2.textAlign = 'center'; c2.fillText('🛡️', 72, 90); return cv2; },
      speed: () => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const c2 = cv2.getContext('2d'); c2.font = '64px serif'; c2.textAlign = 'center'; c2.fillText('⏩', 72, 90); return cv2; },
      rank: () => { const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 144; const c2 = cv2.getContext('2d'); c2.font = '64px serif'; c2.textAlign = 'center'; c2.fillText('🏆', 72, 90); return cv2; },
    };
    for (const cv of document.querySelectorAll('#howto .hi')) { try { put(cv, mk[cv.dataset.hi]()); } catch (err) {} }
  }
  $('howClose').addEventListener('click', () => $('howto').classList.add('hidden'));
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
  // 장면별 음악: 메뉴 → (컷신 동안 정적) → 게임 → 보스 → 사천왕 2차전 → 용
  function wantTrack() {
    if (!titleEl.classList.contains('hidden') && !titleEl.classList.contains('out')) return 'menu';
    if (!S || comicOn || (typeof intro !== 'undefined' && intro)) return '';
    if (!running) return 'menu';
    const bs = S.enemies.filter(e => e.kind === 'boss' && !e.dead); if (S.bossDeath && S.bossDeath.b && !bs.includes(S.bossDeath.b)) bs.push(S.bossDeath.b);
    if (bs.some(e => e.dragon)) return 'dragon';
    if (bs.some(e => e.king && e.p2)) return 'king2';
    if (bs.length) return 'boss';
    return 'game';
  }
  setInterval(() => { try { const t = wantTrack(); if (t === '') A2.setTrack(null, true); else A2.setTrack(t); } catch (e) {} }, 400);
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
      const sp = effSpeed(); showSpeed(sp); acc += dt * sp; if (shakeT > 0) shakeT -= dt;
      let n = 0;
      const k0 = performance.now();
      while (acc >= STEP && n < 8 * sp) { if (window.__bot) botAct(); C.tick(S, STEP); acc -= STEP; n++; if (S.over) break; }
      ema('tick', performance.now() - k0);
      if (acc > STEP * 8) acc = 0;
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt * sp; if (f.t >= f.max) { if (f.k === 'num') numFx--; fx[i] = fx[fx.length - 1]; fx.pop(); fxPool.push(f); } } // 끝난 효과는 풀로 돌려보낸다
    }
    if (S) {
      if (!paused) updateDeathCam(dt);
      if (S.cinematic && !cine) startCine(S.cinematic.name, S.cinematic.kind);
      { const rd = S.enemies.find(e => e.fixed && e.riseT > 0 && !e.dead); // 용이 솟아오르는 동안: 계속 흔들리고 단상 가장자리에서 먼지·바위 조각이 튄다
        if (rd && !paused) { risePulse += dt; if (risePulse > 0.08) { risePulse = 0; addShake(rd.fromSky ? 3 + 8 * (1 - rd.riseT / rd.riseDur) : 7 + 6 * (rd.riseT / rd.riseDur), 0.3); if (fx.length < 200) addFx({ k: 'burst', x: rd.x + (Math.random() - 0.5) * 700, y: rd.y + 10 + Math.random() * 50, t: 0, max: 0.6 + Math.random() * 0.5, c: Math.random() < 0.5 ? '#8a6a44' : '#ffb04a', big: Math.random() < 0.3 }); } } }
      if (!S.dragonIntro) { const dg = S.enemies.find(e => e.kind === 'boss' && e.fixed && !e.dead); // 용이 나타나면 머리까지 보이도록 한 번 화면을 맞춘다 (이후엔 자유롭게 움직일 수 있다)
        if (dg && dragonFramed !== dg.id) { dragonFramed = dg.id; const vrr = dg.vr || dg.r, x0 = Math.min(CX - 300, dg.x - vrr * 3.3), x1 = Math.max(CX + 300, dg.x + vrr * 3.3), y0 = Math.min(CY - 300, dg.y - vrr * 4.2), y1 = Math.max(CY + 300, CY + 480);
          cam.zoom = Math.max(minZoom(), Math.min(1, vw / (x1 - x0 + 120), vh / (y1 - y0 + 120))); cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2; clampCam(); } }
      if (cine) stepCine(now);
      else if (Scenery.act !== S.act) Scenery.setAct(S.act, true); // 불러오기/재시작/점프 시 막에 맞는 배경으로
      if (!cine && S.act === 1) syncRoads();
      syncPortal();
      const h0 = performance.now(); if (S.round !== lastSyncRound) { lastSyncRound = S.round; if (!S.dev) Meta.sync(S, C); } Net.sample(S, perf, renderScale); A2.setView({ x: cam.x, y: cam.y, zoom: cam.zoom, vw, vh }); updateMood(); handleEvents(); syncPicker(); updateHud(); const h1 = performance.now(); drawWorld(now); const h2 = performance.now();
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
  window.__game = { toast, addFx, Meta, get S() { return S; }, cam, CastleCore: C, get bossArrows() { return bossArrows; }, get enemyArrows() { return enemyArrows; }, perf, get liteMode() { return liteMode; }, get drawnCount() { return drawnCount; }, get renderScale() { return renderScale; }, get fxPoolSize() { return fxPool.length; }, uiRects, skipCinematic: () => $('cineSkip').click() };
})();
