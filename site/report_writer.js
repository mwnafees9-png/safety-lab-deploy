/* report_writer.js v1.2 (6 Nov 2026: the titles of the CoFFE, MAC, MF&MS, independence principle and CCMR tables say what they are). v1.0 (31 Oct 2026): one writer for every report, Word and PDF (customer checklist items 20, 22, 24).
 *
 * The report builders (reports.js: the dialog's section editor and the one-shot Reports.generate) describe a report
 * as a list of blocks; this writer turns the same list into a Word file and a PDF, so both formats always carry the
 * same things:
 *   - a contents page, a list of tables and a list of figures, each entry linked to its place (page numbers in Word
 *     fill when the file opens; the PDF numbers them directly);
 *   - every table and every figure numbered with a caption, and cross references in the prose ({{ref:fha_table}},
 *     {{ref:fta}}, {{ref:fta:<tree>}}, {{ref:sec:<heading>}}) written as "Table 3" / "Figure 2" / "Section ..." and
 *     linked; a reference that points at nothing is written as such and listed by check() before generating;
 *   - fault trees on landscape pages at their natural size (fta_print.js: 7.5 pt text, split at transfers);
 *   - numbers in exponent form (1.234E-7, 1.234×10^-7) written to the project's significant figures setting
 *     (never padded: a number typed with fewer figures keeps them).
 * Model: { title, titleLines (the lines under the title), headerText, projectName, sigFigs, blocks }.
 * Blocks: {k:'h', level, text, pill}, {k:'p', text}, {k:'blank'}, {k:'table', name, rows}, {k:'appendix', title},
 *         {k:'sheets', sheets:[{caption, title, pageId, dataUrl, w, h}]}, {k:'note', text}.
 */
(function (root) {
    'use strict';
    var VERSION = '1.2';
    function S(v) { return String(v == null ? '' : v); }

    // ---- table titles (a table token with no title here is named from its token) ---------------------------------
    var TITLES = {
        fha_table: 'Failure conditions', requirements_table: 'Requirements', component_list: 'Components', pra_table: 'Particular risk evaluations',
        zsa_table: 'Zonal safety findings', cma_table: 'Common mode analyses', fta_summary: 'Fault tree summary', assumptions_list: 'Assumptions',
        afha_worksheet: 'Aircraft FHA worksheet', sfha_worksheet: 'System FHA worksheet', fta_summary_grid: 'Fault tree results by failure condition',
        cma_grid: 'Common mode analysis', coffe_table: 'Combined functional failure effects (CoFFE)', validation_matrix: 'Requirements validation matrix',
        verification_matrix: 'Requirements verification matrix', compliance_posture: 'Compliance posture', fc_evaluations: 'Failure condition evaluations',
        gaps_table: 'Open gaps', goldenthread_table: 'Golden thread', interdep_table: 'System interdependencies', common_resource_table: 'Common resources',
        mac_table: 'Minimum acceptable configuration model', mfms_table: 'Malfunction and failure mode summary trees', ip_ledger_table: 'Independence principles', ccmr_table: 'Candidate certification maintenance requirements',
        wearout_table: 'Wear-out items', fmes_table: 'Failure modes and effects summary', checklist_table: 'Checklist', tailoring_table: 'Tailoring',
        program_scope_table: 'Program scope', fmea_functional_table: 'Functional FMEA', fmea_piecepart_table: 'Piece-part FMEA', ram_prediction_table: 'Reliability prediction',
        ram_alloc_table: 'Reliability allocation', ram_ledger_table: 'Reliability ledger', ram_spares_table: 'Spares', ram_weibull_table: 'Weibull analysis',
        ram_growth_table: 'Reliability growth', fracas_table: 'FRACAS', lcc_table: 'Life cycle cost', sneak_table: 'Sneak circuit analysis', swrel_table: 'Software reliability',
        tol_derate_table: 'Tolerance and derating', msg3_table: 'MSG-3 analysis', mmel_table: 'MMEL items', et_table: 'Event trees', bowtie_table: 'Bowties',
        stpa_losses_table: 'Losses', stpa_hazards_table: 'Hazards', stpa_constraints_table: 'Safety constraints', stpa_cs_table: 'Control structure', stpa_resp_table: 'Responsibilities',
        stpa_uca_table: 'Unsafe control actions', stpa_scenario_table: 'Loss scenarios', stpa_test_table: 'STPA tests', stpa_archetype_table: 'STPA archetypes',
        stpa_conformance_table: 'STPA conformance', stpa_bridge_table: 'STPA to FHA bridge', budget_ledger_table: 'Budget ledger', ffs_table: 'Functional failure summary',
        sora_summary_table: 'SORA summary', sora_oso_table: 'Operational safety objectives', rate_sources_table: 'Failure rate sources', latent_plus_one_table: 'Latent plus one',
        zsa_appx: 'Zonal safety analysis', pra_appx: 'Particular risk analysis', cma_appx: 'Common mode analysis', src_appx: 'Requirements and assumptions by source analysis'
    };
    function tableTitle(name) { return TITLES[name] || S(name).replace(/_(table|list)$/, '').replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); }
    // a table token is any {{name}} whose value is a list of rows; a scalar token is anything else
    function isTableValue(v) { return Array.isArray(v) && v.every(function (r) { return r && typeof r === 'object' && !Array.isArray(r); }); }

    // ---- significant figures ---------------------------------------------------------------------------------
    var NUM_RE = /(^|[^\w.])(-?\d+(?:\.\d+)?)(\s*[eE]\s*([+-]?\d+)|\s*[x×]\s*10\s*\^\s*([+-]?\d+))(?!\w|\.\d)/g;
    function _sig(m) { return S(m).replace(/^-/, '').replace('.', '').replace(/^0+/, '').length || 1; }
    function fmtSig(text, n) {
        n = Number(n); if (!(n >= 1 && n <= 6)) return S(text);
        return S(text).replace(NUM_RE, function (all, pre, mant, tail, e1, e2) {
            if (_sig(mant) <= n) return all;                       // never padded
            var exp = Number(e1 != null ? e1 : e2), v = Number(mant) * Math.pow(10, exp);
            if (!isFinite(v) || v === 0) return all;
            var t = v.toExponential(n - 1).split('e'), m2 = t[0], x2 = Number(t[1]);
            if (e2 != null) return pre + m2 + '×10^' + x2;
            return pre + m2 + 'E' + (x2 < 0 ? '-' : '') + Math.abs(x2);
        });
    }
    // every number in exponent form in a text: [{text, value, figures}]
    function numbersIn(text) {
        var out = [], m; NUM_RE.lastIndex = 0;
        while ((m = NUM_RE.exec(S(text))) !== null) {
            var exp = Number(m[4] != null ? m[4] : m[5]), v = Number(m[2]) * Math.pow(10, exp);
            if (isFinite(v) && v !== 0) out.push({ text: (m[2] + m[3]).trim(), value: v, figures: _sig(m[2]) });
        }
        return out;
    }
    function sameAtFigures(a, b, figs) {
        if (!(a > 0 && b > 0) && a !== b) return false;
        var f = Math.max(1, Math.min(6, figs));
        return Number(a.toExponential(f - 1)) === Number(Number(b).toExponential(f - 1));
    }

    // ---- numbering and references -------------------------------------------------------------------------------
    // number the tables and figures in order and give every heading, table and figure an anchor
    function index(model) {
        var t = 0, f = 0, h = 0, idx = { headings: [], tables: [], figures: [], byTable: {}, byTree: {}, bySec: {}, firstFigure: null };
        (model.blocks || []).forEach(function (b) {
            if (b.k === 'h' || b.k === 'appendix') {
                h++; b.anchor = 'sl_h' + h;
                var text = b.k === 'appendix' ? 'Appendix: ' + b.title : b.text;
                idx.headings.push({ level: b.k === 'appendix' ? 1 : b.level, text: text, anchor: b.anchor, block: b });
                var key = S(text).trim().toLowerCase(); if (key && !idx.bySec[key]) idx.bySec[key] = b;
            } else if (b.k === 'table') {
                t++; b.number = t; b.anchor = 'sl_t' + t; b.caption = 'Table ' + t + ': ' + (b.title || tableTitle(b.name));
                idx.tables.push(b); if (!idx.byTable[b.name]) idx.byTable[b.name] = b;
            } else if (b.k === 'sheets') {
                (b.sheets || []).forEach(function (s) {
                    f++; s.number = f; s.anchor = 'sl_f' + f; s.fullCaption = 'Figure ' + f + ': ' + s.caption;
                    idx.figures.push(s); if (!idx.firstFigure) idx.firstFigure = s;
                    var k1 = S(s.title).trim().toLowerCase(); if (k1 && !idx.byTree[k1]) idx.byTree[k1] = s;
                    if (s.pageId && !idx.byTree['id:' + s.pageId]) idx.byTree['id:' + s.pageId] = s;
                });
            }
        });
        return idx;
    }
    var REF_RE = /\{\{ref:([^}]+)\}\}/g;
    function resolveRef(key, idx) {
        key = S(key).trim();
        var m;
        if ((m = /^sec:(.+)$/i.exec(key))) { var b = idx.bySec[m[1].trim().toLowerCase()]; return b ? { text: 'Section ' + '“' + (b.k === 'appendix' ? 'Appendix: ' + b.title : b.text) + '”', anchor: b.anchor } : null; }
        if ((m = /^fta(?::(.+))?$/i.exec(key))) {
            var s = m[1] ? (idx.byTree[m[1].trim().toLowerCase()] || idx.byTree['id:' + m[1].trim()]) : idx.firstFigure;
            return s ? { text: 'Figure ' + s.number, anchor: s.anchor } : null;
        }
        var tb = idx.byTable[key]; return tb ? { text: 'Table ' + tb.number, anchor: tb.anchor } : null;
    }
    // a text cut into plain, bold and reference pieces
    function pieces(text, idx, sig) {
        var out = [], last = 0, m, t = S(text); REF_RE.lastIndex = 0;
        var pushText = function (s) {
            var re = /\*\*([^*]+)\*\*/g, l = 0, mm;
            while ((mm = re.exec(s)) !== null) { if (mm.index > l) out.push({ text: fmtSig(s.slice(l, mm.index), sig) }); out.push({ text: fmtSig(mm[1], sig), bold: true }); l = mm.index + mm[0].length; }
            if (l < s.length) out.push({ text: fmtSig(s.slice(l), sig) });
        };
        while ((m = REF_RE.exec(t)) !== null) {
            if (m.index > last) pushText(t.slice(last, m.index));
            var r = resolveRef(m[1], idx);
            out.push(r ? { text: r.text, anchor: r.anchor } : { text: '[reference not found: ' + m[1] + ']', missing: true });
            last = m.index + m[0].length;
        }
        if (last < t.length) pushText(t.slice(last));
        return out;
    }
    // what to fix before generating: references that point at nothing
    function check(model) {
        var idx = index(model), out = [];
        (model.blocks || []).forEach(function (b) {
            if (b.k !== 'p') return;
            var m; REF_RE.lastIndex = 0;
            while ((m = REF_RE.exec(S(b.text))) !== null) if (!resolveRef(m[1], idx)) out.push({ kind: 'ref', ref: m[1], section: b.section || '', text: 'The reference ' + m[0] + ' in ' + (b.section ? '“' + b.section + '”' : 'the report') + ' points at nothing in this report.' });
        });
        return out;
    }
    // what can be referenced in a report built from these blocks (for the editor's Insert reference menu)
    function referable(model) {
        var idx = index(model), out = [];
        idx.tables.forEach(function (t) { out.push({ token: '{{ref:' + t.name + '}}', label: t.caption }); });
        idx.figures.forEach(function (f, i) { out.push({ token: '{{ref:fta:' + f.title + '}}', label: f.fullCaption, first: i === 0 }); });
        idx.headings.forEach(function (h) { if (h.block.k === 'h') out.push({ token: '{{ref:sec:' + h.text + '}}', label: 'Section “' + h.text + '”' }); });
        return out;
    }

    // ---- Word ----------------------------------------------------------------------------------------------------
    async function docx(model, D) {
        var idx = index(model), sig = model.sigFigs || null;
        var TW = 9360;                                   // text width (twips) on a portrait letter page with 1 in margins
        var border = { style: D.BorderStyle.SINGLE, size: 6, color: '888888' }, borders = { top: border, bottom: border, left: border, right: border };
        var runs = function (txt, opt) {
            opt = opt || {};
            return pieces(txt, idx, sig).map(function (p) {
                var base = Object.assign({ text: p.text, bold: !!(p.bold || opt.bold), italics: !!opt.italics }, opt.size ? { size: opt.size } : {}, opt.color ? { color: opt.color } : {});
                if (p.anchor) return new D.InternalHyperlink({ anchor: p.anchor, children: [new D.TextRun(Object.assign(base, { color: '1A56B8', underline: {} }))] });
                if (p.missing) return new D.TextRun(Object.assign(base, { color: 'B42318', bold: true }));
                return new D.TextRun(base);
            });
        };
        var tocLine = function (text, anchor, indent) {
            return new D.Paragraph({ tabStops: [{ type: D.TabStopType.RIGHT, position: TW, leader: D.LeaderType.DOT }], indent: { left: indent || 0 }, spacing: { after: 40 },
                children: [new D.InternalHyperlink({ anchor: anchor, children: [new D.TextRun({ text: S(text) })] }), new D.TextRun({ text: '\t' }), new D.PageReference(anchor)] });
        };
        var front = [];
        front.push(new D.Paragraph({ spacing: { after: 240 }, children: [new D.TextRun({ text: S(model.title), bold: true, size: 40 })] }));
        (model.titleLines || []).forEach(function (ln) { if (S(ln).trim()) front.push(new D.Paragraph({ spacing: { after: 60 }, children: runs(S(ln).trim()) })); });
        var listHead = function (t) { return new D.Paragraph({ spacing: { before: 240, after: 120 }, children: [new D.TextRun({ text: t, bold: true, size: 28 })] }); };
        front.push(listHead('Contents'));
        idx.headings.forEach(function (h) { front.push(tocLine(h.text, h.anchor, (Math.max(1, h.level) - 1) * 360)); });
        if (idx.tables.length) { front.push(listHead('List of Tables')); idx.tables.forEach(function (t) { front.push(tocLine(t.caption, t.anchor, 0)); }); }
        if (idx.figures.length) { front.push(listHead('List of Figures')); idx.figures.forEach(function (f) { front.push(tocLine(f.fullCaption, f.anchor, 0)); }); }
        if (!idx.tables.length && !idx.figures.length) front.push(new D.Paragraph({ children: [new D.TextRun({ text: 'This report has no tables or figures.', italics: true, color: '666666' })] }));
        front.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Page numbers in these lists fill in when the file is opened in Word (allow it to update the fields).', italics: true, size: 16, color: '888888' })] }));

        var table = function (rows) {
            var headers = rows.length ? Object.keys(rows[0]) : [];
            var head = new D.TableRow({ tableHeader: true, children: headers.map(function (h) { return new D.TableCell({ borders: borders, shading: { fill: 'D5E8F0' }, children: [new D.Paragraph({ children: [new D.TextRun({ text: S(h), bold: true })] })] }); }) });
            var body = rows.map(function (r) { return new D.TableRow({ children: headers.map(function (h) { return new D.TableCell({ borders: borders, children: [new D.Paragraph({ children: [new D.TextRun(fmtSig(S(r[h] == null ? '' : r[h]), sig))] })] }); }) }); });
            return new D.Table({ width: { size: TW, type: D.WidthType.DXA }, rows: [head].concat(body) });
        };
        var caption = function (anchor, text) { return new D.Paragraph({ spacing: { before: 160, after: 80 }, keepNext: true, children: [new D.Bookmark({ id: anchor, children: [new D.TextRun({ text: text, bold: true, size: 20 })] })] }); };

        // body sections: portrait text, landscape sheets for the trees
        var sections = [], cur = [];
        var flush = function (landscape) { if (cur.length) sections.push({ landscape: !!landscape, children: cur }); cur = []; };
        for (var bi = 0; bi < (model.blocks || []).length; bi++) {
            var b = model.blocks[bi];
            if (b.k === 'h' || b.k === 'appendix') {
                var lvl = b.k === 'appendix' ? 1 : b.level;
                var hl = lvl === 1 ? D.HeadingLevel.HEADING_1 : lvl === 2 ? D.HeadingLevel.HEADING_2 : D.HeadingLevel.HEADING_3;
                var kids = [new D.Bookmark({ id: b.anchor, children: [new D.TextRun({ text: b.k === 'appendix' ? 'Appendix: ' + b.title : S(b.text), bold: true })] })];
                if (b.pill) kids.push(new D.TextRun({ text: b.pill.text, size: 16, color: b.pill.color }));
                cur.push(new D.Paragraph({ heading: hl, pageBreakBefore: b.k === 'appendix', spacing: { before: lvl === 1 ? 320 : 200, after: 120 }, children: kids }));
            } else if (b.k === 'p') {
                S(b.text).split(/\r?\n/).forEach(function (ln) { cur.push(ln.trim() ? new D.Paragraph({ spacing: { after: 100, line: 300 }, children: runs(ln) }) : new D.Paragraph({ children: [new D.TextRun('')] })); });
            } else if (b.k === 'blank') {
                cur.push(new D.Paragraph({ children: [new D.TextRun('')] }));
            } else if (b.k === 'table') {
                cur.push(caption(b.anchor, b.caption));
                if (b.rows && b.rows.length) cur.push(table(b.rows));
                else cur.push(new D.Paragraph({ children: [new D.TextRun({ text: '(No entries)', italics: true, color: '888888' })] }));
                cur.push(new D.Paragraph({ children: [new D.TextRun('')] }));
            } else if (b.k === 'sheets') {
                for (var si = 0; si < b.sheets.length; si++) {
                    var s = b.sheets[si];
                    flush(false);
                    var land = [caption(s.anchor, s.fullCaption)];
                    if (s.dataUrl) land.push(new D.Paragraph({ children: [new D.ImageRun({ data: S(s.dataUrl).replace(/^data:image\/png;base64,/, ''), transformation: { width: Math.round(s.w * 96 / 72), height: Math.round(s.h * 96 / 72) } })] }));
                    else land.push(new D.Paragraph({ children: [new D.TextRun({ text: '(This tree could not be drawn.)', italics: true, color: 'B42318' })] }));
                    sections.push({ landscape: true, children: land });
                }
            } else if (b.k === 'note') {
                cur.push(new D.Paragraph({ spacing: { before: 320 }, children: [new D.TextRun({ text: fmtSig(S(b.text), sig), italics: true, size: 18, color: '666666' })] }));
            }
        }
        flush(false);

        var header = function () { return { default: new D.Header({ children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.TextRun({ text: S(model.headerText), size: 18, color: '666666' })] })] }) }; };
        var footer = function () { return { default: new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [
            new D.TextRun({ text: 'Generated by Safety Lab Aero, Inc. · Page ', size: 18, color: '666666' }), new D.TextRun({ children: [D.PageNumber.CURRENT], size: 18, color: '666666' }),
            new D.TextRun({ text: ' of ', size: 18, color: '666666' }), new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES], size: 18, color: '666666' })] })] }) }; };
        var portrait = { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } };
        var landscape = { page: { size: { width: 12240, height: 15840, orientation: D.PageOrientation.LANDSCAPE }, margin: { top: 720, right: 720, bottom: 720, left: 720, header: 360, footer: 360 } } };
        var docSections = [{ properties: portrait, headers: header(), footers: footer(), children: front }].concat(sections.map(function (s) {
            return { properties: s.landscape ? landscape : portrait, headers: header(), footers: footer(), children: s.children };
        }));
        var doc = new D.Document({ creator: 'Safety Lab Aero, Inc.', title: S(model.title), description: S(model.title) + (model.projectName ? ' for ' + model.projectName : ''),
            features: { updateFields: true }, styles: { default: { document: { run: { font: 'Arial', size: 22 } } } }, sections: docSections });
        return D.Packer.toBlob ? D.Packer.toBlob(doc) : D.Packer.toBuffer(doc);
    }

    // ---- PDF -----------------------------------------------------------------------------------------------------
    // the PDF's built-in font has no arrows, comparison signs or Greek letters: write them in plain characters
    var PDF_CHARS = { '\u2192': '->', '\u21D2': '=>', '\u2190': '<-', '\u2194': '<->', '\u21C4': '<->', '\u21C6': '<->', '\u21D4': '<=>', '\u2265': '>=', '\u2264': '<=', '\u2260': '!=', '\u03BB': 'lambda', '\u03B2': 'beta', '\u2713': 'yes', '\u2717': 'no', '\u2715': 'x', '\u2248': '~', '\u2212': '-', '\u2026': '...', '\u2009': ' ', '\u202F': ' ', '\u2028': ' ' };
    function pdfSafe(t) { return S(t).replace(/[\u2190-\u21FF\u2260-\u2265\u03B2\u03BB\u2713\u2715\u2717\u2248\u2212\u2026\u2009\u202F\u2028]/g, function (c) { return PDF_CHARS[c] || (/[\u2190-\u21FF]/.test(c) ? '->' : '?'); }).replace(/[^\x00-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u20AC\u2122]/g, '?'); }
    async function pdf(model, jsPDF) {
        var idx = index(model), sig = model.sigFigs || null;
        var doc = new jsPDF({ unit: 'pt', format: 'letter' });
        var _text = doc.text.bind(doc), _split = doc.splitTextToSize.bind(doc);
        doc.text = function (t) { var a = Array.prototype.slice.call(arguments); a[0] = Array.isArray(t) ? t.map(pdfSafe) : pdfSafe(t); return _text.apply(null, a); };
        doc.splitTextToSize = function (t) { var a = Array.prototype.slice.call(arguments); a[0] = pdfSafe(t); return _split.apply(null, a); };
        var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 50;
        var y = M, at = {};               // anchor -> { page, y }
        var links = [];                   // { page, x, y, w, h, anchor }
        var wrap = function (t, maxW, fs) { doc.setFontSize(fs); return doc.splitTextToSize(S(t), maxW); };
        var pageW = function () { return doc.internal.pageSize.getWidth(); }, pageH = function () { return doc.internal.pageSize.getHeight(); };
        var need = function (h) { if (y + h > pageH() - M) { doc.addPage('letter', 'portrait'); y = M; } };
        var cur = function () { return doc.internal.getCurrentPageInfo().pageNumber; };

        // the front lists: their length is known before the body, so their pages are kept first
        var front = [];
        idx.headings.forEach(function (h) { front.push({ text: h.text, anchor: h.anchor, indent: (Math.max(1, h.level) - 1) * 14 }); });
        var tl = idx.tables.map(function (t) { return { text: t.caption, anchor: t.anchor, indent: 0 }; });
        var fl = idx.figures.map(function (f) { return { text: f.fullCaption, anchor: f.anchor, indent: 0 }; });
        var LINE = 14;
        var _titleLines = function () { return (model.titleLines || []).map(function (l) { return S(l).trim(); }).filter(Boolean); };
        // the same steps the front lists take when they are drawn, counted first so their pages can be kept
        var frontPages = (function () {
            var pg = 1, yy = M + 26 + _titleLines().length * 15;
            var nx = function () { if (yy + LINE > H - M) { pg++; yy = M; } };
            var hd = function () { yy += 8; nx(); yy += LINE + 2; };
            var en = function () { nx(); yy += LINE; };
            hd(); front.forEach(en);
            if (tl.length) { hd(); tl.forEach(en); }
            if (fl.length) { hd(); fl.forEach(en); }
            return pg;
        })();
        for (var fp = 1; fp < frontPages; fp++) doc.addPage('letter', 'portrait');
        doc.addPage('letter', 'portrait'); y = M;

        var textRuns = function (txt, fs, x0, maxW) {
            // one paragraph line by line; references are drawn linked
            var ps = pieces(txt, idx, sig), words = [];
            ps.forEach(function (p) { S(p.text).split(/(\s+)/).forEach(function (w) { if (w) words.push({ w: w, p: p }); }); });
            var x = x0; doc.setFontSize(fs);
            need(fs + 3);
            words.forEach(function (it) {
                doc.setFont('helvetica', it.p.bold || it.p.missing ? 'bold' : 'normal');
                var ww = doc.getTextWidth(it.w);
                if (/^\s+$/.test(it.w)) { if (x > x0) x += ww; return; }
                if (x + ww > x0 + maxW && x > x0) { y += fs + 3; need(fs + 3); x = x0; }
                if (it.p.anchor) doc.setTextColor(26, 86, 184); else if (it.p.missing) doc.setTextColor(180, 35, 24); else doc.setTextColor(0);
                doc.text(it.w, x, y);
                if (it.p.anchor) links.push({ page: cur(), x: x, y: y - fs, w: ww, h: fs + 2, anchor: it.p.anchor });
                x += ww;
            });
            doc.setTextColor(0); doc.setFont('helvetica', 'normal');
            y += fs + 3;
        };
        var drawTable = function (rows) {
            var headers = rows.length ? Object.keys(rows[0]) : [];
            if (!rows.length) { doc.setFontSize(10); doc.setFont('helvetica', 'italic'); doc.setTextColor(120); need(14); doc.text('(No entries)', M, y); y += 14; doc.setTextColor(0); doc.setFont('helvetica', 'normal'); return; }
            var colW = (W - 2 * M) / headers.length;
            var drawHead = function () {
                doc.setFont('helvetica', 'bold');
                var hl = headers.map(function (h) { return wrap(h, colW - 6, 8); }), hh = Math.max(18, Math.max.apply(null, hl.map(function (l) { return l.length; })) * 9 + 8);
                need(hh + 2); doc.setFillColor(213, 232, 240); doc.rect(M, y, W - 2 * M, hh, 'F');
                doc.setFontSize(8); doc.setTextColor(0);
                hl.forEach(function (l, i) { l.forEach(function (ln, li) { doc.text(ln, M + i * colW + 3, y + 11 + li * 9); }); });
                y += hh; doc.setFont('helvetica', 'normal');
            };
            drawHead();
            rows.forEach(function (r) {
                var cells = headers.map(function (h) { return wrap(fmtSig(S(r[h] == null ? '' : r[h]), sig), colW - 6, 7.5); });
                var hgt = Math.max(14, Math.max.apply(null, cells.map(function (c) { return c.length; })) * 9 + 8);
                if (y + hgt > pageH() - M) { doc.addPage('letter', 'portrait'); y = M; drawHead(); }
                doc.setDrawColor(180); doc.rect(M, y, W - 2 * M, hgt); doc.setFontSize(7.5);
                cells.forEach(function (c, i) { c.forEach(function (ln, li) { doc.text(ln, M + i * colW + 3, y + 10 + li * 9); }); if (i) doc.line(M + i * colW, y, M + i * colW, y + hgt); });
                y += hgt;
            });
            y += 10;
        };
        (model.blocks || []).forEach(function (b) {
            if (b.k === 'h' || b.k === 'appendix') {
                var lvl = b.k === 'appendix' ? 1 : b.level, fs = lvl === 1 ? 16 : lvl === 2 ? 13 : 11.5;
                if (b.k === 'appendix') { doc.addPage('letter', 'portrait'); y = M + fs; } else { y += (y > M ? fs * 0.9 : fs); need(fs + 24); }
                doc.setFontSize(fs); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
                var ht = b.k === 'appendix' ? 'Appendix: ' + b.title : S(b.text);
                at[b.anchor] = { page: cur(), y: y - fs };
                wrap(ht, W - 2 * M, fs).forEach(function (ln) { need(fs + 4); doc.text(ln, M, y); y += fs + 4; });
                y += 2;
                if (b.pill) { var rgb = b.pill.color === '1D6E3E' ? [29, 110, 62] : b.pill.color === '9A6200' ? [154, 98, 0] : [142, 42, 42]; doc.setFontSize(8); doc.setTextColor(rgb[0], rgb[1], rgb[2]); need(11); doc.text(S(b.pill.text).trim(), M, y); y += 11; doc.setTextColor(0); }
                doc.setFont('helvetica', 'normal');
            } else if (b.k === 'p') {
                S(b.text).split(/\r?\n/).forEach(function (ln) { if (ln.trim()) textRuns(ln, 10, M, W - 2 * M); else y += 6; });
                y += 3;
            } else if (b.k === 'blank') { y += 6; }
            else if (b.k === 'table') {
                y += 10; need(40); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
                at[b.anchor] = { page: cur(), y: y - 10 };
                wrap(b.caption, W - 2 * M, 9.5).forEach(function (ln) { doc.text(ln, M, y); y += 12; });
                y += 2; doc.setFont('helvetica', 'normal');
                drawTable(b.rows || []);
            } else if (b.k === 'sheets') {
                (b.sheets || []).forEach(function (s) {
                    doc.addPage('letter', 'landscape');
                    var LW = pageW(), LM = 36;
                    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
                    doc.text(wrap(s.fullCaption, LW - 2 * LM, 9.5)[0] || '', LM, LM + 10);
                    at[s.anchor] = { page: cur(), y: LM };
                    doc.setFont('helvetica', 'normal');
                    if (s.dataUrl) doc.addImage(s.dataUrl, 'PNG', LM, LM + 20, s.w, s.h);     // natural size: the text stays at 7.5 pt
                    else { doc.setTextColor(180, 35, 24); doc.text('(This tree could not be drawn.)', LM, LM + 40); doc.setTextColor(0); }
                    y = pageH();                                                   // the next block starts a new page
                });
            } else if (b.k === 'note') {
                doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
                wrap(fmtSig(S(b.text), sig), W - 2 * M, 8).forEach(function (ln) { need(11); doc.text(ln, M, y); y += 11; });
                doc.setTextColor(0); doc.setFont('helvetica', 'normal');
            }
        });

        // the front lists, now that every page is known
        var p = 1; doc.setPage(p); y = M;
        doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.text(wrap(model.title, W - 2 * M, 20)[0] || '', M, y); y += 26;
        _titleLines().forEach(function (ln) { doc.setFontSize(10.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(50); doc.text(wrap(fmtSig(ln.replace(/\*\*/g, ''), sig), W - 2 * M, 10.5)[0] || '', M, y); y += 15; });
        doc.setTextColor(0);
        var frontNext = function () { if (y + LINE > H - M) { p++; doc.setPage(p); y = M; } };
        var head = function (t) { y += 8; frontNext(); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(t, M, y); y += LINE + 2; doc.setFont('helvetica', 'normal'); };
        var entry = function (e) {
            frontNext();
            var tgt = at[e.anchor]; var pg = tgt ? tgt.page : null;
            doc.setFontSize(9.5);
            var x0 = M + e.indent, maxW = W - 2 * M - e.indent - 30;
            var txt = wrap(e.text, maxW, 9.5)[0] || '';
            doc.text(txt, x0, y);
            var tw = doc.getTextWidth(txt), nw = pg ? doc.getTextWidth(String(pg)) : 0;
            if (pg) {
                var dots = ''; var dw = doc.getTextWidth('.');
                var space = (W - M - nw - 4) - (x0 + tw + 4);
                if (space > dw) { dots = new Array(Math.floor(space / dw)).join('.'); doc.setTextColor(150); doc.text(dots, x0 + tw + 4, y); doc.setTextColor(0); }
                doc.text(String(pg), W - M, y, { align: 'right' });
                doc.link(x0, y - 9.5, W - M - x0, 12, { pageNumber: pg });
            }
            y += LINE;
        };
        head('Contents'); front.forEach(entry);
        if (tl.length) { head('List of Tables'); tl.forEach(entry); }
        if (fl.length) { head('List of Figures'); fl.forEach(entry); }
        // the links in the prose
        links.forEach(function (l) { var t = at[l.anchor]; if (!t) return; doc.setPage(l.page); doc.link(l.x, l.y, l.w, l.h, { pageNumber: t.page }); });

        // page footers
        var total = doc.internal.getNumberOfPages();
        for (var q = 1; q <= total; q++) {
            doc.setPage(q);
            var pw = pageW(), ph = pageH();
            doc.setFontSize(8.5); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
            doc.text('Generated by Safety Lab Aero, Inc. · Page ' + q + ' of ' + total, pw / 2, ph - 16, { align: 'center' });
            if (model.headerText) doc.text(S(model.headerText), pw - 36, 22, { align: 'right' });
        }
        doc.setTextColor(0);
        doc.__slAnchors = at; doc.__slFrontPages = frontPages;
        return doc;
    }

    var api = { VERSION: VERSION, docx: docx, pdf: pdf, index: index, check: check, referable: referable, pieces: pieces, resolveRef: resolveRef,
                fmtSig: fmtSig, numbersIn: numbersIn, sameAtFigures: sameAtFigures, tableTitle: tableTitle, isTableValue: isTableValue, TITLES: TITLES };
    try { root.SLReportWriter = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
