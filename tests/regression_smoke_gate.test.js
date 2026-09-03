#!/usr/bin/env node
/*
 * Regression — the runtime smoke gate is WIRED and cannot be quietly defanged.
 * Build 66.37. Spec: WORK_PACKAGE §9 item 0, OPEN_ITEMS item 0.
 *
 * The gate itself proves its own worth by execution — reintroduce any of the four
 * 19 Aug escapes and it goes red (measured: .is-modal 2 red · comment corruption
 * 5 red · window[name] 7 red · malformed attribute 4 red). What THIS suite guards
 * is the part execution cannot: that the gate is still plumbed into ship.sh, still
 * blocks the deploy, and has not had its teeth removed by a later edit.
 *
 * A gate that runs and passes vacuously is worse than no gate — it writes
 * "verified" into the ship log for a build nobody checked. So the checks below are
 * mostly about the ABSENCE of silent-success paths.
 *
 * Run: node tests/regression_smoke_gate.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const ship = fs.readFileSync(path.join(ROOT, 'ship.sh'), 'utf8');
const gate = fs.readFileSync(path.join(ROOT, 'tools/smoke/smoke_gate.js'), 'utf8');
const cdp  = fs.readFileSync(path.join(ROOT, 'tools/smoke/cdp.js'), 'utf8');

console.log('\n[1] The gate is wired into ship.sh, and it blocks');
{
  check('ship.sh invokes the smoke gate', /node\s+tools\/smoke\/smoke_gate\.js/.test(ship));
  const gateAt   = ship.search(/if ! node tools\/smoke\/smoke_gate\.js/);
  // Anchored at line start: ship.sh's own header comment mentions the deploy
  // command, and matching that reported the gate running "after" the deploy.
  const deployAt = ship.search(/^npx wrangler deploy/m);
  const buildAt  = ship.search(/if ! \.\/build\.sh/);
  check('it runs AFTER the build (there is a dist to gate)', buildAt > 0 && gateAt > buildAt,
        'build@' + buildAt + ' gate@' + gateAt);
  check('it runs BEFORE the deploy (a gate that runs after is a post-mortem)',
        gateAt > 0 && deployAt > gateAt, 'gate@' + gateAt + ' deploy@' + deployAt);
  check('a red gate exits non-zero and says NOT DEPLOYING',
        /if ! node tools\/smoke\/smoke_gate\.js; then[\s\S]{0,400}?NOT DEPLOYING[\s\S]{0,300}?exit 1/.test(ship));
  check('the wall still gates the build ahead of all of it', /WALL GREEN/.test(ship) && /NOT DEPLOYING — \$FAILS real failure/.test(ship));

  // ---- 20 Aug 2026: a suite that CANNOT RUN is not a suite that passed ----------
  // The wall used to discard node's exit code and grep only for "  FAIL  " lines, so a
  // suite that threw on load printed a stack trace, emitted no FAIL line, and was counted
  // as run-and-clean. Two suites were dead for a day that way — regression_req_bucketing
  // and regression_ccmr_pairtrace, both killed by walkNodesInScope moving into
  // genFTAEvents when A2 shipped — and four builds went out behind a green wall that was
  // not running them. This is the wall lying about itself, which is worse than any single
  // bug it might miss, so it is pinned here.
  check('the wall captures each suite\'s exit code', /node "\$t" >> "\$LOG" 2>&1\s*\n\s*RC=\$\?/.test(ship),
        'without RC=$? a crashed suite is indistinguishable from a clean one');
  check('a non-zero exit with no FAIL line is counted as a CRASH',
        /if \[ \$RC -ne 0 \]; then[\s\S]{0,300}?CRASHES=\$\(\(CRASHES \+ 1\)\)/.test(ship));
  check('crashes block the deploy on their own, not only via $FAILS',
        /if \[ "\$CRASHES" != "0" \]; then[\s\S]{0,600}?exit 1/.test(ship));
  check('the crash count is reported every run, green or not', /echo "crashed    : \$CRASHES"/.test(ship));
  check('the crash block names the offending suites and their error',
        /suites that could not run/.test(ship) && /grep -E 'Error\|error:'/.test(ship));
  // Ordering: the crash gate must come BEFORE the "WALL GREEN" line, or a crashed run
  // could still print green above its own refusal.
  check('the crash gate runs before WALL GREEN is printed',
        ship.search(/if \[ "\$CRASHES" != "0" \]/) < ship.search(/echo "WALL GREEN"/));
}

console.log('\n[2] No silent success — the ways a gate lies about having run');
{
  check('a missing browser THROWS rather than returning success',
        /No Chrome\/Chromium\/Edge found/.test(cdp) && /throw new Error\(/.test(cdp));
  check('an unsupported Node THROWS rather than skipping',
        /no global WebSocket/.test(cdp) && !/process\.exit\(0\)/.test(cdp));
  check('the only zero-exit escape hatch is explicit and loud',
        /SMOKE_SKIP === '1'/.test(gate) && /SKIPPED \(SMOKE_SKIP=1\)/.test(gate));
  check('the skip notice says the build is going out unverified',
        /Shipping unverified at runtime/.test(gate));
  check('a missing dist is an error, not a pass',
        /No .*to gate|run \.\/build\.sh first/.test(gate) && /process\.exit\(1\)/.test(gate));
  check('the gate exits non-zero whenever any check failed',
        /code = fail === 0 \? 0 : 1/.test(gate));
  check('a crash inside the gate fails it rather than passing it',
        /run\(\)\.catch\([\s\S]{0,120}process\.exit\(1\)/.test(gate));
}

console.log('\n[3] The gate runs the SAME app the browser will');
{
  // Scanning for the string "const CSP_POLICY =" fails: the gate's own extraction
  // regex contains it. What must be absent is a hardcoded POLICY, not the name.
  check('the CSP is read live from worker.js, never hardcoded',
        /worker\.js/.test(gate) && !/default-src\s+.self./.test(gate) && !/script-src\s+.self./.test(gate));
  check('it refuses to run on a guessed CSP', /refuses to run\s*'\s*\+\s*'with a guessed policy|guessed policy/.test(gate));
  check('dropping upgrade-insecure-requests is stated, not silent',
        /upgrade-insecure-requests/.test(gate) && /dropped/.test(gate));
  check('a missing file is a 404, not the SPA shell',
        /missing\.push/.test(gate) && /404/.test(gate));
  check('it gates ./dist by default, with --src only as a dev loop',
        /USE_SRC \? 'site' : 'dist'/.test(gate));
}

console.log('\n[4] The checks that catch each of the four 19 Aug escapes are still present');
{
  // 1 — dead .is-modal selectors: assert a LIVE element matches, not that a rule exists.
  check('escape 1 — the live drawer selector is asserted against the document',
        /node-config-panel\[style\*="display: block"\]/.test(gate) &&
        /LIVE drawer selector matches an element/.test(gate));
  // 2 — script tags swallowed by a comment: globals vanish, boot throws.
  check('escape 2 — boot exceptions and the load-bearing globals are both asserted',
        /uncaught exceptions/.test(gate) && /load-bearing globals/.test(gate));
  // 3 — window[name] reads of lexical globals: silent undefined, blank render.
  check('escape 3 — SLEnv reachability is asserted for the critical bindings',
        /SLEnv reaches the app/.test(gate) && /ftaPages', 'systemsData', 'projectConfig', 'esc'/.test(gate));
  check('escape 3 — and the identity block is asserted to render CONTENT, not to exist',
        /renders real content, not an empty string/.test(gate));
  // 4 — malformed attribute quoting: rendered fine, did nothing.
  check('escape 4 — the form is asserted to ADVANCE, not merely to render',
        /ADVANCES the form/.test(gate) && /dispatchEvent\(new Event\('change'/.test(gate));
}

console.log('\n[5] The attribute check uses the signature that works, not the one that looked right');
{
  // This is the lesson from 19 Aug, encoded. Counting quotes per tag and asserting
  // the count is EVEN is blind to the defect it exists for: onclick="f("x")" has
  // four quotes. It was written that way first, the mutation was reintroduced, and
  // the check stayed green. Do not let a later edit revert to parity.
  check('it detects an attribute value that ended in the middle of itself',
        /="\[\^"\]\*"\[\^\\\\s>\\\\\/\]/.test(gate) || /\[\^"\]\*"\[\^/.test(gate),
        'the early-termination signature is missing from the gate');
  check('quote-parity is NOT the only attribute check',
        !/length % 2\) !== 0[\s\S]{0,200}$/.test(gate.slice(gate.indexOf('truncated'))));
  check('the reason parity is insufficient is written down where it will be read',
        /Counting quotes for\s*\n\s*\/\/ evenness does NOT catch this|does NOT catch this/.test(gate));
}

console.log('\n[6] No new dependency was introduced');
{
  check('no package.json was added to the repo', !fs.existsSync(path.join(ROOT, 'package.json')));
  check('the gate requires nothing outside node core and its own sibling',
        (gate.match(/require\('([^']+)'\)/g) || [])
          .every(r => /'(fs|path|http|os|net|child_process)'|\.\/cdp\.js/.test(r)),
        (gate.match(/require\('([^']+)'\)/g) || []).join(' '));
  check('the CDP client requires nothing outside node core',
        (cdp.match(/require\('([^']+)'\)/g) || [])
          .every(r => /'(fs|path|os|net|child_process)'/.test(r)),
        (cdp.match(/require\('([^']+)'\)/g) || []).join(' '));
  // cdp.js names Playwright in the header explaining why it is deliberately not
  // used; what matters is that it never REQUIRES it or downloads anything.
  check('it drives a browser already on the machine, not a downloaded one',
        /CHROME_PATH/.test(cdp) && !/require\(['"](playwright|puppeteer)/.test(cdp)
        && !/download|npx /i.test(cdp.replace(/\/\*[\s\S]*?\*\//g, '')));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : fail + ' FAILED of ' + (pass + fail)));
process.exit(fail === 0 ? 0 : 1);
