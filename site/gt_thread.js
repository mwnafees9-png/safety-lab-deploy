// ============================================================================
// gt_thread.js — v0.8 — the Golden Thread as three interconnected swim lanes.
//
// SAFETY ASSESSMENT lane on top (owns the columns: FUNCTION · SYSTEM · FAILURE
// CONDITION · FAULT TREE · COMMON CAUSE · REQUIREMENT · VERIFICATION). RAM and
// HUMAN FACTORS run beneath as feeder lanes, each card positioned under the
// safety node it feeds and connecting straight up into it. Independence is a
// requirement (folded into the REQUIREMENT column — no separate column).
// Fault-tree bus connectors: centre ports, one bus at the mid-gap for a
// fan-out/fan-in, skip-links drop below the row. Every stale / compromised /
// obsolete artifact is a named finding.
//
// DATA-DRIVEN off window._gtvBuildGraph → {nodes, links}. No new libraries
// (emits an SVG string). No RNG, no Date, no eval.
// ============================================================================
(function () {
    'use strict';

    // Safety-lane columns, left → right. HF and RAM are NOT columns here — they
    // are feeder lanes below. 'ip' (independence) folds into the REQUIREMENT column.
    const SAFE_COLS = ['func', 'sys', 'stpa', 'fc', 'fta', 'cca', 'req', 'vv'];
    const CNAME = {
        func: 'FUNCTION', sys: 'SYSTEM', stpa: 'STPA', fc: 'FAILURE CONDITION',
        fta: 'FAULT TREE', cca: 'COMMON CAUSE', req: 'REQUIREMENT', vv: 'VERIFICATION',
        ram: 'RAM', hf: 'HUMAN FACTORS'
    };
    const ACCENT = {
        func: '#2E6FB0', sys: '#1D9E75', stpa: '#6D28D9', fc: '#7F77DD', fta: '#D85A30',
        cca: '#BA7517', ph: '#A8552E', req: '#D4537E', vv: '#12A150', ip: '#D4537E', ram: '#C88A00', hf: '#7A3EA8'
    };
    // independence renders in the requirement column; a physical hazard (8 Aug
    // 2026, the twelfth node kind) renders in the common-cause column — beside
    // the functional conditions, never inside them, next to the CCA that found it.
    function colKind(k) { return k === 'ip' ? 'req' : (k === 'ph' ? 'cca' : k); }
    const IS_FEEDER = { ram: 1, hf: 1 };

    const SAF_C = '#586472', RAM_C = '#C88A00', HF_C = '#7A3EA8';
    const INK = '#101216', INK3 = '#14171c', MUTE = '#14171c', HAIR = '#14171c';
    const RED = '#C0231D', GREEN = '#0E7A3C', AMBER = '#C88A00', BLUE = '#2E6BD6';
    const FLAG = { compromised: RED, stale: AMBER, obsolete: INK3 };
    const PROVC = { human: '#2E6BD6', ai: '#7A3EA8', engine: '#0E7490' };
    const PROVL = { human: 'Human', ai: 'AI', engine: 'Engine' };

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _clip(str, n) { str = String(str == null ? '' : str); return str.length > n ? str.slice(0, n - 1) + '…' : str; }

    // Provenance — engine-computed for the deterministic engines (trees, reliability);
    // AI where the underlying row was AI-sourced and not engineer-edited; else human.
    function provOf(n) {
        const k = n.kind;
        if (k === 'fta' || k === 'ram') return 'engine';
        try {
            const r = n.ref;
            if (r && typeof window !== 'undefined') {
                const it = _lookupItem(r);
                const _he = (typeof window !== 'undefined' && window.slHumanEdited) || function (r) { if (!r) return false; if (r.humanEdited === true) return true; if (r.aiChatEdited === true) return false; if (r.aiEdited === true) return !r.aiEditModel && !r.aiEditedAt; return false; };
                if (it && (it.aiModel || (it.reqSource && it.reqSource.aiModel)) && !_he(it)) return 'ai';
            }
        } catch (_) {}
        return 'human';
    }
    function _lookupItem(r) {
        try {
            const g = (typeof window !== 'undefined') ? window : {};
            const sys = (id) => (g.systemsData || []).find(s => String(s.id) === String(id));
            switch (r.kind) {
                case 'acFha': return (g.acFhaData || []).find(f => String(f.internalId) === String(r.id));
                case 'sysFha': { const s = sys(r.systemId); return s && (s.fha || []).find(f => String(f.internalId) === String(r.id)); }
                case 'acReq': return (g.acReqData || []).find(x => String(x.internalId) === String(r.id));
                case 'sysReq': { const s = sys(r.systemId); return s && (s.req || []).find(x => String(x.internalId) === String(r.id)); }
                case 'ftaPage': return (g.ftaPages || []).find(p => String(p.id) === String(r.id));
                case 'item': return (typeof g.itemsData !== 'undefined' ? g.itemsData : []).find(x => String(x.internalId) === String(r.id));
                case 'assumption': return { aiModel: 1 };   // HF assumptions are AI-drafted by default
            }
        } catch (_) {}
        return null;
    }

    function statusDot(node) {
        const s = (node.sub || '') + ' ' + (node.label || '');
        if (/verified|closed|complete|pass/i.test(s)) return GREEN;
        if (/review|progress|pending/i.test(s)) return AMBER;
        if (/scheduled|planned|open|draft/i.test(s)) return BLUE;
        return null;
    }
    function borderFor(node) {
        if (node.flag) return FLAG[node.flag] || RED;
        if (node.kind === 'vv' && /verified|closed|complete/i.test((node.sub || '') + (node.label || ''))) return GREEN;
        return HAIR;
    }

    // geometry
    const CW = 176, CH = 54, GAP = 22, COLP = CW + GAP, PAD_L = 150;
    const HEAD_Y = 30, SAF_TOP = 42, THREAD_TOP = 52, RP = 66, LANE_H = 84, LANE_GAP = 10;

    function render(host, graph) {
        if (!host) return;
        if (!graph || !graph.nodes || !graph.nodes.length) {
            host.innerHTML = '<div style="padding:48px;text-align:center;color:' + MUTE + ';font-size:13px;">'
                + 'Select an aircraft function above — its golden thread (failure conditions, trees, requirements, verification, plus the reliability and human-factors feeder lanes) renders here.</div>';
            return;
        }
        const byKey = {}; graph.nodes.forEach(n => byKey[n.key] = n);
        graph.nodes.forEach(n => { n._prov = provOf(n); });

        // Split: safety-lane nodes vs feeder nodes. Bucket safety by column-kind.
        const buckets = {}; SAFE_COLS.forEach(k => buckets[k] = []);
        const feeders = [];
        graph.nodes.forEach(n => {
            if (IS_FEEDER[n.kind]) { feeders.push(n); return; }
            const ck = colKind(n.kind);
            if (buckets[ck]) buckets[ck].push(n);
        });
        SAFE_COLS.forEach(k => buckets[k].sort((a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0)));
        const cols = SAFE_COLS.filter(k => buckets[k].length);
        const colIndex = {}; cols.forEach((k, i) => colIndex[k] = i);
        // 21 Aug 2026 — feeder risers live IN THE COLUMN GAP, never under a
        // card. Group the feeders first (needs only cols/buckets), count the
        // risers each column needs, and widen the pitch to fit them. Each
        // feeder gets a column-global gutter index (_ggi) so RAM and HF risers
        // never share an x either.
        const primaryTarget = {};    // feederKey → target safety node key
        graph.links.forEach(L => {
            const sN = byKey[L.s], tN = byKey[L.t];
            if (sN && IS_FEEDER[sN.kind] && tN && !IS_FEEDER[tN.kind] && !primaryTarget[sN.key]) primaryTarget[sN.key] = tN.key;
        });
        const feederByCol = { ram: {}, hf: {} };
        feeders.forEach(f => {
            const tk = primaryTarget[f.key]; const tgt = tk && byKey[tk];
            const ck = tgt ? colKind(tgt.kind) : (buckets.fc.length ? 'fc' : cols[0]);
            const bin = feederByCol[f.kind][ck] || (feederByCol[f.kind][ck] = []);
            f._targetKey = tk; f._col = ck; f._gi = bin.length; bin.push(f);
        });
        const _gutterN = {};   // column → riser count (both lanes)
        ['ram', 'hf'].forEach(lane => Object.keys(feederByCol[lane]).forEach(ck => {
            feederByCol[lane][ck].forEach(f => { f._ggi = (_gutterN[ck] = (_gutterN[ck] || 0) + 1) - 1; });
        }));
        const maxGut = Object.keys(_gutterN).reduce((m, k) => Math.max(m, _gutterN[k]), 0);
        // Roomy by design — the viewer has zoom + pan, so the thread breathes:
        // a generous base gap, 8px between risers, and margin either side.
        const GAPX = Math.max(40, maxGut ? 16 + maxGut * 8 + 12 : 0);
        const COLPX = CW + GAPX;
        const colX = k => PAD_L + colIndex[k] * COLPX;

        // Position safety cards.
        const pos = {}; let rowsMax = 1;
        cols.forEach(k => {
            const x = colX(k);
            buckets[k].forEach((n, ri) => { pos[n.key] = { x: x, y: THREAD_TOP + ri * RP, w: CW, h: CH }; });
            if (buckets[k].length > rowsMax) rowsMax = buckets[k].length;
        });
        const threadBottom = THREAD_TOP + rowsMax * RP;               // safety cards bottom
        const safBandBottom = threadBottom + 6;

        // (feeder grouping moved above — the pitch needs the riser counts)
        const laneRows = lane => { let m = 0; Object.keys(feederByCol[lane]).forEach(ck => { if (feederByCol[lane][ck].length > m) m = feederByCol[lane][ck].length; }); return m; };
        const ramRows = laneRows('ram'), hfRows = laneRows('hf');
        const laneH = rows => 15 + rows * (CH + 8) + 4;
        const ramH = ramRows ? laneH(ramRows) : 0, hfH = hfRows ? laneH(hfRows) : 0;
        const ramBandTop = safBandBottom + LANE_GAP;
        const hfBandTop = ramBandTop + (ramRows ? ramH + LANE_GAP : 0);
        const laneTopOf = lane => lane === 'ram' ? ramBandTop : hfBandTop;
        Object.keys(feederByCol).forEach(lane => {
            Object.keys(feederByCol[lane]).forEach(ck => {
                feederByCol[lane][ck].forEach((f, ri) => {
                    pos[f.key] = { x: colX(ck), y: laneTopOf(lane) + 15 + ri * (CH + 8), w: CW, h: CH };
                });
            });
        });

        const W = PAD_L + cols.length * CW + (cols.length - 1) * GAPX + PAD_L;
        const bottomBand = hfRows ? (hfBandTop + hfH) : (ramRows ? (ramBandTop + ramH) : safBandBottom);
        const H = bottomBand + 34;

        let s = '';
        s += '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" style="display:block;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);max-width:none;">';

        // ---- lane bands (Safety on top, RAM, HF) --------------------------------
        function band(y, h, c, label) {
            let b = '<rect x="6" y="' + y + '" width="' + (W - 12) + '" height="' + h + '" fill="' + c + '" opacity="0.06"/>';
            b += '<rect x="6" y="' + y + '" width="4" height="' + h + '" fill="' + c + '"/>';
            b += '<text x="14" y="' + (y + 14) + '" font-size="10" font-weight="700" letter-spacing="1" fill="' + c + '">' + label + '</text>';
            return b;
        }
        s += band(SAF_TOP, safBandBottom - SAF_TOP, SAF_C, 'SAFETY ASSESSMENT');
        if (ramRows) s += band(ramBandTop, ramH, RAM_C, 'RAM');
        if (hfRows) s += band(hfBandTop, hfH, HF_C, 'HUMAN FACTORS');

        // ---- column headers (atop the safety lane) ------------------------------
        s += '<g font-size="9.5" font-weight="700" letter-spacing="1.4">';
        cols.forEach(k => {
            s += '<text x="' + (colX(k) + CW / 2) + '" y="' + HEAD_Y + '" text-anchor="middle" fill="' + (ACCENT[k] || MUTE) + '">' + CNAME[k]
                + ' <tspan fill="' + MUTE + '">(' + buckets[k].length + ')</tspan></text>';
        });
        s += '</g>';

        // ---- safety flow connectors: fault-tree buses ---------------------------
        // centre ports; one bus at the mid-gap for adjacent edges; skip-links drop
        // below the row and run clear underneath the intervening cards.
        function span(a, b) { return Math.max(1, Math.round((b.x - (a.x + a.w)) / COLPX)); }
        graph.links.forEach(L => {
            const sN = byKey[L.s], tN = byKey[L.t];
            if (!sN || !tN || IS_FEEDER[sN.kind] || IS_FEEDER[tN.kind]) return;   // feeders drawn separately
            let a = pos[L.s], b = pos[L.t]; if (!a || !b) return;
            // orient left→right
            if (b.x < a.x) { const t = a; a = b; b = t; }
            const x0 = a.x + a.w, y0 = a.y + a.h / 2, x1 = b.x, y1 = b.y + b.h / 2;
            const sp = span(a, b);
            // Colour the link by the SEVERITY of the flag, not merely by its
            // presence. Any truthy flag used to paint compromised-red, so a
            // 'stale' (amber) or 'obsolete' (grey) node shouted the same alarm as
            // a genuinely compromised one — on the flagship visual, where the
            // whole point is telling those apart at a glance. The feeder path
            // below already narrowed correctly; this branch never got the same
            // treatment. FLAG maps severity to colour; fall back to compromised
            // only for a flag we do not recognise.
            const worst = (tN.flag === 'compromised' || sN.flag === 'compromised')
                ? 'compromised' : (tN.flag || sN.flag || '');
            const col = worst ? (FLAG[worst] || RED) : 'rgba(26,28,34,.6)';
            const wd = worst === 'compromised' ? 2 : (worst ? 1.7 : 1.4);
            let d;
            if (sp >= 2) {
                const sxb = a.x + a.w / 2, syb = a.y + a.h, chanY = Math.max(y0, y1) + a.h / 2 + 10, rx = x1 - 14;
                d = 'M' + sxb + ',' + syb + ' L' + sxb + ',' + chanY + ' L' + rx + ',' + chanY + ' L' + rx + ',' + y1 + ' L' + x1 + ',' + y1;
            } else if (Math.abs(y0 - y1) < 1) {
                d = 'M' + x0 + ',' + y0 + ' L' + x1 + ',' + y1;
            } else {
                const busX = (x0 + x1) / 2; d = 'M' + x0 + ',' + y0 + ' L' + busX + ',' + y0 + ' L' + busX + ',' + y1 + ' L' + x1 + ',' + y1;
            }
            s += '<path data-s="' + esc(L.s) + '" data-t="' + esc(L.t) + '" d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + wd + '" stroke-linejoin="round"/>';
        });

        // ---- feeder connectors: RAM/HF up into the target's bottom-centre --------
        feeders.forEach(f => {
            const tk = f._targetKey; if (!tk) return;
            const p = pos[f.key], t = pos[tk]; if (!p || !t) return;
            const tN = byKey[tk];
            const chain = f.flag === 'compromised' || (tN && tN.flag === 'compromised');
            const stroke = chain ? RED : (f.kind === 'hf' ? HF_C : RAM_C);
            const gi = f._ggi || 0;
            // leave the feeder's side-centre, run up the gutter, land on the target's side-centre
            // (the pitch above was widened to fit every riser; the clamp is a belt-and-braces floor)
            const fmy = p.y + p.h / 2, tmy = t.y + t.h / 2, gx = Math.max(t.x - 16 - gi * 8, t.x - GAPX + 4);
            const d = 'M' + p.x + ',' + fmy + ' L' + gx + ',' + fmy + ' L' + gx + ',' + tmy + ' L' + t.x + ',' + tmy;
            s += '<path data-s="' + esc(f.key) + '" data-t="' + esc(tk) + '" d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (chain ? 2 : 1.4) + '" stroke-dasharray="' + (chain ? '' : '4,3') + '" stroke-linejoin="round"/>';
        });

        // ---- cards --------------------------------------------------------------
        let findings = 0;
        function drawCard(n) {
            const p = pos[n.key]; if (!p) return '';
            const acc = ACCENT[n.kind] || INK3;
            const bc = borderFor(n);
            const idc = n.flag ? bc : (bc === GREEN ? '#0E7A3C' : INK);
            if (n.flag) findings++;
            let c = '<g data-key="' + esc(n.key) + '" style="cursor:pointer;">';
            c += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="6" fill="#fff" stroke="' + bc + '" stroke-width="' + (n.flag ? 1.6 : (bc === HAIR ? 1 : 1.4)) + '"/>';
            c += '<rect x="' + p.x + '" y="' + (p.y + 6) + '" width="3" height="' + (p.h - 12) + '" rx="1.5" fill="' + acc + '"/>';
            c += '<text x="' + (p.x + 11) + '" y="' + (p.y + 18) + '" font-size="11" font-weight="700" fill="' + idc + '">' + esc(_clip(n.label, 22)) + '</text>';
            c += '<text x="' + (p.x + 11) + '" y="' + (p.y + 33) + '" font-size="8.6" fill="' + INK3 + '">' + esc(_clip(n.sub, 27)) + '</text>';
            // provenance badge (bottom-right)
            const pv = n._prov || 'human', pw = PROVL[pv].length * 5.2 + 11, px = p.x + p.w - 6 - pw, py = p.y + p.h - 15;
            c += '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="12" rx="6" fill="' + PROVC[pv] + '"/>';
            c += '<text x="' + (px + pw / 2) + '" y="' + (py + 8.7) + '" text-anchor="middle" font-size="7" font-weight="700" fill="#fff">' + PROVL[pv] + '</text>';
            // bottom-left chip: flag OR role
            let bl = null;
            if (n.flag) bl = { t: n.flag.toUpperCase(), c: (n.flag === 'stale' ? AMBER : n.flag === 'obsolete' ? INK3 : RED) };
            else if (n.kind === 'sys' && n.role) { const base = n.role === 'primary' ? 'PRIMARY' : 'RESOURCE'; bl = { t: (n.role === 'resource' && (n.hops || 1) > 1) ? base + ' ·' + n.hops : base, c: n.role === 'primary' ? '#12A150' : AMBER }; }
            if (bl) {
                const rw = bl.t.length * 5.1 + 10, rx = p.x + 11, ry = p.y + p.h - 15;
                c += '<rect x="' + rx + '" y="' + ry + '" width="' + rw + '" height="12" rx="6" fill="' + bl.c + '"/><text x="' + (rx + rw / 2) + '" y="' + (ry + 8.7) + '" text-anchor="middle" font-size="7" font-weight="700" fill="#fff">' + esc(bl.t) + '</text>';
            }
            const dot = statusDot(n);
            if (dot && !bl) c += '<circle cx="' + (p.x + 16) + '" cy="' + (p.y + p.h - 9) + '" r="3.5" fill="' + dot + '"/>';
            c += '<title>' + esc(n.label + (n.sub ? ' — ' + n.sub : '') + (n.flag ? '  [' + n.flag.toUpperCase() + (n.flagReason ? ': ' + n.flagReason : '') + ']' : '')) + '</title>';
            c += '</g>';
            return c;
        }
        cols.forEach(k => buckets[k].forEach(n => { s += drawCard(n); }));
        feeders.forEach(f => { s += drawCard(f); });

        const cap = findings
            ? findings + ' NAMED FINDING' + (findings === 1 ? '' : 'S') + ' ON THIS THREAD · A BROKEN OR STALE LINK IS SURFACED, NEVER A SILENT GAP · EVERY LINK MACHINE-CHECKED'
            : 'EVERY LINK MACHINE-CHECKED · A BROKEN OR STALE LINK IS A NAMED FINDING, NEVER A SILENT GAP · ONE CAUSE → MANY HAZARDS · ONE MITIGATION → MANY REQUIREMENTS';
        s += '<text x="' + (W / 2) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="9" letter-spacing="1" fill="' + (findings ? RED : MUTE) + '">' + esc(cap) + '</text>';
        s += '</svg>';

        host.innerHTML = s;
        wireInteractivity(host, graph);
    }

    function wireInteractivity(host, graph) {
        const svg = host.querySelector('svg');
        if (!svg) return;
        const nodeEls = svg.querySelectorAll('g[data-key]');
        const linkEls = svg.querySelectorAll('path[data-s]');
        const call = (name, key) => { try { if (typeof window !== 'undefined' && typeof window[name] === 'function') window[name](key, graph); } catch (_) {} };
        function highlight(key) {
            let set; try { set = (typeof window !== 'undefined' && window._gtvThreadSet) ? window._gtvThreadSet(graph, key) : null; } catch (_) { set = null; }
            if (!set) set = new Set([key]);
            nodeEls.forEach(n => { n.style.opacity = set.has(n.getAttribute('data-key')) ? '1' : '0.22'; });
            linkEls.forEach(p => { p.style.opacity = (set.has(p.getAttribute('data-s')) && set.has(p.getAttribute('data-t'))) ? '1' : '0.06'; });
        }
        function clearHl() { nodeEls.forEach(n => { n.style.opacity = '1'; }); linkEls.forEach(p => { p.style.opacity = ''; }); }
        nodeEls.forEach(el => {
            const key = el.getAttribute('data-key');
            el.addEventListener('click', () => call('_gtvShowEco', key));
            el.addEventListener('dblclick', ev => { try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {} call('_gtvShowEcoModal', key); });
            el.addEventListener('mouseenter', () => highlight(key));
            el.addEventListener('mouseleave', clearHl);
        });
    }

    if (typeof window !== 'undefined') window.GT_THREAD = { render: render, ORDER: SAFE_COLS };
    if (typeof module !== 'undefined') module.exports = { render: render, ORDER: SAFE_COLS };
})();
