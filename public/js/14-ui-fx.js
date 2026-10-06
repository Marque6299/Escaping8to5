/* RAT RACE · 14-ui-fx.js · RR.ui.fx — cosmetic motion (F.6). Math.random is allowed here: FX never touch game state or RR.rng (R5).
   Two switches: `animations` (tween, flash, meters, toasts, modals) and `reducedFx` (coin burst, shake, confetti).
   prefers-reduced-motion forces animations=false and reducedFx=true (RR.settings.get already folds that in).
   With motion off, changes are instant and a brief outline highlight replaces the flash. */
(function (RR) {
  'use strict';

  var fx = RR.ui.fx = {};
  var live = 0;                                     // particles currently on screen (tests read this)
  var MAX_PARTICLES = 80;

  fx.animationsOn = function () { return !!(RR.settings && RR.settings.get('animations')); };
  fx.particlesOn = function () { return fx.animationsOn() && !(RR.settings && RR.settings.get('reducedFx')); };
  fx.liveParticles = function () { return live; };

  function raf(fn) { return window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(function () { fn(Date.now()); }, 16); }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }

  // ── number tween ────────────────────────────────────────────────────────────────────────
  fx.cancelTween = function (el) {
    var t = el.__rrTween;
    if (!t) { return; }
    t.cancelled = true;
    clearTimeout(t.guard);
    if (t.liveAttr !== null) { el.setAttribute('aria-live', t.liveAttr); }
    el.__rrTween = null;
  };

  // tweenNumber(el, from, to, ms, fmtName?) — the final text is always exactly format(to).
  fx.tweenNumber = function (el, from, to, ms, fmtName) {
    fx.cancelTween(el);
    var fmt = fmtName || el.getAttribute('data-fmt') || 'int';
    var format = function (v) { return RR.ui.binder.format(fmt, v); };
    if (!fx.animationsOn() || from === to || !(ms > 0) || !isFinite(from) || !isFinite(to)) { el.textContent = format(to); return; }

    var t = { cancelled: false, guard: null, liveAttr: el.hasAttribute('aria-live') ? el.getAttribute('aria-live') : null };
    el.__rrTween = t;
    if (t.liveAttr !== null) { el.setAttribute('aria-live', 'off'); }       // don't let a screen reader read every frame
    var start = now();

    function finish() {
      if (t.cancelled) { return; }
      clearTimeout(t.guard);
      el.__rrTween = null;
      if (t.liveAttr !== null) { el.setAttribute('aria-live', t.liveAttr); }  // restore the live region, then change the text once → one announcement
      el.textContent = format(to);
    }
    function step() {
      if (t.cancelled) { return; }
      var p = Math.min(1, (now() - start) / ms);
      if (p >= 1) { finish(); return; }
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(from + (to - from) * eased);
      raf(step);
    }
    t.guard = setTimeout(finish, ms + 120);                                    // background tabs throttle rAF — never leave a stale number
    raf(step);
  };

  // ── delta flash ─────────────────────────────────────────────────────────────────────────
  fx.flashDelta = function (el, delta) {
    if (!delta || !isFinite(delta)) { return; }
    var pos = delta > 0, ms = RR.config.ui.fx.flashMs;
    ['flash-pos', 'flash-neg', 'hl-pos', 'hl-neg'].forEach(function (c) { el.classList.remove(c); });
    clearTimeout(el.__rrFlash);
    if (fx.animationsOn()) {
      void el.offsetWidth;                                                      // restart the CSS animation
      el.classList.add(pos ? 'flash-pos' : 'flash-neg');
    } else {
      el.classList.add(pos ? 'hl-pos' : 'hl-neg');                              // reduced motion: a still outline instead of motion (F.6)
    }
    el.__rrFlash = setTimeout(function () { ['flash-pos', 'flash-neg', 'hl-pos', 'hl-neg'].forEach(function (c) { el.classList.remove(c); }); }, ms);
  };

  // ── particles ───────────────────────────────────────────────────────────────────────────
  function fxRoot() { return document.getElementById('fx-root'); }
  function center(el) {
    var r = RR.ui.stage.toStage(el.getBoundingClientRect());
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function spawn(cls, x, y, vars, ms, color) {
    var root = fxRoot();
    if (!root || live >= MAX_PARTICLES) { return null; }
    var p = document.createElement('span');
    p.className = cls;
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.style.setProperty('--dx', vars.dx + 'px'); p.style.setProperty('--dy', vars.dy + 'px'); p.style.setProperty('--rot', vars.rot + 'deg');
    if (color) { p.style.background = color; }
    root.appendChild(p); live++;
    setTimeout(function () { if (p.parentNode) { p.parentNode.removeChild(p); } live = Math.max(0, live - 1); }, ms + 80);
    return p;
  }

  // coinBurst(el) — cosmetic; the caller decides when (cash gain ≥ config.ui.fx.coinBurstMin).
  fx.coinBurst = function (el) {
    if (!el || !fx.particlesOn()) { return 0; }
    var c = center(el), n = 10, made = 0;
    for (var i = 0; i < n; i++) {
      var ang = (-Math.PI / 2) + (Math.random() - 0.5) * 2.2, dist = 70 + Math.random() * 90;
      if (spawn('fx-coin', c.x, c.y, { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist + 40, rot: Math.round((Math.random() - 0.5) * 360) }, 760)) { made++; }
    }
    return made;
  };

  fx.shake = function (el) {
    if (!el || !fx.particlesOn()) { return false; }
    el.classList.remove('is-shaking'); void el.offsetWidth; el.classList.add('is-shaking');
    setTimeout(function () { el.classList.remove('is-shaking'); }, RR.config.ui.fx.shakeMs + 40);
    return true;
  };

  fx.confetti = function (opts) {
    if (!fx.particlesOn()) { return 0; }
    var colors = ['#34d399', '#22d3ee', '#fbbf24', '#7c9cff', '#e879f9', '#fb7185'], n = (opts && opts.count) || 48, made = 0;
    var x0 = (opts && opts.x) || RR.config.stage.w / 2, y0 = (opts && opts.y) || 220;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 420;
      if (spawn('fx-confetti', x0, y0, { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist * 0.6 + 260, rot: Math.round((Math.random() - 0.5) * 900) },
                RR.config.ui.fx.confettiMs, colors[i % colors.length])) { made++; }
    }
    return made;
  };
})(window.RR);
