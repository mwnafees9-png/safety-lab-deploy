// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// ============================================================================
// phys_hazards.js — v1.0 — the physical hazard as a FIRST-CLASS thread object
// (Waqas's architecture ruling, 8 Aug 2026; SL-ARC-0001 §12 / §17.1 / §23).
//
// THE RULING, verbatim-adjacent: a zonal / particular-risk / common-mode
// finding with no functional consequence is a PHYSICAL hazard — installation,
// interference, leak, fire, heat, EMI, chafing — and it is NOT a functional
// hazard: writing an FHA row for it would misclassify it and hang a severity
// on the wrong kind of object. "They should show on the thread as their own
// objects, with their requirements and stuff." This module is that object:
// the TWELFTH node kind SL-ARC-0001 §17.1 records as missing.
//
// WHAT A PHYSICAL HAZARD CARRIES:
//   · identity        phId (PH-n, project counter; renameable — rename_guard
//                     carries references), title, mechanism, description
//   · its SOURCE      {kind: 'zsa'|'pra'|'cma'|'authored', ref: <the id>} —
//                     promoted from the CCA artifact that found it, by
//                     reference, never by copy (identifier references, §4.3)
//   · its REQUIREMENTS — a COMPUTED join, two ways: any requirement tracing
//                     to the phId directly, plus the requirements the CCA
//                     generators already emit for its source artifact
//                     (traceId = zoneId / praId; sourceId ac:zsa:… / ac:pra:…).
//                     Nothing is re-generated and no text is invented.
//   · its VERIFICATION & EVIDENCE — an elicited record (method / status /
//                     evidence / by) beside the computed rollup of its linked
//                     requirements' verification statuses.
//
// WHAT SWEEPS IT: gt_integrity (dangling source, orphan-without-requirement,
// stale marks), rename_guard (phId is an owner kind; zone/PRA deletions mark
// the hazard stale), INV-48 (advisory), and the golden-thread graph, where it
// renders beside the failure conditions rather than inside them.
//
// BORN MODULAR: own view + nav entry (the zonal_ui pattern), wraps switchTab.
// Store on projectConfig (auto-serialized). Bare-identifier store access
// throughout (the 3 Aug lesson).
// ============================================================================
(function () {
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : null); }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    const MECHANISMS = ['installation', 'interference', 'leak', 'fire', 'heat', 'EMI', 'chafing', 'fragment', 'other'];
    const STATUSES = ['open', 'mitigated', 'accepted', 'closed'];

    // ---------------------------------------------------------------- store
    function store() {
        const pc = _pc();
        if (!pc) return [];
        if (!Array.isArray(pc.physHazards)) pc.physHazards = [];
        return pc.physHazards;
    }
    function _nextId() {
        const pc = _pc();
        pc.physHazardCounter = (pc.physHazardCounter || 0) + 1;
        return pc.physHazardCounter;
    }
    function _mint() {
        // PH-<n>, lowest free ordinal — a renamed/hand-edited phId never collides.
        const used = new Set(store().map(p => p && p.phId));
        let n = _nextId(); let guard = 0;
        while (used.has('PH-' + n) && guard++ < 500) n = _nextId();
        return 'PH-' + n;
    }

    // ------------------------------------------------------- source resolve
    function _zsa() { return (typeof zsaData !== 'undefined' ? zsaData : []) || []; }
    function _pra() { return (typeof praData !== 'undefined' ? praData : []) || []; }
    function _cma() { return (typeof cmaData !== 'undefined' ? cmaData : []) || []; }
    function sourceRow(ph) {
        if (!ph || !ph.source) return null;
        const k = ph.source.kind, ref = String(ph.source.ref);
        if (k === 'zsa') return _zsa().find(z => z && String(z.zoneId) === ref) || null;
        if (k === 'pra') return _pra().find(p => p && String(p.praId) === ref) || null;
        if (k === 'cma') return _cma().find(c => c && String(c.cmaId) === ref) || null;
        return ph.source.kind === 'authored' ? { authored: true } : null;
    }

    // -------------------------------------------------- the requirement join
    // COMPUTED, two ways, no writes:
    //   (1) direct — the requirement traces to the phId (the first-class join);
    //   (2) via the source — the CCA generators' own requirements for the
    //       source zone/PRA (traceId = zoneId/praId, sourceId ac:zsa:…/ac:pra:…).
    function linkedReqs(ph) {
        const out = [];
        if (!ph) return out;
        const phId = String(ph.phId || '');
        const srcKind = ph.source && ph.source.kind;
        const srcRef = ph.source && String(ph.source.ref || '');
        const scan = (reqs, where) => (reqs || []).forEach(r => {
            if (!r || r.deleted) return;
            const traces = (Array.isArray(r.traceIds) ? r.traceIds : []).concat(r.traceId ? [r.traceId] : []).map(String);
            let via = null;
            if (phId && traces.indexOf(phId) >= 0) via = 'direct';
            else if (srcRef && (srcKind === 'zsa' || srcKind === 'pra')) {
                const sid = (r.reqSource && String(r.reqSource.sourceId || '')) || '';
                if (traces.indexOf(srcRef) >= 0) via = 'source-trace';
                else if (srcKind === 'zsa' && sid.indexOf(':zsa:' + srcRef) >= 0) via = 'source-generator';
                else if (srcKind === 'pra' && sid.indexOf(':pra:' + srcRef) >= 0) via = 'source-generator';
            }
            if (via) out.push({ req: r, where, via });
        });
        scan(typeof acReqData !== 'undefined' ? acReqData : [], 'AC');
        ((typeof systemsData !== 'undefined' ? systemsData : []) || []).forEach(s => s && scan(s.req, s.name || s.id));
        return out;
    }
    function verifRollup(ph) {
        const reqs = linkedReqs(ph);
        const sts = reqs.map(x => x.req.verifStatus || x.req.vvStatus || 'Planned');
        const passed = sts.filter(s => /passed|complete|closed|verified/i.test(s)).length;
        return { total: reqs.length, passed, own: (ph.verification && ph.verification.status) || '' };
    }

    // ------------------------------------------------------------ mutations
    function promote(kind, ref, by) {
        const ded = store().find(p => p && p.source && p.source.kind === kind && String(p.source.ref) === String(ref));
        if (ded) { _toast(ded.phId + ' already carries this ' + kind.toUpperCase() + ' finding.', 'info'); return ded; }
        let title = '', desc = '', mechanism = 'other';
        if (kind === 'zsa') {
            const z = _zsa().find(x => x && String(x.zoneId) === String(ref));
            if (!z) { _toast('No ZSA zone ' + ref + '.', 'warning'); return null; }
            title = 'Zone ' + z.zoneId + ' — ' + (z.interference || z.desc || 'physical hazard');
            desc = (z.interference || '') + (z.mitigation ? ' Mitigation reference: ' + z.mitigation : '');
            mechanism = 'interference';
        } else if (kind === 'pra') {
            const p = _pra().find(x => x && String(x.praId) === String(ref));
            if (!p) { _toast('No PRA ' + ref + '.', 'warning'); return null; }
            title = (p.threat || p.praId) + ' — particular-risk physical hazard';
            desc = (p.desc || p.description || '') + (p.mitigation ? ' Mitigation reference: ' + p.mitigation : '');
            mechanism = 'fragment';
        } else if (kind === 'cma') {
            const c = _cma().find(x => x && String(x.cmaId) === String(ref));
            if (!c) { _toast('No CMA ' + ref + '.', 'warning'); return null; }
            title = c.cmaId + ' — common-mode physical hazard';
            desc = (c.description || '') + (c.mitigation ? ' Mitigation reference: ' + c.mitigation : '');
            mechanism = 'installation';
        } else return null;
        const ph = {
            internalId: 'ph-' + Date.now() + '-' + store().length,
            phId: _mint(), title: title.slice(0, 160), desc, mechanism,
            source: { kind, ref: String(ref) }, status: 'open',
            verification: { method: '', status: '', evidence: '', by: '' },
            createdAt: new Date().toISOString(), by: by || ''
        };
        store().push(ph);
        _save();
        return ph;
    }
    async function phAdd() {
        const ask = (m, d) => slPrompt(m, d || '');
        const title = (await ask('Physical hazard title:', '')) || '';
        if (!title.trim()) return;
        const mech = (await ask('Mechanism (' + MECHANISMS.join(' / ') + '):', 'other')) || 'other';
        const desc = (await ask('Description:', '')) || '';
        const ph = {
            internalId: 'ph-' + Date.now() + '-' + store().length,
            phId: _mint(), title: title.trim().slice(0, 160), desc: desc.trim(),
            mechanism: MECHANISMS.indexOf(mech.trim()) >= 0 ? mech.trim() : 'other',
            source: { kind: 'authored', ref: '' }, status: 'open',
            verification: { method: '', status: '', evidence: '', by: '' },
            createdAt: new Date().toISOString(), by: ''
        };
        store().push(ph);
        _save(); _render();
    }
    function phSetStatus(internalId, status) {
        const ph = store().find(p => p && String(p.internalId) === String(internalId));
        if (!ph || STATUSES.indexOf(status) < 0) return;
        ph.status = status;
        _save(); _render();
    }
    async function phVerify(internalId) {
        const ph = store().find(p => p && String(p.internalId) === String(internalId));
        if (!ph) return;
        const ask = (m, d) => slPrompt(m, d || '');
        const v = ph.verification || {};
        const method = (await ask('Verification method (Inspection / Test / Analysis):', v.method || 'Inspection')) || '';
        const status = (await ask('Verification status (Planned / In work / Passed):', v.status || 'Planned')) || '';
        const evidence = (await ask('Evidence reference (report / photo / test id):', v.evidence || '')) || '';
        const by = (await ask('Verified / recorded by:', v.by || '')) || '';
        ph.verification = { method: method.trim(), status: status.trim(), evidence: evidence.trim(), by: by.trim(), at: new Date().toISOString() };
        _save(); _render();
    }
    async function phDelete(internalId) {
        const i = store().findIndex(p => p && String(p.internalId) === String(internalId));
        if (i < 0) return;
        if (!(await slConfirm('Delete ' + store()[i].phId + '? Requirements tracing to it will be marked stale by the delete net.', { danger: true, okText: 'Delete' }))) return;
        store().splice(i, 1);
        _save(); _render();
    }
    async function phRename(internalId) {
        const ph = store().find(p => p && String(p.internalId) === String(internalId));
        if (!ph) return;
        const to = await slPrompt('Physical hazard ID:', ph.phId);
        if (!to || !to.trim() || to.trim() === ph.phId) return;
        if (store().some(p => p && p !== ph && p.phId === to.trim())) { _toast('"' + to.trim() + '" is already in use.', 'warning'); return; }
        ph.phId = to.trim();   // rename_guard's phId kind carries the references
        _save(); _render();
    }

    // ------------------------------------------------- golden-thread graph
    // Called by _gtvBuildGraph (guarded hook): the twelfth node kind. The
    // hazard renders BESIDE the failure conditions (fc column), linked from
    // the CCA artifact that found it and forward into its requirements.
    function _graphPass(addNode, addLink, scopeSub) {
        store().forEach(ph => {
            if (!ph) return;
            const src = sourceRow(ph);
            // scoped view: include when unscoped, or when the source zone houses the scoped function
            if (scopeSub) {
                let inScope = false;
                if (ph.source && ph.source.kind === 'zsa' && src && !src.authored)
                    inScope = (src.housedFunctions || []).indexOf(scopeSub) >= 0;
                if (!inScope) return;
            }
            const dangling = ph.source && ph.source.kind !== 'authored' && !src;
            const phKey = addNode('ph', ph.phId, ph.phId + ' · ' + (ph.title || 'Physical hazard'),
                'Physical hazard · ' + (ph.mechanism || '') + ' · ' + (ph.status || 'open'),
                { kind: 'physHazard', id: ph.internalId },
                ph.obsolete ? 'obsolete' : (dangling ? 'stale' : null),
                ph.obsolete ? (ph.obsoleteReason || '') : (dangling ? 'source ' + ph.source.kind.toUpperCase() + ' ' + ph.source.ref + ' no longer exists' : ''));
            if (src && !src.authored && ph.source) {
                let ccaKey = null;
                if (ph.source.kind === 'zsa') ccaKey = addNode('cca', 'zsa:' + src.internalId, ('ZSA ' + (src.zoneId || '')).trim(), src.desc || 'Zonal', { kind: 'zsa', id: src.internalId });
                if (ph.source.kind === 'pra') ccaKey = addNode('cca', 'pra:' + src.internalId, ('PRA ' + (src.praId || '')).trim(), src.threat || 'Particular risk', { kind: 'pra', id: src.internalId });
                if (ph.source.kind === 'cma') ccaKey = addNode('cca', 'cma:' + src.internalId, ('CMA ' + (src.cmaId || '')).trim(), src.subject || 'Common mode', { kind: 'cma', id: src.internalId });
                if (ccaKey) addLink(ccaKey, phKey);
            }
            linkedReqs(ph).forEach(x => {
                const r = x.req;
                const isAc = ((typeof acReqData !== 'undefined' ? acReqData : []) || []).indexOf(r) >= 0;
                const kind = isAc ? 'acReq' : 'sysReq';
                const rk = addNode('req', kind + ':' + r.internalId, (r.traceId || r.id || ('REQ-' + r.internalId)), r.type || 'Requirement', { kind, id: r.internalId });
                addLink(phKey, rk);
                const st = r.verifStatus || r.vvStatus || 'Planned';
                addLink(rk, addNode('vv', 'st:' + st, st, 'Verification', null));
            });
        });
    }

    // ---------------------------------------------------------------- page
    function _candRows() {
        const have = new Set(store().map(p => p && p.source && (p.source.kind + ':' + p.source.ref)));
        const out = [];
        _zsa().forEach(z => { if (z && z.zoneId && (z.interference || '').trim() && !have.has('zsa:' + z.zoneId)) out.push({ kind: 'zsa', ref: z.zoneId, label: 'Zone ' + z.zoneId, text: z.interference }); });
        _pra().forEach(p => { if (p && p.praId && !have.has('pra:' + p.praId)) out.push({ kind: 'pra', ref: p.praId, label: p.praId, text: p.threat || p.desc || '' }); });
        _cma().forEach(c => { if (c && c.cmaId && !have.has('cma:' + c.cmaId)) out.push({ kind: 'cma', ref: c.cmaId, label: c.cmaId, text: (c.description || '').slice(0, 90) }); });
        return out;
    }
    function _render() {
        const host = document.getElementById('view-phys');
        if (!host) return;
        const rows = store();
        let html = '<div style="padding: var(--s-4) var(--s-5);">' +
            '<h2 style="margin-top:0;">Physical Hazards</h2>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); ">A physical hazard found by a zonal, particular-risk or common-mode study is <b>not</b> a functional hazard — no FHA row, no severity on the wrong kind of object. It is a first-class thread object here: promoted from the CCA artifact that found it (by reference), carrying its own requirements (computed join — direct traces to the PH id plus the requirements already generated for its source), its own verification record, and swept like every other edge.</p>' +
            '<div style="margin:0 0 12px;"><button class="btn-cyan" onclick="phAdd()">+ Physical hazard</button></div>';
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr>' +
            '<th>PH</th><th>Title</th><th>Mechanism</th><th>Source</th><th>Status</th><th>Requirements</th><th>Verification</th><th></th></tr></thead><tbody>';
        if (!rows.length) html += '<tr><td colspan="8" style="color:var(--color-text-tertiary);">None yet — promote a finding below, or author one.</td></tr>';
        rows.forEach(ph => {
            const src = sourceRow(ph);
            const dangling = ph.source && ph.source.kind !== 'authored' && !src;
            const vr = verifRollup(ph);
            const srcCell = ph.source.kind === 'authored'
                ? '<span class="u-muted">authored</span>'
                : '<span class="u-mono" style="font-size:11px;' + (dangling ? ' color:#8E2A2A;' : '') + '">' + _esc(ph.source.kind.toUpperCase() + ' ' + ph.source.ref) + (dangling ? ' ⚠ deleted' : '') + '</span>';
            html += '<tr>' +
                '<td class="u-mono"><a href="#" onclick="phRename(\'' + _esc(ph.internalId) + '\'); return false;" title="rename — references are carried">' + _esc(ph.phId) + '</a></td>' +
                '<td>' + _esc(ph.title) + (ph.desc ? '<div style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(ph.desc.slice(0, 110)) + '</div>' : '') + '</td>' +
                '<td class="u-mono" style="font-size:11px;">' + _esc(ph.mechanism || '') + '</td>' +
                '<td>' + srcCell + '</td>' +
                '<td><select class="state-select" style="font-size:11.5px;" onchange="phSetStatus(\'' + _esc(ph.internalId) + '\', this.value)">' +
                    STATUSES.map(s => '<option' + (ph.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></td>' +
                '<td class="u-mono" style="font-size:11.5px;' + (vr.total ? '' : ' color:#B45309;') + '">' + (vr.total ? vr.total + ' (' + vr.passed + ' verified)' : 'NONE — uncontrolled') + '</td>' +
                '<td style="font-size:11.5px;" class="clickable" onclick="phVerify(\'' + _esc(ph.internalId) + '\')">' +
                    (ph.verification && ph.verification.status
                        ? _esc(ph.verification.method + ' · ' + ph.verification.status) + (ph.verification.by ? ' <span style="color:var(--color-text-tertiary); font-size:10.5px;">' + _esc(ph.verification.by) + '</span>' : '')
                        : '<span class="prov">record…</span>') + '</td>' +
                '<td><button class="node-delete-btn-inner" style="font-size:11px;" onclick="phDelete(\'' + _esc(ph.internalId) + '\')">✕</button></td></tr>';
        });
        html += '</tbody></table>';
        const cands = _candRows();
        html += '<h3 style="margin-top:var(--s-5);">Promotion candidates — CCA findings not yet on the thread as objects</h3>' +
            '<p style="font-size:11.5px; color:var(--color-text-tertiary); font-family:var(--font-mono);">promote = create the thread object referencing the finding; the source row is untouched</p>' +
            '<table class="data-table" style="width:100%;  font-size:12px;"><tbody>' +
            (cands.length ? cands.map(c =>
                '<tr><td class="u-mono" style="width:110px;">' + _esc(c.label) + '</td><td>' + _esc((c.text || '').slice(0, 120)) + '</td>' +
                '<td style="width:110px;"><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="PHYS_HAZARDS.promote(\'' + c.kind + '\',\'' + _esc(c.ref) + '\'); _renderPhysPage();">→ promote</button></td></tr>').join('')
                : '<tr><td style="color:var(--color-text-tertiary);">Every current CCA finding with hazard text is promoted (or none carries any).</td></tr>') +
            '</tbody></table></div>';
        host.innerHTML = html;
    }
    window._renderPhysPage = _render;
    window.phAdd = phAdd;
    window.phSetStatus = phSetStatus;
    window.phVerify = phVerify;
    window.phDelete = phDelete;
    window.phRename = phRename;

    // ---- born-modular page registration (the zonal_ui pattern) ------------
    function _anchorView() { return document.getElementById('view-zonal') || document.getElementById('view-bowtie') || document.querySelector('[id^="view-"]'); }
    function _ensurePage() {
        if (!document.getElementById('view-phys')) {
            var av = _anchorView(); if (!av || !av.parentNode) return false;
            var v = document.createElement('div'); v.id = 'view-phys'; v.style.display = 'none';
            av.parentNode.insertBefore(v, av.nextSibling);
        }
        // 26 Aug 2026 — no rail row: Physical Hazards is a ZSA tab now
        // (prove_tabs v1.5, CCA consolidation — Waqas ruled it into the zonal
        // group). View still runtime-mounts above; the wrap below keeps its
        // guarded snav-phys toggle, which is simply never found.
        return true;
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._physWrapped) return;
        var orig = window.switchTab;
        var wrapped = function (tabId) {
            var r = orig.apply(this, arguments);
            try {
                var v = document.getElementById('view-phys'); if (v) v.style.display = (tabId === 'phys') ? 'block' : 'none';
                var s = document.getElementById('snav-phys'); if (s) s.classList.toggle('snav-active', tabId === 'phys');
                if (tabId === 'phys') _render();
            } catch (_) {}
            return r;
        };
        wrapped._physWrapped = true; window.switchTab = wrapped;
    })();
    function _ready(fn) { if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else if (typeof document !== 'undefined') fn(); }
    _ready(function () { var tries = 40; var t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250); });

    // ------------------------------------------------------------- INV-48
    // ADVISORY: every physical hazard is CONTROLLED — it carries at least one
    // requirement (direct or via its source), its source still resolves, and
    // a hazard marked closed carries a verification record. The uncontrolled
    // state is legitimate early; it must never be invisible.
    (function regInv48(tries) {
        if (typeof window.invRegister === 'function') {
            window.invRegister({
                id: 'INV-48', sev: 'advisory',
                name: 'Every physical hazard is controlled — a requirement traces to it (or to its source), its source resolves, and a closed hazard carries verification evidence',
                run: function () {
                    let checked = 0; const fails = [];
                    store().forEach(ph => {
                        if (!ph) return;
                        checked++;
                        const src = sourceRow(ph);
                        if (ph.source && ph.source.kind !== 'authored' && !src)
                            fails.push(ph.phId + ': source ' + ph.source.kind.toUpperCase() + ' ' + ph.source.ref + ' no longer exists — the hazard floats');
                        if (!linkedReqs(ph).length)
                            fails.push(ph.phId + ': no requirement traces to this hazard or its source — physically uncontrolled');
                        if (ph.status === 'closed' && !(ph.verification && ph.verification.status && /passed|complete/i.test(ph.verification.status)))
                            fails.push(ph.phId + ': closed without a passed verification record — closure is a claim, evidence is the argument');
                    });
                    return { checked, fails };
                }
            });
            return;
        }
        if (tries > 0) setTimeout(() => regInv48(tries - 1), 300);
    })(25);

    // ------------------------------------------------------------- exports
    window.PHYS_HAZARDS = {
        store, promote, linkedReqs, verifRollup, sourceRow,
        _graphPass, MECHANISMS: MECHANISMS.slice(), STATUSES: STATUSES.slice()
    };
})();
