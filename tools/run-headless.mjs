#!/usr/bin/env node
/* tools/run-headless.mjs — dev-only. Runs everything that proves Phase 1 without a human:
 *   1. static rules   (no innerHTML/eval/modules/inline handlers/external URLs, rng + clock discipline, size budgets, no secrets)
 *   2. generator drift (icons + scenes sources ↔ committed data files)
 *   3. dev/tests.html over file://  and over http://localhost (a tiny built-in static server)
 *   4. end-to-end in real Chromium: file:// boot with zero console errors (test 10), 16:9 letterboxing at four viewports (test 9),
 *      Guest play → save → reload → Continue, export → import round trip, Next Month stub toast, reduced motion, keyboard, ONLINE-disabled controls (test 21)
 *
 *   node tools/run-headless.mjs            run everything
 *   node tools/run-headless.mjs --no-e2e   static + test page only
 * Needs Playwright with a Chromium build:  npm i --no-save playwright && npx playwright install chromium   (Phase 5's package.json will own this).
 * Exit code 0 = all green, 1 = failures, 2 = Playwright missing. Nothing here ships to players. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const args = new Set(process.argv.slice(2));
const rows = [];
const check = (name, ok, detail = '') => { rows.push({ name, ok: !!ok, detail }); };

// ───────────────────────────── 1. static rules ─────────────────────────────
const read = (p) => fs.readFileSync(p, 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const jsFiles = fs.readdirSync(path.join(PUB, 'js')).filter((f) => f.endsWith('.js')).sort();
const jsText = Object.fromEntries(jsFiles.map((f) => [f, stripComments(read(path.join(PUB, 'js', f)))]));
const hits = (re, allow = []) => jsFiles.filter((f) => !allow.includes(f) && re.test(jsText[f]));

check('R-load: js files are numbered 00…90 and sort in load order', JSON.stringify(jsFiles) === JSON.stringify([...jsFiles].sort()) && jsFiles[0] === '00-namespace.js' && jsFiles.at(-1) === '90-app.js');
check('R1: no ES modules (import/export) in public/js', hits(/^\s*(import\s.+from|export\s)/m).length === 0, hits(/^\s*(import\s.+from|export\s)/m).join(', '));
check('R19: no innerHTML/outerHTML/insertAdjacentHTML/document.write in public/js', hits(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/).length === 0, hits(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/).join(', '));
check('R19: no eval / new Function in public/js', hits(/\beval\s*\(|new\s+Function\b/).length === 0);
check('R5: Math.random only in 14-ui-fx.js (cosmetic particles)', hits(/Math\.random/, ['14-ui-fx.js']).length === 0, hits(/Math\.random/, ['14-ui-fx.js']).join(', '));
check('R5: Date.now/new Date only in util clock + UI timers', hits(/Date\.now|new\s+Date\b/, ['02-util.js', '14-ui-fx.js', '15-ui-overlays.js']).length === 0, hits(/Date\.now|new\s+Date\b/, ['02-util.js', '14-ui-fx.js', '15-ui-overlays.js']).join(', '));
check('Offline-first: no fetch/XHR/WebSocket/sendBeacon in Phase 1', hits(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/).length === 0);
check('Persistence: localStorage touched only by 11-save.js and 1a-persist.js', hits(/localStorage/, ['11-save.js', '1a-persist.js']).length === 0);
const ENGINES = ['03-bus.js', '04-rng.js', '06-schema.js', '07-store.js', '08-finance.js', '09-valuation.js', '10-ledger.js'];
check('R2/R13: engine modules never touch the DOM or the network (bus, rng, schema, store, finance, valuation, ledger)', ENGINES.every((f) => !/\bdocument\.|\bwindow\.(?!RR\b)|\blocation\b|\bfetch\b/.test(jsText[f])), ENGINES.filter((f) => /\bdocument\./.test(jsText[f])).join(', '));
check('Hygiene: no setInterval polling loops', hits(/setInterval/).length === 0);

const html = read(path.join(PUB, 'index.html'));
check('R19: index.html has no inline <script> bodies, <style> blocks, style= attributes or on*= handlers',
  !/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html) && !/<style[\s>]/i.test(html) && !/\sstyle\s*=/i.test(html) && !/\son[a-z]+\s*=/i.test(html));
check('R19: index.html carries a strict meta CSP (script-src self)', /Content-Security-Policy[^>]*script-src 'self'/.test(html));
const external = [...(html + stripComments(read(path.join(PUB, 'css/glass.css')))).matchAll(/https?:\/\/[^\s"')]+/g)].map((m) => m[0]).filter((u) => !u.includes('w3.org'));
check('R19/offline-first: no external URLs in index.html / css', external.length === 0, external.join(', '));
const scriptSrcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
check('A15: index.html loads config/env.js then every js file in order', JSON.stringify(scriptSrcs) === JSON.stringify(['config/env.js', ...jsFiles.map((f) => 'js/' + f)]), scriptSrcs.length + ' scripts');
const envText = read(path.join(PUB, 'config/env.js'));
check('R14: env.js holds only the four public keys (no secret-looking values)', !/service_role|secret|sk_live|sk_test|eyJ[A-Za-z0-9_-]{20,}/i.test(stripComments(envText)) && /__PLACEHOLDER__/.test(envText));
const allText = jsFiles.map((f) => read(path.join(PUB, 'js', f))).join('\n') + envText + html;
check('R14: no secrets anywhere in public/', !/service_role|sk_live_|sk_test_|eyJ[A-Za-z0-9_-]{30,}\./i.test(allText));

const size = (p) => fs.statSync(p).size;
const cssTotal = fs.readdirSync(path.join(PUB, 'css')).reduce((n, f) => n + size(path.join(PUB, 'css', f)), 0);
check('Budget: CSS ≤ 70 KB', cssTotal <= 70 * 1024, (cssTotal / 1024).toFixed(1) + ' KB');
check('Budget: icon sprite ≤ 60 KB', size(path.join(PUB, 'js/05-data-icons.js')) <= 60 * 1024, (size(path.join(PUB, 'js/05-data-icons.js')) / 1024).toFixed(1) + ' KB');
check('Budget: scenes ≤ 80 KB', size(path.join(PUB, 'js/05-data-scenes.js')) <= 80 * 1024);
const jsTotal = jsFiles.reduce((n, f) => n + size(path.join(PUB, 'js', f)), 0);
check('Budget: JS total ≤ 600 KB (informational ceiling)', jsTotal <= 600 * 1024, (jsTotal / 1024).toFixed(1) + ' KB');
for (const f of jsFiles) { check(`header: ${f} starts with a comment and "use strict" present`, /^\/\*/.test(read(path.join(PUB, 'js', f)).trimStart()) && /'use strict'/.test(read(path.join(PUB, 'js', f)))); }

// ───────────────────────────── 2. generator drift ─────────────────────────────
for (const tool of ['build-icons', 'build-scenes']) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', tool + '.mjs'), '--check'], { encoding: 'utf8' });
  check(`${tool} --check (committed data matches sources)`, r.status === 0, (r.stdout + r.stderr).trim());
}

// ───────────────────────────── 3/4. browser ─────────────────────────────
let chromium;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
if (!chromium) {
  report();
  console.error('\nPlaywright is not installed, so the browser checks were skipped.\n  npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const HTTP = `http://127.0.0.1:${server.address().port}`;
const FILE = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const browser = await chromium.launch();

async function openPage(url, viewport = { width: 1920, height: 1080 }, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, ...ctxOpts });
  const page = await ctx.newPage(); const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') { problems.push('console.error: ' + m.text()); } });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
  await page.goto(url);
  return { ctx, page, problems };
}

async function runTestPage(label, url) {
  const { ctx, page, problems } = await openPage(url, { width: 1280, height: 720 });
  try {
    await page.waitForFunction(() => window.__RR_TESTS__ && window.__RR_TESTS__.done, null, { timeout: 90000 });
    const r = await page.evaluate(() => window.__RR_TESTS__);
    check(`dev/tests.html (${label}): all ${r.total} tests pass`, r.failed === 0, r.results.filter((x) => !x.ok).map((x) => `#${x.id}: ${x.error.split('\n')[0]}`).join(' | '));
    for (const t of r.results.filter((x) => /^\d+$/.test(x.id))) { check(`  acceptance #${t.id} (${label})`, t.ok, t.ok ? '' : t.error.split('\n')[0]); }
    check(`dev/tests.html (${label}): zero console errors`, problems.length === 0, problems.join(' | '));
  } catch (e) { check(`dev/tests.html (${label}) finished`, false, e.message); }
  await ctx.close();
}
await runTestPage('file://', FILE('dev/tests.html'));
await runTestPage('http://localhost', HTTP + '/dev/tests.html');

if (!args.has('--no-e2e')) { try {
  // ── test 10 + 21 (offline): boot from file:// ──
  {
    const { ctx, page, problems } = await openPage(FILE('public/index.html'));
    await page.waitForSelector('#screen-title');
    const info = await page.evaluate(() => ({ booted: RR.app.booted, mode: RR.env.mode, errs: RR._errors.length, signin: document.getElementById('btn-signin').getAttribute('aria-disabled'), tooltip: document.getElementById('btn-signin').title }));
    check('E2E #10 index.html over file:// boots with zero console errors', info.booted && problems.length === 0 && info.errs === 0, problems.join(' | '));
    check('E2E #21 file:// ⇒ RR.env.mode OFFLINE; Sign-in disabled with a reason', info.mode === 'OFFLINE' && info.signin === 'true' && /hosted version/.test(info.tooltip), JSON.stringify(info));

    // keyboard: the first Tab stop is a real control; Enter on "New Game" opens the form
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    check('E2E keyboard: Title is tabbable', focusedTag === 'BUTTON' || focusedTag === 'A', focusedTag);

    // Guest play
    await page.click('#btn-new'); await page.waitForSelector('#screen-newgame');
    await page.fill('#ng-name', 'Rin'); await page.click('label.choice:has(input[name="profession"][value="nurse"])'); await page.fill('#ng-seed', '777');
    await page.click('#ng-start'); await page.waitForSelector('#btn-next');
    const g = await page.evaluate(() => { const s = RR.store.get(); return { status: s.loop.status, name: s.player.name, prof: s.player.professionId, seed: s.meta.rng.seed, cash: document.querySelector('#hud [data-bind="player.financials.cash"]').textContent, saved: RR.save.has(), cf: document.getElementById('hero-cashflow').textContent }; });
    check('E2E #21 Guest play works offline (Nurse, seed 777)', g.status === 'RUNNING' && g.prof === 'nurse' && g.seed === 777 && g.cash === '$3,500' && g.saved, JSON.stringify(g));
    check('E2E ledger shows Nurse starter cash flow +$1,027', g.cf === '+$1,027', g.cf);

    // Next Month = stub (no state change, info toast)
    const rev0 = await page.evaluate(() => RR.store.get().meta.revision);
    await page.click('#btn-next'); await page.waitForSelector('.toast');
    const stub = await page.evaluate(() => ({ toast: document.querySelector('.toast').textContent, rev: RR.store.get().meta.revision }));
    check('E2E Next Month is a stub: info toast "Phase 2", no state change', /Phase 2/.test(stub.toast) && stub.rev === rev0, JSON.stringify(stub));

    // autosave → reload → Continue
    await page.evaluate(() => RR.save.flush()); const rev1 = await page.evaluate(() => RR.store.get().meta.revision);
    await page.reload(); await page.waitForSelector('#btn-continue');
    const cont = await page.textContent('#btn-continue');
    check('E2E Title offers Continue with the saved game summary', /Rin/.test(cont) && /net worth/.test(cont), cont.replace(/\s+/g, ' '));
    await page.click('#btn-continue'); await page.waitForSelector('#btn-next');
    const restored = await page.evaluate(() => { const s = RR.store.get(); return { name: s.player.name, rev: s.meta.revision, hero: document.querySelector('.hero__name').textContent }; });
    check('E2E reload → Continue restores the exact game', restored.name === 'Rin' && restored.rev === rev1 && restored.hero === 'Rin', JSON.stringify(restored));

    // export → import round trip through the real file picker / download
    await page.click('#btn-settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="game.export"]')]);
    const file = path.join(ROOT, '.tmp-export.json'); await download.saveAs(file);
    const exported = JSON.parse(read(file));
    check('E2E export downloads a rr.save envelope', exported.format === 'rr.save' && exported.state.player.name === 'Rin' && !('derived' in exported.state) && /^rat-race_rin_turn0\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    await page.evaluate(() => RR.store.commit('t.change', (s) => { s.player.financials.cash += 12345; }));
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action="game.import"]')]);
    await chooser.setFiles(file);
    await page.waitForSelector('[data-modal-id="confirm-import"]');
    await page.click('[data-modal-action="confirm"]'); await page.waitForTimeout(300);
    const imp = await page.evaluate(() => RR.store.get().player.financials.cash);
    check('E2E import replaces the game with the exported one (confirm first)', imp === 3500, 'cash ' + imp);
    fs.rmSync(file, { force: true });
    check('E2E whole session: zero console errors', problems.length === 0, problems.join(' | '));
    await ctx.close();
  }

  // ── test 9: real 16:9 letterboxing ──
  for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1080], [1000, 1000]]) {
    const { ctx, page } = await openPage(FILE('public/index.html'), { width: w, height: h });
    await page.waitForSelector('#screen-title');
    const r = await page.evaluate(() => { const b = document.getElementById('stage').getBoundingClientRect(); return { w: b.width, h: b.height, l: b.left, t: b.top, vw: innerWidth, vh: innerHeight }; });
    const ok = Math.abs(r.w / r.h - 16 / 9) < 0.005 && r.l >= -0.5 && r.t >= -0.5 && r.l + r.w <= r.vw + 0.5 && r.t + r.h <= r.vh + 0.5 && Math.abs(r.l - (r.vw - r.w) / 2) < 1 && Math.abs(r.t - (r.vh - r.h) / 2) < 1;
    check(`E2E #9 stage is 16:9, centred and fully visible at ${w}×${h}`, ok, `${r.w.toFixed(0)}×${r.h.toFixed(0)} @ (${r.l.toFixed(0)},${r.t.toFixed(0)})`);
    await ctx.close();
  }
  { // small viewport notice
    const { ctx, page } = await openPage(FILE('public/index.html'), { width: 800, height: 600 });
    await page.waitForSelector('#screen-title', { state: 'attached' });
    check('E2E viewports under 900px wide show the "use a larger screen" notice', await page.isVisible('#small-notice'));
    await ctx.close();
  }
  { // reduced motion (OS preference) forces animations off
    const { ctx, page } = await openPage(FILE('public/index.html'), { width: 1920, height: 1080 }, { reducedMotion: 'reduce' });
    await page.waitForSelector('#screen-title');
    await page.evaluate(() => RR.ui.overlays.toast.show('hello', { tone: 'info' }));
    const rm = await page.evaluate(() => ({ anim: RR.settings.get('animations'), fx: RR.settings.get('reducedFx'), cls: document.querySelector('.toast').className, attr: document.documentElement.getAttribute('data-motion') }));
    check('E2E prefers-reduced-motion ⇒ animations off, no animation classes', rm.anim === false && rm.fx === true && !/is-anim/.test(rm.cls) && rm.attr === 'reduced', JSON.stringify(rm));
    await ctx.close();
  }
  { // test 21 (online): http ⇒ ONLINE with placeholders ⇒ controls still disabled; guest play still works
    const { ctx, page, problems } = await openPage(HTTP + '/public/index.html');
    await page.waitForSelector('#screen-title');
    const info = await page.evaluate(() => ({ mode: RR.env.mode, name: RR.env.name, configured: RR.env.configured, signin: document.getElementById('btn-signin').getAttribute('aria-disabled') }));
    check('E2E #21 http://localhost ⇒ ONLINE (dev), placeholders ⇒ not configured, Sign-in disabled', info.mode === 'ONLINE' && info.name === 'dev' && info.configured === false && info.signin === 'true', JSON.stringify(info));
    await page.click('#btn-guest'); await page.click('#ng-start'); await page.waitForSelector('#btn-next');
    check('E2E guest play also works over http with zero console errors', problems.length === 0 && (await page.evaluate(() => RR.store.get().loop.status)) === 'RUNNING', problems.join(' | '));
    await ctx.close();
  }
} catch (e) { check('E2E completed without aborting', false, String(e.message).split('\n')[0]); } }

await browser.close(); server.close();
report();
process.exit(rows.some((r) => !r.ok) ? 1 : 0);

function report() {
  const w = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) { console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(w)}${r.detail && (!r.ok || r.detail.length < 60) ? '  ' + r.detail : ''}`); }
  const bad = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - bad}/${rows.length} checks passed${bad ? ` — ${bad} FAILED` : ''}`);
}
