/* dev/tests/harness.js — a tiny assert harness (no libraries). Tests register with T.test(id, title, fn); fn may be async.
   run() executes them in order, renders a PASS/FAIL list, sets document.title and window.__RR_TESTS__ for the headless runner. */
(function (root) {
  'use strict';

  var tests = [];
  var T = root.T = {};

  function AssertionError(msg) { this.name = 'AssertionError'; this.message = msg; }
  AssertionError.prototype = Object.create(Error.prototype);

  function show(v) { try { return typeof v === 'string' ? JSON.stringify(v) : (v === undefined ? 'undefined' : JSON.stringify(v)); } catch (e) { return String(v); } }
  function fail(msg) { throw new AssertionError(msg); }

  T.test = function (id, title, fn) { tests.push({ id: String(id), title: title, fn: fn }); };
  T.ok = function (cond, msg) { if (!cond) { fail(msg || 'expected truthy'); } };
  T.eq = function (actual, expected, msg) { if (actual !== expected) { fail((msg ? msg + ': ' : '') + 'expected ' + show(expected) + ' but got ' + show(actual)); } };
  T.near = function (a, b, eps, msg) { if (!(Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps))) { fail((msg ? msg + ': ' : '') + 'expected ≈' + b + ' but got ' + a); } };
  T.deepEq = function (a, b, msg) {
    var sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) {
      var i = 0; while (i < sa.length && sa[i] === sb[i]) { i++; }
      fail((msg ? msg + ': ' : '') + 'not deep-equal near char ' + i + ': …' + sa.slice(Math.max(0, i - 40), i + 60) + '…  vs  …' + sb.slice(Math.max(0, i - 40), i + 60) + '…');
    }
  };
  T.throws = function (fn, msg) { var threw = false; try { fn(); } catch (e) { threw = true; } if (!threw) { fail(msg || 'expected a throw'); } };
  T.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  T.waitFor = function (pred, ms, what) {
    var t0 = Date.now();
    return new Promise(function (resolve, reject) {
      (function poll() {
        var v; try { v = pred(); } catch (e) { v = false; }
        if (v) { resolve(v); } else if (Date.now() - t0 > (ms || 3000)) { reject(new AssertionError('timed out waiting for ' + (what || 'condition'))); } else { setTimeout(poll, 20); }
      })();
    });
  };
  T.stripDerived = function (s) { var c = JSON.parse(JSON.stringify(s)); delete c.derived; return c; };

  // console.warn spy: returns { count(), messages, restore() }
  T.spyWarn = function () {
    var orig = console.warn, msgs = [];
    console.warn = function () { msgs.push(Array.prototype.join.call(arguments, ' ')); };
    return { messages: msgs, count: function () { return msgs.length; }, restore: function () { console.warn = orig; } };
  };

  T.run = async function () {
    var list = document.getElementById('results'), summary = document.getElementById('summary');
    var passed = 0, failed = 0, results = [];
    for (var i = 0; i < tests.length; i++) {
      var t = tests[i], li = document.createElement('li'), ok = true, err = '';
      var t0 = Date.now();
      try { await t.fn(); } catch (e) { ok = false; err = (e && e.message) ? e.message : String(e); if (!(e instanceof AssertionError) && e && e.stack) { err += '\n' + e.stack.split('\n').slice(1, 4).join('\n'); } }
      var ms = Date.now() - t0;
      if (ok) { passed++; } else { failed++; }
      li.className = ok ? 'pass' : 'fail';
      var id = document.createElement('b'); id.textContent = (ok ? 'PASS ' : 'FAIL ') + t.id;
      li.appendChild(id); li.appendChild(document.createTextNode(' ' + t.title));
      var sm = document.createElement('small'); sm.textContent = ms + ' ms'; li.appendChild(sm);
      if (!ok) { var ee = document.createElement('span'); ee.className = 'err'; ee.textContent = err; li.appendChild(ee); }
      list.appendChild(li);
      results.push({ id: t.id, title: t.title, ok: ok, error: err });
    }
    summary.textContent = failed ? ('FAIL — ' + failed + ' of ' + tests.length + ' failed') : ('PASS — all ' + tests.length + ' tests passed');
    summary.className = failed ? 'fail' : 'pass';
    document.title = (failed ? 'TESTS FAIL ' : 'TESTS PASS ') + passed + '/' + tests.length;
    root.__RR_TESTS__ = { done: true, passed: passed, failed: failed, total: tests.length, results: results };
  };
})(window);
