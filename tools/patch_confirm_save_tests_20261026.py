#!/usr/bin/env python3
# 26 Oct 2026: the older save tests pinned the behavior that lost Radia's confirmed changes (a refused save counted as
# saved with the live sync on; the confirm push always silent). They now hold the new rule: a confirmed save with the
# live sync on goes 'merged' (written over a moved copy), a refusal is never "Saved", and it is tried again.
import os, sys
root = sys.argv[1] if len(sys.argv) > 1 else '.'
def sub(f, a, b, n=1):
    P = os.path.join(root, f); s = open(P, encoding='utf-8').read()
    if s.count(a) != n: raise SystemExit(f'{f}: expected {n} of {a[:80]!r}, found {s.count(a)}')
    open(P, 'w', encoding='utf-8').write(s.replace(a, b))
T = 'tests/regression_cloud_sync.test.js'
sub(T, """check('a refused silent write is SKIPPED, never retried into an overwrite (one attempt in silent mode)',
  /var attempts = \\(mode === 'manual'\\) \\? 2 : 1;/.test(w));""",
"""check('a refused silent write is SKIPPED, never retried into an overwrite (one attempt in silent mode; merged and manual try twice)',
  /var attempts = \\(mode === 'silent'\\) \\? 1 : 2;/.test(w));""")
sub(T, """  /W\\.write\\(\\{ mode: 'silent', prepare: prepare \\}\\)/.test(c) && /__slabCloudSaveQ/.test(w));""",
"""  /W\\.write\\(\\{ mode: \\(opts\\.mode === 'merged' \\|\\| opts\\.mode === 'manual'\\) \\? opts\\.mode : 'silent', prepare: prepare \\}\\)/.test(c) && /__slabCloudSaveQ/.test(w));""")
sub('tests/regression_cloud_writer.test.js', """  check('cloud_sync is a thin caller (silent mode)', /W\\.write\\(\\{ mode: 'silent', prepare: prepare \\}\\)/.test(S('cloud_sync.js')));""",
"""  check('cloud_sync is a thin caller (silent unless the caller says merged or manual)', /W\\.write\\(\\{ mode: \\(opts\\.mode === 'merged' \\|\\| opts\\.mode === 'manual'\\) \\? opts\\.mode : 'silent', prepare: prepare \\}\\)/.test(S('cloud_sync.js')));""")
# pins as floors (rule 12), not literals
sub('tests/regression_erasure_selfserve_20261018.test.js', """/cloud_sync\\.js\\?v=2\\.8"/.test(H) && /cloud_writer\\.js\\?v=1\\.2"/.test(H)""",
"""/cloud_sync\\.js\\?v=(2\\.([89]|\\d\\d)|[3-9]\\.\\d+)"/.test(H) && /cloud_writer\\.js\\?v=(1\\.([2-9]|\\d\\d)|[2-9]\\.\\d+)"/.test(H)""")
sub('tests/regression_save_state_20261013b.test.js', """  check('the cloud copy refused while the live sync carries it: saved (shared with the team)', A.save.status().state === 'saved' && A.save.status().where === 'team', JSON.stringify(A.save.status()));
  A.cloud.mode = 'ok';""",
"""  // 26 Oct 2026 (Radia): a refusal is never "Saved". With the live sync on the confirm save is 'merged' (it writes over
  // a moved copy); one still refused is said and tried again
  check('the confirm push with the live sync on is a merged save', A.cloud.modes[A.cloud.modes.length - 1] === 'merged', JSON.stringify(A.cloud.modes.slice(-3)));
  check('the cloud copy refused while the live sync carries it: NOT saved, said, and tried again', A.save.status().state !== 'saved' && A.save.status().reasonCode === 'refused' && A.longTimers().length > 0, JSON.stringify(A.save.status()));
  A.cloud.mode = 'ok';
  await idle(A, true); await idle(A, true);
  check('the retry landed: Saved to the cloud', A.save.status().state === 'saved' && A.save.status().where === 'cloud' && !A.save.status().cloudPending, JSON.stringify(A.save.status()));""")
sub('tests/regression_save_state_20261013b.test.js', """    env.cloud.calls.push(o && o.snapshot ? JSON.parse(o.snapshot) : J(env.model));""",
"""    env.cloud.calls.push(o && o.snapshot ? JSON.parse(o.snapshot) : J(env.model)); (env.cloud.modes = env.cloud.modes || []).push(o && o.mode || 'silent');""")
sub('tests/regression_tab_project_account_20261015.test.js', """/code !== 'shrink' && code !== 'refused' && code !== 'not-yours'\\) _scheduleRetry\\(\\)/.test(ss)""",
"""/code !== 'shrink' && \\(code !== 'refused' \\|\\| team\\) && code !== 'not-yours'\\) _scheduleRetry\\(\\)/.test(ss)""")
print('confirm save tests updated')
