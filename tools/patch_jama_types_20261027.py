#!/usr/bin/env python3
"""27 Oct 2026: the Jama connection, made exact for a customer's three-tier function tree.

Waqas: "make sure there are no bugs on our side for their jama connection or the browser, they have three
tiers of functions, how do we enable them to map that stuff acurately". Their functions sit in Jama's tree
as Function > Sub-function > Sub-sub-function, nested under one another, with rich descriptions and diagrams.

Found by driving the real live_bridge.js against an in-memory Jama shaped like that
(tests/regression_jama_three_tiers_20261027.test.js):
  1. Everything under a ticked folder came in as the ticked kind, whatever its Jama item type: a Text item
     ("Introduction") became a top function, and a requirement nested under a function became a
     sub-function. Now each Jama item type under a ticked folder is decided once: a Text item stays out,
     a type whose name says what it is goes there, a folder with one kind of item takes the ticked kind,
     and anything else is asked (the review shows each Jama type with a count and examples and a chooser).
     Until every type is decided nothing is staged, so nothing comes in under the wrong kind. The choice
     is kept with the ticked folder.
  2. Descriptions lost their structure: table cells ran together ("ab" for a|b), list items lost their
     bullets and diagrams vanished without a trace. Now cells are separated, list items keep a dash, and
     each image or diagram leaves "[image or diagram in Jama]" (with its caption when it has one).
  3. A read that stopped at the 20,000-item limit flagged everything it had not reached as MISSING. Now
     nothing is flagged missing from a read that stopped early, and the warning says so.
  4. The Functions page never showed the check's warnings (a sub-sub-sub-function refused for the
     3-level layout was named only on Requirements exchange). The page strips show them now.
  5. The review counts the tree by level (functions, sub-functions, sub-sub-functions) and names the
     level of every new row, so the mapping can be checked at a glance before signing.

Run from the repo root: python3 tools/patch_jama_types_20261027.py   (refuses on any missing anchor)
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

# ------------------------------------------------------------------ jama_tree.js: descriptions keep their shape
j = rd(S('jama_tree.js'))
if 'image or diagram in Jama' in j: sys.exit('jama_tree.js already patched')
j = sub1(j, "// jama_tree.js, v1.2, 22 Oct 2026:", "// jama_tree.js, v1.3, 27 Oct 2026: descriptions keep table cells apart, list dashes and a marker for each image or diagram.\n// v1.2, 22 Oct 2026:", 'tree header')
j = sub1(j, """        let t = String(html == null ? '' : html);
        t = t.replace(/<\\s*br\\s*\\/?>/gi, '\\n')""", """        let t = String(html == null ? '' : html);
        // 27 Oct 2026: a diagram or image leaves a marker (with its caption when it has one) instead of
        // vanishing; table cells stay apart; list items keep a dash.
        t = t.replace(/<\\s*(script|style)\\b[\\s\\S]*?<\\/\\s*\\1\\s*>/gi, '');
        t = t.replace(/<\\s*(img|svg|object|embed|canvas)\\b[^>]*>/gi, function (m) {
            const a = /\\b(?:alt|title)\\s*=\\s*("([^"]*)"|'([^']*)')/i.exec(m);
            const cap = a ? (a[2] != null ? a[2] : a[3]).replace(/[\\[\\]<>]/g, '').trim() : '';
            return ' [image or diagram in Jama' + (cap ? ': ' + cap : '') + '] ';
        });
        t = t.replace(/<\\/\\s*svg\\s*>/gi, '');
        t = t.replace(/<\\/\\s*(td|th)\\s*>/gi, ' | ').replace(/<\\s*li\\b[^>]*>/gi, '\\n- ');
        t = t.replace(/<\\s*br\\s*\\/?>/gi, '\\n')""", 'plain')
j = sub1(j, """        return t.split('\\n').map(function (l) { return l.replace(/[ \\t\u00a0]+/g, ' ').trim(); }).filter(Boolean).join('\\n');""",
            """        return t.split('\\n').map(function (l) { return l.replace(/[ \\t\u00a0]+/g, ' ').trim().replace(/^\\|\\s*/, '').replace(/\\s*\\|$/, '').trim(); }).filter(function (l) { return l && l !== '-'; }).join('\\n');""", 'plain end')
# levels of the tree, for the review
j = sub1(j, "    function pending(d) {", """    // 27 Oct 2026: how many Jama functions sit at each level (1 = top function), for the review
    function levelCounts(tree) {
        const out = [];
        arrOf(tree && tree.order).forEach(function (n) {
            let d = 0, c = n, g = 0; while (c && tree.parentId.get(c.id) != null && g++ < 10000) { d++; c = tree.byId.get(tree.parentId.get(c.id)); }
            out[d] = (out[d] || 0) + 1;
        });
        for (let i = 0; i < out.length; i++) out[i] = out[i] || 0;
        return out;
    }
    function pending(d) {""", 'levelCounts')
j = re.sub(r"(normalizeItem: normalizeItem,)", r"\1 levelCounts: levelCounts,", j, count=1) if 'normalizeItem: normalizeItem,' in j else j
wr(S('jama_tree.js'), j)
if 'levelCounts: levelCounts' not in rd(S('jama_tree.js')):
    sys.exit('jama_tree.js: export anchor not found')
print('patched: jama_tree.js')

# ------------------------------------------------------------------ live_bridge.js
b = rd(S('live_bridge.js'))
if '_typeDecide' in b: sys.exit('live_bridge.js already patched')
b = sub1(b, "// ============================================================================\n(function () {\n    'use strict';\n",
"""//
// v4.1, 27 Oct 2026 (Waqas: "make sure there are no bugs on our side for their jama connection or the
// browser, they have three tiers of functions, how do we enable them to map that stuff acurately").
//   * EACH JAMA ITEM TYPE UNDER A TICKED FOLDER IS DECIDED. A Text item no longer comes in as a function,
//     nor a requirement nested under a function as a sub-function. Text stays out; a type whose name says
//     what it is goes there; a folder holding one kind of item takes the ticked kind; anything else is
//     asked, by Jama type, with a count and examples, and nothing is staged until it is answered. The
//     answer is kept with the ticked folder (picks[].types).
//   * The review counts the function tree by level and names each new row's level; the page panels show
//     the check's warnings; a read cut short at the item limit flags nothing as missing.
// ============================================================================
(function () {
    'use strict';
""", 'header')

# ---- the type decision
b = sub1(b, "    function _isContainerTypeId(id) {",
"""    // 27 Oct 2026: what one Jama item type under one ticked thing is in Safety Lab.
    //   chosen  the person said so (picks[].types)       ticked  it is the ticked item's own type
    //   text    a Jama Text item: stays out               name    the type's name says what it is
    //   only    the one kind of item under that folder    ask     nobody can tell: asked, nothing staged
    const _TEXT_RE = /^(text|txt)$/i;
    function _kindFromText(s) {
        s = String(s || '');
        if (/failure\\s*condition|hazard/i.test(s)) return 'fc';
        if (/assumption/i.test(s)) return 'asm';
        if (/requirement/i.test(s)) return 'req';
        if (/function/i.test(s)) return 'fn';
        return '';
    }
    function _typeOf(id) { return (_itemTypes || []).find(t => t.id === id) || null; }
    function _isTextType(id) { const t = _typeOf(id); return !!(t && (_TEXT_RE.test(t.key || '') || _TEXT_RE.test(t.name || ''))); }
    function _typeLabel(id) { const t = _typeOf(id); return t ? t.name : 'Jama item type ' + id; }
    function _typeDecide(L, tid) {
        const saved = L.types && Object.prototype.hasOwnProperty.call(L.types, String(tid)) ? L.types[String(tid)] : null;
        if (saved === 'skip' || KIND_V[saved] != null) return { kind: saved, how: 'chosen' };
        if (L.ownType != null && tid === L.ownType) return { kind: L.kind, how: 'ticked' };
        if (_isTextType(tid)) return { kind: 'skip', how: 'text' };
        const t = _typeOf(tid), g = t ? _kindFromText(t.name) : '';
        if (g) return { kind: g, how: 'name' };
        const others = Array.from(L.counts.keys()).filter(x => !_isTextType(x));
        if (others.length === 1) return { kind: L.kind, how: 'only' };
        return { kind: '', how: 'ask' };
    }
    function _isContainerTypeId(id) {""", 'decide')

b = sub1(b, """            const n = T.normalizeItem(raw && raw.data ? raw.data : raw);
            if (!n) { warnings.push(gone); continue; }
            live.push({ kind: p.kind, id: n.id, seq: n.seq, depth: n.seq ? n.seq.split('.').length : 999 });
        }""", """            const rawN = raw && raw.data ? raw.data : raw;
            const n = T.normalizeItem(rawN);
            if (!n) { warnings.push(gone); continue; }
            const isBox = (rawN && rawN.childItemType != null) || _isContainerTypeId(n.type);
            live.push({ kind: p.kind, id: n.id, key: n.key || p.key || String(p.id), name: n.name || p.name || '', seq: n.seq, depth: n.seq ? n.seq.split('.').length : 999,
                        ownType: isBox ? null : n.type, types: (p.types && typeof p.types === 'object') ? p.types : {}, counts: new Map(), examples: new Map() });
        }
        // 27 Oct 2026: the item type names decide Text items and named types; read once when Jama allows it
        if (live.length && _itemTypes == null && !_itemTypesRefused) {
            try { _itemTypes = await bridgeFetchItemTypes(); } catch (_) { _itemTypesRefused = true; }
        }""", 'live')

b = sub1(b, """        const out = [], context = new Map();
        let startAt = 0, total = null, truncated = false;
        if (live.length) {""", """        const out = [], context = new Map(), hits = [];
        let startAt = 0, total = null, truncated = false;
        if (live.length) {""", 'hits decl')
b = sub1(b, """                    if (hit) { n.jamaType = n.type; n.type = KIND_V[hit.kind]; out.push(n); }
                    else context.set(n.id, n);""", """                    if (hit) {
                        hits.push([n, hit]);
                        hit.counts.set(n.type, (hit.counts.get(n.type) || 0) + 1);
                        const ex = hit.examples.get(n.type) || []; if (ex.length < 3) ex.push(n.key + (n.name ? ' ' + n.name : '')); hit.examples.set(n.type, ex);
                    }
                    else context.set(n.id, n);""", 'hit push')
b = sub1(b, """        out._truncated = truncated; out._total = total; out._context = context; out._warnings = warnings;
        return out;
    }
""", """        // 27 Oct 2026: each Jama item type under each ticked thing, decided (_typeDecide). An item left out
        // is still looked through (context), so a function under it keeps its place in the tree.
        const types = [];
        live.forEach(L => L.counts.forEach((count, tid) => {
            const dcs = _typeDecide(L, tid);
            types.push({ pickId: L.id, pickKey: L.key, pickName: L.name, pickKind: L.kind, typeId: tid, label: _typeLabel(tid), named: !!_typeOf(tid),
                         count: count, examples: L.examples.get(tid) || [], kind: dcs.kind, how: dcs.how });
        }));
        const kindOf = new Map(types.map(t => [t.pickId + ':' + t.typeId, t.kind]));
        hits.forEach(([n, L]) => {
            const k = kindOf.get(L.id + ':' + n.type);
            if (KIND_V[k] != null) { n.jamaType = n.type; n.type = KIND_V[k]; out.push(n); }
            else context.set(n.id, n);
        });
        out._truncated = truncated; out._total = total; out._context = context; out._warnings = warnings;
        out._types = types; out._undecided = types.filter(t => t.how === 'ask');
        return out;
    }
""", 'decide apply')

# itemtypes refused memory
b = sub1(b, "    let _lastDiff = null, _checking = false, _itemTypes = null;",
            "    let _lastDiff = null, _checking = false, _itemTypes = null, _itemTypesRefused = false;", 'refused var')
b = sub1(b, ".then(l => { if (_br === b) { _itemTypes = l; b.types = new Map(l.map(t => [t.id, t.name])); } })",
            ".then(l => { if (_br === b) { _itemTypes = l; _itemTypesRefused = false; b.types = new Map(l.map(t => [t.id, t.name])); } })", 'browser types')
b = sub1(b, ".catch(e => { if (_br === b) b.typesErr = String((e && e.message) || e); })",
            ".catch(e => { _itemTypesRefused = true; if (_br === b) b.typesErr = String((e && e.message) || e); })", 'browser types refused')
# _guessKind uses the shared words
b = sub1(b, """        for (const s of [t, x.name || '']) {
            if (/failure\\s*condition|hazard/i.test(s)) return 'fc';
            if (/assumption/i.test(s)) return 'asm';
            if (/requirement/i.test(s)) return 'req';
            if (/function/i.test(s)) return 'fn';
        }
        return '';""", """        for (const s of [t, x.name || '']) { const k = _kindFromText(s); if (k) return k; }
        return '';""", 'guessKind')

# ---- the check: held while a type is undecided
b = sub1(b, """            const items = await bridgeFetchItems();
            const base = String(cfg.baseUrl).replace(/\\/+$/, '');""", """            const items = await bridgeFetchItems();
            const base = String(cfg.baseUrl).replace(/\\/+$/, '');
            // 27 Oct 2026: a Jama item type nobody can name yet holds the whole check, so nothing comes in
            // under the wrong kind; the panels ask, and the answer runs the check again.
            if (items && Array.isArray(items._undecided) && items._undecided.length) {
                _lastDiff = { held: true, types: items._types, req: null, fn: null, asm: null, fc: null, sys: {},
                              warnings: (items._warnings || []).slice().concat([_heldText(items._undecided)]), checkedAt: new Date().toISOString() };
                _stageIn = null;
                try { if (typeof window.jrnl === 'function') window.jrnl('bridge-check', 'Jama checked: ' + items.length + ' item(s); held until ' + items._undecided.length + ' Jama item type(s) are said what they are.'); } catch (_) {}
                if (!silent) { try { showToast('Jama: say what ' + (items._undecided.length === 1 ? 'one kind' : items._undecided.length + ' kinds') + ' of Jama item is first, then the changes are staged.', 'info', 5200); } catch (_) {} }
                _setProgress(''); _render();
                return _lastDiff;
            }""", 'held')
b = sub1(b, """            _lastDiff = await bridgeStage(items, cfg, id => _get(base + '/rest/latest/items/' + encodeURIComponent(id)));""",
            """            _lastDiff = await bridgeStage(items, cfg, id => _get(base + '/rest/latest/items/' + encodeURIComponent(id)));
            if (items && Array.isArray(items._types)) _lastDiff.types = items._types;""", 'types on diff')

# ---- the stage: the read limit, the tree's levels
b = sub1(b, """        if (items && items._truncated) warnings.push('Read the first ' + (MAX_PAGES * PAGE).toLocaleString() + ' items only (Jama reports ' + Number(items._total || 0).toLocaleString() + '). Narrow the item types or ask Safety Lab to raise the limit.');""",
            """        if (items && items._truncated) warnings.push('Read the first ' + (MAX_PAGES * PAGE).toLocaleString() + ' items of the Jama project only (Jama reports ' + Number(items._total || 0).toLocaleString() + '), so nothing is flagged as missing from this check. Ask Safety Lab to raise the limit.');""", 'trunc text')
b = sub1(b, """        _stageIn = { items: items || [], cfg: cfg, parents, fcParents, containers, warnings };""",
            """        _stageIn = { items: items || [], cfg: cfg, parents, fcParents, containers, warnings, truncated: !!(items && items._truncated) };""", 'trunc flag')
b = sub1(b, """            d.fn.tops = tree.tops.length; d.fn.total = fnItems.length;""",
            """            d.fn.tops = tree.tops.length; d.fn.total = fnItems.length;
            d.fn.levels = T.levelCounts ? T.levelCounts(tree) : [];   // 27 Oct 2026: the review counts the tree by level""", 'levels')
b = sub1(b, """            d.sys[c.sysId] = sd;
        });
        return d;
    }""", """            d.sys[c.sysId] = sd;
        });
        // 27 Oct 2026: a read cut short at the item limit cannot say anything is gone from Jama
        if (inp.truncated) [d].concat(Object.keys(d.sys).map(k => d.sys[k])).forEach(s => ['fn', 'req', 'asm', 'fc'].forEach(k => { const x = s && s[k]; if (x && Array.isArray(x.missing)) x.missing = []; }));
        return d;
    }
    function _heldText(und) {
        return 'Nothing from Jama is staged yet: ' + und.length + ' kind' + (und.length === 1 ? '' : 's') + ' of Jama item under what you chose ' + (und.length === 1 ? 'needs' : 'need') +
            ' saying what ' + (und.length === 1 ? 'it is' : 'they are') + ' in Safety Lab (' + und.slice(0, 3).map(t => t.label + ' under ' + t.pickKey).join('; ') + (und.length > 3 ? '; ...' : '') + '). Choose below, or Leave out.';
    }""", 'trunc missing')

# ---- the review: levels, level names, the type table
b = sub1(b, """    function _fnPlace(x) {
        const parts = [x.top ? x.top.key : ''].concat(x.parent ? [x.parent.key] : []).filter(Boolean);
        return parts.length ? 'under ' + parts.join(' > ') : 'top-level function';
    }""", """    const _LEVEL = ['function', 'sub-function', 'sub-sub-function'];
    const _levelName = d => _LEVEL[d] || ('level ' + (d + 1) + ' function');
    function _fnPlace(x) {
        const parts = [x.top ? x.top.key : ''].concat(x.parent ? [x.parent.key] : []).filter(Boolean);
        // 27 Oct 2026: the level it lands at, so the mapping is checked at a glance
        const lv = (x.depth != null && x.depth > 0) ? _levelName(x.depth) + ' ' : '';
        return parts.length ? lv + 'under ' + parts.join(' > ') : 'top-level function';
    }
    function _levelsLine(f) {
        const lv = (f && f.levels) || []; if (!lv.length) return '';
        const parts = lv.map((n, i) => n.toLocaleString() + ' ' + _levelName(i) + (n === 1 ? '' : 's'));
        const deep = (f.tooDeep || []).length;
        return '<div class="jb-levels" style="font-size:11px; color:var(--color-text-secondary); margin:2px 0 4px;">In Jama: ' + _esc(parts.join(', ')) +
            (deep ? ' (' + deep + ' below the levels this project allows, not brought in)' : '') + '.</div>';
    }
    const _HOW = { chosen: 'chosen by you', ticked: 'the item you ticked', text: 'a Jama Text item', name: 'from its Jama type name', only: 'the only kind of item there', ask: 'needs your answer' };
    const _TYPE_OPTS = [['', 'Choose what this is'], ['fn', 'Functions'], ['req', 'Requirements'], ['asm', 'Assumptions'], ['fc', 'Failure conditions'], ['skip', 'Leave out']];
    // 27 Oct 2026: each Jama item type under each ticked thing, what it comes in as, changeable
    function _typesHtml(d, onlyAsk) {
        const list = ((d && d.types) || []).filter(t => !onlyAsk || t.how === 'ask');
        if (!list.length) return '';
        const sel = 'font-size:11.5px; padding:2px 6px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        return '<div class="jb-types" style="margin:6px 0;"><div style="font-size:11px; font-weight:700; margin-bottom:3px;">Jama item types under what you chose</div>' +
            '<table class="data-table" style="width:100%;"><tbody>' + list.map(t =>
                '<tr data-pick="' + Number(t.pickId) + '" data-type="' + Number(t.typeId) + '"' + (t.how === 'ask' ? ' class="jb-type-ask"' : '') + '>' +
                '<td style="font-size:11.5px;"><b>' + _esc(t.label) + '</b> <span style="color:var(--color-text-secondary);">under ' + _esc(t.pickKey) + ', ' + Number(t.count).toLocaleString() + ' item' + (t.count === 1 ? '' : 's') + '</span>' +
                    '<div style="font-size:10.5px; color:var(--color-text-secondary);">e.g. ' + _esc(t.examples.join('; ')) + '</div></td>' +
                '<td style="font-size:11px; color:' + (t.how === 'ask' ? 'var(--color-warning); font-weight:700' : 'var(--color-text-secondary)') + ';">' + _esc(_HOW[t.how] || '') + '</td>' +
                '<td><select class="jb-type-kind" aria-label="What ' + _esc(t.label) + ' under ' + _esc(t.pickKey) + ' is in Safety Lab" onchange="bridgeTypeKind(' + Number(t.pickId) + ', ' + Number(t.typeId) + ', this.value)" style="' + sel + '">' +
                    _TYPE_OPTS.map(([v, l]) => '<option value="' + v + '"' + ((t.kind || '') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></td></tr>').join('') +
            '</tbody></table></div>';
    }""", 'fnPlace')
b = sub1(b, """            if (titled) html += '<div style="font-size:11px; font-weight:700; margin:6px 0 3px;">' + (scope === 'ac' ? 'Aircraft ' : (s.name || scope) + ' · ') + KIND_TITLE[k].toLowerCase() + '</div>';
            html += _tbl(body);""", """            if (titled) html += '<div style="font-size:11px; font-weight:700; margin:6px 0 3px;">' + (scope === 'ac' ? 'Aircraft ' : (s.name || scope) + ' · ') + KIND_TITLE[k].toLowerCase() + '</div>';
            if (k === 'fn' && scope === 'ac') html += _levelsLine(s.fn);
            html += _tbl(body);""", 'levels in review')
# full panel: the type table (all of it), the held state
b = sub1(b, """            (d.warnings || []).forEach(w => { html += '<div style="font-size:11px; color:var(--color-warning); margin-bottom:4px;">' + _esc(w) + '</div>'; });
            html += _reviewHtml(d, 'ac', ['fn', 'req', 'asm', 'fc'], 'fcim', true);""", """            (d.warnings || []).forEach(w => { html += '<div style="font-size:11px; color:var(--color-warning); margin-bottom:4px;">' + _esc(w) + '</div>'; });
            html += _typesHtml(d, false);
            html += _reviewHtml(d, 'ac', ['fn', 'req', 'asm', 'fc'], 'fcim', true);""", 'full types')
# page strips: warnings and the held question
b = sub1(b, """            '<div class="jb-progress" style="font-size:11px; color:var(--color-text-secondary);">' + _esc(_progress) + '</div>' + sysLine;
        if (n && _open[p.key]) {""", """            '<div class="jb-progress" style="font-size:11px; color:var(--color-text-secondary);">' + _esc(_progress) + '</div>' + sysLine;
        // 27 Oct 2026: the check's warnings and, while it is held, the question, on every page
        if (d && (d.warnings || []).length) html += '<div class="jb-warn">' + d.warnings.slice(0, 6).map(w => '<div style="font-size:11px; color:var(--color-warning); margin-top:3px;">' + _esc(w) + '</div>').join('') + '</div>';
        if (d && d.held) html += _typesHtml(d, true);
        else if (d && p.key === 'ac-func' && n && _open[p.key]) html += '<div style="margin-top:6px;">' + _levelsLine(d.fn) + '</div>';
        if (n && _open[p.key]) {""", 'strip warn')
# the choice is kept with the pick, and survives the browser
b = sub1(b, """        cfg.picks = picks.map(p => ({ id: p.id, key: p.key || '', name: p.name || '', seq: p.seq || '', kind: p.kind, container: !!p.container }));""",
            """        cfg.picks = picks.map(p => Object.assign({ id: p.id, key: p.key || '', name: p.name || '', seq: p.seq || '', kind: p.kind, container: !!p.container },
                                                 p.types && typeof p.types === 'object' && Object.keys(p.types).length ? { types: p.types } : {}));""", 'bring keeps types')
b = sub1(b, """            b.picks.set(id, { id: id, key: x.key, name: x.name, seq: x.seq, container: x.container, kind: (was && was.kind) || _guessKind(b, x) });""",
            """            b.picks.set(id, Object.assign({ id: id, key: x.key, name: x.name, seq: x.seq, container: x.container, kind: (was && was.kind) || _guessKind(b, x) }, was && was.types ? { types: was.types } : {}));""", 'pick keeps types')
b = sub1(b, """    // ------------------------------------------------------------- the wraps""", """    // 27 Oct 2026: what one Jama item type under one ticked thing is; kept with that pick, then checked again
    window.bridgeTypeKind = function (pickId, typeId, kind) {
        const cfg = bridgeConfig();
        const p = (Array.isArray(cfg.picks) ? cfg.picks : []).find(x => x && Number(x.id) === Number(pickId));
        if (!p || !isFinite(Number(typeId))) return Promise.resolve(null);
        const k = (kind === 'skip' || KIND_V[kind] != null) ? kind : '';
        p.types = Object.assign({}, p.types || {});
        if (k) p.types[String(Number(typeId))] = k; else delete p.types[String(Number(typeId))];
        bridgeConfigSave(cfg);
        _lastDiff = null; _stageIn = null;
        return bridgeCheck(false).catch(e => { try { showToast('Bridge: ' + e.message, 'error', 6200); } catch (_) {} return null; });
    };

    // ------------------------------------------------------------- the wraps""", 'type kind fn')
# the review lists new functions in Jama's tree order, so a branch reads top to bottom
b = sub1(b, """                _cap(x.fresh, y => _row('NEW', C_NEW, y.item.key + ', ' + y.item.name, y.funcOnly ? 'top-level function, nothing under it yet' : _fnPlace(y))) +""",
            """                _cap(_bySeq(x.fresh), y => _row('NEW', C_NEW, y.item.key + ', ' + y.item.name, y.funcOnly ? 'top-level function, nothing under it yet' : _fnPlace(y))) +""", 'fresh order')
b = sub1(b, """    function _levelsLine(f) {""", """    // 27 Oct 2026: Jama's own tree order (its sequence, 1.2.10 after 1.2.9), for reading a branch top to bottom
    function _bySeq(list) {
        const segs = s => String(s || '').split('.').map(Number);
        return (list || []).slice().sort((a, b) => { const x = segs(a.item && a.item.seq), y = segs(b.item && b.item.seq); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; });
    }
    function _levelsLine(f) {""", 'bySeq')
# the kinds a check reads include what a Jama type under a pick was said (or named) to be
b = sub1(b, """    function _types(cfg) {
        const pk = _picks(cfg);
        if (pk.length) {
            const has = k => pk.some(p => p.kind === k) ? [KIND_V[k]] : [];""", """    function _types(cfg, items) {
        const pk = _picks(cfg);
        if (pk.length) {
            // 27 Oct 2026: a Jama item type under a ticked folder can be another kind (a requirement nested
            // under a function); what it was said or named to be is read too
            const extra = new Set();
            pk.forEach(p => { if (p.types && typeof p.types === 'object') Object.keys(p.types).forEach(t => { if (KIND_V[p.types[t]] != null) extra.add(p.types[t]); }); });
            ((items && items._types) || []).forEach(t => { if (KIND_V[t.kind] != null) extra.add(t.kind); });
            const has = k => (pk.some(p => p.kind === k) || extra.has(k)) ? [KIND_V[k]] : [];""", 'types extra')
b = sub1(b, """        const T = _T(), K = _K();
        const ty = _types(cfg);
        const warnings = [];
        const cache = new Map();""", """        const T = _T(), K = _K();
        const ty = _types(cfg, items);
        const warnings = [];
        const cache = new Map();""", 'stage ty')
b = sub1(b, """        const cfg = inp.cfg, ty = _types(cfg), items = inp.items;""", """        const cfg = inp.cfg, ty = _types(cfg, inp.items), items = inp.items;""", 'compute ty')
wr(S('live_bridge.js'), b)
print('patched: live_bridge.js')

x = rd(S('index.html'))
x = sub1(x, 'jama_tree.js?v=1.2', 'jama_tree.js?v=1.3', 'pin tree')
x = sub1(x, 'live_bridge.js?v=3.2', 'live_bridge.js?v=3.3', 'pin bridge')
wr(S('index.html'), x)
print('patched: index.html')
