/* 성채방어 — 맵 배경과 성채 그리기 (렌더링 전용)
 * - 풀밭 바닥 + 흙길 + 성채 앞 돌바닥 광장 + 덤불/바위/꽃은 조각(chunk) 단위로 한 번만 그려 캐시한다.
 * - 나무는 매 프레임 그리며, 유닛/적과 y 순서로 함께 정렬되어 앞뒤가 맞는다.
 * - 성채는 매 프레임 그려서 포신이 적을 향해 돌고, 체력이 줄면 금이 가고 연기/불이 난다.
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

  // ───────────── 길 (성채에서 바깥으로 뻗는 흙길) ─────────────
  let roads = [], trees = [], deco = { bushes: [], rocks: [], flowers: [], tufts: [] }, inited = false;
  const chunks = new Map();

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
    const angs = core && core.spawnAngles ? core.spawnAngles(6) : [0.4, 0.4 + Math.PI / 2, 0.4 + Math.PI, 0.4 + 1.5 * Math.PI, 0.4 + Math.PI / 4, 0.4 + 5 * Math.PI / 4];
    roads = angs.map((th, i) => {
      const phase = i * 1.9 + 0.5, pts = [];
      for (let d = 110; d <= 2300; d += 30) { const p = roadPoint(th, d, phase); if (p[0] < -60 || p[0] > W + 60 || p[1] < -60 || p[1] > H + 60) break; pts.push(p); }
      return { th, phase, pts, main: i < 4 };
    });
    const r = rng(2026);
    // 나무: 성채 주변과 길은 비우고, 바깥으로 갈수록/가장자리일수록 빽빽하게. 군데군데 숲과 빈터.
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
    // 성채 앞 돌바닥 광장
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
  function visibleTrees(x0, y0, x1, y1) { const out = []; for (const t of trees) if (t.x > x0 - 60 && t.x < x1 + 60 && t.y > y0 - 20 && t.y < y1 + 90) out.push(t); return out; }
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

  // ───────────── 성채 ─────────────
  function tower(ctx, x, y, now, flag) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 9, 17, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8b92a1'; ctx.strokeStyle = '#4a505e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a7aebb'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 11, 0, TAU); ctx.fill();
    // 위에서 본 원뿔 지붕 (조각 색을 번갈아)
    for (let i = 0; i < 8; i++) { const a0 = i / 8 * TAU, a1 = (i + 1) / 8 * TAU; ctx.fillStyle = i % 2 ? '#3f5f9e' : '#4d73bb'; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.arc(x, y - 3, 11, a0, a1); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = '#27385e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y - 3, 11, 0, TAU); ctx.stroke();
    if (flag) { const w = Math.sin(now * 0.006 + x) * 2; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y - 20); ctx.stroke(); ctx.fillStyle = '#e1b43a'; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x + 10 + w, y - 17); ctx.lineTo(x, y - 13); ctx.closePath(); ctx.fill(); }
  }
  function drawCastle(ctx, c, now) {
    const hp = c.max ? c.hp / c.max : 1, t = now * 0.001, flash = c.flash > 0;
    ctx.save(); ctx.translate(c.x, c.y);
    // 그림자
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(8, 14, 74, 54, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    // 안뜰 바닥
    ctx.fillStyle = '#6b6f78'; ctx.fillRect(-46, -46, 92, 92);
    // 성벽 4면 (두께 12) + 총안(톱니)
    const wall = '#9aa1b0', wallD = '#6f7686', wallL = '#b9bfcc';
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
    const roof = [['#b04a4a', [-22, -22], [22, -22]], ['#8f3a3a', [22, -22], [22, 22]], ['#7a3030', [22, 22], [-22, 22]], ['#a24141', [-22, 22], [-22, -22]]];
    for (const [col, a, b] of roof) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = '#3a1818'; ctx.lineWidth = 1; ctx.beginPath(); for (const [, a] of roof) { ctx.moveTo(0, 0); ctx.lineTo(a[0], a[1]); } ctx.stroke();
    // 4개의 탑 (모서리), 북쪽 두 탑에 깃발
    tower(ctx, -46, -46, now * 1000 / 1000, true); tower(ctx, 46, -46, now, true); tower(ctx, -46, 46, now, false); tower(ctx, 46, 46, now, false);
    // 대포: 조준 방향으로 돌고 쏠 때 반동 + 포구 불꽃
    const aim = c.aim !== undefined ? c.aim : -Math.PI / 2, recoil = c.swing > 0 ? c.swing * 26 : 0;
    ctx.fillStyle = '#3d424d'; ctx.strokeStyle = '#14161c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.rotate(aim); ctx.fillStyle = '#4a505e'; ctx.fillRect(2 - recoil, -4.5, 26, 9); ctx.strokeRect(2 - recoil, -4.5, 26, 9); ctx.fillStyle = '#2a2e38'; ctx.fillRect(24 - recoil, -5.5, 5, 11);
    if (c.swing > 0.12) { ctx.fillStyle = 'rgba(255,214,90,.95)'; ctx.beginPath(); ctx.arc(32 - recoil, 0, 7 + c.swing * 12, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(31 - recoil, 0, 3.5, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill(); // 포탑 중심 보석
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

  window.Scenery = { init, drawGround, visibleTrees, drawTree, drawPortal, drawCastle, roadsInfo: () => roads.map(r => ({ th: r.th, main: r.main })) };
})();
