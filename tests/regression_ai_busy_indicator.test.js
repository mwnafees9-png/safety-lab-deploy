#!/usr/bin/env node
/*
 * Regression: AI working indicator + nav simplification (build 66.14 / 66.13).
 *
 * 18 Aug 2026, two asks:
 *   • "when AI assistant is processing a request there is a constant toast showing
 *      AI working or something fancier/funnier" — ANEM chat was in _AI_BUSY_SKIP,
 *      so the only signal during a chat answer was a small "⋯ thinking" line inside
 *      the panel, invisible from any other tab.
 *   • "I dont like either of these two, get rid please, idea is to simplify the nav
 *      not add more items" — the sidebar's dashed "＋ Catalogue — N lanes" entry and
 *      the "⌘K Find anything" hint.
 *
 * Run:  node tests/regression_ai_busy_indicator.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');


// House rule (SL §7.3): pins are FLOORS, never literals — a literal breaks on the
// next legitimate bump, which is exactly what happened to this suite one batch
// after it was written. Compare major.minor as INTEGERS: parseFloat('72.10') is
// 72.1, which would silently read as older than 72.5.
function pinAtLeast(src, file, wantMajor, wantMinor) {
  const m = src.match(new RegExp(file.replace('.', '\\.') + '\\?v=(\\d+)\\.(\\d+)'));
  if (!m) return false;
  const maj = parseInt(m[1], 10), min = parseInt(m[2], 10);
  return maj > wantMajor || (maj === wantMajor && min >= wantMinor);
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

console.log('\n[1] Chat now raises the indicator; internal calls still do not');
{
  const ai = read('ai_assistant.js');
  const m = ai.match(/const _AI_BUSY_SKIP = \{[^}]*\}/);
  check('_AI_BUSY_SKIP found', !!m);
  check("chat.edit is no longer skipped", !!m && !/chat\.edit/.test(m[0]), m && m[0]);
  check('internal test/eval calls stay silent', !!m && /ai\.test/.test(m[0]) && /eval\.judge/.test(m[0]));
  check('chat carries a human label', /'chat\.edit': 'answering'/.test(ai));
  check('the indicator is still raised for the whole call (unchanged rail)',
    /slabAiBusyBegin\(_busyLabel\)/.test(ai) && /slabAiBusyEnd/.test(ai));
}

console.log('\n[2] The indicator says how long it has been working');
{
  const h = read('helpers_modules.js');
  check('elapsed formatter exists', /function _aiBusyFmtElapsed\(/.test(h));
  check('seconds under a minute, m:ss over it',
    /\(s < 60\) \? \(s \+ 's'\) : \(Math\.floor\(s \/ 60\) \+ ':' \+ String\(s % 60\)\.padStart\(2, '0'\)\)/.test(h));
  check('a start time is stamped when the indicator opens', /_aiBusy\.t0 = Date\.now\(\)/.test(h));
  check('a 1s tick drives the clock', /setInterval\(function \(\)[\s\S]{0,220}\}, 1000\)/.test(h));
  check('the clock only appears once the wait is worth noticing', /secs >= 3000 \?/.test(h));
  check('the tick is cleared when the last call finishes',
    /_aiBusy\.tick\) \{ try \{ clearInterval\(_aiBusy\.tick\); \} catch \(_\) \{\} _aiBusy\.tick = null; \}/.test(h));
  check('concurrent calls still collapse into one indicator with a count',
    /ai-busy-count/.test(h) && /_aiBusy\.n > 1/.test(h));
}

console.log('\n[3] The rotating line is about the WAIT — it never fakes telemetry');
{
  const h = read('helpers_modules.js');
  const m = h.match(/const _AI_BUSY_QUIPS = \[[\s\S]*?\];/);
  check('quip pool exists', !!m);
  const pool = m ? m[0] : '';
  check('it rotates on a slower cadence than the clock', /_n % 5 === 0/.test(h));
  check('it holds off until the wait is real', /secs >= 6000/.test(h));
  check('it repeats the product line: the engine owns the numbers',
    /engine still owns every number/.test(pool) && /no arithmetic is happening/.test(pool));
  // The one thing this must never do: narrate steps the system is not performing.
  ['consulting', 'searching', 'retrieving', 'analysing the tree', 'analyzing the tree', 'computing', 'calculating']
    .forEach(word => check('no invented step: "' + word + '"', !new RegExp(word, 'i').test(pool)));
  check('reduced motion is respected', /prefers-reduced-motion[\s\S]{0,120}ai-busy-quip\{animation:none/.test(h));
}

console.log('\n[4] Nav: both sidebar items are gone, the shortcut is not');
{
  const nav = read('nav_rail.js');
  check('the dashed Catalogue entry is gone', !/＋ Catalogue/.test(nav));
  check('the "Find anything" hint is gone', !/Find anything<\/span>/.test(nav));
  // SUPERSEDED 23 Aug 2026. This pinned the no-op's SURVIVAL — the 18 Aug removal
  // kept renderCatalogue() alive because boot and SL_NAV called it by name, so an
  // empty <div> was re-painted on a 6-second timer forever and the nav IA suite
  // pinned the div. Waqas, 23 Aug: "adding more clutter to remove clutter isnt a
  // wise move" — the compensating affordance was the error, and its corpse on a
  // timer worse. Both call sites and the export are gone with it, so the check
  // inverts: the no-op must NOT come back. Comments stripped — the note names
  // what it deleted.
  const navCode = nav.replace(/\/\/[^\n]*/g, '');
  check('renderCatalogue is DELETED, not preserved as a no-op',
    !/function renderCatalogue\(\)/.test(navCode) && !/asb-catalogue-slot/.test(navCode));
  check('the ⌘K palette itself still exists', /function openPalette/.test(nav) && /SL_NAV = \{ openPalette/.test(nav));
  const html = read('index.html');
  check('pins at or past this batch',
    pinAtLeast(html, 'nav_rail.js', 1, 1) && pinAtLeast(html, 'helpers_modules.js', 2, 32) &&
    pinAtLeast(html, 'bindings_modules.js', 1, 18) && pinAtLeast(html, 'ai_loader.js', 5, 5));
  check('ai_assistant pin at or past this batch in the loader',
    pinAtLeast(read('ai_loader.js'), 'ai_assistant.js', 72, 5));
}

console.log('\n[4b] The headline reads exactly what he asked for');
{
  const h = read('helpers_modules.js');
  // The file keeps the string escaped so it survives any editor/transfer; assert on
  // what it RENDERS as, not on the source bytes.
  const rendered = (function () {
    const m = h.match(/body\.innerHTML = '<div class="toast-msg">(.*?)' \+ clock/);
    return m ? JSON.parse('"' + m[1] + '"') : '';
  })();
  check('headline renders exactly "AI Working — Drum Roll Please"',
    /AI Working — Drum Roll Please/.test(rendered), rendered);
  check('a drum either side of it', (rendered.match(/\u{1F941}/gu) || []).length === 2, rendered);
  check('the old "AI is working — <label>" headline is gone', !/AI is working \u2014 ' \+ esc\(label\)/.test(h));
  check('what is actually running still shows underneath',
    /const sub = \(secs >= 6000/.test(h) && /: label;/.test(h));
  check('the quips alternate with the label rather than replacing it',
    /_aiBusy\.quip % 2 === 1/.test(h));
}

console.log('\n[5] The indicator is actually VISIBLE — the defect that made all of this moot');
{
  const css = read('safety_lab.css');
  const ai = read('ai_assistant.js');
  // What the toast has to outrank. These are the AI surfaces the busy toast is
  // raised FROM: assist overlays with a full-screen scrim, the chat panel, the
  // review panel. At z-index 3000 the toast was painted underneath all of them.
  const zs = (ai.match(/z-index:\s*(\d+)/g) || []).map(m => parseInt(m.replace(/\D/g, ''), 10));
  const highestAiLayer = Math.max.apply(null, zs.concat([0]));
  const m = css.match(/\.toast-stack \{[\s\S]*?z-index:\s*(\d+);/);
  const toastZ = m ? parseInt(m[1], 10) : 0;
  check('the AI layer really is far above the old 3000', highestAiLayer > 3000, 'highest AI z-index = ' + highestAiLayer);
  check('the toast stack now outranks every AI surface',
    toastZ > highestAiLayer, 'toast=' + toastZ + ' vs highest AI layer=' + highestAiLayer);
  check('the old 3000 is gone', toastZ !== 3000);
  const h = read('helpers_modules.js');
  check('the reveal does not depend on requestAnimationFrame alone (background tabs pause it)',
    /setTimeout\(\(\) => \{ try \{ el\.classList\.add\('show'\); \} catch \(_\) \{\} \}, 80\)/.test(h));
  check('every render re-asserts the show class',
    /if \(!_aiBusy\.el\.classList\.contains\('show'\)\) _aiBusy\.el\.classList\.add\('show'\)/.test(h));
  check('pins bumped for the visibility fix',
    pinAtLeast(read('index.html'), 'safety_lab.css', 65, 41) && pinAtLeast(read('index.html'), 'helpers_modules.js', 2, 33));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : fail + ' FAILED, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);
