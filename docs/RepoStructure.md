# RAT RACE — Repository Structure

> Derived from `RAT_RACE_MASTER_PLAN_v2.md` (Plan v2.0 · State Schema v2 · Online Edition).
> Stack: **vanilla HTML/CSS/JS game** (no build step) → **Netlify** (static) + **Supabase** (Auth, Postgres, Edge Functions, cron) + **GitHub** (CI/CD).

**Legend**
- ✅ = path/name is stated in the plan (Appendix G, §1.4, §1.12.9, etc.)
- 🔧 = my proposal where the plan says "phase-specific", "`dev/tests/*.js`" or is silent. Change freely; nothing in the plan depends on these names.

---

## 1. Constraints that shape the layout

| Rule | Consequence for the repo |
|---|---|
| **R1 / A2 / A15** Vanilla runtime, classic `<script>` tags, one global `RR`, no ES modules, must run by double-clicking `public/index.html` (`file://`) | Everything deployable lives in `public/`. No bundler, no `npm install` needed to play. |
| **A27** Dev tooling may use Node; generated assets are committed | `tools/` and `dev/` may use Node, but outputs (icon sprite, scenes) are committed into `public/js/`. |
| **R13** Engines are network-free | Only `50-auth`, `51-cloud`, `52-sync`, `53-entitlements`, the cloud persist adapter and `public/admin/` touch the network. |
| **R14** Secrets never in browser/repo | Only the Supabase URL, publishable key, CAPTCHA *site* key and site URL appear in `public/config/env.js`. Everything else lives in Supabase secrets/Vault/GitHub environments. |
| **R19 + CSP** No inline scripts/styles, `textContent` for untrusted strings | Every page loads external `.js`/`.css` only. No `<script>` bodies in any `.html`. |
| **R2** UI never mutates state; engines never touch the DOM | File split: engine files (`2x`, `3x`, `4x`) vs `*-ui-*.js` files. Headless pages (`dev/sim.html`) load engines only. |
| **Deployment boundary** | `public/` is the Netlify publish dir. `dev/`, `supabase/`, `tools/`, `docs/`, `.github/` are **never deployed**. |

---

## 2. Top-level tree

```
rat-race/                              ← repo root
├─ public/                             ✅ Netlify publish dir = the deployed game
│  ├─ index.html                       ✅
│  ├─ 404.html · privacy.html · terms.html · credits.html · data-deletion.html   ✅ (legal pages: Phase 8)
│  ├─ config/
│  │  └─ env.js                        ✅ public values only
│  ├─ css/
│  │  ├─ tokens.css · base.css · glass.css · ledger.css · modes.css              ✅
│  │  └─ turn.css · market.css · progression.css · account.css · themes.css      🔧 phase sheets
│  ├─ js/                              ✅ numeric filename order = load order
│  │  ├─ 00-namespace.js … 19-ui-art.js · 1a-persist.js                          (Phase 1)
│  │  ├─ 20-turn.js … 2a-ui-life.js                                              (Phase 2)
│  │  ├─ 30-market.js … 38-property.js                                           (Phase 3)
│  │  ├─ 40-progression.js … 44-sim.js                                           (Phase 4)
│  │  ├─ 50-auth.js … 55-ui-premium.js                                           (Phases 5–6)
│  │  ├─ 70-audio.js · 71-i18n.js · 72-ui-onboarding.js                          🔧 (Phase 7)
│  │  └─ 90-app.js                                                               (boots everything)
│  ├─ vendor/
│  │  └─ supabase.js · VERSION.txt · LICENSE                                     ✅ pinned UMD build
│  ├─ assets/
│  │  ├─ brand/ · icons/ · scenes/ · avatars/                                    ✅
│  └─ admin/
│     ├─ index.html · 60-admin.js                                                ✅
│     └─ admin.css                                                               🔧
├─ dev/                                ✅ NOT deployed: tests, simulator, lint
│  ├─ tests.html · sim.html · lint-content.html
│  ├─ tests/*.js
│  └─ fakes/fake-supabase.js
├─ supabase/                           ✅ NOT deployed by Netlify
│  ├─ config.toml · seed.sql
│  ├─ migrations/
│  ├─ functions/ (+ _shared/)
│  └─ tests/
├─ tools/                              ✅ dev-only Node scripts
├─ docs/                               ✅
├─ .github/                            ✅
├─ netlify.toml · package.json · package-lock.json · .gitignore · README.md · LICENSE   ✅
```

---

## 3. Folder-by-folder contents

### 3.1 Repo root

| File | Must contain |
|---|---|
| `netlify.toml` ✅ | `[build] publish = "public"` (no build command). Security headers for `/*`: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS, strict **CSP** (`default-src 'self'`, `connect-src` = Supabase prod + dev refs, Turnstile hosts, `frame-ancestors 'none'`, `object-src 'none'`). Second `[[headers]]` for `/admin/*`: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Cross-Origin-Opener-Policy`. Replace `<PROD_REF>` / `<DEV_REF>` placeholders. |
| `package.json` / `package-lock.json` ✅ | **Dev tools only** (e.g. Playwright for headless CI). Never required to run the game. Lockfile committed. |
| `.gitignore` ✅ | `.env*`, `supabase/.temp`, `*.local`, `node_modules`, any file containing keys. |
| `README.md` ✅ | What the game is, how to run offline (double-click `public/index.html`), how to run `dev/tests.html` and `dev/sim.html`, branch/release flow, link to `docs/`. |
| `LICENSE` ✅ | Project license (vendored SDK license sits in `public/vendor/LICENSE`). |

---

### 3.2 `public/` — the deployed game

#### Root files

| File | Contents |
|---|---|
| `index.html` ✅ | Stage root; mount points for HUD / left panel / center stage / right panel / action bar; `<template>`s for keyed lists; **ordered `<script src>` tags** (`config/env.js` first, `vendor/supabase.js` before `50-*`, `90-app.js` last), scripts loaded with `?v=<RR.config.version>`. **No inline script or style.** |
| `404.html` ✅ | Static not-found page. |
| `privacy.html`, `terms.html`, `credits.html`, `data-deletion.html` ✅ | Phase 8 drafts (owner/counsel review): privacy, terms, asset provenance, and the 30-day inactivity rule + exemptions + deletion path + backups + Stripe retention. Placeholders linked from the Title footer earlier. |

#### `public/config/`

| File | Contents |
|---|---|
| `env.js` ✅ | Loaded first. Sets `window.__RR_ENV__` from `location.hostname`: production host → prod project, other `http(s)` → dev project, `file:` → `null` ⇒ **OFFLINE**. Holds **only** Supabase URL, **publishable** key, CAPTCHA site key, site URL. Phase 1 ships it with `__PLACEHOLDER__` values; Phase 5 fills real public values. |

#### `public/css/`

| File | Contents |
|---|---|
| `tokens.css` ✅ | CSS variables: colors, glass values, radii; `--health`, `--npc`, `--asset`, `--premium`; Fast Track overrides. |
| `base.css` ✅ | Reset, typography (system fonts, `tabular-nums`), focus ring, reduced-motion rules. |
| `glass.css` ✅ | Glass panel, card, button, chip, meter, **modal**, tooltip, row, toast. |
| `ledger.css` ✅ | HUD, Income Statement, Balance Sheet, Freedom Meter, log ticker. |
| `modes.css` ✅ | `body[data-mode="RAT_RACE"\|"FAST_TRACK"]` variable swaps only (no layout change). |
| `turn.css` 🔧 | Phase stepper, Payday overlay, Event Card v2, Result strip, Contacts drawer, Life tab, Journal drawer. |
| `market.css` 🔧 | Economy banner, Market tab, trade modal, Deal Analyzer, Portfolio drawer, Bank dialog, shortfall/liquidation modals. |
| `progression.css` 🔧 | Goal Meter, Dream Board, escape/victory/game-over ceremonies. |
| `account.css` 🔧 | Auth modal, account chip/menu, sync status chip, save slots, conflict modal, premium modal, banners. |
| `themes.css` 🔧 | The 3 premium UI themes (variables only). |

Budget: total CSS ≤ 70 KB (F.8). All colour-coded UI must also carry an icon or text label (R11).

#### `public/js/` — load order = numeric filename order

All files are classic scripts that attach to `window.RR`. Engines never touch the DOM; `*-ui-*` files never mutate state.

**Phase 1 — Foundation**

| File | Module | Contains |
|---|---|---|
| `00-namespace.js` ✅ | `RR` root | Version, `RR.state` getter → `RR.store.get()`. |
| `01-config.js` ✅ | `RR.config` | **All tunables** (R9): rates, spreads, taxes, director weights, `ui.toast`/`ui.modal` limits, `story.maxConsequences`, `sync.*`, `fastTrack.*`. v2 values override same-named v1 keys. Holds the `version` used for `?v=`. |
| `02-util.js` ✅ | `RR.util` | `clamp`, `round2`, `roundMoney`, `deepClone`, `uid`, `getPath`, `fmt.*`. |
| `03-bus.js` ✅ | `RR.bus` | `on/once/emit`; canonical topic list (§1.4 + §1.12.10). |
| `04-rng.js` ✅ | `RR.rng` | Seeded PRNG, state in `meta.rng`; independent streams `market/events/deals/npc/misc`. |
| `05-data-*.js` ✅ | `RR.data.*` | 🔧 split: `05-data-professions.js` (3 starters), `05-data-stocks.js`, `05-data-dreams.js`, `05-data-glossary.js` (≥12 terms), plus ✅ `05-data-npcs.js` (14 templates), ✅ `05-data-icons.js` (inline SVG sprite string, ≥70 symbols; generated from Phase 7), ✅ `05-data-scenes.js` (12 Tier-A scenes). 🔧 `05-data-cosmetics.js` arrives in Phase 6. |
| `06-schema.js` ✅ | `RR.schema` | `create` (v2 shape), `validate`, `migrate` (v1→v2). |
| `07-store.js` ✅ | `RR.store` | `commit`, `batch`, `replace`, `get`, `subscribe`, `pushLog`, `bumpStat`; snapshot rollback; the **only** mutation gateway (R3). |
| `08-finance.js` ✅ | `RR.finance` | Pure debt math: `pmt`, `amortizeOnePeriod`, `creditSpread`, `offeredApr`. |
| `09-valuation.js` ✅ | `RR.valuation` | Pure asset valuation (stock/RE/business value, rent, opex, equity, net cash flow). |
| `10-ledger.js` ✅ | `RR.ledger` | `recompute(state)` → `derived` (income, expenses, assets, liabilities, escape). |
| `11-save.js` ✅ | `RR.save` | `rr.save.v1` localStorage, autosave, export/import JSON, corrupt-save fallback. |
| `12-ui-stage.js` ✅ | `RR.ui.stage` | 1920×1080 scale-to-fit, letterbox, small-viewport notice. |
| `13-ui-binder.js` 🔧 | `RR.ui.binder`, `RR.ui.actions` | `data-bind` grammar (§2.3), keyed lists, whitelisted `data-action` registry (R20). |
| `14-ui-fx.js` 🔧 | `RR.ui.fx` | `tweenNumber`, `flashDelta`, `coinBurst`, `shake`, confetti (respect reduced motion). |
| `15-ui-overlays.js` 🔧 | `RR.ui.overlays`, `RR.ui.receipt` | Toast manager, modal manager (focus trap, stack depth 3), glossary tooltip, receipt presenter (§1.12.11). |
| `16-ui-panels.js` 🔧 | `RR.ui.panels` | HUD, Income Statement, Balance Sheet, Freedom/Health meters, log ticker, Contacts/Life shells. |
| `17-ui-screens.js` ✅ | `RR.ui.screens` | Title v2, New Game form. |
| `18-dev.js` ✅ | `RR.dev` | `Ctrl+Shift+D` drawer; fixtures `starter`, `rich_rat_race`, `escape_ready`, `broke`, `healthy_saver`, `neglected`; later `simulateTurns`. |
| `19-ui-art.js` ✅ | `RR.ui.icon/avatar/scene` | Icon factory, deterministic avatar generator (own mulberry32, never `RR.rng`), scene renderer. |
| `1a-persist.js` ✅ | `RR.persist`, `RR.settings`, `RR.env` | Adapter interface + local adapter, `rr.settings.v1`, environment detection. **Name exactly** (sorts after `19`). |

**Phase 2 — Core loop & life systems**

| File | Module | Contains |
|---|---|---|
| `20-turn.js` ✅ | `RR.turn` | State machine, Presenter hook, phase gates (R10). |
| `21-payday.js` ✅ | `RR.payday` | `run/preview`, ticks, credit update, `PaydayReport`. |
| `22-effects.js` ✅ | `RR.effects` | Closed-list effect ops, `outcomes`, **EffectReceipts**. |
| `23-events.js` ✅ | `RR.events` | Event Director v2: weighted pick, filters, severity cooldowns, mercy rule, `weightMods`. |
| `24-data-events.js` ✅ | `RR.data.events` | Event templates (≥24 v1 + ≥38 P2 → ≥120 by Phase 7). 🔧 When this grows past ~100 KB, split into packs named `24b-data-events-*.js` (these sort after `24-` and before `25`). |
| `25-ui-turn.js` ✅ | UI | Phase stepper, Payday overlay, Event Card v2, Result strip, Consequence modal, Next Month, Presenter. |
| `26-npc.js` ✅ | `RR.npc` | Tiers, `interact`, memory, decay (F18), perks (F19). |
| `27-story.js` ✅ | `RR.story` | Flags, counters, predicate evaluator, consequence scheduling/resolution, journal feed. |
| `28-health.js` ✅ | `RR.health` | Health tick (F17), actions, insurance, forced hospital, salary factor (F3b). |
| `29-replay.js` 🔧 | `RR.replay` | Records `{turn, phase, name, args}` per player action; headless replay (R20). |
| `2a-ui-life.js` 🔧 | UI | Live Contacts drawer, Life tab, Journal drawer. |

**Phase 3 — Market, assets, deposits, property**

| File | Module | Contains |
|---|---|---|
| `30-market.js` ✅ | `RR.market` | Cycle, stock random walks, RE/business indices, `applyShock`. |
| `31-assets.js` ✅ | `RR.assets` | Buy/sell stocks, deal acceptance, `quoteSale`. |
| `32-debt.js` ✅ | `RR.debt` | Loans, repayment, shortfall resolution, liquidation, bankruptcy. |
| `33-ui-market.js` ✅ | UI | Economy banner, Market tab, trade modal, Deal Analyzer. |
| `34-ui-portfolio.js` ✅ | UI | Portfolio drawer (also property actions: repair, insure, renovate, inspect). |
| `35-ui-bank.js` ✅ | UI | Bank dialog, repay panel (also deposits UI), shortfall and liquidation modals. |
| `36-data-deals.js` ✅ | `RR.data.deals` | ≥11 deal templates (RE + business) with generation ranges. |
| `37-deposits.js` ✅ | `RR.deposits` | Open/deposit/withdraw/close, maturity, APY quoting, penalties. |
| `38-property.js` ✅ | `RR.property` | Condition tick (F16), maintenance plans, tenant lifecycle. |

**Phase 4 — Progression & simulator**

| File | Module | Contains |
|---|---|---|
| `40-progression.js` ✅ | `RR.progression` | Escape check, `enterFastTrack` migration, victory/loss, story recap. |
| `41-fasttrack.js` ✅ | `RR.fastTrack` | ×10 scale, Fast Track rules and director weights. |
| `42-data-fasttrack.js` ✅ | `RR.data.fasttrack` | FT deals, luxury doodads, FT life/market events. |
| `43-ui-progression.js` ✅ | UI | Goal Meter, Dream Board, escape/victory/gameover modals. |
| `44-sim.js` ✅ | `RR.sim` | Balance simulator, bot policies (`PASSIVE_SAVER`, `LEVERAGE_HAWK`, `RANDOM`, `NO_INVEST`), report. |

**Phases 5–6 — Accounts, cloud, premium** (`vendor/supabase.js` loads before these)

| File | Module | Contains |
|---|---|---|
| `50-auth.js` ✅ | `RR.auth` | Sign-up/in (email, Google), reset, session bootstrap, `auth:changed`. |
| `51-cloud.js` ✅ | `RR.cloud` | Client factory, `profile.*`, `saves.*` with optimistic concurrency; registers `'cloud'` persist adapter. |
| `52-sync.js` ✅ | `RR.sync` | Reconcile, debounced push, pull, conflict handling (player chooses, A20), offline queue, status chip, snapshots. |
| `53-entitlements.js` ✅ | `RR.entitlements` | `get/refresh/has/startCheckout/openPortal`. Engines must **never** reference it (A19). |
| `54-ui-account.js` ✅ | UI | Auth modal, account chip/menu, Save Slots, Conflict, retention notice, banners. |
| `55-ui-premium.js` ✅ | UI | Premium modal, crown chip, cosmetics, snapshots UI. |

**Phase 7 — Polish** 🔧 (names proposed; all must stay out of state and RNG)

| File | Module | Contains |
|---|---|---|
| `70-audio.js` 🔧 | `RR.audio` | Procedural WebAudio only, off by default, starts after first user gesture. |
| `71-i18n.js` 🔧 | `RR.i18n` | `t(key, vars)` with the `en` table only. |
| `72-ui-onboarding.js` 🔧 | UI | MENTOR tutorial hints, first-run checklist, "What just happened?". |

**Boot**

| File | Contains |
|---|---|
| `90-app.js` ✅ | `RR.app.boot()` — init stage/binder/panels, inject icon sprite once, show Title or Continue; extended every phase. |

#### `public/vendor/`

| File | Contents |
|---|---|
| `supabase.js` ✅ | **Pinned** supabase-js UMD build, committed, classic script. Used only by `RR.auth` / `RR.cloud`. |
| `VERSION.txt` ✅ | Exact version + checksum (supply-chain control H-14). |
| `LICENSE` ✅ | Upstream license. |

#### `public/assets/`

| Folder | Contents |
|---|---|
| `brand/` ✅ | `logo.svg`, `favicon.svg`, `apple-touch-icon.png` (180 px, generated), `og-image.png` (1200×630, generated), optional `manifest.webmanifest` (no service worker). |
| `icons/` ✅ | Source `*.svg` (24×24, `currentColor`, no fixed colors). Compiled into `js/05-data-icons.js` by `tools/build-icons.mjs`. Tier A (≥70) in Phase 1, ≥90 by Phase 7. |
| `scenes/` ✅ | Source/templates for parametric scene backdrops (12 Tier-A → 20 total). Compiled into `js/05-data-scenes.js` by `tools/build-scenes.mjs`. |
| `avatars/` ✅ | Design sources for avatar parts. Runtime renders from code, not from these files. |

Everything is SVG delivered as JS strings (works from `file://`). No remote images, no web fonts, no CDNs. Budgets: sprite ≤ 60 KB, scenes ≤ 80 KB, avatar code ≤ 40 KB.

#### `public/admin/` (Phase 6)

| File | Contents |
|---|---|
| `index.html` ✅ | Separate page, `noindex`. Loads only what it needs: `config/env.js`, `vendor/supabase.js`, core `js/00–03`, `50-auth.js`, `51-cloud.js`, shared CSS, `admin.css`, `60-admin.js`. |
| `60-admin.js` ✅ | `RR.admin`: sign-in → TOTP (`aal2`) → `admin-actions { action:'whoami' }`. Tabs: Overview, Users, Retention, Config, Audit. All privileged work happens in the Edge Function. Idle timeout 30 min. **No `innerHTML` with data.** |
| `admin.css` 🔧 | Admin-only styles (inline styles are blocked by CSP). |

---

### 3.3 `dev/` — tests, simulator, lint (never deployed)

All `dev/*.html` pages load engine scripts via `../public/js/…`.

| File | Contents |
|---|---|
| `tests.html` ✅ | Tiny no-library assert harness; auto-runs on load; shows PASS/FAIL rows. Must contain every acceptance test from each phase. CI fails on any FAIL row or console error. |
| `sim.html` ✅ | Loads **engine scripts only** (no UI), calls `RR.sim.run`, swaps a fresh state via `RR.store.replace`, autosave off. CI smoke: 20 seeds per policy. |
| `lint-content.html` ✅ | Runs the content lint over all templates; sets `document.title = 'LINT PASS'\|'LINT FAIL'` for headless CI. |
| `tests/*.js` ✅ | 🔧 Suggested naming `p<phase>-<topic>.js`: `p1-finance-ledger.js`, `p1-store-schema.js`, `p1-ui-kit.js`, `p1-persist-env.js`, `p2-turn-payday.js`, `p2-effects-events.js`, `p2-npc-health-story.js`, `p2-replay.js`, `p3-market-assets.js`, `p3-debt.js`, `p3-deposits-property.js`, `p4-progression.js`, `determinism.js`, `p5-sync-auth.js`, `p6-entitlements.js`, `p7-assets-a11y.js`. |
| `fakes/fake-supabase.js` ✅ | In-memory stand-in for the Supabase client so auth/cloud/sync tests run without a backend. |

Fixtures live in `RR.dev` (`public/js/18-dev.js`), not in a separate folder.

---

### 3.4 `supabase/` — backend (Phases 5–8)

| Path | Contents |
|---|---|
| `config.toml` ✅ | Project config; declares `verify_jwt` per function. |
| `seed.sql` ✅ | Non-secret seed data only. |
| `migrations/` ✅ | Created with `supabase migration new <name>` (real filenames get a timestamp prefix; never edit an applied migration). Logical set below. |
| `functions/` ✅ | One folder per function with `index.ts`, plus `_shared/`. |
| `tests/` ✅ | pgTAP / SQL tests (RLS isolation, grants, guards, retention). 🔧 e.g. `001_rls_isolation.sql`, `002_profile_guard.sql`, `003_retention.sql`, `004_slots_entitlements.sql`. |

**Migrations**

| Logical name | Contents | Phase |
|---|---|---|
| `0001_core` | Schema `private`; tables `app_config`, `profiles`, `entitlements`, `admin_users`, `game_saves`, `save_snapshots`; helper functions, triggers. | 5 |
| `0002_rls` | RLS on every table, explicit grants, policies (`TO authenticated`, `(select auth.uid())`, `USING` + `WITH CHECK`). | 5 |
| `0003_lifecycle` | `lifecycle_runs`, `deletion_log`, `retention_candidates()`, `get_my_retention()`, seed `app_config`. | 5 |
| `0004_cron` | `pg_cron` + `pg_net` daily 03:00 UTC schedule (reads Vault at runtime). | 6 |
| `0005_billing` | `stripe_events` (idempotency), indexes. | 6 |
| `0006_admin` | `admin_audit`. | 6 |
| `0007_leaderboard` | `leaderboard_runs` (optional, J-4). | 8 |
| *(optional)* client errors | `client_errors` insert-only table (J-5). | 8 |

**Edge Functions** (`functions/<name>/index.ts`)

| Function | `verify_jwt` | Purpose |
|---|---|---|
| `lifecycle-sweep` | false (own `x-cron-secret`) | 30-day inactivity sweep, warnings, dry-run, emails. |
| `stripe-webhook` | false (Stripe signature) | Verify raw body, idempotent, re-fetch subscription, write `entitlements`. |
| `create-checkout-session` | true | Stripe Checkout redirect URL. |
| `create-portal-session` | true | Stripe Customer Portal URL. |
| `admin-actions` | true (+ admin & `aal2` inside) | All privileged admin operations, audited. |
| `export-my-data` | true | JSON export bundle (rate-limit 3/day). |
| `delete-my-account` | true | Self-delete (recent sign-in + typed `DELETE`), cancels Stripe. |
| `submit-run` *(optional)* | true | Replay-verified leaderboard submission. |

`functions/_shared/` ✅: `cors.ts`, `auth.ts` (`requireUser`, `requireAdmin`), `json.ts`, `hash.ts`, `email.ts` (+ templates `retention7`, `retention1`, `deleted`, `admin-alert`), `stripe.ts`, `log.ts` (structured, no PII/secrets). 🔧 Deno tests live next to code as `*_test.ts` (CI runs `deno test supabase/functions/**`).

---

### 3.5 `tools/` — dev-only Node scripts

| File | Purpose |
|---|---|
| `build-icons.mjs` ✅ | Compiles `public/assets/icons/*.svg` → `public/js/05-data-icons.js`; `--check` reports drift. |
| `build-scenes.mjs` ✅ | Same for scenes → `05-data-scenes.js`. |
| `scan-secrets.mjs` ✅ | Scans `public/` and `supabase/` for service/secret keys, Stripe keys, webhook secrets, private keys. |
| `bump-version.mjs` ✅ | Updates `RR.config.version` used by `?v=` cache-busting. |
| `bootstrap-admin.sql` ✅ | **Template** for inserting the first admin; the email is typed in the SQL editor, never committed. Not a migration. |
| `build-brand.mjs` 🔧 | Generates `apple-touch-icon.png` and `og-image.png` ("generated by tools/"). |

Nothing in `tools/` may be required to run the game (A27).

---

### 3.6 `docs/`

| File | Contents |
|---|---|
| `RAT_RACE_MASTER_PLAN_v2.md` ✅ | The master plan, including §10 Session Handoff Log (updated after every session). |
| `RepoStructure.md` 🔧 | This file. |
| `supabase-setup.md` ✅ | Auth settings, redirect allow-list, CAPTCHA, SMTP, MFA, Google provider checklist (H-7). |
| `runbook.md` ✅ | Deploy, rollback, restore drill, how deletions interact with backups. |
| `security.md` ✅ | Completed Threat Register (H-1…H-18), advisor findings explicitly accepted. |
| `a11y.md` ✅ | WCAG 2.2 AA audit list; colour-independence audit. |
| `event-ev.md` ✅ | Expected-value audit sheet for event templates (E.5). |
| `e2e-phase5.md` ✅ | Manual two-browser E2E script (sign-up → conflict → resolve). |
| `credits.md` ✅ | Provenance of every asset (original / commissioned / CC0 / AI-assisted with review). |
| `email-templates/` ✅ | Auth emails (confirm, reset, welcome) and retention notice templates, for pasting into Supabase Auth settings. |

---

### 3.7 `.github/`

| File | Contents |
|---|---|
| `workflows/ci.yml` ✅ | Required PR checks: `content-lint`, `unit-tests`, `sim-smoke`, `determinism`, `secrets-scan`, `a11y-static`, `sql-tests`, `functions-tests`, `migrations-check`. Pinned action SHAs. |
| `workflows/deploy-prod.yml` ✅ | On tag `v*`: manual approval environment → prod migrations → prod functions → Netlify publishes `main`. |
| `workflows/backup.yml` 🔧 | Weekly logical DB dump to private storage (Step 8.6). |
| `dependabot.yml` ✅ | GitHub Actions + npm (dev tools). |
| `CODEOWNERS` ✅ | Owners for `supabase/**`, `public/admin/**`, `netlify.toml`, `.github/**`. |
| `pull_request_template.md` ✅ | Checklist: R13–R21, schema change protocol, migrations, tests. |

---

## 4. Which phase creates which files

| Phase | New files / folders |
|---|---|
| **1** Architecture & UI foundation | `public/index.html`, `config/env.js` (placeholders), all five core CSS files, `js/00`–`19` + `1a-persist.js` + `90-app.js`, `assets/brand/` placeholders, `assets/icons|scenes|avatars/` sources, `dev/tests.html` + `tests/p1-*`, `README.md`, `.gitignore`, `LICENSE`, `docs/` with the master plan |
| **2** Core loop & life systems | `js/20`–`29`, `2a`, `css/turn.css`, `dev/tests/p2-*` |
| **3** Market, deposits, property | `js/30`–`38`, `css/market.css`, `dev/tests/p3-*`, `docs/event-ev.md` |
| **4** Progression & simulator | `js/40`–`44`, `css/progression.css`, `dev/sim.html`, `dev/lint-content.html`, `dev/tests/p4-*`, `determinism.js` |
| **5** Accounts & cloud | `netlify.toml`, `.github/workflows/ci.yml` (skeleton), real `config/env.js`, `vendor/*`, `js/50`–`52`, `54`, `css/account.css`, `supabase/` (config, migrations 0001–0003, tests), `dev/fakes/`, `tools/scan-secrets.mjs`, `tools/bump-version.mjs`, `docs/supabase-setup.md`, `docs/e2e-phase5.md` |
| **6** Lifecycle, premium, admin | Migrations 0004–0006, functions (`lifecycle-sweep`, `stripe-webhook`, checkout, portal, `admin-actions`, `export-my-data`, `delete-my-account`), `js/53`, `55`, `public/admin/*`, `05-data-cosmetics.js`, `css/themes.css`, `tools/bootstrap-admin.sql`, `docs/email-templates/` |
| **7** Content, art, audio, polish | Final art in `assets/*`, regenerated `05-data-icons.js` / `05-data-scenes.js`, `tools/build-icons.mjs`, `build-scenes.mjs`, `build-brand.mjs`, expanded `24-data-events.js` (≥120), `js/70`–`72`, `docs/a11y.md`, `docs/credits.md` |
| **8** Security, CI/CD, launch | Legal pages, final `netlify.toml` CSP, full `ci.yml`, `deploy-prod.yml`, `backup.yml`, `dependabot.yml`, `CODEOWNERS`, PR template, `docs/security.md`, `docs/runbook.md`; optional `0007_leaderboard` + `submit-run` + client-errors table |

Phase 7 can run in parallel after Phase 4.

---

## 5. Environments → repo mapping

| Environment | Source | Backend |
|---|---|---|
| Local OFFLINE | double-click `public/index.html` | none (Guest, localStorage) |
| Local ONLINE | any static server on `http://localhost` | Supabase dev (or local CLI stack) |
| Preview / staging | PR deploy previews + branch `develop` | Supabase dev, Stripe test |
| Production | branch `main` via release tag `vMAJOR.MINOR.PATCH` | Supabase prod, Stripe live |

Branching: feature branch → PR (required checks + 1 review) → squash into `develop` → release tag deploys `main`. Commit style: `phase5: add RR.sync reconcile`.

---

## 6. Placement rules (quick checklist)

1. A secret (service key, Stripe key, webhook secret, SMTP key) under `public/` is a **build-breaking defect**.
2. Engine files (`20`–`23`, `26`–`28`, `30`–`32`, `37`, `38`, `40`, `41`, `44`) must not reference the DOM, `fetch`, the SDK or `RR.entitlements`.
3. Only `50`–`53`, the cloud persist adapter and `public/admin/` may touch the network.
4. No inline `<script>`, `<style>` or `style=""` in any HTML file.
5. Generated files (`05-data-icons.js`, `05-data-scenes.js`) are committed; the generator in `tools/` is optional for contributors.
6. DB changes ship only as new migration files; never edit an applied migration.
7. Art, audio and i18n files must not read or write game state or `RR.rng`.

---

## 7. Where I filled gaps (please confirm)

- **Split of files `13`–`16`:** the plan fixes only `12-ui-stage.js` and `17-ui-screens.js`; I assigned binder/actions, fx, overlays/receipt and panels to `13`–`16`.
- **`RR.replay`, Contacts/Life/Journal UI, audio, i18n, onboarding:** the plan names modules but not files; proposed `29-replay.js`, `2a-ui-life.js`, `70`–`72`.
- **Phase CSS sheets, `admin.css`, `build-brand.mjs`, `backup.yml`:** needed by the plan's own requirements (no inline styles, generated PNGs, weekly dump) but not named.
- **Early `config/env.js`:** the plan creates it in Phase 5 step 5.1, but Phase 1's `index.html` and acceptance test 21 need it, so Phase 1 ships a placeholder.
- **`submit-run` (optional, J-4):** it must replay with the same engine files; the plan doesn't say how the Deno function gets them. Decide this before building Step 8.8.
- **Naming risk (J-10 / H-18):** "Rat Race", "Fast Track" and "Doodads" resemble a well-known commercial board game's vocabulary. Decide on renaming before public launch; the repo name above is a working title.
