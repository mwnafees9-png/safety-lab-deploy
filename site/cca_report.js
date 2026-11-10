// cca_report.js (SLCcaReport v2.0, 10 Nov 2026: reports with a front and appendices, the dropdown picks the front or one appendix, parts written once per report (the PASA and PSSA Autopilots); v1.9 10 Nov 2026: the AI drafts only once the questions are answered; live comments in the margin; images and captions centered; v1.8 10 Nov 2026; v1.7 9 Nov 2026; v1.6 9 Nov 2026; v1.5 9 Nov 2026; v1.4 9 Nov 2026; v1.3 9 Nov 2026; v1.2 8 Nov 2026): the shared report frame of the PRA, ZSA and CMA Autopilots.
// v1.8 (10 Nov 2026): Waqas: "we also need to fix how we are not using the full width of the page for the text", for all the
// reports. Paragraphs, leads, lists, captions and the written parts now run the full width of the document column, the
// same width as the tables (the 78ch and 980px caps are gone). A section may carry { k:'html', html } (preview only, never in
// Word or print): the CMA uses it for its "Write it myself" / "Draft with AI" boxes on the categories the data cannot settle.
// v1.4 (9 Nov 2026, the PRA tells the whole story): Waqas: "where we have multiple impact zones, we should have 1 image per
// cone like in the rotor burst PRA 1 per engine and the cones be different distinct colors"; "yeah needs to look clean and
// legible". A section can place a picture where its story needs it ({ k:'shotslot', view, fallback }); a view SLCadShots
// flags default: true is ticked the first time its section is shown (kept in projectConfig.ccaReports[key].shots, riding
// the next save); a view's caption and lead name the source and its color; a small heading can be one level down
// ({ k:'part', level: 2 }); pictures are listed in the list of figures; wide tables go to Word in a smaller type.
// v1.2 (8 Nov 2026, one tab per subject): Waqas, confirmed: "I want all PRAs on their individual tab with their auto pilot
// and report preview". An optional spec.tabs puts a row of tabs across the top of the page: "All risks" first (the whole
// document, with Word and Print), then one tab per section, labeled with its ID and short name. A section's tab shows
// only that section's questions on the left and only that section's report on the right (a short header, the section,
// its figures, node panel and Edit) with "Export this ... to Word". Add opens the new section's tab; flash('sec:<id>')
// from elsewhere opens that section's tab. The tab picked is remembered per project (projectConfig.ccaReports[key].tab,
// which rides the next save like projectConfig.lastPlace). Off by default: the ZSA and CMA pages are unchanged.
// v1.1 (8 Nov 2026, the CMA report): a table can say which question wrote each row (rowQ: [qid per row]) and the table as
// a whole (q); the rows and the caption carry data-ccq, so an answer that writes a table row lights that row up.
//
// Waqas, 8 Nov 2026: "I want the PRA table gone, and each PRA presented in a report format listing out all the stuff that
// is impacted, all equipment in the zone, all functions that equipment performs"; "PRA build and ZSA similar to the
// planing autopilot, ability to see the reports etc. can we do something similar for CMA"; the tables go, with an inline
// Edit per report section and an Add button so no data entry is lost.
//
// The pattern is the Plan Autopilot's (plan_autopilot.js v2.2, left as it is): questions on the left, the document
// building live on the right, redrawn on every answer; an answer lights up what it wrote; clickable diagrams open a panel
// with the inputs, outputs and how each is accepted; "Outputs and acceptance" with accept and reopen kept in the project;
// a cover, document control, approvals by role, contents, lists of tables and figures, numbered captions; Word export;
// a dark page in dark mode. The analysis module supplies the content; this file only frames it.
//
// =====================================================================================================================
// THE API (stable: the PRA, ZSA and CMA modules build on it)
// =====================================================================================================================
//   var R = SLCcaReport.define(spec)      registers one analysis page and returns its instance (define again = replace)
//   SLCcaReport.get(key)                  the instance for a key ('pra', 'zsa', 'cma')
//   SLCcaReport.palette()                 the colors figures must draw with right now ({ ink, sub, line, paper, panel,
//                                         on, onF, ok, okF, warn, warnF, bad, badF, off, offF }); LIGHT for Word and print
//   SLCcaReport.nodeG(key, nodeId, inner, title)   wraps svg markup as a clickable box of a figure (opens the node panel)
//   SLCcaReport.E(s)                      HTML escape
//
// spec (only key, viewId, title, code and sections are required):
//   key           'pra' | 'zsa' | 'cma' (letters only): the store is projectConfig.ccaReports[key] = { doc, accept }
//   viewId        the page's view element, e.g. 'view-zsa'. The frame mounts its host right under the page heading
//                 (.header-with-export) and redraws when the page is shown and when the theme changes.
//   leftId        optional id for the left pane element (the PRA keeps 'pra-auto-host' so old selectors still work)
//   title, code   document title ('Particular Risk Assessment') and number code ('PRA': document number <PROG>-PRA-001)
//   lead          optional plain sentence under the page heading
//   sectionsTitle heading of the part that holds one section per subject ('The particular risks')
//   front(ctx)    optional: blocks that come before "Inputs and outputs" (purpose, scope, method). Level-1 headings
//                 are numbered by the frame: give the words only.
//   sections(ctx) REQUIRED: one entry per subject, from the live model:
//                   [{ id, title, blocks: [...], edit: true|false (default: true when spec.edit is given) }]
//                 ctx = { C: palette, dark: bool, forExport: bool, key }
//                 blocks: { k:'p', text, q? }            a paragraph; q = the question id whose answer wrote it
//                         { k:'part', text }            a small heading inside a section (bold line in Word)
//                         { k:'table', name, title, rows: [{ Column: 'value', ... }], lead, q?, rowQ? }   lead: '{N} lists ...'
//                                                       q: the question that wrote the table; rowQ: one question id per row (v1.1)
//                         { k:'fig', name, title, svg, w, h, lead }   standalone svg; use ctx.C colors; boxes made
//                                                       with SLCcaReport.nodeG(key, id, inner) are clickable
//                         { k:'act', label, onclick }   a button in the preview only (never in Word or print)
//                         { k:'html', html }            (v1.8) the module's own markup, in the preview only (never in Word or print)
//                         { k:'part', text, level: 2 }  (v1.4) a smaller heading one level down inside a part
//                         { k:'shotslot', view, fallback }   (v1.4) the 3D picture spec.shots offers as view id 'view', placed
//                                                       here when it is ticked (and nowhere else); when the 3D model cannot
//                                                       give that view (none on this computer), the fallback block instead
//                 A table or figure lead names it by number with {N}; the frame numbers captions in order.
//   after(ctx)    optional: blocks after the sections (before "Outputs and acceptance")
//   questions()   EITHER: the frame draws the left pane from these:
//                   [{ id, sec (section id it writes into), text, intro, depth (0, 1, 2 for follow-ups),
//                      options: [{ id, label, means, changes }], picked (option id or null), note }]
//   answer(qid, optionId)   with questions(): store the answer (throw an Error with a plain message to refuse)
//   renderQuestions(R)      OR: the module draws its own left pane (returns HTML). After the module stores an answer it
//                 calls R.answered(qid) (redraw, then light up what the answer wrote). Its own buttons call its own code.
//   edit          optional: { addLabel: 'Add a particular risk',
//                   fields(sectionId | null) -> [{ key, label, type: 'text'|'textarea'|'select'|'checks', value,
//                                                  options: [[value, label]], hint }]     (null = the Add form)
//                   save(sectionId | null, values) -> { ok: true, id } | { ok: false, err } }
//                 The frame shows Edit on every section and Add at the top of the preview; the module writes its data
//                 array (no duplicate rows: refuse with err) and the frame redraws and lights up the saved section.
//   io            optional: { does: 'what the analysis does',
//                   inputs:  [{ id, what, from, tab }],                  tab = switchTab id of the page it comes from
//                   outputs: [{ id, what, to, tab, accept, role, fp }] } accept = how it is accepted; fp() = a string
//                 that changes when the output changes (an accepted output whose fp changed shows as reopened)
//                 The frame writes the "Inputs and outputs" part (words, a clickable figure, a table).
//   outputs()     optional: the outputs to accept, if not io.outputs: [{ id, what, accept, role, fp }]
//   tabs          optional (v1.2): true or { allLabel: 'All risks', noun: 'risk', filter(question, sectionId) -> bool }
//                 One tab per section across the top of the page, "All risks" (allLabel) first. A section may give
//                 tabLabel: { id: 'PRA-001', name: 'Uncontained engine rotor burst' } (default: its title). On a section's
//                 tab the left pane holds only its questions: questions() are kept where filter(q, sectionId) is true
//                 (default q.sec === sectionId); renderQuestions(R, sectionId) gets the tab (null = All) and filters
//                 itself. The right pane holds only that section, numbered on its own, with its Word export.
//   shots(sectionId) optional (v1.3): the 3D model subject for a section ({ kind:'pra', praId|riskKey } or { kind:'zsa',
//                 zone }) or null. The left pane then asks "Pictures for the report" with a live thumbnail of every
//                 view SLCadShots offers; the ticked views go into that section as numbered figures (page, print, Word).
//                 Nothing ticked: no picture. Picks in projectConfig.ccaReports[key].shots[sectionId] = [viewId].
//                 (v1.4) A view with default: true is ticked the first time its section is shown (written into the picks
//                 then, without forcing a save); a view's caption and lead, when given, are its figure title and lead.
//   authored      optional (v1.6): [{ id, title, purpose }]: parts every section ends with, written by the engineer or drafted
//                 by the AI and accepted by a person (never deterministic). Empty reads "Not written yet."
//   aiType        optional (v1.6): the report type the AI drafting guide uses (default spec.code)
//   aiReady       optional (v1.9): function (sid) -> { ready, left: [question texts] }: the AI drafts a section's parts only
//                 once ready (every question for it answered); the part says what is left. Without it, always ready.
//   (v1.9) every preview is decorated with live comments in its margin (report_comments.js); written parts' paragraphs carry
//                 data-cc-authp so a comment on them can be fixed with the AI.
//   appendices    optional (v2.0): true: a report is its front (front, inputs and outputs, after, outputs and acceptance) and then
//                 one appendix per section ("Appendix A: ...", sub-headings A.1, tables and figures A.1); { k:'rauth', aid?,
//                 asHeading? } in front or after places the parts written once for the whole report (spec.reportAuthored,
//                 same shape as authored; the AI drafts them with spec.reportFacts(reportId) and the report's sections).
//   tabs.parts    optional (v2.0, with appendices): the dropdown lists each report's front and its appendices; the tab is
//                 '<report>' or '<report>::<section>'; R.ridOf(tab), R.partOf(tab); renderQuestions(R, tab) gets the whole tab.
//   shotsFocus()  optional (v1.3, pages without tabs): the section whose pictures the left pane asks about now.
//   live(nodeId)  optional: where the program stands for a figure box (shown in the panel only, on request)
//   node(nodeId)  optional: the panel for the module's own figure boxes: { title, does, inputs: [what], outputs:
//                 [{ what, accept }], tab }. Boxes of the inputs and outputs figure are handled by the frame.
//
// The instance R: render(), doc(ctx?) (numbered blocks; { only: sectionId } = that section alone), fullHtml(),
//   model(o?) (the Word model; { only: sectionId } = that section alone), word(o?), print(),
//   flash(target) (a question id, or 'sec:<id>': with tabs, a section opens its tab), answered(qid), acceptance(),
//   accept(id), unaccept(id), docCtl(), setDoc(field, value), issue(note), tab() (the open tab: a section id, or null
//   for All), setTab(id), tabs() ([{ id, label }]), state, spec.
// Rules the frame keeps: approvals by role only (ROLES), one revision per issue, no counts or status in the document
// text (live counts appear only in the panel when asked), plain words, no em dashes.
(function (root) {
    'use strict';
    var VERSION = '2.0';   // 2.0 10 Nov 2026: reports with a front and appendices (spec.appendices), the dropdown picks the front or one appendix (tabs.parts), parts written once per report (spec.reportAuthored, { k:'rauth' });   // 1.9 10 Nov 2026: the AI drafts a part only once its questions are answered (spec.aiReady);   // 1.8 10 Nov 2026: text the full width of the document column; { k:'html' } preview-only blocks;   // 1.7 9 Nov 2026: column diagrams with squared connectors in their own lanes, never through a box, lit on hover (flow);   // 1.6 9 Nov 2026: the parts the engineer writes (spec.authored): write it or draft it with the AI, accepted by a person;   // 1.5 9 Nov 2026: every subject its own report, picked from one dropdown, with a register (spec.reports)   // 1.4 9 Nov 2026: pictures placed in the story (shotslot), per-source pictures ticked by default; 1.3: 3D model pictures (spec.shots)
    function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function J(v) { return E(JSON.stringify(v)); }
    function g(name) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {} try { return root[name]; } catch (_) { return undefined; } }
    function pc() { var v = g('projectConfig'); return v && typeof v === 'object' ? v : null; }
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function now() { return new Date().toISOString(); }
    function today() { return now().slice(0, 10); }
    function U() { return root.SLAutopilotUI || null; }
    function who() { return U() ? U().who() : 'Engineer'; }
    function save() { if (U()) U().save(); else { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} } }
    function fail(m) { var e = new Error(m); e.userFacing = true; return e; }
    function listJoin(a) { a = a.filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function lcFirst(s) { s = String(s || ''); return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
    function projName() { return safe(function () { return g('projectName') || ''; }, '') || 'the program'; }
    function initials() { var dw = String(projName()).split(/[\s·,]+/).filter(function (t) { return /[A-Za-z]/.test(t) && /\d/.test(t); })[0]; if (dw) return dw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8); var w = String(projName()).replace(/[^A-Za-z0-9 \-]/g, ' ').split(/[\s\-]+/).filter(Boolean); var x = w.length > 1 ? w.slice(0, 3).map(function (t) { return /^\d/.test(t) ? t : t.charAt(0); }).join('') : (w[0] || 'PRG').slice(0, 4); return x.toUpperCase(); }
    function isDark() { return typeof document !== 'undefined' && !!document.body && document.body.classList.contains('theme-dark'); }

    // ---- the two palettes (the Plan Autopilot's): figures read C at draw time; dark only while the page draws ---------
    var LIGHT = { ink: '#101216', sub: '#4b5563', line: '#6b7280', paper: '#ffffff', panel: '#F8FAFC', panelS: '#e3e5e8', on: '#1A6EF2', onF: '#EAF2FE', ok: '#1F7A33', okF: '#E8F4EA',
        warn: '#B26A00', warnF: '#FDF1DE', bad: '#B42318', badF: '#FDECEA', off: '#9aa1ad', offF: '#F3F4F6' };
    var DARK = { ink: '#E8EAED', sub: '#B4BAC4', line: '#9AA1AD', paper: '#15181E', panel: '#1B1F26', panelS: '#2E333C', on: '#6AA6FF', onF: '#172840', ok: '#5CC97A', okF: '#15301E',
        warn: '#E9A94A', warnF: '#33270F', bad: '#FF8A80', badF: '#3A1A17', off: '#7C8490', offF: '#1E2229' };
    var C = LIGHT;
    function palette() { return C; }
    var ROLES = ['Chief safety engineer', 'Aircraft safety lead', 'System safety engineer', 'Chief engineer', 'Certification manager', 'Head of airworthiness', 'Quality and process assurance', 'Design engineering lead', 'Installation and zonal lead', 'Program manager'];
    var DOC_STATUS = ['Draft', 'In review', 'Approved', 'Superseded'];

    // ---- svg helpers for the frame's own figure (and for modules that want them) ----------------------------------------
    function wrapText(t, n) { var words = String(t || '').split(/\s+/), lines = [], cur = ''; words.forEach(function (w0) { if ((cur + ' ' + w0).trim().length > n && cur) { lines.push(cur); cur = w0; } else cur = (cur + ' ' + w0).trim(); }); if (cur) lines.push(cur); return lines; }
    function svgWrap(w, h, body, title) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="' + E(title) + '"><defs><marker id="ccr-ah" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="' + C.line + '"/></marker></defs><rect width="100%" height="100%" fill="' + C.paper + '"/>' + body + '</svg>'; }
    function nodeG(key, id, inner, title) { return '<g class="ccr-node" data-ccnode="' + E(id) + '" data-cckey="' + E(key) + '" style="cursor:pointer"><title>' + E(title || 'Click for its inputs, outputs and how it is accepted') + '</title>' + inner + '</g>'; }
    function boxSvg(x, y, w, title, sub, kind) {
        var st = { on: [C.on, C.onF], ok: [C.ok, C.okF], warn: [C.warn, C.warnF], bad: [C.bad, C.badF], off: [C.off, C.offF], plain: [C.line, C.panel] }[kind || 'plain'];
        var tl = wrapText(title, Math.max(8, Math.floor(w / 6.4))), sl = sub ? wrapText(sub, Math.max(10, Math.floor(w / 5.6))) : [], h = 14 + tl.length * 13 + sl.length * 12;
        var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="7" fill="' + st[1] + '" stroke="' + st[0] + '" stroke-width="1.3"' + (kind === 'off' ? ' stroke-dasharray="4 3"' : '') + '/>';
        tl.forEach(function (l, i) { s += '<text x="' + (x + 8) + '" y="' + (y + 18 + i * 13) + '" font-size="11" font-weight="700" fill="' + C.ink + '">' + E(l) + '</text>'; });
        sl.forEach(function (l, i) { s += '<text x="' + (x + 8) + '" y="' + (y + 18 + tl.length * 13 + i * 12) + '" font-size="9.5" fill="' + C.sub + '">' + E(l) + '</text>'; });
        return { svg: s, h: h };
    }

    // v1.7 (9 Nov 2026, Waqas on the "what one event takes out" figure: "these connectors must be easy to read", "and neater,
    // not overlapping blocks and stuff"): a column diagram whose connectors are squared off and run in their own lanes
    // between the columns, never through a box. Boxes in each column are ordered to cut crossings (the average place of
    // what they connect to, two passes each way); each source has one trunk in the lane after it; where a connector skips
    // a column it crosses that column in a free row, never through a box; connectors into the same box arrive at their
    // own heights. Hovering a box lights only its connectors (wire()).
    //   flow(key, { title, sub, cols: [{ head, nodes: [{ id, t, s, k }] }], edges: [[fromId, toId]] }) -> { svg, w, h }
    function flow(key, o) {
        var cols = (o.cols || []).map(function (c) { return { head: c.head, nodes: (c.nodes || []).slice() }; });
        var colOf = {}; cols.forEach(function (c, ci) { c.nodes.forEach(function (n) { colOf[n.id] = ci; }); });
        var E0 = (o.edges || []).filter(function (e, i, arr) { return colOf[e[0]] != null && colOf[e[1]] != null && colOf[e[0]] < colOf[e[1]] && arr.findIndex(function (x) { return x[0] === e[0] && x[1] === e[1]; }) === i; });
        var nb = {}; E0.forEach(function (e) { (nb[e[0]] = nb[e[0]] || []).push(e[1]); (nb[e[1]] = nb[e[1]] || []).push(e[0]); });
        var rank = function () { var r = {}; cols.forEach(function (c) { c.nodes.forEach(function (n, i) { r[n.id] = i / Math.max(1, c.nodes.length - 1); }); }); return r; };
        for (var pass = 0; pass < 4; pass++) {
            var rk = rank(), order = pass % 2 ? cols.map(function (_, i) { return cols.length - 1 - i; }) : cols.map(function (_, i) { return i; });
            order.forEach(function (ci) { var c = cols[ci]; c.nodes = c.nodes.map(function (n, i) { var L = (nb[n.id] || []).map(function (m) { return rk[m]; }); return { n: n, v: L.length ? L.reduce(function (a, b) { return a + b; }, 0) / L.length : rk[n.id], i: i }; }).sort(function (a, b) { return a.v - b.v || a.i - b.i; }).map(function (x) { return x.n; }); rk = rank(); });
        }
        var BW = 186, G = 96, M = 16, top = o.sub ? 70 : 56, GAP = 12, nC = cols.length;
        var W = M * 2 + nC * BW + Math.max(0, nC - 1) * G, X = cols.map(function (_, i) { return M + i * (BW + G); });
        var pos = {}, colH = cols.map(function (c, ci) { var y = 0; c.nodes.forEach(function (n) { var b = boxSvg(0, 0, BW, n.t, n.s, n.k); y += b.h + GAP; }); return Math.max(0, y - GAP); });
        var Hmax = Math.max.apply(null, colH.concat([40])), body = '';
        cols.forEach(function (c, ci) {
            var y = top + 12 + Math.round((Hmax - colH[ci]) / 2);
            c.nodes.forEach(function (n) { var b = boxSvg(X[ci], y, BW, n.t, n.s, n.k); pos[n.id] = { x: X[ci], y: y, h: b.h, c: ci }; body += nodeG(key, n.id, b.svg, n.t); y += b.h + GAP; });
        });
        // ports: a source leaves from its middle; the connectors into a box arrive at their own heights, in source order
        var into = {}; E0.forEach(function (e) { (into[e[1]] = into[e[1]] || []).push(e); });
        var portIn = {}; Object.keys(into).forEach(function (t) { var L = into[t].sort(function (a, b) { return (pos[a[0]].y + pos[a[0]].h / 2) - (pos[b[0]].y + pos[b[0]].h / 2); }), P = pos[t]; L.forEach(function (e, j) { portIn[e[0] + '>' + t] = Math.round(P.y + P.h * (j + 1) / (L.length + 1)); }); });
        // lanes: in the gap after a column, one trunk per source; in the gap before a target reached across columns, one lane per connector
        var gapLanes = cols.map(function () { return []; });
        E0.forEach(function (e) { var a = pos[e[0]], b = pos[e[1]]; if (gapLanes[a.c].indexOf('s:' + e[0]) < 0) gapLanes[a.c].push('s:' + e[0]); if (b.c - a.c > 1) gapLanes[b.c - 1].push('e:' + e[0] + '>' + e[1]); });
        var laneX = {}; gapLanes.forEach(function (L, gi) {
            L.sort(function (p, q) { var yp = p.charAt(0) === 's' ? pos[p.slice(2)].y : portIn[p.slice(2)], yq = q.charAt(0) === 's' ? pos[q.slice(2)].y : portIn[q.slice(2)]; return yp - yq; });
            var x0 = X[gi] + BW + 10, x1 = X[gi] + BW + G - 14, n = L.length; L.forEach(function (id, j) { laneX[gi + '|' + id] = Math.round(n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * j / (n - 1)); });
        });
        // a free row across a skipped column, nearest the wanted height
        var freeY = function (ci, want) {
            var bs = cols[ci].nodes.map(function (n) { return pos[n.id]; }), clash = function (y) { return bs.some(function (b) { return y > b.y - 5 && y < b.y + b.h + 5; }); };
            if (!clash(want)) return want;
            var cand = [top + 4]; bs.forEach(function (b) { cand.push(b.y - GAP / 2, b.y + b.h + GAP / 2); });
            return cand.filter(function (y) { return !clash(y); }).sort(function (p, q) { return Math.abs(p - want) - Math.abs(q - want); })[0];
        };
        var lines = '';
        E0.forEach(function (e) {
            var a = pos[e[0]], b = pos[e[1]], ys = Math.round(a.y + a.h / 2), yt = portIn[e[0] + '>' + e[1]], xs = a.x + BW, xt = b.x - 2;
            var lx = laneX[a.c + '|s:' + e[0]], d = 'M' + xs + ',' + ys + ' H' + lx;
            if (b.c - a.c === 1) d += ' V' + yt + ' H' + xt;
            else {
                var yc = yt; for (var ci = a.c + 1; ci < b.c; ci++) yc = freeY(ci, yc);
                var lx2 = laneX[(b.c - 1) + '|e:' + e[0] + '>' + e[1]];
                d += ' V' + yc + ' H' + lx2 + ' V' + yt + ' H' + xt;
            }
            lines += '<path class="ccr-edge" data-e="' + E(e[0]) + '|' + E(e[1]) + '" d="' + d + '" fill="none" stroke="' + C.line + '" stroke-width="1.3" stroke-linejoin="round" marker-end="url(#ccr-ah)"/>';
        });
        var H = top + 12 + Hmax + 14;
        var hd = (o.title ? '<text x="' + M + '" y="24" font-size="14" font-weight="700" fill="' + C.ink + '">' + E(o.title) + '</text>' : '') + (o.sub ? '<text x="' + M + '" y="41" font-size="11" fill="' + C.sub + '">' + E(o.sub) + '</text>' : '')
            + cols.map(function (c, i) { return '<text x="' + (X[i] + BW / 2) + '" y="' + (top) + '" font-size="10" font-weight="700" fill="' + C.sub + '" text-anchor="middle">' + E(c.head || '') + '</text>'; }).join('');
        return { svg: svgWrap(W, H, hd + '<g class="ccr-edges">' + lines + '</g>' + body, o.title || ''), w: W, h: H };
    }

    var REG = {};
    function define(spec) {
        if (!spec || !/^[a-z]+$/.test(spec.key || '')) throw new Error('SLCcaReport.define: a key of letters is needed');
        if (typeof spec.sections !== 'function') throw new Error('SLCcaReport.define: sections(ctx) is needed');
        var R = make(spec); REG[spec.key] = R; R.mount(); return R;
    }
    function get(key) { return REG[key] || null; }

    function make(spec) {
        var key = spec.key, ui0 = { node: null, live: false, editing: null, adding: false, msg: null, flash: null, err: null, tab: null, shownTab: undefined };
        var R = { spec: spec, state: ui0, key: key };
        // v1.5 (9 Nov 2026): with tabs, every report stands on its own (its own number, cover, revisions and acceptance).
        // REP is the report in use while a document, its control or its acceptance is read or written (null = the series).
        var REP = null;
        function withRep(rid, f) { var p0 = REP; REP = rid ? String(rid) : null; try { return f(); } finally { REP = p0; } }

        // ---- the store -----------------------------------------------------------------------------------------------
        function store() {
            var p = pc(); if (!p) return { doc: {}, accept: {} };
            if (!p.ccaReports || typeof p.ccaReports !== 'object') p.ccaReports = {};
            var s = p.ccaReports[key]; if (!s || typeof s !== 'object') s = p.ccaReports[key] = {};
            if (!s.doc || typeof s.doc !== 'object') s.doc = {}; if (!s.accept || typeof s.accept !== 'object') s.accept = {};
            if (!s.shots || typeof s.shots !== 'object') s.shots = {};
            if (!s.docs || typeof s.docs !== 'object') s.docs = {}; if (!s.accepts || typeof s.accepts !== 'object') s.accepts = {};
            return s;
        }

        // ---- v1.3: 3D model pictures ---------------------------------------------------------------------------------
        // The engineer picks the views; the pictures are drawn by SLCadShots in its own hidden viewer and kept here by
        // subject + view (the service caches by model revision too, so a changed model draws them again).
        var shotCache = {}, shotBusy = {}, shotQueue = Promise.resolve();
        function S() { return root.SLCadShots || null; }
        function shotSubject(id) { if (!id || typeof spec.shots !== 'function') return null; return safe(function () { return spec.shots(id); }, null); }
        function shotViews(id) { var sub = shotSubject(id), Sx = S(); if (!sub || !Sx || !safe(function () { return Sx.ready(); }, false)) return []; return safe(function () { return Sx.views(sub) || []; }, []) || []; }
        // v1.4: never chosen yet: the views flagged default are ticked, and kept (they ride the next save, like the open tab)
        function shotPicks(id) {
            var s = store(), a = s.shots[id]; if (Array.isArray(a)) return a.slice();
            var d = shotViews(id).filter(function (v) { return v && v.default; }).map(function (v) { return v.id; });
            if (!d.length) return null;
            s.shots[id] = d; return d.slice();
        }
        function shotKey(id, vid) { var sub = shotSubject(id); return JSON.stringify(sub) + '|' + vid; }
        function shotGet(id, vid) { return shotCache[shotKey(id, vid)] || null; }
        // draw one picture (one at a time); when it lands, refresh the thumbnail in place and, if it is picked, the report
        function shotEnsure(id, vid) {
            var k = shotKey(id, vid), Sx = S();
            if (shotCache[k] || shotBusy[k] || !Sx) return shotBusy[k] || Promise.resolve(shotCache[k] || null);
            var sub = shotSubject(id);
            shotBusy[k] = shotQueue = shotQueue.then(function () { return Sx.capture(sub, vid, { w: 800, h: 500 }); }).then(function (r) {
                shotCache[k] = r || null; delete shotBusy[k];
                try {
                    var h0 = host(), im = h0 && h0.querySelector('[data-ccshot-thumb="' + cssq(id + '|' + vid) + '"]');
                    if (im && r) { im.src = r.thumb; im.removeAttribute('data-pending'); var w = im.parentNode && im.parentNode.querySelector('.ccr-shotwait'); if (w) w.remove(); }
                    if ((shotPicks(id) || []).indexOf(vid) >= 0) { clearTimeout(ui0.shotT); ui0.shotT = setTimeout(function () { render(); relight(); }, 60); }
                } catch (_) {}
                return r;
            }, function (e) { delete shotBusy[k]; shotCache[k] = { err: (e && e.message) || String(e) }; return null; });
            return shotBusy[k];
        }
        // one ticked view as a figure: the picture once drawn, a placeholder on the page while it draws; a picture that cannot
        // be drawn gives the fallback (when there is one) rather than a placeholder that never goes away
        function shotOne(id, v, forExport, fallback) {
            var r = shotGet(id, v.id);
            if (r && r.png) return [{ k: 'shot', name: 'shot-' + v.id, title: v.caption || v.label, png: r.png, w: r.w || 800, h: r.h || 500, lead: v.lead || ('{N} shows it on the 3D model: ' + lcFirst(v.label) + '.'), shotOf: id + '|' + v.id, color: v.color || null, colors: v.colors || null }];
            if (r && r.err) return fallback ? [fallback] : [];
            if (forExport) return [];
            shotEnsure(id, v.id); return [{ k: 'p', text: 'Drawing the picture "' + v.label + '" from the 3D model.', pend: 1 }];
        }
        // the figures for a section: the ticked views in the order offered (skip: the views a shotslot already placed)
        function shotBlocks(id, forExport, skip) {
            var picks = shotPicks(id); if (!picks || !picks.length) return [];
            var out = [], views = shotViews(id);
            views.forEach(function (v) { if (picks.indexOf(v.id) < 0 || (skip && skip[v.id])) return; out = out.concat(shotOne(id, v, forExport, null)); });
            return out;
        }
        // v1.4: a section's blocks with its pictures in place: a shotslot gives its view where it stands when ticked, its
        // fallback when the 3D model cannot give that view; the other ticked views follow at the end
        function secBlocks(s, forExport) {
            var out = [], slotted = {}, views = null, picks = null;
            (s.blocks || []).forEach(function (x) {
                if (!x) return;
                if (x.k !== 'shotslot') { out.push(Object.assign({ sec: s.id }, x)); return; }
                if (views === null) { views = shotViews(s.id); picks = shotPicks(s.id) || []; }
                var v = views.filter(function (w) { return w.id === x.view; })[0];
                if (!v) { if (x.fallback) out.push(Object.assign({ sec: s.id }, x.fallback)); return; }
                slotted[v.id] = 1;
                if (picks.indexOf(v.id) >= 0) shotOne(s.id, v, forExport, x.fallback || null).forEach(function (y) { out.push(Object.assign({ sec: s.id }, y)); });
            });
            shotBlocks(s.id, forExport, slotted).forEach(function (x) { out.push(Object.assign({ sec: s.id }, x)); });
            if (spec.authoredAt !== 'report') authBlocks(s.id, forExport).forEach(function (x) { out.push(Object.assign({ sec: s.id }, x)); });
            return out;
        }
        // ---- v1.6 (9 Nov 2026): the parts the engineer writes ----------------------------------------------------------
        // Waqas: "I want empty sections for proposed mitigations and path to compliance and conclusion which we give them
        // options to draft themselves or Draft with AI coz I dont think those can be done deterministically".
        // spec.authored = [{ id, title, purpose }]: each section of the report ends with these parts, empty until someone
        // writes them ("Write it myself") or accepts an AI draft ("Draft with AI": grounded in that section's own content,
        // shown with what it rests on and the checks it failed, never in the report until a person accepts it; the run can
        // be stopped). Kept in projectConfig.ccaReports[key].authored[sectionId][partId] = { text, by, at, source, draft }.
        function authDefs() { return Array.isArray(spec.authored) ? spec.authored.filter(function (a) { return a && a.id; }) : []; }
        // v2.0: the parts written once for a whole report (spec.reportAuthored) are asked for with the report's id
        function isRepId(sid) { if (!Array.isArray(spec.reportAuthored)) return false; var secs = secsOf(ctxOf()) || []; if (secs.some(function (x) { return x && x.id === String(sid); })) return false; return repList(secs).some(function (r) { return r.id === String(sid); }); }
        function defsFor(sid) { return isRepId(sid) ? spec.reportAuthored.filter(function (a) { return a && a.id; }) : authDefs(); }
        function authStore(sid, write) { var s0 = store(); if (!s0.authored || typeof s0.authored !== 'object') { if (!write) return {}; s0.authored = {}; } var m = s0.authored[sid]; if (!m || typeof m !== 'object') { if (!write) return {}; m = s0.authored[sid] = {}; } return m; }
        function authOf(sid, aid) { return authStore(sid)[aid] || null; }
        function authBlocks(sid, forExport, defs) {
            var out = [];
            (defs || authDefs()).forEach(function (a) {
                var r = authOf(sid, a.id), txt = r && r.text ? String(r.text).trim() : '';
                out.push({ k: 'part', text: a.title, auth: a.id });
                if (txt) txt.split(/\n\s*\n/).forEach(function (para) { if (para.trim()) out.push({ k: 'p', text: para.trim().replace(/\s*\n\s*/g, ' '), authp: key + '|' + sid + '|' + a.id }); });
                else out.push({ k: 'p', text: 'Not written yet.' });
                if (!forExport) out.push({ k: 'auth', aid: a.id });
            });
            return out;
        }
        function authFacts(sid) {
            var all = secsOf(ctxOf({ forExport: true })) || [], rr = (spec.authoredAt === 'report' || isRepId(sid)) ? repOf(sid, all) : null;
            var list = rr ? all.filter(function (x) { return rr.sections.indexOf(x.id) >= 0; }) : all.filter(function (x) { return x.id === sid; });
            if (!list.length && !rr) return '';
            var lines = rr ? ['Report: ' + rr.label + (list.length ? '' : ' (nothing in it yet)')] : [];
            list.forEach(function (s0) { lines.push('', '# ' + s0.title); (s0.blocks || []).forEach(function (b) {
                if (!b) return;
                if (b.k === 'part' || b.k === 'h') lines.push('', '## ' + String(b.text || '').replace(/\*\*/g, ''));
                else if (b.k === 'p' && b.text) lines.push(String(b.text).replace(/\*\*/g, ''));
                else if (b.k === 'table' && b.rows && b.rows.length) { lines.push('Table: ' + (b.title || b.name)); b.rows.slice(0, 60).forEach(function (r) { lines.push(JSON.stringify(r)); }); if (b.rows.length > 60) lines.push('(' + (b.rows.length - 60) + ' more rows)'); }
            }); });
            if (rr && typeof spec.reportFacts === 'function') { var rf = safe(function () { return spec.reportFacts(sid); }, ''); if (rf) lines.unshift(String(rf), ''); }
            defsFor(sid).forEach(function (a) { var r = authOf(sid, a.id); if (r && r.text) lines.push('', '## ' + a.title + ' (written by the engineer)', String(r.text)); });
            return lines.join('\n').slice(0, 60000);
        }
        // v1.9 (10 Nov 2026, Waqas: "AI doesnt draft till people have answered the questions"): the AI drafts a part only
        // once every question for that section (or report) is answered; spec.aiReady(sid) says which are left
        function aiReady(sid) {
            if (typeof spec.aiReady !== 'function') return { ready: true, left: [] };
            var r = safe(function () { return spec.aiReady(sid); }, null) || { ready: true, left: [] };
            return { ready: !!r.ready, left: Array.isArray(r.left) ? r.left : [] };
        }
        async function authAi(sid, aid) {
            var a = defsFor(sid).filter(function (x) { return x.id === aid; })[0]; if (!a) throw fail('No such part.');
            var gate = aiReady(sid);
            if (!gate.ready) throw fail(('Answer the questions for this part first, then the AI can draft it. Still to answer: ' + gate.left.slice(0, 6).join('; ') + (gate.left.length > 6 ? '; and the rest in the list on the left' : '') + '.').replace(/\?\.$/, '?'));
            var AI = root.SafetyLabAI, RA = root.SLReportAI;
            if (!AI || typeof AI.complete !== 'function' || !RA) throw fail('The AI is not set up in this project. Write this part yourself, or set the AI up in Settings.');
            var heading = String(a.title).replace(/^\d+(\.\d+)*\.?\s*/, '');
            var system = RA.systemPrompt(spec.aiType || spec.code || key.toUpperCase(), { name: spec.title }, { heading: heading, prose: a.purpose || '' });
            var res = await AI.complete({ feature: 'report.section.draft', system: system, messages: [{ role: 'user', content: 'The project data for this section of the ' + spec.title + ' (' + (isRepId(sid) ? (repOf(sid) || { label: sid }).label : (repOfSection(sid) || { label: sid }).label) + '):\n\n' + authFacts(sid) }], maxTokens: 1400 });
            var text = String((res && (res.text || (res.raw && res.raw.content && res.raw.content[0] && res.raw.content[0].text))) || '').trim();
            if (!text) throw fail('The AI returned nothing. Try again, or write this part yourself.');
            var flags = []; try { flags = (RA.guard(text, {}) || []).map(function (f) { return String(f.why || f.token || f); }); } catch (_) {}
            var m = authStore(sid, true), cur = m[aid] || {};
            cur.draft = { text: text, model: (res && res.model) || '', at: now(), flags: flags, rests: (isRepId(sid) ? 'The whole report as it stands: its front and every appendix' : 'This report section as it stands: its method, basis, calculations, results') + (defsFor(sid).some(function (x) { return x.id !== aid && authOf(sid, x.id) && authOf(sid, x.id).text; }) ? ', and the parts already written' : '') + '.' };
            m[aid] = cur; save();
            return cur.draft;
        }
        function authSave(sid, aid, text, source) { var m = authStore(sid, true), cur = m[aid] || {}; cur.text = String(text || '').trim(); cur.by = who(); cur.at = now(); cur.source = source || 'person'; delete cur.draft; m[aid] = cur; save(); }
        function authHtml(sid, aid) {
            var a = defsFor(sid).filter(function (x) { return x.id === aid; })[0]; if (!a) return '';
            var r = authOf(sid, aid) || {}, k = sid + '|' + aid, ed = ui0.authEdit === k, busy = ui0.authBusy === k;
            var btn = function (verb, label, extra) { return '<button type="button" class="slap-btn" data-cc-auth="' + E(verb) + '" data-cc-authk="' + E(k) + '" onclick="SLCcaReport.act(' + J(key) + ',\'' + verb + '\',' + J(sid) + ',' + J(aid) + ')"' + (extra || '') + '>' + E(label) + '</button>'; };
            var h = '<div class="ccr-auth" data-cc-authbox="' + E(k) + '">';
            if (ed) {
                h += '<textarea data-cc-authtext="' + E(k) + '" rows="7" placeholder="' + E(a.purpose || '') + '">' + E(ui0.authSeed != null ? ui0.authSeed : (r.text || '')) + '</textarea><div class="ccr-authbar">' + btn('authsave', 'Save') + btn('authcancel', 'Cancel') + '</div>';
            } else if (r.draft) {
                h += '<div class="ccr-authdraft" data-cc-authdraft="' + E(k) + '"><div class="ccr-authh">AI draft: not in the report until you accept it</div><div class="ccr-authdt">' + E(r.draft.text).replace(/\n/g, '<br>') + '</div>'
                    + '<div class="ccr-authwhy"><b>What it rests on:</b> ' + E(r.draft.rests || '') + '</div>'
                    + (r.draft.flags && r.draft.flags.length ? '<div class="ccr-authflag"><b>Check before accepting:</b> ' + r.draft.flags.map(E).join('; ') + '</div>' : '')
                    + '<div class="ccr-authbar">' + btn('authaccept', 'Accept') + btn('authacceptedit', 'Edit, then accept') + btn('authdiscard', 'Discard') + '</div></div>';
            } else {
                h += '<div class="ccr-authbar">' + (busy ? '<button type="button" class="slap-btn slab-ai-stop" data-cc-auth="authstop" onclick="try{window.slabAiStop&&window.slabAiStop()}catch(_){}">&#9632; Stop</button><span class="ccr-authwait">Drafting with the AI...</span>'
                    : btn('authedit', r.text ? 'Edit' : 'Write it myself') + (aiReady(sid).ready ? btn('authai', r.text ? 'Redraft with AI' : 'Draft with AI') : '<button type="button" class="slap-btn" disabled data-cc-auth="authai-wait" title="Answer the questions first">' + (r.text ? 'Redraft with AI' : 'Draft with AI') + '</button>')) + '</div>';
                var g0 = aiReady(sid);
                // said once per section, on its first part (the parts below share the same questions)
                if (!g0.ready && (defsFor(sid)[0] || {}).id === aid) h += '<div class="ccr-authhint" data-cc-aiwait="' + E(k) + '">' + E(('The AI drafts these parts once the questions for this ' + (spec.tabs && spec.tabs.noun ? spec.tabs.noun : 'part') + ' are answered. Still to answer: ' + g0.left.slice(0, 4).join('; ') + (g0.left.length > 4 ? '; and the rest in the list on the left' : '') + '.').replace(/\?\.$/, '?')) + '</div>';
                if (!r.text && a.purpose) h += '<div class="ccr-authhint">' + E(a.purpose) + '</div>';
            }
            return h + '</div>';
        }
        // before Word or print: every ticked picture drawn
        async function shotsReady(only) {
            var secs = secsOf(ctxOf()) || [], ids = secs.map(function (x) { return x.id; }).filter(function (x) { return !only || x === only; });
            for (var i = 0; i < ids.length; i++) { var picks = shotPicks(ids[i]) || []; var vs = shotViews(ids[i]); for (var j = 0; j < vs.length; j++) if (picks.indexOf(vs[j].id) >= 0) await shotEnsure(ids[i], vs[j].id); }
        }
        function shotToggle(id, vid) {
            var s = store(), a = Array.isArray(s.shots[id]) ? s.shots[id] : [];
            var i = a.indexOf(vid); if (i >= 0) a.splice(i, 1); else a.push(vid);
            s.shots[id] = a; save();
        }
        function shotNone(id) { store().shots[id] = []; save(); }
        // the question on the left: one card per view with its thumbnail
        function shotPickerHtml(id) {
            if (!id || typeof spec.shots !== 'function') return '';
            var sub = shotSubject(id); if (!sub) return '';
            var Sx = S();
            if (!Sx || !safe(function () { return Sx.ready(); }, false)) return '<div class="ccr-q ccr-shotq" data-ccshots="' + E(id) + '"><div class="ccr-qt">Pictures for the report</div><div class="ccr-qx">There is no 3D model in this project yet, so the report uses its drawn diagrams. Import the CAD model on the CAD Model page to add pictures of it.</div></div>';
            var views = shotViews(id), picks = shotPicks(id);
            if (!views.length) return '';
            var h = '<div class="ccr-q ccr-shotq' + (picks ? '' : ' gap') + '" data-ccshots="' + E(id) + '"><div class="ccr-qt">Pictures for the report</div>'
                + '<div class="ccr-qx">Tick the views of the 3D model you want in this part of the report. Each one is drawn from the live model: each danger source has its own color (named in the caption) and the parts it reaches are drawn solid in charcoal; a zone is green with its equipment in blue; the rest of the aircraft is gray. The picture of each danger source is ticked to start with. Ticked pictures go into the report, its print and its Word file as numbered figures.</div><div class="ccr-shots">';
            views.forEach(function (v) {
                var on = !!picks && picks.indexOf(v.id) >= 0, r = shotGet(id, v.id);
                if (!r) shotEnsure(id, v.id);
                h += '<button type="button" class="ccr-shot' + (on ? ' on' : '') + '" role="checkbox" aria-checked="' + on + '" data-ccshot="' + E(id + '|' + v.id) + '" onclick="SLCcaReport.act(' + J(key) + ',\'shot\',' + J(id) + ',' + J(v.id) + ')">'
                    + '<span class="ccr-shotimg">' + (r && r.thumb ? '<img alt="' + E(v.label) + '" src="' + r.thumb + '" data-ccshot-thumb="' + E(id + '|' + v.id) + '">' : '<img alt="' + E(v.label) + '" data-pending="1" data-ccshot-thumb="' + E(id + '|' + v.id) + '"><span class="ccr-shotwait">Drawing...</span>') + '</span>'
                    + '<span class="ccr-shotlab"><span class="ccr-mk sq"></span><span><b>' + (v.color ? '<i class="ccr-swatch" style="background:' + E(v.color) + '"></i>' : '') + (v.colors ? v.colors.map(function (c) { return '<i class="ccr-swatch" title="' + E(c.label + ' (' + c.name + ')') + '" style="background:' + E(c.hex) + '"></i>'; }).join('') : '') + E(v.label) + '</b>' + (v.why ? '<span class="ccr-oe">' + E(v.why) + '</span>' : '') + '</span></span></button>';
            });
            h += '</div><button type="button" class="ccr-see" data-ccshot-none="' + E(id) + '" onclick="SLCcaReport.act(' + J(key) + ',\'shotnone\',' + J(id) + ')">' + (picks && !picks.length ? 'No pictures for this part (chosen)' : 'No pictures for this part') + '</button></div>';
            return h;
        }
        function docCtl() {
            var s0 = store(), d;
            if (REP) {
                d = s0.docs[REP]; if (!d || typeof d !== 'object') d = s0.docs[REP] = {};
                if (!d.no) { var r0 = repOf(REP), c0 = String((r0 && r0.code) || REP).replace(/\s+/g, '-'), pre = (spec.code || key.toUpperCase()) + '-'; d.no = initials() + '-' + (c0.indexOf(pre) === 0 ? c0 : pre + c0); }
            } else { d = s0.doc; if (!d.no) d.no = initials() + '-' + (spec.code || key.toUpperCase()) + '-001'; }
            if (!d.status) d.status = 'Draft'; if (!Array.isArray(d.issues)) d.issues = []; return d;
        }
        function rev() { var i = docCtl().issues; return i.length ? i[i.length - 1].rev : 'Draft'; }
        function nextRev(r) { if (!r || r === 'Draft') return 'A'; var n = 0; for (var i = 0; i < r.length; i++) n = n * 26 + (r.charCodeAt(i) - 64); n++; var out = ''; while (n > 0) { var m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); } return out; }
        // one new revision per issue; issuing again the same day updates that day's issue
        function issue(note) {
            var d = docCtl(), last = d.issues[d.issues.length - 1], by = who();
            note = String(note || '').trim() || (last ? 'Revised' : 'First issue');
            if (last && last.date === today()) { last.note = note; last.by = by; last.at = now(); }
            else d.issues.push({ rev: nextRev(last && last.rev), date: today(), note: note, by: by, at: now() });
            save(); return d.issues[d.issues.length - 1];
        }
        function setDoc(field, v) {
            var d = docCtl();
            if (field === 'status' && DOC_STATUS.indexOf(v) < 0) throw fail('Not a document status: ' + v);
            if (/^(prep|rev|appr)$/.test(field) && v && ROLES.indexOf(v) < 0) throw fail('Approvals name a role, not a person: ' + v + ' is not one of the roles.');
            if (field === 'no') v = String(v || '').trim().slice(0, 40) || d.no;
            d[field] = v; save();
        }

        // ---- outputs and acceptance ----------------------------------------------------------------------------------
        function outputs() {
            var L = typeof spec.outputs === 'function' ? safe(function () { return spec.outputs(REP); }, []) : ((spec.io && spec.io.outputs) || []);
            return (L || []).filter(function (o) { return o && o.id; });
        }
        function fpOf(o) { return typeof o.fp === 'function' ? String(safe(function () { return o.fp(REP); }, '')) : ''; }
        function accStore() { var s = store(); if (!REP) return s.accept; var a = s.accepts[REP]; if (!a || typeof a !== 'object') a = s.accepts[REP] = {}; return a; }
        function acceptance() {
            var A = accStore();
            return outputs().map(function (o) { var r = A[o.id], fp = fpOf(o); var st = !r ? 'open' : (r.fp === fp ? 'accepted' : 'reopened'); return Object.assign({}, o, { state: st, by: r && r.by, at: r && r.at }); });
        }
        function accept(id) { var o = outputs().filter(function (x) { return x.id === id; })[0]; if (!o) throw fail('No such output: ' + id); var A = accStore(); A[id] = { by: who(), at: now(), fp: fpOf(o) }; save(); return A[id]; }
        function unaccept(id) { var A = accStore(); delete A[id]; save(); }

        // ---- the document ----------------------------------------------------------------------------------------------
        function H(level, text, extra) { return Object.assign({ k: 'h', level: level, text: text }, extra || {}); }
        function P(text, extra) { return Object.assign({ k: 'p', text: text }, extra || {}); }
        function ioBlocks() {
            var io = spec.io; if (!io || (!(io.inputs || []).length && !(io.outputs || []).length)) return [];
            var ins = io.inputs || [], outs = io.outputs || [];
            var b = [P('This analysis ' + lcFirst(io.does || 'is defined by its inputs and outputs') + (/\.$/.test(io.does || '') ? '' : '.') + ' It needs ' + listJoin(ins.map(function (i) { return lcFirst(i.what) + ' (from ' + i.from + ')'; })) + '. It produces ' + listJoin(outs.map(function (o) { return lcFirst(o.what) + ' (for ' + o.to + ')'; })) + '.')];
            b.push(ioFigure());
            b.push({ k: 'table', name: 'io', title: 'What the analysis needs and what it produces', rows: ins.map(function (i) { return { Direction: 'Needs', What: i.what, 'From or for': i.from }; }).concat(outs.map(function (o) { return { Direction: 'Produces', What: o.what, 'From or for': o.to }; })), lead: '{N} lists the same inputs and outputs for reference.' });
            return b;
        }
        function ioFigure() {
            var io = spec.io, ins = io.inputs || [], outs = io.outputs || [];
            var W = 900, LX = 16, LW = 270, CX = 340, CW = 220, RX = 614, RW = 270, GAP = 8, y0 = 66;
            var L = ins.map(function (i) { return boxSvg(0, 0, LW, i.what, 'From ' + i.from, 'plain'); }), Rr = outs.map(function (o) { return boxSvg(0, 0, RW, o.what, 'For ' + o.to, 'plain'); });
            var lT = L.reduce(function (t, x) { return t + x.h; }, 0) + GAP * Math.max(0, L.length - 1), rT = Rr.reduce(function (t, x) { return t + x.h; }, 0) + GAP * Math.max(0, Rr.length - 1);
            var rowH = Math.max(lT, rT, 90), body = '';
            body += '<text x="16" y="24" font-size="14" font-weight="700" fill="' + C.ink + '">' + E('Inputs and outputs of the ' + lcFirst(spec.title)) + '</text><text x="16" y="41" font-size="11" fill="' + C.sub + '">Left: what it needs and where it comes from. Right: what it produces and who uses it. Click a box for more.</text>';
            body += '<text x="' + (LX + LW / 2) + '" y="58" font-size="10" font-weight="700" fill="' + C.sub + '" text-anchor="middle">NEEDS</text><text x="' + (CX + CW / 2) + '" y="58" font-size="10" font-weight="700" fill="' + C.sub + '" text-anchor="middle">ANALYSIS</text><text x="' + (RX + RW / 2) + '" y="58" font-size="10" font-weight="700" fill="' + C.sub + '" text-anchor="middle">PRODUCES</text>';
            var c = '<rect x="' + CX + '" y="' + y0 + '" width="' + CW + '" height="' + rowH + '" rx="9" fill="' + C.onF + '" stroke="' + C.on + '" stroke-width="1.5"/>';
            var nl = wrapText(spec.title, 24), dl = wrapText(io.does || '', 34), cy = y0 + rowH / 2 - (nl.length * 15 + dl.length * 12) / 2 + 12;
            nl.forEach(function (l, i) { c += '<text x="' + (CX + CW / 2) + '" y="' + (cy + i * 15) + '" font-size="12.5" font-weight="700" fill="' + C.ink + '" text-anchor="middle">' + E(l) + '</text>'; });
            dl.forEach(function (l, i) { c += '<text x="' + (CX + CW / 2) + '" y="' + (cy + nl.length * 15 + 2 + i * 12) + '" font-size="9.5" fill="' + C.sub + '" text-anchor="middle">' + E(l) + '</text>'; });
            body += nodeG(key, 'self', c, spec.title + ': click for its inputs and outputs');
            var ly = y0 + (rowH - lT) / 2;
            L.forEach(function (x, i) { var my = ly + x.h / 2; body += nodeG(key, 'in:' + ins[i].id, '<g transform="translate(' + LX + ',' + ly + ')">' + x.svg + '</g>', ins[i].what) + '<line x1="' + (LX + LW) + '" y1="' + my + '" x2="' + (CX - 1) + '" y2="' + my + '" stroke="' + C.line + '" stroke-width="1.3" marker-end="url(#ccr-ah)" data-io="in"/>'; ly += x.h + GAP; });
            var ry = y0 + (rowH - rT) / 2;
            Rr.forEach(function (x, i) { var my = ry + x.h / 2; body += nodeG(key, 'out:' + outs[i].id, '<g transform="translate(' + RX + ',' + ry + ')">' + x.svg + '</g>', outs[i].what) + '<line x1="' + (CX + CW) + '" y1="' + my + '" x2="' + (RX - 1) + '" y2="' + my + '" stroke="' + C.line + '" stroke-width="1.3" marker-end="url(#ccr-ah)" data-io="out"/>'; ry += x.h + GAP; });
            var Hh = y0 + rowH + 16;
            return { k: 'fig', name: 'io', title: 'Inputs and outputs of the ' + lcFirst(spec.title), svg: svgWrap(W, Hh, body, 'Inputs and outputs'), w: W, h: Hh, lead: '{N} draws them.' };
        }
        function ctxOf(o) { o = o || {}; return { C: C, dark: !!o.dark, forExport: !!o.forExport, key: key }; }
        // number the headings, tables and figures in order and put the numbers into the lead sentences
        function number(blocks) {
            // v2.0: an appendix heading ({ appx: 'A' }) is "Appendix A: ...", its sub-headings A.1, A.2 and its tables and
            // figures Table A.1, Figure A.1 (so an appendix keeps its numbers when it is shown on its own)
            var h1 = 0, h2 = 0, t = 0, f = 0, out = [], ax = null, at = 0, af = 0;
            blocks.forEach(function (b) {
                if (!b) return;
                if (b.k === 'h' && b.level === 1 && b.appx) { ax = String(b.appx); h2 = 0; at = 0; af = 0; b.text = 'Appendix ' + ax + ': ' + b.text; }
                else if (b.k === 'h' && b.level === 1) { ax = null; h1++; h2 = 0; b.text = h1 + '. ' + b.text; }
                else if (b.k === 'h' && b.level === 2) { h2++; b.text = (ax || h1) + '.' + h2 + ' ' + b.text; }
                if (b.k === 'table') { var tn = ax ? ax + '.' + (++at) : String(++t); b.n = tn; b.caption = 'Table ' + tn + ': ' + b.title; if (b.lead) out.push(P(String(b.lead).replace('{N}', 'Table ' + tn), { sec: b.sec })); }
                if (b.k === 'fig' || b.k === 'shot') { var fn = ax ? ax + '.' + (++af) : String(++f); b.n = fn; b.caption = 'Figure ' + fn + ': ' + b.title; if (b.lead) out.push(P(String(b.lead).replace('{N}', 'Figure ' + fn), { sec: b.sec })); }
                out.push(b);
            });
            return out;
        }
        // the whole document as blocks: front, inputs and outputs, one section per subject, after, outputs and acceptance
        function secsOf(ctx) { return safe(function () { return spec.sections(ctx); }, null); }
        function doc(o) {
            if (o && o.report) return withRep(o.report, function () { return repDoc(o); });
            var ctx = ctxOf(o), b = [];
            if (o && o.only) return number(onlyBlocks(o.only, o.secs || secsOf(ctx), !!o.forExport));
            var front = typeof spec.front === 'function' ? (safe(function () { return spec.front(ctx); }, []) || []) : [];
            if (front.length) b = b.concat(front.map(function (x) { return Object.assign({}, x); }));
            var io = ioBlocks(); if (io.length) { b.push(H(1, 'Inputs and outputs')); b = b.concat(io); }
            var secs = (o && o.secs) || secsOf(ctx);
            if (!secs) { secs = []; b.push(H(1, spec.sectionsTitle || 'The analysis')); b.push(P('The analysis could not be drawn from the project just now.')); }
            else {
                b.push(H(1, spec.sectionsTitle || 'The analysis'));
                if (!secs.length) b.push(P('Nothing to report yet. Use "' + ((spec.edit && spec.edit.addLabel) || 'Add') + '" to start.'));
                secs.forEach(function (s) {
                    b.push(H(2, s.title, { sec: s.id, edit: s.edit !== false && !!spec.edit, secHead: true }));
                    b = b.concat(secBlocks(s, o && o.forExport));
                });
            }
            var after = typeof spec.after === 'function' ? (safe(function () { return spec.after(ctx); }, []) || []) : [];
            b = b.concat(after.map(function (x) { return Object.assign({}, x); }));
            var outs = outputs();
            if (outs.length) {
                b.push(H(1, 'Outputs and acceptance'));
                b.push(P('The analysis is complete when each output below has been produced and accepted against its criteria by the role named. The acceptance is recorded in Safety Lab with who accepted it and when; if an output changes after it is accepted, its acceptance is reopened. The signature columns are left blank here for signing.'));
                b.push({ k: 'table', name: 'outputs', title: 'Outputs and how each is accepted', rows: outs.map(function (x, i) { return { '#': String(i + 1), Output: x.what, 'Accepted when': x.accept || '', 'Accepted by (role)': x.role || docCtl().appr || 'Chief safety engineer', Signature: '', Date: '' }; }), lead: '{N} lists every output and how each is accepted.' });
            }
            return number(b);
        }
        // v1.5: one report on its own: front, inputs and outputs, its section(s), its outputs and acceptance
        function repDoc(o) {
            var ctx = Object.assign(ctxOf(o), { report: REP }), b = [], secs = o.secs || secsOf(ctx) || [], r = repOf(REP, secs);
            if (!r) return number([P('This report is no longer in the project.')]);
            if (spec.appendices) return appxDoc(o, ctx, secs, r);
            var front = typeof spec.front === 'function' ? (safe(function () { return spec.front(ctx); }, []) || []) : [];
            if (front.length) b = b.concat(front.map(function (x) { return Object.assign({}, x); }));
            var io = ioBlocks(); if (io.length) { b.push(H(1, 'Inputs and outputs')); b = b.concat(io); }
            var rs = secs.filter(function (x) { return x && r.sections.indexOf(x.id) >= 0; });
            if (rs.length === 1 && !tabSpec().groupHeading) { b.push(H(1, rs[0].title, { sec: rs[0].id, edit: rs[0].edit !== false && !!spec.edit, secHead: true })); b = b.concat(secBlocks(rs[0], o.forExport)); }
            else {
                b.push(H(1, tabSpec().groupHeading ? tabSpec().groupHeading(r) : r.title));
                if (!rs.length) b.push(P('Nothing in this report yet. Use "' + ((spec.edit && spec.edit.addLabel) || 'Add') + '" to start.'));
                rs.forEach(function (x) { b.push(H(2, x.title, { sec: x.id, edit: x.edit !== false && !!spec.edit, secHead: true })); b = b.concat(secBlocks(x, o.forExport)); });
            }
            // v1.6: parts the engineer writes once for the whole report (spec.authoredAt === 'report', e.g. one CMA per level)
            if (spec.authoredAt === 'report') authBlocks(REP, o.forExport).forEach(function (x) { if (x.k === 'part') b.push(H(1, String(x.text).replace(/^\d+(\.\d+)*\.?\s*/, ''))); else b.push(Object.assign({ sec: REP }, x)); });
            var outs = outputs();
            if (outs.length) {
                b.push(H(1, 'Outputs and acceptance'));
                b.push(P('This report is complete when each output below has been produced and accepted against its criteria by the role named. The acceptance is recorded in Safety Lab with who accepted it and when; if an output changes after it is accepted, its acceptance is reopened.'));
                b.push({ k: 'table', name: 'outputs', title: 'Outputs and how each is accepted', rows: outs.map(function (x, i) { return { '#': String(i + 1), Output: x.what, 'Accepted when': x.accept || '', 'Accepted by (role)': x.role || docCtl().appr || 'Chief safety engineer', Signature: '', Date: '' }; }), lead: '{N} lists the outputs and how each is accepted.' });
            }
            return number(b);
        }
        // v2.0 (10 Nov 2026, the PASA and PSSA): Waqas: "one report for the aircraft with each failure condition feeding in as an
        // appendix (aircraft level cover page then meat in the appendices)", "the PSSA one per system". With spec.appendices
        // a report is its front (spec.front, the questions about the whole report), inputs and outputs, spec.after, outputs and
        // acceptance, then one appendix per section ("Appendix A: ..."). { k:'rauth', aid? } in front or after places the parts
        // the engineer writes once for the whole report (spec.reportAuthored). o.part = one appendix alone (the dropdown's part).
        function expandR(list, forExport) {
            var out = [];
            (list || []).forEach(function (x) {
                if (x && x.k === 'rauth') { authBlocks(REP, forExport, defsFor(REP).filter(function (a) { return !x.aid || a.id === x.aid; })).forEach(function (y) { if (y.k === 'part' && x.asHeading) out.push(H(x.asHeading, y.text)); else out.push(Object.assign({ sec: REP }, y)); }); return; }
                out.push(Object.assign({}, x));
            });
            return out;
        }
        function appxLetter(i) { var s0 = ''; i = i + 1; while (i > 0) { var m = (i - 1) % 26; s0 = String.fromCharCode(65 + m) + s0; i = Math.floor((i - 1) / 26); } return s0; }
        function appxDoc(o, ctx, secs, r) {
            var b = [], fx = !!o.forExport;
            var front = typeof spec.front === 'function' ? (safe(function () { return spec.front(ctx); }, []) || []) : [];
            b = b.concat(expandR(front, fx));
            var io = ioBlocks(); if (io.length) { b.push(H(1, 'Inputs and outputs')); b = b.concat(io); }
            var after = typeof spec.after === 'function' ? (safe(function () { return spec.after(ctx); }, []) || []) : [];
            b = b.concat(expandR(after, fx));
            var outs = outputs();
            if (outs.length) {
                b.push(H(1, 'Outputs and acceptance'));
                b.push(P('This report is complete when each output below has been produced and accepted against its criteria by the role named. The acceptance is recorded in Safety Lab with who accepted it and when; if an output changes after it is accepted, its acceptance is reopened.'));
                b.push({ k: 'table', name: 'outputs', title: 'Outputs and how each is accepted', rows: outs.map(function (x, i) { return { '#': String(i + 1), Output: x.what, 'Accepted when': x.accept || '', 'Accepted by (role)': x.role || docCtl().appr || 'Chief safety engineer', Signature: '', Date: '' }; }), lead: '{N} lists the outputs and how each is accepted.' });
            }
            var rs = secs.filter(function (x) { return x && r.sections.indexOf(x.id) >= 0; });
            rs.forEach(function (x, i) { b.push(H(1, x.title, { appx: appxLetter(i), sec: x.id, edit: x.edit !== false && !!spec.edit, secHead: true })); b = b.concat(secBlocks(x, fx)); });
            var all = number(b);
            if (!o.part) return all;
            var from = -1, to = all.length;
            all.forEach(function (x, i) { if (x.k === 'h' && x.level === 1) { if (from >= 0 && to === all.length && i > from) to = i; if (x.appx && x.sec === String(o.part)) from = i; } });
            return from < 0 ? [P('This appendix is no longer in the report.')] : all.slice(from, to);
        }
        function appxOf(sid, rid) { var r = repOf(rid); if (!r) return ''; var i = r.sections.indexOf(String(sid)); return i < 0 ? '' : appxLetter(i); }
        // v1.2: one section alone (its tab and its own Word file): its heading, then its blocks, numbered on their own
        function onlyBlocks(id, secs, forExport) {
            var s = (secs || []).filter(function (x) { return x && x.id === id; })[0];
            if (!s) return [P('This section is no longer in the project.')];
            var b = [H(1, s.title, { sec: s.id, edit: s.edit !== false && !!spec.edit, secHead: true })];
            return b.concat(secBlocks(s, forExport));
        }
        function coverTables(only) {
            var d = docCtl();
            var r1 = REP ? repOf(REP) : null;
            var dc = [{ Item: 'Document number', Entry: d.no }, { Item: 'Title', Entry: spec.title + (r1 ? ': ' + r1.label : '') }, { Item: 'Program', Entry: projName() }, { Item: 'Revision', Entry: rev() }, { Item: 'Date', Entry: d.issues.length ? d.issues[d.issues.length - 1].date : today() }, { Item: 'Status', Entry: d.status }];
            if (only) dc.splice(2, 0, { Item: 'Section', Entry: only + ' (one section of the full document)' });
            return [{ title: 'Document control', rows: dc },
                { title: 'Approvals', rows: [{ Role: 'Prepared by', Holder: d.prep || 'To be named (by role)', Signature: '', Date: '' }, { Role: 'Reviewed by', Holder: d.rev || 'To be named (by role)', Signature: '', Date: '' }, { Role: 'Approved by', Holder: d.appr || 'To be named (by role)', Signature: '', Date: '' }] },
                { title: 'Revision history', rows: d.issues.length ? d.issues.map(function (x) { return { Revision: x.rev, Date: x.date, Description: x.note }; }) : [{ Revision: 'Draft', Date: today(), Description: 'Not yet issued' }] }];
        }
        function tblHtml(rows, rowQ) { var hd = rows.length ? Object.keys(rows[0]) : []; return '<table class="ccr-dt"><thead><tr>' + hd.map(function (h) { return '<th>' + E(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r, i) { var q = rowQ && rowQ[i]; return '<tr' + (q ? ' data-ccq="' + E(q) + '"' : '') + '>' + hd.map(function (h) { return '<td>' + E(r[h]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; }
        function frontHtml(blocks) {
            var hs = blocks.filter(function (b) { return b.k === 'h'; }), ts = blocks.filter(function (b) { return b.k === 'table'; }), fs = blocks.filter(function (b) { return b.k === 'fig' || b.k === 'shot'; });
            var r2 = REP ? repOf(REP) : null;
            return '<div class="ccr-cover" data-cc-cover="1"' + (r2 ? ' data-cc-report="' + E(r2.id) + '"' : '') + '><div class="ccr-ct">' + E(spec.title) + '</div>' + (r2 ? '<div class="ccr-ct2">' + E(r2.label) + '</div>' : '') + '<div class="ccr-cs">' + E(projName()) + '</div>' + coverTables().map(function (t) { return '<div class="ccr-cap">' + E(t.title) + '</div>' + tblHtml(t.rows); }).join('') + '</div>'
                + '<div class="ccr-front" data-cc-toc="1"><h3 class="ccr-dh">Contents</h3>' + hs.map(function (h, i) { return '<div class="ccr-tl' + (h.level > 1 ? ' l2' : '') + '"><a href="javascript:void(0)" data-cc-goto="h' + i + '">' + E(h.text) + '</a></div>'; }).join('')
                + '<h3 class="ccr-dh">List of tables</h3>' + (ts.length ? ts.map(function (t) { return '<div class="ccr-tl" data-cc-lot="1"><a href="javascript:void(0)" data-cc-goto="t' + t.n + '">' + E(t.caption) + '</a></div>'; }).join('') : '<p>None.</p>')
                + '<h3 class="ccr-dh">List of figures</h3>' + (fs.length ? fs.map(function (f) { return '<div class="ccr-tl" data-cc-lof="1"><a href="javascript:void(0)" data-cc-goto="f' + f.n + '">' + E(f.caption) + '</a></div>'; }).join('') : '<p>None.</p>') + '</div>';
        }
        function bodyHtml(blocks, forPage) {
            var hi = 0, out = '', open = false;
            blocks.forEach(function (b) {
                if (b.k === 'h') {
                    if ((b.level <= 2 || b.secHead) && open) { out += '</div>'; open = false; }
                    var id = 'h' + (hi++);
                    var tools = forPage && b.sec && b.edit ? ' <button type="button" class="ccr-edit" data-cc-edit="' + E(b.sec) + '" onclick="SLCcaReport.act(' + J(key) + ',\'edit\',' + J(b.sec) + ')">Edit</button>' : '';
                    if (b.secHead && b.sec) { out += '<div class="ccr-sec" data-ccsec="' + E(b.sec) + '">'; open = true; }
                    out += '<h3 class="ccr-dh ' + (b.level === 1 ? 'l1' : 'l2') + '" data-cc-a="' + id + '">' + E(b.text) + tools + '</h3>';
                    if (forPage && b.sec && ui0.editing === b.sec) out += editForm(b.sec);
                    return;
                }
                if (b.k === 'part') { out += '<h4 class="ccr-part' + (b.level === 2 ? ' l2' : '') + '">' + E(b.text) + '</h4>'; return; }
                if (b.k === 'p') { out += '<p' + (b.q ? ' data-ccq="' + E(b.q) + '"' : '') + (b.authp ? ' data-cc-authp="' + E(b.authp) + '"' : '') + (/^Not decided yet|^To be decided/.test(b.text) ? ' class="ccr-tbd"' : '') + '>' + E(b.text).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') + '</p>'; return; }
                if (b.k === 'html') { if (forPage) out += '<div class="ccr-html" data-cc-html="1">' + (b.html || '') + '</div>'; return; }
                if (b.k === 'act') { if (forPage) out += '<div class="ccr-act"><button type="button" class="slap-btn" data-cc-act="1" onclick="' + E(b.onclick) + '">' + E(b.label) + '</button></div>'; return; }
                if (b.k === 'fig') { out += '<div class="ccr-fig" data-cc-a="f' + b.n + '">' + b.svg + '</div><div class="ccr-cap">' + E(b.caption) + '</div>'; return; }
                if (b.k === 'shot') { out += '<div class="ccr-fig ccr-shotfig" data-cc-a="f' + b.n + '" data-ccshotfig="' + E(b.shotOf || '') + '"' + (b.color ? ' data-ccshotcolor="' + E(b.color) + '"' : '') + '><img alt="' + E(b.title) + '" src="' + b.png + '" width="' + b.w + '" height="' + b.h + '"></div><div class="ccr-cap">' + (b.color ? '<i class="ccr-swatch" style="background:' + E(b.color) + '"></i>' : '') + E(b.caption) + (b.colors && b.colors.length ? '<div class="ccr-legend" data-cc-legend="1">' + b.colors.map(function (c) { return '<span><i class="ccr-swatch" style="background:' + E(c.hex) + '"></i>' + E(c.label) + ' (' + E(c.name) + ')</span>'; }).join('') + '</div>' : '') + '</div>'; return; }
                if (b.k === 'auth') { if (forPage && b.sec) out += authHtml(b.sec, b.aid); return; }
                if (b.pend) { if (forPage) out += '<p class="ccr-tbd" data-ccshot-pend="1">' + E(b.text) + '</p>'; return; }
                if (b.k === 'table') { out += '<div class="ccr-cap" data-cc-a="t' + b.n + '"' + (b.q ? ' data-ccq="' + E(b.q) + '"' : '') + '>' + E(b.caption) + '</div>' + (b.rows && b.rows.length ? tblHtml(b.rows, b.rowQ) : '<p class="ccr-tbd">(No entries)</p>'); return; }
            });
            if (open) out += '</div>';
            return out;
        }
        function fullHtml(o) { if (o && o.report && REP !== String(o.report)) return withRep(o.report, function () { return fullHtml(o); }); var bl = doc(o); return frontHtml(bl) + bodyHtml(bl, !(o && o.forExport)); }
        // the Word model (report_writer.js): small headings become bold lines, preview-only buttons are left out
        function model(o) {
            if (o && o.report && REP !== String(o.report)) return withRep(o.report, function () { return model(o); });
            if (o && o.report) {
                var dR = docCtl(), C1 = C, rr = repOf(REP); C = LIGHT;
                try {
                    var blR = doc({ forExport: true, report: REP });
                    return { title: spec.title, report: REP, titleLines: [projName(), rr ? rr.label : REP, dR.no + ' · Revision ' + rev() + ' · ' + dR.status], cover: { tables: coverTables() }, headerText: dR.no + ' Rev ' + rev() + ' · ' + spec.title + (rr ? ' · ' + rr.label : ''), projectName: projName(), sigFigs: 3, blocks: wordBlocks(blR) };
                } finally { C = C1; }
            }
            var d = docCtl(), C0 = C, only = o && o.only ? String(o.only) : null; C = LIGHT;
            try {
                var bl = doc({ forExport: true, only: only }), st = only ? ((bl.filter(function (x) { return x.k === 'h' && x.secHead; })[0] || {}).text || only).replace(/^\d+\.\s*/, '') : '';
                return { title: spec.title, titleLines: [projName()].concat(only ? [st] : []).concat([d.no + ' · Revision ' + rev() + ' · ' + d.status]), cover: { tables: coverTables(only ? st : null) }, headerText: d.no + ' Rev ' + rev() + ' · ' + spec.title + (only ? ' · ' + only : ''), projectName: projName(), sigFigs: 3, only: only || undefined,
                    blocks: wordBlocks(bl) };
            } finally { C = C0; }
        }
        function wordBlocks(bl) {
            return bl.filter(function (b) { return b.k !== 'act' && b.k !== 'auth' && b.k !== 'html' && !b.pend; }).map(function (b) {
                        if (b.k === 'fig') return { k: 'img', caption: b.title, svg: b.svg, w: b.w, h: b.h };
                        if (b.k === 'shot') return { k: 'img', caption: b.title, dataUrl: b.png, w: b.w, h: b.h, shot: true };
                        if (b.k === 'table') { var t = { k: 'table', name: b.name, title: b.title, rows: b.rows }; if (b.rows && b.rows[0] && Object.keys(b.rows[0]).length >= 4) t.small = true; return t; }
                        if (b.k === 'part') return { k: 'p', text: '**' + b.text + '**' };
                        if (b.k === 'h') return { k: 'h', level: b.level, text: b.text };
                        return { k: 'p', text: b.text };
            });
        }
        async function word(o) {
            var lib = typeof root._loadDocxLib === 'function' ? await root._loadDocxLib() : root.docx;
            if (!lib || !root.SLReportWriter) throw fail('The Word writer is not loaded in this build.');
            var rid = o && o.report ? String(o.report) : null;
            if (rid) { var rsec = (repOf(rid) || { sections: [] }).sections; for (var q = 0; q < rsec.length; q++) await shotsReady(rsec[q]); }
            else await shotsReady(o && o.only ? String(o.only) : null);
            var m = model(o), P0 = root.SLFtaPrint;
            if (root.SLReportComments) { try { root.SLReportComments.annotate(m, key); } catch (_) {} }   // v1.9: open comments as margin comments
            for (var i = 0; i < m.blocks.length; i++) { var b = m.blocks[i]; if (b.k === 'img' && !b.dataUrl) { try { b.dataUrl = P0 && P0.png ? await P0.png({ svg: b.svg, w: b.w, h: b.h }, 2) : null; } catch (_) { b.dataUrl = null; } } }
            var blob = await root.SLReportWriter.docx(m, lib);
            try { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = withRep(rid, function () { return (docCtl().no + ' Rev ' + rev() + ' ' + spec.title + (m.only ? ' ' + m.only : '')).replace(/[^\w-]+/g, '_') + '.docx'; }); document.body.appendChild(a); a.click(); a.remove(); } catch (_) {}
            return blob;
        }
        // v1.5: every report as its own Word file, one after another
        async function wordAll() { var L = repList(), out = []; for (var i = 0; i < L.length; i++) out.push(await word({ report: L[i].id })); return out; }
        function print(o) {
            var C0 = C; C = LIGHT; var html, rid = o && o.report ? String(o.report) : null;
            try { html = rid ? withRep(rid, function () { return fullHtml({ forExport: true, report: rid }); }) : fullHtml({ forExport: true }); } finally { C = C0; }
            var css = '<style>.ccr-shotfig img{max-width:100%;height:auto;display:block}.ccr-dt{border-collapse:collapse;width:100%;font-size:11px}.ccr-dt th,.ccr-dt td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}.ccr-cap{font-weight:700;font-size:11px;margin:10px 0 4px;text-align:center}.ccr-cover,.ccr-front{page-break-after:always}.ccr-ct{font-size:26px;font-weight:700;margin-top:80px}.ccr-cs{font-size:15px;margin:6px 0 30px}.ccr-fig svg{max-width:100%;height:auto;background:#fff}.ccr-tl.l2{margin-left:16px}.ccr-part{font-size:12.5px;margin:10px 0 4px}</style>';
            if (U()) return U().openReport(spec.title + ' · ' + projName(), css + html);
            return false;
        }

        // ---- the page --------------------------------------------------------------------------------------------------
        function style() {
            if (typeof document === 'undefined' || document.getElementById('ccr-style')) return;
            var st = document.createElement('style'); st.id = 'ccr-style';
            st.textContent = '.ccr-pick{display:flex;align-items:center;gap:10px;margin:0 0 14px;flex-wrap:wrap}.ccr-pick label{font-weight:700;font-size:13.5px}.ccr-pick select{font:inherit;font-size:14px;padding:7px 34px 7px 10px;min-width:min(520px,100%);max-width:100%;border:1px solid var(--color-border-strong,#c7cbd1);border-radius:8px;background-color:var(--color-surface-1,#fff);color:var(--color-text-primary,#101216)}'
                + '.ccr-ct2{font-size:17px;font-weight:600;margin:2px 0 6px}.ccr-reg td{vertical-align:top}.ccr-reg td:first-child{white-space:nowrap}.ccr-reg p{margin:6px 0 10px}'
                + '.ccr-shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-top:8px}'
                + '.ccr-shot{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;text-align:left;padding:6px;border:1px solid var(--color-border-strong,#c7cbd1);border-radius:8px;background:var(--color-surface-1,#fff);color:var(--color-text-primary,#101216);cursor:pointer;font:inherit}'
                + '.ccr-shot.on{border:2px solid #1A6EF2;padding:5px}.ccr-shotimg{position:relative;display:block;background:#fff;border-radius:5px;overflow:hidden;aspect-ratio:8/5}.ccr-shotimg img{width:100%;height:100%;object-fit:contain;display:block}.ccr-shotimg img[data-pending]{visibility:hidden}'
                + '.ccr-shotwait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#101216}.ccr-shotlab{display:flex;gap:7px;align-items:flex-start;margin-top:6px;font-size:12.5px}.ccr-shotlab .ccr-oe{display:block;font-weight:400}'
                + '.ccr .ccr-shot,.ccr .ccr-shot:hover,.ccr .ccr-shot:focus,.ccr .ccr-shot:active{background:var(--color-surface-1,#fff)!important;background-image:none!important;color:var(--color-text-primary,#101216)!important;box-shadow:none!important;transform:none!important}.ccr .ccr-shot:focus-visible{outline:2px solid #1A6EF2;outline-offset:2px}'
                + '.ccr-shot .ccr-mk.sq{border-radius:3px}.ccr-shot.on .ccr-mk{background:#1A6EF2;border-color:#1A6EF2}.ccr-shotfig img{max-width:100%;height:auto;display:block;background:#fff}'
                + '.ccr{font-size:13.5px;color:var(--color-text-primary,#101216)}.ccr-lead{font-size:13px;margin:4px 0 12px}'
                + '.ccr-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:18px;align-items:start}@media (max-width:1100px){.ccr-cols{grid-template-columns:minmax(0,1fr)}}.ccr-left,.ccr-right{min-width:0;max-width:100%}'
                + '.ccr-right{position:sticky;top:8px}.ccr-left .slap-grid{grid-template-columns:1fr}.ccr-left .slap-rail{max-height:260px}.ccr-left .slap-card{margin-top:0}'
                // the document: its own colors in both themes, so the app's dark rules cannot reach in
                + '.ccr .ccr-prev{--cp-bg:#ffffff;--cp-ink:#101216;--cp-line:#c7cbd1;--cp-hair:#e3e5e8;--cp-th:#EAF2F8;--cp-link:#0A4FB8;--cp-tbd:#9A3412;--cp-rule:#101216;--cp-flash:#FFF1A8}'
                + 'body.theme-dark .ccr .ccr-prev{--cp-bg:#15181E;--cp-ink:#E8EAED;--cp-line:#3A404A;--cp-hair:#2E333C;--cp-th:#1F2A3A;--cp-link:#8DBBFF;--cp-tbd:#F2925F;--cp-rule:#9AA1AD;--cp-flash:#5A4A12}'
                + '.ccr .ccr-prev{max-height:80vh;overflow:auto;border:1px solid var(--cp-hair);border-radius:10px;padding:16px 20px;background:var(--cp-bg);color:var(--cp-ink);font-size:12.5px;line-height:1.5;position:relative}'
                + '.ccr .ccr-prev h3,.ccr .ccr-prev h4,.ccr .ccr-prev p,.ccr .ccr-prev li,.ccr .ccr-prev b,.ccr .ccr-prev div,.ccr .ccr-prev label,.ccr .ccr-prev span{color:var(--cp-ink)}'
                + '.ccr .ccr-prev h3{font-size:15px;margin:16px 0 6px;background:none;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ccr .ccr-prev h3.l2{font-size:13.5px}.ccr .ccr-prev .ccr-part{font-size:13px;margin:16px 0 5px;padding-bottom:3px;border-bottom:1px solid var(--cp-hair)}.ccr .ccr-prev .ccr-part.l2{font-size:12.5px;margin:12px 0 4px;border-bottom:none}.ccr .ccr-prev p{margin:0 0 7px;max-width:none}.ccr .ccr-prev .ccr-tbd{color:var(--cp-tbd);font-style:italic}'
                + '.ccr-fig svg.ccr-hl .ccr-edge{opacity:.1}.ccr-fig svg.ccr-hl .ccr-edge.on{opacity:1;stroke-width:2.4}.ccr-fig svg.ccr-hl .ccr-node{opacity:.3}.ccr-fig svg.ccr-hl .ccr-node.on{opacity:1}.ccr-edge{transition:opacity .12s}'
                + '.ccr-auth{margin:4px 0 12px;padding:8px 10px;border:1px dashed var(--cp-line,#c7cbd1);border-radius:8px}.ccr-auth textarea{width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:6px;border:1px solid var(--cp-line,#c7cbd1);border-radius:6px;background:var(--cp-bg,#fff);color:var(--cp-ink,#101216)}'
                + '.ccr-authbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}.ccr-authhint,.ccr-authwhy,.ccr-authflag{font-size:12.5px;margin-top:6px}.ccr-authflag{color:var(--cp-tbd,#9A3412)}.ccr-authh{font-weight:700;font-size:12.5px;margin-bottom:4px}.ccr-authdt{font-size:13px;line-height:1.5}.ccr-authwait{font-size:12.5px}'
                + '.ccr-legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-weight:400;margin-top:4px}.ccr-legend span{white-space:nowrap}'
                + '.ccr-swatch{display:inline-block;width:11px;height:11px;border-radius:3px;margin:0 6px -1px 0;border:1px solid rgba(0,0,0,.25);vertical-align:baseline}'
                + '.ccr .ccr-prev .ccr-cap{font-weight:700;font-size:11.5px;margin:10px 0 4px;text-align:center}.ccr-cover{border-bottom:2px solid var(--cp-rule);padding-bottom:14px;margin-bottom:14px}.ccr-ct{font-size:22px;font-weight:700;margin-top:6px}.ccr-cs{font-size:14px;margin:2px 0 10px}'
                + '.ccr-front{border-bottom:2px solid var(--cp-rule);padding-bottom:12px;margin-bottom:12px}.ccr-tl{font-size:12px;margin:1px 0}.ccr-tl.l2{margin-left:16px}.ccr .ccr-prev a{color:var(--cp-link);text-decoration:none}'
                + '.ccr .ccr-prev .ccr-dt{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:10px}.ccr .ccr-prev .ccr-dt tr,.ccr .ccr-prev .ccr-dt td{background:var(--cp-bg);color:var(--cp-ink)}'
                + '.ccr .ccr-prev .ccr-dt thead th,.ccr .ccr-prev .ccr-dt th,.ccr .ccr-prev .ccr-dt td{border:1px solid var(--cp-line) !important;padding:4px 6px;text-align:left;vertical-align:top;font-family:inherit !important;text-transform:none !important;letter-spacing:normal !important;font-size:11.5px !important}'
                + '.ccr .ccr-prev .ccr-dt thead th,.ccr .ccr-prev .ccr-dt th{background:var(--cp-th) !important;color:var(--cp-ink) !important;font-weight:700}'
                + '.ccr-fig{margin:10px 0 2px;overflow-x:auto;text-align:center}.ccr-fig>svg,.ccr-fig>img{display:inline-block;margin:0 auto}.ccr-fig svg{max-width:100%;height:auto;border:1px solid var(--cp-hair,#e3e5e8);border-radius:8px}.ccr-fig .ccr-node:hover rect{stroke-width:2.4}'
                + '.ccr-flash{animation:ccrFlash 2.2s ease-out}@keyframes ccrFlash{0%,35%{background:var(--cp-flash,#FFF1A8);box-shadow:0 0 0 4px var(--cp-flash,#FFF1A8)}100%{background:transparent;box-shadow:none}}'
                + '.ccr-edit{font:inherit;font-size:11.5px;font-weight:600;padding:2px 10px;border-radius:7px;border:1px solid var(--cp-line);background:transparent;color:var(--cp-link) !important;cursor:pointer}'
                + '.ccr-act{margin:4px 0 8px}.ccr-form{border:1px solid var(--cp-line);border-left:4px solid #1A6EF2;border-radius:9px;padding:10px 12px;margin:6px 0 12px}.ccr-form label{display:block;font-size:12px;font-weight:600;margin:6px 0 2px}'
                + '.ccr-form input[type=text],.ccr-form textarea,.ccr-form select{font:inherit;font-size:12.5px;width:100%;box-sizing:border-box;padding:5px 7px;border-radius:7px;border:1px solid var(--cp-line);background:var(--cp-bg);color:var(--cp-ink)}.ccr-form textarea{min-height:56px}'
                + '.ccr-form .ccr-chk{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:2px 10px}.ccr-form .ccr-chk label{font-weight:400;display:flex;gap:6px;align-items:flex-start;margin:1px 0}.ccr-form .ccr-chk input{margin-top:3px}.ccr-hint{font-size:11.5px;font-weight:400}'
                + '.ccr-err{color:#B42318 !important;font-weight:600;margin:6px 0}body.theme-dark .ccr-err{color:#FF8A80 !important}'
                + '.ccr-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;align-items:center}.ccr-bar button{font:inherit;font-size:12.5px;padding:6px 12px;border:1px solid var(--color-border-strong,#c7cbd1);border-radius:8px;background:none;color:inherit;cursor:pointer}.ccr-bar button.p{background:#1A6EF2;border-color:#1A6EF2;color:#fff}.ccr-bar button.on{background:#101216;color:#fff;border-color:#101216}body.theme-dark .ccr-bar button.on{background:#E8EAED;color:#101216}'
                + '.ccr-box{border:1px solid var(--color-border,#e3e5e8);border-radius:10px;padding:10px 12px;margin:12px 0;background:var(--color-surface-1,#fff)}.ccr-box h4{margin:0 0 6px;font-size:13px}.ccr-panel{border-left:4px solid #1A6EF2}'
                + '.ccr-wt{width:100%;border-collapse:collapse;font-size:12.5px}.ccr-wt th,.ccr-wt td{border-top:1px solid var(--color-border,#e3e5e8);padding:5px 6px;text-align:left;vertical-align:top}'
                + '.ccr-doc{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;align-items:end}.ccr-doc label{font-size:11.5px;font-weight:600;display:block;margin-bottom:3px}.ccr-doc select,.ccr-doc input{font:inherit;font-size:12.5px;width:100%;box-sizing:border-box;padding:5px 7px;border-radius:7px;border:1px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit}'
                + '.ccr-msg{font-size:12.5px;margin:8px 0;padding:8px 10px;border-radius:8px;background:rgba(31,122,51,.08)}.ccr-msg.err{background:rgba(180,35,24,.08)}'
                // the frame's own question cards (when the module gives questions rather than its own left pane)
                + '.ccr-sech{font-weight:700;font-size:13px;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--color-border,#e3e5e8)}'
                + '.ccr-q{border:1px solid var(--color-border,#e3e5e8);border-left-width:3px;border-radius:10px;padding:10px 12px;margin:0 0 8px;background:var(--color-surface-1,#fff)}.ccr-q.sub{position:relative}.ccr-q.sub::before{content:"";position:absolute;left:-16px;top:-9px;width:12px;height:30px;border-left:2px solid var(--color-border-strong,#c7cbd1);border-bottom:2px solid var(--color-border-strong,#c7cbd1);border-bottom-left-radius:7px}.ccr-q.gap{border-left-color:#B26A00}'
                + '.ccr-qt{font-weight:600;margin-bottom:4px}.ccr-qx{font-size:12.5px;line-height:1.5;margin:0 0 8px}.ccr-opts{display:flex;flex-direction:column;gap:6px}'
                + '.ccr-opt{font:inherit;text-align:left;display:flex;justify-content:flex-start;gap:10px;align-items:flex-start;width:100%;padding:9px 12px;border-radius:10px;border:1.5px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer}'
                + '.ccr-opt:hover{border-color:#1A6EF2}.ccr-opt.on{border-color:#1A6EF2;background:rgba(26,110,242,.06)}.ccr-mk{flex:none;width:16px;height:16px;border-radius:50%;border:2px solid #6b7280;margin-top:2px;box-sizing:border-box}.ccr-opt.on .ccr-mk{border-color:#1A6EF2;background:#1A6EF2;box-shadow:inset 0 0 0 2.5px #fff}'
                + '.ccr-ob{flex:1 1 auto;display:flex;flex-direction:column;gap:3px;min-width:0}.ccr-ol{font-weight:600;font-size:13.5px}.ccr-oe{font-size:12.5px;line-height:1.45}.ccr-oc{font-size:12px}'
                + '.ccr-see{font:inherit;font-size:12px;border:none;background:none;color:#1A6EF2;cursor:pointer;padding:0;margin-top:6px}body.theme-dark .ccr-see{color:#8DBBFF}'
                // v1.2: the tabs (wrap on a wide screen; one row that scrolls on its own on a phone, never the page)
                + '.ccr,.ccr-host{min-width:0;max-width:100%}.ccr-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 12px;max-width:100%;min-width:0;box-sizing:border-box}'
                + '.ccr-tab{font:inherit;font-size:12.5px;display:inline-flex;gap:6px;align-items:baseline;max-width:280px;min-width:0;padding:6px 11px;border-radius:8px;border:1px solid #c7cbd1;background:#ffffff;color:#101216;cursor:pointer;white-space:nowrap;box-sizing:border-box}'
                + '.ccr-tab:hover{border-color:#1A6EF2}.ccr-tab:focus-visible{outline:2px solid #1A6EF2;outline-offset:2px}.ccr-tabid{font-weight:700;flex:none}.ccr-tabn{overflow:hidden;text-overflow:ellipsis;min-width:0}'
                + '.ccr-tab.on{background:#1A6EF2;border-color:#1A6EF2;color:#ffffff}.ccr-tab.all{font-weight:700}'
                + 'body.theme-dark .ccr-tab{background:#1B1F26;border-color:#3A404A;color:#E8EAED}body.theme-dark .ccr-tab:hover{border-color:#6AA6FF}body.theme-dark .ccr-tab.on{background:#6AA6FF;border-color:#6AA6FF;color:#101216}'
                + '@media (max-width:760px){.ccr-tabs{flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;padding-bottom:6px}.ccr-tab{flex:none;max-width:220px}}'
                + '.ccr .ccr-prev .ccr-tabhead{font-size:11.5px;font-weight:600;margin:0 0 2px;padding-bottom:6px;border-bottom:1px solid var(--cp-hair)}.ccr .ccr-prev .ccr-tabdoc h3.l1{font-size:16px;margin-top:8px}'
                + 'body.theme-dark .ccr-opt.on{background:rgba(106,166,255,.10);border-color:#6AA6FF}body.theme-dark .ccr-opt.on .ccr-mk{border-color:#6AA6FF;background:#6AA6FF;box-shadow:inset 0 0 0 2.5px #15181E}body.theme-dark .ccr-mk{border-color:#9AA1AD}';
            document.head.appendChild(st);
        }
        function qHtml(q) {
            var depth = q.depth || 0, multi = false;
            return '<div class="ccr-q' + (depth ? ' sub' : '') + (q.picked ? '' : ' gap') + '" data-ccqbox="' + E(q.id) + '"' + (depth ? ' style="margin-left:' + (depth * 26) + 'px"' : '') + '><div class="ccr-qt">' + E(q.text) + '</div>'
                + (q.intro ? '<div class="ccr-qx">' + E(q.intro) + '</div>' : '') + '<div class="ccr-opts" role="radiogroup">'
                + (q.options || []).map(function (o) {
                    var on = q.picked === o.id;
                    return '<button type="button" class="ccr-opt' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-ccopt="' + E(q.id + '|' + o.id) + '" onclick="SLCcaReport.act(' + J(key) + ',\'pick\',' + J(q.id) + ',' + J(o.id) + ')">'
                        + '<span class="ccr-mk' + (multi ? ' sq' : '') + '"></span><span class="ccr-ob"><span class="ccr-ol">' + E(o.label) + '</span>' + (o.means ? '<span class="ccr-oe">' + E(o.means) + '</span>' : '') + (o.changes ? '<span class="ccr-oc"><b>What this changes:</b> ' + E(o.changes) + '</span>' : '') + '</span></button>';
                }).join('') + '</div>' + (q.note ? '<div class="ccr-qx" style="margin-top:6px">' + E(q.note) + '</div>' : '')
                + '<button type="button" class="ccr-see" data-ccsee="' + E(q.id) + '" onclick="SLCcaReport.act(' + J(key) + ',\'see\',' + J(q.id) + ')">See where it goes &rarr;</button></div>';
        }
        function leftHtml(cur) {
            if (typeof spec.renderQuestions === 'function') return safe(function () { return spec.renderQuestions(R, cur || null); }, '<div class="ccr-msg err">The questions could not be drawn.</div>');
            var qs = typeof spec.questions === 'function' ? (safe(spec.questions, []) || []) : [];
            if (cur) { var flt = typeof tabSpec().filter === 'function' ? tabSpec().filter : function (q, id) { return q.sec === id; }; qs = qs.filter(function (q) { return safe(function () { return !!flt(q, cur); }, false); }); }
            if (!qs.length) return '<div class="ccr-box" data-cc-noq="1"><div>' + (cur ? 'Nothing to ask for this ' + E(tabSpec().noun || 'section') + ': its section is written from the project. Use Edit on the right to change it.' : 'Nothing to ask: the analysis is worked out from the project.') + '</div></div>';
            var h = '', lastSec = null, titles = {};
            safe(function () { (spec.sections(ctxOf()) || []).forEach(function (s) { titles[s.id] = s.title; }); }, null);
            qs.forEach(function (q) { if (q.sec !== lastSec) { lastSec = q.sec; h += '<div class="ccr-sech" data-ccsecq="' + E(q.sec || '') + '">' + E(titles[q.sec] || q.sec || 'Questions') + '</div>'; } h += qHtml(q); });
            return h;
        }
        function docPanel() {
            var d = docCtl(), sel = function (f, list, cur, ph) { return '<select data-ccdocf="' + f + '" onchange="SLCcaReport.act(' + J(key) + ',\'doc\',\'' + f + '\',this.value)">' + (ph ? '<option value="">' + E(ph) + '</option>' : '') + list.map(function (x) { return '<option' + (x === cur ? ' selected' : '') + '>' + E(x) + '</option>'; }).join('') + '</select>'; };
            return '<div class="ccr-box" data-cc-docctl="1"><h4>Document control</h4><div class="ccr-doc">'
                + '<div><label>Document number</label><input type="text" value="' + E(d.no) + '" onchange="SLCcaReport.act(' + J(key) + ',\'doc\',\'no\',this.value)"></div>'
                + '<div><label>Status</label>' + sel('status', DOC_STATUS, d.status) + '</div>'
                + '<div><label>Prepared by (role)</label>' + sel('prep', ROLES, d.prep, 'To be named') + '</div>'
                + '<div><label>Reviewed by (role)</label>' + sel('rev', ROLES, d.rev, 'To be named') + '</div>'
                + '<div><label>Approved by (role)</label>' + sel('appr', ROLES, d.appr, 'To be named') + '</div>'
                + '<div><label>Revision ' + E(rev()) + '</label><button type="button" class="slap-btn" onclick="SLCcaReport.act(' + J(key) + ',\'issue\')">' + (d.issues.length ? 'Issue a new revision' : 'Issue revision A') + '</button></div>'
                + '</div><div style="margin-top:6px;font-size:12px">One new revision per issue. Issuing again on the same day updates that day\'s issue.</div></div>';
        }
        function acceptBox() {
            var L = acceptance(); if (!L.length) return '';
            var pill = function (s) { return s === 'accepted' ? '<span class="slap-pill ok">Accepted</span>' : s === 'reopened' ? '<span class="slap-pill open">Reopened</span>' : '<span class="slap-pill todo">Open</span>'; };
            return '<div class="ccr-box" data-cc-accept="1"><h4>Outputs to accept</h4><div style="font-size:12px;margin-bottom:6px">Accept each output when it meets its criteria. A change to an accepted output reopens it. Who accepted and when is kept in Safety Lab, never in the report text.</div><table class="ccr-wt"><thead><tr><th>Output</th><th>Accepted when</th><th>State</th><th></th></tr></thead><tbody>'
                + L.map(function (o) { return '<tr data-cc-out="' + E(o.id) + '"><td><b>' + E(o.what) + '</b><div style="font-size:12px">' + E(o.role || '') + '</div></td><td style="font-size:12px">' + E(o.accept || '') + '</td><td>' + pill(o.state) + (o.by ? '<div style="font-size:12px">' + E(o.by) + ' ' + E(String(o.at || '').slice(0, 10)) + '</div>' : '') + '</td><td>' + (o.state === 'accepted' ? '<button type="button" class="slap-btn" onclick="SLCcaReport.act(' + J(key) + ',\'unaccept\',' + J(o.id) + ')">Undo</button>' : '<button type="button" class="slap-btn p" data-cc-acceptbtn="' + E(o.id) + '" onclick="SLCcaReport.act(' + J(key) + ',\'accept\',' + J(o.id) + ')">Accept</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>';
        }
        function nodePanel() {
            var id = ui0.node; if (!id) return '';
            var io = spec.io || {}, h = '', title = '', tab = '', liveTxt = '';
            var acc = acceptance();
            if (id === 'self') {
                title = spec.title; tab = '';
                h = '<div>' + E(io.does || '') + '</div><div style="margin-top:6px"><b>Inputs it needs</b><ul style="margin:2px 0 0;padding-left:18px">' + (io.inputs || []).map(function (i) { return '<li>' + E(i.what) + ' (from ' + E(i.from) + ')</li>'; }).join('') + '</ul></div>'
                    + '<div style="margin-top:6px"><b>Outputs it must produce</b><ul style="margin:2px 0 0;padding-left:18px">' + (io.outputs || []).map(function (o) { var a = acc.filter(function (x) { return x.id === o.id; })[0]; return '<li>' + E(o.what) + ' (for ' + E(o.to) + ')<div>Accepted when: ' + E(o.accept || '') + '</div>' + (a ? '<div>Acceptance: ' + E(a.state === 'accepted' ? 'accepted' : a.state === 'reopened' ? 'reopened, it changed after it was accepted' : 'not yet accepted') + '</div>' : '') + '</li>'; }).join('') + '</ul></div>';
            } else if (/^in:/.test(id)) {
                var i = (io.inputs || []).filter(function (x) { return 'in:' + x.id === id; })[0] || {}; title = i.what || id; tab = i.tab || '';
                h = '<div>Comes from ' + E(i.from || '') + '. The ' + E(lcFirst(spec.title)) + ' reads it when it draws each section.</div>';
            } else if (/^out:/.test(id)) {
                var o = (io.outputs || []).filter(function (x) { return 'out:' + x.id === id; })[0] || {}, a2 = acc.filter(function (x) { return 'out:' + x.id === id; })[0]; title = o.what || id; tab = o.tab || '';
                h = '<div>Goes to ' + E(o.to || '') + '.</div><div style="margin-top:4px"><b>Accepted when:</b> ' + E(o.accept || '') + '</div>' + (a2 ? '<div style="margin-top:4px"><b>Acceptance:</b> ' + E(a2.state === 'accepted' ? 'accepted by ' + a2.by + ' on ' + String(a2.at).slice(0, 10) : a2.state === 'reopened' ? 'reopened: it changed after ' + a2.by + ' accepted it' : 'not yet accepted') + '</div>' : '');
            } else if (typeof spec.node === 'function') {
                var n = safe(function () { return spec.node(id); }, null) || { title: id };
                title = n.title || id; tab = n.tab || '';
                h = (n.does ? '<div>' + E(n.does) + '</div>' : '') + ((n.inputs || []).length ? '<div style="margin-top:6px"><b>Inputs</b><ul style="margin:2px 0 0;padding-left:18px">' + n.inputs.map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + '</ul></div>' : '')
                    + ((n.outputs || []).length ? '<div style="margin-top:6px"><b>Outputs</b><ul style="margin:2px 0 0;padding-left:18px">' + n.outputs.map(function (x) { return '<li>' + E(x.what || x) + (x.accept ? '<div>Accepted when: ' + E(x.accept) + '</div>' : '') + '</li>'; }).join('') + '</ul></div>' : '');
            }
            if (ui0.live && typeof spec.live === 'function') liveTxt = String(safe(function () { return spec.live(id); }, '') || '');
            return '<div class="ccr-box ccr-panel" data-cc-node="' + E(id) + '"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h4>' + E(title) + '</h4><span style="display:flex;gap:6px;flex-wrap:wrap">'
                + (tab ? '<button type="button" class="slap-btn p" onclick="switchTab(' + J(tab) + ')">Open the page</button>' : '')
                + (typeof spec.live === 'function' ? '<button type="button" class="slap-btn" data-cc-live="1" onclick="SLCcaReport.act(' + J(key) + ',\'live\')">' + (ui0.live ? 'Hide where the program stands' : 'Show where the program stands') + '</button>' : '')
                + '<button type="button" class="slap-btn" onclick="SLCcaReport.act(' + J(key) + ',\'node\',null)">Close</button></span></div>' + h
                + (ui0.live ? '<div style="margin-top:6px" data-cc-nodelive="1"><b>Where it stands now:</b> ' + E(liveTxt || 'Nothing recorded yet') + ' (shown here on request; never written into the report)</div>' : '') + '</div>';
        }
        function editForm(sec) {
            var f = spec.edit && typeof spec.edit.fields === 'function' ? (safe(function () { return spec.edit.fields(sec); }, []) || []) : [];
            var field = function (x) {
                var nm = 'data-ccf="' + E(x.key) + '"';
                var inp = x.type === 'textarea' ? '<textarea ' + nm + '>' + E(x.value || '') + '</textarea>'
                    : x.type === 'select' ? '<select ' + nm + '>' + (x.options || []).map(function (o) { return '<option value="' + E(o[0]) + '"' + (String(o[0]) === String(x.value || '') ? ' selected' : '') + '>' + E(o[1]) + '</option>'; }).join('') + '</select>'
                    : x.type === 'checks' ? '<div class="ccr-chk" ' + nm + ' data-ccchecks="1">' + (x.options || []).map(function (o) { var on = (x.value || []).map(String).indexOf(String(o[0])) >= 0; return '<label><input type="checkbox" value="' + E(o[0]) + '"' + (on ? ' checked' : '') + '><span>' + E(o[1]) + '</span></label>'; }).join('') + '</div>'
                    : '<input type="text" ' + nm + ' value="' + E(x.value || '') + '">';
                return '<label>' + E(x.label) + (x.hint ? ' <span class="ccr-hint">' + E(x.hint) + '</span>' : '') + '</label>' + inp;
            };
            return '<div class="ccr-form" data-cc-form="' + E(sec || 'new') + '">' + (sec ? '' : '<b>' + E((spec.edit && spec.edit.addLabel) || 'Add') + '</b>') + f.map(field).join('')
                + (ui0.err ? '<div class="ccr-err" data-cc-err="1">' + E(ui0.err) + '</div>' : '')
                + '<div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="slap-btn p" data-cc-save="' + E(sec || 'new') + '" onclick="SLCcaReport.act(' + J(key) + ',\'save\',' + J(sec || null) + ')">Save</button><button type="button" class="slap-btn" onclick="SLCcaReport.act(' + J(key) + ',\'cancel\')">Cancel</button></div></div>';
        }
        function host() {
            if (typeof document === 'undefined') return null;
            var v = document.getElementById(spec.viewId); if (!v) return null;
            var h = document.getElementById('ccr-host-' + key);
            if (!h) { h = document.createElement('div'); h.id = 'ccr-host-' + key; h.className = 'ccr-host'; var head = v.querySelector('.header-with-export'); if (head && head.parentNode === v) v.insertBefore(h, head.nextSibling); else v.insertBefore(h, v.firstChild); }
            return h;
        }
        // ---- v1.2: the tabs --------------------------------------------------------------------------------------------
        function tabsOn() { return !!spec.tabs; }
        function tabSpec() { return spec.tabs && typeof spec.tabs === 'object' ? spec.tabs : {}; }
        function tabOf(s) {
            var t = s && s.tabLabel && typeof s.tabLabel === 'object' ? s.tabLabel : null, title = String((s && s.title) || (s && s.id) || '');
            if (t) return { id: String(t.id || ''), name: String(t.name || '') };
            return { id: '', name: title };
        }
        function tabList(secs) { return (secs || []).filter(function (s) { return s && s.id; }).map(function (s) { var t = tabOf(s); return { id: s.id, tid: t.id, name: t.name, label: (t.id ? t.id + ' ' : '') + t.name, title: String(s.title || s.id) }; }); }
        // v1.5: the reports: spec.reports(secs) -> [{ id, code, label, title, sections: [section ids] }], or one per section
        function repList(secs) {
            secs = secs || secsOf(ctxOf()) || [];
            if (typeof spec.reports === 'function') {
                var L = safe(function () { return spec.reports(secs); }, null);
                if (Array.isArray(L)) return L.filter(function (r) { return r && r.id; }).map(function (r) { return { id: String(r.id), code: String(r.code || r.id), label: String(r.label || r.title || r.id), title: String(r.title || r.label || r.id), sections: (r.sections || []).map(String) }; });
            }
            return tabList(secs).map(function (t) { return { id: t.id, code: t.tid || t.id, label: t.label, title: t.title, sections: [t.id] }; });
        }
        function repOf(id, secs) { return repList(secs).filter(function (r) { return r.id === String(id); })[0] || null; }
        function repOfSection(sid, secs) { return repList(secs).filter(function (r) { return r.sections.indexOf(String(sid)) >= 0; })[0] || null; }
        // a page without an "All" register (spec.tabs.allLabel === false) always has a report open: the first one
        function noRegister() { return tabSpec().allLabel === false; }
        // the tab kept for this project (null = All); a tab whose section has gone falls back to All
        function storedTab() { if (!tabsOn()) return null; var s = store(), t = s.tab != null ? s.tab : ui0.tab; return t ? String(t) : null; }
        // v2.0: with spec.tabs.parts the dropdown also picks one appendix of a report: the tab is '<report>::<section>'
        function partsOn() { return !!(tabsOn() && tabSpec().parts && spec.appendices); }
        function ridOf(t) { return t ? String(t).split('::')[0] : null; }
        function partOf(t) { var i = t ? String(t).indexOf('::') : -1; return i < 0 ? null : String(t).slice(i + 2); }
        function tabOk(t, list) { list = list || safe(function () { return repList(); }, []) || []; var r = list.filter(function (x) { return x.id === ridOf(t); })[0]; if (!r) return false; var pt = partOf(t); return !pt || (partsOn() && r.sections.indexOf(pt) >= 0); }
        function tab() {
            var t = storedTab(); if (!t && noRegister()) { var f0 = safe(function () { return repList()[0]; }, null); return f0 ? f0.id : null; } if (!t) return null;
            return tabOk(t) ? t : null;
        }
        function setTab(id, o) {
            if (!tabsOn()) return false;
            id = id ? String(id) : null;
            var s = store(); if (id) s.tab = id; else delete s.tab;   // rides the next save (like projectConfig.lastPlace)
            ui0.tab = id; ui0.node = null; ui0.editing = null; ui0.adding = false; ui0.err = null; ui0.msg = null;
            if (!o || o.render !== false) render();
            return true;
        }
        // v1.5: one dropdown, not a row of tabs (Waqas: "this should be a drop down menu")
        function tabsHtml(list, cur) {
            var all = tabSpec().allLabel, lab = tabSpec().pickLabel || 'Report';
            var opts = partsOn()
                ? list.map(function (r) { var o0 = '<option value="' + E(r.id) + '" data-cc-part="front"' + (r.id === cur ? ' selected' : '') + '>' + E(tabSpec().frontLabel || 'Front of the report') + '</option>' + r.sections.map(function (sid, i) { var v = r.id + '::' + sid, lb = safe(function () { return typeof tabSpec().partLabel === 'function' ? tabSpec().partLabel(sid) : sid; }, sid); return '<option value="' + E(v) + '" data-cc-part="' + E(sid) + '"' + (v === cur ? ' selected' : '') + '>' + E('Appendix ' + appxLetter(i) + ': ' + lb) + '</option>'; }).join(''); return list.length > 1 ? '<optgroup label="' + E(r.label) + '">' + o0 + '</optgroup>' : o0; }).join('')
                : list.map(function (r) { return '<option value="' + E(r.id) + '"' + (r.id === cur ? ' selected' : '') + '>' + E(r.label) + '</option>'; }).join('');
            return '<div class="ccr-pick" data-cctabs="1"><label for="ccr-sel-' + E(key) + '">' + E(lab) + '</label><select id="ccr-sel-' + E(key) + '" data-cctabsel="1" onchange="SLCcaReport.act(' + J(key) + ',\'tab\',this.value)">'
                + (all === false ? '' : '<option value=""' + (cur ? '' : ' selected') + '>' + E(all || 'All') + '</option>')
                + opts + '</select></div>';
        }
        // v1.5: the register of the reports (the All choice): one row per report, each opens its report
        function conclusionOf(r, secs) {
            if (typeof spec.conclusion === 'function') { var c = safe(function () { return spec.conclusion(r.id); }, null); if (c) return String(c); }
            if (authDefs().some(function (a) { return a.id === 'conclusion'; })) {
                var ids = spec.authoredAt === 'report' ? [r.id] : r.sections, txt = ids.map(function (id) { var x = authOf(id, 'conclusion'); return x && x.text ? String(x.text).trim() : ''; }).filter(Boolean).join(' ');
                return txt ? (txt.length > 320 ? txt.slice(0, 317).replace(/\s+\S*$/, '') + '...' : txt) : 'Not written yet.';
            }
            var out = '';
            (secs || []).filter(function (x) { return r.sections.indexOf(x.id) >= 0; }).some(function (x) {
                var bl = x.blocks || [], at = -1;
                bl.forEach(function (b, i) { if (at < 0 && b && (b.k === 'part' || b.k === 'h') && /conclusion/i.test(b.text || '')) at = i; });
                if (at < 0) return false;
                for (var i = at + 1; i < bl.length; i++) { if (bl[i] && bl[i].k === 'p' && bl[i].text) { out = String(bl[i].text).replace(/\*\*/g, ''); return true; } if (bl[i] && (bl[i].k === 'part' || bl[i].k === 'h')) break; }
                return false;
            });
            return (out || 'Not concluded yet.').replace(/^What it takes out\.\s*/, '');
        }
        function registerHtml(secs, list) {
            var rows = list.map(function (r) { return withRep(r.id, function () { var d = docCtl(); return { r: r, no: d.no, rev: rev(), st: d.status, c: conclusionOf(r, secs) }; }); });
            return '<div class="ccr-reg" data-cc-register="1"><h3 class="ccr-dh l1">' + E(tabSpec().registerTitle || (spec.title + ' register')) + '</h3>'
                + '<p>Each ' + E(tabSpec().noun || 'subject') + ' has its own report: its own document number, cover, revisions and acceptance. Pick one in the list above, or open it here.</p>'
                + '<table class="ccr-dt"><thead><tr><th>Document number</th><th>Revision</th><th>Status</th><th>' + E(tabSpec().nounTitle || 'Subject') + '</th><th>Conclusion</th><th></th></tr></thead><tbody>'
                + rows.map(function (x) { return '<tr data-cc-regrow="' + E(x.r.id) + '"><td>' + E(x.no) + '</td><td>' + E(x.rev) + '</td><td>' + E(x.st) + '</td><td><b>' + E(x.r.label) + '</b></td><td>' + E(x.c) + '</td><td><button type="button" class="slap-btn" data-cc-open="' + E(x.r.id) + '" onclick="SLCcaReport.act(' + J(key) + ',\'tab\',' + J(x.r.id) + ')">Open</button></td></tr>'; }).join('')
                + '</tbody></table></div>';
        }
        function render() {
            var h = host(); if (!h) return false;
            if (U()) U().style(); style();
            var pv0 = h.querySelector('[data-ccdoc]'), scroll = pv0 ? pv0.scrollTop : 0;
            var dark = isDark(), html, list = [], cur = null;
            C = dark ? DARK : LIGHT;
            try {
                if (tabsOn()) {
                    var secs = secsOf(ctxOf({ dark: dark })); list = repList(secs || []);
                    var t0 = storedTab(); cur = t0 && tabOk(t0, list) ? t0 : null;
                    if (t0 && !cur) setTab(null, { render: false });
                    if (!cur && noRegister() && list.length) cur = list[0].id;
                    REP = ridOf(cur);
                    if (cur && partOf(cur)) { var blP = repDoc({ dark: dark, secs: secs, part: partOf(cur) }), dP = docCtl(), rP = repOf(REP, secs); html = '<div class="ccr-tabdoc" data-cc-tabdoc="' + E(cur) + '" data-cc-partdoc="' + E(partOf(cur)) + '"><div class="ccr-tabhead" data-cc-tabhead="1">' + E(spec.title) + (rP && repList(secs).length > 1 ? ' · ' + E(rP.label) : '') + ' · ' + E(dP.no) + ' Rev ' + E(rev()) + ' · ' + E(projName()) + '</div>' + bodyHtml(blP, true) + '</div>'; }
                    else if (cur) { var blR = doc({ dark: dark, report: cur, secs: secs }); html = '<div class="ccr-tabdoc" data-cc-tabdoc="' + E(cur) + '">' + frontHtml(blR) + bodyHtml(blR, true) + '</div>'; }
                    else html = registerHtml(secs || [], list);
                    cur = cur || null;
                } else if (false) {
                    if (cur) { var d = docCtl(); html = '<div class="ccr-tabdoc" data-cc-tabdoc="' + E(cur) + '"><div class="ccr-tabhead" data-cc-tabhead="1">' + E(spec.title) + ' · ' + E(d.no) + ' Rev ' + E(rev()) + ' · ' + E(projName()) + '</div>' + bodyHtml(doc({ dark: dark, only: cur, secs: secs }), true) + '</div>'; }
                    else { var bl = doc({ dark: dark, secs: secs }); html = frontHtml(bl) + bodyHtml(bl, true); }
                } else html = fullHtml({ dark: dark });
            } finally { C = LIGHT; }
            try {
            if (ui0.shownTab !== undefined && ui0.shownTab !== cur) scroll = 0;   // another tab opens at its top
            ui0.shownTab = cur;
            var shotSec = cur || (typeof spec.shotsFocus === 'function' ? safe(spec.shotsFocus, null) : null);
            var left = leftHtml(cur) + (shotSec ? shotPickerHtml(String(shotSec)) : ''), noun = tabSpec().noun || 'section';
            var bar = tabsOn()
                ? (cur ? '<button type="button" data-cc-word="1" data-cc-wordsec="' + E(cur) + '" onclick="SLCcaReport.act(' + J(key) + ',\'word\')">Word (.docx)</button><button type="button" data-cc-print="1" onclick="SLCcaReport.act(' + J(key) + ',\'print\')">Print</button>'
                    : '<button type="button" data-cc-wordall="1" onclick="SLCcaReport.act(' + J(key) + ',\'wordall\')">Export every report to Word</button>')
                : '<button type="button" data-cc-word="1" onclick="SLCcaReport.act(' + J(key) + ',\'word\')">Word (.docx)</button><button type="button" data-cc-print="1" onclick="SLCcaReport.act(' + J(key) + ',\'print\')">Print</button>';
            h.innerHTML = '<div class="ccr" data-ccr="' + E(key) + '"' + (tabsOn() ? ' data-cctab-open="' + E(cur || '') + '"' : '') + '>' + (spec.lead ? '<p class="ccr-lead">' + E(spec.lead) + '</p>' : '')
                + (tabsOn() ? tabsHtml(list, cur) : '')
                + (ui0.msg ? '<div class="ccr-msg' + (ui0.msg.err ? ' err' : '') + '">' + E(ui0.msg.text) + '</div>' : '')
                + '<div class="ccr-cols"' + (tabsOn() ? ' role="tabpanel" aria-labelledby="ccr-tab-' + E(key) + '-' + E(String(cur || 'all').replace(/[^A-Za-z0-9_-]/g, '_')) + '"' : '') + '><div class="ccr-left"' + (spec.leftId ? ' id="' + E(spec.leftId) + '"' : '') + ' data-ccleft="1">' + left + (tabsOn() ? (cur && !partOf(cur) ? acceptBox() + docPanel() : '') : acceptBox() + docPanel()) + '</div>'
                + '<div class="ccr-right"><div class="ccr-bar">' + (spec.edit ? '<button type="button" class="p" data-cc-add="1" onclick="SLCcaReport.act(' + J(key) + ',\'add\')">' + E(spec.edit.addLabel || 'Add') + '</button>' : '') + '<span style="flex:1"></span>'
                + bar + '</div>'
                + nodePanel() + '<div class="ccr-prev" data-ccdoc="1">' + (ui0.adding ? editForm(null) : '') + html + '</div></div></div></div>';
            var pv = h.querySelector('[data-ccdoc]'); if (pv) { pv.scrollTop = scroll; wire(pv); }
            // v1.9: live comments in the margin of the preview (report_comments.js)
            if (pv && root.SLReportComments) { try { root.SLReportComments.decorate(pv); } catch (e) { try { console.warn('[report comments]', e); } catch (_) {} } }
            var tb = h.querySelector('[data-cctabs]'); if (tb) wireTabs(tb);
            if (ui0.flash) { var k = ui0.flash; ui0.flash = null; flash(k, { stay: true }); }
            return true;
            } finally { REP = null; }
        }
        // the tab row: the open tab is scrolled into its row (a phone's row scrolls on its own); arrow keys move along
        function wireTabs(tb) {
            if (tb.querySelector('select')) return;
            var keep = function () { var on = tb.querySelector('.ccr-tab.on'); if (!on || tb.scrollWidth <= tb.clientWidth + 1) return; var l = on.getBoundingClientRect().left - tb.getBoundingClientRect().left + tb.scrollLeft, r = l + on.offsetWidth; if (l < tb.scrollLeft || r > tb.scrollLeft + tb.clientWidth) tb.scrollLeft = Math.max(0, l - 24); };
            keep();
            // the row turns from wrapped to scrolling when the window narrows (a phone turned, a window resized): keep the open tab in view
            if (typeof ResizeObserver === 'function') { var w0 = tb.clientWidth; new ResizeObserver(function () { if (Math.abs(tb.clientWidth - w0) < 1) return; w0 = tb.clientWidth; keep(); setTimeout(keep, 60); setTimeout(keep, 250); }).observe(tb); }
            tb.addEventListener('keydown', function (ev) {
                var k = ev.key, all = Array.prototype.slice.call(tb.querySelectorAll('.ccr-tab')), i = all.indexOf(document.activeElement);
                if (i < 0 || ['ArrowRight', 'ArrowLeft', 'Home', 'End'].indexOf(k) < 0) return;
                ev.preventDefault();
                var j = k === 'Home' ? 0 : k === 'End' ? all.length - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + all.length) % all.length;
                act('tab', all[j].getAttribute('data-cctab') || null);
                var nb = document.querySelector('#ccr-host-' + key + ' .ccr-tab.on'); if (nb) nb.focus();
            });
        }
        // clicks inside the preview: figure boxes open their panel; contents entries scroll to their place
        function wire(pv) {
            // v1.7: hovering a box of a column diagram lights only its connectors and the boxes at their other ends
            var hl = function (n) {
                var svg = n && n.closest ? n.closest('svg') : null; if (!svg || !svg.querySelector('.ccr-edge')) return;
                var id = n.getAttribute('data-ccnode'), on = {}; on[id] = 1;
                svg.querySelectorAll('.ccr-edge').forEach(function (p) { var ab = (p.getAttribute('data-e') || '').split('|'), hit = ab[0] === id || ab[1] === id; p.classList.toggle('on', hit); if (hit) { on[ab[0]] = 1; on[ab[1]] = 1; } });
                svg.querySelectorAll('.ccr-node').forEach(function (g) { g.classList.toggle('on', !!on[g.getAttribute('data-ccnode')]); });
                svg.classList.add('ccr-hl');
            };
            pv.addEventListener('mouseover', function (ev) { var n = ev.target && ev.target.closest ? ev.target.closest('.ccr-node') : null; if (n) hl(n); });
            pv.addEventListener('mouseout', function (ev) { var n = ev.target && ev.target.closest ? ev.target.closest('.ccr-node') : null; if (!n) return; var to = ev.relatedTarget; if (to && n.contains(to)) return; var svg = n.closest('svg'); if (svg) svg.classList.remove('ccr-hl'); });
            pv.addEventListener('click', function (ev) {
                var t = ev.target, n = t && t.closest ? t.closest('[data-ccnode]') : null;
                if (n && n.getAttribute('data-cckey') === key) { ev.preventDefault(); act('node', n.getAttribute('data-ccnode')); return; }
                var go = t && t.closest ? t.closest('[data-cc-goto]') : null;
                if (go) { ev.preventDefault(); var el = pv.querySelector('[data-cc-a="' + go.getAttribute('data-cc-goto') + '"]'); if (el) pv.scrollTop = Math.max(0, el.offsetTop - 20); }
            });
        }
        // scroll the preview to what an answer wrote (or a section) and light it up
        function flash(target, o) {
            if (typeof document === 'undefined' || !target) return false;
            // v1.2: a section asked for from elsewhere (another page's link, an answer that opens a risk) opens its tab
            if (tabsOn() && /^sec:/.test(target) && !(o && o.stay)) {
                var sid = target.slice(4), rs0 = safe(function () { return repOfSection(sid); }, null);
                var want0 = rs0 ? (partsOn() ? rs0.id + '::' + sid : rs0.id) : null;
                if (rs0 && tab() !== want0 && !(partsOn() && tab() === rs0.id && o && o.front)) {
                    if (!document.getElementById('ccr-host-' + key)) return false;
                    setTab(want0, { render: false }); ui0.flash = target; render();
                    return !!document.querySelector('#ccr-host-' + key + ' [data-ccdoc] [data-ccsec="' + cssq(sid) + '"]');
                }
            }
            var h = document.getElementById('ccr-host-' + key); var pv = h && h.querySelector('[data-ccdoc]'); if (!pv) return false;
            var els = /^sec:/.test(target) ? [pv.querySelector('[data-ccsec="' + cssq(target.slice(4)) + '"]')] : Array.prototype.slice.call(pv.querySelectorAll('[data-ccq="' + cssq(target) + '"]'));
            els = els.filter(Boolean); if (!els.length) return false;
            pv.scrollTop = Math.max(0, els[0].offsetTop - 90);
            els.forEach(function (el) { el.classList.remove('ccr-flash'); void el.offsetWidth; el.classList.add('ccr-flash'); });
            ui0.lit = { target: target, at: Date.now() };
            return true;
        }
        // v1.4: a picture that lands after a section or paragraph was lit up redraws the report; keep its light (the rest of its
        // time, or already faded) as it was before the redraw
        function relight() {
            var L = ui0.lit, dt = L ? Date.now() - L.at : 1e9; if (!L || dt > 60000 || typeof document === 'undefined') return; dt = Math.min(dt, 2200);   // past its time: kept, already faded
            var pv = host() && host().querySelector('[data-ccdoc]'); if (!pv) return;
            var els = /^sec:/.test(L.target) ? [pv.querySelector('[data-ccsec="' + cssq(L.target.slice(4)) + '"]')] : Array.prototype.slice.call(pv.querySelectorAll('[data-ccq="' + cssq(L.target) + '"]'));
            els.filter(Boolean).forEach(function (el) { el.style.animationDelay = '-' + dt + 'ms'; el.classList.add('ccr-flash'); });
        }
        function cssq(s) { return String(s).replace(/["\\]/g, '\\$&'); }
        // v1.5: an answer or a pick that names a section ('sec:<id>') opens that section's report first
        function answered(qid) {
            if (tabsOn() && qid && /^sec:/.test(qid)) { var sq = String(qid).slice(4), rq = safe(function () { return repOfSection(sq); }, null), wq = rq ? (partsOn() ? rq.id + '::' + sq : rq.id) : null; if (rq && tab() !== wq) setTab(wq, { render: false }); }
            ui0.flash = qid || null; ui0.msg = null; render();
        }
        function readForm(sec) {
            var h = document.getElementById('ccr-host-' + key), f = h && h.querySelector('[data-cc-form="' + cssq(sec || 'new') + '"]'), out = {};
            if (!f) return out;
            Array.prototype.forEach.call(f.querySelectorAll('[data-ccf]'), function (el) {
                var k = el.getAttribute('data-ccf');
                if (el.hasAttribute('data-ccchecks')) out[k] = Array.prototype.filter.call(el.querySelectorAll('input[type=checkbox]'), function (c) { return c.checked; }).map(function (c) { return c.value; });
                else out[k] = el.value;
            });
            return out;
        }
        function act(verb, a, b) {
            var rep0 = REP; REP = tabsOn() ? ridOf(tab()) : null;
            try {
                if (verb === 'pick') { if (typeof spec.answer === 'function') spec.answer(a, b); ui0.flash = a; ui0.msg = null; }
                else if (verb === 'see') { if (!flash(a)) { render(); flash(a); } return; }
                else if (verb === 'node') { ui0.node = a || null; }
                else if (verb === 'tab') { setTab(a || null); return; }
                else if (verb === 'wordall') { REP = null; wordAll().catch(function (e) { ui0.msg = { text: 'Could not write the Word files: ' + (e && e.message || e), err: true }; render(); }); return; }
                else if (verb === 'wordsec') { var only = ridOf(tab()); word(only ? (tabsOn() ? { report: only } : { only: only }) : undefined).catch(function (e) { ui0.msg = { text: 'Could not write the Word file: ' + (e && e.message || e), err: true }; render(); }); return; }
                else if (verb === 'live') { ui0.live = !ui0.live; }
                else if (verb === 'accept') { accept(a); ui0.msg = null; }
                else if (verb === 'unaccept') { unaccept(a); }
                else if (verb === 'doc') { setDoc(a, b); ui0.msg = null; }
                else if (verb === 'issue') { var it = issue(); ui0.msg = { text: 'Issued revision ' + it.rev + ' (' + it.date + ').' }; }
                else if (verb === 'edit') { ui0.editing = a; ui0.adding = false; ui0.err = null; }
                else if (verb === 'add') { ui0.adding = true; ui0.editing = null; ui0.err = null; }
                else if (verb === 'cancel') { ui0.editing = null; ui0.adding = false; ui0.err = null; }
                else if (verb === 'save') {
                    var vals = readForm(a), res = spec.edit && typeof spec.edit.save === 'function' ? spec.edit.save(a || null, vals) : { ok: false, err: 'Nothing to save to.' };
                    if (!res || !res.ok) { ui0.err = (res && res.err) || 'Not saved.'; }
                    else {
                        var nid = res.id || a, wasAdd = !a;
                        ui0.err = null; ui0.editing = null; ui0.adding = false;
                        // v1.2: Add opens the new section's tab; an Edit that renames the open section follows it
                        if (tabsOn() && nid && (wasAdd || (a && storedTab() === a && nid !== a))) { var rn = repOfSection(nid); setTab(rn ? (partsOn() ? rn.id + '::' + nid : rn.id) : nid, { render: false }); }
                        ui0.flash = 'sec:' + nid;
                    }
                }
                else if (verb === 'word') { var wr = tabsOn() ? ridOf(tab()) : null; REP = null; word(wr ? { report: wr } : undefined).catch(function (e) { ui0.msg = { text: 'Could not write the Word file: ' + (e && e.message || e), err: true }; render(); }); return; }
                else if (verb === 'print') { var pr = tabsOn() ? ridOf(tab()) : null; REP = null; (pr ? Promise.all((repOf(pr) || { sections: [] }).sections.map(function (x) { return shotsReady(x); })) : shotsReady(null)).then(function () { print(pr ? { report: pr } : undefined); }, function () { print(pr ? { report: pr } : undefined); }); return; }
                else if (verb === 'shot') { shotToggle(a, b); ui0.flash = null; ui0.msg = null; }
                else if (verb === 'authedit') { ui0.authEdit = a + '|' + b; ui0.authSeed = null; }
                else if (verb === 'authcancel') { ui0.authEdit = null; ui0.authSeed = null; }
                else if (verb === 'authsave') { var ta = document.querySelector('#ccr-host-' + key + ' [data-cc-authtext="' + cssq(a + '|' + b) + '"]'); authSave(a, b, ta ? ta.value : '', ui0.authSeedAi ? 'ai-edited' : 'person'); ui0.authEdit = null; ui0.authSeed = null; ui0.authSeedAi = false; }
                else if (verb === 'authaccept') { var rr = authOf(a, b); if (rr && rr.draft) authSave(a, b, rr.draft.text, 'ai'); }
                else if (verb === 'authacceptedit') { var r2 = authOf(a, b); ui0.authEdit = a + '|' + b; ui0.authSeed = r2 && r2.draft ? r2.draft.text : ''; ui0.authSeedAi = true; }
                else if (verb === 'authdiscard') { var m0 = authStore(a, true); if (m0[b]) { delete m0[b].draft; save(); } }
                else if (verb === 'authai') {
                    var kk = a + '|' + b, rid0 = REP; ui0.authBusy = kk; ui0.msg = null; REP = rep0; render();
                    authAi(a, b).then(function () { ui0.authBusy = null; withRep(rid0, render); }, function (e) { ui0.authBusy = null; ui0.msg = { text: (e && e.message) || String(e), err: true }; withRep(rid0, render); });
                    return;
                }
                else if (verb === 'shotnone') { shotNone(a); }
            } catch (e) { ui0.msg = { text: (e && e.message) || String(e), err: true }; } finally { REP = rep0; }
            render();
            if (verb === 'node') { try { var np = document.querySelector('#ccr-host-' + key + ' [data-cc-node]'); if (np && np.scrollIntoView) np.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
        }
        function mount() {
            if (typeof document === 'undefined') return false;
            var tries = 40, t0 = setInterval(function () { if (_mount() || --tries <= 0) clearInterval(t0); }, 250);
            _mount();
            return true;
        }
        function _mount() {
            var v = document.getElementById(spec.viewId); if (!v || !document.body) return false;
            // the observers call whichever instance is registered for this key now (define again replaces it)
            var cur = function () { return REG[key] || R; };
            if (v['_ccrObs_' + key]) { if (v.style.display !== 'none') { try { cur().render(); } catch (_) {} } return true; }
            var shown0 = v.style.display !== 'none';
            v['_ccrObs_' + key] = new MutationObserver(function () { var s = v.style.display !== 'none'; if (s && !shown0) { try { var c = cur(); if (typeof c.spec.onShow === 'function') c.spec.onShow(); c.render(); } catch (e) { try { console.warn('[cca-report ' + key + ']', e); } catch (_) {} } } shown0 = s; });
            v['_ccrObs_' + key].observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
            // the theme switch redraws the open page so its figures take the other palette
            var dark0 = isDark(); new MutationObserver(function () { var d = isDark(); if (d !== dark0) { dark0 = d; if (v.style.display !== 'none') { try { cur().render(); } catch (_) {} } } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
            if (shown0) { try { render(); } catch (_) {} }
            return true;
        }
        Object.assign(R, { ridOf: ridOf, partOf: partOf, appxOf: appxOf, appxLetter: appxLetter, authored: authOf, authSave: authSave, authAi: authAi, authFacts: authFacts, reports: function () { return repList(); }, wordAll: wordAll, withRep: withRep, shotViews: shotViews, shotPicks: shotPicks, shotToggle: shotToggle, shotsReady: shotsReady, shotBlocks: shotBlocks, tab: tab, setTab: setTab, tabs: function () { return tabsOn() ? tabList(secsOf(ctxOf()) || []).map(function (t) { return { id: t.id, label: t.label }; }) : []; }, render: render, doc: doc, fullHtml: fullHtml, model: model, word: word, print: print, flash: flash, answered: answered, acceptance: acceptance, accept: accept, unaccept: unaccept,
            docCtl: docCtl, setDoc: setDoc, issue: issue, rev: rev, act: act, mount: mount, outputs: outputs, ROLES: ROLES });
        // v1.5: called from outside, document control and acceptance act on the open report (the series when none is open)
        ['acceptance', 'accept', 'unaccept', 'docCtl', 'setDoc', 'issue', 'rev'].forEach(function (n) { var f = R[n]; R[n] = function () { var a0 = arguments; return REP ? f.apply(null, a0) : withRep(tabsOn() ? tab() : null, function () { return f.apply(null, a0); }); }; });
        R.tabs = function () { return tabsOn() ? repList().map(function (r) { return { id: r.id, label: r.label }; }) : []; };
        return R;
    }
    function act(key, verb, a, b) { var R = REG[key]; if (R) R.act(verb, a, b); }
    root.SLCcaReport = { VERSION: VERSION, define: define, get: get, act: act, palette: palette, nodeG: nodeG, E: E, ROLES: ROLES, LIGHT: LIGHT, DARK: DARK, wrapText: wrapText, svgWrap: function (w, h, body, title) { return svgWrap(w, h, body, title); }, box: boxSvg, flow: flow };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLCcaReport;
})(typeof window !== 'undefined' ? window : globalThis);
