/* Acceptance tests 6, 7 (§2.7), 11, 16 (§2.8.7) + store guards, schema validation, v1 migration, NPC data. */
(function () {
  'use strict';
  var U = RR.util;
  function live(name) { RR.store.replace(RR.dev.fixture(name || 'starter'), 'test'); return RR.store.get(); }

  // ── 6 · store ─────────────────────────────────────────────────────────────────────────────────────────────────────
  T.test('6', 'store.commit: rollback on throw · revision +1 per successful commit · nested batch emits once', function () {
    live();
    var rev0 = RR.store.get().meta.revision, cash0 = RR.store.get().player.financials.cash;
    var spy = T.spyWarn();
    var bad;
    try { bad = RR.store.commit('t.throw', function (s) { s.player.financials.cash = 1; throw new Error('boom'); }); } finally { spy.restore(); }
    T.eq(bad.ok, false); T.eq(bad.reason, 'MUTATOR_ERROR');
    T.eq(RR.store.get().player.financials.cash, cash0, 'state restored'); T.eq(RR.store.get().meta.revision, rev0, 'no revision bump on failure');

    var ok = RR.store.commit('t.ok', function (s) { s.player.financials.cash += 100; return 'done'; });
    T.eq(ok.ok, true); T.eq(ok.data, 'done'); T.eq(RR.store.get().meta.revision, rev0 + 1, 'exactly +1');
    T.eq(RR.store.get().derived.assets.cash, cash0 + 100, 'derived recomputed (R7)');

    var soft = RR.store.commit('t.soft', function (s) { s.player.financials.cash = 5; return U.fail('INSUFFICIENT_CASH', 'no'); });
    T.eq(soft.ok, false); T.eq(soft.reason, 'INSUFFICIENT_CASH'); T.eq(RR.store.get().player.financials.cash, cash0 + 100, 'a returned failure also rolls back');
    T.eq(RR.store.get().meta.revision, rev0 + 1);

    var emits = 0, off = RR.bus.on('state:committed', function () { emits++; });
    var b = RR.store.batch('t.batch', function () {
      RR.store.commit('t.a', function (s) { s.player.financials.cash += 1; });
      RR.store.commit('t.b', function (s) { s.player.financials.cash += 2; });
      var inner = RR.store.commit('t.c', function () { throw new Error('inner'); });          // nested failure rolls back alone
      T.eq(inner.ok, false);
    });
    off();
    T.eq(b.ok, true); T.eq(emits, 1, 'one state:committed for the whole batch'); T.eq(RR.store.get().meta.revision, rev0 + 2);
    T.eq(RR.store.get().player.financials.cash, cash0 + 103);

    var spy2 = T.spyWarn();
    try {
      var nan = RR.store.commit('t.nan', function (s) { s.player.financials.cash = NaN; });
      T.eq(nan.ok, false, 'non-JSON-plain state is rejected (R4)'); T.eq(RR.store.get().player.financials.cash, cash0 + 103);
    } finally { spy2.restore(); }
  });

  T.test('6b', 'store guards: live state is read-only outside a commit (R3); log is capped; bumpStat supports dotted keys', function () {
    live();
    T.throws(function () { RR.store.pushLog(RR.store.get(), { kind: 'SYSTEM', text: 'x' }); }, 'pushLog outside commit throws');
    T.throws(function () { U.uid(RR.store.get(), 'x'); }, 'uid outside commit throws');
    var n0 = RR.store.get().meta.idCounter;
    RR.store.commit('t.in', function (s) {
      var id = U.uid(s, 'x'); T.eq(id, 'x_' + U.pad(n0 + 1, 4));
      RR.store.bumpStat(s, 'dealsTaken'); RR.store.bumpStat(s, 'eventsByCategory.DEAL', 2); RR.store.bumpStat(s, 'eventsByCategory.DEAL');
      for (var i = 0; i < RR.config.logLimit + 20; i++) { RR.store.pushLog(s, { kind: 'EVENT', text: 'line ' + i, delta: 5 }); }
      RR.store.pushLog(s, { kind: 'NOPE', text: 'weird\u0000text' });
    });
    var s = RR.store.get();
    T.eq(s.stats.dealsTaken, 1); T.eq(s.stats.eventsByCategory.DEAL, 3); T.eq(s.log.length, RR.config.logLimit, 'log capped at config.logLimit');
    T.eq(s.log[s.log.length - 1].kind, 'SYSTEM'); T.eq(s.log[s.log.length - 1].text, 'weirdtext', 'invisible characters removed');
    T.eq(s.meta.idCounter, n0 + 1);
    // schema.create on a non-live object may use uid freely (guard only protects the live state)
    var fresh = RR.schema.create({ seed: 5 }); T.eq(U.uid(fresh, 'z'), 'z_0012');
  });

  // ── 7 · rng + round trip ─────────────────────────────────────────────────────────────────────────────────────────
  T.test('7', 'Same seed ⇒ identical first 100 rng.next() · export→import round-trip deep-equal (excluding derived)', function () {
    var a = RR.schema.create({ seed: 20261002 }), b = RR.schema.create({ seed: 20261002 }), c = RR.schema.create({ seed: 20261003 });
    var ra = RR.rng.forState(a), rb = RR.rng.forState(b), rc = RR.rng.forState(c), xa = [], xb = [], xc = [];
    for (var i = 0; i < 100; i++) { xa.push(ra.next()); xb.push(rb.next()); xc.push(rc.next()); }
    T.deepEq(xa, xb, 'same seed'); T.ok(JSON.stringify(xa) !== JSON.stringify(xc), 'different seed differs');
    xa.forEach(function (v) { T.ok(v >= 0 && v < 1, 'in [0,1)'); });
    T.deepEq(RR.schema.create({ seed: 77, name: 'Sam' }), RR.schema.create({ seed: 77, name: 'Sam' }), 'create() is deterministic for a fixed clock');

    ['starter', 'rich_rat_race', 'escape_ready', 'broke', 'healthy_saver', 'neglected'].forEach(function (name) {
      var st = live(name), text = RR.save.exportJSON(), r = RR.save.importJSON(text);
      T.ok(r.ok, name + ': import ok — ' + (r.message || ''));
      T.deepEq(T.stripDerived(r.data), T.stripDerived(st), name + ' round-trips');
      T.deepEq(RR.ledger.recompute(r.data), st.derived, name + ': derived regenerates identically');
    });
  });

  // ── 11 · schema v2 ───────────────────────────────────────────────────────────────────────────────────────────────
  var KEYS = {
    meta: ['schemaVersion', 'gameId', 'createdAt', 'updatedAt', 'revision', 'idCounter', 'rng', 'settings'],
    loop: ['status', 'mode', 'phase', 'turn', 'pendingCard', 'pendingDecision', 'lastPayday', 'outcome', 'turnCounters', 'director'],
    director: ['recentTemplateIds', 'occurrences', 'lastDrawnTurn', 'droughts', 'queued', 'lastSeverityTurn'],
    player: ['name', 'professionId', 'dreamId', 'health', 'financials'],
    financials: ['cash', 'salary', 'baseLifestyleExpense', 'childCount', 'creditScore', 'personalAssets', 'liabilities', 'modifiers', 'deposits'],
    inventory: ['stocks', 'realEstate', 'businesses', 'dreams'],
    market: ['economy', 'stocks', 'indices', 'shocks', 'history'],
    stats: ['netWorthHistory', 'passiveHistory', 'peakNetWorth', 'dealsTaken', 'dealsPassed', 'doodadsPaid', 'shortfalls', 'liquidations', 'interestPaid', 'eventsByCategory',
            'npcInteractions', 'hospitalizations', 'repairSpend', 'interestEarned', 'bankruptcyCause', 'healthHistory']
  };
  function hasKeys(obj, keys, where) { keys.forEach(function (k) { T.ok(Object.prototype.hasOwnProperty.call(obj, k), where + '.' + k + ' is missing'); }); }

  T.test('11', 'Schema v2: create() has every key · validate rejects bad states · v1 state migrates and validates', function () {
    var s = RR.schema.create({ name: 'Alex', seed: 20261002 });
    hasKeys(s, ['meta', 'loop', 'player', 'inventory', 'market', 'fastTrack', 'npcs', 'story', 'stats', 'log', 'derived'], 'state');
    hasKeys(s.meta, KEYS.meta, 'meta'); hasKeys(s.meta.rng, ['seed', 'state', 'streams'], 'meta.rng'); hasKeys(s.meta.rng.streams, ['market', 'events', 'deals', 'npc'], 'streams');
    hasKeys(s.meta.settings, RR.schema.SETTING_KEYS, 'meta.settings');
    hasKeys(s.loop, KEYS.loop, 'loop'); hasKeys(s.loop.director, KEYS.director, 'director'); hasKeys(s.loop.turnCounters, ['interactions', 'healthActions'], 'turnCounters');
    hasKeys(s.player, KEYS.player, 'player'); hasKeys(s.player.health, ['value', 'insurance', 'lastCheckupTurn', 'lastVacationTurn'], 'health'); hasKeys(s.player.financials, KEYS.financials, 'financials');
    hasKeys(s.inventory, KEYS.inventory, 'inventory'); hasKeys(s.market, KEYS.market, 'market'); hasKeys(s.stats, KEYS.stats, 'stats'); hasKeys(s.story, ['flags', 'counters', 'history', 'consequences'], 'story');
    T.eq(s.meta.schemaVersion, 2); T.eq(s.meta.idCounter, 11, 'six starter ids + five starter NPCs'); T.eq(s.player.health.value, 80);
    T.eq(s.loop.status, 'TITLE', 'create() never starts the game itself');
    T.eq(s.market.stocks.length, 8); T.eq(s.npcs.map(function (n) { return n.templateId; }).join(','), 'sibling,parent,boss,friend,banker');
    T.eq(s.npcs.map(function (n) { return n.role; }).join(','), 'FAMILY,FAMILY,BOSS,FRIEND,BANKER');
    T.ok(RR.schema.validate(s).ok, 'fresh state is valid: ' + RR.schema.validate(s).errors.join('; '));

    function mut(fn) { var c = JSON.parse(JSON.stringify(s)); fn(c); return RR.schema.validate(c); }
    T.ok(!mut(function (c) { c.npcs[0].relationship = 101; }).ok, 'relationship 101 rejected');
    T.ok(!mut(function (c) { c.npcs[0].relationship = -101; }).ok, 'relationship −101 rejected');
    T.ok(!mut(function (c) { c.player.health.value = NaN; }).ok, 'health NaN rejected');
    T.ok(!mut(function (c) { c.player.health.value = 101; }).ok, 'health 101 rejected');
    T.ok(!mut(function (c) { c.npcs[1].id = c.npcs[0].id; }).ok, 'duplicate NPC ids rejected');
    T.ok(!mut(function (c) { c.player.financials.deposits.push({ id: 'dep_9', kind: 'SAVINGS', label: 'x', balance: -1, apy: 0.01, openedTurn: 0, termMonths: null, maturityTurn: null }); }).ok, 'negative deposit balance rejected');
    T.ok(!mut(function (c) { c.player.financials.deposits.push({ id: 'dep_9', kind: 'SAVINGS', label: 'x', balance: 5, apy: Infinity, openedTurn: 0, termMonths: null, maturityTurn: null }); }).ok, 'infinite apy rejected');
    T.ok(!mut(function (c) { c.story.consequences = new Array(RR.config.story.maxConsequences + 1).fill(0).map(function (_, i) { return { id: 'c_' + i, dueTurn: 1 }; }); }).ok, 'too many consequences rejected');
    T.ok(!mut(function (c) { c.meta.schemaVersion = 3; }).ok, 'unknown schema version rejected');
    T.ok(!mut(function (c) { c.loop.status = 'PLAYING'; }).ok, 'bad enum rejected');
    T.ok(!mut(function (c) { c.player.financials.liabilities[0].collateralAssetId = 're_missing'; }).ok, 'dangling collateral reference rejected');
    T.ok(!mut(function (c) { c.player.name = 'x'.repeat(RR.config.limits.nameMax + 1); }).ok, 'over-long name rejected (R19)');
    T.ok(!mut(function (c) { c.log.push({ turn: 0, kind: 'SYSTEM', text: 'x'.repeat(RR.config.limits.logTextMax + 1) }); }).ok, 'over-long log text rejected');
    T.ok(!RR.schema.validate(null).ok && !RR.schema.validate([]).ok && !RR.schema.validate('x').ok, 'non-objects rejected');
    var rich = RR.dev.fixture('rich_rat_race'); rich.inventory.realEstate[0].condition = 101;
    T.ok(!RR.schema.validate(rich).ok, 'condition 101 rejected');

    // hand-built v1 state → v2
    var v1 = JSON.parse(JSON.stringify(RR.dev.fixture('rich_rat_race')));
    delete v1.npcs; delete v1.story; delete v1.derived; v1.meta.schemaVersion = 1; delete v1.meta.rng.streams; delete v1.meta.settings;
    delete v1.loop.turnCounters; delete v1.loop.director.queued; delete v1.loop.director.lastSeverityTurn; delete v1.player.health; delete v1.player.financials.deposits;
    ['realEstate', 'businesses'].forEach(function (k) { v1.inventory[k].forEach(function (a) { delete a.condition; delete a.maintenancePlan; delete a.insured; delete a.inspected; delete a.rentBoostPct; delete a.closedTurnsLeft; }); });
    ['eventsByCategory', 'npcInteractions', 'hospitalizations', 'repairSpend', 'interestEarned', 'bankruptcyCause', 'healthHistory'].forEach(function (k) { delete v1.stats[k]; });
    var before = JSON.stringify(v1);
    T.ok(!RR.schema.validate(v1).ok, 'a v1 state is not valid v2 as-is');
    var m = RR.schema.migrate(v1);
    T.eq(JSON.stringify(v1), before, 'migrate() does not mutate its input');
    T.eq(m.meta.schemaVersion, 2); T.ok(RR.schema.validate(m).ok, 'migrated state validates: ' + RR.schema.validate(m).errors.join('; '));
    T.eq(m.player.health.value, 80); T.eq(m.npcs.length, 5); T.eq(m.inventory.realEstate[0].condition, 80); T.eq(m.inventory.realEstate[0].maintenancePlan, 'NONE');
    T.eq(m.inventory.realEstate[0].insured, false); T.eq(m.inventory.realEstate[0].inspected, true); T.deepEq(m.player.financials.deposits, []);
    T.eq(m.meta.rng.state, v1.meta.rng.state, 'v1 misc-rng state is preserved'); T.eq(m.meta.rng.streams.market, RR.util.fnv1a32(v1.meta.rng.seed + ':market'));
    T.eq(RR.schema.migrate(m).meta.schemaVersion, 2, 'migrating a v2 state is a no-op'); T.deepEq(RR.schema.migrate(m), m);
  });

  T.test('11b', 'NPC data: 14 templates · ≥8 first/last names · starter roster rules · ids unique across a long game', function () {
    var npcs = RR.data.npcs; T.eq(npcs.length, 14);
    var roles = {}; npcs.forEach(function (n) {
      T.ok(n.namePool.first.length >= 8 && n.namePool.last.length >= 8, n.id + ' name pools');
      T.ok(n.bio.length > 0 && n.bio.length <= 80, n.id + ' bio ≤ 80 chars'); T.ok(['NEUTRAL', 'FRIENDLY', 'TRUSTED', 'COLD', 'HOSTILE'].indexOf(n.tierStart) >= 0);
      T.eq(RR.ledger.npcTier(n.startRelationship), n.tierStart, n.id + ' tierStart matches its starting relationship'); T.ok(n.art && n.art.outfit);
      T.ok(RR.schema.ENUMS.NPC_ROLE.indexOf(n.role) >= 0, n.id + ' role is a valid enum'); roles[n.role] = true;
    });
    T.deepEq(RR.data.npcStarterIds, ['sibling', 'parent', 'boss', 'friend', 'banker']);
    npcs.forEach(function (n) { T.eq(n.startKnown, RR.data.npcStarterIds.indexOf(n.id) >= 0, n.id + ' startKnown'); });
    var s = RR.schema.create({ seed: 9 });
    for (var i = 0; i < 25; i++) { s.npcs.push(RR.schema.makeNpc(s, npcs[i % 14].id, { turn: i })); }
    T.ok(RR.schema.validate(s).ok, 'long roster stays valid: ' + RR.schema.validate(s).errors.join('; '));
    T.eq(RR.ledger.npcTier(60), 'TRUSTED'); T.eq(RR.ledger.npcTier(59), 'FRIENDLY'); T.eq(RR.ledger.npcTier(20), 'FRIENDLY'); T.eq(RR.ledger.npcTier(19), 'NEUTRAL');
    T.eq(RR.ledger.npcTier(-9), 'NEUTRAL'); T.eq(RR.ledger.npcTier(-10), 'COLD'); T.eq(RR.ledger.npcTier(-39), 'COLD'); T.eq(RR.ledger.npcTier(-40), 'HOSTILE');
  });

  T.test('11c', 'Fixtures: all six are valid v2 states; named ones match their spec', function () {
    RR.dev.fixtureNames.forEach(function (n) { var f = RR.dev.fixture(n); T.ok(RR.schema.validate(f).ok, n + ': ' + RR.schema.validate(f).errors.join('; ')); T.eq(f.loop.status, 'RUNNING'); });
    var n = RR.dev.fixture('neglected'); T.eq(n.player.health.value, 25); T.eq(n.player.health.insurance, 'NONE'); T.eq(n.player.financials.cash, 200);
    var h = RR.dev.fixture('healthy_saver'); T.eq(h.player.financials.deposits.length, 1); T.eq(h.player.financials.deposits[0].balance, 10000); T.eq(h.player.financials.deposits[0].apy, 0.015); T.eq(h.player.financials.deposits[0].kind, 'SAVINGS');
    var b = RR.dev.fixture('broke'); T.eq(b.player.financials.cash, 0); T.eq(b.derived.income.salary, 0, 'salary ×0 modifier');
    T.deepEq(RR.dev.fixture('starter'), RR.dev.fixture('starter'), 'fixtures are byte-stable');
  });

  // ── 16 · rng streams ─────────────────────────────────────────────────────────────────────────────────────────────
  T.test('16', 'RNG streams: 1,000 extra npc rolls leave market untouched · stream states survive export→import', function () {
    var seed = 424242;
    var plain = RR.rng.forState(RR.schema.create({ seed: seed })), base = [], i;
    for (i = 0; i < 100; i++) { base.push(plain.stream('market').next()); }
    var other = RR.schema.create({ seed: seed }), r = RR.rng.forState(other), mixed = [];
    for (i = 0; i < 100; i++) { if (i === 3) { for (var k = 0; k < 1000; k++) { r.stream('npc').next(); } } mixed.push(r.stream('market').next()); }
    T.deepEq(mixed, base, 'market sequence is independent of npc rolls');
    T.ok(r.stream('npc').next() !== plain.stream('npc').next(), 'but the npc stream itself advanced');

    var st = RR.schema.create({ seed: seed }); st.loop.status = 'RUNNING';
    var rr = RR.rng.forState(st); ['market', 'events', 'deals', 'npc'].forEach(function (n, j) { for (var q = 0; q < 17 + j; q++) { rr.stream(n).next(); } }); for (var m = 0; m < 5; m++) { rr.next(); }
    var imported = RR.save.importJSON(JSON.stringify({ format: 'rr.save', formatVersion: 1, state: st })).data;
    T.deepEq(imported.meta.rng, st.meta.rng, 'stream states survive export→import');
    var ra = RR.rng.forState(st), rb = RR.rng.forState(imported);
    ['market', 'events', 'deals', 'npc'].forEach(function (n) { for (var z = 0; z < 20; z++) { T.eq(ra.stream(n).next(), rb.stream(n).next(), n + ' continues identically'); } });
    for (var y = 0; y < 20; y++) { T.eq(ra.next(), rb.next(), 'misc continues identically'); }
  });

  T.test('16b', 'RNG API: int is inclusive · weighted respects zero weights · normal has the right shape · unknown stream throws', function () {
    var r = RR.rng.forState(RR.schema.create({ seed: 3 })).stream('deals'), seen = {};
    for (var i = 0; i < 400; i++) { seen[r.int(1, 3)] = true; } T.deepEq(Object.keys(seen).sort(), ['1', '2', '3']);
    for (var j = 0; j < 100; j++) { T.eq(r.weighted([{ w: 0, v: 'a' }, { w: 5, v: 'b' }, { w: 0, v: 'c' }], function (x) { return x.w; }).v, 'b'); }
    T.eq(r.weighted([{ w: 0 }], function (x) { return x.w; }), null, 'all-zero ⇒ null');
    var sum = 0, sq = 0, n = 4000; for (var k = 0; k < n; k++) { var v = r.normal(); sum += v; sq += v * v; }
    T.near(sum / n, 0, 0.08, 'mean ≈ 0'); T.near(sq / n, 1, 0.12, 'variance ≈ 1');
    T.eq(r.chance(0), false); T.eq(r.chance(1), true); T.eq(r.pick([]), undefined);
    T.throws(function () { RR.rng.forState(RR.schema.create({ seed: 1 })).stream('bogus'); });
    var snap = JSON.stringify(RR.store.get().meta.rng); RR.ui.avatar.render(77, { role: 'BANKER' }); T.eq(JSON.stringify(RR.store.get().meta.rng), snap, 'avatars never touch RR.rng (F.4)');
  });
})();
