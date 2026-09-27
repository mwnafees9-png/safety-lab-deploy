// ============================================================================
// design_baseline.js — v1.0 — Q9 (27 Sep 2026): the design baseline an
// analysis was done against.
//
// The pain this answers is the one the product exists for: the design moves,
// the analysis lags, and nobody can say which analysis looked at which design.
// The Configuration Baselines page already snapshots the ANALYSIS (the project
// state, signed and hashed). This is the other half: the DESIGN baseline, the
// release or mock-up (DMU) version the engineer had in front of them.
//
//   · projectConfig.designBaseline = { current: { id, label, dmu, date, note, setAt },
//                                      history: [older current records] }
//     One current baseline per project. "New baseline" moves the current one to
//     history and mints the next id (DB-1, DB-2, ...).
//   · projectConfig.designStamps[<page key>] = { baselineId, at, by }
//     A stamp is the engineer's statement "this analysis was done against that
//     baseline". Page keys: afha, sfha:<systemId>, fta:<pageId>, cma, pra, zsa,
//     reqs:ac, reqs:<systemId>. Stamping is explicit (a click), never inferred.
//   · status per page: current (stamp = current baseline), older (stamp names an
//     earlier baseline: RE-CHECK), unstamped (never stated).
//
// Surfaces: a Design baseline panel on the Configuration Baselines page (current
// record, history, every analysis page with its status and a stamp button); a
// one-line strip at the top of the AFHA, FTA, CMA, PRA, ZSA and Requirements
// pages; a "Design baseline" stage on the Golden Thread (the condition's FHA
// page, linked trees, requirements); INV-66 advisory for pages analyzed against
// an older baseline. Own words; ARP4754B §5.6 configuration management is the
// process this serves. Reads through SLEnv (rule 5) with direct fallback. No eval.
// window.SLDesignBaseline + module.exports (tests).
// ============================================================================
(function (root) {
    'use strict';
    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'projectConfig': return (typeof projectConfig !== 'undefined') ? projectConfig : root.projectConfig;
                case 'systemsData': return (typeof systemsData !== 'undefined') ? systemsData : root.systemsData;
                case 'acFhaData': return (typeof acFhaData !== 'undefined') ? acFhaData : root.acFhaData;
                case 'acReqData': return (typeof acReqData !== 'undefined') ? acReqData : root.acReqData;
                case 'ftaPages': return (typeof ftaPages !== 'undefined') ? ftaPages : root.ftaPages;
                case 'cmaData': return (typeof cmaData !== 'undefined') ? cmaData : root.cmaData;
                case 'praData': return (typeof praData !== 'undefined') ? praData : root.praData;
                case 'zsaData': return (typeof zsaData !== 'undefined') ? zsaData : root.zsaData;
                case 'activeFTAPageId': return (typeof activeFTAPageId !== 'undefined') ? activeFTAPageId : root.activeFTAPageId;
                case 'activeSystemId': return (typeof activeSystemId !== 'undefined') ? activeSystemId : root.activeSystemId;
            }
        } catch (_) {}
        return root[name];
    }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _pc() { var p = _g('projectConfig'); return (p && typeof p === 'object') ? p : {}; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _blank(s) { return !String(s == null ? '' : s).trim(); }
    function _save() { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }
    function _who() { try { if (typeof _signoffReviewerName === 'function') return _signoffReviewerName() || ''; } catch (_) {} try { if (typeof root._signoffReviewerName === 'function') return root._signoffReviewerName() || ''; } catch (_) {} return ''; }
    function _now() { return new Date().toISOString(); }

    // ---- the baseline record ------------------------------------------------------
    function _store() { var pc = _pc(); if (!pc.designBaseline || typeof pc.designBaseline !== 'object') pc.designBaseline = { current: null, history: [] }; if (!Array.isArray(pc.designBaseline.history)) pc.designBaseline.history = []; return pc.designBaseline; }
    function current() { var c = _store().current; return (c && c.id) ? c : null; }
    function history() { return _store().history.slice(); }
    function all() { var c = current(); return history().concat(c ? [c] : []); }
    function get(id) { var hit = null; all().some(function (b) { if (b && b.id === id) { hit = b; return true; } return false; }); return hit; }
    function _nextId() { var n = 0; all().forEach(function (b) { var m = /^DB-(\d+)$/.exec(String(b && b.id || '')); if (m) n = Math.max(n, +m[1]); }); return 'DB-' + (n + 1); }
    // Set the fields of the current baseline (creating the first one). Editing the label,
    // DMU or note of the current baseline does not make it a new baseline.
    function setCurrent(fields) {
        fields = fields || {};
        var s = _store();
        if (!s.current || !s.current.id) s.current = { id: _nextId(), label: '', dmu: '', date: '', note: '', setAt: _now(), setBy: _who() };
        ['label', 'dmu', 'date', 'note'].forEach(function (k) { if (fields[k] !== undefined) s.current[k] = String(fields[k] || ''); });
        _save(); return s.current;
    }
    // The design moved: the current record goes to history, a new one is minted.
    function newBaseline(fields) {
        fields = fields || {};
        var s = _store();
        if (s.current && s.current.id) { s.current.supersededAt = _now(); s.history.push(s.current); }
        s.current = { id: _nextId(), label: String(fields.label || ''), dmu: String(fields.dmu || ''), date: String(fields.date || ''), note: String(fields.note || ''), setAt: _now(), setBy: _who() };
        _save(); return s.current;
    }
    function describe(b) { if (!b) return 'none'; return b.id + (b.label ? ' ' + b.label : '') + (b.dmu ? ' (' + b.dmu + ')' : ''); }

    // ---- the analysis pages and their stamps ---------------------------------------------
    function _stamps() { var pc = _pc(); if (!pc.designStamps || typeof pc.designStamps !== 'object') pc.designStamps = {}; return pc.designStamps; }
    function _sysName(s) { return s ? (s.name || String(s.id)) : ''; }
    function pages() {
        var out = [];
        if (_arr(_g('acFhaData')).length) out.push({ key: 'afha', label: 'Aircraft FHA', view: 'ac-fha' });
        _arr(_g('systemsData')).forEach(function (s) { if (s && s.id != null && _arr(s.fha).length) out.push({ key: 'sfha:' + s.id, label: 'System FHA: ' + _sysName(s), view: 'sys-workspace', systemId: s.id }); });
        _arr(_g('ftaPages')).forEach(function (p) { if (p && p.id != null) out.push({ key: 'fta:' + p.id, label: 'Fault tree: ' + (p.name || p.id), view: 'fta', pageId: p.id }); });
        if (_arr(_g('cmaData')).length) out.push({ key: 'cma', label: 'Common mode analysis', view: 'cma' });
        if (_arr(_g('praData')).length) out.push({ key: 'pra', label: 'Particular risk analysis', view: 'pra' });
        if (_arr(_g('zsaData')).length) out.push({ key: 'zsa', label: 'Zonal safety analysis', view: 'zsa' });
        if (_arr(_g('acReqData')).length) out.push({ key: 'reqs:ac', label: 'Aircraft requirements', view: 'ac-req' });
        _arr(_g('systemsData')).forEach(function (s) { if (s && s.id != null && _arr(s.req).length) out.push({ key: 'reqs:' + s.id, label: 'System requirements: ' + _sysName(s), view: 'sys-workspace', systemId: s.id }); });
        return out;
    }
    function stamp(key) { var s = _stamps()[key]; return (s && s.baselineId) ? s : null; }
    function status(key) {
        var c = current(), s = stamp(key);
        if (!s) return { kind: 'unstamped', text: 'not yet stated' };
        if (!c) return { kind: 'unstamped', text: 'analyzed against ' + s.baselineId + ' (no current design baseline set)' };
        if (s.baselineId === c.id) return { kind: 'current', text: 'analyzed against ' + s.baselineId + ' (current)', stamp: s };
        return { kind: 'older', text: 'analyzed against ' + s.baselineId + ', the design is now at ' + c.id + ': re-check', stamp: s };
    }
    // The engineer's statement. Refused when no current baseline exists.
    function setStamp(key) {
        var c = current(); if (!c || !key) return null;
        var s = _stamps(); s[key] = { baselineId: c.id, at: _now(), by: _who() };
        _save(); return s[key];
    }
    function stampAll() { var n = 0; pages().forEach(function (p) { if (setStamp(p.key)) n++; }); return n; }
    function recheck() { return pages().map(function (p) { var st = status(p.key); return { page: p, status: st }; }).filter(function (x) { return x.status.kind === 'older'; }); }
    function unstamped() { return pages().map(function (p) { var st = status(p.key); return { page: p, status: st }; }).filter(function (x) { return x.status.kind === 'unstamped'; }); }
    var INV = { id: 'INV-66', sev: 'advisory',
        name: 'Every analysis states the design baseline it was done against, and none was done against an older baseline than the current one (re-check)',
        run: function () {
            if (!current()) return { checked: 0, fails: [], failCount: 0 };
            var ps = pages(); var f = recheck();
            return { checked: ps.length, fails: f.slice(0, 20).map(function (x) { return x.page.label + ': ' + x.status.text; }), failCount: f.length, unstamped: unstamped().length };
        } };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- which pages a failure condition touches (Golden Thread) --------------------------
    function pagesForFc(fha) {
        if (!fha) return [];
        var keys = [];
        var ac = _arr(_g('acFhaData')).indexOf(fha) >= 0;
        if (ac) keys.push('afha');
        else _arr(_g('systemsData')).forEach(function (s) { if (s && _arr(s.fha).indexOf(fha) >= 0) keys.push('sfha:' + s.id); });
        _arr(_g('ftaPages')).forEach(function (p) {
            var links = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId != null ? [p.linkedFhaId] : []);
            if (links.map(String).indexOf(String(fha.internalId)) >= 0) keys.push('fta:' + p.id);
        });
        if (ac && _arr(_g('acReqData')).length) keys.push('reqs:ac');
        var byKey = {}; pages().forEach(function (p) { byKey[p.key] = p; });
        return keys.filter(function (k) { return byKey[k]; }).map(function (k) { return byKey[k]; });
    }
    function threadStage(fha) {
        var c = current(); if (!c) return '';
        var ps = pagesForFc(fha); if (!ps.length) return '';
        var lines = [], older = 0, un = 0;
        ps.forEach(function (p) {
            var st = status(p.key);
            if (st.kind === 'older') older++; if (st.kind === 'unstamped') un++;
            lines.push('<b>' + _esc(p.label) + '</b> · ' + (st.kind === 'older' ? '<span style="color:#9A6200;font-weight:600;">' + _esc(st.text) + '</span>' : st.kind === 'unstamped' ? '<span style="color:var(--color-text-secondary);">' + _esc(st.text) + '</span>' : _esc(st.text))
                + (st.kind !== 'current' ? ' <a href="#" onclick="SLDesignBaseline.stampClick(\'' + _esc(p.key) + '\');return false;" style="font-weight:600;">mark as analyzed against ' + _esc(c.id) + '</a>' : ''));
        });
        var body = lines.join('<br>') + '<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;">Design is at ' + _esc(describe(c)) + '. ' + ps.length + ' analysis page' + (ps.length === 1 ? '' : 's') + ' on this thread; ' + older + ' to re-check, ' + un + ' not yet stated.</div>';
        return (typeof _gtStage === 'function') ? _gtStage('Design baseline', body, older ? 'warn' : (un ? 'info' : 'ok')) : '';
    }
    function _wrapThread() {
        var orig = root._renderGoldenThread;
        if (typeof orig !== 'function' || orig._dbWrapped) return false;
        var w = function (fha) {
            var html = orig.apply(this, arguments);
            try {
                var stage = threadStage(fha);
                if (stage) {
                    var i = html.indexOf('>Verification</span>');
                    var at = i >= 0 ? html.lastIndexOf('<div style="border:1px solid var(--color-border-hair)', i) : -1;
                    html = at >= 0 ? html.slice(0, at) + stage + html.slice(at) : html + stage;
                }
            } catch (_) {}
            return html;
        };
        w._dbWrapped = true; root._renderGoldenThread = w; return true;
    }

    // ---- surfaces ------------------------------------------------------------------------
    function stampClick(key) {
        var s = setStamp(key);
        try { if (typeof root.showToast === 'function') root.showToast(s ? 'Stated: analyzed against ' + s.baselineId + '.' : 'Set the current design baseline first (Configuration Baselines page).', s ? 'success' : 'warning', 3500); } catch (_) {}
        renderPanel(); renderStrips();
        try { if (typeof root.renderGoldenThread === 'function') root.renderGoldenThread(); } catch (_) {}
        return !!s;
    }
    function stampAllClick() { var n = stampAll(); try { if (typeof root.showToast === 'function') root.showToast(n ? n + ' page' + (n === 1 ? '' : 's') + ' stated as analyzed against ' + current().id + '.' : 'Set the current design baseline first.', n ? 'success' : 'warning', 3500); } catch (_) {} renderPanel(); renderStrips(); return n; }
    function setFieldClick(field, value) { setCurrent((function () { var o = {}; o[field] = value; return o; })()); renderPanel(); renderStrips(); }
    function newBaselineClick() {
        var d = root.document; if (!d) return null;
        var lab = d.getElementById('db-new-label'), dmu = d.getElementById('db-new-dmu'), dt = d.getElementById('db-new-date'), note = d.getElementById('db-new-note');
        var b = newBaseline({ label: lab && lab.value, dmu: dmu && dmu.value, date: dt && dt.value, note: note && note.value });
        try { if (typeof root.showToast === 'function') root.showToast('Design baseline ' + b.id + ' is current. Every analysis now shows what it was analyzed against.', 'success', 4000); } catch (_) {}
        renderPanel(); renderStrips();
        try { if (typeof root.renderGoldenThread === 'function') root.renderGoldenThread(); } catch (_) {}
        return b;
    }
    function _statusPill(st) {
        var col = st.kind === 'current' ? '#1D9E75' : st.kind === 'older' ? '#9A6200' : 'var(--color-text-tertiary)';
        return '<span style="font-size:10.5px;font-weight:700;color:' + col + ';">' + (st.kind === 'current' ? '● current' : st.kind === 'older' ? '● re-check' : '○ not stated') + '</span>';
    }
    function panelHtml() {
        var c = current(), h = history(), ps = pages();
        var inp = function (id, field, val, ph) { return '<input type="text" id="' + id + '" value="' + _esc(val) + '" placeholder="' + _esc(ph) + '" style="font-size:12px;width:100%;" onchange="SLDesignBaseline.setFieldClick(\'' + field + '\',this.value)">'; };
        var cur = c
            ? '<div class="grid-2-col" style="gap:8px;"><div><label>Baseline id</label><div class="u-mono" style="font-weight:700;">' + _esc(c.id) + '</div></div>'
              + '<div><label>Label</label>' + inp('db-cur-label', 'label', c.label, 'e.g. PDR design release') + '</div>'
              + '<div><label>Mock-up / DMU version</label>' + inp('db-cur-dmu', 'dmu', c.dmu, 'e.g. DMU 12.3') + '</div>'
              + '<div><label>Date</label>' + inp('db-cur-date', 'date', c.date, 'YYYY-MM-DD') + '</div>'
              + '<div style="grid-column:1/-1;"><label>Note</label>' + inp('db-cur-note', 'note', c.note, 'what changed in the design at this baseline') + '</div></div>'
            : '<div style="font-size:12px;color:var(--color-text-secondary);">No design baseline set. Every analysis page will show "not stated" until one exists.</div>';
        var mint = '<div style="margin-top:10px;padding:10px 12px;background:var(--color-surface-2);border:1px solid var(--color-border-hair);border-radius:var(--r-md);">'
            + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-tertiary);font-weight:600;margin-bottom:6px;">' + (c ? 'The design moved: new baseline' : 'Set the first design baseline') + '</div>'
            + '<div class="grid-2-col" style="gap:8px;"><div><label>Label</label><input type="text" id="db-new-label" placeholder="e.g. CDR design release" style="font-size:12px;width:100%;"></div><div><label>Mock-up / DMU version</label><input type="text" id="db-new-dmu" placeholder="e.g. DMU 14.0" style="font-size:12px;width:100%;"></div>'
            + '<div><label>Date</label><input type="text" id="db-new-date" placeholder="YYYY-MM-DD" style="font-size:12px;width:100%;"></div><div><label>Note</label><input type="text" id="db-new-note" placeholder="what changed" style="font-size:12px;width:100%;"></div></div>'
            + '<button type="button" class="action-btn btn-green" style="margin-top:8px;" onclick="SLDesignBaseline.newBaselineClick()">' + (c ? '+ New design baseline (' + _esc(_nextId()) + ')' : '+ Set design baseline (' + _esc(_nextId()) + ')') + '</button>'
            + (c ? '<span style="font-size:11px;color:var(--color-text-secondary);margin-left:10px;">' + _esc(c.id) + ' goes to history; every stamped page turns to re-check until it is re-stated.</span>' : '') + '</div>';
        var hist = h.length ? '<table class="reference-table" style="margin-top:10px;font-size:12px;"><thead><tr><th>Baseline</th><th>Label</th><th>DMU</th><th>Date</th><th>Superseded</th></tr></thead><tbody>'
            + h.slice().reverse().map(function (b) { return '<tr><td class="u-mono">' + _esc(b.id) + '</td><td>' + _esc(b.label) + '</td><td>' + _esc(b.dmu) + '</td><td>' + _esc(b.date) + '</td><td>' + _esc(String(b.supersededAt || '').slice(0, 10)) + '</td></tr>'; }).join('') + '</tbody></table>' : '';
        var older = recheck().length, un = unstamped().length;
        var table = ps.length ? '<table class="reference-table" style="margin-top:10px;font-size:12px;"><thead><tr><th>Analysis page</th><th>Analyzed against</th><th>Stated by</th><th></th></tr></thead><tbody>'
            + ps.map(function (p) { var st = status(p.key); return '<tr><td>' + _esc(p.label) + '</td><td>' + _statusPill(st) + ' <span style="font-size:11px;">' + _esc(st.text) + '</span></td><td style="font-size:11px;">' + (st.stamp ? _esc((st.stamp.by || '') + ' ' + String(st.stamp.at || '').slice(0, 10)) : '') + '</td><td>' + (c && st.kind !== 'current' ? '<button type="button" class="action-btn" style="padding:1px 7px;font-size:10.5px;" onclick="SLDesignBaseline.stampClick(\'' + _esc(p.key) + '\')">analyzed against ' + _esc(c.id) + '</button>' : '') + '</td></tr>'; }).join('')
            + '</tbody></table>' : '<div style="font-size:12px;color:var(--color-text-secondary);margin-top:8px;">No analysis pages yet.</div>';
        return '<div id="db-panel" style="margin:0 0 16px;padding:12px 14px;border:1px solid var(--color-border-hair);border-left:3px solid var(--color-accent);border-radius:var(--r-md);">'
            + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><b style="font-size:13px;color:var(--color-text-primary);">Design baseline</b><span style="font-size:12px;color:var(--color-text-secondary);">the design release or mock-up each analysis was done against (the analysis baselines below snapshot the analysis itself)</span>'
            + (c && ps.length ? '<span style="margin-left:auto;font-size:11px;">' + older + ' to re-check · ' + un + ' not stated</span>' + (ps.some(function (p) { return status(p.key).kind !== 'current'; }) ? '<button type="button" class="action-btn" style="padding:2px 9px;font-size:11px;" onclick="SLDesignBaseline.stampAllClick()">state all as analyzed against ' + _esc(c.id) + '</button>' : '') : '') + '</div>'
            + '<div style="margin-top:8px;">' + cur + '</div>' + mint + hist + table + '</div>';
    }
    function renderPanel() {
        var d = root.document; if (!d) return false;
        var host = d.getElementById('baselines-host'); if (!host || !host.parentNode) return false;
        var el = d.getElementById('db-panel');
        if (el) { el.outerHTML = panelHtml(); return true; }
        var box = d.createElement('div'); box.innerHTML = panelHtml();
        host.parentNode.insertBefore(box.firstElementChild || box, host);
        return true;
    }
    // One-line strip at the top of an analysis view.
    var STRIPS = [{ view: 'ac-fha', key: function () { return 'afha'; } }, { view: 'fta', key: function () { var id = _g('activeFTAPageId'); return id != null && id !== '' ? 'fta:' + id : null; } },
                  { view: 'cma', key: function () { return 'cma'; } }, { view: 'pra', key: function () { return 'pra'; } }, { view: 'zsa', key: function () { return 'zsa'; } }, { view: 'ac-req', key: function () { return 'reqs:ac'; } }];
    function stripHtml(key) {
        var c = current();
        if (!c) return '<span style="color:var(--color-text-tertiary);">Design baseline: none set</span> <a href="#" onclick="switchTab(\'baselines\');return false;">set one</a>';
        if (!key) return '';
        var st = status(key);
        return '<span>Design baseline: </span>' + _statusPill(st) + ' <span>' + _esc(st.text) + '</span>' + (st.kind !== 'current' ? ' <a href="#" onclick="SLDesignBaseline.stampClick(\'' + _esc(key) + '\');return false;" style="font-weight:600;">mark as analyzed against ' + _esc(c.id) + '</a>' : '');
    }
    function renderStrips() {
        var d = root.document; if (!d) return 0;
        var n = 0;
        STRIPS.forEach(function (s) {
            var view = d.getElementById('view-' + s.view); if (!view) return;
            var id = 'db-strip-' + s.view, el = d.getElementById(id);
            if (!el) { el = d.createElement('div'); el.id = id; el.style.cssText = 'font-size:11.5px;padding:4px 0 6px;color:var(--color-text-secondary);'; var head = view.querySelector('.header-with-export'); if (head && head.parentNode === view) view.insertBefore(el, head.nextSibling); else if (view.firstChild) view.insertBefore(el, view.firstChild); else view.appendChild(el); }
            el.innerHTML = stripHtml(s.key()); n++;
        });
        return n;
    }
    function _wrapSwitchTab() {
        var orig = root.switchTab;
        if (typeof orig !== 'function' || orig._dbWrapped) return false;
        var w = function (tabId) { var r = orig.apply(this, arguments); try { renderStrips(); if (tabId === 'baselines') renderPanel(); } catch (_) {} return r; };
        w._dbWrapped = true; root.switchTab = w; return true;
    }
    function _wrapBaselines() {
        var orig = root.renderBaselines;
        if (typeof orig !== 'function' || orig._dbWrapped) return false;
        var w = function () { var r = orig.apply(this, arguments); try { renderPanel(); } catch (_) {} return r; };
        w._dbWrapped = true; root.renderBaselines = w; return true;
    }
    // The FTA strip follows the active page; a light poll while that view is open.
    var _lastFtaKey = null;
    function _tick() {
        var d = root.document; if (!d) return;
        var view = d.getElementById('view-fta'); if (!view || view.style.display === 'none') return;
        var k = STRIPS[1].key(); if (k === _lastFtaKey) return; _lastFtaKey = k;
        var el = d.getElementById('db-strip-fta'); if (el) el.innerHTML = stripHtml(k);
    }
    (function hook(tries) {
        var ok = [_wrapThread(), _wrapSwitchTab(), _wrapBaselines()];
        try { renderStrips(); } catch (_) {}
        if (ok.some(function (x) { return !x; }) && tries > 0 && typeof setTimeout === 'function') setTimeout(function () { hook(tries - 1); }, 100);
    })(50);
    if (typeof setInterval === 'function' && root.document) { try { setInterval(_tick, 1500); } catch (_) {} }

    var api = { current: current, history: history, all: all, get: get, setCurrent: setCurrent, newBaseline: newBaseline, describe: describe,
                pages: pages, stamp: stamp, status: status, setStamp: setStamp, stampAll: stampAll, recheck: recheck, unstamped: unstamped, INV: INV,
                pagesForFc: pagesForFc, threadStage: threadStage, stampClick: stampClick, stampAllClick: stampAllClick, setFieldClick: setFieldClick, newBaselineClick: newBaselineClick,
                panelHtml: panelHtml, renderPanel: renderPanel, stripHtml: stripHtml, renderStrips: renderStrips, STRIPS: STRIPS,
                _wrapThread: _wrapThread, _wrapSwitchTab: _wrapSwitchTab, _wrapBaselines: _wrapBaselines, _tick: _tick };
    try { root.SLDesignBaseline = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
