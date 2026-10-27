#!/usr/bin/env python3
"""27 Oct 2026: the person's first change no longer lists a dozen changes they did not make.

Found chasing a test that failed now and then (regression_change_ack_ui_20261013b B2: "Review your 23
changes" after typing one node name): the trees the app makes for itself (fc_auto_trees.js, fc_tree_flow.js)
gave their starter leaves a failure rate of 0. Allocation trees are probability only (Phase 61), so the next
recompute deletes that field on every one of them. When that first recompute is the one the person's own
change triggers, every deletion lands inside the person's change and is listed for them to confirm
("Decompose: causes of ...: failure rate 0 -> empty", one per tree). A customer opening their file and
typing one name would see the same list.
Fix: the app's own allocation leaves are made without a failure rate, and a project being loaded drops a
zero failure rate from the leaves of its top-down trees (nothing is lost: zero is no information), so no
recompute has anything left to delete.

Run from the repo root: python3 tools/patch_bg_lambda_20261027.py   (refuses on any missing anchor)
"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda p: os.path.join(ROOT, 'site', p)
def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()
def wr(p, s):
    with open(p, 'w', encoding='utf-8') as f: f.write(s)
def sub1(s, old, new, name):
    n = s.count(old)
    if n != 1: sys.exit('anchor %s found %d times' % (name, n))
    return s.replace(old, new)

f = rd(S('fc_auto_trees.js'))
f = sub1(f, "        if (type === 'gate') { n.gateType = 'OR'; n.displayId = 'G-' + id; } else { n.lambda = 0; n.inputMode = 'probability';",
         "        // 27 Oct 2026: no failure rate on an allocation leaf (probability only, Phase 61). A lambda of 0 here was deleted by\n"
         "        // the next recompute, and when that was the person's change it listed every auto tree for them to confirm.\n"
         "        if (type === 'gate') { n.gateType = 'OR'; n.displayId = 'G-' + id; } else { n.inputMode = 'probability';", 'auto node')
f = sub1(f, "    function sweep(opts) {\n        opts = opts || {};\n        if (root.SL_FC_TREES_OFF) return { off: true };\n",
         "    // 27 Oct 2026: one sweep leaves everything settled. A tree made in a pass gets its system events, and a system tree\n"
         "    // its aircraft-based target, only in the NEXT pass, so the old single pass left work for later ticks; repeat\n"
         "    // (quietly, at most 4 passes) until a pass changes nothing.\n"
         "    function sweep(opts) {\n"
         "        opts = opts || {};\n"
         "        if (root.SL_FC_TREES_OFF) return { off: true };\n"
         "        var acc = null;\n"
         "        for (var pass = 0; pass < 4; pass++) {\n"
         "            var r = _sweepOnce(pass === 0 ? opts : { quiet: true, noAsk: true });\n"
         "            if (!acc) acc = r; else { acc.made = acc.made.concat(r.made); acc.added += r.added; acc.gone = acc.gone.concat(r.gone); acc.targets += r.targets; }\n"
         "            if (!(r.made.length || r.added || r.gone.length || r.targets)) break;\n"
         "            try { _allocMemo.gen = -1; _allocMemo.map = {}; } catch (_) {}\n"
         "        }\n"
         "        return acc;\n"
         "    }\n"
         "    function _sweepOnce(opts) {\n"
         "        opts = opts || {};\n", 'sweep converge')
wr(S('fc_auto_trees.js'), f)

t = rd(S('fc_tree_flow.js'))
t = sub1(t, "            type: 'undeveloped', lambda: 0, probability: 0, inputMode: 'probability', children: []",
         "            type: 'undeveloped', probability: 0, inputMode: 'probability', children: []   // 27 Oct 2026: no failure rate on an allocation leaf", 'flow starter')
wr(S('fc_tree_flow.js'), t)

d = rd(S('data_ops_modules.js'))
d = sub1(d, "function migrateFHAAssumptions(fhaArr) {\n",
'''// 27 Oct 2026: a top-down (allocation) tree is probability only (Phase 61). Leaves the app made for itself used to
// carry a failure rate of 0, which the next recompute deletes; when that recompute was the person's change, every one
// of those deletions was listed for the person to confirm. On load, drop a ZERO (or empty) failure rate from the
// leaves of top-down trees: zero carries no information, so nothing is lost, and nothing is left for a recompute to
// change. A real rate is never touched, and verification (bottom-up) trees are not walked.
function migrateAllocationLeavesProbabilityOnly() {
    let n = 0;
    try {
        (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages) ? ftaPages : []).forEach(p => {
            if (!p || !p.root || p.verifies != null || String(p.id || '').indexOf('ver-') === 0) return;
            if ((p.mode || 'top-down') !== 'top-down') return;
            (function walk(x) {
                if (!x) return;
                if (x.type !== 'gate' && Object.prototype.hasOwnProperty.call(x, 'lambda') && (x.lambda === 0 || x.lambda === '' || x.lambda == null)) { delete x.lambda; n++; }
                (x.children || x._children || []).forEach(walk);
            })(p.root);
        });
    } catch (_) {}
    return n;
}
function migrateFHAAssumptions(fhaArr) {
''', 'migration fn')
d = sub1(d, "        migrateLegacyMultiTraces();\n        // 19 Oct 2026: one zone identity",
         "        migrateLegacyMultiTraces();\n        migrateAllocationLeavesProbabilityOnly();   // 27 Oct 2026\n        // 19 Oct 2026: one zone identity", 'call data_ops')
wr(S('data_ops_modules.js'), d)

h = rd(S('helpers_modules.js'))
h = sub1(h, "            migrateLegacyMultiTraces();\n            // 19 Oct 2026: one zone identity",
         "            migrateLegacyMultiTraces();\n            if (typeof migrateAllocationLeavesProbabilityOnly === 'function') migrateAllocationLeavesProbabilityOnly();   // 27 Oct 2026\n            // 19 Oct 2026: one zone identity", 'call helpers')
wr(S('helpers_modules.js'), h)

x = rd(S('index.html'))
for nm in ('fc_auto_trees.js', 'fc_tree_flow.js', 'data_ops_modules.js', 'helpers_modules.js'):
    m = re.search(re.escape(nm) + r'\?v=(\d+)\.(\d+)', x)
    if not m: sys.exit('no version for ' + nm)
    minor = m.group(2)
    new = str(int(minor) + 1).zfill(len(minor))
    x = x.replace(m.group(0), '%s?v=%s.%s' % (nm, m.group(1), new), 1)
wr(S('index.html'), x)
print('patched: fc_auto_trees.js, fc_tree_flow.js, data_ops_modules.js, helpers_modules.js, index.html')

# ---- change_ack.js: background work is measured from where the project really is
c = rd(S('change_ack.js'))
c = sub1(c, "    function system(fn) { _sysDepth++; try { return fn(); } finally { _sysDepth--; } }\n",
'''    // 27 Oct 2026: the second cause of regression_change_ack_ui's "Discard all" failing now and then. A Redo (or any
    // change) writes its autosave a moment later; a background sweep that ran in that moment was measured from the
    // state BEFORE the Redo, so the Redo was counted as the sweep's (background, "counts as confirmed") and Discard all,
    // which re-applies background work, put the Redo straight back. Before system or background work starts, bring
    // the "before" up to date if the last change's write is still queued (_freshStash). Outermost call only, and never
    // while a change is being measured.
    function _freshBeforeSystem() { try { if (_sysDepth === 0 && !_win && _restoreDepth === 0) _freshStash(); } catch (_) {} }
    function system(fn) { _freshBeforeSystem(); _sysDepth++; try { return fn(); } finally { _sysDepth--; } }
''', 'system fresh')
c = sub1(c, "    function background(fn) {\n        var r = system(fn);\n",
         "    function background(fn) {\n        var r = system(fn);   // 27 Oct 2026: system() brings the \"before\" up to date first\n", 'background note')
c = sub1(c, "    function systemAsync(fn) {\n        _sysDepth++;\n",
         "    function systemAsync(fn) {\n        _freshBeforeSystem();   // 27 Oct 2026\n        _sysDepth++;\n", 'systemAsync fresh')
c = '// change_ack.js - v3.4 - 27 Oct 2026 - system and background work are measured from where the project really is: a change whose\n//   autosave write is still queued is taken into the "before" first (_freshBeforeSystem), so a sweep in that moment is never handed the\n//   person\'s change (Discard all re-applied it). See tests/regression_bg_changes_20261027.test.js\n' + c
wr(S('change_ack.js'), c)
x = rd(S('index.html'))
x = sub1(x, 'change_ack.js?v=3.3', 'change_ack.js?v=3.4', 'change_ack pin')
wr(S('index.html'), x)
print('patched: change_ack.js v3.4')

# ---- change_ack.js: a tree's target and its auto-tree record are the app's to compute, never listed as the person's
c = rd(S('change_ack.js'))
c = sub1(c, "                if (e.op === 'changed') { var fs = _fields(a, b); fs.fields = fs.fields.filter(function (x) { return x.field !== '__hasTree'; }); it.fields = fs.fields; it.derived = !fs.fields.length; }\n                if (_autoPage(pg.id)) it.derived = true;",
'''                // 27 Oct 2026: the third cause of the change test failing now and then ("Review your 113 changes" after a Redo).
                // A tree's target (targetP, targetBasis) and its auto-tree record are computed by the app (fc_auto_trees.js
                // from the FHA and the aircraft tree; verify_sync.js copies a target to the verification twin). A Redo or Undo
                // restores a whole snapshot, taken before or after the app last settled them, so they moved with it and were
                // listed as the person's. Computed, unless the person set the target by hand (targetManual).
                var shellComputed = { targetBasis: 1, autoFcTree: 1 };
                if (!pg.targetManual || pg.verifies != null) shellComputed.targetP = 1;
                if (e.op === 'changed') { var fs = _fields(a, b, shellComputed); fs.fields = fs.fields.filter(function (x) { return x.field !== '__hasTree'; }); it.fields = fs.fields; it.derived = !fs.fields.length; }
                if (_autoPage(pg.id)) it.derived = true;''', 'shell computed')
wr(S('change_ack.js'), c)
print('patched: change_ack.js (computed tree targets)')

# ---- change_ack.js: after a step joins the collection, the "before" is the state right after it
c = rd(S('change_ack.js'))
c = sub1(c, "        _deferDepth++; var prev = _deferInfo; _deferInfo = info || {}; try { return fn(); } finally { _deferDepth--; _deferInfo = prev; } }\n",
'''        _deferDepth++; var prev = _deferInfo; _deferInfo = info || {};
        try { return fn(); }
        finally {
            _deferDepth--; _deferInfo = prev;
            // 27 Oct 2026: the last cause of "Discard all" failing now and then. A Redo (or a move) is a step whose autosave
            // write lands a moment later; any change in that moment that was not the person's (a view's own bookkeeping
            // as it drew) was measured from BEFORE the Redo, took the Redo with it as "background" and Discard all, which
            // keeps background work, put the Redo back. The step is in the collection now: take the state right after it
            // as the "before" of whatever comes next.
            try { if (_deferDepth === 0 && !_win && _restoreDepth === 0) { var sNow = _snapNow(); if (sNow) { _stash = sNow; _stashSeq = _noteSeq; } } } catch (_) {}
        }
    }
''', 'deferred fresh')
wr(S('change_ack.js'), c)
print('patched: change_ack.js (fresh before after a step)')
