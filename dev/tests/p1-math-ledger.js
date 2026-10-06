/* Acceptance tests 1–5 (§2.7), 12–15 (§2.8.7) and supporting unit tests for util / finance / valuation / ledger. */
(function () {
  'use strict';
  var U = RR.util, F = RR.finance, V = RR.valuation, L = RR.ledger;
  function starter() { return RR.dev.fixture('starter'); }

  T.test('1', 'finance.pmt: 85,000@6.5%/300=574 · 12,000@5%/96=152 · 9,000@7.5%/36=280', function () {
    T.eq(F.pmt(85000, 0.065, 300), 574); T.eq(F.pmt(12000, 0.05, 96), 152); T.eq(F.pmt(9000, 0.075, 36), 280);
    T.eq(F.pmt(1200, 0, 12), 100, 'zero-rate loans divide evenly');
  });

  T.test('2', 'Starter fixture derived values (Teacher reference profile)', function () {
    var s = starter(), d = s.derived;
    T.eq(d.income.salary, 3500); T.eq(d.expenses.taxes, 700); T.eq(d.expenses.debtService, 1081); T.eq(d.expenses.lifestyle, 800);
    T.eq(d.expenses.total, 2581); T.eq(d.monthlyCashflow, 919); T.eq(d.assets.total, 111000); T.eq(d.liabilities.total, 108500);
    T.eq(d.netWorth, 2500); T.eq(d.escape.met, false);
    T.eq(d.ratios.debtToIncome, 0.31); T.eq(d.ratios.liquidMonths, 1.16, 'ratios match the §1.5 example');
    T.eq(s.player.financials.liabilities.map(function (x) { return x.monthlyPayment; }).join(','), '574,152,280,75', 'payments computed by finance.pmt');
  });

  T.test('2b', 'All three professions start with +$600…+$1,800 monthly cash flow', function () {
    RR.data.professions.forEach(function (p) {
      var cf = RR.schema.create({ professionId: p.id, seed: 1 }).derived.monthlyCashflow;
      T.ok(cf >= 600 && cf <= 1800, p.id + ' cash flow ' + cf + ' out of range');
    });
  });

  T.test('3', 'Credit card step: 2,500 @21% → interest 44, payment 75, new principal 2,469', function () {
    var r = F.amortizeOnePeriod({ principal: 2500, apr: 0.21, structure: 'REVOLVING' });
    T.eq(r.interest, 44); T.eq(r.payment, 75); T.eq(r.newPrincipal, 2469); T.eq(r.closed, false);
  });

  T.test('3b', 'Amortizing final payment clears the residual; interest-only; APR pricing', function () {
    var debt = { structure: 'AMORTIZING', principal: 9000, apr: 0.075, termMonthsRemaining: 36, monthlyPayment: 280 }, n = 0;
    while (debt.principal > 0 && n < 100) {
      var r = F.amortizeOnePeriod(debt); n++;
      debt = { structure: 'AMORTIZING', principal: r.newPrincipal, apr: 0.075, termMonthsRemaining: r.newTerm, monthlyPayment: 280 };
      if (r.closed) { break; }
    }
    T.eq(n, 36, 'car loan is cleared on payment 36'); T.eq(debt.principal, 0);
    T.eq(F.amortizeOnePeriod({ structure: 'INTEREST_ONLY', principal: 12000, apr: 0.06, monthlyPayment: 60 }).payment, 60);
    T.near(F.offeredApr('HOME_MORTGAGE', 680, { baseRate: 0.05 }), 0.075, 1e-9, '0.05 base + 0.01 kind + 0.015 credit');
    T.near(F.offeredApr('CREDIT_CARD', 800, { baseRate: 0.05 }), 0.20, 1e-9);
    T.eq(F.creditSpread(760), 0); T.eq(F.creditSpread(300), 0.06);
  });

  T.test('4', 'escape_ready ⇒ escape.met; passive exactly equal to expenses ⇒ met false (strict)', function () {
    T.eq(RR.dev.fixture('escape_ready').derived.escape.met, true);
    var saved = { s: RR.config.tax.salaryRate, p: RR.config.tax.passiveRate };
    RR.config.tax.salaryRate = 0; RR.config.tax.passiveRate = 0;          // expenses become exactly lifestyle 800 + debt service 1,081 = 1,881
    try {
      var s = starter();
      s.player.financials.deposits.push({ id: 'dep_x1', kind: 'SAVINGS', label: 'Big', balance: 188100, apy: 0.12, openedTurn: 0, termMonths: null, maturityTurn: null });
      var d = L.recompute(s);
      T.eq(d.income.passive, 1881); T.eq(d.expenses.total, 1881); T.eq(d.escape.met, false, 'equal is not enough'); T.eq(d.escape.gap, 0);
      s.player.financials.deposits[0].balance = 188200;
      T.eq(L.recompute(s).escape.met, true, 'one dollar more flips it');
    } finally { RR.config.tax.salaryRate = saved.s; RR.config.tax.passiveRate = saved.p; }
  });

  T.test('5', 'Asset-linked debt: excluded from debtService, netted in the asset; negative flow → assetDrag, not passive', function () {
    var s = RR.dev.fixture('rich_rat_race'), d = s.derived;
    T.eq(d.expenses.debtService, 1081, 'only the four personal loans');
    var re = s.inventory.realEstate[0], mort = s.player.financials.liabilities.filter(function (x) { return x.collateralAssetId === re.id; })[0];
    T.ok(mort, 'mortgage is linked');
    T.eq(V.assetNetCashflow('RE', re, s), 1500 - 450 - mort.monthlyPayment); T.eq(d.income.realEstate, 379);
    re.baseMonthlyRent = 500;                                              // net = 500 − 450 − 671 = −621
    var d2 = L.recompute(s);
    T.eq(d2.income.realEstate, 0, 'a losing property is not passive income'); T.eq(d2.expenses.assetDrag, 621);
    T.eq(d2.income.passive, d.income.passive - 379, 'passive drops by exactly the old property income');
  });

  T.test('12', 'Interest ledger: healthy_saver → interest 13, passive 13, taxes 701, cash flow 931', function () {
    var d = RR.dev.fixture('healthy_saver').derived;
    T.eq(d.income.interest, 13); T.eq(d.income.passive, 13); T.eq(d.expenses.taxes, 701); T.eq(d.monthlyCashflow, 931);
    T.eq(d.assets.deposits, 10000); T.eq(d.assets.total, 121000); T.eq(d.netWorth, 12500);
  });

  T.test('13', 'Health factor tiers (70 GOOD · 69 FAIR · 39 POOR → salary 3,150 · 0 CRITICAL → 0) and insurance expense', function () {
    function at(v) { var s = starter(); s.player.health.value = v; return L.recompute(s); }
    T.eq(at(70).health.tier, 'GOOD'); T.eq(at(69).health.tier, 'FAIR'); T.eq(at(40).health.tier, 'FAIR'); T.eq(at(39).health.tier, 'POOR');
    T.eq(at(39).income.salary, 3150); T.eq(at(69).income.salary, 3500); T.eq(at(0).health.tier, 'CRITICAL'); T.eq(at(0).income.salary, 0);
    var s = starter(); s.player.health.insurance = 'STANDARD';
    var d = L.recompute(s);
    T.eq(d.expenses.insurance, 120); T.eq(d.expenses.total, 2581 + 120 - 0 + (d.expenses.taxes - 700), 'premium is inside total');
    s.player.health.insurance = 'COMPREHENSIVE'; T.eq(L.recompute(s).expenses.insurance, 260);
  });

  T.test('14', 'Lifestyle inflation: index 1.10 · passThrough .5 ⇒ 840; disabled ⇒ 800', function () {
    var s = starter(); s.market.economy.inflationIndex = 1.10;
    T.eq(L.recompute(s).expenses.lifestyle, 840);
    var li = RR.config.economy.lifestyleInflation, was = li.enabled;
    li.enabled = false;
    try { T.eq(L.recompute(s).expenses.lifestyle, 800); } finally { li.enabled = was; }
  });

  T.test('15', 'Condition factors: 60 ⇒ 116,400 / 1,425 · 20 ⇒ 96,000 / 1,050 · BASIC 50 · FULL 120 · insured 50', function () {
    var s = starter();
    var a = { id: 're_t', name: 'T', kind: 'DUPLEX', purchasePrice: 120000, downPayment: 24000, purchaseTurn: 0, baseMonthlyRent: 1500, baseMonthlyOpex: 450, priceIndexAtPurchase: 1, rentIndexAtPurchase: 1,
              inflationIndexAtPurchase: 1, vacantTurnsLeft: 0, condition: 60, maintenancePlan: 'NONE', insured: false, inspected: true, rentBoostPct: 0, debtId: null };
    T.eq(V.reValue(a, s.market), 116400); T.eq(V.reRent(a, s.market), 1425);
    a.condition = 20; T.eq(V.reValue(a, s.market), 96000); T.eq(V.reRent(a, s.market), 1050);
    a.condition = 85; T.eq(V.reValue(a, s.market), 120000); T.eq(V.reRent(a, s.market), 1500);
    a.maintenancePlan = 'BASIC'; T.eq(V.maintenanceCost(a, s.market), 50);
    a.maintenancePlan = 'FULL'; T.eq(V.maintenanceCost(a, s.market), 120);
    a.maintenancePlan = 'NONE'; a.insured = true; T.eq(V.insuranceCost(a, s.market), 50);
    a.vacantTurnsLeft = 2; T.eq(V.reRent(a, s.market), 0, 'vacant ⇒ no rent');
  });

  T.test('15b', 'Business valuation: floor at 25% of price; closed business earns nothing', function () {
    var s = starter(), b = { id: 'biz_t', name: 'B', kind: 'LAUNDROMAT', purchasePrice: 60000, downPayment: 20000, purchaseTurn: 0, baseMonthlyRevenue: 4200, baseMonthlyCosts: 3300, revenueIndex: 1,
                              inflationIndexAtPurchase: 1, riskSigma: 0.2, closedTurnsLeft: 0, condition: 80, maintenancePlan: 'NONE', insured: false, inspected: true, debtId: null };
    T.eq(V.bizRevenue(b, s.market) - V.bizCosts(b, s.market), 900);
    T.eq(V.bizValue(b, s.market), Math.round(12 * 900 * 4.0), 'businessMultiple 4.0 at start');
    b.revenueIndex = 0.1; T.eq(V.bizValue(b, s.market), 15000, '25% floor');
    b.closedTurnsLeft = 1; T.eq(V.bizRevenue(b, s.market), 0);
  });

  T.test('U1', 'util.fmt: money, signed, pct, date, rounding (no −0)', function () {
    T.eq(U.fmt.money(1234), '$1,234'); T.eq(U.fmt.money(-1234), '\u2212$1,234'); T.eq(U.fmt.money(1234, { signed: true }), '+$1,234');
    T.eq(U.fmt.money(1250000, { compact: true }), '$1.3M'); T.eq(U.fmt.money(NaN), '\u2014');
    T.eq(U.fmt.pct(0.125), '12.5%'); T.eq(U.fmt.ratio(1.1623), '1.16'); T.eq(U.fmt.int(1234567), '1,234,567');
    T.eq(U.fmt.date(1), 'Year 1 \u00b7 Jan'); T.eq(U.fmt.date(12), 'Year 1 \u00b7 Dec'); T.eq(U.fmt.date(13), 'Year 2 \u00b7 Jan'); T.eq(U.fmt.date(0), 'Year 1 \u00b7 Start');
    T.ok(!Object.is(U.roundMoney(-0.2), -0), 'roundMoney never returns −0'); T.eq(U.round2(1.005 + 1e-12), 1.01);
    T.eq(U.clamp(5, 0, 3), 3); T.eq(U.getPath({ a: { b: [{ c: 7 }] } }, 'a.b.0.c'), 7);
  });

  T.test('U2', 'util.cleanString strips control/bidi characters and caps length (R19)', function () {
    T.eq(U.cleanString('  A\u0000l\u202Eex  \n x ', 24, 'Alex'), 'Alex x', 'invisible characters are removed, whitespace collapses');
    T.eq(U.cleanString('', 24, 'Alex'), 'Alex'); T.eq(U.cleanString('x'.repeat(100), 24).length, 24);
    var issues = U.jsonIssues({ a: undefined, b: NaN, c: function () {}, d: new Date() });
    T.ok(issues.length >= 4, 'finds undefined, NaN, function and non-plain objects');
    T.eq(U.jsonIssues(JSON.parse('{"__proto__": {"x": 1}}')).length, 1, 'prototype-pollution key is flagged');
  });

  T.test('U3', 'util.setPath refuses prototype-pollution keys', function () {
    T.throws(function () { U.setPath({}, '__proto__.polluted', 1); });
    T.ok(({}).polluted === undefined);
  });

  T.test('B1', 'bus: on/once/off, listener errors are isolated', function () {
    var calls = 0, once = 0, spyErr = console.error; console.error = function () {};
    try {
      var off = RR.bus.on('ui:toast', function () { calls++; });
      RR.bus.once('ui:toast', function () { once++; });
      RR.bus.on('ui:toast', function () { throw new Error('bad listener'); });
      RR.bus.emit('ui:toast', {}); RR.bus.emit('ui:toast', {});
      T.eq(calls, 2); T.eq(once, 1); T.ok(RR.bus.errors.length >= 1);
      off(); RR.bus.emit('ui:toast', {}); T.eq(calls, 2);
    } finally { console.error = spyErr; RR.bus.off('ui:toast'); RR.ui.overlays.init(); }
  });
})();
