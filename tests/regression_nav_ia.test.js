/* ============================================================================
 * regression_nav_ia.test.js — nav IA, Rev C.
 *
 * RECONCILED 15 Aug 2026 (Waqas's ruling, after three mockup rounds and two
 * click-test harnesses — docs/nav_revC.html is the agreed shape): the five
 * OG top groups SURVIVE (Define · Analyze · Requirements · Prove · Admin),
 * and inside Analyze the old Safety/HF/System-lane/R&M categories are
 * replaced by the AIRCRAFT / SYSTEMS breakdown:
 *
 *   Aircraft  — AFHA (functions·FCIM·FHA·assumptions·reqs, kept TOGETHER,
 *               his words: "keep them together with the AFHA") →
 *               PASA (trees·DAL·CCAs·STPA·HF) → ASA (verification·CCMR·
 *               MMEL·SSE)
 *   Systems   — workspaces·PSSA·SSA·FMES·items + #asb-sys-dirs (nav_rail
 *               injects one directory per system)
 *   RAM       — reliability set + Maintainability (asb-grp-ram-mx id is
 *               LOAD-BEARING: ram_modules.js keys off it)
 *
 * Golden Thread is pinned at TOP LEVEL, directly after Dashboard — "the top
 * of the rail is where the best thing belongs." SSE and MMEL moved to ASA
 * (close-out owns the in-service loop). This supersedes the 26 Jul IA; the
 * old category pins are retired WITH this note so nobody restores them from
 * memory.
 * ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const idx = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const at = m => idx.indexOf(m);

// ---- top level ---------------------------------------------------------------
// 23 Aug 2026 — SUPERSEDED from five groups to four: Waqas moved the whole
// Prove group onto the horizontal strip ("everything under prove should show
// as a horizontal nav item rather than under the prove drop down"). The rail
// pin now guards the DELETION; the strip pins live in the nav_spine suite.
// 23 Aug 2026 (2) — REFINED per Waqas ("prove stays where it is just the
// options under it show as a horizontal thing"): Prove keeps its rail SEAT as
// a single row between Requirements and Admin — but never regains a dropdown.
// Its ten pages stay strip-only.
check('four rail groups + the single Prove row in its old seat (no dropdown, options on the strip)',
  at('>Define</span>') > 0 && at('>Define</span>') < at('>Analyze</span>') &&
  at('>Analyze</span>') < at('>Requirements</span>') &&
  at('>Requirements</span>') < at('id="snav-prove"') &&
  at('id="snav-prove"') < at('Admin &amp; AI</span>') &&
  /id="snav-prove"[^>]*onclick="switchTab\('trace'\)"/.test(idx) &&
  at('id="snav-trace"') < 0 && at('id="snav-evpkg"') < 0 &&
  at('id="snav-sora-thread"') < 0 && at('id="snav-mod"') < 0);
check('Golden Thread rides top-level, after Dashboard, BEFORE Define',
  at('id="snav-dashboard"') < at('id="snav-golden-thread"') &&
  at('id="snav-golden-thread"') < at('>Define</span>'));
check('single Analyze label carried by asb-grp-sys',
  (idx.match(/<span class="asb-lbl">Analyze<\/span>/g) || []).length === 1 &&
  (idx.match(/id="asb-grp-sys"/g) || []).length === 1);

// ---- the Aircraft / Systems breakdown ---------------------------------------
check('Aircraft category exists inside Analyze, before Systems',
  at('id="asb-grp-aircraft"') > at('>Analyze</span>') &&
  at('id="asb-grp-aircraft"') < at('id="asb-grp-systems"'));
// 23 Aug 2026 (3) — SUPERSEDED: the AFHA dropdown emptied into area tabs
// (Waqas: "same thing for both the FHAs"). One row in the rail; the five
// pages tabbed on the page (prove_tabs v1.1 pins the tab set).
check('AFHA is a single rail row — the dropdown never returns',
  at('id="snav-afha"') > 0 && at('id="asb-grp-afha"') < 0 &&
  at('id="snav-ac-func"') < 0 && at('id="snav-ac-fcim"') < 0 &&
  at('id="snav-ac-fha"') < 0 && at('id="snav-ac-asm"') < 0 && at('id="snav-ac-req"') < 0 &&
  at('id="snav-afha"') < at('id="asb-grp-pasa"'));
// 23 Aug 2026 (3) — the FTA tree-browser group left the rail (Waqas: "remove
// all the fault trees from the left nav"); a plain row remains and the
// browser pane lives on the FTA page with the tree-picker select.
check('PASA owns a plain FTA row (no tree browser in the rail) and the analyses',
  at('id="asb-grp-pasa"') < at('id="snav-fta"') &&
  at('id="asb-grp-fta"') < 0 && at('id="asb-fta-list"') < 0 &&
  at('id="snav-fta"') < at('id="snav-zsa"') &&
  at('id="snav-stpa"') > at('id="asb-grp-pasa"') &&
  at('id="snav-stpa"') < at('id="asb-grp-asa"'));
check('ASA sub-group owns close-out companions: CCMR, MMEL, SSE',
  at('id="asb-grp-asa"') < at('id="snav-ccmr"') &&
  at('id="snav-ccmr"') < at('id="snav-mmel"') &&
  at('id="snav-mmel"') < at('id="snav-sse"') &&
  at('id="snav-sse"') < at('id="asb-grp-systems"'));
// 23 Aug 2026 — SUPERSEDED. This used to pin PSSA/SSA/FMES/Items as Systems
// rows. Waqas: "these do not need to be separate menu items they will live in
// each systems directory" — the rows are deleted and nav_rail v1.3 renders each
// system as a folder carrying them. The pin now guards the deletion.
check('Systems category: directory + AI/ML only — PSSA/SSA/FMES/Items live in the system folders',
  at('id="asb-grp-systems"') < at('id="snav-sys-dir"') &&
  at('id="snav-pssa"') < 0 && at('id="snav-ssa"') < 0 &&
  at('id="snav-fmes"') < 0 && at('id="snav-items"') < 0 &&
  at('id="asb-sys-dirs"') > at('id="snav-sys-dir"') &&
  at('id="asb-sys-dirs"') < at('id="asb-grp-ram"'));
// 23 Aug 2026 — SUPERSEDED 26 Aug (evening): the CCA bucket consolidated the
// AFHA way (Waqas: Principle Ledger under CMA; Zonal Model, Routing and
// Physical Hazards under ZSA; CRA under CMA — "selectable from the left hand
// nav and then everything else shows as a horizontal selectable pill"). The
// rail keeps THREE analysis rows — ZSA < PRA < CMA (+ CEA, unruled, stays) —
// matching ARP4761A's three-analysis CCA structure; the folded pages are
// prove_tabs v1.5 areas, and their old rows must never come back, statically
// OR from the modules that used to self-mount them.
check('CCA bucket inside PASA holds ZSA < PRA < CMA < CEA — three analyses plus CEA, nothing else',
  at('id="asb-grp-cca"') > at('id="asb-grp-pasa"') &&
  at('id="asb-grp-cca"') < at('id="snav-zsa"') &&
  at('id="snav-zsa"') < at('id="snav-pra"') &&
  at('id="snav-pra"') < at('id="snav-cma"') &&
  at('id="snav-cma"') < at('id="snav-cea"') &&
  at('id="snav-cea"') < at('id="snav-stpa"'));
check('no Routing or Principle Ledger row in the rail — they are ZSA / CMA tabs now',
  at('id="snav-routing"') < 0 && at('id="snav-ipledger"') < 0);
{
  const S3 = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
  check('none of the folded CCA modules mounts a nav row any more',
    !S3('zonal_ui.js').includes("a.id = 'snav-zonal'") &&
    !S3('phys_hazards.js').includes("a.id = 'snav-phys'") &&
    !S3('cra_matrix.js').includes("a.id = 'snav-cra'"));
  const pt = S3('prove_tabs.js');
  check('prove_tabs carries the ZSA and CMA areas the rows folded into',
    /\{ t: 'zonal',\s+k: 'Zonal Model' \}/.test(pt) &&
    /\{ t: 'routing', k: 'Routing \/ Zone-Spanning', gateLane: 'routing' \}/.test(pt) &&
    /\{ t: 'phys',\s+k: 'Physical Hazards' \}/.test(pt) &&
    /\{ t: 'ipledger', k: 'Principle Ledger', gateLane: 'ipledger' \}/.test(pt) &&
    /\{ t: 'cra',\s+k: 'Common Resources \(CRA\)' \}/.test(pt));
}
// 23 Aug 2026 — Waqas: "why do we have 2 PASAs, and I dont like planned
// aircraft assessment and close out verbiage" / "the fix is to remove one".
// The header names the stage in the standard's vocabulary (PRELIMINARY, per
// ARP4761A and the app's own glossary); the echoing overview row is DELETED —
// the spine's PASA button is that door.
check('PASA/ASA headers use the standard vocabulary — no "planned", no "close-out"',
  idx.includes('PASA — preliminary aircraft safety assessment') &&
  idx.includes('ASA — aircraft safety assessment</span>') &&
  !idx.includes('planned aircraft assessment') &&
  !idx.includes('aircraft assessment &amp; close-out') && !idx.includes('aircraft assessment & close-out'));
check('no PASA echo — the overview row is gone (the spine button is the door)',
  at('id="snav-pasa"') < 0);
// 23 Aug 2026 (3) — SUPERSEDED: Markov + Event Trees left the rail entirely
// (Waqas: tree options are TABS under Fault Trees, "instead of left nav menu
// options"). Their catalogue lanes stay under R&M; the tabs are lane-gated.
check('no tree row anywhere in the rail — Markov, Event Trees and Bow-Tie are tabs now',
  at('id="snav-markov"') < 0 && at('id="snav-eta"') < 0 &&
  idx.indexOf('R&amp;M — reliability &amp; maintainability') >= 0);
// The runtime chains that anchored on Event Trees were re-pointed so they stay
// in their lanes; these pins keep the anchors from regressing.
{
  const S2 = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
  const bt = fs.readFileSync(path.join(__dirname, '..', 'site', 'bowtie.js'), 'utf8');
  const mon = fs.readFileSync(path.join(__dirname, '..', 'site', 'monitor_spec.js'), 'utf8');
  const zon = fs.readFileSync(path.join(__dirname, '..', 'site', 'zonal_ui.js'), 'utf8');
  const phy = fs.readFileSync(path.join(__dirname, '..', 'site', 'phys_hazards.js'), 'utf8');
  // 23 Aug 2026 (5) — Monitors/Exposure/Frequency mount NO rows either (all
  // Fault-trees TABS now); the surviving chain (Budget → FFS/ASA-surface →
  // Scale&Perf) re-anchors on rows that exist, terminating at snav-fta.
  check('none of the tree-family modules mounts a nav row any more',
    !bt.includes("a.id = 'snav-bowtie'") && !mon.includes("a.id = 'snav-monitors'") &&
    !S2('exposure_case.js').includes("a.id = 'snav-expcase'") &&
    !S2('fta_freq.js').includes("a.id = 'snav-freq'"));
  check('the surviving quant chain anchors only on live rows (budget→fta terminus)',
    S2('budget_ledger.js').includes("getElementById('snav-fta')") && !S2('budget_ledger.js').includes('snav-monitors') &&
    S2('ffs_module.js').includes("getElementById('snav-fta')") && !S2('ffs_module.js').includes('snav-monitors') &&
    S2('asa_triage.js').includes("getElementById('snav-fta')") && !S2('asa_triage.js').includes('snav-monitors') &&
    S2('perf_bench.js').includes("getElementById('snav-fta')") && !S2('perf_bench.js').includes('snav-monitors'));
  // 26 Aug 2026 — SUPERSEDED: those anchors existed to MOUNT rail rows, and
  // the rows are gone (ZSA/CMA tabs now; see the bucket check above). The
  // replacement invariant — no folded module mounts a row — is asserted there.
  check('the folded modules no longer carry nav-mount anchors',
    !zon.includes("a.id = 'snav-zonal'") && !phy.includes("a.id = 'snav-phys'"));
}
// 23 Aug 2026 (Waqas: "AI/ML assurance should default off only turn on through
// the program planning and show under systems"). Rev C replaced the old
// Safety/HF/System-lane/R&M categories with AIRCRAFT/SYSTEMS but two survived in
// the markup. HFA left on 22 Aug; "System lane" — one item, wrong level — dies
// here. The lane keeps its optIn/default-off gating; only its home changed.
check('AI/ML learning assurance lives in SYSTEMS, not in the aircraft group',
  at('id="snav-mlas"') > at('id="asb-grp-systems"') &&
  at('id="snav-mlas"') < at('id="asb-grp-ram"') &&
  at('id="snav-mlas"') > at('id="asb-grp-asa"'));
check('the pre-Rev-C "System lane" category is gone', !idx.includes('asb-cat-lbl">System lane<'));
check('…and the per-system directory slot still trails the static Systems entries',
  at('id="asb-sys-dirs"') > at('id="snav-mlas"'));
check('RAM category after Systems; Maintainability nested with its LOAD-BEARING id',
  at('id="asb-grp-ram"') > at('id="asb-grp-systems"') &&
  (idx.match(/id="asb-grp-ram-mx"/g) || []).length === 1 &&
  at('id="asb-grp-ram-mx"') > at('id="asb-grp-ram"'));
check('MMEL left Maintainability (it belongs to ASA close-out now)',
  at('id="snav-mmel"') < at('id="asb-grp-ram"'));

// ---- nav services -----------------------------------------------------------
check('nav_rail.js wired after program_plan.js',
  at('nav_rail.js') > at('program_plan.js') && at('nav_rail.js') > 0);
// 23 Aug 2026 — INVERTED. This used to pin the PRESENCE of #asb-catalogue-slot.
// The Catalogue rail entry was removed 18 Aug; the slot, the no-op renderer and
// its 6-second timer were left behind, so this check was defending a div that
// held nothing. The residue is deleted and the pin now guards the deletion.
check('no catalogue residue survives (slot, no-op renderer, timer, export)',
  !idx.includes('asb-catalogue-slot'));
{
  const rail = fs.readFileSync(path.join(__dirname, '..', 'site', 'nav_rail.js'), 'utf8');
  // Comments are stripped first: the header necessarily NAMES what it deleted,
  // and matching prose would report the corpse as still present — the same
  // self-inflicted failure regression_project_durability documents.
  const railCode = rail.replace(/\/\/[^\n]*/g, '');
  check('nav_rail carries no renderCatalogue no-op and never re-paints a dead slot',
    !railCode.includes('renderCatalogue') && !railCode.includes('asb-catalogue-slot'));
  check('the 6s poll still drives the LIVE service (per-system directories)',
    /setInterval\(function \(\) \{ try \{ renderSystemDirs\(\); \} catch/.test(rail));
  const railMarkup = idx.slice(idx.indexOf('<nav class="asb-nav">'), idx.indexOf('</nav>'));
  check('⌘K stays silent — indexed, but never advertised in the RAIL itself',
    railCode.includes('openPalette') && !railMarkup.includes('⌘K') && !railMarkup.includes('snav-catalogue'));
  check('palette never silently enables a lane (catalogue rows route to SPP)',
    rail.includes("switchTab('spp')") && !rail.includes('setLane('));
  check('nav_rail has a kill switch', rail.includes('SL_NAV_RAIL'));
  check('per-system entries route through openSystemWorkspace', rail.includes('openSystemWorkspace'));
}

// ---- invariants -------------------------------------------------------------
const markup = idx.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
check('<details> balanced',
  (markup.match(/<details/g) || []).length === (markup.match(/<\/details>/g) || []).length);
{
  const snavIds = (idx.match(/id="snav-[a-z0-9-]+"/g) || []);
  check('snav inventory intact (>=76, no duplicates)',
    // 23 Aug 2026 — floor lowered 76 → 72: PSSA/SSA/FMES/Items rows moved
    // into the per-system folders (deliberate supersession, see above).
    // 23 Aug 2026 — floor lowered 71 → 61: the ten Prove rows moved to the
    // strip (deliberate supersession, see the four-groups check above).
    // 23 Aug 2026 (3) — floor 62 → 58: the five AFHA rows became one (area
    // tabs). Lineage: 76→72→71→61→62→58, every step a signed ruling.
    // 23 Aug 2026 (4) — 58 → 56: markov + eta rows became Fault-trees tabs.
    // 26 Aug 2026 — 56 → 54: routing + ipledger rows became ZSA / CMA tabs
    // (CCA consolidation; the ruling is quoted at the bucket check above).
    // Lineage: 76→72→71→61→62→58→56→54, every step a signed ruling.
    snavIds.length >= 54 && new Set(snavIds).size === snavIds.length,
    snavIds.length + ' entries');
}
// 23 Aug 2026 (3) — INVERTED: the sidebar host is deleted; the relocation's
// own else-branch returns the pane to the FTA page layout.
check('the FTA sidebar host is GONE — the pane lives on the page again',
  !idx.includes('id="asb-fta-list"'));

// NOTE (25 Aug 2026) — the landing-highlight hold is pinned in its own suite,
// regression_landing_highlight.test.js, which already owned that behaviour.
// Two suites pinning one rule is how they drift apart.
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
