#!/usr/bin/env node
/*
 * Regression — ONE AGREEMENT, ONE SOURCE (15 Sep 2026).
 *
 * WHY THIS EXISTS. On 3 Aug 2026 the broad "develop, train, fine-tune, evaluate and improve
 * Licensor's models" grant was removed from the EULA, and regression_no_training_guarantee.test.js
 * was written to pin it out. Both the fix and the test looked at exactly one file,
 * site/eula_modal.js. The same grant was ALSO sitting in site/license_modal.js, in a second
 * agreement the customer accepted about thirty seconds after the first, phrased
 * "to develop, train, evaluate, and improve Licensor's machine-learning models and AI-assisted
 * features as described in the EULA" — a clause that cited the EULA for a permission the EULA
 * expressly refused, in a document whose own preamble said it CONTROLS on conflict. It survived
 * six weeks and was found only by reading the two documents side by side.
 *
 * Two lessons, and this suite is both of them:
 *   1. A guard aimed at a FILE cannot protect a CLAIM. This suite finds agreement text by
 *      scanning the repos for it, so a new copy in a new file is caught the day it appears.
 *   2. A literal-string check is brittle where it matters most. The old check would not have
 *      matched the sibling's wording even pointed at the right file (it said "evaluate", not
 *      "fine-tune, evaluate"). The patterns here match the SHAPE of a training grant.
 *
 * WHAT IT PINS:
 *   [1] exactly one agreement exists, and it is generated from legal/SL-EULA-0004.html;
 *   [2] every copy of agreement text in either repo is byte-identical to that source;
 *   [3] no file anywhere carries a training grant, in any wording;
 *   [4] the withdrawn SL-LICENSE-0001 is gone and nothing still loads or references it;
 *   [5] the agreement's own claims match what the product does and what SL-DG-0001 promises;
 *   [6] every "Section N" cross-reference resolves.
 *
 * Run: node tests/regression_agreement_single_source.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const REPO = path.join(__dirname, '..');
const SITE = path.join(REPO, 'site');
const DESKTOP = path.join(REPO, '..', 'safety-lab-desktop');
const SOURCE = path.join(REPO, 'legal', 'SL-EULA-0004.html');

const VERSION = 'SL-EULA-0004-A';

// Directories skipped by the sweep. Every entry is a hole, so each one needs a reason:
//   dist/, app/  - BUILD OUTPUT, wiped and regenerated from site/ on every build. Skipping them
//                  is only safe because the regeneration is itself asserted in section [4] below;
//                  without those assertions a stale agreement could ship out of a build directory.
//   tests/       - this file and its siblings quote clause text in order to check for it.
//   _to_delete/  - quarantined, not shipped.
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'app', '_to_delete', 'tests', 'vendor', 'vendor-libs', 'out', 'build']);

// The generator quotes both the required clauses and the forbidden patterns as its own guard
// list, so it trips the sweep by design. It is the ONLY exempt file, and it is exempt because it
// is the thing doing the checking -- if it drifts, every check above it fails first.
const GRANT_SCAN_EXEMPT = new Set([path.join(REPO, 'legal', 'build_agreement.mjs')]);

function walk(root, hits) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return hits; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const p = path.join(root, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, hits); continue; }
    if (!/\.(js|mjs|html|json|md|txt|sh)$/.test(e.name)) continue;
    let t; try { t = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
    if (t.length > 4e6) continue;
    hits.push({ p, t });
  }
  return hits;
}

const files = [...walk(SITE, []), ...walk(path.join(REPO, 'legal'), []), ...walk(DESKTOP, [])];
const rel = (p) => path.relative(path.join(REPO, '..'), p);

// A file "carries agreement text" if it contains the operative language of the agreement itself,
// not merely the word Licensor in a comment.
const CARRIES = (t) =>
  t.includes('Licensor') && t.includes('Customer Data') &&
  (t.includes('End User License') || t.includes('Subscription Agreement') || t.includes('No Model Training'));

const source = fs.readFileSync(SOURCE, 'utf8');
const oneLine = source.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).join('');

// ---- [1] one agreement, generated ---------------------------------------------------------------
console.log('\n[agreement] one source of truth');
check('legal/SL-EULA-0004.html exists and is the source', source.length > 20000);
check('the generator exists', fs.existsSync(path.join(REPO, 'legal', 'build_agreement.mjs')));
const modal = fs.readFileSync(path.join(SITE, 'eula_modal.js'), 'utf8');
check('eula_modal.js carries the generated text verbatim', modal.includes(oneLine.replace(/\\/g, '\\\\').replace(/"/g, '\\"')),
  'run: node legal/build_agreement.mjs');
check('eula_modal.js is at ' + VERSION, modal.includes("var EULA_VERSION = '" + VERSION + "';"));
check('the modal names the merged agreement, not just a EULA',
  modal.includes('<h2>End User License and Subscription Agreement</h2>'));

// ---- [2] every copy matches -----------------------------------------------------------------
console.log('\n[agreement] no copy may drift from the source');
const carriers = files.filter((f) => CARRIES(f.t) && f.p !== SOURCE && !GRANT_SCAN_EXEMPT.has(f.p));
check('at least the two known carriers were found (modal + desktop first-launch copy)', carriers.length >= 2,
  'found: ' + carriers.map((f) => rel(f.p)).join(', '));
for (const f of carriers) {
  const flat = f.t.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).join('');
  const embedded = flat.includes(oneLine) || flat.includes(oneLine.replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
  check('carries the current agreement text, unmodified: ' + rel(f.p), embedded,
    'this file has agreement text that is not the generated source; regenerate it or stop duplicating it');
}

// ---- [3] no training grant, anywhere, in any wording ----------------------------------------
console.log('\n[agreement] no training grant survives in any file');
//
// NOT a list of remembered sentences. The clause that got through said "to develop, train,
// evaluate, and improve Licensor's machine-learning models" where the EULA's had said "develop,
// train, fine-tune, evaluate, and improve" — one dropped word, and a literal check misses it.
// So instead: find every SENTENCE that puts a training verb and customer data together, and flag
// it unless it is phrased as a refusal. A new grant cannot be written without tripping this, and
// a new refusal costs one read to confirm. That asymmetry is the point.
const TRAINS = /\btrain(ing|ed|s)?\b|\bfine-?tun(e|ed|ing)\b|\bmodel development\b|\bmodel weights\b/i;
const DATA = /\bCustomer Data\b|\byour data\b|\bLicensee'?s data\b|\byour content\b|\byour prompts\b/i;
const REFUSAL = /\bdoes not\b|\bdo not\b|\bnot use[ds]?\b|\bnever\b|\bexcludes?\b|\bno model\b|\bno training\b|\bno customer data\b|\bnot permit\b|\bopt-in\b|\bforbids?\b|\bis excluded\b|\bwithout\b|\bnot to\b|\bnot retain\b/i;
let grants = 0;
for (const f of [...files, { p: SOURCE, t: source }]) {
  if (GRANT_SCAN_EXEMPT.has(f.p)) continue;
  const prose = f.t.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
  for (const s of prose.split(/(?<=[.;])\s+/)) {
    if (!TRAINS.test(s) || !DATA.test(s)) continue;
    if (REFUSAL.test(s)) continue;
    grants++;
    check('NO training grant in ' + rel(f.p), false, 'unrefused training sentence: ' + JSON.stringify(s.trim().slice(0, 180)));
  }
}
check('no unrefused training sentence in any file in either repo', grants === 0,
  'if one of these is genuinely a refusal in new words, widen REFUSAL; if it is a grant, delete it');

// ---- [4] the withdrawn second agreement is gone ---------------------------------------------
console.log('\n[agreement] SL-LICENSE-0001 is withdrawn and unreferenced');
// Build output is skipped by the sweep, so the regeneration that makes that safe is pinned here.
// Both release paths must go through pull-web.sh, and pull-web.sh must wipe app/ and rebuild the
// agreement, or a desktop build could ship a first-launch screen showing withdrawn terms.
const pull = fs.readFileSync(path.join(DESKTOP, 'pull-web.sh'), 'utf8');
check('pull-web.sh wipes app/ before copying', /rm -rf "\$APP"/.test(pull));
check('pull-web.sh regenerates the agreement', /build_agreement\.mjs/.test(pull));
for (const s of ['release.sh', 'build-win-docker.sh']) {
  check(s + ' goes through pull-web.sh', /pull-web\.sh/.test(fs.readFileSync(path.join(DESKTOP, s), 'utf8')),
    'a build that skips pull-web.sh ships whatever stale text is sitting in app/');
}
check('dist/ carries no withdrawn agreement', !fs.existsSync(path.join(REPO, 'dist', 'license_modal.js')));
const distModal = path.join(REPO, 'dist', 'eula_modal.js');
if (fs.existsSync(distModal)) check('dist/eula_modal.js is at ' + VERSION, fs.readFileSync(distModal, 'utf8').includes(VERSION),
  'run ./build.sh — dist is stale');
check('site/license_modal.js is deleted', !fs.existsSync(path.join(SITE, 'license_modal.js')));
check('desktop agreements/license-agreement.html is deleted', !fs.existsSync(path.join(DESKTOP, 'agreements', 'license-agreement.html')));
check('desktop agreements/license.version is deleted', !fs.existsSync(path.join(DESKTOP, 'agreements', 'license.version')));
const loaders = files.filter((f) => /<script[^>]+license_modal\.js/.test(f.t));
check('nothing loads license_modal.js', loaders.length === 0, loaders.map((f) => rel(f.p)).join(', '));
const users = files.filter((f) => /window\.SL_LICENSE|AGREEMENTS\.licenseVersion|acceptLicense/.test(f.t));
check('nothing reads the withdrawn agreement at runtime', users.length === 0, users.map((f) => rel(f.p)).join(', '));

// ---- [5] the agreement matches the product and the deployment guide -------------------------
console.log('\n[agreement] the text matches what the product does');
check('the deployment-model section exists', /<h4>2A\. Deployment Models/.test(source));
check('the hosting license is scoped to the Hosted Deployment',
  /In a Hosted Deployment, you hereby grant Licensor a limited, non-exclusive, non-sublicensable license to host, store, process, and transmit/.test(source),
  'SL-DG-0001 tells a self-hosting customer that Safety Lab holds nothing; an unconditional hosting grant contradicts it');
check('the aggregated-statistics license is scoped to the Hosted Deployment',
  /In a Hosted Deployment, you grant Licensor a non-exclusive, royalty-free license to use anonymized, aggregated statistics/.test(source));
check('the 90-day retention clause is scoped to the Hosted Deployment',
  /\(ii\) in a Hosted Deployment, Licensor will retain Customer Data for a period of ninety \(90\) days/.test(source));
check('customer-hosted is stated to put NOTHING on a Licensor system',
  /Licensor does not host, store, process, transmit, receive, meter, or have access to Customer Data, Output, Accounts, sign-in events, or AI requests/.test(source));
check('the no-training undertaking is explicitly deployment-independent',
  /This undertaking applies in every Deployment Model and is not qualified, offset, or reserved against by any other provision/.test(source));
// The proxy refuses an ITAR request when no sovereign backend is configured, and refuses on ANY
// upstream error rather than falling back to public. The agreement must not promise more than that.
check('ITAR: the text promises refusal, not a sovereign path Licensor does not operate',
  /Licensor does not at present operate a United-States-sovereign hosted inference endpoint/.test(source) &&
  /on any error in reaching that endpoint the invocation is refused rather than routed to a public-cloud model/.test(source));
check('Pro+ managed proxy is scoped to the Hosted Deployment',
  /In a Customer-Hosted Deployment or a Local-Only Deployment there is no Licensor-operated proxy/.test(source),
  'SL-DG-0001 section 6.1 says the customer\'s own provider bills them and Safety Lab does not meter');
check('the trial does not auto-convert (it cannot: no payment method is taken)',
  /the trial does not convert automatically into a paid subscription/.test(source));

// ---- [6] cross-references resolve -----------------------------------------------------------
console.log('\n[agreement] every cross-reference resolves');
const heads = new Set([...source.matchAll(/<h4>\s*([0-9]+[A-Z]?)\./g)].map((m) => m[1]));
const refs = [...new Set([...source.replace(/<[^>]*>/g, ' ').matchAll(/Sections?\s+([0-9]+[A-Z]?)/g)].map((m) => m[1]))];
for (const r of refs) check('Section ' + r + ' exists', heads.has(r));

// ---- house rules ----------------------------------------------------------------------------
console.log('\n[agreement] house rules');
check('no em dashes in the customer-facing text', !/[—–]/.test(source));
check('no unresolved \\uXXXX escapes (the live EULA showed eight of them as literal text)',
  !/\\u[0-9a-fA-F]{4}/.test(modal.match(/var EULA_HTML = "([\s\S]*?)";\n/)[1]));
check('spelled American English: "license", never "licence"', !/\blicence\b/i.test(source));

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
