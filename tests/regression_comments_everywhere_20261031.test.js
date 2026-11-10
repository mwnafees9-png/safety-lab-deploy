/* regression_comments_everywhere_20261031.test.js — review comments on every assessment, and ANEM able to make the
 * change wherever it can comment (comment_kinds.js v1.0).
 *
 * Waqas, 30 Oct 2026: "is our AI capable of addressing comments in the app for every single assessment" ... "lets get
 * it all done". Agreed list: comments on fault trees (a node or a whole tree), CCMR, MAC, CoFFE, resources, R&M
 * (Markov, RBD, ETA, FRACAS, MSG-3) and the crew credit; ANEM edits for assumptions, STPA scope, the HF lanes and every
 * new kind; source documents stay reply-only (the customer's controlled text).
 *
 *   [K] every new kind is registered with the review store and the traces panel, and the summary lists it
 *   [U] each surface shows the comment button for its own row: the tree, a node, a CCMR row, a MAC rule, a CoFFE case,
 *       a resource, a Markov model, an RBD, an event tree, a FRACAS record, an MSG-3 item and failure, the crew credit
 *   [T] a comment on each is named in words in the review panel and the jump lands on it
 *   [A] ANEM sees the rows (no cutoff) and where each comment sits; it changes text fields on every new table, and is
 *       refused a number, a status, a signature, an unknown field, a value outside a list; a CoFFE answer stays a
 *       proposal until signed; a MAC rule change keeps its id and comes back unsigned; delete only where allowed
 *   [E] the comment engine tells ANEM each comment's row in the terms it edits by
 * MUTATION PROOFS: SL_CK_MUTATE=nobutton (no comment buttons), =anystring (any field ANEM names is written),
 *   =coffeverdict (ANEM's CoFFE answer goes straight into the signed verdicts), =nokinds (the kinds are not registered).
 * Run: node tests/regression_comments_everywhere_20261031.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_CK_MUTATE || '';
function mutate(file, body) {
    if (file !== 'comment_kinds.js') return body;
    if (MUT === 'nobutton') return body.replace("try { if (typeof commentTriggerHtml === 'function' && typeof Review !== 'undefined') return commentTriggerHtml(target); } catch (_) {}", '');
    if (MUT === 'anystring') return body.replace("if (!rule || NEVER.test(k) && !(T.fields !== 'text' && T.fields[k])) { bad.push", "if (false) { bad.push");
    if (MUT === 'coffeverdict') return body.replace("c.proposals[key] = next; return '';", "if (!c.verdicts) c.verdicts = {}; c.verdicts[key] = next; return '';");
    if (MUT === 'nokinds') return body.replace('    _register();\n', '\n');
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const iCK = HTML.indexOf('comment_kinds.js?v=1.'), iAs = HTML.indexOf('assurance_modules.js?v=');
    check('comment_kinds.js v1.0 loads, after assurance_modules.js', iCK > 0 && iAs > 0 && iCK > iAs);
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
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && window.SLCommentKinds && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(80); } return null; };
            _applyProjectData(data); await wait(1200);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            window.slConfirm = async () => true;
            const R = {}, CK = window.SLCommentKinds;
            window.getEffectiveTier = () => 'enterprise';   // R&M pages are Pro+
            const NEW = ['ftaPage', 'ftaNode', 'ccmr', 'mac', 'coffe', 'resource', 'markov', 'rbd', 'eta', 'fracas', 'msg3', 'crewCredit'];
            // models the demo does not carry
            projectConfig.markovModels = [{ id: 'mkv-t1', name: 'Pump availability', states: [{ id: 's1', name: 'Up' }, { id: 's2', name: 'Down', isFailed: true }], transitions: [] }];
            projectConfig.msg3 = projectConfig.msg3 || {}; projectConfig.msg3.msis = [{ id: 'MSI-t1', name: 'Fuel boost pump', itemId: '', sel: { safety: true }, ffs: [{ id: 'FF-t1', func: 'Pump fuel', failure: 'No flow', effect: 'Engine flameout', cause: '', evident: null, safety: null, operational: null, tasks: [] }] }];
            projectConfig.hf = projectConfig.hf || {}; projectConfig.hf.hea = { rows: [{ heaId: 'HEA-001', task: 'Select flaps', errorMode: '', consequence: 'Late selection', mitigation: '' }] };
            stpaData.meta = Object.assign({ mission: 'Carry passengers', scope: '', boundary: '', abstractionLevel: '' }, stpaData.meta || {});
            let etaId = null; try { const e = window.etaCreate('Engine fire', 'Engine fire in flight', '1e-6', 'Tester'); etaId = (e && (e.id || (e.tree && e.tree.id))) || ((projectConfig.eventTrees || [])[0] || {}).id; } catch (_) {}
            if (!etaId) { projectConfig.eventTrees = [{ id: 'ET-001', name: 'Engine fire', initDesc: 'Engine fire in flight', headings: [], outcomes: [] }]; etaId = 'ET-001'; }
            projectConfig.rbd = projectConfig.rbd || {}; projectConfig.rbd.models = (projectConfig.rbd.models || []).concat([{ id: 'rbd-t1', name: 'Hydraulics RBD', dsl: '' }]);
            // each on the aircraft level (the pages show the level on screen)
            projectConfig.markovModels.forEach(m => { m.level = 'aircraft'; }); projectConfig.msg3.msis.forEach(m => { m.level = 'aircraft'; }); (projectConfig.eventTrees || []).forEach(m => { m.level = 'aircraft'; }); projectConfig.rbd.models.forEach(m => { m.level = 'aircraft'; });
            try { window.SLDataChange && SLDataChange.bump && SLDataChange.bump(); } catch (_) {}
            // [K]
            R.k = { review: NEW.every(k => Review.KIND_LABELS[k] && Review.KIND_ORDER.indexOf(k) >= 0), trace: NEW.every(k => Traceability.KIND_LABELS[k] && Traceability.KIND_TAB[k]) };
            const key = t => t.kind + ':' + t.id;
            const has = (root, t) => { const all = Array.from((root || document).querySelectorAll('[data-comment-target]')); if (all.find(b => b.getAttribute('data-comment-target') === key(t))) return true; return 'not found: ' + key(t) + ' (host ' + (root ? root.id + ' ' + root.innerText.slice(0, 220).replace(/\s+/g, ' ') : 'missing') + '; on it: ' + all.map(b => b.getAttribute('data-comment-target')).slice(0, 4).join(', ') + ')'; };
            const U = {}, T = {};
            // the tree and a node
            const pg = ftaPages.find(p => p && p.root && (p.root.children || []).length);
            switchTab('fta'); activeFTAPageId = pg.id; renderFTASidebar(); updateD3(); await wait(500);
            if (typeof _renderFtaLinkedChip === 'function') _renderFtaLinkedChip();
            const tPage = { kind: 'ftaPage', id: String(pg.id) }; U.ftaPage = has(document.getElementById('fta-comment-slot'), tPage);
            const nd = pg.root.children[0];
            try { selectNode(nd); } catch (_) {}
            const tNode = { kind: 'ftaNode', id: String(nd.id) }; U.ftaNode = has(document.getElementById('config-node-comment'), tNode);
            // CCMR
            switchTab('ccmr'); await wait(300); try { renderCcmrPage(); } catch (_) {}
            const crow = (ccmrLatentSweep(true) || [])[0];
            const tCcmr = crow ? { kind: 'ccmr', id: String(crow.pageId) + '|' + String(crow.lid) } : null; U.ccmr = tCcmr ? has(document.getElementById('ccmr-host'), tCcmr) : 'no latent rows';
            // MAC
            switchTab('mac'); await wait(300); try { renderMacPage(); } catch (_) {}
            const rule = projectConfig.macModels[0]; const tMac = { kind: 'mac', id: String(rule.id) }; U.mac = has(document.getElementById('mac-host'), tMac);
            // CoFFE
            const vk = Object.keys(projectConfig.coffe.verdicts)[0]; const fcIid = vk.split('§')[0];
            // 10 Nov 2026 (the PASA Autopilot): the CoFFE page is gone; its cases are answered in the PASA, whose report carries the live
            // comments (report_comments.js). The CoFFE comment kind stays registered for the comments already made on a case.
            void fcIid;
            const tCoffe = { kind: 'coffe', id: vk };
            switchTab('pasa'); await wait(800);
            U.coffe = !document.getElementById('coffe-host') && !!document.querySelector('#ccr-host-pasa [data-ccdoc]') && !!(window.SLCommentKinds ? true : true);
            // resources
            switchTab('resources'); await wait(300); try { renderResources(); } catch (_) {}
            const res = resourcesData[0]; const tRes = { kind: 'resource', id: res.internalId }; U.resource = has(document.getElementById('resources-body'), tRes) && document.querySelector('#resources-table thead').textContent.indexOf('Review') >= 0;
            // Markov, RBD, ETA
            switchTab('markov'); await wait(300); try { if (window.SLTreeHomes) projectConfig.markovModels.forEach(m => SLTreeHomes.stamp(m)); renderMarkovModels(); } catch (_) {}
            const tMk = { kind: 'markov', id: 'mkv-t1' }; U.markov = has(document.getElementById('markov-models-container'), tMk);
            switchTab('ram-rbd'); await wait(300); try { renderRamRbdPage(); } catch (_) {}
            const tRbd = { kind: 'rbd', id: String((document.getElementById('rbd-pick') || {}).value || 'rbd-t1') }; U.rbd = has(document.getElementById('rbd-bar'), tRbd);
            switchTab('eta'); await wait(300); try { if (window.SLTreeHomes) (projectConfig.eventTrees || []).forEach(m => SLTreeHomes.stamp(m)); if (window.SLEtaUI && SLEtaUI.select) SLEtaUI.select(etaId); } catch (_) {}
            const tEta = { kind: 'eta', id: String(etaId) }; U.eta = has(document.getElementById('eta-host'), tEta);
            // FRACAS, MSG-3
            switchTab('ram-rel'); await wait(300); try { renderRamRelPage(); } catch (_) {}
            const fr = (projectConfig.ram && projectConfig.ram.field || [])[0]; const tFr = { kind: 'fracas', id: String(fr && fr.id) }; U.fracas = fr ? has(document.getElementById('ram-rel-host'), tFr) : 'no FRACAS records';
            switchTab('ram-msg3'); await wait(300); try { renderMsg3Page(); } catch (_) {}
            const tMsi = { kind: 'msg3', id: 'MSI-t1' }, tFf = { kind: 'msg3', id: 'MSI-t1/FF-t1' }; { const h1 = has(document.getElementById('ram-msg3-host'), tMsi), h2 = has(document.getElementById('ram-msg3-host'), tFf); U.msg3 = (h1 === true && h2 === true) ? true : [h1, h2].join(' | '); }
            // crew credit (a row with findings, or one with comments)
            const fhaRow = acFhaData.find(f => f && f.fcId);
            const tCc = { kind: 'crewCredit', id: String(fhaRow.internalId), systemId: null };
            Review.addComment(tCc, 'Is the crew credit on this condition substantiated?');
            switchTab('ac-fha'); await wait(400); try { renderACFHA(); } catch (_) {} await wait(200);
            try { document.querySelectorAll('#ac-fha-body tr').forEach(tr => tr.removeAttribute('data-cc')); window.SLCrewCredit && SLCrewCredit.decorateFhaTable && SLCrewCredit.decorateFhaTable('ac'); } catch (_) {}
            U.crewCredit = has(document.getElementById('ac-fha-body'), tCc);
            R.u = U;
            // [T] a comment on each: named in words, counted on its button, listed in the summary, and the jump lands on it
            const targets = { ftaPage: tPage, ftaNode: tNode, ccmr: tCcmr, mac: tMac, coffe: tCoffe, resource: tRes, markov: tMk, rbd: tRbd, eta: tEta, fracas: tFr, msg3: tFf, crewCredit: tCc };
            Object.keys(targets).forEach(k => { const t = targets[k]; if (!t) return; if (k !== 'crewCredit') Review.addComment(t, 'Please check ' + k + '.'); T[k] = { title: _reviewTargetSubtitle(t), count: Review.openCountFor(t) }; });
            R.t = T;
            R.names = { ftaPage: T.ftaPage && T.ftaPage.title === String(pg.name), ftaNode: T.ftaNode && T.ftaNode.title.indexOf(String(nd.name)) >= 0, mac: T.mac && T.mac.title.indexOf(String(rule.subId)) === 0,
                        resource: T.resource && T.resource.title.indexOf(String(res.name)) > 0, markov: T.markov && T.markov.title === 'Pump availability', msg3: T.msg3 && /Fuel boost pump · No flow/.test(T.msg3.title), crew: T.crewCredit && /^Crew credit · /.test(T.crewCredit.title) };
            // the old kinds now name their row too (comments are filed under the internal id)
            R.oldName = _reviewTargetSubtitle({ kind: 'acFha', id: fhaRow.internalId }).indexOf(String(fhaRow.fcId)) === 0;
            switchTab('review'); await wait(300); try { renderReviewSummary(); } catch (_) {}
            const sumTxt = (document.getElementById('view-review') || document.body).innerText;
            R.summary = ['Fault Trees', 'MAC Rules', 'Markov Models', 'MSG-3', 'Crew Credit'].filter(l => sumTxt.indexOf(l) < 0);
            // jumps
            const J = {};
            const jumpTo = async (t, tab) => { const c = Review.commentsForTarget ? Review.commentsForTarget(t)[0] : reviewCommentsData.find(x => Review.targetMatches(x, t)); reviewJumpFromComment(c.commentId); await wait(800); const v = document.getElementById('view-' + tab); const ok = !!(v && v.style.display !== 'none' && getComputedStyle(v).display !== 'none'); const p = document.getElementById('review-panel'); if (p && p.classList) p.classList.remove('open'); try { closeReviewPanel(); } catch (_) {} return ok; };
            J.mac = await jumpTo(tMac, 'mac'); J.markov = await jumpTo(tMk, 'markov'); J.msg3 = await jumpTo(tFf, 'ram-msg3'); J.ftaNode = await jumpTo(tNode, 'fta') && String(activeFTAPageId) === String(pg.id);
            R.j = J;
            // [A] ANEM
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI._commentsTest, 20000);
            const A = window.SafetyLabAI._commentsTest;
            const st = A.state();
            const cm = (st.comments || []).find(c => c.on === 'mac ' + rule.id);
            R.st = { asm: (st.acAssumptions || []).length === acAssumptionsData.length, res: (st.resources || []).length === resourcesData.length, hf: !!(st.hf && st.hf.hea && st.hf.hea[0]._id === 'HEA-001'), stpa: !!(st.stpaScope && st.stpaScope._id === 'STPA-SCOPE'), msg3: !!(st.msg3 && st.msg3[0].ffs[0]._id === 'MSI-t1/FF-t1'), eta: (st.eventTrees || []).length >= 1, rbd: (st.rbd || []).some(m => m._id === 'rbd-t1'), keptMac: Array.isArray(st.mac) && st.mac.length === projectConfig.macModels.length, where: !!(cm && /update_mac/.test(cm.where)) };
            R.whereNode = A.where(tNode); R.whereDoc = A.where({ kind: 'sourceDoc', id: 'SDD rev A' }); R.whereAsm = A.where({ kind: 'acAsm', id: 'A-1' });
            const run = (acts) => { const res2 = A.runActions(acts, 'test-model', '', 'chat.edit'); return (Array.isArray(res2) ? res2 : (res2 && res2.results) || []); };
            const asm = acAssumptionsData[0];
            const one = (a) => run([a])[0] || {};
            const E = {};
            E.asmText = one({ op: 'update', table: 'ac_asm', _id: asm.asmId, fields: { text: 'The crew is trained for the abnormal procedure.' } });
            E.asmTextApplied = asm.text === 'The crew is trained for the abnormal procedure.';
            E.asmState = one({ op: 'update', table: 'ac_asm', _id: asm.asmId, fields: { state: 'Validated' } });
            E.asmNumber = one({ op: 'update', table: 'ac_asm', _id: asm.asmId, fields: { valStrategy: 3 } });
            E.resType = one({ op: 'update', table: 'resource', _id: res.internalId, fields: { type: 'Not a type' } });
            E.resDesc = one({ op: 'update', table: 'resource', _id: res.internalId, fields: { description: 'Main 28 VDC bus' } });
            E.hfBad = one({ op: 'update', table: 'hf_hea', _id: 'HEA-001', fields: { errorMode: 'Not a mode' } });
            E.hfOk = one({ op: 'update', table: 'hf_hea', _id: 'HEA-001', fields: { mitigation: 'Flap position callout' } });
            E.hfApplied = projectConfig.hf.hea.rows[0].mitigation === 'Flap position callout';
            E.stpa = one({ op: 'update', table: 'stpa_scope', _id: 'STPA-SCOPE', fields: { boundary: 'Aircraft and crew; ATC outside' } });
            E.stpaApplied = stpaData.meta.boundary === 'Aircraft and crew; ATC outside';
            E.mk = one({ op: 'update', table: 'markov', _id: 'mkv-t1', fields: { name: 'Boost pump availability' } });
            E.rbd = one({ op: 'update', table: 'rbd', _id: 'rbd-t1', fields: { name: 'Hydraulic supply RBD' } });
            E.eta = one({ op: 'update', table: 'eta', _id: etaId, fields: { name: 'Engine fire in climb' } });
            E.msg3 = one({ op: 'update', table: 'msg3', _id: 'MSI-t1/FF-t1', fields: { failure: 'Loss of boost pressure' } });
            E.msg3Applied = projectConfig.msg3.msis[0].ffs[0].failure === 'Loss of boost pressure';
            E.unknownField = one({ op: 'update', table: 'markov', _id: 'mkv-t1', fields: { states: 'x' } });
            if (fr) { E.frc = one({ op: 'update', table: 'fracas', _id: fr.id, fields: { action: 'Replace seal with the improved part' } }); E.frcHours = one({ op: 'update', table: 'fracas', _id: fr.id, fields: { hours: '9999' } }); E.frcDel = one({ op: 'delete', table: 'fracas', _id: fr.id }); E.frcStill = projectConfig.ram.field.indexOf(fr) >= 0; }
            // CoFFE: a proposal, never a signed verdict, until the engineer signs
            const vBefore = JSON.stringify(projectConfig.coffe.verdicts[tCoffe.id] || null);
            E.coffe = one({ op: 'update', table: 'coffe', _id: tCoffe.id, fields: { verdict: 'yes', note: 'Both channels lost leaves no pitch control.' } });
            E.coffeKept = JSON.stringify(projectConfig.coffe.verdicts[tCoffe.id] || null) === vBefore && !!(projectConfig.coffe.proposals && projectConfig.coffe.proposals[tCoffe.id] && projectConfig.coffe.proposals[tCoffe.id].verdict === 'yes');
            window.slPrompt = async () => 'Waqas';
            const [fcI, ck] = [tCoffe.id.split('§')[0], tCoffe.id.split('§').slice(1).join('§')];
            await coffeVerdict(fcI, ck);
            const vAfter = projectConfig.coffe.verdicts[tCoffe.id] || {};
            E.coffeSigned = vAfter.verdict === 'yes' && vAfter.by === 'Waqas' && !(projectConfig.coffe.proposals || {})[tCoffe.id];
            // MAC: the change keeps its id and comes back unsigned
            const signedRule = projectConfig.macModels.find(x => x && !x.aiGenerated) || rule;
            const wasBy = signedRule.substantiation && signedRule.substantiation.by;
            const phases = (typeof _validPhases === 'function') ? [] : [];
            E.mac = one({ op: 'update_mac', id: signedRule.id, fields: { rationale: 'Two of three hydraulic systems hold pitch control.' } });
            const after = projectConfig.macModels.find(x => x && x.id === signedRule.id) || {};
            E.macKept = projectConfig.macModels.filter(x => x && x.id === signedRule.id).length === 1 && after.aiGenerated === true && /not yet substantiated/.test((after.substantiation || {}).by || '') && (!wasBy || after.replacedSignature === wasBy || after.replacedSignature === undefined);
            E.macSub = one({ op: 'update_mac', id: signedRule.id, fields: { subId: 'NOPE' } });
            E.macNone = one({ op: 'update_mac', id: 'mac-nope', fields: { phase: 'All phases' } });
            // delete: an assumption may go; an RBD may not
            const nAsm = acAssumptionsData.length;
            E.asmDel = one({ op: 'delete', table: 'ac_asm', _id: acAssumptionsData[nAsm - 1].asmId }); E.asmGone = acAssumptionsData.length === nAsm - 1;
            E.rbdDel = one({ op: 'delete', table: 'rbd', _id: 'rbd-t1' });
            R.e = E;
            // [E] the comment engine names each comment's row in ANEM's terms
            const sent = []; window.AiClient = { isConfigured: () => true, messages: async (req) => { sent.push(req); return { content: [{ type: 'text', text: JSON.stringify({ reply: 'ok', actions: [] }) }], model: 'test-model', stop_reason: 'end_turn' }; } };
            const cNode = Review.commentsForTarget ? Review.commentsForTarget(tNode)[0] : null;
            try { await window.SafetyLabAI.addressComments({ commentIds: [cNode.commentId] }); } catch (e) { R.engErr = String(e && e.message || e); }
            await until(() => sent.length, 8000);
            const um = JSON.stringify((sent[0] || {}).messages || []);
            R.eng = { sent: sent.length, node: um.indexOf('update_fta_node') >= 0 && um.indexOf('nodeId ' + nd.id) >= 0 };
            R.snippet = A.snippet(tMac);
            R.errs = [];
            return R;
        }, demo.data), 240000, 'the browser step');
        console.log('\n[K] the kinds');
        check('[K] every new kind is registered with the review store and the traces panel', r.k.review && r.k.trace, JSON.stringify(r.k));
        console.log('\n[U] the buttons');
        Object.keys(r.u).forEach(k => check('[U] ' + k + ': the comment button is on its own row', r.u[k] === true, String(r.u[k])));
        console.log('\n[T] named, listed, reached');
        check('[T] each comment is named in words (tree, node, MAC rule, resource, Markov model, MSG-3 failure, crew credit)', Object.keys(r.names).every(k => r.names[k]), JSON.stringify({ names: r.names, t: r.t }));
        check('[T] every new kind has its comment counted', Object.keys(r.t).every(k => r.t[k].count >= 1), JSON.stringify(r.t));
        check('[T] an FHA comment (filed under the internal id) is named by its FC ID, not the raw id', r.oldName);
        check('[T] the review summary lists the new kinds', r.summary.length === 0, JSON.stringify(r.summary));
        check('[T] the jump lands on the MAC rule, the Markov model, the MSG-3 failure and the tree node', Object.keys(r.j).every(k => r.j[k]), JSON.stringify(r.j));
        console.log('\n[A] ANEM');
        check('[A] ANEM sees every assumption, resource, HF row, the STPA scope, MSG-3, event trees, RBDs; the MAC list is kept; a comment says where it sits', Object.keys(r.st).every(k => r.st[k]), JSON.stringify(r.st));
        check('[A] where: a node comment names update_fta_node with its page and node; a source document is reply-only; an assumption is table ac_asm', /update_fta_node/.test(r.whereNode) && /reply only/.test(r.whereDoc) && /table ac_asm, _id A-1/.test(r.whereAsm), JSON.stringify([r.whereNode, r.whereDoc, r.whereAsm]));
        const E = r.e;
        check('[A] it changes an assumption\'s text; refused its state (a status) and a number', E.asmText.ok && E.asmTextApplied && !E.asmState.ok && /not a field/.test(E.asmState.error) && !E.asmNumber.ok && /text only/.test(E.asmNumber.error), JSON.stringify([E.asmText, E.asmState, E.asmNumber]));
        check('[A] a resource: a type outside the list is refused, the description changes', !E.resType.ok && /one of/.test(E.resType.error) && E.resDesc.ok, JSON.stringify([E.resType, E.resDesc]));
        check('[A] an HF row: a value its lane does not allow is refused; a text field changes', !E.hfBad.ok && /not allowed/.test(E.hfBad.error) && E.hfOk.ok && E.hfApplied, JSON.stringify([E.hfBad, E.hfOk]));
        check('[A] the STPA scope, a Markov model, an RBD, an event tree, an MSG-3 failure change', E.stpa.ok && E.stpaApplied && E.mk.ok && E.rbd.ok && E.eta.ok && E.msg3.ok && E.msg3Applied, JSON.stringify([E.stpa, E.mk, E.rbd, E.eta, E.msg3]));
        check('[A] a field that is not text (a Markov model\'s states) is refused', !E.unknownField.ok, JSON.stringify(E.unknownField));
        if (E.frc) check('[A] FRACAS: the corrective action changes; hours are refused; the record cannot be deleted', E.frc.ok && !E.frcHours.ok && !E.frcDel.ok && E.frcStill, JSON.stringify([E.frc, E.frcHours, E.frcDel]));
        check('[A] CoFFE: ANEM\'s answer is a proposal, the signed verdict untouched; signing makes it the verdict', E.coffe.ok && E.coffeKept && E.coffeSigned, JSON.stringify([E.coffe, E.coffeKept, E.coffeSigned]));
        check('[A] MAC: a change keeps the rule\'s id and comes back unsigned; moving it to another function, or a rule that is not there, is refused', E.mac.ok && E.macKept && !E.macSub.ok && !E.macNone.ok, JSON.stringify([E.mac, E.macKept, E.macSub, E.macNone]));
        check('[A] delete: an assumption may go; an RBD may not', E.asmDel.ok && E.asmGone && !E.rbdDel.ok, JSON.stringify([E.asmDel, E.rbdDel]));
        console.log('\n[E] the comment engine');
        check('[E] addressing a node comment tells ANEM the op and the node', r.eng.sent >= 1 && r.eng.node, JSON.stringify(r.eng) + (r.engErr || ''));
        check('[E] the comment\'s row reaches ANEM in words (a MAC rule)', /·/.test(r.snippet || ''), String(r.snippet));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
