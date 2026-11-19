/* 성 지키기 — 맵 배경과 성 그리기 (렌더링 전용)
 * - 풀밭 바닥 + 흙길 + 성 앞 돌바닥 광장 + 덤불/바위/꽃은 조각(chunk) 단위로 한 번만 그려 캐시한다.
 * - 나무는 매 프레임 그리며, 유닛/적과 y 순서로 함께 정렬되어 앞뒤가 맞는다.
 * - 성은 매 프레임 그려서 포신이 적을 향해 돌고, 체력이 줄면 금이 가고 연기/불이 난다.
 * 게임 규칙(core.js)과 무관하며 상태를 바꾸지 않는다. (길 방향은 CastleCore.spawnAngles를 따른다)
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2, W = 3000, H = 3000, CX = 1500, CY = 1500, CHK = 512;

  // ───────────── 결정적 난수/노이즈 (매번 같은 맵) ─────────────
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(x, y, s) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  const sm = t => t * t * (3 - 2 * t);
  function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
  const GRASS_D = [44, 92, 52], GRASS_L = [92, 150, 72];

  // ───────────── 길 (성에서 바깥으로 뻗는 흙길) ─────────────
  let act = 1, roads = [], trees = [], deco = { bushes: [], rocks: [], flowers: [], tufts: [] }, inited = false;
  const chunks = new Map();
  let openCount = 2; // 열려 있는 길 수 (2 → 4 → 6 → 8)

  function roadPoint(theta, d, phase) {
    const taper = Math.min(1, Math.max(0, (d - 120) / 320));
    const off = (Math.sin(d * 0.0046 + phase) * 40 + Math.sin(d * 0.0115 + phase * 2) * 14) * taper;
    return [CX + Math.cos(theta) * d - Math.sin(theta) * off, CY + Math.sin(theta) * d + Math.cos(theta) * off];
  }
  function distToRoads(x, y) {
    let best = 1e9;
    for (const r of roads) for (const p of r.pts) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < best) best = d; }
    return best;
  }

  function init(core) {
    if (inited) return; inited = true;
    const angs = core && core.spawnAngles ? core.spawnAngles(8) : [0.4, 0.4 + Math.PI / 2, 0.4 + Math.PI, 0.4 + 1.5 * Math.PI, 0.4 + Math.PI / 4, 0.4 + 5 * Math.PI / 4, 0.4 + 3 * Math.PI / 4, 0.4 + 7 * Math.PI / 4];
    roads = angs.map((th, i) => {
      const phase = i * 1.9 + 0.5, pts = [];
      for (let d = 110; d <= 2300; d += 30) { const p = roadPoint(th, d, phase); if (p[0] < -60 || p[0] > W + 60 || p[1] < -60 || p[1] > H + 60) break; pts.push(p); }
      return { th, phase, pts, main: i < 4, idx: i };
    });
    const r = rng(2026);
    // 나무: 성 주변과 길은 비우고, 바깥으로 갈수록/가장자리일수록 빽빽하게. 군데군데 숲과 빈터.
    for (let t = 0; t < 9000 && trees.length < 520; t++) {
      const x = 40 + r() * (W - 80), y = 40 + r() * (H - 80), d = Math.hypot(x - CX, y - CY);
      if (d < 330) continue;
      const edge = Math.min(x, y, W - x, H - y), dens = Math.min(1, 0.18 + (d - 330) / 900) * (edge < 260 ? 1.6 : 1);
      if (r() > dens) continue;
      const grove = vnoise(x / 320, y / 320, 3); if (grove < 0.4 && edge > 260) continue;
      if (distToRoads(x, y) < 78) continue;
      trees.push({ _tree: true, x, y, kind: r() < 0.55 ? 'pine' : 'oak', s: 0.85 + r() * 0.75, seed: r() * 100 });
    }
    for (let t = 0; t < 420; t++) { // 맵 가장자리 숲 벽
      const side = Math.floor(r() * 4), a = r() * (side % 2 ? H : W), b = 20 + r() * 90;
      const x = side === 0 ? a : side === 1 ? W - b : side === 2 ? a : b, y = side === 0 ? b : side === 1 ? a : side === 2 ? H - b : a;
      if (distToRoads(x, y) < 60) continue;
      trees.push({ _tree: true, x, y, kind: r() < 0.7 ? 'pine' : 'oak', s: 1.05 + r() * 0.8, seed: r() * 100 });
    }
    trees.sort((p, q) => p.y - q.y);
    for (let t = 0; t < 700 && deco.bushes.length < 260; t++) { const x = 30 + r() * (W - 60), y = 30 + r() * (H - 60), d = Math.hypot(x - CX, y - CY); if (d < 240 || distToRoads(x, y) < 42) continue; deco.bushes.push({ x, y, s: 0.7 + r() * 0.7, berry: r() < 0.3 }); }
    for (let t = 0; t < 600 && deco.rocks.length < 170; t++) { const x = 30 + r() * (W - 60), y = 30 + r() * (H - 60), d = Math.hypot(x - CX, y - CY); if (d < 220 || distToRoads(x, y) < 38) continue; deco.rocks.push({ x, y, s: 0.6 + r() * 1.0, seed: r() * 50 }); }
    for (let t = 0; t < 1400 && deco.flowers.length < 520; t++) { const x = 30 + r() * (W - 60), y = 30 + r() * (H - 60), d = Math.hypot(x - CX, y - CY); if (d < 230 || distToRoads(x, y) < 30) continue; if (vnoise(x / 220, y / 220, 5) < 0.55) continue; deco.flowers.push({ x, y, c: ['#f4f0e0', '#ffd84a', '#ff9ec7', '#b8a0ff'][Math.floor(r() * 4)] }); }
    for (let t = 0; t < 2600; t++) deco.tufts.push({ x: r() * W, y: r() * H, s: 0.8 + r() * 0.8 });
  }

  // ───────────── 바닥 조각 만들기 ─────────────
  function makeChunk(ix, iy) {
    const cv = document.createElement('canvas'); cv.width = CHK; cv.height = CHK;
    const g = cv.getContext('2d'); const ox = ix * CHK, oy = iy * CHK; g.translate(-ox, -oy);
    const inChunk = (x, y, m) => x > ox - m && x < ox + CHK + m && y > oy - m && y < oy + CHK + m;
    // 풀밭: 10px 칸마다 부드러운 노이즈로 색을 바꿔 얼룩진 풀밭 느낌
    for (let y = oy; y < oy + CHK; y += 10) for (let x = ox; x < ox + CHK; x += 10) {
      const n = vnoise(x / 190, y / 190, 1) * 0.6 + vnoise(x / 64, y / 64, 2) * 0.28 + hash(x / 10 | 0, y / 10 | 0, 9) * 0.12;
      g.fillStyle = mix(GRASS_D, GRASS_L, Math.min(1, Math.max(0, n * 1.05))); g.fillRect(x, y, 11, 11);
    }
    // 풀잎 결
    const rr = rng(ix * 977 + iy * 131 + 5);
    g.lineCap = 'round';
    for (let k = 0; k < 220; k++) {
      const x = ox + rr() * CHK, y = oy + rr() * CHK, dark = rr() < 0.5;
      g.strokeStyle = dark ? 'rgba(30,70,40,.35)' : 'rgba(150,210,110,.28)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rr() - 0.5) * 3, y - 3 - rr() * 4); g.stroke();
    }
    // 흙길 (가장자리 → 본체 → 중앙 결)
    for (const road of roads) {
      if (road.idx >= openCount) continue; // 아직 열리지 않은 길
      const pts = road.pts; if (pts.length < 2) continue;
      const near = pts.some(p => inChunk(p[0], p[1], 60)); if (!near) continue;
      const stroke = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
      const w = road.main ? 54 : 34;
      stroke(w + 12, 'rgba(60,44,28,.35)'); stroke(w + 4, '#6d5336'); stroke(w, '#a3835a'); stroke(w * 0.55, '#b09062');
      // 바퀴 자국과 자갈
      g.setLineDash([14, 22]); stroke(2, 'rgba(90,66,40,.45)'); g.setLineDash([]);
      const pr = rng(Math.floor(road.th * 1000));
      for (let k = 0; k < pts.length * 2; k++) { const p = pts[Math.floor(pr() * pts.length)]; if (!inChunk(p[0], p[1], 40)) continue; const a = pr() * TAU, d = pr() * w * 0.5; g.fillStyle = pr() < 0.5 ? 'rgba(120,100,76,.7)' : 'rgba(190,170,130,.7)'; g.beginPath(); g.arc(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d, 1 + pr() * 1.8, 0, TAU); g.fill(); }
    }
    // 성 앞 돌바닥 광장
    if (inChunk(CX, CY, 190)) {
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(CX + 4, CY + 6, 170, 0, TAU); g.fill();
      g.fillStyle = '#7b818c'; g.beginPath(); g.arc(CX, CY, 166, 0, TAU); g.fill();
      const sr = rng(77);
      for (let ring = 36; ring <= 160; ring += 20) {
        const n = Math.round(TAU * ring / 21);
        for (let i = 0; i < n; i++) {
          const a = (i + (ring % 40 ? 0.5 : 0)) / n * TAU, x = CX + Math.cos(a) * ring, y = CY + Math.sin(a) * ring, t = sr();
          g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = mix([128, 134, 146], [168, 172, 182], t); g.strokeStyle = 'rgba(40,44,54,.55)'; g.lineWidth = 1;
          g.beginPath(); if (g.roundRect) g.roundRect(-9, -8, 18, 16, 3); else g.rect(-9, -8, 18, 16); g.fill(); g.stroke(); g.restore();
        }
      }
      g.strokeStyle = '#555a64'; g.lineWidth = 7; g.beginPath(); g.arc(CX, CY, 166, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(220,225,235,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(CX, CY, 160, 0, TAU); g.stroke();
    }
    // 덤불, 바위, 꽃, 풀 덤불
    for (const f of deco.flowers) if (inChunk(f.x, f.y, 6)) { g.fillStyle = 'rgba(40,80,40,.6)'; g.fillRect(f.x - 0.5, f.y, 1, 4); g.fillStyle = f.c; g.beginPath(); g.arc(f.x, f.y, 2.2, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,200,.9)'; g.fillRect(f.x - 0.5, f.y - 0.5, 1, 1); }
    for (const t of deco.tufts) if (inChunk(t.x, t.y, 8)) { g.strokeStyle = 'rgba(40,100,50,.5)'; g.lineWidth = 1.3; for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.x + a * 5 * t.s, t.y - 7 * t.s); g.stroke(); } }
    for (const b of deco.bushes) if (inChunk(b.x, b.y, 30)) {
      g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(b.x, b.y + 6 * b.s, 13 * b.s, 4.5 * b.s, 0, 0, TAU); g.fill();
      for (const [dx, dy, r, c] of [[-7, 0, 8, '#2f6a38'], [7, 1, 8, '#2f6a38'], [0, -3, 9.5, '#3d8546'], [-2, -6, 5, '#55a45a']]) { g.fillStyle = c; g.beginPath(); g.arc(b.x + dx * b.s, b.y + dy * b.s, r * b.s, 0, TAU); g.fill(); }
      if (b.berry) { g.fillStyle = '#d83a4a'; for (const [dx, dy] of [[-5, -2], [3, -5], [6, 1], [-1, 2]]) { g.beginPath(); g.arc(b.x + dx * b.s, b.y + dy * b.s, 1.6, 0, TAU); g.fill(); } }
    }
    for (const k of deco.rocks) if (inChunk(k.x, k.y, 40)) {
      const s = k.s; g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(k.x, k.y + 8 * s, 16 * s, 5 * s, 0, 0, TAU); g.fill();
      const rs = rng(Math.floor(k.seed * 1000)), n = 7, pts = [];
      for (let i = 0; i < n; i++) { const a = i / n * TAU, rad = (11 + rs() * 5) * s; pts.push([k.x + Math.cos(a) * rad, k.y + Math.sin(a) * rad * 0.72]); }
      g.fillStyle = '#7d8390'; g.strokeStyle = '#3a3f4a'; g.lineWidth = 1.2; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(k.x - 3 * s, k.y - 3 * s, 6 * s, 3 * s, -0.4, 0, TAU); g.fill();
      g.fillStyle = 'rgba(70,110,70,.55)'; g.beginPath(); g.ellipse(k.x + 5 * s, k.y + 3 * s, 4 * s, 2 * s, 0.3, 0, TAU); g.fill(); // 이끼
    }
    // 맵 가장자리는 어둡게 (깊은 숲)
    g.save(); g.beginPath(); g.rect(ox, oy, CHK, CHK); g.clip();
    const edge = 300, mk = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(8,24,14,.9)'); gr.addColorStop(1, 'rgba(8,24,14,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
    mk(0, 0, 0, edge, 0, 0, W, edge); mk(0, H, 0, H - edge, 0, H - edge, W, edge); mk(0, 0, edge, 0, 0, 0, edge, H); mk(W, 0, W - edge, 0, W - edge, 0, edge, H);
    g.restore();
    return cv;
  }

  let building = 0;
  function drawGround(ctx, x0, y0, x1, y1) {
    ctx.fillStyle = '#386a40'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const cx0 = Math.max(0, Math.floor(x0 / CHK)), cx1 = Math.min(Math.ceil(W / CHK) - 1, Math.floor(x1 / CHK));
    const cy0 = Math.max(0, Math.floor(y0 / CHK)), cy1 = Math.min(Math.ceil(H / CHK) - 1, Math.floor(y1 / CHK));
    building = 0;
    for (let iy = cy0; iy <= cy1; iy++) for (let ix = cx0; ix <= cx1; ix++) {
      const key = ix + ',' + iy; let cv = chunks.get(key);
      if (!cv) { if (building >= 4) continue; cv = makeChunk(ix, iy); chunks.set(key, cv); building++; } // 프레임당 최대 4조각만 새로 만든다
      ctx.drawImage(cv, 0, 0, CHK, CHK, ix * CHK, iy * CHK, CHK + 1, CHK + 1);
    }
  }

  // ───────────── 나무 (y 정렬해서 유닛과 함께 그린다) ─────────────
  // 보이는 나무를 out 배열에 추가한다 (매 프레임 새 배열을 만들지 않도록 호출자가 재사용)
  function visibleTrees(x0, y0, x1, y1, out) { const o = out || []; for (let i = 0; i < trees.length; i++) { const t = trees[i]; if (t.x > x0 - 60 && t.x < x1 + 60 && t.y > y0 - 20 && t.y < y1 + 90) o.push(t); } return o; }
  function drawTree(ctx, t, now) {
    const s = t.s, sway = Math.sin(now * 0.0013 + t.seed) * 1.6 * s;
    ctx.save(); ctx.translate(t.x, t.y);
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(6 * s, 3 * s, 22 * s, 7 * s, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#5a3d24'; ctx.fillRect(-3.5 * s, -16 * s, 7 * s, 18 * s);
    if (t.kind === 'pine') {
      const tiers = [[26, -16, '#2c6a3a'], [21, -30, '#357a43'], [15, -43, '#3f8c4d'], [9, -54, '#4b9d58']];
      for (const [w, y, c] of tiers) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-w * s + sway * (-y / 54), y * s); ctx.lineTo(w * s + sway * (-y / 54), y * s); ctx.lineTo(sway * (-y / 54) * 1.4, (y - 24) * s); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(10,40,20,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.fillStyle = 'rgba(190,240,170,.2)'; ctx.beginPath(); ctx.moveTo(sway * 1.4, -78 * s); ctx.lineTo(-5 * s, -58 * s); ctx.lineTo(2 * s, -58 * s); ctx.closePath(); ctx.fill();
    } else {
      for (const [dx, dy, r, c] of [[-14, -30, 17, '#2f6e3a'], [14, -30, 17, '#2f6e3a'], [0, -42, 20, '#3a8346'], [0, -26, 18, '#36793f'], [-4, -48, 11, '#58a85a']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc((dx + sway * 0.6) * s, dy * s, r * s, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(200,245,170,.25)'; ctx.beginPath(); ctx.arc((-7 + sway * 0.6) * s, -50 * s, 8 * s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ───────────── 적 출현 포탈 (길 끝의 붉은 룬 원) ─────────────
  function drawPortal(ctx, x, y, now, boss) {
    const t = now * 0.001, pulse = 0.6 + 0.4 * Math.sin(t * 3 + x);
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = 0.18 + 0.12 * pulse; ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.ellipse(0, 0, 44, 22, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,90,90,.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 0, 36, 18, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = 'rgba(255,180,140,.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, 28, 14, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,120,100,.9)'; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + t * 1.5; ctx.beginPath(); ctx.arc(Math.cos(a) * 20, Math.sin(a) * 10, 1.6, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // ───────────── 성 ─────────────
  function tower(ctx, x, y, now, flag) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 9, 17, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8b92a1'; ctx.strokeStyle = '#4a505e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a7aebb'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 11, 0, TAU); ctx.fill();
    // 위에서 본 원뿔 지붕 (조각 색을 번갈아)
    for (let i = 0; i < 8; i++) { const a0 = i / 8 * TAU, a1 = (i + 1) / 8 * TAU; ctx.fillStyle = i % 2 ? '#3f5f9e' : '#4d73bb'; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.arc(x, y - 3, 11, a0, a1); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = '#27385e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y - 3, 11, 0, TAU); ctx.stroke();
    if (flag) { const w = Math.sin(now * 0.006 + x) * 2; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y - 20); ctx.stroke(); ctx.fillStyle = '#e1b43a'; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + 10 + w, y - 17); ctx.lineTo(x, y - 13); ctx.closePath(); ctx.fill(); }
  }
  // 성 갈래(마탑·수호·사령)의 외형: 갈래 → 공격/방어형 → 최종형 순서로 장식이 하나씩 더해진다
  function castleMods(ctx, c, t) {
    const tri = (cx, ax, ay, bx, by, qx, qy) => { cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(bx, by); cx.lineTo(qx, qy); cx.closePath(); };
    const p = c.cpath, v = c.cvar, f = c.cfin, pu = 0.5 + 0.5 * Math.sin(t * 3), corners = [[-46, -46], [46, -46], [-46, 46], [46, 46]];
    const orb = (x, y, r, col, a) => { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; };
    const flame = (x, y, sz, c1, c2, ph) => { const fl = 0.75 + 0.25 * Math.sin(t * 12 + ph); ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x - sz * 0.5, y); ctx.quadraticCurveTo(x - sz * 0.6, y - sz * 0.9 * fl, x, y - sz * 1.7 * fl); ctx.quadraticCurveTo(x + sz * 0.6, y - sz * 0.9 * fl, x + sz * 0.5, y); ctx.closePath(); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x - sz * 0.25, y); ctx.quadraticCurveTo(x, y - sz * 1.0 * fl, x + sz * 0.25, y); ctx.closePath(); ctx.fill(); };
    ctx.save();
    if (p === 'arcane') {
      orb(0, 0, 30 + pu * 4, '#9a5aff', 0.16 + 0.1 * pu);
      ctx.fillStyle = '#b48aff'; ctx.strokeStyle = '#3a1a7a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -34 - pu * 2); ctx.lineTo(8, -16); ctx.lineTo(0, -4); ctx.lineTo(-8, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ece0ff'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(3.5, -17); ctx.lineTo(0, -10); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 4; i++) { const a = t * 1.2 + i * TAU / 4; orb(Math.cos(a) * 58, Math.sin(a) * 58, 3.2, '#c9a0ff', 0.9); orb(Math.cos(a) * 58, Math.sin(a) * 58, 6, '#9a5aff', 0.3); }
      for (const [x, y] of corners) orb(x, y - 8, 3 + pu, '#b48aff', 0.9);
      if (v === 'storm') for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + t * 0.4; flame(Math.cos(a) * 82, Math.sin(a) * 82 + 4, 5, '#ff7a1a', '#ffd23a', i * 2); }
      if (v === 'frost') { ctx.fillStyle = '#bfe8ff'; ctx.strokeStyle = '#4a8ac0'; ctx.lineWidth = 1; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const x = Math.cos(a) * 80, y = Math.sin(a) * 80; tri(ctx, x - 3 * Math.sin(a), y + 3 * Math.cos(a), x + Math.cos(a) * 12, y + Math.sin(a) * 12, x + 3 * Math.sin(a), y - 3 * Math.cos(a)); ctx.fill(); ctx.stroke(); } ctx.globalAlpha = 0.5; ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      if (f === 'meteor') for (let i = 0; i < 3; i++) { const a = -t * 0.9 + i * TAU / 3; const x = Math.cos(a) * 66, y = Math.sin(a) * 40 - 26; orb(x, y, 9, '#ff7a1a', 0.35); ctx.fillStyle = '#5a3a2a'; ctx.strokeStyle = '#ff9a3a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, TAU); ctx.fill(); ctx.stroke(); }
      if (f === 'inferno') for (const [x, y] of corners) flame(x, y - 6, 9, '#ff5a1a', '#ffd23a', x);
      if (f === 'zero') { ctx.save(); ctx.rotate(t * 0.5); ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.85; for (let i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.beginPath(); ctx.moveTo(52, 0); ctx.lineTo(74, 0); ctx.moveTo(62, 0); ctx.lineTo(68, 6); ctx.moveTo(62, 0); ctx.lineTo(68, -6); ctx.stroke(); } ctx.restore(); ctx.globalAlpha = 1; }
      if (f === 'shatter') { ctx.fillStyle = '#d8f4ff'; ctx.strokeStyle = '#3a7ab0'; ctx.lineWidth = 1.2; for (const [x, y] of corners) { const a = Math.atan2(y, x); tri(ctx, x - 5 * Math.sin(a), y + 5 * Math.cos(a), x + Math.cos(a) * 26, y + Math.sin(a) * 26, x + 5 * Math.sin(a), y - 5 * Math.cos(a)); ctx.fill(); ctx.stroke(); } }
    } else if (p === 'guardian') {
      ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(0, -2, 40, 15, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff6c0'; ctx.lineWidth = 7; ctx.stroke(); ctx.globalAlpha = 1;
      for (const [x, y] of corners) { ctx.strokeStyle = '#7a6a3a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 20); ctx.stroke(); ctx.fillStyle = '#fffdf0'; ctx.strokeStyle = '#d9b84a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + 11 + Math.sin(t * 4 + x) * 2, y - 16); ctx.lineTo(x, y - 12); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      orb(0, 0, 26 + pu * 3, '#fff2a0', 0.14);
      if (v === 'judge') { ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.6; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.lineTo(Math.cos(a) * 62, Math.sin(a) * 62); ctx.stroke(); } ctx.globalAlpha = 1; ctx.fillStyle = '#ffe27a'; ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = 1.2; ctx.fillRect(-2, -30, 4, 22); ctx.strokeRect(-2, -30, 4, 22); ctx.fillRect(-8, -22, 16, 3.4); ctx.strokeRect(-8, -22, 16, 3.4); }
      if (v === 'aegis') { ctx.globalAlpha = 0.14 + 0.05 * pu; ctx.fillStyle = '#7ab8ff'; ctx.beginPath(); ctx.arc(0, 0, 84, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.7; ctx.strokeStyle = '#bfe0ff'; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; ctx.fillStyle = '#4a86d8'; ctx.strokeStyle = '#d8ecff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-8, -28); ctx.lineTo(8, -28); ctx.lineTo(8, -17); ctx.quadraticCurveTo(0, -8, -8, -17); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      if (f === 'wrath') { ctx.strokeStyle = '#fff2a0'; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 9)); for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * 20, -60); ctx.lineTo(k * 14, -44); ctx.lineTo(k * 24, -38); ctx.lineTo(k * 16, -20); ctx.stroke(); } ctx.globalAlpha = 1; }
      if (f === 'radiance') { ctx.fillStyle = '#fff6c0'; ctx.globalAlpha = 0.55; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU - t * 0.25; tri(ctx, Math.cos(a - 0.08) * 36, Math.sin(a - 0.08) * 36, Math.cos(a) * 86, Math.sin(a) * 86, Math.cos(a + 0.08) * 36, Math.sin(a + 0.08) * 36); ctx.fill(); } ctx.globalAlpha = 1; }
      if (f === 'bastion') { ctx.fillStyle = '#ffe27a'; ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = 1.2; for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(k * 22, -20); ctx.quadraticCurveTo(k * 58, -50 + Math.sin(t * 3) * 3, k * 70, -18); ctx.quadraticCurveTo(k * 50, -26, k * 22, -8); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
      if (f === 'fortress') { ctx.fillStyle = '#8fc4ff'; ctx.strokeStyle = '#2a5a98'; ctx.lineWidth = 1; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t * 0.2; const x = Math.cos(a) * 66, y = Math.sin(a) * 66; ctx.beginPath(); ctx.moveTo(x - 4, y - 5); ctx.lineTo(x + 4, y - 5); ctx.lineTo(x + 4, y + 1); ctx.quadraticCurveTo(x, y + 6, x - 4, y + 1); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
    } else if (p === 'necro') {
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#1a3a22'; ctx.beginPath(); ctx.ellipse(0, 10, 96, 70, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      for (const [x, y] of corners) { ctx.fillStyle = '#3a3a44'; ctx.fillRect(x - 4, y - 9, 8, 4); flame(x, y - 9, 6, '#3ae68a', '#d8ffe8', x); }
      ctx.fillStyle = '#e8e8dc'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, -4, 9, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(-3.2, -5, 2.2, 0, TAU); ctx.arc(3.2, -5, 2.2, 0, TAU); ctx.fill(); ctx.fillRect(-1.6, -1, 3.2, 3); orb(-3.2, -5, 1.4, '#3ae68a', 1); orb(3.2, -5, 1.4, '#3ae68a', 1);
      if (v === 'horde') for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.4; const x = Math.cos(a) * 66, y = Math.sin(a) * 66; ctx.fillStyle = '#e8e8dc'; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 2.6, y - 1.2, 1.8, 1.8); ctx.fillRect(x + 0.8, y - 1.2, 1.8, 1.8); }
      if (v === 'bind') for (let i = 0; i < 5; i++) { const a = t * 1.0 + i * TAU / 5; const x = Math.cos(a) * 60, y = Math.sin(a) * 38 - 8; orb(x, y, 7, '#7affc8', 0.28); orb(x, y, 3, '#d8fff0', 0.9); }
      if (f === 'legion') for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; const x = Math.cos(a) * 88, y = Math.sin(a) * 88; ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 4 + i); ctx.fillStyle = '#7affc8'; ctx.beginPath(); ctx.arc(x, y - 5, 3, 0, TAU); ctx.fill(); ctx.fillRect(x - 2.4, y - 2, 4.8, 7); ctx.globalAlpha = 1; }
      if (f === 'deathknight') { ctx.fillStyle = '#2a2a33'; ctx.strokeStyle = '#3ae68a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-12, -14); ctx.lineTo(-16, -34); ctx.lineTo(-7, -22); ctx.lineTo(0, -38); ctx.lineTo(7, -22); ctx.lineTo(16, -34); ctx.lineTo(12, -14); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      if (f === 'harvest') for (let i = 0; i < 6; i++) { const ph = (t * 0.5 + i / 6) % 1; orb(Math.cos(i * 1.7) * 50, 30 - ph * 90, 3.2, '#b8ffd8', 0.9 * (1 - ph)); }
      if (f === 'immortal') { ctx.strokeStyle = '#3ae68a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.35 + 0.35 * pu; ctx.beginPath(); ctx.arc(0, 0, 86, 0, TAU); ctx.stroke(); ctx.lineWidth = 8; ctx.globalAlpha = 0.12 + 0.1 * pu; ctx.stroke(); ctx.globalAlpha = 1; }
    }
    ctx.restore();
  }

  function drawCastle(ctx, c, now) {
    const hp = c.max ? c.hp / c.max : 1, t = now * 0.001, flash = c.flash > 0, lv = c.lv || 1, nc = c.cannons || 1;
    ctx.save(); ctx.translate(c.x, c.y);
    // 성 레벨: 3레벨부터 바깥 성벽 고리, 5레벨부터 금장식, 7레벨부터 대리석 빛깔 (레벨이 오를수록 웅장해진다)
    if (lv >= 3) { ctx.strokeStyle = lv >= 7 ? '#e8dfc2' : '#aab2c2'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, 76, 0, TAU); ctx.stroke(); ctx.strokeStyle = 'rgba(40,46,58,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 79.5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 72.5, 0, TAU); ctx.stroke();
      ctx.fillStyle = lv >= 5 ? '#ffd166' : '#c9cfdb'; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 76, Math.sin(a) * 76, 3.2, 0, TAU); ctx.fill(); } }
    // 그림자
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(8, 14, 74, 54, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    // 안뜰 바닥
    ctx.fillStyle = '#6b6f78'; ctx.fillRect(-46, -46, 92, 92);
    // 성벽 4면 (두께 12) + 총안(톱니)
    const wall = lv >= 7 ? '#d8d2bd' : lv >= 4 ? '#aeb8cc' : '#9aa1b0', wallD = '#6f7686', wallL = lv >= 5 ? '#ffe39a' : '#b9bfcc';
    ctx.fillStyle = wall; ctx.strokeStyle = '#4a505e'; ctx.lineWidth = 1.5;
    for (const [x, y, w, h] of [[-46, -46, 92, 12], [-46, 34, 92, 12], [-46, -46, 12, 92], [34, -46, 12, 92]]) { ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); }
    ctx.fillStyle = wallL; for (let i = -40; i <= 40; i += 14) { ctx.fillRect(i - 3, -49, 6, 5); ctx.fillRect(i - 3, 44, 6, 5); ctx.fillRect(-49, i - 3, 5, 6); ctx.fillRect(44, i - 3, 5, 6); }
    ctx.strokeStyle = 'rgba(40,46,58,.35)'; ctx.lineWidth = 1; // 벽돌 줄눈
    for (let i = -40; i <= 40; i += 12) { ctx.beginPath(); ctx.moveTo(i, -46); ctx.lineTo(i, -34); ctx.moveTo(i + 6, 34); ctx.lineTo(i + 6, 46); ctx.stroke(); }
    // 정문 (남쪽 벽): 아치 + 나무문 + 철창
    ctx.fillStyle = '#2a1e14'; ctx.beginPath(); ctx.moveTo(-10, 46); ctx.lineTo(-10, 38); ctx.arc(0, 38, 10, Math.PI, 0); ctx.lineTo(10, 46); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.5; for (const x of [-6, -2, 2, 6]) { ctx.beginPath(); ctx.moveTo(x, 46); ctx.lineTo(x, 33); ctx.stroke(); }
    ctx.strokeStyle = '#3a3a44'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-9, 40); ctx.lineTo(9, 40); ctx.stroke();
    // 중앙 본성(키프): 몸체 + 위에서 본 사각뿔 지붕
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-20, -14, 46, 46);
    ctx.fillStyle = '#a3a9b8'; ctx.strokeStyle = '#4a505e'; ctx.lineWidth = 1.5; ctx.fillRect(-22, -22, 44, 44); ctx.strokeRect(-22, -22, 44, 44);
    const rc = lv >= 6 ? ['#d8a82a', '#b98a1a', '#9a7010', '#c89a20'] : lv >= 3 ? ['#4a6ab0', '#3a5a9a', '#2f4a82', '#4163a8'] : ['#b04a4a', '#8f3a3a', '#7a3030', '#a24141'];
    const roof = [[rc[0], [-22, -22], [22, -22]], [rc[1], [22, -22], [22, 22]], [rc[2], [22, 22], [-22, 22]], [rc[3], [-22, 22], [-22, -22]]];
    for (const [col, a, b] of roof) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = '#3a1818'; ctx.lineWidth = 1; ctx.beginPath(); for (const [, a] of roof) { ctx.moveTo(0, 0); ctx.lineTo(a[0], a[1]); } ctx.stroke();
    // 4개의 탑 (모서리), 북쪽 두 탑에 깃발
    tower(ctx, -46, -46, now * 1000 / 1000, true); tower(ctx, 46, -46, now, true); tower(ctx, -46, 46, now, false); tower(ctx, 46, 46, now, false);
    // 2레벨부터 성벽 가운데에 작은 감시탑, 4레벨부터 모서리 깃발
    if (lv >= 2) for (const [x, y] of [[0, -46], [-46, 0], [46, 0]]) { ctx.fillStyle = lv >= 5 ? '#d8b04a' : '#8a92a2'; ctx.strokeStyle = '#3a404e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#5a606e'; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, TAU); ctx.fill(); }
    if (lv >= 4) for (const [x, y] of [[-46, -46], [46, -46], [-46, 46], [46, 46]]) { ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 24); ctx.stroke(); ctx.fillStyle = lv >= 6 ? '#ffd166' : '#d9534f'; ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.lineTo(x + 11 + Math.sin(t * 5 + x) * 1.5, y - 20); ctx.lineTo(x, y - 16); ctx.closePath(); ctx.fill(); }
    // 추가 대포: 3·5·7레벨마다 모서리 탑 위에 1문씩 (서로 다른 적을 겨눈다)
    const aimX = c.aim !== undefined ? c.aim : -Math.PI / 2;
    for (let i = 1; i < nc; i++) { const [x, y] = [[46, -46], [-46, 46], [46, 46]][i - 1], rc2 = c.swing > 0 ? c.swing * 18 : 0; ctx.save(); ctx.translate(x, y); ctx.rotate(aimX + (i % 2 ? 0.25 : -0.25)); ctx.fillStyle = '#3d424d'; ctx.strokeStyle = '#14161c'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#4a505e'; ctx.fillRect(1 - rc2, -3.4, 17, 6.8); ctx.strokeRect(1 - rc2, -3.4, 17, 6.8); ctx.fillStyle = '#2a2e38'; ctx.fillRect(14 - rc2, -4.2, 4, 8.4); if (c.swing > 0.12) { ctx.fillStyle = 'rgba(255,214,90,.9)'; ctx.beginPath(); ctx.arc(20 - rc2, 0, 5 + c.swing * 10, 0, TAU); ctx.fill(); } ctx.restore(); }
    // 8레벨: 중앙 수정의 푸른 빛
    if (lv >= 8) { const g = 0.5 + 0.5 * Math.sin(t * 3); ctx.globalAlpha = 0.25 + 0.2 * g; ctx.fillStyle = '#7fd8ff'; ctx.beginPath(); ctx.arc(0, 0, 20 + g * 4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    // 대포: 조준 방향으로 돌고 쏠 때 반동 + 포구 불꽃
    const aim = c.aim !== undefined ? c.aim : -Math.PI / 2, recoil = c.swing > 0 ? c.swing * 26 : 0;
    ctx.fillStyle = '#3d424d'; ctx.strokeStyle = '#14161c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.rotate(aim); ctx.fillStyle = '#4a505e'; ctx.fillRect(2 - recoil, -4.5, 26, 9); ctx.strokeRect(2 - recoil, -4.5, 26, 9); ctx.fillStyle = '#2a2e38'; ctx.fillRect(24 - recoil, -5.5, 5, 11);
    if (c.swing > 0.12) { ctx.fillStyle = 'rgba(255,214,90,.95)'; ctx.beginPath(); ctx.arc(32 - recoil, 0, 7 + c.swing * 12, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(31 - recoil, 0, 3.5, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill(); // 포탑 중심 보석

    if (c.cpath) castleMods(ctx, c, t);
    // 중앙 깃대 + 큰 깃발 (펄럭임)
    // 손상: 금, 연기, 불
    if (hp < 0.65) { ctx.strokeStyle = 'rgba(30,30,40,.7)'; ctx.lineWidth = 1.6; for (const [x, y, dx, dy] of [[-30, -46, 6, 14], [20, -46, -5, 12], [46, -10, -12, 8], [-46, 14, 12, 6], [-8, 46, 4, -14]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy * 0.5); ctx.lineTo(x + dx * 0.4, y + dy); ctx.stroke(); } }
    if (hp < 0.4) for (let i = 0; i < 4; i++) { const ph = (t * 0.6 + i * 0.25) % 1; ctx.globalAlpha = (1 - ph) * 0.5; ctx.fillStyle = '#5a5e68'; ctx.beginPath(); ctx.arc(-30 + i * 14 + Math.sin(t * 2 + i) * 4, -30 - ph * 46, 6 + ph * 10, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    if (hp < 0.22) for (let i = 0; i < 6; i++) { const f = 0.6 + 0.4 * Math.sin(t * 14 + i * 2); ctx.globalAlpha = 0.85; ctx.fillStyle = i % 2 ? '#ff7a1a' : '#ffd23a'; ctx.beginPath(); ctx.ellipse(36 + (i - 3) * 3, -42 - f * 6, 3 + f * 2, 6 + f * 5, 0, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    if (flash) { ctx.globalAlpha = 0.55; ctx.fillStyle = '#fff'; ctx.fillRect(-52, -52, 104, 104); ctx.globalAlpha = 1; }
    ctx.restore();
    // 본성 위로 솟은 깃발 (월드 좌표에서 위쪽으로)
    const w = Math.sin(now * 0.005) * 3, px = c.x + 14, py = c.y - 22;
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px, py + 8); ctx.lineTo(px, py - 34); ctx.stroke();
    ctx.fillStyle = flash ? '#fff' : '#3f6fc0'; ctx.strokeStyle = '#1c2f5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py - 34); ctx.quadraticCurveTo(px + 14, py - 34 + w, px + 26 + w, py - 28); ctx.quadraticCurveTo(px + 16, py - 22 - w, px + 26 + w, py - 14); ctx.quadraticCurveTo(px + 12, py - 18 + w, px, py - 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(px + 9, py - 25, 3.2, 0, TAU); ctx.fill();
  }

  // 2막 전환: 새 길을 그리도록 바닥 조각을 다시 만든다 (연출으로 화면이 가려진 동안 한꺼번에 만든다)
  function setAct(n, prebuild) {
    if (n === act) return; act = n; chunks.clear(); openCount = n === 2 ? 8 : 2;
    if (prebuild) for (let iy = 0; iy < Math.ceil(H / CHK); iy++) for (let ix = 0; ix < Math.ceil(W / CHK); ix++) chunks.set(ix + ',' + iy, makeChunk(ix, iy));
  }
  // 길 열기: 새로 열리는 길이 지나는 바닥 조각만 다시 만든다 (2 → 4 → 6개)
  function setRoadCount(n) {
    if (n === openCount || act === 2) return;
    const old = openCount; openCount = n; const keys = new Set(), lo = Math.min(old, n), hi = Math.max(old, n);
    for (const r of roads) if (r.idx >= lo && r.idx < hi) for (const p of r.pts) for (const dx of [-60, 0, 60]) for (const dy of [-60, 0, 60]) keys.add(Math.floor((p[0] + dx) / CHK) + ',' + Math.floor((p[1] + dy) / CHK));
    for (const k of keys) if (chunks.has(k)) { const [ix, iy] = k.split(',').map(Number); chunks.set(k, makeChunk(ix, iy)); }
  }
  function roadPts(i) { return roads[i] ? roads[i].pts : []; }
  // 2막의 어둠: 성 주변만 횃불로 밝고 바깥으로 갈수록 어둡고 푸르스름하다 (월드 위에 한 번 덮는다)
  function drawNight(ctx, vw, vh, sx, sy, zoom, now) {
    const flick = 1 + Math.sin(now * 0.004) * 0.03 + Math.sin(now * 0.011) * 0.015, r0 = 300 * zoom * flick, r1 = Math.max(vw, vh) * 0.85;
    ctx.fillStyle = 'rgba(12,14,52,0.18)'; ctx.fillRect(0, 0, vw, vh); // 전체를 푸르스름하게 어둡게
    const g = ctx.createRadialGradient(sx, sy, r0 * 0.3, sx, sy, r1);
    g.addColorStop(0, 'rgba(6,6,28,0)'); g.addColorStop(Math.min(0.85, r0 / r1), 'rgba(6,6,28,0.12)'); g.addColorStop(1, 'rgba(4,4,20,0.68)'); // 성(횃불) 주변만 밝고 바깥은 깊게 어둡다
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    ctx.fillStyle = 'rgba(60,30,120,0.05)'; ctx.fillRect(0, 0, vw, vh); // 옅은 보랏빛 기운
    const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, 230 * zoom * flick); // 성 부분은 횃불빛으로 한층 밝게
    gl.addColorStop(0, 'rgba(255,214,150,0.20)'); gl.addColorStop(0.6, 'rgba(255,200,130,0.10)'); gl.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gl; ctx.fillRect(sx - 240 * zoom * flick, sy - 240 * zoom * flick, 480 * zoom * flick, 480 * zoom * flick); ctx.restore();
  }

  window.Scenery = { init, setAct, setRoadCount, roadPts, get roadCount() { return openCount; }, drawNight, get act() { return act; }, drawGround, visibleTrees, drawTree, drawPortal, drawCastle, roadsInfo: () => roads.map(r => ({ th: r.th, main: r.main })) };
})();
