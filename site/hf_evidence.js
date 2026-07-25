// ============================================================================
// hf_evidence.js — v0.1 — SIM-1: HFA evidence ingest — trial OUTCOMES enter
// the assumption lane as typed, cited records. No simulator infrastructure:
// the sim campaign (or flight test, or bench trial, or the literature) runs
// wherever it runs — what comes HERE is the outcome, with its citation.
//
//   · EVIDENCE RECORDS — projectConfig.hfEvidence: { asmId → an HF-typed
//     assumption, kind (sim-campaign / flight-test / bench-trial /
//     literature), metric (workloadBand / taskTimeS / errorRate /
//     recoveryS), value, n (sample size — demanded for trials; literature
//     cites instead), source (≥10 chars ALWAYS — uncited evidence is
//     rumor), date, by }. Refusal over repair on every field.
//   · THE COMPARISON LANE (computed, never stored) — where the evidence
//     speaks to a field the assumption actually carries, the verdict is
//     computed: a measured workload band ABOVE the assumed band CONTRADICTS
//     (the assumption was optimistic); at or below SUPPORTS. Metrics with
//     no matching assumption field INFORM — recorded, cited, waiting.
//   · NO AUTO-VALIDATION — ingesting supporting evidence never moves an
//     assumption's state. The module offers a validation SEED (the two-lane
//     doctrine: a human validates in the register, citing the evidence ids).
//     Symmetrically, INV-42 (advisory) flags a Validated/Verified HF
//     assumption whose ingested evidence CONTRADICTS it — the credited lane
//     is standing on a number the trials dispute — and evidence pointing at
//     assumptions that no longer exist.
//   · IMPORT — paste CSV (asmId,metric,value,n,source,date,kind,by) or a
//     JSON array; ALL-OR-NOTHING with row-numbered refusals. A partial
//     import that silently dropped rows would be an evidence hole.
//
// Display-lane + one authored store (hfEvidence) written only through the
// author adapter. Panel rides the HFA tab (view-hfa) via switchTab wrap.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const KINDS = ['sim-campaign', 'flight-test', 'bench-trial', 'literature'];
    const METRICS = ['workloadBand', 'taskTimeS', 'errorRate', 'recoveryS'];
    const BANDS = ['none', 'slight', 'significant', 'excessive', 'incapacitating'];

    function _store() {
        if (typeof projectConfig === 'undefined' || !projectConfig) return [];
        if (!Array.isArray(projectConfig.hfEvidence)) projectConfig.hfEvidence = [];
        return projectConfig.hfEvidence;
    }
    const _save = () => { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); else if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} };
    const _toast = (m, k) => { try { if (typeof showToast === 'function') showToast(m, k || 'info', 5600); } catch (_) {} };

    function _asms() { try { return (typeof window !== 'undefined' && typeof window.asmAll === 'function') ? (window.asmAll() || []) : []; } catch (_) { return []; } }
    const _isHf = a => !!a && (a.type === 'hf' || /human\s*factors/i.test(String(a.type || '')));
    function _asmById(id) { return _asms().find(a => a && String(a.asmId) === String(id)) || null; }

    // ---- validation of one record (returns error string or null) ------------
    function _checkRec(r) {
        if (!r) return 'empty record';
        const a = _asmById(r.asmId);
        if (!a) return 'assumption "' + r.asmId + '" not found in the register — evidence needs a target';
        if (!_isHf(a)) return r.asmId + ' is not an HF-typed assumption — the HFA evidence lane ingests against the HF lane only';
        if (KINDS.indexOf(r.kind) < 0) return 'kind must be one of ' + KINDS.join('/');
        if (METRICS.indexOf(r.metric) < 0) return 'metric must be one of ' + METRICS.join('/');
        if (r.metric === 'workloadBand') {
            if (BANDS.indexOf(String(r.value)) < 0) return 'workloadBand value must be one of ' + BANDS.join('/');
        } else {
            const v = +r.value;
            if (!isFinite(v) || v < 0) return r.metric + ' value must be a number ≥ 0';
            if (r.metric === 'errorRate' && v > 1) return 'errorRate is a proportion — 0..1';
        }
        if (r.kind !== 'literature') {
            const n = +r.n;
            if (!(n >= 1) || n !== Math.floor(n)) return 'sample size n (integer ≥ 1) required for a ' + r.kind + ' — one anecdote is n=1, say so';
        }
        if (String(r.source || '').trim().length < 10) return 'source citation required (≥10 chars) — uncited evidence is rumor';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date || ''))) return 'date required (YYYY-MM-DD)';
        if (!String(r.by || '').trim()) return 'ingested-by name required';
        return null;
    }

    // ---- author adapter ------------------------------------------------------
    function addEvidence(rec) {
        const err = _checkRec(rec);
        if (err) { _toast('Evidence refused — ' + err, 'error'); return null; }
        const st = _store();
        const id = 'HFE-' + String(st.length + 1).padStart(3, '0');
        st.push({ id: id, asmId: String(rec.asmId), kind: rec.kind, metric: rec.metric,
                  value: rec.metric === 'workloadBand' ? String(rec.value) : +rec.value,
                  n: rec.kind === 'literature' ? (rec.n ? +rec.n : null) : +rec.n,
                  source: String(rec.source).trim(), date: rec.date, by: String(rec.by).trim(),
                  note: String(rec.note || '').trim() || null });
        _save();
        return id;
    }
    function rmEvidence(id) {
        const st = _store();
        const i = st.findIndex(x => x.id === id);
        if (i >= 0) { st.splice(i, 1); _save(); return true; }
        return false;
    }

    // ---- ALL-OR-NOTHING import ----------------------------------------------
    // CSV columns: asmId,metric,value,n,source,date,kind,by   (kind/by may be
    // defaulted per-import via opts). JSON: an array of record objects.
    function importRows(text, opts) {
        opts = opts || {};
        let rows = [];
        const t = String(text || '').trim();
        if (!t) return { ok: false, errors: ['nothing to import'] };
        if (t[0] === '[') {
            try { rows = JSON.parse(t); } catch (e) { return { ok: false, errors: ['JSON parse: ' + e.message] }; }
            if (!Array.isArray(rows)) return { ok: false, errors: ['JSON must be an array of records'] };
        } else {
            rows = t.split(/\r?\n/).filter(ln => ln.trim() && !/^asmId\s*,/i.test(ln)).map(ln => {
                const c = ln.split(',').map(x => x.trim());
                return { asmId: c[0], metric: c[1], value: c[2], n: c[3] || null,
                         source: c[4] || '', date: c[5] || '', kind: c[6] || opts.kind || 'sim-campaign', by: c[7] || opts.by || '' };
            });
        }
        const errors = [];
        rows.forEach((r, i) => { const e = _checkRec(r); if (e) errors.push('row ' + (i + 1) + ': ' + e); });
        if (errors.length) return { ok: false, errors: errors };   // nothing written
        const ids = rows.map(r => addEvidence(r)).filter(Boolean);
        return { ok: true, imported: ids.length, ids: ids };
    }

    // ---- the comparison lane (computed) -------------------------------------
    function verdictFor(ev) {
        const a = _asmById(ev.asmId);
        if (!a) return { verdict: 'orphan', why: 'assumption ' + ev.asmId + ' no longer exists' };
        if (ev.metric === 'workloadBand' && a.hf && a.hf.workloadBand && BANDS.indexOf(a.hf.workloadBand) >= 0) {
            const meas = BANDS.indexOf(ev.value), asm = BANDS.indexOf(a.hf.workloadBand);
            if (meas > asm) return { verdict: 'contradicts', why: 'measured "' + ev.value + '" above the assumed "' + a.hf.workloadBand + '" — the assumption was optimistic' };
            return { verdict: 'supports', why: 'measured "' + ev.value + '" at or below the assumed "' + a.hf.workloadBand + '"' + (meas < asm ? ' (assumption conservative)' : '') };
        }
        return { verdict: 'informs', why: 'no matching field on the assumption to compare against — recorded and cited, waiting for its question' };
    }
    function asmRollup(asmId) {
        const rows = _store().filter(e => String(e.asmId) === String(asmId)).map(e => ({ ev: e, v: verdictFor(e) }));
        const n = k => rows.filter(x => x.v.verdict === k).length;
        const roll = { asmId: String(asmId), rows: rows, supports: n('supports'), contradicts: n('contradicts'), informs: n('informs'), total: rows.length };
        roll.validationSeed = (roll.supports > 0 && roll.contradicts === 0)
            ? 'Validation seed — ' + roll.supports + ' supporting cited record(s) (' + rows.filter(x => x.v.verdict === 'supports').map(x => x.ev.id).join(', ') + '). Validate ' + asmId + ' IN THE REGISTER, citing them; ingest never validates by itself.'
            : null;
        return roll;
    }

    // ---- INV-42 (advisory) ---------------------------------------------------
    if (typeof invRegister === 'function') {
        invRegister({ id: 'INV-42', sev: 'advisory',
            name: 'HFA evidence discipline — no validated HF assumption stands against contradicting trial evidence; no evidence orphaned',
            run: function () {
                try {
                    const st = _store();
                    if (!st.length) return { checked: 0, fails: [] };
                    const fails = [];
                    const byAsm = {};
                    st.forEach(e => { (byAsm[e.asmId] = byAsm[e.asmId] || []).push(e); });
                    Object.keys(byAsm).forEach(id => {
                        const a = _asmById(id);
                        if (!a) { fails.push('evidence ' + byAsm[id].map(e => e.id).join(', ') + ' points at assumption ' + id + ' which no longer exists — orphaned evidence is unusable evidence'); return; }
                        const roll = asmRollup(id);
                        const validated = a.state === 'Validated' || a.state === 'Verified';
                        if (validated && roll.contradicts > 0)
                            fails.push(id + ' is ' + a.state + ' but ' + roll.contradicts + ' ingested record(s) CONTRADICT it — the credited lane stands on a number the trials dispute; revisit the validation');
                    });
                    return { checked: st.length, fails: fails };
                } catch (_) { return { checked: 0, fails: [] }; }
            } });
    }

    // ---- panel on the HFA tab -----------------------------------------------
    function renderEvidencePanel() {
        if (typeof document === 'undefined') return;
        const view = document.getElementById('view-hfa');
        if (!view) return;
        let card = document.getElementById('hfe-card');
        if (!card) { card = document.createElement('div'); card.id = 'hfe-card'; view.appendChild(card); }
        const st = _store();
        const hfAsms = _asms().filter(_isHf);
        const groups = {};
        st.forEach(e => { (groups[e.asmId] = groups[e.asmId] || []).push(e); });
        card.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:16px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary);"><b>HFA evidence ingest — trial outcomes, cited</b>' +
            ' <span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">outcomes in, citations demanded, validation stays human (SIM-1)</span></div>' +
            '<div style="padding:10px 14px;">' +
            (st.length === 0 ? '<div style="font-size:11.5px; color:var(--color-text-tertiary);">No evidence ingested yet — paste sim-campaign / flight-test / bench-trial outcomes below.</div>' :
                Object.keys(groups).map(id => {
                    const roll = asmRollup(id);
                    return '<div style="margin-bottom:10px;"><b class="u-mono" style="font-size:11.5px;">' + _esc(id) + '</b> ' +
                        '<span class="u-mono" style="font-size:10px;">' + roll.supports + ' support · ' +
                        (roll.contradicts ? '<b style="color:#B91C1C;">' + roll.contradicts + ' CONTRADICT</b>' : '0 contradict') + ' · ' + roll.informs + ' inform</span>' +
                        '<table class="data-table" style="width:100%; font-size:10.5px; margin-top:3px;"><tbody>' +
                        roll.rows.map(x => '<tr><td class="u-mono">' + _esc(x.ev.id) + '</td><td>' + _esc(x.ev.kind) + '</td>' +
                            '<td class="u-mono">' + _esc(x.ev.metric) + ' = ' + _esc(String(x.ev.value)) + (x.ev.n ? ' (n=' + x.ev.n + ')' : '') + '</td>' +
                            '<td>' + (x.v.verdict === 'contradicts' ? '<b style="color:#B91C1C;">CONTRADICTS</b>' : x.v.verdict) + '</td>' +
                            '<td style="font-size:9.5px; color:var(--color-text-tertiary);" title="' + _esc(x.v.why) + '">' + _esc(x.ev.source.slice(0, 46)) + ' · ' + _esc(x.ev.date) + '</td>' +
                            '<td><button class="action-btn btn-red" style="font-size:9px;" onclick="HF_EVIDENCE.uiRm(\'' + _esc(x.ev.id) + '\')">X</button></td></tr>').join('') +
                        '</tbody></table>' +
                        (roll.validationSeed ? '<div style="font-size:10px; color:#1D6E3E; margin-top:2px;">' + _esc(roll.validationSeed) + '</div>' : '') +
                        '</div>';
                }).join('')) +
            '<div style="margin-top:8px; font-size:11px;">' +
            '<textarea id="hfe-import" rows="3" style="width:100%; font-family:var(--font-mono); font-size:10.5px;" placeholder="CSV: asmId,metric,value,n,source,date[,kind,by]   — or a JSON array. All-or-nothing: any bad row refuses the whole paste."></textarea>' +
            '<div style="display:flex; gap:8px; margin-top:4px; align-items:center;">' +
            '<input id="hfe-by" placeholder="ingested by (default for rows)" style="width:170px;">' +
            '<select id="hfe-kind">' + KINDS.map(k => '<option>' + k + '</option>').join('') + '</select>' +
            '<button class="ckpt-m-btn" style="font-size:10.5px;" onclick="HF_EVIDENCE.uiImport()">import (all-or-nothing)</button>' +
            '<span style="font-size:10px; color:var(--color-text-tertiary);">' + hfAsms.length + ' HF-typed assumption(s) available as targets</span></div></div></div>';
    }
    function uiImport() {
        const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
        const r = importRows(g('hfe-import'), { by: g('hfe-by'), kind: g('hfe-kind') });
        if (!r.ok) { _toast('Import refused (nothing written):\n' + r.errors.slice(0, 5).join('\n') + (r.errors.length > 5 ? '\n… +' + (r.errors.length - 5) + ' more' : ''), 'error'); return; }
        _toast(r.imported + ' evidence record(s) ingested — verdicts computed against the register.', 'success');
        renderEvidencePanel();
    }
    function uiRm(id) { if (rmEvidence(id)) renderEvidencePanel(); }

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wrapNav() {
            if (typeof window.switchTab !== 'function' || window.switchTab._hfeWrapped) return;
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'hfa') renderEvidencePanel(); } catch (_) {}
                return r;
            };
            wrapped._hfeWrapped = true;
            window.switchTab = wrapped;
        })();
    }

    const API = { KINDS, METRICS, BANDS, addEvidence, rmEvidence, importRows, verdictFor, asmRollup, renderEvidencePanel, uiImport, uiRm };
    if (typeof window !== 'undefined') window.HF_EVIDENCE = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
