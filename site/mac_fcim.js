// ============================================================================
// mac_fcim.js — v1.0 — the MAC → FCIM edge (8 Aug 2026).
//
// SL-ARC-0001 §22 named this as the MBSA gray bar: "a minimum-acceptable-
// configuration rule floors a function, and the failure conditions on that
// function follow from where the floor sits — but the rule does not write the
// failure-condition matrix. The engineer restates by hand what the model
// already knows." The stated closure, built here verbatim: ONE edge from the
// compiled rule to the matrix — for each clause, the conditions its breach
// produces, PROPOSED AND ADOPTED rather than written, with an override flag so
// a hand-authored condition is never overwritten.
//
// WHAT IS DERIVED (per rule, from the same macBreachSetsChecked enumeration
// macCompile verifies against the BDD engine — never a second enumerator):
//   · WITHIN-MAC partial loss, one per clause that admits degradation
//     (n − min ≥ 1, or a weighted clause with a floor below total capacity):
//     the degraded states the rule still admits, as ONE condition.
//   · OUTSIDE-MAC partial loss, one per minimal breach set that is NOT the
//     complete loss of the clause's members: the configuration below the
//     floor with something still running.
//   · The COMPLETE loss (breach set == every member) is deliberately NOT
//     proposed — that is the TL cell's territory, hand-authored and bound to
//     the FHA condition macCompile already refuses without.
//
// WHERE IT LANDS: entries on the AWARE FCIM row's plExtra[] (the Table A3
// multiplicity mechanism, 2 Aug 2026), each carrying macSource provenance
// {sourceId, fingerprint, ruleId, by, at}. The override discipline:
//   · an entry WITHOUT macSource is hand-authored — never touched;
//   · an entry WITH macSource updates in place when its fingerprint moves;
//   · a macSource entry whose rule/clause no longer produces it is flagged
//     ORPHANED (macSource.orphan + reason), never deleted.
// FC ids are minted by the project's own numbering engine via
// _slAutoNumber('acFcim', row) — blank ids only, manual entries always win.
//
// INV-45 DISCIPLINE: generated cell text carries CONDITIONS only — no
// severity words (the vocabulary here is "meets / falls below the minimum
// acceptable configuration", which is the MAC's own). Pinned by test.
//
// BORN MODULAR: wraps renderMacPage (the same wrap chain mac_flows uses) and
// renders its desk under the L3 panel. Zero monolith edits.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _rules() { return (_pc().macModels || []).filter(Boolean); }
    function _sysName(id) { try { if (typeof _macSysName === 'function') return _macSysName(id); } catch (_) {} return String(id); }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _fp() { return Array.prototype.slice.call(arguments).map(x => JSON.stringify(x)).join('§'); }
    function _fcimRows() { return (typeof acFcimData !== 'undefined' ? acFcimData : []) || []; }
    // The aware row anchors the proposals (awareness dismissal / unaware
    // variants are per-condition engineer judgement, per the 2 Aug rulings).
    function _rowFor(subId) {
        const rows = _fcimRows().filter(r => r && String(r.subId) === String(subId));
        return rows.find(r => String(r.awareness || '').toLowerCase() === 'aware') || rows[0] || null;
    }

    // ------------------------------------------------------------ candidates
    function macFcimCandidates() {
        const out = [];      // { sourceId, subId, desc, fingerprint, ruleId }
        const unbound = [];  // rules with no FCIM row to land on — named, never silent
        _rules().forEach(rule => {
            if (!rule || !Array.isArray(rule.clauses) || !rule.clauses.length) return;
            const row = _rowFor(rule.subId);
            const bc = (typeof macBreachSetsChecked === 'function') ? macBreachSetsChecked(rule) : { sets: [], error: 'engine absent' };
            if (bc.error) { unbound.push({ ruleId: rule.id, subId: rule.subId, why: bc.error }); return; }
            if (!row) { unbound.push({ ruleId: rule.id, subId: rule.subId, why: 'no FCIM row for ' + rule.subId + ' — author the matrix row first' }); return; }
            const weighted = (typeof macRuleLevel === 'function') && macRuleLevel(rule) > 0;
            // ---- within-MAC: the degradation the rule still admits ----------
            rule.clauses.forEach((cl, ci) => {
                const members = (cl && cl.of) || [];
                if (!members.length) return;
                const names = members.map(_sysName);
                let desc = null;
                if (weighted) {
                    desc = 'Degraded ' + rule.subId + ' configuration over { ' + names.join(', ') + ' } with surviving capacity still meeting the minimum acceptable configuration';
                } else {
                    const admits = members.length - (cl.min || 1);
                    if (admits >= 1) desc = 'Loss of up to ' + admits + ' of { ' + names.join(', ') + ' } — remaining configuration meets the minimum acceptable configuration';
                }
                if (desc) out.push({
                    sourceId: 'macfcim:' + rule.id + ':c' + ci + ':within',
                    subId: rule.subId, rowInternalId: row.internalId, desc, ruleId: rule.id,
                    fingerprint: _fp('within', rule.id, ci, members.slice().sort(), cl.min || 1, cl.floor != null ? cl.floor : null, cl.weights || null, rule.degraded || null)
                });
            });
            // ---- outside-MAC: each minimal breach that is not complete loss --
            const memberUnion = {};
            rule.clauses.forEach(cl => ((cl && cl.of) || []).forEach(m => { memberUnion[m] = 1; }));
            bc.sets.forEach(set => {
                // a set equal to a clause's (or the union's) full membership is the TL, not a PL
                const isComplete = rule.clauses.some(cl => {
                    const of = ((cl && cl.of) || []).slice().sort();
                    const plain = set.filter(k => String(k).indexOf('deg:') !== 0).slice().sort();
                    return of.length && plain.length === of.length && of.every((m, i) => m === plain[i]) && plain.length === set.length;
                });
                if (isComplete) return;
                const label = set.map(k => String(k).indexOf('deg:') === 0
                    ? _sysName(String(k).slice(4).split(':')[0]) + ' degraded (' + String(k).slice(4).split(':').slice(1).join(':') + ')'
                    : _sysName(k)).join(' + ');
                out.push({
                    sourceId: 'macfcim:' + rule.id + ':breach:' + set.join('|'),
                    subId: rule.subId, rowInternalId: row.internalId, ruleId: rule.id,
                    desc: 'Loss of ' + label + ' — remaining configuration falls below the minimum acceptable configuration',
                    fingerprint: _fp('breach', rule.id, set)
                });
            });
        });
        return { candidates: out, unbound };
    }

    // ------------------------------------------------------ preview / apply
    function macFcimPreview() {
        const c = macFcimCandidates();
        const existing = new Map();   // sourceId -> { row, entry }
        _fcimRows().forEach(r => (Array.isArray(r && r.plExtra) ? r.plExtra : []).forEach(e => {
            if (e && e.macSource && e.macSource.sourceId) existing.set(e.macSource.sourceId, { row: r, entry: e });
        }));
        const isNew = [], isUpdated = [], unchanged = [];
        c.candidates.forEach(cd => {
            const prev = existing.get(cd.sourceId);
            if (!prev) isNew.push(cd);
            else if (prev.entry.macSource.fingerprint !== cd.fingerprint) isUpdated.push({ prev, next: cd });
            else unchanged.push({ prev, next: cd });
        });
        const candIds = new Set(c.candidates.map(x => x.sourceId));
        const orphaned = [];
        existing.forEach((v, sid) => { if (!candIds.has(sid) && !(v.entry.macSource && v.entry.macSource.orphan)) orphaned.push(v); });
        return { isNew, isUpdated, unchanged, orphaned, unbound: c.unbound };
    }

    function macFcimApply(merge, signedBy) {
        if (!signedBy || !String(signedBy).trim()) return 0;
        merge = merge || macFcimPreview();
        const at = new Date().toISOString();
        let n = 0;
        const touchedRows = new Set();
        merge.isNew.forEach(cd => {
            const row = _fcimRows().find(r => r && String(r.internalId) === String(cd.rowInternalId));
            if (!row) return;
            row.plExtra = Array.isArray(row.plExtra) ? row.plExtra : [];
            row.plExtra.push({ id: '', desc: cd.desc, macSource: { sourceId: cd.sourceId, fingerprint: cd.fingerprint, ruleId: cd.ruleId, by: signedBy, at } });
            touchedRows.add(row); n++;
        });
        merge.isUpdated.forEach(({ prev, next }) => {
            // macSource entries only — a hand-authored entry never reaches here.
            prev.entry.desc = next.desc;
            prev.entry.macSource = { sourceId: next.sourceId, fingerprint: next.fingerprint, ruleId: next.ruleId, by: signedBy, at };
            delete prev.entry.macSource.orphan;
            touchedRows.add(prev.row); n++;
        });
        merge.orphaned.forEach(v => {
            v.entry.macSource.orphan = true;
            v.entry.macSource.orphanReason = 'the MAC rule/clause no longer produces this condition — disposition it (kept, never deleted)';
            v.entry.macSource.orphanedAt = at;
            touchedRows.add(v.row); n++;
        });
        // Mint FC ids for the new blank ones through the project's own scheme —
        // manual ids always win; absent engine leaves them blank for the engineer.
        touchedRows.forEach(row => { try { if (typeof _slAutoNumber === 'function') _slAutoNumber('acFcim', row); } catch (_) {} });
        try { if (typeof rebuildExtractedFCsForAllSystems === 'function') rebuildExtractedFCsForAllSystems(); } catch (_) {}
        try { if (typeof window.jrnl === 'function') window.jrnl('mac-fcim', 'MAC → FCIM applied: ' + n + ' condition(s), signed ' + signedBy); } catch (_) {}
        if (n) _save();
        return n;
    }

    // ---------------------------------------------------------------- desk
    function _renderDesk() {
        const host = document.getElementById('mac-host');
        if (!host) return;
        let div = document.getElementById('mac-fcim-panel');
        if (!div) { div = document.createElement('div'); div.id = 'mac-fcim-panel'; host.appendChild(div); }
        if (!_rules().length) { div.innerHTML = ''; return; }
        let prev;
        try { prev = macFcimPreview(); } catch (_) { div.innerHTML = ''; return; }
        const pending = prev.isNew.length + prev.isUpdated.length + prev.orphaned.length;
        div.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:var(--s-4); padding:10px 14px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">' +
            '<b style="font-size:12px;">MAC → failure-condition matrix</b>' +
            '<span style="font-size:11.5px; color:var(--color-text-secondary);">' + prev.isNew.length + ' new · ' + prev.isUpdated.length + ' updated · ' + prev.unchanged.length + ' current · ' + prev.orphaned.length + ' orphaned' +
            (prev.unbound.length ? ' · <span style="color:#B45309;">' + prev.unbound.length + ' rule(s) with no matrix row</span>' : '') + '</span>' +
            '<span style="font-size:10.5px; color:var(--color-text-tertiary); font-family:var(--font-mono);">the floor decides which conditions exist — proposed and adopted, never written; hand-authored cells are never touched</span>' +
            '<button class="ckpt-m-btn ' + (pending ? 'ckpt-m-btn-primary' : '') + '" style="font-size:11.5px; padding:3px 12px; margin-left:auto;" onclick="macFcimModal()">Preview &amp; sign…</button></div>';
    }

    function _ensureModal() {
        let m = document.getElementById('mac-fcim-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'mac-fcim-modal';
        m.className = 'modal-overlay';
        m.innerHTML =
            '<div class="modal-content" style="max-width: 860px;">' +
            '<div class="modal-header"><h2>MAC → FCIM — proposed conditions</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="macFcimModalClose()">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px; max-height: 70vh; overflow:auto;">' +
            '<div id="mac-fcim-body"></div>' +
            '<div style="display:flex; align-items:center; gap:10px; margin-top:16px;">' +
            '<input id="mac-fcim-by" type="text" placeholder="Signature (required)" style="font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary); width:220px;">' +
            '<button id="mac-fcim-apply" class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:13px; padding:6px 18px;">Sign &amp; apply</button>' +
            '<p id="mac-fcim-err" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:0; display:none;"></p>' +
            '</div></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) window.macFcimModalClose(); });
        return m;
    }

    window.macFcimModal = function () {
        const m = _ensureModal();
        const prev = macFcimPreview();
        m._merge = prev;
        const row = (tag, color, subId, desc) =>
            '<tr><td><span style="font-size:10px; font-weight:700; color:' + color + ';">' + tag + '</span></td>' +
            '<td class="u-mono" style="font-size:11px;">' + _esc(subId) + '</td><td style="font-size:11.5px;">' + _esc(desc) + '</td></tr>';
        let html = '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0 0 10px;">Derived from the MAC breach enumeration (the same sets the compile verifies against the BDD engine). Entries land on the aware row\'s Partial-Loss extras with provenance; FC ids come from the program\'s numbering scheme. Hand-authored conditions are never touched; conditions the model no longer produces are flagged, never deleted.</p>';
        if (!prev.isNew.length && !prev.isUpdated.length && !prev.orphaned.length) {
            html += '<p style="font-size:12.5px;"><b>The matrix is current</b> — ' + prev.unchanged.length + ' condition(s) verified unchanged.</p>';
        } else {
            html += '<table class="data-table" style="width:100%;"><thead><tr><th></th><th>Function</th><th>Condition</th></tr></thead><tbody>' +
                prev.isNew.map(c => row('NEW', 'var(--color-success)', c.subId, c.desc)).join('') +
                prev.isUpdated.map(u => row('UPDATE', 'var(--color-warning)', u.next.subId, u.next.desc)).join('') +
                prev.orphaned.map(v => row('ORPHAN', 'var(--color-danger)', v.row.subId, v.entry.desc)).join('') +
                '</tbody></table>';
        }
        if (prev.unbound.length) {
            html += '<p style="font-size:11.5px; color:#B45309; margin-top:8px;">Not derivable: ' +
                prev.unbound.map(u => _esc(u.subId + ' (' + u.why + ')')).join(' · ') + '</p>';
        }
        document.getElementById('mac-fcim-body').innerHTML = html;
        document.getElementById('mac-fcim-err').style.display = 'none';
        document.getElementById('mac-fcim-apply').onclick = function () {
            const by = (document.getElementById('mac-fcim-by').value || '').trim();
            const err = document.getElementById('mac-fcim-err');
            if (!by) { err.textContent = 'A signature is required — the model proposes, you decide.'; err.style.display = 'block'; return; }
            const n = macFcimApply(m._merge, by);
            window.macFcimModalClose();
            try { if (typeof showToast === 'function') showToast('FCIM updated from the MAC model: ' + n + ' condition(s), signed ' + by + '.', 'success', 3600); } catch (_) {}
            _renderDesk();
            try { if (typeof renderACFCIM === 'function') renderACFCIM(); } catch (_) {}
        };
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('show'), 10);
    };
    window.macFcimModalClose = function () {
        const m = document.getElementById('mac-fcim-modal');
        if (!m) return;
        m.classList.remove('show');
        setTimeout(() => { m.style.display = 'none'; }, 250);
    };

    (function wrap() {
        if (typeof window.renderMacPage === 'function' && !window.renderMacPage._macFcimWrapped) {
            const orig = window.renderMacPage;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                if (typeof SLLazy !== 'undefined' && SLLazy.skipped('mac-host')) return r;   // lazy_render.js: the original was deferred, so is this companion
                try { _renderDesk(); } catch (_) {}
                return r;
            };
            wrapped._macFcimWrapped = true;
            window.renderMacPage = wrapped;
        }
    })();

    // ------------------------------------------------------------- INV-47
    // The edge, made checkable: the matrix reflects what the floor implies.
    // ADVISORY — pending proposals and unbound rules are findings to act on
    // through the desk, not hard failures.
    (function regInv47(tries) {
        if (typeof window.invRegister === 'function') {
            window.invRegister({
                id: 'INV-47', sev: 'advisory',
                name: 'The FCIM reflects the MAC floor — every rule\'s breach-derived conditions are adopted (or pending in the MAC → FCIM desk), and none is orphaned',
                run: function () {
                    let checked = 0; const fails = [];
                    try {
                        const p = macFcimPreview();
                        checked = p.isNew.length + p.isUpdated.length + p.unchanged.length + p.orphaned.length + p.unbound.length;
                        p.isNew.forEach(c => fails.push(c.subId + ': breach-derived condition not yet in the matrix — "' + c.desc.slice(0, 80) + '…" (MAC → FCIM desk)'));
                        p.isUpdated.forEach(u => fails.push(u.next.subId + ': matrix condition is stale against the rule (fingerprint moved)'));
                        p.orphaned.forEach(v => fails.push((v.row.subId || '?') + ': adopted condition the rule no longer produces — disposition it'));
                        p.unbound.forEach(u => fails.push(u.subId + ': ' + u.why));
                    } catch (_) {}
                    return { checked, fails };
                }
            });
            return;
        }
        if (tries > 0) setTimeout(() => regInv47(tries - 1), 300);
    })(25);

    // ------------------------------------------------------------- exports
    window.macFcimCandidates = macFcimCandidates;
    window.macFcimPreview = macFcimPreview;
    window.macFcimApply = macFcimApply;
})();
