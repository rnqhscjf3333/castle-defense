/* 성 지키기 — 캐릭터 그리기 (렌더링 전용)
 * 동그란 머리 + 네모난 몸통 + 무기. 게임 규칙(core.js)과 무관하며 상태를 바꾸지 않는다.
 * 방향/걸음 애니메이션에 필요한 값(_px, _py, _ang, _dir …)만 개체에 덧붙여 저장한다.
 */
(function () {
  'use strict';
  const FLASH = '#f0b4a8'; // 피격 시 색 (완전한 흰색이 아닌 옅은 붉은 기운)
  const TAU = Math.PI * 2;

  function rect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function line(ctx, x1, y1, x2, y2, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function tri(ctx, ax, ay, bx, by, cx, cy) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); }
  // 사천왕 속성별 색 (기본 모습은 어둡고, 각성(p2)하면 속성 색으로 밝아진다)
  const ELEM = {
    thunder: { cape: '#5d4d10', hem: '#c9a50f', cape2: '#3e330a', wing: '#e8c820', belt: '#ffe14a', eye: '#fff44a', gem: '#fff176', crown: '#2a2308', legs: '#2a2410' },
    snow:    { cape: '#27506e', hem: '#8fd8ff', cape2: '#1d3a52', wing: '#9fdcff', belt: '#e8f8ff', eye: '#9ff0ff', gem: '#d8f6ff', crown: '#1c3248', legs: '#1d2f40' },
    earth:   { cape: '#573a1b', hem: '#c9924f', cape2: '#3d2812', wing: '#8a5a2a', belt: '#e0b46a', eye: '#ffb24a', gem: '#ffcf70', crown: '#34210e', legs: '#2e1f10' },
  };
  // 재앙의 용: 정면을 보는 거대한 용. 날갯짓·불길 입김·날아오르는 높이(e.lift)를 그린다.
  function dragon(ctx, e, s) {
    s *= 0.55; // 판정 반지름(r)에 맞춰 몸집을 줄여 그린다
    const fl = e.flash > 0, t = (typeof performance !== 'undefined' ? performance.now() : 0) * 0.004, lift = e.lift || 0, flap = Math.sin(t * (lift > 0 ? 2.2 : 1)) * (lift > 0 ? 7 : 3.2);
    ctx.save();
    ctx.globalAlpha = 0.28 * (1 - lift * 0.6); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 11 * s, (16 - lift * 6) * s, (4 - lift) * s, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; // 바닥 그림자
    ctx.translate(0, -lift * 26 * s);
    const L = '#2a0608', RED = fl ? FLASH : '#a3262a', RED2 = fl ? FLASH : '#c4402e', BELLY = fl ? FLASH : '#e8b86a', WING = fl ? FLASH : '#6e1418', MEM = fl ? FLASH : '#8f1d22';
    ctx.lineJoin = 'round'; ctx.lineWidth = 1.1 * s; ctx.strokeStyle = L;
    // 꼬리
    ctx.strokeStyle = L; ctx.lineWidth = 4.2 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(8 * s, 8 * s); ctx.bezierCurveTo(26 * s, 12 * s, 30 * s, 2 * s + flap * 0.4 * s, 22 * s, -4 * s); ctx.stroke();
    ctx.strokeStyle = RED; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(8 * s, 8 * s); ctx.bezierCurveTo(26 * s, 12 * s, 30 * s, 2 * s + flap * 0.4 * s, 22 * s, -4 * s); ctx.stroke();
    ctx.fillStyle = fl ? FLASH : '#e8b86a'; tri(ctx, 20 * s, -5 * s, 26 * s, -9 * s, 24 * s, -1 * s); ctx.fill();
    // 날개 (좌우)
    for (const k of [-1, 1]) {
      const f = flap * (k === 1 ? 1 : 1);
      ctx.fillStyle = MEM; ctx.strokeStyle = L; ctx.lineWidth = 1 * s;
      ctx.beginPath(); ctx.moveTo(k * 7 * s, -16 * s); ctx.lineTo(k * 40 * s, (-38 + f) * s); ctx.lineTo(k * 31 * s, (-20 + f * 0.6) * s); ctx.lineTo(k * 42 * s, (-12 + f * 0.4) * s); ctx.lineTo(k * 28 * s, (-5 + f * 0.2) * s); ctx.lineTo(k * 31 * s, 5 * s); ctx.lineTo(k * 9 * s, -1 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = WING; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(k * 7 * s, -16 * s); ctx.lineTo(k * 40 * s, (-38 + f) * s); ctx.moveTo(k * 8 * s, -12 * s); ctx.lineTo(k * 42 * s, (-12 + f * 0.4) * s); ctx.moveTo(k * 9 * s, -8 * s); ctx.lineTo(k * 31 * s, 5 * s); ctx.stroke();
    }
    // 몸통과 배
    ctx.fillStyle = RED; ctx.strokeStyle = L; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.ellipse(0, -5 * s, 14 * s, 17 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = BELLY; ctx.beginPath(); ctx.ellipse(0, -3 * s, 8.4 * s, 13 * s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = fl ? FLASH : '#b98a3c'; ctx.lineWidth = 0.9 * s; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(0, (i * 3.4 - 3) * s, 7 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    // 다리·발톱
    for (const k of [-1, 1]) { ctx.fillStyle = RED2; ctx.strokeStyle = L; ctx.lineWidth = 1.1 * s; ctx.beginPath(); ctx.ellipse(k * 9 * s, 9 * s, 5.4 * s, 3.8 * s, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = fl ? FLASH : '#f4ecd8'; for (const c of [-1.8, 0, 1.8]) { tri(ctx, (k * 9 + c) * s - 0.9 * s, 11.6 * s, (k * 9 + c) * s, 14.6 * s, (k * 9 + c) * s + 0.9 * s, 11.6 * s); ctx.fill(); } }
    // 앞발
    for (const k of [-1, 1]) { ctx.strokeStyle = L; ctx.lineWidth = 3.6 * s; ctx.beginPath(); ctx.moveTo(k * 11 * s, -10 * s); ctx.lineTo(k * 15 * s, 0); ctx.stroke(); ctx.strokeStyle = RED2; ctx.lineWidth = 2.4 * s; ctx.beginPath(); ctx.moveTo(k * 11 * s, -10 * s); ctx.lineTo(k * 15 * s, 0); ctx.stroke(); }
    // 목과 머리
    ctx.fillStyle = RED2; ctx.strokeStyle = L; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.ellipse(0, -22 * s, 7 * s, 8 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
    const breath = e.breathT > 0, jaw = breath ? 3.4 : 0.6;
    ctx.fillStyle = RED; ctx.beginPath(); ctx.ellipse(0, -30 * s, 10.5 * s, 8.6 * s, 0, 0, TAU); ctx.fill(); ctx.stroke(); // 머리
    ctx.fillStyle = RED2; ctx.beginPath(); ctx.ellipse(0, (-24 + jaw * 0.2) * s, 7 * s, 4.6 * s, 0, 0, TAU); ctx.fill(); ctx.stroke(); // 주둥이
    if (breath) { ctx.fillStyle = '#2a0608'; ctx.beginPath(); ctx.ellipse(0, (-23 + jaw * 0.6) * s, 5 * s, jaw * 0.9 * s, 0, 0, TAU); ctx.fill(); const g = ctx.createRadialGradient(0, -23 * s, 1 * s, 0, -23 * s, 16 * s); g.addColorStop(0, 'rgba(255,250,170,.95)'); g.addColorStop(0.5, 'rgba(255,130,30,.6)'); g.addColorStop(1, 'rgba(255,60,10,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -23 * s, 16 * s, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#1a0406'; for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * 2.4 * s, -24.6 * s, 0.8 * s, 0, TAU); ctx.fill(); } // 콧구멍
    // 눈 (노란 눈 + 세로 동공 + 성난 눈썹)
    for (const k of [-1, 1]) { ctx.fillStyle = fl ? FLASH : '#ffd84a'; ctx.beginPath(); ctx.ellipse(k * 4.6 * s, -31 * s, 2.5 * s, 1.9 * s, k * 0.3, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1a0406'; ctx.fillRect(k * 4.6 * s - 0.4 * s, -32.6 * s, 0.8 * s, 3.2 * s); ctx.strokeStyle = L; ctx.lineWidth = 1.3 * s; ctx.beginPath(); ctx.moveTo(k * 1.6 * s, -34.4 * s); ctx.lineTo(k * 7.4 * s, -32.6 * s); ctx.stroke(); }
    // 뿔과 머리 가시
    ctx.fillStyle = fl ? FLASH : '#f0e6c8'; ctx.strokeStyle = L; ctx.lineWidth = 1 * s;
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * 6 * s, -35 * s); ctx.quadraticCurveTo(k * 13 * s, -41 * s, k * 12 * s, -50 * s); ctx.quadraticCurveTo(k * 9 * s, -42 * s, k * 3.4 * s, -36 * s); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = RED2; tri(ctx, -2 * s, -37.6 * s, 0, -44 * s, 2 * s, -37.6 * s); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // 방향/걸음 상태 갱신 (프레임마다 한 번)
  function track(e, now) {
    const moved = e._px === undefined ? 0 : Math.hypot(e.x - e._px, e.y - e._py);
    if (moved > 0.15) { e._ang = Math.atan2(e.y - e._py, e.x - e._px); e._walk = (e._walk || 0) + moved * 0.35; e._moving = 1; }
    else e._moving = 0;
    e._px = e.x; e._py = e.y;
    if (e._ang === undefined) e._ang = e.team === 'e' ? Math.PI : 0;
    // 공격 중에는 공격 방향을 본다
    const a = e.swing > 0 && e.aim !== undefined ? e.aim : e._ang;
    e._face = a;
    e._dir = Math.cos(a) >= 0 ? 1 : -1;
  }

  // 공통 몸: 그림자 + 다리 + 몸통 + 머리. 반환: 손 위치 {hx, hy}와 스케일
  function body(ctx, e, o) {
    if (e._pal) o = Object.assign({}, o, e._pal);
    const s = o.s, d = e._dir, bob = e._moving ? Math.sin((e._walk || 0)) * 1.0 * s : 0;
    const flash = e.flash > 0;
    // 그림자
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 10 * s, 8 * s, 3 * s, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    // 다리 (걸을 때 번갈아)
    const l1 = e._moving ? Math.sin(e._walk || 0) * 2 * s : 0;
    ctx.fillStyle = flash ? FLASH : o.legs;
    rect(ctx, -4.5 * s, 6 * s + (l1 > 0 ? -Math.abs(l1) * 0.4 : 0), 3.5 * s, 4.5 * s, s); ctx.fill();
    rect(ctx, 1 * s, 6 * s + (l1 < 0 ? -Math.abs(l1) * 0.4 : 0), 3.5 * s, 4.5 * s, s); ctx.fill();
    // 몸통(네모)
    const bw = (o.bw || 12) * s, bh = (o.bh || 13) * s;
    ctx.fillStyle = flash ? FLASH : o.body; ctx.strokeStyle = o.line; ctx.lineWidth = Math.max(1, 1.2 * s);
    rect(ctx, -bw / 2, -3 * s + bob, bw, bh, 2 * s); ctx.fill(); ctx.stroke();
    if (o.belt && !flash) { ctx.fillStyle = o.belt; ctx.fillRect(-bw / 2 + 0.5 * s, 3.5 * s + bob, bw - s, 2 * s); }
    // 머리(동그라미) + 눈
    const hy = -9 * s + bob;
    ctx.fillStyle = flash ? FLASH : o.head; ctx.strokeStyle = o.line; ctx.lineWidth = Math.max(1, 1.2 * s);
    circle(ctx, 0, hy, 5.6 * s); ctx.fill(); ctx.stroke();
    if (!flash) {
      ctx.fillStyle = o.eye || '#1a1d26';
      circle(ctx, d * 2.1 * s - 1.7 * s, hy - 0.3 * s, 0.95 * s); ctx.fill();
      circle(ctx, d * 2.1 * s + 1.7 * s, hy - 0.3 * s, 0.95 * s); ctx.fill();
      if (o.angry) { line(ctx, d * 2.1 * s - 3 * s, hy - 2.6 * s, d * 2.1 * s - 0.6 * s, hy - 1.4 * s, 1 * s, o.eye || '#1a1d26'); line(ctx, d * 2.1 * s + 3 * s, hy - 2.6 * s, d * 2.1 * s + 0.6 * s, hy - 1.4 * s, 1 * s, o.eye || '#1a1d26'); }
    }
    return { hx: d * 6.5 * s, hy: 1 * s + bob, hyHead: hy, bob };
  }

  // 휘두르기 각도 오프셋 (swing: 남은 시간, max: 전체 시간)
  function swingOff(e, max) { return e.swing > 0 ? -1.1 + 2.2 * (1 - e.swing / max) : 0.35; }

  // ───────────── 전직 장식 ─────────────
  function star(ctx, x, y, r) {
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, rr = i % 2 ? r * 0.42 : r; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath();
  }
  // 전직한 유닛: 단계 별 + 직업별 소품 (머리 위/몸에 덧그림)
  const TOPH = { bishop: 15, archbishop: 15.5, knight: 13.5, paladin: 14, warlord: 14, berserker: 14, cleric: 12.5, highcleric: 13, warden: 13, templar: 13, hunter: 12.5, stormarcher: 12 };
  function jobDeco(ctx, e, s, h) {
    const id = e.job; if (!id || e.flash > 0) return;
    const hy = h.hyHead, d = e._dir;
    ctx.lineJoin = 'round';
    if (id === 'knight' || id === 'paladin') { // 투구 + 붉은 깃털 (팔라딘은 금테 + 후광)
      ctx.fillStyle = id === 'paladin' ? '#f4f0e2' : '#aab4c6'; ctx.strokeStyle = '#2a3140'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, hy - 0.4 * s, 6.3 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = id === 'paladin' ? '#ffe36a' : '#d83a3a'; ctx.beginPath(); ctx.ellipse(-d * 1 * s, hy - 8.4 * s, 1.7 * s, 4.2 * s, d * 0.5, 0, TAU); ctx.fill();
      if (id === 'paladin') { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(0, hy - 0.4 * s, 6.3 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff2a0'; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.ellipse(0, hy - 12 * s, 6 * s, 1.8 * s, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    } else if (id === 'warlord') { // 뿔 달린 철투구
      ctx.fillStyle = '#7a8090'; ctx.strokeStyle = '#1e222c'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, hy - 0.4 * s, 6.4 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8e0c4'; tri(ctx, -5.4 * s, hy - 2 * s, -10 * s, hy - 11 * s, -2.6 * s, hy - 5 * s); ctx.fill(); ctx.stroke(); tri(ctx, 5.4 * s, hy - 2 * s, 10 * s, hy - 11 * s, 2.6 * s, hy - 5 * s); ctx.fill(); ctx.stroke();
    } else if (id === 'blade' || id === 'blademaster') { // 붉은 머리띠 (검성은 금 장식)
      line(ctx, -5.6 * s, hy - 2 * s, 5.6 * s, hy - 2 * s, 2 * s, id === 'blademaster' ? '#5a7bd8' : '#d83a3a'); line(ctx, -d * 5.6 * s, hy - 2 * s, -d * 10 * s, hy - 0.5 * s, 1.4 * s, id === 'blademaster' ? '#5a7bd8' : '#d83a3a');
      if (id === 'blademaster') { ctx.fillStyle = '#ffd84a'; circle(ctx, d * 2.4 * s, hy - 2 * s, 1.1 * s); ctx.fill(); }
    } else if (id === 'berserker') { // 산발한 붉은 머리 + 흉터 + 어깨 문신
      ctx.fillStyle = '#b8321e'; ctx.strokeStyle = '#4a0f08'; ctx.lineWidth = 0.9 * s;
      for (const k of [-4.5, -2.2, 0, 2.2, 4.5]) { tri(ctx, k * s - 1.6 * s, hy - 3.5 * s, k * s + (k < 0 ? -1.6 : k > 0 ? 1.6 : 0) * s, hy - 10.5 * s, k * s + 1.6 * s, hy - 3.5 * s); ctx.fill(); ctx.stroke(); }
      line(ctx, d * 1.2 * s, hy - 3.2 * s, d * 3.6 * s, hy + 2.4 * s, 0.9 * s, '#8a1a1a');
      ctx.strokeStyle = '#7a1a10'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(-4.5 * s, 0.4 * s + h.bob); ctx.lineTo(-1.5 * s, 3.6 * s + h.bob); ctx.lineTo(1.5 * s, 0.4 * s + h.bob); ctx.lineTo(4.5 * s, 3.6 * s + h.bob); ctx.stroke();
    } else if (id === 'sniper' || id === 'deadeye') { // 조준경(외눈 안경)
      ctx.strokeStyle = id === 'deadeye' ? '#ffd84a' : '#cfd6e4'; ctx.lineWidth = 1.3 * s; circle(ctx, d * 3.7 * s, hy - 0.3 * s, 2.5 * s); ctx.stroke(); line(ctx, d * 3.7 * s, hy + 2.2 * s, d * 3 * s, hy + 5 * s, 1 * s, ctx.strokeStyle);
    } else if (id === 'gunner') { // 고글 + 폭탄 띠
      ctx.fillStyle = '#2a2a33'; ctx.strokeStyle = '#ff9a2a'; ctx.lineWidth = 1.2 * s; rect(ctx, -5 * s, hy - 3 * s, 10 * s, 3.2 * s, 1.4 * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd84a'; circle(ctx, -2 * s, hy - 1.4 * s, 1.1 * s); ctx.fill(); circle(ctx, 2 * s, hy - 1.4 * s, 1.1 * s); ctx.fill();
      ctx.strokeStyle = '#4a2a10'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(-5 * s, -2 * s + h.bob); ctx.lineTo(5 * s, 7 * s + h.bob); ctx.stroke(); ctx.fillStyle = '#ff7a2a'; for (const k of [0.2, 0.5, 0.8]) { circle(ctx, (-5 + 10 * k) * s, (-2 + 9 * k) * s + h.bob, 1.5 * s); ctx.fill(); }
    } else if (id === 'ranger' || id === 'stormarcher') { // 등에 멘 화살통 (폭풍사수는 청록 깃털 + 머리띠)
      ctx.save(); ctx.translate(-d * 7 * s, -2 * s + h.bob); ctx.rotate(-d * 0.35); ctx.fillStyle = '#8a5a2a'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = s; rect(ctx, -1.8 * s, -2 * s, 3.6 * s, 10 * s, s); ctx.fill(); ctx.stroke();
      for (const k of [-1, 0, 1]) line(ctx, k * 1.2 * s, -2 * s, k * 1.6 * s, -5.2 * s, 0.9 * s, id === 'stormarcher' ? '#4ae6ff' : '#e8e0cc'); ctx.restore();
      if (id === 'stormarcher') { line(ctx, -5.6 * s, hy - 2.4 * s, 5.6 * s, hy - 2.4 * s, 1.6 * s, '#4ae6ff'); ctx.fillStyle = '#4ae6ff'; ctx.beginPath(); ctx.ellipse(-d * 4.5 * s, hy - 6 * s, 1.2 * s, 3.6 * s, -d * 0.6, 0, TAU); ctx.fill(); }
    } else if (id === 'hunter') { // 깃털 달린 가죽 후드 + 어깨 털
      ctx.fillStyle = '#6a4a2a'; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, hy - 0.4 * s, 6.4 * s, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(5.4 * s, hy + 3 * s); ctx.lineTo(-5.4 * s, hy + 3 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d83a3a'; ctx.beginPath(); ctx.ellipse(d * 3.4 * s, hy - 8 * s, 1.3 * s, 4 * s, d * 0.7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8dcc0'; for (const k of [-1, 1]) { circle(ctx, k * 5.6 * s, -2 * s + h.bob, 2.6 * s); ctx.fill(); }
    } else if (id === 'cleric' || id === 'highcleric') { // 큰 황금 광륜
      ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = (id === 'highcleric' ? 2.6 : 2) * s; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(0, hy - 8.6 * s, 7 * s, 2.3 * s, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      if (id === 'highcleric') { ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff2a0'; circle(ctx, 0, hy - 8.6 * s, 11 * s); ctx.fill(); ctx.globalAlpha = 1; }
    } else if (id === 'warden') { // 푸른 베일 + 푸른 광륜
      ctx.fillStyle = '#9ec6ff'; ctx.strokeStyle = '#2f4f8a'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, hy - 0.4 * s, 6.4 * s, Math.PI, 0); ctx.lineTo(7 * s, hy + 6 * s); ctx.lineTo(-7 * s, hy + 6 * s); ctx.closePath(); ctx.globalAlpha = 0.9; ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#f3cfa6'; circle(ctx, 0, hy + 0.4 * s, 4.2 * s); ctx.fill();
      ctx.strokeStyle = '#7ad0ff'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.ellipse(0, hy - 8.4 * s, 6.6 * s, 2.1 * s, 0, 0, TAU); ctx.stroke();
    } else if (id === 'bishop' || id === 'archbishop') { // 주교관(뾰족한 흰 모자 + 금 십자)
      ctx.fillStyle = id === 'archbishop' ? '#fff3c4' : '#fbf6e6'; ctx.strokeStyle = '#8a6a1a'; ctx.lineWidth = s; tri(ctx, -5 * s, hy - 4 * s, 5 * s, hy - 4 * s, 0, hy - (id === 'archbishop' ? 15 : 14) * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e0a63a'; ctx.fillRect(-0.8 * s, hy - 12 * s, 1.6 * s, 5.4 * s); ctx.fillRect(-2.4 * s, hy - 9.8 * s, 4.8 * s, 1.5 * s);
      if (id === 'archbishop') { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(0, hy - 9 * s, 8 * s, -2.4, -0.74); ctx.stroke(); }
    } else if (id === 'templar') { // 십자 문장이 달린 철투구 + 붉은 술
      ctx.fillStyle = '#c9ced8'; ctx.strokeStyle = '#2a2f3c'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, hy - 0.2 * s, 6.5 * s, Math.PI, 0); ctx.lineTo(6.5 * s, hy + 1.6 * s); ctx.lineTo(-6.5 * s, hy + 1.6 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#10131a'; ctx.fillRect(-4.4 * s, hy - 0.6 * s, 8.8 * s, 1.6 * s);
      ctx.fillStyle = '#d83a3a'; ctx.fillRect(-0.8 * s, hy - 6 * s, 1.6 * s, 5 * s); ctx.fillRect(-2.6 * s, hy - 4.2 * s, 5.2 * s, 1.5 * s);
      ctx.beginPath(); ctx.ellipse(-d * 1.2 * s, hy - 8.6 * s, 1.5 * s, 3.4 * s, d * 0.5, 0, TAU); ctx.fill();
    }
    // 전직 단계 별
    const n = e.jobTier || 1, top = hy - (TOPH[id] || 11) * s;
    ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#6a4a08'; ctx.lineWidth = 0.8 * s;
    for (let i = 0; i < n; i++) { star(ctx, (i - (n - 1) / 2) * 5 * s, top - 2 * s, 2.6 * s); ctx.fill(); ctx.stroke(); }
  }
  // 직업별 몸 색 (전직한 유닛은 옷 색으로도 구분된다)
  const JPAL = {
    knight: { body: '#5f86c9', legs: '#2d426b', belt: '#c0c8d8' }, paladin: { body: '#f0ecd8', legs: '#b9a76a', belt: '#ffd84a' },
    warlord: { body: '#8a3a2e', legs: '#4a1f18', belt: '#d9a441' }, blade: { body: '#d0543a', legs: '#6a2a1e', belt: '#e8c46a' },
    blademaster: { body: '#4a5fa0', legs: '#252f5a', belt: '#ffd84a' }, berserker: { body: '#d9a077', legs: '#5a3322', belt: '#7a2a1a' },
    sniper: { body: '#3f7f9a', legs: '#24465a', belt: '#cfd6e4' }, deadeye: { body: '#2a5a7a', legs: '#183548', belt: '#ffd84a' },
    gunner: { body: '#8a5a2a', legs: '#3a2410', belt: '#ff7a2a' }, ranger: { body: '#4fa86b', legs: '#2b5a3a', belt: '#7a5a2a' },
    stormarcher: { body: '#37b8a8', legs: '#1c5a52', belt: '#4ae6ff' }, hunter: { body: '#7a5a3a', legs: '#3a2814', belt: '#d83a3a' },
    cleric: { body: '#f2ecd8', legs: '#c9b98a' }, highcleric: { body: '#fff6c8', legs: '#d9c47a', belt: '#ffd84a' },
    warden: { body: '#cfe3ff', legs: '#7a9acb', belt: '#5ab4ff' }, bishop: { body: '#e8dff2', legs: '#a89ac0', belt: '#e0a63a' },
    archbishop: { body: '#f5e6a8', legs: '#c9a850', belt: '#ffd84a' }, templar: { body: '#d8dae0', legs: '#6a6e7a', belt: '#d83a3a' },
  };

  // ───────────── 유닛 ─────────────
  const UNIT = {
    sword(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#4f86d9', legs: '#2f4a7a', head: '#f3cfa6', line: '#14213d', belt: '#d8b04a' });
      const fl = e.flash > 0, J = e.job, od = -e._dir;
      // 방패(반대편): 직업마다 모양이 다르고, 블레이드·검성·버서커는 방패를 들지 않는다
      const off = { knight: 'tower', paladin: 'gold', warlord: 'spike', blade: 'none', blademaster: 'none', berserker: 'none' }[J] || 'round';
      if (off === 'round') { ctx.fillStyle = fl ? FLASH : '#9fb4d6'; ctx.strokeStyle = '#14213d'; ctx.lineWidth = s; circle(ctx, od * 6.2 * s, 1.5 * s + h.bob, 4.2 * s); ctx.fill(); ctx.stroke(); }
      else if (off === 'tower' || off === 'gold') {
        const gold = off === 'gold'; ctx.fillStyle = fl ? FLASH : gold ? '#f4ead0' : '#8fb0e8'; ctx.strokeStyle = gold ? '#c9961a' : '#14213d'; ctx.lineWidth = gold ? 1.5 * s : s;
        rect(ctx, od * 7.6 * s - 3.6 * s, -5.5 * s + h.bob, 7.2 * s, 15 * s, 2.4 * s); ctx.fill(); ctx.stroke();
        if (!fl) { ctx.fillStyle = gold ? '#e0a010' : '#dfe8ff'; ctx.fillRect(od * 7.6 * s - 0.7 * s, -3.5 * s + h.bob, 1.4 * s, 11 * s); ctx.fillRect(od * 7.6 * s - 2.6 * s, -0.5 * s + h.bob, 5.2 * s, 1.4 * s); }
      } else if (off === 'spike') {
        const cx0 = od * 6.6 * s, cy0 = 1.5 * s + h.bob; ctx.fillStyle = fl ? FLASH : '#c8ccd6'; ctx.strokeStyle = '#2a2a33'; ctx.lineWidth = 0.8 * s;
        for (let i = 0; i < 8; i++) { const a2 = i * Math.PI / 4; tri(ctx, cx0 + Math.cos(a2 - 0.2) * 5 * s, cy0 + Math.sin(a2 - 0.2) * 5 * s, cx0 + Math.cos(a2) * 8 * s, cy0 + Math.sin(a2) * 8 * s, cx0 + Math.cos(a2 + 0.2) * 5 * s, cy0 + Math.sin(a2 + 0.2) * 5 * s); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = fl ? FLASH : '#7a2e24'; circle(ctx, cx0, cy0, 5 * s); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#d9a441'; circle(ctx, cx0, cy0, 1.6 * s); ctx.fill();
      }
      // 무기: 직업마다 다르다
      const base = e.swing > 0 ? e._face : (e._dir > 0 ? -0.5 : Math.PI + 0.5);
      const ang = base + (e.swing > 0 ? swingOff(e, J === 'berserker' ? 0.3 : 0.25) * e._dir : 0);
      const gx = h.hx, gy = h.hy, c1 = Math.cos(ang), s1 = Math.sin(ang), n1 = Math.cos(ang + 1.57), n2 = Math.sin(ang + 1.57);
      const guard = (len, w, col) => line(ctx, gx + c1 * len - n1 * w, gy + s1 * len - n2 * w, gx + c1 * len + n1 * w, gy + s1 * len + n2 * w, 1.6 * s, col);
      if (J === 'berserker') { // 거대한 대검 (두 손으로)
        line(ctx, gx - c1 * 4 * s, gy - s1 * 4 * s, gx + c1 * 7 * s, gy + s1 * 7 * s, 2.6 * s, '#4a2a1a');
        line(ctx, gx + c1 * 7 * s, gy + s1 * 7 * s, gx + c1 * 33 * s, gy + s1 * 33 * s, 6 * s, fl ? FLASH : '#8f98a8');
        line(ctx, gx + c1 * 8 * s, gy + s1 * 8 * s, gx + c1 * 32 * s, gy + s1 * 32 * s, 2.4 * s, fl ? FLASH : '#e6ebf5');
        tri(ctx, gx + c1 * 33 * s - n1 * 3 * s, gy + s1 * 33 * s - n2 * 3 * s, gx + c1 * 38 * s, gy + s1 * 38 * s, gx + c1 * 33 * s + n1 * 3 * s, gy + s1 * 33 * s + n2 * 3 * s); ctx.fillStyle = fl ? FLASH : '#8f98a8'; ctx.fill();
        guard(7 * s, 5.5 * s, '#c0392b');
      } else if (J === 'blademaster') { // 쌍검
        for (const k of [-0.2, 0.2]) { const a2 = ang + k, cc = Math.cos(a2), ss = Math.sin(a2); line(ctx, gx, gy, gx + cc * 19 * s, gy + ss * 19 * s, 1.9 * s, fl ? FLASH : '#dfe8ff'); line(ctx, gx - ss * 2.6 * s, gy + cc * 2.6 * s, gx + ss * 2.6 * s, gy - cc * 2.6 * s, 1.4 * s, '#ffd84a'); }
      } else if (J === 'blade') { // 길고 가는 장검
        line(ctx, gx, gy, gx + c1 * 20 * s, gy + s1 * 20 * s, 2 * s, fl ? FLASH : '#f4f6ff'); guard(0, 3.2 * s, '#e8a24a');
        line(ctx, gx - c1 * 2 * s, gy - s1 * 2 * s, gx - c1 * 4 * s - n1 * 2 * s, gy - s1 * 4 * s - n2 * 2 * s, 1.2 * s, '#d83a3a');
      } else if (J === 'paladin') { // 황금 철퇴
        line(ctx, gx, gy, gx + c1 * 12 * s, gy + s1 * 12 * s, 2.2 * s, '#8a5a2a');
        const mx = gx + c1 * 14 * s, my = gy + s1 * 14 * s; ctx.fillStyle = fl ? FLASH : '#ffe36a'; ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = s; circle(ctx, mx, my, 4 * s); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 4; i++) { const a2 = ang + i * 1.57 + 0.78; tri(ctx, mx + Math.cos(a2 - 0.35) * 3.6 * s, my + Math.sin(a2 - 0.35) * 3.6 * s, mx + Math.cos(a2) * 6.4 * s, my + Math.sin(a2) * 6.4 * s, mx + Math.cos(a2 + 0.35) * 3.6 * s, my + Math.sin(a2 + 0.35) * 3.6 * s); ctx.fill(); }
      } else if (J === 'warlord') { // 양날 전투 도끼
        line(ctx, gx, gy, gx + c1 * 15 * s, gy + s1 * 15 * s, 2.4 * s, '#6b4a26');
        const ax = gx + c1 * 14 * s, ay = gy + s1 * 14 * s; ctx.fillStyle = fl ? FLASH : '#c8ccd6'; ctx.strokeStyle = '#2a2a33'; ctx.lineWidth = 0.9 * s;
        for (const k of [-1, 1]) { tri(ctx, ax, ay - 0.0, ax + n1 * k * 8 * s + c1 * 4 * s, ay + n2 * k * 8 * s + s1 * 4 * s, ax + c1 * 6 * s, ay + s1 * 6 * s); ctx.fill(); ctx.stroke(); }
      } else { // 기본 검 / 나이트의 장검
        const L = J === 'knight' ? 16 : 14; line(ctx, gx, gy, gx + c1 * L * s, gy + s1 * L * s, 2.4 * s, fl ? FLASH : '#e8edf5'); guard(0, 3 * s, '#caa24a');
      }
      if (e.swing > 0) { // 휘두르는 궤적 (직업마다 크기·색이 다르다)
        const AR = { berserker: [26, 3.4, '#ff7a5a'], paladin: [16, 2.6, '#ffe27a'], warlord: [17, 3, '#e4e8f0'], blademaster: [18, 1.6, '#9fd0ff'], blade: [16, 2, '#ffb27a'], knight: [14, 2.2, '#a6d2ff'] }[J] || [13, 2, '#ffffff'];
        ctx.globalAlpha = 0.4; ctx.strokeStyle = AR[2]; ctx.lineWidth = AR[1] * s; ctx.beginPath(); ctx.arc(gx, gy, AR[0] * s, ang - 0.9 * e._dir, ang, e._dir < 0); ctx.stroke(); ctx.globalAlpha = 1;
      }
      jobDeco(ctx, e, s, h);
    },
    archer(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#4fa86b', legs: '#2b5a3a', head: '#f3cfa6', line: '#10261a', belt: '#7a5a2a' });
      const J = e.job, fl = e.flash > 0;
      // 후드 모자 (직업별 머리 장식이 있으면 그쪽이 덮는다)
      if (!fl && !{ gunner: 1, hunter: 1 }[J]) { ctx.fillStyle = J === 'stormarcher' ? '#1c8a82' : J === 'sniper' || J === 'deadeye' ? '#2a5a72' : '#2f7a4a'; ctx.strokeStyle = '#10261a'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, h.hyHead - 0.8 * s, 6 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      const ang = e.swing > 0 ? e._face : (e._dir > 0 ? -0.15 : Math.PI + 0.15);
      const gx = h.hx * 0.6, gy = h.hy, cs = Math.cos(ang), sn = Math.sin(ang);
      const pull = e.swing > 0 ? 1 - e.swing / 0.2 : 0.2; // 시위를 당기는 정도
      if (J === 'gunner') { // 폭탄 석궁: 굵은 쇠 포신 + 주황 폭탄
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang); ctx.fillStyle = fl ? FLASH : '#4a4a56'; ctx.strokeStyle = '#14141a'; ctx.lineWidth = s;
        ctx.fillRect(-3 * s, -2.4 * s, 15 * s, 4.8 * s); ctx.strokeRect(-3 * s, -2.4 * s, 15 * s, 4.8 * s); ctx.fillStyle = fl ? FLASH : '#2a2a33'; ctx.fillRect(9 * s, -3.6 * s, 6 * s, 7.2 * s); ctx.strokeRect(9 * s, -3.6 * s, 6 * s, 7.2 * s);
        ctx.fillStyle = '#ff8a2a'; circle(ctx, 17.5 * s, 0, 3.4 * s); ctx.fill(); ctx.stroke(); if (e.swing > 0.05 || ((e._walk || 0) * 3 | 0) % 2) { ctx.fillStyle = '#ffe36a'; circle(ctx, 19.5 * s, -2.8 * s, 1.1 * s); ctx.fill(); }
        ctx.restore();
      } else if (J === 'hunter') { // 표식 석궁: 나무 개머리판 + 가로 활대 + 붉은 촉
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang); ctx.fillStyle = fl ? FLASH : '#7a5230'; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = s;
        ctx.fillRect(-3 * s, -1.4 * s, 14 * s, 2.8 * s); ctx.strokeRect(-3 * s, -1.4 * s, 14 * s, 2.8 * s);
        line(ctx, 8 * s, -7.5 * s, 8 * s, 7.5 * s, 2 * s, fl ? FLASH : '#4a2a10'); line(ctx, 8 * s, -7.5 * s, 1 * s - pull * 3 * s, 0, 0.8 * s, '#e8e0cc'); line(ctx, 8 * s, 7.5 * s, 1 * s - pull * 3 * s, 0, 0.8 * s, '#e8e0cc');
        line(ctx, 1 * s - pull * 3 * s, 0, 14 * s, 0, 1.5 * s, '#d8cfa8'); tri(ctx, 17 * s, 0, 13 * s, -2 * s, 13 * s, 2 * s); ctx.fillStyle = '#e04a4a'; ctx.fill(); ctx.restore();
      } else {
        const AB = { sniper: [11, '#5a4a3a', 1.8, 14], deadeye: [12, '#e1b43a', 2.4, 16], ranger: [6.5, '#4a8a4a', 1.8, 9], stormarcher: [6.5, '#37d8e0', 1.8, 9] }[J] || [8.5, '#8a5a2a', 2, 11];
        const bows = J === 'stormarcher' ? [-3.2, 3.2] : [0];
        for (const off of bows) {
          const bx = gx + Math.cos(ang + 1.57) * off * s, by = gy + Math.sin(ang + 1.57) * off * s, R = AB[0] * s;
          ctx.strokeStyle = fl ? FLASH : AB[1]; ctx.lineWidth = AB[2] * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(bx, by, R, ang - 1.05, ang + 1.05); ctx.stroke();
          const x1 = bx + Math.cos(ang - 1.05) * R, y1 = by + Math.sin(ang - 1.05) * R, x2 = bx + Math.cos(ang + 1.05) * R, y2 = by + Math.sin(ang + 1.05) * R;
          const px = bx + cs * (R * Math.cos(1.05) - pull * 4 * s), py = by + sn * (R * Math.cos(1.05) - pull * 4 * s);
          line(ctx, x1, y1, px, py, 0.9 * s, '#e8e0cc'); line(ctx, px, py, x2, y2, 0.9 * s, '#e8e0cc');
          line(ctx, px, py, px + cs * AB[3] * s, py + sn * AB[3] * s, 1.3 * s, J === 'deadeye' ? '#ffe9a0' : J === 'stormarcher' ? '#9ff4ff' : '#d8cfa8');
          tri(ctx, px + cs * (AB[3] + 2) * s, py + sn * (AB[3] + 2) * s, px + Math.cos(ang + 2.6) * 2 * s + cs * (AB[3] - 2) * s, py + Math.sin(ang + 2.6) * 2 * s + sn * (AB[3] - 2) * s, px + Math.cos(ang - 2.6) * 2 * s + cs * (AB[3] - 2) * s, py + Math.sin(ang - 2.6) * 2 * s + sn * (AB[3] - 2) * s);
          ctx.fillStyle = '#cfd6e4'; ctx.fill();
        }
        if (J === 'sniper' || J === 'deadeye') { ctx.strokeStyle = J === 'deadeye' ? '#ffd84a' : '#cfd6e4'; ctx.lineWidth = 1.1 * s; const sx = gx + cs * 2 * s - sn * 2.6 * s, sy = gy + sn * 2 * s + cs * 2.6 * s; circle(ctx, sx, sy, 1.9 * s); ctx.stroke(); line(ctx, sx, sy, sx + cs * 5 * s, sy + sn * 5 * s, 1.2 * s, ctx.strokeStyle); }
      }
      jobDeco(ctx, e, s, h);
    },
    priest(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#f2ecd8', legs: '#c9b98a', head: '#f3cfa6', line: '#5a4a20', belt: '#e0a63a', bw: 13, bh: 14 });
      const J = e.job, fl = e.flash > 0;
      // 광륜 (전투사제는 투구라서 없다)
      if (J !== 'templar') { ctx.strokeStyle = fl ? FLASH : J === 'warden' ? '#7ad0ff' : '#ffd84a'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.ellipse(0, h.hyHead - 7 * s, 4.5 * s, 1.6 * s, 0, 0, TAU); ctx.stroke(); }
      const sx = e._dir * 8 * s, top = -12 * s + h.bob, glow = e.swing > 0 ? 1 + e.swing * 3 : 1;
      if (J === 'templar') { // 철퇴
        line(ctx, sx, 9 * s + h.bob, sx, -4 * s + h.bob, 2.2 * s, '#8a5a2a'); ctx.fillStyle = fl ? FLASH : '#c9ced8'; ctx.strokeStyle = '#2a2f3c'; ctx.lineWidth = s; circle(ctx, sx, -7 * s + h.bob, 4 * s); ctx.fill(); ctx.stroke();
        for (let i = 0; i < 6; i++) { const a2 = i * Math.PI / 3; tri(ctx, sx + Math.cos(a2 - 0.3) * 3.6 * s, -7 * s + h.bob + Math.sin(a2 - 0.3) * 3.6 * s, sx + Math.cos(a2) * 6.4 * s, -7 * s + h.bob + Math.sin(a2) * 6.4 * s, sx + Math.cos(a2 + 0.3) * 3.6 * s, -7 * s + h.bob + Math.sin(a2 + 0.3) * 3.6 * s); ctx.fill(); }
        ctx.globalAlpha = 0.45 * glow; ctx.fillStyle = '#ffe9a0'; circle(ctx, sx, -7 * s + h.bob, 6.5 * s * glow); ctx.fill(); ctx.globalAlpha = 1;
      } else if (J === 'warden') { // 푸른 등불
        line(ctx, sx, 9 * s + h.bob, sx, top + 2 * s, 1.8 * s, '#8a5a2a'); line(ctx, sx, top + 2 * s, sx + e._dir * 3.4 * s, top - 1 * s, 1.4 * s, '#8a5a2a');
        const lx = sx + e._dir * 3.4 * s, ly = top + 2.6 * s; ctx.globalAlpha = 0.4 * glow; ctx.fillStyle = '#7ad0ff'; circle(ctx, lx, ly, 7.5 * s * glow); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = fl ? FLASH : '#3a6aa8'; ctx.strokeStyle = '#17304f'; ctx.lineWidth = s; rect(ctx, lx - 2.4 * s, ly - 3 * s, 4.8 * s, 6.4 * s, 1.2 * s); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#d8f2ff'; circle(ctx, lx, ly, 1.7 * s); ctx.fill();
      } else if (J === 'bishop' || J === 'archbishop') { // 주교장 (끝이 굽은 지팡이)
        const big = J === 'archbishop'; const t2 = top - (big ? 3 : 0) * s;
        line(ctx, sx, 9 * s + h.bob, sx, t2, big ? 2.2 * s : 1.8 * s, big ? '#e1b43a' : '#8a5a2a');
        ctx.strokeStyle = big ? '#e1b43a' : '#8a5a2a'; ctx.lineWidth = big ? 2.2 * s : 1.8 * s; ctx.beginPath(); ctx.arc(sx + e._dir * 2.6 * s, t2, 2.6 * s, e._dir > 0 ? Math.PI : 0, e._dir > 0 ? Math.PI * 2.6 : -Math.PI * 1.6, e._dir < 0); ctx.stroke();
        ctx.globalAlpha = 0.35 * glow; ctx.fillStyle = big ? '#ffe9a0' : '#e8c8ff'; circle(ctx, sx + e._dir * 2.6 * s, t2 + 0.6 * s, 5 * s * glow); ctx.fill(); ctx.globalAlpha = 1;
      } else { // 성직자 / 대성직자: 보주 지팡이 (대성직자는 십자가 얹힌 큰 보주)
        const hc = J === 'highcleric';
        line(ctx, sx, 9 * s + h.bob, sx, top, 1.8 * s, '#8a5a2a');
        ctx.globalAlpha = 0.35; ctx.fillStyle = hc ? '#fff2a0' : '#9dffb0'; circle(ctx, sx, top - 2 * s, (hc ? 7 : 5) * s * glow); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = hc ? '#fffbe0' : '#e8ffe8'; circle(ctx, sx, top - 2 * s, (hc ? 3.4 : 2.6) * s); ctx.fill();
        if (hc) { ctx.fillStyle = '#e0a63a'; ctx.fillRect(sx - 0.7 * s, top - 9 * s, 1.4 * s, 5 * s); ctx.fillRect(sx - 2 * s, top - 7.4 * s, 4 * s, 1.3 * s); }
      }
      // 가슴 십자
      if (!fl) { ctx.fillStyle = J === 'warden' ? '#4a8ad8' : J === 'templar' ? '#d83a3a' : J === 'archbishop' || J === 'highcleric' ? '#e0a63a' : '#d96a6a'; ctx.fillRect(-0.9 * s, -0.5 * s + h.bob, 1.8 * s, 6 * s); ctx.fillRect(-3 * s, 1.4 * s + h.bob, 6 * s, 1.8 * s); }
      jobDeco(ctx, e, s, h);
    },
    // ── 궁수 계열 특수 유닛 ──
    marksman(ctx, e, s) { // 명궁: 깃털 모자, 금빛 장궁, 짧은 망토
      const d = e._dir;
      ctx.fillStyle = e.flash > 0 ? FLASH : '#1f5a4a'; tri(ctx, -d * 5 * s, -3 * s, -d * 11 * s, 11 * s, -d * 1 * s, 9 * s); ctx.fill();
      const h = body(ctx, e, { s, body: '#2f8f78', legs: '#1c4a3e', head: '#f3cfa6', line: '#0f2a22', belt: '#ffd84a', bw: 12.5 });
      if (e.flash <= 0) { // 챙 넓은 모자 + 붉은 깃털
        ctx.fillStyle = '#2a7a64'; ctx.strokeStyle = '#0f2a22'; ctx.lineWidth = s; ctx.beginPath(); ctx.ellipse(0, h.hyHead - 2.6 * s, 8 * s, 2.4 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, h.hyHead - 2.6 * s, 4.6 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e04a4a'; ctx.beginPath(); ctx.ellipse(d * 4 * s, h.hyHead - 8 * s, 1.5 * s, 4.4 * s, d * 0.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd84a'; star(ctx, 0, 2 * s + h.bob, 2.4 * s); ctx.fill(); // 가슴 별 문양
      }
      const ang = e.swing > 0 ? e._face : (d > 0 ? -0.15 : Math.PI + 0.15), gx = h.hx * 0.6, gy = h.hy, R = 12 * s;
      ctx.strokeStyle = e.flash > 0 ? FLASH : '#e1b43a'; ctx.lineWidth = 2.4 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(gx, gy, R, ang - 1.0, ang + 1.0); ctx.stroke();
      const x1 = gx + Math.cos(ang - 1.0) * R, y1 = gy + Math.sin(ang - 1.0) * R, x2 = gx + Math.cos(ang + 1.0) * R, y2 = gy + Math.sin(ang + 1.0) * R;
      const pull = e.swing > 0 ? 1 - e.swing / 0.2 : 0.2, px = gx + Math.cos(ang) * (R * Math.cos(1.0) - pull * 5 * s), py = gy + Math.sin(ang) * (R * Math.cos(1.0) - pull * 5 * s);
      line(ctx, x1, y1, px, py, 0.9 * s, '#f6f0d8'); line(ctx, px, py, x2, y2, 0.9 * s, '#f6f0d8');
      line(ctx, px, py, px + Math.cos(ang) * 15 * s, py + Math.sin(ang) * 15 * s, 1.5 * s, '#fff2b0');
      jobDeco(ctx, e, s, h);
    },
    repeater(ctx, e, s) { // 연노병: 탄창 달린 작은 석궁
      const h = body(ctx, e, { s, body: '#6b7f3a', legs: '#34401c', head: '#f3cfa6', line: '#1a2208', belt: '#8a5a2a', bw: 11.5 });
      if (e.flash <= 0) { ctx.fillStyle = '#4c5c2a'; ctx.strokeStyle = '#1a2208'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, h.hyHead - 0.6 * s, 6 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      const ang = e.swing > 0 ? e._face : (e._dir > 0 ? -0.1 : Math.PI + 0.1), gx = h.hx * 0.5, gy = h.hy;
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang);
      ctx.fillStyle = e.flash > 0 ? FLASH : '#7a5230'; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = s;
      ctx.fillRect(-2 * s, -1.6 * s, 14 * s, 3.2 * s); ctx.strokeRect(-2 * s, -1.6 * s, 14 * s, 3.2 * s);
      ctx.fillStyle = '#5a5f6a'; ctx.fillRect(2 * s, -4.6 * s, 6 * s, 3 * s); ctx.strokeRect(2 * s, -4.6 * s, 6 * s, 3 * s); // 탄창
      ctx.strokeStyle = e.flash > 0 ? FLASH : '#3a2a18'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(11 * s, 0, 6 * s, -Math.PI / 2 - 0.2, Math.PI / 2 + 0.2); ctx.stroke();
      line(ctx, 11 * s + Math.sin(0.2) * 6 * s, -6 * s, 11 * s + Math.sin(0.2) * 6 * s, 6 * s, 0.8 * s, '#e8e0cc');
      if (e.swing > 0) { ctx.fillStyle = '#ffe58a'; ctx.beginPath(); ctx.arc(15 * s, 0, 2.2 * s, 0, TAU); ctx.fill(); }
      ctx.restore();
      jobDeco(ctx, e, s, h);
    },
    ballista(ctx, e, s) { // 발리스타: 바퀴 달린 대형 석궁, 조준 방향으로 돌고 쏠 때 줄이 풀림
      const a = e._aimB = e.aim !== undefined ? e.aim : (e._aimB || -Math.PI / 2), rec = e.swing > 0 ? e.swing * 14 * s : 0;
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 9 * s, 13 * s, 4 * s, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = e.flash > 0 ? FLASH : '#6b4a2a'; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 1.4 * s;
      rect(ctx, -11 * s, -2 * s, 22 * s, 10 * s, 2 * s); ctx.fill(); ctx.stroke(); // 받침대
      for (const wx of [-8, 8]) { ctx.fillStyle = e.flash > 0 ? FLASH : '#8a5a2a'; circle(ctx, wx * s, 8 * s, 4 * s); ctx.fill(); ctx.stroke(); line(ctx, wx * s - 3 * s, 8 * s, wx * s + 3 * s, 8 * s, s, '#2a1a0c'); }
      ctx.save(); ctx.translate(0, -3 * s); ctx.rotate(a);
      ctx.fillStyle = e.flash > 0 ? FLASH : '#8a6038'; ctx.fillRect(-6 * s - rec, -2.4 * s, 26 * s, 4.8 * s); ctx.strokeRect(-6 * s - rec, -2.4 * s, 26 * s, 4.8 * s); // 몸통(활틀)
      ctx.strokeStyle = e.flash > 0 ? FLASH : '#3a2410'; ctx.lineWidth = 3 * s; ctx.lineCap = 'round'; // 활 날개
      ctx.beginPath(); ctx.moveTo(14 * s, -13 * s); ctx.quadraticCurveTo(21 * s, 0, 14 * s, 13 * s); ctx.stroke();
      const sx = (e.swing > 0 ? 17 : 6) * s - rec; line(ctx, 14 * s, -13 * s, sx, 0, 0.9 * s, '#f1ead2'); line(ctx, sx, 0, 14 * s, 13 * s, 0.9 * s, '#f1ead2'); // 시위
      if (e.swing <= 0.12) { line(ctx, sx, 0, sx + 22 * s, 0, 1.8 * s, '#e8e0cc'); tri(ctx, sx + 27 * s, 0, sx + 21 * s, -2.4 * s, sx + 21 * s, 2.4 * s); ctx.fillStyle = '#cfd6e4'; ctx.fill(); } // 장전된 대형 화살
      ctx.restore();
      ctx.fillStyle = '#ffb86b'; circle(ctx, 0, -3 * s, 2.2 * s); ctx.fill();
      if (e.job) { ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#6a4a08'; ctx.lineWidth = 0.8 * s; for (let i = 0; i < (e.jobTier || 1); i++) { star(ctx, (i - ((e.jobTier || 1) - 1) / 2) * 5 * s, -22 * s, 2.6 * s); ctx.fill(); ctx.stroke(); } }
    },
    golem(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#7f93b8', legs: '#4b5d82', head: '#aab8d3', line: '#26324d', bw: 18, bh: 15, eye: '#ffd166', belt: '#5b6d92' });
      // 팔(네모 주먹)
      ctx.fillStyle = e.flash > 0 ? FLASH : '#6c80a6'; ctx.strokeStyle = '#26324d'; ctx.lineWidth = s;
      const sw = e.swing > 0 ? -swingOff(e, 0.25) * 3 * s : 0;
      rect(ctx, -13 * s, -1 * s + h.bob, 4.5 * s, 11 * s, s); ctx.fill(); ctx.stroke();
      rect(ctx, 8.5 * s + (e._dir > 0 ? sw : 0), -1 * s + h.bob, 4.5 * s, 11 * s, s); ctx.fill(); ctx.stroke();
    },
    hero(ctx, e, s) {
      // 망토
      ctx.fillStyle = e.flash > 0 ? FLASH : '#c0392b'; tri(ctx, -e._dir * 6 * s, -3 * s, -e._dir * 11 * s, 10 * s, e._dir * -1 * s, 8 * s); ctx.fill();
      const h = body(ctx, e, { s, body: '#e1b43a', legs: '#7a5a1a', head: '#f3cfa6', line: '#3a2a08', belt: '#fff2b0', bw: 13 });
      // 왕관
      if (e.flash <= 0) { ctx.fillStyle = '#ffe36a'; ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 0.9 * s; const cy = h.hyHead - 5 * s; ctx.beginPath(); ctx.moveTo(-4 * s, cy); ctx.lineTo(-4 * s, cy - 3 * s); ctx.lineTo(-2 * s, cy - 1.2 * s); ctx.lineTo(0, cy - 3.6 * s); ctx.lineTo(2 * s, cy - 1.2 * s); ctx.lineTo(4 * s, cy - 3 * s); ctx.lineTo(4 * s, cy); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      const base = e.swing > 0 ? e._face : (e._dir > 0 ? -0.5 : Math.PI + 0.5);
      const ang = base + (e.swing > 0 ? swingOff(e, 0.25) * e._dir : 0);
      const gx = h.hx, gy = h.hy;
      line(ctx, gx, gy, gx + Math.cos(ang) * 19 * s, gy + Math.sin(ang) * 19 * s, 3 * s, e.flash > 0 ? FLASH : '#fff7d0');
      line(ctx, gx - Math.cos(ang + 1.57) * 3.6 * s, gy - Math.sin(ang + 1.57) * 3.6 * s, gx + Math.cos(ang + 1.57) * 3.6 * s, gy + Math.sin(ang + 1.57) * 3.6 * s, 2 * s, '#d99a1a');
    },
    turret(ctx, e, s) {
      const a = e._aimTurret = e.aim !== undefined ? e.aim : (e._aimTurret || -Math.PI / 2);
      const recoil = e.swing > 0 ? e.swing * 14 * s : 0;
      ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 9 * s, 10 * s, 3.2 * s, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = e.flash > 0 ? FLASH : '#8c7a63'; ctx.strokeStyle = '#3b2f20'; ctx.lineWidth = 1.3 * s;
      rect(ctx, -9 * s, -4 * s, 18 * s, 14 * s, 2 * s); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(0, -4 * s); ctx.rotate(a); ctx.fillStyle = '#4a4f5c'; ctx.fillRect(2 * s - recoil, -2.6 * s, 13 * s, 5.2 * s); ctx.strokeRect(2 * s - recoil, -2.6 * s, 13 * s, 5.2 * s); ctx.restore();
      ctx.fillStyle = '#ffb86b'; circle(ctx, 0, -4 * s, 5 * s); ctx.fill(); ctx.stroke();
    },
  };

  // ───────────── 적 ─────────────
  const ENEMY = {
    grunt(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#c8453f', legs: '#5a1f1c', head: '#c9d99a', line: '#2a0f0e', angry: true, belt: '#6a2a20' });
      // 뿔 두 개
      if (e.flash <= 0) { ctx.fillStyle = '#f0e6c8'; tri(ctx, -4 * s, h.hyHead - 4 * s, -3 * s, h.hyHead - 9 * s, -1.2 * s, h.hyHead - 5 * s); ctx.fill(); tri(ctx, 4 * s, h.hyHead - 4 * s, 3 * s, h.hyHead - 9 * s, 1.2 * s, h.hyHead - 5 * s); ctx.fill(); }
      // 단검/몽둥이
      const base = e.swing > 0 ? e._face : (e._dir > 0 ? -0.6 : Math.PI + 0.6);
      const ang = base + (e.swing > 0 ? swingOff(e, 0.25) * e._dir : 0);
      line(ctx, h.hx, h.hy, h.hx + Math.cos(ang) * 10 * s, h.hy + Math.sin(ang) * 10 * s, 2.6 * s, e.flash > 0 ? FLASH : '#8a6a3a');
      ctx.fillStyle = e.flash > 0 ? FLASH : '#6a5a40'; circle(ctx, h.hx + Math.cos(ang) * 10.5 * s, h.hy + Math.sin(ang) * 10.5 * s, 2.6 * s); ctx.fill();
    },
    shield(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#8f2f33', legs: '#3d1416', head: '#d6c79a', line: '#240b0d', angry: true, belt: '#bba060', bw: 13, bh: 14 });
      // 철모
      if (e.flash <= 0) { ctx.fillStyle = '#8c95a8'; ctx.strokeStyle = '#240b0d'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, h.hyHead - 0.4 * s, 6.1 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      // 큰 방패(앞쪽)
      const d = e._dir;
      ctx.fillStyle = e.flash > 0 ? FLASH : '#6a737f'; ctx.strokeStyle = '#1e2229'; ctx.lineWidth = 1.4 * s;
      rect(ctx, d * 5 * s - 4.5 * s, -6 * s + h.bob, 9 * s, 15 * s, 2 * s); ctx.fill(); ctx.stroke();
      if (e.flash <= 0) { ctx.fillStyle = '#c8453f'; ctx.fillRect(d * 5 * s - 1 * s, -3 * s + h.bob, 2 * s, 9 * s); }
      // 짧은 칼
      const base = e.swing > 0 ? e._face : (e._dir > 0 ? -0.3 : Math.PI + 0.3);
      const ang = base + (e.swing > 0 ? swingOff(e, 0.25) * d : 0);
      line(ctx, d * 2 * s, 2 * s + h.bob, d * 2 * s + Math.cos(ang) * 11 * s, 2 * s + h.bob + Math.sin(ang) * 11 * s, 2 * s, e.flash > 0 ? FLASH : '#cfd6e4');
    },
    archer(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#7a3b2a', legs: '#3a1c14', head: '#c9d99a', line: '#2a0f0e', angry: true, belt: '#4a2a1a' });
      if (e.flash <= 0) { ctx.fillStyle = '#4a1f18'; ctx.strokeStyle = '#2a0f0e'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, h.hyHead - 0.8 * s, 6 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      const ang = e.swing > 0 ? e._face : (e._dir > 0 ? -0.15 : Math.PI + 0.15), gx = h.hx * 0.6, gy = h.hy;
      ctx.strokeStyle = e.flash > 0 ? FLASH : '#3a2a20'; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(gx, gy, 8.5 * s, ang - 1.05, ang + 1.05); ctx.stroke();
      const x1 = gx + Math.cos(ang - 1.05) * 8.5 * s, y1 = gy + Math.sin(ang - 1.05) * 8.5 * s, x2 = gx + Math.cos(ang + 1.05) * 8.5 * s, y2 = gy + Math.sin(ang + 1.05) * 8.5 * s;
      const pull = e.swing > 0 ? 1 - e.swing / 0.25 : 0.2, px = gx + Math.cos(ang) * (8.5 * s * Math.cos(1.05) - pull * 4 * s), py = gy + Math.sin(ang) * (8.5 * s * Math.cos(1.05) - pull * 4 * s);
      line(ctx, x1, y1, px, py, 0.9 * s, '#d8cfa8'); line(ctx, px, py, x2, y2, 0.9 * s, '#d8cfa8');
      line(ctx, px, py, px + Math.cos(ang) * 11 * s, py + Math.sin(ang) * 11 * s, 1.3 * s, '#a85a4a');
    },
    bomber(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#e07a2a', legs: '#6a3a14', head: '#e6d58a', line: '#2a1408', angry: true, belt: '#3a2a14', bw: 11, bh: 12, eye: '#d01818' });
      // 가슴에 묶은 폭탄 + 타들어가는 심지
      ctx.fillStyle = e.flash > 0 ? FLASH : '#23262e'; ctx.strokeStyle = '#000'; ctx.lineWidth = s;
      circle(ctx, e._dir * 3.2 * s, 3.5 * s + h.bob, 4.8 * s); ctx.fill(); ctx.stroke();
      const fx = e._dir * 3.2 * s, fy = -1.6 * s + h.bob;
      line(ctx, fx, fy, fx + e._dir * 2 * s, fy - 4 * s, 1.1 * s, '#c9a870');
      const flick = 0.6 + 0.4 * Math.sin((e.id * 7 + (e._walk || 0) * 3));
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffd84a'; circle(ctx, fx + e._dir * 2 * s, fy - 4.6 * s, (1.6 + flick) * s); ctx.fill(); ctx.fillStyle = '#ff6a1a'; circle(ctx, fx + e._dir * 2 * s, fy - 4.6 * s, 0.9 * s); ctx.fill(); ctx.globalAlpha = 1;
    },
    shaman(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#6a3f8f', legs: '#3a2054', head: '#c9d99a', line: '#1e0f2e', belt: '#d9b84a', bw: 13, bh: 14, eye: '#d01818' });
      if (e.flash <= 0) { ctx.fillStyle = '#4a2a6a'; ctx.strokeStyle = '#1e0f2e'; ctx.lineWidth = s; tri(ctx, -6.4 * s, h.hyHead - 3 * s, 6.4 * s, h.hyHead - 3 * s, 0, h.hyHead - 15 * s); ctx.fill(); ctx.stroke(); }
      const sx = e._dir * 8 * s, top = -11 * s + h.bob;
      line(ctx, sx, 9 * s + h.bob, sx, top, 1.8 * s, '#5a3a2a');
      const glow = e.swing > 0 ? 1 + e.swing * 3 : 1;
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#6aff9a'; circle(ctx, sx, top - 2 * s, 5.4 * s * glow); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#c8ffd8'; circle(ctx, sx, top - 2 * s, 2.6 * s); ctx.fill();
    },
    brute(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#7a2a2a', legs: '#3a1414', head: '#bcd08a', line: '#240b0d', angry: true, belt: '#c9a24a', bw: 15, bh: 14 });
      if (e.flash <= 0) { ctx.fillStyle = '#f0e6c8'; ctx.strokeStyle = '#240b0d'; ctx.lineWidth = s; tri(ctx, -1.8 * s, h.hyHead - 4.6 * s, 0, h.hyHead - 12 * s, 1.8 * s, h.hyHead - 4.6 * s); ctx.fill(); ctx.stroke(); }
      const base = e.swing > 0 ? e._face : (e._dir > 0 ? -0.8 : Math.PI + 0.8), ang = base + (e.swing > 0 ? swingOff(e, 0.25) * e._dir : 0);
      const gx = h.hx, gy = h.hy, ex = gx + Math.cos(ang) * 14 * s, ey = gy + Math.sin(ang) * 14 * s;
      line(ctx, gx, gy, ex, ey, 3 * s, e.flash > 0 ? FLASH : '#6b4a26');
      ctx.fillStyle = e.flash > 0 ? FLASH : '#8a8f9c'; ctx.strokeStyle = '#1e2229'; ctx.lineWidth = s; circle(ctx, ex, ey, 5 * s); ctx.fill(); ctx.stroke();
    },
    boss(ctx, e, s) {
      const L = e.look || {};
      if (L.style === 'dragon') return dragon(ctx, e, s);
      const EL = L.elem && ELEM[L.elem];
      if (L.p2) { // 각성한 모습: 등 뒤에 찢어진 날개
        const fl0 = e.flash > 0, wf = Math.sin((e._t || 0) * 0 + (typeof performance !== 'undefined' ? performance.now() : 0) * 0.004) * 2 * s;
        ctx.fillStyle = fl0 ? FLASH : (EL ? EL.wing : '#4a0a18'); ctx.strokeStyle = '#1f0508'; ctx.lineWidth = s;
        for (const sd of [-1, 1]) { tri(ctx, sd * 6 * s, -12 * s, sd * 34 * s, -30 * s + wf, sd * 22 * s, -4 * s); ctx.fill(); ctx.stroke(); tri(ctx, sd * 6 * s, -8 * s, sd * 30 * s, -12 * s + wf, sd * 18 * s, 6 * s); ctx.fill(); ctx.stroke(); }
      }
      const ST = L.style, fl0 = e.flash > 0, dd = e._dir;
      if (ST) { // 암흑 기사단장·마왕: 몸 뒤로 늘어지는 보라 망토 (+ 마왕은 높게 솟은 옷깃)
        const sw = Math.sin((typeof performance !== 'undefined' ? performance.now() : 0) * 0.004) * 1.4 * s - dd * (e._moving ? 2 * s : 0);
        ctx.fillStyle = fl0 ? FLASH : (EL ? EL.cape : L.p2 ? '#6a1020' : '#4c2a80'); ctx.strokeStyle = '#150a22'; ctx.lineWidth = s;
        ctx.beginPath(); ctx.moveTo(-6.5 * s, -4 * s); ctx.lineTo(6.5 * s, -4 * s); ctx.lineTo(14 * s + sw, 13 * s); ctx.lineTo(-14 * s + sw, 13 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (!fl0) { ctx.fillStyle = EL ? EL.hem : L.p2 ? '#a82030' : '#a3284e'; ctx.beginPath(); ctx.moveTo(-14 * s + sw, 13 * s); ctx.lineTo(14 * s + sw, 13 * s); ctx.lineTo(13 * s + sw, 10.4 * s); ctx.lineTo(-13 * s + sw, 10.4 * s); ctx.closePath(); ctx.fill(); }
        if (ST === 'overlord') { ctx.fillStyle = fl0 ? FLASH : (EL ? EL.cape2 : L.p2 ? '#5a0e1a' : '#3e2270'); for (const k of [-1, 1]) { tri(ctx, k * 3 * s, -3 * s, k * 11.5 * s, -19 * s, k * 8 * s, -2 * s); ctx.fill(); ctx.stroke(); } }
      }
      const h = body(ctx, e, { s, body: L.body || '#7b3fa8', legs: EL ? EL.legs : L.p2 ? '#2a0a12' : ST ? '#1c1a26' : '#2a1a3a', head: L.head || '#d9c6e6', line: '#1f0e2e', angry: true, belt: EL ? EL.belt : L.p2 ? '#ff7a2a' : '#e1b43a', bw: 15, bh: 15, eye: EL ? EL.eye : L.p2 ? '#ffd84a' : '#ff3b3b' });
      const d = e._dir, fl = e.flash > 0, gx = h.hx, gy = h.hy;
      const base = e.swing > 0 ? e._face : (d > 0 ? -0.7 : Math.PI + 0.7), ang = base + (e.swing > 0 ? swingOff(e, 0.25) * d : 0);
      const weapon = L.weapon || 'axe';
      if (ST === 'darkknight' && !fl) { // 완전히 덮는 어두운 투구: 눈구멍 틈새의 붉은 빛 + 이마의 보라 문장 + 어깨 갑옷
        ctx.fillStyle = '#1a1c27'; ctx.beginPath(); ctx.moveTo(-5 * s, h.hyHead - 1 * s); ctx.lineTo(5 * s, h.hyHead - 1 * s); ctx.lineTo(4 * s, h.hyHead + 3 * s); ctx.lineTo(-4 * s, h.hyHead + 3 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff3a5a'; ctx.fillRect(-4 * s, h.hyHead - 0.4 * s, 8 * s, 1.1 * s);
        ctx.fillStyle = '#7a44c8'; tri(ctx, -2 * s, h.hyHead - 3 * s, 2 * s, h.hyHead - 3 * s, 0, h.hyHead - 8 * s); ctx.fill();
        ctx.fillStyle = '#3a3e52'; ctx.strokeStyle = '#14161f'; ctx.lineWidth = s; for (const k of [-1, 1]) { ctx.beginPath(); ctx.ellipse(k * 7.2 * s, -1.4 * s + h.bob, 4.2 * s, 3.2 * s, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
      }
      if (ST === 'overlord') { // 붉은 보석 브로치 + 검은 가시 왕관
        if (!fl) { ctx.fillStyle = '#e1b43a'; circle(ctx, 0, 1.5 * s + h.bob, 2.8 * s); ctx.fill(); ctx.fillStyle = EL ? EL.gem : L.p2 ? '#ff7a1a' : '#e0243a'; circle(ctx, 0, 1.5 * s + h.bob, 1.8 * s); ctx.fill(); }
        ctx.fillStyle = fl ? FLASH : (EL ? EL.crown : L.p2 ? '#3a0a10' : '#1c1630'); ctx.strokeStyle = '#e1b43a'; ctx.lineWidth = 0.45 * s;
        const by = h.hyHead - 3.6 * s; for (const [k, hgt] of [[-4.6, 5.5], [-2.3, 8], [0, 9.5], [2.3, 8], [4.6, 5.5]]) { tri(ctx, k * s - 1.5 * s, by, k * s, by - hgt * s, k * s + 1.5 * s, by); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = fl ? FLASH : '#e1b43a'; ctx.fillRect(-6 * s, by - 0.2 * s, 12 * s, 2 * s);
      }
      // 머리 장식: 큰 뿔 (마왕은 왕관 톱니 추가)
      if (!fl && !ST) {
        ctx.fillStyle = L.p2 ? '#ff8a3a' : '#f0e6c8'; ctx.strokeStyle = '#1f0e2e'; ctx.lineWidth = s;
        tri(ctx, -5 * s, h.hyHead - 3 * s, -9 * s, h.hyHead - 14 * s, -1.5 * s, h.hyHead - 5 * s); ctx.fill(); ctx.stroke();
        tri(ctx, 5 * s, h.hyHead - 3 * s, 9 * s, h.hyHead - 14 * s, 1.5 * s, h.hyHead - 5 * s); ctx.fill(); ctx.stroke();
        if (weapon === 'sword') { ctx.fillStyle = '#ffe36a'; for (const k of [-3, 0, 3]) { tri(ctx, k * s - 1.6 * s, h.hyHead - 5.4 * s, k * s, h.hyHead - 9 * s, k * s + 1.6 * s, h.hyHead - 5.4 * s); ctx.fill(); } }
      }
      const axe = (ax, a2, size) => {
        const ex = ax + Math.cos(a2) * 20 * s * size, ey = gy + Math.sin(a2) * 20 * s * size;
        line(ctx, ax, gy, ex, ey, 2.8 * s * size, fl ? '#fff' : '#6b4a26');
        ctx.fillStyle = fl ? '#fff' : '#b9c2d3'; ctx.strokeStyle = '#1f0e2e'; ctx.lineWidth = s;
        tri(ctx, ex + Math.cos(a2 + 1.57) * 8 * s * size, ey + Math.sin(a2 + 1.57) * 8 * s * size, ex - Math.cos(a2 + 1.57) * 8 * s * size, ey - Math.sin(a2 + 1.57) * 8 * s * size, ex + Math.cos(a2) * 5 * s * size, ey + Math.sin(a2) * 5 * s * size); ctx.fill(); ctx.stroke();
      };
      if (weapon === 'axe') axe(gx, ang, 1);
      else if (weapon === 'twin') { axe(gx, ang, 0.8); axe(-gx, Math.PI - ang, 0.8); }
      else if (weapon === 'staff') {
        const ex = gx + Math.cos(ang - 0.6) * 22 * s, ey = gy + Math.sin(ang - 0.6) * 22 * s;
        line(ctx, gx, gy, ex, ey, 2.6 * s, fl ? '#fff' : '#5a3a2a');
        const glow = e.swing > 0 ? 1.6 : 1; ctx.globalAlpha = 0.4; ctx.fillStyle = '#6ab0ff'; circle(ctx, ex, ey, 8 * s * glow); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#d8ecff'; circle(ctx, ex, ey, 4 * s); ctx.fill();
      } else if (weapon === 'cannon') {
        // 어깨 대포: 조준 방향으로 포신이 돌아간다
        const aim = e.aim !== undefined ? e.aim : (d > 0 ? -0.5 : Math.PI + 0.5), cx0 = -d * 2 * s, cy0 = -6 * s + h.bob, recoil = e.swing > 0 ? e.swing * 12 * s : 0;
        ctx.save(); ctx.translate(cx0, cy0); ctx.rotate(aim); ctx.fillStyle = fl ? '#fff' : '#3d424d'; ctx.strokeStyle = '#14161c'; ctx.lineWidth = s;
        ctx.fillRect(2 * s - recoil, -3.6 * s, 20 * s, 7.2 * s); ctx.strokeRect(2 * s - recoil, -3.6 * s, 20 * s, 7.2 * s);
        if (e.swing > 0.2) { ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(24 * s, 0, 5 * s, 0, TAU); ctx.fill(); }
        ctx.restore(); line(ctx, gx, gy, gx + Math.cos(ang) * 9 * s, gy + Math.sin(ang) * 9 * s, 2.6 * s, fl ? '#fff' : '#6b4a26');
      } else if (weapon === 'shield') {
        ctx.fillStyle = fl ? '#fff' : '#7a8594'; ctx.strokeStyle = '#1e2229'; ctx.lineWidth = 1.6 * s;
        rect(ctx, d * 8 * s - 6.5 * s, -9 * s + h.bob, 13 * s, 22 * s, 3 * s); ctx.fill(); ctx.stroke();
        if (!fl) { ctx.fillStyle = '#e1b43a'; ctx.fillRect(d * 8 * s - 1.2 * s, -5 * s + h.bob, 2.4 * s, 14 * s); }
        line(ctx, gx - d * 2 * s, gy, gx - d * 2 * s + Math.cos(ang) * 14 * s, gy + Math.sin(ang) * 14 * s, 3 * s, fl ? '#fff' : '#d0d6e2');
      } else if (weapon === 'sword' && ST) { // 컷신 속 넓적한 대검: 은빛 칼날 + 금빛 가드
        const c1 = Math.cos(ang), s1 = Math.sin(ang), n1 = -s1, n2 = c1;
        ctx.fillStyle = fl ? FLASH : '#d5dae6'; ctx.strokeStyle = '#2a2d3a'; ctx.lineWidth = s;
        ctx.beginPath(); ctx.moveTo(gx + c1 * 6 * s + n1 * 3.4 * s, gy + s1 * 6 * s + n2 * 3.4 * s); ctx.lineTo(gx + c1 * 30 * s + n1 * 3.4 * s, gy + s1 * 30 * s + n2 * 3.4 * s); ctx.lineTo(gx + c1 * 36 * s, gy + s1 * 36 * s); ctx.lineTo(gx + c1 * 30 * s - n1 * 3.4 * s, gy + s1 * 30 * s - n2 * 3.4 * s); ctx.lineTo(gx + c1 * 6 * s - n1 * 3.4 * s, gy + s1 * 6 * s - n2 * 3.4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
        line(ctx, gx + c1 * 7 * s, gy + s1 * 7 * s, gx + c1 * 33 * s, gy + s1 * 33 * s, 1.2 * s, fl ? FLASH : '#f4f7ff');
        line(ctx, gx + c1 * 6 * s - n1 * 6 * s, gy + s1 * 6 * s - n2 * 6 * s, gx + c1 * 6 * s + n1 * 6 * s, gy + s1 * 6 * s + n2 * 6 * s, 2.6 * s, '#e1b43a'); line(ctx, gx - c1 * 2 * s, gy - s1 * 2 * s, gx + c1 * 6 * s, gy + s1 * 6 * s, 3 * s, '#3a2a1a');
      } else if (weapon === 'sword') {
        line(ctx, gx, gy, gx + Math.cos(ang) * 26 * s, gy + Math.sin(ang) * 26 * s, 4 * s, fl ? '#fff' : '#d8c8f0');
        line(ctx, gx - Math.cos(ang + 1.57) * 5 * s, gy - Math.sin(ang + 1.57) * 5 * s, gx + Math.cos(ang + 1.57) * 5 * s, gy + Math.sin(ang + 1.57) * 5 * s, 2.4 * s, '#e1b43a');
      }
    },
  };

  // ── 동물·몬스터 (인간형이 아닌 적) ──
  function shadow(ctx, s, w, y) { ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, (y || 10) * s, w * s, 3 * s, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  // 네발 짐승: 몸통 타원 + 머리 + 귀 + 다리 + 꼬리
  function beast(ctx, e, s, o) {
    if (e._pal) o = Object.assign({}, o, e._pal);
    const d = e._dir, fl = e.flash > 0, w = e._walk || 0, mv = e._moving ? 1 : 0, lunge = e.swing > 0 ? 3 * s : 0;
    shadow(ctx, s, 12);
    ctx.lineCap = 'round'; ctx.strokeStyle = fl ? FLASH : o.legs; ctx.lineWidth = 2.4 * s;
    for (let i = 0; i < 4; i++) { const lx = (i < 2 ? 6 : -6) * s * d + (i % 2 ? 2 : -2) * s * d, sw = mv ? Math.sin(w * 1.6 + i * 1.6) * 3 * s : 0; ctx.beginPath(); ctx.moveTo(lx, 4 * s); ctx.lineTo(lx + sw, 10 * s); ctx.stroke(); }
    ctx.strokeStyle = fl ? FLASH : o.body; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(-9 * s * d, 0); ctx.quadraticCurveTo(-15 * s * d, -4 * s + (mv ? Math.sin(w) * 2 * s : 0), -14 * s * d, -8 * s); ctx.stroke(); // 꼬리
    ctx.fillStyle = fl ? FLASH : o.body; ctx.strokeStyle = o.line; ctx.lineWidth = Math.max(1, 1.1 * s);
    ctx.beginPath(); ctx.ellipse(0, 1.5 * s, (o.rx || 11) * s, (o.ry || 6.5) * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
    if (!fl && o.belly) { ctx.fillStyle = o.belly; ctx.beginPath(); ctx.ellipse(0, 4 * s, (o.rx || 11) * 0.7 * s, 2.6 * s, 0, 0, Math.PI); ctx.fill(); }
    if (!fl && o.mane) { ctx.fillStyle = o.mane; for (let i = 0; i < 5; i++) { const mx = (2 + i * 2.2) * s * d, my = -4.5 * s; tri(ctx, mx - 1.4 * s, my + 1 * s, mx, my - 3.4 * s, mx + 1.4 * s, my + 1 * s); ctx.fill(); } }
    const hx = (o.rx || 11) * 0.85 * s * d + lunge * d, hy = -2 * s;
    ctx.fillStyle = fl ? FLASH : o.head; ctx.strokeStyle = o.line; ctx.beginPath(); ctx.arc(hx, hy, (o.hr || 5.2) * s, 0, TAU); ctx.fill(); ctx.stroke();
    if (!fl) {
      ctx.fillStyle = o.ear || o.head; tri(ctx, hx - 3.4 * s, hy - 3 * s, hx - 2.2 * s, hy - 8 * s, hx - 0.2 * s, hy - 4 * s); ctx.fill(); tri(ctx, hx + 3.4 * s, hy - 3 * s, hx + 2.2 * s, hy - 8 * s, hx + 0.2 * s, hy - 4 * s); ctx.fill();
      ctx.fillStyle = o.snout || o.head; ctx.beginPath(); ctx.ellipse(hx + d * 4 * s, hy + 1.4 * s, 3 * s, 2.2 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a0a0a'; ctx.fillRect(hx + d * 6 * s - 1 * s, hy + 0.2 * s, 2 * s, 1.6 * s);
      ctx.fillStyle = o.eye || '#ffd84a'; ctx.beginPath(); ctx.arc(hx + d * 1.6 * s, hy - 1.4 * s, 1.3 * s, 0, TAU); ctx.fill();
      if (o.tusk) { ctx.strokeStyle = '#f4efd8'; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.moveTo(hx + d * 5 * s, hy + 2.6 * s); ctx.quadraticCurveTo(hx + d * 8 * s, hy + 2 * s, hx + d * 8.5 * s, hy - 1.6 * s); ctx.stroke(); }
      if (o.fang) { ctx.fillStyle = '#fff'; tri(ctx, hx + d * 5.6 * s, hy + 3 * s, hx + d * 6.6 * s, hy + 3 * s, hx + d * 6 * s, hy + 5.2 * s); ctx.fill(); }
    }
  }
  Object.assign(ENEMY, {
    wolf(ctx, e, s) { beast(ctx, e, s, { body: '#7c828c', belly: '#c8ccd2', head: '#8d939e', ear: '#5d626b', snout: '#aeb3bb', legs: '#4f545c', line: '#23262c', mane: '#5d626b', eye: '#ffd84a', fang: true, rx: 11, ry: 6 }); },
    boar(ctx, e, s) { beast(ctx, e, s, { body: '#6b4a32', belly: '#8a6446', head: '#7a553a', ear: '#4a3022', snout: '#b08a6a', legs: '#3a2618', line: '#1e120a', mane: '#3a2618', eye: '#ff7a5a', tusk: true, rx: 13, ry: 8, hr: 6 }); },
    bat(ctx, e, s) {
      const fl = e.flash > 0, t = performance.now() * 0.03 + e.id, flap = Math.sin(t), y0 = -12 * s + Math.sin(t * 0.4) * 1.5 * s;
      shadow(ctx, s, 7, 11);
      const P = e._pal || {}; ctx.fillStyle = fl ? FLASH : (P.wing || '#3b2f55'); ctx.strokeStyle = '#150f22'; ctx.lineWidth = Math.max(1, s);
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 2 * s, y0); ctx.quadraticCurveTo(sd * 10 * s, y0 - 9 * s * flap - 3 * s, sd * 16 * s, y0 - 2 * s * flap + 1 * s); ctx.quadraticCurveTo(sd * 12 * s, y0 + 2 * s, sd * 9 * s, y0 + 4 * s); ctx.quadraticCurveTo(sd * 6 * s, y0 + 2 * s, sd * 4 * s, y0 + 5 * s); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.fillStyle = fl ? FLASH : (P.body || '#4d3d6e'); ctx.beginPath(); ctx.ellipse(0, y0 + 1.5 * s, 4.2 * s, 5 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
      if (!fl) { ctx.fillStyle = '#4d3d6e'; tri(ctx, -3.6 * s, y0 - 2 * s, -3 * s, y0 - 7.5 * s, -0.8 * s, y0 - 3 * s); ctx.fill(); tri(ctx, 3.6 * s, y0 - 2 * s, 3 * s, y0 - 7.5 * s, 0.8 * s, y0 - 3 * s); ctx.fill(); ctx.fillStyle = '#ff4a5a'; ctx.fillRect(-2.4 * s, y0 - 0.6 * s, 1.5 * s, 1.5 * s); ctx.fillRect(0.9 * s, y0 - 0.6 * s, 1.5 * s, 1.5 * s); ctx.fillStyle = '#fff'; ctx.fillRect(-1.4 * s, y0 + 2.4 * s, 0.9 * s, 1.5 * s); ctx.fillRect(0.5 * s, y0 + 2.4 * s, 0.9 * s, 1.5 * s); }
    },
    spider(ctx, e, s) {
      const fl = e.flash > 0, w = e._walk || 0, mv = e._moving ? 1 : 0; shadow(ctx, s, 11);
      ctx.strokeStyle = fl ? FLASH : '#2a2233'; ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { const ph = mv ? Math.sin(w * 1.8 + i * 1.3 + (sd > 0 ? 1 : 0)) * 2 * s : 0, bx = sd * 4 * s, by = 2 * s + (i - 1.5) * 1.6 * s; ctx.beginPath(); ctx.moveTo(bx * 0.5, by); ctx.lineTo(bx + sd * 5 * s, by - 5 * s + ph); ctx.lineTo(bx + sd * 9 * s, by + 7 * s + ph * 0.5); ctx.stroke(); }
      ctx.fillStyle = fl ? FLASH : '#3a2f4a'; ctx.strokeStyle = '#120d1a'; ctx.lineWidth = Math.max(1, s);
      ctx.beginPath(); ctx.ellipse(-d(e) * 3 * s, 3 * s, 6.5 * s, 5.5 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(d(e) * 5 * s, 1.5 * s, 3.8 * s, 0, TAU); ctx.fill(); ctx.stroke();
      if (!fl) { ctx.fillStyle = '#7be04a'; ctx.beginPath(); ctx.arc(-d(e) * 3 * s, 3 * s, 2 * s, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff3b4a'; for (const [ox, oy] of [[5.8, 0], [4.4, 0.4], [6.6, 1.8]]) { ctx.beginPath(); ctx.arc(d(e) * ox * s, oy * s + 0.2 * s, 0.9 * s, 0, TAU); ctx.fill(); } }
    },
    ghost(ctx, e, s) {
      const fl = e.flash > 0, t = performance.now() * 0.005 + e.id, bob = Math.sin(t) * 1.6 * s, y0 = -4 * s + bob; shadow(ctx, s, 8, 11);
      const P = e._pal || {}; ctx.globalAlpha = 0.88; ctx.fillStyle = fl ? FLASH : (P.body || '#cfe3f5'); ctx.strokeStyle = P.line || '#6f89a8'; ctx.lineWidth = Math.max(1, s);
      ctx.beginPath(); ctx.arc(0, y0, 7 * s, Math.PI, 0); ctx.lineTo(7 * s, y0 + 9 * s);
      for (let i = 0; i < 4; i++) { const x = 7 * s - (i + 0.5) * 3.5 * s; ctx.quadraticCurveTo(x + 1.75 * s, y0 + (i % 2 ? 6 : 12) * s + Math.sin(t * 2 + i) * 1.2 * s, x - 1.75 * s + (i === 3 ? 0 : 0), y0 + 9 * s); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
      if (!fl) { ctx.fillStyle = '#1b2a44'; ctx.beginPath(); ctx.ellipse(-2.6 * s, y0 - 0.5 * s, 1.3 * s, 2 * s, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(2.6 * s, y0 - 0.5 * s, 1.3 * s, 2 * s, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, y0 + 3.4 * s, 1.5 * s, 1.1 * s, 0, 0, TAU); ctx.fill(); }
    },
  });
  const d = e => e._dir;

  // 강화형 적: 기본 적의 그림에 색만 바꿔서 그린다 (크기는 판정 반지름을 따른다)
  const BASE = { captain: 'grunt', ironshield: 'shield', crossbow: 'archer', sapper: 'bomber', warlock: 'shaman', ogre: 'brute', direwolf: 'wolf', wyvern: 'bat', wraith: 'ghost' };
  const PAL = {
    captain: { body: '#6a1f1f', legs: '#2a0f0e', head: '#d9b98a', belt: '#e1b43a' },
    ironshield: { body: '#5a6678', legs: '#2b3340', head: '#c9d0da', belt: '#8a94a6' },
    crossbow: { body: '#2f5a3a', legs: '#14301c', head: '#d9d9a0', belt: '#1c3a24' },
    sapper: { body: '#2a2a33', legs: '#111116', head: '#e6b98a', belt: '#c0392b' },
    warlock: { body: '#3a1f5a', legs: '#1a0f2a', head: '#bca0d9', belt: '#c77dff' },
    ogre: { body: '#5a3a1f', legs: '#2a1a0c', head: '#a5c27a', belt: '#3a2410' },
    direwolf: { body: '#3a2f3a', belly: '#7a6a7a', head: '#4a3d4a', ear: '#2a1f2a', snout: '#6a5a6a', legs: '#241a24', eye: '#ff3b3b', mane: '#c0392b' },
    wyvern: { wing: '#2f6a3a', body: '#3d8a4a' },
    wraith: { body: '#6a7a9a', line: '#2a3550' },
  };
  // 전설 유닛: 용사/명궁 그림에 보랏빛·청록 색을 입혀 크게 그린다
  const UBASE = { legendsword: 'hero', legendarcher: 'marksman', undead: 'sword' };
  const UPAL = { undead: { body: '#4a8a5a', legs: '#254a30', head: '#a9d6b0', belt: '#7dffb0' }, legendsword: { body: '#7a1fa8', legs: '#3a0f5a', head: '#f3cfa6', belt: '#ff6bff' }, legendarcher: { body: '#9b3fe8', legs: '#2d1a78', head: '#f3cfa6', belt: '#e0b0ff' } };
  // 개체 하나 그리기. unitScale: 판정 반지름 대비 그림 크기 배율
  function draw(ctx, e, now) {
    track(e, now);
    const table = e.team === 'u' ? UNIT : ENEMY; e._pal = e.team === 'e' ? PAL[e.kind] : (e.job && JPAL[e.job]) || UPAL[e.type];
    const fn = table[e.type || e.kind] || (e.team === 'e' ? ENEMY[BASE[e.kind]] : UNIT[UBASE[e.type]]);
    if (!fn) return;
    const s = (e.r / 10) * 1.25;
    ctx.save(); ctx.translate(e.x, e.y - 3 * s); // 발이 판정 중심 근처에 오도록
    fn(ctx, e, s);
    ctx.restore();
  }
  // 적이 아주 많을 때/멀리서 볼 때 쓰는 간단한 그림: 몸통(네모) + 머리(동그라미)만, 무기·그림자·방향 애니메이션 없음
  const LITE = { grunt: ['#c8453f', '#c9d99a'], shield: ['#8f2f33', '#d6c79a'], archer: ['#7a3b2a', '#c9d99a'], bomber: ['#e07a2a', '#e6d58a'], shaman: ['#6a3f8f', '#c9d99a'], brute: ['#7a2a2a', '#bcd08a'], captain: ['#6a1f1f', '#d9b98a'], ironshield: ['#5a6678', '#c9d0da'], crossbow: ['#2f5a3a', '#d9d9a0'], sapper: ['#2a2a33', '#e6b98a'], warlock: ['#3a1f5a', '#bca0d9'], ogre: ['#5a3a1f', '#a5c27a'], direwolf: ['#3a2f3a', '#4a3d4a'], wyvern: ['#3d8a4a', '#2f6a3a'], wraith: ['#6a7a9a', '#4a5a7a'], wolf: ['#7c828c', '#8d939e'], bat: ['#4d3d6e', '#3b2f55'], boar: ['#6b4a32', '#7a553a'], spider: ['#3a2f4a', '#2a2233'], ghost: ['#cfe3f5', '#b8d0e6'] };
  function drawLite(ctx, e) {
    const s = (e.r / 10) * 1.25, c = LITE[e.kind] || LITE.grunt, fl = e.flash > 0;
    ctx.fillStyle = fl ? '#fff' : c[0]; ctx.fillRect(e.x - 6 * s, e.y - 8 * s, 12 * s, 13 * s);
    ctx.fillStyle = fl ? '#fff' : c[1]; ctx.beginPath(); ctx.arc(e.x, e.y - 11 * s, 5 * s, 0, TAU); ctx.fill();
  }
  // 체력 바 위치 계산용: 그림의 머리 위 높이
  function headTop(e) { return -(e.r / 10) * 1.25 * (e.kind === 'boss' ? (e.look && e.look.style === 'dragon' ? 29 : 17) : (e.kind === 'bat' || e.kind === 'wyvern') ? 26 : e.jobTier ? 21 : 16); }

  window.Figures = { draw, drawLite, headTop };
})();
