/* ONE READING OF A MAC RULE, FOR EVERY SCREEN (22 Nov 2026).
 * Before: each screen read rule.clauses itself. A member has been a system FUNCTION since 21 Aug 2026 (or an item),
 * but the what-if lens, the ZSA and PRA Autopilots, the integrity sweep, the modification impact and the schema check
 * compared it with a SYSTEM id, so a rule over functions never breached there and every function member was reported
 * as missing. And a rule sent by the MAC Autopilot keeps only its total-loss combinations in rule.clauses.
 *   1  the files: the shared reading exists; the readers go through it
 *   2  a rule over system FUNCTIONS: members, systems, breached when the owner systems are down (what-if lens too)
 *   3  the integrity sweep and the schema check accept a function member and still catch a member that is nothing
 *   4  a rule over SYSTEM ids behaves as before; a weighted clause counts a down member as zero
 *   5  a rule sent by the MAC Autopilot: its partial-loss combinations count, in members, systems, breach and words
 *   6  two failure conditions of one aircraft function: each rule speaks for its own failure condition only
 *   7  an Autopilot rule cannot be edited, substantiated, re-pointed or deleted from today's MAC page
 *   8  no page errors
 * Mutations (SL_MAC1_MUTATE): noowner (a member is down only when it is itself down), apxclauses (an Autopilot rule
 * is evaluated from its clauses), sharefc (an Autopilot rule speaks for every failure condition of its function).
 */
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site'), MUT = process.env.SL_MAC1_MUTATE || '';
const rd = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function mutate(file, body) {
    if (file !== 'misc_fn_modules.js' || !MUT) return body;
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'noowner') rep("    const own = macTokOwner(k);\n    return !!(own && isDown(own));", "    return false;");
    if (MUT === 'apxclauses') rep("    if (macRuleIsApx(rule)) {\n        rule.apx.sets.forEach(set => { if (set && set.length && set.every(down)) parts.push({ kind: 'set', members: set.slice(), left: [] }); });\n        return { breached: parts.length > 0, parts };\n    }", "");
    if (MUT === 'sharefc') { rep("    if (!macRuleIsApx(rule)) return rows;", "    if (true) return rows;"); rep("        (!macRuleIsApx(r) || String(r.apx.fcKey) === String(fc.internalId) || (fc.fcId && String(r.apx.fcId || '') === String(fc.fcId))));", "        true);"); }
    return body;
}
(async () => {
    const misc = rd('misc_fn_modules.js');
    check('1 the shared reading is there', ['macRuleIsApx', 'macTokOwner', 'macRuleMembers', 'macRuleSystems', 'macRuleInvolves', 'macTokDown', 'macRuleEval', 'macRuleWords', 'macRuleFcs', 'macRulesForFc', 'macRuleHasUnmodelledClause'].every(f => misc.indexOf('function ' + f + '(') !== -1));
    check('1 the what-if lens, the ZSA and PRA Autopilots no longer compare a member with a system id themselves', !/downSystems\.has\(m\)/.test(rd('fault_sim.js')) && /macRuleEval\(rule/.test(rd('fault_sim.js')) && /macRuleEval\(rule/.test(rd('zsa_autopilot.js')) && /macTokDown\(m/.test(rd('pra_autopilot.js')));
    check('1 the integrity sweep, the modification impact, the schema check, the lanes and the L3 flows go through it', /macRuleMembers\(r\)/.test(rd('gt_integrity.js')) && /macRuleInvolves\(r, id\)/.test(rd('mod_impact.js')) && /macTokOwner\(m\)/.test(rd('mbsa_schema.js')) && /macRuleMembers\(rule\)/.test(rd('mac_lanes.js')) && /macRuleSystems\(rule\)/.test(rd('mac_l3.js')));
    check('1 no em dash in the new text', !/22 Nov 2026[^\n]*—/.test(misc));

    let pw; try { pw = require('playwright'); } catch (_) { console.log('  SKIP  browser checks (playwright is not installed)'); return done(); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(SITE, path.normalize(p)); let b;
        try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const base = path.basename(f); if (base === 'misc_fn_modules.js') b = Buffer.from(mutate(base, b.toString('utf8')));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const br = await pw.chromium.launch(), errs = [], tick = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await (await br.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async () => { await loadSampleProject(); }); await tick(2500);
        const R = await pg.evaluate(async () => {
            const o = {}, keep = projectConfig.macModels, keepFha = acFhaData.slice();
            const withFn = systemsData.filter(s => s && Array.isArray(s.functions) && s.functions.some(f => f && f.funcId));
            const [sA, sB, sC, sD] = withFn, fA = sA.functions.find(f => f.funcId).funcId, fB = sB.functions.find(f => f.funcId).funcId, fC = sC.functions.find(f => f.funcId).funcId;
            const fc = acFhaData.find(f => String(f.internalId) === '1007') || acFhaData.find(f => f.subId);
            const downOf = ids => id => ids.indexOf(id) !== -1, set = r => { projectConfig.macModels = r; };
            o.ids = [sA.id, sB.id, sC.id, fA, fB, fC, fc.fcId, fc.subId];
            // ---- 2: a rule over system functions
            const fn = { id: 't-fn', level: 0, subId: fc.subId, phase: 'All phases', clauses: [{ min: 1, of: [fA, fB] }] };
            o.mem = macRuleMembers(fn); o.sys = macRuleSystems(fn); o.inv = [macRuleInvolves(fn, sA.id), macRuleInvolves(fn, fB), macRuleInvolves(fn, sD.id)];
            o.ev1 = macRuleEval(fn, downOf([sA.id])).breached; o.ev2 = macRuleEval(fn, downOf([sA.id, sB.id])); o.ev3 = macRuleEval(fn, downOf([fA, fB])).breached;
            set([fn]);
            const e0 = fsEvaluate([]), e2 = fsEvaluate([sA.id, sB.id]);
            o.fs0 = e0.breaches.filter(b => b.ruleId === 't-fn').length; o.fs2 = e2.breaches.filter(b => b.ruleId === 't-fn'); 
            // ---- 3: integrity and schema
            o.gtFn = gtIntegrity().dangling.filter(d => /^MAC t-fn/.test(d.where));
            o.schemaFn = MBSA_SCHEMA.validateRule(fn);
            const bad = { id: 't-bad', level: 0, subId: fc.subId, phase: 'All phases', clauses: [{ min: 1, of: [fA, 'NOPE-1'] }] };
            set([bad]); o.gtBad = gtIntegrity().dangling.filter(d => /^MAC t-bad/.test(d.where)).map(d => d.ref); o.schemaBad = MBSA_SCHEMA.validateRule(bad);
            // ---- 4: system ids as before; weighted
            const sy = { id: 't-sys', level: 0, subId: fc.subId, phase: 'All phases', clauses: [{ min: 1, of: [sA.id, sB.id] }] };
            o.sy = [macRuleEval(sy, downOf([sA.id])).breached, macRuleEval(sy, downOf([sA.id, sB.id])).breached, macBreachSets(sy).map(s => s.join('+')).join('|') === [sA.id, sB.id].join('+')];
            const w = { id: 't-w', level: 2, subId: fc.subId, phase: 'All phases', clauses: [{ min: 1, of: [fA, fB], weights: { [fA]: 2 }, floor: 2 }] };
            o.w = [macRuleEval(w, downOf([sB.id])).breached, macRuleEval(w, downOf([sA.id])).breached, macRuleEval(w, downOf([sA.id])).parts[0]];
            o.words = macRuleWords(fn);
            // ---- 5: a rule sent by the MAC Autopilot
            const deg = 'deg:' + sC.id + ':one side lost';
            const ap = { id: 'apx-mac-' + fc.internalId, level: 0, subId: fc.subId, phase: 'All phases', clauses: [{ min: 1, of: [fA, fB] }], degraded: [{ sysId: sC.id, label: 'one side lost', weight: 0, apx: true }], substantiation: { kind: 'assumption' },
                apx: { fcKey: String(fc.internalId), fcId: fc.fcId, sets: [[fA, fB], [deg, fA]], members: [fA, fB, fC] } };
            o.apMem = macRuleMembers(ap); o.apSys = macRuleSystems(ap);
            o.apEv = [macRuleEval(ap, downOf([sA.id])).breached, macRuleEval(ap, downOf([sA.id, sC.id])), macRuleEval(ap, downOf([sA.id, sB.id])).breached, macRuleEval(ap, downOf([sC.id])).breached];
            o.apWords = macRuleWords(ap); o.apUnm = [macRuleHasUnmodelledClause(Object.assign({}, ap, { clauses: [{ min: 1, of: [fA] }] })), macRuleHasUnmodelledClause({ clauses: [{ min: 1, of: [fA] }] })];
            o.apSchema = MBSA_SCHEMA.validateRule(Object.assign({}, ap, { clauses: [] }));
            o.apText = SLFhaDerive.ruleText(ap); o.apShape = SLFhaDerive.ruleShape(ap);
            const fp1 = _macRuleFp(ap), fp2 = _macRuleFp(Object.assign({}, ap, { apx: Object.assign({}, ap.apx, { sets: [[fA, fB]] }) }));
            o.fp = fp1 !== fp2;
            set([ap]); o.apFs = fsEvaluate([sA.id, sC.id]).breaches.filter(b => b.ruleId === ap.id);
            o.apGt = gtIntegrity().dangling.filter(d => d.where === 'MAC ' + ap.id);
            // ---- 6: two failure conditions of one aircraft function
            const twin = { internalId: 990017, fcId: 'FC-TWIN', fcDesc: 'Twin condition of the same function', subId: fc.subId, severity: 'Major', phases: fc.phases };
            acFhaData.push(twin);
            const ap2 = { id: 'apx-mac-990017', level: 0, subId: fc.subId, phase: 'All phases', clauses: [{ min: 1, of: [fC] }], apx: { fcKey: '990017', fcId: 'FC-TWIN', sets: [[fC]], members: [fC] } };
            set([ap, ap2]);
            o.two = { forFc: macRulesForFc(fc).map(r => r.id), forTwin: macRulesForFc(twin).map(r => r.id), fcsAp: macRuleFcs(ap).map(f => f.fcId), fcsAp2: macRuleFcs(ap2).map(f => f.fcId), own: [(_macFcForRule(ap) || {}).fcId, (_macFcForRule(ap2) || {}).fcId],
                coffe: [_coffeBreachSetsForFc(fc).length, _coffeBreachSetsForFc(twin).map(s => s.join('+')).join('|')], plainFcs: macRuleFcs(fn).map(f => f.fcId).sort(), plainFor: (set([fn, ap2]), macRulesForFc(twin).map(r => r.id)) };
            set([ap, ap2]); o.twoFs = fsEvaluate([sC.id]).breaches.map(b => [b.ruleId, b.fcs.map(f => f.fcId).join(',')]);
            // ---- 7: locked on today's MAC page
            const n0 = projectConfig.macModels.length; await macDeleteRule(ap.id); await macSubstantiate(ap.id);
            o.lock = [projectConfig.macModels.length === n0, _macFidRule(ap.id) === null, (projectConfig.macModels.find(r => r.id === ap.id).substantiation || {}).kind === 'assumption'];
            macFidToggle(ap.id); o.lock.push(!_macFidOpen[ap.id]);
            try { await switchTab('mac'); } catch (_) {} renderMacPage(); const rowTxt = Array.from(document.querySelectorAll('#view-mac tr')).map(t => t.innerText).find(t => /MAC Autopilot/.test(t)) || ''; o.lock.push(/Set in the MAC Autopilot/.test(rowTxt) && /lost when/.test(rowTxt));
            acFhaData.length = 0; keepFha.forEach(r => acFhaData.push(r)); projectConfig.macModels = keep;
            return o;
        });
        const [sA, sB, sC, fA, fB, fC, fcId] = R.ids;
        check('2 a rule over functions: its members are the functions, its systems are their owners', R.mem.join() === [fA, fB].join() && R.sys.join() === [sA, sB].join() && R.inv.join() === 'true,true,false', [R.mem, R.sys, R.inv]);
        check('2 it holds with one owner system down and breaks with both down (and with both functions down)', R.ev1 === false && R.ev2.breached === true && R.ev2.parts[0].left.length === 0 && R.ev3 === true, [R.ev1, R.ev2, R.ev3]);
        check('2 the what-if lens sees it: nothing down, no breach; both systems down, the rule breaks', R.fs0 === 0 && R.fs2.length === 1 && /min 1 of/.test(R.fs2[0].detail) && /0 available/.test(R.fs2[0].detail), [R.fs0, R.fs2]);
        check('3 the integrity sweep and the schema check accept a function member', R.gtFn.length === 0 && !R.schemaFn.some(x => /not a live/.test(x)), [R.gtFn, R.schemaFn]);
        check('3 ...and still catch a member that is nothing', R.gtBad.join() === 'NOPE-1' && R.schemaBad.filter(x => /NOPE-1/.test(x)).length === 1 && !R.schemaBad.some(x => x.indexOf('"' + fA + '"') !== -1), [R.gtBad, R.schemaBad]);
        check('4 a rule over system ids reads as before', R.sy.join() === 'false,true,true', R.sy);
        check('4 a weighted clause counts a down member as zero capacity (2 of 3 left meets a floor of 2; 1 of 3 does not)', R.w[0] === false && R.w[1] === true && R.w[2].surviving === 1 && R.w[2].total === 3 && R.w[2].floor === 2, R.w);
        check('4 a plain rule in words is its clauses', /^at least 1 of \[/.test(R.words), R.words);
        check('5 an Autopilot rule: the function named only in a partial-loss combination is a member, and its system counts', R.apMem.join() === [fA, fB, fC].join() && R.apSys.indexOf(sC) !== -1, [R.apMem, R.apSys]);
        check('5 it breaks on a partial-loss combination (which its clauses do not hold), and only on its named combinations', R.apEv[0] === false && R.apEv[1].breached === true && R.apEv[1].parts.length === 1 && R.apEv[1].parts[0].kind === 'set' && R.apEv[2] === true && R.apEv[3] === false, R.apEv);
        check('5 in words it is its named combinations, the partial loss included', /^lost when /.test(R.apWords) && /one side lost/.test(R.apWords) && /; or when /.test(R.apWords) && /^lost when /.test(R.apText), [R.apWords, R.apText]);
        check('5 a one-member combination in it is an engineer\'s answer, not "redundancy not modeled yet"', R.apUnm.join() === 'false,true', R.apUnm);
        check('5 the schema check takes it with no total-loss clause; the count-based FHA derivation does not count against it', !R.apSchema.some(x => /no clauses/.test(x)) && R.apShape.apx === true, [R.apSchema, R.apShape]);
        check('5 its fingerprint changes when a named combination changes', R.fp === true);
        check('5 the what-if lens breaks it on the partial-loss combination and names its one failure condition; the integrity sweep has nothing against it', R.apFs.length === 1 && /all lost:/.test(R.apFs[0].detail) && R.apFs[0].fcs.map(f => f.fcId).join() === fcId && R.apGt.length === 0, [R.apFs, R.apGt]);
        check('6 two failure conditions of one function: each gets its own rule and only its own', R.two.forFc.join() === 'apx-mac-1007' && R.two.forTwin.join() === 'apx-mac-990017' && R.two.fcsAp.join() === fcId && R.two.fcsAp2.join() === 'FC-TWIN' && R.two.own.join() === fcId + ',FC-TWIN', R.two);
        check('6 CoFFE reads each failure condition\'s own combinations', R.two.coffe[0] === 2 && R.two.coffe[1] === fC, R.two.coffe);
        check('6 a plain rule still speaks for every failure condition of its function', R.two.plainFcs.indexOf('FC-TWIN') !== -1 && R.two.plainFcs.indexOf(fcId) !== -1 && R.two.plainFor.sort().join() === 'apx-mac-990017,t-fn', [R.two.plainFcs, R.two.plainFor]);
        check('6 the what-if lens ties each broken rule to its own failure condition', R.twoFs.some(x => x[0] === 'apx-mac-990017' && x[1] === 'FC-TWIN') && !R.twoFs.some(x => x[0] === 'apx-mac-990017' && x[1].indexOf(fcId) !== -1), R.twoFs);
        check('7 an Autopilot rule is not deleted, substantiated or opened for fidelity edits from today\'s MAC page, which shows it in words with no edit buttons', R.lock.join() === 'true,true,true,true,true', R.lock);
        check('8 no page errors', errs.length === 0, errs.join(' | '));
        await pg.context().close();
    } catch (e) { check('browser run completed', false, e && e.stack ? e.stack : String(e)); }
    await br.close(); srv.close();
    done();
    function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  [mutation: ' + MUT + ']' : '')); process.exit(fail ? 1 : 0); }
})();
