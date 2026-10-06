/* RAT RACE · 18-dev.js · RR.dev — fixtures + the Ctrl+Shift+D developer drawer (§2.1 step 1.11).
   Fixtures are deterministic, fully valid v2 states built through RR.schema.create (fixed timestamps, fixed ids) so tests and screenshots are stable.
   The drawer is disabled when RR.env.name === 'prod'. Every state change it makes goes through RR.store (R3). */
(function (RR) {
  'use strict';

  var U = RR.util, dom = RR.ui.dom, h = dom.h;
  var dev = RR.dev = {};
  var FIXED_ISO = '2026-10-02T00:00:00.000Z';

  // ── fixture helpers (operate on a FRESH state object, never the live one) ──
  function addDeposit(s, balance, apy, label) {
    var d = { id: U.uid(s, 'dep'), kind: 'SAVINGS', label: label || 'Everyday Saver', balance: balance, apy: apy, openedTurn: 0, termMonths: null, maturityTurn: null };
    s.player.financials.deposits.push(d); return d;
  }
  function addStock(s, symbol, shares) {
    var q = RR.valuation.stockPrice(symbol, s.market);
    var h2 = { id: U.uid(s, 'st'), symbol: symbol, shares: shares, avgCost: q.price, openedTurn: 0 };
    s.inventory.stocks.push(h2); return h2;
  }
  function addDebt(s, o) {
    var d = { id: U.uid(s, 'd'), kind: o.kind, label: o.label, structure: 'AMORTIZING', principal: o.principal, originalPrincipal: o.principal, apr: o.apr,
              termMonthsRemaining: o.term, monthlyPayment: 0, collateralAssetId: o.assetId, originTurn: 0, prepayable: true, status: 'CURRENT' };
    d.monthlyPayment = RR.finance.initialPayment(d);
    s.player.financials.liabilities.push(d); return d;
  }
  function addRealEstate(s, o) {
    var a = { id: U.uid(s, 're'), name: o.name, kind: o.kind, purchasePrice: o.price, downPayment: o.down, purchaseTurn: 0, baseMonthlyRent: o.rent, baseMonthlyOpex: o.opex,
              priceIndexAtPurchase: 1, rentIndexAtPurchase: 1, inflationIndexAtPurchase: 1, vacantTurnsLeft: 0, condition: o.condition || 80, maintenancePlan: 'NONE',
              insured: false, inspected: true, rentBoostPct: 0, debtId: null };
    s.inventory.realEstate.push(a);
    if (o.loan) { a.debtId = addDebt(s, { kind: 'PROPERTY_MORTGAGE', label: o.name + ' Mortgage', principal: o.loan, apr: 0.075, term: 360, assetId: a.id }).id; }
    return a;
  }
  function addBusiness(s, o) {
    var a = { id: U.uid(s, 'biz'), name: o.name, kind: o.kind, purchasePrice: o.price, downPayment: o.down, purchaseTurn: 0, baseMonthlyRevenue: o.revenue, baseMonthlyCosts: o.costs,
              revenueIndex: 1, inflationIndexAtPurchase: 1, riskSigma: 0.2, closedTurnsLeft: 0, condition: 80, maintenancePlan: 'NONE', insured: false, inspected: true, debtId: null };
    s.inventory.businesses.push(a);
    if (o.loan) { a.debtId = addDebt(s, { kind: 'BUSINESS_LOAN', label: o.name + ' Loan', principal: o.loan, apr: 0.09, term: 120, assetId: a.id }).id; }
    return a;
  }

  function base(name) {
    var s = RR.schema.create({ name: 'Alex', professionId: 'teacher', dreamId: 'island_resort', seed: 20261002, settings: RR.config.settings.defaults });
    s.meta.gameId = 'rr_fixture_' + name; s.meta.createdAt = FIXED_ISO; s.meta.updatedAt = FIXED_ISO;
    s.loop.status = 'RUNNING';
    return s;
  }

  var BUILDERS = {
    starter: function () { return base('starter'); },

    rich_rat_race: function () {
      var s = base('rich_rat_race');
      s.loop.turn = 18; s.player.financials.cash = 25000; s.player.health.value = 85;
      addDeposit(s, 15000, 0.03, 'Rainy Day Saver');
      addStock(s, 'UTLX', 200); addStock(s, 'STPL', 100); addStock(s, 'MEDX', 50);
      addRealEstate(s, { name: 'Maple St Duplex', kind: 'DUPLEX', price: 120000, down: 24000, rent: 1500, opex: 450, condition: 85, loan: 96000 });
      addBusiness(s, { name: 'SpinCycle Laundromat', kind: 'LAUNDROMAT', price: 60000, down: 20000, revenue: 4200, costs: 3300, loan: 40000 });
      s.stats.peakNetWorth = 60000;
      [[16, 'TRADE', 'Bought 200 UTLX', -9600], [17, 'EVENT', 'Rent came in early at Maple St', 1500], [18, 'PAYDAY', 'Payday: cash flow after expenses', 1180]]
        .forEach(function (l) { s.loop.turn = l[0]; s.log.push({ turn: l[0], kind: l[1], text: l[2], delta: l[3] }); });
      s.loop.turn = 18;
      return s;
    },

    escape_ready: function () {
      var s = base('escape_ready');
      s.loop.turn = 40; s.player.financials.cash = 20000;
      addRealEstate(s, { name: 'Harbor View Duplex', kind: 'DUPLEX', price: 220000, down: 220000, rent: 2200, opex: 500, condition: 90 });
      addRealEstate(s, { name: 'Elm Court Duplex', kind: 'DUPLEX', price: 220000, down: 220000, rent: 2200, opex: 500, condition: 90 });
      return s;
    },

    broke: function () {
      var s = base('broke');
      s.player.financials.cash = 0; s.player.financials.creditScore = 640;
      s.player.financials.modifiers.push({ id: U.uid(s, 'm'), label: 'Laid off', target: 'SALARY', mode: 'MULTIPLY', value: 0, turnsLeft: 6, sourceTemplateId: null });
      return s;
    },

    healthy_saver: function () {
      var s = base('healthy_saver');
      addDeposit(s, 10000, 0.015, 'Everyday Saver');
      return s;
    },

    neglected: function () {
      var s = base('neglected');
      s.loop.turn = 30; s.player.health.value = 25; s.player.financials.cash = 200;
      return s;
    }
  };

  dev.fixtureNames = Object.keys(BUILDERS);
  dev.fixture = function (name) {
    if (!BUILDERS[name]) { throw new Error('RR.dev.fixture: unknown fixture "' + name + '"'); }
    var s = BUILDERS[name]();
    s.derived = RR.ledger.recompute(s);
    return s;
  };
  dev.enabled = function () { return !(RR.env && RR.env.name === 'prod'); };

  dev.load = function (name) {
    if (!dev.enabled()) { return U.fail('FORBIDDEN', 'Developer tools are off in production.'); }
    var s;
    try { s = dev.fixture(name); } catch (e) { return U.fail('NOT_FOUND', 'No such fixture.'); }
    RR.store.replace(s, 'dev.load:' + name);
    if (RR.ui.screens && RR.ui.screens.visible()) { RR.ui.screens.hide(); }
    return U.ok(name);
  };
  dev.setCash = function (n) {
    if (!dev.enabled()) { return U.fail('FORBIDDEN', 'Developer tools are off in production.'); }
    var v = Number(n);
    if (!U.isNum(v)) { return U.fail('INVALID_ARGS', 'Cash must be a number.'); }
    return RR.store.commit('dev.setCash', function (s) { s.player.financials.cash = U.roundMoney(v); });
  };
  dev.recompute = function () { return RR.store.commit('dev.recompute', function () { /* the commit pipeline recomputes derived */ }); };
  dev.dump = function () { var s = RR.store.get(); return s ? JSON.stringify(s, null, 2) : 'null'; };

  // ── drawer ──
  var drawer = null, out = null;
  function build() {
    var sel = h('select', { id: 'dev-fixture', attrs: { 'aria-label': 'Fixture' } }, dev.fixtureNames.map(function (n) { return h('option', { text: n, attrs: { value: n } }); }));
    var cash = h('input', { class: 'input', id: 'dev-cash', attrs: { type: 'number', step: '100', 'aria-label': 'Cash amount', placeholder: 'cash' }, style: { width: '140px' } });
    out = h('pre', { id: 'dev-out', attrs: { 'aria-live': 'polite' }, text: 'Dump state to see it here.' });
    drawer = h('aside', { class: 'devdrawer panel', id: 'dev-drawer', attrs: { role: 'region', 'aria-label': 'Developer tools', hidden: true } },
      h('div', { class: 'devdrawer__head' }, RR.ui.icon('ic_wrench', { size: 18 }), h('h2', { text: 'Dev tools (Ctrl+Shift+D)' }),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', attrs: { type: 'button', 'aria-label': 'Close developer tools' }, on: { click: function () { dev.toggle(false); } } }, RR.ui.icon('ic_close', { size: 16 }))),
      h('div', { class: 'devdrawer__body' },
        h('div', { class: 'devdrawer__row' }, sel, h('button', { class: 'btn', attrs: { type: 'button' }, text: 'Load fixture', on: { click: function () { var r = dev.load(sel.value); out.textContent = r.ok ? 'Loaded ' + sel.value : r.message; } } })),
        h('div', { class: 'devdrawer__row' }, cash, h('button', { class: 'btn', attrs: { type: 'button' }, text: 'Set cash', on: { click: function () { var r = dev.setCash(cash.value); out.textContent = r.ok ? 'Cash set.' : r.message; } } })),
        h('div', { class: 'devdrawer__row' },
          h('button', { class: 'btn', attrs: { type: 'button' }, text: 'Run recompute', on: { click: function () { var r = dev.recompute(); out.textContent = r.ok ? 'Recomputed derived (revision ' + RR.store.get().meta.revision + ').' : r.message; } } }),
          h('button', { class: 'btn', attrs: { type: 'button' }, text: 'Dump state', on: { click: function () { out.textContent = dev.dump(); } } })),
        out));
    document.getElementById('stage').appendChild(drawer);
  }
  dev.toggle = function (force) {
    if (!dev.enabled()) { return false; }
    if (!drawer) { build(); }
    drawer.hidden = force === undefined ? !drawer.hidden : !force;
    if (!drawer.hidden) { var f = drawer.querySelector('select'); if (f) { f.focus(); } }
    return !drawer.hidden;
  };
  dev.isOpen = function () { return !!drawer && !drawer.hidden; };

  dev.init = function () {
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) { e.preventDefault(); dev.toggle(); }
    });
  };
})(window.RR);
