// cma_autopilot.js (SLCmaAuto v1.1, 8 Nov 2026): the CMA Autopilot. The Common Mode Analysis written by answering plain
// questions, one independence claim at a time, with the CMA report built from the answers.
//
// Waqas, 8 Nov 2026: "PRA build and ZSA similar to the planing autopilot, ability to see the reports etc. can we do
// something similar for CMA"; confirmed: the CMA table goes, each report section gets an inline Edit and the page an
// "Add a CMA" button, so no data entry is lost.
//
// Built on the four-step CMA (cma_flow.js, SLCmaFlow), never beside it:
//   · the CMA rows in cmaData stay the record. Every answer here goes through SLCmaFlow (addGate, setClaim, answer,
//     setConcern, raiseRequirement), so row.flow, linkedGateIds, claim, status, findings and mitigation are written
//     exactly as the rest of the app reads them (support_modules allocateDAL via substantiatedGateIds, the open-finding
//     index, AutoReq's cma-concern generator, critical_gates reviewedBy, the reports).
//   · the answers live in row.flow, not in projectConfig.cmaAuto. row.flow already holds the gates, the claim, the
//     category answers and the concerns, and the derived status and the DAL substantiation read it; a second copy in
//     projectConfig would be two records of one analysis (the no-duplicates rule). projectConfig.cmaAuto keeps only what
//     belongs to the document, not to a claim: the acceptance of its outputs.
//   · who answered each question and when: row.flow.who[questionId].
//   · a CMA logged before the four steps is adopted (SLCmaFlow.adopt) the first time one of its questions is answered or
//     it is edited; reading it, or building its report section, writes nothing.
// The questions, per claim (critical gates first):
//   What must be independent: the AND gates relying on the claim (critical first), the claim in words.
//   The common mode categories (ARP4761A Appendix M, Table M1, as tailored by the project in cma_walkthrough.js),
//     each put in plain words: No, Concern or Does not apply, each with why.
//   Under each Concern (indented, only where one exists): closed by a requirement, closed with evidence, or accepted
//     with the reason. Concerns from live detection or added by hand sit on their own under the claim.
// The report: reportSections() is pure; one section per independence claim. Status words are derived, never typed;
// the report text carries no counts.
// THE TABLE SWITCH: HIDE_CMA_TABLE_UI below. true (v1.1): the CMA page is the report on the shared frame (cca_report.js,
// SLCcaReport, key 'cma'): the questions on the left, the CMA report on the right, Edit per section and "Add a CMA"; the
// CMA table, its scope chips and the four-step editor are hidden (kept in the page for the code that reads them), and
// "Review in CMA" and Edit on a CMA open it in the report. false puts the old page back.
// v1.1 (8 Nov 2026, phase 2): on the frame. Duplicates are asked of no_dupes.js (cmaOwner, cmaClash), the one home of the
// duplicate rules. The acceptance of the outputs moved to the frame's store, projectConfig.ccaReports.cma.accept, so the
// frame's "Outputs to accept" and this module read one record; v1.0's projectConfig.cmaAuto.accept is moved there once.
(function (root) {
    'use strict';
    var VERSION = '1.1';

    // ==== THE SWITCH ================================================================================================
    // Flip to true in phase 2, once the CMA report (cca_report.js) is on the page: the CMA table, its hidden entry form
    // and the four-step editor go; the critical gates panel and the common cause decision log stay.
    var HIDE_CMA_TABLE_UI = true;
    // ================================================================================================================

    function S(v) { return String(v == null ? '' : v); }
    function E(s) { return S(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    // report and UI text: no em dashes, whatever the data says (standing rule)
    function T(s) { return S(s).replace(/\s*\u2014\s*/g, ', ').replace(/\s+/g, ' ').trim(); }
    function g(name) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {} try { return root[name]; } catch (_) { return undefined; } }
    function arr(name) { var v = g(name); return Array.isArray(v) ? v : []; }
    function F() { return root.SLCmaFlow || null; }
    function U() { return root.SLAutopilotUI || null; }
    function rows() { try { if (typeof cmaData !== 'undefined' && Array.isArray(cmaData)) return cmaData; } catch (_) {} return arr('cmaData'); }   // eslint-disable-line no-undef
    function pc() { var v = g('projectConfig'); if (v === undefined) { try { v = projectConfig; } catch (_) {} } return v || null; }   // eslint-disable-line no-undef
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function now() { return new Date().toISOString(); }
    function who() { return U() ? U().who() : 'Engineer'; }
    function save() { if (U()) U().save(); else { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} } }
    function lcFirst(s) { s = S(s); return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
    function listJoin(a) { a = a.filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function slug(s) { return S(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'x'; }
    function fpOf(x) { var s = ''; try { s = JSON.stringify(x == null ? null : x); } catch (_) { s = S(x); } var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

    // ---- read once per redraw ---------------------------------------------------------------------------------------
    var _memo = {}, _memoT = null;
    function memo(key, f) {
        if (Object.prototype.hasOwnProperty.call(_memo, key)) return _memo[key];
        var v = f(); _memo[key] = v;
        if (!_memoT && typeof setTimeout === 'function') _memoT = setTimeout(function () { _memo = {}; _memoT = null; }, 0);
        return v;
    }
    function forget() { _memo = {}; if (_memoT && typeof clearTimeout === 'function') clearTimeout(_memoT); _memoT = null; }

    // ---- the categories, in plain words (our own words; the labels come from cma_walkthrough.js) -----------------------
    // [short name, what it means in one or two sentences]
    var CAT_PLAIN = {
        'cr-egen': ['Electrical power sources', 'Generators, batteries or any power source the inputs draw on. If one source feeds more than one input, losing it loses them together.'],
        'cr-edist': ['Electrical power distribution', 'The buses, breakers, contactors and power wiring between the source and the inputs. A shared bus or breaker is a shared way to fail.'],
        'cr-hgen': ['Hydraulic power sources', 'The pumps and the reservoirs behind them. Inputs powered by the same pump or reservoir can be lost together.'],
        'cr-hdist': ['Hydraulic lines and valves', 'The pipes, manifolds and valves carrying hydraulic power to the inputs. One leak, or one shared valve stuck, can starve more than one.'],
        'cr-pneu': ['Air pressure and vacuum', 'Bleed air, pressure sources, vacuum and their ducts. A shared duct or source can fail more than one input.'],
        'cr-net': ['Data networks', 'The buses and networks carrying data between equipment. One unit flooding a shared bus, or the bus breaking, can cut more than one input.'],
        'cr-if': ['Connectors and shared routes', 'Connectors, pins, harness routes and wall penetrations the inputs share. One damaged connector or route can cut them all.'],
        'cr-proc': ['Shared computing', 'A processor, computer or programmable device more than one input relies on.'],
        'cr-data': ['Shared data', 'Data more than one input uses, such as the same sensor value or the same settings. If it is missing, wrong or corrupt, every input acts on the same bad data.'],
        'cr-store': ['Shared data storage', 'Memory or storage holding software, settings or records that more than one input reads.'],
        'cr-db': ['Shared databases and libraries', 'Navigation databases, parameter files or code libraries common to the inputs. One error in them repeats in every input.'],
        'cr-sensor': ['Shared sensors', 'A sensor that feeds more than one input, or both controls a function and checks it. Its failure can fool every user, or hide itself.'],
        'cr-add': ['Other shared resources', 'Anything else the inputs both depend on that the architecture assessment found, such as cooling, fuel, mounts or structure.'],
        'dv-spec': ['Requirements and specifications', 'Inputs built to the same requirement or specification carry the same mistake if that requirement is wrong.'],
        'dv-sw': ['Software development', 'The same software, or software written by one team with one method, can fail the same way at the same moment.'],
        'dv-hw': ['Electronic hardware development', 'The same chip, board design or design team on more than one input repeats any design flaw in each.'],
        'dv-fw': ['Firmware and programmable logic', 'Firmware or programmable logic common to the inputs carries one error into each of them.'],
        'dv-tool': ['Design tools', 'Design, modeling, requirements or code tools whose output feeds more than one input. A fault in the tool spreads to each.'],
        'dv-proc': ['Development process and team independence', 'Whether the inputs were designed and checked by separate people and processes, so one person\'s mistake cannot reach them all.'],
        'im-issue': ['New technology and how it is built', 'New or unproven technology, or an unusual way of building it, used in more than one input.'],
        'im-bay': ['Shared equipment bays', 'Equipment of more than one input in the same bay or rack, open to the same local event such as a fluid leak, heat or impact.'],
        'im-cond': ['Cooling and conditioning', 'Cooling air, heating or other conditioning that more than one input depends on.'],
        'im-incorrect': ['Installed wrongly', 'The same installation mistake (swapped connectors, a missed bond, a wrong part) repeated on more than one input.'],
        'im-part': ['Barriers and partitions', 'The physical barriers or software partitions that keep the inputs apart. If a barrier fails, more than one input can be hit.'],
        'en-mech': ['Vibration, shock and temperature', 'Vibration, shock, heat or cold the inputs see together, beyond what they were qualified for.'],
        'en-em': ['Electromagnetic effects', 'Interference, strong radio fields and the indirect effects of lightning, which can upset more than one input at once.'],
        'en-chem': ['Fluids and corrosion', 'Corrosive fluids, contamination or chemicals that can attack more than one input.'],
        'en-bio': ['Other surroundings', 'Mold, sand, dust, ice, insects and other surroundings acting on the inputs together.'],
        'mf-mfr': ['Same manufacturer', 'Inputs made by the same company, where one quality escape reaches every unit.'],
        'mf-proc': ['Manufacturing instructions', 'The same build instructions for more than one input, where one error in them repeats.'],
        'mf-process': ['Manufacturing process control', 'The same production line, batch or process, where one drift in the process affects every unit made.'],
        'mf-tool': ['Manufacturing tools', 'The same jigs, tools or test equipment used to make or check more than one input.'],
        'op-staff': ['Flight crew and operators', 'One crew error that can switch off or misuse more than one input.'],
        'op-proc': ['Operating procedures', 'Procedures that handle the inputs the same way, so one wrong step affects them all.'],
        'al-common': ['An alert that fails with the fault', 'An alert that relies on the same part, power or data as the failure it announces, so the failure could also silence its own alert.'],
        'mt-staff': ['Maintenance staff', 'The same technician or team working on more than one input in one visit, so one error repeats.'],
        'mt-proc': ['Maintenance and calibration procedures', 'The same task card or calibration step used on more than one input.'],
        'mt-loc': ['Work close to the other input', 'Maintenance on one input that can disturb another because they sit close together.']
    };
    var GROUP_PLAIN = {
        'Common resource': 'Things the inputs draw on together: power, fluids, data, computing, connectors and sensors.',
        'Development / design': 'How the inputs were specified and designed: one mistake made once can sit in every input.',
        'Implementation': 'How the inputs are built into the aircraft and kept apart.',
        'Environment': 'What the surroundings do to the inputs at the same moment.',
        'Manufacturing': 'How the inputs are made: one escape in production can reach every unit.',
        'Operation': 'What the crew and the operating procedures do to the inputs.',
        'Crew alerting': 'Whether the alert for a failure can fail from the same cause as the failure.',
        'Maintenance': 'What maintenance does to the inputs: one visit, one card, one technician.',
        'Project-specific': 'Categories this project added to the standard list.'
    };
    var ANSWER_WORD = { no: 'No', concern: 'Concern', na: 'Does not apply' };
    function catPlain(id, label) { var p = CAT_PLAIN[id]; return p ? { name: p[0], intro: p[1] } : { name: T(label || id), intro: 'A project category: could it fail more than one input at once?' }; }
    function catList() { return memo('cats', function () { var out = []; safe(function () { return F().categories(); }, []).forEach(function (grp) { (grp.items || []).forEach(function (it) { var p = catPlain(it[0], it[1]); out.push({ id: it[0], label: it[1], group: grp.g, name: p.name, intro: p.intro }); }); }); return out; }); }

    // ---- the gates and the trees ----------------------------------------------------------------------------------------
    function allGates() { return memo('gates', function () { return safe(function () { return F().allGates(); }, []) || []; }); }
    function gateIndex() { return memo('gidx', function () { var m = {}; allGates().forEach(function (x) { m[x.key] = x; }); return m; }); }
    function critMap() { return memo('crit', function () { var m = {}; allGates().forEach(function (x) { if (x.critical) m[x.key] = true; }); return m; }); }
    function pageFcs() {
        return memo('fcs', function () {
            var m = {};
            safe(function () { return root.SLCriticalGates.analyzeAll(); }, []).forEach(function (r) { m[S(r.pageId)] = (r.fcs || []).map(function (x) { var f = x.fha || {}; return { id: S(f.fcId || ('FC ' + (f.internalId || ''))), name: T(f.fcDesc || f.failureCondition || f.name || ''), severity: S(f.severity || ''), system: x.sysId != null ? S(x.sysName || '') : '' }; }); });
            return m;
        });
    }
    function gateInfo(key) {
        var k = S(key), x = gateIndex()[k], gg = x || safe(function () { return F().gateOf(k); }, null);
        if (!gg) {
            // the node is gone from its tree (or the tree is gone): said in words, never as the internal key
            var pid = k.slice(0, k.lastIndexOf(':')), pg = arr('ftaPages').find(function (q) { return q && S(q.id) === pid; });
            var where = pg ? 'a gate no longer in the fault tree "' + T(pg.name || pg.id) + '"' : 'a gate whose fault tree is no longer in the project';
            return { key: k, gone: true, id: where, name: '', tree: pg ? T(pg.name || pg.id) : '', label: where.charAt(0).toUpperCase() + where.slice(1), inputs: [], critical: false, fcs: pg ? (pageFcs()[pid] || []) : [] };
        }
        var n = gg.node, p = gg.page, isGate = !!x, id = S(n.displayId || ((n.type === 'gate' ? 'G-' : 'E-') + n.id));
        var inputs = ((n.children || n._children) || []).map(function (c) { return T(c.name || c.displayId || c.id); });
        return { key: k, gone: false, notGate: !isGate, id: id, name: T(n.name || ''), tree: T(p.name || p.id), pageId: S(p.id), label: id + (n.name ? ' ' + T(n.name) : '') + (isGate ? '' : ' (not an AND gate with two or more inputs)'), inputs: inputs, critical: !!critMap()[k], fcs: pageFcs()[S(p.id)] || [], node: n };
    }
    function fcWords(fc) { return fc.id + (fc.name ? ' ' + fc.name : '') + (fc.system ? ' (' + fc.system + ')' : '') + (fc.severity ? ', ' + fc.severity : ''); }
    // the CMA a gate belongs to: a four-step CMA by its gates, an earlier entry by its linked gates
    function gatesOf(r) { return r ? ((r.flow ? r.flow.gates : r.linkedGateIds) || []).map(String) : []; }
    function ND() { return root.SLNoDupes && typeof root.SLNoDupes.cmaOwner === 'function' ? root.SLNoDupes : null; }
    function ownerOf(key) { var N = ND(); if (N) return N.cmaOwner(rows(), key); var k = S(key); return rows().find(function (c) { return c && !c.suggested && gatesOf(c).indexOf(k) >= 0; }) || null; }
    function rowById(iid) { return rows().find(function (c) { return c && S(c.internalId) === S(iid); }) || null; }
    function isCritical(r) { var cm = critMap(); return gatesOf(r).some(function (k) { return cm[k]; }); }
    // the claims in report order: those a DAL reduction rests on first, then by CMA id
    function claims() {
        return rows().filter(function (c) { return c && !c.suggested; }).map(function (c, i) { return { r: c, i: i, crit: isCritical(c) }; })
            .sort(function (a, b) { return (b.crit ? 1 : 0) - (a.crit ? 1 : 0) || S(a.r.cmaId).localeCompare(S(b.r.cmaId), undefined, { numeric: true }) || a.i - b.i; })
            .map(function (x) { return x.r; });
    }
    function sysName(id) { var s = arr('systemsData').find(function (x) { return x && S(x.id) === S(id); }); return s ? T(s.name || s.id) : S(id); }
    function draftClaim(r) {
        var gs = gatesOf(r).map(gateInfo).filter(function (x) { return !x.gone; });
        if (!gs.length) return '';
        if (gs.length === 1) { var x = gs[0]; return 'The inputs of ' + x.id + (x.name ? ' (' + x.name + ')' : '') + ', ' + listJoin(x.inputs.map(function (n) { return '"' + n + '"'; })) + ', share no single cause that can make them happen together, so the gate fails only when they fail on their own.'; }
        return 'No single cause can make more than one input fail together at any of ' + listJoin(gs.map(function (x) { return x.id + (x.name ? ' (' + x.name + ')' : ''); })) + '; each gate fails only when its inputs fail on their own.';
    }

    // ---- question ids --------------------------------------------------------------------------------------------------
    // 'cma/start'; 'cma/<internalId>/gates'; 'cma/<internalId>/claim'; 'cma/<internalId>/cat/<categoryId>';
    // 'cma/<internalId>/concern/<concernId>'
    function qid(r, kind, sub) { return 'cma/' + S(r.internalId) + '/' + kind + (sub != null ? '/' + S(sub) : ''); }
    function parseQ(id) {
        var m = /^cma\/(start)$/.exec(S(id)); if (m) return { kind: 'start' };
        m = /^cma\/(.+)\/(gates|claim)$/.exec(S(id)); if (m) return { iid: m[1], kind: m[2] };
        m = /^cma\/(.+)\/(cat|concern)\/([^/]+)$/.exec(S(id)); if (m) return { iid: m[1], kind: m[2], sub: m[3] };
        return null;
    }

    // ---- the questions ----------------------------------------------------------------------------------------------
    var OPT_CAT = [
        { id: 'no', label: 'No, they do not share it', means: 'The inputs do not share this, or a fault in it cannot reach more than one of them.', changes: 'Records the category as checked. Write why, for example "each lane has its own supply".', needs: ['why'] },
        { id: 'concern', label: 'Yes, this could be shared', means: 'A fault here might fail more than one input at the same moment.', changes: 'Opens a concern under this question. The DAL reduction at these gates stays marked CMA pending until the concern is mitigated or accepted.', needs: ['why'] },
        { id: 'na', label: 'Does not apply', means: 'Nothing of this kind is involved in these inputs, for example no software in a purely mechanical lane.', changes: 'Records the category as not applicable. Write why.', needs: ['why'] }
    ];
    var OPT_CONCERN = [
        { id: 'req', label: 'Raise a requirement', means: 'The design is changed or constrained so the shared cause cannot reach more than one input.', changes: 'Writes a requirement ("The design shall ...") traced to this CMA and its gates; it goes to the requirements page for acceptance. The concern counts as mitigated.', needs: ['text'] },
        { id: 'evidence', label: 'Show it is already covered', means: 'A test, an analysis or a design document shows the shared cause cannot defeat the claim.', changes: 'Records the mitigation and the evidence that backs it. The concern counts as mitigated.', needs: ['mitigation', 'evidence'] },
        { id: 'accept', label: 'Accept it, with the reason', means: 'The shared cause is real, but its effect is acceptable as it stands.', changes: 'Records the reason and who accepted it. The claim can still be substantiated once everything else is closed.', needs: ['reason'] }
    ];
    function concernPick(c) { if (!c) return ''; if (c.status === 'Accepted') return 'accept'; if (c.status === 'Mitigated') return c.raise ? 'req' : 'evidence'; return ''; }
    function concernDone(c) {
        if (!c) return false;
        if (c.status === 'Mitigated') return !!(S(c.mitigation).trim() && (S(c.backedBy).trim() || c.raise));
        if (c.status === 'Accepted') return !!S(c.acceptWhy).trim();
        return false;
    }
    function whoOf(r, id) { var w = r && r.flow && r.flow.who && r.flow.who[id]; return w ? { by: w.by, at: w.at } : null; }

    function startQuestion() {
        var cm = critMap(), free = allGates().filter(function (x) { return cm[x.key] && !ownerOf(x.key); });
        return { id: 'cma/start', kind: 'multi', group: 'Independence claims', groupIntro: 'Every AND gate a DAL reduction rests on needs a common mode analysis that shows its inputs can fail only on their own.',
            text: 'Which critical gates still need a common mode analysis?', intro: 'These AND gates have a DAL reduction resting on them and no CMA yet. Pick one to start its analysis; each one picked becomes its own CMA.',
            options: free.map(function (x) { var gi = gateInfo(x.key); return { id: x.key, label: gi.label, means: 'In "' + gi.tree + '". Its inputs: ' + listJoin(gi.inputs) + '.', changes: 'Starts a CMA for this gate. Until it is substantiated, the gate\'s DAL reduction stays marked CMA pending.', critical: true }; }),
            picked: [], fields: {}, complete: !free.length, parent: null, depth: 0, cma: null, cmaId: '' };
    }
    function questionsFor(r) {
        var f = r.flow || null, out = [], gi = gatesOf(r), cm = critMap(), cats = catList();
        var head = T((r.cmaId ? r.cmaId + ' ' : '') + (r.subject || 'Common mode analysis'));
        // the AND gates relying on it
        var opts = gi.map(function (k) { return k; }).concat(allGates().filter(function (x) { return gi.indexOf(x.key) < 0 && !ownerOf(x.key); }).map(function (x) { return x.key; }));
        opts.sort(function (a, b) { return (gi.indexOf(b) >= 0 ? 1 : 0) - (gi.indexOf(a) >= 0 ? 1 : 0) || (cm[b] ? 1 : 0) - (cm[a] ? 1 : 0); });
        out.push({ id: qid(r, 'gates'), kind: 'multi', group: head + ': what must be independent', groupIntro: 'An AND gate fails only when all its inputs fail. Counting on that is a claim that the inputs fail independently: no single cause can fail them together.',
            text: 'Which AND gates rely on this independence?', intro: 'Pick the gates whose inputs this analysis must show share no common cause. Gates a DAL reduction rests on (critical gates) come first.',
            options: opts.map(function (k) { var x = gateInfo(k); return { id: k, label: x.label, means: x.gone ? 'This gate is no longer in the fault trees.' : 'In "' + x.tree + '"' + (x.fcs.length ? ', for ' + listJoin(x.fcs.map(fcWords)) : '') + '. Its inputs: ' + listJoin(x.inputs) + '.', changes: x.critical ? 'A DAL reduction rests on this gate: it stays marked CMA pending until this analysis is substantiated.' : 'Adds it to this analysis; its inputs are checked against every common mode category.', critical: x.critical }; }),
            picked: gi.slice(), fields: {}, complete: gi.length > 0, parent: null, depth: 0, who: whoOf(r, qid(r, 'gates')) });
        // the claim in words
        var claim = S(f ? f.claim : r.claim).trim(), dr = draftClaim(r);
        out.push({ id: qid(r, 'claim'), kind: 'single', group: head + ': what must be independent',
            text: 'What exactly is claimed?', intro: 'Say in one sentence what must stay true for these gates to count on their inputs failing on their own. It is the sentence the rest of the analysis checks.',
            options: [{ id: 'drafted', label: dr || 'Pick the gates first: the claim is written from them', means: 'Written from the gates and their inputs.', changes: 'Becomes the claim in the report and on the CMA record.', disabled: !dr },
                      { id: 'own', label: 'In my own words', means: 'Write the claim yourself.', changes: 'What you write goes in exactly as written.', needs: ['text'] }],
            picked: claim ? [dr && claim === dr ? 'drafted' : 'own'] : [], fields: { text: claim }, complete: !!claim, parent: null, depth: 0, who: whoOf(r, qid(r, 'claim')) });
        // the categories, with their concerns indented under them
        var concerns = (f && f.concerns) || [];
        cats.forEach(function (c) {
            var a = (f && f.answers && f.answers[c.id]) || {}, id = qid(r, 'cat', c.id);
            out.push({ id: id, kind: 'single', group: head + ': common modes, ' + lcFirst(c.group === 'Development / design' ? 'Development and design' : c.group), groupIntro: GROUP_PLAIN[c.group] || '',
                text: 'Could ' + lcFirst(c.name) + ' fail more than one of the inputs at once?', intro: c.intro, category: c.id, categoryLabel: c.label,
                options: OPT_CAT, picked: a.a ? [a.a] : [], fields: { why: S(a.why) }, complete: !!(a.a && S(a.why).trim()), parent: null, depth: 0, who: whoOf(r, id) });
            var cc = a.concernId ? concerns.find(function (x) { return x.id === a.concernId; }) : null;
            if (cc) out.push(concernQ(r, cc, id, 1));
        });
        // concerns from live detection or added by hand: their own place under the claim
        concerns.filter(function (cc) { return !Object.keys((f && f.answers) || {}).some(function (k) { return f.answers[k].concernId === cc.id; }); }).forEach(function (cc) { var q = concernQ(r, cc, null, 0); q.group = head + ': concerns found elsewhere'; q.groupIntro = 'Common causes found live in the fault trees, or added by hand. Each one defeats the claim until it is closed.'; out.push(q); });
        out.forEach(function (q) { q.cma = r.internalId; q.cmaId = S(r.cmaId); });
        return out;
    }
    function concernQ(r, cc, parent, depth) {
        var id = qid(r, 'concern', cc.id);
        return { id: id, kind: 'single', group: '', text: 'How is concern ' + cc.id + ' closed?', intro: T(cc.text) + (cc.from === 'live detection' ? ' Found live in the fault trees: it defeats the claim until it is closed.' : ''), concern: cc.id,
            options: OPT_CONCERN, picked: concernPick(cc) ? [concernPick(cc)] : [], fields: { text: S(cc.reqText || ''), mitigation: S(cc.mitigation), evidence: cc.raise ? '' : S(cc.backedBy), reason: S(cc.acceptWhy) },
            complete: concernDone(cc), parent: parent, depth: depth, who: whoOf(r, id) };
    }
    // every question, in the order they are asked: the start question, then claim by claim (critical first)
    function questions(iid) {
        if (iid != null) { var r = rowById(iid); return r ? questionsFor(r) : []; }
        return memo('qs', function () { var out = [startQuestion()]; claims().forEach(function (r) { out = out.concat(questionsFor(r)); }); return out; });
    }
    function question(id) { var p = parseQ(id); if (!p) return null; if (p.kind === 'start') return startQuestion(); return questions(p.iid).find(function (q) { return q.id === S(id); }) || null; }

    // ---- answering ------------------------------------------------------------------------------------------------------
    var _subs = [];
    function subscribe(fn) { if (typeof fn === 'function') _subs.push(fn); return function () { _subs = _subs.filter(function (x) { return x !== fn; }); }; }
    function changed(id) { forget(); save(); _subs.slice().forEach(function (fn) { try { fn(id); } catch (_) {} }); }
    function stamp(r, id) { if (!r || !r.flow) return; if (!r.flow.who || typeof r.flow.who !== 'object') r.flow.who = {}; r.flow.who[id] = { by: who(), at: now() }; }
    function ensureFlow(r) { if (r && !r.flow) { F().adopt(r); forget(); } return r; }
    function no(why) { return { ok: false, why: why }; }
    // answer(questionId, pick, fields): pick is an option id (or, for the gate questions, the list of gate keys);
    // fields carry the words the answer needs: { why } for a category, { text } for the claim in your own words or a
    // requirement, { mitigation, evidence } for evidence, { reason } for an accepted concern. Returns { ok, why? }.
    function answer(id, pick, fields) {
        fields = fields || {};
        var p = parseQ(id); if (!p) return no('No such question: ' + id);
        if (!F()) return no('The common mode analysis is not loaded.');
        if (p.kind === 'start') {
            var keys = Array.isArray(pick) ? pick : [pick], made = [];
            for (var i = 0; i < keys.length; i++) { var res = addCma({ gates: [keys[i]] }); if (!res.ok) return res; made.push(res.row.internalId); }
            changed(id); return { ok: true, created: made };
        }
        var r = rowById(p.iid); if (!r) return no('No such CMA.');
        if (p.kind === 'gates') {
            var want = (Array.isArray(pick) ? pick : S(pick).split('|')).map(String).filter(Boolean);
            for (var j = 0; j < want.length; j++) { var o = ownerOf(want[j]); if (o && o !== r) return no(gateInfo(want[j]).label + ' is already in ' + S(o.cmaId || 'another CMA') + ': one CMA per set of gates.'); if (!gateIndex()[want[j]] && !F().gateOf(want[j])) return no('That gate is not in the fault trees.'); }
            ensureFlow(r);
            r.flow.gates.slice().forEach(function (k) { if (want.indexOf(k) < 0) F().removeGate(r.internalId, k); });
            want.forEach(function (k) { if (r.flow.gates.indexOf(k) < 0) F().addGate(r.internalId, k); });
            stamp(r, id); changed(id); return { ok: true };
        }
        if (p.kind === 'claim') {
            var text = pick === 'drafted' ? draftClaim(r) : S(fields.text).trim();
            if (pick !== 'drafted' && pick !== 'own') return no('Pick the drafted claim or write your own.');
            if (!text) return no(pick === 'drafted' ? 'Pick the gates first: the claim is written from them.' : 'Write the claim in one sentence.');
            ensureFlow(r); F().setClaim(r.internalId, text); stamp(r, id); changed(id); return { ok: true };
        }
        if (p.kind === 'cat') {
            if (!ANSWER_WORD[pick]) return no('Answer No, Concern or Does not apply.');
            if (!catList().some(function (c) { return c.id === p.sub; })) return no('No such category: ' + p.sub);
            ensureFlow(r);
            var prev = r.flow.answers[p.sub] || {};
            var why = fields.why != null ? S(fields.why).trim() : S(prev.why);
            F().answer(r.internalId, p.sub, pick, why);
            // the concern's words follow the reason while it is still open
            var a = r.flow.answers[p.sub];
            if (a && a.concernId && fields.why != null) { var cc = r.flow.concerns.find(function (x) { return x.id === a.concernId; }); if (cc && cc.status === 'Open') { cc.text = catPlain(p.sub).name + ': ' + (why || 'to be described'); F().sync(r); } }
            stamp(r, id); changed(id); return { ok: true, concern: a && a.concernId || '' };
        }
        if (p.kind === 'concern') {
            if (!r.flow) return no('No such concern.');
            var c = r.flow.concerns.find(function (x) { return x.id === p.sub; }); if (!c) return no('No such concern: ' + p.sub);
            var resC;
            if (pick === 'req') {
                var t = S(fields.text).trim();
                if (!/\bshall\b/i.test(t)) return no('A requirement says what shall be done: "The design shall ...".');
                c.status = 'Open'; c.backedBy = '';
                resC = F().raiseRequirement(r.internalId, c.id, t);
                if (resC && resC.ok && c.mitigation !== t && !S(fields.mitigation).trim()) { c.mitigation = t; F().sync(r); }
            } else if (pick === 'evidence') {
                var mit = S(fields.mitigation).trim(), ev = S(fields.evidence).trim();
                if (!mit || !ev) return no('Write the mitigation and the evidence that backs it (a test, an analysis or a document reference).');
                c.raise = false; c.reqText = ''; c.status = 'Open';
                F().setConcern(r.internalId, c.id, { mitigation: mit, backedBy: ev });
                resC = F().setConcern(r.internalId, c.id, { status: 'Mitigated' });
            } else if (pick === 'accept') {
                var why2 = S(fields.reason).trim(); if (!why2) return no('Write why the concern is acceptable as it stands.');
                c.raise = false; c.reqText = '';
                F().setConcern(r.internalId, c.id, { acceptWhy: why2 });
                resC = F().setConcern(r.internalId, c.id, { status: 'Accepted' });
            } else return no('Pick how the concern is closed: a requirement, evidence or accepted with the reason.');
            if (resC && resC.ok === false) return no(resC.why || 'That did not close the concern.');
            stamp(r, id); changed(id); return { ok: true };
        }
        return no('No such question: ' + id);
    }
    // the reason under a category answer, written on its own (the card's text box)
    function setWhy(id, text) { var q = question(id), p = parseQ(id); if (!q || !p || p.kind !== 'cat') return no('Not a category question.'); if (!q.picked.length) return no('Pick No, Concern or Does not apply first.'); return answer(id, q.picked[0], { why: text }); }
    function toggleGate(id, key) { var q = question(id); if (!q) return no('No such question.'); var cur = q.picked.slice(), i = cur.indexOf(S(key)); if (i >= 0) cur.splice(i, 1); else cur.push(S(key)); return answer(id, cur); }

    // ---- status in words (derived, never typed; no counts) ----------------------------------------------------------------
    function statusOf(r) {
        if (!r) return { state: 'none', word: '' };
        if (!r.flow) return { state: 'earlier', word: 'Not substantiated yet' };
        var st = F().statusOf(r), pr = F().progress(r);
        if (pr.changed.length) return { state: 'reopened', word: 'Reopened' };
        return { state: { Open: 'open', 'In Progress': 'progress', Mitigated: 'substantiated' }[st] || (st === F().CLOSED ? 'closed' : 'open'), word: st === F().CLOSED ? 'Closed and accepted' : st === 'Mitigated' ? 'Substantiated' : st === 'In Progress' ? 'In progress' : 'Open' };
    }
    function statusWords(r) {
        var st = statusOf(r), gs = gatesOf(r).map(gateInfo), real = gs.filter(function (x) { return !x.gone && !x.notGate; });
        var at = 'at ' + listJoin(real.map(function (x) { return x.id; }));
        // what the status means for the DAL: only real AND gates carry a reduction
        var none = gs.length ? 'What it names is not an AND gate in the fault trees today, so no DAL reduction rests on it until its gates are picked again.' : 'No AND gate is named for it yet, so no DAL reduction rests on it.';
        var pending = real.length ? 'the DAL reduction ' + at + ' rests on the claim alone and is marked CMA pending.' : null;
        if (st.state === 'earlier') return 'Not substantiated yet. This claim was recorded before the common mode questionnaire was used: its categories have not been answered one by one, so it does not substantiate any independence. ' + (real.length ? 'The DAL reduction ' + at + ' stays marked CMA pending.' : none) + ' Answering its questions brings it up to date.';
        var pr = F().progress(r), f = r.flow;
        if (st.state === 'reopened') return 'Reopened: ' + listJoin(pr.changed.map(function (k) { return gateInfo(k).label; })) + ' changed after this claim was substantiated, so the DAL reduction there is marked CMA pending again until the analysis is brought up to date.';
        if (st.state === 'closed') return 'Closed and accepted: substantiated, then reviewed and signed on ' + S(f.signedAt).slice(0, 10) + '. ' + (real.length ? 'The independence holds, so the DAL reduction ' + at + ' stands. A change to any of its gates reopens it.' : none);
        if (st.state === 'substantiated') return 'Substantiated: every common mode category is answered with its reason and every concern is mitigated or accepted. ' + (real.length ? 'The independence holds, so the DAL reduction ' + at + ' stands. It is waiting for review and signature.' : none);
        if (!gs.length) return 'Open: ' + lcFirst(none);
        if (st.state === 'open') return 'Open: the gates are named but no common mode category has been answered yet. ' + (pending ? 'Until the analysis is complete, ' + pending : none);
        var miss = [], open = (f.concerns || []).filter(function (c) { return !concernDone(c); }).map(function (c) { return c.id; });
        if (!pr.claim) miss.push('the claim is not written');
        if (pr.answered < pr.cats) miss.push('some common mode categories are not answered yet, or have no reason written');
        if (open.length) miss.push((open.length === 1 ? 'concern ' : 'concerns ') + listJoin(open) + (open.length === 1 ? ' is' : ' are') + ' still open');
        return 'In progress: ' + listJoin(miss) + '. ' + (pending ? 'Until ' + (miss.length === 1 ? 'that is' : 'these are') + ' closed, ' + pending : none);
    }

    // ---- requirements raised from a concern ---------------------------------------------------------------------------
    function reqStores() { var out = [{ scope: 'aircraft', rows: arr('acReqData') }]; arr('systemsData').forEach(function (s) { if (s && Array.isArray(s.req)) out.push({ scope: T(s.name || s.id), rows: s.req }); }); return out; }
    function raisedReq(r, cc) {
        var tail = ':cma-concern:' + S(r.internalId) + ':' + S(cc.id), hit = null;
        reqStores().some(function (st) { hit = st.rows.find(function (q) { return q && q.reqSource && q.reqSource.generator === 'cma-concern' && S(q.reqSource.sourceId).slice(-tail.length) === tail; }) || null; return !!hit; });
        return hit ? { id: S(hit.id || ('REQ-' + hit.internalId)), text: T(hit.text), internalId: hit.internalId } : null;
    }
    function closeWords(r, cc) {
        if (cc.status === 'Accepted' && S(cc.acceptWhy).trim()) return 'Accepted as it stands: ' + T(cc.acceptWhy) + (/[.!?]$/.test(T(cc.acceptWhy)) ? '' : '.');
        if (cc.status === 'Mitigated' && cc.raise) {
            var rq = raisedReq(r, cc);
            return rq ? 'Closed by requirement ' + rq.id + ': "' + rq.text + '" It was raised from this concern and is traced to the gates.' : 'Closed by a requirement raised from this concern: "' + T(cc.reqText) + '" It is waiting on the requirements page to be accepted, when it takes its requirement ID.';
        }
        if (cc.status === 'Mitigated' && concernDone(cc)) return 'Closed with evidence: ' + T(cc.mitigation) + (/[.!?]$/.test(T(cc.mitigation)) ? '' : '.') + ' Backed by ' + T(cc.backedBy) + (/[.!?]$/.test(T(cc.backedBy)) ? '' : '.');
        return 'Still open: it needs a mitigation, backed by a requirement or evidence, or a written reason to accept it.' + (cc.defeats ? ' Until then it defeats the claim.' : '');
    }

    // ---- the figure: each gate with the inputs claimed independent -------------------------------------------------------
    var LIGHT = { paper: '#FFFFFF', ink: '#101216', box: '#F4F6FA', edge: '#5B6270', gate: '#E8F0FE', gateEdge: '#1A6EF2', bad: '#B42318', badFill: '#FDECEA', line: '#5B6270' };
    var DARK = { paper: '#15181E', ink: '#E8EAED', box: '#1E232B', edge: '#9AA1AD', gate: '#1B2A44', gateEdge: '#6AA6FF', bad: '#FF8A80', badFill: '#3A1D1B', line: '#9AA1AD' };
    function cut(s, n) { s = T(s); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }
    // a figure box: the frame's clickable node when the frame is here (it opens the node panel), else a plain group
    var _nodes = {};
    function nodeBox(id, inner) { var Rf = root.SLCcaReport; return Rf && Rf.nodeG ? Rf.nodeG('cma', id, inner) : '<g data-node="' + E(id) + '" style="cursor:pointer">' + inner + '</g>'; }
    function paletteOf(opts) {
        var c = opts && opts.C;
        if (c && c.ink) return { paper: c.paper, ink: c.ink, box: c.panel, edge: c.line, gate: c.onF, gateEdge: c.on, bad: c.bad, badFill: c.badF, line: c.line };
        return opts && opts.dark ? DARK : LIGHT;
    }
    function figure(r, anchor, opts) {
        var C = paletteOf(opts), gs = gatesOf(r).map(gateInfo).filter(function (x) { return !x.gone && !x.notGate; });
        if (!gs.length) return null;
        var openC = ((r.flow && r.flow.concerns) || []).filter(function (c) { return !concernDone(c); });
        var W = 720, y = 14, body = '', nodes = [], RH = 30;
        gs.forEach(function (x, gi) {
            var n = Math.max(1, x.inputs.length), h = n * RH + (n - 1) * 6, gy = y + h / 2 - 18, gid = anchor + '-g' + gi;
            body += nodeBox(gid, '<rect x="12" y="' + gy + '" width="250" height="36" rx="6" fill="' + C.gate + '" stroke="' + C.gateEdge + '" stroke-width="1.5"/>'
                + '<text x="22" y="' + (gy + 15) + '" font-size="11.5" font-weight="700" fill="' + C.ink + '">' + E(cut(x.id + ' AND', 34)) + '</text>'
                + '<text x="22" y="' + (gy + 29) + '" font-size="10.5" fill="' + C.ink + '">' + E(cut(x.name || x.tree, 40)) + '</text>');
            nodes.push({ id: gid, kind: 'gate', label: x.label, inputs: x.inputs.slice(), outputs: x.fcs.length ? x.fcs.map(fcWords) : ['The top event of "' + x.tree + '"'], accept: 'Its inputs shown to share no common cause: every category answered with why and every concern closed in ' + S(r.cmaId || 'this CMA') + '.' });
            x.inputs.forEach(function (inp, ii) {
                var iy = y + ii * (RH + 6), iid = gid + '-i' + ii;
                body += '<path d="M262,' + (gy + 18) + ' C300,' + (gy + 18) + ' 300,' + (iy + RH / 2) + ' 340,' + (iy + RH / 2) + '" fill="none" stroke="' + C.line + '" stroke-width="1.2"/>'
                    + nodeBox(iid, '<rect x="340" y="' + iy + '" width="' + (W - 352) + '" height="' + RH + '" rx="5" fill="' + C.box + '" stroke="' + C.edge + '"/>'
                    + '<text x="350" y="' + (iy + 19) + '" font-size="11" fill="' + C.ink + '">' + E(cut(inp, 56)) + '</text>');
                nodes.push({ id: iid, kind: 'input', label: inp, inputs: [], outputs: [x.label], accept: 'Fails on its own: no common mode category shared with the other inputs of ' + x.id + ' is left open.' });
            });
            y += h + 18;
        });
        if (openC.length) {
            var cy = y, cid = anchor + '-open';
            body += nodeBox(cid, '<rect x="12" y="' + cy + '" width="' + (W - 24) + '" height="30" rx="5" fill="' + C.badFill + '" stroke="' + C.bad + '" stroke-dasharray="5 3"/>'
                + '<text x="22" y="' + (cy + 19) + '" font-size="11" fill="' + C.ink + '">' + E(cut('Open: ' + openC.map(function (c) { return c.id + ' ' + c.text; }).join('; '), 104)) + '</text>');
            nodes.push({ id: cid, kind: 'concern', label: 'Concerns still open', inputs: openC.map(function (c) { return c.id + ': ' + T(c.text); }), outputs: gs.map(function (x) { return x.label; }), accept: 'Each one mitigated (a requirement or evidence) or accepted with the reason.' });
            y += 44;
        }
        var H = y + 4;
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="' + E('Inputs claimed independent, ' + S(r.cmaId)) + '"><rect width="100%" height="100%" fill="' + C.paper + '"/>' + body + '</svg>';
        nodes.forEach(function (n) { n.cma = r.internalId; _nodes[n.id] = n; });
        return { type: 'figure', id: anchor + '-fig', q: qid(r, 'gates'), lead: '{N} draws each gate with the inputs claimed independent.', caption: T('The inputs ' + (r.cmaId || 'this CMA') + ' claims independent, gate by gate'), svg: svg, w: W, h: H, nodes: nodes };
    }

    // ---- the report: one section per independence claim (pure: reads, never writes) ----------------------------------------
    function P(id, text, q, extra) { return Object.assign({ type: 'p', id: id, text: T(text), q: q || null }, extra || {}); }
    function sectionFor(r, opts) {
        var f = r.flow || null, anchor = 'cma-' + slug(r.cmaId || r.internalId), blocks = [], gq = qid(r, 'gates'), cq = qid(r, 'claim');
        var gs = gatesOf(r).map(gateInfo);
        // what it is about
        blocks.push(P(anchor + '-about', S(r.cmaId || 'This CMA') + ' covers ' + lcFirst(T(r.subject || 'an independence claim')) + (/[.!?]$/.test(T(r.subject)) ? '' : '.') + ' ' + (r.scope === 'system' && r.owningSystemId ? 'It is assessed for the ' + sysName(r.owningSystemId) + (/\bsystem$/i.test(sysName(r.owningSystemId)) ? '.' : ' system.') : 'It is assessed at the aircraft level.'), null, { field: 'subject' }));
        // the AND gates relying on it
        if (gs.length) {
            blocks.push(P(anchor + '-gates', 'These AND gates rely on this claim. Each fails only when all of its inputs fail, so its inputs must not share a cause that can fail them together.' + (gs.some(function (x) { return x.critical; }) ? ' A DAL reduction rests on the gates marked critical.' : ''), gq));
            blocks.push({ type: 'table', id: anchor + '-gates-t', q: gq, lead: '{N} lists them with the fault tree and failure condition each serves and the inputs claimed independent.', caption: T('AND gates relying on ' + (r.cmaId || 'this claim')), columns: ['Gate', 'Fault tree', 'Failure condition', 'Inputs claimed independent', 'DAL reduction rests on it'],
                rows: gs.map(function (x) { return { q: gq, cells: [x.label, x.tree || 'No longer in the project', x.fcs.length ? x.fcs.map(fcWords).join('; ') : 'Not linked to a failure condition', x.gone ? 'Not known: the gate is gone' : x.notGate ? 'None: it is not an AND gate, so nothing here is claimed independent' : x.inputs.join('; '), x.critical ? 'Yes, critical' : 'No'] }; }) });
            if (gs.some(function (x) { return x.gone || x.notGate; })) blocks.push(P(anchor + '-gates-fix', 'Some of what this claim names is not an AND gate in the fault trees today (it is gone, or it is not an AND gate with two or more inputs). Its gates need to be picked again for the claim to mean something in the trees.', gq));
            var fig = figure(r, anchor, opts); if (fig) blocks.push(fig);
        } else blocks.push(P(anchor + '-gates', 'No AND gate is named for this claim yet, so nothing in the fault trees rests on it.', gq));
        // the claim
        var claim = T(f ? f.claim : r.claim);
        blocks.push(P(anchor + '-claim', claim ? 'The claim: ' + claim + (/[.!?]$/.test(claim) ? '' : '.') : 'The claim has not been written yet.', cq));
        // the common modes checked
        var cats = catList(), ans = (f && f.answers) || {};
        blocks.push(P(anchor + '-modes', f ? 'Each common mode category was put to the inputs: could it fail more than one of them at once?' : 'This claim was recorded before the common mode questionnaire was used, so the categories have not been put to its inputs yet: could each one fail more than one of them at once?', null));
        blocks.push({ type: 'table', id: anchor + '-modes-t', q: null, lead: '{N} gives the answer and the reason for each category.', caption: T('Common modes checked for ' + (r.cmaId || 'this claim')), columns: ['Group', 'Category', 'Answer', 'Why'],
            rows: cats.map(function (c) { var a = ans[c.id] || {}; return { q: qid(r, 'cat', c.id), cells: [c.group === 'Development / design' ? 'Development and design' : c.group, c.name, a.a ? ANSWER_WORD[a.a] : 'Not answered yet', a.a ? (T(a.why) || 'No reason written yet') : ''] }; }) });
        // the concerns, their evidence and mitigations, and how each is closed
        var concerns = (f && f.concerns) || [];
        if (f) {
            if (!concerns.length) blocks.push(P(anchor + '-concerns', Object.keys(ans).length ? 'No common mode concern was raised for these inputs.' : 'No concern has been raised yet.', null));
            else {
                blocks.push(P(anchor + '-concerns', 'The concerns raised, what they do to the claim, and how each is closed:', null));
                concerns.forEach(function (cc) {
                    var catId = Object.keys(ans).find(function (k) { return ans[k].concernId === cc.id; }) || '', q = qid(r, 'concern', cc.id), qs = catId ? [q, qid(r, 'cat', catId)] : [q];
                    var from = cc.from === 'live detection' ? ' Found live in the fault trees.' : cc.from === 'added by hand' ? ' Added by hand.' : '';
                    blocks.push(P(anchor + '-c-' + slug(cc.id), cc.id + ', ' + T(cc.text) + (/[.!?]$/.test(T(cc.text)) ? '' : '.') + (cc.effect ? ' Effect on the claim: ' + T(cc.effect) + (/[.!?]$/.test(T(cc.effect)) ? '' : '.') : '') + from, catId ? qid(r, 'cat', catId) : q, { qs: qs, concern: cc.id }));
                    blocks.push(P(anchor + '-c-' + slug(cc.id) + '-close', closeWords(r, cc), q, { qs: [q], concern: cc.id }));
                });
                var reqs = concerns.filter(function (cc) { return cc.raise && S(cc.reqText).trim(); });
                if (reqs.length) blocks.push({ type: 'list', id: anchor + '-reqs', q: null, caption: 'Requirements raised from this analysis', items: reqs.map(function (cc) { var rq = raisedReq(r, cc); return { q: qid(r, 'concern', cc.id), text: T(rq ? rq.id + ' ' + rq.text : T(cc.reqText) + ' (waiting to be accepted on the requirements page)') }; }) });
            }
        } else {
            // an entry logged before the four steps: what it recorded, as it recorded it
            if (T(r.findings)) blocks.push(P(anchor + '-findings', 'Recorded findings: ' + T(r.findings) + (/[.!?]$/.test(T(r.findings)) ? '' : '.'), null, { field: 'findings' }));
            if (T(r.mitigation)) blocks.push(P(anchor + '-mitigation', 'Recorded mitigation: ' + T(r.mitigation) + (/[.!?]$/.test(T(r.mitigation)) ? '' : '.'), null, { field: 'mitigation' }));
        }
        if (T(r.references)) blocks.push(P(anchor + '-refs', 'Other references: ' + T(r.references) + (/[.!?]$/.test(T(r.references)) ? '' : '.'), null, { field: 'references' }));
        if (f && T(f.summary)) blocks.push(P(anchor + '-summary', T(f.summary), null, { field: 'summary' }));
        // the status, in words
        var st = statusOf(r);
        blocks.push(P(anchor + '-status', statusWords(r), null, { derived: true, state: st.state }));
        return { id: anchor, anchor: anchor, cma: r.internalId, cmaId: S(r.cmaId), title: T((r.cmaId ? r.cmaId + ' ' : '') + (r.subject || 'Independence claim')), state: st.state, stateWord: st.word, critical: isCritical(r), blocks: blocks };
    }
    function reportSections(opts) { return claims().map(function (r) { return sectionFor(r, opts || {}); }); }
    // the opening of the report: what the analysis is and how it was done (no counts, no status)
    function reportIntro() {
        return [
            P('cma-intro-purpose', 'This common mode analysis checks every independence claim the fault trees rest on. An AND gate counts on its inputs failing on their own; a common mode is a single cause that could fail more than one of them at once and defeat that claim.', null),
            P('cma-intro-method', 'Each claim names the AND gates relying on it. Its inputs are then put to every common mode category (ARP4761A Appendix M, as tailored by this project), each answered No, Concern or Does not apply, with the reason. Each concern is closed by a requirement, by evidence, or accepted with the reason. A claim is substantiated only when every category is answered and every concern is closed; until then the DAL reduction at its gates is marked CMA pending.', null)
        ];
    }
    // the blocks one question wrote (the frame scrolls to them and lights them up)
    function blocksFor(id) {
        var p = parseQ(id); if (!p || p.kind === 'start') return [];
        var r = rowById(p.iid); if (!r) return [];
        var out = [];
        sectionFor(r, {}).blocks.forEach(function (b) {
            if (b.q === id || (b.qs || []).indexOf(id) >= 0) out.push(b.id);
            (b.rows || b.items || []).forEach(function (x, i) { if (x.q === id) out.push(b.id + ':' + i); });
        });
        return out;
    }

    // ---- inputs and outputs, and their acceptance ----------------------------------------------------------------------
    function reportIO() {
        return {
            inputs: [
                { id: 'fta', what: 'The fault trees: every AND gate and its inputs', from: 'Fault trees', tab: 'fta' },
                { id: 'crit', what: 'Which AND gates a DAL reduction rests on (the critical gates)', from: 'The probability budgets and the DAL assignment', tab: 'dal-ref' },
                { id: 'arch', what: 'The architecture: power, hydraulics, data and other shared resources', from: 'The systems and the architecture assessment (PASA)', tab: 'pasa' },
                { id: 'zones', what: 'Where the equipment sits and how it is routed', from: 'The zonal safety analysis and the CAD model', tab: 'zsa' },
                { id: 'items', what: 'The item list: suppliers, software and hardware', from: 'Items', tab: 'items' },
                { id: 'live', what: 'Common causes found live in the fault trees', from: 'Live common cause detection', tab: 'cma' }
            ],
            outputs: [
                { id: 'dal', what: 'Independence shown at each gate, so its DAL reduction stands', to: 'The DAL assignment', tab: 'dal-ref' },
                { id: 'reqs', what: 'Requirements raised from the mitigations', to: 'Requirements and verification', tab: 'ac-req' },
                { id: 'ssa', what: 'Common mode findings, each closed', to: 'The system safety assessments (SSA)', tab: 'cma' }
            ],
            prose: [
                P('cma-io-in', 'The analysis needs the fault trees (every AND gate and its inputs), the critical gates from the probability budgets, the architecture and its shared resources, where the equipment sits and how it is routed, the item list with its suppliers, software and hardware, and the common causes found live in the trees.', null, { io: 'inputs' }),
                P('cma-io-out', 'It produces the independence shown at each gate, for the DAL assignment; the requirements raised from its mitigations, for requirements and verification; and its findings, each closed, for the system safety assessments.', null, { io: 'outputs' })
            ]
        };
    }
    function answerState(id) { var q = question(id); return q ? { p: q.picked, f: q.fields, c: q.complete } : null; }
    function reportOutputs() {
        var out = [], allConcern = [], allReq = [];
        claims().forEach(function (r) {
            var qs = questionsFor(r).map(function (q) { return q.id; });
            qs.forEach(function (id) { if (/\/concern\//.test(id)) { allConcern.push(id); var c = question(id); if (c && c.picked[0] === 'req') allReq.push(id); } });
            var gs = gatesOf(r).map(gateInfo);
            out.push({ id: 'cma.claim.' + S(r.internalId), cma: r.internalId, what: T('Independence ' + (gs.length ? 'at ' + listJoin(gs.map(function (x) { return x.id; })) : 'claimed') + ' substantiated (' + (r.cmaId ? r.cmaId + ' ' : '') + (r.subject || '') + ')'), to: ['The DAL assignment', 'The system safety assessments (SSA)'],
                accept: 'Every common mode category answered with its reason, every concern mitigated or accepted, reviewed and signed by the safety reviewer.', qids: qs });
        });
        out.push({ id: 'cma.reqs', what: 'Requirements raised from the mitigations', to: ['Requirements and verification'], accept: 'Each one says what shall be done, is traced to its CMA and gates, and is accepted on the requirements page.', qids: allReq });
        out.push({ id: 'cma.findings', what: 'Common mode findings, each closed', to: ['The system safety assessments (SSA)'], accept: 'Every concern closed by a requirement, evidence, or a written reason to accept it.', qids: allConcern });
        out.forEach(function (o) { o.fp = fpOf(o.qids.map(answerState)); });
        return out;
    }
    // one record of the acceptance: the frame's store, projectConfig.ccaReports.cma = { doc, accept } (v1.1). What v1.0 kept
    // in projectConfig.cmaAuto.accept is moved there once, an entry already in the frame's store winning.
    function migrateAccept(p) {
        if (!p || !p.cmaAuto || !p.cmaAuto.accept || typeof p.cmaAuto.accept !== 'object') return false;
        if (!p.ccaReports || typeof p.ccaReports !== 'object') p.ccaReports = {};
        var s = p.ccaReports.cma; if (!s || typeof s !== 'object') s = p.ccaReports.cma = {};
        if (!s.accept || typeof s.accept !== 'object') s.accept = {};
        Object.keys(p.cmaAuto.accept).forEach(function (k) { if (!s.accept[k]) s.accept[k] = p.cmaAuto.accept[k]; });
        delete p.cmaAuto.accept; if (!Object.keys(p.cmaAuto).length) delete p.cmaAuto;
        return true;
    }
    function store() {
        var p = pc(); if (!p) return { accept: {} };
        if (migrateAccept(p)) save();
        if (!p.ccaReports || typeof p.ccaReports !== 'object') p.ccaReports = {};
        var s = p.ccaReports.cma; if (!s || typeof s !== 'object') s = p.ccaReports.cma = {};
        if (!s.accept || typeof s.accept !== 'object') s.accept = {};
        return s;
    }
    function peekAccept() { var p = pc(); if (!p) return {}; var acc = (p.ccaReports && p.ccaReports.cma && p.ccaReports.cma.accept) || {}; var old = (p.cmaAuto && p.cmaAuto.accept) || {}; return Object.assign({}, old, acc); }
    function acceptance() { var acc = peekAccept(); return reportOutputs().map(function (o) { var a = acc[o.id]; return Object.assign({}, o, { state: !a ? 'open' : a.fp === o.fp ? 'accepted' : 'reopened', by: a && a.by, at: a && a.at }); }); }
    function acceptOutput(id) { var o = reportOutputs().find(function (x) { return x.id === id; }); if (!o) return no('No such output: ' + id); store().accept[id] = { by: who(), at: now(), fp: o.fp }; save(); return { ok: true }; }
    function unacceptOutput(id) { var s = store(); delete s.accept[id]; save(); return { ok: true }; }

    // ---- inline Edit and "Add a CMA" -------------------------------------------------------------------------------------
    function gateOptions(r) { var mine = gatesOf(r); return allGates().filter(function (x) { return mine.indexOf(x.key) >= 0 || !ownerOf(x.key); }).map(function (x) { var gi = gateInfo(x.key); return { value: x.key, label: gi.label + ' (' + gi.tree + ')' + (gi.critical ? ', critical' : '') }; }); }
    function levelOptions() { return [{ value: '', label: 'The aircraft' }].concat(arr('systemsData').filter(function (s) { return s && s.id; }).map(function (s) { return { value: S(s.id), label: 'The ' + T(s.name || s.id) + ' system' }; })); }
    function editFields(r) {
        var isNew = !r, f = r && r.flow;
        return {
            id: isNew ? null : r.internalId, cmaId: isNew ? '' : S(r.cmaId), title: isNew ? 'Add a CMA' : 'Edit ' + S(r.cmaId || 'this CMA'), isNew: isNew,
            fields: [
                { key: 'subject', label: 'What this analysis is about', type: 'text', value: isNew ? '' : S(r.subject), required: isNew ? false : true, help: 'A short name, for example "Elevator actuation lane independence". Written from the gates when left empty.' },
                { key: 'gates', label: 'AND gates relying on it', type: 'multi', value: isNew ? [] : gatesOf(r), options: gateOptions(r), help: 'A gate can be in one CMA only. Critical gates have a DAL reduction resting on them.' },
                { key: 'claim', label: 'The independence claim, in one sentence', type: 'textarea', value: isNew ? '' : S(f ? f.claim : r.claim), help: 'What must stay true for these gates to count on their inputs failing on their own.' },
                { key: 'level', label: 'Assessed for', type: 'select', value: isNew ? safe(function () { var v = root.SLLevelView.view(); return v == null ? '' : S(v); }, '') : (r.scope === 'system' ? S(r.owningSystemId) : ''), options: levelOptions() },
                { key: 'references', label: 'Other references', type: 'text', value: isNew ? '' : S(r.references), help: 'Documents, reviews or tests this analysis also relies on.' },
                { key: 'summary', label: 'Summary', type: 'textarea', value: isNew ? '' : S(f ? f.summary : ''), help: 'Optional: a closing summary for the report.' }
            ],
            save: function (values) { return isNew ? addCma(values) : saveEdit(r.internalId, values); }
        };
    }
    function norm(s) { return S(s).replace(/\s+/g, ' ').trim().toLowerCase(); }
    // the same CMA twice is refused: a gate already in a CMA, or a second CMA with the same subject
    function clash(values, except) {
        var N = ND(), probe = { internalId: except ? except.internalId : undefined, gates: (values.gates || []).map(String), subject: values.subject || '' };
        var hit = N ? N.cmaClash(probe, rows()) : null;
        if (!N) {
            for (var i = 0; i < probe.gates.length; i++) { var o = ownerOf(probe.gates[i]); if (o && o !== except) { hit = { row: o, kind: 'gate', gate: probe.gates[i] }; break; } }
            var subj = norm(probe.subject); if (!hit && subj) { var same = rows().find(function (c) { return c && c !== except && !c.suggested && norm(c.subject) === subj; }); if (same) hit = { row: same, kind: 'subject' }; }
        }
        if (!hit) return null;
        var why = hit.kind === 'gate' ? gateInfo(hit.gate).label + ' is already in ' + S(hit.row.cmaId || 'another CMA') + ': one CMA per set of gates. Edit that one instead.' : S(hit.row.cmaId || 'Another CMA') + ' already covers "' + T(hit.row.subject) + '". Edit that one instead.';
        return { why: why, existing: hit.row };
    }
    function applyLevel(r, level) { if (level == null) return; var lv = S(level); r.scope = lv ? 'system' : 'aircraft'; r.owningSystemId = lv; r.level = lv ? 'system' : 'aircraft'; }
    function addCma(values) {
        values = values || {};
        if (!F()) return no('The common mode analysis is not loaded.');
        var gs = (values.gates || []).map(String).filter(Boolean);
        if (!gs.length && !S(values.subject).trim()) return no('Name the AND gates relying on it, or say what it is about.');
        for (var i = 0; i < gs.length; i++) if (!gateIndex()[gs[i]] && !F().gateOf(gs[i])) return no('That gate is not in the fault trees.');
        var c = clash(values, null); if (c) return Object.assign(no(c.why), { existing: c.existing && c.existing.internalId });
        var lv = values.level != null ? S(values.level) : '';
        var r = F().create(gs, { subject: S(values.subject).trim(), systemId: lv || undefined });
        applyLevel(r, lv);
        if (S(values.claim).trim()) F().setClaim(r.internalId, S(values.claim).trim());
        if (S(values.references).trim()) r.references = S(values.references).trim();
        if (S(values.summary).trim()) r.flow.summary = S(values.summary).trim();
        F().sync(r);
        changed('cma/' + S(r.internalId)); return { ok: true, row: r };
    }
    function saveEdit(iid, values) {
        values = values || {};
        var r = rowById(iid); if (!r) return no('No such CMA.');
        if (values.subject != null && !S(values.subject).trim()) return no('Say what this analysis is about.');
        var c = clash({ gates: values.gates || [], subject: values.subject != null ? values.subject : '' }, r); if (c) return Object.assign(no(c.why), { existing: c.existing && c.existing.internalId });
        ensureFlow(r);
        if (values.subject != null) r.subject = S(values.subject).trim();
        if (Array.isArray(values.gates)) {
            var want = values.gates.map(String);
            r.flow.gates.slice().forEach(function (k) { if (want.indexOf(k) < 0) F().removeGate(r.internalId, k); });
            var refused = null;
            want.forEach(function (k) { if (!refused && r.flow.gates.indexOf(k) < 0) { var res = F().addGate(r.internalId, k); if (res && res.ok === false) refused = res.why; } });
            if (refused) { changed('cma/' + S(r.internalId)); return no(refused); }
        }
        if (values.claim != null && S(values.claim).trim() !== S(r.flow.claim)) F().setClaim(r.internalId, S(values.claim).trim());
        if (values.level != null) applyLevel(r, values.level);
        if (values.references != null) r.references = S(values.references).trim();
        if (values.summary != null) r.flow.summary = S(values.summary).trim();
        F().sync(r);
        try { if (typeof propagateDalAllRoots === 'function') propagateDalAllRoots(); } catch (_) {}   // eslint-disable-line no-undef
        changed('cma/' + S(r.internalId)); return { ok: true, row: r };
    }

    // ---- the questions, drawn (mounted by the report frame in its left pane; works on its own too) ----------------------
    var CSS = '.cmq{font-size:13.5px;line-height:1.45;color:var(--color-text-primary,#101216)}'
        + '.cmq-gh{font-size:14px;font-weight:700;margin:16px 0 4px}.cmq-gi{font-size:12.5px;margin:0 0 8px}'
        + '.cmq-q{border:1px solid var(--color-border,#e3e5e8);border-left:3px solid #1F7A33;border-radius:10px;padding:10px 12px;margin:0 0 8px;background:var(--color-surface-1,#fff)}.cmq-q.gap{border-left-color:#B26A00}'
        + '.cmq-q.sub{position:relative}.cmq-q.sub::before{content:"";position:absolute;left:-16px;top:-9px;width:12px;height:30px;border-left:2px solid var(--color-border-strong,#c7cbd1);border-bottom:2px solid var(--color-border-strong,#c7cbd1);border-bottom-left-radius:7px}'
        + '.cmq-qt{font-weight:600;margin-bottom:4px}.cmq-qx{font-size:12.5px;margin:0 0 8px}.cmq-opts{display:flex;flex-direction:column;gap:6px}'
        + '.cmq-opt{font:inherit;text-align:left;display:flex;justify-content:flex-start;gap:10px;align-items:flex-start;width:100%;padding:9px 12px;border-radius:10px;border:1.5px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer}'
        + '.cmq-opt:hover{border-color:#1A6EF2}.cmq-opt.on{border-color:#1A6EF2;background:rgba(26,110,242,.06)}.cmq-opt[disabled]{opacity:.55;cursor:default}'
        + '.cmq-mk{flex:none;width:16px;height:16px;border-radius:50%;border:2px solid #6b7280;margin-top:2px;box-sizing:border-box}.cmq-mk.sq{border-radius:4px}.cmq-opt.on .cmq-mk{border-color:#1A6EF2;background:#1A6EF2;box-shadow:inset 0 0 0 2.5px #fff}'
        + '.cmq-ol{display:block;font-weight:600}.cmq-oe{display:block;font-size:12.5px;margin-top:2px}.cmq-oc{display:block;font-size:12.5px;margin-top:2px}.cmq-oc b{font-weight:600}'
        + '.cmq-crit{display:inline-block;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:#14171C;color:#fff;margin-left:6px}'
        + '.cmq textarea,.cmq input[type=text]{font:inherit;font-size:13px;padding:6px 8px;border-radius:7px;border:1px solid var(--color-border-strong,#c7cbd1);width:100%;box-sizing:border-box;margin-top:6px;background:var(--color-surface-1,#fff);color:inherit}'
        + '.cmq-row{display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap}.cmq-btn{font:inherit;font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:8px;border:1px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer}.cmq-btn.p{background:#1A6EF2;border-color:#1A6EF2;color:#fff}'
        + '.cmq-claims{display:flex;flex-direction:column;gap:4px;max-height:300px;overflow:auto;margin:0 0 10px}.cmq-claim{font:inherit;text-align:left;display:flex;justify-content:flex-start;gap:8px;align-items:center;width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--color-border,#e3e5e8);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer}.cmq-claim.on{border-color:#1A6EF2;background:rgba(26,110,242,.06)}.cmq-cid{font-weight:700;font-size:12.5px;flex:none}.cmq-cs{flex:1;min-width:0;font-size:12.5px}'
        + '.cmq-gapt{font-size:12px;font-weight:600;color:#9A3412}.cmq-err{font-size:12.5px;font-weight:600;color:#B42318;margin-top:6px}'
        + 'body.theme-dark .cmq{color:#E8EAED}body.theme-dark .cmq-claim,body.theme-dark .cmq-q,body.theme-dark .cmq-opt,body.theme-dark .cmq textarea,body.theme-dark .cmq input[type=text],body.theme-dark .cmq-btn{background:#1E232B !important;color:#E8EAED !important;border-color:#3A414C}'
        + 'body.theme-dark .cmq-claim.on,body.theme-dark .cmq-opt.on{background:rgba(106,166,255,.10) !important;border-color:#6AA6FF}body.theme-dark .cmq-opt.on .cmq-mk{border-color:#6AA6FF;background:#6AA6FF;box-shadow:inset 0 0 0 2.5px #15181E}body.theme-dark .cmq-mk{border-color:#9AA1AD}'
        + 'body.theme-dark .cmq-gapt{color:#FFB37A}body.theme-dark .cmq-err{color:#FF8A80}body.theme-dark .cmq-btn.p{background:#1A6EF2 !important;color:#fff !important}';
    function style() { var d = root.document; if (!d || d.getElementById('cmq-css')) return; var s = d.createElement('style'); s.id = 'cmq-css'; s.textContent = CSS; (d.head || d.documentElement).appendChild(s); }
    var _ui = { showAll: {}, err: {} };
    function jsq(s) { return E(S(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
    function needBoxes(q, o) {
        var on = q.picked.indexOf(o.id) >= 0; if (!on || !o.needs) return '';
        var ph = { why: 'Why (it goes into the report as written)', text: q.id.slice(-6) === '/claim' ? 'The claim, in one sentence' : 'The design shall ...', mitigation: 'The mitigation: what keeps the shared cause from failing more than one input', evidence: 'The evidence that backs it: a test, an analysis or a document reference', reason: 'Why it is acceptable as it stands' };
        return '<div data-cmq-fields="' + E(q.id) + '">' + o.needs.map(function (k) { return '<textarea rows="2" data-cmq-field="' + E(k) + '" placeholder="' + E(ph[k]) + '">' + E(q.fields[k] || '') + '</textarea>'; }).join('')
            + '<div class="cmq-row"><button type="button" class="cmq-btn p" data-cmq-save="' + E(q.id) + '" onclick="SLCmaAuto.ui.saveFields(\'' + jsq(q.id) + '\',\'' + jsq(o.id) + '\', this)">Save</button></div></div>';
    }
    function qHtml(q) {
        // an answer that needs words first (a requirement, evidence, a reason, the claim in your own words): its boxes
        // show on the picked card before anything is written
        if (_ui.pend && _ui.pend.id === q.id && q.picked.indexOf(_ui.pend.opt) < 0) q = Object.assign({}, q, { picked: [_ui.pend.opt] });
        var multi = q.kind === 'multi', opts = q.options;
        if (multi && !_ui.showAll[q.id]) { var crit = opts.filter(function (o) { return o.critical || q.picked.indexOf(o.id) >= 0; }); if (crit.length && crit.length < opts.length) opts = crit; }
        var cards = opts.map(function (o) {
            var on = q.picked.indexOf(o.id) >= 0;
            return '<button type="button" class="cmq-opt' + (on ? ' on' : '') + '" role="' + (multi ? 'checkbox' : 'radio') + '" aria-checked="' + on + '" data-cmqopt="' + E(q.id + '|' + o.id) + '"' + (o.disabled ? ' disabled' : '') + ' onclick="SLCmaAuto.ui.pick(\'' + jsq(q.id) + '\',\'' + jsq(o.id) + '\')">'
                + '<span class="cmq-mk' + (multi ? ' sq' : '') + '"></span><span><span class="cmq-ol">' + E(o.label) + (o.critical ? '<span class="cmq-crit">Critical</span>' : '') + '</span>'
                + (o.means ? '<span class="cmq-oe">' + E(o.means) + '</span>' : '') + (o.changes ? '<span class="cmq-oc"><b>What this changes:</b> ' + E(o.changes) + '</span>' : '') + '</span></button>' + needBoxes(q, o);
        }).join('');
        var more = multi && opts.length < q.options.length ? '<div class="cmq-row"><button type="button" class="cmq-btn" onclick="SLCmaAuto.ui.showAll(\'' + jsq(q.id) + '\')">Show every AND gate</button></div>' : '';
        var gapTxt = q.complete ? '' : (q.picked.length ? 'Words still to write' : 'Not answered yet');
        return '<div class="cmq-q' + (q.depth ? ' sub' : '') + (q.complete ? '' : ' gap') + '" data-cmqbox="' + E(q.id) + '" data-cmqdepth="' + q.depth + '"' + (q.depth ? ' style="margin-left:' + (q.depth * 26) + 'px"' : '') + '>'
            + '<div class="cmq-qt">' + E(q.text) + (multi ? ' <span style="font-weight:400;font-size:12px;">Pick all that apply</span>' : '') + '</div>'
            + (q.intro ? '<div class="cmq-qx">' + E(q.intro) + '</div>' : '') + '<div class="cmq-opts" role="' + (multi ? 'group' : 'radiogroup') + '">' + (cards || '<div class="cmq-qx">Nothing to pick: every critical gate has its CMA.</div>') + '</div>' + more
            + (_ui.err[q.id] ? '<div class="cmq-err" data-cmqerr="' + E(q.id) + '">' + E(_ui.err[q.id]) + '</div>' : '')
            + '<div class="cmq-row">' + (q.picked.length && q.cma != null ? '<a href="javascript:void(0)" class="cmq-see" onclick="SLCmaAuto.ui.see(\'' + jsq(q.id) + '\')">See where it goes &rarr;</a>' : '') + (gapTxt ? '<span class="cmq-gapt">' + gapTxt + '</span>' : '') + '</div></div>';
    }
    function questionsHtml(iid) {
        style();
        var qs = iid != null ? questions(iid) : questions(), html = '', last = null;
        qs.forEach(function (q) { if (q.group && q.group !== last) { html += '<div class="cmq-gh">' + E(q.group) + '</div>' + (q.groupIntro ? '<div class="cmq-gi">' + E(q.groupIntro) + '</div>' : ''); last = q.group; } html += qHtml(q); });
        return '<div class="cmq" data-cmq="1">' + html + '</div>';
    }
    var _host = null, _hostCma = null;
    function mount(host, opts) { _host = host || null; _hostCma = opts && opts.cma != null ? opts.cma : null; redraw(); return _host; }
    function frame() { return root.SLCcaReport && root.SLCcaReport.get ? root.SLCcaReport.get('cma') : null; }
    // after an answer: the frame redraws both panes and lights up what the answer wrote; a standalone mount redraws itself
    function after(id, flashIt) { var R = frame(); if (R && document.getElementById('ccr-host-cma')) { if (flashIt) R.answered(id); else R.render(); } if (_host) redraw(); }
    function redraw() { if (_host) _host.innerHTML = questionsHtml(_hostCma); }

    // ---- the left pane on the frame: the claims, then the questions of the claim picked ----------------------------------
    function anchorOf(r) { return 'cma-' + slug(r.cmaId || r.internalId); }
    function rowBySec(sec) { return claims().find(function (r) { return anchorOf(r) === S(sec); }) || null; }
    function selected() {
        var list = claims(), r = _ui.sel != null ? rowById(_ui.sel) : null;
        if (r && list.indexOf(r) >= 0) return r;
        r = list.find(function (x) { var st = statusOf(x).state; return isCritical(x) && st !== 'closed' && st !== 'substantiated'; }) || list[0] || null;
        _ui.sel = r ? r.internalId : null; return r;
    }
    function select(iid) { var r = rowById(iid); if (!r) return false; _ui.sel = r.internalId; var R = frame(); if (R && document.getElementById('ccr-host-cma')) R.answered('sec:' + anchorOf(r)); if (_host) redraw(); return true; }
    var PILL = { closed: 'ok', substantiated: 'ok', progress: 'open', open: 'todo', earlier: 'todo', reopened: 'open' };
    function leftHtml() {
        style();
        var list = claims(), cur = selected(), start = startQuestion();
        var picker = '<div class="cmq-gh">Independence claims</div><div class="cmq-gi">Pick a claim to answer its questions; its section of the report lights up on the right. Claims a DAL reduction rests on come first.</div>'
            + '<div class="cmq-claims" role="listbox">' + list.map(function (r) {
                var st = statusOf(r), on = cur && r === cur;
                return '<button type="button" class="cmq-claim' + (on ? ' on' : '') + '" role="option" aria-selected="' + on + '" data-cmqclaim="' + E(r.internalId) + '" onclick="SLCmaAuto.ui.select(\'' + jsq(r.internalId) + '\')"><span class="cmq-cid">' + E(r.cmaId || '') + '</span><span class="cmq-cs">' + E(T(r.subject || 'Independence claim')) + '</span><span class="slap-pill ' + (PILL[st.state] || 'todo') + '">' + E(st.word) + '</span></button>';
            }).join('') + '</div>';
        var startHtml = start.options.length ? qHtml(start) : '';
        var body = cur ? questionsHtml(cur.internalId) : '<div class="cmq-qx">No independence claim yet. Use "Add a CMA" on the report, or start one on a critical gate above.</div>';
        return '<div class="cmq" data-cmq-left="1">' + picker + startHtml + '</div>' + body;
    }

    var ui = {
        select: function (iid) { return select(iid); },
        pick: function (id, opt) {
            var q = question(id); if (!q) return; delete _ui.err[id];
            var res;
            if (q.kind === 'multi') res = id === 'cma/start' ? answer(id, [opt]) : toggleGate(id, opt);
            else {
                var o = q.options.find(function (x) { return x.id === opt; }) || {};
                if ((o.needs || []).some(function (k) { return k !== 'why'; })) { res = { ok: true, pending: true }; _ui.pend = { id: id, opt: opt }; }
                else res = answer(id, opt, {});
            }
            if (res && !res.ok) _ui.err[id] = res.why;
            if (res && res.ok && res.created && res.created.length) { _ui.sel = res.created[0]; var r0 = rowById(res.created[0]); after('sec:' + anchorOf(r0), true); return res; }
            after(id, !!(res && res.ok && !res.pending));
            return res;
        },
        saveFields: function (id, opt, btn) {
            var box = btn && btn.closest ? btn.closest('[data-cmq-fields]') : null, fields = {};
            if (box) Array.prototype.forEach.call(box.querySelectorAll('[data-cmq-field]'), function (t) { fields[t.getAttribute('data-cmq-field')] = t.value; });
            var res = answer(id, opt, fields);
            if (!res.ok) _ui.err[id] = res.why; else { delete _ui.err[id]; if (_ui.pend && _ui.pend.id === id) _ui.pend = null; }
            after(id, res.ok); return res;
        },
        showAll: function (id) { _ui.showAll[id] = true; after(id, false); },
        // "See where it goes": the frame scrolls to what the answer wrote and lights it up
        see: function (id) { var R = frame(); if (R && document.getElementById('ccr-host-cma')) { root.SLCcaReport.act('cma', 'see', id); return true; } return blocksFor(id); }
    };

    // ---- the CMA page on the shared frame ---------------------------------------------------------------------------------
    function toFrame(b) {
        if (b.type === 'p') return [{ k: 'p', text: b.text, q: b.q || undefined }];
        if (b.type === 'table') return [{ k: 'table', name: b.id, title: b.caption, lead: b.lead, q: b.q || undefined, rowQ: b.rows.map(function (rw) { return rw.q || ''; }),
            rows: b.rows.map(function (rw) { var o = {}; b.columns.forEach(function (c, i) { o[c] = S(rw.cells[i]); }); return o; }) }];
        if (b.type === 'figure') return [{ k: 'fig', name: b.id, title: b.caption, lead: b.lead, svg: b.svg, w: b.w, h: b.h }];
        if (b.type === 'list') return [{ k: 'part', text: b.caption }].concat(b.items.map(function (it) { return { k: 'p', text: it.text, q: it.q || undefined }; }));
        return [];
    }
    function frameSections(ctx) {
        _nodes = {};
        return claims().map(function (r) { var sec = sectionFor(r, { C: ctx && ctx.C, dark: ctx && ctx.dark }); return { id: sec.anchor, title: sec.title, blocks: [].concat.apply([], sec.blocks.map(toFrame)) }; });
    }
    function frameFront() { return [{ k: 'h', level: 1, text: 'Purpose and method' }].concat(reportIntro().map(function (b) { return { k: 'p', text: b.text }; })); }
    function nodePanel(id) {
        if (!_nodes[id]) frameSections({});
        var n = _nodes[id]; if (!n) return { title: id };
        var does = { gate: 'An AND gate: it fails only when all its inputs fail, so this CMA must show the inputs share no single cause.', input: 'An input of the gate, claimed to fail on its own.', concern: 'The concerns still open in this CMA. Each defeats or holds back the claim until it is closed.' }[n.kind] || '';
        return { title: n.label, does: does, inputs: n.inputs, outputs: (n.outputs || []).map(function (w) { return { what: w, accept: n.accept }; }), tab: n.kind === 'concern' ? '' : 'fta' };
    }
    function nodeLive(id) { if (!_nodes[id]) frameSections({}); var n = _nodes[id]; var r = n && rowById(n.cma); return r ? S(r.cmaId) + ': ' + lcFirst(statusOf(r).word) : ''; }
    function frameFields(sec) {
        var r = sec ? rowBySec(sec) : null;
        return editFields(r).fields.map(function (f) { return { key: f.key, label: f.label, type: f.type === 'multi' ? 'checks' : f.type, value: f.value, hint: f.help || '', options: (f.options || []).map(function (o) { return [o.value, o.label]; }) }; });
    }
    function frameSave(sec, values) {
        var r = sec ? rowBySec(sec) : null; if (sec && !r) return { ok: false, err: 'That CMA is no longer in the project.' };
        var res = editFields(r).save(values || {});
        if (!res.ok) return { ok: false, err: res.why };
        _ui.sel = res.row.internalId; forget();
        return { ok: true, id: anchorOf(res.row) };
    }
    var ROLE_CLAIM = 'Chief safety engineer', ROLE_REQ = 'Aircraft safety lead';
    function frameOutputs() { return reportOutputs().map(function (o) { var fp = o.fp; return { id: o.id, what: o.what, to: o.to.join(' and '), accept: o.accept, role: o.id === 'cma.reqs' ? ROLE_REQ : ROLE_CLAIM, fp: function () { return fp; } }; }); }
    function frameIO() {
        var io = reportIO();
        return { does: 'Checks that the inputs of every AND gate the fault trees count on share no single cause that can fail them together',
            inputs: io.inputs, outputs: io.outputs.map(function (o) { return Object.assign({}, o, { accept: { dal: 'Every claim behind the gate substantiated and its CMA signed', reqs: 'Each requirement accepted on the requirements page and traced to its CMA', ssa: 'Every concern closed by a requirement, evidence or a written reason' }[o.id] || '', role: o.id === 'reqs' ? ROLE_REQ : ROLE_CLAIM }); }) };
    }
    var _defined = false;
    function defineFrame() {
        if (_defined) return true;
        if (!root.SLCcaReport || !root.SLCcaReport.define || !root.document || !root.document.getElementById('view-cma') || !tableHidden()) return false;
        try { var p0 = pc(); if (migrateAccept(p0)) save(); } catch (_) {}
        root.SLCcaReport.define({
            key: 'cma', viewId: 'view-cma', leftId: 'cma-auto-host', title: 'Common Mode Analysis', code: 'CMA', sectionsTitle: 'The independence claims',
            lead: 'Each independence claim is a section of the report on the right: the AND gates relying on it, the common modes checked, the concerns and how each is closed, and where it stands. The Autopilot on the left asks the questions claim by claim; Edit a section or add a CMA to change what the report says.',
            front: frameFront, sections: frameSections, renderQuestions: function () { return leftHtml(); },
            edit: { addLabel: 'Add a CMA', fields: frameFields, save: frameSave },
            io: frameIO(), outputs: frameOutputs, node: nodePanel, live: nodeLive, onShow: function () { forget(); }
        });
        _defined = true;
        wireRedirects();
        return true;
    }
    // with the table gone, "Review in CMA" (the critical gates panel) and Edit on a CMA open it in the report
    function wireRedirects() {
        var CG = root.SLCriticalGates;
        if (CG && !CG._cmaAuto) {
            var prevReview = CG.startReview;
            CG.startReview = function (key) {
                if (!tableHidden()) return prevReview.apply(this, arguments);
                try { if (typeof root.switchTab === 'function') root.switchTab('cma'); } catch (_) {}
                var have = ownerOf(key);
                if (!have) { var res = addCma({ gates: [key] }); if (!res.ok) return res; have = res.row; }
                select(have.internalId); return { ok: true, row: have };
            };
            CG._cmaAuto = true;
        }
        if (typeof root.editCMA === 'function' && !root.editCMA._cmaAuto) {
            var prevEdit = root.editCMA;
            root.editCMA = function (iid) {
                if (!tableHidden()) return prevEdit.apply(this, arguments);
                var r = rowById(iid); if (!r) return;
                try { if (typeof root.switchTab === 'function') root.switchTab('cma'); } catch (_) {}
                _ui.sel = r.internalId; root.SLCcaReport.act('cma', 'edit', anchorOf(r));
            };
            root.editCMA._cmaAuto = true;
        }
        // the report follows every change to the CMA rows (live detection, imports, undo): redrawn once, when on screen
        if (typeof root.renderCMA === 'function' && !root.renderCMA._cmaAuto) {
            var rc = root.renderCMA, t = null;
            root.renderCMA = function () {
                var out = rc.apply(this, arguments);
                if (t) clearTimeout(t);
                t = setTimeout(function () { t = null; try { forget(); var v = document.getElementById('view-cma'), R = frame(); if (R && v && v.style.display !== 'none' && tableHidden()) R.render(); } catch (_) {} }, 120);
                return out;
            };
            root.renderCMA._cmaAuto = true;
        }
    }
    if (root.document && typeof setInterval === 'function') { var _tries = 60, _t = setInterval(function () { if (defineFrame() || --_tries <= 0) clearInterval(_t); }, 250); }

    // ---- the table switch ------------------------------------------------------------------------------------------------
    var _hideOverride = null;
    function tableHidden() { return _hideOverride == null ? HIDE_CMA_TABLE_UI : !!_hideOverride; }
    function applyTableSwitch() {
        var d = root.document; if (!d) return;
        var css = d.getElementById('cma-auto-table-switch');
        if (tableHidden()) {
            if (!css) { css = d.createElement('style'); css.id = 'cma-auto-table-switch'; (d.head || d.documentElement).appendChild(css); }
            css.textContent = '#view-cma #cma-table-wrap,#view-cma #cma-flow-host,#view-cma #cma-legacy-form,#view-cma #cma-scope-chips{display:none !important}';
        } else if (css) css.parentNode.removeChild(css);
        var h = d.getElementById('ccr-host-cma'); if (h) h.style.display = tableHidden() ? '' : 'none';
    }
    function setTableHidden(v) { _hideOverride = v == null ? null : !!v; applyTableSwitch(); if (tableHidden()) defineFrame(); }
    if (root.document && typeof root.addEventListener === 'function') root.addEventListener('load', function () { try { applyTableSwitch(); defineFrame(); } catch (_) {} });
    try { applyTableSwitch(); } catch (_) {}

    var api = { VERSION: VERSION, HIDE_CMA_TABLE_UI: HIDE_CMA_TABLE_UI, tableHidden: tableHidden, setTableHidden: setTableHidden, applyTableSwitch: applyTableSwitch,
        questions: questions, question: question, answer: answer, setWhy: setWhy, toggleGate: toggleGate, subscribe: subscribe,
        claims: claims, statusOf: statusOf, statusWords: statusWords, draftClaim: draftClaim, ownerOf: ownerOf, gateInfo: gateInfo, categoriesPlain: catList,
        reportSections: reportSections, reportIntro: reportIntro, reportIO: reportIO, reportOutputs: reportOutputs, blocksFor: blocksFor,
        acceptance: acceptance, acceptOutput: acceptOutput, unacceptOutput: unacceptOutput,
        editFields: editFields, addCma: addCma, saveEdit: saveEdit,
        questionsHtml: questionsHtml, leftHtml: leftHtml, mount: mount, redraw: redraw, ui: ui, forget: forget,
        selected: function () { var r = selected(); return r ? r.internalId : null; }, select: select, anchorOf: anchorOf, frame: frame, defineFrame: defineFrame, node: nodePanel };
    try { root.SLCmaAuto = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
