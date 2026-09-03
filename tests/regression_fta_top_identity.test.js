#!/usr/bin/env node
/*
 * Regression — top-event identity (31 Aug 2026, Waqas: "top event id will be
 * the failure condition id from the FCIM and A/S FHA").
 *
 * The manual FHA-link path has honored this since Phase 57 (_fcTopGateDisplayId
 * returns the fcId verbatim). The AI synthesis apply did NOT: it named pages
 * from the model's free-text topEvent and stamped generic G-### ids on roots —
 * the 31 Aug pair run produced "SF-001-TL Complete loss..." next to
 * "Uncommanded roll motion..." on sibling pages. _applyTreeSuggestion now
 * derives page name / top name / top display id from the LINKED FHA ROW via
 * the same product helpers, deterministically. These checks execute the real
 * apply. Run: node tests/regression_fta_top_identity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const ai = S('ai_assistant.js'); const helpers = S('helpers_modules.js');
function fn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n2 = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n2 === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n2 === '/') { line = true; k++; continue; }
    if (c === '/' && n2 === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}
const srcs = [fn(helpers, '_fcTopGateName'), fn(helpers, '_fcTopGateDisplayId'), fn(helpers, '_fcPageName'), fn(ai, '_buildFtaTree'), fn(ai, '_applyTreeSuggestion')];
check('extracted the chain (_fc* helpers, _buildFtaTree, _applyTreeSuggestion)', srcs.every(Boolean));

function mk() {
  const ctx = {
    console, Date, Math, JSON, Array, String, Object,
    ftaPages: [], internalIdCounter: 100, activeFTAPageId: null, selectedNodeData: null,
    acFhaData: [ { internalId: 7, fcId: 'SF-004-TL', fcDesc: 'Complete loss of pitch trim authority in cruise and approach phases' } ],
    systemsData: [ { id: 'NAV', fha: [ { internalId: 9, fcId: 'NAV-FC-002', fcDesc: 'Loss of position source' } ] } ],
    generateDisplayId: (t) => (t === 'gate' ? 'G-' : 'BE-') + (ctx.internalIdCounter),
    _skillStampFor: () => 'fta.synthesize@v1#test', _toast: () => {},
    scheduleAutosave: () => {}, _aiConsistencyAutoCheck: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(srcs.join('\n') + '\nglobalThis.__apply = _applyTreeSuggestion;', ctx);
  return ctx;
}
const spec = { name: 'model-worded top', type: 'gate', gateType: 'OR', children: [{ name: 'leaf a' }, { name: 'leaf b' }] };

// 1. linked aircraft tree — identity comes from the ROW, not the model
let c = mk();
vm.runInContext('__apply(' + JSON.stringify({ root: spec, topEvent: 'Model free text about pitch trim', _kind: 'allocation', _systemId: '', _fhaInternalId: 7 }) + ')', c);
let p = c.ftaPages[0];
check('linked tree: top-event display id IS the FHA/FCIM fcId', p && p.root.displayId === 'SF-004-TL', p && p.root.displayId);
check('linked tree: page name leads with the fcId (product _fcPageName shape)', p && /^SF-004-TL — /.test(p.name), p && p.name);
check('linked tree: top-event NAME is the condition text, not model wording', p && /^Complete loss of pitch trim/.test(p.root.name), p && p.root.name);
check('linked tree: page carries linkedFhaId', p && p.linkedFhaId === 7);

// 2. system-scoped resolution
c = mk();
vm.runInContext('__apply(' + JSON.stringify({ root: spec, topEvent: 'x', _kind: 'allocation', _systemId: 'NAV', _fhaInternalId: 9 }) + ')', c);
p = c.ftaPages[0];
check('SFHA-linked tree resolves in THAT system\'s FHA', p && p.root.displayId === 'NAV-FC-002', p && p.root.displayId);

// 3. unlinked (standalone) keeps the old behavior — model text + generic id
c = mk();
vm.runInContext('__apply(' + JSON.stringify({ root: spec, topEvent: 'Standalone what-if tree', _kind: 'allocation', _systemId: '' }) + ')', c);
p = c.ftaPages[0];
check('standalone tree keeps the model topEvent as page name', p && p.name === 'Standalone what-if tree', p && p.name);
check('standalone tree keeps its generic display id', p && /^G-/.test(p.root.displayId), p && p.root.displayId);

// 4. a linked row with NO fcId falls back to TOP-### (the _fcTopGateDisplayId fallback)
c = mk(); c.acFhaData[0].fcId = '';
vm.runInContext('__apply(' + JSON.stringify({ root: spec, topEvent: 'x', _kind: 'allocation', _systemId: '', _fhaInternalId: 7 }) + ')', c);
p = c.ftaPages[0];
check('a linked row without an fcId falls back to TOP-###', p && /^TOP-\d+/.test(p.root.displayId), p && p.root.displayId);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
