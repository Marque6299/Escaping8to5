/* RAT RACE · 00-namespace.js · the one global (R1/A2). Classic script, no modules. */
(function (root) {
  'use strict';

  var RR = root.RR = root.RR || {};
  RR.data = RR.data || {};
  RR.ui = RR.ui || {};
  RR.ui.state = RR.ui.state || {}; // UI-only state (open drawers, selected tab). Never saved, never in RR.store.

  // RR.state → RR.store.get()  (read-only convention; mutate only through RR.store.commit — R3)
  Object.defineProperty(RR, 'state', {
    enumerable: true,
    get: function () { return RR.store ? RR.store.get() : null; }
  });

  // RR.version mirrors RR.config.version (single source of truth, also used for ?v= cache busting).
  Object.defineProperty(RR, 'version', {
    enumerable: true,
    get: function () { return RR.config ? RR.config.version : '0.0.0'; }
  });

  // Dev-only console warnings, de-duplicated by key. Silent on the production environment.
  var warned = {};
  RR.warnOnce = function (key, msg) {
    if (warned[key]) { return; }
    warned[key] = true;
    if (RR.env && RR.env.name === 'prod') { return; }
    if (root.console && root.console.warn) { root.console.warn('[RR] ' + msg); }
  };
  RR._resetWarnings = function () { warned = {}; };

  // Diagnostics: uncaught errors and failed resource loads are collected (capture phase also sees <script>/<link> load failures).
  RR._errors = [];
  root.addEventListener('error', function (e) {
    var t = e && e.target;
    if (t && t !== root && t.tagName) { RR._errors.push('Failed to load ' + (t.src || t.href || t.tagName)); }
    else { RR._errors.push((e && e.message) || 'Unknown error'); }
  }, true);
  root.addEventListener('unhandledrejection', function (e) { RR._errors.push('Unhandled rejection: ' + (e && e.reason && e.reason.message ? e.reason.message : e && e.reason)); });

  // Canonical reason codes (§1.7 + §1.12.5). CORRUPT_SAVE and STORAGE_ERROR are Phase 1 additions (additive).
  RR.REASONS = Object.freeze([
    'INSUFFICIENT_CASH', 'INSUFFICIENT_SHARES', 'NOT_FOUND', 'WRONG_PHASE', 'WRONG_MODE', 'BLOCKED',
    'GAME_NOT_RUNNING', 'CREDIT_DENIED', 'OVER_LIMIT', 'UNDERWATER', 'INVALID_ARGS', 'MUTATOR_ERROR',
    'NOT_IMPLEMENTED', 'NPC_UNAVAILABLE', 'LIMIT_REACHED', 'COOLDOWN', 'NOT_ONLINE', 'UNAUTHENTICATED',
    'FORBIDDEN', 'CONFLICT', 'QUOTA_EXCEEDED', 'PREMIUM_REQUIRED', 'CORRUPT_SAVE', 'STORAGE_ERROR'
  ]);
})(window);
