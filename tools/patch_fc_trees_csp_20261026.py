#!/usr/bin/env python3
# 26 Oct 2026 (Radia: "select trees shows no trees because no tree top gates have been pre-populated").
# Root cause: fc_auto_trees.js read the project stores with (0, eval)(...). The app's CSP forbids eval
# (no 'unsafe-eval', server and desktop), the read threw, the window[...] fallback finds nothing for a
# top-level `let`, so the sweep saw an empty project and made no trees. The same eval-first read sat in
# lane_trees.js nextId (internalIdCounter++), which fell back to a per-load counter that restarts at 1e9+1.
# Fix: read through SLEnv (rule 5), never eval first.
import os, sys
root = sys.argv[1] if len(sys.argv) > 1 else '.'
def sub(f, a, b, n=1):
    P = os.path.join(root, f); s = open(P, encoding='utf-8').read()
    if s.count(a) != n: raise SystemExit(f'{f}: expected {n} of {a[:80]!r}, found {s.count(a)}')
    open(P, 'w', encoding='utf-8').write(s.replace(a, b))

F = 'site/fc_auto_trees.js'
sub(F, "    var VERSION = '1.2';", "    var VERSION = '1.3';")
sub(F, """    function _g(n) { try { return (0, eval)(n); } catch (_) { return root[n]; } }
    function _pages() { var p = _g('typeof ftaPages !== "undefined" ? ftaPages : null'); return Array.isArray(p) ? p : (root.ftaPages || []); }
    function _ac() { var a = _g('typeof acFhaData !== "undefined" ? acFhaData : null'); return Array.isArray(a) ? a : []; }
    function _systems() { var s = _g('typeof systemsData !== "undefined" ? systemsData : null'); return Array.isArray(s) ? s : []; }
    function _rank(sev) { var R = _g('typeof SEVERITY_RANK !== "undefined" ? SEVERITY_RANK : null') || { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1 }; return R[sev] || 0; }
    function _call(name) { var f = root[name]; if (typeof f !== 'function') { try { f = (0, eval)(name); } catch (_) { f = null; } } if (typeof f !== 'function') return;""",
"""    // 26 Oct 2026 (v1.3): the project stores are top-level `let`s, not window properties, and the app's CSP forbids
    // eval, so v1.2's eval read threw on every install and the sweep saw an empty project (Radia: no trees made, the
    // tree selector empty). Read through SLEnv (sl_env.js, rule 5); window only for what really is on it.
    function _g(n) {
        try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(n); if (v !== undefined) return v; } } catch (_) {}
        try { return root[n]; } catch (_) { return undefined; }
    }
    function _pages() { var p = _g('ftaPages'); return Array.isArray(p) ? p : (root.ftaPages || []); }
    function _ac() { var a = _g('acFhaData'); return Array.isArray(a) ? a : []; }
    function _systems() { var s = _g('systemsData'); return Array.isArray(s) ? s : []; }
    function _rank(sev) { var R = _g('SEVERITY_RANK') || { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1 }; return R[sev] || 0; }
    function _call(name) { var f = root[name]; if (typeof f !== 'function') f = _g(name); if (typeof f !== 'function') return;""")
sub(F, """try { var AR = _g('typeof AutoReq !== "undefined" ? AutoReq : null'); if (AR && AR.decideAnalysisDepth)""",
       """try { var AR = _g('AutoReq'); if (AR && AR.decideAnalysisDepth)""")
sub(F, """var id = _g('typeof activeSystemId !== "undefined" ? activeSystemId : null');""", """var id = _g('activeSystemId');""")
sub(F, """var mk = p.id + '|' + p.targetP + '|' + (function () { try { return ftaConfig.apportion; } catch (_) { return ''; } })()""",
       """var mk = p.id + '|' + p.targetP + '|' + (function () { var c = _g('ftaConfig'); return (c && c.apportion) || ''; })()""")
sub(F, """var ap = (function () { try { return ftaConfig.apportion; } catch (_) { return 'equal'; } })();""",
       """var ap = (function () { var c = _g('ftaConfig'); return (c && c.apportion) || 'equal'; })();""")
sub(F, """    function _nid() { try { return internalIdCounter++; } catch (_) { return Date.now() + Math.floor(Math.random() * 1000); } }""",
       """    // the app's one id counter: a top-level `let` every classic script shares by name (no eval needed to write it)
    function _nid() { try { return internalIdCounter++; } catch (_) { return Date.now() + Math.floor(Math.random() * 1000); } }""")
sub('site/index.html', 'fc_auto_trees.js?v=1.2', 'fc_auto_trees.js?v=1.3')

# SLEnv: the three names the auto trees read that it did not cover
sub('site/sl_env.js', """    esc:               function () { return esc; }
  };""", """    esc:               function () { return esc; },
    // 26 Oct 2026: read by fc_auto_trees.js (const/let at top level: not on window)
    SEVERITY_RANK:     function () { return SEVERITY_RANK; },
    AutoReq:           function () { return AutoReq; },
    activeSystemId:    function () { return activeSystemId; }
  };""")
sub('site/index.html', 'sl_env.js?v=1.1', 'sl_env.js?v=1.2')

# lane_trees.js: the shared id counter, written by name (it is a shared top-level binding), not through eval
sub('site/lane_trees.js', """        try { return (0, eval)('internalIdCounter++'); } catch (_) { return Math.floor(1e9 + (Date.now ? 0 : 0)) + (nextId._f = (nextId._f || 0) + 1); }""",
    """        // 26 Oct 2026: written by name. The (0, eval) form threw under the app's CSP and every id fell back to a
        // per-load counter from 1e9+1, so two sessions could mint the same node id.
        try { return internalIdCounter++; } catch (_) { return Math.floor(1e9 + (Date.now ? 0 : 0)) + (nextId._f = (nextId._f || 0) + 1); }""")
sub('site/index.html', 'lane_trees.js?v=1.4', 'lane_trees.js?v=1.5')
print('fc trees CSP fix applied')
