/* ============================================================================
 * demo/hl1_hf.js (23 Nov 2026): the Aeolus HL-1 demo with the HF Autopilot done, all ten steps answered and signed.
 *
 * Waqas, 23 Nov 2026: "lets fill those out in full, human factors, a full scale demo that any customer can use"; task
 * times "typed as assumed figures, each clearly labeled as an assumption to be replaced by simulator evidence".
 *
 * NOTHING HERE IS A RESULT. This file holds what a human factors engineer types into the HF Autopilot: who does each
 * aircraft function in each flight phase, which pilot does each crew function, what the crew does for each failure
 * condition, the share of each pilot's time each task takes and how long each failure response takes (assumed, labeled),
 * the ways each task can go wrong and how they are caught, the alert for each failure condition, the 25.1302, reach and
 * view answers for every flight deck control and display, situation awareness per phase, the minimum crew assessment, and
 * which crew actions the safety analysis counts on. fill() puts them in through the Autopilot's own actions, so every HF
 * table, the workload charts and the HF assumptions on the register come from the tool, signed by the demo's human
 * factors engineer on a fixed date (SLAutopilotUI.fillAs).
 * ==========================================================================*/
(function () {
    'use strict';
    var VERSION = '1.0';
    const SIGNER = 'R. Váldez', SIGNED_AT = '2026-11-23T16:30:00.000Z';
    const BASIS = 'Assumed pending simulator evidence: estimated from comparable four-engine transport procedures';
    const PHASES = ['Standing', 'Taxi', 'Takeoff', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing'];
    // 1. who does each aircraft function, phase by phase (c crew, s both: the automation does it and the crew watches, a automation, n not in that phase)
    const ALLOC = {
        'SF-01': 'nncssssc', 'SF-02': 'nncssssc', 'SF-03': 'nncssssc', 'SF-04': 'nccssssc', 'SF-05': 'nnssaass', 'SF-06': 'nccnnnnc',
        'SF-07': 'nccnnnnc', 'SF-08': 'aaaaaaaa', 'SF-09': 'aaaaaaaa', 'SF-10': 'nnsssssn', 'SF-11': 'ssssssss', 'SF-12': 'nncnnncn',
        'SF-13': 'ncssssss', 'SF-14': 'aaaaaaaa', 'SF-15': 'caaaaaaa', 'SF-16': 'aaaaaaaa', 'SF-17': 'aaaaaaaa', 'SF-18': 'cnnnnnnn',
        'SF-19': 'aaannnnn', 'SF-20': 'ssaaaaaa', 'SF-21': 'aaaaaaaa', 'SF-22': 'nccnnnnc', 'SF-23': 'ssssssss', 'SF-24': 'nnnssssn',
        'SF-25': 'ncccnncc', 'SF-26': 'ccnnssnn', 'SF-27': 'cccccccc', 'SF-28': 'cccnnncc', 'SF-29': 'snnnnnns', 'SF-30': 'aaaaaaaa',
        'SF-31': 'aaaaaaaa', 'SF-32': 'nnssssss', 'SF-33': 'nnssssss', 'SF-34': 'ssssssss', 'SF-35': 'aaaaaaaa', 'SF-36': 'ssssssss'
    };
    const CODE = { c: 'crew', s: 'shared', a: 'automation', n: 'na' };
    // 2. which pilot does each crew function
    const WHO = {
        'SF-01': 'PF', 'SF-02': 'PF', 'SF-03': 'PF', 'SF-04': 'PF', 'SF-05': 'PM', 'SF-06': 'PF', 'SF-07': 'PF', 'SF-10': 'PM', 'SF-11': 'PM',
        'SF-12': 'PM', 'SF-13': 'PM', 'SF-15': 'Both', 'SF-18': 'Both', 'SF-20': 'PM', 'SF-22': 'PF', 'SF-23': 'PM', 'SF-24': 'PF', 'SF-25': 'PM',
        'SF-26': 'PM', 'SF-27': 'PM', 'SF-28': 'PM', 'SF-29': 'Both', 'SF-32': 'PF', 'SF-33': 'PF', 'SF-34': 'PM', 'SF-36': 'PM'
    };
    // what the crew does for each failure condition (the rest are a non-normal procedure)
    const EMERGENCY = ['FC-04', 'FC-05', 'FC-06', 'FC-07', 'FC-08', 'FC-13', 'FC-14', 'FC-22', 'FC-26', 'FC-27', 'FC-29', 'FC-31', 'FC-33', 'FC-36', 'FC-38', 'FC-47', 'FC-49', 'FC-53', 'FC-57', 'FC-59', 'FC-60'];
    const NO_RECOVERY = ['FC-01', 'FC-03', 'FC-11', 'FC-16', 'FC-17', 'FC-18', 'FC-19', 'FC-21', 'FC-23', 'FC-25', 'FC-28', 'FC-34', 'FC-48'];
    // 3. the response window of each phase (seconds), the share of the pilot's time its normal tasks take, and the failure response times
    const WINDOW = { Standing: 900, Taxi: 300, Takeoff: 90, Climb: 300, Cruise: 900, Descent: 300, Approach: 180, Landing: 60 };
    const NORMAL_LOAD = 45;   // per cent of each pilot's time in a phase, shared out over that pilot's tasks
    const RESPONSE = { emergency: { reactionS: 2, execS: 8 }, nonnormal: { reactionS: 4, execS: 14 } };
    // 10. the crew actions the safety analysis counts on (the classification of these failure conditions takes credit for the response)
    const CREDIT = ['FC-04', 'FC-06', 'FC-07', 'FC-08', 'FC-13', 'FC-14', 'FC-31', 'FC-33', 'FC-36', 'FC-47', 'FC-49', 'FC-53', 'FC-56', 'FC-57', 'FC-59'];
    // 6, 8. the few answers that leave something open in the design (everything else meets the question)
    const GAPS = {
        'cd:Nose-wheel steering tiller': { d: 'The tiller is on the captain side only, so the first officer cannot steer on the strip. Accepted for now: the captain taxis; a second tiller is proposed for the design review.' },
        'ergo:Nose-wheel steering tiller': { reach: 'Out of the first officer\'s reach. See the 25.1302 finding on the same control.' },
        'cd:Head-up display, captain': { b: 'In blowing dust on the strip the symbology washes out against a bright background. Brightness and declutter to be tried in the simulator.' },
        'ergo:Fire handles and extinguisher switches': { view: 'The hold fire handle is above the overhead panel line; a short pilot must lean forward to read it. Move it down in the next panel revision.' }
    };
    const SA_GAPS = { 'Approach': { L1: 'On an unlit strip at night the surface cues come only from the landing lights (FC-41); a synthetic strip on the head-up display is proposed.' } };
    // 9. the minimum crew
    const MFC_ROLE = { fpc: 'PF', ca: 'Shared', nav: 'PM', comm: 'PM', sys: 'PM', cmd: 'Shared' };
    const MFC_BEDFORD = { fpc: '4', ca: '3', nav: '3', comm: '3', sys: '4', cmd: '3' };
    const MFC_FACTORS = [
        'Acceptable: every control needed in flight is within reach of both seats except the steering tiller, which is a ground-only control',
        'Acceptable: alerts are on the two primary displays and the alerting display, each with the action that clears it',
        'Acceptable: the payload and nose door procedures are ground tasks; fuel management is automatic with a crew check every hour',
        'Acceptable: the worst phase, landing with an engine failure, stays under the 80 per cent line for both pilots',
        'Acceptable: systems are monitored by the alerting computers; the crew checks the synoptics at each waypoint',
        'Acceptable: no in-flight task needs a pilot away from the seat; the hold is checked by camera',
        'Acceptable: hydraulic and electrical isolation is automatic, with the crew confirming on the synoptic',
        'Needs attention: remote routes need HF voice and datalink; the workload is acceptable with two pilots, not with one',
        'Acceptable: either pilot can fly and manage the systems if the other is incapacitated, with the autopilot engaged',
        'Acceptable: the flight deck follows a common transport layout; type training covers the payload and nose door'
    ];
    const PLAN_FOR = { 'ASM-AC-001': 'sim', 'ASM-HF-001': 'analysis', 'ASM-HF-002': 'sim', 'ASM-HF-003': 'sim', 'ASM-HF-004': 'flight', 'ASM-HF-005': 'analysis' };

    function fill() {
        const H = window.SLHfAuto, U = window.SLAutopilotUI;
        if (!H || !U || !U.fillAs) return { ok: false, problems: ['The HF Autopilot is not in this build.'] };
        return U.fillAs(SIGNER, SIGNED_AT, function () { return fillNow(H); });
    }
    function fillNow(H) {
        const problems = [], env = n => { try { return window.SLEnv.get(n); } catch (_) { return undefined; } };
        const fns = (env('acFunctionsData') || []), fhas = (env('acFhaData') || []);
        const fnOf = sub => fns.find(f => f.subId === sub), sevRank = { Catastrophic: 5, Hazardous: 4, Major: 3, Minor: 2 };
        const worstFc = sub => fhas.filter(f => f.subId === sub).sort((a, b) => (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0))[0];
        const ok = (r, what) => { if (r === false) problems.push(what); };
        // 1
        Object.keys(ALLOC).forEach(sub => { const f = fnOf(sub); if (!f) { problems.push('No function ' + sub); return; } PHASES.forEach((p, i) => ok(H.setAlloc(f.internalId, p, CODE[ALLOC[sub][i]]), 'alloc ' + sub + ' ' + p)); });
        // 2
        Object.keys(WHO).forEach(sub => { const f = fnOf(sub); if (f) ok(H.answer('who:' + f.internalId, WHO[sub]), 'who ' + sub); });
        fhas.forEach(fc => { if (!fc.fcId) return; const pick = NO_RECOVERY.indexOf(fc.fcId) >= 0 ? 'none' : EMERGENCY.indexOf(fc.fcId) >= 0 ? 'emergency' : 'nonnormal'; H.answer('tidf:' + fc.fcId, pick); });
        // 3
        let res = H.compute();
        res.byKey.load.questions.filter(q => q.kind === 'loadphase').forEach(q => {
            ok(H.setPhase(q.phase, 'window', null, WINDOW[q.phase]), 'window ' + q.phase);
            const n = { PF: 0, PM: 0 }; q.tasks.forEach(t => { if (t.crew === 'PF' || t.crew === 'Both') n.PF++; if (t.crew === 'PM' || t.crew === 'Both') n.PM++; });
            const each = Math.max(1, Math.floor(NORMAL_LOAD / Math.max(1, n.PF, n.PM)));
            q.tasks.forEach(t => ok(H.setPhase(q.phase, 'share', t.taskId, each), 'share ' + q.phase));
            H.setPhase(q.phase, 'basis', null, BASIS);
        });
        res.byKey.load.questions.filter(q => q.kind === 'proc').forEach(q => {
            const fcId = q.task.fcId, r = RESPONSE[EMERGENCY.indexOf(fcId) >= 0 ? 'emergency' : 'nonnormal'];
            ok(H.setLoad(fcId, 'reactionS', r.reactionS), 'reaction ' + fcId); H.setLoad(fcId, 'execS', r.execS); H.setLoad(fcId, 'basis', BASIS);
            ['visual', 'cognitive', 'motor'].forEach(ch => H.setLoad(fcId, 'channel', ch));
        });
        // 4: the five ways each task goes wrong
        res = H.compute();
        res.byKey.err.questions.forEach(q => {
            const g = q.task, own = g.fcId || ((worstFc((fns.find(f => String(f.internalId) === String(g.fnId)) || {}).subId) || {}).fcId) || 'nse';
            const set = (mode, v, d, r) => { H.setErr(g.key, mode, 'v', v); if (v === 'yes') { H.setErr(g.key, mode, 'detect', d); H.setErr(g.key, mode, 'recover', r); H.setErr(g.key, mode, 'fc', own); } };
            if (g.fcId) { set('omission', 'yes', 'alert', 'procedure'); set('commission', 'yes', 'xcheck', 'procedure'); set('timing', 'yes', 'alert', 'procedure'); set('sequence', 'no'); set('selection', 'yes', 'xcheck', 'procedure'); }
            else { set('omission', 'yes', 'xcheck', 'procedure'); set('commission', 'no'); set('timing', 'yes', 'response', 'procedure'); set('sequence', 'no'); set('selection', 'yes', 'response', 'protection'); }
        });
        // 5: the alert for each failure condition
        res.byKey.alert.questions.forEach(q => {
            const fc = q.fc, sev = fc.severity, tactile = /^FC-4[789]$/.test(fc.fcId);
            const pick = sev === 'Catastrophic' || sev === 'Hazardous' ? 'warning' : sev === 'Major' ? 'caution' : 'advisory';
            H.setAlert(fc.fcId, 'pick', pick); H.setAlert(fc.fcId, 'modality', 'visual'); if (pick !== 'advisory') H.setAlert(fc.fcId, 'modality', 'aural'); if (tactile) H.setAlert(fc.fcId, 'modality', 'tactile');
        });
        // 6, 8: every control and display (the alerts are on the list now), 7: situation awareness
        res = H.compute();
        ['cd', 'ergo'].forEach(stage => res.byKey[stage].questions.forEach(q => q.rows.forEach(r => {
            const gap = (GAPS[stage + ':' + q.subject] || {})[r.id];
            H.setGrid(q.id, r.id, 'v', gap ? 'gap' : 'ok'); if (gap) H.setGrid(q.id, r.id, 'note', gap);
        })));
        res.byKey.sa.questions.forEach(q => q.rows.forEach(r => { const gap = (SA_GAPS[q.phase] || {})[r.id]; H.setGrid(q.id, r.id, 'v', gap ? 'gap' : 'ok'); if (gap) H.setGrid(q.id, r.id, 'note', gap); }));
        // 9
        Object.keys(MFC_ROLE).forEach(k => { H.setMfc('role', k, MFC_ROLE[k]); H.setMfc('bedford', k, MFC_BEDFORD[k]); });
        MFC_FACTORS.forEach((t, i) => H.setMfc('factor', i, t));
        H.setMfc('crew', '', '2');
        // 10
        res = H.compute();
        res.byKey.credit.questions.forEach(q => {
            if (/^credit:/.test(q.id)) { const fcId = (q.why.match(/FC-\d+/) || [''])[0]; H.answer(q.id, CREDIT.indexOf(fcId) >= 0 ? 'yes' : 'no'); }
        });
        res = H.compute();
        res.byKey.credit.questions.forEach(q => { if (/^plan:/.test(q.id) && !q.done) H.answer(q.id, PLAN_FOR[q.asm.asmId] || 'sim'); });
        // sign each step, in order
        H.STAGES.forEach(st => { if (!H.sign(st.key)) { const c = H.coverage().find(x => x.key === st.key); problems.push('Step ' + st.n + ' not signed: ' + (c ? c.answered + ' of ' + c.questions + ' answered' : '')); } });
        return { ok: !problems.length, problems: problems };
    }
    window.SLHl1Hf = { VERSION: VERSION, fill: fill };
})();
