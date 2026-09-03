#!/usr/bin/env node
/*
 * Regression: cross-tree event awareness + reuse (build 66.17).
 *
 * Franksley Paganini (Mannarino), demo 18 Aug 2026, relayed by Waqas:
 *   "how do I know this event, node of the tree is being used elsewhere, how does
 *    it get flagged to me, or even an event exists elsewhere in the tool how do I
 *    become aware of that"
 *
 * BEFORE: repeatedEventGroups() walks getActiveFTARoot() ONLY — an event repeated
 * inside one tree was flagged (amber id, tooltip, "common-mode ×N"), but the same
 * event used in ANOTHER tree produced no signal at all. addSelectedEvent() minted a
 * fresh logicalId with no lookup, so a duplicate of an event two trees over was
 * silent. Waqas's ruling on the fix: inline suggestions, PLUS a menu scoped by the
 * interdependence table and the system's own trees — "what can possibly be consumed
 * here".
 *
 * Loads the REAL site/event_reuse.js. Run: node tests/regression_event_reuse.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

// --- a miniature project: two system trees + an aircraft tree + a verification twin
function ev(id, name, lid) { return { id: id, logicalId: lid == null ? id : lid, name: name, type: 'basic', children: [] }; }
function gate(id, kids) { return { id: id, type: 'gate', gateType: 'OR', children: kids }; }
function makeProject() {
  return [
    { id: 'pg-fcs', name: 'PSSA · FCS loss of pitch', treeLevel: 'system', systemId: 'sys-fcs',
      linkedFhaIds: ['1'], root: gate(1, [ev(10, 'Elevator actuator lane A fails'), ev(11, '28V DC bus 1 lost')]) },
    { id: 'pg-fcs-v', name: 'PSSA · FCS loss of pitch (Verification)', treeLevel: 'system', systemId: 'sys-fcs',
      verifies: 'pg-fcs', root: gate(2, [ev(20, 'Elevator actuator lane A fails', 10)]) },
    { id: 'pg-eps', name: 'PSSA · Total loss of electrical power', treeLevel: 'system', systemId: 'sys-eps',
      root: gate(3, [ev(30, '28V DC bus 1 lost', 11), ev(31, 'TRU 1 fails')]) },
    { id: 'pg-hyd', name: 'PSSA · Total loss of hydraulic power', treeLevel: 'system', systemId: 'sys-hyd',
      root: gate(4, [ev(40, 'Engine-driven pump 1 fails')]) },
    { id: 'pg-ac', name: 'PASA · FC-01 loss of pitch control', treeLevel: 'aircraft',
      root: gate(5, [ev(50, 'Aircraft-level pitch loss')]) }
  ];
}

// Load the real module with the globals it reads.
function load(pages, contributors) {
  const src = read('event_reuse.js');
  const sandbox = {
    ftaPages: pages,
    activeFTAPageId: 'pg-fcs',
    acFhaData: [{ internalId: '1', fcId: 'FC-01' }],
    systemsData: [{ id: 'sys-fcs' }, { id: 'sys-eps' }, { id: 'sys-hyd' }],
    idpContributors: function () { return contributors; }
  };
  const win = {};
  new Function('window', 'ftaPages', 'activeFTAPageId', 'acFhaData', 'systemsData', 'idpContributors', src)(
    win, sandbox.ftaPages, sandbox.activeFTAPageId, sandbox.acFhaData, sandbox.systemsData, sandbox.idpContributors);
  return win.SLEventReuse;
}

const pages = makeProject();
const RU = load(pages, ['sys-eps']);          // interdependence says EPS contributes to FC-01

console.log('\n[1] The index sees the WHOLE project, not just the active tree');
{
  const idx = RU.index();
  // 7 event nodes across 5 pages, but only 5 DISTINCT logical events — the two
  // shared ones (lid 10 in the verification twin, lid 11 in the EPS tree) collapse.
  let entries = 0; idx.byLid.forEach(function (a) { entries += a.length; });
  check('all 7 event nodes are indexed', entries === 7, 'entries=' + entries);
  check('...collapsing to 5 distinct logical events', idx.byLid.size === 5, 'size=' + idx.byLid.size);
  check('the shared bus event is found on two pages', (idx.byLid.get(11) || []).length === 2);
  check('gates are not indexed as events', !idx.byLid.has(1) && !idx.byLid.has(3));
}

console.log('\n[2] "Used elsewhere" — the question that had no answer before');
{
  const busInFcs = pages[0].root.children[1];          // 28V DC bus 1 lost, lid 11
  const u = RU.usage(busInFcs, 'pg-fcs');
  check('the shared event reports another tree', u.elsewhere.length === 1, JSON.stringify(u.elsewhere.map(e => e.pageName)));
  check('and names it', u.elsewhere[0].pageName === 'PSSA · Total loss of electrical power');
  const actuator = pages[0].root.children[0];         // lid 10, mirrored in the verification twin
  const u2 = RU.usage(actuator, 'pg-fcs');
  check('a verification twin is NOT reported as a common-mode finding', u2.elsewhere.length === 0);
  check('...it is reported separately as a mirror', u2.mirrors.length === 1);
  const lonely = pages[3].root.children[0];
  check('an event used once reports nothing', RU.usage(lonely, 'pg-hyd').elsewhere.length === 0);
}

console.log('\n[3] Consumable here — scoped by interdependence, not "everything"');
{
  const cons = RU.consumableHere('pg-fcs');
  const names = cons.map(c => c.name);
  check('offers the contributing system\'s events (EPS contributes per the table)',
    names.indexOf('TRU 1 fails') >= 0, names.join(' | '));
  check('offers aircraft-level events', names.indexOf('Aircraft-level pitch loss') >= 0);
  check('does NOT offer a non-contributing system (hydraulics)',
    names.indexOf('Engine-driven pump 1 fails') < 0, names.join(' | '));
  check('does NOT re-offer what this tree already has',
    names.indexOf('28V DC bus 1 lost') < 0 && names.indexOf('Elevator actuator lane A fails') < 0);
  check('the verification twin is never a source', cons.every(c => c.pageId !== 'pg-fcs-v'));
  check('each candidate says WHY it is offered', cons.every(c => !!c.reason));
  // widen the interdependence answer and hydraulics becomes legitimate
  const RU2 = load(makeProject(), ['sys-eps', 'sys-hyd']);
  check('a system that starts contributing appears',
    RU2.consumableHere('pg-fcs').map(c => c.name).indexOf('Engine-driven pump 1 fails') >= 0);
}

console.log('\n[4] Name matching — conservative on purpose');
{
  const m = RU.nameMatches('28V  DC BUS 1 LOST.', 'pg-fcs');
  check('punctuation/case/spacing differences still match', m.length >= 1, JSON.stringify(m.map(x => x.name)));
  check('it points at the other tree', m[0].pageName === 'PSSA · Total loss of electrical power');
  check('short fragments do not fire', RU.nameMatches('bus', 'pg-fcs').length === 0);
  check('an unrelated name finds nothing', RU.nameMatches('rotor burst penetrates the hold', 'pg-fcs').length === 0);
  check('normalisation strips filler words', RU.normName('Loss of the pump') === 'loss pump', RU.normName('Loss of the pump'));
}

console.log('\n[5] Adoption copies IDENTITY only — never a number');
{
  const p2 = makeProject();
  const RU3 = load(p2, ['sys-eps']);
  const target = { id: 99, logicalId: 99, name: 'New Event', type: 'basic', probability: 0.5, lambda: 1e-3 };
  RU3.adopt(target, 11, '28V DC bus 1 lost');
  check('logicalId adopted', target.logicalId === 11);
  check('name adopted', target.name === '28V DC bus 1 lost');
  check('probability untouched — the strictest-propagation pass owns that', target.probability === 0.5);
  check('lambda untouched', target.lambda === 1e-3);
}

console.log('\n[6] The panel block and the new-event weight stamp');
{
  const view = read('fta_view_modules.js');
  check('the panel renders the usage line', /function slRenderEventReuse\(/.test(view));
  check('it is refreshed when a node is selected', /syncWeightSliderFromNode\(\); if \(typeof slRenderEventReuse/.test(view));
  check('jumping to another tree marks the landing', /_slHighlightFtaNode\(nid, '◀ SAME EVENT'\)/.test(view));
  check('adoption is offered from BOTH the name matches and the consumable menu',
    /sl-ev-adopt/.test(view) && /consumableHere\(\)/.test(view));
  const helpers = read('helpers_modules.js');
  check('a new event no longer stamps weight: 1', !/name: `New Event`, type: et, probability: 0, lambda: 0\.0001, weight: 1/.test(helpers));
  check('...it takes the equal share of its group instead',
    /_rebalanceSiblingWeights\(nn, _sibs, 100 \/ _sibs\.length\)/.test(helpers));
  // "do not mess up the rebalancing trying to fix something else" — Waqas, 19 Aug.
  // In bottom-up, weights are not read at all; rewriting a group's apportionment
  // there is a silent edit to allocation data the user is not looking at.
  check('weights are only touched in top-down mode',
    /const _tdown = \(typeof ftaConfig !== 'undefined' && ftaConfig && ftaConfig\.mode === 'top-down'\)/.test(helpers) &&
    /if \(_tdown && _sibs\.length > 1/.test(helpers));
  check('a bottom-up insert leaves the weight unset for seedTopDownWeights to fill',
    /seedTopDownWeights\(\) was built for/.test(helpers));
  const html = read('index.html');
  check('the module is loaded before the view that calls it',
    html.indexOf('event_reuse.js') > 0 && html.indexOf('event_reuse.js') < html.indexOf('fta_view_modules.js'));
  check('the panel has somewhere to render', /id="config-event-usage"/.test(html) && /id="config-event-suggest"/.test(html));
  // Phase 66.20 — found by looking at it live: nested inside the flex:3 name cell the
  // prose rendered as a ~140px tall ribbon. It needs its own full-width row.
  check('the notices sit on their own full-width row, not inside the name field cell',
    /id="config-event-notice-row"[^>]*flex-basis:100%/.test(html) &&
    html.indexOf('id="config-event-usage"') > html.indexOf('id="config-event-notice-row"'));
  check('...and are no longer children of config-name-container',
    !/id="config-name-container"[\s\S]{0,400}id="config-event-usage"/.test(html));
  // Phase 66.21/66.22 — flex-basis:100% was not enough. The field row it lived in is
  // display:flex with NO flex-wrap, so a 100% basis cannot break to a new line: the item
  // just shrinks against its siblings and hugs the left edge. The notices have to be a
  // sibling of that row, not a child of it. They now sit at the foot of the panel.
  const _fieldRow = html.indexOf('<div style="display: flex; gap: 15px; align-items: flex-end;">');
  const _noticeRow = html.indexOf('id="config-event-notice-row"');
  const _extsrcEnd = html.indexOf('id="config-extsrc-status"');
  check('the notices are NOT inside the un-wrapped field row', _noticeRow > _fieldRow &&
    _noticeRow > html.indexOf('id="config-voting-container"'));
  check('the notices are the last block in the node-config panel',
    _extsrcEnd > 0 && _noticeRow > _extsrcEnd);
  check('the panel header names what it edits — a gate or an event, not "node hierarchy"',
    /Gate\/Event Properties: <span id="config-node-id">/.test(html) &&
    !/Configure Node Hierarchy/.test(html));
  check('the prose is allowed to wrap rather than overflow',
    /id="config-event-usage"[^>]*overflow-wrap:anywhere/.test(html) &&
    /id="config-event-suggest"[^>]*overflow-wrap:anywhere/.test(html));
  const _css = read('safety_lab.css');
  check('an event with nothing to say draws no stray divider',
    /#config-event-notice-row > div:empty \{\s*display: none;/.test(_css));
  check('the notice block is full width in CSS as well as inline',
    /#config-event-notice-row \{ width: 100%; \}/.test(_css));
}

console.log('\n[7] The node-properties drawer is wide enough to read (66.18)');
{
  const css = read('safety_lab.css');
  const view = read('fta_view_modules.js');
  const m = css.match(/#node-config-panel\.is-modal \{[\s\S]*?width: min\((\d+)px/);
  const w = m ? parseInt(m[1], 10) : 0;
  check('the drawer default is at least 700px', w >= 700, 'width=' + w);
  check('it still yields on a narrow viewport', /calc\(100vw - 24px\)/.test(css));
  const mx = view.match(/function _nodeDrawerMaxW\(\) \{ return Math\.min\((\d+),/);
  const max = mx ? parseInt(mx[1], 10) : 0;
  check('the drag ceiling is above the new default', max > w, 'max=' + max + ' default=' + w);
  check('the 96%-of-viewport clamp survives', /\* 0\.96\)/.test(view));
  check('a width saved under the OLD 520 default is dropped, not honoured forever',
    /if \(w <= 520\) \{ try \{ localStorage\.removeItem\(NODE_DRAWER_WIDTH_KEY\)/.test(view));
  check('a deliberately WIDER saved width is still honoured',
    /w = Math\.max\(NODE_DRAWER_MIN_W, Math\.min\(_nodeDrawerMaxW\(\), w\)\)/.test(view));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : fail + ' FAILED, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);
