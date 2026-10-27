/*
 * regression_bg_changes_20261027.test.js
 *
 * 27 Oct 2026. A person's first change no longer lists a dozen changes they did not make.
 * Found chasing regression_change_ack_ui_20261013b, which failed now and then ("Review your 23 changes" after
 * typing one node name). The trees the app makes for itself gave their starter leaves a failure rate of 0;
 * allocation trees are probability only, so the next recompute deleted it on every one of them, and when that
 * recompute was the person's own change every deletion was listed for them to confirm. A customer opening a
 * file and typing one name saw the same list. Also: one failure-condition tree sweep now leaves everything
 * settled (a tree made in a pass got its events and target only in the next pass).
 *
 * [A] wiring and the load-time cleanup (pure)
 * [B] in the real app (Playwright + Chromium; skipped with a note where missing): the app's own trees carry no
 *     failure rate on their leaves; a sweep run twice changes nothing the second time; a zero rate in a loaded
 *     file is dropped; the person's edit on a top-down tree, right after the app made its trees, is ONE change.
 *     B5: background work in the moment a change's write is still queued is not handed that change (Discard all
 *     re-applied it: the other cause of the change test failing now and then).
 * Mutation: SL_BG_MUTATE=1 serves fc_auto_trees.js that writes the failure rate of 0 again, and change_ack.js without
 *     the fresh "before": [B] goes red.
 * Run: node tests/regression_bg_changes_20261027.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function fnSrc(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
    return null;
}

console.log('\n[A] wiring');
const F = read('fc_auto_trees.js'), T = read('fc_tree_flow.js'), D = read('data_ops_modules.js'), H = read('helpers_modules.js');
check('the app\'s own allocation leaves carry no failure rate (fc_auto_trees)', !/n\.lambda = 0;/.test(fnSrc(F, '_node') || 'n.lambda = 0;'));
check('nor the PSSA starter (fc_tree_flow)', !/type: 'undeveloped', lambda: 0/.test(T));
check('one sweep repeats until a pass changes nothing (at most 4)', /for \(var pass = 0; pass < 4; pass\+\+\)/.test(F) && /function _sweepOnce\(opts\)/.test(F));
check('both project loaders drop a zero rate from top-down leaves', /migrateLegacyMultiTraces\(\);\n\s*migrateAllocationLeavesProbabilityOnly\(\);/.test(D) && /migrateAllocationLeavesProbabilityOnly\(\);   \/\/ 27 Oct 2026/.test(H));

const ctx = {};
vm.createContext(ctx);
vm.runInContext('var ftaPages = [];\n' + fnSrc(D, 'migrateAllocationLeavesProbabilityOnly'), ctx);
vm.runInContext(`ftaPages = [
  { id: 'a', mode: 'top-down', root: { type: 'gate', children: [ { id: 1, type: 'basic', lambda: 0 }, { id: 2, type: 'undeveloped', lambda: '' }, { id: 3, type: 'basic', lambda: 2e-6 }, { id: 4, type: 'basic' } ] } },
  { id: 'b', root: { type: 'gate', children: [ { id: 5, type: 'basic', lambda: 0 } ] } },
  { id: 'ver-c', verifies: 'a', mode: 'bottom-up', root: { type: 'gate', children: [ { id: 6, type: 'basic', lambda: 0 } ] } },
  { id: 'd', mode: 'bottom-up', root: { type: 'gate', children: [ { id: 7, type: 'basic', lambda: 0 } ] } } ];`, ctx);
const n = vm.runInContext('migrateAllocationLeavesProbabilityOnly()', ctx);
const leaf = id => vm.runInContext('(function f(n){ if(!n) return null; if(n.id===' + id + ') return n; for (const c of (n.children||[])) { const r=f(c); if(r) return r; } return null; })({children: ftaPages.map(p => p.root)})', ctx);
check('a zero or empty rate on a top-down leaf is dropped (an unmarked tree counts as top-down)', n === 3 && !('lambda' in leaf(1)) && !('lambda' in leaf(2)) && !('lambda' in leaf(5)), 'dropped ' + n);
check('a real rate is never touched', leaf(3).lambda === 2e-6);
check('verification and bottom-up trees are not walked', leaf(6).lambda === 0 && leaf(7).lambda === 0);

let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
if (!pw) { console.log('  note  Playwright is not installed on this machine: [B] did not run'); done(); }
const MUTATE = process.env.SL_BG_MUTATE === '1';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve() {
    return new Promise(res => {
        const srv = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(SITE, path.normalize(p));
            if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
            fs.readFile(f, (e, b) => {
                if (e) { r.writeHead(404); return r.end('not found'); }
                if (MUTATE && path.basename(f) === 'fc_auto_trees.js') b = Buffer.from(String(b).replace("} else { n.inputMode = 'probability';", "} else { n.lambda = 0; n.inputMode = 'probability';"));
                if (MUTATE && path.basename(f) === 'change_ack.js') b = Buffer.from(String(b).replace('function _freshBeforeSystem() { try {', 'function _freshBeforeSystem() { return; try {').replace('var shellComputed = { targetBasis: 1, autoFcTree: 1 };', 'var shellComputed = {};').replace('if (!pg.targetManual || pg.verifies != null) shellComputed.targetP = 1;', '').replace('try { if (_deferDepth === 0 && !_win && _restoreDepth === 0) { var sNow', 'try { if (false) { var sNow'));
                r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b);
            });
        }).listen(0, '127.0.0.1', () => res(srv));
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    console.log('\n[B] in the real app' + (MUTATE ? ' (MUTATION: the rate of 0 is back)' : ''));
    const srv = await serve();
    let browser;
    try { browser = await pw.chromium.launch(); }
    catch (e) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); done(); }
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e)));
        pg.on('dialog', d => d.dismiss().catch(() => {}));
        // The app's own sweep is held until the test runs it, so nothing recomputes in between by chance.
        await pg.addInitScript(() => { window.SL_FC_TREES_OFF = true; });
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/'); await sleep(3500);
        await pg.evaluate(() => {
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
            document.documentElement.classList.remove('sl-auth-gate-blocked');
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
        });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(4000);
        // the person is on a top-down tree, the way B2 of the change test is
        const made = await pg.evaluate(async () => {
            const p = ftaPages.find(x => x && x.root && !x.autoFcTree && !x.verifies && x.treeLevel === 'system' && (x.mode || 'top-down') === 'top-down' && String(x.id).indexOf('idp-pg-') !== 0);
            switchTab('fta'); openFTAPageById(p.id); await new Promise(r => setTimeout(r, 1500));
            window.__bgPage = p.id;
            window.SL_FC_TREES_OFF = false;
            const r1 = SLChangeAck.background(() => SLFcTrees.sweep({ quiet: true, noAsk: true }));
            const r2 = SLChangeAck.background(() => SLFcTrees.sweep({ quiet: true, noAsk: true }));
            window.SL_FC_TREES_OFF = true;
            // the worst case of the race: the person's edit is the very next thing, before any other timer runs
            let node = null; (function w(n) { if (!n || node) return; if (n.type === 'basic') { node = n; return; } (n.children || []).forEach(w); })(p.root);
            SLChangeAck._markInput(); node.name = node.name + ' typed';
            try { calculateAllProbabilities(); } catch (_) {}
            scheduleAutosave();
            let withRate = 0, leaves = 0;
            ftaPages.filter(x => x && x.autoFcTree).forEach(x => (function w(n) { if (!n) return; if (n.type !== 'gate') { leaves++; if (Object.prototype.hasOwnProperty.call(n, 'lambda')) withRate++; } (n.children || []).forEach(w); })(x.root));
            return { made: r1 && r1.made.length, second: r2 && (r2.made.length + r2.added + r2.gone.length + r2.targets), leaves, withRate };
        });
        check('B1 the app made its trees', made.made > 0, JSON.stringify(made));
        check('B1 none of their leaves carries a failure rate (after the person\'s recompute too)', made.leaves > 0 && made.withRate === 0, JSON.stringify(made));
        check('B2 a second sweep right after changes nothing (one sweep settles)', made.second === 0, JSON.stringify(made));

        // the person types one name on the open tree, the edit recomputes the open tree
        const one = await pg.evaluate(async () => {
            await new Promise(r => setTimeout(r, 2500));
            const c = SLChangeAck.collected();
            return { steps: c.length, count: c.reduce((s, x) => s + (x.count || 1), 0), labels: c.map(x => x.label.slice(0, 220)) };
        });
        check('B3 one typed name is ONE change for the person (nothing of the app\'s is listed)', one.steps === 1 && one.count === 1 && /typed/.test(one.labels[0] || ''), JSON.stringify(one));

        // B5: a change whose autosave write is still queued, then background work in that same moment, then Discard all
        const review = async () => { await pg.evaluate(() => { const b = document.querySelector('#sl-ack-bar .sl-ack-review'); if (b) b.click(); }); await sleep(600); };
        await review(); await pg.evaluate(() => { const b = document.querySelector('.sl-ack-keep'); if (b) b.click(); }); await sleep(1500);
        const pre = await pg.evaluate(async () => {
            const pgs = ftaPages.filter(x => x && x.root && !x.verifies);
            window.__b5a = pgs[0]; window.__b5b = pgs[1]; window.__b5a0 = pgs[0].name; window.__b5b0 = pgs[1].name;
            SLChangeAck._markInput();
            SLChangeAck.deferred({ kind: 'move', label: 'Bow-tie: Move Valve' }, () => { window.__b5a.name = window.__b5a0 + ' (moved)'; scheduleAutosave(); });
            // the same instant: a sweep on a timer changes something of its own
            SLChangeAck.background(() => { window.__b5b.name = window.__b5b0 + ' (swept)'; scheduleAutosave(); });
            await new Promise(r => setTimeout(r, 1500));
            return SLChangeAck.collected().map(c => c.kind + ':' + c.label);
        });
        await review(); await pg.evaluate(() => { const d = document.querySelector('.sl-ack-discard'); if (d) d.click(); }); await sleep(1200);
        const disc = await pg.evaluate(() => { const a = ftaPages.find(x => x.id === window.__b5a.id), b = ftaPages.find(x => x.id === window.__b5b.id); return { moveGone: a.name === window.__b5a0, sweepKept: b.name === window.__b5b0 + ' (swept)', left: SLChangeAck.collected().length, a: a.name, b: b.name }; });
        check('B5 the move waits for the person (the sweep is not listed)', pre.length === 1 && /Move Valve/.test(pre[0]), JSON.stringify(pre));
        check('B5 Discard all takes the move back even though a sweep ran before its write', disc.moveGone && disc.left === 0, JSON.stringify(disc));
        check('B5 and keeps the sweep\'s own change', disc.sweepKept, JSON.stringify(disc));

        // B7: a Redo-like step, then (in the moment before its write lands) a change nobody made, then Discard all
        await sleep(3500);   // no recent input: the next plain write is nobody's
        const b7 = await pg.evaluate(async () => {
            const pgs = ftaPages.filter(x => x && x.root && !x.verifies);
            const A = pgs[2], B = pgs[3], a0 = A.name, b0 = B.name;
            SLChangeAck.deferred({ kind: 'redo', label: 'Redo: rename ' + a0 }, () => { A.name = a0 + ' (redone)'; scheduleAutosave(); });
            B.name = b0 + ' (drawn)'; scheduleAutosave();   // a view's own write as it draws, not inside system()
            await new Promise(r => setTimeout(r, 1500));
            window.__b7 = { A: A.id, B: B.id, a0, b0 };
            return SLChangeAck.collected().map(c => c.kind + ':' + c.label);
        });
        await review(); await pg.evaluate(() => { const d = document.querySelector('.sl-ack-discard'); if (d) d.click(); }); await sleep(1200);
        const b7d = await pg.evaluate(() => { const k = window.__b7, A = ftaPages.find(x => x.id === k.A), B = ftaPages.find(x => x.id === k.B); return { aBack: A.name === k.a0, bKept: B.name === k.b0 + ' (drawn)', a: A.name, b: B.name }; });
        check('B7 the step waits alone (the drawn write is nobody\'s)', b7.length === 1 && /^redo:/.test(b7[0]), JSON.stringify(b7));
        check('B7 Discard all takes the step back (the write in that moment did not carry it)', b7d.aBack, JSON.stringify(b7d));

        // B6: a tree's computed target moving under a restore (Undo / Redo carry whole snapshots) is not the person's
        const tgt = await pg.evaluate(async () => {
            const pgx = ftaPages.find(x => x && x.root && !x.verifies && x.targetP && !x.targetManual);
            SLChangeAck._markInput(); pgx.targetP = pgx.targetP / 3; pgx.targetBasis = Object.assign({}, pgx.targetBasis || {}, { used: 'aircraft' }); scheduleAutosave();
            await new Promise(r => setTimeout(r, 1500));
            const computed = SLChangeAck.collected().length;
            SLChangeAck._markInput(); pgx.targetManual = true; pgx.targetP = pgx.targetP / 2; scheduleAutosave();
            await new Promise(r => setTimeout(r, 1500));
            const lines = SLChangeAck.lines().map(l => (l.fields || []).map(f => f.field || f.name).join(','));
            return { computed, manual: SLChangeAck.collected().length, lines };
        });
        check('B6 a computed target (and its basis) moving is not listed for the person', tgt.computed === 0, JSON.stringify(tgt));
        check('B6 a target the person set by hand is', tgt.manual === 1 && tgt.lines.some(l => /target/i.test(l)), JSON.stringify(tgt));

        // a file saved before this fix: its auto-tree leaves carry a rate of 0; loading drops it
        const loaded = await pg.evaluate(async () => {
            const snap = JSON.parse(JSON.stringify(_snapshotProject()));
            let planted = 0;
            (snap.ftaPages || []).forEach(p => { if (p && p.autoFcTree) (function w(n) { if (!n) return; if (n.type !== 'gate') { n.lambda = 0; planted++; } (n.children || []).forEach(w); })(p.root); });
            _applyProjectData(snap); await new Promise(r => setTimeout(r, 800));
            let left = 0; ftaPages.filter(x => x && x.autoFcTree).forEach(x => (function w(n) { if (!n) return; if (n.type !== 'gate' && n.lambda === 0) left++; (n.children || []).forEach(w); })(x.root));
            return { planted, left };
        });
        check('B4 a loaded file\'s zero rates on top-down leaves are dropped on load', loaded.planted > 0 && loaded.left === 0, JSON.stringify(loaded));
        check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    } catch (e) {
        check('[B] ran without throwing', false, String(e && e.stack || e).slice(0, 400));
    } finally {
        try { await browser.close(); } catch (_) {}
        srv.close(); done();
    }
})();
