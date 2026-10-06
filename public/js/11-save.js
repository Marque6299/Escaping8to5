/* RAT RACE · 11-save.js · RR.save — local persistence (key rr.save.v1), debounced autosave, export/import JSON, corrupt-save fallback.
   Everything that enters from outside (localStorage, an imported file) passes validate(migrate(…)) before use (R19).
   `derived` is never written (R7): it is regenerated on load. No network. Works on file:// (falls back to memory if storage is blocked). */
(function (RR) {
  'use strict';

  var U = RR.util;
  var save = RR.save = {};

  // ── storage access (can throw on file:// in some browsers, private modes, or when disabled) ──
  var memory = (function () {
    var m = Object.create(null);
    return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } };
  })();
  var chosen = null, usingMemory = false, injected = null;

  function storage() {
    if (injected) { return injected; }
    if (chosen) { return chosen; }
    try {
      var ls = window.localStorage, probe = '__rr_probe__';
      ls.setItem(probe, '1'); ls.removeItem(probe);
      chosen = ls; usingMemory = false;
    } catch (e) {
      chosen = memory; usingMemory = true;
      RR.warnOnce('save:memory', 'localStorage is unavailable — saves will last only until this tab closes.');
    }
    return chosen;
  }
  save.usingMemory = function () { storage(); return usingMemory; };
  save.setStorage = function (s) { injected = s || null; chosen = null; };          // tests: inject a fake / failing storage

  function cfg() { return RR.config.save; }

  // ── envelope ──
  function envelope(state) {
    var copy = {}, k;
    for (k in state) { if (Object.prototype.hasOwnProperty.call(state, k) && k !== 'derived') { copy[k] = state[k]; } }
    return { format: cfg().format, formatVersion: cfg().formatVersion, appVersion: RR.config.version, savedAt: U.now(), state: copy };
  }

  // decode(parsedJson) → Result<state>  — unwrap → migrate → validate. Pure; never touches the store or storage.
  save.decode = function (parsed) {
    var inner = parsed;
    if (parsed && typeof parsed === 'object' && parsed.format === cfg().format) {
      if (!U.isInt(parsed.formatVersion) || parsed.formatVersion > cfg().formatVersion) {
        return U.fail('CORRUPT_SAVE', 'This save was made by a newer version of the game.', { newer: true });
      }
      inner = parsed.state;
    }
    if (!inner || typeof inner !== 'object' || Array.isArray(inner) || !inner.meta || !inner.loop) {
      return U.fail('CORRUPT_SAVE', 'That file is not a Rat Race save.');
    }
    if (inner.meta && U.isNum(inner.meta.schemaVersion) && inner.meta.schemaVersion > RR.schema.VERSION) {
      return U.fail('CORRUPT_SAVE', 'This save was made by a newer version of the game.', { newer: true });
    }
    var state;
    try { state = RR.schema.migrate(inner); } catch (e) { return U.fail('CORRUPT_SAVE', 'The save could not be upgraded.'); }
    var v = RR.schema.validate(state);
    if (!v.ok) { return U.fail('CORRUPT_SAVE', 'The save file is damaged or has been edited incorrectly.', { errors: v.errors }); }
    return U.ok(state);
  };

  function parse(text) {
    try { return { ok: true, value: JSON.parse(text) }; } catch (e) { return { ok: false }; }
  }

  function quarantine(raw) {
    var s = storage();
    try { s.setItem(cfg().corruptKey, raw); } catch (e) { /* ignore: the quarantine copy is best-effort */ }
    try { s.removeItem(cfg().key); } catch (e) { /* ignore */ }
  }

  // ── public API ──
  save.has = function () { try { return storage().getItem(cfg().key) !== null; } catch (e) { return false; } };
  save.hasCorruptBackup = function () { try { return storage().getItem(cfg().corruptKey) !== null; } catch (e) { return false; } };
  save.clear = function () { try { storage().removeItem(cfg().key); } catch (e) { /* ignore */ } };
  save.clearCorrupt = function () { try { storage().removeItem(cfg().corruptKey); } catch (e) { /* ignore */ } };

  // write({state?}) → Result  — writes the live state (or opts.state). A TITLE state is never written.
  save.write = function (opts) {
    var st = (opts && opts.state) || RR.store.get();
    if (!st || !st.loop) { return U.fail('GAME_NOT_RUNNING', 'There is nothing to save yet.'); }
    if (st.loop.status === 'TITLE') { return U.fail('GAME_NOT_RUNNING', 'There is nothing to save yet.'); }
    var env = envelope(st), text;
    try { text = JSON.stringify(env); } catch (e) { return U.fail('INVALID_ARGS', 'The game state could not be serialised.'); }
    try { storage().setItem(cfg().key, text); }
    catch (e) {
      var r = U.fail('STORAGE_ERROR', 'Your browser would not let the game save. Export your game to keep it safe.');
      RR.bus.emit('save:error', { reason: r.reason, message: r.message });
      return r;
    }
    RR.bus.emit('save:written', { revision: st.meta.revision, bytes: text.length, savedAt: env.savedAt });
    return U.ok({ bytes: text.length, savedAt: env.savedAt, revision: st.meta.revision });
  };

  // read({apply?}) → Result<state>. A corrupt save is moved aside (rr.save.v1.corrupt) so the player is never stuck on it.
  save.read = function (opts) {
    var raw;
    try { raw = storage().getItem(cfg().key); } catch (e) { return U.fail('STORAGE_ERROR', 'Your browser would not let the game read its save.'); }
    if (raw === null) { return U.fail('NOT_FOUND', 'No saved game was found.'); }
    var p = parse(raw);
    var res = p.ok ? save.decode(p.value) : U.fail('CORRUPT_SAVE', 'The saved game could not be read.');
    if (!res.ok) {
      if (!res.newer) { quarantine(raw); }
      return res;
    }
    if (opts && opts.apply) { RR.store.replace(res.data, 'save.read'); }
    return res;
  };

  // meta() → Result<{name, professionId, turn, mode, status, netWorth, savedAt}> for the Title "Continue" line. No side effects on the store.
  save.meta = function () {
    var raw;
    try { raw = storage().getItem(cfg().key); } catch (e) { return U.fail('STORAGE_ERROR', 'Storage unavailable.'); }
    if (raw === null) { return U.fail('NOT_FOUND', 'No saved game was found.'); }
    var p = parse(raw);
    var res = p.ok ? save.decode(p.value) : U.fail('CORRUPT_SAVE', 'The saved game could not be read.');
    if (!res.ok) { return res; }
    var s = res.data;
    return U.ok({ name: s.player.name, professionId: s.player.professionId, turn: s.loop.turn, mode: s.loop.mode, status: s.loop.status,
                  netWorth: s.derived ? s.derived.netWorth : RR.ledger.recompute(s).netWorth, savedAt: p.value && p.value.savedAt ? p.value.savedAt : null, revision: s.meta.revision });
  };

  save.exportJSON = function () {
    var st = RR.store.get();
    return st ? JSON.stringify(envelope(st)) : '';
  };
  save.exportFilename = function () {
    var st = RR.store.get();
    var slug = st ? U.cleanString(st.player.name, 24, 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'player' : 'player';
    return 'rat-race_' + slug + '_turn' + (st ? st.loop.turn : 0) + '.json';
  };

  // importJSON(text, {apply?}) → Result<state>. Size-capped; never trusts the file (R19).
  save.importJSON = function (text, opts) {
    if (typeof text !== 'string' || !text) { return U.fail('INVALID_ARGS', 'That file is empty.'); }
    if (text.length > cfg().maxImportBytes) { return U.fail('INVALID_ARGS', 'That file is too large to be a Rat Race save.'); }
    var p = parse(text);
    if (!p.ok) { return U.fail('CORRUPT_SAVE', 'That file is not valid JSON.'); }
    var res = save.decode(p.value);
    if (res.ok && opts && opts.apply) {
      RR.store.replace(res.data, 'save.import');
      save.write();
    }
    return res;
  };

  // ── autosave (debounced; skips TITLE; honours the settings toggle) ──
  var timer = null, dirty = false, inited = false;

  function autosaveOn() {
    if (RR.settings && RR.settings.get) { return !!RR.settings.get('autosave'); }
    var st = RR.store.get();
    return !!(st && st.meta.settings.autosave);
  }
  save.pending = function () { return dirty; };
  save.flush = function () {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) { return null; }
    dirty = false;
    return save.write();
  };
  function schedule() {
    dirty = true;
    if (timer) { clearTimeout(timer); }
    timer = setTimeout(function () { timer = null; save.flush(); }, cfg().autosaveDebounceMs);
  }
  save.init = function () {
    if (inited) { return; }
    inited = true;
    RR.bus.on('state:committed', function (p) {
      if (p && p.replaced) { return; }
      var st = RR.store.get();
      if (!st || st.loop.status === 'TITLE' || !autosaveOn()) { return; }
      schedule();
    });
    window.addEventListener('pagehide', function () { save.flush(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { save.flush(); } });
  };
  save._cancel = function () { if (timer) { clearTimeout(timer); timer = null; } dirty = false; };        // tests
})(window.RR);
