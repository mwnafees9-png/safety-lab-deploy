#!/usr/bin/env node
/*
 * Regression: requirements move from the AFHA to the PASA, and from the SFHA to the PSSA
 * (21 Oct 2026).
 *
 * Waqas's ruling: "I want the requirements in Safety Lab to move from AFHAs and SFHAs to the PASA
 * and PSSAs respectively." Move cleanly (no tab left behind), placement only (same data, same
 * tracing, same exports, same Jama sync).
 *
 * How it is built, and what this pins:
 *   - Aircraft requirements keep their own view and tab id ('ac-req'). Locks, saves, lazy render,
 *     deep links, the command palette and the journal all key on that id, so it does not change.
 *     The view is shown inside the PASA frame: the ONE PASA tab bar moves above it, with
 *     "Aircraft Requirements" active, and moves back when the PASA is shown.
 *   - System requirements keep their sub-tab id ('req') for the same reason. The PSSA tab gains a
 *     two-page bar (Allocation & DAL | System Requirements), and the PSSA tab is the active one
 *     on both pages.
 *   - Neither FHA area offers requirements any more.
 *
 * Run: node tests/regression_requirements_in_pasa_pssa_20261021.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const idx = S('index.html'), helpers = S('helpers_modules.js'), ui = S('ui_constants.js'), sup = S('support_modules.js'), misc = S('misc_fn_modules.js'), sl = S('safety_lab.js');

console.log('\n[afha -> pasa] aircraft requirements');
const acHeader = idx.slice(idx.indexOf('id="ac-workspace-header"'), idx.indexOf('id="view-ac-func"'));
check('the Aircraft Safety (AFHA) tabs no longer offer requirements', acHeader.length > 0 && !/ac-ws-tab-req|switchTab\('ac-req'\)/.test(acHeader));
check('the AFHA area tab bar (prove_tabs) no longer carries requirements', require('../site/prove_tabs.js').AREAS.every(a => a.label !== 'AFHA' || a.tabs.every(x => x.t !== 'ac-req')) && require('../site/prove_tabs.js').AREAS.every(a => a.tabs.every(x => x.t !== 'ac-req')));
check('the AFHA tab map no longer lists ac-req', !/'ac-req'\s*:/.test(ui));
check('the AFHA tab highlighter no longer lists req', /\['func','fcim','fha','asm'\]\.forEach\(s => \{\s*const btn = document\.getElementById\('ac-ws-tab-'/.test(helpers));
const pasaNav = idx.slice(idx.indexOf('id="pasa-subnav"'), idx.indexOf('</div>', idx.indexOf('id="pasa-subnav"')));
check('the PASA tab bar offers Aircraft Requirements', /id="pasa-tab-req" onclick="switchTab\('ac-req'\)"/.test(pasaNav));
check('every other PASA tab opens the PASA first (the bar also shows above the requirements)', ['cockpit', 'interdep', 'mac', 'mfms', 'coffe'].every(k => new RegExp('id="pasa-tab-' + k + '"[^>]*onclick="pasaGo\\(\'' + k + '\'\\)"').test(pasaNav)));
check('pasaGo opens the PASA when it is not on screen, then the page', /function pasaGo\(name\) \{[\s\S]{0,200}if \(cur !== 'pasa' && typeof switchTab === 'function'\) switchTab\('pasa'\);\s*pasaSub\(name\);/.test(misc) && /window\.pasaGo = pasaGo;/.test(sl));
check('the sidebar lists Aircraft requirements under the PASA group', (() => { const a = idx.indexOf('id="asb-grp-pasa"'), b = idx.indexOf('id="asb-grp-asa"'), r = idx.indexOf('id="snav-ac-req"'); return a > 0 && r > a && r < b; })());
check('the sidebar opens the PASA group for it, not the AFHA group', /inAfha = cur\.indexOf\('ac-'\) === 0 && cur !== 'ac-req'/.test(helpers) && /inPasa = \['pasa','ac-req',/.test(helpers));
check('switchTab moves the PASA bar on every tab change', /_syncPasaNav\(tabId\)/.test(sup));
check('ac-req stays a real tab (locks, saves, deep links key on it)', /'ac-req'/.test(sup.slice(sup.indexOf("const tabs = ['dashboard'"), sup.indexOf("const tabs = ['dashboard'") + 400)) && /id="view-ac-req"/.test(idx));

console.log('\n[sfha -> pssa] system requirements');
const wsNav = idx.slice(idx.indexOf('<button id="ws-tab-func"'), idx.indexOf('id="ws-pssa-subnav"'));
check('the system tabs no longer offer System Requirements beside the SFHA', wsNav.length > 0 && !/ws-tab-req|switchWorkspaceTab\('req'\)/.test(wsNav));
check('the PSSA has a two-page bar: Allocation & DAL, System Requirements',
  /id="ws-pssa-tab-overview" onclick="switchWorkspaceTab\('pssa'\)"/.test(idx) && /id="ws-pssa-tab-req" onclick="switchWorkspaceTab\('req'\)"/.test(idx));
check('switchWorkspaceTab keeps req as a sub-tab and syncs the PSSA bar', /const tabs = \['func', 'fcim', 'fha', 'req', 'asm', 'fmea', 'pssa'\];/.test(helpers) && /_syncWsPssaNav\(subTab\);/.test(helpers));

console.log('\n[behaviour] the bars, on a small DOM');
{
  // a minimal DOM: just what the two functions touch
  class El {
    constructor(id, tag) { this.id = id || ''; this.tagName = (tag || 'div').toUpperCase(); this.children = []; this.parentNode = null; this.style = {}; this._cls = new Set(); const me = this;
      this.classList = { add: c => me._cls.add(c), remove: c => me._cls.delete(c), contains: c => me._cls.has(c), toggle: (c, on) => { if (on === undefined) on = !me._cls.has(c); if (on) me._cls.add(c); else me._cls.delete(c); return on; } }; }
    appendChild(c) { return this.insertBefore(c, null); }
    insertBefore(c, ref) { if (c.parentNode) c.parentNode.children.splice(c.parentNode.children.indexOf(c), 1); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c.parentNode = this; return c; }
    get nextElementSibling() { const p = this.parentNode; if (!p) return null; const k = p.children; for (let i = k.indexOf(this) + 1; i < k.length; i++) if (!k[i].comment) return k[i]; return null; }
    get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.children.indexOf(this); return p.children[i + 1] || null; }
    get previousSibling() { const p = this.parentNode; if (!p) return null; const i = p.children.indexOf(this); return i > 0 ? p.children[i - 1] : null; }
    querySelectorAll(sel) { const out = []; const walk = n => n.children.forEach(c => { if (sel === 'button' && c.tagName === 'BUTTON') out.push(c); walk(c); }); walk(this); return out; }
  }
  const all = {};
  const mk = (id, tag, parent) => { const e = new El(id, tag); if (id) all[id] = e; if (parent) parent.appendChild(e); return e; };
  const body = mk('body');
  const viewPasa = mk('view-pasa', 'div', body); mk('', 'h3', viewPasa);
  const nav = mk('pasa-subnav', 'div', viewPasa);
  ['cockpit', 'interdep', 'mac', 'mfms', 'coffe', 'req'].forEach(k => mk('pasa-tab-' + k, 'button', nav));
  mk('pasa-sub-cockpit', 'div', viewPasa);
  const viewReq = mk('view-ac-req', 'div', body);
  const ws = mk('ws', 'div', body);
  ['func', 'fcim', 'fha', 'fmea', 'asm', 'pssa'].forEach(k => mk('ws-tab-' + k, 'button', ws));
  const bar = mk('ws-pssa-subnav', 'div', ws); mk('ws-pssa-tab-overview', 'button', bar); mk('ws-pssa-tab-req', 'button', bar);
  const document = { getElementById: id => all[id] || null, createComment: t => { const c = new El('', '#comment'); c.comment = t; return c; } };
  // the real functions, taken from helpers_modules.js
  const a = helpers.indexOf('let _pasaNavHome = null;'), b = helpers.indexOf('function switchWorkspaceTab(subTab) {');
  const ctx = { document }; vm.createContext(ctx);
  let loaded = a > 0 && b > a;
  try { vm.runInContext(helpers.slice(a, b) + '\nthis._syncPasaNav = _syncPasaNav; this._syncWsPssaNav = _syncWsPssaNav;', ctx); } catch (e) { loaded = false; console.log('  (' + e.message + ')'); }
  check('the two functions load on their own', loaded && typeof ctx._syncPasaNav === 'function');
  if (loaded) {
    ctx._syncPasaNav('ac-req');
    check('on the requirements page the PASA bar sits right above it', nav.parentNode === body && nav.nextElementSibling === viewReq);
    check('with Aircraft Requirements the only active PASA tab', all['pasa-tab-req'].classList.contains('active') && !all['pasa-tab-cockpit'].classList.contains('active'));
    ctx._syncPasaNav('ac-req');
    check('showing it twice does not move it twice', nav.nextElementSibling === viewReq && body.children.filter(c => c === nav).length === 1);
    ctx._syncPasaNav('pasa');
    check('on the PASA the bar is back in its own place', nav.parentNode === viewPasa && viewPasa.children.indexOf(nav) === 2 && !all['pasa-tab-req'].classList.contains('active'));
    ctx._syncPasaNav('fta');
    check('another tab leaves it home', nav.parentNode === viewPasa);
    ctx._syncWsPssaNav('req');
    check('system requirements: the PSSA bar shows, PSSA tab active, requirements page active',
      bar.style.display === '' && all['ws-tab-pssa'].classList.contains('active') && all['ws-pssa-tab-req'].classList.contains('active') && !all['ws-pssa-tab-overview'].classList.contains('active'));
    ctx._syncWsPssaNav('pssa');
    check('PSSA overview: same bar, overview active', bar.style.display === '' && all['ws-pssa-tab-overview'].classList.contains('active') && !all['ws-pssa-tab-req'].classList.contains('active'));
    ctx._syncWsPssaNav('fha');
    check('the SFHA: no PSSA bar, PSSA tab not active', bar.style.display === 'none' && !all['ws-tab-pssa'].classList.contains('active'));
  }
}
check('no em dashes in what this change added', [helpers.slice(helpers.indexOf('let _pasaNavHome'), helpers.indexOf('function switchWorkspaceTab(subTab) {')), misc.slice(misc.indexOf('function pasaGo'), misc.indexOf('function pasaSub')), idx.slice(idx.indexOf('id="ws-pssa-subnav"') - 300, idx.indexOf('id="ws-view-pssa"')), idx.slice(idx.indexOf('id="snav-ac-req"') - 200, idx.indexOf('id="snav-ac-req"') + 300)].every(t => t.indexOf(String.fromCharCode(0x2014)) < 0));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
