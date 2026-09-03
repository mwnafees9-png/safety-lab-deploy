// ============================================================================
// thread_bridge.js — v1.1 — Safety Lab joins the golden thread bus, LIVE.
//
// The FIRST PRIORITY wire: assumption state changes leave this tool as
// THREAD 'asm-state' envelopes (BroadcastChannel same-browser + Supabase
// Realtime cross-machine, channel labs-thread:AE-001), and the roster's
// answers — CAD 'part-release'/'part-revise', Sim Lab 'evidence' — land in
// an inbox surfaced on the assumption register.
//
// v1.1 — IMPACT RESOLUTION. A geometry change is not just a line in a ledger;
// it can move the ground under the safety case. When CAD publishes
// part-release / part-revise it now carries an impact payload — the
// assumptions the part stands on and the zones it occupies. The bridge
// resolves BOTH lanes into the safety artifacts the change touches:
//   · assumption spine — each carried asmId through asmWhereUsed() (the same
//     resolver the register uses) → FHA / MAC / SPF / ZONAL / PRA / ZSA / REQ.
//   · zone occupancy — each occupied zone → ZSA findings in the zone, PRA
//     whose footprint includes it, zonal acceptances covering it.
//   · named-part lane — any PRA / ZSA / zonal basis that names the partId.
// It rolls up worst severity and raises a LOUD flag when geometry moves under
// a Cat/Haz claim resting on an assumption that is not validated (or is dead)
// — the credit is not real and the geometry just changed. Pure resolve +
// display: the bridge reads asmWhereUsed / praData / zsaData / zonal
// acceptances and NEVER writes a store. Remove the file, tool unchanged.
//
// HOW PUBLISH WORKS — render-hook diff, one mechanism for every lane:
//   All assumption-state mutation paths (updateACAsmState dropdowns,
//   updateSysAsmState, the HF register _productionAuthor) end in
//   renderACAssumptions / renderSysAssumptions. The bridge wraps those
//   (plus a slow belt-and-braces sweep) and diffs asmAll() states against
//   its last snapshot:
//     · 1–3 states changed  → a human flipped something: publish each.
//     · more than 3 changed → bulk event (project load / import / demo
//       seed): RE-BASELINE SILENTLY, publish nothing. A load is not a flip.
//   New/removed asmIds re-baseline silently for the same reason.
//
// DISCIPLINE (test-locked):
//   · The bridge NEVER writes a store. Not on consume, not ever. Inbound
//     'evidence' does not flip an assumption — a human signs the flip in
//     the register (the Sim Lab iron rule, honored from this end).
//   · Display-lane only on the consume side: an inbox ledger + a card on
//     the assumption register. Remove this file and Safety Lab is unchanged.
//   · Tolerant globals throughout — every hook retries, nothing throws.
// ============================================================================
(function () {
    'use strict';

    const W = (typeof window !== 'undefined') ? window : null;
    const MAX_INBOX = 250;
    const BULK_LIMIT = 3;        // >3 simultaneous state changes = bulk load, not a flip
    const SWEEP_MS = 5000;

    function create(w) {
        const THREAD = w && w.THREAD;
        if (!THREAD || typeof THREAD.createClient !== 'function') return null;

        const tc = THREAD.createClient({ tool: 'safetylab', thread: 'AE-001' });
        try { tc.addBroadcast(); } catch (_) {}
        try { tc.addSupabase(); } catch (_) {}
        if (!tc.status().connected) { try { tc.addLoopback(); } catch (_) {} }

        const inbox = [];            // foreign envelopes, newest last, capped
        let baseline = null;         // Map asmId → state

        // ---- inventory (tolerant: asmAll from assumption_moat, else raw) ----
        function _states() {
            const m = new Map();
            try {
                if (typeof w.asmAll === 'function') {
                    w.asmAll().forEach(a => { if (a && a.asmId) m.set(a.asmId, a.state || 'Proposed'); });
                    return m;
                }
            } catch (_) {}
            try {
                ((typeof w.acAssumptionsData !== 'undefined' ? w.acAssumptionsData : []) || []).forEach(a =>
                    a && a.asmId && m.set(a.asmId, a.state || 'Proposed'));
                ((typeof w.systemsData !== 'undefined' ? w.systemsData : []) || []).forEach(s =>
                    ((s && s.asm) || []).forEach(a => a && a.asmId && m.set(a.asmId, a.state || 'Proposed')));
            } catch (_) {}
            return m;
        }

        // ---- publish lane: the diff sweep ----------------------------------
        function sweep() {
            const cur = _states();
            if (!baseline) { baseline = cur; return []; }
            const changed = [];
            cur.forEach((state, id) => {
                if (baseline.has(id) && baseline.get(id) !== state) changed.push({ id, state });
            });
            const membershipMoved = cur.size !== baseline.size;
            baseline = cur;
            // membership moved = project load / import / delete — a load is not a
            // flip, whatever else changed with it. Same for same-membership bulk.
            if (membershipMoved || changed.length === 0 || changed.length > BULK_LIMIT) return [];
            changed.forEach(c => {
                try { tc.publish({ kind: 'asm-state', id: c.id, state: c.state }); } catch (_) {}
            });
            return changed;
        }

        // Explicit lane for callers that KNOW a flip happened (bypasses diff).
        function publishAsmState(asmId, state) {
            if (!asmId || !state) return null;
            if (baseline) baseline.set(asmId, state);      // don't double-publish on next sweep
            try { return tc.publish({ kind: 'asm-state', id: asmId, state }); } catch (_) { return null; }
        }

        // ---- consume lane: ledger only, NEVER a store write ----------------
        tc.onEvent(function (env) {
            if (!env || env.tool === 'safetylab') return;
            if (env.kind !== 'part-release' && env.kind !== 'part-revise' && env.kind !== 'evidence') return;
            // resolve impact at consume time — a geometry change is scored against
            // the safety case the instant it lands (read-only).
            if (env.kind === 'part-release' || env.kind === 'part-revise') {
                try { env._impact = impactsFor(env); } catch (_) { env._impact = null; }
            }
            inbox.push(env);
            if (inbox.length > MAX_INBOX) inbox.splice(0, inbox.length - MAX_INBOX);
            try { renderThreadCard(); } catch (_) {}
            try {
                if (typeof w.showToast === 'function') {
                    const im = env._impact;
                    const suffix = im
                        ? (im.flags.length ? ' — ⚠ ' + im.flags.length + ' Cat/Haz posture flag' + (im.flags.length === 1 ? '' : 's')
                            : (im.impacts.length ? ' — ' + im.impacts.length + ' safety artifact' + (im.impacts.length === 1 ? '' : 's') + ' impacted'
                            + (im.zones.length ? ' (' + im.zones.length + ' zonal, ' + im.pra.length + ' PRA)' : '') : ' — no safety artifact references it yet'))
                        : '';
                    w.showToast('Golden thread · ' + env.tool + ' ' + env.kind + ': ' + env.id +
                        (env.rev ? ' rev ' + env.rev : '') + (env.hash ? ' · mesh ' + env.hash : '') + suffix,
                        (im && im.flags.length) ? 'warn' : 'info');
                }
            } catch (_) {}
        });

        function eventsFor(asmId) {
            return inbox.filter(e => e.id === asmId || (e.payload && e.payload.asmId === asmId));
        }

        // ---- impact resolution (read-only): what a geometry change touches --
        const SEV_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'No Safety Effect': 1 };
        function _sevRank(s) {
            try { if (typeof SEVERITY_RANK !== 'undefined' && SEVERITY_RANK[s] != null) return SEVERITY_RANK[s]; } catch (_) {}
            try { if (typeof w.SEVERITY_RANK !== 'undefined' && w.SEVERITY_RANK[s] != null) return w.SEVERITY_RANK[s]; } catch (_) {}
            return SEV_RANK[s] || 0;
        }
        // Safety Lab's project data lives in top-level `let` bindings (praData,
        // zsaData, projectConfig, SEVERITY_RANK) — bare-visible to every classic
        // script but NOT properties of window. Read them the SAME way
        // assumption_moat does (bare, typeof-guarded), falling back to a window
        // property only if some deployment mirrored it there.
        function _pc() { try { if (typeof projectConfig !== 'undefined' && projectConfig) return projectConfig; } catch (_) {} try { return w.projectConfig || {}; } catch (_) { return {}; } }
        function _praData() { try { if (typeof praData !== 'undefined' && praData) return praData; } catch (_) {} try { return w.praData || []; } catch (_) { return []; } }
        function _zsaData() { try { if (typeof zsaData !== 'undefined' && zsaData) return zsaData; } catch (_) {} try { return w.zsaData || []; } catch (_) { return []; } }

        // Given a part-release / part-revise envelope, resolve every safety
        // artifact the geometry change reaches. NEVER mutates anything.
        function impactsFor(env) {
            const payload = (env && env.payload) || {};
            const asmIds = Array.isArray(payload.assumptions) ? payload.assumptions.filter(Boolean) : [];
            const zoneIds = Array.isArray(payload.zones) ? payload.zones.filter(Boolean) : [];
            const pid = env && env.id;
            const impacts = [];
            const seen = new Set();
            const add = (kind, ref, detail, severity, via) => {
                const key = kind + '|' + ref + '|' + via;
                if (seen.has(key)) return;
                seen.add(key);
                impacts.push({ kind: kind, ref: ref || '', detail: detail || '', severity: severity || '', via: via });
            };
            const flags = [];

            // lane 1 — assumption spine, via the register's own where-used truth
            let rowsById = new Map();
            try {
                if (typeof w.asmRegister === 'function') {
                    (w.asmRegister().rows || []).forEach(r => rowsById.set(r.asmId, r));
                }
            } catch (_) {}
            asmIds.forEach(asmId => {
                const row = rowsById.get(asmId);
                if (!row) { add('ASM', asmId, 'assumption ' + asmId + ' — not in this project’s register', '', 'assumption ' + asmId); return; }
                (row.uses || []).forEach(u => add(u.kind, u.ref, u.detail, u.severity, 'assumption ' + asmId));
                const notCredited = row.state !== 'Validated' && row.state !== 'Verified';
                if (row.catHaz && (row.dead || notCredited)) {
                    flags.push('geometry stands on ' + asmId + ' [' + row.state + '] carrying Cat/Haz claims — the credit is not real: ' +
                        (row.uses || []).filter(u => _sevRank(u.severity) >= 4).slice(0, 3).map(u => u.detail).join('; '));
                }
            });

            // lane 2 — zone occupancy, the physical footprint
            zoneIds.forEach(z => {
                _zsaData().forEach(r => {
                    if (r && r.zoneId === z) add('ZSA', z, 'zone ' + z + ' ZSA' + (r.zsaCheckpoint ? ' @ ' + r.zsaCheckpoint : '') + ' — re-walk on geometry change', '', 'zone ' + z);
                });
                _praData().forEach(p => {
                    if (!p) return;
                    const zs = (p.zones || []).concat(p.affectedZones || []);
                    if (zs.indexOf(z) >= 0) add('PRA', p.praId || '', 'PRA ' + (p.praId || '') + ' footprint includes ' + z, '', 'zone ' + z);
                });
                try {
                    const za = _pc().zonalAccepted || {};
                    Object.keys(za).forEach(k => { if (String(k).indexOf(z) >= 0) add('ZONAL', k, 'zonal acceptance ' + k + ' covers ' + z, 'Catastrophic', 'zone ' + z); });
                } catch (_) {}
                if (!_zsaData().some(r => r && r.zoneId === z) &&
                    !_praData().some(p => p && (p.zones || []).concat(p.affectedZones || []).indexOf(z) >= 0)) {
                    add('ZONE', z, 'zone ' + z + ' — occupied by this part; no zonal/PRA/ZSA record yet', '', 'zone ' + z);
                }
            });

            // lane 3 — an analyst named the partId directly in a basis / mitigation
            if (pid) {
                const scan = (txt, kind, ref, detail, sev) => { if (txt && String(txt).indexOf(pid) >= 0) add(kind, ref, detail, sev, 'names ' + pid); };
                _praData().forEach(p => p && scan(p.mitigation, 'PRA', p.praId || '', 'PRA ' + (p.praId || '') + ' mitigation names ' + pid));
                _zsaData().forEach(r => r && scan(r.mitigation, 'ZSA', r.zoneId || '', 'zone ' + (r.zoneId || '') + ' ZSA mitigation names ' + pid));
                try { Object.entries(_pc().zonalAccepted || {}).forEach(([k, rec]) => scan(rec && rec.basis, 'ZONAL', k, 'zonal acceptance ' + k + ' names ' + pid, 'Catastrophic')); } catch (_) {}
            }

            const byKind = {};
            impacts.forEach(i => { (byKind[i.kind] = byKind[i.kind] || []).push(i); });
            const worst = impacts.reduce((m, i) => Math.max(m, _sevRank(i.severity)), 0);
            return {
                partId: pid, rev: env && env.rev, hash: env && env.hash, kind: env && env.kind,
                asmIds: asmIds, zoneIds: zoneIds, impacts: impacts, byKind: byKind, flags: flags,
                worstSevRank: worst,
                zones: (byKind.ZONAL || []).concat(byKind.ZONE || []),
                pra: byKind.PRA || [], zsa: byKind.ZSA || []
            };
        }

        // ---- the card on the assumption register (display-lane) ------------
        function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
        function renderThreadCard() {
            if (!w.document) return;
            const host = w.document.getElementById('asm-register-host');
            if (!host) return;
            let card = w.document.getElementById('thread-bridge-card');
            if (!card) {
                card = w.document.createElement('div');
                card.id = 'thread-bridge-card';
                host.appendChild(card);
            }
            const st = tc.status();
            const recent = inbox.slice(-8).reverse();
            const SEVC = { 5: '#8E2A2A', 4: '#B4451A', 3: '#B7791F', 2: '#5A6472', 1: '#5A6472' };
            function impactCell(e) {
                if (e.kind === 'evidence') return _esc('evidence' + (e.payload && e.payload.asmId ? ' → ' + e.payload.asmId : '') + (e.state ? ' [' + e.state + ']' : ''));
                const im = e._impact;
                if (!im) return _esc([e.rev ? 'rev ' + e.rev : '', e.hash ? 'mesh ' + e.hash : ''].filter(Boolean).join(' · ') || '—');
                const bits = [];
                if (im.zones.length) bits.push('<span class="u-mono">' + im.zones.length + ' zonal</span>');
                if (im.pra.length) bits.push('<span class="u-mono">' + im.pra.length + ' PRA</span>');
                if (im.zsa.length) bits.push('<span class="u-mono">' + im.zsa.length + ' ZSA</span>');
                const fha = (im.byKind.FHA || []).length; if (fha) bits.push('<span class="u-mono">' + fha + ' FHA</span>');
                const detail = im.impacts.length
                    ? im.impacts.slice(0, 4).map(i => _esc(i.detail)).join(' · ') + (im.impacts.length > 4 ? ' <span style="color:var(--color-text-tertiary)">+' + (im.impacts.length - 4) + '</span>' : '')
                    : '<span style="color:#B7791F">no safety artifact references it yet — bind a zone/assumption if it is load-bearing</span>';
                const head = (e.hash ? 'mesh ' + _esc(e.hash) + ' · ' : '') +
                    (bits.length ? bits.join(' · ') : 'no impact resolved') +
                    (im.worstSevRank >= 4 ? ' <span class="u-mono" style="color:' + SEVC[im.worstSevRank] + '; font-weight:700;">worst ' + (im.worstSevRank === 5 ? 'CAT' : 'HAZ') + '</span>' : '');
                const flagLine = im.flags.length
                    ? '<div style="color:#8E2A2A; font-weight:600; margin-top:3px;">⚠ ' + im.flags.map(_esc).join('<br>⚠ ') + '</div>' : '';
                return head + '<div style="font-size:11px; color:var(--color-text-secondary); margin-top:2px;">' + detail + '</div>' + flagLine;
            }
            const anyFlag = recent.some(e => e._impact && e._impact.flags.length);
            card.innerHTML =
                '<div style="border:1px solid ' + (anyFlag ? '#8E2A2A' : 'var(--color-border-strong)') + '; background:var(--color-surface-1); margin-bottom:18px;">' +
                '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
                '<b>Golden thread — roster activity &amp; geometry-change impact</b>' +
                '<span class="u-mono" style="font-size:11px; font-weight:700;">' +
                (st.connected ? '● LIVE' : '○ OFFLINE') + ' · ' + _esc(st.transports.join(' · ')) +
                (st.outbox ? ' · ' + st.outbox + ' queued' : '') + '</span></div>' +
                '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">' +
                'Assumption state changes publish to the roster (CAD release gates react live). CAD releases/revisions arrive with the ' +
                'assumptions and zones they carry — resolved here into the zonal, PRA, ZSA and FHA artifacts the geometry change touches. ' +
                'A revised part is provisionally stale downstream: review the impacts, then you sign any flip in the register above — the thread never flips state itself.</p>' +
                '<div style="overflow-x:auto; padding:0 14px 12px;">' +
                (recent.length
                    ? '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>From</th><th>Event</th><th>Artifact</th><th>Impact on the safety case</th></tr></thead><tbody>' +
                      recent.map(e =>
                          '<tr><td class="u-mono">' + _esc(e.tool) + '</td><td class="u-mono">' + _esc(e.kind) + (e.rev ? ' ' + _esc(e.rev) : '') + '</td>' +
                          '<td class="u-mono"><b>' + _esc(e.id) + '</b></td>' +
                          '<td>' + impactCell(e) + '</td></tr>').join('') +
                      '</tbody></table>'
                    : '<span style="font-size:12px; color:var(--color-text-tertiary);">No roster events yet this session — release a part in CAD Lab and it appears here with its mesh hash and the zones/PRA it impacts.</span>') +
                '</div></div>';
        }

        // ---- install hooks (retry — module load order is not our business) --
        function installHooks() {
            let ok = true;
            ['renderACAssumptions', 'renderSysAssumptions'].forEach(fn => {
                if (typeof w[fn] === 'function') {
                    if (!w[fn]._threadBridgeWrapped) {
                        const orig = w[fn];
                        const wrapped = function () {
                            const r = orig.apply(this, arguments);
                            try { setTimeout(sweep, 0); } catch (_) {}
                            return r;
                        };
                        wrapped._threadBridgeWrapped = true;
                        w[fn] = wrapped;
                    }
                } else ok = false;
            });
            if (typeof w.renderAsmRegister === 'function' && !w.renderAsmRegister._threadBridgeWrapped) {
                const orig2 = w.renderAsmRegister;
                const wrapped2 = function () {
                    const r = orig2.apply(this, arguments);
                    try { setTimeout(renderThreadCard, 0); } catch (_) {}
                    return r;
                };
                wrapped2._threadBridgeWrapped = true;
                w.renderAsmRegister = wrapped2;
            }
            return ok;
        }
        baseline = _states();
        if (!installHooks()) {
            let tries = 20;
            const t = setInterval(() => { if (installHooks() || --tries <= 0) clearInterval(t); }, 300);
        }
        try { setInterval(sweep, SWEEP_MS); } catch (_) {}

        return { client: tc, sweep, publishAsmState, eventsFor, impactsFor, renderThreadCard,
                 status: () => tc.status(), _inbox: inbox };
    }

    if (W) {
        const bridge = create(W);
        if (bridge) W.THREAD_BRIDGE = bridge;
        else {
            // THREAD not on the page yet (script order) — retry briefly.
            let tries = 20;
            const t = setInterval(() => {
                const b = create(W);
                if (b) { W.THREAD_BRIDGE = b; clearInterval(t); }
                else if (--tries <= 0) clearInterval(t);
            }, 300);
        }
    }
    if (typeof module !== 'undefined') module.exports = { create };
})();
