/* iface_reqs.js v1.0 (31 Oct 2026): requirements on interfacing systems (customer checklist item 10).
 *
 * What this system's safety case needs from the other side of each interface. The need is found in the trees, not
 * typed: an event in a system's allocation tree that another system provides (fed from that system's failure
 * condition, or realized by an item that system owns) carries a budget, and that budget is the number the other
 * system has to meet. The interfaces themselves stay owned by Sys Lab (projectConfig.interfaces); an event with no
 * declared interface between the two systems is flagged. ANEM drafts the wording; the number always comes from the tree
 * and must stand in the wording exactly as the tree gives it.
 * Status: Draft -> Accepted (by this system's engineer) -> Sent (it appears in the other system's workspace) ->
 * Agreed or Rejected by the owner (with the reason). A budget that changes after sending is flagged to send again.
 * Shown in each system's Requirements tab: what it needs from others, and what others need from it.
 */
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function S(v) { return String(v == null ? '' : v); }
    function E(v) { return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _g(n) { try { var e = root.SLEnv; if (e && e.get) { var v = e.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function _pc() { var p = _g('projectConfig'); return (p && typeof p === 'object') ? p : {}; }
    function _pages() { var p = _g('ftaPages'); return Array.isArray(p) ? p : []; }
    function _systems() { var s = _g('systemsData'); return Array.isArray(s) ? s : []; }
    function _items() { var i = _g('itemsData'); return Array.isArray(i) ? i : []; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _sys(id) { return _systems().find(function (s) { return s && S(s.id) === S(id); }) || null; }
    function _sysName(id) { var s = _sys(id); return s ? S(s.name || s.id) : S(id); }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms || 3500); } catch (_) {} }
    function _jr(k, m) { try { if (typeof root.jrnl === 'function') root.jrnl(k, m); } catch (_) {} }
    function store() { var pc = _pc(); if (!Array.isArray(pc.ifaceReqs)) pc.ifaceReqs = []; return pc.ifaceReqs; }
    function fmtRate(r) { return (r > 0 && isFinite(r)) ? Number(r).toExponential(1).toUpperCase().replace('E-', 'E-') : ''; }

    // the system that provides an event: the system of the failure condition it is fed from, or of the item realizing it
    function _providerOf(n) {
        var es = n && n.externalSource;
        if (es && es.kind === 'fha' && /^SYS_/.test(S(es.targetId))) {
            var iid = S(es.targetId).slice(4), hit = null;
            _systems().some(function (s) { if ((s.fha || []).some(function (f) { return f && S(f.internalId) === iid; })) { hit = s.id; return true; } return false; });
            if (hit) return { sys: hit, via: 'fed from its failure condition' };
        }
        if (n && n.realizedByItemId != null && n.realizedByItemId !== '') {
            var it = _items().find(function (x) { return x && (S(x.itemId) === S(n.realizedByItemId) || S(x.internalId) === S(n.realizedByItemId)); });
            if (it && it.owningSystemId) return { sys: it.owningSystemId, via: 'realized by ' + S(it.itemId || it.name) };
        }
        return null;
    }
    function _budget(n, page) {
        var p = Number(n && n.probability);
        if (!(p > 0)) return 0;
        try { if (root.SLTopBasis && root.SLTopBasis.perFlightHour) { var r = root.SLTopBasis.perFlightHour(p, page); if (r && r.rate > 0) return r.rate; } } catch (_) {}
        return p;
    }
    function interfaceBetween(a, b) {
        var list = Array.isArray(_pc().interfaces) ? _pc().interfaces : [];
        return list.find(function (i) { return i && ((S(i.fromSystemId) === S(a) && S(i.toSystemId) === S(b)) || (S(i.fromSystemId) === S(b) && S(i.toSystemId) === S(a))); }) || null;
    }
    // every need, worked out from the trees: one per (system tree, event provided by another system)
    function needs() {
        var out = [];
        _pages().forEach(function (p) {
            if (!p || !p.root || p.verifies || p.treeLevel !== 'system' || !p.systemId) return;
            (function w(n) {
                if (!n) return;
                if (n.type !== 'gate') {
                    var pr = _providerOf(n);
                    if (pr && S(pr.sys) !== S(p.systemId)) {
                        var b = _budget(n, p);
                        out.push({ key: p.id + ':' + n.id, page: p, node: n, consumer: S(p.systemId), provider: S(pr.sys), via: pr.via, budget: b, iface: interfaceBetween(p.systemId, pr.sys) });
                    }
                }
                _kids(n).forEach(w);
            })(p.root);
        });
        return out;
    }
    function defaultText(nd) {
        var nm = S(nd.node.name || nd.node.displayId || 'its function');
        return _sysName(nd.provider) + ' shall not cause "' + nm + '" for ' + _sysName(nd.consumer) + ' more often than ' + fmtRate(nd.budget) + ' per flight hour.';
    }
    function basisText(nd) { return fmtRate(nd.budget) + ' from the budget of ' + S(nd.node.displayId || nd.node.id) + ' in the ' + S(nd.page.name || nd.page.id) + ' tree.'; }
    // reading never writes: a need with no record yet gets a draft held in memory until the engineer acts on it
    var _fresh = {}, _drafts = {};
    function recordFor(nd) {
        var rec = store().find(function (r) { return r && r.key === nd.key; });
        if (rec) return rec;
        rec = _fresh[nd.key];
        if (!rec) rec = _fresh[nd.key] = { key: nd.key, status: 'Draft', text: defaultText(nd), consumer: nd.consumer, provider: nd.provider };
        return rec;
    }
    function _keep(h) {
        var st = store();
        if (st.indexOf(h.rec) < 0) { st.push(h.rec); delete _fresh[h.rec.key]; }
        h.rec.consumer = h.need.consumer; h.rec.provider = h.need.provider; h.rec.ifaceId = h.need.iface ? ifaceLabel(h.need.iface) : '';
    }
    function ifaceLabel(i) {
        if (!i) return '';
        if (i.id) return S(i.id);
        if (i.icdRef) return S(i.icdRef);
        var list = Array.isArray(_pc().interfaces) ? _pc().interfaces : [];
        return 'IF-' + (list.indexOf(i) + 1);
    }
    // the number must stand in the wording exactly as the tree gives it
    function textHasBudget(text, budget) { return S(text).indexOf(fmtRate(budget)) >= 0; }
    function rows() { return needs().map(function (nd) { return { need: nd, rec: recordFor(nd) }; }); }
    function _find(key) { var nd = needs().find(function (x) { return x.key === key; }); return nd ? { need: nd, rec: recordFor(nd) } : null; }

    function setText(key, text) {
        var h = _find(key); if (!h) return { ok: false, why: 'that need is no longer in the trees' };
        var t = S(text).trim();
        if (!/\bshall\b/i.test(t)) return { ok: false, why: 'a requirement says what shall be done' };
        if (!textHasBudget(t, h.need.budget)) return { ok: false, why: 'the wording must carry the budget from the tree, ' + fmtRate(h.need.budget) + ', exactly' };
        _keep(h); h.rec.text = t; if (h.rec.status !== 'Draft') { h.rec.status = 'Draft'; h.rec.note = 'reworded: accept it again'; }
        delete _drafts[key]; _save(); return { ok: true };
    }
    function accept(key, by) {
        var h = _find(key); if (!h) return { ok: false, why: 'that need is no longer in the trees' };
        if (!textHasBudget(h.rec.text, h.need.budget)) return { ok: false, why: 'the wording no longer carries the budget from the tree (' + fmtRate(h.need.budget) + '): reword it' };
        if (!h.need.iface) return { ok: false, why: 'no interface is declared between ' + _sysName(h.need.consumer) + ' and ' + _sysName(h.need.provider) + ': declare it in Sys Lab (or the interfaces) first' };
        _keep(h); h.rec.status = 'Accepted'; h.rec.acceptedBy = S(by || ''); h.rec.acceptedAt = new Date().toISOString(); delete h.rec.note;
        _save(); _jr('iface-req-accepted', h.rec.text); return { ok: true };
    }
    // sent: the requirement lands in the providing system's list, marked proposed by the consumer, for its owner to decide
    function send(key) {
        var h = _find(key); if (!h) return { ok: false, why: 'that need is no longer in the trees' };
        var stNow = statusOf(h);
        if (h.rec.status !== 'Accepted' && h.rec.status !== 'Rejected' && !/send again/.test(stNow)) return { ok: false, why: 'accept it before sending' };
        if (!textHasBudget(h.rec.text, h.need.budget)) return { ok: false, why: 'the budget in the tree is now ' + fmtRate(h.need.budget) + ': reword it and accept it again' };
        if (!h.need.iface) return { ok: false, why: 'no interface is declared between the two systems' };
        _keep(h);
        var sy = _sys(h.need.provider); if (!sy) return { ok: false, why: 'the providing system is no longer in the project' };
        if (!Array.isArray(sy.req)) sy.req = [];
        var row = sy.req.find(function (r) { return r && r.ifaceReqKey === key; });
        var newId = function () { try { if (typeof newRowId === 'function') return newRowId(); } catch (_) {} return 'ifr-' + Date.now() + Math.random().toString(36).slice(2, 6); };
        if (!row) { row = { internalId: newId(), ifaceReqKey: key, level: 'L2', type: 'Safety', verifMethod: 'Analysis', history: [], traceIds: [] }; sy.req.push(row); }
        row.text = h.rec.text; row.rationale = 'Needed by ' + _sysName(h.need.consumer) + ' across interface ' + ifaceLabel(h.need.iface) + ': ' + basisText(h.need);
        row.proposedBy = _sysName(h.need.consumer); row.ownerStatus = 'Proposed'; row.deleted = false;
        h.rec.status = 'Sent'; h.rec.sentBudget = h.need.budget; h.rec.sentAt = new Date().toISOString(); h.rec.reqInternalId = row.internalId; delete h.rec.ownerWhy;
        _save(); _jr('iface-req-sent', h.rec.text + ' (to ' + _sysName(h.need.provider) + ')');
        try { if (typeof renderSysReq === 'function') renderSysReq(); else if (typeof root.renderSysReq === 'function') root.renderSysReq(); } catch (_) {}
        return { ok: true };
    }
    function ownerDecide(key, agree, why, by) {
        var h = _find(key); if (!h) return { ok: false, why: 'that need is no longer in the trees' };
        if (h.rec.status !== 'Sent' && h.rec.status !== 'Agreed' && h.rec.status !== 'Rejected') return { ok: false, why: 'it has not been sent' };
        if (!agree && !S(why).trim()) return { ok: false, why: 'a rejection says why' };
        h.rec.status = agree ? 'Agreed' : 'Rejected'; h.rec.ownerWhy = agree ? '' : S(why).trim(); h.rec.ownerBy = S(by || ''); h.rec.ownerAt = new Date().toISOString();
        var sy = _sys(h.need.provider), row = sy && (sy.req || []).find(function (r) { return r && r.ifaceReqKey === key; });
        if (row) row.ownerStatus = agree ? 'Agreed' : 'Rejected: ' + h.rec.ownerWhy;
        _save(); _jr('iface-req-' + (agree ? 'agreed' : 'rejected'), h.rec.text + (agree ? '' : ': ' + h.rec.ownerWhy)); return { ok: true };
    }
    function offerDraft(key, text) {
        var h = _find(key); if (!h) return { ok: false, why: 'that need is no longer in the trees' };
        var t = S(text).trim();
        if (!/\bshall\b/i.test(t)) return { ok: false, why: 'no "shall"' };
        if (!textHasBudget(t, h.need.budget)) return { ok: false, why: 'the budget ' + fmtRate(h.need.budget) + ' is not in it exactly' };
        var others = (t.match(/\d(?:\.\d+)?\s*[eE]\s*-?\s*\d+|\d+(?:\.\d+)?\s*[x×]\s*10\s*\^?\s*-?\d+/g) || []).filter(function (m) { return m.replace(/\s/g, '').toUpperCase() !== fmtRate(h.need.budget); });
        if (others.length) return { ok: false, why: 'it carries a number the tree did not give (' + others[0] + ')' };
        _drafts[key] = t; return { ok: true };
    }
    function statusOf(h) {
        var r = h.rec;
        if ((r.status === 'Sent' || r.status === 'Agreed') && r.sentBudget != null && Math.abs(r.sentBudget - h.need.budget) > 1e-15 * Math.max(1, h.need.budget)) return 'Budget changed: send again';
        return r.status;
    }

    // ---- the panel in a system's Requirements tab -----------------------------------------------------------------
    var BTN = 'font:inherit;font-size:12px;font-weight:600;padding:4px 10px;border-radius:7px;border:1px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer;';
    function render() {
        var host = root.document && root.document.getElementById('iface-req-host'); if (!host) return;
        var sid = null; try { sid = (typeof activeSystemId !== 'undefined') ? activeSystemId : null; } catch (_) {}
        if (!sid) { host.innerHTML = ''; return; }
        var all = rows(), mine = all.filter(function (h) { return h.need.consumer === S(sid); }), theirs = all.filter(function (h) { return h.need.provider === S(sid) && (h.rec.status === 'Sent' || h.rec.status === 'Agreed' || h.rec.status === 'Rejected'); });
        if (!mine.length && !theirs.length) { host.innerHTML = ''; return; }
        var aiPill = '<span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;background:rgba(107,79,216,.12);color:#4B33B0;">ANEM</span> ';
        var html = '<div class="controls" style="border-left-color:#0e7490;padding:12px 14px;margin-bottom:12px;">';
        if (mine.length) {
            var nDraft = mine.filter(function (h) { return h.rec.status === 'Draft'; }).length;
            html += '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;"><b>Requirements on interfacing systems</b><span style="display:flex;gap:6px;">' +
                (nDraft ? '<button type="button" data-ifr-ai="1" style="' + BTN + 'border-color:#6B4FD8;color:#4B33B0;" onclick="SLIfaceReqs.ui.ai()">✨ Draft the wording for ' + nDraft + ' with ANEM</button>' : '') +
                (mine.some(function (h) { return h.rec.status === 'Accepted'; }) ? '<button type="button" style="' + BTN + '" onclick="SLIfaceReqs.ui.sendAll()">Send accepted to owners</button>' : '') + '</span></div>' +
                '<div style="font-size:12px;color:var(--color-text-secondary);margin:4px 0 8px;">What this system’s safety case needs from the other side of each interface. The interfaces stay owned by Sys Lab; ANEM drafts the wording; the numbers come from your fault trees.</div>' +
                '<table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr><th>Interface</th><th>Requirement on the other system</th><th>On</th><th>Status</th><th></th></tr></thead><tbody>';
            mine.forEach(function (h) {
                var st = statusOf(h), d = _drafts[h.need.key];
                html += '<tr data-ifr="' + E(h.need.key) + '"' + (d ? ' style="background:rgba(107,79,216,.05);outline:1.5px dashed rgba(107,79,216,.55);outline-offset:-2px;"' : '') + '><td>' + (h.need.iface ? E(ifaceLabel(h.need.iface)) + '<div style="font-size:11px;color:var(--color-text-secondary);">' + E(h.need.iface.medium || h.need.iface.kind || '') + '</div>' : '<span style="color:#9A6200;font-weight:600;">No interface declared</span>') + '</td>' +
                    '<td>' + (d ? aiPill + E(d) : E(h.rec.text)) + '<div style="font-size:11px;color:var(--color-text-secondary);">' + E(basisText(h.need)) + ' (' + E(h.need.via) + ')</div>' + (h.rec.ownerWhy ? '<div style="font-size:11px;color:#A11F16;">Rejected by the owner: ' + E(h.rec.ownerWhy) + '</div>' : '') + (h.rec.note ? '<div style="font-size:11px;color:#7A4800;">' + E(h.rec.note) + '</div>' : '') + '</td>' +
                    '<td>' + E(_sysName(h.need.provider)) + '</td><td>' + E(d ? 'ANEM draft' : st) + '</td><td style="white-space:nowrap;">' +
                    (d ? '<button type="button" style="' + BTN + 'background:#1A6EF2;border-color:#1A6EF2;color:#fff;" onclick="SLIfaceReqs.ui.acceptDraft(\'' + E(h.need.key) + '\')">Accept</button> <button type="button" style="' + BTN + '" onclick="SLIfaceReqs.ui.editDraft(\'' + E(h.need.key) + '\')">Edit</button> <button type="button" style="' + BTN + '" onclick="SLIfaceReqs.ui.discard(\'' + E(h.need.key) + '\')">Discard</button>'
                       : (st === 'Draft' ? '<button type="button" style="' + BTN + '" onclick="SLIfaceReqs.ui.accept(\'' + E(h.need.key) + '\')">Accept</button> <button type="button" style="' + BTN + '" onclick="SLIfaceReqs.ui.edit(\'' + E(h.need.key) + '\')">Edit</button>'
                          : (/send again/.test(st) && !textHasBudget(h.rec.text, h.need.budget) ? '<button type="button" style="' + BTN + '" onclick="SLIfaceReqs.ui.edit(\'' + E(h.need.key) + '\')">Reword with ' + E(fmtRate(h.need.budget)) + '</button>'
                          : (st === 'Accepted' || st === 'Rejected' || /send again/.test(st) ? '<button type="button" style="' + BTN + '" onclick="SLIfaceReqs.ui.send(\'' + E(h.need.key) + '\')">Send to owner</button>' + (st === 'Rejected' ? ' <button type="button" style="' + BTN + '" onclick="SLIfaceReqs.ui.edit(\'' + E(h.need.key) + '\')">Edit</button>' : '') : '')))) + '</td></tr>';
            });
            html += '</tbody></table>';
        }
        if (theirs.length) {
            html += '<div style="margin-top:' + (mine.length ? '14' : '0') + 'px;"><b>What other systems need from this one</b></div><table class="data-table" style="width:100%;font-size:12.5px;margin-top:6px;"><thead><tr><th>From</th><th>Requirement</th><th>Status</th><th></th></tr></thead><tbody>';
            theirs.forEach(function (h) {
                html += '<tr data-ifr-in="' + E(h.need.key) + '"><td>' + E(_sysName(h.need.consumer)) + '</td><td>' + E(h.rec.text) + '<div style="font-size:11px;color:var(--color-text-secondary);">' + E(basisText(h.need)) + '</div></td><td>' + E(statusOf(h)) + (h.rec.ownerWhy ? ': ' + E(h.rec.ownerWhy) : '') + '</td><td style="white-space:nowrap;">' +
                    (h.rec.status === 'Sent' ? '<button type="button" style="' + BTN + '" onclick="SLIfaceReqs.ui.agree(\'' + E(h.need.key) + '\')">Agree</button> <button type="button" style="' + BTN + 'color:#A11F16;" onclick="SLIfaceReqs.ui.reject(\'' + E(h.need.key) + '\')">Reject</button>' : '') + '</td></tr>';
            });
            html += '</tbody></table>';
        }
        host.innerHTML = html + '</div>';
    }
    function _ask(m, d) { try { if (typeof slPrompt === 'function') return slPrompt(m, d || ''); } catch (_) {} return Promise.resolve(root.prompt ? root.prompt(m, d || '') : null); }
    function _me() { try { if (typeof _signoffReviewerName === 'function') return _signoffReviewerName() || ''; } catch (_) {} return ''; }
    function _fail(e) { _toast('That did not go through: ' + ((e && e.message) || e), 'warning', 6000); render(); }
    function _done(res) { if (res && !res.ok && res.why) _toast(res.why, 'warning', 6000); render(); }
    var ui = {
        accept: function (k) { _done(accept(k, _me())); },
        edit: function (k) { var h = _find(k); if (!h) return; _ask('The requirement on ' + _sysName(h.need.provider) + ' (keep the budget ' + fmtRate(h.need.budget) + ' exactly):', h.rec.text).then(function (t) { if (t == null) return; _done(setText(k, t)); }).catch(_fail); },
        acceptDraft: function (k) { var h = _find(k), d = _drafts[k]; if (!h || !d) return; var res = setText(k, d); if (res.ok) res = accept(k, _me()); _done(res); },
        editDraft: function (k) { var h = _find(k), d = _drafts[k]; if (!h || !d) return; _ask('The requirement on ' + _sysName(h.need.provider) + ' (keep the budget ' + fmtRate(h.need.budget) + ' exactly):', d).then(function (t) { if (t == null) return; _done(setText(k, t)); }).catch(_fail); },
        discard: function (k) { delete _drafts[k]; render(); },
        send: function (k) { _done(send(k)); },
        sendAll: function () { rows().filter(function (h) { return h.rec.status === 'Accepted'; }).forEach(function (h) { send(h.need.key); }); render(); _toast('Sent to the owning systems: each owner agrees or rejects in their Requirements tab.', 'info'); },
        agree: function (k) { _done(ownerDecide(k, true, '', _me())); },
        reject: function (k) { _ask('Why can this system not meet it? (the other system sees this)', '').then(function (t) { if (t == null) return; _done(ownerDecide(k, false, t, _me())); }).catch(_fail); },
        ai: function () {
            var sid = null; try { sid = activeSystemId; } catch (_) {}
            var keys = rows().filter(function (h) { return h.need.consumer === S(sid) && h.rec.status === 'Draft' && !_drafts[h.need.key]; }).map(function (h) { return h.need.key; });
            var go = function () { return root.SafetyLabAI.ifaceWording(keys).then(function (res) { if (res && res.ok) _toast(res.summary, 'info'); else if (res && res.why) _toast(res.why, 'warning', 6000); render(); }).catch(_fail); };
            if (root.SafetyLabAI && root.SafetyLabAI.ifaceWording) return go();
            if (typeof root.slLoadAI === 'function') return Promise.resolve(root.slLoadAI()).then(function () { if (root.SafetyLabAI && root.SafetyLabAI.ifaceWording) return go(); _toast('ANEM is not available here.', 'warning'); }).catch(_fail);
            _toast('ANEM is not available here.', 'warning');
        }
    };
    function _wire() {
        if (typeof root.renderSysReq === 'function' && !root.renderSysReq._ifr) {
            var r = root.renderSysReq;
            root.renderSysReq = function () { var out = r.apply(this, arguments); try { render(); } catch (_) {} return out; };
            root.renderSysReq._ifr = true;
        }
    }
    _wire();
    if (typeof root.addEventListener === 'function') root.addEventListener('load', _wire);

    var api = { VERSION: VERSION, needs: needs, rows: rows, store: store, interfaceBetween: interfaceBetween, defaultText: defaultText, basisText: basisText, fmtRate: fmtRate, textHasBudget: textHasBudget,
                setText: setText, accept: accept, offerDraft: offerDraft, drafts: _drafts, ifaceLabel: ifaceLabel, send: send, ownerDecide: ownerDecide, statusOf: statusOf, find: _find, render: render, ui: ui };
    try { root.SLIfaceReqs = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
