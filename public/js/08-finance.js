/* RAT RACE · 08-finance.js · RR.finance — pure debt math (F1, F2, APR pricing). No state, no DOM, no rng. */
(function (RR) {
  'use strict';

  var U = RR.util;
  var F = RR.finance = {};

  // F1 — amortizing payment: round(P·r / (1 − (1+r)^−n)), r = apr/12; r = 0 → round(P/n).
  F.pmt = function (principal, apr, nMonths) {
    if (!(nMonths > 0)) { return U.roundMoney(principal); }
    var r = apr / 12;
    if (r === 0) { return U.roundMoney(principal / nMonths); }
    return U.roundMoney(principal * r / (1 - Math.pow(1 + r, -nMonths)));
  };

  F.monthlyInterest = function (principal, apr) { return U.roundMoney(principal * apr / 12); };

  // Revolving minimum: max(floor, round(pct · principal)) — before interest is added (F2).
  F.revolvingMinimum = function (principal) {
    var c = RR.config.creditCard;
    return Math.max(c.minPaymentFloor, U.roundMoney(c.minPaymentPct * principal));
  };

  // The payment a brand-new debt would carry (used by schema.create and, in later phases, by RR.debt when issuing loans).
  F.initialPayment = function (d) {
    if (d.structure === 'AMORTIZING') { return F.pmt(d.principal, d.apr, d.termMonthsRemaining); }
    if (d.structure === 'INTEREST_ONLY') { return F.monthlyInterest(d.principal, d.apr); }
    return Math.min(d.principal + F.monthlyInterest(d.principal, d.apr), F.revolvingMinimum(d.principal));
  };

  // F2 — one period. Pure: returns what WOULD happen; the caller (RR.payday, Phase 2) applies it inside a commit.
  //   → { interest, payment, principalPaid, newPrincipal, newTerm, closed }
  F.amortizeOnePeriod = function (debt) {
    var principal = Math.max(0, debt.principal);
    var interest = F.monthlyInterest(principal, debt.apr);
    var payment, newTerm = debt.termMonthsRemaining;

    if (debt.structure === 'AMORTIZING') {
      payment = Math.min(debt.monthlyPayment, principal + interest);
      newTerm = Math.max(0, (debt.termMonthsRemaining || 0) - 1);
      if (newTerm === 0) { payment = principal + interest; }          // final payment clears any rounding residual
    } else if (debt.structure === 'INTEREST_ONLY') {
      payment = interest;
    } else {                                                           // REVOLVING
      payment = Math.min(principal + interest, F.revolvingMinimum(principal));
    }

    var principalPaid = payment - interest;                            // negative when a card's minimum doesn't cover interest
    var newPrincipal = principal - principalPaid;
    if (debt.structure === 'REVOLVING') { newPrincipal = principal + interest - payment; }
    if (newPrincipal < 0) { newPrincipal = 0; }
    return {
      interest: interest, payment: payment, principalPaid: principalPaid,
      newPrincipal: newPrincipal, newTerm: newTerm, closed: newPrincipal <= 0
    };
  };

  // finance.scheduledPayment(debt) = the payment amortizeOnePeriod would make right now (used by the ledger).
  F.scheduledPayment = function (debt) { return F.amortizeOnePeriod(debt).payment; };

  // APR pricing ───────────────────────────────────────────────────────────
  F.creditSpread = function (score) {
    var bands = RR.config.credit.aprSpreadBands;
    for (var i = 0; i < bands.length; i++) { if (score >= bands[i][0]) { return bands[i][1]; } }
    return bands[bands.length - 1][1];
  };

  // offeredApr(kind, creditScore, economy, adj?) = economy.baseRate + aprSpreadByKind[kind] + creditSpread(score) + adj  (4 dp)
  // `economy` should be RR.market.effectiveEconomy(state) once Phase 3 ships; any object with baseRate works.
  F.offeredApr = function (kind, creditScore, economy, adj) {
    var kindSpread = RR.config.aprSpreadByKind[kind];
    if (typeof kindSpread !== 'number') { RR.warnOnce('apr:' + kind, 'finance.offeredApr: unknown debt kind "' + kind + '"'); kindSpread = 0; }
    var base = economy && typeof economy.baseRate === 'number' ? economy.baseRate : 0;
    return U.round4(base + kindSpread + F.creditSpread(creditScore) + (adj || 0));
  };
})(window.RR);
