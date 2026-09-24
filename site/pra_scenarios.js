// ============================================================================
// pra_scenarios.js — v1.0 — particular-risk SCENARIOS and the requirement
// cascade (23 Sep 2026, standards gap G3; ARP4761A Appendix L, Q.15.2.7.2).
//
// WHY: a PRA row carried the threat, its model, the zones it can reach and one
// free-text "CSFL impact". Appendix L asks for more per risk: each SCENARIO —
// what is hit together, the aircraft effect and its failure-condition
// classification, and whether that is acceptable — and requirements that trace
// back to the scenario with their origin, rationale, allocation and whether they
// interrelate with other particular risks; plus the assumptions the risk rests
// on WITH the impact if one proves wrong.
//
// WHAT: on each praData row —
//   scenarios: [{ scnId 'S1', affected: [AC sub-function ids hit together],
//                 fcIds: [AC FHA internalIds this scenario can cause],
//                 effect (aircraft effect, text), acceptable 'yes'|'no'|'open',
//                 rationale }]
//   assumptionImpacts: { <assumption internalId>: 'impact if it proves wrong' }
// Derived (never stored): the classification (worst linked FC severity), the
// allocation (systems owning the affected functions), and the interrelation
// (other applicable risks sharing a zone or an affected function).
// Requirements: a risk WITH scenarios yields one requirement per scenario
// (generator 'pra-scenario', sourceId ac:pra:<praId>:<scnId>); a risk without
// keeps its single 'pra-zonal' requirement, so existing projects do not churn.
// INV-53 (advisory) lists applicable risks with no scenario, undecided or
// unacceptable scenarios, scenarios with no linked failure condition, and
// linked assumptions with no stated impact.
// See tests/regression_pra_scenarios.test.js.
// ============================================================================
(function (root) {
    'use strict';

    var SEV = ['Negligible', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];
    var ACCEPT = [{ v: 'open', label: 'Open — not yet decided' }, { v: 'yes', label: 'Acceptable' }, { v: 'no', label: 'Not acceptable — design change needed' }];

    function _arr(name) { try { var v = root[name]; if (Array.isArray(v)) return v; } catch (_) {} return []; }
    function _g(name) {
        // Bare globals (classic scripts) first; fall back to window properties.
        try {
            switch (name) {
                case 'praData': return typeof praData !== 'undefined' && Array.isArray(praData) ? praData : _arr(name);
                case 'zsaData': return typeof zsaData !== 'undefined' && Array.isArray(zsaData) ? zsaData : _arr(name);
                case 'acFhaData': return typeof acFhaData !== 'undefined' && Array.isArray(acFhaData) ? acFhaData : _arr(name);
                case 'systemsData': return typeof systemsData !== 'undefined' && Array.isArray(systemsData) ? systemsData : _arr(name);
                case 'acAssumptionsData': return typeof acAssumptionsData !== 'undefined' && Array.isArray(acAssumptionsData) ? acAssumptionsData : _arr(name);
                case 'acFunctionsData': return typeof acFunctionsData !== 'undefined' && Array.isArray(acFunctionsData) ? acFunctionsData : _arr(name);
            }
        } catch (_) {}
        return _arr(name);
    }
    function _uniqSorted(a) { var s = {}; (a || []).forEach(function (x) { if (x != null && x !== '') s[String(x)] = 1; }); return Object.keys(s).sort(); }
    function _fhaIds(f) { return (Array.isArray(f.subIds) && f.subIds.length) ? f.subIds.map(String) : (f.subId ? [String(f.subId)] : []); }

    // ---- derived facts -----------------------------------------------------------------------
    function applicable(row) { return !!row && row.disposition !== 'na'; }
    function zones(row) { return _uniqSorted(row && row.affectedZones); }
    // Sub-functions housed in the risk's zones (the same join the requirement generator uses).
    function exposed(row) {
        var z = zones(row), out = [];
        z.forEach(function (zid) { _g('zsaData').forEach(function (r) { if (r && r.zoneId === zid && Array.isArray(r.housedFunctions)) out = out.concat(r.housedFunctions); }); });
        return _uniqSorted(out);
    }
    // Systems whose functions trace to any of these AC sub-functions.
    function ownersOf(subIds) {
        var want = {}; (subIds || []).forEach(function (s) { want[String(s)] = 1; });
        return _g('systemsData').filter(function (s) {
            return (s && s.functions || []).some(function (f) {
                var t = Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : []);
                return t.some(function (x) { return want[String(x)]; });
            });
        });
    }
    // AC failure conditions of those sub-functions — the suggestions for a scenario.
    function fcsFor(subIds) {
        var want = {}; (subIds || []).forEach(function (s) { want[String(s)] = 1; });
        return _g('acFhaData').filter(function (f) { return f && _fhaIds(f).some(function (x) { return want[x]; }); });
    }
    function fc(iid) { var a = _g('acFhaData'); for (var i = 0; i < a.length; i++) if (a[i] && String(a[i].internalId) === String(iid)) return a[i]; return null; }
    function classification(scn) {
        var worst = -1, name = null;
        ((scn && scn.fcIds) || []).forEach(function (id) { var f = fc(id); var r = f ? SEV.indexOf(f.severity) : -1; if (r > worst) { worst = r; name = f.severity; } });
        return name;
    }
    // Other applicable risks sharing a zone with this risk or an affected function with this scenario.
    function interrelated(row, scn) {
        var myZ = {}; zones(row).forEach(function (z) { myZ[z] = 1; });
        var myF = {}; ((scn && scn.affected) || []).forEach(function (f) { myF[String(f)] = 1; });
        var out = [];
        _g('praData').forEach(function (o) {
            if (!o || o === row || (row.internalId != null && String(o.internalId) === String(row.internalId)) || !applicable(o)) return;
            var hit = zones(o).some(function (z) { return myZ[z]; }) ||
                (o.scenarios || []).some(function (s) { return (s.affected || []).some(function (f) { return myF[String(f)]; }); });
            if (hit) out.push(o.praId || ('PRA#' + o.internalId));
        });
        return _uniqSorted(out);
    }

    // ---- editing -------------------------------------------------------------------------------
    function add(row) {
        if (!row) return null;
        if (!Array.isArray(row.scenarios)) row.scenarios = [];
        var n = row.scenarios.reduce(function (m, s) { var k = parseInt(String(s.scnId || '').replace(/\D/g, ''), 10); return Math.max(m, isNaN(k) ? 0 : k); }, 0) + 1;
        var s = { scnId: 'S' + n, affected: exposed(row), fcIds: [], effect: '', acceptable: 'open', rationale: '' };
        row.scenarios.push(s);
        return s;
    }
    function remove(row, scnId) {
        if (!row || !Array.isArray(row.scenarios)) return false;
        var i = row.scenarios.findIndex(function (s) { return s.scnId === scnId; });
        if (i < 0) return false;
        row.scenarios.splice(i, 1);
        return true;
    }
    function setImpact(row, asmId, text) {
        if (!row) return;
        if (!row.assumptionImpacts || typeof row.assumptionImpacts !== 'object') row.assumptionImpacts = {};
        var t = String(text == null ? '' : text).trim();
        if (t) row.assumptionImpacts[String(asmId)] = t; else delete row.assumptionImpacts[String(asmId)];
    }

    // ---- findings (INV-53) -------------------------------------------------------------------
    function _name(row) { return (row.praId || 'PRA') + ' ' + (row.threat || ''); }
    function findings(rows) {
        var out = [];
        (rows || _g('praData')).forEach(function (row) {
            if (!row || !applicable(row)) return;
            var sc = Array.isArray(row.scenarios) ? row.scenarios : [];
            if (!sc.length) { if (zones(row).length) out.push({ row: row, kind: 'no-scenario', text: _name(row) + ' — reaches zone(s) ' + zones(row).join(', ') + ' but has no scenario (what is hit together, the effect, the classification)' }); }
            sc.forEach(function (s) {
                var tag = _name(row) + ' / ' + s.scnId;
                if (!(s.fcIds || []).length && !String(s.rationale || '').trim()) out.push({ row: row, scn: s, kind: 'no-fc', text: tag + ' — no failure condition linked and no rationale saying why none applies' });
                if (s.acceptable === 'no') out.push({ row: row, scn: s, kind: 'unacceptable', text: tag + ' — NOT acceptable' + (classification(s) ? ' (' + classification(s) + ')' : '') + ': a design change is needed' });
                else if (s.acceptable !== 'yes') out.push({ row: row, scn: s, kind: 'open', text: tag + ' — acceptability not yet decided' });
            });
            (Array.isArray(row.assumptionIds) ? row.assumptionIds : []).forEach(function (a) {
                if (!(row.assumptionImpacts && String(row.assumptionImpacts[String(a)] || '').trim())) {
                    var asm = _g('acAssumptionsData').find(function (x) { return String(x.internalId) === String(a); });
                    out.push({ row: row, kind: 'no-impact', text: _name(row) + ' — relies on assumption ' + ((asm && (asm.asmId || asm.text)) || a) + ' with no stated impact if it proves wrong' });
                }
            });
        });
        return out;
    }
    var INV = {
        id: 'INV-53', sev: 'advisory',
        name: 'Every applicable particular risk has its scenarios (hit together → effect → classification → acceptable), and the assumptions it rests on carry their impact if wrong',
        run: function () {
            var rows = _g('praData'), f = findings(rows);
            return { checked: rows.filter(applicable).length, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length };
        }
    };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- the requirement cascade --------------------------------------------------------------
    function has(row) { return !!row && applicable(row) && Array.isArray(row.scenarios) && row.scenarios.length > 0; }
    function _asmText(row) {
        var ids = Array.isArray(row.assumptionIds) ? row.assumptionIds : [];
        if (!ids.length) return '';
        return ' Assumptions relied on: ' + ids.map(function (a) {
            var asm = _g('acAssumptionsData').find(function (x) { return String(x.internalId) === String(a); });
            var imp = row.assumptionImpacts && row.assumptionImpacts[String(a)];
            return ((asm && (asm.asmId || asm.text)) || a) + (imp ? ' (if wrong: ' + imp + ')' : ' (impact if wrong: not stated)');
        }).join('; ') + '.';
    }
    // One requirement per scenario. `fp` is the generator's fingerprint helper.
    function requirements(row, fp, scopeKey) {
        if (!has(row)) return [];
        scopeKey = scopeKey || 'ac';
        var z = zones(row), zStr = z.length ? z.join(', ') : 'the zones in its footprint';
        var key = row.praId || ('internal-' + row.internalId);
        var threat = row.threat || 'unspecified threat';
        return row.scenarios.map(function (s) {
            var fcs = (s.fcIds || []).map(fc).filter(Boolean);
            var cls = classification(s);
            var affected = _uniqSorted(s.affected);
            var owners = ownersOf(affected).map(function (o) { return o.name || o.id; });
            var inter = interrelated(row, s);
            var text = fcs.length
                ? 'If the particular risk "' + threat + '" occurs within zone(s) ' + zStr + ' (scenario ' + s.scnId + '), it shall not result in ' + fcs.map(function (f) { return (f.fcId ? f.fcId + ' ' : '') + '"' + (f.fcDesc || 'failure condition') + '"'; }).join(' or ') + '.'
                : 'If the particular risk "' + threat + '" occurs within zone(s) ' + zStr + ' (scenario ' + s.scnId + '), the aircraft shall retain ' + (affected.length ? affected.join(', ') : 'the aircraft sub-functions housed in those zones') + '.';
            var acc = s.acceptable === 'yes' ? 'acceptable' : s.acceptable === 'no' ? 'NOT acceptable — design change needed' : 'not yet decided';
            var rat = 'Origin: PRA ' + (row.praId || '') + ', scenario ' + s.scnId + ' (ARP4761A Appendix L). ' +
                'Hit together: ' + (affected.length ? affected.join(', ') : 'none recorded') + '. ' +
                'Aircraft effect: ' + (String(s.effect || '').trim() || 'not stated') + '. ' +
                'Failure condition(s): ' + (fcs.length ? fcs.map(function (f) { return (f.fcId || f.internalId) + ' (' + (f.severity || '?') + ')'; }).join(', ') : 'none linked') + (cls ? '; classification ' + cls : '') + '. ' +
                'Acceptability: ' + acc + (String(s.rationale || '').trim() ? ' — ' + String(s.rationale).trim() : '') + '. ' +
                'Allocated to: ' + (owners.length ? owners.join(', ') : 'no owning system resolved') + '. ' +
                'Interrelated with: ' + (inter.length ? inter.join(', ') + ' (shared zone or function; changes to one can affect the other)' : 'no other particular risk') + '.' +
                (row.mitigation ? ' Mitigation: ' + row.mitigation + '.' : '') + _asmText(row);
            var fcIdList = fcs.map(function (f) { return String(f.internalId); }).sort();
            return {
                text: text, rat: rat, level: 'L2', type: 'Safety', analysis: 'Independence', verifMethod: 'Analysis',
                traceId: (row.praId || '') + '.' + s.scnId,
                reqSource: {
                    generator: 'pra-scenario',
                    sourceId: scopeKey + ':pra:' + key + ':' + s.scnId,
                    context: { threat: threat, zones: z, scenario: s.scnId, affected: affected, fcIds: fcIdList, classification: cls, allocatedTo: owners, interrelated: inter, acceptable: s.acceptable || 'open' },
                    fingerprint: fp ? fp('pra-scenario', 'v1', threat, z, s.scnId, affected, fcIdList, s.effect || '', s.acceptable || 'open', s.rationale || '', owners, inter, row.mitigation || '', row.assumptionImpacts || {}) : null,
                    generatedAt: Date.now()
                }
            };
        });
    }

    // ---- editor ----------------------------------------------------------------------------------
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _row(iid) { return _g('praData').find(function (r) { return r && String(r.internalId) === String(iid); }) || null; }
    function _save() { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} try { if (typeof root.renderPRA === 'function') root.renderPRA(); } catch (_) {} }
    function _fnName(subId) { var f = _g('acFunctionsData').find(function (x) { return x && x.subId === subId; }); return f ? (subId + ' ' + (f.subName || f.funcName || '')) : subId; }

    function cellHtml(row) {
        if (!row || !applicable(row)) return '<span style="color:var(--color-text-tertiary);font-size:11px;">n/a</span>';
        var sc = row.scenarios || [];
        var f = findings([row]).length;
        return '<button type="button" class="ckpt-m-btn" style="font-size:10.5px;padding:1px 8px;" onclick="SLPraScenarios.open(\'' + _esc(row.internalId) + '\')">' +
            (sc.length ? sc.length + ' scenario' + (sc.length === 1 ? '' : 's') : 'Add scenarios') + '</button>' +
            (f ? '<div style="font-size:10.5px;color:var(--color-warning,#b45309);margin-top:2px;">' + f + ' open item' + (f === 1 ? '' : 's') + '</div>' : '');
    }
    function modalHtml(row) {
        var ex = exposed(row);
        var scen = (row.scenarios || []).map(function (s) {
            var pool = _uniqSorted(ex.concat(s.affected || []));
            var sugg = fcsFor(s.affected || []);
            var fcPool = sugg.concat((s.fcIds || []).map(fc).filter(function (f) { return f && sugg.indexOf(f) === -1; }));
            var inter = interrelated(row, s), cls = classification(s);
            return '<div class="pra-scn" data-scn="' + _esc(s.scnId) + '" style="border:1px solid var(--color-border-hair);border-radius:8px;padding:10px 12px;margin-bottom:10px;">' +
                '<div style="display:flex;align-items:center;gap:8px;"><b>' + _esc(s.scnId) + '</b>' +
                (cls ? '<span style="font-size:11px;">' + _esc(cls) + '</span>' : '<span style="font-size:11px;color:var(--color-text-tertiary);">no failure condition linked</span>') +
                '<button type="button" style="margin-left:auto;font-size:11px;border:none;background:transparent;color:#8E2A2A;cursor:pointer;" onclick="SLPraScenarios._remove(\'' + _esc(row.internalId) + '\',\'' + _esc(s.scnId) + '\')">Remove</button></div>' +
                '<div style="font-size:11.5px;margin-top:6px;"><b>Hit together</b> (functions housed in the risk\'s zones; untick what this scenario spares)</div>' +
                '<div>' + (pool.length ? pool.map(function (f) { return '<label style="display:inline-flex;gap:4px;margin:2px 10px 2px 0;font-size:11.5px;text-transform:none;letter-spacing:0;"><input type="checkbox" data-f="aff" value="' + _esc(f) + '"' + ((s.affected || []).indexOf(f) !== -1 ? ' checked' : '') + '> ' + _esc(_fnName(f)) + '</label>'; }).join('') : '<i style="font-size:11px;">No functions housed in the chosen zones — record the zones\' housed functions in the ZSA.</i>') + '</div>' +
                '<div style="font-size:11.5px;margin-top:6px;"><b>Failure condition(s) this can cause</b> (suggested from the functions hit)</div>' +
                '<div>' + (fcPool.length ? fcPool.map(function (f) { return '<label style="display:inline-flex;gap:4px;margin:2px 10px 2px 0;font-size:11.5px;text-transform:none;letter-spacing:0;"><input type="checkbox" data-f="fc" value="' + _esc(f.internalId) + '"' + ((s.fcIds || []).map(String).indexOf(String(f.internalId)) !== -1 ? ' checked' : '') + '> ' + _esc((f.fcId || '') + ' ' + (f.fcDesc || '')) + ' <i>(' + _esc(f.severity || '?') + ')</i></label>'; }).join('') : '<i style="font-size:11px;">No aircraft failure condition traces to these functions.</i>') + '</div>' +
                '<label style="margin-top:6px;">Aircraft effect</label><input type="text" data-f="effect" value="' + _esc(s.effect || '') + '" placeholder="What the aircraft loses when these are hit together" style="width:100%;">' +
                '<div style="display:flex;gap:10px;margin-top:6px;"><div style="flex:0 0 260px;"><label>Acceptable?</label><select data-f="acceptable" style="width:100%;">' + ACCEPT.map(function (a) { return '<option value="' + a.v + '"' + ((s.acceptable || 'open') === a.v ? ' selected' : '') + '>' + _esc(a.label) + '</option>'; }).join('') + '</select></div>' +
                '<div style="flex:1;"><label>Rationale</label><input type="text" data-f="rationale" value="' + _esc(s.rationale || '') + '" placeholder="Why it is (or is not) acceptable — or why no failure condition applies" style="width:100%;"></div></div>' +
                '<div style="font-size:11px;color:var(--color-text-tertiary);margin-top:6px;">Allocated to: ' + _esc(ownersOf(s.affected || []).map(function (o) { return o.name || o.id; }).join(', ') || 'no owning system resolved') +
                ' · Interrelated with: ' + _esc(inter.join(', ') || 'no other particular risk') + '</div></div>';
        }).join('');
        var asms = (Array.isArray(row.assumptionIds) ? row.assumptionIds : []).map(function (a) {
            var asm = _g('acAssumptionsData').find(function (x) { return String(x.internalId) === String(a); });
            return '<label>' + _esc((asm && ((asm.asmId ? asm.asmId + ' — ' : '') + (asm.text || ''))) || a) + '</label>' +
                '<input type="text" class="pra-imp" data-asm="' + _esc(a) + '" value="' + _esc((row.assumptionImpacts || {})[String(a)] || '') + '" placeholder="Impact on this risk if the assumption proves wrong" style="width:100%;">';
        }).join('');
        return '<div class="ckpt-modal" role="dialog" aria-modal="true" style="max-width:860px;">' +
            '<div class="ckpt-m-head"><span class="ckpt-designation">Particular risk</span><span class="ckpt-m-name">' + _esc((row.praId || '') + ' · ' + (row.threat || '')) + ' — scenarios (ARP4761A App L)</span>' +
            '<button class="ckpt-m-close" onclick="SLPraScenarios.close()" aria-label="Close">×</button></div>' +
            '<div style="padding:14px 18px;max-height:70vh;overflow:auto;">' +
            '<div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:10px;">Zones: ' + _esc(zones(row).join(', ') || 'none chosen') + '. Each scenario is one way the risk plays out: what is hit together, the aircraft effect, the failure condition and whether that is acceptable. Each one becomes a traced requirement.</div>' +
            (scen || '<p style="font-size:12px;color:var(--color-text-tertiary);">No scenarios yet.</p>') +
            '<button type="button" class="btn-cyan" style="font-size:12px;" onclick="SLPraScenarios._add(\'' + _esc(row.internalId) + '\')">+ Add scenario</button>' +
            '<div class="ckpt-m-sec" style="margin-top:16px;">Assumptions this risk rests on — impact if wrong</div>' +
            (asms || '<p style="font-size:12px;color:var(--color-text-tertiary);">No assumptions linked (link them on the PRA form).</p>') +
            '</div><div class="ckpt-m-foot"><span class="ckpt-m-outputs">Saving updates the scenario requirements in the next requirement generation.</span>' +
            '<span class="ckpt-m-actions"><button class="ckpt-m-btn" onclick="SLPraScenarios.close()">Cancel</button><button class="ckpt-m-btn ckpt-m-btn-primary" onclick="SLPraScenarios._saveModal(\'' + _esc(row.internalId) + '\')">Save</button></span></div></div>';
    }
    // The editor works on a DRAFT (a view over the row with its own scenario list and
    // impacts): add / remove / typing change only the draft; Save writes it back; Cancel
    // leaves the row exactly as it was.
    var _openId = null, _draft = null;
    function _makeDraft(row) {
        var d = Object.create(row);
        d.scenarios = JSON.parse(JSON.stringify(row.scenarios || []));
        d.assumptionImpacts = JSON.parse(JSON.stringify(row.assumptionImpacts || {}));
        return d;
    }
    function open(iid) {
        var row = _row(iid); if (!row || !root.document) return;
        close();
        _openId = iid; _draft = _makeDraft(row);
        var ov = root.document.createElement('div'); ov.id = 'pra-scn-overlay';
        ov.className = 'ckpt-modal-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:9000;';
        ov.innerHTML = modalHtml(_draft);
        root.document.body.appendChild(ov);
    }
    function close() { try { var o = root.document && root.document.getElementById('pra-scn-overlay'); if (o) o.remove(); } catch (_) {} _openId = null; _draft = null; }
    // Read the modal back into the row (without closing), so add/remove keep unsaved edits.
    function _collect(row) {
        var doc = root.document; if (!doc) return;
        var ov = doc.getElementById('pra-scn-overlay'); if (!ov) return;
        (row.scenarios || []).forEach(function (s) {
            var box = ov.querySelector('.pra-scn[data-scn="' + s.scnId + '"]'); if (!box) return;
            s.affected = Array.prototype.map.call(box.querySelectorAll('input[data-f="aff"]:checked'), function (i) { return i.value; });
            s.fcIds = Array.prototype.map.call(box.querySelectorAll('input[data-f="fc"]:checked'), function (i) { return i.value; });
            var g = function (f) { var el = box.querySelector('[data-f="' + f + '"]'); return el ? el.value : ''; };
            s.effect = g('effect').trim(); s.acceptable = g('acceptable') || 'open'; s.rationale = g('rationale').trim();
        });
        Array.prototype.forEach.call(ov.querySelectorAll('input.pra-imp'), function (i) { setImpact(row, i.getAttribute('data-asm'), i.value); });
    }
    function _rerender(row) { var ov = root.document && root.document.getElementById('pra-scn-overlay'); if (ov) ov.innerHTML = modalHtml(row); }

    var api = { SEV: SEV, ACCEPT: ACCEPT, applicable: applicable, zones: zones, exposed: exposed, ownersOf: ownersOf, fcsFor: fcsFor,
        classification: classification, interrelated: interrelated, add: add, remove: remove, setImpact: setImpact,
        findings: findings, has: has, requirements: requirements, cellHtml: cellHtml, modalHtml: modalHtml, open: open, close: close, INV: INV,
        _add: function (iid) { if (!_draft || String(_openId) !== String(iid)) return; _collect(_draft); add(_draft); _rerender(_draft); },
        _remove: function (iid, scnId) { if (!_draft || String(_openId) !== String(iid)) return; _collect(_draft); remove(_draft, scnId); _rerender(_draft); },
        _saveModal: function (iid) {
            var r = _row(iid); if (!r || !_draft || String(_openId) !== String(iid)) return;
            _collect(_draft);
            r.scenarios = _draft.scenarios;
            if (Object.keys(_draft.assumptionImpacts).length) r.assumptionImpacts = _draft.assumptionImpacts; else delete r.assumptionImpacts;
            _save(); close();
        },
        _draftFor: function () { return _draft; },
        _collect: _collect };
    try { root.SLPraScenarios = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
