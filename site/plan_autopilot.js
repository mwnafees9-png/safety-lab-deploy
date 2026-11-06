// plan_autopilot.js (SLPlanAuto v2.0, 6 Nov 2026): the Plan Autopilot. The program's three safety plans, written by
// answering questions, with the same layout as the Sys Lab Planning Autopilot.
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
    var VERSION = '2.0';
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
    function probWords(x) { if (x == null || !(x < 1)) return 'No numerical target'; var e = Math.round(Math.log10(x)), m = x / Math.pow(10, e); return 'Less than ' + (Math.abs(m - 1) < 1e-9 ? '' : (Math.round(m * 10) / 10) + ' x ') + '10^' + e + ' per flight hour'; }
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
    //   o.when(): asked only when it applies; o.own === false: no "our own way" choice; o.reasonFor: the answers that need a reason
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
            { da: ['A8-1', 'A8-2'], when: function () { return picked('sspp.authority').filter(function (x) { return x !== 'own'; }).length > 1; } }),
        // Certification basis
        Q('basis.reg', 'Certification basis and safety objectives', 'Which certification basis will the safety assessment be done to?', REGS.map(function (r) { return [r[0], r[1], '']; }),
            function (v) { return 'The safety assessment will be done to ' + (REG_SHORT[v] || v) + '. The basis sets the failure condition classifications, the probability target for each, and the development assurance level each one calls for, as Table {T:targets} shows.' + (v === 'Custom' ? ' The special conditions are defined on the certification basis page and agreed with the authority.' : ''); },
            { own: false, da: ['A8-1', 'A3-1'], tools: ['defs'], set: [BASIS('regulation', 'Certification basis', function (x) { return REG_SHORT[canonReg(x)] || x; })] }),
        Q('basis.p23level', 'Certification basis and safety objectives', 'What is the Part 23 certification level?', (safe(function () { return p23().CERT_LEVELS; }, []) || []).map(function (l) { return [l.v, l.label, '']; }),
            function (v) { return 'The airplane is Part 23 certification level ' + v + '.'; }, { own: false, when: function () { return reg() === 'Part 23'; }, set: [BASIS('part23Class', 'Part 23 class', function (x, c) { return c && c.part23Class ? 'Class ' + c.part23Class : ''; })] }),
        Q('basis.p23prop', 'Certification basis and safety objectives', 'What propulsion will the airplane have?', (safe(function () { return p23().PROPULSION; }, []) || []).map(function (l) { return [l.v, l.label, '']; }),
            function (v, q) { return 'Its propulsion: ' + lcFirst(optLabel(q, v)) + '. With the certification level, this sets the assessment level of ASTM F3230 and so the targets.'; }, { own: false, when: function () { return reg() === 'Part 23'; }, set: [BASIS('part23Class', 'Part 23 class', function (x, c) { return c && c.part23Class ? 'Class ' + c.part23Class : ''; })] }),
        Q('basis.p23manual', 'Certification basis and safety objectives', 'Which assessment level has been agreed with the authority?', [['I', 'Assessment Level I', ''], ['II', 'Assessment Level II', ''], ['III', 'Assessment Level III', ''], ['IV', 'Assessment Level IV', '']],
            function (v) { return 'The propulsion falls outside ASTM F3230 Table 3, so assessment level ' + v + ' will be agreed with the authority.'; }, { own: false, when: function () { return reg() === 'Part 23' && A('basis.p23prop') === 'other'; }, set: [BASIS('part23Class', 'Part 23 class', function (x, c) { return c && c.part23Class ? 'Class ' + c.part23Class : ''; })] }),
        Q('basis.p23dal', 'Certification basis and safety objectives', 'How will software and hardware DALs be set (ASTM F3061 4.2.5)?', [['f3061', 'ASTM F3061 Table 1: a primary and a secondary DAL', ''], ['arp4754', 'The ARP4754 method: A, B, C or D from the severity', '']],
            { f3061: 'Software and electronic hardware DALs will be set from ASTM F3061 Table 1.', arp4754: 'Software and electronic hardware DALs will be set by the ARP4754 method, from the severity of the failure conditions they contribute to.' }, { own: false, when: function () { return reg() === 'Part 23'; }, set: [BASIS('part23DalMethod', 'Part 23 DAL method', function (x) { return x === 'arp4754' ? 'ARP4754 method' : x ? 'F3061 Table 1' : ''; })] }),
        Q('basis.p27', 'Certification basis and safety objectives', 'What class is the rotorcraft (PS-ASW-27-15)?', [['I', 'Class I: reciprocating, up to 5 occupants', ''], ['II', 'Class II: single turbine, up to 5 occupants, up to 4,000 lb', ''], ['III', 'Class III: single turbine, 6 or more occupants, 4,001 to 7,000 lb', ''], ['IV', 'Class IV: twin turbine', '']],
            function (v) { return 'The rotorcraft is Part 27 class ' + v + ', which sets its targets.'; }, { own: false, when: function () { return reg() === 'Part 27'; }, set: [BASIS('part27Class', 'Part 27 class', function (x) { return x ? 'Class ' + x : ''; })] }),
        Q('basis.scvtol', 'Certification basis and safety objectives', 'Which SC-VTOL category will the aircraft be certified in?', [['Basic 1', 'Basic 1: 0 to 1 passengers', ''], ['Basic 2', 'Basic 2: 2 to 6 passengers', ''], ['Basic 3', 'Basic 3: 7 to 9 passengers', ''], ['Enhanced', 'Enhanced: commercial passenger and congested-area operations', '']],
            function (v) { return 'The aircraft will be certified in SC-VTOL category ' + v + '.'; }, { own: false, when: function () { return reg() === 'SC-VTOL'; }, set: [BASIS('scvtolCategory', 'SC-VTOL category', function (x) { return x || ''; })] }),
        Q('basis.mission', 'Certification basis and safety objectives', 'What flight duration will turn per-flight risk into per-hour targets?', [['auto', 'The sum of the flight phases', ''], ['1', '1 hour', ''], ['2', '2 hours', ''], ['3', '3 hours', ''], ['5', '5 hours', ''], ['10', '10 hours', '']],
            function (v) { return v === 'auto' ? 'The certification flight duration will be the sum of the flight phases; a failure condition that can only happen in some phases has its target adjusted for the time spent in them.' : 'The certification flight duration will be ' + v + ' hour' + (v === '1' ? '' : 's') + '; a failure condition that can only happen in some phases has its target adjusted for the time spent in them.'; },
            { own: false, when: isFixedOrRotor, set: [BASIS('missionDuration', 'Flight duration for the targets', function (x) { return x ? x + ' h' : 'Sum of the flight phases'; })] }),
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
            { da: ['A1-3'], when: function () { return ['supplier', 'mixed'].indexOf(A('sspp.org')) >= 0 || A('sspp.kind') === 'supplier'; } }),
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
            { da: ['A4-3', 'A5-3'], tools: ['hfa-results'], when: function () { return hfOn() && picked('hfp.eval').some(function (x) { return ['sim', 'flight', 'mock'].indexOf(x) >= 0; }); } }),
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
    PLANS.forEach(function (p) { BY[p.key] = p; p.qs.forEach(function (q) { if (q.own !== false && q.type !== 'num') q.opts = q.opts.concat([OWN]); QBY[q.k] = q; q.plan = p.key; }); });
    function optLabelK(k, v) { return optLabel(QBY[k], v); }
    function shown(q) { return !q.when || safe(q.when, true); }
    function questions(key) { return BY[key].qs.filter(shown); }

    // ---- answering ----------------------------------------------------------------------------------------------
    function answer(k, v) {
        var q = QBY[k]; if (!q) throw fail('No such question: ' + k);
        var s = store(); forget();
        if (v === '' || v == null || (Array.isArray(v) && !v.length)) { delete s.answers[k]; delete s.who[k]; save(); return ''; }
        var vs = Array.isArray(v) ? v.map(String) : String(v).split('|');
        if (q.type !== 'checks' && vs.length > 1) throw fail('Pick one answer for: ' + q.text);
        vs.forEach(function (x) { if (!q.opts.some(function (o) { return o[0] === x; })) throw fail('"' + x + '" is not one of the answers to: ' + q.text); });
        var val = q.opts.map(function (o) { return o[0]; }).filter(function (o) { return vs.indexOf(o) >= 0; }).join('|');   // in the options' order
        s.answers[k] = val; s.who[k] = { by: who(), at: now() };
        save(); return val;
    }
    function toggle(k, opt) { var cur = picked(k), i = cur.indexOf(opt); if (i >= 0) cur.splice(i, 1); else cur.push(opt); return answer(k, cur); }
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
            if (sec === 'The safety assessment process and its methods') out.push(procTable());
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
            if (sec === 'The human factors work through the design cycle') out.push(procTable());
            if (sec === 'Development assurance') out.push(objTable());
        }
        if (key === 'ramp') {
            if (sec === 'Scope and purpose') out.push(procTable());
            if (sec === 'Development assurance') out.push(objTable());
        }
        return out;
    }
    function doc(key) {
        var plan = BY[key], blocks = [];
        plan.secs.forEach(function (sec, i) {
            blocks.push(H(1, (i + 1) + '. ' + sec));
            var it = intro(key, sec); if (it) blocks.push(P(it));
            questions(key).filter(function (q) { return q.sec === sec; }).forEach(function (q) { blocks.push(P(txtOf(q))); });
            secFigs(key, sec).forEach(function (f) { blocks.push(f); });
            planTables(key, sec).forEach(function (t) { blocks.push(t); });
        });
        var gp = gaps(key);
        if (gp.length) { blocks.push(H(1, (plan.secs.length + 1) + '. To be decided')); blocks.push(P('These decisions are not made yet. Each is written into the plan above as "To be decided" until it is.')); blocks.push(TBL('open', 'Decisions still to be made', gp.map(function (x, i) { return { '#': String(i + 1), Decision: x }; }), '{N} lists them.')); }
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
        var gp = gaps(key);
        b.push(H(1, '4. Decisions still open in the plan'));
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
            if (b.k === 'p') return '<p class="' + (/To be decided|To be written/.test(b.text) ? 'pla-tbd' : '') + '">' + E(b.text) + '</p>';
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
            s += '<text x="' + (x + 6) + '" y="' + (y + 14) + '" font-size="10.5" fill="' + (wm > 60 ? '#fff' : C.ink) + '">' + gx.met + ' met, ' + gx.part + ' partly, ' + gx.open + ' not yet</text>';
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
            s += '<rect x="' + x + '" y="56" width="' + (colW - 10) + '" height="' + (40 + inPh.length * (bh + 10)) + '" rx="10" fill="#F8FAFC" stroke="#e3e5e8"/><text x="' + (x + 10) + '" y="76" font-size="12" font-weight="700" fill="' + C.sub + '">' + sx(ph) + '</text>';
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
    function methods(list) { var m = list.filter(function (x) { return planned(x[0]); }).map(function (x) { return x[1]; }); return m.length ? 'Methods: ' + m.join(', ') : 'No methods in the program'; }
    function toolOf(sec) { var t = safe(function () { return root.declaredToolchain(); }, null) || {}; var r = t[sec] || {}; return r.tool === 'other' ? (r.toolOther || '') : sec === 'rm' ? (RM_NAMES[r.tool] || '') : (MBSE_NAMES[r.tool] || ''); }

    // the safety assessment funnel through the development phases (the layout of ARP4761A Figures 1 and 3)
    function figFunnel() {
        var pasaNo = A('sspp.pasa') === 'none';
        var s = head('The safety assessment through the development phases', 'Down the left: aircraft, then systems, then items. Up the right: the results shown. Each box lists the methods this program uses there.');
        [['Concept', 20, 180], ['Preliminary and detailed design', 210, 350], ['Integration and verification', 570, 310]].forEach(function (p) { s += '<rect x="' + p[1] + '" y="54" width="' + p[2] + '" height="30" fill="#E5E7EB" stroke="' + C.ink + '"/><text x="' + (p[1] + p[2] / 2) + '" y="74" font-size="12" font-weight="700" font-style="italic" fill="' + C.ink + '" text-anchor="middle">' + sx(p[0]) + '</text>'; });
        s += '<polygon points="20,96 880,96 560,450 340,450" fill="#D5D9E0"/>';
        s += '<text x="450" y="114" font-size="12.5" font-weight="700" fill="#4b5563" text-anchor="middle">SAFETY ASSESSMENT</text><text x="450" y="132" font-size="11.5" font-style="italic" fill="#4b5563" text-anchor="middle">Aircraft level</text><text x="560" y="300" font-size="11.5" font-style="italic" fill="#4b5563" text-anchor="middle">System level</text><text x="450" y="430" font-size="11.5" font-style="italic" fill="#4b5563" text-anchor="middle">Item level</text>';
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
        s += '<rect x="20" y="508" width="14" height="11" fill="#E5E7EB" stroke="' + C.ink + '"/><text x="40" y="518" font-size="10.5" fill="' + C.sub + '">Development</text><rect x="140" y="508" width="14" height="11" fill="#fff" stroke="' + C.ink + '"/><text x="160" y="518" font-size="10.5" fill="' + C.sub + '">Safety assessment</text><rect x="290" y="508" width="14" height="11" fill="' + C.offF + '" stroke="' + C.off + '" stroke-dasharray="3 2"/><text x="310" y="518" font-size="10.5" fill="' + C.sub + '">Left out of the program</text>';
        return Object.assign(svgWrap(900, 530, s, 'Safety assessment funnel'), { title: 'The safety assessment through the development phases' });
    }
    // the safety assessment beside the development process (the layout of ARP4754B Figure 6)
    function figModel() {
        var pasaNo = A('sspp.pasa') === 'none', mb = A('sspp.mbse') ? (MBSE_NAMES[A('sspp.mbse')] || '') : toolOf('mbse'), rm = A('sspp.rmtool') ? (RM_NAMES[A('sspp.rmtool')] || '') : toolOf('rm');
        var s = head('The safety assessment beside the development process', 'Left: safety assessment, with the common cause analyses. Right: development. The arrows are what passes between them.');
        s += '<line x1="440" y1="50" x2="440" y2="650" stroke="' + C.line + '" stroke-dasharray="10 6"/>';
        s += '<text x="250" y="666" font-size="11" font-style="italic" fill="' + C.sub + '" text-anchor="middle">Safety assessment</text><text x="680" y="666" font-size="11" font-style="italic" fill="' + C.sub + '" text-anchor="middle">Development</text>';
        s += '<rect x="500" y="56" width="380" height="580" fill="#EEF0F3" stroke="#c7cbd1"/>';
        // common cause panel
        s += '<rect x="20" y="150" width="120" height="400" fill="#fff" stroke="' + C.ink + '"/><text x="80" y="174" font-size="11.5" font-style="italic" fill="' + C.ink + '" text-anchor="middle">Common cause</text><text x="80" y="188" font-size="11.5" font-style="italic" fill="' + C.ink + '" text-anchor="middle">analyses</text>';
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
        s += poly([[460, 230], [500, 230]], 'Yes', { lx: 466, ly: 224 }) + '<path d="M500,202 h150 v48 q-37,14 -75,0 t-75,0 z" fill="#fff" stroke="' + C.ink + '"/><text x="575" y="222" font-size="11.5" font-weight="700" fill="' + C.ink + '" text-anchor="middle">Plans issued</text><text x="575" y="236" font-size="9.5" fill="' + C.sub + '" text-anchor="middle">Word, signed</text>';
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
    var ui0 = { open: null, msg: null, view: 'plan' };
    var TONE = { 'not started': 'todo', open: 'open', apply: 'open', ready: 'ok' };
    function _style() {
        if (typeof document === 'undefined' || document.getElementById('pla-style')) return;
        var st = document.createElement('style'); st.id = 'pla-style';
        st.textContent = '.pla{font-size:13.5px}.pla-lead{font-size:13px;max-width:980px;margin:0 0 14px}'
            + '.pla-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.pla-card{border:1px solid var(--color-border,#e3e5e8);border-radius:12px;padding:14px 16px;background:var(--color-surface-1,#fff);display:flex;flex-direction:column;gap:8px}'
            + '.pla-ch{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.pla-ch b{font-size:14.5px}.pla-ch .slap-pill{white-space:nowrap;flex:none}.pla-g{font-size:12px}.pla-meta{display:flex;gap:6px;flex-wrap:wrap}.pla-chip{font-size:11.5px;padding:2px 8px;border-radius:10px;background:#ECECEA;color:#101216}'
            + '.pla-cols{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:18px;align-items:start}@media (max-width:1100px){.pla-cols{grid-template-columns:1fr}}'
            + '.pla-right{position:sticky;top:8px}.pla-prev{max-height:80vh;overflow:auto;border:1px solid var(--color-border,#e3e5e8);border-radius:10px;padding:16px 20px;background:#fff;color:#101216;font-size:12.5px;line-height:1.5}'
            + '.pla-prev h3{font-size:15px;margin:16px 0 6px}.pla-prev p{margin:0 0 8px}.pla-tbd{color:#9A3412;font-style:italic}.pla-cap{font-weight:700;font-size:11.5px;margin:10px 0 4px}'
            + '.pla-cover{border-bottom:2px solid #101216;padding-bottom:14px;margin-bottom:14px}.pla-ct{font-size:22px;font-weight:700;margin-top:6px}.pla-cs{font-size:14px;margin:2px 0 10px}.pla-front{border-bottom:2px solid #101216;padding-bottom:12px;margin-bottom:12px}.pla-tl{font-size:12px;margin:1px 0}.pla-tl a{color:#0A4FB8;text-decoration:none}'
            + '.pla-dt{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:10px}.pla-dt th,.pla-dt td{border:1px solid #c7cbd1;padding:4px 6px;text-align:left;vertical-align:top}.pla-dt th{background:#EAF2F8;color:#101216}'
            + '.pla-fig{margin:10px 0 2px;overflow-x:auto}.pla-fig svg{max-width:100%;height:auto;border:1px solid #e3e5e8;border-radius:8px}'
            + '.pla-sech{font-weight:700;font-size:13px;margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--color-border,#e3e5e8)}'
            + '.pla-q{border:1px solid var(--color-border,#e3e5e8);border-radius:10px;padding:10px 12px;margin:0 0 8px;background:var(--color-surface-1,#fff)}.pla-q.gap{border-left:3px solid #B26A00}.pla-q.bad{border-left:3px solid #B42318}'
            + '.pla-qt{font-weight:600;margin-bottom:6px}.pla-q select,.pla-doc select,.pla-doc input,.pla-q textarea,.pla-q input[type=text]{font:inherit;font-size:13px;padding:6px 8px;border-radius:7px;border:1px solid var(--color-border-strong,#c7cbd1);max-width:100%;width:100%;background:var(--color-surface-1,#fff);color:inherit;box-sizing:border-box}'
            + '.pla-q textarea{margin-top:6px;min-height:52px}.pla-chk{display:flex;flex-direction:column;gap:4px}.pla-chk label{display:flex;gap:6px;align-items:flex-start;font-size:13px}.pla-chk input{width:auto;margin-top:3px}.pla-chk label,.pla-chk label span{text-transform:none;letter-spacing:normal;font-weight:400;font-size:13px}'
            + '.pla-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;align-items:center}.pla-t{font-size:11px;padding:1px 7px;border-radius:9px;border:1px solid var(--color-border,#e3e5e8);white-space:nowrap}'
            + '.pla-t.set{background:rgba(26,110,242,.08);border-color:rgba(26,110,242,.3);color:#0A4FB8}.pla-t.da{background:rgba(31,122,51,.08);border-color:rgba(31,122,51,.3);color:#1F6B30;cursor:help}'
            + '.pla-t.tool{cursor:pointer;color:inherit;text-decoration:none}.pla-t.tool:hover{border-color:#1A6EF2}.pla-imp{font-size:12px;margin-top:5px}.pla-bad{font-size:12px;margin-top:6px;color:#B42318;font-weight:600}'
            + '.pla-box{border:1px solid var(--color-border,#e3e5e8);border-radius:10px;padding:10px 12px;margin:12px 0;background:var(--color-surface-1,#fff)}.pla-box h4{margin:0 0 6px;font-size:13px}'
            + '.pla-wt{width:100%;border-collapse:collapse;font-size:12.5px}.pla-wt th,.pla-wt td{border-top:1px solid var(--color-border,#e3e5e8);padding:5px 6px;text-align:left;vertical-align:top}.pla-wt th{font-size:11px;text-transform:uppercase;letter-spacing:.04em}'
            + '.pla-chg{font-weight:600;color:#0A4FB8}.pla-acts{display:flex;gap:8px;flex-wrap:wrap}.pla-msg{font-size:12.5px;margin:8px 0;padding:8px 10px;border-radius:8px;background:rgba(31,122,51,.08)}.pla-msg.err{background:rgba(180,35,24,.08)}'
            + '.pla-crumb{font:inherit;font-size:12px;border:none;background:none;color:#1A6EF2;cursor:pointer;padding:0;margin-bottom:4px}'
            + '.pla-doc{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;align-items:end}.pla-doc label{font-size:11.5px;font-weight:600;display:block;margin-bottom:3px}'
            + '.pla-vt{display:flex;gap:4px;margin-bottom:6px}.pla-vt button{font:inherit;font-size:12.5px;padding:6px 12px;border:1px solid var(--color-border-strong,#c7cbd1);border-radius:8px;background:none;color:inherit;cursor:pointer}.pla-vt button.on{background:#101216;color:#fff;border-color:#101216}';
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
    function _qHtml(q) {
        var v = A(q.k), s = store(), daTxt = function (id) { var o = objectives().filter(function (x) { return x.id === id; })[0]; return o ? id + ': ' + o.text : id; };
        var input = q.type === 'checks'
            ? '<div class="pla-chk">' + q.opts.map(function (o) { return '<label><input type="checkbox" data-plaqc="' + E(q.k) + '" value="' + E(o[0]) + '"' + (has(q.k, o[0]) ? ' checked' : '') + ' onchange="SLPlanAuto.ui.toggle(\'' + E(q.k) + '\',\'' + E(o[0]) + '\')"> <span>' + E(o[1]) + (o[2] ? ' <span class="pla-imp">(' + E(o[2]) + ')</span>' : '') + '</span></label>'; }).join('') + '</div>'
            : '<select data-plaq="' + E(q.k) + '" onchange="SLPlanAuto.ui.pick(\'' + E(q.k) + '\', this.value)"><option value="">Not answered</option>' + q.opts.map(function (o) { return '<option value="' + E(o[0]) + '"' + (v === o[0] ? ' selected' : '') + '>' + E(o[1]) + '</option>'; }).join('') + '</select>';
        var o1 = q.type !== 'checks' && v ? q.opts.filter(function (x) { return x[0] === v; })[0] : null;
        var ownBox = has(q.k, 'own') ? '<textarea data-plaown="' + E(q.k) + '" placeholder="How the program will do it, in your own words (it goes into the plan as written)" onchange="SLPlanAuto.ui.own(\'' + E(q.k) + '\', this.value)">' + E(s.own[q.k] || '') + '</textarea>' : '';
        var whyBox = picked(q.k).some(function (x) { return (q.reasonFor || []).indexOf(x) >= 0; }) ? '<textarea data-plawhy="' + E(q.k) + '" placeholder="The reason (it goes into the plan and the tailoring section)" onchange="SLPlanAuto.ui.why(\'' + E(q.k) + '\', this.value)">' + E(s.why[q.k] || '') + '</textarea>' : '';
        var bad = v && q.need ? safe(function () { return q.need(v); }, '') : '';
        return '<div class="pla-q' + (bad ? ' bad' : complete(q) ? '' : ' gap') + '" data-plaqbox="' + E(q.k) + '"><div class="pla-qt">' + E(q.text) + '</div>' + input + (o1 && o1[2] ? '<div class="pla-imp"><b>What this changes:</b> ' + E(o1[2]) + '</div>' : '') + ownBox + whyBox
            + (bad ? '<div class="pla-bad" data-plabad="' + E(q.k) + '">' + E(bad) + '</div>' : '')
            + '<div class="pla-tags">' + (q.set ? '<span class="pla-t set">Sets Safety Lab</span>' : '<span class="pla-t">Written into the plan</span>')
            + q.da.map(function (id) { return '<span class="pla-t da" title="' + E(daTxt(id)) + '">Meets ' + E(id) + '</span>'; }).join('')
            + q.tools.map(function (t) { return '<a class="pla-t tool" href="javascript:void(0)" onclick="switchTab(\'' + E(t) + '\')" title="Open the page the evidence will be on">' + E(pageName(t)) + ' &rarr;</a>'; }).join('')
            + (!complete(q) ? '<span class="pla-t" style="color:#9A3412">' + (A(q.k) ? (needsWhy(q) ? 'Reason to write' : 'Own way to write') : 'Gap: not answered') + '</span>' : '') + '</div></div>';
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
            h += '<div class="pla-sech" data-plasec="' + E(sec) + '">' + E(sec) + '</div>' + sq.map(_qHtml).join('');
            if (sec === 'Certification basis and safety objectives') h += '<div class="pla-g" style="margin:-2px 0 8px">The severity definitions, special conditions for a custom basis, and the full target tables stay on the <a href="javascript:void(0)" onclick="switchTab(\'defs\')">certification basis page</a>; the answers here write to the same place.</div>';
        });
        h += '<div class="pla-box" data-pla-wires="1"><div class="pla-ch"><h4>2. What it sets in Safety Lab</h4><button type="button" class="slap-btn p" onclick="SLPlanAuto.ui.apply(\'' + key + '\')"' + (todo.length ? '' : ' disabled') + '>Apply ' + todo.length + ' setting' + (todo.length === 1 ? '' : 's') + '</button></div>'
            + (w.length ? '<table class="pla-wt"><thead><tr><th>Setting</th><th>Now</th><th>After applying</th></tr></thead><tbody>' + w.map(function (x) { return '<tr' + (x.info ? ' data-plainfo="1"' : '') + '><td>' + E(x.what) + '</td><td>' + E(x.now) + '</td><td' + (x.info || !x.same ? ' class="pla-chg"' : '') + '>' + E(x.after) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="pla-g">Nothing in this plan sets Safety Lab.</div>')
            + '<div class="pla-g" style="margin-top:6px">A lane turned off keeps all its data. An expected lane that holds work is turned off with a signed tailoring entry naming this plan\'s answer and its reason. Lines that follow the certification basis (targets, levels, expected analyses) change with it.</div></div>';
        if (mm.length) h += '<div class="pla-box" data-pla-mm="1"><h4>Picks that do not work together (' + mm.length + ')</h4><ul style="margin:0;padding-left:18px">' + mm.map(function (x) { return '<li><b>' + E(x.q) + '</b> ' + E(x.msg) + '</li>'; }).join('') + '</ul></div>';
        h += '<div class="pla-box" data-pla-dacov="1"><h4>3. Development assurance objectives this plan covers</h4><table class="pla-wt"><thead><tr><th>Objective</th><th>How the program will meet it</th><th>Evidence will be on</th></tr></thead><tbody>'
            + da.map(function (r) { return '<tr><td title="' + E(r.text) + '"><b>' + E(r.id) + '</b> ' + E(r.text) + '</td><td>' + (r.how.length ? E(r.how.join('; ')) : '<span class="pla-tbd">To be decided</span>') + '</td><td>' + r.tools.map(function (t) { return '<a href="javascript:void(0)" onclick="switchTab(\'' + E(t) + '\')">' + E(pageName(t)) + '</a>'; }).join(', ') + '</td></tr>'; }).join('') + '</tbody></table></div>';
        if (gp.length) h += '<div class="pla-box" data-pla-gaps="1"><h4>To be decided (' + gp.length + ')</h4><ul style="margin:0;padding-left:18px">' + gp.map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul></div>';
        h += '</div><div class="pla-right"><div class="pla-vt"><button type="button" class="' + (view === 'plan' ? 'on' : '') + '" data-plaview="plan" onclick="SLPlanAuto.ui.view(\'plan\')">The plan</button><button type="button" class="' + (view === 'status' ? 'on' : '') + '" data-plaview="status" onclick="SLPlanAuto.ui.view(\'status\')">' + E(plan.report) + '</button><span style="flex:1"></span>'
            + '<button type="button" onclick="SLPlanAuto.ui.word(\'' + key + '\',\'' + view + '\')">Word (.docx)</button><button type="button" onclick="SLPlanAuto.print(\'' + key + '\',\'' + view + '\')">Print</button></div>'
            + '<div class="pla-prev" data-pladoc="1" data-plakind="' + view + '">' + fullHtml(key, view) + '</div></div></div>';
        return h;
    }
    function render() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('plan-auto-host'); if (!host) return;
        if (U()) U().style(); _style(); forget();
        var pv0 = document.querySelector('[data-pladoc]'), scroll = pv0 ? pv0.scrollTop : 0;
        host.innerHTML = '<div class="pla">' + (ui0.open && BY[ui0.open] ? _plan(ui0.open) : _cards()) + '</div>';
        var pv = document.querySelector('[data-pladoc]'); if (pv) pv.scrollTop = scroll;
    }
    var ui = {
        open: function (k) { ui0.open = k || null; ui0.msg = null; render(); try { var v = document.getElementById('view-plan-auto'); if (v && v.scrollIntoView) v.scrollIntoView({ block: 'start' }); } catch (_) {} },
        pick: function (k, v) { try { answer(k, v); ui0.msg = null; } catch (e) { ui0.msg = { text: e.message, err: true }; } render(); },
        toggle: function (k, o) { try { toggle(k, o); ui0.msg = null; } catch (e) { ui0.msg = { text: e.message, err: true }; } render(); },
        own: function (k, t) { setOwn(k, t); render(); },
        why: function (k, t) { setWhy(k, t); render(); },
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
        }
        return true;
    }
    if (typeof document !== 'undefined') { var tries = 40, t0 = setInterval(function () { if (mount() || --tries <= 0) clearInterval(t0); }, 250); }
    root.SLPlanAuto = { VERSION: VERSION, PLANS: PLANS, BY: BY, QBY: QBY, answer: answer, toggle: toggle, setOwn: setOwn, setWhy: setWhy, wires: wires, apply: apply, status: status, gaps: gaps, mismatches: mismatches, complete: complete,
        daCover: daCover, doc: doc, statusDoc: statusDoc, docHtml: docHtml, fullHtml: fullHtml, model: model, word: word, print: print, render: render, ui: ui, state: ui0, questions: questions,
        plannedCfg: plannedCfg, targetsFor: targetsFor, planned: planned, procRows: procRows, docCtl: docCtl, issue: issue, setDoc: setDoc, rev: rev, ROLES: ROLES, forget: forget };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLPlanAuto;
})(typeof window !== 'undefined' ? window : globalThis);
