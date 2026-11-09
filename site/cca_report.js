// cca_report.js (SLCcaReport v1.4, 9 Nov 2026; v1.3 9 Nov 2026; v1.2 8 Nov 2026): the shared report frame of the PRA, ZSA and CMA Autopilots.
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
    var VERSION = '1.4';   // 1.4 9 Nov 2026: pictures placed in the story (shotslot), per-source pictures ticked by default; 1.3: 3D model pictures (spec.shots)
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

        // ---- the store -----------------------------------------------------------------------------------------------
        function store() {
            var p = pc(); if (!p) return { doc: {}, accept: {} };
            if (!p.ccaReports || typeof p.ccaReports !== 'object') p.ccaReports = {};
            var s = p.ccaReports[key]; if (!s || typeof s !== 'object') s = p.ccaReports[key] = {};
            if (!s.doc || typeof s.doc !== 'object') s.doc = {}; if (!s.accept || typeof s.accept !== 'object') s.accept = {};
            if (!s.shots || typeof s.shots !== 'object') s.shots = {};
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
            if (r && r.png) return [{ k: 'shot', name: 'shot-' + v.id, title: v.caption || v.label, png: r.png, w: r.w || 800, h: r.h || 500, lead: v.lead || ('{N} shows it on the 3D model: ' + lcFirst(v.label) + '.'), shotOf: id + '|' + v.id, color: v.color || null }];
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
            return out;
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
                    + '<span class="ccr-shotlab"><span class="ccr-mk sq"></span><span><b>' + (v.color ? '<i class="ccr-swatch" style="background:' + E(v.color) + '"></i>' : '') + E(v.label) + '</b>' + (v.why ? '<span class="ccr-oe">' + E(v.why) + '</span>' : '') + '</span></span></button>';
            });
            h += '</div><button type="button" class="ccr-see" data-ccshot-none="' + E(id) + '" onclick="SLCcaReport.act(' + J(key) + ',\'shotnone\',' + J(id) + ')">' + (picks && !picks.length ? 'No pictures for this part (chosen)' : 'No pictures for this part') + '</button></div>';
            return h;
        }
        function docCtl() { var d = store().doc; if (!d.no) d.no = initials() + '-' + (spec.code || key.toUpperCase()) + '-001'; if (!d.status) d.status = 'Draft'; if (!Array.isArray(d.issues)) d.issues = []; return d; }
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
            var L = typeof spec.outputs === 'function' ? safe(spec.outputs, []) : ((spec.io && spec.io.outputs) || []);
            return (L || []).filter(function (o) { return o && o.id; });
        }
        function fpOf(o) { return typeof o.fp === 'function' ? String(safe(o.fp, '')) : ''; }
        function acceptance() {
            var s = store();
            return outputs().map(function (o) { var r = s.accept[o.id], fp = fpOf(o); var st = !r ? 'open' : (r.fp === fp ? 'accepted' : 'reopened'); return Object.assign({}, o, { state: st, by: r && r.by, at: r && r.at }); });
        }
        function accept(id) { var o = outputs().filter(function (x) { return x.id === id; })[0]; if (!o) throw fail('No such output: ' + id); var s = store(); s.accept[id] = { by: who(), at: now(), fp: fpOf(o) }; save(); return s.accept[id]; }
        function unaccept(id) { var s = store(); delete s.accept[id]; save(); }

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
            var h1 = 0, h2 = 0, t = 0, f = 0, out = [];
            blocks.forEach(function (b) {
                if (!b) return;
                if (b.k === 'h' && b.level === 1) { h1++; h2 = 0; b.text = h1 + '. ' + b.text; }
                else if (b.k === 'h' && b.level === 2) { h2++; b.text = h1 + '.' + h2 + ' ' + b.text; }
                if (b.k === 'table') { t++; b.n = t; b.caption = 'Table ' + t + ': ' + b.title; if (b.lead) out.push(P(String(b.lead).replace('{N}', 'Table ' + t), { sec: b.sec })); }
                if (b.k === 'fig' || b.k === 'shot') { f++; b.n = f; b.caption = 'Figure ' + f + ': ' + b.title; if (b.lead) out.push(P(String(b.lead).replace('{N}', 'Figure ' + f), { sec: b.sec })); }
                out.push(b);
            });
            return out;
        }
        // the whole document as blocks: front, inputs and outputs, one section per subject, after, outputs and acceptance
        function secsOf(ctx) { return safe(function () { return spec.sections(ctx); }, null); }
        function doc(o) {
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
        // v1.2: one section alone (its tab and its own Word file): its heading, then its blocks, numbered on their own
        function onlyBlocks(id, secs, forExport) {
            var s = (secs || []).filter(function (x) { return x && x.id === id; })[0];
            if (!s) return [P('This section is no longer in the project.')];
            var b = [H(1, s.title, { sec: s.id, edit: s.edit !== false && !!spec.edit, secHead: true })];
            return b.concat(secBlocks(s, forExport));
        }
        function coverTables(only) {
            var d = docCtl();
            var dc = [{ Item: 'Document number', Entry: d.no }, { Item: 'Title', Entry: spec.title }, { Item: 'Program', Entry: projName() }, { Item: 'Revision', Entry: rev() }, { Item: 'Date', Entry: d.issues.length ? d.issues[d.issues.length - 1].date : today() }, { Item: 'Status', Entry: d.status }];
            if (only) dc.splice(2, 0, { Item: 'Section', Entry: only + ' (one section of the full document)' });
            return [{ title: 'Document control', rows: dc },
                { title: 'Approvals', rows: [{ Role: 'Prepared by', Holder: d.prep || 'To be named (by role)', Signature: '', Date: '' }, { Role: 'Reviewed by', Holder: d.rev || 'To be named (by role)', Signature: '', Date: '' }, { Role: 'Approved by', Holder: d.appr || 'To be named (by role)', Signature: '', Date: '' }] },
                { title: 'Revision history', rows: d.issues.length ? d.issues.map(function (x) { return { Revision: x.rev, Date: x.date, Description: x.note }; }) : [{ Revision: 'Draft', Date: today(), Description: 'Not yet issued' }] }];
        }
        function tblHtml(rows, rowQ) { var hd = rows.length ? Object.keys(rows[0]) : []; return '<table class="ccr-dt"><thead><tr>' + hd.map(function (h) { return '<th>' + E(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r, i) { var q = rowQ && rowQ[i]; return '<tr' + (q ? ' data-ccq="' + E(q) + '"' : '') + '>' + hd.map(function (h) { return '<td>' + E(r[h]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; }
        function frontHtml(blocks) {
            var hs = blocks.filter(function (b) { return b.k === 'h'; }), ts = blocks.filter(function (b) { return b.k === 'table'; }), fs = blocks.filter(function (b) { return b.k === 'fig' || b.k === 'shot'; });
            return '<div class="ccr-cover" data-cc-cover="1"><div class="ccr-ct">' + E(spec.title) + '</div><div class="ccr-cs">' + E(projName()) + '</div>' + coverTables().map(function (t) { return '<div class="ccr-cap">' + E(t.title) + '</div>' + tblHtml(t.rows); }).join('') + '</div>'
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
                if (b.k === 'p') { out += '<p' + (b.q ? ' data-ccq="' + E(b.q) + '"' : '') + (/^Not decided yet|^To be decided/.test(b.text) ? ' class="ccr-tbd"' : '') + '>' + E(b.text).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') + '</p>'; return; }
                if (b.k === 'act') { if (forPage) out += '<div class="ccr-act"><button type="button" class="slap-btn" data-cc-act="1" onclick="' + E(b.onclick) + '">' + E(b.label) + '</button></div>'; return; }
                if (b.k === 'fig') { out += '<div class="ccr-fig" data-cc-a="f' + b.n + '">' + b.svg + '</div><div class="ccr-cap">' + E(b.caption) + '</div>'; return; }
                if (b.k === 'shot') { out += '<div class="ccr-fig ccr-shotfig" data-cc-a="f' + b.n + '" data-ccshotfig="' + E(b.shotOf || '') + '"' + (b.color ? ' data-ccshotcolor="' + E(b.color) + '"' : '') + '><img alt="' + E(b.title) + '" src="' + b.png + '" width="' + b.w + '" height="' + b.h + '"></div><div class="ccr-cap">' + (b.color ? '<i class="ccr-swatch" style="background:' + E(b.color) + '"></i>' : '') + E(b.caption) + '</div>'; return; }
                if (b.pend) { if (forPage) out += '<p class="ccr-tbd" data-ccshot-pend="1">' + E(b.text) + '</p>'; return; }
                if (b.k === 'table') { out += '<div class="ccr-cap" data-cc-a="t' + b.n + '"' + (b.q ? ' data-ccq="' + E(b.q) + '"' : '') + '>' + E(b.caption) + '</div>' + (b.rows && b.rows.length ? tblHtml(b.rows, b.rowQ) : '<p class="ccr-tbd">(No entries)</p>'); return; }
            });
            if (open) out += '</div>';
            return out;
        }
        function fullHtml(o) { var bl = doc(o); return frontHtml(bl) + bodyHtml(bl, !(o && o.forExport)); }
        // the Word model (report_writer.js): small headings become bold lines, preview-only buttons are left out
        function model(o) {
            var d = docCtl(), C0 = C, only = o && o.only ? String(o.only) : null; C = LIGHT;
            try {
                var bl = doc({ forExport: true, only: only }), st = only ? ((bl.filter(function (x) { return x.k === 'h' && x.secHead; })[0] || {}).text || only).replace(/^\d+\.\s*/, '') : '';
                return { title: spec.title, titleLines: [projName()].concat(only ? [st] : []).concat([d.no + ' · Revision ' + rev() + ' · ' + d.status]), cover: { tables: coverTables(only ? st : null) }, headerText: d.no + ' Rev ' + rev() + ' · ' + spec.title + (only ? ' · ' + only : ''), projectName: projName(), sigFigs: 3, only: only || undefined,
                    blocks: bl.filter(function (b) { return b.k !== 'act' && !b.pend; }).map(function (b) {
                        if (b.k === 'fig') return { k: 'img', caption: b.title, svg: b.svg, w: b.w, h: b.h };
                        if (b.k === 'shot') return { k: 'img', caption: b.title, dataUrl: b.png, w: b.w, h: b.h, shot: true };
                        if (b.k === 'table') { var t = { k: 'table', name: b.name, title: b.title, rows: b.rows }; if (b.rows && b.rows[0] && Object.keys(b.rows[0]).length >= 4) t.small = true; return t; }
                        if (b.k === 'part') return { k: 'p', text: '**' + b.text + '**' };
                        if (b.k === 'h') return { k: 'h', level: b.level, text: b.text };
                        return { k: 'p', text: b.text };
                    }) };
            } finally { C = C0; }
        }
        async function word(o) {
            var lib = typeof root._loadDocxLib === 'function' ? await root._loadDocxLib() : root.docx;
            if (!lib || !root.SLReportWriter) throw fail('The Word writer is not loaded in this build.');
            await shotsReady(o && o.only ? String(o.only) : null);
            var m = model(o), P0 = root.SLFtaPrint;
            for (var i = 0; i < m.blocks.length; i++) { var b = m.blocks[i]; if (b.k === 'img' && !b.dataUrl) { try { b.dataUrl = P0 && P0.png ? await P0.png({ svg: b.svg, w: b.w, h: b.h }, 2) : null; } catch (_) { b.dataUrl = null; } } }
            var blob = await root.SLReportWriter.docx(m, lib);
            try { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (docCtl().no + ' Rev ' + rev() + ' ' + spec.title + (m.only ? ' ' + m.only : '')).replace(/[^\w-]+/g, '_') + '.docx'; document.body.appendChild(a); a.click(); a.remove(); } catch (_) {}
            return blob;
        }
        function print() {
            var C0 = C; C = LIGHT; var html;
            try { html = fullHtml({ forExport: true }); } finally { C = C0; }
            var css = '<style>.ccr-shotfig img{max-width:100%;height:auto;display:block}.ccr-dt{border-collapse:collapse;width:100%;font-size:11px}.ccr-dt th,.ccr-dt td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}.ccr-cap{font-weight:700;font-size:11px;margin:10px 0 4px}.ccr-cover,.ccr-front{page-break-after:always}.ccr-ct{font-size:26px;font-weight:700;margin-top:80px}.ccr-cs{font-size:15px;margin:6px 0 30px}.ccr-fig svg{max-width:100%;height:auto;background:#fff}.ccr-tl.l2{margin-left:16px}.ccr-part{font-size:12.5px;margin:10px 0 4px}</style>';
            if (U()) return U().openReport(spec.title + ' · ' + projName(), css + html);
            return false;
        }

        // ---- the page --------------------------------------------------------------------------------------------------
        function style() {
            if (typeof document === 'undefined' || document.getElementById('ccr-style')) return;
            var st = document.createElement('style'); st.id = 'ccr-style';
            st.textContent = '.ccr-shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-top:8px}'
                + '.ccr-shot{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;text-align:left;padding:6px;border:1px solid var(--color-border-strong,#c7cbd1);border-radius:8px;background:var(--color-surface-1,#fff);color:var(--color-text-primary,#101216);cursor:pointer;font:inherit}'
                + '.ccr-shot.on{border:2px solid #1A6EF2;padding:5px}.ccr-shotimg{position:relative;display:block;background:#fff;border-radius:5px;overflow:hidden;aspect-ratio:8/5}.ccr-shotimg img{width:100%;height:100%;object-fit:contain;display:block}.ccr-shotimg img[data-pending]{visibility:hidden}'
                + '.ccr-shotwait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#101216}.ccr-shotlab{display:flex;gap:7px;align-items:flex-start;margin-top:6px;font-size:12.5px}.ccr-shotlab .ccr-oe{display:block;font-weight:400}'
                + '.ccr .ccr-shot,.ccr .ccr-shot:hover,.ccr .ccr-shot:focus,.ccr .ccr-shot:active{background:var(--color-surface-1,#fff)!important;background-image:none!important;color:var(--color-text-primary,#101216)!important;box-shadow:none!important;transform:none!important}.ccr .ccr-shot:focus-visible{outline:2px solid #1A6EF2;outline-offset:2px}'
                + '.ccr-shot .ccr-mk.sq{border-radius:3px}.ccr-shot.on .ccr-mk{background:#1A6EF2;border-color:#1A6EF2}.ccr-shotfig img{max-width:100%;height:auto;display:block;background:#fff}'
                + '.ccr{font-size:13.5px;color:var(--color-text-primary,#101216)}.ccr-lead{font-size:13px;max-width:980px;margin:4px 0 12px}'
                + '.ccr-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:18px;align-items:start}@media (max-width:1100px){.ccr-cols{grid-template-columns:minmax(0,1fr)}}.ccr-left,.ccr-right{min-width:0;max-width:100%}'
                + '.ccr-right{position:sticky;top:8px}.ccr-left .slap-grid{grid-template-columns:1fr}.ccr-left .slap-rail{max-height:260px}.ccr-left .slap-card{margin-top:0}'
                // the document: its own colors in both themes, so the app's dark rules cannot reach in
                + '.ccr .ccr-prev{--cp-bg:#ffffff;--cp-ink:#101216;--cp-line:#c7cbd1;--cp-hair:#e3e5e8;--cp-th:#EAF2F8;--cp-link:#0A4FB8;--cp-tbd:#9A3412;--cp-rule:#101216;--cp-flash:#FFF1A8}'
                + 'body.theme-dark .ccr .ccr-prev{--cp-bg:#15181E;--cp-ink:#E8EAED;--cp-line:#3A404A;--cp-hair:#2E333C;--cp-th:#1F2A3A;--cp-link:#8DBBFF;--cp-tbd:#F2925F;--cp-rule:#9AA1AD;--cp-flash:#5A4A12}'
                + '.ccr .ccr-prev{max-height:80vh;overflow:auto;border:1px solid var(--cp-hair);border-radius:10px;padding:16px 20px;background:var(--cp-bg);color:var(--cp-ink);font-size:12.5px;line-height:1.5;position:relative}'
                + '.ccr .ccr-prev h3,.ccr .ccr-prev h4,.ccr .ccr-prev p,.ccr .ccr-prev li,.ccr .ccr-prev b,.ccr .ccr-prev div,.ccr .ccr-prev label,.ccr .ccr-prev span{color:var(--cp-ink)}'
                + '.ccr .ccr-prev h3{font-size:15px;margin:16px 0 6px;background:none;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ccr .ccr-prev h3.l2{font-size:13.5px}.ccr .ccr-prev .ccr-part{font-size:13px;margin:16px 0 5px;padding-bottom:3px;border-bottom:1px solid var(--cp-hair)}.ccr .ccr-prev .ccr-part.l2{font-size:12.5px;margin:12px 0 4px;border-bottom:none}.ccr .ccr-prev p{margin:0 0 7px;max-width:78ch}.ccr .ccr-prev .ccr-tbd{color:var(--cp-tbd);font-style:italic}'
                + '.ccr-swatch{display:inline-block;width:11px;height:11px;border-radius:3px;margin:0 6px -1px 0;border:1px solid rgba(0,0,0,.25);vertical-align:baseline}'
                + '.ccr .ccr-prev .ccr-cap{font-weight:700;font-size:11.5px;margin:10px 0 4px}.ccr-cover{border-bottom:2px solid var(--cp-rule);padding-bottom:14px;margin-bottom:14px}.ccr-ct{font-size:22px;font-weight:700;margin-top:6px}.ccr-cs{font-size:14px;margin:2px 0 10px}'
                + '.ccr-front{border-bottom:2px solid var(--cp-rule);padding-bottom:12px;margin-bottom:12px}.ccr-tl{font-size:12px;margin:1px 0}.ccr-tl.l2{margin-left:16px}.ccr .ccr-prev a{color:var(--cp-link);text-decoration:none}'
                + '.ccr .ccr-prev .ccr-dt{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:10px}.ccr .ccr-prev .ccr-dt tr,.ccr .ccr-prev .ccr-dt td{background:var(--cp-bg);color:var(--cp-ink)}'
                + '.ccr .ccr-prev .ccr-dt thead th,.ccr .ccr-prev .ccr-dt th,.ccr .ccr-prev .ccr-dt td{border:1px solid var(--cp-line) !important;padding:4px 6px;text-align:left;vertical-align:top;font-family:inherit !important;text-transform:none !important;letter-spacing:normal !important;font-size:11.5px !important}'
                + '.ccr .ccr-prev .ccr-dt thead th,.ccr .ccr-prev .ccr-dt th{background:var(--cp-th) !important;color:var(--cp-ink) !important;font-weight:700}'
                + '.ccr-fig{margin:10px 0 2px;overflow-x:auto}.ccr-fig svg{max-width:100%;height:auto;border:1px solid var(--cp-hair,#e3e5e8);border-radius:8px}.ccr-fig .ccr-node:hover rect{stroke-width:2.4}'
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
        // the tab kept for this project (null = All); a tab whose section has gone falls back to All
        function storedTab() { if (!tabsOn()) return null; var s = store(), t = s.tab != null ? s.tab : ui0.tab; return t ? String(t) : null; }
        function tab() {
            var t = storedTab(); if (!t) return null;
            var ok = safe(function () { return (secsOf(ctxOf()) || []).some(function (s) { return s && s.id === t; }); }, false);
            return ok ? t : null;
        }
        function setTab(id, o) {
            if (!tabsOn()) return false;
            id = id ? String(id) : null;
            var s = store(); if (id) s.tab = id; else delete s.tab;   // rides the next save (like projectConfig.lastPlace)
            ui0.tab = id; ui0.node = null; ui0.editing = null; ui0.adding = false; ui0.err = null; ui0.msg = null;
            if (!o || o.render !== false) render();
            return true;
        }
        function tabsHtml(list, cur) {
            var one = function (id, inner, title, cls) { var on = (cur || '') === (id || ''); return '<button type="button" role="tab" id="ccr-tab-' + E(key) + '-' + E(String(id || 'all').replace(/[^A-Za-z0-9_-]/g, '_')) + '" class="ccr-tab' + (cls ? ' ' + cls : '') + (on ? ' on' : '') + '" aria-selected="' + on + '" tabindex="' + (on ? '0' : '-1') + '" data-cctab="' + E(id || '') + '" title="' + E(title) + '" onclick="SLCcaReport.act(' + J(key) + ',\'tab\',' + J(id || null) + ')">' + inner + '</button>'; };
            return '<div class="ccr-tabs" role="tablist" aria-label="' + E(spec.title) + '" data-cctabs="1">'
                + one(null, '<span class="ccr-tabn">' + E(tabSpec().allLabel || 'All') + '</span>', 'The whole ' + lcFirst(spec.title) + ' document', 'all')
                + list.map(function (t) { return one(t.id, (t.tid ? '<span class="ccr-tabid">' + E(t.tid) + '</span>' : '') + '<span class="ccr-tabn">' + E(t.name) + '</span>', t.title); }).join('') + '</div>';
        }
        function render() {
            var h = host(); if (!h) return false;
            if (U()) U().style(); style();
            var pv0 = h.querySelector('[data-ccdoc]'), scroll = pv0 ? pv0.scrollTop : 0;
            var dark = isDark(), html, list = [], cur = null;
            C = dark ? DARK : LIGHT;
            try {
                if (tabsOn()) {
                    var secs = secsOf(ctxOf({ dark: dark })); list = tabList(secs || []);
                    var t0 = storedTab(); cur = t0 && list.some(function (t) { return t.id === t0; }) ? t0 : null;
                    if (t0 && !cur) setTab(null, { render: false });
                    if (cur) { var d = docCtl(); html = '<div class="ccr-tabdoc" data-cc-tabdoc="' + E(cur) + '"><div class="ccr-tabhead" data-cc-tabhead="1">' + E(spec.title) + ' · ' + E(d.no) + ' Rev ' + E(rev()) + ' · ' + E(projName()) + '</div>' + bodyHtml(doc({ dark: dark, only: cur, secs: secs }), true) + '</div>'; }
                    else { var bl = doc({ dark: dark, secs: secs }); html = frontHtml(bl) + bodyHtml(bl, true); }
                } else html = fullHtml({ dark: dark });
            } finally { C = LIGHT; }
            if (ui0.shownTab !== undefined && ui0.shownTab !== cur) scroll = 0;   // another tab opens at its top
            ui0.shownTab = cur;
            var shotSec = cur || (typeof spec.shotsFocus === 'function' ? safe(spec.shotsFocus, null) : null);
            var left = leftHtml(cur) + (shotSec ? shotPickerHtml(String(shotSec)) : ''), noun = tabSpec().noun || 'section';
            var bar = cur
                ? '<button type="button" data-cc-wordsec="' + E(cur) + '" onclick="SLCcaReport.act(' + J(key) + ',\'wordsec\')">Export this ' + E(noun) + ' to Word</button>'
                : '<button type="button" data-cc-word="1" onclick="SLCcaReport.act(' + J(key) + ',\'word\')">Word (.docx)</button><button type="button" data-cc-print="1" onclick="SLCcaReport.act(' + J(key) + ',\'print\')">Print</button>';
            h.innerHTML = '<div class="ccr" data-ccr="' + E(key) + '"' + (tabsOn() ? ' data-cctab-open="' + E(cur || '') + '"' : '') + '>' + (spec.lead ? '<p class="ccr-lead">' + E(spec.lead) + '</p>' : '')
                + (tabsOn() ? tabsHtml(list, cur) : '')
                + (ui0.msg ? '<div class="ccr-msg' + (ui0.msg.err ? ' err' : '') + '">' + E(ui0.msg.text) + '</div>' : '')
                + '<div class="ccr-cols"' + (tabsOn() ? ' role="tabpanel" aria-labelledby="ccr-tab-' + E(key) + '-' + E(String(cur || 'all').replace(/[^A-Za-z0-9_-]/g, '_')) + '"' : '') + '><div class="ccr-left"' + (spec.leftId ? ' id="' + E(spec.leftId) + '"' : '') + ' data-ccleft="1">' + left + (cur ? '' : acceptBox() + docPanel()) + '</div>'
                + '<div class="ccr-right"><div class="ccr-bar">' + (spec.edit ? '<button type="button" class="p" data-cc-add="1" onclick="SLCcaReport.act(' + J(key) + ',\'add\')">' + E(spec.edit.addLabel || 'Add') + '</button>' : '') + '<span style="flex:1"></span>'
                + bar + '</div>'
                + nodePanel() + '<div class="ccr-prev" data-ccdoc="1">' + (ui0.adding ? editForm(null) : '') + html + '</div></div></div></div>';
            var pv = h.querySelector('[data-ccdoc]'); if (pv) { pv.scrollTop = scroll; wire(pv); }
            var tb = h.querySelector('[data-cctabs]'); if (tb) wireTabs(tb);
            if (ui0.flash) { var k = ui0.flash; ui0.flash = null; flash(k, { stay: true }); }
            return true;
        }
        // the tab row: the open tab is scrolled into its row (a phone's row scrolls on its own); arrow keys move along
        function wireTabs(tb) {
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
                var sid = target.slice(4);
                if (storedTab() !== sid && safe(function () { return (secsOf(ctxOf()) || []).some(function (s) { return s && s.id === sid; }); }, false)) {
                    if (!document.getElementById('ccr-host-' + key)) return false;
                    setTab(sid, { render: false }); ui0.flash = target; render();
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
        function answered(qid) { ui0.flash = qid || null; ui0.msg = null; render(); }
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
            try {
                if (verb === 'pick') { if (typeof spec.answer === 'function') spec.answer(a, b); ui0.flash = a; ui0.msg = null; }
                else if (verb === 'see') { if (!flash(a)) { render(); flash(a); } return; }
                else if (verb === 'node') { ui0.node = a || null; }
                else if (verb === 'tab') { setTab(a || null); return; }
                else if (verb === 'wordsec') { var only = tab(); word(only ? { only: only } : undefined).catch(function (e) { ui0.msg = { text: 'Could not write the Word file: ' + (e && e.message || e), err: true }; render(); }); return; }
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
                        if (tabsOn() && nid && (wasAdd || (a && storedTab() === a && nid !== a))) setTab(nid, { render: false });
                        ui0.flash = 'sec:' + nid;
                    }
                }
                else if (verb === 'word') { word().catch(function (e) { ui0.msg = { text: 'Could not write the Word file: ' + (e && e.message || e), err: true }; render(); }); return; }
                else if (verb === 'print') { shotsReady(null).then(print, print); return; }
                else if (verb === 'shot') { shotToggle(a, b); ui0.flash = null; ui0.msg = null; }
                else if (verb === 'shotnone') { shotNone(a); }
            } catch (e) { ui0.msg = { text: (e && e.message) || String(e), err: true }; }
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
        Object.assign(R, { shotViews: shotViews, shotPicks: shotPicks, shotToggle: shotToggle, shotsReady: shotsReady, shotBlocks: shotBlocks, tab: tab, setTab: setTab, tabs: function () { return tabsOn() ? tabList(secsOf(ctxOf()) || []).map(function (t) { return { id: t.id, label: t.label }; }) : []; }, render: render, doc: doc, fullHtml: fullHtml, model: model, word: word, print: print, flash: flash, answered: answered, acceptance: acceptance, accept: accept, unaccept: unaccept,
            docCtl: docCtl, setDoc: setDoc, issue: issue, rev: rev, act: act, mount: mount, outputs: outputs, ROLES: ROLES });
        return R;
    }
    function act(key, verb, a, b) { var R = REG[key]; if (R) R.act(verb, a, b); }
    root.SLCcaReport = { VERSION: VERSION, define: define, get: get, act: act, palette: palette, nodeG: nodeG, E: E, ROLES: ROLES, LIGHT: LIGHT, DARK: DARK, wrapText: wrapText, svgWrap: function (w, h, body, title) { return svgWrap(w, h, body, title); }, box: boxSvg };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SLCcaReport;
})(typeof window !== 'undefined' ? window : globalThis);
