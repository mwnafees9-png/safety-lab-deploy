#!/usr/bin/env node
/*
 * Regression — the node-identity editor: one renderer, two mounts. Build 66.33.
 * Spec: BUILD_SPEC_Structured_Nodes_and_Bucketing.md §A, OPEN_ITEMS C1b / A11.
 *
 * Waqas: "user clicks add gate/add event, we give them a pop modal ... 1 select
 * system, 2 select system function, 3 failure condition", and "the same modal that
 * pops up on node creation should be embedded in the side gate/event property panel
 * for future modifications".
 *
 * This suite is markup + wiring, on purpose. The RULES live in node_identity.js and
 * are executed by regression_node_identity.test.js; what can go wrong here is the
 * plumbing — two copies of the form drifting apart, a dropdown that blocks work, an
 * escape hatch nobody can find, a creation path that refuses to create. Those are
 * exactly the failures that only ever show up in front of a customer, which is why
 * they are asserted rather than eyeballed.
 *
 * Run: node tests/regression_node_identity_ui.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const ui = read('node_identity_ui.js');
const idx = read('index.html');
const helpers = read('helpers_modules.js');
const view = read('fta_view_modules.js');

console.log('\n[0] IT ACTUALLY RENDERS — the editor is built in a VM and the markup parsed');
{
  /* 19 Aug 2026, second escape in one night, same shape as the first.
     Every select was emitted as
         <select onchange="slNodeIdentitySet("kind", this.value)">
     — double quotes inside a double-quoted HTML attribute. The attribute terminates at
     `slNodeIdentitySet(`, the browser silently discards the malformed handler, and the
     dropdown does nothing when you change it. Waqas: "it only gives you 1 drop down
     option to select failure type for gates nothing more." The kind select rendered; it
     just could never advance to the next question.

     Forty-five string assertions passed over that markup. They were reading the SOURCE,
     not the OUTPUT. So this section builds the real thing in a VM with stubbed globals
     and inspects the generated HTML — attribute quoting, handler wiring, the option
     lists actually offered. Static checks cannot see a broken attribute; this can. */
  const vm = require('vm');
  const uiSrc = read('node_identity_ui.js');
  const NIsrc = read('node_identity.js');

  function build(node, env) {
    const win = {};
    const sandbox = { window: win, document: { getElementById: () => null }, Map, Set, Date, JSON, Math, console };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(NIsrc, sandbox);                       // real rules module
    win.SLEnv = { get: n => env[n], report: () => ({}) };  // the bridge, stubbed
    vm.runInContext(uiSrc, sandbox);
    return win.slNodeIdentityHtmlFor(node);
  }

  const ENV = {
    ftaPages: [{ id: 'pg', name: 'PASA', root: null, treeLevel: 'aircraft', linkedFhaIds: [7] }],
    activeFTAPageId: 'pg',
    systemsData: [
      { id: 'fcs', name: 'Flight Control System', functions: [{ internalId: 1, funcId: 'F-FCS-1', funcName: 'Provide pitch control' }], fha: [{ internalId: 3, fcId: 'FC-1', fcDesc: 'Total loss of pitch', severity: 'Catastrophic' }] },
      { id: 'eps', name: 'Electrical Power System', functions: [], fha: [] }
    ],
    acFhaData: [{ internalId: 7, fcId: 'AC-1', fcDesc: 'Loss of pitch attitude control', severity: 'Catastrophic' }],
    acFunctionsData: [], itemsData: [{ internalId: 1, itemId: 'IT-1', name: 'Actuator lane A', systemId: 'fcs' }],
    resourcesData: [{ internalId: 1, resId: 'RES-1', name: '28V DC bus 1', providedBy: ['eps'] }],
    idpContributors: () => ['fcs', 'eps']
  };
  ENV.ftaPages[0].root = { id: 1, type: 'gate', children: [] };

  // --- every event handler attribute must be WELL FORMED -------------------
  // An attribute value may not contain a bare double quote. This is the exact
  // defect, expressed as a property rather than as a string match.
  function badAttrs(html) {
    const bad = [];
    const re = /\son(?:change|click|input)="([^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const v = m[1];
      // A truncated handler is the tell: unbalanced parens, or a trailing '(' .
      const opens = (v.match(/\(/g) || []).length, closes = (v.match(/\)/g) || []).length;
      if (opens !== closes) bad.push(v);
    }
    // Also catch the raw shape directly: a quote immediately after an opening paren.
    if (/on\w+="[^"]*\("/.test(html)) bad.push('handler contains an unescaped double quote');
    return bad;
  }

  const kinds = ['functional', 'item', 'resource', 'human', 'external', 'devError', 'undeveloped'];
  let allBad = [];
  kinds.forEach(k => {
    const node = { id: 9, type: 'basic', name: 'n', identity: { kind: k, systemId: 'fcs', resourceId: 'RES-1' }, children: [] };
    allBad = allBad.concat(badAttrs(build(node, ENV)));
  });
  allBad = allBad.concat(badAttrs(build({ id: 9, type: 'basic', name: 'n', identity: null, children: [] }, ENV)));
  check('every generated handler attribute is well formed, for every kind',
    allBad.length === 0, allBad.slice(0, 3).join(' | '));

  // --- the handlers are actually wired to the setter ------------------------
  const undeclared = build({ id: 9, type: 'basic', name: 'n', identity: null, children: [] }, ENV);
  check('the kind select carries a working onchange',
    /<select id="ni-kind"[^>]*onchange="slNodeIdentitySet\('kind', this\.value\)"/.test(undeclared),
    (/(<select id="ni-kind"[^>]*>)/.exec(undeclared) || [])[1]);

  // --- progressive disclosure actually progresses ---------------------------
  const declared = build({ id: 9, type: 'basic', name: 'n', identity: { kind: 'functional', systemId: 'fcs' }, children: [] }, ENV);
  check('declaring a kind reveals the System question', /id="ni-system"/.test(declared));
  check('...and the System function question', /id="ni-function"/.test(declared));
  check('...and the Failure condition question', /id="ni-fc"/.test(declared));
  check('an undeclared node shows ONLY the kind question', !/id="ni-system"/.test(undeclared));

  // --- a GATE is a function failure or it is logic. Never an item. ----------
  const gate = build({ id: 9, type: 'gate', name: 'g', identity: null, children: [] }, ENV);
  const gateOpts = (gate.match(/<select id="ni-kind"[\s\S]*?<\/select>/) || [''])[0];
  check('a gate is not offered "Item failure"', !/Item failure/.test(gateOpts), gateOpts.slice(0, 200));
  check('a gate is not offered "Interface / common resource"', !/Interface \/ common resource/.test(gateOpts));
  check('a gate IS offered "Functional failure"', /Functional failure/.test(gateOpts));
  check('a gate\'s empty option says it is logic that inherits',
    /logic only, inherits from above/.test(gateOpts));
  check('an EVENT still gets the full list',
    /Item failure/.test(undeclared) && /Interface \/ common resource/.test(undeclared) &&
    /Development error/.test(undeclared));

  // --- the targeted system list, rendered -----------------------------------
  const sysSel = (declared.match(/<select id="ni-system"[\s\S]*?<\/select>/) || [''])[0];
  check('the system list is the interdependence contributors, not all systems',
    /Flight Control System/.test(sysSel) && /Electrical Power System/.test(sysSel));
  check('the escape hatch is the LAST option in the list',
    /\+ another system…<\/option>\s*<\/select>/.test(sysSel), sysSel.slice(-160));

  // --- resource branch: provider auto-offered from the register --------------
  const resNode = build({ id: 9, type: 'basic', name: 'r', identity: { kind: 'resource', resourceId: 'RES-1' }, children: [] }, ENV);
  check('a chosen resource offers its declared provider', /Electrical Power System\s*\(declared provider\)/.test(resNode),
    (/(<select id="ni-provider"[\s\S]*?<\/select>)/.exec(resNode) || [])[1]);

  // --- an EMPTY register must not read like a NARROWED list ------------------
  // Waqas, on the live build: "why are no systems, their functions or their failure
  // conditions showing". Because that project has none. The panel said "the list
  // cannot be narrowed", which is true and useless.
  const EMPTY = Object.assign({}, ENV, { systemsData: [], acFhaData: [], itemsData: [], resourcesData: [] });
  const emptyHtml = build({ id: 9, type: 'basic', name: 'n', identity: { kind: 'functional' }, children: [] }, EMPTY);
  check('an empty systems register says so, and where to fix it',
    /No systems defined in this project/.test(emptyHtml) && /Systems workspace/.test(emptyHtml));
  check('...and the dropdown placeholder says it too, not "select system"',
    /— no systems defined —/.test(emptyHtml));
  check('...and the "+ another system" escape is hidden when there is nothing to escape FROM',
    !/\+ another system/.test(emptyHtml));
  const NOFC = Object.assign({}, ENV, { ftaPages: [{ id: 'pg', name: 'PASA', root: { id: 1, type: 'gate', children: [] }, treeLevel: 'aircraft' }] });
  check('with systems present but no linked FC, it says it is showing ALL of them',
    /Showing all 2 systems/.test(build({ id: 9, type: 'basic', identity: { kind: 'functional' }, children: [] }, NOFC)));
  check('the function list tells you to pick a system first',
    /select a system first/.test(build({ id: 9, type: 'basic', identity: { kind: 'functional' }, children: [] }, ENV)));
  check('a system with no functions offers creation instead of an empty list',
    /none defined for this system/.test(build({ id: 9, type: 'basic', identity: { kind: 'functional', systemId: 'eps' }, children: [] }, ENV)));

  // --- the canvas name is a line, not a disabled input -----------------------
  const named = build({ id: 9, type: 'basic', identity: { kind: 'item', systemId: 'fcs', itemId: 'IT-1', effectId: 'no output' }, children: [] }, ENV);
  check('the rendered panel carries no name field and no override',
    !/Name on the canvas/.test(named) && !/Reads as/.test(named) && !/slNodeIdentityOverride/.test(named));
}

console.log('\n[1] ONE renderer, TWO mounts — the copies cannot drift');
{
  check('there is exactly one markup builder', (ui.match(/^\s*function html\(node\)/m) || []).length === 1);
  check('the drawer mount uses it', /config-identity-host[\s\S]{0,200}innerHTML = node \? html\(node\) : ''/.test(ui));
  check('the creation dialog mounts the SAME builder',
    /ni-modal-body[\s\S]{0,160}innerHTML = html\(node\)/.test(ui));
  check('both hosts exist in the document',
    /id="config-identity-host"/.test(idx) && /id="ni-modal-body"/.test(idx));
  check('the drawer asks "what is this node?" BEFORE the old field row',
    idx.indexOf('id="config-identity-host"') < idx.indexOf('id="config-field-row"'));
  check('selectNode renders it', /slRenderNodeIdentity\(\)/.test(view));
  check('...guarded, so a missing module cannot break node selection',
    /try \{ if \(typeof slRenderNodeIdentity === 'function'\) slRenderNodeIdentity\(\); \} catch/.test(view));
}

console.log('\n[2] Systems are PICKED, and the list is short and targeted (A11)');
{
  check('a system tree LOCKS the system rather than offering a list',
    /if \(page\.systemId\)[\s\S]{0,200}source: 'system-tree'/.test(ui));
  check('an aircraft tree narrows to the FC\'s interdependence contributors',
    /idpContributors\(fc\)/.test(ui) && /source: 'interdependence'/.test(ui));
  check('systems already used in this tree are offered first',
    /list\.sort\(function \(a, b\) \{ return \(used\[b\.id\] \? 1 : 0\) - \(used\[a\.id\] \? 1 : 0\); \}\)/.test(ui));
  check('a page with no linked failure condition SAYS so instead of silently listing all 20',
    /no-linked-fc/.test(ui) && /cannot be narrowed/.test(ui));
  check('a linked FC with no recorded contributors also says so',
    /no-contributors/.test(ui) && /no interdependence contributors\s*' \+\s*'are recorded|no interdependence contributors/.test(ui));
  // The escape hatch must be IN the dropdown. A short list with a hidden escape is a
  // funnel — people force the nearest wrong pick rather than go looking.
  check('the escape hatch is the last entry in the dropdown itself',
    /opts\.push\(\{ id: MORE, name: '\+ another system…' \}\)/.test(ui));
  check('...and taking it explains what to do rather than silently widening the list',
    /not a recorded contributor[\s\S]{0,120}interdependence table/.test(ui));
}

console.log('\n[3] Creating costs the same as picking');
{
  ['functionId', 'fcId', 'itemId'].forEach(f => {
    check('inline create exists for ' + f, new RegExp("kind === '" + f + "'").test(ui));
  });
  check('every "+ new …" is an option in the same control, not a detour',
    (ui.match(/\{ id: NEW, name: '\+ new /g) || []).length >= 3);
  check('a new function is written into the SELECTED system, not a global bucket',
    /sys\.functions\.push\(/.test(ui) && /find\(function \(s\) \{ return s\.id === id\.systemId; \}\)/.test(ui));
  check('a cancelled create leaves the field untouched and re-renders',
    /if \(!made\) \{ render\(\); return; \}/.test(ui));
}

console.log('\n[4] Nothing blocks the work — findings hold up closure instead');
{
  check('creation happens FIRST; the dialog only asks afterwards',
    /calculateAllProbabilities\(\); updateD3\(\);\s*\n\s*\/\/ Phase 66\.33[\s\S]{0,900}slOpenNodeIdentityModal\(\)/.test(helpers));
  check('both add paths open it', (helpers.match(/slOpenNodeIdentityModal\(\)/g) || []).length === 2);
  check('the dialog is dismissible with "Later"', /Later<\/button>/.test(idx));
  check('the identity hook is fully guarded — a failure cannot stop node creation',
    /try \{\s*\n\s*selectedNodeData = nn;[\s\S]{0,260}\} catch \(_\) \{\}/.test(helpers));
  check('an undeclared node explains itself rather than nagging',
    /cannot be owned, shared or traced, and it will hold up closure/.test(ui));
  check('findings are rendered with their severity, not as errors',
    /holds up closure/.test(ui) && /f\.severity === 'blocks-closure'/.test(ui));
}

console.log('\n[5] The name is derived, and an override is visible as one');
{
  // Waqas, 19 Aug: "you do not need name on the canvas, the name would be the failure
  // condition itself." The node has no name of its own — it points at a condition, and
  // that IS the name. No echo of it, and no override: an override would reintroduce the
  // drift the feature exists to prevent.
  check('there is no name field at all', !/Name on the canvas/.test(ui) && !/Reads as <b>/.test(ui));
  check('no override affordance is offered', !/slNodeIdentityOverride/.test(ui));
  check('the coordinate still drives node.name', /if \(d\.derived\) \{\s*\n\s*node\.name = d\.text;/.test(ui));
  check('changing the coordinate rewrites the node name and the canvas',
    /if \(d\.derived\) \{\s*\n\s*node\.name = d\.text;/.test(ui) && /updateD3/.test(ui));
  check('changing the system clears the now-invalid function, FC and item',
    /if \(fieldName === 'systemId'\) \{ delete node\.identity\.functionId; delete node\.identity\.fcId; delete node\.identity\.itemId; \}/.test(ui));
}

console.log('\n[6] Resource nodes carry the provider/consumer split into the UI');
{
  check('resources are picked from the register, not typed',
    /select common resource/.test(ui) && /field\('Common resource'/.test(ui) &&
    !/Common resource[\s\S]{0,120}<input type="text"/.test(ui));
  check('the register\'s declared provider is offered and marked',
    /declared provider/.test(ui) && /chosen\.providedBy/.test(ui));
  check('a single declared provider is filled in automatically',
    /if \(r && r\.providedBy && r\.providedBy\.length === 1\) node\.identity\.providerSystemId = r\.providedBy\[0\]/.test(ui));
  check('the UI states the one-L3 rule rather than leaving it to be inferred',
    /ONE probabilistic requirement[\s\S]{0,180}not a copy of the same number/.test(ui));
  check('an empty register says where to add one', /add them in the Resources view/.test(ui));
}

console.log('\n[7] Allocation vs verification stays honest');
{
  check('on an allocation tree the item asks for an EFFECT',
    /Effect — what it fails to do/.test(ui));
  check('...and says modes live on the mirror',
    /Allocation stops at the item and its effect\. Failure modes and their rates live on the verification mirror/.test(ui));
  check('on the mirror the effect is shown as inherited from the twin',
    /Effect \(inherited from the allocation twin\)/.test(ui));
}

console.log('\n[7b] State is read through SLEnv, NOT window — the silent-blank bug');
{
  /* 19 Aug 2026. The editor shipped and rendered NOTHING, with no error anywhere.
     Cause: the app keeps its state in top-level `let` declarations, which live in the
     GLOBAL LEXICAL ENVIRONMENT and are NOT properties of `window`. The lookup helper
     used `window[name]`, so `selectedNodeData`, `ftaPages`, `systemsData` and every
     other read came back undefined; render() wrote an empty string and the block was
     invisible. Waqas: "C1 didnt get shipped i didnt see a modal upon add gate/event."
     It had shipped — it just could not see anything.

     Same property made the earlier outage hard to read: `SUPABASE_PROJECT_URL` reported
     "not defined" rather than "undefined" for exactly this reason. `eval` would solve it
     and is blocked by the CSP, so SLEnv is a classic script that closes over the bare
     identifiers. */
  const env = read('sl_env.js');
  check('the UI reads through SLEnv first', /if \(window\.SLEnv\) return window\.SLEnv\.get\(name\)/.test(ui));
  check('...and the raw window lookup is only a fallback',
    /window\.SLEnv[\s\S]{0,140}return window\[name\]/.test(ui));
  check('the bug is recorded at the site of the fix, not just in a handoff',
    /THIS LINE WAS THE BUG/.test(ui));
  ['selectedNodeData', 'ftaPages', 'activeFTAPageId', 'systemsData', 'acFhaData',
   'itemsData', 'resourcesData', 'idpContributors'].forEach(n => {
    check('SLEnv exposes ' + n, new RegExp(n + ':\\s*function \\(\\) \\{ return ' + n + '; \\}').test(env));
  });
  check('each reader is individually guarded', /try \{ return r\(\); \} catch/.test(env));
  check('SLEnv loads AFTER the declarations it closes over',
    idx.indexOf('<script src="sl_env.js') > idx.indexOf('<script src="safety_lab.js'));
  check('report() exists for diagnosing a blank render', /function report\(\)/.test(env) && /MISSING/.test(env));
}

console.log('\n[8] Plumbing');
{
  check('the module is wired into index.html', /node_identity_ui\.js\?v=/.test(idx));
  // Compare the SCRIPT TAGS, not the first mention — a comment elsewhere in the
  // document names node_identity_ui.js long before the tag appears, which made the
  // first version of this check pass or fail for the wrong reason.
  check('...after the rules module it consumes',
    idx.indexOf('<script src="node_identity_ui.js?v=') > idx.indexOf('<script src="node_identity.js?v='));
  check('the creation dialog scroller is contained and can actually shrink',
    /id="ni-modal-body"[^>]*overscroll-behavior:contain/.test(idx) && /id="ni-modal-body"[^>]*min-height:0/.test(idx),
    'the two traps from the panel audit, not repeated in new markup');
  check('validation and ownership are NOT reimplemented here — one home for the rules',
    /window\.SLNodeIdentity/.test(ui) && !/function resolveOwner/.test(ui) && !/function crossesBoundary\s*\(/.test(ui));
  function pinAtLeast(doc, file, maj, min) {
    const m = new RegExp(file.replace('.', '\\.') + '\\?v=(\\d+)\\.(\\d+)').exec(doc);
    if (!m) return false;
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    return a > maj || (a === maj && b >= min);
  }
  check('helpers pin bumped for the creation hook', pinAtLeast(idx, 'helpers_modules.js', 2, 38));
  check('node_identity_ui pin bumped for the SLEnv fix', pinAtLeast(idx, 'node_identity_ui.js', 1, 3));
  check('fta_view pin bumped for the selectNode render', pinAtLeast(idx, 'fta_view_modules.js', 66, 30));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : 'RED — ' + fail + ' failed, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);
