/* The zonal safety analysis on the ZSA page (19 Oct 2026, build 7). Confirmed (Waqas, 19 Oct 2026): Safety Lab owns the
   ZSA. This panel shows what SLZsaEngine computes, zone by zone: what is in each zone, the hazards there and what they
   reach, the findings, and the gaps that make the analysis less than complete. A person dispositions each finding
   (accepted with the reason, or mitigated by a requirement in the project); "Update the ZSA table" writes one row per
   zone from the analysis and never touches rows typed by people. Deterministic, no AI. Mounts at #zsa-analysis. */
(function () {
    'use strict';
    var root = typeof window !== 'undefined' ? window : globalThis;
    function _E() { return root.SLZsaEngine; }
    function _esc(s) { if (typeof root.esc === 'function') return root.esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function _msg(text, kind) { try { if (typeof root.showToast === 'function') root.showToast(text, kind || 'info', 5000); else if (typeof root.slAlert === 'function') root.slAlert(text); } catch (_) {} }
    var state = { filter: 'open-violations', open: {}, last: null };
    var SEVCOL = { violation: '#b91c1c', advisory: '#b45309', info: '#64748b' };
    var STATUS = { open: 'Open', reopened: 'Reopened (what it rests on changed)', accepted: 'Accepted', mitigated: 'Mitigated', noted: 'Noted' };

    function _who() {
        var el = document.getElementById('zsae-by'), v = el ? String(el.value || '').trim() : '';
        if (!v) { try { if (typeof root._signoffReviewerName === 'function') v = String(root._signoffReviewerName() || '').trim(); } catch (_) {} }
        return v;
    }
    function _shown(f) {
        var openish = f.status === 'open' || f.status === 'reopened';
        if (state.filter === 'open-violations') return openish && f.severity === 'violation';
        if (state.filter === 'open') return openish;
        return true;
    }
    function _badge(sev) { return '<span class="zsae-badge" style="background:' + (SEVCOL[sev] || '#64748b') + '">' + _esc(sev === 'violation' ? 'Violation' : sev === 'advisory' ? 'Advisory' : 'Info') + '</span>'; }
    function _finding(f) {
        var d = f.disposition, id = _esc(f.id);
        var h = '<li class="zsae-finding" data-zsae-finding="' + id + '">' + _badge(f.severity) + ' <span class="zsae-status">' + _esc(STATUS[f.status] || f.status) + '</span>'
              + '<div class="zsae-text">' + _esc(f.text) + '</div>';
        if (d) h += '<div class="zsae-disp">' + _esc((d.state === 'mitigated' ? 'Mitigated by ' + d.requirementId + (d.requirementVerified ? ' (verified)' : ' (not verified yet)') : 'Accepted') + (d.reason ? ': ' + d.reason : '') + ' (' + d.by + ', ' + String(d.at).slice(0, 10) + ')' + (d.stale ? '. What it rested on has changed since: look again.' : '')) + '</div>';
        if (f.needsDisposition) {
            h += '<div class="zsae-actions">';
            if (!d || d.stale) h += '<button type="button" class="btn-sm" data-zsae-act="accept" data-zsae-id="' + id + '">Accept</button> <button type="button" class="btn-sm" data-zsae-act="mitigate" data-zsae-id="' + id + '">Mitigate</button>';
            if (d) h += ' <button type="button" class="btn-sm" data-zsae-act="undo" data-zsae-id="' + id + '">Undo</button>';
            h += '</div>';
        }
        return h + '</li>';
    }
    function _zone(z, byId) {
        var fs = z.findings.map(function (id) { return byId[id]; }).filter(Boolean);
        var shown = fs.filter(_shown);
        var empty = !z.equipment.length && !z.elements.length && !z.routes.length && !fs.length;
        if (empty || (state.filter !== 'all' && !shown.length)) return '';
        var nV = fs.filter(function (f) { return f.severity === 'violation' && (f.status === 'open' || f.status === 'reopened'); }).length;
        var contents = [];
        if (z.elements.length) contents.push(z.elements.length + ' installed unit' + (z.elements.length > 1 ? 's' : ''));
        if (z.equipment.length) contents.push(z.equipment.length + ' equipment item' + (z.equipment.length > 1 ? 's' : ''));
        if (z.routes.length) contents.push(z.routes.length + ' route' + (z.routes.length > 1 ? 's' : ''));
        var ev = z.zoneEvent.worst ? 'Everything here lost at once: ' + z.zoneEvent.worst : z.zoneEvent.worstPossible ? 'Everything here lost at once: possibly ' + z.zoneEvent.worstPossible : 'Everything here lost at once: no failure condition reached for certain';
        var open = !!state.open[z.zoneId];
        var h = '<details class="zsae-zone" data-zsae-zone="' + _esc(z.zoneId) + '"' + (open ? ' open' : '') + '><summary><b>' + _esc(z.code || z.zoneId) + '</b> ' + _esc(z.name && z.name !== z.code ? z.name : '')
              + ' <span class="zsae-muted">' + _esc(contents.join(', ') || 'nothing placed here') + '</span>'
              + (nV ? ' <span class="zsae-badge" style="background:#b91c1c">' + nV + ' open violation' + (nV > 1 ? 's' : '') + '</span>' : '') + '</summary>';
        if (open) {
            h += '<div class="zsae-body"><div class="zsae-muted">' + _esc(ev) + '</div>';
            var items = z.elements.map(function (e) { return e.key; }).concat(z.equipment.map(function (e) { return e.name; })).concat(z.routes.map(function (r) { return 'route ' + r.line + (r.typeName ? ' (' + String(r.typeName).toLowerCase() + ')' : ' (no type)'); }));
            if (items.length) h += '<div class="zsae-items">' + _esc(items.join(', ')) + '</div>';
            if (z.barriers.length) h += '<div class="zsae-muted">' + z.barriers.map(function (b) { return _esc('Barrier to ' + b.to + ': ' + b.credit.text); }).join('<br>') + '</div>';
            h += shown.length ? '<ul class="zsae-list">' + shown.map(_finding).join('') + '</ul>' : '<div class="zsae-muted">No findings to show with this filter.</div>';
            h += '</div>';
        }
        return h + '</details>';
    }
    function render() {
        var host = document.getElementById('zsa-analysis'); if (!host) return;
        var E = _E(); if (!E) { host.innerHTML = ''; return; }
        var res; try { res = E.compute(); } catch (e) { host.innerHTML = '<div class="zsae-panel"><b>Zonal analysis</b><div class="zsae-err">The analysis could not run: ' + _esc(e && e.message) + '</div></div>'; return; }
        state.last = res;
        var byId = {}; res.findings.forEach(function (f) { byId[f.id] = f; });
        var s = res.summary, by = _who();
        var h = '<div class="zsae-panel"><div class="zsae-head"><b>Zonal analysis</b> <span class="zsae-muted">computed from the zone model, the CAD model, the Sys Lab routes and the fault trees</span></div>'
              + '<div class="zsae-sum">' + s.zones + ' zones, ' + s.findings + ' findings: <b style="color:#b91c1c">' + s.violations + ' violations</b>, <b style="color:#b45309">' + s.advisories + ' advisories</b>, ' + s.open + ' open.</div>'
              + '<div class="zsae-bar"><label>Your name <input type="text" id="zsae-by" value="' + _esc(by) + '" placeholder="who dispositions" style="width:12em"></label> '
              + '<label>Show <select id="zsae-filter"><option value="open-violations"' + (state.filter === 'open-violations' ? ' selected' : '') + '>Open violations</option><option value="open"' + (state.filter === 'open' ? ' selected' : '') + '>Everything open</option><option value="all"' + (state.filter === 'all' ? ' selected' : '') + '>Every zone and finding</option></select></label> '
              + '<button type="button" class="btn-sm" data-zsae-act="refresh">Run again</button> <button type="button" class="btn-sm" data-zsae-act="materialize" style="background:#c2410c;color:#fff">Update the ZSA table</button></div>';
        if (res.gaps.length) h += '<div class="zsae-gaps"><b>What the analysis is missing</b><ul>' + res.gaps.map(function (g) { return '<li>' + _esc(g) + '</li>'; }).join('') + '</ul></div>';
        var zs = res.zones.map(function (z) { return _zone(z, byId); }).join('');
        var loose = res.findings.filter(function (f) { return !f.zoneIds.length && _shown(f); });
        if (loose.length) zs += '<details class="zsae-zone" open><summary><b>Not tied to one zone</b></summary><div class="zsae-body"><ul class="zsae-list">' + loose.map(_finding).join('') + '</ul></div></details>';
        h += zs || '<div class="zsae-muted">Nothing to show with this filter.</div>';
        host.innerHTML = h + '</div>';
    }
    async function _ask(q, d) { return typeof root.slPrompt === 'function' ? root.slPrompt(q, d || '') : null; }
    async function act(kind, id) {
        var E = _E(); if (!E) return;
        if (kind === 'refresh') return render();
        if (kind === 'materialize') {
            var m = E.materialize({ result: state.last || undefined });
            if (!m.ok) return _msg(m.err, 'error');
            try { if (typeof root.renderZSA === 'function') root.renderZSA(); } catch (_) {}
            _msg('ZSA table updated from the analysis: ' + m.created + ' added, ' + m.updated + ' updated, ' + m.removed + ' removed. Rows typed by people are untouched.', 'success');
            return render();
        }
        if (kind === 'undo') { var u = E.undispose(id); if (!u.ok) _msg(u.err, 'error'); return render(); }
        var who = _who(); if (!who) { who = await _ask('Your name, for the record of who dispositioned this finding:'); who = who ? String(who).trim() : ''; if (!who) return; }
        var r;
        if (kind === 'accept') {
            var why = await _ask('Why is this acceptable? (at least a sentence; it goes on the record)'); if (why == null) return;
            r = E.dispose(id, { state: 'accepted', reason: why }, who);
        } else if (kind === 'mitigate') {
            var rq = await _ask('The requirement that carries the mitigation (its ID in this project):'); if (rq == null) return;
            var how = await _ask('How it mitigates the finding (optional):'); if (how == null) how = '';
            r = E.dispose(id, { state: 'mitigated', requirementId: rq, reason: how }, who);
        } else return;
        if (!r.ok) _msg(r.err, 'error'); else _msg(kind === 'accept' ? 'Accepted and on record. It no longer shows as open.' : 'Mitigated and on record. It no longer shows as open.', 'success');
        render();
    }
    function _onClick(ev) {
        var b = ev.target && ev.target.closest ? ev.target.closest('[data-zsae-act]') : null;
        if (b) { ev.preventDefault(); act(b.getAttribute('data-zsae-act'), b.getAttribute('data-zsae-id')); return; }
        var s = ev.target && ev.target.closest ? ev.target.closest('summary') : null, d = s ? s.parentNode : null;
        if (d && d.getAttribute && d.getAttribute('data-zsae-zone')) { ev.preventDefault(); var z = d.getAttribute('data-zsae-zone'); state.open[z] = !state.open[z]; render(); }
    }
    function _onChange(ev) { if (ev.target && ev.target.id === 'zsae-filter') { state.filter = ev.target.value; render(); } }
    var CSS = '#zsa-analysis .zsae-panel{border:1px solid rgba(148,163,184,.45);border-left:4px solid #c2410c;border-radius:6px;padding:10px 12px;margin:8px 0 12px}'
            + '#zsa-analysis .zsae-muted{color:#64748b;font-size:12px}#zsa-analysis .zsae-sum{margin:4px 0}#zsa-analysis .zsae-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}'
            + '#zsa-analysis .zsae-badge{color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600}#zsa-analysis .zsae-gaps{background:rgba(234,179,8,.12);border-radius:4px;padding:6px 10px;margin:6px 0;font-size:13px}'
            + '#zsa-analysis .zsae-zone{border-top:1px solid rgba(148,163,184,.3);padding:4px 0}#zsa-analysis .zsae-zone summary{cursor:pointer;padding:3px 0}#zsa-analysis .zsae-body{padding:4px 0 6px 14px}'
            + '#zsa-analysis .zsae-items{font-size:12px;margin:4px 0}#zsa-analysis .zsae-list{list-style:none;padding:0;margin:6px 0}#zsa-analysis .zsae-finding{padding:6px 0;border-top:1px dashed rgba(148,163,184,.3)}'
            + '#zsa-analysis .zsae-text{font-size:13px;margin:3px 0;overflow-wrap:anywhere}#zsa-analysis .zsae-disp{font-size:12px;color:#15803d}#zsa-analysis .zsae-status{font-size:12px}#zsa-analysis .zsae-err{color:#b91c1c}';
    function mount() {
        var v = document.getElementById('view-zsa'); if (!v) return false;
        if (!document.getElementById('zsae-style')) { var st = document.createElement('style'); st.id = 'zsae-style'; st.textContent = CSS; document.head.appendChild(st); }
        var host = document.getElementById('zsa-analysis');
        if (!host) { host = document.createElement('div'); host.id = 'zsa-analysis'; var head = v.querySelector('.header-with-export'); if (head && head.nextSibling) v.insertBefore(host, head.nextSibling); else v.insertBefore(host, v.firstChild); }
        if (!host._zsae) { host.addEventListener('click', _onClick); host.addEventListener('change', _onChange); host._zsae = true; }
        // runs each time the ZSA page is shown, however it is reached (the menu, a link, a restore)
        if (!v._zsaeObs && typeof MutationObserver === 'function') {
            var shown = v.style.display !== 'none';
            v._zsaeObs = new MutationObserver(function () { var now = v.style.display !== 'none'; if (now && !shown) { try { render(); } catch (_) {} } shown = now; });
            v._zsaeObs.observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
            if (shown) { try { render(); } catch (_) {} }
        }
        return true;
    }
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { var tries = 40; var t = setInterval(function () { if (mount() || --tries <= 0) clearInterval(t); }, 250); });
    root.SLZsaPage = { render: render, mount: mount, act: act, state: state };
})();
