// =============================================================================
// spec_index.js — deterministic source-document index + per-lane targeting
// (30 Aug 2026, Waqas: "maybe a more targeted specs is the way to go").
// -----------------------------------------------------------------------------
// WHAT THIS IS. Every unified lane used to receive the ENTIRE source document
// — all systems, all chapters — on every call. For a severity judgment on one
// braking condition the model was re-reading the oxygen system. This module
// parses the document's own numbered structure (chapters and two-level
// sections, the same shapes the F1c coverage banner reads) and gives
// _projectDocContext a DETERMINISTIC, DECLARED selection per feature.
//
// RULES OF THIS FILE.
// - Deterministic and pure: no model involvement, no clock, no RNG. The same
//   document and feature always select the same text.
// - CONSERVATIVE: a chapter is dropped only when it is POSITIVELY classified
//   as irrelevant to the lane (today: zonal/routing chapters for the
//   function/hazard lanes). Unclassified content is always kept. A document
//   with no parseable structure is returned WHOLE — the 26 Aug ruling stands:
//   never silently starve a lane; the whole thing goes, or a named selection
//   goes, and the selection is written into the context header the model sees.
// - Zonal lanes (zsa/pra) are untouched by design — the chapters the hazard
//   lanes drop are exactly the ones they need.
// - Changing a POLICY here is a methodology change: run the eval harness
//   (eval/EXPORT_RUN.md) before shipping, bump this file's ?v= pin.
// =============================================================================
(function () {
    'use strict';

    // ---- parsing -----------------------------------------------------------
    // Top-level chapter headings: "N Title" (N un-dotted). Two-level sections:
    // "N.N Title", grouped across mirrored chapters by parenthetical system
    // code — the same shapes the F1c coverage checklist proved out on real
    // extracted-PDF text (run-on lines, subsection numbers adjacent).
    // v1.1 (30 Aug, same day): the first live probe showed the v1.0 parser
    // anchoring chapters at their TABLE-OF-CONTENTS lines — the selection
    // "dropped" 310 chars of TOC and kept both zonal chapters whole. Three
    // discriminators, all read off the real document: a BODY heading has
    // exactly ONE space between number and title (table rows have column
    // whitespace), a TOC entry is followed by dot leaders, and "25 August
    // 2026" is a date, not chapter 25.
    var CHAPTER_RE = /(?:^|[^0-9.])(\d{1,2})(?!\.\d|\d|\)) ([A-Z][A-Za-z][\w\-&/() ,–—'’]{4,60}?)(?=\s{2,}|[.:;\n]|$)/gm;
    var MONTH_RE = /^(January|February|March|April|May|June|July|August|September|October|November|December)\b/;
    var SECTION_RE = /(?:^|[^0-9.])(\d{1,2})\.(\d{1,2})(?!\.\d|\d)\s+([A-Z][A-Za-z][\w\-&/() ,–—'’]{3,60}?)(?=\s{2,}|[.:;\n]|$)/gm;

    var ZONAL_TITLE = /zone|zonal|routing|schematic/i;
    var OVERVIEW_TITLE = /overview|architecture|mission|general|introduction/i;

    function build(srcText) {
        var t = String(srcText || '');
        var chapters = [];
        var seen = {};
        var m;
        CHAPTER_RE.lastIndex = 0;
        while ((m = CHAPTER_RE.exec(t)) !== null) {
            var num = +m[1];
            if (num < 1 || num > 30 || seen[num]) continue;
            if (MONTH_RE.test(m[2])) continue;                          // a date, not a chapter
            if (/\.{6,}/.test(t.slice(m.index, m.index + 120))) continue;   // TOC dot leaders
            seen[num] = true;
            chapters.push({ num: num, title: m[2].trim().replace(/\s+/g, ' '), at: m.index });
        }
        chapters.sort(function (a, b) { return a.at - b.at; });
        // monotonic guard: a stray later match of a LOWER number (an appendix
        // back-reference, a figure caption) must not scramble the ranges
        var mono = []; var lastNum = 0;
        chapters.forEach(function (c) { if (c.num > lastNum) { mono.push(c); lastNum = c.num; } });
        chapters = mono;
        // a chapter's range runs to the next chapter's heading (or EOF)
        for (var i = 0; i < chapters.length; i++) {
            chapters[i].start = chapters[i].at;
            chapters[i].end = (i + 1 < chapters.length) ? chapters[i + 1].at : t.length;
        }
        // coded two-level sections — for classifying "systems" chapters AND for
        // per-system narrowing. Occurrences are kept only when they fall INSIDE
        // a body chapter's range: the TOC lists sections too, and the ranges are
        // what exclude those listing lines (the v1.1 lesson, applied here).
        var codedByChapter = {};
        SECTION_RE.lastIndex = 0;
        var secOccs = [];
        while ((m = SECTION_RE.exec(t)) !== null) {
            var title = m[3].trim().replace(/\s+/g, ' ');
            var cut = title.match(/^(.*?\(([A-Z][A-Z0-9]{1,5})\))/);
            if (!cut) continue;
            var ch = +m[1];
            if (!codedByChapter[ch]) codedByChapter[ch] = [];
            codedByChapter[ch].push({ sec: m[1] + '.' + m[2], code: cut[2], title: cut[1] });
            secOccs.push({ chNum: ch, sec: m[1] + '.' + m[2], code: cut[2], title: cut[1], at: m.index });
        }
        chapters.forEach(function (c) {
            var inRange = secOccs.filter(function (o) { return o.chNum === c.num && o.at >= c.start && o.at < c.end; });
            inRange.sort(function (a, b) { return a.at - b.at; });
            var seenSec = {};
            c.sections = inRange.filter(function (o) { if (seenSec[o.sec]) return false; seenSec[o.sec] = true; return true; });
            for (var k = 0; k < c.sections.length; k++) {
                c.sections[k].start = c.sections[k].at;
                c.sections[k].end = (k + 1 < c.sections.length) ? c.sections[k + 1].at : c.end;
            }
        });
        // classes
        chapters.forEach(function (c) {
            var coded = codedByChapter[c.num] || [];
            if (coded.length >= 3) c.cls = 'systems';
            else if (ZONAL_TITLE.test(c.title)) c.cls = 'zonal';
            else if (c.num === (chapters[0] && chapters[0].num) || OVERVIEW_TITLE.test(c.title)) c.cls = 'overview';
            else c.cls = 'other';
            c.codes = coded;
        });
        // NOTE: a chapter can be BOTH systems-coded and zonal-titled (ch.6
        // "Zonal Model & System Schematics" carries per-system coded sections).
        // Coded wins above — systems content is never dropped by the zonal rule
        // unless it carries no coded sections. Conservative by construction.
        return {
            text: t,
            chapters: chapters,
            hasStructure: chapters.length >= 3,
            preambleEnd: chapters.length ? chapters[0].start : t.length,
        };
    }

    // ---- per-feature policy ------------------------------------------------
    // Which chapter CLASSES a feature's context can safely omit. Drop-list,
    // never a keep-list: anything not named here is kept.
    var DROP = {
        'arch.decompose': ['zonal'],
        'arch.recommend': ['zonal'],
        'fcim.populate':  ['zonal'],
        'fcim.draft':     ['zonal'],
        'fha.populate':   ['zonal'],
        'sfha.populate':  ['zonal'],
        'fha.draft':      ['zonal'],
        'sfha.draft':     ['zonal'],
        'req.recommend':  ['zonal'],
        // zsa.draft / pra.draft / cma.draft deliberately absent: the zonal
        // chapters are exactly what those lanes ground on.
    };

    // v1.2 — per-system narrowing. `secs` is the list of two-level section
    // prefixes the SELECTED SCOPE cites (extracted from the chosen rows' \u00a7
    // citations by the engine). When present and resolvable, the systems
    // chapters carry ONLY the cited systems' sections (a cited section's CODE
    // pulls its mirror in every systems chapter — 5.3 brings 6.3). Fail-safes:
    // no secs, nothing resolvable, or a chapter without parsed sections \u2192 that
    // narrowing simply does not happen; chapter-level rules still apply.
    function select(srcText, feature, secs) {
        var idx = build(srcText);
        var drop = DROP[String(feature || '')] || null;
        if (!drop || !idx.hasStructure) {
            return { text: idx.text, targeted: false, note: '', kept: null, omitted: null };
        }
        // resolve requested section prefixes -> system codes (across all chapters)
        var codes = {};
        var resolved = false;
        if (Array.isArray(secs) && secs.length) {
            idx.chapters.forEach(function (c) {
                (c.sections || []).forEach(function (sec) {
                    if (secs.indexOf(sec.sec) >= 0) { codes[sec.code] = true; resolved = true; }
                });
            });
        }
        var kept = [], omitted = [], narrowedNote = [], omittedSections = 0;
        var out = idx.text.slice(0, idx.preambleEnd);   // preamble always kept
        idx.chapters.forEach(function (c) {
            if (drop.indexOf(c.cls) >= 0) { omitted.push(c.num + ' ' + c.title); return; }
            if (resolved && c.cls === 'systems' && (c.sections || []).length) {
                // chapter intro (heading up to the first section) always kept
                var chOut = idx.text.slice(c.start, c.sections[0].start);
                var took = [];
                c.sections.forEach(function (sec) {
                    if (codes[sec.code]) { chOut += idx.text.slice(sec.start, sec.end); took.push(sec.sec); }
                    else omittedSections++;
                });
                kept.push(c.num + ' ' + c.title + ' (\u00a7' + (took.join(', \u00a7') || 'intro only') + ')');
                out += chOut;
                return;
            }
            kept.push(c.num + ' ' + c.title);
            out += idx.text.slice(c.start, c.end);
        });
        if (resolved) narrowedNote.push('Systems chapters are NARROWED to the sections the selected scope cites (' +
            Object.keys(codes).join(', ') + '); ' + omittedSections + ' other system section(s) omitted.');
        // never let the CHAPTER policy hollow the document: if it would drop most
        // of it, send the whole thing instead — a wrong parse must fail SAFE.
        // Per-system narrowing is exempt: a deep cut there is the REQUESTED
        // behavior, guarded instead by the resolve step above.
        if (!omitted.length && !resolved) return { text: idx.text, targeted: false, note: '', kept: null, omitted: null };
        if (!resolved && out.length < idx.text.length * 0.4) {
            return { text: idx.text, targeted: false, note: '', kept: null, omitted: null };
        }
        var note = 'TARGETED EXTRACT (deterministic, by chapter): included ' + kept.join('; ') +
            (omitted.length ? '. Omitted as out-of-scope for this analysis: ' + omitted.join('; ') : '') +
            (narrowedNote.length ? ' ' + narrowedNote.join(' ') : '') +
            '. The full document remains on file — if the omitted material seems needed for a judgment, say so rather than guessing.';
        return { text: out, targeted: true, note: note, kept: kept, omitted: omitted, narrowed: resolved };
    }

    window.SLABSpecIndex = { version: 1.3, build: build, select: select, _DROP: DROP };
})();
