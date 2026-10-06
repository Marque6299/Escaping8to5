/* RAT RACE · 07-store.js · RR.store — the ONLY mutation gateway (R3).
   Pipeline per top-level commit (§1.4):
     snapshot → run mutator on the live state → revision++ / updatedAt → trim log → recompute derived → emit 'state:committed'.
   A throwing mutator, or one that returns { ok:false }, rolls the state back to the snapshot (R8: commit never throws).
   Nested commits inside commit()/batch() join the outer commit: they roll back individually but notify once.
   RR.rng advancing meta.rng.* is the one documented exemption (R3) — it needs no commit. */
(function (RR) {
  'use strict';

  var U = RR.util;
  var state = null;
  var depth = 0;

  var store = RR.store = { lastError: null, strict: true };

  store.get = function () { return state; };
  store.inCommit = function () { return depth > 0; };

  // Guard for helpers that mutate (uid, pushLog, bumpStat): the LIVE state may only be touched inside a commit.
  // Fresh objects that are not the live state (schema.create, migrate, fixtures, tests) are always allowed.
  store.assertWritable = function (target, who) {
    if (target === state && depth === 0) {
      throw new Error((who || 'mutation') + ' on the live state outside RR.store.commit (R3)');
    }
  };

  function restore(snapshot) {
    var k;
    for (k in state) { if (Object.prototype.hasOwnProperty.call(state, k)) { delete state[k]; } }
    for (k in snapshot) { if (Object.prototype.hasOwnProperty.call(snapshot, k)) { state[k] = snapshot[k]; } }   // in place: references to `state` stay valid
  }

  function finalize() {
    state.meta.revision = (state.meta.revision | 0) + 1;
    state.meta.updatedAt = U.now();
    var limit = RR.config.logLimit;
    if (state.log.length > limit) { state.log.splice(0, state.log.length - limit); }
    if (store.strict) {
      var issues = U.jsonIssues(state, 3);
      if (issues.length) { throw new Error('State must stay JSON-plain (R4): ' + issues.join('; ')); }
    }
    state.derived = RR.ledger.recompute(state);
  }

  function failure(label, err) {
    store.lastError = { label: label, error: err };
    RR.warnOnce('commit:' + label + ':' + (err && err.message), 'commit "' + label + '" rolled back: ' + (err && err.message ? err.message : err));
    return U.fail('MUTATOR_ERROR', 'Something went wrong (' + label + '). Your game was not changed.', { error: err });
  }

  function runNested(label, fn) {
    var snap = U.deepClone(state);
    try {
      var ret = fn(state);
      if (ret && ret.ok === false) { restore(snap); return ret; }
      return U.ok(ret);
    } catch (err) { restore(snap); return failure(label, err); }
  }

  function runTop(label, fn) {
    var snap = U.deepClone(state), res;
    depth = 1;
    try {
      var ret = fn(state);
      if (ret && ret.ok === false) { restore(snap); res = ret; }
      else { finalize(); res = U.ok(ret); }
    } catch (err) { restore(snap); res = failure(label, err); }
    finally { depth = 0; }
    if (res.ok) { RR.bus.emit('state:committed', { label: label, revision: state.meta.revision, replaced: false }); }
    return res;
  }

  // commit(label, mutator(state) → any | {ok:false,…}) → Result
  store.commit = function (label, mutator) {
    if (typeof label !== 'string' || !label || typeof mutator !== 'function') { return U.fail('INVALID_ARGS', 'commit(label, mutator) needs a label and a function.'); }
    if (!state) { return U.fail('GAME_NOT_RUNNING', 'No game is loaded.'); }
    return depth > 0 ? runNested(label, mutator) : runTop(label, mutator);
  };

  // batch(label, fn(state)) → Result. Every commit inside fn() joins one revision bump and one notification.
  store.batch = function (label, fn) {
    if (typeof label !== 'string' || !label || typeof fn !== 'function') { return U.fail('INVALID_ARGS', 'batch(label, fn) needs a label and a function.'); }
    if (!state) { return U.fail('GAME_NOT_RUNNING', 'No game is loaded.'); }
    return depth > 0 ? runNested(label, fn) : runTop(label, fn);
  };

  // replace(newState, label) — new game / load / dev fixture. Recomputes derived (R7), keeps revision as given, emits once.
  store.replace = function (newState, label) {
    if (depth > 0) { throw new Error('RR.store.replace() cannot be called inside a commit'); }
    if (!newState || typeof newState !== 'object' || !newState.meta || !newState.loop) { throw new TypeError('RR.store.replace: not a game state'); }
    state = newState;
    state.derived = RR.ledger.recompute(state);
    RR.bus.emit('state:committed', { label: label || 'store.replace', revision: state.meta.revision, replaced: true });
  };

  store.subscribe = function (fn) { return RR.bus.on('state:committed', fn); };

  // ── helpers used INSIDE commits ──────────────────────────────────────────────────────────────────────────────────
  store.pushLog = function (target, entry) {
    store.assertWritable(target, 'RR.store.pushLog');
    var kinds = RR.schema.ENUMS.LOG_KIND, kind = entry && entry.kind;
    if (kinds.indexOf(kind) < 0) { RR.warnOnce('logkind:' + kind, 'pushLog: unknown kind "' + kind + '", using SYSTEM'); kind = 'SYSTEM'; }
    var row = { turn: target.loop.turn, kind: kind, text: U.cleanString(entry && entry.text, RR.config.limits.logTextMax, '\u2014') };
    if (entry && U.isNum(entry.delta)) { row.delta = U.roundMoney(entry.delta); }
    target.log.push(row);
    var limit = RR.config.logLimit;
    if (target.log.length > limit) { target.log.splice(0, target.log.length - limit); }
  };

  // bumpStat(state, 'dealsTaken') · bumpStat(state, 'eventsByCategory.DEAL', 1) — dotted keys create missing objects.
  store.bumpStat = function (target, key, n) {
    store.assertWritable(target, 'RR.store.bumpStat');
    var cur = U.getPath(target.stats, key);
    U.setPath(target.stats, key, (typeof cur === 'number' ? cur : 0) + (n === undefined ? 1 : n));
  };
})(window.RR);
