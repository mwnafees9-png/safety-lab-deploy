// fta_exchange.js: SLFtaExchange 1.0
//
// 1 Nov 2026 (customer checklist item 26, with item 29 "type codes"): fault trees in and out of Safety Lab.
//   - Open-PSA Model Exchange Format (MEF) XML, both ways: the open format other fault tree tools read and write
//     (SCRAM, XFTA, RiskSpectrum and CAFTA through their Open-PSA converters).
//   - A spreadsheet, both ways: CSV out; CSV or Excel in, with each column mapped by the engineer (one row per gate or
//     event, its parent, its type code, its numbers).
//   - Type codes are shown and carried both ways: basic (BE), undeveloped (UE), house (HE), conditioning (CE),
//     transfer (TR) and every gate type (AND, OR, XOR, VOTING k of n, INHIBIT, NOT, PAND, SPARE, SEQ, FDEP). In MEF a
//     gate type the format has no word for (INHIBIT, PAND, SPARE, SEQ, FDEP), and every event type, rides in an
//     attribute named "sl-type", so a round trip through Safety Lab loses nothing; another tool reads the nearest
//     static logic (AND, or OR for FDEP) and the import report says so.
//   - An imported tree keeps the name of the file it came from (page.importedFrom); on the Golden Thread it says so.
//   - Native CAFTA and FaultTree+ files come later, when a real file is available to build against.
// Import never overwrites anything: every imported tree is a new tree, with new IDs; a name already used in the
// project gets a fresh ID and the report lists the rename. Within one import, the same name is the same event.
//
// API (window.SLFtaExchange): TYPES, typeCode(node), parseType(text), exportMef(pages), importMef(xml, file),
// exportSheet(pages) (rows), sheetCsv(rows), parseCsv(text), guessMapping(header), importSheet(rows, mapping, file),
// commit(result), open() (the dialog).
(function () {
    'use strict';
    var VERSION = '1.0';
    // the type codes, shown in the dialog legend, written to the spreadsheet, carried in MEF
    var TYPES = [
        { key: 'basic', code: 'BE', label: 'Basic event', kind: 'event' },
        { key: 'undeveloped', code: 'UE', label: 'Undeveloped event', kind: 'event' },
        { key: 'house', code: 'HE', label: 'House event (true or false)', kind: 'event' },
        { key: 'conditioning', code: 'CE', label: 'Conditioning event', kind: 'event' },
        { key: 'TRANSFER', code: 'TR', label: 'Transfer to another tree', kind: 'gate' },
        { key: 'AND', code: 'AND', label: 'AND gate', kind: 'gate' },
        { key: 'OR', code: 'OR', label: 'OR gate', kind: 'gate' },
        { key: 'XOR', code: 'XOR', label: 'Exclusive OR gate', kind: 'gate' },
        { key: 'VOTING', code: 'VOT', label: 'Voting gate, k of n', kind: 'gate' },
        { key: 'INHIBIT', code: 'INH', label: 'Inhibit gate', kind: 'gate' },
        { key: 'NOT', code: 'NOT', label: 'NOT gate', kind: 'gate' },
        { key: 'PAND', code: 'PAND', label: 'Priority AND gate', kind: 'gate' },
        { key: 'SPARE', code: 'SPARE', label: 'Spare gate', kind: 'gate' },
        { key: 'SEQ', code: 'SEQ', label: 'Sequence gate', kind: 'gate' },
        { key: 'FDEP', code: 'FDEP', label: 'Functional dependency', kind: 'gate' }
    ];
    var ALIASES = { 'BASIC': 'basic', 'BASIC EVENT': 'basic', 'BE': 'basic', 'EVENT': 'basic', 'PRIMARY': 'basic',
        'UNDEVELOPED': 'undeveloped', 'UNDEVELOPED EVENT': 'undeveloped', 'UE': 'undeveloped', 'UND': 'undeveloped', 'DIAMOND': 'undeveloped',
        'HOUSE': 'house', 'HOUSE EVENT': 'house', 'HE': 'house', 'CONDITIONING': 'conditioning', 'CONDITIONING EVENT': 'conditioning', 'CE': 'conditioning', 'COND': 'conditioning', 'CONDITION': 'conditioning',
        'TRANSFER': 'TRANSFER', 'TR': 'TRANSFER', 'TRANSFER GATE': 'TRANSFER', 'AND': 'AND', 'AND GATE': 'AND', 'OR': 'OR', 'OR GATE': 'OR', 'XOR': 'XOR', 'EXCLUSIVE OR': 'XOR',
        'VOTING': 'VOTING', 'VOT': 'VOTING', 'VOTE': 'VOTING', 'ATLEAST': 'VOTING', 'K OF N': 'VOTING', 'K/N': 'VOTING', 'KOFN': 'VOTING', 'COMBINATION': 'VOTING',
        'INHIBIT': 'INHIBIT', 'INH': 'INHIBIT', 'NOT': 'NOT', 'PAND': 'PAND', 'PRIORITY AND': 'PAND', 'SPARE': 'SPARE', 'SEQ': 'SEQ', 'SEQUENCE': 'SEQ', 'FDEP': 'FDEP', 'FUNCTIONAL DEPENDENCY': 'FDEP' };
    function _byKey(k) { for (var i = 0; i < TYPES.length; i++) if (TYPES[i].key === k) return TYPES[i]; return null; }
    function typeKey(n) { return n.type === 'gate' ? (n.gateType || 'OR') : (n.type || 'basic'); }
    function typeCode(n) { var t = _byKey(typeKey(n)); return t ? t.code : String(typeKey(n)); }
    function parseType(text) { var s = String(text == null ? '' : text).trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' '); return ALIASES[s] || (_byKey(String(text || '').trim()) ? String(text).trim() : null); }

    function _pages() { try { if (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) return ftaPages; } catch (_) {} return []; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _byId(id) { var ps = _pages(); for (var i = 0; i < ps.length; i++) if (ps[i] && String(ps[i].id) === String(id)) return ps[i]; return null; }
    function _x(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _esc(s) { return _x(s).replace(/'/g, '&#39;'); }
    function _num(v) { if (v == null || (typeof v === 'string' && v.trim() === '')) return null; var n = Number(v); return isFinite(n) ? n : null; }
    function _isTransfer(n) { return !!n && (n.gateType === 'TRANSFER' || !!n.transferOutTo); }
    function _fcIdsOf(p) {
        var ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []), out = [];
        var all = []; try { (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(function (f) { all.push(f); }); (typeof systemsData !== 'undefined' ? systemsData : []).forEach(function (s) { (s.fha || []).forEach(function (f) { all.push(f); }); }); } catch (_) {}
        ids.forEach(function (id) { var f = all.find(function (x) { return x && String(x.internalId) === String(id); }); if (f && f.fcId) out.push(f.fcId); });
        return out;
    }
    function _safeName(s) { var t = String(s == null ? '' : s).trim().replace(/[^A-Za-z0-9_.\-]+/g, '_').replace(/^_+|_+$/g, ''); return t || 'X'; }

    // what Safety Lab needs to give an event the same value it had (its exposure and repair model); other tools ignore it
    var KEEP = ['inputMode', 'exposureMode', 'exposureTime', 'dormancyInterval', 'repairModel', 'tau', 'mu', 'ccfGroup', 'beta', 'gamma', 'delta', 'ccfModel'];
    // ---- Open-PSA MEF out ----------------------------------------------------------------------------------
    function exportMef(pagesIn) {
        var pages = (pagesIn || _pages()).filter(function (p) { return p && p.root && !p.integrated; });
        var nameOf = new Map(), used = new Set(), events = new Map(), houses = new Map(), ccf = new Map(), notes = [];
        function uniq(base) { var b = _safeName(base), n = b, i = 2; while (used.has(n.toLowerCase())) n = b + '_' + (i++); used.add(n.toLowerCase()); return n; }
        // one name per gate node and one per event (an event shared by logical id is one name)
        pages.forEach(function (p) { (function w(n) { if (!n) return; if (n.type === 'gate' && !_isTransfer(n) && !nameOf.has(n)) nameOf.set(n, uniq(n.displayId || ('G' + n.id))); _kids(n).forEach(w); })(p.root); });
        var lidName = new Map();
        pages.forEach(function (p) { (function w(n) { if (!n) return; if (n.type !== 'gate') { var lid = String(n.logicalId != null ? n.logicalId : n.id); if (!lidName.has(lid)) { lidName.set(lid, uniq(n.displayId || ('E' + n.id))); (n.type === 'house' ? houses : events).set(lid, n); } } _kids(n).forEach(w); })(p.root); });
        var rootName = new Map(); pages.forEach(function (p) { if (p.root.type === 'gate' && !_isTransfer(p.root)) rootName.set(String(p.id), nameOf.get(p.root)); });
        function ref(n) {
            if (_isTransfer(n)) {
                var to = String(n.transferOutTo || n.linkedPageId || ''), rn = rootName.get(to);
                if (rn) return '<gate name="' + _x(rn) + '"/>';
                notes.push('Transfer ' + (n.displayId || n.id) + ' points at a tree not in this export; written as an empty house event.');
                var hn = uniq((n.displayId || 'TR') + '_missing'); houses.set('__' + hn, { displayId: hn, name: 'Missing transfer target', probability: 0, __name: hn });
                lidName.set('__' + hn, hn);
                return '<house-event name="' + _x(hn) + '"/>';
            }
            if (n.type === 'gate') return '<gate name="' + _x(nameOf.get(n)) + '"/>';
            var lid = String(n.logicalId != null ? n.logicalId : n.id), nm = lidName.get(lid);
            return n.type === 'house' ? '<house-event name="' + _x(nm) + '"/>' : '<basic-event name="' + _x(nm) + '"/>';
        }
        function formula(g) {
            var kids = _kids(g).filter(function (c) { return c; }), inner = kids.map(ref).join('');
            var t = g.gateType || 'OR';
            if (!kids.length) return '<constant value="false"/>';
            if (t === 'AND' || t === 'INHIBIT' || t === 'PAND' || t === 'SPARE' || t === 'SEQ') return kids.length === 1 ? inner : '<and>' + inner + '</and>';
            if (t === 'OR' || t === 'FDEP') return kids.length === 1 ? inner : '<or>' + inner + '</or>';
            if (t === 'XOR') return '<xor>' + inner + '</xor>';
            if (t === 'NOT') return '<not>' + ref(kids[0]) + '</not>';
            if (t === 'VOTING') return '<atleast min="' + Math.max(1, Math.min(kids.length, parseInt(g.votingK, 10) || 2)) + '">' + inner + '</atleast>';
            return '<or>' + inner + '</or>';
        }
        function attrs(list) { list = list.filter(function (a) { return a[1] != null && a[1] !== ''; }); return list.length ? '<attributes>' + list.map(function (a) { return '<attribute name="' + _x(a[0]) + '" value="' + _x(a[1]) + '"/>'; }).join('') + '</attributes>' : ''; }
        var out = ['<?xml version="1.0" encoding="UTF-8"?>', '<!-- Written by Safety Lab Aero (fta_exchange.js ' + VERSION + '). Type codes ride in the sl-type attribute. -->', '<opsa-mef>'];
        pages.forEach(function (p) {
            var gates = [], seen = new Set();
            (function w(n) { if (!n || seen.has(n)) return; seen.add(n); if (n.type === 'gate' && !_isTransfer(n)) gates.push(n); _kids(n).forEach(w); })(p.root);
            var fcs = _fcIdsOf(p);
            out.push('  <define-fault-tree name="' + _x(_safeName(p.name || p.id)) + '">');
            out.push('    <label>' + _x(p.name || '') + '</label>');
            var pa = attrs([['sl-tree-name', p.name || ''], ['sl-fc', fcs.join(',')], ['sl-tree-level', p.treeLevel || ''], ['sl-mode', p.mode || '']]);
            if (pa) out.push('    ' + pa);
            gates.forEach(function (g) {
                var t = g.gateType || 'OR', special = (t === 'INHIBIT' || t === 'PAND' || t === 'SPARE' || t === 'SEQ' || t === 'FDEP');
                if (special) notes.push('Gate ' + (g.displayId || g.id) + ' is ' + t + ': other tools read it as ' + (t === 'FDEP' ? 'OR' : 'AND') + '; Safety Lab reads the sl-type attribute back.');
                out.push('    <define-gate name="' + _x(nameOf.get(g)) + '">' + (g.name ? '<label>' + _x(g.name) + '</label>' : '') + attrs([['sl-type', typeCode(g)], ['sl-id', g.displayId || '']]) + formula(g) + '</define-gate>');
            });
            out.push('  </define-fault-tree>');
        });
        out.push('  <model-data>');
        events.forEach(function (n, lid) {
            var lam = _num(n.lambda), p = _num(n.probability), val;
            if ((n.inputMode === 'lambda' || !(p > 0)) && lam > 0) val = '<exponential><float value="' + lam + '"/><system-mission-time/></exponential>';
            else val = '<float value="' + (p != null ? p : 0) + '"/>';
            out.push('    <define-basic-event name="' + _x(lidName.get(lid)) + '">' + (n.name ? '<label>' + _x(n.name) + '</label>' : '') + attrs([['sl-type', typeCode(n)], ['sl-id', n.displayId || ''], ['flavor', n.type === 'undeveloped' ? 'undeveloped' : (n.type === 'conditioning' ? 'conditional' : '')]].concat(KEEP.map(function (k) { return ['sl-' + k, n[k] != null && typeof n[k] !== 'object' ? String(n[k]) : '']; })).concat([['sl-p', p != null ? String(p) : '']])) + val + '</define-basic-event>');
            if (n.ccfGroup) { var g = ccf.get(n.ccfGroup) || { beta: _num(n.beta), members: [], p: p }; g.members.push(lidName.get(lid)); ccf.set(n.ccfGroup, g); }
        });
        houses.forEach(function (n, lid) {
            out.push('    <define-house-event name="' + _x(lidName.get(lid)) + '">' + (n.name ? '<label>' + _x(n.name) + '</label>' : '') + attrs([['sl-type', 'HE'], ['sl-id', n.displayId || ''], ['sl-p', n.probability != null ? String(n.probability) : '']]) + '<constant value="' + ((_num(n.probability) || 0) >= 0.5 ? 'true' : 'false') + '"/></define-house-event>');
        });
        out.push('  </model-data>');
        ccf.forEach(function (g, name) {
            if (g.members.length < 2 || !(g.beta >= 0)) return;
            out.splice(out.length, 0, '  <define-CCF-group name="' + _x(_safeName(name)) + '" model="beta-factor"><members>' + g.members.map(function (m) { return '<basic-event name="' + _x(m) + '"/>'; }).join('') + '</members><distribution><float value="' + (g.p || 0) + '"/></distribution><factor level="2"><float value="' + g.beta + '"/></factor></define-CCF-group>');
        });
        // the CCF groups belong before </opsa-mef>
        var mi = out.indexOf('  </model-data>'), groups = out.splice(mi + 1);
        out = out.concat(groups);
        out.push('</opsa-mef>');
        return { xml: out.join('\n'), trees: pages.length, events: events.size + houses.size, notes: notes };
    }

    // ---- Open-PSA MEF in -----------------------------------------------------------------------------------
    function _attr(el, name) { var a = null; Array.prototype.forEach.call(el.children, function (c) { if (c.tagName === 'attributes') Array.prototype.forEach.call(c.children, function (x) { if (x.getAttribute('name') === name) a = x.getAttribute('value'); }); }); return a; }
    function _label(el) { var l = null; Array.prototype.forEach.call(el.children, function (c) { if (c.tagName === 'label') l = (c.textContent || '').trim(); }); return l; }
    var FORMULA = { and: 1, or: 1, xor: 1, not: 1, atleast: 1, nand: 1, nor: 1, iff: 1, imply: 1, cardinality: 1 };
    function importMef(xmlText, fileName) {
        var report = { format: 'Open-PSA MEF', file: fileName || 'file', trees: [], warnings: [], renames: [], counts: { gates: 0, events: 0 } };
        var doc;
        try { doc = new DOMParser().parseFromString(String(xmlText || ''), 'application/xml'); } catch (e) { report.error = 'The file could not be read as XML.'; return report; }
        if (!doc || doc.getElementsByTagName('parsererror').length) { report.error = 'The file is not well-formed XML: ' + ((doc && doc.getElementsByTagName('parsererror')[0] || {}).textContent || '').slice(0, 160); return report; }
        var root = doc.documentElement;
        if (!root || root.tagName !== 'opsa-mef') { report.error = 'This is not an Open-PSA MEF file (its top element is "' + (root ? root.tagName : 'none') + '", not "opsa-mef").'; return report; }
        var params = new Map(), events = new Map(), houses = new Map(), gates = new Map(), treeOf = new Map(), trees = [], ccfOf = new Map();
        // beta factor common cause groups (define-CCF-group model="beta-factor"): each member carries the group and its beta
        Array.prototype.forEach.call(doc.getElementsByTagName('define-CCF-group'), function (el) {
            var model = el.getAttribute('model') || '', beta = null;
            Array.prototype.forEach.call(el.getElementsByTagName('factor'), function (fe) { var fl = fe.getElementsByTagName('float')[0]; if (fl && beta == null) beta = _num(fl.getAttribute('value')); });
            if (model !== 'beta-factor') report.warnings.push('Common cause group ' + el.getAttribute('name') + ' uses the ' + model + ' model; only its first factor was read as a beta.');
            Array.prototype.forEach.call(el.getElementsByTagName('basic-event'), function (m) { ccfOf.set(m.getAttribute('name'), { name: el.getAttribute('name'), beta: beta }); });
        });
        Array.prototype.forEach.call(doc.getElementsByTagName('define-parameter'), function (el) { params.set(el.getAttribute('name'), el); });
        Array.prototype.forEach.call(doc.getElementsByTagName('define-basic-event'), function (el) { events.set(el.getAttribute('name'), el); });
        Array.prototype.forEach.call(doc.getElementsByTagName('define-house-event'), function (el) { houses.set(el.getAttribute('name'), el); });
        Array.prototype.forEach.call(doc.getElementsByTagName('define-fault-tree'), function (ft) {
            var t = { el: ft, name: ft.getAttribute('name') || 'Tree', gates: [] };
            Array.prototype.forEach.call(ft.getElementsByTagName('define-gate'), function (g) { gates.set(g.getAttribute('name'), g); treeOf.set(g.getAttribute('name'), t); t.gates.push(g); });
            trees.push(t);
        });
        if (!trees.length) { report.error = 'The file has no fault tree (no define-fault-tree element).'; return report; }
        // a value: float, exponential (rate x mission time), parameter references; anything else is flagged
        var missionT = 1; try { missionT = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1; } catch (_) {}
        function value(el, who) {
            if (!el) return { p: null };
            var tag = el.tagName;
            if (tag === 'float' || tag === 'int') return { p: _num(el.getAttribute('value')) };
            if (tag === 'bool') return { p: el.getAttribute('value') === 'true' ? 1 : 0 };
            if (tag === 'parameter') { var pe = params.get(el.getAttribute('name')); return pe ? value(pe.firstElementChild && Array.prototype.find.call(pe.children, function (c) { return c.tagName !== 'label' && c.tagName !== 'attributes'; }), who) : { p: null }; }
            if (tag === 'exponential') {
                var lam = value(el.children[0], who).p;
                return { lambda: lam, p: (lam > 0) ? -Math.expm1(-lam * missionT) : null };
            }
            if (tag === 'mul') { var prod = 1, ok = true; Array.prototype.forEach.call(el.children, function (c) { var v = value(c, who).p; if (v == null) ok = false; else prod *= v; }); return { p: ok ? prod : null }; }
            report.warnings.push(who + ': the value "' + tag + '" is not read; the event has no probability yet.');
            return { p: null };
        }
        function valueOf(defEl) { var v = Array.prototype.find.call(defEl.children, function (c) { return c.tagName !== 'label' && c.tagName !== 'attributes'; }); return v ? value(v, defEl.getAttribute('name')) : { p: null }; }
        var lidFor = new Map(), existing = new Set();
        _pages().forEach(function (p) { (function w(n) { if (!n) return; if (n.displayId) existing.add(String(n.displayId)); _kids(n).forEach(w); })(p && p.root); });
        function newId() { try { return internalIdCounter++; } catch (_) { return Date.now() + Math.floor(Math.random() * 1e6); } }
        function dispFor(name, isGate) {
            if (!existing.has(name)) { existing.add(name); return name; }
            var nd; try { nd = generateDisplayId(isGate ? 'gate' : 'basic'); } catch (_) { nd = name + '_2'; }
            report.renames.push(name + ' is already used in this project; imported as ' + nd);
            existing.add(nd); return nd;
        }
        var dispOf = new Map();
        function eventNode(name, kindTag) {
            var isHouse = kindTag === 'house-event' || houses.has(name) && !events.has(name);
            var def = isHouse ? houses.get(name) : events.get(name);
            if (!lidFor.has(name)) lidFor.set(name, newId());
            if (!dispOf.has(name)) dispOf.set(name, dispFor((def && _attr(def, 'sl-id')) || name, false));
            var code = def && _attr(def, 'sl-type'), flavor = def && _attr(def, 'flavor');
            var type = isHouse ? 'house' : (parseType(code) && _byKey(parseType(code)).kind === 'event' ? parseType(code) : (flavor === 'undeveloped' ? 'undeveloped' : (flavor === 'conditional' ? 'conditioning' : 'basic')));
            var n = { id: newId(), logicalId: lidFor.get(name), displayId: dispOf.get(name), type: type, name: (def && _label(def)) || name, children: [] };
            if (!def) report.warnings.push('Event ' + name + ' is used but never defined; it has no probability yet.');
            else if (isHouse) { var c = Array.prototype.find.call(def.children, function (x) { return x.tagName === 'constant' || x.tagName === 'bool'; }); n.probability = c && c.getAttribute('value') === 'true' ? 1 : 0; var hp = _num(_attr(def, 'sl-p')); if (hp != null) n.probability = hp; }
            else {
                var v = valueOf(def); if (v.lambda > 0) { n.lambda = v.lambda; n.inputMode = 'lambda'; } if (v.p != null) n.probability = v.p; else n.probability = 0; if (n.inputMode !== 'lambda') n.inputMode = 'probability';
                // written by Safety Lab: the exposure and repair model, and the value the event had, come back as they were
                KEEP.forEach(function (k) { var a = _attr(def, 'sl-' + k); if (a != null && a !== '') n[k] = (k === 'inputMode' || k === 'exposureMode' || k === 'repairModel' || k === 'ccfGroup' || k === 'ccfModel') ? a : (_num(a) != null ? _num(a) : a); });
                var cg = ccfOf.get(name); if (cg && !n.ccfGroup) { n.ccfGroup = cg.name; if (cg.beta != null) n.beta = cg.beta; }
                var sp = _num(_attr(def, 'sl-p')); if (sp != null) n.probability = sp;
            }
            report.counts.events++;
            return n;
        }
        var building = new Set();
        function gateNode(name, inTree, depth) {
            var g = gates.get(name);
            if (!g) { report.warnings.push('Gate ' + name + ' is used but never defined; left out.'); return null; }
            var t = treeOf.get(name);
            if (t && t !== inTree && t.top === name) return { id: newId(), displayId: dispFor('TR-' + name, true), type: 'gate', gateType: 'TRANSFER', name: 'Transfer to ' + (t.label || t.name), transferOutTo: t.pageId, children: [] };
            if (building.has(name) || depth > 400) { report.warnings.push('Gate ' + name + ' refers back to itself; the loop was cut there.'); return null; }
            building.add(name);
            var f = Array.prototype.find.call(g.children, function (c) { return c.tagName !== 'label' && c.tagName !== 'attributes'; });
            var code = _attr(g, 'sl-type'), forced = parseType(code);
            var node = { id: newId(), displayId: dispFor(_attr(g, 'sl-id') || name, true), type: 'gate', gateType: 'OR', name: _label(g) || name, children: [] };
            fill(node, f, inTree, depth);
            if (forced && _byKey(forced).kind === 'gate' && forced !== 'TRANSFER') node.gateType = forced;
            building.delete(name);
            report.counts.gates++;
            return node;
        }
        function childOf(el, inTree, depth) {
            var tag = el.tagName, nm = el.getAttribute('name');
            if (tag === 'gate') return gateNode(nm, inTree, depth + 1);
            if (tag === 'basic-event' || tag === 'house-event') return eventNode(nm, tag);
            if (tag === 'event') return gates.has(nm) ? gateNode(nm, inTree, depth + 1) : eventNode(nm, houses.has(nm) && !events.has(nm) ? 'house-event' : 'basic-event');
            if (FORMULA[tag]) { var sub = { id: newId(), displayId: dispFor('G-' + (report.counts.gates + 1) + '-' + tag, true), type: 'gate', gateType: 'OR', name: tag.toUpperCase() + ' (nested)', children: [] }; fill(sub, el, inTree, depth + 1); report.counts.gates++; return sub; }
            if (tag === 'constant') { report.warnings.push('A constant ' + el.getAttribute('value') + ' inside a gate was imported as a house event.'); return { id: newId(), logicalId: newId(), displayId: dispFor('HE-const', false), type: 'house', name: 'Constant ' + el.getAttribute('value'), probability: el.getAttribute('value') === 'true' ? 1 : 0, children: [] }; }
            report.warnings.push('"' + tag + '" inside a gate is not read; left out.');
            return null;
        }
        function fill(node, f, inTree, depth) {
            if (!f) return;
            var tag = f.tagName;
            if (tag === 'and') node.gateType = 'AND';
            else if (tag === 'or') node.gateType = 'OR';
            else if (tag === 'xor') node.gateType = 'XOR';
            else if (tag === 'not') node.gateType = 'NOT';
            else if (tag === 'atleast') { node.gateType = 'VOTING'; node.votingK = parseInt(f.getAttribute('min'), 10) || 2; }
            else if (tag === 'nand' || tag === 'nor' || tag === 'iff' || tag === 'imply' || tag === 'cardinality') { report.warnings.push('Gate ' + node.displayId + ' uses "' + tag + '", which Safety Lab has no gate for; imported as ' + (tag === 'nand' ? 'AND' : 'OR') + ', check it.'); node.gateType = tag === 'nand' ? 'AND' : 'OR'; }
            else { var c = childOf(f, inTree, depth); if (c) node.children.push(c); return; }
            Array.prototype.forEach.call(f.children, function (x) { var c = childOf(x, inTree, depth); if (c) node.children.push(c); });
        }
        // each tree's top: the gate no other gate in the file refers to (the first defined, when several)
        var referenced = new Set();
        Array.prototype.forEach.call(doc.getElementsByTagName('gate'), function (el) { referenced.add(el.getAttribute('name')); });
        Array.prototype.forEach.call(doc.getElementsByTagName('event'), function (el) { if (gates.has(el.getAttribute('name'))) referenced.add(el.getAttribute('name')); });
        trees.forEach(function (t, i) {
            var tops = t.gates.filter(function (g) { return !referenced.has(g.getAttribute('name')) || (function () { var r = false; trees.forEach(function (o) { if (o !== t) Array.prototype.forEach.call(o.el.getElementsByTagName('gate'), function (x) { if (x.getAttribute('name') === g.getAttribute('name')) r = true; }); }); return r; })(); });
            var own = tops.filter(function (g) { return !Array.prototype.some.call(t.el.getElementsByTagName('gate'), function (x) { return x.getAttribute('name') === g.getAttribute('name'); }); });
            t.top = (own[0] || tops[0] || t.gates[0] || { getAttribute: function () { return null; } }).getAttribute('name');
            t.label = _attr(t.el, 'sl-tree-name') || _label(t.el) || t.name;
            t.pageId = 'page-imp-' + Date.now() + '-' + i + '-' + Math.floor(Math.random() * 1e5);
            if (own.length > 1) report.warnings.push('Tree ' + t.label + ' has ' + own.length + ' gates nothing refers to; ' + t.top + ' was taken as its top.');
        });
        trees.forEach(function (t) {
            var root = t.top ? gateNode(t.top, t, 0) : null;
            var fc = (_attr(t.el, 'sl-fc') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            report.trees.push({ page: { id: t.pageId, name: t.label, root: root, mode: _attr(t.el, 'sl-mode') || 'bottom-up', treeLevel: 'standalone', importedFrom: { file: report.file, format: report.format, tree: t.name, at: new Date().toISOString().slice(0, 10) } }, fcIds: fc });
        });
        return report;
    }

    // ---- spreadsheet out / in -----------------------------------------------------------------------------
    var SHEET_COLS = ['Tree', 'ID', 'Description', 'Type', 'Parent', 'k (voting)', 'Probability', 'Failure rate per hour', 'Transfer to', 'Common cause group', 'Beta'];
    function exportSheet(pagesIn) {
        var rows = [SHEET_COLS.slice()];
        (pagesIn || _pages()).filter(function (p) { return p && p.root && !p.integrated; }).forEach(function (p) {
            (function w(n, parent) {
                if (!n) return;
                var to = _isTransfer(n) ? _byId(n.transferOutTo || n.linkedPageId) : null;
                rows.push([p.name || p.id, n.displayId || n.id, n.name || '', typeCode(n), parent ? (parent.displayId || parent.id) : '', n.gateType === 'VOTING' ? (n.votingK || 2) : '',
                    n.type !== 'gate' && n.probability != null ? n.probability : '', n.type !== 'gate' && n.lambda ? n.lambda : '', to ? (to.name || to.id) : '', n.ccfGroup || '', n.ccfGroup && n.beta != null ? n.beta : '']);
                if (!_isTransfer(n) || n.gateType !== 'TRANSFER') _kids(n).forEach(function (c) { w(c, n); });
            })(p.root, null);
        });
        return rows;
    }
    function sheetCsv(rows) { return rows.map(function (r) { return r.map(function (v) { var s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); }).join('\r\n'); }
    function parseCsv(text) {
        var rows = [], row = [], cur = '', q = false, s = String(text || '').replace(/^﻿/, '');
        var delim = (s.split('\n')[0].split(';').length > s.split('\n')[0].split(',').length) ? ';' : ',';
        for (var i = 0; i < s.length; i++) {
            var ch = s[i];
            if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
            if (ch === '"') q = true;
            else if (ch === delim) { row.push(cur); cur = ''; }
            else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(function (c) { return String(c).trim() !== ''; })) rows.push(row); row = []; }
            else cur += ch;
        }
        row.push(cur); if (row.some(function (c) { return String(c).trim() !== ''; })) rows.push(row);
        return rows;
    }
    var FIELDS = [
        { key: 'tree', label: 'Tree name', need: false, guess: /^(tree|page|fault ?tree|top ?event name)$/i },
        { key: 'id', label: 'ID', need: true, guess: /^(id|name|event ?id|gate ?id|tag|identifier|node)$/i },
        { key: 'desc', label: 'Description', need: false, guess: /^(desc|description|label|text|title)$/i },
        { key: 'type', label: 'Type code', need: true, guess: /^(type|type ?code|kind|gate ?type|event ?type|code)$/i },
        { key: 'parent', label: 'Parent ID', need: true, guess: /^(parent|parent ?id|parent ?gate|under|input ?to)$/i },
        { key: 'k', label: 'k (voting)', need: false, guess: /^(k|k ?\(voting\)|votes?|min|k of n)$/i },
        { key: 'p', label: 'Probability', need: false, guess: /^(p|prob|probability|q|unavailability)$/i },
        { key: 'lambda', label: 'Failure rate per hour', need: false, guess: /^(lambda|rate|failure ?rate.*|λ.*)$/i },
        { key: 'to', label: 'Transfer to (tree name)', need: false, guess: /^(transfer ?to|transfer|link|goes to)$/i },
        { key: 'ccf', label: 'Common cause group', need: false, guess: /^(ccf|common ?cause ?group|ccf ?group)$/i },
        { key: 'beta', label: 'Beta', need: false, guess: /^(beta|β|beta ?factor)$/i }
    ];
    function guessMapping(header) {
        var m = {};
        FIELDS.forEach(function (f) { (header || []).forEach(function (h, i) { if (m[f.key] == null && f.guess.test(String(h).trim())) m[f.key] = i; }); });
        return m;
    }
    function importSheet(rows, mapping, fileName) {
        var report = { format: 'spreadsheet', file: fileName || 'file', trees: [], warnings: [], renames: [], counts: { gates: 0, events: 0 } };
        mapping = mapping || {};
        var missing = FIELDS.filter(function (f) { return f.need && mapping[f.key] == null; }).map(function (f) { return f.label; });
        if (missing.length) { report.error = 'Map these columns first: ' + missing.join(', ') + '.'; return report; }
        var body = (rows || []).slice(1), get = function (r, k) { var i = mapping[k]; return (i == null) ? '' : String(r[i] == null ? '' : r[i]).trim(); };
        var byTree = new Map();
        body.forEach(function (r, i) { var t = get(r, 'tree') || 'Imported tree'; var a = byTree.get(t) || []; a.push({ r: r, line: i + 2 }); byTree.set(t, a); });
        var existing = new Set(); _pages().forEach(function (p) { (function w(n) { if (!n) return; if (n.displayId) existing.add(String(n.displayId)); _kids(n).forEach(w); })(p && p.root); });
        function newId() { try { return internalIdCounter++; } catch (_) { return Date.now() + Math.floor(Math.random() * 1e6); } }
        var lidFor = new Map(), dispOf = new Map(), pageIdOf = new Map(), i0 = 0;
        byTree.forEach(function (_, t) { pageIdOf.set(t, 'page-imp-' + Date.now() + '-' + (i0++) + '-' + Math.floor(Math.random() * 1e5)); });
        byTree.forEach(function (list, tname) {
            var nodes = new Map(), roots = [];
            list.forEach(function (o) {
                var id = get(o.r, 'id'); if (!id) { report.warnings.push('Line ' + o.line + ': no ID; skipped.'); return; }
                var tk = parseType(get(o.r, 'type'));
                if (!tk) { report.warnings.push('Line ' + o.line + ': type "' + get(o.r, 'type') + '" is not a known type code; read as a basic event.'); tk = 'basic'; }
                var T = _byKey(tk), isGate = T.kind === 'gate';
                var key = isGate ? id + '@' + o.line : id;   // the same event ID twice in a tree is the same event
                if (!dispOf.has(id)) { var d = id; if (existing.has(d)) { var nd; try { nd = generateDisplayId(isGate ? 'gate' : 'basic'); } catch (_) { nd = id + '_2'; } report.renames.push(id + ' is already used in this project; imported as ' + nd); d = nd; } existing.add(d); dispOf.set(id, d); }
                var n = { id: newId(), displayId: dispOf.get(id), name: get(o.r, 'desc') || id, children: [] };
                if (isGate) { n.type = 'gate'; n.gateType = tk; if (tk === 'VOTING') n.votingK = parseInt(get(o.r, 'k'), 10) || 2; if (tk === 'TRANSFER') { var to = get(o.r, 'to'); if (pageIdOf.has(to)) n.transferOutTo = pageIdOf.get(to); else { var ex = _pages().find(function (p) { return p && String(p.name || '').trim() === to; }); if (ex) n.transferOutTo = ex.id; else report.warnings.push('Line ' + o.line + ': transfer to "' + to + '", which is neither in the file nor in the project.'); } } report.counts.gates++; }
                else {
                    n.type = tk; if (!lidFor.has(id)) lidFor.set(id, newId()); n.logicalId = lidFor.get(id);
                    var p = _num(get(o.r, 'p')), lam = _num(get(o.r, 'lambda'));
                    if (get(o.r, 'lambda') !== '' && lam > 0) { n.lambda = lam; n.inputMode = 'lambda'; }
                    else n.inputMode = 'probability';
                    n.probability = (get(o.r, 'p') !== '' && p != null) ? p : 0;
                    if (get(o.r, 'p') !== '' && (p == null || p < 0 || p > 1)) report.warnings.push('Line ' + o.line + ': probability "' + get(o.r, 'p') + '" is not between 0 and 1; set to 0.');
                    var cg = get(o.r, 'ccf'); if (cg) { n.ccfGroup = cg; var b = _num(get(o.r, 'beta')); if (b != null) n.beta = b; }
                    report.counts.events++;
                }
                nodes.set(key, { node: n, parent: get(o.r, 'parent'), line: o.line, gate: isGate, id: id });
            });
            var gateById = new Map(); nodes.forEach(function (v) { if (v.gate && !gateById.has(v.id)) gateById.set(v.id, v.node); });
            nodes.forEach(function (v) {
                if (!v.parent) { roots.push(v.node); return; }
                var par = gateById.get(v.parent);
                if (!par) { report.warnings.push('Line ' + v.line + ': parent "' + v.parent + '" is not a gate in tree "' + tname + '"; placed at the top.'); roots.push(v.node); return; }
                if (par.gateType === 'TRANSFER') { report.warnings.push('Line ' + v.line + ': a transfer gate cannot have inputs; left out.'); return; }
                par.children.push(v.node);
            });
            var root;
            if (roots.length === 1) root = roots[0];
            else if (!roots.length) { report.warnings.push('Tree "' + tname + '" has no row without a parent, so it has no top.'); root = null; }
            else { report.warnings.push('Tree "' + tname + '" has ' + roots.length + ' rows without a parent; they were put under one OR gate at the top.'); root = { id: newId(), displayId: 'TOP-' + _safeName(tname), type: 'gate', gateType: 'OR', name: tname, children: roots }; }
            report.trees.push({ page: { id: pageIdOf.get(tname), name: tname, root: root, mode: 'bottom-up', treeLevel: 'standalone', importedFrom: { file: report.file, format: report.format, tree: tname, at: new Date().toISOString().slice(0, 10) } }, fcIds: [] });
        });
        return report;
    }

    // ---- into the project ----------------------------------------------------------------------------------
    function commit(report) {
        if (!report || report.error) return 0;
        var all = []; try { (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(function (f) { all.push(f); }); (typeof systemsData !== 'undefined' ? systemsData : []).forEach(function (s) { (s.fha || []).forEach(function (f) { all.push(f); }); }); } catch (_) {}
        var names = new Set(_pages().map(function (p) { return String(p && p.name || '').trim().toLowerCase(); }));
        report.trees.forEach(function (t) {
            var p = t.page, nm = p.name, i = 2;
            while (names.has(String(nm).trim().toLowerCase())) nm = p.name + ' (' + (i++) + ')';
            if (nm !== p.name) { report.renames.push('Tree "' + p.name + '" already exists; imported as "' + nm + '"'); p.name = nm; }
            names.add(nm.toLowerCase());
            var linked = [];
            (t.fcIds || []).forEach(function (fc) { var f = all.find(function (x) { return x && x.fcId === fc; }); if (f) linked.push(f.internalId); });
            if (linked.length) { p.linkedFhaIds = linked; p.linkedFhaId = linked[0]; }
            _pages().push(p);
        });
        try { if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities(); } catch (_) {}
        try { if (typeof renderFTASidebar === 'function') renderFTASidebar(); } catch (_) {}
        try { if (window.SL_FTA_PICKER) window.SL_FTA_PICKER.render(true); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return report.trees.length;
    }

    // ---- the dialog ----------------------------------------------------------------------------------------
    function _save(text, name, type) {
        var blob = new Blob([text], { type: type });
        try { if (typeof SaveFs !== 'undefined' && SaveFs.saveBlob) return SaveFs.saveBlob(blob, name); } catch (_) {}
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function close() { var m = document.getElementById('sl-xchg-modal'); if (m) m.remove(); }
    function _legend() { return '<details class="sl-xchg-legend"><summary>Type codes</summary><table>' + TYPES.map(function (t) { return '<tr><td><b>' + t.code + '</b></td><td>' + _esc(t.label) + '</td></tr>'; }).join('') + '</table><p>The spreadsheet also accepts the full names (Basic, Undeveloped, House, Conditioning, Transfer, Voting and so on).</p></details>'; }
    function _reportHtml(r) {
        if (r.error) return '<div class="sl-int-err">' + _esc(r.error) + '</div>';
        return '<div class="sl-xchg-report"><p><b>' + r.trees.length + ' tree' + (r.trees.length === 1 ? '' : 's') + '</b>, ' + r.counts.gates + ' gates, ' + r.counts.events + ' events from <b>' + _esc(r.file) + '</b> (' + _esc(r.format) + ').</p>' +
            '<ul>' + r.trees.map(function (t) { return '<li>' + _esc(t.page.name) + (t.page.root ? '' : ' (no top)') + (t.fcIds && t.fcIds.length ? ', linked to ' + _esc(t.fcIds.join(', ')) + ' if they exist here' : '') + '</li>'; }).join('') + '</ul>' +
            (r.renames.length ? '<p>Renamed:</p><ul>' + r.renames.map(function (x) { return '<li>' + _esc(x) + '</li>'; }).join('') + '</ul>' : '') +
            (r.warnings.length ? '<p>Check these:</p><ul class="sl-xchg-warn">' + r.warnings.slice(0, 60).map(function (x) { return '<li>' + _esc(x) + '</li>'; }).join('') + (r.warnings.length > 60 ? '<li>and ' + (r.warnings.length - 60) + ' more</li>' : '') + '</ul>' : '') + '</div>';
    }
    function open() {
        close();
        var wrap = document.createElement('div');
        wrap.id = 'sl-xchg-modal'; wrap.className = 'sl-int-modal';
        wrap.innerHTML = '<div class="sl-int-card sl-xchg-card" role="dialog" aria-modal="true" aria-labelledby="sl-xchg-title">' +
            '<h3 id="sl-xchg-title">Import or export fault trees</h3>' +
            '<p class="sl-int-help">Open-PSA MEF is the open exchange format other fault tree tools read and write. The spreadsheet has one row per gate or event: its tree, ID, description, type code, parent and numbers. Every import makes new trees; nothing in the project is changed.</p>' +
            '<div class="sl-int-actions" style="justify-content:flex-start;flex-wrap:wrap"><button type="button" class="action-btn" data-xchg-export-mef>Export Open-PSA (.xml)</button><button type="button" class="action-btn" data-xchg-export-csv>Export spreadsheet (.csv)</button><button type="button" class="action-btn btn-cyan" data-xchg-pick>Import a file…</button><input type="file" data-xchg-file accept=".xml,.opsa,.csv,.txt,.xlsx,.xls" hidden></div>' +
            _legend() + '<div data-xchg-body></div>' +
            '<div class="sl-int-actions"><button type="button" class="action-btn" data-xchg-close>Close</button></div></div>';
        document.body.appendChild(wrap);
        var body = wrap.querySelector('[data-xchg-body]');
        wrap.querySelector('[data-xchg-close]').onclick = close;
        wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
        wrap.querySelector('[data-xchg-export-mef]').onclick = function () { var r = exportMef(); _save(r.xml, 'fault_trees.opsa.xml', 'application/xml'); body.innerHTML = '<p class="sl-int-help">Exported ' + r.trees + ' trees and ' + r.events + ' events.</p>' + (r.notes.length ? '<ul class="sl-xchg-warn">' + r.notes.slice(0, 30).map(function (n) { return '<li>' + _esc(n) + '</li>'; }).join('') + '</ul>' : ''); };
        wrap.querySelector('[data-xchg-export-csv]').onclick = function () { var rows = exportSheet(); _save('﻿' + sheetCsv(rows), 'fault_trees.csv', 'text/csv'); body.innerHTML = '<p class="sl-int-help">Exported ' + (rows.length - 1) + ' rows.</p>'; };
        var fileEl = wrap.querySelector('[data-xchg-file]');
        wrap.querySelector('[data-xchg-pick]').onclick = function () { fileEl.click(); };
        fileEl.onchange = function () { var f = fileEl.files && fileEl.files[0]; if (f) readFile(f, body); };
        return wrap;
    }
    function _preview(report, body) {
        body.innerHTML = _reportHtml(report) + (report.error ? '' : '<div class="sl-int-actions"><button type="button" class="action-btn btn-cyan" data-xchg-commit>Import ' + report.trees.length + ' tree' + (report.trees.length === 1 ? '' : 's') + '</button></div>');
        var b = body.querySelector('[data-xchg-commit]');
        if (b) b.onclick = function () { var n = commit(report); body.innerHTML = '<p class="sl-int-help"><b>Imported ' + n + ' tree' + (n === 1 ? '' : 's') + '</b> from ' + _esc(report.file) + '. They are in the Standalone trees, each marked with the file it came from.</p>'; };
    }
    function _mapping(rows, file, body) {
        var header = rows[0] || [], m = guessMapping(header);
        body.innerHTML = '<p class="sl-int-help">Match each field to a column of <b>' + _esc(file) + '</b>. The first row is read as the column names.</p><table class="sl-xchg-map">' + FIELDS.map(function (f) {
            return '<tr><td>' + _esc(f.label) + (f.need ? ' <b>*</b>' : '') + '</td><td><select data-xchg-map="' + f.key + '"><option value="">(none)</option>' + header.map(function (h, i) { return '<option value="' + i + '"' + (m[f.key] === i ? ' selected' : '') + '>' + _esc(h || ('Column ' + (i + 1))) + '</option>'; }).join('') + '</select></td></tr>';
        }).join('') + '</table><div class="sl-int-actions"><button type="button" class="action-btn btn-cyan" data-xchg-read>Read the rows</button></div><div data-xchg-prev></div>';
        body.querySelector('[data-xchg-read]').onclick = function () {
            var map = {}; body.querySelectorAll('[data-xchg-map]').forEach(function (s) { if (s.value !== '') map[s.getAttribute('data-xchg-map')] = parseInt(s.value, 10); });
            _preview(importSheet(rows, map, file), body.querySelector('[data-xchg-prev]'));
        };
    }
    function readFile(f, body) {
        var name = f.name || 'file', low = name.toLowerCase();
        if (/\.(xlsx|xls)$/.test(low)) {
            var load = (typeof _loadSheetJS === 'function') ? _loadSheetJS() : Promise.resolve(window.XLSX);
            return Promise.all([load, f.arrayBuffer()]).then(function (a) {
                var X = a[0]; if (!X) throw new Error('The Excel reader is not available in this build; save the sheet as CSV and import that.');
                var wb = X.read(a[1], { type: 'array' }), ws = wb.Sheets[wb.SheetNames[0]];
                _mapping(X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }), name, body);
            }).catch(function (e) { body.innerHTML = '<div class="sl-int-err">' + _esc(e.message || e) + '</div>'; });
        }
        return f.text().then(function (text) {
            if (/^\s*(<\?xml|<opsa-mef)/.test(text)) _preview(importMef(text, name), body);
            else _mapping(parseCsv(text), name, body);
        });
    }

    var api = { VERSION: VERSION, TYPES: TYPES, FIELDS: FIELDS, typeCode: typeCode, parseType: parseType, exportMef: exportMef, importMef: importMef, exportSheet: exportSheet, sheetCsv: sheetCsv, parseCsv: parseCsv, guessMapping: guessMapping, importSheet: importSheet, commit: commit, open: open, close: close, readFile: readFile };
    try { if (typeof window !== 'undefined') window.SLFtaExchange = api; } catch (_) {}
})();
