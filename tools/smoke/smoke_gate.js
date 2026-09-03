#!/usr/bin/env node
/* ============================================================================
 * tools/smoke/smoke_gate.js — the runtime gate. Item 0 on every list since
 * 19 Aug 2026, and the reason is four defects in one night.
 * ----------------------------------------------------------------------------
 * THE PROBLEM IT EXISTS FOR. The wall is 157 suites of static assertions. Not one
 * of them can tell whether a browser can USE the code they are reading. Four
 * defects escaped a green wall on 19 Aug and every one was the same shape —
 * correct-looking source the browser could not use:
 *
 *   1. `.is-modal` CSS rules targeting a class no JS ever applies. Asserted as
 *      rule TEXT; matched nothing in the live document.
 *   2. Script tags moved by line index, leaving their `<!--` behind. Two modules
 *      ended up inside an unterminated comment and never loaded. Production down,
 *      wall green, files returning 200 by hand.
 *   3. `window.selectedNodeData` reads of a top-level `let`. Global LEXICAL scope
 *      is not `window`; the read returns undefined and fails SILENTLY.
 *   4. onchange="slNodeIdentitySet("kind", this.value)" — the inner quote ends the
 *      attribute, the browser discards the handler, the dropdown does nothing.
 *      45 string assertions passed over it because they read the SOURCE and the
 *      defect was in the OUTPUT.
 *
 * ACCEPTANCE: reintroducing any one of those four turns this gate red.
 *
 * WHERE IT RUNS. Against ./dist AFTER the build and BEFORE the deploy — a check
 * that loads production can only run once production already has the bad build,
 * which makes it a post-mortem, not a gate. The Cloudflare-specific failures
 * (stale pins, SPA fallback, edge cache) are a different class and are covered by
 * the byte-size control probe in the live-verification recipe.
 *
 * The local server replays the SAME CSP as production, read live out of worker.js
 * so the two cannot drift — defect 3's workaround (`sl_env.js`) exists precisely
 * because `eval` is unavailable under that CSP, and a gate running without it
 * would not be running the same app.
 *
 * Usage:  node tools/smoke/smoke_gate.js [--src] [--keep-open]
 *           --src   gate ./site instead of ./dist (dev loop; the ship gates dist)
 * Env:    SMOKE_SKIP=1   skip entirely (prints loudly; for a knowing override)
 *         CHROME_PATH    point at a browser binary
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { launch, Cdp, evaluate, freePort, sleep } = require('./cdp.js');

const ROOT = path.join(__dirname, '..', '..');
const USE_SRC = process.argv.includes('--src');
const SERVE_DIR = path.join(ROOT, USE_SRC ? 'site' : 'dist');

let pass = 0, fail = 0;
const results = [];
const check = (name, ok, detail) => {
    if (ok) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
    results.push({ name, ok, detail });
};

// ---------------------------------------------------------------- the real CSP
function productionCsp() {
    const src = fs.readFileSync(path.join(ROOT, 'worker.js'), 'utf8');
    const m = src.match(/const CSP_POLICY = (\[[\s\S]*?\]\.join\('; '\))\s*;/);
    if (!m) throw new Error('Could not extract CSP_POLICY from worker.js — the gate refuses to run '
                          + 'with a guessed policy, because a wrong CSP either hides a real defect '
                          + 'or invents one.');
    const full = new Function('return ' + m[1])();
    // upgrade-insecure-requests would rewrite our http://127.0.0.1 asset URLs to
    // https. Dropped for the local run, and said out loud rather than silently.
    const directives = full.split('; ').filter(d => d.trim() !== 'upgrade-insecure-requests');
    return { header: directives.join('; '), dropped: full.split('; ').length !== directives.length };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };

// A deliberately DUMB server: a missing file is a 404, not the SPA shell.
// Production's fallback returns 200 + the ~340KB app shell for anything missing,
// which is exactly how a script tag pointing at a file that does not exist stays
// invisible. Here it is a hard 404 and the gate counts it.
function serve(dir, csp) {
    const missing = [];
    const server = http.createServer((req, res) => {
        const url = decodeURIComponent(req.url.split('?')[0]);
        let rel = url === '/' ? '/index.html' : url;
        const file = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
        fs.readFile(file, (err, buf) => {
            if (err) {
                missing.push(rel);
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('not found');
            }
            const h = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
                        'Content-Security-Policy': csp };
            res.writeHead(200, h);
            res.end(buf);
        });
    });
    return { server, missing };
}

// ---------------------------------------------------------------- the checks
// Written from the four escapes, not from the code. Each names the defect it
// would have caught, so a future edit cannot quietly weaken one without saying so.
async function run() {
    if (process.env.SMOKE_SKIP === '1') {
        console.log('\n!! SMOKE GATE SKIPPED (SMOKE_SKIP=1). Shipping unverified at runtime. !!\n');
        process.exit(0);
    }
    if (!fs.existsSync(SERVE_DIR)) {
        console.error('No ' + path.basename(SERVE_DIR) + '/ to gate — run ./build.sh first.');
        process.exit(1);
    }

    const csp = productionCsp();
    console.log('── runtime smoke gate ───────────────────────────────');
    console.log('serving   : ' + path.relative(ROOT, SERVE_DIR) + '/');
    console.log('CSP       : replayed from worker.js' + (csp.dropped ? ' (upgrade-insecure-requests dropped for http://127.0.0.1)' : ''));

    const port = await freePort();
    const { server, missing } = serve(SERVE_DIR, csp.header);
    await new Promise(r => server.listen(port, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + port + '/';

    let browser = null, cdp = null, code = 1;
    try {
        browser = await launch();
        console.log('browser   : ' + browser.bin);
        cdp = await Cdp.connect(browser.wsUrl);

        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

        // Collect everything the page complains about, from BEFORE navigation, so
        // boot errors cannot slip past while we are still attaching. Defect 2 was
        // 1000+ ReferenceErrors; nothing was watching for them.
        const errors = [], consoleErrors = [];
        cdp.on(m => {
            if (m.sessionId !== sessionId) return;
            if (m.method === 'Runtime.exceptionThrown') {
                const e = m.params.exceptionDetails;
                errors.push((e.exception && (e.exception.description || e.exception.value)) || e.text || 'unknown');
            }
            if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
                consoleErrors.push(m.params.entry.text + (m.params.entry.url ? ' @ ' + m.params.entry.url : ''));
            }
        });
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Log.enable', {}, sessionId);
        await cdp.send('Page.enable', {}, sessionId);

        const loaded = new Promise(res => {
            const off = m => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') res(); };
            cdp.on(off);
        });
        await cdp.send('Page.navigate', { url: base }, sessionId);
        await Promise.race([loaded, sleep(20000)]);
        await sleep(2500);   // deferred scripts + the app's own boot timers

        console.log('');

        // ---- [1] boot ---------------------------------------------------------
        // Catches defect 2 (script tags swallowed by a comment) and any runtime
        // throw at load. Both were invisible to the wall.
        check('the page boots with no uncaught exceptions', errors.length === 0,
              errors.slice(0, 3).join(' | '));

        // Third-party origins are NOT this gate's business. It has to run on a
        // laptop with no internet and on a CI box behind a proxy, and a CDN that
        // is unreachable here says nothing about whether THIS BUILD works. Errors
        // that belong to our own origin are a different matter — those are the
        // build. Split them, fail on ours, report theirs.
        const ourErrors = consoleErrors.filter(e => !/https?:\/\/(?!127\.0\.0\.1)/.test(e));
        const theirErrors = consoleErrors.filter(e => /https?:\/\/(?!127\.0\.0\.1)/.test(e));
        check('no error-level console entries from our own origin', ourErrors.length === 0,
              ourErrors.slice(0, 3).join(' | '));
        if (theirErrors.length) {
            console.log('  note  ' + theirErrors.length + ' third-party resource error(s) — not gated: '
                        + theirErrors.slice(0, 2).map(e => e.slice(0, 90)).join(' | '));
        }
        check('every script tag resolves to a real file (no 404s)', missing.length === 0,
              missing.slice(0, 5).join(', '));

        // ---- [2] the globals the app is built out of --------------------------
        // Defect 2 made these vanish while every static check stayed green.
        const globals = await evaluate(cdp, sessionId, `JSON.stringify({
            esc: typeof esc, getActiveFTARoot: typeof getActiveFTARoot,
            SLEnv: typeof SLEnv, SLNodeIdentity: typeof SLNodeIdentity,
            SLMacLanes: typeof SLMacLanes, AutoReq: typeof AutoReq,
            SafetyLabNumbering: typeof SafetyLabNumbering,
            openNodeProps: typeof openNodePropertiesModal,
            loadSample: typeof loadSampleProject
        })`);
        const g = JSON.parse(globals);
        const missingGlobals = Object.keys(g).filter(k => g[k] === 'undefined');
        check('the load-bearing globals are all defined', missingGlobals.length === 0,
              'missing: ' + missingGlobals.join(', '));

        // ---- [2b] undo/autosave wrapping actually took (20 Aug 2026) -----------
        // The static wall can prove a name is on _UNDO_TARGETS. It CANNOT prove the
        // wrapper found it: _wrapForUndoAndAutosave reads window[name] at DOMContentLoaded
        // and skips anything unresolved, so a rename or a load-order change silently
        // un-saves an action while the source still lists it. That is the exact shape of
        // the defect being fixed — an hour of authoring that never reaches the snapshot —
        // so it needs a RUNTIME check, in a real browser, after the real boot.
        // NOTE the check is against window._UNDO_WRAPPED, not against a marker read back off
        // each function. Nine modules here monkey-patch by name and the last one to wrap drops
        // everyone else's flags — reading the marker reported submitACFHA/PRA/ZSA/CMA as
        // unwrapped while they were demonstrably still saving. _UNDO_WRAPPED is written at wrap
        // time and cannot be clobbered, so it answers the question we actually care about:
        // did OUR wrap reach every action.
        const undoCov = await evaluate(cdp, sessionId, `JSON.stringify({
            targets:    (window._UNDO_TARGETS || []).length,
            unresolved: window._UNDO_UNRESOLVED || null,
            missed:     (window._UNDO_TARGETS || []).filter(function(n){
                            return (window._UNDO_WRAPPED || []).indexOf(n) === -1;
                        })
        })`);
        const uc = JSON.parse(undoCov);
        check('the undo/autosave target list survived the build', uc.targets > 30, 'targets: ' + uc.targets);
        check('every undo/autosave target RESOLVED at boot (an unresolved name never saves)',
              Array.isArray(uc.unresolved) && uc.unresolved.length === 0,
              'unresolved: ' + JSON.stringify(uc.unresolved));
        check('every target was actually wrapped for undo/autosave',
              Array.isArray(uc.missed) && uc.missed.length === 0,
              'never wrapped: ' + JSON.stringify(uc.missed));

        // ---- [2c] the project-store declaration is live and round-trips --------
        // 20 Aug 2026 — the autosave, the cloud push, the new-project reset and the load
        // path all now DERIVE from project_stores.js. Static tests can prove the list is
        // complete; only a browser can prove the accessors actually reach the lexical
        // bindings. If a get() closure silently throws, snapshot() omits that store and
        // every save quietly stops carrying it — exactly the class of bug being fixed.
        const stores = await evaluate(cdp, sessionId, `(function(){
            try {
                if (!window.SLStores) return JSON.stringify({ ok:false, why:'SLStores missing' });
                var keys = SLStores.keys();
                var snap = SLStores.snapshot();
                var missing = keys.filter(function(k){ return !(k in snap); });
                // Round-trip a marker through the REAL accessors on a store we can safely
                // touch, then put the original back.
                var s = SLStores.byKey('acFcimData');
                var before = s.get();
                s.set([{ __smoke: true }]);
                var seen = SLStores.snapshot().acFcimData;
                s.set(before);
                var restored = SLStores.snapshot().acFcimData === before;
                return JSON.stringify({ ok:true, keys:keys.length, missing:missing,
                    roundTrip: !!(seen && seen[0] && seen[0].__smoke), restored:restored,
                    contentKeys: SLStores.contentKeys().length,
                    emptyShapeScoresZero: SLStores.contentItems({ ftaPages:[{id:'p',root:null}] }) === 0 });
            } catch (e) { return JSON.stringify({ ok:false, why:String(e && e.message) }); }
        })()`);
        const st = JSON.parse(stores);
        check('the project-store declaration loaded', st.ok === true, st.why || '');
        check('every declared store is reachable through its accessor',
              st.ok && Array.isArray(st.missing) && st.missing.length === 0,
              'snapshot() omitted: ' + JSON.stringify(st.missing));
        check('a value written through set() comes back out of snapshot()', st.roundTrip === true);
        check('…and the original value is restored afterwards', st.restored === true);
        check('the content-item counter agrees the blank-page shape is empty',
              st.emptyShapeScoresZero === true,
              'this is the shape four destroyed projects collapsed to — it must score 0');

        // ---- [2d] wrap markers actually accumulate in a real browser -----------
        // Static checks can prove every wrap site CALLS preserve. Only a browser, after
        // the real boot with every module installed in its real order, can show whether
        // the markers survived. Before this, _writeAutosave carried one marker of three.
        const marks = await evaluate(cdp, sessionId, `(function(){
            function m(fn){ try { return Object.getOwnPropertyNames(fn)
                .filter(function(k){ return /Wrapped$/.test(k) || /^_wrapped/.test(k); }); }
                catch(e){ return []; } }
            return JSON.stringify({
                slwrap: typeof window.SLWrap,
                writeAutosave: m(window._writeAutosave),
                updateDashboard: m(window.updateDashboard)
            });
        })()`);
        const mk = JSON.parse(marks);
        check('the marker preserver is loaded', mk.slwrap === 'object');
        // ring + cloud + tab_guard all wrap _writeAutosave; all three flags must survive.
        check('_writeAutosave keeps all three wrappers\' markers',
              Array.isArray(mk.writeAutosave) && mk.writeAutosave.length >= 3,
              'markers present: ' + JSON.stringify(mk.writeAutosave) +
              ' — a missing flag means that module\'s "am I installed?" guard reads false');

        // ---- [3] the lexical-globals bridge -----------------------------------
        // Defect 3: window[name] reads of top-level `let` return undefined and fail
        // silently. sl_env.js exists for this; if it stops reaching a binding, the
        // feature that reads through it renders blank with NO error anywhere.
        const envReport = await evaluate(cdp, sessionId,
            `JSON.stringify((typeof SLEnv !== 'undefined' && SLEnv.report) ? SLEnv.report() : {})`);
        const env = JSON.parse(envReport);
        const needed = ['ftaPages', 'systemsData', 'projectConfig', 'esc'];
        const unreachable = needed.filter(k => !env[k] || String(env[k]).toUpperCase().indexOf('MISSING') >= 0);
        check('SLEnv reaches the app\'s lexical state (ftaPages, systemsData, projectConfig, esc)',
              unreachable.length === 0, 'unreachable: ' + unreachable.join(', '));

        // ---- [4] auth initialises --------------------------------------------
        // NOT a sign-in. No credentials are involved and none ever should be — this
        // asserts the auth path bootstrapped without throwing, which is what died
        // when SUPABASE_PROJECT_URL vanished inside the comment on 19 Aug.
        const auth = await evaluate(cdp, sessionId, `JSON.stringify({
            supabaseConfigured: (function(){ try { return !!SLEnv.get('SUPABASE_PROJECT_URL') || typeof supabase !== 'undefined' || typeof _slSupabase !== 'undefined'; } catch(e){ return false; } })(),
            // checkEula hangs off window.SafetyLab, not a bare global. Probing the
            // bare name reported 'undefined' and looked like a boot failure on the
            // gate's first run — the probe was wrong, not the app.
            eulaFn: (window.SafetyLab && typeof window.SafetyLab.checkEula) || 'undefined',
            safetyLabNs: typeof window.SafetyLab,
            shellRendered: !!document.querySelector('body') && document.body.innerHTML.length > 5000
        })`);
        const a = JSON.parse(auth);
        check('the auth/EULA path bootstrapped without throwing', a.eulaFn === 'function', 'checkEula: ' + a.eulaFn);
        check('the app shell rendered', a.shellRendered === true);

        // ---- [5] a project loads ---------------------------------------------
        // Signed out, using the app's own sample loader — the gate never touches
        // cloud projects and never needs a password.
        const sample = await evaluate(cdp, sessionId,
            `(async () => { try { await loadSampleProject(); } catch(e) { return 'ERR ' + String(e).slice(0,120); }
              return JSON.stringify({ pages: (SLEnv.get('ftaPages')||[]).length }); })()`);
        let pages = 0;
        try { pages = JSON.parse(sample).pages; } catch (_) {}
        check('the sample project loads and produces fault-tree pages', pages > 0, String(sample).slice(0, 140));

        // ---- [6] the drawer opens and the identity block RENDERS ---------------
        // Defect 3 shipped C1 invisible: the block was mounted and wrote an empty
        // string. "The code is there" is not the same as "the user sees it".
        const drawer = await evaluate(cdp, sessionId, `(function(){
            var pages = SLEnv.get('ftaPages') || [];
            // Open the FTA view first. Without it the drawer is mounted inside a
            // container the app has never shown, so it reports display:none and
            // zero width — which on the gate's first run looked like a layout
            // regression and was actually the probe skipping a step a user takes.
            try { if (pages[0] && typeof openFTAPageById === 'function') openFTAPageById(pages[0].id); } catch(e){}
            var node = null;
            (function walk(n){ if(!n || node) return;
                if (n.type === 'basic' || n.type === 'undeveloped') { node = n; return; }
                var k = n.children || n._children; if (k) k.forEach(walk);
            })(pages[0] && pages[0].root);
            if (!node) node = pages[0] && pages[0].root;
            if (!node) return JSON.stringify({ err: 'no node in the sample project' });
            try { openNodePropertiesModal(node); } catch(e){ return JSON.stringify({ err: String(e).slice(0,120) }); }
            var panel = document.getElementById('node-config-panel');
            var host  = document.getElementById('config-identity-host');
            return JSON.stringify({
                panelExists: !!panel,
                panelVisible: !!(panel && getComputedStyle(panel).display !== 'none' && panel.offsetWidth > 0),
                liveSelectorMatches: document.querySelectorAll('#node-config-panel[style*="display: block"]').length,
                hostExists: !!host,
                hostHtmlLen: host ? host.innerHTML.length : 0,
                hostSelects: host ? host.querySelectorAll('select').length : 0
            });
        })()`);
        const d = JSON.parse(drawer);
        check('the node-properties drawer opens and is visibly laid out',
              d.panelExists && d.panelVisible, JSON.stringify(d));
        // Defect 1: the live selector is the one that must match. `.is-modal` was
        // asserted as CSS text and matched nothing in the document.
        check('the LIVE drawer selector matches an element (not just a CSS rule)',
              d.liveSelectorMatches === 1, 'matches: ' + d.liveSelectorMatches);
        check('the identity block renders real content, not an empty string',
              d.hostExists && d.hostHtmlLen > 200, 'host html length: ' + d.hostHtmlLen);
        check('the identity block renders at least one dropdown', d.hostSelects > 0,
              'selects: ' + d.hostSelects);

        // ---- [7] the markup is USABLE, and the dropdown actually advances -------
        // Defect 4. The kind select rendered perfectly and could not do anything,
        // because its handler attribute was terminated early by an inner quote.
        // "It renders" would have shipped this bug a second time.
        const attrs = await evaluate(cdp, sessionId, `(function(){
            var host = document.getElementById('config-identity-host');
            if (!host) return JSON.stringify({ err: 'no host' });
            var html = host.innerHTML;
            var tags = html.match(/<[^>]+>/g) || [];
            // A closing quote followed by anything but whitespace, '>' or '/' means
            // the attribute value ended in the middle of itself. Counting quotes for
            // evenness does NOT catch this: onclick="f("x")" has four.
            var truncated = tags.filter(function(t){ return /="[^"]*"[^\\s>\\/]/.test(t); });
            return JSON.stringify({ tagCount: tags.length, truncated: truncated.slice(0,2) });
        })()`);
        const at = JSON.parse(attrs);
        check('no attribute in the identity block is terminated early by an unescaped quote',
              (at.truncated || []).length === 0, (at.truncated || []).join(' | '));

        const advance = await evaluate(cdp, sessionId, `(function(){
            var host = document.getElementById('config-identity-host');
            var before = host ? host.querySelectorAll('select').length : 0;
            var kind = document.getElementById('ni-kind');
            if (!kind) return JSON.stringify({ err: 'no kind select rendered' });
            var opts = Array.prototype.map.call(kind.options, function(o){ return o.value; }).filter(Boolean);
            if (!opts.length) return JSON.stringify({ err: 'kind select has no selectable options' });
            kind.value = opts[0];
            // Drive it the way a user does — the event, not the internal function.
            kind.dispatchEvent(new Event('change', { bubbles: true }));
            var after = host ? host.querySelectorAll('select').length : 0;
            return JSON.stringify({ chosen: opts[0], before: before, after: after,
                                    handlerAttr: !!kind.getAttribute('onchange') });
        })()`);
        const adv = JSON.parse(advance);
        check('changing the kind dropdown ADVANCES the form (progressive disclosure works)',
              adv.after > adv.before, JSON.stringify(adv));

        code = fail === 0 ? 0 : 1;
    } catch (e) {
        console.log('  FAIL  the gate could not run — ' + String(e.message || e).split('\n')[0]);
        console.log('\n' + String(e.message || e));
        fail++;
        code = 1;
    } finally {
        if (cdp) cdp.close();
        if (browser) { try { browser.proc.kill('SIGKILL'); } catch (_) {} }
        server.close();
    }

    console.log('');
    if (fail === 0) console.log('SMOKE GATE GREEN — ' + pass + ' checks');
    else console.log('SMOKE GATE RED — ' + fail + ' failed of ' + (pass + fail));
    process.exit(code);
}

run().catch(e => { console.error('smoke gate crashed: ' + (e && e.stack || e)); process.exit(1); });
