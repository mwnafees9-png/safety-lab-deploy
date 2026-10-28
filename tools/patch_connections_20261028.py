#!/usr/bin/env python3
"""28 Oct 2026: Safety Lab Connections (Waqas: "go for it, and lets get this built"; "lets get all of these updates in
one build"). The agreed model, in his words: every linked item has one owner, its source of truth ("only for the items
being linked not for all the fields"); "if safety lab is the source of truth then we can edit, if jama is the source of
truth no edit permissions"; changes from the owner are flagged added, removed or changed and "never update[d]
automatically without their engineering teams consent"; changes to items Safety Lab owns are pushed by a person.

This script wires the existing Jama connection (live_bridge.js) into the new framework (connections.js):
  * bridgeChanges(): every staged Jama change as one line the framework can show, with a stable key (the Jama item,
    what changed and Jama's modified time, so a change Jama makes again comes back as a new line);
  * bridgeApplyKeys(keys, signer): applies exactly the accepted lines through the same signed apply, plus the new
    parents a new function hangs under (a child is never filed loose under its top function);
  * the page panels' "Sign and apply" goes through the framework too, so a change someone rejected, or an edit made in
    Jama to an item Safety Lab owns, is never taken in by a page panel either;
  * registers Jama with the framework.
index.html loads connections.js before live_bridge.js, adds the Connections page and its sidebar entry.

Run from the repo root: python3 tools/patch_connections_20261028.py   (refuses on any missing anchor)
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda p: os.path.join(ROOT, 'site', p)
def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()
def wr(p, s):
    with open(p, 'w', encoding='utf-8') as f: f.write(s)
def sub1(s, old, new, name):
    n = s.count(old)
    if n != 1: sys.exit('anchor %s found %d times' % (name, n))
    return s.replace(old, new)

b = rd(S('live_bridge.js'))
if 'bridgeApplyKeys' in b: sys.exit('already applied')

HOOKS = r"""    // ---------------------------------------------- 28 Oct 2026: the connections framework (connections.js)
    // Every staged change as one line: { key, tool, scope, kind, change, remoteId, extKey, name, slId, fields,
    // before, after }. The key names the Jama item, what changed and Jama's modified time, so a change someone
    // rejected stays rejected until Jama changes the item again.
    const _CK = ['fn', 'req', 'asm', 'fc'];
    const _CARR = { fnChanged: 'renamed', fresh: 'added', changed: 'changed', moved: 'moved', revised: 'revised', missing: 'removed' };
    function _ceItem(k, arr, e) { if (!e || arr === 'revised') return null; if (k === 'req') return arr === 'fresh' ? e : (arr === 'changed' ? e.it : null); return e.item || null; }
    function _ceRow(k, arr, e) {
        if (!e || arr === 'revised') return null;
        if (k === 'req') return arr === 'changed' ? e.r : (arr === 'missing' ? e : null);
        if (arr === 'fnChanged') return (e.rows && e.rows[0]) || null;
        return e.row || null;
    }
    function _ceSrc(row) { return row ? (row.fnSource || row.reqSource || row.asmSource || row.fcSource || null) : null; }
    function _ceRemote(k, arr, e) {
        if (arr === 'revised') return e ? e.remoteId : null;
        const it = _ceItem(k, arr, e); if (it && it.id != null) return it.id;
        const s = _ceSrc(_ceRow(k, arr, e)); return s ? s.remoteId : null;
    }
    function _ceKey(scope, k, arr, e) {
        const it = _ceItem(k, arr, e), row = _ceRow(k, arr, e), rid = _ceRemote(k, arr, e);
        const ver = arr === 'revised' ? ('v' + (e && e.to)) : (arr === 'missing' ? 'gone' : ((it && it.modified) || ''));
        return ['jama', scope, k, arr, rid != null ? String(rid) : ('row:' + ((row && row.internalId) || '')), ver].join('|');
    }
    function _ceName(k, it, row, e) {
        if (it && it.name) return it.name;
        if (e && e.name) return e.name;
        if (!row) return '';
        return String(row.subName || row.funcName || row.text || row.fcDesc || row.tlDesc || row.asmId || row.id || '');
    }
    function _ceSlId(k, arr, e, it, row) {
        if (k === 'fn') return String((row && (row.subId || row.funcId)) || (it && it.key) || '');
        if (k === 'req') return String((row && (row.id || row.reqId)) || (it && it.key) || '');
        if (k === 'asm') return String((row && row.asmId) || (it && it.key) || '');
        if (k === 'fc') return String((e && e.want && e.want.fcId) || (row && row.fcId) || (it && it.key) || '');
        return '';
    }
    function _ceBeforeAfter(k, arr, e, it, row) {
        const S2 = v => String(v == null ? '' : v);
        if (arr === 'revised') return { before: { revision: e.from == null ? '' : String(e.from) }, after: { revision: String(e.to) } };
        if (arr === 'fnChanged') return { before: { name: S2(row && row.funcName), description: S2(row && row.funcDef) }, after: { name: S2(it && it.name), description: S2(it && it.text) } };
        if (arr === 'moved') {
            const was = row ? ([S2(row.funcId), S2(row.parentSubId)].filter(Boolean).join(' > ') || S2(row.funcId)) : '';
            const now = [e.top && e.top.key, e.parent && e.parent.key].filter(Boolean).join(' > ');
            return { before: { place: was }, after: { place: now } };
        }
        if (arr === 'fresh') {
            if (k === 'fc' && e.want) return { before: {}, after: { 'failure condition': S2(e.want.fcDesc), 'function': S2(e.want.subId), severity: S2(e.want.severity) } };
            return { before: {}, after: { name: S2(it && it.name), description: S2(it && it.text) } };
        }
        if (arr === 'missing') return { before: { name: _ceName(k, null, row, e) }, after: {} };
        if (k === 'fn') return { before: { name: S2(row && row.subName), description: S2(row && row.subDef) }, after: { name: S2(it && it.name), description: S2(it && it.text) } };
        if (k === 'req') return { before: { text: S2(row && row.text) }, after: { text: S2((it && (it.text || it.name)) || '') } };
        if (k === 'asm') return { before: { text: S2(row && row.text) }, after: { text: S2(it && (it.text || it.name)) } };
        if (k === 'fc' && e.want) return { before: { 'failure condition': S2(row && row.fcDesc), 'function': S2(row && row.subId), severity: S2(row && row.severity) },
                                           after: { 'failure condition': S2(e.want.fcDesc), 'function': S2(e.want.subId), severity: S2(e.want.severity) } };
        return { before: {}, after: {} };
    }
    function bridgeChanges() {
        const d = _lastDiff, out = [];
        if (!d || d.held) return out;
        const scopes = [['ac', d]].concat(Object.keys(d.sys || {}).map(id => [id, d.sys[id]]));
        scopes.forEach(([scope, src]) => _CK.forEach(k => {
            const x = src && src[k]; if (!x) return;
            Object.keys(_CARR).forEach(arr => (Array.isArray(x[arr]) ? x[arr] : []).forEach(e => {
                const it = _ceItem(k, arr, e), row = _ceRow(k, arr, e), src0 = _ceSrc(row), ba = _ceBeforeAfter(k, arr, e, it, row);
                out.push({
                    key: _ceKey(scope, k, arr, e), tool: TOOL, scope: scope, scopeName: scope === 'ac' ? 'Aircraft' : ((d.sys[scope] && d.sys[scope].name) || scope),
                    kind: k, change: _CARR[arr], arr: arr, remoteId: _ceRemote(k, arr, e),
                    extKey: (it && it.key) || (e && e.key) || (src0 && (src0.key || src0.reqifId)) || '',
                    name: _ceName(k, it, row, e), slId: _ceSlId(k, arr, e, it, row),
                    fields: (e && Array.isArray(e.fields)) ? e.fields.slice() : [], why: (e && e.why) || '',
                    before: ba.before, after: ba.after
                });
            }));
        }));
        return out;
    }
    // Apply exactly these lines (and the new parents a new function hangs under), signed.
    function bridgeApplyKeys(keys, signedBy) {
        const d = _lastDiff;
        if (!d || d.held) return { ok: false, err: 'Nothing from Jama is staged: check Jama first.' };
        const want = new Set((keys || []).map(String));
        const scopes = [['ac', d]].concat(Object.keys(d.sys || {}).map(id => [id, d.sys[id]]));
        scopes.forEach(([scope, src]) => {
            const x = src && src.fn; if (!x || !Array.isArray(x.fresh)) return;
            const freshById = new Map(x.fresh.filter(e => e && e.item).map(e => [e.item.id, e]));
            const pull = e => { let p = e && e.parent; let guard = 0; while (p && freshById.has(p.id) && guard++ < 1000) { const pe = freshById.get(p.id); want.add(_ceKey(scope, 'fn', 'fresh', pe)); p = pe.parent; } };
            x.fresh.forEach(e => { if (want.has(_ceKey(scope, 'fn', 'fresh', e))) pull(e); });
            (x.moved || []).forEach(e => { if (want.has(_ceKey(scope, 'fn', 'moved', e))) pull(e); });
        });
        const pick = (scope, k, x) => {
            if (!x) return x;
            const y = Object.assign({}, x);
            Object.keys(_CARR).forEach(arr => { if (Array.isArray(x[arr])) y[arr] = x[arr].filter(e => want.has(_ceKey(scope, k, arr, e))); });
            if (k === 'fn' && x.versions instanceof Map) {
                const ids = new Set();
                Object.keys(_CARR).forEach(arr => (y[arr] || []).forEach(e => { const r = _ceRemote(k, arr, e); if (r != null) ids.add(Number(r)); }));
                y.versions = new Map(Array.from(x.versions.entries()).filter(([id]) => ids.has(Number(id))));
            }
            return y;
        };
        const f = Object.assign({}, d, { sys: {} });
        _CK.forEach(k => { f[k] = pick('ac', k, d[k]); });
        Object.keys(d.sys || {}).forEach(id => { const s = d.sys[id], t = Object.assign({}, s); _CK.forEach(k => { t[k] = pick(id, k, s[k]); }); f.sys[id] = t; });
        Object.defineProperty(f, '_from', { value: d, enumerable: false });
        return bridgeApply(f, signedBy);
    }
"""
b = sub1(b, "    // --------------------------------------------------------------- check\n    let _lastDiff = null,",
         HOOKS + "\n    // --------------------------------------------------------------- check\n    let _lastDiff = null,", 'hooks')
# what is still staged is recomputed after an apply of a part of the staged diff too
b = sub1(b, "        if (diff === _lastDiff && _stageIn) { try { _lastDiff = _compute(_stageIn); } catch (_) { _lastDiff = null; } }",
         "        if ((diff === _lastDiff || (diff && diff._from === _lastDiff)) && _stageIn) { try { _lastDiff = _compute(_stageIn); } catch (_) { _lastDiff = null; } }", 'recompute')
# the page panels sign through the framework: rejected lines and Safety Lab-owned items are never taken in
b = sub1(b, "        const r = bridgeApply(_lastDiff, by, p ? { scope: _scopeOf(p), kinds: p.kinds } : null);",
         "        // 28 Oct 2026: through the connections framework, so a line someone rejected, or an edit made in Jama to an item\n"
         "        // Safety Lab owns, is never taken in by a page panel either (the framework keeps the record and the History)\n"
         "        const _sc = p ? _scopeOf(p) : null;\n"
         "        const _cx = window.SLConnections;\n"
         "        const r = (_cx && typeof _cx.signLines === 'function')\n"
         "            ? _cx.signLines(TOOL, bridgeChanges().filter(c => !p || (c.scope === _sc && p.kinds.indexOf(c.kind) >= 0)).map(c => c.key), by, 'Signed from the ' + (p ? p.title : 'Requirements exchange') + ' panel')\n"
         "            : bridgeApply(_lastDiff, by, p ? { scope: _sc, kinds: p.kinds } : null);", 'panel')
b = sub1(b, "            try { if (typeof window.jrnl === 'function') window.jrnl('bridge-check', 'Jama checked: ' + items.length + ' item(s). Requirements ",
         "            try { if (window.SLConnections && typeof window.SLConnections.checked === 'function') window.SLConnections.checked(TOOL, bridgeChanges(), silent); } catch (_) {}   // 28 Oct 2026\n"
         "            try { if (typeof window.jrnl === 'function') window.jrnl('bridge-check', 'Jama checked: ' + items.length + ' item(s). Requirements ", 'checked')
b = sub1(b, "    window.bridgeConfig = bridgeConfig;\n",
         "    window.bridgeConfig = bridgeConfig;\n"
         "    window.bridgeChanges = bridgeChanges;          // 28 Oct 2026: the connections framework\n"
         "    window.bridgeApplyKeys = bridgeApplyKeys;\n"
         "    try {\n"
         "        if (window.SLConnections && typeof window.SLConnections.register === 'function') window.SLConnections.register(TOOL, {\n"
         "            label: 'Jama Connect',\n"
         "            configured: () => { const c = bridgeConfig(); return !!(c && c.baseUrl && c.projectId); },\n"
         "            where: () => { const c = bridgeConfig(); let h = ''; try { h = new URL(String(c.baseUrl)).host; } catch (_) { h = String(c.baseUrl || ''); } return h + (c.projectId ? ' · project ' + c.projectId : ''); },\n"
         "            checkedAt: () => (_lastDiff && _lastDiff.checkedAt) || '',\n"
         "            held: () => !!(_lastDiff && _lastDiff.held),\n"
         "            warnings: () => ((_lastDiff && _lastDiff.warnings) || []).slice(),\n"
         "            changes: bridgeChanges,\n"
         "            check: silent => bridgeCheck(!!silent),\n"
         "            autoCheck: () => _watch() && _hasCredential(),\n"
         "            applyKeys: bridgeApplyKeys,\n"
         "            setup: () => { try { window.bridgeSetupUi(); } catch (_) {} },\n"
         "            browse: () => { try { window.bridgeBrowseUi(); } catch (_) {} },\n"
         "            linkedRows: _connLinkedRows\n"
         "        });\n"
         "    } catch (_) {}\n", 'register')
# every Safety Lab row that came from Jama, for owners, locks and Mapping
b = sub1(b, "    function bridgeChanges() {",
         "    function _connLinkedRows() {\n"
         "        const out = [];\n"
         "        const add = (rows, kind, scope, srcKey, idOf, nameOf) => (rows || []).forEach(r => { const s = r && r[srcKey]; if (s && s.tool === TOOL && s.remoteId != null) out.push({ tool: TOOL, remoteId: String(s.remoteId), extKey: s.key || s.reqifId || '', kind, scope, slId: idOf(r), name: nameOf(r), row: r, missing: !!s.missingInSource }); });\n"
         "        const fnName = r => String(r.subName || r.funcName || ''), fnId = r => String(r.subId || r.funcId || '');\n"
         "        add(typeof acFunctionsData !== 'undefined' ? acFunctionsData : [], 'fn', 'ac', 'fnSource', fnId, fnName);\n"
         "        add(typeof acReqData !== 'undefined' ? acReqData : [], 'req', 'ac', 'reqSource', r => String(r.id || ''), r => String(r.text || ''));\n"
         "        add(typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : [], 'asm', 'ac', 'asmSource', r => String(r.asmId || ''), r => String(r.text || ''));\n"
         "        add(typeof acFhaData !== 'undefined' ? acFhaData : [], 'fc', 'ac', 'fcSource', r => String(r.fcId || ''), r => String(r.fcDesc || ''));\n"
         "        _sysList().forEach(s => {\n"
         "            const sc = String(s.id);\n"
         "            add(s.functions, 'fn', sc, 'fnSource', r => String(r.funcId || ''), r => String(r.funcName || ''));\n"
         "            add(s.req, 'req', sc, 'reqSource', r => String(r.id || ''), r => String(r.text || ''));\n"
         "            add(s.asm, 'asm', sc, 'asmSource', r => String(r.asmId || ''), r => String(r.text || ''));\n"
         "            add(s.fha, 'fc', sc, 'fcSource', r => String(r.fcId || ''), r => String(r.fcDesc || ''));\n"
         "        });\n"
         "        return out;\n"
         "    }\n"
         "    function bridgeChanges() {", 'linkedRows')
wr(S('live_bridge.js'), b)

h = rd(S('index.html'))
h = sub1(h, '    <script src="live_bridge.js?v=3.3" defer></script>',
         '    <!-- 28 Oct 2026: Safety Lab Connections, the one framework every connected tool uses (owners, Incoming changes, Ready to send, Mapping, History) -->\n'
         '    <script src="connections.js?v=1.0" defer></script>\n'
         '    <script src="live_bridge.js?v=3.4" defer></script>', 'scripts')
h = sub1(h, '                <a class="asb-item sub" id="snav-reqif" onclick="switchTab(\'reqif\')"',
         '                <a class="asb-item sub" id="snav-conn" onclick="switchTab(\'conn\')" role="button" tabindex="0"><span class="asb-lbl">Connections — Jama · Polarion · DOORS · Codebeamer · Cameo · GENESYS</span></a>\n'
         '                <a class="asb-item sub" id="snav-reqif" onclick="switchTab(\'reqif\')"', 'nav')
h = sub1(h, '        <div id="view-reqif" style="display: none;">',
         '        <!-- 28 Oct 2026: Safety Lab Connections (connections.js draws it) -->\n'
         '        <div id="view-conn" style="display: none;"><div id="conn-host"></div></div>\n\n'
         '        <div id="view-reqif" style="display: none;">', 'view')
wr(S('index.html'), h)

# ---------------------------------------------------------------- live_bridge.js: sending to Jama (items Safety Lab owns)
b = rd(S('live_bridge.js'))
SENDCODE = r"""    // ---------------------------------------------- 28 Oct 2026: sending to Jama (Ready to send)
    // Waqas: "if safety lab is the source of truth then we can edit"; "we provide users the interface and ability to push
    // changes directly to that tool". What goes out, and only when an engineer signs and presses Send:
    //   * an item from Jama that an admin made Safety Lab the owner of: Safety Lab's name and description, when they
    //     differ from Jama's copy at the last check;
    //   * failure conditions and safety requirements made in Safety Lab, when Mapping says to send them: created in the
    //     chosen Jama folder as the chosen item type, linked to the function's Jama item, then kept in step.
    // Before every write the item is read again: if someone changed it in Jama since the last exchange it is held
    // back, never overwritten. Calculated results (probabilities, allocated budgets, DALs), signatures and history are
    // never written. Writes go out only to the saved Jama address, and only to items, relationships and comments.
    const _WRITE_PATH = /\/rest\/(latest|v1)\/(items(\/\d+)?|relationships|comments)$/;
    function _writeProblem(method, url) {
        let u; try { u = new URL(String(url)); } catch (_) { return 'not a valid address'; }
        const cfg = bridgeConfig(); let saved = ''; try { saved = new URL(String(cfg.baseUrl)).host; } catch (_) {}
        if (!saved || u.host !== saved) return 'only the saved Jama address can be written to';
        if (!_WRITE_PATH.test(u.pathname)) return 'only Jama items, relationships and comments are written';
        if (method === 'PATCH' && !/\/items\/\d+$/.test(u.pathname)) return 'only an item is changed';
        if (method === 'POST' && /\/items\/\d+$/.test(u.pathname)) return 'an item is changed, not posted to';
        if (method !== 'POST' && method !== 'PATCH') return 'Safety Lab only creates and changes items in Jama; it never deletes';
        return '';
    }
    async function _write(method, url, body) {
        const bad = _writeProblem(method, url); if (bad) throw new Error('Not sent: ' + bad + '.');
        if (_isDesktop()) {
            if (!window.slabBridge || typeof window.slabBridge.send !== 'function') throw new Error('This version of the desktop app cannot send to Jama. Update the app.');
            const r = await window.slabBridge.send(method, url, body);
            if (!r || !r.ok) throw new Error((r && r.error) || 'the send failed');
            return r.data;
        }
        const st = _store();
        if (st && st.door() === 'vault') {
            if (!st.has('jama_token')) throw new Error('Connect the tool first: no credential is saved for this account.');
            const jwt = st.sessionJwt(); if (!jwt) throw new Error('Sign in again to use the connector.');
            const base = (window.SLConfig && window.SLConfig.aiEndpoint) || '';
            if (!base) throw new Error('This install has no proxy configured, so the connector has nowhere to relay through.');
            const res = await fetch(String(base).replace(/\/+$/, '') + '/bridge?target=' + encodeURIComponent(url), { method, headers: { 'Authorization': 'Bearer ' + jwt, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const j = await res.json().catch(() => null);
            if (!res.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + res.status + ' from bridge'));
            return j;
        }
        // Browser-only (no Safety Lab server): the login lives only in this tab and goes through Safety Lab's public relay,
        // which never writes (a public relay that writes would be a way to change anybody's server). Sending needs the
        // desktop app or the company's Safety Lab server, where the login is kept in the keychain or the server's vault.
        throw new Error('Sending to Jama needs the Safety Lab desktop app or your company\u2019s Safety Lab server. In a browser-only session the Jama login stays in this tab and Safety Lab\u2019s public relay only reads.');
    }
    function _sendCfg() { const c = bridgeConfig(); return (c && c.send && typeof c.send === 'object') ? c.send : {}; }
    function _plainSl(s) { return String(s == null ? '' : s); }
    function _html(s) { return _esc(s).replace(/\n/g, '<br>'); }
    // what Safety Lab writes for one of its failure conditions
    function _fcFields(r) {
        const parts = [['Function', r.subId], ['Flight phases', Array.isArray(r.phases) ? r.phases.join(', ') : r.phases], ['Effect on the aircraft', r.effAc], ['Effect on the crew', r.effCrew], ['Effect on occupants', r.effPax],
                       ['Severity (the engineer’s classification)', [r.severity, r.severityRationale].filter(Boolean).join(': ')]];
        const desc = parts.filter(p => _plainSl(p[1]).trim()).map(p => '<p><b>' + _esc(p[0]) + ':</b> ' + _html(p[1]) + '</p>').join('') + '<p><i>Safety Lab owns this item. Change it in Safety Lab; edits made here are not taken in.</i></p>';
        return { name: (_plainSl(r.fcId) ? r.fcId + ' ' : '') + _plainSl(r.fcDesc).slice(0, 230), description: desc };
    }
    function _reqFields(r) {
        return { name: ((_plainSl(r.id) ? r.id + ' ' : '') + _plainSl(r.text)).slice(0, 250), description: '<p>' + _html(r.text) + '</p>' + (r.rat ? '<p><b>Rationale:</b> ' + _html(r.rat) + '</p>' : '') + '<p><i>Safety Lab owns this item. Change it in Safety Lab; edits made here are not taken in.</i></p>' };
    }
    function _fp(o) { try { return JSON.stringify(o); } catch (_) { return ''; } }
    function _ownSent(r) { return (r && r.sendLinks && r.sendLinks[TOOL]) || null; }
    // the Jama item last read for a remote id (from the last check)
    function _seenItem(id) { const it = _stageIn && (_stageIn.items || []).find(n => n && Number(n.id) === Number(id)); return it || null; }
    function bridgeOutgoing() {
        const out = [], C = window.SLConnections; if (!C) return out;
        const cfgS = _sendCfg();
        // 1. items from Jama that Safety Lab now owns
        _connLinkedRows().forEach(x => {
            if (C.ownerOf('jama', x.remoteId) !== 'sl' || x.missing) return;
            const it = _seenItem(x.remoteId); if (!it) return;
            let want = null;
            if (x.kind === 'fn') want = x.row.fnSource && x.row.fnSource.funcOnly ? { name: _plainSl(x.row.funcName), text: _plainSl(x.row.funcDef) } : { name: _plainSl(x.row.subName), text: _plainSl(x.row.subDef) };
            else if (x.kind === 'req' || x.kind === 'asm') want = { name: it.name, text: _plainSl(x.row.text) };
            else if (x.kind === 'fc') want = { name: _plainSl(x.row.fcDesc), text: it.text };
            if (!want) return;
            const diff = [];
            if (want.name !== it.name) diff.push('name');
            if (want.text !== it.text) diff.push('description');
            if (!diff.length) return;
            out.push({ key: 'jama|own|' + x.remoteId + '|' + _fp(want).length + ':' + _fp(want).slice(0, 40), tool: 'jama', change: 'changed', kind: x.kind, slId: x.slId, name: x.name,
                       remoteId: x.remoteId, seen: it.modified, after: Object.assign(diff.indexOf('name') >= 0 ? { name: want.name } : {}, diff.indexOf('description') >= 0 ? { description: want.text } : {}),
                       there: 'Jama ' + (it.key || x.remoteId) + ': ' + diff.join(' and ') + ' differ', _ops: diff.map(k => ({ op: 'replace', path: '/fields/' + (k === 'name' ? 'name' : 'description'), value: k === 'name' ? want.name : '<p>' + _html(want.text) + '</p>' })), _row: x.row, _src: x.kind });
        });
        // 2. failure conditions and requirements made in Safety Lab, when Mapping says to send them
        const kinds = [['fc', typeof acFhaData !== 'undefined' ? acFhaData : [], _fcFields, r => !r.fcSource && _plainSl(r.fcDesc).trim()],
                       ['req', typeof acReqData !== 'undefined' ? acReqData : [], _reqFields, r => !r.reqSource && _plainSl(r.text).trim()]];
        kinds.forEach(([k, rows, fieldsOf, mine]) => {
            const sc = cfgS[k]; if (!sc || !sc.on) return;
            (rows || []).forEach(r => {
                if (!r || !mine(r)) return;
                const f = fieldsOf(r), fp = _fp(f), link = _ownSent(r);
                if (link && link.fp === fp) return;
                out.push({ key: 'jama|' + k + '|' + (r.internalId || r.fcId || r.id) + '|' + (link ? 'chg' : 'new') + '|' + fp.length + ':' + fp.slice(-24), tool: 'jama', change: link ? 'changed' : 'new', kind: k,
                           slId: String(k === 'fc' ? (r.fcId || '') : (r.id || '')), name: k === 'fc' ? r.fcDesc : r.text, remoteId: link ? link.remoteId : null,
                           after: link ? { name: f.name } : { name: f.name, folder: 'Jama item ' + sc.parent + (sc.itemType ? ', item type ' + sc.itemType : '') },
                           there: link ? ('Jama ' + (link.key || link.remoteId) + ', sent ' + String(link.at || '').slice(0, 10) + ' by ' + (link.by || '')) : 'Not in Jama yet', _fields: f, _fp: fp, _row: r, _send: k });
            });
        });
        return out;
    }
    function _bg(fn) { try { const A = window.SLChangeAck; if (A && typeof A.background === 'function') return A.background(fn); } catch (_) {} return fn(); }
    function _itemOf(data) { return (data && data.data) || data || null; }
    async function _comment(base, id, text) { try { await _write('POST', base + '/rest/latest/comments', { body: { text: text }, location: { item: Number(id) }, commentType: 'GENERAL' }); } catch (_) {} }
    async function bridgeSend(lines, signer, reason) {
        const cfg = bridgeConfig(); const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
        if (!base || !cfg.projectId) return { ok: false, err: 'Connect Jama first.' };
        const cfgS = _sendCfg();
        const res = { ok: true, sent: 0, held: [], failed: [], items: [] };
        const note = 'Sent from Safety Lab by ' + signer + (reason ? ': ' + reason : '') + '.';
        // failure conditions before requirements, so a requirement can be linked to the failure condition it traces to
        const order = l => l._send === 'fc' ? 0 : (l._send === 'req' ? 1 : 2);
        lines = (lines || []).slice().sort((a, b) => order(a) - order(b));
        for (const l of lines) {
            const label = (l.slId ? l.slId + ' ' : '') + String(l.name || '').slice(0, 60);
            try {
                if (l._src) {                              // an item from Jama that Safety Lab owns
                    const now = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(l.remoteId)));
                    if (!now) { res.failed.push(label + ': Jama no longer has this item'); continue; }
                    if (String(now.modifiedDate || '') !== String(l.seen || '')) { res.held.push(label + ' (changed in Jama since the last check: check Jama, then send again)'); continue; }
                    await _write('PATCH', base + '/rest/latest/items/' + Number(l.remoteId), l._ops);
                    const after = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(l.remoteId)));
                    const src = l._row && (l._row.fnSource || l._row.reqSource || l._row.asmSource || l._row.fcSource);
                    _bg(() => { if (src && after) { src.lastChange = after.modifiedDate; src.sentBy = signer; src.sentAt = new Date().toISOString(); } });
                    // what Safety Lab now knows Jama holds (until the next check reads it again)
                    { const seen = _seenItem(l.remoteId), T0 = _T(); const n0 = (seen && after && T0) ? T0.normalizeItem(after) : null; if (n0) { seen.name = n0.name; seen.text = n0.text; seen.modified = n0.modified; } }
                    await _comment(base, l.remoteId, note);
                    res.sent++; res.items.push(label); continue;
                }
                const sc = cfgS[l._send] || {};
                const link = _ownSent(l._row);
                if (link) {                                // a Safety Lab item sent before: kept in step
                    const now = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(link.remoteId)));
                    if (!now) { res.failed.push(label + ': Jama no longer has this item'); continue; }
                    if (link.modified && String(now.modifiedDate || '') !== String(link.modified)) { res.held.push(label + ' (someone changed it in Jama since Safety Lab last sent it; Safety Lab owns it, so send again to overwrite, after checking what they changed)'); _bg(() => { link.modified = now.modifiedDate; }); continue; }
                    await _write('PATCH', base + '/rest/latest/items/' + Number(link.remoteId), [{ op: 'replace', path: '/fields/name', value: l._fields.name }, { op: 'replace', path: '/fields/description', value: l._fields.description }]);
                    const after = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(link.remoteId)));
                    _bg(() => { link.fp = l._fp; link.at = new Date().toISOString(); link.by = signer; link.modified = after && after.modifiedDate; });
                    await _comment(base, link.remoteId, note);
                    res.sent++; res.items.push(label); continue;
                }
                if (!sc.itemType || !sc.parent) { res.failed.push(label + ': choose the Jama item type and folder in Mapping first'); continue; }
                const made = await _write('POST', base + '/rest/latest/items', { project: Number(cfg.projectId), itemType: Number(sc.itemType), childItemType: Number(sc.itemType), location: { parent: { item: Number(sc.parent) } }, fields: { name: l._fields.name, description: l._fields.description } });
                const id = made && made.meta && (made.meta.id != null ? made.meta.id : (String(made.meta.location || '').match(/\/(\d+)$/) || [])[1]);
                if (id == null) { res.failed.push(label + ': Jama did not say which item it made'); continue; }
                const after = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(id)));
                _bg(() => { if (!l._row.sendLinks || typeof l._row.sendLinks !== 'object') l._row.sendLinks = {}; l._row.sendLinks[TOOL] = { remoteId: String(id), key: (after && after.documentKey) || '', fp: l._fp, at: new Date().toISOString(), by: signer, modified: after && after.modifiedDate }; });
                // trace: a failure condition to its function's Jama item; a requirement to the failure condition it traces to
                let from = null;
                if (l._send === 'fc') { const fn = (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []).find(x => x && String(x.subId || '') === String(l._row.subId || '') && x.fnSource && x.fnSource.tool === TOOL); if (fn) from = fn.fnSource.remoteId; }
                if (l._send === 'req') { const fc = (typeof acFhaData !== 'undefined' ? acFhaData : []).find(x => x && String(x.fcId || '') === String(l._row.traceId || '')); const lk = _ownSent(fc) || (fc && fc.fcSource && fc.fcSource.tool === TOOL ? { remoteId: fc.fcSource.remoteId } : null); if (lk) from = lk.remoteId; }
                if (from != null) { try { await _write('POST', base + '/rest/latest/relationships', { fromItem: Number(from), toItem: Number(id) }); } catch (e) { res.failed.push(label + ': made in Jama, but the link to its ' + (l._send === 'fc' ? 'function' : 'failure condition') + ' failed (' + ((e && e.message) || e) + ')'); } }
                await _comment(base, id, note);
                res.sent++; res.items.push(label + ' (new: ' + ((after && after.documentKey) || id) + ')');
            } catch (e) { res.failed.push(label + ': ' + ((e && e.message) || e)); }
        }
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { if (typeof window.jrnl === 'function') window.jrnl('bridge-send', 'Jama: sent ' + res.sent + (res.held.length ? ', held back ' + res.held.length : '') + (res.failed.length ? ', failed ' + res.failed.length : '') + '. Signed ' + signer); } catch (_) {}
        if (res.failed.length && !res.sent) res.ok = false;
        return res;
    }
    // Mapping: what Safety Lab sends, per kind (item type and folder in Jama)
    function bridgeSendSettingsHtml() {
        const sc = _sendCfg();
        const row = (k, label) => { const c = sc[k] || {};
            return '<tr><td><label class="cx-radio"><input type="checkbox"' + (c.on ? ' checked' : '') + ' onchange="bridgeSendCfg(\'' + k + '\', \'on\', this.checked)"> ' + label + '</label></td>' +
                '<td><input type="number" class="cx-num" value="' + _esc(c.itemType || '') + '" placeholder="item type id" onchange="bridgeSendCfg(\'' + k + '\', \'itemType\', this.value)"></td>' +
                '<td><input type="number" class="cx-num" value="' + _esc(c.parent || '') + '" placeholder="folder item id" onchange="bridgeSendCfg(\'' + k + '\', \'parent\', this.value)"></td></tr>'; };
        return '<div class="cx-sub"><b>What Safety Lab sends to Jama</b><div class="cx-dim">Failure conditions and safety requirements made in Safety Lab go to the Jama folder and item type you give here, linked to the function (or failure condition) they belong to. Safety Lab owns them: they are edited in Safety Lab and sent again from Ready to send. Only the name and the description are written; the engineer’s severity classification is in the description. Calculated results (probabilities, allocated budgets, DALs), signatures and history are never sent. Jama shows an item type’s id under Admin, Item types, and a folder’s id in its address.</div>' +
            '<table class="cx-table"><thead><tr><th>Send</th><th>Jama item type id</th><th>Jama folder id</th></tr></thead><tbody>' + row('fc', 'Failure conditions (aircraft FHA)') + row('req', 'Safety requirements (aircraft)') + '</tbody></table></div>';
    }
    window.bridgeSendCfg = function (k, f, v) {
        const c = bridgeConfig(); c.send = (c.send && typeof c.send === 'object') ? c.send : {}; c.send[k] = Object.assign({}, c.send[k] || {});
        c.send[k][f] = f === 'on' ? !!v : (String(v).trim() ? Number(v) : null);
        const auto = c.auto; bridgeConfigSave(c); try { localStorage.setItem(WATCH_KEY, auto ? '1' : '0'); } catch (_) {}
        try { if (window.SLConnections) window.SLConnections.render(); } catch (_) {}
    };
"""
b = sub1(b, "    // --------------------------------------------------------------- check\n    let _lastDiff = null,", SENDCODE + "\n    // --------------------------------------------------------------- check\n    let _lastDiff = null,", 'sendcode')
b = sub1(b, "            linkedRows: _connLinkedRows\n", "            linkedRows: _connLinkedRows,\n            outgoing: bridgeOutgoing,\n            send: bridgeSend,\n            sendSettingsHtml: bridgeSendSettingsHtml\n", 'register2')
b = sub1(b, "    window.bridgeApplyKeys = bridgeApplyKeys;\n", "    window.bridgeApplyKeys = bridgeApplyKeys;\n    window.bridgeOutgoing = bridgeOutgoing;\n    window.bridgeSend = bridgeSend;\n    window._bridgeWriteProblem = _writeProblem;\n", 'exports2')
wr(S('live_bridge.js'), b)

# ---------------------------------------------------------------- the server's relay (/v1/ai/bridge) sends too
x = rd(os.path.join(ROOT, 'customer-install', 'selfhost', 'ai-proxy', 'worker.js'))
x = sub1(x, '  "access-control-allow-methods": "GET,POST,OPTIONS",', '  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",', 'cors')
x = sub1(x, "async function handleBridge(request, env, caller, url) {", """// 28 Oct 2026 (Safety Lab Connections): the relay sends too, for items Safety Lab owns, when an engineer signs and
// presses Send. Same fence as the read (bridgeTargetProblem: https, the saved host, a /rest/ path, no redirects) and a
// narrower one of its own: create an item, link two items, leave a comment, or change an item's fields. Never a
// delete, never a PUT, never another path, no query string, a JSON body of 2 MB at most.
const BRIDGE_WRITE_MAX = 2 * 1024 * 1024;
function bridgeWriteProblem(method, target, text) {
  const m = String(method || "").toUpperCase();
  if (m !== "POST" && m !== "PATCH") return "Safety Lab only creates and changes items in Jama; it never deletes";
  const p = target.pathname;
  if (m === "POST" && !/\\/rest\\/(latest|v1)\\/(items|relationships|comments)$/.test(p)) return "only Jama items, relationships and comments are created";
  if (m === "PATCH" && !/\\/rest\\/(latest|v1)\\/items\\/\\d+$/.test(p)) return "only a Jama item is changed";
  if (target.search) return "no query string on a write";
  if (String(text || "").length > BRIDGE_WRITE_MAX) return "the body is larger than 2 MB";
  try { JSON.parse(String(text || "null")); } catch (_) { return "the body is not JSON"; }
  return "";
}
async function handleBridge(request, env, caller, url) {""", 'writeFn')
x = sub1(x, """  const chk = bridgeTargetProblem(url.searchParams.get("target"), sec.meta && sec.meta.baseHost, env);
  if (chk.error) return jsonResponse(chk.status, { error: { type: "bad_target", message: chk.error } });
""", """  const chk = bridgeTargetProblem(url.searchParams.get("target"), sec.meta && sec.meta.baseHost, env);
  if (chk.error) return jsonResponse(chk.status, { error: { type: "bad_target", message: chk.error } });
  const method = request.method === "GET" ? "GET" : String(request.method || "").toUpperCase();
  let wbody = null;
  if (method !== "GET") {
    wbody = await request.text().catch(() => "");
    const wp = bridgeWriteProblem(method, chk.target, wbody);
    if (wp) return jsonResponse(400, { error: { type: "bad_write", message: "Not sent: " + wp + "." } });
  }
""", 'writeChk')
x = sub1(x, """  const call = (auth) => fetch(chk.target.toString(), {
      method: "GET", redirect: "manual",
      headers: { authorization: auth, accept: "application/json" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    });""", """  const call = (auth) => fetch(chk.target.toString(), method === "GET" ? {
      method: "GET", redirect: "manual",
      headers: { authorization: auth, accept: "application/json" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    } : {
      method: method, redirect: "manual",
      headers: { authorization: auth, accept: "application/json", "content-type": "application/json" },
      body: wbody,
      signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    });""", 'writeCall')
x = sub1(x, """      if (request.method === "GET" && url.pathname === "/v1/ai/bridge") return handleBridge(request, env, caller, url);""",
         """      if (request.method === "GET" && url.pathname === "/v1/ai/bridge") return handleBridge(request, env, caller, url);
      if ((request.method === "POST" || request.method === "PATCH") && url.pathname === "/v1/ai/bridge") return handleBridge(request, env, caller, url);   // 28 Oct 2026: sending""", 'route')
x = sub1(x, "export { weightedTokens, MODEL_TOKEN_WEIGHTS, escHtml, escMd, notifyRecipientAllowed, itarUnconfiguredMessage, verifyOfflineLicense, auditFeature, auditOn, newAudit, bridgeTargetProblem };",
         "export { weightedTokens, MODEL_TOKEN_WEIGHTS, escHtml, escMd, notifyRecipientAllowed, itarUnconfiguredMessage, verifyOfflineLicense, auditFeature, auditOn, newAudit, bridgeTargetProblem, bridgeWriteProblem };", 'export')
wr(os.path.join(ROOT, 'customer-install', 'selfhost', 'ai-proxy', 'worker.js'), x)

# ---------------------------------------------------------------- change_ack.js: the combined pill and the lock
c = rd(S('change_ack.js'))
c = sub1(c, """        var n = count(), el = document.getElementById('sl-ack-bar');
        if (!el) {
            if (!n) return;
            _injectStyle();
            el = document.createElement('div'); el.id = 'sl-ack-bar'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
            el.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="txt"></span><button type="button" class="sl-ack-review">Review</button>';
            el.querySelector('button').addEventListener('click', function () { ask({ reason: 'early' }); });
            document.body.appendChild(el);
        }
        var on = n > 0 && !_askState;
        el.classList.toggle('on', on);
        if (on) el.querySelector('.txt').textContent = n + (n === 1 ? ' change' : ' changes') + ' waiting to be confirmed';""",
"""        // 28 Oct 2026 (Waqas): one pill, "4 incoming changes from Jama + 6 changes to confirm"; each part opens its own
        // review. The incoming part comes from the connections framework (connections.js).
        var n = count(), el = document.getElementById('sl-ack-bar');
        var inTxt = ''; try { var CX = W.SLConnections; if (CX && typeof CX.pillText === 'function') inTxt = CX.pillText() || ''; } catch (_) { inTxt = ''; }
        if (!el) {
            if (!n && !inTxt) return;
            _injectStyle();
            el = document.createElement('div'); el.id = 'sl-ack-bar'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
            el.innerHTML = '<button type="button" class="sl-ack-in"><span class="dot in" aria-hidden="true"></span><span class="tin"></span></button><span class="plus" aria-hidden="true">+</span>' +
                '<span class="dot mine" aria-hidden="true"></span><span class="txt"></span><button type="button" class="sl-ack-review">Review</button>';
            el.querySelector('.sl-ack-review').addEventListener('click', function () { ask({ reason: 'early' }); });
            el.querySelector('.sl-ack-in').addEventListener('click', function () { try { W.SLConnections.show('in'); } catch (_) {} });
            document.body.appendChild(el);
        }
        var on = (n > 0 || !!inTxt) && !_askState;
        el.classList.toggle('on', on);
        var both = n > 0 && !!inTxt;
        el.querySelector('.sl-ack-in').style.display = inTxt ? '' : 'none';
        el.querySelector('.plus').style.display = both ? '' : 'none';
        el.querySelector('.dot.mine').style.display = n > 0 ? '' : 'none';
        el.querySelector('.txt').style.display = n > 0 ? '' : 'none';
        el.querySelector('.sl-ack-review').style.display = n > 0 ? '' : 'none';
        if (inTxt) el.querySelector('.tin').textContent = inTxt;
        if (on && n > 0) el.querySelector('.txt').textContent = n + (n === 1 ? ' change' : ' changes') + (both ? ' to confirm' : ' waiting to be confirmed');""", 'bar')
c = sub1(c, "+ '#sl-ack-bar.on{display:flex}#sl-ack-bar .dot{width:8px;height:8px;border-radius:50%;background:#C88A00;flex:none}'",
         "+ '#sl-ack-bar.on{display:flex}#sl-ack-bar .dot{width:8px;height:8px;border-radius:50%;background:#C88A00;flex:none}'\n"
         "            + '#sl-ack-bar .dot.in{background:#1A6EF2}#sl-ack-bar .sl-ack-in{display:inline-flex;align-items:center;gap:8px;background:none;border:none;padding:0;font:inherit;font-size:13px;color:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}#sl-ack-bar .plus{font-weight:700;color:#4A4F57}'", 'barcss')
c = sub1(c, """        _freshStash();
        var items = [], D = [], Rb = null;""", """        // 28 Oct 2026 (connections, Waqas: "if jama is the source of truth no edit permissions"): a row another tool
        // owns cannot be changed here. Its owned fields are put back before the change is measured and before the state
        // after this change is kept as the next starting point, and the person is told where to change it. An item
        // Safety Lab owns, or a row no tool owns, is never touched.
        if (w.user && !w.system) { try { if (_lockGuard(w)) _stashSeq = -1; } catch (e) { try { console.warn('[change-ack] lock guard', e); } catch (_) {} } }
        _freshStash();
        var items = [], D = [], Rb = null;""", 'guardcall')
c = sub1(c, "    function _resolve(forced) {", """    var _LOCK_LIVE = {
        acFunctionsData: function () { return (typeof acFunctionsData !== 'undefined') ? acFunctionsData : null; },
        acReqData: function () { return (typeof acReqData !== 'undefined') ? acReqData : null; },
        acAssumptionsData: function () { return (typeof acAssumptionsData !== 'undefined') ? acAssumptionsData : null; },
        acFhaData: function () { return (typeof acFhaData !== 'undefined') ? acFhaData : null; }
    };
    var _LOCK_SYS = { functions: 'fn', req: 'req', asm: 'asm', fha: 'fc' };
    function _lockGuard(w) {
        var CX = W.SLConnections; if (!CX || typeof CX.guardRow !== 'function') return;
        var base = _P(w.baseline); if (!base) return;
        var said = [], tool = '';
        var pair = function (kind, beforeRows, liveRows) {
            if (!Array.isArray(beforeRows) || !Array.isArray(liveRows)) return;
            var by = {}; beforeRows.forEach(function (r) { if (r && r.internalId != null) by[String(r.internalId)] = r; });
            liveRows.forEach(function (r) {
                if (!r || r.internalId == null) return;
                var b = by[String(r.internalId)]; if (!b) return;
                var back = CX.guardRow(kind, b, r);
                if (back.length) { var lk = CX.lockOf(b, kind) || {}; tool = lk.toolLabel || tool; said.push(String(r.subId || r.funcId || r.id || r.asmId || r.fcId || lk.extKey || '') + ' (' + back.join(', ') + ')'); }
            });
        };
        CX.lockedStores().forEach(function (st) { var get = _LOCK_LIVE[st.store]; if (get) pair(st.kind, base[st.store], get()); });
        var liveSys = (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : [];
        (Array.isArray(base.systemsData) ? base.systemsData : []).forEach(function (bs) {
            if (!bs) return;
            var ls = liveSys.filter(function (x) { return x && String(x.id) === String(bs.id); })[0]; if (!ls) return;
            Object.keys(_LOCK_SYS).forEach(function (k) { pair(_LOCK_SYS[k], bs[k], ls[k]); });
        });
        if (!said.length) return false;
        ['renderACFunctions', 'renderACReq', 'renderACFCIM', 'renderACFHA', 'renderACAssumptions', 'renderSysFunctions', 'renderSysReq', 'renderSysFCIM', 'renderSysFHA', 'renderSysAssumptions']
            .forEach(function (fn) { try { if (typeof W[fn] === 'function') W[fn](); } catch (_) {} });
        try { if (typeof W.showToast === 'function') W.showToast((said.length === 1 ? said[0] + ' is' : said.length + ' rows are') + ' owned by ' + (tool || 'the connected tool') + ', so ' + (said.length === 1 ? 'it' : 'they') + ' can only be changed there. Your edit was put back' + (said.length > 1 ? ': ' + said.slice(0, 4).join('; ') : '') + '. An admin can make Safety Lab the owner in Connections, Mapping.', 'warning', 9000); } catch (_) {}
        return true;
    }
    function _resolve(forced) {""", 'guardfn')
c = sub1(c, "        noteChange: noteChange, stash: stash,", "        refreshBar: function () { try { _bar(); } catch (_) {} },   // 28 Oct 2026: connections.js redraws the pill\n        noteChange: noteChange, stash: stash,", 'api')
wr(S('change_ack.js'), c)
h2 = rd(S('index.html'))
h2 = sub1(h2, '<script src="change_ack.js?v=3.4" defer></script>', '<script src="change_ack.js?v=3.5" defer></script>', 'ackver')
h2 = sub1(h2, '<script src="save_state.js?v=3.4" defer></script>', '<script src="save_state.js?v=3.5" defer></script>', 'savever')
h2 = sub1(h2, '<script src="support_modules.js?v=66.52" defer></script>', '<script src="support_modules.js?v=66.53" defer></script>', 'supver')
wr(S('index.html'), h2)

# ---------------------------------------------------------------- save_state.js: the reminder before leaving
v = rd(S('save_state.js'))
v = sub1(v, """        if (_choosing) return true;
        var A = _ack();""", """        if (_choosing) return true;
        // 28 Oct 2026 (Waqas, connections): changes to items Safety Lab owns that a connected tool does not have yet are
        // named before signing out, closing or leaving the project, with "Review and send now" (which stays here).
        try { var CX = W.SLConnections; if (CX && typeof CX.beforeLeave === 'function' && !(await CX.beforeLeave(reason || 'leave'))) { _paint(); return false; } } catch (_) {}
        var A = _ack();""", 'leave')
wr(S('save_state.js'), v)

# ---------------------------------------------------------------- support_modules.js: the lock on the worksheets
u = rd(S('support_modules.js'))
u = sub1(u, """            editFnName, deleteFnName, onEdit } = config;
""", """            editFnName, deleteFnName, onEdit } = config;
    // 28 Oct 2026 (connections): a row another tool owns shows a lock instead of Edit and Delete, and its editor does not
    // open (Waqas: "if jama is the source of truth no edit permissions"). change_ack.js puts back any other edit of it.
    const _CRUD_LOCK_KIND = { acFunc: 'fn', acReq: 'req', sysFunc: 'fn', sysReq: 'req' };
    const _crudLock = (k0, row) => { try { const k = _CRUD_LOCK_KIND[k0]; const C = window.SLConnections; return (k && C && row && typeof C.lockOf === 'function') ? C.lockOf(row, k) : null; } catch (_) { return null; } };
    const _crudLockHtml = lk => '<span class="cx-lock" title="Owned by ' + esc(lk.toolLabel) + (lk.extKey ? ' (' + esc(lk.extKey) + ')' : '') + ': change it there. An admin can make Safety Lab the owner in Connections, Mapping.">&#128274; ' + esc(String(lk.toolLabel || '').split(' ')[0]) + ' owns</span>';
    const _crudLockSay = (lk, what) => { try { showToast((what || 'This row') + ' is owned by ' + lk.toolLabel + (lk.extKey ? ' (' + lk.extKey + ')' : '') + ', so it is changed there, not here. An admin can make Safety Lab the owner in Connections, Mapping.', 'warning', 7000); } catch (_) {} };
""", 'lockfns')
u = sub1(u, """    function edit(internalId) {
        const arr = store(); if (!arr) return;
        const item = arr.find(x => String(x.internalId) === String(internalId));
        if (!item) return;
        writeForm(item);""", """    function edit(internalId) {
        const arr = store(); if (!arr) return;
        const item = arr.find(x => String(x.internalId) === String(internalId));
        if (!item) return;
        { const lk = _crudLock(key, item); if (lk) { _crudLockSay(lk); return; } }   // 28 Oct 2026
        writeForm(item);""", 'lockedit')
u = sub1(u, """    function deleteItem(internalId) {
        const arr = store(); if (!arr) return;
        const idx = arr.findIndex(x => String(x.internalId) === String(internalId));""", """    function deleteItem(internalId) {
        const arr = store(); if (!arr) return;
        const idx = arr.findIndex(x => String(x.internalId) === String(internalId));
        { const lk = idx >= 0 ? _crudLock(key, arr[idx]) : null; if (lk) { _crudLockSay(lk, 'This row'); return; } }   // 28 Oct 2026: flagged when it is gone from there, never deleted here""", 'lockdel')
u = sub1(u, """        return '<tr data-iid="' + esc(String(row.internalId)) + '">' + renderCells(row, rowActionsHTML(editFnName, deleteFnName, row.internalId)) + review + '</tr>';""",
         """        const lk = _crudLock(key, row);   // 28 Oct 2026
        return '<tr data-iid="' + esc(String(row.internalId)) + '"' + (lk ? ' class="cx-locked"' : '') + '>' + renderCells(row, lk ? _crudLockHtml(lk) : rowActionsHTML(editFnName, deleteFnName, row.internalId)) + review + '</tr>';""", 'lockrow')
u = sub1(u, """        const actionsFor = (internalId) => rowActionsHTML(editFnName, deleteFnName, internalId);""",
         """        let _byIid = null;   // 28 Oct 2026: a row another tool owns shows its lock, not Edit and Delete
        const actionsFor = (internalId) => {
            if (_CRUD_LOCK_KIND[key]) { if (!_byIid) { _byIid = new Map(); (all || []).forEach(r => { if (r) _byIid.set(String(r.internalId), r); }); } const lk = _crudLock(key, _byIid.get(String(internalId))); if (lk) return _crudLockHtml(lk); }
            return rowActionsHTML(editFnName, deleteFnName, internalId);
        };""", 'lockactions')
wr(S('support_modules.js'), u)

# ---------------------------------------------------------------- older suites that pinned what this deliberately changed
T = lambda p: os.path.join(ROOT, 'tests', p)
d = rd(T('regression_project_durability.test.js'))
d = sub1(d, "check('script tag count unchanged (304: 27 Oct fta_warn_pill.js", "check('script tag count unchanged (305: 28 Oct connections.js (Safety Lab Connections: owners, Incoming changes, Ready to send, Mapping, History); 304: 27 Oct fta_warn_pill.js", 'dur1')
d = sub1(d, "tags === 304, 'got ' + tags);", "tags === 305, 'got ' + tags);", 'dur2')
wr(T('regression_project_durability.test.js'), d)
e = rd(T('regression_change_collect_ui_20261016.test.js'))
e = sub1(e, """await mut('M2 the quiet bar never shows', "        var on = n > 0 && !_askState;", "        var on = false;",""", """await mut('M2 the quiet bar never shows', "        var on = (n > 0 || !!inTxt) && !_askState;", "        var on = false;",""", 'm2')   # 28 Oct 2026: the one pill also carries incoming changes
wr(T('regression_change_collect_ui_20261016.test.js'), e)
g = rd(T('regression_jama_every_page_20261022.test.js'))
g = sub1(g, """    check('a page panel signs for that page only', /bridgeApply\\(_lastDiff, by, p \\? \\{ scope: _scopeOf\\(p\\), kinds: p\\.kinds \\} : null\\)/.test(lb));""",
         """    // 28 Oct 2026: a page panel signs through the connections framework, that page's lines only (and never a rejected
    // line); the direct apply stays for a build without the framework
    check('a page panel signs for that page only', /c\\.scope === _sc && p\\.kinds\\.indexOf\\(c\\.kind\\) >= 0/.test(lb) && /bridgeApply\\(_lastDiff, by, p \\? \\{ scope: _sc, kinds: p\\.kinds \\} : null\\)/.test(lb));""", 'everypage')
wr(T('regression_jama_every_page_20261022.test.js'), g)

# ---------------------------------------------------------------- nav_areas.js: the Connections link sits in Requirements
n = rd(S('nav_areas.js'))
n = sub1(n, "items: ['snav-reqs-repo', 'snav-val-matrix', 'snav-moc', 'snav-vv-status', 'snav-reqif',", "items: ['snav-reqs-repo', 'snav-val-matrix', 'snav-moc', 'snav-vv-status', 'snav-conn', 'snav-reqif',", 'navitem')
n = sub1(n, "    var SHORT = { 'snav-pasa': 'PASA',", "    var SHORT = { 'snav-conn': 'Connections', 'snav-pasa': 'PASA',", 'navshort')
wr(S('nav_areas.js'), n)
h3 = rd(S('index.html'))
h3 = sub1(h3, '<script src="nav_areas.js?v=1.4" defer></script>', '<script src="nav_areas.js?v=1.5" defer></script>', 'navver')
wr(S('index.html'), h3)

print('ok')
