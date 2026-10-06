/* RAT RACE · 12-ui-stage.js · RR.ui.stage — a fixed 1920×1080 design canvas, uniformly scaled to fit, letterboxed and centred (§1.3).
   Everything is authored in px on that canvas. Below config.ui.stage.minWidth px of viewport width a "please enlarge/rotate" notice is shown.
   computeLayout() is pure, so the 16:9 rule can be tested for any viewport without resizing a window. */
(function (RR) {
  'use strict';

  var stage = RR.ui.stage = {};
  var els = { viewport: null, stage: null, notice: null };
  var current = { scale: 1, left: 0, top: 0, width: 1920, height: 1080, small: false };
  var inited = false;

  // computeLayout(vw, vh) → { scale, width, height, left, top, small }
  stage.computeLayout = function (vw, vh) {
    var W = RR.config.stage.w, H = RR.config.stage.h;
    vw = Math.max(1, vw); vh = Math.max(1, vh);
    var scale = Math.min(vw / W, vh / H);
    var width = W * scale, height = H * scale;
    return { scale: scale, width: width, height: height, left: (vw - width) / 2, top: (vh - height) / 2, small: vw < RR.config.ui.stage.minWidth };
  };

  // apply(stageEl, vw, vh) — writes the layout onto an element (used by init and by tests on a detached element).
  stage.apply = function (el, vw, vh) {
    var L = stage.computeLayout(vw, vh);
    el.style.width = RR.config.stage.w + 'px';
    el.style.height = RR.config.stage.h + 'px';
    el.style.transformOrigin = '0 0';
    el.style.transform = 'scale(' + L.scale + ')';
    el.style.left = L.left + 'px';
    el.style.top = L.top + 'px';
    return L;
  };

  stage.layout = function () {
    if (!els.stage) { return current; }
    current = stage.apply(els.stage, window.innerWidth, window.innerHeight);
    document.documentElement.style.setProperty('--scale', String(current.scale));
    if (els.notice) {
      els.notice.hidden = !current.small;
      if (els.viewport) { if (current.small) { els.viewport.setAttribute('inert', ''); } else { els.viewport.removeAttribute('inert'); } }
    }
    return current;
  };

  stage.scale = function () { return current.scale; };
  stage.current = function () { return current; };
  stage.element = function () { return els.stage; };

  // Convert a viewport-space DOMRect into stage (1920×1080) coordinates — used to position tooltips and FX.
  stage.toStage = function (rect) {
    if (!els.stage) { return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }; }
    var origin = els.stage.getBoundingClientRect(), s = current.scale || 1;
    return { left: (rect.left - origin.left) / s, top: (rect.top - origin.top) / s, width: rect.width / s, height: rect.height / s };
  };

  stage.init = function () {
    els.viewport = document.getElementById('viewport');
    els.stage = document.getElementById('stage');
    els.notice = document.getElementById('small-notice');
    if (!els.stage) { throw new Error('RR.ui.stage.init: #stage not found'); }
    stage.layout();
    if (!inited) {
      inited = true;
      var raf = null;
      var onResize = function () {
        if (raf) { return; }
        raf = window.requestAnimationFrame ? window.requestAnimationFrame(function () { raf = null; stage.layout(); }) : (stage.layout(), null);
      };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
    }
    return current;
  };
})(window.RR);
