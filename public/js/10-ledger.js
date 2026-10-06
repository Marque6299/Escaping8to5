/* RAT RACE · 10-ledger.js · RR.ledger.recompute(state) → derived  (F3, F3b, F5, F5b, F6, F7).
   Pure: reads state, returns a NEW derived object; never mutates. RR.store writes it after every commit (R7). */
(function (RR) {
  'use strict';

  var U = RR.util, L = RR.ledger = {};

  // ── Health (F17 tiers; the full health engine arrives in Phase 2 but the ledger needs the tier for F3b) ──
  L.healthTier = function (value) {
    var tiers = RR.config.health.tiers;
    for (var i = 0; i < tiers.length; i++) { if (value >= tiers[i][0]) { return tiers[i][1]; } }
    return tiers[tiers.length - 1][1];
  };
  L.healthFactor = function (tier) {
    var f = RR.config.health.salaryFactor[tier];
    return typeof f === 'number' ? f : 1;
  };

  // Relationship tier (F19 table keys). config.npc.tiers is ordered high → low: [[60,'TRUSTED'],[20,'FRIENDLY'],[-9,'NEUTRAL'],[-39,'COLD'],[-100,'HOSTILE']].
  L.npcTier = function (relationship) {
    var tiers = RR.config.npc.tiers;
    for (var i = 0; i < tiers.length; i++) { if (relationship >= tiers[i][0]) { return tiers[i][1]; } }
    return tiers[tiers.length - 1][1];
  };

  // F3 + F3b. Exposed because Phase 2's payday preview and the Life tab need the same number.
  L.salaryNow = function (state) {
    var fin = state.player.financials, mods = fin.modifiers || [], mult = 1, add = 0;
    for (var i = 0; i < mods.length; i++) {
      var m = mods[i];
      if (m.target !== 'SALARY') { continue; }
      if (m.mode === 'MULTIPLY') { mult *= m.value; } else if (m.mode === 'ADD') { add += m.value; }
    }
    var tier = L.healthTier(state.player.health ? state.player.health.value : RR.config.health.start);
    return Math.max(0, U.roundMoney((fin.salary * mult + add) * L.healthFactor(tier)));
  };

  L.lifestyleNow = function (state) {
    var fin = state.player.financials, li = RR.config.economy.lifestyleInflation, idx = 1;
    if (li && li.enabled) { idx = 1 + li.passThrough * (state.market.economy.inflationIndex - 1); }
    return U.roundMoney(fin.baseLifestyleExpense * idx);
  };

  function ratio(num, den) {                               // capped so "months" never becomes Infinity/NaN
    var cap = RR.config.ledger.ratioCap;
    if (den > 0) { return Math.min(cap, U.round2(num / den)); }
    return num > 0 ? cap : 0;
  }
  function floor2(x) { return Math.floor(x * 100 + 1e-9) / 100; }     // epsilon: 28.07 must not become 28.06

  L.recompute = function (state) {
    var cfg = RR.config, fin = state.player.financials, market = state.market, inv = state.inventory, V = RR.valuation;
    var mods = fin.modifiers || [], debts = fin.liabilities || [], deposits = fin.deposits || [];
    var i;

    // ── income ──
    var salary = L.salaryNow(state);
    var dividends = 0, stocksValue = 0;
    for (i = 0; i < inv.stocks.length; i++) { dividends += V.dividendsMonthly(inv.stocks[i], market); stocksValue += V.stockValue(inv.stocks[i], market); }
    var interest = 0, depositsTotal = 0;
    for (i = 0; i < deposits.length; i++) { interest += U.roundMoney(deposits[i].balance * deposits[i].apy / 12); depositsTotal += deposits[i].balance; }

    var reFlow = 0, bizFlow = 0, drag = 0, reValue = 0, bizValue = 0, net;
    for (i = 0; i < inv.realEstate.length; i++) {
      net = V.assetNetCashflow('RE', inv.realEstate[i], state);
      if (net >= 0) { reFlow += net; } else { drag += -net; }
      reValue += V.reValue(inv.realEstate[i], market);
    }
    for (i = 0; i < inv.businesses.length; i++) {
      net = V.assetNetCashflow('BIZ', inv.businesses[i], state);
      if (net >= 0) { bizFlow += net; } else { drag += -net; }
      bizValue += V.bizValue(inv.businesses[i], market);
    }

    var otherIncome = 0, otherExpense = 0;
    for (i = 0; i < mods.length; i++) {
      if (mods[i].mode !== 'ADD') { continue; }
      if (mods[i].target === 'INCOME') { otherIncome += mods[i].value; } else if (mods[i].target === 'EXPENSE') { otherExpense += mods[i].value; }
    }
    var passive = dividends + interest + reFlow + bizFlow;
    var totalIncome = salary + passive + otherIncome;

    // ── expenses ──
    var taxes = U.roundMoney(cfg.tax.salaryRate * salary + cfg.tax.passiveRate * passive);
    var lifestyle = L.lifestyleNow(state);
    var children = (fin.childCount || 0) * cfg.child.monthlyCost;
    var debtService = 0;
    for (i = 0; i < debts.length; i++) { if (!debts[i].collateralAssetId) { debtService += RR.finance.scheduledPayment(debts[i]); } }
    var plan = cfg.health.insurance[(state.player.health && state.player.health.insurance) || 'NONE'];
    var insurance = plan ? plan.premium : 0;
    var totalExpenses = taxes + lifestyle + children + debtService + drag + insurance + otherExpense;

    // ── balance sheet (F6) ──
    var personal = 0;
    for (i = 0; i < fin.personalAssets.length; i++) { personal += fin.personalAssets[i].value; }
    var productive = stocksValue + reValue + bizValue;
    var assetsTotal = fin.cash + depositsTotal + productive + personal;
    var liabTotal = 0, byKind = {};
    for (i = 0; i < debts.length; i++) { liabTotal += debts[i].principal; byKind[debts[i].kind] = (byKind[debts[i].kind] || 0) + debts[i].principal; }
    var netWorth = assetsTotal - liabTotal;

    // ── escape (F7, strict) + Fast Track goal ──
    var met = passive > totalExpenses;
    var escProgress = totalExpenses > 0 ? U.clamp(floor2(100 * passive / totalExpenses), 0, 100) : 100;
    var goalPassive = (state.fastTrack && state.fastTrack.goalPassive) || 0;
    var goalProgress = (state.loop.mode === 'FAST_TRACK' && goalPassive > 0) ? U.clamp(floor2(100 * passive / goalPassive), 0, 100) : 0;
    var tier = L.healthTier(state.player.health ? state.player.health.value : cfg.health.start);

    return {
      income:   { salary: salary, dividends: dividends, realEstate: reFlow, business: bizFlow, passive: passive, other: otherIncome, total: totalIncome, interest: interest },
      expenses: { taxes: taxes, lifestyle: lifestyle, children: children, debtService: debtService, assetDrag: drag, other: otherExpense, total: totalExpenses, insurance: insurance },
      monthlyCashflow: totalIncome - totalExpenses,
      assets:   { cash: fin.cash, stocks: stocksValue, realEstate: reValue, business: bizValue, productive: productive, personal: personal, total: assetsTotal, deposits: depositsTotal },
      liabilities: { total: liabTotal, byKind: byKind },
      netWorth: netWorth,
      ratios:   { passiveCoverage: ratio(passive, totalExpenses), debtToIncome: ratio(debtService, totalIncome), liquidMonths: ratio(fin.cash, totalExpenses), emergencyMonths: ratio(fin.cash + depositsTotal, totalExpenses) },
      escape:   { met: met, passive: passive, expenses: totalExpenses, gap: Math.max(0, totalExpenses - passive), progressPct: escProgress },
      goal:     { passive: state.loop.mode === 'FAST_TRACK' ? passive : 0, goalPassive: goalPassive, progressPct: goalProgress },
      health:   { tier: tier, salaryFactor: L.healthFactor(tier) }
    };
  };
})(window.RR);
