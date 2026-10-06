/* RAT RACE · 01-config.js · RR.config — every tunable lives here (R9, A12).
   §1.9 verbatim + §1.12.7 merged (v2 values override same-named v1 keys).
   Keys marked "Phase 1 addition" are additive and documented in the handover. */
(function (RR) {
  'use strict';

  RR.config = {
    version: '1.0.0',                        // used for ?v= cache busting (tools/bump-version.mjs, Phase 5)
    stage: { w: 1920, h: 1080 }, historyLength: 48, logLimit: 200, turnsPerYear: 12,
    tax: { salaryRate: 0.20, passiveRate: 0.10 },
    child: { monthlyCost: 350, max: 3 },
    creditCard: { minPaymentFloor: 25, minPaymentPct: 0.03, limit: 10000 },
    credit: { min: 300, max: 850, start: 680, onTimeBonus: 1, shortfallPenalty: -25, liquidationPenalty: -60,
              aprSpreadBands: [[760, 0.00], [700, 0.005], [640, 0.015], [580, 0.03], [0, 0.06]] },   // [minScore, spread]
    aprSpreadByKind: { HOME_MORTGAGE: 0.01, PROPERTY_MORTGAGE: 0.015, STUDENT_LOAN: 0, CAR_LOAN: 0.02,
                       BUSINESS_LOAN: 0.03, BANK_LOAN: 0.025, CREDIT_CARD: 0.15, RETAIL: 0.12 },
    bank: { incomeMultiple: 12, assetLtv: 0.5, maxDti: 0.5, loanStep: 1000, originationFee: 0.01,
            emergencySpread: 0.04, emergencyMinScore: 450, emergencyMaxDti: 0.9, maxLtvMortgage: 0.85 },
    fees: { stockTrade: 0.005, realEstateSell: 0.06, businessSell: 0.05, realEstateClosing: 0.02 },
    liquidation: { order: ['STOCK', 'BUSINESS', 'REAL_ESTATE'], haircut: { STOCK: 0, BUSINESS: 0.25, REAL_ESTATE: 0.15 } },
    stocks: { floorPrice: 0.50 },
    economy: {
      phases: {
        EXPANSION: { stockDrift:  0.04, volMult: 1.0, reDrift:  0.04, bizGrowth:  0.03, bizMultiple: 4.5, duration: [18, 36], next: { PEAK: 0.7, RECESSION: 0.3 }, baseRate: 0.05 },
        PEAK:      { stockDrift:  0.00, volMult: 1.1, reDrift:  0.01, bizGrowth:  0.01, bizMultiple: 5.0, duration: [4, 10],  next: { RECESSION: 0.85, EXPANSION: 0.15 }, baseRate: 0.07 },
        RECESSION: { stockDrift: -0.25, volMult: 1.6, reDrift: -0.06, bizGrowth: -0.12, bizMultiple: 3.0, duration: [6, 14],  next: { RECOVERY: 1 }, baseRate: 0.03 },
        RECOVERY:  { stockDrift:  0.15, volMult: 1.2, reDrift:  0.02, bizGrowth:  0.05, bizMultiple: 3.8, duration: [8, 18],  next: { EXPANSION: 1 }, baseRate: 0.04 }
      },
      inflation: { start: 0.03, min: 0.0, max: 0.08, monthlyNoise: 0.002 }, baseRateEase: 0.10, reNoiseSigma: 0.04, rentNoiseSigma: 0.01,
      lifestyleInflation: { enabled: true, passThrough: 0.5 }                              // v2 (§1.12.7)
    },
    // v2 director (§1.12.7) overrides v1 baseWeights/pityPerTurn; econMult, recentWindow, gracePeriodTurns, graceCategories unchanged.
    director: {
      baseWeights: { DEAL: 0.30, DOODAD: 0.18, LIFE: 0.12, MARKET: 0.09, NPC: 0.10, ASSET: 0.09, QUIET: 0.12 },
      econMult: { PEAK: { DOODAD: 1.2 }, RECESSION: { DEAL: 1.4, DOODAD: 0.8, MARKET: 1.5 }, RECOVERY: { DEAL: 1.2 } },
      pityPerTurn: { DEAL: 0.15, DOODAD: 0.10, LIFE: 0.05, MARKET: 0.05, NPC: 0.06, ASSET: 0.05 },
      recentWindow: 6, gracePeriodTurns: 3, graceCategories: ['DEAL', 'DOODAD', 'QUIET'],
      severity: { crisisCooldown: 4, majorCooldown: 2, mercyLiquidMonths: 0.5 }
    },
    fastTrack: { entryCashMonths: 60, goalIncrease: 25000, dealScale: 10 },               // v1 guesses — tune with RR.sim (Phase 4)

    // ── v2 additions (§1.12.7) ───────────────────────────────────────────────
    health: { start: 80, tiers: [[70, 'GOOD'], [40, 'FAIR'], [1, 'POOR'], [0, 'CRITICAL']],
              salaryFactor: { GOOD: 1, FAIR: 1, POOR: 0.9, CRITICAL: 0 },
              baselineRecovery: 0.5, recoverCap: 75, gym: { costMonth: 45, delta: 1.5 },
              stress: { dtiAbove: 0.5, dtiDrain: 0.5, lowCashMonths: 0.5, lowCashDrain: 0.5, highCashMonths: 3, highCashRelief: 0.5 },
              insurance: { NONE: { premium: 0, coverage: 0 }, STANDARD: { premium: 120, coverage: 0.60 }, COMPREHENSIVE: { premium: 260, coverage: 0.85 } },
              actions: { checkup: { cost: 150, delta: 8, cooldown: 6 }, vacation: { cost: 900, delta: 12, cooldown: 12 } },
              hospital: { healthReset: 35, salaryZeroTurns: 2, cost: [4000, 9000] } },
    deposits: { savingsSpread: -0.020, savingsFloor: 0.005, termSpread: 0.005, termOptions: [6, 12, 24], earlyPenaltyMonths: 3, minOpen: 500, insuredLimit: 250000 },
    property: { decayPerTurn: { CONDO: 0.35, SINGLE_FAMILY: 0.50, DUPLEX: 0.60, APARTMENT_BLOCK: 0.80, COMMERCIAL: 0.60, BUSINESS: 0.70 },
                maintenance: { NONE: { costPctYear: 0, decayMult: 1.0 }, BASIC: { costPctYear: 0.005, decayMult: 0.5 }, FULL: { costPctYear: 0.012, decayMult: 0.15 } },
                insurance: { ratePctYear: 0.005, coverage: 0.80 },
                renovateCostPerPointPctValue: 0.002, startCondition: { GREAT: [80, 95], FAIR: [65, 85], POOR: [40, 65] },
                inspection: { cost: [300, 600], noise: 15 },
                // Phase 1 addition — banded condition factors of F4b (A25), kept as data (R9). [minCondition, factor]
                conditionBands: { rent:  [[80, 1.00], [50, 0.95], [25, 0.85], [0, 0.70]],
                                  value: [[80, 1.00], [50, 0.97], [25, 0.90], [0, 0.80]] } },
    npc: { tiers: [[60, 'TRUSTED'], [20, 'FRIENDLY'], [-9, 'NEUTRAL'], [-39, 'COLD'], [-100, 'HOSTILE']],
           interactionsPerTurn: 2, decayAfterIdleTurns: 8, decayPerTurn: 1, grudgeRecoveryPerTurn: 0.5, memoryLimit: 5,
           actions: { CALL: { cost: 0, delta: 2 }, LUNCH: { cost: 60, delta: 5 }, GIFT: { cost: 150, delta: 8 } },
           perks: { /* F19 table encoded as data — filled in Phase 2 (RR.npc.perks) */ } },
    story: { historyLimit: 100, maxConsequences: 24 },
    ui: { toast: { maxVisible: 4, durationMs: { info: 3000, pos: 3000, neg: 5000, warn: 6000, gold: 4500, premium: 4500 }, dedupeMs: 1000 },
          modal: { maxDepth: 3 }, receipts: { toastMax: 2, stripMax: 6 },
          // Phase 1 additions (additive):
          stage: { minWidth: 900 },
          fx: { tweenMs: 400, flashMs: 600, toastMs: 200, modalMs: 200, coinBurstMin: 1000, confettiMs: 1200, shakeMs: 300, meterMs: 300 },
          ticker: { lines: 3 },
          name: { maxLength: 24, fallback: 'Alex' } },
    sync: { debounceMs: 15000, minIntervalMs: 5000, retryBackoffMs: [2000, 5000, 15000, 60000], snapshotEveryTurns: 12, activityTouchMs: 1800000 },
    account: { inactivityDays: 30, warnDaysBefore: [7, 1] },                              // DISPLAY ONLY on the client — server is authoritative

    // ── Phase 1 additions (additive) ─────────────────────────────────────────
    save: { key: 'rr.save.v1', corruptKey: 'rr.save.v1.corrupt', format: 'rr.save', formatVersion: 1,
            autosaveDebounceMs: 800, maxImportBytes: 2000000, slot: 1 },
    settings: { key: 'rr.settings.v1',
                defaults: { difficulty: 'NORMAL', currencySymbol: '$', animations: true, autosave: true,
                            toasts: true, sound: false, reducedFx: false, tutorialHints: true } },
    assetBase: '',                                                                        // prefix for <img>/file URLs; dev/tests.html overrides it ('../public/')
    ledger: { ratioCap: 99 },                                                             // cap for "months" ratios when expenses = 0
    limits: { logTextMax: 200, labelMax: 80, nameMax: 60 }                                // string-length caps enforced by validate (R19)
  };
})(window.RR);
