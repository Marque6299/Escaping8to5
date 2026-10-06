/* RAT RACE · config/env.js · PUBLIC runtime configuration only (R14). Loaded before the game scripts.
   • file:// ⇒ always OFFLINE (RR.env sets mode OFFLINE; nothing online is ever required to play).
   • http(s) ⇒ ONLINE with the four public values below. Phase 1 ships PLACEHOLDERS: RR.env.configured stays false and every online control stays disabled.
   • Phase 5 fills these in (Supabase URL + publishable key + CAPTCHA site key). Never put a secret, service-role or private key in this file — it is served to every visitor. */
(function () {
  'use strict';
  var loc = window.location;
  if (loc.protocol === 'file:') { window.__RR_ENV__ = null; return; }
  var PROD_HOSTS = ['__PLACEHOLDER__'];                       // Phase 5: the production hostname(s)
  window.__RR_ENV__ = {
    name: PROD_HOSTS.indexOf(loc.hostname) >= 0 ? 'prod' : 'dev',
    supabaseUrl: '__PLACEHOLDER__',
    publishableKey: '__PLACEHOLDER__',
    captchaSiteKey: '__PLACEHOLDER__',
    siteUrl: loc.origin
  };
})();
