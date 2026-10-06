/* Acceptance tests 8, 9, 10 (§2.7), 17, 18, 19, 20 (§2.8.7) + actions / receipts / panels / glossary / fx supporting tests. */
(function () {
  'use strict';
  var U = RR.util, O = RR.ui.overlays, dom = RR.ui.dom;

  function loadStarter() { RR.dev.load('starter'); return RR.store.get(); }
  function noMotion(on) { RR.settings.setReducedMotionOverride(on ? true : null); }
  function key(el, k, extra) { var ev = new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})); el.dispatchEvent(ev); return ev; }
  function cleanup() { O._reset(); noMotion(false); }

  // ── 8 · binder ───────────────────────────────────────────────────────────────────────────────────────────────────
  T.test('8', 'Binder: a commit updates every data-bind="player.financials.cash" node without re-rendering list containers', async function () {
    loadStarter();
    RR.settings.setReducedMotionOverride(false); RR.settings.set('animations', false);
    try {
      var nodes = RR.ui.binder.nodesFor('player.financials.cash');
      T.ok(nodes.length >= 2, 'cash is bound in the HUD and the balance sheet (found ' + nodes.length + ')');
      var host = document.querySelector('[data-list="liabilities"]'), rows = host.querySelectorAll('[data-key]');
      T.eq(rows.length, 4, 'four liability rows'); var first = rows[0], last = rows[3];
      T.eq(RR.store.commit('t.cash', function (s) { s.player.financials.cash += 500; }).ok, true);
      nodes.forEach(function (n) { T.eq(n.textContent, '$3,500', 'node text'); T.eq(n.getAttribute('data-value'), '3500'); });
      T.eq(host.querySelectorAll('[data-key]').length, 4); T.ok(host.querySelectorAll('[data-key]')[0] === first && host.querySelectorAll('[data-key]')[3] === last, 'row elements were reused, not rebuilt');
      T.eq(document.querySelector('[data-bind="derived.assets.total"]').textContent, '$111,500', 'derived values follow');

      // a new keyed row is added without touching the others
      RR.store.commit('t.stock', function (s) { s.inventory.stocks.push({ id: 'st_t1', symbol: 'UTLX', shares: 10, avgCost: 48, openedTurn: 0 }); });
      var stocks = document.querySelector('[data-list="stocks"]');
      T.eq(stocks.querySelectorAll('[data-key]').length, 1); T.eq(stocks.querySelector('.lbl').textContent, 'UTLX \u00d7 10'); T.eq(stocks.querySelector('.val').textContent, '$480');
      T.eq(stocks.querySelector('.list-empty').hidden, true, 'empty placeholder hides');
      RR.store.commit('t.stock2', function (s) { s.inventory.stocks.length = 0; });
      T.eq(stocks.querySelectorAll('[data-key]').length, 0); T.eq(stocks.querySelector('.list-empty').hidden, false);

      // tween: with animations on the number animates but always lands on the exact formatted value, then settles
      RR.settings.set('animations', true);
      RR.store.commit('t.cash2', function (s) { s.player.financials.cash += 1000; });
      await T.sleep(RR.config.ui.fx.tweenMs + 250);
      nodes.forEach(function (n) { T.eq(n.textContent, '$4,500', 'tween ends on the exact value'); });
      T.eq(nodes[0].getAttribute('aria-live') === 'off', false, 'live region is restored after a tween');
    } finally { RR.settings.set('animations', true); noMotion(false); }
  });

  T.test('8b', 'Binder grammar: tone classes, width-pct, show-if / hide-if, unknown list names', function () {
    loadStarter(); RR.settings.setReducedMotionOverride(true);              // no tweening: text is final immediately
    try { grammar(); } finally { noMotion(false); }
  });
  function grammar() {
    var cf = document.getElementById('hero-cashflow');
    T.ok(cf.classList.contains('is-pos'), 'positive cash flow gets is-pos');
    RR.store.commit('t.neg', function (s) { s.player.financials.salary = 0; });
    T.ok(cf.classList.contains('is-neg') && !cf.classList.contains('is-pos'), 'negative cash flow gets is-neg'); T.ok(cf.textContent.charAt(0) === '\u2212', 'uses a real minus sign');
    RR.store.commit('t.rest', function (s) { s.player.financials.salary = 3500; });
    var fill = document.querySelector('[data-width-pct="player.health.value"]'); T.eq(fill.style.width, '80%');
    RR.store.commit('t.h', function (s) { s.player.health.value = 33; }); T.eq(fill.style.width, '33%');
    var rr = document.querySelector('.mode-badge--rr'), ft = document.querySelector('.mode-badge--ft');
    T.eq(rr.hidden, false); T.eq(ft.hidden, true);
    RR.store.commit('t.mode', function (s) { s.loop.mode = 'FAST_TRACK'; });
    T.eq(rr.hidden, true); T.eq(ft.hidden, false); T.eq(document.body.getAttribute('data-mode'), 'FAST_TRACK', 'body[data-mode] swaps the theme');
    RR.store.commit('t.mode2', function (s) { s.loop.mode = 'RAT_RACE'; }); T.eq(document.body.getAttribute('data-mode'), 'RAT_RACE');
    var meter = document.getElementById('freedom-meter'); T.eq(meter.getAttribute('role'), 'meter'); T.eq(meter.getAttribute('aria-valuenow'), '0');
    var rows = document.querySelectorAll('.row'); var dim = 0; Array.prototype.forEach.call(rows, function (r) { if (r.classList.contains('is-dim')) { dim++; } });
    T.ok(dim >= 6, 'zero-valued conditional rows are dimmed, not hidden (' + dim + ')');
  }

  // ── 9 · stage ────────────────────────────────────────────────────────────────────────────────────────────────────
  T.test('9', 'Stage keeps 16:9 at 1280×720, 1920×1080, 2560×1080, 1000×1000 (letterboxed, centred); small-viewport notice below 900 px', function () {
    [[1280, 720], [1920, 1080], [2560, 1080], [1000, 1000], [901, 400]].forEach(function (vp) {
      var L = RR.ui.stage.computeLayout(vp[0], vp[1]), tag = vp.join('×');
      T.near(L.width / L.height, 16 / 9, 1e-9, tag + ' aspect'); T.ok(L.width <= vp[0] + 1e-6 && L.height <= vp[1] + 1e-6, tag + ' fits');
      T.near(L.left * 2 + L.width, vp[0], 1e-6, tag + ' centred horizontally'); T.near(L.top * 2 + L.height, vp[1], 1e-6, tag + ' centred vertically');
      T.ok(Math.abs(L.width - vp[0]) < 1e-6 || Math.abs(L.height - vp[1]) < 1e-6, tag + ' touches at least one edge');
      var el = document.createElement('div'); RR.ui.stage.apply(el, vp[0], vp[1]);
      T.eq(el.style.width, '1920px'); T.eq(el.style.height, '1080px'); T.near(parseFloat(/scale\(([\d.]+)\)/.exec(el.style.transform)[1]), L.scale, 1e-5, 'transform scale');
    });
    T.eq(RR.ui.stage.computeLayout(1000, 1000).scale, 1000 / 1920, 'portrait-ish window letterboxes top/bottom');
    T.eq(RR.ui.stage.computeLayout(899, 700).small, true); T.eq(RR.ui.stage.computeLayout(900, 700).small, false);
    var p = RR.ui.stage.toStage({ left: 100, top: 100, width: 50, height: 20 }); T.ok(typeof p.left === 'number' && isFinite(p.left));
  });

  // ── 10 · boot over the real index.html (embedded; reports via postMessage, so it also works on file://) ─────────────
  T.test('10', 'index.html boots with zero errors and shows the Title screen (also verified headlessly by tools/run-headless.mjs)', async function () {
    var frame = document.getElementById('boot-frame'), result = null;
    function onMsg(e) { if (e.data && e.data.rr === 'booted') { result = e.data; } }
    window.addEventListener('message', onMsg);
    try {
      frame.hidden = false; frame.src = '../public/index.html?rrtest=1';
      await T.waitFor(function () { return result; }, 8000, 'index.html boot message');
      T.eq(result.ok, true, 'booted'); T.deepEq(result.errors, [], 'no uncaught errors or failed loads'); T.eq(result.titleVisible, true, 'Title screen is shown');
    } finally { window.removeEventListener('message', onMsg); frame.src = 'about:blank'; frame.hidden = true; }
  });

  // ── 17 · toasts ──────────────────────────────────────────────────────────────────────────────────────────────────
  T.test('17', 'Toasts: ≤4 visible + queue · ×N dedupe by key · neg=role alert · reduced motion ⇒ no animation classes · Esc dismisses', async function () {
    var Tt = O.toast; cleanup();
    RR.settings.setReducedMotionOverride(false); RR.settings.set('animations', true); RR.settings.set('toasts', true);
    try {
      for (var i = 0; i < 6; i++) { Tt.show('msg ' + i, { tone: 'info', durationMs: 60000 }); }
      var st = Tt.state(); T.eq(st.visible.length, 4); T.eq(st.queued.length, 2);
      var live = document.querySelectorAll('#toast-root .toast:not(.is-anim-out)'); T.eq(live.length, 4, 'DOM matches');
      T.ok(live[0].textContent.indexOf('msg 3') >= 0, 'newest on top'); T.eq(st.visible[0].msg, 'msg 3');
      Tt.dismiss(st.visible[0].id); st = Tt.state(); T.eq(st.visible.length, 4, 'a queued toast takes the freed slot'); T.eq(st.queued.length, 1);
      Tt.clear(); T.eq(Tt.state().visible.length + Tt.state().queued.length, 0);

      var a = Tt.show('Same', { key: 'k1', durationMs: 60000 }), b = Tt.show('Same', { key: 'k1', durationMs: 60000 }), c = Tt.show('Same', { key: 'k1', durationMs: 60000 });
      T.eq(a, b); T.eq(b, c); st = Tt.state(); T.eq(st.visible.length, 1, 'collapsed into one'); T.eq(st.visible[0].count, 3);
      T.eq(document.querySelector('#toast-root .toast__count').textContent, '\u00d73'); Tt.clear();

      Tt.show('Bad news', { tone: 'neg', durationMs: 60000 }); Tt.show('FYI', { tone: 'info', durationMs: 60000 });
      T.eq(document.querySelector('#toast-root .toast--neg').getAttribute('role'), 'alert', 'neg uses role=alert'); T.eq(document.querySelector('#toast-root .toast--info').getAttribute('role'), null);
      T.ok(document.querySelector('#toast-root .toast--neg .sr-only').textContent.length > 0, 'tone has a text cue for screen readers');
      T.ok(document.querySelector('#toast-root .toast--neg svg.ic'), 'tone has an icon (never colour alone)'); Tt.clear();

      noMotion(true); Tt.show('calm', { durationMs: 60000 });
      T.ok(!/anim/.test(document.querySelector('#toast-root .toast').className), 'reduced motion ⇒ no animation classes: ' + document.querySelector('#toast-root .toast').className); Tt.clear();
      noMotion(false); Tt.show('lively', { durationMs: 60000 }); T.ok(/is-anim-in/.test(document.querySelector('#toast-root .toast').className), 'animations on ⇒ slide-in class'); Tt.clear();

      noMotion(true); Tt.show('escape me', { durationMs: 60000 });
      var btn = document.querySelector('#toast-root .toast__x'); btn.focus(); T.ok(document.activeElement === btn);
      var ev = key(btn, 'Escape'); T.eq(Tt.state().visible.length, 0, 'Esc dismisses the focused toast'); T.ok(ev.defaultPrevented);

      Tt.show('short lived', { durationMs: 80 }); await T.sleep(260); T.eq(Tt.state().visible.length, 0, 'auto-dismisses after durationMs');
      var clicked = 0, id = Tt.show('Undo?', { sticky: true, action: { label: 'Undo', onClick: function () { clicked++; } } });
      await T.sleep(100); T.eq(Tt.state().visible.length, 1, 'sticky stays'); document.querySelector('#toast-root .toast__action button').click();
      T.eq(clicked, 1); T.eq(Tt.state().visible.length, 0, 'using the action dismisses it');

      RR.settings.set('toasts', false);
      T.eq(Tt.show('quiet info'), null, 'toasts off ⇒ info suppressed'); T.ok(Tt.show('still shown', { tone: 'warn', durationMs: 60000 }), 'warnings always show'); T.ok(Tt.show('also shown', { tone: 'neg', durationMs: 60000 }));
      T.eq(Tt.show('', {}), null, 'empty message ignored');
      Tt.clear(); Tt.show('A\u0000B\u202Etext', { tone: 'warn', durationMs: 60000 }); T.eq(document.querySelector('#toast-root .toast__msg').textContent, 'Warning: ABtext', 'control characters are stripped, not rendered');
    } finally { RR.settings.set('toasts', true); RR.settings.set('animations', true); cleanup(); }
  });

  // ── 18 · modals ──────────────────────────────────────────────────────────────────────────────────────────────────
  T.test('18', 'Modals: 3 shown + 1 queued · focus trapped & restored · Esc ignored when not dismissible · resolves with action id · <img onerror> is text', async function () {
    var M = O.modal; loadStarter(); cleanup(); noMotion(true);
    var opener = document.createElement('button'); opener.id = 't-opener'; opener.textContent = 'opener'; document.getElementById('app').appendChild(opener);
    try {
      var ps = ['m1', 'm2', 'm3', 'm4'].map(function (id) { return M.open({ id: id, title: id, body: 'body ' + id, actions: [{ id: 'ok', label: 'OK', primary: true }] }); });
      var st = M.state(); T.deepEq(st.open, ['m1', 'm2', 'm3']); T.deepEq(st.queued, ['m4']);
      T.ok(M.open({ id: 'm2', title: 'again' }) === ps[1], 'the same id returns the same dialog');
      T.ok(M.element('m1').closest('.modal-layer').hasAttribute('inert') && M.element('m2').closest('.modal-layer').hasAttribute('inert'), 'lower modals are inert');
      T.ok(!M.element('m3').closest('.modal-layer').hasAttribute('inert'), 'top modal is live');
      M.close('m3', 'ok'); T.eq(await ps[2], 'ok'); st = M.state(); T.deepEq(st.open, ['m1', 'm2', 'm4']); T.deepEq(st.queued, []);
      M.closeAll(); T.eq(await ps[0], 'dismissed'); T.eq(await ps[3], 'dismissed'); T.eq(M.state().open.length, 0);

      opener.focus();
      var p = M.open({ id: 'ft', title: 'Focus', body: 'Body text', icon: 'ic_info', actions: [{ id: 'a', label: 'A', tone: 'ghost' }, { id: 'b', label: 'B', primary: true }] });
      var modal = M.element('ft');
      T.eq(modal.getAttribute('role'), 'dialog'); T.eq(modal.getAttribute('aria-modal'), 'true'); T.ok(document.getElementById(modal.getAttribute('aria-labelledby')).textContent === 'Focus', 'labelled by its title');
      T.ok(modal.contains(document.activeElement) && document.activeElement.textContent === 'B', 'primary action receives focus');
      T.ok(document.getElementById('app').hasAttribute('inert') && document.getElementById('screens').hasAttribute('inert'), 'background is inert while a modal is open');
      var f = dom.focusable(modal), first = f[0], last = f[f.length - 1];
      last.focus(); var ev = key(last, 'Tab'); T.ok(document.activeElement === first && ev.defaultPrevented, 'Tab from the last control wraps to the first');
      first.focus(); key(first, 'Tab', { shiftKey: true }); T.ok(document.activeElement === last, 'Shift+Tab from the first wraps to the last');
      modal.querySelector('[data-modal-action="a"]').click();
      T.eq(await p, 'a', 'resolves with the clicked action id'); T.ok(document.activeElement === opener, 'focus returns to the opener'); T.ok(!document.getElementById('app').hasAttribute('inert'));

      var nd = M.open({ id: 'nd', title: 'Must choose', body: 'x', dismissible: false });
      key(document, 'Escape'); T.ok(M.isOpen('nd'), 'Esc is ignored when dismissible:false'); T.eq(M.element('nd').querySelectorAll('[aria-label="Close dialog"]').length, 0, 'no X button either');
      M.element('nd').querySelector('[data-modal-action="ok"]').click(); T.eq(await nd, 'ok');
      var dis = M.open({ id: 'dis', title: 'Optional', body: 'x' }); key(document, 'Escape'); T.eq(await dis, 'dismissed'); T.ok(!M.isOpen('dis'));
      var bd = M.open({ id: 'bd', title: 'Backdrop', body: 'x' }); M.element('bd').parentNode.querySelector('.modal-layer__scrim').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); T.eq(await bd, 'dismissed', 'backdrop click closes a dismissible modal');

      window.__pwn = undefined;
      M.open({ id: 'xss', title: '<b>bold</b>', body: '<img src=x onerror="window.__pwn=1">\n\nsecond <script>window.__pwn=2</script>' });
      var xm = M.element('xss'); T.eq(xm.querySelectorAll('img, script, b').length, 0, 'no elements were created from strings');
      T.ok(xm.textContent.indexOf('<img src=x') >= 0 && xm.textContent.indexOf('<b>bold</b>') >= 0, 'markup is shown as text'); T.eq(xm.querySelectorAll('p').length, 2, 'blank line splits paragraphs');
      await T.sleep(60); T.eq(window.__pwn, undefined, 'nothing executed'); M.close('xss');

      var yes = M.confirm({ title: 'Sure?', body: 'Really?' }); M.element('confirm').querySelector('[data-modal-action="confirm"]').click(); T.eq(await yes, true);
      var no = M.confirm({ title: 'Sure?', body: 'Really?', tone: 'danger' }); var cm = M.element('confirm');
      T.eq(cm.getAttribute('role'), 'alertdialog'); T.eq(document.activeElement.textContent, 'Cancel', 'alertdialogs focus the safe action');
      cm.querySelector('[data-modal-action="confirm"]').click(); T.eq(await no, true);
      var opened = 0, closed = 0, o1 = RR.bus.on('ui:modal:opened', function () { opened++; }), o2 = RR.bus.on('ui:modal:closed', function () { closed++; });
      M.open({ id: 'ev', title: 'e' }); M.close('ev'); o1(); o2(); T.eq(opened, 1); T.eq(closed, 1);
    } finally { if (opener.parentNode) { opener.parentNode.removeChild(opener); } cleanup(); }
  });

  // ── 19 · avatars & scenes ────────────────────────────────────────────────────────────────────────────────────────
  var SCENES = ['scene_office', 'scene_hospital', 'scene_home_interior', 'scene_street_house', 'scene_storm_house', 'scene_bank_lobby', 'scene_market_floor', 'scene_cafe', 'scene_wedding',
                'scene_garage', 'scene_apartment_block', 'scene_news_desk'];
  T.test('19', 'Avatars: same seed ⇒ byte-identical SVG · 1,000 seeds ⇒ ≥950 distinct · all 12 Tier-A scenes render at 480×270 and 1920×1080', function () {
    var a = RR.ui.avatar.render(4242, { role: 'BANKER', size: 64, name: 'Sam' }).outerHTML, b = RR.ui.avatar.render(4242, { role: 'BANKER', size: 64, name: 'Sam' }).outerHTML;
    T.eq(a, b, 'byte-identical'); T.ok(a.indexOf('role="img"') > 0 && a.indexOf('Portrait of Sam, banker') > 0, 'accessible name');
    T.ok(RR.ui.avatar.render(4242, { role: 'BANKER', decorative: true }).getAttribute('aria-hidden') === 'true');
    var seen = {}, n = 0;
    for (var s = 1; s <= 1000; s++) { var h = RR.ui.avatar.render(s, { role: 'FRIEND', size: 64 }).outerHTML; if (!seen[h]) { seen[h] = true; n++; } }
    T.ok(n >= 950, 'distinct avatars among 1,000 seeds: ' + n);
    ['FAMILY', 'BOSS', 'FRIEND', 'BANKER', 'AGENT', 'MENTOR', 'HANDYMAN', 'TENANT', 'ADVISOR', 'PLAYER'].forEach(function (role) { var el = RR.ui.avatar.render(7, { role: role }); T.eq(el.getAttribute('viewBox'), '0 0 64 64', role); T.ok(el.childNodes.length > 10, role + ' draws layers'); });
    var skins = {}, hairs = {}, outfits = {}, accs = {}; for (var q = 1; q <= 600; q++) { var l = RR.ui.avatar.resolve(q, 'FRIEND'); skins[l.skin] = hairs[l.hairStyle] = outfits[l.outfit] = accs[l.accessory] = 1; }
    T.eq(Object.keys(skins).length, 6); T.ok(Object.keys(outfits).length >= 9); T.ok(Object.keys(accs).length >= 5);

    T.deepEq(RR.data.sceneIds.slice().sort(), SCENES.slice().sort(), 'exactly the 12 Tier-A scenes');
    SCENES.forEach(function (id) {
      [[480, 270], [1920, 1080]].forEach(function (sz) {
        var el = RR.ui.scene.render(id, { width: sz[0], height: sz[1], category: 'DEAL' });
        T.eq(el.getAttribute('viewBox'), '0 0 480 270', id); T.eq(el.getAttribute('width'), String(sz[0])); T.eq(el.getAttribute('height'), String(sz[1])); T.ok(el.childNodes.length >= 5, id + ' draws shapes');
      });
      T.ok(JSON.stringify(RR.data.scenes[id]).length <= 6 * 1024, id + ' within the 6 KB budget'); T.ok(RR.data.scenes[id].alt.length > 8, id + ' has an accessible description');
      T.eq(RR.ui.scene.render(id, { decorative: false }).getAttribute('role'), 'img');
    });
    var spy = T.spyWarn(); try { T.ok(RR.ui.scene.render('scene_nope')); T.eq(spy.count(), 1, 'unknown scene: one warning, plain backdrop'); } finally { spy.restore(); }
  });

  // ── 20 · icons ───────────────────────────────────────────────────────────────────────────────────────────────────
  var TIER_A = ('cash wallet card coins piggy bank receipt tax percent chart_up chart_down trend_flat dividend interest loan mortgage credit_card lock house building store truck cart stock briefcase key ' +
    'heart heart_pulse hospital pill dumbbell baby gift plane phone laptop wrench roof droplet flame storm bolt user users handshake chat phone_call lunch globe inflation rate_up rate_down news bell shield ' +
    'warning crown star trophy close check info help settings sound_on sound_off cloud cloud_off cloud_sync wifi_off alert menu chevron_up chevron_down chevron_left chevron_right plus minus book journal clock ' +
    'calendar search download upload trash edit eye eye_off logout mail google admin').split(' ');
  T.test('20', 'Icons: every Tier-A ic_* is in the sprite · unknown name ⇒ ic_help + exactly one warning', function () {
    T.ok(TIER_A.length >= 70, 'Tier A list has ≥ 70 names'); var missing = TIER_A.filter(function (n) { return RR.data.iconSprite.indexOf('id="ic_' + n + '"') < 0; }); T.deepEq(missing, [], 'missing icons');
    T.ok((RR.data.iconSprite.match(/<symbol /g) || []).length >= 70); T.ok(RR.data.iconSprite.length <= 60 * 1024, 'sprite ≤ 60 KB: ' + RR.data.iconSprite.length);
    T.ok(RR.data.iconSprite.indexOf('<script') < 0 && !/\son[a-z]+=/.test(RR.data.iconSprite), 'sprite is inert');
    T.ok(document.querySelector('.ic-sprite') && document.querySelector('.ic-sprite symbol#ic_cash'), 'boot injected the sprite into the DOM once'); T.eq(document.querySelectorAll('.ic-sprite').length, 1);
    var el = RR.ui.icon('cash'); T.eq(el.getAttribute('class'), 'ic'); T.eq(el.getAttribute('aria-hidden'), 'true'); T.eq(el.querySelector('use').getAttribute('href'), '#ic_cash'); T.eq(el.style.width, '20px');
    var big = RR.ui.icon('ic_cash', { size: 32, tone: 'pos', label: 'Cash' }); T.eq(big.getAttribute('role'), 'img'); T.eq(big.getAttribute('aria-label'), 'Cash'); T.eq(big.hasAttribute('aria-hidden'), false); T.eq(big.style.width, '32px'); T.ok(big.style.color.length > 0);
    var spy = T.spyWarn();
    try {
      var bad = RR.ui.icon('definitely_not_an_icon'), bad2 = RR.ui.icon('definitely_not_an_icon');
      T.eq(bad.querySelector('use').getAttribute('href'), '#ic_help'); T.eq(bad2.querySelector('use').getAttribute('href'), '#ic_help'); T.eq(spy.count(), 1, 'one warning, not one per call');
    } finally { spy.restore(); }
    T.eq(RR.ui.icon.has('cash'), true); T.eq(RR.ui.icon.has('zzz'), false);
  });

  // ── supporting tests ─────────────────────────────────────────────────────────────────────────────────────────────
  T.test('A1', 'dom.h never interprets strings as HTML; actions are a whitelist (R19/R20)', function () {
    var d = dom.h('div', { text: '<b>x</b><img src=x onerror=alert(1)>' }, '<i>y</i>');
    T.eq(d.children.length, 0, 'no child elements'); T.ok(d.textContent.indexOf('<b>x</b>') === 0);
    var calls = [], spy = T.spyWarn();
    try {
      RR.ui.actions.register('test.ping', function (c) { calls.push(c.arg); return U.ok(null); });
      var btn = dom.h('button', { attrs: { type: 'button', 'data-action': 'test.ping', 'data-arg': 'seven' } }), evil = dom.h('button', { attrs: { type: 'button', 'data-action': 'evil.run' } });
      document.getElementById('stage').appendChild(btn); document.getElementById('stage').appendChild(evil);
      btn.click(); evil.click(); T.deepEq(calls, ['seven']); T.eq(spy.count(), 1, 'the unregistered action is ignored with one warning');
      T.eq(RR.ui.actions.run('nope.nope').reason, 'NOT_FOUND'); T.throws(function () { RR.ui.actions.register('bad name', function () {}); });
      btn.parentNode.removeChild(btn); evil.parentNode.removeChild(evil);
    } finally { spy.restore(); }
    T.ok(RR.ui.actions.has('turn.endTurn') && RR.ui.actions.has('game.new') && RR.ui.actions.has('ui.openSettings'));
  });

  T.test('A2', 'Stubs (§2.8.6): Next Month → NOT_IMPLEMENTED toast + inline reason; disabled controls explain themselves', async function () {
    loadStarter(); cleanup(); noMotion(true);
    try {
      T.eq(RR.turn.endTurn().reason, 'NOT_IMPLEMENTED'); T.eq(RR.health.act('checkup').reason, 'NOT_IMPLEMENTED'); T.eq(RR.npc.interact('x', 'CALL').reason, 'NOT_IMPLEMENTED'); T.eq(RR.deposits.open().reason, 'NOT_IMPLEMENTED');
      T.ok(RR.property.repair && RR.story.setFlag && RR.market.tick && RR.assets.buyStock && RR.debt.borrow, 'all stub modules exist'); T.eq(RR.auth, undefined, 'RR.auth is intentionally absent in Phase 1');
      var rev = RR.store.get().meta.revision; document.getElementById('btn-next').click();
      var st = O.toast.state(); T.eq(st.visible.length, 1); T.ok(/Phase 2/.test(st.visible[0].msg), st.visible[0].msg); T.eq(st.visible[0].tone, 'info');
      T.ok(/Phase 2/.test(document.querySelector('#btn-next').parentNode.querySelector('.inline-reason').textContent), 'inline reason shows under the button'); T.eq(RR.store.get().meta.revision, rev, 'stub changed nothing');
      O.toast.clear(); document.getElementById('btn-contacts').nextElementSibling.click();           // glossary button opens a modal
      T.ok(O.modal.isOpen('glossary')); O.modal.closeAll();
      var disabled = document.querySelector('#action-bar [aria-disabled="true"]'); T.ok(disabled && disabled.title, 'disabled control has a title'); disabled.click(); T.ok(O.toast.state().visible[0].msg === disabled.title, 'clicking explains why');
    } finally { cleanup(); }
  });

  T.test('A3', 'Receipt presenter (§1.12.11): MINOR toasts (top-2 + “+N more”) · MAJOR strip · CRISIS alertdialog', async function () {
    var R = RR.ui.receipt; loadStarter(); cleanup(); noMotion(true);
    try {
      var r1 = { kind: 'CASH', label: 'Cash', delta: -150 }, r2 = { kind: 'HEALTH', label: 'Health', delta: 8 }, r3 = { kind: 'NPC', label: 'Sam', delta: 5, detail: 'Lunch' };
      var out = R.present([r1, r2], { source: 'test', severity: 'MINOR' }); T.eq(out.toasts, 2); var t = O.toast.state(); T.ok(t.visible.some(function (x) { return x.msg === 'Cash \u2212$150'; }), 'money formatted: ' + JSON.stringify(t.visible.map(function (x) { return x.msg; })));
      T.ok(t.visible.some(function (x) { return x.msg === 'Health +8' && x.tone === 'pos'; }), 'points are not money'); O.toast.clear();
      out = R.present([r1, r2, r3, { kind: 'CASH', label: 'Fee', delta: -20 }, { kind: 'CREDIT', label: 'Score', delta: -5 }], { severity: 'MINOR' }); t = O.toast.state(); T.eq(t.visible.length, 3, 'two biggest + a summary');
      T.ok(t.visible.some(function (x) { return x.msg === '+3 more changes'; })); T.ok(t.visible.some(function (x) { return x.msg.indexOf('Cash') === 0; }) && t.visible.some(function (x) { return x.msg.indexOf('Fee') === 0; }) && !t.visible.some(function (x) { return /^(Health|Sam|Score)/.test(x.msg); }), 'the two biggest changes are shown');
      document.querySelector('#toast-root .toast__action button').click(); T.ok(O.modal.isOpen('receipt'), '“View all” opens the full receipt'); T.eq(O.modal.element('receipt').querySelectorAll('.receipt').length, 5); O.modal.closeAll(); O.toast.clear();
      out = R.present([r1, r2, r3, r1, r2, r3, r1, r2], { severity: 'MAJOR' }); T.ok(out.strip && out.strip.children.length === RR.config.ui.receipts.stripMax, 'strip is capped at stripMax'); T.eq(out.toasts, 1); O.toast.clear();
      out = R.present([r1], { severity: 'CRISIS', title: 'Hospital', body: 'You collapsed at work.' });
      await T.sleep(10); var cm = O.modal.element('consequence'); T.ok(cm, 'consequence modal opened'); T.eq(cm.getAttribute('role'), 'alertdialog'); T.eq(cm.querySelectorAll('[aria-label="Close dialog"]').length, 0);
      key(document, 'Escape'); T.ok(O.modal.isOpen('consequence'), 'cannot be dismissed with Esc'); T.eq(document.activeElement.textContent, 'Acknowledge');
      cm.querySelector('[data-modal-action="ack"]').click(); T.eq(await out.modal, 'ack');
      T.eq(R.present([], {}).toasts, 0); T.eq(R.present([{ kind: 'LOG', label: 'x', delta: 1 }], {}).toasts, 0, 'LOG receipts are not toasted');
      T.ok(R.chip({ kind: 'CASH', label: 'Cash', delta: 5 }).querySelector('svg.ic'), 'chips carry an icon');
    } finally { cleanup(); }
  });

  T.test('A4', 'Glossary: ≥12 terms, every data-glossary in the UI resolves, tooltip shows on focus and hides on Esc', function () {
    T.ok(RR.data.glossary.length >= 12); ['cash_flow', 'passive_income', 'asset', 'liability', 'net_worth', 'apr', 'dti', 'credit_score', 'dividend', 'cap_rate', 'leverage', 'emergency_fund'].forEach(function (id) { T.ok(RR.data.glossaryById[id], id); });
    RR.data.glossary.forEach(function (g) { T.ok(g.short.length <= 140, g.id + ' short ≤ 140'); T.ok(g.long.length > g.short.length / 2); });
    loadStarter(); var els = document.querySelectorAll('[data-glossary]'); T.ok(els.length >= 8, 'glossary terms in the UI: ' + els.length);
    Array.prototype.forEach.call(els, function (el) { T.ok(RR.data.glossaryById[el.getAttribute('data-glossary')], 'unknown term ' + el.getAttribute('data-glossary')); T.eq(el.getAttribute('tabindex'), '0', 'terms are keyboard-focusable'); });
    var term = document.querySelector('#col-left [data-glossary="passive_income"]'); term.focus();
    var tip = document.getElementById('tooltip'); T.eq(tip.hidden, false, 'tooltip shows on focus'); T.eq(tip.getAttribute('role'), 'tooltip'); T.ok(tip.textContent.indexOf(RR.data.glossaryById.passive_income.short) >= 0);
    T.eq(term.getAttribute('aria-describedby'), 'tooltip'); key(term, 'Escape'); T.eq(tip.hidden, true, 'Esc hides it');
    term.focus(); term.blur(); T.eq(tip.hidden, true, 'blur hides it');
  });

  T.test('A5', 'Settings modal: switches drive RR.settings; effective motion respects the OS preference; currency symbol applies', async function () {
    loadStarter(); cleanup(); RR.settings.setReducedMotionOverride(false);
    try {
      O.settings.open(); var m = O.modal.element('settings'); T.ok(m);
      var sw = m.querySelector('[data-setting="autosave"]'); T.eq(sw.getAttribute('role'), 'switch'); T.eq(sw.checked, true);
      sw.checked = false; sw.dispatchEvent(new Event('change', { bubbles: true })); T.eq(RR.settings.get('autosave'), false); T.eq(RR.store.get().meta.settings.autosave, false, 'mirrored into the game file');
      sw.checked = true; sw.dispatchEvent(new Event('change', { bubbles: true })); T.eq(RR.settings.get('autosave'), true);
      T.ok(m.querySelector('[data-setting="sound"]').disabled, 'sound is disabled until Phase 7'); O.modal.closeAll();
      RR.settings.setReducedMotionOverride(true); T.eq(RR.settings.get('animations'), false, 'OS reduced motion wins'); T.eq(RR.settings.get('reducedFx'), true); T.eq(document.documentElement.getAttribute('data-motion'), 'reduced');
      O.settings.open(); T.ok(O.modal.element('settings').querySelector('[data-setting="animations"]').disabled, 'cannot override the OS preference'); O.modal.closeAll(); RR.settings.setReducedMotionOverride(false);
      T.eq(document.documentElement.getAttribute('data-motion'), 'full');
      RR.settings.set('currencySymbol', '\u20b1'); RR.ui.binder.invalidate(); RR.ui.binder.refresh(RR.store.get(), { instant: true });
      T.eq(document.querySelector('[data-bind="player.financials.cash"]').textContent, '\u20b13,000'); T.eq(RR.settings.set('currencySymbol', '').ok, false, 'blank symbol rejected');
      T.eq(RR.settings.set('nonsense', 1).ok, false); T.eq(RR.settings.set('autosave', 'yes').ok, false, 'wrong type rejected');
    } finally { RR.settings.set('currencySymbol', '$'); RR.ui.binder.invalidate(); RR.ui.binder.refresh(RR.store.get(), { instant: true }); RR.settings.set('autosave', true); cleanup(); }
  });

  T.test('A6', 'fx: tween lands exactly; flash uses an outline when motion is off; particles respect reducedFx', async function () {
    var fx = RR.ui.fx; loadStarter(); cleanup(); RR.settings.setReducedMotionOverride(false); RR.settings.set('animations', true); RR.settings.set('reducedFx', false);
    try {
      var el = document.createElement('b'); el.setAttribute('data-fmt', 'money'); document.getElementById('app').appendChild(el);
      fx.tweenNumber(el, 0, 1234, 120); await T.sleep(60); T.ok(el.textContent !== '$1,234', 'mid-tween'); await T.sleep(200); T.eq(el.textContent, '$1,234');
      fx.tweenNumber(el, 1234, 5, 5000); fx.tweenNumber(el, 5, 77, 0); T.eq(el.textContent, '$77', 'a new tween cancels the old one');
      fx.flashDelta(el, 10); T.ok(el.classList.contains('flash-pos')); fx.flashDelta(el, -10); T.ok(el.classList.contains('flash-neg') && !el.classList.contains('flash-pos'));
      noMotion(true); fx.flashDelta(el, 10); T.ok(el.classList.contains('hl-pos') && !el.classList.contains('flash-pos'), 'reduced motion ⇒ still highlight');
      fx.tweenNumber(el, 0, 999, 1000); T.eq(el.textContent, '$999', 'reduced motion ⇒ instant'); T.eq(fx.coinBurst(el), 0); T.eq(fx.confetti(), 0); T.eq(fx.shake(el), false);
      noMotion(false); T.ok(fx.coinBurst(el) > 0, 'coins on'); T.ok(fx.liveParticles() > 0); await T.sleep(950); T.eq(fx.liveParticles(), 0, 'particles clean themselves up');
      RR.settings.set('reducedFx', true); T.eq(fx.coinBurst(el), 0, 'reducedFx switch'); RR.settings.set('reducedFx', false);
      el.parentNode.removeChild(el);
    } finally { cleanup(); }
  });

  T.test('A7', 'Panels: Contacts drawer lists the starter roster and is keyboard-operable; stepper idle; Title controls', async function () {
    loadStarter(); cleanup(); noMotion(true);
    try {
      T.eq(document.querySelectorAll('#phase-stepper .step').length, 5); T.eq(document.querySelectorAll('#phase-stepper .is-current').length, 0, 'phase stepper is idle in Phase 1');
      var btn = document.getElementById('btn-contacts'); btn.focus(); btn.click(); var drawer = document.getElementById('contacts-drawer');
      T.eq(drawer.hidden, false); T.eq(btn.getAttribute('aria-expanded'), 'true'); T.ok(drawer.contains(document.activeElement), 'focus moves into the drawer');
      var cards = drawer.querySelectorAll('.npc-card'); T.eq(cards.length, 5); T.ok(cards[0].querySelector('.npc-card__avatar svg'), 'avatars render');
      var s = RR.store.get(); T.eq(cards[0].querySelector('.npc-card__name').textContent, s.npcs[0].name); T.ok(cards[0].querySelector('.npc-tier').textContent.length > 0, 'tier has a text label');
      T.eq(cards[4].querySelector('.npc-role').textContent, 'Banker'); T.eq(cards[0].querySelector('[data-action="npc.call"]').getAttribute('data-arg'), s.npcs[0].id);
      T.eq(cards[0].querySelector('.meter').getAttribute('role'), 'meter');
      key(document.activeElement, 'Escape'); T.eq(drawer.hidden, true, 'Esc closes the drawer'); T.ok(document.activeElement === btn, 'focus returns to the Contacts button'); T.eq(btn.getAttribute('aria-expanded'), 'false');
      btn.click(); T.eq(drawer.hidden, false); drawer.querySelector('#contacts-close').click(); T.eq(drawer.hidden, true);
      var life = document.getElementById('tab-life'); T.eq(life.getAttribute('aria-selected'), 'true'); T.eq(document.getElementById('tab-market').getAttribute('aria-disabled'), 'true');
      T.eq(document.getElementById('panel-life').getAttribute('role'), 'tabpanel'); T.eq(document.querySelectorAll('input[name="insurance"]').length, 3);
      T.ok(document.querySelector('input[name="insurance"][value="NONE"]').checked, 'insurance reflects state');
      RR.ui.screens.title.show(); var signin = document.getElementById('btn-signin'); T.eq(signin.getAttribute('aria-disabled'), 'true'); T.ok(RR.env.mode === 'OFFLINE' ? /hosted version/.test(signin.title) : /later update/.test(signin.title), 'online control is disabled with a reason (' + RR.env.mode + ')');
      T.ok(document.getElementById('signin-note').textContent.length > 0, 'the reason is visible text too'); signin.click(); T.ok(O.toast.state().visible.length >= 1);
      T.eq(document.getElementById('app').hidden, true, 'ledger is hidden behind the Title'); T.ok(document.getElementById('btn-new') && document.getElementById('btn-guest'));
      RR.dev.load('starter');
    } finally { cleanup(); }
  });
})();
