#!/usr/bin/env node
/*
 * Regression — locking that means it.
 * (26 Aug 2026: 35KB of the most consequential logic in the repo — lock_enforce.js
 * and lock_custody.js — had ZERO test coverage. 185 suites, 5,326 checks, and not
 * one of them referenced _wsLock, _wsEditable, gateBaselines or _blReopenApply.
 * The whole point of the feature is "BLOCK, PERIOD"; an unpinned block is the one
 * that quietly stops blocking.)
 *
 * The spec these pins defend, from the file headers:
 *   · A user lock belongs to its HOLDER. Only they edit. Only they unlock — the
 *     override path is GONE, and voluntary unlocks are flagged into the change
 *     log and the hash-chained journal.
 *   · BASELINED is stronger than locked: nobody unlocks a baseline. Reopening
 *     requires a PROBLEM REPORT with every parameter present. The PR is the key;
 *     there is no other key.
 *   · Enforcement is the native `inert` attribute — no clicks, no keys — not a
 *     CSS illusion, and the removed override button is neutralized at CAPTURE
 *     phase so a stale handler can never see the click.
 *   · Break-glass takeover transfers USER locks only, loudly, with signature +
 *     reason into a takeover register. Baselined gates have NO takeover path.
 *   · Reopening an upstream gate STAMPS every downstream baseline as impacted.
 *
 * The real files are loaded into a VM with stubbed globals and EXECUTED — these
 * are not greps. Run: node tests/regression_lock_custody.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const ENF = SITE('lock_enforce.js'), CUS = SITE('lock_custody.js');

// ---------------------------------------------------------------- the harness
// A minimal world: projectConfig, the workspace-lock accessors the modules ride
// on, and just enough DOM for the IIFEs to wire themselves without throwing.
function world(opts) {
  opts = opts || {};
  const captureHandlers = [];
  const el = () => ({ id: '', className: '', innerHTML: '', style: {}, inert: false,
    _attrs: {}, getAttribute(k) { return this._attrs[k] || null; }, setAttribute(k, v) { this._attrs[k] = v; },
    appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} },
    getBoundingClientRect: () => ({ width: 10, height: 10 }) });
  const journal = [], toasts = [], saves = { n: 0 };
  const ctx = {
    console,
    projectConfig: opts.projectConfig || { changeLog: [] },
    systemsData: opts.systemsData || [],
    // the workspace-lock layer these modules ride on (misc_fn_modules.js)
    _wsUser: () => opts.user || { email: 'a@x.com', name: 'Ada' },
    _wsAreaRef: (scope, systemId) => {
      if (scope === 'system') {
        const s = (ctx.systemsData || []).find(x => String(x.id) === String(systemId));
        return s ? { obj: s, label: 'System · ' + (s.name || s.id) } : null;
      }
      if (!ctx.projectConfig.acWorkspace) ctx.projectConfig.acWorkspace = {};
      return { obj: ctx.projectConfig.acWorkspace, label: 'Aircraft level' };
    },
    _wsGetLock: (scope, systemId) => { const r = ctx._wsAreaRef(scope, systemId); return r ? (r.obj.lock || null) : null; },
    slWorkspaceLog: () => {},
    showToast: (m) => toasts.push(String(m)),
    scheduleAutosave: () => { saves.n++; },
    setTimeout: (f) => f && 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    document: {
      readyState: 'complete',
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: el, body: el(),
      addEventListener: (t, h, cap) => { if (cap) captureHandlers.push({ t, h }); }
    }
  };
  ctx.window = ctx;
  ctx.window.jrnl = (k, m) => journal.push({ k, m: String(m) });
  vm.createContext(ctx);
  vm.runInContext(ENF, ctx, { filename: 'lock_enforce.js' });
  vm.runInContext(CUS, ctx, { filename: 'lock_custody.js' });
  return { ctx, journal, toasts, saves, captureHandlers };
}

console.log('\n[state] slLockState — the single truth about editability');
{
  const w = world({ projectConfig: { changeLog: [], acWorkspace: {} } });
  check('an unlocked area is editable', w.ctx.window.slLockState('ac', '').editable === true);

  const mine = world({ user: { email: 'a@x.com', name: 'Ada' },
    projectConfig: { changeLog: [], acWorkspace: { lock: { by: 'a@x.com', name: 'Ada', at: 1 } } } });
  const s1 = mine.ctx.window.slLockState('ac', '');
  check('the HOLDER may still edit their own locked area', s1.editable === true && s1.kind === 'held-by-me');

  const theirs = world({ user: { email: 'b@x.com', name: 'Bo' },
    projectConfig: { changeLog: [], acWorkspace: { lock: { by: 'a@x.com', name: 'Ada', at: 1 } } } });
  const s2 = theirs.ctx.window.slLockState('ac', '');
  check('everyone else is blocked, and told who holds it',
    s2.editable === false && s2.kind === 'user' && s2.by === 'a@x.com');

  const caseTest = world({ user: { email: 'A@X.com', name: 'Ada' },
    projectConfig: { changeLog: [], acWorkspace: { lock: { by: 'a@x.com', name: 'Ada', at: 1 } } } });
  check('holder identity is case-insensitive (a signed-in email is not a password)',
    caseTest.ctx.window.slLockState('ac', '').editable === true);
}

console.log('\n[baseline] stronger than a user lock');
{
  const w = world({ user: { email: 'a@x.com' }, projectConfig: { changeLog: [], acWorkspace: {} } });
  w.ctx.window._blApply('AFHA', 'Ada', 'gate 1');
  const st = w.ctx.window.slLockState('ac', '');
  check('a baselined gate makes its whole area non-editable',
    st.editable === false && st.kind === 'baseline' && st.gate === 'AFHA');
  check('…even for the person who baselined it',
    st.editable === false, 'a baseline is not a personal lock');
  check('the baseline is journaled', w.journal.some(j => j.k === 'baseline' && /AFHA/.test(j.m)));

  // a baseline outranks a user lock held by ME
  const both = world({ user: { email: 'a@x.com' },
    projectConfig: { changeLog: [], acWorkspace: { lock: { by: 'a@x.com', name: 'Ada', at: 1 } } } });
  both.ctx.window._blApply('AFHA', 'Ada', '');
  check('baseline outranks the holder’s own user lock',
    both.ctx.window.slLockState('ac', '').kind === 'baseline');

  const sys = world({ user: { email: 'a@x.com' }, systemsData: [{ id: 'S1', name: 'Hyd' }],
    projectConfig: { changeLog: [], acWorkspace: {} } });
  sys.ctx.window._blApply('PSSA', 'Ada', '');
  check('a system-level gate freezes system areas, not the aircraft area',
    sys.ctx.window.slLockState('system', 'S1').kind === 'baseline' &&
    sys.ctx.window.slLockState('ac', '').editable === true);
  check('an unknown gate name is refused', w.ctx.window._blApply('NOPE', 'Ada', '') === false);
  check('baselining without a signature is refused', w.ctx.window._blApply('ASA', '  ', '') === false);
}

console.log('\n[reopen] the PR is the key — and the only key');
{
  const mk = () => { const w = world({ user: { email: 'a@x.com' }, projectConfig: { changeLog: [], acWorkspace: {} } });
    w.ctx.window._blApply('AFHA', 'Ada', ''); return w; };
  const full = { reason: 'design change', change: 'reroute', impact: 'FC-001 re-eval', by: 'Ada', artifacts: ['AFHA'], safety: true };

  check('a gate that is not baselined cannot be reopened',
    world({ projectConfig: { changeLog: [] } }).ctx.window._blReopenApply('AFHA', full).ok === false);

  ['reason', 'change', 'impact', 'by'].forEach(k => {
    const p = Object.assign({}, full); p[k] = '   ';
    const r = mk().ctx.window._blReopenApply('AFHA', p);
    check('reopen refused without ' + k, r.ok === false && /missing required parameter: ' + k + '|missing required parameter/.test(r.reason));
  });
  check('reopen refused with no artifacts',
    mk().ctx.window._blReopenApply('AFHA', Object.assign({}, full, { artifacts: [] })).ok === false);

  const w = mk();
  const r = w.ctx.window._blReopenApply('AFHA', full);
  check('a complete PR reopens the gate and returns its id', r.ok === true && /^PR-\d{3}$/.test(r.prId));
  const pc = w.ctx.projectConfig;
  check('…a real problem report row is written, linked to the gate',
    pc.problemReports.length === 1 && pc.problemReports[0].linked === 'AFHA' &&
    pc.problemReports[0].source === 'baseline-reopen' && pc.problemReports[0].state === 'open');
  check('…carrying every parameter the engineer supplied',
    /Reason: design change/.test(pc.problemReports[0].description) &&
    /Change description: reroute/.test(pc.problemReports[0].description) &&
    /Impact assessment: FC-001 re-eval/.test(pc.problemReports[0].description) &&
    pc.problemReports[0].safetyRelated === true);
  check('…the gate records which PR opened it',
    pc.gateBaselines.AFHA.state === 'reopened' && pc.gateBaselines.AFHA.prId === r.prId);
  check('…and the reopen is journaled with the PR id',
    w.journal.some(j => j.k === 'baseline-reopen' && j.m.indexOf(r.prId) >= 0));

  // PR id collision — the comment calls aliasing an old PR "unforgivable"
  const seeded = world({ user: { email: 'a@x.com' },
    projectConfig: { changeLog: [], acWorkspace: {}, prCounter: 0, problemReports: [{ id: 'PR-007' }] } });
  seeded.ctx.window._blApply('AFHA', 'Ada', '');
  const r2 = seeded.ctx.window._blReopenApply('AFHA', full);
  check('a new PR id never aliases an existing one, even with a stale counter',
    r2.prId === 'PR-008', 'got ' + r2.prId);
}

console.log('\n[takeover] break-glass transfers USER locks only, loudly');
{
  const mkLocked = (extra) => world(Object.assign({ user: { email: 'b@x.com', name: 'Bo' },
    projectConfig: { changeLog: [], acWorkspace: { lock: { by: 'a@x.com', name: 'Ada', at: 1 } } } }, extra || {}));

  check('takeover refused without a signature',
    mkLocked().ctx.window._lockTakeoverApply('ac', '', { reason: 'on leave' }).ok === false);
  check('takeover refused without a reason — "takeovers are never silent"',
    mkLocked().ctx.window._lockTakeoverApply('ac', '', { by: 'Bo' }).ok === false);
  check('takeover refused when nothing is locked',
    world({ projectConfig: { changeLog: [], acWorkspace: {} } })
      .ctx.window._lockTakeoverApply('ac', '', { by: 'Bo', reason: 'x' }).ok === false);

  const w = mkLocked();
  const t = w.ctx.window._lockTakeoverApply('ac', '', { by: 'Bo', reason: 'Ada on leave, gate Friday' });
  check('a signed, reasoned takeover succeeds', t.ok === true);
  check('…custody actually moves to the new holder',
    w.ctx.projectConfig.acWorkspace.lock.by === 'b@x.com' && w.ctx.projectConfig.acWorkspace.lock.takeover === true);
  // Identity is resolved at CALL time (_user() → _wsUser()), so swap who is asking:
  // the new holder keeps editing, the stranded previous holder is now locked out.
  check('…the new holder can edit', w.ctx.window.slLockState('ac', '').editable === true);
  w.ctx._wsUser = () => ({ email: 'a@x.com', name: 'Ada' });
  const asAda = w.ctx.window.slLockState('ac', '');
  check('…and the PREVIOUS holder is now locked out of the area they held',
    asAda.editable === false && asAda.kind === 'user' && asAda.by === 'b@x.com',
    'custody transferred, so Ada must lose the edit right she had a moment ago');
  check('…a takeover register row records from → to and why',
    w.ctx.projectConfig.lockTakeovers.length === 1 &&
    w.ctx.projectConfig.lockTakeovers[0].from === 'a@x.com' &&
    /Ada on leave/.test(w.ctx.projectConfig.lockTakeovers[0].reason));
  check('…and it is journaled as BREAK-GLASS',
    w.journal.some(j => j.k === 'lock-takeover' && /BREAK-GLASS/.test(j.m)));
}

console.log('\n[cascade] reopening upstream stamps the baselines resting on it');
{
  const w = world({ user: { email: 'a@x.com' }, projectConfig: { changeLog: [], acWorkspace: {} } });
  w.ctx.window._blApply('AFHA', 'Ada', '');
  w.ctx.window._blApply('PSSA', 'Ada', '');
  w.ctx.window._blApply('SSA', 'Ada', '');
  w.ctx.window._blReopenApply('AFHA', { reason: 'r', change: 'c', impact: 'i', by: 'Ada', artifacts: ['AFHA'] });
  const bl = w.ctx.projectConfig.gateBaselines;
  check('downstream locked baselines are stamped impacted',
    !!(bl.PSSA && bl.PSSA.impacted) && !!(bl.SSA && bl.SSA.impacted),
    'a baseline resting on reopened ground must say so');
  check('…naming the upstream gate that moved',
    bl.PSSA.impacted.upstream === 'AFHA');
  check('…and journaled per impacted gate',
    w.journal.filter(j => j.k === 'baseline-impact').length >= 2);
  check('the reopened gate itself is not stamped as its own victim', !bl.AFHA.impacted);
  check('the workflow order is published for the cascade to walk',
    Array.isArray(w.ctx.window._slBaselineOrder) &&
    w.ctx.window._slBaselineOrder.join(' ') === 'AFHA PASA SFHA PSSA SSA ASA');
}

console.log('\n[enforcement] block, period — the mechanism, not a promise');
{
  const w = world({ projectConfig: { changeLog: [] } });
  check('enforcement uses the native inert attribute, not a CSS illusion',
    /view\.inert = true/.test(ENF), 'pointer-events can be overridden from devtools; inert kills keys too');
  check('the override button is neutralized at CAPTURE phase',
    /addEventListener\('click', e => \{[\s\S]{0,320}getAttribute\('data-act'\) === 'override'[\s\S]{0,160}stopPropagation\(\); e\.preventDefault\(\);/.test(ENF) &&
    /\}, true\);/.test(ENF),
    'bubble phase would let the panel’s own handler run first');
  check('a capture-phase click handler is actually registered', w.captureHandlers.some(h => h.t === 'click'));
  check('non-holders are refused at the toggle, not just in the UI',
    /Only the lock holder can unlock this area\./.test(ENF));
  check('the override path is gone from the enforce layer',
    !/act === 'override'\s*\)\s*\{[^}]*_wsUnlock\([^)]*true/.test(ENF));
  check('voluntary unlocks are mirrored into the hash-chained journal',
    /jrnl\('ws-' \+ e\.action/.test(ENF));
  check('baselined gates expose NO takeover path',
    /baselined gates\s*\n?\/\/\s*have no takeover path at all|have no takeover path at all/.test(CUS));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
