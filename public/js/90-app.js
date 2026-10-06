/* RAT RACE · 90-app.js · RR.app.boot() — the single entry point. Loads last (A15).
   Order matters: environment → settings → art sprite → stage → overlays → save → initial state → panels → screens → binder → dev → Title.
   A failure here is shown on screen (never a blank page) and recorded in RR._errors. Works from file:// with no server. */
(function (RR) {
  'use strict';

  var app = RR.app = { booted: false, error: null };

  function showBootError(err) {
    app.error = err;
    var box = document.getElementById('boot-error');
    if (box) {
      box.textContent = 'Rat Race could not start: ' + (err && err.message ? err.message : String(err)) + '. Reloading the page may help.';
      box.hidden = false;
    }
    if (window.console && window.console.error) { window.console.error('[RR] boot failed:', err); }
  }

  app.boot = function () {
    if (app.booted) { return; }
    try {
      RR.env.init();
      RR.settings.init();
      RR.ui.icon.inject();
      RR.ui.stage.init();
      RR.ui.overlays.init();
      RR.save.init();

      // The store always holds a state so the ledger can bind; a TITLE state is never saved (11-save.js).
      RR.store.replace(RR.schema.create({}), 'boot');
      document.body.setAttribute('data-mode', RR.store.get().loop.mode);

      RR.ui.panels.init();
      RR.ui.screens.init();
      RR.ui.binder.init(document.getElementById('stage'));

      RR.bus.on('state:committed', function () {
        var mode = RR.store.get().loop.mode;
        if (document.body.getAttribute('data-mode') !== mode) { document.body.setAttribute('data-mode', mode); }
      });
      RR.settings.subscribe(function (key) {
        if (key === 'currencySymbol') { RR.ui.binder.invalidate(); RR.ui.binder.refresh(RR.store.get(), { instant: true }); }
      });

      RR.dev.init();
      RR.ui.screens.title.show();
      app.booted = true;
    } catch (err) {
      showBootError(err);
    }
    ping();
  };

  // Test hook: when this page is embedded by dev/tests.html (?rrtest=1) report the outcome to the parent. Carries no game data.
  function ping() {
    try {
      if (window.parent !== window && /[?&]rrtest=1\b/.test(window.location.search)) {
        window.parent.postMessage({ rr: 'booted', ok: app.booted, errors: RR._errors.map(function (e) { return String(e); }), titleVisible: !!document.getElementById('screen-title') }, '*');
      }
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', app.boot); } else { app.boot(); }
})(window.RR);
