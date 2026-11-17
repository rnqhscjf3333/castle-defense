/* 성채방어 — 화면/입력/UI. 게임 규칙은 core.js(CastleCore)에만 있다. */
(function () {
  'use strict';
  const C = window.CastleCore, CFG = C.CFG, W = CFG.world.w, H = CFG.world.h, CX = CFG.world.cx, CY = CFG.world.cy;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d'), mini = $('minimap'), mctx = mini.getContext('2d');
  const params = new URLSearchParams(location.search);
  const STEP = 1 / 30;

  let S = null;              // 게임 상태
  let running = false, paused = false, speed = 1;
  let cam = { x: CX, y: CY, zoom: 1 };
  let vw = 0, vh = 0, dpr = 1;
  const fx = [];             // 화면 효과 (게임 규칙과 무관)
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // ───────────── 크기/카메라 ─────────────
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    clampCam();
  }
  function minZoom() { return Math.max(0.3, Math.min(vw / W, vh / H) * 0.9); }
  function clampCam() {
    cam.zoom = Math.max(minZoom(), Math.min(1.8, cam.zoom));
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
  const MS = 264 / W;
  function miniMove(e) { const r = mini.getBoundingClientRect(); cam.x = (e.clientX - r.left) / r.width * W; cam.y = (e.clientY - r.top) / r.height * H; clampCam(); }
  let miniDown = false;
  mini.addEventListener('pointerdown', e => { miniDown = true; try { mini.setPointerCapture(e.pointerId); } catch (err) {} miniMove(e); });
  mini.addEventListener('pointermove', e => { if (miniDown) miniMove(e); });
  mini.addEventListener('pointerup', () => { miniDown = false; });

  // ───────────── UI ─────────────
  let toastT = null, bannerT = null;
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1800); }
  function banner(t) { const el = $('banner'); el.textContent = t; el.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), 1900); }
  const DESC = { sword: '체력 높은 전위', archer: '멀리서 공격', priest: '아군을 치유' };
  const KEYS = ['1', '2', '3'];

  const ucards = {};
  C.UNIT_TYPES.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'btn panel ucard';
    b.innerHTML = '<div class="nm"></div><div class="ds"></div><div class="cost"></div><div class="cdfill"></div><span class="key">' + KEYS[i] + '</span>';
    b.querySelector('.nm').textContent = CFG.units[t].name;
    b.querySelector('.ds').textContent = DESC[t];
    b.addEventListener('click', () => doBuy(t));
    $('units').appendChild(b);
    ucards[t] = { el: b, cost: b.querySelector('.cost'), cd: b.querySelector('.cdfill') };
  });
  function doBuy(t) {
    if (!S || !running || paused) return;
    const r = C.buy(S, t);
    if (!r.ok) toast({ gold: '골드가 부족해요', pop: '인구 상한이에요', cooldown: '잠시 후 다시 생산할 수 있어요' }[r.reason] || '생산할 수 없어요');
  }
  $('btnNext').addEventListener('click', () => {
    if (!S || !running || paused) return;
    const r = C.callEarly(S);
    if (!r.ok) toast('적이 모두 나온 뒤에 앞당길 수 있어요'); else if (r.bonus) toast('보너스 골드 +' + r.bonus);
  });
  function doExpand() {
    if (!S || !running || paused) return;
    const r = C.expandPop(S);
    if (r.ok) toast('인구 상한 +' + CFG.popExpand.step); else toast(r.reason === 'max' ? '더 이상 확장할 수 없어요' : '골드가 부족해요');
  }
  $('btnPop').addEventListener('click', doExpand);
  $('btnCenter').addEventListener('click', centerOnCore);
  $('btnPause').addEventListener('click', () => { paused = !paused; $('btnPause').textContent = paused ? '계속' : '일시정지'; });
  $('btnSpeed').addEventListener('click', () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; $('btnSpeed').textContent = speed + '×'; });
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (S && S.cards.offer) { // 카드 선택 중에는 1·2·3이 카드 선택, R이 다시 뽑기
      if (e.key === '1' || e.key === '2' || e.key === '3') choose(+e.key - 1);
      else if (e.key === 'r' || e.key === 'R') C.reroll(S);
      return;
    }
    if (e.key === '1' || e.key === '2' || e.key === '3') doBuy(C.UNIT_TYPES[+e.key - 1]);
    else if (e.key === 'u' || e.key === 'U') $('btnUp').click();
    else if (e.key === 'p' || e.key === 'P') doExpand();
    else if (e.key === ' ') { e.preventDefault(); $('btnPause').click(); }
    else if (e.key === 'h' || e.key === 'H') centerOnCore();
  });

  const last = {};
  function setText(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }
  const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  function updateHud() {
    const c = S.core;
    setText('roundTxt', S.phase === 'prep' ? '준비 ' + Math.ceil(S.prepT) + '초' : '라운드 ' + S.round + ' / ' + C.MAX_ROUND);
    setText('timeTxt', fmtTime(S.t));
    setText('hpTxt', String(Math.ceil(c.hp)));
    setText('gold', String(Math.floor(S.gold)));
    setText('popTxt', C.popUsed(S) + '/' + S.popCap);
    setText('killTxt', String(S.kills));
    const pct = Math.max(0, c.hp / c.max * 100);
    const f = $('hpfill'); f.style.width = pct + '%'; f.style.background = pct > 50 ? 'var(--ok)' : pct > 25 ? 'var(--gold)' : 'var(--danger)';
    for (const t of C.UNIT_TYPES) {
      const u = ucards[t], cost = C.unitCostOf(S, t), cd = S.buyCd[t] > 0 ? S.buyCd[t] / CFG.units[t].buyCd : 0;
      u.cost.textContent = cost + 'G';
      u.cd.style.height = (cd * 100) + '%';
      const cant = S.gold < cost || C.popUsed(S) + CFG.units[t].pop > S.popCap;
      u.el.classList.toggle('off', cant);
    }
    const maxed = S.popBuys >= CFG.popExpand.max, pc = C.popExpandCost(S), pb = $('btnPop');
    const ptxt = maxed ? '인구 최대' : '인구 +' + CFG.popExpand.step + ' · ' + pc + 'G';
    if (pb.textContent !== ptxt) pb.textContent = ptxt;
    pb.style.opacity = !maxed && S.gold >= pc ? 1 : 0.5;
    const early = !S.cards.offer && (S.phase === 'prep' || (S.round < C.MAX_ROUND && S.queue.length === 0));
    $('btnNext').style.opacity = early ? 1 : 0.5;
  }

  // ───────────── 업그레이드 선택창 / 강화 목록 ─────────────
  const CAT_NAME = { unit: '유닛 강화', core: '성채 강화', summon: '특수 소환' };
  const RAR_NAME = { common: '일반', rare: '희귀', epic: '영웅' };
  let shownOffer = null;
  function syncPicker() {
    const offer = S ? S.cards.offer : null;
    if (offer === shownOffer) { if (offer) updateReroll(); return; }
    shownOffer = offer;
    const el = $('picker');
    if (!offer) { el.classList.add('hidden'); return; }
    $('pickTitle').textContent = '라운드 ' + (S.round - 1) + ' 돌파 · 업그레이드 선택';
    $('pickSub').textContent = S.cards.boss ? '보스 격파 보상 — 희귀 이상 카드가 한 장 이상 나와요' : '카드를 한 장 고르세요';
    const box = $('pickCards'); box.innerHTML = '';
    offer.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'pcard rar-' + c.rar + ' cat-' + c.cat;
      const tags = document.createElement('div'); tags.className = 'tags';
      const cat = document.createElement('span'); cat.className = 'cat'; cat.textContent = CAT_NAME[c.cat];
      const rar = document.createElement('span'); rar.className = 'rar'; rar.textContent = RAR_NAME[c.rar];
      tags.append(cat, rar);
      const pn = document.createElement('div'); pn.className = 'pn'; pn.textContent = c.name;
      const pd = document.createElement('div'); pd.className = 'pd'; pd.textContent = c.desc;
      const pk = document.createElement('span'); pk.className = 'pk'; pk.textContent = String(i + 1);
      b.append(tags, pn, pd, pk);
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });
    updateReroll();
    el.classList.remove('hidden');
  }
  function updateReroll() { const b = $('btnReroll'), n = S.cards.rerolls; b.textContent = '다시 뽑기 (' + n + ')'; b.disabled = n <= 0; }
  function choose(i) { if (S && S.cards.offer) C.pickCard(S, i); }
  $('btnReroll').addEventListener('click', () => { if (S) C.reroll(S); });

  function renderUpgrades() {
    const el = $('upl'); if (!S) return;
    const list = C.describeTaken(S);
    el.innerHTML = '';
    if (!list.length) { el.textContent = '아직 선택한 강화가 없어요'; return; }
    for (const it of list) {
      const row = document.createElement('div'); row.className = 'it ' + it.rar;
      const a = document.createElement('span'); a.textContent = it.name;
      const b = document.createElement('b'); b.textContent = 'Lv ' + it.lv;
      row.append(a, b); el.appendChild(row);
    }
  }
  $('btnUp').addEventListener('click', () => { const el = $('upl'); el.hidden = !el.hidden; if (!el.hidden) renderUpgrades(); });

  // ───────────── 이벤트 → 화면 효과 ─────────────
  function handleEvents() {
    for (const ev of C.drainEvents(S)) {
      if (ev.type === 'banner') banner(ev.text);
      else if (ev.type === 'kill') { if (fx.length < 300) fx.push({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: ev.boss ? 0.8 : 0.3, c: ev.boss ? '#c77dff' : '#ff8a5c', big: ev.boss }); }
      else if (ev.type === 'udead') fx.push({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: 0.4, c: '#8fb7ff' });
      else if (ev.type === 'heal') fx.push({ k: 'heal', x: ev.tx, y: ev.ty, t: 0, max: 0.5 });
      else if (ev.type === 'spawn') fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.35, c: '#5aa9ff' });
      else if (ev.type === 'chain') { if (fx.length < 300) fx.push({ k: 'line', x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, t: 0, max: 0.25, c: ev.small ? '#b9f5c8' : '#9ad0ff', small: ev.small }); }
      else if (ev.type === 'boom') { if (fx.length < 300) fx.push({ k: 'boom', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.big ? 0.6 : 0.3, big: ev.big }); }
      else if (ev.type === 'revive') { fx.push({ k: 'heal', x: ev.x, y: ev.y, t: 0, max: 0.8 }); toast('아군이 부활했어요'); }
      else if (ev.type === 'picked') { toast(ev.name + ' 획득'); renderUpgrades(); }
      else if (ev.type === 'over') showEnd(ev.win);
    }
  }

  // ───────────── 렌더링 ─────────────
  const COL = {
    bg: '#0f131b', grid: 'rgba(120,140,180,.07)', border: '#3a4660', ring: 'rgba(255,107,107,.18)',
    sword: '#5aa9ff', archer: '#6bdc8b', priest: '#ffe08a', grunt: '#ff6b6b', shield: '#c0504d', boss: '#c77dff',
    golem: '#8aa0c8', hero: '#ffd166', turret: '#ffb86b', wolf: '#cfd6e4',
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
  function drawWorld(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, vw, vh);
    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, (vw / 2 - cam.x * z) * dpr, (vh / 2 - cam.y * z) * dpr);
    const x0 = Math.max(0, cam.x - vw / 2 / z), x1 = Math.min(W, cam.x + vw / 2 / z), y0 = Math.max(0, cam.y - vh / 2 / z), y1 = Math.min(H, cam.y + vh / 2 / z);
    // 맵 바닥
    ctx.fillStyle = '#131925'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1 / z; ctx.beginPath();
    for (let x = Math.floor(x0 / 100) * 100; x <= x1; x += 100) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = Math.floor(y0 / 100) * 100; y <= y1; y += 100) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
    ctx.strokeStyle = COL.border; ctx.lineWidth = 3 / z; ctx.strokeRect(0, 0, W, H);
    // 적 출현 지대 + 스폰 지점
    ctx.strokeStyle = COL.ring; ctx.lineWidth = 2 / z; ctx.setLineDash([14 / z, 14 / z]);
    ctx.beginPath(); ctx.arc(CX, CY, C.SPAWN_RING, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const pts = S.phase === 'prep' ? 4 : S.spawnPts;
    for (let k = 0; k < pts; k++) { const a = (Math.PI * 2 / pts) * k + 0.4; ctx.fillStyle = 'rgba(255,107,107,.35)'; poly(CX + Math.cos(a) * C.SPAWN_RING, CY + Math.sin(a) * C.SPAWN_RING, 26, 3, a); ctx.fill(); }

    const c = S.core;
    // 성채 사거리
    ctx.strokeStyle = 'rgba(90,169,255,.18)'; ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.arc(c.x, c.y, c.range, 0, Math.PI * 2); ctx.stroke();
    // 보급 오라 범위
    if (S.aura.on) {
      ctx.fillStyle = 'rgba(107,220,139,.05)'; ctx.beginPath(); ctx.arc(c.x, c.y, S.aura.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(107,220,139,.35)'; ctx.lineWidth = 1.5 / z; ctx.setLineDash([10 / z, 8 / z]); ctx.stroke(); ctx.setLineDash([]);
    }
    // 성채 본체
    ctx.fillStyle = c.flash > 0 ? '#ffffff' : '#2c3a55'; ctx.strokeStyle = '#6f89b8'; ctx.lineWidth = 3 / z;
    ctx.fillRect(c.x - 30, c.y - 30, 60, 60); ctx.strokeRect(c.x - 30, c.y - 30, 60, 60);
    for (const [dx, dy] of [[-30, -30], [30, -30], [-30, 30], [30, 30]]) { ctx.fillStyle = '#3b4d70'; ctx.fillRect(c.x + dx - 9, c.y + dy - 9, 18, 18); ctx.strokeRect(c.x + dx - 9, c.y + dy - 9, 18, 18); }
    ctx.fillStyle = '#ffd166'; ctx.fillRect(c.x - 6, c.y - 6, 12, 12);

    // 유닛 + 적: 아래쪽에 있는 개체가 앞에 오도록 y 순서로 그린다
    const all = S.units.concat(S.enemies);
    all.sort((p, q) => p.y - q.y);
    for (const e of all) {
      Figures.draw(ctx, e, now);
      if (e.hp < e.max || e.kind === 'boss') hpBar(e);
    }
    // 투사체
    for (const s of S.shots) { ctx.fillStyle = s.color === 'c' ? '#ffd166' : '#b9f5c8'; ctx.beginPath(); ctx.arc(s.x, s.y, s.color === 'c' ? 4 : 3, 0, Math.PI * 2); ctx.fill(); }
    // 화면 효과
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], p = f.t / f.max;
      if (f.k === 'burst') { ctx.globalAlpha = 1 - p; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, (f.big ? 20 : 8) + p * (f.big ? 50 : 16), 0, Math.PI * 2); ctx.fill(); }
      else if (f.k === 'ring') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = 2 / z; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + p * 24, 0, Math.PI * 2); ctx.stroke(); }
      else if (f.k === 'line') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = (f.small ? 1.5 : 3) / z; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
      else if (f.k === 'boom') { ctx.globalAlpha = (1 - p) * 0.5; ctx.fillStyle = f.big ? '#ff9f43' : '#ffd166'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * p), 0, Math.PI * 2); ctx.fill(); }
      else if (f.k === 'heal') { ctx.globalAlpha = 1 - p; ctx.fillStyle = '#9dffb0'; const y = f.y - 12 - p * 16; ctx.fillRect(f.x - 1.5, y - 5, 3, 10); ctx.fillRect(f.x - 5, y - 1.5, 10, 3); }
      ctx.globalAlpha = 1;
    }
    // 화면 밖 위험 방향 표시
    drawEdgeWarnings();
  }
  function drawEdgeWarnings() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z = cam.zoom, m = 22, bins = new Map();
    for (const e of S.enemies) {
      const sx = (e.x - cam.x) * z + vw / 2, sy = (e.y - cam.y) * z + vh / 2;
      if (sx >= 0 && sx <= vw && sy >= 0 && sy <= vh) continue;
      const a = Math.atan2(sy - vh / 2, sx - vw / 2), k = Math.round(a / 0.35);
      const b = bins.get(k) || { a: 0, n: 0 }; b.a = a; b.n++; bins.set(k, b);
    }
    for (const b of bins.values()) {
      const cx = vw / 2, cy = vh / 2, dx = Math.cos(b.a), dy = Math.sin(b.a);
      const t = Math.min((vw / 2 - m) / Math.abs(dx || 1e-6), (vh / 2 - m - 70) / Math.abs(dy || 1e-6));
      const px = cx + dx * t, py = cy + dy * t;
      ctx.globalAlpha = Math.min(0.9, 0.35 + b.n * 0.05); ctx.fillStyle = '#ff6b6b'; poly(px, py, 8 + Math.min(8, b.n * 0.4), 3, b.a); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  function drawMini() {
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = '#0d1118'; mctx.fillRect(0, 0, 264, 264);
    mctx.strokeStyle = 'rgba(255,107,107,.25)'; mctx.beginPath(); mctx.arc(CX * MS, CY * MS, C.SPAWN_RING * MS, 0, Math.PI * 2); mctx.stroke();
    mctx.fillStyle = '#ff6b6b'; for (const e of S.enemies) { const s = e.kind === 'boss' ? 6 : 3; mctx.fillRect(e.x * MS - s / 2, e.y * MS - s / 2, s, s); }
    mctx.fillStyle = '#5aa9ff'; for (const u of S.units) mctx.fillRect(u.x * MS - 1.5, u.y * MS - 1.5, 3, 3);
    mctx.fillStyle = '#ffd166'; mctx.fillRect(CX * MS - 4, CY * MS - 4, 8, 8);
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
    const hw = vw / 2 / cam.zoom, hh = vh / 2 / cam.zoom;
    mctx.strokeRect((cam.x - hw) * MS, (cam.y - hh) * MS, hw * 2 * MS, hh * 2 * MS);
  }

  // ───────────── 시작/종료 ─────────────
  function newGame() {
    const seed = params.get('seed') ? +params.get('seed') : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    S = C.createGame(seed); S.captureEvents = true;
    fx.length = 0; paused = false; speed = 1; shownOffer = null; $('picker').classList.add('hidden'); renderUpgrades();
    $('btnPause').textContent = '일시정지'; $('btnSpeed').textContent = '1×';
    for (const k in last) delete last[k];
    centerOnCore();
    // 디버그: ?warp=초 → 봇이 미리 진행 (스크린샷/점검용)
    if (params.get('bot')) startBot();
    running = true;
  }
  let botT = 0;
  function startBot() { window.__bot = true; }
  function botAct() {
    if (S.cards.offer && !params.get('nopick')) C.pickCard(S, 0);
    botT += STEP; if (botT < 0.4) return; botT = 0;
    for (const t of ['sword', 'archer', 'sword', 'archer', 'priest']) C.buy(S, t);
  }
  function showEnd(win) {
    running = false;
    const best = +(store.get('cd-best') || 0);
    const reached = S.round;
    if (reached > best) store.set('cd-best', String(reached));
    $('ovTitle').textContent = win ? '방어 성공!' : '성채가 무너졌어요';
    $('ovBody').innerHTML = '<div class="stat"><div><b>' + reached + '</b>도달 라운드</div><div><b>' + S.kills + '</b>처치</div><div><b>' + fmtTime(S.t) + '</b>시간</div></div>'
      + '<p>최고 기록: ' + Math.max(best, reached) + '라운드</p><p>랭킹 등록은 다음 단계에서 추가됩니다.</p>';
    $('go').textContent = '다시 시작';
    $('overlay').classList.remove('hidden');
  }
  $('go').addEventListener('click', () => { $('overlay').classList.add('hidden'); newGame(); });

  // ───────────── 메인 루프 ─────────────
  let prev = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
    if (S && running && !paused) {
      acc += dt * speed;
      let n = 0;
      while (acc >= STEP && n < 8 * speed) { if (window.__bot) botAct(); C.tick(S, STEP); acc -= STEP; n++; if (S.over) break; }
      if (acc > STEP * 8) acc = 0;
      for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt * speed; if (fx[i].t >= fx[i].max) fx.splice(i, 1); }
    }
    if (S) { handleEvents(); syncPicker(); updateHud(); drawWorld(now); drawMini(); }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  S = C.createGame(1); // 시작 화면 뒤에 보일 빈 맵
  centerOnCore();
  if (params.get('bot')) { $('overlay').classList.add('hidden'); newGame(); const warp = +params.get('warp') || 0; for (let i = 0; i < warp / STEP && !S.over; i++) { botAct(); C.tick(S, STEP); } C.drainEvents(S); if (S.over) showEnd(S.win); cam.zoom = +params.get('zoom') || 0.5; clampCam(); }
  requestAnimationFrame(frame);
  window.__game = { get S() { return S; }, cam, CastleCore: C };
})();
