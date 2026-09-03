// ============================================================================
// fcim_combined.js — v1.0 — the FCIM's Combined column editor + the
// aware/unaware pairing desk (ARP4761A §A.3 / Table A3, decided 2 Aug 2026).
//
// TWO JOBS, ONE MODAL:
//
// 1. COMBINED FAILURE CONDITIONS. Table A3's text: where sub-functions are
//    related, failure conditions COMBINING their failures should be
//    identified. Waqas's ruling: a dedicated column on the matrix. Each entry
//    is { cbId, cbDesc, withSubIds: [subId…] } on the row whose function
//    anchors the combination; partner sub-functions are referenced, and the
//    condition traces forward through extractedFCs like any other (the FHA can
//    build on it; the AI sees it). FC ids are typed manually, exactly like the
//    matrix's other FC id fields.
//
// 2. AWARE/UNAWARE PAIRING. The recorded doctrine (regression_fcim_awareness):
//    when awareness affects severity, TWO rows carry the scenario — and the
//    engineer chooses which risk governs. Waqas's ruling: a standalone Unaware
//    is LEGITIMATE (no flag); the pair is an affordance, not a police check.
//    Pairing sets { pairId, pairGoverns: 'aware'|'unaware'|'' } on BOTH rows.
//    Choosing 'aware' takes the annunciation credit — and the fcim-monitor
//    AutoReq generator (assurance_modules) emits the monitoring requirement
//    that credit owes. 'unaware' or undecided emits nothing.
//
// BORN MODULAR: renders nothing until the cell button (data-fcim-combined,
// injected by _fcimRenderCells) is clicked. Rows are found across BOTH scopes
// by internalId (unique project-wide).
// ============================================================================
(function () {
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _rerender() {
        try { if (typeof renderACFCIM === 'function') renderACFCIM(); } catch (_) {}
        try { if (typeof renderSysFcim === 'function') renderSysFcim(); } catch (_) {}
        try { if (typeof window !== 'undefined' && typeof window.renderSysFCIM === 'function') window.renderSysFCIM(); } catch (_) {}
    }
    // Locate a row by internalId in either scope. Returns { row, scope, arr, funcs }.
    function _find(id) {
        const ac = (typeof acFcimData !== 'undefined' ? acFcimData : []) || [];
        let row = ac.find(r => String(r.internalId) === String(id));
        if (row) return { row, scope: 'ac', arr: ac, funcs: (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []) || [] };
        const systems = (typeof systemsData !== 'undefined' ? systemsData : []) || [];
        for (const sys of systems) {
            row = (sys.fcim || []).find(r => String(r.internalId) === String(id));
            if (row) return { row, scope: 'sys', arr: sys.fcim, funcs: sys.functions || sys.func || [] };
        }
        return null;
    }
    // Candidate partner sub-functions (everything except the row's own).
    function _partnerIds(ctx) {
        const seen = new Set();
        (ctx.funcs || []).forEach(f => { const sid = f && (f.subId || f.funcId); if (sid && sid !== ctx.row.subId) seen.add(String(sid)); });
        // Also offer subIds present in the matrix itself (funcs list may lag).
        (ctx.arr || []).forEach(r => { if (r && r.subId && r.subId !== ctx.row.subId) seen.add(String(r.subId)); });
        return [...seen].sort();
    }
    // Candidate pair partners: same subId, different row, complementary awareness.
    function _pairCandidates(ctx) {
        return (ctx.arr || []).filter(r => r && r !== ctx.row && String(r.subId) === String(ctx.row.subId));
    }

    function open(internalId) {
        const ctx = _find(internalId);
        if (!ctx) return;
        close();
        const row = ctx.row;
        const combos = Array.isArray(row.combined) ? row.combined : [];
        const partners = _partnerIds(ctx);
        const pairCands = _pairCandidates(ctx);
        const paired = row.pairId ? (ctx.arr || []).find(r => r !== row && r.pairId === row.pairId) : null;

        const comboRows = combos.map((c, i) =>
            '<tr data-cb-i="' + i + '">' +
            '<td><input data-cb="cbId" value="' + _esc(c.cbId || '') + '" placeholder="FC ID" style="width:110px;font:inherit;font-size:12px;"></td>' +
            '<td><input data-cb="cbDesc" value="' + _esc(c.cbDesc || '') + '" placeholder="Combined failure condition" style="width:100%;font:inherit;font-size:12px;"></td>' +
            '<td><input data-cb="with" value="' + _esc((c.withSubIds || []).join(', ')) + '" placeholder="partner subIds, comma-separated" style="width:100%;font:inherit;font-size:12px;"></td>' +
            '<td><button type="button" data-cb-del="' + i + '" style="font:inherit;font-size:11px;border:none;background:transparent;color:#B03030;cursor:pointer;">remove</button></td></tr>'
        ).join('');

        const pairOpts = pairCands.map(r =>
            '<option value="' + _esc(r.internalId) + '"' + (paired && String(paired.internalId) === String(r.internalId) ? ' selected' : '') + '>' +
            _esc((r.awareness || '?') + ' — ' + [r.tlId, r.plId, r.mId].filter(Boolean).join('/')) + '</option>').join('');

        const ov = document.createElement('div');
        ov.id = 'fcim-cb-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,16,28,.55);z-index:10050;display:flex;align-items:center;justify-content:center;';
        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;color:#1b1f27;width:min(880px,95vw);max-height:88vh;overflow:auto;border-radius:12px;padding:18px 20px;box-shadow:0 24px 64px rgba(0,0,0,.4);';
        card.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:baseline;">' +
              '<div style="font-weight:800;font-size:15px;">' + _esc(row.subId || '') + ' — combined conditions &amp; pairing</div>' +
              '<button type="button" id="fcim-cb-close" style="font:inherit;border:1px solid #ccd;background:#fff;border-radius:8px;padding:4px 12px;cursor:pointer;">Close</button></div>' +
            '<h4 style="margin:12px 0 4px;font-size:13px;">Combined failure conditions <span style="font-weight:400;color:#667;">(ARP4761A Table A3 — related sub-functions)</span></h4>' +
            '<p style="font-size:11.5px;color:#667;margin:0 0 6px;">Known sub-functions: ' + (_esc(partners.join(', ')) || '—') + '</p>' +
            '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="text-align:left;">FC ID</th><th style="text-align:left;">Condition</th><th style="text-align:left;">Combined with</th><th></th></tr></thead>' +
            '<tbody id="fcim-cb-rows">' + comboRows + '</tbody></table>' +
            '<button type="button" id="fcim-cb-add" style="font:inherit;font-size:12px;margin-top:6px;border:1px dashed #8896AB;background:transparent;border-radius:8px;padding:3px 10px;cursor:pointer;">+ add combined condition</button>' +
            '<h4 style="margin:16px 0 4px;font-size:13px;">Additional conditions <span style="font-weight:400;color:#667;">(Table A3 multiplicity — beyond the primary in each cell)</span></h4>' +
            '<p style="font-size:11.5px;color:#667;margin:0 0 6px;">Partial Loss: under a complete-loss TL, split the degraded mode — one within MAC limits, one outside. Malfunction: MF2…MFn. Each gets its own FC id and traces to the FHA like the primaries. Never merge distinct conditions into one phrase.</p>' +
            '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="text-align:left;">Cell</th><th style="text-align:left;">FC ID</th><th style="text-align:left;">Condition</th><th></th></tr></thead>' +
            '<tbody id="fcim-ex-rows">' +
            ['plExtra', 'mExtra'].map(k => (Array.isArray(row[k]) ? row[k] : []).map((e, i) =>
                '<tr data-ex-k="' + k + '">' +
                '<td style="white-space:nowrap;color:#667;">' + (k === 'plExtra' ? 'Partial Loss' : 'Malfunction') + '</td>' +
                '<td><input data-ex="id" value="' + _esc(e.id || '') + '" placeholder="FC ID" style="width:110px;font:inherit;font-size:12px;"></td>' +
                '<td><input data-ex="desc" value="' + _esc(e.desc || '') + '" placeholder="Distinct condition" style="width:100%;font:inherit;font-size:12px;"></td>' +
                '<td><button type="button" data-ex-del="1" style="font:inherit;font-size:11px;border:none;background:transparent;color:#B03030;cursor:pointer;">remove</button></td></tr>').join('')).join('') +
            '</tbody></table>' +
            '<button type="button" id="fcim-ex-add-pl" style="font:inherit;font-size:12px;margin-top:6px;border:1px dashed #8896AB;background:transparent;border-radius:8px;padding:3px 10px;cursor:pointer;">+ partial-loss condition</button> ' +
            '<button type="button" id="fcim-ex-add-mf" style="font:inherit;font-size:12px;margin-top:6px;border:1px dashed #8896AB;background:transparent;border-radius:8px;padding:3px 10px;cursor:pointer;">+ malfunction condition</button>' +
            '<h4 style="margin:16px 0 4px;font-size:13px;">Aware / Unaware pair</h4>' +
            '<p style="font-size:11.5px;color:#667;margin:0 0 6px;">A standalone Unaware is legitimate. Pair two rows of this sub-function when awareness affects severity, then record which risk governs — taking the aware (lower) credit owes the monitoring requirement AutoReq will generate.</p>' +
            '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;">' +
              '<label>Partner row: <select id="fcim-cb-pair" style="font:inherit;font-size:12px;"><option value="">— unpaired —</option>' + pairOpts + '</select></label>' +
              '<label>Governing risk: <select id="fcim-cb-governs" style="font:inherit;font-size:12px;">' +
                ['', 'aware', 'unaware'].map(g => '<option value="' + g + '"' + ((row.pairGoverns || '') === g ? ' selected' : '') + '>' + (g || '— not chosen —') + '</option>').join('') +
              '</select></label></div>' +
            '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">' +
              '<button type="button" id="fcim-cb-save" style="font:inherit;font-weight:700;border:none;background:#0B2545;color:#fff;border-radius:8px;padding:7px 18px;cursor:pointer;">Save</button></div>';
        ov.appendChild(card);
        ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
        document.body.appendChild(ov);

        card.querySelector('#fcim-cb-close').onclick = close;
        card.querySelector('#fcim-cb-add').onclick = function () {
            const tb = card.querySelector('#fcim-cb-rows');
            const i = tb.children.length;
            tb.insertAdjacentHTML('beforeend',
                '<tr data-cb-i="' + i + '">' +
                '<td><input data-cb="cbId" placeholder="FC ID" style="width:110px;font:inherit;font-size:12px;"></td>' +
                '<td><input data-cb="cbDesc" placeholder="Combined failure condition" style="width:100%;font:inherit;font-size:12px;"></td>' +
                '<td><input data-cb="with" placeholder="partner subIds, comma-separated" style="width:100%;font:inherit;font-size:12px;"></td>' +
                '<td><button type="button" data-cb-del="' + i + '" style="font:inherit;font-size:11px;border:none;background:transparent;color:#B03030;cursor:pointer;">remove</button></td></tr>');
        };
        card.addEventListener('click', function (e) {
            const del = e.target && e.target.getAttribute && e.target.getAttribute('data-cb-del');
            if (del !== null && del !== undefined && del !== '') { const tr = e.target.closest('tr'); if (tr) tr.remove(); }
            if (e.target && e.target.getAttribute && e.target.getAttribute('data-ex-del')) { const tr = e.target.closest('tr'); if (tr) tr.remove(); }
        });
        const _exAdd = k => function () {
            card.querySelector('#fcim-ex-rows').insertAdjacentHTML('beforeend',
                '<tr data-ex-k="' + k + '">' +
                '<td style="white-space:nowrap;color:#667;">' + (k === 'plExtra' ? 'Partial Loss' : 'Malfunction') + '</td>' +
                '<td><input data-ex="id" placeholder="FC ID" style="width:110px;font:inherit;font-size:12px;"></td>' +
                '<td><input data-ex="desc" placeholder="Distinct condition" style="width:100%;font:inherit;font-size:12px;"></td>' +
                '<td><button type="button" data-ex-del="1" style="font:inherit;font-size:11px;border:none;background:transparent;color:#B03030;cursor:pointer;">remove</button></td></tr>');
        };
        card.querySelector('#fcim-ex-add-pl').onclick = _exAdd('plExtra');
        card.querySelector('#fcim-ex-add-mf').onclick = _exAdd('mExtra');
        card.querySelector('#fcim-cb-save').onclick = function () {
            const out = [];
            card.querySelectorAll('#fcim-cb-rows tr').forEach(tr => {
                const get = k => { const el = tr.querySelector('[data-cb="' + k + '"]'); return el ? String(el.value || '').trim() : ''; };
                const cbId = get('cbId'), cbDesc = get('cbDesc');
                const withSubIds = get('with').split(',').map(s => s.trim()).filter(Boolean);
                if (cbId || cbDesc) out.push({ cbId, cbDesc, withSubIds });
            });
            if (out.length) row.combined = out; else delete row.combined;

            // Additional conditions (Table A3 multiplicity) — plExtra / mExtra.
            // 8 Aug 2026 (mac_fcim edge): entries may carry provenance fields
            // beyond {id, desc} — macSource on MAC-adopted conditions. Rebuilding
            // from the DOM used to STRIP them (a silent no-op on the override
            // discipline), so surviving entries now carry their prior fields
            // forward, matched by id first, then by desc.
            const ex = { plExtra: [], mExtra: [] };
            const _prevEx = {};
            ['plExtra', 'mExtra'].forEach(k => { _prevEx[k] = Array.isArray(row[k]) ? row[k].slice() : []; });
            const _carry = (k, id, desc) => {
                const list = _prevEx[k];
                let i = list.findIndex(e => e && id && e.id === id);
                if (i < 0) i = list.findIndex(e => e && desc && e.desc === desc);
                return i >= 0 ? list.splice(i, 1)[0] : null;
            };
            card.querySelectorAll('#fcim-ex-rows tr').forEach(tr => {
                const k = tr.getAttribute('data-ex-k');
                const get = f => { const el = tr.querySelector('[data-ex="' + f + '"]'); return el ? String(el.value || '').trim() : ''; };
                const id = get('id'), desc = get('desc');
                if ((id || desc) && ex[k]) ex[k].push(Object.assign({}, _carry(k, id, desc) || {}, { id, desc }));
            });
            ['plExtra', 'mExtra'].forEach(k => { if (ex[k].length) row[k] = ex[k]; else delete row[k]; });

            // Pairing — symmetric, and un-pairing clears BOTH sides.
            const sel = card.querySelector('#fcim-cb-pair').value;
            const governs = card.querySelector('#fcim-cb-governs').value;
            const prev = row.pairId ? (ctx.arr || []).find(r => r !== row && r.pairId === row.pairId) : null;
            if (prev && String(prev.internalId) !== String(sel)) { delete prev.pairId; delete prev.pairGoverns; }
            if (sel) {
                const partner = (ctx.arr || []).find(r => String(r.internalId) === String(sel));
                if (partner) {
                    const pid = row.pairId && partner.pairId === row.pairId ? row.pairId : ('pair-' + String(row.internalId) + '-' + String(partner.internalId));
                    row.pairId = pid; partner.pairId = pid;
                    row.pairGoverns = governs; partner.pairGoverns = governs;
                }
            } else {
                delete row.pairId; delete row.pairGoverns;
            }
            // Rebuild the extracted FC sets so combined conditions trace forward now.
            try { if (typeof rebuildExtractedFCsForAllSystems === 'function') rebuildExtractedFCsForAllSystems(); } catch (_) {}
            _save();
            close();
            _rerender();
        };
    }
    function close() { const el = document.getElementById('fcim-cb-overlay'); if (el && el.parentNode) el.parentNode.removeChild(el); }

    if (typeof document !== 'undefined') {
        document.addEventListener('click', function (e) {
            const b = e.target && e.target.closest && e.target.closest('[data-fcim-combined]');
            if (b) { e.preventDefault(); open(b.getAttribute('data-fcim-combined')); }
        });
    }
    if (typeof window !== 'undefined') window.FCIM_COMBINED = { open, close };

    // ------------------------------------------------------------- INV-45
    // Waqas's ruling (2 Aug, from the FCIM screenshot Q2, scoped 2 Aug evening):
    // severities and effects belong to the FHA, never FCIM cell text. The rule
    // existed only on the AI paths (_SEV_WORD_RE refuses drafts); stored rows
    // and form entries were unchecked. Per the ruling this is an ADVISORY
    // INVARIANT ONLY — findings, no form friction. Same word list as the AI
    // path so the two rules can never disagree.
    if (typeof window !== 'undefined') {
        var _INV45_RE = /\b(catastrophic|hazardous|major|minor|no safety effect)\b|\bseverity\b/i;
        (function regInv45(tries) {
            if (typeof window.invRegister === 'function') {
                window.invRegister({
                    id: 'INV-45', sev: 'advisory',
                    name: 'FCIM cells carry CONDITIONS only — no severity words or effects text (severities live in the FHA)',
                    run: function () {
                        var checked = 0, fails = [];
                        var scan = function (rows, where) {
                            ((rows || [])).forEach(function (r) {
                                if (!r) return;
                                var cells = [['TL', r.tlDesc], ['PL', r.plDesc], ['M', r.mDesc]]
                                    .concat((Array.isArray(r.plExtra) ? r.plExtra : []).map(function (e, i) { return ['PL' + (i + 2), e && e.desc]; }))
                                    .concat((Array.isArray(r.mExtra) ? r.mExtra : []).map(function (e, i) { return ['M' + (i + 2), e && e.desc]; }));
                                cells.forEach(function (c) {
                                    if (!c[1]) return;
                                    checked++;
                                    if (_INV45_RE.test(String(c[1]))) fails.push(where + ' ' + (r.subId || ('#' + r.internalId)) + ' ' + c[0] + ': severity word in cell text');
                                });
                            });
                        };
                        try { scan(typeof acFcimData !== 'undefined' ? acFcimData : [], 'AC FCIM'); } catch (_) {}
                        try { ((typeof systemsData !== 'undefined' ? systemsData : []) || []).forEach(function (sy) { sy && scan(sy.fcim, (sy.name || sy.id) + ' FCIM'); }); } catch (_) {}
                        return { checked: checked, fails: fails };
                    }
                });
                return;
            }
            if (tries > 0) setTimeout(function () { regInv45(tries - 1); }, 300);
        })(25);
    }
})();
