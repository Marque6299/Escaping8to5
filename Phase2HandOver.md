# Phase 2 Hand-Over — from Phase 1 (Architecture & UI Foundation)

**Read this first, then `docs/RAT_RACE_MASTER_PLAN_v2.md` §3 (Phase 2) and §0–§1 (rules/contracts).**
Phase 1 is complete and verified. Phase 2 builds the playable turn loop on top of it. Nothing in Phase 1 needs rewriting to start; a few seams were left *on purpose* and are listed in §3.

---

## 0. Status at a glance

| | |
|---|---|
| Phase 1 | **Complete.** All 22 acceptance tests pass, plus 24 supporting tests. |
| Verification | `dev/tests.html` → **46/46** (file:// and http://). `node tools/run-headless.mjs` → **118/118** checks (static rules, generator drift, test page ×2, real-Chromium E2E). Zero console errors on `file://` and `http://localhost`. |
| Size | 29 JS files (≈4,000 lines, 287 KB incl. generated art data) · CSS 43 KB (budget 70) · icon sprite 16 KB (budget 60) · scenes 10 KB (budget 80). |
| Runs | Double-click `public/index.html` (OFFLINE) or serve `public/` (ONLINE-dev). No build step. |
| Not done by design | Turn loop, events, NPC interactions, health actions, market, bank, deposits, property, fast track, accounts, cloud, premium, audio, legal pages, CI/Netlify/package.json (all later phases). |

```bash
# verify in 1 minute
open dev/tests.html                                   # expect: green "PASS — all 46 tests passed"
npm i --no-save playwright && npx playwright install chromium
node tools/run-headless.mjs                           # expect: 118/118 checks passed
```

### Phase 1 steps → where they live
| Plan step | Delivered in |
|---|---|
| 1.1 namespace/config/util/bus/rng | `00`–`04` (RNG: misc stream + `market`/`events`/`deals`/`npc` streams, all saved in `meta.rng`) |
| 1.2 data | `05-data-*` (3 professions, 8 stocks, 4 dreams, 20 glossary terms, 14 NPC templates, 93 icons, 12 scenes) |
| 1.3 schema v2 | `06-schema.js` (`create` / `validate` / `migrate` / `makeNpc`) |
| 1.4 store | `07-store.js` (`commit` / `batch` / `replace` / `pushLog` / `bumpStat` / `subscribe`) |
| 1.5 finance + valuation + ledger | `08` / `09` / `10` (F1–F7 incl. v2 amendments F3b, F4b, F5b, F17 tiers) |
| 1.6 save + persist + env + settings | `11-save.js`, `1a-persist.js` |
| 1.7–1.9 stage, binder, actions, fx, overlays | `12`–`15` |
| 1.10 panels + screens | `16-ui-panels.js`, `17-ui-screens.js` (Title v2, New Game, HUD, statements, meters, ticker, Contacts drawer, Life tab, action bar) |
| 1.11 dev + art + stubs + app | `18-dev.js`, `19-ui-art.js`, `1b-stubs.js`, `90-app.js` |

---

## 1. What Phase 2 can rely on (API surface)

All of it is plain classic-script JS under the single global `window.RR`.

**State & store.** `RR.store.get()` · `commit(label, fn(state) → any | {ok:false,…})` → `Result` (throw or `{ok:false}` ⇒ full rollback; `derived` recomputed and `meta.revision++` once per top-level commit) · `batch(label, fn)` (nested commits join one revision + one `state:committed`) · `replace(state, label)` · `pushLog(state, {kind,text,delta?})` · `bumpStat(state, 'a.b', n)` · `RR.util.uid(state, prefix)`. Helpers throw if you call them on the **live** state outside a commit (R3 guard).

**Schema.** `RR.schema.create({name, professionId, dreamId, seed})` · `validate(state) → {ok, errors[]}` · `migrate(state)` (pure; real v1→v2) · **`makeNpc(state, templateId, {turn?, relationship?, assetId?})`** — use this for `NPC_MEET`; it draws the name and `lookSeed` from `rng.npc` and the id from the global counter · `ENUMS` · `SETTING_KEYS`.

**Pure money math.** `RR.finance` (`pmt`, `monthlyInterest`, `revolvingMinimum`, `initialPayment`, `amortizeOnePeriod(debt) → {interest,payment,principalPaid,newPrincipal,newTerm,closed}`, `scheduledPayment`, `creditSpread`, `offeredApr(kind, score, economy, adj?)`) · `RR.valuation` (stock/RE/BIZ value, rent, opex, maintenance, insurance, linked debt, `assetNetCashflow`, `assetEquity`) · `RR.ledger` (`recompute(state) → derived`, plus `healthTier`, `healthFactor`, `npcTier`, `salaryNow`, `lifestyleNow`). **`RR.health.tier` and `RR.npc.tier` in Phase 2 should delegate to the ledger versions** so there is one definition.

**RNG.** `RR.rng.stream('market'|'events'|'deals'|'npc')` and plain `RR.rng.*` (misc) — `next, int(lo,hi), float, chance, pick, weighted(items, fn) → item|null, normal, shuffle`. `RR.rng.forState(state)` gives a handle on a non-live state (sims/tests). Rolls persist in `state.meta.rng` and need no commit (the documented R3 exemption). Inside a rolled-back commit the rng is rolled back too.

**Events.** `RR.bus.emit/on/once`. Canonical topics are listed in `03-bus.js`; emitting an unknown topic warns in dev. Phase 1 added `settings:changed`, `save:written`, `save:error`.

**Persistence.** `RR.save.write/read({apply?})/meta/exportJSON/importJSON(text,{apply?})/flush/has/clear` · `RR.persist` adapter seam (`local` registered; Phase 5 registers `cloud`) · `RR.env.mode` (`OFFLINE` on file://) · `RR.settings.get/set/all/subscribe`.

**UI kit.**
- `RR.ui.actions.register(name, fn, {mutates})` — handlers get `{name, el, event, arg}` and return a `Result`. A failed Result → toast (+ inline reason next to the control). **Actions with `mutates:true` call `RR.replay.record({name, arg})` after success** if `RR.replay` exists (Phase 2's `29-replay.js` fills in `turn`/`phase`). `game.new` calls `RR.replay.start({seed, professionId, dreamId, name})` if present.
- `RR.ui.binder` — grammar from §2.3 plus `registerList`, `addRefreshHook`, `registerFormatter`, `scan`, `invalidate`. Formatters: `text upper money moneySigned pct pctPoints int ratio months date`.
- `RR.ui.overlays.toast.show(msg, {tone, key, durationMs, sticky, action})` · `modal.open/confirm/close/closeAll` · `tooltip` · `settings/glossary/logModal/receiptModal/consequence`.
- **`RR.ui.receipt`** — `present(receipts, {severity:'MINOR'|'MAJOR'|'CRISIS', title, body}) → {toasts, strip, modal}`, `strip(receipts)` (element for the Event Card), `chip`, `modalBody`. It is the only place that turns EffectReceipts into UI (§1.12.11).
- `RR.ui.icon(name,{size,tone,label})` · `RR.ui.avatar.render(lookSeed,{role,size,name})` · `RR.ui.scene.render(sceneId,{category|palette,width,height})`.

**Dev.** `RR.dev.fixture(name)` / `load(name)` (`starter`, `rich_rat_race`, `escape_ready`, `broke`, `healthy_saver`, `neglected` — fixed timestamps/ids, deterministic) and Ctrl+Shift+D.

---

## 2. Reference numbers (so Phase 2 tests can assert them)

Starter (Teacher): cash 3,000 · salary 3,500 · taxes 700 · lifestyle 800 · debt service 1,081 (payments 574 / 152 / 280 / 75) · expenses 2,581 · **cash flow +919** · assets 111,000 · liabilities 108,500 · **net worth 2,500** · DTI 0.31 · liquidMonths 1.16 · `idCounter` 11 · 5 NPCs `npc_0007…npc_0011`.
Nurse starts at +1,027, Software Engineer at +1,458. `rich_rat_race`: passive 872 / expenses 2,668 / cash flow 1,704 / net worth 87,000 / progress 32.68 %. `escape_ready`: passive 3,400 > expenses 2,921 (met).
First-payday card step: 2,500 @ 21 % → interest 44, payment 75, new principal 2,469.

---

## 3. Seams Phase 2 plugs into (exactly where, exactly how)

1. **Load order.** Add Phase 2 scripts as `20-turn.js … 2a-ui-life.js` per `docs/RepoStructure.md`. Insert them in `public/index.html` **and** the script block of `dev/tests.html` (that page duplicates the app markup — update both if you add mount points). `tools/run-headless.mjs` fails the build if `index.html` is not in strict filename order.
2. **Stubs (`1b-stubs.js`).** It sorts after `1a-persist.js` and before `20-*`, so your real modules simply re-assign `RR.turn`, `RR.npc`, `RR.health`, `RR.story` and replace the stubs. Two stubs are **deliberately successful no-ops** because the turn loop calls them every turn: `RR.market.tick()` (MARKET phase) and `RR.progression.checkEndConditions()` (CLEANUP). Feature stubs (`RR.deposits`, `RR.property`, `RR.assets`, `RR.debt`) return `NOT_IMPLEMENTED` until Phase 3. Every stub group carries `__stub: true`. Do not edit the file to add logic; delete a group once its real module exists.
3. **Actions already registered** (`16-ui-panels.js` → `registerActions`): `turn.endTurn`, `health.checkup|vacation|gym|insurance(arg=plan)`, `npc.call|lunch|gift(arg=npcId)`, `market|portfolio|bank.open`. They call `RR.turn.endTurn()`, `RR.health.act('checkup'|'vacation'|'gym')`, `RR.health.setInsurance(plan)`, `RR.npc.interact(npcId, 'CALL'|'LUNCH'|'GIFT')`. Keep these signatures, or re-register the action (the last registration wins). The corresponding buttons are rendered `aria-disabled="true"` with a `title` — **remove `aria-disabled` when you wire them**.
4. **Next Month button** (`#btn-next`) already dispatches `turn.endTurn`; today it toasts "The turn engine arrives in Phase 2." Failed Results show a toast and fill the `.inline-reason` under the button.
5. **HUD stepper** is data-driven: `hudHook` highlights `loop.phase` (`SHORTFALL` shows as PAYDAY, `CLEANUP` marks all done). Set `loop.phase` inside commits and it just works.
6. **Receipts → UI.** `effects:applied` is **not** auto-wired to `RR.ui.receipt.present`: Phase 2's presenter (`25-ui-turn.js`) should call it once per resolved effect so MINOR/MAJOR/CRISIS rules live in one place. Engines may request a plain toast by emitting `ui:toast` `{msg, tone, …}` (already wired).
7. **Event Card / Payday summary.** Centre column is `#col-center` = `#hero-card` (character card, rebuilt when the game/name/profession changes) + `#dock` (Life tab + disabled Market/Portfolio/Bank tabs). Suggested: add an Event Card section as a sibling and hide `#hero-card` while a card is pending; reuse `RR.ui.scene.render(sceneId, {category})` for the backdrop and `RR.ui.receipt.strip()` for MAJOR results. Phase 3 enables the dock tabs (built in `P.life.mount`).
8. **Contacts drawer.** Cards are bound from `state.npcs` (keyed list `npcs`, template `#tpl-npc-card`): avatar, role label, bio, tier chip + meter, three action buttons. Phase 2 only needs to enable the buttons and add perk/memory display. Name pools, bios and starting relationships are in `RR.data.npcs`.
9. **Health.** The ledger already applies F3b (salary factor) and the insurance premium; the HUD health meter and Life tab already bind `player.health.value`. Phase 2 owns `RR.health.tick/act/setInsurance`, hospitalization and the `config.health` rules.
10. **Autosave** hooks `state:committed`; it ignores `store.replace` and `TITLE`. Phase 2 does not need to call `RR.save.write()`.

---

## 4. Deviations and additions vs. the plan (all additive unless stated)

| # | What | Why | Owner action |
|---|---|---|---|
| D1 | `1b-stubs.js` (new file; not in RepoStructure.md) | The stub registry must load *before* the Phase 2 modules that replace it; putting it in `90-app.js` would overwrite them. | Approve / add to RepoStructure.md |
| D2 | `tools/build-icons.mjs`, `build-scenes.mjs` (plan: Phase 7), `run-headless.mjs` (new) | Phase 1 ships generated art data, so the generators + a drift check had to exist. | None |
| D3 | **Colour tokens lightened** (`--text-lo` #6f7c9c→#9aa7c6; `--neg`, `--accent`, `--npc`, `--cat-life/market/quiet` up to ≈12 %) | Test 22 requires every text/background pair ≥ 4.5:1 *at worst-case blends*; the plan's values fail for small text. | Confirm or supply a different palette |
| D4 | `RR.save.read()` / `importJSON()` do **not** replace the store unless `{apply:true}` | A loader must not clobber the live game before the caller decides (cloud conflict in Phase 5). The app passes `apply:true`. | None |
| D5 | Starter NPC ids are `npc_0007…0011` (global counter, `idCounter` = 11 at start) | One monotonic id source (R5). The plan's `npc_0001` example is illustrative. | Phase 2 tests must not hard-code `npc_0001` |
| D6 | `loop.director.droughts` has `NPC` and `ASSET` keys at creation | v2 pity weights cover those categories. | Director should still treat a missing key as 0 |
| D7 | Ratios are rounded to 2 dp; `escape.progressPct` is **floored** to 2 dp (equal-but-not-escaped never shows as 100 % rounded-up) | Matches the §1.5 example values; avoids a misleading 100 %. | None |
| D8 | `migrate()` implements the real v1→v2 steps (plan text says "no-op structure"; §1.12 requires v2) | Saves from v1 must load. | None |
| D9 | `RR.dev.load()` returns a `Result` (plan: void); the drawer is **disabled when `RR.env.name === 'prod'`** | Dev tooling must not exist in production. | None |
| D10 | `index.html` carries a meta CSP and `?v=1.0.0` on every asset | Proves "no inline script/style" in every test run. | Phase 5 moves CSP to headers; `tools/bump-version.mjs` owns `?v=` |
| D11 | Extra `RR.config` keys: `save`, `settings`, `ledger.ratioCap`, `limits`, `assetBase`, `ui.stage/fx/ticker/name`, `property.conditionBands` | R9 (no magic numbers). | None |
| D12 | Extra reason codes `CORRUPT_SAVE`, `STORAGE_ERROR`; extra bus topics (§1) | Persistence failures need codes. | Add to §1.7 table at next plan edit |
| D13 | Extra NPC template fields `label`, `startRelationship`, `art.outfit`, `ftOnly` | Contacts UI needs a role label; avatars need an outfit family. | None |
| D14 | Settings modal also offers *Quit to title*, *Delete saved game*, *Currency symbol* | Without Quit-to-title a player cannot start a second game. | None |
| D15 | Ledger exposes `income.interest`, `expenses.insurance`, `assets.deposits` | Needed for the interest row, insurance row and deposits subtotal. | None |

## 5. Decisions taken where the plan was silent
- **Player avatar** seed is derived (`fnv1a32('player:'+name+':'+professionId)`); a chosen look arrives with accounts (Phase 5).
- **Initial state:** `loop.status 'TITLE'`, `phase 'IDLE'`, `turn 0`. *Start game* does `store.replace(create())` then one commit that sets `RUNNING` and logs a welcome line (R18).
- **Settings are device-level** (`rr.settings.v1`) and mirrored into `meta.settings` by a `settings.set` commit when a game is running. Consequence: toggling a setting bumps `meta.revision` and triggers autosave. **Replay/sim comparisons must ignore `meta.revision`, `meta.updatedAt` and `meta.settings`.**
- **OS reduced-motion** always wins: `settings.get('animations')` is false and `reducedFx` true regardless of the stored preference.
- **Online controls** are `aria-disabled` + `title` + visible caption (not `disabled`) so they stay focusable and explain themselves. Legal footer links are inert until Phase 8.
- **Toasts** appear top-centre (so they never cover the Contacts drawer); newest on top; max 4 visible; `key` dedupes within 1 s; hover/focus pauses the timer.

## 6. Known limits & gotchas
- Audio, brand PNGs (`og-image.png`), Tier-B icons/scenes, legal pages, `package.json`, CI and `netlify.toml` are intentionally absent (Phases 5/7/8). `og-image.svg` is a placeholder.
- `dev/tests.html` contains a **copy** of the app markup (off-screen sandbox). Keep it in sync with `index.html`.
- Browser baseline: current Chrome/Edge/Firefox/Safari (uses `inert`, `color-mix` with an rgba fallback, `<template>`, CSS grid). No polyfills.
- The icon art is deliberately simple line work (final art is Phase 7); `RR.ui.icon` falls back to `ic_help` with one dev warning for unknown names.
- Choice cards use visually-hidden radios (`.sr-only`); automation must click the `<label>`.
- `tools/run-headless.mjs` needs Playwright installed locally; without it the script runs the static checks and exits 2.

## 7. Acceptance-test traceability (all in `dev/tests/`)
| Plan test | Where | | Plan test | Where |
|---|---|---|---|---|
| 1 pmt | `p1-math-ledger` #1 | | 12 interest ledger | `p1-math-ledger` #12 |
| 2 starter | #2, #2b | | 13 health tiers/insurance | #13 |
| 3 card step | #3, #3b | | 14 lifestyle inflation | #14 |
| 4 escape strict | #4 | | 15 condition factors | #15, #15b |
| 5 asset-linked debt | #5 | | 16 rng streams | `p1-state-store` #16, #16b |
| 6 commit/rollback/batch | `p1-state-store` #6, #6b | | 17 toasts | `p1-ui-kit` #17 |
| 7 rng + round-trip | #7 | | 18 modals | #18 |
| 8 binder | `p1-ui-kit` #8, #8b | | 19 avatars/scenes | #19 |
| 9 stage 16:9 | #9 + E2E (4 real viewports) | | 20 icons | #20 |
| 10 file:// boot | #10 (iframe) + E2E | | 21 persist/env/guest | `p1-persist-env` #21, S1–S3 + E2E |
| 11 schema v2 | `p1-state-store` #11, #11b, #11c | | 22 contrast + keyboard | `p1-a11y` #22, A8 · `p1-ui-kit` A1–A7 |

## 8. Open questions for the owner
1. **Licence** — `LICENSE` is a placeholder (all rights reserved). Which licence, and what copyright holder name?
2. **Palette (D3)** — accept the lightened tokens, or supply replacements that meet 4.5:1?
3. **`1b-stubs.js` (D1)** — keep as a separate file (recommended) and add it to `RepoStructure.md`?
4. **Production hostname** for `config/env.js` (`PROD_HOSTS`) — needed in Phase 5.

## 9. Phase 2 kick-off checklist
- [ ] Re-run §0 verification on a clean checkout.
- [ ] Create `20-turn.js … 2a-ui-life.js`; add to `index.html` and `dev/tests.html` in filename order.
- [ ] Turn state machine: gate actions by phase (R10); every state change through `RR.store.commit`; every player action registered in `RR.ui.actions` with `mutates:true` (R20).
- [ ] Wire `RR.replay` (`start`/`record`) so `game.new` and mutating actions are captured.
- [ ] Presenter calls `RR.ui.receipt.present` for every resolved effect (R18).
- [ ] Re-use Phase 1 fixtures (`broke` ⇒ SHORTFALL on first payday; `neglected` ⇒ hospital path) in Phase 2 tests.
- [ ] Add Phase 2 acceptance tests as `dev/tests/p2-*.js`; keep `tools/run-headless.mjs` green.

---

## 10. PHASE COMPLETION REPORT (plan §0 format)

**Phase 1 — Architecture & UI Foundation: COMPLETE**

*Files created/changed:* every file under `public/`, `dev/`, `tools/`, `docs/`, plus `README.md`, `LICENSE`, `.gitignore`, `Phase2HandOver.md` (see tree in the zip).

*Acceptance tests (22):* **PASS ×22** — evidence: `dev/tests.html` 46/46; `node tools/run-headless.mjs` 118/118.

*Rules R1–R21:* R1 (classic scripts, one global) PASS · R2 UI never mutates state / engines DOM-free PASS (lint-enforced) · R3 single mutation gateway PASS · R4 JSON-plain state PASS (enforced in commit) · R5 determinism (rng, no timestamps in ids; clock injectable) PASS · R6 integer money PASS · R7 `derived` recomputed, never saved PASS · R8 Results, never throw PASS · R9 config-driven PASS · R10 phase gating N/A (Phase 2) · R11 a11y baseline PASS · R12 no schema renames PASS · R18 PASS (game-start log; import/export/delete/failure toasts; settings toggles are self-evident UI state, not game state).

*Security checklist:* **R13 PASS** (no network code at all; engines DOM/network-free, lint-enforced) · **R14 PASS** (`env.js` placeholders only; secret scan clean) · **R15 N/A** (no database yet) · **R16 N/A** (nothing server-authoritative yet; online controls disabled) · **R17 N/A** · **R19 PASS** (`textContent` only, `validate(migrate())` on every load/import, CSP meta, no inline script/style, prototype-pollution keys rejected) · **R20 PASS in scope** (action whitelist + `mutates` + `RR.replay` hook; replay itself is Phase 2) · **R21 PASS** (works from `file://`, Guest play, visible OFFLINE status).

*Deviations:* D1–D15 above. *Open questions:* §8.

### Paste-ready entry for plan §10 (Session Handoff Log)
```
### Entry 1 — Phase 1 complete
- Delivered: full Phase 1 (§2) incl. v2 foundations (§2.8). 29 JS files, 5 CSS files, 93 icons, 12 scenes, dev tests.
- Verified: dev/tests.html 46/46; tools/run-headless.mjs 118/118; 0 console errors on file:// and http://localhost.
- Deviations: D1–D15 in Phase2HandOver.md §4 (notably: 1b-stubs.js added; colour tokens lightened for WCAG AA).
- Gotchas for Phase 2: stub market.tick/progression hooks are successful no-ops; settings commits bump meta.revision;
  starter NPC ids start at npc_0007; dev/tests.html duplicates index.html markup.
- Next: Phase 2 — turn loop, payday, effects, events, NPC + health systems (§3).
```
