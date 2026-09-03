#!/usr/bin/env node
/*
 * Regression — desktop scaling: the heap ceiling and windowed virtualization
 * (7 Aug 2026).
 *
 * Two defects this pins against returning.
 *
 * (1) The desktop build inherited the browser's memory posture. It wraps the same
 *     bundle, so it also inherited V8's default old-space ceiling — sized for a web
 *     page, not for the workstation the app is installed on. The switch must be
 *     appended BEFORE app-ready; a js-flags switch set after ready is silently
 *     ignored, which is the failure that looks like it worked.
 *
 * (2) Virtualization was opt-in everywhere and keyed to a FIXED ~34px row-height
 *     estimate. The estimate is why it was held back — in an unknown browser at an
 *     unknown zoom a wrong height misplaces the scroll window. That reason does not
 *     apply in the desktop shell, which is a known Chromium AND now measures a real
 *     row. So desktop defaults ON, browser stays opt-in, and an explicit off wins
 *     everywhere.
 *
 * These checks EXECUTE the real predicates out of the real module — an extracted
 * copy would go stale the moment the gate moved.
 *
 * Run: node tests/regression_desktop_scale.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const SRC = fs.readFileSync(path.join(SITE, 'support_modules.js'), 'utf8');

// ---- extract the two pure predicates and run them for real ------------------
function load(win, loc, ls) {
    const ctx = { window: win, location: loc, navigator: win.navigator || {},
        localStorage: { getItem: k => (k in ls ? ls[k] : null) },
        _VIRTUAL_ROW_H: 34, console: { log() {}, warn() {}, error() {} } };
    ctx.window.window = ctx.window;
    vm.createContext(ctx);
    const grab = name => {
        const i = SRC.indexOf('function ' + name + '(');
        if (i < 0) throw new Error('missing ' + name);
        // take to the end of the function by brace matching
        let d = 0, j = SRC.indexOf('{', i);
        for (let k = j; k < SRC.length; k++) {
            if (SRC[k] === '{') d++;
            else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
        }
        throw new Error('unbalanced ' + name);
    };
    vm.runInContext([grab('_slIsDesktopShell'), grab('_virtualizeEnabled'), grab('_rowHeight')].join('\n'), ctx);
    return ctx;
}
const desktopWin = { __slabDesktop: true, navigator: { userAgent: 'Mozilla/5.0 Chrome/126 Electron/31.7.0 Safety Lab Aero' } };
const browserWin = { navigator: { userAgent: 'Mozilla/5.0 Chrome/126 Safari/537.36' } };
const noQuery = { search: '' };

console.log('\n[desktop-scale] the virtualization gate');
check('desktop shell defaults virtualization ON',
    load(desktopWin, noQuery, {})._virtualizeEnabled() === true,
    'this is the whole point: the desktop is a known Chromium and measures its rows');
check('a plain browser still defaults OFF',
    load(browserWin, noQuery, {})._virtualizeEnabled() === false,
    'web behaviour must not change — the row-height risk that held it back is still real there');
check('the Electron user-agent is enough on its own (no injected global)',
    load({ navigator: { userAgent: 'Chrome/126 Electron/31.7.0' } }, noQuery, {})._virtualizeEnabled() === true);
check('?virtualize=1 still opts a browser in',
    load(browserWin, { search: '?virtualize=1' }, {})._virtualizeEnabled() === true);
check('localStorage opt-in still works in a browser',
    load(browserWin, noQuery, { SLA_VIRTUALIZE: '1' })._virtualizeEnabled() === true);
check('?virtualize=0 forces it OFF even on desktop',
    load(desktopWin, { search: '?virtualize=0' }, {})._virtualizeEnabled() === false,
    'an escape hatch that does not work on the platform where the feature is default is not an escape hatch');
check('SLA_VIRTUALIZE=0 forces it OFF even on desktop',
    load(desktopWin, noQuery, { SLA_VIRTUALIZE: '0' })._virtualizeEnabled() === false);
check('a hostile location object cannot throw the gate open',
    (() => { const c = load(desktopWin, null, {}); try { return c._virtualizeEnabled() === false; } catch (_) { return false; } })(),
    'the try/catch must fail CLOSED, not crash the render path');

console.log('\n[desktop-scale] row height is measured, not assumed');
{
    const c = load(desktopWin, noQuery, {});
    const tbodyWith = h => ({ querySelector: () => ({ getBoundingClientRect: () => ({ height: h }) }) });
    check('a real rendered row wins over the 34px estimate', c._rowHeight(tbodyWith(41.5)) === 41.5);
    check('no rows yet → falls back to the estimate', c._rowHeight({ querySelector: () => null }) === 34);
    check('a collapsed row (height 0) is REFUSED, not propagated', c._rowHeight(tbodyWith(0)) === 34,
        'a zero height divides into the scroll offset and blows the window calculation up');
    check('an absurd height is refused too', c._rowHeight(tbodyWith(9000)) === 34);
    check('a missing tbody is survivable', c._rowHeight(null) === 34);
}
check('the scroll window consumes the MEASURED height, not the constant',
    /_visibleWindow\([^)]*_rowHeight\(tbody\)/.test(SRC),
    'if this reverts to _VIRTUAL_ROW_H the measurement is decorative');

console.log('\n[desktop-scale] the desktop heap ceiling');
{
    const MAIN = path.join(__dirname, '..', '..', 'safety-lab-desktop', 'main.js');
    if (!fs.existsSync(MAIN)) {
        console.log('  SKIP  desktop main.js not present beside this repo');
    } else {
        const M = fs.readFileSync(MAIN, 'utf8');
        check('a max-old-space-size flag is assembled', /--max-old-space-size=/.test(M) && /HEAP_MB/.test(M));
        check('it is sized from real system memory, not a constant', /os\.totalmem\(\)/.test(M) && /HEAP_MB/.test(M));
        check('it is applied BEFORE app.whenReady — a switch set after ready is ignored',
            M.indexOf("appendSwitch('js-flags'") < M.indexOf('app.whenReady'),
            'ordering is the whole correctness condition here, and it fails silently');
        check('the achieved ceiling is MEASURED in the renderer and reported',
            /performance(&&|\s)*\.?memory|performance&&performance\.memory/.test(M) && /reportHeapCeiling/.test(M),
            'the requested number is not the granted number — Chromium pointer compression caps the cage');
        check('the cap stays at or below the 4 GB pointer-compression cage',
            (() => { const m = /Math\.min\((\d+),/.exec(M); return !!m && parseInt(m[1], 10) <= 4096; })(),
            'precautionary: above the cage the flag buys nothing. NOT a measured failure threshold — the 7 Aug SIGKILL was XProtect blocking the Electron binary, not this switch');
        check('a one-command escape hatch exists to isolate a launch failure',
            /SLAB_HEAP_MB/.test(M) && /HEAP_MB > 0/.test(M),
            'when the app dies on start you need to bisect without editing the file');
        check('the corrected diagnosis is recorded, not the wrong one',
            /XProtect/.test(M) && /CORRECTION/.test(M),
            'a false measured claim left in a comment is worse than no comment');
        check('the pointer-compression caveat is written down for the next maintainer',
            /pointer compression/i.test(M),
            'without this someone raises the number, measures nothing, and believes it worked');

        // ---- the call-stack size: the ONE thing a browser tab cannot do -------
        // Measured 7 Aug: memory is NOT the wall on a large tree — peak heap at
        // 2,000,000 basic events was 1.4 GB of the ~4 GB cage. Stack depth is. At
        // V8's default (~1 MB) a tree of roughly 400,000 basic events dies with
        // `RangeError: Maximum call stack size exceeded`; --stack-size=4000 cleared
        // it and carried 2,000,000 events / ~3,000,000 canvas nodes to an exact
        // answer. This single flag is the whole browser-vs-desktop ceiling gap the
        // scalability assessment quotes (~300,000 events against >= 2,000,000).
        check('a --stack-size flag is assembled', /--stack-size=/.test(M) && /STACK_KB/.test(M),
            'without it the desktop ceiling is the browser ceiling and the desktop build has no scale story');
        check('the stack size is a fixed default, not derived from the machine',
            /STACK_KB = STACK_ENV[\s\S]{0,200}: 4000;/.test(M),
            'same determinism argument as the node budget — two machines must not fail at different tree sizes');
        check('the default is at least 4 MB (the measured-sufficient value)',
            (() => { const m = /const STACK_KB =[\s\S]{0,300}?:\s*(\d+);/.exec(M); return !!m && parseInt(m[1], 10) >= 4000; })(),
            'measured: 4000 carried 2,000,000 basic events; below that the RangeError returns');
        check('a one-command escape hatch exists for the stack switch too',
            /SLAB_STACK_KB/.test(M) && /STACK_KB > 0/.test(M),
            'a bad stack size makes V8 fail during init — you need to bisect it without editing the file');

        // ---- both flags must reach V8 in ONE switch ---------------------------
        // appendSwitch('js-flags', ...) called twice does NOT concatenate:
        // Chromium keys switches in a map, so the second call REPLACES the first
        // and silently drops whichever flag was appended earlier. This is the kind
        // of bug that looks like it works — the app launches either way.
        check('js-flags is appended EXACTLY ONCE',
            (M.match(/commandLine\.appendSwitch\('js-flags'/g) || []).length === 1,
            'two appendSwitch calls on the same key means the second wins and the first flag is silently lost');
        check('…and it carries both flags, assembled before the append',
            /JS_FLAGS\.join\(/.test(M) && /JS_FLAGS\.push\('--max-old-space-size=/.test(M) && /JS_FLAGS\.push\('--stack-size=/.test(M));
        check('the stack switch is also applied BEFORE app.whenReady',
            M.indexOf('--stack-size=') < M.indexOf('app.whenReady'),
            'same silent-failure mode as the heap switch: a js-flags switch set after ready is ignored');
        check('the achieved stack size is reported alongside the heap ceiling',
            /STACK_KB/.test(M) && /reportHeapCeiling|heap ceiling/.test(M) && /stack '/.test(M),
            'the log is what a support call reads; a flag nobody can confirm took effect is not evidence');
        check('the reason a browser cannot do this is written down',
            /browser tab cannot|BROWSER TAB CANNOT/.test(M),
            'this is the justification for quoting two different ceilings in the scalability assessment — it must not be folklore');
    }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
