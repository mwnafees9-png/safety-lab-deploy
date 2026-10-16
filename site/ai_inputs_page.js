// ============================================================================
// ai_inputs_page.js, v1.0, 16 Oct 2026: the AI Assistant page. window.SLAiInputsPage.
//
// WAQAS (16 Oct 2026, confirmed): "The AI Assistant must be a page of its own, not just a menu or a
// modal." The page is where the AI inputs are put in and managed (before this, the AI Inputs modal),
// and where every AI analysis and the chat are reached (before this, the floating menu). Every
// analysis page keeps its own AI buttons, and all of them read the same inputs. People who have
// Safety Lab, Sys Lab and Cert Lab share the inputs as one file in one format
// (ai_inputs_exchange.js, "safetylab-ai-inputs" v1) until the three tools are on one platform.
//
// What the page shows, top to bottom (view-ai in index.html; the AI settings stay below it):
//   AI inputs        upload (every format the modal read), paste text, the list (name, type, size in
//                    characters, pages, revision, controlled, who added it and when) with search and
//                    pages of 15, remove, export (all or the ticked ones) and import of the shared file,
//                    Ask your documents, Check consistency across documents, Import documents into
//                    the model.
//   AI analyses      every action the floating menu offers, grouped the same way, each with whether
//                    its inputs are ready and what it needs (the readiness guide the modal showed),
//                    plus the ANEM live chat.
//   Pages that use   the analysis pages with their own AI buttons (lane_ai_bar.js registry, so the
//   these inputs     list cannot drift from the buttons), plus the CAD page's zonal AI review.
//
// Every write (add, remove, controlled, import) goes through SLChangeAck.batch: one
// acknowledgement per action, Cancel puts it back. Reading and the shared file are deterministic;
// only the three AI actions and the analyses call a model.
//
// Entry points: the sidebar "AI Assistant" item and the nav button (ai_assistant.js
// _hookAiEntryPoint), switchTab('ai'), openAiInputs() (redirects here, section "inputs"),
// SLAiInputsPage.open(section). See tests/regression_ai_inputs_page_ui_20261016.test.js.
// ============================================================================
(function () {
    'use strict';
    var W = window;
    var VERSION = '1.0';
    var PER_PAGE = 15;
    var ACCEPT = '.docx,.pdf,.reqif,.reqifz,.txt,.md,.csv,.json,.xml,.xmi,.text';
    var EXTRACTED = /\.(docx|pdf|reqif|reqifz)$/i;
    var st = { q: '', page: 0, sel: {}, includeImages: true, busy: false };
    var _lower = (typeof WeakMap === 'function') ? new WeakMap() : null;

    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _toast(m, k, ms) { try { if (typeof W.showToast === 'function') W.showToast(m, k || 'info', ms); } catch (_) {} }
    function _X() { return W.SLAiInputsExchange || null; }
    function _api() { return W.SafetyLabSourceDocs || null; }
    function _docs() { try { var a = _api(); return (a && typeof a.list === 'function') ? (a.list() || []).filter(Boolean) : []; } catch (_) { return []; } }
    function _projName() { try { return (typeof projectName !== 'undefined' && projectName) ? String(projectName) : ''; } catch (_) { return ''; } }
    function _projId() { try { return (typeof W.getActiveCloudProjectId === 'function') ? (W.getActiveCloudProjectId() || null) : null; } catch (_) { return null; } }
    function _visible() { var v = document.getElementById('view-ai'); return !!(v && v.style.display !== 'none'); }
    function _fmtDate(t) {
        if (t == null || t === '') return '';
        var d = new Date(typeof t === 'number' ? t : Date.parse(t)); if (isNaN(d.getTime())) return '';
        try { return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return d.toISOString().slice(0, 16).replace('T', ' '); }
    }
    function _kind(d) { var X = _X(); return X ? X.kindOf(d.name) : 'text'; }
    function _rev(d) { var X = _X(); return X ? X.revisionOf(d) : null; }
    function _pages(d) { var X = _X(); return X ? X.pageCount(d.text) : 0; }
    function _low(d) {
        if (!_lower) return String(d.text || '').toLowerCase();
        var c = _lower.get(d); if (c == null) { c = String(d.text || '').toLowerCase(); _lower.set(d, c); }
        return c;
    }

    // ---- one write = one acknowledgement ------------------------------------------------------
    function _write(label, fn) {
        var A = W.SLChangeAck, done = function (r) { try { renderInputs(); } catch (_) {} return r; };
        if (A && typeof A.batch === 'function') return A.batch(label, fn, { source: 'user' }).then(done, function (e) { done(); throw e; });
        try { return Promise.resolve(done({ acknowledged: true, result: fn() })); } catch (e) { done(); return Promise.reject(e); }
    }

    // ---- styles (house tokens only, near-black text) ---------------------------------------------
    function _style() {
        if (document.getElementById('aip-style')) return;
        var s = document.createElement('style'); s.id = 'aip-style';
        s.textContent = [
            '#view-ai .aip-section-title{font-size:15px;font-weight:700;margin:26px 0 8px;color:var(--color-text-primary)}',
            '#ai-page-host{color:var(--color-text-primary)}',
            '#ai-page-host label,.aip-imp-card label{text-transform:none;letter-spacing:normal;font-weight:500;color:var(--color-text-primary);display:inline;margin:0}',
            '#ai-page-host label.aip-drop{display:block;font-weight:600;font-size:13px}',
            '#ai-page-host .aip-drop .aip-small{font-weight:400}',
            '.aip-nav{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 6px}',
            '.aip-nav a{font-size:12.5px;font-weight:600;border:1px solid var(--color-border-hair);border-radius:999px;padding:4px 12px;cursor:pointer;color:var(--color-text-primary);text-decoration:none;background:var(--color-surface)}',
            '.aip-lead{font-size:13px;line-height:1.5;margin:0 0 12px;max-width:900px}',
            '.aip-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
            '@media (max-width:900px){.aip-grid2{grid-template-columns:1fr}}',
            '.aip-card{border:1px solid var(--color-border-hair);border-radius:var(--r-md,9px);padding:12px 14px;background:var(--color-surface)}',
            '.aip-card h5{margin:0 0 8px;font-size:13px;font-weight:650}',
            '.aip-drop{display:block;border:1.5px dashed var(--color-border-hair);border-radius:10px;padding:18px;text-align:center;cursor:pointer;font-size:13px}',
            '.aip-drop.over{border-color:var(--color-accent)}',
            '.aip-small{font-size:12px;line-height:1.45}',
            '.aip-status{font-size:12.5px;margin-top:6px;min-height:16px}',
            '.aip-in{width:100%;box-sizing:border-box;font:inherit;font-size:13px;padding:7px 9px;border:1px solid var(--color-border-hair);border-radius:8px;background:var(--color-surface);color:var(--color-text-primary)}',
            '.aip-btn{font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:8px;border:1px solid var(--color-text-primary);background:transparent;color:var(--color-text-primary);cursor:pointer;white-space:nowrap}',
            '.aip-btn:hover:not(:disabled){background:var(--color-text-primary);color:var(--color-surface)}',
            '.aip-btn.primary{background:var(--color-accent);border-color:var(--color-accent);color:#fff}',
            '.aip-btn:disabled{opacity:.45;cursor:default}',
            '.aip-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 8px}',
            '.aip-bar .aip-in{max-width:340px}',
            '.aip-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
            '.aip-tbl th{text-align:left;font-weight:650;padding:7px 8px;border-bottom:1.5px solid var(--color-text-primary);white-space:nowrap}',
            '.aip-tbl td{padding:7px 8px;border-bottom:1px solid var(--color-border-hair);vertical-align:middle}',
            '.aip-tbl td.num{text-align:right;font-variant-numeric:tabular-nums}',
            '.aip-name{font-weight:600;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.aip-ctl{display:inline-block;font-size:11px;font-weight:700;color:#b91c1c;border:1px solid #b91c1c;border-radius:4px;padding:0 5px;margin-left:6px}',
            '.aip-pager{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12.5px}',
            '.aip-empty{padding:18px 6px;font-size:13px}',
            '.aip-answer{font-size:13px;line-height:1.5;margin-top:8px;white-space:pre-wrap}',
            '.aip-group{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:16px 0 8px}',
            '.aip-acts{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}',
            '.aip-act{border:1px solid var(--color-border-hair);border-radius:var(--r-md,9px);padding:10px 12px;display:flex;flex-direction:column;gap:5px;background:var(--color-surface)}',
            '.aip-act-h{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}',
            '.aip-act-t{font-weight:650;font-size:13px}',
            '.aip-chip{font-size:11px;font-weight:700;border-radius:12px;padding:2px 8px;max-width:55%;text-align:right;line-height:1.35;flex-shrink:0}',
            '.aip-chip.ok{white-space:nowrap}',
            '.aip-chip.ok{color:#0b5d2c;background:#e2f3e8}',
            '.aip-chip.no{color:#6b3f00;background:#fdf0d9}',
            '.aip-uses{margin:0;padding-left:18px;font-size:13px;line-height:1.7}',
            '.aip-uses a{cursor:pointer;color:var(--color-text-primary);text-decoration:underline}',
            '.aip-imp-card{max-width:760px;width:94%;max-height:86vh;display:flex;flex-direction:column}',
            '.aip-imp-body{overflow:auto;margin-top:6px;flex:1 1 auto;min-height:0;font-size:13px}',
            '.aip-imp-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px}',
            '.aip-imp-row{border-bottom:1px solid var(--color-border-hair);padding:7px 0}',
            '.aip-imp-row label{margin-right:14px;font-size:12.5px;white-space:nowrap}',
            'body.theme-dark .aip-chip.ok{color:#b9f0cb;background:#183b26}',
            'body.theme-dark .aip-chip.no{color:#ffe0ad;background:#43300f}',
            'body.theme-dark .aip-ctl{color:#ff8a8a;border-color:#ff8a8a}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(s);
    }

    // ---- the shell -------------------------------------------------------------------------------
    function render() {
        var host = document.getElementById('ai-page-host'); if (!host) return;
        _style();
        if (!host.getAttribute('data-built')) {
            host.setAttribute('data-built', '1');
            host.innerHTML = ''
                + '<nav class="aip-nav" aria-label="On this page"><a data-go="inputs">AI inputs</a><a data-go="assistant">AI analyses and chat</a><a data-go="uses">Pages that use these inputs</a><a data-go="settings">AI settings</a></nav>'
                + '<h4 id="aip-inputs" class="aip-section-title">AI inputs</h4>'
                + '<p class="aip-lead">Add your documents once: system descriptions, specifications, ICDs, requirements, test reports. Every AI analysis in this project reads them, on this page and on every analysis page, and the AI works only from what is here and in the model.</p>'
                + '<div class="aip-grid2">'
                +   '<div class="aip-card"><h5>Add files</h5>'
                +     '<label class="aip-drop" for="aip-file" id="aip-drop">Choose files or drop them here<div class="aip-small" style="margin-top:4px">Word (.docx), PDF, ReqIF from Jama, DOORS or Polarion (.reqif, .reqifz), SysML (.xml, .xmi), text (.txt, .md, .csv, .json)</div></label>'
                +     '<input id="aip-file" type="file" multiple accept="' + ACCEPT + '" style="display:none">'
                +     '<div id="aip-file-status" class="aip-status" role="status"></div></div>'
                +   '<div class="aip-card"><h5>Paste text</h5>'
                +     '<input id="aip-text-name" class="aip-in" type="text" placeholder="Name, for example Propulsion SDD" style="margin-bottom:6px">'
                +     '<textarea id="aip-text" class="aip-in" rows="3" placeholder="Paste a system description, architecture notes, requirements" style="resize:vertical"></textarea>'
                +     '<button type="button" id="aip-text-add" class="aip-btn" style="margin-top:6px">Add text as a source</button></div>'
                + '</div>'
                + '<div class="aip-bar">'
                +   '<input id="aip-q" class="aip-in" type="search" placeholder="Search names, types, revisions and the text" aria-label="Search the AI inputs">'
                +   '<span style="flex:1"></span>'
                +   '<label class="aip-small" title="Diagrams pulled out of Word and PDF files. A file with diagrams can be several MB."><input type="checkbox" id="aip-imgs" checked style="margin:0 4px 0 0;vertical-align:-1px">Include diagrams</label>'
                +   '<button type="button" id="aip-export" class="aip-btn">Export</button>'
                +   '<button type="button" id="aip-import" class="aip-btn">Import a file</button>'
                +   '<input id="aip-import-file" type="file" accept=".json,.slai.json" style="display:none">'
                + '</div>'
                + '<div class="aip-small" style="margin:-2px 0 6px">Export and import use one file format, the same in Safety Lab, Sys Lab and Cert Lab, so the three tools can share these inputs.</div>'
                + '<div id="aip-list"></div>'
                + '<div class="aip-grid2" style="margin-top:16px">'
                +   '<div class="aip-card"><h5>Ask your documents</h5><div class="aip-small" style="margin-bottom:6px">Answers come only from the documents above, with the document and page for each point. If the answer is not there, it says so.</div>'
                +     '<div style="display:flex;gap:8px"><input id="aip-ask" class="aip-in" type="text" placeholder="For example: what DAL is allocated to the flight control computer?"><button type="button" id="aip-ask-btn" class="aip-btn primary">Ask</button></div>'
                +     '<div id="aip-ask-answer" class="aip-answer" aria-live="polite"></div></div>'
                +   '<div class="aip-card"><h5>Across the documents</h5>'
                +     '<div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" id="aip-consistency-btn" class="aip-btn">Check consistency across documents</button>'
                +     '<button type="button" id="aip-model-btn" class="aip-btn">Import documents into the model</button></div>'
                +     '<div class="aip-small" style="margin-top:6px">The consistency check lists contradictions between documents, each with its quotes. Importing into the model copies the failure conditions, functions, requirements and FMEA rows the documents already contain into review panels for you to accept.</div>'
                +     '<div id="aip-consistency-answer" class="aip-answer" aria-live="polite"></div></div>'
                + '</div>'
                + '<h4 id="aip-assistant" class="aip-section-title">AI analyses and chat</h4>'
                + '<div id="aip-assist"></div>'
                + '<h4 id="aip-uses" class="aip-section-title">Pages that use these inputs</h4>'
                + '<div id="aip-uses-list"></div>';
            _wire(host);
        }
        renderInputs();
        renderAssistant();
        renderUses();
    }

    function _wire(host) {
        host.addEventListener('click', function (e) {
            var go = e.target && e.target.getAttribute && e.target.getAttribute('data-go');
            if (go) { e.preventDefault(); _scrollTo(go); }
        });
        var fileIn = document.getElementById('aip-file');
        fileIn.onchange = function (e) { var fl = e.target.files; handleFiles(fl).then(function () { try { e.target.value = ''; } catch (_) {} }); };
        var drop = document.getElementById('aip-drop');
        ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
        drop.addEventListener('dragleave', function (e) { e.preventDefault(); drop.classList.remove('over'); });
        drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files); });
        document.getElementById('aip-text-add').onclick = addPasted;
        var q = document.getElementById('aip-q');
        q.addEventListener('input', function () { st.q = q.value; st.page = 0; renderInputs(); });
        document.getElementById('aip-imgs').onchange = function (e) { st.includeImages = !!e.target.checked; };
        document.getElementById('aip-export').onclick = function () { exportFile(); };
        var impIn = document.getElementById('aip-import-file');
        document.getElementById('aip-import').onclick = function () { impIn.click(); };
        impIn.onchange = function (e) { var f = e.target.files && e.target.files[0]; try { e.target.value = ''; } catch (_) {} if (f) f.text().then(function (t) { return importText(t, f.name); }).catch(function (err) { _toast('Could not read ' + f.name + ': ' + ((err && err.message) || err), 'warning'); }); };
        var askBtn = document.getElementById('aip-ask-btn'), askIn = document.getElementById('aip-ask');
        askBtn.onclick = function () { runAsk(); };
        askIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runAsk(); } });
        document.getElementById('aip-consistency-btn').onclick = runConsistency;
        document.getElementById('aip-model-btn').onclick = runImportToModel;
        document.getElementById('aip-list').addEventListener('click', _listClick);
        document.getElementById('aip-list').addEventListener('change', _listChange);
    }

    function _scrollTo(section) {
        var el = document.getElementById('aip-' + (section || 'inputs'));
        if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'start' }); } catch (_) { el.scrollIntoView(); } }
    }

    // ---- the list --------------------------------------------------------------------------------
    function _filtered() {
        var docs = _docs(), q = String(st.q || '').trim().toLowerCase();
        if (!q) return docs;
        return docs.filter(function (d) {
            var meta = [d.name, _kind(d), _rev(d) || '', d.addedBy || ''].join(' ').toLowerCase();
            return meta.indexOf(q) >= 0 || _low(d).indexOf(q) >= 0;
        });
    }
    function renderInputs() {
        var host = document.getElementById('aip-list'); if (!host) return;
        var all = _docs(), list = _filtered();
        // a ticked document that is no longer there is no longer ticked
        var ids = {}; all.forEach(function (d) { ids[String(d.id)] = 1; });
        Object.keys(st.sel).forEach(function (k) { if (!ids[k]) delete st.sel[k]; });
        var nSel = Object.keys(st.sel).length;
        var exp = document.getElementById('aip-export');
        if (exp) { exp.textContent = nSel ? ('Export the ' + nSel + ' ticked') : ('Export all (' + all.length + ')'); exp.disabled = !all.length; }
        var nav = document.querySelector('.aip-nav a[data-go="inputs"]'); if (nav) nav.textContent = 'AI inputs (' + all.length + ')';
        if (!all.length) { host.innerHTML = '<div class="aip-empty">No documents yet. Add a file or paste text above, or import an AI inputs file from Safety Lab, Sys Lab or Cert Lab.</div>'; return; }
        if (!list.length) { host.innerHTML = '<div class="aip-empty">No document matches "' + _esc(st.q) + '".</div>'; return; }
        var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
        if (st.page >= pages) st.page = pages - 1;
        var from = st.page * PER_PAGE, shown = list.slice(from, from + PER_PAGE);
        var allTicked = shown.every(function (d) { return st.sel[String(d.id)]; });
        var h = '<table class="aip-tbl" id="aip-table"><thead><tr>'
            + '<th><input type="checkbox" data-all="1" aria-label="Tick every document shown"' + (allTicked ? ' checked' : '') + '></th>'
            + '<th>Name</th><th>Type</th><th style="text-align:right">Characters</th><th style="text-align:right">Pages</th><th>Revision</th><th>Controlled</th><th>Added by</th><th>Added</th><th></th></tr></thead><tbody>';
        shown.forEach(function (d) {
            var id = _esc(String(d.id)), chars = String(d.text || '').length, pg = _pages(d), rv = _rev(d);
            var t = (Array.isArray(d.tables) ? d.tables.length : 0), m = (Array.isArray(d.images) ? d.images.length : 0);
            var extra = [t ? (t + ' table' + (t === 1 ? '' : 's')) : '', m ? (m + ' diagram' + (m === 1 ? '' : 's')) : ''].filter(Boolean).join(', ');
            h += '<tr data-id="' + id + '">'
                + '<td><input type="checkbox" data-sel="' + id + '" aria-label="Tick ' + _esc(d.name) + '"' + (st.sel[String(d.id)] ? ' checked' : '') + '></td>'
                + '<td><div class="aip-name" title="' + _esc(d.name) + '">' + _esc(d.name || 'document') + (d.controlled ? '<span class="aip-ctl">Controlled</span>' : '') + '</div>' + (extra ? '<div class="aip-small">' + _esc(extra) + '</div>' : '') + '</td>'
                + '<td>' + _esc(_kind(d)) + '</td>'
                + '<td class="num">' + chars.toLocaleString() + '</td>'
                + '<td class="num">' + (pg ? pg : '') + '</td>'
                + '<td>' + _esc(rv || '') + '</td>'
                + '<td><label class="aip-small" title="ITAR or proprietary: the AI then only runs on your own Claude (GovCloud), Azure Government or on-prem backend"><input type="checkbox" data-ctrl="' + id + '"' + (d.controlled ? ' checked' : '') + ' style="margin:0 4px 0 0;vertical-align:-1px">Controlled</label></td>'
                + '<td>' + _esc(d.addedBy || 'Not recorded') + '</td>'
                + '<td style="white-space:nowrap">' + _esc(_fmtDate(d.addedAt)) + '</td>'
                + '<td><button type="button" class="aip-btn" data-rm="' + id + '">Remove</button></td>'
                + '</tr>';
        });
        h += '</tbody></table>';
        if (pages > 1 || list.length !== all.length) {
            h += '<div class="aip-pager"><span>Showing ' + (from + 1) + ' to ' + (from + shown.length) + ' of ' + list.length + (list.length !== all.length ? (' found, ' + all.length + ' in all') : '') + '</span>';
            if (pages > 1) h += '<button type="button" class="aip-btn" data-pg="-1"' + (st.page === 0 ? ' disabled' : '') + '>Previous</button><span>Page ' + (st.page + 1) + ' of ' + pages + '</span><button type="button" class="aip-btn" data-pg="1"' + (st.page >= pages - 1 ? ' disabled' : '') + '>Next</button>';
            h += '</div>';
        }
        host.innerHTML = h;
    }
    function _byId(id) { return _docs().find(function (d) { return String(d.id) === String(id); }) || null; }
    function _listClick(e) {
        var t = e.target; if (!t || !t.getAttribute) return;
        var pg = t.getAttribute('data-pg');
        if (pg) { st.page = Math.max(0, st.page + parseInt(pg, 10)); renderInputs(); return; }
        var rm = t.getAttribute('data-rm');
        if (rm) {
            var d = _byId(rm); if (!d) return;
            _write('Remove "' + (d.name || 'document') + '" from the AI inputs', function () { var a = _api(); return a && a.remove ? a.remove(rm) : false; })
                .then(function (r) { if (r && r.acknowledged) _toast('Removed "' + d.name + '" from the AI inputs.', 'success'); }).catch(function (err) { _toast((err && err.message) || String(err), 'warning'); });
        }
    }
    function _listChange(e) {
        var t = e.target; if (!t || !t.getAttribute) return;
        if (t.getAttribute('data-all')) {
            var shown = _filtered().slice(st.page * PER_PAGE, st.page * PER_PAGE + PER_PAGE);
            shown.forEach(function (d) { if (t.checked) st.sel[String(d.id)] = 1; else delete st.sel[String(d.id)]; });
            renderInputs(); return;
        }
        var sel = t.getAttribute('data-sel');
        if (sel) { if (t.checked) st.sel[sel] = 1; else delete st.sel[sel]; renderInputs(); return; }
        var ctl = t.getAttribute('data-ctrl');
        if (ctl) {
            var d = _byId(ctl); if (!d) return;
            var on = !!t.checked;
            _write((on ? 'Mark "' : 'Unmark "') + (d.name || 'document') + '" as controlled', function () { var a = _api(); return a && a.setControlled ? a.setControlled(ctl, on) : null; })
                .then(function (r) { if (r && r.acknowledged) _toast(on ? ('"' + d.name + '" is marked controlled: the AI now runs only on your own Claude (GovCloud), Azure Government or on-prem backend.') : 'Controlled mark removed.', on ? 'warning' : 'info', 5000); });
        }
    }

    // ---- adding ----------------------------------------------------------------------------------
    function _extractor() {
        if (typeof W.SafetyLabExtractDoc === 'function') return Promise.resolve(W.SafetyLabExtractDoc);
        if (typeof W.slLoadAI !== 'function') return Promise.resolve(null);
        return W.slLoadAI().then(function () { return typeof W.SafetyLabExtractDoc === 'function' ? W.SafetyLabExtractDoc : null; }, function () { return null; });
    }
    function _captioned(images) {
        return (Array.isArray(images) ? images : []).map(function (im, i) { return { type: (im && im.type) || '', data: (im && im.data) || '', caption: (im && im.caption) || ('Figure ' + (i + 1)) }; });
    }
    // Read every file first, then write them all as ONE change (one acknowledgement for the set).
    function handleFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        if (!files.length) return Promise.resolve();
        var status = document.getElementById('aip-file-status');
        var say = function (m) { if (status) status.textContent = m; };
        var read = [], failed = [];
        return files.reduce(function (p, f, i) {
            return p.then(function () {
                say('Reading ' + f.name + ' (' + (i + 1) + ' of ' + files.length + ')');
                if (EXTRACTED.test(f.name || '')) {
                    return _extractor().then(function (ex) {
                        if (!ex) throw new Error('reading Word, PDF and ReqIF files needs the AI module, which is not available in this browser');
                        return ex(f);
                    }).then(function (r) { read.push({ name: f.name, text: (r && r.text) || '', tables: (r && r.tables) || [], images: _captioned(r && r.images) }); });
                }
                return f.text().then(function (t) { read.push({ name: f.name, text: String(t || ''), tables: [], images: [] }); });
            }).catch(function (e) { failed.push(f.name + ': ' + ((e && e.message) || e)); });
        }, Promise.resolve()).then(function () {
            if (!read.length) { say(failed.length ? ('Could not read ' + failed.join('; ')) : ''); return; }
            var label = read.length === 1 ? ('Add "' + read[0].name + '" to the AI inputs') : ('Add ' + read.length + ' documents to the AI inputs');
            return _write(label, function () { var a = _api(); read.forEach(function (r) { if (a && a.add) a.add(r); }); return read.length; }).then(function (r) {
                var ok = r && r.acknowledged;
                say((ok ? (read.length + ' document' + (read.length === 1 ? '' : 's') + ' added.') : 'Not added: the change was canceled.') + (failed.length ? (' Could not read ' + failed.join('; ')) : ''));
            });
        });
    }
    function addPasted() {
        var tt = document.getElementById('aip-text'), tn = document.getElementById('aip-text-name');
        var txt = tt ? tt.value : '';
        if (!txt.trim()) { _toast('Paste some text first.', 'warning'); return Promise.resolve(); }
        var nm = (tn && tn.value.trim()) || ('Pasted text, ' + _fmtDate(Date.now()));
        return _write('Add "' + nm + '" to the AI inputs', function () { var a = _api(); return a && a.add ? a.add({ name: nm, text: txt }) : null; }).then(function (r) {
            if (r && r.acknowledged) { if (tn) tn.value = ''; if (tt) tt.value = ''; _toast('Added "' + nm + '" to the AI inputs.', 'success'); }
        });
    }

    // ---- the shared file -------------------------------------------------------------------------
    function buildExport(ids) {
        var X = _X(); if (!X) throw new Error('The AI inputs file module is not loaded.');
        return X.build(_docs(), { tool: 'safety-lab', projectName: _projName(), projectId: _projId(), includeImages: st.includeImages, ids: ids && ids.length ? ids : null });
    }
    function exportFile() {
        var X = _X(); if (!X) { _toast('The AI inputs file module is not loaded.', 'warning'); return null; }
        var ids = Object.keys(st.sel), file = buildExport(ids);
        if (!file.docs.length) { _toast('There are no documents to export.', 'info'); return null; }
        var name = X.fileName(_projName());
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([X.serialize(file)], { type: 'application/json' })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (_) {} }, 1000);
        _toast('Exported ' + file.docs.length + ' document' + (file.docs.length === 1 ? '' : 's') + ' to ' + name + '.', 'success', 4000);
        return file;
    }
    function _who(x) { return [x.addedBy ? ('added by ' + x.addedBy) : '', x.addedAt ? _fmtDate(x.addedAt) : ''].filter(Boolean).join(', '); }
    function _describe(x) {
        var X = _X(), rv = X ? X.revisionOf(x) : null;
        return [rv ? ('revision ' + rv) : 'no revision found', String(x.text || '').length.toLocaleString() + ' characters', _who(x)].filter(Boolean).join(', ');
    }
    // The preview: what is new, what is already here, and what is a different version of a document
    // already here (the person picks for each). Resolves the choices, or null when canceled.
    function _previewDialog(pv, file, fileLabel) {
        return new Promise(function (resolve) {
            var ov = document.createElement('div');
            ov.className = 'modal-overlay aip-imp-overlay'; ov.id = 'aip-import-dialog';
            var src = file.source || {}, tool = { 'safety-lab': 'Safety Lab', 'sys-lab': 'Sys Lab', 'cert-lab': 'Cert Lab' }[src.tool] || 'another tool';
            var by = { 'new': [], identical: [], conflict: [] };
            pv.entries.forEach(function (e) { by[e.status].push(e); });
            var h = '<div class="sl-dialog-card aip-imp-card" role="dialog" aria-modal="true" aria-labelledby="aip-imp-title">'
                + '<h3 class="sl-dialog-title" id="aip-imp-title">Import AI inputs</h3>'
                + '<div class="sl-dialog-msg">' + _esc(fileLabel) + ': ' + pv.entries.length + ' document' + (pv.entries.length === 1 ? '' : 's') + ' from ' + _esc(tool) + (src.projectName ? (', project "' + _esc(src.projectName) + '"') : '') + (file.exportedAt ? (', exported ' + _esc(_fmtDate(file.exportedAt))) : '') + '. The file checked out: nothing in it was changed after it was exported.</div>'
                + '<div class="aip-imp-body">';
            if (by.conflict.length) {
                h += '<div class="aip-imp-h">A different version of a document already here (' + by.conflict.length + ')</div>';
                by.conflict.forEach(function (e) {
                    var x = e.incoming, m = e.match, nm = 'aip-ch-' + e.index;
                    h += '<div class="aip-imp-row" data-idx="' + e.index + '"><div><b>' + _esc(x.name) + '</b> in the file: ' + _esc(_describe(x)) + '</div>'
                        + '<div>Here: <b>' + _esc(m.name) + '</b>' + (m.by === 'id' ? ' (same document id)' : ' (same name)') + ', ' + (m.revision ? ('revision ' + _esc(m.revision)) : 'no revision found') + ', ' + Number(m.chars || 0).toLocaleString() + ' characters</div>'
                        + '<div style="margin-top:4px"><label><input type="radio" name="' + nm + '" value="keep"> Keep mine</label><label><input type="radio" name="' + nm + '" value="replace"> Replace with the one in the file</label><label><input type="radio" name="' + nm + '" value="both" checked> Keep both</label></div></div>';
                });
            }
            if (by['new'].length) {
                h += '<div class="aip-imp-h">New (' + by['new'].length + '): added</div>';
                by['new'].forEach(function (e) { h += '<div class="aip-imp-row"><b>' + _esc(e.incoming.name) + '</b>: ' + _esc(_describe(e.incoming)) + (e.incoming.controlled ? '<span class="aip-ctl">Controlled</span>' : '') + '</div>'; });
            }
            if (by.identical.length) {
                h += '<div class="aip-imp-h">Already here, identical (' + by.identical.length + '): nothing to do</div>';
                by.identical.forEach(function (e) { h += '<div class="aip-imp-row"><b>' + _esc(e.incoming.name) + '</b>' + (e.match && e.match.name !== e.incoming.name ? (' (here as "' + _esc(e.match.name) + '")') : '') + '</div>'; });
            }
            h += '</div><div class="sl-dialog-actions"><button type="button" class="sl-dialog-cancel" id="aip-imp-cancel">Cancel</button><button type="button" class="sl-dialog-ok" id="aip-imp-ok"' + ((by['new'].length + by.conflict.length) ? '' : ' disabled') + '>Import</button></div></div>';
            ov.innerHTML = h;
            document.body.appendChild(ov);
            ov.style.display = 'flex';
            requestAnimationFrame(function () { ov.classList.add('show'); });
            var done = false;
            function finish(v) { if (done) return; done = true; document.removeEventListener('keydown', onKey, true); ov.classList.remove('show'); setTimeout(function () { try { ov.remove(); } catch (_) {} }, 180); resolve(v); }
            function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(null); } }
            document.addEventListener('keydown', onKey, true);
            ov.querySelector('#aip-imp-cancel').onclick = function () { finish(null); };
            ov.querySelector('#aip-imp-ok').onclick = function () {
                var ch = {};
                by.conflict.forEach(function (e) { var r = ov.querySelector('input[name="aip-ch-' + e.index + '"]:checked'); ch[e.index] = r ? r.value : 'both'; });
                finish(ch);
            };
        });
    }
    // importText(text, label, opts): opts.choices skips the preview dialog (the same plan, for tests and scripts).
    function importText(text, label, opts) {
        opts = opts || {};
        var X = _X(); if (!X) { _toast('The AI inputs file module is not loaded.', 'warning'); return Promise.resolve({ ok: false }); }
        var v = X.verify(text);
        if (!v.ok) {
            try { if (typeof W.slAlert === 'function') W.slAlert(v.message, { title: 'Nothing was imported' }); else _toast(v.message, 'error', 7000); } catch (_) { _toast(v.message, 'error', 7000); }
            return Promise.resolve({ ok: false, code: v.code, message: v.message });
        }
        var pv = X.preview(_docs(), v.file);
        var ask = opts.choices ? Promise.resolve(opts.choices) : _previewDialog(pv, v.file, label || 'The file');
        return ask.then(function (choices) {
            if (!choices) return { ok: false, canceled: true, preview: pv };
            var plan = X.apply(_docs(), pv, choices), s = plan.summary;
            if (!s.added.length && !s.replaced.length) { _toast('Nothing to import: every document in the file is already here.', 'info'); return { ok: true, summary: s, preview: pv }; }
            var lbl = 'Import AI inputs from ' + (label || 'a file') + ': ' + [s.added.length ? (s.added.length + ' added') : '', s.replaced.length ? (s.replaced.length + ' replaced') : ''].filter(Boolean).join(', ');
            return _write(lbl, function () { var a = _api(); return a && a.replaceAll ? a.replaceAll(plan.docs) : null; }).then(function (r) {
                var ok = !!(r && r.acknowledged);
                if (ok) _toast('Imported: ' + [s.added.length ? (s.added.length + ' added') : '', s.replaced.length ? (s.replaced.length + ' replaced') : '', s.identical.length ? (s.identical.length + ' already here') : '', s.kept.length ? (s.kept.length + ' kept as they were') : ''].filter(Boolean).join(', ') + '.', 'success', 5000);
                return { ok: ok, summary: s, preview: pv };
            });
        });
    }

    // ---- the three document actions (the modal's, unchanged in what they do) -----------------------
    function _withAi(fn) {
        if (typeof W.slLoadAI !== 'function') return Promise.reject(new Error('The AI module is not available.'));
        return W.slLoadAI().then(fn);
    }
    function runAsk() {
        var q = String((document.getElementById('aip-ask') || {}).value || ''), out = document.getElementById('aip-ask-answer'), btn = document.getElementById('aip-ask-btn');
        if (!q.trim()) { _toast('Type a question first.', 'info'); return; }
        btn.disabled = true; out.textContent = 'Searching your documents.';
        _withAi(function () { if (typeof W.SafetyLabAskDocs !== 'function') throw new Error('Asking your documents needs Safety Lab Aero Pro+ with AI turned on.'); return W.SafetyLabAskDocs(q); })
            .then(function (a) { out.textContent = a; }, function (e) { out.textContent = 'Could not ask: ' + ((e && e.message) || e); })
            .then(function () { btn.disabled = false; });
    }
    function runConsistency() {
        var out = document.getElementById('aip-consistency-answer'), btn = document.getElementById('aip-consistency-btn');
        btn.disabled = true; out.textContent = 'Checking your documents for contradictions.';
        _withAi(function () { if (typeof W.SafetyLabCheckDocs !== 'function') throw new Error('The consistency check needs Safety Lab Aero Pro+ with AI turned on.'); return W.SafetyLabCheckDocs(); })
            .then(function (a) { out.textContent = a; }, function (e) { out.textContent = 'Could not check: ' + ((e && e.message) || e); })
            .then(function () { btn.disabled = false; });
    }
    function runImportToModel() {
        _withAi(function () { if (typeof W.SafetyLabImportDocsToModel !== 'function') throw new Error('Importing into the model needs Safety Lab Aero Pro+ with AI turned on.'); return W.SafetyLabImportDocsToModel(); })
            .catch(function (e) { _toast('Import into the model failed: ' + ((e && e.message) || e), 'warning'); });
    }

    // ---- AI analyses (the launcher's actions, on the page) -----------------------------------------
    var _actions = [];
    function renderAssistant() {
        var host = document.getElementById('aip-assist'); if (!host) return;
        var API = W.SafetyLabAI;
        var chat = '<div class="aip-bar" style="margin-top:0"><button type="button" class="aip-btn primary" id="aip-chat">Open the ANEM live chat</button><span class="aip-small">The chat reads the same AI inputs and the live model, and every change it proposes waits for your Accept.</span></div>';
        if (!API || typeof API.launcherActions !== 'function') {
            var gated = API && API.enabled === false;
            host.innerHTML = chat + '<div class="aip-empty">' + (gated ? 'AI analyses need Safety Lab Aero Pro+. Your AI inputs above are kept, and can be exported and imported, either way.' : 'Loading the AI analyses.') + '</div>';
            _wireChat();
            if (!gated && typeof W.slLoadAI === 'function' && !renderAssistant._loading) {
                renderAssistant._loading = true;
                W.slLoadAI().then(function () { renderAssistant._loading = false; renderAssistant(); }, function () { renderAssistant._loading = false; host.innerHTML = chat + '<div class="aip-empty">The AI module could not be loaded. Reload the page to try again.</div>'; _wireChat(); });
            }
            return;
        }
        var acts = [];
        try { acts = API.launcherActions() || []; } catch (_) { acts = []; }
        _actions = acts.filter(function (a) { return a && a.label !== 'AI Inputs' && a.label !== 'AI Settings'; });
        var h = chat, grp = null;
        _actions.forEach(function (a, i) {
            var g = String(a.group || 'Start here').replace(/&amp;/g, '&');
            if (g !== grp) { if (grp !== null) h += '</div>'; grp = g; h += '<div class="aip-group">' + _esc(g) + '</div><div class="aip-acts">'; }
            var rd = { ready: true };
            if (a.needs) { try { rd = API.inputReady(a.needs.r) || { ready: true }; } catch (_) { rd = { ready: true }; } }
            var chip = a.needs ? (rd.ready ? '<span class="aip-chip ok">Inputs ready</span>' : '<span class="aip-chip no">Needs ' + _esc(rd.need || 'inputs') + '</span>') : '';
            h += '<div class="aip-act" data-act="' + i + '"><div class="aip-act-h"><div class="aip-act-t">' + _esc(String(a.label).replace(/&amp;/g, '&')) + '</div>' + chip + '</div>'
                + '<div class="aip-small">' + _esc(a.sub || '') + (a.needs && a.needs.std ? (' (' + _esc(a.needs.std) + ')') : '') + '</div>'
                + (a.needs ? '<div class="aip-small"><b>Needs:</b> ' + _esc(a.needs.t) + '</div>' : '')
                + '<div><button type="button" class="aip-btn" data-run="' + i + '"' + (rd.ready ? '' : ' disabled title="Add what it needs first"') + '>Run</button></div></div>';
        });
        if (grp !== null) h += '</div>';
        host.innerHTML = h;
        _wireChat();
        host.querySelectorAll('[data-run]').forEach(function (b) {
            b.onclick = function () {
                var a = _actions[parseInt(b.getAttribute('data-run'), 10)]; if (!a) return;
                Promise.resolve().then(a.run).catch(function (e) { _toast((e && e.message) || String(e), 'warning'); }).then(function () { try { renderAssistant(); } catch (_) {} });
            };
        });
    }
    function _wireChat() { var b = document.getElementById('aip-chat'); if (b) b.onclick = function () { if (typeof W.slOpenAnem === 'function') W.slOpenAnem(); }; }

    // ---- which pages read the inputs ----------------------------------------------------------------
    var EXTRA_USES = [
        { tab: 'cad', name: 'CAD Model', what: 'the zonal and particular risk AI review cites passages from these documents' },
        { tab: null, name: 'ANEM live chat', what: 'answers and proposals grounded in these documents and the model' },
        { tab: 'ai', name: 'This page', what: 'Ask your documents, the consistency check and Import documents into the model' }
    ];
    function _pageName(tab) {
        try {
            var s = document.querySelector('.asb-item[onclick="switchTab(\'' + tab + '\')"] .asb-lbl');
            if (s && s.textContent.trim()) return s.textContent.trim();
            var h = document.querySelector('#view-' + tab + ' .header-with-export h3');
            if (h) { var t = (h.childNodes[0] && h.childNodes[0].nodeType === 3) ? h.childNodes[0].textContent : h.textContent; t = String(t || '').trim(); if (t) return t; }
        } catch (_) {}
        return tab;
    }
    function renderUses() {
        var host = document.getElementById('aip-uses-list'); if (!host) return;
        var B = W.LANE_AI_BAR, lanes = {};
        try { lanes = (B && typeof B.lanesFromWrites === 'function') ? B.lanesFromWrites() : {}; } catch (_) { lanes = {}; }
        var items = Object.keys(lanes).map(function (tab) { return { tab: tab, name: _pageName(tab), what: lanes[tab].map(function (l) { return String(l).replace(/&amp;/g, '&'); }).join(', ') }; });
        items.sort(function (a, b) { return a.name.localeCompare(b.name); });
        var h = '<p class="aip-lead">These pages have their own AI buttons. Every one of them reads the AI inputs above, so a document added here is used everywhere, and nothing needs uploading twice.</p><ul class="aip-uses" id="aip-uses-ul">';
        items.concat(EXTRA_USES).forEach(function (u) {
            h += '<li>' + (u.tab && u.tab !== 'ai' ? '<a data-tab="' + _esc(u.tab) + '">' + _esc(u.name) + '</a>' : '<b>' + _esc(u.name) + '</b>') + ': ' + _esc(u.what) + '</li>';
        });
        h += '</ul>';
        host.innerHTML = h;
        host.querySelectorAll('a[data-tab]').forEach(function (a) { a.onclick = function () { try { W.switchTab(a.getAttribute('data-tab')); } catch (_) {} }; });
    }

    // ---- open ---------------------------------------------------------------------------------------
    function open(section) {
        try { if (typeof W.switchTab === 'function') W.switchTab('ai'); } catch (_) {}
        if (!document.getElementById('ai-page-host')) return;
        render();
        setTimeout(function () { _scrollTo(section || 'top'); if (!section) { var v = document.getElementById('view-ai'); if (v && v.scrollIntoView) try { v.scrollIntoView({ block: 'start' }); } catch (_) {} } }, 60);
    }

    // a Cancel on an acknowledgement puts the project back: show the list as it now is
    try { W.addEventListener('sl:change-ack', function () { if (_visible()) { try { renderInputs(); } catch (_) {} } }); } catch (_) {}

    W.SLAiInputsPage = { VERSION: VERSION, open: open, render: render, renderInputs: renderInputs, renderAssistant: renderAssistant, handleFiles: handleFiles,
        importText: importText, buildExport: buildExport, exportFile: exportFile, _state: st };
})();
