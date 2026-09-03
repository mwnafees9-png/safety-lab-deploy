// ============================================================================
// reqif_bridge.js — v1.0 — the ReqIF exchange lane (OMG ReqIF 1.2).
// BORN MODULAR: new file, zero monolith edits.
//
// WHY THIS EXISTS: Jama is one vendor. DOORS Classic, DOORS Next, Polarion,
// Codebeamer, Windchill and Visure all speak ReqIF — it is THE aerospace
// OEM↔supplier requirements exchange standard, and it is FILE-BASED, so it
// works on air-gapped / ITAR programs where no REST API will ever be
// reachable. Same posture as the Jama live bridge, different transport:
//
//   EXPORT — the AFHA failure conditions leave as a .reqif package
//            (SPEC-OBJECTs typed "Failure Condition", ForeignID = FC id,
//            severity/phases/effects as attributes, one SPECIFICATION
//            hierarchy). The program imports it into THEIR tool.
//   HUMANS — their engineers trace requirements to the FC objects in their
//            tool (their system of record, their signature).
//   IMPORT — they export back; we read SPEC-RELATIONS touching our FC
//            objects and land the related requirements in
//            projectConfig.reqifBridge.relMap — the same tier-3 shape the
//            Jama bridge produces, merged into the same facade
//            (jbRelatedForFc), so the FHA panel chips and bow-tie ⛓ links
//            light up identically regardless of transport.
//
// Our FC objects are recognized on re-import by IDENTIFIER (SLA-FC-*) first,
// ForeignID (FC id) second — surviving tools that rewrite identifiers.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _x(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3500); } catch (_) {} }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _store() {
        const pc = _pc();
        if (!pc.reqifBridge) pc.reqifBridge = { fcMap: {}, relMap: {}, lastExport: '', lastImport: '' };
        if (!pc.reqifBridge.fcMap) pc.reqifBridge.fcMap = {};
        if (!pc.reqifBridge.relMap) pc.reqifBridge.relMap = {};
        return pc.reqifBridge;
    }
    function _fcs() { return ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).filter(f => f && f.fcId); }
    function _rid(f) { return 'SLA-FC-' + String(f.internalId).replace(/[^A-Za-z0-9_-]/g, '-'); }
    function _now() { return new Date().toISOString().replace(/\.\d+Z$/, 'Z'); }

    // ------------------------------------------------------------- EXPORT
    function reqifExport() {
        const fcs = _fcs();
        if (!fcs.length) { _toast('No failure conditions to export.', 'warn'); return; }
        const b = _store();
        const t = _now();
        const proj = (_pc().projectName || _pc().aircraftName || 'Safety Lab program');
        const attr = (defRef, val) => '<ATTRIBUTE-VALUE-STRING THE-VALUE="' + _x(val) + '"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>' + defRef + '</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>';
        const objects = fcs.map(f => {
            b.fcMap[String(f.internalId)] = { reqifId: _rid(f), fcId: f.fcId, at: t };
            return '<SPEC-OBJECT IDENTIFIER="' + _rid(f) + '" LAST-CHANGE="' + t + '" LONG-NAME="' + _x(f.fcId + ' — ' + (f.fcDesc || '')) + '">' +
                '<VALUES>' +
                attr('AD-FID', f.fcId) +
                attr('AD-TEXT', (f.fcDesc || '') + ' — AC: ' + (f.effAc || '—') + ' Crew: ' + (f.effCrew || '—') + ' Pax: ' + (f.effPax || '—')) +
                attr('AD-SEV', f.severity || '') +
                attr('AD-PHS', f.phases || '') +
                '</VALUES><TYPE><SPEC-OBJECT-TYPE-REF>SOT-FC</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT>';
        }).join('\n');
        const hierarchy = fcs.map((f, i) => '<SPEC-HIERARCHY IDENTIFIER="SH-' + i + '" LAST-CHANGE="' + t + '"><OBJECT><SPEC-OBJECT-REF>' + _rid(f) + '</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>').join('\n');
        const adef = (id, name) => '<ATTRIBUTE-DEFINITION-STRING IDENTIFIER="' + id + '" LAST-CHANGE="' + t + '" LONG-NAME="' + name + '"><TYPE><DATATYPE-DEFINITION-STRING-REF>DT-STR</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>';
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">\n' +
            '<THE-HEADER><REQ-IF-HEADER IDENTIFIER="SLA-HDR-' + Date.now().toString(36) + '">' +
            '<COMMENT>Aircraft FHA failure conditions — trace your requirements to these objects and export back.</COMMENT>' +
            '<CREATION-TIME>' + t + '</CREATION-TIME>' +
            '<REQ-IF-TOOL-ID>Safety Lab Aero</REQ-IF-TOOL-ID><REQ-IF-VERSION>1.0</REQ-IF-VERSION>' +
            '<SOURCE-TOOL-ID>safetylabaero.com</SOURCE-TOOL-ID>' +
            '<TITLE>' + _x(proj + ' — AFHA Failure Conditions') + '</TITLE>' +
            '</REQ-IF-HEADER></THE-HEADER>\n' +
            '<CORE-CONTENT><REQ-IF-CONTENT>\n' +
            '<DATATYPES><DATATYPE-DEFINITION-STRING IDENTIFIER="DT-STR" LAST-CHANGE="' + t + '" LONG-NAME="String" MAX-LENGTH="32000"/></DATATYPES>\n' +
            '<SPEC-TYPES>' +
            '<SPEC-OBJECT-TYPE IDENTIFIER="SOT-FC" LAST-CHANGE="' + t + '" LONG-NAME="Failure Condition"><SPEC-ATTRIBUTES>' +
            adef('AD-FID', 'ReqIF.ForeignID') + adef('AD-TEXT', 'ReqIF.Text') + adef('AD-SEV', 'Severity') + adef('AD-PHS', 'Flight Phases') +
            '</SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE>' +
            '<SPECIFICATION-TYPE IDENTIFIER="ST-AFHA" LAST-CHANGE="' + t + '" LONG-NAME="AFHA"/>' +
            '<SPEC-RELATION-TYPE IDENTIFIER="SRT-TRACE" LAST-CHANGE="' + t + '" LONG-NAME="Trace"/>' +
            '</SPEC-TYPES>\n' +
            '<SPEC-OBJECTS>\n' + objects + '\n</SPEC-OBJECTS>\n' +
            '<SPEC-RELATIONS/>\n' +
            '<SPECIFICATIONS><SPECIFICATION IDENTIFIER="SPEC-AFHA" LAST-CHANGE="' + t + '" LONG-NAME="' + _x(proj + ' — AFHA') + '"><TYPE><SPECIFICATION-TYPE-REF>ST-AFHA</SPECIFICATION-TYPE-REF></TYPE><CHILDREN>\n' + hierarchy + '\n</CHILDREN></SPECIFICATION></SPECIFICATIONS>\n' +
            '</REQ-IF-CONTENT></CORE-CONTENT>\n</REQ-IF>';
        b.lastExport = t;
        _save();
        // export-control awareness: the file lane is the APPROVED route for
        // controlled data, but the handler must know what the package holds.
        try {
            if (typeof window.exportControlForFc === 'function') {
                const hot = fcs.filter(f => { const e = window.exportControlForFc(f); return e === 'itar' || e === 'ear' || e === 'natl'; });
                if (hot.length) _toast('⚠ This ReqIF package contains ' + hot.length + ' export-controlled FC(s) (' + hot.slice(0, 4).map(f => f.fcId).join(', ') + (hot.length > 4 ? '…' : '') + ') — handle and transmit per your export-control procedures.', 'warn', 7000);
            }
        } catch (_) {}
        const blob = new Blob([xml], { type: 'application/xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'SafetyLab_AFHA_FCs_' + new Date().toISOString().slice(0, 10) + '.reqif';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        _toast(fcs.length + ' failure condition(s) exported as ReqIF — import into DOORS / Polarion / Codebeamer / Windchill, trace requirements to them, export back.', 'success', 5000);
        try { if (typeof window.renderRequirementsRepository === 'function') renderRequirementsRepository(); } catch (_) {}
        return xml;
    }

    // ------------------------------------------------------------- IMPORT
    // Namespace-agnostic readers (tools vary in prefixing).
    function _els(root, name) { return Array.prototype.slice.call(root.getElementsByTagName('*')).filter(e => e.localName === name); }
    function _el(root, name) { return _els(root, name)[0] || null; }
    function _txt(el) { return el ? String(el.textContent || '').trim() : ''; }

    function reqifParse(xmlText) {
        const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        if (_el(doc, 'parsererror')) throw new Error('Not valid XML / ReqIF.');
        // attribute-definition id → long-name (for value labeling)
        const defNames = {};
        _els(doc, 'ATTRIBUTE-DEFINITION-STRING').concat(_els(doc, 'ATTRIBUTE-DEFINITION-XHTML')).forEach(d => {
            defNames[d.getAttribute('IDENTIFIER')] = d.getAttribute('LONG-NAME') || d.getAttribute('IDENTIFIER');
        });
        // spec objects: id → {longName, values{defLongName: value}}
        const objs = {};
        _els(doc, 'SPEC-OBJECT').forEach(o => {
            const id = o.getAttribute('IDENTIFIER');
            const rec = { id, longName: o.getAttribute('LONG-NAME') || '', values: {} };
            _els(o, 'ATTRIBUTE-VALUE-STRING').forEach(v => {
                const ref = _txt(_el(v, 'ATTRIBUTE-DEFINITION-STRING-REF'));
                rec.values[defNames[ref] || ref] = v.getAttribute('THE-VALUE') || '';
            });
            _els(o, 'ATTRIBUTE-VALUE-XHTML').forEach(v => {
                const ref = _txt(_el(v, 'ATTRIBUTE-DEFINITION-XHTML-REF'));
                rec.values[defNames[ref] || ref] = _txt(_el(v, 'THE-VALUE'));
            });
            objs[id] = rec;
        });
        // relations: [{source, target}]
        const rels = _els(doc, 'SPEC-RELATION').map(r => {
            const src = _el(r, 'SOURCE'), tgt = _el(r, 'TARGET');
            return { source: _txt(src && _el(src, 'SPEC-OBJECT-REF')), target: _txt(tgt && _el(tgt, 'SPEC-OBJECT-REF')) };
        }).filter(r => r.source && r.target);
        return { objs, rels };
    }

    function reqifImportText(xmlText) {
        const b = _store();
        const { objs, rels } = reqifParse(xmlText);
        // recognize OUR FC objects: identifier first, ForeignID (FC id) second
        const fcByReqifId = {}, fcByFid = {};
        _fcs().forEach(f => { fcByReqifId[_rid(f)] = f; fcByFid[String(f.fcId)] = f; });
        const resolveFc = id => {
            if (fcByReqifId[id]) return fcByReqifId[id];
            const o = objs[id];
            const fid = o && (o.values['ReqIF.ForeignID'] || o.values['ForeignID']);
            return (fid && fcByFid[String(fid)]) || null;
        };
        const t = new Date().toISOString();
        let linked = 0; const touched = new Set();
        rels.forEach(r => {
            const combos = [[r.source, r.target], [r.target, r.source]];
            combos.forEach(([a, bId]) => {
                const fc = resolveFc(a);
                if (!fc || resolveFc(bId)) return;       // other side must be THEIR item
                const o = objs[bId]; if (!o) return;
                const iid = String(fc.internalId);
                if (!b.relMap[iid]) b.relMap[iid] = [];
                const key = o.values['ReqIF.ForeignID'] || o.values['ForeignID'] || o.id;
                if (b.relMap[iid].some(x => x.documentKey === key)) return;
                b.relMap[iid].push({
                    jamaId: null, documentKey: String(key),
                    name: o.longName || o.values['ReqIF.Name'] || String(o.values['ReqIF.Text'] || '').slice(0, 120),
                    description: String(o.values['ReqIF.Text'] || '').slice(0, 400),
                    itemType: null, pulledAt: t, via: 'reqif'
                });
                if (!b.fcMap[iid]) b.fcMap[iid] = { reqifId: _rid(fc), fcId: fc.fcId, at: t };
                linked++; touched.add(fc.fcId);
            });
        });
        b.lastImport = t;
        _save();
        try { if (typeof window.renderRequirementsRepository === 'function') renderRequirementsRepository(); } catch (_) {}
        return { linked, fcs: [...touched], objects: Object.keys(objs).length, relations: rels.length };
    }

    function reqifImport() {
        let inp = document.getElementById('reqif-file-input');
        if (!inp) {
            inp = document.createElement('input');
            inp.type = 'file'; inp.id = 'reqif-file-input'; inp.accept = '.reqif,.reqifz,.xml';
            inp.style.display = 'none';
            document.body.appendChild(inp);
        }
        inp.onchange = async function () {
            const file = inp.files && inp.files[0]; inp.value = '';
            if (!file) return;
            try {
                let text;
                if (/\.reqifz$/i.test(file.name)) {
                    // .reqifz is a zip — try JSZip if the app ships it; otherwise ask for the .reqif
                    if (typeof JSZip !== 'undefined') {
                        const zip = await JSZip.loadAsync(file);
                        const entry = Object.values(zip.files).find(f => /\.reqif$/i.test(f.name));
                        if (!entry) throw new Error('No .reqif inside the .reqifz package.');
                        text = await entry.async('string');
                    } else {
                        throw new Error('.reqifz (zipped) — unzip it and import the inner .reqif file.');
                    }
                } else {
                    text = await file.text();
                }
                const r = reqifImportText(text);
                _toast('ReqIF import: ' + r.relations + ' relation(s) read · ' + r.linked + ' new trace(s) onto ' + r.fcs.length + ' FC(s)' + (r.fcs.length ? ' (' + r.fcs.join(', ') + ')' : '') + '.', r.linked ? 'success' : 'info', 5000);
            } catch (e) { _toast(String((e && e.message) || e), 'warn', 5000); }
        };
        inp.click();
    }

    // ------------------------------------------ facade for the trace layer
    function reqifRelatedForFc(fcRow) {
        if (!fcRow) return [];
        const b = _store();
        const iids = [String(fcRow.internalId)];
        [].concat(fcRow.acTrace != null && fcRow.acTrace !== '' ? [fcRow.acTrace] : [], Array.isArray(fcRow.acTraces) ? fcRow.acTraces : [])
            .forEach(ref => iids.push(String(ref)));
        const out = [];
        iids.forEach(iid => (b.relMap[iid] || []).forEach(x => out.push(x)));
        return out;
    }

    window.reqifExport = reqifExport;
    window.reqifImport = reqifImport;
    window.reqifImportText = reqifImportText;   // programmatic path (tests, drops)
    window.reqifRelatedForFc = reqifRelatedForFc;
})();
