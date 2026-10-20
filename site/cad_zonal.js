// ============================================================================
// cad_zonal.js, v1.2, 13 Oct 2026 (1.1: a disk sector reads the contract's radius as its range; 1.2: a link is to one installed copy, only a unique designator links by itself): the deterministic engine behind CAD, zones and
// particular risks. window.SLCadZonal (page) + module.exports (node tests).
//
// WAQAS'S RULING: each source owns one thing and nothing is copied.
//   * CAD / zonal owns the zones and which equipment is housed in each zone (from the
//     customer's CAD, any tool: neutral STEP plus a CSV or Excel zone list). Only the
//     metadata below is stored in the project; the CAD file stays on the customer's machine.
//   * The fault trees own which equipment drives which failure condition (basic events to
//     top events).
//   * The SysML model (Sys Lab later) owns systems, functions and the equipment as model
//     elements. The equipment identity anchor is the systemsData id (zonal_model.js,
//     "identity rule"); CAD parts and fault tree basic events link to it.
// The chain: zone -> equipment housed -> its basic events -> failure conditions reached
// -> severity (FHA). This file only computes; AI never runs here (aiPayload() is the
// data-minimized hand-off another lane may read).
//
// STORED (projectConfig, so it persists and syncs with the project):
//   cadModels  = [{ id:'cad-<n>', fileName, sha256, revision, importedAt, units:'mm',
//                   parts:[{ pid, name, partNumber|null, path:[...], bbox:{min,max}, centroid }] }]
//   cadLinks   = { '<cadId>|<pid>': { cadId, pid, sysId|null, on, by, at, rejected:[{sysId,by,at}] } }
//   praVolumes = [{ id, kind:'rotorBurst'|'tireBurst'|'birdStrike'|'fire'|'generic',
//                   shape:{ kind:'box'|'sphere'|'cone'|'disk-sector', ... }, label, source }]
//   cadReviews = [{ id, fromCadId, toCadId, by, at, status, items:[...] }]
//   zones (zonal_model.js, schema zones-2): zone.volume / zone.source / zone.cadRef
//
// THE RULES THIS FILE APPLIES (also in RULES below, in words a reviewer can quote):
//   Containment     a part is in the zone whose volume holds its centroid; the deepest zone
//                   wins; at equal depth the smaller volume wins, then the lower zone code,
//                   then the lower id (and the part is reported as ambiguous). A part whose
//                   box crosses the chosen zone's boundary is reported as straddling.
//   Identity        only exact equality of an identifier links a part to equipment on its
//                   own (part number, reference designator, ATA code); everything else is a
//                   candidate the engineer confirms. No zone assignment without a link.
//   Basic events    a basic event belongs to the equipment its declared identity names
//                   (node.identity.systemId; for an interface / resource event the provider,
//                   providerSystemId). Ownership inherited from a page or an ancestor gate is
//                   about requirements, not about where hardware sits, so it is NOT used.
//   Impact          every basic event of the affected equipment is set failed together and
//                   every other event left working; each fault tree is evaluated with the
//                   existing BDD engine (SLFTAEngine.buildBDDFromFT + minOrder), never a
//                   second evaluator. A tree is reached when no further failure is needed.
//                   The time-order factor of a priority AND / spare / sequence gate is taken
//                   as met (both inputs fail at once in a zonal event).
//   Independence    Waqas's rule: an OR gate derives a no-single-point-failure requirement,
//                   an AND gate a physical and functional independence requirement. For
//                   every AND, priority AND, spare, sequence and k-of-n voting gate (k >= 2),
//                   equipment under two different inputs that sits in the SAME zone is a
//                   violation; in nested zones (one inside the other), or in sibling zones
//                   (same parent, no credited barrier between them), an advisory; inside
//                   the SAME particular-risk volume, a violation; the same equipment under two
//                   inputs, a violation. INHIBIT is left out: its second input is a condition.
//   Risk volumes    a part is inside a volume when any of 27 points of its box (corners, edge
//                   midpoints, face centers, center) is inside: conservative for a volume
//                   larger than the part.
//   Determinism     every list is sorted by an explicit key; no clock, no randomness in any
//                   result (who / when are only written by the explicit link and review calls).
//
// Reads go through SLEnv (rule 5) with direct fallbacks. No DOM, no eval.
// See tests/regression_cad_zonal_20261013.test.js.
// ============================================================================
(function (root) {
    'use strict';

    var VERSION = '1.4';   // 1.4 (17 Oct 2026): a box still estimated from the file gives no zone, risk or placement answer (estimatedParts)
    var KINDS = ['rotorBurst', 'tireBurst', 'birdStrike', 'fire', 'fluidLeak', 'iceShedding', 'lightning', 'generic'];   // 14 Oct 2026: fluidLeak, iceShedding, lightning added (configurable volumes)
    var SHAPES = ['box', 'sphere', 'cone', 'disk-sector'];
    var UNITS = { mm: 1, cm: 10, m: 1000, 'in': 25.4, ft: 304.8 };
    // Rotor burst fragment spread about the plane of rotation, in degrees either side. AC 20-128A
    // (own words): a single one-third disc fragment is taken to leave within a narrow band about
    // the rotor plane (3 degrees), an intermediate fragment within a wider one (5 degrees), small
    // fragments within 15 degrees; this matches the bands in pra_library.js. The AC text is not
    // in the repo knowledge base, so these are CONFIGURABLE DEFAULTS: shape.spreadDeg overrides,
    // and the engineer confirms the value against the AC for the engine in question.
    var FRAGMENTS = { oneThirdDisc: 3, intermediate: 5, small: 15 };
    var DEFAULT_FRAGMENT = 'intermediate';
    var INDEP_GATES = { AND: 1, PAND: 1, SPARE: 1, SEQ: 1, VOTING: 1, INHIBIT: 1 };   // INHIBIT: 19 Oct 2026, both inputs must happen, as an AND
    var SEV_FALLBACK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Safety Effect': 0 };
    var RULES = {
        containment: 'A part is in the zone whose volume holds its centroid. The deepest zone wins; at equal depth the smaller volume, then the lower zone code, then the lower id, and the part is reported as ambiguous. A part whose box crosses the boundary of its zone is reported as straddling.',
        identity: 'A link is to one installed copy, never to a part number. Only a reference designator (the installed item tag) that is unique on both sides, one CAD part and one equipment item, links by itself. A shared part number or an ATA code is only a candidate, because the same part can be installed several times doing different jobs. Every candidate waits for the engineer to confirm. Equipment is never placed in a zone without a confirmed link.',
        events: 'A basic event belongs to the equipment its declared identity names (the system id, or the provider of an interface or resource event).',
        impact: 'Every basic event of the affected equipment is failed together, everything else works, and each fault tree is evaluated by the existing engine. A failure condition is reached when one of its trees needs no further failure.',
        independence: 'An AND gate derives a physical and functional independence requirement. Equipment under two different inputs of an AND, priority AND, spare, sequence or k-of-n (k of 2 or more) gate in the same zone is a violation; in nested zones or in sibling zones with no credited barrier between them (material on record, its requirement verified), an advisory; inside the same particular-risk volume, a violation; the same equipment under two inputs, a violation.',
        riskVolume: 'A part is inside a particular-risk volume when any of 27 points of its box (corners, edge midpoints, face centers, center) is inside the volume.'
    };

    // ---- reads (rule 5: SLEnv first, then the bare global, then window) ------------------
    function _g(name) {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get(name); if (v !== undefined) return v; } } catch (_) {}
        try {
            switch (name) {
                case 'projectConfig': if (typeof projectConfig !== 'undefined') return projectConfig; break;
                case 'systemsData': if (typeof systemsData !== 'undefined') return systemsData; break;
                case 'acFhaData': if (typeof acFhaData !== 'undefined') return acFhaData; break;
                case 'ftaPages': if (typeof ftaPages !== 'undefined') return ftaPages; break;
                case 'zsaData': if (typeof zsaData !== 'undefined') return zsaData; break;
                case 'SEVERITY_RANK': if (typeof SEVERITY_RANK !== 'undefined') return SEVERITY_RANK; break;
            }
        } catch (_) {}
        try { return root[name]; } catch (_) { return undefined; }
    }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _pc() { var p = _g('projectConfig'); if (p && typeof p === 'object') return p; root.projectConfig = root.projectConfig || {}; return root.projectConfig; }
    function _Z() { return root.ZONES || null; }
    function _E() { return root.SLFTAEngine || null; }
    function _sys() { return _arr(_g('systemsData')); }
    function _sysById(id) { var s = _sys(); for (var i = 0; i < s.length; i++) if (s[i] && String(s[i].id) === String(id)) return s[i]; return null; }
    function _save() { _pinReferenced(); try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }
    // every part a zone volume names is kept in a large model's synced summary
    function _pinReferenced() {
        try {
            var pc = _pc(); if (!_arr(pc.cadModels).some(function (m) { return m && m.partStore === 'local'; })) return;
            var Z = _Z(); if (!Z) return;
            Z.all().forEach(function (z) { var v = z && z.volume; if (v && v.kind === 'parts' && v.cadId) _arr(v.pids).forEach(function (pid) { _pin(v.cadId, pid); }); });
        } catch (_) {}
    }
    function _s(v) { return v == null ? '' : String(v).trim(); }
    function _cmp(a, b) { a = String(a == null ? '' : a); b = String(b == null ? '' : b); return a < b ? -1 : (a > b ? 1 : 0); }
    // natural order without locale: "110" < "1000", "Z2" < "Z10"
    function _nat(a, b) {
        var ra = String(a == null ? '' : a).match(/(\d+|\D+)/g) || [], rb = String(b == null ? '' : b).match(/(\d+|\D+)/g) || [];
        for (var i = 0; i < Math.min(ra.length, rb.length); i++) {
            var x = ra[i], y = rb[i];
            if (/^\d/.test(x) && /^\d/.test(y)) { var d = Number(x) - Number(y); if (d) return d < 0 ? -1 : 1; if (x.length !== y.length) return x.length < y.length ? -1 : 1; }
            else { var c = _cmp(x, y); if (c) return c; }
        }
        return ra.length - rb.length ? (ra.length < rb.length ? -1 : 1) : _cmp(a, b);
    }
    function _uniqSorted(a, f) { var seen = {}, out = []; (a || []).forEach(function (x) { var k = String(x); if (!seen[k]) { seen[k] = 1; out.push(x); } }); return out.sort(f || _cmp); }
    function _clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

    // ---- vectors and boxes ---------------------------------------------------------------
    function _n3(v) { return Array.isArray(v) && v.length === 3 && typeof v[0] === 'number' && isFinite(v[0]) && typeof v[1] === 'number' && isFinite(v[1]) && typeof v[2] === 'number' && isFinite(v[2]); }
    function _sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function _dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function _len(a) { return Math.sqrt(_dot(a, a)); }
    function _unit(a) { var l = _len(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null; }
    function _cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function _inBox(p, mn, mx) { return p[0] >= mn[0] && p[0] <= mx[0] && p[1] >= mn[1] && p[1] <= mx[1] && p[2] >= mn[2] && p[2] <= mx[2]; }
    function _boxInside(b, mn, mx) { return _inBox(b.min, mn, mx) && _inBox(b.max, mn, mx); }
    // the two boxes share interior volume (touching faces do not count)
    function _boxesOverlap(a, b) { for (var i = 0; i < 3; i++) if (a.max[i] <= b.min[i] || b.max[i] <= a.min[i]) return false; return true; }
    function _boxVol(b) { return Math.max(0, b.max[0] - b.min[0]) * Math.max(0, b.max[1] - b.min[1]) * Math.max(0, b.max[2] - b.min[2]); }
    // minimum distance between two axis-aligned boxes (0 when they touch or overlap)
    function boxDistance(a, b) {
        var s = 0;
        for (var i = 0; i < 3; i++) { var g = Math.max(0, a.min[i] - b.max[i], b.min[i] - a.max[i]); s += g * g; }
        return Math.sqrt(s);
    }
    function _center(b) { return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; }
    function _samples(b) {
        var out = [], xs = [b.min[0], (b.min[0] + b.max[0]) / 2, b.max[0]], ys = [b.min[1], (b.min[1] + b.max[1]) / 2, b.max[1]], zs = [b.min[2], (b.min[2] + b.max[2]) / 2, b.max[2]];
        for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) for (var k = 0; k < 3; k++) out.push([xs[i], ys[j], zs[k]]);
        return out;
    }
    function _r6(x) { return Math.round(x * 1e6) / 1e6; }   // results rounded so float noise never changes an answer

    // ---- CAD models -------------------------------------------------------------------------
    function models() { var pc = _pc(); if (!Array.isArray(pc.cadModels)) return []; return pc.cadModels; }
    function model(cadId) { var m = models(); for (var i = 0; i < m.length; i++) if (m[i] && m[i].id === cadId) return m[i]; return null; }
    function latestCadId() { var m = models(); return m.length ? m[m.length - 1].id : null; }
    // ---- large models: the full part list stays on this computer ------------------------
    // A model with more than LOCAL_PARTS_MIN parts keeps in the project (which syncs) only a
    // summary: its part count and the parts something refers to (an equipment link, a zone),
    // so every link resolves on any computer. The full list lives with the geometry in this
    // computer's cache (keyed by the file's sha256) and is registered here when the model
    // opens. partsOf(model) is the full list when registered, else the synced summary.
    var LOCAL_PARTS_MIN = 20000;
    var _local = {};   // sha256 -> { parts, map }
    // parts: the array, or a function that returns it (called on first use: a model straight from
    // its cache draws before its 200,000 part records exist)
    function registerLocalParts(sha, parts) {
        if (!sha) return false;
        if (typeof parts === 'function') {
            var fn = parts, rec = { _parts: null, _map: null };
            Object.defineProperty(rec, 'parts', { get: function () { if (!this._parts) this._parts = fn() || []; return this._parts; } });
            Object.defineProperty(rec, 'map', { get: function () { if (!this._map) { var mp = Object.create(null), L = this.parts; for (var i = 0; i < L.length; i++) if (L[i] && L[i].pid != null) mp[L[i].pid] = L[i]; this._map = mp; } return this._map; } });
            _local[sha] = rec;
            return true;
        }
        if (!Array.isArray(parts)) return false;
        // pid -> part, built on first use
        _local[sha] = { parts: parts, _map: null, get map() { if (!this._map) { var mp = Object.create(null); for (var i = 0; i < this.parts.length; i++) { var p = this.parts[i]; if (p && p.pid != null) mp[p.pid] = p; } this._map = mp; } return this._map; } };
        _pinReferenced();
        return true;
    }
    function hasLocalParts(sha) { return !!_local[sha]; }
    function partsOf(m) {
        if (typeof m === 'string') m = model(m);
        if (!m) return [];
        if (m.partStore === 'local' && m.sha256 && _local[m.sha256]) return _local[m.sha256].parts;
        return _arr(m.parts);
    }
    // keep a referenced part in the synced summary (no-op for an ordinary model)
    function _pin(cadId, pid) {
        var m = model(cadId); if (!m || m.partStore !== 'local') return;
        if (_arr(m.parts).some(function (p) { return p && p.pid === pid; })) return;
        var L = m.sha256 && _local[m.sha256], p = L && L.map[pid];
        if (!p) return;
        if (!Array.isArray(m.parts)) m.parts = [];
        m.parts.push(_clone(p));
        m.parts.sort(function (a, b) { return _cmp(a.pid, b.pid); });
    }
    function _partMap(cadId) {
        var m = model(cadId);
        if (m && m.partStore === 'local' && m.sha256 && _local[m.sha256]) return _local[m.sha256].map;
        var out = {}; _arr(m && m.parts).forEach(function (p) { if (p && p.pid != null) out[p.pid] = p; }); return out;
    }
    // 17 Oct 2026: parts whose box is still an estimate from the file (their shape not read yet). No zone, risk or
    // placement answer is taken from such a box: containment lists them apart, a risk volume does not count them and
    // says its result is not final, and equipment with such a part is not placed.
    function estimatedParts(cadId) { return partsOf(model(cadId)).filter(function (p) { return p && p.boxEstimated === true; }).map(function (p) { return p.pid; }).sort(_cmp); }
    function _estSet(cadId) { var s = {}; estimatedParts(cadId).forEach(function (pid) { s[pid] = 1; }); return s; }
    function _partsSorted(cadId) { var m = model(cadId); return partsOf(m).slice().sort(function (a, b) { return _cmp(a.pid, b.pid); }); }

    // addCadModel(meta): the viewer hands over the metadata of one imported CAD file. Validated
    // and normalized to millimetres; a new id 'cad-<n>' unless the meta carries a free one.
    function addCadModel(meta, opts) {
        opts = opts || {};
        var issues = [];
        if (!meta || typeof meta !== 'object') return { ok: false, issues: ['No CAD model metadata was given.'] };
        var units = _s(meta.units || 'mm');
        var f = UNITS[units];
        if (!f) return { ok: false, issues: ['Unknown units "' + units + '": use mm, cm, m, in or ft.'] };
        var seen = new Set(), parts = [];
        _arr(meta.parts).forEach(function (p, i) {
            if (!p || typeof p.pid !== 'string' || !p.pid) { issues.push('Part ' + (i + 1) + ' has no persistent id; skipped.'); return; }
            if (seen.has(p.pid)) { issues.push('Part id ' + p.pid + ' appears twice; the second is skipped.'); return; }
            if (!p.bbox || !_n3(p.bbox.min) || !_n3(p.bbox.max)) { issues.push('Part ' + p.pid + ' has no usable bounding box; skipped.'); return; }
            var mn = [p.bbox.min[0] * f, p.bbox.min[1] * f, p.bbox.min[2] * f], mx = [p.bbox.max[0] * f, p.bbox.max[1] * f, p.bbox.max[2] * f];
            for (var a = 0; a < 3; a++) if (mn[a] > mx[a]) { var t = mn[a]; mn[a] = mx[a]; mx[a] = t; issues.push('Part ' + p.pid + ': box min above max on axis ' + 'xyz'.charAt(a) + '; swapped.'); }
            seen.add(p.pid);
            var c = _n3(p.centroid) ? [p.centroid[0] * f, p.centroid[1] * f, p.centroid[2] * f] : _center({ min: mn, max: mx });
            var part = { pid: p.pid, name: _s(p.name) || p.pid, partNumber: _s(p.partNumber) || null,
                         path: Array.isArray(p.path) ? p.path : [], bbox: { min: mn, max: mx }, centroid: c };
            if (_s(p.designator)) part.designator = _s(p.designator);
            if (_s(p.ata)) part.ata = _s(p.ata);
            if (p.boxEstimated === true) part.boxEstimated = true;   // its box is an estimate until the shape is read
            parts.push(part);
        });
        var pc = _pc();
        if (!Array.isArray(pc.cadModels)) pc.cadModels = [];
        var id = _s(meta.id);
        if (!/^cad-\d+$/.test(id) || model(id)) {
            var n = pc.cadSeq || 0;
            pc.cadModels.forEach(function (m) { var k = /^cad-(\d+)$/.exec(m && m.id || ''); if (k) n = Math.max(n, Number(k[1])); });
            id = 'cad-' + (n + 1);
        }
        var k2 = /^cad-(\d+)$/.exec(id); pc.cadSeq = Math.max(pc.cadSeq || 0, k2 ? Number(k2[1]) : 0);
        var m = { id: id, fileName: _s(meta.fileName) || null, sha256: _s(meta.sha256) || null, revision: _s(meta.revision) || null,
                  importedAt: _s(meta.importedAt) || (opts.at || new Date().toISOString()), units: 'mm', parts: parts };
        if (parts.length > LOCAL_PARTS_MIN && m.sha256) {
            // the full list to this computer's registry, the project keeps the summary
            registerLocalParts(m.sha256, parts);
            m.partStore = 'local'; m.partCount = parts.length; m.parts = [];
        }
        if (units !== 'mm') m.sourceUnits = units;
        pc.cadModels.push(m);
        _save();
        return { ok: true, model: m, issues: issues };
    }

    // The boxes of a model's parts, replaced by better ones (a large model opens with boxes
    // estimated from the file and gets each part's true box when its shape has been read).
    // list = [{ pid, bbox: { min, max }, centroid? }]. Updates this computer's full list and the
    // synced records alike.
    function updatePartBoxes(cadId, list) {
        var m = model(cadId); if (!m) return { ok: false, err: 'CAD model not found: ' + cadId };
        var map = _partMap(cadId), synced = {}, n = 0;
        _arr(m.parts).forEach(function (p) { synced[p.pid] = p; });
        _arr(list).forEach(function (u) {
            if (!u || !u.bbox || !_n3(u.bbox.min) || !_n3(u.bbox.max)) return;
            [map[u.pid], synced[u.pid]].forEach(function (p) {
                if (!p) return;
                p.bbox = { min: u.bbox.min.slice(), max: u.bbox.max.slice() };
                if (_n3(u.centroid)) p.centroid = u.centroid.slice();
                delete p.boxEstimated;   // the true box, from the part's shape
            });
            if (map[u.pid] || synced[u.pid]) n++;
        });
        _save();
        return { ok: true, updated: n };
    }

    // ---- links between CAD parts and equipment (systemsData ids) --------------------------
    function _links() { var pc = _pc(); if (!pc.cadLinks || typeof pc.cadLinks !== 'object' || Array.isArray(pc.cadLinks)) pc.cadLinks = {}; return pc.cadLinks; }
    function _linksRead() { var pc = _pc(); return (pc.cadLinks && typeof pc.cadLinks === 'object' && !Array.isArray(pc.cadLinks)) ? pc.cadLinks : {}; }
    function linkKey(cadId, pid) { return String(cadId) + '|' + String(pid); }
    function link(cadId, pid) { var r = _linksRead()[linkKey(cadId, pid)]; return r ? _clone(r) : null; }
    function _checkLink(cadId, pid, sysId, by) {
        if (!model(cadId)) return 'CAD model not found: ' + cadId;
        if (!_partMap(cadId)[pid]) return 'Part not found in ' + cadId + ': ' + pid;
        if (!_sysById(sysId)) return 'Equipment not found: ' + sysId;
        if (!_s(by)) return 'A link needs the name of who confirmed or rejected it.';
        return null;
    }
    function confirmLink(cadId, pid, sysId, by, opts) {
        opts = opts || {};
        var bad = _checkLink(cadId, pid, sysId, by); if (bad) return { ok: false, err: bad };
        var L = _links(), k = linkKey(cadId, pid);
        var r = L[k] || { cadId: cadId, pid: pid, sysId: null, on: null, by: null, at: null, rejected: [] };
        r.sysId = String(sysId); r.on = opts.on || 'confirmed'; r.by = _s(by); r.at = opts.at || new Date().toISOString();
        r.rejected = _arr(r.rejected).filter(function (x) { return x.sysId !== String(sysId); });
        _pin(cadId, pid);
        L[k] = r; _save();
        return { ok: true, link: _clone(r) };
    }
    function rejectLink(cadId, pid, sysId, by, opts) {
        opts = opts || {};
        var bad = _checkLink(cadId, pid, sysId, by); if (bad) return { ok: false, err: bad };
        var L = _links(), k = linkKey(cadId, pid);
        var r = L[k] || { cadId: cadId, pid: pid, sysId: null, on: null, by: null, at: null, rejected: [] };
        if (r.sysId === String(sysId)) { r.sysId = null; r.on = null; }
        r.rejected = _arr(r.rejected).filter(function (x) { return x.sysId !== String(sysId); });
        r.rejected.push({ sysId: String(sysId), by: _s(by), at: opts.at || new Date().toISOString() });
        r.rejected.sort(function (a, b) { return _cmp(a.sysId, b.sysId); });
        _pin(cadId, pid);
        L[k] = r; _save();
        return { ok: true, link: _clone(r) };
    }
    function unlink(cadId, pid) { var L = _links(), r = L[linkKey(cadId, pid)]; if (!r || !r.sysId) return { ok: false, err: 'not linked' }; r.sysId = null; r.on = null; _save(); return { ok: true }; }
    // pid -> sysId for the confirmed links of one model (only parts that exist in it)
    function confirmed(cadId) {
        var out = {}, parts = _partMap(cadId), L = _linksRead();
        Object.keys(L).sort().forEach(function (k) { var r = L[k]; if (r && r.cadId === cadId && r.sysId && parts[r.pid]) out[r.pid] = r.sysId; });
        return out;
    }
    // sysId -> [pids] (sorted) for one model
    function equipmentParts(cadId) {
        var c = confirmed(cadId), out = {};
        Object.keys(c).sort(_cmp).forEach(function (pid) { (out[c[pid]] = out[c[pid]] || []).push(pid); });
        return out;
    }

    // matchEquipment(cadId): pure. exact = one identifier equal, to exactly one equipment item;
    // candidates = loose matches (case / spacing, a name or designator inside the part name, or an
    // exact identifier shared by several items); unmatched = nothing found. Confirmed parts are
    // listed under linked; rejected pairs never come back as candidates.
    function _ids(v) { return (Array.isArray(v) ? v : [v]).map(_s).filter(Boolean); }
    function _loose(s) { return _s(s).toLowerCase().replace(/[\s_\-.\/]+/g, ''); }
    function matchEquipment(cadId) {
        var out = { cadId: cadId, exact: [], candidates: [], unmatched: [], linked: [] };
        if (!model(cadId)) return out;
        var L = _linksRead(), sys = _sys().filter(function (s) { return s && s.id != null; }).slice().sort(function (a, b) { return _cmp(a.id, b.id); });
        // How many CAD parts carry each designator: a designator on two parts is not an instance tag.
        var desigCount = {};
        _partsSorted(cadId).forEach(function (p) { _uniqSorted([_s(p.designator), _s(p.name)].filter(Boolean)).forEach(function (d) { desigCount[d] = (desigCount[d] || 0) + 1; }); });
        _partsSorted(cadId).forEach(function (p) {
            var r = L[linkKey(cadId, p.pid)];
            if (r && r.sysId) { out.linked.push({ pid: p.pid, sysId: r.sysId, on: r.on || 'confirmed' }); return; }
            var rejected = {}; _arr(r && r.rejected).forEach(function (x) { rejected[x.sysId] = 1; });
            var hits = [], loose = {};
            sys.forEach(function (s) {
                if (rejected[String(s.id)]) return;
                var on = null;
                // The designator is checked first: it names the installed copy, so it is the match that counts
                // when the part number also agrees.
                if (_ids(s.designator).some(function (d) { return d === p.name || d === p.designator; })) on = 'designator';
                else if (p.partNumber && _ids(s.partNumber).concat(_ids(s.partNumbers)).indexOf(p.partNumber) >= 0) on = 'partNumber';
                else if (p.ata && _ids(s.ata).indexOf(p.ata) >= 0) on = 'ata';
                if (on) { hits.push({ sysId: String(s.id), on: on }); return; }
                var pn = _loose(p.name), keys = [];
                [s.partNumber, s.partNumbers, s.designator, s.ata, s.name].forEach(function (v) { _ids(v).forEach(function (x) { keys.push(_loose(x)); }); });
                if (keys.some(function (k2) { return k2 && (k2 === pn || k2 === _loose(p.partNumber) || k2 === _loose(p.designator) || (k2.length >= 3 && pn.indexOf(k2) >= 0)); })) loose[String(s.id)] = 1;
            });
            // Only a unique designator links by itself: one equipment item, and the tag on exactly one CAD part.
            // (one equipment item carries the designator, even when other items share the part number)
            var dh = hits.filter(function (h) { return h.on === 'designator'; });
            var tag = dh.length === 1 ? (_ids(sys.filter(function (s) { return String(s.id) === dh[0].sysId; })[0].designator).filter(function (d) { return d === p.name || d === p.designator; })[0]) : null;
            if (tag && desigCount[tag] === 1) out.exact.push({ pid: p.pid, sysId: dh[0].sysId, on: 'designator' });
            else if (hits.length || Object.keys(loose).length) out.candidates.push({ pid: p.pid, sysIds: _uniqSorted(hits.map(function (h) { return h.sysId; }).concat(Object.keys(loose))) });
            else out.unmatched.push(p.pid);
        });
        return out;
    }
    // The explicit write of the exact matches (the only links made without an engineer choosing).
    function applyExactLinks(cadId, by, opts) {
        opts = opts || {};
        var m = matchEquipment(cadId), made = [];
        m.exact.forEach(function (e) { var r = confirmLink(cadId, e.pid, e.sysId, by || 'exact identifier match', { on: e.on, at: opts.at }); if (r.ok) made.push({ pid: e.pid, sysId: e.sysId, on: e.on }); });
        return { ok: true, linked: made };
    }
    // Links survive a new revision only where the part kept its id AND its part number.
    function carryLinks(oldCadId, newCadId, by, opts) {
        opts = opts || {};
        var a = _partMap(oldCadId), b = _partMap(newCadId), c = confirmed(oldCadId), carried = [], dropped = [];
        Object.keys(c).sort(_cmp).forEach(function (pid) {
            if (b[pid] && (b[pid].partNumber || null) === (a[pid].partNumber || null)) {
                if (!link(newCadId, pid) || !link(newCadId, pid).sysId) { var r = confirmLink(newCadId, pid, c[pid], by || 'carried from ' + oldCadId, { on: 'carried', at: opts.at }); if (r.ok) carried.push({ pid: pid, sysId: c[pid] }); }
            } else dropped.push({ pid: pid, sysId: c[pid], why: b[pid] ? 'part number changed' : 'part removed' });
        });
        return { ok: true, carried: carried, dropped: dropped };
    }

    // ---- zone list import (CSV / Excel rows) ------------------------------------------------
    function _row(r, keys) { for (var i = 0; i < keys.length; i++) { if (r[keys[i]] != null && _s(r[keys[i]]) !== '') return r[keys[i]]; } var lk = {}; Object.keys(r).forEach(function (k) { lk[k.toLowerCase().replace(/[\s_]/g, '')] = r[k]; }); for (var j = 0; j < keys.length; j++) { var v = lk[keys[j].toLowerCase()]; if (v != null && _s(v) !== '') return v; } return null; }
    function importZoneList(rows, opts) {
        opts = opts || {};
        var Z = _Z(); if (!Z) return { ok: false, issues: ['The zonal model is not loaded.'] };
        var res = { ok: true, created: [], updated: [], unchanged: [], notInList: [], issues: [] };
        var byCode = {}, list = [];
        _arr(rows).forEach(function (r, i) {
            if (!r || typeof r !== 'object') return;
            var code = _s(_row(r, ['code', 'zone', 'zoneCode', 'atazone']));
            if (!code) { res.issues.push('Row ' + (i + 1) + ' has no zone code; skipped.'); return; }
            if (byCode[code]) { res.issues.push('Zone ' + code + ' is listed twice; the first row is used.'); return; }
            var nm = _s(_row(r, ['name', 'description', 'zoneName'])), parent = _s(_row(r, ['parentCode', 'parent', 'parentZone']));
            var c = ['xMin', 'yMin', 'zMin', 'xMax', 'yMax', 'zMax'].map(function (k) { var v = _row(r, [k]); return v == null ? null : Number(v); });
            var vol;
            if (c.every(function (x) { return x == null; })) vol = undefined;
            else if (c.some(function (x) { return x == null || !isFinite(x); })) { res.issues.push('Zone ' + code + ': the six box coordinates are incomplete or not numbers; volume left as it was.'); vol = undefined; }
            else {
                vol = { kind: 'box', min: [c[0], c[1], c[2]], max: [c[3], c[4], c[5]] };
                if (Z.volumeIssue(vol)) { res.issues.push('Zone ' + code + ': ' + Z.volumeIssue(vol) + ' Volume left as it was.'); vol = undefined; }
            }
            byCode[code] = { code: code, name: nm, parentCode: parent, volume: vol };
            list.push(byCode[code]);
        });
        list.sort(function (a, b) { return _nat(a.code, b.code); });
        // 19 Oct 2026 (zones-3): a listed code finds its zone the way every zone reference does (ignoring case and spacing)
        var zoneByCode = {}; Z.all().forEach(function (z) { if (z && z.code && !zoneByCode[z.code]) zoneByCode[z.code] = z; });
        list.forEach(function (e) { if (!zoneByCode[e.code] && Z.byCode) { var hit = Z.byCode(e.code); if (hit) zoneByCode[e.code] = hit; } });
        list.forEach(function (e) { if (e.parentCode && !zoneByCode[e.parentCode] && Z.byCode) { var hp = Z.byCode(e.parentCode); if (hp) zoneByCode[e.parentCode] = hp; } });
        var before = {};
        list.forEach(function (e) {
            var z = zoneByCode[e.code];
            if (!z) {
                var r = Z.addZone({ code: e.code, name: e.name || e.code, parentId: null, volume: e.volume === undefined ? null : e.volume, source: 'list', cadRef: null });
                zoneByCode[e.code] = r.zone; res.created.push(e.code);
            } else {
                before[e.code] = JSON.stringify([z.name, z.parentId, z.volume || null, z.source || 'manual']);
                if (e.name) z.name = e.name;
                if (e.volume !== undefined) Z.setVolume(z.id, e.volume, 'list');
                else if (z.source !== 'cad') z.source = 'list';
            }
        });
        // parents in a second pass, so a child may come before its parent in the file
        list.forEach(function (e) {
            var z = zoneByCode[e.code], want = null;
            if (e.parentCode) {
                var p = zoneByCode[e.parentCode];
                if (!p) res.issues.push('Zone ' + e.code + ': parent zone ' + e.parentCode + ' does not exist; left at the top level.');
                else if (p.id === z.id || Z.isDescendant(p.id, z.id)) res.issues.push('Zone ' + e.code + ': parent ' + e.parentCode + ' would make a loop; parent left as it was.');
                else want = p.id;
            }
            if (want !== null || !e.parentCode) z.parentId = want;
        });
        list.forEach(function (e) {
            if (res.created.indexOf(e.code) >= 0) return;
            var z = zoneByCode[e.code];
            if (JSON.stringify([z.name, z.parentId, z.volume || null, z.source || 'manual']) === before[e.code]) res.unchanged.push(e.code); else res.updated.push(e.code);
        });
        Z.all().forEach(function (z) { if (z && z.source === 'list' && z.code && !byCode[z.code]) res.notInList.push(z.code); });
        res.notInList.sort(_nat);
        if (_pc().zonesSchema !== 'zones-2' && typeof Z.migrate === 'function') Z.migrate();
        _save();
        return res;
    }

    // ---- containment ------------------------------------------------------------------------
    // The boxes that make up a zone's volume, read against model cadId where its parts exist.
    function _zoneBoxes(z, cadId) {
        var v = z && z.volume;
        if (!v) return null;
        if (v.kind === 'box') return [{ min: v.min, max: v.max }];
        if (v.kind === 'parts') {
            var here = _partMap(cadId), own = _partMap(v.cadId), out = [];
            _arr(v.pids).slice().sort(_cmp).forEach(function (pid) { var p = here[pid] || own[pid]; if (p) out.push(p.bbox); });
            return out.length ? out : [];
        }
        return null;
    }
    function _zoneLabel(z) { return z ? ((z.code ? z.code + ' ' : '') + (z.name || z.id)) : ''; }
    function _zonesSorted() { var Z = _Z(); return Z ? Z.all().filter(Boolean).slice().sort(function (a, b) { return _nat(a.code, b.code) || _cmp(a.id, b.id); }) : []; }
    function containment(cadId) {
        cadId = cadId || latestCadId();
        var Z = _Z();
        var res = { cadId: cadId, parts: [], byZone: {}, outside: [], straddling: [], ambiguous: [], envelopes: [], zoneIssues: [], estimated: [] };
        if (!Z || !model(cadId)) return res;
        var zones = [], envelope = {};
        _zonesSorted().forEach(function (z) {
            var boxes = _zoneBoxes(z, cadId);
            if (boxes === null) return;
            if (!boxes.length) { res.zoneIssues.push({ zoneId: z.id, text: 'Zone ' + _zoneLabel(z) + ' is defined by CAD parts that are not in this model.' }); return; }
            if (z.volume.kind === 'parts') z.volume.pids.forEach(function (p) { envelope[p] = 1; });
            zones.push({ z: z, boxes: boxes, depth: Z.depth(z.id), vol: boxes.reduce(function (s, b) { return s + _boxVol(b); }, 0) });
        });
        res.envelopes = Object.keys(envelope).filter(function (p) { return !!_partMap(cadId)[p]; }).sort(_cmp);
        var est = _estSet(cadId);
        _partsSorted(cadId).forEach(function (p) {
            if (envelope[p.pid]) return;
            if (est[p.pid]) { res.estimated.push(p.pid); res.parts.push({ pid: p.pid, zoneId: null, estimated: true }); return; }
            var hits = zones.filter(function (e) { return e.boxes.some(function (b) { return _inBox(p.centroid, b.min, b.max); }); });
            hits.sort(function (a, b) { return (b.depth - a.depth) || (a.vol - b.vol) || _nat(a.z.code, b.z.code) || _cmp(a.z.id, b.z.id); });
            var win = hits[0] || null;
            var rec = { pid: p.pid, zoneId: win ? win.z.id : null };
            if (win) {
                var tied = hits.filter(function (h) { return h !== win && h.depth === win.depth; });
                if (tied.length) { rec.ambiguousWith = tied.map(function (h) { return h.z.id; }); res.ambiguous.push({ pid: p.pid, zoneIds: [win.z.id].concat(rec.ambiguousWith) }); }
                (res.byZone[win.z.id] = res.byZone[win.z.id] || []).push(p.pid);
            } else res.outside.push(p.pid);
            // straddling: the box leaves its zone, or reaches into a zone other than its zone and the
            // zones that contain it (a part partly inside a sub-zone or a neighbor)
            var inside = !!win && win.boxes.some(function (b) { return _boxInside(p.bbox, b.min, b.max); });
            var crosses = zones.filter(function (e) {
                if (win && (e === win || Z.isDescendant(win.z.id, e.z.id))) return false;
                return e.boxes.some(function (b) { return _boxesOverlap(p.bbox, b) && !_boxInside(p.bbox, b.min, b.max); }) || (!win && e.boxes.some(function (b) { return _boxesOverlap(p.bbox, b); }));
            }).map(function (e) { return e.z.id; });
            if ((win && !inside) || crosses.length) res.straddling.push({ pid: p.pid, zoneId: win ? win.z.id : null, crosses: crosses });
            res.parts.push(rec);
        });
        return res;
    }

    // applyContainment(cadId[, {apply, by}]): the zone assignments the confirmed links and the
    // containment imply. Without apply it only returns the difference; with apply:true it writes
    // the assignments (zonal_model assign, which moves an item out of any other zone).
    function applyContainment(cadId, opts) {
        opts = opts || {};
        cadId = cadId || latestCadId();
        var Z = _Z(), out = { cadId: cadId, assign: [], unchanged: [], conflicts: [], notContained: [], waiting: [], applied: false };
        if (!Z || !model(cadId)) return out;
        var c = containment(cadId), zoneOfPid = {};
        c.parts.forEach(function (r) { zoneOfPid[r.pid] = r.zoneId; });
        var eq = equipmentParts(cadId), est = _estSet(cadId);
        Object.keys(eq).sort(_cmp).forEach(function (sysId) {
            var waitOn = eq[sysId].filter(function (pid) { return est[pid]; });
            if (waitOn.length) { out.waiting.push({ sysId: sysId, pids: waitOn }); return; }   // placed when its parts' sizes are known
            var zs = _uniqSorted(eq[sysId].map(function (pid) { return zoneOfPid[pid] || null; }).filter(Boolean));
            var missing = eq[sysId].filter(function (pid) { return !zoneOfPid[pid]; });
            if (!zs.length) { out.notContained.push({ sysId: sysId, pids: eq[sysId].slice() }); return; }
            if (zs.length > 1) { out.conflicts.push({ sysId: sysId, zoneIds: zs, pids: eq[sysId].slice() }); return; }
            var cur = Z.zoneOf(sysId), from = cur ? cur.id : null;
            if (from === zs[0]) out.unchanged.push({ sysId: sysId, zoneId: from });
            else out.assign.push({ sysId: sysId, fromZoneId: from, toZoneId: zs[0], pids: eq[sysId].slice(), partsOutside: missing });
        });
        if (opts.apply) {
            out.assign.forEach(function (a) { Z.assign(a.toZoneId, a.sysId); });
            out.applied = true;
            if (out.assign.length) {
                try { var CA = root.SLChangeAck; if (CA && typeof CA.describe === 'function') CA.describe({ summary: 'Placed ' + out.assign.length + ' equipment item' + (out.assign.length === 1 ? '' : 's') + ' in zones from CAD ' + cadId + (opts.by ? ' (' + opts.by + ')' : ''), refs: out.assign.map(function (a) { return { kind: 'zone', id: a.toZoneId, sysId: a.sysId }; }) }); } catch (_) {}
                _save();
            }
        }
        return out;
    }

    // ---- clearances --------------------------------------------------------------------------
    // Pairs of parts of DIFFERENT confirmed equipment whose boxes are closer than the threshold
    // (mm, default 50). Box-to-box distance is a lower bound on the true distance.
    function clearances(cadId, opts) {
        opts = opts || {};
        cadId = cadId || latestCadId();
        var th = (typeof opts.threshold === 'number' && opts.threshold >= 0) ? opts.threshold : 50;
        var c = confirmed(cadId), parts = _partMap(cadId);
        var list = Object.keys(c).filter(function (pid) { return parts[pid]; }).map(function (pid) { return parts[pid]; });
        list.sort(function (a, b) { return (a.bbox.min[0] - b.bbox.min[0]) || _cmp(a.pid, b.pid); });
        var out = [];
        for (var i = 0; i < list.length; i++) {
            for (var j = i + 1; j < list.length; j++) {
                if (list[j].bbox.min[0] - list[i].bbox.max[0] > th) break;   // sorted on x: nothing further can be closer
                var a = list[i], b = list[j];
                if (c[a.pid] === c[b.pid]) continue;
                var d = boxDistance(a.bbox, b.bbox);
                if (d > th) continue;
                var pa = _cmp(a.pid, b.pid) <= 0 ? a : b, pb = pa === a ? b : a;
                out.push({ pidA: pa.pid, pidB: pb.pid, sysA: c[pa.pid], sysB: c[pb.pid], distance: _r6(d), overlap: d === 0 });
            }
        }
        out.sort(function (x, y) { return (x.distance - y.distance) || _cmp(x.pidA, y.pidA) || _cmp(x.pidB, y.pidB); });
        return { cadId: cadId, threshold: th, pairs: out };
    }

    // ---- particular-risk volumes --------------------------------------------------------------
    function _vols() { var pc = _pc(); if (!Array.isArray(pc.praVolumes)) pc.praVolumes = []; return pc.praVolumes; }
    function riskVolumes() { var pc = _pc(); return _arr(pc.praVolumes).slice().sort(function (a, b) { return _nat(a.id, b.id); }); }
    function riskVolume(id) { var v = _arr(_pc().praVolumes); for (var i = 0; i < v.length; i++) if (v[i] && v[i].id === id) return v[i]; return null; }
    function spreadOf(shape) {
        if (shape && typeof shape.spreadDeg === 'number' && shape.spreadDeg >= 0) return shape.spreadDeg;
        var f = shape && FRAGMENTS[shape.fragment]; return f != null ? f : FRAGMENTS[DEFAULT_FRAGMENT];
    }
    function shapeIssue(s) {
        if (!s || typeof s !== 'object') return 'A risk volume needs a shape.';
        if (SHAPES.indexOf(s.kind) < 0) return 'Unknown shape: ' + s.kind + ' (box, sphere, cone or disk-sector).';
        if (s.kind === 'box') { if (!_n3(s.min) || !_n3(s.max)) return 'A box needs min and max as three numbers each.'; for (var i = 0; i < 3; i++) if (s.min[i] > s.max[i]) return 'A box has min above max on axis ' + 'xyz'.charAt(i) + '.'; return null; }
        if (s.kind === 'sphere') return (_n3(s.center) && typeof s.radius === 'number' && s.radius > 0) ? null : 'A sphere needs a center and a positive radius.';
        if (s.kind === 'cone') {
            if (!_n3(s.apex) || !_n3(s.axis) || !_unit(s.axis)) return 'A cone needs an apex and an axis direction.';
            if (!(typeof s.halfAngleDeg === 'number' && s.halfAngleDeg > 0 && s.halfAngleDeg < 90)) return 'A cone needs a half angle between 0 and 90 degrees.';
            if (s.length != null && !(typeof s.length === 'number' && s.length > 0)) return 'A cone length must be positive when given.';
            return null;
        }
        if (!_n3(s.center) || !_n3(s.axis) || !_unit(s.axis)) return 'A disk sector needs the rotor center and its axis of rotation.';
        if (s.spreadDeg != null && !(typeof s.spreadDeg === 'number' && s.spreadDeg >= 0 && s.spreadDeg < 90)) return 'The fragment spread must be between 0 and 90 degrees.';
        if (s.fragment != null && FRAGMENTS[s.fragment] == null) return 'Unknown fragment model: ' + s.fragment + ' (oneThirdDisc, intermediate or small).';
        if (s.range != null && !(typeof s.range === 'number' && s.range > 0)) return 'The fragment range must be positive when given.';
        // 13 Oct 2026 (cad-A merge): the shared contract names the reach of a disk sector `radius`;
        // it is read as the range when no range is given, so both spellings mean the same volume.
        if (s.range == null && s.radius != null && !(typeof s.radius === 'number' && s.radius > 0)) return 'The fragment range (radius) must be positive when given.';
        if ((s.fromDeg != null || s.toDeg != null) && !_n3(s.refDir)) return 'A sector (fromDeg, toDeg) needs a reference direction in the rotor plane.';
        return null;
    }
    function inShape(s, p) {
        switch (s.kind) {
            case 'box': return _inBox(p, s.min, s.max);
            case 'sphere': return _len(_sub(p, s.center)) <= s.radius;
            case 'cone': {
                var u = _unit(s.axis), v = _sub(p, s.apex), t = _dot(v, u), l = _len(v);
                if (l === 0) return true;
                if (t < 0) return false;
                if (s.length != null && t > s.length) return false;
                return Math.acos(Math.min(1, t / l)) * 180 / Math.PI <= s.halfAngleDeg + 1e-9;
            }
            case 'disk-sector': {
                var ua = _unit(s.axis), w = _sub(p, s.center), d = _len(w);
                if (d === 0) return true;
                var reach = s.range != null ? s.range : s.radius;
                if (reach != null && d > reach) return false;
                var elev = Math.asin(Math.min(1, Math.abs(_dot(w, ua)) / d)) * 180 / Math.PI;
                if (elev > spreadOf(s) + 1e-9) return false;
                if (s.fromDeg == null && s.toDeg == null) return true;
                var r0 = _sub(s.refDir, [ua[0] * _dot(s.refDir, ua), ua[1] * _dot(s.refDir, ua), ua[2] * _dot(s.refDir, ua)]);
                var e1 = _unit(r0); if (!e1) return true;
                var e2 = _cross(ua, e1), az = Math.atan2(_dot(w, e2), _dot(w, e1)) * 180 / Math.PI;
                if (az < 0) az += 360;
                var from = ((s.fromDeg || 0) % 360 + 360) % 360, to = ((s.toDeg == null ? 360 : s.toDeg) % 360 + 360) % 360;
                if (s.toDeg != null && s.toDeg - (s.fromDeg || 0) >= 360) return true;
                return from <= to ? (az >= from - 1e-9 && az <= to + 1e-9) : (az >= from - 1e-9 || az <= to + 1e-9);
            }
        }
        return false;
    }
    function addRiskVolume(v) {
        if (!v || typeof v !== 'object') return { ok: false, err: 'No risk volume given.' };
        var kind = KINDS.indexOf(v.kind) >= 0 ? v.kind : null; if (!kind) return { ok: false, err: 'Unknown risk kind: ' + v.kind };
        var bad = shapeIssue(v.shape); if (bad) return { ok: false, err: bad };
        var arr = _vols(), id = _s(v.id);
        if (!id || riskVolume(id)) { var pc = _pc(); pc.praVolumeSeq = (pc.praVolumeSeq || 0) + 1; id = 'prv-' + pc.praVolumeSeq; while (riskVolume(id)) { pc.praVolumeSeq++; id = 'prv-' + pc.praVolumeSeq; } }
        var rec = { id: id, kind: kind, shape: _clone(v.shape), label: _s(v.label) || kind, source: _s(v.source) || 'manual' };
        if (kind === 'rotorBurst' && rec.shape.kind === 'disk-sector' && rec.shape.spreadDeg == null) rec.shape.spreadDeg = spreadOf(rec.shape);
        if (v.praId != null) rec.praId = v.praId;
        arr.push(rec); _save();
        return { ok: true, volume: rec };
    }
    function removeRiskVolume(id) { var arr = _vols(); for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) { arr.splice(i, 1); _save(); return { ok: true }; } return { ok: false, err: 'not found' }; }
    // partsInVolume(volumeId, cadId): every part with a sample point inside; how = 'centroid'
    // when its centroid is inside, else 'box'. Sorted by pid.
    function partsInVolume(volumeId, cadId) {
        cadId = cadId || latestCadId();
        var v = riskVolume(volumeId); if (!v || shapeIssue(v.shape) || !model(cadId)) return [];
        var out = [], est = _estSet(cadId);
        _partsSorted(cadId).forEach(function (p) {
            if (est[p.pid]) return;   // its size is not known yet
            if (inShape(v.shape, p.centroid)) { out.push({ pid: p.pid, how: 'centroid' }); return; }
            if (_samples(p.bbox).some(function (q) { return inShape(v.shape, q); })) out.push({ pid: p.pid, how: 'box' });
        });
        return out;
    }

    // ---- fault trees: which basic events belong to which equipment ---------------------------
    function _lid(n) { return n.logicalId != null ? n.logicalId : n.id; }
    // 19 Oct 2026 (build 7): node_identity.js equipmentOf is the one answer (an authored equipment link, the declared
    // identity, a MAC system event); the lines below are its fallback when that file is not loaded.
    function equipmentOfEvent(n) {
        var NI = root.SLNodeIdentity || (typeof SLNodeIdentity !== 'undefined' ? SLNodeIdentity : null);
        if (NI && NI.equipmentOf) return NI.equipmentOf(n);
        if (n && n.equipmentId) return String(n.equipmentId);
        var id = n && n.identity;
        if (!id || typeof id !== 'object') return null;
        if (id.kind === 'resource') return id.providerSystemId ? String(id.providerSystemId) : null;
        return id.systemId ? String(id.systemId) : null;
    }
    function _pages() { return _arr(_g('ftaPages')).filter(function (p) { return p && p.root; }); }
    function _pageById(id) { var ps = _arr(_g('ftaPages')); for (var i = 0; i < ps.length; i++) if (ps[i] && String(ps[i].id) === String(id)) return ps[i]; return null; }
    function _kids(n) { return n.children || n._children || []; }
    // lid -> { sysIds:{}, displayId, name } over every leaf of every tree
    function eventIndex() {
        var idx = {}, untagged = {};
        _pages().forEach(function (pg) {
            (function walk(n, seen) {
                if (!n || seen[n.id]) return; seen[n.id] = 1;
                if (n.type !== 'gate') {
                    var lid = String(_lid(n)), e = equipmentOfEvent(n);
                    var r = idx[lid] || (idx[lid] = { lid: lid, sysIds: {}, displayId: n.displayId || null, name: n.name || '' });
                    if (e) r.sysIds[e] = 1;
                    return;
                }
                _kids(n).forEach(function (c) { walk(c, seen); });
            })(pg.root, {});
        });
        Object.keys(idx).forEach(function (k) { if (!Object.keys(idx[k].sysIds).length) untagged[k] = 1; });
        return { byLid: idx, untagged: Object.keys(untagged).sort(_cmp) };
    }
    function _fhaRow(id) {
        var s = String(id), real = s.indexOf('AC_') === 0 ? s.slice(3) : (s.indexOf('SYS_') === 0 ? s.slice(4) : s);
        var ac = _arr(_g('acFhaData'));
        if (s.indexOf('SYS_') !== 0) for (var i = 0; i < ac.length; i++) if (ac[i] && String(ac[i].internalId) === real) return { row: ac[i], domain: 'AC', systemId: null };
        if (s.indexOf('AC_') !== 0) {
            var sy = _sys();
            for (var j = 0; j < sy.length; j++) { var f = _arr(sy[j] && sy[j].fha); for (var k = 0; k < f.length; k++) if (f[k] && String(f[k].internalId) === real) return { row: f[k], domain: 'SYS', systemId: sy[j].id }; }
        }
        return null;
    }
    function sevRank(s) {
        var R = _g('SEVERITY_RANK'), k = _s(s);
        if (R && typeof R === 'object' && R[k] != null) return R[k];
        if (SEV_FALLBACK[k] != null) return SEV_FALLBACK[k];
        var lk = k.toLowerCase(); for (var n in SEV_FALLBACK) if (n.toLowerCase() === lk) return SEV_FALLBACK[n];
        return -1;
    }
    function _pageFhaIds(pg) { return (Array.isArray(pg.linkedFhaIds) && pg.linkedFhaIds.length) ? pg.linkedFhaIds : (pg.linkedFhaId != null && pg.linkedFhaId !== '' ? [pg.linkedFhaId] : []); }

    // The core evaluation. sysIds: the equipment that fails. Uses the existing BDD engine:
    // buildBDDFromFT(root) and minOrder(bdd, fixedTrue). minOrder with the forced variables fixed
    // true counts the further failures needed; 0 = this tree is reached by the event alone.
    // _nonMonoGates(root): the NOT and XOR gates of a tree, following transfers (D1, 14 Oct 2026). These make the tree
    // non-monotone: hitting more equipment can stop the top event, so "all hit equipment fails" is not the worst case.
    var NON_MONOTONE = { NOT: 1, XOR: 1 };
    function _nonMonoGates(root) {
        var out = [], seen = new Set(), seenP = {};
        (function walk(n) { if (!n || seen.has(n)) return; seen.add(n); if (n.type !== 'gate') return;   // F1: by the node itself
            if (n.gateType === 'TRANSFER' || n.transferOutTo) { var lk = n.transferOutTo || n.linkedPageId; if (lk && !seenP[lk]) { seenP[lk] = 1; var pg = _pages().filter(function (p) { return p.id === lk; })[0]; if (pg) walk(pg.root); } return; }
            if (NON_MONOTONE[n.gateType]) out.push({ id: String(n.id), displayId: n.displayId || String(n.id), type: n.gateType });
            _arr(n.children || n._children).forEach(walk); })(root);
        return out.sort(function (a, b) { return _cmp(a.id, b.id); });
    }
    function evaluate(sysIds, opts) {
        opts = opts || {};
        var E = _E();
        var want = {}; _arr(sysIds).forEach(function (s) { want[String(s)] = 1; });
        var EI = eventIndex();
        var lids = Object.keys(EI.byLid).filter(function (l) { return Object.keys(EI.byLid[l].sysIds).some(function (s) { return want[s]; }); }).sort(_cmp);
        var lidSet = {}; lids.forEach(function (l) { lidSet[l] = 1; });
        var trees = [], errors = [];
        if (!E || typeof E.buildBDDFromFT !== 'function' || typeof E.minOrder !== 'function') return { engine: false, lids: lids, trees: [], errors: [{ text: 'The fault tree engine is not loaded; no result is given rather than a guess.' }], untagged: EI.untagged, index: EI.byLid };
        _pages().slice().sort(function (a, b) { return _cmp(a.id, b.id); }).forEach(function (pg) {
            var built, dupIds = typeof E.duplicateNodeIds === 'function' ? E.duplicateNodeIds(pg.root) : [];
            if (dupIds.length) { errors.push({ pageId: pg.id, text: 'Fault tree ' + (pg.name || pg.id) + ' uses node id' + (dupIds.length > 1 ? 's ' : ' ') + dupIds.slice(0, 5).join(', ') + ' more than once in the page; no result for it.' }); return; }
            try { built = E.buildBDDFromFT(pg.root); } catch (e) { errors.push({ pageId: pg.id, text: 'Fault tree ' + (pg.name || pg.id) + ' is too large for the engine (' + ((e && e.name) || 'error') + '); no result for it.' }); return; }
            if (!built || !built.bdd || built.bdd.isTerminal) return;
            var forced = new Set(), hit = [];
            built.lidToVar.forEach(function (v, lid) { if (lidSet[String(lid)]) { forced.add(v); hit.push(String(lid)); } });
            if (!hit.length) return;
            (built.varMeta || []).forEach(function (m, v) { if (m && m.synthetic === 'order') forced.add(v); });
            var base = E.minOrder(built.bdd, new Set((built.varMeta || []).map(function (m, v) { return (m && m.synthetic === 'order') ? v : -1; }).filter(function (v) { return v >= 0; })));
            var after = E.minOrder(built.bdd, forced);
            trees.push({ pageId: pg.id, name: pg.name || String(pg.id), topId: pg.root.displayId || null, events: hit.sort(_cmp),
                         reached: after === 0 && base > 0, alreadyTrue: base === 0, additional: isFinite(after) ? after : null, fhaIds: _pageFhaIds(pg).map(String), nonMonotone: _nonMonoGates(pg.root) });
        });
        return { engine: true, lids: lids, trees: trees, errors: errors, untagged: EI.untagged, index: EI.byLid };
    }
    // _impact(sysIds): what the failure of the equipment set does. D1: when a tree reached from the set is non-monotone
    // (NOT, XOR), the severity is the worst over every subset of the hit equipment (any of it may be the part that
    // fails), by exact enumeration over the items that appear in those trees (at most NONMONO_BOUND); above the bound
    // no result is given (refused, with the tree and gate named) rather than one that could be optimistic.
    var NONMONO_BOUND = 16, _refusals = [], _nmSeen = [];
    function _impact(sysIds, extra) {
        var ev0 = evaluate(sysIds), nm = ev0.trees.filter(function (t) { return t.nonMonotone && t.nonMonotone.length; });
        if (!nm.length) return _impact1(sysIds, extra, ev0);
        var eq = _uniqSorted(_arr(sysIds).map(String)), EI = eventIndex(), inNM = {};
        nm.forEach(function (t) { t.events.forEach(function (l) { Object.keys((EI.byLid[l] || { sysIds: {} }).sysIds).forEach(function (s) { inNM[s] = 1; }); }); });
        var vary = eq.filter(function (s) { return inNM[s]; }), rest = eq.filter(function (s) { return !inNM[s]; });
        var named = nm.map(function (t) { return (t.name || t.pageId) + ' (' + t.nonMonotone.map(function (g) { return g.type + ' ' + g.displayId; }).join(', ') + ')'; }).join('; ');
        if (vary.length > NONMONO_BOUND) {
            var msg = 'Non-monotone fault tree ' + named + ': the worst case over subsets of the ' + vary.length + ' hit items in it is beyond the ' + NONMONO_BOUND + '-item bound; no result is given.';
            _refusals.push(msg); var r0 = _impact1(sysIds, extra, ev0); r0.conditions = []; r0.worst = null; r0.refused = msg; r0.notEvaluated = msg; return r0;
        }
        var full = _impact1(sysIds, extra, ev0), byKey = {}, n = 0;
        for (var mask = 0; mask < (1 << vary.length); mask++) {
            var sub = rest.concat(vary.filter(function (s, i) { return mask & (1 << i); })); if (!sub.length) continue; n++;
            _impact1(sub, null).conditions.forEach(function (c) { var k = c.domain + ':' + c.id; if (!byKey[k]) byKey[k] = c; });
        }
        full.conditions = Object.keys(byKey).map(function (k) { return byKey[k]; }).sort(function (a, b) { return (b.rank - a.rank) || _nat(a.fcId || a.id, b.fcId || b.id) || _cmp(a.domain, b.domain) || _cmp(a.id, b.id); });
        full.worst = full.conditions.length ? full.conditions[0].severity : null;
        _nmSeen.push(named);
        full.nonMonotone = { note: 'non-monotone tree: worst case over subsets used', trees: nm.map(function (t) { return { pageId: t.pageId, name: t.name, gates: t.nonMonotone }; }), subsets: n, varied: vary };
        return full;
    }
    function _impact1(sysIds, extra, evIn) {
        var ev = evIn || evaluate(sysIds);
        var eq = _uniqSorted(_arr(sysIds).map(String));
        var fcs = {};
        ev.trees.forEach(function (t) {
            if (!t.reached) return;
            t.fhaIds.forEach(function (fid) {
                var h = _fhaRow(fid); if (!h) return;
                var key = h.domain + ':' + h.row.internalId;
                var c = fcs[key] || (fcs[key] = { id: String(h.row.internalId), fcId: h.row.fcId || null, desc: h.row.fcDesc || h.row.desc || '', severity: h.row.severity || null, rank: sevRank(h.row.severity), domain: h.domain, systemId: h.systemId, trees: [] });
                if (c.trees.indexOf(t.pageId) < 0) c.trees.push(t.pageId);
            });
        });
        var conditions = Object.keys(fcs).map(function (k) { var c = fcs[k]; c.trees.sort(_cmp); return c; })
            .sort(function (a, b) { return (b.rank - a.rank) || _nat(a.fcId || a.id, b.fcId || b.id) || _cmp(a.domain, b.domain) || _cmp(a.id, b.id); });
        var systems = [], functions = [];
        eq.forEach(function (sid) {
            var s = _sysById(sid); if (!s) return;
            systems.push({ id: String(s.id), name: s.name || String(s.id), ref: 'sys:' + s.id });
            _arr(s.functions).forEach(function (f) {
                if (!f) return;
                var fid = f.funcId || f.id; if (fid == null) return;
                functions.push({ systemId: String(s.id), funcId: String(fid), name: f.funcName || f.name || String(fid), ref: 'sfn:' + s.id + '/' + fid,
                                 traces: _uniqSorted(Array.isArray(f.traceIds) ? f.traceIds.map(String) : (f.traceId ? [String(f.traceId)] : [])) });
            });
        });
        functions.sort(function (a, b) { return _cmp(a.systemId, b.systemId) || _nat(a.funcId, b.funcId); });
        var withEvents = {}; ev.lids.forEach(function (l) { Object.keys(ev.index ? ev.index[l].sysIds : {}).forEach(function (s) { withEvents[s] = 1; }); });
        var out = {
            equipment: eq.map(function (sid) { var s = _sysById(sid); return { sysId: sid, name: s ? (s.name || sid) : sid }; }),
            events: ev.lids.map(function (l) { var r = ev.index[l]; return { lid: l, displayId: r.displayId, name: r.name, sysIds: Object.keys(r.sysIds).filter(function (s) { return eq.indexOf(s) >= 0; }).sort(_cmp) }; }),
            conditions: conditions,
            worst: conditions.length ? conditions[0].severity : null,
            trees: ev.trees.map(function (t) { return { pageId: t.pageId, name: t.name, topId: t.topId, reached: t.reached, alreadyTrue: t.alreadyTrue, additional: t.additional, events: t.events }; }),
            systems: systems, functions: functions,
            coverage: { equipmentWithoutEvents: eq.filter(function (s) { return !withEvents[s]; }), eventsWithoutEquipment: ev.untagged.length },
            errors: ev.errors, engine: ev.engine
        };
        // a blank severity must never read as "no effect": when the engine is missing or a tree could not be evaluated the
        // result says so (notEvaluated) and the PRA calls that met it are refused
        if (!ev.engine || (ev.errors && ev.errors.length)) { out.notEvaluated = !ev.engine ? 'the fault tree engine is not loaded' : 'fault tree(s) not evaluated: ' + ev.errors.map(function (e) { return e.text; }).join(' '); _refusals.push(out.notEvaluated); }
        Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
        return out;
    }
    // zoneImpact(zoneId[, {subtree}]): the zone is compromised; by default everything placed in
    // the zone AND its sub-zones fails (a sub-zone is inside it).
    function zoneImpact(zoneId, opts) {
        opts = opts || {};
        var Z = _Z(), z = Z && Z.get(zoneId);
        if (!z) return null;
        var eq = opts.subtree === false ? _arr(z.equipment).slice() : Z.equipmentInSubtree(zoneId);
        return _impact(eq, { zone: { id: z.id, code: z.code || null, name: z.name || '' } });
    }
    // riskImpact(volumeId[, {cadId}]): everything with a confirmed CAD link inside the volume fails.
    function riskImpact(volumeId, opts) {
        opts = opts || {};
        var v = riskVolume(volumeId); if (!v) return null;
        var cadId = opts.cadId || latestCadId();
        var inside = partsInVolume(volumeId, cadId), c = confirmed(cadId);
        var eq = _uniqSorted(inside.filter(function (p) { return c[p.pid]; }).map(function (p) { return c[p.pid]; }));
        var out = _impact(eq, { volume: { id: v.id, kind: v.kind, label: v.label }, cadId: cadId, parts: inside,
                             unlinkedParts: inside.filter(function (p) { return !c[p.pid]; }).map(function (p) { return p.pid; }) });
        var nEst = estimatedParts(cadId).length;
        if (nEst) { var why = nEst + ' part size' + (nEst === 1 ? ' is' : 's are') + ' still being read from the CAD file, so which parts this volume holds is not final'; out.notEvaluated = out.notEvaluated ? out.notEvaluated + '; ' + why : why; out.estimatedParts = nEst; _refusals.push(why); }
        return out;
    }

    // ---- independence (Waqas's AND-gate rule) ------------------------------------------------
    function _leafEquip(n, EI, seenPages, out, seenNodes) {
        if (!n || seenNodes[n.id]) return out; seenNodes[n.id] = 1;
        if (n.type !== 'gate') { var r = EI[String(_lid(n))]; if (r) Object.keys(r.sysIds).forEach(function (s) { out[s] = 1; }); return out; }
        if (n.gateType === 'TRANSFER' || n.transferOutTo) {
            var to = n.transferOutTo || n.linkedPageId;
            if (to != null && !seenPages[to]) { seenPages[to] = 1; var pg = _pageById(to); if (pg && pg.root) _leafEquip(pg.root, EI, seenPages, out, seenNodes); }
            if (n.gateType === 'TRANSFER') return out;
        }
        _kids(n).forEach(function (c) { _leafEquip(c, EI, seenPages, out, seenNodes); });
        return out;
    }
    // The equipment under a node: its own when it is an event, every event's under it when it is a gate, through
    // transfers. 19 Oct 2026: also what an independence claim's member is when the member is a sub-tree.
    function leafEquipment(n) { return Object.keys(_leafEquip(n, eventIndex().byLid, {}, {}, {})).sort(_cmp); }
    // A credited independence claim: the gate carries an independence requirement or a DAL reduction taken on it.
    function _isClaim(g) { return !!(g && (g._independenceReq || g._dalReduced)); }
    // PRA footprints (praData[].affectedZones, zones-3): { id, label, praId, zones:{zoneId:1 for the footprint's
    // zones and every zone inside them} }. An N/A particular risk has no footprint.
    function praFootprints() {
        var Z = _Z(); if (!Z) return [];
        return _arr(_g('praData')).filter(function (p) { return p && p.disposition !== 'na' && Array.isArray(p.affectedZones) && p.affectedZones.length; }).map(function (p) {
            var ext = {};
            p.affectedZones.forEach(function (c) { var z = Z.resolve ? Z.resolve(c) : Z.get(c); if (z) Z.subtree(z.id).forEach(function (x) { ext[x.id] = 1; }); });
            return { id: String(p.praId || p.internalId), label: p.threat || p.praId || 'PRA', praId: p.praId || null, zones: ext };
        }).filter(function (f) { return Object.keys(f.zones).length; });
    }
    function _isIndepGate(g) {
        if (!g || g.type !== 'gate' || !INDEP_GATES[g.gateType]) return false;
        if (g.gateType === 'VOTING') return Math.min(g.votingK || 2, _kids(g).length) >= 2;
        return _kids(g).length >= 2;
    }
    // 19 Oct 2026 (build 7): THE ONE physical independence check. Every AND-like gate (or, with opts.claimsOnly, only
    // the credited claims) against: the same equipment under both inputs, the same zone, nested zones, neighbouring
    // zones without a credited barrier, the same CAD particular-risk volume, and (new) the same PRA footprint
    // (a PRA's affected zones). The physical cross-check that drives CMA findings and the DAL reduction
    // (physical_crosscheck.js) is this check on the credited claims; it no longer has a check of its own.
    function independenceFlags(opts) {
        opts = opts || {};
        var Z = _Z(), cadId = opts.cadId || latestCadId();
        var FP = praFootprints();
        var EI = eventIndex().byLid;
        var eqParts = cadId ? equipmentParts(cadId) : {};
        var parts = cadId ? _partMap(cadId) : {};
        var conf = cadId ? confirmed(cadId) : {};
        // equipment -> risk volumes holding one of its linked parts
        var volsOf = {};
        if (cadId) riskVolumes().forEach(function (v) {
            var c = confirmed(cadId);
            partsInVolume(v.id, cadId).forEach(function (p) { var s = c[p.pid]; if (!s) return; (volsOf[s] = volsOf[s] || {})[v.id] = (volsOf[s][v.id] || []).concat([p.pid]); });
        });
        var flags = {}, order = [];
        function add(key, base, a, b, pidsA, pidsB) {
            var f = flags[key];
            if (!f) { f = flags[key] = base; f._eq = {}; f._pids = {}; order.push(key); }
            f._eq[a] = 1; f._eq[b] = 1;
            (pidsA || []).concat(pidsB || []).forEach(function (p) { f._pids[p] = 1; });
        }
        function nodeRef(n) { return { id: n.id, displayId: n.displayId || null, name: n.name || '' }; }
        _pages().slice().sort(function (a, b) { return _cmp(a.id, b.id); }).forEach(function (pg) {
            (function walk(g, seen) {
                if (!g || seen[g.id]) return; seen[g.id] = 1;
                if (g.type !== 'gate') return;
                if (_isIndepGate(g) && (!opts.claimsOnly || _isClaim(g))) {
                    var kids = _kids(g);
                    var sets = kids.map(function (k) { return Object.keys(_leafEquip(k, EI, {}, {}, {})).sort(_cmp); });
                    for (var i = 0; i < kids.length; i++) for (var j = i + 1; j < kids.length; j++) {
                        sets[i].forEach(function (a) { sets[j].forEach(function (b) {
                            var gate = { id: g.id, displayId: g.displayId || null, name: g.name || '', gateType: g.gateType, claimed: _isClaim(g) };
                            var inputs = [nodeRef(kids[i]), nodeRef(kids[j])];
                            var head = pg.id + '|' + g.id + '|' + kids[i].id + '|' + kids[j].id + '|';
                            var mk = function (kind, severity, zoneId, volumeId) { return { treeId: pg.id, treeName: pg.name || String(pg.id), gateId: g.id, gate: gate, inputs: inputs, kind: kind, severity: severity, zoneId: zoneId || null, volumeId: volumeId || null }; };
                            if (a === b) { add(head + 'same-equipment|' + a, mk('same-equipment', 'violation', Z && Z.zoneOf(a) ? Z.zoneOf(a).id : null, null), a, b, eqParts[a]); return; }
                            var za = Z && Z.zoneOf(a), zb = Z && Z.zoneOf(b);
                            if (za && zb) {
                                if (za.id === zb.id) add(head + 'same-zone|' + za.id, mk('same-zone', 'violation', za.id, null), a, b, eqParts[a], eqParts[b]);
                                else if (Z.isDescendant(za.id, zb.id)) add(head + 'nested-zone|' + zb.id, mk('nested-zone', 'advisory', zb.id, null), a, b, eqParts[a], eqParts[b]);
                                else if (Z.isDescendant(zb.id, za.id)) add(head + 'nested-zone|' + za.id, mk('nested-zone', 'advisory', za.id, null), a, b, eqParts[a], eqParts[b]);
                                else if (za.parentId != null && za.parentId === zb.parentId) {
                                    // 19 Oct 2026: a barrier relieves only with credit (its material on record, a verified requirement on it)
                                    var bar = typeof Z.barrierBetween === 'function' ? Z.barrierBetween(za.id, zb.id) : null;
                                    var cred = bar && (typeof Z.barrierCredit === 'function' ? Z.barrierCredit(bar).credit : bar.substantiated);
                                    if (!cred) add(head + 'sibling-zone|' + za.parentId, mk('sibling-zone', 'advisory', za.parentId, null), a, b, eqParts[a], eqParts[b]);
                                }
                            }
                            var va = volsOf[a] || {}, vb = volsOf[b] || {};
                            Object.keys(va).sort(_cmp).forEach(function (vid) { if (vb[vid]) add(head + 'same-risk-volume|' + vid, mk('same-risk-volume', 'violation', null, vid), a, b, va[vid], vb[vid]); });
                            if (za && zb) FP.forEach(function (fp) { if (fp.zones[za.id] && fp.zones[zb.id]) { var f0 = mk('same-pra-footprint', 'violation', null, null); f0.praId = fp.praId; f0.footprintId = fp.id; f0.footprintLabel = fp.label; add(head + 'same-pra-footprint|' + fp.id, f0, a, b, eqParts[a], eqParts[b]); } });
                        }); });
                    }
                }
                _kids(g).forEach(function (c) { walk(c, seen); });
            })(pg.root, {});
        });
        var out = order.map(function (k) {
            var f = flags[k];
            f.id = k;
            f.equipment = Object.keys(f._eq).sort(_cmp);
            f.parts = Object.keys(f._pids).sort(_cmp).map(function (pid) { var p = parts[pid]; return { pid: pid, name: p ? p.name : pid, sysId: conf[pid] || null }; });
            delete f._eq; delete f._pids;
            var z = f.zoneId && Z ? Z.get(f.zoneId) : null, v = f.volumeId ? riskVolume(f.volumeId) : null;
            f.zoneCode = z ? (z.code || null) : null;
            f.volumeLabel = v ? v.label : null;
            var gname = (f.gate.displayId ? f.gate.displayId + ' ' : '') + (f.gate.name || f.gate.id);
            var inName = function (n) { return n.displayId || n.name || String(n.id); };
            var eqNames = f.equipment.map(function (s) { var x = _sysById(s); return x ? (x.name || s) : s; }).join(', ');
            var partNames = f.parts.length ? ' (parts: ' + f.parts.map(function (p) { return p.name; }).join(', ') + ')' : '';
            var where = f.kind === 'same-risk-volume' ? 'inside the same particular-risk volume ' + (f.volumeLabel || f.volumeId)
                : f.kind === 'same-pra-footprint' ? 'inside the footprint of ' + (f.praId ? f.praId + ' ' : '') + (f.footprintLabel || '')
                : f.kind === 'same-zone' ? 'in the same zone ' + _zoneLabel(z)
                : f.kind === 'nested-zone' ? 'in nested zones inside ' + _zoneLabel(z)
                : f.kind === 'sibling-zone' ? 'in neighboring zones under ' + _zoneLabel(z) + ' with no credited barrier between them'
                : 'under both inputs (one item of equipment)';
            f.text = (f.severity === 'violation' ? 'Independence violated: ' : 'Independence to check: ') + gname + ' (' + f.gate.gateType + ') in ' + f.treeName + ' needs inputs ' + inName(f.inputs[0]) + ' and ' + inName(f.inputs[1]) + ' to be physically independent, but ' + eqNames + partNames + ' sit ' + where + '.';
            return f;
        });
        var sevO = { violation: 0, advisory: 1 };
        out.sort(function (a, b) { return (sevO[a.severity] - sevO[b.severity]) || _cmp(a.treeId, b.treeId) || _cmp(a.gateId, b.gateId) || _cmp(a.inputs[0].id, b.inputs[0].id) || _cmp(a.inputs[1].id, b.inputs[1].id) || _cmp(a.kind, b.kind) || _cmp(a.zoneId || a.volumeId, b.zoneId || b.volumeId); });
        return out;
    }

    // ---- a new CAD revision -------------------------------------------------------------------
    function _bboxChanged(a, b, tol) { for (var i = 0; i < 3; i++) if (Math.abs(a.min[i] - b.min[i]) > tol || Math.abs(a.max[i] - b.max[i]) > tol) return true; return false; }
    function _zsaMatches(row, z) {
        if (!row || !z) return false;
        var ml = row.modelLinks && row.modelLinks.zone;
        if (Array.isArray(ml) && ml.map(String).indexOf(String(z.id)) >= 0) return true;
        var t = _s(row.zoneId).toLowerCase(); if (!t) return false;
        return t === String(z.id).toLowerCase() || (z.code && t === _s(z.code).toLowerCase()) || (z.name && t === _s(z.name).toLowerCase()) || t === _zoneLabel(z).toLowerCase();
    }
    // diffRevision(oldCadId, newCadId[, {tolerance}]): pure. tolerance in mm (default 1) for a
    // centroid shift to count as a move and a box change to count as a resize.
    function diffRevision(oldCadId, newCadId, opts) {
        opts = opts || {};
        var tol = (typeof opts.tolerance === 'number' && opts.tolerance >= 0) ? opts.tolerance : 1;
        var A = _partMap(oldCadId), B = _partMap(newCadId), Z = _Z();
        var res = { from: oldCadId, to: newCadId, fromRevision: (model(oldCadId) || {}).revision || null, toRevision: (model(newCadId) || {}).revision || null, tolerance: tol,
                    added: [], removed: [], moved: [], resized: [], renamed: [], zoneVolumesChanged: [], partsChangedZone: [], affected: { zones: [], equipment: [], zsaRows: [], flags: [], riskVolumes: [] }, review: [] };
        if (!model(oldCadId) || !model(newCadId)) { res.error = 'Both CAD models must exist.'; return res; }
        Object.keys(B).sort(_cmp).forEach(function (pid) { if (!A[pid]) res.added.push(pid); });
        Object.keys(A).sort(_cmp).forEach(function (pid) {
            var a = A[pid], b = B[pid];
            if (!b) { res.removed.push(pid); return; }
            var shift = _len(_sub(b.centroid, a.centroid));
            if (shift > tol) res.moved.push({ pid: pid, shift: _r6(shift), from: a.centroid.slice(), to: b.centroid.slice() });
            else if (_bboxChanged(a.bbox, b.bbox, tol)) res.resized.push({ pid: pid });
            if (a.name !== b.name || (a.partNumber || null) !== (b.partNumber || null)) res.renamed.push({ pid: pid, fromName: a.name, toName: b.name, fromPartNumber: a.partNumber || null, toPartNumber: b.partNumber || null });
        });
        var changed = {}; res.added.concat(res.removed, res.moved.map(function (m) { return m.pid; }), res.resized.map(function (m) { return m.pid; }), res.renamed.map(function (m) { return m.pid; })).forEach(function (p) { changed[p] = 1; });
        var zonesAff = {};
        _zonesSorted().forEach(function (z) {
            var v = z.volume; if (!v || v.kind !== 'parts') return;
            var hit = v.pids.filter(function (pid) { return changed[pid] || (!A[pid] && !B[pid]); });
            if (hit.length) { res.zoneVolumesChanged.push({ zoneId: z.id, pids: hit.slice().sort(_cmp) }); zonesAff[z.id] = 1; }
        });
        var ca = containment(oldCadId), cb = containment(newCadId), za = {}, zb = {};
        ca.parts.forEach(function (r) { za[r.pid] = r.zoneId; }); cb.parts.forEach(function (r) { zb[r.pid] = r.zoneId; });
        _uniqSorted(Object.keys(za).concat(Object.keys(zb))).forEach(function (pid) {
            var f = za[pid] === undefined ? null : za[pid], t = zb[pid] === undefined ? null : zb[pid];
            if (f !== t) res.partsChangedZone.push({ pid: pid, fromZoneId: f, toZoneId: t });
            if (changed[pid] || f !== t) { if (f) zonesAff[f] = 1; if (t) zonesAff[t] = 1; }
        });
        // equipment: confirmed in either model on a changed part, or on a part that changed zone
        var eqAff = {}, cOld = confirmed(oldCadId), cNew = confirmed(newCadId);
        Object.keys(changed).concat(res.partsChangedZone.map(function (x) { return x.pid; })).forEach(function (pid) { if (cOld[pid]) eqAff[cOld[pid]] = 1; if (cNew[pid]) eqAff[cNew[pid]] = 1; });
        // ancestors of an affected zone are affected too (what is inside them changed)
        Object.keys(zonesAff).forEach(function (zid) { var cur = Z && Z.get(zid), g = 0; while (cur && cur.parentId != null && g++ < 1000) { zonesAff[cur.parentId] = 1; cur = Z.get(cur.parentId); } });
        res.affected.zones = Object.keys(zonesAff).sort(function (a, b) { var x = Z && Z.get(a), y = Z && Z.get(b); return _nat(x && x.code, y && y.code) || _cmp(a, b); });
        res.affected.equipment = Object.keys(eqAff).sort(_cmp);
        var zsa = _arr(_g('zsaData'));
        res.affected.zsaRows = _uniqSorted(zsa.filter(function (r) { return r && Z && res.affected.zones.some(function (zid) { return _zsaMatches(r, Z.get(zid)); }); }).map(function (r) { return String(r.internalId); }), _nat);
        res.affected.flags = independenceFlags({ cadId: newCadId }).filter(function (f) {
            return f.equipment.some(function (s) { return eqAff[s]; }) || (f.zoneId && zonesAff[f.zoneId]) || f.parts.some(function (p) { return changed[p.pid]; });
        }).map(function (f) { return f.id; });
        riskVolumes().forEach(function (v) {
            var pa = {}, pb = {}; partsInVolume(v.id, oldCadId).forEach(function (p) { pa[p.pid] = 1; }); partsInVolume(v.id, newCadId).forEach(function (p) { pb[p.pid] = 1; });
            var diff = Object.keys(pa).concat(Object.keys(pb)).some(function (p) { return !pa[p] || !pb[p] || changed[p]; });
            if (diff) res.affected.riskVolumes.push(v.id);
        });
        res.affected.riskVolumes.sort(_nat);
        res.affected.zones.forEach(function (zid) { var z = Z && Z.get(zid); res.review.push({ kind: 'zone', ref: zid, label: _zoneLabel(z), reason: 'contents or volume changed in revision ' + (res.toRevision || newCadId) }); });
        res.affected.zsaRows.forEach(function (id) { var r = zsa.find(function (x) { return x && String(x.internalId) === id; }); res.review.push({ kind: 'zsa', ref: id, label: r ? (r.zoneId || ('#' + id)) : ('#' + id), reason: 'the zone it assesses changed in the new CAD revision' }); });
        res.affected.equipment.forEach(function (s) { var x = _sysById(s); res.review.push({ kind: 'equipment', ref: s, label: x ? (x.name || s) : s, reason: 'one of its CAD parts moved, changed or was removed' }); });
        res.affected.flags.forEach(function (fid) { res.review.push({ kind: 'flag', ref: fid, label: fid, reason: 'an independence finding that involves changed equipment or zones' }); });
        res.affected.riskVolumes.forEach(function (vid) { var v = riskVolume(vid); res.review.push({ kind: 'risk', ref: vid, label: v ? v.label : vid, reason: 'the parts inside this particular-risk volume changed' }); });
        return res;
    }
    // markForReview(diff, by[, {at}]): the one write a re-import makes. The review list goes into
    // projectConfig.cadReviews inside one change-acknowledgement group (SLChangeAck.batch), with a
    // plain-words note (SLChangeAck.describe) naming what it touches, so the engineer sees and
    // acknowledges it like any other change. Returns the record (or a promise of the batch result
    // when the acknowledgement module is loaded).
    function markForReview(d, by, opts) {
        opts = opts || {};
        if (!d || d.error) return { ok: false, err: (d && d.error) || 'No revision difference given.' };
        if (!_s(by)) return { ok: false, err: 'A review needs the name of who imported the revision.' };
        var pc = _pc();
        var write = function () {
            if (!Array.isArray(pc.cadReviews)) pc.cadReviews = [];
            pc.cadReviewSeq = (pc.cadReviewSeq || 0) + 1;
            var rec = { id: 'cadrev-' + pc.cadReviewSeq, fromCadId: d.from, toCadId: d.to, fromRevision: d.fromRevision, toRevision: d.toRevision, by: _s(by), at: opts.at || new Date().toISOString(), status: 'open',
                        counts: { added: d.added.length, removed: d.removed.length, moved: d.moved.length, resized: d.resized.length, renamed: d.renamed.length },
                        items: d.review.map(function (i) { return { kind: i.kind, ref: i.ref, label: i.label, reason: i.reason, status: 'open' }; }) };
            pc.cadReviews.push(rec);
            var CA = root.SLChangeAck;
            try {
                if (CA && typeof CA.describe === 'function') CA.describe({ summary: 'CAD revision ' + (d.toRevision || d.to) + ' replaces ' + (d.fromRevision || d.from) + ': ' + rec.counts.added + ' added, ' + rec.counts.removed + ' removed, ' + rec.counts.moved + ' moved; ' + rec.items.length + ' item' + (rec.items.length === 1 ? '' : 's') + ' to review',
                    refs: rec.items.map(function (i) { return { kind: i.kind, id: i.ref, label: i.label }; }) });
            } catch (_) {}
            _save();
            return rec;
        };
        var CA = root.SLChangeAck;
        if (CA && typeof CA.batch === 'function') { var holder = {}; var p = CA.batch('CAD revision ' + (d.toRevision || d.to) + ' imported: review what it changed', function () { holder.rec = write(); return holder.rec; }); return { ok: true, review: holder.rec, decision: p }; }
        return { ok: true, review: write() };
    }
    function openReviews() { return _arr(_pc().cadReviews).filter(function (r) { return r && r.status === 'open'; }).map(_clone); }
    function closeReviewItem(reviewId, kind, ref, by, opts) {
        opts = opts || {};
        if (!_s(by)) return { ok: false, err: 'Closing a review item needs the name of who reviewed it.' };
        var r = _arr(_pc().cadReviews).find(function (x) { return x && x.id === reviewId; }); if (!r) return { ok: false, err: 'not found' };
        var it = r.items.find(function (i) { return i.kind === kind && String(i.ref) === String(ref); }); if (!it) return { ok: false, err: 'item not found' };
        it.status = 'reviewed'; it.by = _s(by); it.at = opts.at || new Date().toISOString();
        if (r.items.every(function (i) { return i.status === 'reviewed'; })) r.status = 'closed';
        _save();
        return { ok: true };
    }

    // ---- what an AI drafting lane may see -----------------------------------------------------
    // Part names, paths, part numbers, bounding boxes, zone codes, containment, clearances and
    // impact results. Never centroids or any other geometry, never the file name, hash or content,
    // never who/when. Built field by field from a whitelist, so a field added to the stored model
    // later cannot leak through.
    function aiPayload(cadId, opts) {
        opts = opts || {};
        cadId = cadId || latestCadId();
        var m = model(cadId), Z = _Z();
        if (!m) return null;
        var zoneCode = function (id) { var z = id && Z ? Z.get(id) : null; return z ? (z.code || z.name || null) : null; };
        var c = confirmed(cadId), cont = containment(cadId), cl = clearances(cadId, { threshold: opts.threshold });
        var b6 = function (b) { return { min: b.min.map(_r6), max: b.max.map(_r6) }; };
        var payload = {
            schema: 'cad-ai-1', revision: m.revision || null, units: 'mm',
            parts: _partsSorted(cadId).map(function (p) { return { pid: String(p.pid), name: String(p.name), partNumber: p.partNumber == null ? null : String(p.partNumber), path: _arr(p.path).map(String), bbox: b6(p.bbox), equipment: c[p.pid] ? String(c[p.pid]) : null }; }),
            zones: _zonesSorted().map(function (z) { return { code: z.code || null, name: z.name || '', parentCode: zoneCode(z.parentId) }; }),
            containment: cont.parts.map(function (r) { return { pid: String(r.pid), zone: zoneCode(r.zoneId) }; }),
            straddling: cont.straddling.map(function (s) { return { pid: String(s.pid), zone: zoneCode(s.zoneId), crosses: s.crosses.map(zoneCode) }; }),
            clearances: cl.pairs.map(function (p) { return { pidA: p.pidA, pidB: p.pidB, distance: p.distance }; }),
            impacts: _zonesSorted().map(function (z) {
                var im = zoneImpact(z.id);
                return { zone: z.code || z.name || null, equipment: im.equipment.map(function (e) { return e.name; }),
                         conditions: im.conditions.map(function (x) { return { fcId: x.fcId, description: x.desc, severity: x.severity }; }) };
            }).filter(function (x) { return x.equipment.length; })
        };
        return payload;
    }

    var api = {
        VERSION: VERSION, RULES: RULES, KINDS: KINDS, SHAPES: SHAPES, FRAGMENTS: FRAGMENTS, DEFAULT_FRAGMENT: DEFAULT_FRAGMENT,
        models: models, model: model, latestCadId: latestCadId, addCadModel: addCadModel, partsOf: partsOf, registerLocalParts: registerLocalParts, updatePartBoxes: updatePartBoxes, estimatedParts: estimatedParts, hasLocalParts: hasLocalParts, LOCAL_PARTS_MIN: LOCAL_PARTS_MIN,
        matchEquipment: matchEquipment, applyExactLinks: applyExactLinks, confirmLink: confirmLink, rejectLink: rejectLink, unlink: unlink,
        link: link, linkKey: linkKey, confirmed: confirmed, equipmentParts: equipmentParts, carryLinks: carryLinks,
        importZoneList: importZoneList, containment: containment, applyContainment: applyContainment, clearances: clearances, boxDistance: boxDistance,
        riskVolumes: riskVolumes, riskVolume: riskVolume, addRiskVolume: addRiskVolume, removeRiskVolume: removeRiskVolume, shapeIssue: shapeIssue, inShape: inShape, spreadOf: spreadOf, partsInVolume: partsInVolume,
        equipmentOfEvent: equipmentOfEvent, eventIndex: eventIndex, evaluate: evaluate, sevRank: sevRank,
        zoneImpact: zoneImpact, riskImpact: riskImpact, independenceFlags: independenceFlags, leafEquipment: leafEquipment, praFootprints: praFootprints,
        diffRevision: diffRevision, markForReview: markForReview, openReviews: openReviews, closeReviewItem: closeReviewItem,
        aiPayload: aiPayload,
        // 14 Oct 2026 (p3-pra): the same evaluation for a given set of failed equipment, used by the
        // release-angle sweep and the per-function risk view (SLPraModels).
        impactOfEquipment: function (sysIds, extra) { return _impact(_arr(sysIds), extra); },
        takeRefusals: function () { var r = _refusals.slice(); _refusals.length = 0; return r; },
        takeNonMonotone: function () { var r = _nmSeen.slice(); _nmSeen.length = 0; return r; },
        // notEvaluatedHtml(reason): the one warning shown wherever a severity could not be evaluated
        notEvaluatedHtml: function (reason) { return '<div data-not-evaluated role="alert" style="color:var(--color-danger,#8E2A2A);background:rgba(201,42,42,0.08);border:1px solid var(--color-danger,#8E2A2A);border-radius:4px;padding:4px 8px;font-size:12px;font-weight:600;margin:4px 0;">Not evaluated: ' + String(reason || 'no result').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }) + '</div>'; }, NONMONO_BOUND: NONMONO_BOUND
    };
    try { root.SLCadZonal = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
