/* RAT RACE · 1a-persist.js · RR.env · RR.settings · RR.persist
   (named "1a" so it sorts after 19-ui-art.js — A15 load order is numeric/lexical filename order)
   ENV: offline-first. file:// or a missing/invalid window.__RR_ENV__ ⇒ OFFLINE; nothing online is ever required to play.
   SETTINGS: device-level preferences (rr.settings.v1), mirrored into state.meta.settings for the active game.
   PERSIST: a tiny adapter seam. Phase 1 registers only the 'local' adapter (wraps RR.save); Phase 5 registers 'cloud'. */
(function (RR) {
  'use strict';

  var U = RR.util;

  // ═════════════════════════════════════ RR.env ═════════════════════════════════════
  var env = RR.env = { name: 'local', mode: 'OFFLINE', configured: false, supabaseUrl: null, publishableKey: null, captchaSiteKey: null, siteUrl: null };

  function pubString(v) { return typeof v === 'string' && v.length > 0 && v.length <= 300 ? v : null; }

  // resolve(raw) is pure (tests call it directly): null/invalid ⇒ OFFLINE; an object ⇒ ONLINE (dev or prod). Only the 4 public values are kept (R14).
  env.resolve = function (raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { name: 'local', mode: 'OFFLINE', configured: false, supabaseUrl: null, publishableKey: null, captchaSiteKey: null, siteUrl: null };
    }
    var out = {
      name: raw.name === 'prod' ? 'prod' : 'dev', mode: 'ONLINE',
      supabaseUrl: pubString(raw.supabaseUrl), publishableKey: pubString(raw.publishableKey),
      captchaSiteKey: pubString(raw.captchaSiteKey), siteUrl: pubString(raw.siteUrl)
    };
    var vals = [out.supabaseUrl, out.publishableKey, out.captchaSiteKey, out.siteUrl];
    out.configured = vals.every(function (v) { return v && v.indexOf('__PLACEHOLDER__') < 0; });      // Phase 1 ships placeholders ⇒ false
    return out;
  };
  env.init = function () {
    var raw = window.__RR_ENV__;
    if (window.location && window.location.protocol === 'file:') { raw = null; }                        // defence in depth: file:// is always OFFLINE
    var r = env.resolve(raw);
    Object.keys(r).forEach(function (k) { env[k] = r[k]; });
    return env;
  };
  env.isOnline = function () { return env.mode === 'ONLINE'; };
  env.init();

  // ═════════════════════════════════ RR.settings ════════════════════════════════════
  var settings = RR.settings = {};
  var values = null;               // stored preferences (what the player chose)
  var listeners = [];
  var motionOverride = null;       // tests: true | false | null

  var SPEC = {
    difficulty:     function (v) { return typeof v === 'string' && /^[A-Z]{3,12}$/.test(v) ? v : undefined; },
    currencySymbol: function (v) { var s = U.cleanString(v, 3, ''); return s || undefined; },
    animations:     bool, autosave: bool, toasts: bool, sound: bool, reducedFx: bool, tutorialHints: bool
  };
  function bool(v) { return typeof v === 'boolean' ? v : undefined; }

  function load() {
    values = Object.assign({}, RR.config.settings.defaults);
    try {
      var raw = window.localStorage.getItem(RR.config.settings.key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          Object.keys(SPEC).forEach(function (k) { var v = SPEC[k](parsed[k]); if (v !== undefined) { values[k] = v; } });
        }
      }
    } catch (e) { /* unreadable preferences → defaults */ }
  }
  function writePrefs() {
    try { window.localStorage.setItem(RR.config.settings.key, JSON.stringify(values)); } catch (e) { /* storage blocked: preferences last for this tab only */ }
  }
  function ensure() { if (!values) { load(); } }

  settings.prefersReducedMotion = function () {
    if (motionOverride !== null) { return motionOverride; }
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  };
  settings.setReducedMotionOverride = function (v) { motionOverride = (v === null || v === undefined) ? null : !!v; settings.applyDom(); };

  // all(): the stored preferences. get(): the EFFECTIVE value (the OS reduced-motion preference always wins for animations/reducedFx).
  settings.all = function () { ensure(); return Object.assign({}, values); };
  settings.get = function (key) {
    ensure();
    if (settings.prefersReducedMotion()) {
      if (key === 'animations') { return false; }
      if (key === 'reducedFx') { return true; }
    }
    return values[key];
  };
  settings.set = function (key, value) {
    ensure();
    if (!SPEC[key]) { return U.fail('INVALID_ARGS', 'Unknown setting "' + key + '".'); }
    var v = SPEC[key](value);
    if (v === undefined) { return U.fail('INVALID_ARGS', 'Invalid value for "' + key + '".'); }
    var changed = values[key] !== v;
    values[key] = v;
    writePrefs();
    if (key === 'currencySymbol') { U.fmt.setCurrency(v); }
    settings.applyDom();
    if (changed) {
      mirror(key, v);
      RR.bus.emit('settings:changed', { key: key, value: v });
      listeners.slice().forEach(function (fn) { try { fn(key, v); } catch (e) { /* a bad listener must not break settings */ } });
    }
    return U.ok({ key: key, value: v });
  };
  settings.reset = function () {
    ensure();
    Object.keys(RR.config.settings.defaults).forEach(function (k) { settings.set(k, RR.config.settings.defaults[k]); });
  };
  settings.subscribe = function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) { listeners.splice(i, 1); } }; };

  // Mirror into the active game's meta.settings (the game file carries the preference it was last played with).
  function mirror(key, value) {
    var st = RR.store && RR.store.get();
    if (!st || st.loop.status === 'TITLE' || st.meta.settings[key] === value) { return; }
    RR.store.commit('settings.set', function (s) { s.meta.settings[key] = value; });
  }

  // Reflect motion preferences on <html> so CSS can key off a single attribute (plus the prefers-reduced-motion media query in base.css).
  settings.applyDom = function () {
    if (typeof document === 'undefined') { return; }
    var root = document.documentElement;
    root.setAttribute('data-motion', settings.get('animations') ? 'full' : 'reduced');
    root.setAttribute('data-fx', settings.get('reducedFx') ? 'reduced' : 'full');
  };
  settings.init = function () {
    ensure();
    U.fmt.setCurrency(values.currencySymbol);
    settings.applyDom();
  };

  // ═════════════════════════════════ RR.persist ═════════════════════════════════════
  // Adapter contract (every method returns a Promise<Result>):
  //   list() → Result<SaveMeta[]> · load(slot) → Result<state> · save(slot, state, opts?) → Result · remove(slot) → Result
  // SaveMeta = { slot, label, turn, mode, status, netWorth, updatedAt, source }
  var persist = RR.persist = {};
  var adapters = {}, current = 'local';

  persist.register = function (name, adapter) {
    if (typeof name !== 'string' || !adapter || ['list', 'load', 'save', 'remove'].some(function (m) { return typeof adapter[m] !== 'function'; })) {
      throw new TypeError('RR.persist.register(name, adapter): adapter needs list/load/save/remove');
    }
    adapters[name] = adapter;
  };
  persist.use = function (name) {
    if (!adapters[name]) { return U.fail('NOT_FOUND', 'No such storage adapter: ' + name); }
    current = name; return U.ok(name);
  };
  persist.current = function () { return adapters[current]; };
  persist.names = function () { return Object.keys(adapters); };

  function onlySlot(slot) {
    if (slot !== undefined && slot !== RR.config.save.slot) { return U.fail('INVALID_ARGS', 'Local play has a single save slot.'); }
    return null;
  }
  persist.local = {
    name: 'local',
    list: function () {
      var m = RR.save.meta();
      if (!m.ok) { return Promise.resolve(m.reason === 'NOT_FOUND' ? U.ok([]) : m); }
      var d = m.data;
      return Promise.resolve(U.ok([{ slot: RR.config.save.slot, label: d.name, turn: d.turn, mode: d.mode, status: d.status, netWorth: d.netWorth, updatedAt: d.savedAt, source: 'local' }]));
    },
    load: function (slot) { return Promise.resolve(onlySlot(slot) || RR.save.read()); },
    save: function (slot, state) { return Promise.resolve(onlySlot(slot) || RR.save.write({ state: state })); },
    remove: function (slot) { var bad = onlySlot(slot); if (bad) { return Promise.resolve(bad); } RR.save.clear(); return Promise.resolve(U.ok(null)); }
  };
  persist.register('local', persist.local);
  persist.list = function () { return persist.current().list(); };
  persist.load = function (slot) { return persist.current().load(slot); };
  persist.save = function (slot, state, opts) { return persist.current().save(slot, state, opts); };
  persist.remove = function (slot) { return persist.current().remove(slot); };
})(window.RR);
