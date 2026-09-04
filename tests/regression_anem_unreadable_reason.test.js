#!/usr/bin/env node
/**
 * Regression — F16d: THE FMEA "DECLINED" WITH NO REASON (golden runs 1 and 2, 4 Sep 2026).
 * Both attempts of the turn came back as text that was not JSON; the batch treated the empty
 * parse as "no actions" and the no-actions path had nothing to say — declined:true, reason "".
 *   · unreadable replies are counted and the start of the raw text kept;
 *   · a batch that drafted nothing because of them says so, quoting the reply;
 *   · a batch whose valid replies carried no actions and no explanation says THAT;
 *   · under capture both go through _anemNoActionsPanel → _captureFire, so the harness records
 *     the reason (it reads d.reply).
 * Run: node tests/regression_anem_unreadable_reason.test.js
 */
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const drv = fs.readFileSync(path.join(__dirname, '..', 'eval', 'golden_thread_driver.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }

check('unreadable replies are counted and the raw start kept', /let _unparsed = 0, _rawTail = '';/.test(ai) && /if \(!a\.parsed\) \{ _unparsed\+\+; if \(!_rawTail\) _rawTail = String\(\(a\.rr && a\.rr\.text\) \|\| ''\)/.test(ai));
check('nothing drafted because of them → the decline names the cause and quotes the reply', /came back as text that was not the JSON asked for, after one retry each\./.test(ai) && /The reply began: "/.test(ai) && /The reply was empty\./.test(ai));
check('… routed through the no-actions panel (capture-aware), not a transient toast', /if \(_unparsed && !_permanentErr && !_hardErr\) \{[\s\S]{0,120}_anemNoActionsPanel\(cfg, \{ reply: 'Nothing drafted — ' \+ _unparsed/.test(ai));
check('valid replies with no actions and no explanation say exactly that (the old bare toast is gone)', !/turn\(s\) returned but produced no rows\.'/.test(ai) && /returned valid replies with no actions and no explanation\./.test(ai) && /The model gave no reason\./.test(ai));
check('the capture payload carries the reply as the reason the harness reads', /reply: String\(\(parsed && parsed\.reply\) \|\| \(insuf && insuf\.reason\) \|\| ''\)/.test(ai) && /rec\.reason = String\(d\.reason \|\| d\.reply \|\| ''\)/.test(drv));
check('pins: ai_assistant 76.55 (loader), ai_skills 2.12, ai_loader 8.47', /ai_assistant\.js\?v=76\.55/.test(loader) && /ai_skills\.js\?v=2\.12/.test(idx) && /ai_loader\.js\?v=8\.47/.test(idx));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
