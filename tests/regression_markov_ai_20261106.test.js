/* regression_markov_ai_20261106.test.js: the AI drafts a Markov model whose every rate comes from the project
 * (markov_ai.js v1.0, ai_assistant.js v77.04 launcher action and gate, lane_ai_bar.js 'markov').
 *
 * Waqas, 6 Nov 2026: "I want safety lab AI generated for every 4761 artifact". The Markov page had no AI.
 * In the app (Aeolus HL-1 demo, the AI stubbed):
 *   - the rate sources of a system are its fault-tree basic events with λ (and μ when repaired continuously) and its
 *     FMEA rows with λ, including the systems under it;
 *   - what the AI is sent: the system, its failure conditions, items and the rate sources, with no rate values;
 *   - a transition's rate is the SUM of the sources it names (three hydraulic systems: 3 × 3.6e-5); a ref that is not
 *     a source is dropped and flagged; a repair with no recorded μ is kept at 0 and flagged; a self loop and a state
 *     that is not in the model are dropped and flagged; a rate written in the description is flagged;
 *   - the review panel opens, Accept adds the model (with its provenance) to the Markov models and the solver solves it;
 *   - the launcher offers "Draft a Markov model", its gate is open on HL-1, and the Markov page carries its button.
 * MUTATION PROOFS: SL_MKAI_MUTATE=nosum (only the first source counts), =anyref (a ref that is not a source is
 *   accepted with no rate), =nonum (rates in the description pass) must fail.
 * Run: node tests/regression_markov_ai_20261106.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1400) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_MKAI_MUTATE || '';
function mutate(file, body) {
    if (file !== 'markov_ai.js') return body;
    if (MUT === 'nosum') return body.replace('refs.push(x.ref); rate += v;', 'refs.push(x.ref); rate = rate || v;');
    if (MUT === 'anyref') return body.replace("if (!x) { missing.push(S(r)); return; }", "if (!x) { refs.push(S(r)); return; }");
    if (MUT === 'nonum') return body.replace('if (NUM_RE.test(narrative))', 'if (false)');
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);

(async () => {
    console.log('regression_markov_ai_20261106' + (MUT ? ' [mutation ' + MUT + ']' : ''));
    const SRC = fs.readFileSync(path.join(SITE, 'markov_ai.js'), 'utf8');
    const A = require(path.join(SITE, 'markov_ai.js'));
    check('the skill is markov.draft v1 and its prompt forbids numbers and names sources by ref', A.SKILL === 'markov.draft' && A.SKILL_VERSION === 1 && /you write NO numbers/.test(A.SYSTEM) && /only those: the items still working there/.test(A.SYSTEM) && /rate_from/.test(A.SYSTEM) && /Never invent a ref/.test(A.SYSTEM));
    check('no eval of any kind (the CSP forbids unsafe-eval): the stores are read through SLEnv', !/new Function|\beval\(/.test(SRC) && /SLEnv/.test(SRC));
    check('the reply parser reads JSON with or without a fence, and refuses prose', A.parse('```json\n{"a":1}\n```').a === 1 && A.parse('Here: {"a":2} done').a === 2 && A.parse('no json here') === null);
    const stray = A.parse('{"name": "x", "transitions": [{"from": "a", "why": "w"}], "narrative": "n."}, "assumptions": ["one"]}');
    check('a stray brace closing the reply before a top-level key is repaired (seen live on the propulsion system)', stray && stray.name === 'x' && stray.assumptions && stray.assumptions[0] === 'one', JSON.stringify(stray));
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('markov_ai.js loads, and the pins moved (lane bar 1.7, ai_loader 8.90 with ai_assistant 77.04)', /<script src="markov_ai\.js\?v=1\.0" defer><\/script>/.test(HTML) && /lane_ai_bar\.js\?v=1\.7/.test(HTML) && /ai_loader\.js\?v=8\.9\d/.test(HTML) && /ai_assistant\.js\?v=77\.0[4-9]/.test(fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8')));
    check('the lane bar puts the action on the Markov page', /'Draft a Markov model':\s*'markov'/.test(fs.readFileSync(path.join(SITE, 'lane_ai_bar.js'), 'utf8')));

    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:hl1');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } const ext = path.extname(f); let body = fs.readFileSync(f); if (ext === '.js') body = Buffer.from(mutate(path.basename(f), body.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext] || 'application/octet-stream' }, ext === '.html' ? { 'Content-Security-Policy': "script-src 'self' 'unsafe-inline'" } : {})); r.end(body); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(60); } return null; };
            _applyProjectData(data); await wait(1500);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            const out = {};
            const M = await until(() => window.SLMarkovAI, 20000);
            out.loaded = !!M;
            const src = M.sources('sys-hyd');
            out.src = src.map(x => x.ref + ':' + x.lambda);
            const ctx = M.context('sys-hyd');
            out.ctx = { fcs: ctx.failure_conditions.length, items: ctx.items.length, src: ctx.rate_sources.length, noRates: !/3\.6e-5|0\.000036/.test(JSON.stringify(ctx)), sys: ctx.system.name };
            const refs = src.slice(0, 3).map(x => x.ref);
            const reply = {
                name: 'Hydraulic power, three independent systems', supports: 'FC-HYD01',
                states: [{ name: 'Three systems working', type: 'operational', meaning: 'A, B and C pressurized' }, { name: 'Two systems working', type: 'degraded', meaning: 'one system lost' }, { name: 'One system working', type: 'degraded', meaning: 'two systems lost' }, { name: 'No hydraulic power', type: 'failed', meaning: 'all three lost' }],
                start: 'Three systems working',
                transitions: [
                    { from: 'Three systems working', to: 'Two systems working', kind: 'failure', rate_from: refs, why: 'any of the three' },
                    { from: 'Two systems working', to: 'One system working', kind: 'failure', rate_from: refs.slice(0, 2).concat(['BE-99999']), why: 'either remaining' },
                    { from: 'One system working', to: 'No hydraulic power', kind: 'failure', rate_from: refs.slice(0, 1), why: 'the last one' },
                    { from: 'Two systems working', to: 'Three systems working', kind: 'repair', rate_from: [], why: 'restored between flights; no repair rate is recorded' },
                    { from: 'No hydraulic power', to: 'No hydraulic power', kind: 'failure', rate_from: refs },
                    { from: 'Nowhere', to: 'No hydraulic power', kind: 'failure', rate_from: refs }
                ],
                narrative: 'The model follows the three independent hydraulic systems as they are lost one after another, each at 3.6e-5 per hour.', assumptions: ['The three systems fail independently.']
            };
            const b = M.build(reply, 'sys-hyd', { model: 'stub' });
            const tr = b.model.transitions;
            out.b = { n: tr.length, r1: tr[0].rate, refs1: tr[0].rateFrom.length, r2: tr[1].rate, refs2: tr[1].rateFrom, r3: tr[2].rate, rep: tr[3] && tr[3].rate, repKind: tr[3] && tr[3].kind, issues: b.issues, states: b.model.states.map(s => s.name + (s.isFailed ? '!' : '') + (s.degraded ? '~' : '')), ai: b.model.aiGenerated && b.model.aiSkill, lam: src[0].lambda };
            // the same sources leaving two states of one chain (an item already lost still counted) is flagged
            const same = M.build({ name: 'x', states: reply.states, start: reply.start, transitions: [{ from: 'Three systems working', to: 'Two systems working', kind: 'failure', rate_from: refs }, { from: 'Two systems working', to: 'One system working', kind: 'failure', rate_from: refs }, { from: 'One system working', to: 'No hydraulic power', kind: 'failure', rate_from: refs.slice(0, 1) }] }, 'sys-hyd');
            out.same = same.issues;
            // the whole path with the AI stubbed: draft, panel, accept, solve
            const calls = [];
            window.SafetyLabAI = Object.assign(window.SafetyLabAI || {}, { complete: async (req) => { calls.push(req); return { text: JSON.stringify(Object.assign({}, reply, { narrative: 'The model follows the three hydraulic systems as they are lost one after another.' })), model: 'stub' }; } });
            const before = (projectConfig.markovModels || []).length;
            const d = await M.open({ systemId: 'sys-hyd' });
            out.call = calls[0] ? { feature: calls[0].feature, sysHasRule: /NO numbers/.test(calls[0].system), userNoRates: !/3\.6e-5|0\.000036/.test(calls[0].messages[0].content), hasRefs: refs.every(x => calls[0].messages[0].content.indexOf(x) >= 0) } : null;
            const panel = document.getElementById('mkai-panel');
            out.panel = panel ? { text: panel.textContent.slice(0, 4000), q: (panel.textContent.match(/no recorded rate/g) || []).length } : null;
            if (panel) panel.querySelector('[data-mkai="accept"]').click();
            await wait(300);
            const after = projectConfig.markovModels || [];
            const added = after[after.length - 1];
            out.accept = { grew: after.length === before + 1, ai: added && added.aiGenerated, feat: added && added.aiFeature, sys: added && added.forSystemId, panelGone: !document.getElementById('mkai-panel') };
            // the engineer gives the missing repair rate; the solver then solves it
            if (added) { added.transitions.forEach(t => { if (!t.rate) t.rate = 1e-2; }); const s = (typeof solveMarkovModel === 'function') ? solveMarkovModel(added) : null; out.solve = s ? { ok: s.ok, pf: s.pFailed } : null; }
            // the launcher, the gate and the Markov page button
            await until(() => window.SafetyLabAI && window.SafetyLabAI.launcherActions && window.SafetyLabAI.launcherActions().length, 20000);
            const acts = window.SafetyLabAI.launcherActions ? window.SafetyLabAI.launcherActions() : [];
            out.launcher = acts.some(a => a.label === 'Draft a Markov model');
            out.gate = window.SafetyLabAI.inputReady ? window.SafetyLabAI.inputReady('markov') : null;
            try { switchTab('markov'); } catch (_) {}
            await until(() => document.querySelector('#view-markov .slab-ai-btn[data-lane-ai="Draft a Markov model"]'), 8000);
            const btn = document.querySelector('#view-markov .slab-ai-btn[data-lane-ai="Draft a Markov model"]');
            out.btn = btn ? { disabled: btn.disabled, text: btn.textContent } : null;
            return out;
        }, demo.data), 240000, 'the Markov draft');
        check('the module loads in the app', r.loaded);
        check('the hydraulic system\'s rate sources are its basic events and its FMEA rows with λ', r.src.filter(x => /^BE-\d+:/.test(x)).length >= 3 && r.src.some(x => /^FM-/.test(x)), JSON.stringify(r.src));
        check('the AI is sent the system, its failure conditions, items (of systems A, B and C too) and sources, but no rate value', r.ctx.fcs > 3 && r.ctx.items > 0 && r.ctx.src >= 3 && r.ctx.noRates, JSON.stringify(r.ctx));
        const lam = r.b.lam;
        check('a transition\'s rate is the sum of the sources it names (3 × λ)', Math.abs(r.b.r1 - 3 * lam) < 1e-12 && r.b.refs1 === 3, JSON.stringify(r.b));
        check('a ref that is not a source is dropped from the sum and flagged', Math.abs(r.b.r2 - 2 * lam) < 1e-12 && r.b.refs2.length === 2 && r.b.issues.some(x => /BE-99999 is not a rate source/.test(x)), JSON.stringify(r.b));
        check('a repair with no recorded μ is kept at 0 and flagged for the engineer', r.b.rep === 0 && r.b.repKind === 'repair' && r.b.issues.some(x => /has no recorded rate: the engineer gives it/.test(x)), JSON.stringify(r.b.issues));
        check('a self loop and a state not in the model are left out and flagged', r.b.n === 4 && r.b.issues.some(x => /into itself was left out/.test(x)) && r.b.issues.some(x => /"Nowhere".*not in the model/.test(x)), JSON.stringify(r.b.issues));
        check('the same sources leaving two different states are flagged (fewer items working, fewer can fail)', r.same.some(x => /leave 2 different states/.test(x)), JSON.stringify(r.same));
        check('a rate written in the description is flagged', r.b.issues.some(x => /wrote a rate in its description/.test(x)), JSON.stringify(r.b.issues));
        check('the states keep their types (degraded, failed) and the draft carries its provenance', JSON.stringify(r.b.states) === JSON.stringify(['Three systems working', 'Two systems working~', 'One system working~', 'No hydraulic power!']) && r.b.ai === 'markov.draft v1', JSON.stringify(r.b));
        check('the AI call is markov.draft with the no-numbers rule, the refs and no rate values', r.call && r.call.feature === 'markov.draft' && r.call.sysHasRule && r.call.userNoRates && r.call.hasRefs, JSON.stringify(r.call));
        check('the review panel shows each rate\'s source and what is left for the engineer', r.panel && /Where the rate comes from/.test(r.panel.text) && /no recorded rate/.test(r.panel.text) && /For the engineer/.test(r.panel.text) && /Nothing is added until you Accept/.test(r.panel.text), r.panel && r.panel.text.slice(0, 600));
        check('Accept adds the model with its provenance and closes the panel', r.accept.grew && r.accept.ai && r.accept.feat === 'markov.draft' && r.accept.sys === 'sys-hyd' && r.accept.panelGone, JSON.stringify(r.accept));
        check('once the engineer gives the missing rate, the solver solves the drafted model', r.solve && r.solve.ok && r.solve.pf > 0, JSON.stringify(r.solve));
        check('the launcher offers Draft a Markov model and its gate is open on HL-1', r.launcher && r.gate && r.gate.ready, JSON.stringify({ l: r.launcher, g: r.gate }));
        check('the Markov page carries the button, enabled', r.btn && !r.btn.disabled, JSON.stringify(r.btn));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } catch (e) { check('the app part ran', false, e.message); }
    finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
