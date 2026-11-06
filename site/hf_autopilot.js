// hf_autopilot.js (SLHfAuto v1.0, 6 Nov 2026): the HF Autopilot on the Human Factors page.
//
// Waqas: "how do we make our human factors assessments way more intuitive"; "lets get it fixed, make sure we have full
// end to end coverage on a typical aircraft design cycle". Before this the HF work was ten tabs of tables in no
// particular order, written in the standards' words, with nothing saying where to start or how the pieces join.
//
// The Autopilot walks the human factors side of the design cycle in order, one plain question at a time, built from
// the project (the aircraft functions, the FHA's failure conditions and their crew effects, the flight phases, the
// items, the HF assumptions). Every answer is written into the existing HF tables, which stay the detailed view:
//   Concept              1 alloc   who does each aircraft function: the crew, the automation, or both
//   Preliminary design   2 tid     the crew procedures: a normal task per crew function, a non-normal or emergency
//                                  procedure per failure condition the crew has to deal with
//                        3 load    how long each task takes (time to notice and decide, time to act), measured or
//                                  estimated, never filled in by the tool; a chart per flight phase against 80%
//                        4 err     the five ways a crew task goes wrong (NUREG/CR-1278), how the crew would notice,
//                                  how they recover, and the failure condition each error feeds
//                        5 alert   how the crew is told about each failure condition (14 CFR 25.1322)
//   Detailed design      6 cd      the four questions of 14 CFR 25.1302 for each flight deck control and display
//                        7 sa      what the crew needs to see, understand and anticipate in each flight phase
//                        8 ergo    reach (25.777) and view (25.1321) for each flight deck control and display
//   Certification        9 mfc     the six workload functions and ten factors of Part 25 Appendix D, then the
//                                  minimum crew (25.1523)
//                       10 credit  which crew actions the safety analysis counts on (each becomes an HF assumption on
//                                  the register) and how each will be shown to hold
// Answers: projectConfig.hfAuto = { v:1, answers: { qid: { pick, by, at, ... } }, signed: { stage: { by, at } },
// interfaces: [names] }. Rows the Autopilot writes carry hfAutoKey (one row per question, adopted, never duplicated);
// rows already in a table are read as answers and left as they are. A changed answer reopens the stage's sign-off.
// Deterministic: no AI, no invented numbers (task times are typed by the engineer, with where they came from).
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function U() { return root.SLAutopilotUI; }
    function HF() { return root.HF_ANALYSES; }
    function _g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function _arr(a) { return Array.isArray(a) ? a : []; }
    function S(v) { return String(v == null ? '' : v).trim(); }
    function E(s) { return U() ? U().E(s) : S(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function J(v) { return E(JSON.stringify(v)); }
    function _pc() { return _g('projectConfig') || {}; }
    function _store() {
        var pc = _pc(); var s = pc.hfAuto;
        if (!s || typeof s !== 'object') s = pc.hfAuto = { v: 1, answers: {}, signed: {}, interfaces: [] };
        s.answers = s.answers || {}; s.signed = s.signed || {}; s.interfaces = _arr(s.interfaces);
        return s;
    }
    function _peek() { var s = _pc().hfAuto; return (s && typeof s === 'object') ? s : { answers: {}, signed: {}, interfaces: [] }; }
    function _lane(kind) { var pc = _pc(); pc.hf = pc.hf || {}; pc.hf[kind] = pc.hf[kind] || { rows: [] }; if (!Array.isArray(pc.hf[kind].rows)) pc.hf[kind].rows = []; return pc.hf[kind]; }
    function _laneRows(kind) { var pc = _pc(); return _arr(pc.hf && pc.hf[kind] && pc.hf[kind].rows); }
    function _who() { return U() ? U().who() : 'Engineer'; }
    function _now() { return new Date().toISOString(); }
    function _save() { try { if (U()) U().save(); else if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }
    function _stampLevel(kind, row) { try { if (root.SLLevelView && root.SLLevelView.stamp) root.SLLevelView.stamp(kind, row, null); } catch (_) {} return row; }
    function _nextId(rows, field, prefix) { var mx = 0; rows.forEach(function (r) { var m = /(\d+)$/.exec(S(r && r[field])); if (m) mx = Math.max(mx, +m[1]); }); return prefix + String(mx + 1).padStart(3, '0'); }
    function _short(s, n) { s = S(s); return s.length > (n || 70) ? s.slice(0, (n || 70) - 1) + '…' : s; }

    // ---- the project ---------------------------------------------------------------------------------------
    function functions() { return _arr(_g('acFunctionsData')).filter(function (f) { return f && f.internalId != null; }); }
    function fnLabel(f) { return S(f.subName || f.funcName || f.subId || f.funcId); }
    var NO_CREW = /^(none|no crew effect|n\/?a|-|—)?$/i;
    function crewFcs() {
        return _arr(_g('acFhaData')).filter(function (f) { return f && S(f.fcId) && !NO_CREW.test(S(f.effCrew)); });
    }
    function fcById(id) { return _arr(_g('acFhaData')).find(function (f) { return f && S(f.fcId) === S(id); }) || null; }
    function fcLabel(f) { return f ? S(f.fcId) + ' ' + _short(f.fcDesc || f.failureCondition || '', 80) : ''; }
    function phases() { var p = []; try { p = HF().projectPhaseOptions(); } catch (_) {} return p.filter(function (x) { return x && !/^all phases$/i.test(x); }); }
    function _phaseList(v) { return S(v).split(',').map(S).filter(Boolean); }
    // the flight deck controls and displays: items that are one by their name, the alerts, and any the engineer adds
    var IFACE = /\b(display|indicator|annunciat|control panel|panel|switch|lever|throttle|thrust lever|side ?stick|yoke|control column|pedal|keyboard|cursor control|knob|selector|warning light|head-up|hud|mfd|pfd|efb|chime)\b/i;   // a 'control unit' is a box in a bay, not a flight deck control
    function interfaces() {
        var out = [], seen = {};
        var add = function (name, kind, from) { var k = S(name).toLowerCase(); if (!k || seen[k]) return; seen[k] = 1; out.push({ key: 'if:' + k.replace(/[^a-z0-9]+/g, '-'), name: S(name), kind: kind, from: from }); };
        _arr(_g('itemsData')).forEach(function (it) { if (it && !/control unit|computer|actuator|sensor|valve|pump/i.test(S(it.name)) && (IFACE.test(S(it.name)) || /^(display|control)s?$/i.test(S(it.type)))) add(it.name, /display|indicator|pfd|mfd|hud/i.test(S(it.name)) ? 'Display' : 'Control', 'From item ' + S(it.itemId) + '.'); });
        _laneRows('alerts').forEach(function (a) { if (a && S(a.name)) add(a.name + ' (alert)', 'Alerting', 'From alert ' + S(a.alertId) + ' (step 5).'); });
        _peek().interfaces.forEach(function (n) { add(n, /display|indicator/i.test(n) ? 'Display' : 'Control', 'Added in the HF Autopilot.'); });
        return out;
    }

    // ---- answers ------------------------------------------------------------------------------------------
    function answerOf(qid) { return _peek().answers[qid] || null; }
    function _set(qid, a, stage) {
        var s = _store(); a.by = _who(); a.at = _now(); s.answers[qid] = a;
        if (stage && s.signed[stage]) delete s.signed[stage];   // a changed answer reopens the stage
    }
    function _row(kind, key) { return _laneRows(kind).find(function (r) { return r && r.hfAutoKey === key; }) || null; }
    function _upsert(kind, key, idField, prefix, fields, levelKind) {
        var st = _lane(kind), row = _row(kind, key);
        if (!row) { row = { hfAutoKey: key, origin: 'hf-autopilot' }; row[idField] = _nextId(st.rows, idField, prefix); if (levelKind) _stampLevel(levelKind, row); st.rows.push(row); }
        Object.keys(fields).forEach(function (k) { row[k] = fields[k]; });
        return row;
    }
    function _drop(kind, key) { var st = _lane(kind); var i = st.rows.findIndex(function (r) { return r && r.hfAutoKey === key; }); if (i >= 0) st.rows.splice(i, 1); }

    // ---- the plain words ----------------------------------------------------------------------------------
    var ERR = [
        { mode: 'omission', label: 'Leaves a step out', desc: 'Skips an action the task needs. For example, a checklist item is missed after an interruption.' },
        { mode: 'commission', label: 'Does the wrong action', desc: 'Does something that is not right for the situation. For example, shuts down the healthy engine instead of the failed one.' },
        { mode: 'timing', label: 'Acts too early or too late', desc: 'The right action at the wrong time, or held too long. For example, responds after the time the failure leaves.' },
        { mode: 'sequence', label: 'Does the steps in the wrong order', desc: 'The right actions in the wrong order. For example, moves a selector before the protection behind it is armed.' },
        { mode: 'selection', label: 'Picks the wrong control or display', desc: 'Uses the wrong switch, lever or display. For example, operates a similar-looking switch next to the right one.' }
    ];
    var DETECT = [
        { id: 'alert', label: 'An alert tells them', desc: 'A warning, caution or message on the flight deck points it out. That alert belongs in step 5.' },
        { id: 'xcheck', label: 'The other pilot catches it', desc: 'The other pilot\'s monitoring, a callout or a challenge and response catches it before it matters.' },
        { id: 'response', label: 'The aircraft responds', desc: 'The aircraft moves, sounds or feels wrong in a way the crew is trained to notice.' },
        { id: 'none', label: 'Nobody notices in time', desc: 'Nothing points it out before it matters. This stays open: the design or the procedure has to change.' }
    ];
    var RECOVER = [
        { id: 'procedure', label: 'A crew procedure', desc: 'A checklist or a trained action undoes it before the effect happens.' },
        { id: 'protection', label: 'An automatic protection', desc: 'The aircraft limits or reverses it on its own, for example envelope protection or an interlock.' },
        { id: 'none', label: 'Too late to put right', desc: 'By the time it is noticed the effect has happened. This stays open: the design or the procedure has to change.' }
    ];
    var CD = [
        { id: 'a', cons: '(a) information to perform the task', label: 'Gives the crew the information they need for their tasks' },
        { id: 'b', cons: '(b) usable by the qualified crew', label: 'A trained crew can reach, read and operate it' },
        { id: 'c', cons: '(c) predictable & unambiguous behavior', label: 'Behaves predictably, with no room for confusion' },
        { id: 'd', cons: '(d) error management (detect & recover)', label: 'Lets the crew notice and undo their own mistakes' }
    ];
    var SA = [
        { id: 'L1', level: 'L1 Perception', label: 'See what they need (aircraft state, flight path, threats)' },
        { id: 'L2', level: 'L2 Comprehension', label: 'Understand what it means for the flight' },
        { id: 'L3', level: 'L3 Projection', label: 'Anticipate what happens next' }
    ];
    var ERGO = [
        { id: 'reach', clause: '14 CFR 25.777 (cockpit controls: location, reach, movement)', label: 'Every crew member who uses it can reach and operate it from their seat' },
        { id: 'view', clause: '14 CFR 25.1321 (arrangement and visibility of instruments)', label: 'It can be seen and read from the pilot\'s normal position, in all lighting' }
    ];
    var MFC_ROLES = [{ id: 'PF', label: 'PF', desc: 'The pilot flying.' }, { id: 'PM', label: 'PM', desc: 'The pilot monitoring.' }, { id: 'Shared', label: 'Both', desc: 'Both pilots share it.' }, { id: 'Automation', label: 'Automation', desc: 'The automation does it; the crew monitors.' }];
    var BEDFORD = ['Insignificant', 'Low', 'Enough spare capacity', 'Some spare capacity', 'Reduced spare capacity', 'Little spare capacity', 'Very little spare capacity', 'Very high', 'Extreme', 'Task abandoned'];
    var PLAN = [
        { id: 'sim', label: 'Simulator campaign with line pilots' }, { id: 'flight', label: 'Flight test' },
        { id: 'analysis', label: 'Analysis (task timing and workload)' }, { id: 'bench', label: 'Bench or part-task trial' }
    ];
    var STAGES = [
        { key: 'alloc', n: 1, phase: 'Concept', title: 'Who does what', what: 'Each aircraft function goes to the crew, the automation, or both.' },
        { key: 'tid', n: 2, phase: 'Preliminary design', title: 'Crew procedures', what: 'What the crew does in normal operation, and when each failure condition happens.' },
        { key: 'load', n: 3, phase: 'Preliminary design', title: 'How busy the crew is', what: 'How long each task takes, against the time the flight phase leaves for it.' },
        { key: 'err', n: 4, phase: 'Preliminary design', title: 'What the crew could get wrong', what: 'The five ways a task goes wrong, how they would notice, how they recover, and what it leads to.' },
        { key: 'alert', n: 5, phase: 'Preliminary design', title: 'How the crew is told', what: 'Warning, caution or advisory for each failure condition, and how it reaches them.' },
        { key: 'cd', n: 6, phase: 'Detailed design', title: 'Controls and displays', what: 'The four questions of 25.1302 for each flight deck control and display.' },
        { key: 'sa', n: 7, phase: 'Detailed design', title: 'Situation awareness', what: 'What the crew needs to see, understand and anticipate in each flight phase.' },
        { key: 'ergo', n: 8, phase: 'Detailed design', title: 'Reach and view', what: 'Each control and display can be reached and seen from the crew seats.' },
        { key: 'mfc', n: 9, phase: 'Certification', title: 'Minimum crew', what: 'The six workload functions and ten factors of Appendix D, then the crew size (25.1523).' },
        { key: 'credit', n: 10, phase: 'Certification', title: 'Credit and evidence', what: 'The crew actions the safety analysis counts on, and how each is shown to hold.' }
    ];

    // ---- the questions --------------------------------------------------------------------------------------
    function _allocOf(f) {
        var a = answerOf('alloc:' + f.internalId); if (a) return a.pick;
        var r = _laneRows('alloc').find(function (x) { return x && S(x.key) === S(f.internalId); });
        return r && r.allocation ? S(r.allocation).toLowerCase() : null;
    }
    function _tidRows() { return _laneRows('tid').filter(function (r) { return r && S(r.taskName || r.taskDef); }); }
    function _taskRowFor(t) { return _laneRows('tasks').find(function (r) { return r && (S(r.tidId) === S(t.taskId) || (t.hfAutoKey && r.hfAutoKey === 'load:' + t.taskId)); }) || null; }
    function compute() {
        var st = _peek(), res = { stages: [], byKey: {} };
        var mk = function (key) { var d = STAGES.find(function (x) { return x.key === key; }); var s = { key: key, def: d, questions: [] }; res.stages.push(s); res.byKey[key] = s; return s; };
        var funcs = functions(), fcs = crewFcs();
        // 1 who does what
        var s1 = mk('alloc');
        funcs.forEach(function (f) {
            var pick = _allocOf(f);
            s1.questions.push({ id: 'alloc:' + f.internalId, stage: 'alloc', kind: 'pick', subject: fnLabel(f), picked: pick, done: !!pick,
                text: 'Who does "' + fnLabel(f) + '"?', why: (S(f.subDef) ? E(_short(f.subDef, 220)) + '<br>' : '') + 'Part of ' + E(S(f.funcId) + ' ' + S(f.funcName)) + '.',
                options: [
                    { id: 'crew', label: 'The crew', impact: 'A crew task in normal operation, with its workload and errors analyzed.' },
                    { id: 'automation', label: 'The automation', impact: 'No routine crew task; the crew is told when the automation cannot do it.' },
                    { id: 'shared', label: 'Both: the automation does it, the crew watches and takes over', impact: 'A monitoring task for the crew, and a takeover when the automation hands back.' }
                ], apply: function (pick) { HF().setAlloc(f.internalId, 'allocation', pick); var r = _laneRows('alloc').find(function (x) { return S(x.key) === S(f.internalId); }); if (r && !S(r.rationale)) r.rationale = 'Chosen in the HF Autopilot by ' + _who() + '.'; } });
        });
        // 2 crew procedures
        var s2 = mk('tid');
        funcs.forEach(function (f) {
            var al = _allocOf(f); if (al !== 'crew' && al !== 'shared') return;
            var qid = 'tidn:' + f.internalId, a = answerOf(qid);
            s2.questions.push({ id: qid, stage: 'tid', kind: 'pick', subject: fnLabel(f) + ' (normal)', picked: a ? a.pick : null, done: !!a,
                text: 'How does the crew handle "' + fnLabel(f) + '" in normal operation?', why: al === 'shared' ? 'The automation does it and the crew watches.' : 'The crew does it.',
                options: [
                    { id: 'PF', label: 'The pilot flying, hands-on', impact: 'A normal task for the pilot flying, in every flight phase.' },
                    { id: 'PM', label: 'The pilot monitoring watches it and calls out', impact: 'A monitoring task for the pilot monitoring.' },
                    { id: 'Both', label: 'Both pilots, with a cross-check', impact: 'A task for both pilots: a cross-check or challenge and response.' },
                    { id: 'none', label: 'No routine crew task', impact: 'Nothing is added to the crew procedures for this function.' }
                ], apply: function (pick) {
                    var key = 'tid:n:' + f.internalId;
                    if (pick === 'none') { _drop('tid', key); return; }
                    _upsert('tid', key, 'taskId', 'TSK-', { procId: S(f.funcId), procName: S(f.funcName), opsMode: 'Normal', phase: 'All phases', taskName: fnLabel(f) + ' (normal operation)',
                        taskDef: al === 'shared' ? 'Monitor the automation doing it; take over when it hands back.' : 'Do it by hand.', crew: pick, trigger: 'Normal operation', source: 'HF Autopilot: function ' + S(f.subId || f.funcId), notes: '' }, 'hfTid');
                } });
        });
        fcs.forEach(function (fc) {
            var qid = 'tidf:' + fc.fcId, a = answerOf(qid);
            s2.questions.push({ id: qid, stage: 'tid', kind: 'pick', subject: S(fc.fcId) + ' procedure', picked: a ? a.pick : null, done: !!a,
                text: 'What does the crew do when this happens: ' + _short(fc.fcDesc, 140) + '?',
                why: 'The FHA says the crew effect is: <b>' + E(fc.effCrew) + '</b> (' + E(fc.severity || '') + (fc.phases ? ', ' + E(fc.phases) : '') + ').',
                options: [
                    { id: 'nonnormal', label: 'A non-normal procedure: the pilot flying flies, the pilot monitoring runs the checklist', impact: 'A non-normal crew task, analyzed for time and errors.' },
                    { id: 'emergency', label: 'An emergency: memory actions by both pilots, then the checklist', impact: 'An emergency crew task, analyzed for time and errors.' },
                    { id: 'auto', label: 'Nothing: the aircraft handles it on its own', impact: 'No crew task. The automatic response has to be shown in the system safety analysis.' },
                    { id: 'none', label: 'Nothing the crew can do: it cannot be recovered', impact: 'No crew task, and no crew credit for this failure condition.' }
                ], apply: function (pick) {
                    var key = 'tid:f:' + fc.fcId;
                    if (pick === 'auto' || pick === 'none') { _drop('tid', key); return; }
                    _upsert('tid', key, 'taskId', 'TSK-', { procId: S(fc.fcId), procName: (pick === 'emergency' ? 'Emergency: ' : 'Non-normal: ') + _short(fc.fcDesc, 80), opsMode: pick === 'emergency' ? 'Emergency' : 'Non-normal',
                        phase: S(fc.phases) || 'All phases', taskName: 'Recognize and respond: ' + _short(fc.fcDesc, 100), taskDef: S(fc.effCrew), crew: 'Both', trigger: S(fc.fcId) + ': ' + _short(fc.fcDesc, 100), source: 'HF Autopilot: FHA ' + S(fc.fcId), notes: '', fcId: S(fc.fcId) }, 'hfTid');
                } });
        });
        var tids = _tidRows();
        // 3 how busy
        var s3 = mk('load');
        tids.forEach(function (t) {
            var tr = _taskRowFor(t), a = answerOf('load:' + t.taskId);
            var resp = tr ? HF().taskResponseS(tr) : null;
            s3.questions.push({ id: 'load:' + t.taskId, stage: 'load', kind: 'load', subject: S(t.taskId) + ' ' + _short(t.taskName, 50), task: t, taskRow: tr, done: resp != null && resp > 0 && !!(tr && S(tr.basis)), answer: a });
        });
        // 4 errors
        var s4 = mk('err');
        tids.forEach(function (t) {
            var a = answerOf('err:' + t.taskId), modes = (a && a.modes) || {};
            var done = !!a && ERR.every(function (m) { var x = modes[m.mode]; return x && (x.v === 'no' || (x.v === 'yes' && x.detect && x.recover && x.fc)); });
            s4.questions.push({ id: 'err:' + t.taskId, stage: 'err', kind: 'err', subject: S(t.taskId) + ' ' + _short(t.taskName, 50), task: t, modes: modes, done: done });
        });
        // 5 alerts
        var s5 = mk('alert');
        fcs.forEach(function (fc) {
            var qid = 'alert:' + fc.fcId, a = answerOf(qid);
            var done = !!a && (a.pick === 'none' || (a.pick && _arr(a.modality).length > 0));
            s5.questions.push({ id: qid, stage: 'alert', kind: 'alert', subject: S(fc.fcId) + ' alert', fc: fc, answer: a, done: done });
        });
        // 6 controls and displays, 8 reach and view
        var ifs = interfaces();
        var s6 = mk('cd'), s7 = mk('sa'), s8 = mk('ergo');
        ifs.forEach(function (it) {
            var a = answerOf('cd:' + it.key), v = (a && a.v) || {};
            s6.questions.push({ id: 'cd:' + it.key, stage: 'cd', kind: 'grid', subject: it.name, item: it, rows: CD, v: v, done: CD.every(function (c) { return v[c.id] && (v[c.id].v === 'ok' || (v[c.id].v === 'gap' && S(v[c.id].note))); }) });
            var b = answerOf('ergo:' + it.key), w = (b && b.v) || {};
            s8.questions.push({ id: 'ergo:' + it.key, stage: 'ergo', kind: 'grid', subject: it.name, item: it, rows: ERGO, v: w, done: ERGO.every(function (c) { return w[c.id] && (w[c.id].v === 'ok' || (w[c.id].v === 'gap' && S(w[c.id].note))); }) });
        });
        // 7 situation awareness
        phases().forEach(function (ph) {
            var a = answerOf('sa:' + ph), v = (a && a.v) || {};
            s7.questions.push({ id: 'sa:' + ph, stage: 'sa', kind: 'grid', subject: ph, phase: ph, rows: SA, v: v, done: SA.every(function (c) { return v[c.id] && (v[c.id].v === 'ok' || (v[c.id].v === 'gap' && S(v[c.id].note))); }) });
        });
        // 9 minimum crew
        var s9 = mk('mfc'), mst = _arr(_pc().hf && _pc().hf.mfc && _pc().hf.mfc.rows), mfac = (_pc().hf && _pc().hf.mfc && _pc().hf.mfc.factors) || {}, mcon = (_pc().hf && _pc().hf.mfc && _pc().hf.mfc.conclusion) || {};
        var mfcFns = (HF() && HF().MFC_FUNCTIONS) || [], mfcFac = (HF() && HF().MFC_FACTORS) || [];
        var fnDone = mfcFns.every(function (f) { var r = mst.find(function (x) { return x.key === f.key; }) || {}; return r.role && r.role !== '—' && S(r.bedford); });
        var facDone = mfcFac.every(function (_, i) { return S(mfac[i]); });
        s9.questions.push({ id: 'mfc:functions', stage: 'mfc', kind: 'mfcfn', subject: 'The six workload functions', done: fnDone });
        s9.questions.push({ id: 'mfc:factors', stage: 'mfc', kind: 'mfcfac', subject: 'The ten workload factors', done: facDone });
        s9.questions.push({ id: 'mfc:crew', stage: 'mfc', kind: 'mfccrew', subject: 'The minimum crew', done: !!S(mcon.minCrew) && !!S(mcon.rationale) });
        // 10 credit and evidence
        var s10 = mk('credit');
        tids.filter(function (t) { return S(t.fcId) && (t.opsMode === 'Non-normal' || t.opsMode === 'Emergency'); }).forEach(function (t) {
            var qid = 'credit:' + t.taskId, a = answerOf(qid), tr = _taskRowFor(t);
            var pick = a ? a.pick : (tr && tr.asmId ? 'yes' : null);
            s10.questions.push({ id: qid, stage: 'credit', kind: 'pick', subject: S(t.taskId) + ' credit', picked: pick, done: !!pick,
                text: 'Does the safety analysis count on the crew doing this: ' + _short(t.taskName, 120) + '?',
                why: 'It is the crew\'s response to ' + E(fcLabel(fcById(t.fcId))) + '. Counting on it makes it an HF assumption on the register, Proposed until it is shown to hold.',
                options: [
                    { id: 'yes', label: 'Yes: the failure condition\'s classification counts on the crew doing it', impact: 'An HF assumption on the register (Proposed), with the task time from step 3.' },
                    { id: 'no', label: 'No: the classification stands without it', impact: 'Nothing is credited; the conservative classification stays.' }
                ], apply: function (pick) {
                    if (pick !== 'yes') return;
                    var row = _taskRowFor(t) || _materializeLoad(t, {});
                    if (row && !row.asmId) { try { HF().creditTaskById(row.taskId); } catch (_) {} }
                } });
        });
        _hfAsms().forEach(function (as) {
            var qid = 'plan:' + as.asmId, a = answerOf(qid);
            var pick = a ? a.pick : null, hasPlan = !!S(as.valStrategy);
            s10.questions.push({ id: qid, stage: 'credit', kind: 'pick', subject: S(as.asmId) + ' evidence', picked: pick, done: !!pick || hasPlan, asm: as,
                text: 'How will this be shown to hold: ' + _short(as.statement || as.text || as.asmId, 150) + '?',
                why: (hasPlan ? 'The register already says: <b>' + E(_short(as.valStrategy, 200)) + '</b>. ' : '') + _evidenceLine(as.asmId),
                options: PLAN.map(function (p) { return { id: p.id, label: p.label, impact: 'Written as the assumption\'s validation plan' + (hasPlan ? ' only where it has none' : '') + '. Results are entered on the register when they come in.' }; }),
                apply: function (pick) { var p = PLAN.find(function (x) { return x.id === pick; }); if (p && !S(as.valStrategy)) as.valStrategy = p.label + ' (planned in the HF Autopilot)'; } });
        });
        return res;
    }
    function _hfAsms() { return _arr(_g('acAssumptionsData')).filter(function (a) { return a && /human\s*factors|^hf$/i.test(S(a.type)); }); }
    function _evidenceLine(asmId) { var n = _arr(_pc().hfEvidence).filter(function (e) { return e && S(e.asmId) === S(asmId); }).length; return n ? n + ' evidence record' + (n > 1 ? 's' : '') + ' on the register.' : 'No results recorded yet.'; }

    // ---- what each answer writes ------------------------------------------------------------------------------
    function _materializeLoad(t, a) {
        var crew = S(t.crew) === 'Both' ? 'PF+PM' : S(t.crew);
        var row = _upsert('tasks', 'load:' + t.taskId, 'taskId', 'TASK-', { tidId: S(t.taskId), phase: S(t.phase), crewmember: crew, task: S(t.taskName) }, 'hfTasks');
        if (a.reactionS != null) row.reactionS = String(a.reactionS);
        if (a.execS != null) row.execS = String(a.execS);
        if (a.basis != null) row.basis = a.basis;
        if (a.channels != null) row.channels = a.channels.join(',');
        return row;
    }
    function _materializeErr(t, modes) {
        ERR.forEach(function (m) {
            var key = 'err:' + t.taskId + ':' + m.mode, x = modes[m.mode];
            if (!x || x.v !== 'yes') { _drop('hea', key); return; }
            var tr = _taskRowFor(t), fc = fcById(x.fc);
            _upsert('hea', key, 'heaId', 'HEA-', { asmId: tr && tr.asmId ? tr.asmId : '', tidId: S(t.taskId), task: S(t.taskName), errorMode: m.mode, effect: fc ? S(fc.fcDesc) : (x.fc === 'nse' ? 'No safety effect' : ''),
                detection: (DETECT.find(function (d) { return d.id === x.detect; }) || {}).label || '', recovery: (RECOVER.find(function (d) { return d.id === x.recover; }) || {}).label || '', fcIds: fc ? S(fc.fcId) : '' }, 'hfHea');
        });
    }
    var PRIO = { warning: 'Warning', caution: 'Caution', advisory: 'Advisory' };
    function _materializeAlert(fc, a) {
        var key = 'alert:' + fc.fcId;
        if (a.pick === 'none') { _drop('alerts', key); return; }
        _upsert('alerts', key, 'alertId', 'ALR-', { name: S(fc.fcId) + ' ' + _short(fc.fcDesc, 60), priority: PRIO[a.pick] || '', modality: _arr(a.modality).join(','), fcIds: S(fc.fcId), notes: 'Set in the HF Autopilot' }, 'hfAlerts');
    }
    function _materializeGrid(q, v) {
        if (q.stage === 'cd') CD.forEach(function (c) { var x = v[c.id]; if (!x) return; _upsert('cd', 'cd:' + q.item.key + ':' + c.id, 'cdId', 'CD-', { item: q.item.name, kind: q.item.kind, consideration: c.cons, supports: '', finding: x.v === 'ok' ? 'Meets it' : S(x.note), status: x.v === 'ok' ? 'Closed' : 'Open', notes: 'HF Autopilot (' + q.item.from + ')' }, 'hfCd'); });
        if (q.stage === 'ergo') ERGO.forEach(function (c) { var x = v[c.id]; if (!x) return; _upsert('ergo', 'ergo:' + q.item.key + ':' + c.id, 'ergoId', 'ERG-', { item: q.item.name, clause: c.clause, finding: x.v === 'ok' ? 'Meets it' : S(x.note), status: x.v === 'ok' ? 'Closed' : 'Open', notes: 'HF Autopilot' }); });
        if (q.stage === 'sa') SA.forEach(function (c) { var x = v[c.id]; if (!x) return; _upsert('sa', 'sa:' + q.phase + ':' + c.id, 'saId', 'SA-', { element: c.label, level: c.level, cue: x.v === 'ok' ? 'The flight deck displays and alerts' : '', phase: q.phase, finding: x.v === 'ok' ? 'Covered' : S(x.note), status: x.v === 'ok' ? 'Closed' : 'Open', notes: 'HF Autopilot' }); });
    }

    // ---- actions ------------------------------------------------------------------------------------------------
    function _find(qid) { var res = compute(); var q = null; res.stages.some(function (s) { q = s.questions.find(function (x) { return x.id === qid; }) || null; return !!q; }); return q; }
    function answer(qid, pick) {
        var q = _find(qid); if (!q || q.kind !== 'pick' || !q.options.some(function (o) { return o.id === pick; })) return false;
        _set(qid, { pick: pick }, q.stage); q.apply(pick); _save(); return true;
    }
    function setLoad(taskId, field, value) {
        var q = _find('load:' + taskId); if (!q) return false;
        var a = Object.assign({}, answerOf(q.id) || {}), t = q.task;
        if (field === 'reactionS' || field === 'execS') { var n = parseFloat(value); if (S(value) === '') a[field] = ''; else if (!isFinite(n) || n < 0) return false; else a[field] = n; }
        else if (field === 'basis') a.basis = S(value);
        else if (field === 'channel') { var ch = _arr(a.channels || (q.taskRow && S(q.taskRow.channels) ? S(q.taskRow.channels).split(',').map(S) : [])); var i = ch.indexOf(value); if (i >= 0) ch.splice(i, 1); else ch.push(value); a.channels = ch; }
        else return false;
        _set(q.id, a, 'load'); _materializeLoad(t, a); _save(); return true;
    }
    function setErr(taskId, mode, field, value) {
        var q = _find('err:' + taskId); if (!q || !ERR.some(function (m) { return m.mode === mode; })) return false;
        var a = Object.assign({ modes: {} }, answerOf(q.id) || {}); a.modes = JSON.parse(JSON.stringify(a.modes || {}));
        var x = a.modes[mode] = a.modes[mode] || {};
        if (field === 'v') { x.v = value; if (value === 'yes' && !x.fc && S(q.task.fcId)) x.fc = S(q.task.fcId); }
        else if (field === 'detect' || field === 'recover' || field === 'fc') x[field] = value;
        else return false;
        _set(q.id, a, 'err'); _materializeErr(q.task, a.modes); _save(); return true;
    }
    function setAlert(fcId, field, value) {
        var q = _find('alert:' + fcId); if (!q) return false;
        var a = Object.assign({ modality: [] }, answerOf(q.id) || {}); a.modality = _arr(a.modality).slice();
        if (field === 'pick') { if (value !== 'none' && !PRIO[value]) return false; a.pick = value; if (value === 'none') a.modality = []; }
        else if (field === 'modality') { var i = a.modality.indexOf(value); if (i >= 0) a.modality.splice(i, 1); else a.modality.push(value); }
        else return false;
        _set(q.id, a, 'alert'); _materializeAlert(q.fc, a); _save(); return true;
    }
    function setGrid(qid, rowId, field, value) {
        var q = _find(qid); if (!q || q.kind !== 'grid' || !q.rows.some(function (r) { return r.id === rowId; })) return false;
        var a = Object.assign({ v: {} }, answerOf(qid) || {}); a.v = JSON.parse(JSON.stringify(a.v || {}));
        var x = a.v[rowId] = a.v[rowId] || {};
        if (field === 'v') { if (value !== 'ok' && value !== 'gap') return false; x.v = value; } else if (field === 'note') x.note = S(value); else return false;
        _set(qid, a, q.stage); _materializeGrid(q, a.v); _save(); return true;
    }
    function setMfc(kind, key, value) {
        var H = HF(); if (!H) return false;
        if (kind === 'role') H.setMfcFn(key, 'role', value);
        else if (kind === 'bedford') H.setMfcFn(key, 'bedford', String(value));
        else if (kind === 'factor') H.setMfcFactor(+key, value);
        else if (kind === 'factorNote') { var pc = _pc(); var cur = S(pc.hf && pc.hf.mfc && pc.hf.mfc.factors && pc.hf.mfc.factors[+key]); var head = /^Needs attention/.test(cur) ? 'Needs attention' : 'Acceptable'; H.setMfcFactor(+key, head + (S(value) ? ': ' + S(value) : '')); }
        else if (kind === 'crew') { H.setMfcConclusion('minCrew', String(value) + (String(value) === '1' ? ' pilot' : ' pilots')); H.setMfcConclusion('rationale', _mfcRationale(String(value))); }
        else return false;
        var s = _store(); if (s.signed.mfc) delete s.signed.mfc; _save(); return true;
    }
    function _mfcRationale(n) {
        var pc = _pc(), m = (pc.hf && pc.hf.mfc) || {}, rows = _arr(m.rows), fns = (HF() && HF().MFC_FUNCTIONS) || [];
        var parts = fns.map(function (f) { var r = rows.find(function (x) { return x.key === f.key; }) || {}; return f.label + ': ' + (r.role || 'not assigned') + (S(r.bedford) ? ', Bedford ' + r.bedford : ''); });
        var att = Object.keys(m.factors || {}).filter(function (k) { return /^Needs attention/.test(S(m.factors[k])); }).length;
        return 'Minimum flight crew of ' + n + ' set in the HF Autopilot from the Appendix D assessment. ' + parts.join('; ') + '. ' + (att ? att + ' workload factor' + (att > 1 ? 's need' : ' needs') + ' attention.' : 'All ten workload factors acceptable.');
    }
    function addInterface(name) { name = S(name); if (!name) return false; var s = _store(); if (s.interfaces.some(function (x) { return x.toLowerCase() === name.toLowerCase(); })) return false; s.interfaces.push(name); if (s.signed.cd) delete s.signed.cd; if (s.signed.ergo) delete s.signed.ergo; _save(); return true; }

    // ---- stage status, sign-off -------------------------------------------------------------------------------
    function _open(stage, q) {   // answers that leave something open in the design
        if (stage === 'err') return ERR.filter(function (m) { var x = q.modes[m.mode]; return x && x.v === 'yes' && (x.detect === 'none' || x.recover === 'none'); }).length;
        if (q.kind === 'grid') return q.rows.filter(function (r) { return q.v[r.id] && q.v[r.id].v === 'gap'; }).length;
        if (stage === 'load') { var tr = q.taskRow; var occ = tr ? HF().taskOccupancy(tr) : null; return occ != null && occ > 0.8 ? 1 : 0; }
        return 0;
    }
    function stageStatus(s) {
        var n = s.questions.length, answered = s.questions.filter(function (q) { return q.done; }).length;
        var open = s.questions.reduce(function (t, q) { return t + _open(s.key, q); }, 0);
        var signed = _peek().signed[s.key] || null;
        var state = n === 0 ? 'empty' : (answered < n ? 'todo' : (signed ? 'done' : 'ready'));
        return { questions: n, answered: answered, open: open, signed: signed, state: state };
    }
    function sign(key) {
        var res = compute(); var s = res.byKey[key]; if (!s) return false;
        if (stageStatus(s).state !== 'ready') return false;
        _store().signed[key] = { by: _who(), at: _now() }; _save(); return true;
    }
    function coverage() {
        var res = compute();
        return res.stages.map(function (s) { var st = stageStatus(s); return { key: s.key, n: s.def.n, phase: s.def.phase, title: s.def.title, questions: st.questions, answered: st.answered, open: st.open, state: st.state, signedBy: st.signed && st.signed.by }; });
    }
    // the busiest crew task in each flight phase: time needed against time available (the 80% line, HIDH 5.7.5.1)
    function workload() {
        var out = {};
        phases().forEach(function (p) { out[p] = { phase: p, max: null, task: null, src: null }; });
        _laneRows('tasks').forEach(function (tr) {
            var occ = null; try { occ = HF().taskOccupancy(tr); } catch (_) {}
            if (occ == null) return;
            var av = HF().taskAvailableS(tr);
            var ps = HF().taskPhases(tr.phase); if (ps.some(function (x) { return /^all phases$/i.test(x); })) ps = phases();
            ps.forEach(function (p) {
                var key = Object.keys(out).find(function (k) { return k.toLowerCase() === p.toLowerCase(); }); if (!key) return;
                var avp = (av.per || []).find(function (x) { return S(x.phase).toLowerCase() === p.toLowerCase(); });
                var o = avp ? HF().taskResponseS(tr) / avp.s : occ;
                if (out[key].max == null || o > out[key].max) out[key] = { phase: key, max: o, task: S(tr.taskId) + ' ' + _short(tr.task, 40), src: avp ? avp.src : av.src };
            });
        });
        return Object.keys(out).map(function (k) { return out[k]; });
    }
    function workloadSvg() {
        var rows = workload(), W = 560, rowH = 26, pad = 150, H = 30 + rows.length * rowH + 20, x0 = pad, x1 = W - 20, cap = 1.2;
        var X = function (v) { return x0 + Math.min(v, cap) / cap * (x1 - x0); };
        var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Crew workload by flight phase"><rect width="100%" height="100%" fill="#ffffff"/>' +
            '<text x="10" y="16" font-size="12" font-family="system-ui,sans-serif" fill="#101216">Busiest crew task in each flight phase: time needed against time available</text>';
        rows.forEach(function (r, i) {
            var y = 30 + i * rowH;
            s += '<text x="10" y="' + (y + 15) + '" font-size="11" font-family="system-ui,sans-serif" fill="#101216">' + E(r.phase) + '</text>';
            s += '<rect x="' + x0 + '" y="' + (y + 4) + '" width="' + (x1 - x0) + '" height="14" fill="#eef1f5"/>';
            if (r.max != null) { var c = r.max > 0.8 ? '#DC2626' : (r.max > 0.6 ? '#D97706' : '#16A34A'); s += '<rect x="' + x0 + '" y="' + (y + 4) + '" width="' + Math.max(2, X(r.max) - x0).toFixed(1) + '" height="14" fill="' + c + '"><title>' + E(r.task + ': ' + Math.round(r.max * 100) + '% of the ' + (r.src || 'time available')) + '</title></rect>' +
                '<text x="' + (Math.min(X(r.max), x1 - 30) + 4).toFixed(1) + '" y="' + (y + 15) + '" font-size="10" font-family="system-ui,sans-serif" fill="#101216">' + Math.round(r.max * 100) + '%</text>'; }
            else s += '<text x="' + (x0 + 6) + '" y="' + (y + 15) + '" font-size="10" font-family="system-ui,sans-serif" fill="#5b6270">no task times yet</text>';
        });
        var xl = X(0.8); s += '<line x1="' + xl.toFixed(1) + '" y1="26" x2="' + xl.toFixed(1) + '" y2="' + (H - 14) + '" stroke="#DC2626" stroke-dasharray="4 3"/><text x="' + (xl - 12).toFixed(1) + '" y="' + (H - 3) + '" font-size="10" font-family="system-ui,sans-serif" fill="#DC2626">80%</text>';
        return { svg: s + '</svg>', w: W, h: H };
    }

    // ---- the page -----------------------------------------------------------------------------------------------
    var state = { stage: null, step: 0 };
    function _host() { return typeof document !== 'undefined' ? document.getElementById('hf-auto-host') : null; }
    // a row of joined choices, one line; the chosen one's meaning shows under it (6 Nov 2026, Waqas: "make these in
    // line options and nice and neat, we offer premium experience"; "more description when they select")
    function _btns(opts, picked, call, multi) {
        var on = function (id) { return multi ? _arr(picked).indexOf(id) >= 0 : picked === id; };
        var chosen = opts.filter(function (o) { return on(o.id) && o.desc; });
        return '<div class="hfa-seg-wrap"><div class="hfa-seg" role="' + (multi ? 'group' : 'radiogroup') + '">' + opts.map(function (o) {
            return '<button type="button" class="hfa-seg-b' + (on(o.id) ? ' on' : '') + (o.warn ? ' warn' : '') + '" role="' + (multi ? 'checkbox' : 'radio') + '" aria-checked="' + on(o.id) + '"' + ((o.desc || o.tip) ? ' title="' + E(o.desc || o.tip) + '"' : '') + ' onclick="' + call(o.id) + '">' + E(o.label) + '</button>';
        }).join('') + '</div>' + (chosen.length ? '<div class="hfa-desc">' + chosen.map(function (o) { return E(o.desc); }).join(' ') + '</div>' : '') + '</div>';
    }
    function render() {
        var h = _host(); if (!h || !U() || !HF()) return;
        U().style(); _styleOnce();
        var res = compute(), cov = res.stages.map(function (s) { return { s: s, st: stageStatus(s) }; });
        var tot = { q: 0, a: 0, open: 0, done: 0 };
        cov.forEach(function (c) { tot.q += c.st.questions; tot.a += c.st.answered; tot.open += c.st.open; if (c.st.state === 'done') tot.done++; });
        var items = cov.map(function (c) { return { key: c.s.key, label: c.s.def.n + '. ' + c.s.def.title, sub: c.s.def.phase + ': ' + (c.st.questions ? c.st.answered + ' of ' + c.st.questions + (c.st.open ? ', ' + c.st.open + ' open' : '') + (c.st.state === 'done' ? ', signed' : '') : 'nothing to ask yet'), state: c.st.state === 'done' ? 'done' : (c.st.open ? 'open' : 'todo'), on: state.stage === c.s.key }; });
        var body = state.stage && res.byKey[state.stage] ? _stageHtml(res, res.byKey[state.stage]) : _overviewHtml(res, cov, tot);
        h.innerHTML = '<div class="slap slap-card" data-hf-auto="1">' +
            '<div class="slap-head"><span class="slap-title">HF Autopilot</span><span class="slap-sub">10 steps through the design cycle, ' + tot.q + ' questions, ' + tot.a + ' answered, ' + tot.open + ' open, ' + tot.done + ' of 10 steps signed</span>' + U().progress(tot.a, tot.q) +
            '<button type="button" class="slap-btn" onclick="SLHfAuto.ui.report()">Write the human factors report</button></div>' +
            '<div class="slap-grid"><div>' + U().rail(items, 'SLHfAuto.ui.stage') + '</div><div data-hf-auto-body="1">' + body + '</div></div></div>';
    }
    function _overviewHtml(res, cov, tot) {
        var first = cov.find(function (c) { return c.st.state === 'todo'; });
        var groups = ['Concept', 'Preliminary design', 'Detailed design', 'Certification'];
        return '<div class="slap-q">The human factors work for this aircraft, in the order the design does it</div>' +
            '<div class="slap-why">Each step asks plain questions built from the project: the aircraft functions, the failure conditions and what they do to the crew, the flight phases, the flight deck. Every answer is written into the human factors tables below the Autopilot, which stay the detailed record.</div>' +
            '<table class="slap-tbl"><tr><th>Design stage</th><th>Step</th><th>What it settles</th><th>Progress</th></tr>' + groups.map(function (g) {
                return cov.filter(function (c) { return c.s.def.phase === g; }).map(function (c, i) {
                    return '<tr>' + (i === 0 ? '<td rowspan="' + cov.filter(function (x) { return x.s.def.phase === g; }).length + '"><b>' + E(g) + '</b></td>' : '') + '<td><a href="javascript:void(0)" onclick="SLHfAuto.ui.stage(' + J(c.s.key) + ')">' + c.s.def.n + '. ' + E(c.s.def.title) + '</a></td><td>' + E(c.s.def.what) + '</td><td>' +
                        (c.st.state === 'done' ? U().pill('ok', 'Signed') : c.st.state === 'empty' ? U().pill('todo', 'Waits for an earlier step') : c.st.state === 'ready' ? U().pill('info', 'Ready to sign') : U().pill(c.st.open ? 'open' : 'todo', c.st.answered + ' of ' + c.st.questions + (c.st.open ? ', ' + c.st.open + ' open' : ''))) + '</td></tr>';
                }).join('');
            }).join('') + '</table>' +
            '<div class="slap-nav">' + (first ? '<button type="button" class="slap-btn p" onclick="SLHfAuto.ui.stage(' + J(first.s.key) + ')">Continue with step ' + first.s.def.n + ': ' + E(first.s.def.title) + '</button>' : '<span class="slap-pill ok">Every step with questions is answered</span>') + '</div>';
    }
    function _stageHtml(res, s) {
        var st = stageStatus(s), n = s.questions.length, step = Math.max(0, Math.min(state.step, n));
        var head = '<div class="slap-head"><button type="button" class="slap-btn" onclick="SLHfAuto.ui.stage(null)">All steps</button><b>' + s.def.n + '. ' + E(s.def.title) + '</b><span class="slap-sub">' + E(s.def.phase) + '</span>' +
            U().pill(st.state === 'done' ? 'ok' : (st.open ? 'open' : (st.state === 'ready' ? 'info' : 'todo')), st.state === 'done' ? 'Signed' : (st.state === 'empty' ? 'Nothing to ask yet' : (st.answered + ' of ' + n + ' answered' + (st.open ? ', ' + st.open + ' open' : '')))) + '</div>';
        // a few questions: chips to jump between them; many: a list to pick from, with the next one not answered
        var nextOpen = s.questions.findIndex(function (q, i) { return i > step && !q.done; });
        var chips = n > 1 && n <= 12 ? '<div class="hfa-chips">' + s.questions.map(function (q, i) { return '<button type="button" class="hfa-chip' + (i === step ? ' on' : '') + (q.done ? ' done' : '') + '" onclick="SLHfAuto.ui.step(' + i + ')" title="' + E(q.subject) + '">' + (q.done ? '✓ ' : '') + E(_short(q.subject, 28)) + '</button>'; }).join('') + '</div>'
            : n > 12 ? '<div class="hfa-jump"><label>Question <select onchange="SLHfAuto.ui.step(+this.value)">' + s.questions.map(function (q, i) { return '<option value="' + i + '"' + (i === step ? ' selected' : '') + '>' + (i + 1) + '. ' + (q.done ? '✓ ' : '') + E(_short(q.subject, 70)) + '</option>'; }).join('') + '<option value="' + n + '"' + (step === n ? ' selected' : '') + '>The result and sign-off</option></select></label> of ' + n +
                (nextOpen >= 0 ? ' <button type="button" class="slap-btn" onclick="SLHfAuto.ui.step(' + nextOpen + ')">Next one not answered</button>' : '') + '</div>' : '';
        if (!n) return head + '<div class="slap-why">' + E(_emptyWhy(s.key)) + '</div>' + (s.key === 'cd' || s.key === 'ergo' ? _addIfaceHtml() : '') + '<div class="slap-nav"><button type="button" class="slap-btn" onclick="SLHfAuto.ui.next()">Next step</button></div>';
        if (step === n) return head + chips + _summaryHtml(s, st);
        var q = s.questions[step];
        var html = q.kind === 'pick' ? U().question({ id: q.id, text: q.text, why: q.why, options: q.options, picked: q.picked }, 'SLHfAuto.ui.pick')
            : q.kind === 'load' ? _loadHtml(q) : q.kind === 'err' ? _errHtml(q) : q.kind === 'alert' ? _alertHtml(q) : q.kind === 'grid' ? _gridHtml(q)
            : q.kind === 'mfcfn' ? _mfcFnHtml() : q.kind === 'mfcfac' ? _mfcFacHtml() : q.kind === 'mfccrew' ? _mfcCrewHtml() : '';
        var a = answerOf(q.id);
        var noWin = s.key === 'load' && !_arr(_g('flightPhasesData')).some(function (p) { return parseFloat(p && p.windowS) > 0; });
        return head + chips + (s.key === 'load' ? '<div class="hfa-fig">' + workloadSvg().svg + '</div>' + (noWin ? '<div class="slap-note">No crew response window is set on the Flight Phases page, so each task is measured against the whole length of its phase. Set the windows there for a real workload check.</div>' : '') : '') + html +
            (a && a.by ? '<div class="slap-note">Last answered by ' + E(a.by) + ' on ' + E(String(a.at).slice(0, 10)) + '.</div>' : '') +
            ((s.key === 'cd' || s.key === 'ergo') && step === n - 1 ? _addIfaceHtml() : '') +
            '<div class="slap-nav"><button type="button" class="slap-btn" ' + (step ? '' : 'disabled') + ' onclick="SLHfAuto.ui.step(' + (step - 1) + ')">Back</button><button type="button" class="slap-btn p" onclick="SLHfAuto.ui.step(' + (step + 1) + ')">' + (step === n - 1 ? 'See the result' : 'Next') + '</button></div>';
    }
    function _emptyWhy(key) {
        return ({ alloc: 'The project has no aircraft functions yet. Add them on the Functions page (or let the AI draft them from the architecture), and they appear here.',
            tid: 'No function is given to the crew yet and no failure condition has a crew effect. Answer step 1 first, or record the crew effect of each failure condition on the FHA.',
            load: 'No crew procedures yet. Answer step 2 first.', err: 'No crew procedures yet. Answer step 2 first.',
            alert: 'No failure condition has a crew effect on the FHA yet.', cd: 'No flight deck controls or displays are listed yet. Add the ones the crew uses below, or add them as items.',
            sa: 'The project has no flight phases yet. Set them on the Flight Phases page.', ergo: 'No flight deck controls or displays are listed yet. Add the ones the crew uses below.',
            mfc: '', credit: 'No crew procedure answers a failure condition yet, and the register has no HF assumptions. Answer step 2 first.' })[key] || '';
    }
    function _addIfaceHtml() {
        return '<div class="hfa-add"><label>Add a flight deck control or display the crew uses <input type="text" id="hfa-add-if" placeholder="for example: Thrust levers, Engine display, Flight control panel"></label><button type="button" class="slap-btn" onclick="SLHfAuto.ui.addIface()">Add</button></div>';
    }
    function _loadHtml(q) {
        var t = q.task, tr = q.taskRow || {}, a = q.answer || {};
        var val = function (f) { var v = a[f] != null ? a[f] : tr[f]; return v == null ? '' : v; };
        var ch = a.channels || (S(tr.channels) ? S(tr.channels).split(',').map(S) : []);
        var occ = tr.taskId ? HF().taskOccupancy(tr) : null, av = tr.taskId ? HF().taskAvailableS(tr) : { s: null };
        var BASIS = [{ id: 'Measured in the simulator', label: 'Measured in the simulator', desc: 'Timed with crews in the simulator: the strongest basis.' }, { id: 'Estimated by the engineer', label: 'Estimated', desc: 'An engineer\'s estimate. Fine early on; to be measured before the time is credited.' },
            { id: 'From a similar aircraft', label: 'From a similar aircraft', desc: 'Measured on an aircraft with the same task and flight deck. Say which in the table\'s notes.' }, { id: 'Published human performance data', label: 'Published data', desc: 'From human performance references such as the NASA Human Integration Design Handbook.' }];
        var CH = [{ id: 'VIS', label: 'Looking', desc: 'Eyes on a display, the instruments or outside.' }, { id: 'AUD', label: 'Listening', desc: 'Listening to an aural alert, a callout or the radio.' }, { id: 'COG', label: 'Thinking', desc: 'Working out what is happening and deciding what to do.' }, { id: 'PSY', label: 'Hands and feet', desc: 'Moving a control, a switch or the pedals.' }, { id: 'VER', label: 'Talking', desc: 'Callouts, crew coordination or radio calls.' }];
        return '<div class="slap-q">How long does this take: ' + E(t.taskName) + '?</div>' +
            '<div class="slap-why">' + E(t.opsMode || '') + ' task for ' + E(({ PF: 'the pilot flying', PM: 'the pilot monitoring', Both: 'both pilots', Either: 'either pilot' })[t.crew] || t.crew || 'the crew') + ' in ' + E(/^all phases$/i.test(S(t.phase)) || !S(t.phase) ? 'every flight phase' : t.phase) + '. Type the times; the tool never fills them in. Time to notice and decide is the reaction; time to act is the execution.</div>' +
            '<div class="hfa-form"><label>Notice and decide (seconds)<input type="number" min="0" step="0.1" value="' + E(val('reactionS')) + '" onchange="SLHfAuto.ui.load(' + J(t.taskId) + ',\'reactionS\',this.value)"></label>' +
            '<label>Act (seconds)<input type="number" min="0" step="0.1" value="' + E(val('execS')) + '" onchange="SLHfAuto.ui.load(' + J(t.taskId) + ',\'execS\',this.value)"></label></div>' +
            '<div class="hfa-field"><span class="hfa-lab">Where the times come from</span>' + _btns(BASIS, S(val('basis')), function (id) { return 'SLHfAuto.ui.load(' + J(t.taskId) + ',\'basis\',' + J(id) + ')'; }) + '</div>' +
            '<div class="hfa-field"><span class="hfa-lab">What it keeps the crew busy with (pick all that apply)</span>' + _btns(CH, ch, function (id) { return 'SLHfAuto.ui.load(' + J(t.taskId) + ',\'channel\',' + J(id) + ')'; }, true) + '</div>' +
            (occ != null ? '<div class="slap-note">That is ' + Math.round(occ * 100) + '% of the time available (' + Math.round(av.s) + ' s, from the ' + E(av.src || 'flight phase') + ').' + (occ > 0.8 ? ' <b>Over 80%: the crew has too little time. This stays open.</b>' : '') + '</div>' : '');
    }
    function _errHtml(q) {
        var t = q.task, fcs = _arr(_g('acFhaData')).filter(function (f) { return f && S(f.fcId); });
        var YN = [{ id: 'yes', label: 'It can happen', tip: 'Say how they would notice, how it is put right, and what it leads to.' }, { id: 'no', label: 'Not credible here', tip: 'This kind of error cannot happen in this task, or makes no difference to it.' }];
        var call = function (mode, f) { return function (id) { return 'SLHfAuto.ui.err(' + J(t.taskId) + ',' + J(mode) + ',' + J(f) + ',' + J(id) + ')'; }; };
        return '<div class="slap-q">What could the crew get wrong: ' + E(t.taskName) + '?</div>' +
            '<div class="slap-why">Go through the five ways a crew task goes wrong (the NUREG/CR-1278 error types). For each one that can happen here, say how the crew would notice, how it is put right, and which failure condition it leads to. Each one written becomes a row of the crew error table.</div>' +
            '<div class="hfa-cards">' + ERR.map(function (m) {
                var x = q.modes[m.mode] || {}, fc = fcById(x.fc);
                var body = x.v === 'yes' ? '<div class="hfa-field"><span class="hfa-lab">How they notice</span>' + _btns(DETECT.map(function (d) { return Object.assign({ warn: d.id === 'none' }, d); }), x.detect, call(m.mode, 'detect')) + '</div>' +
                    '<div class="hfa-field"><span class="hfa-lab">How it is put right</span>' + _btns(RECOVER.map(function (d) { return Object.assign({ warn: d.id === 'none' }, d); }), x.recover, call(m.mode, 'recover')) + '</div>' +
                    '<div class="hfa-field"><span class="hfa-lab">What it leads to</span><select class="hfa-select" onchange="SLHfAuto.ui.err(' + J(t.taskId) + ',' + J(m.mode) + ',\'fc\',this.value)"><option value="">Pick the failure condition</option><option value="nse"' + (x.fc === 'nse' ? ' selected' : '') + '>No safety effect</option>' + fcs.map(function (f) { return '<option value="' + E(f.fcId) + '"' + (x.fc === S(f.fcId) ? ' selected' : '') + '>' + E(fcLabel(f)) + '</option>'; }).join('') + '</select>' +
                    (fc ? '<div class="hfa-desc">' + E(fc.severity || '') + (fc.effCrew ? '. The crew effect on the FHA: ' + E(fc.effCrew) : '') + '</div>' : '') + '</div>' : '';
                var state = x.v === 'no' ? 'ok' : (x.v === 'yes' ? ((x.detect === 'none' || x.recover === 'none') ? 'open' : (x.detect && x.recover && x.fc ? 'ok' : 'todo')) : 'todo');
                return '<div class="hfa-card ' + state + '"><div class="hfa-card-h"><div><div class="hfa-card-t">The crew ' + E(m.label.charAt(0).toLowerCase() + m.label.slice(1)) + '</div><div class="hfa-card-d">' + E(m.desc) + '</div></div>' + _btns(YN, x.v, call(m.mode, 'v')) + '</div>' + (body ? '<div class="hfa-card-b">' + body + '</div>' : '') + '</div>';
            }).join('') + '</div>';
    }
    function _alertHtml(q) {
        var fc = q.fc, a = q.answer || {};
        return '<div class="slap-q">How is the crew told: ' + E(_short(fc.fcDesc, 140)) + '?</div>' +
            '<div class="slap-why">The crew effect on the FHA: <b>' + E(fc.effCrew) + '</b> (' + E(fc.severity || '') + '). The alert levels are 14 CFR 25.1322\'s.</div>' +
            U().question({ id: q.id, text: '', options: [
                { id: 'warning', label: 'Warning: red, needs action now', impact: 'An alert in the crew alerting list, priority Warning.' },
                { id: 'caution', label: 'Caution: amber, needs awareness now and action later', impact: 'An alert in the crew alerting list, priority Caution.' },
                { id: 'advisory', label: 'Advisory: for awareness', impact: 'An alert in the crew alerting list, priority Advisory.' },
                { id: 'none', label: 'No alert: the crew sees it directly in how the aircraft behaves', impact: 'No alert. The crew\'s own noticing has to be shown in step 4.' }
            ], picked: a.pick || null }, 'SLHfAuto.ui.alertPick') +
            (a.pick && a.pick !== 'none' ? '<div class="hfa-field"><span class="hfa-lab">How it reaches them (pick all that apply)</span>' + _btns([{ id: 'visual', label: 'They see it', desc: 'A light, a message or a symbol on a display.' }, { id: 'aural', label: 'They hear it', desc: 'A tone, a chime or a voice message.' }, { id: 'tactile', label: 'They feel it', desc: 'A stick shaker or another physical cue.' }], _arr(a.modality), function (id) { return 'SLHfAuto.ui.alert(' + J(fc.fcId) + ',\'modality\',' + J(id) + ')'; }, true) + '</div>' : '');
    }
    function _gridHtml(q) {
        var title = q.stage === 'cd' ? 'Controls and displays: ' + q.item.name : q.stage === 'ergo' ? 'Reach and view: ' + q.item.name : 'In ' + q.phase + ', can the crew...';
        var why = q.stage === 'cd' ? 'The four questions of 14 CFR 25.1302 (AC 25.1302-1 is the guidance). ' + E(q.item.from) : q.stage === 'ergo' ? E(q.item.from) : 'The three levels of situation awareness. The rule behind it is 14 CFR 25.1302(a): the information the crew needs for the task.';
        return '<div class="slap-q">' + E(title) + '</div><div class="slap-why">' + why + '</div>' +
            '<table class="slap-tbl hfa-grid"><tr><th>Question</th><th>Answer</th><th>What is wrong (for an open finding)</th></tr>' + q.rows.map(function (r) {
                var x = q.v[r.id] || {};
                return '<tr><td>' + E(r.label) + (r.clause ? '<div class="slap-sub">' + E(r.clause) + '</div>' : '') + '</td><td>' + _btns([{ id: 'ok', label: 'Yes', desc: 'Recorded as met, a closed row.' }, { id: 'gap', label: 'No', warn: true, desc: 'An open finding: say what is wrong, and the design closes it later.' }], x.v, function (id) { return 'SLHfAuto.ui.grid(' + J(q.id) + ',' + J(r.id) + ',\'v\',' + J(id) + ')'; }) + '</td><td>' +
                    (x.v === 'gap' ? '<input type="text" class="hfa-note" value="' + E(x.note || '') + '" placeholder="say what is wrong" onchange="SLHfAuto.ui.grid(' + J(q.id) + ',' + J(r.id) + ',\'note\',this.value)">' : (x.v === 'ok' ? '<span class="slap-sub">Met</span>' : '')) + '</td></tr>';
            }).join('') + '</table>';
    }
    function _mfc() { var pc = _pc(); return (pc.hf && pc.hf.mfc) || { rows: [], factors: {}, conclusion: {} }; }
    function _mfcFnHtml() {
        var m = _mfc(), rows = _arr(m.rows);
        return '<div class="slap-q">The six basic workload functions: who does each, and how hard is it?</div><div class="slap-why">14 CFR Part 25 Appendix D(a). The difficulty is the Bedford scale: 1 is insignificant, 10 means the task would be abandoned; 7 or more is too much for one person.</div>' +
            '<table class="slap-tbl"><tr><th>Function</th><th>Who does it</th><th>How hard (Bedford 1 to 10)</th></tr>' + ((HF() && HF().MFC_FUNCTIONS) || []).map(function (f) {
                var r = rows.find(function (x) { return x.key === f.key; }) || {};
                return '<tr><td>' + E(f.label) + '</td><td>' + _btns(MFC_ROLES, r.role, function (id) { return 'SLHfAuto.ui.mfc(\'role\',' + J(f.key) + ',' + J(id) + ')'; }) + '</td><td>' + _btns(BEDFORD.map(function (lab, i) { return { id: String(i + 1), label: String(i + 1), warn: i >= 6, desc: (i + 1) + ': ' + lab + '.' }; }), S(r.bedford), function (id) { return 'SLHfAuto.ui.mfc(\'bedford\',' + J(f.key) + ',' + id + ')'; }).replace('hfa-seg-wrap', 'hfa-seg-wrap hfa-num') + '</td></tr>';
            }).join('') + '</table>';
    }
    function _mfcFacHtml() {
        var m = _mfc(), fac = m.factors || {};
        return '<div class="slap-q">The ten workload factors: is each one acceptable for the crew you have in mind?</div><div class="slap-why">14 CFR Part 25 Appendix D(b), in the rule\'s own words.</div>' +
            '<table class="slap-tbl"><tr><th>Factor</th><th>Answer</th><th>Note</th></tr>' + ((HF() && HF().MFC_FACTORS) || []).map(function (f, i) {
                var cur = S(fac[i]), pick = /^Needs attention/.test(cur) ? 'att' : (cur ? 'ok' : null), note = cur.replace(/^(Acceptable|Needs attention):?\s*/, '');
                return '<tr><td>' + (i + 1) + '. ' + E(f) + '</td><td>' + _btns([{ id: 'ok', label: 'Acceptable' }, { id: 'att', label: 'Needs attention', warn: true }], pick, function (id) { return 'SLHfAuto.ui.mfc(\'factor\',' + i + ',' + J(id === 'ok' ? 'Acceptable' : 'Needs attention') + ')'; }) + '</td><td>' + (pick ? '<input type="text" class="hfa-note" value="' + E(note) + '" placeholder="why (optional)" onchange="SLHfAuto.ui.mfc(\'factorNote\',' + i + ',this.value)">' : '') + '</td></tr>';
            }).join('') + '</table>';
    }
    function _mfcCrewHtml() {
        var m = _mfc(), c = m.conclusion || {}, f = {}; try { f = HF().mfcFindings(); } catch (_) {}
        var cur = parseInt(S(c.minCrew), 10);
        return '<div class="slap-q">What is the minimum flight crew?</div><div class="slap-why">14 CFR 25.1523, decided from the functions and factors before. ' +
            (f.high && f.high.length ? 'Too hard for one person (Bedford 7 or more): <b>' + E(f.high.join(', ')) + '</b>. ' : '') + (f.crewCount ? f.crewCount + ' aircraft functions are given to the crew in step 1. ' : '') + '</div>' +
            _btns([{ id: '1', label: 'One pilot' }, { id: '2', label: 'Two pilots' }, { id: '3', label: 'Three crew' }], isNaN(cur) ? null : String(cur), function (id) { return 'SLHfAuto.ui.mfc(\'crew\',\'\',' + J(id) + ')'; }) +
            (S(c.rationale) ? '<div class="slap-note"><b>Rationale written:</b> ' + E(c.rationale) + '</div>' : '') +
            (f.incap ? '<div class="slap-note"><b>Open:</b> with two or more pilots, the incapacitation factor (10) must be dispositioned.</div>' : '') + (f.crewHeavy ? '<div class="slap-note"><b>Open:</b> one pilot with ' + f.crewCount + ' crew functions: check the workload again.</div>' : '');
    }
    function _summaryHtml(s, st) {
        var rows = s.questions.map(function (q) { return '<tr><td>' + E(q.subject) + '</td><td>' + (q.done ? U().pill(_open(s.key, q) ? 'open' : 'ok', _open(s.key, q) ? _open(s.key, q) + ' open' : 'Answered') : '<i>not answered</i>') + '</td></tr>'; }).join('');
        return '<div class="slap-q">' + s.def.n + '. ' + E(s.def.title) + ': the result</div><table class="slap-tbl"><tr><th>Question</th><th>Status</th></tr>' + rows + '</table>' +
            '<div class="slap-why">' + (st.state === 'todo' ? 'Answer every question to sign this step.' : (st.signed ? 'Signed by ' + E(st.signed.by) + ' on ' + E(String(st.signed.at).slice(0, 10)) + '.' : 'Every question is answered.' + (st.open ? ' ' + st.open + ' open finding' + (st.open > 1 ? 's stay' : ' stays') + ' in the tables as open, for the design to close.' : ''))) + '</div>' +
            '<div class="slap-nav">' + (st.state === 'ready' ? '<button type="button" class="slap-btn p" onclick="SLHfAuto.ui.sign(' + J(s.key) + ')">Sign this step</button>' : '') + '<button type="button" class="slap-btn" onclick="SLHfAuto.ui.next()">Next step</button></div>';
    }
    var _styled = false;
    function _styleOnce() {
        if (_styled || typeof document === 'undefined') return; _styled = true;
        var st = document.createElement('style'); st.id = 'hfa-auto-style';
        st.textContent = '.hfa-chips{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 10px}.hfa-chip{font:inherit;font-size:11px;padding:3px 8px;border-radius:12px;border:1px solid var(--border-primary,#d0d5dd);background:transparent;color:inherit;cursor:pointer}.hfa-chip.on{border-color:#1A6EF2;background:rgba(26,110,242,.1)}.hfa-chip.done{color:#16794a}' +
            '.hfa-form{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0}.hfa-form label,.hfa-add label{display:flex;flex-direction:column;font-size:12px;gap:4px}.hfa-form input{width:140px}.hfa-row{display:flex;flex-direction:column;gap:4px;margin:8px 0;font-size:12px}' +
            '.hfa-seg-wrap{display:inline-flex;flex-direction:column;align-items:flex-start;gap:4px;max-width:100%}.hfa-seg{display:inline-flex;flex-wrap:nowrap;border:1px solid var(--border-primary,#d0d5dd);border-radius:8px;overflow:hidden;background:var(--bg-primary,#fff);max-width:100%;overflow-x:auto}.hfa-seg .hfa-seg-b{font:inherit;font-size:12px;line-height:1.2;padding:6px 12px;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;border-right:1px solid var(--border-primary,#d0d5dd)!important;background:transparent;color:inherit;cursor:pointer;white-space:nowrap;min-height:0;height:auto}.hfa-seg .hfa-seg-b:last-child{border-right:0!important}.hfa-num .hfa-seg-b{padding:6px 9px;min-width:28px}.hfa-seg-b:hover{background:rgba(26,110,242,.06)}.hfa-seg .hfa-seg-b.on{background:#1A6EF2!important;color:#fff!important}.hfa-seg .hfa-seg-b.warn.on{background:#B42318!important;color:#fff!important}.hfa-seg-b:focus-visible{outline:2px solid #1A6EF2;outline-offset:-2px}.hfa-desc{font-size:11.5px;color:var(--text-secondary,#5b6270);line-height:1.45;max-width:640px}.hfa-cards{display:flex;flex-direction:column;gap:10px;margin:10px 0}.hfa-card{border:1px solid var(--border-primary,#d0d5dd);border-left:4px solid #98a2b3;border-radius:10px;background:var(--bg-primary,#fff)}.hfa-card.ok{border-left-color:#16A34A}.hfa-card.open{border-left-color:#B42318}.hfa-card-h{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 14px}.hfa-card-h>div:first-child{flex:1;min-width:0}.hfa-card-h .hfa-seg-wrap{flex:none}.hfa-card-t{font-weight:600;font-size:13.5px}.hfa-card-d{font-size:12px;color:var(--text-secondary,#5b6270);margin-top:2px;max-width:560px}.hfa-card-b{border-top:1px solid var(--border-primary,#e4e7ec);padding:10px 14px 12px;display:flex;flex-direction:column;gap:10px}.hfa-field{display:flex;flex-direction:column;gap:5px;margin:8px 0}.hfa-card-b .hfa-field{margin:0}.hfa-lab{font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--text-secondary,#5b6270)}.hfa-select{font:inherit;font-size:12.5px;padding:6px 8px;border-radius:8px;border:1px solid var(--border-primary,#d0d5dd);max-width:520px}.hfa-grid td{vertical-align:top}.slap-mini{display:inline-flex;flex-wrap:wrap;gap:4px}.slap-mini .slap-btn{font-size:11.5px;padding:3px 8px}.hfa-hi{border-color:#DC262666}.hfa-note{width:100%;min-width:180px}.hfa-add{display:flex;gap:8px;align-items:flex-end;margin:10px 0}.hfa-add input{min-width:320px}.hfa-fig{margin:6px 0 10px;overflow-x:auto}.hfa-err select{margin-top:2px;max-width:420px}.hfa-err td:nth-child(2){white-space:nowrap;width:110px}.hfa-err td:nth-child(2) .slap-mini{flex-wrap:nowrap}.hfa-sub{font-size:11px;color:var(--text-secondary,#5b6270);margin:6px 0 2px}.hfa-sub:first-child{margin-top:0}.hfa-jump{display:flex;align-items:center;gap:8px;margin:6px 0 10px;font-size:12px}.hfa-jump select{max-width:520px}.slap-tbl td .slap-mini{flex-wrap:wrap}';
        document.head.appendChild(st);
    }

    // ---- the report ---------------------------------------------------------------------------------------------
    function report() {
        var res = compute(), cov = coverage(), pc = _pc();
        var html = '<h1>Human Factors Assessment</h1><p class="muted">' + E(_g('projectName') || '') + '. Worked through the HF Autopilot: every answer by an engineer, with who and when. ' + new Date().toISOString().slice(0, 10) + '.</p>';
        html += '<h2>Coverage of the design cycle</h2><table><tr><th>Design stage</th><th>Step</th><th>Answered</th><th>Open</th><th>Signed</th></tr>' + cov.map(function (c) { return '<tr><td>' + E(c.phase) + '</td><td>' + c.n + '. ' + E(c.title) + '</td><td>' + c.answered + ' of ' + c.questions + '</td><td class="' + (c.open ? 'open' : 'ok') + '">' + c.open + '</td><td>' + (c.signedBy ? E(c.signedBy) : '-') + '</td></tr>'; }).join('') + '</table>';
        var lanes = [['alloc', '1. Who does what', ['subName', 'allocation', 'rationale'], ['Function', 'Who', 'Why']], ['tid', '2. Crew procedures', ['taskId', 'opsMode', 'phase', 'taskName', 'crew', 'trigger'], ['Task', 'Kind', 'Phase', 'What', 'Who', 'Starts when']],
            ['tasks', '3. How busy the crew is', ['taskId', 'task', 'phase', 'reactionS', 'execS', 'basis'], ['Task', 'What', 'Phase', 'Notice and decide (s)', 'Act (s)', 'Where the times come from']],
            ['hea', '4. What the crew could get wrong', ['heaId', 'task', 'errorMode', 'detection', 'recovery', 'fcIds'], ['Row', 'Task', 'Error', 'How they notice', 'How it is put right', 'Leads to']],
            ['alerts', '5. How the crew is told', ['alertId', 'name', 'priority', 'modality', 'fcIds'], ['Alert', 'For', 'Level', 'How', 'Failure condition']],
            ['cd', '6. Controls and displays (25.1302)', ['cdId', 'item', 'consideration', 'finding', 'status'], ['Row', 'Control or display', 'Question', 'Finding', 'Status']],
            ['sa', '7. Situation awareness', ['saId', 'phase', 'level', 'finding', 'status'], ['Row', 'Phase', 'Level', 'Finding', 'Status']],
            ['ergo', '8. Reach and view', ['ergoId', 'item', 'clause', 'finding', 'status'], ['Row', 'Control or display', 'Rule', 'Finding', 'Status']]];
        lanes.forEach(function (L) {
            var rows = _laneRows(L[0]); html += '<h2>' + E(L[1]) + '</h2>';
            if (L[0] === 'tasks') { var f = workloadSvg(); html += f.svg; }
            html += rows.length ? '<table><tr>' + L[3].map(function (h) { return '<th>' + E(h) + '</th>'; }).join('') + '</tr>' + rows.map(function (r) { return '<tr>' + L[2].map(function (k) { return '<td>' + E(r[k] == null ? '' : r[k]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' : '<p class="muted">Nothing recorded yet.</p>';
        });
        var m = _mfc(); html += '<h2>9. Minimum crew (25.1523)</h2><table><tr><th>Function</th><th>Who</th><th>Bedford</th></tr>' + ((HF() && HF().MFC_FUNCTIONS) || []).map(function (f) { var r = _arr(m.rows).find(function (x) { return x.key === f.key; }) || {}; return '<tr><td>' + E(f.label) + '</td><td>' + E(r.role || '') + '</td><td>' + E(r.bedford || '') + '</td></tr>'; }).join('') + '</table>' +
            '<p><b>Minimum flight crew:</b> ' + E((m.conclusion || {}).minCrew || 'not decided') + '. ' + E((m.conclusion || {}).rationale || '') + '</p>';
        html += '<h2>10. Credit and evidence</h2>' + (_hfAsms().length ? '<table><tr><th>Assumption</th><th>What the crew does</th><th>State</th><th>How it is shown</th><th>Results</th></tr>' + _hfAsms().map(function (a) { return '<tr><td>' + E(a.asmId) + '</td><td>' + E(a.statement || '') + '</td><td>' + E(a.state || '') + '</td><td>' + E(a.valStrategy || '') + '</td><td>' + E(_evidenceLine(a.asmId)) + '</td></tr>'; }).join('') + '</table>' : '<p class="muted">No crew action is credited yet.</p>');
        return U().openReport('Human Factors Assessment', html);
    }

    var ui = {
        stage: function (key) { state.stage = key || null; state.step = 0; render(); },
        step: function (n) { state.step = n; render(); },
        pick: function (qid, opt) { answer(qid, opt); render(); },
        load: function (id, f, v) { setLoad(id, f, v); render(); },
        err: function (id, mode, f, v) { setErr(id, mode, f, v); render(); },
        alertPick: function (qid, opt) { setAlert(String(qid).replace(/^alert:/, ''), 'pick', opt); render(); },
        alert: function (fcId, f, v) { setAlert(fcId, f, v); render(); },
        grid: function (qid, r, f, v) { setGrid(qid, r, f, v); render(); },
        mfc: function (k, key, v) { setMfc(k, key, v); render(); },
        addIface: function () { var el = typeof document !== 'undefined' && document.getElementById('hfa-add-if'); if (el && addInterface(el.value)) render(); },
        sign: function (key) { sign(key); render(); },
        next: function () { var i = STAGES.findIndex(function (x) { return x.key === state.stage; }); var nx = STAGES[(i + 1) % STAGES.length]; ui.stage(nx.key); },
        report: report
    };
    function mount() {
        if (typeof document === 'undefined') return false;
        var v = document.getElementById('view-hfa'); if (!v) return false;
        var host = document.getElementById('hf-auto-host');
        if (!host) { host = document.createElement('div'); host.id = 'hf-auto-host'; }
        // first under the page heading; the register page redraws itself (innerHTML), so the host is put back each time
        var place = function () { var hd = v.querySelector(':scope > .header-with-export'); var want = hd ? hd.nextSibling : v.firstChild; if (host.parentNode === v && (hd ? host.previousSibling === hd : v.firstChild === host)) return; if (hd) v.insertBefore(host, want); else v.insertBefore(host, v.firstChild); };
        place();
        if (!v._hfAutoObs && typeof MutationObserver === 'function') {
            var shown = v.style.display !== 'none' && v.style.display !== '';
            v._hfAutoObs = new MutationObserver(function () {
                var now = v.style.display !== 'none';
                try { place(); } catch (_) {}
                if (now && !shown) { try { render(); } catch (e) { try { console.warn('[hf-autopilot]', e); } catch (_) {} } }
                shown = now;
            });
            v._hfAutoObs.observe(v, { attributes: true, attributeFilter: ['style', 'class'], childList: true });
            if (v.style.display !== 'none') { try { render(); } catch (_) {} }
        }
        return true;
    }
    if (typeof document !== 'undefined') { var tries = 40, t = setInterval(function () { if (mount() || --tries <= 0) clearInterval(t); }, 250); }
    root.SLHfAuto = { VERSION: VERSION, STAGES: STAGES, ERR: ERR, compute: compute, stageStatus: stageStatus, coverage: coverage, answer: answer, setLoad: setLoad, setErr: setErr, setAlert: setAlert, setGrid: setGrid, setMfc: setMfc, addInterface: addInterface,
        sign: sign, workload: workload, workloadSvg: workloadSvg, interfaces: interfaces, report: report, render: render, ui: ui, state: state };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLHfAuto;
})(typeof window !== 'undefined' ? window : globalThis);
