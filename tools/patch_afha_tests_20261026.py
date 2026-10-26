#!/usr/bin/env python3
# 26 Oct 2026: the two tests that run the real _runSlice get the real _emptyTurn beside it (cut out of the source),
# and their fake model returns a row, as a working turn does.
def patch(p, R):
    s = open(p).read()
    for a, b in R:
        assert s.count(a) == 1, p + ': ' + a[:90]
        s = s.replace(a, b)
    open(p, 'w').write(s)

patch('tests/regression_batch_turn_retry.test.js', [
("  check('the attempt loop wraps the model call', /for \\(let _try = 1; _try <= _TURN_TRIES; _try\\+\\+\\)/.test(ai) && /_results\\[_ci\\] = \\{ ok: true, a: await _anemRun\\(/.test(ai));",
 "  check('the attempt loop wraps the model call', /for \\(let _try = 1; _try <= _TURN_TRIES; _try\\+\\+\\)/.test(ai) && /const _a = await _anemRun\\(/.test(ai) && /_results\\[_ci\\] = \\{ ok: true, a: _a, tries: _try \\}/.test(ai));   // 26 Oct 2026: the reply is looked at before it counts"),
("  const body = ai.slice(at, end + '\\n        };'.length);\n",
 "  const body = ai.slice(at, end + '\\n        };'.length);\n  const emptyFn = (ai.match(/const _emptyTurn = function \\(a\\) \\{[^\\n]*\\};/) || [''])[0];   // 26 Oct 2026: the real rule, beside the real runner\n  check('extracted the real empty-turn rule', !!emptyFn);\n"),
("      if (globalThis.__mode === 'billing') throw new Error('Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.');\n      return { parsed: { actions: [{ op: 'add_fha' }] } };\n    };\n    ${body}",
 "      if (globalThis.__mode === 'billing') throw new Error('Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.');\n      if (globalThis.__mode === 'empty') return { parsed: { reply: 'Here you go.', actions: [] } };   // 26 Oct 2026: readable, and nothing in it\n      if (globalThis.__mode === 'unreadable') return { parsed: null, rr: { text: 'Sorry, I cannot' } };\n      if (globalThis.__mode === 'emptyOnce' && n < 2) return { parsed: { actions: [] } };\n      return { parsed: { actions: [{ op: 'add_fha' }] } };\n    };\n    ${emptyFn}\n    ${body}"),
("    // c. a genuinely dead provider gives up after the budget, keeping the last error",
 """    // 26 Oct 2026 (live Aeolus AFHA run): an empty turn used to count as returned and was never asked again
    ctx.__reset(); ctx.__mode = 'empty';
    await ctx.__run(0);
    check('a turn that comes back with no rows is asked again, then reported as not completed', ctx.__calls.length === 3 && ctx.__results[0].ok === false && ctx.__results[0].e && ctx.__results[0].e.emptyTurn === true, JSON.stringify({ calls: ctx.__calls.length, r: ctx.__results[0] && ctx.__results[0].ok }));
    check('the empty reply rides along, for the notes', ctx.__results[0].e.a && ctx.__results[0].e.a.parsed && ctx.__results[0].e.a.parsed.reply === 'Here you go.');
    ctx.__reset(); ctx.__mode = 'unreadable';
    await ctx.__run(0);
    check('a reply that is not the JSON asked for is asked again too, then not completed', ctx.__calls.length === 3 && ctx.__results[0].ok === false && ctx.__results[0].e.emptyTurn === true);
    ctx.__reset(); ctx.__mode = 'emptyOnce';
    await ctx.__run(0);
    check('empty once, then rows: it completes on the retry and the retry is counted', ctx.__calls.length === 2 && ctx.__results[0].ok === true && ctx.__stats().retried === 1);
    check('an empty turn is not counted as returned in the batch line, and the line says how many came back empty', /if \\(e && e\\.emptyTurn\\) \\{/.test(ai) && /_emptyTurns\\+\\+/.test(ai) && /came back empty after ' \\+ _TURN_TRIES \\+ ' tries/.test(ai));
    check('every turn empty: the no-actions panel names it', /Nothing drafted: ' \\+ _emptyTurns \\+ ' of ' \\+ _slices\\.length \\+ ' turn\\(s\\) came back with no rows after/.test(ai));

    // c. a genuinely dead provider gives up after the budget, keeping the last error"""),
])

patch('tests/regression_ai_permanent_stop_20261024.test.js', [
("  const wl = (ai.match(/const _worker = async function \\(\\) \\{[^\\n]*\\};/) || [])[0];",
 "  const wl = (ai.match(/const _worker = async function \\(\\) \\{[^\\n]*\\};/) || [])[0];\n  const emptyFn = (ai.match(/const _emptyTurn = function \\(a\\) \\{[^\\n]*\\};/) || [''])[0];   // 26 Oct 2026: the turn runner reads it"),
("if (e) throw e; return { ok: 1 }; };\n      ${ai.slice(at, end + '\\n        };'.length)}",
 "if (e) throw e; return { parsed: { actions: [{ op: 'add_fha' }] } }; };\n      ${emptyFn}\n      ${ai.slice(at, end + '\\n        };'.length)}"),
])
print('ok')
