# Rat Race

A financial-literacy strategy game. Build passive income, manage cash flow and risk, and escape the Rat Race.
Plain HTML/CSS/JavaScript — **no build step, no framework, no network needed to play**. Open `public/index.html` and play.

> **Status: Phase 1 complete — Architecture & UI Foundation.** The Living Ledger is live and bound to a v2 state schema; the turn engine, events, market and accounts arrive in later phases.
> The plan lives in `docs/RAT_RACE_MASTER_PLAN_v2.md`; the file map in `docs/RepoStructure.md`; the next session starts from `Phase2HandOver.md`.

## Run it

| How | Steps |
|---|---|
| Double-click | Open `public/index.html` in a current Chrome, Edge, Firefox or Safari. Works from `file://` — it boots **OFFLINE** (Guest play, saves in this browser). |
| Local server | `cd public && python3 -m http.server 8080` → <http://localhost:8080>. Boots as **ONLINE (dev)**; online controls stay disabled until Phase 5 supplies real keys in `public/config/env.js`. |

Developer tools: **Ctrl+Shift+D** opens the dev drawer (load fixtures `starter`, `rich_rat_race`, `escape_ready`, `broke`, `healthy_saver`, `neglected`; set cash; dump state; run recompute). It is disabled when `RR.env.name === 'prod'`.

## Test it

| What | How |
|---|---|
| In-browser suite (46 tests: all 22 Phase 1 acceptance tests + 24 supporting tests) | Open `dev/tests.html` — it auto-runs and shows a PASS/FAIL list. No libraries, no network. |
| Everything, headless (static rules, generator drift, test page over `file://` + `http://`, real-browser E2E) | `npm i --no-save playwright && npx playwright install chromium`, then `node tools/run-headless.mjs` (118 checks). Exit code 0 = green. |

## Layout

```
public/                 ← the shipped site (this folder is the Netlify publish dir in Phase 5)
  index.html            stage root, mount points, <template>s, ordered <script> tags
  config/env.js         PUBLIC values only (placeholders until Phase 5)
  css/                  tokens · base · glass · ledger · modes
  js/                   classic scripts, loaded in filename order (numbers sort first; "1a"/"1b" sort after "19")
  assets/               brand/ (logo, favicon, og placeholder) · icons/ + scenes/ (SVG/JSON sources) · avatars/ (design notes)
dev/                    tests.html + tests/ + fakes/ (never shipped)
tools/                  build-icons.mjs · build-scenes.mjs · run-headless.mjs (dev only)
docs/                   master plan + repo structure
```

### JavaScript modules (`public/js`, one global: `window.RR`)

| Files | Module(s) | Role |
|---|---|---|
| `00`–`04` | namespace · `RR.config` · `RR.util` · `RR.bus` · `RR.rng` | foundations (seeded RNG with 4 independent saved streams) |
| `05-data-*` | `RR.data.*` | professions, stocks, dreams, glossary, NPC templates, icons + scenes (**generated**) |
| `06`–`07` | `RR.schema` · `RR.store` | State Schema v2; the only mutation gateway (`commit`/`batch`/`replace`) |
| `08`–`10` | `RR.finance` · `RR.valuation` · `RR.ledger` | pure money math → `derived` |
| `11`, `1a` | `RR.save` · `RR.env` · `RR.settings` · `RR.persist` | persistence, environment, settings, storage adapters |
| `12`–`17` | `RR.ui.*` | stage, binder, fx, overlays (toast/modal/tooltip/receipts), panels, screens |
| `18`, `19` | `RR.dev` · `RR.ui.icon/avatar/scene` | fixtures + dev drawer; code-drawn art |
| `1b-stubs` | stub registry | `NOT_IMPLEMENTED` placeholders later phases overwrite |
| `90-app` | `RR.app.boot()` | single entry point |

### Rules that keep it correct (see plan §0.3)
State changes **only** through `RR.store.commit` · the UI never mutates state and never uses `innerHTML` · money is integer dollars · randomness only from `RR.rng` · every tunable lives in `RR.config` · `derived` is recomputed, never stored · saved/imported data is validated before use.

## Regenerating art data
`node tools/build-icons.mjs` (93 icons → `05-data-icons.js`) and `node tools/build-scenes.mjs` (12 scenes → `05-data-scenes.js`); add `--check` in CI to detect drift. Never edit the generated files by hand.

## Licence
Not chosen yet — see `LICENSE` (placeholder). All art is original.
