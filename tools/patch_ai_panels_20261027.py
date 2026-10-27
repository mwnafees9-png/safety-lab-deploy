#!/usr/bin/env python3
"""27 Oct 2026 (customer report): the AI panels that slide out on the right.
  1. Close is red and sits in the bottom row with the other buttons (toasts cover the top right).
     Every .ai-rev-panel docks its Close there (one function, _dockPanelClose, run for every panel
     by one observer); the ANEM chat's Undo, Clear and Close move to a bottom row.
  2. Accept, Accept all, Generate and "Draft ... selected" are large, bold, solid buttons.
  3. Everything relevant is legible: the disclaimer stays grey, every other grey line is dark,
     notes are 12px.
  4. An ANEM-drafted card lists every field it would write, labeled (an FHA card showed only the
     failure condition and its class: no phase, no effects, no rationale).

Run from the repo root: python3 tools/patch_ai_panels_20261027.py   (refuses on any missing anchor)
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda p: os.path.join(ROOT, 'site', p)
def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()
def wr(p, s):
    with open(p, 'w', encoding='utf-8') as f: f.write(s)
def sub1(s, old, new, name):
    n = s.count(old)
    if n != 1: sys.exit('anchor %s found %d times' % (name, n))
    return s.replace(old, new)

a = rd(S('ai_assistant.js'))
if '_dockPanelClose' in a: sys.exit('ai_assistant.js already patched')

# ---------------------------------------------------------------- header line
a = '// 27 Oct 2026 (v76.91, customer report): the right-hand AI panels. Close is red and docked in the bottom row (_dockPanelClose, one observer for every .ai-rev-panel; the ANEM chat\'s Undo, Clear and Close sit in a bottom row), Accept / Accept all / Generate / Draft selected are large solid buttons, every line but the disclaimer is dark and legible, and an ANEM card lists every field it would write (_anemCardFields). See tests/regression_ai_panels_20261027.test.js\n' + a

# ---------------------------------------------------------------- palette: dim is dark now, faint is the old grey (disclaimer only)
a = sub1(a, "            ? { bg: '#0f1420', text: '#e8eaf0', dim: '#9aa3b2', card: '#1a2030', border: '#2a3245', btn: '#222b3d' }\n            : { bg: '#ffffff', text: '#1a1a1a', dim: '#5c6470', card: '#f7f8fa', border: '#e2e2e2', btn: '#ffffff' };",
         "            ? { bg: '#0f1420', text: '#e8eaf0', dim: '#c9d0db', faint: '#9aa3b2', card: '#1a2030', border: '#2a3245', btn: '#222b3d' }\n            : { bg: '#ffffff', text: '#1a1a1a', dim: '#363c46', faint: '#5c6470', card: '#f7f8fa', border: '#e2e2e2', btn: '#ffffff' };", 'palette')
a = sub1(a, "        panel.style.setProperty('--aifh-dim', p.dim);\n",
         "        panel.style.setProperty('--aifh-dim', p.dim);\n        panel.style.setProperty('--aifh-faint', p.faint);   // 27 Oct 2026: the disclaimer only\n", 'palette faint')

# ---------------------------------------------------------------- shared panel styles
a = sub1(a, "            '.ai-rev-panel .aifh-disclaimer{font-size:11px;color:var(--aifh-dim);padding:8px 12px 0}',",
         "            '.ai-rev-panel .aifh-disclaimer{font-size:11px;color:var(--aifh-faint);padding:8px 12px 0}',", 'disclaimer')
a = sub1(a, "            '.ai-rev-panel .aifh-meta{font-size:11px;color:var(--aifh-dim) !important;margin-bottom:6px}',",
         "            '.ai-rev-panel .aifh-meta{font-size:12px;color:var(--aifh-dim) !important;margin-bottom:6px}',", 'meta')
a = sub1(a, "            '.ai-rev-panel .aifh-accept{background:#2563eb;color:#fff !important;border-color:#2563eb}',\n            '.ai-rev-panel .aifh-foot{padding:10px 12px;border-top:1px solid var(--aifh-border);display:flex;gap:8px}'",
         "            // 27 Oct 2026 (customer report): the actions that do the work are large and solid; Close is red, last in the\n"
         "            // bottom row, apart from them, so nobody hits it by accident and no toast covers it.\n"
         "            '.ai-rev-panel .aifh-accept,.ai-rev-panel .rv-accept-all{background:#1d4ed8;color:#fff !important;border:1px solid #1e40af;font-weight:700;font-size:13.5px;padding:8px 18px;border-radius:8px;box-shadow:0 2px 6px rgba(29,78,216,.35)}',\n"
         "            '.ai-rev-panel .aifh-accept:hover:not(:disabled),.ai-rev-panel .rv-accept-all:hover:not(:disabled){background:#1e40af}',\n"
         "            '.ai-rev-panel .aifh-actions .aifh-accept{padding:7px 16px}',\n"
         "            '.ai-rev-panel .aifh-close{margin-left:auto;background:#dc2626;color:#fff !important;border:1px solid #b91c1c;font-weight:700;font-size:13.5px;padding:8px 18px;border-radius:8px}',\n"
         "            '.ai-rev-panel .aifh-close:hover{background:#b91c1c}',\n"
         "            '.ai-rev-panel .aifh-foot .rv-verify{margin-right:0 !important}',\n"
         "            '.ai-rev-panel .aifh-field{margin:3px 0;font-size:12.5px;line-height:1.45;color:var(--aifh-text)}',\n"
         "            '.ai-rev-panel .aifh-field b{font-weight:700}',\n"
         "            // every line in the panel body is at least 12px and fully opaque, whatever inline size a lane wrote\n"
         "            '.ai-rev-panel .aifh-body [style*=\"font-size:9\"],.ai-rev-panel .aifh-body [style*=\"font-size:10\"],.ai-rev-panel .aifh-body [style*=\"font-size:11\"],.ai-rev-panel .aifh-body [style*=\"font-size: 11\"],.ai-rev-panel .aifh-body [style*=\"font-size: 10\"]{font-size:12px !important}',\n"
         "            '.ai-rev-panel .aifh-body [style*=\"opacity:.\"],.ai-rev-panel .aifh-body [style*=\"opacity: .\"],.ai-rev-panel .aifh-body [style*=\"opacity:0.\"]{opacity:1 !important}',\n"
         "            '.ai-rev-panel .aifh-foot{padding:10px 12px;border-top:1px solid var(--aifh-border);display:flex;gap:8px;align-items:center;flex-wrap:wrap}'", 'styles')

# ---------------------------------------------------------------- the dock
a = sub1(a, "    function _closeFhaPanel() { const p = document.getElementById('ai-fha-panel'); if (p) p.remove(); }\n",
'''    // 27 Oct 2026 (customer report): "the toasts cover the close button on the slide out panels, so move the
    // close button to the bottom with the rest". Every right-hand panel (.ai-rev-panel) gets its Close moved
    // out of the header into the bottom row, last, red (.aifh-close). One function, run for every panel by
    // one observer, so a panel added later docks the same way without anyone remembering to. Moving the
    // button keeps its id, class and click handler.
    function _isPanelClose(b) {
        return !!b && (b.classList.contains('rv-close') || /-close\\d*$/.test(b.id || '') || String(b.textContent || '').trim() === 'Close');
    }
    function _dockPanelClose(p) {
        if (!p || !p.classList || !p.classList.contains('ai-rev-panel')) return;
        const head = p.querySelector(':scope > .aifh-head');
        let btn = head ? Array.prototype.slice.call(head.querySelectorAll('button')).filter(_isPanelClose)[0] : null;
        let foot = p.querySelector(':scope > .aifh-foot');
        if (!btn) btn = foot ? foot.querySelector(':scope > .aifh-close') : null;
        if (!btn) return;
        if (!foot) { foot = document.createElement('div'); foot.className = 'aifh-foot'; p.appendChild(foot); }
        btn.classList.add('aifh-close');
        if (!btn.title) btn.title = 'Close this panel';
        if (btn.parentNode !== foot || foot.lastElementChild !== btn) foot.appendChild(btn);
    }
    function _installPanelCloseDock() {
        if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined' || window.__slPanelDock) return;
        window.__slPanelDock = true;
        const watch = function (p) {
            if (p.__slDockObs) return;
            _dockPanelClose(p);
            try { p.__slDockObs = new MutationObserver(function () { _dockPanelClose(p); }); p.__slDockObs.observe(p, { childList: true }); } catch (_) {}
        };
        const scan = function (nodes) { nodes.forEach(function (n) { if (n && n.nodeType === 1 && n.classList.contains('ai-rev-panel')) watch(n); }); };
        try { new MutationObserver(function (ms) { ms.forEach(function (m) { scan(Array.prototype.slice.call(m.addedNodes)); }); }).observe(document.body, { childList: true }); } catch (_) {}
        scan(Array.prototype.slice.call(document.querySelectorAll('.ai-rev-panel')));
    }
    try { _installPanelCloseDock(); } catch (_) {}
    function _closeFhaPanel() { const p = document.getElementById('ai-fha-panel'); if (p) p.remove(); }
''', 'dock')

# ---------------------------------------------------------------- ANEM card: every field, labeled
a = sub1(a, "    // Render a heterogeneous ANEM action as a review card (op-aware; carries #258 confidence/source).\n    function _anemActionCard(a) {\n",
'''    // 27 Oct 2026 (customer report): "all relevant information needs to be clearly legible". An ANEM card used
    // to show one line (the failure condition, the requirement text...) and the class: an FHA row was accepted
    // without its phases, its three effects or its rationale on screen. Every field an action would write is
    // listed here, labeled, in the order the analysis reads it. An op not listed shows every field it carries.
    const _ANEM_CARD_FIELDS = {
        add_fha: [['subId', 'Function'], ['srcCondId', 'Failure condition id'], ['phases', 'Flight phases'], ['effAc', 'Aircraft effect'], ['effCrew', 'Crew effect'], ['effPax', 'Passenger effect'], ['severityRationale', 'Severity rationale'], ['sevBasis', 'Basis']],
        add_function: [['funcName', 'Function'], ['funcDef', 'Function definition'], ['subName', 'Sub-function'], ['subDef', 'Sub-function definition'], ['traceIds', 'Traces to']],
        add_system: [['name', 'System']],
        add_mac: [['subId', 'Sub-function'], ['phase', 'Phase'], ['clauses', 'Clauses'], ['sddRef', 'SDD reference'], ['rationale', 'Rationale'], ['arbitration', 'Arbitration']],
        add_fcim: [['subId', 'Function'], ['awareness', 'Crew awareness']],
        add_requirement: [['text', 'Requirement'], ['rationale', 'Rationale'], ['traceSubId', 'Traces to'], ['level', 'Level'], ['type', 'Type'], ['verifMethod', 'Verification method']],
        add_fta_tree: [['topEvent', 'Top event'], ['kind', 'Kind'], ['fhaFcId', 'Failure condition'], ['root', 'Structure']],
        add_fta_node: [['pageId', 'Tree'], ['parentId', 'Under node'], ['node', 'Node']],
        update_fta_node: [['pageId', 'Tree'], ['nodeId', 'Node'], ['fields', 'Changes']],
        delete_fta_node: [['pageId', 'Tree'], ['nodeId', 'Node']],
        link: [['fromTable', 'From table'], ['fromId', 'From'], ['toId', 'To'], ['clear', 'Removes the link']],
        add_markov_state: [['modelId', 'Model'], ['name', 'State'], ['isFailed', 'Failed state']],
        delete_markov_state: [['modelId', 'Model'], ['name', 'State']],
        add_markov_transition: [['modelId', 'Model'], ['from', 'From'], ['to', 'To']],
        delete_markov_transition: [['modelId', 'Model'], ['from', 'From'], ['to', 'To']],
        add_interface: [['fromSystemId', 'From system'], ['toSystemId', 'To system'], ['kind', 'Kind'], ['fromFuncId', 'From function'], ['toFuncId', 'To function'], ['medium', 'Medium'], ['direction', 'Direction'], ['icdRef', 'ICD reference']],
        update_interface: [['id', 'Interface'], ['fields', 'Changes']],
        delete_interface: [['id', 'Interface']],
        add_pra: [['threat', 'Particular risk'], ['affectedZones', 'Zones'], ['desc', 'Description'], ['systems', 'Systems'], ['csfl', 'CSFL impact'], ['mitigation', 'Mitigation'], ['requirements', 'Requirements'], ['functions', 'Functions']],
        add_zsa: [['zoneId', 'Zone'], ['desc', 'Description'], ['equip', 'Equipment'], ['interference', 'Interference'], ['mitigation', 'Mitigation'], ['housedFunctions', 'Housed functions']],
        add_cma: [['subject', 'Subject'], ['claim', 'Independence claim'], ['principle', 'Principle'], ['findings', 'Findings'], ['mitigation', 'Mitigation'], ['status', 'Status'], ['requirements', 'Requirements'], ['verification', 'Verification']],
        add_routing: [['name', 'Name'], ['kind', 'Kind'], ['desc', 'Description'], ['routesThroughZones', 'Zones'], ['carriesFunctions', 'Functions'], ['carriesItems', 'Items']],
        add_item: [['itemId', 'Item id'], ['name', 'Name'], ['type', 'Type'], ['dal', 'DAL'], ['daType', 'Assurance type'], ['owningSystemId', 'Owning system'], ['zoneId', 'Zone'], ['description', 'Description']],
        add_fmea: [['level', 'Level'], ['funcSubId', 'Function'], ['funcMode', 'Failure mode'], ['linkedFcId', 'Failure condition'], ['localEffect', 'Local effect'], ['nextEffect', 'Next higher effect'], ['endEffect', 'End effect'], ['detection', 'Detection'], ['compensating', 'Compensating provisions'], ['remarks', 'Remarks']],
        update: [['table', 'Table'], ['_id', 'Row'], ['fields', 'Changes']],
        'delete': [['table', 'Table'], ['_id', 'Row']]
    };
    // Never listed: what the card already says elsewhere (title, class, badges) or what is bookkeeping.
    const _ANEM_CARD_SKIP = { op: 1, scope: 1, systemId: 1, confidence: 1, source: 1, severity: 1, judgementCall: 1, judgementNote: 1,
        effAcLevel: 1, effCrewLevel: 1, effPaxLevel: 1, totalLoss: 1, partialLoss: 1, malfunction: 1, partials: 1, malfunctions: 1,
        totalLossNa: 1, partialLossNa: 1, malfunctionNa: 1 };
    function _anemFieldValue(key, v) {
        if (v == null) return '';
        if (key === 'clauses' && Array.isArray(v)) return v.map(function (c) { return c ? ('at least ' + (c.min != null ? c.min : '?') + ' of ' + (Array.isArray(c.of) ? c.of.join(', ') : String(c.of || ''))) : ''; }).filter(Boolean).join('; ');
        if (key === 'root' && typeof v === 'object') { try { return (typeof _countLeaves === 'function' ? _countLeaves(v) + ' basic event(s) under ' : '') + (v.gateType || v.type || 'gate') + ' "' + (v.name || '') + '"'; } catch (_) { return ''; } }
        if (key === 'node' && typeof v === 'object') return (v.name || '') + ' (' + (v.type === 'gate' ? ((v.gateType || '') + ' gate') : (v.type || 'event')) + ')';
        if (Array.isArray(v)) return v.map(function (x) { return (x && typeof x === 'object') ? (x.name || x.text || x.id || JSON.stringify(x)) : String(x); }).filter(function (x) { return String(x).trim(); }).join(', ');
        if (typeof v === 'boolean') return v ? 'Yes' : '';
        if (typeof v === 'object') return Object.keys(v).map(function (k) { const x = v[k]; return k + ': ' + ((x && typeof x === 'object') ? JSON.stringify(x) : String(x)); }).join('; ');
        return String(v).trim();
    }
    function _anemCardFields(a, op, bodyKey) {
        const list = _ANEM_CARD_FIELDS[op] || Object.keys(a || {}).filter(function (k) { return !_ANEM_CARD_SKIP[k] && k.charAt(0) !== '_'; }).map(function (k) { return [k, k]; });
        let out = '';
        if (a && a.scope === 'system' && a.systemId) {
            let nm = a.systemId;
            try { const so = (typeof _chatSysByIdOrName === 'function') ? _chatSysByIdOrName(a.systemId) : null; if (so && so.name) nm = so.name; } catch (_) {}
            out += '<div class="aifh-field"><b>System:</b> ' + _esc(String(nm)) + '</div>';
        }
        list.forEach(function (f) {
            if (f[0] === bodyKey) return;
            const v = _anemFieldValue(f[0], a ? a[f[0]] : null);
            if (!v) return;
            out += '<div class="aifh-field"><b>' + _esc(f[1]) + ':</b> ' + _esc(v.length > 1200 ? v.slice(0, 1200) + '\\u2026' : v) + '</div>';
        });
        if (op === 'add_fha' && typeof _axisLevelsHtml === 'function') { try { out += _axisLevelsHtml(a); } catch (_) {} }
        return out;
    }
    // Render a heterogeneous ANEM action as a review card (op-aware; carries #258 confidence/source).
    function _anemActionCard(a) {
''', 'card fields')
a = sub1(a, "        const body = a.fcDesc || a.funcName || a.subName || a.text || a.topEvent || a.threat || a.zoneId || a.subject || a.mode || (a.subId ? ('subId ' + a.subId) : '') || '';\n",
         "        const _bodyKey = ['fcDesc', 'funcName', 'subName', 'text', 'topEvent', 'threat', 'zoneId', 'subject', 'mode'].filter(function (k) { return a[k]; })[0] || '';\n"
         "        const body = (_bodyKey ? a[_bodyKey] : '') || (a.subId ? ('subId ' + a.subId) : '') || '';\n", 'card body')
a = sub1(a, "        return '<h4>' + _esc(title) + (a.scope === 'system' ? ' · System' : '') + sev + _judge + '</h4><div class=\"aifh-eff\">' + _esc(String(body).slice(0, 220)) + '</div>'\n             + _fcimCells + _abReason + _judgeNote + _droppedPh\n",
         "        return '<h4>' + _esc(title) + (a.scope === 'system' ? ' · System' : '') + sev + _judge + '</h4><div class=\"aifh-eff\">' + _esc(String(body).slice(0, 1200)) + '</div>'\n             + _anemCardFields(a, op, _bodyKey)   // 27 Oct 2026: every field the action would write\n             + _fcimCells + _abReason + _judgeNote + _droppedPh\n", 'card return')

# ---------------------------------------------------------------- ANEM chat: palette, header, bottom row
m = re.search(r"sub: '#9aa3b2'", a); n = re.search(r"sub: '#667085'", a)
if not m or not n or a.count("sub: '#9aa3b2'") != 1 or a.count("sub: '#667085'") != 1: sys.exit('chat palette anchors')
a = a.replace("sub: '#9aa3b2'", "sub: '#c9d0db', faint: '#9aa3b2'").replace("sub: '#667085'", "sub: '#3c4350', faint: '#667085'")
a = sub1(a, "            +   '<button id=\"anem-x\" title=\"Close (Esc)\" style=\"border:none;background:transparent;font-size:24px;line-height:.8;cursor:pointer;color:' + pal.sub + ';flex-shrink:0;\">×</button>'\n            + '</div>'\n            + '<div style=\"display:flex;gap:6px;padding:8px 14px;border-bottom:1px solid ' + pal.border + ';\">'\n            +   '<button id=\"ai-chat-undo\" style=\"font-size:12px;padding:6px 10px;border:1px solid ' + pal.border + ';border-radius:8px;background:transparent;color:inherit;cursor:pointer;\">↶ Undo last turn</button>'\n            +   '<button id=\"ai-chat-clear\" style=\"font-size:12px;padding:6px 10px;border:1px solid ' + pal.border + ';border-radius:8px;background:transparent;color:inherit;cursor:pointer;\">Clear</button>'\n            + '</div>'\n",
         "            + '</div>'\n", 'anem header')
a = sub1(a, "            +   '<div style=\"padding:2px 12px 9px;font-size:10.5px;color:' + pal.sub + ';text-align:center;line-height:1.4;\">ANEM is powered by ",
         "            // 27 Oct 2026 (customer report): Undo, Clear and Close live down here, out from under the toasts; Close is red.\n"
         "            +   '<div id=\"anem-actions\" style=\"display:flex;gap:8px;padding:0 12px 8px;align-items:center;\">'\n"
         "            +     '<button id=\"ai-chat-undo\" style=\"font-size:12.5px;padding:7px 12px;border:1px solid ' + pal.border + ';border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-weight:600;\">↶ Undo last turn</button>'\n"
         "            +     '<button id=\"ai-chat-clear\" style=\"font-size:12.5px;padding:7px 12px;border:1px solid ' + pal.border + ';border-radius:8px;background:transparent;color:inherit;cursor:pointer;font-weight:600;\">Clear</button>'\n"
         "            +     '<button id=\"anem-x\" title=\"Close (Esc)\" style=\"margin-left:auto;font-size:13.5px;padding:7px 18px;border:1px solid #b91c1c;border-radius:8px;background:#dc2626;color:#fff;cursor:pointer;font-weight:700;\">Close</button>'\n"
         "            +   '</div>'\n"
         "            +   '<div style=\"padding:2px 12px 9px;font-size:10.5px;color:' + pal.faint + ';text-align:center;line-height:1.4;\">ANEM is powered by ", 'anem bottom row')
# the not-configured variant: same bottom Close
a = sub1(a, "            p.innerHTML = '<div style=\"display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid ' + pal.border + ';\"><div>' + _anemWordmark(26) + '</div><button id=\"anem-x\" title=\"Close\" style=\"border:none;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:' + pal.sub + ';\">×</button></div>'\n",
         "            p.innerHTML = '<div style=\"display:flex;align-items:center;padding:14px;border-bottom:1px solid ' + pal.border + ';\"><div>' + _anemWordmark(26) + '</div></div>'\n", 'anem off head')
a = sub1(a, "ANEM needs the AI backend (Pro+). Open <b>AI Tools → AI Assistant → AI Settings</b> to configure it, then reopen ANEM.</div>';\n",
         "ANEM needs the AI backend (Pro+). Open <b>AI Tools → AI Assistant → AI Settings</b> to configure it, then reopen ANEM.</div>'\n"
         "                + '<div style=\"margin-top:auto;display:flex;padding:10px 12px;border-top:1px solid ' + pal.border + ';\"><button id=\"anem-x\" title=\"Close\" style=\"margin-left:auto;font-size:13.5px;padding:7px 18px;border:1px solid #b91c1c;border-radius:8px;background:#dc2626;color:#fff;cursor:pointer;font-weight:700;\">Close</button></div>';\n", 'anem off foot')
wr(S('ai_assistant.js'), a)

# ---------------------------------------------------------------- loader pin
l = rd(S('ai_loader.js'))
l = sub1(l, 'ai_assistant.js?v=76.90', 'ai_assistant.js?v=76.91', 'loader pin')
l = '// 27 Oct 2026: ai_assistant.js bumped to v76.91 (the right-hand AI panels: red Close in the bottom row, solid Accept and Draft buttons, legible text, ANEM cards list every field).\n' + l
wr(S('ai_loader.js'), l)
print('patched: ai_assistant.js (v76.91), ai_loader.js')
