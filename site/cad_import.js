// ============================================================================
// cad_import.js, v1.3 (1.2 designators from STEP instance names; 1.3 a worker that cannot start is reported): CAD import for the CAD Model page (13 Oct 2026).
//
// WHAT IT DOES. Reads a neutral STEP file (AP203 / AP214 / AP242) from any CAD
// tool and turns it into display meshes plus a small parts list, ON THIS
// COMPUTER. CAD files are export controlled, so the rule this module exists to
// keep is simple:
//
//   * the file and its geometry NEVER leave the customer's machine. Parsing and
//     meshing run in a Web Worker (cad_import_worker.js) on the OpenCascade WASM
//     build (vendor/occt, occt-import-js 0.0.23, LGPL-2.1, loaded unmodified as
//     its own file). Nothing here calls fetch, XMLHttpRequest, WebSocket or
//     sendBeacon with file bytes or geometry.
//   * meshes are cached locally in IndexedDB (database 'sl-cad', store
//     'meshes', key = the file's sha256). They never go into projectConfig,
//     which syncs to the cloud.
//   * only METADATA goes into the project (the shared contract):
//       projectConfig.cadModels = [{ id:'cad-<n>', fileName, sha256, revision,
//         importedAt, units:'mm', parts:[{ pid, name, partNumber|null,
//         path:[...assembly names...], bbox:{min:[x,y,z],max:[x,y,z]},
//         centroid:[x,y,z], designator? }] }]
//     designator (optional) is the installed copy's tag, read from the STEP
//     instance name (NEXT_ASSEMBLY_USAGE_OCCURRENCE) when it is a real name.
//     projectEntry() builds exactly those fields from a whitelist, addToProject()
//     refuses anything that still carries geometry and hands the rest to the one
//     writer, SLCadZonal.addCadModel (cad_zonal.js).
//
// PART IDENTITY. pid = 'p:' + the assembly path + the part name + '#' + the
// occurrence number of that name under that assembly (1, 2, ...). The same
// STEP file always gives the same pids. path holds the assembly names above the
// part (not the part itself).
//
// UNITS. OpenCascade converts every length to millimeters (linearUnit), so a
// file authored in meters or inches comes out in mm. stepLengthUnit() reports
// what the file said, for the record only.
//
// ZONE LISTS. readZoneFile() reads a CSV or Excel zone list (vendor/xlsx) into
// rows { code, name, parentCode, xMin, yMin, zMin, xMax, yMax, zMax } (mm) and
// handZones() gives them to SLCadZonal.importZoneList when that engine exists.
//
// Shared by the page (window.SLCadImport), the worker (self.SLCadImport) and the
// node tests (module.exports). No eval, no Function constructor.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.3';
    var DB_NAME = 'sl-cad', DB_STORE = 'meshes', DB_VERSION = 1;
    var START_MS = 20000;   // the worker's first message (it comes before any parsing) must arrive within this
    var OCCT_DIR = 'vendor/occt/';
    // Display budget. A part above this is reduced by vertex clustering; the
    // total budget scales each part's share down for very large aircraft.
    var DEFAULTS = { maxTrianglesPerPart: 250000, maxTrianglesTotal: 6000000, linearDeflection: 0.001, angularDeflection: 0.5 };

    // ------------------------------------------------------------ STEP text
    function decodeStepString(s) {
        // STEP strings: '' is a quote, \X2\hhhh...\X0\ is UTF-16, \X\hh is a byte, \S\c is c+128.
        s = String(s == null ? '' : s).replace(/''/g, "'");
        s = s.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, function (_, hex) {
            var out = '';
            for (var i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
            return out;
        });
        s = s.replace(/\\X\\([0-9A-Fa-f]{2})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
        s = s.replace(/\\S\\(.)/g, function (_, c) { return String.fromCharCode(c.charCodeAt(0) + 128); });
        return s;
    }
    function bytesToText(bytes) {
        var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (typeof TextDecoder === 'function') { try { return new TextDecoder('latin1').decode(u8); } catch (_) {} }
        var out = '', CH = 32768;
        for (var i = 0; i < u8.length; i += CH) out += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
        return out;
    }
    // Every PRODUCT('id','name',...) entity. PRODUCT_DEFINITION and friends are
    // excluded by requiring the open bracket right after the word.
    function parseStepProducts(text) {
        var re = /=\s*PRODUCT\s*\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'/g, m, out = [];
        while ((m = re.exec(text))) out.push({ id: decodeStepString(m[1]).trim(), name: decodeStepString(m[2]).trim() });
        return out;
    }
    // Instance names: NEXT_ASSEMBLY_USAGE_OCCURRENCE('id','name',...,#parentPD,#childPD,...).
    // The name of an installed copy (ENGINE_L, FCC-1) is very often its reference designator,
    // and a designator is the only thing that links a part to equipment by itself (founder
    // ruling, 13 Oct 2026: a link is to one installed copy, never to a part number). Returns
    // { '<parent product label>\u0002<child product label>': [instance names in file order] }.
    var S_ = "'((?:[^']|'')*)'";
    function parseStepInstances(text) {
        var t = text || '', m;
        var prodLabel = {}, pdfProd = {}, pdPdf = {}, out = {};
        var reP = new RegExp('#(\\d+)\\s*=\\s*PRODUCT\\s*\\(\\s*' + S_ + '\\s*,\\s*' + S_, 'g');
        while ((m = reP.exec(t))) { var id = decodeStepString(m[2]).trim(), nm = decodeStepString(m[3]).trim(); prodLabel[m[1]] = nm || id; }
        var reF = new RegExp('#(\\d+)\\s*=\\s*PRODUCT_DEFINITION_FORMATION(?:_WITH_SPECIFIED_SOURCE)?\\s*\\(\\s*' + S_ + '\\s*,\\s*' + S_ + '\\s*,\\s*#(\\d+)', 'g');
        while ((m = reF.exec(t))) pdfProd[m[1]] = m[4];
        var reD = new RegExp('#(\\d+)\\s*=\\s*PRODUCT_DEFINITION\\s*\\(\\s*' + S_ + '\\s*,\\s*' + S_ + '\\s*,\\s*#(\\d+)', 'g');
        while ((m = reD.exec(t))) pdPdf[m[1]] = m[4];
        var label = function (pd) { var f = pdPdf[pd]; var pr = f && pdfProd[f]; return pr ? prodLabel[pr] : null; };
        var reN = new RegExp('#(\\d+)\\s*=\\s*NEXT_ASSEMBLY_USAGE_OCCURRENCE\\s*\\(\\s*' + S_ + '\\s*,\\s*' + S_ + '\\s*,\\s*(?:' + S_ + '|\\$)\\s*,\\s*#(\\d+)\\s*,\\s*#(\\d+)', 'g');
        var rows = [];
        while ((m = reN.exec(t))) rows.push({ n: +m[1], name: decodeStepString(m[3]).trim(), parent: label(m[5]), child: label(m[6]) });
        rows.sort(function (a, b) { return a.n - b.n; });
        rows.forEach(function (r) { if (r.parent == null || r.child == null) return; var k = r.parent + '\u0002' + r.child; (out[k] = out[k] || []).push(r.name); });
        return out;
    }
    // A usable designator: not empty, not a bare number or NAUO counter, not the product's own
    // name (ignoring case and separators), and not a CAD tool's default copy name ("Bracket.2").
    function _sq(v) { return String(v || '').toLowerCase().replace(/[\s_\-.\/]+/g, ''); }
    function designatorFrom(instanceName, productName) {
        var n = String(instanceName || '').trim();
        if (!n || /^(nauo)?\d+$/i.test(n)) return null;
        if (_sq(n) === _sq(productName)) return null;
        var base = n.replace(/[\s._\-:]*\d+$/, '');
        if (base && _sq(base) === _sq(productName)) return null;
        return n;
    }
    function stepSchema(text) {
        var m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(text || '');
        var s = m ? m[1] : '';
        if (/AP242|MANAGED_MODEL_BASED_3D_ENGINEERING|10303\s*442/i.test(s)) return 'AP242';
        if (/AUTOMOTIVE_DESIGN|10303\s*214/i.test(s)) return 'AP214';
        if (/CONFIG_CONTROL_DESIGN|10303\s*203/i.test(s)) return 'AP203';
        return s ? s : 'unknown';
    }
    function stepLengthUnit(text) {
        var t = text || '';
        var conv = /CONVERSION_BASED_UNIT\s*\(\s*'([^']*)'[^;]*;?/i.exec(t);
        var si = /LENGTH_UNIT\s*\(\s*\)[^;]*SI_UNIT\s*\(\s*(\.[A-Z]+\.|\$)\s*,\s*\.METRE\.\s*\)/i.exec(t);
        if (si) {
            var p = si[1].toUpperCase();
            return p === '.MILLI.' ? 'mm' : p === '.CENTI.' ? 'cm' : p === '.KILO.' ? 'km' : p === '$' ? 'm' : p.replace(/\./g, '').toLowerCase() + 'm';
        }
        if (conv) return conv[1].toLowerCase();
        return 'unknown';
    }
    function productIndex(products) {
        var by = {};
        (products || []).forEach(function (p) {
            var k = p.name || p.id; if (!k) return;
            if (!(k in by)) by[k] = p.id || null;
            else if (by[k] !== p.id) by[k] = undefined;     // two products, one name: ambiguous
        });
        return by;
    }

    // ------------------------------------------------------------ geometry helpers
    function bboxOf(pos) {
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (var i = 0; i + 2 < pos.length; i += 3) {
            for (var j = 0; j < 3; j++) { var v = pos[i + j]; if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; }
        }
        if (!(mn[0] <= mx[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
        return { min: mn, max: mx };
    }
    // Area-weighted centroid of the surface; the bbox center if the area is zero.
    function centroidOf(pos, idx, bbox) {
        var cx = 0, cy = 0, cz = 0, A = 0;
        var n = idx ? idx.length : pos.length / 3;
        for (var t = 0; t + 2 < n; t += 3) {
            var a = (idx ? idx[t] : t) * 3, b = (idx ? idx[t + 1] : t + 1) * 3, c = (idx ? idx[t + 2] : t + 2) * 3;
            var ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
            var vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
            var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            var ar = Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
            if (!(ar > 0)) continue;
            A += ar;
            cx += ar * (pos[a] + pos[b] + pos[c]) / 3; cy += ar * (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3; cz += ar * (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
        }
        if (A > 0) return [cx / A, cy / A, cz / A];
        return [(bbox.min[0] + bbox.max[0]) / 2, (bbox.min[1] + bbox.max[1]) / 2, (bbox.min[2] + bbox.max[2]) / 2];
    }
    // Own, exactly-sized buffers: each one is transferred out of the worker on
    // its own, so a view onto a shared (e.g. WASM) buffer is copied first.
    function _own(a, T) { return (a instanceof T && a.byteOffset === 0 && a.buffer.byteLength === a.byteLength) ? a : new T(a || []); }
    function toF32(a) { return _own(a, Float32Array); }
    function toU32(a) { return _own(a, Uint32Array); }

    // Vertex clustering: snap vertices to a grid, merge each cell into one
    // vertex (the cell average), drop triangles that collapse. The grid is made
    // coarser until the part is under its triangle target. Normals are dropped
    // (the viewer recomputes them). Pure; the input is not touched.
    function decimate(position, index, targetTris) {
        var tris = index.length / 3;
        if (!(targetTris > 0) || tris <= targetTris) return { position: position, index: index, decimated: false };
        var bb = bboxOf(position);
        var ext = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) || 1;
        var res = Math.max(8, Math.min(2048, Math.round(Math.sqrt(targetTris) * 1.5)));
        var best = null;
        for (var pass = 0; pass < 24; pass++) {
            var cell = ext / res;
            var map = new Map(), sums = [], remap = new Uint32Array(position.length / 3);
            for (var v = 0; v < remap.length; v++) {
                var x = position[v * 3], y = position[v * 3 + 1], z = position[v * 3 + 2];
                var key = Math.floor((x - bb.min[0]) / cell) + ',' + Math.floor((y - bb.min[1]) / cell) + ',' + Math.floor((z - bb.min[2]) / cell);
                var id = map.get(key);
                if (id === undefined) { id = sums.length / 4; map.set(key, id); sums.push(0, 0, 0, 0); }
                sums[id * 4] += x; sums[id * 4 + 1] += y; sums[id * 4 + 2] += z; sums[id * 4 + 3] += 1;
                remap[v] = id;
            }
            var out = [], seen = new Set();
            for (var t = 0; t < index.length; t += 3) {
                var a = remap[index[t]], b = remap[index[t + 1]], c = remap[index[t + 2]];
                if (a === b || b === c || a === c) continue;
                var s = [a, b, c].sort(function (p, q) { return p - q; }).join(',');
                if (seen.has(s)) continue;
                seen.add(s); out.push(a, b, c);
            }
            best = { sums: sums, out: out };
            if (out.length / 3 <= targetTris) break;
            res = Math.max(2, Math.floor(res * 0.75));
        }
        var nv = best.sums.length / 4, pos = new Float32Array(nv * 3);
        for (var i = 0; i < nv; i++) { var k = best.sums[i * 4 + 3]; pos[i * 3] = best.sums[i * 4] / k; pos[i * 3 + 1] = best.sums[i * 4 + 1] / k; pos[i * 3 + 2] = best.sums[i * 4 + 2] / k; }
        return { position: pos, index: new Uint32Array(best.out), decimated: true };
    }

    // ------------------------------------------------------------ model build
    function encSeg(s) { return String(s).replace(/%/g, '%25').replace(/\//g, '%2F').replace(/#/g, '%23'); }
    function makePid(path, name, occ) { return 'p:' + path.concat([name]).map(encSeg).join('/') + '#' + occ; }

    // occt result -> { parts (metadata), meshes (geometry, keyed by pid) }.
    // occt puts each leaf part occurrence as a mesh on its parent assembly node,
    // with the placement already applied; that is our unit of "a part".
    function buildModel(res, opts) {
        opts = opts || {};
        var pidx = opts.productIndex || {};
        var maxPart = opts.maxTrianglesPerPart != null ? opts.maxTrianglesPerPart : DEFAULTS.maxTrianglesPerPart;
        var maxTotal = opts.maxTrianglesTotal != null ? opts.maxTrianglesTotal : DEFAULTS.maxTrianglesTotal;
        var meshesIn = (res && res.meshes) || [];
        var totalIn = 0;
        meshesIn.forEach(function (m) { totalIn += ((m.index && m.index.array) ? m.index.array.length : 0) / 3; });
        var scale = (maxTotal > 0 && totalIn > maxTotal) ? maxTotal / totalIn : 1;
        var parts = [], meshes = [], counters = {}, occOf = [], decimatedParts = 0, trianglesOut = 0, n = 0;
        var total = meshesIn.length || 1;
        (function walk(node, path) {
            if (!node) return;
            var nm = String(node.name || '').trim();
            var childPath = nm ? path.concat([nm]) : path;
            var leaf = !(node.children && node.children.length);
            (node.meshes || []).forEach(function (mi) {
                var m = meshesIn[mi]; if (!m) return;
                var name = String(m.name || node.name || 'Part').trim() || 'Part';
                // occt shows a part two ways: as its own leaf node carrying its
                // mesh (the part IS the node), or as a mesh hung on its parent
                // assembly (instances, placement applied). The path differs.
                var partPath = (leaf && (!m.name || name === nm)) ? path : childPath;
                var key = partPath.join('\u0001') + '\u0002' + name;
                var occ = counters[key] = (counters[key] || 0) + 1;
                var pid = makePid(partPath, name, occ);
                var pos = toF32(m.attributes && m.attributes.position && m.attributes.position.array);
                var idx = toU32(m.index && m.index.array);
                var nrm = (m.attributes && m.attributes.normal && m.attributes.normal.array) ? toF32(m.attributes.normal.array) : null;
                var tris = idx.length / 3;
                var target = Math.min(maxPart > 0 ? maxPart : Infinity, Math.max(2000, Math.floor(tris * scale)));
                if (tris > target) {
                    var d = decimate(pos, idx, target);
                    if (d.decimated) { pos = d.position; idx = d.index; nrm = null; decimatedParts++; }
                }
                trianglesOut += idx.length / 3;
                var bbox = bboxOf(pos);
                var pn = Object.prototype.hasOwnProperty.call(pidx, name) ? pidx[name] : null;
                parts.push({ pid: pid, name: name, partNumber: (pn == null || pn === '') ? null : String(pn), path: partPath.slice(), bbox: bbox, centroid: centroidOf(pos, idx, bbox) });
                occOf.push({ key: key, parent: partPath.length ? partPath[partPath.length - 1] : null, occ: occ });
                meshes.push({ pid: pid, position: pos, normal: nrm, index: idx, color: Array.isArray(m.color) ? m.color.slice(0, 3) : null });
                n++;
                if (opts.onProgress) { try { opts.onProgress('mesh', n / total); } catch (_) {} }
            });
            (node.children || []).forEach(function (c) { walk(c, childPath); });
        })(res && res.root, []);
        // Instance names, matched occurrence by occurrence, only where the STEP file lists exactly as
        // many copies of that part under that assembly as OpenCascade produced (so the order is
        // the same list); otherwise no designator is guessed.
        var inst = opts.instances || {}, designators = 0;
        parts.forEach(function (p, i) {
            var o = occOf[i]; if (!o.parent) return;
            var list = inst[o.parent + '\u0002' + p.name];
            if (!list || list.length !== counters[o.key]) return;
            var d = designatorFrom(list[o.occ - 1], p.name);
            if (d) { p.designator = d; designators++; }
        });
        return { parts: parts, meshes: meshes, stats: { parts: parts.length, trianglesIn: totalIn, trianglesOut: trianglesOut, decimatedParts: decimatedParts, designators: designators } };
    }

    // The core path: STEP bytes + an initialised occt module -> model.
    // The worker calls this; so do the node tests (no worker shell in between).
    function convertStep(bytes, occt, opts) {
        opts = opts || {};
        var prog = function (ph, f) { if (opts.onProgress) { try { opts.onProgress(ph, f); } catch (_) {} } };
        var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        prog('scan', 0);
        var text = bytesToText(u8);
        if (!/ISO-10303-21/.test(text.slice(0, 2000))) throw new Error('This is not a STEP file (the ISO-10303-21 header is missing).');
        var schema = stepSchema(text), sourceUnit = stepLengthUnit(text);
        var pidx = productIndex(parseStepProducts(text));
        var instances = parseStepInstances(text);
        text = null;
        prog('parse', 0);
        var res = occt.ReadStepFile(u8, {
            linearUnit: 'millimeter',
            linearDeflectionType: 'bounding_box_ratio',
            linearDeflection: opts.linearDeflection || DEFAULTS.linearDeflection,
            angularDeflection: opts.angularDeflection || DEFAULTS.angularDeflection
        });
        if (!res || !res.success) throw new Error('OpenCascade could not read this STEP file.');
        prog('parse', 1);
        var model = buildModel(res, { productIndex: pidx, instances: instances, maxTrianglesPerPart: opts.maxTrianglesPerPart, maxTrianglesTotal: opts.maxTrianglesTotal, onProgress: opts.onProgress });
        model.schema = schema; model.sourceUnit = sourceUnit; model.units = 'mm';
        return model;
    }

    // ------------------------------------------------------------ project metadata
    function r3(v) { return Math.round(v * 1000) / 1000; }
    function v3(a) { return [r3(+a[0] || 0), r3(+a[1] || 0), r3(+a[2] || 0)]; }
    // Exactly the contract fields, rebuilt from a whitelist. Nothing else from
    // the model (meshes, stats, buffers) can ride along.
    function projectEntry(model, info) {
        info = info || {};
        return {
            id: info.id || null,
            fileName: String(info.fileName || ''),
            sha256: String(info.sha256 || ''),
            revision: info.revision == null ? 1 : info.revision,
            importedAt: info.importedAt || new Date().toISOString(),
            units: 'mm',
            parts: ((model && model.parts) || []).map(function (p) {
                var q = { pid: String(p.pid), name: String(p.name), partNumber: p.partNumber == null ? null : String(p.partNumber), path: (p.path || []).map(String), bbox: { min: v3(p.bbox.min), max: v3(p.bbox.max) }, centroid: v3(p.centroid) };
                if (p.designator) q.designator = String(p.designator);   // optional: the installed copy's tag from the STEP instance name
                return q;
            })
        };
    }
    // True when anything in obj looks like geometry: a typed array or buffer, a
    // numeric array longer than a coordinate, or a mesh-shaped key.
    var GEOM_KEYS = { position: 1, positions: 1, normal: 1, normals: 1, index: 1, indices: 1, meshes: 1, vertices: 1, triangles: 1, buffer: 1, bytes: 1, step: 1, stepText: 1, fileBytes: 1 };
    function containsGeometry(obj) {
        var seen = [];
        return (function look(o) {
            if (o == null || typeof o !== 'object') return false;
            if (seen.indexOf(o) >= 0) return false; seen.push(o);
            if (typeof ArrayBuffer !== 'undefined' && (o instanceof ArrayBuffer || ArrayBuffer.isView(o))) return true;
            if (Array.isArray(o)) {
                if (o.length > 3 && o.every(function (x) { return typeof x === 'number'; })) return true;
                return o.some(look);
            }
            for (var k in o) {
                if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
                if (GEOM_KEYS[k]) return true;
                if (look(o[k])) return true;
            }
            return false;
        })(obj);
    }
    function _pc() {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get('projectConfig'); if (v) return v; } } catch (_) {}
        if (typeof projectConfig !== 'undefined' && projectConfig) return projectConfig;   // eslint-disable-line no-undef
        return root.projectConfig || null;
    }
    // ONE path into projectConfig.cadModels: the zonal engine's addCadModel (cad_zonal.js,
    // SLCadZonal), which validates the metadata and assigns the 'cad-<n>' id. This module only
    // builds the contract fields from its whitelist, refuses geometry, and numbers the revision
    // (per file name). Without the engine nothing is written.
    function _engine() { var E = root.SLCadZonal; return (E && typeof E.addCadModel === 'function') ? E : null; }
    function _models() { var pc = _pc(); return (pc && Array.isArray(pc.cadModels)) ? pc.cadModels : []; }
    function nextRevision(fileName) {
        var rev = 0;
        _models().forEach(function (m) { if (m && m.fileName === fileName && isFinite(+m.revision)) rev = Math.max(rev, +m.revision); });
        return String(rev + 1);
    }
    function addToProject(model, info) {
        var E = _engine();
        if (!E) throw new Error('The CAD and zonal engine (cad_zonal.js) is not loaded, so the model was not added to the project.');
        info = info || {};
        var entry = projectEntry(model, Object.assign({}, info, { revision: nextRevision(info.fileName) }));
        if (containsGeometry(entry)) throw new Error('Refused: the CAD metadata still carries geometry.');
        delete entry.id;   // the engine assigns it
        var r = E.addCadModel(entry);
        if (!r || !r.ok) throw new Error('The CAD model was not added: ' + ((r && r.issues) || []).join(' '));
        return r.model;
    }
    // A later revision of a file already in the project: carry the confirmed equipment links
    // where a part kept its id and part number, work out what changed, and put the review list
    // in front of the engineer (SLCadZonal.markForReview, one change-acknowledgement group).
    function _who() { try { if (typeof root._signoffReviewerName === 'function') return root._signoffReviewerName() || ''; } catch (_) {} return ''; }
    function reviseFrom(entry, by) {
        var E = root.SLCadZonal;
        if (!E || typeof E.diffRevision !== 'function') return null;
        var prev = null;
        _models().forEach(function (m) { if (m && m !== entry && m.id !== entry.id && m.fileName === entry.fileName) prev = m; });
        if (!prev) return null;
        by = by || _who() || 'CAD import';
        var carried = typeof E.carryLinks === 'function' ? E.carryLinks(prev.id, entry.id, by) : null;
        var diff = E.diffRevision(prev.id, entry.id);
        var mark = typeof E.markForReview === 'function' ? E.markForReview(diff, by) : null;
        return { from: prev.id, to: entry.id, carried: carried, diff: diff, review: mark && mark.review ? mark.review : null };
    }
    function getModel(cadId, pc) {
        pc = pc || _pc();
        var list = (pc && Array.isArray(pc.cadModels)) ? pc.cadModels : [];
        return list.find(function (m) { return m && m.id === cadId; }) || null;
    }
    function latestModel(pc) {
        pc = pc || _pc();
        var list = (pc && Array.isArray(pc.cadModels)) ? pc.cadModels : [];
        return list.length ? list[list.length - 1] : null;
    }

    // ------------------------------------------------------------ sha256
    function sha256Hex(buf) {
        var c = root.crypto || (typeof crypto !== 'undefined' ? crypto : null);   // eslint-disable-line no-undef
        if (!c || !c.subtle) return Promise.reject(new Error('This browser cannot compute a file fingerprint (Web Crypto is missing).'));
        return c.subtle.digest('SHA-256', buf).then(function (h) {
            var a = new Uint8Array(h), s = '';
            for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16);
            return s;
        });
    }

    // ------------------------------------------------------------ IndexedDB cache
    var _dbp = null;
    function _idb() { return root.indexedDB || (typeof indexedDB !== 'undefined' ? indexedDB : null); }   // eslint-disable-line no-undef
    function openDb() {
        if (_dbp) return _dbp;
        var idb = _idb();
        if (!idb) return Promise.reject(new Error('This browser has no local database (IndexedDB) for CAD geometry.'));
        _dbp = new Promise(function (resolve, reject) {
            var rq = idb.open(DB_NAME, DB_VERSION);
            rq.onupgradeneeded = function () { var db = rq.result; if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE); };
            rq.onsuccess = function () { resolve(rq.result); };
            rq.onerror = function () { _dbp = null; reject(rq.error || new Error('Could not open the local CAD cache.')); };
        });
        return _dbp;
    }
    function _tx(mode, fn) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(DB_STORE, mode), st = tx.objectStore(DB_STORE), out;
                var rq = fn(st);
                if (rq) rq.onsuccess = function () { out = rq.result; };
                tx.oncomplete = function () { resolve(out); };
                tx.onerror = tx.onabort = function () { reject(tx.error || new Error('Local CAD cache error.')); };
            });
        });
    }
    function cachePut(sha, payload) { return _tx('readwrite', function (st) { return st.put(payload, sha); }); }
    function cacheGet(sha) { return _tx('readonly', function (st) { return st.get(sha); }).then(function (v) { return v || null; }); }
    function cacheHas(sha) { return _tx('readonly', function (st) { return st.count(sha); }).then(function (n) { return n > 0; }); }

    // ------------------------------------------------------------ worker client
    function workerUrl() { return 'cad_import_worker.js?v=' + VERSION; }
    // Read a STEP file on this computer in the worker. Returns { promise, cancel }.
    // promise -> { sha256, model } with model = { parts, meshes, stats, schema, sourceUnit, units }.
    // opts.expectSha: refuse (before parsing) a file whose fingerprint differs.
    function runWorker(file, opts) {
        opts = opts || {};
        var w = null, done = false, rejectFn = null, startTimer = null;
        var promise = new Promise(function (resolve, reject) {
            rejectFn = reject;
            Promise.resolve(file.arrayBuffer ? file.arrayBuffer() : file).then(function (buf) {
                if (done) return;
                try { w = new Worker(workerUrl()); }
                catch (e0) { done = true; var e1 = new Error('The STEP reader could not start in this window (' + ((e0 && e0.message) || e0) + ').'); e1.code = 'worker-blocked'; reject(e1); return; }
                // A worker refused by a security policy may never start and never report an error.
                // The worker answers at once (its first progress message comes before any parsing),
                // so silence for START_MS means it is not running: say so instead of waiting forever.
                startTimer = setTimeout(function () {
                    if (done) return; done = true; try { w.terminate(); } catch (_) {}
                    var e2 = new Error('The STEP reader did not start. This window may be blocking its background worker (check the app\'s security policy for worker-src).'); e2.code = 'worker-blocked'; reject(e2);
                }, opts.startMs || START_MS);
                w.onmessage = function (ev) {
                    clearTimeout(startTimer);
                    var d = ev.data || {};
                    if (d.type === 'progress') { if (opts.onProgress) { try { opts.onProgress(d.phase, d.frac); } catch (_) {} } return; }
                    done = true; try { w.terminate(); } catch (_) {}
                    if (d.type === 'result') resolve({ sha256: d.sha256, model: d.model });
                    else { var e = new Error(d.message || 'The STEP import failed.'); e.code = d.code || 'failed'; reject(e); }
                };
                w.onerror = function (ev) { clearTimeout(startTimer); if (done) return; done = true; try { w.terminate(); } catch (_) {} reject(new Error((ev && ev.message) || 'The STEP import worker stopped.')); };
                w.postMessage({ type: 'import', buffer: buf, expectSha: opts.expectSha || null, opts: { maxTrianglesPerPart: opts.maxTrianglesPerPart, maxTrianglesTotal: opts.maxTrianglesTotal, linearDeflection: opts.linearDeflection } }, [buf]);
            }, function (e) { done = true; reject(e); });
        });
        return {
            promise: promise,
            cancel: function () {
                if (done) return; done = true;
                try { clearTimeout(startTimer); } catch (_) {}
                try { if (w) w.terminate(); } catch (_) {}
                var e = new Error('Import canceled.'); e.code = 'canceled'; rejectFn(e);
            }
        };
    }
    function _cachePayload(sha, model) {
        return { sha256: sha, units: 'mm', createdAt: new Date().toISOString(), schema: model.schema || null, meshes: model.meshes };
    }
    // Import a new STEP file: worker -> local cache -> metadata into the project.
    // Returns { promise -> { entry, model }, cancel }.
    function importStep(file, opts) {
        opts = opts || {};
        var job = runWorker(file, opts);
        var promise = job.promise.then(function (r) {
            return finalizeImport(r, { fileName: file && file.name, cache: opts.cache, by: opts.by });
        });
        return { promise: promise, cancel: job.cancel };
    }
    // Split point between geometry and metadata. Geometry -> cache only;
    // metadata -> project. Exported so the tests drive the real split.
    function finalizeImport(r, o) {
        o = o || {};
        var cache = o.cache || { put: cachePut };
        return Promise.resolve(cache.put(r.sha256, _cachePayload(r.sha256, r.model))).then(function () {
            var entry = addToProject(r.model, { fileName: o.fileName || 'model.step', sha256: r.sha256, importedAt: o.at || new Date().toISOString() });
            return { entry: entry, model: r.model, revision: reviseFrom(entry, o.by) };
        });
    }
    // Geometry is missing on this computer: the user re-opens the STEP file. Its
    // fingerprint must match the project's record; nothing is downloaded.
    function reopen(file, entry, opts) {
        opts = opts || {};
        var job = runWorker(file, Object.assign({}, opts, { expectSha: entry.sha256 }));
        var promise = job.promise.then(function (r) {
            if (r.sha256 !== entry.sha256) { var e = new Error('This file is not the one the model was imported from (fingerprints differ).'); e.code = 'mismatch'; throw e; }
            var cache = opts.cache || { put: cachePut };
            return Promise.resolve(cache.put(r.sha256, _cachePayload(r.sha256, r.model))).then(function () { return { entry: entry, model: r.model }; });
        });
        return { promise: promise, cancel: job.cancel };
    }

    // ------------------------------------------------------------ zone lists
    var ZONE_HEADERS = {
        code: ['code', 'zone', 'zonecode', 'zoneid', 'id', 'number', 'zonenumber'],
        name: ['name', 'zonename', 'description', 'title', 'label'],
        parentCode: ['parent', 'parentcode', 'parentzone', 'parentzonecode', 'majorzone'],
        xMin: ['xmin', 'minx', 'x1', 'xfrom', 'xstart', 'fsmin', 'stamin'],
        yMin: ['ymin', 'miny', 'y1', 'yfrom', 'ystart', 'blmin', 'bmin'],
        zMin: ['zmin', 'minz', 'z1', 'zfrom', 'zstart', 'wlmin'],
        xMax: ['xmax', 'maxx', 'x2', 'xto', 'xend', 'fsmax', 'stamax'],
        yMax: ['ymax', 'maxy', 'y2', 'yto', 'yend', 'blmax', 'bmax'],
        zMax: ['zmax', 'maxz', 'z2', 'zto', 'zend', 'wlmax'],
        units: ['unit', 'units', 'uom']
    };
    var UNIT_MM = { mm: 1, millimeter: 1, millimeters: 1, millimetre: 1, cm: 10, m: 1000, meter: 1000, meters: 1000, metre: 1000, in: 25.4, inch: 25.4, inches: 25.4, ft: 304.8, foot: 304.8, feet: 304.8 };
    function _norm(h) { return String(h == null ? '' : h).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, ''); }
    function _num(v) {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return isFinite(v) ? v : NaN;
        var s = String(v).trim().replace(/\s+/g, ''); if (!s) return null;
        var n = Number(s); return isFinite(n) ? n : NaN;
    }
    // rows: array of arrays (first row = headers) or array of objects.
    // opts.units: unit of the coordinates when no unit column (default mm).
    function parseZoneRows(rows, opts) {
        opts = opts || {};
        var out = [], errors = [];
        if (!Array.isArray(rows) || !rows.length) return { rows: out, errors: ['The zone list is empty.'] };
        var header, body;
        if (Array.isArray(rows[0])) { header = rows[0]; body = rows.slice(1); }
        else { header = Object.keys(rows[0]); body = rows.map(function (r) { return header.map(function (h) { return r[h]; }); }); }
        var col = {};
        header.forEach(function (h, i) {
            var n = _norm(h);
            Object.keys(ZONE_HEADERS).forEach(function (f) { if (col[f] == null && ZONE_HEADERS[f].indexOf(n) >= 0) col[f] = i; });
            // Header names with a unit in brackets ("X min (in)") set the default unit.
            var u = /\(([a-z]+)\)/i.exec(String(h)); if (u && UNIT_MM[u[1].toLowerCase()] && !opts.units) opts.units = u[1].toLowerCase();
        });
        if (col.code == null) return { rows: out, errors: ['No zone code column found (expected a header such as "Code" or "Zone").'] };
        var defMul = UNIT_MM[String(opts.units || 'mm').toLowerCase()] || 1;
        var seen = {};
        body.forEach(function (r, i) {
            var line = i + 2;
            var code = r[col.code] == null ? '' : String(r[col.code]).trim();
            if (!code) { if (r.some(function (x) { return x != null && String(x).trim() !== ''; })) errors.push('Row ' + line + ': no zone code.'); return; }
            if (seen[code]) { errors.push('Row ' + line + ': zone ' + code + ' appears twice; the first row is kept.'); return; }
            var mul = defMul;
            if (col.units != null && r[col.units] != null && String(r[col.units]).trim()) {
                var um = UNIT_MM[String(r[col.units]).trim().toLowerCase()];
                if (!um) { errors.push('Row ' + line + ': unknown unit "' + r[col.units] + '".'); return; }
                mul = um;
            }
            var row = { code: code, name: col.name != null && r[col.name] != null ? String(r[col.name]).trim() : '', parentCode: col.parentCode != null && r[col.parentCode] != null && String(r[col.parentCode]).trim() ? String(r[col.parentCode]).trim() : null };
            var K = ['xMin', 'yMin', 'zMin', 'xMax', 'yMax', 'zMax'], vals = K.map(function (k) { return col[k] != null ? _num(r[col[k]]) : null; });
            var given = vals.filter(function (v) { return v != null; }).length;
            if (vals.some(function (v) { return v !== null && isNaN(v); })) { errors.push('Row ' + line + ' (' + code + '): a coordinate is not a number.'); return; }
            if (given !== 0 && given !== 6) { errors.push('Row ' + line + ' (' + code + '): give all six box coordinates or none.'); return; }
            if (given === 6) {
                for (var a = 0; a < 3; a++) {
                    if (vals[a] > vals[a + 3]) { errors.push('Row ' + line + ' (' + code + '): ' + K[a] + ' is larger than ' + K[a + 3] + '.'); return; }
                }
                K.forEach(function (k, j) { row[k] = r3(vals[j] * mul); });
            } else { K.forEach(function (k) { row[k] = null; }); }
            seen[code] = 1;
            out.push(row);
        });
        out.forEach(function (z) { if (z.parentCode && !seen[z.parentCode]) errors.push('Zone ' + z.code + ': parent ' + z.parentCode + ' is not in the list.'); });
        return { rows: out, errors: errors };
    }
    function _loadXlsx() {
        if (root.XLSX) return Promise.resolve(root.XLSX);
        if (typeof root._loadSheetJS === 'function') return root._loadSheetJS();
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script'); s.src = 'vendor/xlsx.full.min.js';
            s.onload = function () { resolve(root.XLSX); };
            s.onerror = function () { reject(new Error('Could not load the spreadsheet reader (vendor/xlsx.full.min.js).')); };
            document.head.appendChild(s);
        });
    }
    function readZoneFile(file, opts) {
        return Promise.all([_loadXlsx(), file.arrayBuffer()]).then(function (a) {
            var X = a[0], wb = X.read(new Uint8Array(a[1]), { type: 'array' });
            var sh = wb.Sheets[wb.SheetNames[0]];
            var rows = X.utils.sheet_to_json(sh, { header: 1, raw: true, defval: null });
            return parseZoneRows(rows, opts);
        });
    }
    // Hand parsed rows to the zonal engine (built separately). Feature-detected.
    function handZones(rows) {
        var E = root.SLCadZonal;
        if (!E || typeof E.importZoneList !== 'function') return { ok: false, reason: 'engine-missing' };
        return { ok: true, result: E.importZoneList(rows) };
    }

    var api = {
        VERSION: VERSION, DB_NAME: DB_NAME, DB_STORE: DB_STORE, OCCT_DIR: OCCT_DIR, DEFAULTS: DEFAULTS,
        decodeStepString: decodeStepString, bytesToText: bytesToText, parseStepProducts: parseStepProducts, parseStepInstances: parseStepInstances, designatorFrom: designatorFrom, stepSchema: stepSchema, stepLengthUnit: stepLengthUnit, productIndex: productIndex,
        bboxOf: bboxOf, centroidOf: centroidOf, decimate: decimate, makePid: makePid, buildModel: buildModel, convertStep: convertStep,
        projectEntry: projectEntry, containsGeometry: containsGeometry, addToProject: addToProject, nextRevision: nextRevision, reviseFrom: reviseFrom, getModel: getModel, latestModel: latestModel,
        sha256Hex: sha256Hex, openDb: openDb, cachePut: cachePut, cacheGet: cacheGet, cacheHas: cacheHas,
        workerUrl: workerUrl, runWorker: runWorker, importStep: importStep, finalizeImport: finalizeImport, reopen: reopen,
        parseZoneRows: parseZoneRows, readZoneFile: readZoneFile, handZones: handZones
    };
    root.SLCadImport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
