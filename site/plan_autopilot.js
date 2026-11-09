// plan_autopilot.js (SLPlanAuto v2.3, 10 Nov 2026; v2.0 6 Nov 2026): the Plan Autopilot. The program's three safety plans, written by
// answering questions, with the same layout as the Sys Lab Planning Autopilot.
// v2.3 (10 Nov 2026): Waqas: "we also need to fix how we are not using the full width of the page for the text", for all the
// reports: the page lead runs the full width too (its 980px cap is gone); the plan documents already used the full column.
//
// Waqas, 6 Nov 2026: "program planing in safety lab needs to have the same interface as sys lab planing auto-pilot,
// questions to be in conjunction with DA assurance and the tool linkings ... I want our program planing to replicate"
// the example safety program plan of ARP4754B; "similar treatment for the HF plan and RAM plan too".
// v2 (his rulings the same day):
//   · a plan is a plan: no counts, no status, no results in it. Those are outputs and go in each plan's status report
//     ("why is this plan showing resulting numbers again").
//   · the plan comes first in the workflow, so every question asks what the program WILL do ("Will a PASA be
//     performed?", not "is it done").
//   · the options cover the permutations real programs use: pick several where methods combine, our own way in our
//     own words, not planned with the reason, choices that depend on the kind of program and the certification basis,
//     and picks that do not work together are caught ("we need to cover all different permutations").
//   · the certification basis is the first section of the SSPP, not a separate page: it dictates the plan, the
//     probability targets, the DALs and the rules. The severity classifications, targets and DALs in the plan come from
//     the same engine the tool already uses (getSafetyTarget, severity_tables.js), never a second copy.
//   · each process is written out: how it will be done, its inputs and when they are needed, what it produces, and the
//     checks before it counts (the Sys Lab ruling: "planning documents to execute the programs").
//   · diagrams in the layout of the example figures of ARP4761A and ARP4754B, with the picks dictating the changes, and
//     neat connectors.
//   · a cover page with document control, approvals by role and the revision history; a table of contents, a list of
//     tables and a list of figures; numbered captions, each referred to before it appears.
//   · fast: the objectives are read once per redraw, not once per tag (3.4 s per click before).
//
// Data: projectConfig.planAuto = { answers, who, own (own-words text), why (reasons for "not planned"), doc (document
// control per plan: number, status, roles, issues), applied }. Turning a lane off never deletes its data
// (program_plan.js doctrine); an expected lane holding work is turned off with a signed tailoring entry naming the answer.
(function (root) {
    'use strict';
    var VERSION = '2.3';
    function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function U() { return root.SLAutopilotUI || null; }
    function PP() { return root.PROGRAM_PLAN || null; }
    function g(name) { try { return root.SLEnv && root.SLEnv.get ? root.SLEnv.get(name) : undefined; } catch (_) { return undefined; } }
    function arr(name) { var v = g(name); if (v === undefined) { try { v = root[name]; } catch (_) {} } return Array.isArray(v) ? v : []; }
    function pc() { var v = g('projectConfig'); if (v === undefined) { try { v = root.projectConfig; } catch (_) {} } if (v === undefined) { try { v = projectConfig; } catch (_) {} } return v || null; }   // eslint-disable-line no-undef
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function now() { return new Date().toISOString(); }
    function today() { return now().slice(0, 10); }
    function who() { return U() ? U().who() : 'Engineer'; }
    function save() { if (U()) U().save(); else { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} } }
    function fail(m) { var e = new Error(m); e.userFacing = true; return e; }
    function store() {
        var p = pc(); if (!p) return { answers: {}, who: {}, own: {}, why: {}, doc: {}, applied: {} };
        if (!p.planAuto || typeof p.planAuto !== 'object') p.planAuto = {};
        var s = p.planAuto; ['answers', 'who', 'own', 'why', 'doc', 'applied'].forEach(function (k) { if (!s[k] || typeof s[k] !== 'object') s[k] = {}; });
        return s;
    }
    function A(k) { return store().answers[k] || ''; }
    function picked(k) { var v = A(k); return v ? String(v).split('|') : []; }
    function has(k, o) { return picked(k).indexOf(o) >= 0; }
    function lcFirst(s) { s = String(s || ''); return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
    function listJoin(a) { a = a.filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function projName() { return safe(function () { return g('projectName') || root.projectName || ''; }, '') || 'the program'; }
    function initials() { var dw = String(projName()).split(/[\s·,]+/).filter(function (t) { return /[A-Za-z]/.test(t) && /\d/.test(t); })[0]; if (dw) return dw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8); var w = String(projName()).replace(/[^A-Za-z0-9 \-]/g, ' ').split(/[\s\-]+/).filter(Boolean); var x = w.length > 1 ? w.slice(0, 3).map(function (t) { return /^\d/.test(t) ? t : t.charAt(0); }).join('') : (w[0] || 'PRG').slice(0, 4); return x.toUpperCase(); }

    // ---- read once per redraw (the objectives took 47 ms each and were read 68 times per click) ------------------
    var _memo = {}, _memoT = null;
    function memo(key, f) {
        if (Object.prototype.hasOwnProperty.call(_memo, key)) return _memo[key];
        var v = f(); _memo[key] = v;
        if (!_memoT && typeof setTimeout === 'function') _memoT = setTimeout(function () { _memo = {}; _memoT = null; }, 0);
        return v;
    }
    function forget() { _memo = {}; if (_memoT && typeof clearTimeout === 'function') clearTimeout(_memoT); _memoT = null; }
    function objectives() { return memo('obj', function () { return safe(function () { return root.appAMatrixRows(); }, []) || []; }); }
    var STATE_WORD = { satisfied: 'Met', attested: 'Signed', partial: 'Partly', open: 'Not yet' };

    // ---- the project (the status reports read these; the plans do not) -------------------------------------------
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
    function laneOn(id) { return safe(function () { return PP().laneOn(id); }, false); }
    function laneName(id) { return safe(function () { return PP().CATALOGUE.filter(function (l) { return l.id === id; })[0].name; }, id); }
    function laneItems(id) { return safe(function () { return PP().laneData(id); }, 0) || 0; }

    // ---- the pages the evidence comes from -----------------------------------------------------------------------
    var PAGES = {
        'plan-auto': 'Plan Autopilot', spp: 'Program Planning', defs: 'Certification basis page', phases: 'Flight phases', 'ac-func': 'Aircraft functions', 'ac-fha': 'AFHA', pasa: 'PASA',
        'sys-dir': 'Systems', fta: 'Fault trees', markov: 'Markov models', fmea: 'FMEA', fmes: 'FMES', asa: 'Aircraft Safety Assessment', cma: 'Common modes (CMA)',
        pra: 'Particular risks (PRA)', zsa: 'Zonal safety (ZSA)', stpa: 'STPA', cea: 'Cascading effects', ccmr: 'Latent failures (CCMR)', mmel: 'Dispatch relief (MMEL)',
        'ac-req': 'Aircraft requirements', assumptions: 'Assumptions', validation: 'Validation', 'vv-status': 'Verification status', 'dal-ref': 'DAL credit reference',
        ipledger: 'Independence ledger', cm: 'Configuration management', review: 'Reviews', moc: 'Means of compliance', appa: 'Objectives matrix', ai: 'AI Assistant',
        'hfa-auto': 'HF Autopilot', 'hfa-results': 'HF results', 'ram-hub': 'RAM overview', 'ram-rel': 'Reliability prediction and FRACAS', 'ram-predict': 'Parts count',
        'ram-alloc': 'Reliability allocation', 'ram-growth': 'Reliability growth', 'ram-mx': 'Maintainability', 'ram-test': 'Testability', 'ram-msg3': 'MSG-3', lcc: 'Life-cycle cost',
        swrel: 'Software reliability', sneak: 'Sneak circuit', 'golden-thread': 'Golden Thread', dashboard: 'Dashboard', reqif: 'ReqIF exchange', items: 'Items', 'ram-rbd': 'Reliability block diagrams', 'ram-weibull': 'Life data (Weibull)'
    };
    function pageName(t) { return PAGES[t] || t; }

    // ---- the certification basis: the same engine the tool uses ---------------------------------------------------
    var REGS = [['Part 25', '14 CFR Part 25: transport category airplanes (AC 25.1309-1B)'], ['Part 23', '14 CFR Part 23: normal category airplanes (AC 23.1309-1E, ASTM F3230)'],
        ['Part 27', '14 CFR Part 27: normal category rotorcraft (AC 27-1B)'], ['Part 29', '14 CFR Part 29: transport category rotorcraft (AC 29-2C)'],
        ['SC-VTOL', 'EASA SC-VTOL: powered lift and eVTOL'], ['Part 33', '14 CFR Part 33: aircraft engines (33.75)'], ['Part 35', '14 CFR Part 35: propellers (35.15)'],
        ['Part 450', '14 CFR Part 450: commercial space launch and reentry'], ['Part 107', '14 CFR Part 107 with SORA: unmanned aircraft'], ['Custom', 'A custom basis: special conditions agreed for this applicant']];
    var REG_SHORT = { 'Part 25': '14 CFR Part 25', 'Part 23': '14 CFR Part 23', 'Part 27': '14 CFR Part 27', 'Part 29': '14 CFR Part 29', 'SC-VTOL': 'EASA SC-VTOL', 'Part 33': '14 CFR Part 33', 'Part 35': '14 CFR Part 35', 'Part 450': '14 CFR Part 450', 'Part 107': '14 CFR Part 107 with SORA', Custom: 'a custom basis' };
    var BASIS_FIELDS = ['regulation', 'part23Class', 'part23CertLevel', 'part23Propulsion', 'part23ManualLevel', 'part23DalMethod', 'part27Class', 'scvtolCategory', 'missionDuration'];
    function p23() { return root.SLP23 || null; }
    function canonReg(r) { return safe(function () { return root.canonRegulation ? root.canonRegulation(r) : r; }, r) || r; }
    function regNow() { return canonReg(plannedCfg().regulation || 'Part 25'); }
    // the basis as the plan sets it: the project's own, with the plan's answers on top
    function plannedCfg() {
        return memo('cfg', function () {
            var c = pc() || {}, o = {};
            BASIS_FIELDS.forEach(function (f) { o[f] = c[f]; });
            o.customCertBasis = c.customCertBasis;
            if (A('basis.reg')) o.regulation = A('basis.reg');
            if (A('basis.p27')) o.part27Class = A('basis.p27');
            if (A('basis.scvtol')) o.scvtolCategory = A('basis.scvtol');
            if (A('basis.p23dal')) o.part23DalMethod = A('basis.p23dal');
            if (A('basis.mission')) o.missionDuration = A('basis.mission') === 'auto' ? null : Number(A('basis.mission'));
            if (canonReg(o.regulation) === 'Part 23' && p23() && (A('basis.p23level') || A('basis.p23prop'))) safe(function () { p23().apply(o, A('basis.p23level') || o.part23CertLevel || '', A('basis.p23prop') || o.part23Propulsion || '', A('basis.p23manual') || o.part23ManualLevel || ''); }, null);
            return o;
        });
    }
    // the targets and DALs for a basis: getSafetyTarget, run against that basis and put back at once
    var SEVS = ['Catastrophic', 'Hazardous', 'Major', 'Minor', 'No Safety Effect'];
    function targetsFor(cfg) {
        var p = pc(); if (!p || typeof root.getSafetyTarget !== 'function') return [];
        var keep = {}; BASIS_FIELDS.concat(['customCertBasis']).forEach(function (f) { keep[f] = p[f]; });
        try {
            BASIS_FIELDS.concat(['customCertBasis']).forEach(function (f) { if (cfg[f] !== undefined) p[f] = cfg[f]; });
            return SEVS.map(function (sv) { var t = safe(function () { return root.getSafetyTarget(sv); }, null) || {}; return { sev: sv, prob: t.prob, dal: t.dal || '', scope: t.scope || '' }; });
        } finally { Object.keys(keep).forEach(function (f) { p[f] = keep[f]; }); }
    }
    function probWords(x) { if (x == null || !(x < 1)) return 'No numerical target'; var e = Math.round(Math.log10(x)), m = x / Math.pow(10, e); var sup = String(e).replace(/-/g, '\u207B').replace(/[0-9]/g, function (d) { return '\u2070\u00B9\u00B2\u00B3\u2074\u2075\u2076\u2077\u2078\u2079'.charAt(+d); }); return 'Less than ' + (Math.abs(m - 1) < 1e-9 ? '' : (Math.round(m * 10) / 10) + ' x ') + '10' + sup + ' per flight hour'; }
    function sevTable(cfg) { return safe(function () { return root.SLSeverityTables.exportTable(cfg); }, null); }
    // the analysis lanes a basis expects
    function expectedFor(reg) { return safe(function () { return PP().CATALOGUE.filter(function (l) { return !l.parent && PP().isExpected(l.id, canonReg(reg)); }).map(function (l) { return l.id; }); }, []); }

    // ---- what an answer sets in Safety Lab -----------------------------------------------------------------------
    // a set: { what(), now(), after(v) (null: this answer leaves it as it is), apply(v, by, plan, q) }
    function optLabel(q, v) { return String(v || '').split('|').map(function (x) { var o = (q.opts || []).filter(function (o) { return o[0] === x; })[0]; return o ? o[1] : x; }).join(', '); }
    function LANE(id, onFor, offFor) {
        return { lane: id, onFor: onFor, offFor: offFor, what: function () { return laneName(id) + ' in the program'; }, now: function () { return laneOn(id) ? 'In' : 'Out'; },
            after: function (v) { var vs = String(v).split('|'); if (onFor.some(function (o) { return vs.indexOf(o) >= 0; })) return 'In'; if (!offFor || offFor.some(function (o) { return vs.indexOf(o) >= 0; })) return 'Out'; return null; },
            apply: function (v, by, plan, q) {
                var on = this.after(v) === 'In', why = store().why[q.k];
                PP().setLane(id, on, on ? {} : { rationale: 'The ' + plan.title + ' says: ' + optLabel(q, v) + '.' + (why ? ' Reason: ' + why : ''), sig: by });
            } };
    }
    function slotDef(id) { var L = null; try { L = typeof SPP_SLOTS !== 'undefined' ? SPP_SLOTS : root.SPP_SLOTS; } catch (_) { L = root.SPP_SLOTS; } return (L || []).filter(function (x) { return x.id === id; })[0] || null; }   // eslint-disable-line no-undef
    function SLOT(id, label, mapFn) {
        return { what: function () { return label + ' (method)'; },
            now: function () { var s = safe(function () { return pc().safetyProgramPlan.slots[id]; }, null), def = slotDef(id), i = s != null ? s : def ? def.dflt : null; return def && i != null ? def.options[i] : ''; },
            after: function (v) { var def = slotDef(id), i = mapFn(v); return def && i != null ? def.options[i] : null; },
            apply: function (v) { var p = pc(); if (!p.safetyProgramPlan) p.safetyProgramPlan = { slots: {}, notes: '' }; if (!p.safetyProgramPlan.slots) p.safetyProgramPlan.slots = {}; p.safetyProgramPlan.slots[id] = mapFn(v); } };
    }
    var RM_NAMES = { jama: 'Jama Connect', doors: 'IBM DOORS Classic', 'doors-next': 'IBM DOORS Next', polarion: 'Siemens Polarion', codebeamer: 'PTC Codebeamer', none: 'None' };
    var MBSE_NAMES = { cameo: 'Cameo Systems Modeler', capella: 'Capella', syslab: 'Sys Lab', genesys: 'GENESYS', none: 'None' };
    function TOOL(section, label, names) {
        var cur = function () { var t = safe(function () { return root.declaredToolchain(); }, null); if (!t) return ''; var r = t[section] || {}; return r.tool === 'other' ? (r.toolOther || 'Other') : (names[r.tool] || (r.tool ? r.tool : 'Not declared')); };
        return { what: function () { return label + ' (declared tool)'; }, now: cur,
            after: function (v) { return names[v] || null; },
            apply: function (v) {
                var p = pc(); if (!p.toolchain) safe(function () { root.declaredToolchain(); }, null);
                if (!p.toolchain) p.toolchain = { sra: { tool: 'Safety Lab Aero' }, rm: { tool: '', mode: 'reqif' }, mbse: { tool: '' } };
                var r = p.toolchain[section] || (p.toolchain[section] = {});
                if (v === 'syslab' || v === 'genesys') { r.tool = 'other'; r.toolOther = names[v]; } else { r.tool = v === 'none' ? '' : v; delete r.toolOther; }
                r.by = ''; r.at = '';   // a changed declaration is signed again on Program Planning
            } };
    }
    // the certification basis: written to the project the way the basis page writes it, then the page's own refresh runs
    function BASIS(field, label, show) {
        return { what: function () { return label + ' (certification basis)'; },
            now: function () { var c = pc() || {}; return show(c[field], c) || 'Not set'; },
            after: function (v) { var c = plannedCfg(); return show(c[field], c) || null; },
            apply: function (v) {
                var p = pc(); if (!p) return;
                if (field === 'missionDuration') p.missionDuration = v === 'auto' ? null : Number(v);
                else if (field === 'part23Class') { if (p23()) p23().apply(p, A('basis.p23level') || p.part23CertLevel || '', A('basis.p23prop') || p.part23Propulsion || '', A('basis.p23manual') || p.part23ManualLevel || ''); }
                else p[field] = v;
                safe(function () { if (typeof root.renderProjectConfigUI === 'function') root.renderProjectConfigUI(); }, null);
                safe(function () { if (typeof root.onProjectConfigChange === 'function') root.onProjectConfigChange(); }, null);
            } };
    }
    function NOTG() {
        return { what: function () { return 'NOT logic in fault trees'; }, now: function () { return (pc() || {}).allowNonCoherent ? 'Allowed' : 'Not allowed'; },
            after: function (v) { return v === 'yes' ? 'Allowed' : v === 'no' ? 'Not allowed' : null; },
            apply: function (v) { var on = v === 'yes'; if (root.SLFtaEdit && root.SLFtaEdit.setNonCoherent) { var r = root.SLFtaEdit.setNonCoherent(on); if (r && r.ok === false) throw new Error(r.error || r.reason || 'refused'); } else pc().allowNonCoherent = on; } };
    }

    // ---- the questions ------------------------------------------------------------------------------------------
    // Q(k, section, question, options [[id, label, what it means]], text {id: sentence} | fn(v), o)
    //   o.type 'one' (default) | 'checks' (several at once) | 'num' (a number, or "auto")
    //   o.da: the objectives it helps meet; o.tools: the pages that hold the evidence; o.set: what it sets in Safety Lab
    //   o.when(): asked only when it applies; o.parent: the earlier question it follows from (drawn indented under it); o.own === false: no "our own way" choice; o.reasonFor: the answers that need a reason
    //   o.need(v): a message when the pick does not work with the rest of the plan
    function Q(k, sec, text, opts, txt, o) { return Object.assign({ k: k, sec: sec, text: text, opts: opts, txt: txt, da: [], tools: [], reasonFor: ['none'] }, o || {}); }
    var NOTP = function (what) { return ['none', 'Not planned', 'Written into the plan with the reason' + (what ? '; ' + what : '') + '. The reason goes into the tailoring section.']; };
    var YES = function (label, what) { return ['yes', label || 'Yes', what || '']; };
    var ROLE_OPTS = [['cse', 'The chief safety engineer', ''], ['lead', 'The aircraft safety lead', ''], ['ce', 'The chief engineer', ''], ['cert', 'The certification manager', ''], ['airw', 'The head of airworthiness', '']];
    var reg = function () { return regNow(); };
    var isFixedOrRotor = function () { return ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'SC-VTOL', 'Custom'].indexOf(reg()) >= 0; };

    var SSPP_SECS = ['Scope and purpose', 'Certification basis and safety objectives', 'How the safety program is organized', 'Safety responsibilities', 'The safety assessment process and its methods', 'Common cause analyses', 'Development assurance', 'Tools', 'Tailoring', 'Configuration management and records'];
    var HFP_SECS = ['Scope and purpose', 'The crew and the operation', 'The human factors work through the design cycle', 'Workload and crew error', 'Evaluations and who does them', 'Minimum flight crew', 'Crew actions the safety analysis counts on', 'Development assurance', 'Records and changes to this plan'];
    var RAMP_SECS = ['Scope and purpose', 'Reliability prediction and data sources', 'Allocation and growth', 'Failure reporting', 'Maintainability and testability', 'Scheduled maintenance and dispatch', 'Other reliability analyses', 'Development assurance', 'Records and changes to this plan'];

    var SSPP_QS = [
        // Scope and purpose
        Q('sspp.kind', 'Scope and purpose', 'What kind of program will this plan cover?', [['new', 'A new type certificate', 'Every function and system is assessed from the start.'], ['derivative', 'A derivative: an amended type certificate', 'The changed and new functions are assessed; what is kept is listed with the reason it still holds.'], ['stc', 'A supplemental type certificate or other change to a certified aircraft', 'The change and everything it touches are assessed.'], ['supplier', 'Systems supplied for another company\'s aircraft', 'The system assessments are written here; the aircraft maker owns the aircraft level.']],
            { new: 'The program is a new type certificate. Every aircraft function and every system will be assessed from the start.', derivative: 'The program is a derivative of a certified aircraft, under an amended type certificate. The new and changed functions, and every function and system they touch, will be assessed; what is carried over from the original certification will be listed with the reason it still holds.', stc: 'The program is a change to a certified aircraft, under a supplemental type certificate. The change, and every function and system it touches, will be assessed; the rest of the aircraft keeps its original certification.', supplier: 'The program supplies systems for another company\'s aircraft. The system-level assessments will be written under this plan and handed to the aircraft maker, who owns the aircraft-level assessments.' },
            { da: ['A1-1'], tools: ['plan-auto'] }),
        Q('sspp.authority', 'Scope and purpose', 'Which authorities will the program work with?', [['faa', 'FAA', ''], ['easa', 'EASA', ''], ['tcca', 'Transport Canada', ''], ['ukcaa', 'UK CAA', ''], ['anac', 'ANAC (Brazil)', ''], ['caac', 'CAAC (China)', ''], ['mil', 'A military airworthiness authority', '']],
            function (v) { var m = { faa: 'the FAA', easa: 'EASA', tcca: 'Transport Canada', ukcaa: 'the UK CAA', anac: 'ANAC', caac: 'the CAAC', mil: 'a military airworthiness authority' }; return 'The program will work with ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + '.'; },
            { type: 'checks', da: ['A8-2'], tools: ['moc'] }),
        Q('sspp.second', 'Scope and purpose', 'How will the other authorities accept the safety work?', [['validation', 'Validation of the first authority\'s approval, under a bilateral agreement', ''], ['concurrent', 'Concurrent certification: every authority reviews the work as it happens', ''], ['each', 'Separately, each authority on its own schedule', '']],
            { validation: 'The first authority certifies the aircraft; the others validate that approval under their bilateral agreements, so the safety work is written once, to the strictest of the bases where they differ.', concurrent: 'Every authority reviews the safety work as it happens (concurrent certification); where their requirements differ, the strictest is applied.', each: 'Each authority reviews the safety work on its own schedule; where their requirements differ, the differences are listed and met separately.' },
            { da: ['A8-1', 'A8-2'], parent: 'sspp.authority', when: function () { return picked('sspp.authority').filter(function (x) { return x !== 'own'; }).length > 1; } }),
        // Certification basis
        Q('basis.reg', 'Certification basis and safety objectives', 'Which certification basis will the safety assessment be done to?', REGS.map(function (r) { return [r[0], r[1], '']; }),
            function (v) { return 'The safety assessment will be done to ' + (REG_SHORT[v] || v) + '. The basis sets the failure condition classifications, the probability target for each, and the development assurance level each one calls for, as Table {T:targets} shows.' + (v === 'Custom' ? ' The special conditions are defined on the certification basis page and agreed with the authority.' : ''); },
            { own: false, da: ['A8-1', 'A3-1'], tools: ['defs'], set: [BASIS('regulation', 'Certification basis', function (x) { return REG_SHORT[canonReg(x)] || x; })] }),
        Q('basis.p23level', 'Certification basis and safety objectives', 'What is the Part 23 certification level?', (safe(function () { return p23().CERT_LEVELS; }, []) || []).map(function (l) { return [l.v, l.label, '']; }),
            function (v) { return 'The airplane is Part 23 certification level ' + v + '.'; }, { own: false, parent: 'basis.reg', when: function () { return reg() === 'Part 23'; }, set: [BASIS('part23Class', 'Part 23 class', function (x, c) { return c && c.part23Class ? 'Class ' + c.part23Class : ''; })] }),
        Q('basis.p23prop', 'Certification basis and safety objectives', 'What propulsion will the airplane have?', (safe(function () { return p23().PROPULSION; }, []) || []).map(function (l) { return [l.v, l.label, '']; }),
            function (v, q) { return 'Its propulsion: ' + lcFirst(optLabel(q, v)) + '. With the certification level, this sets the assessment level of ASTM F3230 and so the targets.'; }, { own: false, parent: 'basis.reg', when: function () { return reg() === 'Part 23'; }, set: [BASIS('part23Class', 'Part 23 class', function (x, c) { return c && c.part23Class ? 'Class ' + c.part23Class : ''; })] }),
        Q('basis.p23manual', 'Certification basis and safety objectives', 'Which assessment level has been agreed with the authority?', [['I', 'Assessment Level I', ''], ['II', 'Assessment Level II', ''], ['III', 'Assessment Level III', ''], ['IV', 'Assessment Level IV', '']],
            function (v) { return 'The propulsion falls outside ASTM F3230 Table 3, so assessment level ' + v + ' will be agreed with the authority.'; }, { own: false, parent: 'basis.p23prop', when: function () { return reg() === 'Part 23' && A('basis.p23prop') === 'other'; }, set: [BASIS('part23Class', 'Part 23 class', function (x, c) { return c && c.part23Class ? 'Class ' + c.part23Class : ''; })] }),
        Q('basis.p23dal', 'Certification basis and safety objectives', 'How will software and hardware DALs be set (ASTM F3061 4.2.5)?', [['f3061', 'ASTM F3061 Table 1: a primary and a secondary DAL', ''], ['arp4754', 'The ARP4754 method: A, B, C or D from the severity', '']],
            { f3061: 'Software and electronic hardware DALs will be set from ASTM F3061 Table 1.', arp4754: 'Software and electronic hardware DALs will be set by the ARP4754 method, from the severity of the failure conditions they contribute to.' }, { own: false, parent: 'basis.reg', when: function () { return reg() === 'Part 23'; }, set: [BASIS('part23DalMethod', 'Part 23 DAL method', function (x) { return x === 'arp4754' ? 'ARP4754 method' : x ? 'F3061 Table 1' : ''; })] }),
        Q('basis.p27', 'Certification basis and safety objectives', 'What class is the rotorcraft (PS-ASW-27-15)?', [['I', 'Class I: reciprocating, up to 5 occupants', ''], ['II', 'Class II: single turbine, up to 5 occupants, up to 4,000 lb', ''], ['III', 'Class III: single turbine, 6 or more occupants, 4,001 to 7,000 lb', ''], ['IV', 'Class IV: twin turbine', '']],
            function (v) { return 'The rotorcraft is Part 27 class ' + v + ', which sets its targets.'; }, { own: false, parent: 'basis.reg', when: function () { return reg() === 'Part 27'; }, set: [BASIS('part27Class', 'Part 27 class', function (x) { return x ? 'Class ' + x : ''; })] }),
        Q('basis.scvtol', 'Certification basis and safety objectives', 'Which SC-VTOL category will the aircraft be certified in?', [['Basic 1', 'Basic 1: 0 to 1 passengers', ''], ['Basic 2', 'Basic 2: 2 to 6 passengers', ''], ['Basic 3', 'Basic 3: 7 to 9 passengers', ''], ['Enhanced', 'Enhanced: commercial passenger and congested-area operations', '']],
            function (v) { return 'The aircraft will be certified in SC-VTOL category ' + v + '.'; }, { own: false, parent: 'basis.reg', when: function () { return reg() === 'SC-VTOL'; }, set: [BASIS('scvtolCategory', 'SC-VTOL category', function (x) { return x || ''; })] }),
        Q('basis.mission', 'Certification basis and safety objectives', 'What flight duration will turn per-flight risk into per-hour targets?', [['auto', 'The sum of the flight phases', ''], ['1', '1 hour', ''], ['2', '2 hours', ''], ['3', '3 hours', ''], ['5', '5 hours', ''], ['10', '10 hours', '']],
            function (v) { return v === 'auto' ? 'The certification flight duration will be the sum of the flight phases; a failure condition that can only happen in some phases has its target adjusted for the time spent in them.' : 'The certification flight duration will be ' + v + ' hour' + (v === '1' ? '' : 's') + '; a failure condition that can only happen in some phases has its target adjusted for the time spent in them.'; },
            { own: false, parent: 'basis.reg', when: isFixedOrRotor, set: [BASIS('missionDuration', 'Flight duration for the targets', function (x) { return x ? x + ' h' : 'Sum of the flight phases'; })] }),
        Q('basis.special', 'Certification basis and safety objectives', 'Will the basis include special conditions or equivalent safety findings?', [['none0', 'No, the published rules only', ''], ['sc', 'Special conditions', 'Listed in the certification plan; each one\'s safety objectives come into this plan.'], ['esf', 'Equivalent safety findings', ''], ['elos', 'Exemptions', '']],
            function (v) { if (v === 'none0') return 'The basis is the published rules only.'; var m = { sc: 'special conditions', esf: 'equivalent safety findings', elos: 'exemptions' }; return 'The basis will include ' + listJoin(String(v).split('|').filter(function (x) { return m[x]; }).map(function (x) { return m[x]; })) + ', listed in the certification plan. Where one sets its own safety objectives, they are added to the classifications below and assessed the same way.'; },
            { type: 'checks', da: ['A8-1'], reasonFor: [], need: function (v) { return v.indexOf('none0') >= 0 && v.split('|').length > 1 ? 'Published rules only cannot go with special conditions or findings: pick one or the other.' : ''; } }),
        // Organization
        Q('sspp.org', 'How the safety program is organized', 'How will safety be organized on the program?', [['central', 'One aircraft safety group does all of it', 'The group owns this plan and leads every assessment.'], ['embedded', 'A small aircraft safety group sets the methods; system teams do their own assessments', 'The group reviews each system team\'s work at set points.'], ['supplier', 'Suppliers do their system assessments; the program\'s safety group brings them together', ''], ['mixed', 'Some systems in-house, some by suppliers', 'Each system is listed with who assesses it.']],
            { central: 'One aircraft safety group will do the safety work for the whole program. It owns this plan, leads every assessment, and reports to the chief engineer.', embedded: 'A small aircraft safety group will set the methods in this plan and own the aircraft-level assessments. Each system team will do its own system assessments with a safety engineer in the team, and the aircraft safety group will review that work at each design review.', supplier: 'Each system supplier will do the safety assessments for what it supplies. The program\'s safety group will write the aircraft-level assessments, review every supplier\'s results, and bring them together.', mixed: 'Some systems will be assessed in-house and some by their suppliers. Each system will be listed in the system register with who assesses it; the program\'s safety group owns the aircraft level and reviews every system\'s results.' },
            { da: ['A1-1', 'A1-3'], tools: ['sys-dir'] }),
        Q('sspp.owner', 'How the safety program is organized', 'Who will own this plan and sign changes to it?', ROLE_OPTS,
            function (v, q) { return 'This plan is owned by ' + lcFirst(optLabel(q, v)) + ', who signs every change to it. A change to the plan is recorded with its reason before the work it affects starts.'; },
            { da: ['A1-1', 'A7-2'] }),
        Q('sspp.suppliers', 'How the safety program is organized', 'How will the suppliers\' safety work be held to this plan?', [['this', 'They work to this plan', ''], ['theirs', 'They work to their own plans, reviewed and accepted against this one', ''], ['each', 'Supplier by supplier, set in each contract', '']],
            { this: 'Suppliers will work to this plan; it is part of each supply contract.', theirs: 'Each supplier will work to its own safety plan, which the program reviews and accepts against this one before the supplier\'s work starts.', each: 'How each supplier is held to this plan will be set in its contract: this plan, or its own plan accepted against this one.' },
            { da: ['A1-3'], parent: 'sspp.org', when: function () { return ['supplier', 'mixed'].indexOf(A('sspp.org')) >= 0 || A('sspp.kind') === 'supplier'; } }),
        Q('sspp.deleg', 'How the safety program is organized', 'Will the program use delegated authority?', [['none0', 'No: the authority reviews directly', ''], ['der', 'Designated engineering representatives (DERs)', ''], ['oda', 'An organization designation authorization (ODA)', ''], ['doa', 'An EASA design organization approval (DOA)', '']],
            function (v) { if (v === 'none0') return 'The authority will review the safety work directly; no delegation is used.'; var m = { der: 'designated engineering representatives', oda: 'the company\'s organization designation authorization', doa: 'the company\'s design organization approval' }; return 'Findings of compliance on the safety work will be made through ' + listJoin(String(v).split('|').filter(function (x) { return m[x]; }).map(function (x) { return m[x]; })) + ', within the limits the authority has delegated.'; },
            { type: 'checks', da: ['A8-1'], reasonFor: [], need: function (v) { return v.indexOf('none0') >= 0 && v.split('|').length > 1 ? '"No delegation" cannot go with a delegation: pick one or the other.' : ''; } }),
        // Responsibilities
        Q('sspp.reqs', 'Safety responsibilities', 'Where will the safety requirements be kept?', [['sl', 'In Safety Lab, traced to the failure condition each comes from', ''], ['rm', 'In the program\'s requirements tool, exchanged with Safety Lab', ''], ['both', 'Written in Safety Lab, baselined in the requirements tool', '']],
            { sl: 'Safety requirements will be written and kept in Safety Lab, each traced to the failure condition, fault tree or common cause finding it comes from.', rm: 'Safety requirements will be kept in the program\'s requirements tool. Safety Lab sends each new safety requirement across with its trace, and reads its status back.', both: 'Safety requirements will be written in Safety Lab, traced to where each comes from, and baselined in the program\'s requirements tool; changes come back into Safety Lab.' },
            { da: ['A2-3', 'A2-4'], tools: ['ac-req', 'golden-thread'] }),
        Q('sspp.reviews', 'Safety responsibilities', 'When will the safety work be presented at design reviews?', [['pdr_cdr', 'The PSSA at PDR, the SSA at CDR, with a safety review before each', ''], ['every', 'A safety item at every program review', ''], ['gates', 'Its own safety reviews, at each completion gate', ''], ['srr_pdr_cdr', 'The FHAs at SRR, the PSSA at PDR, the SSA at CDR', '']],
            { pdr_cdr: 'The preliminary safety assessments will be presented at the preliminary design review and the system safety assessments at the critical design review. An engineering safety review is held before each, and its findings are closed or carried as actions.', every: 'Every program review will have a safety item: what changed in the assessments since the last review, the open findings, and the requirements they raised.', gates: 'The safety work will have its own reviews, one at each completion gate in Safety Lab. A gate passes only when its checklist is complete and a reviewer has signed it.', srr_pdr_cdr: 'The functional hazard assessments will be presented at the system requirements review, the preliminary safety assessments at the preliminary design review, and the system safety assessments at the critical design review, each after an engineering safety review.' },
            { da: ['A1-2', 'A7-1'], tools: ['review'] }),
        Q('sspp.signoff', 'Safety responsibilities', 'Who will sign a completed assessment?', [['indep', 'Its author and a reviewer who did not write it', ''], ['lead', 'The safety lead', ''], ['board', 'A safety review board', ''], ['indep_board', 'Author, independent reviewer, then the board for Catastrophic and Hazardous', '']],
            { indep: 'Each assessment will be signed by its author and by a reviewer who did not write it. A reviewer cannot sign work they wrote.', lead: 'Each assessment will be signed by the safety lead once its checklist is complete.', board: 'Each assessment will be signed by the safety review board after its review.', indep_board: 'Each assessment will be signed by its author and by a reviewer who did not write it; one that covers a Catastrophic or Hazardous failure condition is then signed by the safety review board.' },
            { da: ['A7-1', 'A4-3', 'A5-3'], tools: ['review'] }),
        Q('sspp.maint', 'Safety responsibilities', 'How will safety-related maintenance tasks be found?', [['ccmr', 'From the fault trees: each latent failure gets the longest check interval its target allows', 'Turns the latent failures (CCMR) lane on.'], ['msg3', 'Handed to MSG-3 as candidate tasks, the ones the safety case relies on kept as CMRs', 'Turns the latent failures lane on.'], NOTP('no failure condition is expected to rely on a hidden failure being found by a check')],
            function (v) { var s = []; if (v.indexOf('ccmr') >= 0) s.push('Every latent failure in a Catastrophic or Hazardous fault tree will be given the longest check interval at which its failure condition still meets its target; those intervals become candidate certification maintenance requirements.'); if (v.indexOf('msg3') >= 0) s.push('The latent failures and their intervals will be handed to the MSG-3 analysis as candidate tasks; the ones the safety case depends on are kept as certification maintenance requirements and never escalated without the safety group.'); if (v.indexOf('none') >= 0) s.push('No safety-related maintenance tasks are planned.'); return s.join(' '); },
            { type: 'checks', da: ['A3-3'], tools: ['ccmr', 'ram-msg3'], set: [LANE('ccmr', ['ccmr', 'msg3'], ['none'])], need: function (v) { return v.indexOf('none') >= 0 && v.split('|').length > 1 ? '"Not planned" cannot go with a method: pick one or the other.' : ''; } }),
        Q('sspp.mmel', 'Safety responsibilities', 'Will the aircraft have a master minimum equipment list (MMEL)?', [YES('Yes', 'Turns the dispatch relief lane on.'), NOTP('turns the dispatch relief lane off; its data is kept')],
            { yes: 'The aircraft will have a master minimum equipment list. Each item proposed for dispatch inoperative will be checked against the safety assessment, with the exposure time it adds, before it goes on the list.', none: 'The aircraft will not have a master minimum equipment list.' },
            { da: ['A3-3'], tools: ['mmel'], set: [LANE('ram-mmel', ['yes'], ['none'])], when: isFixedOrRotor }),
        Q('sspp.testkind', 'Safety responsibilities', 'Which tests will the safety claims rely on?', [['lab', 'Lab and rig tests', ''], ['ironbird', 'An iron bird or systems integration rig', ''], ['ground', 'Aircraft ground tests', ''], ['flight', 'Flight tests', ''], ['sim', 'Simulator tests', '']],
            function (v) { var m = { lab: 'lab and rig tests', ironbird: 'an iron bird or systems integration rig', ground: 'aircraft ground tests', flight: 'flight tests', sim: 'simulator tests' }; return 'Safety claims that need a test will be shown by ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + '.'; },
            { type: 'checks', da: ['A5-1'], tools: ['vv-status'] }),
        Q('sspp.test', 'Safety responsibilities', 'How will safety claims that need a test be tracked?', [['link', 'Each linked to a verification activity and closed with its result', ''], ['ssa', 'Results gathered when the system safety assessment is written', '']],
            { link: 'Each safety requirement or assumption that needs a test will be linked to a verification activity, and closed only when that activity\'s result is recorded.', ssa: 'Test results that support the safety case will be gathered and checked when the system safety assessments are written.' },
            { da: ['A5-1', 'A4-2'], tools: ['vv-status', 'assumptions'] }),
        // The assessment process and its methods
        Q('sspp.afha', 'The safety assessment process and its methods', 'How will the aircraft FHA be performed?', [['functions', 'From the aircraft function list: every function in every flight phase', ''], ['workshop', 'In workshops with pilots and engineers, function by function', ''], ['both', 'Drafted from the function list, then checked in workshops', ''], ['ai', 'Drafted by the AI Assistant from the functions and the basis, then reviewed and accepted by engineers', '']],
            { functions: 'The aircraft functional hazard assessment will work through the aircraft function list: each function\'s loss and malfunction in every flight phase, classified by its effect on the aircraft, the crew and the occupants.', workshop: 'The aircraft functional hazard assessment will be performed in workshops with pilots and engineers, one function at a time, and each failure condition recorded with its classification and its reason.', both: 'The aircraft functional hazard assessment will be drafted from the aircraft function list, each function in every flight phase, and then checked in workshops with pilots and engineers.', ai: 'The aircraft functional hazard assessment will be drafted by the AI Assistant from the aircraft functions, the flight phases and the certification basis, and each failure condition reviewed and accepted by an engineer before it counts.' },
            { da: ['A3-1', 'A2-1'], tools: ['ac-func', 'ac-fha', 'phases'] }),
        Q('sspp.pasa', 'The safety assessment process and its methods', 'Will a preliminary aircraft safety assessment (PASA) be performed?', [YES('Yes', 'The aircraft architecture is checked against the aircraft failure conditions before the systems are designed.'), NOTP()],
            { yes: 'A preliminary aircraft safety assessment will check the aircraft architecture against the aircraft failure conditions, including those that involve more than one system, and set the safety requirements the systems inherit.', none: 'No preliminary aircraft safety assessment will be performed.' },
            { da: ['A3-2'], tools: ['pasa'] }),
        Q('sspp.combined', 'The safety assessment process and its methods', 'Which methods will be used for aircraft failure conditions that involve more than one system?', [['interdep', 'Interdependence analysis: which systems contribute to each aircraft failure condition', 'The starting point for MAC and CoFFE.'], ['mac', 'MAC: a model of how the systems combine, which builds the multi-system fault trees', ''], ['coffe', 'CoFFE: combined functional failure effects, worked case by case', '']],
            function (v) { var vs = String(v).split('|'), s = []; if (vs.indexOf('interdep') >= 0) s.push('an interdependence analysis records which systems contribute to each aircraft failure condition'); if (vs.indexOf('mac') >= 0 && vs.indexOf('coffe') >= 0) s.push('MAC then models how the systems combine and builds the multi-system fault trees, with CoFFE worked by hand for the cases the model cannot answer'); else if (vs.indexOf('mac') >= 0) s.push('MAC then models how the systems combine and builds the multi-system fault trees'); else if (vs.indexOf('coffe') >= 0) s.push('the combined functional failure effects (CoFFE) are then worked case by case'); return 'Aircraft failure conditions that involve more than one system will be addressed as follows: ' + s.join('; ') + '.'; },
            { type: 'checks', da: ['A3-2'], tools: ['pasa'], set: [SLOT('combinedEffects', 'Failure conditions across systems', function (v) { var vs = String(v).split('|'), m = vs.indexOf('mac') >= 0, c = vs.indexOf('coffe') >= 0; return m && c ? 2 : m ? 0 : c ? 1 : null; })],
              need: function (v) { var vs = v.split('|'); return (vs.indexOf('mac') >= 0 || vs.indexOf('coffe') >= 0) && vs.indexOf('interdep') < 0 ? 'MAC and CoFFE both start from the interdependence analysis (which systems contribute to each failure condition): add it.' : ''; } }),
        Q('sspp.sfha', 'The safety assessment process and its methods', 'Who will perform the system FHAs?', [['teams', 'Each system team, with its safety engineer', ''], ['safety', 'The safety group', ''], ['supplier', 'The system supplier', ''], ['mixed', 'Set system by system in the system register', '']],
            { teams: 'Each system team will perform its system functional hazard assessment with its safety engineer, from the system functions and the aircraft failure conditions the system takes part in.', safety: 'The safety group will perform every system functional hazard assessment.', supplier: 'Each system supplier will perform the system functional hazard assessment for what it supplies; the program checks it against the aircraft failure conditions.', mixed: 'Who performs each system functional hazard assessment will be set system by system in the system register.' },
            { da: ['A3-1'], tools: ['sys-dir'] }),
        Q('sspp.pssa', 'The safety assessment process and its methods', 'Which methods will the PSSAs use to show each architecture meets its targets?', [['fta', 'Fault trees', ''], ['dd', 'Dependence diagrams', ''], ['markov', 'Markov models, where repair or the order of failures matters', 'Turns the Markov lane on.']],
            function (v) { var m = { fta: 'fault trees', dd: 'dependence diagrams', markov: 'Markov models where repair, a sequence of failures or time on a degraded mode matters' }; return 'To show each architecture can meet its targets, the preliminary system safety assessments will use ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + '.'; },
            { type: 'checks', da: ['A3-2'], tools: ['fta', 'markov'], set: [SLOT('quantification', 'Quantitative method', function (v) { return String(v).split('|').indexOf('markov') >= 0 ? 1 : 0; }), LANE('markov', ['markov'], ['fta', 'dd'])], need: function (v) { return v.split('|').indexOf('markov') >= 0 && v.split('|').indexOf('fta') < 0 ? 'Markov models attach to fault trees in Safety Lab: add fault trees.' : ''; } }),
        Q('sspp.quant', 'The safety assessment process and its methods', 'Which failure conditions will be shown with numbers?', [['cathaz', 'Catastrophic and Hazardous; Major qualitatively', ''], ['catmaj', 'Catastrophic, Hazardous and Major', ''], ['all', 'Every classified failure condition', '']],
            { cathaz: 'Catastrophic and Hazardous failure conditions will be shown to meet their targets with numbers; Major failure conditions qualitatively, unless the architecture is complex enough to need numbers.', catmaj: 'Catastrophic, Hazardous and Major failure conditions will be shown to meet their targets with numbers.', all: 'Every classified failure condition will be shown to meet its target with numbers.' },
            { da: ['A3-2', 'A3-3'], tools: ['fta'] }),
        Q('sspp.notg', 'The safety assessment process and its methods', 'Will the fault trees use NOT logic (a failure that makes things safer)?', [['no', 'No: coherent trees only', ''], ['yes', 'Yes, where the analysis needs "this does not happen" logic', '']],
            { no: 'The fault trees will be coherent: a failure never makes the aircraft safer, so no NOT logic is used.', yes: 'NOT logic will be used where the analysis needs it, for example a protection that only acts when another event has not happened; each use is reviewed.' },
            { own: false, da: ['A3-2'], tools: ['fta'], set: [NOTG()] }),
        Q('sspp.fmea', 'The safety assessment process and its methods', 'Which FMEAs will support the system safety assessments?', [['ffmea', 'Functional FMEA', 'Turns the functional FMEA lane on.'], ['ppfmea', 'Piece-part (hardware) FMEA', 'Turns the piece-part FMEA lane on.'], ['fmes', 'A failure modes summary (FMES) feeding the fault trees', 'Turns the FMES lane on.'], NOTP()],
            function (v) { if (v.indexOf('none') >= 0) return 'No FMEA is planned.'; var m = { ffmea: 'functional FMEAs', ppfmea: 'piece-part FMEAs', fmes: 'a failure modes summary (FMES) that feeds the fault trees' }; return 'The system safety assessments will be supported by ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + '.'; },
            { type: 'checks', da: ['A3-3'], tools: ['fmea', 'fmes'], set: [LANE('ffmea', ['ffmea'], ['none']), LANE('ppfmea', ['ppfmea'], ['none']), LANE('fmes', ['fmes'], ['none'])], need: function (v) { return v.indexOf('none') >= 0 && v.split('|').length > 1 ? '"Not planned" cannot go with an FMEA: pick one or the other.' : ''; } }),
        Q('sspp.ssa', 'The safety assessment process and its methods', 'How will the as-built design be shown to meet its targets (SSA)?', [['trees', 'The PSSA fault trees, updated with the as-built design, rates and test results', ''], ['new', 'New verification trees built from the design as built', '']],
            { trees: 'The system safety assessments will take the preliminary fault trees forward, updated with the as-built design, failure rates and exposure times, and show each failure condition meets its target with the verification results attached.', new: 'The system safety assessments will build verification fault trees from the design as built, and show each failure condition meets its target.' },
            { da: ['A3-3', 'A5-2'], tools: ['fta', 'asa'] }),
        Q('sspp.asa', 'The safety assessment process and its methods', 'How will the aircraft-level fault trees be made?', [['compiled', 'Compiled from the model of how the systems combine', ''], ['authored', 'Written by hand and checked against the model', ''], ['both', 'Both, compared with each other', '']],
            { compiled: 'The aircraft-level fault trees will be compiled from the model of how the systems combine.', authored: 'The aircraft-level fault trees will be written by the safety engineers and checked against the model of how the systems combine.', both: 'The aircraft-level fault trees will be both compiled from the model and written by hand, and the two compared; any difference is explained before the aircraft safety assessment is signed.' },
            { da: ['A3-3'], tools: ['asa'], set: [SLOT('aircraftTrees', 'Aircraft-level fault trees', function (v) { return { compiled: 0, authored: 1, both: 2 }[v]; })], when: function () { return A('sspp.kind') !== 'supplier'; } }),
        Q('sspp.dal', 'The safety assessment process and its methods', 'Will a function or item DAL ever be lower than its worst failure condition asks?', [['indep', 'Yes, where independence allows it, the claim checked by a common mode analysis', 'The DAL takes the reduction at once, marked "CMA pending" until the CMA confirms it.'], ['no', 'No: every DAL is what the worst failure condition asks', '']],
            { indep: 'Function and item development assurance levels will start from the worst failure condition each contributes to. A lower level will be taken only where the architecture gives the independence that allows it; the claim is recorded, the level is marked "CMA pending", and a common mode analysis must show the independence holds before the level counts.', no: 'Every function and item development assurance level will be the level its worst failure condition asks for; no level is lowered.' },
            { da: ['A3-2', 'A3-5'], tools: ['dal-ref', 'cma'], need: function (v) { return v === 'indep' && A('sspp.cma') === 'none' ? 'Lowering a DAL needs a common mode analysis to confirm the independence, and the plan has none: plan a CMA, or do not lower DALs.' : ''; } }),
        Q('sspp.idal', 'The safety assessment process and its methods', 'How will item DALs be assigned?', [['fdal', 'Each item takes the DAL of the function it serves', ''], ['arch', 'From the architecture: independent items in a failure set may take a lower DAL, with the reason', '']],
            { fdal: 'Each item will take the development assurance level of the function it serves; no item level is lower than its function\'s.', arch: 'Item development assurance levels will be set from the architecture: where the items in a failure set are independent, an item may take a lower level, with the independence that allows it recorded and confirmed by the common mode analysis.' },
            { da: ['A3-2', 'A3-5'], tools: ['dal-ref', 'items'], need: function (v) { return v === 'arch' && A('sspp.cma') === 'none' ? 'Item DALs from the architecture need a common mode analysis to confirm the independence, and the plan has none.' : ''; } }),
        Q('sspp.items', 'The safety assessment process and its methods', 'What kinds of items will the program develop?', [['sw', 'Software, to DO-178C', ''], ['aeh', 'Airborne electronic hardware, to DO-254', ''], ['simple', 'Simple hardware only, shown by test and analysis', ''], ['cots', 'Bought or previously developed items', '']],
            function (v) { var m = { sw: 'software (to DO-178C)', aeh: 'airborne electronic hardware (to DO-254)', simple: 'simple hardware (shown fit by test and analysis, without an IDAL)', cots: 'bought or previously developed items (shown fit by service history or added verification)' }; return 'The program will develop ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + '. Each software and hardware item will have its own plan for its certification aspects, written under this one.'; },
            { type: 'checks', da: ['A2-2', 'A3-2'], tools: ['items'] }),
        Q('sspp.indep', 'The safety assessment process and its methods', 'How will independence between functions and items be tracked?', [['ledger', 'A ledger of each independence claim, with the CMA', ''], ['cma', 'In the CMA worksheets only', '']],
            { ledger: 'Every independence claim will be kept in a ledger with its basis and the common mode analysis that checks it. A claim the analysis cannot support is flagged at once and the levels that depend on it are raised.', cma: 'Independence claims will be recorded and checked in the common mode analysis worksheets.' },
            { da: ['A3-5'], tools: ['ipledger', 'cma'], set: [SLOT('independence', 'Independence evaluation', function (v) { return { ledger: 0, cma: 1 }[v]; }), LANE('ipledger', ['ledger'], ['cma'])] }),
        // Common cause
        Q('sspp.cma', 'Common cause analyses', 'Will a common mode analysis (CMA) be performed?', [YES('Yes', 'Turns the CMA lane on.'), NOTP('turns the CMA lane off; its data is kept')],
            { yes: 'A common mode analysis will check every independence the fault trees and the development assurance levels count on: common design, common software, common manufacture, common maintenance and common installation.', none: 'No common mode analysis will be performed.' },
            { da: ['A3-4', 'A3-5'], tools: ['cma'], set: [LANE('cma', ['yes'], ['none'])] }),
        Q('sspp.pra', 'Common cause analyses', 'Which particular risks will be analyzed?', [['rotor', 'Engine and APU rotor burst', ''], ['tire', 'Tire and wheel failure', ''], ['bird', 'Bird strike', ''], ['fire', 'Fire', ''], ['hirf', 'Lightning and high-intensity radiated fields', ''], ['fluid', 'Fluid leaks and high-energy line failure', ''], ['battery', 'Battery thermal runaway', ''], ['ice', 'Ice shedding and hail', ''], NOTP('turns the PRA lane off; its data is kept')],
            function (v) { if (v.indexOf('none') >= 0) return 'No particular risk analysis will be performed.'; var m = { rotor: 'engine and APU rotor burst', tire: 'tire and wheel failure', bird: 'bird strike', fire: 'fire', hirf: 'the effects of lightning and HIRF', fluid: 'fluid leaks and high-energy line failure', battery: 'battery thermal runaway', ice: 'ice shedding and hail' }; return 'A particular risk analysis will check the events outside the systems that could defeat their independence: ' + listJoin(String(v).split('|').filter(function (x) { return m[x]; }).map(function (x) { return m[x]; })) + '.'; },
            { type: 'checks', da: ['A3-4'], tools: ['pra'], set: [LANE('pra', ['rotor', 'tire', 'bird', 'fire', 'hirf', 'fluid', 'battery', 'ice', 'own'], ['none'])], need: function (v) { return v.indexOf('none') >= 0 && v.split('|').length > 1 ? '"Not planned" cannot go with a particular risk: pick one or the other.' : ''; } }),
        Q('sspp.zsa', 'Common cause analyses', 'Will a zonal safety analysis (ZSA) be performed?', [['cad', 'Yes, from the CAD model and its zones', 'Turns the ZSA lane on.'], ['list', 'Yes, from a zone list and the installation drawings', 'Turns the ZSA lane on.'], NOTP('turns the ZSA lane off; its data is kept')],
            { cad: 'A zonal safety analysis will check each zone of the aircraft, read from the CAD model, for installation and maintenance errors and for one system\'s failure harming another nearby.', list: 'A zonal safety analysis will check each zone of the aircraft, from the zone list and the installation drawings, for installation and maintenance errors and for one system\'s failure harming another nearby.', none: 'No zonal safety analysis will be performed.' },
            { da: ['A3-4'], tools: ['zsa'], set: [LANE('zsa', ['cad', 'list', 'own'], ['none'])] }),
        Q('sspp.stpa', 'Common cause analyses', 'Will hazards from the way systems work together be looked at with STPA?', [YES('Yes', 'Turns the STPA lane on.'), ['no', 'No', 'Turns the STPA lane off; its data is kept.']],
            { yes: 'A system-theoretic process analysis (STPA) will look for hazards that come from the way the systems, the crew and the automation work together, rather than from a part failing.', no: 'STPA will not be used.' },
            { da: ['A3-1'], tools: ['stpa'], set: [LANE('stpa', ['yes'], ['no'])], own: false }),
        Q('sspp.cea', 'Common cause analyses', 'Will cascading failures be traced from one system into others?', [YES('Yes', 'Turns the cascading effects lane on.'), ['no', 'No: covered inside each system\'s fault trees', 'Turns the cascading effects lane off; its data is kept.']],
            { yes: 'A failure in one system will be traced through the interfaces into the systems that depend on it, and the cascade checked against the failure conditions.', no: 'Cascading failures will be covered inside each system\'s fault trees; no separate tracing is done.' },
            { da: ['A3-4'], tools: ['cea'], set: [LANE('cea', ['yes'], ['no'])], own: false }),
        // Development assurance
        Q('sspp.levels', 'Development assurance', 'Which DAL will set the objectives the program works to?', [['top', 'The highest DAL on the program, for all of the work', ''], ['each', 'Each function and item its own DAL', '']],
            { top: 'The program will work to the objectives its highest development assurance level calls for, across all of its work.', each: 'Each function and item will be developed to the objectives its own development assurance level calls for, and no fewer.' },
            { da: ['A1-1', 'A3-2'], tools: ['appa', 'dal-ref'] }),
        Q('sspp.transition', 'Development assurance', 'What will let the work move from one step to the next?', [['gates', 'A signed completion gate: its checklist complete and reviewed', ''], ['review', 'The exit criteria of the design review', ''], ['both', 'Both', '']],
            { gates: 'Work will move from one step to the next only when that step\'s completion gate is signed: every checklist item done, or tailored out with a signed reason, and a reviewer\'s signature.', review: 'Work will move from one step to the next when the design review\'s exit criteria are met.', both: 'Work will move from one step to the next when the completion gate is signed and the design review\'s exit criteria are met.' },
            { da: ['A1-2', 'A7-3'], tools: ['dashboard', 'review'] }),
        Q('sspp.indepvv', 'Development assurance', 'Who will do the independent checks that DAL A and B ask for in validation and verification?', [['peer', 'An engineer from another team who did not write the work', ''], ['group', 'A separate validation and verification group', ''], ['der', 'A designated engineering representative or the customer', '']],
            { peer: 'Where a development assurance level asks for validation or verification to be done independently, it will be done by an engineer from another team who did not write the work, and their name recorded with each check.', group: 'Where a development assurance level asks for validation or verification to be done independently, it will be done by a separate validation and verification group outside the design teams.', der: 'Where a development assurance level asks for validation or verification to be done independently, it will be done or witnessed by a designated engineering representative or the customer.' },
            { da: ['A4-3', 'A5-3', 'A4-1', 'A5-1'], tools: ['validation', 'vv-status'] }),
        Q('sspp.valm', 'Development assurance', 'Which methods will validate the safety requirements?', [['trace', 'Traceability to their source', ''], ['analysis', 'Analysis', ''], ['similar', 'Similarity to a design in service', ''], ['review', 'Engineering review', ''], ['test', 'Test or simulation', '']],
            function (v) { var m = { trace: 'traceability to the failure condition each comes from', analysis: 'analysis', similar: 'similarity to a design in service', review: 'engineering review', test: 'test or simulation' }; return 'Safety requirements will be validated by ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + ', with more methods at the higher development assurance levels.'; },
            { type: 'checks', da: ['A4-1', 'A4-3'], tools: ['validation'] }),
        Q('sspp.pa', 'Development assurance', 'Who will do process assurance?', [['qa', 'The quality organization, outside the engineering line', ''], ['eng', 'An engineer from outside the program', ''], ['third', 'An independent company', '']],
            { qa: 'Process assurance will be done by the quality organization, outside the engineering line. It audits the work against this plan and holds each finding open until it is closed with evidence.', eng: 'Process assurance will be done by an engineer from outside the program, who audits the work against this plan.', third: 'Process assurance will be done by an independent company, which audits the work against this plan.' },
            { da: ['A7-1', 'A7-2', 'A7-4'], tools: ['appa', 'review'] }),
        Q('sspp.show', 'Development assurance', 'How will each objective be shown met to the authority?', [['report', 'In the safety assessment reports, objective by objective', ''], ['matrix', 'In a compliance matrix in the certification plan', ''], ['both', 'Both', '']],
            { report: 'Each objective will be shown met in the safety assessment reports, objective by objective, with the evidence behind it.', matrix: 'Each objective will be shown met in a compliance matrix in the certification plan.', both: 'Each objective will be shown met in the safety assessment reports, with its evidence, and summarized in a compliance matrix in the certification plan.' },
            { da: ['A8-1', 'A8-2'], tools: ['appa', 'moc'] }),
        // Tools
        Q('sspp.rmtool', 'Tools', 'Which requirements tool will the program use?', [['none', 'None: requirements stay in Safety Lab', ''], ['jama', 'Jama Connect', ''], ['doors', 'IBM DOORS Classic', ''], ['doors-next', 'IBM DOORS Next', ''], ['polarion', 'Siemens Polarion', ''], ['codebeamer', 'PTC Codebeamer', '']],
            function (v) { return v === 'none' ? 'The program will keep its requirements in Safety Lab; no separate requirements tool is used.' : 'The program\'s requirements tool will be ' + RM_NAMES[v] + '. Requirements move between it and Safety Lab ' + (v === 'jama' ? 'through the live connection or by ReqIF.' : 'by ReqIF.'); },
            { da: ['A2-3', 'A6-2'], tools: ['reqif'], set: [TOOL('rm', 'Requirements management', RM_NAMES)], reasonFor: [] }),
        Q('sspp.mbse', 'Tools', 'Where will the system architecture come from?', [['syslab', 'Sys Lab', ''], ['cameo', 'Cameo Systems Modeler', ''], ['capella', 'Capella', ''], ['genesys', 'GENESYS', ''], ['none', 'Safety Lab only', '']],
            function (v) { return v === 'none' ? 'The aircraft functions and the systems will be written in Safety Lab; no separate modeling tool is used.' : 'The aircraft functions and the system architecture will come from ' + MBSE_NAMES[v] + ', brought into Safety Lab so the assessments work from the same model.'; },
            { da: ['A2-1', 'A2-2'], tools: ['ac-func', 'sys-dir'], set: [TOOL('mbse', 'Modeling tool', MBSE_NAMES)], reasonFor: [] }),
        Q('sspp.toolq', 'Tools', 'How will Safety Lab\'s results be trusted for certification credit?', [['review', 'Each result the safety case relies on is reviewed by an engineer', 'No tool qualification is needed.'], ['qualify', 'Safety Lab is qualified to DO-330 for the analyses that take credit', '']],
            { review: 'Every Safety Lab result the safety case relies on (a probability, a cut set, a DAL) will be reviewed by an engineer before it is used, so the tool needs no qualification.', qualify: 'Safety Lab will be qualified to DO-330, at the level its use needs, for the analyses that take certification credit without an independent check of their output.' },
            { da: ['A1-1', 'A5-2'] }),
        Q('sspp.ai', 'Tools', 'How will content drafted by the AI Assistant be handled?', [['accept', 'An engineer reads and accepts each draft before it counts', ''], ['off', 'The AI Assistant will not be used', '']],
            { accept: 'Content drafted by the AI Assistant will be logged with what produced it and will count only after an engineer has read and accepted it. Numbers are always computed by the tool, never written by the AI.', off: 'The AI Assistant will not be used on this program.' },
            { da: ['A7-3'], tools: ['ai'], need: function (v) { return v === 'off' && A('sspp.afha') === 'ai' ? 'The aircraft FHA is planned to be drafted by the AI Assistant, but the AI Assistant is not to be used: change one of them.' : ''; } }),
        // Configuration management and records
        Q('sspp.cm', 'Configuration management and records', 'When will the safety data be baselined?', [['reviews', 'At each design review', ''], ['gates', 'At each signed completion gate', ''], ['cert', 'At each certification submission', '']],
            { reviews: 'The safety data will be baselined at each design review: a signed snapshot of the whole project that later changes are compared against.', gates: 'The safety data will be baselined each time a completion gate is signed.', cert: 'The safety data will be baselined at each certification submission.' },
            { da: ['A6-1', 'A6-2', 'A6-3'], tools: ['cm'] }),
        Q('sspp.ccat', 'Configuration management and records', 'Which control category will the safety data get?', [['dal', 'By DAL: category 1 for DAL A and B data, category 2 below', ''], ['sc1', 'Category 1 for all of it', '']],
            { dal: 'Safety data for DAL A and B functions will be kept under system control category 1 (change control, problem reporting and baselines); data for lower levels under category 2 (identified, protected and retrievable).', sc1: 'All safety data will be kept under system control category 1: change control, problem reporting and baselines.' },
            { da: ['A6-1', 'A6-2', 'A6-3'], tools: ['cm'] }),
        Q('sspp.soi', 'Configuration management and records', 'How will the authority be kept informed?', [['soi', 'Stages of involvement through the program', ''], ['submit', 'At each submission only', '']],
            { soi: 'The authority will be kept informed through stages of involvement: at planning, during development, during verification and before the final submission. This plan is submitted at the first.', submit: 'The authority will see the safety work at each submission.' },
            { da: ['A8-1', 'A8-2'], tools: ['moc'] }),
        Q('sspp.keep', 'Configuration management and records', 'How long will the safety records be kept?', [['life', 'For the life of the type certificate and the aircraft in service', ''], ['company', 'To the company\'s records policy, at least as long as the authority requires', '']],
            { life: 'The safety records will be kept for the life of the type certificate and of the aircraft in service, retrievable on request.', company: 'The safety records will be kept to the company\'s records policy, and at least as long as the authority requires.' },
            { da: ['A6-3'], tools: ['cm'] })
    ];

    var hfOn = function () { return A('hfp.need') !== 'none'; };
    var HFP_QS = [
        Q('hfp.need', 'Scope and purpose', 'How much human factors work will the program need?', [['full', 'A full program: the flight deck is new', 'Turns the human factors lane on.'], ['changed', 'The changed parts of the flight deck only', 'Turns the human factors lane on; the unchanged parts are listed as carried over.'], NOTP('turns the human factors lane off; its data is kept')],
            { full: 'The flight deck is new, so the program will run a full human factors program: the crew\'s part in every function, their workload, the errors they could make, how they are told about failures, and the minimum crew.', changed: 'Only parts of the flight deck change, so the human factors work will cover the changed controls, displays, alerts and procedures, and everything they affect; the unchanged parts are listed as carried over with the reason.', none: 'No human factors program will be run, because the crew\'s controls, displays and procedures do not change.' },
            { da: ['A2-1'], tools: ['hfa-auto'], set: [LANE('hfa', ['full', 'changed', 'own'], ['none'])] }),
        Q('hfp.basis', 'Scope and purpose', 'Which flight deck rules will the design be shown to meet?', [['25', '14 CFR 25.1302 and 25.1523 with Appendix D', ''], ['cs25', 'CS 25.1302 and CS 25.1523', ''], ['23', '14 CFR 23.2600 and 23.2605', ''], ['29', '14 CFR 27.1302 or 29.1302 (rotorcraft)', ''], ['vtol', 'SC-VTOL flight deck requirements', '']],
            function (v) { var m = { 25: '14 CFR 25.1302 (systems the crew uses) and 25.1523 with Appendix D (minimum crew)', cs25: 'CS 25.1302 and CS 25.1523 with Appendix D', 23: '14 CFR 23.2600 (flight deck design) and 23.2605 (installation and operation)', 29: 'the rotorcraft rules 27.1302 or 29.1302', vtol: 'the SC-VTOL flight deck requirements' }; return 'The flight deck will be shown to meet ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + '.'; },
            { type: 'checks', da: ['A8-1'], tools: ['moc'], when: hfOn }),
        Q('hfp.crew', 'The crew and the operation', 'What crew will the design assume?', [['two', 'Two pilots', ''], ['one', 'One pilot', ''], ['remote', 'One pilot, with support from the ground', ''], ['none', 'No pilot on board: a remote pilot station', '']],
            { two: 'The design will assume a crew of two pilots, a pilot flying and a pilot monitoring.', one: 'The design will assume one pilot.', remote: 'The design will assume one pilot on board, with support from a ground station whose part is analyzed like a crew member\'s.', none: 'The aircraft will have no pilot on board; the remote pilot station is analyzed as the flight deck.' },
            { da: ['A4-2'], tools: ['hfa-auto'], when: hfOn, reasonFor: [] }),
        Q('hfp.alloc', 'The human factors work through the design cycle', 'How will the work between the crew and the automation be decided?', [['phase', 'Function by function, in every flight phase', ''], ['function', 'Function by function, the same in every phase', '']],
            { phase: 'Each aircraft function will be given to the crew, the automation or both, in each flight phase. A crew task is made for each phase the crew has a part in, so the workload and error analyses cover every phase.', function: 'Each aircraft function will be given to the crew, the automation or both, once for all phases.' },
            { da: ['A2-1', 'A2-2'], tools: ['hfa-auto'], when: hfOn }),
        Q('hfp.workload', 'Workload and crew error', 'How will the crew\'s workload be measured?', [['share', 'Task time shares from analysis, every phase, with the worst failure on top', ''], ['bedford', 'Bedford ratings in the simulator', ''], ['tlx', 'NASA-TLX ratings in the simulator', ''], ['swat', 'Secondary task or physiological measures in the simulator', '']],
            function (v) { var m = { share: 'from the share of the available time each pilot\'s tasks take in every flight phase, with the worst failure of the phase on top, against a limit of 80%', bedford: 'by pilots rating it on the Bedford scale in the simulator', tlx: 'by pilots rating it with NASA-TLX in the simulator', swat: 'by secondary task or physiological measures in the simulator' }; return 'The crew\'s workload will be measured ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + '.'; },
            { type: 'checks', da: ['A4-1', 'A5-1'], tools: ['hfa-auto', 'hfa-results'], when: hfOn }),
        Q('hfp.error', 'Workload and crew error', 'How will crew errors be analyzed?', [['qual', 'For each crew task and failure response: how each error is noticed and put right', ''], ['quant', 'The same, with an error probability for each, fed into the fault trees', '']],
            { qual: 'For each crew task and each failure response, the credible errors will be listed with how each is noticed and how it is put right. An error nobody notices and nobody can put right stays an open finding until the design changes.', quant: 'For each crew task and each failure response, the credible errors will be listed with how each is noticed, how it is put right, and an error probability that goes into the fault trees.' },
            { da: ['A3-1', 'A3-3'], tools: ['hfa-auto', 'fta'], when: hfOn }),
        Q('hfp.alerts', 'The human factors work through the design cycle', 'How will crew alerts be designed?', [['1322', 'To the warning, caution and advisory levels of 25.1322', ''], ['philo', 'To the company\'s alerting philosophy, shown equivalent', '']],
            { 1322: 'Crew alerts will be designed to the warning, caution and advisory levels of 25.1322, each linked to the failure condition it tells the crew about.', philo: 'Crew alerts will be designed to the company\'s alerting philosophy, shown equivalent to 25.1322, each linked to the failure condition it tells the crew about.' },
            { da: ['A2-3'], tools: ['hfa-auto'], when: hfOn }),
        Q('hfp.eval', 'Evaluations and who does them', 'How will the human factors claims be shown?', [['analysis', 'Analysis', ''], ['mock', 'Mock-ups', ''], ['sim', 'A simulator campaign', ''], ['flight', 'Flight test', '']],
            function (v) { var m = { analysis: 'analysis', mock: 'mock-ups early in the design', sim: 'a simulator campaign with scenarios for each flight phase and each crew-relevant failure', flight: 'flight test for the claims that depend on the real aircraft' }; return 'The human factors claims will be shown by ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + '.'; },
            { type: 'checks', da: ['A5-1', 'A4-1'], tools: ['hfa-results', 'vv-status'], when: hfOn }),
        Q('hfp.pilots', 'Evaluations and who does them', 'Who will fly the evaluations?', [['line', 'Line pilots from operators, not from the design team', ''], ['test', 'The company\'s test pilots', ''], ['both', 'Both', ''], ['authority', 'Both, with the authority\'s pilots', '']],
            { line: 'The evaluations will be flown by line pilots from operators, who were not part of the design.', test: 'The evaluations will be flown by the company\'s test pilots.', both: 'The evaluations will be flown by the company\'s test pilots and by line pilots from operators who were not part of the design.', authority: 'The evaluations will be flown by the company\'s test pilots, line pilots from operators, and the authority\'s pilots.' },
            { da: ['A4-3', 'A5-3'], tools: ['hfa-results'], parent: 'hfp.eval', when: function () { return hfOn() && picked('hfp.eval').some(function (x) { return ['sim', 'flight', 'mock'].indexOf(x) >= 0; }); } }),
        Q('hfp.mfc', 'Minimum flight crew', 'How will the minimum crew be decided?', [['appd', 'The workload functions and factors of Appendix D, then the simulator', ''], ['similar', 'By comparison with a certified aircraft, with the differences analyzed', '']],
            { appd: 'The minimum flight crew will be decided from the workload functions and factors of Appendix D, worked through for each flight phase, and confirmed in the simulator.', similar: 'The minimum flight crew will be decided by comparison with a certified aircraft of the same crew, with each difference in workload analyzed.' },
            { da: ['A8-1'], tools: ['hfa-auto'], when: function () { return hfOn() && A('hfp.crew') !== 'none'; } }),
        Q('hfp.credit', 'Crew actions the safety analysis counts on', 'When the safety analysis counts on a crew action, how will it be recorded?', [['asm', 'As a human factors assumption, validated before it counts', ''], ['note', 'As a note on the failure condition', '']],
            { asm: 'Each crew action the safety analysis counts on will be recorded as a human factors assumption, linked to its crew task, and will count only once it is validated in the evaluations.', note: 'Each crew action the safety analysis counts on will be noted on its failure condition.' },
            { da: ['A4-2'], tools: ['assumptions', 'hfa-auto'], when: hfOn }),
        Q('hfp.feed', 'Crew actions the safety analysis counts on', 'How will crew errors reach the safety assessment?', [['events', 'As basic events in the fault trees', ''], ['fha', 'Through the crew effects in the FHA only', '']],
            { events: 'Crew errors that matter to a failure condition will appear as basic events in its fault tree.', fha: 'Crew errors will reach the safety assessment through the crew effects recorded in the functional hazard assessments.' },
            { da: ['A3-1', 'A3-3'], tools: ['fta', 'ac-fha'], when: hfOn })
    ];
    var ramFull = function () { return A('ramp.need') === 'full' || A('ramp.need') === 'contract'; };
    var RAMP_QS = [
        Q('ramp.need', 'Scope and purpose', 'What reliability work will the program do?', [['safety', 'Only the failure rates the safety assessment needs', 'Turns the reliability engineering lane off; its data is kept.'], ['full', 'A full reliability program: prediction, allocation, growth and failure reporting', 'Turns the reliability engineering lane on.'], ['contract', 'What the customer contract asks, for example MIL-HDBK-338B', 'Turns the reliability engineering lane on.']],
            { safety: 'The program will predict only the failure rates the safety assessment needs, part by part where a fault tree asks for it.', full: 'The program will run a full reliability program: prediction, allocation of targets to the systems, growth tracking, and failure reporting from test and service.', contract: 'The program will run the reliability program the customer contract asks for, tailored from MIL-HDBK-338B, alongside the failure rates the safety assessment needs.' },
            { da: ['A3-2', 'A3-3'], tools: ['ram-hub', 'ram-rel'], set: [LANE('ram-reliability', ['full', 'contract', 'own'], ['safety'])] }),
        Q('ramp.rates', 'Reliability prediction and data sources', 'Where will the failure rates come from?', [['supplier', 'Supplier data, backed by service history', ''], ['field', 'The program\'s own field data', ''], ['nprd', 'Field data handbooks (NPRD, EPRD)', ''], ['217', 'MIL-HDBK-217F parts count and stress', ''], ['fides', 'FIDES', ''], ['217plus', '217Plus', '']],
            function (v) { var m = { supplier: 'supplier data backed by service history', field: 'the program\'s own field data', nprd: 'field data handbooks (NPRD and EPRD)', 217: 'MIL-HDBK-217F parts count and part stress predictions', fides: 'FIDES predictions', '217plus': '217Plus predictions' }; return 'Failure rates will come from ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + ', in that order of preference. Each rate in a fault tree names its source and the environment it was taken for.'; },
            { type: 'checks', da: ['A3-2', 'A3-3'], tools: ['ram-predict', 'fta'] }),
        Q('ramp.env', 'Reliability prediction and data sources', 'Which environment will the predictions assume?', [['ai', 'Airborne, inhabited', ''], ['au', 'Airborne, uninhabited', ''], ['mix', 'Set item by item from where it is installed', '']],
            { ai: 'Predictions will assume the airborne inhabited environment.', au: 'Predictions will assume the airborne uninhabited environment.', mix: 'Each item\'s prediction will use the environment where it is installed: inhabited, uninhabited, or engine-mounted.' },
            { da: ['A3-2'], tools: ['ram-predict'] }),
        Q('ramp.alloc', 'Allocation and growth', 'Will reliability targets be set for each system?', [YES('Yes', ''), ['no', 'No: the safety targets are the only ones', '']],
            { yes: 'The aircraft reliability target will be shared out to the systems, and each system\'s prediction checked against its share.', no: 'No reliability targets will be set for the systems; the safety targets are the only ones.' },
            { da: ['A2-2'], tools: ['ram-alloc'], when: ramFull }),
        Q('ramp.growth', 'Allocation and growth', 'Will reliability growth be tracked in test?', [['crow', 'Yes, with the Crow-AMSAA model against a planned curve', ''], ['duane', 'Yes, with the Duane model', ''], ['no', 'No', '']],
            { crow: 'Reliability growth will be tracked through test with the Crow-AMSAA model, against a planned growth curve.', duane: 'Reliability growth will be tracked through test with the Duane model.', no: 'Reliability growth will not be tracked.' },
            { da: ['A5-2'], tools: ['ram-growth'], when: ramFull }),
        Q('ramp.fracas', 'Failure reporting', 'How will failures in test and service be handled?', [['sl', 'A failure reporting and corrective action system (FRACAS) in Safety Lab', ''], ['other', 'The company\'s own failure reporting system', '']],
            { sl: 'Every failure in test and service will be reported, analyzed for its cause and closed with a corrective action in Safety Lab\'s failure reporting system. A failure a fault tree did not expect is sent back to the safety assessment.', other: 'Failures in test and service will be handled in the company\'s own failure reporting system. A failure a fault tree did not expect is sent back to the safety assessment.' },
            { da: ['A5-2', 'A6-3'], tools: ['ram-rel'] }),
        Q('ramp.life', 'Failure reporting', 'Will life data from test and service be analyzed?', [YES('Yes, with Weibull analysis', ''), ['no', 'No', '']],
            { yes: 'Life data from test and service will be analyzed with Weibull analysis, and a wear-out pattern the fault trees did not assume is sent back to the safety assessment.', no: 'Life data will not be analyzed separately.' },
            { da: ['A5-2'], tools: ['ram-weibull'], when: ramFull }),
        Q('ramp.mx', 'Maintainability and testability', 'Which maintainability work will be done?', [['mttr', 'Repair times and downtime for each replaceable unit', ''], ['test', 'Testability: how well each failure is detected and isolated', ''], ['lora', 'Level of repair analysis', ''], NOTP('turns the maintainability lane off; its data is kept')],
            function (v) { if (v.indexOf('none') >= 0) return 'No maintainability analysis is planned.'; var m = { mttr: 'the repair time and downtime for each replaceable unit', test: 'how well each failure can be detected and isolated', lora: 'the level at which each unit is repaired' }; return 'Maintainability will be analyzed: ' + listJoin(String(v).split('|').map(function (x) { return m[x]; })) + '.'; },
            { type: 'checks', da: ['A2-3'], tools: ['ram-mx', 'ram-test'], set: [LANE('ram-mx', ['mttr', 'test', 'lora', 'own'], ['none'])], need: function (v) { return v.indexOf('none') >= 0 && v.split('|').length > 1 ? '"Not planned" cannot go with an analysis: pick one or the other.' : ''; } }),
        Q('ramp.msg3', 'Scheduled maintenance and dispatch', 'How will scheduled maintenance be developed?', [['msg3', 'With MSG-3', 'Turns the MSG-3 lane on.'], ['own0', 'The manufacturer\'s own method', 'Turns the MSG-3 lane off; its data is kept.'], ['none', 'Not part of this program', '']],
            { msg3: 'Scheduled maintenance will be developed with MSG-3: systems, structures, zonal, and lightning and radiated field tasks. The certification maintenance requirements from the safety assessment are kept apart.', own0: 'Scheduled maintenance will be developed with the manufacturer\'s own method. The certification maintenance requirements from the safety assessment are kept apart.', none: 'Scheduled maintenance is not part of this program.' },
            { da: ['A3-3'], tools: ['ram-msg3', 'ccmr'], set: [LANE('ram-msg3', ['msg3'], ['own0', 'none'])], own: false }),
        Q('ramp.lcc', 'Other reliability analyses', 'Will life-cycle cost be estimated?', [YES('Yes', 'Turns the life-cycle cost lane on.'), ['no', 'No', 'Turns the life-cycle cost lane off; its data is kept.']],
            { yes: 'The life-cycle cost will be estimated from the reliability and maintainability results.', no: 'Life-cycle cost will not be estimated.' },
            { tools: ['lcc'], set: [LANE('ram-lcc', ['yes'], ['no'])], own: false }),
        Q('ramp.sw', 'Other reliability analyses', 'Will software reliability be estimated?', [YES('Yes, as a measure of maturity', 'Turns the software reliability lane on.'), ['no', 'No: software is covered by its DAL', 'Turns the software reliability lane off; its data is kept.']],
            { yes: 'Software reliability will be estimated from test failure data, as a measure of maturity. It never stands in for the software development assurance level.', no: 'Software reliability will not be estimated; software is covered by its development assurance level.' },
            { da: ['A5-2'], tools: ['swrel'], set: [LANE('ram-swrel', ['yes'], ['no'])], own: false }),
        Q('ramp.sneak', 'Other reliability analyses', 'Will a sneak circuit analysis be performed?', [YES('Yes', 'Turns the sneak circuit lane on.'), ['no', 'No', 'Turns the sneak circuit lane off; its data is kept.']],
            { yes: 'A sneak circuit analysis will look for unintended paths in the electrical design that could make a function act when nobody asked it to.', no: 'No sneak circuit analysis will be performed.' },
            { da: ['A3-3'], tools: ['sneak'], set: [LANE('ram-sneak', ['yes'], ['no'])], own: false }),
        Q('ramp.eta', 'Other reliability analyses', 'Will event trees be used?', [YES('Yes', 'Turns the event trees lane on.'), ['no', 'No', 'Turns the event trees lane off; its data is kept.']],
            { yes: 'Event trees will show how an initiating failure leads to different outcomes depending on which protections work.', no: 'Event trees will not be used.' },
            { set: [LANE('eta', ['yes'], ['no'])], own: false })
    ];
    var PLANS = [
        { key: 'sspp', code: 'SSPP', title: 'System Safety Program Plan', secs: SSPP_SECS, qs: SSPP_QS, report: 'System Safety Status Report',
          basis: 'Follows the layout of the example safety program plan in ARP4754B Appendix B, in our own words; ARP4761A for the methods; the certification basis for the targets' },
        { key: 'hfp', code: 'HFP', title: 'Human Factors Plan', secs: HFP_SECS, qs: HFP_QS, report: 'Human Factors Status Report',
          basis: 'Built on the ten steps of the HF Autopilot; the flight deck rules (25.1302, 25.1523 and their equivalents), AC 25.1302-1, AC 25.1523-1' },
        { key: 'ramp', code: 'RAMP', title: 'Reliability and Maintainability Plan', secs: RAMP_SECS, qs: RAMP_QS, report: 'Reliability and Maintainability Status Report',
          basis: 'MIL-HDBK-338B, MIL-STD-785B, MIL-HDBK-217F, MIL-HDBK-470A and MIL-HDBK-472, ATA MSG-3, adapted for a civil aircraft program; the failure rates feed the safety assessment' }
    ];
    var BY = {}, QBY = {}, OWN = ['own', 'Our own way', 'You write how the program will do it; it goes into the plan as you write it.'];
    PLANS.forEach(function (p) { BY[p.key] = p; p.qs.forEach(function (q) { q.excl = q.type === 'checks' ? q.opts.filter(function (o) { return o[0] === 'none' || o[0] === 'none0'; }).map(function (o) { return o[0]; }) : []; if (q.own !== false && q.type !== 'num') q.opts = q.opts.concat([OWN]); QBY[q.k] = q; q.plan = p.key; }); });
    function optLabelK(k, v) { return optLabel(QBY[k], v); }
    function shown(q) { return !q.when || safe(q.when, true); }
    function questions(key) { return BY[key].qs.filter(shown); }

    // ---- the explanations: why each decision matters, and what each answer means for the program --------------------
    // (Waqas: "proper detailed explanations provided with every choice"; "humans like words, the more the better";
    // "but we want to control the noise, and be specific to their choices". Each explanation says what the answer means,
    // when a program picks it, what it commits the program to, and the trade-off.)
    var EX = {
        'sspp.kind': { q: 'The kind of program sets how much of the aircraft has to be assessed from scratch, and what can be carried over from earlier certification. Authorities expect the plan to say this first, because everything else is sized from it.',
            o: { new: 'Nothing is carried over. Every aircraft function gets an FHA, every system a PSSA and SSA, and every independence the architecture relies on gets a common cause check. This is the largest scope, and the authority will review the whole safety case.',
                derivative: 'The program changes a certified aircraft under an amended type certificate. Only the new and changed functions are assessed from scratch, but every function they touch must be re-checked, and each piece of carried-over safety work needs a written reason why it still holds. Picking this means the plan must keep a clear list of what changed.',
                stc: 'The change is made under a supplemental type certificate, often by a company other than the original manufacturer. The assessment covers the change and its effects on the existing aircraft; the original safety case is used where it still applies, and the program may not have access to all of it, which must be planned for.',
                supplier: 'The program designs systems for someone else\'s aircraft. It writes the system FHAs, PSSAs and SSAs and hands them to the aircraft maker, who owns the aircraft-level work (AFHA, PASA, ASA). The plan then has to say what the aircraft maker provides as inputs and what the program owes back.' } },
        'sspp.authority': { q: 'The authorities decide which rules apply and who reviews the work. Working with more than one means planning how each will accept it, and meeting the stricter of their requirements where they differ.',
            o: { faa: 'The Federal Aviation Administration: the US authority, working to 14 CFR and its advisory circulars (for example AC 25.1309-1B).',
                easa: 'The European Union Aviation Safety Agency, working to the CS rules and their AMC material (for example AMC 25.1309). It often adds special conditions for new technology.',
                tcca: 'Transport Canada Civil Aviation, usually validating FAA or EASA work under a bilateral agreement.',
                ukcaa: 'The UK Civil Aviation Authority, which has worked to its own copy of the EASA rules since 2021.',
                anac: 'Brazil\'s authority. Its rules closely follow the FAA\'s; it is usually involved through validation.',
                caac: 'China\'s authority, typically involved through validation of a foreign type certificate, with its own review of the safety case.',
                mil: 'A military airworthiness authority. These often adopt civil standards such as ARP4761A but set their own acceptance rules, so the plan must say which civil practices are kept and which are replaced.' } },
        'sspp.second': { q: 'With more than one authority, the plan must say how the second and later authorities will come to accept the safety work. This decides how many reviews the work goes through and when.',
            o: { validation: 'The first authority certifies; the others validate that certificate under their bilateral agreements. The safety work is written once, to the strictest basis, and the validating authorities review only the areas they flag. This is the most common route and the least repeated work.',
                concurrent: 'All authorities review the work as it is produced. It takes more coordination early, but avoids late surprises from a validating authority that disagrees with an approach after the first certificate is granted.',
                each: 'Each authority reviews on its own schedule. This suits programs where the authorities\' timings or bases differ a lot, but expect the same questions to be answered more than once.' } },
        'basis.reg': { q: 'The certification basis is the set of rules the aircraft is certified to. It decides the failure condition classes, the probability target each class must meet, and the development assurance level each class calls for. Safety Lab uses this choice to check every fault tree against its target and to assign DALs, so it is the first decision the plan makes.',
            o: { 'Part 25': 'Transport category airplanes. Catastrophic failure conditions must be extremely improbable (less than 1 x 10^-9 per flight hour), with DAL A for the functions that could cause them. AC 25.1309-1B is the guidance.',
                'Part 23': 'Normal category airplanes. Targets and DALs depend on the certification level (passenger seats) and the propulsion, through ASTM F3230; a small single-engine airplane has looser targets than a 19-seat turboprop. The follow-up questions set the level and propulsion.',
                'Part 27': 'Normal category rotorcraft. Targets depend on the class of rotorcraft (engines and occupants), following the FAA\'s safety continuum policy. A follow-up question sets the class.',
                'Part 29': 'Transport category rotorcraft. Targets similar to Part 25, with AC 29-2C as the guidance.',
                'SC-VTOL': 'EASA\'s special condition for powered lift and eVTOL aircraft. The Enhanced category (passenger carrying over congested areas) has targets as strict as Part 25; the Basic categories scale with passenger seats. A follow-up question sets the category.',
                'Part 33': 'Aircraft engines. Engine failure effects are classed as major or hazardous under 33.75 with their own probability targets, rather than the airplane classes.',
                'Part 35': 'Propellers. Propeller failure effects follow 35.15, with targets for hazardous propeller effects.',
                'Part 450': 'Commercial space launch and reentry. Safety is judged on risk to the public (expected casualties) rather than per-flight-hour targets, so the fault tree targets work differently.',
                'Part 107': 'Small unmanned aircraft. Under SORA the risk is judged by the operation (ground and air risk) and its mitigations, not by per-flight-hour targets on every failure condition.',
                Custom: 'A basis agreed for this applicant alone, through special conditions. The targets and DALs are defined on the certification basis page and must match what the authority has agreed in writing.' } },
        'basis.p23level': { q: 'Under Part 23 the certification level, set by the number of passenger seats, is one of two inputs that decide the safety targets (ASTM F3230 Table 3). More seats means stricter targets.',
            o: { 1: 'Up to one passenger seat. The loosest targets in Part 23.', 2: 'Two to six passenger seats.', 3: 'Seven to nine passenger seats.', 4: 'Ten to nineteen passenger seats. The strictest Part 23 targets, close to Part 25 for catastrophic failure conditions.' } },
        'basis.p23prop': { q: 'The propulsion is the second input to the Part 23 assessment level. Multi-engine and turbine airplanes get stricter targets than single piston airplanes of the same size.',
            o: { 'recip-1': 'One piston or electric engine.', 'recip-multi': 'More than one piston or electric engine.', 'turbine-1': 'One turbine engine.', 'turbine-multi': 'More than one turbine engine.', other: 'Hybrid, distributed electric, eVTOL or anything else outside ASTM F3230 Table 3. The assessment level is then agreed with the authority (the next question).' } },
        'basis.p23manual': { q: 'When the propulsion falls outside ASTM F3230 Table 3, the assessment level has to be agreed with the authority. The plan records the level agreed.',
            o: { I: 'Assessment level I: the loosest Part 23 targets, as for the smallest single-engine airplanes.', II: 'Assessment level II: one step stricter, as for small multi-engine or larger single-engine airplanes.', III: 'Assessment level III: two steps stricter.', IV: 'Assessment level IV: the strictest Part 23 targets, close to Part 25 for catastrophic failure conditions.' } },
        'basis.p23dal': { q: 'Part 23 lets the program choose how software and electronic hardware DALs are set (ASTM F3061 4.2.5). The choice changes how much development assurance effort the lower-level airplanes need.',
            o: { f3061: 'ASTM F3061 Table 1 gives each failure condition class a primary DAL and a secondary DAL for each assessment level. Smaller airplanes get lower DALs than the ARP4754 method would give, which saves effort without reducing safety for their class.',
                arp4754: 'The ARP4754 method sets DALs from the severity alone (A for catastrophic, B for hazardous and so on), as on larger airplanes. More effort, but consistent with a fleet or supplier that works to ARP4754 everywhere.' } },
        'basis.p27': { q: 'Under Part 27 the class of rotorcraft sets the targets, following the FAA\'s policy for normal category rotorcraft.',
            o: { I: 'Reciprocating engine, up to five occupants. The loosest targets.', II: 'Single turbine, up to five occupants, up to 4,000 lb.', III: 'Single turbine, six or more occupants, 4,001 to 7,000 lb.', IV: 'Twin turbine. Targets close to Part 29.' } },
        'basis.scvtol': { q: 'The SC-VTOL category sets how strict the targets are. EASA ties it to passenger seats and to whether the aircraft carries passengers commercially over congested areas.',
            o: { 'Basic 1': 'No more than one passenger. The loosest targets.', 'Basic 2': 'Two to six passengers.', 'Basic 3': 'Seven to nine passengers.', Enhanced: 'Commercial passenger transport or flight over congested areas. Catastrophic failure conditions must be extremely improbable, as on a transport airplane, and the aircraft must be able to continue safe flight and landing after a failure.' } },
        'basis.mission': { q: 'Probability targets are per flight hour, but many failure conditions only matter in some phases of flight. The certification flight duration is used to turn a phase-limited risk into a per-hour figure fairly, so this choice changes how strict each phase-limited target really is.',
            o: { auto: 'The flight duration is the sum of the flight phases on the flight phases page. Use this when the phases already describe a typical flight.', 1: 'One-hour flights: typical of short regional or eVTOL operations.', 2: 'Two-hour flights.', 3: 'Three-hour flights: a common average for regional jets.', 5: 'Five-hour flights.', 10: 'Ten-hour flights: long-range operations. Longer flights make phase-limited targets slightly looser per hour.' } },
        'basis.special': { q: 'Special conditions, equivalent safety findings and exemptions change the basis for this applicant. Where they set their own safety objectives, those objectives become part of the classifications the program must meet.',
            o: { none0: 'The published rules only. Nothing extra to plan for.', sc: 'Special conditions are added rules for novel features (for example electric propulsion or fly-by-wire). Each one\'s safety objectives come into this plan and are assessed like the others.', esf: 'An equivalent safety finding accepts a different way of meeting a rule. The safety assessment must show the alternative gives the same level of safety.', elos: 'An exemption relieves the applicant from a rule. The plan should record what the exemption covers so no assessment relies on the rule it removes.' } },
        'sspp.org': { q: 'Who does the safety work, and how the teams fit together, decides who signs what and where hand-offs happen. ARP4754B expects the plan to name the organization before it names the processes.',
            o: { central: 'One safety group does all the assessments. Consistent methods and one set of eyes on the whole aircraft, but the group can become a bottleneck on a large program.',
                embedded: 'A small central group sets the methods and owns the aircraft level; safety engineers sit in each system team and do the system work. Faster, and closer to the design, at the cost of needing the central group to review each team\'s work for consistency.',
                supplier: 'Suppliers do the system assessments for what they supply. Common on large programs, but the program must define exactly what each supplier delivers, in what form, and how it is checked.',
                mixed: 'Some systems are assessed in-house and some by suppliers. Each system is listed with who assesses it, and the hand-offs are planned per system.' } },
        'sspp.owner': { q: 'The plan needs one owner, by role, who signs every change to it. Without one, the plan drifts away from how the program actually works.',
            o: { cse: 'The chief safety engineer: the most common owner, closest to the work the plan governs.', lead: 'The aircraft safety lead, on programs where the safety lead reports into engineering.', ce: 'The chief engineer, where the program wants the plan owned at the top of engineering.', cert: 'The certification manager, where the plan is treated mainly as a certification document.', airw: 'The head of airworthiness, typical in design organizations with a separate airworthiness office.' } },
        'sspp.suppliers': { q: 'When suppliers do safety work, the plan must say which plan they work to, so their outputs fit the program\'s.',
            o: { this: 'Suppliers work to this plan, written into each contract. The simplest way to keep methods consistent, but suppliers with their own established processes may push back.',
                theirs: 'Each supplier works to its own plan, which the program accepts against this one before the work starts. Respects mature suppliers\' processes; the program must check each plan carefully.',
                each: 'Decided per supplier in its contract. Flexible, but the plan must keep track of which supplier works to which plan.' } },
        'sspp.deleg': { q: 'Delegation lets people inside the company make findings of compliance on the authority\'s behalf, which speeds up approvals. The plan should say whether it is used, so reviews are planned accordingly.',
            o: { none0: 'The authority reviews everything directly. Simple, but every finding waits for the authority\'s time.', der: 'Designated engineering representatives: individuals appointed by the FAA to approve data in their area.', oda: 'An organization designation authorization: the company itself holds delegated authority from the FAA, within agreed limits.', doa: 'An EASA design organization approval: the company is approved to perform design and some approvals under EASA oversight.' } },
        'sspp.reqs': { q: 'Safety requirements come out of the FHAs, PSSAs and common cause analyses. Where they are kept decides how they stay traced to their source and how changes flow back to the safety assessment.',
            o: { sl: 'Kept in Safety Lab, each traced to the failure condition or finding it came from. Simplest trace, best when the program has no separate requirements tool.', rm: 'Kept in the program\'s requirements tool, with Safety Lab sending new ones across and reading status back. Fits programs where all requirements must live in one tool.', both: 'Written and traced in Safety Lab, baselined in the requirements tool. Keeps the safety trace where it is made and the baseline where the program controls it.' } },
        'sspp.reviews': { q: 'The plan sets when the safety work is shown at design reviews. ARP4754B expects transition criteria, so each review knows what safety work must be ready.',
            o: { pdr_cdr: 'Preliminary assessments at PDR, system safety assessments at CDR, each after an engineering safety review. The common pattern for a design-driven program.', every: 'A safety item at every program review. Keeps safety visible throughout, though reviews are less focused on completion.', gates: 'Separate safety reviews at each completion gate in Safety Lab. Safety progress is judged on its own merits, not tied to the program\'s design reviews.', srr_pdr_cdr: 'FHAs at SRR, PSSAs at PDR and SSAs at CDR. The most complete pattern: the hazards are agreed before the requirements are baselined.' } },
        'sspp.signoff': { q: 'Who signs a finished assessment decides how much independence the review has. Higher DALs expect more independence in checking.',
            o: { indep: 'The author plus a reviewer who did not write it. The standard minimum for independent review.', lead: 'The safety lead alone. Quick, but the same person may have shaped the work.', board: 'A safety review board. More eyes, more time.', indep_board: 'Author and independent reviewer, then the board for the assessments covering catastrophic and hazardous failure conditions. Spends the board\'s time where the risk is highest.' } },
        'sspp.maint': { q: 'Some failures stay hidden until a check finds them. If a failure condition relies on such a check, the check becomes a certification maintenance requirement (CMR). The plan must say how those are found.',
            o: { ccmr: 'The fault trees give each latent failure the longest check interval at which its failure condition still meets its target. Precise and traceable to the safety case.', msg3: 'The latent failures go to the MSG-3 analysis as candidate tasks; the ones the safety case relies on are kept as CMRs. Fits programs that build their maintenance program with MSG-3.', none: 'No failure condition relies on a hidden failure being found by a check. Rare for complex aircraft; the reason is recorded.' } },
        'sspp.mmel': { q: 'A master minimum equipment list lets the aircraft fly with some equipment inoperative. Each item on it must be shown safe for the time it may be inoperative.',
            o: { yes: 'The aircraft will have an MMEL. Each proposed item is checked against the fault trees with the extra exposure time it adds.', none: 'No MMEL. Every listed piece of equipment must work for every flight.' } },
        'sspp.testkind': { q: 'Some safety claims can only be shown by test. Naming the kinds of test early lets the test program plan for them.',
            o: { lab: 'Bench tests of parts and units.', ironbird: 'A rig with the real systems connected, testing how they behave together.', ground: 'Tests on the real aircraft on the ground.', flight: 'Flight tests, for claims that depend on the aircraft in the air.', sim: 'Simulator tests, often for crew-related claims.' } },
        'sspp.test': { q: 'Test results that support the safety case must be tied back to the claim they support.',
            o: { link: 'Each claim is linked to its verification activity and closed when the result is recorded. Nothing is left to be gathered at the end.', ssa: 'Results are gathered when the SSA is written. Less tracking during the program, but gaps show up late.' } }
    };

    Object.assign(EX, {
        'sspp.afha': { q: 'The aircraft FHA finds and classifies every way an aircraft function can fail. Everything downstream (DALs, targets, requirements) starts from it, so how it is done decides how complete the safety case is.',
            o: { functions: 'Work through the aircraft function list, each function\'s loss and malfunction in every flight phase. Systematic and repeatable; completeness depends on the function list being complete.',
                workshop: 'Pilots and engineers work through each function together. Draws on operational experience the function list may miss, but takes more people\'s time and needs careful recording.',
                both: 'Draft from the function list, then check in workshops. The most common good practice: systematic coverage first, judgment second.',
                ai: 'The AI Assistant drafts the failure conditions from the functions, phases and basis; an engineer reviews and accepts each one before it counts. Fastest start, with the engineer still deciding every classification.' } },
        'sspp.pasa': { q: 'The preliminary aircraft safety assessment checks the aircraft architecture against the aircraft failure conditions before the systems are designed, including failures that involve several systems at once. ARP4761A expects it for complex, highly integrated aircraft.',
            o: { yes: 'The aircraft architecture is checked early, and the systems inherit safety requirements and FDALs from it. Problems that span systems are caught before each system is designed on its own.',
                none: 'No PASA. Acceptable when the aircraft-level architecture is simple or carried over; the system PSSAs and the ASA then carry the multi-system checks, and the reason must be recorded.' } },
        'sspp.combined': { q: 'Some aircraft failure conditions only happen when several systems fail together. These methods work out how. Pick all that the program will use; MAC and CoFFE both need the interdependence analysis first.',
            o: { interdep: 'Records which systems contribute to each aircraft failure condition. It is the input to MAC and CoFFE: without it there is nothing to combine.',
                mac: 'A model of how the systems combine, from which Safety Lab builds the multi-system fault trees automatically. Consistent and quick to update when the design changes.',
                coffe: 'Combined functional failure effects: engineers work through the combinations case by case. Catches cases a model cannot express, at the cost of more manual effort.' } },
        'sspp.sfha': { q: 'Each system gets its own FHA, built from its functions and the aircraft failure conditions it takes part in. The plan says who writes them.',
            o: { teams: 'Each system team, with its safety engineer. Closest to the design.', safety: 'The safety group writes them all. Most consistent.', supplier: 'The supplier writes its system\'s FHA; the program checks it against the aircraft failure conditions.', mixed: 'Set system by system in the system register.' } },
        'sspp.pssa': { q: 'The PSSA shows each proposed system architecture can meet its targets, and sets the requirements and DALs for its items. Pick every method the program will use.',
            o: { fta: 'Fault trees: the standard method, showing how failures combine to cause each failure condition, with exact probabilities.', dd: 'Dependence diagrams: an alternative picture of the same logic, sometimes preferred for showing redundancy.', markov: 'Markov models, attached to fault trees where repair, the order of failures or time spent in a degraded state matters. More effort; needed when the simple fault tree math would be wrong.' } },
        'sspp.quant': { q: 'Not every failure condition needs numbers. The plan says which classes must be shown to meet their targets with probabilities.',
            o: { cathaz: 'Catastrophic and hazardous with numbers; major qualitatively unless the design is complex. The usual practice under AC 25.1309-1B.', catmaj: 'Down to major. More work; some authorities expect it for novel designs.', all: 'Every classified failure condition. The most work; rarely needed.' } },
        'sspp.notg': { q: 'NOT logic lets a fault tree say "this happens only if that did not". Aviation trees are usually kept without it (coherent), because it makes the math harder to check.',
            o: { no: 'Coherent trees only: a failure never makes things safer. Simpler to review.', yes: 'NOT logic where it is needed, for example a protection that acts only when another event has not happened. Each use is reviewed.' } },
        'sspp.fmea': { q: 'FMEAs look at how each part or function can fail and what happens next. They feed the fault trees with failure modes and rates.',
            o: { ffmea: 'Functional FMEA: failure modes of functions. Early in the design, before parts are known.', ppfmea: 'Piece-part FMEA: failure modes of each hardware part. Detailed and late, needed for the most critical items.', fmes: 'A failure modes summary that groups failure modes with the same effect, so they enter the fault trees once.', none: 'No FMEA. The fault trees take their failure modes and rates from elsewhere, and the reason is recorded.' } },
        'sspp.ssa': { q: 'The SSA shows the design as actually built meets its targets, using real failure rates and test results.',
            o: { trees: 'Carry the PSSA fault trees forward and update them. One set of trees from start to finish, with the history of every change.', new: 'Build fresh trees from the as-built design. A clean check, but two sets of trees to keep consistent.' } },
        'sspp.asa': { q: 'The aircraft-level fault trees show each aircraft failure condition is met by the systems together.',
            o: { compiled: 'Compiled automatically from the model of how the systems combine.', authored: 'Written by the safety engineers, checked against the model.', both: 'Both, compared. The strongest check: any difference must be explained before the ASA is signed.' } },
        'sspp.dal': { q: 'ARP4754B lets a function\'s or item\'s DAL be lower than its worst failure condition asks, but only where the architecture gives real independence. The plan says whether the program will use this.',
            o: { indep: 'DALs may be lowered where independence allows. Safety Lab takes the lower level at once, marked "CMA pending", and it only counts once the common mode analysis confirms the independence. Saves development effort; needs a CMA.', no: 'Every DAL is what the worst failure condition asks. More development effort, but no independence claims to defend.' } },
        'sspp.idal': { q: 'Each item (software, hardware) gets an IDAL that sets how rigorously it is developed. It can simply follow the function it serves, or be set lower where the architecture gives proven independence between items.',
            o: { fdal: 'Each item takes its function\'s DAL. Simple, conservative.', arch: 'Set from the architecture: independent items in a failure set may take a lower DAL, with the independence recorded and confirmed by the CMA.' } },
        'sspp.items': { q: 'The kinds of items decide which development assurance standards apply beneath this plan.',
            o: { sw: 'Software, developed to DO-178C at its IDAL.', aeh: 'Airborne electronic hardware, developed to DO-254.', simple: 'Simple hardware that can be fully tested, with no IDAL needed.', cots: 'Bought or previously developed items, shown fit by service history or added verification.' } },
        'sspp.indep': { q: 'Every independence claim (between functions, items or systems) must be tracked so it can be checked and defended.',
            o: { ledger: 'A ledger of every claim with its basis and the CMA check. Safety Lab flags a claim the CMA cannot support and raises the DALs that depend on it.', cma: 'Recorded in the CMA worksheets only. Less structure; works for programs with few claims.' } },
        'sspp.cma': { q: 'The common mode analysis checks that things assumed independent really are: no shared design, software, manufacturing, maintenance or installation that could fail them together.',
            o: { yes: 'Performed. Needed whenever the fault trees or the DAL assignment rely on independence.', none: 'Not performed. Only defensible when nothing relies on independence; the reason is recorded, and lowered DALs are then not possible.' } },
        'sspp.pra': { q: 'Particular risks are events outside the systems (rotor burst, fire, bird strike and so on) that could defeat several systems at once. Pick each one the program will analyze.',
            o: { rotor: 'Engine and APU rotor fragments, which can cut through several systems on their path.', tire: 'Tire and wheel failure, throwing debris into the wheel well and wing.', bird: 'Bird strike on the nose, wings, engines and tail.', fire: 'Fire in a zone damaging what is installed there.', hirf: 'Lightning and high-intensity radiated fields upsetting electronics.', fluid: 'Leaks and bursting high-energy lines damaging nearby equipment.', battery: 'Battery thermal runaway, important on electric aircraft.', ice: 'Ice shedding and hail striking structure and engines.', none: 'No particular risk analysis. The reason is recorded.' } },
        'sspp.zsa': { q: 'The zonal safety analysis looks at each zone of the aircraft for installation and maintenance errors and for one system harming another nearby.',
            o: { cad: 'From the CAD model and its zones, so every part\'s real location is used.', list: 'From a zone list and installation drawings, when no CAD model is available.', none: 'Not performed. Only defensible when installation errors and nearby failures cannot affect anything that matters, for example a change with no new installations; the reason is recorded and the authority must accept it.' } },
        'sspp.stpa': { q: 'STPA looks for hazards from the way systems, crew and automation interact, even when no part fails. Useful for highly automated aircraft.',
            o: { yes: 'Used alongside the FHAs.', no: 'Not used.' } },
        'sspp.cea': { q: 'A failure in one system can cascade into others through their interfaces. This decides whether that is traced separately.',
            o: { yes: 'Traced through the interfaces and checked against the failure conditions.', no: 'Covered inside each system\'s fault trees.' } },
        'sspp.levels': { q: 'The development assurance objectives a program must meet depend on the DAL. The plan says whether the highest DAL sets them for all the work or each item meets its own.',
            o: { top: 'The highest DAL sets the objectives for everything. Simple to manage; more effort on lower-level work.', each: 'Each function and item meets its own DAL\'s objectives. Less effort; more tracking.' } },
        'sspp.transition': { q: 'Transition criteria say when work may move from one step to the next. ARP4754B expects them in the plan.',
            o: { gates: 'A signed completion gate in Safety Lab: checklist complete, reviewer signed.', review: 'The exit criteria of the design review.', both: 'Both, the strictest.' } },
        'sspp.indepvv': { q: 'At DAL A and B, validation and verification must be done or checked by someone independent of the work. The plan names who.',
            o: { peer: 'An engineer from another team who did not write the work.', group: 'A separate validation and verification group.', der: 'A designated engineering representative or the customer.' } },
        'sspp.valm': { q: 'Validation shows each safety requirement is correct and complete before it is built to. Pick each method the program will use.',
            o: { trace: 'Trace each requirement to the failure condition it comes from.', analysis: 'Show it by analysis.', similar: 'Show it by similarity to a design already in service.', review: 'An engineering review by someone who did not write it.', test: 'Test or simulation.' } },
        'sspp.pa': { q: 'Process assurance checks the work follows this plan. ARP4754B expects it to be independent of the people doing the work.',
            o: { qa: 'The quality organization, outside the engineering line.', eng: 'An engineer from outside the program.', third: 'An independent company.' } },
        'sspp.show': { q: 'How the program shows the authority that each objective is met.',
            o: { report: 'In the safety assessment reports, objective by objective.', matrix: 'In a compliance matrix in the certification plan.', both: 'Both.' } },
        'sspp.rmtool': { q: 'If requirements live in another tool, the plan names it so the exchange with Safety Lab can be controlled.',
            o: { none: 'Requirements stay in Safety Lab.', jama: 'Jama Connect, with a live connection or ReqIF exchange.', doors: 'IBM DOORS Classic, by ReqIF.', 'doors-next': 'IBM DOORS Next, by ReqIF.', polarion: 'Siemens Polarion, by ReqIF.', codebeamer: 'PTC Codebeamer, by ReqIF.' } },
        'sspp.mbse': { q: 'The functions and architecture the safety work uses can come from a modeling tool, so both work from the same model.',
            o: { syslab: 'From Sys Lab.', cameo: 'From Cameo Systems Modeler, by XMI.', capella: 'From Capella, by XMI.', genesys: 'From GENESYS.', none: 'Written in Safety Lab.' } },
        'sspp.toolq': { q: 'A tool whose output is used without checking may need qualification under DO-330. The plan says how Safety Lab\'s results are trusted.',
            o: { review: 'An engineer reviews each result the safety case relies on, so no qualification is needed.', qualify: 'Safety Lab is qualified to DO-330 for the analyses that take credit unchecked.' } },
        'sspp.ai': { q: 'How AI-drafted content is handled has to be stated, so reviewers know what was drafted and who accepted it.',
            o: { accept: 'Every draft is logged and counts only after an engineer accepts it. Numbers always come from the tool, never the AI.', off: 'Not used.' } },
        'sspp.cm': { q: 'Baselines freeze the safety data at known points, so later changes can be compared and reviewed.',
            o: { reviews: 'At each design review.', gates: 'At each signed gate.', cert: 'At each certification submission.' } },
        'sspp.ccat': { q: 'ARP4754B sets two control categories for data: category 1 (full change control and problem reporting) and category 2 (identified and retrievable).',
            o: { dal: 'Category 1 for DAL A and B data, 2 below. The usual practice.', sc1: 'Category 1 for all. Simpler, more control effort.' } },
        'sspp.soi': { q: 'How the authority is kept informed decides when they see the work.',
            o: { soi: 'Stages of involvement: planning, development, verification and final.', submit: 'At each submission only.' } },
        'sspp.keep': { q: 'Safety records must be kept and retrievable for as long as the authority may ask for them.',
            o: { life: 'For the life of the type certificate and the aircraft in service.', company: 'To the company\'s records policy, at least as long as required.' } }
    });

    Object.assign(EX, {
        'sspp.sfha': { q: 'Each system gets its own FHA, built from its system functions and the aircraft failure conditions it takes part in. Who writes them decides how close the FHA is to the design and how consistent the FHAs are across systems.',
            o: { teams: 'Each system team writes its own, with the safety engineer in the team. The FHA is written by the people who know the system best; the aircraft safety group reviews for consistency.', safety: 'The safety group writes every system FHA. One consistent style and depth across all systems, but the group has to get the system knowledge from the teams.', supplier: 'The supplier writes the FHA for what it supplies, and the program checks that it covers every aircraft failure condition the system takes part in. Usual when the supplier owns the system design.', mixed: 'Set system by system in the system register, for programs where some systems are in-house and some supplied.' } },
        'sspp.items': { q: 'The kinds of items the program develops decide which development assurance standards apply beneath this plan, and which item plans must be written under it. Pick all that apply.',
            o: { sw: 'Software, developed to DO-178C at the IDAL the safety assessment assigns. Each software item needs its own plan for software aspects of certification.', aeh: 'Airborne electronic hardware (programmable devices, complex boards), developed to DO-254 at its IDAL, with its own hardware plan.', simple: 'Simple hardware that can be fully tested and analyzed, so no IDAL is needed; its correctness is shown by test and analysis alone.', cots: 'Bought or previously developed items. Their fitness is shown by service history (hours, failures, the configuration that flew) or by the verification they are missing.' } },
        'sspp.stpa': { q: 'STPA (system-theoretic process analysis) looks for hazards that come from how the systems, the crew and the automation interact, even when nothing fails: a command given at the wrong time, or a feedback the crew misreads. It complements the FHAs on highly automated aircraft.',
            o: { yes: 'STPA will be used alongside the FHAs. Its unsafe control actions become additional failure conditions or requirements, traced like the rest.', no: 'Not used. Interaction hazards are left to the FHAs and the human factors work, which is usual for conventional designs.' } },
        'sspp.cea': { q: 'A failure in one system can spread into the systems that depend on it, through power, data or hydraulic interfaces. This decides whether those cascades are traced as their own analysis.',
            o: { yes: 'Cascades are traced through the interfaces and each is checked against the failure conditions. Catches dependencies the individual system trees can hide.', no: 'Each system\'s fault trees include its dependencies on other systems, so no separate tracing is done. Fine for simpler architectures.' } },
        'sspp.transition': { q: 'Transition criteria say when work may move from one step to the next (for example from PSSA to detailed design). ARP4754B expects the plan to state them so nothing moves on half done.',
            o: { gates: 'A step is complete when its completion gate in Safety Lab is signed: every checklist item done or tailored out with a signed reason, and a reviewer has signed. Objective and recorded in the tool.', review: 'A step is complete when the design review\'s exit criteria are met. Ties safety progress to the program\'s review rhythm.', both: 'Both the gate and the review exit criteria. The strictest choice, usual on DAL A programs.' } },
        'sspp.indepvv': { q: 'At DAL A and B, ARP4754B asks that validation and verification are done or checked by someone independent of the person who did the work. The plan names who that will be.',
            o: { peer: 'An engineer from another team who did not write the work. The usual choice: independent enough, and quick to arrange.', group: 'A separate validation and verification group outside the design teams. The most independent; needs the people.', der: 'A designated engineering representative or the customer does or witnesses the checks. Brings authority-level scrutiny in early.' } },
        'sspp.valm': { q: 'Validation shows each safety requirement is correct and complete before anyone builds to it. ARP4754B asks for more methods at higher DALs. Pick every method the program will use.',
            o: { trace: 'Trace each requirement back to the failure condition, fault tree or finding it came from. The minimum for every requirement.', analysis: 'Show the requirement is right by analysis, for example that a stated limit really keeps the failure condition within its target.', similar: 'Show it is right by similarity to a requirement on a design already in service.', review: 'An engineering review by someone who did not write the requirement.', test: 'Test or simulation, for requirements whose correctness can only be seen by running the system.' } },
        'sspp.pa': { q: 'Process assurance checks that the work actually follows this plan. ARP4754B expects it to be independent of the people doing the work, and its findings to be closed with evidence.',
            o: { qa: 'The quality organization, which sits outside the engineering line. The most common choice and the easiest independence to show.', eng: 'An engineer from outside the program. Knows the work well; independence must be shown by keeping them off the program\'s tasks.', third: 'An independent company. Most independent, and useful for small organizations without a quality function.' } },
        'sspp.show': { q: 'The authority must be shown that each development assurance objective is met. This decides where that evidence is presented.',
            o: { report: 'In the safety assessment reports, objective by objective, with the evidence behind each.', matrix: 'In a compliance matrix in the certification plan, pointing to the evidence.', both: 'Both: the reports carry the evidence and the matrix summarizes it for the authority\'s review.' } },
        'sspp.rmtool': { q: 'If the program\'s requirements live in another tool, the plan names it so the exchange with Safety Lab can be controlled at each baseline.',
            o: { none: 'All requirements stay in Safety Lab: one place, no exchange to control.', jama: 'Jama Connect, with a live two-way connection or ReqIF exchange.', doors: 'IBM DOORS Classic, exchanged by ReqIF.', 'doors-next': 'IBM DOORS Next, exchanged by ReqIF.', polarion: 'Siemens Polarion, exchanged by ReqIF.', codebeamer: 'PTC Codebeamer, exchanged by ReqIF.' } },
        'sspp.mbse': { q: 'The functions and architecture the safety assessment works from can come from a modeling tool, so the safety work and the design use the same model and changes flow through.',
            o: { syslab: 'From Sys Lab, Safety Lab\'s companion systems tool: functions and architecture come across directly.', cameo: 'From Cameo Systems Modeler, brought in by XMI.', capella: 'From Capella, brought in by XMI.', genesys: 'From GENESYS.', none: 'The functions and systems are written in Safety Lab itself.' } },
        'sspp.cm': { q: 'Baselines freeze the safety data at known points, so every later change can be compared with what was reviewed and approved.',
            o: { reviews: 'A signed snapshot at each design review: what the review saw is exactly what is kept.', gates: 'A snapshot each time a completion gate is signed: finer grained, more snapshots.', cert: 'A snapshot at each certification submission only: fewer snapshots, less history between them.' } },
        'sspp.ccat': { q: 'ARP4754B sets two control categories for development data: category 1 (full change control, problem reporting and baselines) and category 2 (identified, protected and retrievable).',
            o: { dal: 'Category 1 for the data of DAL A and B functions, category 2 below. The usual practice, putting the effort where the risk is.', sc1: 'Category 1 for everything. Simpler to explain, more control effort on low-risk data.' } },
        'sspp.soi': { q: 'How the authority is kept informed decides when they see the safety work, and so when their comments arrive.',
            o: { soi: 'Stages of involvement at planning, development, verification and final submission. Comments arrive while they are still cheap to act on.', submit: 'At each submission only. Fewer meetings, but comments arrive late.' } },
        'sspp.keep': { q: 'Safety records must stay retrievable for as long as the authority or an investigation may ask for them.',
            o: { life: 'For the life of the type certificate and of every aircraft in service. The safe choice for a type certificate holder.', company: 'To the company\'s records policy, and at least as long as the authority requires.' } },
        'sspp.ai': { q: 'The plan states how content drafted by the AI Assistant is handled, so reviewers know what was drafted, by what, and who accepted it.',
            o: { accept: 'Every AI draft is logged with what produced it and counts only after an engineer reads and accepts it. Numbers always come from Safety Lab\'s calculations, never from the AI.', off: 'The AI Assistant will not be used on this program; everything is written by engineers.' } },
        'sspp.toolq': { q: 'Under DO-330, a tool whose output is used without being checked may need qualification. The plan says how Safety Lab\'s results will be trusted.',
            o: { review: 'An engineer reviews every result the safety case relies on (a probability, a cut set, a DAL), so the tool needs no qualification. The usual choice.', qualify: 'Safety Lab is qualified to DO-330 for the analyses that take credit without an independent check. More upfront work, less checking later.' } },
        // ---- Human Factors Plan ----
        'hfp.need': { q: 'How much human factors work is needed depends on how much of the flight deck is new. 25.1302 applies to every control, display and procedure the crew uses that is new or changed.',
            o: { full: 'A new flight deck: every function\'s crew part, workload in every phase, crew errors, alerts and the minimum crew are assessed.', changed: 'Only the changed parts of the flight deck are assessed, plus everything they affect. The unchanged parts are listed as carried over, with the reason.', none: 'Nothing the crew uses changes, so no human factors program is run. The reason goes into the SSPP\'s tailoring section.' } },
        'hfp.basis': { q: 'The flight deck rules the design must meet depend on the aircraft type and the authorities. Pick all that apply.',
            o: { 25: '14 CFR 25.1302 (the crew can use the systems safely) and 25.1523 with Appendix D (the minimum crew).', cs25: 'The EASA equivalents, CS 25.1302 and CS 25.1523.', 23: '14 CFR 23.2600 and 23.2605 for normal category airplanes.', 29: 'The rotorcraft rules, 27.1302 or 29.1302.', vtol: 'The SC-VTOL flight deck requirements.' } },
        'hfp.crew': { q: 'The crew the design assumes drives every later human factors analysis: who carries which task, how busy each pilot is, and what the minimum crew must be shown to be.',
            o: { two: 'Two pilots, pilot flying and pilot monitoring: tasks can be shared and cross-checked.', one: 'One pilot: every task falls on one person, so workload limits are tighter.', remote: 'One pilot supported from the ground. The ground station\'s part is analyzed like a crew member\'s.', none: 'No pilot on board: the remote pilot station is treated as the flight deck.' } },
        'hfp.alloc': { q: 'Deciding what the crew does and what the automation does is the first human factors decision; every later analysis builds on it.',
            o: { phase: 'Decided per function and per flight phase, so a function can be the crew\'s in landing and automatic in cruise. The most accurate input to workload and error analysis.', function: 'Decided once per function for all phases. Simpler, but hides phases where the crew\'s part changes.' } },
        'hfp.workload': { q: 'Workload must be shown acceptable in every flight phase, including with the worst failure of that phase. Pick every measure the program will use.',
            o: { share: 'Analysis: each pilot\'s task times as a share of the time available in each phase, with the worst failure on top, against an 80% limit. Can be done before any simulator exists.', bedford: 'Pilots rate their workload on the Bedford scale in the simulator.', tlx: 'Pilots rate workload with NASA-TLX in the simulator: six dimensions, more detail than Bedford.', swat: 'Secondary task or physiological measures in the simulator: objective, but harder to set up.' } },
        'hfp.error': { q: 'Crew errors must be found and shown to be noticed and put right, or designed out.',
            o: { qual: 'Each crew task and failure response gets its credible errors, how each is noticed, and how it is put right. An error nobody notices or can fix stays open until the design changes.', quant: 'The same, plus an error probability for each, which goes into the fault trees. Needed where a failure condition\'s classification depends on the crew.' } },
        'hfp.alerts': { q: 'Crew alerts must tell the crew about the failure conditions they need to act on, at the right urgency.',
            o: { 1322: 'Warning, caution and advisory levels as 25.1322 defines them.', philo: 'The company\'s own alerting philosophy, shown equivalent to 25.1322.' } },
        'hfp.eval': { q: 'Human factors claims must be shown, not just asserted. Pick every means the program will use.',
            o: { analysis: 'Analysis of tasks, times and errors.', mock: 'Mock-ups early in the design, to check layout and reach before anything is built.', sim: 'A simulator campaign with scenarios for each phase and crew-relevant failure: the main evidence for most claims.', flight: 'Flight test, for claims that only the real aircraft can show.' } },
        'hfp.pilots': { q: 'Who flies the evaluations decides how independent the evidence is. Pilots who designed the flight deck know its quirks too well.',
            o: { line: 'Line pilots from operators, not involved in the design. The most representative and independent.', test: 'The company\'s test pilots. Experienced, but close to the design.', both: 'Both: test pilots for depth, line pilots for independence.', authority: 'Both, plus the authority\'s pilots, so the authority sees the flight deck first hand.' } },
        'hfp.mfc': { q: 'The minimum flight crew must be shown under 25.1523 and Appendix D: enough crew to fly safely, with acceptable workload, in every phase and with the failures they must handle.',
            o: { appd: 'Work through the Appendix D workload functions and factors for each phase, then confirm in the simulator.', similar: 'Compare with a certified aircraft with the same crew and analyze each workload difference.' } },
        'hfp.credit': { q: 'When a failure condition\'s classification depends on the crew doing something, that action becomes a claim the program must prove.',
            o: { asm: 'Each such action becomes a human factors assumption, linked to its crew task, and counts only once validated in the evaluations.', note: 'Noted on the failure condition only. Less tracking; the evidence is harder to find later.' } },
        'hfp.feed': { q: 'Crew errors that matter to a failure condition must reach the safety assessment.',
            o: { events: 'As basic events in the fault trees, so their contribution is counted.', fha: 'Through the crew effects recorded in the FHAs only.' } },
        // ---- Reliability and Maintainability Plan ----
        'ramp.need': { q: 'The reliability work ranges from the failure rates the safety assessment needs to a full reliability program. This sets everything else in the plan.',
            o: { safety: 'Only the failure rates the fault trees need. The least work.', full: 'Prediction, allocation of targets to systems, growth through test and failure reporting: needed for dispatch reliability or customer commitments.', contract: 'What the customer contract asks, often tailored from MIL-HDBK-338B.' } },
        'ramp.rates': { q: 'Failure rates drive every probability in the fault trees, so their source must be stated and defensible. Pick every source the program will use, best first.',
            o: { supplier: 'Supplier data backed by service history: the most realistic for proven parts.', field: 'The program\'s own field data from earlier aircraft.', nprd: 'Field data handbooks (NPRD, EPRD): broad coverage of real-world rates.', 217: 'MIL-HDBK-217F parts count and stress predictions: widely accepted, often pessimistic.', fides: 'FIDES: a modern European prediction method that accounts for the mission profile.', '217plus': '217Plus: an updated successor to 217F.' } },
        'ramp.env': { q: 'Failure rates depend on where a part is installed. The environment assumed must match.',
            o: { ai: 'Airborne, inhabited: the conditions in the cabin and flight deck. Mild, so rates are lower; only right for parts installed there.', au: 'Airborne, uninhabited: unpressurized bays with harsher temperature and vibration. Higher, more cautious rates.', mix: 'Item by item, from where each is actually installed. The most accurate, and needs each item\'s location.' } },
        'ramp.alloc': { q: 'Reliability targets for each system let the program check each design against its share of the aircraft\'s target.',
            o: { yes: 'The aircraft reliability target (for example dispatch reliability) is shared out to the systems, and each system\'s prediction is checked against its share. Shows early which system will miss.', no: 'No system targets. Only the safety targets apply, which is enough when reliability is not a contract commitment.' } },
        'ramp.growth': { q: 'Reliability usually improves through test as faults are found and fixed. Tracking it shows whether the program is on course.',
            o: { crow: 'The Crow-AMSAA model, tracked against a planned growth curve. The usual method: it shows whether test is finding and fixing faults fast enough to reach the target by entry into service.', duane: 'The Duane model: simpler and older, plotting failure rate against cumulative test time on log scales.', no: 'Not tracked. Reliability is judged from the predictions and service data instead.' } },
        'ramp.fracas': { q: 'Failures in test and service must be reported, their cause found and a fix made. A failure the fault trees did not expect must go back to the safety assessment.',
            o: { sl: 'In Safety Lab\'s failure reporting system, linked directly to the fault trees.', other: 'In the company\'s own system, with unexpected failures passed back to the safety assessment.' } },
        'ramp.life': { q: 'Life data from test and service shows whether parts fail at the steady rate the fault trees assume, or wear out with age, which would make the trees optimistic.',
            o: { yes: 'Weibull analysis of test and service data. A wear-out pattern the fault trees did not assume (they usually assume a constant failure rate) goes back to the safety assessment.', no: 'Not analyzed separately. The fault trees keep their constant failure rate assumption, checked through failure reporting.' } },
        'ramp.mx': { q: 'Maintainability decides how fast and surely failures are found and fixed. Pick every analysis the program will do.',
            o: { mttr: 'Repair time and downtime for each replaceable unit.', test: 'Testability: how well each failure is detected and isolated, which also matters for latent failures.', lora: 'Level of repair: whether each unit is fixed on the aircraft, in the shop or replaced.', none: 'No maintainability analysis. The reason is recorded.' } },
        'ramp.msg3': { q: 'Scheduled maintenance must include the certification maintenance requirements from the safety assessment, kept apart from ordinary tasks.',
            o: { msg3: 'MSG-3, the industry method used by maintenance review boards: systems, structures, zonal and lightning tasks, with the CMRs from the safety assessment kept apart and never escalated without the safety group.', own0: 'The manufacturer\'s own method, which must still keep the CMRs apart and controlled by the safety group.', none: 'Scheduled maintenance is outside this program, for example a supplier program where the aircraft maker owns it.' } },
        'ramp.lcc': { q: 'Life-cycle cost estimates what the aircraft will cost to own and run, from the reliability and maintainability results.', o: { yes: 'Estimated from the reliability and maintainability results: spares, repairs, scheduled maintenance and downtime over the aircraft\'s life. Useful when the customer buys on cost of ownership.', no: 'Not estimated. Usual when cost of ownership is handled outside the engineering program.' } },
        'ramp.sw': { q: 'Software reliability can be estimated from test failures as a measure of maturity. It never replaces the software DAL.', o: { yes: 'Estimated from the failures found in software test, as a measure of how mature the software is. It is reported alongside, never instead of, the development assurance level.', no: 'Not estimated. The software\'s development assurance level is the only measure, which is the normal practice under DO-178C.' } },
        'ramp.sneak': { q: 'A sneak circuit analysis looks for unintended electrical paths that could make something operate when nobody asked.', o: { yes: 'Performed on the electrical design: every path, including through switches and grounds, is checked for one that could power a function when nobody asked. Worth it for electrical systems that control critical functions.', no: 'Not performed. Usual where the wiring is simple or already proven in service.' } },
        'ramp.eta': { q: 'Event trees show how one initiating failure leads to different outcomes depending on which protections work.', o: { yes: 'Used where one initiating failure has several possible outcomes depending on which protections work, and the order matters (for example a fire with detection and then extinguishing).', no: 'Not used. The fault trees cover the protections without modeling the sequence.' } }
    });
    var OWN_EX = 'Write how the program will do it, in your own words. Use this when none of the answers fits; what you write goes into the plan exactly as written.';
    function exQ(q) { return (EX[q.k] || {}).q || ''; }
    function exO(q, id) { if (id === 'own') return OWN_EX; var e = (EX[q.k] || {}).o || {}; return e[id] || ''; }

    // ---- answering ----------------------------------------------------------------------------------------------
    function answer(k, v) {
        var q = QBY[k]; if (!q) throw fail('No such question: ' + k);
        var s = store(); forget();
        if (v === '' || v == null || (Array.isArray(v) && !v.length)) { delete s.answers[k]; delete s.who[k]; save(); return ''; }
        var vs = Array.isArray(v) ? v.map(String) : String(v).split('|');
        if (q.type !== 'checks' && vs.length > 1) throw fail('Pick one answer for: ' + q.text);
        if (vs.length > 1 && vs.some(function (x) { return (q.excl || []).indexOf(x) >= 0; })) throw fail('"' + optLabel(q, vs.filter(function (x) { return q.excl.indexOf(x) >= 0; })[0]) + '" cannot be picked with other answers to: ' + q.text);
        vs.forEach(function (x) { if (!q.opts.some(function (o) { return o[0] === x; })) throw fail('"' + x + '" is not one of the answers to: ' + q.text); });
        var val = q.opts.map(function (o) { return o[0]; }).filter(function (o) { return vs.indexOf(o) >= 0; }).join('|');   // in the options' order
        s.answers[k] = val; s.who[k] = { by: who(), at: now() };
        save(); return val;
    }
    // picking an exclusive answer clears the others; picking any other clears the exclusive one
    function toggle(k, opt) { var q = QBY[k], ex = (q && q.excl) || [], cur = picked(k), i = cur.indexOf(opt); if (i >= 0) cur.splice(i, 1); else if (ex.indexOf(opt) >= 0) cur = [opt]; else { cur = cur.filter(function (x) { return ex.indexOf(x) < 0; }); cur.push(opt); } return answer(k, cur); }
    function setOwn(k, text) { var s = store(); forget(); text = String(text || '').trim(); if (text) s.own[k] = text; else delete s.own[k]; save(); }
    function setWhy(k, text) { var s = store(); forget(); text = String(text || '').trim(); if (text) s.why[k] = text; else delete s.why[k]; save(); }
    function needsOwn(q) { return has(q.k, 'own') && !store().own[q.k]; }
    function needsWhy(q) { return picked(q.k).some(function (x) { return (q.reasonFor || []).indexOf(x) >= 0; }) && !store().why[q.k]; }
    function complete(q) { return !!A(q.k) && !needsOwn(q) && !needsWhy(q); }
    // a pick that does not work with the rest of the plan
    function mismatches(key) {
        return questions(key).map(function (q) { var v = A(q.k); var m = v && q.need ? safe(function () { return q.need(v); }, '') : ''; return m ? { k: q.k, q: q.text, msg: m } : null; }).filter(Boolean);
    }

    // ---- what the plan sets, as it is and as it will be -----------------------------------------------------------
    function wires(key) {
        var out = [];
        questions(key).forEach(function (q) {
            (q.set || []).forEach(function (st, i) {
                var v = A(q.k), after = v ? safe(function () { return st.after(v); }, null) : null, nowV = safe(function () { return st.now(); }, '');
                out.push({ k: q.k, i: i, what: safe(function () { return st.what(); }, ''), now: nowV, after: after == null ? (v ? nowV : 'Not answered') : after, same: !v || after == null || after === nowV, answered: !!v });
            });
        });
        // the certification basis also moves the targets, the DALs and the lanes it expects: shown before it applies
        if (key === 'sspp' && A('basis.reg')) {
            var a = targetsFor(pc() || {}), b = targetsFor(plannedCfg());
            a.forEach(function (t, i) { var u = b[i]; if (!u) return; var n0 = probWords(t.prob) + ', DAL ' + (t.dal || '-'), n1 = probWords(u.prob) + ', DAL ' + (u.dal || '-'); if (n0 !== n1) out.push({ k: 'basis.reg', what: t.sev + ': target and DAL (follows the basis)', now: n0, after: n1, same: true, info: true }); });
            var e0 = expectedFor((pc() || {}).regulation || 'Part 25'), e1 = expectedFor(plannedCfg().regulation);
            e1.filter(function (x) { return e0.indexOf(x) < 0; }).forEach(function (x) { out.push({ k: 'basis.reg', what: laneName(x) + ': expected by the basis', now: 'Not expected', after: 'Expected', same: true, info: true }); });
            e0.filter(function (x) { return e1.indexOf(x) < 0; }).forEach(function (x) { out.push({ k: 'basis.reg', what: laneName(x) + ': expected by the basis', now: 'Expected', after: 'Not expected', same: true, info: true }); });
        }
        return out;
    }
    function apply(key) {
        var plan = BY[key], by = who(), done = [], errs = [];
        // the basis first: what follows reads it
        var qs = questions(key).slice().sort(function (x, y) { return (/^basis\./.test(y.k) ? 1 : 0) - (/^basis\./.test(x.k) ? 1 : 0); });
        qs.forEach(function (q) {
            var v = A(q.k); if (!v) return;
            if (!complete(q)) { errs.push(q.text.replace(/\?$/, '') + ': ' + (needsWhy(q) ? 'the reason is not written yet' : 'your own way is not written yet')); return; }
            (q.set || []).forEach(function (st) {
                forget();
                var after = safe(function () { return st.after(v); }, null); if (after == null || after === safe(function () { return st.now(); }, '')) return;
                try { st.apply(v, by, plan, q); done.push(st.what() + ': ' + after); store().applied[q.k] = { at: now(), by: by }; } catch (e) { errs.push(st.what() + ': ' + (e && e.message || e)); }
            });
        });
        forget(); save();
        try { if (PP() && PP().applyNav) PP().applyNav(); } catch (_) {}
        return { done: done, errs: errs };
    }
    // the lane as the plan has it: the answer that sets it, else the project as it is
    function planned(lane) {
        var hit = null;
        PLANS.forEach(function (p) { p.qs.forEach(function (q) { if (!shown(q) || !A(q.k)) return; (q.set || []).forEach(function (st) { if (st.lane === lane) { var a = safe(function () { return st.after(A(q.k)); }, null); if (a) hit = a === 'In'; } }); }); });
        return hit == null ? laneOn(lane) : hit;
    }

    // ---- status of the plan itself (on the cards: answered or not; never the project's results) -------------------
    function status(key) {
        var qs = questions(key), n = qs.filter(complete).length, w = wires(key).filter(function (x) { return !x.same; }).length, mm = mismatches(key).length;
        if (!qs.filter(function (q) { return A(q.k); }).length) return { state: 'not started', label: 'Not started', n: qs.length, miss: qs.length, apply: w, mm: mm };
        if (n < qs.length) return { state: 'open', label: (qs.length - n) + ' to answer', n: qs.length, miss: qs.length - n, apply: w, mm: mm };
        if (mm) return { state: 'open', label: mm + ' pick' + (mm > 1 ? 's' : '') + ' to fix', n: qs.length, miss: 0, apply: w, mm: mm };
        if (w) return { state: 'apply', label: w + ' setting' + (w > 1 ? 's' : '') + ' to apply', n: qs.length, miss: 0, apply: w, mm: mm };
        return { state: 'ready', label: 'Ready to issue', n: qs.length, miss: 0, apply: 0, mm: 0 };
    }
    function gaps(key) { return questions(key).filter(function (q) { return !complete(q); }).map(function (q) { return q.text.replace(/\?$/, '') + (A(q.k) ? (needsWhy(q) ? ' (the reason is not written)' : ' (your own way is not written)') : ''); }); }
    // the objectives each plan answers: how the program will meet each (the plan); where each stands is the status report
    function daCover(key) {
        var qs = key ? questions(key) : PLANS.reduce(function (a, p) { return a.concat(questions(p.key)); }, []);
        return objectives().map(function (o) {
            var by = qs.filter(function (q) { return q.da.indexOf(o.id) >= 0; }), ans = by.filter(function (q) { return A(q.k); });
            return { id: o.id, grp: o.grp, text: o.text, state: o.state, detail: o.detail, qs: by, answered: ans, how: ans.map(function (q) { return optLabel(q, A(q.k)); }), tools: by.reduce(function (a, q) { q.tools.forEach(function (t) { if (a.indexOf(t) < 0) a.push(t); }); return a; }, []) };
        }).filter(function (r) { return !key || r.qs.length; });
    }

    // ---- the processes the plan defines: how, inputs and when, outputs, checks ------------------------------------
    function when(step) {
        var r = A('sspp.reviews');
        var W = {
            afha: { srr_pdr_cdr: 'From concept; presented at the system requirements review', pdr_cdr: 'From concept; complete before the system requirements are baselined', every: 'From concept; reported at every program review', gates: 'From concept; closed at its completion gate' },
            pasa: { srr_pdr_cdr: 'After the AFHA; before the system requirements review', pdr_cdr: 'After the AFHA; before the system requirements are baselined', every: 'After the AFHA; reported at every program review', gates: 'After the AFHA; closed at its completion gate' },
            sfha: { srr_pdr_cdr: 'Once functions are given to systems; presented at the system requirements review', pdr_cdr: 'Once functions are given to systems; before the preliminary design review', every: 'Once functions are given to systems; reported at every program review', gates: 'Once functions are given to systems; closed at its completion gate' },
            pssa: { srr_pdr_cdr: 'With the system architecture; presented at the preliminary design review', pdr_cdr: 'With the system architecture; presented at the preliminary design review', every: 'With the system architecture; reported at every program review', gates: 'With the system architecture; closed at its completion gate' },
            ssa: { srr_pdr_cdr: 'As the design is built and verified; presented at the critical design review', pdr_cdr: 'As the design is built and verified; presented at the critical design review', every: 'As the design is built and verified; reported at every program review', gates: 'As the design is built and verified; closed at its completion gate' },
            asa: { any: 'Once every system safety assessment is signed; before the certification submission' },
            cca: { any: 'Alongside the PSSAs, and again at the SSAs with the installed design' }
        };
        var w = W[step] || {}; return w[r] || w.any || (r ? '' : 'When: to be decided (when the safety work is presented)') || '';
    }
    function signWords() { var v = A('sspp.signoff'); return { indep: 'Signed by its author and a reviewer who did not write it', lead: 'Signed by the safety lead', board: 'Signed by the safety review board', indep_board: 'Signed by its author and an independent reviewer; Catastrophic and Hazardous then by the board', own: 'Signed as the program\'s own way sets out' }[v] || 'Who signs: to be decided'; }
    function gateWords() { var v = A('sspp.transition'); return { gates: '; its completion gate checklist complete', review: '; the design review exit criteria met', both: '; its completion gate signed and the review exit criteria met' }[v] || ''; }
    function procRows(key) {
        var R = [], sg = signWords() + gateWords();
        var row = function (name, how, inputs, w, outputs, checks) { R.push({ Process: name, 'How it will be done': how || 'To be decided', 'Inputs, and when they are needed': inputs + (w ? '. ' + w : ''), Outputs: outputs, 'Checks before it is complete': checks }); };
        var ans = function (k) { var q = QBY[k]; return A(k) ? (has(k, 'own') && store().own[k] ? store().own[k] : optLabel(q, A(k))) : ''; };
        if (key === 'sspp') {
            row('Aircraft functional hazard assessment', ans('sspp.afha'), 'The aircraft functions, the flight phases and the certification basis', when('afha'), 'Aircraft failure conditions, each with its classification, effects and safety objective', sg);
            if (A('sspp.pasa') !== 'none') row('Preliminary aircraft safety assessment', A('sspp.pasa') === 'yes' ? 'On the aircraft architecture' + (A('sspp.combined') ? ', with ' + lcFirst(listJoin(picked('sspp.combined').map(function (x) { return { interdep: 'the interdependence analysis', mac: 'MAC', coffe: 'CoFFE', own: 'the program\'s own method' }[x]; }))) : '') : ans('sspp.pasa'), 'The aircraft failure conditions and the proposed aircraft architecture', when('pasa'), 'Aircraft safety requirements, FDALs, the independence needed, and the failure conditions given to each system', sg);
            row('System functional hazard assessments', ans('sspp.sfha'), 'The system functions and the aircraft failure conditions each system takes part in', when('sfha'), 'System failure conditions, each with its classification and safety objective', sg);
            row('Preliminary system safety assessments', ans('sspp.pssa'), 'The system failure conditions, the proposed system architecture and the failure rates', when('pssa'), 'System and item safety requirements, IDALs and the independence each architecture needs', sg);
            row('Development assurance level assignment', ans('sspp.dal') + (A('sspp.idal') ? '; ' + lcFirst(ans('sspp.idal')) : ''), 'The failure conditions and their classifications, and the architecture', when('pssa'), 'An FDAL for each function and an IDAL for each item, with the reason for any level lowered', A('sspp.dal') === 'indep' ? 'A lowered level counts only once the common mode analysis confirms the independence; ' + lcFirst(sg) : sg);
            if (planned('cma') || planned('pra') || planned('zsa')) row('Common cause analyses', listJoin([planned('cma') ? 'common mode analysis' : '', planned('pra') ? 'particular risk analysis' : '', planned('zsa') ? 'zonal safety analysis' : ''].filter(Boolean)).replace(/^./, function (c) { return c.toUpperCase(); }), 'The independence the fault trees and DALs count on, the installation, and the zones', when('cca'), 'Findings, each closed by a design change, a requirement or a justification', sg);
            row('System safety assessments', ans('sspp.ssa'), 'The as-built design, the as-built failure rates and the verification results', when('ssa'), 'Each system failure condition shown to meet its target, and the safety requirements verified', sg);
            if (A('sspp.kind') !== 'supplier') row('Aircraft safety assessment', ans('sspp.asa'), 'Every signed system safety assessment and the aircraft-level fault trees', when('asa'), 'Each aircraft failure condition shown to meet its target; the case for certification', sg);
            row('Validation of the safety requirements', ans('sspp.valm'), 'The safety requirements and the assumptions behind them', 'As each requirement is written, before it is baselined', 'Each requirement shown correct and complete, with its method recorded', A('sspp.indepvv') ? 'At DAL A and B, done by ' + lcFirst(ans('sspp.indepvv')) : 'Independence: to be decided');
            row('Verification of the safety requirements', ans('sspp.test'), 'The safety requirements and the tests: ' + (A('sspp.testkind') ? lcFirst(ans('sspp.testkind')) : 'to be decided'), 'As the design is verified', 'Each safety requirement shown met, with the result linked', A('sspp.indepvv') ? 'At DAL A and B, done by ' + lcFirst(ans('sspp.indepvv')) : 'Independence: to be decided');
            row('Process assurance', ans('sspp.pa'), 'This plan and the work done to it', 'Through the program, before each review', 'Audit findings, each closed with evidence', 'Findings closed before the review they come before');
            row('Configuration management', ans('sspp.cm'), 'The safety data and every change to it', 'Through the program', 'Baselines, change records and the archive', ans('sspp.ccat') || 'Control category: to be decided');
            row('Certification liaison', ans('sspp.soi'), 'This plan, the certification plan and the safety results', 'From the start of the program', 'The authority\'s agreement to the plan and its findings at each stage', ans('sspp.show') || 'How objectives are shown: to be decided');
        } else if (key === 'hfp') {
            if (A('hfp.need') === 'none') return R;
            row('Who does what', ans('hfp.alloc'), 'The aircraft functions and the flight phases', 'At concept', 'Each function given to the crew, the automation or both, phase by phase', 'Reviewed with the pilots who will evaluate it');
            row('Crew tasks and procedures', 'From the allocation, one task per phase the crew has a part in, and a procedure for each failure the crew responds to', 'The allocation and the failure conditions with a crew effect', 'During preliminary design', 'The crew task list and the failure procedures', 'Each failure the crew responds to has its procedure');
            row('Workload', ans('hfp.workload'), 'The crew tasks, their times, and each phase\'s time available', 'During preliminary design; confirmed in the evaluations', 'Each pilot\'s workload in every phase, with the worst failure on top', 'No pilot over the limit in any phase');
            row('Crew error', ans('hfp.error'), 'The crew tasks and procedures', 'During preliminary design', 'The credible errors, how each is noticed and put right', 'No error left that nobody notices and nobody can put right');
            row('Alerts', ans('hfp.alerts'), 'The failure conditions the crew must know about', 'During preliminary and detailed design', 'An alert for each, at its level, by sight, sound or touch', 'Each alert linked to its failure condition');
            row('Evaluations', ans('hfp.eval'), 'The flight deck design and the scenarios for each phase and failure', 'From mock-ups to the simulator and flight test', 'The findings, each closed by a design change or a justification', A('hfp.pilots') ? ans('hfp.pilots') : 'Who evaluates: to be decided');
            if (A('hfp.crew') !== 'none') row('Minimum flight crew', ans('hfp.mfc'), 'The workload results and the Appendix D functions and factors', 'Before certification', 'The minimum crew, with its reasons', 'Confirmed in the evaluations');
            row('Crew credit', ans('hfp.credit'), 'The crew actions the safety analysis counts on', 'As the failure conditions are classified', 'Human factors assumptions, linked to their tasks', 'Each validated before it counts');
        } else {
            row('Reliability prediction', ans('ramp.rates'), 'The parts and their installed environment: ' + (A('ramp.env') ? lcFirst(ans('ramp.env')) : 'to be decided'), 'As the design matures; before the PSSAs need the rates', 'A failure rate for each item, with its source', 'Each rate in a fault tree names its source');
            if (ramFull() && A('ramp.alloc') === 'yes') row('Allocation', 'The aircraft target shared out to the systems', 'The aircraft reliability target and the system architecture', 'At preliminary design', 'A target for each system', 'Each prediction checked against its share');
            if (ramFull() && A('ramp.growth') && A('ramp.growth') !== 'no') row('Growth', ans('ramp.growth'), 'Failures in test and the planned growth curve', 'Through test', 'The growth achieved against the plan', 'Shortfalls raised to the program');
            row('Failure reporting', ans('ramp.fracas'), 'Every failure in test and service', 'From the first test', 'The cause and the corrective action for each', 'A failure a fault tree did not expect goes back to the safety assessment');
            if (A('ramp.mx') && A('ramp.mx') !== 'none') row('Maintainability', ans('ramp.mx'), 'The replaceable units and their failure modes', 'During detailed design', 'Repair times, downtime and detection', 'Reviewed with maintenance');
            if (A('ramp.msg3') && A('ramp.msg3') !== 'none') row('Scheduled maintenance', ans('ramp.msg3'), 'The systems, structures and zones, and the CMRs from the safety assessment', 'Before entry into service', 'The scheduled maintenance tasks and intervals', 'CMRs never escalated without the safety group');
        }
        return R;
    }

    // ---- the inputs and outputs of each assessment, and the data exchanged between them ------------------------------
    // (Waqas: "we need to define inputs and outputs required off each of the assessments, example what you want to come
    // out of SPP, AFHA etc", "the diagrams needs to be explained about data exchanges".) Built from the answers: an
    // assessment that is not planned is left out and its outputs are taken from where the plan says instead.
    // An assessment: { id, name, plan, tab, on(), inputs: [[what, from-id]], outputs: [{ id, what, to: [ids], accept, fp() }] }
    function fpOf(x) { var s = ''; try { s = JSON.stringify(x == null ? null : x); } catch (_) { s = String(x); } var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
    function hasPasa() { return A('sspp.pasa') !== 'none'; }
    function isSup() { return A('sspp.kind') === 'supplier'; }
    function hfNow() { return !!A('hfp.need') && A('hfp.need') !== 'none'; }
    function mfsPicks() { return picked('sspp.combined').filter(function (x) { return ['interdep', 'mac', 'coffe'].indexOf(x) >= 0; }); }
    function ccaIds() { return ['zsa', 'pra', 'cma'].filter(function (x) { return planned(x); }); }
    function fmeaOn() { return planned('ffmea') || planned('ppfmea'); }
    function ramPredOn() { return planned('ram-reliability') !== false; }
    function msg3On() { return !!A('ramp.msg3') && A('ramp.msg3') !== 'none'; }
    // 7 Nov 2026 (Waqas: "we need to define inputs and outputs of each assessment in all the plans both in diagrams and
    // prose"): every assessment the three plans run, each with what it does, what it needs and from where, and what it
    // must produce and for whom. Built from the answers; an assessment that is not planned is left out, and whoever
    // would have fed it or used it takes the input from where the plan says instead.
    function assessments() {
        return memo('ass', function () {
            var aft = isSup() ? 'aircraft maker' : 'afha', cca = ccaIds(), hf = hfNow(), mfs = mfsPicks(), rates = ramPredOn() ? 'ram-pred' : 'design';
            var feedEvents = A('hfp.feed') === 'events', mfcOn = hf && A('hfp.crew') !== 'none';
            var L = [];
            var add = function (a) { L.push(a); };
            // ---- the System Safety Program Plan ----
            add({ id: 'spp', name: 'System Safety Program Plan', plan: 'sspp', tab: 'plan-auto', due: 'At the start of the program; revised when a decision changes',
                does: 'It sets how the aircraft will be shown safe: the objectives, the assessments, their methods and the records.',
                inputs: [['The certification basis and any special conditions', 'basis'], ['The program\'s scope, organization and schedule', 'program'], ['The development process (ARP4754B) and its plans', 'program']],
                outputs: [{ id: 'spp.plan', what: 'This plan, approved and issued', to: ['all'], accept: 'Every decision made, signed by the approver, submitted to the authority', fp: function () { return fpOf(store().answers); } },
                          { id: 'spp.obj', what: 'The safety objectives: classifications, probability targets and DALs for the basis', to: [aft === 'afha' ? 'afha' : 'sfha', 'sfha', 'dal'].filter(function (x, i, a) { return a.indexOf(x) === i; }), accept: 'Match the certification basis exactly (taken from Safety Lab\'s engine)', fp: function () { return fpOf(targetsFor(plannedCfg())); } },
                          { id: 'spp.tailor', what: 'The tailoring decisions, each with its reason', to: ['all'], accept: 'Each expected analysis left out has a written reason the authority accepts', fp: function () { return fpOf(store().why); } }]
                    .concat(planned('pra') ? [{ id: 'spp.risks', what: 'The particular risks the program will analyze', to: ['pra'], accept: 'Every particular risk the basis and the installation call for is on the list, or left out with a reason', fp: function () { return fpOf(A('sspp.pra')); } }] : []) });
            if (!isSup()) add({ id: 'afha', name: 'Aircraft FHA', plan: 'sspp', tab: 'ac-fha',
                does: 'It finds how each aircraft function can fail, in each flight phase, and how bad each failure would be.',
                inputs: [['The aircraft functions', 'design'], ['The flight phases', 'design'], ['The safety objectives for the basis', 'spp']],
                outputs: [{ id: 'afha.fc', what: 'Aircraft failure conditions, each with its effects, classification and safety objective', to: [hasPasa() ? 'pasa' : 'pssa', 'sfha', 'dal'].concat(mfs.length ? ['mfs'] : [], hf ? ['hf-tasks', 'hf-alerts', 'hf-credit'] : []), accept: 'Every function, in every flight phase, assessed for loss and malfunction; each classification has its reason; reviewed and signed', fp: function () { return fpOf(arr('acFhaData').map(function (f) { return [f.fcId, f.severity, f.fcDesc]; })); } },
                          { id: 'afha.req', what: 'Aircraft safety requirements: the objective of each failure condition, written as a requirement', to: ['design', hasPasa() ? 'pasa' : 'sfha'], accept: 'Every classified failure condition has its requirement, traced back to it', fp: function () { return fpOf(arr('acReqData').length); } }] });
            if (mfs.length) add({ id: 'mfs', name: 'Multi-system failure conditions', plan: 'sspp', tab: has('sspp.combined', 'mac') ? 'mac' : 'pasa', due: when('pasa'),
                does: 'It handles the aircraft failure conditions that more than one system contributes to, by ' + listJoin(mfs.map(function (x) { return { interdep: 'interdependence analysis', mac: 'MAC', coffe: 'CoFFE' }[x]; })) + '.',
                inputs: [['Aircraft failure conditions that involve more than one system', aft], ['The system architecture and the interfaces between systems', 'design'], ['System failure conditions', 'sfha']],
                outputs: [].concat(has('sspp.combined', 'interdep') ? [{ id: 'mfs.interdep', what: 'The interdependence table: which systems each aircraft failure condition depends on', to: [hasPasa() ? 'pasa' : 'pssa', 'asa'], accept: 'Every multi-system failure condition lists every system that can contribute', fp: function () { return fpOf(safe(function () { return pc().interdep; }, null)); } }] : [])
                    .concat(has('sspp.combined', 'mac') ? [{ id: 'mfs.mac', what: 'The multi-system fault trees built by MAC', to: ['asa'], accept: 'Each multi-system failure condition has its tree; the model and the trees agree', fp: function () { return fpOf(arr('ftaPages').filter(function (p) { return p.generatedFrom === 'mac'; }).length); } }] : [])
                    .concat(has('sspp.combined', 'coffe') ? [{ id: 'mfs.coffe', what: 'The CoFFE cases, each decided and signed', to: ['asa'], accept: 'Every case the model cannot answer is decided by an engineer', fp: function () { return fpOf(safe(function () { return pc().coffe; }, null)); } }] : []) });
            if (!isSup() && hasPasa()) add({ id: 'pasa', name: 'PASA', plan: 'sspp', tab: 'pasa',
                does: 'It checks that the proposed aircraft architecture can meet the aircraft failure condition objectives.',
                inputs: [['Aircraft failure conditions and classifications', aft], ['Aircraft safety requirements', aft], ['The proposed aircraft architecture', 'design']].concat(has('sspp.combined', 'interdep') ? [['Which systems contribute to each failure condition', 'mfs']] : []),
                outputs: [{ id: 'pasa.req', what: 'Aircraft safety requirements and the independence the architecture needs', to: ['sfha', 'pssa'], accept: 'Each aircraft failure condition shown achievable by the architecture; requirements traced to it', fp: function () { return fpOf(arr('acReqData').length); } },
                          { id: 'pasa.fdal', what: 'FDALs for the aircraft functions', to: ['dal', 'pssa'], accept: 'Each FDAL from its worst failure condition, any lowering backed by an independence claim', fp: function () { return fpOf(arr('acFunctionsData').map(function (f) { return f.fdal || f.dal || ''; })); } }] });
            add({ id: 'sfha', name: 'System FHAs', plan: 'sspp', tab: 'sys-dir',
                does: 'It finds how each system function can fail and how bad each failure would be, tied to the aircraft failure conditions.',
                inputs: [['The system functions', 'design'], [isSup() ? 'Aircraft failure conditions from the aircraft maker' : 'The aircraft failure conditions each system takes part in', hasPasa() && !isSup() ? 'pasa' : aft]],
                outputs: [{ id: 'sfha.fc', what: 'System failure conditions, each with its classification and safety objective', to: ['pssa', 'dal'].concat(mfs.length ? ['mfs'] : []), accept: 'Every system function assessed; each traced to the aircraft failure condition it feeds; signed', fp: function () { return fpOf(arr('systemsData').map(function (s) { return (s.fha || []).length; })); } }] });
            add({ id: 'pssa', name: 'PSSAs', plan: 'sspp', tab: 'fta',
                does: 'It shows, with fault trees, that each proposed system architecture can meet its failure condition objectives, and writes the safety requirements that follow.',
                inputs: [['System failure conditions and objectives', 'sfha'], ['The proposed system architecture', 'design'], ['Failure rates', rates]].concat(fmeaOn() ? [['Failure modes from the FMEAs', 'fmea']] : [], hf && feedEvents ? [['Crew actions counted on, and crew errors, as basic events', 'hf-credit']] : []),
                outputs: [{ id: 'pssa.trees', what: 'Fault trees' + (planned('markov') ? ' with Markov models' : '') + ' showing each architecture can meet its targets', to: ['ssa'].concat(cca, planned('ccmr') ? ['ccmr'] : [], planned('ram-mmel') ? ['mmel'] : []), accept: (A('sspp.quant') === 'all' ? 'Every' : A('sspp.quant') === 'catmaj' ? 'Catastrophic, hazardous and major' : 'Catastrophic and hazardous') + ' failure conditions shown with numbers to meet their targets', fp: function () { return fpOf(arr('ftaPages').length); } },
                          { id: 'pssa.req', what: 'System and item safety requirements, and the independence each architecture needs', to: cca.concat(['items', 'design']), accept: 'Every requirement traced to its tree or finding, and validated', fp: function () { return fpOf(arr('systemsData').map(function (s) { return (s.req || []).length; })); } }] });
            add({ id: 'dal', name: 'DAL assignment', plan: 'sspp', tab: 'dal-ref', due: when('pssa'),
                does: 'It gives each function and item the development assurance level its worst failure condition calls for.',
                inputs: [['Failure conditions and their classifications', isSup() ? 'sfha' : aft], ['The architecture and its independence claims', 'pssa']],
                outputs: [{ id: 'dal.levels', what: 'An FDAL for each function and an IDAL for each item', to: ['items'].concat(planned('cma') ? ['cma'] : []), accept: A('sspp.dal') === 'indep' ? 'Each level from its worst failure condition; every lowered level confirmed by the CMA' : 'Each level from its worst failure condition', fp: function () { return fpOf(arr('itemsData').map(function (i) { return i.dal || i.idal || ''; })); } }] });
            if (planned('zsa')) add({ id: 'zsa', name: 'Zonal safety analysis', plan: 'sspp', tab: 'zsa', due: when('cca'),
                does: 'It checks each zone of the aircraft for installation and maintenance errors and for systems that could harm each other there.',
                inputs: [['The installation: the zones, the routing and the equipment in each' + (A('sspp.zsa') === 'cad' ? ', from the CAD model' : ''), 'design'], ['The separation the safety requirements call for', 'pssa']],
                outputs: [{ id: 'cca.zsa', what: 'Zonal findings, each closed', to: ['ssa'], accept: 'Every zone inspected; installation and maintenance errors addressed', fp: function () { return fpOf(arr('zsaData').length); } },
                          { id: 'zsa.req', what: 'Installation requirements for separation and segregation', to: ['design'], accept: 'Each finding closed by a change, a requirement or a justification', fp: function () { return fpOf(arr('zsaData').length); } }] });
            if (planned('pra')) add({ id: 'pra', name: 'Particular risk analysis', plan: 'sspp', tab: 'pra', due: when('cca'),
                does: 'It checks that events outside the systems, such as ' + (listJoin(picked('sspp.pra').filter(function (x) { return x !== 'own' && x !== 'none'; }).slice(0, 3).map(function (x) { return lcFirst(optLabelK('sspp.pra', x)); })) || 'the risks on the plan\'s list') + ', cannot defeat the independence the architecture relies on.',
                inputs: [['The particular risks to analyze', 'spp'], ['The installation and the zones each risk reaches', 'design'], ['The independence the architecture relies on', 'pssa']],
                outputs: [{ id: 'cca.pra', what: 'Particular risk findings, each closed', to: ['ssa'], accept: 'Every planned particular risk analyzed in every zone it reaches', fp: function () { return fpOf(arr('praData').length); } },
                          { id: 'pra.req', what: 'Protection and segregation requirements', to: ['design'], accept: 'Each finding closed by a change, a requirement or a justification', fp: function () { return fpOf(arr('praData').length); } }] });
            if (planned('cma')) add({ id: 'cma', name: 'Common mode analysis', plan: 'sspp', tab: 'cma', due: when('cca'),
                does: 'It checks that the parts the fault trees and the DALs treat as independent really are, in design, manufacture and maintenance.',
                inputs: [['The independence claims behind the fault trees' + (A('sspp.indep') === 'ledger' ? ', from the independence ledger' : ''), 'pssa'], ['The DALs and how each item will be developed', 'dal']],
                outputs: [{ id: 'cca.cma', what: 'Common mode findings, each closed', to: ['ssa', 'dal'], accept: 'Every independence claim checked; each finding closed by a change, a requirement or a justification', fp: function () { return fpOf(arr('cmaData').length); } }] });
            if (fmeaOn()) add({ id: 'fmea', name: 'FMEA', plan: 'sspp', tab: 'fmea', due: when('pssa'),
                does: 'It lists how each ' + (planned('ppfmea') && !planned('ffmea') ? 'part' : planned('ffmea') && !planned('ppfmea') ? 'function' : 'function and part') + ' can fail and what each failure does.',
                inputs: [['The design (' + (planned('ppfmea') && !planned('ffmea') ? 'parts' : planned('ffmea') && !planned('ppfmea') ? 'functions' : 'functions and parts') + ')', 'design'], ['Failure rates', rates]],
                outputs: [{ id: 'fmea.modes', what: 'Failure modes, effects and rates' + (planned('fmes') ? ', summarized in an FMES' : ''), to: ['pssa', 'ssa'].concat(A('ramp.mx') && A('ramp.mx') !== 'none' ? ['ram-mx'] : []), accept: 'Every function or part covered; each mode\'s effect traced to the trees', fp: function () { return fpOf(arr('fmeaData').length); } }] });
            add({ id: 'ssa', name: 'SSAs', plan: 'sspp', tab: 'asa',
                does: 'It shows, with the design as built and the verification results, that each system meets its objectives.',
                inputs: [['The as-built design', 'design'], ['Failure rates', rates], ['The PSSA fault trees', 'pssa'], ['Verification results', 'verification']].concat(cca.map(function (c) { return ['Closed ' + { zsa: 'zonal', pra: 'particular risk', cma: 'common mode' }[c] + ' findings', c]; }), hf ? [['Crew actions counted on, validated', 'hf-credit']] : [], A('ramp.fracas') ? [['Failures the fault trees did not expect', 'ram-fracas']] : []),
                outputs: [{ id: 'ssa.met', what: 'Each system failure condition shown to meet its target, and the safety requirements verified', to: isSup() ? ['aircraft maker'] : ['asa'], accept: 'Every target met with as-built data; every safety requirement verified; signed', fp: function () { return fpOf(arr('ftaPages').length); } }] });
            if (!isSup()) add({ id: 'asa', name: 'ASA', plan: 'sspp', tab: 'asa',
                does: 'It brings the system results together to show each aircraft failure condition meets its objective: the safety case.',
                inputs: [['Signed SSAs', 'ssa']].concat(mfs.length ? [['The multi-system results', 'mfs']] : []),
                outputs: [{ id: 'asa.case', what: 'Each aircraft failure condition shown to meet its target: the safety case for certification', to: ['authority'], accept: 'Every aircraft failure condition met; aircraft-level trees ' + (A('sspp.asa') === 'both' ? 'compiled and written by hand agree' : 'complete') + '; signed', fp: function () { return fpOf(arr('ftaPages').length + ':' + arr('acFhaData').length); } }] });
            if (planned('ccmr')) add({ id: 'ccmr', name: 'Latent failures (CCMR)', plan: 'sspp', tab: 'ccmr', due: when('ssa'),
                does: 'It finds the failures that stay hidden until something else fails and sets how often each must be checked.',
                inputs: [['Fault trees with their latent failures and exposure times', 'pssa']],
                outputs: [{ id: 'ccmr.list', what: 'Candidate certification maintenance requirements with their intervals', to: msg3On() ? ['ram-msg3'] : has('sspp.maint', 'msg3') ? ['msg3'] : ['authority'], accept: 'Every latent failure in a catastrophic or hazardous tree has its interval', fp: function () { return fpOf(safe(function () { return pc().ccmr; }, null)); } }] });
            if (planned('ram-mmel')) add({ id: 'mmel', name: 'Dispatch (MMEL)', plan: 'sspp', tab: 'mmel', due: 'Before entry into service',
                does: 'It decides which items the aircraft may fly without, and on what conditions, with the fault trees as the proof.',
                inputs: [['The fault trees and the failure conditions', 'pssa']],
                outputs: [{ id: 'mmel.list', what: 'The items the aircraft may be dispatched without, each with its conditions', to: ['authority'], accept: 'Every item backed by its tree with the item already failed', fp: function () { return fpOf(safe(function () { return pc().mmel; }, null)); } }] });
            // ---- the Human Factors Plan ----
            if (hf) {
                var hfFp = function (k) { return function () { return fpOf(safe(function () { return pc().hf[k]; }, null)); }; };
                add({ id: 'hf-alloc', name: 'Function allocation', plan: 'hfp', tab: 'hfa-auto', due: 'At concept',
                    does: 'It decides who does each aircraft function: the crew, the automation or both' + (A('hfp.alloc') === 'phase' ? ', phase by phase' : '') + '.',
                    inputs: [['The aircraft functions and the flight phases', 'design']],
                    outputs: [{ id: 'hf.alloc', what: 'Who does what in every flight phase: crew, automation or both', to: ['hf-tasks'], accept: 'Every function given to the crew, automation or both, phase by phase', fp: hfFp('alloc') }] });
                add({ id: 'hf-tasks', name: 'Crew tasks and procedures', plan: 'hfp', tab: 'hfa-auto', due: 'During preliminary design',
                    does: 'It turns the allocation into the crew\'s tasks, and writes a procedure for each failure the crew responds to.',
                    inputs: [['Who does what', 'hf-alloc'], ['Failure conditions with a crew effect', aft]],
                    outputs: [{ id: 'hf.tasks', what: 'The crew task list and a procedure for each failure the crew responds to', to: ['hf-workload', 'hf-error', 'hf-eval'], accept: 'Each failure the crew responds to has its procedure', fp: hfFp('tasks') }] });
                add({ id: 'hf-workload', name: 'Workload', plan: 'hfp', tab: 'hfa-auto', due: 'During preliminary design; confirmed in the evaluations',
                    does: 'It measures each pilot\'s workload in every phase, with the worst failure on top' + (picked('hfp.workload').length ? ', by ' + listJoin(picked('hfp.workload').filter(function (x) { return x !== 'own'; }).map(function (x) { return lcFirst(optLabelK('hfp.workload', x).split(':')[0]); })) : '') + '.',
                    inputs: [['The crew tasks and their times', 'hf-tasks'], ['The time available in each flight phase', 'design']],
                    outputs: [{ id: 'hf.workload', what: 'Each pilot\'s workload in every phase, with the worst failure on top', to: (mfcOn ? ['hf-mfc'] : []).concat(['hf-eval']), accept: 'No pilot over the limit in any phase', fp: hfFp('tasks') }] });
                add({ id: 'hf-error', name: 'Crew error', plan: 'hfp', tab: 'hfa-auto', due: 'During preliminary design',
                    does: 'It finds the credible crew errors in each task and procedure, and how each is noticed and put right.',
                    inputs: [['The crew tasks and procedures', 'hf-tasks']],
                    outputs: [{ id: 'hf.error', what: 'The credible crew errors' + (A('hfp.error') === 'quant' ? ' with their probabilities' : '') + ', how each is noticed and put right', to: ['design'].concat(feedEvents ? ['hf-credit'] : []), accept: 'No error left that nobody notices and nobody can put right', fp: hfFp('errors') }] });
                add({ id: 'hf-alerts', name: 'Alerts', plan: 'hfp', tab: 'hfa-auto', due: 'During preliminary and detailed design',
                    does: 'It gives each failure the crew must know about an alert at the right level' + (A('hfp.alerts') === '1322' ? ', to the warning, caution and advisory rules' : '') + '.',
                    inputs: [['The failure conditions the crew must know about', aft]],
                    outputs: [{ id: 'hf.alerts', what: 'An alert for each, at its level, by sight, sound or touch', to: ['design', 'hf-eval'], accept: 'Each alert linked to its failure condition', fp: hfFp('alerts') }] });
                add({ id: 'hf-eval', name: 'Evaluations', plan: 'hfp', tab: 'hfa-results', due: 'From mock-ups to the simulator and flight test',
                    does: 'It puts the flight deck in front of pilots' + (picked('hfp.eval').length ? ' through ' + listJoin(picked('hfp.eval').filter(function (x) { return x !== 'own'; }).map(function (x) { return lcFirst(optLabelK('hfp.eval', x)); })) : '') + ' and records what they find.',
                    inputs: [['The flight deck design', 'design'], ['The crew tasks and the scenarios for each phase and failure', 'hf-tasks'], ['The workload results', 'hf-workload'], ['The alerts', 'hf-alerts']],
                    outputs: [{ id: 'hf.eval', what: 'The findings, each closed by a design change or a justification', to: ['design'], accept: 'Every finding closed', fp: hfFp('evals') },
                              { id: 'hf.valid', what: 'The evaluation results that confirm the crew actions counted on', to: ['hf-credit'], accept: 'Each crew action counted on was flown or tested', fp: hfFp('evals') }] });
                if (mfcOn) add({ id: 'hf-mfc', name: 'Minimum flight crew', plan: 'hfp', tab: 'hfa-results', due: 'Before certification',
                    does: 'It decides the minimum crew the aircraft can be flown by safely, with its reasons.',
                    inputs: [['The workload results', 'hf-workload'], [A('hfp.mfc') === 'similar' ? 'A comparable certified aircraft and its crew' : 'The workload functions and factors of the basis (Appendix D)', 'basis']],
                    outputs: [{ id: 'hf.mfc', what: 'The minimum flight crew decision, with its reasons', to: ['authority'], accept: 'Decided with its reasons and confirmed in the evaluations', fp: hfFp('mfc') }] });
                add({ id: 'hf-credit', name: 'Crew actions the safety analysis counts on', plan: 'hfp', tab: 'assumptions', due: 'As the failure conditions are classified',
                    does: 'It lists every crew action the safety analysis counts on and checks each before it is given credit.',
                    inputs: [['The crew actions each failure condition counts on', aft], ['The evaluation results', 'hf-eval']].concat(feedEvents ? [['The credible crew errors', 'hf-error']] : []),
                    outputs: [{ id: 'hf.credit', what: 'Crew actions the safety case counts on, as validated human factors assumptions' + (feedEvents ? ', with crew errors as basic events' : ''), to: feedEvents ? ['pssa', 'ssa'] : [aft, 'pssa', 'ssa'], accept: 'Each validated in the evaluations before it counts', fp: function () { return fpOf(arr('acAssumptionsData').length); } }] });
            }
            // ---- the Reliability and Maintainability Plan ----
            var rf = ramFull();
            if (ramPredOn()) add({ id: 'ram-pred', name: 'Reliability prediction', plan: 'ramp', tab: 'ram-hub', due: 'As the design matures; before the PSSAs need the rates',
                does: 'It gives every item the fault trees use a failure rate' + (picked('ramp.rates').length ? ', from ' + listJoin(picked('ramp.rates').filter(function (x) { return x !== 'own'; }).map(function (x) { return optLabelK('ramp.rates', x).split(',')[0]; })) : '') + '.',
                inputs: [['The parts and where they are installed' + (A('ramp.env') ? ' (' + lcFirst(optLabelK('ramp.env', A('ramp.env'))) + ')' : ''), 'design'], ['Failure data from suppliers, handbooks or service', 'sources']].concat(A('ramp.fracas') ? [['Failure data from test and service', 'ram-fracas']] : []),
                outputs: [{ id: 'ram.rates', what: 'A failure rate for every item the fault trees use, with its source', to: ['pssa'].concat(fmeaOn() ? ['fmea'] : [], ['ssa'], msg3On() ? ['ram-msg3'] : []), accept: 'Each rate names its source and environment', fp: function () { return fpOf(safe(function () { return pc().ram; }, null)); } }] });
            if (rf && A('ramp.alloc') === 'yes') add({ id: 'ram-alloc', name: 'Reliability allocation', plan: 'ramp', tab: 'ram-alloc', due: 'At preliminary design',
                does: 'It shares the aircraft reliability target out to the systems.',
                inputs: [['The aircraft reliability target', 'program'], ['The system architecture', 'design']],
                outputs: [{ id: 'ram.alloc', what: 'A reliability target for each system', to: ['design', 'ram-pred'], accept: 'Each prediction checked against its share', fp: function () { return fpOf(safe(function () { return pc().ramAlloc; }, null)); } }] });
            if (A('ramp.fracas')) add({ id: 'ram-fracas', name: 'Failure reporting (FRACAS)', plan: 'ramp', tab: 'ram-fracas', due: 'From the first test',
                does: 'It records every failure in test and service, finds its cause and tracks the fix.',
                inputs: [['Every failure in test and service', 'verification']],
                outputs: [{ id: 'ram.fracas', what: 'The cause and the corrective action for each failure', to: ['design'], accept: 'Every failure has its cause and its fix', fp: function () { return fpOf(safe(function () { return pc().fracas; }, null)); } },
                          { id: 'ram.surprise', what: 'Failures the fault trees did not expect', to: ['ssa'], accept: 'Each sent back to the safety assessment', fp: function () { return fpOf(safe(function () { return pc().fracas; }, null)); } },
                          { id: 'ram.field', what: 'Failure data from test and service', to: (ramPredOn() ? ['ram-pred'] : []).concat(rf && A('ramp.growth') && A('ramp.growth') !== 'no' ? ['ram-growth'] : [], rf && A('ramp.life') === 'yes' ? ['ram-life'] : []), accept: 'Every failure counted once, with its operating time', fp: function () { return fpOf(safe(function () { return pc().fracas; }, null)); } }] });
            if (rf && A('ramp.growth') && A('ramp.growth') !== 'no') add({ id: 'ram-growth', name: 'Reliability growth', plan: 'ramp', tab: 'ram-growth', due: 'Through test',
                does: 'It tracks how reliability improves through test against the planned curve' + (A('ramp.growth') === 'crow' ? ' (Crow-AMSAA)' : A('ramp.growth') === 'duane' ? ' (Duane)' : '') + '.',
                inputs: [['Failures in test', A('ramp.fracas') ? 'ram-fracas' : 'verification'], ['The planned growth curve', 'program']],
                outputs: [{ id: 'ram.growth', what: 'The growth achieved against the plan, with shortfalls raised', to: ['program'], accept: 'Shortfalls raised to the program', fp: function () { return fpOf(safe(function () { return pc().ramGrowth; }, null)); } }] });
            if (rf && A('ramp.life') === 'yes') add({ id: 'ram-life', name: 'Life data (Weibull)', plan: 'ramp', tab: 'ram-weibull', due: 'As failure and removal data builds up',
                does: 'It finds which items wear out, and when, from their failure and removal times.',
                inputs: [['Failure and removal times', A('ramp.fracas') ? 'ram-fracas' : 'verification']],
                outputs: [{ id: 'ram.life', what: 'Wear-out behavior and life limits for the items that age', to: msg3On() ? ['ram-msg3', 'design'] : ['design'], accept: 'Each ageing item has its life limit or inspection', fp: function () { return fpOf(safe(function () { return pc().weibull; }, null)); } }] });
            var mx = picked('ramp.mx').filter(function (x) { return x !== 'none' && x !== 'own'; });
            if (mx.length || has('ramp.mx', 'own')) add({ id: 'ram-mx', name: 'Maintainability and testability', plan: 'ramp', tab: 'ram-mx', due: 'During detailed design',
                does: 'It works out ' + (listJoin(mx.map(function (x) { return { mttr: 'how long each repair takes and the downtime', test: 'how well each failure is detected and isolated', lora: 'where each repair is done' }[x]; })) || 'the program\'s maintainability measures') + '.',
                inputs: [['The replaceable units and their failure modes', fmeaOn() ? 'fmea' : 'design']],
                outputs: [{ id: 'ram.mx', what: listJoin(mx.map(function (x) { return { mttr: 'Repair times and downtime', test: 'Fault detection and isolation figures', lora: 'The level of repair for each unit' }[x]; })) || 'The maintainability results', to: ['design'].concat(msg3On() ? ['ram-msg3'] : []), accept: 'Reviewed with maintenance', fp: function () { return fpOf(safe(function () { return pc().ramMx; }, null)); } }] });
            if (msg3On()) add({ id: 'ram-msg3', name: 'Scheduled maintenance', plan: 'ramp', tab: 'ram-msg3', due: 'Before entry into service',
                does: 'It sets the scheduled maintenance tasks and intervals' + (A('ramp.msg3') === 'msg3' ? ' with MSG-3' : '') + ', keeping the CMRs from the safety assessment apart.',
                inputs: [['The systems, structures and zones', 'design']].concat(planned('ccmr') ? [['The candidate CMRs', 'ccmr']] : [], ramPredOn() ? [['Failure rates', 'ram-pred']] : []),
                outputs: [{ id: 'ram.msg3', what: 'The scheduled maintenance tasks and intervals, with the CMRs kept apart', to: ['authority'], accept: 'Every CMR included and never escalated without the safety group', fp: function () { return fpOf(safe(function () { return pc().msg3x; }, null)); } }] });
            if (A('ramp.lcc') === 'yes') add({ id: 'ram-lcc', name: 'Life-cycle cost', plan: 'ramp', tab: 'ram-hub', due: 'At each design review',
                does: 'It works out what reliability and maintenance will cost over the aircraft\'s life.',
                inputs: [['Failure rates', ramPredOn() ? 'ram-pred' : 'design'], ['Repair times and the maintenance tasks', mx.length ? 'ram-mx' : 'design']],
                outputs: [{ id: 'ram.lcc', what: 'The life-cycle cost of reliability and maintenance', to: ['program'], accept: 'Updated at each design review', fp: function () { return fpOf(safe(function () { return pc().lcc; }, null)); } }] });
            return L;
        });
    }
    var NODE_NAMES = { basis: 'Certification basis', program: 'The program', design: 'Design and development', verification: 'Verification', authority: 'The authority', 'aircraft maker': 'The aircraft maker', items: 'Item development (software and hardware)', msg3: 'MSG-3 scheduled maintenance', sources: 'Failure data sources', all: 'Every assessment in this plan', cca: 'Common cause analyses', hf: 'Human factors', ram: 'Reliability and maintainability' };
    // the older diagrams draw some work as one box: clicking it shows each assessment inside
    var GROUPS = { cca: ['zsa', 'pra', 'cma'], hf: ['hf-alloc', 'hf-tasks', 'hf-workload', 'hf-error', 'hf-alerts', 'hf-eval', 'hf-mfc', 'hf-credit'], ram: ['ram-pred', 'ram-alloc', 'ram-fracas', 'ram-growth', 'ram-life', 'ram-mx', 'ram-msg3', 'ram-lcc'] };
    function assessmentOf(id) { return assessments().filter(function (x) { return x.id === id; })[0] || null; }
    function membersOf(id) { return (GROUPS[id] || [id]).map(assessmentOf).filter(Boolean); }
    var PLAN_OF_WORD = { sspp: 'SSPP', hfp: 'HF plan', ramp: 'RAM plan' };
    function nodeName(id) { var a = assessments().filter(function (x) { return x.id === id; })[0]; return a ? a.name : (NODE_NAMES[id] || id); }
    // every exchange: from, to, what passes, when (when the output is due)
    function exchanges() {
        var out = [];
        assessments().forEach(function (a) { a.outputs.forEach(function (o) { o.to.forEach(function (t) { out.push({ from: a.id, to: t, what: o.what, when: dueOf(a.id) }); }); }); });
        return out;
    }
    function dueOf(id) { var a = assessmentOf(id); if (a && a.due) return a.due; var w = { afha: when('afha'), pasa: when('pasa'), sfha: when('sfha'), pssa: when('pssa'), ssa: when('ssa'), asa: when('asa') }[id]; return w || 'As the plan sets out'; }
    // a name as seen from one plan: work that belongs to another plan says which
    function nameIn(id, key) { var a = assessmentOf(id); return a && key && a.plan !== key ? a.name + ' (' + PLAN_OF_WORD[a.plan] + ')' : nodeName(id); }
    function ioRows(key) {
        return assessments().filter(function (a) { return a.plan === key; }).map(function (a) {
            return { Assessment: a.name, 'Inputs required (from)': a.inputs.map(function (i) { return i[0] + ' (' + nameIn(i[1], key) + ')'; }).join('; '), 'Outputs expected (to)': a.outputs.map(function (o) { return o.what + ' (to ' + listJoin(o.to.map(function (t) { return nameIn(t, key); })) + ')'; }).join('; ') };
        });
    }
    // the outputs each plan commits to, with how each is accepted; the ticks are kept in the project, never in the plan
    function outputsOf(key) {
        var role = { sspp: docCtl('sspp').appr || (A('sspp.owner') ? optLabelK('sspp.owner', A('sspp.owner')).replace(/^The /, '') : 'The plan\'s approver'), hfp: docCtl('hfp').appr || 'Human factors lead', ramp: docCtl('ramp').appr || 'Reliability and maintainability lead' }[key];
        var out = [];
        assessments().filter(function (a) { return a.plan === key; }).forEach(function (a) { a.outputs.forEach(function (o) { out.push({ id: o.id, what: o.what, from: a.name, tab: a.tab, accept: o.accept, due: dueOf(a.id), role: String(role).replace(/^./, function (c) { return c.toUpperCase(); }), fp: o.fp }); }); });
        return out;
    }
    function acceptance(key) {
        var s = store(); if (!s.accept) s.accept = {};
        return outputsOf(key).map(function (o) { var r = s.accept[o.id], fp = safe(o.fp, ''); var st = !r ? 'open' : r.fp === fp ? 'accepted' : 'reopened'; return Object.assign({}, o, { state: st, by: r && r.by, at: r && r.at }); });
    }
    function acceptOutput(id) {
        var s = store(); if (!s.accept) s.accept = {};
        var o = PLANS.reduce(function (a, p) { return a.concat(outputsOf(p.key)); }, []).filter(function (x) { return x.id === id; })[0]; if (!o) throw fail('No such output: ' + id);
        s.accept[id] = { by: who(), at: now(), fp: safe(o.fp, '') }; save(); return s.accept[id];
    }
    function unacceptOutput(id) { var s = store(); if (s.accept) delete s.accept[id]; save(); }
    // where each assessment stands (shown on demand only: the "show where the program stands" switch and the node panel)
    function liveOf(id) {
        var c = counts(), m = {
            afha: c.afha + ' aircraft failure conditions', sfha: c.sfha + ' system failure conditions in ' + c.systems + ' systems', pssa: c.trees + ' fault trees', ssa: c.trees + ' fault trees', asa: c.trees + ' fault trees',
            cca: [planned('cma') ? c.cma + ' CMA rows' : '', planned('pra') ? c.pra + ' PRA rows' : '', planned('zsa') ? c.zsa + ' ZSA rows' : ''].filter(Boolean).join(', '),
            cma: c.cma + ' rows', pra: c.pra + ' rows', zsa: c.zsa + ' rows', fmea: c.fmea + ' rows', dal: c.items + ' items', items: c.items + ' items',
            pasa: laneItems('fta') ? 'Fault trees: ' + c.trees : '', ipledger: laneItems('ipledger') + ' claims', hf: safe(function () { var cv = root.SLHfAuto.coverage(); return cv.filter(function (x) { return x.state === 'done'; }).length + ' of ' + cv.length + ' steps signed'; }, ''),
            ram: laneItems('ram-reliability') + ' items', ccmr: laneItems('ccmr') + ' latent failures', spp: PLANS.map(function (p) { return p.code + ' rev ' + rev(p.key); }).join(', '),
            'dev-func': c.functions + ' functions', 'dev-sys': c.systems + ' systems', 'dev-req': c.reqs + ' requirements', 'dev-items': c.items + ' items'
        };
        if (GROUPS[id]) return m[id] || '';
        return m[id] || (/^hf-/.test(id) ? m.hf : /^ram-/.test(id) ? m.ram : id === 'mfs' ? m.pasa : '');
    }

    // ---- inputs and outputs, in words and in pictures (7 Nov 2026) ----------------------------------------------------
    // One short paragraph per assessment: what it does, what it needs and from where, what it must produce and for whom.
    // a name inside a sentence: "the PSSAs", "design and development", "the human factors plan's crew tasks"
    var PROSE_NAMES = { basis: 'the certification basis', program: 'the program', design: 'design and development', verification: 'verification', authority: 'the authority', 'aircraft maker': 'the aircraft maker', items: 'item development (software and hardware)', msg3: 'MSG-3 scheduled maintenance', sources: 'failure data sources', all: 'every assessment in this plan' };
    function inText(id, key) {
        if (PROSE_NAMES[id]) return PROSE_NAMES[id];
        var a = assessmentOf(id); if (!a) return nodeName(id);
        var nm = /^[A-Z]{2,}/.test(a.name) || /^Aircraft FHA$|^System FHAs$/.test(a.name) ? a.name.replace(/^System FHAs$/, 'system FHAs') : lcFirst(a.name);
        return 'the ' + nm + (a.plan !== key ? ' (' + PLAN_OF_WORD[a.plan] + ')' : '');
    }
    function ioProse(key) {
        return assessments().filter(function (a) { return a.plan === key; }).map(function (a) {
            var ins = a.inputs.map(function (i) { return lcFirst(i[0]) + ' (from ' + inText(i[1], key) + ')'; });
            var outs = a.outputs.map(function (o) { return lcFirst(o.what) + ', for ' + listJoin(o.to.map(function (t) { return inText(t, key); })); });
            return { k: 'p', text: a.name + '. ' + a.does + ' It needs ' + listJoin(ins) + '. It must produce ' + (outs.length > 1 ? outs.slice(0, -1).join('; ') + '; and ' + outs[outs.length - 1] : outs[0]) + '.', io: a.id };
        });
    }
    // The pictures: one row per assessment, its inputs on the left with where each comes from, its outputs on the right
    // with who uses each. Straight arrows, one per input and output, so every exchange is drawn and none cross.
    function ioBox(x, y, w, title, sub, dashed) {
        var tl = wrapText(title, Math.floor(w / 6.3)), sl = sub ? wrapText(sub, Math.floor(w / 5.6)) : [], h = 12 + tl.length * 13 + sl.length * 12;
        var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="6" fill="' + C.panel + '" stroke="' + C.line + '" stroke-width="1"' + (dashed ? ' stroke-dasharray="4 3"' : '') + '/>';
        tl.forEach(function (l, i) { s += '<text x="' + (x + 8) + '" y="' + (y + 17 + i * 13) + '" font-size="11" fill="' + C.ink + '">' + sx(l) + '</text>'; });
        sl.forEach(function (l, i) { s += '<text x="' + (x + 8) + '" y="' + (y + 17 + tl.length * 13 + i * 12) + '" font-size="9.5" font-style="italic" fill="' + C.sub + '">' + sx(l) + '</text>'; });
        return { svg: s, h: h };
    }
    function figIO(key) {
        var L = assessments().filter(function (a) { return a.plan === key; }); if (!L.length) return [];
        var W = 900, LX = 16, LW = 262, CX = 336, CW = 228, RX = 622, RW = 262, GAP = 8, per = 5, figs = [], parts = Math.ceil(L.length / per);
        var external = function (id) { var a = assessmentOf(id); return !a || a.plan !== key; };
        for (var p = 0; p < parts; p++) {
            var rows = L.slice(p * per, p * per + per), y = 72, body = '';
            rows.forEach(function (a, ri) {
                var lefts = a.inputs.map(function (i) { return ioBox(0, 0, LW, i[0], 'From ' + nameIn(i[1], key), external(i[1])); });
                var rights = a.outputs.map(function (o) { return ioBox(0, 0, RW, o.what, 'To ' + listJoin(o.to.map(function (t) { return nameIn(t, key); })), false); });
                var lT = lefts.reduce(function (t, b) { return t + b.h; }, 0) + GAP * Math.max(0, lefts.length - 1), rT = rights.reduce(function (t, b) { return t + b.h; }, 0) + GAP * Math.max(0, rights.length - 1);
                var nl = wrapText(a.name, Math.floor(CW / 7.6)), dl = wrapText(a.does, Math.floor(CW / 5.7)), cH = 20 + nl.length * 15 + dl.length * 12;
                var rowH = Math.max(lT, rT, cH);
                if (ri) { body += '<line x1="16" y1="' + (y - 11) + '" x2="884" y2="' + (y - 11) + '" stroke="' + C.panelS + '" stroke-width="1"/>'; }
                // the assessment: full row height so every arrow meets it straight on
                var c = '<rect x="' + CX + '" y="' + y + '" width="' + CW + '" height="' + rowH + '" rx="8" fill="' + C.onF + '" stroke="' + C.on + '" stroke-width="1.4"/>', cy0 = y + rowH / 2 - cH / 2 + 22;
                nl.forEach(function (l, i) { c += '<text x="' + (CX + CW / 2) + '" y="' + (cy0 + i * 15) + '" font-size="12.5" font-weight="700" fill="' + C.ink + '" text-anchor="middle">' + sx(l) + '</text>'; });
                dl.forEach(function (l, i) { c += '<text x="' + (CX + CW / 2) + '" y="' + (cy0 + nl.length * 15 + 2 + i * 12) + '" font-size="9.5" fill="' + C.sub + '" text-anchor="middle">' + sx(l) + '</text>'; });
                body += nodeWrapId(a.id, c, CX, y, CW);
                var ly = y + (rowH - lT) / 2;
                lefts.forEach(function (b, i) { body += '<g transform="translate(' + LX + ',' + ly + ')">' + b.svg + '</g>'; var my = ly + b.h / 2; body += '<line x1="' + (LX + LW) + '" y1="' + my + '" x2="' + (CX - 1) + '" y2="' + my + '" stroke="' + C.line + '" stroke-width="1.3" marker-end="url(#pla-ah)" data-io="in"/>'; ly += b.h + GAP; });
                var ry = y + (rowH - rT) / 2;
                rights.forEach(function (b, i) { body += '<g transform="translate(' + RX + ',' + ry + ')">' + b.svg + '</g>'; var my = ry + b.h / 2; body += '<line x1="' + (CX + CW) + '" y1="' + my + '" x2="' + (RX - 1) + '" y2="' + my + '" stroke="' + C.line + '" stroke-width="1.3" marker-end="url(#pla-ah)" data-io="out"/>'; ry += b.h + GAP; });
                y += rowH + 22;
            });
            var H0 = y + 4, title = (key === 'sspp' ? 'Inputs and outputs of the safety assessments' : key === 'hfp' ? 'Inputs and outputs of the human factors work' : 'Inputs and outputs of the reliability and maintainability work') + (parts > 1 ? ', part ' + (p + 1) : '');
            var hd = head(title, 'Left: what each needs and where it comes from (dashed: from outside this plan). Right: what it must produce and who uses it.');
            hd += '<text x="' + (LX + LW / 2) + '" y="' + 62 + '" font-size="10" font-weight="700" fill="' + C.sub + '" text-anchor="middle">INPUTS</text><text x="' + (CX + CW / 2) + '" y="62" font-size="10" font-weight="700" fill="' + C.sub + '" text-anchor="middle">ASSESSMENT</text><text x="' + (RX + RW / 2) + '" y="62" font-size="10" font-weight="700" fill="' + C.sub + '" text-anchor="middle">OUTPUTS</text>';
            var r = svgWrap(W, H0 + 6, hd + body.replace(/^/, ''), title);
            figs.push({ k: 'fig', name: 'io' + (p + 1), title: title, svg: r.svg.replace('<rect width="100%"', '<rect width="100%"'), w: r.w, h: r.h, lead: (p ? '{N} continues them.' : '{N} draws the inputs and outputs of each assessment' + (parts > 1 ? ', in ' + parts + ' parts' : '') + '.') });
        }
        return figs;
    }
    // the inputs and outputs part of a plan: the words first, then the pictures, then the two reference tables
    function ioSet(key) {
        var L = assessments().filter(function (a) { return a.plan === key; }); if (!L.length) return [];
        var what = { sspp: 'assessment', hfp: 'part of the human factors work', ramp: 'part of the reliability and maintainability work' }[key];
        return [P('Each ' + what + ' is defined here by what it does, the inputs it needs and where each comes from, and the outputs it must produce and who uses each. Work that belongs to another plan is named with that plan.')]
            .concat(ioProse(key), figIO(key), [TBL('io', 'Inputs and outputs of each ' + what, ioRows(key), '{N} lists the same inputs and outputs for reference.'),
                TBL('exchanges', 'Data passed between the work', exchangeRows(key), '{N} lists each exchange: who passes what to whom, and when it is due.')]);
    }
    // the exchanges as one table per plan: who passes what to whom, and when it is due
    function exchangeRows(key) {
        return exchanges().filter(function (x) { var a = assessmentOf(x.from); return a && a.plan === key; }).map(function (x) { return { From: nodeName(x.from), To: nameIn(x.to, key), 'What passes': x.what, When: x.when }; });
    }
    // ---- the documents ----------------------------------------------------------------------------------------------
    // blocks: { k:'h', level, text } | { k:'p', text } | { k:'table', name, title, rows, lead } | { k:'fig', name, title, svg, w, h, lead }
    // A table or figure's lead sentence names it by number ({N}) and comes right before it, so each is referred to first.
    function H(level, text) { return { k: 'h', level: level, text: text }; }
    function P(text) { return { k: 'p', text: text }; }
    function TBL(name, title, rows, lead) { return { k: 'table', name: name, title: title, rows: rows, lead: lead }; }
    function txtOf(q) {
        var v = A(q.k); if (!v) return 'To be decided: ' + lcFirst(q.text.replace(/\?$/, '')) + '.';
        var vs = v.split('|'), core = vs.filter(function (x) { return x !== 'own'; }).join('|'), s = '';
        if (core) s = typeof q.txt === 'function' ? q.txt(core, q) : (q.txt[core] != null ? q.txt[core] : optLabel(q, core));
        if (vs.indexOf('own') >= 0) s += (s ? ' ' : '') + (store().own[q.k] || 'To be written: how the program will do it in its own way (' + lcFirst(q.text.replace(/\?$/, '')) + ').');
        var why = store().why[q.k]; if (vs.some(function (x) { return (q.reasonFor || []).indexOf(x) >= 0; })) s += ' Reason: ' + (why || 'to be written') + '.';
        return s.replace(/\.\.$/, '.');
    }
    function docCtl(key) {
        var s = store(), d = s.doc[key] || (s.doc[key] = {});
        if (!d.no) d.no = initials() + '-' + BY[key].code + '-001';
        if (!d.status) d.status = 'Draft';
        if (!d.issues) d.issues = [];
        return d;
    }
    var ROLES = ['Chief safety engineer', 'Aircraft safety lead', 'System safety engineer', 'Chief engineer', 'Certification manager', 'Head of airworthiness', 'Quality and process assurance', 'Human factors lead', 'Reliability and maintainability lead', 'Program manager'];
    var DOC_STATUS = ['Draft', 'In review', 'Approved', 'Superseded'];
    function rev(key) { var d = docCtl(key), i = d.issues; return i.length ? i[i.length - 1].rev : 'Draft'; }
    function nextRev(r) { if (!r || r === 'Draft') return 'A'; var n = 0; for (var i = 0; i < r.length; i++) n = n * 26 + (r.charCodeAt(i) - 64); n++; var out = ''; while (n > 0) { var m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); } return out; }
    // one new revision per issue; issuing again the same day replaces that day's issue (never a pile of same-day revisions)
    function issue(key, note) {
        var d = docCtl(key), last = d.issues[d.issues.length - 1], by = who();
        note = String(note || '').trim() || (last ? 'Revised' : 'First issue');
        if (last && last.date === today()) { last.note = note; last.by = by; last.at = now(); }
        else d.issues.push({ rev: nextRev(last && last.rev), date: today(), note: note, by: by, at: now() });
        save(); return d.issues[d.issues.length - 1];
    }
    function setDoc(key, field, v) { var d = docCtl(key); if (field === 'status' && DOC_STATUS.indexOf(v) < 0) throw fail('Not a document status: ' + v); if (/^(prep|rev|appr)$/.test(field) && v && ROLES.indexOf(v) < 0) throw fail('Not one of the roles: ' + v); if (field === 'no') v = String(v || '').trim().slice(0, 40) || d.no; d[field] = v; save(); }
    function coverTables(key, kind) {
        var d = docCtl(key), plan = BY[key], isR = kind === 'status', title = isR ? plan.report : plan.title, no = isR ? d.no + '-SR' : d.no;
        var rows1 = [{ Item: 'Document number', Entry: no }, { Item: 'Title', Entry: title }, { Item: 'Program', Entry: projName() }, { Item: 'Revision', Entry: isR ? 'Report of ' + today() + ' (read from the project when issued)' : rev(key) }, { Item: 'Date', Entry: isR ? today() : (d.issues.length ? d.issues[d.issues.length - 1].date : today()) }, { Item: 'Status', Entry: isR ? 'Report' : d.status }];
        if (isR) rows1.push({ Item: 'Reports on', Entry: plan.title + ' ' + d.no + ', revision ' + rev(key) });
        var rows2 = [{ Role: 'Prepared by', Holder: d.prep || 'To be named (by role)', Signature: '', Date: '' }, { Role: 'Reviewed by', Holder: d.rev || 'To be named (by role)', Signature: '', Date: '' }, { Role: 'Approved by', Holder: d.appr || 'To be named (by role)', Signature: '', Date: '' }];
        var t = [{ title: 'Document control', rows: rows1 }, { title: 'Approvals', rows: rows2 }];
        if (!isR) t.push({ title: 'Revision history', rows: d.issues.length ? d.issues.map(function (x) { return { Revision: x.rev, Date: x.date, Description: x.note, By: x.by }; }) : [{ Revision: 'Draft', Date: today(), Description: 'Not yet issued', By: '' }] });
        return t;
    }
    function standardsRows() {
        var r = [{ Document: 'SAE ARP4754B', 'What it is used for': 'The development assurance processes and objectives; this plan follows the layout of its example safety program plan' },
            { Document: 'SAE ARP4761A', 'What it is used for': 'The safety assessment methods: FHA, PASA, PSSA, SSA, ASA and the common cause analyses' },
            { Document: 'Certification basis: ' + (REG_SHORT[regNow()] || regNow()), 'What it is used for': 'The failure condition classifications, their probability targets and the DALs they call for' }];
        if (has('sspp.items', 'sw')) r.push({ Document: 'RTCA DO-178C', 'What it is used for': 'Software development assurance' });
        if (has('sspp.items', 'aeh')) r.push({ Document: 'RTCA DO-254', 'What it is used for': 'Airborne electronic hardware development assurance' });
        if (A('sspp.toolq') === 'qualify') r.push({ Document: 'RTCA DO-330', 'What it is used for': 'Tool qualification' });
        if (A('basis.p23dal') || regNow() === 'Part 23') r.push({ Document: 'ASTM F3230 and F3061', 'What it is used for': 'Part 23 assessment levels, targets and DALs' });
        r.push({ Document: 'Human Factors Plan ' + docCtl('hfp').no, 'What it is used for': 'The crew\'s part in the safety case' });
        r.push({ Document: 'Reliability and Maintainability Plan ' + docCtl('ramp').no, 'What it is used for': 'The failure rates the safety assessment uses' });
        return r;
    }
    function intro(key, sec) {
        var plan = BY[key], rep = plan.report + ' (' + docCtl(key).no + '-SR)';
        var I = {
            sspp: { 'Scope and purpose': 'This plan sets out how the safety of ' + projName() + ' will be assessed and shown to the authority: who will do the work, the certification basis and the safety objectives it sets, the assessments and their methods, how each process will be run, the development assurance objectives and how each will be met, and the records that will be kept. Where the work stands is not part of this plan; it is reported in the ' + rep + ', which is read from the project each time it is issued.',
                    'Certification basis and safety objectives': 'The certification basis decides the failure condition classifications, the probability target each must meet and the development assurance level each calls for. The classifications, targets and levels below are the ones Safety Lab applies to the fault trees and the DAL assignment, so the plan and the analysis cannot disagree.',
                    'How the safety program is organized': 'This section names who will do the safety work and how the teams will fit together. Responsibilities are given to roles, not to people.',
                    'Safety responsibilities': 'This section sets out the safety duties through the program: the safety requirements, the reviews, the maintenance tasks and the tests the safety case will rely on.',
                    'The safety assessment process and its methods': 'The safety assessment will run top down and then back up: the functional hazard assessments classify what could go wrong; the preliminary assessments set the architecture and the requirements; the system and aircraft safety assessments show the design as built meets them. Development assurance levels are assigned along the way.',
                    'Common cause analyses': 'The common cause analyses will check that the independence the architecture counts on is real: nothing shared, no event outside the systems, and nothing in a zone can defeat it.',
                    'Development assurance': 'This section sets out how the program will meet the development assurance objectives of ARP4754B (in our own one-line summary; the standard\'s Appendix A tables are the authority).',
                    'Tools': 'The program\'s tools are declared here. The safety and reliability analyses will be done in Safety Lab Aero.',
                    'Tailoring': 'The analysis lanes in the program, and any expected lane left out with its reason. Work already in a lane that is left out is kept, never deleted.',
                    'Configuration management and records': 'How the safety data will be controlled, baselined, kept and retrieved.' },
            hfp: { 'Scope and purpose': 'This plan sets out how ' + projName() + ' will show that the flight crew can operate the aircraft safely: the crew\'s part in each function, their workload in every flight phase, the errors they could make, how they are told about failures, and the minimum crew. It sits under the System Safety Program Plan (' + docCtl('sspp').no + '). Where the work stands is reported in the ' + rep + '.',
                   'The crew and the operation': 'The crew the design assumes and the operation it is designed for.',
                   'The human factors work through the design cycle': 'The work will run in ten steps, from concept to certification, in the HF Autopilot.',
                   'Workload and crew error': 'How workload will be measured, and how crew errors will be found and closed.',
                   'Evaluations and who does them': 'How the human factors claims will be shown, and by whom.',
                   'Minimum flight crew': 'How the minimum flight crew will be decided.',
                   'Crew actions the safety analysis counts on': 'Where a failure condition is classified on the strength of something the crew does, that action is a claim this plan holds the program to.',
                   'Development assurance': 'The development assurance objectives this plan helps meet, and how.',
                   'Records and changes to this plan': 'The human factors data will be kept in Safety Lab with their history. Changes to this plan are signed by the owner of the System Safety Program Plan.' },
            ramp: { 'Scope and purpose': 'This plan sets out the reliability and maintainability work on ' + projName() + ': where failure rates will come from, the targets, failure reporting, maintainability, scheduled maintenance and the other analyses. The failure rates it produces feed the safety assessment. It sits under the System Safety Program Plan (' + docCtl('sspp').no + '). Where the work stands is reported in the ' + rep + '.',
                    'Reliability prediction and data sources': 'Failure rates will be predicted at the level the fault trees need.',
                    'Allocation and growth': 'Targets for the systems, and how reliability will grow through test.',
                    'Failure reporting': 'How failures found in test and in service will be handled.',
                    'Maintainability and testability': 'How quickly and surely failures will be found and fixed.',
                    'Scheduled maintenance and dispatch': 'Scheduled maintenance tasks and dispatch with equipment inoperative.',
                    'Other reliability analyses': 'Further reliability analyses the program will use.',
                    'Development assurance': 'The development assurance objectives this plan helps meet, and how.',
                    'Records and changes to this plan': 'The reliability data will be kept in Safety Lab with their history. Changes to this plan are signed by the owner of the System Safety Program Plan.' }
        };
        return (I[key] || {})[sec] || '';
    }
    function planTables(key, sec) {
        var out = [];
        var objTable = function () { var rows = daCover(key === 'sspp' ? null : key).map(function (r) { return { Objective: r.id, 'What it asks': r.text, 'How the program will meet it': r.how.length ? r.how.join('; ') : (r.qs.length ? 'To be decided' : 'By the work itself, as the Objectives matrix shows'), 'Where the evidence will be': r.tools.map(pageName).join(', ') || 'Objectives matrix' }; }); return TBL('objectives', 'Development assurance objectives and how the program will meet them', rows, '{N} lists each objective, how this plan meets it and where its evidence will be.'); };
        var procTable = function () { return TBL('processes', 'How each process will be run', procRows(key), '{N} defines each process: how it will be done, the inputs it needs and when, what it produces, and the checks before it counts.'); };
        if (key === 'sspp') {
            if (sec === 'Scope and purpose') out.push(TBL('standards', 'Standards and guidance this plan follows', standardsRows(), '{N} lists the standards and documents this plan follows.'));
            if (sec === 'Certification basis and safety objectives') {
                var cfg = plannedCfg(), T = targetsFor(cfg);
                out.push(TBL('targets', 'Failure condition classifications, probability targets and development assurance levels (' + (REG_SHORT[canonReg(cfg.regulation)] || cfg.regulation) + ')', T.map(function (t) { return { Classification: t.sev, 'Probability target': probWords(t.prob), 'Function DAL': t.dal || (t.sev === 'No Safety Effect' ? 'E' : 'Set by the basis') }; }), '{N} gives each classification, its probability target and the development assurance level it calls for, under this basis.'));
                var st = sevTable(cfg);
                if (st && st.headers && st.rows) out.push(TBL('sevdefs', 'The classifications as the basis defines them', st.rows.map(function (r) { var o = {}; st.headers.forEach(function (h, i) { o[h] = r[i]; }); return o; }), '{N} gives each classification as the basis defines it, with its source.'));
            }
            if (sec === 'The safety assessment process and its methods') { out.push(procTable()); ioSet(key).forEach(function (b) { out.push(b); }); }
            if (sec === 'Development assurance') out.push(objTable());
            if (sec === 'Tools') out.push(TBL('tools', 'The program\'s tools', [{ Work: 'Safety and reliability analyses', Tool: 'Safety Lab Aero', 'Trusted by': A('sspp.toolq') ? optLabelK('sspp.toolq', A('sspp.toolq')) : 'To be decided' }, { Work: 'Requirements management', Tool: A('sspp.rmtool') ? (RM_NAMES[A('sspp.rmtool')] || optLabelK('sspp.rmtool', A('sspp.rmtool'))) : 'To be decided', 'Trusted by': 'Exchange checked at each baseline' }, { Work: 'System architecture', Tool: A('sspp.mbse') ? (MBSE_NAMES[A('sspp.mbse')] || optLabelK('sspp.mbse', A('sspp.mbse'))) : 'To be decided', 'Trusted by': 'Import checked at each baseline' }], '{N} lists the tools the program will use and how their output will be trusted.'));
            if (sec === 'Tailoring' && PP()) {
                var lanes = PP().CATALOGUE.filter(function (l) { return !l.parent; });
                var why = function (id) { var hit = ''; PLANS.forEach(function (p) { p.qs.forEach(function (q) { (q.set || []).forEach(function (st) { if (st.lane === id && A(q.k) && safe(function () { return st.after(A(q.k)); }, null) === 'Out') hit = store().why[q.k] || optLabel(q, A(q.k)); }); }); }); return hit; };
                var exp = expectedFor(plannedCfg().regulation);
                out.push(TBL('lanes', 'Analysis lanes in the program', lanes.map(function (l) { var on = planned(l.id); return { Lane: l.name, 'Expected by the basis': exp.indexOf(l.id) >= 0 ? 'Yes' : 'No', 'In the program': on ? 'Yes' : 'No', 'Reason if left out': on ? '' : (why(l.id) || (exp.indexOf(l.id) >= 0 ? 'To be written' : 'Not needed')) }; }), '{N} lists each analysis lane, whether the basis expects it, whether the program includes it, and the reason where an expected one is left out.'));
            }
        }
        if (key === 'hfp' && A('hfp.need') !== 'none') {
            if (sec === 'The human factors work through the design cycle') { out.push(procTable()); ioSet(key).forEach(function (b) { out.push(b); }); }
            if (sec === 'Development assurance') out.push(objTable());
        }
        if (key === 'ramp') {
            if (sec === 'Scope and purpose') { out.push(procTable()); ioSet(key).forEach(function (b) { out.push(b); }); }
            if (sec === 'Development assurance') out.push(objTable());
        }
        return out;
    }
    function doc(key) {
        var plan = BY[key], blocks = [];
        plan.secs.forEach(function (sec, i) {
            blocks.push(H(1, (i + 1) + '. ' + sec));
            var it = intro(key, sec); if (it) blocks.push(P(it));
            questions(key).filter(function (q) { return q.sec === sec; }).forEach(function (q) { var b = P(txtOf(q)); b.q = q.k; blocks.push(b); });
            secFigs(key, sec).forEach(function (f) { blocks.push(f); });
            planTables(key, sec).forEach(function (t) { blocks.push(t); });
        });
        var outs = outputsOf(key), n0 = plan.secs.length + 1;
        blocks.push(H(1, n0 + '. Outputs and acceptance'));
        blocks.push(P('This plan is complete when each output below has been produced and accepted against its criteria by the role named. The acceptance is recorded in Safety Lab, with who accepted it and when; if an output changes after it is accepted, its acceptance is reopened. The columns for the acceptance are left blank here for signing.'));
        blocks.push(TBL('outputs', 'Outputs and how each will be accepted', outs.map(function (o, i) { return { '#': String(i + 1), Output: o.what, 'Produced by': o.from, 'Accepted when': o.accept, Due: o.due, 'Accepted by (role)': o.role, Signature: '', Date: '' }; }), '{N} lists every output this plan commits to and how each will be accepted.'));
        var gp = gaps(key);
        if (gp.length) { blocks.push(H(1, (n0 + 1) + '. To be decided')); blocks.push(P('These decisions are not made yet. Each is written into the plan above as "To be decided" until it is.')); blocks.push(TBL('open', 'Decisions still to be made', gp.map(function (x, i) { return { '#': String(i + 1), Decision: x }; }), '{N} lists them.')); }
        return number(blocks);
    }
    // the status report: where the work the plan sets out stands, read from the project (the plan never carries this)
    function statusDoc(key) {
        var plan = BY[key], c = counts(), b = [];
        b.push(H(1, '1. Purpose'));
        b.push(P('This report records where the work set out in the ' + plan.title + ' (' + docCtl(key).no + ', revision ' + rev(key) + ') stands, read from the project on ' + today() + '. It changes as the work does; the plan does not.'));
        b.push(H(1, '2. Where the work stands'));
        if (key === 'sspp') {
            b.push(TBL('st-work', 'The assessments and where they stand', [
                { Assessment: 'Aircraft FHA', Now: c.afha + ' aircraft failure conditions' }, { Assessment: 'System FHAs', Now: c.sfha + ' system failure conditions across ' + c.systems + ' systems' },
                { Assessment: 'Fault trees (PSSA, SSA, ASA)', Now: c.trees + ' fault trees' }, { Assessment: 'FMEA', Now: c.fmea + ' rows' },
                { Assessment: 'Common mode analysis', Now: c.cma + ' rows' }, { Assessment: 'Particular risk analysis', Now: c.pra + ' rows' }, { Assessment: 'Zonal safety analysis', Now: c.zsa + ' rows' },
                { Assessment: 'Safety requirements', Now: c.reqs + ' requirements' }, { Assessment: 'Assumptions', Now: c.asm + ' assumptions' }], '{N} gives the size of each assessment today.'));
            b.push(figDalStatus());
            if (PP()) b.push(TBL('st-lanes', 'Work held in each analysis lane', PP().CATALOGUE.filter(function (l) { return !l.parent; }).map(function (l) { return { Lane: l.name, 'In the program': laneOn(l.id) ? 'Yes' : 'No', 'Items held': String(laneItems(l.id)) }; }), '{N} gives the work held in each lane, including lanes left out (their work is kept).'));
        } else if (key === 'hfp') {
            var cov = safe(function () { return root.SLHfAuto.coverage(); }, []) || [];
            b.push(TBL('st-hf', 'The ten human factors steps and where they stand', cov.map(function (s) { return { Step: s.n + '. ' + s.title, Phase: s.phase || '', Answered: s.questions ? s.answered + ' of ' + s.questions : 'Nothing to ask yet', Open: String(s.open || 0), State: s.state || '' }; }), '{N} gives each step and how far it has got.'));
            b.push(figHfSteps(true));
        } else {
            if (PP()) b.push(TBL('st-ram', 'Reliability and maintainability work held', PP().CATALOGUE.filter(function (l) { return l.group === 'ram' && !l.parent; }).map(function (l) { return { Lane: l.name, 'In the program': laneOn(l.id) ? 'Yes' : 'No', 'Items held': String(laneItems(l.id)) }; }), '{N} gives the work held in each lane.'));
        }
        b.push(H(1, '3. Development assurance objectives'));
        b.push(TBL('st-obj', 'Where each objective stands', daCover(key === 'sspp' ? null : key).map(function (r) { return { Objective: r.id + ' ' + r.text, 'Where it stands': STATE_WORD[r.state] || r.state, Evidence: r.detail || '' }; }), '{N} gives where each objective stands on the evidence in the project.'));
        b.push(figObjectives(key));
        b.push(H(1, '4. Outputs and acceptance'));
        b.push(TBL('st-accept', 'Where each output stands', acceptance(key).map(function (o) { return { Output: o.what, State: o.state === 'accepted' ? 'Accepted' : o.state === 'reopened' ? 'Reopened: changed since it was accepted' : 'Not yet accepted', By: o.by || '', When: o.at ? String(o.at).slice(0, 10) : '' }; }), '{N} gives where each output the plan commits to stands.'));
        var gp = gaps(key);
        b.push(H(1, '5. Decisions still open in the plan'));
        b.push(gp.length ? TBL('st-open', 'Open decisions in the plan', gp.map(function (x, i) { return { '#': String(i + 1), Decision: x }; }), '{N} lists the plan\'s decisions not yet made.') : P('None: every decision in the plan is made.'));
        return number(b.filter(Boolean));
    }
    // number the tables and figures in order and put the number into each lead sentence (the Word writer numbers the same way)
    function number(blocks) {
        var t = 0, f = 0, out = [];
        blocks.forEach(function (b) {
            if (b.k === 'table') { t++; b.n = t; b.caption = 'Table ' + t + ': ' + b.title; if (b.lead) out.push(P(b.lead.replace('{N}', 'Table ' + t))); }
            if (b.k === 'fig') { f++; b.n = f; b.caption = 'Figure ' + f + ': ' + b.title; if (b.lead) out.push(P(b.lead.replace('{N}', 'Figure ' + f))); }
            out.push(b);
        });
        // a reference written into a sentence ({T:name}) becomes its number
        var nums = {}; out.forEach(function (b) { if ((b.k === 'table' || b.k === 'fig') && b.name) nums[(b.k === 'table' ? 'T:' : 'F:') + b.name] = (b.k === 'table' ? 'Table ' : 'Figure ') + b.n; });
        out.forEach(function (b) { if (b.k === 'p') b.text = b.text.replace(/Table \{T:([a-z\-]+)\}/g, function (m, n) { return nums['T:' + n] || 'the table below'; }).replace(/\{F:([a-z\-]+)\}/g, function (m, n) { return nums['F:' + n] || 'the figure below'; }); });
        return out;
    }
    function frontHtml(key, kind, blocks) {
        var plan = BY[key], isR = kind === 'status', title = isR ? plan.report : plan.title;
        var tbl = function (t) { var hd = t.rows.length ? Object.keys(t.rows[0]) : []; return '<div class="pla-cap">' + E(t.title) + '</div><table class="pla-dt"><thead><tr>' + hd.map(function (h) { return '<th>' + E(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + t.rows.map(function (r) { return '<tr>' + hd.map(function (h) { return '<td>' + E(r[h]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; };
        var hs = blocks.filter(function (b) { return b.k === 'h'; }), ts = blocks.filter(function (b) { return b.k === 'table'; }), fs = blocks.filter(function (b) { return b.k === 'fig'; });
        return '<div class="pla-cover" data-pla-cover="1"><div class="pla-ct">' + E(title) + '</div><div class="pla-cs">' + E(projName()) + '</div>' + coverTables(key, kind).map(tbl).join('') + '</div>'
            + '<div class="pla-front" data-pla-toc="1"><h3 class="pla-dh">Contents</h3>' + hs.map(function (h, i) { return '<div class="pla-tl"><a href="#pla-' + kind + '-h' + i + '">' + E(h.text) + '</a></div>'; }).join('')
            + '<h3 class="pla-dh">List of tables</h3>' + (ts.length ? ts.map(function (t) { return '<div class="pla-tl" data-pla-lot="1"><a href="#pla-' + kind + '-t' + t.n + '">' + E(t.caption) + '</a></div>'; }).join('') : '<p>None.</p>')
            + '<h3 class="pla-dh">List of figures</h3>' + (fs.length ? fs.map(function (f) { return '<div class="pla-tl" data-pla-lof="1"><a href="#pla-' + kind + '-f' + f.n + '">' + E(f.caption) + '</a></div>'; }).join('') : '<p>None.</p>') + '</div>';
    }
    function docHtml(blocks, kind) {
        var hi = 0; kind = kind || 'plan';
        return blocks.map(function (b) {
            if (b.k === 'h') return '<h3 class="pla-dh" id="pla-' + kind + '-h' + (hi++) + '">' + E(b.text) + '</h3>';
            if (b.k === 'p') return '<p class="' + (/To be decided|To be written/.test(b.text) ? 'pla-tbd' : '') + '"' + (b.q ? ' data-plap="' + E(b.q) + '"' : '') + '>' + E(b.text) + '</p>';
            if (b.k === 'fig') return '<div class="pla-fig" id="pla-' + kind + '-f' + b.n + '">' + b.svg + '</div><div class="pla-cap">' + E(b.caption) + '</div>';
            if (b.k === 'table') { var hd = b.rows.length ? Object.keys(b.rows[0]) : []; return '<div class="pla-cap" id="pla-' + kind + '-t' + b.n + '">' + E(b.caption) + '</div>' + (b.rows.length ? '<table class="pla-dt"><thead><tr>' + hd.map(function (h) { return '<th>' + E(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + b.rows.map(function (r) { return '<tr>' + hd.map(function (h) { return '<td>' + E(r[h]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' : '<p class="pla-tbd">(No entries)</p>'); }
            return '';
        }).join('');
    }
    function fullHtml(key, kind) { var bl = kind === 'status' ? statusDoc(key) : doc(key); return frontHtml(key, kind || 'plan', bl) + docHtml(bl, kind || 'plan'); }
    function model(key, kind) {
        var plan = BY[key], isR = kind === 'status', d = docCtl(key), bl = isR ? statusDoc(key) : doc(key);
        return { title: isR ? plan.report : plan.title, titleLines: [projName(), (isR ? d.no + '-SR' : d.no) + ' · ' + (isR ? 'Report of ' + today() : 'Revision ' + rev(key) + ' · ' + d.status)],
            cover: { tables: coverTables(key, kind) }, headerText: (isR ? d.no + '-SR' : d.no + ' Rev ' + rev(key)) + ' · ' + (isR ? plan.report : plan.title), projectName: projName(), sigFigs: 3,
            blocks: bl.map(function (b) { return b.k === 'fig' ? { k: 'img', caption: b.title, svg: b.svg, w: b.w, h: b.h } : b.k === 'table' ? { k: 'table', name: b.name, title: b.title, rows: b.rows } : b; }) };
    }
    async function word(key, kind) {
        var lib = typeof root._loadDocxLib === 'function' ? await root._loadDocxLib() : root.docx;
        if (!lib || !root.SLReportWriter) throw fail('The Word writer is not loaded in this build.');
        var m = model(key, kind), P0 = root.SLFtaPrint;
        for (var i = 0; i < m.blocks.length; i++) { var b = m.blocks[i]; if (b.k === 'img') { try { b.dataUrl = P0 && P0.png ? await P0.png({ svg: b.svg, w: b.w, h: b.h }, 3) : null; } catch (_) { b.dataUrl = null; } } }
        var blob = await root.SLReportWriter.docx(m, lib);
        try { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ((kind === 'status' ? docCtl(key).no + '-SR' : docCtl(key).no + ' Rev ' + rev(key)) + ' ' + (kind === 'status' ? BY[key].report : BY[key].title)).replace(/[^\w-]+/g, '_') + '.docx'; document.body.appendChild(a); a.click(); a.remove(); } catch (_) {}
        return blob;
    }
    function print(key, kind) { if (U()) U().openReport((kind === 'status' ? BY[key].report : BY[key].title) + ' · ' + projName(), '<style>.pla-dt{border-collapse:collapse;width:100%;font-size:11px}.pla-dt th,.pla-dt td{border:1px solid #999;padding:3px 5px;text-align:left}.pla-cap{font-weight:700;font-size:11px;margin:10px 0 4px}.pla-cover{page-break-after:always}.pla-front{page-break-after:always}.pla-ct{font-size:26px;font-weight:700;margin-top:80px}.pla-cs{font-size:15px;margin:6px 0 30px}.pla-fig svg{max-width:100%;height:auto}</style>' + fullHtml(key, kind)); }
    // ---- the diagrams (6 Nov 2026, Waqas: "for program planing I dont want just data flow choices, I want development
    // assurance choices and diagrams"): each drawn from the answers and the project, so it changes when they do. Plain
    // standalone svg (white background, no scripts): the same picture in the preview, in print and in Word.
    // two palettes (7 Nov 2026, "it looks so weird in dark mode" -> a dark page): the figures read C at draw time; the page
    // swaps in DARK only while it draws the preview in dark mode. Print and Word always get LIGHT.
    var LIGHT = { ink: '#101216', sub: '#5b6270', line: '#6b7280', on: '#1A6EF2', onF: '#EAF2FE', ok: '#1F7A33', okF: '#E8F4EA', warn: '#B26A00', warnF: '#FDF1DE', off: '#9aa1ad', offF: '#F3F4F6', tbd: '#9A3412', tbdF: '#FFF4ED',
        paper: '#ffffff', dev: '#E5E7EB', yel: '#FFF7C2', panel: '#F8FAFC', panelS: '#e3e5e8', funnel: '#D5D9E0', funnelT: '#4b5563', side: '#EEF0F3', sideS: '#c7cbd1', barT: '#ffffff', badge: '#101216', badgeT: '#ffffff' };
    var DARK = { ink: '#E8EAED', sub: '#B4BAC4', line: '#9AA1AD', on: '#6AA6FF', onF: '#172840', ok: '#5CC97A', okF: '#15301E', warn: '#E9A94A', warnF: '#33270F', off: '#7C8490', offF: '#1E2229', tbd: '#F2925F', tbdF: '#3A2015',
        paper: '#15181E', dev: '#2A2F38', yel: '#3A3416', panel: '#1B1F26', panelS: '#2E333C', funnel: '#252A32', funnelT: '#C2C8D1', side: '#1C2027', sideS: '#3A404A', barT: '#0B0D10', badge: '#E8EAED', badgeT: '#101216' };
    var C = LIGHT;
    function sx(s) { return E(s); }
    function svgWrap(w, h, body, title) { return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="' + sx(title) + '"><defs><marker id="pla-ah" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="' + C.line + '"/></marker><style>.pla-l{paint-order:stroke;stroke:' + C.paper + ';stroke-width:3.5px;stroke-linejoin:round}</style></defs><rect width="100%" height="100%" fill="' + C.paper + '"/>' + body + '</svg>', w: w, h: h }; }
    function wrapText(t, n) { var words = String(t || '').split(/\s+/), lines = [], cur = ''; words.forEach(function (w0) { if ((cur + ' ' + w0).trim().length > n && cur) { lines.push(cur); cur = w0; } else cur = (cur + ' ' + w0).trim(); }); if (cur) lines.push(cur); return lines; }
    // a box: kind 'on' (in the program, with work), 'ok', 'warn', 'off' (out of the program: dashed), 'tbd' (not decided)
    // which assessment or part of the program each diagram box stands for (by its title)
    var NODE_OF = { 'AFHA': 'afha', 'PASA': 'pasa', 'System FHAs': 'sfha', 'PSSA': 'pssa', 'PSSAs': 'pssa', 'SSA': 'ssa', 'SSAs': 'ssa', 'ASA': 'asa', 'Hardware and software': 'items', 'Common cause analyses': 'cca', 'FDAL and IDAL assignment': 'dal',
        'Zonal safety': 'zsa', 'Particular risks': 'pra', 'Common mode': 'cma', 'Independence ledger': 'ipledger', 'Aircraft functions and requirements': 'dev-func', 'Aircraft architecture, functions given to systems': 'dev-sys', 'System requirements': 'dev-req',
        'System architecture, requirements given to items': 'dev-items', 'Implementation': 'items', 'HF Autopilot analysis': 'hf', 'Failure rates': 'ram', 'Fault trees': 'pssa', 'Latent failures': 'ccmr', 'Reliability program': 'ram', 'CMRs': 'ccmr', 'Scheduled maintenance': 'ram-msg3', 'Maintainability': 'ram-mx', 'Dispatch relief': 'mmel', 'Test and service': 'ram',
        'Identification and baselines': 'cm', 'Archive and retrieval': 'cm', 'Interim configurations': 'cm', 'Design complete': 'cm', 'Configuration management of the safety data': 'cm', 'Write the plans': 'spp', 'Review the plans': 'spp', 'Development': 'dev-func', 'Correct and complete checks': 'validation', 'Approach by DAL': 'validation', 'Tests, analyses, reviews': 'vv-status', 'Results': 'vv-status', 'Verification plan': 'vv-status', 'Validation summary': 'validation', 'Verification summary': 'vv-status' };
    var NODE_TAB = { 'dev-func': 'ac-func', 'dev-sys': 'sys-dir', 'dev-req': 'ac-req', 'dev-items': 'items', cm: 'cm', spp: 'plan-auto', cma: 'cma', pra: 'pra', zsa: 'zsa', ipledger: 'ipledger', 'ram-msg3': 'ram-msg3', 'ram-mx': 'ram-mx', mmel: 'mmel', validation: 'validation', 'vv-status': 'vv-status', items: 'items' };
    function isDark() { return typeof document !== 'undefined' && !!document.body && document.body.classList.contains('theme-dark'); }
    var LIVE = false;   // set only while the page draws the preview with "show where the program stands" on: never in the plan, print or Word
    function nodeWrap(title, inner, x, y, w) { var id = NODE_OF[String(title).replace(/:.*$/, '')]; return id ? nodeWrapId(id, inner, x, y, w) : inner; }
    function nodeWrapId(id, inner, x, y, w) {
        var badge = '';
        if (LIVE) { var lv = safe(function () { return liveOf(id); }, ''); if (lv) { lv = String(lv).split(/ in |, /)[0]; if (lv.length * 5.6 + 10 > w - 8) lv = lv.replace(/ (aircraft|system) failure conditions$/, ' failure conditions').replace(/ failure conditions$/, ' FCs'); var bw = Math.min(w - 8, 10 + lv.length * 5.6); badge = '<rect x="' + (x + w - bw - 4) + '" y="' + (y - 9) + '" width="' + bw + '" height="17" rx="8.5" fill="' + C.badge + '"/><text x="' + (x + w - bw / 2 - 4) + '" y="' + (y + 3) + '" font-size="10" fill="' + C.paper + '" text-anchor="middle">' + sx(lv) + '</text>'; } }
        return '<g class="pla-node" data-node="' + id + '" style="cursor:pointer" onclick="SLPlanAuto.ui.node(\'' + id + '\')"><title>' + sx(nodeName(id)) + ': click for its inputs, outputs and where it stands</title>' + inner + badge + '</g>';
    }
    function box(x, y, w, h, title, sub, kind) {
        var st = { on: [C.on, C.onF], ok: [C.ok, C.okF], warn: [C.warn, C.warnF], off: [C.off, C.offF], tbd: [C.tbd, C.tbdF] }[kind || 'on'];
        var tl = wrapText(title, Math.max(8, Math.floor(w / 7.4))), sl = sub ? wrapText(sub, Math.max(10, Math.floor(w / 6.2))) : [];
        var lh = 14, total = tl.length * lh + sl.length * 12, y0 = y + h / 2 - total / 2 + 11;
        var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="' + st[1] + '" stroke="' + st[0] + '" stroke-width="1.4"' + (kind === 'off' || kind === 'tbd' ? ' stroke-dasharray="5 4"' : '') + '/>';
        tl.forEach(function (l, i) { s += '<text x="' + (x + w / 2) + '" y="' + (y0 + i * lh) + '" font-size="12.5" font-weight="700" fill="' + C.ink + '" text-anchor="middle">' + sx(l) + '</text>'; });
        sl.forEach(function (l, i) { s += '<text x="' + (x + w / 2) + '" y="' + (y0 + tl.length * lh + i * 12 + 1) + '" font-size="10.5" fill="' + C.sub + '" text-anchor="middle">' + sx(l) + '</text>'; });
        return nodeWrap(title, s, x, y, w);
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
        var sys = arr('systemsData').slice(0, 4).map(function (x) { return x.name || x.id; }), more = arr('systemsData').length > 4;
        var s = head('How the safety program is organized', v ? optLabelK('sspp.org', v) : 'To be decided'), W = 900;
        s += box(340, 55, 220, 46, owner.charAt(0).toUpperCase() + owner.slice(1), 'Owns this plan, signs changes', A('sspp.owner') ? 'on' : 'tbd');
        if (!v) { s += box(300, 140, 300, 60, 'How safety is organized', 'To be decided', 'tbd'); return Object.assign(svgWrap(W, 230, s, 'Organization'), { title: 'How the safety program is organized' }); }
        var mid = v === 'supplier' ? 'Program safety group' : 'Aircraft safety group', midSub = v === 'central' ? 'Leads every assessment' : v === 'embedded' ? 'Sets the methods; aircraft-level work' : 'Aircraft-level work; reviews and integrates';
        s += box(330, 135, 240, 60, mid, midSub, 'ok') + arrow(450, 101, 450, 135);
        var busY = 213;
        var n = sys.length + (more ? 1 : 0), gap = 14, bw = Math.min(170, Math.floor((W - 32 - (n - 1) * gap) / Math.max(1, n))), x0 = Math.max(16, (W - (n * bw + (n - 1) * gap)) / 2);
        if (v !== 'central') s += '<text class="pla-l" x="585" y="170" font-size="10.5" fill="' + C.sub + '">' + sx(v === 'embedded' ? 'Reviewed at each design review' : 'Results reviewed and integrated') + '</text>';
        sys.concat(more ? ['The other systems'] : []).forEach(function (nm, i) {
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
            s += '<text x="' + (x + 6) + '" y="' + (y + 14) + '" font-size="10.5" fill="' + (wm > 60 ? C.barT : C.ink) + '">' + gx.met + ' met, ' + gx.part + ' partly, ' + gx.open + ' not yet</text>';
            s += '<text x="' + (x + W + 16) + '" y="' + (y + 14) + '" font-size="11.5" fill="' + (gx.dec === gx.n ? C.ok : C.tbd) + '" font-weight="700">' + gx.dec + ' of ' + gx.n + ' decided</text>';
        });
        var h = 62 + grp.length * 34 + 30;
        s += legend(16, h - 22, [['ok', 'Met or signed'], ['warn', 'Partly met'], ['off', 'Not yet']]);
        var o0 = svgWrap(900, h, s, 'Objectives'); return { k: 'fig', name: 'st-objchart', title: 'Development assurance objectives, area by area', svg: o0.svg, w: o0.w, h: o0.h, lead: '{N} shows, area by area, where the objectives stand and how many of them the plan has decided.' };
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
    function figHfSteps(progress) {
        var cov = safe(function () { return root.SLHfAuto.coverage(); }, []) || [], st = safe(function () { return root.SLHfAuto.STAGES; }, []) || [];
        if (!cov.length && st.length) cov = st.map(function (x) { return { n: x.n, phase: x.phase, title: x.title, what: x.what, questions: 0, answered: 0, open: 0, state: '' }; });
        st.forEach(function (x) { var c0 = cov.filter(function (y) { return y.n === x.n; })[0]; if (c0 && !c0.what) c0.what = x.what; });
        var s = head(progress ? 'Where the human factors work stands' : 'The human factors work through the design cycle', progress ? 'Each step of the HF Autopilot, with how much of it is answered.' : 'Each step of the HF Autopilot, in the design phase it belongs to, and what it settles.');
        var phases = []; cov.forEach(function (c0) { if (phases.indexOf(c0.phase) < 0) phases.push(c0.phase); });
        var colW = 860 / Math.max(1, phases.length), bh = progress ? 52 : 70;
        phases.forEach(function (ph, pi) {
            var x = 20 + pi * colW, inPh = cov.filter(function (c0) { return c0.phase === ph; });
            s += '<rect x="' + x + '" y="56" width="' + (colW - 10) + '" height="' + (40 + inPh.length * (bh + 10)) + '" rx="10" fill="' + C.panel + '" stroke="' + C.panelS + '"/><text x="' + (x + 10) + '" y="76" font-size="12" font-weight="700" fill="' + C.sub + '">' + sx(ph) + '</text>';
            inPh.forEach(function (c0, i) {
                var kind = !progress ? 'on' : c0.state === 'done' ? 'ok' : c0.open ? 'warn' : c0.answered ? 'on' : 'off';
                var sub = progress ? ((c0.questions ? c0.answered + ' of ' + c0.questions + ' answered' : 'Nothing to ask yet') + (c0.open ? ', ' + c0.open + ' open' : '')) : (c0.what || '');
                s += box(x + 10, 88 + i * (bh + 10), colW - 30, bh, c0.n + '. ' + c0.title, sub, kind);
                if (i) s += poly([[x + colW / 2 - 5, 88 + i * (bh + 10) - 10], [x + colW / 2 - 5, 88 + i * (bh + 10)]]);
            });
        });
        var h = 56 + 40 + Math.max.apply(null, phases.map(function (ph) { return cov.filter(function (c0) { return c0.phase === ph; }).length; }).concat([1])) * (bh + 10) + 40;
        if (progress) s += legend(20, h - 24, [['ok', 'Signed'], ['warn', 'Has open items'], ['on', 'Started'], ['off', 'Not started']]);
        return { k: 'fig', name: progress ? 'hf-progress' : 'hf-steps', title: progress ? 'Where the human factors work stands' : 'The human factors work through the design cycle', svg: svgWrap(900, h, s, 'HF steps').svg, w: 900, h: h,
            lead: progress ? '{N} shows how far each step has got.' : '{N} shows the ten steps in the design phase each belongs to.' };
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
        var k = function (lane) { return planned(lane) ? 'on' : 'off'; }, rates = picked('ramp.rates').map(function (x) { return { supplier: 'supplier data', nprd: 'NPRD/EPRD', 217: '217F', fides: 'FIDES' }[x]; }).join(', ');
        s += box(20, 70, 190, 56, 'Failure rates', rates || 'Source to be decided', rates ? 'ok' : 'tbd') + arrow(210, 98, 250, 98);
        s += box(250, 70, 190, 56, 'Fault trees', 'PSSA and SSA', 'ok') + arrow(440, 98, 480, 98);
        s += box(480, 70, 190, 56, 'Latent failures', 'Check intervals (CCMR)', k('ccmr')) + arrow(670, 98, 710, 98);
        s += box(710, 70, 170, 56, 'CMRs', 'Kept apart in maintenance', planned('ccmr') ? 'on' : 'off');
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
        if (label) s = '<g><title>' + sx(label) + '</title>' + s + '</g>';
        if (label) { var lx = o.lx != null ? o.lx : (pts[0][0] + pts[1][0]) / 2, ly = o.ly != null ? o.ly : (pts[0][1] + pts[1][1]) / 2 - 4; wrapText(label, o.wrap || 30).forEach(function (l, i) { s += '<text class="pla-l" x="' + lx + '" y="' + (ly + i * 11) + '" font-size="9.5" fill="' + C.sub + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + '>' + sx(l) + '</text>'; }); }
        return s;
    }
    function dot(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="2.6" fill="' + C.line + '"/>'; }
    // a white box with a black edge (a safety assessment step), a grey one (development), or dashed (left out)
    function sbox(x, y, w, h, title, sub, kind, stack) {
        var fill = kind === 'dev' ? C.dev : kind === 'yel' ? C.yel : C.paper, st = kind === 'off' ? C.off : C.ink, dash = kind === 'off' || kind === 'tbd' ? ' stroke-dasharray="5 4"' : '';
        var s = '';
        if (stack) for (var i = 2; i >= 1; i--) s += '<rect x="' + (x + i * 5) + '" y="' + (y - i * 5) + '" width="' + w + '" height="' + h + '" fill="' + fill + '" stroke="' + st + '" stroke-width="1"' + dash + '/>';
        s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + (kind === 'off' ? C.offF : kind === 'tbd' ? C.tbdF : fill) + '" stroke="' + (kind === 'tbd' ? C.tbd : st) + '" stroke-width="1.2"' + dash + '/>';
        var tl = wrapText(title, Math.max(8, Math.floor(w / 7.6))), sl = sub ? wrapText(sub, Math.max(10, Math.floor(w / 5.6))) : [], tot = tl.length * 14 + sl.length * 11, y0 = y + h / 2 - tot / 2 + 11;
        tl.forEach(function (l, i) { s += '<text x="' + (x + w / 2) + '" y="' + (y0 + i * 14) + '" font-size="12.5" font-weight="700" fill="' + (kind === 'off' ? C.off : C.ink) + '" text-anchor="middle">' + sx(l) + '</text>'; });
        sl.forEach(function (l, i) { s += '<text x="' + (x + w / 2) + '" y="' + (y0 + tl.length * 14 + i * 11) + '" font-size="9.5" fill="' + (kind === 'tbd' ? C.tbd : C.sub) + '" text-anchor="middle">' + sx(l) + '</text>'; });
        return nodeWrap(title, s, x, y, w);
    }
    function methods(list) { var m = list.filter(function (x) { return planned(x[0]); }).map(function (x) { return x[1]; }); return m.length ? 'Methods: ' + m.join(', ') : 'No methods in the program'; }
    function toolOf(sec) { var t = safe(function () { return root.declaredToolchain(); }, null) || {}; var r = t[sec] || {}; return r.tool === 'other' ? (r.toolOther || '') : sec === 'rm' ? (RM_NAMES[r.tool] || '') : (MBSE_NAMES[r.tool] || ''); }

    // the safety assessment funnel through the development phases (the layout of ARP4761A Figures 1 and 3)
    function figFunnel() {
        var pasaNo = A('sspp.pasa') === 'none';
        var s = head('The safety assessment through the development phases', 'Down the left: aircraft, then systems, then items. Up the right: the results shown. Each box lists the methods this program uses there.');
        [['Concept', 20, 180], ['Preliminary and detailed design', 210, 350], ['Integration and verification', 570, 310]].forEach(function (p) { s += '<rect x="' + p[1] + '" y="54" width="' + p[2] + '" height="30" fill="' + C.dev + '" stroke="' + C.ink + '"/><text x="' + (p[1] + p[2] / 2) + '" y="74" font-size="12" font-weight="700" font-style="italic" fill="' + C.ink + '" text-anchor="middle">' + sx(p[0]) + '</text>'; });
        s += '<polygon points="20,96 880,96 560,450 340,450" fill="' + C.funnel + '"/>';
        s += '<text x="450" y="114" font-size="12.5" font-weight="700" fill="' + C.funnelT + '" text-anchor="middle">SAFETY ASSESSMENT</text><text x="450" y="132" font-size="11.5" font-style="italic" fill="' + C.funnelT + '" text-anchor="middle">Aircraft level</text><text x="560" y="300" font-size="11.5" font-style="italic" fill="' + C.funnelT + '" text-anchor="middle">System level</text><text x="450" y="430" font-size="11.5" font-style="italic" fill="' + C.funnelT + '" text-anchor="middle">Item level</text>';
        s += sbox(30, 140, 160, 44, 'AFHA', A('sspp.afha') ? ({ functions: 'From the function list', workshop: 'In workshops', both: 'Function list, then workshops', ai: 'AI draft, engineer review', own: 'The program\'s own way' }[A('sspp.afha')] || '') : 'How: to be decided', A('sspp.afha') ? 'w' : 'tbd');
        s += sbox(100, 208, 320, 46, 'PASA', pasaNo ? 'Not planned: tailored out' : methods([['cma', 'CMA'], ['pra', 'PRA'], ['zsa', 'ZSA'], ['fta', 'FTA'], ['cea', 'CEA']]) + combinedWords(), pasaNo ? 'off' : 'w');
        s += sbox(190, 282, 150, 44, 'System FHAs', A('sspp.sfha') ? ({ teams: 'By each system team', safety: 'By the safety group', supplier: 'By the suppliers', mixed: 'Set system by system', own: 'The program\'s own way' }[A('sspp.sfha')] || '') : 'Who: to be decided', A('sspp.sfha') ? 'w' : 'tbd', true);
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
        s += '<rect x="20" y="508" width="14" height="11" fill="' + C.dev + '" stroke="' + C.ink + '"/><text x="40" y="518" font-size="10.5" fill="' + C.sub + '">Development</text><rect x="140" y="508" width="14" height="11" fill="' + C.paper + '" stroke="' + C.ink + '"/><text x="160" y="518" font-size="10.5" fill="' + C.sub + '">Safety assessment</text><rect x="290" y="508" width="14" height="11" fill="' + C.offF + '" stroke="' + C.off + '" stroke-dasharray="3 2"/><text x="310" y="518" font-size="10.5" fill="' + C.sub + '">Left out of the program</text>';
        return Object.assign(svgWrap(900, 530, s, 'Safety assessment funnel'), { title: 'The safety assessment through the development phases' });
    }
    // the safety assessment beside the development process (the layout of ARP4754B Figure 6)
    function figModel() {
        var pasaNo = A('sspp.pasa') === 'none', mb = A('sspp.mbse') ? (MBSE_NAMES[A('sspp.mbse')] || '') : toolOf('mbse'), rm = A('sspp.rmtool') ? (RM_NAMES[A('sspp.rmtool')] || '') : toolOf('rm');
        var s = head('The safety assessment beside the development process', 'Left: safety assessment, with the common cause analyses. Right: development. The arrows are what passes between them.');
        s += '<line x1="440" y1="50" x2="440" y2="650" stroke="' + C.line + '" stroke-dasharray="10 6"/>';
        s += '<text x="250" y="666" font-size="11" font-style="italic" fill="' + C.sub + '" text-anchor="middle">Safety assessment</text><text x="680" y="666" font-size="11" font-style="italic" fill="' + C.sub + '" text-anchor="middle">Development</text>';
        s += '<rect x="500" y="56" width="380" height="580" fill="' + C.side + '" stroke="' + C.sideS + '"/>';
        // common cause panel
        s += '<rect x="20" y="150" width="120" height="400" fill="' + C.paper + '" stroke="' + C.ink + '"/><text x="80" y="174" font-size="11.5" font-style="italic" fill="' + C.ink + '" text-anchor="middle">Common cause</text><text x="80" y="188" font-size="11.5" font-style="italic" fill="' + C.ink + '" text-anchor="middle">analyses</text>';
        s += sbox(32, 210, 96, 60, 'Zonal safety', planned('zsa') ? 'Planned' : 'Not planned', planned('zsa') ? 'w' : 'off') + sbox(32, 300, 96, 60, 'Particular risks', planned('pra') ? 'Planned' : 'Not planned', planned('pra') ? 'w' : 'off') + sbox(32, 390, 96, 60, 'Common mode', planned('cma') ? 'Planned' : 'Not planned', planned('cma') ? 'w' : 'off');
        if (planned('ipledger')) s += sbox(32, 470, 96, 50, 'Independence ledger', '', 'w');
        // safety column
        s += sbox(200, 64, 160, 46, 'AFHA', '') + sbox(200, 154, 160, 46, 'PASA', pasaNo ? 'Tailored out' : '', pasaNo ? 'off' : 'w') + sbox(200, 254, 160, 46, 'System FHAs', A('sspp.sfha') ? optLabelK('sspp.sfha', A('sspp.sfha')) : 'Who: to be decided', 'w', true) + sbox(200, 364, 160, 46, 'PSSAs', A('sspp.pssa') ? optLabelK('sspp.pssa', A('sspp.pssa')) : 'Methods: to be decided', A('sspp.pssa') ? 'w' : 'tbd', true) + sbox(200, 464, 160, 46, 'SSAs', 'As-built results', 'w', true) + sbox(170, 570, 140, 46, 'ASA', 'Aircraft level');
        // development column
        s += sbox(520, 64, 340, 50, 'Aircraft functions and requirements', mb && mb !== 'None' && mb !== 'Not declared' ? 'From ' + mb : 'Written in Safety Lab', 'dev') + sbox(520, 150, 340, 54, 'Aircraft architecture, functions given to systems', '', 'dev') + sbox(520, 240, 340, 80, 'System requirements', rm && rm !== 'None' && rm !== 'Not declared' ? 'Managed in ' + rm : 'Kept in Safety Lab', 'dev') + sbox(520, 350, 340, 60, 'System architecture, requirements given to items', '', 'dev') + sbox(520, 450, 340, 50, 'Implementation', '', 'dev') + sbox(520, 560, 340, 56, 'System and aircraft integration and verification', A('sspp.test') ? optLabelK('sspp.test', A('sspp.test')) : '', 'dev');
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
        var v = A('sspp.dal'), iv = A('sspp.idal'), s = head('How the development assurance levels are assigned', 'Inputs on the left, the rules this program uses in the middle, what comes out on the right.');
        s += '<rect x="250" y="60" width="330" height="230" fill="none" stroke="' + C.ink + '" stroke-dasharray="9 6" stroke-width="1.4"/><text x="262" y="80" font-size="13" fill="' + C.ink + '">PASA and PSSA</text>';
        var rule = (v === 'indep' ? 'A level is lowered only where independence allows it, marked CMA pending until the common mode analysis confirms it.' : v === 'no' ? 'Every level is what the worst failure condition asks; none is lowered.' : 'Whether a level can be lowered: to be decided.') + ' ' + (iv === 'arch' ? 'Item levels from the architecture.' : iv === 'fdal' ? 'Items take their function\'s level.' : 'Item levels: to be decided.');
        s += sbox(330, 130, 210, 130, 'FDAL and IDAL assignment', rule, v && iv ? 'yel' : 'tbd');
        [['FHAs (aircraft, systems)', 'Failure conditions and classes', 96], ['Functions', 'Aircraft and system functions', 146], ['Operational requirements', '', 196], ['Proposed architecture', 'Systems and items', 246]].forEach(function (r) { s += '<text x="20" y="' + r[2] + '" font-size="12.5" fill="' + C.ink + '">' + sx(r[0]) + '</text>' + (r[1] ? '<text x="20" y="' + (r[2] + 13) + '" font-size="9.5" fill="' + C.sub + '">' + sx(r[1]) + '</text>' : '') + poly([[20, r[2] + 4], [250, r[2] + 4]], '', {}); });
        s += poly([[580, 96], [640, 96]]) + '<text x="648" y="100" font-size="12.5" fill="' + C.ink + '">Architecture confirmed or changed</text>';
        s += poly([[580, 146], [640, 146]]) + '<text x="648" y="150" font-size="12.5" fill="' + C.ink + '">Safety requirements</text>';
        s += poly([[540, 196], [640, 196]]) + '<text x="648" y="200" font-size="12.5" fill="' + C.ink + '">FDALs and IDALs</text><text x="660" y="216" font-size="11" fill="' + C.sub + '">for functions</text><text x="660" y="230" font-size="11" fill="' + C.sub + '">for electronic hardware</text><text x="660" y="244" font-size="11" fill="' + C.sub + '">for software</text>';
        s += poly([[415, 290], [415, 320], [200, 320], [200, 254]], 'Changes to the architecture', { lx: 230, ly: 334 });
        return Object.assign(svgWrap(900, 350, s, 'DAL assignment'), { title: 'How the development assurance levels are assigned' });
    }
    // the planning process (the layout of ARP4754B Figure 2), each step showing where this program stands
    function figPlanning() {
        var st = PLANS.map(function (p) { return status(p.key); }), open = st.reduce(function (n, x) { return n + x.miss + x.mm; }, 0);
        var s = head('How the plans are made', 'Each step shows where this program stands. The plans move to development once nothing is left to decide.');
        var row = [['Which plans, how written', 'SSPP, HF plan and RAM plan, written in the Plan Autopilot', true],
            ['Phases each plan covers', A('sspp.reviews') ? optLabelK('sspp.reviews', A('sspp.reviews')) : 'To be decided', !!A('sspp.reviews')],
            ['Transition criteria', A('sspp.transition') ? optLabelK('sspp.transition', A('sspp.transition')) : 'To be decided', !!A('sspp.transition')],
            ['How the plans relate', 'The HF and RAM plans sit under the SSPP', true],
            ['Deviations from the plans', A('sspp.owner') ? 'Signed by the ' + lcFirst(optLabelK('sspp.owner', A('sspp.owner')).replace(/^The /, '')) : 'Who signs: to be decided', !!A('sspp.owner')],
            ['Standards and processes', 'ARP4754B, ARP4761A, ' + (REG_SHORT[regNow()] || regNow()), true]];
        row.forEach(function (r, i) { var x = 16 + i * 147; s += sbox(x, 60, 132, 96, r[0], r[1], r[2] ? 'w' : 'tbd'); if (i < 5) s += poly([[x + 132, 108], [x + 147, 108]]); });
        s += poly([[16 + 5 * 147 + 132, 108], [880, 108], [880, 175], [60, 175], [60, 200]]);
        s += sbox(20, 200, 120, 60, 'Write the plans', 'In the Plan Autopilot') + poly([[140, 230], [170, 230]]) + sbox(170, 200, 140, 60, 'Review the plans', 'Accurate, consistent, complete') + poly([[310, 230], [340, 230]]);
        s += '<polygon points="400,190 460,230 400,270 340,230" fill="' + (open ? C.tbdF : C.okF) + '" stroke="' + (open ? C.tbd : C.ok) + '"/><text x="400" y="226" font-size="11" font-weight="700" fill="' + C.ink + '" text-anchor="middle">Every</text><text x="400" y="239" font-size="11" font-weight="700" fill="' + C.ink + '" text-anchor="middle">decision made?</text>';
        s += poly([[400, 270], [400, 290], [80, 290], [80, 260]], 'No: back to the decisions still open', { lx: 250, ly: 304, anchor: 'middle' });
        s += poly([[460, 230], [500, 230]], 'Yes', { lx: 466, ly: 224 }) + '<path d="M500,202 h150 v48 q-37,14 -75,0 t-75,0 z" fill="' + C.paper + '" stroke="' + C.ink + '"/><text x="575" y="222" font-size="11.5" font-weight="700" fill="' + C.ink + '" text-anchor="middle">Plans issued</text><text x="575" y="236" font-size="9.5" fill="' + C.sub + '" text-anchor="middle">Word, signed</text>';
        s += '<line x1="690" y1="185" x2="690" y2="285" stroke="' + C.line + '" stroke-dasharray="6 4"/>' + poly([[650, 228], [720, 228]]) + sbox(720, 200, 160, 60, 'Development', 'The work, held to the plans', 'dev', true);
        return Object.assign(svgWrap(900, 320, s, 'Planning process'), { title: 'How the plans are made' });
    }
    // validation and verification of the requirements (after the layout of ARP4754B Figures 8 and 9)
    function figVV() {
        var iv = A('sspp.indepvv'), ivTxt = iv ? 'At DAL A and B, done by ' + ({ peer: 'an engineer from another team', group: 'a separate V and V group', der: 'a DER or the customer' }[iv] || 'the program\'s own way') : 'Who checks independently: to be decided';
        var s = head('Validation and verification of the requirements', 'Left: what development hands over. Right: how the program checks the requirements are right (validation) and met (verification).');
        s += sbox(20, 60, 170, 120, 'Aircraft and system development', 'Requirements and their sources', 'w') + sbox(40, 200, 130, 34, 'Assumptions', '', 'w') + sbox(30, 250, 150, 40, 'Certification basis and standards', REG_SHORT[regNow()] || regNow(), 'w');
        s += '<line x1="220" y1="50" x2="220" y2="440" stroke="' + C.line + '" stroke-dasharray="10 6"/>';
        s += poly([[190, 120], [236, 120]], '', { end: false }) + poly([[170, 217], [236, 217]], '', { end: false }) + poly([[180, 270], [236, 270]], '', { end: false }) + poly([[236, 102], [236, 292]], '', { end: false }) + dot(236, 120) + dot(236, 217) + dot(236, 270) + poly([[236, 102], [260, 102]]) + poly([[236, 292], [260, 292]]);
        s += '<text x="260" y="70" font-size="12" font-weight="700" fill="' + C.ink + '">Validation</text>';
        s += sbox(260, 80, 120, 44, 'Tracking (start)', '') + poly([[380, 102], [410, 102]]) + sbox(410, 70, 170, 64, 'Correct and complete checks', ivTxt, iv ? 'w' : 'tbd') + poly([[580, 102], [610, 102]]) + sbox(610, 80, 120, 44, 'Tracking (end)', '') + poly([[730, 102], [760, 102]]) + sbox(760, 80, 120, 44, 'Validation summary', '');
        s += sbox(410, 150, 170, 44, 'Approach by DAL', A('sspp.valm') ? 'Methods: ' + lcFirst(optLabelK('sspp.valm', A('sspp.valm'))) : 'Methods: to be decided', A('sspp.valm') ? 'w' : 'tbd') + poly([[495, 150], [495, 134]]);
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
        s += fat(240, 180, 240, 210) + sbox(160, 210, 170, 90, 'Identification and baselines', cm ? 'Baselines ' + ({ reviews: 'at each design review', gates: 'at each signed gate', cert: 'at each submission' }[cm] || 'the program\'s own way') : 'When: to be decided', cm ? 'w' : 'tbd');
        s += fat(330, 250, 780, 250, true, 'Change control and problem reporting');
        s += fat(400, 250, 400, 300) + sbox(340, 300, 140, 60, 'Interim configurations', '') + fat(480, 330, 780, 330, true, 'Change control and problem reporting');
        s += fat(450, 360, 450, 390) + sbox(400, 390, 150, 56, 'Design complete', 'Final safety assessment') + fat(550, 418, 780, 418, false, 'Archive');
        s += sbox(780, 200, 100, 260, 'Archive and retrieval', cc ? ({ dal: 'Category 1 for DAL A and B data, 2 below', sc1: 'Category 1 for all' }[cc] || 'The program\'s own way') : 'Control category: to be decided', cc ? 'w' : 'tbd');
        return Object.assign(svgWrap(900, 470, s, 'Configuration management'), { title: 'Configuration management of the safety data' });
    }
    // which picture goes in which section
    // which picture goes in which section, each with the sentence that introduces it
    var LEAD = {
        'figBasis': ['basis', '{N} shows how the certification basis sets the classifications, targets and levels, and the analyses it expects.'],
        'figOrg': ['org', '{N} shows how the safety work will be organized.'],
        'figReviews': ['reviews', '{N} shows when the safety work will be presented, baselined and shown to the authority.'],
        'figFunnel': ['funnel', '{N} shows the assessments through the development phases, with the methods this plan sets for each.'],
        'figModel': ['model', '{N} shows the safety assessment beside the development process, and what will pass between them.'],
        'figAssign': ['assign', '{N} shows how the development assurance levels will be assigned, with the rules this plan sets.'],
        'figPlanning': ['planning', '{N} shows how the plans are made and when the work moves to development.'],
        'figVV': ['vv', '{N} shows how the requirements will be validated and verified.'],
        'figCm': ['cm', '{N} shows how the safety data will be controlled from the plan to the archive.'],
        'figHfEval': ['hf-eval', '{N} shows how the human factors claims will be shown, and who will evaluate them.'],
        'figRam': ['ram', '{N} shows how the reliability and maintainability work will feed the safety assessment and maintenance.']
    };
    function asFig(name, f) { var r = safe(f, null); if (!r) return null; if (r.k === 'fig') return r; var L = LEAD[name] || [name, '{N} is below.']; return { k: 'fig', name: L[0], title: r.title, svg: r.svg, w: r.w, h: r.h, lead: L[1] }; }
    function secFigs(key, sec) {
        var F = {
            sspp: { 'Certification basis and safety objectives': ['figBasis'], 'How the safety program is organized': ['figOrg'], 'Safety responsibilities': ['figReviews'], 'The safety assessment process and its methods': ['figFunnel', 'figModel', 'figAssign'], 'Development assurance': ['figPlanning', 'figVV'], 'Configuration management and records': ['figCm'] },
            hfp: { 'The human factors work through the design cycle': ['figHfSteps'], 'Evaluations and who does them': ['figHfEval'] },
            ramp: { 'Scope and purpose': ['figRam'] }
        };
        if (key === 'hfp' && A('hfp.need') === 'none') return [];
        var fns = { figBasis: figBasis, figOrg: figOrg, figReviews: figReviews, figFunnel: figFunnel, figModel: figModel, figAssign: figAssign, figPlanning: figPlanning, figVV: figVV, figCm: figCm, figHfSteps: function () { return figHfSteps(false); }, figHfEval: figHfEval, figRam: figRam };
        return ((F[key] || {})[sec] || []).map(function (n) { return asFig(n, fns[n]); }).filter(Boolean);
    }
    function combinedWords() { var v = picked('sspp.combined'); if (!v.length) return ''; return '; ' + listJoin(v.map(function (x) { return { interdep: 'interdependence', mac: 'MAC', coffe: 'CoFFE', own: 'own method' }[x]; })); }
    // the certification basis and what it sets (drawn from the basis the plan sets, with the same engine)
    function figBasis() {
        var cfg = plannedCfg(), r = canonReg(cfg.regulation || 'Part 25'), T = targetsFor(cfg), exp = expectedFor(cfg.regulation);
        var cls = r === 'Part 23' ? (cfg.part23Class ? 'Class ' + cfg.part23Class : 'Class to be decided') : r === 'Part 27' ? (cfg.part27Class ? 'Class ' + cfg.part27Class : 'Class to be decided') : r === 'SC-VTOL' ? (cfg.scvtolCategory || '') : '';
        var s = head('What the certification basis sets', 'The basis decides the classifications, the probability targets and the levels; Safety Lab applies them to the fault trees and the DAL assignment.');
        s += box(20, 70, 190, 70, REG_SHORT[r] || r, cls || (A('basis.reg') ? '' : 'From the project; not yet confirmed in this plan'), A('basis.reg') ? 'ok' : 'tbd');
        s += poly([[210, 105], [250, 105]]) + box(250, 70, 190, 70, 'Failure condition classifications', SEVS.slice(0, 4).join(', '), 'on');
        s += poly([[440, 105], [480, 105]]) + box(480, 60, 190, 90, 'Probability targets', T.slice(0, 4).map(function (t) { return t.sev.split(' ')[0] + ': ' + (t.prob != null && t.prob < 1 ? '1e' + Math.round(Math.log10(t.prob)) : 'none'); }).join(', '), 'on');
        s += poly([[670, 105], [710, 105]]) + box(710, 60, 170, 90, 'Development assurance levels', T.slice(0, 4).map(function (t) { return t.sev.split(' ')[0] + ': ' + (t.dal || '-'); }).join(', '), 'on');
        s += poly([[345, 140], [345, 190]]) + box(250, 190, 300, 64, 'Analyses the basis expects', exp.length ? exp.map(function (x) { return laneName(x).replace(/\s*\(.*$/, '').replace(/^CCA · /, ''); }).join(', ') : 'None beyond the core assessments', 'on');
        s += poly([[795, 150], [795, 222], [550, 222]], 'Rules Safety Lab enforces', { lx: 610, ly: 214 });
        s += box(590, 270, 290, 54, 'Fault trees checked against the targets', 'Each failure condition\'s tree must meet its target', 'on') + poly([[795, 222], [795, 270]], '', { end: true });
        return Object.assign(svgWrap(900, 340, s, 'Certification basis'), { title: 'What the certification basis sets' });
    }
    // status report only: failure conditions by the level their severity asks for
    function figDalStatus() {
        var by = { A: 0, B: 0, C: 0, D: 0 }, all = arr('acFhaData').concat(arr('systemsData').reduce(function (a, x) { return a.concat(Array.isArray(x.fha) ? x.fha : []); }, []));
        all.forEach(function (f) { var d = { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D' }[f.severity]; if (d) by[d]++; });
        var s = head('Failure conditions by the level their severity asks for', 'Read from the aircraft and system FHAs today.'), max = Math.max(1, by.A, by.B, by.C, by.D);
        ['A', 'B', 'C', 'D'].forEach(function (d, i) { var w = Math.round(560 * by[d] / max), yy = 60 + i * 30; s += '<text x="20" y="' + (yy + 13) + '" font-size="12" fill="' + C.ink + '">DAL ' + d + '</text><rect x="80" y="' + yy + '" width="560" height="18" rx="3" fill="' + C.offF + '"/><rect x="80" y="' + yy + '" width="' + w + '" height="18" rx="3" fill="' + C.on + '"/><text x="' + (88 + w) + '" y="' + (yy + 13) + '" font-size="12" fill="' + C.ink + '">' + by[d] + '</text>'; });
        var o = svgWrap(900, 190, s, 'DAL status');
        return { k: 'fig', name: 'st-dal', title: 'Failure conditions by the level their severity asks for', svg: o.svg, w: o.w, h: o.h, lead: '{N} shows the failure conditions in the project by the level their severity asks for.' };
    }

    // ---- the page ----------------------------------------------------------------------------------------------------
    var ui0 = { open: null, msg: null, view: 'plan', live: false, node: null, flash: null };
    var TONE = { 'not started': 'todo', open: 'open', apply: 'open', ready: 'ok' };
    function _style() {
        if (typeof document === 'undefined' || document.getElementById('pla-style')) return;
        var st = document.createElement('style'); st.id = 'pla-style';
        st.textContent = '.pla{font-size:13.5px}.pla-lead{font-size:13px;margin:0 0 14px}'
            + '.pla-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.pla-card{border:1px solid var(--color-border,#e3e5e8);border-radius:12px;padding:14px 16px;background:var(--color-surface-1,#fff);display:flex;flex-direction:column;gap:8px}'
            + '.pla-ch{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.pla-ch b{font-size:14.5px}.pla-ch .slap-pill{white-space:nowrap;flex:none}.pla-g{font-size:12px}.pla-meta{display:flex;gap:6px;flex-wrap:wrap}.pla-chip{font-size:11.5px;padding:2px 8px;border-radius:10px;background:#ECECEA;color:#101216}'
            + '.pla-cols{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:18px;align-items:start}@media (max-width:1100px){.pla-cols{grid-template-columns:1fr}}'
            + '.pla-right{position:sticky;top:8px}'
            // the plan page: its own colors, set here for both themes so the app's dark rules cannot reach in (7 Nov 2026)
            + '.pla .pla-prev{--pp-bg:#ffffff;--pp-ink:#101216;--pp-sub:#4b5563;--pp-line:#c7cbd1;--pp-hair:#e3e5e8;--pp-th:#EAF2F8;--pp-link:#0A4FB8;--pp-tbd:#9A3412;--pp-rule:#101216;--pp-flash:#FFF1A8}'
            + 'body.theme-dark .pla .pla-prev{--pp-bg:#15181E;--pp-ink:#E8EAED;--pp-sub:#B4BAC4;--pp-line:#3A404A;--pp-hair:#2E333C;--pp-th:#1F2A3A;--pp-link:#8DBBFF;--pp-tbd:#F2925F;--pp-rule:#9AA1AD;--pp-flash:#5A4A12}'
            + '.pla .pla-prev{max-height:80vh;overflow:auto;border:1px solid var(--pp-hair);border-radius:10px;padding:16px 20px;background:var(--pp-bg);color:var(--pp-ink);font-size:12.5px;line-height:1.5}'
            + '.pla .pla-prev h3,.pla .pla-prev h4,.pla .pla-prev p,.pla .pla-prev li,.pla .pla-prev b,.pla .pla-prev div{color:var(--pp-ink)}'
            + '.pla .pla-prev h3{font-size:15px;margin:16px 0 6px;background:none}.pla .pla-prev p{margin:0 0 8px}.pla .pla-prev .pla-tbd{color:var(--pp-tbd);font-style:italic}.pla .pla-prev .pla-cap{font-weight:700;font-size:11.5px;margin:10px 0 4px;color:var(--pp-ink)}'
            + '.pla-cover{border-bottom:2px solid var(--pp-rule);padding-bottom:14px;margin-bottom:14px}.pla-ct{font-size:22px;font-weight:700;margin-top:6px}.pla-cs{font-size:14px;margin:2px 0 10px}.pla-front{border-bottom:2px solid var(--pp-rule);padding-bottom:12px;margin-bottom:12px}.pla-tl{font-size:12px;margin:1px 0}.pla .pla-prev .pla-tl a,.pla .pla-prev a{color:var(--pp-link);text-decoration:none}'
            + '.pla-dt{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:10px}.pla .pla-prev .pla-dt tr,.pla .pla-prev .pla-dt td{background:var(--pp-bg);color:var(--pp-ink)}.pla .pla-prev .pla-dt th,.pla .pla-prev .pla-dt td{border:1px solid var(--pp-line);padding:4px 6px;text-align:left;vertical-align:top;font-family:inherit;text-transform:none;letter-spacing:normal}.pla .pla-prev .pla-dt th{background:var(--pp-th);color:var(--pp-ink);font-weight:700}'
            // the app's house rule paints every thead black with !important; the plan page is a document, so it wins back here
            + '.pla .pla-prev .pla-dt thead th,.pla .pla-prev .pla-dt th{background:var(--pp-th) !important;color:var(--pp-ink) !important;border:1px solid var(--pp-line) !important;font-family:inherit !important;text-transform:none !important;letter-spacing:normal !important;font-size:11.5px !important}'
            + '.pla-fig{margin:10px 0 2px;overflow-x:auto}.pla-fig svg{max-width:100%;height:auto;border:1px solid var(--pp-hair,#e3e5e8);border-radius:8px}'
            + '.pla-sech{font-weight:700;font-size:13px;margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--color-border,#e3e5e8)}'
            + '.pla-q{border:1px solid var(--color-border,#e3e5e8);border-left-width:3px;border-radius:10px;padding:10px 12px;margin:0 0 8px;background:var(--color-surface-1,#fff)}.pla-q.sub{position:relative}.pla-q.sub::before{content:"";position:absolute;left:-16px;top:-9px;width:12px;height:30px;border-left:2px solid var(--color-border-strong,#c7cbd1);border-bottom:2px solid var(--color-border-strong,#c7cbd1);border-bottom-left-radius:7px}.pla-q.gap{border-left:3px solid #B26A00}.pla-q.bad{border-left:3px solid #B42318}'
            + '.pla-qt{font-weight:600;margin-bottom:6px}.pla-q select,.pla-doc select,.pla-doc input,.pla-q textarea,.pla-q input[type=text]{font:inherit;font-size:13px;padding:6px 8px;border-radius:7px;border:1px solid var(--color-border-strong,#c7cbd1);max-width:100%;width:100%;background-color:var(--color-surface-1,#fff);color:inherit;box-sizing:border-box}.pla-q select,.pla-doc select{background-repeat:no-repeat;background-position:right 10px center;padding-right:28px}'
            + '.pla-q textarea{margin-top:6px;min-height:52px}.pla-chk{display:flex;flex-direction:column;gap:4px}.pla-chk label{display:flex;gap:6px;align-items:flex-start;font-size:13px}.pla-chk input{width:auto;margin-top:3px}.pla-chk label,.pla-chk label span{text-transform:none;letter-spacing:normal;font-weight:400;font-size:13px}'
            + '.pla-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;align-items:center}.pla-t{font-size:11px;padding:1px 7px;border-radius:9px;border:1px solid var(--color-border,#e3e5e8);white-space:nowrap}'
            + '.pla-t.set{background:rgba(26,110,242,.08);border-color:rgba(26,110,242,.3);color:#0A4FB8}.pla-t.da{background:rgba(31,122,51,.08);border-color:rgba(31,122,51,.3);color:#1F6B30;cursor:help}'
            + '.pla-t.tool{cursor:pointer;color:inherit;text-decoration:none}.pla-t.tool:hover{border-color:#1A6EF2}.pla-imp{font-size:12px;margin-top:5px}.pla-bad{font-size:12px;margin-top:6px;color:#B42318;font-weight:600}'
            + '.pla-box{border:1px solid var(--color-border,#e3e5e8);border-radius:10px;padding:10px 12px;margin:12px 0;background:var(--color-surface-1,#fff)}.pla-box h4{margin:0 0 6px;font-size:13px}'
            + '.pla-wt{width:100%;border-collapse:collapse;font-size:12.5px}.pla-wt th,.pla-wt td{border-top:1px solid var(--color-border,#e3e5e8);padding:5px 6px;text-align:left;vertical-align:top}.pla-wt th{font-size:11px;text-transform:uppercase;letter-spacing:.04em}'
            + 'body.theme-dark .pla-chip{background:#2A2F38;color:#E8EAED}body.theme-dark .pla-t.set{color:#8DBBFF;background:rgba(106,166,255,.12);border-color:rgba(106,166,255,.35)}body.theme-dark .pla-t.da{color:#7EDB98;background:rgba(92,201,122,.12);border-color:rgba(92,201,122,.35)}'
            + 'body.theme-dark .pla-chg{color:#8DBBFF}body.theme-dark .pla-bad{color:#FF8A80}body.theme-dark .pla-crumb{color:#8DBBFF}body.theme-dark .pla-opt.on{background:rgba(106,166,255,.10);border-color:#6AA6FF}body.theme-dark .pla-opt.on .pla-mk{border-color:#6AA6FF;background:#6AA6FF;box-shadow:inset 0 0 0 2.5px #15181E}body.theme-dark .pla-mk{border-color:#9AA1AD}'
            + 'body.theme-dark .pla-vt button.on{background:#E8EAED;color:#101216;border-color:#E8EAED}body.theme-dark .pla-msg{background:rgba(92,201,122,.12)}body.theme-dark .pla-msg.err{background:rgba(255,138,128,.12)}'
            + '.pla-chg{font-weight:600;color:#0A4FB8}.pla-acts{display:flex;gap:8px;flex-wrap:wrap}.pla-msg{font-size:12.5px;margin:8px 0;padding:8px 10px;border-radius:8px;background:rgba(31,122,51,.08)}.pla-msg.err{background:rgba(180,35,24,.08)}'
            + '.pla-crumb{font:inherit;font-size:12px;border:none;background:none;color:#1A6EF2;cursor:pointer;padding:0;margin-bottom:4px}'
            + '.pla-doc{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;align-items:end}.pla-doc label{font-size:11.5px;font-weight:600;display:block;margin-bottom:3px}'
            + '.pla-qx{font-size:12.5px;line-height:1.5;margin:0 0 8px}.pla-hint{font-weight:400;font-size:11.5px;margin-left:6px}.pla-opts{display:flex;flex-direction:column;gap:6px}'
            + '.pla-opt{font:inherit;text-align:left;display:flex;justify-content:flex-start;gap:10px;align-items:flex-start;width:100%;padding:9px 12px;border-radius:10px;border:1.5px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer}'
            + '.pla-opt:hover{border-color:#1A6EF2}.pla-opt.on{border-color:#1A6EF2;background:rgba(26,110,242,.06)}.pla-mk{flex:none;width:16px;height:16px;border-radius:50%;border:2px solid #6b7280;margin-top:2px;box-sizing:border-box}.pla-mk.sq{border-radius:4px}.pla-opt.on .pla-mk{border-color:#1A6EF2;background:#1A6EF2;box-shadow:inset 0 0 0 2.5px #fff}'
            + '.pla-ob{flex:1 1 auto;display:flex;flex-direction:column;gap:3px;min-width:0}.pla-ol{font-weight:600;font-size:13.5px}.pla-oe{font-size:12.5px;line-height:1.45}.pla-oc{font-size:12px}'
            + '.pla-prev{position:relative}.pla-flash{animation:plaFlash 2.2s ease-out}@keyframes plaFlash{0%,35%{background:var(--pp-flash,#FFF1A8);box-shadow:0 0 0 4px var(--pp-flash,#FFF1A8)}100%{background:transparent;box-shadow:none}}'
            + '.pla-node-panel{border-left:4px solid #1A6EF2}.pla-fig .pla-node:hover rect{stroke-width:2.4}'
            + '.pla-vt{display:flex;gap:4px;margin-bottom:6px}.pla-vt button{font:inherit;font-size:12.5px;padding:6px 12px;border:1px solid var(--color-border-strong,#c7cbd1);border-radius:8px;background:none;color:inherit;cursor:pointer}.pla-vt button.on{background:#101216;color:#fff;border-color:#101216}.pla-vt{flex-wrap:wrap}';
        document.head.appendChild(st);
    }
    function _cards() {
        var cov = daCover(null), withHow = cov.filter(function (r) { return r.how.length; }).length, withQ = cov.filter(function (r) { return r.qs.length; }).length;
        return '<p class="pla-lead">The program\'s three safety plans, written by answering questions, starting with the certification basis. Each answer goes into its plan. Answers marked <b>Sets Safety Lab</b> change Safety Lab once you apply the plan\'s settings, after you see each one as it is and as it will be. Each question shows the development assurance objectives it helps meet and the page that will hold the evidence. A plan says what the program will do; where the work stands is in each plan\'s status report.</p>'
            + '<div class="pla-cards">' + PLANS.map(function (p) {
                var st = status(p.key), d = docCtl(p.key);
                return '<div class="pla-card" data-placard="' + p.key + '"><div class="pla-ch"><b>' + E(p.code) + ' · ' + E(p.title) + '</b>' + (U() ? U().pill(TONE[st.state], st.label) : E(st.label)) + '</div><div class="pla-g">' + E(d.no) + ' · Revision ' + E(rev(p.key)) + ' · ' + E(d.status) + '</div><div class="pla-g">' + E(p.basis) + '</div>'
                    + '<div class="pla-meta"><span class="pla-chip">' + st.n + ' questions</span>' + (st.miss ? '<span class="pla-chip">' + st.miss + ' to answer</span>' : '') + (st.mm ? '<span class="pla-chip">' + st.mm + ' to fix</span>' : '') + (st.apply ? '<span class="pla-chip">' + st.apply + ' to apply</span>' : '') + '</div>'
                    + '<div><button type="button" class="slap-btn p" onclick="SLPlanAuto.ui.open(\'' + p.key + '\')">Open</button></div></div>';
            }).join('') + '</div>'
            + '<div class="pla-box" data-pla-da="1"><h4>Development assurance objectives</h4><div class="pla-g">' + withHow + ' of ' + withQ + ' objectives the plans answer have an answer that says how the program will meet them. The rest of the ' + cov.length + ' are met by the work itself (see the <a href="javascript:void(0)" onclick="switchTab(\'appa\')">Objectives matrix</a>).</div></div>';
    }
    // 7 Nov 2026 ("show indentations when needed"): a follow-up sits right under the question it follows from, one step in
    // per level; every other question stays flush. Only on the page: the plan's own order does not change.
    function nest(sq) {
        var keys = sq.map(function (q) { return q.k; }), out = [];
        function kids(k) { return sq.filter(function (q) { return q.parent === k; }); }
        function put(q, d) { out.push({ q: q, depth: d }); kids(q.k).forEach(function (c) { put(c, d + 1); }); }
        sq.forEach(function (q) { if (!q.parent || keys.indexOf(q.parent) < 0) put(q, 0); });
        return out;
    }
    function _qHtml(q, depth) {
        depth = depth || 0;
        var v = A(q.k), s = store(), multi = q.type === 'checks', daTxt = function (id) { var o = objectives().filter(function (x) { return x.id === id; })[0]; return o ? id + ': ' + o.text : id; };
        var cards = q.opts.map(function (o) {
            var on = has(q.k, o[0]), ex = exO(q, o[0]);
            return '<button type="button" class="pla-opt' + (on ? ' on' : '') + (multi ? ' multi' : '') + '" role="' + (multi ? 'checkbox' : 'radio') + '" aria-checked="' + on + '" data-plaopt="' + E(q.k + '|' + o[0]) + '" onclick="SLPlanAuto.ui.' + (multi ? 'toggle' : 'pick') + '(\'' + E(q.k) + '\',\'' + E(o[0]) + '\')">'
                + '<span class="pla-mk' + (multi ? ' sq' : '') + '"></span><span class="pla-ob"><span class="pla-ol">' + E(o[1]) + '</span>' + (ex ? '<span class="pla-oe">' + E(ex) + '</span>' : '') + (o[2] && (q.set || /reason/i.test(o[2])) ? '<span class="pla-oc"><b>What this changes:</b> ' + E(o[2]) + '</span>' : '') + '</span></button>';
        }).join('');
        var ownBox = has(q.k, 'own') ? '<textarea data-plaown="' + E(q.k) + '" placeholder="How the program will do it, in your own words (it goes into the plan as written)" onchange="SLPlanAuto.ui.own(\'' + E(q.k) + '\', this.value)">' + E(s.own[q.k] || '') + '</textarea>' : '';
        var whyBox = picked(q.k).some(function (x) { return (q.reasonFor || []).indexOf(x) >= 0; }) ? '<textarea data-plawhy="' + E(q.k) + '" placeholder="The reason (it goes into the plan and the tailoring section)" onchange="SLPlanAuto.ui.why(\'' + E(q.k) + '\', this.value)">' + E(s.why[q.k] || '') + '</textarea>' : '';
        var bad = v && q.need ? safe(function () { return q.need(v); }, '') : '';
        return '<div class="pla-q' + (depth ? ' sub' : '') + (bad ? ' bad' : complete(q) ? '' : ' gap') + '" data-plaqbox="' + E(q.k) + '" data-pladepth="' + depth + '"' + (depth ? ' style="margin-left:' + (depth * 26) + 'px"' : '') + ' id="pla-q-' + E(q.k.replace(/\W/g, '-')) + '"><div class="pla-qt">' + E(q.text) + (multi ? ' <span class="pla-hint">Pick all that apply</span>' : '') + '</div>'
            + (exQ(q) ? '<div class="pla-qx">' + E(exQ(q)) + '</div>' : '') + '<div class="pla-opts" role="' + (multi ? 'group' : 'radiogroup') + '">' + cards + '</div>' + ownBox + whyBox
            + (bad ? '<div class="pla-bad" data-plabad="' + E(q.k) + '">' + E(bad) + '</div>' : '')
            + '<div class="pla-tags">' + (q.set ? '<span class="pla-t set">Sets Safety Lab</span>' : '<span class="pla-t">Written into the plan</span>')
            + q.da.map(function (id) { return '<span class="pla-t da" title="' + E(daTxt(id)) + '">Meets ' + E(id) + '</span>'; }).join('')
            + q.tools.map(function (t) { return '<a class="pla-t tool" href="javascript:void(0)" onclick="switchTab(\'' + E(t) + '\')" title="Open the page the evidence will be on">' + E(pageName(t)) + ' &rarr;</a>'; }).join('')
            + (v ? '<a class="pla-t" href="javascript:void(0)" onclick="SLPlanAuto.ui.jump(\'' + E(q.k) + '\')" title="Show what this answer wrote into the plan">See it in the plan &rarr;</a>' : '')
            + (!complete(q) ? '<span class="pla-t" style="color:#9A3412">' + (A(q.k) ? (needsWhy(q) ? 'Reason to write' : 'Own way to write') : 'Gap: not answered') + '</span>' : '') + '</div></div>';
    }
    // the box a diagram node opens: what the assessment needs and produces, and (because the user asked) where it stands
    function _nodePanel() {
        var id = ui0.node; if (!id) return '';
        var mem = membersOf(id), a = assessmentOf(id), tab = (a && a.tab) || NODE_TAB[id] || (mem[0] && mem[0].tab) || '', lv = safe(function () { return liveOf(id); }, '');
        var ioOf = function (x) {
            var ins = x.inputs.map(function (i) { return '<li>' + E(i[0]) + ' <span class="pla-g">(from ' + E(nameIn(i[1], x.plan)) + ')</span></li>'; }).join('');
            var outs = x.outputs.map(function (o) { return '<li>' + E(o.what) + ' <span class="pla-g">(to ' + E(listJoin(o.to.map(function (t) { return nameIn(t, x.plan); }))) + ')</span><div class="pla-g">Accepted when: ' + E(o.accept) + '</div></li>'; }).join('');
            return (mem.length > 1 || !a ? '<div style="margin-top:8px"><b>' + E(x.name) + '</b> <span class="pla-g">' + E(x.does) + '</span></div>' : '<div class="pla-g" style="margin-top:4px">' + E(x.does) + '</div>')
                + (ins ? '<div style="margin-top:6px"><b>Inputs it needs</b><ul style="margin:2px 0 0;padding-left:18px">' + ins + '</ul></div>' : '')
                + (outs ? '<div style="margin-top:6px"><b>Outputs it must produce</b><ul style="margin:2px 0 0;padding-left:18px">' + outs + '</ul></div>' : '');
        };
        var inEx = exchanges().filter(function (x) { return x.to === id; }), outEx = exchanges().filter(function (x) { return x.from === id; });
        return '<div class="pla-box pla-node-panel" data-pla-node="' + E(id) + '"><div class="pla-ch"><h4>' + E(nodeName(id)) + '</h4><span class="pla-acts">' + (tab ? '<button type="button" class="slap-btn p" onclick="switchTab(\'' + E(tab) + '\')">Open ' + E(pageName(tab)) + '</button>' : '') + '<button type="button" class="slap-btn" onclick="SLPlanAuto.ui.node(null)">Close</button></span></div>'
            + '<div class="pla-g" data-pla-nodelive="1"><b>Where it stands now:</b> ' + E(lv || 'Nothing recorded yet') + ' <span class="pla-g">(shown here on request; never written into the plan)</span></div>'
            + mem.map(ioOf).join('')
            + (!mem.length && (inEx.length || outEx.length) ? '<div style="margin-top:6px"><b>Data exchanged</b><ul style="margin:2px 0 0;padding-left:18px">' + inEx.map(function (x) { return '<li>From ' + E(nodeName(x.from)) + ': ' + E(x.what) + '</li>'; }).join('') + outEx.map(function (x) { return '<li>To ' + E(nodeName(x.to)) + ': ' + E(x.what) + '</li>'; }).join('') + '</ul></div>' : '')
            + (GROUPS[id] && !mem.length ? '<div class="pla-g" style="margin-top:6px">None of this work is in the program as the plan stands.</div>' : '')
            + '</div>';
    }
    function _acceptBox(key) {
        var L = acceptance(key); if (!L.length) return '';
        return '<div class="pla-box" data-pla-accept="1"><h4>4. Outputs to accept</h4><div class="pla-g" style="margin-bottom:6px">The outputs this plan commits to. Accept each when it meets its criteria; a change to an accepted output reopens it. Where each stands is kept in Safety Lab and the status report, never in the plan.</div><table class="pla-wt"><thead><tr><th>Output</th><th>Accepted when</th><th>State</th><th></th></tr></thead><tbody>'
            + L.map(function (o) { var pill = o.state === 'accepted' ? '<span class="slap-pill ok">Accepted</span>' : o.state === 'reopened' ? '<span class="slap-pill open">Reopened</span>' : '<span class="slap-pill todo">Open</span>'; return '<tr data-pla-out="' + E(o.id) + '"><td><b>' + E(o.what) + '</b><div class="pla-g">' + E(o.from) + ' · due ' + E(o.due) + ' · ' + E(o.role) + '</div></td><td class="pla-g">' + E(o.accept) + '</td><td>' + pill + (o.by ? '<div class="pla-g">' + E(o.by) + ' ' + E(String(o.at || '').slice(0, 10)) + '</div>' : '') + '</td><td>' + (o.state === 'accepted' ? '<button type="button" class="slap-btn" onclick="SLPlanAuto.ui.unaccept(\'' + E(o.id) + '\')">Undo</button>' : '<button type="button" class="slap-btn p" onclick="SLPlanAuto.ui.accept(\'' + E(o.id) + '\')">Accept</button>') + ' <a href="javascript:void(0)" onclick="switchTab(\'' + E(o.tab) + '\')">Open</a></td></tr>'; }).join('') + '</tbody></table></div>';
    }
    function _docPanel(key) {
        var d = docCtl(key), sel = function (f, list, cur, ph) { return '<select data-pladocf="' + f + '" onchange="SLPlanAuto.ui.doc(\'' + key + '\',\'' + f + '\', this.value)">' + (ph ? '<option value="">' + E(ph) + '</option>' : '') + list.map(function (x) { return '<option' + (x === cur ? ' selected' : '') + '>' + E(x) + '</option>'; }).join('') + '</select>'; };
        return '<div class="pla-box" data-pla-docctl="1"><h4>Document control</h4><div class="pla-doc">'
            + '<div><label>Document number</label><input type="text" value="' + E(d.no) + '" onchange="SLPlanAuto.ui.doc(\'' + key + '\',\'no\', this.value)"></div>'
            + '<div><label>Status</label>' + sel('status', DOC_STATUS, d.status) + '</div>'
            + '<div><label>Prepared by (role)</label>' + sel('prep', ROLES, d.prep, 'To be named') + '</div>'
            + '<div><label>Reviewed by (role)</label>' + sel('rev', ROLES, d.rev, 'To be named') + '</div>'
            + '<div><label>Approved by (role)</label>' + sel('appr', ROLES, d.appr, 'To be named') + '</div>'
            + '<div><label>Revision ' + E(rev(key)) + '</label><button type="button" class="slap-btn" onclick="SLPlanAuto.ui.issue(\'' + key + '\')">' + (d.issues.length ? 'Issue a new revision' : 'Issue revision A') + '</button></div>'
            + '</div><div class="pla-g" style="margin-top:6px">One new revision per issue. Issuing again on the same day updates that day\'s issue rather than adding another.</div></div>';
    }
    function _plan(key) {
        var plan = BY[key], st = status(key), qs = questions(key), w = wires(key), todo = w.filter(function (x) { return !x.same; }), gp = gaps(key), da = daCover(key), mm = mismatches(key), view = ui0.view === 'status' ? 'status' : 'plan';
        var h = '<button type="button" class="pla-crumb" onclick="SLPlanAuto.ui.open(null)">&larr; Plan Autopilot</button>'
            + '<div class="slap-head"><span class="slap-title">' + E(plan.code) + ' · ' + E(plan.title) + '</span>' + (U() ? U().pill(TONE[st.state], st.label) : '') + '</div>'
            + '<div class="pla-g" style="margin-bottom:8px">' + E(plan.basis) + '.</div>'
            + (ui0.msg ? '<div class="pla-msg' + (ui0.msg.err ? ' err' : '') + '">' + E(ui0.msg.text) + '</div>' : '');
        h += '<div class="pla-cols"><div class="pla-left">' + _docPanel(key);
        h += '<div class="pla-sech" style="margin-top:4px">1. Questions <span class="pla-g" style="font-weight:400">' + qs.filter(complete).length + ' of ' + qs.length + ' answered, grouped by the section of the plan each answer is written into</span></div>';
        plan.secs.forEach(function (sec) {
            var sq = qs.filter(function (q) { return q.sec === sec; }); if (!sq.length) return;
            h += '<div class="pla-sech" data-plasec="' + E(sec) + '">' + E(sec) + '</div>' + nest(sq).map(function (x) { return _qHtml(x.q, x.depth); }).join('');
            if (sec === 'Certification basis and safety objectives') h += '<div class="pla-g" style="margin:-2px 0 8px">The severity definitions, special conditions for a custom basis, and the full target tables stay on the <a href="javascript:void(0)" onclick="switchTab(\'defs\')">certification basis page</a>; the answers here write to the same place.</div>';
        });
        h += '<div class="pla-box" data-pla-wires="1"><div class="pla-ch"><h4>2. What it sets in Safety Lab</h4><button type="button" class="slap-btn p" onclick="SLPlanAuto.ui.apply(\'' + key + '\')"' + (todo.length ? '' : ' disabled') + '>Apply ' + todo.length + ' setting' + (todo.length === 1 ? '' : 's') + '</button></div>'
            + (w.length ? '<table class="pla-wt"><thead><tr><th>Setting</th><th>Now</th><th>After applying</th></tr></thead><tbody>' + w.map(function (x) { return '<tr' + (x.info ? ' data-plainfo="1"' : '') + '><td>' + E(x.what) + '</td><td>' + E(x.now) + '</td><td' + (x.info || !x.same ? ' class="pla-chg"' : '') + '>' + E(x.after) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="pla-g">Nothing in this plan sets Safety Lab.</div>')
            + '<div class="pla-g" style="margin-top:6px">A lane turned off keeps all its data. An expected lane that holds work is turned off with a signed tailoring entry naming this plan\'s answer and its reason. Lines that follow the certification basis (targets, levels, expected analyses) change with it.</div></div>';
        if (mm.length) h += '<div class="pla-box" data-pla-mm="1"><h4>Picks that do not work together (' + mm.length + ')</h4><ul style="margin:0;padding-left:18px">' + mm.map(function (x) { return '<li><b>' + E(x.q) + '</b> ' + E(x.msg) + '</li>'; }).join('') + '</ul></div>';
        h += '<div class="pla-box" data-pla-dacov="1"><h4>3. Development assurance objectives this plan covers</h4><table class="pla-wt"><thead><tr><th>Objective</th><th>How the program will meet it</th><th>Evidence will be on</th></tr></thead><tbody>'
            + da.map(function (r) { return '<tr><td title="' + E(r.text) + '"><b>' + E(r.id) + '</b> ' + E(r.text) + '</td><td>' + (r.how.length ? E(r.how.join('; ')) : '<span class="pla-tbd">To be decided</span>') + '</td><td>' + r.tools.map(function (t) { return '<a href="javascript:void(0)" onclick="switchTab(\'' + E(t) + '\')">' + E(pageName(t)) + '</a>'; }).join(', ') + '</td></tr>'; }).join('') + '</tbody></table></div>';
        h += _acceptBox(key);
        if (gp.length) h += '<div class="pla-box" data-pla-gaps="1"><h4>To be decided (' + gp.length + ')</h4><ul style="margin:0;padding-left:18px">' + gp.map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul></div>';
        h += '</div><div class="pla-right"><div class="pla-vt"><button type="button" class="' + (view === 'plan' ? 'on' : '') + '" data-plaview="plan" onclick="SLPlanAuto.ui.view(\'plan\')">The plan</button><button type="button" class="' + (view === 'status' ? 'on' : '') + '" data-plaview="status" onclick="SLPlanAuto.ui.view(\'status\')">' + E(plan.report) + '</button><span style="flex:1"></span>'
            + (view === 'plan' ? '<button type="button" class="' + (ui0.live ? 'on' : '') + '" data-plalive="1" onclick="SLPlanAuto.ui.live()" title="Show where the program stands on the diagrams. Never written into the plan.">' + (ui0.live ? 'Hide where the program stands' : 'Show where the program stands') + '</button>' : '')
            + '<button type="button" onclick="SLPlanAuto.ui.word(\'' + key + '\',\'' + view + '\')">Word (.docx)</button><button type="button" onclick="SLPlanAuto.print(\'' + key + '\',\'' + view + '\')">Print</button></div>'
            + _nodePanel() + '<div class="pla-prev" data-pladoc="1" data-plakind="' + view + '">' + (function () { LIVE = !!ui0.live && view === 'plan'; C = isDark() ? DARK : LIGHT; try { return fullHtml(key, view); } finally { LIVE = false; C = LIGHT; } })() + '</div></div></div>';
        return h;
    }
    function render() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('plan-auto-host'); if (!host) return;
        if (U()) U().style(); _style(); forget();
        var pv0 = document.querySelector('[data-pladoc]'), scroll = pv0 ? pv0.scrollTop : 0;
        host.innerHTML = '<div class="pla">' + (ui0.open && BY[ui0.open] ? _plan(ui0.open) : _cards()) + '</div>';
        var pv = document.querySelector('[data-pladoc]'); if (pv) pv.scrollTop = scroll;
        if (ui0.flash) { var k = ui0.flash; ui0.flash = null; flash(k); }
    }
    // scroll the preview to the sentence an answer wrote, and light it up
    function flash(k) {
        if (typeof document === 'undefined') return false;
        var pv = document.querySelector('[data-pladoc]'); if (!pv) return false;
        var el = pv.querySelector('[data-plap="' + k + '"]'); if (!el) return false;
        pv.scrollTop = Math.max(0, el.offsetTop - 90);
        el.classList.remove('pla-flash'); void el.offsetWidth; el.classList.add('pla-flash');
        return true;
    }
    var ui = {
        open: function (k) { ui0.open = k || null; ui0.msg = null; render(); try { var v = document.getElementById('view-plan-auto'); if (v && v.scrollIntoView) v.scrollIntoView({ block: 'start' }); } catch (_) {} },
        pick: function (k, v) { try { answer(k, v); ui0.msg = null; ui0.flash = k; if (ui0.view === 'status') ui0.view = 'plan'; } catch (e) { ui0.msg = { text: e.message, err: true }; } render(); },
        toggle: function (k, o) { try { toggle(k, o); ui0.msg = null; ui0.flash = k; if (ui0.view === 'status') ui0.view = 'plan'; } catch (e) { ui0.msg = { text: e.message, err: true }; } render(); },
        own: function (k, t) { setOwn(k, t); ui0.flash = k; render(); },
        why: function (k, t) { setWhy(k, t); ui0.flash = k; render(); },
        jump: function (k) { if (ui0.view !== 'plan') { ui0.view = 'plan'; ui0.flash = k; render(); } else flash(k); },
        node: function (id) { ui0.node = id || null; render(); try { var np = document.querySelector('[data-pla-node]'); if (np && np.scrollIntoView) np.scrollIntoView({ block: 'nearest' }); } catch (_) {} },
        live: function () { ui0.live = !ui0.live; render(); },
        accept: function (id) { try { acceptOutput(id); ui0.msg = null; } catch (e) { ui0.msg = { text: e.message, err: true }; } render(); },
        unaccept: function (id) { unacceptOutput(id); render(); },
        doc: function (key, f, v) { try { setDoc(key, f, v); ui0.msg = null; } catch (e) { ui0.msg = { text: e.message, err: true }; } render(); },
        issue: function (key) { var it = issue(key); ui0.msg = { text: 'Issued revision ' + it.rev + ' (' + it.date + ').' }; render(); },
        view: function (v) { ui0.view = v === 'status' ? 'status' : 'plan'; render(); },
        apply: function (key) { var r = apply(key); ui0.msg = { text: (r.done.length ? 'Applied: ' + r.done.join('; ') + '.' : 'Nothing to apply.') + (r.errs.length ? ' Not applied: ' + r.errs.join('; ') : ''), err: !!r.errs.length }; render(); },
        word: function (key, kind) { word(key, kind).catch(function (e) { ui0.msg = { text: 'Could not write the Word file: ' + (e && e.message || e), err: true }; render(); }); }
    };
    function mount() {
        if (typeof document === 'undefined') return false;
        var v = document.getElementById('view-plan-auto'); if (!v) return false;
        var host = document.getElementById('plan-auto-host'); if (!host) { host = document.createElement('div'); host.id = 'plan-auto-host'; v.appendChild(host); }
        if (!v._plaObs && typeof MutationObserver === 'function') {
            var shown0 = v.style.display !== 'none' && v.style.display !== '';
            v._plaObs = new MutationObserver(function () { var nowS = v.style.display !== 'none'; if (nowS && !shown0) { try { render(); } catch (e) { try { console.warn('[plan-autopilot]', e); } catch (_) {} } } shown0 = nowS; });
            v._plaObs.observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
            if (shown0) render();
            // the theme switch redraws the open preview so its figures take the other palette
            var dark0 = isDark(); new MutationObserver(function () { var d = isDark(); if (d !== dark0) { dark0 = d; if (v.style.display !== 'none') { try { render(); } catch (_) {} } } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
        return true;
    }
    if (typeof document !== 'undefined') { var tries = 40, t0 = setInterval(function () { if (mount() || --tries <= 0) clearInterval(t0); }, 250); }
    root.SLPlanAuto = { VERSION: VERSION, PLANS: PLANS, BY: BY, QBY: QBY, answer: answer, toggle: toggle, setOwn: setOwn, setWhy: setWhy, wires: wires, apply: apply, status: status, gaps: gaps, mismatches: mismatches, complete: complete,
        daCover: daCover, doc: doc, statusDoc: statusDoc, docHtml: docHtml, fullHtml: fullHtml, model: model, word: word, print: print, render: render, ui: ui, state: ui0, questions: questions,
        plannedCfg: plannedCfg, targetsFor: targetsFor, assessments: assessments, exchanges: exchanges, outputsOf: outputsOf, acceptance: acceptance, acceptOutput: acceptOutput, liveOf: liveOf, EX: EX, flash: flash, planned: planned, procRows: procRows, docCtl: docCtl, issue: issue, setDoc: setDoc, rev: rev, ROLES: ROLES, forget: forget };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLPlanAuto;
})(typeof window !== 'undefined' ? window : globalThis);
