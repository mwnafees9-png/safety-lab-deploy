// ============================================================================
// ram_ai.js — v1.3 — WS-C: the R&M suite wired to the AI assistant.
//
// TEXT ONLY, by construction. The R&M math lane (λ, MTTR, Ai/Ao, intervals,
// spares, growth, demonstration) is deterministic and stays that way — this
// module lets the AI draft the WORDS the suite needs a human to write:
//
//   ram.fracas.draft    — FRACAS finding narrative + proposed corrective-action
//                         prose for a field record (context: predicted vs
//                         observed, verdict, linked basic event / threads).
//   ram.msg3.rationale  — MSG-3 task-selection rationale for a functional
//                         failure (context: MSI, FF, category, disposition).
//   (report narrative)  — the R&M Program Report drafts through the standard
//                         section editor + E2 fidelity pipeline (reports.js).
//
// Guardrails, same as everywhere: the model is FORBIDDEN from proposing any
// number, rate, interval, or verdict — those lanes are computed or elicited.
// Every draft is review-gated (Accept/Discard modal, editable before accept),
// carries aiGenerated/aiFeature/aiModel provenance on the record, logs its
// load-bearing assumptions (with document citations, machine-verified) into
// the AI-assumptions ledger, and surfaces a #1 confidence pill in the UI and
// an Origin column in final outputs.
//
// BORN MODULAR: new file; wraps renderRamRelPage / renderMsg3Page to inject
// affordances; zero edits to the R&M modules.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    function _store() { return (typeof window._ramStore === 'function') ? window._ramStore() : { tasks: [], field: [] }; }

    // ------------------------------------------------------------ AI plumbing
    async function _lane() {
        try { if (typeof window.slLoadAI === 'function') await window.slLoadAI(); } catch (_) {}
        const P = window.SafetyLabAI;
        if (!(P && typeof P.complete === 'function')) { _toast('AI assistant not available — Pro+ with AI enabled is required.', 'warning', 4000); return null; }
        return P;
    }
    const _NUM_BAN = 'HARD RULE: you draft PROSE ONLY. Never propose, alter, or estimate any number — no failure rates, probabilities, intervals, hours, task periodicities, or quantitative verdicts. If a number belongs in the text, reference the computed value by name (e.g. "the demonstrated MTBF") and let the engineer/engine supply it.';
    const _ASM_CLAUSE = 'In ADDITION to your JSON output, include a top-level "assumptions" array declaring every load-bearing assumption ({"text","type":"data"|"operational"|"architecture"|"other","rationale","ifWrong","usedFor","citations":[{"doc","quote","where"}]}). Citation quotes must be VERBATIM from supplied source documents; if none support the assumption, use "citations": [] — an honestly uncited assumption is correct, a fabricated citation is a serious failure. Return [] if you relied on none.';

    // ---- Skills V1.3 (2 Sep 2026) — the two RAM prose features join the registry ----
    // Both had shipped as inline prompts with no version, hash or stamp — the same gap
    // the HF pair had. These constants are the bodies as shipped, byte-identical to the
    // registry's copies (regression_ram_determinism pins the parity); the registry serves
    // them and these remain the fallback when it is absent. Numbers stay banned either way:
    // _NUM_BAN is part of the body, so a registry edit that dropped it would move the hash.
    const _SPEC_FRACAS = 'You are drafting FRACAS prose for an aerospace R&M engineer. ' + _NUM_BAN + ' Respond ONLY with JSON {"narrative":"…","action":"…","assumptions":[…]}. ' +
                    '"narrative": a factual finding narrative (≤120 words) describing what the field data shows relative to the prediction, in advisory register — no compliance claims. ' +
                    '"action": proposed corrective-action prose (≤80 words) — investigation/containment/root-cause steps; if the verdict is "verified", propose a concise concurrence note instead. ' + _ASM_CLAUSE;
    const _SPEC_MSG3 = 'You are drafting MSG-3 task-selection rationale prose for an aerospace maintenance engineer. ' + _NUM_BAN + ' Respond ONLY with JSON {"rationale":"…","assumptions":[…]}. ' +
                    '"rationale" (≤110 words): why this functional failure lands in its MSG-3 category, why the selected task type(s) are applicable and effective (or why the open/redesign state stands), grounded ONLY in the provided context. Reference intervals by name ("at the selected interval"), never a number. ' + _ASM_CLAUSE;
    function _skillBody(feature, inline) {
        try { const S = window.SLABSkills; if (S && typeof S.bodyFor === 'function') { const b = S.bodyFor(feature); if (b) return b; } } catch (_) {}
        return inline;
    }
    function _skillStamp(feature) {
        try { const S = window.SLABSkills; if (S && typeof S.stampFor === 'function') return S.stampFor(feature) || null; } catch (_) {}
        return null;
    }

    function _parseJson(text) {
        try { return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch (_) {}
        try { const m = String(text).match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch (_) {}
        return null;
    }
    function _logAssumptions(list, feature, label) {
        try {
            if (!Array.isArray(list) || !window.SafetyLabAiAssumptions) return;
            list.forEach(a => {
                if (!a || !a.text) return;
                window.SafetyLabAiAssumptions.add({
                    analysis: feature, analysisLabel: label, text: String(a.text), type: a.type || 'other',
                    status: 'Open', at: Date.now(),
                    rationale: a.rationale, ifWrong: a.ifWrong || a.if_wrong, usedFor: a.usedFor || a.used_for,
                    citations: a.citations,
                });
            });
        } catch (_) {}
    }
    function _prov(rec) { try { if (window.AiFidelity && window.AiFidelity.recordProvenance) window.AiFidelity.recordProvenance(rec); } catch (_) {} }

    // Review-gated draft modal — the engineer edits/accepts/discards; nothing
    // lands on the record without the click.
    function _draftModal(title, fields, onAccept) {
        const old = document.getElementById('ram-ai-modal'); if (old) old.remove();
        const ov = document.createElement('div');
        ov.id = 'ram-ai-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99996;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;';
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        const inner = fields.map((f, i) =>
            '<div style="font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--color-text-tertiary);margin:10px 0 3px;">' + _esc(f.label) + '</div>' +
            '<textarea id="ram-ai-f' + i + '" style="width:100%;min-height:70px;padding:8px 10px;font-size:12.5px;line-height:1.5;box-sizing:border-box;border:1px solid var(--color-border-hair);background:var(--color-surface-1);color:var(--color-text-primary);resize:vertical;">' + _esc(f.value) + '</textarea>'
        ).join('');
        ov.innerHTML = '<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);width:100%;max-height:86vh;overflow:auto;border:1px solid var(--color-border-strong,#333);padding:16px 20px;" onclick="event.stopPropagation()">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--color-text-primary,#111);padding-bottom:8px;"><b style="font-size:13.5px;">' + _esc(title) + '</b>' +
            '<button class="ckpt-m-btn" style="font-size:11px;padding:2px 10px;" onclick="document.getElementById(\'ram-ai-modal\').remove()">✕</button></div>' +
            '<p style="font-size:11px;color:var(--color-text-tertiary);margin:8px 0 0;">AI-drafted prose — edit freely, then accept. Numbers stay with the engine; assumptions the model declared are logged (with citations, machine-verified) in the AI Assumptions tab.</p>' +
            inner +
            '<div style="display:flex;gap:8px;margin-top:14px;">' +
            '<button class="ckpt-m-btn" id="ram-ai-accept" style="font-size:12px;padding:6px 16px;color:#166534;font-weight:700;">✓ Accept into record</button>' +
            '<button class="ckpt-m-btn" style="font-size:12px;padding:6px 14px;" onclick="document.getElementById(\'ram-ai-modal\').remove()">Discard</button></div></div>';
        document.body.appendChild(ov);
        const orig = fields.map(f => f.value);
        document.getElementById('ram-ai-accept').onclick = function () {
            const vals = fields.map((f, i) => { const el = document.getElementById('ram-ai-f' + i); return el ? el.value : f.value; });
            const edited = vals.some((v, i) => v !== orig[i]);
            ov.remove();
            onAccept(vals, edited);
        };
    }

    function _docsBlock() {
        try {
            const docs = (window.SafetyLabSourceDocs && window.SafetyLabSourceDocs.list()) || [];
            if (!docs.length) return '';
            return '\n\n--- Source documents on file (cite verbatim from these ONLY) ---\n' +
                docs.map(d => '[' + d.name + ']\n' + String(d.text || '').slice(0, 6000)).join('\n\n').slice(0, 24000);
        } catch (_) { return ''; }
    }

    // ------------------------------------------------ ram.fracas.draft ------
    async function ramAiFracas(id) {
        const f = (_store().field || []).find(x => x && x.id === id);
        if (!f) return;
        const P = await _lane(); if (!P) return;
        let ctxRow = null;
        try { ctxRow = (typeof window.ramFieldRows === 'function') ? window.ramFieldRows().find(x => x.f && x.f.id === id) : null; } catch (_) {}
        const ctx = {
            record: { id: f.id, basicEvent: f.beRef, windowMonths: f.windowMonths, hours: f.hours, failures: f.failures, observedMtbf: f.observedMtbf, reportedBy: f.by },
            evaluation: ctxRow ? { predictedMtbfH: ctxRow.predicted, mtbfLcbH: ctxRow.lcb, verdict: ctxRow.verdict } : null,
            existingAction: f.action || null,
        };
        _toast('Drafting FRACAS narrative…', 'info', 2500);
        let r;
        try {
            r = await P.complete({
                feature: 'ram.fracas.draft',
                system: _skillBody('ram.fracas.draft', _SPEC_FRACAS),
                messages: [{ role: 'user', content: 'FRACAS context (computed by the deterministic engine — reference these values by name, never restate or invent numbers beyond quoting them):\n' + JSON.stringify(ctx, null, 1) + _docsBlock() }],
                maxTokens: 900, temperature: 0.2,
            });
        } catch (e) { _toast('Draft failed: ' + (e && e.message || e), 'error', 4500); return; }
        const j = _parseJson(r && r.text) || {};
        _logAssumptions(j.assumptions, 'ram.fracas.draft', 'R&M FRACAS');
        _prov({ kind: 'draft', feature: 'ram.fracas.draft', section: f.id, model: (r && r.model) || '' });
        _draftModal('FRACAS draft — ' + f.id + ' (' + (f.beRef || 'unlinked') + ')', [
            { label: 'Finding narrative', value: String(j.narrative || '') },
            { label: 'Proposed corrective action', value: String(j.action || '') },
        ], (vals, edited) => {
            f.narrative = vals[0];
            f.action = vals[1];
            if (!f.actionBy) f.actionBy = '';
            f.aiGenerated = true; f.aiFeature = 'ram.fracas.draft'; f.aiSkill = _skillStamp('ram.fracas.draft'); f.aiModel = (r && r.model) || null; f.aiAt = new Date().toISOString();
            if (edited) { f.humanEdited = true; f.humanEditedAt = new Date().toISOString(); }
            try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
            _prov({ kind: 'accept', feature: 'ram.fracas.draft', section: f.id, model: (r && r.model) || '', edited: !!edited });
            _toast('FRACAS narrative + action recorded (AI-drafted' + (edited ? ', engineer-edited' : '') + ' — provenance logged).', 'success', 4000);
            try { if (typeof window.renderRamRelPage === 'function') window.renderRamRelPage(); } catch (_) {}
        });
    }

    // --------------------------------------------- ram.msg3.rationale ------
    async function ramAiMsg3(msiId, ffId) {
        const m = ((typeof projectConfig !== 'undefined' && projectConfig.msg3 && projectConfig.msg3.msis) || []).find(x => x && x.id === msiId);
        const ff = m && (m.ffs || []).find(x => x && x.id === ffId);
        if (!ff) return;
        const P = await _lane(); if (!P) return;
        let cat = null, dis = null;
        try { cat = (typeof window.msg3Category === 'function') ? window.msg3Category(ff) : null; } catch (_) {}
        try { dis = (typeof window.msg3Disposition === 'function') ? window.msg3Disposition(ff) : null; } catch (_) {}
        const ctx = {
            msi: { name: m.name, lru: m.itemId, selection: m.sel },
            functionalFailure: { func: ff.func, failure: ff.failure, effect: ff.effect, cause: ff.cause, evident: ff.evident, safety: ff.safety, operational: ff.operational },
            category: cat, disposition: dis && dis.label,
            tasks: (ff.tasks || []).map(t => ({ type: t.type, desc: t.desc, interval: t.interval, applicable: t.applicable, effective: t.effective })),
        };
        _toast('Drafting MSG-3 rationale…', 'info', 2500);
        let r;
        try {
            r = await P.complete({
                feature: 'ram.msg3.rationale',
                system: _skillBody('ram.msg3.rationale', _SPEC_MSG3),
                messages: [{ role: 'user', content: 'MSG-3 context (categories/dispositions computed deterministically):\n' + JSON.stringify(ctx, null, 1) + _docsBlock() }],
                maxTokens: 700, temperature: 0.2,
            });
        } catch (e) { _toast('Draft failed: ' + (e && e.message || e), 'error', 4500); return; }
        const j = _parseJson(r && r.text) || {};
        _logAssumptions(j.assumptions, 'ram.msg3.rationale', 'MSG-3');
        _prov({ kind: 'draft', feature: 'ram.msg3.rationale', section: msiId + '/' + ffId, model: (r && r.model) || '' });
        _draftModal('MSG-3 rationale — ' + (m.name || msiId) + ' · ' + (ff.failure || ffId), [
            { label: 'Task-selection rationale', value: String(j.rationale || '') },
        ], (vals, edited) => {
            ff.rationale = vals[0];
            ff.aiGenerated = true; ff.aiFeature = 'ram.msg3.rationale'; ff.aiSkill = _skillStamp('ram.msg3.rationale'); ff.aiModel = (r && r.model) || null; ff.aiAt = new Date().toISOString();
            if (edited) { ff.humanEdited = true; ff.humanEditedAt = new Date().toISOString(); }
            try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
            _prov({ kind: 'accept', feature: 'ram.msg3.rationale', section: msiId + '/' + ffId, model: (r && r.model) || '', edited: !!edited });
            _toast('Rationale recorded on the functional failure (AI-drafted — provenance logged; appears in the MSG-3 report).', 'success', 4500);
            try { if (typeof window.renderMsg3Page === 'function') window.renderMsg3Page(); } catch (_) {}
        });
    }

    // ------------------------------------------------ UI affordances -------
    function _pill(rec) {
        try {
            if (rec && rec.aiGenerated && window.AiBadges) {
                const c = window.AiBadges.confidence(rec, {});
                if (c) return window.AiBadges.pillHtml(c);
            }
        } catch (_) {}
        return '';
    }
    function _injectFracas() {
        const host = document.getElementById('ram-rel-host');
        if (!host) return;
        host.querySelectorAll('td[onclick^="ramFracasAction("]').forEach(td => {
            if (td.parentElement.querySelector('[data-ram-ai]')) return;
            const mid = /ramFracasAction\('([^']+)'\)/.exec(td.getAttribute('onclick') || '');
            if (!mid) return;
            const f = (_store().field || []).find(x => x && x.id === mid[1]);
            const b = document.createElement('button');
            b.setAttribute('data-ram-ai', mid[1]);
            b.className = 'ckpt-m-btn';
            b.style.cssText = 'font-size:10px;padding:0 7px;margin-left:6px;';
            b.textContent = '✨ Draft';
            b.title = 'AI-draft the finding narrative + corrective-action prose (review-gated; numbers stay with the engine)';
            b.onclick = e => { e.stopPropagation(); ramAiFracas(mid[1]); };
            td.appendChild(b);
            if (f && f.aiGenerated) td.insertAdjacentHTML('afterbegin', _pill(f));
        });
    }
    function _injectMsg3() {
        const host = document.getElementById('ram-msg3-host');
        if (!host) return;
        host.querySelectorAll('button[onclick^="msg3AddTask("]').forEach(btn => {
            if (btn.parentElement.querySelector('[data-ram-ai-ff]')) return;
            const mm = /msg3AddTask\('([^']+)','([^']+)'\)/.exec(btn.getAttribute('onclick') || '');
            if (!mm) return;
            const b = document.createElement('button');
            b.setAttribute('data-ram-ai-ff', mm[2]);
            b.className = 'ckpt-m-btn';
            b.style.cssText = 'font-size:10px;padding:0 7px;margin-left:4px;';
            b.textContent = '✨ Rationale';
            b.title = 'AI-draft the task-selection rationale for this functional failure (review-gated; text only)';
            b.onclick = e => { e.stopPropagation(); ramAiMsg3(mm[1], mm[2]); };
            btn.parentElement.insertBefore(b, btn.nextSibling);
            // Show a recorded rationale (with its confidence pill) under the anchor.
            try {
                const m = ((projectConfig.msg3 || {}).msis || []).find(x => x && x.id === mm[1]);
                const ff = m && (m.ffs || []).find(x => x && x.id === mm[2]);
                if (ff && ff.rationale && !btn.parentElement.querySelector('[data-ram-ai-rat]')) {
                    const d = document.createElement('div');
                    d.setAttribute('data-ram-ai-rat', mm[2]);
                    d.style.cssText = 'font-size:11px;color:var(--color-text-secondary);margin-top:4px;max-width:420px;';
                    d.innerHTML = _pill(ff) + '<i>' + _esc(ff.rationale) + '</i>';
                    btn.parentElement.appendChild(d);
                }
            } catch (_) {}
        });
    }
    function _wrapRender(fnName, after) {
        if (typeof window[fnName] !== 'function' || window[fnName]._ramAiWrapped) return;
        const orig = window[fnName];
        const wrapped = function () { const r = orig.apply(this, arguments); try { after(); } catch (_) {} return r; };
        wrapped._ramAiWrapped = true;
        // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
        try { if (window.SLWrap) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window[fnName] = wrapped;
    }
    function _boot() {
        _wrapRender('renderRamRelPage', _injectFracas);
        _wrapRender('renderMsg3Page', _injectMsg3);
    }
    if (typeof window !== 'undefined') { _boot(); if (typeof setTimeout === 'function') setTimeout(_boot, 0); }

    // ------------------------------------------------------------- exports
    window.ramAiFracas = ramAiFracas;
    window.ramAiMsg3 = ramAiMsg3;
    window._ramAiParseJson = _parseJson;   // headless tests
})();
