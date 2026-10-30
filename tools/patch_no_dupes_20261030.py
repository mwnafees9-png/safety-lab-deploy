#!/usr/bin/env python3
"""30 Oct 2026 — no duplicates anywhere; systems can be renamed, edited and removed.

Waqas: "AI or the tool itself must not create duplicates anywhere in the app, once an analysis or a
field has been created, it can then be updated or removed, not duplicated"; "there shouldnt be second
FCIM row for the same function, no duplicates of the same function, two FHA rows with being assessed
for the same phases of flight"; then "2 FCIM rows per function, 1 aware the second unaware". Systems:
"we currently do not have a remove/rename/update the system option" (remove: show what is inside and
what links to it, confirm by typing the name, undo; rename keeps the system's id, a name in use is
refused).

site/no_dupes.js holds the one rule. This patch makes every writer ask it. Anchored replacements only.
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'


def patch(rel, pairs):
    p = SITE / rel
    t = p.read_text(encoding='utf-8')
    for old, new in pairs:
        n = t.count(old)
        if n != 1:
            sys.exit('%s: anchor found %d times: %r' % (rel, n, old[:100]))
        t = t.replace(old, new)
    p.write_text(t, encoding='utf-8')
    print('patched', rel)


# ================================================================ the forms (makeCRUD validate)
patch('safety_lab.js', [
    ("    validate: (data) => (typeof SLFuncTree !== 'undefined' ? SLFuncTree.check(data, acFunctionsData) : ''),",
     "    // 30 Oct 2026 (no duplicates): a function or sub-function exists once (no_dupes.js)\n"
     "    validate: (data) => (typeof SLFuncTree !== 'undefined' ? SLFuncTree.check(data, acFunctionsData) : '') || ((window.SLNoDupes && (window.SLNoDupes.acFunctionClash(data, acFunctionsData) || {}).reason) || ''),"),
    ("    formIds: { funcId: 'sys-func-id', funcName: 'sys-func-name', funcDef: 'sys-func-def' },\n    submitBtn: 'btn-submit-sys-func',",
     "    formIds: { funcId: 'sys-func-id', funcName: 'sys-func-name', funcDef: 'sys-func-def' },\n"
     "    validate: (data) => (window.SLNoDupes && (window.SLNoDupes.sysFunctionClash(data, sys()?.functions) || {}).reason) || '',   // 30 Oct 2026 (no duplicates)\n"
     "    submitBtn: 'btn-submit-sys-func',"),
    ("    submitBtn: 'btn-submit-ac-fcim', cancelBtn: 'btn-cancel-ac-fcim', defaultText: 'Log AC FCIM',",
     "    submitBtn: 'btn-submit-ac-fcim', cancelBtn: 'btn-cancel-ac-fcim', defaultText: 'Log AC FCIM',\n"
     "    validate: (data) => (window.SLNoDupes && (window.SLNoDupes.fcimClash(data, acFcimData) || {}).reason) || '',   // 30 Oct 2026: one Aware and one Unaware row per function"),
    ("    submitBtn: 'btn-submit-sys-fcim', cancelBtn: 'btn-cancel-sys-fcim', defaultText: 'Log System FCIM',",
     "    submitBtn: 'btn-submit-sys-fcim', cancelBtn: 'btn-cancel-sys-fcim', defaultText: 'Log System FCIM',\n"
     "    validate: (data) => (window.SLNoDupes && (window.SLNoDupes.fcimClash(data, sys()?.fcim) || {}).reason) || '',   // 30 Oct 2026: one Aware and one Unaware row per function"),
])

# ================================================================ the FHA forms
patch('helpers_modules.js', [
    ("    if (!editStates.acFha) _slAutoNumber('acFha', data); // auto-fill blank FC ID on create only\n",
     "    // 30 Oct 2026 (no duplicates): a failure condition is assessed once per flight phase\n"
     "    { const _cl = window.SLNoDupes ? window.SLNoDupes.fhaClash(data, acFhaData) : null; if (_cl) { slAlert(_cl.reason, { title: 'FHA row not logged' }); return; } }\n"
     "    if (!editStates.acFha) _slAutoNumber('acFha', data); // auto-fill blank FC ID on create only\n"),
    ("    const arr = sys().fha;\n    if (editStates.sysFha) {",
     "    const arr = sys().fha;\n"
     "    { const _cl = window.SLNoDupes ? window.SLNoDupes.fhaClash(data, arr) : null; if (_cl) { slAlert(_cl.reason, { title: 'FHA row not logged' }); return; } }   // 30 Oct 2026 (no duplicates)\n"
     "    if (editStates.sysFha) {"),
])

# ================================================================ ai_assistant.js
AI = []
AI.append(("// 30 Oct 2026 (v76.92,",
           "// 30 Oct 2026 (v76.93, Waqas: no duplicates anywhere): every AI writer asks no_dupes.js. A function, an FCIM row (one Aware, one Unaware per function) or an FHA row that already exists is updated in place when the AI drafted it, kept (with a note that a newer draft was declined) when a person edited it, and an FHA row that would assess a phase already assessed for that condition is refused with the reason. add_system and the systems lane reuse a system by name. See tests/regression_no_dupes_20261030.test.js\n"
           "// 30 Oct 2026 (v76.92,"))

HELPERS = r'''
    // ---------------------------------------------------------------------------------------------
    // 30 Oct 2026 — NO DUPLICATES (Waqas: "AI or the tool itself must not create duplicates anywhere in
    // the app, once an analysis or a field has been created, it can then be updated or removed, not
    // duplicated"). no_dupes.js says what "the same" is; these say what the AI does about it: a row the
    // AI drafted is updated in place, a row a person wrote or edited is kept and told a newer draft was
    // declined (the same protection _fhaUpsert has always given hand-edited FHA rows).
    function _nd() { try { return (typeof window !== 'undefined' && window.SLNoDupes) ? window.SLNoDupes : null; } catch (_) { return null; } }
    function _ndHandEdited(r) { return !!(r && (r.humanEdited || r.aiGenerated !== true)); }
    function _ndDeclined(hit, what) { hit.aiNewerDraftAt = new Date().toISOString(); hit.aiNewerDraftNote = 'A newer AI draft for ' + what + ' was declined on accept because this row was written or edited by hand.'; }
    // A function the AI proposes that already exists: update its definition in place, or keep a hand-written one.
    function _ndFunctionUpsert(hit, defText, defKey) {
        if (_ndHandEdited(hit)) { _ndDeclined(hit, 'this function'); return 'protected'; }
        if (defText && String(defText).trim()) hit[defKey] = String(defText).trim();
        hit.aiRedrafts = (hit.aiRedrafts || 0) + 1;
        return 'updated';
    }
    // FCIM: the function's Aware (or Unaware) row exists already. Its condition ids are carried onto the
    // new draft so they stay the same; returns the row to update, null for a new row, false when kept.
    function _fcimDupPrep(row, store) {
        const N = _nd(); if (!N) return null;
        const c = N.fcimClash(row, store); if (!c) return null;
        const hit = c.row, aw = N.awarenessKey(row.awareness) === 'unaware' ? 'Unaware' : 'Aware';
        if (_ndHandEdited(hit)) {
            _ndDeclined(hit, 'this function\'s ' + aw + ' row');
            _applyFcimSuggestion._last = { action: 'protected', row: hit };
            _toast('Not applied: ' + row.subId + ' already has its ' + aw + ' FCIM row, written or edited by hand. Edit that row instead; the newer draft is noted on it.', 'warning', 7000);
            return false;
        }
        ['tl', 'pl', 'm'].forEach(function (k) { if (row[k + 'Desc'] && hit[k + 'Id']) row[k + 'Id'] = hit[k + 'Id']; });
        ['plExtra', 'mExtra'].forEach(function (k) { (Array.isArray(row[k]) ? row[k] : []).forEach(function (e, i) { const h = (Array.isArray(hit[k]) ? hit[k] : [])[i]; if (e && h && h.id) e.id = h.id; }); });
        return hit;
    }
    function _fcimDupMerge(hit, row) {
        ['tl', 'pl', 'm'].forEach(function (k) { if (row[k + 'Desc']) { delete hit[k + 'Na']; delete hit[k + 'NaBy']; delete hit[k + 'NaAt']; } });
        if (!row.mExtra) delete hit.mExtra;
        if (!row.plExtra) delete hit.plExtra;
        Object.assign(hit, row, { internalId: hit.internalId, aiRedrafts: (hit.aiRedrafts || 0) + 1 });
        _applyFcimSuggestion._last = { action: 'updated', row: hit };
    }
    // FHA: _fhaUpsert matches a re-draft by its FCIM source id and exact phase set. This also catches the
    // same condition by FC ID or by function + words, and a PARTLY overlapping phase set, which is refused:
    // a flight phase has one assessment per failure condition.
    function _fhaDupCheck(data, store) {
        const N = _nd(); if (!N) return null;
        const c = N.fhaClash(data, store); if (!c) return null;
        if (!c.exact) return { action: 'overlap', reason: c.reason, rows: c.rows };
        const hit = c.row;
        if (_ndHandEdited(hit)) { _ndDeclined(hit, 'this condition and phase set'); return { action: 'protected', row: hit }; }
        const keep = { internalId: hit.internalId, fcId: hit.fcId || data.fcId };
        const merged = [].concat(Array.isArray(hit.assumptionIds) ? hit.assumptionIds : [], Array.isArray(data.assumptionIds) ? data.assumptionIds : []).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
        Object.assign(hit, data, keep, { assumptionIds: merged, aiRedrafts: (hit.aiRedrafts || 0) + 1 });
        return { action: 'updated', row: hit };
    }
'''
AI.append(("    function _fhaUpsert(store, data) {", HELPERS + "    function _fhaUpsert(store, data) {"))

# FHA accept: system and aircraft
AI.append(("                const _upS = _fhaUpsert(sys.fha, data);\n",
           "                let _upS = _fhaUpsert(sys.fha, data);\n"
           "                if (_upS.action === 'add') { const _cl = _fhaDupCheck(data, sys.fha); if (_cl) _upS = _cl; }   // 30 Oct 2026 (no duplicates)\n"
           "                if (_upS.action === 'overlap') { _applyFhaSuggestion._last = _upS; _toast('Not applied: ' + _upS.reason, 'warning', 9000); return false; }\n"))
AI.append(("                const _upA = _fhaUpsert(acFhaData, data);\n",
           "                let _upA = _fhaUpsert(acFhaData, data);\n"
           "                if (_upA.action === 'add') { const _cl = _fhaDupCheck(data, acFhaData); if (_cl) _upA = _cl; }   // 30 Oct 2026 (no duplicates)\n"
           "                if (_upA.action === 'overlap') { _applyFhaSuggestion._last = _upA; _toast('Not applied: ' + _upA.reason, 'warning', 9000); return false; }\n"))
AI.append(("                        else if (!ok && _applyFhaSuggestion._last && _applyFhaSuggestion._last.action === 'nocondition')",
           "                        else if (!ok && _applyFhaSuggestion._last && _applyFhaSuggestion._last.action === 'overlap') results.push({ ok: false, blocked: true, error: 'not written: ' + _applyFhaSuggestion._last.reason });   // 30 Oct 2026\n"
           "                        else if (!ok && _applyFhaSuggestion._last && _applyFhaSuggestion._last.action === 'nocondition')"))

# FCIM accept: system and aircraft
AI.append(("    function _applyFcimSuggestion(s) {\n        if (_refuseEmpty('fcim', s)) return false;",
           "    function _applyFcimSuggestion(s) {\n        _applyFcimSuggestion._last = null;   // 30 Oct 2026: what the last call did\n        if (_refuseEmpty('fcim', s)) return false;"))
AI.append(("                const _sysCtx = { SYS: String(s._systemId || '') };\n",
           "                const _sysCtx = { SYS: String(s._systemId || '') };\n"
           "                const _fh = _fcimDupPrep(row, sys.fcim); if (_fh === false) return false;   // 30 Oct 2026 (no duplicates)\n"))
AI.append(("                _idExtras(sys.fcim, sys.fha, _sysCtx);\n                sys.fcim.push(row);",
           "                _idExtras(sys.fcim, sys.fha, _sysCtx);\n                if (_fh) _fcimDupMerge(_fh, row); else sys.fcim.push(row);"))
AI.append(("                if (typeof acFcimData === 'undefined') { _toast('FCIM data not loaded in this session.', 'warning'); return false; }\n                if (row.tlDesc) _fcimFcId(row, 'tlId');",
           "                if (typeof acFcimData === 'undefined') { _toast('FCIM data not loaded in this session.', 'warning'); return false; }\n"
           "                const _fh = _fcimDupPrep(row, acFcimData); if (_fh === false) return false;   // 30 Oct 2026 (no duplicates)\n"
           "                if (row.tlDesc) _fcimFcId(row, 'tlId');"))
AI.append(("                _idExtras();\n                acFcimData.push(row);",
           "                _idExtras();\n                if (_fh) _fcimDupMerge(_fh, row); else acFcimData.push(row);"))
AI.append(("                        results.push(ok ? { ok: true, summary: (a.scope === 'system' ? 'System' : 'AC') + ' FCIM added for ' + _chatClip(a.subId, 24) } : { ok: false, error: 'add_fcim failed' }); break;",
           "                        { const _fl = _applyFcimSuggestion._last; results.push(ok ? { ok: true, summary: (a.scope === 'system' ? 'System' : 'AC') + ' FCIM ' + ((_fl && _fl.action === 'updated') ? 'updated in place' : 'added') + ' for ' + _chatClip(a.subId, 24) } : ((_fl && _fl.action === 'protected') ? { ok: false, blocked: true, error: _chatClip(a.subId, 24) + ' already has this FCIM row, edited by hand: not overwritten; newer draft noted on it' } : { ok: false, error: 'add_fcim failed' })); }   // 30 Oct 2026\n"
           "                        break;"))

# decomposition accept: system functions and aircraft functions
AI.append(("                    try { if (typeof _slAutoNumber === 'function') _slAutoNumber('sysFunc', row); } catch (_) {}\n                    if (!row.funcId) {   // sysFunc IDs are not auto-minted",
           "                    { const _N = _nd(), _c = _N ? _N.sysFunctionClash(row, sysObj.functions) : null; if (_c) { if (_ndFunctionUpsert(_c.row, row.funcDef, 'funcDef') === 'updated') updated++; else kept++; return; } }   // 30 Oct 2026 (no duplicates)\n"
           "                    try { if (typeof _slAutoNumber === 'function') _slAutoNumber('sysFunc', row); } catch (_) {}\n                    if (!row.funcId) {   // sysFunc IDs are not auto-minted"))
AI.append(("                    if (typeof _slAutoNumber === 'function') _slAutoNumber('acFunc', row); // shared funcId per name + unique subId\n                    _fallbackFuncIds(row);                                                 // fill any still-blank IDs if numbering engine inactive\n                    acFunctionsData.push(row);",
           "                    { const _N = _nd(), _c = _N ? _N.acFunctionClash(Object.assign({}, row, { subId: '', funcId: ((acFunctionsData || []).find(function (r) { return r && _N.norm(r.funcName) === _N.norm(row.funcName); }) || {}).funcId || '' }), acFunctionsData) : null; if (_c) { if (_ndFunctionUpsert(_c.row, row.subDef, 'subDef') === 'updated') updated++; else kept++; return; } }   // 30 Oct 2026 (no duplicates)\n"
           "                    if (typeof _slAutoNumber === 'function') _slAutoNumber('acFunc', row); // shared funcId per name + unique subId\n                    _fallbackFuncIds(row);                                                 // fill any still-blank IDs if numbering engine inactive\n                    acFunctionsData.push(row);"))
AI.append(("            if (typeof scheduleAutosave === 'function') scheduleAutosave();\n            return added;\n        } catch (e) { _toast('Could not add functions: '",
           "            if (typeof scheduleAutosave === 'function') scheduleAutosave();\n            if (updated || kept) _toast((updated ? updated + ' function(s) already existed and were updated in place' : '') + (updated && kept ? '; ' : '') + (kept ? kept + ' already existed, written or edited by hand, and were kept' : '') + '. Nothing was added twice.', 'info', 7000);   // 30 Oct 2026\n            return added;\n        } catch (e) { _toast('Could not add functions: '"))
AI.append(("            let added = 0;\n            if (scope.systemId) {",
           "            let added = 0, updated = 0, kept = 0;   // 30 Oct 2026: a function that exists already is updated, never added twice\n            if (scope.systemId) {"))

# ANEM add_function
AI.append(("            const row = { internalId: newRowId(), funcId: '', funcName: a.subName || a.funcName || '', funcDef: a.subDef || a.funcDef || '', traceIds: a.traceIds || [], ..._chatProv(model) };\n",
           "            const row = { internalId: newRowId(), funcId: '', funcName: a.subName || a.funcName || '', funcDef: a.subDef || a.funcDef || '', traceIds: a.traceIds || [], ..._chatProv(model) };\n"
           "            { const _N = _nd(), _c = _N ? _N.sysFunctionClash(row, sysObj.functions) : null; if (_c) { const _r = _ndFunctionUpsert(_c.row, row.funcDef, 'funcDef'); if (typeof renderSysFunctions === 'function') renderSysFunctions(); return _r === 'updated' ? { ok: true, summary: 'System function ' + (_c.row.funcId || '') + ' already exists: updated in place, not added again' } : { ok: false, blocked: true, error: 'system function ' + (_c.row.funcId || _c.row.funcName) + ' already exists and was written or edited by hand: not overwritten' }; } }   // 30 Oct 2026 (no duplicates)\n"))
AI.append(("        const row = { internalId: newRowId(), funcId: '', funcName: a.funcName || '', funcDef: a.funcDef || '', subId: '', subName: a.subName || '', subDef: a.subDef || '', ..._chatProv(model) };\n        if (typeof _slAutoNumber === 'function') _slAutoNumber('acFunc', row);",
           "        const row = { internalId: newRowId(), funcId: '', funcName: a.funcName || '', funcDef: a.funcDef || '', subId: '', subName: a.subName || '', subDef: a.subDef || '', ..._chatProv(model) };\n"
           "        { const _N = _nd(), _c = _N ? _N.acFunctionClash(Object.assign({}, row, { funcId: ((acFunctionsData || []).find(function (r) { return r && _N.norm(r.funcName) === _N.norm(row.funcName); }) || {}).funcId || '' }), acFunctionsData) : null; if (_c) { const _r = _ndFunctionUpsert(_c.row, row.subName ? row.subDef : row.funcDef, row.subName ? 'subDef' : 'funcDef'); if (typeof renderACFunctions === 'function') renderACFunctions(); return _r === 'updated' ? { ok: true, summary: 'Aircraft function ' + (_c.row.subId || _c.row.funcId || '') + ' already exists: updated in place, not added again' } : { ok: false, blocked: true, error: 'aircraft function ' + (_c.row.subId || _c.row.funcId) + ' already exists and was written or edited by hand: not overwritten' }; } }   // 30 Oct 2026 (no duplicates)\n"
           "        if (typeof _slAutoNumber === 'function') _slAutoNumber('acFunc', row);"))

# add_system: reuse by name, the same rule as everywhere (case and spaces ignored)
AI.append(("        var existing = _chatSysByIdOrName(name);\n",
           "        var existing = _chatSysByIdOrName(name) || (_nd() ? _nd().findSystemByName(name, systemsData) : null);   // 30 Oct 2026: spaces ignored too\n"))
AI.append(("            var rl = r.toLowerCase(); return (systemsData || []).find(function (x) { return String(x.name || '').toLowerCase() === rl; }) || null; } catch (_) { return null; }",
           "            var rl = r.replace(/\\s+/g, ' ').trim().toLowerCase(); return (systemsData || []).find(function (x) { return String(x.name || '').replace(/\\s+/g, ' ').trim().toLowerCase() === rl; }) || null; } catch (_) { return null; }   // 30 Oct 2026: spaces ignored"))
patch('ai_assistant.js', AI)
patch('ai_loader.js', [("'ai_assistant.js?v=76.92'", "'ai_assistant.js?v=76.93'")])
print('done')
