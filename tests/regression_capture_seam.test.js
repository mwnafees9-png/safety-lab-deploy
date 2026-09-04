#!/usr/bin/env node
/**
 * Regression — THE CAPTURE SEAM (4 Sep 2026).
 *
 * On 3 Sep a consistency campaign was driven by operating the UI from a console:
 * hunting checkboxes by walking parent elements, clicking buttons by matching
 * their text. It failed three times — the best failure being an "Accept all"
 * that belonged to a review panel left mounted by a DIFFERENT project an hour
 * earlier. Zero draws completed, and nothing was measured.
 *
 * The fix hooks ONE function. Every lane ends at _makeReviewPanel(cfg), the last
 * point where a draft is DATA rather than markup. This suite pins the contract
 * that makes that safe to rely on, and — the load-bearing check — that the
 * programmatic entry point runs the SAME code as the human picker, so a harness
 * can never quietly measure a path the engineer does not run.
 * Run: node tests/regression_capture_seam.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

// ---- 1. the seam is at the right place, and is inert by default -------------
console.log('[1] the hook sits one line before the markup');
{
  check('the guard is the FIRST statement of _makeReviewPanel, before _ensurePanelStyles',
    /function _makeReviewPanel\(cfg\) \{\s*\n\s*if \(_capture\.armed\) \{ _captureFire\(cfg\); return null; \}[^\n]*\n\s*_ensurePanelStyles\(\);/.test(ai));
  check('an abstention resolves the capture too, flagged declined, rather than hanging it',
    /function _anemNoActionsPanel[\s\S]{0,400}?if \(_capture\.armed\) \{[\s\S]{0,300}?declined: true/.test(ai));
  check('capture is OFF unless armed (the flag initialises false)', /var _capture = \{ armed: false,/.test(ai));
  check('every lane is reachable — the seam has many call sites, not one',
    (ai.match(/_makeReviewPanel\(/g) || []).length >= 15, String((ai.match(/_makeReviewPanel\(/g) || []).length));
  check('the payload carries what scoring needs: items, assumptions, coverage, verifier, skill stamp',
    /items: _captureClone/.test(ai) && /assumptions: _captureClone/.test(ai) && /coverage: _captureClone/.test(ai) && /verifyReport: _captureClone/.test(ai) && /skill: \(function \(\)/.test(ai));
  check('the public API exposes arm / status / cancel and documents the usage',
    /captureNextDraft: _captureArm/.test(ai) && /captureStatus: function/.test(ai) && /captureCancel: function/.test(ai) && /condIds: \['SF-001-TL'/.test(ai));
}

// ---- 1d. the scope picker under capture -------------------------------------
// Five lanes ask which units to analyse before drafting. Under a capture there is
// nobody to click, and a picker is not a review panel — so without this the lane
// waits for a click that never comes and times out.
console.log('\n[1d] the scope picker is bypassed under capture, and only under capture');
{
  check('the bypass is the FIRST thing _openScopePicker does, before it builds any markup',
    /function _openScopePicker\(units, cfg, onPick\) \{\s*\n\s*cfg = cfg \|\| \{\};[\s\S]{0,1400}?if \(_capture\.armed\) \{[\s\S]{0,260}?return onPick\(\(units \|\| \[\]\)\.slice\(\)\);\s*\n\s*\}\s*\n\s*_ensurePanelStyles\(\);/.test(ai));
  check('it hands over EVERY unit — the same default the picker opens with for a human',
    /return onPick\(\(units \|\| \[\]\)\.slice\(\)\)/.test(ai) && /All are selected — leave it that/.test(ai));
  check('it passes a COPY, so a lane mutating its picked list cannot corrupt the source array',
    /\(units \|\| \[\]\)\.slice\(\)/.test(ai));
  check('it says so on the console rather than silently choosing scope', /scope picker auto-selected all/.test(ai));
  check('with no capture armed the picker still renders normally (the guard is the only gate)',
    /if \(_capture\.armed\) \{[\s\S]{0,300}?\}\s*\n\s*_ensurePanelStyles\(\);\s*\n\s*let p = document\.getElementById\('ai-scope-pick'\)/.test(ai));
  // every picker-driven lane is now reachable, through one of the three pickers
  [['populateFcim', /_openScopePicker\(|_openFhaScopePicker\(/], ['decompose', /_openDecompScopePicker\(/],
   ['draftPra', /_openScopePicker\(/], ['draftZsa', /_openScopePicker\(/], ['draftCma', /_openScopePicker\(/]].forEach(function (pair) {
    const src = extractFn(ai, pair[0]) || '';
    check(pair[0] + ' reaches the seam through a guarded picker (no bespoke bypass needed)', pair[1].test(src), pair[0]);
  });
  check('the SCOPE pickers default to Aircraft under capture, not to some arbitrary system',
    (ai.match(/if \(_capture\.armed\) \{[^\n]*return onPick\(\{ systemId: '', systemName: '' \}\);/g) || []).length === 2);
  check('all three pickers are guarded — units picker, decomposition scope, FHA scope',
    /scope picker auto-selected all/.test(ai) && /decomposition scope auto-selected: Aircraft/.test(ai) && /FHA scope auto-selected: Aircraft/.test(ai));
}

// ---- 2. EXECUTED: the real capture machinery --------------------------------
console.log('\n[2] EXECUTED — arm, fire, one-shot, clone, timeout');
{
  const src = ['_captureDisarm', '_captureArm', '_captureClone', '_captureFire', '_pickByIds'].map(n => extractFn(ai, n)).join('\n');
  check('extracted the capture machinery', /_captureArm/.test(src) && /_pickByIds/.test(src) && /_captureFire/.test(src));
  const ctx = { console, setTimeout, clearTimeout, Promise, JSON, Math, String, Array, Object, Error, Date,
                _skillStampFor: () => 'fha.draft@v5#d9c0a41a' };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext('var _capture = { armed:false, resolve:null, reject:null, timer:null, armedAt:0 };\n' + src +
    ';globalThis.__arm=_captureArm; globalThis.__fire=_captureFire; globalThis.__pick=_pickByIds; globalThis.__cap=()=>_capture;', ctx);

  return (async function () {
    // a. the happy path
    const p = ctx.__arm(60000);
    check('arming sets the flag', ctx.__cap().armed === true);
    const cfg = { id: 'ai-rev-anem-batch', analysis: 'fha', title: 'x',
                  items: [{ op: 'add_fha', fcDesc: 'Complete loss of thrust', effAcLevel: 'hull loss' }],
                  assumptions: [{ text: 'a1' }], coverage: { total: 3, covered: 3 }, verifyReport: { ran: true } };
    ctx.__fire(cfg);
    const got = await p;
    check('the draft comes back as data — items, assumptions, coverage, skill stamp',
      got.items.length === 1 && got.items[0].effAcLevel === 'hull loss' && got.assumptions[0].text === 'a1' &&
      got.coverage.total === 3 && got.skill === 'fha.draft@v5#d9c0a41a' && got.declined === false, JSON.stringify(got.skill));
    check('it DISARMS the instant it fires — a later unrelated panel is not swallowed', ctx.__cap().armed === false);
    check('the payload is a DEEP CLONE, immune to later app activity',
      (function () { cfg.items[0].effAcLevel = 'MUTATED'; return got.items[0].effAcLevel === 'hull loss'; })());

    // b. two captures at once is a programming error, not a silent overwrite
    const p2 = ctx.__arm(60000);
    let rejected = null; try { await ctx.__arm(60000); } catch (e) { rejected = e.message; }
    check('arming twice rejects rather than clobbering the first waiter', /already armed/.test(String(rejected)), String(rejected));
    ctx.__fire({ id: 'z', items: [] }); await p2;

    // c. a draft that dies without opening any panel must reject, not hang
    let timedOut = null;
    try { await ctx.__arm(1000); } catch (e) { timedOut = e.message; }
    check('a capture that never fires times out and says so', /timed out after 1000 ms/.test(String(timedOut)), String(timedOut));
    check('and it disarmed itself on the way out', ctx.__cap().armed === false);

    // d. _pickByIds — the anti-silent-drop rule
    const units = [{ id: 'SF-001-TL' }, { id: 'SF-001-PL' }, { id: 'SF-001-M' }];
    check('no ids asked for → null, i.e. fall through to the human picker',
      ctx.__pick(units, null, u => u.id) === null && ctx.__pick(units, [], u => u.id) === null);
    check('ids resolve to units in the ARRAY\'s order, not the caller\'s',
      ctx.__pick(units, ['SF-001-M', 'SF-001-TL'], u => u.id).map(u => u.id).join() === 'SF-001-TL,SF-001-M');
    let threw = null;
    try { ctx.__pick(units, ['SF-001-TL', 'SF-999-XX'], u => u.id); } catch (e) { threw = e.message; }
    check('an UNKNOWN id throws and names it — never silently drafts a subset (the dropped-phase lesson)',
      /unknown unit id\(s\): SF-999-XX/.test(String(threw)), String(threw));

    // ---- 3. one path for human and harness --------------------------------
    console.log('\n[3] the programmatic call and the picker run the SAME code');
    const pf = extractFn(ai, 'populateFha');
    check('extracted populateFha', !!pf);
    check('the condition callback is a NAMED function, defined once', /const _draftForConditions = function \(picked\) \{/.test(pf) &&
      (pf.match(/const _draftForConditions/g) || []).length === 1);
    check('the picker is handed that same named function — no second copy of the body',
      /_openScopePicker\(_exArr,[\s\S]{0,900}?\}, _draftForConditions\);/.test(pf));   // 4 Sep: the disclaimer grew (rows come from effects)
    check('opts.condIds routes to the SAME function, before the picker is ever opened',
      /const _sel = _pickByIds\(_exArr, opts\.condIds[\s\S]{0,120}?if \(_sel\) \{ _draftForConditions\(_sel\); return; \}/.test(pf));
    check('the _anemBatch cfg is built exactly once for the condition path (one prompt, one chunk size)',
      (pf.match(/noun: 'failure condition'/g) || []).length === 1);
    check('the function fallback got the same treatment', /const _draftForFunctions = function \(picked\) \{/.test(pf) &&
      /\}, _draftForFunctions\);/.test(pf) && (pf.match(/noun: 'aircraft function'/g) || []).length === 1);
    check('opts.funcIds routes there too', /const _selF = _pickByIds\(_fns, opts\.funcIds[\s\S]{0,120}?if \(_selF\) \{ _draftForFunctions\(_selF\); return; \}/.test(pf));

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })();
}
