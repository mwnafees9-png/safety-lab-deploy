/*
 * pdf_text.js (15 Oct 2026): rebuild the lines and paragraphs of one PDF page from pdf.js text items.
 *
 * The AI Inputs reader used to join every text item of a page with a space, so a page became one
 * long line: section headings ("6.2 Bird strike margins") ran into the body text and the zonal AI
 * could never anchor a passage to its section. This keeps the page's layout the way a Word file
 * keeps it: one line per printed line, and a blank line where the vertical gap shows a new paragraph.
 *
 * pageText(items) -> string. items are pdf.js getTextContent().items ({ str, transform, height, hasEOL }).
 * Within a line, items are joined with a space exactly as before, so a quote that matched the old
 * text still matches after whitespace is normalized.
 */
(function (root) {
    'use strict';
    function pageText(items) {
        var lines = [], cur = [], curY = null, curH = 0;
        function flush() {
            if (!cur.length) return;
            var t = cur.join(' ').replace(/[ \t]+/g, ' ').trim();
            if (t) lines.push({ text: t, y: curY, h: curH });
            cur = []; curY = null; curH = 0;
        }
        (items || []).forEach(function (it) {
            if (!it || typeof it.str !== 'string') return;            // marked-content items carry no text
            var y = it.transform && typeof it.transform[5] === 'number' ? it.transform[5] : null;
            var h = Math.abs(Number(it.height) || (it.transform ? Number(it.transform[3]) : 0) || 0);
            // a new baseline more than half a line away starts a new line (pdf.js does not always set hasEOL)
            if (cur.length && y !== null && curY !== null && Math.abs(y - curY) > Math.max(1, 0.5 * Math.max(h, curH))) flush();
            if (it.str !== '') { cur.push(it.str); if (curY === null) curY = y; if (h > curH) curH = h; }
            if (it.hasEOL) flush();
        });
        flush();
        var out = [];
        lines.forEach(function (ln, i) {
            var prev = lines[i - 1];
            // a gap between baselines of more than 1.6 line heights is a paragraph break
            if (prev && prev.y !== null && ln.y !== null) {
                var lh = Math.max(prev.h, ln.h, 1);
                if (Math.abs(prev.y - ln.y) > 1.6 * lh) out.push('');
            }
            out.push(ln.text);
        });
        return out.join('\n');
    }
    var api = { pageText: pageText };
    try { root.SLPdfText = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
