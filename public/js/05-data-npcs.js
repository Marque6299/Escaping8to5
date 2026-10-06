/* RAT RACE · 05-data-npcs.js · RR.data.npcs — the 14 NPC templates (Appendix E.1, §2.8.1).
   Shape: { id, role, label, namePool:{first[≥8], last[≥8]}, startKnown, tierStart, startRelationship, bio(≤80), perksKey, art:{outfit} }
   Names are drawn at New Game / NPC_MEET with rng.npc — never by role stereotype: every template draws from a wide, mixed pool.
   `label`, `startRelationship` and `art.outfit` families are Phase 1 additions (additive). */
(function (RR) {
  'use strict';

  // Mixed, culturally diverse, stereotype-free pools. Each template uses a different window so rosters feel varied.
  var FIRST = ['Amara', 'Mateo', 'Priya', 'Jonas', 'Yuki', 'Kofi', 'Elena', 'Omar', 'Sofia', 'Ravi', 'Ingrid', 'Tariq',
               'Mei', 'Lucas', 'Zainab', 'Diego', 'Hana', 'Noor', 'Callum', 'Aiko', 'Tomas', 'Leila', 'Femi', 'Anya',
               'Dmitri', 'Marisol', 'Kwame', 'Sunita', 'Bao', 'Nadia', 'Rico', 'Lourdes'];
  var LAST = ['Okafor', 'Reyes', 'Nakamura', 'Haddad', 'Lindqvist', 'Patel', 'Moreau', 'Mensah', 'Kowalski', 'Tanaka', 'Silva',
              'Ahmadi', 'Brennan', 'Castillo', 'Nguyen', 'Abara', 'Petrov', 'Osei', 'Fernandez', 'Larsen', 'Chen', 'Rahman',
              'Ibrahim', 'Costa', 'Novak', 'Okoye', 'Das', 'Ward', 'Bautista', 'Mercado', 'Santos', 'Villanueva'];

  function window12(arr, offset) {                       // 12 consecutive names, wrapping
    var out = [];
    for (var i = 0; i < 12; i++) { out.push(arr[(offset + i) % arr.length]); }
    return out;
  }
  function pool(i) { return { first: window12(FIRST, i * 5), last: window12(LAST, i * 7 + 3) }; }

  function t(i, id, role, label, known, rel, tier, bio, perksKey, outfit) {
    return { id: id, role: role, label: label, namePool: pool(i), startKnown: known, startRelationship: rel, tierStart: tier,
             bio: bio, perksKey: perksKey, art: { outfit: outfit } };
  }

  RR.data.npcs = [
    t(0,  'sibling',        'FAMILY',  'Sibling',            true,   30, 'FRIENDLY', 'Always texts first, asks for favours second.',          null,       'casual'),
    t(1,  'parent',         'FAMILY',  'Parent',             true,   40, 'FRIENDLY', 'Proud of you, worried about your hours.',               null,       'knit'),
    t(2,  'boss',           'BOSS',    'Boss',               true,   10, 'NEUTRAL',  'Fair, busy, remembers who stays late.',                 'boss',     'office'),
    t(3,  'friend',         'FRIEND',  'Friend',             true,   25, 'FRIENDLY', 'Knows a guy who knows a guy.',                          null,       'casual'),
    t(4,  'banker',         'BANKER',  'Banker',             true,    5, 'NEUTRAL',  'Calm voice, strict spreadsheets.',                      'banker',   'finance'),
    t(5,  'agent',          'AGENT',   'Real-estate agent',  false,   0, 'NEUTRAL',  'Sells houses, mostly by listening.',                    'agent',    'agent'),
    t(6,  'mentor',         'MENTOR',  'Mentor',             false,  15, 'NEUTRAL',  'Retired investor with a notebook.',                     'mentor',   'mentor'),
    t(7,  'handyman',       'HANDYMAN','Handyman',           false,   0, 'NEUTRAL',  'Fixes it once, tells you why.',                         'handyman', 'trade'),
    t(8,  'tenant',         'TENANT',  'Tenant',             false,   0, 'NEUTRAL',  'Pays on the first. Reports leaks on the second.',       'tenant',   'casual'),
    t(9,  'coworker',       'FRIEND',  'Coworker',           false,  10, 'NEUTRAL',  'Lunch is a strategy meeting.',                          null,       'office'),
    t(10, 'neighbor',       'FRIEND',  'Neighbor',           false,  10, 'NEUTRAL',  'Has a ladder and opinions.',                            null,       'knit'),
    t(11, 'accountant',     'ADVISOR', 'Accountant',         false,   5, 'NEUTRAL',  'Finds the deduction you forgot.',                       'advisor',  'smart'),
    t(12, 'rival',          'FRIEND',  'Rival',              false,  -5, 'NEUTRAL',  'Counts your wins as personal losses.',                  null,       'sporty'),
    t(13, 'wealth_advisor', 'ADVISOR', 'Wealth advisor',     false,   5, 'NEUTRAL',  'Quiet suit, loud network.',                             'advisor',  'finance')
  ];
  // Fast-Track-only templates (met on RR.progression.enterFastTrack, Phase 4)
  RR.data.npcs[12].ftOnly = true;
  RR.data.npcs[13].ftOnly = true;

  RR.data.npcsById = {};
  RR.data.npcs.forEach(function (n) { RR.data.npcsById[n.id] = n; });
  RR.data.npcStarterIds = ['sibling', 'parent', 'boss', 'friend', 'banker'];       // known at New Game, in this order
  RR.data.npcMemoryKinds = ['HELPED', 'IGNORED_ILLNESS', 'DEFAULTED', 'REPAID', 'MISSED_WEDDING', 'GIFTED', 'REFUSED_LOAN',
                            'BAD_TIP', 'GOOD_TIP', 'PROUD', 'OVERTIME', 'PROMISE_BROKEN', 'FIXED_PROMPTLY', 'EVICTED'];
})(window.RR);
