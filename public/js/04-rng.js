/* RAT RACE · 04-rng.js · RR.rng — seeded PRNG (mulberry32), state saved in state.meta.rng (R5, A10, A21).
   Plain RR.rng.* is the legacy 'misc' stream (meta.rng.state). Named streams market|events|deals|npc live in meta.rng.streams.
   Adding rolls to one stream never changes another stream's sequence. Advancing a stream is the R3 exemption (no commit needed). */
(function (RR) {
  'use strict';

  var STREAMS = ['market', 'events', 'deals', 'npc'];
  var override = null;                          // RR.rng.useState(state) — tests / headless runs

  // mulberry32: state is a uint32 that is advanced by a constant each call.
  function step(s) {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }

  function activeState() {
    var s = override || (RR.store && RR.store.get());
    if (!s || !s.meta || !s.meta.rng) { throw new Error('RR.rng: no active game state (call RR.rng.useState or RR.store.replace first)'); }
    return s;
  }

  // A "cell" reads/writes one uint32 inside state.meta.rng.
  function misc(getState) {
    return {
      get: function () { return getState().meta.rng.state >>> 0; },
      set: function (v) { getState().meta.rng.state = v; }
    };
  }
  function named(getState, name) {
    return {
      get: function () {
        var streams = getState().meta.rng.streams;
        if (!streams || typeof streams[name] !== 'number') { throw new Error('RR.rng: stream "' + name + '" is missing (migrate the state to schema v2)'); }
        return streams[name] >>> 0;
      },
      set: function (v) { getState().meta.rng.streams[name] = v; }
    };
  }

  // Build the sampling API over a cell. Every method consumes a fixed, documented number of next() calls.
  function api(cell) {
    var o = {};
    o.next = function () { var r = step(cell.get()); cell.set(r.state); return r.value; };
    o.int = function (lo, hi) {                          // inclusive both ends
      lo = Math.ceil(lo); hi = Math.floor(hi);
      if (hi < lo) { var t = lo; lo = hi; hi = t; }
      return lo + Math.floor(o.next() * (hi - lo + 1));
    };
    o.float = function (lo, hi) { return lo + o.next() * (hi - lo); };
    o.chance = function (p) { return o.next() < p; };    // p ≤ 0 → false, p ≥ 1 → true (still consumes one value)
    o.pick = function (arr) { return arr && arr.length ? arr[Math.floor(o.next() * arr.length)] : undefined; };
    o.weighted = function (items, weightFn) {            // one next() call; returns null when every weight is ≤ 0
      var total = 0, i, w, ws = [];
      for (i = 0; i < items.length; i++) { w = weightFn ? weightFn(items[i], i) : items[i].weight; w = (typeof w === 'number' && isFinite(w) && w > 0) ? w : 0; ws.push(w); total += w; }
      var roll = o.next();
      if (total <= 0) { return null; }
      var acc = 0, target = roll * total;
      for (i = 0; i < items.length; i++) { acc += ws[i]; if (ws[i] > 0 && target < acc) { return items[i]; } }
      for (i = items.length - 1; i >= 0; i--) { if (ws[i] > 0) { return items[i]; } }
      return null;
    };
    o.normal = function () {                             // Box–Muller; always 2 next() calls (no cached spare → save/load safe)
      var u1 = 1 - o.next(), u2 = o.next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };
    o.shuffle = function (arr) {                         // Fisher–Yates, in place
      for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(o.next() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    };
    return o;
  }

  function seedStreams(rngObj, seed) {
    rngObj.seed = seed >>> 0;
    rngObj.state = seed >>> 0;                           // legacy 'misc' stream
    rngObj.streams = rngObj.streams || {};
    STREAMS.forEach(function (n) { rngObj.streams[n] = RR.util.fnv1a32(String(rngObj.seed) + ':' + n); });
  }

  function build(getState) {
    var rng = api(misc(getState));
    var cache = {};
    rng.stream = function (name) {
      if (name === 'misc') { return rng; }
      if (STREAMS.indexOf(name) < 0) { throw new Error('RR.rng.stream: unknown stream "' + name + '"'); }
      return cache[name] || (cache[name] = api(named(getState, name)));
    };
    rng.seed = function (n) { seedStreams(getState().meta.rng, n); };
    rng.getSeed = function () { return getState().meta.rng.seed; };
    return rng;
  }

  var rng = RR.rng = build(activeState);
  rng.STREAMS = STREAMS.slice();
  rng.seedStreams = seedStreams;                        // used by RR.schema.create / migrate on a fresh rng object
  rng.useState = function (state) { override = state || null; };
  rng.forState = function (state) { return build(function () { return state; }); };   // independent handle bound to one state object
  rng.step = step;                                      // exposed for tests (pure)
})(window.RR);
