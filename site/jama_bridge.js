// ============================================================================
// jama_bridge.js — v1.0 — the LIVE Jama bridge (tier-3 traceability).
// BORN MODULAR: new file, zero monolith edits.
//
// THE POSTURE (agreed with the customer workflow): a barrier→requirement link
// is only a real TRACE when the program's requirements system of record says
// so. Programs already trace requirements to hazard/FC items in Jama — even
// from Excel FHA developments. What they need is our failure conditions to
// EXIST in Jama as items. This module is that round trip:
//
//   PUSH  — export AC FHA failure conditions into Jama as items (into a set/
//           folder the user names), remembering internalId → jamaId in
//           projectConfig.jamaBridge.fcMap. Idempotent: mapped rows are
//           skipped, so re-push only sends new FCs.
//   PULL  — for every mapped FC, read Jama's relationship graph (upstream +
//           downstream related items). Whatever the program traced to the FC —
//           requirements, mitigations, architecture — lands in
//           projectConfig.jamaBridge.relMap[fcInternalId] with document keys.
//
// The bow-tie (bowtie.js) consumes relMap: for a bow-tie whose critical event
// resolves to a mapped FC, "Pull from Jama" offers the RELATIONSHIP-DERIVED
// set first — provenance "⛓ traced in Jama" (tier 3) — before any text-match
// candidates (tier 1). Assignment of an item to a specific barrier side stays
// a human call; the *candidate set* comes from their trace graph, not string
// matching.
//
// All calls ride JamaConnect's saved connection (importers.js). Nothing here
// invents trace data: push copies our FCs out; pull copies their graph in;
// both stamped with time + actor.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3500); } catch (_) {} }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _jc() { return (typeof JamaConnect !== 'undefined') ? JamaConnect : null; }
    function _store() {
        const pc = _pc();
        if (!pc.jamaBridge) pc.jamaBridge = { projectId: '', fcItemTypeId: '', parentItemId: '', fcMap: {}, relMap: {}, lastPush: '', lastPull: '' };
        if (!pc.jamaBridge.fcMap) pc.jamaBridge.fcMap = {};
        if (!pc.jamaBridge.relMap) pc.jamaBridge.relMap = {};
        return pc.jamaBridge;
    }
    function _fcs() { return ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).filter(f => f && f.fcId); }

    // ---------------------------------------------------------------- modal
    async function jbOpen() {
        const jc = _jc();
        if (!jc) { _toast('Jama importer not available in this build.', 'warn'); return; }
        if (!jc.isConfigured()) { try { jc.openImportModal(); } catch (_) {} _toast('Connect to Jama first, then reopen the bridge.', 'info'); return; }
        const b = _store();
        let projects = [], itemTypes = [];
        try { projects = await jc.getProjects(); itemTypes = await jc.getItemTypes(); }
        catch (e) { _toast(String((e && e.message) || e), 'warn'); return; }
        const mapped = Object.keys(b.fcMap).length, total = _fcs().length;
        const rels = Object.values(b.relMap).reduce((a, x) => a + (x || []).length, 0);

        let m = document.getElementById('jb-modal'); if (m) m.remove();
        m = document.createElement('div'); m.id = 'jb-modal';
        m.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';
        m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
        const sel = (id, list, cur, label) => '<label style="display:block;font-size:12px;margin-bottom:8px;">' + label +
            '<select id="' + id + '" style="display:block;width:100%;padding:7px 9px;margin-top:3px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:7px;font-size:12.5px;">' +
            '<option value="">— pick —</option>' +
            list.map(x => '<option value="' + x.id + '"' + (String(cur) === String(x.id) ? ' selected' : '') + '>' + _esc((x.fields && x.fields.name) || x.display || x.name || ('#' + x.id)) + '</option>').join('') +
            '</select></label>';
        m.innerHTML = '<div style="background:var(--color-surface,#fff);border-radius:14px;padding:20px 22px;width:min(560px,94vw);max-height:84vh;overflow:auto;border:1px solid var(--color-border-hair,rgba(0,0,0,.15));box-shadow:0 30px 80px rgba(0,0,0,.4);">' +
            '<div style="font-weight:700;font-size:15px;">Jama live bridge</div>' +
            '<div style="font-size:12px;color:var(--color-text-tertiary,#888);margin:2px 0 12px;">Push failure conditions into Jama as items; the program traces its requirements to them there; pull the relationship graph back for tier-3 bow-tie links.</div>' +
            sel('jb-project', projects, b.projectId, 'Jama project') +
            sel('jb-itemtype', itemTypes, b.fcItemTypeId, 'Item type for failure conditions (e.g. Hazard / Failure Condition / Requirement)') +
            '<label style="display:block;font-size:12px;margin-bottom:12px;">Parent set/folder item ID <span style="color:var(--color-text-tertiary,#888);">(recommended — most Jama instances require items inside a set)</span>' +
            '<input id="jb-parent" type="text" value="' + _esc(b.parentItemId || '') + '" placeholder="e.g. 12345" style="display:block;width:100%;padding:7px 9px;margin-top:3px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:7px;font-size:12.5px;"></label>' +
            '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-bottom:12px;color:var(--color-text-secondary,#666);">' +
            '<span><strong>' + mapped + '</strong>/' + total + ' FCs mapped</span>' +
            '<span><strong>' + rels + '</strong> related item(s) pulled</span>' +
            (b.lastPush ? '<span>pushed ' + _esc(String(b.lastPush).slice(0, 16).replace('T', ' ')) + '</span>' : '') +
            (b.lastPull ? '<span>pulled ' + _esc(String(b.lastPull).slice(0, 16).replace('T', ' ')) + '</span>' : '') + '</div>' +
            '<div id="jb-log" style="font-size:11.5px;font-family:var(--font-mono,monospace);color:var(--color-text-secondary,#666);max-height:160px;overflow:auto;margin-bottom:12px;"></div>' +
            '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
            '<button onclick="document.getElementById(\'jb-modal\').remove()" style="padding:7px 14px;border-radius:8px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));background:transparent;cursor:pointer;font-size:12.5px;">Close</button>' +
            '<button class="btn-cyan" onclick="jbPush()" style="font-size:12.5px;" title="Create a Jama item for every unmapped failure condition.">▲ Push FCs → Jama</button>' +
            '<button class="btn-cyan" onclick="jbPull()" style="font-size:12.5px;" title="Read everything the program traced to each mapped FC (both directions).">▼ Pull relationships ← Jama</button>' +
            '</div></div>';
        document.body.appendChild(m);
    }
    function _log(msg) { const el = document.getElementById('jb-log'); if (el) { el.innerHTML += _esc(msg) + '<br>'; el.scrollTop = el.scrollHeight; } }
    function _readCfg() {
        const b = _store();
        const p = document.getElementById('jb-project'), t = document.getElementById('jb-itemtype'), pa = document.getElementById('jb-parent');
        if (p && p.value) b.projectId = p.value;
        if (t && t.value) b.fcItemTypeId = t.value;
        if (pa) b.parentItemId = String(pa.value || '').trim();
        return b;
    }

    // ------------------------------------------------------- single-FC ops
    async function _pushFc(f, b) {
        const jc = _jc();
        // export-control gate: technical data of a controlled system never goes to
        // a cloud RM instance — the offline ReqIF lane is the approved route.
        try {
            const ec = (typeof window.exportControlForFc === 'function') ? window.exportControlForFc(f) : '';
            if (ec === 'itar' || ec === 'ear' || ec === 'natl') throw new Error('export-controlled (' + ec.toUpperCase() + ') per the SPP system declaration — cloud push blocked; use the offline ReqIF lane');
        } catch (e) { if (String(e.message || '').indexOf('export-controlled') === 0) throw e; }
        const name = f.fcId + ' — ' + (f.fcDesc || '');
        const desc = 'Severity: ' + (f.severity || '—') + ' · Phases: ' + (f.phases || '—') +
            '\nAircraft effect: ' + (f.effAc || '—') + '\nCrew effect: ' + (f.effCrew || '—') + '\nPax effect: ' + (f.effPax || '—') +
            '\n\n[Safety Lab ' + f.fcId + ' · exported ' + new Date().toISOString().slice(0, 10) + ']';
        const id = await jc.createItem(b.projectId, b.fcItemTypeId, name, desc, b.parentItemId || null);
        if (id == null) throw new Error('created but no id returned');
        b.fcMap[String(f.internalId)] = { jamaId: Number(id), fcId: f.fcId, at: new Date().toISOString() };
        return id;
    }
    async function _pullFc(iid, b) {
        const jc = _jc();
        const rec = b.fcMap[String(iid)];
        if (!rec) throw new Error('not mapped');
        const rel = await jc.getRelated(rec.jamaId);
        b.relMap[String(iid)] = rel.map(x => ({
            jamaId: x.id, documentKey: x.documentKey || ('JAMA-' + x.id),
            name: (x.fields && x.fields.name) || '', description: ((x.fields && x.fields.description) || '').replace(/<[^>]+>/g, '').slice(0, 400),
            itemType: x.itemType || null, pulledAt: new Date().toISOString()
        }));
        return b.relMap[String(iid)].length;
    }
    function _cfgReady(b) { return !!(b.projectId && b.fcItemTypeId); }

    // ---------------------------------------------------------------- push
    async function jbPush() {
        const b = _readCfg();
        if (!_cfgReady(b)) { _toast('Pick a Jama project and item type first.', 'warn'); return; }
        const todo = _fcs().filter(f => !b.fcMap[String(f.internalId)]);
        if (!todo.length) { _log('Nothing to push — every FC is already mapped.'); return; }
        _log('Pushing ' + todo.length + ' failure condition(s)…');
        let ok = 0, fail = 0;
        for (const f of todo) {
            try { const id = await _pushFc(f, b); ok++; _log('✓ ' + f.fcId + ' → Jama item ' + id); }
            catch (e) { fail++; _log('✗ ' + f.fcId + ' — ' + String((e && e.message) || e)); }
        }
        b.lastPush = new Date().toISOString();
        _save(); _renderFcPanel();
        _log('Push done: ' + ok + ' created, ' + fail + ' failed.');
        _toast('Jama push: ' + ok + ' FC item(s) created' + (fail ? ' · ' + fail + ' failed (see log)' : '') + '.', fail ? 'warn' : 'success');
    }

    // ---------------------------------------------------------------- pull
    async function jbPull() {
        const b = _readCfg();
        const mapped = Object.keys(b.fcMap);
        if (!mapped.length) { _log('No mapped FCs — push first (or map manually).'); return; }
        _log('Pulling relationships for ' + mapped.length + ' mapped FC(s)…');
        let total = 0;
        for (const iid of mapped) {
            try { const n = await _pullFc(iid, b); total += n; _log('✓ ' + b.fcMap[iid].fcId + ': ' + n + ' related item(s)'); }
            catch (e) { _log('✗ ' + (b.fcMap[iid] && b.fcMap[iid].fcId) + ' — ' + String((e && e.message) || e)); }
        }
        b.lastPull = new Date().toISOString();
        _save(); _renderFcPanel();
        _log('Pull done: ' + total + ' related item(s) across ' + mapped.length + ' FC(s).');
        _toast('Jama pull: ' + total + ' traced item(s) — bow-ties can now link at tier 3 (⛓).', 'success');
    }

    // per-row actions from the FHA panel
    async function jbPushOne(internalId) {
        const jc = _jc(); if (!jc || !jc.isConfigured()) { jbOpen(); return; }
        const b = _store(); if (!_cfgReady(b)) { jbOpen(); return; }
        const f = _fcs().find(x => String(x.internalId) === String(internalId)); if (!f) return;
        try { const id = await _pushFc(f, b); b.lastPush = new Date().toISOString(); _save(); _renderFcPanel(); _toast(f.fcId + ' → Jama item ' + id, 'success'); }
        catch (e) { _toast(f.fcId + ': ' + String((e && e.message) || e), 'warn'); }
    }
    async function jbPullOne(internalId) {
        const jc = _jc(); if (!jc || !jc.isConfigured()) { jbOpen(); return; }
        const b = _store();
        try { const n = await _pullFc(internalId, b); b.lastPull = new Date().toISOString(); _save(); _renderFcPanel(); _toast(((b.fcMap[String(internalId)] || {}).fcId || 'FC') + ': ' + n + ' traced item(s) pulled.', 'success'); }
        catch (e) { _toast(String((e && e.message) || e), 'warn'); }
    }

    // ----------------------------------------------- FC-level live surface
    // The FCs live in Safety Lab — this panel, on the AC FHA view itself,
    // shows each FC's Jama mapping and everything the program has traced to
    // it, with per-row push/pull. The trace is visible where the FC lives,
    // not just inside a bow-tie.
    function _ago(iso) {
        if (!iso) return '';
        const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
        return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';
    }
    function _jamaItemUrl(jamaId) {
        try { const base = _jc() && _jc().getBaseUrl && _jc().getBaseUrl(); return base ? base + '/perspective.req#/items/' + jamaId : ''; } catch (_) { return ''; }
    }
    function _renderFcPanel() {
        const view = document.getElementById('view-reqs-repo'); if (!view) return;
        let host = document.getElementById('jb-fc-panel');
        if (!host) { host = document.createElement('div'); host.id = 'jb-fc-panel'; host.style.cssText = 'margin-top:18px;'; view.appendChild(host); }
        const b = _store();
        const fcs = _fcs();
        const rq0 = _pc().reqifBridge || { fcMap: {}, relMap: {} };
        const mapped = fcs.filter(f => b.fcMap[String(f.internalId)] || (rq0.fcMap || {})[String(f.internalId)]).length;
        const traced = fcs.filter(f => ((b.relMap[String(f.internalId)] || []).length + (((rq0.relMap || {})[String(f.internalId)]) || []).length) > 0).length;

        let html = '<div style="border:1px solid var(--color-border-hair,rgba(0,0,0,.14));border-radius:var(--r-lg,12px);padding:14px 16px;background:var(--color-surface,#fff);">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' +
            '<strong style="font-size:14px;">Requirements traceability — live <span style="font-weight:400;font-size:11.5px;color:var(--color-text-tertiary,#888);">FCs exist here; the program traces to them in its RM tool (Jama live · ReqIF for DOORS / Polarion / Codebeamer); the graph comes back</span></strong>' +
            '<span style="display:flex;gap:6px;flex-wrap:wrap;">' + (function () {
                // declared toolchain drives which lane leads; the other stays available, dimmed
                let tc = null; try { tc = (typeof window.declaredToolchain === 'function') ? window.declaredToolchain() : null; } catch (_) {}
                const rmTool = tc && tc.rm && tc.rm.tool || '';
                const dim = 'opacity:.45;';
                const jamaDim = rmTool && rmTool !== 'jama' ? dim : '';
                const reqifDim = rmTool === 'jama' && tc.rm.mode === 'live' ? dim : '';
                const rmName = tc && tc.rmLabel ? tc.rmLabel : '';
                const dimNote = t => t ? ' (declared toolchain: ' + t + ' — still available)' : '';
                const jamaBtns =
                    '<button onclick="jbOpen()" style="font-size:11.5px;padding:4px 9px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;background:transparent;cursor:pointer;' + jamaDim + '">⚙ Jama settings</button>' +
                    '<button class="btn-cyan" onclick="jbPushAllQuiet()" style="font-size:11.5px;' + jamaDim + '" title="Create Jama items for every unmapped FC.' + (jamaDim ? dimNote(rmName) : '') + '">▲ Push missing</button>' +
                    '<button class="btn-cyan" onclick="jbPullAllQuiet()" style="font-size:11.5px;' + jamaDim + '" title="Refresh the relationship graph for every mapped FC.' + (jamaDim ? dimNote(rmName) : '') + '">▼ Pull all</button>';
                const reqifLabel = rmTool && rmTool !== 'jama' && rmName ? ' for ' + _esc(rmName) : '';
                const reqifBtns =
                    '<button onclick="reqifExport()" style="font-size:11.5px;padding:4px 9px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;background:transparent;cursor:pointer;' + reqifDim + '" title="Export the FCs as a ReqIF package — DOORS / DOORS Next / Polarion / Codebeamer / Windchill all import it. File-based: works on air-gapped and ITAR programs.">📄 Export ReqIF' + reqifLabel + '</button>' +
                    '<button onclick="reqifImport()" style="font-size:11.5px;padding:4px 9px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));border-radius:6px;background:transparent;cursor:pointer;' + reqifDim + '" title="Import the program\'s ReqIF response — SPEC-RELATIONS touching our FC objects become ⛓ traces, same as a Jama pull.">📂 Import ReqIF</button>';
                const declareHint = !rmTool ? '<button onclick="try{switchTab(\'spp\')}catch(e){}" style="font-size:11.5px;padding:4px 9px;border:1px dashed var(--color-warning,#b7791f);color:var(--color-warning,#b7791f);border-radius:6px;background:transparent;cursor:pointer;" title="Declare the program\'s RM tool in the Safety Program Plan — the interfaces here wire themselves to the declaration.">Declare RM tool (SPP)</button>' : '';
                // declared lane leads
                return (rmTool && rmTool !== 'jama') ? (reqifBtns + jamaBtns + declareHint) : (jamaBtns + reqifBtns + declareHint);
            })() + '</span></div>';
        html += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin-bottom:10px;color:var(--color-text-secondary,#666);">' +
            '<span><strong>' + mapped + '</strong>/' + fcs.length + ' FCs in Jama</span>' +
            '<span><strong>' + traced + '</strong> with traced items</span>' +
            (b.lastPull ? '<span title="' + _esc(b.lastPull) + '">last pull ' + _ago(b.lastPull) + (Date.now() - new Date(b.lastPull).getTime() > 86400000 ? ' <span style="color:var(--color-warning,#b7791f);">— refresh</span>' : '') + '</span>' : '<span style="color:var(--color-text-tertiary,#999);">never pulled</span>') + '</div>';

        html += '<table class="data-table" style="width:100%;font-size:12px;"><thead><tr><th>FC</th><th>Failure condition</th><th>RM item</th><th>Traced by the program</th><th></th></tr></thead><tbody>';
        const rq = _pc().reqifBridge || { fcMap: {}, relMap: {} };
        fcs.forEach(f => {
            const iid = String(f.internalId);
            const map = b.fcMap[iid];
            const rqMap = (rq.fcMap || {})[iid];
            const rels = (b.relMap[iid] || []).concat((rq.relMap || {})[iid] || []);
            const url = map && _jamaItemUrl(map.jamaId);
            const chips = rels.length
                ? rels.slice(0, 6).map(x => '<span class="u-mono" style="display:inline-block;border:1px solid var(--color-success,#1a7f37);color:var(--color-success,#1a7f37);border-radius:999px;padding:0 7px;margin:1px 3px 1px 0;font-size:10.5px;" title="' + _esc(x.name) + (x.description ? ' — ' + _esc(x.description.slice(0, 160)) : '') + (x.via === 'reqif' ? ' · via ReqIF exchange' : ' · via Jama') + '">⛓ ' + _esc(x.documentKey) + '</span>').join('') +
                  (rels.length > 6 ? '<span style="font-size:10.5px;color:var(--color-text-tertiary,#888);">+' + (rels.length - 6) + ' more</span>' : '')
                : ((map || rqMap) ? '<span style="font-size:11px;color:var(--color-text-tertiary,#999);">none yet — the program hasn\'t traced to it (or refresh)</span>' : '<span style="font-size:11px;color:var(--color-text-tertiary,#999);">—</span>');
            const where = map
                ? (url ? '<a href="' + _esc(url) + '" target="_blank" rel="noopener" style="color:var(--color-link,#0b57d0);">' + map.jamaId + ' ↗</a>' : String(map.jamaId))
                : rqMap
                    ? '<span title="Exported in the ReqIF package ' + _esc(String(rqMap.at || '').slice(0, 10)) + '">📄 ReqIF</span>'
                    : '<span style="color:var(--color-warning,#b7791f);">not exchanged</span>';
            html += '<tr>' +
                '<td class="u-mono" style="white-space:nowrap;">' + _esc(f.fcId) + '</td>' +
                '<td>' + _esc(f.fcDesc || '') + '</td>' +
                '<td class="u-mono" style="white-space:nowrap;">' + where + '</td>' +
                '<td>' + chips + '</td>' +
                '<td style="white-space:nowrap;font-size:11px;">' + (map
                    ? '<a href="#" onclick="jbPullOne(\'' + _esc(iid) + '\');return false;" style="color:var(--color-link,#0b57d0);">↓ pull</a>'
                    : '<a href="#" onclick="jbPushOne(\'' + _esc(iid) + '\');return false;" style="color:var(--color-link,#0b57d0);">↑ push</a>') + '</td></tr>';
        });
        html += '</tbody></table>';
        html += '<p class="cfg-hint" title="Humans assert the links in the RM tool (their system of record, their signature) — Safety Lab pushes the FCs out, pulls the graph back, and compiles bow-ties / evidence from it.">Humans trace in the RM tool · we push, pull &amp; compile · ⛓ = tier-3 trace.</p>';
        html += '</div>';
        host.innerHTML = html;
    }
    // quiet variants for the panel buttons (no modal log pane)
    async function jbPushAllQuiet() { const jc = _jc(); if (!jc || !jc.isConfigured() || !_cfgReady(_store())) { jbOpen(); return; } await jbPush(); }
    async function jbPullAllQuiet() { const jc = _jc(); if (!jc || !jc.isConfigured()) { jbOpen(); return; } await jbPull(); }

    // wire into the Requirements Repository view render — requirement traceability
    // lives in the Requirements tab, not the FHA tab.
    function _wrap() {
        if (typeof window.renderRequirementsRepository !== 'function' || window.renderRequirementsRepository._jbWrapped) return false;
        const orig = window.renderRequirementsRepository;
        const wrapped = function () { const r = orig.apply(this, arguments); try { _renderFcPanel(); } catch (_) {} return r; };
        wrapped._jbWrapped = true;
        window.renderRequirementsRepository = wrapped;
        return true;
    }
    (function () { function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
        ready(function () { let tries = 30; const t = setInterval(function () { if (_wrap() || --tries <= 0) clearInterval(t); }, 250); try { _renderFcPanel(); } catch (_) {} }); })();

    // ------------------------------------------------- consumed by bowtie.js
    // Related items the PROGRAM traced (in Jama) to the FC this bow-tie's
    // critical event resolves to. Empty array = no tier-3 data; fall back to
    // text search.
    function jbRelatedForFc(fcRow) {
        if (!fcRow) return [];
        const b = _store();
        // direct (aircraft FC) or via the system FC's acTrace(s)
        const iids = [String(fcRow.internalId)];
        [].concat(fcRow.acTrace != null && fcRow.acTrace !== '' ? [fcRow.acTrace] : [], Array.isArray(fcRow.acTraces) ? fcRow.acTraces : [])
            .forEach(ref => iids.push(String(ref)));
        const out = [];
        iids.forEach(iid => (b.relMap[iid] || []).forEach(x => out.push(x)));
        // merge the ReqIF lane (DOORS / Polarion / Codebeamer / Windchill exchange)
        try { if (typeof window.reqifRelatedForFc === 'function') window.reqifRelatedForFc(fcRow).forEach(x => out.push(x)); } catch (_) {}
        const seen = new Set();
        return out.filter(x => { const k = x.documentKey || x.jamaId; if (seen.has(k)) return false; seen.add(k); return true; });
    }

    window.jbOpen = jbOpen; window.jbPush = jbPush; window.jbPull = jbPull;
    window.jbPushOne = jbPushOne; window.jbPullOne = jbPullOne;
    window.jbPushAllQuiet = jbPushAllQuiet; window.jbPullAllQuiet = jbPullAllQuiet;
    window.jbRelatedForFc = jbRelatedForFc;
})();
