/* RAT RACE · 06-schema.js · RR.schema — create / validate / migrate for State Schema v2 (§1.5 + §1.12.3).
   create() builds a brand-new state object (never the live one). validate() is the gate for every imported/loaded state (R19).
   migrate() is pure: returns a migrated deep copy and never mutates its input. */
(function (RR) {
  'use strict';

  var U = RR.util;
  var VERSION = 2;

  var ENUMS = {
    STATUS: ['TITLE', 'RUNNING', 'GAME_OVER'],
    MODE: ['RAT_RACE', 'FAST_TRACK'],
    PHASE: ['IDLE', 'START', 'PAYDAY', 'SHORTFALL', 'MARKET', 'EVENT', 'ACTION', 'CLEANUP', 'TRANSITION', 'ENDED'],
    OUTCOME: ['DREAM', 'EMPIRE', 'BANKRUPT'],
    DEBT_KIND: ['HOME_MORTGAGE', 'STUDENT_LOAN', 'CAR_LOAN', 'CREDIT_CARD', 'RETAIL', 'BANK_LOAN', 'PROPERTY_MORTGAGE', 'BUSINESS_LOAN'],
    DEBT_STRUCTURE: ['AMORTIZING', 'INTEREST_ONLY', 'REVOLVING'],
    DEBT_STATUS: ['CURRENT', 'DELINQUENT'],
    ECONOMY_PHASE: ['EXPANSION', 'PEAK', 'RECESSION', 'RECOVERY'],
    LOG_KIND: ['PAYDAY', 'EVENT', 'TRADE', 'DEBT', 'MARKET', 'SYSTEM', 'MILESTONE'],
    MOD_TARGET: ['SALARY', 'INCOME', 'EXPENSE'],
    MOD_MODE: ['MULTIPLY', 'ADD'],
    RE_KIND: ['CONDO', 'SINGLE_FAMILY', 'DUPLEX', 'APARTMENT_BLOCK', 'COMMERCIAL'],
    INSURANCE: ['NONE', 'STANDARD', 'COMPREHENSIVE'],
    MAINTENANCE: ['NONE', 'BASIC', 'FULL'],
    DEPOSIT_KIND: ['SAVINGS', 'TERM'],
    NPC_STATUS: ['ACTIVE', 'DORMANT', 'LOST'],
    NPC_ROLE: ['FAMILY', 'BOSS', 'FRIEND', 'BANKER', 'AGENT', 'MENTOR', 'HANDYMAN', 'TENANT', 'ADVISOR'],
    SEVERITY: ['MINOR', 'MAJOR', 'CRISIS']
  };

  var SETTING_KEYS = ['difficulty', 'currencySymbol', 'animations', 'autosave', 'toasts', 'sound', 'reducedFx', 'tutorialHints'];
  var DROUGHT_KEYS = ['DEAL', 'DOODAD', 'LIFE', 'MARKET', 'NPC', 'ASSET'];     // NPC/ASSET are Phase 1 additions (v2 pity categories)

  function find(list, id) { return U.findById(list, id); }
  function inEnum(list, v) { return list.indexOf(v) >= 0; }

  function defaultSettings(override) {
    var base = RR.config.settings.defaults, src = override || (RR.settings && RR.settings.all ? RR.settings.all() : null) || base, out = {};
    SETTING_KEYS.forEach(function (k) { out[k] = src[k] !== undefined ? src[k] : base[k]; });
    return out;
  }

  function normalizeSeed(seed) {
    var n = typeof seed === 'string' && /^\d{1,10}$/.test(seed.trim()) ? parseInt(seed, 10) : seed;
    if (typeof n === 'number' && isFinite(n)) { return (Math.floor(Math.abs(n)) >>> 0) || 1; }
    return ((U.nowMs() % 100000000) >>> 0) || 1;
  }

  // ── NPC factory (A21: names and looks are drawn from rng.npc; ids from the global counter) ──────────────────────
  // makeNpc(state, templateId, opts?) → Npc. `state` is the object being built or the live state INSIDE a commit.
  function makeNpc(state, templateId, opts) {
    opts = opts || {};
    var tpl = RR.data.npcsById[templateId];
    if (!tpl) { throw new Error('RR.schema.makeNpc: unknown NPC template "' + templateId + '"'); }
    var r = RR.rng.forState(state).stream('npc');
    var name = '', tries = 0, taken = {};
    (state.npcs || []).forEach(function (n) { taken[n.name] = true; });
    do {
      name = r.pick(tpl.namePool.first) + ' ' + r.pick(tpl.namePool.last);
      tries++;
    } while (taken[name] && tries < 8);
    var lookSeed = r.int(1, 99999);
    var turn = opts.turn !== undefined ? opts.turn : state.loop.turn;
    return {
      id: U.uid(state, 'npc'), templateId: tpl.id, name: name, role: tpl.role,
      relationship: opts.relationship !== undefined ? opts.relationship : tpl.startRelationship,
      status: 'ACTIVE', metTurn: turn, lastInteractionTurn: turn,
      assetId: opts.assetId || null, lookSeed: lookSeed, memory: []
    };
  }

  function starterRoster(state) {
    state.npcs = [];
    RR.data.npcStarterIds.forEach(function (id) { state.npcs.push(makeNpc(state, id, { turn: 0 })); });
  }

  // ── create ───────────────────────────────────────────────────────────────────────────────────────────────────────
  function create(opts) {
    opts = opts || {};
    var cfg = RR.config;
    var prof = find(RR.data.professions, opts.professionId || RR.data.defaultProfessionId);
    if (!prof) { throw new Error('RR.schema.create: unknown professionId "' + opts.professionId + '"'); }
    var dream = find(RR.data.dreams, opts.dreamId || RR.data.defaultDreamId);
    if (!dream) { throw new Error('RR.schema.create: unknown dreamId "' + opts.dreamId + '"'); }
    var name = U.cleanString(opts.name, cfg.ui.name.maxLength, cfg.ui.name.fallback);
    var seed = normalizeSeed(opts.seed);
    var now = U.now();

    var state = {
      meta: {
        schemaVersion: VERSION,
        gameId: 'rr_' + U.fnv1a32(seed + ':' + prof.id + ':' + name + ':' + now).toString(36),
        createdAt: now, updatedAt: now, revision: 0,
        idCounter: 0,
        rng: { seed: seed, state: seed, streams: { market: 0, events: 0, deals: 0, npc: 0 } },
        settings: defaultSettings(opts.settings)
      },
      loop: {
        status: 'TITLE', mode: 'RAT_RACE', phase: 'IDLE', turn: 0,
        pendingCard: null, pendingDecision: null, lastPayday: null, outcome: null,
        turnCounters: { interactions: 0, healthActions: 0 },
        director: {
          recentTemplateIds: [], occurrences: {}, lastDrawnTurn: {},
          droughts: DROUGHT_KEYS.reduce(function (o, k) { o[k] = 0; return o; }, {}),
          queued: [], lastSeverityTurn: { MAJOR: -99, CRISIS: -99 }
        }
      },
      player: {
        name: name, professionId: prof.id, dreamId: dream.id,
        health: { value: cfg.health.start, insurance: 'NONE', lastCheckupTurn: -99, lastVacationTurn: -99 },
        financials: {
          cash: prof.cash, salary: prof.salary, baseLifestyleExpense: prof.baseLifestyleExpense, childCount: prof.childCount,
          creditScore: cfg.credit.start,
          personalAssets: [], liabilities: [], modifiers: [], deposits: []
        }
      },
      inventory: { stocks: [], realEstate: [], businesses: [], dreams: [] },
      market: {
        economy: { phase: 'EXPANSION', phaseTurnsLeft: 24, baseRate: cfg.economy.phases.EXPANSION.baseRate, inflationRate: cfg.economy.inflation.start, inflationIndex: 1.0 },
        stocks: RR.data.stocks.map(function (s) {
          return { symbol: s.symbol, name: s.name, sector: s.sector, price: s.price, prevPrice: s.price, mu: s.mu, sigma: s.sigma, dpsAnnual: s.dpsAnnual, history: [s.price] };
        }),
        indices: { realEstatePrice: 1.0, realEstateRent: 1.0, businessMultiple: 4.0 },
        shocks: [],
        history: { realEstatePrice: [1.0], businessMultiple: [4.0] }
      },
      fastTrack: {
        unlocked: false, enteredTurn: null, ratRaceSummary: null, baselinePassive: 0, goalPassive: 0,
        dream: { id: dream.id, name: dream.name, cost: dream.cost, purchased: false }
      },
      npcs: [],
      story: { flags: {}, counters: {}, history: [], consequences: [] },
      stats: {
        netWorthHistory: [], passiveHistory: [], peakNetWorth: 0,
        dealsTaken: 0, dealsPassed: 0, doodadsPaid: 0, shortfalls: 0, liquidations: 0, interestPaid: 0,
        eventsByCategory: {}, npcInteractions: 0, hospitalizations: 0, repairSpend: 0, interestEarned: 0, bankruptcyCause: null, healthHistory: []
      },
      log: [],
      derived: null
    };
    RR.rng.seedStreams(state.meta.rng, seed);

    // Starter ids d_0001-4 and pa_0001-2 are pre-used: the global counter starts at 6 (§1.5). NPC ids continue from there.
    var fin = state.player.financials;
    prof.personalAssets.forEach(function (pa, i) { fin.personalAssets.push({ id: 'pa_' + U.pad(i + 1, 4), label: pa.label, value: pa.value }); });
    prof.debts.forEach(function (d, i) {
      var debt = {
        id: 'd_' + U.pad(i + 1, 4), kind: d.kind, label: d.label, structure: d.structure,
        principal: d.principal, originalPrincipal: d.principal, apr: d.apr, termMonthsRemaining: d.termMonthsRemaining,
        monthlyPayment: 0, collateralAssetId: null, originTurn: 0, prepayable: d.prepayable, status: 'CURRENT'
      };
      debt.monthlyPayment = RR.finance.initialPayment(debt);
      fin.liabilities.push(debt);
    });
    state.meta.idCounter = prof.personalAssets.length + prof.debts.length;

    starterRoster(state);
    state.derived = RR.ledger.recompute(state);
    return state;
  }

  // ── validate ─────────────────────────────────────────────────────────────────────────────────────────────────────
  var MAX_ERRORS = 40;

  function validate(state) {
    var errors = [];
    function bad(msg) { if (errors.length < MAX_ERRORS) { errors.push(msg); } }
    function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
    function num(v, path, lo, hi) {
      if (!U.isNum(v)) { bad(path + ' must be a finite number'); return false; }
      if (lo !== undefined && v < lo) { bad(path + ' must be ≥ ' + lo); return false; }
      if (hi !== undefined && v > hi) { bad(path + ' must be ≤ ' + hi); return false; }
      return true;
    }
    function int(v, path, lo, hi) {
      if (!U.isInt(v)) { bad(path + ' must be an integer'); return false; }
      return num(v, path, lo, hi);
    }
    function str(v, path, max) {
      if (typeof v !== 'string' || !v) { bad(path + ' must be a non-empty string'); return false; }
      if (max && v.length > max) { bad(path + ' is longer than ' + max + ' characters'); return false; }
      return true;
    }
    function en(v, list, path) { if (!inEnum(list, v)) { bad(path + ' must be one of ' + list.join('|')); return false; } return true; }
    function arr(v, path) { if (!Array.isArray(v)) { bad(path + ' must be an array'); return false; } return true; }
    function obj(v, path) { if (!isObj(v)) { bad(path + ' must be an object'); return false; } return true; }
    function nullOrInt(v, path) { if (v !== null) { int(v, path, 0); } }

    if (!isObj(state)) { return { ok: false, errors: ['state must be an object'] }; }
    var issues = U.jsonIssues(state, 10);
    issues.forEach(bad);
    if (errors.length) { return { ok: false, errors: errors }; }

    var cfg = RR.config, lim = cfg.limits;
    var ids = {};
    function claim(id, path) {
      if (typeof id !== 'string' || !id) { bad(path + '.id must be a non-empty string'); return; }
      if (ids[id]) { bad('duplicate id "' + id + '" at ' + path); }
      ids[id] = true;
    }

    // meta
    if (obj(state.meta, 'meta')) {
      var m = state.meta;
      if (m.schemaVersion !== VERSION) { bad('meta.schemaVersion must be ' + VERSION + ' (got ' + m.schemaVersion + ')'); }
      str(m.gameId, 'meta.gameId', 64); str(m.createdAt, 'meta.createdAt', 40); str(m.updatedAt, 'meta.updatedAt', 40);
      int(m.revision, 'meta.revision', 0); int(m.idCounter, 'meta.idCounter', 0);
      if (obj(m.rng, 'meta.rng')) {
        int(m.rng.seed, 'meta.rng.seed', 0, 4294967295); int(m.rng.state, 'meta.rng.state', 0, 4294967295);
        if (obj(m.rng.streams, 'meta.rng.streams')) { RR.rng.STREAMS.forEach(function (n) { int(m.rng.streams[n], 'meta.rng.streams.' + n, 0, 4294967295); }); }
      }
      obj(m.settings, 'meta.settings');
    }

    // loop
    if (obj(state.loop, 'loop')) {
      var lp = state.loop;
      en(lp.status, ENUMS.STATUS, 'loop.status'); en(lp.mode, ENUMS.MODE, 'loop.mode'); en(lp.phase, ENUMS.PHASE, 'loop.phase');
      int(lp.turn, 'loop.turn', 0);
      ['pendingCard', 'pendingDecision', 'lastPayday'].forEach(function (k) { if (lp[k] !== null && !isObj(lp[k])) { bad('loop.' + k + ' must be null or an object'); } });
      if (lp.outcome !== null) { if (obj(lp.outcome, 'loop.outcome')) { en(lp.outcome.type, ENUMS.OUTCOME, 'loop.outcome.type'); int(lp.outcome.turn, 'loop.outcome.turn', 0); } }
      if (obj(lp.turnCounters, 'loop.turnCounters')) { int(lp.turnCounters.interactions, 'loop.turnCounters.interactions', 0); int(lp.turnCounters.healthActions, 'loop.turnCounters.healthActions', 0); }
      if (obj(lp.director, 'loop.director')) {
        arr(lp.director.recentTemplateIds, 'loop.director.recentTemplateIds'); arr(lp.director.queued, 'loop.director.queued');
        obj(lp.director.occurrences, 'loop.director.occurrences'); obj(lp.director.lastDrawnTurn, 'loop.director.lastDrawnTurn');
        obj(lp.director.droughts, 'loop.director.droughts'); obj(lp.director.lastSeverityTurn, 'loop.director.lastSeverityTurn');
      }
    }

    // player
    if (obj(state.player, 'player')) {
      var p = state.player;
      str(p.name, 'player.name', lim.nameMax); str(p.professionId, 'player.professionId', 40); str(p.dreamId, 'player.dreamId', 40);
      if (obj(p.health, 'player.health')) {
        num(p.health.value, 'player.health.value', 0, 100);
        en(p.health.insurance, ENUMS.INSURANCE, 'player.health.insurance');
        num(p.health.lastCheckupTurn, 'player.health.lastCheckupTurn'); num(p.health.lastVacationTurn, 'player.health.lastVacationTurn');
      }
      if (obj(p.financials, 'player.financials')) {
        var f = p.financials;
        num(f.cash, 'player.financials.cash'); num(f.salary, 'player.financials.salary', 0); num(f.baseLifestyleExpense, 'player.financials.baseLifestyleExpense', 0);
        int(f.childCount, 'player.financials.childCount', 0, cfg.child.max);
        num(f.creditScore, 'player.financials.creditScore', cfg.credit.min, cfg.credit.max);
        if (arr(f.personalAssets, 'player.financials.personalAssets')) {
          f.personalAssets.forEach(function (a, i) { var path = 'personalAssets[' + i + ']'; claim(a && a.id, path); str(a && a.label, path + '.label', lim.labelMax); num(a && a.value, path + '.value', 0); });
        }
        if (arr(f.liabilities, 'player.financials.liabilities')) {
          f.liabilities.forEach(function (d, i) {
            var path = 'liabilities[' + i + ']'; if (!obj(d, path)) { return; }
            claim(d.id, path); en(d.kind, ENUMS.DEBT_KIND, path + '.kind'); en(d.structure, ENUMS.DEBT_STRUCTURE, path + '.structure'); en(d.status, ENUMS.DEBT_STATUS, path + '.status');
            str(d.label, path + '.label', lim.labelMax);
            num(d.principal, path + '.principal', 0); num(d.originalPrincipal, path + '.originalPrincipal', 0); num(d.apr, path + '.apr', 0, 1); num(d.monthlyPayment, path + '.monthlyPayment', 0);
            if (d.structure === 'AMORTIZING') { int(d.termMonthsRemaining, path + '.termMonthsRemaining', 0); } else if (d.termMonthsRemaining !== null) { bad(path + '.termMonthsRemaining must be null unless AMORTIZING'); }
            if (d.collateralAssetId !== null && typeof d.collateralAssetId !== 'string') { bad(path + '.collateralAssetId must be null or a string'); }
            int(d.originTurn, path + '.originTurn', 0); if (typeof d.prepayable !== 'boolean') { bad(path + '.prepayable must be boolean'); }
          });
        }
        if (arr(f.modifiers, 'player.financials.modifiers')) {
          f.modifiers.forEach(function (mod, i) {
            var path = 'modifiers[' + i + ']'; if (!obj(mod, path)) { return; }
            claim(mod.id, path); str(mod.label, path + '.label', lim.labelMax); en(mod.target, ENUMS.MOD_TARGET, path + '.target'); en(mod.mode, ENUMS.MOD_MODE, path + '.mode'); num(mod.value, path + '.value');
            if (mod.target !== 'SALARY' && mod.mode !== 'ADD') { bad(path + ': INCOME and EXPENSE modifiers must use ADD'); }
            nullOrInt(mod.turnsLeft, path + '.turnsLeft');
          });
        }
        if (arr(f.deposits, 'player.financials.deposits')) {
          f.deposits.forEach(function (dep, i) {
            var path = 'deposits[' + i + ']'; if (!obj(dep, path)) { return; }
            claim(dep.id, path); en(dep.kind, ENUMS.DEPOSIT_KIND, path + '.kind'); str(dep.label, path + '.label', lim.labelMax);
            num(dep.balance, path + '.balance', 0); num(dep.apy, path + '.apy', 0, 1); int(dep.openedTurn, path + '.openedTurn', 0);
            nullOrInt(dep.termMonths, path + '.termMonths'); nullOrInt(dep.maturityTurn, path + '.maturityTurn');
          });
        }
      }
    }

    // inventory
    if (obj(state.inventory, 'inventory')) {
      var inv = state.inventory;
      if (arr(inv.stocks, 'inventory.stocks')) {
        inv.stocks.forEach(function (h, i) {
          var path = 'stocks[' + i + ']'; if (!obj(h, path)) { return; }
          claim(h.id, path); str(h.symbol, path + '.symbol', 8); num(h.shares, path + '.shares', 0); num(h.avgCost, path + '.avgCost', 0); int(h.openedTurn, path + '.openedTurn', 0);
        });
      }
      [['realEstate', 'RE'], ['businesses', 'BIZ']].forEach(function (pair) {
        if (!arr(inv[pair[0]], 'inventory.' + pair[0])) { return; }
        inv[pair[0]].forEach(function (a, i) {
          var path = pair[0] + '[' + i + ']'; if (!obj(a, path)) { return; }
          claim(a.id, path); str(a.name, path + '.name', lim.nameMax); str(a.kind, path + '.kind', 40);
          if (pair[1] === 'RE') { en(a.kind, ENUMS.RE_KIND, path + '.kind'); }
          num(a.purchasePrice, path + '.purchasePrice', 0); num(a.downPayment, path + '.downPayment', 0); int(a.purchaseTurn, path + '.purchaseTurn', 0);
          num(a.inflationIndexAtPurchase, path + '.inflationIndexAtPurchase', 0.0001);
          if (pair[1] === 'RE') {
            num(a.baseMonthlyRent, path + '.baseMonthlyRent', 0); num(a.baseMonthlyOpex, path + '.baseMonthlyOpex', 0);
            num(a.priceIndexAtPurchase, path + '.priceIndexAtPurchase', 0.0001); num(a.rentIndexAtPurchase, path + '.rentIndexAtPurchase', 0.0001);
            int(a.vacantTurnsLeft, path + '.vacantTurnsLeft', 0); num(a.rentBoostPct, path + '.rentBoostPct');
          } else {
            num(a.baseMonthlyRevenue, path + '.baseMonthlyRevenue', 0); num(a.baseMonthlyCosts, path + '.baseMonthlyCosts', 0);
            num(a.revenueIndex, path + '.revenueIndex', 0); num(a.riskSigma, path + '.riskSigma', 0); int(a.closedTurnsLeft, path + '.closedTurnsLeft', 0);
          }
          num(a.condition, path + '.condition', 0, 100); en(a.maintenancePlan, ENUMS.MAINTENANCE, path + '.maintenancePlan');
          if (typeof a.insured !== 'boolean') { bad(path + '.insured must be boolean'); }
          if (typeof a.inspected !== 'boolean') { bad(path + '.inspected must be boolean'); }
          if (a.debtId !== null && typeof a.debtId !== 'string') { bad(path + '.debtId must be null or a string'); }
        });
      });
      arr(inv.dreams, 'inventory.dreams');
    }

    // referential integrity: debts ↔ assets
    if (state.player && state.player.financials && Array.isArray(state.player.financials.liabilities) && state.inventory) {
      var assetIds = {}, debtIds = {};
      (state.inventory.realEstate || []).concat(state.inventory.businesses || []).forEach(function (a) { if (a && a.id) { assetIds[a.id] = true; } });
      state.player.financials.liabilities.forEach(function (d) { if (d && d.id) { debtIds[d.id] = true; } });
      state.player.financials.liabilities.forEach(function (d) { if (d && d.collateralAssetId && !assetIds[d.collateralAssetId]) { bad('debt ' + d.id + ' references missing asset ' + d.collateralAssetId); } });
      (state.inventory.realEstate || []).concat(state.inventory.businesses || []).forEach(function (a) { if (a && a.debtId && !debtIds[a.debtId]) { bad('asset ' + a.id + ' references missing debt ' + a.debtId); } });
    }

    // market
    if (obj(state.market, 'market')) {
      var mk = state.market;
      if (obj(mk.economy, 'market.economy')) {
        en(mk.economy.phase, ENUMS.ECONOMY_PHASE, 'market.economy.phase'); int(mk.economy.phaseTurnsLeft, 'market.economy.phaseTurnsLeft', 0);
        num(mk.economy.baseRate, 'market.economy.baseRate'); num(mk.economy.inflationRate, 'market.economy.inflationRate'); num(mk.economy.inflationIndex, 'market.economy.inflationIndex', 0.0001);
      }
      if (arr(mk.stocks, 'market.stocks')) {
        mk.stocks.forEach(function (s, i) {
          var path = 'market.stocks[' + i + ']'; if (!obj(s, path)) { return; }
          str(s.symbol, path + '.symbol', 8); num(s.price, path + '.price', 0); num(s.prevPrice, path + '.prevPrice', 0); num(s.dpsAnnual, path + '.dpsAnnual', 0);
          num(s.mu, path + '.mu'); num(s.sigma, path + '.sigma', 0); arr(s.history, path + '.history');
        });
      }
      if (obj(mk.indices, 'market.indices')) { ['realEstatePrice', 'realEstateRent', 'businessMultiple'].forEach(function (k) { num(mk.indices[k], 'market.indices.' + k, 0); }); }
      arr(mk.shocks, 'market.shocks'); obj(mk.history, 'market.history');
    }

    obj(state.fastTrack, 'fastTrack');

    // npcs
    if (arr(state.npcs, 'npcs')) {
      state.npcs.forEach(function (n, i) {
        var path = 'npcs[' + i + ']'; if (!obj(n, path)) { return; }
        claim(n.id, path); str(n.templateId, path + '.templateId', 40); str(n.name, path + '.name', lim.nameMax);
        en(n.role, ENUMS.NPC_ROLE, path + '.role'); en(n.status, ENUMS.NPC_STATUS, path + '.status');
        num(n.relationship, path + '.relationship', -100, 100);
        int(n.metTurn, path + '.metTurn', 0); int(n.lastInteractionTurn, path + '.lastInteractionTurn', 0); int(n.lookSeed, path + '.lookSeed', 0);
        if (n.assetId !== null && typeof n.assetId !== 'string') { bad(path + '.assetId must be null or a string'); }
        if (arr(n.memory, path + '.memory') && n.memory.length > cfg.npc.memoryLimit) { bad(path + '.memory has more than ' + cfg.npc.memoryLimit + ' entries'); }
      });
    }

    // story
    if (obj(state.story, 'story')) {
      obj(state.story.flags, 'story.flags'); obj(state.story.counters, 'story.counters');
      if (arr(state.story.history, 'story.history') && state.story.history.length > cfg.story.historyLimit) { bad('story.history exceeds ' + cfg.story.historyLimit + ' entries'); }
      if (arr(state.story.consequences, 'story.consequences')) {
        if (state.story.consequences.length > cfg.story.maxConsequences) { bad('story.consequences.length must be ≤ ' + cfg.story.maxConsequences); }
        state.story.consequences.forEach(function (c, i) { var path = 'consequences[' + i + ']'; if (obj(c, path)) { claim(c.id, path); int(c.dueTurn, path + '.dueTurn', 0); } });
      }
    }

    // stats & log
    if (obj(state.stats, 'stats')) {
      ['peakNetWorth', 'dealsTaken', 'dealsPassed', 'doodadsPaid', 'shortfalls', 'liquidations', 'interestPaid', 'npcInteractions', 'hospitalizations', 'repairSpend', 'interestEarned']
        .forEach(function (k) { num(state.stats[k], 'stats.' + k); });
      arr(state.stats.netWorthHistory, 'stats.netWorthHistory'); arr(state.stats.passiveHistory, 'stats.passiveHistory'); arr(state.stats.healthHistory, 'stats.healthHistory');
      obj(state.stats.eventsByCategory, 'stats.eventsByCategory');
    }
    if (arr(state.log, 'log')) {
      if (state.log.length > cfg.logLimit) { bad('log exceeds ' + cfg.logLimit + ' entries'); }
      state.log.forEach(function (e, i) {
        var path = 'log[' + i + ']'; if (!obj(e, path)) { return; }
        int(e.turn, path + '.turn', 0); en(e.kind, ENUMS.LOG_KIND, path + '.kind'); str(e.text, path + '.text', lim.logTextMax);
        if (e.delta !== undefined && e.delta !== null) { num(e.delta, path + '.delta'); }
      });
    }

    if (state.derived !== null && state.derived !== undefined && !isObj(state.derived)) { bad('derived must be an object (it is regenerated on load)'); }
    return { ok: errors.length === 0, errors: errors };
  }

  // ── migrate (pure) ───────────────────────────────────────────────────────────────────────────────────────────────
  function v1ToV2(s) {
    var cfg = RR.config, m = s.meta;
    var seed = (m.rng && U.isNum(m.rng.seed)) ? m.rng.seed : normalizeSeed();
    var keepState = (m.rng && U.isNum(m.rng.state)) ? m.rng.state : seed;            // v1 saves keep their advanced 'misc' rng state
    var fresh = {}; RR.rng.seedStreams(fresh, seed);
    m.rng = { seed: fresh.seed, state: keepState, streams: fresh.streams };
    m.settings = Object.assign({}, defaultSettings(null), m.settings || {});

    s.loop = s.loop || {};
    s.loop.turnCounters = s.loop.turnCounters || { interactions: 0, healthActions: 0 };
    var dir = s.loop.director = s.loop.director || {};
    dir.recentTemplateIds = dir.recentTemplateIds || []; dir.occurrences = dir.occurrences || {}; dir.lastDrawnTurn = dir.lastDrawnTurn || {};
    dir.droughts = Object.assign(DROUGHT_KEYS.reduce(function (o, k) { o[k] = 0; return o; }, {}), dir.droughts || {});
    dir.queued = dir.queued || []; dir.lastSeverityTurn = dir.lastSeverityTurn || { MAJOR: -99, CRISIS: -99 };

    s.player.health = s.player.health || { value: cfg.health.start, insurance: 'NONE', lastCheckupTurn: -99, lastVacationTurn: -99 };
    s.player.financials.deposits = s.player.financials.deposits || [];
    s.player.financials.modifiers = s.player.financials.modifiers || [];

    s.story = s.story || { flags: {}, counters: {}, history: [], consequences: [] };
    s.stats = Object.assign({ eventsByCategory: {}, npcInteractions: 0, hospitalizations: 0, repairSpend: 0, interestEarned: 0, bankruptcyCause: null, healthHistory: [] }, s.stats || {});

    var inv = s.inventory = s.inventory || { stocks: [], realEstate: [], businesses: [], dreams: [] };
    ['realEstate', 'businesses'].forEach(function (k) {
      (inv[k] || []).forEach(function (a) {
        if (a.condition === undefined) { a.condition = 80; }
        if (a.maintenancePlan === undefined) { a.maintenancePlan = 'NONE'; }
        if (a.insured === undefined) { a.insured = false; }
        if (a.inspected === undefined) { a.inspected = true; }
        if (k === 'realEstate' && a.rentBoostPct === undefined) { a.rentBoostPct = 0; }
        if (k === 'businesses' && a.closedTurnsLeft === undefined) { a.closedTurnsLeft = 0; }
      });
    });

    if (!Array.isArray(s.npcs) || !s.npcs.length) { starterRoster(s); }
    m.schemaVersion = 2;
    return s;
  }

  function migrate(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !input.meta || typeof input.meta !== 'object') { return input; }
    var s = U.deepClone(input);
    var v = s.meta.schemaVersion;
    if (v === undefined || v === 1) {
      try { s = v1ToV2(s); } catch (e) { return input; }       // unusable → hand back untouched; validate() will reject it
    }
    if (s.derived === undefined || s.derived === null) { try { s.derived = RR.ledger.recompute(s); } catch (e) { /* validate will report */ } }
    return s;
  }

  RR.schema = { VERSION: VERSION, ENUMS: ENUMS, SETTING_KEYS: SETTING_KEYS, create: create, validate: validate, migrate: migrate, makeNpc: makeNpc, starterRoster: starterRoster };
})(window.RR);
