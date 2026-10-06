/* Acceptance test 22 (§2.8.7): every text/background token pair used on glass is ≥ 4.5:1 (computed here, in both themes), plus keyboard operability. */
(function () {
  'use strict';

  function hex(s) { s = s.trim(); var m = /^#([0-9a-f]{6})$/i.exec(s); if (!m) { return null; } var n = parseInt(m[1], 16); return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
  function rgba(s) {
    var m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(s.trim());
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  }
  function color(s) { var c = hex(s) || rgba(s); if (!c) { throw new Error('cannot parse colour: ' + s); } return c; }
  function over(top, bottom) {                                            // composite `top` (with alpha) over an opaque `bottom`
    var a = top.a; return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
  }
  function lum(c) { function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); } return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b); }
  function ratio(fg, bg) { var a = lum(fg), b = lum(bg), hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); }
  function token(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }

  function check(mode) {
    document.body.setAttribute('data-mode', mode);
    var t = function (n) { return color(token(n)); };
    var base = t('--bg-1'), well = color(token('--well')), bg0 = t('--bg-0');
    // The lightest surfaces text can realistically sit on, mirroring the CSS: the mesh highlight at its PEAK under glass, strong glass (buttons, choices),
    // the inset hero "well", an opaque modal / toast / tooltip / form.
    var mesh = over(t('--mesh-a'), base), panel = over(t('--glass-bg'), mesh), strong = over(t('--glass-bg-strong'), mesh);
    var surfaces = { 'page (bg-1)': base, 'page (bg-0)': bg0, 'glass panel at mesh peak': panel, 'strong glass at mesh peak': strong, 'inset well in a panel': over(well, panel),
                     'modal / new-game form': color('rgba(18, 25, 43, 1)'), 'toast': color('rgba(20, 27, 45, 1)'), 'tooltip': color('#131b2f') };
    var fails = [], checked = 0;
    function test(label, fg, bg, min) { var r = ratio(fg, bg); checked++; if (r < (min || 4.5)) { fails.push(mode + ': ' + label + ' = ' + r.toFixed(2) + ':1'); } }

    ['--text-hi', '--text-md', '--text-lo'].forEach(function (tk) { Object.keys(surfaces).forEach(function (sk) { test(tk + ' on ' + sk, t(tk), surfaces[sk]); }); });
    var tints = ['--pos', '--neg', '--passive', '--warn', '--accent', '--health', '--npc', '--asset', '--premium', '--gold', '--cat-deal', '--cat-doodad', '--cat-life', '--cat-market', '--cat-quiet'];
    tints.forEach(function (tk) {
      var fg = t(tk);
      Object.keys(surfaces).forEach(function (sk) { test(tk + ' on ' + sk, fg, surfaces[sk]); });
      var chipBg = over({ r: fg.r, g: fg.g, b: fg.b, a: 0.10 }, panel);                      // chips tint their own colour at 8% in CSS; tested at 10% for margin
      test(tk + ' chip text on its own tint', fg, chipBg);
    });
    test('accent-ink on solid accent (primary button)', t('--accent-ink'), t('--accent'));
    ['--pos', '--neg', '--warn', '--gold', '--passive'].forEach(function (tk) { test('accent-ink on solid ' + tk + ' (toast count badge)', t('--accent-ink'), t(tk)); });
    test('neg text on danger button tint', t('--neg'), over({ r: 251, g: 113, b: 133, a: 0.10 }, panel));
    test('text-hi on active choice', t('--text-hi'), over({ r: 124, g: 156, b: 255, a: 0.12 }, panel));
    test('text-hi on sticky hero block fade', t('--text-hi'), over(color('rgba(14, 20, 36, 0.94)'), panel));
    test('text-md on note', t('--text-md'), over({ r: 124, g: 156, b: 255, a: 0.08 }, panel));
    test('passive text on the passive-income row tint', t('--passive'), over({ r: 34, g: 211, b: 238, a: 0.10 }, panel));
    return { checked: checked, fails: fails };
  }

  T.test('22', 'A11y: every text/background pair on glass ≥ 4.5:1 in both themes · modals, toasts, Contacts drawer and Life tab are keyboard-operable', function () {
    var saved = document.body.getAttribute('data-mode'), rr, ft;
    try { rr = check('RAT_RACE'); ft = check('FAST_TRACK'); } finally { document.body.setAttribute('data-mode', saved || 'RAT_RACE'); }
    T.ok(rr.checked >= 60 && ft.checked >= 60, 'enough pairs were checked: ' + rr.checked + ' + ' + ft.checked);
    var all = rr.fails.concat(ft.fails); T.ok(all.length === 0, 'contrast failures (' + all.length + '): ' + all.join(' | '));
    // keyboard operability (behaviour is exercised in tests 17, 18, A7): every interactive element is a real, focusable control with an accessible name
    RR.dev.load('starter'); RR.ui.panels.contacts.open();
    var bad = [];
    Array.prototype.forEach.call(document.querySelectorAll('#app button, #app [role="tab"], #app input, #app select'), function (el) {
      if (el.closest('template') || el.closest('[hidden]')) { return; }
      var name = (el.getAttribute('aria-label') || el.textContent || el.title || (el.labels && el.labels.length && el.labels[0].textContent) || '').trim();
      if (!name) { bad.push((el.id || el.className || el.tagName) + ' has no accessible name'); }
      if (el.tabIndex < -1 || (el.tagName !== 'BUTTON' && el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && !el.hasAttribute('role'))) { bad.push((el.id || el.tagName) + ' is not a native control'); }
    });
    RR.ui.panels.contacts.close();
    T.deepEq(bad, [], 'controls without names');
    T.eq(document.querySelectorAll('#app [onclick], #app [onkeydown], #app [onmousedown]').length, 0, 'no inline handlers (CSP)');
    var tablist = document.querySelector('[role="tablist"]'); T.ok(tablist && tablist.getAttribute('aria-label')); T.eq(tablist.querySelectorAll('[role="tab"]').length, 4);
    T.ok(document.querySelector('#hud[role="region"], header#hud'), 'HUD is a labelled landmark'); T.ok(document.querySelectorAll('[role="meter"]').length >= 2);
    Array.prototype.forEach.call(document.querySelectorAll('[role="meter"]'), function (m) { T.ok(m.hasAttribute('aria-valuenow') && m.hasAttribute('aria-valuemin') && m.hasAttribute('aria-valuemax') && m.getAttribute('aria-label'), 'meter semantics'); });
    T.eq(document.getElementById('announcer').getAttribute('aria-live'), 'polite'); T.eq(document.getElementById('toast-root').getAttribute('aria-live'), 'polite');
    T.eq(document.documentElement.getAttribute('lang'), 'en');
  });

  T.test('A8', 'R11: every ledger total is a polite live region (and tweening never leaves it silenced)', async function () {
    RR.store.replace(RR.dev.fixture('starter'), 'test'); RR.ui.screens.hide();
    var paths = ['derived.income.total', 'derived.expenses.total', 'derived.monthlyCashflow', 'derived.assets.total', 'derived.liabilities.total', 'derived.netWorth', 'player.financials.cash'];
    paths.forEach(function (p) {
      var els = RR.ui.binder.nodesFor(p);
      T.ok(els.length >= 1, p + ' is bound');
      var live = els.filter(function (el) { return el.getAttribute('aria-live') === 'polite' && el.getAttribute('aria-atomic') === 'true'; });
      T.ok(live.length >= 1, p + ' has a polite, atomic live region (the ledger total itself; echoes in the HUD label may be silent)');
    });
    RR.settings.set('animations', true); RR.settings.setReducedMotionOverride(false);
    RR.store.commit('t.live', function (s) { s.player.financials.cash += 700; });
    await T.sleep(RR.config.ui.fx.tweenMs + 250);
    var hud = document.querySelector('#hud [data-bind="player.financials.cash"]');
    T.eq(hud.getAttribute('aria-live'), 'polite', 'HUD cash live region restored after the tween'); T.eq(hud.textContent, '$3,700');
    RR.settings.setReducedMotionOverride(null);
  });
})();
