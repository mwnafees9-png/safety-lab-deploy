// ============================================================================
// usoc.js — v1.0 — Unsafe System Operating Conditions
// (23 Sep 2026, standards gap G5; ASTM F3061/F3061M-22b §4.2.6 and Appendix X2).
//
// WHAT A USOC IS (our words): a failure condition that is Major or less on its
// own but becomes Hazardous or Catastrophic — or Hazardous that becomes
// Catastrophic — if the crew does not notice and act. F3061 asks that the crew
// get the information in time to act, and Appendix X2 lays out how to show it.
//
// THE WORKFLOW HERE (Appendix X2, in our words):
//   1. candidates — found, never assumed: an FCIM aware/unaware pair whose
//      "aware" classification governs (the crew-awareness credit) and whose
//      "unaware" outcome is worse is exactly this shape; the engineer can also
//      add one by hand (initial FC → escalated FC, both from the AFHA);
//   2. the engineer DISPOSITIONS each candidate: a USOC, or not (with reason);
//   3. for each USOC: how the crew finds out (inherently evident, or an alert —
//      F3117), what they must do and the time available, whether that needs a
//      flight manual procedure or is normal airmanship, the evidence the cue
//      is clear (flight / ground test, simulator, analysis), and three
//      substantiation calls — detection acceptable, action reasonable,
//      achievable before escalation;
//   4. each USOC owes a requirement (generator 'usoc-info', F3061 §4.2.6):
//      timely crew information so the action completes before escalation.
// Store: projectConfig.usocs = [{ id 'USOC-1', fcIid, escFcIid, source,
//   disposition 'usoc'|'not-usoc', reason, detection 'inherent'|'alert',
//   detectionNote, alertRef, crewAction, timeAvailable, procedure
//   'airmanship'|'afm', procedureRef, clarity 'flight-test'|'ground-test'|
//   'simulator'|'analysis', clarityRef, subst { detect, action, inTime }
//   each 'open'|'yes'|'no' }].
// INV-54 (advisory) lists undispositioned candidates and every USOC not yet
// fully substantiated; a 'no' means a design change is needed.
// See tests/regression_usoc.test.js.
// ============================================================================
(function (root) {
    'use strict';

    var SEV = ['Negligible', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
    var DETECTION = [{ v: 'inherent', label: 'Inherently evident to the crew (show it is timely and clear)' }, { v: 'alert', label: 'Alert (per ASTM F3117)' }];
    var PROCEDURE = [{ v: 'airmanship', label: 'Normal airmanship — no procedure needed' }, { v: 'afm', label: 'Flight manual procedure needed' }];
    var CLARITY = [{ v: 'flight-test', label: 'Flight test' }, { v: 'ground-test', label: 'Ground test' }, { v: 'simulator', label: 'Simulator' }, { v: 'analysis', label: 'Analysis' }];
    var CALL = [{ v: 'open', label: 'Open' }, { v: 'yes', label: 'Yes' }, { v: 'no', label: 'No — design change needed' }];

    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : (root.projectConfig || null); } catch (_) { return root.projectConfig || null; } }
    function _fha() { try { if (typeof acFhaData !== 'undefined' && Array.isArray(acFhaData)) return acFhaData; } catch (_) {} return Array.isArray(root.acFhaData) ? root.acFhaData : []; }
    function _fcim() { try { if (typeof acFcimData !== 'undefined' && Array.isArray(acFcimData)) return acFcimData; } catch (_) {} return Array.isArray(root.acFcimData) ? root.acFcimData : []; }
    function store() { var pc = _pc(); if (!pc) return []; if (!Array.isArray(pc.usocs)) pc.usocs = []; return pc.usocs; }
    function fc(iid) { var a = _fha(); for (var i = 0; i < a.length; i++) if (a[i] && String(a[i].internalId) === String(iid)) return a[i]; return null; }
    function fcByFcId(fcId) { var a = _fha(); for (var i = 0; i < a.length; i++) if (a[i] && a[i].fcId && String(a[i].fcId).trim() === String(fcId).trim()) return a[i]; return null; }
    function rank(sev) { return SEV.indexOf(sev); }
    function _label(f) { return f ? ((f.fcId ? f.fcId + ' ' : '') + '"' + (f.fcDesc || 'failure condition') + '" (' + (f.severity || '?') + ')') : '(failure condition not found)'; }

    // Does this pair have the USOC shape? ≤Major → ≥Hazardous, or Hazardous → Catastrophic.
    function isUsocShape(fromSev, toSev) {
        var a = rank(fromSev), b = rank(toSev);
        if (a < 0 || b < 0 || b <= a) return false;
        return (a <= rank('Major') && b >= rank('Hazardous')) || (a === rank('Hazardous') && b === rank('Catastrophic'));
    }
    function _worst(fcIds) {
        var best = null;
        (fcIds || []).forEach(function (id) { var f = fcByFcId(id); if (f && (!best || rank(f.severity) > rank(best.severity))) best = f; });
        return best;
    }

    // ---- 1. candidates from FCIM aware/unaware pairs -------------------------------------------
    function candidates() {
        var rows = _fcim(), seen = {}, out = [];
        rows.forEach(function (r) {
            if (!r || !r.pairId || r.pairGoverns !== 'aware' || seen[r.pairId]) return;
            var partner = rows.find(function (x) { return x && x !== r && x.pairId === r.pairId; });
            if (!partner) return;
            seen[r.pairId] = 1;
            var aware = r.awareness === 'Aware' ? r : (partner.awareness === 'Aware' ? partner : null);
            var unaware = r.awareness === 'Unaware' ? r : (partner.awareness === 'Unaware' ? partner : null);
            if (!aware || !unaware) return;
            var from = _worst([aware.tlId, aware.plId, aware.mId]), to = _worst([unaware.tlId, unaware.plId, unaware.mId]);
            if (!from || !to || !isUsocShape(from.severity, to.severity)) return;
            out.push({ source: 'fcim-pair:' + r.pairId, fcIid: from.internalId, escFcIid: to.internalId, subId: unaware.subId || r.subId || '' });
        });
        // drop any already recorded (by source, or by the same from → to pair)
        var have = store();
        return out.filter(function (c) {
            return !have.some(function (u) { return u.source === c.source || (String(u.fcIid) === String(c.fcIid) && String(u.escFcIid) === String(c.escFcIid)); });
        });
    }

    // ---- 2. recording --------------------------------------------------------------------------
    function _nextId() { var pc = _pc(); pc.usocCounter = (pc.usocCounter || 0) + 1; return 'USOC-' + pc.usocCounter; }
    function record(c, disposition, reason) {
        if (!c || !_pc()) return null;
        var u = {
            id: _nextId(), fcIid: c.fcIid, escFcIid: c.escFcIid, source: c.source || 'manual',
            disposition: disposition === 'not-usoc' ? 'not-usoc' : 'usoc', reason: String(reason || '').trim(),
            detection: '', detectionNote: '', alertRef: '', crewAction: '', timeAvailable: '',
            procedure: '', procedureRef: '', clarity: '', clarityRef: '',
            subst: { detect: 'open', action: 'open', inTime: 'open' }
        };
        store().push(u);
        return u;
    }
    function get(id) { return store().find(function (u) { return u.id === id; }) || null; }

    // ---- 3. findings (INV-54) ------------------------------------------------------------------
    function missing(u) {
        var m = [];
        if (!u.detection) m.push('how the crew finds out');
        else if (u.detection === 'alert' && !String(u.alertRef || '').trim()) m.push('which alert');
        if (!String(u.crewAction || '').trim()) m.push('the crew action');
        if (!String(u.timeAvailable || '').trim()) m.push('the time available before escalation');
        if (!u.procedure) m.push('procedure decision (airmanship or flight manual)');
        else if (u.procedure === 'afm' && !String(u.procedureRef || '').trim()) m.push('the flight manual procedure reference');
        if (!u.clarity) m.push('evidence the cue is clear (test / simulator / analysis)');
        return m;
    }
    function findings() {
        var out = [];
        candidates().forEach(function (c) { out.push({ kind: 'candidate', text: 'Candidate USOC not yet dispositioned: ' + _label(fc(c.fcIid)) + ' → ' + _label(fc(c.escFcIid)) + ' if the crew is unaware (' + c.source + ')' }); });
        store().forEach(function (u) {
            var tag = u.id + ' ' + _label(fc(u.fcIid)) + ' → ' + _label(fc(u.escFcIid));
            if (u.disposition === 'not-usoc') { if (!u.reason) out.push({ kind: 'no-reason', u: u, text: tag + ' — ruled not a USOC with no reason recorded' }); return; }
            var f1 = fc(u.fcIid), f2 = fc(u.escFcIid);
            if (!f1 || !f2) { out.push({ kind: 'dangling', u: u, text: tag + ' — a linked failure condition no longer exists' }); return; }
            if (!isUsocShape(f1.severity, f2.severity)) out.push({ kind: 'shape', u: u, text: tag + ' — the severities no longer have the USOC shape (Major-or-less → Hazardous/Catastrophic, or Hazardous → Catastrophic)' });
            var m = missing(u); if (m.length) out.push({ kind: 'incomplete', u: u, text: tag + ' — missing: ' + m.join(', ') });
            var s = u.subst || {}, names = { detect: 'detection acceptable', action: 'action reasonable', inTime: 'achievable before escalation' };
            Object.keys(names).forEach(function (k) {
                if (s[k] === 'no') out.push({ kind: 'failed', u: u, text: tag + ' — NOT substantiated: ' + names[k] + ' (a design change is needed)' });
                else if (s[k] !== 'yes') out.push({ kind: 'open', u: u, text: tag + ' — open: ' + names[k] });
            });
        });
        return out;
    }
    var INV = {
        id: 'INV-54', sev: 'advisory',
        name: 'Every unsafe system operating condition is dispositioned, and each USOC shows timely crew information, a reasonable action achievable before escalation, and the procedure and test evidence behind it (F3061 §4.2.6, X2)',
        run: function () { var f = findings(); return { checked: store().length + candidates().length, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length }; }
    };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- 4. requirements (F3061 §4.2.6) --------------------------------------------------------
    function requirements(fp, scopeKey) {
        scopeKey = scopeKey || 'ac';
        if (scopeKey !== 'ac') return [];
        return store().filter(function (u) { return u.disposition === 'usoc' && fc(u.fcIid) && fc(u.escFcIid); }).map(function (u) {
            var f1 = fc(u.fcIid), f2 = fc(u.escFcIid);
            var action = String(u.crewAction || '').trim();
            var text = 'The flight crew shall be given timely information of ' + (f1.fcId ? f1.fcId + ' ' : '') + '"' + (f1.fcDesc || 'the failure condition') + '" so that ' +
                (action ? '"' + action + '"' : 'the required corrective action') + ' can be completed before it escalates to ' + (f2.fcId ? f2.fcId + ' ' : '') + '"' + (f2.fcDesc || 'a more severe condition') + '".';
            var det = u.detection === 'alert' ? 'alert ' + (u.alertRef || '(not named)') + ' per ASTM F3117' : u.detection === 'inherent' ? 'inherently evident' + (u.detectionNote ? ' — ' + u.detectionNote : '') : 'not yet decided';
            var s = u.subst || {};
            var rat = 'Unsafe system operating condition ' + u.id + ' (ASTM F3061 §4.2.6, Appendix X2): ' + (f1.severity || '?') + ' on its own, ' + (f2.severity || '?') + ' if the crew does not act. ' +
                'Crew information: ' + det + '. Time available: ' + (u.timeAvailable || 'not stated') + '. ' +
                'Procedure: ' + (u.procedure === 'afm' ? 'flight manual procedure ' + (u.procedureRef || '(not referenced)') : u.procedure === 'airmanship' ? 'normal airmanship' : 'not yet decided') + '. ' +
                'Clarity evidence: ' + ((CLARITY.find(function (c) { return c.v === u.clarity; }) || {}).label || 'none yet') + (u.clarityRef ? ' (' + u.clarityRef + ')' : '') + '. ' +
                'Substantiation — detection acceptable: ' + (s.detect || 'open') + '; action reasonable: ' + (s.action || 'open') + '; achievable before escalation: ' + (s.inTime || 'open') + '.' +
                (u.source && u.source !== 'manual' ? ' Found from ' + u.source + '.' : '');
            return {
                text: text, rat: rat, level: 'L1', type: 'Safety', analysis: 'Human Factors',
                verifMethod: (u.clarity === 'flight-test' || u.clarity === 'ground-test' || u.clarity === 'simulator') ? 'Test' : 'Analysis',
                traceId: u.id,
                reqSource: {
                    generator: 'usoc-info',
                    sourceId: scopeKey + ':usoc:' + u.id,
                    context: { usoc: u.id, fc: f1.fcId || String(f1.internalId), escalatesTo: f2.fcId || String(f2.internalId), detection: u.detection || '', procedure: u.procedure || '' },
                    fingerprint: fp ? fp('usoc-info', 'v1', u.id, f1.fcId, f1.fcDesc, f1.severity, f2.fcId, f2.fcDesc, f2.severity, u.detection, u.alertRef, u.detectionNote, u.crewAction, u.timeAvailable, u.procedure, u.procedureRef, u.clarity, u.clarityRef, s.detect, s.action, s.inTime) : null,
                    generatedAt: Date.now()
                }
            };
        });
    }

    // ---- editor (a draft copy: Cancel changes nothing) -----------------------------------------
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _opts(list, sel, ph) { return (ph ? '<option value="">' + _esc(ph) + '</option>' : '') + list.map(function (o) { return '<option value="' + o.v + '"' + (o.v === sel ? ' selected' : '') + '>' + _esc(o.label) + '</option>'; }).join(''); }
    var _draft = null;
    function _fcOptions(sel) { return '<option value="">Choose…</option>' + _fha().map(function (f) { return '<option value="' + _esc(f.internalId) + '"' + (String(f.internalId) === String(sel) ? ' selected' : '') + '>' + _esc(_label(f)) + '</option>'; }).join(''); }
    function _card(u) {
        var f1 = fc(u.fcIid), f2 = fc(u.escFcIid), s = u.subst || {};
        var head = '<div style="display:flex;gap:8px;align-items:center;"><b>' + _esc(u.id) + '</b><span style="font-size:11.5px;">' + _esc(_label(f1)) + ' → ' + _esc(_label(f2)) + '</span></div>';
        if (u.disposition === 'not-usoc') return '<div class="usoc-card" data-id="' + _esc(u.id) + '" style="border:1px solid var(--color-border-hair);border-radius:8px;padding:8px 12px;margin-bottom:8px;">' + head +
            '<label>Not a USOC because</label><input type="text" data-f="reason" value="' + _esc(u.reason) + '" style="width:100%;"></div>';
        var sel = function (f, list, ph) { return '<select data-f="' + f + '" style="width:100%;">' + _opts(list, u[f] || '', ph) + '</select>'; };
        var inp = function (f, ph) { return '<input type="text" data-f="' + f + '" value="' + _esc(u[f] || '') + '" placeholder="' + _esc(ph) + '" style="width:100%;">'; };
        var call = function (k, lbl) { return '<div><label>' + lbl + '</label><select data-s="' + k + '" style="width:100%;">' + _opts(CALL, s[k] || 'open') + '</select></div>'; };
        return '<div class="usoc-card" data-id="' + _esc(u.id) + '" style="border:1px solid var(--color-border-hair);border-radius:8px;padding:10px 12px;margin-bottom:10px;">' + head +
            '<div class="grid-2-col" style="gap:8px;margin-top:6px;">' +
            '<div><label>How the crew finds out</label>' + sel('detection', DETECTION, 'Choose…') + '</div>' +
            '<div><label>Alert name / cue detail</label>' + inp(u.detection === 'alert' ? 'alertRef' : 'detectionNote', u.detection === 'alert' ? 'e.g. FUEL IMBAL caution' : 'What makes it evident, and how soon') + '</div>' +
            '<div><label>Crew action</label>' + inp('crewAction', 'What the crew must do') + '</div>' +
            '<div><label>Time available before escalation</label>' + inp('timeAvailable', 'e.g. 20 min at max continuous') + '</div>' +
            '<div><label>Procedure</label>' + sel('procedure', PROCEDURE, 'Choose…') + '</div>' +
            '<div><label>Flight manual reference</label>' + inp('procedureRef', 'AFM section (if a procedure is needed)') + '</div>' +
            '<div><label>Evidence the cue is clear</label>' + sel('clarity', CLARITY, 'Choose…') + '</div>' +
            '<div><label>Evidence reference</label>' + inp('clarityRef', 'Test report / sim session / analysis ref') + '</div></div>' +
            '<div class="grid-3-col" style="gap:8px;margin-top:6px;">' + call('detect', 'Detection acceptable?') + call('action', 'Action reasonable?') + call('inTime', 'Achievable before escalation?') + '</div></div>';
    }
    function modalHtml() {
        var cands = candidates();
        return '<div class="ckpt-modal" role="dialog" aria-modal="true" style="max-width:900px;">' +
            '<div class="ckpt-m-head"><span class="ckpt-designation">F3061 §4.2.6 · X2</span><span class="ckpt-m-name">Unsafe system operating conditions</span><button class="ckpt-m-close" onclick="SLUsoc.close()" aria-label="Close">×</button></div>' +
            '<div style="padding:14px 18px;max-height:70vh;overflow:auto;">' +
            '<p style="font-size:12px;color:var(--color-text-secondary);">A failure condition that is Major or less on its own but becomes Hazardous or Catastrophic if the crew does not notice and act. For each: how the crew finds out, what they do, whether it needs a procedure, and the evidence that it all works in time.</p>' +
            '<div class="ckpt-m-sec">Candidates (from FCIM aware/unaware pairs)</div>' +
            (cands.length ? cands.map(function (c, i) {
                return '<div style="display:flex;gap:8px;align-items:center;font-size:12px;padding:4px 0;"><span>' + _esc(_label(fc(c.fcIid))) + ' → ' + _esc(_label(fc(c.escFcIid))) + '</span>' +
                    '<button type="button" class="ckpt-m-btn" style="margin-left:auto;font-size:11px;" onclick="SLUsoc._take(' + i + ',\'usoc\')">Record as USOC</button>' +
                    '<button type="button" class="ckpt-m-btn" style="font-size:11px;" onclick="SLUsoc._take(' + i + ',\'not-usoc\')">Not a USOC</button></div>';
            }).join('') : '<p style="font-size:12px;color:var(--color-text-tertiary);">No undispositioned candidates.</p>') +
            '<div class="ckpt-m-sec" style="margin-top:12px;">Add one by hand</div>' +
            '<div style="display:flex;gap:8px;align-items:flex-end;"><div style="flex:1;"><label>On its own</label><select id="usoc-new-from" style="width:100%;">' + _fcOptions('') + '</select></div>' +
            '<div style="flex:1;"><label>If the crew does not act</label><select id="usoc-new-to" style="width:100%;">' + _fcOptions('') + '</select></div>' +
            '<button type="button" class="btn-cyan" style="font-size:12px;" onclick="SLUsoc._addManual()">+ Add</button></div>' +
            '<div class="ckpt-m-sec" style="margin-top:12px;">Recorded</div>' +
            (store().length ? store().map(_card).join('') : '<p style="font-size:12px;color:var(--color-text-tertiary);">None yet.</p>') +
            '</div><div class="ckpt-m-foot"><span class="ckpt-m-outputs">Each USOC generates a crew-information requirement at the next requirement generation.</span>' +
            '<span class="ckpt-m-actions"><button class="ckpt-m-btn" onclick="SLUsoc.close()">Cancel</button><button class="ckpt-m-btn ckpt-m-btn-primary" onclick="SLUsoc._save()">Save</button></span></div></div>';
    }
    // While the editor is open, store() reads the DRAFT; Save writes it to the project.
    function _withDraft(fn) { var pc = _pc(); var real = pc.usocs, realCounter = pc.usocCounter; pc.usocs = _draft.usocs; pc.usocCounter = _draft.counter; try { return fn(); } finally { _draft.counter = pc.usocCounter; pc.usocs = real; pc.usocCounter = realCounter; } }
    function open() {
        if (!root.document || !_pc()) return;
        close();
        _draft = { usocs: JSON.parse(JSON.stringify(store())), counter: _pc().usocCounter || 0 };
        var ov = root.document.createElement('div'); ov.id = 'usoc-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9000;';
        ov.innerHTML = _withDraft(modalHtml);
        root.document.body.appendChild(ov);
    }
    function close() { try { var o = root.document && root.document.getElementById('usoc-overlay'); if (o) o.remove(); } catch (_) {} _draft = null; }
    function _collect() {
        var ov = root.document && root.document.getElementById('usoc-overlay'); if (!ov || !_draft) return;
        _draft.usocs.forEach(function (u) {
            var box = ov.querySelector('.usoc-card[data-id="' + u.id + '"]'); if (!box) return;
            Array.prototype.forEach.call(box.querySelectorAll('[data-f]'), function (el) { u[el.getAttribute('data-f')] = String(el.value || '').trim(); });
            if (!u.subst) u.subst = {};
            Array.prototype.forEach.call(box.querySelectorAll('[data-s]'), function (el) { u.subst[el.getAttribute('data-s')] = el.value || 'open'; });
        });
    }
    function _rerender() { var ov = root.document && root.document.getElementById('usoc-overlay'); if (ov && _draft) ov.innerHTML = _withDraft(modalHtml); }
    function exportCsv() {
        var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
        var head = ['USOC', 'On its own', 'If the crew does not act', 'Disposition', 'Reason', 'Crew information', 'Alert / cue', 'Crew action', 'Time available', 'Procedure', 'AFM ref', 'Clarity evidence', 'Evidence ref', 'Detection acceptable', 'Action reasonable', 'Achievable in time', 'Source'];
        return [head.map(q).join(',')].concat(store().map(function (u) {
            var s = u.subst || {};
            return [u.id, _label(fc(u.fcIid)), _label(fc(u.escFcIid)), u.disposition, u.reason, u.detection, u.detection === 'alert' ? u.alertRef : u.detectionNote, u.crewAction, u.timeAvailable, u.procedure, u.procedureRef, u.clarity, u.clarityRef, s.detect, s.action, s.inTime, u.source].map(q).join(',');
        })).join('\n');
    }

    function download() {
        try {
            var name = ((typeof projectName !== 'undefined' && projectName) || 'project').replace(/[^\w-]+/g, '_');
            var blob = new Blob(['\ufeff' + exportCsv()], { type: 'text/csv;charset=utf-8' });
            var a = root.document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = name + '_unsafe_operating_conditions.csv';
            root.document.body.appendChild(a); a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
        } catch (e) { try { root.slAlert && root.slAlert('Export failed: ' + e.message, { title: 'Unsafe operating conditions' }); } catch (_) {} }
    }

    var api = { SEV: SEV, download: download, isUsocShape: isUsocShape, candidates: candidates, record: record, get: get, store: store, missing: missing, findings: findings,
        requirements: requirements, INV: INV, open: open, close: close, exportCsv: exportCsv, modalHtml: modalHtml,
        _take: function (i, disp) {
            if (!_draft) return; _collect();
            // A "not a USOC" reason is typed on its card (INV-54 lists it until it is).
            _withDraft(function () { var c = candidates()[i]; if (c) record(c, disp, ''); });
            _rerender();
        },
        _addManual: function () {
            if (!_draft) return; _collect();
            var a = root.document.getElementById('usoc-new-from'), b = root.document.getElementById('usoc-new-to');
            var from = a && a.value, to = b && b.value;
            if (!from || !to) { try { root.showToast && root.showToast('Choose both failure conditions.', 'warning', 3000); } catch (_) {} return; }
            var f1 = fc(from), f2 = fc(to);
            if (!f1 || !f2 || !isUsocShape(f1.severity, f2.severity)) { try { root.showToast && root.showToast('Not a USOC shape: it must go from Major or less to Hazardous/Catastrophic, or from Hazardous to Catastrophic.', 'warning', 5000); } catch (_) {} return; }
            _withDraft(function () { record({ fcIid: f1.internalId, escFcIid: f2.internalId, source: 'manual' }, 'usoc'); });
            _rerender();
        },
        _save: function () {
            if (!_draft) return; _collect();
            var pc = _pc(); pc.usocs = _draft.usocs; pc.usocCounter = _draft.counter;
            try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
            close();
        },
        _draftFor: function () { return _draft; } };
    try { root.SLUsoc = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
