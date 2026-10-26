#!/usr/bin/env python3
# 26 Oct 2026: INV-31 (AI-authored rows pass the apply-time rules) also names an AI row that is empty by the rule the
# writers now apply (ai_assistant.js _ROW_RULES): an FHA row with no failure condition, an FCIM row with no failure
# condition, a function with no function or sub-function name. Rows written before the fix (three AFHA rows and
# SF-025 with its FCIM row on the Aeolus run) show on Thread Integrity, by name, for the engineer to delete or redraft.
# Detection only, as the sweep always is. Applied once; kept for the record.
p = 'site/invariants.js'; s = open(p).read()
R = [
("""                const chkFha = (f, scope) => {
                    if (!isAi(f)) return;
                    checked++;""",
"""                // 26 Oct 2026: an empty row, by the writers' own rule (ai_assistant.js _ROW_RULES)
                const _has = v => Array.isArray(v) ? v.some(x => String(x == null ? '' : x).trim() !== '') : String(v == null ? '' : v).trim() !== '';
                const EMPTY = ': the row is empty; delete it or draft it again';
                const fcimEmpty = c => !(_has(c.tlDesc) || _has(c.plDesc) || _has(c.mDesc) || (c.plExtra || []).some(e => e && _has(e.desc)) || (c.mExtra || []).some(e => e && _has(e.desc)) || (c.tlExtra || []).some(e => e && _has(e.desc)));
                const chkFcim = (c, scope) => { if (!isAi(c)) return; checked++; if (fcimEmpty(c)) fails.push(scope + ' FCIM ' + (c.subId || c.internalId) + ' [AI]: no failure condition (total loss, partial loss or malfunction)' + EMPTY); };
                ((typeof acFcimData !== 'undefined' ? acFcimData : []) || []).forEach(c => chkFcim(c, 'Aircraft'));
                ((typeof acFunctionsData !== 'undefined' ? acFunctionsData : []) || []).forEach(f => {
                    if (!isAi(f)) return; checked++;
                    if (!_has(f.funcName) || !_has(f.subName)) fails.push('Aircraft function ' + (f.subId || f.funcId || f.internalId) + ' [AI]: no ' + (_has(f.funcName) ? 'sub-function' : 'function') + ' name' + EMPTY);
                });
                const chkFha = (f, scope) => {
                    if (!isAi(f)) return;
                    checked++;
                    if (!_has(f.fcDesc)) fails.push(scope + ' ' + (f.fcId || f.internalId) + ' [AI]: no failure condition' + EMPTY);"""),
("""                    (s.fha || []).forEach(f => chkFha(f, 'SFHA ' + (s.name || s.id)));
                    (s.fcim || []).forEach(c => {
                        if (!isAi(c)) return;
                        checked++;""",
"""                    (s.fha || []).forEach(f => chkFha(f, 'SFHA ' + (s.name || s.id)));
                    (s.functions || []).forEach(f => { if (!isAi(f)) return; checked++; if (!_has(f.funcName)) fails.push((s.name || s.id) + ' function ' + (f.funcId || f.internalId) + ' [AI]: no function name' + EMPTY); });
                    (s.fcim || []).forEach(c => {
                        if (!isAi(c)) return;
                        checked++;
                        if (fcimEmpty(c)) fails.push((s.name || s.id) + ' FCIM ' + (c.subId || c.internalId) + ' [AI]: no failure condition (total loss, partial loss or malfunction)' + EMPTY);"""),
]
for a, b in R:
    assert s.count(a) == 1, a[:110]
    s = s.replace(a, b)
s = "// 26 Oct 2026: INV-31 also names an AI row with nothing in it (an FHA or FCIM row with no failure condition, a function with no name), by the writers' own rule; see tests/regression_afha_drafting_fixes_20261026.test.js\n" + s
open(p, 'w').write(s); print('ok')
