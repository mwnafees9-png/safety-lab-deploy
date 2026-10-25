#!/usr/bin/env node
/*
 * Regression: ship.sh's "is the desktop app current?" line looks at what went live, not at commit ids. 25 Oct 2026.
 *
 * WAQAS: "why does it say desktop is current with this build?" (it said so after shipping 94 uncommitted files).
 * tools/desktop_drift.sh is run against a throwaway web repo and a throwaway desktop BUILD_INFO.json:
 *   [D1] same commit, nothing changed under site/: current
 *   [D2] a site file changed and not committed: BEHIND, and it says the change must be committed first
 *   [D3] a new site file not yet in git: BEHIND
 *   [D4] a commit since the desktop's that touches site/: BEHIND
 *   [D5] a commit since the desktop's that touches only notes: current
 *   [D6] ship.sh runs this check (not its own commit-id comparison)
 * MUTATION PROOF: SL_DD_MUTATE=sha (decide by commit id again) turns D2 and D3 red.
 * Run: node tests/regression_desktop_drift_20261025.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const ROOT = path.join(__dirname, '..');
let SCRIPT = fs.readFileSync(path.join(ROOT, 'tools', 'desktop_drift.sh'), 'utf8');
if (process.env.SL_DD_MUTATE === 'sha') {
    const m = SCRIPT.replace('if [ "${N:-0}" = "0" ]; then', 'if [ "$DESK_WEB" = "$(git -C "$WEB" rev-parse HEAD)" ]; then');
    if (m === SCRIPT) { console.log('  FAIL  the mutation found nothing to change'); process.exit(1); }
    SCRIPT = m;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-drift-'));
const web = path.join(tmp, 'web'), desk = path.join(tmp, 'desk');
fs.mkdirSync(path.join(web, 'site'), { recursive: true }); fs.mkdirSync(path.join(desk, 'app'), { recursive: true });
const script = path.join(tmp, 'desktop_drift.sh'); fs.writeFileSync(script, SCRIPT);
const git = (...a) => execFileSync('git', ['-C', web, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
const run = () => execFileSync('bash', [script, web, desk], { encoding: 'utf8' });
const pin = () => fs.writeFileSync(path.join(desk, 'app', 'BUILD_INFO.json'), JSON.stringify({ webCommit: git('rev-parse', 'HEAD'), pulledAt: '2026-10-25T00:00:00Z' }));
try {
    git('init', '-q');
    fs.writeFileSync(path.join(web, 'site', 'a.js'), 'one'); fs.writeFileSync(path.join(web, 'NOTES.md'), 'n');
    git('add', '-A'); git('commit', '-q', '-m', 'base'); pin();
    const d1 = run(); check('[D1] same commit, nothing changed under site/: current', /is current/.test(d1), d1);
    fs.writeFileSync(path.join(web, 'site', 'a.js'), 'two');
    const d2 = run(); check('[D2] a site file changed and not committed: BEHIND, commit first', /DESKTOP IS BEHIND: 1 site file/.test(d2) && /not committed/.test(d2) && /site\/a\.js/.test(d2), d2);
    execFileSync('git', ['-C', web, 'checkout', '-q', '--', 'site/a.js']);
    fs.writeFileSync(path.join(web, 'site', 'b.js'), 'new');
    const d3 = run(); check('[D3] a new site file not yet in git: BEHIND', /DESKTOP IS BEHIND/.test(d3) && /site\/b\.js/.test(d3), d3);
    git('add', '-A'); git('commit', '-q', '-m', 'add b');
    const d4 = run(); check('[D4] a commit since the desktop\'s that touches site/: BEHIND', /DESKTOP IS BEHIND/.test(d4) && /1 commit\(s\) since/.test(d4) && !/not committed/.test(d4), d4);
    pin(); fs.writeFileSync(path.join(web, 'NOTES.md'), 'more notes'); git('add', '-A'); git('commit', '-q', '-m', 'notes only');
    const d5 = run(); check('[D5] a commit since the desktop\'s that touches only notes: current', /is current/.test(d5), d5);
    const ship = fs.readFileSync(path.join(ROOT, 'ship.sh'), 'utf8');
    check('[D6] ship.sh runs this check and no longer compares commit ids itself', /tools\/desktop_drift\.sh/.test(ship) && !/\[ "\$DESK_WEB" = "\$HEAD_SHA" \]/.test(ship));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
