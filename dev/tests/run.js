/* dev/tests/run.js — waits for RR.app.boot() (the app boots inside the off-screen sandbox), isolates storage, then runs every test. */
(function () {
  'use strict';
  RR.config.assetBase = '../public/';                        // runs before the app boots (boot waits for DOMContentLoaded)
  function go() {
    // Never touch the real localStorage from tests: saves go to an in-memory fake.
    var mem = {};
    RR.save.setStorage({ getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); }, removeItem: function (k) { delete mem[k]; } });
    window.__fakeStorage = mem;
    RR.util.setClock(function () { return Date.UTC(2026, 9, 2); });        // deterministic timestamps / gameIds
    T.run();
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', function () { setTimeout(go, 0); }); } else { setTimeout(go, 0); }
})();
