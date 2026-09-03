/*
 * Version-pin floor comparison. 20 Aug 2026.
 *
 * The wall has ~29 assertions of the shape
 *     parseFloat((idx.match(/foo\.js\?v=([\d.]+)/) || [])[1]) >= 66.3
 * and every one of them is wrong, because a cache-buster pin is a VERSION, not a number.
 *
 * Two failure modes, and the second is the dangerous one:
 *
 *   LOUD   66.9 → 66.10 is a version increment but a float DECREMENT (66.1 < 66.9), so a
 *          correct bump fails the floor. This is how it surfaced: bumping data_ops_modules
 *          from 66.9 to 66.10 broke `>= 66.3`.
 *
 *   SILENT a stale pin PASSES a floor it should fail. Floor `>= 2.40` is read as `>= 2.4`,
 *          so a file still pinned at 2.9 sails through. Pin floors exist precisely to stop a
 *          stale cached file being served — the check that guards it was answering the wrong
 *          question and would have said yes.
 *
 * Component-wise, left to right, missing components read as 0. So 66.10 > 66.9, 2.40 > 2.9,
 * and 2.4 === 2.4.0.
 */
'use strict';

function cmpVersion(a, b) {
    const pa = String(a == null ? '' : a).split('.');
    const pb = String(b == null ? '' : b).split('.');
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
        const x = parseInt(pa[i], 10) || 0;
        const y = parseInt(pb[i], 10) || 0;
        if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
}

// true when `actual` is at or past `floor`. A missing/unparseable pin is never "at or past" —
// it means the script tag went away, which must fail rather than default open.
function pinAtLeast(actual, floor) {
    if (actual == null || actual === '' || !/^\d/.test(String(actual))) return false;
    return cmpVersion(actual, floor) >= 0;
}

// Pull a file's pin out of index.html (or any manifest text). Returns null when absent.
function pinOf(html, file) {
    const m = String(html).match(new RegExp(file.replace(/\./g, '\\.') + '\\?v=([\\d.]+)'));
    return m ? m[1] : null;
}

// The common case in one call: "is <file>'s pin in <src> at or past <floor>?"
// Returns false when the tag is absent — a dropped script tag must fail, not default open.
function atLeast(src, file, floor) {
    return pinAtLeast(pinOf(src, file), floor);
}

module.exports = { cmpVersion, pinAtLeast, pinOf, atLeast };
