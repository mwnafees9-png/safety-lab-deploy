// ============================================================================
// connections.js, v1.0, 28 Oct 2026: Safety Lab Connections.
//
// Waqas: "go for it, and lets get this built". The agreed model, in his words:
//   * every linked item has ONE owner, its source of truth, chosen "only for the items being linked not for all the
//     fields": "if safety lab is the source of truth then we can edit, if jama is the source of truth no edit
//     permissions";
//   * changes from the owning tool are flagged added, removed or changed and are "never update[d] automatically
//     without their engineering teams consent": an engineer accepts or rejects each and signs;
//   * changes to items Safety Lab owns are pushed by a person ("we provide users the interface and ability to push
//     changes directly to that tool");
//   * calculated results, signatures and history never cross;
//   * a pop-up at sign-in lists what came in, with Accept, Reject or Later; Later leaves it in the pill at the bottom
//     ("4 incoming changes from Jama + 6 changes to confirm"); a reminder at sign-out names what was not sent.
//
// THE PIECES
//   register(tool, adapter)   each connected tool plugs in here (live_bridge.js registers Jama). An adapter gives
//                             changes() (the lines staged from the tool), check(silent), applyKeys(keys, signer),
//                             linkedRows() (every Safety Lab row linked to the tool), and the tool's own setup.
//   the store                 projectConfig.connections: owners (an item a person moved to Safety Lab), decisions
//                             (rejected lines), log (History, append-only). A project setting, shared by everyone
//                             on the project, saved with the project.
//   incoming()                every line waiting from every tool, minus the rejected ones and minus edits made in a
//                             tool to items Safety Lab owns (those are recorded in History, never taken in).
//   decide()                  Accept / Reject a set of lines, signed, with a reason; applies through the tool.
//   the page                  Connections | Incoming changes | Ready to send | Mapping | History (switchTab('conn')).
//   the sign-in pop-up, the pill (through change_ack.js), the sign-out reminder.
//   the lock                  a row a tool owns cannot be changed in Safety Lab: change_ack.js asks lockedChange()
//                             for every finished change and puts a locked row back, saying where to change it.
// ============================================================================
(function () {
    'use strict';
    var W = (typeof window !== 'undefined') ? window : globalThis;

    var KIND = { fn: 'Function', req: 'Requirement', asm: 'Assumption', fc: 'Failure condition' };
    var KINDS = { fn: 'Functions', req: 'Requirements', asm: 'Assumptions', fc: 'Failure conditions' };
    var CHANGE = { added: 'Added', changed: 'Changed', moved: 'Moved', renamed: 'Renamed', revised: 'New revision', removed: 'Removed' };
    // every tool Safety Lab connects to, in the order the Connections page lists them
    var TOOLS = [
        { id: 'jama', label: 'Jama Connect', how: 'Jama REST API' },
        { id: 'polarion', label: 'Polarion', how: 'Polarion REST API' },
        { id: 'doors', label: 'DOORS Next', how: 'OSLC and the DOORS Next REST API' },
        { id: 'codebeamer', label: 'Codebeamer', how: 'Codebeamer REST API' },
        { id: 'cameo', label: 'Cameo (Teamwork Cloud)', how: 'Teamwork Cloud REST API' },
        { id: 'genesys', label: 'GENESYS', how: 'GENESYS REST API' }
    ];
    // what a row a tool owns may not have changed in Safety Lab, per kind (the fields the tool writes)
    var LOCKED = {
        fn: ['funcId', 'funcName', 'funcDef', 'subId', 'subName', 'subDef', 'parentSubId'],
        req: ['id', 'text', 'traceId'],
        asm: ['asmId', 'text'],
        fc: ['fcDesc', 'subId', 'severity', 'phases', 'effAc', 'effCrew', 'effPax']
    };

    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function _clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function _toast(m, t, ms) { try { if (typeof showToast === 'function') showToast(m, t || 'info', ms || 4200); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    // The framework's writes are signed decisions (an apply, a rejection, an owner change) or its own record (History):
    // they are background work for the change confirmation (change_ack.js), never "changes to confirm" a second time.
    function _bg(fn) { try { var A = W.SLChangeAck; if (A && typeof A.background === 'function') return A.background(fn); } catch (_) {} return fn(); }
    function _now() { return new Date().toISOString(); }
    // a tool's own id on the rows it wrote (Jama's rows say 'jama-live') is the same tool here
    var ALIAS = { 'jama-live': 'jama' };
    function _tid(t) { t = String(t == null ? '' : t); return ALIAS[t] || t; }
    function _toolLabel(id) { id = _tid(id); var t = TOOLS.filter(function (x) { return x.id === id; })[0]; return t ? t.label : String(id || ''); }

    // ------------------------------------------------------------------ who
    function whoAmI() {
        try { var me = W.SLAvatar && typeof W.SLAvatar.me === 'function' ? W.SLAvatar.me() : null; if (me && me.email) return me.name || me.email; } catch (_) {}
        try { var s = W._supabaseSession, u = s && s.user; if (u && u.email) return (u.user_metadata && u.user_metadata.full_name) || u.email; } catch (_) {}
        try { if (typeof Review !== 'undefined' && Review && Review.getReviewerName) { var r = Review.getReviewerName(); if (r) return r; } } catch (_) {}
        return '';
    }
    function _role() { try { var ws = (typeof getActiveWorkspace === 'function') ? getActiveWorkspace() : null; return (ws && ws.myRole) || ''; } catch (_) { return ''; } }
    // a project kept as a file has no workspace roles: whoever has the file open is its engineer and its admin
    function canSign() { var r = _role(); return r !== 'viewer'; }
    function isAdmin() { var r = _role(); return !r || r === 'owner' || r === 'admin'; }

    // ------------------------------------------------------------------ store
    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig && typeof projectConfig === 'object') ? projectConfig : null; } catch (_) { return null; } }
    function store() {
        var pc = _pc(); if (!pc) return null;
        var s = pc.connections;
        if (!s || typeof s !== 'object') { s = pc.connections = { v: 1 }; }
        if (!s.owners || typeof s.owners !== 'object') s.owners = {};
        if (!s.decisions || typeof s.decisions !== 'object') s.decisions = {};
        if (!Array.isArray(s.log)) s.log = [];
        if (!s.flagged || typeof s.flagged !== 'object') s.flagged = {};
        return s;
    }
    function _peek() { var pc = _pc(); return (pc && pc.connections && typeof pc.connections === 'object') ? pc.connections : null; }
    function log(entry) {
        var s = store(); if (!s) return null;
        var e = Object.assign({ id: 'cx-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), at: _now(), who: whoAmI() || 'Safety Lab' }, entry || {});
        s.log.push(e);
        return e;
    }

    // ------------------------------------------------------------------ owners
    function ownerOf(tool, remoteId) {
        var s = _peek(); var o = s && s.owners && s.owners[_tid(tool) + ':' + remoteId];
        return o === 'sl' ? 'sl' : 'tool';
    }
    function setOwner(tool, remoteIds, owner, why) {
        if (!isAdmin()) return { ok: false, err: 'Only an admin can change who owns a linked item.' };
        why = String(why || '').trim();
        if (!why) return { ok: false, err: 'Say why the owner changes; it is kept in History.' };
        return _bg(function () { return _setOwner(tool, remoteIds, owner, why); });
    }
    function _setOwner(tool, remoteIds, owner, why) {
        var s = store(); if (!s) return { ok: false, err: 'No project is open.' };
        tool = _tid(tool);
        var ids = (Array.isArray(remoteIds) ? remoteIds : [remoteIds]).map(String).filter(Boolean);
        var n = 0;
        ids.forEach(function (id) {
            var k = tool + ':' + id, was = s.owners[k] === 'sl' ? 'sl' : 'tool';
            if (was === owner) return;
            if (owner === 'sl') s.owners[k] = 'sl'; else delete s.owners[k];
            n++;
        });
        if (n) {
            log({ tool: tool, what: 'owner', text: 'Changed the owner of ' + n + ' linked item' + (n === 1 ? '' : 's') + ' to ' + (owner === 'sl' ? 'Safety Lab' : _toolLabel(tool)), items: ids.slice(), why: why, result: 'done' });
            _save(); _renderAll();
        }
        return { ok: true, changed: n };
    }

    // ------------------------------------------------------------------ adapters
    var _ad = {};
    function register(tool, adapter) { if (tool && adapter) { _ad[_tid(tool)] = adapter; _renderAll(); } }
    function adapter(tool) { return _ad[_tid(tool)] || null; }
    function connected() { return TOOLS.filter(function (t) { var a = _ad[t.id]; try { return !!(a && a.configured && a.configured()); } catch (_) { return false; } }); }

    // ------------------------------------------------------------------ incoming
    // Every waiting line from every tool. A rejected line stays out (until the tool changes the item again: the line's
    // key carries the tool's modified time). An edit a tool made to an item Safety Lab owns is never incoming: it is
    // recorded in History once, flagged, and the item stays as Safety Lab has it.
    function _all() {
        var out = [];
        Object.keys(_ad).forEach(function (tool) {
            var a = _ad[tool]; var list = [];
            try { list = (a.changes && a.changes()) || []; } catch (_) { list = []; }
            list.forEach(function (c) { if (c && c.key) { c.tool = _tid(c.tool || tool); out.push(c); } });
        });
        return out;
    }
    function _settled(c) {
        var s = _peek();
        if (s && s.decisions && s.decisions[c.key] && s.decisions[c.key].d === 'rejected') return 'rejected';
        if (c.remoteId != null && c.change !== 'added' && ownerOf(c.tool, c.remoteId) === 'sl') return 'owned';
        return '';
    }
    function incoming(tool) { tool = tool ? _tid(tool) : ''; return _all().filter(function (c) { return (!tool || c.tool === tool) && !_settled(c); }); }
    function rejected(tool) {
        var s = _peek(); if (!s) return [];
        tool = tool ? _tid(tool) : '';
        return _all().filter(function (c) { return (!tool || c.tool === tool) && _settled(c) === 'rejected'; }).map(function (c) { return Object.assign({}, c, { decision: s.decisions[c.key] }); });
    }
    function counts() {
        var by = {}; incoming().forEach(function (c) { by[c.tool] = (by[c.tool] || 0) + 1; });
        return by;
    }
    function pendingCount() { return incoming().length; }
    // the plain words for the pill: "4 incoming changes from Jama", "4 from Jama, 2 from Polarion"
    function pillText() {
        var by = counts(), tools = Object.keys(by);
        if (!tools.length) return '';
        var parts = tools.map(function (t, i) { return by[t] + (i === 0 ? (' incoming change' + (by[t] === 1 ? '' : 's') + ' from ') : ' from ') + _shortName(t); });
        return parts.join(', ');
    }
    function _shortName(t) { t = _tid(t); return ({ jama: 'Jama', doors: 'DOORS Next', cameo: 'Cameo' })[t] || _toolLabel(t); }

    // What a line touches in Safety Lab: the rows built on the item, in plain words.
    function touches(c) {
        try {
            var id = String(c.slId || ''); if (!id) return '';
            var sys = (c.scope && c.scope !== 'ac' && typeof systemsData !== 'undefined') ? (systemsData || []).filter(function (s) { return String(s.id) === String(c.scope); })[0] : null;
            var fha = sys ? (sys.fha || []) : ((typeof acFhaData !== 'undefined' && acFhaData) || []);
            var fcim = sys ? (sys.fcim || []) : ((typeof acFcimData !== 'undefined' && acFcimData) || []);
            var req = sys ? (sys.req || []) : ((typeof acReqData !== 'undefined' && acReqData) || []);
            var bits = [];
            if (c.kind === 'fn') {
                var nf = fha.filter(function (r) { return r && String(r.subId || r.funcId || '') === id; }).length;
                var nc = fcim.filter(function (r) { return r && String(r.subId || r.funcId || '') === id; }).length;
                var under = ((typeof acFunctionsData !== 'undefined' && !sys) ? acFunctionsData : []).filter(function (r) { return r && String(r.parentSubId || '') === id; }).length;
                if (nc) bits.push(nc + ' FCIM row' + (nc === 1 ? '' : 's'));
                if (nf) bits.push(nf + ' FHA row' + (nf === 1 ? '' : 's'));
                if (under) bits.push(under + ' function' + (under === 1 ? '' : 's') + ' under it');
            } else if (c.kind === 'fc') {
                var tr = req.filter(function (r) { return r && String(r.traceId || '') === id; }).length;
                var trees = ((typeof ftaPages !== 'undefined' && ftaPages) || []).filter(function (p) { return p && (String(p.fhaFcId || '') === id || String(p.fcId || '') === id); }).length;
                if (tr) bits.push(tr + ' requirement' + (tr === 1 ? '' : 's') + ' traced to it');
                if (trees) bits.push(trees + ' fault tree' + (trees === 1 ? '' : 's'));
            } else if (c.kind === 'req' || c.kind === 'asm') {
                var refs = fha.filter(function (r) { return r && JSON.stringify(r).indexOf('"' + id + '"') >= 0; }).length;
                if (refs) bits.push(refs + ' FHA row' + (refs === 1 ? '' : 's') + ' that cite it');
            }
            return bits.length ? bits.join(', ') : 'nothing else yet';
        } catch (_) { return ''; }
    }

    // ------------------------------------------------------------------ deciding
    // decide({ accept: [keys], reject: [keys] }, signer, reason) -> { ok, err?, applied, rejected, result }
    function decide(dec, signer, reason) {
        if (!canSign()) return { ok: false, err: 'Your role on this project can view changes but not sign them.' };
        signer = String(signer || '').trim();
        if (!signer) return { ok: false, err: 'A signature is required: type your name.' };
        reason = String(reason || '').trim();
        var acc = (dec && dec.accept) || [], rej = (dec && dec.reject) || [];
        if (!acc.length && !rej.length) return { ok: false, err: 'Nothing is chosen: accept or reject at least one change.' };
        return _bg(function () { return _decide(acc, rej, signer, reason); });
    }
    function _decide(acc, rej, signer, reason) {
        var lines = {}; _all().forEach(function (c) { lines[c.key] = c; });
        var s = store(); if (!s) return { ok: false, err: 'No project is open.' };
        // reject first: a rejected line is recorded, and never applied
        var rejDone = [];
        rej.forEach(function (k) {
            var c = lines[k]; if (!c) return;
            s.decisions[k] = { d: 'rejected', at: _now(), by: signer, why: reason, tool: c.tool, remoteId: c.remoteId == null ? null : String(c.remoteId), name: c.name, change: c.change, kind: c.kind };
            rejDone.push(c);
        });
        if (rejDone.length) {
            log({ tool: rejDone[0].tool, what: 'rejected', text: 'Rejected ' + rejDone.length + ' incoming change' + (rejDone.length === 1 ? '' : 's') + ' (kept out of the analysis; the item' + (rejDone.length === 1 ? ' is' : 's are') + ' out of step with ' + _toolLabel(rejDone[0].tool) + ')',
                  items: rejDone.map(_lineWord), why: reason, signedBy: signer, result: 'kept out' });
        }
        // accept, per tool, through that tool's own signed apply
        var byTool = {}, applied = [], results = {};
        acc.forEach(function (k) { var c = lines[k]; if (c) (byTool[c.tool] = byTool[c.tool] || []).push(c); });
        var err = '';
        Object.keys(byTool).forEach(function (tool) {
            var a = _ad[tool]; if (!a || !a.applyKeys) { err = 'No connection to ' + _toolLabel(tool) + ' is loaded.'; return; }
            var r;
            try { r = a.applyKeys(byTool[tool].map(function (c) { return c.key; }), signer); } catch (e) { r = { ok: false, err: (e && e.message) || String(e) }; }
            results[tool] = r;
            if (!r || r.ok === false) { err = (r && r.err) || 'The apply failed.'; return; }
            applied = applied.concat(byTool[tool]);
            log({ tool: tool, what: 'signed', text: 'Signed ' + byTool[tool].length + ' incoming change' + (byTool[tool].length === 1 ? '' : 's') + ' from ' + _toolLabel(tool) + ' into the analysis',
                  items: byTool[tool].map(_lineWord), why: reason, signedBy: signer, result: (r.refused && r.refused.length) ? ('applied; not placed: ' + r.refused.join(' | ')) : 'applied' });
        });
        _save(); _renderAll();
        if (err) return { ok: false, err: err, applied: applied.length, rejected: rejDone.length, results: results };
        return { ok: true, applied: applied.length, rejected: rejDone.length, results: results };
    }
    function _lineWord(c) { return (CHANGE[c.change] || c.change) + ': ' + (KIND[c.kind] || c.kind) + ' ' + (c.slId || c.extKey || c.remoteId) + (c.name ? ' ' + _clip(c.name, 60) : ''); }
    // The page panels on Functions, FCIM, FHA, Assumptions and Requirements sign through here: every line of that page
    // that is not rejected and not an edit to a Safety Lab-owned item. Same result shape as the tool's apply.
    function signLines(tool, keys, signer, why) {
        var take = {}; incoming(tool).forEach(function (c) { take[c.key] = 1; });
        var keep = (keys || []).filter(function (k) { return take[k]; });
        if (!keep.length) return { ok: false, err: 'Nothing on this page is waiting to be signed (rejected changes and edits to items Safety Lab owns are never taken in).' };
        var r = decide({ accept: keep }, signer, why || '');
        if (!r.ok) return { ok: false, err: r.err };
        var res = r.results && r.results[tool];
        return res || { ok: true, added: 0, updated: 0, flagged: 0, sys: {}, refused: [] };
    }
    // A rejected line can be taken back (it becomes incoming again), by an engineer, recorded.
    function reconsider(key, why) {
        if (!canSign()) return { ok: false, err: 'Your role on this project can view changes but not sign them.' };
        var s = store(); if (!s || !s.decisions[key]) return { ok: false, err: 'That change is not rejected.' };
        var d = s.decisions[key];
        _bg(function () { delete s.decisions[key]; log({ tool: d.tool, what: 'reconsidered', text: 'Took back a rejection: ' + (d.name || key) + ' is incoming again', why: String(why || ''), result: 'incoming' }); _save(); });
        _renderAll();
        return { ok: true };
    }
    // An item Safety Lab owns that the tool changed: recorded once per change, never taken in.
    function _flagOwnedEdits(tool, list) {
        var s = store(); if (!s) return 0;
        var n = 0, words = [];
        (list || []).forEach(function (c) {
            if (_settled(c) !== 'owned' || s.flagged[c.key]) return;
            s.flagged[c.key] = _now(); n++; words.push(_lineWord(c));
        });
        if (n) log({ tool: tool, what: 'flagged', text: _toolLabel(tool) + ' changed ' + n + ' item' + (n === 1 ? '' : 's') + ' Safety Lab owns. Not taken in: Safety Lab is the owner. Send Safety Lab’s version from Ready to send, or change the owner in Mapping.', items: words, result: 'not taken in' });
        return n;
    }
    // A tool's check finished (adapters call this).
    function checked(tool, list, silent) {
        tool = _tid(tool);
        var flagged = 0, n = 0;
        _bg(function () {
        flagged = _flagOwnedEdits(tool, list || []);
        n = incoming(tool).length;
        log({ tool: tool, what: 'check', text: 'Checked ' + _toolLabel(tool) + ': ' + n + ' change' + (n === 1 ? '' : 's') + ' waiting' + (flagged ? ', ' + flagged + ' edit' + (flagged === 1 ? '' : 's') + ' to Safety Lab-owned items flagged' : ''), result: n ? 'waiting' : 'in step' });
        _save();
        });
        _renderAll();
        // the pop-up shows once after a project opens (the first check that finds something), never again until it is
        // reopened or someone presses Later; after that the pill carries what is waiting
        try { _maybePopup('check'); } catch (_) {}
    }

    // ------------------------------------------------------------------ the lock
    // change_ack.js asks for every finished change: { col, key, before, after } records. A row a tool owns and whose
    // owned fields changed is put back, and the person is told where to change it.
    var STORE_KIND = { acFunctionsData: ['fn', 'fnSource'], acReqData: ['req', 'reqSource'], acAssumptionsData: ['asm', 'asmSource'], acFhaData: ['fc', 'fcSource'] };
    function lockedFields(row, kind) {
        if (!row) return [];
        var srcKey = ({ fn: 'fnSource', req: 'reqSource', asm: 'asmSource', fc: 'fcSource' })[kind];
        var s = row[srcKey];
        if (!s || !s.tool || s.remoteId == null) return [];
        if (ownerOf(_tid(s.tool), s.remoteId) === 'sl') return [];
        return (LOCKED[kind] || []).slice();
    }
    function lockOf(row, kind) {
        var f = lockedFields(row, kind); if (!f.length) return null;
        var s = row[({ fn: 'fnSource', req: 'reqSource', asm: 'asmSource', fc: 'fcSource' })[kind]];
        return { tool: _tid(s.tool), toolLabel: _toolLabel(s.tool), remoteId: String(s.remoteId), extKey: s.key || s.reqifId || '', fields: f };
    }
    // before/after: the row as it was and as it is now; returns the fields put back ([] when none)
    function guardRow(kind, before, after) {
        if (!before || !after) return [];
        var f = lockedFields(before, kind); if (!f.length) return [];
        var back = [];
        f.forEach(function (k) {
            var a = JSON.stringify(before[k] === undefined ? null : before[k]), b = JSON.stringify(after[k] === undefined ? null : after[k]);
            if (a !== b) { if (before[k] === undefined) delete after[k]; else after[k] = JSON.parse(JSON.stringify(before[k])); back.push(k); }
        });
        return back;
    }
    // the stores a guard runs over, for change_ack.js
    function lockedStores() { return Object.keys(STORE_KIND).map(function (k) { return { store: k, kind: STORE_KIND[k][0] }; }); }

    // ------------------------------------------------------------------ the page
    var _tab = 'main', _sel = {}, _filters = { tools: {}, kinds: { added: 1, changed: 1, removed: 1 } };
    function _host() { try { return document.getElementById('conn-host'); } catch (_) { return null; } }
    function _btn(label, js, kind, extra) {
        var cls = 'ckpt-m-btn' + (kind === 'primary' ? ' ckpt-m-btn-primary' : '');
        var st = kind === 'danger' ? ' style="color:var(--color-danger); border-color:var(--color-danger);"' : '';
        return '<button type="button" class="' + cls + '"' + st + (extra || '') + ' onclick="' + js + '">' + label + '</button>';
    }
    function _nav() {
        var n = pendingCount(), out = sendCount();
        var tabs = [['main', 'Connections', 0], ['in', 'Incoming changes', n], ['out', 'Ready to send', out], ['map', 'Mapping', 0], ['hist', 'History', 0]];
        return '<nav class="cx-nav" aria-label="Connections">' + tabs.map(function (t) {
            return '<button type="button" class="cx-tab' + (_tab === t[0] ? ' on' : '') + '" onclick="SLConnections.show(\'' + t[0] + '\')">' + t[1] +
                (t[2] ? ' <span class="cx-badge' + (t[0] === 'out' ? ' dark' : '') + '">' + t[2] + '</span>' : '') + '</button>';
        }).join('') + '</nav>';
    }
    function _head(h, p, right) {
        return '<div class="cx-head"><div><h3>' + h + '</h3><p>' + p + '</p></div>' + (right || '') + '</div>';
    }
    function _ago(iso) {
        if (!iso) return 'not checked yet';
        var t = Date.parse(iso); if (!isFinite(t)) return '';
        var d = Date.now() - t;
        if (d < 60000) return 'checked just now';
        if (d < 3600000) return 'checked ' + Math.round(d / 60000) + ' min ago';
        if (d < 86400000) return 'checked ' + Math.round(d / 3600000) + ' h ago';
        return 'checked ' + new Date(t).toISOString().slice(0, 10);
    }
    function _drawMain() {
        var html = _head('Connections', 'Tools this project is linked with. Every linked item has one owner: changes from the owning tool wait in Incoming changes for an engineer to sign, and changes to items Safety Lab owns wait in Ready to send until an engineer sends them. Calculated results, signatures and history never cross.');
        var on = connected().map(function (t) { return t.id; });
        TOOLS.forEach(function (t) {
            var a = _ad[t.id];
            if (on.indexOf(t.id) < 0) return;
            var linked = []; try { linked = (a.linkedRows && a.linkedRows()) || []; } catch (_) {}
            var slOwn = linked.filter(function (r) { return ownerOf(t.id, r.remoteId) === 'sl'; }).length;
            var toolOwn = linked.length - slOwn;
            var nIn = incoming(t.id).length, nOut = sendCount(t.id);
            var warn = []; try { warn = (a.warnings && a.warnings()) || []; } catch (_) {}
            html += '<section class="cx-card"><div class="cx-row"><h4>' + _esc(t.label) + '</h4><span class="cx-pill ok">Connected</span><span class="cx-dim">' + _esc((a.where && a.where()) || '') + '</span><span class="cx-dim cx-right">' + _esc(_ago(a.checkedAt && a.checkedAt())) + '</span></div>' +
                '<div class="cx-tiles">' +
                '<div class="cx-tile"><b>' + _esc(_shortName(t.id)) + ' owns</b><span class="cx-big">' + toolOwn + ' linked item' + (toolOwn === 1 ? '' : 's') + '</span><span class="cx-dim">Locked in Safety Lab.</span></div>' +
                '<div class="cx-tile"><b>Safety Lab owns</b><span class="cx-big">' + slOwn + ' linked item' + (slOwn === 1 ? '' : 's') + '</span><span class="cx-dim">Edited here, sent to ' + _esc(_shortName(t.id)) + '.</span></div>' +
                '<button type="button" class="cx-tile cx-link" onclick="SLConnections.show(\'in\')"><b>Waiting to come in</b><span class="cx-big">' + nIn + ' change' + (nIn === 1 ? '' : 's') + '</span><span class="cx-dim">Review and sign in Incoming changes</span></button>' +
                '<button type="button" class="cx-tile cx-link" onclick="SLConnections.show(\'out\')"><b>Waiting to go out</b><span class="cx-big">' + nOut + ' change' + (nOut === 1 ? '' : 's') + '</span><span class="cx-dim">Check and send in Ready to send</span></button>' +
                '</div>' +
                (a.held && a.held() ? '<div class="cx-warn">Nothing from ' + _esc(t.label) + ' is staged until each kind of item under what you chose is said what it is: answer it in Mapping.</div>' : '') +
                (warn.length ? '<div class="cx-warn">' + warn.slice(0, 4).map(_esc).join('<br>') + (warn.length > 4 ? '<br>and ' + (warn.length - 4) + ' more' : '') + '</div>' : '') +
                '<div class="cx-row cx-gap">' + _btn('Check now', 'SLConnections.checkNow(\'' + t.id + '\')') + _btn('Linked items and owners', 'SLConnections.show(\'map\')') + _btn('Connection settings', 'SLConnections.setup(\'' + t.id + '\')') + '</div>' +
                '</section>';
        });
        var off = TOOLS.filter(function (t) { return on.indexOf(t.id) < 0; });
        html += '<section class="cx-card"><h4>Not connected</h4><div class="cx-grid">' + off.map(function (t) {
            var ready = !!_ad[t.id];
            return '<div class="cx-off"><b>' + _esc(t.label) + '</b><span class="cx-dim">' + _esc(t.how) + '</span>' + (ready ? _btn('Connect', 'SLConnections.setup(\'' + t.id + '\')', 'primary') : '<span class="cx-dim">coming in this release</span>') + '</div>';
        }).join('') + '</div><p class="cx-dim">No live connection allowed by your IT? ReqIF and XMI files still work from Requirements exchange and Architecture import.</p></section>';
        return html;
    }
    function _kv(o) {
        var ks = Object.keys(o || {}); if (!ks.length) return '<span class="cx-dim">(nothing)</span>';
        return ks.map(function (k) { return '<div><span class="cx-dim">' + _esc(k) + ':</span> ' + _esc(_clip(o[k], 400)) + '</div>'; }).join('');
    }
    function _lineHtml(c, i, opts) {
        var ch = c.change, cls = ch === 'removed' ? 'red' : (ch === 'added' ? 'ok' : 'wait');
        var cur = _sel[c.key] || '';
        var name = 'cxd-' + i;
        var radios = opts && opts.readOnly ? '' : ('<div class="cx-choose" role="radiogroup" aria-label="Decision">' +
            ['accept', 'reject', 'later'].map(function (d) {
                return '<label class="cx-radio"><input type="radio" name="' + name + '" value="' + d + '"' + (cur === d ? ' checked' : '') + ' onchange="SLConnections.choose(\'' + _esc(c.key).replace(/'/g, '\\\'') + '\', \'' + d + '\')"> ' + ({ accept: 'Accept', reject: 'Reject', later: 'Later' })[d] + '</label>';
            }).join('') + '</div>');
        var ba = (ch === 'added' || ch === 'removed') ? ('<div class="cx-ba1">' + _kv(ch === 'added' ? c.after : c.before) + '</div>')
            : ('<div class="cx-ba"><div class="cx-was"><b>In Safety Lab now</b>' + _kv(c.before) + '</div><div class="cx-now"><b>New in ' + _esc(_shortName(c.tool)) + '</b>' + _kv(c.after) + '</div></div>');
        var t = touches(c);
        return '<article class="cx-line" data-key="' + _esc(c.key) + '">' +
            '<div class="cx-row"><span class="cx-pill ' + cls + '">' + _esc(CHANGE[ch] || ch) + '</span><span class="cx-pill tool">' + _esc(_shortName(c.tool)) + '</span>' +
            '<b>' + _esc((KIND[c.kind] || c.kind) + ' ' + (c.slId || c.extKey || '')) + '</b><span>' + _esc(_clip(c.name, 120)) + '</span>' +
            '<span class="cx-dim cx-right">' + _esc(c.scopeName || '') + (c.extKey ? ' · ' + _esc(_shortName(c.tool)) + ' ' + _esc(c.extKey) : '') + '</span></div>' +
            (c.fields && c.fields.length ? '<div class="cx-dim">What changed: ' + _esc(c.fields.join(', ')) + '</div>' : '') +
            (c.why ? '<div class="cx-dim">' + _esc(c.why) + '</div>' : '') +
            ba +
            (ch === 'removed' ? '<div class="cx-note">Accepting marks it as no longer in ' + _esc(_shortName(c.tool)) + '. Nothing in Safety Lab is deleted.</div>' : '') +
            (t ? '<div class="cx-touch"><b>What it touches in Safety Lab:</b> ' + _esc(t) + '</div>' : '') +
            radios + '</article>';
    }
    function _signBar(where) {
        var n = 0, a = 0, r = 0;
        Object.keys(_sel).forEach(function (k) { if (_sel[k] === 'accept') a++; else if (_sel[k] === 'reject') r++; });
        n = a + r;
        var me = whoAmI();
        if (!canSign()) return '<section class="cx-sign"><b>Your role on this project can view these changes but not sign them.</b></section>';
        return '<section class="cx-sign" id="cx-sign-' + where + '"><div class="cx-grow"><b>Sign ' + a + ' accepted and ' + r + ' rejected</b><div class="cx-dim">Accepted changes enter the analysis only when you sign. Rejected ones stay out, recorded, and the item shows as out of step until it changes again. Later leaves a change waiting.</div></div>' +
            '<label class="cx-lab">Your name<input type="text" class="cx-by" value="' + _esc(me) + '" placeholder="Type your name to sign"></label>' +
            '<label class="cx-lab cx-grow">Reason (kept in History)<input type="text" class="cx-why" placeholder="e.g. Reviewed against the flight controls ICD rev F"></label>' +
            _btn('Sign', 'SLConnections.signUi(\'' + where + '\')', 'primary', n ? '' : ' disabled') + '<div class="cx-err" role="alert"></div></section>';
    }
    function _drawIn() {
        var all = incoming();
        var tools = {}; all.forEach(function (c) { tools[c.tool] = (tools[c.tool] || 0) + 1; });
        var shown = all.filter(function (c) {
            if (_filters.tools[c.tool] === 0) return false;
            var g = (c.change === 'added') ? 'added' : (c.change === 'removed' ? 'removed' : 'changed');
            return !!_filters.kinds[g];
        });
        var html = _head('Incoming changes', 'Changes found in tools that own the linked item. Nothing here is in your analysis yet. An engineer accepts or rejects each one and signs.',
            _btn('Check all tools now', 'SLConnections.checkNow()'));
        html += '<div class="cx-card cx-row cx-gap"><b>Show</b>' + Object.keys(tools).map(function (t) {
            return '<label class="cx-radio"><input type="checkbox"' + (_filters.tools[t] === 0 ? '' : ' checked') + ' onchange="SLConnections.filter(\'tool\', \'' + t + '\', this.checked)"> ' + _esc(_toolLabel(t)) + ' (' + tools[t] + ')</label>';
        }).join('') + '<span class="cx-dim">|</span>' + [['added', 'Added'], ['changed', 'Changed or moved'], ['removed', 'Removed']].map(function (k) {
            return '<label class="cx-radio"><input type="checkbox"' + (_filters.kinds[k[0]] ? ' checked' : '') + ' onchange="SLConnections.filter(\'kind\', \'' + k[0] + '\', this.checked)"> ' + k[1] + '</label>';
        }).join('') + (shown.length ? '<span class="cx-right">' + _btn('Accept all shown', 'SLConnections.chooseAll(\'accept\')') + ' ' + _btn('Reject all shown', 'SLConnections.chooseAll(\'reject\')') + '</span>' : '') + '</div>';
        if (!all.length) html += '<div class="cx-card cx-dim">Nothing is waiting. Every linked item is in step with its owner.</div>';
        html += shown.map(function (c, i) { return _lineHtml(c, i); }).join('');
        if (all.length) html += _signBar('page');
        var rj = rejected();
        if (rj.length) html += '<details class="cx-card"><summary><b>Rejected and out of step (' + rj.length + ')</b></summary>' + rj.map(function (c) {
            var d = c.decision || {};
            return '<div class="cx-row cx-gap"><span class="cx-pill red">Rejected</span><span>' + _esc(_lineWord(c)) + '</span><span class="cx-dim">by ' + _esc(d.by || '') + ' ' + _esc(String(d.at || '').slice(0, 10)) + (d.why ? ': ' + _esc(d.why) : '') + '</span>' +
                (canSign() ? '<span class="cx-right">' + _btn('Take back', 'SLConnections.reconsiderUi(\'' + _esc(c.key).replace(/'/g, '\\\'') + '\')') + '</span>' : '') + '</div>';
        }).join('') + '</details>';
        return html;
    }
    function _drawMap() {
        var html = _head('Mapping', 'For each connected tool: which items are linked, who owns each one, and what each kind of item is in Safety Lab.');
        var on = connected();
        if (!on.length) return html + '<div class="cx-card cx-dim">No tool is connected yet. Connect one on the Connections tab.</div>';
        on.forEach(function (t) {
            var a = _ad[t.id]; var rows = []; try { rows = (a.linkedRows && a.linkedRows()) || []; } catch (_) {}
            html += '<section class="cx-card"><div class="cx-row"><h4>' + _esc(t.label) + '</h4><span class="cx-right">' + (a.browse ? _btn('Choose what is linked', 'SLConnections.browse(\'' + t.id + '\')') : '') + '</span></div>' +
                '<div class="cx-dim">The owner is the only place the item can be edited. If ' + _esc(_shortName(t.id)) + ' owns it, it is locked in Safety Lab and ' + _esc(_shortName(t.id)) + '’s changes wait in Incoming changes. If Safety Lab owns it, it is edited here, Safety Lab’s changes wait in Ready to send, and edits someone makes to it in ' + _esc(_shortName(t.id)) + ' are not taken in: they are flagged in History. Changing an owner needs an admin and a reason, and is kept in History.</div>';
            var sendHtml = ''; try { sendHtml = (a.sendSettingsHtml && a.sendSettingsHtml()) || ''; } catch (_) {}
            if (!rows.length) { html += '<div class="cx-dim">Nothing from ' + _esc(t.label) + ' is linked yet. Choose what is linked, then check and sign it in.</div>' + sendHtml + '</section>'; return; }
            var q = String(_mapQ || '').toLowerCase();
            var list = rows.filter(function (r) { return !q || (r.slId + ' ' + r.name + ' ' + r.extKey).toLowerCase().indexOf(q) >= 0; });
            html += '<div class="cx-row cx-gap"><input type="search" class="cx-search" placeholder="Find an item" value="' + _esc(_mapQ) + '" oninput="SLConnections.mapFind(this.value)">' +
                (isAdmin() ? '<span class="cx-dim">For selected:</span>' + _btn('Owner: ' + _esc(_shortName(t.id)), 'SLConnections.ownerUi(\'' + t.id + '\', \'tool\')') + _btn('Owner: Safety Lab', 'SLConnections.ownerUi(\'' + t.id + '\', \'sl\')') : '<span class="cx-dim">Only an admin can change owners.</span>') + '</div>';
            html += '<div class="cx-scroll"><table class="cx-table"><thead><tr><th></th><th>Safety Lab item</th><th>' + _esc(_shortName(t.id)) + ' item</th><th>Kind</th><th>Where</th><th>Owner</th><th>Status</th></tr></thead><tbody>' +
                list.map(function (r) {
                    var own = ownerOf(t.id, r.remoteId);
                    var waitIn = incoming(t.id).filter(function (c) { return String(c.remoteId) === String(r.remoteId); }).length;
                    var st = r.missing ? '<span class="cx-pill red">Not in ' + _esc(_shortName(t.id)) + '</span>' : (waitIn ? '<span class="cx-pill wait">' + waitIn + ' waiting in</span>' : '<span class="cx-pill ok">In step</span>');
                    var oos = rejected(t.id).some(function (c) { return String(c.remoteId) === String(r.remoteId); });
                    if (oos) st += ' <span class="cx-pill red">Out of step</span>';
                    return '<tr><td><input type="checkbox" class="cx-mapsel" data-id="' + _esc(r.remoteId) + '" aria-label="Select"></td><td><b>' + _esc(r.slId) + '</b> ' + _esc(_clip(r.name, 80)) + '</td><td>' + _esc(r.extKey || r.remoteId) + '</td><td>' + _esc(KIND[r.kind] || r.kind) + '</td><td>' + _esc(r.scope === 'ac' ? 'Aircraft' : _sysName(r.scope)) + '</td><td>' + (own === 'sl' ? '<span class="cx-pill ok">Safety Lab</span>' : '<span class="cx-pill tool">' + _esc(_shortName(t.id)) + '</span>') + '</td><td>' + st + '</td></tr>';
                }).join('') + '</tbody></table></div>' +
                '<div class="cx-dim">' + list.length + ' of ' + rows.length + ' linked item' + (rows.length === 1 ? '' : 's') + '.</div>' + sendHtml + '</section>';
        });
        return html;
    }
    var _mapQ = '';
    function _sysName(id) { try { var s = (systemsData || []).filter(function (x) { return String(x.id) === String(id); })[0]; return (s && s.name) || String(id); } catch (_) { return String(id); } }
    var _histQ = '', _histTool = '', _histWhat = '';
    function _drawHist() {
        var s = _peek(); var lg = ((s && s.log) || []).slice().reverse();
        var html = _head('History', 'Every check, signature, rejection, send and owner change, for every connected tool. Kept with the project; it cannot be edited.', _btn('Export for an audit (CSV)', 'SLConnections.exportCsv()'));
        var tools = {}; lg.forEach(function (e) { if (e.tool) tools[e.tool] = 1; });
        html += '<div class="cx-card cx-row cx-gap"><label class="cx-lab cx-grow">Search<input type="search" value="' + _esc(_histQ) + '" placeholder="Item, key or person" oninput="SLConnections.histFind(this.value)"></label>' +
            '<label class="cx-lab">Tool<select onchange="SLConnections.histTool(this.value)"><option value="">All tools</option>' + Object.keys(tools).map(function (t) { return '<option value="' + t + '"' + (_histTool === t ? ' selected' : '') + '>' + _esc(_toolLabel(t)) + '</option>'; }).join('') + '</select></label>' +
            '<label class="cx-lab">What<select onchange="SLConnections.histWhat(this.value)">' + [['', 'Everything'], ['signed', 'Signed in'], ['sent', 'Sent out'], ['rejected', 'Rejected or flagged'], ['owner', 'Owner and setup changes'], ['check', 'Checks']].map(function (o) { return '<option value="' + o[0] + '"' + (_histWhat === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></div>';
        var q = _histQ.toLowerCase();
        var list = lg.filter(function (e) {
            if (_histTool && e.tool !== _histTool) return false;
            if (_histWhat === 'rejected' && !(e.what === 'rejected' || e.what === 'flagged' || e.what === 'conflict')) return false;
            if (_histWhat && _histWhat !== 'rejected' && e.what !== _histWhat && !(_histWhat === 'owner' && (e.what === 'connect' || e.what === 'reconsidered'))) return false;
            return !q || JSON.stringify(e).toLowerCase().indexOf(q) >= 0;
        });
        html += '<section class="cx-card"><div class="cx-scroll"><table class="cx-table"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Items</th><th>Result</th></tr></thead><tbody>' +
            (list.length ? list.map(function (e) {
                return '<tr><td class="cx-nowrap">' + _esc(String(e.at || '').replace('T', ' ').slice(0, 16)) + '</td><td>' + _esc(e.signedBy || e.who || '') + '</td><td>' + _esc(e.text || e.what) + (e.why ? '<div class="cx-dim">Reason: ' + _esc(e.why) + '</div>' : '') + '</td><td>' + _esc((e.items || []).slice(0, 6).join('; ')) + ((e.items || []).length > 6 ? ' and ' + (e.items.length - 6) + ' more' : '') + '</td><td>' + _esc(e.result || '') + '</td></tr>';
            }).join('') : '<tr><td colspan="5" class="cx-dim">Nothing recorded yet.</td></tr>') + '</tbody></table></div></section>';
        return html;
    }
    function _draw() {
        var host = _host(); if (!host) return;
        var body = _tab === 'in' ? _drawIn() : (_tab === 'out' ? _drawOut() : (_tab === 'map' ? _drawMap() : (_tab === 'hist' ? _drawHist() : _drawMain())));
        host.innerHTML = _nav() + '<div class="cx-body">' + body + '</div>';
    }
    function _visible() { try { var v = document.getElementById('view-conn'); return !!(v && v.style.display !== 'none'); } catch (_) { return false; } }
    function _renderAll() {
        try { if (_visible()) _draw(); } catch (_) {}
        try { if (W.SLChangeAck && typeof W.SLChangeAck.refreshBar === 'function') W.SLChangeAck.refreshBar(); } catch (_) {}
        try { var b = document.getElementById('snav-conn'); if (b) { var n = pendingCount(); var lbl = b.querySelector('.asb-lbl'); if (lbl) lbl.setAttribute('data-count', n ? String(n) : ''); } } catch (_) {}
    }
    function show(tab) {
        if (tab) _tab = tab;
        try { if (!_visible() && typeof W.switchTab === 'function') { W.switchTab('conn'); return; } } catch (_) {}
        _draw();
    }

    // ------------------------------------------------------------------ outgoing (Ready to send)
    // Each adapter that can send gives outgoing() lines; the framework shows them, signs and sends.
    function outgoing(tool) {
        tool = tool ? _tid(tool) : '';
        var out = [];
        Object.keys(_ad).forEach(function (t) {
            if (tool && t !== tool) return;
            var a = _ad[t]; if (!a || !a.outgoing) return;
            try { (a.outgoing() || []).forEach(function (o) { if (o && o.key) { o.tool = _tid(o.tool || t); out.push(o); } }); } catch (_) {}
        });
        return out;
    }
    function sendCount(tool) { return outgoing(tool).length; }
    var _outSel = {};
    function _drawOut() {
        var all = outgoing();
        var html = _head('Ready to send', 'Changes to linked items Safety Lab owns, and items chosen to send. Nothing leaves until an engineer picks the changes and sends them.');
        if (!all.length) html += '<div class="cx-card cx-dim">Nothing is waiting to go out. Items Safety Lab owns are in step with every connected tool.</div>';
        else {
            html += '<section class="cx-card"><div class="cx-scroll"><table class="cx-table"><thead><tr><th></th><th>Kind</th><th>Safety Lab item</th><th>Goes to</th><th>What will change there</th><th>In that tool now</th></tr></thead><tbody>' +
                all.map(function (o) {
                    var on = _outSel[o.key] !== false;
                    return '<tr><td><input type="checkbox"' + (on ? ' checked' : '') + ' onchange="SLConnections.outPick(\'' + _esc(o.key).replace(/'/g, '\\\'') + '\', this.checked)" aria-label="Send"></td><td><span class="cx-pill ' + (o.change === 'new' ? 'ok' : (o.change === 'removed' ? 'red' : 'wait')) + '">' + _esc(({ new: 'New', changed: 'Changed', removed: 'Removed' })[o.change] || o.change) + '</span></td><td><b>' + _esc(o.slId) + '</b> ' + _esc(_clip(o.name, 80)) + '</td><td>' + _esc(_toolLabel(o.tool)) + '</td><td>' + _kv(o.after) + '</td><td class="cx-dim">' + _esc(o.there || '') + '</td></tr>';
                }).join('') + '</tbody></table></div></section>' +
                '<section class="cx-note-card"><b>If someone changed it in the tool since</b><div>Safety Lab checks each item just before sending. If the tool’s copy changed after the last exchange, that item is held back and shown side by side, so nobody’s work is overwritten.</div></section>' +
                '<section class="cx-card cx-dim"><b>Never sent:</b> calculated results (probabilities, cut sets, allocation), signatures and review history. Only the fields set in Mapping for items Safety Lab owns.</section>';
            var n = all.filter(function (o) { return _outSel[o.key] !== false; }).length;
            html += canSign() ? ('<section class="cx-sign"><div class="cx-grow"><b>Send ' + n + ' change' + (n === 1 ? '' : 's') + '</b><div class="cx-dim">Your name and reason go into History and into the change comment in the tool.</div></div>' +
                '<label class="cx-lab">Your name<input type="text" class="cx-by" value="' + _esc(whoAmI()) + '"></label><label class="cx-lab cx-grow">Reason<input type="text" class="cx-why" placeholder="e.g. FHA review 3 outcome"></label>' +
                _btn('Sign and send', 'SLConnections.sendUi()', 'primary', n ? '' : ' disabled') + '<div class="cx-err" role="alert"></div></section>') : '<section class="cx-sign"><b>Your role on this project can view these changes but not send them.</b></section>';
        }
        return html;
    }
    async function send(keys, signer, reason) {
        if (!canSign()) return { ok: false, err: 'Your role on this project can view changes but not send them.' };
        signer = String(signer || '').trim(); if (!signer) return { ok: false, err: 'A signature is required: type your name.' };
        var lines = {}; outgoing().forEach(function (o) { lines[o.key] = o; });
        var byTool = {}; (keys || []).forEach(function (k) { var o = lines[k]; if (o) (byTool[o.tool] = byTool[o.tool] || []).push(o); });
        var res = { ok: true, sent: 0, held: [], failed: [] };
        for (var t in byTool) {
            var a = _ad[t]; if (!a || !a.send) { res.failed.push(_toolLabel(t) + ': this connection cannot send yet'); continue; }
            var r;
            try { r = await a.send(byTool[t], signer, reason); } catch (e) { r = { ok: false, err: (e && e.message) || String(e) }; }
            if (!r || r.ok === false) { res.failed.push(_toolLabel(t) + ': ' + ((r && r.err) || 'send failed')); continue; }
            res.sent += r.sent || 0;
            (r.held || []).forEach(function (h) { res.held.push(h); });
            (r.failed || []).forEach(function (f) { res.failed.push(f); });
            _bg(function () { log({ tool: t, what: 'sent', text: 'Sent ' + (r.sent || 0) + ' change' + ((r.sent || 0) === 1 ? '' : 's') + ' to ' + _toolLabel(t) + ((r.held || []).length ? '; held back ' + r.held.length + ' changed in ' + _shortName(t) + ' since' : '') + ((r.failed || []).length ? '; ' + r.failed.length + ' failed' : ''),
                  items: (r.items || byTool[t].map(function (o) { return o.slId + ' ' + _clip(o.name, 50); })), why: reason, signedBy: signer, result: (r.failed && r.failed.length) ? 'partly sent' : (r.sent ? 'sent' : 'held') });
            (r.held || []).forEach(function (h) { log({ tool: t, what: 'conflict', text: 'Held back: ' + h, result: 'held' }); }); _save(); });
        }
        if (res.failed.length) res.ok = res.sent > 0;
        _save(); _renderAll();
        return res;
    }

    // ------------------------------------------------------------------ the pop-up (sign-in, and after a check)
    var _popShown = false, _popLater = false;
    function _maybePopup(why) {
        if (_popLater || !canSign()) return;
        var n = pendingCount(); if (!n) return;
        if (why === 'check' && _popShown) return;
        openPopup();
    }
    function openPopup() {
        var list = incoming(); if (!list.length) return;
        _popShown = true;
        var d = document; var old = d.getElementById('cx-pop'); if (old) old.remove();
        var ov = d.createElement('div'); ov.id = 'cx-pop'; ov.className = 'cx-pop'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'cx-pop-h');
        var by = counts();
        var big = list.length > 25;
        var head = Object.keys(by).map(function (t) { return by[t] + ' from ' + _toolLabel(t); }).join(', ');
        var body;
        if (big) {
            var g = { added: 0, changed: 0, removed: 0 };
            list.forEach(function (c) { var k = c.change === 'added' ? 'added' : (c.change === 'removed' ? 'removed' : 'changed'); g[k]++; });
            body = '<p>' + list.length + ' changes: ' + g.added + ' added, ' + g.changed + ' changed or moved, ' + g.removed + ' removed. That is too many to decide here: review them in Incoming changes.</p>';
        } else {
            body = list.map(function (c, i) { return _lineHtml(c, 1000 + i); }).join('');
        }
        ov.innerHTML = '<div class="cx-pop-card"><h3 id="cx-pop-h">Changes came in from your connected tools</h3><p class="cx-dim">' + _esc(head) + '. None of them is in your analysis until an engineer accepts it and signs.</p>' +
            (big ? '' : '<div class="cx-row cx-gap">' + _btn('Accept all', 'SLConnections.chooseAll(\'accept\', true)') + _btn('Reject all', 'SLConnections.chooseAll(\'reject\', true)') + '</div>') +
            '<div class="cx-pop-list">' + body + '</div>' +
            (big ? '' : _signBar('pop')) +
            '<div class="cx-row cx-gap cx-pop-foot">' + _btn('Review in detail', 'SLConnections.popDetail()') + '<span class="cx-right">' + _btn('Later', 'SLConnections.popLater()') + '</span></div></div>';
        d.body.appendChild(ov);
        try { var f = ov.querySelector('input,button'); if (f) f.focus(); } catch (_) {}
    }
    function popClose() { var p = document.getElementById('cx-pop'); if (p) p.remove(); }

    // ------------------------------------------------------------------ the sign-out reminder
    // save_state / the sign-out path ask this before signing out or closing: resolves true to carry on.
    function beforeLeave(what) {
        return new Promise(function (resolve) {
            var n = sendCount(); if (!n || !canSign()) { resolve(true); return; }
            var d = document; var old = d.getElementById('cx-leave'); if (old) old.remove();
            var ov = d.createElement('div'); ov.id = 'cx-leave'; ov.className = 'cx-pop'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
            var list = outgoing();
            ov.innerHTML = '<div class="cx-pop-card"><h3>' + n + ' change' + (n === 1 ? '' : 's') + ' not sent yet</h3><p class="cx-dim">These are changes to items Safety Lab owns that the connected tools do not have yet.</p><ul>' +
                list.slice(0, 8).map(function (o) { return '<li>' + _esc(o.slId + ' ' + _clip(o.name, 60)) + ' to ' + _esc(_toolLabel(o.tool)) + '</li>'; }).join('') + (list.length > 8 ? '<li>and ' + (list.length - 8) + ' more</li>' : '') + '</ul>' +
                '<div class="cx-row cx-gap">' + _btn('Review and send now', 'SLConnections._leave(\'send\')', 'primary') + '<span class="cx-right">' + _btn(what === 'close the window' ? 'Close anyway' : (what === 'sign out' ? 'Sign out anyway' : 'Continue anyway'), 'SLConnections._leave(\'go\')') + '</span></div></div>';
            d.body.appendChild(ov);
            _leaveResolve = resolve;
        });
    }
    var _leaveResolve = null;
    function _leave(how) {
        var p = document.getElementById('cx-leave'); if (p) p.remove();
        var r = _leaveResolve; _leaveResolve = null;
        if (how === 'send') { show('out'); if (r) r(false); return; }
        if (r) r(true);
    }

    // ------------------------------------------------------------------ UI handlers
    var api = {
        TOOLS: TOOLS, register: register, adapter: adapter, connected: connected,
        store: store, ownerOf: ownerOf, setOwner: setOwner,
        incoming: incoming, rejected: rejected, counts: counts, pendingCount: pendingCount, pillText: pillText, touches: touches,
        decide: decide, signLines: signLines, reconsider: reconsider, checked: checked,
        outgoing: outgoing, sendCount: sendCount, send: send,
        lockOf: lockOf, lockedFields: lockedFields, guardRow: guardRow, lockedStores: lockedStores,
        canSign: canSign, isAdmin: isAdmin, whoAmI: whoAmI, log: log,
        openPopup: openPopup, beforeLeave: beforeLeave, _leave: _leave,
        show: show, render: _renderAll,
        choose: function (key, d) { if (d === 'later') delete _sel[key]; else _sel[key] = d; try { document.querySelectorAll('.cx-sign').forEach(function (el) { el.outerHTML = _signBar(el.id === 'cx-sign-pop' ? 'pop' : 'page'); }); } catch (_) {} },
        chooseAll: function (d, inPop) {
            var list = inPop ? incoming() : incoming().filter(function (c) { if (_filters.tools[c.tool] === 0) return false; var g = (c.change === 'added') ? 'added' : (c.change === 'removed' ? 'removed' : 'changed'); return !!_filters.kinds[g]; });
            list.forEach(function (c) { _sel[c.key] = d; });
            if (inPop) openPopup(); else _draw();
        },
        filter: function (what, k, on) { if (what === 'tool') _filters.tools[k] = on ? 1 : 0; else _filters.kinds[k] = on ? 1 : 0; _draw(); },
        signUi: function (where) {
            var box = document.getElementById('cx-sign-' + where); if (!box) return;
            var by = (box.querySelector('.cx-by') || {}).value || '', why = (box.querySelector('.cx-why') || {}).value || '';
            var acc = [], rej = [];
            Object.keys(_sel).forEach(function (k) { if (_sel[k] === 'accept') acc.push(k); else if (_sel[k] === 'reject') rej.push(k); });
            var r = decide({ accept: acc, reject: rej }, by, why);
            var err = box.querySelector('.cx-err');
            if (!r.ok) { if (err) err.textContent = r.err; return; }
            _sel = {};
            _toast('Signed: ' + r.applied + ' accepted into the analysis, ' + r.rejected + ' rejected.', 'success', 5200);
            if (where === 'pop') { if (pendingCount()) openPopup(); else popClose(); }
            _renderAll();
        },
        reconsiderUi: async function (key) {
            var why = ''; try { why = (typeof slPrompt === 'function') ? ((await slPrompt('Why is this change being taken back? (kept in History)')) || '') : ''; } catch (_) {}
            var r = reconsider(key, why); if (!r.ok) _toast(r.err, 'warning');
        },
        popLater: function () { _popLater = true; popClose(); _renderAll(); },
        popDetail: function () { popClose(); show('in'); },
        checkNow: function (tool) {
            var ts = tool ? [tool] : connected().map(function (t) { return t.id; });
            if (!ts.length) { _toast('No tool is connected yet.', 'info'); return; }
            ts.forEach(function (t) { var a = _ad[t]; if (a && a.check) Promise.resolve(a.check(false)).catch(function (e) { _toast(_toolLabel(t) + ': ' + ((e && e.message) || e), 'error', 6000); }); });
        },
        setup: function (tool) { var a = _ad[tool]; if (a && a.setup) a.setup(); },
        browse: function (tool) { var a = _ad[tool]; if (a && a.browse) a.browse(); },
        mapFind: function (q) { _mapQ = q || ''; _draw(); try { var i = document.querySelector('#conn-host .cx-search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } catch (_) {} },
        ownerUi: async function (tool, owner) {
            var ids = Array.prototype.slice.call(document.querySelectorAll('#conn-host .cx-mapsel:checked')).map(function (x) { return x.getAttribute('data-id'); });
            if (!ids.length) { _toast('Tick the linked items first.', 'info'); return; }
            var why = ''; try { why = (typeof slPrompt === 'function') ? ((await slPrompt('Why does the owner of ' + ids.length + ' item' + (ids.length === 1 ? '' : 's') + ' change to ' + (owner === 'sl' ? 'Safety Lab' : _toolLabel(tool)) + '? (kept in History)')) || '') : ''; } catch (_) {}
            var r = setOwner(tool, ids, owner, why); if (!r.ok) _toast(r.err, 'warning', 5200); else _toast('Owner changed for ' + r.changed + ' item' + (r.changed === 1 ? '' : 's') + '.', 'success');
        },
        histFind: function (q) { _histQ = q || ''; _draw(); },
        histTool: function (t) { _histTool = t || ''; _draw(); },
        histWhat: function (w) { _histWhat = w || ''; _draw(); },
        exportCsv: function () {
            var s = _peek(); var lg = (s && s.log) || [];
            var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
            var csv = ['When,Who,Tool,What,Items,Reason,Result'].concat(lg.map(function (e) { return [e.at, e.signedBy || e.who, _toolLabel(e.tool), e.text || e.what, (e.items || []).join('; '), e.why || '', e.result || ''].map(q).join(','); })).join('\n');
            try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'connections-history.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (_) {} }, 500); } catch (_) {}
            return csv;
        },
        outPick: function (key, on) { _outSel[key] = !!on; _draw(); },
        sendUi: async function () {
            var box = document.querySelector('#conn-host .cx-sign'); if (!box) return;
            var by = (box.querySelector('.cx-by') || {}).value || '', why = (box.querySelector('.cx-why') || {}).value || '';
            var keys = outgoing().filter(function (o) { return _outSel[o.key] !== false; }).map(function (o) { return o.key; });
            var err = box.querySelector('.cx-err'); if (err) err.textContent = 'Sending...';
            var r = await send(keys, by, why);
            if (err) err.textContent = r.ok ? '' : (r.err || r.failed.join(' | '));
            _toast('Sent ' + r.sent + '.' + (r.held.length ? ' Held back ' + r.held.length + ' changed in the tool since: see History.' : '') + (r.failed.length ? ' Failed: ' + r.failed.join(' | ') : ''), r.failed.length || r.held.length ? 'warning' : 'success', 7000);
        }
    };
    W.SLConnections = api;

    // ------------------------------------------------------------------ the page in the app's navigation
    (function wrapNav() {
        if (typeof W.switchTab !== 'function' || W.switchTab._connWrapped) return;
        var orig = W.switchTab;
        var wrapped = function (tabId) {
            var r = orig.apply(this, arguments);
            try {
                var v = document.getElementById('view-conn'); if (v) v.style.display = (tabId === 'conn') ? 'block' : 'none';
                var s = document.getElementById('snav-conn'); if (s) s.classList.toggle('snav-active', tabId === 'conn');
                if (tabId === 'conn') _draw();
            } catch (_) {}
            return r;
        };
        wrapped._connWrapped = true;
        W.switchTab = wrapped;
    })();
    // the sign-in pop-up. When a project is opened (not an undo or a discard, which reload the same project), each
    // connected tool the person asked to watch is checked quietly; when a check finds changes, the pop-up lists them.
    var _openSig = null;
    function _projectSig() { try { var pc = _pc() || {}; return String((typeof projectName !== 'undefined' && projectName) || '') + '|' + String(pc.createdAt || pc.projectId || pc.id || ''); } catch (_) { return ''; } }
    function opened() {
        var sig = _projectSig();
        if (sig === _openSig) return;
        _openSig = sig; _popShown = false; _popLater = false; _sel = {};
        connected().forEach(function (t) {
            var a = _ad[t.id];
            var auto = false; try { auto = !!(a && a.autoCheck && a.autoCheck()); } catch (_) {}
            if (auto && a.check) Promise.resolve(a.check(true)).catch(function () {});
        });
        setTimeout(function () { try { _maybePopup('open'); _renderAll(); } catch (_) {} }, 1200);
    }
    api.opened = opened;
    (function wrapLoad() {
        if (typeof W._applyProjectData !== 'function' || W._applyProjectData._connWrapped) return;
        var orig = W._applyProjectData;
        var w = function () {
            var r = orig.apply(this, arguments);
            try { var ack = W.SLChangeAck; var restoring = ack && typeof ack.restoring === 'function' && ack.restoring(); if (!restoring) setTimeout(opened, 0); } catch (_) {}
            return r;
        };
        w._connWrapped = true;
        W._applyProjectData = w;
    })();
    try { if (typeof W.addEventListener === 'function') W.addEventListener('load', function () { setTimeout(function () { try { (function wrapLate() { if (typeof W._applyProjectData === 'function' && !W._applyProjectData._connWrapped) { var o = W._applyProjectData; var w2 = function () { var r = o.apply(this, arguments); try { var ack = W.SLChangeAck; if (!(ack && ack.restoring && ack.restoring())) setTimeout(opened, 0); } catch (_) {} return r; }; w2._connWrapped = true; W._applyProjectData = w2; } })(); } catch (_) {} }, 0); }); } catch (_) {}

    // ------------------------------------------------------------------ styles
    (function style() {
        if (typeof document === 'undefined' || document.getElementById('cx-style')) return;
        var st = document.createElement('style'); st.id = 'cx-style';
        st.textContent = [
            '.cx-nav{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--color-border-hair,#d6d6d2);margin:0 0 16px}',
            '.cx-tab{font:inherit;font-size:13.5px;background:none;border:none;border-bottom:2px solid transparent;padding:10px 12px;cursor:pointer;color:var(--color-text-secondary,#4a4f57);display:inline-flex;gap:6px;align-items:center}',
            '.cx-tab.on{color:var(--color-text-primary,#101216);font-weight:600;border-bottom-color:var(--color-accent,#1a6ef2)}',
            '.cx-badge{background:var(--color-accent,#1a6ef2);color:#fff;font-size:11px;font-weight:700;border-radius:10px;padding:1px 7px}.cx-badge.dark{background:#101216}',
            '.cx-body{display:flex;flex-direction:column;gap:14px;max-width:1320px}',
            '.cx-head{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}.cx-head h3{margin:0}.cx-head p{margin:4px 0 0;color:var(--color-text-secondary,#4a4f57);max-width:820px;font-size:13px}',
            '.cx-card{background:var(--color-surface,#fff);border:1px solid var(--color-border,#c9ced6);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}',
            '.cx-card h4{margin:0;font-size:16px}.cx-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.cx-gap{gap:8px}.cx-right{margin-left:auto}.cx-grow{flex:1 1 260px}',
            '.cx-dim{color:var(--color-text-secondary,#4a4f57);font-size:12.5px}.cx-nowrap{white-space:nowrap}',
            '.cx-pill{font-size:11px;font-weight:700;border-radius:10px;padding:2px 8px;white-space:nowrap;background:#ededea;color:#4a4f57}',
            '.cx-pill.ok{background:#e6f2e8;color:#1f5e2a}.cx-pill.wait{background:#fbf0dd;color:#7a4700}.cx-pill.red{background:#fbe6e4;color:#a3211a}.cx-pill.tool{background:#e8f0fb;color:#1a4fa8}',
            '.cx-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:10px}',
            '.cx-tile{font:inherit;text-align:left;align-items:flex-start;background:var(--color-surface-2,#f6f6f4);border:1px solid transparent;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;color:inherit}',
            '.cx-tile.cx-link{cursor:pointer;background:#eef4fe}.cx-tile.cx-link:hover{border-color:var(--color-accent,#1a6ef2)}.cx-big{font-size:20px;font-weight:600}',
            '.cx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px}.cx-off{border:1px solid var(--color-border-hair,#d6d6d2);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;align-items:flex-start}',
            '.cx-warn{background:#fff8ec;border:1px solid #b26a00;color:#5c3700;border-radius:8px;padding:8px 10px;font-size:12.5px}',
            '.cx-line{background:var(--color-surface,#fff);border:1px solid var(--color-border,#c9ced6);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}',
            '.cx-ba{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:8px;font-size:13px}.cx-was,.cx-now,.cx-ba1{border:1px solid var(--color-border-hair,#d6d6d2);border-radius:8px;padding:8px 10px;font-size:13px}.cx-now{border:2px solid var(--color-accent,#1a6ef2);background:#eef4fe}',
            '.cx-was b,.cx-now b{display:block;font-size:11.5px;color:var(--color-text-secondary,#4a4f57);margin-bottom:2px}',
            '.cx-touch{background:var(--color-surface-2,#f6f6f4);border-radius:8px;padding:7px 10px;font-size:12.5px}.cx-note{font-size:12.5px;color:#5c3700}',
            '.cx-choose{display:flex;flex-wrap:wrap;gap:14px}.cx-radio{display:inline-flex;gap:6px;align-items:center;font-size:13px;min-height:28px;cursor:pointer;text-transform:none;letter-spacing:normal;font-weight:500}',
            '.cx-sign{background:var(--color-surface,#fff);border:2px solid var(--color-text-primary,#101216);border-radius:10px;padding:14px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;position:sticky;bottom:0;z-index:2}',
            '.cx-lab{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:600;text-transform:none;letter-spacing:normal}.cx-lab input,.cx-lab select{font:inherit;font-weight:400;padding:7px 9px;border:1px solid var(--color-border,#c9ced6);border-radius:6px;min-height:36px;box-sizing:border-box}',
            '.cx-err{flex-basis:100%;color:var(--color-danger,#a3211a);font-size:12.5px}.cx-err:empty{display:none}',
            '.cx-scroll{overflow-x:auto}.cx-table{width:100%;border-collapse:collapse;font-size:13px}.cx-table th{text-align:left;font-size:12px;color:var(--color-text-secondary,#4a4f57);border-bottom:1px solid var(--color-text-primary,#14171c);padding:7px 8px}.cx-table td{border-bottom:1px solid var(--color-border-hair,#d6d6d2);padding:7px 8px;vertical-align:top}',
            '.cx-search{font:inherit;padding:7px 10px;border:1px solid var(--color-border,#c9ced6);border-radius:6px;min-width:220px}',
            '.cx-note-card{background:#fff8ec;border:1px solid #b26a00;border-radius:10px;padding:12px 16px;font-size:13px;display:flex;flex-direction:column;gap:4px}',
            '.cx-pop{position:fixed;inset:0;z-index:2147482000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px}',
            '.cx-pop-card{background:var(--color-surface,#fff);color:var(--color-text-primary,#101216);border-radius:12px;max-width:920px;width:100%;max-height:90vh;overflow:hidden;padding:18px 20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 24px 64px rgba(0,0,0,.35)}.cx-pop .cx-sign{position:static}',
            '.cx-pop-card h3{margin:0}.cx-pop-list{display:flex;flex-direction:column;gap:10px;overflow:auto;flex:1 1 auto;min-height:0}.cx-pop-foot{border-top:1px solid var(--color-border-hair,#d6d6d2);padding-top:10px}',
            '.cx-sub{border-top:1px solid var(--color-border-hair,#d6d6d2);padding-top:10px;display:flex;flex-direction:column;gap:6px}.cx-num{font:inherit;width:140px;padding:6px 8px;border:1px solid var(--color-border,#c9ced6);border-radius:6px}',
            '.cx-lock{display:inline-flex;gap:4px;align-items:center;font-size:10.5px;font-weight:700;color:#1a4fa8;background:#e8f0fb;border-radius:9px;padding:1px 7px;white-space:nowrap}'
        ].join('\n');
        try { (document.head || document.documentElement).appendChild(st); } catch (_) {}
    })();
})();
