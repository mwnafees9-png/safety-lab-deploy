// ============================================================================
// cad_import_worker.js, v1.0: the Web Worker that reads a STEP file (13 Oct 2026).
//
// Runs off the page's main thread so a large aircraft never freezes the UI.
// The file bytes arrive from the page (transferred, never copied to a server),
// are fingerprinted (sha256), parsed and meshed by OpenCascade (WASM, the
// unmodified occt-import-js 0.0.23 build in vendor/occt, loaded here as its own
// file to keep the LGPL-2.1 terms simple), and the meshes go back to the page
// as transferable buffers. Nothing in this file talks to the network except
// the browser fetching our own vendor/occt files.
//
// Messages in : { type:'import', buffer:ArrayBuffer, expectSha:string|null, opts }
// Messages out: { type:'progress', phase, frac } ... then
//               { type:'result', sha256, model } or { type:'error', code, message }
// ============================================================================
/* global importScripts, SLCadImport */
'use strict';
importScripts('cad_import.js' + (self.location && self.location.search ? self.location.search : ''));

var _occtReady = null;
function occt() {
    if (!_occtReady) {
        importScripts(SLCadImport.OCCT_DIR + 'occt-import-js.js');
        _occtReady = self.occtimportjs({ locateFile: function (p) { return SLCadImport.OCCT_DIR + p; } });
    }
    return _occtReady;
}
function progress(phase, frac) { self.postMessage({ type: 'progress', phase: phase, frac: frac == null ? null : frac }); }

self.onmessage = function (ev) {
    var d = ev.data || {};
    if (d.type !== 'import') return;
    var bytes = new Uint8Array(d.buffer);
    progress('hash', 0);
    SLCadImport.sha256Hex(bytes).then(function (sha) {
        if (d.expectSha && d.expectSha !== sha) {
            self.postMessage({ type: 'error', code: 'mismatch', message: 'This file is not the one the model was imported from (fingerprints differ).' });
            return null;
        }
        progress('load', 0);
        return occt().then(function (oc) {
            var opts = Object.assign({}, d.opts || {}, { onProgress: progress });
            var model = SLCadImport.convertStep(bytes, oc, opts);
            var transfer = [];
            model.meshes.forEach(function (m) {
                transfer.push(m.position.buffer, m.index.buffer);
                if (m.normal) transfer.push(m.normal.buffer);
            });
            progress('done', 1);
            self.postMessage({ type: 'result', sha256: sha, model: model }, transfer);
        });
    }).catch(function (e) {
        self.postMessage({ type: 'error', code: 'failed', message: (e && e.message) || String(e) });
    });
};
