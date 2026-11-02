/* regression_cma_flow_20261031.test.js — the Common Mode Analysis in four steps (cma_flow.js v1.1, Radia checklist item 1; v1.1: one way to make a CMA).
 *
 * Agreed with Waqas, 31 Oct 2026 (the mockup board "CMA, redesigned"): one CMA per set of gates, four steps (what must
 * be independent; the App M Table M1 questionnaire; concerns and mitigations; close out), a status that means
 * something (Open, In progress: the DAL reduction held back; Mitigated: given back; Closed, accepted: signed, and a
 * change to the gates reopens it), live detection adding to the CMA instead of a second row, a mitigation raised as a
 * generated requirement, ANEM drafts that wait for Accept and never set a number.
 *   [F] create, one CMA per set of gates, the CMA ID from the numbering
 *   [S] the status follows the steps; the reduction is held back until Mitigated, then given back; sign closes it; a
 *       change to a gate reopens it and takes the reduction back
 *   [Q] a Concern answer opens a concern; a mitigated concern needs what backs it; an accepted one needs why
 *   [R] "Raise requirement" puts a generated requirement (cma-concern) traced to the CMA, once
 *   [L] a live-detection finding on its gates lands in the CMA as a concern that defeats the claim; no second row
 *   [A] an entry logged before the four steps opens in them, its gates, claim and findings carried over
 *   [U] the page: four steps, the categories, Sign only when mitigated; Edit and "Review in CMA" open the steps
 *   [M] Table M2 in the report has a row per concern
 *   [N] ANEM drafts: only known gates, categories and concerns; a number is left out; Accept writes, Discard does not
 * MUTATION PROOFS: SL_CMAF_MUTATE=nosub (Mitigated gives nothing back), =nofp (a gate change does not reopen),
 *   =noid (ANEM's unknown ids kept), =nolive (live findings make a second row), =logform (the old "Log CMA entry" fold-out back on the page).
 * Run: node tests/regression_cma_flow_20261031.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_CMAF_MUTATE || '';
function mutate(file, body) {
    if (MUT === 'logform' && file === 'helpers_modules.js') return body.replace("        // 31 Oct 2026: no fold-out entry form on the CMA page", "        ['view-cma',      '.controls', 'Log CMA entry'],\n        // 31 Oct 2026: no fold-out entry form on the CMA page");
    if (MUT === 'nosub' && file === 'cma_flow.js') return body.replace("function substantiates(row) { if (!row || !row.flow) return false;", "function substantiates(row) { return false;");
    if (MUT === 'nofp' && file === 'cma_flow.js') return body.replace("var changed = (f.gates || []).filter(function (k) { return f.gateFp[k] && f.gateFp[k] !== gateFp(k); });", "var changed = [];");
    if (MUT === 'noid' && file === 'ai_assistant.js') return body.replace("if (!open[id]) { dropped.push('category ' + id + ' (not an open category)'); return; }", "");
    if (MUT === 'nolive' && file === 'cma_live.js') return body.replace("var fr = (root.SLCmaFlow && typeof root.SLCmaFlow.takeLiveFinding === 'function') ? root.SLCmaFlow.takeLiveFinding(s) : null;", "var fr = null;");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const iCK = HTML.indexOf('comment_kinds.js?v=1.0'), iAs = HTML.indexOf('assurance_modules.js?v=');
    check('cma_flow.js v1.2 loads after cma_live.js and critical_gates.js', HTML.indexOf('cma_flow.js?v=1.2') > HTML.indexOf('cma_live.js?v=') && HTML.indexOf('cma_flow.js?v=1.2') > HTML.indexOf('critical_gates.js?v='));
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:kestrel');
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(60); } return null; };
            _applyProjectData(data); await wait(1500);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            if (window.SLCmaLive && SLCmaLive.setAutomation) try { SLCmaLive.setAutomation(true); } catch (_) {}
            const R = {}, F = window.SLCmaFlow;
            const ans = row => { F.categories().forEach(g => (g.items || []).forEach(it => { if (!(row.flow.answers[it[0]] && row.flow.answers[it[0]].a)) F.answer(row.internalId, it[0], 'na', 'Not shared by these channels.'); })); };
            const gates = F.allGates();
            // pick a gate no legacy CMA links, and a second one
            const free = gates.filter(g => !(cmaData || []).some(c => (c.linkedGateIds || []).map(String).indexOf(g.key) >= 0));
            const gA = free[0], gB = free[1];
            const recalc = () => { try { calculateAllProbabilities(); } catch (_) {} try { propagateDalAllRoots(); } catch (_) {} };
            // [F]
            const n0 = cmaData.length;
            const row = F.create([gA.key]);
            R.f = { flow: !!row.flow, id: row.cmaId, numbered: /^CMA-\d{3}$/.test(row.cmaId), status: row.status, links: row.linkedGateIds.join(','), want: gA.key, added: cmaData.length === n0 + 1 };
            const row2 = F.create([gB.key]);
            const dup = F.addGate(row2.internalId, gA.key);
            R.f.oneCma = !dup.ok && /already in/.test(dup.why || '') && row2.flow.gates.indexOf(gA.key) < 0;
            // [S] + [Q]
            recalc();
            const node = gA.node;
            R.s = { open: F.statusOf(row) };
            F.setClaim(row.internalId, 'The inputs of the gate share no cause that defeats both.');
            const cat0 = F.categories()[0].items[0][0];
            F.answer(row.internalId, cat0, 'concern', 'Both channels take power from one bus.');
            const cc = row.flow.concerns[0];
            R.q = { concern: !!cc && cc.id === 'C-1' && /one bus/.test(cc.text), linked: row.flow.answers[cat0].concernId === 'C-1' };
            ans(row); recalc();
            R.s.inProgress = F.statusOf(row); R.s.heldBack = !node._cmaSubstantiatedBy;
            const m1 = F.setConcern(row.internalId, 'C-1', { mitigation: 'Channel B moved to the second bus.' });
            const m2 = F.setConcern(row.internalId, 'C-1', { status: 'Mitigated' });
            R.q.needsBacking = m1.ok && !m2.ok && /backs it/.test(m2.why || '');
            F.setConcern(row.internalId, 'C-1', { backedBy: 'Wiring diagram WD-12 rev C' });
            const m3 = F.setConcern(row.internalId, 'C-1', { status: 'Mitigated' });
            recalc();
            R.s.mitigated = F.statusOf(row); R.s.backingOk = m3.ok;
            R.s.given = node._cmaSubstantiatedBy === row.cmaId;
            const sg = F.sign(row.internalId, 'Waqas');
            R.s.closed = sg.ok && F.statusOf(row) === F.CLOSED && row.status === F.CLOSED;
            // a change to the gate: one more input
            node.children.push({ id: 990001, logicalId: 990001, type: 'basic', name: 'Added input', probability: 1e-6, children: [] });
            try { SLDataChange.bump(); } catch (_) {}
            F.sync(row); recalc();
            R.s.reopened = F.statusOf(row) !== F.CLOSED && !row.flow.signedBy && F.statusOf(row) !== 'Mitigated';
            R.s.takenBack = !node._cmaSubstantiatedBy;
            node.children.pop(); try { SLDataChange.bump(); } catch (_) {}
            // accepted concern needs why
            F.answer(row2.internalId, cat0, 'concern', 'Common cooling air.');
            const a1 = F.setConcern(row2.internalId, 'C-1', { status: 'Accepted' });
            F.setConcern(row2.internalId, 'C-1', { acceptWhy: 'Thermal margin shown by test.' });
            const a2 = F.setConcern(row2.internalId, 'C-1', { status: 'Accepted' });
            R.q.acceptNeedsWhy = !a1.ok && a2.ok;
            // [R]
            F.answer(row2.internalId, F.categories()[0].items[1][0], 'concern', 'Shared data network.');
            const bad = F.raiseRequirement(row2.internalId, 'C-2', 'Separate the networks.');
            const good = F.raiseRequirement(row2.internalId, 'C-2', 'The design shall carry channel A and channel B data on separate networks.');
            const _scopes = ['ac'].concat((systemsData || []).map(sy => 'sys-' + sy.id)); const _gr = { isNew: [], isUpdated: [], unchanged: [] }; _scopes.forEach(sc => { try { const g = AutoReq.generate({ gateIndependence: true }, sc); ['isNew', 'isUpdated', 'unchanged'].forEach(k => { (g[k] || []).forEach(x => _gr[k].push(x)); }); } catch (e) { R.genErr = String(e); } }); R.genShape = Object.keys(_gr.isNew[0] || {}).slice(0, 6).join(','); const cands = [].concat(_gr.isNew || [], _gr.isUpdated || [], _gr.unchanged || []).map(x => (x && x.candidate) || (x && x.cand) || x).filter(c => c && c.reqSource && c.reqSource.generator === 'cma-concern');
            R.r = { shape: R.genShape, genErr: R.genErr, gB: gB.key, refusedNoShall: !bad.ok, ok: good.ok, generated: cands.length, text: cands[0] && cands[0].text, traced: !!(cands[0] && /CMA-\d+ concern C-2/.test(cands[0].rat)) };
            // [L]
            const n1 = cmaData.length;
            const sus = { key: 'test-live:' + gB.key, kind: 'shared', subject: 'Shared repeated event under both inputs', members: ['Bus 1'], memberLabels: ['Bus 1'], coupledGates: [gB.key], locations: [gB.key], locationLabels: {} };
            SLCmaLive.decide(sus, 'accept', '', { via: 'test' });   // the live-detection path itself
            const hit = row2.flow.concerns.some(c => c.liveKey === sus.key) ? row2 : null;
            recalc();
            const lc = row2.flow.concerns.find(c => c.liveKey === sus.key);
            R.l = { intoRow: hit === row2, concern: !!lc && lc.defeats, noNewRow: cmaData.length === n1, compromises: _cmaCompromisedGateIdSet().has(String(gB.node.id)) };
            // [A] a legacy row
            const leg = cmaData.find(c => c && !c.flow && (c.linkedGateIds || []).length);
            if (leg) {
                const lid = leg.internalId, lgates = leg.linkedGateIds.join(','), lclaim = leg.claim;
                switchTab('cma'); await wait(500);
                editCMA(lid); await wait(300);
                R.a = { flow: !!leg.flow, gates: leg.flow && leg.flow.gates.join(',') === lgates, claim: leg.flow && leg.flow.claim === String(lclaim || ''), opened: F.opened() === lid };
            } else R.a = { skipped: true };
            // [U]
            switchTab('cma'); await wait(400);
            F.ui.open(row2.internalId); await wait(200);
            const host = document.getElementById('cma-flow-host');
            R.u = { steps: host.querySelectorAll('[data-cma-step]').length };
            const stepBtns = [...host.querySelectorAll('[data-cma-step]')];
            const lefts = stepBtns.map(b => Math.round(b.firstElementChild.getBoundingClientRect().left));
            R.u.aligned = lefts.length === 4 && lefts.every(x => x === lefts[0]);
            R.u.oneNumber = stepBtns.every(b => !/^\s*\d/.test(b.children[1].textContent));
            R.u.lefts = lefts;
            F.ui.step(2); await wait(150);
            R.u.cats = host.querySelectorAll('[data-cma-cat]').length;
            R.u.wantCats = F.categories().reduce((n, g) => n + (g.items || []).length, 0);
            F.ui.step(4); await wait(150);
            const sb = host.querySelector('[data-cma-sign]');
            R.u.signDisabled = !!(sb && sb.disabled);
            R.u.legacyFormHidden = getComputedStyle(document.getElementById('cma-legacy-form')).display === 'none';
            F.ui.close(); await wait(150);
            // one way to make a CMA: '+ New CMA'; no fold-out entry form left on the page; the check-now button moved beside it
            const vc = document.getElementById('view-cma');
            const vis = el => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
            R.u.newBtns = [...vc.querySelectorAll('button')].filter(b => vis(b) && /new cma/i.test(b.textContent)).length;
            R.u.bars = [...vc.querySelectorAll('.collapsible-form-bar')].map(b => b.textContent.trim());
            R.u.logShown = [...vc.querySelectorAll('button, .collapsible-form-bar, .cfb-title')].filter(b => vis(b) && /log cma/i.test(b.textContent)).length;
            const chk = host.querySelector('[data-cma-check-now]');
            R.u.checkNow = !!chk && vis(chk) && !/✨/.test(chk.textContent);
            const crit = gates.find(g => g.critical && !F.cmaForGate(g.key));
            if (crit) { const nn = cmaData.length; SLCriticalGates.startReview(crit.key); await wait(300); const made = F.cmaForGate(crit.key); R.u.review = !!made && cmaData.length === nn + 1 && F.opened() === made.internalId; SLCriticalGates.startReview(crit.key); await wait(200); R.u.reviewAgain = cmaData.length === nn + 1; }
            else R.u.review = R.u.reviewAgain = 'no free critical gate';
            // [M]
            const d = Reports.extractData('CMA');
            const grid = JSON.stringify((d && d.cma_grid) || []);
            R.m = { concernRows: /C-2: .*Shared data network/.test(grid) || /Shared data network/.test(grid), req: /separate networks/.test(grid) };
            // [N] ANEM with the service stubbed
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI.cmaFlowDraft, 20000);
            const cats = []; F.categories().forEach(g => (g.items || []).forEach(it => cats.push(it[0])));
            const row3 = F.create([free[2] ? free[2].key : gates[gates.length - 1].key]);
            let reply = {};
            window.AiClient = { isConfigured: () => true, messages: async () => ({ content: [{ type: 'text', text: JSON.stringify(reply) }], model: 'test-model', stop_reason: 'end_turn' }) };
            reply = { answers: [{ cat: cats[0], answer: 'no', why: 'Each channel has its own power supply.' }, { cat: 'made-up', answer: 'no', why: 'x' }, { cat: cats[1], answer: 'na', why: 'Residual beta 0.01 applies.' }, { cat: cats[2], answer: 'concern', why: 'Both computers sit in one equipment bay.' }] };
            const nr = await window.SafetyLabAI.cmaFlowDraft('answers', row3.internalId);
            const dr = row3.flow.drafts.answers || {};
            R.n = { ok: nr.ok, count: nr.count, kept: Object.keys(dr).sort().join(','), want: [cats[0], cats[2]].sort().join(','), noneWritten: !row3.flow.answers[cats[0]] };
            F.ui.open(row3.internalId); F.ui.step(2); F.ui.acceptAnswer(cats[2]); await wait(100);
            R.n.accepted = row3.flow.answers[cats[2]] && row3.flow.answers[cats[2]].a === 'concern' && row3.flow.concerns.length === 1;
            F.ui.discardAnswer(cats[0]);
            R.n.discarded = !row3.flow.answers[cats[0]] && !(row3.flow.drafts.answers || {})[cats[0]];
            reply = { gates: [{ key: 'nope:1', why: 'x' }, { key: gA.key, why: 'shared bus' }] };
            const gr = await window.SafetyLabAI.cmaFlowDraft('gates', row3.internalId);
            R.n.gates = { ok: gr.ok, why: gr.why || '', drafts: (row3.flow.drafts.gates || []).length };
            F.ui.close();
            return R;
        }, demo.data), 200000, 'the browser step');
        console.log('\n[F] create');
        check('[F] a CMA starts on its gates, numbered CMA-NNN, Open', r.f.flow && r.f.numbered && r.f.status === 'Open' && r.f.links === r.f.want && r.f.added, JSON.stringify(r.f));
        check('[F] one CMA per set of gates: a gate in one CMA cannot join another', r.f.oneCma, JSON.stringify(r.f));
        console.log('\n[S] the status and the DAL reduction');
        check('[S] Open, then In Progress with the reduction held back', r.s.open === 'Open' && r.s.inProgress === 'In Progress' && r.s.heldBack, JSON.stringify(r.s));
        check('[S] Mitigated gives the reduction back (the gate is substantiated by this CMA)', r.s.mitigated === 'Mitigated' && r.s.backingOk && r.s.given, JSON.stringify(r.s));
        check('[S] signing closes it', r.s.closed, JSON.stringify(r.s));
        check('[S] a change to a gate reopens it, clears the signature and takes the reduction back', r.s.reopened && r.s.takenBack, JSON.stringify(r.s));
        console.log('\n[Q] concerns');
        check('[Q] a Concern answer opens concern C-1, linked to its category', r.q.concern && r.q.linked, JSON.stringify(r.q));
        check('[Q] a concern is mitigated only with what backs it; accepted only with why', r.q.needsBacking && r.q.acceptNeedsWhy, JSON.stringify(r.q));
        console.log('\n[R] raise requirement');
        check('[R] a mitigation raised as a requirement says "shall"; it is generated once, traced to the CMA and concern', r.r.refusedNoShall && r.r.ok && r.r.generated === 1 && /separate networks/.test(r.r.text || '') && r.r.traced, JSON.stringify(r.r));
        console.log('\n[L] live detection');
        check('[L] a live finding on its gates lands in the CMA as a concern that defeats the claim; no second row; the gate is compromised until it is closed', r.l.intoRow && r.l.concern && r.l.noNewRow && r.l.compromises, JSON.stringify(r.l));
        console.log('\n[A] an earlier entry');
        check('[A] Edit on an entry logged before the four steps opens it in them, with its gates and claim', r.a.skipped || (r.a.flow && r.a.gates && r.a.claim && r.a.opened), JSON.stringify(r.a));
        console.log('\n[U] the page');
        check('[U] the four steps line up, each with its number once (in the circle)', r.u.aligned && r.u.oneNumber, JSON.stringify(r.u));
        check('[U] four steps; step 2 lists every Table M1 category; Sign is disabled until Mitigated; the old form is out of the way', r.u.steps === 4 && r.u.cats === r.u.wantCats && r.u.cats > 30 && r.u.signDisabled && r.u.legacyFormHidden, JSON.stringify(r.u));
        check('[U] "+ New CMA" is the one way to make a CMA: no "Log CMA entry" fold-out, and "Check common causes now" sits beside it', r.u.newBtns === 1 && r.u.bars.length === 0 && r.u.logShown === 0 && r.u.checkNow, JSON.stringify({ newBtns: r.u.newBtns, bars: r.u.bars, logShown: r.u.logShown, checkNow: r.u.checkNow }));
        check('[U] "Review in CMA" on a critical gate starts its CMA, and opens the same one again', r.u.review === true && r.u.reviewAgain === true || r.u.review === 'no free critical gate', JSON.stringify(r.u));
        console.log('\n[M] the report');
        check('[M] Table M2 has a row per concern, with its mitigation', r.m.concernRows && r.m.req, JSON.stringify(r.m));
        console.log('\n[N] ANEM');
        check('[N] only open categories with a reason are kept; an unknown id and an answer with a number are left out; nothing written yet', r.n.ok && r.n.count === 2 && r.n.kept === r.n.want && r.n.noneWritten, JSON.stringify(r.n));
        check('[N] Accept writes the answer (a Concern opens its concern); Discard drops it', r.n.accepted && r.n.discarded, JSON.stringify(r.n));
        check('[N] a suggested gate must be a free AND gate in the trees', !r.n.gates.ok && r.n.gates.drafts === 0, JSON.stringify(r.n.gates));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
