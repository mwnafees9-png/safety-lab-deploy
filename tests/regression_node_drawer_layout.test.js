#!/usr/bin/env node
/*
 * Regression: node-properties drawer layout (build 66.22 / 66.23).
 *
 * Waqas, 19 Aug 2026, three messages in a row while looking at the live drawer:
 *   "the text is not utilizing the full width of the modal"
 *   "your fix just moved it to the left"
 *   "I dont like how this stuff wraps, can we make these stacked vertically even the
 *    DAL kind override can be wider, adjacent text below DAL kind override, and the
 *    drop down wider so the full text is visible"
 *   "in modals like these we need to maximize the use off the vertical space"
 *
 * ONE root cause behind all four complaints: rows declared `display: flex` with
 * `gap: 15px` and NO `flex-wrap`. In a nowrap flex row:
 *   - a child with `flex: 1 1 100%` CANNOT break to its own line. It stays on the
 *     line and shrinks against its siblings. That is why the reuse notices rendered
 *     as a ~140px ribbon, why moving them to flex-basis:100% only pushed them left,
 *     and why the DAL-kind hint paragraph sat beside the dropdown instead of below.
 *   - six cells sharing 760px leaves ~120px each, so LABELS wrap to three lines and
 *     "Basic Event" truncates to "Bas".
 *
 * FIX: stop laying these rows out horizontally. `.cfg-stack` makes them a single
 * vertical column (the drawer is full-height and scrolls — vertical is the cheap
 * axis), and the reuse notices are a block at the FOOT of the panel, a sibling of
 * the field rows rather than a child of one.
 *
 * This suite is markup/CSS only, on purpose: the whole class of defect was invisible
 * to every behavioural test in the wall and was only ever caught by looking at it.
 *
 * Run: node tests/regression_node_drawer_layout.test.js
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

const html = read('index.html');
const css = read('safety_lab.css');

// The slice of index.html that is the node-config panel, so a stray match elsewhere
// in a 4000-line document cannot make a check pass by accident.
const panelStart = html.indexOf('id="node-config-panel"');
const panelEnd = html.indexOf('class="canvas-container" id="svg-wrap-container"');
const panel = html.slice(panelStart, panelEnd);

console.log('\n[1] The panel is scoped and found at all');
{
  check('the node-config panel exists', panelStart > 0);
  check('the panel slice ends before the canvas', panelEnd > panelStart);
  check('the slice is the panel, not the whole document', panel.length > 2000 && panel.length < 60000,
    'len=' + panel.length);
}

console.log('\n[2] The header names what it edits, and stays put while the stack scrolls');
{
  check('header reads "Gate/Event Properties", not "Configure Node Hierarchy"',
    /Gate\/Event Properties: <span id="config-node-id">/.test(panel));
  check('the old wording is gone everywhere', !/Configure Node Hierarchy/.test(html));
  check('the header row carries the sticky class', /class="cfg-drawer-head"/.test(panel));
  check('...and the class is actually sticky in CSS',
    /\.cfg-drawer-head,?\s*\n?[^{]*\{[^}]*position: sticky/.test(css));
  check('the sticky header masks the panel top padding, so nothing scrolls above it',
    /#node-config-panel\.is-modal \.cfg-drawer-head \{[^}]*box-shadow: 0 -\d+px 0 var\(--color-surface-1\)/.test(css));
  // Waqas: "not just the text but save changes, kebab, and the exit symbol too."
  // All four are inside the ONE sticky row — assert each by position, so a future tidy-up
  // that lifts a control out of the header row fails here instead of in a demo.
  const headStart = panel.indexOf('cfg-drawer-head');
  const headEnd = panel.indexOf('id="config-field-row"');
  const head = panel.slice(headStart, headEnd);
  ['config-node-id', 'node-drawer-save', 'row-kebab', 'node-modal-close'].forEach(id => {
    check('rides with the sticky header: ' + id, head.indexOf(id) !== -1);
  });
  check('the header bleeds across the drawer side padding, so nothing slides past beside it',
    /#node-config-panel\.is-modal \.cfg-drawer-head \{[^}]*margin: 0 -20px 12px -20px !important/.test(css));
  check('the kebab popup clears the sticky row',
    /#node-config-panel\.is-modal \.cfg-drawer-head \.row-action-menu \{ z-index: 7; \}/.test(css));
  check('the drag handle cannot cover the close button',
    /#node-config-panel\.is-modal \.cfg-drawer-head \.node-modal-close \{ position: relative; z-index: 8; \}/.test(css));
}

console.log('\n[3] .cfg-stack really stacks — column, full width, and it beats inline flex');
{
  const m = css.match(/#node-config-panel \.cfg-stack \{([^}]*)\}/);
  const body = m ? m[1] : '';
  check('the rule exists', !!m);
  check('it is a column', /flex-direction:\s*column/.test(body));
  check('children stretch rather than sitting at flex-end', /align-items:\s*stretch/.test(body));
  const kid = css.match(/#node-config-panel \.cfg-stack > div \{([^}]*)\}/);
  const kidBody = kid ? kid[1] : '';
  check('children are full width', /width:\s*100%/.test(kidBody));
  // The flex shorthands on these cells are INLINE (style="flex: 2;" etc). A plain
  // stylesheet rule loses to an inline style, so the override must be !important or
  // the stack silently does nothing.
  check('the child override is !important — inline style="flex: 2" would otherwise win',
    /flex:\s*0 0 auto\s*!important/.test(kidBody) && /width:\s*100%\s*!important/.test(kidBody));
  check('min-width:0 so a long select cannot blow the row out', /min-width:\s*0/.test(kidBody));
  check('controls fill the row, so "Basic Event" is not truncated to "Bas"',
    /#node-config-panel \.cfg-stack select,[\s\S]{0,220}\{[^}]*width:\s*100%/.test(css));
  check('hint paragraphs sit under their control',
    /#node-config-panel \.cfg-stack \.cfg-hint \{[^}]*margin:\s*2px 0 0 0/.test(css));
}

console.log('\n[4] Every nowrap row in the panel is stacked — no row may squeeze a 100% child');
{
  // Collect every flex row inside the panel and classify it.
  const rowRe = /<div([^>]*?)style="display:\s*(?:flex|none);[^"]*gap:\s*15px[^"]*"([^>]*)>/g;
  const rows = [];
  let m;
  while ((m = rowRe.exec(panel)) !== null) {
    const attrs = m[1] + m[2];
    const idm = /id="([^"]+)"/.exec(attrs);
    rows.push({
      id: idm ? idm[1] : '(anonymous)',
      wraps: /flex-wrap:\s*wrap/.test(m[0]),
      stacked: /class="[^"]*cfg-stack/.test(attrs),
      raw: m[0]
    });
  }
  check('the panel has the expected family of field rows', rows.length >= 10, 'found=' + rows.length);
  const bad = rows.filter(r => !r.wraps && !r.stacked);
  check('no row is left horizontal-and-nowrap', bad.length === 0,
    bad.map(r => r.id).join(', '));
  const named = rows.filter(r => r.stacked).map(r => r.id);
  ['config-field-row', 'config-dal-container', 'config-dal-kind-container',
   'config-input-mode-container', 'config-uncertainty-container'].forEach(id => {
    check('stacked: ' + id, named.indexOf(id) !== -1);
  });
  // The rows that already wrap were built with real flex-basis values; leaving them
  // alone is deliberate, not an oversight.
  const wrapping = rows.filter(r => r.wraps).map(r => r.id);
  check('the wrapping rows are left as they were', wrapping.indexOf('config-ccf-container') !== -1 &&
    wrapping.indexOf('config-exposure-container') !== -1);
}

console.log('\n[5] The DAL Kind Override row specifically — Waqas named this one');
{
  const i = panel.indexOf('id="config-dal-kind-container"');
  const row = panel.slice(panel.lastIndexOf('<div', i), panel.indexOf('</div>\n', panel.indexOf('cfg-hint', i)));
  check('the row is stacked', /cfg-stack/.test(panel.slice(Math.max(0, i - 400), i + 40)));
  check('the dropdown comes first', row.indexOf('config-dal-kind-override') < row.indexOf('cfg-hint'),
    'select@' + row.indexOf('config-dal-kind-override') + ' hint@' + row.indexOf('cfg-hint'));
  check('the explanatory text is a separate cell, now BELOW the control, not beside it',
    /flex: 1 1 100%;">\s*<p class="cfg-hint"/.test(row));
}

console.log('\n[6] The reuse / strictest-allocation notices are a block at the foot of the panel');
{
  const notice = panel.indexOf('id="config-event-notice-row"');
  check('the notice row exists', notice > 0);
  check('it is NOT inside the field row', notice > panel.indexOf('id="config-voting-container"'));
  check('it is not a child of the name cell',
    !/id="config-name-container"[\s\S]{0,400}id="config-event-usage"/.test(panel));
  check('it is the last block in the panel — after External Source',
    notice > panel.indexOf('id="config-extsrc-status"'));
  check('it is display:block and full width, not a flex item',
    /id="config-event-notice-row"[^>]*display:block/.test(panel) &&
    /id="config-event-notice-row"[^>]*width:100%/.test(panel));
  check('an event with nothing to say draws no stray divider',
    /#config-event-notice-row > div:empty \{\s*display: none;/.test(css));
  check('long tree names wrap instead of forcing a horizontal scrollbar',
    /id="config-event-usage"[^>]*overflow-wrap:anywhere/.test(panel));
}

console.log('\n[7] The drawer still owns the full height it is now relying on');
{
  const m = css.match(/#node-config-panel\.is-modal \{[\s\S]*?\}/);
  const body = m ? m[0] : '';
  check('it is a full-height fixed column', /position: fixed/.test(body) && /top: 64px/.test(body) && /bottom: 0/.test(body));
  check('max-height is not capping it', /max-height: none/.test(body));
  check('a taller stack scrolls rather than clipping', /overflow-y: auto/.test(body));
  const w = /width: min\((\d+)px/.exec(body);
  check('the default width is still at least 700px', w && parseInt(w[1], 10) >= 700, w ? w[1] : 'none');
}

console.log('\n[8] Scrolling — the drawer owns its own scroll, and gives you room to land');
{
  // Waqas, 19 Aug: "the scroll bar to the modal and the main page act together, plus the
  // scroll bar to the modal needs to allow the user go deeper."
  const m = css.match(/#node-config-panel\.is-modal \{[\s\S]*?\n\}/);
  const body = m ? m[0] : '';
  // The page behind the drawer is NOT frozen — body:has(.modal-overlay.show){overflow:hidden}
  // does not apply, deliberately, because the canvas stays live behind the drawer. So the
  // ONLY thing stopping the wheel chaining into the page at either scroll end is this.
  check('the drawer contains its own overscroll — no chaining into the page',
    /overscroll-behavior: contain/.test(body));
  check('nested scrollers inside the drawer are contained too',
    /overscroll-behavior: contain/.test(css.slice(css.indexOf('#config-event-notice-row [style*="overflow:auto"]') - 200)));
  const pad = /padding: 18px 20px (\d+)px 20px !important/.exec(body);
  check('there is real runway below the last field, so it can be scrolled up to read',
    pad && parseInt(pad[1], 10) >= 100, pad ? pad[1] + 'px' : 'no padding match');
  check('the scrollbar is always visible, not a fading overlay that reads as the page\'s',
    /#node-config-panel\.is-modal::-webkit-scrollbar-thumb \{/.test(css) &&
    /#node-config-panel\.is-modal \{ scrollbar-width: thin; \}/.test(css));
}

console.log('\n[9] The resize handle survives a scrolled drawer');
{
  const view = read('fta_view_modules.js');
  // Absolute + top:0/bottom:0 inside a scroll container spans the FIRST screenful only.
  // Now the drawer is tall, that meant the handle scrolled away and could not be grabbed.
  check('the handle is pinned to the viewport when the drawer is modal',
    /#node-config-panel\.is-modal \.node-drawer-resize \{[^}]*position: fixed/.test(css));
  check('it tracks the drawer edge through --drawer-w',
    /right: calc\(var\(--drawer-w, 760px\) - 10px\)/.test(css));
  check('a JS helper publishes the live width', /function _syncNodeDrawerWidthVar\(\)/.test(view));
  check('it refuses to publish a zero width measured while the panel is hidden',
    /if \(w > 0\) document\.documentElement\.style\.setProperty\('--drawer-w'/.test(view));
  check('a ResizeObserver covers the CSS default, a saved width and a viewport resize',
    /new ResizeObserver\(_syncNodeDrawerWidthVar\)\.observe\(panel\)/.test(view));
  check('...with a resize-listener fallback if ResizeObserver is missing',
    /window\.addEventListener\('resize', _syncNodeDrawerWidthVar\)/.test(view));
  check('a live drag updates it too', /panel\.style\.width = w \+ 'px';\s*\n\s*_syncNodeDrawerWidthVar\(\);/.test(view));
}

console.log('\n[10] The drawer rules actually MATCH the drawer (66.26)');
{
  /* The open drawer is matched by an ATTRIBUTE selector — JS opens it by setting an
     inline `display: block`, and nothing in this app ever adds an `is-modal` class.
     `.is-modal` is a vestigial alias; a rule written against it ALONE is dead CSS.

     66.24 shipped the sticky header and the pinned drag handle as `.is-modal` rules.
     The wall was green — because the checks asserted the rule TEXT existed, never that
     the selector matches anything — and in the browser getComputedStyle reported
     position:static and position:absolute. Nothing happened at all. These checks close
     that gap: they read the selectors, not just the declarations. */
  const LIVE = '#node-config-panel[style*="display: block"]';
  check('nothing in the app applies an is-modal class — the alias really is inert',
    !fs.readdirSync(SITE).filter(f => /\.(js|html)$/.test(f))
      .some(f => /is-modal/.test(read(f))),
    'a file adds is-modal — if that is now real, this whole section needs revisiting');
  check('the live open-drawer selector exists at all', css.indexOf(LIVE) !== -1);

  // Every rule mentioning .is-modal must carry the attribute-selector twin in the SAME
  // selector group, or it is dead.
  const orphans = [];
  css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').forEach(chunk => {
    const i = chunk.lastIndexOf('{');
    if (i === -1) return;
    const sel = chunk.slice(0, i);
    if (sel.indexOf('.is-modal') === -1) return;
    if (sel.indexOf('[style*="display: block"]') === -1) {
      orphans.push(sel.trim().replace(/\s+/g, ' ').slice(-90));
    }
  });
  check('no .is-modal rule is left without its live twin', orphans.length === 0,
    orphans.join('  ||  '));

  // The two that were dead, by name, so this exact regression cannot repeat silently.
  check('the sticky header rule reaches the live drawer',
    new RegExp(LIVE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\.cfg-drawer-head,').test(css));
  check('the pinned drag-handle rule reaches the live drawer',
    new RegExp(LIVE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\.node-drawer-resize,').test(css));

  // --drawer-w must be measured in LAYOUT pixels. The app runs under a desktop scale
  // factor, so getBoundingClientRect and offsetWidth disagree (684 vs 759, measured
  // live), and a CSS `right:` resolves against the latter.
  const view = read('fta_view_modules.js');
  check('--drawer-w is measured with offsetWidth, not a scaled client rect',
    /const w = panel\.offsetWidth;/.test(view) &&
    !/--drawer-w[\s\S]{0,200}getBoundingClientRect/.test(view));
}

console.log('\n[11] Cache-buster floors (FLOORS, never literals — parseFloat("65.40") === 65.4)');
{
  function pinAtLeast(doc, file, maj, min) {
    const m = new RegExp(file.replace('.', '\\.') + '\\?v=(\\d+)\\.(\\d+)').exec(doc);
    if (!m) return false;
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    return a > maj || (a === maj && b >= min);
  }
  check('safety_lab.css pin bumped for the new rules', pinAtLeast(html, 'safety_lab.css', 65, 48));
  check('fta_view_modules.js pin bumped for the width var', pinAtLeast(html, 'fta_view_modules.js', 66, 29));
  check('event_reuse.js pin is at its floor', pinAtLeast(html, 'event_reuse.js', 1, 2));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : 'RED — ' + fail + ' failed, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);
