/* RAT RACE · 1b-stubs.js · the Phase 1 stub registry (§2.6, §2.8.6).
   Each stub returns { ok:false, reason:'NOT_IMPLEMENTED', message } and nothing else; the action layer turns that into an info toast.
   LOAD ORDER IS THE CONTRACT: this file sorts after 1a-persist.js and BEFORE 20-*.js, so each later phase's real module simply
   re-assigns RR.<name> and replaces its stub. Never put real logic here, and never load this file after a real module.
   (Not in RepoStructure.md: added so the stubs cannot be loaded after — and overwrite — the real modules that replace them.) */
(function (RR) {
  'use strict';

  function stub(phase, what) {
    return function () { return RR.util.fail('NOT_IMPLEMENTED', what + ' arrives in Phase ' + phase + '.'); };
  }
  // A phase-hook stub: the turn engine (Phase 2) CALLS these every turn, so they must succeed quietly rather than report NOT_IMPLEMENTED.
  function noop() { return RR.util.ok({ stub: true }); }
  function group(phase, names) {
    var o = { __stub: true };
    Object.keys(names).forEach(function (n) { o[n] = stub(phase, names[n]); });
    return o;
  }

  // Phase 2 — turn loop & life systems
  RR.turn = group(2, { endTurn: 'The turn engine', startGame: 'The turn engine' });
  RR.npc = group(2, { interact: 'Contacts', meet: 'Contacts' });
  RR.health = group(2, { act: 'Health actions', setInsurance: 'Health insurance', tick: 'Health' });
  RR.story = group(2, { setFlag: 'Your story', schedule: 'Your story', journal: 'The journal' });

  // Phase 3 — market, deposits, property
  RR.deposits = group(3, { open: 'Savings accounts', deposit: 'Savings accounts', withdraw: 'Savings accounts', close: 'Savings accounts' });
  RR.property = group(3, { repair: 'Property upkeep', insure: 'Property insurance', renovate: 'Property upkeep', inspect: 'Property inspections', setMaintenance: 'Property upkeep' });
  RR.market = { __stub: true, tick: noop };                       // MARKET phase hook — a no-op until Phase 3 ships the real market
  RR.progression = { __stub: true, checkEndConditions: noop };      // CLEANUP hook — a no-op until Phase 4 ships the real end conditions
  RR.assets = group(3, { buyStock: 'Trading', sellStock: 'Trading' });
  RR.debt = group(3, { borrow: 'The bank', repay: 'The bank' });

  // RR.auth, RR.cloud, RR.sync, RR.entitlements are intentionally NOT defined (Phases 5–6): the UI renders its OFFLINE state when they are absent.
})(window.RR);
