// 소리: 파일 없이 WebAudio로 만든 효과음과 배경음악. 게임 규칙(core.js)과는 무관하다.
// 효과음은 화면 확대 배율(zoom)이 클수록 크게, 화면 중심에서 멀수록 작게(좌우 위치도 반영) 들린다.
(function () {
  'use strict';
  let ctx = null, master = null, sfxBus = null, musBus = null, comp = null, noiseBuf = null;
  const st = { sfx: 0.8, music: 0.5, muted: false };
  try { const j = JSON.parse(localStorage.getItem('cd_audio') || 'null'); if (j) Object.assign(st, j); } catch (e) {}
  const save = () => { try { localStorage.setItem('cd_audio', JSON.stringify(st)); } catch (e) {} };
  let view = { x: 1500, y: 1500, zoom: 1, vw: 900, vh: 700 };
  const last = {}, MINGAP = { shotA: 0.05, shotC: 0.12, shotT: 0.08, hit: 0.04, kill: 0.035, sword: 0.05, boom: 0.07, heal: 0.15, ui: 0.03, spawn: 0.05, udead: 0.1, chain: 0.1 };
  let voices = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    master = ctx.createGain(); sfxBus = ctx.createGain(); musBus = ctx.createGain();
    sfxBus.connect(master); musBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVol(); startMusic();
  }
  function applyVol() { if (!ctx) return; master.gain.value = st.muted ? 0 : 1; sfxBus.gain.value = st.sfx; musBus.gain.value = st.music * 0.5; }
  function setView(v) { view = v; }

  // 소리 크기: 확대할수록 커지고(0.3배~1.8배), 화면 밖일수록 작아진다
  function spatial(x, y) {
    const z = view.zoom;
    const zoomGain = Math.max(0.12, Math.min(1.8, Math.pow(z / 0.9, 1.15)));
    if (x == null) return { g: zoomGain, pan: 0 };
    const sx = (x - view.x) * z, sy = (y - view.y) * z, hw = view.vw / 2, hh = view.vh / 2;
    const out = Math.max(Math.abs(sx) / hw, Math.abs(sy) / hh); // 1이면 화면 가장자리
    const fall = out <= 1 ? 1 - 0.35 * out * out : Math.max(0, 0.65 - (out - 1) * 0.9);
    return { g: zoomGain * fall, pan: Math.max(-1, Math.min(1, sx / hw)) * 0.7 };
  }
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function out(node, vol, pan, t0, dur) {
    const g = ctx.createGain(); g.gain.value = vol; let n = node;
    n.connect(g); if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
    voices++; setTimeout(() => { voices--; }, (dur + 0.1) * 1000);
  }
  function tone(type, f0, f1, t, dur, peak, vol, pan) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.004, peak, dur); o.connect(g); out(g, vol, pan, t, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, peak, vol, pan, f0, f1, q, ftype) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = ftype || 'bandpass'; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain(); env(g, t, 0.003, peak, dur); s.connect(f); f.connect(g); out(g, vol, pan, t, dur); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const SFX = {
    shotA(t, v, p) { noise(t, 0.09, 0.5, v, p, 2600, 900, 2); tone('triangle', 520, 240, t, 0.07, 0.25, v, p); },       // 활
    shotEA(t, v, p) { noise(t, 0.09, 0.4, v * 0.8, p, 2000, 700, 2); },
    shotC(t, v, p) { tone('sine', 150, 45, t, 0.28, 0.9, v, p); noise(t, 0.2, 0.55, v, p, 900, 120, 0.8, 'lowpass'); }, // 대포
    shotT(t, v, p) { tone('square', 300, 120, t, 0.09, 0.22, v, p); noise(t, 0.07, 0.3, v, p, 3000, 1500, 1); },        // 포탑
    shotB(t, v, p) { tone('sawtooth', 200, 70, t, 0.16, 0.4, v, p); noise(t, 0.12, 0.4, v, p, 1400, 400, 1); },          // 발리스타
    shotES(t, v, p) { tone('sine', 110, 38, t, 0.4, 1, v, p); noise(t, 0.3, 0.6, v, p, 700, 90, 0.8, 'lowpass'); },       // 보스 대포
    sword(t, v, p) { noise(t, 0.1, 0.45, v, p, 5000, 1800, 3, 'highpass'); tone('sawtooth', 900, 400, t, 0.06, 0.12, v, p); },
    hit(t, v, p) { tone('square', 220, 110, t, 0.05, 0.18, v, p); noise(t, 0.04, 0.25, v, p, 1800, 900, 1); },
    kill(t, v, p) { tone('triangle', 420, 160, t, 0.12, 0.3, v, p); noise(t, 0.08, 0.25, v, p, 1200, 400, 1); },
    udead(t, v, p) { tone('triangle', 330, 90, t, 0.25, 0.35, v, p); },
    boom(t, v, p) { noise(t, 0.45, 0.9, v, p, 1200, 60, 0.7, 'lowpass'); tone('sine', 100, 30, t, 0.4, 0.9, v, p); },
    bigBoom(t, v, p) { noise(t, 0.9, 1, v, p, 1000, 40, 0.6, 'lowpass'); tone('sine', 70, 24, t, 0.8, 1, v, p); },
    heal(t, v, p) { tone('sine', 660, 990, t, 0.18, 0.25, v, p); tone('sine', 990, 1320, t + 0.08, 0.2, 0.2, v, p); },
    chain(t, v, p) { tone('sawtooth', 1800, 400, t, 0.12, 0.15, v, p); },
    spawn(t, v, p) { tone('sine', 400, 800, t, 0.12, 0.25, v, p); },
    buy(t, v, p) { tone('square', 523, 523, t, 0.06, 0.2, v, 0); tone('square', 784, 784, t + 0.06, 0.1, 0.2, v, 0); },
    deny(t, v, p) { tone('square', 160, 120, t, 0.14, 0.25, v, 0); },
    ui(t, v, p) { tone('triangle', 700, 900, t, 0.05, 0.2, v, 0); },
    card(t, v, p) { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, t + i * 0.07, 0.22, 0.25, v, 0)); },
    job(t, v, p) { [392, 523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, t + i * 0.08, 0.24, 0.18, v, 0)); },
    round(t, v, p) { tone('sawtooth', 220, 220, t, 0.18, 0.3, v, 0); tone('sawtooth', 330, 330, t + 0.16, 0.3, 0.3, v, 0); },
    summon(t, v, p) { tone('sawtooth', 120, 300, t, 0.5, 0.5, v, p); noise(t, 0.5, 0.3, v, p, 300, 1500, 2); },
    shield(t, v, p) { tone('sine', 300, 900, t, 0.4, 0.4, v, p); },
    rage(t, v, p) { tone('sawtooth', 90, 200, t, 0.6, 0.6, v, p); noise(t, 0.5, 0.4, v, p, 200, 900, 1.2); },
    dash(t, v, p) { noise(t, 0.4, 0.6, v, p, 400, 3000, 1.5); },
    win(t, v, p) { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, f, t + i * 0.13, 0.3, 0.3, v, 0)); },
    lose(t, v, p) { [392, 330, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.97, t + i * 0.25, 0.5, 0.25, v, 0)); },
    crit(t, v, p) { tone('square', 1500, 2200, t, 0.08, 0.2, v, p); },
    cast(t, v, p) { tone('sawtooth', 200, 600, t, 0.5, 0.35, v, p); tone('sine', 600, 300, t + 0.4, 0.5, 0.3, v, p); },
    stun(t, v, p) { tone('square', 800, 200, t, 0.3, 0.4, v, p); noise(t, 0.2, 0.5, v, p, 2000, 300, 1); },
    debuff(t, v, p) { tone('sawtooth', 300, 90, t, 0.45, 0.4, v, p); noise(t, 0.3, 0.3, v, p, 900, 200, 1); },
    clear(t, v, p) { [523, 784, 1047].forEach((f, i) => tone('triangle', f, f, t + i * 0.09, 0.2, 0.22, v, 0)); },
    cine(t, v, p) { tone('sawtooth', 60, 45, t, 2.4, 0.5, v, 0); noise(t, 2.2, 0.3, v, 0, 200, 80, 0.7, 'lowpass'); },
  };
  // 위험 신호음: 두 음이 번갈아 울리는 사이렌 3회 (보스 등장)
  function alarm() {
    if (!ctx) return; const t = ctx.currentTime + 0.02, N = 3, P = 1.0; // 웽~웽~ 3회: 음이 부드럽게 오르내린다
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; lp.type = 'lowpass'; lp.frequency.value = 1100;
    for (let k = 0; k < N; k++) {
      const s = t + k * P;
      o.frequency.setValueAtTime(420, s); o.frequency.linearRampToValueAtTime(760, s + P * 0.5); o.frequency.linearRampToValueAtTime(420, s + P);
      o2.frequency.setValueAtTime(210, s); o2.frequency.linearRampToValueAtTime(380, s + P * 0.5); o2.frequency.linearRampToValueAtTime(210, s + P);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.25); g.gain.setValueAtTime(0.16, t + N * P - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + N * P);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(sfxBus);
    o.start(t); o2.start(t); o.stop(t + N * P + 0.05); o2.stop(t + N * P + 0.05);
  }

  // x,y가 있으면 위치 기반(확대·거리 반영), 없으면 UI 소리(확대 무관)
  function play(name, x, y, gainMul) {
    if (!ctx || st.muted || ctx.state !== 'running' || !SFX[name]) return;
    const now = ctx.currentTime, key = name.replace(/^shot.*/, m => m), gap = MINGAP[key] || MINGAP[name.replace(/[A-Z].*/, '')] || 0.03;
    if (last[name] && now - last[name] < gap) return;
    if (voices > 26) return;
    let v = 0.6 * (gainMul || 1), pan = 0;
    if (x != null) { const s = spatial(x, y); v *= s.g; pan = s.pan; }
    if (v < 0.015) return;
    last[name] = now; SFX[name](now + 0.005, v, pan);
  }

  // ── 배경음악: 짧은 코드 진행을 반복하는 합성 음악. 막/보스/위기 상태에 따라 분위기가 바뀐다 ──
  const mus = { mode: 'calm', next: 0, step: 0, timer: null };
  const MODES = {
    calm:  { bpm: 92,  root: 57, prog: [0, 0, 5, 7], scale: [0, 3, 5, 7, 10], lead: 0.5, drum: 0.5 },   // 1막 평소
    boss:  { bpm: 128, root: 52, prog: [0, 1, 0, 6], scale: [0, 1, 4, 5, 7, 8], lead: 0.7, drum: 1 },     // 보스
    dark:  { bpm: 100, root: 50, prog: [0, 0, 8, 6], scale: [0, 2, 3, 6, 7, 8], lead: 0.4, drum: 0.7 },   // 2막
    dark2: { bpm: 136, root: 48, prog: [0, 1, 0, 6], scale: [0, 1, 3, 6, 7, 8], lead: 0.75, drum: 1 },    // 2막 보스
  };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function mnote(type, f, t, dur, peak, dest, lp) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = g; o.connect(g); if (lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; g.connect(f2); n = f2; } n.connect(dest || musBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function mdrum(kind, t, peak) {
    if (kind === 'k') { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(musBus); o.start(t); o.stop(t + 0.25); }
    else { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = kind === 'h' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'h' ? 7000 : 1800; const g = ctx.createGain(); g.gain.setValueAtTime(peak * (kind === 'h' ? 0.35 : 0.8), t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'h' ? 0.04 : 0.12)); s.connect(f); f.connect(g); g.connect(musBus); s.start(t, Math.random() * 0.5); s.stop(t + 0.2); }
  }
  function scheduleStep(m, step, t) {
    const sd = 60 / m.bpm / 2, bar = Math.floor(step / 8) % m.prog.length, s8 = step % 8, ch = m.prog[bar];
    const root = m.root + ch; // 마디마다 코드 루트가 바뀜
    if (s8 === 0) { mnote('sawtooth', mtof(root - 12), t, sd * 7.5, 0.22, null, 420); mnote('triangle', mtof(root), t, sd * 7.5, 0.1, null, 900); mnote('triangle', mtof(root + (m.scale[2] || 5)), t, sd * 7.5, 0.07, null, 900); }
    if (s8 % 2 === 0) mnote('sawtooth', mtof(root - 12 + (s8 === 4 ? 7 : 0)), t, sd * 1.6, 0.17, null, 520);          // 베이스
    const pat = [0, 2, 1, 3, 2, 4, 3, 1]; // 아르페지오
    if (Math.random() < m.lead + 0.2) mnote('square', mtof(root + 12 + m.scale[pat[s8] % m.scale.length]), t, sd * 1.2, 0.045 * m.lead + 0.02, null, 1800);
    if (s8 === 0 || s8 === 4 || (m.drum > 0.9 && s8 === 6)) mdrum('k', t, 0.5 * m.drum);
    if (s8 === 2 || s8 === 6) mdrum('s', t, 0.25 * m.drum);
    if (m.drum > 0.6 && s8 % 2 === 1) mdrum('h', t, 0.18 * m.drum);
  }
  function startMusic() {
    if (mus.timer) return; mus.next = ctx.currentTime + 0.1;
    mus.timer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      const m = MODES[mus.mode];
      while (mus.next < ctx.currentTime + 0.35) { if (!st.muted && st.music > 0) scheduleStep(m, mus.step, mus.next); mus.step++; mus.next += 60 / m.bpm / 2; }
    }, 100);
  }
  function setMood(mode) { if (MODES[mode] && mus.mode !== mode) { mus.mode = mode; mus.step = Math.ceil(mus.step / 32) * 32; } }

  window.addEventListener('pointerdown', init, { passive: true });
  window.addEventListener('keydown', init, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });

  window.Audio2 = {
    init, play, alarm, setView, setMood,
    get state() { return st; }, get ready() { return !!ctx && ctx.state === 'running'; },
    setMuted(b) { st.muted = !!b; save(); applyVol(); }, toggleMute() { this.setMuted(!st.muted); return st.muted; },
    setSfx(v) { st.sfx = Math.max(0, Math.min(1, v)); save(); applyVol(); }, setMusic(v) { st.music = Math.max(0, Math.min(1, v)); save(); applyVol(); },
    spatial, get mood() { return mus.mode; },
  };
})();
