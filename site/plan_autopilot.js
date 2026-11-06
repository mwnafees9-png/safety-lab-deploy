// plan_autopilot.js (SLPlanAuto v1.0, 6 Nov 2026): the Plan Autopilot. The program's three safety plans, written by
// answering questions, with the same layout as the Sys Lab Planning Autopilot.
//
// Waqas: "program planing in safety lab needs to have the same interface as sys lab planing auto-pilot, questions to
// be in conjunction with DA assurance and the tool linkings, there's a copy of ARP4754 B which has an example of safety
// program plan I want our program planing to replicate that too"; "in planing I want similar treatment for the HF plan
// and RAM plan too".
//
// The plans:
//   · System Safety Program Plan (SSPP). Its sections follow the layout of the example aircraft-level safety program
//     plan in ARP4754B Appendix B (scope, organization, responsibilities, the assessments and methods, common cause),
//     written in our own words: no text of the standard is copied. Then the development assurance objectives, the
//     tools, the tailoring and the records.
//   · Human Factors Plan, built around the ten steps of the HF Autopilot.
//   · Reliability and Maintainability (RAM) Plan.
//
// Every question shows the development assurance objectives it helps meet (the ARP4754B process objectives, as the
// Objectives matrix lists them) and the Safety Lab page that produces the evidence. An answer marked "Sets Safety Lab"
// changes Safety Lab only when the person applies the plan's settings, after seeing each one as it is and as it will
// be: which analysis lanes are in the program, the method slots, and the declared tools. Every other answer is written
// into the plan. A question not answered is written into the plan as "To be decided" and listed as a gap, never
// guessed. The plans are read from the project each time they are opened, so they never go stale.
//
// Data: projectConfig.planAuto = { answers: { key: value }, who: { key: { by, at } }, applied: { key: { at, by } } }.
// Turning a lane off never deletes its data (program_plan.js doctrine); an expected lane holding data is turned off
// with a signed tailoring entry that names the plan answer.
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function U() { return root.SLAutopilotUI || null; }
    function PP() { return root.PROGRAM_PLAN || null; }
    function g(name) { try { return root.SLEnv && root.SLEnv.get ? root.SLEnv.get(name) : undefined; } catch (_) { return undefined; } }
    function arr(name) { var v = g(name); if (v === undefined) { try { v = root[name]; } catch (_) {} } return Array.isArray(v) ? v : []; }
    function pc() { var v = g('projectConfig'); if (v === undefined) { try { v = root.projectConfig; } catch (_) {} } if (v === undefined) { try { v = projectConfig; } catch (_) {} } return v || null; }   // eslint-disable-line no-undef
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function now() { return new Date().toISOString(); }
    function who() { return U() ? U().who() : 'Engineer'; }
    function save() { if (U()) U().save(); else { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} } }
    function fail(m) { var e = new Error(m); e.userFacing = true; return e; }
    function store() {
        var p = pc(); if (!p) return { answers: {}, who: {}, applied: {} };
        if (!p.planAuto || typeof p.planAuto !== 'object') p.planAuto = {};
        var s = p.planAuto; if (!s.answers) s.answers = {}; if (!s.who) s.who = {}; if (!s.applied) s.applied = {};
        return s;
    }
    function A(k) { return store().answers[k] || ''; }
    function picked(k) { var v = A(k); return v ? String(v).split('|') : []; }
    function lcFirst(s) { s = String(s || ''); return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
    function listJoin(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function projName() { return safe(function () { return g('projectName') || root.projectName || ''; }, '') || 'this program'; }

    // ---- the project, read live ---------------------------------------------------------------------------------
    function basis() { return safe(function () { return PP().basisNow(); }, '') || 'not set'; }
    function counts() {
        var sys = arr('systemsData');
        return {
            functions: arr('acFunctionsData').length, systems: sys.length, afha: arr('acFhaData').length,
            sfha: sys.reduce(function (n, s) { return n + (Array.isArray(s.fha) ? s.fha.length : 0); }, 0),
            trees: arr('ftaPages').length, cma: arr('cmaData').length, pra: arr('praData').length, zsa: arr('zsaData').length,
            fmea: arr('fmeaData').length, reqs: arr('acReqData').length + sys.reduce(function (n, s) { return n + (Array.isArray(s.req) ? s.req.length : 0); }, 0),
            asm: arr('acAssumptionsData').length, items: arr('itemsData').length, phases: arr('flightPhasesData').length
        };
    }
    var RANK = { Catastrophic: 5, Hazardous: 4, Major: 3, Minor: 2, 'No Safety Effect': 1 };
    function topSeverity() {
        var all = arr('acFhaData').concat(arr('systemsData').reduce(function (a, s) { return a.concat(Array.isArray(s.fha) ? s.fha : []); }, []));
        var best = ''; all.forEach(function (f) { if ((RANK[f.severity] || 0) > (RANK[best] || 0)) best = f.severity; }); return best;
    }
    function topDal() { var sv = topSeverity(); return { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', 'No Safety Effect': 'E' }[sv] || ''; }
    function laneOn(id) { return safe(function () { return PP().laneOn(id); }, false); }
    function laneName(id) { return safe(function () { return PP().CATALOGUE.filter(function (l) { return l.id === id; })[0].name; }, id); }
    function laneItems(id) { return safe(function () { return PP().laneData(id); }, 0) || 0; }

    // ---- the development assurance objectives (objectives_matrix.js: our one-line summaries of ARP4754B App A) ----
    function objectives() { return safe(function () { return root.appAMatrixRows(); }, []) || []; }
    var STATE_WORD = { satisfied: 'Met', attested: 'Signed', partial: 'Partly', open: 'Not yet' };

    // ---- the pages the evidence comes from ------------------------------------------------------------------------
    var PAGES = {
        spp: 'Program Planning', defs: 'Certification basis', phases: 'Flight phases', 'ac-func': 'Aircraft functions', 'ac-fha': 'AFHA', pasa: 'PASA',
        'sys-dir': 'Systems', fta: 'Fault trees', markov: 'Markov models', fmea: 'FMEA', fmes: 'FMES', asa: 'Aircraft Safety Assessment', cma: 'Common modes (CMA)',
        pra: 'Particular risks (PRA)', zsa: 'Zonal safety (ZSA)', stpa: 'STPA', cea: 'Cascading effects', ccmr: 'Latent failures (CCMR)', mmel: 'Dispatch relief (MMEL)',
        'ac-req': 'Aircraft requirements', assumptions: 'Assumptions', validation: 'Validation', 'vv-status': 'Verification status', 'dal-ref': 'DAL credit reference',
        ipledger: 'Independence ledger', cm: 'Configuration management', review: 'Reviews', moc: 'Means of compliance', appa: 'Objectives matrix', ai: 'AI Assistant',
        'hfa-auto': 'HF Autopilot', 'hfa-results': 'HF results', 'ram-hub': 'RAM overview', 'ram-rel': 'Reliability prediction and FRACAS', 'ram-predict': 'Parts count',
        'ram-alloc': 'Reliability allocation', 'ram-growth': 'Reliability growth', 'ram-mx': 'Maintainability', 'ram-test': 'Testability', 'ram-msg3': 'MSG-3', lcc: 'Life-cycle cost',
        swrel: 'Software reliability', sneak: 'Sneak circuit', 'golden-thread': 'Golden Thread', dashboard: 'Dashboard', baselines: 'Baselines', reqif: 'ReqIF exchange', items: 'Items'
    };
    function pageName(t) { return PAGES[t] || t; }

    // ---- what an answer sets in Safety Lab --------------------------------------------------------------------------
    // a set: { what, now(), after(v) (null: this answer leaves it as it is), apply(v, by, plan) }
    function LANE(id, onFor, offFor) {
        return { what: function () { return laneName(id) + ' in the program'; }, now: function () { return laneOn(id) ? 'In' : 'Out'; },
            after: function (v) { var vs = String(v).split('|'); if (onFor.some(function (o) { return vs.indexOf(o) >= 0; })) return 'In'; if (!offFor || offFor.some(function (o) { return vs.indexOf(o) >= 0; })) return 'Out'; return null; },
            apply: function (v, by, plan, q) {
                var on = this.after(v) === 'In';
                PP().setLane(id, on, on ? {} : { rationale: 'The ' + plan.title + ' says: ' + optLabel(q, v) + '.', sig: by });
            } };
    }
    // SPP_SLOTS is a top-level const of bindings_modules.js: in the page's shared scope, not on window
    function slotDef(id) { var L = null; try { L = typeof SPP_SLOTS !== 'undefined' ? SPP_SLOTS : root.SPP_SLOTS; } catch (_) { L = root.SPP_SLOTS; } return (L || []).filter(function (x) { return x.id === id; })[0] || null; }   // eslint-disable-line no-undef
    function SLOT(id, label, map) {
        return { what: function () { return label + ' (method)'; },
            now: function () { var s = safe(function () { return pc().safetyProgramPlan.slots[id]; }, null); var def = slotDef(id); var i = s != null ? s : def ? def.dflt : null; return def && i != null ? def.options[i] : ''; },
            after: function (v) { var def = slotDef(id); return def && map[v] != null ? def.options[map[v]] : null; },
            apply: function (v) { var p = pc(); if (!p.safetyProgramPlan) p.safetyProgramPlan = { slots: {}, notes: '' }; if (!p.safetyProgramPlan.slots) p.safetyProgramPlan.slots = {}; p.safetyProgramPlan.slots[id] = map[v]; } };
    }
    var RM_NAMES = { jama: 'Jama Connect', doors: 'IBM DOORS Classic', 'doors-next': 'IBM DOORS Next', polarion: 'Siemens Polarion', codebeamer: 'PTC Codebeamer', none: 'None' };
    var MBSE_NAMES = { cameo: 'Cameo Systems Modeler', capella: 'Capella', syslab: 'Sys Lab', none: 'None' };
    function TOOL(section, label, names) {
        var cur = function () { var t = safe(function () { return root.declaredToolchain(); }, null); if (!t) return ''; var r = t[section] || {}; return r.tool === 'other' ? (r.toolOther || 'Other') : (names[r.tool] || (r.tool ? r.tool : 'Not declared')); };
        return { what: function () { return label + ' (declared tool)'; }, now: cur,
            after: function (v) { return names[v] || null; },
            apply: function (v) {
                var p = pc(); if (!p.toolchain) safe(function () { root.declaredToolchain(); }, null);
                if (!p.toolchain) p.toolchain = { sra: { tool: 'Safety Lab Aero' }, rm: { tool: '', mode: 'reqif' }, mbse: { tool: '' } };
                var r = p.toolchain[section] || (p.toolchain[section] = {});
                if (v === 'syslab') { r.tool = 'other'; r.toolOther = 'Sys Lab'; } else { r.tool = v === 'none' ? '' : v; delete r.toolOther; }
                r.by = ''; r.at = '';   // a changed declaration needs signing again on Program Planning
            } };
    }

    // ---- the questions ------------------------------------------------------------------------------------------
    // Q(k, sec, text, opts [[id, label, what it means]], txt {id: sentence} | fn(v), o: { da, tools, set, type, why, when })
    function Q(k, sec, text, opts, txt, o) { return Object.assign({ k: k, sec: sec, text: text, opts: opts, txt: txt, da: [], tools: [] }, o || {}); }
    var YN = function (y, n) { return [['yes', 'Yes', y], ['no', 'No', n]]; };

    var SSPP_SECS = ['Scope and purpose', 'How the safety program is organized', 'Safety responsibilities', 'The safety assessment process and its methods', 'Common cause analyses', 'Development assurance objectives', 'Tools', 'Tailoring', 'Records and changes to this plan'];
    var HFP_SECS = ['Scope and purpose', 'The crew and the operation', 'The human factors work through the design cycle', 'Workload and crew error', 'Evaluations and who does them', 'Minimum flight crew', 'Crew actions the safety analysis counts on', 'Development assurance objectives', 'Records and changes to this plan'];
    var RAMP_SECS = ['Scope and purpose', 'Reliability prediction and data sources', 'Allocation and growth', 'Failure reporting', 'Maintainability and testability', 'Scheduled maintenance and dispatch', 'Cost and other analyses', 'Development assurance objectives', 'Records and changes to this plan'];

    var PLANS = [
        { key: 'sspp', code: 'SSPP', title: 'System Safety Program Plan', secs: SSPP_SECS,
          basis: 'Follows the layout of the example safety program plan in ARP4754B Appendix B, in our own words; ARP4761A for the methods; the certification basis for the targets',
          qs: [
            Q('sspp.scope', 'Scope and purpose', 'What does this plan cover?', [['aircraft', 'The whole aircraft and every system on it', 'The plan runs from the aircraft FHA to the aircraft safety assessment.'], ['systems', 'Some systems only, for a supplier or a partner', 'The plan covers the named systems; the aircraft-level work belongs to the aircraft maker.'], ['change', 'A change to an aircraft already certified', 'The plan covers the changed functions and what they touch, and says what is kept from the original certification.']],
                { aircraft: 'This plan covers the whole aircraft and every system on it, from the aircraft functional hazard assessment to the aircraft safety assessment.', systems: 'This plan covers the systems the program supplies. The aircraft-level assessments belong to the aircraft maker; this program feeds them its system results.', change: 'This plan covers a change to an aircraft already certified: the functions the change adds or alters, and every function and system they touch. What is kept from the original certification is listed with the reason it still holds.' },
                { da: ['A1-1'], tools: ['spp', 'defs'] }),
            Q('sspp.org', 'How the safety program is organized', 'How is safety organized on the program?', [['central', 'One aircraft safety group does all of it', 'The group owns this plan and leads every assessment.'], ['embedded', 'A small aircraft safety group sets the method; system teams do their own assessments', 'The group reviews each system team\'s work at set points.'], ['supplier', 'Suppliers do their system assessments; the program\'s safety group brings them together', 'Each supplier works to this plan; the program reviews and integrates their results.']],
                { central: 'One aircraft safety group does the safety work for the whole program. It owns this plan, leads every assessment, and reports to the chief engineer.', embedded: 'A small aircraft safety group sets the methods in this plan and owns the aircraft-level assessments. Each system team does its own system assessments with a safety engineer in the team, and the aircraft safety group reviews that work at each design review.', supplier: 'Each system supplier does the safety assessments for what it supplies, working to this plan. The program\'s safety group writes the aircraft-level assessments, reviews every supplier\'s results, and brings them together.' },
                { da: ['A1-1', 'A1-3'], tools: ['sys-dir'] }),
            Q('sspp.owner', 'How the safety program is organized', 'Who owns this plan and signs changes to it?', [['cse', 'The chief safety engineer', ''], ['lead', 'The aircraft safety lead', ''], ['ce', 'The chief engineer', ''], ['cert', 'The certification manager', '']],
                function (v) { return 'This plan is owned by the ' + lcFirst(optLabelK('sspp.owner', v).replace(/^The /, '')) + ', who signs every change to it. A change to the plan is recorded with its reason before the work it affects starts.'; },
                { da: ['A1-1', 'A7-2'], tools: ['spp'] }),
            Q('sspp.reqs', 'Safety responsibilities', 'Where do the safety requirements live?', [['sl', 'In Safety Lab, traced to the failure condition each comes from', 'The requirements tool, if any, reads them from Safety Lab.'], ['rm', 'In the program\'s requirements tool, exchanged with Safety Lab', 'Safety Lab sends new safety requirements across and reads their status back.'], ['both', 'Written in Safety Lab, managed in the requirements tool', 'Safety Lab writes them and traces them; the requirements tool holds the baseline.']],
                { sl: 'Safety requirements are written and kept in Safety Lab, each traced to the failure condition, fault tree or common cause finding it comes from.', rm: 'Safety requirements are kept in the program\'s requirements tool. Safety Lab sends each new safety requirement across with its trace to the failure condition, and reads its status back.', both: 'Safety requirements are written in Safety Lab, traced to where each comes from, and sent to the program\'s requirements tool, which holds the baseline. Changes come back into Safety Lab.' },
                { da: ['A2-3', 'A2-4'], tools: ['ac-req', 'golden-thread'] }),
            Q('sspp.rmtool', 'Tools', 'Which requirements tool does the program use?', [['none', 'None: requirements stay in Safety Lab', ''], ['jama', 'Jama Connect', ''], ['doors', 'IBM DOORS Classic', ''], ['doors-next', 'IBM DOORS Next', ''], ['polarion', 'Siemens Polarion', ''], ['codebeamer', 'PTC Codebeamer', '']],
                function (v) { return v === 'none' ? 'The program keeps its requirements in Safety Lab; no separate requirements tool is used.' : 'The program\'s requirements tool is ' + RM_NAMES[v] + '. Requirements move between it and Safety Lab ' + (v === 'jama' ? 'through the live connection or by ReqIF.' : 'by ReqIF.'); },
                { da: ['A2-3', 'A6-2'], tools: ['reqif'], set: [TOOL('rm', 'Requirements management', RM_NAMES)] }),
            Q('sspp.mbse', 'Tools', 'Where does the system architecture come from?', [['syslab', 'Sys Lab', 'Functions and architecture come into Safety Lab from Sys Lab.'], ['cameo', 'Cameo Systems Modeler', 'Functions and architecture come in from the model by XMI.'], ['capella', 'Capella', 'Functions and architecture come in from the model by XMI.'], ['none', 'Safety Lab only', 'Functions and systems are written in Safety Lab.']],
                function (v) { return v === 'none' ? 'The aircraft functions and the systems are written in Safety Lab; no separate modeling tool is used.' : 'The aircraft functions and the system architecture come from ' + MBSE_NAMES[v] + ', and are brought into Safety Lab so the assessments work from the same model.'; },
                { da: ['A2-1', 'A2-2'], tools: ['ac-func', 'sys-dir'], set: [TOOL('mbse', 'Modeling tool', MBSE_NAMES)] }),
            Q('sspp.reviews', 'Safety responsibilities', 'When is the safety work presented at design reviews?', [['pdr_cdr', 'The PSSA at PDR, the SSA at CDR, with a safety review before each', ''], ['every', 'A safety item at every program review', ''], ['gates', 'Its own safety reviews, at each completion gate in Safety Lab', '']],
                { pdr_cdr: 'The preliminary safety assessments are presented at the preliminary design review and the system safety assessments at the critical design review. An engineering safety review is held before each, and its findings are closed or carried as actions.', every: 'Every program review has a safety item: what changed in the assessments since the last review, the open findings, and the requirements they raised.', gates: 'The safety work has its own reviews, one at each completion gate in Safety Lab. A gate passes only when its checklist is complete and a reviewer has signed it.' },
                { da: ['A1-2', 'A7-1'], tools: ['review', 'dashboard'] }),
            Q('sspp.signoff', 'Safety responsibilities', 'Who signs a completed assessment?', [['indep', 'Its author and a reviewer who did not write it', 'Every gate needs a second, independent signature.'], ['lead', 'The safety lead', ''], ['board', 'A safety review board', '']],
                { indep: 'Each assessment is signed by its author and by a reviewer who did not write it. A reviewer cannot sign work they wrote.', lead: 'Each assessment is signed by the safety lead once its checklist is complete.', board: 'Each assessment is signed by the safety review board after its review.' },
                { da: ['A7-1', 'A4-3', 'A5-3'], tools: ['review'] }),
            Q('sspp.maint', 'Safety responsibilities', 'How are safety-related maintenance tasks found?', [['ccmr', 'From the fault trees: every latent failure gets the longest check interval its target allows', 'Turns the latent failures (CCMR) lane on.'], ['msg3', 'Through MSG-3, with candidate tasks from the safety assessment', 'Turns the latent failures lane on and feeds MSG-3.'], ['none', 'None expected', 'Turns the latent failures lane off; its data is kept.']],
                { ccmr: 'Every latent failure in a Catastrophic or Hazardous fault tree is given the longest check interval at which its failure condition still meets its target. Those intervals become candidate certification maintenance requirements.', msg3: 'Latent failures found in the fault trees, with their longest allowed check intervals, are handed to the MSG-3 analysis as candidate tasks. The ones the safety case depends on are kept as certification maintenance requirements.', none: 'The program expects no safety-related maintenance tasks: no failure condition depends on a hidden failure being found by a check.' },
                { da: ['A3-3'], tools: ['ccmr'], set: [LANE('ccmr', ['ccmr', 'msg3'], ['none'])] }),
            Q('sspp.mmel', 'Safety responsibilities', 'Will the aircraft have a master minimum equipment list (MMEL)?', YN('Turns the dispatch relief lane on.', 'Turns the dispatch relief lane off; its data is kept.'),
                { yes: 'The aircraft will have a master minimum equipment list. Each item proposed for dispatch with it inoperative is checked against the safety assessment before it goes on the list.', no: 'The aircraft will not have a master minimum equipment list.' },
                { da: ['A3-3'], tools: ['mmel'], set: [LANE('ram-mmel', ['yes'], ['no'])] }),
            Q('sspp.test', 'Safety responsibilities', 'How are safety claims that need a test tracked?', [['link', 'Each is linked to a verification activity and closed with its result', ''], ['ssa', 'Results are gathered at the system safety assessment', '']],
                { link: 'Each safety requirement or assumption that needs a test is linked to a verification activity, and is closed only when that activity\'s result is recorded.', ssa: 'Test results that support the safety case are gathered and checked when the system safety assessments are written.' },
                { da: ['A5-1', 'A4-2'], tools: ['vv-status', 'assumptions'] }),
            Q('sspp.afha', 'The safety assessment process and its methods', 'How is the aircraft FHA done?', [['functions', 'From the aircraft function list: every function, every flight phase', ''], ['workshop', 'In workshops with pilots and engineers, recorded function by function', ''], ['both', 'Drafted from the function list, then checked in workshops', '']],
                { functions: 'The aircraft functional hazard assessment works through the aircraft function list: each function\'s loss and malfunction in every flight phase, classified by its effect on the aircraft, the crew and the occupants.', workshop: 'The aircraft functional hazard assessment is done in workshops with pilots and engineers, one function at a time, and each failure condition is recorded with its classification and its reason.', both: 'The aircraft functional hazard assessment is drafted from the aircraft function list, each function in every flight phase, and then checked in workshops with pilots and engineers.' },
                { da: ['A3-1', 'A2-1'], tools: ['ac-func', 'ac-fha', 'phases'] }),
            Q('sspp.pasa', 'The safety assessment process and its methods', 'Is a preliminary aircraft safety assessment (PASA) done?', YN('The aircraft architecture is checked against the aircraft failure conditions before the systems are designed.', 'The aircraft-level checks are left to the aircraft safety assessment.'),
                { yes: 'A preliminary aircraft safety assessment checks the aircraft architecture against the aircraft failure conditions, including those that involve more than one system, and sets the safety requirements the systems inherit.', no: 'No preliminary aircraft safety assessment is done; the reason is recorded in the tailoring section.' },
                { da: ['A3-2'], tools: ['pasa'] }),
            Q('sspp.combined', 'The safety assessment process and its methods', 'How are failure conditions that involve more than one system handled?', [['mac', 'From the model of how the systems combine (compiled)', ''], ['coffe', 'By hand, case by case', ''], ['hybrid', 'From the model, with the cases it cannot answer done by hand', '']],
                { mac: 'Failure conditions that involve more than one system are worked out from the model of how the systems combine.', coffe: 'Failure conditions that involve more than one system are worked through case by case by the safety engineers.', hybrid: 'Failure conditions that involve more than one system are worked out from the model of how the systems combine; the cases the model cannot answer are worked by hand and signed.' },
                { da: ['A3-2'], tools: ['pasa'], set: [SLOT('combinedEffects', 'Failure conditions across systems', { mac: 0, coffe: 1, hybrid: 2 })] }),
            Q('sspp.sfha', 'The safety assessment process and its methods', 'Who writes the system FHAs?', [['teams', 'Each system team, with its safety engineer', ''], ['safety', 'The safety group', ''], ['supplier', 'The system supplier', '']],
                { teams: 'Each system team writes its system functional hazard assessment with its safety engineer, from the system functions and the aircraft failure conditions the system takes part in.', safety: 'The safety group writes every system functional hazard assessment.', supplier: 'Each system supplier writes the system functional hazard assessment for what it supplies; the program checks it against the aircraft failure conditions.' },
                { da: ['A3-1'], tools: ['sys-dir'] }),
            Q('sspp.pssa', 'The safety assessment process and its methods', 'How are the system architectures shown to meet their targets (PSSA)?', [['fta', 'Fault trees, quantified for Catastrophic and Hazardous', ''], ['markov', 'Fault trees, with Markov models where repair or the order of failures matters', 'Turns the Markov lane on.']],
                { fta: 'Each system architecture is checked with fault trees, quantified exactly for every Catastrophic and Hazardous failure condition, and qualitatively below that.', markov: 'Each system architecture is checked with fault trees, quantified exactly for every Catastrophic and Hazardous failure condition. Where repair, a sequence of failures or a time on a degraded mode matters, a Markov model is attached to the tree.' },
                { da: ['A3-2'], tools: ['fta', 'markov'], set: [SLOT('quantification', 'Quantitative method', { fta: 0, markov: 1 }), LANE('markov', ['markov'], ['fta'])] }),
            Q('sspp.fmea', 'The safety assessment process and its methods', 'Which FMEAs support the system safety assessments?', [['ffmea', 'Functional FMEA', 'Turns the functional FMEA lane on.'], ['ppfmea', 'Piece-part (hardware) FMEA', 'Turns the piece-part FMEA lane on.'], ['fmes', 'A failure modes summary (FMES) feeding the fault trees', 'Turns the FMES lane on.']],
                function (v) { var m = { ffmea: 'functional FMEAs', ppfmea: 'piece-part FMEAs', fmes: 'a failure modes summary (FMES) that feeds the fault trees' }; return 'The system safety assessments are supported by ' + listJoin(String(v).split('|').map(function (x) { return m[x]; }).filter(Boolean)) + '.'; },
                { type: 'checks', da: ['A3-3'], tools: ['fmea', 'fmes'], set: [LANE('ffmea', ['ffmea'], null), LANE('ppfmea', ['ppfmea'], null), LANE('fmes', ['fmes'], null)] }),
            Q('sspp.ssa', 'The safety assessment process and its methods', 'How is the as-built design shown to meet its targets (SSA)?', [['trees', 'The same fault trees with the as-built failure rates and the verification results', ''], ['new', 'New verification trees built from the design as built', '']],
                { trees: 'The system safety assessments re-run the fault trees with the as-built failure rates and exposure times, and show each failure condition meets its target with the verification results attached.', new: 'The system safety assessments build verification fault trees from the design as built, and show each failure condition meets its target.' },
                { da: ['A3-3', 'A5-2'], tools: ['fta', 'asa'] }),
            Q('sspp.asa', 'The safety assessment process and its methods', 'How are the aircraft-level fault trees made?', [['compiled', 'Compiled from the model of how the systems combine', ''], ['authored', 'Written by hand and checked against the model', ''], ['both', 'Both, compared with each other', '']],
                { compiled: 'The aircraft-level fault trees are compiled from the model of how the systems combine.', authored: 'The aircraft-level fault trees are written by the safety engineers and checked against the model of how the systems combine.', both: 'The aircraft-level fault trees are both compiled from the model and written by hand, and the two are compared; any difference is explained before the aircraft safety assessment is signed.' },
                { da: ['A3-3'], tools: ['asa'], set: [SLOT('aircraftTrees', 'Aircraft-level fault trees', { compiled: 0, authored: 1, both: 2 })] }),
            Q('sspp.dal', 'The safety assessment process and its methods', 'Can a function or item DAL be lower than its worst failure condition asks?', [['indep', 'Yes, where independence allows it, the claim checked by a common mode analysis', 'The DAL takes the reduction at once, marked "CMA pending" until the CMA closes it.'], ['no', 'No: every DAL is what the worst failure condition asks', '']],
                { indep: 'Function and item development assurance levels start from the worst failure condition each contributes to. A lower level is taken only where the architecture gives the independence that allows it; the claim is recorded, the level is marked "CMA pending", and a common mode analysis must show the independence holds before the level counts.', no: 'Every function and item development assurance level is the level its worst failure condition asks for; no level is lowered.' },
                { da: ['A3-2', 'A3-5'], tools: ['dal-ref', 'cma'] }),
            Q('sspp.indep', 'The safety assessment process and its methods', 'How is independence between functions and items tracked?', [['ledger', 'A ledger of each independence claim, with the CMA', ''], ['cma', 'In the CMA worksheets only', '']],
                { ledger: 'Every independence claim is kept in a ledger with its basis and the common mode analysis that checks it. A claim the analysis cannot support is flagged at once and the levels that depend on it are raised.', cma: 'Independence claims are recorded and checked in the common mode analysis worksheets.' },
                { da: ['A3-5'], tools: ['ipledger', 'cma'], set: [SLOT('independence', 'Independence evaluation', { ledger: 0, cma: 1 }), LANE('ipledger', ['ledger'], ['cma'])] }),
            Q('sspp.cma', 'Common cause analyses', 'Is a common mode analysis (CMA) done?', YN('Turns the CMA lane on.', 'Turns the CMA lane off; its data is kept.'),
                { yes: 'A common mode analysis checks every independence the fault trees and the development assurance levels count on: common design, common software, common manufacture, common maintenance and common installation.', no: 'No common mode analysis is done; the reason is in the tailoring section.' },
                { da: ['A3-4', 'A3-5'], tools: ['cma'], set: [LANE('cma', ['yes'], ['no'])] }),
            Q('sspp.pra', 'Common cause analyses', 'Is a particular risk analysis (PRA) done?', YN('Turns the PRA lane on.', 'Turns the PRA lane off; its data is kept.'),
                { yes: 'A particular risk analysis checks the events outside the systems that could defeat their independence: rotor burst, tire and wheel failure, bird strike, fire, lightning and high-intensity radiated fields, and fluid leaks.', no: 'No particular risk analysis is done; the reason is in the tailoring section.' },
                { da: ['A3-4'], tools: ['pra'], set: [LANE('pra', ['yes'], ['no'])] }),
            Q('sspp.zsa', 'Common cause analyses', 'Is a zonal safety analysis (ZSA) done?', [['cad', 'Yes, from the CAD model and its zones', 'Turns the ZSA lane on.'], ['list', 'Yes, from a zone list and drawings', 'Turns the ZSA lane on.'], ['no', 'No', 'Turns the ZSA lane off; its data is kept.']],
                { cad: 'A zonal safety analysis checks each zone of the aircraft, read from the CAD model, for installation and maintenance errors and for one system\'s failure harming another nearby.', list: 'A zonal safety analysis checks each zone of the aircraft, from the zone list and the installation drawings, for installation and maintenance errors and for one system\'s failure harming another nearby.', no: 'No zonal safety analysis is done; the reason is in the tailoring section.' },
                { da: ['A3-4'], tools: ['zsa'], set: [LANE('zsa', ['cad', 'list'], ['no'])] }),
            Q('sspp.stpa', 'Common cause analyses', 'Are hazards from the way systems work together looked at with STPA?', YN('Turns the STPA lane on.', 'Turns the STPA lane off; its data is kept.'),
                { yes: 'A system-theoretic process analysis (STPA) looks for hazards that come from the way the systems, the crew and the automation work together, rather than from a part failing.', no: 'STPA is not used.' },
                { da: ['A3-1'], tools: ['stpa'], set: [LANE('stpa', ['yes'], ['no'])] }),
            Q('sspp.cea', 'Common cause analyses', 'Are cascading failures traced from one system into others?', YN('Turns the cascading effects lane on.', 'Turns the cascading effects lane off; its data is kept.'),
                { yes: 'A failure in one system is traced through the interfaces into the systems that depend on it, and the cascade is checked against the failure conditions.', no: 'Cascading failures are covered inside each system\'s fault trees; no separate tracing is done.' },
                { da: ['A3-4'], tools: ['cea'], set: [LANE('cea', ['yes'], ['no'])] }),
            Q('sspp.indepvv', 'Development assurance objectives', 'Who does the independent checks that DAL A and B ask for in validation and verification?', [['peer', 'An engineer from another team who did not write the work', ''], ['group', 'A separate validation and verification group', ''], ['der', 'A designated engineering representative or the customer', '']],
                { peer: 'Where a development assurance level asks for validation or verification to be done independently, it is done by an engineer from another team who did not write the work. The reviewer\'s name is recorded with each check.', group: 'Where a development assurance level asks for validation or verification to be done independently, it is done by a separate validation and verification group outside the design team.', der: 'Where a development assurance level asks for validation or verification to be done independently, it is done or witnessed by a designated engineering representative or the customer.' },
                { da: ['A4-3', 'A5-3', 'A4-1', 'A5-1'], tools: ['validation', 'vv-status'] }),
            Q('sspp.pa', 'Development assurance objectives', 'Who does process assurance?', [['qa', 'The quality organization, outside the engineering line', ''], ['eng', 'An engineer from outside the program', ''], ['third', 'An independent company', '']],
                { qa: 'Process assurance is done by the quality organization, which sits outside the engineering line. It audits the work against this plan and holds each finding open until it is closed with evidence.', eng: 'Process assurance is done by an engineer from outside the program, who audits the work against this plan.', third: 'Process assurance is done by an independent company, which audits the work against this plan.' },
                { da: ['A7-1', 'A7-2', 'A7-4'], tools: ['appa', 'review'] }),
            // 6 Nov 2026 (Waqas: "I want development assurance choices"): the choices ARP4754B leaves to the program
            Q('sspp.levels', 'Development assurance objectives', 'Which DAL sets the objectives the program works to?', [['top', 'The highest DAL on the program, for all of the work', 'Every function and item is developed to the objectives of the top level.'], ['each', 'Each function and item its own DAL', 'Lower-level work meets the objectives its own level calls for.']],
                { top: 'The program works to the objectives its highest development assurance level calls for, across all of its work.', each: 'Each function and item is developed to the objectives its own development assurance level calls for, and no fewer.' },
                { da: ['A1-1', 'A3-2'], tools: ['appa', 'dal-ref'] }),
            Q('sspp.idal', 'The safety assessment process and its methods', 'How are item DALs assigned?', [['fdal', 'Each item takes the DAL of the function it serves', ''], ['arch', 'From the architecture: items in a failure set that are independent may take a lower DAL, with the reason', 'Needs the common mode analysis to confirm the independence.']],
                { fdal: 'Each item takes the development assurance level of the function it serves; no item level is lower than its function\'s.', arch: 'Item development assurance levels are set from the architecture: where the items in a failure set are independent, an item may take a lower level, with the independence that allows it recorded and confirmed by the common mode analysis.' },
                { da: ['A3-2', 'A3-5'], tools: ['dal-ref', 'items'] }),
            Q('sspp.transition', 'Development assurance objectives', 'What lets the work move from one step to the next?', [['gates', 'A signed completion gate: its checklist complete and reviewed', ''], ['review', 'The exit criteria of the design review', ''], ['both', 'Both', '']],
                { gates: 'Work moves from one step to the next only when that step\'s completion gate in Safety Lab is signed: every checklist item done or tailored out with a signed reason, and a reviewer\'s signature.', review: 'Work moves from one step to the next when the design review\'s exit criteria are met.', both: 'Work moves from one step to the next when the completion gate in Safety Lab is signed and the design review\'s exit criteria are met.' },
                { da: ['A1-2', 'A7-3'], tools: ['dashboard', 'review'] }),
            Q('sspp.ccat', 'Development assurance objectives', 'Which control category does the safety data get?', [['dal', 'By DAL: system control category 1 for DAL A and B data, category 2 below', ''], ['sc1', 'System control category 1 for all of it', '']],
                { dal: 'Safety data for DAL A and B functions is kept under system control category 1 (change control, problem reporting and baselines); data for lower levels under category 2 (identified, protected and retrievable).', sc1: 'All safety data is kept under system control category 1: change control, problem reporting and baselines.' },
                { da: ['A6-1', 'A6-2', 'A6-3'], tools: ['cm'] }),
            Q('sspp.toolq', 'Tools', 'How is Safety Lab\'s output trusted for certification credit?', [['review', 'Each result the safety case relies on is reviewed by an engineer', 'No tool qualification is needed.'], ['qualify', 'Safety Lab is qualified to DO-330 for the analyses that take credit', 'Uses the tool qualification data for Safety Lab.']],
                { review: 'Every Safety Lab result the safety case relies on (a probability, a cut set, a DAL) is reviewed by an engineer before it is used, so the tool needs no qualification.', qualify: 'Safety Lab is qualified to DO-330, at the level its use needs, for the analyses that take certification credit without an independent check of their output.' },
                { da: ['A1-1', 'A5-2'], tools: ['spp'] }),
            Q('sspp.show', 'Development assurance objectives', 'How is each objective shown met to the authority?', [['report', 'In the safety assessment reports, objective by objective with its evidence', ''], ['matrix', 'In a compliance matrix in the certification plan', ''], ['both', 'Both', '']],
                { report: 'Each objective is shown met in the safety assessment reports, objective by objective, with the evidence behind it.', matrix: 'Each objective is shown met in a compliance matrix in the certification plan.', both: 'Each objective is shown met in the safety assessment reports, with its evidence, and summarized in a compliance matrix in the certification plan.' },
                { da: ['A8-1', 'A8-2'], tools: ['appa', 'moc'] }),
            Q('sspp.ai', 'Tools', 'How is content drafted by the AI Assistant handled?', [['accept', 'An engineer reads and accepts each draft before it counts', ''], ['off', 'The AI Assistant is not used on this program', '']],
                { accept: 'Content drafted by the AI Assistant is logged with what produced it and counts only after an engineer has read and accepted it. Numbers are always computed by the tool, never written by the AI.', off: 'The AI Assistant is not used on this program.' },
                { da: ['A7-3'], tools: ['ai'] }),
            Q('sspp.cm', 'Records and changes to this plan', 'When are the safety data baselined?', [['reviews', 'At each design review', ''], ['gates', 'At each signed completion gate', ''], ['cert', 'At each certification submission', '']],
                { reviews: 'The safety data are baselined at each design review: a signed snapshot of the whole project that later changes are compared against.', gates: 'The safety data are baselined each time a completion gate is signed.', cert: 'The safety data are baselined at each certification submission.' },
                { da: ['A6-1', 'A6-2', 'A6-3'], tools: ['cm'] }),
            Q('sspp.soi', 'Records and changes to this plan', 'How is the authority kept informed?', [['soi', 'Stages of involvement through the program', ''], ['submit', 'At each submission only', '']],
                { soi: 'The authority is kept informed through stages of involvement: at planning, during development, during verification and before the final submission. This plan is submitted at the first.', submit: 'The authority sees the safety work at each submission.' },
                { da: ['A8-1', 'A8-2'], tools: ['moc'] })
          ] },
        { key: 'hfp', code: 'HFP', title: 'Human Factors Plan', secs: HFP_SECS,
          basis: 'Built on the ten steps of the HF Autopilot; 14 CFR 25.1302 (flight deck design for the crew), 25.1523 and Appendix D (minimum flight crew), AC 25.1302-1, AC 25.1523-1',
          qs: [
            Q('hfp.need', 'Scope and purpose', 'How much human factors work does the program need?', [['full', 'A full program: the flight deck is new or changed', 'Turns the human factors lane on.'], ['none', 'None: the crew\'s controls, displays and procedures do not change', 'Turns the human factors lane off; its data is kept.']],
                { full: 'The flight deck is new or changed, so the program runs a full human factors program: the crew\'s part in every function, their workload, the errors they could make, how they are told, and the minimum crew.', none: 'The crew\'s controls, displays and procedures do not change, so no human factors program is run. The reason is recorded in the tailoring section of the System Safety Program Plan.' },
                { da: ['A2-1'], tools: ['hfa-auto'], set: [LANE('hfa', ['full'], ['none'])] }),
            Q('hfp.basis', 'Scope and purpose', 'Which rules does the flight deck have to meet?', [['25', '14 CFR 25.1302 and 25.1523', ''], ['cs25', 'CS 25.1302 and CS 25.1523', ''], ['both', 'Both the FAA and EASA rules', ''], ['23', '14 CFR 23.2600 and 23.2605 (Part 23)', '']],
                { 25: 'The flight deck is shown to meet 14 CFR 25.1302 (installed systems and equipment for use by the flight crew) and 25.1523 with Appendix D (minimum flight crew).', cs25: 'The flight deck is shown to meet CS 25.1302 and CS 25.1523 with Appendix D.', both: 'The flight deck is shown to meet both 14 CFR and CS 25.1302 and 25.1523 with Appendix D.', 23: 'The flight deck is shown to meet 14 CFR 23.2600 (flight deck design) and 23.2605 (installation and operation).' },
                { da: ['A8-1'], tools: ['defs', 'moc'] }),
            Q('hfp.crew', 'The crew and the operation', 'What crew does the design assume?', [['two', 'Two pilots', ''], ['one', 'One pilot', ''], ['remote', 'One pilot, with support from the ground', '']],
                { two: 'The design assumes a crew of two pilots, a pilot flying and a pilot monitoring.', one: 'The design assumes one pilot.', remote: 'The design assumes one pilot on board, with support from a ground station; the ground station\'s part is analyzed like a crew member\'s.' },
                { da: ['A4-2'], tools: ['hfa-auto'] }),
            Q('hfp.alloc', 'The human factors work through the design cycle', 'How is the work split between the crew and the automation decided?', [['phase', 'Function by function, in every flight phase (HF Autopilot step 1)', ''], ['function', 'Function by function, the same in every phase', '']],
                { phase: 'Each aircraft function is given to the crew, the automation or both, in each flight phase. A crew task is made for each phase the crew has a part in, so the workload and error analyses cover every phase.', function: 'Each aircraft function is given to the crew, the automation or both, once for all phases.' },
                { da: ['A2-1', 'A2-2'], tools: ['hfa-auto', 'hfa-results'] }),
            Q('hfp.workload', 'Workload and crew error', 'How is the crew\'s workload measured?', [['share', 'Task time shares from analysis, confirmed in the simulator', ''], ['bedford', 'Bedford ratings in the simulator', ''], ['tlx', 'NASA-TLX ratings in the simulator', '']],
                { share: 'Each pilot\'s workload is worked out in every flight phase from the share of the time their tasks take, with the worst failure of the phase on top. No pilot carries more than 80% of the time available. The results are confirmed in the simulator.', bedford: 'Workload is rated by pilots in the simulator on the Bedford scale, in every flight phase, in normal operation and with the worst failure of the phase.', tlx: 'Workload is rated by pilots in the simulator with NASA-TLX, in every flight phase, in normal operation and with the worst failure of the phase.' },
                { da: ['A4-1', 'A5-1'], tools: ['hfa-auto', 'hfa-results'] }),
            Q('hfp.error', 'Workload and crew error', 'How are crew errors analyzed?', [['qual', 'For each crew task and failure response: how it is noticed and put right', ''], ['quant', 'The same, with an error probability for each', '']],
                { qual: 'For each crew task and each failure response, the credible errors are listed with how each is noticed and how it is put right. An error nobody notices and nobody can put right is an open finding until the design changes.', quant: 'For each crew task and each failure response, the credible errors are listed with how each is noticed, how it is put right, and an error probability that goes into the fault trees.' },
                { da: ['A3-1', 'A3-3'], tools: ['hfa-auto', 'fta'] }),
            Q('hfp.eval', 'Evaluations and who does them', 'How are the human factors claims shown?', [['sim', 'A simulator campaign', ''], ['mock', 'Mock-ups early, then a simulator campaign', ''], ['flight', 'A simulator campaign, then flight test', '']],
                { sim: 'The human factors claims are shown in a simulator campaign with scenarios for each flight phase and each crew-relevant failure.', mock: 'The flight deck layout is checked early with mock-ups, and the claims are then shown in a simulator campaign.', flight: 'The claims are shown in a simulator campaign, and the ones that depend on the real aircraft are confirmed in flight test.' },
                { da: ['A5-1', 'A4-1'], tools: ['hfa-results', 'vv-status'] }),
            Q('hfp.pilots', 'Evaluations and who does them', 'Who flies the evaluations?', [['line', 'Line pilots from operators, not from the design team', ''], ['test', 'The company\'s test pilots', ''], ['both', 'Both', '']],
                { line: 'The evaluations are flown by line pilots from operators, who were not part of the design.', test: 'The evaluations are flown by the company\'s test pilots.', both: 'The evaluations are flown by the company\'s test pilots and by line pilots from operators who were not part of the design.' },
                { da: ['A4-3', 'A5-3'], tools: ['hfa-results'] }),
            Q('hfp.mfc', 'Minimum flight crew', 'How is the minimum crew decided?', [['appd', 'The workload functions and factors of Appendix D, then the simulator', ''], ['similar', 'By comparison with a certified aircraft, with the differences analyzed', '']],
                { appd: 'The minimum flight crew is decided from the workload functions and factors of Appendix D, worked through for each flight phase, and confirmed in the simulator.', similar: 'The minimum flight crew is decided by comparison with a certified aircraft of the same crew, with each difference in workload analyzed.' },
                { da: ['A8-1'], tools: ['hfa-auto'] }),
            Q('hfp.credit', 'Crew actions the safety analysis counts on', 'When the safety analysis counts on a crew action, how is it recorded?', [['asm', 'As a human factors assumption, validated before it counts', ''], ['note', 'As a note on the failure condition', '']],
                { asm: 'Each crew action the safety analysis counts on is recorded as a human factors assumption, linked to its crew task, and counts only once it is validated in the evaluations.', note: 'Each crew action the safety analysis counts on is noted on its failure condition.' },
                { da: ['A4-2'], tools: ['assumptions', 'hfa-auto'] })
          ] },
        { key: 'ramp', code: 'RAMP', title: 'Reliability and Maintainability Plan', secs: RAMP_SECS,
          basis: 'MIL-HDBK-338B, MIL-STD-785B, MIL-HDBK-217F, MIL-HDBK-470A and MIL-HDBK-472, ATA MSG-3, adapted for a civil aircraft program; the failure rates feed the safety assessment',
          qs: [
            Q('ramp.need', 'Scope and purpose', 'What reliability work does the program do?', [['safety', 'Only the failure rates the safety assessment needs', 'Turns the reliability engineering lane off; its data is kept.'], ['full', 'A full reliability program: prediction, allocation, growth and failure reporting', 'Turns the reliability engineering lane on.']],
                { safety: 'The program predicts only the failure rates the safety assessment needs, part by part where a fault tree asks for it.', full: 'The program runs a full reliability program: prediction, allocation of targets to the systems, growth tracking, and failure reporting from test and service.' },
                { da: ['A3-2', 'A3-3'], tools: ['ram-hub', 'ram-rel'], set: [LANE('ram-reliability', ['full'], ['safety'])] }),
            Q('ramp.rates', 'Reliability prediction and data sources', 'Where do the failure rates come from?', [['supplier', 'Supplier data, backed by service history', ''], ['nprd', 'Field data handbooks (NPRD, EPRD)', ''], ['217', 'MIL-HDBK-217F parts count and stress', ''], ['fides', 'FIDES', '']],
                function (v) { var m = { supplier: 'supplier data backed by service history', nprd: 'field data handbooks (NPRD and EPRD)', 217: 'MIL-HDBK-217F parts count and part stress predictions', fides: 'FIDES predictions' }; return 'Failure rates come from ' + listJoin(String(v).split('|').map(function (x) { return m[x]; }).filter(Boolean)) + '. Each rate in a fault tree names its source and the environment it was taken for.'; },
                { type: 'checks', da: ['A3-2', 'A3-3'], tools: ['ram-predict', 'fta'] }),
            Q('ramp.alloc', 'Allocation and growth', 'Are reliability targets set for each system?', YN('', ''),
                { yes: 'The aircraft reliability target is shared out to the systems, and each system\'s prediction is checked against its share.', no: 'No reliability targets are set for the systems; the safety targets are the only ones.' },
                { da: ['A2-2'], tools: ['ram-alloc'], when: function () { return A('ramp.need') === 'full'; } }),
            Q('ramp.growth', 'Allocation and growth', 'Is reliability growth tracked in test?', YN('', ''),
                { yes: 'Reliability growth is tracked through test with the Crow-AMSAA model, against a planned growth curve.', no: 'Reliability growth is not tracked.' },
                { da: ['A5-2'], tools: ['ram-growth'], when: function () { return A('ramp.need') === 'full'; } }),
            Q('ramp.fracas', 'Failure reporting', 'How are failures in test and service handled?', [['sl', 'A failure reporting and corrective action system (FRACAS) in Safety Lab', ''], ['other', 'The company\'s own failure reporting system', '']],
                { sl: 'Every failure in test and service is reported, analyzed for its cause and closed with a corrective action in Safety Lab\'s failure reporting system. A failure that a fault tree did not expect is sent back to the safety assessment.', other: 'Failures in test and service are handled in the company\'s own failure reporting system. A failure that a fault tree did not expect is sent back to the safety assessment.' },
                { da: ['A5-2', 'A6-3'], tools: ['ram-rel'] }),
            Q('ramp.mx', 'Maintainability and testability', 'Is maintainability analyzed?', YN('Turns the maintainability lane on.', 'Turns the maintainability lane off; its data is kept.'),
                { yes: 'Maintainability is analyzed: the mean time to repair for each replaceable unit, the downtime, and how well each failure can be detected and isolated.', no: 'Maintainability is not analyzed.' },
                { da: ['A2-3'], tools: ['ram-mx', 'ram-test'], set: [LANE('ram-mx', ['yes'], ['no'])] }),
            Q('ramp.msg3', 'Scheduled maintenance and dispatch', 'How is scheduled maintenance developed?', [['msg3', 'With MSG-3', 'Turns the MSG-3 lane on.'], ['own', 'The manufacturer\'s own method', 'Turns the MSG-3 lane off; its data is kept.']],
                { msg3: 'Scheduled maintenance is developed with MSG-3: systems, structures, zonal, and lightning and radiated field tasks. The certification maintenance requirements from the safety assessment are kept apart and never escalated without the safety group.', own: 'Scheduled maintenance is developed with the manufacturer\'s own method. The certification maintenance requirements from the safety assessment are kept apart.' },
                { da: ['A3-3'], tools: ['ram-msg3', 'ccmr'], set: [LANE('ram-msg3', ['msg3'], ['own'])] }),
            Q('ramp.lcc', 'Cost and other analyses', 'Is life-cycle cost estimated?', YN('Turns the life-cycle cost lane on.', 'Turns the life-cycle cost lane off; its data is kept.'),
                { yes: 'The life-cycle cost is estimated from the reliability and maintainability results.', no: 'Life-cycle cost is not estimated.' },
                { tools: ['lcc'], set: [LANE('ram-lcc', ['yes'], ['no'])] }),
            Q('ramp.sw', 'Cost and other analyses', 'Is software reliability estimated?', YN('Turns the software reliability lane on.', 'Turns the software reliability lane off; its data is kept.'),
                { yes: 'Software reliability is estimated from test failure data, as a measure of maturity. It never stands in for the software development assurance level.', no: 'Software reliability is not estimated; software is covered by its development assurance level.' },
                { da: ['A5-2'], tools: ['swrel'], set: [LANE('ram-swrel', ['yes'], ['no'])] }),
            Q('ramp.sneak', 'Cost and other analyses', 'Is a sneak circuit analysis done?', YN('Turns the sneak circuit lane on.', 'Turns the sneak circuit lane off; its data is kept.'),
                { yes: 'A sneak circuit analysis looks for unintended paths in the electrical design that could make a function act when nobody asked it to.', no: 'No sneak circuit analysis is done.' },
                { da: ['A3-3'], tools: ['sneak'], set: [LANE('ram-sneak', ['yes'], ['no'])] }),
            Q('ramp.eta', 'Cost and other analyses', 'Are event trees used?', YN('Turns the event trees lane on.', 'Turns the event trees lane off; its data is kept.'),
                { yes: 'Event trees show how an initiating failure leads to different outcomes depending on which protections work.', no: 'Event trees are not used.' },
                { tools: [], set: [LANE('eta', ['yes'], ['no'])] })
          ] }
    ];
    var BY = {}, QBY = {};
    PLANS.forEach(function (p) { BY[p.key] = p; p.qs.forEach(function (q) { QBY[q.k] = q; q.plan = p.key; }); });

    function optLabel(q, v) { return String(v || '').split('|').map(function (x) { var o = q.opts.filter(function (o) { return o[0] === x; })[0]; return o ? o[1] : x; }).join(', '); }
    function optLabelK(k, v) { return optLabel(QBY[k], v); }
    function shown(q) { return !q.when || safe(q.when, true); }
    function questions(key) { return BY[key].qs.filter(shown); }

    // ---- answering ----------------------------------------------------------------------------------------------
    function answer(k, v) {
        var q = QBY[k]; if (!q) throw fail('No such question: ' + k);
        var s = store();
        if (v === '' || v == null || (Array.isArray(v) && !v.length)) { delete s.answers[k]; delete s.who[k]; save(); return ''; }
        var vs = Array.isArray(v) ? v : String(v).split('|');
        if (q.type !== 'checks' && vs.length > 1) throw fail('Pick one answer for: ' + q.text);
        vs.forEach(function (x) { if (!q.opts.some(function (o) { return o[0] === x; })) throw fail('"' + x + '" is not one of the answers to: ' + q.text); });
        var val = q.opts.map(function (o) { return o[0]; }).filter(function (o) { return vs.indexOf(o) >= 0; }).join('|');   // in the options' order
        s.answers[k] = val; s.who[k] = { by: who(), at: now() };
        save(); return val;
    }
    function toggle(k, opt) { var cur = picked(k), i = cur.indexOf(opt); if (i >= 0) cur.splice(i, 1); else cur.push(opt); return answer(k, cur); }

    // ---- what the plan sets, as it is and as it will be -----------------------------------------------------------
    function wires(key) {
        var out = [];
        questions(key).forEach(function (q) {
            (q.set || []).forEach(function (st, i) {
                var v = A(q.k), after = v ? safe(function () { return st.after(v); }, null) : null, nowV = safe(function () { return st.now(); }, '');
                out.push({ k: q.k, i: i, what: safe(function () { return st.what(); }, ''), now: nowV, after: after == null ? (v ? nowV : 'Not answered') : after, same: !v || after == null || after === nowV, answered: !!v });
            });
        });
        return out;
    }
    function apply(key) {
        var plan = BY[key], by = who(), done = [], errs = [];
        questions(key).forEach(function (q) {
            var v = A(q.k); if (!v) return;
            (q.set || []).forEach(function (st) {
                var after = safe(function () { return st.after(v); }, null); if (after == null || after === safe(function () { return st.now(); }, '')) return;
                try { st.apply(v, by, plan, q); done.push(st.what() + ': ' + after); store().applied[q.k] = { at: now(), by: by }; } catch (e) { errs.push(st.what() + ': ' + (e && e.message || e)); }
            });
        });
        save();
        try { if (PP() && PP().applyNav) PP().applyNav(); } catch (_) {}
        return { done: done, errs: errs };
    }

    // ---- status ----------------------------------------------------------------------------------------------------
    function status(key) {
        var qs = questions(key), n = qs.filter(function (q) { return A(q.k); }).length, w = wires(key).filter(function (x) { return !x.same; }).length;
        if (!n) return { state: 'not started', label: 'Not started', n: qs.length, miss: qs.length, apply: w };
        if (n < qs.length) return { state: 'open', label: (qs.length - n) + ' to answer', n: qs.length, miss: qs.length - n, apply: w };
        if (w) return { state: 'apply', label: w + ' setting' + (w > 1 ? 's' : '') + ' to apply', n: qs.length, miss: 0, apply: w };
        return { state: 'ready', label: 'Ready to issue', n: qs.length, miss: 0, apply: 0 };
    }
    function gaps(key) { return questions(key).filter(function (q) { return !A(q.k); }).map(function (q) { return q.text.replace(/\?$/, ''); }); }
    // the objectives each plan addresses: how the program meets each, from the answers
    function daCover(key) {
        var qs = key ? questions(key) : PLANS.reduce(function (a, p) { return a.concat(questions(p.key)); }, []);
        return objectives().map(function (o) {
            var by = qs.filter(function (q) { return q.da.indexOf(o.id) >= 0; });
            var ans = by.filter(function (q) { return A(q.k); });
            return { id: o.id, grp: o.grp, text: o.text, state: o.state, detail: o.detail, qs: by, answered: ans, how: ans.map(function (q) { return optLabel(q, A(q.k)); }), tools: by.reduce(function (a, q) { q.tools.forEach(function (t) { if (a.indexOf(t) < 0) a.push(t); }); return a; }, []) };
        }).filter(function (r) { return !key || r.qs.length; });
    }

    // ---- the plan document -------------------------------------------------------------------------------------------
    function txtOf(q) {
        var v = A(q.k); if (!v) return 'To be decided: ' + lcFirst(q.text.replace(/\?$/, '')) + '.';
        return typeof q.txt === 'function' ? q.txt(v) : (q.txt[v] != null ? q.txt[v] : optLabel(q, v));
    }
    function H(level, text) { return { k: 'h', level: level, text: text }; }
    function P(text) { return { k: 'p', text: text }; }
    function TBL(title, rows) { return { k: 'table', name: title, title: title, rows: rows }; }
    function secIntro(key, sec) {
        var c = counts(), dal = topDal(), sv = topSeverity();
        var I = {
            sspp: {
                'Scope and purpose': 'This plan sets out how the safety of ' + projName() + ' is assessed and shown to the authority: who does the work, the assessments and the methods, the development assurance objectives and how each is met, and the records kept. The certification basis is ' + basis() + '. The program has ' + c.functions + ' aircraft function' + (c.functions === 1 ? '' : 's') + ' and ' + c.systems + ' system' + (c.systems === 1 ? '' : 's') + (sv ? '; its worst failure condition is ' + sv + ', so the highest development assurance level is DAL ' + dal : '; no failure condition has been classified yet') + '.',
                'How the safety program is organized': 'This section names who does the safety work and how the teams fit together.',
                'Safety responsibilities': 'This section sets out the safety group\'s duties through the program: the plan, the safety requirements, the reviews, the maintenance tasks and the tests the safety case relies on.',
                'The safety assessment process and its methods': 'The safety assessment runs top down and then back up: the aircraft and system functional hazard assessments classify what could go wrong; the preliminary assessments set the architecture and the requirements; the system and aircraft safety assessments show the design as built meets them. Development assurance levels are assigned along the way.',
                'Common cause analyses': 'The common cause analyses check that the independence the architecture counts on is real: nothing shared, no event outside the systems, and nothing in a zone can defeat it.',
                'Development assurance objectives': 'The table below lists each development assurance objective of ARP4754B (in our own one-line summary; the standard\'s Appendix A tables are the authority), how this program meets it according to this plan, the Safety Lab page the evidence comes from, and where it stands now.',
                'Tools': 'The program\'s tools are declared here. Safety and reliability analyses are done in Safety Lab Aero.',
                'Tailoring': 'The analysis lanes in the program, and any expected lane left out, with its signed reason. Data in a lane left out is kept, never deleted.',
                'Records and changes to this plan': 'The safety data are kept in Safety Lab with their history. Every signature, change and acceptance is recorded with who and when.'
            },
            hfp: {
                'Scope and purpose': 'This plan sets out how ' + projName() + ' shows that the flight crew can operate the aircraft safely: the crew\'s part in each function, their workload in every flight phase, the errors they could make, how they are told about failures, and the minimum crew. It sits under the System Safety Program Plan.',
                'The crew and the operation': 'The crew the design assumes and the operation it is designed for.',
                'The human factors work through the design cycle': 'The work runs in ten steps, from concept to certification, in the HF Autopilot. The table shows each step and where it stands now.',
                'Workload and crew error': 'Workload is worked out for each pilot in every flight phase; crew errors are listed for every crew task and failure response.',
                'Evaluations and who does them': 'How the claims are shown, and by whom.',
                'Minimum flight crew': 'How the minimum flight crew is decided.',
                'Crew actions the safety analysis counts on': 'Where a failure condition is classified on the strength of something the crew does, that action is a claim the plan holds the program to.',
                'Development assurance objectives': 'The development assurance objectives this plan helps meet, how, and where they stand.',
                'Records and changes to this plan': 'The human factors data are kept in Safety Lab with their history. Changes to this plan are signed by the owner of the System Safety Program Plan.'
            },
            ramp: {
                'Scope and purpose': 'This plan sets out the reliability and maintainability work on ' + projName() + ': where failure rates come from, the targets, failure reporting, maintainability, scheduled maintenance and cost. The failure rates it produces feed the safety assessment. It sits under the System Safety Program Plan.',
                'Reliability prediction and data sources': 'Failure rates are predicted at the level the fault trees need.',
                'Allocation and growth': 'Targets for the systems and how reliability grows through test.',
                'Failure reporting': 'How failures found in test and in service are handled.',
                'Maintainability and testability': 'How quickly and surely failures are found and fixed.',
                'Scheduled maintenance and dispatch': 'Scheduled maintenance tasks and dispatch with equipment inoperative.',
                'Cost and other analyses': 'Further reliability analyses the program uses.',
                'Development assurance objectives': 'The development assurance objectives this plan helps meet, how, and where they stand.',
                'Records and changes to this plan': 'The reliability data are kept in Safety Lab with their history. Changes to this plan are signed by the owner of the System Safety Program Plan.'
            }
        };
        return (I[key] || {})[sec] || '';
    }
    function secTables(key, sec) {
        var c = counts(), out = [];
        if (key === 'sspp' && sec === 'Scope and purpose') out.push(TBL('Standards and guidance this plan follows', [
            { Document: 'SAE ARP4754B', 'What it is used for': 'The development assurance processes and objectives; the layout of this plan follows its example safety program plan' },
            { Document: 'SAE ARP4761A', 'What it is used for': 'The safety assessment methods: FHA, PASA, PSSA, SSA, ASA and the common cause analyses' },
            { Document: 'Certification basis: ' + basis(), 'What it is used for': 'The failure condition classifications and their probability targets' },
            { Document: 'Human Factors Plan', 'What it is used for': 'The crew\'s part in the safety case (written in the Plan Autopilot)' },
            { Document: 'Reliability and Maintainability Plan', 'What it is used for': 'The failure rates the safety assessment uses (written in the Plan Autopilot)' }]));
        if (key === 'sspp' && sec === 'How the safety program is organized') out.push(TBL('Systems in the program', arr('systemsData').map(function (s) { return { System: s.name || s.id, Role: s.role || '', 'System FHA rows': String(Array.isArray(s.fha) ? s.fha.length : 0) }; })));
        if (key === 'sspp' && sec === 'The safety assessment process and its methods') out.push(TBL('The assessments and where they stand', [
            { Assessment: 'Aircraft FHA', 'Safety Lab page': pageName('ac-fha'), 'Now': c.afha + ' aircraft failure conditions' },
            { Assessment: 'PASA', 'Safety Lab page': pageName('pasa'), 'Now': A('sspp.pasa') === 'no' ? 'Not done (tailored)' : 'From the aircraft architecture and the failure conditions' },
            { Assessment: 'System FHAs', 'Safety Lab page': pageName('sys-dir'), 'Now': c.sfha + ' system failure conditions across ' + c.systems + ' systems' },
            { Assessment: 'PSSA and SSA', 'Safety Lab page': pageName('fta'), 'Now': c.trees + ' fault trees' },
            { Assessment: 'FMEA', 'Safety Lab page': pageName('fmea'), 'Now': c.fmea + ' FMEA rows' },
            { Assessment: 'Aircraft Safety Assessment', 'Safety Lab page': pageName('asa'), 'Now': 'Rolled up from the system results' },
            { Assessment: 'DAL assignment', 'Safety Lab page': pageName('dal-ref'), 'Now': topDal() ? 'Highest DAL ' + topDal() : 'No DAL yet' }]));
        if (key === 'sspp' && sec === 'Common cause analyses') out.push(TBL('Common cause analyses in the program', [
            { Analysis: 'Common mode analysis', 'In the program': laneOn('cma') ? 'Yes' : 'No', 'Rows now': String(c.cma), 'Safety Lab page': pageName('cma') },
            { Analysis: 'Particular risk analysis', 'In the program': laneOn('pra') ? 'Yes' : 'No', 'Rows now': String(c.pra), 'Safety Lab page': pageName('pra') },
            { Analysis: 'Zonal safety analysis', 'In the program': laneOn('zsa') ? 'Yes' : 'No', 'Rows now': String(c.zsa), 'Safety Lab page': pageName('zsa') }]));
        if (sec === 'Development assurance objectives') out.push(TBL('Development assurance objectives: how each is met and where it stands', daCover(key === 'sspp' ? null : key).map(function (r) {
            return { Objective: r.id, 'What it asks': r.text, 'How this program meets it': r.how.length ? r.how.join('; ') : (r.qs.length ? 'To be decided' : 'From the work in Safety Lab'), 'Evidence': r.tools.map(pageName).join(', ') || 'Objectives matrix', 'Where it stands': (STATE_WORD[r.state] || r.state) + (r.detail ? ': ' + r.detail : '') };
        })));
        if (key === 'sspp' && sec === 'Tools') { var t = safe(function () { return root.declaredToolchain(); }, null); if (t) out.push(TBL('Declared tools', [
            { Work: 'Safety and reliability analyses', Tool: 'Safety Lab Aero ' + (t.sra && t.sra.version || ''), Signed: t.sra && t.sra.by ? t.sra.by + ' ' + String(t.sra.at || '').slice(0, 10) : 'Not signed' },
            { Work: 'Requirements management', Tool: t.rmLabel || 'Not declared', Signed: t.rm && t.rm.by ? t.rm.by + ' ' + String(t.rm.at || '').slice(0, 10) : 'Not signed' },
            { Work: 'Modeling (MBSE)', Tool: t.mbse && t.mbse.tool ? (t.mbse.tool === 'other' ? t.mbse.toolOther || 'Other' : MBSE_NAMES[t.mbse.tool] || t.mbse.tool) : 'Not declared', Signed: t.mbse && t.mbse.by ? t.mbse.by + ' ' + String(t.mbse.at || '').slice(0, 10) : 'Not signed' }])); }
        if (key === 'sspp' && sec === 'Tailoring' && PP()) {
            var tail = safe(function () { return PP().tailoring().filter(function (x) { return !x.cleared; }); }, []);
            out.push(TBL('Analysis lanes in the program', PP().CATALOGUE.filter(function (l) { return !l.parent; }).map(function (l) { var tt = tail.filter(function (x) { return x.laneId === l.id; })[0]; return { Lane: l.name, 'In the program': laneOn(l.id) ? 'Yes' : (tt ? 'Left out, signed' : 'No'), 'Items kept': String(laneItems(l.id)), Reason: tt ? tt.rationale + ' (' + tt.sig + ', ' + String(tt.at || '').slice(0, 10) + ')' : '' }; })));
        }
        if (key === 'hfp' && sec === 'The human factors work through the design cycle') {
            var cov = safe(function () { return root.SLHfAuto.coverage(); }, []);
            out.push(TBL('The ten steps of the human factors work', cov.map(function (s) { return { Step: String(s.n), Phase: s.phase || '', Work: s.title || '', 'Answered': s.answered + ' of ' + s.questions, 'Open': String(s.open || 0) }; })));
        }
        if (key === 'ramp' && sec === 'Scope and purpose' && PP()) out.push(TBL('Reliability and maintainability lanes', PP().CATALOGUE.filter(function (l) { return l.group === 'ram' && !l.parent; }).map(function (l) { return { Lane: l.name, 'In the program': laneOn(l.id) ? 'Yes' : 'No', 'Items kept': String(laneItems(l.id)) }; })));
        return out;
    }
    // ---- the diagrams (6 Nov 2026, Waqas: "for program planing I dont want just data flow choices, I want development
    // assurance choices and diagrams"): each drawn from the answers and the project, so it changes when they do. Plain
    // standalone svg (white background, no scripts): the same picture in the preview, in print and in Word.
    var C = { ink: '#101216', sub: '#5b6270', line: '#6b7280', on: '#1A6EF2', onF: '#EAF2FE', ok: '#1F7A33', okF: '#E8F4EA', warn: '#B26A00', warnF: '#FDF1DE', off: '#9aa1ad', offF: '#F3F4F6', tbd: '#9A3412', tbdF: '#FFF4ED' };
    function sx(s) { return E(s); }
    function svgWrap(w, h, body, title) { return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="' + sx(title) + '"><defs><marker id="pla-ah" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="' + C.line + '"/></marker><style>.pla-l{paint-order:stroke;stroke:#ffffff;stroke-width:3.5px;stroke-linejoin:round}</style></defs><rect width="100%" height="100%" fill="#ffffff"/>' + body + '</svg>', w: w, h: h }; }
    function wrapText(t, n) { var words = String(t || '').split(/\s+/), lines = [], cur = ''; words.forEach(function (w0) { if ((cur + ' ' + w0).trim().length > n && cur) { lines.push(cur); cur = w0; } else cur = (cur + ' ' + w0).trim(); }); if (cur) lines.push(cur); return lines; }
    // a box: kind 'on' (in the program, with work), 'ok', 'warn', 'off' (out of the program: dashed), 'tbd' (not decided)
    function box(x, y, w, h, title, sub, kind) {
        var st = { on: [C.on, C.onF], ok: [C.ok, C.okF], warn: [C.warn, C.warnF], off: [C.off, C.offF], tbd: [C.tbd, C.tbdF] }[kind || 'on'];
        var tl = wrapText(title, Math.max(8, Math.floor(w / 7.4))), sl = sub ? wrapText(sub, Math.max(10, Math.floor(w / 6.2))) : [];
        var lh = 14, total = tl.length * lh + sl.length * 12, y0 = y + h / 2 - total / 2 + 11;
        var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="' + st[1] + '" stroke="' + st[0] + '" stroke-width="1.4"' + (kind === 'off' || kind === 'tbd' ? ' stroke-dasharray="5 4"' : '') + '/>';
        tl.forEach(function (l, i) { s += '<text x="' + (x + w / 2) + '" y="' + (y0 + i * lh) + '" font-size="12.5" font-weight="700" fill="' + C.ink + '" text-anchor="middle">' + sx(l) + '</text>'; });
        sl.forEach(function (l, i) { s += '<text x="' + (x + w / 2) + '" y="' + (y0 + tl.length * lh + i * 12 + 1) + '" font-size="10.5" fill="' + C.sub + '" text-anchor="middle">' + sx(l) + '</text>'; });
        return s;
    }
    function arrow(x1, y1, x2, y2, label, dashed) {
        var s = '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + C.line + '" stroke-width="1.3" stroke-linecap="round" marker-end="url(#pla-ah)"' + (dashed ? ' stroke-dasharray="4 3"' : '') + '/>';
        if (label) s += '<text class="pla-l" x="' + ((x1 + x2) / 2 + 4) + '" y="' + ((y1 + y2) / 2 - 4) + '" font-size="10.5" fill="' + C.sub + '">' + sx(label) + '</text>';
        return s;
    }
    function legend(x, y, items) { var s = ''; items.forEach(function (it, i) { var st = { on: [C.on, C.onF], ok: [C.ok, C.okF], warn: [C.warn, C.warnF], off: [C.off, C.offF], tbd: [C.tbd, C.tbdF] }[it[0]]; s += '<rect x="' + (x + i * 175) + '" y="' + y + '" width="14" height="11" rx="2" fill="' + st[1] + '" stroke="' + st[0] + '"' + (it[0] === 'off' || it[0] === 'tbd' ? ' stroke-dasharray="3 2"' : '') + '/><text x="' + (x + i * 175 + 20) + '" y="' + (y + 10) + '" font-size="10.5" fill="' + C.sub + '">' + sx(it[1]) + '</text>'; }); return s; }
    function head(t, sub) { return '<text x="16" y="24" font-size="14" font-weight="700" fill="' + C.ink + '">' + sx(t) + '</text>' + (sub ? '<text x="16" y="41" font-size="11" fill="' + C.sub + '">' + sx(sub) + '</text>' : ''); }
    var FIG = { box: box, arrow: arrow };

    // 2. how the safety program is organized, as answered
    function figOrg() {
        var v = A('sspp.org'), owner = A('sspp.owner') ? optLabelK('sspp.owner', A('sspp.owner')).replace(/^The /, '') : 'Owner to be decided';
        var sys = arr('systemsData').slice(0, 4).map(function (x) { return x.name || x.id; }), more = Math.max(0, arr('systemsData').length - 4);
        var s = head('How the safety program is organized', v ? optLabelK('sspp.org', v) : 'To be decided'), W = 900;
        s += box(340, 55, 220, 46, owner.charAt(0).toUpperCase() + owner.slice(1), 'Owns this plan, signs changes', A('sspp.owner') ? 'on' : 'tbd');
        if (!v) { s += box(300, 140, 300, 60, 'How safety is organized', 'To be decided', 'tbd'); return Object.assign(svgWrap(W, 230, s, 'Organization'), { title: 'How the safety program is organized' }); }
        var mid = v === 'supplier' ? 'Program safety group' : 'Aircraft safety group', midSub = v === 'central' ? 'Leads every assessment' : v === 'embedded' ? 'Sets the methods; aircraft-level work' : 'Aircraft-level work; reviews and integrates';
        s += box(330, 135, 240, 60, mid, midSub, 'ok') + arrow(450, 101, 450, 135);
        var busY = 213;
        var n = sys.length + (more ? 1 : 0), gap = 14, bw = Math.min(170, Math.floor((W - 32 - (n - 1) * gap) / Math.max(1, n))), x0 = Math.max(16, (W - (n * bw + (n - 1) * gap)) / 2);
        if (v !== 'central') s += '<text class="pla-l" x="585" y="170" font-size="10.5" fill="' + C.sub + '">' + sx(v === 'embedded' ? 'Reviewed at each design review' : 'Results reviewed and integrated') + '</text>';
        sys.concat(more ? ['and ' + more + ' more systems'] : []).forEach(function (nm, i) {
            var x = x0 + i * (bw + gap), lbl = i >= sys.length ? nm : v === 'central' ? nm : v === 'embedded' ? nm + ' team' : nm + ' supplier', sub = v === 'central' ? 'Assessed by the group' : v === 'embedded' ? 'Own system FHA and PSSA' : 'Its system assessments';
            s += box(x, 230, bw, 56, lbl, i < sys.length ? sub : '', i < sys.length ? 'on' : 'off');
            s += v === 'central' ? poly([[x + bw / 2, busY], [x + bw / 2, 230]]) : poly([[x + bw / 2, 230], [x + bw / 2, busY]], '', { end: false, dash: true });
        });
        s += v === 'central' ? poly([[450, 195], [450, busY]], '', { end: false }) : poly([[450, busY], [450, 195]], '', { dash: true });
        s += '<line x1="' + (x0 + bw / 2) + '" y1="' + busY + '" x2="' + (x0 + (n - 1) * (bw + gap) + bw / 2) + '" y2="' + busY + '" stroke="' + C.line + '" stroke-width="1.3"' + (v === 'central' ? '' : ' stroke-dasharray="4 3"') + '/>' + dot(450, busY);
        if (A('sspp.pa')) s += box(640, 55, 230, 46, optLabelK('sspp.pa', A('sspp.pa')).split(',')[0], 'Process assurance, independent', 'warn') + arrow(640, 78, 560, 78, '', true);
        return Object.assign(svgWrap(W, 310, s, 'Organization'), { title: 'How the safety program is organized' });
    }
    // 4. the development assurance objectives, area by area: where they stand, and how many this plan has decided
    function figObjectives(key) {
        var rows = daCover(key === 'sspp' ? null : key), grp = [];
        rows.forEach(function (r) { var gx = grp.filter(function (x) { return x.g === r.grp; })[0]; if (!gx) { gx = { g: r.grp, met: 0, part: 0, open: 0, dec: 0, n: 0 }; grp.push(gx); } gx.n++; if (r.state === 'satisfied' || r.state === 'attested') gx.met++; else if (r.state === 'partial') gx.part++; else gx.open++; if (r.how.length || !r.qs.length) gx.dec++; });
        var s = head('Development assurance objectives, area by area', 'Bar: where the objectives stand on the evidence now. Right: how many of them this plan says how the program meets.');
        grp.forEach(function (gx, i) {
            var y = 62 + i * 34, W = 470, x = 230, wm = W * gx.met / gx.n, wp = W * gx.part / gx.n;
            s += '<text x="16" y="' + (y + 14) + '" font-size="12" fill="' + C.ink + '">' + sx(gx.g) + '</text>';
            s += '<rect x="' + x + '" y="' + y + '" width="' + W + '" height="20" rx="4" fill="' + C.offF + '" stroke="' + C.off + '" stroke-width=".6"/>' + (wm ? '<rect x="' + x + '" y="' + y + '" width="' + wm + '" height="20" rx="4" fill="' + C.ok + '"/>' : '') + (wp ? '<rect x="' + (x + wm) + '" y="' + y + '" width="' + wp + '" height="20" fill="' + C.warn + '"/>' : '');
            s += '<text x="' + (x + 6) + '" y="' + (y + 14) + '" font-size="10.5" fill="' + (wm > 60 ? '#fff' : C.ink) + '">' + gx.met + ' met, ' + gx.part + ' partly, ' + gx.open + ' not yet</text>';
            s += '<text x="' + (x + W + 16) + '" y="' + (y + 14) + '" font-size="11.5" fill="' + (gx.dec === gx.n ? C.ok : C.tbd) + '" font-weight="700">' + gx.dec + ' of ' + gx.n + ' decided</text>';
        });
        var h = 62 + grp.length * 34 + 30;
        s += legend(16, h - 22, [['ok', 'Met or signed'], ['warn', 'Partly met'], ['off', 'Not yet']]);
        return Object.assign(svgWrap(900, h, s, 'Objectives'), { title: 'Development assurance objectives, area by area' });
    }
    // 5. the reviews and baselines through the program, as answered
    function figReviews() {
        var v = A('sspp.reviews'), cm = A('sspp.cm'), soi = A('sspp.soi') === 'soi';
        var steps = [['SRR', 'Plans agreed', 'Aircraft FHA started'], ['PDR', 'Preliminary design', 'PSSA presented'], ['CDR', 'Detailed design', 'SSA presented'], ['Test', 'Verification', 'Safety claims closed by test'], ['TC', 'Certification', 'ASA and compliance']];
        var s = head('Reviews, baselines and the authority through the program', v ? optLabelK('sspp.reviews', v) : 'When the safety work is presented: to be decided');
        var x0 = 40, step = 165, y = 110;
        s += '<line x1="30" y1="' + (y + 28) + '" x2="870" y2="' + (y + 28) + '" stroke="' + C.line + '" stroke-width="2" marker-end="url(#pla-ah)"/>';
        steps.forEach(function (st, i) {
            var x = x0 + i * step;
            s += box(x, y, 140, 56, st[0] + ': ' + st[1], v ? st[2] : 'To be decided', v ? 'on' : 'tbd');
            if (v === 'pdr_cdr' && (i === 1 || i === 2)) s += box(x + 10, y - 58, 120, 36, 'Engineering safety review', '', 'warn') + arrow(x + 70, y - 22, x + 70, y);
            if (v === 'gates') s += '<text x="' + (x + 70) + '" y="' + (y - 14) + '" font-size="10.5" fill="' + C.warn + '" text-anchor="middle">Gates signed before it</text>';
            if (v === 'every') s += '<text x="' + (x + 70) + '" y="' + (y - 14) + '" font-size="10.5" fill="' + C.warn + '" text-anchor="middle">Safety item on the agenda</text>';
            var bl = cm === 'reviews' ? i < 3 : cm === 'gates' ? i < 4 : cm === 'cert' ? i === 4 : false;
            if (bl) s += '<rect x="' + (x + 50) + '" y="' + (y + 76) + '" width="40" height="22" rx="4" fill="' + C.okF + '" stroke="' + C.ok + '"/><text x="' + (x + 70) + '" y="' + (y + 91) + '" font-size="10" fill="' + C.ok + '" text-anchor="middle">Baseline</text>';
            if (soi && i < 4) s += '<text x="' + (x + 70) + '" y="' + (y + 118) + '" font-size="10.5" fill="' + C.on + '" text-anchor="middle">SOI ' + (i + 1) + '</text>';
        });
        if (!cm) s += '<text x="40" y="' + (y + 92) + '" font-size="10.5" fill="' + C.tbd + '">When the safety data are baselined: to be decided</text>';
        return Object.assign(svgWrap(900, 260, s, 'Reviews'), { title: 'Reviews, baselines and the authority through the program' });
    }
    // HF: the ten steps through the design cycle, with where each stands
    function figHfSteps() {
        var cov = safe(function () { return root.SLHfAuto.coverage(); }, []) || [], s = head('The human factors work through the design cycle', 'Each step of the HF Autopilot, in the design phase it belongs to, with how much of it is answered.');
        var phases = []; cov.forEach(function (c0) { if (phases.indexOf(c0.phase) < 0) phases.push(c0.phase); });
        var colW = 860 / Math.max(1, phases.length);
        phases.forEach(function (ph, pi) {
            var x = 20 + pi * colW, inPh = cov.filter(function (c0) { return c0.phase === ph; });
            s += '<rect x="' + x + '" y="56" width="' + (colW - 10) + '" height="' + (40 + inPh.length * 62) + '" rx="10" fill="#F8FAFC" stroke="#e3e5e8"/><text x="' + (x + 10) + '" y="76" font-size="12" font-weight="700" fill="' + C.sub + '">' + sx(ph) + '</text>';
            inPh.forEach(function (c0, i) { var kind = c0.state === 'done' ? 'ok' : c0.open ? 'warn' : c0.answered ? 'on' : c0.questions ? 'off' : 'off'; s += box(x + 10, 88 + i * 62, colW - 30, 52, c0.n + '. ' + c0.title, (c0.questions ? c0.answered + ' of ' + c0.questions + ' answered' : 'Nothing to ask yet') + (c0.open ? ', ' + c0.open + ' open' : ''), kind); });
        });
        var h = 56 + 40 + Math.max.apply(null, phases.map(function (ph) { return cov.filter(function (c0) { return c0.phase === ph; }).length; }).concat([1])) * 62 + 40;
        s += legend(20, h - 24, [['ok', 'Signed'], ['warn', 'Has open items'], ['on', 'Started'], ['off', 'Not started']]);
        return Object.assign(svgWrap(900, h, s, 'HF steps'), { title: 'The human factors work through the design cycle' });
    }
    // HF: who shows each claim, and the independence of the people who evaluate
    function figHfEval() {
        var s = head('How the human factors claims are shown', 'From the analysis to the evidence, and who evaluates it.');
        var ev = A('hfp.eval'), pl = A('hfp.pilots'), cr = A('hfp.credit');
        s += box(20, 70, 190, 60, 'HF Autopilot analysis', 'Allocation, workload, errors, alerts', 'ok') + arrow(210, 100, 250, 100);
        s += box(250, 70, 190, 60, ev === 'mock' ? 'Mock-ups, then simulator' : ev === 'flight' ? 'Simulator, then flight test' : ev === 'sim' ? 'Simulator campaign' : 'Evaluations', ev ? 'Scenarios per phase and failure' : 'To be decided', ev ? 'on' : 'tbd') + arrow(440, 100, 480, 100);
        s += box(480, 70, 190, 60, cr === 'asm' ? 'HF assumptions validated' : cr === 'note' ? 'Notes on failure conditions' : 'Crew credit', cr ? 'What the safety case counts on' : 'To be decided', cr ? 'ok' : 'tbd') + arrow(670, 100, 710, 100);
        s += box(710, 70, 170, 60, 'Safety assessment', 'Failure conditions classified on it', 'on');
        s += box(250, 170, 190, 56, pl === 'line' ? 'Line pilots, not designers' : pl === 'test' ? 'Company test pilots' : pl === 'both' ? 'Test pilots and line pilots' : 'Who evaluates', pl ? (pl === 'test' ? 'Not independent of the design' : 'Independent of the design') : 'To be decided', pl ? (pl === 'test' ? 'warn' : 'ok') : 'tbd') + arrow(345, 170, 345, 130);
        return Object.assign(svgWrap(900, 250, s, 'HF evidence'), { title: 'How the human factors claims are shown' });
    }
    // RAM: how the reliability work feeds the safety assessment and maintenance
    function figRam() {
        var s = head('How the reliability and maintainability work feeds safety and maintenance', 'Dashed: not in the program.');
        var k = function (lane) { return laneOn(lane) ? 'on' : 'off'; }, rates = picked('ramp.rates').map(function (x) { return { supplier: 'supplier data', nprd: 'NPRD/EPRD', 217: '217F', fides: 'FIDES' }[x]; }).join(', ');
        s += box(20, 70, 190, 56, 'Failure rates', rates || 'Source to be decided', rates ? 'ok' : 'tbd') + arrow(210, 98, 250, 98);
        s += box(250, 70, 190, 56, 'Fault trees', 'PSSA and SSA', 'ok') + arrow(440, 98, 480, 98);
        s += box(480, 70, 190, 56, 'Latent failures', 'Check intervals (CCMR)', k('ccmr')) + arrow(670, 98, 710, 98);
        s += box(710, 70, 170, 56, 'CMRs', 'Kept apart in maintenance', laneOn('ccmr') ? 'on' : 'off');
        s += box(20, 170, 190, 56, 'Reliability program', A('ramp.need') === 'full' ? 'Allocation, growth, FRACAS' : 'Rates for safety only', k('ram-reliability')) + arrow(115, 170, 115, 126);
        s += box(250, 170, 190, 56, 'Test and service', A('ramp.fracas') === 'sl' ? 'FRACAS in Safety Lab' : A('ramp.fracas') ? 'Company FRACAS' : 'To be decided', A('ramp.fracas') ? 'on' : 'tbd') + arrow(250, 198, 210, 198, 'grows') + arrow(345, 170, 345, 126, 'surprises', true);
        s += box(480, 170, 190, 56, 'Maintainability', 'MTTR, testability', k('ram-mx')) + arrow(670, 198, 710, 198);
        s += box(710, 170, 170, 56, 'Scheduled maintenance', A('ramp.msg3') === 'msg3' ? 'MSG-3' : A('ramp.msg3') ? 'Own method' : 'To be decided', A('ramp.msg3') ? k('ram-msg3') === 'off' && A('ramp.msg3') === 'msg3' ? 'off' : 'on' : 'tbd') + arrow(795, 126, 795, 170, '', true);
        s += box(480, 260, 190, 50, 'Dispatch relief', 'MMEL checked against safety', k('ram-mmel')) + arrow(575, 260, 575, 226, '', true);
        return Object.assign(svgWrap(900, 330, s, 'RAM'), { title: 'How the reliability and maintainability work feeds safety and maintenance' });
    }
    // 6 Nov 2026 (Waqas: "diagram examples ... are in both 4761 A and 4754 B is how these diagrams should appear with
    // programatic picks dictating the mods"): the process pictures follow the layouts of the example figures in ARP4761A
    // (the safety assessment funnel) and ARP4754B (the safety assessment process model, DAL assignment, planning,
    // validation, configuration management), drawn by us in our own words. The answers change them: the methods in each
    // box, a lane left out drawn dashed, the tools named, the rules written inside the boxes.
    function poly(pts, label, o) {
        o = o || {};
        var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ',' + p[1]; }).join(' ');
        var s = '<path d="' + d + '" fill="none" stroke="' + C.line + '" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"' + (o.end === false ? '' : ' marker-end="url(#pla-ah)"') + (o.both ? ' marker-start="url(#pla-ah)"' : '') + (o.dash ? ' stroke-dasharray="4 3"' : '') + '/>';
        if (label) { var lx = o.lx != null ? o.lx : (pts[0][0] + pts[1][0]) / 2, ly = o.ly != null ? o.ly : (pts[0][1] + pts[1][1]) / 2 - 4; wrapText(label, o.wrap || 30).forEach(function (l, i) { s += '<text class="pla-l" x="' + lx + '" y="' + (ly + i * 11) + '" font-size="9.5" fill="' + C.sub + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + '>' + sx(l) + '</text>'; }); }
        return s;
    }
    function dot(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="2.6" fill="' + C.line + '"/>'; }
    // a white box with a black edge (a safety assessment step), a grey one (development), or dashed (left out)
    function sbox(x, y, w, h, title, sub, kind, stack) {
        var fill = kind === 'dev' ? '#E5E7EB' : kind === 'yel' ? '#FFF7C2' : '#ffffff', st = kind === 'off' ? C.off : C.ink, dash = kind === 'off' || kind === 'tbd' ? ' stroke-dasharray="5 4"' : '';
        var s = '';
        if (stack) for (var i = 2; i >= 1; i--) s += '<rect x="' + (x + i * 5) + '" y="' + (y - i * 5) + '" width="' + w + '" height="' + h + '" fill="' + fill + '" stroke="' + st + '" stroke-width="1"' + dash + '/>';
        s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (kind === 'off' ? C.offF : kind === 'tbd' ? C.tbdF : fill) + '" stroke="' + (kind === 'tbd' ? C.tbd : st) + '" stroke-width="1.2"' + dash + '/>';
        var tl = wrapText(title, Math.max(8, Math.floor(w / 7.6))), sl = sub ? wrapText(sub, Math.max(10, Math.floor(w / 5.6))) : [], tot = tl.length * 14 + sl.length * 11, y0 = y + h / 2 - tot / 2 + 11;
        tl.forEach(function (l, i) { s += '<text x="' + (x + w / 2) + '" y="' + (y0 + i * 14) + '" font-size="12.5" font-weight="700" fill="' + (kind === 'off' ? C.off : C.ink) + '" text-anchor="middle">' + sx(l) + '</text>'; });
        sl.forEach(function (l, i) { s += '<text x="' + (x + w / 2) + '" y="' + (y0 + tl.length * 14 + i * 11) + '" font-size="9.5" fill="' + (kind === 'tbd' ? C.tbd : C.sub) + '" text-anchor="middle">' + sx(l) + '</text>'; });
        return s;
    }
    function methods(list) { var m = list.filter(function (x) { return laneOn(x[0]); }).map(function (x) { return x[1]; }); return m.length ? 'Methods: ' + m.join(', ') : 'No methods in the program'; }
    function toolOf(sec) { var t = safe(function () { return root.declaredToolchain(); }, null) || {}; var r = t[sec] || {}; return r.tool === 'other' ? (r.toolOther || '') : sec === 'rm' ? (RM_NAMES[r.tool] || '') : (MBSE_NAMES[r.tool] || ''); }

    // the safety assessment funnel through the development phases (the layout of ARP4761A Figures 1 and 3)
    function figFunnel() {
        var c = counts(), pasaNo = A('sspp.pasa') === 'no';
        var s = head('The safety assessment through the development phases', 'Down the left: aircraft, then systems, then items. Up the right: the results shown. Each box lists the methods this program uses there.');
        [['Concept', 20, 180], ['Preliminary and detailed design', 210, 350], ['Integration and verification', 570, 310]].forEach(function (p) { s += '<rect x="' + p[1] + '" y="54" width="' + p[2] + '" height="30" fill="#E5E7EB" stroke="' + C.ink + '"/><text x="' + (p[1] + p[2] / 2) + '" y="74" font-size="12" font-weight="700" font-style="italic" fill="' + C.ink + '" text-anchor="middle">' + sx(p[0]) + '</text>'; });
        s += '<polygon points="20,96 880,96 560,450 340,450" fill="#D5D9E0"/>';
        s += '<text x="450" y="114" font-size="12.5" font-weight="700" fill="#4b5563" text-anchor="middle">SAFETY ASSESSMENT</text><text x="450" y="132" font-size="11.5" font-style="italic" fill="#4b5563" text-anchor="middle">Aircraft level</text><text x="560" y="300" font-size="11.5" font-style="italic" fill="#4b5563" text-anchor="middle">System level</text><text x="450" y="430" font-size="11.5" font-style="italic" fill="#4b5563" text-anchor="middle">Item level</text>';
        s += sbox(30, 140, 160, 44, 'AFHA', c.afha + ' aircraft failure conditions');
        s += sbox(100, 208, 320, 46, 'PASA', pasaNo ? 'Not done: tailored out' : methods([['cma', 'CMA'], ['pra', 'PRA'], ['zsa', 'ZSA'], ['fta', 'FTA'], ['cea', 'CEA']]), pasaNo ? 'off' : 'w');
        s += sbox(190, 282, 150, 44, 'System FHAs', c.sfha + ' system failure conditions', 'w', true);
        s += sbox(232, 352, 240, 46, 'PSSA', methods([['cma', 'CMA'], ['fta', 'FTA'], ['markov', 'Markov'], ['cea', 'CEA'], ['stpa', 'STPA']]), 'w', true);
        s += sbox(500, 300, 240, 46, 'SSA', methods([['cma', 'CMA'], ['fta', 'FTA'], ['ffmea', 'FMEA'], ['ppfmea', 'piece-part FMEA'], ['markov', 'Markov']]), 'w', true);
        s += sbox(540, 166, 330, 46, 'ASA', methods([['cma', 'CMA'], ['pra', 'PRA'], ['zsa', 'ZSA'], ['fta', 'FTA'], ['ffmea', 'FMEA']]));
        s += sbox(350, 456, 200, 42, 'Hardware and software', 'Design and build to their DALs', 'dev');
        s += poly([[40, 184], [40, 232], [100, 232]], 'Aircraft failure conditions and classes', { lx: 4, ly: 200, wrap: 14 });
        s += poly([[150, 254], [150, 304], [190, 304]], 'Failure conditions given to the systems', { lx: 34, ly: 270, wrap: 16 });
        s += poly([[200, 326], [200, 376], [232, 376]], 'System failure conditions and classes', { lx: 70, ly: 344, wrap: 18 });
        s += poly([[400, 254], [400, 347]], A('sspp.dal') ? 'FDALs, safety objectives, independence needed' : 'FDALs (how assigned: to be decided)', { lx: 408, ly: 286, wrap: 20 });
        s += poly([[300, 398], [300, 477], [350, 477]], 'IDALs, independence and item safety requirements', { lx: 120, ly: 432, wrap: 26 });
        s += poly([[550, 477], [620, 477], [620, 346]], 'Item results', { lx: 628, ly: 430 });
        s += poly([[740, 323], [800, 323], [800, 212]], 'DAL results, probabilities, independence shown', { lx: 806, ly: 270, wrap: 14 });
        s += '<rect x="20" y="508" width="14" height="11" fill="#E5E7EB" stroke="' + C.ink + '"/><text x="40" y="518" font-size="10.5" fill="' + C.sub + '">Development</text><rect x="140" y="508" width="14" height="11" fill="#fff" stroke="' + C.ink + '"/><text x="160" y="518" font-size="10.5" fill="' + C.sub + '">Safety assessment</text><rect x="290" y="508" width="14" height="11" fill="' + C.offF + '" stroke="' + C.off + '" stroke-dasharray="3 2"/><text x="310" y="518" font-size="10.5" fill="' + C.sub + '">Left out of the program</text>';
        return Object.assign(svgWrap(900, 530, s, 'Safety assessment funnel'), { title: 'The safety assessment through the development phases' });
    }
    // the safety assessment beside the development process (the layout of ARP4754B Figure 6)
    function figModel() {
        var c = counts(), pasaNo = A('sspp.pasa') === 'no', mb = toolOf('mbse'), rm = toolOf('rm');
        var s = head('The safety assessment beside the development process', 'Left: safety assessment, with the common cause analyses. Right: development. The arrows are what passes between them.');
        s += '<line x1="440" y1="50" x2="440" y2="650" stroke="' + C.line + '" stroke-dasharray="10 6"/>';
        s += '<text x="250" y="666" font-size="11" font-style="italic" fill="' + C.sub + '" text-anchor="middle">Safety assessment</text><text x="680" y="666" font-size="11" font-style="italic" fill="' + C.sub + '" text-anchor="middle">Development</text>';
        s += '<rect x="500" y="56" width="380" height="580" fill="#EEF0F3" stroke="#c7cbd1"/>';
        // common cause panel
        s += '<rect x="20" y="150" width="120" height="400" fill="#fff" stroke="' + C.ink + '"/><text x="80" y="174" font-size="11.5" font-style="italic" fill="' + C.ink + '" text-anchor="middle">Common cause</text><text x="80" y="188" font-size="11.5" font-style="italic" fill="' + C.ink + '" text-anchor="middle">analyses</text>';
        s += sbox(32, 210, 96, 60, 'Zonal safety', laneOn('zsa') ? (c.zsa + ' rows') : 'Left out', laneOn('zsa') ? 'w' : 'off') + sbox(32, 300, 96, 60, 'Particular risks', laneOn('pra') ? (c.pra + ' rows') : 'Left out', laneOn('pra') ? 'w' : 'off') + sbox(32, 390, 96, 60, 'Common mode', laneOn('cma') ? (c.cma + ' rows') : 'Left out', laneOn('cma') ? 'w' : 'off');
        if (laneOn('ipledger')) s += sbox(32, 470, 96, 50, 'Independence ledger', '', 'w');
        // safety column
        s += sbox(200, 64, 160, 46, 'AFHA', c.afha + ' failure conditions') + sbox(200, 154, 160, 46, 'PASA', pasaNo ? 'Tailored out' : '', pasaNo ? 'off' : 'w') + sbox(200, 254, 160, 46, 'System FHAs', A('sspp.sfha') ? optLabelK('sspp.sfha', A('sspp.sfha')) : c.sfha + ' failure conditions', 'w', true) + sbox(200, 364, 160, 46, 'PSSAs', c.trees + ' fault trees', 'w', true) + sbox(200, 464, 160, 46, 'SSAs', 'As-built results', 'w', true) + sbox(170, 570, 140, 46, 'ASA', 'Aircraft level');
        // development column
        s += sbox(520, 64, 340, 50, 'Aircraft functions and requirements', c.functions + ' functions' + (mb ? ', from ' + mb : ''), 'dev') + sbox(520, 150, 340, 54, 'Aircraft architecture, functions given to systems', c.systems + ' systems', 'dev') + sbox(520, 240, 340, 80, 'System requirements', c.reqs + ' requirements' + (rm ? ', managed in ' + rm : ', kept in Safety Lab'), 'dev') + sbox(520, 350, 340, 60, 'System architecture, requirements given to items', c.items + ' items', 'dev') + sbox(520, 450, 340, 50, 'Implementation', '', 'dev') + sbox(520, 560, 340, 56, 'System and aircraft integration and verification', A('sspp.test') ? optLabelK('sspp.test', A('sspp.test')) : '', 'dev');
        [[114, 154], [200, 254], [300, 364], [410, 464]].forEach(function (p) { s += poly([[280, p[0] - 4], [280, p[1] - 4]]); });
        s += poly([[280, 510], [280, 570]]) + poly([[690, 114], [690, 150]]) + poly([[690, 204], [690, 240]]) + poly([[690, 320], [690, 350]]) + poly([[690, 410], [690, 450]]) + poly([[690, 500], [690, 560]]);
        s += poly([[520, 80], [360, 80]], 'Aircraft functions', { lx: 450, ly: 74, anchor: 'middle' }) + poly([[360, 100], [520, 100]], 'Failure conditions and classes', { lx: 450, ly: 114, anchor: 'middle' });
        s += poly([[520, 170], [360, 170]], 'Aircraft architecture', { lx: 450, ly: 164, anchor: 'middle' }) + poly([[360, 190], [520, 190]], 'Aircraft safety requirements', { lx: 450, ly: 204, anchor: 'middle' });
        s += poly([[520, 268], [360, 268]], 'System functions', { lx: 450, ly: 262, anchor: 'middle' }) + poly([[360, 290], [520, 290]], 'Failure conditions and classes', { lx: 450, ly: 304, anchor: 'middle' });
        s += poly([[520, 376], [360, 376]], 'System architecture', { lx: 450, ly: 370, anchor: 'middle' }) + poly([[360, 398], [520, 398]], 'Item safety requirements and IDALs', { lx: 450, ly: 412, anchor: 'middle' });
        s += poly([[520, 475], [360, 475]], 'Implementation', { lx: 450, ly: 469, anchor: 'middle' }) + poly([[310, 593], [520, 593]], 'Results', { lx: 410, ly: 587, anchor: 'middle', both: true });
        s += poly([[200, 177], [140, 177]], 'Failure conditions, objectives', { lx: 170, ly: 140, anchor: 'middle', wrap: 16 }) + poly([[140, 230], [200, 230], [200, 200]]) + poly([[200, 387], [140, 387]]) + poly([[140, 520], [190, 520], [190, 570]], 'Results', { lx: 150, ly: 540 });
        s += poly([[230, 510], [230, 570]]);
        return Object.assign(svgWrap(900, 680, s, 'Safety assessment process model'), { title: 'The safety assessment beside the development process' });
    }
    // DAL assignment (the layout of ARP4754B Figure 7), with the rules this program picked inside, and the levels now
    function figAssign() {
        var v = A('sspp.dal'), iv = A('sspp.idal'), c = counts(), s = head('How the development assurance levels are assigned', 'Inputs on the left, the rules this program uses in the middle, what comes out on the right.');
        s += '<rect x="250" y="60" width="330" height="230" fill="none" stroke="' + C.ink + '" stroke-dasharray="9 6" stroke-width="1.4"/><text x="262" y="80" font-size="13" fill="' + C.ink + '">PASA and PSSA</text>';
        var rule = (v === 'indep' ? 'A level is lowered only where independence allows it, marked CMA pending until the common mode analysis confirms it.' : v === 'no' ? 'Every level is what the worst failure condition asks; none is lowered.' : 'Whether a level can be lowered: to be decided.') + ' ' + (iv === 'arch' ? 'Item levels from the architecture.' : iv === 'fdal' ? 'Items take their function\'s level.' : 'Item levels: to be decided.');
        s += sbox(330, 130, 210, 130, 'FDAL and IDAL assignment', rule, v && iv ? 'yel' : 'tbd');
        [['FHAs (aircraft, systems)', c.afha + c.sfha + ' failure conditions', 96], ['Functions', c.functions + ' aircraft functions', 146], ['Operational requirements', '', 196], ['Proposed architecture', c.systems + ' systems', 246]].forEach(function (r) { s += '<text x="20" y="' + r[2] + '" font-size="12.5" fill="' + C.ink + '">' + sx(r[0]) + '</text>' + (r[1] ? '<text x="20" y="' + (r[2] + 13) + '" font-size="9.5" fill="' + C.sub + '">' + sx(r[1]) + '</text>' : '') + poly([[20, r[2] + 4], [250, r[2] + 4]], '', {}); });
        s += poly([[580, 96], [640, 96]]) + '<text x="648" y="100" font-size="12.5" fill="' + C.ink + '">Architecture confirmed or changed</text>';
        s += poly([[580, 146], [640, 146]]) + '<text x="648" y="150" font-size="12.5" fill="' + C.ink + '">Safety requirements</text>';
        s += poly([[540, 196], [640, 196]]) + '<text x="648" y="200" font-size="12.5" fill="' + C.ink + '">FDALs and IDALs</text><text x="660" y="216" font-size="11" fill="' + C.sub + '">for functions (top: DAL ' + sx(topDal() || 'none yet') + ')</text><text x="660" y="230" font-size="11" fill="' + C.sub + '">for electronic hardware</text><text x="660" y="244" font-size="11" fill="' + C.sub + '">for software</text>';
        s += poly([[415, 290], [415, 320], [200, 320], [200, 254]], 'Changes to the architecture', { lx: 230, ly: 334 });
        var by = { A: 0, B: 0, C: 0, D: 0 }, all = arr('acFhaData').concat(arr('systemsData').reduce(function (a, x) { return a.concat(Array.isArray(x.fha) ? x.fha : []); }, []));
        all.forEach(function (f) { var d = { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D' }[f.severity]; if (d) by[d]++; });
        var y = 370, max = Math.max(1, by.A, by.B, by.C, by.D);
        s += '<text x="20" y="' + y + '" font-size="12" font-weight="700" fill="' + C.ink + '">Failure conditions in the project by the level their severity asks for</text>';
        ['A', 'B', 'C', 'D'].forEach(function (d, i) { var w = Math.round(500 * by[d] / max), yy = y + 12 + i * 22; s += '<text x="20" y="' + (yy + 12) + '" font-size="11" fill="' + C.sub + '">DAL ' + d + '</text><rect x="70" y="' + yy + '" width="500" height="15" rx="3" fill="' + C.offF + '"/><rect x="70" y="' + yy + '" width="' + w + '" height="15" rx="3" fill="' + C.on + '"/><text x="' + (76 + w) + '" y="' + (yy + 12) + '" font-size="11" fill="' + C.ink + '">' + by[d] + '</text>'; });
        return Object.assign(svgWrap(900, 470, s, 'DAL assignment'), { title: 'How the development assurance levels are assigned' });
    }
    // the planning process (the layout of ARP4754B Figure 2), each step showing where this program stands
    function figPlanning() {
        var st = PLANS.map(function (p) { return status(p.key); }), open = st.reduce(function (n, x) { return n + x.miss; }, 0);
        var s = head('How the plans are made', 'Each step shows where this program stands. The plans move to development once nothing is left to decide.');
        var row = [['Which plans, how written', PLANS.map(function (p, i) { return p.code + ': ' + (st[i].miss ? st[i].miss + ' open' : 'answered'); }).join(', '), st.every(function (x) { return x.miss === 0; })],
            ['Phases each plan covers', A('sspp.reviews') ? optLabelK('sspp.reviews', A('sspp.reviews')) : 'To be decided', !!A('sspp.reviews')],
            ['Transition criteria', A('sspp.transition') ? optLabelK('sspp.transition', A('sspp.transition')) : 'To be decided', !!A('sspp.transition')],
            ['How the plans relate', 'The HF and RAM plans sit under the SSPP', true],
            ['Deviations from the plans', A('sspp.owner') ? 'Signed by the ' + lcFirst(optLabelK('sspp.owner', A('sspp.owner')).replace(/^The /, '')) : 'Who signs: to be decided', !!A('sspp.owner')],
            ['Standards and processes', 'ARP4754B, ARP4761A, ' + basis(), true]];
        row.forEach(function (r, i) { var x = 16 + i * 147; s += sbox(x, 60, 132, 96, r[0], r[1], r[2] ? 'w' : 'tbd'); if (i < 5) s += poly([[x + 132, 108], [x + 147, 108]]); });
        s += poly([[16 + 5 * 147 + 132, 108], [880, 108], [880, 175], [60, 175], [60, 200]]);
        s += sbox(20, 200, 120, 60, 'Write the plans', 'In the Plan Autopilot') + poly([[140, 230], [170, 230]]) + sbox(170, 200, 140, 60, 'Review the plans', 'Accurate, consistent, complete') + poly([[310, 230], [340, 230]]);
        s += '<polygon points="400,190 460,230 400,270 340,230" fill="' + (open ? C.tbdF : C.okF) + '" stroke="' + (open ? C.tbd : C.ok) + '"/><text x="400" y="226" font-size="11" font-weight="700" fill="' + C.ink + '" text-anchor="middle">Nothing</text><text x="400" y="239" font-size="11" font-weight="700" fill="' + C.ink + '" text-anchor="middle">left open?</text>';
        s += poly([[400, 270], [400, 290], [80, 290], [80, 260]], 'No: ' + open + ' decision' + (open === 1 ? '' : 's') + ' open', { lx: 250, ly: 304, anchor: 'middle' });
        s += poly([[460, 230], [500, 230]], 'Yes', { lx: 466, ly: 224 }) + '<path d="M500,202 h150 v48 q-37,14 -75,0 t-75,0 z" fill="#fff" stroke="' + C.ink + '"/><text x="575" y="222" font-size="11.5" font-weight="700" fill="' + C.ink + '" text-anchor="middle">Plans issued</text><text x="575" y="236" font-size="9.5" fill="' + C.sub + '" text-anchor="middle">Word, signed</text>';
        s += '<line x1="690" y1="185" x2="690" y2="285" stroke="' + C.line + '" stroke-dasharray="6 4"/>' + poly([[650, 228], [720, 228]]) + sbox(720, 200, 160, 60, 'Development', 'The work, held to the plans', 'dev', true);
        return Object.assign(svgWrap(900, 320, s, 'Planning process'), { title: 'How the plans are made' });
    }
    // validation and verification of the requirements (after the layout of ARP4754B Figures 8 and 9)
    function figVV() {
        var c = counts(), iv = A('sspp.indepvv'), ivTxt = iv ? 'At DAL A and B, done by ' + ({ peer: 'an engineer from another team', group: 'a separate V and V group', der: 'a DER or the customer' }[iv]) : 'Who checks independently: to be decided';
        var s = head('Validation and verification of the requirements', 'Left: what development hands over. Right: how the program checks the requirements are right (validation) and met (verification).');
        s += sbox(20, 60, 170, 120, 'Aircraft and system development', c.reqs + ' requirements', 'w') + sbox(40, 200, 130, 34, 'Assumptions', c.asm + ' recorded', 'w') + sbox(30, 250, 150, 40, 'Certification basis and standards', basis(), 'w');
        s += '<line x1="220" y1="50" x2="220" y2="440" stroke="' + C.line + '" stroke-dasharray="10 6"/>';
        s += poly([[190, 120], [236, 120]], '', { end: false }) + poly([[170, 217], [236, 217]], '', { end: false }) + poly([[180, 270], [236, 270]], '', { end: false }) + poly([[236, 102], [236, 292]], '', { end: false }) + dot(236, 120) + dot(236, 217) + dot(236, 270) + poly([[236, 102], [260, 102]]) + poly([[236, 292], [260, 292]]);
        s += '<text x="260" y="70" font-size="12" font-weight="700" fill="' + C.ink + '">Validation</text>';
        s += sbox(260, 80, 120, 44, 'Tracking (start)', '') + poly([[380, 102], [410, 102]]) + sbox(410, 70, 170, 64, 'Correct and complete checks', ivTxt, iv ? 'w' : 'tbd') + poly([[580, 102], [610, 102]]) + sbox(610, 80, 120, 44, 'Tracking (end)', '') + poly([[730, 102], [760, 102]]) + sbox(760, 80, 120, 44, 'Validation summary', '');
        s += sbox(410, 150, 170, 44, 'Approach by DAL', 'Methods and rigor set by each level') + poly([[495, 150], [495, 134]]);
        s += '<text x="260" y="250" font-size="12" font-weight="700" fill="' + C.ink + '">Verification</text>';
        var tv = A('sspp.test');
        s += sbox(260, 270, 120, 44, 'Verification plan', '') + poly([[380, 292], [410, 292]]) + sbox(410, 260, 170, 64, 'Tests, analyses, reviews', ivTxt, iv ? 'w' : 'tbd') + poly([[580, 292], [610, 292]]) + sbox(610, 262, 120, 60, 'Results', tv === 'link' ? 'Each linked to its claim' : tv === 'ssa' ? 'Gathered at the SSA' : 'Tracking: to be decided', tv ? 'w' : 'tbd') + poly([[730, 292], [760, 292]]) + sbox(760, 270, 120, 44, 'Verification summary', '');
        s += poly([[820, 314], [820, 360], [280, 360], [280, 330]], 'Safety claims closed back in the safety assessment', { lx: 550, ly: 376, anchor: 'middle' });
        return Object.assign(svgWrap(900, 400, s, 'Validation and verification'), { title: 'Validation and verification of the requirements' });
    }
    // configuration management of the safety data (the layout of ARP4754B Figure 10)
    function figCm() {
        var cm = A('sspp.cm'), cc = A('sspp.ccat'), s = head('Configuration management of the safety data', 'From the plan to the archive. The answers set when baselines are taken and how tightly the data is held.');
        var fat = function (x1, y1, x2, y2, both, label) { return poly([[x1, y1], [x2, y2]], label, { both: both, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2 - 6, anchor: 'middle', wrap: 40 }); };
        s += '<text x="20" y="96" font-size="12" font-weight="700" fill="' + C.ink + '">New designs</text>' + fat(20, 104, 150, 104) + '<text x="20" y="146" font-size="12" font-weight="700" fill="' + C.ink + '">Changes</text>' + fat(20, 154, 150, 154);
        s += sbox(150, 60, 600, 120, 'Configuration management of the safety data', 'Kept in Safety Lab with its history; this plan sets how', 'w');
        s += fat(240, 180, 240, 210) + sbox(160, 210, 170, 90, 'Identification and baselines', cm ? 'Baselines ' + ({ reviews: 'at each design review', gates: 'at each signed gate', cert: 'at each submission' }[cm]) : 'When: to be decided', cm ? 'w' : 'tbd');
        s += fat(330, 250, 780, 250, true, 'Change control and problem reporting');
        s += fat(400, 250, 400, 300) + sbox(340, 300, 140, 60, 'Interim configurations', '') + fat(480, 330, 780, 330, true, 'Change control and problem reporting');
        s += fat(450, 360, 450, 390) + sbox(400, 390, 150, 56, 'Design complete', 'Final safety assessment') + fat(550, 418, 780, 418, false, 'Archive');
        s += sbox(780, 200, 100, 260, 'Archive and retrieval', cc ? ({ dal: 'Category 1 for DAL A and B data, 2 below', sc1: 'Category 1 for all' }[cc]) : 'Control category: to be decided', cc ? 'w' : 'tbd');
        return Object.assign(svgWrap(900, 470, s, 'Configuration management'), { title: 'Configuration management of the safety data' });
    }
    // which picture goes in which section
    function secFigs(key, sec) {
        var F = {
            sspp: { 'How the safety program is organized': [figOrg], 'Safety responsibilities': [figReviews], 'The safety assessment process and its methods': [figFunnel, figModel, figAssign], 'Common cause analyses': [], 'Development assurance objectives': [figPlanning, figVV, function () { return figObjectives('sspp'); }], 'Records and changes to this plan': [figCm] },
            hfp: { 'The human factors work through the design cycle': [figHfSteps], 'Evaluations and who does them': [figHfEval], 'Development assurance objectives': [function () { return figObjectives('hfp'); }] },
            ramp: { 'Scope and purpose': [figRam], 'Development assurance objectives': [function () { return figObjectives('ramp'); }] }
        };
        return ((F[key] || {})[sec] || []).map(function (f) { var r = safe(f, null); return r ? { k: 'fig', title: r.title, svg: r.svg, w: r.w, h: r.h } : null; }).filter(Boolean);
    }
    function doc(key) {
        var plan = BY[key], blocks = [];
        plan.secs.forEach(function (sec, i) {
            blocks.push(H(1, (i + 1) + '. ' + sec));
            var intro = secIntro(key, sec); if (intro) blocks.push(P(intro));
            questions(key).filter(function (q) { return q.sec === sec; }).forEach(function (q) { blocks.push(P(txtOf(q))); });
            secFigs(key, sec).forEach(function (f) { blocks.push(f); });
            secTables(key, sec).forEach(function (t) { blocks.push(t); });
        });
        var gp = gaps(key);
        if (gp.length) { blocks.push(H(1, (plan.secs.length + 1) + '. To be decided')); blocks.push(P('These questions are not answered yet. Each is written into the plan above as "To be decided" until it is.')); blocks.push(TBL('Open decisions', gp.map(function (x, i) { return { '#': String(i + 1), Decision: x }; }))); }
        return blocks;
    }
    function docHtml(blocks) {
        var t = 0, f = 0;
        return blocks.map(function (b) {
            if (b.k === 'fig') { f++; return '<div class="pla-fig">' + b.svg + '</div><div class="pla-cap">Figure ' + f + ': ' + E(b.title) + '</div>'; }
            if (b.k === 'h') return '<h' + (b.level + 2) + ' class="pla-dh">' + E(b.text) + '</h' + (b.level + 2) + '>';
            if (b.k === 'p') return '<p class="' + (/^To be decided/.test(b.text) ? 'pla-tbd' : '') + '">' + E(b.text) + '</p>';
            if (b.k === 'table') { t++; var hd = b.rows.length ? Object.keys(b.rows[0]) : []; return '<div class="pla-cap">Table ' + t + ': ' + E(b.title) + '</div>' + (b.rows.length ? '<table class="pla-dt"><thead><tr>' + hd.map(function (h) { return '<th>' + E(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + b.rows.map(function (r) { return '<tr>' + hd.map(function (h) { return '<td>' + E(r[h]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' : '<p class="pla-tbd">(No entries)</p>'); }
            return '';
        }).join('');
    }
    function model(key) {
        var plan = BY[key];
        return { title: plan.title, titleLines: [projName(), 'Document: ' + plan.code + ' · Draft, ' + now().slice(0, 10), 'Certification basis: ' + basis(), 'Written in the Safety Lab Plan Autopilot. ' + plan.basis + '.'],
            headerText: plan.title + ' · ' + projName(), projectName: projName(), sigFigs: 3, blocks: doc(key) };
    }
    async function word(key) {
        var lib = typeof root._loadDocxLib === 'function' ? await root._loadDocxLib() : root.docx;
        if (!lib || !root.SLReportWriter) throw fail('The Word writer is not loaded in this build.');
        var m = model(key), P0 = root.SLFtaPrint, blocks = [];
        for (var i = 0; i < m.blocks.length; i++) {
            var b = m.blocks[i];
            if (b.k !== 'fig') { blocks.push(b); continue; }
            var sh = { title: b.title, caption: b.title, svg: b.svg, w: b.w, h: b.h, dataUrl: null };
            try { if (P0 && P0.png) sh.dataUrl = await P0.png(sh, 3); } catch (_) { sh.dataUrl = null; }
            blocks.push({ k: 'sheets', sheets: [sh] });
        }
        m.blocks = blocks;
        var blob = await root.SLReportWriter.docx(m, lib);
        try { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (projName() + ' ' + BY[key].code + ' draft').replace(/[^\w-]+/g, '_') + '.docx'; document.body.appendChild(a); a.click(); a.remove(); } catch (_) {}
        return blob;
    }
    function print(key) { if (U()) U().openReport(BY[key].title + ' · ' + projName(), '<h1>' + E(BY[key].title) + '</h1><p>' + E(projName()) + ' · Draft, ' + now().slice(0, 10) + '</p>' + docHtml(doc(key))); }

    // ---- the page ----------------------------------------------------------------------------------------------------
    var ui0 = { open: null, msg: null };
    var TONE = { 'not started': 'todo', open: 'open', apply: 'open', ready: 'ok' };
    function _style() {
        if (typeof document === 'undefined' || document.getElementById('pla-style')) return;
        var st = document.createElement('style'); st.id = 'pla-style';
        st.textContent = '.pla{font-size:13.5px}.pla-lead{font-size:13px;color:var(--color-text-secondary,#5b6270);max-width:980px;margin:0 0 14px}'
            + '.pla-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.pla-card{border:1px solid var(--color-border,#e3e5e8);border-radius:12px;padding:14px 16px;background:var(--color-surface-1,#fff);display:flex;flex-direction:column;gap:8px}'
            + '.pla-ch{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.pla-ch b{font-size:14.5px}.pla-ch .slap-pill{white-space:nowrap;flex:none}.pla-g{font-size:12px;color:var(--color-text-secondary,#5b6270)}.pla-meta{display:flex;gap:6px;flex-wrap:wrap}.pla-chip{font-size:11.5px;padding:2px 8px;border-radius:10px;background:#ECECEA}'
            + '.pla-cols{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px;align-items:start}@media (max-width:1100px){.pla-cols{grid-template-columns:1fr}}'
            + '.pla-right{position:sticky;top:8px}.pla-prev{max-height:78vh;overflow:auto;border:1px solid var(--color-border,#e3e5e8);border-radius:10px;padding:16px 20px;background:#fff;color:#101216;font-size:12.5px;line-height:1.5}'
            + '.pla-prev h3{font-size:15px;margin:16px 0 6px}.pla-prev p{margin:0 0 8px}.pla-tbd{color:#9A3412;font-style:italic}.pla-cap{font-weight:700;font-size:11.5px;margin:10px 0 4px}.pla-fig{margin:10px 0 2px;overflow-x:auto}.pla-fig svg{max-width:100%;height:auto;border:1px solid #e3e5e8;border-radius:8px}'
            + '.pla-dt{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:10px}.pla-dt th,.pla-dt td{border:1px solid #d0d5dd;padding:4px 6px;text-align:left;vertical-align:top}.pla-dt th{background:#EAF2F8}'
            + '.pla-sech{font-weight:700;font-size:13px;margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--color-border,#e3e5e8)}'
            + '.pla-q{border:1px solid var(--color-border,#e3e5e8);border-radius:10px;padding:10px 12px;margin:0 0 8px;background:var(--color-surface-1,#fff)}.pla-q.gap{border-left:3px solid #B26A00}'
            + '.pla-qt{font-weight:600;margin-bottom:6px}.pla-q select{font:inherit;font-size:13px;padding:6px 8px;border-radius:7px;border:1px solid var(--color-border-strong,#c7cbd1);max-width:100%;width:100%;background:var(--color-surface-1,#fff);color:inherit}'
            + '.pla-chk{display:flex;flex-direction:column;gap:4px}.pla-chk label{display:flex;gap:6px;align-items:flex-start;font-size:13px}'
            + '.pla-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;align-items:center}.pla-t{font-size:11px;padding:1px 7px;border-radius:9px;border:1px solid var(--color-border,#e3e5e8);white-space:nowrap}'
            + '.pla-t.set{background:rgba(26,110,242,.08);border-color:rgba(26,110,242,.3);color:#0A4FB8}.pla-t.da{background:rgba(31,122,51,.08);border-color:rgba(31,122,51,.3);color:#1F6B30;cursor:help}'
            + '.pla-t.tool{cursor:pointer;color:inherit;text-decoration:none}.pla-t.tool:hover{border-color:#1A6EF2}.pla-imp{font-size:12px;color:var(--color-text-secondary,#5b6270);margin-top:5px}'
            + '.pla-box{border:1px solid var(--color-border,#e3e5e8);border-radius:10px;padding:10px 12px;margin:12px 0;background:var(--color-surface-1,#fff)}.pla-box h4{margin:0 0 6px;font-size:13px}'
            + '.pla-wt{width:100%;border-collapse:collapse;font-size:12.5px}.pla-wt th,.pla-wt td{border-top:1px solid var(--color-border,#e3e5e8);padding:5px 6px;text-align:left;vertical-align:top}.pla-wt th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-secondary,#5b6270)}'
            + '.pla-chg{font-weight:600;color:#0A4FB8}.pla-acts{display:flex;gap:8px;flex-wrap:wrap}.pla-msg{font-size:12.5px;margin:8px 0;padding:8px 10px;border-radius:8px;background:rgba(31,122,51,.08)}.pla-msg.err{background:rgba(180,35,24,.08)}'
            + '.pla-crumb{font:inherit;font-size:12px;border:none;background:none;color:#1A6EF2;cursor:pointer;padding:0;margin-bottom:4px}';
        document.head.appendChild(st);
    }
    function _cards() {
        var cov = daCover(null), withHow = cov.filter(function (r) { return r.how.length; }).length, withQ = cov.filter(function (r) { return r.qs.length; }).length;
        return '<p class="pla-lead">The program\'s three safety plans, written by answering questions. Each answer goes into its plan. Answers marked <b>Sets Safety Lab</b> also change Safety Lab once you apply the plan\'s settings, after you see each one as it is and as it will be. Each question shows the development assurance objectives it helps meet and the page the evidence comes from. Safety Lab fills the plans from the project every time you open them, so they never go stale.</p>'
            + '<div class="pla-cards">' + PLANS.map(function (p) {
                var st = status(p.key);
                return '<div class="pla-card" data-placard="' + p.key + '"><div class="pla-ch"><b>' + E(p.code) + ' · ' + E(p.title) + '</b>' + (U() ? U().pill(TONE[st.state], st.label) : E(st.label)) + '</div><div class="pla-g">' + E(p.basis) + '</div>'
                    + '<div class="pla-meta"><span class="pla-chip">' + st.n + ' questions</span>' + (st.miss ? '<span class="pla-chip">' + st.miss + ' to answer</span>' : '') + (st.apply ? '<span class="pla-chip">' + st.apply + ' to apply</span>' : '') + '</div>'
                    + '<div><button type="button" class="slap-btn p" onclick="SLPlanAuto.ui.open(\'' + p.key + '\')">Open</button></div></div>';
            }).join('') + '</div>'
            + '<div class="pla-box" data-pla-da="1"><h4>Development assurance objectives</h4><div class="pla-g">' + withHow + ' of ' + cov.length + ' objectives have an answer that says how this program meets them; ' + (withQ - withHow) + ' wait on a question; ' + (cov.length - withQ) + (cov.length - withQ === 1 ? ' is' : ' are') + ' met by the work itself (shown on the <a href="javascript:void(0)" onclick="switchTab(\'appa\')">Objectives matrix</a>).</div></div>';
    }
    function _qHtml(q) {
        var v = A(q.k), daTxt = function (id) { var o = objectives().filter(function (x) { return x.id === id; })[0]; return o ? id + ': ' + o.text + ' (now: ' + (STATE_WORD[o.state] || o.state) + ')' : id; };
        var input = q.type === 'checks'
            ? '<div class="pla-chk">' + q.opts.map(function (o) { return '<label><input type="checkbox" data-plaqc="' + E(q.k) + '" value="' + E(o[0]) + '"' + (picked(q.k).indexOf(o[0]) >= 0 ? ' checked' : '') + ' onchange="SLPlanAuto.ui.toggle(\'' + E(q.k) + '\',\'' + E(o[0]) + '\')"> <span>' + E(o[1]) + (o[2] ? '<span class="pla-imp"> · ' + E(o[2]) + '</span>' : '') + '</span></label>'; }).join('') + '</div>'
            : '<select data-plaq="' + E(q.k) + '" onchange="SLPlanAuto.ui.pick(\'' + E(q.k) + '\', this.value)"><option value="">Not answered</option>' + q.opts.map(function (o) { return '<option value="' + E(o[0]) + '"' + (v === o[0] ? ' selected' : '') + '>' + E(o[1]) + '</option>'; }).join('') + '</select>';
        var o = q.type !== 'checks' && v ? q.opts.filter(function (x) { return x[0] === v; })[0] : null;
        return '<div class="pla-q' + (v ? '' : ' gap') + '" data-plaqbox="' + E(q.k) + '"><div class="pla-qt">' + E(q.text) + '</div>' + input + (o && o[2] ? '<div class="pla-imp"><b>What this changes:</b> ' + E(o[2]) + '</div>' : '')
            + '<div class="pla-tags">' + (q.set ? '<span class="pla-t set">Sets Safety Lab</span>' : '<span class="pla-t">Written into the plan</span>')
            + q.da.map(function (id) { return '<span class="pla-t da" title="' + E(daTxt(id)) + '">Meets ' + E(id) + '</span>'; }).join('')
            + q.tools.map(function (t) { return '<a class="pla-t tool" href="javascript:void(0)" onclick="switchTab(\'' + E(t) + '\')" title="Open the page the evidence comes from">' + E(pageName(t)) + ' &rarr;</a>'; }).join('')
            + (!v ? '<span class="pla-t" style="color:#9A3412">Gap: not answered</span>' : '') + '</div></div>';
    }
    function _plan(key) {
        var plan = BY[key], st = status(key), qs = questions(key), w = wires(key), todo = w.filter(function (x) { return !x.same; }), gp = gaps(key), da = daCover(key);
        var h = '<button type="button" class="pla-crumb" onclick="SLPlanAuto.ui.open(null)">&larr; Plan Autopilot</button>'
            + '<div class="slap-head"><span class="slap-title">' + E(plan.code) + ' · ' + E(plan.title) + '</span>' + (U() ? U().pill(TONE[st.state], st.label) : '') + '<span style="flex:1"></span><span class="pla-acts"><button type="button" class="slap-btn p" onclick="SLPlanAuto.ui.word(\'' + key + '\')">Export to Word (.docx)</button><button type="button" class="slap-btn" onclick="SLPlanAuto.print(\'' + key + '\')">Print</button></span></div>'
            + '<div class="pla-g" style="margin-bottom:8px">' + E(plan.basis) + '.</div>'
            + (ui0.msg ? '<div class="pla-msg' + (ui0.msg.err ? ' err' : '') + '">' + E(ui0.msg.text) + '</div>' : '');
        h += '<div class="pla-cols"><div class="pla-left">';
        h += '<div class="pla-sech" style="margin-top:4px">1. Questions <span class="pla-g" style="font-weight:400">' + qs.filter(function (q) { return A(q.k); }).length + ' of ' + qs.length + ' answered, grouped by the section of the plan each answer is written into</span></div>';
        plan.secs.forEach(function (sec) { var sq = qs.filter(function (q) { return q.sec === sec; }); if (!sq.length) return; h += '<div class="pla-sech" data-plasec="' + E(sec) + '">' + E(sec) + '</div>' + sq.map(_qHtml).join(''); });
        h += '<div class="pla-box" data-pla-wires="1"><div class="pla-ch"><h4>2. What it sets in Safety Lab</h4><button type="button" class="slap-btn p" onclick="SLPlanAuto.ui.apply(\'' + key + '\')"' + (todo.length ? '' : ' disabled') + '>Apply ' + todo.length + ' setting' + (todo.length === 1 ? '' : 's') + '</button></div>'
            + (w.length ? '<table class="pla-wt"><thead><tr><th>Setting</th><th>Now</th><th>After applying</th></tr></thead><tbody>' + w.map(function (x) { return '<tr><td>' + E(x.what) + '</td><td>' + E(x.now) + '</td><td' + (x.same ? '' : ' class="pla-chg"') + '>' + E(x.after) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="pla-g">Nothing in this plan sets Safety Lab.</div>')
            + '<div class="pla-g" style="margin-top:6px">A lane turned off keeps all its data. An expected lane that holds work is turned off with a signed tailoring entry naming this plan\'s answer.</div></div>';
        h += '<div class="pla-box" data-pla-dacov="1"><h4>3. Development assurance objectives this plan covers</h4><table class="pla-wt"><thead><tr><th>Objective</th><th>How this program meets it</th><th>Evidence</th><th>Now</th></tr></thead><tbody>'
            + da.map(function (r) { return '<tr><td title="' + E(r.text) + '"><b>' + E(r.id) + '</b> ' + E(r.text) + '</td><td>' + (r.how.length ? E(r.how.join('; ')) : '<span class="pla-tbd">To be decided</span>') + '</td><td>' + r.tools.map(function (t) { return '<a href="javascript:void(0)" onclick="switchTab(\'' + E(t) + '\')">' + E(pageName(t)) + '</a>'; }).join(', ') + '</td><td>' + E(STATE_WORD[r.state] || r.state) + '</td></tr>'; }).join('') + '</tbody></table></div>';
        if (gp.length) h += '<div class="pla-box" data-pla-gaps="1"><h4>To be decided (' + gp.length + ')</h4><ul style="margin:0;padding-left:18px">' + gp.map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul></div>';
        h += '</div><div class="pla-right"><div class="pla-g" style="font-weight:600;margin-bottom:4px">Preview: draft</div><div class="pla-prev" data-pladoc="1">' + docHtml(doc(key)) + '</div></div></div>';
        return h;
    }
    function render() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('plan-auto-host'); if (!host) return;
        if (U()) U().style(); _style();
        var scroll = (document.querySelector('[data-pladoc]') || {}).scrollTop || 0;
        host.innerHTML = '<div class="pla">' + (ui0.open && BY[ui0.open] ? _plan(ui0.open) : _cards()) + '</div>';
        var pv = document.querySelector('[data-pladoc]'); if (pv) pv.scrollTop = scroll;
    }
    var ui = {
        open: function (k) { ui0.open = k || null; ui0.msg = null; render(); try { var v = document.getElementById('view-plan-auto'); if (v && v.scrollIntoView) v.scrollIntoView({ block: 'start' }); } catch (_) {} },
        pick: function (k, v) { try { answer(k, v); ui0.msg = null; } catch (e) { ui0.msg = { text: e.message, err: true }; } render(); },
        toggle: function (k, o) { try { toggle(k, o); ui0.msg = null; } catch (e) { ui0.msg = { text: e.message, err: true }; } render(); },
        apply: function (key) { var r = apply(key); ui0.msg = { text: (r.done.length ? 'Applied: ' + r.done.join('; ') + '.' : 'Nothing to apply.') + (r.errs.length ? ' Not applied: ' + r.errs.join('; ') : ''), err: !!r.errs.length }; render(); },
        word: function (key) { word(key).catch(function (e) { ui0.msg = { text: 'Could not write the Word file: ' + (e && e.message || e), err: true }; render(); }); }
    };
    function mount() {
        if (typeof document === 'undefined') return false;
        var v = document.getElementById('view-plan-auto'); if (!v) return false;
        var host = document.getElementById('plan-auto-host'); if (!host) { host = document.createElement('div'); host.id = 'plan-auto-host'; v.appendChild(host); }
        if (!v._plaObs && typeof MutationObserver === 'function') {
            var shown = v.style.display !== 'none' && v.style.display !== '';
            v._plaObs = new MutationObserver(function () { var nowS = v.style.display !== 'none'; if (nowS && !shown) { try { render(); } catch (e) { try { console.warn('[plan-autopilot]', e); } catch (_) {} } } shown = nowS; });
            v._plaObs.observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
            if (shown) render();
        }
        return true;
    }
    if (typeof document !== 'undefined') { var tries = 40, t = setInterval(function () { if (mount() || --tries <= 0) clearInterval(t); }, 250); }
    root.SLPlanAuto = { VERSION: VERSION, PLANS: PLANS, BY: BY, QBY: QBY, answer: answer, toggle: toggle, wires: wires, apply: apply, status: status, gaps: gaps, daCover: daCover, doc: doc, docHtml: docHtml, model: model, word: word, print: print, render: render, ui: ui, state: ui0, questions: questions, topDal: topDal };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLPlanAuto;
})(typeof window !== 'undefined' ? window : globalThis);
