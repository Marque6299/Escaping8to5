/* RAT RACE · 16-ui-panels.js · RR.ui.panels — the Living Ledger (§2.4, §2.8.5).
   Panels are built once with RR.ui.dom (no innerHTML) and wired with the binder grammar (§2.3); keyed lists use <template>s from index.html.
   Panels never mutate state (R2): buttons carry data-action names that resolve through the RR.ui.actions whitelist (R20). */
(function (RR) {
  'use strict';

  var U = RR.util, dom = RR.ui.dom, h = dom.h, binder = RR.ui.binder, actions = RR.ui.actions, V = RR.valuation;
  var P = RR.ui.panels = {};

  function icon(n, s, tone) { return RR.ui.icon(n, { size: s || 18, tone: tone }); }
  function money(n) { return U.fmt.money(n); }
  function game() { return RR.store.get(); }

  // ── row builders ────────────────────────────────────────────────────────────────────
  var dimRows = [];                                   // { row, path } — conditional rows render dimmed (not hidden) at 0 (§2.4)
  function valueNode(path, o) {
    o = o || {};
    var attrs = { 'data-bind': path, 'data-fmt': o.fmt || 'money' };
    if (o.tween !== false) { attrs['data-tween'] = ''; }
    if (o.tone) { attrs['data-tone'] = 'auto'; }
    if (o.live) { attrs['aria-live'] = 'polite'; attrs['aria-atomic'] = 'true'; }                 // R11: ledger totals are polite live regions
    return h('b', { class: 'val', attrs: attrs });
  }
  function labelNode(text, glossary) { return h('span', { class: 'lbl', text: text, attrs: glossary ? { 'data-glossary': glossary } : {} }); }
  function row(o) {
    var el = h('div', { class: 'row' + (o.cls ? ' ' + o.cls : '') }, labelNode(o.label, o.glossary), valueNode(o.path, o));
    if (o.cond) { dimRows.push({ row: el, path: o.path }); }
    return el;
  }
  function sect(title, children) { return h('div', { class: 'sect' }, h('h3', { class: 'sect__title', text: title }), children); }
  function sub(title) { return h('div', { class: 'sect__sub', text: title }); }
  function listHost(name) { return h('div', { class: 'list', data: { list: name } }); }

  // ═════════════════════════════════ Freedom & Health meters ═════════════════════════════════
  P.freedomMeter = { mount: function (el) {
    var meter = h('div', { class: 'meter meter--passive', id: 'freedom-meter', attrs: { role: 'meter', 'aria-label': 'Freedom meter: passive income as a share of expenses', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 } },
      h('span', { class: 'meter__fill', attrs: { 'data-width-pct': 'derived.escape.progressPct' } }), h('span', { class: 'meter__marker', attrs: { 'aria-hidden': 'true' } }));
    el.className = (el.className + ' freedom').trim();
    el.appendChild(h('div', { class: 'freedom__top' },
      h('span', { class: 'freedom__title' }, icon('ic_key', 16), h('span', { text: 'Freedom Meter', attrs: { 'data-glossary': 'escape' } })),
      h('b', { class: 'freedom__pct', attrs: { 'data-bind': 'derived.escape.progressPct', 'data-fmt': 'pctPoints' } })));
    el.appendChild(meter);
    el.appendChild(h('div', { class: 'freedom__label' },
      h('span', { text: 'Passive', attrs: { 'data-glossary': 'passive_income' } }), ' ', h('b', { attrs: { 'data-bind': 'derived.income.passive', 'data-fmt': 'money' } }),
      ' / ', h('span', { text: 'Expenses' }), ' ', h('b', { attrs: { 'data-bind': 'derived.expenses.total', 'data-fmt': 'money' } })));
  } };

  P.healthMeter = { mount: function (el) {
    el.className = (el.className + ' healthbox').trim();
    el.appendChild(h('div', { class: 'healthbox__top' },
      h('span', { class: 'healthbox__title' }, icon('ic_heart', 16), h('span', { text: 'Health' })),
      h('span', { class: 'chip chip--health', id: 'health-tier-chip' }, icon('ic_heart_pulse', 14), h('span', { attrs: { 'data-bind': 'derived.health.tier', 'data-fmt': 'upper' } }))));
    el.appendChild(h('div', { class: 'meter meter--health', id: 'health-meter', attrs: { role: 'meter', 'aria-label': 'Health', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 } },
      h('span', { class: 'meter__fill', attrs: { 'data-width-pct': 'player.health.value' } })));
  } };

  // ═══════════════════════════════════════ HUD ═══════════════════════════════════════
  var PHASES = ['START', 'PAYDAY', 'MARKET', 'EVENT', 'ACTION'];
  var acctState = { key: null };
  P.hud = { mount: function (el) {
    el.classList.add('panel', 'hud');
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Game status');
    el.appendChild(h('div', { class: 'hud__item hud__date' }, h('span', { class: 'hud__label' }, icon('ic_calendar', 14), 'Date'), h('b', { class: 'hud__val', attrs: { 'data-bind': 'loop.turn', 'data-fmt': 'date' } })));
    el.appendChild(h('span', { class: 'mode-badge mode-badge--rr', attrs: { 'data-show-if': 'loop.mode=RAT_RACE' } }, icon('ic_clock', 14), 'Rat Race'));
    el.appendChild(h('span', { class: 'mode-badge mode-badge--ft', attrs: { 'data-show-if': 'loop.mode=FAST_TRACK' } }, icon('ic_crown', 14), 'Fast Track'));
    el.appendChild(h('ol', { class: 'stepper', id: 'phase-stepper', attrs: { 'aria-label': 'Turn phases' } }, PHASES.map(function (p) { return h('li', { class: 'step', text: p, data: { phase: p } }); })));
    el.appendChild(h('span', { class: 'hud__sep', attrs: { 'aria-hidden': 'true' } }));
    el.appendChild(h('div', { class: 'hud__item' }, h('span', { class: 'hud__label' }, icon('ic_cash', 14), 'Cash'), h('b', { class: 'hud__val', attrs: { 'data-bind': 'player.financials.cash', 'data-fmt': 'money', 'data-tween': '', 'data-tone': 'auto', 'aria-live': 'polite', 'aria-atomic': 'true' } })));
    el.appendChild(h('div', { class: 'hud__item' }, h('span', { class: 'hud__label' }, icon('ic_chart_up', 14), h('span', { text: 'Net Worth', attrs: { 'data-glossary': 'net_worth' } })), h('b', { class: 'hud__val', attrs: { 'data-bind': 'derived.netWorth', 'data-fmt': 'money', 'data-tween': '', 'data-tone': 'auto', 'aria-live': 'polite', 'aria-atomic': 'true' } })));
    var fm = h('div'); P.freedomMeter.mount(fm); el.appendChild(fm);
    var hm = h('div'); P.healthMeter.mount(hm); el.appendChild(hm);
    el.appendChild(h('div', { class: 'acct', id: 'acct-chip' },
      h('span', { class: 'acct__avatar', id: 'acct-avatar' }),
      h('span', { class: 'acct__text' }, h('span', { class: 'acct__name', attrs: { 'data-bind': 'player.name' } }), h('span', { class: 'acct__sub', id: 'acct-sub', text: 'Guest' })),
      h('span', { class: 'acct__slot', id: 'acct-sync' }),
      h('span', { class: 'acct__slot acct__slot--crown', id: 'acct-crown', attrs: { hidden: true } })));
  } };

  function hudHook(s) {
    var phase = s.loop.phase === 'SHORTFALL' ? 'PAYDAY' : s.loop.phase, idx = PHASES.indexOf(phase), cleanup = phase === 'CLEANUP';
    Array.prototype.forEach.call(document.querySelectorAll('#phase-stepper .step'), function (chip, i) {
      var cur = idx === i, done = cleanup || (idx > i);
      dom.setClass(chip, 'is-current', cur); dom.setClass(chip, 'is-done', done);
      if (cur) { chip.setAttribute('aria-current', 'step'); } else { chip.removeAttribute('aria-current'); }
    });
    var fm = document.getElementById('freedom-meter');
    if (fm) {
      fm.setAttribute('aria-valuenow', String(s.derived.escape.progressPct));
      fm.setAttribute('aria-valuetext', 'Passive ' + money(s.derived.income.passive) + ' of ' + money(s.derived.expenses.total) + ' monthly expenses');
    }
    var hm = document.getElementById('health-meter');
    if (hm) {
      hm.setAttribute('aria-valuenow', String(s.player.health.value));
      hm.setAttribute('aria-valuetext', s.derived.health.tier.toLowerCase() + ', ' + s.player.health.value + ' out of 100');
    }
    var chip = document.getElementById('health-tier-chip'), tier = s.derived.health.tier;
    if (chip) {
      dom.setClass(chip, 'chip--health', tier === 'GOOD'); dom.setClass(chip, 'chip--warn', tier === 'FAIR' || tier === 'POOR'); dom.setClass(chip, 'chip--neg', tier === 'CRITICAL');
    }
    // account chip: avatar of the player (derived, deterministic), "Guest" until accounts exist (Phase 5)
    var key = s.meta.gameId + '|' + s.player.name + '|' + s.player.professionId;
    if (acctState.key !== key) {
      acctState.key = key;
      var slot = document.getElementById('acct-avatar');
      if (slot) { dom.clear(slot); slot.appendChild(RR.ui.avatar.render(RR.ui.avatar.playerSeed(s.player.name, s.player.professionId), { size: 42, role: 'PLAYER', name: s.player.name, decorative: true })); }
    }
    var sync = document.getElementById('acct-sync'), subEl = document.getElementById('acct-sub');
    if (sync && !sync.firstChild) {
      var offline = RR.env.mode === 'OFFLINE';
      sync.appendChild(RR.ui.icon(offline ? 'ic_cloud_off' : 'ic_cloud', { size: 18, label: offline ? 'Offline: saved in this browser' : 'Signed out' }));
      sync.setAttribute('title', offline ? 'Offline: saved in this browser only' : 'Accounts arrive in a later phase');
      if (subEl) { dom.setText(subEl, offline ? 'Guest \u00b7 offline' : 'Guest'); }
    }
    dimRows.forEach(function (d) { var v = U.getPath(s, d.path); dom.setClass(d.row, 'is-dim', v === 0); });
  }

  // ═════════════════════════════════════ Income Statement ═════════════════════════════════════
  P.incomeStatement = { mount: function (el) {
    el.classList.add('panel', 'statement');
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Income statement');
    el.appendChild(h('h2', { class: 'statement__title' }, icon('ic_receipt', 20), 'Income Statement'));
    el.appendChild(sect('Income', [
      row({ label: 'Salary', path: 'derived.income.salary' }),
      row({ label: 'Dividends', path: 'derived.income.dividends', glossary: 'dividend', cond: true }),
      row({ label: 'Real-estate cash flow', path: 'derived.income.realEstate', cond: true }),
      row({ label: 'Business cash flow', path: 'derived.income.business', cond: true }),
      row({ label: 'Other income', path: 'derived.income.other', cond: true }),
      row({ label: 'Total Income', path: 'derived.income.total', cls: 'row--total', live: true })
    ]));
    el.appendChild(row({ label: 'Passive Income', path: 'derived.income.passive', glossary: 'passive_income', cls: 'row--passive' }));
    el.appendChild(row({ label: 'Interest (savings)', path: 'derived.income.interest', glossary: 'interest', cls: 'row--interest', cond: true }));
    el.appendChild(sect('Expenses', [
      row({ label: 'Taxes', path: 'derived.expenses.taxes' }),
      row({ label: 'Lifestyle', path: 'derived.expenses.lifestyle', glossary: 'lifestyle_creep' }),
      row({ label: 'Children', path: 'derived.expenses.children', cond: true }),
      listHost('debtPayments'),
      row({ label: 'Asset carrying costs', path: 'derived.expenses.assetDrag', cond: true }),
      row({ label: 'Health insurance', path: 'derived.expenses.insurance', cond: true }),
      row({ label: 'Other', path: 'derived.expenses.other', cond: true }),
      row({ label: 'Total Expenses', path: 'derived.expenses.total', cls: 'row--total', live: true })
    ]));
    el.appendChild(h('div', { class: 'hero-block' }, h('div', { class: 'hero-block__card' },
      h('div', { class: 'hero-block__label' }, h('span', { text: 'Monthly Cash Flow', attrs: { 'data-glossary': 'cash_flow' } }), icon('ic_trend_flat', 18)),
      h('b', { class: 'hero-num', id: 'hero-cashflow', attrs: { 'data-bind': 'derived.monthlyCashflow', 'data-fmt': 'moneySigned', 'data-tween': '', 'data-tone': 'auto', 'aria-live': 'polite', 'aria-atomic': 'true' } }))));
  } };

  // ═════════════════════════════════════ Balance Sheet ═════════════════════════════════════
  P.balanceSheet = { mount: function (el) {
    el.classList.add('panel', 'statement');
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Balance sheet');
    el.appendChild(h('h2', { class: 'statement__title' }, icon('ic_bank', 20), 'Balance Sheet'));
    el.appendChild(sect('Assets', [
      row({ label: 'Cash', path: 'player.financials.cash' }),
      sub('Savings & deposits'), listHost('deposits'),
      sub('Stocks'), listHost('stocks'),
      sub('Real estate'), listHost('realEstate'),
      sub('Businesses'), listHost('businesses'),
      sub('Personal assets'), listHost('personal'),
      row({ label: 'Total Assets', path: 'derived.assets.total', cls: 'row--total', live: true }),
      row({ label: 'Income-producing assets', path: 'derived.assets.productive', glossary: 'asset', cls: 'row--interest' })
    ]));
    el.appendChild(sect('Liabilities', [
      listHost('liabilities'),
      row({ label: 'Total Liabilities', path: 'derived.liabilities.total', glossary: 'liability', cls: 'row--total', live: true })
    ]));
    el.appendChild(h('div', { class: 'hero-block' }, h('div', { class: 'hero-block__card' },
      h('div', { class: 'hero-block__label' }, h('span', { text: 'Net Worth', attrs: { 'data-glossary': 'net_worth' } }),
        h('span', { class: 'chip chip--ratio chip--accent', attrs: { title: 'Cash plus deposits, in months of expenses' } }, icon('ic_piggy', 14), h('span', { text: 'Emergency fund', attrs: { 'data-glossary': 'emergency_fund' } }), ': ', h('b', { attrs: { 'data-bind': 'derived.ratios.emergencyMonths', 'data-fmt': 'months' } }))),
      h('b', { class: 'hero-num hero-num--md', attrs: { 'data-bind': 'derived.netWorth', 'data-fmt': 'money', 'data-tween': '', 'data-tone': 'auto', 'aria-live': 'polite', 'aria-atomic': 'true' } }))));
  } };

  // keyed lists (rows come from <template>s in index.html; bindRow only writes text when it changed)
  function slot(rowEl, cls, text) { var n = rowEl.querySelector('.' + cls); if (n) { dom.setText(n, text); } return n; }
  function registerLists() {
    function assetList(name, itemsFn, bind) { binder.registerList(name, { template: '#tpl-asset-row', empty: 'None yet', items: itemsFn, key: function (i) { return i.id; }, bindRow: bind }); }
    binder.registerList('debtPayments', {
      template: '#tpl-debt-row', empty: 'No loan payments',
      items: function (s) { return s.player.financials.liabilities.filter(function (d) { return !d.collateralAssetId; }); },
      key: function (d) { return d.id; },
      bindRow: function (el, d) { slot(el, 'lbl', d.label); slot(el, 'val', money(RR.finance.scheduledPayment(d))); slot(el, 'chip', U.fmt.pct(d.apr) + ' APR'); }
    });
    binder.registerList('liabilities', {
      template: '#tpl-liability-row', empty: 'No debts \u2014 nice', items: function (s) { return s.player.financials.liabilities; }, key: function (d) { return d.id; },
      bindRow: function (el, d) { slot(el, 'lbl', d.label); slot(el, 'val', money(d.principal)); slot(el, 'chip', U.fmt.pct(d.apr)); slot(el, 'sub', money(RR.finance.scheduledPayment(d)) + '/mo'); }
    });
    binder.registerList('deposits', {
      template: '#tpl-deposit-row', empty: 'None yet', items: function (s) { return s.player.financials.deposits || []; }, key: function (d) { return d.id; },
      bindRow: function (el, d) { slot(el, 'lbl', d.label); slot(el, 'val', money(d.balance)); slot(el, 'chip', U.fmt.pct(d.apy) + ' APY'); }
    });
    assetList('stocks', function (s) { return s.inventory.stocks; }, function (el, hld, s) {
      var st = V.stockPrice(hld.symbol, s.market);
      slot(el, 'lbl', hld.symbol + ' \u00d7 ' + U.fmt.int(hld.shares)); slot(el, 'val', money(V.stockValue(hld, s.market)));
      slot(el, 'sub', st ? '$' + st.price.toFixed(2) : '');
    });
    assetList('realEstate', function (s) { return s.inventory.realEstate; }, function (el, a, s) {
      slot(el, 'lbl', a.name); slot(el, 'val', money(V.reValue(a, s.market))); slot(el, 'sub', U.fmt.money(V.assetNetCashflow('RE', a, s), { signed: true }) + '/mo');
    });
    assetList('businesses', function (s) { return s.inventory.businesses; }, function (el, a, s) {
      slot(el, 'lbl', a.name); slot(el, 'val', money(V.bizValue(a, s.market))); slot(el, 'sub', U.fmt.money(V.assetNetCashflow('BIZ', a, s), { signed: true }) + '/mo');
    });
    assetList('personal', function (s) { return s.player.financials.personalAssets; }, function (el, a) { slot(el, 'lbl', a.label); slot(el, 'val', money(a.value)); slot(el, 'sub', ''); });

    // ticker: last 3 lines, newest first. Log entries have no id, so a key is derived from the line + its occurrence index within the window.
    binder.registerList('logTicker', {
      template: '#tpl-ticker-line', empty: 'Your story starts here.',
      items: function (s) {
        var seen = {}, last = s.log.slice(-RR.config.ui.ticker.lines).reverse();
        return last.map(function (e) {
          var base = e.turn + '|' + e.kind + '|' + e.text + '|' + e.delta; seen[base] = (seen[base] || 0) + 1;
          return { id: base + '#' + seen[base], e: e };
        });
      },
      key: function (i) { return i.id; },
      bindRow: function (el, it) {
        var e = it.e; slot(el, 't', U.fmt.date(e.turn)); slot(el, 'x', e.text);
        var d = el.querySelector('.d'); if (d) { dom.setText(d, U.isNum(e.delta) ? U.fmt.money(e.delta, { signed: true }) : ''); dom.setClass(d, 'is-pos', e.delta > 0); dom.setClass(d, 'is-neg', e.delta < 0); }
      }
    });

    // contacts
    binder.registerList('npcs', { template: '#tpl-npc-card', empty: 'No contacts yet', items: function (s) { return s.npcs; }, key: function (n) { return n.id; }, bindRow: bindNpc });
  }

  // ═══════════════════════════════════════ log ticker ═══════════════════════════════════════
  P.log = { mount: function (el) {
    el.classList.add('ticker');
    el.setAttribute('type', 'button');
    el.setAttribute('data-action', 'ui.openLog');
    el.setAttribute('aria-label', 'Open the full log');
    el.appendChild(h('span', { class: 'ticker__list', data: { list: 'logTicker' }, style: { display: 'block' } }));
  } };

  // ═══════════════════════════════════════ contacts ═══════════════════════════════════════
  var TIER_ICON = { TRUSTED: 'ic_shield', FRIENDLY: 'ic_heart', NEUTRAL: 'ic_minus', COLD: 'ic_cloud', HOSTILE: 'ic_warning' };
  function bindNpc(el, n) {
    var tpl = RR.data.npcsById[n.templateId], tier = RR.ledger.npcTier(n.relationship);
    slot(el, 'npc-card__name', n.name);
    slot(el, 'npc-role', tpl ? tpl.label : n.role);
    slot(el, 'npc-card__bio', tpl ? tpl.bio : '');
    var av = el.querySelector('.npc-card__avatar');
    if (av && el.__look !== n.lookSeed + '|' + n.role) { el.__look = n.lookSeed + '|' + n.role; dom.clear(av); av.appendChild(RR.ui.avatar.render(n.lookSeed, { size: 52, role: n.role, name: n.name, decorative: true })); }
    var tierChip = el.querySelector('.npc-tier');
    if (tierChip && tierChip.__tier !== tier) {
      tierChip.__tier = tier; dom.clear(tierChip); tierChip.className = 'chip npc-tier tier--' + tier.toLowerCase();
      tierChip.appendChild(icon(TIER_ICON[tier] || 'ic_user', 14)); tierChip.appendChild(document.createTextNode(tier.charAt(0) + tier.slice(1).toLowerCase()));
    }
    var m = el.querySelector('.meter'), fill = el.querySelector('.meter__fill');
    if (m) { m.setAttribute('aria-valuenow', String(n.relationship)); m.setAttribute('aria-valuetext', tier.toLowerCase() + ', ' + n.relationship); m.setAttribute('aria-label', 'Relationship with ' + n.name); }
    if (fill) { fill.style.width = U.clamp((n.relationship + 100) / 2, 0, 100) + '%'; }
    Array.prototype.forEach.call(el.querySelectorAll('[data-action]'), function (b) { b.setAttribute('data-arg', n.id); });
  }

  var contactsOpener = null;
  P.contacts = {
    mount: function (el) {
      el.classList.add('drawer', 'panel');
      el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Contacts');
      el.hidden = true;
      el.appendChild(h('div', { class: 'drawer__head' }, icon('ic_users', 22), h('h2', { text: 'Contacts', id: 'contacts-title' }),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', id: 'contacts-close', attrs: { type: 'button', 'data-action': 'ui.closeContacts', 'aria-label': 'Close contacts' } }, icon('ic_close', 18))));
      el.appendChild(h('div', { class: 'drawer__body' },
        h('div', { class: 'note', style: { marginBottom: '12px' } }, icon('ic_info', 18), h('span', { text: 'The people in your orbit. Calling, lunches and gifts that build trust arrive with the turn engine in Phase 2.' })),
        h('div', { class: 'list', data: { list: 'npcs' } })));
      el.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !el.hidden) { e.stopPropagation(); P.contacts.close(); } });
    },
    isOpen: function () { var el = document.getElementById('contacts-drawer'); return !!el && !el.hidden; },
    open: function () {
      var el = document.getElementById('contacts-drawer'); if (!el || !el.hidden) { return; }
      contactsOpener = document.activeElement;
      el.hidden = false;
      if (RR.ui.fx.animationsOn()) { el.classList.add('is-anim-in'); }
      binder.scan(el); binder.refresh(game(), { instant: true });
      var c = document.getElementById('contacts-close'); if (c) { c.focus(); }
      syncContactsButton();
    },
    close: function () {
      var el = document.getElementById('contacts-drawer'); if (!el || el.hidden) { return; }
      el.hidden = true; el.classList.remove('is-anim-in');
      if (contactsOpener && contactsOpener.isConnected) { try { contactsOpener.focus(); } catch (e) { /* ignore */ } }
      syncContactsButton();
    },
    toggle: function () { if (P.contacts.isOpen()) { P.contacts.close(); } else { P.contacts.open(); } }
  };
  function syncContactsButton() { var b = document.getElementById('btn-contacts'); if (b) { b.setAttribute('aria-expanded', P.contacts.isOpen() ? 'true' : 'false'); } }

  // ═════════════════════════════════ centre stage + Life tab ═════════════════════════════════
  var SCENE_BY_PROFESSION = { teacher: 'scene_home_interior', nurse: 'scene_hospital', software_engineer: 'scene_office' };
  var centerKey = null;

  P.center = { mount: function (el) {
    el.appendChild(h('section', { class: 'hero panel', id: 'hero-card', attrs: { 'aria-label': 'Your character' } }));
    el.appendChild(h('section', { class: 'dock panel', id: 'dock', attrs: { 'aria-label': 'Action dock' } }));
    P.life.mount(document.getElementById('dock'));
  } };

  function renderHero(s) {
    var host = document.getElementById('hero-card'); if (!host) { return; }
    var prof = U.findById(RR.data.professions, s.player.professionId), dream = s.fastTrack.dream;
    dom.clear(host);
    host.appendChild(h('div', { class: 'hero__scene' }, RR.ui.scene.render(SCENE_BY_PROFESSION[s.player.professionId] || 'scene_street_house', { category: 'LIFE' })));
    host.appendChild(h('span', { class: 'hero__badge chip chip--accent' }, icon('ic_star', 14), 'Your story'));
    host.appendChild(h('div', { class: 'hero__bar' },
      h('div', { class: 'hero__avatar' }, RR.ui.avatar.render(RR.ui.avatar.playerSeed(s.player.name, s.player.professionId), { size: 64, role: 'PLAYER', name: s.player.name, decorative: true })),
      h('div', { class: 'hero__who' },
        h('div', { class: 'hero__name', text: s.player.name }),
        h('div', { class: 'hero__meta' },
          h('span', { class: 'chip chip--accent' }, icon(prof ? prof.icon : 'ic_user', 14), prof ? prof.name : s.player.professionId),
          h('span', { class: 'chip chip--passive', attrs: { title: 'Your Fast Track dream' } }, icon('ic_star', 14), dream.name + ' \u00b7 ' + money(dream.cost)),
          h('span', { class: 'lo', text: 'Seed ' + s.meta.rng.seed })))));
  }

  var lifeRefs = null;
  P.life = { mount: function (el) {
    var cfg = RR.config.health, tabs = [{ id: 'life', label: 'Life', icon: 'ic_heart', on: true }, { id: 'market', label: 'Market', icon: 'ic_chart_up', phase: 3 },
                                        { id: 'portfolio', label: 'Portfolio', icon: 'ic_briefcase', phase: 3 }, { id: 'bank', label: 'Bank', icon: 'ic_bank', phase: 3 }];
    var tablist = h('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'Action dock sections' } }, tabs.map(function (t) {
      return h('button', { class: 'tab', id: 'tab-' + t.id, attrs: { type: 'button', role: 'tab', 'aria-selected': t.on ? 'true' : 'false', 'aria-controls': 'panel-' + t.id, tabindex: t.on ? '0' : '-1',
        'aria-disabled': t.on ? undefined : 'true', title: t.on ? undefined : 'Arrives in Phase ' + t.phase } }, icon(t.icon, 18), t.label);
    }));
    tablist.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') { return; }
      var enabled = Array.prototype.filter.call(tablist.querySelectorAll('[role="tab"]'), function (t) { return t.getAttribute('aria-disabled') !== 'true'; });
      var i = enabled.indexOf(document.activeElement); if (i < 0 || enabled.length < 2) { return; }
      e.preventDefault();
      var next = e.key === 'Home' ? 0 : (e.key === 'End' ? enabled.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length);
      enabled[next].focus();
    });
    tablist.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[role="tab"]');
      if (t && t.getAttribute('aria-disabled') === 'true' && t.title) { RR.ui.overlays.toast.show(t.title, { tone: 'info', key: 'tab:' + t.id }); }
    });
    el.appendChild(h('div', { class: 'dock__head' }, tablist, h('span', { class: 'chip chip--accent' }, icon('ic_clock', 14), h('span', { attrs: { 'data-bind': 'loop.turn', 'data-fmt': 'date' } }))));

    var insure = h('div', { class: 'insure-grid', attrs: { role: 'radiogroup', 'aria-label': 'Health insurance plan' } }, ['NONE', 'STANDARD', 'COMPREHENSIVE'].map(function (plan) {
      var p = cfg.insurance[plan];
      var input = h('input', { attrs: { type: 'radio', name: 'insurance', value: plan, disabled: true, class: 'sr-only', 'data-action': 'health.insurance', 'data-arg': plan } });
      return h('label', { class: 'choice' }, input, h('span', { class: 'choice__body' },
        h('span', { class: 'choice__title', text: plan.charAt(0) + plan.slice(1).toLowerCase() }),
        h('span', { class: 'choice__sub', text: plan === 'NONE' ? 'No premium, no cover' : money(p.premium) + '/mo \u00b7 covers ' + Math.round(p.coverage * 100) + '%' })));
    }));
    function lifeAction(title, sub, action, label) {
      return h('div', { class: 'life-action' }, h('span', null, h('b', { text: title }), ' ', h('small', { text: sub })),
        h('button', { class: 'btn btn--sm', text: label, attrs: { type: 'button', 'data-action': action, 'aria-disabled': 'true', title: 'Arrives in Phase 2' } }));
    }
    var panel = h('div', { class: 'dock__panel', id: 'panel-life', attrs: { role: 'tabpanel', 'aria-labelledby': 'tab-life', tabindex: '0' } },
      h('div', { class: 'note' }, icon('ic_info', 18), h('span', { text: 'Health protects your paycheck. Check-ups, vacations and insurance switch on with the turn engine (Phase 2).' })),
      h('div', { class: 'life-grid' },
        h('div', { class: 'life-card' }, h('h3', null, icon('ic_heart_pulse', 20), 'Health'),
          h('div', { class: 'health-big' }, h('b', { attrs: { 'data-bind': 'player.health.value', 'data-fmt': 'int', 'data-tween': '' } }), h('span', { class: 'muted', text: '/ 100' }), h('span', { class: 'chip chip--health', id: 'life-tier' })),
          h('div', { class: 'meter meter--health', attrs: { role: 'presentation' } }, h('span', { class: 'meter__fill', attrs: { 'data-width-pct': 'player.health.value' } }))),
        h('div', { class: 'life-card' }, h('h3', null, icon('ic_dumbbell', 20), 'Look after yourself'),
          lifeAction('Check-up', money(cfg.actions.checkup.cost) + ' \u00b7 +' + cfg.actions.checkup.delta + ' health', 'health.checkup', 'Book'),
          lifeAction('Vacation', money(cfg.actions.vacation.cost) + ' \u00b7 +' + cfg.actions.vacation.delta + ' health', 'health.vacation', 'Plan'),
          lifeAction('Gym membership', money(cfg.gym.costMonth) + '/mo \u00b7 +' + cfg.gym.delta + '/mo', 'health.gym', 'Join')),
        h('div', { class: 'life-card life-card--wide' }, h('h3', null, icon('ic_shield', 20), 'Health insurance'), insure)));
    el.appendChild(panel);
    lifeRefs = { tier: panel.querySelector('#life-tier'), radios: panel.querySelectorAll('input[name="insurance"]') };
  } };

  function centerHook(s) {
    var key = s.meta.gameId + '|' + s.player.name + '|' + s.player.professionId + '|' + s.fastTrack.dream.id;
    if (centerKey !== key) { centerKey = key; renderHero(s); }
    if (lifeRefs) {
      var tier = s.derived.health.tier;
      if (lifeRefs.tier && lifeRefs.tier.__t !== tier) {
        lifeRefs.tier.__t = tier; dom.clear(lifeRefs.tier); lifeRefs.tier.appendChild(icon('ic_heart_pulse', 14)); lifeRefs.tier.appendChild(document.createTextNode(tier));
        dom.setClass(lifeRefs.tier, 'chip--health', tier === 'GOOD'); dom.setClass(lifeRefs.tier, 'chip--warn', tier === 'FAIR' || tier === 'POOR'); dom.setClass(lifeRefs.tier, 'chip--neg', tier === 'CRITICAL');
      }
      Array.prototype.forEach.call(lifeRefs.radios, function (r) { r.checked = r.value === s.player.health.insurance; });
    }
  }

  // ═══════════════════════════════════════ action bar ═══════════════════════════════════════
  P.actionBar = { mount: function (el) {
    el.classList.add('panel', 'action-bar');
    el.setAttribute('role', 'toolbar'); el.setAttribute('aria-label', 'Game actions');
    el.appendChild(h('div', { class: 'action-bar__main' },
      h('button', { class: 'btn btn--primary btn--lg', id: 'btn-next', attrs: { type: 'button', 'data-action': 'turn.endTurn' } }, icon('ic_calendar', 22), 'Next Month'),
      h('span', { class: 'inline-reason', attrs: { role: 'status' } })));
    function stubBtn(label, ic, action, phase) { return h('button', { class: 'btn', attrs: { type: 'button', 'data-action': action, 'aria-disabled': 'true', title: label + ' arrives in Phase ' + phase } }, icon(ic, 18), label); }
    el.appendChild(h('div', { class: 'action-bar__group' }, stubBtn('Market', 'ic_chart_up', 'market.open', 3), stubBtn('Portfolio', 'ic_briefcase', 'portfolio.open', 3), stubBtn('Bank', 'ic_bank', 'bank.open', 3)));
    el.appendChild(h('div', { class: 'action-bar__group' },
      h('button', { class: 'btn', id: 'btn-contacts', attrs: { type: 'button', 'data-action': 'ui.toggleContacts', 'aria-expanded': 'false', 'aria-controls': 'contacts-drawer' } }, icon('ic_users', 18), 'Contacts'),
      h('button', { class: 'btn btn--icon', attrs: { type: 'button', 'data-action': 'ui.openGlossary', 'aria-label': 'Open glossary', title: 'Glossary' } }, icon('ic_book', 20)),
      h('button', { class: 'btn btn--icon', id: 'btn-settings', attrs: { type: 'button', 'data-action': 'ui.openSettings', 'aria-label': 'Open settings', title: 'Settings' } }, icon('ic_settings', 20))));
    var tk = h('button'); P.log.mount(tk); el.appendChild(tk);
  } };

  // ═════════════════════════════════════ wiring ═════════════════════════════════════
  function registerActions() {
    var ok = function () { return U.ok(null); };
    actions.register('ui.openLog', function () { RR.ui.overlays.logModal.open(); return ok(); });
    actions.register('ui.openSettings', function () { RR.ui.overlays.settings.open(); return ok(); });
    actions.register('ui.openGlossary', function () { RR.ui.overlays.glossary.open(); return ok(); });
    actions.register('ui.toggleContacts', function () { P.contacts.toggle(); return ok(); });
    actions.register('ui.closeContacts', function () { P.contacts.close(); return ok(); });

    // Engine entry points. In Phase 1 these resolve to the NOT_IMPLEMENTED stubs (1b-stubs.js); Phase 2/3 replace the modules, not these lines.
    actions.register('turn.endTurn', function () { return RR.turn.endTurn(); }, { mutates: true });
    actions.register('market.open', function () { return U.fail('NOT_IMPLEMENTED', 'The market arrives in Phase 3.'); });
    actions.register('portfolio.open', function () { return U.fail('NOT_IMPLEMENTED', 'The portfolio arrives in Phase 3.'); });
    actions.register('bank.open', function () { return U.fail('NOT_IMPLEMENTED', 'The bank arrives in Phase 3.'); });
    actions.register('health.checkup', function () { return RR.health.act('checkup'); }, { mutates: true });
    actions.register('health.vacation', function () { return RR.health.act('vacation'); }, { mutates: true });
    actions.register('health.gym', function () { return RR.health.act('gym'); }, { mutates: true });
    actions.register('health.insurance', function (c) { return RR.health.setInsurance(c.arg); }, { mutates: true });
    ['call', 'lunch', 'gift'].forEach(function (kind) { actions.register('npc.' + kind, function (c) { return RR.npc.interact(c.arg, kind.toUpperCase()); }, { mutates: true }); });
  }

  P.mountAll = function () {
    var map = [['hud', 'hud'], ['incomeStatement', 'col-left'], ['center', 'col-center'], ['balanceSheet', 'col-right'], ['actionBar', 'action-bar'], ['contacts', 'contacts-drawer']];
    map.forEach(function (pair) {
      var el = document.getElementById(pair[1]);
      if (!el) { throw new Error('RR.ui.panels: mount point #' + pair[1] + ' is missing from index.html'); }
      P[pair[0]].mount(el);
    });
  };

  P.init = function () {
    registerLists();
    registerActions();
    binder.addRefreshHook(hudHook);
    binder.addRefreshHook(centerHook);
    binder.addRefreshHook(function () { syncContactsButton(); });
    P.mountAll();
  };
})(window.RR);
