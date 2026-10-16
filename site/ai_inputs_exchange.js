// ============================================================================
// ai_inputs_exchange.js, v1.0, 16 Oct 2026: the shared AI inputs file.
// window.SLAiInputsExchange (page) + module.exports (node tests).
//
// WAQAS (16 Oct 2026, confirmed): the AI Assistant is a page of its own, where the AI inputs are
// put in and managed. People with all three tools (Safety Lab, Sys Lab, Cert Lab) share those
// inputs. Real sharing comes when Sys Lab and Cert Lab move onto the platform; until then the
// inputs move as a file in ONE format, identical in the three tools. This module is that format:
// writing it, checking it, and working out what an import would do. Deterministic code only: no
// AI, no randomness, no clock except the exportedAt stamp the caller can fix.
//
// The same text is in scratchpad/ai_inputs_format.md for the Sys Lab and Cert Lab builds.
//
// ---------------------------------------------------------------------------------------
// FORMAT "safetylab-ai-inputs", VERSION 1. Encoding: UTF-8 JSON. Suggested file name:
// "<project name> AI inputs.slai.json" (the reader checks the content, not the name).
//
// {
//   "format": "safetylab-ai-inputs",           exact string, required
//   "version": 1,                              integer, required
//   "exportedAt": "2026-10-16T09:30:00.000Z",  ISO 8601 UTC
//   "source": { "tool": "safety-lab" | "sys-lab" | "cert-lab", "projectName": string, "projectId": string | null },
//   "docs": [ {
//       "id": string,                 the doc's id in the tool that exported it
//       "name": string,               display name, usually the file name ("Propulsion SDD.pdf")
//       "kind": string,               lower-case extension of name without the dot ("pdf", "docx",
//                                     "reqif", "txt", ...); "text" when the name has no extension
//                                     (pasted text). Rule: kindOf() below.
//       "addedAt": ISO string | null, when it was added (UTC ISO 8601)
//       "addedBy": string | null,     who added it (display name or email), null when unknown
//       "controlled": boolean,        true = ITAR / proprietary: only process on the user's own AI backend
//       "revision": string | null,    the document revision: the stored one, else detected (revision rule)
//       "text": string,               the extracted text EXACTLY as stored, [p.N] page markers and line breaks kept
//       "tables": [ { "title": string, "markdown": string } ],   as stored, may be []
//       "sha256": hex,                lower-case hex SHA-256 of the UTF-8 bytes of "text"
//       "images": [ { "type": "image/png", "data": base64, "caption": string } ]   OPTIONAL (see IMAGES)
//   } ],
//   "fingerprint": hex                lower-case hex SHA-256 of canonical(docs), UTF-8
// }
//
// Required in every doc: id, name, kind, addedAt, addedBy, controlled, revision, text, tables,
// sha256. Optional: images. A reader ignores fields it does not know (top level and inside docs);
// a writer never adds a new REQUIRED field without bumping "version".
//
// CANONICAL JSON (the fingerprint): object keys sorted by plain JavaScript string order
// (Object.keys(o).sort(), UTF-16 code units), keys whose value is undefined left out, no spaces;
// arrays in their given order; strings, numbers, booleans and null exactly as JSON.stringify
// writes them. fingerprint = sha256_hex(utf8(canonical(docs))), docs as written in the file
// (images included when present). UTF-8 is what TextEncoder produces (a lone surrogate becomes
// U+FFFD). Hex is lower case, 64 characters.
//
// REVISION RULE: when the tool has no stored revision for a doc, the revision is the first capture
// of /\bRev(?:ision)?\.?\s*:?\s*([A-Z0-9]{1,4})\b/ in the first 3000 characters of the text (the
// same rule the zonal AI review uses to label passages); no match = null.
//
// PAGES: page markers are "[p.N]" at the start of each page's text, as the PDF reader writes them.
// They are part of "text" and are kept byte for byte. Pages = the number of distinct N; Word, text
// and ReqIF files have none.
//
// IMAGES: Safety Lab stores, per document, the diagrams it pulled out of a Word or PDF file as
// {type, data (base64, no "data:" prefix), caption}, at most 1.6 MB of base64 per image and 8 MB
// per project (an image over a limit is stored with data "" and its caption kept). The export
// includes "images" only when "Include diagrams" is ticked (the default) and only for docs that
// have any; such a file can be several MB. A reader that does not store images may drop them, but
// still checks the fingerprint over the docs as written.
//
// READING A FILE (verify, then preview, then apply):
//  1. Refuse when it is not JSON, "format" is not "safetylab-ai-inputs", "version" is not 1, or
//     "docs" is not an array.
//  2. Every doc: id a non-empty string, unique in the file; name and text strings; tables an
//     array; controlled a boolean; sha256(text) equal to its "sha256".
//  3. sha256(canonical(docs)) equal to "fingerprint".
//     Any failure refuses the WHOLE file ("This file is damaged or was changed after it was
//     exported"). Part of a damaged file is never imported.
//  4. Preview, each incoming doc against the docs already in the project, in this order:
//     identical: a doc already there has the same sha256 (same text). Nothing to do.
//     conflict:  else a doc already there has the same id, or the same name (trimmed, case
//                ignored). Shown as a different revision; the person picks keep mine / replace
//                with incoming / keep both. Default: keep both.
//     new:       anything else. Added.
//  5. Apply: "keep both" and "new" add the incoming doc; when its id is taken it gets
//     "doc-" + the first 12 hex of its sha256 (then "-2", "-3"...), and when its name is taken
//     " (imported)" goes before the extension (then " (imported 2)"...). "Replace" puts the
//     incoming doc in the place of the one it matched and keeps that doc's id, so references to
//     the document in this project still point at it. An incoming doc keeps its addedAt,
//     addedBy, revision and controlled flag; an import never clears a controlled flag (replace
//     keeps it on when either side has it).
//
// WHERE ELSE THE INPUTS TRAVEL (decided 16 Oct 2026): the Safety Lab project export (.slproj)
// already carries the same documents in its ai.json, in Safety Lab's own store shape
// (projectSourceDocs: {id, name, addedAt (ms number), addedBy?, controlled?, revision?, sha256?,
// text, tables, images}), and Sys Lab's Safety Lab import already merges ai.json; fromStoreDoc()
// below is the mapping from that shape to this format. A second copy in this format is NOT added
// to the .slproj (it would double a file that can hold several MB of documents). The zonal
// exchange file (zonal_exchange.js) does not carry AI inputs: Sys Lab reads zones and risks from
// it, not documents. So this file is the one way the tools share AI inputs.
//
// See tests/regression_ai_inputs_exchange_20261016.test.js (format) and
// tests/regression_ai_inputs_page_ui_20261016.test.js (the page, in a browser).
// ============================================================================
(function (root) {
    'use strict';

    var VERSION = '1.0';
    var FORMAT = 'safetylab-ai-inputs', FORMAT_VERSION = 1;
    var TOOLS = ['safety-lab', 'sys-lab', 'cert-lab'];
    var DAMAGED = 'This file is damaged or was changed after it was exported, so nothing was imported. Export it again from the tool it came from.';

    function _s(v) { return v == null ? '' : String(v); }
    function _arr(v) { return Array.isArray(v) ? v : []; }

    // ---- SHA-256 (FIPS 180-4), synchronous, over UTF-8 bytes ---------------------------------
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    // UTF-8 bytes. TextEncoder where there is one; the fallback writes the same bytes (a lone
    // surrogate becomes U+FFFD, EF BF BD, exactly as TextEncoder does).
    function utf8(str) {
        str = _s(str);
        if (typeof TextEncoder === 'function') return new TextEncoder().encode(str);
        var out = new Uint8Array(str.length * 3), n = 0;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
                var d = str.charCodeAt(i + 1);
                if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; } else c = 0xFFFD;
            } else if (c >= 0xD800 && c <= 0xDFFF) c = 0xFFFD;
            if (c < 0x80) out[n++] = c;
            else if (c < 0x800) { out[n++] = 0xC0 | (c >> 6); out[n++] = 0x80 | (c & 63); }
            else if (c < 0x10000) { out[n++] = 0xE0 | (c >> 12); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63); }
            else { out[n++] = 0xF0 | (c >> 18); out[n++] = 0x80 | ((c >> 12) & 63); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63); }
        }
        return out.subarray(0, n);
    }
    function sha256Bytes(bytes) {
        var l = bytes.length, nBlocks = Math.ceil((l + 9) / 64), buf = new Uint8Array(nBlocks * 64);
        buf.set(bytes); buf[l] = 0x80;
        var bits = l * 8, hi = Math.floor(bits / 0x100000000), lo = bits >>> 0, e = buf.length;
        buf[e - 8] = hi >>> 24; buf[e - 7] = (hi >>> 16) & 255; buf[e - 6] = (hi >>> 8) & 255; buf[e - 5] = hi & 255;
        buf[e - 4] = lo >>> 24; buf[e - 3] = (lo >>> 16) & 255; buf[e - 2] = (lo >>> 8) & 255; buf[e - 1] = lo & 255;
        var H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a, H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;
        var w = new Int32Array(64);
        for (var off = 0; off < buf.length; off += 64) {
            for (var t = 0; t < 16; t++) { var p = off + t * 4; w[t] = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]; }
            for (t = 16; t < 64; t++) {
                var x = w[t - 15], y = w[t - 2];
                var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
                var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
                w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
            }
            var a = H0, b = H1, c = H2, d = H3, f = H5, g = H6, h = H7, ee = H4;
            for (t = 0; t < 64; t++) {
                var S1 = ((ee >>> 6) | (ee << 26)) ^ ((ee >>> 11) | (ee << 21)) ^ ((ee >>> 25) | (ee << 7));
                var ch = (ee & f) ^ (~ee & g);
                var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
                var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
                var mj = (a & b) ^ (a & c) ^ (b & c);
                var t2 = (S0 + mj) | 0;
                h = g; g = f; f = ee; ee = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            H0 = (H0 + a) | 0; H1 = (H1 + b) | 0; H2 = (H2 + c) | 0; H3 = (H3 + d) | 0; H4 = (H4 + ee) | 0; H5 = (H5 + f) | 0; H6 = (H6 + g) | 0; H7 = (H7 + h) | 0;
        }
        return [H0, H1, H2, H3, H4, H5, H6, H7].map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
    }
    function sha256Hex(str) { return sha256Bytes(utf8(str)); }

    // ---- canonical JSON --------------------------------------------------------------------
    function canonical(v) {
        if (v === null || typeof v !== 'object') { var j = JSON.stringify(v); return j === undefined ? 'null' : j; }
        if (Array.isArray(v)) return '[' + v.map(function (x) { return x === undefined ? 'null' : canonical(x); }).join(',') + ']';
        return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort()
            .map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
    }
    function fingerprintOf(docs) { return sha256Hex(canonical(_arr(docs))); }

    // ---- per-document facts (the page shows these too) -------------------------------------
    function kindOf(name) {
        var m = /\.([A-Za-z0-9]{1,10})$/.exec(_s(name).trim());
        return m ? m[1].toLowerCase() : 'text';
    }
    var REV_RE = /\bRev(?:ision)?\.?\s*:?\s*([A-Z0-9]{1,4})\b/;
    function detectRevision(text) { var m = _s(text).slice(0, 3000).match(REV_RE); return m ? m[1] : null; }
    function revisionOf(doc) { var r = doc && doc.revision; return (r != null && _s(r).trim() !== '') ? _s(r).trim() : detectRevision(doc && doc.text); }
    function pageCount(text) {
        var re = /\[p\.(\d+)\]/g, m, seen = {}, n = 0, s = _s(text);
        while ((m = re.exec(s))) { if (!seen[m[1]]) { seen[m[1]] = 1; n++; } }
        return n;
    }
    function _iso(v) {
        if (v == null || v === '') return null;
        var t = typeof v === 'number' ? v : Date.parse(_s(v));
        if (!isFinite(t)) return null;
        try { return new Date(t).toISOString(); } catch (_) { return null; }
    }
    function _tables(t) { return _arr(t).map(function (x) { return { title: _s(x && x.title), markdown: _s(x && x.markdown) }; }); }
    function _images(im) { return _arr(im).map(function (x) { return { type: _s(x && x.type), data: _s(x && x.data), caption: _s(x && x.caption) }; }); }
    function _normName(n) { return _s(n).trim().toLowerCase(); }

    // A Safety Lab store doc as a file doc. opts.includeImages (default true).
    function fromStoreDoc(d, opts) {
        opts = opts || {};
        var text = _s(d && d.text);
        var out = {
            id: _s(d && d.id) || ('doc-' + sha256Hex(text).slice(0, 12)),
            name: _s(d && d.name) || 'document',
            kind: kindOf(d && d.name),
            addedAt: _iso(d && d.addedAt),
            addedBy: (d && d.addedBy) ? _s(d.addedBy) : null,
            controlled: !!(d && d.controlled),
            revision: revisionOf(d),
            text: text,
            tables: _tables(d && d.tables),
            sha256: sha256Hex(text)
        };
        var imgs = _images(d && d.images);
        if (opts.includeImages !== false && imgs.length) out.images = imgs;
        return out;
    }
    // A file doc as a Safety Lab store doc (the store's own size guards run when it is written).
    function toStoreDoc(x) {
        var t = Date.parse(_s(x.addedAt));
        var out = { id: _s(x.id), name: _s(x.name), addedAt: isFinite(t) ? t : null, addedBy: x.addedBy == null ? null : _s(x.addedBy),
            controlled: !!x.controlled, revision: x.revision == null ? null : _s(x.revision), text: _s(x.text), tables: _tables(x.tables),
            images: _images(x.images), sha256: _s(x.sha256) };
        return out;
    }

    // ---- writing -----------------------------------------------------------------------------
    // build(storeDocs, { tool, projectName, projectId, includeImages, ids, exportedAt })
    // ids: only these docs (the page's selection); omitted = all, in project order.
    function build(storeDocs, opts) {
        opts = opts || {};
        var want = Array.isArray(opts.ids) ? opts.ids.map(_s) : null;
        var docs = _arr(storeDocs).filter(function (d) { return d && (!want || want.indexOf(_s(d.id)) >= 0); })
            .map(function (d) { return fromStoreDoc(d, { includeImages: opts.includeImages }); });
        var tool = TOOLS.indexOf(opts.tool) >= 0 ? opts.tool : 'safety-lab';
        return {
            format: FORMAT, version: FORMAT_VERSION,
            exportedAt: _iso(opts.exportedAt != null ? opts.exportedAt : Date.now()),
            source: { tool: tool, projectName: _s(opts.projectName), projectId: opts.projectId == null || opts.projectId === '' ? null : _s(opts.projectId) },
            docs: docs,
            fingerprint: fingerprintOf(docs)
        };
    }
    function serialize(file) { return JSON.stringify(file, null, 1); }
    function fileName(projectName) {
        var base = _s(projectName).trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Project';
        return base + ' AI inputs.slai.json';
    }

    // ---- reading -------------------------------------------------------------------------------
    // verify(textOrObject) -> { ok: true, file } | { ok: false, code, message }. Plain messages.
    function verify(input) {
        var f = input;
        if (typeof input === 'string') {
            try { f = JSON.parse(input); } catch (_) { return { ok: false, code: 'not-json', message: 'This is not an AI inputs file: it is not readable as JSON.' }; }
        }
        if (!f || typeof f !== 'object' || Array.isArray(f)) return { ok: false, code: 'not-object', message: 'This is not an AI inputs file.' };
        if (f.format !== FORMAT) return { ok: false, code: 'format', message: 'This is not an AI inputs file (it is not in the "' + FORMAT + '" format).' };
        if (typeof f.version !== 'number' || f.version !== FORMAT_VERSION) {
            return { ok: false, code: 'version', message: (typeof f.version === 'number' && f.version > FORMAT_VERSION)
                ? 'This AI inputs file was made by a newer version of the format (version ' + f.version + '). Update this tool, then import it again.'
                : 'This AI inputs file has a version this tool does not read.' };
        }
        if (!Array.isArray(f.docs)) return { ok: false, code: 'docs', message: DAMAGED };
        var ids = {};
        for (var i = 0; i < f.docs.length; i++) {
            var d = f.docs[i];
            if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !d.id || typeof d.name !== 'string' || typeof d.text !== 'string'
                || !Array.isArray(d.tables) || typeof d.controlled !== 'boolean' || typeof d.sha256 !== 'string'
                || (d.images !== undefined && !Array.isArray(d.images))) return { ok: false, code: 'doc-shape', index: i, message: DAMAGED };
            if (ids[d.id]) return { ok: false, code: 'doc-dup', index: i, message: DAMAGED };
            ids[d.id] = 1;
            if (sha256Hex(d.text) !== d.sha256.toLowerCase()) return { ok: false, code: 'doc-sha', index: i, message: DAMAGED };
        }
        if (typeof f.fingerprint !== 'string' || fingerprintOf(f.docs) !== f.fingerprint.toLowerCase()) return { ok: false, code: 'fingerprint', message: DAMAGED };
        return { ok: true, file: f };
    }

    // preview(storeDocs, file) -> { entries: [{ index, incoming, status, match, choice }], counts }
    // status 'new' | 'identical' | 'conflict'; match = { id, name, by: 'sha'|'id'|'name' } or null.
    function preview(storeDocs, file) {
        var have = _arr(storeDocs).filter(Boolean).map(function (d) {
            return { id: _s(d.id), name: _s(d.name), nname: _normName(d.name), sha: (d.sha256 && /^[0-9a-f]{64}$/.test(d.sha256)) ? d.sha256 : sha256Hex(_s(d.text)), revision: revisionOf(d), chars: _s(d.text).length };
        });
        var counts = { 'new': 0, identical: 0, conflict: 0 };
        var entries = _arr(file && file.docs).map(function (x, i) {
            var sha = _s(x.sha256).toLowerCase(), m = null, st = 'new', i2;
            for (i2 = 0; i2 < have.length && !m; i2++) if (have[i2].sha === sha) m = { id: have[i2].id, name: have[i2].name, by: 'sha', revision: have[i2].revision, chars: have[i2].chars };
            if (m) st = 'identical';
            else {
                for (i2 = 0; i2 < have.length && !m; i2++) if (have[i2].id === _s(x.id)) m = { id: have[i2].id, name: have[i2].name, by: 'id', revision: have[i2].revision, chars: have[i2].chars };
                for (i2 = 0; i2 < have.length && !m; i2++) if (have[i2].nname === _normName(x.name)) m = { id: have[i2].id, name: have[i2].name, by: 'name', revision: have[i2].revision, chars: have[i2].chars };
                if (m) st = 'conflict';
            }
            counts[st]++;
            return { index: i, incoming: x, status: st, match: m, choice: st === 'conflict' ? 'both' : (st === 'new' ? 'add' : 'skip') };
        });
        return { entries: entries, counts: counts };
    }

    function _withSuffix(name, n) {
        var m = /^(.*?)(\.[A-Za-z0-9]{1,10})?$/.exec(_s(name));
        return (m[1] || 'document') + (n === 1 ? ' (imported)' : ' (imported ' + n + ')') + (m[2] || '');
    }
    // apply(storeDocs, previewResult, choices) -> { docs: new store list, summary }
    // choices: { [index]: 'keep' | 'replace' | 'both' } for conflict entries (default 'both').
    // Pure: the input list is not changed.
    function apply(storeDocs, pv, choices) {
        choices = choices || {};
        var out = _arr(storeDocs).filter(Boolean).map(function (d) { return Object.assign({}, d); });
        var summary = { added: [], replaced: [], kept: [], identical: [] };
        var idTaken = function (id) { return out.some(function (d) { return _s(d.id) === id; }); };
        var nameTaken = function (nm, exceptId) { var n = _normName(nm); return out.some(function (d) { return _normName(d.name) === n && _s(d.id) !== exceptId; }); };
        var freshId = function (x) { var base = 'doc-' + _s(x.sha256).slice(0, 12), id = base, k = 2; while (idTaken(id)) id = base + '-' + (k++); return id; };
        var freshName = function (nm) { if (!nameTaken(nm)) return nm; var k = 1, c = _withSuffix(nm, k); while (nameTaken(c)) c = _withSuffix(nm, ++k); return c; };
        _arr(pv && pv.entries).forEach(function (e) {
            var x = e.incoming;
            if (e.status === 'identical') { summary.identical.push(x.name); return; }
            var choice = e.status === 'conflict' ? (choices[e.index] || 'both') : 'add';
            if (choice === 'keep') { summary.kept.push(x.name); return; }
            var doc = toStoreDoc(x);
            if (choice === 'replace' && e.match) {
                var at = -1;
                out.forEach(function (d, i) { if (at < 0 && _s(d.id) === e.match.id) at = i; });
                if (at >= 0) {
                    doc.id = _s(out[at].id);
                    doc.controlled = !!(doc.controlled || out[at].controlled);   // an import never clears the flag
                    if (nameTaken(doc.name, doc.id)) doc.name = freshName(doc.name);
                    out[at] = doc;
                    summary.replaced.push(doc.name);
                    return;
                }
            }
            if (idTaken(doc.id)) doc.id = freshId(x);
            doc.name = freshName(doc.name);
            out.push(doc);
            summary.added.push(doc.name);
        });
        return { docs: out, summary: summary };
    }

    var api = {
        VERSION: VERSION, FORMAT: FORMAT, FORMAT_VERSION: FORMAT_VERSION, TOOLS: TOOLS.slice(), DAMAGED_MESSAGE: DAMAGED,
        sha256Hex: sha256Hex, sha256Bytes: sha256Bytes, utf8: utf8, canonical: canonical, fingerprintOf: fingerprintOf,
        kindOf: kindOf, detectRevision: detectRevision, revisionOf: revisionOf, pageCount: pageCount,
        fromStoreDoc: fromStoreDoc, toStoreDoc: toStoreDoc, build: build, serialize: serialize, fileName: fileName,
        verify: verify, preview: preview, apply: apply
    };
    try { root.SLAiInputsExchange = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
