/* ============================================================================
 * demo/hl1_plans.js (23 Nov 2026): the Aeolus HL-1 demo with its three program plans answered in the Plan Autopilot:
 * the System Safety Program Plan, the Human Factors Plan and the RAM Plan, each "Ready to issue".
 *
 * Waqas, 23 Nov 2026: "lets fill those out in full ... a full scale demo that any customer can use".
 *
 * NOTHING HERE IS A RESULT. These are the program's choices, one per Plan Autopilot question, as the HL-1 program would
 * make them (a new Part 25 type, FAA first with EASA validation, special conditions for size, the nose door, the payload
 * restraint and semi-prepared operation). fill() answers them through the Plan Autopilot and applies the settings the
 * plans set, signed by the chief safety engineer on a fixed date (SLAutopilotUI.fillAs). The plan text, its diagrams and
 * its tables are written by the tool from these choices.
 * ==========================================================================*/
(function () {
    'use strict';
    var VERSION = '1.0';
    const SIGNER = 'J. Okafor', SIGNED_AT = '2026-11-23T15:30:00.000Z';
    const ANSWERS = {
        // System Safety Program Plan
        'sspp.kind': 'new', 'sspp.authority': 'faa|easa', 'sspp.second': 'validation', 'basis.reg': 'Part 25', 'basis.mission': '3', 'basis.special': 'sc',
        'sspp.org': 'mixed', 'sspp.owner': 'cse', 'sspp.suppliers': 'theirs', 'sspp.deleg': 'der', 'sspp.reqs': 'both', 'sspp.reviews': 'srr_pdr_cdr',
        'sspp.signoff': 'indep_board', 'sspp.maint': 'ccmr|msg3', 'sspp.mmel': 'yes', 'sspp.testkind': 'lab|ironbird|ground|flight|sim', 'sspp.test': 'link',
        'sspp.afha': 'both', 'sspp.pasa': 'yes', 'sspp.combined': 'interdep|mac|coffe', 'sspp.sfha': 'mixed', 'sspp.pssa': 'fta|markov', 'sspp.quant': 'cathaz',
        'sspp.notg': 'no', 'sspp.fmea': 'ffmea|ppfmea|fmes', 'sspp.ssa': 'trees', 'sspp.asa': 'both', 'sspp.dal': 'indep', 'sspp.idal': 'arch',
        'sspp.items': 'sw|aeh|cots', 'sspp.indep': 'ledger', 'sspp.cma': 'yes', 'sspp.pra': 'rotor|tire|bird|fire|hirf|fluid|ice', 'sspp.zsa': 'cad',
        'sspp.stpa': 'yes', 'sspp.cea': 'yes', 'sspp.levels': 'each', 'sspp.transition': 'both', 'sspp.indepvv': 'group', 'sspp.valm': 'trace|analysis|review|test',
        'sspp.pa': 'qa', 'sspp.show': 'both', 'sspp.rmtool': 'jama', 'sspp.mbse': 'syslab', 'sspp.toolq': 'review', 'sspp.ai': 'accept', 'sspp.cm': 'gates',
        'sspp.ccat': 'dal', 'sspp.soi': 'soi', 'sspp.keep': 'life',
        // Human Factors Plan
        'hfp.need': 'full', 'hfp.basis': '25|cs25', 'hfp.crew': 'two', 'hfp.alloc': 'phase', 'hfp.workload': 'share|bedford', 'hfp.error': 'qual', 'hfp.alerts': '1322',
        'hfp.eval': 'analysis|mock|sim|flight', 'hfp.pilots': 'authority', 'hfp.mfc': 'appd', 'hfp.credit': 'asm', 'hfp.feed': 'events',
        // RAM Plan
        'ramp.need': 'full', 'ramp.rates': 'supplier|nprd', 'ramp.env': 'mix', 'ramp.alloc': 'yes', 'ramp.growth': 'crow', 'ramp.fracas': 'sl', 'ramp.life': 'yes',
        'ramp.mx': 'mttr|test', 'ramp.msg3': 'msg3', 'ramp.lcc': 'yes', 'ramp.sw': 'no', 'ramp.sneak': 'no', 'ramp.eta': 'yes'
    };
    function fill() {
        const P = window.SLPlanAuto, U = window.SLAutopilotUI;
        if (!P || !U || !U.fillAs) return { ok: false, problems: ['The Plan Autopilot is not in this build.'] };
        return U.fillAs(SIGNER, SIGNED_AT, function () {
            const problems = [];
            P.PLANS.forEach(function (plan) {
                // every question this program answers (one that the basis keeps out of view, such as the Part 23 level, is not in the list)
                P.BY[plan.key].qs.forEach(function (q) {
                    const v = ANSWERS[q.k]; if (v == null) return;
                    try { P.answer(q.k, v); } catch (e) { problems.push(q.k + ': ' + e.message); }
                });
                try { const r = P.apply(plan.key); if (r && r.errs && r.errs.length) problems.push(plan.code + ' apply: ' + r.errs.join('; ')); } catch (e) { problems.push(plan.code + ' apply: ' + e.message); }
                const st = P.status(plan.key);
                if (st.state !== 'ready') problems.push(plan.code + ' is ' + st.label + (st.miss ? ': ' + P.gaps(plan.key).join('; ') : '') + (st.mm ? ': ' + P.mismatches(plan.key).map(function (m) { return m.msg; }).join('; ') : ''));
            });
            return { ok: !problems.length, problems: problems };
        });
    }
    window.SLHl1Plans = { VERSION: VERSION, answers: ANSWERS, fill: fill };
})();
