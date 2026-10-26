#!/usr/bin/env python3
# 26 Oct 2026: four older tests follow the row rule (ai_assistant.js _ROW_RULES) and the panel-note markup. Two run real
# writers cut out of the source and now hand them the real rule beside them; two read the notes' words, now written
# with **bold** instead of tags. Applied once; kept for the record.
def patch(p, R):
    s = open(p).read()
    for a, b in R:
        assert s.count(a) == 1, p + ': ' + a[:90]
        s = s.replace(a, b)
    open(p, 'w').write(s)

RULE_CUT = "aiSrc.slice(aiSrc.indexOf('    const _has = function (v) {'), aiSrc.indexOf('\\n    // F1c batch (30 Aug 2026)'))"
patch('tests/regression_f1c_decomp_coverage.test.js', [
("    vm.runInContext(preamble + provVar + provFn + addFn + runFn +",
 "    const ruleSrc = " + RULE_CUT + ";   // 26 Oct 2026: the executor and the writer ask the one row rule\n    vm.runInContext(preamble + ruleSrc + provVar + provFn + addFn + runFn +"),
])
patch('tests/regression_fcim_multiplicity.test.js', [
("  vm.runInContext(push + '\\n' + fcid + '\\n' + apply + '\\n; globalThis._a = _applyFcimSuggestion;', sb);",
 "  const ruleSrc = ai.slice(ai.indexOf('    const _has = function (v) {'), ai.indexOf('\\n    // F1c batch (30 Aug 2026)'));   // 26 Oct 2026: the writer asks the one row rule first\n  vm.runInContext(ruleSrc + '\\n' + push + '\\n' + fcid + '\\n' + apply + '\\n; globalThis._a = _applyFcimSuggestion;', sb);"),
])
patch('tests/regression_hf_ai_assist.test.js', [
("  /deliberately <b>left empty<\\/b>/.test(run));", "  /deliberately \\*\\*left empty\\*\\*/.test(run));   // 26 Oct 2026: notes take **bold**, never tags"),
])
patch('tests/regression_hf_improve.test.js', [
("  /not<\\/b> compliance findings, requirements, or design decisions/.test(ai));", "  /\\*\\*not\\*\\* compliance findings, requirements, or design decisions/.test(ai));   // 26 Oct 2026: notes take **bold**, never tags"),
])
patch('tests/regression_f1c_decomp_coverage.test.js', [
("__run([{ op: 'add_function', subName: 'Lock nose door', subDef: 'Per \u00a75.7.' }], 'test-model', undefined, 'arch.decompose')", "__run([{ op: 'add_function', funcName: 'Secure the doors', subName: 'Lock nose door', subDef: 'Per \u00a75.7.' }], 'test-model', undefined, 'arch.decompose')"),
("__run([{ op: 'add_function', subName: 'Plain chat add' }], 'test-model')", "__run([{ op: 'add_function', funcName: 'Chat function', subName: 'Plain chat add' }], 'test-model')"),
])   # 26 Oct 2026: an aircraft function row carries its function and its sub-function (the op contract names both)
patch('tests/regression_req_advisory.test.js', [
("  vm.runInContext(apply + '\\n; globalThis._fn = _applyReqSuggestion;', sandbox);", "  vm.runInContext(ai.slice(ai.indexOf('    const _has = function (v) {'), ai.indexOf('\\n    // F1c batch (30 Aug 2026)')) + '\\n' + apply + '\\n; globalThis._fn = _applyReqSuggestion;', sandbox);   // 26 Oct 2026: the writer asks the one row rule first"),
])
print('ok')
