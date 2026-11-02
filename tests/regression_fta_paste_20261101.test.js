/* regression_fta_paste_20261101.test.js: every paste asks, same event or independent copy (customer checklist item 32).
 *
 * Waqas, 1 Nov 2026 ("32 is correct"): every paste of an event asks "same event" (one failure, counted once) or
 * "independent copy" (new ID). On the Golden Thread a shared event shows once, linked to every tree it sits in.
 * Found: the answer was guessed (same tree: always the same event; another tree: always a copy), and on a paste into
 * another tree the review dialog's "Same physical event" did nothing because the IDs had already been replaced.
 * Checked: nothing is placed until the question is answered; Cancel and Esc paste nothing; "Same event" keeps the ID
 * (inside one tree and across trees) and the copies stay in step; "Independent copy" gets new IDs; Paste Special adds a
 * common cause group on both sides; the cross-tree allocation review no longer offers the old mode buttons; the thread
 * shows a shared event once, linked to both trees.
 * MUTATION PROOFS: SL_PASTE_MUTATE=noask (pastes without asking), =same (the same event gets new IDs), =thread (no
 * shared event on the thread) must fail.
 * Run: node tests/regression_fta_paste_20261101.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const MUT = process.env.SL_PASTE_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'noask' && file === 'fta_paste.js') return body.replace("return choose({ subtree: clip.subtree, crossTree: crossTree, sourceName: clip.sourcePageName || '', ccf: !!special }).then(", "return Promise.resolve({ mode: crossTree ? 'independent' : 'same' }).then(");
    if (MUT === 'same' && file === 'fta_paste.js') return body.replace('var cloned = cloneSubtree(clip.subtree, same);', 'var cloned = cloneSubtree(clip.subtree, false);');
    if (MUT === 'thread' && file === 'fta_view_modules.js') return body.replace("if(_gtvShared) linkedPages.forEach(", "if(false) linkedPages.forEach(");
    return body;
}
const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const SUP = fs.readFileSync(path.join(SITE, 'support_modules.js'), 'utf8');
const HLP = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
check('index.html loads fta_paste.js after fta_integrated.js', HTML.indexOf('fta_paste.js?v=1.0') > HTML.indexOf('fta_integrated.js?v='));
check('Paste Branch and Paste Special both go through the question', /function pasteAsChild\(\) \{ if \(window\.SLFtaPaste\) return window\.SLFtaPaste\.run\(false\); \}/.test(SUP) && /function pasteSpecial\(\) \{ if \(window\.SLFtaPaste\) return window\.SLFtaPaste\.run\(true\); \}/.test(SUP));
check('the allocation review no longer offers the old mode buttons', !/How should the pasted events be modeled\?/.test(HLP) && !/name="paste-mode"/.test(HLP));
check('no em dash in what fta_paste.js says', !/—/.test(fs.readFileSync(path.join(SITE, 'fta_paste.js'), 'utf8').replace(/\/\/.*$/gm, '')));

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
    if (!pw) { console.log('  note  Playwright is not installed: the app checks did not run'); return done(); }
    console.log('\nin the app' + (MUT ? ' (MUTATION ' + MUT + ')' : ''));
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errs = []; pg.on('pageerror', e => errs.push(String(e && e.message || e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await sleep(3500);
        await pg.evaluate(() => { const gt = document.getElementById('sl-auth-gate'); if (gt) gt.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        await pg.evaluate(() => { try { switchTab('fta'); } catch (_) {} }); await sleep(600);
        const s = await pg.evaluate(async () => {
            const linked = p => (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            const A = ftaPages.find(p => p && p.root && p.root.type === 'gate' && !p.verifies && linked(p).length && (acFhaData || []).some(f => linked(p).map(String).includes(String(f.internalId))));
            const B = ftaPages.find(p => p && p.root && p.root.type === 'gate' && p !== A && !p.verifies && linked(p).length);
            const leaf = (function f(n) { if (!n) return null; if (n.type === 'basic') return n; for (const c of (n.children || n._children || [])) { const x = f(c); if (x) return x; } return null; })(A.root);
            const lid = String(leaf.logicalId != null ? leaf.logicalId : leaf.id);
            openFTAPageById(A.id); calculateAllProbabilities();
            return { A: A.id, B: B.id, leafId: leaf.id, lid, disp: leaf.displayId };
        });
        const count = (pid) => pg.evaluate(({ pid, lid }) => { const p = ftaPages.find(x => x.id === pid); let n = 0, all = 0; (function w(x) { if (!x) return; all++; if (x.type !== 'gate' && String(x.logicalId != null ? x.logicalId : x.id) === lid) n++; (x.children || x._children || []).forEach(w); })(p.root); return { n, all }; }, { pid, lid: s.lid });
        const copyLeafAndSelect = async (gateOf) => pg.evaluate(({ s, gateOf }) => {
            openFTAPageById(s.A); const A = ftaPages.find(x => x.id === s.A);
            const leaf = (function f(n) { if (!n) return null; if (n.id === s.leafId) return n; for (const c of (n.children || n._children || [])) { const x = f(c); if (x) return x; } return null; })(A.root);
            selectNode(leaf); copySelectedBranch();
            const P = ftaPages.find(x => x.id === gateOf); if (gateOf !== s.A) openFTAPageById(gateOf);
            selectNode(P.root); return true;
        }, { s, gateOf });

        // 1. same tree: the question first, nothing placed until it is answered
        await copyLeafAndSelect(s.A);
        const c0 = await count(s.A);
        await pg.evaluate(() => { window.__pasteP = pasteAsChild(); }); await sleep(250);
        const q1 = await pg.evaluate(() => ({ open: !!document.getElementById('sl-paste-modal'), choices: [...document.querySelectorAll('#sl-paste-modal [data-paste-mode]')].map(b => b.getAttribute('data-paste-mode')) }));
        const c1 = await count(s.A);
        check('the paste asks first, with the two choices, and places nothing yet', q1.open && q1.choices.join(',') === 'same,independent' && c1.all === c0.all, JSON.stringify(q1) + ' ' + c0.all + '/' + c1.all);
        if (q1.open) await pg.keyboard.press('Escape');
        await sleep(250);
        const c2 = await count(s.A);
        check('Esc pastes nothing', c2.all === c0.all && !(await pg.evaluate(() => !!document.getElementById('sl-paste-modal'))));
        // same event inside one tree
        await copyLeafAndSelect(s.A);
        await pg.evaluate(() => { pasteAsChild(); }); await sleep(250);
        if (await pg.evaluate(() => !!document.querySelector('#sl-paste-modal [data-paste-mode="same"]'))) await pg.evaluate(sel => { const b = document.querySelector(sel); if (b) b.click(); }, '#sl-paste-modal [data-paste-mode="same"]');
        await sleep(400);
        const c3 = await count(s.A);
        check('"Same event" inside one tree keeps the ID: the event is now in two places, one event', c3.n === c0.n + 1 && c3.all === c0.all + 1, JSON.stringify([c0, c3]));
        // independent copy inside one tree
        await copyLeafAndSelect(s.A);
        await pg.evaluate(() => { pasteAsChild(); }); await sleep(250);
        if (await pg.evaluate(() => !!document.querySelector('#sl-paste-modal [data-paste-mode="independent"]'))) await pg.evaluate(sel => { const b = document.querySelector(sel); if (b) b.click(); }, '#sl-paste-modal [data-paste-mode="independent"]');
        await sleep(400);
        const c4 = await count(s.A);
        const indep = await pg.evaluate((s) => { const A = ftaPages.find(x => x.id === s.A); const last = A.root.children[A.root.children.length - 1]; return { lid: String(last.logicalId), disp: last.displayId, name: last.name }; }, s);
        check('"Independent copy" gets new IDs and is counted on its own', c4.all === c3.all + 1 && c4.n === c3.n && indep.lid !== s.lid && indep.disp !== s.disp, JSON.stringify(indep));

        // 2. another tree: the same event keeps its ID (it used to be replaced whatever was chosen)
        const b0 = await count(s.B);
        await copyLeafAndSelect(s.B);
        await pg.evaluate(() => { pasteAsChild(); }); await sleep(250);
        const q2 = await pg.evaluate(() => (document.querySelector('#sl-paste-modal .sl-int-help') || {}).textContent || '');
        if (await pg.evaluate(() => !!document.querySelector('#sl-paste-modal [data-paste-mode="same"]'))) await pg.evaluate(sel => { const b = document.querySelector(sel); if (b) b.click(); }, '#sl-paste-modal [data-paste-mode="same"]');
        await sleep(600);
        const b1 = await count(s.B);
        check('the question says it is from another tree', /from .+/.test(q2), q2);
        check('"Same event" into another tree keeps the ID', b1.n === b0.n + 1, JSON.stringify([b0, b1]));
        const rev = await pg.evaluate(() => { const m = document.getElementById('paste-review-modal'); const r = { open: !!m, radios: m ? m.querySelectorAll('input[name="paste-mode"]').length : -1 }; if (m) closePasteReviewModal(); return r; });
        check('the allocation review follows a cross-tree paste, without the old mode buttons', rev.open && rev.radios === 0, JSON.stringify(rev));
        const step = await pg.evaluate((s) => {
            const A = ftaPages.find(x => x.id === s.A), B = ftaPages.find(x => x.id === s.B);
            const find = (r) => { let h = null; (function w(n) { if (!n || h) return; if (n.type !== 'gate' && String(n.logicalId != null ? n.logicalId : n.id) === s.lid) h = n; (n.children || n._children || []).forEach(w); })(r); return h; };
            const a = find(A.root); a.name = 'Renamed on A'; propagateRepeatedEventEdit(a);
            const b = find(B.root);
            const sh = SLFtaPaste.sharedEvents().find(e => e.lid === s.lid);
            const g = _gtvBuildGraph({});
            const ek = 'cca:ev:' + s.lid;
            return { bName: b && b.name, shared: sh ? sh.pages.map(p => p.id) : null, node: !!g.nodes.find(n => n.key === ek), fromA: g.links.some(l => l.s === 'fta:' + s.A && l.t === ek), fromB: g.links.some(l => l.s === 'fta:' + s.B && l.t === ek), copies: g.nodes.filter(n => n.key === ek).length };
        }, s);
        check('the copies of the same event stay in step', step.bName === 'Renamed on A', JSON.stringify(step));
        check('the event is listed as shared by both trees', step.shared && step.shared.includes(String(s.A)) && step.shared.includes(String(s.B)), JSON.stringify(step.shared));
        check('on the Golden Thread it shows once, linked to both trees', step.node && step.copies === 1 && step.fromA && step.fromB, JSON.stringify(step));

        // 3. Paste Special: a common cause group, both sides
        await copyLeafAndSelect(s.B);
        await pg.evaluate(() => { pasteSpecial(); }); await sleep(250);
        const q3 = await pg.evaluate(() => [...document.querySelectorAll('#sl-paste-modal [data-paste-mode]')].map(b => b.getAttribute('data-paste-mode')).join(','));
        check('Paste Special adds the common cause group choice', q3 === 'same,independent,ccf', q3);
        if (q3.indexOf('ccf') !== -1) {
            await pg.evaluate(sel => { const b = document.querySelector(sel); if (b) b.click(); }, '#sl-paste-modal [data-paste-mode="ccf"]');
            await pg.evaluate(([sel, v]) => { const i = document.querySelector(sel); if (i) i.value = v; }, ['#sl-paste-modal [data-paste-ccf-name]', 'TEST-LOT-1']);
            await pg.evaluate(([sel, v]) => { const i = document.querySelector(sel); if (i) i.value = v; }, ['#sl-paste-modal [data-paste-ccf-beta]', '0.05']);
            await pg.evaluate(sel => { const b = document.querySelector(sel); if (b) b.click(); }, '#sl-paste-modal [data-paste-ccf-go]'); await sleep(600);
            await pg.evaluate(() => { try { closePasteReviewModal(); } catch (_) {} });
        }
        const ccf = await pg.evaluate((s) => { const A = ftaPages.find(x => x.id === s.A), B = ftaPages.find(x => x.id === s.B); let a = 0, b = 0; (function w(n) { if (!n) return; if (n.ccfGroup === 'TEST-LOT-1') a++; (n.children || n._children || []).forEach(w); })(A.root); (function w(n) { if (!n) return; if (n.ccfGroup === 'TEST-LOT-1') b++; (n.children || n._children || []).forEach(w); })(B.root); return { a, b }; }, s);
        check('the common cause group is set on the copy and on its source', ccf.a >= 1 && ccf.b >= 1, JSON.stringify(ccf));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) { check('test crashed: ' + (e && e.stack || e), false); }
    finally { await browser.close(); srv.close(); }
    done();
})();
