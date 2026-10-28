#!/usr/bin/env python3
"""28 Oct 2026: three older suites pinned what tools/patch_anem_writes_20261028.py deliberately changed.
  regression_ai_prompt_cache   the chat's state note now says nothing is left out and explains comments[]
  regression_spec_reachability the review-comment engine (analysis 'review.comments') has no single spec: it answers
                               whatever a comment raises, and every edit it proposes follows that row type's op
                               contract, like the generic chat.edit batch; it is exempted the same way, by name
  regression_thread_mac        the MAC rules in the project state are no longer cut at 60 (Waqas: no cutoff at all)
Run from the repo root: python3 tools/patch_anem_tests_20261028.py
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = lambda p: os.path.join(ROOT, 'tests', p)
def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()
def wr(p, s):
    with open(p, 'w', encoding='utf-8') as f: f.write(s)
def sub1(s, old, new, name):
    n = s.count(old)
    if n != 1: sys.exit('anchor %s found %d times' % (name, n))
    return s.replace(old, new)
p = T('regression_ai_prompt_cache.test.js'); s = rd(p)
s = sub1(s, "and never break an existing CCF grouping or independence claim.', JSON.stringify({ a: 1 })].join('\\n');",
         "and never break an existing CCF grouping or independence claim. Nothing is left out: every row of every table is listed, in full. comments[] holds every review comment; \"on\" names the row it is on as \"<kind> <id>\" (acFha / sysFha = the FHA row with that fcId, acFcim / sysFcim = the FCIM row of that function, acFunc / sysFunc = that function, acReq / sysReq = that requirement, acAsm / sysAsm = that assumption, pra / zsa / cma / fmea = that row), replyTo = the comment it answers.', JSON.stringify({ a: 1 })].join('\\n');   // 28 Oct 2026: the note says nothing is left out and explains comments[]", 'cache')
wr(p, s)
p = T('regression_spec_reachability.test.js'); s = rd(p)
s = sub1(s, "    const misses = named.filter(a => a !== 'doc.import' && a !== 'chat.edit' && specs.indexOf(\"'\" + a + \"'\") === -1);",
         "    // 28 Oct 2026: review.comments (ANEM addressing review comments) is heterogeneous like chat.edit: each edit it\n"
         "    // proposes follows that row type's op contract; it is exempted by name, never by a pattern.\n"
         "    const misses = named.filter(a => a !== 'doc.import' && a !== 'chat.edit' && a !== 'review.comments' && specs.indexOf(\"'\" + a + \"'\") === -1);", 'spec')
wr(p, s)
p = T('regression_thread_mac.test.js'); s = rd(p)
s = sub1(s, "check('the project state given to the model lists existing MAC rules (update, do not repeat)', /mac:\\s+\\(\\(typeof projectConfig !== 'undefined' && projectConfig && projectConfig\\.macModels\\) \\|\\| \\[\\]\\)\\.slice\\(0, 60\\)/.test(ai));",
         "check('the project state given to the model lists every existing MAC rule (update, do not repeat; 28 Oct 2026: no cutoff)', /mac:\\s+\\(\\(typeof projectConfig !== 'undefined' && projectConfig && projectConfig\\.macModels\\) \\|\\| \\[\\]\\)\\.map\\(/.test(ai));", 'mac')
wr(p, s)
print('ok')
