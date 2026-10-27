#!/usr/bin/env python3
# 27 Oct 2026: the MF&MS seed sweep deleted its own seeds. Every seeded tree gets a verification copy
# (verify_sync.js: id "ver-idp-pg-<n>-<stamp>", name "... (Verification)", verifies = the seed's id). Its name has
# "MF&MS" in it and it links the same failure condition, so the sweep took it for a REAL MF&MS page covering the
# condition and removed every untouched seed ("removed 11"); the verification copies were left behind. The ASA triage
# counted the same copies as MF&MS coverage. A verification tree is never an MF&MS page of its own.
import os, sys
root = sys.argv[1] if len(sys.argv) > 1 else '.'
def sub(f, a, b, n=1):
    P = os.path.join(root, f); s = open(P, encoding='utf-8').read()
    if s.count(a) != n: raise SystemExit(f'{f}: expected {n} of {a[:80]!r}, found {s.count(a)}')
    open(P, 'w', encoding='utf-8').write(s.replace(a, b))
I = 'site/idp_seed_trees.js'
sub(I, """    function _beginSweep() {""", """    // 27 Oct 2026: a verification tree (verify_sync.js: verifies = the tree it checks, id "ver-...") is never an
    // MF&MS page of its own. Its name carries "MF&MS" and it links the same condition, so it was taken for a real
    // MF&MS page covering the condition, and every untouched seed was removed once its own verification copy existed.
    function _isVerification(p) { return !!p && (p.verifies != null || String(p.id).indexOf('ver-') === 0); }
    function _beginSweep() {""")
sub(I, """            if (!p || !p.root || String(p.id).indexOf('idp-pg-') === 0) return;
            if (!(String(p.id).indexOf('mac-pg-') === 0 || /MF&MS/.test(p.name || ''))) return;""",
"""            if (!p || !p.root || String(p.id).indexOf('idp-pg-') === 0 || _isVerification(p)) return;
            if (!(String(p.id).indexOf('mac-pg-') === 0 || /MF&MS/.test(p.name || ''))) return;""")
sub(I, """            if (!p || !p.root) return false;
            if (String(p.id).indexOf('idp-pg-') === 0) return false;""",
"""            if (!p || !p.root) return false;
            if (String(p.id).indexOf('idp-pg-') === 0 || _isVerification(p)) return false;""")
A = 'site/asa_triage.js'
sub(A, """        return _pages().filter(p => p && p.root && (String(p.linkedFhaId)""",
"""        // 27 Oct 2026: a verification copy of an MF&MS tree is not a second MF&MS page for the condition
        return _pages().filter(p => p && p.root && p.verifies == null && String(p.id).indexOf('ver-') !== 0 && (String(p.linkedFhaId)""")
# the browser test raced the sweep's own timer: the seed it took away could be put back by the 8 s sweep before
# run() looked. Take it away and sweep in ONE step (synchronous: no timer can run in between).
B = 'tests/regression_bookkeeping_writes_20261018.test.js'
sub(B, """    await pg.evaluate(() => {
      const i = ftaPages.findIndex(p => p && String(p.id).indexOf('idp-pg-') === 0);
      if (i >= 0) SLChangeAck.system(() => { ftaPages.splice(i, 1); scheduleAutosave(); });
    });
    for (let i = 0; i < 40 && !(await quiet()); i++) await sleep(100);
    const r = await pg.evaluate(() => {
      const sys0 = SLChangeAck.status().stats.system;""",
"""    // 27 Oct 2026: taken away and swept in ONE step (synchronous): the sweep's own 8 s timer used to put the seed back
    // in between ("kept 12, seeded 0"). Nothing else changes, so the wait for quiet that came between is not needed.
    for (let i = 0; i < 40 && !(await quiet()); i++) await sleep(100);
    const r = await pg.evaluate(() => {
      const i0 = ftaPages.findIndex(p => p && String(p.id).indexOf('idp-pg-') === 0);
      if (i0 >= 0) SLChangeAck.system(() => { ftaPages.splice(i0, 1); scheduleAutosave(); });
      const sys0 = SLChangeAck.status().stats.system;""")
# ...and the case that was hiding in it: the seeds' verification copies exist by then (the sweep removed all 11)
sub(B, """    check('the sweep right after a click seeds the multi-system trees', r.res && r.res.seeded >= 1, JSON.stringify(r));""",
"""    check('the sweep right after a click seeds the multi-system trees', r.res && r.res.seeded >= 1, JSON.stringify(r));
    check('...and removes none of its own seeds (their verification copies are not MF&MS pages)', r.res && r.res.removed === 0, JSON.stringify(r));""")
IX = 'site/index.html'
import re
s = open(os.path.join(root, IX)).read()
for n in ['idp_seed_trees', 'asa_triage']:
    m = re.search(n + r'\.js\?v=([0-9.]+)"', s); v = m.group(1); p = v.split('.'); p[-1] = str(int(p[-1]) + 1)
    s = s.replace(n + '.js?v=' + v + '"', n + '.js?v=' + '.'.join(p) + '"'); print(n, v, '->', '.'.join(p))
open(os.path.join(root, IX), 'w').write(s)
print('idp mirror fix applied')
