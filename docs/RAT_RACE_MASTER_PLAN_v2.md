# RAT RACE — Financial Freedom RPG
## MASTER IMPLEMENTATION PLAN · Plan v2.0 · State Schema v2 · Online Edition

> **What this file is:** the single source of truth for a multi-session build. An AI that reads it in a fresh chat, with no prior history, must be able to execute any Phase without guessing.
> **What it is not:** implementation code. Code is produced phase by phase, in separate sessions.
> **Human workflow:** upload this file → say **"Execute Phase N"** (or **"Execute Phase N, Step N.M"** for a smaller bite) → paste the AI's *Handoff Log entry* into §10 → repeat. Steps marked 🔒 need you to do a dashboard task first (Appendix I) — the AI will ask.
> **Hosting:** repo on **GitHub** · static site on **Netlify** · backend on **Supabase** (Auth, Postgres, Edge Functions, cron).

| Phase | Name | Game / service state after the phase |
|---|---|---|
| 1 | Architecture, UI Foundation, Art/UI kit & Schema v2 | Title → New Game → fully populated Living Ledger (no turns yet); toasts, modals, icons, avatars, scenes ready |
| 2 | Core Loop, Life Systems & Choices | Playable month loop with payday, **NPC relationships, health, choices with delayed consequences, random events** |
| 3 | Market, Assets, Deposits & Property | Full economy: stocks, real estate **with condition/maintenance**, businesses, loans, **deposits**, **price-shock events**, liquidation, bankruptcy |
| 4 | Progression, Fast Track & Simulator | Complete **offline** game: escape, Fast Track, victory/loss + story recap, balance simulator |
| 5 | Accounts, Cloud Save & Sync | **Register / sign in (email or Google)**, profile, cloud saves, cross-device continue, conflict handling |
| 6 | Lifecycle (30-day rule), Premium & Admin | **Inactive accounts deleted after 30 days — except Premium and Admins**, Stripe Premium, MFA admin console, export/delete my data |
| 7 | Content, Art, Audio & Polish | ≥ 120 events, final graphics, procedural audio, onboarding, accessibility, performance |
| 8 | Security, CI/CD, Launch & Live Ops | Hardened, monitored, recoverable production service (+ optional leaderboard) |

Dependency chain: 1 → 2 → 3 → 4 (offline game complete) → 5 → 6 → 8; **Phase 7 can run in parallel after Phase 4**. **Every phase MUST leave the game playable by double-clicking `public/index.html` as a Guest** (online features show as disabled when opened from `file://`).

### What changed in v2.0 (summary for the owner)
| Your request | Where it lives in this plan |
|---|---|
| Playable on **account level**; **registration via Google or manual** | §1.12.2 (account levels) · §6 (Phase 5: Auth, profile, cloud save, sync, conflicts) · Appendix D (RLS-secured schema) |
| **30-day inactivity → data deleted, except Premium and Admins** | §7.2 (authoritative rule, warnings at day 23/29, dry-run launch gate, safeguards) · Appendix D.4–D.5 · §7.4–7.5 (Premium, Admin) |
| **Graphics, icons, NPCs** | §2.8.2 · Appendix F (icons, 20 scenes, avatar generator, FX, audio) · Appendix E.1 (14 NPCs) |
| **Toasts & modals** | §2.8.3 (toast/modal managers + modal catalogue) · §1.12.11 (feedback contract for every effect) |
| **Choices & consequences** | §1.12.4–1.12.5 (SCHEDULE / flags / outcomes) · §3.11 · Appendix E.2–E.4 (conventions, 6 story arcs) |
| **Random events** affecting prices, markets, NPC relationships, property condition, health, account balance, deposits, portfolio | §3.11.4 (Event Director v2) · §4.9 (deposits, property, price shocks) · Appendix E.3 (≈ 110 listed event templates mapped to each area, plus a 24-template growth pack) |
| **GitHub + Netlify** | Appendix G (repo layout, branching, `netlify.toml` with CSP, CI/CD, secret map) · Appendix I (human setup checklist) |
| Items that need your decision | **Appendix J** (e.g., phones vs desktop, payment provider, naming/trademark risk) |

---

## 0. HOW TO USE THIS DOCUMENT (AI: READ THIS FIRST)

### 0.1 Invocation protocol
When the user says **"Execute Phase N"**:

1. Read **§1 (Universal Context Header)** completely — **including §1.12 (the v2 contract, which wins over older text)**. It applies to every phase.
2. Read **only** the requested Phase section, plus **§10 (Session Handoff Log)** to learn what earlier sessions actually built.
3. If the user uploaded existing project files, the **real code is the truth for what is implemented**; this document is the truth for **intended design**. Do not silently "fix" either side — list every divergence in your Completion Report.
4. Build exactly the phase's numbered **Build Steps**. Do not build later phases. Where a later phase is needed, leave the stub listed in this phase's **Stub Registry**.
5. Output a file tree first, then every file **in full** (no "rest of code here" placeholders). If the phase is too large for one reply, stop cleanly at a Step boundary, say which Step comes next, and wait for the user to say "Continue".
6. Run (mentally or via the in-repo test page) every **Acceptance Test** for the phase and report PASS/FAIL.
7. End with the **Phase Completion Report** (§0.3).

If the user says **"Execute Phase N, Step N.M"**: build only that step, assuming all earlier steps exist.

**v2 additions to the protocol.** (a) For Phases 5–8 also read Appendix D (SQL/Edge Functions), G (repo/CI), H (threats) and I (human setup). (b) Steps marked 🔒 depend on a **Human Checkpoint (HC-n, Appendix I)**: ask the human to confirm it; if it isn't done, build against placeholders/fakes and log `BLOCKED-ON-HC-n`. (c) Before writing any Supabase SQL or SDK code, **re-check the current Supabase docs/changelog** (R17) and use the Supabase skills if available — platform defaults change. (d) Never ask the human to paste secrets into chat; only public values (URLs, publishable keys, site keys) are ever shared.

### 0.2 Non-negotiable engineering rules
| # | Rule |
|---|---|
| R1 | **Vanilla runtime.** The game in `public/` is HTML/CSS/JS only: no frameworks, bundlers, npm *at runtime*, CDNs, or web fonts. It must run from `file://` by double-click (Guest/OFFLINE mode). Therefore: **classic `<script>` tags, one global namespace `RR`, no ES-module `import/export`.** *Exceptions (A13, A27):* one **vendored, pinned** supabase-js UMD build in `public/vendor/` (classic script, used only by `RR.auth`/`RR.cloud`) and **dev-only** tooling in `tools/` and `dev/` may use Node; neither may be required to run the offline game. |
| R2 | **Strict layering.** UI modules (`RR.ui.*`) never mutate game state. Engine modules never touch the DOM. All communication = `RR.store.commit(...)` + `RR.bus` events + the *Presenter* hook (§1.4). This keeps engines runnable headless (tests, balance simulator). |
| R3 | **One mutation gateway.** All state changes happen inside `RR.store.commit(label, mutator)`. Only exemptions: `meta.rng.state` (advanced by `RR.rng`). |
| R4 | **State is plain JSON.** No functions, Dates, Maps, Sets, class instances, `NaN`, `Infinity`, or `undefined` inside state. |
| R5 | **Determinism.** All game randomness via `RR.rng` (seeded, state saved in `meta.rng`). `Math.random()` is forbidden in engines (allowed only for cosmetic UI particles). `uid()` uses `meta.idCounter`, never timestamps. |
| R6 | **Money = integer whole dollars.** Only per-share fields (`price`, `avgCost`, `dpsAnnual`) and index/ratio fields are floats (money floats rounded to 2 dp via `round2`). Aggregate amounts always pass through `roundMoney` (Math.round, `-0` → `0`). |
| R7 | **`state.derived` is read-only for everyone except `RR.ledger.recompute`**, which `RR.store` runs automatically after every commit. Never hand-edit derived values. |
| R8 | **Every engine action returns a `Result`** (§1.6) — never throws for expected failures (insufficient cash, wrong phase). |
| R9 | **No magic numbers.** Tunables live in `RR.config` (§1.9). |
| R10 | **Phase gating.** Player actions are legal only in the phases listed in the Action Gate table (§1.4). Engines enforce this; UI merely hides buttons. |
| R11 | **Accessibility baseline.** Keyboard-operable controls, visible focus ring, `aria-live="polite"` on ledger totals, `prefers-reduced-motion` respected. |
| R12 | **Do not rename or restructure schema fields** without the Schema Change Protocol (§0.4). |
| R13 | **Engines are network-free.** Only `RR.auth`, `RR.cloud`, `RR.sync`, `RR.entitlements`, the cloud `RR.persist` adapter and the admin page may touch the network. Engines (`turn payday effects events market assets debt npc story health deposits property progression sim`) never reference the SDK, `fetch`, or the DOM. |
| R14 | **Secrets.** Only the Supabase URL, the *publishable* key, the CAPTCHA *site* key and the site URL may appear in the browser or the repo. Service/secret keys, Stripe keys, webhook secrets and email/SMTP keys live only in Supabase function secrets, Vault, or GitHub environments. A secret under `public/` is a build-breaking defect. |
| R15 | **Database security.** Every table in an exposed schema has RLS enabled, explicit `GRANT`s, and policies using `TO authenticated` plus ownership predicates with `(select auth.uid())`; UPDATE policies carry `USING` **and** `WITH CHECK`; authorisation never reads `user_metadata`; no `SECURITY DEFINER` function in `public` (use schema `private` with `search_path = ''`); views use `security_invoker`. |
| R16 | **Server authority.** Entitlements, retention/deletion, admin status and quotas are decided by the server; the client only displays them. Hiding a button is never enforcement. |
| R17 | **Migrations only.** Database changes ship as reviewed migration files applied dev → prod; never hand-edit prod; run the Supabase advisors before merging; re-check current Supabase docs before writing SQL or SDK code. |
| R18 | **Every user-visible state change has a toast or a log line (or both)** — see §1.12.11. |
| R19 | **Untrusted strings** (display names, NPC names, save labels, cloud/imported states) are rendered with `textContent` only; imported and cloud states pass `validate(migrate(…))` before use; no inline scripts or inline styles in HTML (CSP). |
| R20 | **Replayability.** Every player-initiated mutation is registered in `RR.ui.actions` and recorded by `RR.replay` (`turn, phase, name, args`) so a run can be replayed headlessly from `{seed, profile, actions}`. |
| R21 | **Offline-first.** Play never blocks on the network; sync is a background concern; failures degrade to `LOCAL_ONLY`/`OFFLINE` with a visible status; the game is always playable as a Guest. |

### 0.3 Phase Completion Report (end every session with exactly this)
```
PHASE COMPLETION REPORT
- Phase / Steps completed:
- Files created or modified (path — one-line purpose):
- Public API: signatures that differ from the plan, or were added:
- Schema changes (field, reason) — bump meta.schemaVersion if shape changed:
- Migrations / Edge Functions / config or secrets added (names only, never values):
- Security checklist R13–R21: PASS/FAIL + notes:
- Human checkpoints (HC-n) needed or blocked:
- Stubs left behind (function → phase that replaces it):
- Acceptance tests (each: PASS / FAIL + note):
- Known issues / tech debt:
- Suggested next step:
- HANDOFF LOG ENTRY (copy-paste ready for §10):
```

### 0.4 Schema Change Protocol
- **Additive** field (new optional key with a safe default): allowed; document it in the report; add the default in `RR.schema.create` and `migrate`.
- **Breaking** change (rename, type change, removal): requires `meta.schemaVersion++`, a `migrate(oldState)` branch, updated fixtures, and an explicit line in the report asking the user to paste the new schema into §1.5 of this document.
- Never change the schema in a session whose Phase doesn't own that key (see write-permission matrices, §1.10 and §1.12.8).
- **Database schema (R17):** additive changes (new nullable column / new table with safe defaults and RLS) are allowed as a new migration. Breaking changes use **expand → deploy client that reads both → contract**, are recorded in §10, and bump `app_config.client.min_version`. Never edit an applied migration file.

---

## 1. UNIVERSAL CONTEXT HEADER (THE ANCHOR)

### 1.1 Project summary
**Rat Race** is a single-player, browser-based financial-literacy simulation RPG. The player is a salaried worker with a paycheck, monthly bills, and debts — trapped in "the Rat Race." One **turn = one month**. By buying income-producing assets (dividend stocks, rental property, businesses), using debt wisely, and resisting consumer temptations ("Doodads"), the player grows **passive income**. When **passive income > total monthly expenses**, the player **escapes** to the **Fast Track**: quit the job, play at 10× scale, and win by buying a **Dream** or reaching an **Empire** passive-income goal. Reckless leverage, debt spirals, and market crashes can end the game in **bankruptcy**.

**Learning outcomes the mechanics must teach:** cash flow vs. net worth · assets vs. liabilities · good vs. bad debt · interest and amortization · leverage and its risk · diversification · credit score · why passive income is taxed differently · cost of lifestyle creep.

### 1.2 Core mechanics (the game in 10 rules)
1. **Turn = month.** Sequence: `START → PAYDAY → (SHORTFALL) → MARKET → EVENT → ACTION → CLEANUP`.
2. **Living Ledger:** Income Statement + Balance Sheet are always visible and always *derived* from state.
3. **Cash flow** `= totalIncome − totalExpenses`, settled every Payday.
4. **Productive assets** (stocks, real estate, businesses) create passive income; **personal assets** (home, car) don't.
5. **Debt** has APR, structure (amortizing / interest-only / revolving), and a credit-score-based price. Debt tied to an asset is netted inside that asset's cash flow.
6. **One event card per turn** from four categories: **DEAL**, **DOODAD**, **LIFE**, **MARKET** (+ **QUIET** educational filler).
7. **Market** is seeded-stochastic: economic cycle (expansion/peak/recession/recovery), stock random walks, real-estate and business indices.
8. **Shortfall** (cash < 0 after Payday) forces a choice: emergency loan, sell assets, or forced liquidation; failure ⇒ **bankruptcy**.
9. **Escape condition (strict):** `passive income > total expenses`.
10. **Fast Track:** salary vanishes, deals ×10, new risks; win by **Dream** (cash purchase) or **Empire** (passive ≥ goal).

### 1.3 UI philosophy & design system
- **Stage:** fixed **1920×1080 (16:9)** design canvas, uniformly scaled with `transform: scale(min(innerWidth/1920, innerHeight/1080))`, letterboxed, centered. Author everything in px on that canvas. Below ~900px viewport width show a "please enlarge/rotate" notice (portrait phones unsupported in v1).
- **Dark-mode only** (v1). **Glassmorphism:** translucent surfaces, `backdrop-filter: blur()`, 1px light borders, soft shadows, subtle gradient mesh background.
- **Typography:** system font stack only; `font-variant-numeric: tabular-nums` for all money.
- **Color semantics (never reuse for other meanings):** positive = emerald · negative = rose · passive income = cyan · caution = amber · Fast Track accent = gold.
- **Motion:** 150–300 ms; numeric tweening on ledger changes; green/red delta flash; all disabled when `settings.animations === false` or `prefers-reduced-motion`.
- **Mode theming:** `<body data-mode="RAT_RACE|FAST_TRACK">` swaps CSS variables only (no layout change).

```css
:root[data-mode="RAT_RACE"], body[data-mode="RAT_RACE"] {
  --bg-0:#070b14; --bg-1:#0d1424;
  --glass-bg:rgba(255,255,255,.06); --glass-bg-strong:rgba(255,255,255,.10);
  --glass-border:rgba(255,255,255,.14); --glass-blur:18px; --glass-shadow:0 8px 32px rgba(0,0,0,.45);
  --text-hi:#eef3ff; --text-md:#aab6d3; --text-lo:#6f7c9c;
  --pos:#34d399; --neg:#fb7185; --passive:#22d3ee; --warn:#fbbf24; --accent:#7c9cff;
  --r-lg:20px; --r-md:14px; --r-sm:10px;
}
body[data-mode="FAST_TRACK"] { --bg-0:#0b0906; --bg-1:#1a1407; --accent:#f5c451; --passive:#fde68a; --glass-border:rgba(245,196,81,.25); }
```

**Layout wireframe (1920×1080):**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HUD (h≈96): Year·Month │ Mode badge │ Phase stepper │ Cash │ Net Worth │ FREEDOM METER │
├────────────────────┬──────────────────────────────────┬──────────────────────┤
│ INCOME STATEMENT   │ STAGE (center, 50%)              │ BALANCE SHEET        │
│  Income            │  · Event card / Deal analyzer    │  Assets              │
│  Passive subtotal  │  · Payday summary                │  Liabilities         │
│  Expenses          │  · Market ticker / Action dock   │  Net Worth           │
│  Cash Flow (big)   │                                  │                      │
├────────────────────┴──────────────────────────────────┴──────────────────────┤
│ ACTION BAR: [Next Month] [Market] [Portfolio] [Bank]  │  LOG TICKER (last 3)  │
└──────────────────────────────────────────────────────────────────────────────┘
 columns: 25% / 50% / 25% · gap 24px · outer padding 32px
```

### 1.4 Tech stack & architecture
**Stack:** vanilla HTML/CSS/JS, `localStorage` persistence through `RR.persist` adapters (local always; cloud from Phase 5), inline SVG for sparklines/meters/art. No build step. Hosted as a static site on Netlify with a Supabase backend (Auth, Postgres, Edge Functions) — topology in §1.12.1.

**Namespace & load order.** One global `window.RR`. Scripts load in numeric filename order via `<script src>` tags in `index.html`.

| File (js/) | Module | Phase |
|---|---|---|
| `00-namespace.js` | `RR` root, version, getter `RR.state` → `RR.store.get()` | 1 |
| `01-config.js` | `RR.config` | 1 (extended later) |
| `02-util.js` | `RR.util` (math, fmt, uid, path helpers) | 1 |
| `03-bus.js` | `RR.bus` pub/sub | 1 |
| `04-rng.js` | `RR.rng` seeded PRNG | 1 |
| `05-data-*.js` | `RR.data.{professions, stocks, dreams, glossary}`; later `events`, `deals`, `fasttrack` | 1–4 |
| `06-schema.js` | `RR.schema` create/validate/migrate | 1 |
| `07-store.js` | `RR.store` commit-and-rebind | 1 |
| `08-finance.js` | `RR.finance` pure debt/credit math | 1 |
| `09-valuation.js` | `RR.valuation` pure asset valuation | 1 |
| `10-ledger.js` | `RR.ledger.recompute` | 1 |
| `11-save.js` | `RR.save` | 1 |
| `12-ui-stage.js` … `17-ui-screens.js` | `RR.ui.{stage, binder, fx, overlays, panels, screens, actions}` | 1 |
| `18-dev.js` | `RR.dev` (fixtures, dev drawer) | 1 |
| `20-turn.js` `21-payday.js` `22-effects.js` `23-events.js` `24-data-events.js` `25-ui-turn.js` | `RR.turn`, `RR.payday`, `RR.effects`, `RR.events`, UI | 2 |
| `30-market.js` `31-assets.js` `32-debt.js` `33-ui-market.js` `34-ui-portfolio.js` `35-ui-bank.js` `36-data-deals.js` | `RR.market`, `RR.assets`, `RR.debt`, UI | 3 |
| `40-progression.js` `41-fasttrack.js` `42-data-fasttrack.js` `43-ui-progression.js` `44-sim.js` | `RR.progression`, `RR.fastTrack`, `RR.sim`, UI | 4 |
| `90-app.js` | `RR.app.boot()` | 1 |

*v2 files/modules: §1.12.9. All runtime paths below are relative to `public/` (§1.12.1).*

CSS: `css/tokens.css`, `base.css`, `glass.css`, `ledger.css`, `modes.css` (+ phase-specific sheets). Dev: `dev/tests.html`, `dev/tests/*.js` (and `dev/sim.html` in Phase 4).

**State management — "Commit-and-Rebind".**
```
UI event ─▶ engine fn (RR.payday.run, RR.assets.buyStock …)
                └▶ RR.store.commit('module.action', state => { …mutate in place… })
                       ├ snapshot (deepClone) for rollback
                       ├ run mutator; on throw → restore snapshot, return {ok:false, reason:'MUTATOR_ERROR'}
                       ├ meta.revision++, meta.updatedAt
                       ├ state.derived = RR.ledger.recompute(state)
                       ├ trim log to config.logLimit
                       ├ bus.emit('state:committed', {label, revision})
                       └ debounced autosave
UI: RR.ui.binder.refresh(state) on 'state:committed' (diff-based DOM updates; tween + flash)
```
Nested commits inside `RR.store.batch(label, fn)` collapse into one notification. Commit labels use `module.action` (e.g. `payday.run`, `assets.buyStock`).

**Bus topics (canonical):** `state:committed`, `turn:phase`, `turn:started`, `payday:done`, `card:drawn`, `card:resolved`, `market:ticked`, `asset:bought`, `asset:sold`, `debt:taken`, `debt:paid`, `shortfall:opened`, `liquidation:done`, `mode:changed`, `game:ended`, `ui:toast`.

**Presenter pattern (keeps engines headless).** `RR.turn.setPresenter({ before(phase, state) → Promise|void })`. Default presenter resolves immediately (tests, simulator). The UI presenter awaits animations/modals (e.g. waits for the player to dismiss the Payday summary) before the engine advances.

**Action Gate table (R10)**

| Action family | Legal when `loop.phase ===` |
|---|---|
| Resolve event card | `EVENT` (and `loop.pendingCard != null`) |
| Trade stocks, buy/sell assets, take/repay loans, buy Dream, "Break Free" | `ACTION` |
| Resolve shortfall (emergency loan / sell / liquidate) | `SHORTFALL` |
| End turn | `ACTION` and no pending card/decision |
| Everything | blocked if `loop.status !== 'RUNNING'` or `loop.pendingDecision` is of a type that doesn't own the action |

**UI-only state** (open drawers, selected tab, hover) lives in `RR.ui.state`, is never saved, and never enters `RR.store`.

### 1.5 GLOBAL STATE OBJECT SCHEMA (the cross-chat contract)
JSONC below (comments are explanatory; the real state is plain JSON). Values shown are the **Teacher starter profile** at game start. **`RR.schema.create()` must produce exactly this shape.**

```jsonc
{
  "meta": {
    "schemaVersion": 1,
    "gameId": "rr_0001",
    "createdAt": "2026-10-02T00:00:00.000Z",     // ISO string, set once
    "updatedAt": "2026-10-02T00:00:00.000Z",
    "revision": 0,                                // +1 per commit
    "idCounter": 6,                               // RR.util.uid() increments (starter ids d_0001-4, pa_0001-2 pre-used)
    "rng": { "seed": 20261002, "state": 20261002 },   // mulberry32; state advanced by RR.rng
    "settings": { "difficulty": "NORMAL", "currencySymbol": "$", "animations": true, "autosave": true }
  },

  "loop": {                                       // ── GAME LOOP STATUS ──
    "status": "TITLE",                            // TITLE | RUNNING | GAME_OVER
    "mode": "RAT_RACE",                           // RAT_RACE | FAST_TRACK
    "phase": "IDLE",                              // IDLE|START|PAYDAY|SHORTFALL|MARKET|EVENT|ACTION|CLEANUP|TRANSITION|ENDED
    "turn": 0,                                    // 0 before first turn; turn 1 = Year 1 · Month 1 (Jan)
    "pendingCard": null,                          // EventCard | null
    "pendingDecision": null,                      // Decision | null
    "lastPayday": null,                           // PaydayReport | null
    "outcome": null,                              // null | { "type": "DREAM"|"EMPIRE"|"BANKRUPT", "turn": 0 }
    "director": {                                 // Event Director bookkeeping (Phase 2)
      "recentTemplateIds": [],
      "occurrences": {},                          // templateId → times drawn
      "lastDrawnTurn": {},                        // templateId → turn
      "droughts": { "DEAL": 0, "DOODAD": 0, "LIFE": 0, "MARKET": 0 }   // turns since last of category
    }
  },

  "player": {                                     // ── PLAYER FINANCIALS ──
    "name": "Alex",
    "professionId": "teacher",
    "dreamId": "island_resort",
    "financials": {
      "cash": 3000,
      "salary": 3500,                             // base gross monthly job income (pre-modifier)
      "baseLifestyleExpense": 800,                // "other expenses" line
      "childCount": 0,
      "creditScore": 680,                         // 300..850
      "personalAssets": [                         // non-income assets; excluded from liquidation
        { "id": "pa_0001", "label": "Home", "value": 100000 },
        { "id": "pa_0002", "label": "Car",  "value": 8000 }
      ],
      "liabilities": [ /* Debt[] — starter: d_0001 HOME_MORTGAGE, d_0002 STUDENT_LOAN, d_0003 CAR_LOAN, d_0004 CREDIT_CARD (see §1.9) */ ],
      "modifiers": [ /* Modifier[] — temporary/permanent income & expense adjustments */ ]
    }
  },

  "inventory": {                                  // ── INVENTORY (productive holdings) ──
    "stocks": [ /* StockHolding[] — one per symbol */ ],
    "realEstate": [ /* RealEstateAsset[] */ ],
    "businesses": [ /* BusinessAsset[] */ ],
    "dreams": [ /* { id, name, cost, purchasedTurn }[] — Fast Track */ ]
  },

  "market": {                                     // ── MARKET STATE ──
    "economy": {
      "phase": "EXPANSION",                       // EXPANSION | PEAK | RECESSION | RECOVERY
      "phaseTurnsLeft": 24,
      "baseRate": 0.05,                           // prime-style APR anchor for new loans
      "inflationRate": 0.03,                      // annual
      "inflationIndex": 1.0                       // compounding monthly
    },
    "stocks": [                                   // 8 tradable stocks (see §1.9 universe)
      { "symbol": "UTLX", "name": "Unity Power & Water", "sector": "UTILITIES",
        "price": 48.00, "prevPrice": 48.00, "mu": 0.06, "sigma": 0.15, "dpsAnnual": 2.40, "history": [48.00] }
    ],
    "indices": { "realEstatePrice": 1.0, "realEstateRent": 1.0, "businessMultiple": 4.0 },
    "shocks": [ /* Shock[] — active market shocks */ ],
    "history": { "realEstatePrice": [1.0], "businessMultiple": [4.0] }   // capped at config.historyLength
  },

  "fastTrack": {                                  // owned by RR.progression (Phase 4)
    "unlocked": false,
    "enteredTurn": null,
    "ratRaceSummary": null,                       // { turns, netWorth, passive, expenses, cash } snapshot at escape
    "baselinePassive": 0,
    "goalPassive": 0,                             // baselinePassive + config.fastTrack.goalIncrease
    "dream": { "id": "island_resort", "name": "Private Island Resort", "cost": 600000, "purchased": false }
  },

  "stats": { "netWorthHistory": [], "passiveHistory": [], "peakNetWorth": 0,
             "dealsTaken": 0, "dealsPassed": 0, "doodadsPaid": 0, "shortfalls": 0, "liquidations": 0, "interestPaid": 0 },

  "log": [ /* { "turn": 1, "kind": "PAYDAY|EVENT|TRADE|DEBT|MARKET|SYSTEM|MILESTONE", "text": "…", "delta": 919 } — capped at config.logLimit */ ],

  "derived": {                                    // READ-ONLY. Written only by RR.ledger.recompute via RR.store. Regenerated on load.
    "income":   { "salary": 3500, "dividends": 0, "realEstate": 0, "business": 0, "passive": 0, "other": 0, "total": 3500 },
    "expenses": { "taxes": 700, "lifestyle": 800, "children": 0, "debtService": 1081, "assetDrag": 0, "other": 0, "total": 2581 },
    "monthlyCashflow": 919,
    "assets":      { "cash": 3000, "stocks": 0, "realEstate": 0, "business": 0, "productive": 0, "personal": 108000, "total": 111000 },
    "liabilities": { "total": 108500, "byKind": { "HOME_MORTGAGE": 85000, "STUDENT_LOAN": 12000, "CAR_LOAN": 9000, "CREDIT_CARD": 2500 } },
    "netWorth": 2500,
    "ratios":   { "passiveCoverage": 0, "debtToIncome": 0.31, "liquidMonths": 1.16 },   // passive/expenses · debtService/income · cash/expenses
    "escape":   { "met": false, "passive": 0, "expenses": 2581, "gap": 2581, "progressPct": 0 },
    "goal":     { "passive": 0, "goalPassive": 0, "progressPct": 0 }                   // Fast Track meter (0s in Rat Race)
  }
}
```

### 1.6 Entity shapes (referenced by the schema)

```jsonc
// Debt  (state.player.financials.liabilities[])
{ "id": "d_0001", "kind": "HOME_MORTGAGE",           // see DebtKind enum
  "label": "Home Mortgage", "structure": "AMORTIZING", // AMORTIZING | INTEREST_ONLY | REVOLVING
  "principal": 85000, "originalPrincipal": 85000,
  "apr": 0.065,                                       // fixed at origination
  "termMonthsRemaining": 300,                         // AMORTIZING only, else null
  "monthlyPayment": 574,                              // AMORTIZING: fixed scheduled; others recomputed by finance.scheduledPayment
  "collateralAssetId": null,                          // inventory asset id → payment is netted inside that asset's cash flow
  "originTurn": 0, "prepayable": true, "status": "CURRENT" }   // CURRENT | DELINQUENT

// Modifier  (temporary or permanent adjustment)
{ "id": "m_0007", "label": "Downsized — job search", "target": "SALARY",   // SALARY | INCOME | EXPENSE
  "mode": "MULTIPLY", "value": 0, "turnsLeft": 3,     // turnsLeft null = permanent
  "sourceTemplateId": "life_downsized" }
// SALARY: MULTIPLY and ADD allowed · INCOME and EXPENSE: ADD only (monthly dollars)

// StockHolding  (one per symbol; buying more merges and recomputes avgCost)
{ "id": "h_0012", "symbol": "UTLX", "shares": 100, "avgCost": 47.35, "openedTurn": 9 }

// RealEstateAsset
{ "id": "re_0001", "templateId": "deal_re_duplex", "name": "Maple St Duplex",
  "kind": "DUPLEX",                                   // CONDO | SINGLE_FAMILY | DUPLEX | APARTMENT_BLOCK | COMMERCIAL
  "tier": "RAT_RACE", "purchaseTurn": 14,
  "purchasePrice": 120000, "downPayment": 24000, "closingCosts": 2400,
  "baseMonthlyRent": 1500, "baseMonthlyOpex": 450,    // at purchase
  "priceIndexAtPurchase": 1.0, "rentIndexAtPurchase": 1.0, "inflationIndexAtPurchase": 1.0,
  "vacantTurnsLeft": 0, "debtId": "d_0007", "lifetimeCashflow": 0 }

// BusinessAsset
{ "id": "biz_0001", "templateId": "deal_biz_laundromat", "name": "SpinCycle Laundromat",
  "kind": "LAUNDROMAT", "tier": "RAT_RACE", "purchaseTurn": 20,
  "purchasePrice": 60000, "downPayment": 20000,
  "baseMonthlyRevenue": 4200, "baseMonthlyCosts": 3300,
  "revenueIndex": 1.0,                                // random-walked by Market.tick (per business)
  "riskSigma": 0.20,                                  // annual volatility of revenue
  "inflationIndexAtPurchase": 1.0, "debtId": "d_0008", "lifetimeCashflow": 0 }

// Shock  (market.shocks[])
{ "id": "shock_0003", "label": "Chip shortage", "scope": "SECTOR:TECH",   // ALL | SECTOR:<SECTOR> | RE | BIZ
  "muDelta": -0.30, "sigmaMult": 1.5, "turnsLeft": 4 }

// EventTemplate  (RR.data.events — static content)
{ "id": "life_baby", "category": "LIFE",              // DEAL | DOODAD | LIFE | MARKET | QUIET
  "tier": ["RAT_RACE"], "weight": 6,
  "requires": { "minTurn": 6, "maxChildren": 2 },     // optional filters (see §3 director)
  "cooldownTurns": 12, "maxOccurrences": 3, "forced": true,   // forced = cannot be skipped
  "title": "A little surprise", "body": "…",
  "options": [ { "id": "ok", "label": "Welcome the baby", "ops": [ { "op": "CHILD_DELTA", "value": 1 } ] } ] }
// DEAL templates add: "dealKind": "REAL_ESTATE"|"BUSINESS", "params": { …ranges… } and options with "handler": "ASSETS_ACCEPT_DEAL"

// EventCard  (instantiated; loop.pendingCard)
{ "id": "evt_0031", "templateId": "doodad_phone", "category": "DOODAD", "drawnTurn": 5,
  "title": "…", "body": "…", "forced": false,
  "payload": { "cost": 900 },                         // resolved numbers (rolled with RR.rng)
  "options": [ { "id": "cash", "label": "Pay cash", "ops": [ … ] }, { "id": "card", "label": "Credit card", "ops": [ … ] }, { "id": "skip", "label": "Skip it", "ops": [] } ] }

// Decision  (loop.pendingDecision — blocks progress until resolved)
{ "type": "SHORTFALL",                                // SHORTFALL | LIQUIDATION_REPORT | ESCAPE_CEREMONY | GAME_END
  "payload": { "shortfall": 1240 } }

// PaydayReport  (loop.lastPayday)
{ "turn": 7, "cashBefore": 3000, "cashAfter": 3919,
  "income": { …derived.income at payday… }, "expenses": { …derived.expenses… },
  "net": 919, "interestAccrued": 380, "principalPaid": 701,
  "debtsClosed": ["d_0003"], "modifiersExpired": [], "creditDelta": 1, "shortfall": 0 }

// Result  (every engine action)
{ "ok": true, "data": { … } }   |   { "ok": false, "reason": "INSUFFICIENT_CASH", "message": "Need $2,000 more." }
```

### 1.7 Enumerations & reason codes
- **TurnPhase:** `IDLE START PAYDAY SHORTFALL MARKET EVENT ACTION CLEANUP TRANSITION ENDED`
- **Mode:** `RAT_RACE FAST_TRACK` · **Status:** `TITLE RUNNING GAME_OVER` · **Outcome:** `DREAM EMPIRE BANKRUPT`
- **DebtKind:** `HOME_MORTGAGE STUDENT_LOAN CAR_LOAN CREDIT_CARD RETAIL BANK_LOAN PROPERTY_MORTGAGE BUSINESS_LOAN`
- **DebtStructure:** `AMORTIZING INTEREST_ONLY REVOLVING`
- **EconomyPhase:** `EXPANSION PEAK RECESSION RECOVERY`
- **EventCategory:** `DEAL DOODAD LIFE MARKET QUIET`
- **Sector:** `UTILITIES CONSUMER_STAPLES FINANCIALS HEALTHCARE ENERGY CONSUMER TECH SPECULATIVE`
- **Effect ops (closed list, §3):** `CASH_DELTA CASH_OR_CARD ADD_DEBT ADD_MODIFIER CHILD_DELTA SALARY_DELTA LIFESTYLE_DELTA CREDIT_DELTA MARKET_SHOCK ASSET_MOD FORCE_SELL LOG` — **planned extensions:** Phase 3 adds `STOCK_MOD` and `CREDIT_CALL`; Phase 4 adds `revenueIndex` (MULTIPLY) to the `ASSET_MOD` whitelist. Update this line when they ship.
- **Reason codes:** `INSUFFICIENT_CASH INSUFFICIENT_SHARES NOT_FOUND WRONG_PHASE WRONG_MODE BLOCKED GAME_NOT_RUNNING CREDIT_DENIED OVER_LIMIT UNDERWATER INVALID_ARGS MUTATOR_ERROR NOT_IMPLEMENTED`

### 1.8 Canonical formulas (Phase 1 implements ALL of these in pure modules; later phases only call them)

**F1 — Amortizing payment.** `pmt(P, apr, n) = round(P·r / (1 − (1+r)^−n))`, `r = apr/12`; if `r = 0` → `round(P/n)`.

**F2 — Debt period step** (`finance.amortizeOnePeriod`, one per Payday per debt):
- `interest = round(principal · apr/12)`
- **AMORTIZING:** `payment = min(monthlyPayment, principal + interest)`; `principalPaid = payment − interest`; `principal −= principalPaid`; `termMonthsRemaining −= 1`. If `termMonthsRemaining` reaches 0 the final payment is `principal + interest` (clears residual). Closed when `principal ≤ 0`.
- **INTEREST_ONLY:** `payment = interest`; principal unchanged.
- **REVOLVING (credit card):** `payment = min(principal + interest, max(config.creditCard.minPaymentFloor, round(config.creditCard.minPaymentPct · principal)))`; `principal = principal + interest − payment`.
- `finance.scheduledPayment(debt)` = the `payment` the step above would make right now (used by the ledger).

**F3 — Salary after modifiers.** `salaryNow = max(0, round(salary · Π(MULTIPLY values on SALARY mods) + Σ(ADD values on SALARY mods)))`.

**F4 — Asset valuation (pure, `RR.valuation`):**
```
RE:   value = round(purchasePrice · market.indices.realEstatePrice / priceIndexAtPurchase)
      rent  = vacantTurnsLeft > 0 ? 0 : round(baseMonthlyRent · market.indices.realEstateRent / rentIndexAtPurchase)
      opex  = round(baseMonthlyOpex · economy.inflationIndex / inflationIndexAtPurchase)
BIZ:  revenue = round(baseMonthlyRevenue · revenueIndex)
      costs   = round(baseMonthlyCosts · economy.inflationIndex / inflationIndexAtPurchase)
      value   = max(round(0.25 · purchasePrice), round(12 · (revenue − costs) · market.indices.businessMultiple))
STOCK: value = round(shares · price) ; dividendsMonthly = round(shares · dpsAnnual / 12)
```

**F5 — Income statement (`RR.ledger.recompute`):**
```
assetNet_i    = (RE: rent − opex | BIZ: revenue − costs) − linkedDebtPayment_i      // linked = debts where collateralAssetId == asset.id
passive       = dividends + Σ max(0, assetNet_i)
assetDrag     = Σ max(0, −assetNet_i)                                                // money-losing assets count as an EXPENSE
otherIncome   = Σ ADD values of INCOME modifiers
totalIncome   = salaryNow + passive + otherIncome
taxes         = round(config.tax.salaryRate·salaryNow + config.tax.passiveRate·passive)
children      = childCount · config.child.monthlyCost
debtService   = Σ scheduledPayment(d) for debts with collateralAssetId == null
totalExpenses = taxes + baseLifestyleExpense + children + debtService + assetDrag + Σ ADD values of EXPENSE modifiers
monthlyCashflow = totalIncome − totalExpenses
```
**F6 — Balance sheet:** `assets.productive = stocks + realEstate + business` · `assets.total = cash + productive + personal` · `liabilities.total = Σ principal` (all debts incl. asset-linked) · `netWorth = assets.total − liabilities.total`.

**F7 — Escape metric:** `escape.met = passive > totalExpenses` (**strict**). `progressPct = clamp(100·passive/totalExpenses, 0, 100)` (100 if expenses = 0). Fast Track `goal.progressPct = clamp(100·passive/goalPassive, 0, 100)`.

**Design rationale to preserve:** passive income is taxed at a lower rate (lesson); asset-linked debt is netted into the asset so players see each asset's true cash flow; paying off personal debt lowers expenses (the core "escape lever").

### 1.9 Config defaults & starting data

```js
RR.config = {
  version: "1.0.0",
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
  liquidation: { order: ["STOCK", "BUSINESS", "REAL_ESTATE"], haircut: { STOCK: 0, BUSINESS: 0.25, REAL_ESTATE: 0.15 } },
  stocks: { floorPrice: 0.50 },
  economy: {
    phases: {
      EXPANSION: { stockDrift:  0.04, volMult: 1.0, reDrift:  0.04, bizGrowth:  0.03, bizMultiple: 4.5, duration: [18, 36], next: { PEAK: 0.7, RECESSION: 0.3 }, baseRate: 0.05 },
      PEAK:      { stockDrift:  0.00, volMult: 1.1, reDrift:  0.01, bizGrowth:  0.01, bizMultiple: 5.0, duration: [4, 10],  next: { RECESSION: 0.85, EXPANSION: 0.15 }, baseRate: 0.07 },
      RECESSION: { stockDrift: -0.25, volMult: 1.6, reDrift: -0.06, bizGrowth: -0.12, bizMultiple: 3.0, duration: [6, 14],  next: { RECOVERY: 1 }, baseRate: 0.03 },
      RECOVERY:  { stockDrift:  0.15, volMult: 1.2, reDrift:  0.02, bizGrowth:  0.05, bizMultiple: 3.8, duration: [8, 18],  next: { EXPANSION: 1 }, baseRate: 0.04 }
    },
    inflation: { start: 0.03, min: 0.0, max: 0.08, monthlyNoise: 0.002 }, baseRateEase: 0.10, reNoiseSigma: 0.04, rentNoiseSigma: 0.01
  },
  director: {
    baseWeights: { DEAL: 0.38, DOODAD: 0.22, LIFE: 0.12, MARKET: 0.10, QUIET: 0.18 },
    econMult: { PEAK: { DOODAD: 1.2 }, RECESSION: { DEAL: 1.4, DOODAD: 0.8, MARKET: 1.5 }, RECOVERY: { DEAL: 1.2 } },
    pityPerTurn: { DEAL: 0.15, DOODAD: 0.10, LIFE: 0.05, MARKET: 0.05 },
    recentWindow: 6, gracePeriodTurns: 3, graceCategories: ["DEAL", "DOODAD", "QUIET"]
  },
  fastTrack: { entryCashMonths: 60, goalIncrease: 25000, dealScale: 10 }   // v1 guesses — tune with RR.sim (Phase 4)
};
```

**Teacher starter profile (exact — all acceptance tests use it):** cash 3,000 · salary 3,500 · lifestyle 800 · children 0 · credit 680 · personal assets Home 100,000 + Car 8,000 · debts:

| id | kind | structure | principal | APR | term left | payment |
|---|---|---|---|---|---|---|
| d_0001 | HOME_MORTGAGE | AMORTIZING | 85,000 | 6.5% | 300 | 574 |
| d_0002 | STUDENT_LOAN | AMORTIZING | 12,000 | 5.0% | 96 | 152 |
| d_0003 | CAR_LOAN | AMORTIZING | 9,000 | 7.5% | 36 | 280 |
| d_0004 | CREDIT_CARD | REVOLVING | 2,500 | 21% | — | 75 (min) |

Phase 1 also ships two more professions (e.g. Nurse, Software Engineer) designed so **starting cash flow lies between +$600 and +$1,800**; Teacher is the default.

**Stock universe (initial `market.stocks`):**

| Symbol | Name | Sector | Price | μ | σ | DPS/yr |
|---|---|---|---|---|---|---|
| UTLX | Unity Power & Water | UTILITIES | 48.00 | .06 | .15 | 2.40 |
| STPL | Staple Foods Co | CONSUMER_STAPLES | 62.00 | .07 | .16 | 2.10 |
| BNKR | Bankroll Financial | FINANCIALS | 35.00 | .08 | .25 | 1.20 |
| MEDX | MedixCare | HEALTHCARE | 90.00 | .09 | .24 | 1.00 |
| ENRG | Terra Energy | ENERGY | 28.00 | .08 | .38 | 1.60 |
| RETL | Cartwheel Retail | CONSUMER | 40.00 | .07 | .30 | 0.80 |
| NOVA | Nova Robotics | TECH | 120.00 | .14 | .45 | 0.00 |
| SPKL | Sparkle Labs | SPECULATIVE | 4.50 | .18 | .80 | 0.00 |

**Dreams (Fast Track):** `island_resort` Private Island Resort 600,000 · `school_foundation` Community School Foundation 900,000 · `mountain_ranch` Mountain Ranch Retreat 500,000 · `world_yacht` Round-the-World Sailing Yacht 750,000.

### 1.10 State write-permission matrix (who may mutate what)

| Top-level key | Allowed writers |
|---|---|
| `meta` | `store` (revision, updatedAt), `rng` (rng.state), `util.uid` (idCounter), `schema` |
| `loop.status/phase/turn` | `turn` (and `progression` for TRANSITION/ENDED) |
| `loop.pendingCard`, `loop.director` | `events` |
| `loop.pendingDecision` | `debt` (SHORTFALL, LIQUIDATION_REPORT), `progression` (ESCAPE_CEREMONY, GAME_END) |
| `loop.lastPayday` | `payday` |
| `loop.mode`, `loop.outcome` | `progression` |
| `player.financials` | `payday`, `effects`, `debt`, `assets` (cash only), `progression` (salary/modifiers/cash at Fast Track entry) |
| `inventory` | `assets`; `payday` (lifetimeCashflow, vacancy tick); `market` (business `revenueIndex`); `effects` (`ASSET_MOD`, `FORCE_SELL`) |
| `market` | `market` only (events reach it through `market.applyShock`) |
| `fastTrack` | `progression` only |
| `stats`, `log` | any engine via `RR.store.pushLog(state, {kind,text,delta})` / `RR.store.bumpStat(state, key, n)` |
| `derived` | `ledger` via `store` only |

### 1.11 Module ownership at a glance
`util bus rng schema store finance valuation ledger save ui dev` → **Phase 1** · `turn payday effects events` → **Phase 2** · `market assets debt` → **Phase 3** · `progression fastTrack sim` → **Phase 4** · `app` → boots everything (Phase 1, extended each phase).

### 1.12 v2 CONTRACT — ONLINE EDITION, LIFE SYSTEMS & ACCOUNT LEVELS
> §1.12 is part of the Universal Context Header: read it in **every** session. Where §1.12 conflicts with §1.2–§1.11, **§1.12 wins** (the older text is kept so unchanged v1 content stays verifiable). Plan v2.0 is the *genesis* of State Schema v2 — no v1 save ever shipped, so `migrate` v1→v2 exists only for safety (§0.4).

#### 1.12.1 Topology, environments & the "web root"
```
 Player browser ──static files──▶ Netlify  (publish dir = public/ · headers/CSP · deploy previews)
      │  supabase-js (vendored UMD, PUBLISHABLE key only) · user JWT
      ▼
 Supabase project  (dev | prod)
   ├ Auth ........ email+password · Google OAuth · TOTP MFA (admins) · anonymous sign-ins OFF
   ├ Postgres .... RLS on EVERY table · explicit GRANTs · migrations in Git (Appendix D)
   ├ Edge Functions (the only holders of secret keys): lifecycle-sweep · stripe-webhook · create-checkout-session
   │                create-portal-session · delete-my-account · export-my-data · admin-actions · (optional) submit-run
   └ pg_cron + pg_net + Vault ── daily 03:00 UTC ──▶ lifecycle-sweep
 Stripe (hosted Checkout + Customer Portal) ──signed webhook──▶ stripe-webhook ──▶ public.entitlements
 SMTP provider (Resend / Postmark / SES) ──▶ Auth emails + lifecycle notices
```
| Environment | Where it runs | Backend it talks to |
|---|---|---|
| **Local OFFLINE** | double-click `public/index.html` (`file://`) | none — Guest mode, localStorage only |
| **Local ONLINE** | `http://localhost` (any static server) + optional Supabase CLI local stack | Supabase **dev** project (or local stack) |
| **Preview / Staging** | Netlify deploy previews + branch `develop` | Supabase **dev** project · Stripe **test** mode |
| **Production** | Netlify branch `main` on the custom domain | Supabase **prod** project · Stripe **live** mode |

**Repo web root.** Everything this plan calls "project root" (`index.html`, `js/`, `css/`, `assets/`, `vendor/`, `config/`, `admin/`) lives in **`public/`**. `dev/` (tests, simulator), `supabase/`, `tools/`, `docs/`, `.github/` live at the **repo root** and are never deployed. `dev/*.html` loads engine scripts via `../public/js/…`. Full layout: Appendix G.

**Environment selection (no build step).** `public/config/env.js` (loaded first by `index.html`) sets `window.__RR_ENV__` from `location.hostname`: production hostname → prod project, any other `http(s)` host → dev project, `file:` → `null` ⇒ **OFFLINE**. The Supabase URL and **publishable** key are public by design; **secret/service keys never appear in `public/`** (R14).

#### 1.12.2 Account levels (what "playable on account level" means)
| Capability | Guest (offline) | Free account | Premium | Admin |
|---|---|---|---|---|
| Play the full game | ✔ | ✔ | ✔ | ✔ |
| Saves live in | this browser only | browser + cloud | browser + cloud | browser + cloud |
| Cloud save slots | 0 | **1** | **3** | 3 |
| Rolling cloud snapshots (restore points) | – | – | **5** | 5 |
| Cross-device continue | – | ✔ | ✔ | ✔ |
| **30-day inactivity deletion** | n/a (data never left the device) | **applies** | **exempt while subscription is active (§7.2)** | **exempt** |
| Verified leaderboard runs (Phase 8) | – | ✔ | ✔ | ✔ |
| Cosmetic packs (avatar parts, themes) | base | base | all | all |
| Admin console (MFA required) | – | – | – | ✔ |
Premium sells **convenience and cosmetics only — never economy advantages** (A19). Accounts are created by **email + password** or **Google sign-in**. *Interpretation note:* "Google Play" in the brief is implemented as **Google account sign-in (OAuth)**; Google Play Billing/Play Games apply only to a native Android wrapper and are parked in Appendix B (digital subscriptions sold inside a Play-distributed app generally must use Play Billing — decide before shipping an Android build).

#### 1.12.3 State Schema v2 — delta to §1.5 (exact; `schema.create()` must produce §1.5 + this)
```jsonc
{
  "meta": {
    "schemaVersion": 2,
    "rng": { "seed": 20261002, "state": 20261002,                 // state = the 'misc' stream (legacy name kept)
             "streams": { "market": 0, "events": 0, "deals": 0, "npc": 0 } },   // each = fnv1a32(seed+":"+name); R3 exemption like rng.state
    "settings": { "difficulty": "NORMAL", "currencySymbol": "$", "animations": true, "autosave": true,
                  "toasts": true, "sound": false, "reducedFx": false, "tutorialHints": true }
    // NOTE: deviceId and cloud sync bookkeeping are NOT in state (A14) — they live in localStorage key rr.sync.v1
  },
  "loop": {
    "turnCounters": { "interactions": 0, "healthActions": 0 },    // reset by turn START
    "director": { /* v1 keys + */ "queued": [],                   // [{ templateId, dueTurn, targetNpcId? }]
                  "lastSeverityTurn": { "MAJOR": -99, "CRISIS": -99 } }
  },
  "player": {
    "health": { "value": 80, "insurance": "NONE",                 // insurance: NONE | STANDARD | COMPREHENSIVE
                "lastCheckupTurn": -99, "lastVacationTurn": -99 },
    "financials": { "deposits": [ /* Deposit[] */ ] }             // cash = checking balance; deposits = savings/term accounts
  },
  "npcs": [ /* Npc[] — starter roster built by schema.create from RR.data.npcs (§2.8) */ ],
  "story": { "flags": {}, "counters": {}, "history": [],          // history: [{turn, templateId, optionId}] capped config.story.historyLimit
             "consequences": [] },                                // Consequence[] — delayed outcomes (SCHEDULE op)
  "stats": { /* v1 keys + */ "eventsByCategory": {}, "npcInteractions": 0, "hospitalizations": 0,
             "repairSpend": 0, "interestEarned": 0, "bankruptcyCause": null,
             "healthHistory": [] },                               // capped like netWorthHistory
  "derived": {
    "income":   { /* v1 keys + */ "interest": 0 },
    "expenses": { /* v1 keys + */ "insurance": 0 },
    "assets":   { /* v1 keys + */ "deposits": 0 },
    "ratios":   { /* v1 keys + */ "emergencyMonths": 0 },         // (cash + deposits) / expenses.total
    "health":   { "tier": "GOOD", "salaryFactor": 1 }
  }
}
```
`inventory.realEstate[]` and `inventory.businesses[]` gain: `"condition": 85` (0–100), `"maintenancePlan": "NONE"` (NONE/BASIC/FULL), `"insured": false`, `"inspected": false`; RE adds `"rentBoostPct": 0`; BIZ adds `"closedTurnsLeft": 0`. `Shock` gains optional `"rentDelta"`, `"rateDelta"`, `"inflationDelta"` (default 0). `Modifier` gains optional `"tag"` (e.g. `"GYM"`).

#### 1.12.4 New entity shapes
```jsonc
// Npc  (state.npcs[])
{ "id": "npc_0001", "templateId": "banker", "name": "Ms. Okafor", "role": "BANKER",
  "relationship": 10,                       // -100..100, 1 dp
  "status": "ACTIVE",                       // ACTIVE | DORMANT | LOST
  "metTurn": 0, "lastInteractionTurn": 0,
  "assetId": null,                          // TENANT only: linked inventory asset id
  "lookSeed": 48213,                        // drives RR.ui.avatar (deterministic)
  "memory": [ { "turn": 12, "kind": "REFUSED_LOAN", "delta": -6 } ] }   // last config.npc.memoryLimit entries

// Deposit  (player.financials.deposits[])
{ "id": "dep_0001", "kind": "SAVINGS",      // SAVINGS | TERM
  "label": "Everyday Saver", "balance": 2000, "apy": 0.03,
  "openedTurn": 3, "termMonths": null, "maturityTurn": null }          // TERM: apy locked at open

// Consequence  (state.story.consequences[])  — a delayed, possibly probabilistic outcome
{ "id": "csq_0004", "sourceTemplateId": "npc_family_loan", "label": "Jamie's repayment",
  "dueTurn": 21, "p": 0.55, "severity": "MINOR",
  "ops": [ /* applied if the p-roll succeeds */ ], "else": [ /* applied if it fails (optional) */ ],
  "toast": "Jamie paid you back.",
  "visible": true, "journalText": "Jamie owes you $1,500" }          // visible ⇒ listed in the Journal (never shows p); p may be a number or { role, HOSTILE, COLD, NEUTRAL, FRIENDLY, TRUSTED } (probability by NPC tier)

// EffectReceipt  (returned by RR.effects.apply and emitted on bus 'effects:applied'; engines emit DATA, the UI renders it — A24)
{ "kind": "CASH", "label": "Cash", "delta": -900, "tone": "neg", "icon": "ic_cash", "detail": "Car repair" }
// kind ∈ CASH HEALTH NPC CREDIT DEBT DEPOSIT ASSET MARKET STORY SALARY EXPENSE LOG

// EventTemplate additions (all optional → v1 templates remain valid)
{ "tags": ["PROPERTY","REPAIR"],            // domain tags: HEALTH NPC PROPERTY BUSINESS PORTFOLIO PRICES BANK DEPOSIT CREDIT JOB FAMILY
  "severity": "MAJOR",                      // MINOR | MAJOR | CRISIS (presentation + director cooldowns)
  "art": { "scene": "storm_house", "icon": "ic_droplet" },
  "involves": { "npcRoles": ["HANDYMAN","TENANT"] },
  "requires": { /* v1 keys + flagSet, flagNotSet, counterMin:{key,n}, npcTierAtLeast:{role,tier}, npcTierAtMost:{role,tier},
                   healthBelow, healthAbove, assetConditionBelow, hasInsurance, hasDeposit, minDepositTotal, economyPhase, stockHeldMin */ },
  "weightMods": [ { "when": { "assetConditionBelow": 40 }, "mult": 2.5 } ],   // same predicates as requires; multiply template weight
  "payload": { "repairCost": [1800, 4500] },                                   // rolled with rng.events; money ranges × inflationIndex, rounded to $50
  "options": [ { "id": "pro", "label": "…", "ops": [ { "op": "CASH_OR_CARD", "value": "$repairCost", "insurable": "PROPERTY" } ],
                 "outcomes": [ { "p": 0.5, "text": "…", "ops": [] }, { "pByTier": { "role": "BOSS", "HOSTILE": .05, "COLD": .2, "NEUTRAL": .35, "FRIENDLY": .5, "TRUSTED": .7 }, "text": "…", "ops": [] } ],   // optional exclusive probabilistic results (rng.events); a template uses either all-`p` (sum 1) or one `pByTier` outcome + an implicit "otherwise" outcome
                 "riskHint": "50% chance it holds" } ] }
// "$name" inside ops = payload value. selector "EVENT_TARGET" = the asset/NPC/stock the event picked at instantiate (stored in payload.target*).
```

#### 1.12.5 Enumerations & the closed Effect-op list (v2)
- **EventCategory:** `DEAL DOODAD LIFE MARKET QUIET` + **`NPC`** (relationship stories, requests, offers) + **`ASSET`** (property / business / portfolio incidents; weight 0 unless the player owns something eligible). Health events are `LIFE` with tag `HEALTH`.
- **EventSeverity:** `MINOR MAJOR CRISIS` · **NpcRole:** `FAMILY BOSS FRIEND BANKER AGENT MENTOR HANDYMAN TENANT ADVISOR` · **NpcTier:** `HOSTILE COLD NEUTRAL FRIENDLY TRUSTED` · **NpcStatus:** `ACTIVE DORMANT LOST`
- **HealthTier:** `GOOD FAIR POOR CRITICAL` · **InsurancePlan:** `NONE STANDARD COMPREHENSIVE` · **MaintenancePlan:** `NONE BASIC FULL` · **DepositKind:** `SAVINGS TERM`
- **AuthState:** `SIGNED_OUT SIGNED_IN EXPIRED` · **SyncStatus:** `LOCAL_ONLY SYNCED SYNCING OFFLINE CONFLICT ERROR`
- **New reason codes:** `NPC_UNAVAILABLE LIMIT_REACHED COOLDOWN NOT_ONLINE UNAUTHENTICATED FORBIDDEN CONFLICT QUOTA_EXCEEDED PREMIUM_REQUIRED`

| Op (v2 closed list) | Params | Effect → receipt kind |
|---|---|---|
| `CASH_DELTA`, `CASH_OR_CARD`, `ADD_DEBT`, `ADD_MODIFIER`, `CHILD_DELTA`, `SALARY_DELTA`, `LIFESTYLE_DELTA`, `CREDIT_DELTA`, `MARKET_SHOCK`, `FORCE_SELL`, `LOG`, `STOCK_MOD`, `CREDIT_CALL` | as §1.7/§3.5/§4 | unchanged; `CASH_DELTA`, `CASH_OR_CARD`, `ADD_MODIFIER`(target EXPENSE) additionally accept **`insurable: "HEALTH"\|"PROPERTY"`** → value × (1 − coverage) (F20) |
| `ASSET_MOD` | `{assetKind, selector:'RANDOM'\|'ALL'\|'EVENT_TARGET'\|id, field, value}` | whitelist: `vacantTurnsLeft`(ADD), `condition`(ADD, clamp 0–100), `rentBoostPct`(ADD), `closedTurnsLeft`(ADD), `insured`(SET), `revenueIndex`(MULTIPLY, floor 0.2) → ASSET |
| `HEALTH_DELTA` / `HEALTH_SET` | `value` | clamp 0–100 → HEALTH |
| `INSURANCE_SET` | `{plan}` | sets `player.health.insurance` (premium applies from the next ledger recompute) → HEALTH |
| `NPC_DELTA` | `{npc: id\|role\|'RANDOM_ACTIVE'\|'EVENT_TARGET', value, memory?}` | clamp ±100; writes `memory` entry; updates `lastInteractionTurn` → NPC |
| `NPC_MEET` | `{templateId, assetId?}` | adds NPC (name from `rng.npc` pool) → NPC |
| `NPC_STATUS` | `{npc, status}` | ACTIVE/DORMANT/LOST → NPC |
| `SET_FLAG` / `INC_COUNTER` | `{key, value}` | `story.flags` / `story.counters` → STORY |
| `SCHEDULE` | `{inTurns:[a,b], p?, severity?, label, toast?, ops, else?}` | rolls `dueTurn` with `rng.events`, pushes a Consequence (cap `story.maxConsequences`) → STORY |
| `QUEUE_EVENT` | `{templateId, inTurns:[a,b]}` | pushes to `loop.director.queued` → STORY |
| `DEPOSIT_ADD` / `DEPOSIT_DELTA` | `{kind, balance, termMonths?, apyBonus?}` / `{selector, value}` | creates / adjusts deposit (cash moves accordingly) → DEPOSIT |
| `STOCK_PRICE_MULT` | `{symbol\|sector\|'HELD_RANDOM', mult}` | immediate price gap (floor `stocks.floorPrice`) → MARKET |
| `STOCK_SPLIT` | `{symbol\|'HELD_RANDOM', ratio}` | shares×ratio, price/ratio, avgCost/ratio, dpsAnnual/ratio → MARKET |
Unknown op, unknown `field`, or bad param ⇒ `INVALID_ARGS` and **nothing** in the op list applies (atomicity, §3.10 test 7). Effects never touch the DOM or network (R2, R13).

#### 1.12.6 Formula amendments (F3b, F4b, F5b, F16–F20)
**F3b — Salary.** `salaryNow = max(0, round((salary · Π MULT + Σ ADD) · healthFactor))`, `healthFactor = health.salaryFactor[healthTier]`.
**F4b — Valuation with condition.** `assetBase = round(purchasePrice · inflationIndex / inflationIndexAtPurchase)` (stable base; avoids circular maintenance costs).
```
rentFactor(c)  = c≥80: 1.00 · c≥50: 0.95 · c≥25: 0.85 · else 0.70          valueFactor(c) = c≥80: 1.00 · c≥50: 0.97 · c≥25: 0.90 · else 0.80
maint   = round(assetBase · maintenance[plan].costPctYear / 12)           ins = insured ? round(assetBase · property.insurance.ratePctYear / 12) : 0
RE:  value = round(purchasePrice · realEstatePrice / priceIndexAtPurchase · valueFactor(c))
     rent  = vacantTurnsLeft>0 ? 0 : round(baseMonthlyRent · realEstateRent / rentIndexAtPurchase · (1 + rentBoostPct) · rentFactor(c))
     opex  = round(baseMonthlyOpex · inflationIndex / inflationIndexAtPurchase) + maint + ins
BIZ: revenue = closedTurnsLeft>0 ? 0 : round(baseMonthlyRevenue · revenueIndex · rentFactor(c))      costs = (v1 formula) + maint + ins      value = (v1 formula)
```
**F5b — Income statement.**
```
interestIncome = Σ round(balance · apy / 12) over deposits        (paid to cash through the payday net; counted as PASSIVE and taxed at passiveRate)
passive        = dividends + interestIncome + Σ max(0, assetNet_i)
lifestyle      = round(baseLifestyleExpense · lifestyleIndex)      lifestyleIndex = 1 + lifestyleInflation.passThrough·(inflationIndex − 1)   (if enabled)
healthInsurance= health.insurance[plan].premium
totalExpenses  = taxes + lifestyle + children + debtService + assetDrag + healthInsurance + Σ ADD values of EXPENSE modifiers
assets.total   = cash + deposits + productive + personal            emergencyMonths = (cash + deposits) / totalExpenses
```
The strict escape test (F7, `passive > totalExpenses`) is unchanged.
**F16 — Condition tick** (once per payday per owned asset; `rng.misc`): `condition = clamp(condition − decayPerTurn[kind] · maintenance[plan].decayMult · U(0.6, 1.4), 0, 100)`.
**F17 — Health tick** (once per payday): `Δ = (value < recoverCap ? baselineRecovery : 0) + (GYM modifier present ? gym.delta : 0) − (debtToIncome > stress.dtiAbove ? stress.dtiDrain : 0) − (emergencyMonths < stress.lowCashMonths ? stress.lowCashDrain : 0) + (emergencyMonths ≥ stress.highCashMonths ? stress.highCashRelief : 0)`; `value = clamp(round(value + Δ, 1dp), 0, 100)`. Tier by `config.health.tiers`. `value = 0` ⇒ forced `life_hospital` next EVENT. **Health never ends the game** (A22).
**F18 — Relationship tick** (CLEANUP): for each ACTIVE non-FAMILY NPC with `turn − lastInteractionTurn > decayAfterIdleTurns`: positive → `−decayPerTurn` toward 0; negative → `+grudgeRecoveryPerTurn` toward 0. FAMILY never decays.
**F19 — NPC perks** (`RR.npc.perks(state)` pure; table is data in `config.npc.perks`):
| Role | TRUSTED | FRIENDLY | NEUTRAL | COLD | HOSTILE |
|---|---|---|---|---|---|
| BANKER `aprSpread` added in `offeredApr` | −0.010 | −0.005 | 0 | +0.005 | +0.010 |
| BANKER `emergencyMinScore` | 400 | 425 | 450 | 450 | 500 |
| AGENT deal quality weight shift (GREAT / POOR) | +0.20 / −0.10 | +0.10 / −0.05 | 0 | 0 | −0.10 / +0.05 |
| BOSS weight × for `raise` / `layoff` events | 1.8 / 0.4 | 1.3 / 0.7 | 1 / 1 | 0.6 / 1.2 | 0.3 / 1.6 |
| HANDYMAN repair-cost ×(when option uses "Ask <name>") | 0.70 | 0.85 | 1 | 1 | 1 (refuses) |
| MENTOR hint accuracy | 0.90 | 0.70 | – | – | – |
| TENANT vacancy-event weight × (own property) | 0.6 | 0.8 | 1 | 1.3 | 1.8 |
| ADVISOR audit/legal cost × (`advisorCostMult`) | 0.50 | 0.75 | 1 | 1.1 | 1.25 |
**F20 — Insurable cost.** `paid = round(cost · (1 − coverage))`; `coverage` = `health.insurance[plan].coverage` for `"HEALTH"`, or `property.insurance.coverage` (0.80) if the targeted asset is `insured` for `"PROPERTY"` (else 0).
**Deposit APY** (`RR.deposits`, using effective rates): `SAVINGS: max(savingsFloor, baseRateEff + savingsSpread)`; `TERM: baseRateEff + termSpread`, locked at open. `baseRateEff = clamp(baseRate + Σ rateDelta of active shocks, 0.02, 0.10)`; `inflationEff = clamp(inflationRate + Σ inflationDelta, min, max)`. `RR.market.effectiveEconomy(state)` returns both; **callers pass it as the `economy` argument of `finance.offeredApr(kind, score, economy, adj)`** where `adj = RR.npc.perks(state).bankerSpread`.
**Event price scaling.** Every rolled money range in `payload` is multiplied by `economy.inflationIndex` and rounded to the nearest $50 (F-events); DEAL ranges follow §4.2.
**Lifestyle inflation** is a v2 balance lever: `config.economy.lifestyleInflation = { enabled: true, passThrough: 0.5 }` — tune with `RR.sim` (§5.6), never hard-code.

#### 1.12.7 Config additions (merge into `RR.config`; v2 values **override** same-named v1 keys)
```js
health: { start: 80, tiers: [[70,'GOOD'],[40,'FAIR'],[1,'POOR'],[0,'CRITICAL']],
          salaryFactor: { GOOD: 1, FAIR: 1, POOR: 0.9, CRITICAL: 0 },
          baselineRecovery: 0.5, recoverCap: 75, gym: { costMonth: 45, delta: 1.5 },
          stress: { dtiAbove: 0.5, dtiDrain: 0.5, lowCashMonths: 0.5, lowCashDrain: 0.5, highCashMonths: 3, highCashRelief: 0.5 },
          insurance: { NONE: { premium: 0, coverage: 0 }, STANDARD: { premium: 120, coverage: 0.60 }, COMPREHENSIVE: { premium: 260, coverage: 0.85 } },
          actions: { checkup: { cost: 150, delta: 8, cooldown: 6 }, vacation: { cost: 900, delta: 12, cooldown: 12 } },
          hospital: { healthReset: 35, salaryZeroTurns: 2, cost: [4000, 9000] } },
deposits: { savingsSpread: -0.020, savingsFloor: 0.005, termSpread: 0.005, termOptions: [6, 12, 24], earlyPenaltyMonths: 3, minOpen: 500, insuredLimit: 250000 },
property: { decayPerTurn: { CONDO: .35, SINGLE_FAMILY: .50, DUPLEX: .60, APARTMENT_BLOCK: .80, COMMERCIAL: .60, BUSINESS: .70 },
            maintenance: { NONE: { costPctYear: 0, decayMult: 1.0 }, BASIC: { costPctYear: 0.005, decayMult: 0.5 }, FULL: { costPctYear: 0.012, decayMult: 0.15 } },
            insurance: { ratePctYear: 0.005, coverage: 0.80 },
            renovateCostPerPointPctValue: 0.002, startCondition: { GREAT: [80,95], FAIR: [65,85], POOR: [40,65] },
            inspection: { cost: [300, 600], noise: 15 } },
npc: { tiers: [[60,'TRUSTED'],[20,'FRIENDLY'],[-9,'NEUTRAL'],[-39,'COLD'],[-100,'HOSTILE']],
       interactionsPerTurn: 2, decayAfterIdleTurns: 8, decayPerTurn: 1, grudgeRecoveryPerTurn: 0.5, memoryLimit: 5,
       actions: { CALL: { cost: 0, delta: 2 }, LUNCH: { cost: 60, delta: 5 }, GIFT: { cost: 150, delta: 8 } },
       perks: { /* F19 table encoded as data */ } },
story: { historyLimit: 100, maxConsequences: 24 },
director: { baseWeights: { DEAL: .30, DOODAD: .18, LIFE: .12, MARKET: .09, NPC: .10, ASSET: .09, QUIET: .12 },
            pityPerTurn: { DEAL: .15, DOODAD: .10, LIFE: .05, MARKET: .05, NPC: .06, ASSET: .05 },
            severity: { crisisCooldown: 4, majorCooldown: 2, mercyLiquidMonths: 0.5 } },   // a severity is excluded while (turn − lastSeverityTurn) < cooldown; other v1 director keys unchanged
economy: { lifestyleInflation: { enabled: true, passThrough: 0.5 } },
ui: { toast: { maxVisible: 4, durationMs: { info: 3000, pos: 3000, neg: 5000, warn: 6000, gold: 4500, premium: 4500 }, dedupeMs: 1000 },
      modal: { maxDepth: 3 }, receipts: { toastMax: 2, stripMax: 6 } },
sync: { debounceMs: 15000, minIntervalMs: 5000, retryBackoffMs: [2000, 5000, 15000, 60000], snapshotEveryTurns: 12, activityTouchMs: 1800000 },
account: { inactivityDays: 30, warnDaysBefore: [7, 1] }    // DISPLAY ONLY on the client — the server table app_config is authoritative
```

#### 1.12.8 Write-permission matrix additions (extends §1.10)
| Key | Allowed writers |
|---|---|
| `player.health` | `health`, `effects` (`HEALTH_*`), `payday` (F17 tick) |
| `player.financials.deposits` | `deposits`, `effects` (`DEPOSIT_*`), `payday` (maturity) |
| `npcs` | `npc`, `effects` (`NPC_*`), `assets` (tenant create/lost via `NPC_MEET`/`NPC_STATUS`) |
| `story` | `story`, `effects` (`SET_FLAG`, `INC_COUNTER`, `SCHEDULE`), `events` (history) |
| `loop.turnCounters` | `turn` (reset), `npc`, `health` (increment) |
| `inventory.*[].condition/maintenancePlan/insured/rentBoostPct/closedTurnsLeft/inspected` | `property`, `effects` (`ASSET_MOD`), `payday` (F16) |
| `meta.settings.*` | `RR.settings` only |
| **Outside state:** `rr.sync.v1`, `rr.settings.v1`, `rr.save.v1*`, `rr.cache.v1.*` (localStorage) | `persist`, `sync` |

#### 1.12.9 Module & file additions (load order unchanged: numeric filename order; `vendor/supabase.js` loads before `50-*`)
| File (public/js/) | Module | Phase |
|---|---|---|
| `05-data-npcs.js` `05-data-icons.js` `05-data-scenes.js` | `RR.data.npcs`, `RR.data.iconSprite`, `RR.data.scenes` | 1 |
| `19-ui-art.js` | `RR.ui.icon`, `RR.ui.avatar`, `RR.ui.scene` | 1 |
| `1a-persist.js` *(sort position after `19`; name exactly)* | `RR.persist` (adapter interface + local adapter), `RR.settings`, `RR.env` | 1 |
| `26-npc.js` `27-story.js` `28-health.js` | `RR.npc`, `RR.story` (flags, consequences, predicates), `RR.health` | 2 |
| `37-deposits.js` `38-property.js` | `RR.deposits`, `RR.property` | 3 |
| `50-auth.js` `51-cloud.js` `52-sync.js` `53-entitlements.js` `54-ui-account.js` `55-ui-premium.js` | `RR.auth`, `RR.cloud`, `RR.sync`, `RR.entitlements`, account & premium UI | 5–6 |
| `public/admin/index.html` + `admin/60-admin.js` | `RR.admin` (separate page; loads only the files it needs) | 6 |
| `public/vendor/supabase.js` (+ `vendor/VERSION.txt`, `LICENSE`) | pinned supabase-js UMD build, committed | 5 |
| `public/assets/…` | icons, scenes, brand, optional audio (Appendix F) | 1, 7 |
Module ownership: `npc story health` → Phase 2 · `deposits property` → Phase 3 · `auth cloud sync entitlements` → Phases 5–6 · `admin` → Phase 6.

#### 1.12.10 Bus topics added
`effects:applied {receipts, source}` · `npc:changed` · `health:changed` · `consequence:scheduled` · `consequence:fired` · `deposit:changed` · `property:changed` · `auth:changed {state, user}` · `sync:status {status, slot}` · `sync:conflict {slot, local, cloud}` · `entitlement:changed {tier, status}` · `ui:modal:opened` · `ui:modal:closed`.

#### 1.12.11 UI feedback contract (toasts, modals, receipts)
Engines return/emit **EffectReceipts**; `RR.ui.receipt.present(receipts, { source, severity })` decides presentation (R2, A24):
| Situation | Presentation |
|---|---|
| MINOR card/action, ≤ `receipts.toastMax` receipts | one toast per receipt |
| MINOR with more receipts | top 2 toasts + "+N more" toast that opens the Receipt modal |
| MAJOR card resolved | **Result strip** inside the Event Card (≤ `stripMax` chips, stays until Continue) + one toast for the biggest delta |
| CRISIS (or forced hospital, liquidation, bankruptcy risk) | **ConsequenceModal** — `role="alertdialog"`, not dismissible until the player presses *Acknowledge*, focus on the button, shake FX unless reduced-motion |
| Player action succeeded (trade, deposit, repair, social) | success toast (`pos`/`info`) + ledger delta flash |
| Player action failed | inline reason under the control **and** a `neg` toast with `Result.message` |
| Queued consequence fired at START | toast with `consequence.toast`; if `severity ≥ MAJOR` → Result strip before PAYDAY |
| Auth / sync / entitlement changes | status chip + toast (tables in §6.6 and §7.2) |
| Milestone (first deal, debt paid off, escape, new tier with an NPC) | `gold` toast + cosmetic confetti (`Math.random` allowed, R5) |
Every user-visible state change has a toast **or** a log line **or** both (R18).

---

## 2. PHASE 1 — ARCHITECTURE & UI FOUNDATION
*Prerequisite reading: §0, §1 (including §1.12). Delivers: a populated, bound, themable Living Ledger, all pure math modules, **and the v2 foundations (§2.8): schema v2, art runtime, toast/modal kit, persistence adapters.***

### 2.1 Objectives (Build Steps)
| Step | Build |
|---|---|
| **1.1** | **Scaffold & boot.** `index.html` (stage root, mount points for HUD / left / center / right / action bar, `<template>`s, ordered `<script>` tags), CSS files, `90-app.js` with `RR.app.boot()`. |
| **1.2** | **Foundations:** `00-namespace`, `01-config` (§1.9 verbatim), `02-util`, `03-bus`, `04-rng`. |
| **1.3** | **Data + schema factory:** `RR.data.professions` (3), `.stocks` (§1.9), `.dreams`, `.glossary` (≥12 terms: cash flow, passive income, asset, liability, net worth, APR, amortization, leverage, DTI, credit score, dividend, cap rate). `RR.schema.create/validate/migrate`. |
| **1.4** | **Store:** commit-and-rebind exactly as §1.4 (snapshot rollback, batch, log trim, `pushLog`, `bumpStat`, `replace`). |
| **1.5** | **Pure math:** `RR.finance` (F1–F2, credit spread, offered APR), `RR.valuation` (F4), `RR.ledger.recompute` (F5–F7). Must work for assets/debts that don't exist yet (test with fixtures). |
| **1.6** | **Persistence:** `RR.save` (localStorage key `rr.save.v1`, debounced autosave on commit when `settings.autosave`, export/import JSON file, schema validate + migrate on load, corrupt-save fallback to Title with toast). |
| **1.7** | **Design system:** `tokens.css`, `base.css`, `glass.css` (panel, card, button, chip, meter, modal, tooltip, row), `modes.css`, `ledger.css`; `RR.ui.stage` (scale-to-fit, letterbox, small-viewport notice). |
| **1.8** | **UI infrastructure:** `RR.ui.binder` (grammar §2.3), `RR.ui.fx` (tween, delta flash), `RR.ui.overlays` (modal stack, toast, glossary tooltip), `RR.ui.actions` (whitelisted `data-action` registry). |
| **1.9** | **Living Ledger UI:** HUD, Income Statement panel, Balance Sheet panel, Freedom Meter, Log ticker (spec §2.4). |
| **1.10** | **Screens:** Title (New Game / Continue / Import), New Game form (name, profession, dream, optional seed) → `RR.store.replace(RR.schema.create(opts))` → ledger visible. "Next Month" button present but shows toast *"Turn engine arrives in Phase 2"* via stub. |
| **1.11** | **Dev & tests:** `RR.dev` (`Ctrl+Shift+D` drawer: load fixture, set cash, dump state, run recompute), fixtures `starter`, `rich_rat_race`, `escape_ready`, `broke`; `dev/tests.html` with a tiny assert harness (no libs) that auto-runs on load and shows PASS/FAIL list. |

### 2.2 Key functions / methods (signatures are the contract)
```js
// ── RR.util ───────────────────────────────────────────────
clamp(n, lo, hi) -> number
round2(n) -> number                      // 2-dp (per-share values)
roundMoney(n) -> integer                 // Math.round, -0 → 0
deepClone(obj) -> obj                    // JSON clone
uid(state, prefix) -> string             // "d_0007"; increments state.meta.idCounter; call ONLY inside a commit
getPath(obj, "a.b.0.c") -> any           // dot paths; numeric segments index arrays
fmt.money(n, {signed, compact}) -> "$1,234" | "−$1,234" | "+$1,234"
fmt.pct(x, dp=1) -> "12.5%"      fmt.int(n)      fmt.ratio(x, dp=2)
fmt.date(turn) -> "Year 2 · Mar"         // turn 1 = Y1·Jan ; month = (turn-1)%12 ; year = floor((turn-1)/12)+1
// ── RR.bus ────────────────────────────────────────────────
on(topic, fn) -> unsubscribe     once(topic, fn)     emit(topic, payload)
// ── RR.rng (reads/writes state.meta.rng; R3 exemption) ─────
seed(n)   next() -> [0,1)   int(lo, hi) -> inclusive   chance(p) -> bool
pick(arr) -> item   weighted(items, weightFn) -> item   normal() -> N(0,1) via Box–Muller
// ── RR.schema ─────────────────────────────────────────────
create({ name, professionId, dreamId, seed }) -> state   // full valid state, derived computed, status TITLE→RUNNING decided by caller
validate(state) -> { ok, errors: string[] }              // shape + type checks, ids unique, numbers finite
migrate(state) -> state                                  // v1: no-op, but the branch structure exists
// ── RR.store ──────────────────────────────────────────────
get() -> state                                            // live reference; READ-ONLY by convention
replace(newState, label='store.replace') -> void         // new game / load; recomputes derived; emits state:committed
commit(label, mutator) -> Result                         // §1.4 pipeline
batch(label, fn) -> Result
subscribe(fn) -> unsubscribe                             // sugar for bus.on('state:committed')
pushLog(state, { kind, text, delta? }) -> void           // inside commits only
bumpStat(state, key, n=1) -> void
// ── RR.finance (pure) ─────────────────────────────────────
pmt(principal, apr, nMonths) -> int                      // F1
monthlyInterest(principal, apr) -> int
scheduledPayment(debt) -> int                            // F2
amortizeOnePeriod(debt) -> { interest, principalPaid, payment, newPrincipal, newTerm, closed }
creditSpread(score) -> number
offeredApr(kind, creditScore, economy) -> number         // economy.baseRate + aprSpreadByKind[kind] + creditSpread(score)
// ── RR.valuation (pure; accept a state or the needed slices) ──
stockValue(holding, market) -> int       dividendsMonthly(holding, market) -> int
reValue(a, market) -> int   reRent(a, market) -> int   reOpex(a, market) -> int
bizRevenue(a, market) -> int   bizCosts(a, market) -> int   bizValue(a, market) -> int
linkedDebtPayment(assetId, liabilities) -> int
assetNetCashflow(kind /*'RE'|'BIZ'*/, asset, state) -> int          // F5 assetNet_i
assetEquity(kind, asset, state) -> int                              // value − linked principal
// ── RR.ledger (pure) ──────────────────────────────────────
recompute(state) -> derived                                         // F5–F7; Store assigns result to state.derived
// ── RR.save ───────────────────────────────────────────────
write() -> Result   read() -> Result<state>   has() -> bool   clear() -> void
exportJSON() -> string   importJSON(text) -> Result
// ── RR.ui ─────────────────────────────────────────────────
stage.init()                                          // scale-to-fit; sets --scale; resize listener
binder.init(root)   binder.refresh(state)   binder.registerFormatter(name, fn)
binder.registerList(name, { container, template, items: s => [], key: item => item.id, bindRow: (el, item, s) => void })
fx.tweenNumber(el, from, to, ms)   fx.flashDelta(el, delta)
overlays.modal.open({ title, body, actions: [{id,label,tone}], dismissible }) -> Promise<actionId>   .close()
overlays.toast.show(msg, { tone: 'info'|'pos'|'neg'|'warn' })   overlays.tooltip.attach(root)
actions.register(name, fn)                            // data-action dispatch (whitelist)
panels.hud.mount(el)  panels.incomeStatement.mount(el)  panels.balanceSheet.mount(el)  panels.freedomMeter.mount(el)  panels.log.mount(el)
screens.title.show()  screens.newGame.show()
// ── RR.dev ────────────────────────────────────────────────
fixture(name) -> state     load(name) -> void     setCash(n)     dump() -> string
// ── RR.app ────────────────────────────────────────────────
boot()                                                // init stage/binder/panels → Title or Continue
```

### 2.3 Binding grammar (binder attribute spec — later phases extend panels with these, never invent new attributes)
| Attribute | Meaning |
|---|---|
| `data-bind="derived.income.total"` | set `textContent` from state path |
| `data-fmt="money\|moneySigned\|pct\|int\|ratio\|date\|text\|upper"` | formatter (default `text`) |
| `data-tone="auto"` | toggle `.is-pos/.is-neg/.is-zero` by numeric sign |
| `data-tween` | animate numeric changes (+ delta flash) when animations enabled |
| `data-width-pct="derived.escape.progressPct"` | sets inline `width:%` (meters) |
| `data-show-if="loop.mode=FAST_TRACK"` / `data-hide-if=…` | toggles `hidden`; equality only |
| `data-list="debts"` | container filled by a registered keyed list (reconciled by `item.id`, no full re-render) |
| `data-glossary="passive_income"` | hover/focus tooltip from `RR.data.glossary` |
| `data-action="turn.endTurn"` | click → `RR.ui.actions` whitelist entry |

```html
<div class="row"><span data-glossary="passive_income">Passive Income</span>
  <b data-bind="derived.income.passive" data-fmt="money" data-tween></b></div>
```

### 2.4 Living Ledger UI spec
**HUD:** `fmt.date(turn)` · mode badge · phase stepper (greyed in Phase 1) · Cash · Net Worth · Freedom Meter (cyan bar, `escape.progressPct`, marker at 100%, label "Passive $X / Expenses $Y").
**Income Statement (left):**
Income → Salary · Dividends · Real-estate cash flow · Business cash flow · Other income → **Total Income**; **Passive Income (cyan, highlighted)**; Expenses → Taxes · Lifestyle · Children · **Debt payments (keyed list, one row per unlinked debt: label, payment, APR chip)** · Asset carrying costs · Other → **Total Expenses**; **Monthly Cash Flow** (largest type, `data-tone="auto"`).
**Balance Sheet (right):**
Assets → Cash · Stocks (list) · Real estate (list) · Businesses (list) · Personal assets (list) → **Total Assets** · *Income-producing assets* subtotal (cyan). Liabilities → keyed list of **all** debts (label, principal, APR chip, payment) → **Total Liabilities**. **Net Worth.**
**Log ticker:** last 3 log lines, newest on top; click expands a scrollable full log modal.
Rows with value 0 in conditional sections (Dividends, RE, Business, Asset costs) render dimmed, not hidden, so the player sees what's *possible*.

### 2.5 Integration points (read / mutate)
| Function | Reads | Mutates |
|---|---|---|
| `schema.create` | `RR.config`, `RR.data.*` | returns a new object; touches nothing |
| `store.commit` | entire state | `meta.revision/updatedAt`, `derived` (via ledger), `log` (trim) |
| `ledger.recompute` | `player.financials`, `inventory`, `market` | returns `derived` only |
| `finance.*`, `valuation.*` | arguments only | nothing (pure) |
| `save.write/read` | entire state / `localStorage` | `read` → `store.replace` |
| `binder.refresh` | `derived`, `player`, `loop`, `inventory`, `market`, `log` | DOM only |
| `screens.newGame` | form values | calls `store.replace(schema.create(...))` + `loop.status='RUNNING'` via one commit |
| `dev.load` | fixture | `store.replace` |

### 2.6 Stub registry (leave these for later phases)
| Stub | Behavior in Phase 1 | Replaced in |
|---|---|---|
| `RR.turn.endTurn()` | returns `{ok:false, reason:'NOT_IMPLEMENTED'}`; UI toast | Phase 2 |
| `RR.ui.panels.hud` phase stepper | rendered, all chips idle | Phase 2 |

### 2.7 Acceptance tests (`dev/tests.html` must contain all)
1. `finance.pmt(85000,0.065,300)=574` · `pmt(12000,0.05,96)=152` · `pmt(9000,0.075,36)=280`.
2. Starter fixture → `derived`: salary 3,500 · taxes 700 · debtService 1,081 · total expenses 2,581 · monthlyCashflow **919** · assets.total 111,000 · liabilities.total 108,500 · netWorth **2,500** · escape.met **false**.
3. Credit card step: principal 2,500 @21% → interest 44, payment 75, new principal 2,469.
4. `escape_ready` fixture → `escape.met === true`; setting passive exactly equal to expenses → `met === false` (strict).
5. Asset-linked debt is excluded from `debtService` and included in that asset's net cash flow (fixture with one RE + mortgage); a property with negative net flow appears in `expenses.assetDrag`, not in `passive`.
6. `store.commit` rolls back state when the mutator throws; `revision` increments exactly once per successful commit; nested `batch` emits one `state:committed`.
7. Same `seed` → identical first 100 `rng.next()` values; export → import round-trip yields deep-equal state (excluding `derived` regeneration).
8. Binder: changing `player.financials.cash` through a commit updates every `data-bind="player.financials.cash"` node without re-rendering list containers.
9. Stage keeps 16:9 at 1280×720, 1920×1080, 2560×1080, and 1000×1000 (letterboxed).
10. Opening `index.html` via `file://` works with zero console errors.

### 2.8 v2 ADDITIONS — REQUIRED PART OF PHASE 1 (Steps 1.12–1.16)
*Read §1.12 first. These steps are built in the same phase as 1.1–1.11; the Phase Completion Report must cover them. Phase 1 still needs **no network, no accounts and no Supabase** — it only prepares the seams.*

#### 2.8.1 Step 1.12 — Schema v2 & data
- `RR.schema.create` returns the §1.5 + §1.12.3 shape; `validate` additionally checks: NPC ids unique, `relationship ∈ [-100,100]`, `health.value ∈ [0,100]`, deposits `balance ≥ 0` & `apy` finite, `condition ∈ [0,100]`, `story.consequences.length ≤ config.story.maxConsequences`.
- `migrate(v1 → v2)`: add `meta.rng.streams`, `meta.settings.*` defaults, `loop.turnCounters`, `loop.director.queued/lastSeverityTurn`, `player.health` (80), `deposits: []`, `npcs` (starter roster), `story`, extra `stats`, asset fields (`condition: 80`, `maintenancePlan: 'NONE'`, `insured: false`, `inspected: true`), then `schemaVersion = 2`.
- `RR.rng.stream(name) -> { next, int, chance, pick, weighted, normal }` for `market | events | deals | npc`; plain `RR.rng.*` = the legacy `misc` stream. Adding rolls to one stream **must not** change another stream's sequence (A21).
- `RR.data.npcs` — **14 NPC templates** (Appendix E.1): `{ id, role, namePool:{first[≥8], last[≥8]}, startKnown, tierStart, bio, perksKey, art:{outfit} }`. Starter roster (known at New Game): `sibling` (FAMILY), `parent` (FAMILY), `boss` (BOSS), `friend` (FRIEND), `banker` (BANKER). Others are met through events/purchases (Appendix E.1). Names are drawn with `rng.npc`; pools must be culturally diverse and stereotype-free.
- Two additional **fixtures**: `healthy_saver` (starter + one SAVINGS deposit of 10,000 @ 1.5%, insurance NONE) and `neglected` (health 25, no insurance, cash 200).

#### 2.8.2 Step 1.13 — Art runtime (details & asset list in Appendix F)
- **Icons:** `RR.data.iconSprite` is a JS **string** containing an inline `<svg>` sprite of ≥ 70 `<symbol id="ic_…">` (Tier A of Appendix F.2); `app.boot` injects it into the DOM once. (Never `fetch` or `<use href="file.svg#id">` — both break on `file://`.) `RR.ui.icon(name, { size = 20, tone, label }) -> HTMLElement` returns `<svg class="ic" aria-hidden="true"><use href="#ic_name"/></svg>`, or `role="img"` + `aria-label` when `label` is passed. Unknown name ⇒ fallback `ic_help` and one dev-only `console.warn`.
- **Avatars:** `RR.ui.avatar.render(look|lookSeed, { size, role }) -> SVGElement` composes a portrait from parts (skin ×6, hair ×10, hair colour ×8, outfit ×10 per role family, accessory ×6, background ×6) chosen **deterministically** from the seed (same seed ⇒ identical markup). Also used for the player ("avatar_seed" later syncs to the profile).
- **Scenes:** `RR.ui.scene.render(sceneId, { palette, width, height }) -> SVGElement` — the 12 Tier-A parametric SVG backdrops for Event Cards (Appendix F.3), tinted by category colour tokens.
- **FX:** `RR.ui.fx.coinBurst(el)`, `.shake(el)` (cosmetic; disabled by `reducedFx`/`prefers-reduced-motion`).
- **Brand placeholders:** `assets/brand/` favicon.svg, logo.svg, og-image placeholder (final art in Phase 7).

#### 2.8.3 Step 1.14 — UI kit v2: toasts & modals
**Toast manager** (`RR.ui.overlays.toast`):
`show(msg, { tone = 'info', icon, key, durationMs, action: {label, onClick}, sticky = false }) -> id` · `dismiss(id)` · `clear()`.
| Rule | Spec |
|---|---|
| Tones | `info pos neg warn gold premium` — each has an icon, colour token and a **non-colour cue** (icon + label prefix for screen readers) |
| Stacking | newest on top, max `ui.toast.maxVisible` (4) visible; extras queue FIFO |
| Duration | `ui.toast.durationMs[tone]`; pause on hover/focus; `sticky` stays until dismissed or `action` used |
| De-dupe | same `key` within `dedupeMs` collapses into one toast with a `×N` badge |
| A11y | container `aria-live="polite"` (`role="status"`); `neg` toasts that need attention use `role="alert"`; every toast has a keyboard-reachable close button; Esc dismisses the focused toast |
| Motion | slide/fade 200 ms; none when reduced motion |
| Settings | `settings.toasts === false` ⇒ only `neg`/`warn` shown |
**Modal manager** (`RR.ui.overlays.modal`): `open({ id, title, body: Node|string, size: 'sm'|'md'|'lg'|'full', actions: [{id,label,tone,primary}], dismissible = true, role = 'dialog'|'alertdialog', icon }) -> Promise<actionId|'dismissed'>` · `close(id?)` · `closeAll()`.
Rules: stack depth ≤ `ui.modal.maxDepth` (3; a 4th queues); **focus trap**, return focus to the opener on close; background gets `inert`; Esc/backdrop close **only** if `dismissible`; body text is set via `textContent` (never `innerHTML` with user/NPC/cloud strings — R19/H-4); animations respect reduced motion; the first action marked `primary` is focused (for `alertdialog`: the safest action).
**Modal catalogue** (ids are stable; later phases fill bodies):
| Id | Purpose | Dismissible | Phase |
|---|---|---|---|
| `confirm` | generic confirm (sell, payoff, delete) | yes | 1 |
| `payday` | payday summary (Presenter awaits) | no | 2 |
| `receipt` | full list of EffectReceipts ("+N more") | yes | 1 |
| `consequence` | CRISIS acknowledgement | **no** | 1 shell / 2 |
| `shortfall` · `liquidation` | §3/§4 | no | 2/3 |
| `escape` · `victory` · `gameover` | §5 | no | 4 |
| `settings` | audio, toasts, animations, reduced FX, tutorial hints, data export/import | yes | 1 |
| `glossary` | term browser | yes | 1 |
| `auth` | sign in / create account / reset | yes | 5 |
| `conflict` | cloud-vs-device save conflict | **no** | 5 |
| `account` | profile, retention policy, export, delete | yes | 5–6 |
| `premium` | perks + subscribe/manage | yes | 6 |
| `update` · `maintenance` | min-client-version / maintenance banner | no | 5 |
**Receipt presenter** `RR.ui.receipt.present(receipts, {source, severity})` implements §1.12.11 and is the **only** place that turns receipts into toasts/strips.

#### 2.8.4 Step 1.15 — Persistence adapters, settings & environment
```js
// RR.persist — the seam Phase 5 plugs the cloud into (engines never see it)
adapter: 'local'                                   // later also 'cloud' via RR.sync
list() -> Promise<Result<SaveMeta[]>>             // SaveMeta { slot, label, turn, mode, status, netWorth, updatedAt, source:'local'|'cloud' }
load(slot=1) -> Promise<Result<state>>            save(slot, state, opts) -> Promise<Result<{version?}>>   remove(slot) -> Promise<Result>
// RR.settings — rr.settings.v1 in localStorage; mirrors state.meta.settings for the active game; get(key) set(key, val) subscribe(fn)
// RR.env     — { mode: 'OFFLINE'|'ONLINE', name: 'local'|'dev'|'prod', supabaseUrl, publishableKey, captchaSiteKey, siteUrl } from window.__RR_ENV__
```
- The **local adapter** wraps `RR.save` (key `rr.save.v1`, slot 1 only for guests). `RR.save.exportJSON/importJSON` remain the user-facing backup path.
- `RR.env.mode === 'OFFLINE'` when `__RR_ENV__ == null` (`file://`) — **all online UI is rendered disabled with a tooltip** ("Online play needs the hosted version"), the game is fully playable as Guest.
- Settings modal persists to `rr.settings.v1` (survives New Game); `prefers-reduced-motion` forces `animations=false`, `reducedFx=true`.

#### 2.8.5 Step 1.16 — Ledger, HUD & Title v2
- **HUD:** + Health meter (lime `--health`, heart icon, tier label, `aria-valuenow`), account chip placeholder (avatar, name or "Guest", sync-status icon slot, crown slot).
- **Income Statement:** + `Interest` row (under Passive, cyan, dimmed at 0) and `Health insurance` row (under Expenses). `Lifestyle` row shows the indexed amount (F5b).
- **Balance Sheet:** + `Deposits` keyed list (label, balance, APY chip) between Cash and Stocks; `Emergency fund: X months` ratio chip.
- **Contacts panel shell** (right drawer, empty list rendered from `state.npcs` with avatar, role chip, tier bar) and **Life tab shell** in the Action Dock (health actions, insurance selector — disabled until Phase 2).
- **Title screen v2:** *Continue* · *New Game* · *Sign in / Create account* (disabled OFFLINE) · *Play as Guest* · *Import save* · *Settings* · footer links *Privacy · Terms · Credits* (static pages added in Phase 8; placeholders now).
- **Colour tokens added to `tokens.css`:** `--health:#a3e635; --npc:#f472b6; --asset:#fb923c; --premium:#e879f9`. Category chips: DEAL cyan · DOODAD amber · LIFE violet · MARKET blue · QUIET grey · **NPC pink · ASSET orange**. Every colour-coded element **also** carries an icon or text label (R11) — pink/rose and violet/blue pairs are never distinguished by colour alone.

#### 2.8.6 Stub registry additions
| Stub | Phase 1 behaviour | Replaced in |
|---|---|---|
| `RR.npc.interact`, `RR.health.*`, `RR.story.*` | `{ok:false, reason:'NOT_IMPLEMENTED'}` + toast "Arrives in Phase 2" | Phase 2 |
| `RR.deposits.*`, `RR.property.*` | `NOT_IMPLEMENTED` | Phase 3 |
| `RR.auth`, `RR.cloud`, `RR.sync`, `RR.entitlements` | not defined; Title/Account UI shows OFFLINE state | Phases 5–6 |

#### 2.8.7 Acceptance tests (append to `dev/tests.html`; numbering continues §2.7)
11. **Schema v2:** `create()` has every §1.12.3 key; `validate` rejects `relationship: 101`, `health.value: NaN`, duplicate NPC ids; a hand-built **v1** state migrates to v2 and validates.
12. **Interest ledger:** `healthy_saver` fixture → `income.interest = 13`, `passive = 13`, `taxes = 701`, `monthlyCashflow = 931` (starter 919 + 13 − 1), `assets.deposits = 10,000`, `assets.total = 121,000`.
13. **Health factor:** value 70 ⇒ GOOD, 69 ⇒ FAIR, 39 ⇒ POOR (salary 3,500 → **3,150**), 0 ⇒ CRITICAL (salary 0). Insurance STANDARD ⇒ `expenses.insurance = 120`, included in `expenses.total`.
14. **Lifestyle inflation:** `inflationIndex = 1.10`, passThrough 0.5 ⇒ `lifestyle = 840`; with `enabled:false` ⇒ 800.
15. **Condition factors:** RE (price 120,000, rent 1,500, idx 1.0): condition 60 ⇒ value **116,400**, rent **1,425**; condition 20 ⇒ value **96,000**, rent **1,050**; BASIC plan on assetBase 120,000 ⇒ maint **50**/mo; FULL ⇒ **120**; insured ⇒ **50**/mo.
16. **RNG streams:** same seed; interleaving 1,000 extra `stream('npc').next()` calls leaves the first 100 `stream('market').next()` values unchanged; stream states survive export→import.
17. **Toasts:** 6 `toast.show` within 100 ms ⇒ ≤ 4 visible, rest queued; same `key` within 1 s ⇒ one toast with `×N`; `neg` uses `role="alert"`; reduced motion ⇒ no animation classes; Esc dismisses the focused toast.
18. **Modals:** 4 simultaneous opens ⇒ 3 shown + 1 queued; focus trapped and restored to opener; Esc ignored when `dismissible:false`; `open()` resolves with the clicked action id; body strings containing `<img onerror>` render as text.
19. **Avatars & scenes:** same `lookSeed` ⇒ byte-identical SVG; 1,000 seeds ⇒ ≥ 950 distinct; every Tier-A `art.scene` id in Appendix F.3 renders without errors at 480×270 and 1,920×1,080.
20. **Icons:** every Tier-A `ic_*` listed in Appendix F.2 exists in `RR.data.iconSprite`; unknown name ⇒ fallback, one warning.
21. **Persist/env:** `RR.persist.local` passes the `RR.save` round-trip test; opening via `file://` ⇒ `RR.env.mode === 'OFFLINE'`, online controls disabled, Guest play works; via `http://localhost` with an env file ⇒ `'ONLINE'`.
22. **A11y/contrast:** every text/background token pair used on glass panels ≥ **4.5:1** (computed in the test); toasts, modals, Contacts drawer and Life tab are fully keyboard-operable.

---

## 3. PHASE 2 — CORE GAME LOOP & TURN ENGINE
*Prerequisite reading: §0, §1 (incl. §1.12), §10 (Handoff Log), Appendix E. Requires Phase 1. Delivers: a playable month loop with payday, events, a continuously updating ledger, **plus NPC relationships, health, and choices with delayed consequences (§3.11).***

### 3.1 Objectives (Build Steps)
| Step | Build |
|---|---|
| **2.1** | **Turn state machine** `RR.turn` with Presenter hook, blocking semantics, phase gates (R10). |
| **2.2** | **Payday engine** `RR.payday` (run, preview, modifier/asset ticks, credit update) + `PaydayReport`. |
| **2.3** | **Effects interpreter** `RR.effects` — closed-list ops executed inside commits. |
| **2.4** | **Event Director** `RR.events` — weighted category pick, template filtering, instantiation, resolve. |
| **2.5** | **Starter event content** `24-data-events.js` (see §3.5). |
| **2.6** | **Shortfall detection** and minimal resolution hook (stubbed, §3.8). |
| **2.7** | **Turn UI** `25-ui-turn.js`: phase stepper, Payday summary overlay, Event Card in center stage, Action Dock shell, "Next Month" button, Presenter implementation. |
| **2.8** | **Headless runner** `RR.dev.simulateTurns(n, policy)` + determinism/amortization tests. |

### 3.2 Turn state machine
```
START ─▶ PAYDAY ─▶ cash<0? ─yes▶ SHORTFALL ─resolved▶ MARKET ─▶ EVENT ─▶ ACTION ─[endTurn]▶ CLEANUP ─▶ START(turn+1)
                     └─no────────────────────────────▶ MARKET
EVENT: draw card → auto-resolve (forced/QUIET) or BLOCK on pendingCard until RR.events.resolve()
ACTION: BLOCK until RR.turn.endTurn()
CLEANUP: stats snapshot → RR.progression.checkEndConditions() → autosave → next START (or TRANSITION/ENDED)
```
- **START:** `turn++` (first call turns `0→1`), emit `turn:started`. (Director droughts are updated at draw time, not here.)
- **PAYDAY:** `RR.payday.run()`; store `loop.lastPayday`.
- **SHORTFALL:** only if `cash < 0`; sets `loop.pendingDecision = {type:'SHORTFALL', payload:{shortfall}}`; blocks.
- **MARKET:** `RR.market.tick()` (stub in Phase 2).
- **EVENT:** `RR.events.draw()`.
- **ACTION:** player free actions; `canAct` gate.
- **CLEANUP:** push `stats.netWorthHistory/passiveHistory` (capped), `RR.progression.checkEndConditions()` (stub), `RR.save.write()`.

### 3.3 Key functions / methods
```js
// ── RR.turn ──────────────────────────────────────────────
startGame() -> Result                      // loop.status='RUNNING', phase START, turn 0; then advance()
advance() -> Promise<Result>               // run current phase handler, await presenter.before(nextPhase), step; loops until blocked
endTurn() -> Promise<Result>               // legal only in ACTION with no pendingCard/pendingDecision
resume() -> Promise<Result>                // call after a blocking decision resolves (events.resolve / debt.resolveShortfall do this)
isBlocked(state) -> { blocked: bool, reason: 'CARD'|'DECISION'|'ACTION'|null }
canAct(state, family) -> bool              // Action Gate table §1.4
setPresenter(p)                            // p.before(phase, state) -> Promise|void ; default = immediate
// ── RR.payday ────────────────────────────────────────────
run() -> Result<PaydayReport>              // algorithm §3.4
preview(state) -> { net, interest, principal, closing: [debtId] }   // pure; HUD shows "Next payday: +$919"
// ── RR.effects ───────────────────────────────────────────
validate(ops) -> { ok, errors }
apply(ops, ctx) -> Result<{ applied: [] }>   // ctx = { cardId?, templateId?, source }; runs inside ONE commit; unknown op ⇒ INVALID_ARGS, nothing applied
// ── RR.events ────────────────────────────────────────────
draw() -> Result<EventCard|null>           // algorithm §3.5; sets loop.pendingCard (or auto-resolves)
buildPool(state) -> EventTemplate[]        // mode/tier filter, requires, cooldown, maxOccurrences, anti-repeat
categoryWeights(state) -> { DEAL, DOODAD, LIFE, MARKET, QUIET }
instantiate(template, state) -> EventCard  // rolls params with RR.rng; cost ranges rounded to nearest $50
resolve(optionId) -> Promise<Result>       // applies ops / handler, clears pendingCard, then turn.resume()
skip() -> Promise<Result>                  // only if !forced; counts stats.dealsPassed
```

### 3.4 Payday algorithm (`payday.run`, one commit labeled `payday.run`)
1. Snapshot `derived` → `report.income/expenses/net` (`net = derived.monthlyCashflow`), `cashBefore`.
2. `cash += net`. *(Asset-linked debt service is already inside asset cash flows; unlinked debt service is inside `debtService`, so every payment is covered by this single net.)*
3. For each debt: `finance.amortizeOnePeriod(d)` → update `principal`, `termMonthsRemaining`, accumulate `interestAccrued`, `principalPaid` (and `stats.interestPaid += interest`); remove closed debts (clear `debtId` on any linked asset; log "paid off" as MILESTONE).
4. For each asset: `lifetimeCashflow += assetNet_i` (negative allowed); `vacantTurnsLeft = max(0, vacantTurnsLeft−1)`.
5. Tick modifiers: `turnsLeft−−`; remove at 0 (record in `modifiersExpired`).
6. Credit: `+config.credit.onTimeBonus` if no debt is DELINQUENT and (post-payday) `cash ≥ 0`; clamp 300–850.
7. `cashAfter`; if `cashAfter < 0` → `report.shortfall = −cashAfter`, `credit += shortfallPenalty`, `stats.shortfalls++`, emit `shortfall:opened`.
8. Write `loop.lastPayday = report`; `pushLog(PAYDAY, …, delta=net)`; emit `payday:done`.

### 3.5 Event Director algorithm (`events.draw`)
1. **Grace period:** if `turn ≤ gracePeriodTurns`, only `graceCategories` are eligible.
2. **Category weights:** `w(c) = baseWeights[c] × econMult[economy.phase][c] (default 1) × (1 + pityPerTurn[c] × droughts[c])`. Categories with an empty eligible pool get weight 0. `MARKET` has weight 0 until Phase 3 registers MARKET templates.
3. `RR.rng.weighted` → category. Then within `buildPool(category)` pick by `template.weight` (excluding `recentTemplateIds` within `recentWindow`, templates over `maxOccurrences`, within `cooldownTurns`, failing `requires`, or whose `tier` lacks the current `loop.mode`).
4. `instantiate` → `loop.pendingCard`; update `director` (`recentTemplateIds`, `occurrences`, `lastDrawnTurn`; `droughts[picked]=0`, others `+1`).
5. **Auto-resolve:** `forced` templates with a single option and `QUIET` cards auto-apply their ops but still display (card shown with a single "Continue" action).
6. `requires` keys supported: `minTurn, maxTurn, maxChildren, minCash, minNetWorth, hasAssetKind, minPassive, creditScoreBelow`.

**Effect ops (closed list):**
| Op | Params | Effect |
|---|---|---|
| `CASH_DELTA` | `value` | `cash += value` (negative allowed; may push cash < 0 → caught at next Payday/Action validation, never silently clamped) |
| `CASH_OR_CARD` | `value` (cost) | pay cash if `cash ≥ cost`, else charge overflow to a `CREDIT_CARD` debt (create or increase `principal`; respect `creditCard.limit` → else `OVER_LIMIT`) |
| `ADD_DEBT` | `{kind, principal, aprMode:'OFFER'|number, termMonths?}` | create Debt via `finance.offeredApr` |
| `ADD_MODIFIER` | `{label,target,mode,value,turnsLeft}` | push Modifier |
| `CHILD_DELTA` | `value` | clamp `0..config.child.max` |
| `SALARY_DELTA` | `value` or `{pct}` | permanent change to base salary |
| `LIFESTYLE_DELTA` | `value` | change `baseLifestyleExpense` (min 0) |
| `CREDIT_DELTA` | `value` | clamp 300–850 |
| `MARKET_SHOCK` | `Shock` | `RR.market.applyShock` (stub in Phase 2) |
| `ASSET_MOD` | `{assetKind, selector:'RANDOM'|'ALL'|id, field:'vacantTurnsLeft', value}` | whitelisted fields only |
| `FORCE_SELL` | `{assetKind, selector}` | stub until Phase 3 |
| `LOG` | `text` | `pushLog(EVENT, text)` |

**Doodad design rule:** non-forced doodads always offer **Pay cash / Put on credit card / Skip** so the player experiences the cost of temptation and of revolving debt.

### 3.6 Starter content (`24-data-events.js`, ≥ 24 templates)
- **DOODAD (8–10):** optional — new phone ($800–1,000), weekend getaway ($1,200–1,600), designer sneakers ($300–450), big-screen TV ($1,500–2,200), gadget subscription bundle; forced — car repair ($900–1,400), dental emergency ($700–1,000), laptop dies ($1,000–1,400).
- **LIFE (8):** baby (max 3 children), raise (+4–8% salary, once per 18 turns, `minTurn` 8), downsized (SALARY×0 for 3 turns, `minTurn` 12, once), medical emergency (`CASH_OR_CARD` $1,800–3,500), inheritance (+$4,000–12,000, `maxOccurrences` 1), rent/insurance hike (`LIFESTYLE_DELTA` +50–120), side gig (INCOME +250–400 for 6 turns), tax refund (+$600–1,400).
- **DEAL (3 placeholders, one per `dealKind` with minimal params)** — render correctly; "Buy" routes to `RR.assets.acceptDeal` (stub). Full deal library arrives in Phase 3 (`36-data-deals.js`).
- **QUIET (4):** flavor cards that surface a glossary lesson ("Cash flow beats paycheck size…").
Each template carries `title`, `body`, `weight`, `tier:["RAT_RACE"]`.

### 3.7 UI deliverables
- **Phase stepper** in HUD: `START·PAYDAY·MARKET·EVENT·ACTION`, current phase highlighted; `loop.phase` bound.
- **Payday summary overlay:** itemised lines animate into the ledger (income lines in, expense lines out, net with count-up), interest/principal split, closed debts celebrated; dismiss with "Continue" (the Presenter awaits this).
- **Event Card (center stage):** category-colored chip (DEAL cyan · DOODAD amber · LIFE violet · MARKET blue · QUIET grey), title, body, key numbers table, option buttons (disabled with reason tooltip when illegal, e.g. insufficient cash).
- **Action Dock shell:** empty tabs for Market / Portfolio / Bank (Phase 3 fills them) + prominent **Next Month** (`data-action="turn.endTurn"`, enabled only in ACTION).
- **Shortfall modal (basic):** shows shortfall, single "Take emergency loan" button (stub path).
- **Log:** every payday/event writes a line; ticker updates.

### 3.8 Stub registry (leave these for Phase 3/4)
| Stub | Phase 2 behavior | Replaced in |
|---|---|---|
| `RR.market.tick()` | no-op returning `{ok:true}` | Phase 3 |
| `RR.market.applyShock(shock)` | logs and returns ok | Phase 3 |
| `RR.assets.acceptDeal(cardId, optionId)` | `{ok:false, reason:'NOT_IMPLEMENTED'}`; UI toast "Investing unlocks in Phase 3" | Phase 3 |
| `RR.effects` `FORCE_SELL` | `NOT_IMPLEMENTED` | Phase 3 |
| `RR.debt.resolveShortfall(choice)` | creates a `BANK_LOAN` (INTEREST_ONLY, APR = `offeredApr(BANK_LOAN)+emergencySpread`) sized to `ceil(shortfall/1000)·1000`, then resumes turn | Phase 3 (full flow) |
| `RR.progression.checkEndConditions()` | no-op returning `{ok:true}` | Phase 4 |

### 3.9 Integration points (read / mutate)
| Function | Reads | Mutates |
|---|---|---|
| `turn.advance/endTurn` | `loop.*` | `loop.status/phase/turn` |
| `payday.run` | `derived.*`, `player.financials.liabilities/modifiers`, `inventory.*` | `player.financials.cash/creditScore/liabilities/modifiers`, `inventory.*.lifetimeCashflow/vacantTurnsLeft`, `loop.lastPayday`, `stats.shortfalls`, `log` |
| `effects.apply` | `player.financials`, `inventory`, `market` | `player.financials.*`, `inventory.*.vacantTurnsLeft`, `log` |
| `events.draw` | `loop.mode/turn/director`, `market.economy.phase`, `derived`, `inventory` (for `requires`) | `loop.pendingCard`, `loop.director` |
| `events.resolve/skip` | `loop.pendingCard` | `loop.pendingCard=null`, via `effects.apply`; `stats.dealsPassed/doodadsPaid` |
| `turn` CLEANUP | `derived.netWorth/passive` | `stats.netWorthHistory/passiveHistory/peakNetWorth` |

### 3.10 Acceptance tests
1. **Payday math:** Starter → one `payday.run`: cash 3,000 → **3,919**; mortgage principal 85,000 → 84,886 (interest 460, principal 114); card 2,500 → 2,469; `lastPayday.net = 919`.
2. **Amortization closes:** headless-run payday 36× on a fixture with only the car loan → loan removed on payday 36, `expenses.debtService` drops by 280, ledger updates.
3. **Determinism:** same seed + same scripted choices for 60 turns → byte-identical `JSON.stringify(state)` on two runs; different seed → different event sequence.
4. **Gates:** `endTurn` during EVENT with a pending card → `BLOCKED`; trading actions outside ACTION → `WRONG_PHASE`.
5. **Director:** over 500 seeded draws, category frequencies within ±4 points of the effective weights; no template repeats within `recentWindow`; no LIFE cards in the first 3 turns; `maxOccurrences` honored.
6. **Shortfall:** fixture with salary modifier ×0 and 0 cash → payday opens SHORTFALL, credit −25, emergency loan resolves it, turn resumes; ledger shows the new BANK_LOAN row.
7. **Effects atomicity:** an op list containing one invalid op applies nothing.
8. **Presenter:** UI presenter blocks on the Payday overlay; headless default presenter runs 120 turns in < 2 s.
9. **Save/Load mid-turn:** reload during EVENT restores the same `pendingCard` and phase.

### 3.11 v2 ADDITIONS — LIFE SYSTEMS, CHOICES & CONSEQUENCES (REQUIRED PART OF PHASE 2)
*Read §1.12 and Appendix E first. Phase 2 now delivers the "living world" layer: NPC relationships, health, the story/consequence engine, and a richer Event Director. Property, deposits and price-shock content that depends on Phase 3 engines is authored in Phase 3 (Appendix E.3 marks every event's phase).*

#### 3.11.1 Objectives (Steps 2.9–2.16)
| Step | Build |
|---|---|
| **2.9** | **Story engine** `RR.story` (`27-story.js`): flags, counters, **predicate evaluator** `test(pred, ctx)` shared by `requires` / `weightMods`, consequence scheduling & resolution, history, Journal feed. |
| **2.10** | **NPC engine** `RR.npc` (`26-npc.js`): tiers, `interact`, memory, F18 decay, F19 `perks`, meet/status, availability. |
| **2.11** | **Health engine** `RR.health` (`28-health.js`): F17 tick, actions (checkup, vacation, gym), insurance plan, forced hospital, tier→salary factor (F3b). |
| **2.12** | **Effects v2** `RR.effects`: all §1.12.5 ops, `insurable`, `$payload` resolution, probabilistic `outcomes`, **EffectReceipts**. |
| **2.13** | **Event Director v2** `RR.events`: NPC/ASSET categories, severity cooldowns, mercy rule, `weightMods`, `involves` target picking, `queued` events, art fields. |
| **2.14** | **Content (Phase-2 set, ≥ 38 new templates + migrate all v1 templates to v2 tags/severity/art):** Appendix E.3 rows marked **P2**. |
| **2.15** | **UI:** Event Card v2, Result strip, Consequence modal, Contacts drawer (live), Life tab (live), Journal drawer, receipt wiring, milestone toasts (§1.12.11). |
| **2.16** | **Replay recorder** `RR.replay` (R20) + headless runner updates + tests. |

#### 3.11.2 Turn-engine changes (amends §3.2, §3.4)
```
START   : turn++ · loop.turnCounters ← {0,0} · story.resolveDue(turn)  ← fire due Consequences (one commit each, in dueTurn then id order)
PAYDAY  : v1 steps 1–8, plus  (a) F17 health tick  (b) deposit interest/maturity [Phase 3]  (c) F16 condition tick [Phase 3]
EVENT   : events.draw()  — queued event due this turn has priority (unless blocked by CRISIS cooldown, then it slips +1 turn)
CLEANUP : stats snapshot · F18 relationship tick · health emergency check (health = 0 ⇒ queue life_hospital for next EVENT) · checkEndConditions · autosave
```
*Never* reorder these; save/load and determinism tests depend on the order.

#### 3.11.3 Key functions / methods (signatures are the contract)
```js
// ── RR.story ─────────────────────────────────────────────
test(pred, ctx) -> bool                   // pred: object of §1.12.4 `requires` keys; ctx {state, template?, target?}; unknown key ⇒ false + dev warning
flag(key) -> any   counter(key) -> number
schedule(spec, ctx) -> Result<Consequence>        // spec as SCHEDULE op; dueTurn = turn + rng.events.int(inTurns); id csq_####
resolveDue(turn) -> Result<{ fired: Consequence[] }>   // for each due: roll p with rng.events → ops or else-ops via effects.apply; remove; emit consequence:fired
journal(state) -> [{ id, text, dueIn? }]  // only Consequences with visible:true (e.g. "Jamie owes you $1,500"); never reveals p
recordChoice(templateId, optionId)        // appends story.history (cap)
// ── RR.npc ───────────────────────────────────────────────
tier(relationship) -> NpcTier             // config.npc.tiers (≥ threshold wins)
list(state, {role?, status?}) -> Npc[]    get(idOrRole) -> Npc|null
interact(npcId, action /*'CALL'|'LUNCH'|'GIFT'*/) -> Result<{delta, receipts}>   // gates: ACTION phase; ACTIVE; counters (LIMIT_REACHED at config.npc.interactionsPerTurn); cash for cost; 2nd interaction with the same NPC in a turn ⇒ ½ delta
applyDelta(state, npcId, value, memory?) -> void  // inside a commit; clamp ±100; push memory; set lastInteractionTurn; emits npc:changed on tier change
perks(state) -> { bankerSpread, bankerEmergencyMinScore, agentGreatShift, agentPoorShift, bossRaiseMult, bossLayoffMult, handymanCostMult, mentorAccuracy, tenantVacancyMult, advisorCostMult }   // pure (F19)
decay(state) -> void                      // F18; called at CLEANUP inside a commit
// ── RR.health ────────────────────────────────────────────
tier(value) -> HealthTier     salaryFactor(tier) -> number
tick(state) -> void                       // F17; inside payday commit
act(action /*'CHECKUP'|'VACATION'|'JOIN_GYM'|'CANCEL_GYM'*/) -> Result           // ACTION phase; cooldowns from config.health.actions; insurable HEALTH applies to CHECKUP only
setInsurance(plan) -> Result              // ACTION phase; changes premium immediately; `INSURANCE_SET` op does the same from events
// ── RR.effects (extends §3.3) ────────────────────────────
apply(ops, ctx) -> Result<{ applied: [], receipts: EffectReceipt[] }>   // emits bus 'effects:applied'; ctx may carry { payload, target:{npcId?, assetId?, symbol?}, option? }
resolvePayload(ops, payload) -> ops       // replaces "$name" tokens; missing ⇒ INVALID_ARGS
// ── RR.events (extends §3.3) ─────────────────────────────
resolve(optionId) -> Promise<r>           // if option.outcomes: pick ONE with rng.events.weighted(p); the picked outcome's ops are applied after option.ops; card result = { text, receipts }
pickTarget(template, state) -> { npcId?, assetId?, symbol? } | null     // null ⇒ template ineligible this turn
// ── RR.replay (R20) ──────────────────────────────────────
start({ seed, professionId, dreamId, name }) -> void    push(entry) -> void     export() -> { v:1, header, actions: [{turn, phase, name, args}] }     clear()
```
**Interaction rules (config.npc):** CALL free (+2), LUNCH $60 (+5), GIFT $150 (+8); `interactionsPerTurn = 2` (shared across NPCs; counted in `loop.turnCounters.interactions`). HOSTILE NPCs refuse LUNCH/GIFT (`NPC_UNAVAILABLE`, message from NPC bio line). DORMANT/LOST NPCs can't be contacted.
**Option affordance:** every option derives a *cost label* from its ops (`Δcash`, `insurable` ⇒ "after insurance ≈ $X"), and a **risk hint** when `outcomes` exist (`riskHint` text, never the raw probability unless the MENTOR perk `mentorAccuracy` unlocks "≈ 60%").
**Consequence rules:** `SCHEDULE` with `visible:true` creates a Journal line; `p` is rolled with `rng.events` **at fire time** (not at schedule time) so saving/reloading cannot be used to re-roll (the stream state is part of the save). Chains: a consequence's ops may themselves `SCHEDULE`/`QUEUE_EVENT`/`SET_FLAG` (max chain depth 3, enforced by `ctx.depth`).

#### 3.11.4 Event Director v2 (amends §3.5)
1. **Eligibility (per template):** v1 filters + `requires` v2 keys (`story.test`) + `involves` (a matching ACTIVE NPC / owned asset / held stock must exist via `pickTarget`) + severity cooldown (`CRISIS`: `turn − lastSeverityTurn.CRISIS ≥ 4`; `MAJOR`: `≥ 2`).
2. **Category weights:** `w(c) = baseWeights[c] × econMult[phase][c] × (1 + pity[c]·droughts[c])`; `ASSET` is 0 unless the player owns any asset; `NPC` is 0 unless an eligible template exists; categories with empty pools are 0 (as v1).
3. **Template weight:** `template.weight × Π mult of satisfied weightMods × npc perk multipliers (F19 boss/tenant/…)`.
4. **Grace period (turns ≤ 3):** categories limited to `DEAL, DOODAD, QUIET, NPC`; severity must be `MINOR`.
5. **Mercy rule:** if `derived.ratios.emergencyMonths < severity.mercyLiquidMonths` then any **cost-bearing** `MAJOR/CRISIS` template (has a negative `CASH_*`/`ADD_DEBT` op) has its weight × 0.3 (never 0 — the debt-spiral lesson stays possible, just not instant).
6. **Queued events:** `loop.director.queued` entries due this turn are drawn first (bypass category pick; still respect CRISIS cooldown).
7. **Instantiate:** roll `payload` with `rng.events`; money ranges × `economy.inflationIndex`, rounded to $50; store `payload.targetNpcId/AssetId/Symbol`; attach NPC avatar & scene; update `lastSeverityTurn`.
8. **Auto-resolve / forced** rules as v1.
**Streams:** category/template/outcome rolls use `rng.events`; names use `rng.npc`; health/condition noise uses `rng.misc`. (A21)

#### 3.11.5 UI deliverables (v2)
- **Event Card v2:** scene backdrop (`RR.ui.scene`, ≤ 160 px tall, tinted by category), category chip (+icon), severity badge (MAJOR amber ring, CRISIS rose ring + shake once), NPC portrait(s) when `involves`, title, body (≤ 280 chars), **key-numbers table**, option buttons with icon, cost label and risk hint; disabled options show the exact reason ("Needs $1,200 more cash").
- **Result strip** (MAJOR resolved): up to `stripMax` receipt chips (icon + label + signed delta, tone-coloured) and the outcome sentence; "Continue" proceeds.
- **Consequence modal** (CRISIS): alertdialog, icon, headline, receipts list, one *Acknowledge* button.
- **Contacts drawer (live):** NPC cards (avatar, name, role chip, tier badge with icon, relationship bar −100..100, last contact, memory tooltip), action buttons Call / Lunch / Gift with cost and remaining interactions "1 of 2 left"; disabled-with-reason states; filters ACTIVE/DORMANT.
- **Life tab (live):** Health meter + tier + sparkline (last 24 turns from `stats` — add `healthHistory` additively), actions (Checkup, Vacation, Gym toggle) with cooldown chips, **Insurance selector** (plan, premium, coverage text; change confirmed via `confirm` modal), monthly "Health drag" estimate.
- **Journal drawer:** "Open threads" (visible consequences) + "Recent choices" (last 10 from `story.history`, with outcome text).
- **Milestone toasts (gold):** first NPC at FRIENDLY / TRUSTED, health back to GOOD after POOR, first insurance, first consequence payoff.
- **Settings modal** wired to `RR.settings` (toasts, reduced FX, sound toggle placeholder).

#### 3.11.6 Stub registry additions
| Stub | Phase 2 behaviour | Replaced in |
|---|---|---|
| `NPC_MEET` for TENANT / `assetId` links | role exists in data but no tenant NPC is created (no assets yet) | Phase 3 |
| `ASSET_MOD` fields `condition`, `rentBoostPct`, `closedTurnsLeft`, `insured` | validate OK, apply to nothing (no assets) → `{ok:true, data:{applied:0}}` | Phase 3 |
| `DEPOSIT_*`, `STOCK_PRICE_MULT`, `STOCK_SPLIT` | `NOT_IMPLEMENTED` | Phase 3 |
| `events` with `tags` PROPERTY/BUSINESS/PORTFOLIO/PRICES/DEPOSIT | present in data files but filtered out (pool excludes templates whose `phaseRequired > 2`; add `"phaseRequired": 3` to those templates) | Phase 3 |

#### 3.11.7 Acceptance tests (continue §3.10 numbering)
10. **Consequence timing:** `SCHEDULE {inTurns:[3,3], p:1}` fires at the START of turn+3 and not before; with `p:0.5` over 2,000 seeded runs the success rate is 0.50 ± 0.03; saving between scheduling and due-turn and reloading yields the identical outcome (the roll happens at fire time from the saved stream); journal line appears only if `visible:true` and disappears when fired.
11. **NPC tiers & interaction:** relationship 60 → TRUSTED, 59.9 → FRIENDLY, 20 → FRIENDLY, 19.9 → NEUTRAL, −9 → NEUTRAL, −10 → COLD, −39 → COLD, −40 → HOSTILE. LUNCH costs $60 and adds 5.0; a second interaction with the same NPC that turn adds 2.5; a third interaction (any NPC) → `LIMIT_REACHED`; HOSTILE + LUNCH → `NPC_UNAVAILABLE`.
12. **Relationship decay:** FRIEND at +30 idle 8 turns → no change; at turn 9 → 29, then −1 per turn toward 0; negative −30 recovers +0.5/turn toward 0; FAMILY never decays; any interaction resets the idle clock.
13. **Health tick (F17):** value 60, emergencyMonths ≥ 3, DTI 0.30 → +1.0 (61.0); DTI 0.60 and emergencyMonths 0.3 → −0.5 (59.5); value 80 (≥ recoverCap) with the same good inputs → +0.5 (relief only); GYM modifier adds +1.5; value clamps at 0 and 100.
14. **Health actions & insurance:** `CHECKUP` costs $150 and adds +8 with NONE insurance; with STANDARD the player pays **$60**; a second checkup inside 6 turns → `COOLDOWN`. `hl_accident` rolled at $3,000: NONE pays $3,000, STANDARD **$1,200**, COMPREHENSIVE **$450**.
15. **Hospital loop:** health forced to 0 → CLEANUP queues `life_hospital`; the card is CRISIS, salary ×0 for 2 turns, health resets to 35, cost insurable; the game does **not** end (A22).
16. **Effects v2 atomicity & receipts:** op list with one unknown `ASSET_MOD.field` applies nothing and returns `INVALID_ARGS`; a valid 4-op list returns 4 receipts with correct `kind/delta/tone`; `CASH_OR_CARD` overflow returns a CASH and a DEBT receipt; `HEALTH_DELTA −200` clamps to 0; unresolved `$name` → `INVALID_ARGS`; `SCHEDULE` beyond `maxConsequences` → `LIMIT_REACHED`.
17. **Director v2:** 5,000 seeded draws — category frequencies within ±4 points of effective weights; no CRISIS within 4 turns of another, no MAJOR within 2; no MAJOR/CRISIS/LIFE/MARKET in turns 1–3; NPC cards only when an eligible ACTIVE NPC exists; a queued event appears exactly on its due turn; with `emergencyMonths = 0.2` cost-bearing MAJOR/CRISIS frequency is **0.3× (±25% relative)** that with `emergencyMonths = 3`.
18. **Choice → consequence chain (integration):** scripted `np_friend_borrow` → "Lend $1,500": cash −1,500, Journal shows "Jamie owes you $1,500", consequence fires 4–8 turns later; with relationship ≥ 20 the repay branch is taken whenever the roll passes (p 0.75), else the else-branch lowers the relationship by 12 and adds an NPC memory entry `DEFAULTED`. Identical across two seeded runs.
19. **UI feedback contract:** 1 receipt → 1 toast; 5 receipts → 2 toasts + a "+3 more" toast that opens the Receipt modal; MAJOR resolution → Result strip + 1 toast; CRISIS → non-dismissible alertdialog with focus on *Acknowledge*; a failed action shows inline reason **and** a `neg` toast.
20. **Replay (R20):** `RR.replay.export()` after a scripted 60-turn game, then re-running the actions headless from the same header (seed/profile) yields a byte-identical final state; every UI-initiated mutation appears in the log in order; non-mutating UI actions (open drawer) do not.
21. **Content lint:** all templates validate — unique ids; ops in the closed list; every `$name` has a payload definition; every `art.scene` and `art.icon` exists (Appendix F); `tags`/`severity` valid; option label ≤ 48 chars; body ≤ 280 chars; every non-forced card has a decline option; every cost-bearing option is labelled; `phaseRequired` honoured.
22. **Persistence:** reload during a pending `outcomes` card, during a queued event, and with open consequences restores identical state; Contacts/Life/Journal drawers fully keyboard-operable.

---

## 4. PHASE 3 — MARKET & ASSET ENGINE
*Prerequisite reading: §0, §1 (incl. §1.12), §10, Appendix E. Requires Phases 1–2. Delivers: the full economy — stocks, real estate (with condition), businesses, deposits, debt, price-shock events, forced liquidation, bankruptcy (§4.9 adds the v2 layer).*

### 4.1 Objectives (Build Steps)
| Step | Build |
|---|---|
| **3.1** | **Market engine** `RR.market` — economy cycle, stock random walks, RE/rent indices, business revenue walks, shocks (F8–F11). Replaces the Phase 2 stub. |
| **3.2** | **Assets engine** `RR.assets` — stock trading, real estate & business acquisition/sale, pure `analyzeDeal`, `quoteSale`, `portfolio` (F12–F13). |
| **3.3** | **Debt engine** `RR.debt` — borrow capacity, quotes, take/repay/payoff, shortfall resolution, forced liquidation, credit call, bankruptcy (F14–F15). |
| **3.4** | **Content:** `36-data-deals.js` (≥ 11 deal templates) + ≥ 8 MARKET templates; extend effect ops with `STOCK_MOD` and `CREDIT_CALL` (update §1.7); enable `MARKET` weight in the director. |
| **3.5** | **Market UI:** Market tab (stock table with sparklines, economy banner), trade modal. |
| **3.6** | **Deal UI:** Deal Analyzer inside the Event Card (live recalculation), Portfolio drawer (Stocks/Real Estate/Businesses tabs), sell flow with `quoteSale`. |
| **3.7** | **Bank UI:** loan quote/take dialog, repay/payoff panel (shows interest saved), full Shortfall modal, Liquidation Report modal. |
| **3.8** | **Tests & fixtures:** extend `dev/tests` with Phase 3 acceptance tests; add fixtures `landlord`, `leveraged`, `crash`. |

### 4.2 Canonical formulas (Phase 3)
**F8 — Economy tick.** `phaseTurnsLeft−−`; at 0 sample next phase from `phases[cur].next` via `rng.weighted`, `phaseTurnsLeft = rng.int(duration)`. `baseRate += baseRateEase·(phases[cur].baseRate − baseRate)`, clamp 0.02–0.10. `inflationRate += rng.normal()·monthlyNoise` (clamp min/max); `inflationIndex *= (1 + inflationRate/12)`.

**F9 — Stock step** (per stock, per tick). `μeff = mu + phase.stockDrift + Σ muDelta(shocks matching ALL or SECTOR)`; `σeff = sigma · phase.volMult · Π sigmaMult`; `Z = rng.normal()`;
`price' = max(floorPrice, round2(price · exp((μeff − σeff²/2)/12 + σeff·√(1/12)·Z)))`. `prevPrice = price`; append to `history` (cap `historyLength`). *(Expected gross annual return ≈ e^μeff — used by the test.)*

**F10 — Real-estate & rent indices.** `realEstatePrice *= 1 + (phase.reDrift − 0.5·(baseRate − 0.05) + Σ muDelta(RE shocks))/12 + reNoiseSigma/√12 · Z` · `realEstateRent *= 1 + (inflationRate + 0.25·phase.reDrift)/12 + rentNoiseSigma/√12 · Z`. (Higher rates depress property prices — lesson.)

**F11 — Business step** (per owned business). `revenueIndex *= 1 + (phase.bizGrowth + inflationRate + Σ muDelta(BIZ shocks))/12 + riskSigma/√12 · Z` (floor 0.2). Market multiple: `businessMultiple += 0.2·(phase.bizMultiple − businessMultiple) + 0.05·Z` (clamp 2–7). Shocks: `turnsLeft−−`, remove at 0.

**F12 — Deal analysis** (`assets.analyzeDeal`, pure, recalculated live as the down-payment slider moves):
```
RE:  loan = price − down · apr = offeredApr(PROPERTY_MORTGAGE) · payment = pmt(loan, apr, term)
     NOI = rent − opex · cashFlow = NOI − payment · cashInvested = down + closing
     capRate = 12·NOI/price · cashOnCash = 12·cashFlow/cashInvested · dscr = NOI/payment · breakevenOccupancy = (opex+payment)/rent
BIZ: net = revenue − costs · loan = price − down · payment = pmt(loan, apr, term) · cashFlow = net − payment
     roi = 12·cashFlow/down · paybackMonths = down/cashFlow · priceToEarnings = price/(12·net)
STOCK: yield = dpsAnnual/price
Verdict (config.deals): GREAT = cashFlow>0 ∧ (RE: cashOnCash≥0.12 ∧ dscr≥1.25 | BIZ: roi≥0.20 ∧ payback≤60)
                        RISKY = cashFlow<0 ∨ dscr<1.0 ∨ breakevenOccupancy>0.90 ; else FAIR
```
**F13 — Sale proceeds** (`assets.quoteSale`): STOCK `round(shares·price·(1−fees.stockTrade))` · RE `round(value·(1−fees.realEstateSell)) − linkedPrincipal` · BIZ `round(value·(1−fees.businessSell)) − linkedPrincipal`. If `proceeds < 0` the sale is allowed only when `cash ≥ −proceeds`, else `UNDERWATER`.

**F14 — Borrow capacity (`debt.borrowCapacity`).**
`rawCap = bank.incomeMultiple·totalIncome + bank.assetLtv·assets.productive − Σ principal(BANK_LOAN)` · `maxPayment = bank.maxDti·totalIncome − debtService` · `byDti = maxPayment·12 / apr` · `capacity = floorToStep(max(0, min(rawCap, byDti)), bank.loanStep)`. Origination fee = `round(bank.originationFee·amount)`, deducted from proceeds (`cash += amount − fee`). Mortgages require `down ≥ price·(1 − bank.maxLtvMortgage)`.

**F15 — Forced liquidation algorithm (`debt.forcedLiquidation`, one commit):**
1. `need = −cash`.
2. Iterate classes in `liquidation.order`; within a class sort candidates by `yield = max(netCashflow,0)/value` ascending (tie: value desc) — sell the *least productive* first.
3. For each candidate: `gross = value·(1 − haircut[class])·(1 − sellFee)`; `proceeds = gross − linkedPrincipal`; skip if `proceeds ≤ 0` (underwater assets are kept; they remain a drag); otherwise sell, repay linked debt, add to `LiquidationReport.sold[]` with `lossVsMarket`.
4. Stop as soon as `cash ≥ 0`. Personal assets are never sold.
5. Credit `+liquidationPenalty`; `stats.liquidations++`; log; open `LIQUIDATION_REPORT` decision.
6. If `cash < 0` after the loop: try an emergency loan if permitted (below); otherwise `RR.progression.endGame('BANKRUPT')`.

**Emergency loan rule:** allowed iff `creditScore ≥ bank.emergencyMinScore` and post-loan `debtService ≤ bank.emergencyMaxDti·totalIncome`; kind `BANK_LOAN`, INTEREST_ONLY, `apr = offeredApr(BANK_LOAN) + emergencySpread`, amount `= ceil(shortfall/loanStep)·loanStep`. (A repeated emergency-loan chain is the intended "debt spiral" lesson.)

**Prepayment.** AMORTIZING: `principal −= amt`, term unchanged, `monthlyPayment = pmt(newPrincipal, apr, termMonthsRemaining)` (payment falls — expenses drop). INTEREST_ONLY / REVOLVING: `principal −= amt`. Pay-off clears the debt and any asset `debtId`. `prepayable:false` debts reject with `INVALID_ARGS`.

**Deal generation (`36-data-deals.js` + `events.instantiate` for `dealKind`).** Roll income first, then derive price from it so economics are coherent:
`RE: rent from params; opex = rent·U(0.30,0.42); fairPrice = 12·(rent−opex)/capRateTarget, capRateTarget ∈ U(0.085, 0.115)` · `BIZ: net from params; fairPrice = 12·net·U(3.2, 4.6)`.
`quality = rng.weighted(GREAT w.20 priceMult .85 | FAIR w.50 ×1.00 | POOR w.30 ×1.20)`; `price = roundTo500(fairPrice·priceMult)`. Poor deals are intentional traps the player must learn to read. Offer payload also carries `minDownPct/maxDownPct` (RE 0.15–0.50; BIZ 0.25–0.60), `closingCosts = fees.realEstateClosing·price`, `termMonths` (RE 360; BIZ 60/120 choice), `riskSigma` (BIZ 0.12–0.35).

### 4.3 Key functions / methods
```js
// ── RR.market ────────────────────────────────────────────
tick() -> Result                              // one commit 'market.tick': F8 → F9 → F10 → F11; emits market:ticked
applyShock(shock) -> Result                   // assigns id; scope ALL | SECTOR:X | RE | BIZ; logs MARKET
stock(symbol) -> marketStock|null    priceOf(symbol) -> number
// ── RR.assets ────────────────────────────────────────────
analyzeDeal(offer, downPayment) -> Analysis                     // pure (F12)
acceptDeal(cardId, optionId, args) -> Result                    // args {downPayment, termMonths?}; routes to buy*; clears pending card & resumes turn
buyStock(symbol, shares) -> Result      sellStock(symbol, shares) -> Result
buyRealEstate(offer, downPayment) -> Result<asset>   sellRealEstate(id) -> Result
buyBusiness(offer, downPayment) -> Result<asset>     sellBusiness(id) -> Result
quoteSale(kind, id) -> { gross, fee, linkedPrincipal, proceeds, allowed }   // pure (F13)
portfolio(state) -> { stocks: Row[], realEstate: Row[], businesses: Row[] } // Row: value, equity, netCashflow, lifetimeCashflow, roi
// ── RR.debt ──────────────────────────────────────────────
borrowCapacity(state) -> { capacity, binding: 'INCOME'|'DTI'|'NONE', maxPayment }       // F14
quote({ kind, amount, termMonths?, collateralAssetId? }) -> { approved, reason?, apr, monthlyPayment, fee, dtiAfter, totalInterest }
take({ kind, amount, termMonths?, collateralAssetId? }) -> Result<Debt>
repay(debtId, amount) -> Result      payOff(debtId) -> Result
resolveShortfall(choice, args) -> Promise<Result>              // 'EMERGENCY_LOAN' | 'SELL' {assetKind,id} | 'FORCED_LIQUIDATION'; resumes turn when cash ≥ 0
forcedLiquidation(reason) -> Result<LiquidationReport>         // F15; reason: 'SHORTFALL'|'CREDIT_CALL'|'PLAYER'
creditCall(pct) -> Result                                      // bank demands pct of BANK_LOAN principal now; cash first, remainder → SHORTFALL
adjustCredit(state, delta, reason) -> void                     // inside a commit; clamps; logs DEBT
```
Atomicity rule: `buyRealEstate` / `buyBusiness` create the asset, its collateralised debt, the cash movement, and the `stats.dealsTaken++` in **one** commit; any failed validation returns a `Result` and changes nothing.

### 4.4 Content spec
- **Deal templates (≥ 11):** RE — CONDO, SINGLE_FAMILY, DUPLEX, APARTMENT_BLOCK (`minTurn` 18), COMMERCIAL (`minTurn` 30); BUSINESS — LAUNDROMAT, VENDING_ROUTE, FOOD_TRUCK, ONLINE_STORE, CAR_WASH, DAYCARE. Names rolled from per-template pools.
- **MARKET templates (≥ 8):** rate hike (baseRate +0.01, RE shock), rate cut, housing boom, housing slump, TECH boom, ENERGY bust, tenant vacancy (`ASSET_MOD` on a random RE: `vacantTurnsLeft` 2–4), **credit crunch (`CREDIT_CALL` 25–50%)**, dividend raise/cut (`STOCK_MOD` on `dpsAnnual` ±10–30%), recession-onset shock (ALL, `muDelta −0.20`, 4–6 turns).
- Stock trading is a free action in ACTION (not a card): unlimited trades per turn, 0.5% fee per trade; one holding per symbol.
- **Glossary additions:** cap rate, cash-on-cash, DSCR, breakeven occupancy, payback period, P/E-of-business, LTV, amortization, negative leverage — each Deal Analyzer metric label carries `data-glossary`.

### 4.5 UI deliverables
- **Economy banner:** phase pill (color by phase), base rate, inflation.
- **Market tab:** stock table (symbol, name, price, Δ vs prev month, 24-pt inline-SVG sparkline from `history`, dividend yield, owned shares); RE price/rent index mini-charts; business multiple.
- **Trade modal:** quantity stepper, max-by-cash, fee, resulting avg cost.
- **Deal Analyzer (inside Event Card):** offer facts, down-payment slider (min–max), live metric table with tone colors, verdict chip, "Why this verdict?" bullets from `flags`, Buy / Pass. Disabled Buy shows the exact reason (cash needed vs. have).
- **Portfolio drawer:** tabs per asset class; each row value / equity / net cash flow / lifetime cash flow / ROI; Sell opens `quoteSale` confirm.
- **Bank dialog:** loan type, amount slider (step 1,000, max = capacity), live APR / payment / fee / `dtiAfter` / lifetime interest; **Repay** panel lists every debt with "Pay extra", "Pay off", and "payment reduction / interest saved".
- **Shortfall modal:** three choices with consequences stated up front. **Liquidation report:** sold assets, haircut losses, credit penalty, acknowledgment button.

### 4.6 Integration points (read / mutate)
| Function | Reads | Mutates |
|---|---|---|
| `market.tick` | `market.*`, `inventory.businesses[].riskSigma/revenueIndex`, `derived` (none) | `market.economy/stocks/indices/shocks/history`, `inventory.businesses[].revenueIndex` |
| `assets.buyStock/sellStock` | `market.stocks`, `player.financials.cash`, `inventory.stocks`, `loop.phase` | `cash`, `inventory.stocks`, `stats`, `log` |
| `assets.buyRealEstate/Business` | `loop.pendingCard`, `market`, `derived`, `creditScore` | `cash`, `inventory.*`, `liabilities` (new collateralised Debt), `stats.dealsTaken`, `loop.pendingCard`, `log` |
| `assets.sell*` | `market`, `liabilities` | `cash`, `inventory.*`, `liabilities` (linked debt removed), `log` |
| `debt.take/repay/payOff` | `derived`, `market.economy.baseRate`, `creditScore` | `cash`, `liabilities`, `log` |
| `debt.resolveShortfall` | `loop.pendingDecision`, `cash` | `cash`, `liabilities`, `inventory`, `creditScore`, `loop.pendingDecision`, `stats.shortfalls/liquidations` |
| `debt.forcedLiquidation` | `inventory`, `market`, `liabilities` | `inventory`, `liabilities`, `cash`, `creditScore`, `loop.pendingDecision` |
| `effects` (`STOCK_MOD`, `CREDIT_CALL`, `FORCE_SELL`, `MARKET_SHOCK`, `ASSET_MOD`) | as above | delegate to `market`/`debt`/`assets` |

### 4.7 Stub registry (leave for Phase 4)
| Stub | Phase 3 behavior | Replaced in |
|---|---|---|
| `RR.progression.endGame(type)` | minimal: sets `loop.status='GAME_OVER'`, `phase='ENDED'`, `outcome={type,turn}`, emits `game:ended`, shows a plain "Game Over — Bankrupt" modal with New Game | Phase 4 (full screens) |
| `RR.progression.checkEndConditions()` | still a no-op | Phase 4 |

### 4.8 Acceptance tests
1. **Stock statistics:** seed fixed, 5,000 simulated 12-month paths of UTLX in EXPANSION → mean gross return within ±0.015 of `e^(0.06+0.04)`; no price below `floorPrice`; same seed → identical series.
2. **Economy:** over 10,000 ticks every phase occurs; durations respect ranges; `RECOVERY` is never followed directly by `PEAK`; `baseRate` stays within 0.02–0.10.
3. **RE analysis:** price 120,000, down 24,000, closing 2,400, rent 1,500, opex 450, APR 7.5%, 360 mo → payment **671**, cashFlow **379**, capRate **10.5%**, cashOnCash **17.2%**, DSCR **1.56**, breakeven occupancy **74.7%**, verdict GREAT.
4. **Business analysis:** price 60,000, down 20,000, revenue 4,200, costs 3,300, APR 8%, 120 mo → payment **485**, cashFlow **415**, ROI **24.9%**, payback **48.2** months.
5. **Atomic buy:** buying the RE above creates `re_*`, a `PROPERTY_MORTGAGE` with `collateralAssetId` = asset id, cash −26,400, ledger shows the property's net cash flow in passive income and **no** new line in `debtService`.
6. **Bank:** at credit 680 / baseRate 0.05, taking a 10,000 `BANK_LOAN` → apr **0.09**, fee 100, cash +9,900, liabilities +10,000, `debtService` +75; capacity never exceeds F14 and loans respect `loanStep`.
7. **Prepayment:** starter mortgage, repay 10,000 → principal 75,000, term 300, new payment **506 ± 1**.
8. **Shortfall ladder:** cash −5,000 with a 6,000 stock position → forced liquidation sells stock, cash ≥ 0, credit −60, report shown; with no assets and no loan eligibility → `endGame('BANKRUPT')`.
9. **Underwater sale:** property value × (1−6%) < linked principal and cash insufficient → `UNDERWATER`.
10. **Shock scope:** `SECTOR:TECH` shock changes only NOVA/SPKL drift; `RE` shock changes only the RE index.
11. **Determinism & save:** 120 turns with scripted purchases yield identical JSON across two runs; mid-game save/load preserves `market.shocks`, holdings, debts.
12. **UI:** moving the down-payment slider updates the analyzer with **zero** commits (pure function) and the Buy button re-validates cash.

### 4.9 v2 ADDITIONS — DEPOSITS, PROPERTY CONDITION, PRICE SHOCKS & PORTFOLIO EVENTS (REQUIRED PART OF PHASE 3)
*Read §1.12 (F4b, F5b, F16, F19, deposit APY) and Appendix E.3 (rows marked **P3**). Phase 3 now also delivers the account/deposit layer, the property-condition game, and the event content that moves prices, markets and portfolios.*

#### 4.9.1 Objectives (Steps 3.9–3.15)
| Step | Build |
|---|---|
| **3.9** | **Deposits engine** `RR.deposits` (`37-deposits.js`): open/deposit/withdraw/close, maturity, APY quoting, early-close penalty, insured-limit logic. |
| **3.10** | **Property engine** `RR.property` (`38-property.js`): F16 condition tick, maintenance plan, renovate, insure, inspect, raise rent, tenant lifecycle (`NPC_MEET`/`NPC_STATUS`), starting-condition roll & hidden-condition estimate for deals. |
| **3.11** | **Market v2:** shock fields `rentDelta/rateDelta/inflationDelta`, `market.effectiveEconomy(state)`, ops `STOCK_PRICE_MULT` / `STOCK_SPLIT`, news feed from shocks + log. Wire F9–F11 to effective values. |
| **3.12** | **Bank v2:** `offeredApr` receives `economy = effectiveEconomy` and `adj = npc.perks().bankerSpread`; emergency-loan eligibility uses `bankerEmergencyMinScore`; account events (fees, fraud, overdraft). |
| **3.13** | **Content (Phase-3 set, ≥ 36 templates):** rows marked **P3** in Appendix E.3 (property, business, market/prices, portfolio, deposits/bank) + MARKET templates v1 extended with `rateDelta/inflationDelta`. |
| **3.14** | **UI:** Bank tab (Deposits · Loans · Repay), Asset detail drawer (condition bar, plan selector, Renovate / Insure / Inspect / Raise rent), Market news ticker with shock icons, Deal Analyzer condition estimate + Inspect button. |
| **3.15** | **Tests, fixtures (`neglected_property`, `bank_run`, `inflation_spike`), EV audit.** |

#### 4.9.2 Rules & function contracts
```js
// ── RR.deposits ──────────────────────────────────────────
quote(kind, termMonths?) -> { apy, minOpen, penaltyMonths }        // SAVINGS: max(floor, baseRateEff+spread) · TERM: baseRateEff+spread, locked
open({ kind, amount, termMonths? }) -> Result<Deposit>             // moves cash → balance; amount ≥ config.deposits.minOpen; termMonths ∈ termOptions for TERM; ACTION phase
deposit(id, amount) -> Result    withdraw(id, amount) -> Result    // SAVINGS only; instant
closeEarly(id) -> Result<{ penalty, returned }>                    // TERM before maturity: penalty = round(balance · apy/12 · earlyPenaltyMonths); returned = balance − penalty → cash
tickMaturity(state) -> void                                        // payday: TERM reaching maturityTurn → returns balance to cash, log MILESTONE, removes deposit
insuredLimitLoss(state, severity /*0..1*/) -> { lost }             // pure; uninsured portion = max(0, Σ balances − insuredLimit); lost = round(uninsured · severity)
// ── RR.property ──────────────────────────────────────────
tick(state) -> void                      // F16 per asset (rng.misc); runs inside payday commit
setPlan(assetId, plan) -> Result         // NONE|BASIC|FULL; effective next payday; ACTION phase
renovate(assetId, points) -> Result<{cost, newCondition}>   // cost = points · round(assetBase · renovateCostPerPointPctValue); points 1..(100−condition); ACTION phase
insure(assetId, on) -> Result            // toggles `insured`; premium shows in opex (F4b)
inspect(assetId) -> Result<{ cost, condition }>   // cost rolled in config.property.inspection.cost (rng.misc); sets inspected=true
raiseRent(assetId, pct /*0.03..0.10*/) -> Result  // rentBoostPct += pct; tenant reaction: p(leave) = base(pct) · tierMult (F19 tenantVacancyMult); on leave → vacantTurnsLeft = rng 1–3 and NPC_DELTA tenant −8
estimateCondition(offer) -> [lo, hi]     // shown in Deal Analyzer; true value hidden in card payload (payload.trueCondition)
```
- **Deals:** `analyzeDeal` is unchanged (F12) but now receives `condition` from the offer: `startCondition[quality]` range rolled with `rng.deals`; the *displayed* range is `[c − a, c + (n − a)]`, `n = inspection.noise`, `a = rng.deals.int(0, n)`. An optional **Inspect** button (cost `inspection.cost`, rolled at card instantiate) reveals the exact value **before** buying. After purchase `inspected:false` shows the range again until the player pays to inspect (math always uses the true value).
- **Tenants:** `buyRealEstate` also issues `NPC_MEET {templateId:'tenant', assetId}` (name via `rng.npc`); `sellRealEstate` sets that NPC `DORMANT`. Property events with `involves.npcRoles:['TENANT']` target the tenant of a specific owned property.
- **Forced liquidation / quoteSale / portfolio** use F4b values automatically (condition lowers `value`); `portfolio` rows gain `condition`, `plan`, `insured`.
- **Insurance claims:** property events with `insurable:'PROPERTY'` pay `round(cost·(1−0.80))` if `insured`, otherwise full. Insurance **never** covers `condition` decay or maintenance neglect events tagged `NEGLECT` (E.3 flags them).
- **Bank failure (insured limit):** the deposit-risk event applies `insuredLimitLoss`; with balances under `insuredLimit` the player loses nothing and the card is a *lesson* (gold toast "FDIC-style insurance covered you"). Do **not** use real-world agency names in game text.
- **Account fees:** `bk_low_balance_fee` triggers when `cash < 500` and no deposit ≥ 500 (`ADD_MODIFIER EXPENSE +12` until cash ≥ 1,500 — a `tag:'BANKFEE'` modifier removed by payday when the condition clears).
- **News feed:** `RR.market.news(state, n) -> [{turn, icon, text, tone}]` derived from active `shocks` (label/scope) and `log` kind MARKET — no new state.

#### 4.9.3 UI deliverables (v2)
- **Bank tab:** *Deposits* (cards: label, balance, APY chip, maturity countdown; Open / Add / Withdraw / Close-early with a penalty preview), *Loans* (v1), *Repay* (v1). Emergency-fund meter ("2.1 months") with target marker at 3.
- **Asset detail drawer** (from Portfolio row): condition bar with band colours and **non-colour labels** (Excellent ≥ 80 · Good ≥ 50 · Poor ≥ 25 · Critical), rent/value factor chips ("Rent −5% due to condition"), maintenance plan segmented control (with monthly cost), Renovate slider (live cost), Insure toggle (premium), Inspect button, lifetime cash-flow sparkline, tenant card (avatar, tier, Contact).
- **Market news ticker:** active shocks as chips (icon + short label + turns left, e.g. ⬆ "Rate hike · 4"), click → details modal.
- **Deal Analyzer:** adds "Condition: ~55–80 (uninspected)" + Inspect button; analyzer warns "Repairs likely" when `estimate.lo < 50`.
- **Toasts:** every property/deposit/market action → success toast + delta flash; price shocks → a `warn`/`pos` toast "Housing prices −6%" when a shock starts.

#### 4.9.4 Stub registry
None added. Removes the Phase-2 stubs for `DEPOSIT_*`, `STOCK_PRICE_MULT`, `STOCK_SPLIT`, `ASSET_MOD` asset fields and tenant `NPC_MEET`.

#### 4.9.5 Acceptance tests (continue §4.8 numbering)
13. **Deposit APY & interest:** baseRate 0.05 → SAVINGS **3.0%**, TERM **5.5%**; active `rateDelta +0.01` → SAVINGS **4.0%**; 10,000 @ 1.5% pays **13**/month into the payday net; `income.interest` taxed at the passive rate.
14. **Term deposit:** open 12,000 TERM 12 mo @ 5.5% (cash −12,000, `assets.deposits` +12,000). Close early → penalty **165** (3 months' interest), cash +11,835. Run to maturity → balance returns to cash, deposit removed, MILESTONE log. `open` below $500 → `INVALID_ARGS`; non-listed term → `INVALID_ARGS`.
15. **Insured limit:** balances 300,000, limit 250,000, severity 0.5 → lost **25,000**; balances 40,000 → lost **0**.
16. **Condition tick (F16):** over 5,000 samples of a DUPLEX (decay 0.60) on plan NONE the mean decay per turn is 0.60 ± 0.02; BASIC → 0.30 ± 0.02; FULL → 0.09 ± 0.01; condition never leaves 0–100; same seed ⇒ identical series on the `misc` stream.
17. **Renovate & plans:** 120,000 asset, condition 20, `renovate(+30)` → cost **7,200**, condition 50; points > 100 − condition → `INVALID_ARGS`; plan BASIC → opex +50/mo, FULL → +120/mo; `insure(true)` → +50/mo; ledger `assetNet` reflects all three.
18. **Insurance claims:** storm cost 4,000: insured → player pays **800**; uninsured → **4,000**; `NEGLECT`-tagged events ignore `insured`.
19. **Inspection:** displayed range always contains the true condition; width ≤ `inspection.noise`; `inspect` cost within [300, 600] (inflation-scaled, $50-rounded); after inspect the exact value is shown; derived values identical before/after inspection.
20. **Banker perks:** credit 680, baseRate 0.05: `BANK_LOAN` APR — TRUSTED **0.080**, NEUTRAL **0.090**, HOSTILE **0.100**; emergency eligibility threshold 400 / 450 / 500 respectively.
21. **Shock fields:** `rateDelta +0.02` → `effectiveEconomy.baseRate = 0.07`, `PROPERTY_MORTGAGE` APR at credit 680 = **0.100**; `inflationDelta +0.02` raises `inflationEff` by 0.02 (clamped to `max`); a `rentDelta` shock changes only the rent index; shocks expire at `turnsLeft = 0`.
22. **Stock ops:** `STOCK_PRICE_MULT 0.85` on a held symbol lowers `price` (floor 0.50) and not `avgCost`; `STOCK_SPLIT 2` on 100 shares @ $40, avgCost 38 → 200 shares @ $20, avgCost **19**, `dpsAnnual` halved, position value unchanged.
23. **Tenants:** buying RE creates a tenant NPC linked by `assetId`; selling sets it DORMANT; `np_tenant_*` events only target owned properties; `raiseRent(+5%)` with a TRUSTED tenant has lower leave-probability than with a COLD tenant (≥ 2,000 seeded trials, difference ≥ 8 points).
24. **Content lint & EV audit:** P3 templates pass the §3.11.7 lint; a seeded 2,000-turn run with an *insured, BASIC-plan* bot shows mean event cost per turn between **4% and 10%** of gross salary (record the value in the Handoff Log; tune weights if outside); a *no-insurance, no-maintenance* bot shows ≥ 1.5× that cost and a higher bankruptcy rate.
25. **Property-neglect chain:** property at condition < 40 raises `pr_roof_leak` / `pr_boiler_fail` weights by 2.5× (weightMods); after a leak ignored (`FLAG shoddy_<assetId>`) the next leak probability is ≥ 1.6× baseline.
26. **Determinism & save:** 120 scripted turns including deposits, renovations, tenants and shocks → identical JSON across two runs; mid-game save/load preserves deposits, conditions, plans, tenants and consequences; `market`, `events`, `deals`, `npc` stream isolation holds (§2.8.7 test 16 extended with property rolls).
27. **UI:** moving the Renovate slider performs **zero** commits; Inspect/Renovate/Insure show success toasts and flash the ledger; all drawer controls keyboard-operable; condition band is distinguishable without colour.

---

## 5. PHASE 4 — PROGRESSION & THE FAST TRACK
*Prerequisite reading: §0, §1 (incl. §1.12), §10. Requires Phases 1–3. Delivers: the complete **offline** game loop to victory/defeat, plus a balance simulator (§5.10 adds the v2 layer).*

### 5.1 Objectives (Build Steps)
| Step | Build |
|---|---|
| **4.1** | **Progression engine** `RR.progression` — `evaluateEscape/Victory/Loss`, `checkEndConditions` (replaces stub), Break Free. |
| **4.2** | **Escape ceremony + `enterFastTrack`** state migration (§5.3) and the `TRANSITION` phase. |
| **4.3** | **Fast Track content** `42-data-fasttrack.js`: tier scaling, FT deal/doodad/life/market templates, FT director weights. |
| **4.4** | **Fast Track UI:** theme swap, Goal Meter, Dream Board, per-mode relabeling (§5.5). |
| **4.5** | **End of game:** full `endGame`, Victory (Dream / Empire) and Game Over screens with stats summary, "New Game" and "Retry same seed". |
| **4.6** | **Balance simulator** `RR.sim` + `dev/sim.html` (§5.6). |
| **4.7** | **Hardening:** save-migration test, global error boundary (toast + safe state), a11y pass, first-run hint tooltips, remove all `NOT_IMPLEMENTED` stubs. |

### 5.2 State & mode transitions
```
TITLE ──newGame──▶ RUNNING · RAT_RACE
RUNNING · RAT_RACE ──[derived.escape.met at CLEANUP, or Break Free in ACTION]──▶ phase TRANSITION · pendingDecision ESCAPE_CEREMONY
TRANSITION ──confirmEscape──▶ enterFastTrack ──▶ RUNNING · FAST_TRACK (resume at payload.resumePhase: ACTION | next START)
RUNNING · * ──[debt.forcedLiquidation fails | doomed-state call]──▶ GAME_OVER · outcome BANKRUPT
RUNNING · FAST_TRACK ──[buyDream]──▶ GAME_OVER · DREAM      ──[passive ≥ goalPassive at CLEANUP]──▶ GAME_OVER · EMPIRE
GAME_OVER ──New Game / Retry seed──▶ TITLE / RUNNING
```
**Rules.** Escape is *strict* (`passive > totalExpenses`); the Empire goal is `passive ≥ goalPassive`. Escape is never evaluated during SHORTFALL. Only one end-condition fires per check, priority: BANKRUPT > DREAM > EMPIRE > ESCAPE.
**Doomed-state call (flag `config.progression.doomedCall = true`):** at CLEANUP, if `monthlyCashflow < 0` ∧ `cash < −monthlyCashflow` ∧ `borrowCapacity = 0` ∧ nothing sellable with positive proceeds → end as BANKRUPT now instead of grinding doomed turns.

### 5.3 `enterFastTrack` migration (one commit `progression.enterFastTrack`)
1. `fastTrack.ratRaceSummary = { turns: loop.turn, netWorth, passive, expenses, cash }`.
2. `player.financials.salary = 0`; remove all `SALARY` modifiers ("you quit your job"). Taxes fall automatically (no salary).
3. **Freedom Capital:** `cash += passive × config.fastTrack.entryCashMonths`.
4. `fastTrack.unlocked = true`, `enteredTurn = loop.turn`, `baselinePassive = passive`, `goalPassive = passive + config.fastTrack.goalIncrease`, `dream` copied from `RR.data.dreams[player.dreamId]`.
5. `loop.mode = 'FAST_TRACK'`; `loop.pendingDecision = null`; `loop.director`: clear `recentTemplateIds`, set `droughts.DEAL = 3` (bias the first FT turns toward deals).
6. All Rat Race holdings and debts **carry over unchanged**; bank capacity scales automatically with income and assets.
7. `pushLog(MILESTONE)`, emit `mode:changed`, `RR.save.write()`, then resume phase from the decision payload.

### 5.4 Key functions / methods
```js
// ── RR.progression ───────────────────────────────────────
evaluateEscape(state) -> { met, passive, expenses, gap, progressPct }      // == derived.escape (pure wrapper)
evaluateVictory(state) -> { won, type: 'DREAM'|'EMPIRE'|null, progressPct, goalPassive, passive }
evaluateLoss(state) -> { lost, reason: 'BANKRUPT'|'DOOMED'|null }
checkEndConditions() -> Result          // called from turn CLEANUP; may open ESCAPE_CEREMONY or call endGame
breakFree() -> Promise<Result>          // legal in ACTION when derived.escape.met; same ceremony, resumePhase 'ACTION'
confirmEscape() -> Promise<Result>      // from the ceremony; calls enterFastTrack()
enterFastTrack() -> Result              // §5.3
buyDream() -> Result                    // FAST_TRACK ∧ ACTION ∧ cash ≥ dream.cost → deduct, push inventory.dreams, endGame('DREAM')
endGame(type) -> Result                 // sets loop.status/phase/outcome, pendingDecision GAME_END, emits game:ended, autosave final
// ── RR.fastTrack ─────────────────────────────────────────
tierScale(mode) -> number               // 1 in RAT_RACE, config.fastTrack.dealScale in FAST_TRACK
scaleTemplate(template, mode) -> template   // multiplies money ranges of templates tagged scalable:true
directorWeights(mode) -> weights        // FT override: DEAL .45 · DOODAD .12 · LIFE .13 · MARKET .15 · QUIET .15
// ── RR.ui (Phase 4) ──────────────────────────────────────
theme.setMode(mode)                     // body[data-mode]; 600 ms CSS transition; listens to bus 'mode:changed'
screens.escapeCeremony.show(summary) -> Promise   // 3 beats: "You've escaped" stats → "Quit your job" → "Fast Track unlocked"
screens.victory.show(outcome)   screens.gameOver.show(outcome)    // stats summary + passive-income SVG chart + replay buttons
panels.goalMeter.mount(el)   panels.dreamBoard.mount(el)
// ── RR.sim (headless; engines only) ──────────────────────
run({ seeds: number[], policy: 'PASSIVE_SAVER'|'LEVERAGE_HAWK'|'RANDOM'|'NO_INVEST', professionId, maxTurns }) -> Report
```
`checkEndConditions` implementation order: loss → victory (EMPIRE) → escape. It runs **after** CLEANUP's stats snapshot.
`events.categoryWeights` is extended to call `RR.fastTrack.directorWeights(mode)`; `events.instantiate` calls `scaleTemplate`.

### 5.5 Fast Track content & per-mode UI
- **FT deals (authored at final values):** `ft_biz_franchise` ($400k–900k, net $6–14k/mo), `ft_biz_saas` ($250k–600k, `riskSigma` 0.50), `ft_biz_logistics` ($500k–1.1M), `ft_re_apartment_complex` ($1.2M–2.8M), `ft_re_office` ($2M–4M, `minTurn` after entry +6). Same F12/F13 math, `tier:["FAST_TRACK"]`. Reused Rat Race templates tagged `scalable:true` are multiplied by `dealScale`.
- **FT DOODADS (luxury, scalable ×10):** yacht charter, art auction, private-jet membership — always optional.
- **FT LIFE:** lawsuit (cash −max(20,000, 4% of netWorth)), tax audit (−1.5 months of passive), partner fraud (`ASSET_MOD revenueIndex ×0.5` on a random business — add `revenueIndex` MULTIPLY to the whitelisted `ASSET_MOD` fields), windfall IPO (+).
- **FT MARKET:** global crash (ALL shock `muDelta −0.40`, 6 turns), credit crunch (`CREDIT_CALL` 40–70%), boom.

| UI element | RAT_RACE | FAST_TRACK |
|---|---|---|
| Theme | slate + cyan | obsidian + gold (`modes.css`) |
| HUD meter | **Freedom Meter** (`escape.progressPct`) | **Goal Meter** (`goal.progressPct`) with Dream marker |
| Income Statement | Salary row visible | Salary row hidden (`data-hide-if="loop.mode=FAST_TRACK"`) |
| Left panel footer | — | **Dream Board** (dream card, cost, "Buy Dream" enabled when cash ≥ cost) |
| Action Dock | Market · Portfolio · Bank | + **Dream** tab |
| Mode badge | "RAT RACE" | "FAST TRACK" |
| Ceremony | — | 3-beat modal on entry (summary from `ratRaceSummary`) |

### 5.6 Balance simulator
`dev/sim.html` loads the engine scripts only (no UI scripts) and calls `RR.sim.run`. It swaps a fresh state in via `RR.store.replace`, disables autosave, uses the default (immediate) Presenter, and restores the previous state afterward. **Bot policies:** `PASSIVE_SAVER` (pay off credit card first; buy the best positive-CoC deal when cash ≥ down + closing + 3 months of expenses; never borrow; skip optional doodads) · `LEVERAGE_HAWK` (accepts GREAT/FAIR, max leverage, borrows for down payments, takes doodads on the card) · `RANDOM` (50% coin flips) · `NO_INVEST` (control).
**Report:** escape rate, victory rate by type, bankruptcy rate, median/p90 escape turn, median/p90 victory turn after escape, histogram of causes of bankruptcy.
**v1 balance targets (Teacher, 300 seeds):** `PASSIVE_SAVER` escapes ≥ 60% within 240 turns with median escape turn 70–120 and median 36–72 further turns to victory · `LEVERAGE_HAWK` bankrupt 15–35% (leverage must carry real risk) · `RANDOM` bankrupt 20–40%, escape ≤ 25% · `NO_INVEST` escape 0%. **Tune in this order:** `fastTrack.goalIncrease` → `fastTrack.entryCashMonths` → deal generation ranges → `director` weights → tax rates. Record every tuning change in the Handoff Log.

### 5.7 Integration points (read / mutate)
| Function | Reads | Mutates |
|---|---|---|
| `progression.checkEndConditions` | `derived.escape/goal`, `loop.mode/phase`, `fastTrack` | `loop.pendingDecision`, `loop.phase`, or → `endGame` |
| `progression.enterFastTrack` | `derived`, `player.dreamId`, `RR.data.dreams`, `config.fastTrack` | `player.financials.salary/modifiers/cash`, `fastTrack.*`, `loop.mode/pendingDecision/director`, `log` |
| `progression.buyDream` | `fastTrack.dream`, `player.financials.cash` | `cash`, `inventory.dreams`, `fastTrack.dream.purchased` → `endGame` |
| `progression.endGame` | `derived`, `stats` | `loop.status/phase/outcome/pendingDecision` |
| `fastTrack.scaleTemplate` / `directorWeights` | `loop.mode`, `config.fastTrack` | none (pure) |
| `sim.run` | whole engine | temporary state via `store.replace`; restores original |

### 5.8 Stub registry
None. Any remaining `NOT_IMPLEMENTED` result in a shipped build is a defect to fix in this phase.

### 5.9 Acceptance tests
1. **Strict escape:** fixture with passive = expenses → no ceremony; +$1 passive → ceremony at the next CLEANUP; same via Break Free during ACTION.
2. **Migration:** from `escape_ready`: after `confirmEscape` → `loop.mode = FAST_TRACK`, base `salary = 0`, no SALARY modifiers, `cash` increased by `passive × entryCashMonths`, `goalPassive = baselinePassive + goalIncrease`, all holdings/debts preserved, `derived.monthlyCashflow ≥ 0`.
3. **Resume:** ceremony triggered in CLEANUP resumes at next START; triggered by Break Free resumes in ACTION with the same turn number.
4. **Victory paths:** `buyDream` with `cash ≥ cost` → `GAME_OVER · DREAM`, dream in `inventory.dreams`; `passive ≥ goalPassive` at CLEANUP → `EMPIRE`; priority BANKRUPT > DREAM > EMPIRE.
5. **Content swap:** in FAST_TRACK the director never draws a template lacking `"FAST_TRACK"` in `tier`; scaled templates' prices ≈ `dealScale ×` base ranges.
6. **Doomed call:** constructed fixture triggers BANKRUPT at CLEANUP with the flag on, and not with it off.
7. **UI mode swap:** all `data-show-if/hide-if` nodes flip correctly; theme variables change without layout shift; ceremony cannot be dismissed accidentally (requires explicit button).
8. **Simulator:** `RR.sim.run({seeds:[1..50], policy:'NO_INVEST'})` finishes < 15 s with 0 escapes; report meets §5.6 targets or the deviation is recorded in the Handoff Log; live game state is restored after `run`.
9. **Full-run regression:** a scripted seeded game from New Game to Victory produces identical final state on two runs; save at turn N, reload, continue → identical to uninterrupted run.
10. **Hardening:** corrupt save → Title with toast; every `data-action` target exists; no `console.error` during a full simulated game; keyboard-only play-through possible.

### 5.10 v2 ADDITIONS — FAST TRACK LIFE LAYER, EPILOGUE & SIMULATOR V2 (REQUIRED PART OF PHASE 4)
*Phase 4 completes the **offline** game. After it, the project is a finished single-player game that still runs by double-click; Phases 5–8 add accounts, cloud, premium, admin and launch.*

#### 5.10.1 Objectives (Steps 4.8–4.12)
| Step | Build |
|---|---|
| **4.8** | **Fast Track life layer:** scale/tag the v2 templates (`scalable:true` where money-based), add FT-only health, NPC and property events (Appendix E.3 rows marked **P4**), FT director weights for `NPC` / `ASSET` (below). |
| **4.9** | **FT cast:** on `enterFastTrack` add NPCs `ADVISOR` (wealth manager) and `rival` (FRIEND role, competitive investor); FT-only perk table rows; Dream Board shows NPC reactions (flavour only). |
| **4.10** | **Epilogue & story recap** in Victory / Game Over screens: "Your life in numbers" (average health tier, lowest health, hospitalizations, best NPC relationship, relationships lost) and **"Your key choices"** (top 5 by impact from `story.history`, each with its outcome sentence). |
| **4.11** | **Simulator v2:** bots understand insurance, maintenance, deposits and NPC actions; new KPIs; bankruptcy-cause histogram expanded. |
| **4.12** | **Hardening for v2 systems:** save-migration v1→v2 test, event-lint in CI-ready form (`dev/lint-content.html`), a11y pass for Contacts/Life/Journal/Asset drawers. |

#### 5.10.2 Director weights in Fast Track (amends `directorWeights`)
`DEAL .38 · DOODAD .10 · LIFE .10 · MARKET .14 · NPC .08 · ASSET .10 · QUIET .10` (sum 1.00). Severity cooldowns unchanged; the **mercy rule** is disabled in FT (the player has capital and the lesson is risk management).

#### 5.10.3 Simulator v2 (amends §5.6)
Policies gain behaviours (all deterministic):
| Policy | v2 behaviour |
|---|---|
| `PASSIVE_SAVER` | keeps a 3-month emergency fund (cash + SAVINGS), buys STANDARD insurance when cash ≥ 3 months, BASIC maintenance on every property, 1 CALL + 1 LUNCH per turn with the BANKER/BOSS roles, health checkup every 12 turns, otherwise v1 behaviour |
| `LEVERAGE_HAWK` | no insurance, NONE maintenance, no deposits, ignores NPCs, otherwise v1 |
| `RANDOM` | v1 + random plan/insurance/NPC picks |
| `NO_INVEST` | v1 control (still pays insurance if `PASSIVE_SAVER` rules would) — set `insurance: false` to keep it a pure control |
**New report fields:** median/p90 health, share of turns in POOR/CRITICAL, hospitalizations per 100 turns, event cost per turn as % of salary, NPC tiers distribution at escape, bankruptcy causes `{DEBT_SPIRAL, MARKET_CRASH, PROPERTY_NEGLECT, HEALTH_SHOCK, LEVERAGE, OTHER}` (assigned from `stats.bankruptcyCause`, set by `progression.endGame` from the last 6 log entries).
**v2 balance targets (Teacher, 300 seeds) — replace the §5.6 numbers:** `PASSIVE_SAVER` escapes ≥ **55%** within 240 turns, median escape turn **75–130**, median **36–72** further turns to victory · `LEVERAGE_HAWK` bankrupt **20–40%** (neglect and no insurance must bite) · `RANDOM` bankrupt **25–45%**, escape ≤ 25% · `NO_INVEST` escape 0% · **health:** `PASSIVE_SAVER` spends ≤ 10% of turns in POOR/CRITICAL; `LEVERAGE_HAWK` ≥ 20% · **life-systems sanity:** removing all NPC perks changes `PASSIVE_SAVER` escape rate by ≤ 8 points (relationships help, never decide the game). **Tune in this order:** `fastTrack.goalIncrease` → `fastTrack.entryCashMonths` → deal ranges → `director.baseWeights` → event cost ranges → `health.*` → `property.*` → tax rates. Record every change in the Handoff Log.

#### 5.10.4 Acceptance tests (continue §5.9 numbering)
11. **Migration v1→v2:** a v1 `escape_ready` fixture migrates, validates, and can complete the Fast Track entry; defaults from §2.8.1 applied; no field lost.
12. **FT cast:** after entry the roster contains ADVISOR and `rival`; FT director weights sum to 1.00; mercy rule off; `scalable` v2 templates scale by `dealScale` (spot-check 3 templates).
13. **Epilogue:** a scripted game produces a recap with exactly the fields in 5.10.1 and ≤ 5 key choices; text renders via `textContent`.
14. **Simulator v2:** `NO_INVEST` (insurance off) → 0 escapes; `PASSIVE_SAVER` vs `LEVERAGE_HAWK` differ on bankruptcy rate by ≥ 8 points over 100 seeds; report includes all new fields; < 20 s for 50 seeds.
15. **Content lint page:** `dev/lint-content.html` runs the §3.11.7 lint over **all** templates (P2+P3+P4) and prints PASS/FAIL, exit-code-friendly via `document.title = 'LINT PASS'|'LINT FAIL'` (so CI can drive it headless).
16. **Full-run regression v2:** scripted seeded game New Game → Victory is byte-identical across two runs **and** after a save/reload at an arbitrary turn that has open consequences, a queued event and a deposit.

---

## 6. PHASE 5 — ACCOUNTS, CLOUD SAVE & SYNC
*Prerequisite reading: §0, §1 (including §1.12), §10 (Handoff Log), Appendix D (SQL), G (repo/Netlify/CI), H (threats), I (human setup). Requires Phases 1–4. Delivers: registration and sign-in (email + password, or Google), a profile, automatic cloud saves, cross-device continue and safe conflict handling — while the game keeps working fully offline as a Guest.*

### 6.1 Human prerequisites (the AI cannot click dashboards — stop and ask)
Before any step marked 🔒, the AI asks the human to confirm the matching **HC** item from Appendix I. If it is not done yet, the AI builds against placeholders (`config/env.js` with `__PLACEHOLDER__` values, fake-Supabase tests) and records "BLOCKED-ON-HC-n" in the Handoff Log. Required: **HC-1** GitHub repo · **HC-2** Netlify site linked to the repo · **HC-3** Supabase *dev* and *prod* projects · **HC-4** Google Cloud OAuth client · **HC-5** SMTP provider (for branded auth + lifecycle emails) · **HC-6** CAPTCHA site (Cloudflare Turnstile or hCaptcha).

### 6.2 Objectives (Build Steps)
| Step | Build |
|---|---|
| **5.1** | **Repo & deploy skeleton:** confirm the runtime already lives in `public/` (created in Phase 1), add `netlify.toml` (publish dir, security headers, CSP), `config/env.js`, `.github/workflows/ci.yml` skeleton, `README`, `.gitignore`, branch protection notes (Appendix G). |
| **5.2** | 🔒 **Database:** migrations `0001_core`, `0002_rls`, `0003_lifecycle` (Appendix D) applied to *dev*; seed `app_config`; SQL tests in `supabase/tests/`. |
| **5.3** | **Client SDK:** vendor a **pinned** supabase-js UMD build into `public/vendor/` (+ `VERSION.txt`, licence); `RR.cloud.client()` factory (§6.3). |
| **5.4** | 🔒 **Auth:** `RR.auth` (sign-up, sign-in, Google, sign-out, reset/update password, resend confirmation, session bootstrap, `auth:changed`). |
| **5.5** | **Profile & activity:** `RR.cloud.profile.get/update`, `touch()` (throttled by `sync.activityTouchMs`), age/terms consent capture. |
| **5.6** | **Cloud save adapter:** `RR.cloud.saves.*` with optimistic concurrency + error mapping; registers as `RR.persist` adapter `'cloud'`. |
| **5.7** | **Sync engine:** `RR.sync` — reconcile, debounced push, pull, conflict resolution, offline queue, status chip, snapshot interface (premium gate). |
| **5.8** | **Account UI:** auth modal (tabs Sign in / Create account / Reset), Google button, CAPTCHA widget slot, account chip + menu, Save Slots modal, Conflict modal, retention notice, update/maintenance banners. |
| **5.9** | **Guest ↔ account flows:** first-sign-in upload prompt, account-switch protection, sign-out behaviour, "remove this game from this device". |
| **5.10** | **Tests:** SQL/RLS tests, fake-Supabase unit tests, offline-first tests, secrets scan, manual E2E script (§6.9). |

### 6.3 Auth & client design (rules)
**Dashboard configuration (dev and prod; recorded in `docs/supabase-setup.md`):** Site URL = the environment's origin · Redirect URL allow-list: prod = production origin only; dev = `http://localhost:*` and the Netlify preview pattern · email confirmation **on** · anonymous sign-ins **off** · minimum password length **10** · leaked-password protection **on if the plan offers it** · CAPTCHA on sign-up / sign-in / reset · JWT expiry 3600 s · refresh-token reuse detection on · secure email change on · MFA (TOTP) enabled (required for admins in Phase 6). Verify each setting against the current Supabase docs when executing — the platform changes (the plan's authors checked the 2026 changelog: new projects stopped auto-exposing `public` tables to the Data API; enforcement for existing projects is scheduled for **30 Oct 2026**, so **every migration here grants privileges explicitly**).
```js
// RR.cloud.client() — the ONLY place the SDK is constructed
supabase.createClient(RR.env.supabaseUrl, RR.env.publishableKey, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'rr.auth.v1' }
})
```
- **Keys:** publishable key only (R14). A `service_role`/secret key in any file under `public/` is a build-breaking defect (test 16).
- **Google sign-in:** `signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin + '/' } })`; no extra scopes; no offline access. The Google *Web application* OAuth client's authorised redirect URI is the Supabase project's auth callback (HC-4). "Google Play" in the brief = this flow; see §1.12.2.
- **Email + password:** client-side checks (valid email, password ≥ 10 chars, not equal to email, strength meter) + CAPTCHA token + age/ToS checkbox ("I'm at least 13, or the age of digital consent where I live, and I accept the Terms and Privacy Policy"). Under-age ⇒ Guest only. After sign-up show a "Check your email" screen with *Resend* (60 s cooldown). Never reveal whether an email already exists (generic messages on sign-in/reset).
- **Boot:** `RR.auth.init()` reads the session, then **validates it with `getUser()`** (server round-trip) before showing signed-in UI; a failure falls back to Guest silently with a `warn` toast ("Session expired — you're playing as Guest").
- **Callback rule (known SDK pitfall):** never `await` another Supabase call *inside* an `onAuthStateChange` callback — defer with `setTimeout(fn, 0)` (deadlock risk). Test 14 greps for this.
- **Identity:** one user per verified email (default automatic linking of Google + email identities with the same *verified* email). Authorisation never reads `user_metadata` (A16 / skill checklist); display names are cosmetic only.
- **Sign-out:** `signOut({ scope:'local' })` after a final flush; local game continues as Guest.

### 6.4 Cloud save & sync design
**Where data lives**
| Place | Content | Notes |
|---|---|---|
| `rr.save.v1` (localStorage) | the **active game** (always written — offline-first, R21) | unchanged key; guests use only this |
| `rr.sync.v1` (localStorage) | `{ deviceId, byUser: { <userId>: { activeSlot, slots: { "1": { cloudId, baseVersion, baseHash, dirty, lastPushedAt, gameId } }, localOwner } } }` | **not** in game state (A14); `deviceId` = random 128-bit hex, created once |
| `public.game_saves` | one row per `(user, slot)`: `state jsonb` + denormalised `turn, mode, status, net_worth, game_id, device_id, version` | Appendix D |
| `public.save_snapshots` | rolling restore points (premium) | Phase 6 enables |

**Payload.** `RR.sync.buildPayload(state)` = deep clone minus `derived` (regenerated on load) with `log` trimmed to the last 50 entries; `hash = fnv1a32(canonicalJSON(payload))` (keys sorted). Hard limit `limits.max_save_bytes` (400 KB; server-enforced). Typical 240-turn game ≤ 250 KB uncompressed (Postgres compresses `jsonb` TOAST storage on its own).

**Reconcile (`RR.sync.reconcile()` — on sign-in and on boot when already signed in)**
| Local game | Cloud slot | Condition | Action |
|---|---|---|---|
| none | none | — | nothing |
| exists | none | — | prompt "Upload this game to your account?" → create row (`version 1`) |
| none | exists | — | pull → validate → `store.replace` |
| exists | exists | same `gameId`, `bookkeeping.baseVersion == cloud.version`, local **not** dirty | in sync (no-op) |
| exists | exists | same `gameId`, `baseVersion == cloud.version`, local dirty | push |
| exists | exists | same `gameId`, `baseVersion < cloud.version`, local **not** dirty | pull (cloud is newer) |
| exists | exists | same `gameId`, `baseVersion < cloud.version`, local dirty | **CONFLICT** |
| exists | exists | different `gameId`, or no bookkeeping | **CONFLICT** (two different games) |
**Rule (A20):** conflicts are *never* auto-resolved by timestamps; the player chooses.

**Push.** `update game_saves set … where id = :id and version = :expected` returning the row; **0 rows ⇒ conflict** (re-fetch metadata, open modal). The DB trigger bumps `version`, sets `updated_at`, freezes `user_id`, enforces size. First push uses `insert`; unique-violation `23505` ⇒ conflict. Schedule: dirty flag set on every `state:committed`; push **15 s** after the last commit (≥ 5 s between pushes), **immediately at CLEANUP**, on `visibilitychange → hidden` / `pagehide` (best-effort), and via a manual *Sync now* button. Failures back off `[2 s, 5 s, 15 s, 60 s]` and stay dirty; `navigator.onLine === false` ⇒ `OFFLINE` and no attempts; reconnect ⇒ immediate attempt.

**Pull.** `validate(migrate(state))` must pass; otherwise reject with a toast and keep local data (R19). Never merge two states field-by-field.

**Conflict modal (`conflict`)** — two cards ("This device" / "Cloud": turn, mode, net worth, last played, device label) and actions: **Keep this device** (confirm → overwrite cloud, version+1) · **Keep cloud** (offers *Download my local copy first* → overwrite local) · **Keep both** (premium: cloud copy saved to a snapshot / free slot) · **Decide later** (sync paused, chip = CONFLICT, banner reminder, play continues locally).

**Multi-device hint.** Cloud row `device_id ≠ this device` and `updated_at` < 10 min ago ⇒ info toast "This game was just played on another device".

**Account switching.** If `localOwner` differs from the signed-in user (or the local game belongs to a different account) ⇒ modal: *Keep it as a Guest game (not synced)* / *Discard it* / *Cancel sign-in*. Prevents data leaking between accounts on shared computers.

**Activity touch.** On sign-in, on first interaction after load, then at most every `sync.activityTouchMs` while the tab is active, call `RR.cloud.profile.touch()` (updates `last_active_at`; the server trigger forces the value to `now()` — clients cannot set it). Successful saves also count (DB trigger). This clock drives the 30-day rule (§7.2).

### 6.5 Key functions / methods
```js
// ── RR.auth ──────────────────────────────────────────────
init() -> Promise<AuthSnapshot>                  state() -> { status: 'SIGNED_OUT'|'SIGNED_IN'|'EXPIRED', user: { id, email, provider } | null }
signUp({ email, password, captchaToken, ageOk, termsVersion }) -> Promise<Result>     signIn({ email, password, captchaToken }) -> Promise<Result>
signInWithGoogle() -> Promise<Result>            signOut({ flush = true }) -> Promise<Result>
requestPasswordReset(email, captchaToken) -> Promise<Result>   updatePassword(newPassword) -> Promise<Result>   resendConfirmation(email) -> Promise<Result>
onChange(fn) -> unsubscribe                      // also emits bus 'auth:changed'
// ── RR.cloud ─────────────────────────────────────────────
client() -> SupabaseClient                       config.get() -> Promise<Result<{ retention, limits, client }>>   // reads public.app_config
profile.get() / profile.update({ display_name, avatar_seed }) / profile.touch() / profile.recordConsent(termsVersion)
saves.list() -> Promise<Result<SaveMeta[]>>      // metadata only — never selects `state`
saves.load(slot) -> Promise<Result<{ row, state }>>      saves.create(slot, payload, meta) -> Promise<Result<row>>
saves.update(id, expectedVersion, payload, meta) -> Promise<Result<row>>   // reason 'CONFLICT' on 0 rows
saves.remove(slot) -> Promise<Result>
// ── RR.sync ──────────────────────────────────────────────
init() -> void    reconcile() -> Promise<Result>    markDirty() -> void    pushNow(opts) -> Promise<Result>    status() -> SyncStatus
resolveConflict('DEVICE'|'CLOUD'|'BOTH'|'LATER') -> Promise<Result>    buildPayload(state) -> object    hash(state) -> string
snapshot(reason) -> Promise<Result>      listSnapshots() -> Promise<Result>      restoreSnapshot(id) -> Promise<Result>   // PREMIUM_REQUIRED until Phase 6
```
**Error mapping (all cloud calls return `Result`, never throw):** network failure → `NOT_ONLINE` · HTTP 401 / expired JWT → one silent refresh, then `UNAUTHENTICATED` · RLS/permission (`42501`/403) → `FORBIDDEN` (slot above limit ⇒ `LIMIT_REACHED`, with `PREMIUM_REQUIRED` when the user is free and slot ≥ 2) · `23505` / 0-row versioned update → `CONFLICT` · size trigger (`54000`) → `QUOTA_EXCEEDED` · write-rate guard (`53400`, saves closer than 3 s apart) → `COOLDOWN` (retry after backoff) · anything else → `MUTATOR_ERROR`-style `UNKNOWN` with a sanitised message (never show raw SQL/JWT text).

### 6.6 UI & feedback spec (auth / sync)
| Event | Presentation |
|---|---|
| Sign-up submitted | modal switches to "Check your email" (+ `info` toast) |
| Email confirmed (`?auth=confirmed`) | `gold` toast "Account verified — welcome!"; offer upload/continue |
| Signed in | `pos` toast "Signed in as <name>"; chip shows avatar + sync icon |
| Wrong credentials / captcha fail | inline error under the form + `neg` toast (generic text) |
| Google redirect returns | same as signed in; failures → `neg` toast with "Try again" action |
| Session expired | `warn` toast + chip "Guest"; local play unaffected |
| Sync status chip | `LOCAL_ONLY` (cloud-off icon) · `SYNCING` (spinner) · `SYNCED` (check, "Saved to cloud · 12:41") · `OFFLINE` (wifi-off) · `CONFLICT` (alert, clickable) · `ERROR` (alert, "Retry") — all with text, never colour alone |
| Push success | silent (chip updates); first-ever success → `pos` toast "Saved to your account" |
| Push failure (3rd consecutive) | `warn` toast with *Retry* action |
| Conflict | `conflict` modal (§6.4) |
| Quota exceeded | `neg` toast + "Your save is too large" modal offering to trim the log / export |
| Free user opens slot 2 | `premium` modal ("3 cloud slots and restore points with Premium") — non-aggressive, once per session |
| Retention notice | Account modal + Save Slots footer: "Inactive free accounts are deleted after 30 days. Premium and admin accounts are exempt." plus the player's own **delete-after date** (from `get_my_retention`, §7.2) |
| `client.min_version` > build | `update` modal (non-dismissible, "Reload") · `client.maintenance` → `maintenance` banner; play continues offline |
**Account chip menu:** Profile (display name, avatar picker from `RR.ui.avatar` seeds) · Save slots · Sync now · Settings · Export my data (Phase 6) · Sign out. **Auth modal** is keyboard-complete, labels programmatically associated, error text `aria-live`, password show/hide, paste allowed (R11).

### 6.7 Integration points
| Function | Reads | Mutates |
|---|---|---|
| `auth.*` | Supabase Auth | `rr.auth.v1` (SDK-managed) ; bus `auth:changed` |
| `cloud.profile.*` | `profiles` (own row) | `profiles.display_name/avatar_seed/last_active_at/age_confirmed_at/terms_version` |
| `cloud.saves.*` | `game_saves` (own rows) | same, via RLS |
| `sync.reconcile/pushNow` | store state, `rr.save.v1`, `rr.sync.v1`, cloud | `store.replace` (pull only), `rr.sync.v1`, cloud rows |
| `persist` (cloud adapter) | as above | as above — **engines never call it** |
| UI account modules | `RR.auth`, `RR.sync`, `RR.entitlements` | DOM only |

### 6.8 Stub registry (leave for Phase 6)
| Stub | Phase 5 behaviour | Replaced in |
|---|---|---|
| `RR.entitlements` | returns `{ tier:'FREE', status:'none' }`; premium UI hidden, `PREMIUM_REQUIRED` returned where relevant | Phase 6 |
| `RR.sync.snapshot/listSnapshots/restoreSnapshot` | `PREMIUM_REQUIRED` | Phase 6 |
| *Export my data* / *Delete my account* buttons | visible, call stubbed functions → modal "Arrives with the next update" **(must be real before public launch — Phase 6 gate)** | Phase 6 |
| `get_my_retention` display | shows the static policy text only | Phase 6 |

### 6.9 Acceptance tests
**SQL / RLS (`supabase/tests/*.sql`, run with `supabase test db` against the dev project or local stack):**
1. User A cannot `select / update / delete` user B's `profiles`, `game_saves`, `save_snapshots`, `entitlements` (0 rows affected); `anon` can read only `app_config`.
2. Inserting a `game_saves` row with another user's `user_id` fails (`42501`).
3. Slot limits: free user slot 1 ✔, slot 2 ✘; with an active PREMIUM entitlement slots 1–3 ✔; slot 4 ✘ (check constraint).
4. Version trigger: client-supplied `version` ignored; each update bumps it exactly once; stale-version update matches 0 rows; `user_id` cannot be changed.
5. `profiles.last_active_at` set to a future date by an authenticated user is stored as `now()`; `retention_hold_until`, `exempt_ended_at`, `warned_*` cannot be changed by an authenticated user (privilege error).
6. `entitlements` cannot be inserted/updated/deleted by `authenticated`.
7. A state larger than `limits.max_save_bytes` is rejected.
8. A new auth user gets a `profiles` row and an `entitlements` row; hostile metadata names (`<script>x</script>`, 1-character names, 200-character names) produce a valid sanitized display name (falling back to `Player`).
9. `advisors` (security + performance) report no errors for the schema; all `public` tables have RLS enabled; no `SECURITY DEFINER` function is executable by `anon`/`authenticated`.
**Client (fake-Supabase harness in `dev/fakes/`):**
10. **Reconcile matrix:** each of the 8 rows in §6.4 produces exactly the stated action; nothing is overwritten without a prompt.
11. **Push scheduling:** 50 commits within 5 s ⇒ ≤ 1 push; CLEANUP ⇒ immediate push; failures follow the backoff list then remain dirty; offline ⇒ status `OFFLINE`, no calls; reconnect ⇒ push.
12. **Conflict:** stale version → modal; each choice leaves local, cloud and bookkeeping consistent; *Keep cloud* offers a local download first; *Decide later* pauses sync but play continues; no path loses data silently.
13. **Untrusted data (R19):** invalid cloud state rejected with local data intact; `<img onerror>` in display name, NPC name and save label renders as text in every UI surface.
14. **Auth:** password < 10 rejected client-side; sign-up requires CAPTCHA + consent; Google call uses PKCE client options; static check: no `await` of Supabase calls inside `onAuthStateChange` callbacks; sign-out keeps the local game; account-switch prompt appears when owners differ.
15. **Offline-first:** with the network blocked, a full 60-turn game plays with zero uncaught errors; via `file://` the app boots OFFLINE with online controls disabled (§2.8.7 test 21).
16. **Secrets scan:** no occurrence of `service_role`, `sb_secret_`, `sk_live`, `sk_test`, `whsec_`, `RESEND_API_KEY`, private keys, or `.env` content under `public/` (script `tools/scan-secrets.mjs`, also run in CI).
17. **Payload budget:** serialized cloud payload of a seeded 240-turn game ≤ 250 KB; `derived` absent; `log` ≤ 50.
**Manual E2E script (`docs/e2e-phase5.md`, human-run on a Netlify preview):** sign up → confirm email → play 3 turns → second browser signs in → sees the same game → both play → conflict resolved both ways → sign out → Google sign-in with the same email links to the same account → account switch protection → airplane-mode play → reconnect sync.

---

## 7. PHASE 6 — LIFECYCLE (30-DAY RULE), PREMIUM & ADMIN
*Prerequisite reading: §0, §1 (incl. §1.12), §6, §10, Appendix D–I. Requires Phase 5. Delivers: the inactivity-deletion lifecycle with premium/admin exemptions, Stripe-backed Premium, an MFA-protected admin console, and the user's data rights (export, delete).*

### 7.1 Human prerequisites
**HC-7** Stripe account with a *Premium* product and monthly + yearly prices (test mode for dev, live for prod) · **HC-8** sending domain verified with the SMTP/email provider (SPF, DKIM) · **HC-9** Privacy Policy, Terms and retention wording reviewed by the owner (and counsel) · **HC-10** the first admin's email and an enrolled TOTP authenticator (the first admin row is inserted by the project owner via SQL — never from the client). The AI stops and asks for confirmation before 🔒 steps and records `BLOCKED-ON-HC-n` otherwise.

### 7.2 The 30-day inactivity rule (A17) — authoritative specification
| Term | Definition |
|---|---|
| **Activity** | any of: signing in; the client's throttled `profile.touch()` (§6.4); any successful write to `game_saves`; profile edits. The server forces `last_active_at = now()` — clients cannot set it. Token refreshes and page loads without interaction **do not** count. |
| **Inactive-since** | `greatest(last_active_at, exempt_ended_at)` — i.e. when an exemption ends (premium lapses, admin demoted) the 30-day clock **restarts from that moment**, so nobody is deleted the day a subscription ends. |
| **Exempt** | `ADMIN` (row in `admin_users`) · `PREMIUM` (`private.is_premium`: tier PREMIUM, status `active`/`trialing`, or `past_due` within `past_due_grace_days` = 7; period-end slack 3 days) · **hold** (`profiles.retention_hold_until > now()`; admin/legal hold). |
| **Warnings** | email at **day 23** ("7 days left") and **day 29** ("1 day left"); each includes the exact delete-after date, a sign-in link, and how Premium exempts the account. A warning stamp counts only if `warned_at ≥ inactive_since` (so returning players are re-warned in future). |
| **Deletion** | at/after **day 30** by the daily sweep, **only if** not exempt, not on hold, `warned_1_at ≥ inactive_since` **and** `warned_1_at ≤ now() − 20 h`, `retention.dry_run = false`, and the run's circuit breaker is not tripped. Eligibility is **re-checked per user immediately before deletion**. |
| **What is deleted** | the auth user → cascades `profiles`, `entitlements`, `game_saves`, `save_snapshots`. A `deletion_log` row (hash, reason, days inactive — **no email, no name**) is written. |
| **What is not** | the player's local (browser) save; Stripe customer/invoice records (financial record-keeping — disclosed in the Privacy Policy); database backups age out on the provider's schedule (disclosed). |
| **Guests** | nothing server-side exists; the rule does not apply (Account UI says so). |
| **Unconfirmed sign-ups** | purged after `unconfirmed_purge_days` = 7 (no data, no warning). |
| **Safety** | `dry_run` defaults **true** in every environment; `max_deletions_per_run` 200; `max_deleted_pct` 5 % of all accounts (exceeding either ⇒ abort, record `lifecycle_runs.aborted`, email the admin alert address); cron secret required; idempotent; never touches admins. **Launch gate L-1:** run in dry-run for ≥ 14 days in production and review the candidate lists before the owner flips `dry_run` to false (typed confirmation in the admin console). |
| **Player visibility** | `public.get_my_retention()` → `{ exempt, reason, inactive_since, delete_after, days_left, policy_days }`; shown in Account modal, Save Slots footer, and as a `warn` banner when `days_left ≤ 7`. |
**Schedule:** `pg_cron` job `lifecycle-sweep-daily` at `0 3 * * *` (UTC — pg_cron schedules in UTC) → `pg_net` POST to the Edge Function with `x-cron-secret` read from Vault. **Timeline example (free account, last active day 0):** day 23 sweep → warning 1 · day 29 sweep → warning 2 · day 30 sweep → ≥ 20 h since warning 2 ⇒ deleted · if the player signs in on day 27 the clock restarts and no deletion occurs.

### 7.3 Objectives (Build Steps)
| Step | Build |
|---|---|
| **6.1** | 🔒 **Lifecycle sweep:** Edge Function `lifecycle-sweep` (service role; `verify_jwt=false` + `x-cron-secret`), email templates (`retention7`, `retention1`, `deleted`, `admin-alert`), migration `0004_cron` (template; Vault secrets are created by the human), dry-run reporting. |
| **6.2** | 🔒 **Billing:** migration `0005_billing`; Edge Functions `create-checkout-session`, `create-portal-session`, `stripe-webhook`; `RR.entitlements`. |
| **6.3** | **Premium experience:** slots 2–3 live, **snapshots** (auto every `sync.snapshotEveryTurns`, before conflict overwrite, before New Game over an occupied slot, manual; keep 5 per slot), cosmetic packs (`RR.data.cosmetics`: ≥ 12 premium avatar parts, 3 UI themes), crown chip, premium toast tone, `premium` modal states. |
| **6.4** | 🔒 **Admin console:** migration `0006_admin`; Edge Function `admin-actions`; `public/admin/` page (§7.5). |
| **6.5** | 🔒 **Data rights:** `export-my-data`, `delete-my-account`, UI in the Account modal (replaces Phase-5 stubs). |
| **6.6** | **Notices & emails:** retention banner/countdown, past-due banner, auth email templates (confirm, reset, welcome) in `docs/email-templates/` for the owner to paste into the Auth settings. |
| **6.7** | **Tests (§7.8).** |

### 7.4 Billing & entitlements (Stripe)
- **Model:** `entitlements` (Appendix D) is the only authority the game and the lifecycle read. It is written **only** by Edge Functions (service role): the Stripe webhook and `admin-actions`.
- **Checkout:** `create-checkout-session` (JWT required) creates or reuses the Stripe customer (`entitlements.stripe_customer_id`), starts `mode:'subscription'` Checkout with `client_reference_id = user.id`, `subscription_data.metadata.user_id`, price from function secrets (`STRIPE_PRICE_MONTHLY|YEARLY`), `success_url = SITE_URL/?premium=success`, `cancel_url = SITE_URL/?premium=cancel`. The client only redirects to the returned URL.
- **Webhook (`stripe-webhook`, `verify_jwt=false`):** verify the signature on the **raw body** with `STRIPE_WEBHOOK_SECRET`; insert the event id into `stripe_events` (PK ⇒ **idempotent**); for `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`: **re-fetch the subscription from Stripe** (handles out-of-order delivery) and compute the entitlement: `active|trialing → PREMIUM/active` · `past_due → PREMIUM/past_due` · `canceled|unpaid|incomplete_expired → FREE/canceled|expired`. Store `current_period_end`, `cancel_at_period_end`. If the account just stopped being exempt ⇒ set `profiles.exempt_ended_at = now()`. Always return 2xx quickly after durable recording; retries are safe.
- **Portal:** `create-portal-session` opens Stripe's hosted Customer Portal (change plan, update card, cancel).
- **Admin grants:** `source='admin_grant'` rows are never altered by Stripe events for that user unless the user also subscribes (then Stripe wins and the grant is replaced).
- **Downgrade behaviour:** slots 2–3 become **read-only/locked** (RLS: select/delete allowed, insert/update denied above the limit); snapshots are retained read-only for 30 days then pruned by the sweep (add to `lifecycle-sweep`); cosmetics revert to base; the account's 30-day clock restarts (§7.2).
- **Taxes/merchant of record:** decision J-3 (Stripe Tax vs a merchant-of-record provider). The `entitlements.source` abstraction keeps the game independent of the provider.
- **Fairness (A19):** Premium never changes any engine number. Test 8 greps engine files for `RR.entitlements`.
```js
// RR.entitlements (53-entitlements.js)
get() -> { tier:'FREE'|'PREMIUM', status, periodEnd, cancelAtPeriodEnd, source, slots, snapshots, cosmetics:boolean }
refresh() -> Promise<Result>            // reads own row; after Checkout return, polls ≤ 30 s until tier changes (spinner "Activating Premium…")
has(feature /* 'SLOTS_3'|'SNAPSHOTS'|'COSMETICS' */) -> bool
startCheckout('MONTHLY'|'YEARLY') -> Promise<Result>     openPortal() -> Promise<Result>
```

### 7.5 Admin console (`public/admin/`)
- **Access:** sign in → TOTP MFA (`aal2`) → the page asks the server `admin-actions { action:'whoami' }`; non-admins see a plain "Not found" screen. The page is `noindex`, has a stricter CSP, and loads only the files it needs. **All privileged work happens in the Edge Function** (verifies JWT → `admin_users` membership → `aal2` claim → performs the action with the service role → writes `admin_audit`). The browser never receives a privileged key; admins have no special RLS access (smaller attack surface).
- **Bootstrap:** the first admin is inserted by the owner with `tools/bootstrap-admin.sql` (template; the email is typed into the SQL editor, never committed). Promoting/demoting admins is **not** offered in the UI.
| Tab | Capabilities (each = one `admin-actions` action; destructive ones need a confirm modal) |
|---|---|
| **Overview** | counts (accounts, new 7 d, active 1 d / 7 d, premium, upcoming deletions 7 d, deletions 30 d, saves, avg save KB) and a health box (last lifecycle run, dry-run flag, aborted runs) |
| **Users** | search by email / id / display name → `{ id, email, display name, created, last sign-in, last_active, tier/status/source/period end, exempt reason, delete-after, hold, saves meta }`; **Grant premium** (days or lifetime + reason) · **Revoke premium** · **Set / clear retention hold** (until + reason) · **View save state** (reason ≥ 10 chars, logged, read-only JSON viewer + download) · **Delete user** (type the email; also cancels Stripe) |
| **Retention** | candidate preview with computed dates, last 30 run summaries, **Run dry-run now**, **Toggle `dry_run`** (typed confirmation showing how many accounts would be deleted at the next run) |
| **Config** | validated editors for `app_config`: `client.banner/maintenance/min_version`, `limits`, `pricing` (display only), `retention` (guarded) |
| **Audit** | paged `admin_audit` (who, when, action, target hash, details) — read-only |
- **Every action shows a toast** (success/failure) and is audited. Idle timeout 30 min → sign-out. All dynamic text via `textContent`; the page has **no** `innerHTML` with data (test 11).

### 7.6 Data rights
- **`export-my-data`** (JWT required): returns one JSON bundle — profile, consent stamps, entitlement summary, all save rows (full `state`), snapshot metadata, retention status. Client downloads it as `ratrace-export-YYYYMMDD.json`. Rate-limit 3/day.
- **`delete-my-account`** (JWT required): the client re-authenticates first (password re-entry or Google round-trip); the function requires `last_sign_in_at` within **5 minutes** and the typed word `DELETE`; cancels any Stripe subscription **immediately** (the modal says so and that no automatic refund is issued — policy per J-3), deletes the auth user (cascade), writes `deletion_log` (`reason:'SELF'`), sends a confirmation email, returns `ok`. The client then signs out; the local save stays on the device unless the user ticks *Also remove the game stored in this browser*.

### 7.7 Integration points
| Function | Reads | Mutates |
|---|---|---|
| `lifecycle-sweep` | `retention_candidates()`, `app_config`, Auth admin API (emails) | `profiles.warned_*`, `lifecycle_runs`, `deletion_log`, auth users (delete), prunes expired snapshots |
| `stripe-webhook` | Stripe API, `stripe_events` | `entitlements`, `profiles.exempt_ended_at`, `stripe_events` |
| `create-checkout-session` / `create-portal-session` | `entitlements`, JWT | `entitlements.stripe_customer_id` (first time) |
| `admin-actions` | `admin_users`, JWT `aal`, tables per action | per action + `admin_audit` |
| `export-my-data` / `delete-my-account` | caller's rows | auth user (delete), `deletion_log` |
| `RR.entitlements`, `RR.sync` (snapshots), premium UI | `entitlements`, `save_snapshots` | `save_snapshots` (insert/delete own, premium only) |

### 7.8 Acceptance tests
1. **Retention classification (SQL):** free 22 d → none; 23 d → warn-7; 29 d → warn-1; 30 d with `warned_1_at ≥ 20 h` old → delete-eligible; admin 90 d inactive → exempt `ADMIN`; premium active 90 d → exempt `PREMIUM`; premium ended 2 days ago (`exempt_ended_at = now() − 2 d`, last active 90 d) → inactive-since = 2 days → **not** eligible; `past_due` 3 days → exempt, `past_due` 9 days → not exempt; hold → `on_hold`; a warning stamp older than `inactive_since` is ignored; activity resets the clock.
2. **Sweep (Deno tests, fake Supabase + fake mailer):** dry-run deletes nothing but records the would-delete list; live run deletes exactly the eligible set; per-user re-check skips a user who became premium after selection; breaker aborts when candidates > `max_deletions_per_run` or > `max_deleted_pct` and emails the alert address; re-running the same day is a no-op; a mail failure does not crash the run and does **not** count as a sent warning; unconfirmed accounts purge only after 7 days; admins never touched.
3. **Auth of the sweep:** missing/incorrect `x-cron-secret` ⇒ 401, nothing executed.
4. **Stripe webhook:** bad signature ⇒ 400; duplicate event id ⇒ 200 no-op; out-of-order events converge to the Stripe truth (re-fetch); checkout completed ⇒ PREMIUM/active with period end; payment failed ⇒ `past_due`; subscription deleted ⇒ FREE and `exempt_ended_at` set; events for user X never alter user Y.
5. **Slots across upgrade/downgrade:** free → premium allows slots 2–3 immediately (no re-login); after lapse slots 2–3 are read-only; snapshots visible read-only; New Game on a locked slot is refused with `PREMIUM_REQUIRED`.
6. **Admin function:** non-admin ⇒ 403; admin without `aal2` ⇒ 403; every action writes `admin_audit`; `viewState` rejects reasons < 10 chars; `users.delete` requires the matching email; `config.set` rejects unknown keys/invalid shapes; no admin-promotion action exists.
7. **Data rights:** export contains every field listed in §7.6 and no other user's data; delete without a recent sign-in ⇒ `UNAUTHENTICATED`; after delete the auth user, saves and entitlements are gone, `deletion_log` has a hash (no email), the Stripe subscription is canceled; the local guest copy survives by default.
8. **Fairness lint (A19):** zero occurrences of `RR.entitlements` in engine files (`00`–`49`) — premium cannot influence game numbers.
9. **Premium UI:** modal states free / activating / active / cancel-at-period-end / past-due render correctly; fully keyboard-operable; price text comes from `app_config.pricing`; premium toast tone distinct and has an icon.
10. **Emails:** templates render with all variables, include plain-text alternatives, correct dates and links to `SITE_URL`; no user-supplied HTML.
11. **Admin page hardening:** stricter CSP present; `X-Robots-Tag: noindex`; static check finds no `innerHTML`/`insertAdjacentHTML` with dynamic data; idle timeout works.
12. **Launch gate L-1 evidence:** `lifecycle_runs` shows ≥ 14 consecutive dry-run days on prod; owner sign-off recorded in the Handoff Log before `dry_run=false`.

---

## 8. PHASE 7 — CONTENT, ART, AUDIO & POLISH
*Prerequisite reading: §0, §1 (incl. §1.12), §10, Appendix E and F. Requires Phases 1–4 (it can run in parallel with Phases 5–6 because it touches content and presentation only). Delivers: the final visual identity, the full content library, procedural audio, onboarding and an accessibility/performance pass.*

### 8.1 Objectives (Build Steps)
| Step | Build |
|---|---|
| **7.1** | **Final art pass** (Appendix F): brand logo + favicon set + OG image; icon sprite ≥ 90 symbols; ≥ 20 scenes; avatar part library expansion (skin ×8, hair ×14, outfits ×16 per role family, accessories ×10, backgrounds ×8); NPC portraits reviewed for diversity and non-stereotyping. |
| **7.2** | **Icon/scene toolchain:** `tools/build-icons.mjs` (Node, **dev-only**, never required at runtime) compiles `assets/icons/*.svg` into `public/js/05-data-icons.js`; `tools/build-scenes.mjs` likewise; **generated files are committed** so a contributor without Node can still run the game (A27). |
| **7.3** | **Content expansion:** grow the library to **≥ 120 event templates** (Appendix E.3 rows marked **P7** + original ideas from Appendix B), **≥ 14 NPC templates**, 6 multi-step **story arcs** (E.4), 12 more glossary terms, seasonal flavour (holiday bonus, tax season, summer slump). |
| **7.4** | **Audio (optional, off by default):** `RR.audio` — procedural WebAudio blips (coin, error, success, level-up, crisis sting) and one optional ambient loop synthesised at runtime; **no audio files**, no licences; master volume + mute in Settings; respects `prefers-reduced-motion` as a hint (not a rule), never autoplays before the first user gesture. |
| **7.5** | **Onboarding:** MENTOR-led tutorial (first 6 turns, `settings.tutorialHints`), glossary tooltips on every metric, "What just happened?" button on the Result strip (explains the lesson in 1–2 sentences), first-run checklist (first deal, first deposit, first insurance, first NPC lunch). |
| **7.6** | **Accessibility pass (WCAG 2.2 AA targets):** contrast ≥ 4.5:1 (text) / 3:1 (UI), focus order, `aria-live` regions, dialog semantics, reduced motion, colour-independence, 200 % zoom, keyboard-only full run, screen-reader spot checks; a colour-blind-safe check of all tone pairs. |
| **7.7** | **Performance budget:** first load ≤ 600 KB gzip excluding `vendor/`; no layout shift on mode swap; 60 fps on a mid-range laptop for tweens; event-card render < 50 ms; memory stable over a 240-turn headless run. |
| **7.8** | **Localization seam (optional):** all UI strings routed through `RR.i18n.t(key, vars)` with an `en` table; **no** translation work in this phase. |
| **7.9** | **Responsive decision gate:** if the owner confirms phones are a target audience (Google sign-in suggests Android users — see J-1), add a **portrait/mobile layout** as Phase 9 (Appendix B); otherwise keep the ≥ 900 px notice. |

### 8.2 Acceptance tests
1. **Asset completeness:** every icon/scene/avatar id referenced by any template, UI module or Appendix F list exists; `tools/build-icons.mjs --check` reports zero drift between `assets/icons/` and the committed sprite.
2. **Content volume & lint:** ≥ 120 templates pass the content lint; ≥ 25 % have `outcomes` or `SCHEDULE` (real consequences); every `RR.data.npcs` role has ≥ 3 distinct event templates.
3. **Audio:** off by default; no sound before a user gesture; each sound ≤ 600 ms; mute persists; zero network requests for audio.
4. **Onboarding:** a new Teacher game completes the first-run checklist within 12 turns using hints only; hints can be disabled and re-enabled; glossary tooltip exists for every ledger label.
5. **A11y:** automated contrast report passes for every token pair used; keyboard-only completion of a New Game → first escape in the simulator-assisted script; modals trap focus; no information conveyed by colour alone (audit list in `docs/a11y.md`).
6. **Performance:** budgets in 7.7 met on a throttled CPU profile (4× slowdown); a 240-turn headless run shows < 10 % heap growth after turn 20.
7. **Regression:** Phase 1–4 acceptance tests still pass; byte-identical full-run determinism unchanged (art/audio/i18n must not touch state or RNG).

---

## 9. PHASE 8 — SECURITY HARDENING, CI/CD, LAUNCH & LIVE OPS
*Prerequisite reading: everything above, especially Appendix G (repo/CI), H (threats), I (human setup). Requires Phases 5–6 (and 7 for the art/content launch bar). Delivers: a launch-ready, monitored, recoverable service.*

### 9.1 Objectives (Build Steps)
| Step | Build |
|---|---|
| **8.1** | **Security review:** walk the Threat Register (Appendix H) line by line; add an automated test or a documented control for each; run the Supabase security & performance advisors; fix all findings. |
| **8.2** | **Headers & CSP:** final `netlify.toml` (Appendix G.3) incl. strict CSP for the game and a stricter one for `/admin/*`; HSTS; `Referrer-Policy`; `Permissions-Policy`; `X-Content-Type-Options`; `frame-ancestors 'none'`. Verify nothing is blocked in a full play-through. |
| **8.3** | **CI/CD:** GitHub Actions (Appendix G.4): content lint + `dev/tests.html` headless, simulator smoke, SQL tests, secrets scan, migration dry-run, Deno function tests; **required checks** on PRs; deploy previews on Netlify; migrations to *dev* automatically, to *prod* only on tagged release after manual approval. |
| **8.4** | **Observability:** Netlify deploy notifications; Supabase logs/alerts for Auth errors, Edge Function failures, DB CPU/connections; **client error reporting** (optional, consent-based): a small `client_errors` insert-only table (authenticated users only, size-capped, 20/day/user by trigger) *or* a third-party tool added to the CSP — owner decision J-5. |
| **8.5** | **Legal & trust pages:** `/privacy.html`, `/terms.html`, `/credits.html`, `/data-deletion.html` (explains the 30-day rule, exemptions, deletion path, backups, Stripe retention); cookie/storage notice (local storage is used for saves and sign-in — strictly necessary; any analytics must be opt-in); age statement (13+ / local digital-consent age); contact address. *(Drafts only — owner/counsel review, HC-9.)* |
| **8.6** | **Backups & recovery:** enable the provider's backup/PITR tier appropriate to prod, plus a weekly logical dump to private storage via GitHub Action; **restore drill** into a scratch project documented in `docs/runbook.md`; document how deletions interact with backups. |
| **8.7** | **Abuse & cost controls:** CAPTCHA verified server-side by Auth; per-user write rate (`minIntervalMs` client + DB-side trigger guard: ≤ 1 save write / 3 s); size caps; Edge Function rate limits (`export-my-data` 3/day); spend alerts on Supabase, Netlify and Stripe; documented quota math (Appendix J). |
| **8.8** | **Optional — Leaderboard (decision gate J-4):** `leaderboard_runs` (migration `0007_leaderboard`), Edge Function `submit-run` that **replays** the submitted `RR.replay` log headlessly with the same engine files (possible because of R2/R5/R20), checks `finalState` and outcome, then stores `{ user, seed, profile, outcome, turns, netWorth, passive }`; weekly seeded challenge (`seed = hash(isoWeek)`); display names only; reporting/removal tool in the admin console. Without this step the game ships with **no** competitive surface (saves are client-authoritative, A28). |
| **8.9** | **Launch checklist & rollback plan** (§9.3) and a staged rollout (owner + invited testers → soft launch → public). |

### 9.2 Acceptance tests
1. **Threat register:** every H-n row has a linked test, lint, or documented control; the table in `docs/security.md` is complete.
2. **Advisors clean:** Supabase security and performance advisors show no errors or warnings that are not explicitly accepted in `docs/security.md`.
3. **CSP:** a full play-through (guest + signed-in + premium + admin) produces **zero** CSP violations in the console; an injected `<script>` string in any user-controlled field neither executes nor triggers a violation.
4. **CI:** a PR that (a) breaks a content-lint rule, (b) adds a secret-like string to `public/`, (c) removes RLS from a table, or (d) breaks determinism is **blocked** by required checks.
5. **Backups:** a restore drill completes within the documented time; the post-restore app boots and a test account signs in.
6. **Retention in prod:** L-1 gate evidence present; first real deletion run is monitored by the owner; `lifecycle_runs` and `deletion_log` match expectations.
7. **Abuse controls:** 100 rapid save writes are throttled without data loss in the UI; oversize payloads rejected; sign-up spam without CAPTCHA token is rejected.
8. **Leaderboard (if built):** a tampered replay log fails verification; a valid log is accepted and ranks; the same seed on two devices yields the same outcome.
9. **Rollback:** a bad deploy is reverted by re-publishing the previous Netlify deploy; a bad migration is reverted by a forward fix migration (documented — no down migrations in prod); both rehearsed on staging.

### 9.3 Launch checklist (human + AI)
☐ All Phase 1–8 acceptance tests green on staging · ☐ L-1 dry-run evidence · ☐ prod Supabase settings match `docs/supabase-setup.md` (Auth, redirect allow-list, CAPTCHA, SMTP, MFA) · ☐ Stripe live keys in prod function secrets only · ☐ first admin created + MFA verified · ☐ Vault secrets (`project_url`, `cron_secret`) present · ☐ legal pages reviewed · ☐ backups verified · ☐ alerts routed to the owner · ☐ `client.min_version` set · ☐ announcement banner ready · ☐ rollback rehearsed · ☐ owner signs the Handoff Log launch entry.

---

## 10. SESSION HANDOFF LOG (the human pastes each session's entry here)

> **Rules for the AI:** append-only. Newest entry at the bottom. Entries record *what is true in the repo*, including deviations from this plan.

```
### Entry 0 — Plan authored
- Date: (fill in)
- Phase executed: none
- Repo state: no code yet
- Deviations from plan: none
- Next: Execute Phase 1

### Entry 0.1 — Plan upgraded to v2.0 (Online Edition)
- Date: (fill in)
- Phase executed: none
- Repo state: no code yet
- Changes: added §1.12 (v2 contract), Phase-1/2/3/4 v2 additions, Phases 5–8, Appendices D–J; renumbered the Handoff Log to §10; State Schema v2
- Open owner decisions: see Appendix J (J-1 phones, J-2 Google sign-in vs Play, J-3 payments/tax, J-10 naming/trademark)
- Deviations from plan: none
- Next: Execute Phase 1
```

<!-- paste new entries below this line -->

---

## APPENDIX A — LOCKED DESIGN DECISIONS (change only via explicit user approval)
| # | Decision | Why |
|---|---|---|
| A1 | Turn = 1 month, no dice/board | Makes payday, interest, and the market tick deterministic and testable; simpler UI. |
| A2 | Classic scripts + `window.RR` namespace (no ES modules) | ES modules fail from `file://`; double-click run is a hard requirement. |
| A3 | Integer whole-dollar money; floats only for per-share/index values | Eliminates rounding drift across sessions. |
| A4 | Commit-and-rebind store with snapshot rollback | Tiny state, atomic actions, trivial save/load and undo-style debugging. |
| A5 | `derived` is computed, never hand-edited | The ledger can never disagree with the underlying state. |
| A6 | Asset-linked debt is netted inside the asset's cash flow | Players see each asset's true cash flow; avoids double-counting in the escape test. |
| A7 | Money-losing assets count as **expenses** (`assetDrag`), not negative passive income | Keeps `passive` an honest, non-negative "money that works for you" number. |
| A8 | Escape is strict `passive > totalExpenses`; Empire goal is `≥` | Matches the user's stated rule; goal uses `≥` for a clean win moment. |
| A9 | Passive income taxed at 10% vs salary 20% | Teaches why asset income is advantaged; tunable. |
| A10 | Seeded RNG with state in `meta.rng`; ids from `meta.idCounter` | Reproducible bugs, reproducible balance runs, deterministic saves. |
| A11 | Personal assets (home, car) are never liquidated | Keeps the shelter/necessity distinction simple; avoids a grim edge case. |
| A12 | All numbers live in `RR.config`; v1 values are guesses to be tuned by `RR.sim` | Balance work must not require code archaeology. |
| A13 | Hosted architecture = static client on Netlify + Supabase (Auth, Postgres, Edge Functions); no custom server; secrets only in Edge Functions/Vault | Smallest operable surface; fits "no build step" |
| A14 | Device id and sync bookkeeping live **outside** game state (`rr.sync.v1`) | Keeps saves portable and deterministic |
| A15 | Guest/offline play from `file://` is permanent, not a dev mode | Core promise of the project; online is progressive enhancement |
| A16 | Entitlements, retention clock, admin status and quotas are server-authoritative; authorisation never uses `user_metadata` | Client data is user-editable |
| A17 | **Inactivity = 30 days since last activity** (sign-in/touch, save, profile edit); the clock **restarts** when a Premium/Admin exemption ends; warnings at day 23 and 29; exempt = Admin, active Premium (past-due 7-day grace), admin hold; dry-run by default | Fair, auditable, reversible-until-deleted |
| A18 | "Google Play" in the brief is implemented as **Google account sign-in (OAuth)**; Play Billing/Play Games are out of scope | Web-first product; revisit with an Android wrapper (J-2) |
| A19 | Premium sells **convenience and cosmetics only** (slots, snapshots, cosmetics) — never economy advantages | Keeps the financial-literacy simulation fair |
| A20 | Cloud conflicts are never auto-resolved by timestamps; the player chooses | Prevents silent data loss |
| A21 | Independent RNG streams (`market`, `events`, `deals`, `npc`, `misc`) | Adding content/rolls in one system must not reshuffle another |
| A22 | Health never ends the game; it changes income, expenses and event odds | Teaches health-as-asset without a "you died" dead end |
| A23 | Deposits: integer balances, float APY; interest paid monthly through the payday net, taxed as passive income | Consistent with A3/A9 |
| A24 | Engines emit **EffectReceipts**; only `RR.ui.receipt` turns them into toasts/strips/modals | Keeps engines headless (R2) and feedback consistent |
| A25 | Property/business condition uses **banded** value/rent factors | Legible to players, easy to test |
| A26 | Consequences are scheduled **data** in `state.story`, resolved with `rng.events` at fire time | Save/load-safe, deterministic, no re-roll exploit |
| A27 | Dev tooling may use Node (`tools/`, `dev/`); generated assets are committed; the runtime has no build step | Contributors without Node can still run the game |
| A28 | Saves are client-authoritative (single-player); only an optional leaderboard (Step 8.8) verifies runs by headless replay | Don't over-engineer anti-cheat for a solo game |

## APPENDIX B — STRETCH BACKLOG (out of scope until the user asks)
More professions and difficulty modes · achievements & "Financial IQ" score · full tutorial campaign · refinance and cash-out-refi actions · more insurance products (disability, umbrella) · **mobile portrait layout (Phase 9, see J-1)** · translations (the `RR.i18n` seam ships in Phase 7) · Android wrapper with **Play Billing / Play Games** (J-2) · social features (friends, gifting) · seasonal live events · PWA/service worker (only with a cache-safety plan) · multiplayer or asynchronous challenges beyond the optional leaderboard.

## APPENDIX C — PROMPT STARTERS FOR THE HUMAN
- **Start a phase:** *"Here is the Master Implementation Plan. Execute Phase 2."*
- **Smaller bite:** *"…Execute Phase 3, Step 3.2."*
- **Continue after a cut-off:** *"Continue from where you stopped; next is Step 2.5."*
- **Audit with real code attached:** *"Here is the plan and my current repo. Audit the code against §1.5–§1.10 and Phase N's Integration Points. List every divergence; don't change code yet."*
- **Fix a bug safely:** *"Here is the plan, the repo, and this bug: … Fix it without changing the schema or any public signature; if that's impossible, stop and propose a Schema Change per §0.4."*
- **Start an online phase:** *"Here is the Master Implementation Plan. Execute Phase 5 — I've completed HC-1 to HC-6."* (or *"…HC-3 isn't done yet; build against placeholders."*)
- **Security audit:** *"Here is the plan and my repo. Audit against Appendix H and R13–R21; list every gap with a proposed fix; don't change code yet."*
- **Content expansion:** *"Add 10 event templates for the Leaky Roof arc following Appendix E.2 and the content lint rules."*
- **Retention dry-run review:** *"Here are my last 14 `lifecycle_runs` rows and the candidate list. Check them against §7.2 and tell me whether it is safe to flip `dry_run`."*
- **Schema/DB change:** *"Add X to the database following R17 and Appendix D (additive migration + RLS + tests); don't touch applied migrations."*

---

## APPENDIX D — DATABASE & EDGE FUNCTION SPECIFICATION (SUPABASE)
> **Rules for the AI executing Phases 5–6/8:** (1) Re-check the current Supabase docs/changelog before writing SQL or SDK calls — the platform changes (R17). (2) Imperative migrations in `supabase/migrations/` created with `supabase migration new <name>` (never invent filenames); iterate with `execute_sql`/`supabase db query`, generate the migration when stable. (3) Run `supabase db advisors` before every merge. (4) The SQL below is the **reference design**; adapt syntax to the current Postgres version but **do not weaken** any control (RLS, grants, guards, `search_path`). (5) Tables in `public` are exposed through the Data API only through the explicit grants below.

### D.1 Migration set
| File | Purpose | Phase |
|---|---|---|
| `0001_core.sql` | schema `private`, tables, helper functions, triggers | 5 |
| `0002_rls.sql` | RLS enablement, explicit grants, policies | 5 |
| `0003_lifecycle.sql` | lifecycle tables, `retention_candidates()`, `get_my_retention()`, seed `app_config` | 5 |
| `0004_cron.sql` | `pg_cron` + `pg_net` schedule (reads Vault at run-time) | 6 |
| `0005_billing.sql` | `stripe_events`, indexes | 6 |
| `0006_admin.sql` | `admin_audit` | 6 |
| `0007_leaderboard.sql` | `leaderboard_runs` *(optional, J-4)* | 8 |
| `tools/bootstrap-admin.sql` | one-off first-admin insert (**not** a migration; no real email committed) | 6 |

### D.2 `0001_core.sql` (reference)
```sql
create schema if not exists private;                         -- NOT in the exposed-schemas list
grant usage on schema private to authenticated, service_role;

create table public.app_config (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now());

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 2 and 24),
  avatar_seed integer not null default (floor(random() * 2147483647))::int,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  retention_hold_until timestamptz,              -- admin / legal hold   (service-role writes only)
  exempt_ended_at timestamptz,                   -- restarts the 30-day clock (service-role writes only)
  warned_7_at timestamptz, warned_1_at timestamptz,
  age_confirmed_at timestamptz, terms_version text);
create index profiles_last_active_idx on public.profiles (last_active_at);

create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'FREE' check (tier in ('FREE','PREMIUM')),
  status text not null default 'none' check (status in ('none','active','trialing','past_due','canceled','expired')),
  source text not null default 'none' check (source in ('none','stripe','admin_grant')),
  current_period_end timestamptz, cancel_at_period_end boolean not null default false,
  stripe_customer_id text unique, stripe_subscription_id text unique,
  updated_at timestamptz not null default now());

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now());

create table public.game_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  label text not null default 'My game' check (char_length(label) <= 40),
  state jsonb not null, schema_version integer not null, game_id text not null,
  turn integer not null default 0, mode text not null default 'RAT_RACE', status text not null default 'RUNNING',
  net_worth bigint not null default 0,
  device_id text not null check (char_length(device_id) <= 64),
  version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, slot));                                     -- also serves user_id lookups

create table public.save_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  reason text not null default 'AUTO' check (reason in ('AUTO','MANUAL','PRE_OVERWRITE','PRE_NEW_GAME')),
  state jsonb not null, schema_version integer not null, turn integer not null default 0,
  created_at timestamptz not null default now());
create index save_snapshots_user_slot_idx on public.save_snapshots (user_id, slot, created_at desc);

-- ── helpers (INVOKER; read tables the caller can already read under RLS) ──────────────────────────────
create function private.is_admin(uid uuid) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.admin_users a where a.user_id = uid) $$;

create function private.is_premium(uid uuid) returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.tier = 'PREMIUM'
      and ( (e.status in ('active','trialing') and (e.current_period_end is null or e.current_period_end > now() - interval '3 days'))
         or (e.status = 'past_due' and e.current_period_end > now() - interval '7 days') )) $$;

create function private.slot_limit(uid uuid) returns integer language sql stable set search_path = '' as $$
  select case when private.is_premium(uid) or private.is_admin(uid)
    then coalesce((select (value->>'premium_slots')::int from public.app_config where key = 'limits'), 3)
    else coalesce((select (value->>'free_slots')::int    from public.app_config where key = 'limits'), 1) end $$;

create function private.sanitize_name(raw text) returns text language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  v := left(btrim(regexp_replace(coalesce(raw, ''), '[^[:alnum:] ._-]', '', 'g')), 24);
  if char_length(v) < 2 then v := 'Player'; end if;
  return v;
end $$;

-- ── triggers ────────────────────────────────────────────────────────────────────────────────────────────
create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
    values (new.id, private.sanitize_name(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))));
  insert into public.entitlements (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create function private.profiles_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then          -- client writes: freeze server-owned columns, force the activity clock
    new.id := old.id;  new.created_at := old.created_at;
    new.retention_hold_until := old.retention_hold_until;  new.exempt_ended_at := old.exempt_ended_at;
    new.warned_7_at := old.warned_7_at;  new.warned_1_at := old.warned_1_at;
    new.last_active_at := now();
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function private.profiles_guard();

create function private.state_size_guard() returns trigger language plpgsql set search_path = '' as $$
declare max_bytes integer;
begin
  select coalesce((value->>'max_save_bytes')::int, 400000) into max_bytes from public.app_config where key = 'limits';
  if octet_length(new.state::text) > max_bytes then raise exception 'save_too_large' using errcode = '54000'; end if;
  return new;
end $$;

create function private.game_saves_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1; new.created_at := now(); new.updated_at := now();
  else
    if now() - old.updated_at < interval '3 seconds' then
      raise exception 'rate_limited' using errcode = '53400';            -- client maps to COOLDOWN (backoff + retry)
    end if;
    new.id := old.id; new.user_id := old.user_id; new.slot := old.slot; new.created_at := old.created_at;
    new.version := old.version + 1; new.updated_at := now();
  end if;
  return new;
end $$;
create trigger game_saves_size   before insert or update on public.game_saves for each row execute function private.state_size_guard();
create trigger game_saves_guard  before insert or update on public.game_saves for each row execute function private.game_saves_guard();
create trigger snapshots_size    before insert on public.save_snapshots        for each row execute function private.state_size_guard();

create function private.touch_profile_from_save() returns trigger language plpgsql security definer set search_path = '' as $$
begin update public.profiles set last_active_at = now() where id = new.user_id; return new; end $$;
create trigger game_saves_touch after insert or update on public.game_saves for each row execute function private.touch_profile_from_save();

create function private.snapshots_prune() returns trigger language plpgsql set search_path = '' as $$
declare keep integer;
begin
  select coalesce((value->>'premium_snapshots')::int, 5) into keep from public.app_config where key = 'limits';
  delete from public.save_snapshots s
   where s.user_id = new.user_id and s.slot = new.slot
     and s.id not in (select id from public.save_snapshots where user_id = new.user_id and slot = new.slot
                      order by created_at desc, id desc limit keep);
  return null;
end $$;
create trigger snapshots_prune after insert on public.save_snapshots for each row execute function private.snapshots_prune();

-- execute privileges: nothing by default; only what policies/RPCs need
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin(uuid), private.is_premium(uuid), private.slot_limit(uuid) to authenticated, service_role;
```

### D.3 `0002_rls.sql` (reference)
```sql
alter table public.app_config     enable row level security;
alter table public.profiles       enable row level security;
alter table public.entitlements   enable row level security;
alter table public.admin_users    enable row level security;
alter table public.game_saves     enable row level security;
alter table public.save_snapshots enable row level security;

-- explicit privileges (works whether or not new tables are auto-exposed to the Data API)
revoke all on public.app_config, public.profiles, public.entitlements, public.admin_users, public.game_saves, public.save_snapshots from anon, authenticated;
grant select on public.app_config to anon, authenticated;
grant select on public.profiles, public.entitlements, public.admin_users to authenticated;
grant update (display_name, avatar_seed, last_active_at, age_confirmed_at, terms_version) on public.profiles to authenticated;
grant select, insert, update, delete on public.game_saves to authenticated;
grant select, insert, delete on public.save_snapshots to authenticated;
grant all on public.app_config, public.profiles, public.entitlements, public.admin_users, public.game_saves, public.save_snapshots to service_role;

create policy app_config_read on public.app_config for select to anon, authenticated using (true);

create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy entitlements_select_own on public.entitlements for select to authenticated using (user_id = (select auth.uid()));
create policy admin_users_select_own  on public.admin_users  for select to authenticated using (user_id = (select auth.uid()));

create policy saves_select_own on public.game_saves for select to authenticated using (user_id = (select auth.uid()));
create policy saves_insert_own on public.game_saves for insert to authenticated
  with check (user_id = (select auth.uid()) and slot <= private.slot_limit((select auth.uid())));
create policy saves_update_own on public.game_saves for update to authenticated
  using      (user_id = (select auth.uid()) and slot <= private.slot_limit((select auth.uid())))
  with check (user_id = (select auth.uid()) and slot <= private.slot_limit((select auth.uid())));
create policy saves_delete_own on public.game_saves for delete to authenticated using (user_id = (select auth.uid()));

create policy snaps_select_own on public.save_snapshots for select to authenticated using (user_id = (select auth.uid()));
create policy snaps_insert_own on public.save_snapshots for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_premium((select auth.uid())));
create policy snaps_delete_own on public.save_snapshots for delete to authenticated using (user_id = (select auth.uid()));
```
*No `INSERT/UPDATE/DELETE` policy exists for `profiles` (insert comes from the trigger), `entitlements` or `admin_users` — those writes are service-role only. No policy uses `user_metadata`. No policy uses the deprecated `auth.role()`.*

### D.4 `0003_lifecycle.sql` (reference)
```sql
create table public.lifecycle_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(), finished_at timestamptz,
  dry_run boolean not null, candidates integer not null default 0,
  warned_7 integer not null default 0, warned_1 integer not null default 0,
  deleted integer not null default 0, purged_unconfirmed integer not null default 0,
  aborted boolean not null default false, abort_reason text, notes jsonb not null default '{}'::jsonb);
create table public.deletion_log (
  id bigint generated always as identity primary key,
  deleted_at timestamptz not null default now(),
  user_hash text not null,                                    -- sha256(user_id || server pepper) — never email/name
  reason text not null check (reason in ('INACTIVITY','SELF','ADMIN','UNCONFIRMED')),
  days_inactive integer, had_saves boolean not null default false);
alter table public.lifecycle_runs enable row level security;   -- no policies ⇒ clients get nothing
alter table public.deletion_log   enable row level security;
revoke all on public.lifecycle_runs, public.deletion_log from anon, authenticated;
grant all on public.lifecycle_runs, public.deletion_log to service_role;

create function public.retention_candidates(p_min_days integer default 20)
returns table (user_id uuid, last_active_at timestamptz, inactive_since timestamptz, days_inactive integer,
               exempt boolean, exempt_reason text, on_hold boolean, warned_7_at timestamptz, warned_1_at timestamptz)
language sql stable set search_path = '' as $$
  with base as (
    select p.id, p.last_active_at, p.warned_7_at, p.warned_1_at, p.retention_hold_until,
           greatest(p.last_active_at, coalesce(p.exempt_ended_at, p.last_active_at)) as inactive_since
      from public.profiles p)
  select b.id, b.last_active_at, b.inactive_since,
         floor(extract(epoch from (now() - b.inactive_since)) / 86400)::int,
         (a.user_id is not null or private.is_premium(b.id)),
         case when a.user_id is not null then 'ADMIN' when private.is_premium(b.id) then 'PREMIUM' end,
         (b.retention_hold_until is not null and b.retention_hold_until > now()),
         b.warned_7_at, b.warned_1_at
    from base b left join public.admin_users a on a.user_id = b.id
   where b.inactive_since <= now() - make_interval(days => p_min_days) $$;
revoke execute on function public.retention_candidates(integer) from public, anon, authenticated;
grant  execute on function public.retention_candidates(integer) to service_role;   -- PostgREST would otherwise expose it to every role

create function public.get_my_retention() returns jsonb language sql stable set search_path = '' as $$
  with cfg as (select coalesce((select (value->>'inactivity_days')::int from public.app_config where key = 'retention'), 30) as days),
       me  as (select p.last_active_at, p.exempt_ended_at, p.retention_hold_until from public.profiles p where p.id = (select auth.uid())),
       calc as (select cfg.days, greatest(me.last_active_at, coalesce(me.exempt_ended_at, me.last_active_at)) as since,
                       case when private.is_admin((select auth.uid())) then 'ADMIN'
                            when private.is_premium((select auth.uid())) then 'PREMIUM'
                            when me.retention_hold_until > now() then 'HOLD' end as reason
                  from cfg, me)
  select jsonb_build_object('policy_days', days, 'reason', reason, 'exempt', reason is not null, 'inactive_since', since,
           'delete_after', case when reason is null then since + make_interval(days => days) end,
           'days_left',    case when reason is null then greatest(0, days - floor(extract(epoch from (now() - since)) / 86400))::int end)
    from calc $$;
revoke execute on function public.get_my_retention() from public, anon;
grant  execute on function public.get_my_retention() to authenticated;

insert into public.app_config (key, value) values
 ('retention', '{"inactivity_days":30,"warn_days_before":[7,1],"dry_run":true,"max_deletions_per_run":200,"max_deleted_pct":5,"past_due_grace_days":7,"unconfirmed_purge_days":7}'),
 ('limits',    '{"free_slots":1,"premium_slots":3,"premium_snapshots":5,"max_save_bytes":400000}'),
 ('client',    '{"min_version":"2.0.0","maintenance":false,"banner":null}'),
 ('pricing',   '{"monthly":"","yearly":"","note":"display only — Stripe is authoritative"}')
on conflict (key) do nothing;
```
*`past_due_grace_days` and the 3-day period-end slack are mirrored as literals in `private.is_premium`; changing the config value requires a migration that redefines the function (documented in `docs/runbook.md`).*

### D.5 `0004_cron.sql`, `0005`, `0006` (reference)
```sql
-- 0004_cron.sql  — humans create the Vault secrets once per environment (never committed):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<64 random hex chars>', 'cron_secret');     -- same value as the Edge Function secret CRON_SECRET
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('lifecycle-sweep-daily', '0 3 * * *', $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/lifecycle-sweep',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb) as request_id;
$job$);

-- 0005_billing.sql
create table public.stripe_events (id text primary key, type text not null, received_at timestamptz not null default now(), processed_at timestamptz);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;  grant all on public.stripe_events to service_role;

-- 0006_admin.sql
create table public.admin_audit (
  id bigint generated always as identity primary key, at timestamptz not null default now(),
  admin_id uuid references auth.users(id) on delete set null, action text not null,
  target_hash text, details jsonb not null default '{}'::jsonb);
create index admin_audit_at_idx on public.admin_audit (at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;  grant all on public.admin_audit to service_role;
```
```sql
-- tools/bootstrap-admin.sql  (run once in the SQL editor of the target project; replace the placeholder; never commit a real address)
insert into public.admin_users (user_id)
  select id from auth.users where email = '<ADMIN_EMAIL>' on conflict do nothing;
```

### D.6 Edge Functions (`supabase/functions/<name>/index.ts`; shared helpers in `_shared/`)
| Function | `verify_jwt` | Caller | Input → output | Secrets |
|---|---|---|---|---|
| `lifecycle-sweep` | **false** (own `x-cron-secret` check) | `pg_cron` | `{}` → run summary | `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`, `ADMIN_ALERT_EMAIL`, hash pepper, service credentials |
| `stripe-webhook` | **false** (Stripe signature) | Stripe | raw body → `200` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| `create-checkout-session` | true | player | `{ plan }` → `{ url }` | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `SITE_URL` |
| `create-portal-session` | true | player | `{}` → `{ url }` | `STRIPE_SECRET_KEY`, `SITE_URL` |
| `admin-actions` | true (+ admin & `aal2` checks inside) | admin console | `{ action, args }` → `{ ok, data }` | service credentials, hash pepper, `STRIPE_SECRET_KEY` |
| `export-my-data` | true | player | `{}` → JSON bundle | service credentials |
| `delete-my-account` | true | player | `{ confirm:'DELETE' }` → `{ ok }` | service credentials, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, hash pepper |
| `submit-run` *(optional)* | true | player | `{ replay }` → `{ verified, rank }` | service credentials |
`_shared/`: `cors.ts` (allow only `SITE_URL` + local dev origins), `auth.ts` (`requireUser(req)`, `requireAdmin(req)` — verifies the JWT with the Auth server, never trusts decoded claims alone), `json.ts`, `hash.ts` (SHA-256 with pepper), `email.ts` (+ templates), `stripe.ts`, `log.ts` (structured, **no PII, no secrets**). **Service credentials:** use the project's server-side secret key via the environment variable Supabase injects for Edge Functions — confirm the exact variable name in the current docs (keys moved from `anon/service_role` to publishable/secret). Functions never log request bodies containing saves or tokens. `supabase/config.toml` declares `verify_jwt` per function.

### D.7 Capacity & cost notes (planning figures — verify against current plan limits before launch)
Free accounts hold **1 slot**: at ≈ 150–250 KB raw JSON per save and `jsonb` TOAST compression, plan for **≈ 40–80 KB on disk per active free account**. Premium adds up to 2 more slots + 5 snapshots per slot ⇒ budget **≈ 0.5–1 MB** per premium account. The 30-day deletion rule is also the storage-cost control: it bounds the number of dormant accounts. Track `avg save KB` and total DB size on the admin Overview and alert at 70 % of the plan's database limit.

---

## APPENDIX E — CONTENT CATALOGS (NPCs, EVENTS, CONSEQUENCE CHAINS)
> Content is **data** (`RR.data.npcs`, `RR.data.events`) validated by the content lint (§3.11.7 test 21). Numbers here are v2 starting values to be tuned with `RR.sim` and the EV audit (§4.9.5 test 24).

### E.1 NPC roster (14 templates)
| id | Role | Known at start? | Start relationship | How met / lifecycle | Gameplay value (F19 perk) | Bio line (flavour, ≤ 80 chars) |
|---|---|---|---|---|---|---|
| `sibling` | FAMILY | ✔ | +30 | New Game | borrow/help events; never decays | "Always texts first, asks for favours second." |
| `parent` | FAMILY | ✔ | +40 | New Game | gifts, health scares; never decays | "Proud of you, worried about your hours." |
| `boss` | BOSS | ✔ | +10 | New Game | raise / layoff odds (F19) | "Fair, busy, remembers who stays late." |
| `friend` | FRIEND | ✔ | +25 | New Game | tips, weddings, loans, social events | "Knows a guy who knows a guy." |
| `banker` | BANKER | ✔ | +5 | New Game | loan APR spread, emergency-loan threshold | "Calm voice, strict spreadsheets." |
| `agent` | AGENT | ✖ | 0 | met by the first RE DEAL card seen (`NPC_MEET`) | better/worse deal quality weights | "Sells houses, mostly by listening." |
| `mentor` | MENTOR | ✖ | +15 | `np_mentor_intro` (turn ≥ 4) | hints about the market mood | "Retired investor with a notebook." |
| `handyman` | HANDYMAN | ✖ | 0 | first property repair | repair cost multiplier | "Fixes it once, tells you why." |
| `tenant` | TENANT | ✖ | 0 | **one per owned RE asset** (auto) | vacancy odds, rent-raise reaction | per-property flavour |
| `coworker` | FRIEND | ✖ | +10 | `np_coworker_lunch` | social/health small events | "Lunch is a strategy meeting." |
| `neighbor` | FRIEND | ✖ | +10 | `np_neighbor_borrow_tools` | cheap favours, local gossip about prices | "Has a ladder and opinions." |
| `accountant` | ADVISOR | ✖ | +5 | `bk_tax_audit` / `np_advisor_tax_tip` | audit/legal cost multiplier, refund odds | "Finds the deduction you forgot." |
| `rival` | FRIEND | FT only | −5 | on `enterFastTrack` | competitive bets, status events | "Counts your wins as personal losses." |
| `wealth_advisor` | ADVISOR | FT only | +5 | on `enterFastTrack` | FT audit/legal costs, FT deal flow | "Quiet suit, loud network." |
**Rules.** Names come from `rng.npc` using diverse, stereotype-free pools; `lookSeed` is set at creation. NPCs never die; a falling-out sets `LOST` (non-family) and a reconcile event can restore them to `ACTIVE` at −20. FAMILY NPCs can't be `LOST` (at worst they sit at COLD/HOSTILE and refuse favours). Relationship **memory kinds** (`Npc.memory[].kind`): `HELPED`, `IGNORED_ILLNESS`, `DEFAULTED`, `REPAID`, `MISSED_WEDDING`, `GIFTED`, `REFUSED_LOAN`, `BAD_TIP`, `GOOD_TIP`, `PROUD`, `OVERTIME`, `PROMISE_BROKEN`, `FIXED_PROMPTLY`, `EVICTED`.

### E.2 Choice & consequence conventions
- **Every non-forced card offers ≥ 2 options including a decline** (cost-free or relationship-costly) and **never more than 4**.
- A choice must have a *visible price* (cash/health/relationship) **and** a *possible delayed effect* in ≥ 25 % of templates (via `outcomes`, `SCHEDULE`, `SET_FLAG`, or `QUEUE_EVENT`). Delayed effects use **flags** the player can later influence — never pure luck.
- Probabilities may depend on a relationship tier: `outcomes[].pByTier = { role, HOSTILE, COLD, NEUTRAL, FRIENDLY, TRUSTED }` and `SCHEDULE.p` may be the same object. (Shapes are added to §1.12.4.)
- Payload shorthands: `"$x"` = rolled amount · `"TARGET_RENT"` / `"TARGET_VALUE"` = the targeted asset's current rent/value · all money ranges × `inflationIndex` and rounded to $50.
- Reading level ≈ grade 8; body ≤ 280 chars; option label ≤ 48; no real brands, banks, agencies, or public figures; health content is general (flu, burnout, accidents) — never graphic, never mental-health trivialisation, no self-harm content; gambling-like cards are framed as *lessons* with odds hinted; audience 13+.

### E.3 Event catalog — shorthand & phase tags
`$x` rolled amount · **C** cash · **HP** health · **REL(role)** relationship delta · **[H]/[P]** `insurable` HEALTH / PROPERTY · `SCH(a–b, p)` scheduled consequence · `Q(id, a–b)` queue event · `FLAG(x)` · `SH(scope, μΔ, turns[, rate/infl/rent])` market shock · `ASSET(field±)` · `⏱n` = turns · **Sev:** m = MINOR, M = MAJOR, X = CRISIS · **Ph:** P2 / P3 / P4 / P7 = phase that ships it. "Outcome" lists are exclusive results `{p: result}`.

**E.3.1 Health & body (`hl_`, `life_`)**
| ID | Cat·Sev | Ph | Requires / weight mods | Options → effects |
|---|---|---|---|---|
| `hl_flu` | LIFE·m | P2 | ×1.5 if HP < 60 | Rest {SALARY ×0.8 ⏱1; HP −3} · Push through {HP −8; {.25: FLAG sick_leave, REL(boss) −3}} · Urgent care $150–300 [H] {HP −2} |
| `hl_burnout` | LIFE·M | P2 | HP < 45 **or** counter `overtime` ≥ 3 | Take leave {SALARY ×0.5 ⏱2; HP +20; REL(boss) −2} · Push on {HP −10; SCH(1–3, .5) Q(life_hospital)} |
| `hl_gym_offer` | LIFE·m | P2 | HP < 80; no GYM modifier | Join {EXPENSE +45 tag GYM (F17 +1.5/turn); FLAG gym_member} · Not now {} |
| `hl_checkup_reminder` | LIFE·m | P2 | `lastCheckupTurn` ≥ 12 ago | Book $150 [H] {HP +8; {.2: FLAG early_detect}} · Skip {counter skipped_checkup +1} |
| `hl_accident` | LIFE·M | P2 | ×1.3 if HP < 50 | ER $1,500–5,000 [H] {HP −15 then +10} · Urgent care $600–1,200 [H] {{.6: HP −8; .4: HP −8, SCH(2–3,1) Q(hl_complication)}} |
| `hl_complication` | LIFE·M | P2 | queued only | Follow-up care $800–2,000 [H] {HP +5} · Ignore {HP −12; counter neglect +1} |
| `life_hospital` | LIFE·X | P2 | forced at HP 0, or queued | Admitted $4,000–9,000 [H] {SALARY ×0 ⏱2; HP = 35; hospitalizations +1; if FLAG early_detect cost ×0.5} · (if REL(sibling) ≥ NEUTRAL) Ask sibling to help {C +1,000; REL(sibling) −5} |
| `hl_insurance_offer` | LIFE·m | P2 | insurance NONE; turn ≥ 4 | STANDARD {INSURANCE_SET} · COMPREHENSIVE {INSURANCE_SET} · Decline {FLAG declined_insurance} |
| `hl_wellness_retreat` | DOODAD·m | P2 | HP < 70 | Vacation $900 {HP +12; `lastVacationTurn`} · Skip {} |
| `hl_family_illness` | NPC·M | P2 | involves FAMILY | Help with bills $600–1,500 {REL +10; HP −2; memory HELPED} · Visit all weekend {HP −3; REL +6; counter family_support +1} · Send a card {REL +1} · Ignore {REL −8; memory IGNORED_ILLNESS} |
| `hl_chronic_flare` | LIFE·M | P2 | HP < 40 and counter neglect ≥ 2; once per 24 | Treatment plan $80/mo ⏱6 [H] {HP +10 over time} · Manage on your own {HP −6; FLAG neglect_chronic} |
| `hl_sleep_debt` | QUIET | P2 | HP < 65 | Lesson: health ⇄ income link (links to glossary "burnout") |

**E.3.2 People (`np_`)**
| ID | Cat·Sev | Ph | Requires / weight mods | Options → effects |
|---|---|---|---|---|
| `np_mentor_intro` | NPC·m | P2 | turn ≥ 4; mentor not met | Accept coffee {NPC_MEET mentor; REL +10} · Decline {SCH(8–12,1) Q(np_mentor_intro) once} |
| `np_coworker_lunch` | NPC·m | P2 | turn ≥ 3 | Join $25 {NPC_MEET coworker (first time); REL +4; HP +1} · Skip {} |
| `np_neighbor_borrow_tools` | NPC·m | P2 | turn ≥ 6 | Lend {NPC_MEET neighbor; REL +3; {.1: C −60}} · Decline {REL −1} |
| `np_boss_overtime` | NPC·m | P2 | involves BOSS | Accept {INCOME +400 ⏱3; HP −5; REL(boss) +4; counter overtime +1} · Decline {REL(boss) −3} · (BOSS ≥ FRIENDLY) Negotiate {INCOME +600 ⏱3; HP −3} |
| `np_boss_raise_chance` | NPC·M | P2 | BOSS; turn ≥ 10; cooldown 18; weight × `bossRaiseMult` | Ask for a raise {outcomes `pByTier(BOSS)`: H .05 · C .20 · N .35 · F .50 · T .70 → SALARY +4–8%, else REL −2} · Wait for the review {} |
| `np_boss_layoff_rumor` | NPC·M | P2 | BOSS; turn ≥ 12; weight × `bossLayoffMult` | Polish résumé $100 {Q(np_recruiter_call, 2–4)} · Ask your boss directly {FLAG job_secure if tier ≥ FRIENDLY else FLAG layoff_risk} · Ignore {FLAG layoff_risk (downsized ×1.5)} |
| `np_recruiter_call` | NPC·m | P2 | queued / FLAG layoff_risk | Interview {{.4: SALARY +10%, HP −2; .6: nothing}} · Not interested {} |
| `np_friend_wedding` | NPC·m | P2 | involves FRIEND; cooldown 24 | Generous gift $300–600 {REL +6; memory GIFTED} · Modest $100–200 {REL +2} · Skip {REL −4; memory MISSED_WEDDING} |
| `np_friend_borrow` | NPC·M | P2 | involves FRIEND; cash ≥ 1,500 | Lend $1,000–3,000 {C −$x; **visible** SCH(4–8, `pByTier` H .15 · C .30 · N .55 · F .75 · T .85) → C +$x, REL +4, memory REPAID; else REL −12, memory DEFAULTED} · Lend half {same on half} · Refuse politely {REL −4; memory REFUSED_LOAN} |
| `np_family_loan` | NPC·M | P2 | involves sibling; cash ≥ 2,000 | Help $1,500–4,000 {C −$x; **visible** SCH(6–12, .5) → C +$x, REL +4; else REL −6; FLAG family_helped} · Offer $500 {REL +2} · Say no {REL −8} |
| `np_family_gift` | NPC·m | P2 | parent ≥ TRUSTED; turn ≥ 12; cooldown 24 | Accept {C +500–1,500; REL +2} · Decline politely {REL +3; memory PROUD} |
| `np_friend_party_pressure` | DOODAD·m | P2 | involves FRIEND | Join the trip $400–700 {REL +4; HP +2} · Skip {REL −2} |
| `np_friend_invest_tip` | NPC·M | P3 | FRIEND; turn ≥ 10 | **Side bet** $1,000–3,000 {C −$x; SCH(3–6,1) outcomes {.35: C +2.2×$x, REL +4, memory GOOD_TIP; .65: C +0.3×$x, REL −2, memory BAD_TIP}} · Research first {FLAG researched; mentor known ⇒ hint} · Pass {REL −1} |
| `np_falling_out` | NPC·M | P2 | non-family NPC REL ≤ −60 | Apologise {REL +15} · Let it end {NPC_STATUS LOST} |
| `np_reconcile` | NPC·m | P7 | LOST NPC; ⏱ ≥ 12 since | Reach out {NPC_STATUS ACTIVE; REL = −20} · Leave it {} |
| `np_banker_offer` | NPC·m | P3 | BANKER ≥ FRIENDLY; no TERM deposit | Take 12-month promo $2,000+ {DEPOSIT_ADD TERM apyBonus +0.005} · Decline {} |
| `np_banker_review` | NPC·m | P3 | BANKER; credit < 700 | Account review {if emergencyMonths ≥ 2: CREDIT +8, REL +2; else REL +1, lesson toast} |
| `np_agent_offmarket` | NPC·M | P3 | AGENT ≥ FRIENDLY; cooldown 18 | Hear it out {Q(DEAL RE, 1–2) with GREAT weight ×2.5} · Pass {REL −1} |
| `np_mentor_advice` | NPC·m | P3 | MENTOR; cooldown 12 | Listen {FLAG market_hint (accuracy = `mentorAccuracy`); REL +2; toast "Mentor: markets feel <mood>"} |
| `np_handyman_intro` | NPC·m | P3 | first property repair card | Hire him {NPC_MEET handyman; REL +5} · Use a contractor {} |
| `np_advisor_tax_tip` | NPC·m | P3 | turn ≥ 14; cooldown 24 | Hire accountant $200–400 {NPC_MEET accountant (first time); {.7: C +400–1,200 (refund)}} · File alone {} |
| `np_tenant_late_rent` | NPC·M | P3 | involves TENANT | Waive this month {INCOME −`TARGET_RENT` ⏱1; REL(tenant) +8} · Payment plan {INCOME −`TARGET_RENT` ⏱1; SCH(2–3, `pByTier` C .45 · N .70 · F .85 · T .90) → INCOME +`TARGET_RENT`; else REL −10} · Start eviction $1,200–2,500 {vacantTurnsLeft 3; tenant DORMANT; memory EVICTED} |
| `np_tenant_renewal` | NPC·m | P3 | involves TENANT | Raise rent 5% {rentBoost +0.05; leave-risk by tier} · Raise 10% {rentBoost +0.10; higher risk} · Keep rent {REL +4} |
| `np_tenant_complaint` | NPC·m | P3 | TENANT; condition < 60 | Fix now $300–800 {condition +5; REL +5; memory FIXED_PROMPTLY} · Promise later {REL −3; FLAG deferred_<id>} · Ignore {REL −8} |

**E.3.3 Bank, account & credit (`bk_`)**
| ID | Cat·Sev | Ph | Requires / weight mods | Options → effects |
|---|---|---|---|---|
| `bk_phishing_text` | LIFE·m | P2 | — | Tap the link {C −$300–1,200; CREDIT −10} · Delete & report {} · Call the bank {{.7: no loss; .3: C −150}} |
| `bk_identity_theft` | LIFE·M | P2 | turn ≥ 15; once/30 | Freeze credit & report $150 {CREDIT −5; SCH(3–5,1) CREDIT +10} · Ignore it {CREDIT −40; C −900} |
| `bk_bank_error_favor` | LIFE·m | P2 | — | Report it {CREDIT +2} · Keep it {C +300–800; SCH(2–4,.5) C −(amount+50) (reversed + fee)} |
| `bk_subscription_creep` | DOODAD·m | P2 | turn ≥ 8 | Cancel unused ones {LIFESTYLE −25; FLAG audited_subs} · Keep them {} |
| `bk_tax_audit` | LIFE·M | P2 | turn ≥ 20; once | Hire an accountant $300–600 {NPC_MEET accountant; outcomes {.8: clean; .2: C −500–1,500}} · Handle it alone {{.55: clean; .45: C −800–3,000, CREDIT −5}} |
| `bk_low_balance_fee` | LIFE·m | P3 | cash < 500 and no deposit ≥ 500 | (forced) fee {EXPENSE +12 tag BANKFEE until cash ≥ 1,500}; card explains the lesson |
| `bk_term_temptation` | DOODAD·m | P3 | has TERM deposit | Break the term {closeEarly penalty; C −900 gadget} · Stay disciplined {FLAG discipline} |
| `bk_bank_failure_scare` | MARKET·M | P3 | deposits ≥ 1,000 | Withdraw it all {SAVINGS → cash; TERM penalty applies} · Stay put {if Σ balances > insuredLimit: {.3: loss = uninsured × .5}; else gold toast "Your deposits are insured"} |
| `bk_credit_score_jump` | QUIET | P3 | credit ≥ 720 | Lesson: how score changes the APR spread (shows the F-table) |

**E.3.4 Property (`pr_`) — all P3; `ASSET` category; `[P]` = insurable if the targeted asset is `insured`**
| ID | Sev | Requires / weight mods | Options → effects |
|---|---|---|---|
| `pr_roof_leak` | M | owns RE; weight ×2.5 if condition < 40; ×1.6 if FLAG shoddy_<id> | Licensed roofer $1,800–4,500 [P] {condition +15} · Patch it cheaply $400–900 {{.5: condition +5; .5: FLAG shoddy_<id>, SCH(2–4,1) Q(pr_roof_leak)}} · (HANDYMAN known) Ask <name> {cost × `handymanCostMult`} |
| `pr_boiler_fail` | M | owns RE; ×2 if condition < 45 | Replace $2,500–5,500 [P] {condition +10} · Repair $800–1,500 {{.6: holds; .4: SCH(2–3,1) Q(pr_boiler_fail)}} |
| `pr_storm_damage` | X | owns RE; rare (weight ×0.6) | File claim & repair $4,000–12,000 [P] {vacant 2; condition +10} · Partial repair $1,500–3,000 {vacant 3; condition +5; FLAG shoddy_<id>} |
| `pr_tenant_damage` | M | involves TENANT | Full renovation $2,000–5,000 {condition +12; vacant 1–2} · Cosmetic fix $600–1,200 {condition +4} |
| `pr_tenant_vacancy` | M | involves TENANT; weight × `tenantVacancyMult` | Advertise $300–600 {vacant 1–2} · Lower rent 5% to fill {vacant 1; rentBoost −0.05} · Wait {vacant 3–4} |
| `pr_property_tax_hike` | m | owns RE | Pay it {EXPENSE +40–120/mo permanent} · Appeal $200–400 {{.4: half the increase; .6: full increase}} |
| `pr_code_inspection` | M | owns RE; condition < 60 (tag NEGLECT) | Fix the violations $500–2,500 {condition +10} · Contest {{.3: dismissed; .7: fine doubled}} — *not insurable* |
| `pr_inspection_pass` | QUIET | owns RE; condition ≥ 60 | Gold toast "Your upkeep paid off" (+REL(handyman) if known) |
| `pr_hoa_assessment` | M | owns CONDO | Pay $1,500–4,000 (CASH_OR_CARD) · Dispute {{.35: waived half; .65: pay + legal $300}} |
| `pr_zoning_change` | M | owns RE; turn ≥ 24 | Apply to convert $2,000 {{.4: rentBoost +0.15; .6: denied}} · Hold {} |
| `pr_contractor_upsell` | m | owns RE; condition < 70 | Full upgrade $6,000–10,000 {condition +35} · Basic $1,500 {condition +10} · Decline {} |
| `pr_curb_appeal` | m | owns RE | Invest $1,500–3,000 {rentBoost +0.05; condition +5} · Skip {} |
| `pr_neighborhood_upgrade` | MARKET·m | owns RE | (forced) {SH(RE, +0.06, 6, rent +0.02)} tag PRICES |

**E.3.5 Business (`bz_`) — all P3**
| ID | Sev | Requires / weight mods | Options → effects |
|---|---|---|---|
| `bz_equipment_breakdown` | M | owns BIZ; ×2 if condition < 45 | Repair now $1,200–3,500 [P] {closed 1; condition +12} · Delay {closed 2; {.4: condition −10}} |
| `bz_supplier_price` | m | owns BIZ | Absorb it {revenueIndex ×0.97} · Raise prices {{.6: ×1.03; .4: ×0.93}} |
| `bz_viral_moment` | m | owns BIZ | Capitalise with ads $500–1,500 {{.6: ×1.15; .4: ×1.04}} · Coast {×1.05} |
| `bz_health_inspection` | M | owns BIZ; condition < 60 (NEGLECT) | Pay fine $500–1,500 {closed 1–2} · Fix & re-inspect $1,200 {closed 1; condition +10} |
| `bz_key_employee_quits` | M | owns BIZ | Counter-offer {EXPENSE +300/mo permanent} · Replace {closed 1; ×0.97} |
| `bz_competitor_opens` | M | owns BIZ | Match prices {×0.96} · Differentiate $1,000–2,500 {{.55: ×1.02; .45: ×0.90}} · Ignore {×0.92} |
| `bz_new_contract` | m | owns BIZ; ADVISOR/AGENT ≥ FRIENDLY ×1.5 | Sign it {×1.10; condition −5} · Pass {} |

**E.3.6 Markets & prices (`mk_`) — all P3 unless noted; MARKET category; shocks use the §1.12.3 fields**
| ID | Sev | Requires / weight mods | Effect / options |
|---|---|---|---|
| `mk_inflation_spike` | M | any; ×1.5 in EXPANSION late | (forced shock) `SH(ALL, −0.05, 8, infl +0.025)` · Options on the card: Tighten the budget {LIFESTYLE −60} · Hope it passes {} |
| `mk_deflation_scare` | m | RECESSION | `SH(ALL, 0, 8, infl −0.02)`; lesson on rates |
| `mk_rate_hike` | M | PEAK ×1.5 | `SH(RE, −0.04, 6, rate +0.01)` · Options: Lock a 12-month term deposit now {DEPOSIT_ADD TERM} · Do nothing |
| `mk_rate_cut` | m | RECESSION/RECOVERY ×1.5 | `SH(RE, +0.03, 6, rate −0.01)` · Options: Refinance lesson card (stub text) · Do nothing |
| `mk_housing_boom` | m | EXPANSION | `SH(RE, +0.06, 8, rent +0.02)` |
| `mk_housing_slump` | M | PEAK/RECESSION | `SH(RE, −0.08, 8)` |
| `mk_tech_boom` | m | — | `SH(SECTOR:TECH, +0.20, 6)` |
| `mk_tech_crash` | M | — | `SH(SECTOR:TECH, −0.35, 5)` + `SH(SECTOR:SPECULATIVE, −0.25, 5)` |
| `mk_energy_spike` | M | — | `SH(SECTOR:ENERGY, +0.20, 4)` + EXPENSE +40 ⏱4 · Options: Carpool {EXPENSE +20 ⏱4; REL(coworker) +2} · Pay up {} |
| `mk_grocery_prices` | m | inflation > 0.04 | Switch to store brands {LIFESTYLE +10} · Keep your habits {LIFESTYLE +40} |
| `mk_wage_growth` | m | inflation > 0.04 | (forced) cost-of-living adjustment {SALARY +2–3%; weight × `bossRaiseMult`} |
| `mk_credit_crunch` | X | RECESSION ×1.5 | `CREDIT_CALL 25–50%` of BANK_LOAN principal; options: Pay from cash · Sell assets (opens Portfolio) |
| `mk_recession_onset` | X | PEAK→RECESSION transition | `SH(ALL, −0.20, 5)` (v1) |
| `mk_bull_run` | m | RECOVERY | `SH(ALL, +0.15, 6)` |
| `mk_dividend_change` | m | holds a dividend stock | `STOCK_MOD dpsAnnual ±10–30%` |

**E.3.7 Portfolio (`pf_`) — all P3**
| ID | Cat·Sev | Requires | Effect / options |
|---|---|---|---|
| `pf_earnings_miss` | MARKET·m | holds a stock | (forced) `STOCK_PRICE_MULT HELD_RANDOM ×0.82` + lesson |
| `pf_earnings_beat` | MARKET·m | holds a stock | (forced) `STOCK_PRICE_MULT HELD_RANDOM ×1.15` |
| `pf_stock_split` | MARKET·m | holds a stock priced ≥ $60 | (forced) `STOCK_SPLIT 2` + lesson "value unchanged" |
| `pf_special_dividend` | MARKET·m | monthly dividends > 0 | (forced) C + 1 month of dividends |
| `pf_scam_stock_email` | LIFE·m | cash ≥ 1,000; weight ×2 if FLAG gullible | Ignore · Invest $500–1,500 {{.9: C total loss; .1: ×1.5 back later}; FLAG gullible} · Report it {FLAG savvy (scam weight ×0.5)} |
| `pf_meme_rally` | MARKET·M | SPKL exists | (forced) `STOCK_PRICE_MULT SPKL ×1.8` + `Q(pf_meme_crash, 2–3)` |
| `pf_meme_crash` | MARKET·M | queued | (forced) `STOCK_PRICE_MULT SPKL ×0.40`; lesson card |
| `pf_sector_rotation` | MARKET·m | — | `SH(SECTOR:UTILITIES, +0.08, 5)` + `SH(SECTOR:TECH, −0.06, 5)` |

**E.3.8 Work, money habits & lessons (`jb_`, `ql_`)**
| ID | Cat·Sev | Ph | Requires | Options → effects |
|---|---|---|---|---|
| `jb_promotion_stress` | LIFE·M | P2 | BOSS ≥ NEUTRAL; turn ≥ 14; once/24 | Accept {SALARY +8–12%; HP −4; counter overtime +1} · Decline {REL(boss) −2} |
| `jb_training_course` | LIFE·m | P2 | turn ≥ 8 | Enrol $600–1,200 {{.7: SALARY +3%; .3: nothing}} · Skip {} |
| `jb_commute_change` | LIFE·m | P2 | turn ≥ 10 | Move closer {LIFESTYLE +60; HP +2} · Stay put {} |
| `jb_holiday_bonus` | LIFE·m | P2 | month = Dec | (forced) C +500–1,500 × `bossRaiseMult` |
| `jb_car_trouble` | DOODAD·M | P2 | forced | Mechanic $900–1,400 · (neighbor/handyman known) Ask for a favour {cost ×0.7; REL +3} |
| `ql_emergency_fund` | QUIET | P2 | emergencyMonths < 1 | Lesson: 3-month buffer; links glossary |
| `ql_insurance` | QUIET | P2 | insurance NONE; turn ≥ 6 | Lesson: expected cost vs. catastrophe |
| `ql_compounding` | QUIET | P2 | has deposit | Lesson: interest & compounding |
| `ql_inflation` | QUIET | P3 | inflation > 0.04 | Lesson: real vs nominal |
| `ql_diversification` | QUIET | P3 | ≥ 70 % of stocks in one holding | Lesson: concentration risk |
| `ql_relationships` | QUIET | P2 | any NPC ≥ TRUSTED | Lesson: relationships as capital |

**E.3.9 Fast Track life layer (P4)**
| ID | Cat·Sev | Effect / options (money ×`dealScale` via `scalable`) |
|---|---|---|
| `ft_hl_executive_burnout` | LIFE·M | Delegate {C −$20k; HP +15; REL(advisor) +3} · Power through {HP −12; {.4: Q(life_hospital)}} |
| `ft_hl_private_physician` | LIFE·m | Retainer $60k/yr (EXPENSE) {HP +1/turn; hospital cost ×0.5} · Skip |
| `ft_np_rival_bet` | NPC·M | Accept a public bet {C −$x; outcomes {.5: C +2×$x, REL(rival) −5; .5: nothing back, REL(rival) +3}} · Decline {REL −2} |
| `ft_np_advisor_conflict` | NPC·M | Follow advice {outcomes by tier} · Overrule {FLAG overruled; REL −4} |
| `ft_np_foundation_gala` | DOODAD·m | Sponsor $50k {REL(all) +2; FLAG philanthropist} · Skip |
| `ft_np_journalist` | NPC·m | Give an interview {{.6: REL(all) +2 ; .4: FLAG bad_press (lawsuit weight ×1.5)}} · Decline |
| `ft_pr_portfolio_audit` | ASSET·M | Full audit $30k {inspect all; condition +5 all} · Spot-check {inspect 1} |
| `ft_bz_union_strike` | ASSET·M | Negotiate {EXPENSE +$8k/mo; revenueIndex ×1.0} · Hold firm {closed 2; revenueIndex ×0.9} |
| `ft_mk_currency_shock` | MARKET·M | `SH(ALL, −0.12, 4)` + `SH(RE, −0.04, 4)` |
| `ft_mk_ipo_window` | MARKET·m | Windfall {C +$x} (v1 "windfall IPO" retained) |

**E.3.10 Phase-7 growth pack (P7 — ≥ 24 more templates; same conventions)**
`p7_holiday_season` (Dec: DOODAD gifts vs. budget) · `p7_tax_season` (Mar–Apr: refund vs. owe, accountant perk) · `p7_summer_slump` (Jul–Aug: BIZ revenue ×0.95 ⏱2) · `p7_back_to_school` (children cost spike) · `p7_garage_sale` (+C, −clutter flavour) · `p7_roommate` (INCOME +400, REL risk) · `p7_jury_duty` (SALARY ×0.7 ⏱2) · `p7_lottery_temptation` (low-odds lesson; odds shown) · `p7_crowdfund_friend` (small loan variant) · `p7_charity_drive` (REL(community)+, FLAG generous) · `p7_pet_adoption` (EXPENSE +60, HP +2) · `p7_marathon` (HP +6, gear cost) · `p7_flat_tire` (small forced cost, neighbour favour) · `p7_power_outage` (food spoilage −$120, insured?) · `p7_stolen_phone` ([H]-like cost, CREDIT risk if ignored) · `p7_gig_economy` (INCOME +300 ⏱4, HP −3) · `p7_certification` (SALARY +4% after 3 turns, cost) · `p7_relocation_offer` (SALARY +15%, LIFESTYLE +120, REL(all) −3) · `p7_estate_executor` (inheritance with a family-REL choice) · `p7_reunion` (REL boost, small cost) · `p7_neighbour_dispute` (REL(neighbor) choices) · `p7_mentor_milestone` (mentor gift: glossary unlock) · `p7_anniversary` (turn 12/24/36 recap toast with stats) · `p7_reconcile_arc` (extends `np_reconcile`).

### E.4 Story arcs (multi-step choices & consequences — authored as linked templates using FLAG / SCHEDULE / Q)
| Arc | Steps (→ branches) | Flags / memory | Payoff | Teaching goal |
|---|---|---|---|---|
| **The Borrower** | `np_friend_borrow` → Lend ⇒ visible consequence → *repaid* (REL +4, REPAID) **or** *defaulted* (REL −12, DEFAULTED) → if REL ≤ −60 `np_falling_out` → later `np_reconcile` | `lent_<npc>` | A friend can be lost over money; relationship tier changes banker/boss-style perks only for the roles that have them | Lending to friends = a gift you hope to get back |
| **Burnout Spiral** | `hl_flu` (Push through) → counter `overtime`≥3 → `hl_burnout` → (Push on) `life_hospital` queued; (Take leave) recovery | `neglect`, `sick_leave` | Early rest costs 1–2 months of 20–50 % pay; ignoring costs a CRISIS and 2 months of zero pay | Health is an income asset |
| **Leaky Roof** | `pr_roof_leak` (Patch cheaply) → `shoddy_<id>` → repeat leak (×1.6) → low condition → `pr_code_inspection` fine → `pr_contractor_upsell` | `shoddy_<id>`, `deferred_<id>` | Cheap fixes can cost more than proper ones; maintenance plans pay back | Deferred maintenance compounds |
| **Rate Cycle** | `mk_rate_hike` → (Lock term deposit) → `mk_rate_cut` → locked APY beats market (gold toast) *or* regret flag if skipped | `locked_rate` | Interest income + mortgage cost lessons | Rates move; locking is a bet |
| **Hot Tip** | `np_friend_invest_tip` → side bet resolves → (loss) `BAD_TIP`, friend REL −2 → `pf_scam_stock_email` weight ×2 (FLAG gullible) / (research first) savvy path | `researched`, `gullible`, `savvy` | Impulsive bets raise future scam exposure; research lowers it | Evaluating tips, fraud awareness |
| **The Tenant** | `np_tenant_late_rent` → Waive / Payment plan / Evict → (Payment plan, TRUSTED) repaid → `np_tenant_renewal` ⇒ stable income; (evict) vacancy → new tenant NPC | `tenant_trust_<id>` | Relationships with tenants change vacancy odds and rent-raise success (F19) | Landlording is a people business |
**Arc authoring rule:** every arc must have (a) ≥ 1 branch that is *worse in the short term but better later*, (b) ≥ 1 branch that is *tempting but costly later*, and (c) a visible summary line in the Journal and the end-of-game recap.

### E.5 Content QA checklist (per template; the lint enforces the mechanical parts)
☐ tags/severity/art set · ☐ every cost visible on its option · ☐ decline option present (non-forced) · ☐ phase tag and `phaseRequired` correct · ☐ no real brands/agencies/people · ☐ no stereotyping in names/bios/outcomes · ☐ reading level ≤ grade 8 · ☐ NPC reactions consistent with tier · ☐ delayed effects use flags/consequences (never silent) · ☐ EV impact estimated in the audit sheet (`docs/event-ev.md`).

---

## APPENDIX F — GRAPHICS, ICONS, SCENES, AVATARS, FX & AUDIO SPEC
### F.1 Art direction
Glass-morphism UI (§1.3) with **flat, friendly vector illustration**: soft gradients, rounded geometry, 2 px (24 px grid, 1.75 stroke) line icons, limited palette from `tokens.css`; mood = optimistic-financial-literacy, not casino. **Everything is SVG delivered as JS strings or inline markup** (works from `file://`, scales on the 1920×1080 stage, no network, no raster except the OG image and apple-touch icon generated by `tools/`). Each asset uses CSS variables for colour so mode theming (Rat Race / Fast Track / Premium themes) re-tints it. All meaningful art has an accessible name (`aria-label` / adjacent text); decorative art is `aria-hidden`. Provenance of every asset (original, commissioned, CC0, or AI-assisted with review) is recorded in `docs/credits.md` — **no copyrighted characters, logos, or real-brand imitation** (R-art).

### F.2 Icon set (`RR.data.iconSprite`, ids `ic_*`)
**Tier A — must exist in Phase 1 (simple geometric shapes are acceptable; final art in Phase 7):**
*Money & finance:* `cash wallet card coins piggy bank receipt tax percent chart_up chart_down trend_flat dividend interest loan mortgage credit_card lock` ·
*Assets:* `house building store truck cart stock briefcase key` ·
*Life & health:* `heart heart_pulse hospital pill dumbbell baby gift plane phone laptop wrench roof droplet flame storm bolt` ·
*People:* `user users handshake chat phone_call lunch` ·
*Market & status:* `globe inflation rate_up rate_down news bell shield warning crown star trophy` ·
*UI:* `close check info help settings sound_on sound_off cloud cloud_off cloud_sync wifi_off alert menu chevron_up chevron_down chevron_left chevron_right plus minus book journal clock calendar search download upload trash edit eye eye_off logout mail google admin`
**Tier B — added by Phase 7 (≥ 90 total):** `duplex condo commercial laundromat food_truck car_wash daycare vending online_store boss mentor tenant agent sleep tv shoe hammer family party car student lightbulb target hourglass pet scale compass calculator lens filter sort pin flag lifebuoy`.
Rules: 24×24 viewBox, `currentColor` strokes, no fixed colours; sprite ≤ 60 KB; `RR.ui.icon` falls back to `ic_help` for unknown ids.

### F.3 Scene backdrops (`RR.ui.scene.render(id, {palette,w,h})`)
**Tier A (Phase 1, 12):** `scene_office` · `scene_hospital` · `scene_home_interior` · `scene_street_house` · `scene_storm_house` · `scene_bank_lobby` · `scene_market_floor` · `scene_cafe` · `scene_wedding` · `scene_garage` · `scene_apartment_block` · `scene_news_desk`.
**Tier B (Phase 7, +8):** `scene_gym` · `scene_laundromat` · `scene_legal_office` · `scene_phone_scam` · `scene_park_walk` · `scene_boardroom` (FT) · `scene_yacht` (FT) · `scene_gala` (FT).
Each scene = layered parametric SVG (sky/background gradient from category colour, 2–4 silhouette layers, 0–2 accent props), ≤ 6 KB of code, legible at 480×270 and 1,920×1,080. Category tint: DEAL cyan · DOODAD amber · LIFE violet · MARKET blue · QUIET grey · NPC pink · ASSET orange (always with the category icon/label — never colour alone).

### F.4 Avatars (`RR.ui.avatar.render(lookSeed, {size, role})`)
Layer order: background → body/outfit → head/skin → hair-back → face (eyes, brows, mouth) → hair-front → accessory. Parts: skin ×6 (×8 in Phase 7), hair ×10 (×14), hair colour ×8, outfit ×10 per role family (×16), accessory ×6 (×10), background ×6 (×8). Selection uses a local mulberry32 seeded by `lookSeed` (never `RR.rng`) so avatars cannot disturb game determinism. **Diversity rules:** skin tones span a wide range with equal weight; outfits and accessories are role-driven, not demographic-driven; no caricature features. Premium cosmetics (Phase 6) add extra parts. Accessible name: "Portrait of <name>, <role>".

### F.5 Brand & marketing placeholders
`assets/brand/logo.svg` (wordmark + mark: a stylised rat silhouette running toward a golden door — original artwork), `favicon.svg`, `apple-touch-icon.png` (180 px, generated), `og-image.png` (1200×630, generated by `tools/`), `manifest.webmanifest` (name, icons, `display: standalone`, theme colours — optional PWA shell; **no service worker** until the owner decides, to avoid cache-staleness bugs).

### F.6 Motion & FX catalogue (all respect `animations`, `reducedFx`, `prefers-reduced-motion`)
number tween (400 ms) · delta flash (600 ms) · toast slide (200 ms) · modal fade/scale (200 ms) · phase-stepper pulse · coin burst (on cash gain ≥ $1,000; cosmetic, `Math.random` allowed) · shake (CRISIS, once, 300 ms) · confetti (milestones, 1.2 s) · meter fill (300 ms) · mode-swap theme transition (600 ms, colour only). Reduced-motion mode replaces motion with instant state changes plus a brief outline highlight.

### F.7 Procedural audio (`RR.audio`, Phase 7; off by default)
Synthesised with WebAudio (no files): `coin` (two quick triangle blips, 90 ms) · `success` (major third arpeggio, 250 ms) · `error` (low square buzz, 180 ms) · `crisis` (descending saw sting, 500 ms) · `levelup` (rising arpeggio, 500 ms) · optional ambient pad loop (very low volume, user-started). Master volume + mute persisted in `rr.settings.v1`; created only after a user gesture.

### F.8 Budgets
Icon sprite ≤ 60 KB · scenes ≤ 80 KB · avatar code ≤ 40 KB · CSS ≤ 70 KB · game JS (excluding vendor) ≤ 450 KB uncompressed · first load ≤ 600 KB gzip excluding `vendor/`.

---

## APPENDIX G — REPOSITORY, NETLIFY, GITHUB & CI/CD
### G.1 Repository layout (GitHub)
```
/ (repo root)
├─ public/                       ← Netlify publish dir (the deployed game)
│  ├─ index.html · 404.html · privacy.html · terms.html · credits.html · data-deletion.html
│  ├─ config/env.js              (public values only: Supabase URL, publishable key, CAPTCHA site key, site URL)
│  ├─ css/  tokens.css base.css glass.css ledger.css modes.css …
│  ├─ js/   00-namespace.js … 90-app.js          (numeric filename order = load order)
│  ├─ vendor/ supabase.js · VERSION.txt · LICENSE
│  ├─ assets/ brand/ icons/ scenes/ avatars/
│  └─ admin/ index.html · 60-admin.js
├─ dev/                          ← NOT deployed: tests.html, sim.html, lint-content.html, tests/*.js, fakes/fake-supabase.js
├─ supabase/ config.toml · migrations/ · functions/ (+ _shared/) · tests/ (pgTAP / SQL) · seed.sql (non-secret)
├─ tools/                        ← dev-only Node scripts: build-icons.mjs · build-scenes.mjs · scan-secrets.mjs · bump-version.mjs · bootstrap-admin.sql (template)
├─ docs/                         ← MASTER_PLAN (this file) · supabase-setup.md · runbook.md · security.md · a11y.md · event-ev.md · e2e-phase5.md · credits.md · email-templates/
├─ .github/ workflows/ci.yml · deploy-prod.yml · dependabot.yml · CODEOWNERS · pull_request_template.md
├─ netlify.toml · package.json (dev tools only) · package-lock.json · .gitignore · README.md · LICENSE
```
**Offline run:** double-click `public/index.html` (R1/A2/A15). `dev/*.html` load `../public/js/*`.
`.gitignore` must exclude `.env*`, `supabase/.temp`, `*.local`, `node_modules`, any file containing keys.

### G.2 Branching, review & release
`main` = production · `develop` = staging (Netlify branch deploy + Supabase **dev**) · feature branches → PR → required checks + 1 review (CODEOWNERS for `supabase/**`, `public/admin/**`, `netlify.toml`, `.github/**`) · squash merge · **releases are tags `vMAJOR.MINOR.PATCH`**; prod migrations and function deploys run from the tag workflow behind a manual approval environment. Branch protection: no force-push, linear history, require status checks, require up-to-date branch. Enable GitHub **secret scanning + push protection** and Dependabot (actions + npm tools). Commit messages: `phase5: add RR.sync reconcile` style.

### G.3 `netlify.toml` (reference — replace placeholders; verify against current Netlify docs)
```toml
[build]
  publish = "public"          # no build command: the site is static

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    Content-Security-Policy = "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://<PROD_REF>.supabase.co https://<DEV_REF>.supabase.co; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"

[[headers]]
  for = "/admin/*"
  [headers.values]
    Cache-Control = "no-store"
    X-Robots-Tag = "noindex, nofollow"
    Cross-Origin-Opener-Policy = "same-origin"
```
Notes: (1) No inline scripts and no inline `<style>`/`style=""` in HTML — dynamic styles are set from JS (`el.style.width`), which CSP allows; this is a **hard authoring rule** for all UI code. (2) The CAPTCHA provider's script/frame hosts must match the chosen provider (Turnstile shown). (3) Premium checkout is a **top-level redirect** to Stripe — no Stripe scripts in the game page. (4) Because assets are not content-hashed (no build step), `index.html` loads scripts with `?v=<RR.config.version>` (maintained by `tools/bump-version.mjs`) and relies on Netlify's revalidation. (5) Deploy previews/branch deploys point at the **dev** Supabase project via `config/env.js` hostname rules (§1.12.1).

### G.4 CI (`.github/workflows/ci.yml`) — required checks on every PR
| Job | What it runs |
|---|---|
| `content-lint` | headless Chromium (Playwright via `npx`, dev-only) opens `dev/lint-content.html`; passes when `document.title === 'LINT PASS'` |
| `unit-tests` | opens `dev/tests.html` headless; fails on any FAIL row or console error |
| `sim-smoke` | `dev/sim.html` with 20 seeds per policy; asserts report sanity (§5.10.3) |
| `determinism` | two seeded full runs → byte-identical |
| `secrets-scan` | `node tools/scan-secrets.mjs public/ supabase/` (patterns: service/secret keys, Stripe keys, webhook secrets, private keys) + GitHub push protection |
| `a11y-static` | no `innerHTML`/`insertAdjacentHTML` with non-literal data; no inline script/style; icons referenced exist |
| `sql-tests` | `supabase start` (local stack) → `supabase test db` → `supabase db advisors` (CLI ≥ v2.81.3; otherwise MCP/Studio) → fail on errors |
| `functions-tests` | `deno test` for `supabase/functions/**` with fakes |
| `migrations-check` | `supabase db push --dry-run` against **dev**; no destructive statements without a `-- ALLOW-DESTRUCTIVE` comment reviewed by CODEOWNERS |
**Deploy:** merge to `develop` → Netlify branch deploy + `supabase db push` + `functions deploy` to **dev** (scoped token). Tag `v*` → `deploy-prod.yml` (environment approval) → prod migrations → prod functions → Netlify publishes `main`. **CI credentials:** a *scoped* Supabase personal access token (limited to the needed projects/permissions — never the browser-login classic token), DB passwords as GitHub environment secrets, pinned action versions (full SHA), lockfile for dev tools.

### G.5 Where each secret lives
| Secret / value | Lives in | Never in |
|---|---|---|
| Supabase URL, publishable key, CAPTCHA **site** key, site URL | `public/config/env.js` (public by design) | — |
| Supabase secret/service credential | Edge Function runtime env (injected by Supabase) | repo, `public/`, Netlify, browser |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price ids | Supabase function secrets (`supabase secrets set`) | repo, GitHub variables |
| `RESEND_API_KEY` / SMTP creds, `CRON_SECRET`, hash pepper | Supabase function secrets (+ SMTP creds in Auth settings; `cron_secret` also in Vault) | repo |
| `project_url`, `cron_secret` | Supabase Vault (created via SQL by the human) | migrations |
| CI token, DB passwords | GitHub environment secrets | repo, logs |

---

## APPENDIX H — THREAT REGISTER (each row needs a test, lint, or documented control by Phase 8)
| ID | Threat | Control | Verified by |
|---|---|---|---|
| H-1 | Cross-user data access (BOLA/IDOR) | RLS on every table; `TO authenticated` + ownership predicates with `(select auth.uid())`; explicit grants | §6.9 tests 1–2, 9 |
| H-2 | Privilege escalation via profile columns (e.g., faking activity to dodge deletion) | column-level `UPDATE` grants + `profiles_guard` trigger forcing `last_active_at = now()` | §6.9 test 5 |
| H-3 | Entitlement tampering (client claims Premium) | no client write path; Stripe/admin functions only; slot policy reads `entitlements` | §6.9 tests 3, 6; §7.8 test 4 |
| H-4 | XSS via untrusted strings (display names, NPC names, cloud/imported saves, labels) | `textContent` only; `schema.validate` on all imported/cloud states; strict CSP; static lint | §2.8.7 test 18; §6.9 test 13; §9.2 test 3 |
| H-5 | Secret leakage | R14; secrets only in function secrets/Vault/GitHub env; scanner + push protection | §6.9 test 16; CI `secrets-scan` |
| H-6 | Account takeover / credential stuffing / signup spam | CAPTCHA, rate limits, password ≥ 10, leaked-password protection (if available), email confirmation, generic error text, admin MFA | §6.9 test 14; §9.2 test 7 |
| H-7 | OAuth redirect abuse | exact redirect allow-list, PKCE, Google client restricted to the Supabase callback | `docs/supabase-setup.md` checklist |
| H-8 | Stripe webhook forgery/replay | signature on raw body, `stripe_events` idempotency, re-fetch truth | §7.8 test 4 |
| H-9 | Abuse of the cron endpoint | `x-cron-secret`, no JWT-less public behaviour, dry-run default | §7.8 test 3 |
| H-10 | Mass-deletion bug | circuit breaker, per-user re-check, ≥ 20 h after final warning, dry-run launch gate L-1, audit log, backups | §7.8 tests 1–2, 12 |
| H-11 | Admin console compromise | `admin_users` + `aal2` checked server-side, audited actions, idle timeout, no admin promotion in UI, `noindex`/`no-store` | §7.8 tests 6, 11 |
| H-12 | Storage/cost abuse (huge or rapid saves) | size trigger, ≥ 3 s write-rate trigger, quotas, alerts, retention | §6.9 test 7; §9.2 test 7 |
| H-13 | Save tampering for rankings | no competitive surface unless `submit-run` replay verification exists | §9.2 test 8 |
| H-14 | Supply chain (SDK, actions, tools) | pinned/vendored SDK with checksum, lockfiles, SHA-pinned actions, Dependabot | CI + `vendor/VERSION.txt` |
| H-15 | Privacy/legal exposure (minors, retention, backups) | 13+ gate, consent stamps, export/delete, retention + backup disclosures, minimal data | §7.8 test 7; legal pages (HC-9) |
| H-16 | Clickjacking / MIME sniffing | `frame-ancestors 'none'`, `nosniff` | §9.2 test 3 |
| H-17 | Local data exposure on shared devices | account-switch prompt, *Remove this game from this device*, Guest warning | §6.9 test 14 |
| H-18 | **IP/trademark exposure of game terms** — "Rat Race", "Fast Track", "Doodads" and the Dream goal closely mirror a well-known commercial board game's vocabulary | owner decision J-10 before public launch: rename or obtain advice; keep mechanics original (they are) | owner sign-off in Handoff Log |

---

## APPENDIX I — HUMAN SETUP CHECKLIST (the AI cannot do these; it asks, then records the result in §10)
| ID | Task | Needed by |
|---|---|---|
| **HC-1** | Create the GitHub repo; enable branch protection (PR + required checks, no force-push); enable secret scanning + push protection and Dependabot; add CI secrets (scoped Supabase token, DB passwords, project refs) | Phase 5 |
| **HC-2** | Netlify: new site from the repo; publish dir `public`, **no build command**; production branch `main`; deploy previews + `develop` branch deploy on; custom domain + HTTPS; confirm headers from `netlify.toml` are served | Phase 5 |
| **HC-3** | Supabase: create **dev** and **prod** projects (region near players); note URL + publishable key into `config/env.js`; keep explicit-grant migrations (don't rely on auto-exposure of tables); enable backups/PITR on prod if the plan allows; create a **scoped** access token for CI | Phase 5 |
| **HC-4** | Google Cloud: OAuth consent screen + **Web application** OAuth client; add each Supabase project's `…/auth/v1/callback` as an authorised redirect URI; paste client ID/secret into the Supabase Google provider; move the consent screen to production when ready | Phase 5 |
| **HC-5** | Email: choose a provider (Resend/Postmark/SES…), verify the sending domain (SPF, DKIM, DMARC), configure **custom SMTP** in Supabase Auth, paste branded templates from `docs/email-templates/` | Phase 5 |
| **HC-6** | CAPTCHA: create a Turnstile (or hCaptcha) site; put the secret in Supabase Auth settings and the **site** key in `env.js`; match the CSP hosts | Phase 5 |
| **HC-7** | Stripe: product *Rat Race Premium* with monthly + yearly prices; webhook endpoint `…/functions/v1/stripe-webhook` with the events listed in §7.4; Customer Portal configuration; tax settings (J-3) | Phase 6 |
| **HC-8** | Secrets: `supabase secrets set` for every value in Appendix D.6; create Vault secrets `project_url`, `cron_secret`; set `ADMIN_ALERT_EMAIL`, `EMAIL_FROM`, `SITE_URL` | Phase 6 |
| **HC-9** | Legal: review Privacy Policy, Terms, retention wording (30 days, exemptions, deletion path, backups, Stripe retention); decide age threshold (J-7) | Phase 6/8 |
| **HC-10** | First admin: sign up normally, enrol TOTP, then run `tools/bootstrap-admin.sql` with your email in the SQL editor | Phase 6 |
| **HC-11** | Alerts & limits: Supabase/Netlify/Stripe spend alerts; Supabase log/alert routing; confirm project **pausing** behaviour for the chosen plan (a paused project also pauses `pg_cron`) | Phase 8 |
| **HC-12** | Dry-run review: inspect ≥ 14 days of `lifecycle_runs` in prod, then flip `retention.dry_run` via the admin console | Phase 8 (gate L-1) |

---

## APPENDIX J — OPEN DECISIONS FOR THE OWNER (defaults chosen so work can proceed)
| ID | Question | Default used in this plan |
|---|---|---|
| J-1 | Will many players be on **phones**? The plan is desktop-first (≥ 900 px). | Desktop-first; add a portrait layout as Phase 9 if yes |
| J-2 | "Google Play" — Google **sign-in** (OAuth) or Google **Play Billing / Play Games** in an Android app? | Google sign-in via Supabase Auth; Play Billing parked (Appendix B) |
| J-3 | Payments: Stripe vs a merchant-of-record provider (handles VAT/sales tax); prices; refund policy | Stripe Checkout + Portal; provider-agnostic `entitlements.source` |
| J-4 | Leaderboard / competitive play? | **No** at launch (optional Step 8.8) |
| J-5 | Client error reporting: self-hosted table vs third-party tool | Optional table, authenticated users only |
| J-6 | Retention details: warnings at day 23 & 29; clock restarts when premium/admin exemption ends; `past_due` counts as exempt for 7 days | As written in §7.2 |
| J-7 | Minimum age (13+ vs 16+ in some regions) and legal entity/jurisdiction | 13+ or local digital-consent age, with a checkbox |
| J-8 | Supabase plan, region, backup tier, cost ceiling; confirm inactivity-pause behaviour of the plan | Dev on a low tier; prod on a tier with backups |
| J-9 | Guests: confirm that guest saves never leave the device | Yes |
| J-10 | **Naming/trade dress:** rename "Fast Track", "Doodads", and possibly "Rat Race" before public launch? | Keep working titles during development; decide before Phase 8 |
| J-11 | Email-from address, support contact, domain | placeholders in `env.js` / docs |
