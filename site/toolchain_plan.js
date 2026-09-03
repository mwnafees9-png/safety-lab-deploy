// ============================================================================
// toolchain_plan.js — v1.4 — SPP toolchain & interface declarations.
// v1.4: scope table can ADD systems (reuses promptCreateSystem) → new system
//       becomes a full System Safety directory entry; empty-state handled.
// BORN MODULAR: new file, zero monolith edits — wraps renderSppPage and
// appends its section to #spp-host.
//
// A Safety Program Plan names the program's processes AND tools. Here that
// declaration is live data instead of prose, and it is SIGNED — declaring the
// toolchain is a plan commitment, not a preference toggle. Three rows:
//
//   · SAFETY & RELIABILITY ANALYSES — Safety Lab Aero (this tool), with the
//     version string and the tool-qualification reference (DO-330 dossier).
//     This is the tool declaration a certification reviewer looks for.
//   · REQUIREMENTS MANAGEMENT — Jama / DOORS Classic / DOORS Next / Polarion /
//     Codebeamer / other / none, plus the exchange mode (live API / ReqIF).
//   · MBSE — Cameo / Capella / other / none.
//
// Everything downstream reads ONE helper — window.declaredToolchain() — and
// adapts: the FHA traceability panel leads with the declared lane and dims
// (never hides) the other, reports can name the toolchain from data, and the
// panel raises an advisory when an interface is declared but never exercised.
// Dimmed, not hidden: programs change tools mid-cert more often than anyone
// admits, and hiding capability creates support tickets.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    async function _ask(m, d) { try { if (typeof slPrompt === 'function') return await slPrompt(m, d || ''); } catch (_) {} return window.prompt(m, d || ''); }
    function _appVersion() {
        try { const s = document.querySelector('script[src*="safety_lab.js"]'); const m = s && s.src.match(/v=([\d.]+)/); if (m) return 'v' + m[1]; } catch (_) {}
        return '';
    }
    function _store() {
        const pc = _pc();
        if (!pc.toolchain) pc.toolchain = {
            sra: { tool: 'Safety Lab Aero', version: _appVersion(), qualRef: '', by: '', at: '' },
            rm: { tool: '', mode: 'reqif', by: '', at: '' },
            mbse: { tool: '', by: '', at: '' }
        };
        return pc.toolchain;
    }

    const RM_TOOLS = [['', '— not declared —'], ['jama', 'Jama Connect'], ['doors', 'IBM DOORS Classic'], ['doors-next', 'IBM DOORS Next'], ['polarion', 'Siemens Polarion'], ['codebeamer', 'PTC Codebeamer'], ['other', 'Other…']];
    const RM_MODES = [['live', 'Live API'], ['reqif', 'ReqIF exchange'], ['both', 'Live API + ReqIF']];
    const MBSE_TOOLS = [['', '— none / not used —'], ['cameo', 'Cameo Systems Modeler (CATIA Magic)'], ['capella', 'Capella'], ['other', 'Other…']];

    function declaredToolchain() {
        const t = _store();
        return {
            sra: t.sra, rm: t.rm, mbse: t.mbse,
            rmLabel: (RM_TOOLS.find(x => x[0] === (t.rm.tool || '')) || ['', ''])[1].replace('— not declared —', '') || (t.rm.toolOther || ''),
            rmLive: t.rm.tool === 'jama' && (t.rm.mode === 'live' || t.rm.mode === 'both'),
            rmReqif: !!t.rm.tool && t.rm.tool !== 'jama' || (t.rm.mode === 'reqif' || t.rm.mode === 'both')
        };
    }

    // ------------------------------------------------------------- actions
    function tcSet(section, field, val) {
        const t = _store(); t[section][field] = val;
        // declaration changed → signature no longer covers it
        if (field !== 'by' && field !== 'at') { t[section].by = ''; t[section].at = ''; }
        _save(); _render();
        try { if (typeof window.renderACFHA === 'function') renderACFHA(); } catch (_) {}
    }
    async function tcSign(section) {
        const t = _store();
        const names = { sra: 'Safety & reliability analyses — Safety Lab Aero', rm: 'Requirements management', mbse: 'MBSE' };
        const by = await _ask('Declare the ' + names[section] + ' toolchain for this program (recorded in the Safety Program Plan). Sign with your name:', (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || '');
        if (!by || !by.trim()) return;
        t[section].by = by.trim(); t[section].at = new Date().toISOString();
        _save(); _render();
    }
    async function tcOther(section) {
        const t = _store();
        const v = await _ask('Tool name:', t[section].toolOther || ''); if (v === null) return;
        t[section].toolOther = String(v).trim(); t[section].by = ''; t[section].at = '';
        _save(); _render();
    }

    // ------------------------------------------------------------- render
    function _sel(section, field, options, cur) {
        return '<select class="state-select" style="max-width:280px;" onchange="tcSet(\'' + section + '\',\'' + field + '\', this.value)' + (field === 'tool' ? '; if(this.value===\'other\')tcOther(\'' + section + '\')' : '') + '">' +
            options.map(o => '<option value="' + o[0] + '"' + (o[0] === (cur || '') ? ' selected' : '') + '>' + _esc(o[1]) + '</option>').join('') + '</select>';
    }
    function _signCell(section, rec) {
        return rec.by
            ? '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="tcSign(\'' + section + '\')" title="Re-sign">✍ ' + _esc(rec.by) + ' · ' + _esc(String(rec.at || '').slice(0, 10)) + '</button>'
            : '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px; border-color:var(--color-warning);" onclick="tcSign(\'' + section + '\')">Sign declaration</button>';
    }
    function _render() {
        const host = document.getElementById('spp-host'); if (!host) return;
        let sec = document.getElementById('spp-toolchain');
        if (!sec) { sec = document.createElement('div'); sec.id = 'spp-toolchain'; host.appendChild(sec); }
        const t = _store();
        const rmName = t.rm.tool === 'other' ? (t.rm.toolOther || 'Other') : (RM_TOOLS.find(x => x[0] === t.rm.tool) || ['', ''])[1];
        const mbseName = t.mbse.tool === 'other' ? (t.mbse.toolOther || 'Other') : (MBSE_TOOLS.find(x => x[0] === t.mbse.tool) || ['', ''])[1];
        let html = '<h4 style="margin-top: var(--s-5);">Toolchain &amp; interface declarations — the program\'s tools, as live data</h4>' +
            '<p class="cfg-hint" style="margin-bottom: var(--s-3);" title="The traceability panel leads with the declared RM lane (others stay available, dimmed), reports cite the toolchain from this record, and an unexercised declared interface is an advisory. Signatures clear when a declaration changes.">Declare the tools · interfaces wire themselves · signatures clear on change.</p>' +
            '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>Domain</th><th>Tool</th><th>Interface / reference</th><th>Signed</th></tr></thead><tbody>';
        // Safety & reliability analyses — this tool
        html += '<tr><td>Safety &amp; reliability analyses</td>' +
            '<td><strong>Safety Lab Aero</strong> <span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(t.sra.version || _appVersion()) + '</span></td>' +
            '<td><input type="text" class="state-select" style="max-width:280px;" placeholder="Tool qualification reference (e.g. DO-330 dossier, rev A)" value="' + _esc(t.sra.qualRef || '') + '" onchange="tcSet(\'sra\',\'qualRef\', this.value)"></td>' +
            '<td>' + _signCell('sra', t.sra) + '</td></tr>';
        // Requirements management
        html += '<tr><td>Requirements management</td>' +
            '<td>' + _sel('rm', 'tool', RM_TOOLS, t.rm.tool) + '</td>' +
            '<td>' + (t.rm.tool ? _sel('rm', 'mode', RM_MODES, t.rm.mode) : '<span style="color:var(--color-text-tertiary); font-size:12px;">—</span>') + '</td>' +
            '<td>' + _signCell('rm', t.rm) + '</td></tr>';
        // MBSE
        html += '<tr><td>MBSE</td>' +
            '<td>' + _sel('mbse', 'tool', MBSE_TOOLS, t.mbse.tool) + '</td>' +
            '<td>' + (t.mbse.tool ? '<span style="font-size:12px; color:var(--color-text-secondary);">' + (t.mbse.tool === 'cameo' ? 'ReqIF + SysML XMI' : t.mbse.tool === 'capella' ? 'model exchange (roadmap)' : 'per program') + '</span>' : '<span style="color:var(--color-text-tertiary); font-size:12px;">—</span>') + '</td>' +
            '<td>' + _signCell('mbse', t.mbse) + '</td></tr>';
        html += '</tbody></table>';
        // exercise advisory — declared but never exchanged
        if (t.rm.tool) {
            const jb = _pc().jamaBridge || { fcMap: {} }, rq = _pc().reqifBridge || { fcMap: {} };
            const exchanged = Object.keys(jb.fcMap || {}).length + Object.keys(rq.fcMap || {}).length;
            if (!exchanged) html += '<p style="font-size:11.5px; color:var(--color-warning);">⚠ ' + _esc(rmName) + ' is declared as the RM interface but no failure conditions have been exchanged yet — push (Jama live) or export ReqIF from the AC FHA page to exercise it.</p>';
        }
        html += _renderScope(sec);
        sec.innerHTML = html;
    }

    // ================= System scope & export control (per-system ITAR) =======
    // Export control attaches to TECHNICAL DATA ABOUT SPECIFIC SYSTEMS (an FCS
    // is USML Cat VIII(h)), not to whole projects. The SPP therefore declares,
    // per system: is it assessed on this program, and is its technical data
    // export-controlled. Taint then PROPAGATES deterministically — an aircraft
    // FC implemented by a controlled system is controlled; consumers (AI
    // routing, RM bridges, exports) read one helper and behave accordingly.
    // Jurisdiction-aware: US regimes route to the US controlled backend (Azure
    // Gov); OTHER national regimes (UK Military List, EU dual-use, national
    // rules) must NOT route to a US government cloud — they require the
    // local / on-prem backend or no AI at all. Declared per program, per system.
    const EC_OPTS = [['', 'none'],
        ['itar', 'ITAR — US (USML)'], ['ear', 'EAR — US (CCL)'],
        ['natl', 'Export controlled — other jurisdiction (UK ML / EU dual-use / national)'],
        ['cui', 'CUI / proprietary']];
    const SCOPE_OPTS = [['in', 'Assess — in scope'], ['deferred', 'Deferred'], ['out', 'Out of scope']];
    function _systems() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function tcSysSet(sysId, field, val) {
        const s = _systems().find(x => x.id === sysId); if (!s) return;
        if (field === 'scope') s.assessScope = val; else s.exportControl = val;
        const t = _store(); t.scopeBy = ''; t.scopeAt = '';   // declaration changed → re-sign
        _save(); _render();
        try { if (typeof window.renderACFHA === 'function') renderACFHA(); } catch (_) {}
    }
    async function tcSignScope() {
        const t = _store();
        const by = await _ask('Declare the system assessment scope and export-control classification for this program (recorded in the Safety Program Plan). Sign with your name:', (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || '');
        if (!by || !by.trim()) return;
        t.scopeBy = by.trim(); t.scopeAt = new Date().toISOString();
        _save(); _render();
    }
    // Add a system straight from the scope table. The scope declaration is just a
    // per-system view of systemsData, so a system authored here MUST be a real
    // System Safety directory entry — same shape, same folder, same downstream.
    // We therefore reuse the canonical creator (promptCreateSystem) rather than
    // duplicating the system shape; the new system then appears both in the
    // System Safety directory and, on re-render, in this scope table.
    async function tcAddSystem() {
        let added = false;
        if (typeof promptCreateSystem === 'function') {
            const before = _systems().length;
            await promptCreateSystem();               // prompts name + role, pushes, renders directory
            added = _systems().length > before;
        } else {
            // Fallback: mirror the canonical shape exactly if the creator isn't loaded.
            const name = await _ask("Enter new system or ATA chapter name (e.g., 'Primary Flight Displays'):", '');
            if (name && name.trim() && typeof systemsData !== 'undefined' && Array.isArray(systemsData)) {
                systemsData.push({ id: 'sys-' + Date.now(), name: name.trim(), role: 'function', asmCounter: 1, functions: [], fcim: [], extractedFCs: [], fha: [], req: [], asm: [] });
                try { if (typeof renderSystemDirectory === 'function') renderSystemDirectory(); } catch (_) {}
                added = true;
            }
        }
        if (added) {
            _save(); _render();
            try { if (typeof window.renderACFHA === 'function') renderACFHA(); } catch (_) {}
        }
    }
    function ecForSystem(sysId) {
        const s = _systems().find(x => x.id === sysId);
        return (s && s.exportControl) || '';
    }
    // worst-of taint for a failure condition: system FC → owning system;
    // aircraft FC → every implementing system of its sub-function(s).
    function ecForFc(fc) {
        try {
            if (!fc) return '';
            if (fc._systemId) return ecForSystem(fc._systemId);
            const subs = [fc.subId].concat(Array.isArray(fc.subIds) ? fc.subIds : []).filter(Boolean);
            let worst = '';
            const rank = { itar: 4, natl: 4, ear: 3, cui: 1, '': 0 };
            subs.forEach(su => {
                const impl = (typeof _idpSystemsImplementing === 'function') ? _idpSystemsImplementing(su) : [];
                impl.forEach(id => { const e = ecForSystem(id); if (rank[e] > rank[worst]) worst = e; });
            });
            return worst;
        } catch (_) { return ''; }
    }
    function ecTaintedSystems() { return _systems().filter(s => s.exportControl); }
    function _renderScope(host) {
        const t = _store();
        const sys = _systems();
        const addBtn = '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="tcAddSystem()" title="Create a new system — it becomes a full System Safety directory entry (functions, FHA, requirements) and appears here for scope &amp; export-control declaration.">+ Add system</button>';
        let html = '<h4 style="margin-top: var(--s-5);">System scope &amp; export control — per-system, as the regulations attach it</h4>' +
            '<p class="cfg-hint" style="margin-bottom: var(--s-3);" title="Control propagates deterministically: an aircraft failure condition implemented by a controlled system is controlled — AI routing, RM push and exports read this declaration. Signature clears when the declaration changes.">Per-system scope &amp; export control · taint propagates via implementing systems.</p>';
        if (!sys.length) {
            return html + '<p style="font-size:12px;color:var(--color-text-secondary);margin-bottom:var(--s-3);">No systems declared yet. Add one to create its System Safety directory and declare its scope &amp; export control.</p>' + addBtn;
        }
        const inScope = sys.filter(s => (s.assessScope || 'in') === 'in').length;
        const ec = ecTaintedSystems().length;
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th>System</th><th>Assessment scope</th><th>Export control</th></tr></thead><tbody>';
        sys.forEach(s => {
            const sel = (field, opts, cur) => '<select class="state-select" style="max-width:220px;" onchange="tcSysSet(\'' + _esc(s.id) + '\',\'' + field + '\', this.value)">' +
                opts.map(o => '<option value="' + o[0] + '"' + (o[0] === (cur || (field === 'scope' ? 'in' : '')) ? ' selected' : '') + '>' + _esc(o[1]) + '</option>').join('') + '</select>';
            html += '<tr><td>' + _esc(s.name || s.id) + '</td>' +
                '<td>' + sel('scope', SCOPE_OPTS, s.assessScope) + '</td>' +
                '<td>' + sel('ec', EC_OPTS, s.exportControl) + (s.exportControl ? ' <span style="font-size:10px;font-weight:700;color:#8E2A2A;">🔒 ' + _esc(String(s.exportControl).toUpperCase()) + '</span>' : '') + '</td></tr>';
        });
        html += '</tbody></table>';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' + addBtn +
            '<span style="font-size:12px;color:var(--color-text-secondary);">' + inScope + '/' + sys.length + ' in scope · ' + ec + ' export-controlled system(s)' +
            (ec ? ' — controlled FCs are blocked from cloud RM push (offline ReqIF lane only); AI calls touching them route to the matching controlled backend (US regimes → Azure Gov; other jurisdictions → local/on-prem only)' : '') + '</span></span>' +
            (t.scopeBy
                ? '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="tcSignScope()" title="Re-sign">✍ ' + _esc(t.scopeBy) + ' · ' + _esc(String(t.scopeAt || '').slice(0, 10)) + '</button>'
                : '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px; border-color:var(--color-warning);" onclick="tcSignScope()">Sign scope declaration</button>') + '</div>';
        return html;
    }

    // wire into the SPP render
    function _wrap() {
        if (typeof window.renderSppPage !== 'function' || window.renderSppPage._tcWrapped) return false;
        const orig = window.renderSppPage;
        const wrapped = function () { const r = orig.apply(this, arguments); try { _render(); } catch (_) {} return r; };
        wrapped._tcWrapped = true;
        window.renderSppPage = wrapped;
        return true;
    }
    (function () { function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
        ready(function () { let tries = 30; const t = setInterval(function () { if (_wrap() || --tries <= 0) clearInterval(t); }, 250); }); })();

    window.declaredToolchain = declaredToolchain;
    window.tcSet = tcSet; window.tcSign = tcSign; window.tcOther = tcOther;
    window.tcSysSet = tcSysSet; window.tcSignScope = tcSignScope; window.tcAddSystem = tcAddSystem;
    window.exportControlForFc = ecForFc; window.exportControlForSystem = ecForSystem;
    window.exportControlSystems = ecTaintedSystems;
    window._renderToolchainPlan = _render;
})();
