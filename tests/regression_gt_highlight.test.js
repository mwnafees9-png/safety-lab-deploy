#!/usr/bin/env node
/*
 * Regression — golden-thread navigate-and-highlight (15 Aug 2026).
 *
 * THE BUG THIS PINS: _highlightArtifactRow(kind, id) queried
 * [data-artifact-kind][data-artifact-id] — and NO renderer ever stamped those
 * attributes. The selector matched nothing; the "flash the destination row"
 * behavior was dead code from birth, including for the backref panel that
 * dutifully called it. Fixed by stamping identity in reviewCellHtml (the one
 * choke point every reviewable row passes through) and wiring _gtvNavigateTo
 * to schedule the highlight after navigation.
 *
 * Pins:
 *   1. reviewCellHtml stamps data-artifact-kind/id on BOTH return branches
 *      (empty review cell and full kebab cell), executing the REAL function.
 *   2. systemId rides along as data-artifact-sys when present.
 *   3. _highlightArtifactRow targets the row (closest('tr')), not the td.
 *   4. _gtvNavigateTo schedules highlights for every table destination
 *      (acFunc, acFha, sysFha, cma, zsa, pra, acReq, sysReq) — membership
 *      assertions per HANDOFF §7.3, not counts.
 *
 * Run: node tests/regression_gt_highlight.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const misc = fs.readFileSync(path.join(SITE, 'misc_fn_modules.js'), 'utf8');
const helpers = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');

// ---- 1+2: execute the REAL reviewCellHtml with a stubbed world --------------
function extractFn(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) return null;
    let depth = 0, i = src.indexOf('{', start);
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
    }
    return null;
}
const fnSrc = extractFn(misc, 'reviewCellHtml');
check('reviewCellHtml extracted from source', !!fnSrc);

const ctx = {
    APPROVABLE_KINDS: new Set(['acFha']),
    Review: { isApproved: () => false },
    _approvalControlHtml: () => '<button>approve</button>',
    commentTriggerHtml: undefined,
    console,
};
vm.createContext(ctx);
vm.runInContext(fnSrc + '; this.__fn = reviewCellHtml;', ctx);

// empty branch: kind not approvable, no comment trigger -> bare cell, STILL stamped
const bare = ctx.__fn('zsa', 4711, null);
check('empty-branch cell carries data-artifact-kind', bare.includes('data-artifact-kind="zsa"'), bare);
check('empty-branch cell carries data-artifact-id', bare.includes('data-artifact-id="4711"'), bare);

// full branch: approvable kind -> kebab cell, stamped, with sys attribute
const full = ctx.__fn('acFha', 7101, 'sys-fcs');
check('full-branch cell carries data-artifact-kind', full.includes('data-artifact-kind="acFha"'));
check('full-branch cell carries data-artifact-id', full.includes('data-artifact-id="7101"'));
check('systemId rides as data-artifact-sys', full.includes('data-artifact-sys="sys-fcs"'));
check('full branch still renders the kebab', full.includes('row-kebab'));

// null-identity guard unchanged: no kind -> unstamped bare cell
const none = ctx.__fn(null, 1, null);
check('no-kind cell stays unstamped', !none.includes('data-artifact-kind'));

// ---- 3: highlight targets the ROW -------------------------------------------
const hlSrc = extractFn(misc, '_highlightArtifactRow');
check('_highlightArtifactRow extracted', !!hlSrc);
check('highlight climbs to closest tr', /closest\s*&&\s*el\.closest\('tr'\)|el\.closest\('tr'\)/.test(hlSrc.replace(/\s+/g, ' ')) || hlSrc.includes("closest('tr')"));
check('highlight returns a hit/miss boolean (retry contract)', hlSrc.includes('return false') && hlSrc.includes('return true'));

// ---- 4: the navigator schedules highlights ----------------------------------
const navSrc = extractFn(helpers, '_gtvNavigateTo');
check('_gtvNavigateTo extracted', !!navSrc);
['acFunc', 'acFha', 'sysFha', 'cma', 'zsa', 'pra', 'acReq', 'sysReq'].forEach(k => {
    check('navigator schedules highlight for ' + k, navSrc.includes("hl('" + k + "'"));
});
check('navigator retries a missed highlight (async workspace render)', navSrc.includes('setTimeout') && /if\(!ok\)/.test(navSrc.replace(/\s+/g, '')));
check('workspace destinations use a longer delay', /hl\('sysFha',\s*r\.id,\s*\d+\)/.test(navSrc));

console.log('\n' + (fail ? 'FAILURES: ' + fail : 'ALL ' + pass + ' CHECKS PASSED'));
process.exit(fail ? 1 : 0);
