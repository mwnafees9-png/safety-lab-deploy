#!/usr/bin/env node
/* Safety Lab Aero — agreement build.
 *
 * ONE source of truth for the legal text: legal/SL-EULA-0004.html.
 * Everything else is GENERATED from it, so a clause can never again be fixed in
 * one copy and left standing in another. That is exactly how the withdrawn
 * SL-LICENSE-0001 kept a training grant the EULA had already removed: the fix
 * went into one file, the regression test was pointed at that same one file, and
 * the sibling document was never looked at by either.
 *
 * Generates:
 *   site/eula_modal.js                    (EULA_HTML + EULA_VERSION spliced in)
 *   ../safety-lab-desktop/agreements/eula.html      (desktop first-launch screen)
 *   ../safety-lab-desktop/agreements/eula.version
 *
 * The desktop targets are written only when that repo is a sibling on disk;
 * pull-web.sh regenerates them on every sync regardless.
 *
 * Run:  node legal/build_agreement.mjs            (writes)
 *       node legal/build_agreement.mjs --check    (verifies, writes nothing)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DESKTOP = resolve(REPO, '..', 'safety-lab-desktop');

const VERSION = 'SL-EULA-0004-A';
const REV = 'A';
const TITLE = 'End User License and Subscription Agreement';

const SRC = join(HERE, 'SL-EULA-0004.html');
const MODAL = join(REPO, 'site', 'eula_modal.js');

const check = process.argv.includes('--check');
const problems = [];
const wrote = [];

// ---- 1. read + normalize the source ------------------------------------------------------------
let html = readFileSync(SRC, 'utf8');

// Collapse to one line. The modal stores the agreement as a single JS string literal; a stray
// newline inside it is a syntax error, and a stray tab shows up as whitespace in the dialog.
html = html.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).join('');

// Guard the class of bug that put a literal "—" on the live EULA eight times: the escape was
// written into the .js string by hand and nothing ever un-escaped it, so subscribers read
// 'EDU — free'. House rule is no em dashes in customer-facing text anyway, so both forms fail.
if (/\\u[0-9a-fA-F]{4}/.test(html)) problems.push('source contains a literal \\uXXXX escape sequence');
if (/[—–]/.test(html)) problems.push('source contains an em or en dash (house rule: none in customer-facing text)');

// ---- 2. the clauses that must hold, checked against the SOURCE, not a copy ----------------------
const MUST = [
  'Licensor does not use your Customer Data to train or fine-tune any machine-learning model',
  '<b>Personalization; No Model Training.</b>',
  '(v) providing the in-product personalization described in the Personalization; No Model Training paragraph below',
  'This paragraph does not permit any use of Customer Data for model training or fine-tuning, which Section 5 excludes',
  'separate, express, opt-in written agreement',
  'counted, capped (including set to zero), or cleared',
  'corrections captured under an export-controlled project are never retrieved, and no corrections are retrieved while an export-controlled project is open',
];
// Every phrasing of the grant that has ever appeared in a Safety Lab agreement, plus the looser
// shapes. Matched case-insensitively on the source: a NEW wording is the thing to fear, so this
// list is a floor, not a ceiling. See tests/regression_no_training_grant.test.js for the sweep
// that runs across every file carrying agreement text.
const FORBID = [
  /to develop,\s*train,[^.]*?and improve\s+Licensor/i,
  /Model Development/,
  /withdraw its Customer Data from model development/i,
  /routes? associated AI invocations through a United-States-only inference path/i,
  /converts automatically into a paid subscription/i,
];
for (const s of MUST) if (!html.includes(s)) problems.push('REQUIRED clause missing: ' + s.slice(0, 80));
for (const r of FORBID) if (r.test(html)) problems.push('FORBIDDEN clause present: ' + r);

// Every "Section N" cross-reference must name a heading that exists.
const heads = new Set([...html.matchAll(/<h4>\s*([0-9]+[A-Z]?)\./g)].map((m) => m[1]));
for (const m of html.replace(/<[^>]*>/g, ' ').matchAll(/Sections?\s+([0-9]+[A-Z]?)/g)) {
  if (!heads.has(m[1])) problems.push('cross-reference to a section that does not exist: Section ' + m[1]);
}

if (problems.length) {
  console.error('\nBUILD REFUSED. The agreement source did not pass its own checks:\n');
  for (const p of [...new Set(problems)]) console.error('  - ' + p);
  console.error('');
  process.exit(1);
}

// ---- 3. splice into site/eula_modal.js ---------------------------------------------------------
const asJsString = html.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
let modal = readFileSync(MODAL, 'utf8');
const before = modal;

modal = modal.replace(/var EULA_VERSION = '[^']*';/, "var EULA_VERSION = '" + VERSION + "';");
modal = modal.replace(/var EULA_HTML = "[\s\S]*?";\n/, 'var EULA_HTML = "' + asJsString + '";\n');
modal = modal.replace(/window\.SL_EULA = \{ html: EULA_HTML, rev: '[^']*', version: EULA_VERSION \}/,
  "window.SL_EULA = { html: EULA_HTML, rev: '" + REV + "', version: EULA_VERSION }");
// Dialog chrome. The document is no longer just a EULA, and the checkbox a user ticks has to name
// the thing they are agreeing to.
modal = modal.replace(/aria-label="End User License[^"]*"/, 'aria-label="' + TITLE + '"');
modal = modal.replace(/<h2>End User License[^<]*<\/h2>/, '<h2>' + TITLE + '</h2>');
modal = modal.replace(/I have read and agree to the Safety Lab Aero End User License[^<]*\./,
  'I have read and agree to the Safety Lab Aero ' + TITLE + '.');

if (!modal.includes(VERSION)) problems.push('version splice failed');
if (!modal.includes(asJsString.slice(0, 120))) problems.push('EULA_HTML splice failed');
if (problems.length) { console.error('SPLICE FAILED: ' + problems.join('; ')); process.exit(1); }

if (!check && modal !== before) { writeFileSync(MODAL, modal); wrote.push('site/eula_modal.js'); }

// ---- 4. desktop first-launch copies ------------------------------------------------------------
// main.js reads these off disk in the Node process, before any window exists, so it cannot use
// window.SL_EULA. They are derived here instead of maintained by hand.
if (existsSync(DESKTOP)) {
  const dir = join(DESKTOP, 'agreements');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const targets = [[join(dir, 'eula.html'), html], [join(dir, 'eula.version'), VERSION + '\n']];
  for (const [p, body] of targets) {
    const cur = existsSync(p) ? readFileSync(p, 'utf8') : null;
    if (cur === body) continue;
    if (check) { problems.push('desktop copy is stale: ' + p.replace(DESKTOP, '..')); continue; }
    writeFileSync(p, body);
    wrote.push(p.replace(resolve(DESKTOP, '..') + '/', ''));
  }
}

// ---- 5. the plain-text reference copy ----------------------------------------------------------
// EULA_Safety_Lab_Aero.md used to say "Extracted verbatim from the in-product EULA, 1 Sep 2026",
// which is a promise no one can keep by hand. It is generated now, so it cannot fall behind.
const md = (() => {
  const out = ['# Safety Lab Aero - ' + TITLE, '', '_' + VERSION + '. Generated from legal/SL-EULA-0004.html by legal/build_agreement.mjs. Do not edit this file._', ''];
  const body = html
    .replace(/<h4>([\s\S]*?)<\/h4>/g, (_, t) => '\n\n## ' + t.trim() + '\n\n')
    .replace(/<p class="sub">([\s\S]*?)<\/p>/g, (_, t) => '\n\n' + t.trim() + '\n\n')
    .replace(/<p>([\s\S]*?)<\/p>/g, (_, t) => '\n\n' + t.trim() + '\n\n')
    .replace(/<b>([\s\S]*?)<\/b>/g, '**$1**')
    .replace(/<i>([\s\S]*?)<\/i>/g, '_$1_')
    .replace(/<br\s*\/?>/g, '  \n')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&middot;/g, '-')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  out.push(body, '');
  return out.join('\n');
})();
const MD = join(REPO, 'EULA_Safety_Lab_Aero.md');
const curMd = existsSync(MD) ? readFileSync(MD, 'utf8') : null;
if (curMd !== md) {
  if (check) problems.push('EULA_Safety_Lab_Aero.md is stale');
  else { writeFileSync(MD, md); wrote.push('EULA_Safety_Lab_Aero.md'); }
}

if (check) {
  if (problems.length) { console.error('CHECK FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log('agreement check OK  (' + VERSION + ', ' + html.length + ' chars)');
} else {
  console.log('agreement built  ' + VERSION + '  (' + html.length + ' chars)');
  for (const w of wrote) console.log('  wrote  ' + w);
  if (!wrote.length) console.log('  (no changes)');
}
