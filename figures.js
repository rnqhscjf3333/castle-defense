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
  function jobDeco(ctx, e, s, h) {
    const id = e.job; if (!id || e.flash > 0) return;
    const hy = h.hyHead, d = e._dir;
    ctx.lineJoin = 'round';
    if (id === 'knight' || id === 'paladin') { // 투구 + 붉은 깃털
      ctx.fillStyle = '#aab4c6'; ctx.strokeStyle = '#2a3140'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, hy - 0.4 * s, 6.3 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d83a3a'; ctx.beginPath(); ctx.ellipse(-d * 1 * s, hy - 8.4 * s, 1.7 * s, 4.2 * s, d * 0.5, 0, TAU); ctx.fill();
      if (id === 'paladin') { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(0, hy - 0.4 * s, 6.3 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); ctx.fillStyle = '#ffd84a'; circle(ctx, d * 6 * s, -1.6 * s + h.bob, 2 * s); ctx.fill(); }
    } else if (id === 'fighter' || id === 'blademaster') { // 붉은 머리띠
      line(ctx, -5.6 * s, hy - 2 * s, 5.6 * s, hy - 2 * s, 2 * s, '#d83a3a'); line(ctx, -d * 5.6 * s, hy - 2 * s, -d * 10 * s, hy - 0.5 * s, 1.4 * s, '#d83a3a');
      if (id === 'blademaster') { ctx.fillStyle = '#ffd84a'; circle(ctx, d * 2.4 * s, hy - 2 * s, 1.1 * s); ctx.fill(); }
    } else if (id === 'sniper' || id === 'deadeye') { // 조준경(외눈 안경)
      ctx.strokeStyle = id === 'deadeye' ? '#ffd84a' : '#cfd6e4'; ctx.lineWidth = 1.3 * s; circle(ctx, d * 3.7 * s, hy - 0.3 * s, 2.5 * s); ctx.stroke(); line(ctx, d * 3.7 * s, hy + 2.2 * s, d * 3 * s, hy + 5 * s, 1 * s, ctx.strokeStyle);
    } else if (id === 'ranger' || id === 'stormarcher') { // 등에 멘 화살통
      ctx.save(); ctx.translate(-d * 7 * s, -2 * s + h.bob); ctx.rotate(-d * 0.35); ctx.fillStyle = '#8a5a2a'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = s; rect(ctx, -1.8 * s, -2 * s, 3.6 * s, 10 * s, s); ctx.fill(); ctx.stroke();
      for (const k of [-1, 0, 1]) line(ctx, k * 1.2 * s, -2 * s, k * 1.6 * s, -5.2 * s, 0.9 * s, id === 'stormarcher' ? '#ffe85a' : '#e8e0cc'); ctx.restore();
    } else if (id === 'cleric' || id === 'highcleric') { // 큰 황금 광륜
      ctx.strokeStyle = '#ffe36a'; ctx.lineWidth = (id === 'highcleric' ? 2.6 : 2) * s; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(0, hy - 8.6 * s, 7 * s, 2.3 * s, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      if (id === 'highcleric') { ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff2a0'; circle(ctx, 0, hy - 8.6 * s, 11 * s); ctx.fill(); ctx.globalAlpha = 1; }
    } else if (id === 'bishop' || id === 'archbishop') { // 주교관(뾰족한 흰 모자 + 금 십자)
      ctx.fillStyle = '#fbf6e6'; ctx.strokeStyle = '#8a6a1a'; ctx.lineWidth = s; tri(ctx, -5 * s, hy - 4 * s, 5 * s, hy - 4 * s, 0, hy - 14 * s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e0a63a'; ctx.fillRect(-0.8 * s, hy - 12 * s, 1.6 * s, 5.4 * s); ctx.fillRect(-2.4 * s, hy - 9.8 * s, 4.8 * s, 1.5 * s);
      if (id === 'archbishop') { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.arc(0, hy - 9 * s, 8 * s, -2.4, -0.74); ctx.stroke(); }
    }
    // 전직 단계 별
    const n = e.jobTier || 1, top = hy - (id === 'bishop' || id === 'archbishop' ? 15 : id === 'knight' || id === 'paladin' ? 13.5 : id === 'cleric' || id === 'highcleric' ? 12.5 : 11) * s;
    ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#6a4a08'; ctx.lineWidth = 0.8 * s;
    for (let i = 0; i < n; i++) { star(ctx, (i - (n - 1) / 2) * 5 * s, top - 2 * s, 2.6 * s); ctx.fill(); ctx.stroke(); }
  }

  // ───────────── 유닛 ─────────────
  const UNIT = {
    sword(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#4f86d9', legs: '#2f4a7a', head: '#f3cfa6', line: '#14213d', belt: '#d8b04a' });
      // 방패(반대편)
      ctx.fillStyle = e.flash > 0 ? FLASH : '#9fb4d6'; ctx.strokeStyle = '#14213d'; ctx.lineWidth = s;
      circle(ctx, -e._dir * 6.2 * s, 1.5 * s + h.bob, 4.2 * s); ctx.fill(); ctx.stroke();
      // 칼
      const base = e.swing > 0 ? e._face : (e._dir > 0 ? -0.5 : Math.PI + 0.5);
      const ang = base + (e.swing > 0 ? swingOff(e, 0.25) * e._dir : 0);
      const gx = h.hx, gy = h.hy, bx = gx + Math.cos(ang) * 14 * s, by = gy + Math.sin(ang) * 14 * s;
      line(ctx, gx, gy, bx, by, 2.4 * s, e.flash > 0 ? FLASH : '#e8edf5');
      line(ctx, gx - Math.cos(ang + 1.57) * 3 * s, gy - Math.sin(ang + 1.57) * 3 * s, gx + Math.cos(ang + 1.57) * 3 * s, gy + Math.sin(ang + 1.57) * 3 * s, 1.6 * s, '#caa24a');
      if (e.swing > 0) { ctx.globalAlpha = 0.35; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(gx, gy, 13 * s, ang - 0.9 * e._dir, ang, e._dir < 0); ctx.stroke(); ctx.globalAlpha = 1; }
      jobDeco(ctx, e, s, h);
    },
    archer(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#4fa86b', legs: '#2b5a3a', head: '#f3cfa6', line: '#10261a', belt: '#7a5a2a' });
      // 후드 모자
      if (e.flash <= 0) { ctx.fillStyle = '#2f7a4a'; ctx.strokeStyle = '#10261a'; ctx.lineWidth = s; ctx.beginPath(); ctx.arc(0, h.hyHead - 0.8 * s, 6 * s, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      // 활: 평소엔 앞쪽, 쏠 때 조준 방향
      const ang = e.swing > 0 ? e._face : (e._dir > 0 ? -0.15 : Math.PI + 0.15);
      const gx = h.hx * 0.6, gy = h.hy;
      ctx.strokeStyle = e.flash > 0 ? FLASH : '#8a5a2a'; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(gx, gy, 8.5 * s, ang - 1.05, ang + 1.05); ctx.stroke();
      const x1 = gx + Math.cos(ang - 1.05) * 8.5 * s, y1 = gy + Math.sin(ang - 1.05) * 8.5 * s, x2 = gx + Math.cos(ang + 1.05) * 8.5 * s, y2 = gy + Math.sin(ang + 1.05) * 8.5 * s;
      const pull = e.swing > 0 ? 1 - e.swing / 0.2 : 0.2; // 시위를 당기는 정도
      const px = gx + Math.cos(ang) * (8.5 * s * Math.cos(1.05) - pull * 4 * s), py = gy + Math.sin(ang) * (8.5 * s * Math.cos(1.05) - pull * 4 * s);
      line(ctx, x1, y1, px, py, 0.9 * s, '#e8e0cc'); line(ctx, px, py, x2, y2, 0.9 * s, '#e8e0cc');
      // 화살
      line(ctx, px, py, px + Math.cos(ang) * 11 * s, py + Math.sin(ang) * 11 * s, 1.3 * s, '#d8cfa8');
      tri(ctx, px + Math.cos(ang) * 13 * s, py + Math.sin(ang) * 13 * s, px + Math.cos(ang + 2.6) * 2 * s + Math.cos(ang) * 9 * s, py + Math.sin(ang + 2.6) * 2 * s + Math.sin(ang) * 9 * s, px + Math.cos(ang - 2.6) * 2 * s + Math.cos(ang) * 9 * s, py + Math.sin(ang - 2.6) * 2 * s + Math.sin(ang) * 9 * s);
      ctx.fillStyle = '#cfd6e4'; ctx.fill();
      jobDeco(ctx, e, s, h);
    },
    priest(ctx, e, s) {
      const h = body(ctx, e, { s, body: '#f2ecd8', legs: '#c9b98a', head: '#f3cfa6', line: '#5a4a20', belt: '#e0a63a', bw: 13, bh: 14 });
      // 광륜
      ctx.strokeStyle = e.flash > 0 ? FLASH : '#ffd84a'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.ellipse(0, h.hyHead - 7 * s, 4.5 * s, 1.6 * s, 0, 0, TAU); ctx.stroke();
      // 지팡이 + 보주
      const sx = e._dir * 8 * s, top = -12 * s + h.bob;
      line(ctx, sx, 9 * s + h.bob, sx, top, 1.8 * s, '#8a5a2a');
      const glow = e.swing > 0 ? 1 + e.swing * 3 : 1;
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#9dffb0'; circle(ctx, sx, top - 2 * s, 5 * s * glow); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#e8ffe8'; circle(ctx, sx, top - 2 * s, 2.6 * s); ctx.fill();
      // 가슴 십자
      if (e.flash <= 0) { ctx.fillStyle = '#d96a6a'; ctx.fillRect(-0.9 * s, -0.5 * s + h.bob, 1.8 * s, 6 * s); ctx.fillRect(-3 * s, 1.4 * s + h.bob, 6 * s, 1.8 * s); }
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
      if (L.p2) { // 각성한 모습: 등 뒤에 찢어진 날개
        const fl0 = e.flash > 0, wf = Math.sin((e._t || 0) * 0 + (typeof performance !== 'undefined' ? performance.now() : 0) * 0.004) * 2 * s;
        ctx.fillStyle = fl0 ? FLASH : '#4a0a18'; ctx.strokeStyle = '#1f0508'; ctx.lineWidth = s;
        for (const sd of [-1, 1]) { tri(ctx, sd * 6 * s, -12 * s, sd * 34 * s, -30 * s + wf, sd * 22 * s, -4 * s); ctx.fill(); ctx.stroke(); tri(ctx, sd * 6 * s, -8 * s, sd * 30 * s, -12 * s + wf, sd * 18 * s, 6 * s); ctx.fill(); ctx.stroke(); }
      }
      const h = body(ctx, e, { s, body: L.body || '#7b3fa8', legs: L.p2 ? '#2a0a12' : '#2a1a3a', head: L.head || '#d9c6e6', line: '#1f0e2e', angry: true, belt: L.p2 ? '#ff7a2a' : '#e1b43a', bw: 15, bh: 15, eye: L.p2 ? '#ffd84a' : '#ff3b3b' });
      const d = e._dir, fl = e.flash > 0, gx = h.hx, gy = h.hy;
      const base = e.swing > 0 ? e._face : (d > 0 ? -0.7 : Math.PI + 0.7), ang = base + (e.swing > 0 ? swingOff(e, 0.25) * d : 0);
      const weapon = L.weapon || 'axe';
      // 머리 장식: 큰 뿔 (마왕은 왕관 톱니 추가)
      if (!fl) {
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
  const UBASE = { legendsword: 'hero', legendarcher: 'marksman' };
  const UPAL = { legendsword: { body: '#7a1fa8', legs: '#3a0f5a', head: '#f3cfa6', belt: '#ff6bff' }, legendarcher: { body: '#1fa89a', legs: '#0f4a45', head: '#f3cfa6', belt: '#7dffe8' } };
  // 개체 하나 그리기. unitScale: 판정 반지름 대비 그림 크기 배율
  function draw(ctx, e, now) {
    track(e, now);
    const table = e.team === 'u' ? UNIT : ENEMY; e._pal = e.team === 'e' ? PAL[e.kind] : UPAL[e.type];
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
  function headTop(e) { return -(e.r / 10) * 1.25 * (e.kind === 'boss' ? 17 : (e.kind === 'bat' || e.kind === 'wyvern') ? 26 : e.jobTier ? 21 : 16); }

  window.Figures = { draw, drawLite, headTop };
})();
