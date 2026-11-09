/* regression_cma_report_20261108.test.js: the CMA Autopilot and the CMA report (cma_autopilot.js v1.1, SLCmaAuto) on the shared
 * report frame (cca_report.js v1.1, SLCcaReport), with no duplicate CMAs anywhere (no_dupes.js v1.1, cma_flow.js v1.3).
 *
 * Waqas, 8 Nov 2026: "PRA build and ZSA similar to the planing autopilot, ability to see the reports etc. can we do
 * something similar for CMA"; confirmed: the CMA table goes, with an inline Edit per report section and an "Add a CMA"
 * button so no data entry is lost. Phase 1: the questions, the report content builder, inputs and outputs, Edit and Add,
 * the one switch. Phase 2: the page is the report on the shared frame, the table gone; no duplicate CMA anywhere
 * (Waqas's rulings on the open questions, 8 Nov: cmaForGate counts earlier CMAs too; the duplicate rule lives in no_dupes.js;
 * signing is the frame's acceptance by role).
 * On the Aeolus HL-1 demo, in the real app, with the production CSP:
 *   [L]  load order and version pin: cma_autopilot.js v1.0 after cma_flow.js and autopilot_ui.js
 *   [B]  the builder: one section per independence claim; building it writes nothing; gates named with their tree and
 *        failure condition; every common mode category in each section; status words derived, never typed; no counts in
 *        the report's own words; no em dashes anywhere
 *   [Q]  the questions: the critical gates without a CMA; per claim, the gates, the claim, every category in plain words,
 *        each answer saying what it means and what it changes; follow-ups only under a concern, indented
 *   [W]  answering: a CMA added on a free critical gate; its DAL reduction stays CMA pending until the claim is
 *        substantiated, then the gate is substantiated by it; a Concern opens a follow-up; a requirement must say
 *        "shall"; the raised requirement appears in the report with its ID and words once accepted; an earlier entry is
 *        adopted on its first answer, never a second row; who answered is kept; answer paragraphs carry their question id
 *   [E]  Edit and Add a CMA write cmaData without duplicates (a gate in another CMA, earlier entries included; the same
 *        subject)
 *   [O]  outputs: each with the questions behind it; accepted, then reopened by a changed answer; inputs and outputs
 *   [U]  the questions drawn: a card click answers, a follow-up is indented under its parent, an answer that needs words
 *        shows its boxes first; dark mode readable; the table switch (on) hides the table, its chips and the four-step
 *        editor and shows the report; off brings the old page back
 *   [R]  the frame: the table gone, the questions on the left (claim by claim), one report section per claim; an answer
 *        and "See where it goes" light up what the answer wrote (table rows too); a figure box opens its panel; outputs
 *        accepted by role and reopened by a changed answer, one store (v1.0's moved); Word with contents, list of tables,
 *        list of figures and no counts; a dark, readable document; Edit and Add a CMA in the report with no duplicates;
 *        "Review in CMA" and Edit on a CMA open it in the report
 *   [N]  no duplicates anywhere: an earlier CMA's gate is taken for a new CMA, Add gate and live detection (which adopts
 *        that CMA and adds its concern there); the row live detection made for the same finding keeps its own path
 *   no page errors
 * MUTATION PROOFS: SL_CMAR_MUTATE=typed | dup | count | legacyowner | notag | pure | emdash | flowowner | rowq. Each one
 * turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_cma_report_20261108.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 900) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_CMAR_MUTATE || '';
const MUTS = {
    typed:       ['cma_autopilot.js', "    function statusWords(r) {\n", "    function statusWords(r) { if (/Closed/.test(String(r.status))) return 'Closed and accepted.';\n"],
    dup:         ['cma_autopilot.js', "    function clash(values, except) {\n", "    function clash(values, except) { return null;\n"],
    count:       ['cma_autopilot.js', "miss.push('some common mode categories are not answered yet, or have no reason written');", "miss.push((pr.cats - pr.answered) + ' of ' + pr.cats + ' categories are not answered yet');"],
    legacyowner: ['no_dupes.js', "function cmaGatesOf(row) { return row ? ((row.flow && Array.isArray(row.flow.gates) ? row.flow.gates : row.linkedGateIds) || []).map(String) : []; }", "function cmaGatesOf(row) { return row ? ((row.flow && Array.isArray(row.flow.gates) ? row.flow.gates : []) || []).map(String) : []; }"],
    flowowner:   ['cma_flow.js', "    function cmaForGate(key) {\n", "    function cmaForGate(key) { return _cma().find(function (c) { return c && c.flow && (c.flow.gates || []).map(String).indexOf(S(key)) >= 0; }) || null;\n"],
    rowq:        ['cca_report.js', "var q = rowQ && rowQ[i];", "var q = null;"],
    notag:       ['cma_autopilot.js', "function P(id, text, q, extra) { return Object.assign({ type: 'p', id: id, text: T(text), q: q || null }, extra || {}); }", "function P(id, text, q, extra) { return { type: 'p', id: id, text: T(text), q: null }; }"],
    pure:        ['cma_autopilot.js', "        var f = r.flow || null, anchor = 'cma-' + slug(r.cmaId || r.internalId)", "        ensureFlow(r); var f = r.flow || null, anchor = 'cma-' + slug(r.cmaId || r.internalId)"],
    emdash:      ['cma_autopilot.js', "function T(s) { return S(s).replace(/\\s*\\u2014\\s*/g, ', ').replace(/\\s+/g, ' ').trim(); }", "function T(s) { return S(s).replace(/\\s+/g, ' ').trim(); }"]
};
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) { if (s.indexOf(m[1]) < 0) throw new Error('mutation site missing: ' + m[1]); s = s.replace(m[1], m[2]); } return s; }
const tick = ms => new Promise(r => setTimeout(r, ms || 0));
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);

(async function main() {
    console.log('\n[L] load order and pin');
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), at = f => HTML.indexOf('src="' + f + '?v=');
    const SRC = fs.readFileSync(path.join(SITE, 'cma_autopilot.js'), 'utf8');
    check('cma_autopilot.js is pinned at v1.1 or later, its header and VERSION the same; cca_report 1.1 or later, cma_flow 1.3, no_dupes 1.1 pinned', (function () { var m = /SLCmaAuto v(1\.(\d+))/.exec(SRC.slice(0, 200)); return !!m && +m[2] >= 1 && HTML.indexOf('cma_autopilot.js?v=' + m[1] + '"') > 0 && SRC.indexOf("var VERSION = '" + m[1] + "'") >= 0; })() && /cca_report\.js\?v=1\.[1-9]"/.test(HTML) && /cma_flow\.js\?v=1\.3/.test(HTML) && /no_dupes\.js\?v=1\.1/.test(HTML));
    check('it loads after cma_flow.js, autopilot_ui.js, cca_report.js and no_dupes.js', at('cma_autopilot.js') > at('cma_flow.js') && at('cma_flow.js') > 0 && at('cma_autopilot.js') > at('autopilot_ui.js') && at('autopilot_ui.js') > 0 && at('cma_autopilot.js') > at('cca_report.js') && at('cca_report.js') > 0 && at('cma_flow.js') > at('no_dupes.js') && at('no_dupes.js') > 0);
    check('the table switch is one named constant, on: the report frame has the page', /var HIDE_CMA_TABLE_UI = true;/.test(SRC) && (SRC.match(/HIDE_CMA_TABLE_UI =/g) || []).length === 1);
    check('the duplicate rule for CMAs lives in no_dupes.js and both writers ask it', /function cmaClash\(/.test(fs.readFileSync(path.join(SITE, 'no_dupes.js'), 'utf8')) && /cmaClash\(probe, rows\(\)\)/.test(SRC) && /N\.cmaOwner\(_cma\(\), key\)/.test(fs.readFileSync(path.join(SITE, 'cma_flow.js'), 'utf8')));
    check('no em dashes in the CMA module or the frame', SRC.indexOf('\u2014') < 0 && fs.readFileSync(path.join(SITE, 'cca_report.js'), 'utf8').indexOf('\u2014') < 0);
    check('the table and the scope chips carry the ids the switch hides', /id="cma-table-wrap"/.test(HTML) && /id="cma-scope-chips"/.test(HTML));

    let pw = null; try { pw = require('playwright'); } catch (_) {}
    if (!pw) { console.log('  SKIP  Playwright is not installed here: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();   // eslint-disable-line no-eval
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.step': 'application/step' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
        let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const name = path.relative(SITE, f); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
        r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(b); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const browser = await pw.chromium.launch();
    const errs = [];
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1500, height: 1100 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.addInitScript(() => { window.SL_VERIFY_SYNC_OFF = true; });
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
        await pg.evaluate(() => { if (window.SLCmaLive && SLCmaLive.setAutomation) try { SLCmaLive.setAutomation(true); } catch (_) {} });

        const r = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const A = window.SLCmaAuto, F = window.SLCmaFlow, R = {};
            const recalc = () => { try { calculateAllProbabilities(); } catch (_) {} try { propagateDalAllRoots(); } catch (_) {} };
            const live = () => cmaData.filter(c => c && !c.suggested);
            // every string in the report, for the text checks
            const textsOf = secs => { const out = []; secs.forEach(s => { out.push(s.title); s.blocks.forEach(b => { if (b.text) out.push(b.text); if (b.caption) out.push(b.caption); (b.columns || []).forEach(c => out.push(c)); (b.rows || []).forEach(rw => rw.cells.forEach(c => out.push(String(c)))); (b.items || []).forEach(i => out.push(i.text)); (b.nodes || []).forEach(n => { out.push(n.label, n.accept); (n.inputs || []).concat(n.outputs || []).forEach(x => out.push(x)); }); if (b.svg) out.push(b.svg); }); }); return out; };
            // the builder's own words: lead, status and caption lines, with IDs and dates taken out
            const ownWords = secs => { const out = []; secs.forEach(s => s.blocks.forEach(b => { if (b.type === 'p' && /-(gates|modes|concerns|status)$/.test(b.id)) out.push(b.text); if (b.caption) out.push(b.caption); (b.rows || []).forEach(rw => { if (/^Not answered yet$|^Yes, critical$|^No$/.test(String(rw.cells[2] || ''))) out.push(String(rw.cells[2])); }); })); return out.map(t => t.replace(/\b[A-Z][A-Za-z]*-[A-Z0-9-]*\d[A-Z0-9-]*\b/g, 'ID').replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')); };

            // ---- [B] the builder on the demo as it ships -------------------------------------------------------------
            const before = JSON.stringify(cmaData) + JSON.stringify(projectConfig.cmaAuto || null);
            const secs = A.reportSections();
            R.b = { n: secs.length, want: live().length, ids: new Set(secs.map(s => s.id)).size, titled: secs.every(s => s.cmaId && s.title.indexOf(s.cmaId) === 0), pure: JSON.stringify(cmaData) + JSON.stringify(projectConfig.cmaAuto || null) === before, critFirst: secs.findIndex(s => !s.critical) < 0 || secs.slice(secs.findIndex(s => !s.critical)).every(s => !s.critical) };
            const s1 = secs.find(s => s.cmaId === 'CMA-001');
            const gt = s1.blocks.find(b => b.type === 'table' && /-gates-t$/.test(b.id));
            R.b.gateRow = gt && gt.rows[0].cells;
            R.b.allGateCellsNamed = secs.every(s => s.blocks.filter(b => /-gates-t$/.test(b.id)).every(b => b.rows.every(rw => (/^G-\S+ \S/.test(rw.cells[0]) || /^[A-Z]+-\S+ \S.*\(not an AND gate/.test(rw.cells[0]) || /^A gate no longer in the fault tree "/.test(rw.cells[0])) && rw.cells[1] && rw.cells[3] && !/pg-[a-z]/.test(rw.cells.join(' ')))));
            R.b.figure = !!s1.blocks.find(b => b.type === 'figure' && /<svg/.test(b.svg) && b.nodes.length >= 3 && b.nodes.every(n => n.label && n.accept));
            const cats = A.categoriesPlain();
            R.b.cats = cats.length;
            R.b.catsCovered = secs.every(s => { const t = s.blocks.find(b => /-modes-t$/.test(b.id)); return t && t.rows.length === cats.length && cats.every((c, i) => t.rows[i].cells[1] === c.name && t.rows[i].q === 'cma/' + s.cma + '/cat/' + c.id); });
            R.b.legacyDerived = secs.filter(s => /^CMA-00[1358]$/.test(s.cmaId)).map(s => s.state + ':' + /^Not substantiated yet/.test(s.blocks[s.blocks.length - 1].text));
            R.b.statusLast = secs.every(s => { const b = s.blocks[s.blocks.length - 1]; return b.derived && /-status$/.test(b.id); });
            R.b.digitsInOwnWords = ownWords(secs).filter(t => /\d/.test(t)).slice(0, 5);
            R.b.dashes = textsOf(secs).filter(t => /\u2014/.test(t)).slice(0, 3);

            // ---- [Q] the questions ------------------------------------------------------------------------------------
            const qs = A.questions();
            const start = qs[0];
            R.q = { start: start.id === 'cma/start', startOnlyFree: start.options.length > 0 && start.options.every(o => o.critical && !A.ownerOf(o.id)), startExcludesLegacy: !start.options.some(o => o.id === 'pg-fcs-pitch:7068') };
            const q1 = A.questions(s1.cma);
            R.q.order = q1.slice(0, 2).map(q => q.id.split('/').pop()).join(',');
            R.q.catQs = q1.filter(q => /\/cat\//.test(q.id)).length;
            R.q.everyCardSays = qs.every(q => q.text && (q.intro || q.id === 'cma/start') && q.options.every(o => o.label && o.means && o.changes));
            R.q.plain = q1.filter(q => /\/cat\//.test(q.id)).every(q => /^Could .+ fail more than one of the inputs at once\?$/.test(q.text) && q.intro.length > 30);
            R.q.noFollowUpsYet = q1.filter(q => q.depth).length === 0;
            R.q.dashes = JSON.stringify(qs.map(q => [q.text, q.intro, q.group, q.groupIntro, q.options.map(o => [o.label, o.means, o.changes])])).match(/\u2014/g) || [];
            R.q.legacyClaim = q1[1].picked[0] === 'own' && q1[1].complete;

            // ---- [W] a new claim on a free critical gate ----------------------------------------------------------------
            const freeKey = start.options[0].id, gnode = F.gateOf(freeKey).node;
            const n0 = live().length;
            const add = A.addCma({ gates: [freeKey], subject: 'Rudder lanes \u2014 independence check' });
            const row = add.row;
            R.w = { added: add.ok && live().length === n0 + 1, flow: !!(row && row.flow), gates: row && row.linkedGateIds.join(',') === freeKey };
            const sAdded = A.reportSections().find(s => s.cma === row.internalId);
            R.w.cleanTitle = sAdded.title === row.cmaId + ' Rudder lanes, independence check' && !/\u2014/.test(JSON.stringify(sAdded.blocks.map(b => b.text || '')));
            const again = A.addCma({ gates: [freeKey] });
            const sameSubj = A.addCma({ subject: 'Rudder lanes \u2014 independence check' });
            const legacyGate = A.addCma({ gates: ['pg-fcs-pitch:7068'] });
            R.e = { dupGate: !again.ok && /already in/.test(again.why || ''), dupSubject: !sameSubj.ok && /already covers/.test(sameSubj.why || ''), dupLegacy: !legacyGate.ok && /CMA-001/.test(legacyGate.why || ''), oneRow: live().length === n0 + 1 };
            recalc();
            R.w.heldBack = !gnode._cmaSubstantiatedBy && gnode._dalPending === true;
            const qc = 'cma/' + row.internalId + '/claim';
            R.w.claimDrafted = A.answer(qc, 'drafted').ok && row.flow.claim === A.draftClaim(row) && /share no single cause/.test(row.flow.claim);
            const c0 = cats[0].id, qcat = 'cma/' + row.internalId + '/cat/' + c0;
            const ca = A.answer(qcat, 'concern', { why: 'Both lanes take power from the same essential bus.' });
            const qsAfter = A.questions(row.internalId);
            const fu = qsAfter.find(q => /\/concern\/C-1$/.test(q.id));
            R.w.concern = ca.ok && ca.concern === 'C-1' && !!fu && fu.parent === qcat && fu.depth === 1 && qsAfter.indexOf(fu) === qsAfter.findIndex(q => q.id === qcat) + 1;
            R.w.onlyUnderConcern = qsAfter.filter(q => q.depth).length === 1;
            R.w.who = !!(row.flow.who && row.flow.who[qcat] && row.flow.who[qcat].by && row.flow.who[qcat].at);
            // the answer's paragraph carries its question id
            const sNow = A.reportSections().find(s => s.cma === row.internalId);
            const cPara = sNow.blocks.find(b => b.type === 'p' && b.concern === 'C-1' && /same essential bus/.test(b.text));
            R.w.tagged = !!cPara && (cPara.q === qcat || (cPara.qs || []).indexOf(qcat) >= 0) && A.blocksFor(qcat).indexOf(cPara.id) >= 0 && A.blocksFor(qcat).some(x => /-modes-t:0$/.test(x)) && A.blocksFor(qc).indexOf(sNow.anchor + '-claim') >= 0;
            R.w.claimPara = (sNow.blocks.find(b => b.id === sNow.anchor + '-claim') || {}).q === qc;
            // the rest answered; the concern closed by a requirement
            cats.slice(1).forEach(c => A.answer('cma/' + row.internalId + '/cat/' + c.id, 'na', { why: 'Not shared by these two lanes: each has its own.' }));
            const noShall = A.answer(fu.id, 'req', { text: 'Move lane B to the second bus.' });
            recalc();
            R.w.stillHeld = !noShall.ok && /shall/.test(noShall.why || '') && !gnode._cmaSubstantiatedBy && F.statusOf(row) === 'In Progress';
            const inProg = A.reportSections().find(s => s.cma === row.internalId);
            R.w.progressWords = inProg.state === 'progress' && /concern C-1 is still open/.test(inProg.blocks[inProg.blocks.length - 1].text) && /CMA pending/.test(inProg.blocks[inProg.blocks.length - 1].text);
            const okReq = A.answer(fu.id, 'req', { text: 'The design shall supply rudder lane B from the second essential bus.' });
            recalc();
            R.w.substantiated = okReq.ok && F.statusOf(row) === 'Mitigated' && gnode._cmaSubstantiatedBy === row.cmaId;
            const sub = A.reportSections().find(s => s.cma === row.internalId);
            R.w.subWords = sub.state === 'substantiated' && /^Substantiated: /.test(sub.blocks[sub.blocks.length - 1].text) && /stands/.test(sub.blocks[sub.blocks.length - 1].text);
            R.w.pendingReq = (sub.blocks.find(b => /-c-c-1-close$/.test(b.id)) || {}).text || '';
            // the requirement accepted on the requirements page: the report gives its ID and words
            ['ac'].concat((systemsData || []).map(s => 'sys-' + s.id)).forEach(sc => { try { const m = AutoReq.generate({ gateIndependence: true }, sc); m.isNew = m.isNew.filter(c => c.reqSource && c.reqSource.generator === 'cma-concern'); m.isUpdated = []; m.orphaned = []; AutoReq.applyMerge(m, { acceptNew: true, acceptUpdates: false, acceptOrphanRemoval: false }); } catch (e) { R.w.genErr = String(e); } });
            const sub2 = A.reportSections().find(s => s.cma === row.internalId);
            const close2 = (sub2.blocks.find(b => /-c-c-1-close$/.test(b.id)) || {}).text || '';
            const list2 = sub2.blocks.find(b => b.type === 'list');
            R.w.reqClose = close2; R.w.reqNamed = /^Closed by requirement (REQ-\S+): "The design shall supply rudder lane B from the second essential bus\." /.test(close2) && !!list2 && /^REQ-\S+ The design shall supply rudder lane B/.test(list2.items[0].text);
            // typed status is never read: a second CMA with nothing answered and a typed "Closed"
            const free2 = A.questions()[0].options[0].id;
            const row2 = A.addCma({ gates: [free2] }).row;
            row2.status = 'Closed \u2014 Accepted';
            const s2 = A.reportSections().find(s => s.cma === row2.internalId);
            R.w.typedIgnored = s2.state === 'open' && /^Open: /.test(s2.blocks[s2.blocks.length - 1].text) && !/Closed/.test(s2.blocks[s2.blocks.length - 1].text);
            F.sync(row2);
            // an earlier entry: adopted on its first answer, never a second row
            const leg = cmaData.find(c => c.cmaId === 'CMA-006'), nL = live().length, legGates = leg.linkedGateIds.join(',');
            const la = A.answer('cma/' + leg.internalId + '/cat/' + c0, 'no', { why: 'Each channel has its own supply.' });
            R.w.adopted = la.ok && !!leg.flow && leg.flow.gates.join(',') === legGates && live().length === nL && leg.flow.answers[c0].a === 'no';

            // ---- [E] inline Edit and Add a CMA --------------------------------------------------------------------------
            const ef = A.editFields(row);
            R.e.fields = ef.fields.map(f => f.key).join(',');
            R.e.values = ef.fields.find(f => f.key === 'gates').value.join(',') === freeKey && ef.fields.find(f => f.key === 'claim').value === row.flow.claim;
            const nE = live().length;
            const sv = ef.save({ subject: 'Rudder lane independence', claim: 'Rudder lanes A and B share no cause that fails both.', references: 'Wiring diagram WD-31 rev B' });
            R.e.saved = sv.ok && row.subject === 'Rudder lane independence' && row.flow.claim === 'Rudder lanes A and B share no cause that fails both.' && row.claim === row.flow.claim && row.references === 'Wiring diagram WD-31 rev B' && live().length === nE;
            const steal = A.saveEdit(row.internalId, { gates: [freeKey, 'pg-fcs-pitch:7068'] });
            R.e.stealRefused = !steal.ok && /CMA-001/.test(steal.why || '') && row.flow.gates.join(',') === freeKey;
            const efNew = A.editFields(null);
            R.e.newForm = efNew.isNew && efNew.title === 'Add a CMA' && efNew.fields.find(f => f.key === 'gates').options.every(o => !A.ownerOf(o.value));
            const free3 = A.questions()[0].options[0] && A.questions()[0].options[0].id;
            const viaForm = free3 ? efNew.save({ gates: [free3], subject: 'Added from the form' }) : { ok: false };
            const viaFormAgain = free3 ? A.editFields(null).save({ gates: [free3] }) : { ok: true };
            R.e.formAdd = viaForm.ok && !viaFormAgain.ok && live().filter(c => (c.linkedGateIds || []).indexOf(free3) >= 0).length === 1;
            R.e.noDupGates = (() => { const seen = {}; let d = 0; live().forEach(c => ((c.flow ? c.flow.gates : c.linkedGateIds) || []).forEach(k => { if (seen[k]) d++; seen[k] = 1; })); return d; })();

            // ---- [O] outputs and acceptance -----------------------------------------------------------------------------
            const outs = A.reportOutputs();
            const oc = outs.find(o => o.id === 'cma.claim.' + row.internalId);
            R.o = { every: outs.length >= live().length + 2 && outs.every(o => o.what && o.to.length && o.accept && Array.isArray(o.qids) && o.fp), qids: !!oc && oc.qids.indexOf(qcat) >= 0 && oc.qids.indexOf(fu.id) >= 0, reqOut: (outs.find(o => o.id === 'cma.reqs') || {}).qids.indexOf(fu.id) >= 0 };
            A.acceptOutput(oc.id);
            const st1 = A.acceptance().find(o => o.id === oc.id);
            A.answer('cma/' + row.internalId + '/cat/' + cats[1].id, 'no', { why: 'Separate distribution for each lane.' });
            const st2 = A.acceptance().find(o => o.id === oc.id);
            const other = A.acceptance().find(o => o.id === 'cma.claim.' + leg.internalId);
            R.o.accepted = st1.state === 'accepted' && !!st1.by && !!st1.at && !!projectConfig.ccaReports.cma.accept[oc.id];
            R.o.reopened = st2.state === 'reopened' && other.state === 'open';
            const io = A.reportIO();
            R.o.io = io.inputs.length >= 5 && io.outputs.length >= 3 && io.inputs.every(x => x.what && x.from) && io.outputs.every(x => x.what && x.to) && io.prose.length === 2;

            // ---- final text checks over everything the report now holds -------------------------------------------------
            const all = A.reportSections();
            R.f = { digits: ownWords(all).filter(t => /\d/.test(t)).slice(0, 5), dashes: textsOf(all).concat(JSON.stringify(A.reportIO()), JSON.stringify(A.reportOutputs().map(o => [o.what, o.accept, o.to])), JSON.stringify(A.editFields(row).fields.map(f => [f.label, f.help]))).filter(t => /\u2014/.test(t)).slice(0, 3), subjectClean: /Rudder lane independence/.test(JSON.stringify(all.map(s => s.title))) };

            // ---- [U] the questions drawn ---------------------------------------------------------------------------------
            switchTab('cma'); await wait(500);
            const host = document.createElement('div'); host.id = 'cmq-test-host'; host.style.cssText = 'width:760px'; document.getElementById('view-cma').prepend(host);
            A.mount(host, { cma: row2.internalId });
            const cardSel = id => host.querySelector('[data-cmqopt="' + id + '"]');
            const q2cat = 'cma/' + row2.internalId + '/cat/' + c0;
            cardSel(q2cat + '|concern').click(); await wait(80);
            const afterClick = row2.flow.answers[c0];
            const fuBox = host.querySelector('[data-cmqbox="cma/' + row2.internalId + '/concern/C-1"]');
            R.u = { clicked: !!afterClick && afterClick.a === 'concern' && cardSel(q2cat + '|concern').classList.contains('on'), indented: !!fuBox && fuBox.getAttribute('data-cmqdepth') === '1' && parseInt(fuBox.style.marginLeft, 10) > 0 && fuBox.classList.contains('sub'),
                leftAligned: getComputedStyle(cardSel(q2cat + '|no')).justifyContent === 'flex-start' };
            // an answer that needs words shows its boxes before anything is written
            host.querySelector('[data-cmqopt="cma/' + row2.internalId + '/concern/C-1|evidence"]').click(); await wait(80);
            const boxes = host.querySelectorAll('[data-cmq-fields="cma/' + row2.internalId + '/concern/C-1"] textarea');
            R.u.boxesFirst = boxes.length === 2 && row2.flow.concerns[0].status === 'Open';
            boxes[0].value = 'Lane B moved to its own bus.'; boxes[1].value = 'Wiring diagram WD-40 rev A';
            host.querySelector('[data-cmq-save="cma/' + row2.internalId + '/concern/C-1"]').click(); await wait(80);
            R.u.saved = row2.flow.concerns[0].status === 'Mitigated' && row2.flow.concerns[0].backedBy === 'Wiring diagram WD-40 rev A';
            // dark mode: the cards stay readable
            const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
            const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
            document.body.classList.add('theme-dark'); await wait(60);
            const opt = cardSel(q2cat + '|no'), lab = opt.querySelector('.cmq-ol'), oe = opt.querySelector('.cmq-oe');
            R.u.dark = [ratio(getComputedStyle(lab).color, getComputedStyle(opt).backgroundColor), ratio(getComputedStyle(oe).color, getComputedStyle(opt).backgroundColor)];
            document.body.classList.remove('theme-dark');
            host.remove();
            // the table switch
            const vis = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none'; };
            renderCMA(); await wait(300);
            R.u.switchOn = A.tableHidden() && !vis('cma-table-wrap') && !vis('cma-flow-host') && !vis('cma-scope-chips') && vis('cma-decision-log') && vis('ccr-host-cma') && document.getElementById('cma-body').children.length > 0;
            A.setTableHidden(false); renderCMA(); await wait(150);
            R.u.switchOff = !A.tableHidden() && vis('cma-table-wrap') && vis('cma-flow-host') && !vis('ccr-host-cma');
            A.setTableHidden(null); await wait(50);
            R.u.switchBack = !vis('cma-table-wrap') && vis('ccr-host-cma');
            return R;
        }), 240000, 'the browser step');

        console.log('\n[B] the builder');
        check('[B] one section per independence claim, each with its own anchor, titled by its CMA id', r.b.n === r.b.want && r.b.n >= 14 && r.b.ids === r.b.n && r.b.titled, JSON.stringify(r.b).slice(0, 300));
        check('[B] building the report writes nothing (no adopt, no store)', r.b.pure);
        check('[B] claims a DAL reduction rests on come first', r.b.critFirst);
        check('[B] a gate is named with its tree and failure condition (CMA-001: G-7068 Loss of both elevator actuation lanes)', r.b.gateRow && /^G-7068 Loss of both elevator actuation lanes$/.test(r.b.gateRow[0]) && /FCS loss of pitch output/.test(r.b.gateRow[1]) && /^FC-\S+ \S/.test(r.b.gateRow[2]) && /lane A/.test(r.b.gateRow[3]) && r.b.gateRow[4] === 'Yes, critical', JSON.stringify(r.b.gateRow));
        check('[B] every gate in every section carries its name, its tree and its inputs; a figure with clickable boxes', r.b.allGateCellsNamed && r.b.figure);
        check('[B] every common mode category is in every section, each row tagged with its question', r.b.cats > 30 && r.b.catsCovered, r.b.cats);
        check('[B] status derived, not typed: earlier entries typed "Closed" read "Not substantiated yet"', r.b.legacyDerived.length === 4 && r.b.legacyDerived.every(x => x === 'earlier:true') && r.b.statusLast, JSON.stringify(r.b.legacyDerived));
        check('[B] no counts in the report\'s own words', r.b.digitsInOwnWords.length === 0, JSON.stringify(r.b.digitsInOwnWords));
        check('[B] no em dashes in the report', r.b.dashes.length === 0, JSON.stringify(r.b.dashes));
        console.log('\n[Q] the questions');
        check('[Q] the first question lists the critical gates with no CMA yet (an earlier entry\'s gate counts as covered)', r.q.start && r.q.startOnlyFree && r.q.startExcludesLegacy, JSON.stringify(r.q));
        check('[Q] per claim: the gates, then the claim, then every category', r.q.order === 'gates,claim' && r.q.catQs === r.b.cats, JSON.stringify(r.q));
        check('[Q] every question has a short intro; every answer says what it means and what it changes', r.q.everyCardSays);
        check('[Q] categories asked in plain words', r.q.plain);
        check('[Q] no follow-up question until a concern exists; no em dashes in the questions', r.q.noFollowUpsYet && r.q.dashes.length === 0, JSON.stringify(r.q.dashes));
        check('[Q] an earlier entry\'s typed claim shows as answered in its own words', r.q.legacyClaim);
        console.log('\n[W] answering');
        check('[W] "Add a CMA" on a free critical gate makes one four-step row on that gate', r.w.added && r.w.flow && r.w.gates, JSON.stringify(r.w));
        check('[W] an em dash typed in the subject never reaches the report (it reads as a comma)', r.w.cleanTitle);
        check('[W] its DAL reduction stays held back (CMA pending, not substantiated) while the claim is open', r.w.heldBack && r.w.stillHeld, JSON.stringify(r.w));
        check('[W] the drafted claim is written from the gate and its inputs', r.w.claimDrafted);
        check('[W] a Concern opens C-1 and its follow-up, indented right under its category; follow-ups only there', r.w.concern && r.w.onlyUnderConcern, JSON.stringify(r.w));
        check('[W] who answered and when is kept on the CMA', r.w.who);
        check('[W] the paragraphs an answer wrote carry its question id (the frame lights them up)', r.w.tagged && r.w.claimPara);
        check('[W] a requirement must say "shall"; until the concern is closed the status says so in words', r.w.stillHeld && r.w.progressWords, JSON.stringify(r.w));
        check('[W] every category answered and the concern closed: Substantiated, and the gate\'s reduction is given back by this CMA', r.w.substantiated && r.w.subWords, JSON.stringify(r.w));
        check('[W] a raised requirement waiting for acceptance is said in words', /waiting on the requirements page/.test(r.w.pendingReq), r.w.pendingReq);
        check('[W] accepted on the requirements page, the report gives the requirement\'s ID and its words', r.w.reqNamed, r.w.reqClose + ' ' + (r.w.genErr || ''));
        check('[W] a typed "Closed" on an unanswered CMA is ignored: the report says Open', r.w.typedIgnored);
        check('[W] an earlier entry is adopted on its first answer, its gates kept, no second row', r.w.adopted);
        console.log('\n[E] Edit and Add a CMA');
        check('[E] Add refuses a second CMA on the same gate, the same subject, or an earlier entry\'s gate', r.e.dupGate && r.e.dupSubject && r.e.dupLegacy && r.e.oneRow, JSON.stringify(r.e));
        check('[E] editFields gives the fields the table held, with their values', r.e.fields === 'subject,gates,claim,level,references,summary' && r.e.values, r.e.fields);
        check('[E] Edit saves into the same row (subject, claim on the record, references); no new row', r.e.saved);
        check('[E] Edit cannot take a gate another CMA has', r.e.stealRefused);
        check('[E] Add a CMA from the form: free gates only, and the same gate again is refused', r.e.newForm && r.e.formAdd);
        check('[E] no gate sits in two CMAs anywhere', r.e.noDupGates === 0, r.e.noDupGates);
        console.log('\n[O] outputs and acceptance');
        check('[O] every output names what, for whom, how it is accepted, and the questions behind it', r.o.every && r.o.qids && r.o.reqOut, JSON.stringify(r.o));
        check('[O] an output is accepted with who and when, and reopened when an answer behind it changes (others untouched)', r.o.accepted && r.o.reopened, JSON.stringify(r.o));
        check('[O] inputs and outputs: what the analysis needs and from where, what it produces and for whom', r.o.io);
        console.log('\n[F] the report text after the answers');
        check('[F] still no counts in its own words and no em dashes anywhere', r.f.digits.length === 0 && r.f.dashes.length === 0 && r.f.subjectClean, JSON.stringify(r.f));
        console.log('\n[U] the questions drawn, and the table switch');
        check('[U] a click on an answer card answers it; cards are left aligned', r.u.clicked && r.u.leftAligned, JSON.stringify(r.u));
        check('[U] the follow-up shows indented under its parent', r.u.indented);
        check('[U] an answer that needs words shows its boxes before anything is written, then saves', r.u.boxesFirst && r.u.saved, JSON.stringify(r.u));
        check('[U] dark mode: the answer cards read at 4.5:1 or better', r.u.dark.every(x => x >= 4.5), JSON.stringify(r.u.dark));
        check('[U] switch on (the default): the table, the scope chips and the four-step editor go; the report is on the page; the decision log stays; the table still renders behind it', r.u.switchOn, JSON.stringify(r.u));
        check('[U] switch off: the old table and the four-step editor come back and the report goes; on again restores the report', r.u.switchOff && r.u.switchBack);

        console.log('\n[R] the report frame');
        const F2 = await within(pg.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const A = window.SLCmaAuto, F = window.SLCmaFlow, R = SLCcaReport.get('cma'), X = {};
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 4000)) { try { if (fn()) return true; } catch (_) {} await wait(80); } return false; };
            const live = () => cmaData.filter(c => c && !c.suggested);
            const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
            switchTab('dashboard'); await wait(200); switchTab('cma'); await wait(900);
            const host = document.getElementById('ccr-host-cma'), view = document.getElementById('view-cma');
            const pv = () => host.querySelector('[data-ccdoc]');
            X.r1 = { defined: !!R, inView: !!host && view.contains(host) && vis(host), underHead: !!host && !!host.previousElementSibling && host.previousElementSibling.classList.contains('header-with-export'),
                left: !!host.querySelector('[data-cmq-left]'), claimBtns: host.querySelectorAll('[data-cmqclaim]').length, secs: pv().querySelectorAll('[data-ccsec]').length, claims: live().length,
                repClaims: (R.reports().find(rp => rp.id === R.tab()) || { sections: [] }).sections.length, tableGone: !vis(document.getElementById('cma-table')) && !vis(document.getElementById('cma-flow-host')) && !vis(document.getElementById('cma-scope-chips')), log: vis(document.getElementById('cma-decision-log')) || !!document.getElementById('cma-decision-log') };
            // pick a claim with a free category: the four-step one made earlier ("Rudder lane independence")
            const row = live().find(c => c.subject === 'Rudder lane independence');
            // v1.2: one CMA report per level; the claim's own report is opened first (its gates decide which)
            const repOfRow = R.reports().find(rp => rp.sections.indexOf(A.anchorOf(row)) >= 0);
            X.r1.ownReport = !!repOfRow; if (repOfRow) { R.setTab(repOfRow.id); await wait(500); }
            host.querySelector('[data-cmqclaim="' + row.internalId + '"]').click(); await wait(500);
            X.r1.selected = A.selected() === row.internalId && !!host.querySelector('[data-cmqclaim="' + row.internalId + '"].on') && !!host.querySelector('[data-cmqbox="cma/' + row.internalId + '/claim"]');
            X.r1.secFlash = !!pv().querySelector('[data-ccsec="' + A.anchorOf(row) + '"].ccr-flash');
            // an answer card in the frame: answered, and the table row it wrote lights up
            const cats = A.categoriesPlain(), c2 = cats[2].id, q2 = 'cma/' + row.internalId + '/cat/' + c2;
            host.querySelector('[data-cmqopt="' + q2 + '|na"]').click(); await wait(500);
            const tr = pv().querySelector('tr[data-ccq="' + q2 + '"]');
            X.r2 = { answered: row.flow.answers[c2] && row.flow.answers[c2].a === 'na', rowLit: !!tr && tr.classList.contains('ccr-flash'), rowText: tr ? tr.textContent : '' };
            // "See where it goes" on the claim: its paragraph lights up
            const qc = 'cma/' + row.internalId + '/claim';
            host.querySelectorAll('.ccr-flash').forEach(e => e.classList.remove('ccr-flash'));
            const see = host.querySelector('[data-cmqbox="' + qc + '"] .cmq-see'); if (see) see.click(); await wait(200);
            const cp = pv().querySelector('p[data-ccq="' + qc + '"]');
            X.r2.see = !!see && !!cp && cp.classList.contains('ccr-flash') && /^The claim: /.test(cp.textContent);
            // a figure box opens its panel
            const box = pv().querySelector('[data-ccnode^="' + A.anchorOf(row) + '-g0"][data-cckey="cma"]');
            if (box) box.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(400);
            const panel = host.querySelector('[data-cc-node]');
            X.r3 = { box: !!box, panel: panel ? panel.textContent.slice(0, 400) : '' };
            // outputs accepted in the frame by role, reopened by a changed answer; one store
            const oid = 'cma.claim.' + row.internalId;
            SLCcaReport.act('cma', 'unaccept', oid); await wait(200);
            const btn = host.querySelector('[data-cc-acceptbtn="' + oid + '"]'); if (btn) btn.click(); await wait(400);
            const a1 = R.acceptance().find(o => o.id === oid), m1 = A.acceptance().find(o => o.id === oid);
            A.answer(q2, 'no', { why: 'Each lane has its own data.' }); await wait(100);
            R.render(); await wait(200);
            const a2 = R.acceptance().find(o => o.id === oid), m2 = A.acceptance().find(o => o.id === oid);
            const pill = host.querySelector('[data-cc-out="' + oid + '"] .slap-pill');
            X.r4 = { btn: !!btn, a1: a1 && a1.state, m1: m1 && m1.state, a2: a2 && a2.state, m2: m2 && m2.state, pill: pill && pill.textContent, role: a1 && a1.role, oneStore: !(projectConfig.cmaAuto && projectConfig.cmaAuto.accept) && !!(projectConfig.ccaReports.cma.accepts[R.tab()] || {})[oid] };
            // v1.0's store moved once into the frame's
            projectConfig.cmaAuto = { accept: { 'cma.findings': { by: 'old', at: '2026-11-08T00:00:00Z', fp: 'x' } } };
            A.acceptOutput('cma.reqs');
            X.r4.migrated = !projectConfig.cmaAuto && projectConfig.ccaReports.cma.accept['cma.findings'] && projectConfig.ccaReports.cma.accept['cma.findings'].by === 'old';
            // Word
            const m = R.model({ report: R.tab() }), lib = await _loadDocxLib();
            const imgs = m.blocks.filter(x => x.k === 'img'); for (const x of imgs.slice(0, 4)) x.dataUrl = await SLFtaPrint.png({ svg: x.svg, w: x.w, h: x.h }, 1);
            const blob = await SLReportWriter.docx(m, lib), buf = new Uint8Array(await blob.arrayBuffer());
            let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
            const bl = R.doc({ report: R.tab() });
            // the document's own words: the data the engineer typed (subjects, claims, findings, gate and event names) taken out
            const data = []; live().forEach(c => { [c.subject, c.claim, c.findings, c.mitigation, c.references, c.flow && c.flow.claim, c.flow && c.flow.summary].forEach(t => { if (t) data.push(String(t)); }); ((c.flow && c.flow.concerns) || []).forEach(cc => [cc.text, cc.mitigation, cc.backedBy, cc.acceptWhy, cc.reqText].forEach(t => t && data.push(String(t)))); Object.values((c.flow && c.flow.answers) || {}).forEach(a => a.why && data.push(String(a.why))); });
            let text = m.blocks.map(x => x.k === 'table' ? JSON.stringify(x.rows) : (x.text || x.caption || '')).join('\n');
            data.slice().forEach(d => data.push(d.charAt(0).toLowerCase() + d.slice(1))); data.sort((a, b) => b.length - a.length).forEach(d => { const t = d.replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim(); text = text.split(t).join(' DATA '); });
            X.w = { b64: btoa(bin), size: blob.size, cover: m.cover.tables.map(t => t.title).join(','), roles: m.cover.tables[1].rows.map(r => r.Holder).join('|'), imgs: imgs.length, imgLight: imgs.every(x => /fill="#(ffffff|FFFFFF)"/.test(x.svg)),
                toc: pv().querySelectorAll('[data-cc-toc] [data-cc-goto^="h"]').length, heads: bl.filter(x => x.k === 'h').length, lot: pv().querySelectorAll('[data-cc-lot]').length, tables: bl.filter(x => x.k === 'table').length, lof: pv().querySelectorAll('[data-cc-lof]').length, figs: bl.filter(x => x.k === 'fig').length,
                leadOk: bl.every((x, i) => !(x.k === 'table' || x.k === 'fig') || (bl[i - 1] && bl[i - 1].k === 'p' && bl[i - 1].text.indexOf((x.k === 'table' ? 'Table ' : 'Figure ') + x.n) >= 0)),
                counts: ((t => (t.match(/.{0,40}\b\d+ (of \d+|gates?|categories|concerns?|claims?|questions?|rows|answers)\b/g) || []))(text.replace(/\b[A-Z][A-Za-z]*-[A-Z0-9-]*\d[A-Z0-9-]*\b/g, 'ID'))).slice(0, 5), dashes: (JSON.stringify(m.blocks.map(x => [x.text, x.caption, x.rows])).match(/—/g) || []).length, acts: m.blocks.filter(x => x.k === 'act').length };
            // dark mode: a dark, readable document; the figure dark on the page and light in Word
            const lum = c => { const mm = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(mm[0]) + 0.7152 * f(mm[1]) + 0.0722 * f(mm[2]); };
            const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
            document.body.classList.add('theme-dark'); await wait(400);
            const cs = el => getComputedStyle(el), P0 = pv(), sec = P0.querySelector('[data-ccsec="' + A.anchorOf(row) + '"]');
            const p = sec.querySelector('p'), th = sec.querySelector('.ccr-dt th'), td = sec.querySelector('.ccr-dt td'), h3 = sec.querySelector('h3'), frect = sec.querySelector('.ccr-fig svg rect');
            const card = host.querySelector('.cmq-opt'), cl = card.querySelector('.cmq-ol');
            X.d = { bg: lum(cs(P0).backgroundColor), p: ratio(cs(p).color, cs(P0).backgroundColor), th: ratio(cs(th).color, cs(th).backgroundColor), td: ratio(cs(td).color, cs(td).backgroundColor), h: ratio(cs(h3).color, cs(P0).backgroundColor), card: ratio(cs(cl).color, cs(card).backgroundColor), fig: frect && frect.getAttribute('fill') };
            document.body.classList.remove('theme-dark'); await wait(400);
            X.d.back = (pv().querySelector('[data-ccsec="' + A.anchorOf(row) + '"] .ccr-fig svg rect') || {}).getAttribute && pv().querySelector('[data-ccsec="' + A.anchorOf(row) + '"] .ccr-fig svg rect').getAttribute('fill');
            // Edit in the report
            const anc = A.anchorOf(row), nE = live().length;
            SLCcaReport.act('cma', 'edit', anc); await wait(300);
            const form = host.querySelector('[data-cc-form="' + anc + '"]');
            X.e = { form: !!form, fields: form ? [...form.querySelectorAll('[data-ccf]')].map(el => el.getAttribute('data-ccf')).join(',') : '' };
            if (form) { form.querySelector('[data-ccf="subject"]').value = 'Rudder lane independence (both fins)'; SLCcaReport.act('cma', 'save', anc); await wait(400); }
            X.e.saved = row.subject === 'Rudder lane independence (both fins)' && live().length === nE && !!pv().querySelector('[data-ccsec="' + anc + '"].ccr-flash');
            // Add a CMA in the report, then the same gate again: refused in words, nothing written
            const free = A.questions()[0].options[0].id;
            SLCcaReport.act('cma', 'add'); await wait(300);
            let af = host.querySelector('[data-cc-form="new"]');
            const tick = (f, key) => { const cb = [...f.querySelectorAll('[data-ccf="gates"] input[type=checkbox]')].find(c => c.value === key); if (cb) cb.checked = true; return !!cb; };
            X.e.addForm = !!af && tick(af, free);
            if (af) { af.querySelector('[data-ccf="subject"]').value = 'Added in the report'; SLCcaReport.act('cma', 'save', null); await wait(400); }
            X.e.added = live().length === nE + 1 && live().some(c => c.subject === 'Added in the report' && (c.linkedGateIds || []).indexOf(free) >= 0);
            SLCcaReport.act('cma', 'add'); await wait(300); af = host.querySelector('[data-cc-form="new"]');
            if (af) { af.querySelector('[data-ccf="subject"]').value = 'Added in the report'; SLCcaReport.act('cma', 'save', null); await wait(300); }
            const err = host.querySelector('[data-cc-err]');
            X.e.dupRefused = live().length === nE + 1 && !!err && /already covers/.test(err.textContent);
            SLCcaReport.act('cma', 'cancel'); await wait(200);
            // "Review in CMA" and Edit on a CMA open it in the report
            const free2 = A.questions()[0].options[0].id, nR = live().length;
            SLCriticalGates.startReview(free2); await wait(400);
            const made = F.cmaForGate(free2);
            SLCriticalGates.startReview(free2); await wait(300);
            X.e.review = !!made && live().length === nR + 1 && A.selected() === made.internalId;
            editCMA(made.internalId);
            X.e.editOpens = await until(() => !!document.querySelector('#ccr-host-cma [data-cc-form="' + A.anchorOf(made) + '"]'));
            SLCcaReport.act('cma', 'cancel'); await wait(150);

            // [N] no duplicates anywhere, through cma_flow too
            const leg = cmaData.find(c => c.cmaId === 'CMA-001'), k = 'pg-fcs-pitch:7068', nN = live().length;
            X.n = { owner: F.cmaForGate(k) === leg, wasEarlier: !leg.flow };
            const made2 = F.create([k]);
            X.n.createSkips = made2.flow.gates.indexOf(k) < 0;
            const ag = F.addGate(made2.internalId, k);
            X.n.addRefused = !ag.ok && /CMA-001/.test(ag.why || '');
            cmaData.splice(cmaData.indexOf(made2), 1);
            const sus = { key: 'test-live-n:' + k, kind: 'shared-event', subject: 'Shared repeated event under both lanes', members: ['Lane bus'], memberLabels: ['Lane bus'], coupledGates: [k], locations: [k], locationLabels: {} };
            SLCmaLive.decide(sus, 'accept', '', { via: 'test' });
            X.n.liveIntoEarlier = live().length === nN && !!leg.flow && leg.flow.concerns.some(c => c.liveKey === sus.key && c.defeats) && leg.flow.gates.indexOf(k) >= 0;
            // the row live detection made for the same finding keeps its own path
            const own = { internalId: 'nd-own-1', cmaId: 'CMA-990', subject: 'Live row', linkedGateIds: ['pg-x:1'], autoKey: 'own-key', status: 'Open', findings: 'f' };
            cmaData.push(own);
            const back = F.takeLiveFinding({ key: 'own-key', coupledGates: ['pg-x:1'], locations: ['pg-x:1'] });
            X.n.ownPath = back === null && !own.flow;
            cmaData.splice(cmaData.indexOf(own), 1);
            X.n.noDupGates = (() => { const seen = {}; let d = 0; live().forEach(c => ((c.flow ? c.flow.gates : c.linkedGateIds) || []).forEach(g => { if (seen[g]) d++; seen[g] = 1; })); return d; })();
            return X;
        }), 240000, 'the frame step');
        check('[R] the CMA page is the report on the frame, right under the heading: questions on the left, a section per claim of the open report (aircraft level or one system) on the right', F2.r1.defined && F2.r1.inView && F2.r1.underHead && F2.r1.left && F2.r1.claimBtns === F2.r1.repClaims && F2.r1.secs === F2.r1.repClaims && F2.r1.repClaims > 0 && F2.r1.ownReport, JSON.stringify(F2.r1));
        check('[R] the CMA table, its scope chips and the four-step editor are gone from the page; the decision log stays', F2.r1.tableGone && F2.r1.log);
        check('[R] picking a claim shows its questions and lights up its section', F2.r1.selected && F2.r1.secFlash, JSON.stringify(F2.r1));
        check('[R] an answer card in the frame answers, and the table row it wrote lights up', F2.r2.answered && F2.r2.rowLit && /Does not apply/.test(F2.r2.rowText), JSON.stringify(F2.r2));
        check('[R] "See where it goes" lights up the paragraph the answer wrote', F2.r2.see);
        check('[R] a gate box in the figure opens its panel: inputs, outputs and how each is accepted', F2.r3.box && /^G-\S+ /.test(F2.r3.panel) && /Accepted when/.test(F2.r3.panel) && /Inputs/.test(F2.r3.panel), F2.r3.panel);
        check('[R] an output accepted in the frame (by role) is accepted in the CMA module too, and both reopen on a changed answer', F2.r4.btn && F2.r4.a1 === 'accepted' && F2.r4.m1 === 'accepted' && F2.r4.a2 === 'reopened' && F2.r4.m2 === 'reopened' && /Reopened/.test(F2.r4.pill || '') && F2.r4.role === 'Chief safety engineer', JSON.stringify(F2.r4));
        check('[R] one record of acceptance: the frame\'s store; v1.0\'s is moved into it once', F2.r4.oneStore && F2.r4.migrated, JSON.stringify(F2.r4));
        let docText = ''; try { const tmp = path.join(require('os').tmpdir(), 'cma_report_' + process.pid + '.docx'); fs.writeFileSync(tmp, Buffer.from(F2.w.b64, 'base64')); docText = require('child_process').execFileSync('unzip', ['-p', tmp, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString().replace(/<[^>]+>/g, ' '); fs.unlinkSync(tmp); } catch (e) { docText = 'unzip failed: ' + e.message; }
        check('[R] Word: cover (document control, approvals by role, revision history), contents, list of tables, list of figures', F2.w.size > 30000 && F2.w.cover === 'Document control,Approvals,Revision history' && /To be named \(by role\)/.test(F2.w.roles) && /Contents/.test(docText) && /List of Tables/.test(docText) && /List of Figures/.test(docText) && /Common Mode Analysis/.test(docText), JSON.stringify({ size: F2.w.size, cover: F2.w.cover, doc: docText.slice(0, 160) }));
        check('[R] the open report\'s preview has the same front matter as its Word file, every table and figure numbered and introduced before it appears', F2.w.toc === F2.w.heads && F2.w.lot === F2.w.tables && F2.w.lof === F2.w.figs && F2.w.tables >= 6 && F2.w.figs >= 1 && F2.w.leadOk, JSON.stringify(Object.assign({}, F2.w, { b64: '' })).slice(0, 300));
        check('[R] no counts and no em dashes in the document text; figures drawn light for Word; no page-only buttons', !F2.w.counts.length && !F2.w.dashes && F2.w.imgLight && F2.w.acts === 0, JSON.stringify(F2.w.counts));
        check('[R] dark mode: a dark document with readable text, headings, table cells and answer cards (4.5:1 or better); figures dark on the page, light again after', F2.d.bg < 0.05 && F2.d.p >= 4.5 && F2.d.th >= 4.5 && F2.d.td >= 4.5 && F2.d.h >= 4.5 && F2.d.card >= 4.5 && F2.d.fig === '#15181E' && /^#fff/i.test(F2.d.back || ''), JSON.stringify(F2.d));
        check('[R] Edit in the report opens the CMA\'s fields and saves into the same row; the section lights up', F2.e.form && F2.e.fields === 'subject,gates,claim,level,references,summary' && F2.e.saved, JSON.stringify(F2.e));
        check('[R] Add a CMA in the report writes one row; the same again is refused in words and nothing is written', F2.e.addForm && F2.e.added && F2.e.dupRefused, JSON.stringify(F2.e));
        check('[R] "Review in CMA" on a critical gate starts its CMA once and selects it; Edit on a CMA opens its fields in the report', F2.e.review && F2.e.editOpens, JSON.stringify(F2.e));
        console.log('\n[N] no duplicates anywhere');
        check('[N] an earlier CMA\'s gate is taken: cma_flow\'s new CMA leaves it out and Add gate refuses it', F2.n.owner && F2.n.wasEarlier && F2.n.createSkips && F2.n.addRefused, JSON.stringify(F2.n));
        check('[N] a live finding on that gate adopts the earlier CMA and lands there as a concern, no second row', F2.n.liveIntoEarlier, JSON.stringify(F2.n));
        check('[N] the row live detection made for the same finding keeps its own path; no gate sits in two CMAs', F2.n.ownPath && F2.n.noDupGates === 0, JSON.stringify(F2.n));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
