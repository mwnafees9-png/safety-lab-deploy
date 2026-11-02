/* regression_iface_reqs_20261031.test.js — requirements on interfacing systems (iface_reqs.js v1.0, Radia item 10).
 *
 * Agreed 31 Oct 2026: the need is found in the trees (an event in a system's allocation tree that another system
 * provides) and its budget is the tree's number; the interfaces stay owned by Sys Lab and a need with no declared
 * interface is flagged and cannot be accepted; Draft -> Accepted -> Sent (it lands in the providing system's
 * requirements, marked proposed) -> Agreed or Rejected by the owner with the reason; a budget that changes after
 * sending says "send again" and the old wording cannot be sent; ANEM words the sentence only, and a wording that
 * drops or changes the number is not kept. Reading the panel never writes to the project.
 * MUTATION PROOFS: SL_IFR_MUTATE=nobudget (ANEM wording kept without the tree's number), =noiface (accepted with no
 *   interface), =readwrite (reading writes records into the project), =nostale (a changed budget not flagged).
 * Run: node tests/regression_iface_reqs_20261031.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 1200) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_IFR_MUTATE || '';
function mutate(file, body) {
    if (file !== 'iface_reqs.js') return body;
    if (MUT === 'nobudget') return body.replace("if (!textHasBudget(t, h.need.budget)) return { ok: false, why: 'the budget ' + fmtRate(h.need.budget) + ' is not in it exactly' };", '').replace("if (others.length) return", "if (false) return");
    if (MUT === 'noiface') return body.replace("if (!h.need.iface) return { ok: false, why: 'no interface is declared between ' +", "if (false) return { ok: false, why: 'no interface is declared between ' +");
    if (MUT === 'readwrite') return body.replace("if (!rec) rec = _fresh[nd.key] = {", "if (!rec) { rec = {").replace("consumer: nd.consumer, provider: nd.provider };\n        return rec;\n    }\n    function _keep", "consumer: nd.consumer, provider: nd.provider }; store().push(rec); }\n        return rec;\n    }\n    function _keep");
    if (MUT === 'nostale') return body.replace("r.sentBudget != null && Math.abs(", "r.sentBudget != null && false && Math.abs(");
    return body;
}
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('iface_reqs.js v1.0 loads right after rate_sources.js, and its host sits above the system requirements form',
        /rate_sources\.js\?v=1\.\d+" defer><\/script>\s*<!--[^>]*-->\s*<script src="iface_reqs\.js\?v=1\.0"/.test(HTML) && HTML.indexOf('id="iface-req-host"') > 0 && HTML.indexOf('id="iface-req-host"') < HTML.indexOf('id="sys-req-form"'));
    const SK = fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8'), AA = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
    check('iface.word is registered (skill, version, feature map) and the AI module exports ifaceWording',
        /'iface\.word': "STANDARD GROUNDING/.test(SK) && /'iface\.word': 1,/.test(SK) && /"iface\.word": "iface\.word"/.test(SK) && /ifaceWording: ifaceWording/.test(AA) && /'iface\.word': _SPEC_IFACE_WORD/.test(AA));
    if (!pw) { console.log('  note  Playwright is not installed: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:kestrel');
    const CSP = (() => { const w = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; window.SL_FC_TREES_OFF = true; window.SL_FC_LINK_OFF = true; window.slPrompt = (m, d) => Promise.resolve(window.__answer != null ? window.__answer : d); });
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        const r = await within(page.evaluate(async (data) => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(60); } return null; };
            _applyProjectData(data); await wait(1500);
            const g0 = document.getElementById('sl-auth-gate'); if (g0) g0.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            ['welcome-modal', 'signup-modal'].forEach(id => { const o = document.getElementById(id); if (o) o.classList.remove('show'); });
            const R = {}, I = window.SLIfaceReqs;
            const host = () => document.getElementById('iface-req-host');
            const fcsPage = ftaPages.find(p => p.treeLevel === 'system' && p.systemId === 'sys-fcs' && !p.verifies);
            const leaves = []; (function w(n) { if (!n) return; if (n.type !== 'gate') leaves.push(n); (n.children || []).forEach(w); })(fcsPage.root);
            const hyd = systemsData.find(s => s.id === 'sys-hyd'), eps = systemsData.find(s => s.id === 'sys-eps');
            const ev = leaves[0], ev2 = leaves[1];
            delete ev.realizedByItemId; ev.externalSource = { kind: 'fha', targetId: 'SYS_' + hyd.fha[0].internalId }; ev.probability = 2.4e-8;
            const epsItem = itemsData.find(i => i.owningSystemId === 'sys-eps') || (itemsData.push({ internalId: 99001, itemId: 'LRU-EPS-T', name: 'Test bus', owningSystemId: 'sys-eps' }), itemsData[itemsData.length - 1]);
            delete ev2.externalSource; ev2.realizedByItemId = epsItem.internalId; ev2.probability = 6.0e-9;
            projectConfig.interfaces = (projectConfig.interfaces || []).filter(i => !((i.fromSystemId === 'sys-hyd' || i.toSystemId === 'sys-hyd') && (i.fromSystemId === 'sys-fcs' || i.toSystemId === 'sys-fcs')));
            if (!projectConfig.interfaces.some(i => [i.fromSystemId, i.toSystemId].sort().join() === 'sys-eps,sys-fcs')) projectConfig.interfaces.push({ fromSystemId: 'sys-eps', toSystemId: 'sys-fcs', kind: 'interface', medium: '28 VDC', icdRef: 'ICD-EPS-FCS-002' });
            delete projectConfig.ifaceReqs;
            // [N] the needs come from the trees
            const ns = I.needs(), k1 = fcsPage.id + ':' + ev.id, k2 = fcsPage.id + ':' + ev2.id;
            const n1 = ns.find(x => x.key === k1), n2 = ns.find(x => x.key === k2);
            R.n = { n1: !!n1 && n1.provider === 'sys-hyd' && n1.consumer === 'sys-fcs' && n1.budget > 0 && !n1.iface, n2: !!n2 && n2.provider === 'sys-eps' && !!n2.iface && /realized by/.test(n2.via),
                    b1: n1 && I.fmtRate(n1.budget), dflt: n1 && I.defaultText(n1) };
            activeSystemId = 'sys-fcs'; I.render();
            const h1 = host();
            R.n.flag = !!h1 && /Requirements on interfacing systems/.test(h1.innerText) && /No interface declared/.test(h1.innerText) && h1.querySelectorAll('tr[data-ifr]').length >= 2;
            R.n.noWrite = !(projectConfig.ifaceReqs || []).length;
            // [S] accept, send, the owner decides
            const a0 = I.accept(k1, 'Tester');
            projectConfig.interfaces.push({ fromSystemId: 'sys-hyd', toSystemId: 'sys-fcs', kind: 'interface', medium: '3000 psi', icdRef: 'ICD-HYD-FCS-009' });
            const noShall = I.setText(k1, 'Hydraulics must not lose pressure more than ' + R.n.b1 + ' per flight hour.');
            const noNum = I.setText(k1, 'Hydraulics shall not lose pressure for flight controls more often than 1.0E-9 per flight hour.');
            const a1 = I.accept(k1, 'Tester');
            const rec1 = () => (projectConfig.ifaceReqs || []).find(x => x.key === k1);
            R.s = { refusedNoIface: !a0.ok && /no interface/.test(a0.why), noShall: !noShall.ok, noNum: !noNum.ok && /exactly/.test(noNum.why), accepted: a1.ok && rec1() && rec1().status === 'Accepted' && rec1().ifaceId === 'ICD-HYD-FCS-009' };
            const s1 = I.send(k1);
            const prow = () => (hyd.req || []).find(x => x.ifaceReqKey === k1);
            R.s.sent = s1.ok && rec1().status === 'Sent' && !!prow() && prow().ownerStatus === 'Proposed' && prow().text.indexOf(R.n.b1) >= 0 && /Needed by/.test(prow().rationale);
            activeSystemId = 'sys-hyd'; I.render();
            R.s.ownerSees = /What other systems need from this one/.test(host().innerText) && !!host().querySelector('tr[data-ifr-in="' + k1 + '"]');
            const rj0 = I.ownerDecide(k1, false, '  ', 'Owner');
            I.ownerDecide(k1, false, 'Pump redundancy cannot meet this at the current architecture.', 'Owner');
            R.s.reject = !rj0.ok && rec1().status === 'Rejected' && /^Rejected: Pump/.test(prow().ownerStatus);
            activeSystemId = 'sys-fcs'; I.render();
            R.s.consumerSeesWhy = /Rejected by the owner: Pump redundancy/.test(host().innerText);
            I.send(k1); const ag = I.ownerDecide(k1, true, '', 'Owner');
            R.s.agreed = ag.ok && rec1().status === 'Agreed' && prow().ownerStatus === 'Agreed';
            // [B] the budget changes after sending
            ev.probability = 4.8e-8;
            const h = I.find(k1), st = I.statusOf(h), sOld = I.send(k1);
            I.render();
            R.b = { st, oldRefused: !sOld.ok && /reword/.test(sOld.why), button: /Reword with/.test(host().innerText) };
            const t2 = I.defaultText(h.need); I.setText(k1, t2); I.accept(k1, 'Tester'); const sNew = I.send(k1);
            R.b.resent = sNew.ok && rec1().status === 'Sent' && rec1().sentBudget === h.need.budget && I.statusOf(I.find(k1)) === 'Sent' && prow().text === t2;
            // [A] ANEM words the sentence only
            await window.slLoadAI(); await until(() => window.SafetyLabAI && window.SafetyLabAI.ifaceWording, 20000);
            const b2 = I.fmtRate(I.find(k2).need.budget), before = JSON.stringify(projectConfig.ifaceReqs);
            let sentFacts = '';
            window.AiClient = { isConfigured: () => true, messages: async (o) => { sentFacts = JSON.stringify(o.messages || o); return { content: [{ type: 'text', text: JSON.stringify({ wordings: [
                { key: k2, text: 'The electrical power system shall not interrupt the 28 VDC supply to the flight control computer more often than ' + b2 + ' per flight hour.' },
                { key: k2 + 'x', text: 'not asked shall 1.0E-5' } ] }) }], model: 'test-model', stop_reason: 'end_turn' }; } };
            const w1 = await SafetyLabAI.ifaceWording([k2]);
            R.a = { kept: w1.ok && I.drafts[k2] && I.drafts[k2].indexOf(b2) >= 0, budgetSent: sentFacts.indexOf(b2) >= 0, notSaved: JSON.stringify(projectConfig.ifaceReqs) === before };
            I.render(); R.a.shown = /ANEM draft/.test(host().innerText);
            I.ui.acceptDraft(k2);
            const rec2 = (projectConfig.ifaceReqs || []).find(x => x.key === k2);
            R.a.accepted = !!rec2 && rec2.status === 'Accepted' && rec2.text.indexOf(b2) >= 0 && !I.drafts[k2];
            // a wording with the number changed is not kept
            const ev3 = leaves[2]; delete ev3.externalSource; ev3.realizedByItemId = epsItem.internalId; ev3.probability = 3.3e-9;
            const k3 = fcsPage.id + ':' + ev3.id, b3 = I.fmtRate(I.find(k3).need.budget);
            window.AiClient = { isConfigured: () => true, messages: async () => ({ content: [{ type: 'text', text: JSON.stringify({ wordings: [
                { key: k3, text: 'The electrical power system shall not interrupt the supply more often than 1.0E-9 per flight hour.' } ] }) }], model: 'test-model', stop_reason: 'end_turn' }) };
            const w3 = await SafetyLabAI.ifaceWording([k3]);
            R.a.changedDropped = !w3.ok && !I.drafts[k3] && /not kept/.test(w3.why);
            window.AiClient = { isConfigured: () => true, messages: async () => ({ content: [{ type: 'text', text: JSON.stringify({ wordings: [
                { key: k3, text: 'The electrical power system shall not interrupt the supply more often than ' + b3 + ' per flight hour, and its bus shall carry 2.0E-3 margin.' } ] }) }], model: 'test-model', stop_reason: 'end_turn' }) };
            const w4 = await SafetyLabAI.ifaceWording([k3]);
            R.a.extraDropped = !w4.ok && !I.drafts[k3];
            R.a.b3 = b3;
            return R;
        }, demo.data), 200000, 'the browser step');
        console.log('\n[N] the needs come from the trees');
        check('[N] an event fed from another system\'s failure condition and one realized by another system\'s item are both needs, each with the tree\'s budget', r.n.n1 && r.n.n2, JSON.stringify(r.n));
        check('[N] the panel lists them and flags the one with no declared interface', r.n.flag, JSON.stringify(r.n));
        check('[N] reading the panel writes nothing into the project', r.n.noWrite, JSON.stringify(r.n));
        console.log('\n[S] accept, send, the owner decides');
        check('[S] no interface, no accept; a wording without "shall" or without the tree\'s number is refused; with the interface declared it is accepted', r.s.refusedNoIface && r.s.noShall && r.s.noNum && r.s.accepted, JSON.stringify(r.s));
        check('[S] sending puts it in the providing system\'s requirements, proposed, with its basis', r.s.sent && r.s.ownerSees, JSON.stringify(r.s));
        check('[S] the owner rejects only with a reason, and the other system sees it; then agrees', r.s.reject && r.s.consumerSeesWhy && r.s.agreed, JSON.stringify(r.s));
        console.log('\n[B] the budget changes');
        check('[B] a changed budget says "send again", the old wording cannot be sent, and the row asks to reword', r.b.st === 'Budget changed: send again' && r.b.oldRefused && r.b.button, JSON.stringify(r.b));
        check('[B] reworded, accepted and sent again, it carries the new budget', r.b.resent, JSON.stringify(r.b));
        console.log('\n[A] ANEM');
        check('[A] ANEM\'s wording is kept as a draft only for a need asked about, carrying the tree\'s number; nothing saved until Accept', r.a.kept && r.a.budgetSent && r.a.notSaved && r.a.shown, JSON.stringify(r.a));
        check('[A] Accept on the draft accepts that wording', r.a.accepted, JSON.stringify(r.a));
        check('[A] a wording that changes the number, or adds another one, is not kept', r.a.changedDropped && r.a.extraDropped, JSON.stringify(r.a));
        check('no page errors', errs.length === 0, errs.join(' | '));
    } catch (e) {
        check('test crashed: ' + (e && e.stack || e), false);
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
