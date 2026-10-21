#!/usr/bin/env node
/*
 * Regression: Radia's AFHA layout, on Radia's build only (21 Oct 2026).
 *
 * Waqas: Radia sent the AFHA template they work to and want it "for themselves in
 * safetylabaero". Rulings: switched on by their signed license (feature "afha-customer-template"), nobody
 * else's; phases stay one list per failure condition; Informal Review Comments stay out (Safety
 * Lab's own review column does that job); "safety lab fills deterministically where it can, JAMA
 * ID and everything should be through live JAMA tracking".
 *
 * Pinned here: every derived column, from the model and by Radia's guidelines; the revision
 * history; the export filling THEIR file (their Guidelines untouched, their headings found by
 * text, their styles reused, one sheet per aircraft function, merges, the severity tally, the
 * filter range); the Jama revision number read only where it can have changed and only for this
 * layout; and the switch living in the license. Radia's own file is not in the repo: a workbook
 * with the same structure is built here.
 *
 * Run: node tests/regression_afha_template_20261021.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
global.SLFuncTree = require('../site/func_tree.js');
const C = require('../site/afha_template.js');
const XL = require('../site/afha_template_export.js');
const JSZip = require('../site/vendor/jszip.min.js');

// ---- a workbook with the structure of Radia's template ---------------------------------------
const HEAD = ['Title', 'Rev', 'Function', 'FDAL', 'Function Failure Condition (FFC)', 'Flight Phase', 'Flight Phase Consolidated', 'Failure Effect Description',
  'A/C Failure \nEffect', 'Flight Crew \nEffect', 'Supernumeraries\nEffect', 'Severity Classification', 'Impact', 'Assumptions and Reference Material\n',
  'Validation\n(Justification for Classification)', 'Verification (Depth of Analysis)', 'Original Content\n(Delete when moved to proper column)', 'Revision History', null, 'Informal Review Comments'];
const LET = 'BCDEFGHIJKLMNOPQRSTU'.split('');
function sheetXml(kind) {
  const strs = [];
  const sx = t => { strs.push(t); return strs.length - 1; };
  const c = (ref, s, t) => t == null ? '<c r="' + ref + '" s="' + s + '"/>' : '<c r="' + ref + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</t></is></c>';
  let rows = '<row r="1" spans="2:21"><c r="B1" s="26" t="inlineStr"><is><t>' + (kind === 'guide' ? 'GUIDELINES' : 'APPENDIX A.3 - GROUND CONTROL') + '</t></is></c></row>';
  rows += '<row r="2" spans="2:21">' + HEAD.map((h, i) => h == null ? '' : c(LET[i] + '2', 60 + i, h)).join('') + '</row>';
  if (kind === 'guide') rows += '<row r="3">' + c('B3', 125, '<Jama-ID> <Jama Function Name>, Rev <X>') + '</row>';
  else {
    for (let r = 3; r <= 12; r++) { const base = r === 3 ? 100 : r === 12 ? 300 : 200; rows += '<row r="' + r + '" spans="2:21">' + LET.map((L, i) => HEAD[i] == null ? '' : c(L + r, base + i, r === 3 && L === 'M' ? 'CAT, HAZ, MAJ, etc.' : null)).join('') + '</row>'; }
    ['CAT', 'HAZ', 'MAJ', 'MIN', 'NSE'].forEach((k, i) => { const r = 62 + i; rows += '<row r="' + r + '"><c r="M' + r + '" s="15"><f>COUNTIF($M$1:$M' + (60 + i) + ', N' + r + ')</f><v>0</v></c>' + c('N' + r, 42, k) + '</row>'; });
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><dimension ref="B1:U66"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews><cols><col min="2" max="2" width="25.7" customWidth="1"/><col min="9" max="9" width="28.9" customWidth="1"/></cols><sheetData>' + rows + '</sheetData>' +
    (kind === 'guide' ? '' : '<autoFilter ref="B2:V60"/><mergeCells count="3"><mergeCell ref="B3:B12"/><mergeCell ref="C3:C12"/><mergeCell ref="D3:D12"/></mergeCells><conditionalFormatting sqref="M3:M28 M30:M60"><cfRule type="cellIs" dxfId="9" priority="1" operator="equal"><formula>"CAT"</formula></cfRule></conditionalFormatting>') +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' + (kind === 'guide' ? '' : '<legacyDrawing r:id="rId2"/><extLst><ext uri="{CCE6A557}"><x14:dataValidations xmlns:x14="x"><x14:dataValidation><xm:sqref>K3:K60</xm:sqref></x14:dataValidation></x14:dataValidations></ext></extLst>') + '</worksheet>';
}
async function template() {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>');
  z.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="1"/></bookViews><sheets><sheet name="Guidelines" sheetId="17" r:id="rId1"/><sheet name="AFHA Template" sheetId="23" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">\'AFHA Template\'!$B$2:$V$60</definedName></definedNames><calcPr calcId="191028"/></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>');
  z.file('xl/worksheets/sheet1.xml', sheetXml('guide'));
  z.file('xl/worksheets/sheet2.xml', sheetXml('afha'));
  z.file('xl/calcChain.xml', '<calcChain/>');
  return z;
}

// ---- a small Radia-like model ------------------------------------------------------------------
const functions = [
  { internalId: 'f1', funcId: 'RAD-AF-3', funcName: 'Ground control', subId: 'RAD-F-3.1', subName: 'Steer on ground', subDef: 'Provide nose wheel steering', fnSource: { tool: 'jama-live', key: 'RAD-F-3.1', remoteId: 31, version: 4 } },
  { internalId: 'f2', funcId: 'RAD-AF-3', funcName: 'Ground control', subId: 'RAD-F-3.2', subName: 'Brake', subDef: 'Provide wheel braking' },
  { internalId: 'f3', funcId: 'RAD-AF-4', funcName: 'Pitch control', subId: 'RAD-F-4.1', subName: 'Command elevator', subDef: 'Move the elevator', fnSource: { tool: 'jama-live', key: 'RAD-F-4.1', remoteId: 41, version: 2 } }];
const mkRows = () => [
  { internalId: 'h1', subId: 'RAD-F-3.1', fcId: 'FC-1', fcDesc: 'Total loss of nose wheel steering', phases: ['Taxi', 'Takeoff'], effAc: 'Directional control by differential braking', effCrew: 'Increased workload', effPax: '', severity: 'Major', effAcLevel: 'significant', assumptionIds: ['ASM-1'], comments: 'Low speed' },
  { internalId: 'h2', subId: 'RAD-F-3.1', fcId: 'FC-2', fcDesc: 'Uncommanded steering', phases: ['Takeoff'], effAc: 'Runway excursion', effCrew: 'High workload', effPax: 'Injuries', severity: 'Hazardous' },
  { internalId: 'h3', subId: 'RAD-F-3.2', fcId: 'FC-3', fcDesc: 'Loss of braking', phases: 'Landing', severity: 'Catastrophic' },
  { internalId: 'h4', subId: 'RAD-F-4.1', fcId: 'FC-4', fcDesc: 'Erroneous elevator command', phases: ['Taxi', 'Takeoff', 'Cruise', 'Landing'], severity: 'Negligible', impact: ['Accuracy'], valMethod: 'Similarity', verification: 'Design review' }];
const ctxOf = rows => ({ rows, functions, fcim: [{ subId: 'RAD-F-3.1', tlId: 'FC-1', mId: 'FC-2', awareness: 'Crew Aware' }], assumptions: [{ asmId: 'ASM-1', text: 'Differential braking available' }],
  pages: [{ id: 'p1', name: 'Loss of braking', linkedFhaIds: ['h3'] }, { id: 'p2', name: 'mirror', verifies: 'p1', linkedFhaIds: ['h3'] }], phaseOrder: ['Taxi', 'Takeoff', 'Cruise', 'Landing'], regulation: 'Part 25' });

(async function main() {
  console.log('\n[columns] every value from the model, by Radia\'s guidelines');
  const rows = mkRows(), ctx = ctxOf(rows);
  const v = id => C.rowValues(rows.find(r => r.internalId === id), ctx);
  check('Title is the Jama key, name and revision; Rev is the Jama revision; Function is "a. <description>"', v('h1').title === 'RAD-F-3.1 Steer on ground, Rev 4' && v('h1').rev === '4' && v('h1').func === 'a. Provide nose wheel steering' && v('h1').jama);
  check('a function not in Jama: its own id and name, no revision, and said so on the page', v('h3').title === 'RAD-F-3.2 Brake' && v('h3').rev === '' && !v('h3').jama);
  check('FDAL is the worst severity of the function\'s failure conditions', C.fdalFor(rows.slice(0, 2)) === 'B' && C.fdalFor([rows[2]]) === 'A' && C.fdalFor([rows[3]]) === 'E' && C.fdalFor([]) === '');
  check('severity reads as CAT / HAZ / MAJ / MIN / NSE', ['Catastrophic', 'Hazardous', 'Major', 'Minor', 'Negligible'].map(C.sevCode).join() === 'CAT,HAZ,MAJ,MIN,NSE');
  check('FFC carries crew awareness from the FCIM', v('h1').ffc === 'FC-1 Total loss of nose wheel steering\n(crew aware)' && C.ffcText({ fcId: 'X', fcDesc: 'Loss (crew not aware)' }, []) === 'X Loss (crew not aware)');
  check('phases stay one list; the consolidated column joins whole runs', v('h1').phase === 'Taxi, Takeoff' && v('h1').phaseConsolidated === 'Taxi to Takeoff' && v('h4').phaseConsolidated === 'All flight phases' && C.phasesConsolidated(['Taxi', 'Cruise', 'Landing'], ctx.phaseOrder) === 'Taxi, Cruise to Landing');
  check('the effect description names all three categories, N/A where there is none', v('h1').effects === 'Aircraft: Directional control by differential braking\n\nFlight Crew: Increased workload\n\nSupernumeraries: N/A' && v('h1').acLevel === 'Significant');
  check('Impact: Availability for a loss slot, Integrity for a malfunction slot, typed wins', v('h1').impact === 'Availability' && v('h2').impact === 'Integrity' && v('h4').impact === 'Accuracy' && !C.impactFor(rows[3], []).auto);
  check('Impact from the wording when the FCIM does not say', C.impactFor({ fcDesc: 'Loss of braking' }, []).values.join() === 'Availability' && C.impactFor({ fcDesc: 'Hazardously misleading airspeed' }, []).values.join() === 'Integrity');
  check('Assumptions cell: ids with their statements, the comments, the 1309 paragraph of the basis', v('h1').assumptions === 'Assumptions:\nASM-1: Differential braking available\n\nComments:\nLow speed\n\nSupporting Material(s):\n14 CFR §25.1309' && C.supportingDefault('CS-25') === 'CS 25.1309' && C.supportingDefault('') === '');
  check('Validation: the method their guidelines give for the class, unless one was chosen', /^Validation Method:\nTest\n/.test(v('h2').validation) && /^Validation Method:\nEngineering review/.test(v('h3').validation) && /^Validation Method:\nSimilarity/.test(v('h4').validation));
  check('a No Safety Effect row with no justification takes the statement their guidelines recommend', v('h4').validation.indexOf(C.NSE_STATEMENT) > 0 && v('h2').validation.endsWith('Justification for Classification:\nN/A'));
  check('Verification: the fault tree that analyzes it (not its mirror), else what the class calls for', v('h3').verification === 'FTA: Loss of braking' && v('h2').verification === 'FTA (planned)' && v('h4').verification === 'Design review' && C.verificationText({ severity: 'Minor' }, []) === 'Qualitative (FHA and design review)');

  console.log('\n[history] every change, recorded as it happens');
  const hr = mkRows();
  check('first sight: one entry each', C.recordChanges(hr, 'brian@radia.com', '2026-10-21T22:00:00Z') === 4 && hr[0].revLog.length === 1 && /First recorded/.test(hr[0].revLog[0].what));
  check('nothing changed: nothing recorded', C.recordChanges(hr, 'brian@radia.com', '2026-10-21T22:05:00Z') === 0);
  hr[1].severity = 'Catastrophic'; hr[1].effAc = 'Loss of control';
  check('a change: who, when, and what, with the severity move spelled out', C.recordChanges(hr, 'eng@radia.com', '2026-10-22T09:00:00Z') === 1 && hr[1].revLog[1].what === 'aircraft effect, severity HAZ to CAT changed' && C.revisionText(hr[1]).split('\n')[1] === '2026-10-22 eng@radia.com: aircraft effect, severity HAZ to CAT changed', C.revisionText(hr[1]));

  console.log('\n[groups] one sheet per aircraft function, one block per sub-function');
  const sheets = C.buildGroups(ctx);
  check('two aircraft functions, in tree order, blocks under them', sheets.length === 2 && sheets[0].funcName === 'Ground control' && sheets[0].groups.map(g => g.subId).join() === 'RAD-F-3.1,RAD-F-3.2' && sheets[1].groups[0].rows[0].fdal === 'E');
  check('an obsolete row is left out', C.buildGroups(Object.assign({}, ctx, { rows: mkRows().map(r => r.internalId === 'h2' ? Object.assign(r, { obsolete: true }) : r) }))[0].groups[0].rows.length === 1);

  console.log('\n[export] written into their file');
  const zip = await template();
  const r = await XL.fillWorkbook(zip, sheets);
  check('filled, two sheets, row counts and severity counts', r.ok && r.sheets.length === 2 && r.sheets[0].rows === 3 && r.sheets[0].counts.MAJ === 1 && r.sheets[0].counts.CAT === 1, JSON.stringify(r));
  const g = await zip.file('xl/worksheets/sheet1.xml').async('string');
  check('their Guidelines sheet is untouched', g === sheetXml('guide'));
  const s2 = await zip.file('xl/worksheets/sheet2.xml').async('string'), s3 = await zip.file('xl/worksheets/sheet3.xml').async('string');
  const cell = (x, ref) => { const m = new RegExp('<c r="' + ref + '"[^>]*?(?:/>|>([\\s\\S]*?)</c>)').exec(x); return m ? (m[1] || '').replace(/<[^>]+>/g, '') : null; };
  check('the title cell names the appendix and the function', cell(s2, 'B1') === 'APPENDIX A.1 - GROUND CONTROL' && cell(s3, 'B1') === 'APPENDIX A.2 - PITCH CONTROL');
  check('columns found by their headings', cell(s2, 'B3') === 'RAD-F-3.1 Steer on ground, Rev 4' && cell(s2, 'C3') === '4' && cell(s2, 'E3') === 'B' && cell(s2, 'M3') === 'MAJ' && cell(s2, 'H3') === 'Taxi to Takeoff' && cell(s2, 'Q5') === 'FTA: Loss of braking');
  check('Original Content and Informal Review Comments stay empty', /<c r="R3" s="\d+"\/>/.test(s2) && /<c r="U3" s="\d+"\/>/.test(s2));
  check('their styles: block first row, block last row', /<c r="B3" s="100"/.test(s2) && /<c r="B4" s="300"/.test(s2) && /<c r="B5" s="100"/.test(s2));
  check('Title, Rev and Function merged down each block', /<mergeCell ref="B3:B4"\/>/.test(s2) && /<mergeCell ref="D3:D4"\/>/.test(s2) && !/B3:B12/.test(s2) && /<\/autoFilter><mergeCells/.test(s2.replace(/<autoFilter[^>]*\/>/, m => m.replace('/>', '></autoFilter>'))) );
  check('the filter, the severity colors and the list cover exactly the rows written', /<autoFilter ref="B2:V5"/.test(s2) && /<conditionalFormatting sqref="M3:M5"/.test(s2) && /<xm:sqref>K3:K5<\/xm:sqref>/.test(s2));
  check('the severity tally sits under the table, counting the right rows', /<c r="M7" s="15"><f>COUNTIF\(\$M\$3:\$M\$5, N7\)<\/f><v>1<\/v><\/c>/.test(s2) && cell(s2, 'N11') === 'NSE');
  const wb = await zip.file('xl/workbook.xml').async('string'), ct = await zip.file('[Content_Types].xml').async('string'), rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  check('the second function is a new sheet, registered everywhere Excel looks', /<sheet name="A\.2 Pitch control" sheetId="24" r:id="rId8"\/>/.test(wb) && /sheet3\.xml/.test(ct) && /Id="rId8"[^>]*worksheets\/sheet3\.xml/.test(rels));
  check('the copy carries no comment drawing of the original and is not also selected', !/legacyDrawing/.test(s3) && !/tabSelected/.test(s3) && /legacyDrawing/.test(s2));
  check('the sheets are renamed for their functions, filter names match', /<sheet name="A\.1 Ground control"/.test(wb) && /localSheetId="1" hidden="1">'A\.1 Ground control'!\$B\$2:\$V\$5</.test(wb) && /localSheetId="2" hidden="1">'A\.2 Pitch control'!\$B\$2:\$V\$3</.test(wb));
  check('the stale calculation chain is dropped and Excel recalculates on open', !zip.file('xl/calcChain.xml') && !/calcChain/.test(ct + rels) && /fullCalcOnLoad="1"/.test(wb));
  const notIt = new JSZip(); notIt.file('xl/workbook.xml', '<workbook><sheets><sheet name="X" sheetId="1" r:id="rId1"/></sheets></workbook>'); notIt.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'); notIt.file('[Content_Types].xml', '<Types></Types>'); notIt.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Hello</t></is></c></row></sheetData></worksheet>');
  check('a file that is not the AFHA template is refused with a reason', /not the AFHA template/.test((await XL.fillWorkbook(notIt, sheets)).error || ''));

  console.log('\n[switch] Radia\'s license only');
  const page = S('afha_template.js');
  check('the layout is on only when the signed license names the feature', /L && L\.valid && Array\.isArray\(L\.features\) && L\.features\.indexOf\(C\.FEATURE\) >= 0/.test(page) && C.FEATURE === 'afha-customer-template');
  check('off: the standard table shows and their fields and buttons hide', /if \(!active\(\)\) \{ if \(host\) host\.style\.display = 'none'; if \(std\) std\.style\.display = ''; return; \}/.test(page) && /el\.style\.display = active\(\) \? '' : 'none'/.test(page));
  check('Informal Review Comments are not a column on the page', !/Informal Review/.test(page.slice(page.indexOf('var COLS'), page.indexOf('function renderTable'))));
  check('no AI in any derived column', !/AiClient|askClaude|anthropic/i.test(page.slice(0, page.indexOf('// The page'))));
  const idx = S('index.html');
  check('both scripts load', /<script src="afha_template\.js\?v=1\.0" defer><\/script>\s*<script src="afha_template_export\.js\?v=1\.0" defer><\/script>/.test(idx));
  check('no customer is named anywhere in the shipped modules', ['afha_template.js', 'afha_template_export.js'].every(f => !/radia(?!t|n|l)/i.test(S(f))));
  check('the template is kept in the project, not shipped in the bundle', /c\.afhaTemplate = \{ name: f\.name, b64: b64\(buf\)/.test(S('afha_template_export.js')) && !fs.readdirSync(SITE).some(f => /afha.*\.xlsx$/i.test(f)));

  console.log('\n[jama] the revision number, read only where it can have changed');
  const lb = S('live_bridge.js');
  check('read only for this layout', /function _wantsRevisions\(\) \{ try \{ return !!\(window\.SLAfhaTpl && window\.SLAfhaTpl\.active\(\)\)/.test(lb) && /if \(_lastDiff\.fn && _wantsRevisions\(\)\) await bridgeReadRevisions/.test(lb));
  {
    const ctxv = { console, window: null, localStorage: { getItem: () => null, setItem() {} }, document: { readyState: 'complete', getElementById: () => null, addEventListener() {}, querySelectorAll: () => [] }, navigator: { userAgent: '' }, setTimeout, setInterval: () => 1, clearInterval() {}, URL,
      acFunctionsData: [{ subId: 'A', fnSource: { tool: 'jama-live', remoteId: 1, key: 'K-1', lastChange: 'm1', version: 3 } }, { subId: 'B', fnSource: { tool: 'jama-live', remoteId: 2, key: 'K-2', lastChange: 'm2' } }, { subId: 'C', fnSource: { tool: 'jama-live', remoteId: 3, key: 'K-3', lastChange: 'old', version: 1 } }], acReqData: [] };
    ctxv.window = ctxv; vm.createContext(ctxv);
    vm.runInContext(S('func_tree.js'), ctxv); vm.runInContext(S('jama_tree.js'), ctxv); vm.runInContext(lb, ctxv);
    const asked = [];
    const d = { fn: { fresh: [], changed: [], moved: [], fnChanged: [], missing: [] }, warnings: [] };
    const items = [{ id: 1, type: 10, key: 'K-1', name: 'a', modified: 'm1' }, { id: 2, type: 10, key: 'K-2', name: 'b', modified: 'm2' }, { id: 3, type: 10, key: 'K-3', name: 'c', modified: 'new' }, { id: 4, type: 10, key: 'K-4', name: 'd', modified: 'm4' }];
    await ctxv.bridgeReadRevisions(items, { fnTypes: [10] }, d, async id => { asked.push(id); return { meta: { pageInfo: { totalResults: { 2: 5, 3: 2, 4: 1 }[id] } } }; });
    check('asked only for the unread, the modified and the new (not an unchanged item already read)', asked.join() === '2,3,4', asked.join());
    check('a changed number is listed for review: first read, and was / now', d.fn.revised.length === 2 && d.fn.revised.some(x => x.remoteId === 2 && x.from === null && x.to === 5) && d.fn.revised.some(x => x.remoteId === 3 && x.from === 1 && x.to === 2));
    check('nothing written before the signature', ctxv.acFunctionsData[1].fnSource.version === undefined && ctxv.acFunctionsData[2].fnSource.version === 1);
    const out = ctxv.bridgeApply({ req: null, fn: d.fn }, 'B. Ciocca');
    check('signed: every row read takes its number, and the journal says so', out.ok && ctxv.acFunctionsData[1].fnSource.version === 5 && ctxv.acFunctionsData[2].fnSource.version === 2 && out.fn.revised === 2, JSON.stringify(out));
  }
  check('no em dashes in what this change added', ['afha_template.js', 'afha_template_export.js'].every(f => S(f).indexOf(String.fromCharCode(0x2014)) < 0) && fs.readFileSync(__filename, 'utf8').indexOf(String.fromCharCode(0x2014)) < 0);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });
