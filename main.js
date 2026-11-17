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
  function banner(t, boss) { const el = $('banner'); el.textContent = t; el.classList.toggle('boss', !!boss); el.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), boss ? 3200 : 1900); }
  const DESC = { sword: '체력 높은 전위', archer: '멀리서 공격', priest: '아군을 치유' };
  const KEYS = ['1', '2', '3'];

  const ucards = {};
  C.UNIT_TYPES.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'btn panel ucard';
    b.innerHTML = '<div class="nm"></div><div class="ds"></div><div class="cost"></div><span class="delta"></span><div class="cdfill"></div><span class="key">' + KEYS[i] + '</span>';
    b.querySelector('.nm').textContent = CFG.units[t].name;
    b.querySelector('.ds').textContent = DESC[t];
    b.addEventListener('click', () => doBuy(t));
    $('units').appendChild(b);
    ucards[t] = { el: b, cost: b.querySelector('.cost'), cd: b.querySelector('.cdfill'), delta: b.querySelector('.delta') };
  });
  function doBuy(t) {
    if (!S || !running || paused) return;
    const r = C.buy(S, t);
    if (!r.ok) toast({ gold: '골드가 부족해요', cooldown: '잠시 후 다시 생산할 수 있어요' }[r.reason] || '생산할 수 없어요');
  }
  $('btnCenter').addEventListener('click', centerOnCore);
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
    else if (e.key === 'u' || e.key === 'U') $('btnUp').click();
    else if (e.key === ' ') { e.preventDefault(); $('btnPause').click(); }
    else if (e.key === 'h' || e.key === 'H') centerOnCore();
  });

  const last = {};
  function setText(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }
  const fmtTime = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  // 보스 체력 바 (화면 위 가운데): 이름, 체력 숫자, 현재 상태, 가진 패턴
  const PAT = { dash: '돌진', summon: '소환', artillery: '포격', shield: '방어막', rage: '분노' };
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
    const st = shielded ? '방어막 — 받는 피해 ' + Math.round(b.shieldRed * 100) + '% 감소' : b.dashT > 0 ? '돌진 중!' : rage ? '분노 — 더 빠르고 강해졌다' : '패턴: ' + Object.keys(b.abil).map(k => PAT[k]).join(' · ');
    setText('bossState', st);
  }
  function updateHud() {
    const c = S.core;
    const bi = C.bossInfo(S, S.round), nb = C.bossInfo(S, S.round + 1), rt = $('roundTxt');
    setText('roundTxt', '라운드 ' + Math.max(1, S.round) + ' / ' + C.MAX_ROUND + (bi ? ' · 보스' : nb ? ' · 다음 보스' : S.act === 2 ? ' · 2막' : ''));
    rt.classList.toggle('boss', !!bi); rt.classList.toggle('nextboss', !bi && !!nb); rt.classList.toggle('act2', S.act === 2 && !bi && !nb);
    updateBossBar();
    setText('timeTxt', fmtTime(S.t));
    setText('hpTxt', String(Math.ceil(c.hp)));
    setText('gold', String(Math.floor(S.gold)));
    setText('unitTxt', String(S.units.filter(u => !CFG.units[u.type].static).length)); // 설치형(포탑·발리스타)은 제외
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
      u.cost.textContent = cost + 'G';
      u.cd.style.height = (cd * 100) + '%';
      const cant = S.gold < cost;
      u.el.classList.toggle('off', cant);
    }
  }

  // ───────────── 업그레이드 선택창 / 강화 목록 ─────────────
  const CAT_NAME = { unit: '유닛 강화', core: '성채 강화', summon: '특수 소환' };
  const RAR_NAME = { common: '일반', rare: '희귀', epic: '영웅' };
  let shownOffer = null;
  const currentOffer = () => (S && S.jobs.offer) ? { kind: 'job', list: S.jobs.offer.list, ref: S.jobs.offer } : (S && S.cards.offer) ? { kind: 'card', list: S.cards.offer, ref: S.cards.offer } : null;
  function syncPicker() {
    const cur = S && S.cinematic ? null : currentOffer(), ref = cur ? cur.ref : null;
    if (ref === shownOffer) { if (cur && cur.kind === 'card') updateReroll(); return; }
    shownOffer = ref;
    const el = $('picker');
    if (!cur) { el.classList.add('hidden'); return; }
    const job = cur.kind === 'job', box = $('pickCards'); box.innerHTML = '';
    if (job) {
      $('pickTitle').textContent = S.jobs.offer.boss + ' 처치! 전직';
      $('pickSub').textContent = '직업 하나를 골라 강화해요 — 이미 전직한 직업은 한 단계 더 강해져요';
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
      const cat = document.createElement('span'); cat.className = 'cat'; cat.textContent = job ? c.tier + '단계 전직' : CAT_NAME[c.cat];
      const rar = document.createElement('span'); rar.className = 'rar'; rar.textContent = job ? c.className : RAR_NAME[c.rar];
      tags.append(cat, rar);
      b.append(tags);
      if (job) {
        const hist = C.describeJobs(S).find(j => j.type === c.type);
        if (hist) { const fr = document.createElement('div'); fr.className = 'from'; fr.textContent = c.className + ' › ' + hist.names.join(' › '); b.append(fr); }
      }
      const pn = document.createElement('div'); pn.className = 'pn'; pn.textContent = c.name;
      const pd = document.createElement('div'); pd.className = 'pd'; pd.textContent = c.desc;
      const pk = document.createElement('span'); pk.className = 'pk'; pk.textContent = String(i + 1);
      b.append(pn, pd, pk);
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });
    if (!job) updateReroll();
    el.classList.remove('hidden');
  }
  function updateReroll() { const b = $('btnReroll'), n = S.cards.rerolls; b.textContent = '다시 뽑기 (' + n + ')'; b.disabled = n <= 0; }
  function choose(i) { if (!S) return; if (S.jobs.offer) C.pickJob(S, i); else if (S.cards.offer) C.pickCard(S, i); }
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
  function handleEvents() {
    for (const ev of C.drainEvents(S)) {
      if (ev.type === 'banner') banner(ev.text, ev.boss);
      else if (ev.type === 'kill') { if (fx.length < 300) fx.push({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: ev.boss ? 0.8 : 0.3, c: ev.boss ? '#c77dff' : '#ff8a5c', big: ev.boss }); }
      else if (ev.type === 'udead') fx.push({ k: 'burst', x: ev.x, y: ev.y, t: 0, max: 0.4, c: '#8fb7ff' });
      else if (ev.type === 'heal') fx.push({ k: 'heal', x: ev.tx, y: ev.ty, t: 0, max: 0.5 });
      else if (ev.type === 'spawn') fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.35, c: '#5aa9ff' });
      else if (ev.type === 'chain') { if (fx.length < 300) fx.push({ k: 'line', x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, t: 0, max: 0.25, c: ev.small ? '#b9f5c8' : '#9ad0ff', small: ev.small }); }
      else if (ev.type === 'boom') { if (fx.length < 300) fx.push({ k: 'boom', x: ev.x, y: ev.y, r: ev.r, t: 0, max: ev.big ? 0.6 : 0.3, big: ev.big, enemy: ev.enemy }); }
      else if (ev.type === 'revive') { fx.push({ k: 'heal', x: ev.x, y: ev.y, t: 0, max: 0.8 }); toast('아군이 부활했어요'); }
      else if (ev.type === 'picked') { toast(ev.name + ' 획득'); renderUpgrades(); }
      else if (ev.type === 'notice') toast(ev.text);
      else if (ev.type === 'espawn') { if (fx.length < 300) fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: ev.boss ? 0.9 : 0.45, c: '#ff5a5a', big: ev.boss }); }
      else if (ev.type === 'priceUp') toast('소환으로 모든 유닛 가격이 올랐어요');
      else if (ev.type === 'promote') {
        banner(ev.className + ' → ' + ev.name + ' 전직!'); renderUpgrades();
        for (const u of S.units) if (u.type === ev.unitType && fx.length < 300) fx.push({ k: 'ring', x: u.x, y: u.y, t: 0, max: 0.7, c: '#ffd166' });
      }
      else if (ev.type === 'bossDash') fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.5, c: '#ffb21a' });
      else if (ev.type === 'bossShield') { fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.6, c: '#8fd8ff' }); toast('보스가 방어막을 둘렀어요'); }
      else if (ev.type === 'bossSummon') { fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.6, c: '#ff6b6b' }); toast('보스가 졸개를 불렀어요'); }
      else if (ev.type === 'bossRage') { fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, max: 0.8, c: '#ff3b1a' }); banner(ev.name + ' 분노!'); }
      else if (ev.type === 'over') showEnd(ev.win);
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
  function drawWorld(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, vw, vh);
    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, (vw / 2 - cam.x * z) * dpr, (vh / 2 - cam.y * z) * dpr);
    const x0 = Math.max(0, cam.x - vw / 2 / z), x1 = Math.min(W, cam.x + vw / 2 / z), y0 = Math.max(0, cam.y - vh / 2 / z), y1 = Math.min(H, cam.y + vh / 2 / z);
    // 맵 바닥: 풀밭, 흙길, 돌바닥 광장, 덤불·바위·꽃 (조각으로 캐시)
    Scenery.drawGround(ctx, x0, y0, x1, y1);
    // 적 출현 포탈: 길 위의 붉은 룬 원 (화면 바로 밖에서 적이 나타난다)
    const angs = C.spawnAngles(S.spawnPts || 4);
    for (const a of angs) { const px = CX + Math.cos(a) * C.SPAWN_RING, py = CY + Math.sin(a) * C.SPAWN_RING; if (px > x0 - 60 && px < x1 + 60 && py > y0 - 40 && py < y1 + 40) Scenery.drawPortal(ctx, px, py, now); }

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

    // 유닛 + 적: 아래쪽에 있는 개체가 앞에 오도록 y 순서로 그린다
    const all = S.units.concat(S.enemies, Scenery.visibleTrees(x0, y0, x1, y1));
    all.sort((p, q) => p.y - q.y);
    for (const e of all) {
      if (e._tree) { Scenery.drawTree(ctx, e, now); continue; }
      if (e.kind === 'boss') bossAura(e, now, z);
      Figures.draw(ctx, e, now);
      if (e.kind === 'boss' && e.shieldT > 0) { ctx.globalAlpha = 0.28 + 0.12 * Math.sin(now * 0.012); ctx.fillStyle = '#8fd8ff'; ctx.beginPath(); ctx.arc(e.x, e.y - 6, e.r * 1.7, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.9; ctx.strokeStyle = '#d8f2ff'; ctx.lineWidth = 2.5 / z; ctx.stroke(); ctx.globalAlpha = 1; }
      if (e.hp < e.max || e.kind === 'boss') hpBar(e);
    }
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
        const len = sh.color === 't' ? 9 : 14, col = sh.color === 'ea' ? '#c0503a' : sh.color === 't' ? '#ffb86b' : '#e8e0cc';
        const hx = px + Math.cos(ang) * len * 0.5, hy = py + Math.sin(ang) * len * 0.5, tx2 = px - Math.cos(ang) * len * 0.5, ty2 = py - Math.sin(ang) * len * 0.5;
        ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx2, ty2); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = sh.color === 'ea' ? '#5a1f18' : '#cfd6e4'; ctx.beginPath(); ctx.moveTo(hx + Math.cos(ang) * 4, hy + Math.sin(ang) * 4); ctx.lineTo(hx + Math.cos(ang + 2.5) * 3, hy + Math.sin(ang + 2.5) * 3); ctx.lineTo(hx + Math.cos(ang - 2.5) * 3, hy + Math.sin(ang - 2.5) * 3); ctx.closePath(); ctx.fill();
      }
    }
    // 화면 효과
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], p = f.t / f.max;
      if (f.k === 'burst') { ctx.globalAlpha = 1 - p; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y, (f.big ? 20 : 8) + p * (f.big ? 50 : 16), 0, Math.PI * 2); ctx.fill(); }
      else if (f.k === 'ring') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = (f.big ? 4 : 2) / z; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + p * (f.big ? 60 : 24), 0, Math.PI * 2); ctx.stroke(); }
      else if (f.k === 'line') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.c; ctx.lineWidth = (f.small ? 1.5 : 3) / z; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.tx, f.ty); ctx.stroke(); }
      else if (f.k === 'boom') { ctx.globalAlpha = (1 - p) * 0.5; ctx.fillStyle = f.enemy ? '#ff5a3a' : f.big ? '#ff9f43' : '#ffd166'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * p), 0, Math.PI * 2); ctx.fill(); }
      else if (f.k === 'heal') { ctx.globalAlpha = 1 - p; ctx.fillStyle = '#9dffb0'; const y = f.y - 12 - p * 16; ctx.fillRect(f.x - 1.5, y - 5, 3, 10); ctx.fillRect(f.x - 5, y - 1.5, 10, 3); }
      ctx.globalAlpha = 1;
    }
    // 2막: 어두운 밤 (성채 주변만 횃불로 밝다)
    if (S.act === 2 && !S.cinematic) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); Scenery.drawNight(ctx, vw, vh, (CX - cam.x) * z + vw / 2, (CY - cam.y) * z + vh / 2, z, now); }
    // 화면 밖/UI에 가려진 위험 방향 표시
    drawEdgeWarnings(now);
  }
  // 화면 위에서 UI가 차지하는 영역들(HUD, 미니맵, 버튼 열, 보스 바, 하단 유닛 카드)의 실제 크기
  const bossArrows = [], enemyArrows = [];
  function uiRects() {
    const out = [];
    for (const sel of ['#hud', '#minimap', '#tools', '#bossbar', '#units']) {
      const el = document.querySelector(sel); if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) out.push({ sel, l: r.left, t: r.top, r: r.right, b: r.bottom });
    }
    return out;
  }
  // 화면 밖이거나 UI에 가려진 적의 위치를 가장자리 화살표로 알려준다 (보스는 크게+이름/거리, 일반 적은 작은 삼각형을 방향별로 묶어서).
  // 보스는 몸이 커서 UI 근처(여백 안)에만 와도 가려진 것으로 본다.
  function drawEdgeWarnings(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bossArrows.length = 0; enemyArrows.length = 0;
    const z = cam.zoom, R = uiRects(), find = sel => R.find(r => r.sel === sel);
    const mmap = find('#minimap'), bbar = find('#bossbar'), units = find('#units');
    // 화살표를 놓을 수 있는 안전 영역: UI를 피한 가운데 구역
    const sx0 = 12, sx1 = (mmap ? mmap.l : vw) - 12, sy0 = Math.max(bbar ? bbar.b : 0, 12) + 10, sy1 = (units ? units.t : vh) - 10;
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
        const dist = Math.round(Math.hypot(e.x - cam.x, e.y - cam.y));
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
  function drawMini() {
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.fillStyle = '#244a2e'; mctx.fillRect(0, 0, 264, 264);
    mctx.strokeStyle = '#a3835a'; mctx.lineCap = 'round';
    for (const a of C.spawnAngles(S.act === 2 ? 8 : 6)) { mctx.lineWidth = 5; mctx.beginPath(); mctx.moveTo(CX * MS, CY * MS); mctx.lineTo((CX + Math.cos(a) * 1500) * MS, (CY + Math.sin(a) * 1500) * MS); mctx.stroke(); }
    mctx.fillStyle = '#8a909c'; mctx.beginPath(); mctx.arc(CX * MS, CY * MS, 166 * MS, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = 'rgba(255,107,107,.5)'; mctx.lineWidth = 1.5; for (const a of C.spawnAngles(S.spawnPts || 4)) { mctx.beginPath(); mctx.arc((CX + Math.cos(a) * C.SPAWN_RING) * MS, (CY + Math.sin(a) * C.SPAWN_RING) * MS, 4, 0, Math.PI * 2); mctx.stroke(); }
    mctx.fillStyle = '#ff6b6b'; for (const e of S.enemies) { if (e.kind === 'boss') continue; mctx.fillRect(e.x * MS - 1.5, e.y * MS - 1.5, 3, 3); }
    for (const e of S.enemies) { // 보스: 맥박처럼 커지는 고리 + 큰 점
      if (e.kind !== 'boss') continue;
      const pr = 6 + 3 * (0.5 + 0.5 * Math.sin(performance.now() * 0.008));
      mctx.strokeStyle = '#ff3b4a'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(e.x * MS, e.y * MS, pr, 0, Math.PI * 2); mctx.stroke();
      mctx.fillStyle = '#ff3b4a'; mctx.fillRect(e.x * MS - 3.5, e.y * MS - 3.5, 7, 7);
    }
    mctx.fillStyle = '#5aa9ff'; for (const u of S.units) mctx.fillRect(u.x * MS - 1.5, u.y * MS - 1.5, 3, 3);
    mctx.fillStyle = '#ffd166'; mctx.fillRect(CX * MS - 4, CY * MS - 4, 8, 8);
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
    const hw = vw / 2 / cam.zoom, hh = vh / 2 / cam.zoom;
    mctx.strokeRect((cam.x - hw) * MS, (cam.y - hh) * MS, hw * 2 * MS, hh * 2 * MS);
  }

  // ───────────── 2막 전환 연출 ─────────────
  // 1막 마지막 보스를 쓰러뜨리면: 화면이 어두워지고 → 길이 늘어나고(바닥을 새로 그림) → 마왕의 군세가 온다는 문구 → 2막 시작. 건너뛰기 가능.
  let cine = null;
  const CINE_STEPS = [
    { t: 1.6, text: '하늘이 어두워진다…' },
    { t: 3.7, text: '숨겨진 길이 열렸다' },
    { t: 5.8, text: '마왕의 군세가 몰려온다\n50라운드까지 버텨라' },
  ];
  function cineSetText(txt) { const el = $('cineText'); el.classList.remove('show'); setTimeout(() => { if (!cine) return; el.textContent = txt; el.classList.add('show'); }, 380); }
  function startCine(name) {
    cine = { t0: performance.now(), step: -1, swapped: false };
    $('cineTitle').textContent = name + ' 처치!'; $('cineText').textContent = ''; $('cineText').classList.remove('show'); $('cineTitle').classList.remove('show');
    $('cine').classList.remove('hidden'); requestAnimationFrame(() => { $('cine').classList.add('on'); $('cineTitle').classList.add('show'); });
  }
  function stepCine(now) {
    const t = (now - cine.t0) / 1000;
    if (!cine.swapped && t > 1.3) { cine.swapped = true; Scenery.setAct(2, true); } // 화면이 완전히 가려진 뒤 길/바닥을 새로 만든다
    while (cine.step + 1 < CINE_STEPS.length && t >= CINE_STEPS[cine.step + 1].t) { cine.step++; cineSetText(CINE_STEPS[cine.step].text); }
    if (t > 7.9) endCine();
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
    const seed = params.get('seed') ? +params.get('seed') : (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    S = C.createGame(seed); S.captureEvents = true;
    fx.length = 0; paused = false; speed = 1; shownOffer = null; $('picker').classList.add('hidden'); renderUpgrades();
    $('btnPause').textContent = '일시정지'; $('btnSpeed').textContent = '1×';
    for (const k in last) delete last[k];
    for (const t of C.UNIT_TYPES) ucards[t].last = undefined;
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
    if (S) {
      if (S.cinematic && !cine) startCine(S.cinematic.name);
      if (cine) stepCine(now);
      else if (Scenery.act !== S.act) Scenery.setAct(S.act, true); // 불러오기/재시작/점프 시 막에 맞는 배경으로
      handleEvents(); syncPicker(); updateHud(); drawWorld(now); drawMini();
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  Scenery.init(C);
  resize();
  S = C.createGame(1); // 시작 화면 뒤에 보일 빈 맵
  centerOnCore();
  if (params.get('bot')) { $('overlay').classList.add('hidden'); newGame(); const warp = +params.get('warp') || 0; for (let i = 0; i < warp / STEP && !S.over; i++) { botAct(); C.tick(S, STEP); } C.drainEvents(S); if (S.over) showEnd(S.win); cam.zoom = +params.get('zoom') || 0.5; clampCam(); }
  requestAnimationFrame(frame);
  window.__game = { get S() { return S; }, cam, CastleCore: C, get bossArrows() { return bossArrows; }, get enemyArrows() { return enemyArrows; }, uiRects, skipCinematic: () => $('cineSkip').click() };
})();
