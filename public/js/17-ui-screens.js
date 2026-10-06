/* RAT RACE · 17-ui-screens.js · Title v2, New Game form, and the game-level actions (new / continue / import / export / quit).
   Offline-first: nothing here needs a network. Online controls are rendered DISABLED with a visible reason (§2.8.2).
   Screens never mutate state directly: they build a new state with RR.schema.create and hand it to RR.store.replace / commit (R3). */
(function (RR) {
  'use strict';

  var U = RR.util, dom = RR.ui.dom, h = dom.h, actions = RR.ui.actions;
  var S = RR.ui.screens = {};
  var host = null, appEl = null;

  function icon(n, s) { return RR.ui.icon(n, { size: s || 18 }); }
  function toast(msg, tone, key) { RR.ui.overlays.toast.show(msg, { tone: tone || 'info', key: key }); }

  function show(node, focusSel) {
    dom.clear(host);
    host.appendChild(node);
    host.hidden = false;
    if (appEl) { appEl.hidden = true; }
    RR.ui.overlays.tooltip.attach(host);
    var f = focusSel ? host.querySelector(focusSel) : null;
    if (!f) { var list = dom.focusable(host); f = list.length ? list[0] : null; }
    if (f) { f.focus(); }
  }
  S.hide = function () {
    dom.clear(host); host.hidden = true;
    if (appEl) { appEl.hidden = false; }
    RR.ui.binder.refresh(RR.store.get(), { instant: true });
  };
  S.visible = function () { return !!host && !host.hidden; };

  // ═════════════════════════════════════ Title v2 ═════════════════════════════════════
  var continueNote = null;
  function continueLabel(meta) {
    return meta.name + ' \u00b7 ' + U.fmt.date(meta.turn) + ' \u00b7 ' + U.fmt.money(meta.netWorth, { compact: true }) + ' net worth';
  }

  S.title = { show: function () {
    var offline = RR.env.mode === 'OFFLINE';
    var meta = RR.save.meta();
    if (!meta.ok && meta.reason === 'CORRUPT_SAVE') {                // quarantine it so the player is never stuck on a bad file (R19)
      RR.save.read();
      toast('Your saved game could not be read, so it was set aside. You can start a new game or import a backup.', 'warn', 'corrupt-save');
      meta = RR.save.meta();
    }
    var hasSave = meta.ok;
    var signInTitle = offline ? 'Online play needs the hosted version' : 'Accounts arrive in a later update';
    var node = h('main', { class: 'screen', id: 'screen-title', attrs: { 'aria-label': 'Rat Race title screen' } },
      h('div', { class: 'title' },
        h('img', { class: 'title__logo', attrs: { src: RR.config.assetBase + 'assets/brand/logo.svg', alt: 'Rat Race', width: 420, height: 160 } }),
        h('p', { class: 'title__tag', text: 'Build passive income. Escape the rat race. One month at a time.' }),
        h('div', { class: 'title__menu' },
          hasSave ? h('button', { class: 'btn btn--primary title__continue', id: 'btn-continue', attrs: { type: 'button', 'data-action': 'game.continue' } },
            h('span', null, 'Continue', h('small', { text: continueLabel(meta.data) })), icon('ic_chevron_right', 22)) : null,
          h('button', { class: 'btn' + (hasSave ? '' : ' btn--primary'), id: 'btn-new', attrs: { type: 'button', 'data-action': 'screens.newGame' } }, icon('ic_plus', 20), 'New Game'),
          h('button', { class: 'btn', id: 'btn-signin', attrs: { type: 'button', 'data-action': 'auth.signIn', 'aria-disabled': 'true', title: signInTitle, 'aria-describedby': 'signin-note' } }, icon('ic_user', 20), 'Sign in / Create account'),
          h('p', { class: 'title__note', id: 'signin-note', text: signInTitle + '.' }),
          h('button', { class: 'btn', id: 'btn-guest', attrs: { type: 'button', 'data-action': 'screens.newGame' } }, icon('ic_laptop', 20), 'Play as Guest'),
          h('div', { class: 'title__row' },
            h('button', { class: 'btn', attrs: { type: 'button', 'data-action': 'game.import' } }, icon('ic_upload', 18), 'Import save'),
            h('button', { class: 'btn', attrs: { type: 'button', 'data-action': 'ui.openSettings' } }, icon('ic_settings', 18), 'Settings')),
          h('p', { class: 'title__note', text: RR.save.usingMemory() ? 'Saving is blocked in this browser, so your game will not be kept after you close the tab. Use Export to keep it.' : 'Guest games are saved in this browser only.' })),
        h('nav', { class: 'title__foot', attrs: { 'aria-label': 'Legal and credits' } },
          ['Privacy', 'Terms', 'Credits'].map(function (t) {
            return h('a', { text: t, attrs: { href: t.toLowerCase() + '.html', 'data-action': 'ui.legal', 'data-arg': t.toLowerCase(), 'aria-disabled': 'true', title: t + ' page arrives in a later phase' } });
          }))),
      h('span', { class: 'title__ver', text: 'v' + RR.version })
    );
    show(node, hasSave ? '#btn-continue' : '#btn-new');
  } };

  // ═════════════════════════════════════ New Game ═════════════════════════════════════
  function previewFlow(professionId) {                               // starting monthly cash flow, from the real engine (no hard-coded copy)
    try { return RR.schema.create({ professionId: professionId, seed: 1 }).derived.monthlyCashflow; } catch (e) { return null; }
  }
  function choice(name, value, checked, title, sub, ic, extra) {
    var input = h('input', { class: 'sr-only', attrs: { type: 'radio', name: name, value: value, checked: checked ? true : undefined } });
    input.checked = !!checked;
    return h('label', { class: 'choice' }, input,
      h('span', { class: 'choice__body' }, ic ? icon(ic, 26) : null,
        h('span', null, h('span', { class: 'choice__title', text: title }), h('span', { class: 'choice__sub', text: sub }), extra || null),
        h('span', { class: 'choice__check' }, icon('ic_check', 20))));
  }
  function formValues(form) {
    var get = function (n) { var el = form.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : null; };
    return { name: form.elements.name.value, professionId: get('profession'), dreamId: get('dream'), seed: form.elements.seed.value.trim() };
  }

  S.newGame = { show: function () {
    var err = h('p', { class: 'field__error', id: 'ng-error', attrs: { role: 'alert' } });
    var name = h('input', { class: 'input', id: 'ng-name', attrs: { type: 'text', name: 'name', maxlength: RR.config.ui.name.maxLength, autocomplete: 'off', placeholder: RR.config.ui.name.fallback, 'aria-describedby': 'ng-name-hint' } });
    var seed = h('input', { class: 'input', id: 'ng-seed', attrs: { type: 'text', name: 'seed', inputmode: 'numeric', maxlength: 9, autocomplete: 'off', placeholder: 'Random', 'aria-describedby': 'ng-seed-hint' } });
    var profs = h('div', { class: 'choice-grid' }, RR.data.professions.map(function (p) {
      var flow = previewFlow(p.id);
      return choice('profession', p.id, p.id === RR.data.defaultProfessionId, p.name, p.blurb, p.icon,
        h('span', { class: 'prof-stats' }, h('span', null, 'Salary ', h('b', { text: U.fmt.money(p.salary) })), h('span', null, 'Cash flow ', h('b', { text: flow === null ? '\u2014' : U.fmt.money(flow, { signed: true }) }))));
    }));
    var dreams = h('div', { class: 'choice-grid' }, RR.data.dreams.map(function (d) {
      return choice('dream', d.id, d.id === RR.data.defaultDreamId, d.name, U.fmt.money(d.cost) + ' \u00b7 ' + d.blurb, d.icon);
    }));
    var form = h('form', { class: 'newgame panel panel--strong', attrs: { novalidate: true, 'aria-labelledby': 'ng-title' } },
      h('h1', { id: 'ng-title', text: 'New game' }),
      h('div', { class: 'newgame__grid' },
        h('div', { class: 'stack stack--lg' },
          h('div', { class: 'field' }, h('label', { attrs: { for: 'ng-name' }, text: 'Your name' }), name, h('span', { class: 'field__hint', id: 'ng-name-hint', text: 'Up to ' + RR.config.ui.name.maxLength + ' characters. Left blank, you are ' + RR.config.ui.name.fallback + '.' })),
          h('fieldset', { class: 'field', style: { border: '0', padding: '0', margin: '0' } }, h('legend', { class: 'field__label', text: 'Profession', style: { padding: '0', marginBottom: '8px' } }), profs)),
        h('div', { class: 'stack stack--lg' },
          h('fieldset', { class: 'field', style: { border: '0', padding: '0', margin: '0' } }, h('legend', { class: 'field__label', text: 'Your dream (the Fast Track goal)', style: { padding: '0', marginBottom: '8px' } }), dreams),
          h('div', { class: 'field' }, h('label', { attrs: { for: 'ng-seed' }, text: 'Seed (optional)' }), seed,
            h('span', { class: 'field__hint', id: 'ng-seed-hint', text: 'Digits only. The same seed and choices play out the same way, so you can share a run.' })))),
      err,
      h('div', { class: 'newgame__foot' },
        h('button', { class: 'btn btn--ghost', attrs: { type: 'button', 'data-action': 'screens.title' } }, icon('ic_chevron_left', 18), 'Back'),
        h('button', { class: 'btn btn--primary btn--lg', id: 'ng-start', attrs: { type: 'submit' } }, 'Start game', icon('ic_chevron_right', 20))));
    form.addEventListener('submit', function (e) { e.preventDefault(); actions.run('game.new', { el: form.querySelector('#ng-start'), arg: undefined }); });
    show(h('main', { class: 'screen', id: 'screen-newgame', attrs: { 'aria-label': 'New game' } }, form), '#ng-name');
  } };

  function setFormError(msg) {
    var el = document.getElementById('ng-error');
    if (el) { dom.setText(el, msg || ''); }
  }

  // ═════════════════════════════ game-level actions ═════════════════════════════
  function enterGame() {
    RR.ui.overlays.modal.closeAll();
    if (RR.ui.panels.contacts.isOpen()) { RR.ui.panels.contacts.close(); }
    S.hide();
    var next = document.getElementById('btn-next'); if (next) { next.focus(); }
  }

  function download(text, filename) {
    var blob = new Blob([text], { type: 'application/json' }), url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) { a.parentNode.removeChild(a); } }, 1000);
  }

  function pickFile() {                                                   // → Promise<string|null>
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json'; input.style.display = 'none';
      var done = false;
      function finish(v) { if (done) { return; } done = true; if (input.parentNode) { input.parentNode.removeChild(input); } resolve(v); }
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) { finish(null); return; }
        if (f.size > RR.config.save.maxImportBytes) { toast('That file is too large to be a Rat Race save.', 'neg', 'import-big'); finish(null); return; }
        var reader = new FileReader();
        reader.onload = function () { finish(String(reader.result)); };
        reader.onerror = function () { toast('That file could not be read.', 'neg', 'import-read'); finish(null); };
        reader.readAsText(f);
      });
      input.addEventListener('cancel', function () { finish(null); });
      document.body.appendChild(input);
      input.click();
    });
  }

  S.init = function () {
    host = document.getElementById('screens');
    appEl = document.getElementById('app');
    if (!host) { throw new Error('RR.ui.screens.init: #screens missing'); }

    actions.register('screens.title', function () { S.title.show(); return U.ok(null); });
    actions.register('screens.newGame', function () { S.newGame.show(); return U.ok(null); });
    actions.register('ui.legal', function (c) { return U.fail('NOT_IMPLEMENTED', (c.arg || 'That') + ' page arrives in a later phase.'); });
    actions.register('auth.signIn', function () { return U.fail(RR.env.mode === 'OFFLINE' ? 'NOT_ONLINE' : 'NOT_IMPLEMENTED', RR.env.mode === 'OFFLINE' ? 'Online play needs the hosted version.' : 'Accounts arrive in a later update.'); });

    actions.register('game.new', function () {
      var form = document.querySelector('#screen-newgame form');
      if (!form) { return U.fail('INVALID_ARGS', 'Open the New Game form first.'); }
      var v = formValues(form);
      if (v.seed && !/^\d{1,9}$/.test(v.seed)) { setFormError('The seed must be 1 to 9 digits.'); return U.fail('INVALID_ARGS', 'The seed must be 1 to 9 digits.'); }
      if (!v.professionId || !v.dreamId) { setFormError('Choose a profession and a dream.'); return U.fail('INVALID_ARGS', 'Choose a profession and a dream.'); }
      setFormError('');
      var fresh;
      try { fresh = RR.schema.create({ name: v.name, professionId: v.professionId, dreamId: v.dreamId, seed: v.seed ? parseInt(v.seed, 10) : undefined }); }
      catch (e) { return U.fail('INVALID_ARGS', 'Those choices could not start a game.'); }
      RR.store.replace(fresh, 'game.new');
      var prof = U.findById(RR.data.professions, fresh.player.professionId);
      var res = RR.store.commit('game.start', function (s) {
        s.loop.status = 'RUNNING';
        RR.store.pushLog(s, { kind: 'SYSTEM', text: 'Welcome, ' + s.player.name + '. Your story as a ' + prof.name + ' begins.' });
      });
      if (!res.ok) { return res; }
      if (RR.replay && typeof RR.replay.start === 'function') { RR.replay.start({ seed: fresh.meta.rng.seed, professionId: fresh.player.professionId, dreamId: fresh.player.dreamId, name: fresh.player.name }); }
      RR.save.write();
      enterGame();
      RR.ui.overlays.announce('New game started. ' + fresh.player.name + ', ' + prof.name + '.');
      return U.ok(null);
    });

    actions.register('game.continue', function () {
      var r = RR.save.read({ apply: true });
      if (!r.ok) {
        toast(r.reason === 'CORRUPT_SAVE' ? 'Your saved game could not be read, so it was set aside. You can start a new game or import a backup.' : r.message, 'warn', 'continue-fail');
        S.title.show();
        return U.ok(null);                                              // handled here (toast + Title): don't show a second error toast
      }
      enterGame();
      return U.ok(null);
    });

    actions.register('game.import', function () {
      return pickFile().then(function (text) {
        if (text === null) { return U.ok(null); }
        var r = RR.save.importJSON(text);
        if (!r.ok) { toast(r.message, 'neg', 'import-fail'); return U.ok(null); }
        var running = RR.store.get() && RR.store.get().loop.status !== 'TITLE';
        var go = function () {
          RR.store.replace(r.data, 'save.import');
          RR.save.write();
          enterGame();
          toast('Save imported: ' + r.data.player.name + ', ' + U.fmt.date(r.data.loop.turn) + '.', 'pos', 'import-ok');
        };
        if (!running && !RR.save.has()) { go(); return U.ok(null); }
        return RR.ui.overlays.modal.confirm({ id: 'confirm-import', title: 'Replace your saved game?', tone: 'danger', confirmLabel: 'Replace it', cancelLabel: 'Keep my game',
          body: 'Importing ' + r.data.player.name + '\u2019s save will replace the game stored in this browser. Export your current game first if you want to keep it.' })
          .then(function (yes) { if (yes) { go(); } return U.ok(null); });
      });
    });

    actions.register('game.export', function () {
      var st = RR.store.get();
      if (!st || st.loop.status === 'TITLE') { return U.fail('GAME_NOT_RUNNING', 'Start a game first.'); }
      download(RR.save.exportJSON(), RR.save.exportFilename());
      toast('Game exported. Keep the file somewhere safe.', 'pos', 'export-ok');
      return U.ok(null);
    });

    actions.register('game.deleteSave', function () {
      return RR.ui.overlays.modal.confirm({ id: 'confirm-delete', title: 'Delete the saved game?', tone: 'danger', confirmLabel: 'Delete it', cancelLabel: 'Keep it',
        body: 'This removes the saved copy from this browser. If you are in the middle of a game, it will be saved again after your next move.' })
        .then(function (yes) {
          if (!yes) { return U.ok(null); }
          RR.save.clear(); RR.save.clearCorrupt();
          toast('Saved game deleted.', 'info', 'delete-ok');
          if (S.visible()) { S.title.show(); }
          return U.ok(null);
        });
    });

    actions.register('game.toTitle', function () {
      RR.save.flush();
      RR.ui.overlays.modal.closeAll();
      if (RR.ui.panels.contacts.isOpen()) { RR.ui.panels.contacts.close(); }
      S.title.show();
      return U.ok(null);
    });

    actions.init(document.getElementById('stage'));
  };
})(window.RR);
