// ============================================================================
// zonal_ui.js — v1.0 — Z3: the Zonal Model page (authoring UI for the
// hierarchical zone tree + equipment register). BORN MODULAR: new file, zero
// monolith edits. Creates its own view + nav entry and wraps switchTab, exactly
// like bowtie.js / event_trees.js.
//
// It is a thin editor over the ZONES engine (zonal_model.js) — every mutation
// goes through ZONES.* and re-renders; the store lives on projectConfig.zones
// and persists with the project. Equipment references the SAME systemsData ids
// as the MAC/FTA model (the golden-thread identity constraint).
//
// The page also runs the deterministic physical cross-check:
//   · Preview  — PHYS_CROSSCHECK.run() (read-only): shows which credited-
//                independence claims a co-location / PRA footprint defeats.
//   · Apply    — PHYS_CROSSCHECK.materialize(): writes computed CMA findings so
//                the existing engine reverts the affected DAL letters and demands
//                the β term. Reversible; relievable via the CMA disposition.
// ============================================================================
(function () {
    'use strict';
    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _Z() { return window.ZONES; }
    function _sys() { return (typeof systemsData !== 'undefined' ? systemsData : (window.systemsData || [])); }
    function _sysName(id) { var s = _sys().find(function (x) { return x.id === id; }); return s ? s.name : id; }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }

    // ---- mutations (window-exposed for inline handlers) ------------------
    window.zoneAddMajor = function () { var c = prompt('Major zone code (e.g. 100):'); if (c === null) return; var n = prompt('Zone name:', '') || ''; _Z().addZone({ code: c, name: n }); _save(); _render(); };
    window.zoneAddSub = function (pid) { var c = prompt('Sub-zone code (e.g. 110):'); if (c === null) return; var n = prompt('Sub-zone name:', '') || ''; _Z().addZone({ code: c, name: n, parentId: pid }); _save(); _render(); };
    window.zoneRename = function (id) { var z = _Z().get(id); var n = prompt('Zone name:', z ? z.name : ''); if (n === null) return; _Z().rename(id, n); var c = prompt('Zone code:', z ? z.code : ''); if (c !== null) _Z().setCode(id, c); _save(); _render(); };
    window.zoneDelete = function (id) { if (!confirm('Delete this zone and all its sub-zones? Equipment assignments here are removed.')) return; _Z().remove(id); _save(); _render(); };
    window.zoneAssign = function (id, sel) { if (sel && sel.value) { _Z().assign(id, sel.value); _save(); _render(); } };
    window.zoneUnassign = function (id, sys) { _Z().unassign(id, sys); _save(); _render(); };
    window.zoneAddBarrier = function () { var a = document.getElementById('zbar-a'), b = document.getElementById('zbar-b'), t = document.getElementById('zbar-type'); if (!a || !b) return; var r = _Z().addBarrier(a.value, b.value, t ? t.value : 'firewall', false); if (!r.ok) { try { if (typeof showToast === 'function') showToast(r.err, 'warning'); } catch (_) {} return; } _save(); _render(); };
    window.zoneRemoveBarrier = function (id) { _Z().removeBarrier(id); _save(); _render(); };
    window.zoneToggleBarrierSub = function (id) { var b = _Z().barriers().find(function (x) { return x.id === id; }); _Z().setBarrierSubstantiated(id, !(b && b.substantiated)); _save(); _render(); };

    window.zoneCrossCheck = function (apply) {
        var CC = window.PHYS_CROSSCHECK; var box = document.getElementById('zonal-cc-result');
        if (!CC || !box) return;
        try {
            var r = apply ? CC.materialize() : CC.run();
            if (apply) {
                try { if (typeof runDALAllocation === 'function') runDALAllocation(); } catch (_) {}
                try { if (typeof renderCMA === 'function') renderCMA(); } catch (_) {}
                try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
                box.innerHTML = '<div style="color:var(--color-text-primary);font-size:12.5px;">Applied — created ' + r.created + ', reopened ' + r.reopened + ', kept ' + r.kept + ', relieved-kept ' + r.relievedKept + ', removed ' + r.removed + '. Affected DAL reductions reverted; β terms demanded. Relieve any with a substantiated barrier in the CMA view.</div>';
                _save();
            } else {
                var rows = (r.report || []).map(function (x) {
                    var col = x.status === 'compromised' ? '#8E2A2A' : x.status === 'clear' ? '#1E7A34' : '#8a8a8a';
                    return '<div style="font-size:12px;padding:2px 0;color:' + col + ';">' + _esc(x.gate) + ' · ' + _esc(x.page) + ' — <b>' + x.status + '</b>' + (x.reason ? ' (' + _esc(x.reason) + ')' : '') + '</div>';
                }).join('');
                box.innerHTML = '<div style="font-size:12.5px;margin-bottom:4px;">Claims: ' + r.claims + ' · cross-checkable: ' + r.crossCheckable + ' · <b style="color:#8E2A2A;">compromised: ' + r.compromised + '</b> · authored footprints: ' + r.footprints + '</div>' + rows;
            }
        } catch (e) { box.innerHTML = '<div style="color:#8E2A2A;">Cross-check error: ' + _esc(String(e)) + '</div>'; }
    };

    // ---- render ----------------------------------------------------------
    function _chip(id, sys) {
        return '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--color-surface-2);border:1px solid var(--color-border-hair);border-radius:12px;padding:1px 8px;margin:2px;font-size:11.5px;">' +
            _esc(_sysName(sys)) + '<span onclick="zoneUnassign(\'' + id + '\',\'' + sys + '\')" style="cursor:pointer;color:#8E2A2A;font-weight:700;" title="Unassign">×</span></span>';
    }
    function _zoneRow(z, depth) {
        var Z = _Z();
        var pad = 8 + depth * 22;
        var assigned = (z.equipment || []);
        var opts = _sys().filter(function (s) { return assigned.indexOf(s.id) < 0; })
            .map(function (s) { return '<option value="' + s.id + '">' + _esc(s.name) + '</option>'; }).join('');
        var html = '<div style="border-bottom:1px solid #EEF2F8;padding:6px 8px 6px ' + pad + 'px;">' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
              '<span style="font-family:var(--font-mono,monospace);font-weight:700;color:var(--color-text-primary);">' + _esc(z.code || '—') + '</span>' +
              '<span style="color:#202024;">' + _esc(z.name || '') + '</span>' +
              '<span style="margin-left:auto;display:flex;gap:6px;">' +
                '<button onclick="zoneAddSub(\'' + z.id + '\')" style="font-size:11px;padding:2px 7px;border:1px solid var(--color-border-hair);border-radius:5px;background:transparent;cursor:pointer;color:var(--color-text-primary);">+ sub-zone</button>' +
                '<button onclick="zoneRename(\'' + z.id + '\')" style="font-size:11px;padding:2px 7px;border:1px solid var(--color-border-hair);border-radius:5px;background:transparent;cursor:pointer;color:var(--color-text-primary);">rename</button>' +
                '<button onclick="zsaWalkthrough(\'' + z.id + '\')" style="font-size:11px;padding:2px 7px;border:1px solid #007AFF;border-radius:5px;background:transparent;cursor:pointer;color:#007AFF;">ZSA checklist</button>' +
                '<button onclick="zoneDelete(\'' + z.id + '\')" style="font-size:11px;padding:2px 7px;border:1px solid var(--color-border-hair);border-radius:5px;background:transparent;cursor:pointer;color:#8E2A2A;">delete</button>' +
              '</span>' +
            '</div>' +
            '<div style="margin-top:4px;">' + assigned.map(function (s) { return _chip(z.id, s); }).join('') +
              (opts ? '<select onchange="zoneAssign(\'' + z.id + '\',this)" style="font-size:11.5px;padding:2px;margin:2px;border:1px solid var(--color-border-hair);border-radius:5px;"><option value="">+ assign equipment…</option>' + opts + '</select>' : '') +
            '</div></div>';
        Z.children(z.id).forEach(function (c) { html += _zoneRow(c, depth + 1); });
        return html;
    }

    function _barriersSection() {
        var Z = _Z(); if (!Z || typeof Z.barriers !== 'function') return '';
        var bars = Z.barriers();
        var opts = Z.all().map(function (z) { return '<option value="' + z.id + '">' + _esc((z.code || '') + ' ' + (z.name || '')) + '</option>'; }).join('');
        var list = bars.length ? bars.map(function (b) {
            var za = Z.get(b.a) || {}, zb = Z.get(b.b) || {};
            return '<div style="display:flex;align-items:center;gap:8px;font-size:11.5px;padding:2px 0;">' +
                '<span>' + _esc(za.code || b.a) + ' ⊣ ' + _esc(zb.code || b.b) + ' · ' + _esc(b.type) + '</span>' +
                '<button onclick="zoneToggleBarrierSub(\'' + b.id + '\')" style="margin-left:auto;font-size:10px;padding:1px 8px;border:1px solid ' + (b.substantiated ? '#1E7A34' : '#8E2A2A') + ';border-radius:5px;cursor:pointer;background:transparent;color:' + (b.substantiated ? '#1E7A34' : '#8E2A2A') + ';">' + (b.substantiated ? 'substantiated ✓' : 'claimed — substantiate') + '</button>' +
                '<button onclick="zoneRemoveBarrier(\'' + b.id + '\')" style="color:#8E2A2A;border:none;background:transparent;cursor:pointer;font-size:12px;">×</button></div>';
        }).join('') : '<div style="font-size:11px;color:var(--color-text-primary);">No barriers. Add one where a firewall / segregation separates redundant equipment across zones.</div>';
        var form = Z.all().length >= 2 ? '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;">' +
            '<select id="zbar-a" style="font-size:11px;padding:2px;border:1px solid var(--color-border-hair);border-radius:5px;">' + opts + '</select>' +
            '<span style="font-size:11px;">⊣</span>' +
            '<select id="zbar-b" style="font-size:11px;padding:2px;border:1px solid var(--color-border-hair);border-radius:5px;">' + opts + '</select>' +
            '<select id="zbar-type" style="font-size:11px;padding:2px;border:1px solid var(--color-border-hair);border-radius:5px;"><option value="firewall">firewall</option><option value="segregation">segregation</option><option value="drip shield">drip shield</option></select>' +
            '<button onclick="zoneAddBarrier()" style="font-size:11px;padding:2px 8px;border:1px solid #007AFF;border-radius:5px;background:transparent;color:#007AFF;cursor:pointer;">+ add barrier</button></div>' : '';
        return '<div style="margin-top:12px;border:1px solid var(--color-border-hair);border-radius:8px;padding:10px;">' +
            '<div style="font-weight:700;color:var(--color-text-primary);font-size:12.5px;">Barriers (firewalls / segregation)</div>' +
            '<div style="font-size:11px;color:#55555C;margin-bottom:6px;">A <b>substantiated</b> barrier between two zones relieves their co-location automatically — computed, not a manual waiver.</div>' +
            list + form + '</div>';
    }

    function _render() {
        var host = document.getElementById('view-zonal'); if (!host) return;
        var Z = _Z();
        if (!Z) { host.innerHTML = '<div style="padding:24px;">Zonal engine not loaded.</div>'; return; }
        var v = Z.validate();
        var roots = Z.roots();
        var vBanner = v.ok
            ? '<div style="font-size:12px;color:#1E7A34;margin:6px 0;">✓ Model valid — ' + v.zones + ' zones, ' + v.equipmentPlaced + ' equipment placed of ' + v.systems + ' systems.</div>'
            : '<div style="font-size:12px;color:#8E2A2A;margin:6px 0;"><b>' + v.issues.length + ' issue(s):</b> ' + v.issues.slice(0, 6).map(_esc).join(' · ') + '</div>';
        var tree = roots.length ? roots.map(function (r) { return _zoneRow(r, 0); }).join('')
            : '<div style="padding:16px;color:var(--color-text-primary);font-size:12.5px;">No zones yet. Add a major zone (ATA convention: 100s fuselage, 300s tail, 500s/600s wings/nacelles…). Sub-zones are optional — nest only as deep as your breakdown supports.</div>';
        host.innerHTML =
            '<div style="margin:0 auto;padding:16px 8px;">' +
              '<div style="display:flex;align-items:center;gap:12px;">' +
                '<h2 style="font-size:20px;font-weight:700;color:var(--color-text-primary);margin:0;">Zonal Model</h2>' +
                '<span style="font-size:12px;color:#55555C;">hierarchical zones + equipment register</span>' +
                '<button onclick="zoneAddMajor()" style="margin-left:auto;font-size:12px;padding:5px 12px;border:1px solid #007AFF;border-radius:6px;background:#007AFF;color:#fff;cursor:pointer;">+ Add major zone</button>' +
              '</div>' + vBanner +
              '<div style="border:1px solid var(--color-border-hair);border-radius:8px;overflow:hidden;margin-top:8px;">' + tree + '</div>' +
              _barriersSection() +
              '<div style="margin-top:16px;border:1px solid var(--color-border-hair);border-radius:8px;padding:12px;">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                  '<b style="font-size:13px;color:var(--color-text-primary);">Physical independence cross-check</b>' +
                  '<button onclick="zoneCrossCheck(false)" style="font-size:12px;padding:4px 10px;border:1px solid var(--color-border-hair);border-radius:6px;background:transparent;cursor:pointer;color:var(--color-text-primary);">Preview</button>' +
                  '<button onclick="zoneCrossCheck(true)" style="font-size:12px;padding:4px 10px;border:1px solid #8E2A2A;border-radius:6px;background:transparent;color:#8E2A2A;cursor:pointer;" title="Writes computed CMA findings and reverts affected DAL reductions. Reversible; relieve with a substantiated barrier.">Apply to safety case</button>' +
                  '<button onclick="cmaWalkthrough(\'aircraft\',\'Aircraft-level\')" style="font-size:12px;padding:4px 10px;border:1px solid #0B2545;border-radius:6px;background:transparent;color:var(--color-text-primary);cursor:pointer;" title="Walk the ARP4761A Table M1 common-cause questionnaire and get a recommended β.">CMA questionnaire → β</button>' +
                  '<button onclick="praCanvas()" style="font-size:12px;padding:4px 10px;border:1px solid #0B2545;border-radius:6px;background:transparent;color:var(--color-text-primary);cursor:pointer;" title="Disposition the standard particular-risk set and author each footprint as zones (feeds the PRA cross-check).">PRA footprints</button>' +
                  '<button onclick="msg3Zonal()" style="font-size:12px;padding:4px 10px;border:1px solid #55555C;border-radius:6px;background:transparent;color:#55555C;cursor:pointer;" title="MSG-3 zonal inspection program derived from the same zone tree (GVI / DET / EZAP).">MSG-3 zonal</button>' +
                '</div>' +
                '<div style="font-size:11.5px;color:#55555C;margin-top:4px;">Deterministic: a single zone (co-location) or PRA footprint reaching ≥2 credited-independent members compromises the claim. Preview is read-only; Apply reverts the DAL letter + demands β via the CMA engine.</div>' +
                '<div id="zonal-cc-result" style="margin-top:8px;"></div>' +
              '</div>' +
            '</div>';
    }
    window._renderZonalPage = _render;

    // ---- born-modular page registration ----------------------------------
    function _anchorView() { return document.getElementById('view-bowtie') || document.getElementById('view-eta') || document.getElementById('view-fta') || document.querySelector('[id^="view-"]'); }
    // 23 Aug 2026 — Zonal Model is a ZSA artifact (Waqas: "zsa related artifacts
    function _ensurePage() {
        if (!document.getElementById('view-zonal')) {
            var av = _anchorView(); if (!av || !av.parentNode) return false;
            var v = document.createElement('div'); v.id = 'view-zonal'; v.style.display = 'none';
            av.parentNode.insertBefore(v, av.nextSibling);
        }
        // 26 Aug 2026 — no rail row any more: Zonal Model is a ZSA tab
        // (prove_tabs v1.5, CCA consolidation). The view above still mounts at
        // runtime; only the nav row is gone — same shape as the tree-family
        // modules on 23 Aug. The switchTab wrap below keeps its guarded
        // snav-zonal toggle, which is simply never found.
        return true;
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._zonalWrapped) return;
        var orig = window.switchTab;
        var wrapped = function (tabId) {
            var r = orig.apply(this, arguments);
            try {
                var v = document.getElementById('view-zonal'); if (v) v.style.display = (tabId === 'zonal') ? 'block' : 'none';
                var s = document.getElementById('snav-zonal'); if (s) s.classList.toggle('snav-active', tabId === 'zonal');
                if (tabId === 'zonal') _render();
            } catch (_) {}
            return r;
        };
        wrapped._zonalWrapped = true; window.switchTab = wrapped;
    })();
    function _ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { var tries = 40; var t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250); });
})();
