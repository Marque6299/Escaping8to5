/* Acceptance test 21 (§2.8.7) + RR.save robustness: corrupt-save fallback, import hardening, autosave. */
(function () {
  'use strict';
  var U = RR.util;
  function fakeStorage() {
    var mem = {};
    return { mem: mem, getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } };
  }
  function withStorage(fs, fn) {
    var prev = window.__fakeStorage;
    RR.save.setStorage(fs);
    return Promise.resolve().then(fn).then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
    function restore() { RR.save.setStorage({ getItem: function (k) { return Object.prototype.hasOwnProperty.call(prev, k) ? prev[k] : null; }, setItem: function (k, v) { prev[k] = String(v); }, removeItem: function (k) { delete prev[k]; } }); }
  }

  T.test('21', 'Persist/env: persist.local passes the save round-trip · file:// ⇒ OFFLINE with online controls disabled and Guest play working · env file ⇒ ONLINE', async function () {
    // persist.local ⇄ RR.save
    await withStorage(fakeStorage(), async function () {
      var st = RR.dev.fixture('rich_rat_race'); RR.store.replace(st, 'test');
      var empty = await RR.persist.list(); T.eq(empty.ok, true); T.deepEq(empty.data, [], 'no saves yet');
      var w = await RR.persist.local.save(1, st); T.ok(w.ok, 'save: ' + w.message);
      var list = await RR.persist.list(); T.eq(list.data.length, 1); T.eq(list.data[0].label, 'Alex'); T.eq(list.data[0].turn, 18); T.eq(list.data[0].netWorth, st.derived.netWorth); T.eq(list.data[0].source, 'local'); T.eq(list.data[0].slot, 1);
      var r = await RR.persist.load(1); T.ok(r.ok); T.deepEq(T.stripDerived(r.data), T.stripDerived(st), 'load returns what was saved');
      T.eq((await RR.persist.local.load(2)).reason, 'INVALID_ARGS', 'local play has one slot');
      T.eq((await RR.persist.remove(1)).ok, true); T.eq((await RR.persist.list()).data.length, 0); T.eq((await RR.persist.load(1)).reason, 'NOT_FOUND');
      T.deepEq(RR.persist.names(), ['local'], 'only the local adapter in Phase 1'); T.eq(RR.persist.use('cloud').ok, false);
      T.throws(function () { RR.persist.register('bad', {}); }, 'adapters must implement the full contract');
    });
    // env
    T.eq(RR.env.resolve(null).mode, 'OFFLINE'); T.eq(RR.env.resolve(undefined).mode, 'OFFLINE'); T.eq(RR.env.resolve([]).mode, 'OFFLINE'); T.eq(RR.env.resolve('x').mode, 'OFFLINE');
    var dev = RR.env.resolve({ name: 'dev', supabaseUrl: '__PLACEHOLDER__', publishableKey: '__PLACEHOLDER__', captchaSiteKey: '__PLACEHOLDER__', siteUrl: 'http://localhost:8080' });
    T.eq(dev.mode, 'ONLINE'); T.eq(dev.name, 'dev'); T.eq(dev.configured, false, 'placeholders are not "configured"');
    var real = RR.env.resolve({ name: 'prod', supabaseUrl: 'https://abc.supabase.co', publishableKey: 'sb_publishable_x', captchaSiteKey: 'site', siteUrl: 'https://ratrace.example', serviceRoleKey: 'SECRET' });
    T.eq(real.mode, 'ONLINE'); T.eq(real.name, 'prod'); T.eq(real.configured, true); T.eq(real.serviceRoleKey, undefined, 'only the four public values are kept (R14)'); T.deepEq(Object.keys(real).sort(), ['captchaSiteKey', 'configured', 'mode', 'name', 'publishableKey', 'siteUrl', 'supabaseUrl']);
    T.eq(RR.env.resolve({ name: 'weird' }).name, 'dev', 'unknown names are never treated as prod');
    if (location.protocol === 'file:') { T.eq(RR.env.mode, 'OFFLINE', 'opened via file:// ⇒ OFFLINE'); T.eq(window.__RR_ENV__, null); }
    else { T.eq(RR.env.mode, 'ONLINE', 'served over http(s) with config/env.js ⇒ ONLINE'); T.eq(RR.env.configured, false, 'Phase 1 ships placeholders'); }
    // online controls disabled, and Guest play works end to end (Title → New Game → ledger)
    await withStorage(fakeStorage(), async function () {
      RR.ui.screens.title.show();
      var signin = document.getElementById('btn-signin'); T.eq(signin.getAttribute('aria-disabled'), 'true', 'sign-in is disabled'); T.ok(signin.title.length > 0);
      document.getElementById('btn-guest').click();
      var form = document.querySelector('#screen-newgame form'); T.ok(form, 'Play as Guest opens the New Game form');
      form.elements.name.value = '  Mia\u0000  '; form.querySelector('input[name="profession"][value="nurse"]').checked = true; form.querySelector('input[name="dream"][value="mountain_ranch"]').checked = true; form.elements.seed.value = '12345';
      document.getElementById('ng-start').click();
      var s = RR.store.get();
      T.eq(s.loop.status, 'RUNNING'); T.eq(s.player.name, 'Mia'); T.eq(s.player.professionId, 'nurse'); T.eq(s.fastTrack.dream.id, 'mountain_ranch'); T.eq(s.meta.rng.seed, 12345); T.eq(s.player.financials.salary, 4100);
      T.eq(s.log.length, 1); T.eq(s.log[0].kind, 'SYSTEM'); T.ok(RR.save.has(), 'the new game was saved to the (fake) storage');
      T.eq(document.getElementById('screens').hidden, true); T.eq(document.getElementById('app').hidden, false); T.ok(RR.schema.validate(s).ok);
      RR.ui.screens.title.show(); T.ok(document.getElementById('btn-continue'), 'Continue appears once a save exists'); T.ok(/Mia/.test(document.getElementById('btn-continue').textContent));
      document.getElementById('btn-continue').click(); T.eq(RR.store.get().player.name, 'Mia'); T.eq(document.getElementById('screens').hidden, true);
      // bad form input is rejected without starting a game
      RR.ui.screens.newGame.show(); var f2 = document.querySelector('#screen-newgame form'); f2.elements.seed.value = 'abc'; var rev = RR.store.get().meta.revision;
      document.getElementById('ng-start').click(); T.ok(/digits/.test(document.getElementById('ng-error').textContent), 'inline validation message'); T.eq(RR.store.get().meta.revision, rev); T.eq(RR.store.get().player.name, 'Mia');
      f2.elements.seed.value = ''; f2.elements.name.value = ''; document.getElementById('ng-start').click(); T.eq(RR.store.get().player.name, 'Alex', 'blank name falls back'); T.ok(RR.store.get().meta.rng.seed >= 1, 'blank seed is generated');
    });
    RR.dev.load('starter');
  });

  T.test('S1', 'save: corrupt data is quarantined, never trusted; newer versions refused; import is size-capped and hardened (R19)', async function () {
    var store1 = fakeStorage();
    await withStorage(store1, async function () {
      var fs = store1.mem, k = RR.config.save.key, ck = RR.config.save.corruptKey;
      T.eq(RR.save.read().reason, 'NOT_FOUND');
      fs[k] = '{ this is not json';
      var r = RR.save.read(); T.eq(r.ok, false); T.eq(r.reason, 'CORRUPT_SAVE'); T.eq(fs[k], undefined, 'bad save removed from the live key'); T.eq(fs[ck], '{ this is not json', 'but kept as a backup'); T.eq(RR.save.has(), false); T.eq(RR.save.hasCorruptBackup(), true);
      var good = RR.dev.fixture('starter'); good.player.health.value = NaN;
      fs[k] = JSON.stringify({ format: 'rr.save', formatVersion: 1, state: JSON.parse(JSON.stringify(RR.dev.fixture('starter'))) });
      var parsed = JSON.parse(fs[k]); parsed.state.npcs[0].relationship = 500; fs[k] = JSON.stringify(parsed);
      r = RR.save.read(); T.eq(r.reason, 'CORRUPT_SAVE', 'validation failure ⇒ corrupt'); T.ok(r.errors && r.errors.length, 'reasons are reported'); T.eq(RR.save.has(), false);
      RR.save.clearCorrupt(); T.eq(RR.save.hasCorruptBackup(), false);

      var newer = JSON.stringify({ format: 'rr.save', formatVersion: 99, state: {} }); r = RR.save.importJSON(newer); T.eq(r.ok, false); T.eq(r.newer, true);
      var v3 = JSON.parse(JSON.stringify(RR.dev.fixture('starter'))); v3.meta.schemaVersion = 3; r = RR.save.importJSON(JSON.stringify(v3)); T.eq(r.ok, false); T.eq(r.newer, true, 'a future schema is refused, not "repaired"');
      T.eq(RR.save.importJSON('').reason, 'INVALID_ARGS'); T.eq(RR.save.importJSON('nope').reason, 'CORRUPT_SAVE'); T.eq(RR.save.importJSON('[]').reason, 'CORRUPT_SAVE'); T.eq(RR.save.importJSON('{"a":1}').reason, 'CORRUPT_SAVE');
      T.eq(RR.save.importJSON('x'.repeat(RR.config.save.maxImportBytes + 1)).reason, 'INVALID_ARGS', 'oversize files are refused before parsing');
      var polluted = '{"meta":{"schemaVersion":2,"__proto__":{"polluted":true}},"loop":{}}'; T.eq(RR.save.importJSON(polluted).ok, false); T.eq(({}).polluted, undefined, 'no prototype pollution');
      var raw = RR.save.importJSON(JSON.stringify(RR.dev.fixture('rich_rat_race'))); T.ok(raw.ok, 'a bare state (no envelope) also imports: ' + raw.message);
      var tampered = JSON.parse(JSON.stringify(RR.dev.fixture('starter'))); tampered.player.name = '<img src=x onerror=alert(1)>'; r = RR.save.importJSON(JSON.stringify(tampered));
      T.ok(r.ok, 'markup in names is just text'); T.eq(r.data.player.name, '<img src=x onerror=alert(1)>', 'stored verbatim; rendering uses textContent');
      T.eq(/^rat-race_[a-z0-9-]+_turn\d+\.json$/.test(RR.save.exportFilename()), true, 'safe export filename: ' + RR.save.exportFilename());
    });
  });

  T.test('S2', 'save: TITLE is never saved · storage failures return STORAGE_ERROR · autosave is debounced and honours the setting', async function () {
    var failing = { getItem: function () { return null; }, setItem: function () { throw new Error('QuotaExceededError'); }, removeItem: function () {} };
    await withStorage(failing, function () {
      RR.dev.load('starter'); var errors = 0, off = RR.bus.on('save:error', function () { errors++; });
      var r = RR.save.write(); off(); T.eq(r.reason, 'STORAGE_ERROR'); T.eq(errors, 1); T.ok(/Export/.test(r.message), 'tells the player what to do');
    });
    await withStorage(fakeStorage(), async function () {
      RR.save.init(); RR.save._cancel();
      var title = RR.schema.create({ seed: 1 }); T.eq(RR.save.write({ state: title }).reason, 'GAME_NOT_RUNNING', 'a TITLE state is never written');
      RR.dev.load('starter'); RR.save._cancel(); T.eq(RR.save.has(), false, 'loading a fixture does not autosave');
      RR.store.commit('t.change', function (s) { s.player.financials.cash += 1; });
      T.eq(RR.save.pending(), true, 'a commit schedules a save'); T.eq(RR.save.has(), false, 'but does not write immediately (debounced)');
      var written = 0, off2 = RR.bus.on('save:written', function () { written++; }); RR.save.flush(); off2();
      T.eq(written, 1); T.eq(RR.save.has(), true); T.eq(RR.save.pending(), false); T.eq(RR.save.read().data.player.financials.cash, 3001);
      RR.save.clear(); RR.settings.set('autosave', false); RR.save._cancel();
      RR.store.commit('t.change2', function (s) { s.player.financials.cash += 1; }); T.eq(RR.save.pending(), false, 'autosave off ⇒ nothing scheduled');
      RR.settings.set('autosave', true); RR.save._cancel();
      RR.store.commit('t.a', function (s) { s.player.financials.cash += 1; }); RR.store.commit('t.b', function (s) { s.player.financials.cash += 1; });
      var count = 0, off3 = RR.bus.on('save:written', function () { count++; }); RR.save.flush(); off3(); T.eq(count, 1, 'many commits ⇒ one write');
      T.eq(RR.save.usingMemory(), false);
    });
  });

  T.test('S3', 'save: blocked localStorage falls back to memory with a warning (Safari private mode, file:// restrictions)', function () {
    var blocked = { getItem: function () { throw new Error('SecurityError'); }, setItem: function () { throw new Error('SecurityError'); }, removeItem: function () { throw new Error('SecurityError'); } };
    RR.save.setStorage(blocked);
    try { T.eq(RR.save.has(), false, 'reading a blocked store does not throw'); T.eq(RR.save.read().reason, 'STORAGE_ERROR'); }
    finally { RR.save.setStorage({ getItem: function (k) { return window.__fakeStorage[k] === undefined ? null : window.__fakeStorage[k]; }, setItem: function (k, v) { window.__fakeStorage[k] = String(v); }, removeItem: function (k) { delete window.__fakeStorage[k]; } }); }
  });

  T.test('ST1', 'Stub registry: feature stubs say NOT_IMPLEMENTED; phase-hook stubs (market.tick, progression.checkEndConditions) succeed quietly', function () {
    var r = RR.turn.endTurn();
    T.eq(r.ok, false); T.eq(r.reason, 'NOT_IMPLEMENTED'); T.ok(/Phase 2/.test(r.message), r.message);
    T.eq(RR.npc.interact('npc_0007', 'CALL').reason, 'NOT_IMPLEMENTED'); T.eq(RR.health.act('checkup').reason, 'NOT_IMPLEMENTED'); T.eq(RR.deposits.open().reason, 'NOT_IMPLEMENTED');
    T.eq(RR.market.tick().ok, true, 'the MARKET phase hook must not fail the turn'); T.eq(RR.progression.checkEndConditions().ok, true, 'the CLEANUP hook must not fail the turn');
    ['turn', 'npc', 'health', 'story', 'deposits', 'property', 'market', 'assets', 'debt', 'progression'].forEach(function (k) { T.eq(RR[k].__stub, true, 'RR.' + k + ' is flagged as a stub'); });
    T.ok(RR.auth === undefined && RR.cloud === undefined && RR.sync === undefined && RR.entitlements === undefined, 'online modules are intentionally undefined in Phase 1');
  });
})();
