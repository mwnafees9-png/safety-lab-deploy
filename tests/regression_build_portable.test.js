#!/usr/bin/env node
/*
 * Regression — build.sh runs correctly on macOS (23 Sep 2026).
 *
 * THE DEFECT: build.sh's "Top-level files in site/ NOT published" check used
 * GNU find's -printf. macOS find has no -printf, so on the Mac — where every
 * real build runs — find errored inside a process substitution, the loop read
 * nothing, and the check printed "(none)" no matter what sat in site/. The
 * list exists to surface leftovers like the .fuse_hidden* copies of
 * ai_assistant.js that once shipped; it had been silently off.
 *
 * PINNED:
 *   P1  the check is EXECUTED here (extracted from build.sh, run in bash) on
 *       a fixture: hidden junk and an unlisted file type are reported; a
 *       published page and .js files are not
 *   P2  an empty/unreadable site/ is a hard error, never "(none)"
 *   P3  build.sh and ship.sh use none of the GNU-only options that silently
 *       misbehave on macOS (find -printf, readlink -f, date -d, stat -c,
 *       grep -P, xargs -r, sed -i with no backup argument)
 * Run: node tests/regression_build_portable.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const BUILD = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8');

const a = BUILD.indexOf('echo "  Top-level files in site/ NOT published:"');
const b = BUILD.indexOf('# 3) Copy any subdirectories verbatim.');
check('the unpublished-files block extracts from build.sh', a > 0 && b > a);
const block = BUILD.slice(a, b);

function runBlock(src, out) {
    const script = 'set -u\nSRC="' + src + '"\nOUT="' + out + '"\n' + block;
    const r = cp.spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr };
}

// ---- P1 ------------------------------------------------------------------------------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-build-'));
    const src = path.join(tmp, 'site'), out = path.join(tmp, 'dist');
    fs.mkdirSync(src); fs.mkdirSync(out);
    fs.writeFileSync(path.join(src, 'index.html'), 'x'); fs.writeFileSync(path.join(out, 'index.html'), 'x');   // published
    fs.writeFileSync(path.join(src, 'app.js'), 'x');                                                            // JS: handled by the minifier, not listed
    fs.writeFileSync(path.join(src, '.fuse_hidden0000001500000001'), 'x');                                     // hidden junk
    fs.writeFileSync(path.join(src, 'NOTES.md'), 'x');                                                          // a type the allowlist does not publish
    fs.writeFileSync(path.join(src, '..odd'), 'x');                                                             // a name starting with two dots
    const r = runBlock(src, out);
    check('P1: runs cleanly in bash', r.code === 0, r.err);
    check('P1: hidden junk is reported', /\.fuse_hidden0000001500000001/.test(r.out), r.out);
    check('P1: an unpublished file type is reported', /NOTES\.md/.test(r.out));
    check('P1: a "..name" file is reported', /\.\.odd/.test(r.out));
    check('P1: a published page is not reported', !/index\.html/.test(r.out));
    check('P1: .js files are not reported', !/app\.js/.test(r.out));
    check('P1: it does not claim "(none)" when there is something', !/\(none\)/.test(r.out));
    fs.unlinkSync(path.join(src, '.fuse_hidden0000001500000001')); fs.unlinkSync(path.join(src, 'NOTES.md')); fs.unlinkSync(path.join(src, '..odd'));
    const r2 = runBlock(src, out);
    check('P1: a clean site/ reports "(none)"', r2.code === 0 && /\(none\)/.test(r2.out), r2.out + r2.err);
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- P2 ------------------------------------------------------------------------------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-build-'));
    const r = runBlock(path.join(tmp, 'missing-site'), path.join(tmp, 'dist'));
    check('P2: a site/ with no files is a hard error, never "(none)"', r.code !== 0 && !/\(none\)/.test(r.out) && /refusing/.test(r.err), JSON.stringify(r));
    fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- P3 ------------------------------------------------------------------------------
{
    const GNU_ONLY = [
        [/\bfind\b[^\n]*-printf\b/, 'find -printf'],
        [/\breadlink\s+-f\b/, 'readlink -f'],
        [/\bdate\s+-d\b/, 'date -d'],
        [/\bstat\s+-c\b/, 'stat -c'],
        [/\bgrep\s+(-\w*P\w*)\b/, 'grep -P'],
        [/\bxargs\s+-r\b/, 'xargs -r'],
        [/\bsed\s+-i\s+(?!''|"")['"]?[s\/]/, "sed -i without a backup argument"]
    ];
    for (const f of ['build.sh', 'ship.sh']) {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
        const hits = GNU_ONLY.filter(([re]) => re.test(src)).map(([, n]) => n);
        check('P3: ' + f + ' uses no GNU-only options that misbehave on macOS', hits.length === 0, hits.join(', '));
    }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
