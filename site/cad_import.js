// ============================================================================
// cad_import.js, v2.0 (1.2 designators from STEP instance names; 1.3 a worker that cannot start is reported; 2.0 prototypes + placements, the full OpenCascade reader with progress inside the read, the STEP file kept locally for exact measurement): CAD import for the CAD Model page (13 Oct 2026).
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
    var VERSION = '2.5';   // 2.5 (17 Oct 2026): full assembly paths (attachTrails), each part's own part number, estimated boxes marked
    var DB_NAME = 'sl-cad', DB_STORE = 'meshes', DB_STEPS = 'steps', DB_VERSION = 2;
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
    // Per product (by its label, as the tree shows it): the STEP description and any material
    // named by MATERIAL_DESIGNATION on its product definition (directly or through its shape).
    function parseStepAttributes(text) {
        var t = text || '', m, out = {};
        var prod = {}, pdf = {}, pd = {}, pds = {};
        var reP = new RegExp('#(\\d+)\\s*=\\s*PRODUCT\\s*\\(\\s*' + S_ + '\\s*,\\s*' + S_ + '\\s*,\\s*(?:' + S_ + '|\\$)', 'g');
        while ((m = reP.exec(t))) { var id = decodeStepString(m[2]).trim(), nm = decodeStepString(m[3]).trim(); prod[m[1]] = { label: nm || id, id: id, description: m[4] != null ? decodeStepString(m[4]).trim() : '' }; }
        var reF = new RegExp('#(\\d+)\\s*=\\s*PRODUCT_DEFINITION_FORMATION(?:_WITH_SPECIFIED_SOURCE)?\\s*\\(\\s*' + S_ + '\\s*,\\s*' + S_ + '\\s*,\\s*#(\\d+)', 'g');
        while ((m = reF.exec(t))) pdf[m[1]] = m[4];
        var reD = new RegExp('#(\\d+)\\s*=\\s*PRODUCT_DEFINITION\\s*\\(\\s*' + S_ + '\\s*,\\s*' + S_ + '\\s*,\\s*#(\\d+)', 'g');
        while ((m = reD.exec(t))) pd[m[1]] = m[4];
        var reS = new RegExp('#(\\d+)\\s*=\\s*PRODUCT_DEFINITION_SHAPE\\s*\\(\\s*(?:' + S_ + '|\\$)\\s*,\\s*(?:' + S_ + '|\\$)\\s*,\\s*#(\\d+)', 'g');
        while ((m = reS.exec(t))) pds[m[1]] = m[4];
        Object.keys(pd).forEach(function (k) { var pr = prod[pdf[pd[k]]]; if (pr && !out[pr.label]) { out[pr.label] = { productId: pr.id }; if (pr.description) out[pr.label].description = pr.description; } });
        var reM = new RegExp('MATERIAL_DESIGNATION\\s*\\(\\s*' + S_ + '\\s*,\\s*\\(?\\s*((?:#\\d+\\s*,?\\s*)+)\\)?', 'g');
        while ((m = reM.exec(t))) {
            var mat = decodeStepString(m[1]).trim(); if (!mat) continue;
            (m[2].match(/#\d+/g) || []).forEach(function (ref) {
                var n = ref.slice(1), pdId = pd[n] ? n : pds[n] && pd[pds[n]] ? pds[n] : null;
                var pr = pdId ? prod[pdf[pd[pdId]]] : null;
                if (pr) { out[pr.label] = out[pr.label] || { productId: pr.id }; out[pr.label].material = mat; }
            });
        }
        return out;
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
    // ---- IGES (19 Oct 2026): the other neutral format every CAD tool writes. IGES has no product structure,
    // no part numbers and no user defined attributes, so an IGES model is its shapes, their names and colors.
    // A file is IGES when its first record is an 80 column line with 'S' (start section) in column 73 and a
    // sequence number in columns 74 to 80 (IGES 5.3, 2.2.1). The same rule as the engine (tools/occt/slcad_occt.cpp).
    function isIges(bytes) {
        var d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (d.length < 80 || d[72] !== 83) return false;
        var e = 0; while (e < d.length && d[e] !== 10 && d[e] !== 13) e++;
        if (e < 80) return false;
        var digit = false;
        for (var i = 73; i < 80; i++) { if (d[i] >= 48 && d[i] <= 57) digit = true; else if (d[i] !== 32) return false; }
        if (!digit) return false;
        if (e === 80) return true;
        return d.length >= 160 && (d[152] === 83 || d[152] === 71);
    }
    function isStep(bytes) { var d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); return /ISO-10303-21/.test(bytesToText(d.subarray(0, 2000))); }
    // 'step', 'iges' or null (not a file Safety Lab reads)
    function cadFormat(bytes) { return isStep(bytes) ? 'step' : isIges(bytes) ? 'iges' : null; }
    var NOT_CAD = 'This is not a STEP or IGES file. Export the model from your CAD tool as STEP (AP242, AP214 or AP203), or as IGES.';
    // The IGES global section (IGES 5.3, 2.2.4): parameter 14 is the unit flag, 15 the unit name, 23 the version.
    // Parameters are separated by parameter 1 (default ','), the section ends with parameter 2 (default ';'),
    // and text is Hollerith (nH followed by n characters).
    var IGES_UNITS = { 1: 'inch', 2: 'mm', 4: 'ft', 5: 'mi', 6: 'm', 7: 'km', 8: 'mil', 9: 'micron', 10: 'cm', 11: 'microinch' };
    var IGES_VERSIONS = { 1: '1.0', 2: 'ANSI Y14.26M-1981', 3: '2.0', 4: '3.0', 5: 'ASME/ANSI Y14.26M-1987', 6: '4.0', 7: 'ASME Y14.26M-1989', 8: '5.0', 9: '5.1', 10: '5.2', 11: '5.3' };
    function igesGlobal(bytes) {
        var d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        var text = bytesToText(d.subarray(0, Math.min(d.length, 400000)));
        var recs = /[\r\n]/.test(text.slice(0, 82)) ? text.split(/\r\n|\r|\n/) : text.match(/[\s\S]{1,80}/g) || [];
        var g = ''; recs.forEach(function (r) { if (r.charAt(72) === 'G') g += r.slice(0, 72); });
        var pd = ',', rd = ';', i = 0, out = [];
        // parameters 1 and 2 may themselves change the delimiters (1H/ or a default when empty)
        function readOne() {
            while (i < g.length && g.charAt(i) === ' ') i++;
            var m = /^(\d+)H/.exec(g.slice(i, i + 12));
            var v = '';
            if (m) { var n = +m[1]; i += m[0].length; v = g.substr(i, n); i += n; }
            else { var j = i; while (j < g.length && g.charAt(j) !== pd && g.charAt(j) !== rd) j++; v = g.slice(i, j).trim(); i = j; }
            while (i < g.length && g.charAt(i) === ' ') i++;
            var end = g.charAt(i) === rd || i >= g.length; i++;
            return { v: v, end: end };
        }
        if (g.charAt(0) !== pd) { var a = readOne(); out.push(a.v); if (a.v) pd = a.v.charAt(0); } else { out.push(''); i++; }
        if (g.charAt(i) !== pd) { var b = readOne(); out.push(b.v); if (b.v) rd = b.v.charAt(0); } else { out.push(''); i++; }
        for (var guard = 0; guard < 40 && i < g.length; guard++) { var r = readOne(); out.push(r.v); if (r.end) break; }
        var flag = parseInt(out[13], 10), uname = String(out[14] || '').trim().replace(/^\d+H/, '');
        var unit = IGES_UNITS[flag] || (flag === 3 && uname ? uname.toLowerCase() : 'unknown');
        var ver = IGES_VERSIONS[parseInt(out[22], 10)] || '';
        // parameters 3 to 6: the sender's product id, the file name, the native system id, the preprocessor version
        return { unit: unit, version: ver, product: String(out[2] || ''), fileName: String(out[3] || ''), system: String(out[4] || ''), preprocessor: String(out[5] || '') };
    }
    // the schema label of a file: AP242 / AP214 / AP203 for STEP, 'IGES 5.3' for IGES
    function cadSchema(bytes) { var d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); if (isIges(d)) { var g = igesGlobal(d); return 'IGES' + (g.version ? ' ' + g.version : ''); } return stepSchema(bytesToText(d.subarray(0, 4000))); }
    function cadLengthUnit(bytes) { var d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); if (isIges(d)) return igesGlobal(d).unit; return stepLengthUnit(bytesToText(d.subarray(0, Math.min(d.length, 4e6)))); }
    // the file picker's list
    var ACCEPT = '.stp,.step,.p21,.igs,.iges';
    // How to get a file Safety Lab reads out of each CAD tool (19 Oct 2026). Menu names move between releases,
    // so each line names the export, not every click. STEP carries the assembly, part numbers, instance names
    // and user defined attributes (route types); IGES carries shapes, names and colors only.
    var EXPORT_GUIDE = [
        { tool: 'CATIA V5', how: 'File > Save As, type stp. Pick AP242 (or AP214) under Tools > Options > General > Compatibility > STEP, and turn on the export of user defined properties so route types come across.' },
        { tool: '3DEXPERIENCE (CATIA)', how: 'Export the product (or the root of the assembly) as STEP, AP242. Include attributes in the export settings.' },
        { tool: 'Siemens NX', how: 'File > Export > STEP. Choose AP242 and include the assembly structure and attributes.' },
        { tool: 'PTC Creo', how: 'File > Save As > Save a Copy, type STEP. Export the top assembly so every part comes with it, and include parameters.' },
        { tool: 'SolidWorks', how: 'File > Save As, type STEP AP242 (or AP214). Save the top assembly, not single parts.' },
        { tool: 'Autodesk Inventor', how: 'File > Export > CAD Format, type STEP. Under Options pick Application Protocol 242 (or 214).' },
        { tool: 'Autodesk Fusion', how: 'File > Export, type STEP.' },
        { tool: 'Solid Edge', how: 'Save As, type STEP.' },
        { tool: 'Onshape', how: 'Right click the assembly tab > Export, format STEP.' },
        { tool: 'Rhino and other surface modelers', how: 'File > Export, type STEP. If STEP is not offered, IGES.' },
        { tool: 'Any other tool', how: 'Any STEP export (AP203, AP214 or AP242) works. IGES works too, for tools or archives that only have it.' }
    ];
    function exportGuideHtml() {
        var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
        return '<details data-cad-export-guide style="margin:6px 0 8px;font-size:12px;"><summary style="cursor:pointer;">Exporting from your CAD tool</summary>' +
            '<div style="margin:6px 0 4px;">Safety Lab reads STEP from every CAD tool, and IGES. Use STEP when you can: it carries the assembly, part numbers, instance names and the attributes that define each route\'s type. IGES carries the shapes, their names and colors only, so an IGES model has no assembly levels and route types are set by hand.</div>' +
            '<table style="border-collapse:collapse;width:100%;">' + EXPORT_GUIDE.map(function (g) { return '<tr><td style="padding:3px 8px 3px 0;vertical-align:top;white-space:nowrap;font-weight:600;">' + esc(g.tool) + '</td><td style="padding:3px 0;">' + esc(g.how) + '</td></tr>'; }).join('') + '</table>' +
            '<div style="margin-top:4px;">Menu names change between releases; the export to look for is STEP (or IGES).</div></details>';
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

    // The ONE walk that names parts, shared by both readers (occt-import-js here, the full
    // OpenCascade build in cad_brep.js) so a file gets the same pids from either:
    // cb(meshIndex, { pid, name, path, key, occ }) in tree order.
    function walkParts(res, cb) {
        var meshesIn = (res && res.meshes) || [], counters = {};
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
                // 17 Oct 2026: OpenCascade's walk keeps two levels of the assembly. When the STEP structure was read
                // (attachTrails / SLCadStep.boxRes), each part carries its full path instead: every assembly above it,
                // and its own product when that product holds several bodies (the bodies are named under it).
                if (Array.isArray(m.trail)) {
                    var prodName = String(m.product == null ? '' : m.product).trim();
                    partPath = m.trail.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean);
                    if (m.bodies > 1) { if (prodName) partPath.push(prodName); name = String(m.name || '').trim() || (prodName ? prodName + ' body ' + ((m.solid || 0) + 1) : 'Part'); }
                    else name = prodName || name;
                }
                var key = partPath.join('\u0001') + '\u0002' + name;
                var occ = counters[key] = (counters[key] || 0) + 1;
                cb(mi, { pid: makePid(partPath, name, occ), name: name, path: partPath.slice(), key: key, occ: occ });
            });
            (node.children || []).forEach(function (c) { walk(c, childPath); });
        })(res && res.root, []);
        return counters;
    }

    // attachTrails(res, u8): gives the parts of an OpenCascade result (occt-import-js or our build, whose walk keeps
    // two assembly levels) their full assembly path, own product and part number, read from the STEP structure
    // (SLCadStep). Applied only when the structure reader lists exactly the same parts in the same order (count,
    // and placements where the result has them); otherwise nothing changes and the reason is returned.
    function attachTrails(res, u8) {
        var S = root.SLCadStep;
        if (!res || !Array.isArray(res.meshes)) return { full: false, why: 'no parts' };
        if (!S) return { full: false, why: 'the structure reader is not loaded' };
        var st, b;
        try { var ix = S.index(u8); st = S.structure(ix); if (st.unsupported) return { full: false, why: st.unsupported }; b = S.boxRes(ix, st, { tessellation: false }); }
        catch (e) { return { full: false, why: 'the structure could not be read: ' + ((e && e.message) || e) }; }
        if (b.meshes.length !== res.meshes.length) return { full: false, why: 'the structure lists ' + b.meshes.length + ' parts, OpenCascade ' + res.meshes.length };
        for (var i = 0; i < b.meshes.length; i++) {
            var A = res.meshes[i].matrix, B = b.meshes[i].matrix;
            if (A && B) { var tol = 1e-6 * Math.max(1, Math.abs(A[12]) + Math.abs(A[13]) + Math.abs(A[14])); for (var k = 0; k < 16; k++) if (Math.abs((A[k] || 0) - (B[k] || 0)) > tol) return { full: false, why: 'part ' + (i + 1) + ' is placed differently by the structure reader' }; }
        }
        for (var j = 0; j < b.meshes.length; j++) { var t = b.meshes[j], m = res.meshes[j]; m.trail = t.trail; m.product = t.product; m.partNumber = t.partNumber; m.bodies = t.bodies; m.solid = t.solid; m.name = t.name; }   // names as the structure reader decodes them (one rule for every reader)
        return { full: true };
    }

    // ---- instancing: one prototype per repeated geometry, a placement per copy
    // A matrix is column-major 4x4 (three.js order). Identity placements are stored as null.
    function _fnv(u32) { var h = 2166136261; for (var i = 0; i < u32.length; i++) { h ^= u32[i]; h = Math.imul(h, 16777619); } return h >>> 0; }
    function _anchors(pos) {
        // four well spread vertices (or three plus a synthetic normal point when the part is flat)
        var n = pos.length / 3; if (n < 3) return null;
        function d2(i, j) { var dx = pos[i * 3] - pos[j * 3], dy = pos[i * 3 + 1] - pos[j * 3 + 1], dz = pos[i * 3 + 2] - pos[j * 3 + 2]; return dx * dx + dy * dy + dz * dz; }
        var a0 = 0, a1 = 0, best = -1, i;
        for (i = 0; i < n; i++) { var v = d2(a0, i); if (v > best) { best = v; a1 = i; } }
        if (!(best > 0)) return null;
        var ux = pos[a1 * 3] - pos[0], uy = pos[a1 * 3 + 1] - pos[1], uz = pos[a1 * 3 + 2] - pos[2];
        var a2 = -1; best = -1;
        for (i = 0; i < n; i++) {
            var wx = pos[i * 3] - pos[0], wy = pos[i * 3 + 1] - pos[1], wz = pos[i * 3 + 2] - pos[2];
            var cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx, c = cx * cx + cy * cy + cz * cz;
            if (c > best) { best = c; a2 = i; }
        }
        if (!(best > 0)) return null;
        var vx = pos[a2 * 3] - pos[0], vy = pos[a2 * 3 + 1] - pos[1], vz = pos[a2 * 3 + 2] - pos[2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= nl; ny /= nl; nz /= nl;
        var a3 = -1; best = 0;
        var L = Math.sqrt(ux * ux + uy * uy + uz * uz);
        for (i = 0; i < n; i++) {
            var h = Math.abs((pos[i * 3] - pos[0]) * nx + (pos[i * 3 + 1] - pos[1]) * ny + (pos[i * 3 + 2] - pos[2]) * nz);
            if (h > best) { best = h; a3 = i; }
        }
        if (best < L * 1e-4) a3 = -1;   // flat: use a synthetic point along the normal
        return [0, a1, a2, a3];
    }
    function _pts(pos, an) {
        var P = an.slice(0, 3).map(function (i) { return [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; });
        if (an[3] >= 0) P.push([pos[an[3] * 3], pos[an[3] * 3 + 1], pos[an[3] * 3 + 2]]);
        else {
            var u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], v = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
            var n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], nl = Math.hypot(n[0], n[1], n[2]), s = Math.hypot(u[0], u[1], u[2]);
            P.push([P[0][0] + n[0] / nl * s, P[0][1] + n[1] / nl * s, P[0][2] + n[2] / nl * s]);
        }
        return P;
    }
    // Affine map taking points P[0..3] to Q[0..3]: column-major 4x4, or null when singular.
    function _solveAffine(P, Q) {
        var A = P.map(function (p) { return [p[0], p[1], p[2], 1]; });
        // invert the 4x4 A (rows = points) with Gauss-Jordan
        var M = A.map(function (r, i) { return r.concat([0, 0, 0, 0].map(function (_, j) { return i === j ? 1 : 0; })); });
        for (var c = 0; c < 4; c++) {
            var piv = c; for (var r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
            if (Math.abs(M[piv][c]) < 1e-12) return null;
            var t = M[c]; M[c] = M[piv]; M[piv] = t;
            var d = M[c][c]; for (var k = 0; k < 8; k++) M[c][k] /= d;
            for (r = 0; r < 4; r++) if (r !== c) { var f = M[r][c]; if (f) for (k = 0; k < 8; k++) M[r][k] -= f * M[c][k]; }
        }
        var inv = M.map(function (r) { return r.slice(4); });
        // X (4x3) = inv(A) * Q ; matrix rows: out[row r][col c] = X[c][r]
        var X = [0, 1, 2, 3].map(function (i) { return [0, 1, 2].map(function (j) { return inv[i][0] * Q[0][j] + inv[i][1] * Q[1][j] + inv[i][2] * Q[2][j] + inv[i][3] * Q[3][j]; }); });
        return [X[0][0], X[0][1], X[0][2], 0, X[1][0], X[1][1], X[1][2], 0, X[2][0], X[2][1], X[2][2], 0, X[3][0], X[3][1], X[3][2], 1];
    }
    // A copy is the same part moved: a rotation (no mirror) and a translation, with at most a
    // uniform scale. A box stretched into a different box maps vertex for vertex too, but it is
    // a different part, and its normals would be drawn wrong; that is refused.
    function _rigid(m) {
        var c = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
        var l = c.map(function (v) { return Math.hypot(v[0], v[1], v[2]); });
        if (!(l[0] > 0) || Math.abs(l[1] - l[0]) > 2e-3 * l[0] || Math.abs(l[2] - l[0]) > 2e-3 * l[0]) return false;
        var d = function (a, b) { return Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (l[0] * l[0]); };
        if (d(c[0], c[1]) > 2e-3 || d(c[0], c[2]) > 2e-3 || d(c[1], c[2]) > 2e-3) return false;
        var det = c[0][0] * (c[1][1] * c[2][2] - c[1][2] * c[2][1]) - c[1][0] * (c[0][1] * c[2][2] - c[0][2] * c[2][1]) + c[2][0] * (c[0][1] * c[1][2] - c[0][2] * c[1][1]);
        return det > 0;
    }
    function _mapsAll(m, P, Q, tol) {
        for (var i = 0; i < P.length; i += 3) {
            var x = P[i], y = P[i + 1], z = P[i + 2];
            var dx = m[0] * x + m[4] * y + m[8] * z + m[12] - Q[i], dy = m[1] * x + m[5] * y + m[9] * z + m[13] - Q[i + 1], dz = m[2] * x + m[6] * y + m[10] * z + m[14] - Q[i + 2];
            if (dx * dx + dy * dy + dz * dz > tol * tol) return false;
        }
        return true;
    }
    // items: [{ position, index, normal, faces }] in WORLD coordinates (placement applied).
    // Returns { protos:[{position,index,normal,faces}], refs:[{ proto, matrix|null }] } where a
    // copy shares its prototype when the triangle list is identical and ONE affine placement maps
    // every vertex onto the copy within tolerance (float32 noise). Deterministic: first seen wins.
    function findInstances(items, opts) {
        opts = opts || {};
        var protos = [], refs = [], groups = {}, maxTry = opts.maxTry || 8;
        items.forEach(function (it) {
            var pos = it.position, idx = it.index, nv = pos.length / 3;
            var key = nv + ':' + idx.length + ':' + _fnv(idx);
            var g = groups[key] || (groups[key] = []), done = false;
            var ext = 0; for (var i = 0; i < pos.length; i++) { var a = Math.abs(pos[i]); if (a > ext) ext = a; }
            var tol = Math.max(1e-3, ext * 4e-6);
            for (var k = 0; k < g.length && k < maxTry && !done; k++) {
                var pr = g[k];
                if (!pr.anchors) continue;
                var m = _solveAffine(_pts(pr.position, pr.anchors), _pts(pos, pr.anchors));
                if (m && _rigid(m) && _mapsAll(m, pr.position, pos, tol)) { refs.push({ proto: pr.index, matrix: m }); done = true; }
            }
            if (!done) {
                var p = { position: pos, index: idx, normal: it.normal || null, faces: it.faces || null };
                g.push({ index: protos.length, position: pos, anchors: _anchors(pos) });
                refs.push({ proto: protos.length, matrix: null });
                protos.push(p);
            }
        });
        return { protos: protos, refs: refs };
    }
    function _xf(m, x, y, z) { return m ? [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]] : [x, y, z]; }
    function bboxOfXf(pos, m) {
        if (!m) return bboxOf(pos);
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (var i = 0; i + 2 < pos.length; i += 3) {
            var w = _xf(m, pos[i], pos[i + 1], pos[i + 2]);
            for (var j = 0; j < 3; j++) { if (w[j] < mn[j]) mn[j] = w[j]; if (w[j] > mx[j]) mx[j] = w[j]; }
        }
        if (!(mn[0] <= mx[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
        return { min: mn, max: mx };
    }
    // Every placed copy of one shape: its box and centroid, exactly the numbers bboxOfXf and _xf
    // give copy by copy (bit for bit), with the pass over the shape's vertices made once per
    // distinct rotation. Why that is exact: _xf computes ((m0 x + m4 y) + m8 z) + m12; the part in
    // brackets depends on the rotation only, and adding the same m12 to every vertex is monotone
    // under rounding, so min_v fl(a_v + t) = fl(min_v a_v + t) (and the same for max).
    //   mats: Float32Array, 16 per copy; has: Uint8Array, 1 where the copy has a placement.
    // Returns { box: Float64Array(6 k) [minx,miny,minz,maxx,maxy,maxz], cen: Float64Array(3 k) }.
    function placedBoxes(pos, idx, mats, has, k) {
        var box = new Float64Array(k * 6), cen = new Float64Array(k * 3);
        var b0 = bboxOf(pos), c0 = pos.length ? centroidOf(pos, idx, b0) : [0, 0, 0], rot = {};
        for (var i = 0; i < k; i++) {
            var o = i * 6, q = i * 3, M = has[i] ? mats.subarray(i * 16, i * 16 + 16) : null;
            if (M && _isIdent(M)) M = null;
            if (!M) { box[o] = b0.min[0]; box[o + 1] = b0.min[1]; box[o + 2] = b0.min[2]; box[o + 3] = b0.max[0]; box[o + 4] = b0.max[1]; box[o + 5] = b0.max[2]; cen[q] = c0[0]; cen[q + 1] = c0[1]; cen[q + 2] = c0[2]; continue; }
            var key = M[0] + ',' + M[1] + ',' + M[2] + ',' + M[4] + ',' + M[5] + ',' + M[6] + ',' + M[8] + ',' + M[9] + ',' + M[10], r = rot[key];
            if (!r) {
                r = rot[key] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
                for (var v = 0; v + 2 < pos.length; v += 3) {
                    var x = pos[v], y = pos[v + 1], z = pos[v + 2];
                    var ax = M[0] * x + M[4] * y + M[8] * z, ay = M[1] * x + M[5] * y + M[9] * z, az = M[2] * x + M[6] * y + M[10] * z;
                    if (ax < r[0]) r[0] = ax; if (ax > r[3]) r[3] = ax; if (ay < r[1]) r[1] = ay; if (ay > r[4]) r[4] = ay; if (az < r[2]) r[2] = az; if (az > r[5]) r[5] = az;
                }
            }
            if (!(r[0] <= r[3])) { for (var e = 0; e < 6; e++) box[o + e] = 0; }   // no vertices: bboxOfXf's empty box
            else { box[o] = r[0] + M[12]; box[o + 1] = r[1] + M[13]; box[o + 2] = r[2] + M[14]; box[o + 3] = r[3] + M[12]; box[o + 4] = r[4] + M[13]; box[o + 5] = r[5] + M[14]; }
            var w = _xf(M, c0[0], c0[1], c0[2]); cen[q] = w[0]; cen[q + 1] = w[1]; cen[q + 2] = w[2];
        }
        return { box: box, cen: cen };
    }
    // World positions of one part: its prototype's vertices placed by its matrix.
    function worldPosition(geom, meshOrIndex) {
        var m = typeof meshOrIndex === 'number' ? geom.meshes[meshOrIndex] : meshOrIndex;
        if (m.position) return m.position;   // a cache from before instancing (v1)
        var p = geom.protos[m.proto].position;
        if (!m.matrix) return p;
        var out = new Float32Array(p.length), M = m.matrix;
        for (var i = 0; i < p.length; i += 3) { var w = _xf(M, p[i], p[i + 1], p[i + 2]); out[i] = w[0]; out[i + 1] = w[1]; out[i + 2] = w[2]; }
        return out;
    }
    // Any cached geometry (v1: world meshes; v2: protos + placements) as v2.
    function normalizeGeometry(g) {
        if (!g) return null;
        if (Array.isArray(g)) g = { meshes: g };
        if (g.packed && !('meshes' in g)) {
            // the per part records are made on first use; the scene reads the flat arrays
            var out = Object.assign({}, g, { version: 2 }), P = g.packed, PP = g.parts || null, cache = null;
            delete out.meshes;
            Object.defineProperty(out, 'meshes', { enumerable: false, configurable: true, get: function () { if (!cache) cache = unpackMeshes(P, PP); return cache; } });
            if (Array.isArray(out.protos)) return out;
            g = out;
        }
        if (Array.isArray(g.protos)) return g;
        var protos = [], meshes = (g.meshes || []).map(function (m, i) { protos.push({ position: m.position, index: m.index, normal: m.normal || null, faces: m.faces || null }); return { pid: m.pid, proto: i, matrix: null, color: m.color || null }; });
        return Object.assign({}, g, { version: 2, protos: protos, meshes: meshes });
    }

    // reader result -> { parts (metadata), meshes (per part: pid, proto, matrix, color),
    // protos (geometry, shared by copies) }.
    // occt-import-js puts each leaf part occurrence as a mesh on its parent assembly node, with
    // the placement already applied: its copies are found again by findInstances. The full
    // OpenCascade reader (cad_brep.js) hands prototypes and placements directly (res.protos).
    function buildModel(res, opts) {
        opts = opts || {};
        var pidx = opts.productIndex || {};
        var maxPart = opts.maxTrianglesPerPart != null ? opts.maxTrianglesPerPart : DEFAULTS.maxTrianglesPerPart;
        var maxTotal = opts.maxTrianglesTotal != null ? opts.maxTrianglesTotal : DEFAULTS.maxTrianglesTotal;
        var meshesIn = (res && res.meshes) || [];
        var protosIn = res && Array.isArray(res.protos) ? res.protos : null;
        var parts = [], refs = [], occOf = [], n = 0, rawItems = [];
        var total = meshesIn.length || 1;
        var counters = walkParts(res, function (mi, w) {
            var m = meshesIn[mi];
            var item;
            if (protosIn) {
                var pr = protosIn[m.proto];
                var M = m.matrix && !_isIdent(m.matrix) ? m.matrix : null;
                item = { proto: pr, matrix: M };
            } else {
                var pos = toF32(m.attributes && m.attributes.position && m.attributes.position.array);
                var idx = toU32(m.index && m.index.array);
                var nrm = (m.attributes && m.attributes.normal && m.attributes.normal.array) ? toF32(m.attributes.normal.array) : null;
                var faces = Array.isArray(m.brep_faces) ? m.brep_faces.map(function (f) { return { first: f.first, last: f.last }; }) : null;
                item = { position: pos, index: idx, normal: nrm, faces: faces };
            }
            rawItems.push(item);
            // the part number of the part's own product when the structure was read; else looked up by its name
            var pn = m.partNumber !== undefined ? m.partNumber : Object.prototype.hasOwnProperty.call(pidx, w.name) ? pidx[w.name] : null;
            parts.push({ pid: w.pid, name: w.name, partNumber: (pn == null || pn === '') ? null : String(pn), path: w.path });
            occOf.push({ key: w.key, parent: w.path.length ? w.path[w.path.length - 1] : null, occ: w.occ, color: Array.isArray(m.color) ? m.color.slice(0, 3) : null, protoIn: protosIn ? m.proto : null });
            n++;
            if (opts.onProgress && (n % 200 === 0 || n === total)) { try { opts.onProgress('mesh', n / total); } catch (_) {} }
        });
        // Prototypes and placements.
        var protos, protoIdx = [];
        if (protosIn) {
            protos = protosIn.map(function (p) { return { position: toF32(p.position), index: toU32(p.index), normal: p.normal ? toF32(p.normal) : null, faces: p.faces || null }; });
            rawItems.forEach(function (it, i) { refs.push({ proto: occOf[i].protoIn, matrix: it.matrix }); });
        } else {
            var fi = opts.instancing === false ? { protos: rawItems.map(function (it) { return it; }), refs: rawItems.map(function (_, i) { return { proto: i, matrix: null }; }) } : findInstances(rawItems);
            protos = fi.protos; refs = fi.refs;
        }
        // Metadata from the full geometry, before any display simplification.
        parts.forEach(function (p, i) {
            var pr = protos[refs[i].proto], M = refs[i].matrix;
            var bb = bboxOfXf(pr.position, M);
            var c0 = pr._c || (pr._c = centroidOf(pr.position, pr.index, bboxOf(pr.position)));
            p.bbox = bb; p.centroid = _xf(M, c0[0], c0[1], c0[2]);
        });
        // Display budget on the prototypes (a prototype is drawn once per copy, so the total is
        // counted over copies).
        var copies = protos.map(function () { return 0; }); refs.forEach(function (r) { copies[r.proto]++; });
        var totalIn = 0; protos.forEach(function (p, i) { totalIn += (p.index.length / 3) * copies[i]; });
        var scale = (maxTotal > 0 && totalIn > maxTotal) ? maxTotal / totalIn : 1;
        var decimatedParts = 0, trianglesOut = 0;
        protos.forEach(function (p, i) {
            delete p._c;
            var tris = p.index.length / 3;
            var target = Math.min(maxPart > 0 ? maxPart : Infinity, Math.max(2000, Math.floor(tris * scale)));
            if (tris > target) {
                var d = decimate(p.position, p.index, target);
                if (d.decimated) { p.position = d.position; p.index = d.index; p.normal = null; p.faces = null; decimatedParts += copies[i]; }
            }
            trianglesOut += (p.index.length / 3) * copies[i];
        });
        var meshes = parts.map(function (p, i) {
            var M = refs[i].matrix;
            return { pid: p.pid, proto: refs[i].proto, matrix: M ? new Float32Array(M) : null, color: occOf[i].color };
        });
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
        // STEP attributes for the properties panel (description, material): kept with the local
        // geometry cache, not in the project.
        var attrs = {}, A = opts.attributes || null;
        if (A) parts.forEach(function (p) { var a = A[p.name]; if (a) attrs[p.pid] = a; });
        return { parts: parts, meshes: meshes, protos: protos, attrs: attrs, stats: { parts: parts.length, prototypes: protos.length, trianglesIn: totalIn, trianglesOut: trianglesOut, decimatedParts: decimatedParts, designators: designators } };
    }
    function _isIdent(m) { for (var i = 0; i < 16; i++) if (Math.abs(m[i] - ((i % 5) === 0 ? 1 : 0)) > 1e-12) return false; return true; }

    // The core path: STEP bytes + an initialised occt module -> model.
    // The worker calls this; so do the node tests (no worker shell in between).
    function convertStep(bytes, occt, opts) {
        opts = opts || {};
        var prog = function (ph, f) { if (opts.onProgress) { try { opts.onProgress(ph, f); } catch (_) {} } };
        var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        prog('scan', 0);
        // the smaller reader (occt-import-js) reads STEP only: IGES is read by Safety Lab's own build
        if (isIges(u8)) throw new Error('IGES files are read only by the full reader, which could not run here. Export the model as STEP instead, or open Safety Lab in a current browser.');
        var text = bytesToText(u8);
        if (!/ISO-10303-21/.test(text.slice(0, 2000))) throw new Error(NOT_CAD);
        var schema = stepSchema(text), sourceUnit = stepLengthUnit(text);
        var pidx = productIndex(parseStepProducts(text));
        var instances = parseStepInstances(text);
        var attributes = parseStepAttributes(text);
        text = null;
        prog('parse', 0);
        var res = occt.ReadStepFile(u8, {
            linearUnit: 'millimeter',
            linearDeflectionType: 'bounding_box_ratio',
            linearDeflection: opts.linearDeflection || DEFAULTS.linearDeflection,
            angularDeflection: opts.angularDeflection || DEFAULTS.angularDeflection
        });
        if (!res || !res.success) throw new Error('OpenCascade could not read this STEP file.');
        var tree = attachTrails(res, u8);
        prog('parse', 1);
        var model = buildModel(res, { productIndex: pidx, instances: instances, attributes: attributes, maxTrianglesPerPart: opts.maxTrianglesPerPart, maxTrianglesTotal: opts.maxTrianglesTotal, onProgress: opts.onProgress });
        model.schema = schema; model.sourceUnit = sourceUnit; model.units = 'mm'; model.reader = 'occt-import-js'; model.tree = tree;
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
            parts: ((model && model.parts) || []).map(function (p, i) {
                var q = { pid: String(p.pid), name: String(p.name), partNumber: p.partNumber == null ? null : String(p.partNumber), path: (p.path || []).map(String), bbox: { min: v3(p.bbox.min), max: v3(p.bbox.max) }, centroid: v3(p.centroid) };
                if (p.designator) q.designator = String(p.designator);   // optional: the installed copy's tag from the STEP instance name
                // 17 Oct 2026: a box estimated from the file (the part's real shape not read yet) is marked, so no zone or
                // risk answer is taken from it; the mark goes when the true box arrives (SLCadZonal.updatePartBoxes)
                var me = model.meshes && model.meshes[i], pr = me && me.pid === p.pid && model.protos ? model.protos[me.proto] : null;
                if (p.boxEstimated || (pr && pr.box)) q.boxEstimated = true;
                return q;
            })
        };
    }
    // True when anything in obj looks like geometry: a typed array or buffer, a
    // numeric array longer than a coordinate, or a mesh-shaped key.
    var GEOM_KEYS = { position: 1, positions: 1, normal: 1, normals: 1, index: 1, indices: 1, meshes: 1, vertices: 1, triangles: 1, buffer: 1, bytes: 1, step: 1, stepText: 1, fileBytes: 1 };
    // One walk with its own stack (a 200,000 part record is checked in tens of milliseconds). A
    // small piece (a few levels, no deeper object) is decided on the spot (_geoQuick): nothing in it
    // can lead back to itself, so it needs no record of what was visited. The answer is the same as
    // the plain depth first visit: true when anything reachable looks like geometry.
    var _hasAB = typeof ArrayBuffer !== 'undefined', _hop = Object.prototype.hasOwnProperty;
    function _geoQuick(x, d) {   // 1 geometry, 0 none, -1 too deep to decide here
        if (x == null || typeof x !== 'object') return 0;
        if (_hasAB && (x instanceof ArrayBuffer || ArrayBuffer.isView(x))) return 1;
        if (d > 3) return -1;
        var res = 0, r, y, i;
        if (Array.isArray(x)) {
            var n = x.length, allNum = n > 3;
            for (i = 0; i < n; i++) { if (!(i in x)) continue; y = x[i]; if (typeof y !== 'number') { allNum = false; if (y != null && typeof y === 'object') { r = _geoQuick(y, d + 1); if (r === 1) return 1; if (r < 0) res = -1; } } }
            return allNum ? 1 : res;
        }
        for (var k in x) {
            if (!_hop.call(x, k)) continue;
            if (GEOM_KEYS[k]) return 1;
            y = x[k]; if (y != null && typeof y === 'object') { r = _geoQuick(y, d + 1); if (r === 1) return 1; if (r < 0) res = -1; }
        }
        return res;
    }
    function containsGeometry(obj) {
        var q0 = _geoQuick(obj, 0); if (q0 >= 0) return q0 === 1;
        var seen = typeof Set !== 'undefined' ? new Set() : null, seenA = [], stack = [obj];
        while (stack.length) {
            var o = stack.pop();
            if (o == null || typeof o !== 'object') continue;
            if (seen) { if (seen.has(o)) continue; seen.add(o); } else { if (seenA.indexOf(o) >= 0) continue; seenA.push(o); }
            if (_hasAB && (o instanceof ArrayBuffer || ArrayBuffer.isView(o))) return true;
            var i, x, r;
            if (Array.isArray(o)) {
                var n = o.length, allNum = n > 3;
                for (i = 0; i < n; i++) { if (!(i in o)) continue; x = o[i]; if (typeof x !== 'number') { allNum = false; if (x != null && typeof x === 'object') { r = _geoQuick(x, 0); if (r === 1) return true; if (r < 0) stack.push(x); } } }
                if (allNum) return true;
                continue;
            }
            for (var k in o) {
                if (!_hop.call(o, k)) continue;
                if (GEOM_KEYS[k]) return true;
                x = o[k]; if (x != null && typeof x === 'object') { r = _geoQuick(x, 0); if (r === 1) return true; if (r < 0) stack.push(x); }
            }
        }
        return false;
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
            rq.onupgradeneeded = function () { var db = rq.result; if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE); if (!db.objectStoreNames.contains(DB_STEPS)) db.createObjectStore(DB_STEPS); };
            rq.onsuccess = function () { resolve(rq.result); };
            rq.onerror = function () { _dbp = null; reject(rq.error || new Error('Could not open the local CAD cache.')); };
        });
        return _dbp;
    }
    function _tx(mode, fn, store) {
        return openDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(store || DB_STORE, mode), st = tx.objectStore(store || DB_STORE), out;
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
    // The STEP file itself, kept in this browser on this computer (never uploaded) so exact
    // measurement and PMI can read it again without asking for the file. Stored as the File /
    // Blob the user opened.
    function stepPut(sha, blob) { return _tx('readwrite', function (st) { return st.put(blob, sha); }, DB_STEPS); }
    function stepGet(sha) { return _tx('readonly', function (st) { return st.get(sha); }, DB_STEPS).then(function (v) { return v || null; }); }
    function stepHas(sha) { return _tx('readonly', function (st) { return st.count(sha); }, DB_STEPS).then(function (n) { return n > 0; }); }

    // ------------------------------------------------------------ worker client
    function workerUrl() { return 'cad_import_worker.js?v=' + VERSION; }
    // Read a STEP file on this computer in the worker. Returns { promise, cancel }.
    // promise -> { sha256, model } with model = { parts, meshes, stats, schema, sourceUnit, units }.
    // opts.expectSha: refuse (before parsing) a file whose fingerprint differs.
    // Each part's box and centroid from its prototype mesh and placement; model.parts updated.
    // model.placed (from the detail stream): per shape, the boxes and centroids of its placed
    // copies, worked out by the part readers next to the meshing (placedBoxes, the same numbers):
    // { idx: Int32Array (which parts), box, cen, position (the shape they were made from) }. Used
    // only while the model still holds that very shape; anything else is computed here.
    function trueBoxes(model) {
        var pb = new Array(model.protos.length), placed = model.placed || null, slot = null;
        if (placed) {
            slot = new Int32Array(model.meshes.length).fill(-1);
            Object.keys(placed).forEach(function (k) {
                var P = placed[k], pr = model.protos[+k];
                if (!P || !pr || P.position !== pr.position) return;   // the shape changed since (a retry)
                for (var j = 0; j < P.idx.length; j++) { var mi = P.idx[j]; if (mi >= 0 && mi < slot.length && model.meshes[mi].proto === +k) slot[mi] = j; }
            });
        }
        function boxOfProto(k) {
            if (pb[k] !== undefined) return pb[k];
            var P = model.protos[k].position, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
            for (var i = 0; i < P.length; i += 3) for (var j = 0; j < 3; j++) { var v = P[i + j]; if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; }
            return (pb[k] = P.length ? { min: mn, max: mx, c: centroidOf(P, model.protos[k].index, { min: mn, max: mx }) } : null);
        }
        var out = new Array(model.meshes.length), n = 0;
        model.meshes.forEach(function (m, i) {
            var part = model.parts[i]; if (!part || part.pid !== m.pid || !model.protos[m.proto].position.length) return;
            if (model.protos[m.proto].box) return;   // still the estimated box: its shape was not read (it stays marked as an estimate)
            var j = slot ? slot[i] : -1;
            if (j >= 0) {
                var P = placed[m.proto], o = j * 6, q = j * 3, B = P.box, C = P.cen;
                part.bbox = { min: [B[o], B[o + 1], B[o + 2]], max: [B[o + 3], B[o + 4], B[o + 5]] }; part.centroid = [C[q], C[q + 1], C[q + 2]];
            } else {
                var b = boxOfProto(m.proto); if (!b) return;
                var M = m.matrix && !_isIdent(m.matrix) ? m.matrix : null;
                part.bbox = bboxOfXf(model.protos[m.proto].position, M); part.centroid = _xf(M, b.c[0], b.c[1], b.c[2]);
            }
            out[n++] = { pid: part.pid, bbox: part.bbox, centroid: part.centroid };
        });
        out.length = n;
        return out;
    }
    // The detail stream of a large assembly: batches of real shapes, replayed to late listeners.
    // proof and profiling marks: off unless the page sets window.SL_CAD_TRACE
    function _trace(label) { try { if (root.SL_CAD_TRACE) { var m = root.performance && root.performance.memory; root.console.log('[cad] ' + label + ' ' + Math.round(root.performance.now()) + ' ms' + (m ? ' heap ' + Math.round(m.usedJSHeapSize / 1048576) + ' MB' : '')); } } catch (_) {} }
    function makeStream() {
        var batches = [], fns = [], ends = [], ended = null;
        return {
            on: function (fn) { batches.forEach(function (b) { try { fn(b); } catch (_) {} }); fns.push(fn); },
            onEnd: function (fn) { if (ended) { try { fn(ended); } catch (_) {} } else ends.push(fn); },
            done: function () { return !!ended; },
            _emit: function (b) { batches.push(b); fns.forEach(function (fn) { try { fn(b); } catch (_) {} }); },
            _end: function (e) { if (ended) return; ended = e; ends.forEach(function (fn) { try { fn(e); } catch (_) {} }); }
        };
    }
    function runWorker(file, opts) {
        opts = opts || {};
        var w = null, done = false, rejectFn = null, startTimer = null;
        var promise = new Promise(function (resolve, reject) {
            rejectFn = reject;
            Promise.resolve(file.arrayBuffer ? file.arrayBuffer() : file).then(function (buf) {
                if (done) return;
                try { w = new Worker(workerUrl()); }
                catch (e0) { done = true; var e1 = new Error('The CAD reader could not start in this window (' + ((e0 && e0.message) || e0) + ').'); e1.code = 'worker-blocked'; reject(e1); return; }
                // A worker refused by a security policy may never start and never report an error.
                // The worker answers at once (its first progress message comes before any parsing),
                // so silence for START_MS means it is not running: say so instead of waiting forever.
                startTimer = setTimeout(function () {
                    if (done) return; done = true; try { w.terminate(); } catch (_) {}
                    var e2 = new Error('The CAD reader did not start. This window may be blocking its background worker (check the app\'s security policy for worker-src).'); e2.code = 'worker-blocked'; reject(e2);
                }, opts.startMs || START_MS);
                w.onmessage = function (ev) {
                    clearTimeout(startTimer);
                    var d = ev.data || {};
                    if (d.type === 'progress') { if (opts.onProgress) { try { opts.onProgress(d.phase, d.frac); } catch (_) {} } return; }
                    done = true;
                    // A worker that kept the exact geometry open is handed over, not stopped.
                    if (d.type === 'result' && d.session && opts.keepSession) { resolve({ sha256: d.sha256, model: d.model, worker: w }); return; }
                    // A large assembly: the first view now, the detail streamed behind it.
                    if (d.type === 'result' && d.streaming) {
                        var stream = makeStream();
                        _trace('result received');
                        if (d.model && d.model.packed && !d.model.meshes) { d.model.meshes = unpackMeshes(d.model.packed, d.model.partsPacked); d.model.parts = unpackParts(d.model.partsPacked, d.model.packed); }
                        w.onmessage = function (ev2) {
                            var e = ev2.data || {};
                            if (e.type === 'detail') { if (e.retry && d.model.notMeshed) d.model.notMeshed = d.model.notMeshed.filter(function (q) { return !(e.protos || []).some(function (p) { return q.protos.indexOf(p.proto) >= 0; }); }); stream._emit(e); }
                            // a body or part OpenCascade could not mesh stays a box, listed with its reason (never skipped silently)
                            else if (e.type === 'detail-failed') { (d.model.notMeshed = d.model.notMeshed || []).push({ protos: e.protos, name: e.name, reason: e.reason }); (e.protos || []).forEach(function (p) { if (d.model.protos && d.model.protos[p]) d.model.protos[p].notMeshed = e.reason; }); stream._emit({ type: 'detail', protos: [], failed: e }); }
                            // the worker stays: it holds the structure and answers exact queries
                            else if (e.type === 'detail-done' || e.type === 'detail-error') { stream.worker = w; stream._end(e); }
                        };
                        stream.cancel = function () { try { w.terminate(); } catch (_) {} stream._end({ type: 'detail-error', message: 'canceled' }); };
                        _trace('result unpacked');
                        resolve({ sha256: d.sha256, model: d.model, stream: stream });
                        return;
                    }
                    try { w.terminate(); } catch (_) {}
                    if (d.type === 'result') resolve({ sha256: d.sha256, model: d.model });
                    else { var e = new Error(d.message || 'The CAD import failed.'); e.code = d.code || 'failed'; reject(e); }
                };
                w.onerror = function (ev) { clearTimeout(startTimer); if (done) return; done = true; try { w.terminate(); } catch (_) {} reject(new Error((ev && ev.message) || 'The CAD import worker stopped.')); };
                w.postMessage({ type: 'import', buffer: buf, expectSha: opts.expectSha || null, opts: { maxTrianglesPerPart: opts.maxTrianglesPerPart, maxTrianglesTotal: opts.maxTrianglesTotal, linearDeflection: opts.linearDeflection, reader: opts.reader || 'auto', keepSession: !!opts.keepSession, splitMinBytes: opts.splitMinBytes, partCapMs: opts.partCapMs, testFailBody: opts.testFailBody, poolSize: opts.poolSize } }, [buf]);
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
    // Cache payload v2: prototypes (geometry, once per repeated part) and per part its prototype,
    // placement and color; STEP attributes for the properties panel. Local only.
    function _cachePayload(sha, model) {
        var pl = _cachePayload0(sha, model);
        var aligned = !!(pl.parts && pl.parts.occ) && model.meshes.length === model.parts.length && model.meshes.every(function (m, i) { return m.pid === model.parts[i].pid; });
        pl.packed = packMeshes(model.meshes, { noPids: aligned });
        return pl;
    }
    function _cachePayload0(sha, model) {
        return { version: 2, sha256: sha, units: 'mm', createdAt: new Date().toISOString(), schema: model.schema || null, reader: model.reader || null, protos: model.protos, packed: null, parts: model.parts && model.parts.length > LOCAL_PARTS_MIN() ? packParts(model.parts, model.meshes) : null, attrs: model.attrs || {}, partial: !!(model.streaming && !(model.streaming.done >= model.streaming.leaves)) };
    }
    // The per part records packed into a few flat arrays: storing and reading 200,000 small
    // objects from IndexedDB costs seconds, a handful of typed arrays a few milliseconds.
    function LOCAL_PARTS_MIN() { var E = root.SLCadZonal; return E && E.LOCAL_PARTS_MIN != null ? E.LOCAL_PARTS_MIN : 20000; }
    // Placements: 12 numbers each (the bottom row of a placement is always 0 0 0 1), colors as
    // indexes into a palette; part ids left out when they follow from the part list (packParts).
    function packMeshes(meshes, opts) {
        opts = opts || {};
        var n = meshes.length, proto = new Int32Array(n), mat = new Float32Array(n * 12), hasM = new Uint8Array(n), pids = opts.noPids ? null : new Array(n);
        var pal = [], palIdx = {}, cIdx = new Int32Array(n);
        var E12 = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];
        for (var i = 0; i < n; i++) {
            var m = meshes[i]; if (pids) pids[i] = m.pid; proto[i] = m.proto;
            if (m.matrix) { hasM[i] = 1; var M = m.matrix; for (var e = 0; e < 12; e++) mat[i * 12 + e] = M[E12[e]]; }
            if (m.color) { var k = m.color[0] + ',' + m.color[1] + ',' + m.color[2], c = palIdx[k]; if (c === undefined) { c = palIdx[k] = pal.length / 3; pal.push(m.color[0], m.color[1], m.color[2]); } cIdx[i] = c; } else cIdx[i] = -1;
        }
        return { n: n, pids: pids ? pids.join('\n') : null, proto: proto, matrix12: mat, hasMatrix: hasM, palette: new Float32Array(pal), colorIndex: cIdx };
    }
    // the full 4x4 placements (column-major, 16 per part) from either packed form
    function matrices16(P) {
        if (P.matrix) return P.matrix;
        if (P._m16) return P._m16;
        var n = P.n, out = new Float32Array(n * 16), a = P.matrix12;
        for (var i = 0; i < n; i++) {
            var o = i * 16, q = i * 12;
            out[o] = a[q]; out[o + 1] = a[q + 1]; out[o + 2] = a[q + 2];
            out[o + 4] = a[q + 3]; out[o + 5] = a[q + 4]; out[o + 6] = a[q + 5];
            out[o + 8] = a[q + 6]; out[o + 9] = a[q + 7]; out[o + 10] = a[q + 8];
            out[o + 12] = a[q + 9]; out[o + 13] = a[q + 10]; out[o + 14] = a[q + 11]; out[o + 15] = 1;
        }
        try { Object.defineProperty(P, '_m16', { value: out, enumerable: false }); } catch (_) {}
        return out;
    }
    function colorAt(P, i) {
        if (P.color) return P.hasColor[i] ? [P.color[i * 3], P.color[i * 3 + 1], P.color[i * 3 + 2]] : null;
        var c = P.colorIndex[i]; return c < 0 ? null : [P.palette[c * 3], P.palette[c * 3 + 1], P.palette[c * 3 + 2]];
    }
    // part ids of a packed payload: stored, or rebuilt from the part list (path, name, copy number)
    function pidsOf(packedMeshes, packedParts) {
        var P = packedMeshes;
        if (P && P._pids) return P._pids;
        var out;
        if (P && P.pids != null) out = P.n ? P.pids.split('\n') : [];
        else if (packedParts && packedParts.pids != null) out = packedParts.n ? packedParts.pids.split('\n') : [];
        else if (packedParts && packedParts.occ) {
            // makePid, with each distinct path and name encoded once
            var strs = packedParts.strings.split('\u0002'), pre = {}, nm = {}, n = packedParts.n; out = new Array(n);
            for (var i = 0; i < n; i++) {
                var pk = packedParts.path[i], ni = packedParts.name[i];
                var pf = pre[pk]; if (pf === undefined) { var segs = strs[pk] ? strs[pk].split('\u0001') : []; pf = pre[pk] = 'p:' + segs.map(encSeg).join('/') + (segs.length ? '/' : ''); }
                var en = nm[ni]; if (en === undefined) en = nm[ni] = encSeg(strs[ni]);
                out[i] = pf + en + '#' + packedParts.occ[i];
            }
        } else out = [];
        try { if (P) Object.defineProperty(P, '_pids', { value: out, enumerable: false }); } catch (_) {}
        return out;
    }
    // The part list of a large model, packed for this computer's cache (string tables and flat
    // arrays): it never goes to the project.
    function packParts(parts, meshes) {
        var n = parts.length, strs = [], sIdx = {}, S = function (x) { x = x == null ? '' : String(x); var k = sIdx[x]; if (k === undefined) { k = sIdx[x] = strs.length; strs.push(x); } return k; };
        var name = new Int32Array(n), pn = new Int32Array(n), hasPn = new Uint8Array(n), path = new Int32Array(n), desig = new Int32Array(n), box = new Float64Array(n * 6), cen = new Float64Array(n * 3), pids = new Array(n), est = new Uint8Array(n);
        for (var i = 0; i < n; i++) {
            var p = parts[i]; pids[i] = p.pid; name[i] = S(p.name); if (p.partNumber != null) { hasPn[i] = 1; pn[i] = S(p.partNumber); }
            path[i] = S((p.path || []).join('\u0001')); desig[i] = p.designator ? S(p.designator) : -1;
            box.set([p.bbox.min[0], p.bbox.min[1], p.bbox.min[2], p.bbox.max[0], p.bbox.max[1], p.bbox.max[2]], i * 6);
            cen.set(p.centroid || [0, 0, 0], i * 3);
            if (p.boxEstimated) est[i] = 1;
        }
        // part ids follow from path, name and copy number (makePid): stored only when one does not
        var occ = new Int32Array(n), derived = true;
        for (var j = 0; j < n; j++) { var h = pids[j].lastIndexOf('#'), oc = h >= 0 ? parseInt(pids[j].slice(h + 1), 10) : NaN; occ[j] = oc; if (derived && makePid(parts[j].path || [], String(parts[j].name), oc) !== pids[j]) derived = false; }
        return { n: n, pids: derived ? null : pids.join('\n'), occ: derived ? occ : null, strings: strs.join('\u0002'), name: name, partNumber: pn, hasPartNumber: hasPn, path: path, designator: desig, bbox: box, centroid: cen, estimated: est };
    }
    function unpackParts(P, packedMeshes) {
        var pids = !P.n ? [] : P.pids != null ? P.pids.split('\n') : P.occ ? pidsOf(packedMeshes || {}, P) : pidsOf(packedMeshes, null), strs = P.strings.split('\u0002'), out = new Array(P.n), paths = {};
        for (var i = 0; i < P.n; i++) {
            var b = P.bbox, o = i * 6, pk = P.path[i];
            var path = paths[pk] || (paths[pk] = strs[pk] ? strs[pk].split('\u0001') : []);
            var q = { pid: pids[i], name: strs[P.name[i]], partNumber: P.hasPartNumber[i] ? strs[P.partNumber[i]] : null, path: path, bbox: { min: [b[o], b[o + 1], b[o + 2]], max: [b[o + 3], b[o + 4], b[o + 5]] }, centroid: [P.centroid[i * 3], P.centroid[i * 3 + 1], P.centroid[i * 3 + 2]] };
            if (P.designator[i] >= 0) q.designator = strs[P.designator[i]];
            if (P.estimated && P.estimated[i]) q.boxEstimated = true;
            out[i] = q;
        }
        return out;
    }
    function unpackMeshes(P, packedParts) {
        var pids = pidsOf(P, packedParts), M = matrices16(P), out = new Array(P.n);
        for (var i = 0; i < P.n; i++) out[i] = { pid: pids[i], proto: P.proto[i], matrix: P.hasMatrix[i] ? M.subarray(i * 16, i * 16 + 16) : null, color: colorAt(P, i) };
        return out;
    }
    // Import a new STEP file: worker -> local cache -> metadata into the project.
    // Returns { promise -> { entry, model }, cancel }.
    function importStep(file, opts) {
        opts = opts || {};
        var job = runWorker(file, opts);
        var promise = job.promise.then(function (r) {
            return finalizeImport(r, { fileName: file && file.name, cache: opts.cache, by: opts.by, file: file });
        });
        return { promise: promise, cancel: job.cancel };
    }
    // Split point between geometry and metadata. Geometry -> cache only;
    // metadata -> project. Exported so the tests drive the real split.
    function finalizeImport(r, o) {
        o = o || {};
        var cache = o.cache || { put: cachePut, putStep: stepPut };
        var T = root.SLCadTimings = { start: Date.now() };
        // a large model streams: it goes on screen first, the cache writes follow in the background
        var saving = r.stream ? Promise.resolve() : null;
        if (r.stream) setTimeout(function () { Promise.resolve(cache.put(r.sha256, _cachePayload(r.sha256, r.model))).then(function () { _trace('cache put (background)'); if (o.file && cache.putStep) return cache.putStep(r.sha256, o.file); }).catch(function () {}); }, 0);
        return (saving || Promise.resolve(cache.put(r.sha256, _cachePayload(r.sha256, r.model)))).then(function () {
            if (r.stream) return;
            T.cachePut = Date.now() - T.start; _trace('cache put');
            // the file itself, locally, for exact measurement later (a failure here only means the
            // file is asked for again then)
            if (o.file && cache.putStep) return Promise.resolve(cache.putStep(r.sha256, o.file)).catch(function () {});
        }).then(function () {
            T.putStep = Date.now() - T.start; _trace('step stored');
            var entry = addToProject(r.model, { fileName: o.fileName || 'model.step', sha256: r.sha256, importedAt: o.at || new Date().toISOString() });
            _trace('added to project');
            if (r.stream) {
                // each real shape replaces its box in the model; the finished model replaces the
                // cached first view, so the next open is complete
                r.stream.on(function (b) { (b.protos || []).forEach(function (p) {
                    r.model.protos[p.proto] = { position: p.position, index: p.index, normal: null, faces: p.faces || null };
                    // the placed copies' boxes, worked out by the part reader with this shape (or dropped: a shape without them is boxed here)
                    var pl = r.model.placed || (r.model.placed = {});
                    if (p.placed && p.placed.idx && p.placed.box && p.placed.cen) pl[p.proto] = { idx: p.placed.idx, box: p.placed.box, cen: p.placed.cen, position: p.position }; else delete pl[p.proto];
                }); });
                r.stream.onEnd(function (e) {
                    if (e.type !== 'detail-done') return;
                    if (r.model.streaming) r.model.streaming.done = e.total;
                    // every part's true box from its shape (the first view's boxes were estimates)
                    var upd = trueBoxes(r.model), E = root.SLCadZonal;
                    if (E && E.updatePartBoxes) E.updatePartBoxes(entry.id, upd);
                    _trace('true boxes');
                    // the cache write in a task of its own, so the view draws in between
                    setTimeout(function () { Promise.resolve(cache.put(r.sha256, _cachePayload(r.sha256, r.model))).then(function () { _trace('cache put (complete model)'); }).catch(function () {}); }, 0);
                });
            }
            return { entry: entry, model: r.model, revision: reviseFrom(entry, o.by), worker: r.worker || null, stream: r.stream || null };
        });
    }
    // Geometry is missing on this computer: the user re-opens the STEP file. Its
    // fingerprint must match the project's record; nothing is downloaded.
    function reopen(file, entry, opts) {
        opts = opts || {};
        var job = runWorker(file, Object.assign({}, opts, { expectSha: entry.sha256 }));
        var promise = job.promise.then(function (r) {
            if (r.sha256 !== entry.sha256) { var e = new Error('This file is not the one the model was imported from (fingerprints differ).'); e.code = 'mismatch'; throw e; }
            var cache = opts.cache || { put: cachePut, putStep: stepPut };
            return Promise.resolve(cache.put(r.sha256, _cachePayload(r.sha256, r.model)))
                .then(function () { if (cache.putStep) return Promise.resolve(cache.putStep(r.sha256, file)).catch(function () {}); })
                .then(function () {
                    var E = root.SLCadZonal;
                    if (entry.partStore === 'local' && E && E.registerLocalParts) E.registerLocalParts(entry.sha256, projectEntry(r.model, {}).parts);
                    return { entry: entry, model: r.model, worker: r.worker || null, stream: r.stream || null };
                });
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
        isIges: isIges, isStep: isStep, cadFormat: cadFormat, igesGlobal: igesGlobal, cadSchema: cadSchema, cadLengthUnit: cadLengthUnit, NOT_CAD: NOT_CAD, ACCEPT: ACCEPT, EXPORT_GUIDE: EXPORT_GUIDE, exportGuideHtml: exportGuideHtml,
        bboxOf: bboxOf, centroidOf: centroidOf, decimate: decimate, makePid: makePid, buildModel: buildModel, convertStep: convertStep,
        walkParts: walkParts, attachTrails: attachTrails, findInstances: findInstances, _rigid: _rigid, _anchors: _anchors, worldPosition: worldPosition, normalizeGeometry: normalizeGeometry, parseStepAttributes: parseStepAttributes, bboxOfXf: bboxOfXf,
        projectEntry: projectEntry, containsGeometry: containsGeometry, addToProject: addToProject, nextRevision: nextRevision, reviseFrom: reviseFrom, getModel: getModel, latestModel: latestModel,
        trueBoxes: trueBoxes, placedBoxes: placedBoxes, _trace: _trace, _cachePayload: _cachePayload, packMeshes: packMeshes, unpackMeshes: unpackMeshes, pidsOf: pidsOf, matrices16: matrices16, colorAt: colorAt, packParts: packParts, unpackParts: unpackParts, sha256Hex: sha256Hex, openDb: openDb, cachePut: cachePut, cacheGet: cacheGet, cacheHas: cacheHas, stepPut: stepPut, stepGet: stepGet, stepHas: stepHas, DB_STEPS: DB_STEPS,
        workerUrl: workerUrl, runWorker: runWorker, importStep: importStep, finalizeImport: finalizeImport, reopen: reopen,
        parseZoneRows: parseZoneRows, readZoneFile: readZoneFile, handZones: handZones
    };
    root.SLCadImport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
