/* =========================================================
   AG · OC 俱乐部 — interactions
   ========================================================= */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function store(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* ignore */ }
  }
  function load(k, d) {
    try { return localStorage.getItem(k) ?? d; } catch (e) { return d; }
  }

  /* ================= 声音 ================= */
  const Sound = (function () {
    let ctx = null;
    let on = load('ag-sound', '0') === '1';
    function init() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function blip(freq, dur, type, gain, slideTo, delay) {
      if (!on) return;
      const c = init();
      if (!c) return;
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.03);
    }
    return {
      get enabled() { return on; },
      toggle() {
        on = !on;
        store('ag-sound', on ? '1' : '0');
        if (on) { init(); blip(660, 0.1, 'triangle', 0.05, 990); }
        return on;
      },
      hover() { blip(1500, 0.045, 'sine', 0.011); },
      click() { blip(540, 0.07, 'triangle', 0.05, 900); },
      pop() { blip(760, 0.09, 'sine', 0.05, 1300); },
      whoosh() { blip(240, 0.3, 'sawtooth', 0.018, 80); },
      ok() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.3, 'sine', 0.045, 0, i * 0.085)); }
    };
  })();

  const soundBtn = $('#soundBtn');
  function syncSoundBtn() {
    if (!soundBtn) return;
    soundBtn.setAttribute('aria-pressed', Sound.enabled ? 'true' : 'false');
  }
  syncSoundBtn();
  soundBtn && soundBtn.addEventListener('click', () => {
    const on = Sound.toggle();
    syncSoundBtn();
    showToast(on ? '声音已开启 ✦ 点点看' : '声音已关闭');
  });

  /* 通用 hover 音效 */
  if (finePointer && !reduceMotion) {
    let last = 0;
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('.btn, .nav-link, .chip-btn, .board-card, .desk-item, .pill, .card-flip, .icon-btn');
      if (!t) return;
      const now = performance.now();
      if (now - last < 90) return;
      last = now;
      Sound.hover();
    }, true);
  }

  /* ================= Toast / 彩纸 ================= */
  const toastEl = $('#toast');
  let toastTimer = 0;
  function showToast(msg, ms) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2400);
  }

  const cf = $('#confetti');
  const cctx = cf ? cf.getContext('2d') : null;
  let confettiParts = [];
  let confettiRAF = 0;
  const CONF_COLORS = ['#ff5fa2', '#ffc857', '#8ef0b0', '#4fd6e6', '#a06bff', '#ffe66d', '#1b1533'];
  function sizeConfetti() {
    if (!cf) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cf.width = Math.floor(innerWidth * d);
    cf.height = Math.floor(innerHeight * d);
    cctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function confetti(count, origin) {
    if (!cf || reduceMotion) return;
    sizeConfetti();
    const ox = origin && origin.x != null ? origin.x : innerWidth / 2;
    const oy = origin && origin.y != null ? origin.y : innerHeight * 0.36;
    for (let i = 0; i < (count || 80); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(3.5, 13);
      confettiParts.push({
        x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(1.5, 6),
        g: rand(0.16, 0.32), life: rand(60, 120), age: 0,
        w: rand(4, 9), h: rand(6, 14), rot: rand(0, 6.28), vr: rand(-0.28, 0.28),
        c: pick(CONF_COLORS)
      });
    }
    if (!confettiRAF) confettiRAF = requestAnimationFrame(stepConfetti);
  }
  function stepConfetti() {
    cctx.clearRect(0, 0, innerWidth, innerHeight);
    confettiParts = confettiParts.filter((p) => p.age < p.life && p.y < innerHeight + 60);
    confettiParts.forEach((p) => {
      p.age++;
      p.vy += p.g;
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const alpha = clamp(1 - p.age / p.life, 0, 1);
      cctx.save();
      cctx.translate(p.x, p.y);
      cctx.rotate(p.rot);
      cctx.globalAlpha = alpha;
      cctx.fillStyle = p.c;
      cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cctx.restore();
    });
    if (confettiParts.length) {
      confettiRAF = requestAnimationFrame(stepConfetti);
    } else {
      cctx.clearRect(0, 0, innerWidth, innerHeight);
      confettiRAF = 0;
    }
  }

  /* ================= 弹层 ================= */
  const modal = $('#modal');
  const modalBody = $('#modalBody');
  let lastFocus = null;
  function openModal(html) {
    if (!modal) return;
    lastFocus = document.activeElement;
    modalBody.innerHTML = html;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const closeBtn = $('.modal-close', modal);
    closeBtn && closeBtn.focus({ preventScroll: true });
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  modal && modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('open')) closeModal();
  });

  /* ================= 加载 ================= */
  const loader = $('#loader');
  const loaderBar = $('#loaderBar');
  if (loader) {
    let p = 0;
    const timer = setInterval(() => {
      p = Math.min(100, p + rand(7, 19));
      if (loaderBar) loaderBar.style.width = p + '%';
      if (p >= 100) {
        clearInterval(timer);
        setTimeout(() => {
          loader.classList.add('done');
          document.body.classList.add('is-loaded');
          revealAll();
        }, 380);
      }
    }, 110);
    setTimeout(() => {
      if (!loader.classList.contains('done')) {
        loader.classList.add('done');
        document.body.classList.add('is-loaded');
      }
    }, 4200);
  }

  /* ================= 光标 ================= */
  if (finePointer && !reduceMotion) {
    document.body.classList.add('cursor-on');
    const dot = $('#cursorDot');
    const ring = $('#cursorRing');
    const glow = $('#cursorGlow');
    let mx = innerWidth / 2, my = innerHeight / 2;
    let rx = mx, ry = my, gx = mx, gy = my;
    document.addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (dot) dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
    }, { passive: true });
    (function loop() {
      rx = lerp(rx, mx, 0.19);
      ry = lerp(ry, my, 0.19);
      gx = lerp(gx, mx, 0.07);
      gy = lerp(gy, my, 0.07);
      if (ring) ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      if (glow) glow.style.transform = `translate(${gx}px, ${gy}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    })();
    document.addEventListener('pointerover', (e) => {
      const hot = e.target.closest('a, button, input, .board-card, .desk-item, .pill, .artifact');
      [dot, ring].forEach((el) => el && el.classList.toggle('is-hot', !!hot));
    }, true);
    document.addEventListener('pointerdown', () => ring && (ring.style.width = ring.style.height = '22px'));
    document.addEventListener('pointerup', () => { if (ring) { ring.style.width = ''; ring.style.height = ''; } });
  }

  /* ================= 星空 ================= */
  (function starfield() {
    const canvas = $('#starbg');
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, stars = [], shooting = null, nextShoot = 3000;
    let pointer = { x: -999, y: -999, active: false };
    let t = 0;

    function build() {
      const n = Math.round(clamp((W * H) / 15000, 55, 175));
      stars = [];
      for (let i = 0; i < n; i++) {
        stars.push({
          x: rand(0, W), y: rand(0, H),
          r: rand(0.4, 1.5), a: rand(0.12, 0.4),
          tw: rand(0.3, 1.5), ph: rand(0, 6.28),
          vx: rand(-0.05, 0.05), vy: rand(-0.16, -0.03),
          hue: pick(['#2a2150', '#7a45e8', '#e0246f', '#0d8bb0', '#a36a00'])
        });
      }
    }
    function resize() {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = Math.floor(W * d);
      canvas.height = Math.floor(H * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      build();
    }
    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('pointermove', (e) => {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    }, { passive: true });
    window.addEventListener('pointerleave', () => { pointer.active = false; pointer.x = pointer.y = -999; });

    function frame(dt) {
      t += dt;
      ctx.clearRect(0, 0, W, H);

      // 连线：光标附近
      if (pointer.active) {
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const dx = s.x - pointer.x, dy = s.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 190 * 190) {
            const d = Math.sqrt(d2);
            ctx.strokeStyle = `rgba(122,69,232,${(1 - d / 190) * 0.22})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.x += s.vx; s.y += s.vy;
        if (s.y < -10) { s.y = H + 10; s.x = rand(0, W); }
        if (s.x < -10) s.x = W + 10;
        if (s.x > W + 10) s.x = -10;
        const flick = 0.55 + 0.45 * Math.sin(t * 0.001 * s.tw + s.ph);
        ctx.globalAlpha = s.a * flick;
        ctx.fillStyle = s.hue;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 流星
      if (!shooting && t > nextShoot) {
        shooting = { x: rand(W * 0.4, W), y: rand(0, H * 0.45), vx: -rand(4, 7), vy: rand(2, 4), life: 80, age: 0 };
      }
      if (shooting) {
        shooting.x += shooting.vx;
        shooting.y += shooting.vy;
        shooting.age++;
        const a = clamp(1 - shooting.age / shooting.life, 0, 1);
        const grad = ctx.createLinearGradient(shooting.x, shooting.y, shooting.x + 80, shooting.y - 40);
        grad.addColorStop(0, `rgba(255,77,151,${a})`);
        grad.addColorStop(1, 'rgba(255,77,151,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(shooting.x, shooting.y);
        ctx.lineTo(shooting.x + 80, shooting.y - 40);
        ctx.stroke();
        if (shooting.age > shooting.life) { shooting = null; nextShoot = t + rand(5000, 11000); }
      }
    }

    let lastT = 0;
    (function loop(now) {
      const dt = Math.min(50, now - lastT || 16);
      lastT = now;
      frame(dt);
      requestAnimationFrame(loop);
    })(0);
  })();

  /* ================= Hero 粒子 & 倾斜 ================= */
  (function hero() {
    const section = $('#home');
    const canvas = $('#heroFx');
    const ag = $('#heroAG');
    if (!section || !canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, parts = [], raf = 0;
    const colors = ['#ff5fa2', '#ffc857', '#8ef0b0', '#4fd6e6', '#a06bff', '#ffe66d', '#1b1533'];

    function resize() {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const r = section.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.floor(W * d);
      canvas.height = Math.floor(H * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    function burst(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(1.5, 9);
        parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(1, 4),
          life: rand(40, 100), age: 0, g: rand(0.04, 0.12),
          size: rand(2, 7), c: pick(colors), rot: rand(0, 6.28), vr: rand(-0.2, 0.2),
          shape: Math.random() > 0.7 ? 'star' : 'dot'
        });
      }
      if (!raf) raf = requestAnimationFrame(step);
    }
    function starPath(s) {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 === 0 ? s : s * 0.42;
        const a = (i / 8) * Math.PI * 2;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    function step() {
      ctx.clearRect(0, 0, W, H);
      parts = parts.filter((p) => p.age < p.life);
      parts.forEach((p) => {
        p.age++;
        p.vy += p.g;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const a = clamp(1 - p.age / p.life, 0, 1);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.c;
        if (p.shape === 'star') starPath(p.size);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size * 0.5, 0, 6.2832); ctx.fill(); }
        ctx.restore();
      });
      if (parts.length) raf = requestAnimationFrame(step);
      else { ctx.clearRect(0, 0, W, H); raf = 0; }
    }

    let clicks = 0;
    const HINTS = [
      'AG 被你点亮了 ✦',
      '第 2 次：它好像有点喜欢你',
      '第 3 次：再来一次会怎样？',
      '第 4 次：好吧，它已经开始发光了',
      '第 5 次：AG 说——去创造吧！'
    ];
    if (ag) {
      ag.addEventListener('click', (e) => {
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX || r.left + r.width / 2) - r.left;
        const y = (e.clientY || r.top + r.height / 2) - r.top;
        burst(x, y, 46);
        ag.classList.remove('is-hit');
        void ag.offsetWidth;
        ag.style.setProperty('--jx', rand(-8, 8) + 'px');
        ag.style.setProperty('--jy', rand(-10, 6) + 'px');
        ag.classList.add('is-hit');
        Sound.pop();
        clicks++;
        if (clicks % 3 === 0) {
          const msg = HINTS[Math.min(HINTS.length - 1, clicks / 3 - 1)] || HINTS[0];
          showToast(msg);
          if (clicks >= 9) { confetti(90, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); Sound.ok(); }
        }
      });
      ag.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ag.click(); } });
    }

    // 磁场倾斜
    if (finePointer && !reduceMotion) {
      const stage = $('#stage');
      let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
      section.addEventListener('pointermove', (e) => {
        const r = section.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
        if (!running && stage) {
          running = true;
          requestAnimationFrame(function tilt() {
            cx = lerp(cx, tx, 0.08);
            cy = lerp(cy, ty, 0.08);
            stage.style.transform = `perspective(1200px) rotateY(${cx * 7}deg) rotateX(${-cy * 7}deg)`;
            if (Math.abs(cx - tx) > 0.001 || Math.abs(cy - ty) > 0.001) requestAnimationFrame(tilt);
            else running = false;
          });
        }
      }, { passive: true });
      section.addEventListener('pointerleave', () => {
        tx = 0; ty = 0;
        if (!running && stage) {
          running = true;
          requestAnimationFrame(function back() {
            cx = lerp(cx, 0, 0.06);
            cy = lerp(cy, 0, 0.06);
            stage.style.transform = `perspective(1200px) rotateY(${cx * 7}deg) rotateX(${-cy * 7}deg)`;
            if (Math.abs(cx) > 0.001 || Math.abs(cy) > 0.001) requestAnimationFrame(back);
            else { running = false; stage.style.transform = ''; }
          });
        }
      });
    }
  })();

  /* ================= 滚动 / 导航 / 进度 ================= */
  const topbar = $('#topbar');
  const progressBar = $('#progressBar');
  let scrollTick = false;
  function onScroll() {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || document.documentElement.scrollTop;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (progressBar) progressBar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
      if (topbar) topbar.classList.toggle('shrink', y > 50);
      scrollTick = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const navLinks = $$('.nav-link');
  const sections = $$('main section[id]');
  if (sections.length && 'IntersectionObserver' in window) {
    const navIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const id = '#' + en.target.id;
        navLinks.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === id));
      });
    }, { rootMargin: '-42% 0px -52% 0px' });
    sections.forEach((s) => navIO.observe(s));
  }

  /* ================= 出现动画 ================= */
  const revealEls = $$('.reveal');
  revealEls.forEach((el, i) => el.style.setProperty('--d', ((i % 4) * 0.08).toFixed(2) + 's'));
  let revealIO = null;
  if ('IntersectionObserver' in window) {
    revealIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          revealIO.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach((el) => revealIO.observe(el));
  }
  function revealAll() {
    revealEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 1.1) el.classList.add('in');
    });
  }

  /* ================= 四大板块 ================= */
  const BOARDS = [
    {
      no: '01', title: 'AIGC 教学', kicker: '从入门到实战',
      lead: '从一句提示词到一件能发出去的作品，中间的那点「手感」，我们一起练。',
      items: [
        'AI 绘图 & 生成视频：提示词怎么写、参数怎么调、废图怎么救',
        '文案 / 设计 / 音乐：让 AI 成为你的第二双手，而不是替身',
        '从入门到实战：每一节课都留下一件能拿走的作品'
      ],
      tags: ['提示词', 'AI 绘图', '视频生成', '设计']
    },
    {
      no: '02', title: 'AI 应用', kicker: '把工具用成手感',
      lead: '不只「玩过」，而是把 AI 装进你的学习与工作流，让效率真的涨起来。',
      items: [
        '工具使用技巧：同一件事，别人要三小时，你只要三次对话',
        '让 AI 帮你学习 / 工作：笔记、周报、复习、资料整理',
        '提升效率与创造力：搭一套属于自己的提示词与工作流'
      ],
      tags: ['工作流', '效率', '提示词库', '学习方法']
    },
    {
      no: '03', title: '应用开发', kicker: '把点子发上线',
      lead: '不会写代码也没关系，AI 会陪你把想法一行一行变成能打开的东西。',
      items: [
        '低代码 / 小程序：一个下午做出第一个能用的工具',
        'Web / App 开发：从页面到交互，把设计稿变成真产品',
        '用 AI 打造自己的产品：想法 → 原型 → 上线 → 迭代'
      ],
      tags: ['低代码', 'Web / App', 'AI 编程', '产品']
    },
    {
      no: '04', title: '一起创造', kicker: '想法变成作品',
      lead: '一个人叫灵感，一群人叫现场。组队、挑战、把作品摆出来给人看。',
      items: [
        '个人 & 团队项目：找到互补的那个队友，一起把事做完',
        'AI 创意挑战：限时、限制、限预算，逼出真正好玩的东西',
        '把想法变成作品：做完、展示、被看见，然后继续下一个'
      ],
      tags: ['组队', '创意挑战', '作品集', '展示']
    }
  ];

  const cards = $$('.board-card');
  cards.forEach((card) => {
    let raf = 0, rx = 0, ry = 0, tx = 0, ty = 0;
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      if (!finePointer) return;
      card.classList.add('is-tilt');
      tx = (px - 0.5) * 2;
      ty = (py - 0.5) * 2;
      if (!raf) {
        raf = requestAnimationFrame(function run() {
          rx = lerp(rx, tx, 0.14);
          ry = lerp(ry, ty, 0.14);
          card.style.transform = `perspective(900px) rotateY(${rx * 7}deg) rotateX(${-ry * 7}deg) translateY(-5px)`;
          if (Math.abs(rx - tx) > 0.002 || Math.abs(ry - ty) > 0.002) raf = requestAnimationFrame(run);
          else raf = 0;
        });
      }
    });
    card.addEventListener('pointerleave', () => {
      tx = ty = 0;
      card.classList.remove('is-tilt');
      card.style.transform = '';
    });
    card.addEventListener('click', () => {
      const i = Number(card.dataset.board);
      const b = BOARDS[i];
      if (!b) return;
      Sound.click();
      openModal(`
        <span class="modal-eyebrow">${b.no} · ${b.kicker}</span>
        <h3>${b.title}</h3>
        <p>${b.lead}</p>
        <ul class="modal-list">
          ${b.items.map((t, k) => `<li><b>0${k + 1}</b><span>${t}</span></li>`).join('')}
        </ul>
        <div class="modal-tags">${b.tags.map((t) => `<span>${t}</span>`).join('')}</div>
        <div class="modal-cta">
          <button class="btn btn-primary" id="pickBoard">就选这个方向</button>
          <button class="btn btn-ghost" data-close>再看看别的</button>
        </div>
      `);
      const pickBtn = $('#pickBoard');
      pickBtn && pickBtn.addEventListener('click', () => {
        closeModal();
        confetti(50);
        Sound.ok();
        showToast(`已记下：${b.title} ✦ 来 AG 一起动手`);
      });
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
  });

  /* ================= 灵感实验室 ================= */
  const PALETTES = {
    poster: { label: '霓虹海报', badge: 'AG · POSTER', bg: ['#2a0a3d', '#4a0f52', '#140826'], colors: ['#ff5fa2', '#ffc857', '#4fd6e6', '#a06bff', '#8ef0b0'] },
    illust: { label: '梦幻插画', badge: 'AG · ILLUSTRATION', bg: ['#0b1d3a', '#123b5e', '#07111f'], colors: ['#7cd7e6', '#c9b6ff', '#ffe0a3', '#ff9ec4', '#8ef0b0'] },
    code: { label: '赛博代码', badge: 'AG · CODE', bg: ['#04120f', '#062a24', '#020a12'], colors: ['#3ddc97', '#4fd6e6', '#ffd166', '#a06bff'] },
    video: { label: '动感短片', badge: 'AG · SHORT VIDEO', bg: ['#1a0b1f', '#3d0f2a', '#0a0612'], colors: ['#ff7a59', '#ff5fa2', '#ffc857', '#6aa8ff'] },
    music: { label: '声波音乐', badge: 'AG · SOUND', bg: ['#0a0a2a', '#1b0f3d', '#060614'], colors: ['#a06bff', '#4fd6e6', '#ff5fa2', '#ffe66d'] }
  };

  const IDEAS = [
    '用 AI 做一张校园乐队招募海报',
    '把社团招新做成一个会动的网页',
    '给毕业设计做一个 AI 展台',
    '用一周时间做一个小程序',
    '让 AI 帮我把论文摘要画成插画',
    '给宿舍做一套赛博风门牌',
    '用 AI 生成一支 15 秒的社团宣传片',
    '把喜欢的诗做成一张海报',
    '做一个自动整理课堂笔记的工具',
    '给校运会设计一套表情包',
    '用 AI 把家乡的老照片修成动画',
    '做一个只属于我们班的点歌台'
  ];

  const CAPTIONS = [
    (idea, style) => `把「${idea}」做成一张${style}：先定情绪，再定颜色，最后留一个让人想靠近的细节。`,
    (idea, style) => `「${idea}」→ ${style}。AG 的建议：把你最想被记住的那一句，放大到占满画面。`,
    (idea, style) => `这是一张「${idea}」的${style}草图：配色已经就位，剩下的交给你的手。`,
    (idea, style) => `别等灵感完整了才开始。「${idea}」先做成一张${style}，它自己会长出下一步。`
  ];

  const artCanvas = $('#artCanvas');
  const ideaInput = $('#ideaInput');
  const styleChips = $('#styleChips');
  const roleChips = $('#roleChips');
  const generateBtn = $('#generateBtn');
  const diceBtn = $('#diceBtn');
  const downloadBtn = $('#downloadBtn');
  const bigArtBtn = $('#bigArtBtn');
  const genOverlay = $('#genOverlay');
  const typeOut = $('#typeOut');
  const artTags = $('#artTags');
  const artBadge = $('#artBadge');
  const densityInput = $('#density');

  let artState = { idea: IDEAS[0], style: 'poster', density: 68, seed: 0 };
  let typeTimer = 0;

  function currentStyle() {
    const on = styleChips ? $('.chip-btn.is-on', styleChips) : null;
    return on ? on.dataset.style : 'poster';
  }

  function drawArt(seed, style, text, density) {
    if (!artCanvas) return;
    const W = 600, H = 800;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    artCanvas.width = Math.round(W * dpr);
    artCanvas.height = Math.round(H * dpr);
    const c = artCanvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const p = PALETTES[style] || PALETTES.poster;
    const rnd = mulberry32(seed);

    // 底色
    const bg = c.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, p.bg[0]);
    bg.addColorStop(0.55, p.bg[1]);
    bg.addColorStop(1, p.bg[2]);
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    // 光斑
    c.globalCompositeOperation = 'lighter';
    const blobs = 4 + Math.round(density / 20);
    for (let i = 0; i < blobs; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = 110 + rnd() * 280;
      const col = p.colors[Math.floor(rnd() * p.colors.length)];
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(col, 0.5));
      rg.addColorStop(1, hexA(col, 0));
      c.fillStyle = rg;
      c.beginPath();
      c.arc(x, y, r, 0, 6.2832);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';

    // 轨道线
    c.save();
    c.translate(W * 0.55, H * 0.34);
    c.rotate(-0.28);
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.ellipse(0, 0, 90 + i * 52, 44 + i * 30, 0.42, 0, 6.2832);
      c.strokeStyle = hexA(p.colors[i % p.colors.length], 0.34);
      c.lineWidth = 1.4;
      c.stroke();
    }
    c.restore();

    // 点阵
    const dots = 5 + Math.round(density / 12);
    c.fillStyle = 'rgba(255,255,255,.22)';
    for (let i = 0; i < dots; i++) {
      for (let j = 0; j < dots; j++) {
        c.beginPath();
        c.arc(W - 150 + i * 14, H - 150 + j * 14, 1.1, 0, 6.2832);
        c.fill();
      }
    }

    // 大色块
    const acc = p.colors[Math.floor(rnd() * p.colors.length)];
    c.save();
    c.translate(W * 0.5, H * 0.46);
    c.rotate(-0.16);
    c.fillStyle = hexA(acc, 0.2);
    c.fillRect(-W * 0.62, -46, W * 1.24, 92);
    c.restore();

    // 主标题：按可用宽度自适应换行 + 缩放
    const maxW = W - 96;
    const chars = Array.from(text.trim() || '灵感');
    let fs = 96, lines = [];
    const fontOf = (s) => `900 ${s}px "Arial Black","PingFang SC","Microsoft YaHei",sans-serif`;
    for (; fs >= 40; fs -= 2) {
      c.font = fontOf(fs);
      lines = [];
      let line = '';
      for (let i = 0; i < chars.length; i++) {
        const test = line + chars[i];
        if (line && c.measureText(test).width > maxW) { lines.push(line); line = chars[i]; }
        else line = test;
      }
      if (line) lines.push(line);
      if (lines.length <= 3) break;
    }
    if (lines.length > 3) { lines = lines.slice(0, 3); }
    const lineH = Math.round(fs * 1.18);
    const blockH = (lines.length - 1) * lineH;
    const lastBase = H * 0.78;
    const firstBase = lastBase - blockH;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.font = fontOf(fs);
    c.fillStyle = '#ffffff';
    c.shadowColor = 'rgba(0,0,0,.38)';
    c.shadowBlur = 30;
    lines.forEach((line, i) => {
      c.fillText(line, 48, firstBase + i * lineH);
    });
    c.shadowBlur = 0;

    // 手写下划线（贴着最后一行文字宽度）
    const lastW = Math.min(maxW, c.measureText(lines[lines.length - 1]).width);
    c.strokeStyle = hexA(p.colors[1] || '#ffc857', 0.9);
    c.lineWidth = 6;
    c.lineCap = 'round';
    const uy = lastBase + 30;
    c.beginPath();
    c.moveTo(48, uy);
    c.quadraticCurveTo(48 + lastW * 0.55, uy - 20, 48 + lastW, uy - 6);
    c.stroke();

    // 标签
    c.font = '700 20px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = 'rgba(255,255,255,.72)';
    c.fillText(`${p.label} · 灵感浓度 ${Math.round(density)}%`, 48, firstBase - fs - 26);

    // 顶部
    c.font = '800 22px "Arial Black","PingFang SC",sans-serif';
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.fillText('AG', 48, 78);
    c.font = '600 16px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.fillText('OC 俱乐部 · 灵感样本', 88, 78);

    // 底部
    c.font = '700 18px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.fillText('用 AI，创造更多可能', 48, H - 44);
    c.font = '600 14px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillStyle = 'rgba(255,255,255,.4)';
    c.fillText('from an idea · ' + new Date().getFullYear(), W - 200, H - 44);

    // 边框
    c.strokeStyle = 'rgba(255,255,255,.16)';
    c.lineWidth = 2;
    roundRect(c, 20, 20, W - 40, H - 40, 22);
    c.stroke();

    // 星点
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, y = rnd() * H;
      c.globalAlpha = 0.2 + rnd() * 0.6;
      c.fillStyle = p.colors[Math.floor(rnd() * p.colors.length)];
      c.beginPath();
      c.arc(x, y, rnd() * 1.8 + 0.6, 0, 6.2832);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function typewriter(text) {
    if (!typeOut) return;
    clearInterval(typeTimer);
    const chars = Array.from(text);
    let i = 0;
    typeOut.innerHTML = '<span class="cursor-blink"></span>';
    typeTimer = setInterval(() => {
      i += 1;
      const done = i >= chars.length;
      typeOut.innerHTML = esc(chars.slice(0, i).join('')) + (done ? '' : '<span class="cursor-blink"></span>');
      if (done) clearInterval(typeTimer);
    }, 24);
  }

  function setArtTags(style, density) {
    if (!artTags) return;
    const p = PALETTES[style];
    const level = density > 78 ? '浓烈' : density > 45 ? '平衡' : '克制';
    artTags.innerHTML = [p.label, level, '本地生成', 'AG 灵感'].map((t) => `<span>${t}</span>`).join('');
  }

  async function generate(idea) {
    const text = (idea || (ideaInput ? ideaInput.value.trim() : '') || pick(IDEAS)).slice(0, 28);
    if (ideaInput) ideaInput.value = text;
    const style = currentStyle();
    const density = densityInput ? Number(densityInput.value) : 68;
    artState = { idea: text, style, density, seed: hashString(text + style + density) };

    if (generateBtn) {
      generateBtn.classList.add('is-busy');
      const lab = $('.btn-label', generateBtn);
      if (lab) lab.textContent = '正在生成…';
    }
    if (genOverlay) genOverlay.classList.add('on');
    Sound.whoosh();
    await wait(reduceMotion ? 120 : 620 + density * 5);

    drawArt(artState.seed, style, text, density);
    if (artBadge) artBadge.textContent = PALETTES[style].badge;
    typewriter(pick(CAPTIONS)(text, PALETTES[style].label));
    setArtTags(style, density);

    if (genOverlay) genOverlay.classList.remove('on');
    if (generateBtn) {
      generateBtn.classList.remove('is-busy');
      const lab = $('.btn-label', generateBtn);
      if (lab) lab.textContent = '把灵感变成作品';
    }
    Sound.ok();
    if (density > 82) {
      const r = artCanvas.getBoundingClientRect();
      confetti(46, { x: r.left + r.width / 2, y: r.top + r.height * 0.4 });
    }
  }

  if (styleChips) {
    styleChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      $$('.chip-btn', styleChips).forEach((b) => b.classList.toggle('is-on', b === btn));
      Sound.click();
      generate();
    });
  }
  if (roleChips) {
    roleChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;
      $$('.chip-btn', roleChips).forEach((b) => b.classList.toggle('is-on', b === btn));
      Sound.click();
      drawMember();
    });
  }
  generateBtn && generateBtn.addEventListener('click', () => generate());
  ideaInput && ideaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(); });
  densityInput && densityInput.addEventListener('change', () => { Sound.click(); generate(); });
  diceBtn && diceBtn.addEventListener('click', () => {
    if (ideaInput) ideaInput.value = pick(IDEAS);
    generate();
  });
  downloadBtn && downloadBtn.addEventListener('click', () => {
    if (!artCanvas) return;
    artCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.download = `AG-${artState.style}-${Date.now()}.png`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      showToast('已保存 ✦ 拿去用吧');
      Sound.ok();
    }, 'image/png');
  });
  bigArtBtn && bigArtBtn.addEventListener('click', () => {
    if (!artCanvas) return;
    openModal(`
      <span class="modal-eyebrow">${PALETTES[artState.style].label} · 灵感浓度 ${artState.density}%</span>
      <h3>「${esc(artState.idea)}」</h3>
      <div class="modal-poster"><img src="${artCanvas.toDataURL('image/png')}" alt="生成的灵感作品"></div>
      <p>本地生成的样本，不是真的 AI 出图，但配色和构图可以当作创作起点。</p>
    `);
  });

  const heroIdeaBtn = $('#ideaBtn');
  heroIdeaBtn && heroIdeaBtn.addEventListener('click', () => {
    if (ideaInput) ideaInput.value = pick(IDEAS);
    const lab = $('#lab');
    if (lab) lab.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => generate(), 700);
  });

  /* ================= 会员卡 ================= */
  const memberCanvas = $('#memberCanvas');
  const nameInput = $('#nameInput');
  const serialOut = $('#serialOut');
  const flipBtn = $('#flipCardBtn');
  const downloadCardBtn = $('#downloadCardBtn');
  const randomNameBtn = $('#randomNameBtn');
  let cardBack = false;

  const NAMES = ['小满', '阿哲', 'Nova', '林深', 'Kiki', '子墨', 'Echo', '年年', '小鹿', 'Zed', '木木', '阿蓝'];

  function currentRole() {
    const on = roleChips ? $('.chip-btn.is-on', roleChips) : null;
    return on ? on.dataset.role : '学习者';
  }

  function serialFor(name, role) {
    const h = hashString(name + '|' + role);
    const a = (h & 0xffff).toString(16).toUpperCase().padStart(4, '0');
    const b = ((h >>> 16) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
    return `AG-${a}-${b}`;
  }

  function drawMember() {
    if (!memberCanvas) return;
    const W = 760, H = 460;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    memberCanvas.width = Math.round(W * dpr);
    memberCanvas.height = Math.round(H * dpr);
    const c = memberCanvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const name = ((nameInput && nameInput.value.trim()) || '新朋友').slice(0, 12);
    const role = currentRole();
    const serial = serialFor(name, role);
    if (serialOut) serialOut.textContent = serial;

    const rnd = mulberry32(hashString(name + role));

    // 角色配色：浅卡不需要重底，只要两枚柔和的角色色
    const ACC = {
      '学习者': ['#4f9dff', '#9a6bff', '#2f6ed0'],
      '创作者': ['#ff4d97', '#ff8a3d', '#d81e6e'],
      '开发者': ['#12a97a', '#1fbbd0', '#0d8a63'],
      '探索者': ['#9a6bff', '#ffc53d', '#6a3fd0']
    };
    const [acc, acc2, accInk] = ACC[role] || ACC['学习者'];

    // 底：奶油白 → 角色色极淡渐变
    const bg = c.createLinearGradient(0, 0, W, H);
    if (cardBack) {
      bg.addColorStop(0, '#fffdf7'); bg.addColorStop(0.55, '#fff5f9'); bg.addColorStop(1, '#eefaff');
    } else {
      bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#fffaf2'); bg.addColorStop(1, '#fff1f7');
    }
    c.fillStyle = bg;
    roundRect(c, 0, 0, W, H, 26);
    c.fill();

    // 光斑（浅底用正片叠底式的柔色，不加亮）
    const glows = cardBack
      ? [[W * 0.86, H * 0.14, acc2], [W * 0.1, H * 0.92, acc]]
      : [[W * 0.9, H * 0.1, acc], [W * 0.04, H * 0.96, acc2]];
    glows.forEach(([x, y, col]) => {
      const g = c.createRadialGradient(x, y, 0, x, y, 300);
      g.addColorStop(0, hexA(col, 0.36));
      g.addColorStop(1, hexA(col, 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, 300, 0, 6.2832);
      c.fill();
    });

    // 网格
    c.strokeStyle = 'rgba(27,21,51,.05)';
    c.lineWidth = 1;
    for (let x = 0; x < W; x += 38) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    }
    for (let y = 0; y < H; y += 38) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }

    // 大 AG 水印
    c.save();
    c.globalAlpha = 0.06;
    c.fillStyle = '#1b1533';
    c.font = '900 300px "Arial Black","PingFang SC",sans-serif';
    c.textAlign = 'right';
    c.fillText('AG', W - 30, H - 20);
    c.restore();

    // 边框
    const border = c.createLinearGradient(0, 0, W, H);
    border.addColorStop(0, hexA(acc, 0.75));
    border.addColorStop(0.45, 'rgba(255,197,61,.55)');
    border.addColorStop(1, hexA(acc2, 0.75));
    c.strokeStyle = border;
    c.lineWidth = 2;
    roundRect(c, 1, 1, W - 2, H - 2, 25);
    c.stroke();

    if (!cardBack) {
      // 头像
      const ax = 112, ay = 150, ar = 50;
      const av = c.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar);
      av.addColorStop(0, acc);
      av.addColorStop(0.5, '#ffc53d');
      av.addColorStop(1, acc2);
      c.fillStyle = av;
      c.beginPath();
      c.arc(ax, ay, ar, 0, 6.2832);
      c.fill();
      c.fillStyle = 'rgba(27,21,51,.88)';
      c.font = '900 42px "Arial Black","PingFang SC",sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(Array.from(name)[0] || 'A', ax, ay + 2);

      // 标签
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.font = '800 15px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillStyle = 'rgba(78,70,112,.75)';
      c.fillText('OC 俱乐部 · 会员卡', 190, 108);

      // 名字
      const n = Array.from(name);
      const nfs = n.length <= 4 ? 58 : n.length <= 6 ? 50 : n.length <= 8 ? 42 : 36;
      c.font = `900 ${nfs}px "Arial Black","PingFang SC","Microsoft YaHei",sans-serif`;
      c.fillStyle = '#1b1533';
      c.fillText(name, 188, 168);

      // 身份（实色胶囊，卡面上最亮的一块颜色）
      c.font = '800 18px "PingFang SC","Microsoft YaHei",sans-serif';
      const roleText = role;
      const rw = c.measureText(roleText).width + 34;
      const roleBg = c.createLinearGradient(188, 0, 188 + rw, 0);
      roleBg.addColorStop(0, acc);
      roleBg.addColorStop(1, acc2);
      c.fillStyle = roleBg;
      roundRect(c, 188, 188, rw, 34, 17);
      c.fill();
      c.fillStyle = '#ffffff';
      c.fillText(roleText, 205, 211);
      c.fillStyle = 'rgba(78,70,112,.55)';
      c.font = '600 14px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText('· 永久有效', 188 + rw + 12, 210);

      // 卡号
      c.font = '700 15px ui-monospace,Consolas,monospace';
      c.fillStyle = accInk;
      c.fillText(serial, 190, 258);

      // 底部四个标签
      const tags = ['学习', '交流', '实践', '创造'];
      c.font = '700 14px "PingFang SC","Microsoft YaHei",sans-serif';
      tags.forEach((t, i) => {
        const x = 48 + i * 78;
        c.fillStyle = 'rgba(27,21,51,.055)';
        roundRect(c, x, H - 96, 66, 28, 14);
        c.fill();
        c.strokeStyle = 'rgba(27,21,51,.1)';
        c.lineWidth = 1;
        c.stroke();
        c.fillStyle = '#4e4670';
        c.textAlign = 'center';
        c.fillText(t, x + 33, H - 77);
        c.textAlign = 'left';
      });

      // 底部色带
      c.save();
      roundRect(c, 0, 0, W, H, 26);
      c.clip();
      const bandAccent = c.createLinearGradient(0, 0, W, 0);
      bandAccent.addColorStop(0, acc);
      bandAccent.addColorStop(0.5, acc2);
      bandAccent.addColorStop(1, '#ffc53d');
      c.fillStyle = bandAccent;
      c.fillRect(0, H - 58, W, 4);
      const band = c.createLinearGradient(0, 0, W, 0);
      band.addColorStop(0, '#1b1533');
      band.addColorStop(1, '#2b2150');
      c.fillStyle = band;
      c.fillRect(0, H - 54, W, 54);
      c.fillStyle = 'rgba(255,248,237,.72)';
      c.font = '700 13px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText('AG · OC 俱乐部', 48, H - 22);
      c.textAlign = 'right';
      c.fillStyle = 'rgba(255,248,237,.92)';
      c.font = '700 14px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText('用 AI，创造更多可能', W - 40, H - 22);
      c.restore();
      c.strokeStyle = border;
      c.lineWidth = 2;
      roundRect(c, 1, 1, W - 2, H - 2, 25);
      c.stroke();
      c.textAlign = 'left';
    } else {
      // 背面
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.font = '800 14px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillStyle = accInk;
      c.fillText('AG · 会员守则', 48, 68);

      c.font = '900 40px "Arial Black","PingFang SC","Microsoft YaHei",sans-serif';
      c.fillStyle = '#1b1533';
      c.fillText('用 AI，', 48, 138);
      c.fillText('创造更多可能。', 48, 190);

      c.font = '600 16px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillStyle = 'rgba(78,70,112,.72)';
      ['01 · 有想法就动手，做出来再聊。', '02 · 工具会过时，审美和好奇不会。', '03 · 教会别人，是学得最快的方式。', '04 · 一起做成一件小事，比独自想做件大事强。'].forEach((line, i) => {
        c.fillText(line, 48, 250 + i * 32);
      });

      // 假二维码
      const qx = W - 190, qy = H - 190, qs = 140;
      c.fillStyle = '#ffffff';
      roundRect(c, qx, qy, qs, qs, 12);
      c.fill();
      c.strokeStyle = 'rgba(27,21,51,.12)';
      c.lineWidth = 1;
      c.stroke();
      const cell = 10, n = 11;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (rnd() > 0.52) {
            c.fillStyle = '#1b1533';
            c.fillRect(qx + 12 + i * cell, qy + 12 + j * cell, cell - 2, cell - 2);
          }
        }
      }
      c.fillStyle = '#1b1533';
      [[12, 12], [qs - 12 - 30, 12], [12, qs - 12 - 30]].forEach(([ox, oy]) => {
        c.fillRect(qx + ox, qy + oy, 30, 30);
        c.fillStyle = '#ffffff';
        c.fillRect(qx + ox + 6, qy + oy + 6, 18, 18);
        c.fillStyle = accInk;
        c.fillRect(qx + ox + 11, qy + oy + 11, 8, 8);
      });

      c.textAlign = 'center';
      c.fillStyle = 'rgba(124,115,150,.85)';
      c.font = '600 12px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText('扫不出来的二维码 · 但你会来', qx + qs / 2, qy + qs + 24);
      c.textAlign = 'left';

      c.fillStyle = 'rgba(124,115,150,.85)';
      c.font = '600 13px "PingFang SC","Microsoft YaHei",sans-serif';
      c.fillText(serial + ' · 好奇心是唯一的门槛', 48, H - 36);
    }
  }

  nameInput && nameInput.addEventListener('input', drawMember);
  flipBtn && flipBtn.addEventListener('click', () => {
    cardBack = !cardBack;
    flipBtn.textContent = cardBack ? '↻ 翻回正面' : '↻ 翻个面';
    if (memberCanvas) {
      memberCanvas.style.transition = 'transform .18s ease';
      memberCanvas.style.transform = 'rotateY(90deg) scale(.98)';
      setTimeout(() => {
        drawMember();
        memberCanvas.style.transform = cardBack ? 'rotateY(0deg) scale(1)' : '';
        setTimeout(() => { memberCanvas.style.transition = ''; }, 220);
      }, 170);
    } else {
      drawMember();
    }
    Sound.pop();
  });
  randomNameBtn && randomNameBtn.addEventListener('click', () => {
    if (nameInput) nameInput.value = pick(NAMES);
    const roles = ['学习者', '创作者', '开发者', '探索者'];
    const r = pick(roles);
    if (roleChips) $$('.chip-btn', roleChips).forEach((b) => b.classList.toggle('is-on', b.dataset.role === r));
    drawMember();
    Sound.pop();
  });
  downloadCardBtn && downloadCardBtn.addEventListener('click', () => {
    if (!memberCanvas) return;
    memberCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const nm = ((nameInput && nameInput.value.trim()) || 'AG-member').replace(/[\\/:*?"<>|]/g, '');
      a.download = `AG-会员卡-${nm}.png`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      showToast('会员卡已下载 ✦ 欢迎加入');
      Sound.ok();
      confetti(60);
    }, 'image/png');
  });

  /* ================= 工作台贴纸 ================= */
  const STICKERS = [
    { e: '🐱', t: '猫猫总监' }, { e: '🕶️', t: '神秘感' },
    { e: '💻', t: '生产力' }, { e: '☕', t: '续命' },
    { e: '📷', t: '记录一下' }, { e: '🚀', t: '发射' },
    { e: '🤖', t: 'AI 队友' }, { e: '💡', t: '灵感' },
    { e: '✨', t: '灵光' }, { e: '🎧', t: 'BGM' }
  ];
  const deskPanel = $('#deskPanel');
  const deskItemsEl = $('#deskItems');
  const deskHint = $('#deskHint');
  const deskCount = $('#deskCount');
  const deskItems = [];
  let zTop = 10;
  let inertiaRAF = 0;

  function panelBox() {
    return { w: deskPanel.clientWidth, h: deskPanel.clientHeight };
  }
  function clampItem(it) {
    const { w, h } = panelBox();
    it.x = clamp(it.x, 8, Math.max(8, w - it.w - 8));
    it.y = clamp(it.y, 8, Math.max(8, h - it.h - 70));
  }
  function applyItem(it) {
    it.el.style.transform = `translate3d(${it.x}px, ${it.y}px, 0) rotate(${it.rot}deg)`;
  }
  function layoutDesk() {
    if (!deskPanel || !deskItems.length) return;
    const { w, h } = panelBox();
    const cols = clamp(Math.floor(w / 168), 2, 5);
    const rows = Math.ceil(deskItems.length / cols);
    const padTop = 46;
    const cw = w / cols;
    const ch = (h - 60 - padTop) / rows;
    const order = deskItems.slice().sort(() => Math.random() - 0.5);
    order.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      it.x = clamp(col * cw + rand(10, Math.max(14, cw - it.w - 10)), 8, Math.max(8, w - it.w - 8));
      it.y = clamp(row * ch + padTop + rand(6, Math.max(12, ch - it.h - 12)), padTop, Math.max(padTop, (h - 60) - it.h));
      it.vx = 0; it.vy = 0;
      it.rot = rand(-10, 10);
      applyItem(it);
    });
  }
  function startInertia() {
    if (inertiaRAF) return;
    inertiaRAF = requestAnimationFrame(function tick() {
      let alive = false;
      const { w, h } = panelBox();
      deskItems.forEach((it) => {
        if (it.dragging) { alive = true; return; }
        if (Math.abs(it.vx) < 0.06 && Math.abs(it.vy) < 0.06) return;
        alive = true;
        it.x += it.vx;
        it.y += it.vy;
        if (it.x < 8) { it.x = 8; it.vx = Math.abs(it.vx) * 0.55; }
        if (it.x > w - it.w - 8) { it.x = w - it.w - 8; it.vx = -Math.abs(it.vx) * 0.55; }
        if (it.y < 8) { it.y = 8; it.vy = Math.abs(it.vy) * 0.55; }
        if (it.y > h - it.h - 70) { it.y = h - it.h - 70; it.vy = -Math.abs(it.vy) * 0.55; }
        it.vx *= 0.94;
        it.vy *= 0.94;
        it.rot = lerp(it.rot, it.rot > 0 ? 2 : -2, 0.02) + it.vx * 0.25;
        applyItem(it);
      });
      if (alive) inertiaRAF = requestAnimationFrame(tick);
      else inertiaRAF = 0;
    });
  }

  if (deskPanel && deskItemsEl) {
    STICKERS.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'desk-item';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `贴纸：${s.t}，可拖动`);
      el.innerHTML = `<span class="emoji">${s.e}</span><span>${s.t}</span>`;
      el.style.zIndex = String(++zTop);
      deskItemsEl.appendChild(el);
      const it = { el, x: 0, y: 0, vx: 0, vy: 0, rot: 0, w: 0, h: 0, dragging: false, ox: 0, oy: 0, lx: 0, ly: 0, lt: 0, px: 0, py: 0 };
      deskItems.push(it);

      requestAnimationFrame(() => {
        it.w = el.offsetWidth;
        it.h = el.offsetHeight;
      });

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        it.dragging = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-drag');
        el.style.zIndex = String(++zTop);
        if (deskPanel) deskPanel.classList.add('touched');
        const r = deskPanel.getBoundingClientRect();
        it.ox = e.clientX - r.left - it.x;
        it.oy = e.clientY - r.top - it.y;
        it.px = e.clientX; it.py = e.clientY;
        it.lx = e.clientX; it.ly = e.clientY;
        it.lt = performance.now();
        it.vx = it.vy = 0;
        Sound.click();
        e.preventDefault();
      });
      el.addEventListener('pointermove', (e) => {
        if (!it.dragging) return;
        const r = deskPanel.getBoundingClientRect();
        const nx = e.clientX - r.left - it.ox;
        const ny = e.clientY - r.top - it.oy;
        const now = performance.now();
        const dt = Math.max(8, now - it.lt);
        it.vx = ((e.clientX - it.lx) / dt) * 17;
        it.vy = ((e.clientY - it.ly) / dt) * 17;
        it.x = clamp(nx, 8, Math.max(8, r.width - it.w - 8));
        it.y = clamp(ny, 8, Math.max(8, r.height - it.h - 70));
        it.rot = clamp(it.vx * 0.7, -14, 14);
        it.lx = e.clientX; it.ly = e.clientY; it.lt = now;
        applyItem(it);
      });
      const end = () => {
        if (!it.dragging) return;
        it.dragging = false;
        el.classList.remove('is-drag');
        if (Math.abs(it.vx) > 0.4 || Math.abs(it.vy) > 0.4) startInertia();
        else { it.vx = it.vy = 0; }
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
      el.addEventListener('dblclick', () => {
        it.rot += 15;
        applyItem(it);
        Sound.pop();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.rot += 15; applyItem(it); Sound.pop(); }
      });
    });

    if (deskCount) deskCount.textContent = `贴纸 ${deskItems.length} 张`;
    requestAnimationFrame(() => { layoutDesk(); });
    if (deskHint) {
      deskHint.addEventListener('click', () => { deskPanel.classList.add('touched'); });
    }
  }
  $('#shuffleBtn') && $('#shuffleBtn').addEventListener('click', () => {
    layoutDesk();
    Sound.pop();
    if (deskPanel) deskPanel.classList.add('touched');
  });
  $('#resetDeskBtn') && $('#resetDeskBtn').addEventListener('click', () => {
    layoutDesk();
    Sound.click();
    showToast('工作台复原了 ✦');
  });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      deskItems.forEach((it) => {
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
        clampItem(it);
        applyItem(it);
      });
    }, 250);
  });

  /* ================= 原版海报 ================= */
  function posterModal() {
    openModal(`
      <span class="modal-eyebrow">原版海报</span>
      <h3>AG · 用 AI，创造更多可能</h3>
      <p>这张是起点。你现在看的这个页面，是它的第二次生命——可以点、可以拖、可以生成属于自己的东西。</p>
      <div class="modal-poster"><img src="assets/poster.webp" alt="AG · OC 俱乐部原版海报" loading="lazy"></div>
    `);
  }
  $('#posterBtn') && $('#posterBtn').addEventListener('click', posterModal);
  $('#posterBtn2') && $('#posterBtn2').addEventListener('click', posterModal);

  /* ================= 彩蛋 ================= */
  (function eggs() {
    let buffer = '';
    let konami = [];
    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key.length === 1) {
        buffer = (buffer + e.key.toLowerCase()).slice(-4);
        if (buffer === 'ag') {
          buffer = '';
          Sound.ok();
          confetti(120);
          showToast('秘密口令正确 ✦ 用 AI，创造更多可能');
        }
      }
      konami.push(e.key);
      if (konami.length > KONAMI.length) konami.shift();
      if (konami.length === KONAMI.length && konami.every((k, i) => k === KONAMI[i])) {
        konami = [];
        Sound.ok();
        confetti(200);
        showToast('↑↑↓↓←→←→BA ✦ 你找到了 AG 的隐藏频道');
      }
    });
  })();

  /* ================= 首批渲染 ================= */
  window.addEventListener('load', () => {
    drawMember();
    drawArt(artState.seed || hashString('AG'), currentStyle(), IDEAS[0], 68);
    setArtTags(currentStyle(), 68);
    typewriter('把「用 AI 做一张校园乐队招募海报」做成一张霓虹海报：先定情绪，再定颜色，最后留一个让人想靠近的细节。');
    setTimeout(() => { revealAll(); }, 400);
  });
  // 即使 load 未触发也先画一次
  drawMember();
  drawArt(hashString('AG-poster'), 'poster', IDEAS[0], 68);
  setArtTags('poster', 68);

  if (modal) modal.addEventListener('transitionend', () => {
    if (!modal.classList.contains('open')) modalBody.innerHTML = '';
  });

})();
