#!/usr/bin/env node
/*
 * Regression: an update always reaches the install that is running (22 Oct 2026).
 *
 * Found on a customer server. Their IT unpacked the new package in a new folder and ran
 * install.sh there, while Safety Lab ran from the folder it was first installed in; and in any
 * folder, "docker compose up" never restarted the AI service when only its code changed, so the
 * old code kept running from memory. Both runs ended like a finished update. The AI key panel
 * (new code) answered as the old version, and nobody could tell why.
 *
 * Pinned, with a stand-in for docker (no Docker needed to run this):
 *   1. a first install (nothing running): passes, writes the run's token;
 *   2. the running service reads this folder: passes;
 *   3. it reads ANOTHER folder: STOP before anything running changes, naming that folder and the
 *      exact command to update it (the appliance variant for /opt/safetylab);
 *   4. after "up", the AI service is recreated, and the running code is proven to be this
 *      folder's (token and code hash); a service still on the old code is a STOP, not a success;
 *   5. a stopped install in another folder, and a folder with no stack while Safety Lab exists
 *      elsewhere (stopped before any question); folder spellings of Docker Desktop and WSL;
 *   6. install.sh sources the checks and calls them in the right places.
 *
 * Run: node tests/regression_kit_update_running_20261022.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 500) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const KIT = path.join(REPO, 'customer-install', 'selfhost');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-kit-'));
// a stand-in docker: state file holds the folder the running service reads as /app ('' = not running)
const bin = path.join(tmp, 'bin'); fs.mkdirSync(bin);
const STATE = path.join(tmp, 'state');
fs.writeFileSync(path.join(bin, 'docker'), `#!/usr/bin/env bash
APP="$(cat "${STATE}" 2>/dev/null)"; MODE="$(cat "${STATE}.mode" 2>/dev/null || echo running)"
case "$1" in
  ps) if [ -n "$APP" ]; then if [ "$2" = -aq ] || [ "$MODE" = running ]; then echo abc123; fi; fi; exit 0 ;;
  inspect) case "$*" in *working_dir*) [ -n "$APP" ] && echo "\${APP%/ai-proxy}" ;; *) echo "$APP" ;; esac; exit 0 ;;
  exec) [ "$MODE" = running ] || exit 1; shift; shift; f="\${2#/app/}"; [ -n "$APP" ] || exit 1
        if [ "$1" = cat ]; then cat "$APP/$f"; elif [ "$1" = sha256sum ]; then (cd "$APP" && sha256sum "$f" | sed "s| $f| /app/$f|"); fi; exit $? ;;
  compose) echo "compose $*" >> "${STATE}.log"; if [ "$2" = up ] && [ "\${FAKE_STUCK:-0}" != 1 ]; then echo "$PWD/ai-proxy" > "${STATE}"; echo running > "${STATE}.mode"; fi; exit 0 ;;
esac
exit 0
`, { mode: 0o755 });
function mkStack(name, worker) {
  const s = path.join(tmp, name, 'customer-install', 'selfhost', 'stack');
  fs.mkdirSync(path.join(s, 'ai-proxy'), { recursive: true });
  fs.writeFileSync(path.join(s, 'ai-proxy', 'worker.js'), worker);
  return s;
}
function run(stack, kitRoot, fn, env) {
  const script = `set -euo pipefail; . "${path.join(KIT, 'kit_checks.sh')}"; { cd "${stack}" 2>/dev/null || cd "${path.dirname(stack)}"; }; ${fn === 'check' ? `slab_kit_check_running "${stack}" "${kitRoot}"; echo OK-CHECK; slab_ai_proxy_refresh "${stack}"; echo OK-REFRESH` : fn}`;
  const r = cp.spawnSync('bash', ['-c', script], { encoding: 'utf8', env: Object.assign({}, process.env, { PATH: bin + ':' + process.env.PATH, SLAB_KIT_WAIT: '0' }, env || {}) });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const setRunning = (dir, mode) => { fs.writeFileSync(STATE, dir || ''); fs.writeFileSync(STATE + '.mode', mode || 'running'); };

console.log('\n[kit] the update reaches the install that is running');
{
  const mine = mkStack('new', 'NEW CODE');
  setRunning('');
  const r = run(mine, path.dirname(path.dirname(mine)), 'check');
  check('a first install (nothing running): passes, and the AI service comes up on this folder\'s code', r.code === 0 && /OK-CHECK/.test(r.out) && /OK-REFRESH/.test(r.out) && /running this version \(checked\)/.test(r.out), r.out);
  check('each run leaves a fresh token for the proof', fs.existsSync(path.join(mine, 'ai-proxy', '.kit-id')));
}
{
  const mine = mkStack('same', 'NEW CODE');
  setRunning(path.join(mine, 'ai-proxy'));
  fs.writeFileSync(STATE + '.log', '');
  const r = run(mine, path.dirname(path.dirname(mine)), 'check');
  check('the running service reads this folder: passes', r.code === 0 && /OK-REFRESH/.test(r.out), r.out);
  check('and the AI service is recreated (not just "up"), so the new code is loaded', /compose up -d --no-deps --force-recreate --wait --wait-timeout 180 ai-proxy/.test(fs.readFileSync(STATE + '.log', 'utf8')));
}
{
  const old = mkStack('opt-like', 'OLD CODE');
  const mine = mkStack('home', 'NEW CODE');
  setRunning(path.join(old, 'ai-proxy'));
  const before = fs.readFileSync(path.join(old, 'ai-proxy', 'worker.js'), 'utf8');
  const r = run(mine, path.join(tmp, 'home', 'customer-install'), 'check');
  const oldKit = path.join(tmp, 'opt-like', 'customer-install');
  check('running from ANOTHER folder: STOP before anything running changes', r.code === 1 && !/OK-CHECK/.test(r.out) && /Safety Lab is already installed on this server, from another folder/.test(r.out) && fs.readFileSync(path.join(old, 'ai-proxy', 'worker.js'), 'utf8') === before, r.out);
  check('it names the running folder, this folder, and the exact command to update the running one',
    r.out.indexOf(oldKit) > 0 && r.out.indexOf(path.join(tmp, 'home', 'customer-install')) > 0 && r.out.indexOf('cp -r "' + path.join(tmp, 'home', 'customer-install') + '/." "' + oldKit + '/" && cd "' + oldKit + '/selfhost" && bash install.sh') > 0, r.out);
  check('and says the data stays (database, keys, answers, license are never replaced)', /an update never replaces them/.test(r.out));
}
{
  // the appliance keeps its kit in /opt/safetylab: the message gives the appliance's own way
  const mine = mkStack('home2', 'NEW CODE');
  setRunning('/opt/safetylab/customer-install/selfhost/stack/ai-proxy');
  const r = run(mine, path.join(tmp, 'home2', 'customer-install'), 'check');
  check('on the appliance (/opt/safetylab) the command runs the installer as it does there', r.code === 1 && /This server is the Safety Lab appliance/.test(r.out) && /sudo cp -r .* "\/opt\/safetylab\/customer-install\/" && cd "\/opt\/safetylab\/customer-install\/selfhost" && sudo -u safetylab env SLAB_OFFLINE=1 bash install.sh/.test(r.out), r.out);
}
{
  // recreate did not take (the old code is still what runs): a STOP, never "done"
  const mine = mkStack('stuck', 'NEW CODE');
  const stale = mkStack('stale', 'OLD CODE');
  setRunning(path.join(mine, 'ai-proxy'));
  const r = run(mine, path.dirname(path.dirname(mine)), `slab_kit_check_running "${mine}" x; echo "${path.join(stale, 'ai-proxy')}" > "${STATE}"; slab_ai_proxy_refresh "${mine}"; echo OK-REFRESH`, { FAKE_STUCK: '1' });
  check('after the restart the running code is checked: still the old code is a STOP, not a finished update', r.code === 1 && !/OK-REFRESH/.test(r.out) && /the AI service is still not running the version in/.test(r.out), r.out);
}
{
  // stopped, in another folder: Docker's own record of the folder says so
  const old = mkStack('stopped-old', 'OLD CODE');
  const mine = mkStack('stopped-new', 'NEW CODE');
  setRunning(path.join(old, 'ai-proxy'), 'stopped');
  const r = run(mine, path.join(tmp, 'stopped-new', 'customer-install'), 'check');
  check('a STOPPED install in another folder: STOP too (starting this folder would take its containers over)', r.code === 1 && /already installed on this server, from another folder/.test(r.out) && r.out.indexOf(path.join(tmp, 'stopped-old', 'customer-install')) > 0, r.out);
  setRunning(path.join(mine, 'ai-proxy'), 'stopped');
  const r2 = run(mine, path.join(tmp, 'stopped-new', 'customer-install'), 'check');
  check('a stopped install in THIS folder: passes, and the AI service comes up on the new code', r2.code === 0 && /running this version \(checked\)/.test(r2.out), r2.out);
}
{
  // early: a folder with no stack yet, while Safety Lab exists elsewhere: stop before any question
  const old = mkStack('early-old', 'OLD CODE');
  const fresh = path.join(tmp, 'early-new', 'customer-install', 'selfhost', 'stack');
  fs.mkdirSync(path.dirname(fresh), { recursive: true });
  setRunning(path.join(old, 'ai-proxy'));
  const r = run(fresh, path.join(tmp, 'early-new', 'customer-install'), `slab_kit_check_early "${fresh}" "${path.join(tmp, 'early-new', 'customer-install')}"; echo OK-EARLY`);
  check('unpacked somewhere new while Safety Lab is installed elsewhere: STOP before any question is asked', r.code === 1 && !/OK-EARLY/.test(r.out) && r.out.indexOf(path.join(tmp, 'early-old', 'customer-install')) > 0, r.out);
  setRunning('');
  const r2 = run(fresh, path.join(tmp, 'early-new', 'customer-install'), `slab_kit_check_early "${fresh}" x; echo OK-EARLY`);
  check('and nothing installed anywhere: the early check lets a first install through', r2.code === 0 && /OK-EARLY/.test(r2.out), r2.out);
}
{
  // folder spellings Docker Desktop and WSL use for the same folder compare equal
  const r = cp.spawnSync('bash', ['-c', `. "${path.join(KIT, 'kit_checks.sh')}"; _slab_norm /run/desktop/mnt/host/c/SafetyLab/customer-install/selfhost/stack; echo; _slab_norm /mnt/c/SafetyLab/customer-install/selfhost/stack/; echo; _slab_norm 'C:\\SafetyLab\\customer-install\\selfhost\\stack'`], { encoding: 'utf8' });
  const l = r.stdout.trim().split('\n');
  check('the same Windows folder, spelled three ways, compares equal', l.length === 3 && l[0] === l[1] && l[1] === l[2] && l[0] === '/c/safetylab/customer-install/selfhost/stack', JSON.stringify(l));
}
console.log('\n[install.sh] wired in the right places');
{
  const s = fs.readFileSync(path.join(KIT, 'install.sh'), 'utf8');
  const iSrc = s.indexOf('. "$HERE/kit_checks.sh"'), iCp = s.indexOf('cp -r "$HERE/ai-proxy" "$STACK/"'), iChk = s.indexOf('slab_kit_check_running "$STACK"');
  const iUp = s.indexOf('docker compose up -d --wait --wait-timeout 600'), iRef = s.indexOf('slab_ai_proxy_refresh "$STACK"'), iCaddy = s.indexOf('docker compose restart caddy');
  const iEarly = s.indexOf('slab_kit_check_early "$STACK"'), iAns = s.indexOf('# ---------------------------------------------------------------- 1. answers');
  check('install.sh loads the checks before using them', iSrc > 0 && iSrc < iEarly && iSrc < iChk);
  check('the early check runs once Docker is known to work, before the first question', iEarly > s.indexOf('docker compose version >/dev/null') && iEarly < iAns);
  check('the running-folder check runs right after the new files are copied, before anything is started', iCp > 0 && iCp < iChk && iChk < iUp);
  check('the AI service refresh runs after the services are up, before the front door restart', iUp < iRef && iRef < iCaddy);
  const r = cp.spawnSync('bash', ['-n', path.join(KIT, 'install.sh')]); const r2 = cp.spawnSync('bash', ['-n', path.join(KIT, 'kit_checks.sh')]);
  check('both scripts are valid bash', r.status === 0 && r2.status === 0);
  const DASH = String.fromCharCode(0x2014);
  check('no em dashes in the new checks', fs.readFileSync(path.join(KIT, 'kit_checks.sh'), 'utf8').indexOf(DASH) < 0);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
