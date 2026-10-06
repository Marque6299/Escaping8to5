/* RAT RACE · 09-valuation.js · RR.valuation — pure asset valuation (F4 + F4b incl. condition). No state mutation, no rng.
   Functions take the `market` slice (state.market) unless noted. Missing optional fields default safely so v1-shaped fixtures work. */
(function (RR) {
  'use strict';

  var U = RR.util;
  var V = RR.valuation = {};

  function band(bands, c) {
    for (var i = 0; i < bands.length; i++) { if (c >= bands[i][0]) { return bands[i][1]; } }
    return bands[bands.length - 1][1];
  }
  function cond(a) { return typeof a.condition === 'number' ? a.condition : 100; }            // no condition field → pristine

  V.rentFactor  = function (c) { return band(RR.config.property.conditionBands.rent, c); };
  V.valueFactor = function (c) { return band(RR.config.property.conditionBands.value, c); };

  // assetBase = round(purchasePrice · inflationIndex / inflationIndexAtPurchase): the stable base for % costs (F4b).
  V.assetBase = function (a, market) {
    var idxNow = market.economy.inflationIndex, idx0 = a.inflationIndexAtPurchase || 1;
    return U.roundMoney(a.purchasePrice * idxNow / idx0);
  };
  V.maintenanceCost = function (a, market) {
    var plan = RR.config.property.maintenance[a.maintenancePlan || 'NONE'];
    return plan ? U.roundMoney(V.assetBase(a, market) * plan.costPctYear / 12) : 0;
  };
  V.insuranceCost = function (a, market) {
    return a.insured ? U.roundMoney(V.assetBase(a, market) * RR.config.property.insurance.ratePctYear / 12) : 0;
  };
  function inflatedOpex(base, a, market) {
    return U.roundMoney(base * market.economy.inflationIndex / (a.inflationIndexAtPurchase || 1));
  }

  // ── Stocks ──
  V.stockPrice = function (symbol, market) {
    var list = market.stocks || [];
    for (var i = 0; i < list.length; i++) { if (list[i].symbol === symbol) { return list[i]; } }
    return null;
  };
  V.stockValue = function (h, market) {
    var s = V.stockPrice(h.symbol, market);
    return s ? U.roundMoney(h.shares * s.price) : 0;
  };
  V.dividendsMonthly = function (h, market) {
    var s = V.stockPrice(h.symbol, market);
    return s ? U.roundMoney(h.shares * s.dpsAnnual / 12) : 0;
  };

  // ── Real estate ──
  V.reValue = function (a, market) {
    var c = cond(a);
    return U.roundMoney(a.purchasePrice * market.indices.realEstatePrice / (a.priceIndexAtPurchase || 1) * V.valueFactor(c));
  };
  V.reRent = function (a, market) {
    if ((a.vacantTurnsLeft || 0) > 0) { return 0; }
    var c = cond(a);
    return U.roundMoney(a.baseMonthlyRent * market.indices.realEstateRent / (a.rentIndexAtPurchase || 1) * (1 + (a.rentBoostPct || 0)) * V.rentFactor(c));
  };
  V.reOpex = function (a, market) {
    return inflatedOpex(a.baseMonthlyOpex, a, market) + V.maintenanceCost(a, market) + V.insuranceCost(a, market);
  };

  // ── Businesses ──
  V.bizRevenue = function (a, market) {
    if ((a.closedTurnsLeft || 0) > 0) { return 0; }
    return U.roundMoney(a.baseMonthlyRevenue * (typeof a.revenueIndex === 'number' ? a.revenueIndex : 1) * V.rentFactor(cond(a)));
  };
  V.bizCosts = function (a, market) {
    return inflatedOpex(a.baseMonthlyCosts, a, market) + V.maintenanceCost(a, market) + V.insuranceCost(a, market);
  };
  V.bizValue = function (a, market) {
    var floor = U.roundMoney(0.25 * a.purchasePrice);
    var earn = U.roundMoney(12 * (V.bizRevenue(a, market) - V.bizCosts(a, market)) * market.indices.businessMultiple);
    return Math.max(floor, earn);
  };

  // ── Debt linkage ──
  function linkedDebts(assetId, liabilities) {
    var out = [];
    for (var i = 0; i < (liabilities || []).length; i++) { if (liabilities[i].collateralAssetId === assetId) { out.push(liabilities[i]); } }
    return out;
  }
  V.linkedDebts = linkedDebts;
  V.linkedPayment = function (assetId, liabilities) {
    var t = 0, list = linkedDebts(assetId, liabilities);
    for (var i = 0; i < list.length; i++) { t += RR.finance.scheduledPayment(list[i]); }
    return t;
  };
  V.linkedDebtPayment = V.linkedPayment;                            // name used in the plan's API listing (§1.4)
  V.linkedPrincipal = function (assetId, liabilities) {
    var t = 0, list = linkedDebts(assetId, liabilities);
    for (var i = 0; i < list.length; i++) { t += list[i].principal; }
    return t;
  };

  // kind: 'RE' | 'BIZ'. `state` is a full game state (needs market + player.financials.liabilities).
  V.assetValue = function (kind, a, state) { return kind === 'RE' ? V.reValue(a, state.market) : V.bizValue(a, state.market); };
  V.assetGrossFlow = function (kind, a, state) {                      // before linked debt
    return kind === 'RE' ? V.reRent(a, state.market) - V.reOpex(a, state.market)
                         : V.bizRevenue(a, state.market) - V.bizCosts(a, state.market);
  };
  // assetNet_i = (rent − opex | revenue − costs) − linkedDebtPayment_i   (F5)
  V.assetNetCashflow = function (kind, a, state) {
    return V.assetGrossFlow(kind, a, state) - V.linkedPayment(a.id, state.player.financials.liabilities);
  };
  V.assetEquity = function (kind, a, state) {
    return V.assetValue(kind, a, state) - V.linkedPrincipal(a.id, state.player.financials.liabilities);
  };
})(window.RR);
