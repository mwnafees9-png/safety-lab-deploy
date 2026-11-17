/* regression_apx_mac_20261115.test.js: the MAC Autopilot (step 3 of 5 of the new Autopilots).
 *
 * Waqas, 15 Nov 2026: "for MAC why aren't we make them choose configuration first for the systems performing the
 * function"; the build is set by hand, the AI reads a design document, "Or the engineer can tell the AI and it proposes
 * it"; "make it such they eventually have to put the SDD in and compare it to how they initially set the build"; "Keep
 * questions at the sub-system/assembly level"; "MAC rules cannot be K of N, it will be if you loose right aileron and
 * right spoiler it will result in loss of roll control, due to assymetric roll"; ailerons and spoilers "are not two
 * systems, they are part of the flight control system"; "what if even if you loose them asymmetrically you still have
 * control authority"; "System level I dont think MAC will work, you just have to build the fault trees from architecture
 * feeding aircraft level MAC"; "those links must not get broken"; weighted rules: "Retire it, convert exactly".
 * Rebuild: apx_mac.js (SLApxMac 1.0) on apx_engine.js, registered on the page of apx_autopilots.js 1.0.
 *   1  index.html order; wording (American English, no em dashes)
 *   2  the fault tree reader: AND and OR cut sets are minimal; a gate it cannot read is refused, never guessed
 *   3  K350, FC-07: no question until every build is set; the build is set from the page; assemblies get permanent IDs
 *      that are never reused
 *   4  the states follow the build: shared pairs F D O, a backup pair F O, left and right that differ F A B O
 *   5  the questions: fewer are asked than there are mixes, logic fills the rest, and an answer that contradicts an
 *      earlier one is refused
 *   6  a sided assembly: "both lost is fine" never answers "one side lost"; a mirror answer covers the mirror image
 *   7  the rules are named combinations of assemblies, each needs its reason before sending
 *   8  a build changed after the answers: the answers are set aside and kept, the questions come again, the links stay
 *      and are marked for review
 *   9  (v1.1) every loss gets its line in its system's FHA by itself: keyed to the function, traced to the aircraft
 *      failure condition, severity left blank, and saying what it contributes to
 *   9  links: a permanent ID, kept when re-pointed, kept when its target disappears (marked for review), never removed;
 *      a new system failure condition is created once
 *  10  the SDD compare: Assumed, then Backed by the SDD; a difference shows; raised = Disputed; "use the SDD build"
 *      takes the SDD's build and asks again
 *  11  the AI proposes a build from a document or from words; nothing is set until a person accepts; what it cannot
 *      rest on is dropped
 *  12  today's MAC rule for the function is brought in exactly; sending needs a name, the reasons and the evidence
 *  13  no page errors
 * MUTATION PROOFS (SL_APXM_MUTATE): setsev (the tool copies the aircraft severity onto the system line), notrace (the system line is not traced to the aircraft failure condition), inferside (one side lost is worked out from both lost), nowhy (sent without the
 *   reasons), dellink (a build change deletes the links), autoaccept (the AI's proposal is applied by itself), nostale
 *   (answers survive a build change), reuseid (a removed group's ID is given out again), guessgate (an unreadable gate
 *   is read as OR). Each must turn this red.
 * Run: node tests/regression_apx_mac_20261115.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_APXM_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    if (file !== 'apx_mac.js' || !MUT) return body;
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'setsev') rep("phases: fc.row.phases || '', severity: '', acTrace: fc.fcId, apx:", "phases: fc.row.phases || '', severity: fc.sev, acTrace: fc.fcId, apx:");
    if (MUT === 'notrace') rep("phases: fc.row.phases || '', severity: '', acTrace: fc.fcId, apx:", "phases: fc.row.phases || '', severity: '', acTrace: '', apx:");
    if (MUT === 'inferside') rep("sided: !!p && p.units.length > 1 && (g.pos === 'each' || g.pos === 'mirror'), units: unitNames(g) };", "sided: false, units: unitNames(g) };");
    if (MUT === 'nowhy') rep("if (nw) out.push('Say why for '", "if (false) out.push('Say why for '");
    if (MUT === 'dellink') rep("Object.keys(r.links).forEach(function (k) { if (r.links[k] && !r.links[k].review) r.links[k].review = 'The build changed after this link was made.'; });", "r.links = {};");
    if (MUT === 'autoaccept') rep("K.save();\n                return { n: n, of: cols.length };", "cols.forEach(function (c0) { acceptProposal(fc, c0.colId); }); K.save();\n                return { n: n, of: cols.length };");
    if (MUT === 'nostale') rep("        if (r.sig && had) {\n            r.stale", "        if (false) {\n            r.stale");
    if (MUT === 'reuseid') rep("function nextSeq(kind) { var s = apx(); if (!s.seq || typeof s.seq !== 'object') s.seq = {}; s.seq[kind] = (s.seq[kind] || 0) + 1; return s.seq[kind]; }", "function nextSeq(kind) { var s = apx(), n = kind === 'asm' ? Object.keys(s.build || {}).reduce(function (a, k) { return a + ((s.build[k].groups || []).length); }, 0) + 1 : ((s.seq = s.seq || {})[kind] = (s.seq[kind] || 0) + 1); return n; }");
    if (MUT === 'guessgate') rep("            throw new Error('The fault tree has a ' + gt + ' gate", "            if (true) { var o2 = []; cs.forEach(function (x) { o2 = o2.concat(x); }); return minimalSets(o2); }\n            throw new Error('The fault tree has a ' + gt + ' gate");
    return body;
}

(async () => {
    // ---- 1: the files ---------------------------------------------------------------------------------------------------
    const idx = rd('index.html'), src = rd('apx_mac.js');
    const order = ['apx_engine.js', 'apx_autopilots.js', 'apx_mac.js', 'apx_coffe.js', 'apx_bridge.js', 'pasa_autopilot.js'].map(f => idx.indexOf('src="' + f));
    check('1 index.html loads the engine, the page, the MAC, the CoFFE, the bridge, then the PASA Autopilot', order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), order.join(','));
    check('1 no em dashes, American English', src.indexOf(String.fromCharCode(0x2014)) === -1 && !/\b(colour|behaviour|analysed|analysing|centre\b|organis|summaris|recognis|minimis|licence|labelled|cancelled)/i.test(src));
    check('1 the wording never offers "k of n" as a MAC rule', !/k of n/i.test(src.replace(/\/\*[\s\S]*?\*\//, '')));

    // ---- 2: the fault tree reader (pure) ------------------------------------------------------------------------------------
    {
        const g = globalThis; g.SLApx = require(path.join(SITE, 'apx_engine.js')); g.SLApxAuto = require(path.join(SITE, 'apx_autopilots.js'));
        const vm = require('vm'), m = { exports: {} }; vm.runInThisContext('(function (module, exports) {' + mutate('apx_mac.js', src) + '\n})')(m, m.exports);
        const Mn = m.exports, leaf = n => ({ type: 'basic', name: n }), gate = (t, k) => ({ type: 'gate', gateType: t, name: t, children: k }), key = n => n.name;
        const sets = t => Mn.model.cutSets(t, key).map(s => s.join('+')).sort().join(' | ');
        check('2 OR of AND: a AND (b OR c) gives a+b and a+c', sets(gate('AND', [leaf('a'), gate('OR', [leaf('b'), leaf('c')])])) === 'a+b | a+c', sets(gate('AND', [leaf('a'), gate('OR', [leaf('b'), leaf('c')])])));
        check('2 a bigger set that holds a smaller one is not a cut set', sets(gate('OR', [leaf('a'), gate('AND', [leaf('a'), leaf('b')]), gate('AND', [leaf('b'), leaf('c')])])) === 'a | b+c');
        let refused = ''; try { Mn.model.cutSets(gate('VOTING', [leaf('a'), leaf('b'), leaf('c')]), key); } catch (e) { refused = e.message; }
        check('2 a gate that is not AND or OR is refused, with its kind named', /VOTING/.test(refused), refused);
        const props = Mn.act.cleanProposal([{ name: 'Ailerons', pattern: 'lr', units: [{ name: 'LH aileron', side: 'LH' }, { name: 'RH aileron', side: 'RH' }, { name: 'extra' }], pos: 'each', quote: 'q', where: 'w' }, { name: 'Bad', pattern: 'quad' }, null]);
        check('11 a proposal with a build the tool does not know is dropped; units are cut to the build', props.length === 1 && props[0].units.length === 2 && props[0].pos === 'each', props);
    }

    // ---- the browser ----------------------------------------------------------------------------------------------------
    let pw; try { pw = require('playwright'); } catch (_) { console.log('  SKIP  browser checks (playwright is not installed)'); return done(); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(SITE, path.normalize(p)); let b;
        try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const base = path.basename(f); if (base === 'apx_mac.js') b = Buffer.from(mutate(base, b.toString('utf8')));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const br = await pw.chromium.launch(), errs = [], tick = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await (await br.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html?apx=1'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async () => { await loadSampleProject(); }); await tick(4000);
        const K = await pg.evaluate(async () => { const A = SLApxAuto, f = A.model.fcs().find(x => x.fcId === 'FC-07'); A._ui.fc = f.key; A.open('mac'); await new Promise(r => setTimeout(r, 1200)); return f.key; });
        const jump = async i => { await pg.selectOption('[data-apx-jump]', String(i)); await tick(400); };

        // ---- 3: the build first --------------------------------------------------------------------------------------------
        const s3 = await pg.evaluate((K) => { const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K); let refused = ''; try { M.act.answer(f, 'FFFF', true); } catch (e) { refused = e.message; } return { tab: !!document.querySelector('#interdep-host .apx-aps'), ap: A._ui.ap, cols: M.model.macCols(f).map(d => d.name + ':' + d.set), ready: M.model.ready(f), refused, left: M.model.left(f) }; }, K);
        check('3 the MAC Autopilot opens beside the Interdependence one, on the systems ticked there', s3.tab && s3.ap === 'mac' && s3.cols.length === 4, s3);
        check('3 no question before every build is set', s3.ready === false && /built/i.test(s3.refused) && /built/i.test(s3.left[0] || ''), s3);
        await jump(1);
        // 17 Nov 2026 (Waqas: "MAC and CoFFE will need a similar interface"): the build step asks first
        const ask3 = await pg.evaluate(() => { const h = document.querySelector('#interdep-host'); return { q: (h.querySelector('.apx-askq') || {}).innerText, cols: Array.from(h.querySelectorAll('select[data-apx-xc="askcol"] option')).map(o => o.value), cards: h.querySelectorAll('.apx-bld').length, todo: /Still to set:/.test(h.innerText) }; });
        check('3 the build step opens by asking for an assembly group, for one of the ticked system functions; nothing is laid out before it is added', /Add an assembly group/.test(ask3.q || '') && ask3.cols.length === 4 && ask3.cards === 0 && ask3.todo, ask3);
        await pg.click('#interdep-host [data-apx-x="askadd"]'); await tick(300);
        check('3 nothing is added until the engineer says how it is built', (await pg.evaluate((K) => SLApxMac.model.macCols(SLApxAuto.model.fcOf(K)).filter(d => d.set).length, K)) === 0);
        const pats = ['pairs', 'backup', 'lr', 'pairs'];
        for (let i = 0; i < 4; i++) { await pg.selectOption('#interdep-host select[data-apx-xc="askcol"]', ask3.cols[i]); await pg.selectOption('#interdep-host select[data-apx-xc="askpat"]', pats[i]); await pg.click('#interdep-host [data-apx-x="askadd"]'); await tick(300); }
        const asm3 = await pg.evaluate((K) => { const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), c0 = M.model.lossBase(f)[0], sy = systemsData.find(x => String(x.id) === c0.sysId), g = M.model.groupsOf(c0.colId)[0]; M.act.setUnit(f, c0.colId, g.id, 0, 'name', 'Inboard brake pair'); return { cards: document.querySelectorAll('#interdep-host .apx-bld').length, asm: (sy.assemblies || []).map(a => a.id + '|' + a.name + '|' + a.funcId + '|' + a.apx), want: g.units.map(u => u.id) }; }, K);
        check('3 the assemblies are written onto their system, with the same permanent IDs and names', asm3.asm.length === 2 && asm3.asm[0].indexOf(asm3.want[0] + '|Inboard brake pair|') === 0 && asm3.asm.every(a => /\|true$/.test(a)), asm3);
        const s3b = await pg.evaluate((K) => { const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), ds = M.model.macCols(f); return { ready: M.model.ready(f), ids: ds.map(d => d.gid), states: ds.map(d => d.states.join('')), units: ds.map(d => d.units.join('/')), sided: ds.map(d => d.sided), src: ds.map(d => d.g.src), pos: ds.map(d => d.pos) }; }, K);
        check('3 picking the builds on the page sets them, by hand', s3b.ready && s3b.src.every(x => x === 'hand'), s3b);
        check('3 each assembly group has its own permanent ID', new Set(s3b.ids).size === 4 && s3b.ids.every(x => /^ASM-\d+$/.test(x)), s3b.ids);
        check('4 shared pairs are F D O; a backup pair is F O (losing one loses nothing)', s3b.states[0] === 'FDO' && s3b.states[1] === 'FO' && s3b.states[3] === 'FDO', s3b.states);
        check('4 a left and right pair mirrors by default and is asked one side at a time', s3b.pos[2] === 'mirror' && s3b.sided[2] === true && s3b.states[2] === 'FDO', s3b);
        const ids = await pg.evaluate((K) => { const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), c0 = M.model.lossBase(f)[0].colId; const g2 = M.act.addGroup(f, c0); const id2 = g2.id; M.act.removeGroup(f, c0, id2); const g3 = M.act.addGroup(f, c0); const id3 = g3.id; M.act.removeGroup(f, c0, id3); return { id2, id3, left: M.model.groupsOf(c0).length }; }, K);
        check('3 a removed group\'s ID is never given out again', ids.id2 !== ids.id3 && ids.left === 1, ids);

        // ---- 5: the questions -------------------------------------------------------------------------------------------------
        await jump(2);
        const q0 = await pg.evaluate(() => ({ q: !!document.querySelector('#interdep-host [data-apx-x^="ans|"]'), blocks: document.querySelectorAll('#interdep-host .apx-ub').length, txt: document.querySelector('#interdep-host').innerText }));
        check('5 the switch-off step shows a mix with its blocks and asks one thing', q0.q && q0.blocks >= 7 && /Can the aircraft still decelerate on the ground safely/.test(q0.txt), q0.txt.slice(0, 300));
        check('5 it never asks whether losing more could make it better', !/make it better|lose more/i.test(q0.txt));
        await pg.click('#interdep-host [data-apx-x^="ans|"]'); await tick(400);
        const q1 = await pg.evaluate((K) => { const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), s = M.model.solved(f); return { given: Object.keys(s.m1).length, known: s.cases.filter(c => s.by[c].level != null).length, cases: s.cases.length }; }, K);
        check('5 one click answers a question and logic fills other mixes from it', q1.given >= 1 && q1.known > q1.given, q1);
        const q2 = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K); M.act.clearAnswers(f); M.act.setEv(f, 'Landing performance analysis LPA-01');
            // the truth used here: it breaks when the first group is totally lost with anything else lost, or when three groups are lost
            const truth = c => { const non = c.replace(/O/g, '').length; return (c[0] === 'F' && non >= 2) || non >= 3; };
            let n = 0; for (;;) { const s = M.model.solved(f); if (s.done) break; const c = SLApx.nextQuestion(s.cols, s.m1, { lo: 0, hi: 1, among: s.cases }); M.act.answer(f, c, truth(c)); if (++n > 500) break; }
            const s = M.model.solved(f), wrong = s.cases.filter(c => (s.by[c].level === 1) !== truth(c));
            let refused = ''; const safeCase = s.cases.find(c => s.by[c].level === 0 && s.by[c].src === 'logic'); try { M.act.answer(f, safeCase, true); } catch (e) { refused = e.message; }
            return { asked: n, cases: s.cases.length, done: s.done, wrong: wrong.length, refused, rules: M.model.rules(s).map(x => M.model.ruleWords(x.c, s.ds)), left: M.model.left(f), stale: !!M.model.peek(K).stale };
        }, K);
        check('5 every mix is settled with fewer questions than mixes, and every one matches the truth', q2.done && q2.asked < q2.cases && q2.wrong === 0, q2);
        check('5 an answer that contradicts what is already settled is refused', /contradict/i.test(q2.refused), q2.refused);
        check('5 clearing the answers keeps the earlier ones on file', q2.stale === true);

        // ---- 7: named rules with a reason ------------------------------------------------------------------------------------
        check('7 the rules are named combinations of assemblies (their names, "lost"), not counts', q2.rules.length > 0 && q2.rules.every(t => / lost$/.test(t) && /Flight Control System|Powerplant|Landing Gear/.test(t)), q2.rules);
        check('7 each rule needs its reason before the MAC can be sent', q2.left.some(t => /Say why/.test(t)), q2.left);
        await jump(3);
        const w = await pg.evaluate(() => ({ why: document.querySelectorAll('#interdep-host input[data-apx-xc^="why|"]').length, caps: Array.from(document.querySelectorAll('#interdep-host .apx-cap')).map(c => c.innerText.replace(/\s+/g, ' ')), folded: !!document.querySelector('#interdep-host table.apx-arp') && !!document.querySelector('#interdep-host table.apx-arp').closest('.sl-fold') }));
        check('7 the worked-out step shows the rules table with a reason box per rule, and the tables are not folded away', w.why === q2.rules.length && /Minimum acceptable configuration rules/.test(w.caps[0] || '') && !w.folded, w);

        // ---- 6: a sided assembly ---------------------------------------------------------------------------------------------
        const sd = await pg.evaluate(() => {
            const X = SLApx, cols = X.columns([{ id: 'ail', states: ['F', 'A', 'B', 'O'], units: ['LH aileron', 'RH aileron'] }, { id: 'spl', states: ['F', 'A', 'B', 'O'], units: ['LH spoilers', 'RH spoilers'] }]);
            const a = {}; X.answer(a, 'FO', 0, cols, { lo: 0, hi: 1, mirror: true });   // both ailerons lost: still fine
            const s1 = X.solve(cols, a, { lo: 0, hi: 1 });
            const b = {}; const wrote = X.answer(b, 'BB', 1, cols, { lo: 0, hi: 1, mirror: true });   // RH aileron + RH spoilers lost: breaks
            return { oneSide: s1.by['AO'].level, wrote };
        });
        check('6 "both lost is fine" does not answer "one side lost": that is asked on its own', sd.oneSide === null, sd);
        check('6 with left and right mirroring, one answer covers the mix and its mirror image', sd.wrote.sort().join() === 'AA,BB', sd.wrote);
        const sd2 = await pg.evaluate((K) => { const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), s = M.model.solved(f), i = 2; const both = s.cases.find(c => c[i] === 'F' && c.replace(/O/g, '').length === 1), one = s.cases.find(c => c[i] === 'D' && c.replace(/O/g, '').length === 1); return { both: s.by[both], one: s.by[one], fromBoth: s.by[one].from === both }; }, K);
        check('6 in the Autopilot, the left and right pair\'s "one side lost" was not worked out from "both lost"', sd2.one.level != null && !sd2.fromBoth, sd2);

        // ---- 9a: every loss gets its line in the system's FHA by itself, severity left blank (17 Nov 2026) ------------------
        const auto = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), n0 = systemsData.reduce((n, s) => n + (s.fha || []).length, 0);
            const made = M.act.ensureSysFcs(f), n1 = systemsData.reduce((n, s) => n + (s.fha || []).length, 0), again = M.act.ensureSysFcs(f), n2 = systemsData.reduce((n, s) => n + (s.fha || []).length, 0);
            const evs = M.model.allEvents(f), rows = evs.map(e => { const l = M.model.linkOf(f, e.k), r = M.model.sysFcRow(l); return r && { sev: r.severity, fn: r.sysFuncId, tr: r.acTrace, d: r.fcDesc, eff: r.effAc || '', id: l.id, auto: l.auto, by: r.apx && r.apx.by, sys: l.sysId === e.sysId }; });
            const inRules = M.model.linkEvents(f).map(e => e.k), k0 = inRules[0], r0 = M.model.sysFcRow(M.model.linkOf(f, k0));
            return { evs: evs.length, made: made.length, n0, n1, n2, again: again.length, rows, r0eff: r0 && r0.effAc, r0sev: r0 && r0.severity, fcSev: f.sev };
        }, K);
        check('9 every loss of the builds gets its own line in its system\'s FHA, once (a second pass adds nothing)', auto.evs > 0 && auto.made === auto.evs && auto.n1 === auto.n0 + auto.made && auto.again === 0 && auto.n2 === auto.n1, { evs: auto.evs, made: auto.made, n0: auto.n0, n1: auto.n1 });
        check('9 each line is keyed to its system function, traced to the aircraft failure condition, and linked with a permanent link', auto.rows.every(r => r && r.fn && /FC-07/.test(r.tr) && /^LNK-\d+$/.test(r.id) && r.auto === true && r.by === 'tool' && r.sys), auto.rows.slice(0, 2));
        check('9 the tool never sets the severity: it is left blank, not copied from the aircraft failure condition', auto.fcSev === 'Hazardous' && auto.rows.every(r => r.sev === ''), auto.rows.map(r => r.sev));
        check('9 a line in a rule says what it contributes to, with what', /^Contributes to FC-07 \(.*\) together with: /.test(auto.r0eff || '') || /on its own\.$/.test(auto.r0eff || ''), auto.r0eff);

        // ---- 9: links ---------------------------------------------------------------------------------------------------------
        const lk = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, B = SLApxBridge, f = A.model.fcOf(K), evs = M.model.linkEvents(f), e = evs[0], gs = M.model.sysGroups(e.sysId);
            const sy = M.model.sysById(e.sysId), n0 = (sy.fha || []).length;
            const r1 = M.act.createSysFc(f, e.k, e.sysId, 'Total loss of ground deceleration from this system (test)'), id1 = M.model.linkOf(f, e.k).id, n1 = sy.fha.length;
            const r2 = M.act.createSysFc(f, e.k, e.sysId, 'Total loss of ground deceleration from this system (test)'), n2 = sy.fha.length;
            let id2 = id1, was = 0; if (gs.length) { M.act.setLink(f, e.k, e.sysId, gs[0].fcId); id2 = M.model.linkOf(f, e.k).id; was = (M.model.linkOf(f, e.k).was || []).length; }
            const target = M.model.linkOf(f, e.k).fcId, rowsGone = sy.fha.filter(r => String(r.fcId) === String(target)); sy.fha = sy.fha.filter(r => String(r.fcId) !== String(target));
            try { SLDataChange.bump(); } catch (_) {}
            const st = M.model.linkState(f, e), nrev = B.check(), kept = !!M.model.linkOf(f, e.k), stored = M.model.linkOf(f, e.k).review;
            rowsGone.forEach(r => sy.fha.push(r)); try { SLDataChange.bump(); } catch (_) {}
            return { evs: evs.length, r1, r2, id1, id2, n0, n1, n2, hadGroups: gs.length, was, review: st.review, nrev, kept, stored };
        }, K);
        check('9 every loss in the rules can be linked, and a link gets a permanent ID', lk.evs > 0 && /^LNK-\d+$/.test(lk.id1), lk);
        check('9 a new system failure condition is created in that system\'s FHA once, not twice', lk.r1.ok && lk.n1 === lk.n0 + 1 && lk.n2 === lk.n1 && lk.r2.existed === true, lk);
        check('9 re-pointing a link keeps its ID and remembers where it pointed', lk.id2 === lk.id1 && (!lk.hadGroups || lk.was >= 1), lk);
        check('9 when the failure condition it points to disappears, the link is kept and marked for review', lk.kept && /no longer/.test(lk.review) && lk.nrev >= 1 && /no longer/.test(lk.stored || ''), lk);
        await jump(6);
        const lt = await pg.evaluate(() => { const h = document.querySelector('#interdep-host'); return { rows: h.querySelectorAll('table.apx-arp tr').length, txt: h.innerText }; });
        check('9 the links step says there is no MAC below the aircraft level and that links are never broken', /There is no MAC below the aircraft level/.test(lt.txt) && /Links are never broken/.test(lt.txt) && lt.rows > 1);

        // ---- 8: a build change after the answers -------------------------------------------------------------------------------
        const ch = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), ds = M.model.macCols(f), before = Object.keys(M.model.peek(K).m1).length, nl = Object.keys(M.model.peek(K).links).length;
            M.model.peek(K).links[Object.keys(M.model.peek(K).links)[0]].review = '';
            M.act.setPattern(f, ds[1].colId, ds[1].gid, 'shared', 'hand', '');
            const s = M.model.solved(f), r = M.model.peek(K);
            return { before, after: Object.keys(r.m1).length, stale: r.stale && Object.keys(r.stale.m1).length, asked: r.asked, links: Object.keys(r.links).length, nl, review: Object.keys(r.links).map(k => r.links[k].review), open: s.open.length, states: s.ds[1].states.join('') };
        }, K);
        check('8 changing a build sets the answers aside (kept on file) and asks again', ch.before > 0 && ch.after === 0 && ch.stale === ch.before && ch.asked === 'again' && ch.open > 0 && ch.states === 'FDO', ch);
        check('8 the links are still there, marked for review, none removed', ch.links === ch.nl && ch.links > 0 && ch.review.every(x => /build changed/.test(x)), ch);

        // ---- 10: the SDD compare ------------------------------------------------------------------------------------------------
        const sdd = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), ds = () => M.model.macCols(f), out = { s0: M.model.macStatus(f).k };
            ds().forEach(d => M.act.setSdd(f, d.colId, d.gid, { pattern: d.g.pattern, where: 'SDD 3.2', doc: 'K350 SDD Rev B', src: 'hand' })); out.s1 = M.model.macStatus(f).k; out.t1 = M.model.macStatus(f).t;
            const d1 = ds()[1]; M.act.setSdd(f, d1.colId, d1.gid, { pattern: 'backup', where: 'SDD 3.4', doc: 'K350 SDD Rev B', src: 'hand' }); out.s2 = M.model.macStatus(f).k;
            M.act.resolveSdd(f, d1.colId, d1.gid, 'dispute'); out.s3 = M.model.macStatus(f).k;
            M.act.resolveSdd(f, d1.colId, d1.gid, 'sdd'); const d1b = ds()[1]; out.s4 = M.model.macStatus(f).k; out.pat = d1b.g.pattern; out.src = d1b.g.src; out.states = d1b.states.join('');
            return out;
        }, K);
        check('10 the MAC is Assumed until the builds are compared with the SDD, then Backed by the SDD', sdd.s0 === 'assumed' && sdd.s1 === 'backed' && /K350 SDD Rev B/.test(sdd.t1), sdd);
        check('10 a build that differs from the SDD shows as Different; raised with the design team it is Disputed', sdd.s2 === 'differs' && sdd.s3 === 'disputed', sdd);
        check('10 "use the SDD build" takes the SDD\'s build, from the SDD, and the MAC is Backed again', sdd.s4 === 'backed' && sdd.pat === 'backup' && sdd.src === 'sdd' && sdd.states === 'FO', sdd);
        await jump(8);
        const st8 = await pg.evaluate(() => { const h = document.querySelector('#interdep-host'); return { txt: h.innerText, btn: (h.querySelector('[data-apx-x="send"]') || {}).innerText || '' }; });
        check('10 the last step compares each build with the SDD and says who read it', /What the SDD says/i.test(st8.txt) && /Read by/.test(st8.txt) && /MAC status: Backed by the SDD/.test(st8.txt), st8.txt.slice(0, 400));

        // ---- 11: the AI proposes, a person accepts -------------------------------------------------------------------------------
        const ai = await pg.evaluate(async (K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K), c0 = M.model.lossBase(f)[0], before = M.model.groupsOf(c0.colId).map(g => g.pattern + ':' + g.src).join();
            window.slLoadAI = async () => {}; let seen = null;
            window.SafetyLabAI = { complete: async (o) => { seen = o; return { model: 'test-model', text: JSON.stringify({ columns: [{ colId: c0.colId, groups: [{ name: 'Wheel Brakes', pattern: 'pairs', units: [{ name: 'Inboard brake pair', side: 'C' }, { name: 'Outboard brake pair', side: 'C' }], pos: 'same', quote: 'Four main wheels, braked as an inboard pair and an outboard pair.', where: 'section 3.2.1' }] }, { colId: 'fn:NOT-THERE', groups: [{ pattern: 'single' }] }] }) }; } };
            const r = await M.act.propose(f, 'told', { text: 'The brakes work as an inboard pair and an outboard pair.' });
            const mid = M.model.groupsOf(c0.colId).map(g => g.pattern + ':' + g.src).join(), prop = !!(projectConfig.apx.buildProp && projectConfig.apx.buildProp[c0.colId]);
            A.kit.draw(); A._ui.step = 1; A.kit.draw(); const shown = /AI proposes/.test(document.querySelector('#interdep-host').innerText);
            M.act.acceptProposal(f, c0.colId); const g = M.model.groupsOf(c0.colId)[0];
            return { r, before, mid, prop, shown, after: g.pattern + ':' + g.src + ':' + g.name + ':' + g.units.map(u => u.name).join('/'), ref: g.ref, by: g.by, feature: seen && seen.feature, temp: seen && seen.temperature, sys: seen && /never guess/.test(seen.system) };
        }, K);
        check('11 the AI is asked to use only what it is given, never to guess, at temperature 0', ai.feature === 'apx.mac.build' && ai.temp === 0 && ai.sys === true, ai);
        check('11 its proposal is shown and nothing is set until a person accepts', ai.r.n === 1 && ai.prop && ai.shown && ai.mid === ai.before, ai);
        check('11 accepting sets the build, names the assemblies and records where it came from and who accepted', /^pairs:told:Wheel Brakes:Inboard brake pair\/Outboard brake pair$/.test(ai.after) && /inboard pair and an outboard pair/.test(ai.ref) && !!ai.by, ai);

        // ---- 12: today's rule brought in, and sending -----------------------------------------------------------------------------
        const cv = await pg.evaluate((K) => {
            const A = SLApxAuto, M = SLApxMac, f = A.model.fcOf(K); M.model.lossBase(f).forEach(c => { const g = M.model.groupsOf(c.colId)[0]; M.act.setGroupName(f, c.colId, g.id, ''); M.act.setPattern(f, c.colId, g.id, 'pairs', 'hand', ''); });
            const old = M.model.oldRules(f), oldSets = old.length ? macBreachSets(old[0]).map(s => s.slice().sort().join('+')).sort() : [], c0 = M.model.conversion(f), noName = null;
            M.act.clearAnswers(f); const r = M.act.convert(f), s = M.model.solved(f);
            const mine = M.model.breaking(s).map(c => c.split('').map((x, i) => x === 'F' ? String(s.ds[i].sysId) : null).filter(Boolean).sort().join('+')).sort();
            const partialBreaks = M.model.breaking(s).some(c => /D/.test(c));
            const l0 = M.model.left(f); const s0 = M.act.send(f, 'Test Engineer');
            M.model.rules(s).forEach(x => M.act.setWhy(f, x.c, 'Not enough stopping force left for the landing distance')); M.act.setEv(f, 'LPA-01');
            const sNo = M.act.send(f, '  '), sOk = M.act.send(f, 'Test Engineer');
            return { old: old.length, ok: c0 && c0.ok, r, done: s.done, oldSets, mine, partialBreaks, l0, s0, sNo, sOk, status: M.model.status(f), sentAs: M.model.peek(K).sent };
        }, K);
        check('12 the demo has an earlier MAC rule for this function, and it can be brought in', cv.old >= 1 && cv.ok === true && cv.r.ok === true && cv.done === true, cv);
        check('12 brought in exactly: the same breach sets, and no partial loss invented', cv.oldSets.length > 0 && cv.oldSets.join('|') === cv.mine.join('|') && cv.partialBreaks === false, { old: cv.oldSets, mine: cv.mine });
        check('12 sending is refused without the reasons, and without a name', cv.s0.ok === false && /why/i.test(cv.s0.why) && cv.sNo.ok === false && /name/i.test(cv.sNo.why), cv);
        check('12 sent with one signature, carrying its SDD status', cv.sOk.ok === true && cv.status.k === 'sent' && cv.sentAs.by === 'Test Engineer' && /^(assumed|differs|disputed|backed)$/.test(cv.sentAs.status), cv.sentAs);
        check('13 no page errors', errs.length === 0, errs.join(' | '));
        await pg.context().close();
    } catch (e) { check('browser run completed', false, e && e.stack ? e.stack : String(e)); }
    await br.close(); srv.close();
    done();
    function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  [mutation: ' + MUT + ']' : '')); process.exit(fail ? 1 : 0); }
})();
