/* RAT RACE · 02-util.js · RR.util — pure helpers. No DOM, no network, no game state (except uid, inside a commit). */
(function (RR) {
  'use strict';

  var U = RR.util = {};

  // ── math ────────────────────────────────────────────────────────────────
  U.clamp = function (n, lo, hi) { return n < lo ? lo : (n > hi ? hi : n); };
  U.round2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };          // per-share values
  U.roundMoney = function (n) { var r = Math.round(n); return r === 0 ? 0 : r; };             // Math.round, -0 → 0 (R6)
  U.round4 = function (n) { return Math.round((n + Number.EPSILON) * 10000) / 10000; };       // rates
  U.sum = function (arr, fn) { var t = 0; for (var i = 0; i < arr.length; i++) { t += fn ? fn(arr[i], i) : arr[i]; } return t; };
  U.isInt = function (n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; };
  U.isNum = function (n) { return typeof n === 'number' && isFinite(n); };

  // ── objects & paths ─────────────────────────────────────────────────────
  U.deepClone = function (obj) { return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj)); };

  var pathCache = Object.create(null);
  function split(path) { return pathCache[path] || (pathCache[path] = String(path).split('.')); }

  // getPath(obj, "a.b.0.c") — numeric segments index arrays.
  U.getPath = function (obj, path) {
    var parts = split(path), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) { return undefined; }
      cur = cur[parts[i]];
    }
    return cur;
  };

  // setPath creates missing intermediate *objects* (never arrays). Used by RR.store.bumpStat for "eventsByCategory.DEAL".
  U.setPath = function (obj, path, value) {
    var parts = split(path), cur = obj;
    for (var j = 0; j < parts.length; j++) { if (parts[j] === '__proto__' || parts[j] === 'constructor' || parts[j] === 'prototype') { throw new TypeError('setPath: forbidden key "' + parts[j] + '"'); } }
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (cur[k] === undefined || cur[k] === null) { cur[k] = {}; }
      if (typeof cur[k] !== 'object') { throw new TypeError('setPath: "' + parts.slice(0, i + 1).join('.') + '" is not an object'); }
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  };

  U.findById = function (list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return null;
  };

  // ── ids (R5: never timestamps). Call ONLY inside a commit when `state` is the live store state. ──
  function pad(n, w) { var s = String(n); while (s.length < w) { s = '0' + s; } return s; }
  U.pad = pad;
  U.uid = function (state, prefix) {
    if (RR.store && RR.store.assertWritable) { RR.store.assertWritable(state, 'RR.util.uid'); }
    state.meta.idCounter = (state.meta.idCounter | 0) + 1;
    return prefix + '_' + pad(state.meta.idCounter, 4);
  };

  // ── hashing (fnv1a-32): rng stream seeds, deterministic ids, avatar seeds ──
  U.fnv1a32 = function (str) {
    var h = 0x811c9dc5, s = String(str);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  };

  // ── clock: swappable so seeded runs can be byte-identical (meta.createdAt/updatedAt) ──
  var clock = null;
  U.setClock = function (fn) { clock = typeof fn === 'function' ? fn : null; };       // fn() → epoch ms
  U.nowMs = function () { return clock ? clock() : Date.now(); };
  U.now = function () { return new Date(U.nowMs()).toISOString(); };

  // ── Result helpers (R8) ─────────────────────────────────────────────────
  U.ok = function (data) { return { ok: true, data: data }; };
  U.fail = function (reason, message, extra) {
    if (RR.REASONS.indexOf(reason) < 0) { RR.warnOnce('reason:' + reason, 'Unknown reason code "' + reason + '"'); }
    var r = { ok: false, reason: reason, message: message || reason };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { r[k] = extra[k]; } } }
    return r;
  };

  // ── untrusted strings (R19): strip control & bidi-override characters, collapse whitespace, cap length ──
  /* eslint-disable no-control-regex */
  // Invisible / control characters are REMOVED (so "A\u0000lex" → "Alex"); ordinary whitespace (space, tab, newline) collapses to one space.
  var STRIP_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
  U.cleanString = function (s, max, fallback) {
    var out = String(s === undefined || s === null ? '' : s).replace(STRIP_CHARS, '').replace(/\s+/g, ' ').trim();
    out = Array.from(out).slice(0, max || RR.config.limits.labelMax).join('').trim();
    return out || (fallback === undefined ? '' : fallback);
  };

  // ── JSON-plainness check (R4) → list of human-readable issues ───────────
  U.jsonIssues = function (value, maxIssues) {
    var issues = [], cap = maxIssues || 25;
    (function walk(v, path, depth) {
      if (issues.length >= cap) { return; }
      if (depth > 40) { issues.push(path + ': nested too deeply'); return; }
      var t = typeof v;
      if (v === null || t === 'string' || t === 'boolean') { return; }
      if (t === 'number') { if (!isFinite(v)) { issues.push(path + ': ' + String(v) + ' is not allowed in state'); } return; }
      if (t === 'undefined') { issues.push(path + ': undefined is not allowed in state'); return; }
      if (t === 'function' || t === 'symbol' || t === 'bigint') { issues.push(path + ': ' + t + ' is not allowed in state'); return; }
      if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) { walk(v[i], path + '[' + i + ']', depth + 1); } return; }
      var proto = Object.getPrototypeOf(v);                // realm-independent: plain = proto is null, or proto's own proto is null (Object.prototype)
      if (proto !== null && Object.getPrototypeOf(proto) !== null) { issues.push(path + ': non-plain object'); return; }
      for (var k in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k)) { continue; }
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') { issues.push(path + '.' + k + ': forbidden key'); continue; }   // prototype-pollution guard (R19)
        walk(v[k], path + '.' + k, depth + 1);
      }
    })(value, '$', 0);
    return issues;
  };

  // ── formatting ──────────────────────────────────────────────────────────
  var MINUS = '\u2212';
  var currency = '$';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }     // locale-independent, deterministic

  var fmt = U.fmt = {};
  fmt.setCurrency = function (sym) { currency = String(sym || '$'); };
  fmt.getCurrency = function () { return currency; };

  // money(n, {signed, compact}) → "$1,234" | "−$1,234" | "+$1,234"
  fmt.money = function (n, o) {
    o = o || {};
    if (typeof n !== 'number' || !isFinite(n)) { return '\u2014'; }
    var v = U.roundMoney(n), abs = Math.abs(v), body;
    if (o.compact && abs >= 1000) {
      var div = abs >= 1e9 ? 1e9 : (abs >= 1e6 ? 1e6 : 1e3), suf = abs >= 1e9 ? 'B' : (abs >= 1e6 ? 'M' : 'K');
      body = (abs / div).toFixed(1).replace(/\.0$/, '') + suf;
    } else { body = group(abs); }
    var sign = v < 0 ? MINUS : (o.signed && v > 0 ? '+' : '');
    return sign + currency + body;
  };
  fmt.pct = function (x, dp) {
    if (typeof x !== 'number' || !isFinite(x)) { return '\u2014'; }
    dp = dp === undefined ? 1 : dp;
    var s = (Math.abs(x) * 100).toFixed(dp);
    return (x < 0 && parseFloat(s) !== 0 ? MINUS : '') + s + '%';
  };
  fmt.int = function (n) {
    if (typeof n !== 'number' || !isFinite(n)) { return '\u2014'; }
    var v = U.roundMoney(n);
    return (v < 0 ? MINUS : '') + group(Math.abs(v));
  };
  fmt.signed = function (n) {                      // +8 / −3 / 0 (points, not money)
    if (typeof n !== 'number' || !isFinite(n)) { return '\u2014'; }
    var v = U.roundMoney(n);
    return (v < 0 ? MINUS : (v > 0 ? '+' : '')) + group(Math.abs(v));
  };
  fmt.ratio = function (x, dp) {
    if (typeof x !== 'number' || !isFinite(x)) { return '\u2014'; }
    return (x < 0 ? MINUS : '') + Math.abs(x).toFixed(dp === undefined ? 2 : dp);
  };
  // date(turn): turn 1 = Year 1 · Jan ; month = (turn-1)%12 ; year = floor((turn-1)/12)+1. Turn 0 = before the first month.
  fmt.date = function (turn) {
    var per = RR.config.turnsPerYear;
    if (typeof turn !== 'number' || !isFinite(turn) || turn < 1) { return 'Year 1 \u00b7 Start'; }
    return 'Year ' + (Math.floor((turn - 1) / per) + 1) + ' \u00b7 ' + MONTHS[(turn - 1) % per];
  };
})(window.RR);
