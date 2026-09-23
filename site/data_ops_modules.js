// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// data_ops_modules.js — v1.0 — Phase P2 batch 2b: data operations layer.
// MOVED VERBATIM from safety_lab.js (byte-exact; classic script loaded BEFORE the
// monolith; all names remain global). Pure runtime function declarations — zero
// load-time code. Contents: CSV/Excel import + migrations, autosave recovery,
// PDF export suite, sample project builder, DO-330 benchmark runner, backref +
// review-summary renderers.
var _sevPill = function (s, o) { return (typeof sevPillHtml === 'function') ? sevPillHtml(s, o) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // severity pill (helpers_modules.js); safe when helpers is not loaded (test sandboxes)
function triggerCSVImport(moduleTarget) {
    currentImportTarget = moduleTarget;
    if (moduleTarget.startsWith('Sys_') && !activeSystemId) { showToast("Please open a specific System Folder first.", 'warning', 4000); return; }
    document.getElementById('global-csv-import').click();
}

function processCSVUpload(event) {
    const file = event.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        try {
            if (currentImportTarget === 'Fault_Tree') importFaultTreeCSV(text);
            else if (currentImportTarget === 'Library') importComponentLibraryCSV(text);
            else importTabularCSV(text, currentImportTarget);
            slAlert(`Successfully imported data into ${currentImportTarget.replace('_', ' ')}.`, { title: 'Import complete' });
        } catch(error) { slAlert("Import Error: " + error.message, { title: 'Import error' }); }
        document.getElementById('global-csv-import').value = '';
    };
    reader.readAsText(file);
}

// --- Per-tab "Import from Excel" ---------------------------------------------
// Mirrors triggerCSVImport/processCSVUpload: reads an .xlsx/.xls workbook with
// SheetJS, converts the FIRST sheet to CSV text, then feeds it through the exact
// same per-tab importers (importTabularCSV / importFaultTreeCSV / importComponentLibraryCSV).
function triggerExcelImport(moduleTarget) {
    currentImportTarget = moduleTarget;
    if (moduleTarget && moduleTarget.startsWith('Sys_') && !activeSystemId) { showToast("Please open a specific System Folder first.", 'warning', 4000); return; }
    // Use the full Excel mapping importer (sheet → data type + per-column mapping + saved
    // templates) so users can map their own column headers when they don't match exactly.
    const mapInput = document.getElementById('import-xlsx-file');
    if (mapInput && typeof ExcelImport !== 'undefined' && ExcelImport && typeof ExcelImport.onFilePicked === 'function') {
        mapInput.click();
        return;
    }
    // Fallback: simple header-name-matched importer (first sheet only).
    document.getElementById('global-xlsx-import').click();
}

function processExcelUpload(event) {
    const file = event.target.files[0]; if (!file) return;
    const input = event.target;
    const loader = (typeof _loadSheetJS === 'function') ? _loadSheetJS() : Promise.resolve(window.XLSX);
    loader.then(function(XLSX) {
        if (!XLSX) throw new Error('Excel reader (SheetJS) is unavailable.');
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                if (!sheet) throw new Error('The workbook has no sheets.');
                const text = XLSX.utils.sheet_to_csv(sheet);   // reuse the CSV pipeline
                if (currentImportTarget === 'Fault_Tree') importFaultTreeCSV(text);
                else if (currentImportTarget === 'Library') importComponentLibraryCSV(text);
                else importTabularCSV(text, currentImportTarget);
                slAlert(`Successfully imported data into ${currentImportTarget.replace('_', ' ')} from Excel.`, { title: 'Import complete' });
            } catch (error) { slAlert("Excel Import Error: " + error.message, { title: 'Import error' }); }
            input.value = '';
        };
        reader.readAsArrayBuffer(file);
    }).catch(function(err) { slAlert("Could not load the Excel reader: " + (err && err.message || err), { title: 'Import error' }); input.value = ''; });
}

// ==========================================
// CSV EXPORT ENGINE
// ==========================================
// Escape a value for RFC-4180 CSV.
function csvEscape(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// Trigger a CSV download. BOM ensures Excel opens it as UTF-8.
function downloadCSV(filename, headers, rows) {
    const lines = [headers.map(csvEscape).join(',')];
    rows.forEach(r => lines.push(r.map(csvEscape).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}
// Flatten a fault tree to flat rows for CSV export.
function flattenFTAForExport(node, parentId, rows) {
    if (!node) return;
    // DAL type follows the same rule the canvas badge uses (FDAL/IDAL/DAL).
    const dalType = node.allocatedDAL ? dalPrefixForNode(node) : '';
    const libEntry = node.libraryKey ? (getActiveLibrary()[node.libraryKey] || {}) : {};
    rows.push([
        node.displayId || '', parentId || '',
        node.type === 'gate' ? (node.gateType || 'gate') : node.type,
        node.name || '',
        node.lambda != null ? node.lambda : '',
        node.probability != null ? node.probability : '',
        node.ccfGroup || '', node.beta || 0, node.votingK || '',
        node.dalOption || '', node.allocatedDAL || '', dalType,
        node.inputMode || '', node.libraryKey || '', libEntry.source || ''
    ]);
    const kids = node.children || node._children;
    if (kids) kids.forEach(c => flattenFTAForExport(c, node.displayId, rows));
}

// Dispatch table for every module wired to the Data Actions dropdowns.
// 'excel' and 'pdf' currently degrade to CSV; full Excel/PDF exporters are tracked as roadmap work.
function exportData(moduleName, format) {
    try {
        if (format !== 'csv') {
            console.info(`[Safety Lab Aero] ${String(format).toUpperCase()} export requested for ${moduleName}; emitting CSV. Full ${String(format).toUpperCase()} export is on the roadmap.`);
        }
        const today = new Date().toISOString().slice(0, 10);
        const file = (base) => `${base}_${today}.csv`;
        switch (moduleName) {
            case 'AC_Functions':
                return downloadCSV(file('AC_Functions'),
                    ['Function ID','Aircraft Function','Definition','Sub-Function ID','Sub-Function','Sub-Definition'],
                    acFunctionsData.map(r => [r.funcId, r.funcName, r.funcDef, r.subId, r.subName, r.subDef]));
            case 'AC_FCIM':
                return downloadCSV(file('AC_FCIM'),
                    ['Sub-Function','Awareness','Total Loss ID','Total Loss','Partial Loss ID','Partial Loss','Malfunction ID','Malfunction'],
                    acFcimData.map(r => [r.subId, r.awareness, r.tlId, r.tlDesc, r.plId, r.plDesc, r.mId, r.mDesc]));
            case 'AC_FHA': {
                // 31 Aug 2026 — the CSV is the deliverable: same order as the
                // worksheet (natural ascending fcId, phase groups clustered).
                const _acOrd = (typeof _fhaGroupRows === 'function') ? _fhaGroupRows(acFhaData).ordered : acFhaData;
                return downloadCSV(file('AC_FHA'),
                    ['Sub-Function','FC ID','Failure Condition','Phases','Effect on Aircraft','Effect on Crew','Effect on Pax','Aircraft Level','Crew Level','Pax Level','Severity','Assumption IDs','Comments'],
                    _acOrd.map(r => [r.subId, r.fcId, r.fcDesc, r.phases, r.effAc, r.effCrew, r.effPax, r.effAcLevel || '', r.effCrewLevel || '', r.effPaxLevel || '', r.severity, (r.assumptionIds || []).join('; '), r.comments]));
            }
            case 'AC_Requirements':
                return downloadCSV(file('AC_Requirements'),
                    ['Trace','Level','Type','Requirement Statement','Rationale'],
                    acReqData.map(r => [r.traceId, r.level, r.type, r.text, r.rat]));
            case 'AC_Assumptions':
                return downloadCSV(file('AC_Assumptions'),
                    ['Assumption ID','Origin','Statement','State','Linked Failure Conditions','Validation Strategy','Validation Artifacts','Verification Artifacts'],
                    acAssumptionsData.map(r => {
                        const links = getLinkedFHAs(r.asmId).map(l => `${l.scope}:${l.fcId}`).join('; ');
                        return [r.asmId, r.origin, r.text, r.state, links, r.valStrategy, r.valArtifact, r.verArtifact];
                    }));
            case 'Sys_Functions': {
                if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return; }
                return downloadCSV(file(`${sys().name}_Functions`),
                    ['AC Trace IDs','Function ID','Function','Definition'],
                    sys().functions.map(r => [
                        Array.isArray(r.traceIds) ? r.traceIds.join('; ') : (r.traceId || ''),
                        r.funcId, r.funcName, r.funcDef
                    ]));
            }
            case 'Sys_FCIM': {
                if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return; }
                return downloadCSV(file(`${sys().name}_FCIM`),
                    ['Sub-Function','Awareness','Total Loss ID','Total Loss','Partial Loss ID','Partial Loss','Malfunction ID','Malfunction'],
                    sys().fcim.map(r => [r.subId, r.awareness, r.tlId, r.tlDesc, r.plId, r.plDesc, r.mId, r.mDesc]));
            }
            case 'Sys_FHA': {
                if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return; }
                const _sysOrd = (typeof _fhaGroupRows === 'function') ? _fhaGroupRows(sys().fha).ordered : sys().fha;
                return downloadCSV(file(`${sys().name}_FHA`),
                    ['AC Trace','Sub-Function','FC ID','Failure Condition','Phases','Effect on Aircraft','Effect on Crew','Effect on Pax','Aircraft Level','Crew Level','Pax Level','Severity','Assumption IDs','Comments'],
                    _sysOrd.map(r => [r.acTrace, r.subId, r.fcId, r.fcDesc, r.phases, r.effAc, r.effCrew, r.effPax, r.effAcLevel || '', r.effCrewLevel || '', r.effPaxLevel || '', r.severity, (r.assumptionIds || []).join('; '), r.comments]));
            }
            case 'Sys_Requirements': {
                if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return; }
                return downloadCSV(file(`${sys().name}_Requirements`),
                    ['Trace','Level','Type','Requirement Statement','Rationale'],
                    sys().req.map(r => [r.traceId, r.level, r.type, r.text, r.rat]));
            }
            case 'Sys_Assumptions': {
                if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return; }
                return downloadCSV(file(`${sys().name}_Assumptions`),
                    ['Assumption ID','Origin','Statement','State','Linked Failure Conditions','Validation Strategy','Validation Artifacts','Verification Artifacts'],
                    sys().asm.map(r => {
                        const links = getLinkedFHAs(r.asmId).map(l => `${l.scope}:${l.fcId}`).join('; ');
                        return [r.asmId, r.origin, r.text, r.state, links, r.valStrategy, r.valArtifact, r.verArtifact];
                    }));
            }
            case 'Flight_Phases':
                return downloadCSV(file('Flight_Phases'),
                    ['Phase of Flight','Altitude From','Unit From','Altitude To','Unit To','Duration','Duration Unit'],
                    flightPhasesData.map(p => [p.phase, p.altFrom, p.altFromUnit, p.altTo, p.altToUnit, p.duration, p.durationUnit]));
            case 'PRA':
                return downloadCSV(file('PRA'),
                    ['PRA ID','Threat Source','Propagation Path','Target Systems','CSFL Impact Analysis','Mitigation Strategy'],
                    praData.map(r => [r.praId, r.threat, r.desc, r.systems, r.csfl, r.mitigation]));
            case 'ZSA':
                return downloadCSV(file('ZSA'),
                    ['Zone ID','Boundaries','Installed Equipment','Worst Severity','Interference Profile','Separation & Mitigations','Status','Assessed By','Assessment Method','Assessed On'],
                    zsaData.map(r => [r.zoneId, r.desc, r.equip, r.severity, r.interference, r.mitigation,
                        (typeof SLZsaRecord !== 'undefined' ? SLZsaRecord.statusText(r) : (r.findingStatus || '')), r.assessedBy || '',
                        (typeof SLZsaRecord !== 'undefined' ? SLZsaRecord.methodText(r) : (r.assessMethod || '')), r.assessedOn || '']));
            case 'CMA':
                // 17 Aug 2026 — CSV export was missing for CMA (fell through to the
                // "not yet implemented" default) while the PDF table provider below
                // already defined the columns. This mirrors that provider exactly.
                return downloadCSV(file('CMA'),
                    ['Scope','CMA ID','Subject','Independence Claim','Linked Gates','Modes','Findings','Mitigation','Status'],
                    (cmaData || []).map(c => [
                        (c.scope === 'system') ? ('System: ' + ((systemsData.find(s => s.id === c.owningSystemId) || {}).name || c.owningSystemId || '')) : 'Aircraft',
                        c.cmaId, c.subject, c.claim,
                        (c.linkedGateIds || []).join(', '),
                        (c.modes || []).join(', '),
                        c.findings, c.mitigation, c.status
                    ]));
            case 'HW_FMEA':
                // Phase 68 — FMEA is per-system; this per-tab export matches the on-screen
                // table (the open System Folder's rows), not every system at once.
                return downloadCSV(file('HW_FMEA'),
                    ['FTA Link','Component','Failure Mode','Local Effect','End Effect','Severity','Rate (lambda)','Time (t)','Calculated P'],
                    (fmeaData || []).filter(r => String(r.owningSystemId || '') === String(activeSystemId || '')).map(r => {
                        let target = null;
                        for (let page of ftaPages) { target = findNode(page.root, r.beId); if (target) break; }
                        return [target ? target.displayId : '(unknown)', r.part, r.mode, r.localEffect || '', r.endEffect || '', r.severity || '', r.rate, r.time, (r.prob || 0).toExponential(4)];
                    }));
            case 'Fault_Tree': {
                const rows = [];
                ftaPages.forEach(page => { if (page.root) flattenFTAForExport(page.root, '', rows); });
                return downloadCSV(file('Fault_Tree'),
                    ['Display ID','Parent ID','Type','Name','Lambda','Probability','CCF Group','Beta','Voting K','DAL Option','Allocated DAL','DAL Kind','Input Mode','Library Key','Library Source'],
                    rows);
            }
            case 'Library': {
                const active = getActiveLibrary();
                return downloadCSV(file('Component_Library'),
                    ['Key','Name','Group','Lambda','Source','Status'],
                    Object.entries(active).map(([key, def]) => {
                        const isCustom = !isBuiltinLibraryEntry(key);
                        const isOverride = !isCustom && projectConfig.customLibrary[key];
                        return [key, def.name, def.group || '', def.lambda, def.source || '',
                                isCustom ? 'custom' : (isOverride ? 'override' : 'built-in')];
                    }));
            }
            case 'Cutset_Analysis': {
                const rootNode = getActiveFTARoot();
                if (!rootNode) { showToast('No active fault tree to analyze.', 'warning', 4000); return; }
                let raw;
                try { raw = getCutsets(rootNode); }
                catch (err) { if (err && err.name === 'CutsetExplosionError') { slAlert('Fault tree too complex to enumerate cut sets (exceeds ' + _CUTSET_BUDGET.toLocaleString() + ' combinations). Simplify deep AND nesting / large voting gates or split with transfer gates; cut-set export aborted. Exact P(top) is still available in FTA quantification.', { title: 'Cut-set export aborted' }); return; } throw err; }
                const valid = raw.filter(c => c.length > 0).sort((a, b) => a.length - b.length);
                const min = [];
                for (let curr of valid) {
                    const ids = curr.map(e => e.id); let sup = false;
                    for (let m of min) if (m.map(e => e.id).every(id => ids.includes(id))) { sup = true; break; }
                    if (!sup) min.push(curr);
                }
                const finalCutsets = expandCCFCutsets(min);
                return downloadCSV(file('Cutset_Analysis'),
                    ['Cutset #','Order','Event IDs','Event Descriptions','Calculated Probability','Contains CCF'],
                    finalCutsets.map((cs, i) => [
                        i + 1, cs.length,
                        cs.map(e => e.displayId).join(' AND '),
                        cs.map(e => e.name).join(' AND '),
                        cs.reduce((acc, e) => acc * (e.probability || 0), 1).toExponential(4),
                        cs.some(e => e.isCCF) ? 'Yes' : 'No'
                    ]));
            }
            case 'Trace_Matrix': {
                const rows = [];
                const allSysFhas = getAllSysFha();
                acFhaData.forEach(ac => {
                    // 17 Aug 2026 — acTrace is not always a string (demo data carries
                    // arrays / non-string values); coerce instead of assuming .includes.
                    const linkedSys = allSysFhas.filter(s => {
                        const t = s.acTrace;
                        if (t == null || t === '') return false;
                        if (t === ac.fcId) return true;
                        if (Array.isArray(t)) return t.includes(ac.fcId);
                        return String(t).includes(ac.fcId);
                    });
                    if (linkedSys.length === 0) rows.push([ac.fcId, ac.severity, '(no system trace)', '', '']);
                    else linkedSys.forEach(s => rows.push([ac.fcId, ac.severity, s.fcId, s.severity, s.subId]));
                });
                return downloadCSV(file('Trace_Matrix'),
                    ['AC Hazard FC ID','AC Severity','System Hazard FC ID','System Severity','System Sub-Function'],
                    rows);
            }
            case 'Definitions':
                return downloadCSV(file('AC_1309_Definitions'),
                    ['Classification','Effect on Aircraft','Effect on Occupants','Effect on Flight Crew'],
                    [
                        ['Catastrophic','Normally with hull loss. A failure condition that would prevent continued safe flight and landing is Catastrophic.','Multiple fatalities.','Fatalities or incapacitation.'],
                        ['Hazardous','Large reduction in functional capabilities or safety margins.','Serious or fatal injury to a small number of persons other than the flightcrew.','Physical distress or excessive workload such that the flightcrew cannot be relied upon to perform their tasks accurately or completely.'],
                        ['Major','Significant reduction in safety margins or functional capabilities.','Physical distress, possibly including injuries.','A physical discomfort or significant increase in workload or in conditions impairing the efficiency of the flightcrew.'],
                        ['Minor','Slight reduction in functional capabilities or safety margins.','Physical discomfort.','Slight increase in workload (routine flight plan changes, emergency procedures well within crew capability).'],
                        ['No Safety Effect','No effect on operational capabilities or safety.','Inconvenience.','No effect on flightcrew workload.']
                    ]);
            // 30 Aug 2026 — EXPORT PARITY batch 1 (Waqas directive, 18 Aug: everything
            // on offer can get exported). These three buttons existed and fell through
            // to the "not yet implemented" alert. Each case MIRRORS ITS RENDERER'S
            // COLUMNS (the 17 Aug rule: never invent a schema), coerces defensively,
            // and exports FULL cell values — truncation is a screen affordance.
            case 'All_Requirements': {
                // Mirrors the Requirements repo table (renderReqsRepo): ID | System |
                // Trace | Level | Type | From | Requirement Statement | Val | Ver.
                // The export is always the ALL-scope view (System column included).
                const rows = [];
                const push = (r, sysName) => {
                    if (!r) return;
                    // defensive beyond the renderer (17 Aug lesson): demo data has
                    // carried traceIds as a STRING — an export must surface it, not drop it
                    const traceList = Array.isArray(r.traceIds) && r.traceIds.length ? r.traceIds
                        : (typeof r.traceIds === 'string' && r.traceIds.trim() ? [r.traceIds]
                        : (r.traceId ? [r.traceId] : []));
                    rows.push([
                        String(r.traceId || r.id || ('#' + (r.internalId || ''))),
                        sysName,
                        traceList.map(String).join(', '),
                        String(r.level || ''), String(r.type || ''), String(r.analysis || ''),
                        String(r.text || ''),
                        String(r.valStatus || r.valStatusLabel || '—'),
                        String(r.verStatus || r.verStatusLabel || '—')
                    ]);
                };
                (acReqData || []).forEach(r => push(r, 'Aircraft'));
                (systemsData || []).forEach(sy => (sy.req || []).forEach(r => push(r, String(sy.name || sy.id || ''))));
                return downloadCSV(file('All_Requirements'),
                    ['ID','System','Trace','Level','Type','From','Requirement Statement','Val Status','Ver Status'],
                    rows);
            }
            case 'VV_Status': {
                // Mirrors the V&V status roll-up (renderVVStatusPage): ID | Scope |
                // Level | Type | From | Statement | Val Status | Ver Status — statuses
                // NORMALIZED to the same three labels the page's badges show. Exports
                // the full roll-up (the page's filter chips are a transient view).
                const norm = (v) => {
                    // the fallback REPLICATES _vvNormStatus (it must agree with the page
                    // even in a context where helpers has not loaded)
                    let k;
                    if (typeof _vvNormStatus === 'function') k = _vvNormStatus(v);
                    else {
                        const t = (v || '').toString().toLowerCase().trim();
                        if (!t || t === '—' || t === '-') k = 'open';
                        else if (t.indexOf('complete') >= 0 || t.indexOf('closed') >= 0 || t.indexOf('verified') >= 0 || t.indexOf('validated') >= 0) k = 'closed';
                        else if (t.indexOf('progress') >= 0 || t.indexOf('partial') >= 0 || t.indexOf('draft') >= 0) k = 'in-progress';
                        else k = 'open';
                    }
                    return { 'open': 'Open', 'in-progress': 'In progress', 'closed': 'Closed' }[k] || 'Open';
                };
                const all = (typeof _vvAllRequirements === 'function') ? _vvAllRequirements() : (() => {
                    const l = [];
                    (acReqData || []).forEach(r => l.push({ ...r, __sysName: 'Aircraft' }));
                    (systemsData || []).forEach(sy => (sy.req || []).forEach(r => l.push({ ...r, __sysName: String(sy.name || sy.id || '') })));
                    return l;
                })();
                return downloadCSV(file('VV_Status'),
                    ['ID','Scope','Level','Type','From','Statement','Val Status','Ver Status'],
                    (all || []).map(r => [
                        String(r.traceId || r.id || ('#' + (r.internalId || ''))),
                        String(r.__sysName || ''),
                        String(r.level || ''), String(r.type || ''), String(r.analysis || ''),
                        String(r.text || ''),
                        norm(r.valStatus), norm(r.verStatus)
                    ]));
            }
            case 'Items': {
                // Mirrors the Items register (renderItems, minus the Actions column):
                // Item ID | Name | Failure Rate | Type | DAL | DA Type | Owning System |
                // Zone | Functions | Description — with the renderer's own defaults
                // (type 'HW+SW', DAL 'E', DA type 'IDAL', 'Aircraft-level' owner).
                const sysName = (id) => {
                    if (!id) return 'Aircraft-level';
                    const sy = (systemsData || []).find(x => String(x.id) === String(id));
                    return sy ? String(sy.name || sy.id) : String(id);
                };
                return downloadCSV(file('Items'),
                    ['Item ID','Name','Failure Rate (per hr)','Type','DAL','DA Type','Owning System','Zone','Functions','Description'],
                    (itemsData || []).map(r => [
                        String(r.itemId || ''), String(r.name || ''),
                        (Number(r.rate) > 0 ? Number(r.rate).toExponential(4) : ''),
                        String(r.type || 'HW+SW'), String(r.dal || 'E'), String(r.daType || 'IDAL'),
                        sysName(r.owningSystemId), String(r.zoneId || ''),
                        (Array.isArray(r.traceIds) ? r.traceIds.map(String).join(', ') : String(r.traceIds || '')),
                        String(r.description || '')
                    ]));
            }
            // 30 Aug 2026 — EXPORT PARITY batch 2a: the R&M lane. Neither analysis had
            // ANY export path (Waqas directive, 18 Aug). Both mirror their renderer's
            // computed output and inherit the engines' own REFUSAL discipline — an
            // export never invents what the engine would not show.
            case 'RM_Predictions': {
                // Mirrors RAM_PREDICT's computed output (ram_predict.js renderPage +
                // compute): per-part rows with handbook citations, then the totals the
                // page states. Refusals surface the ENGINE'S message verbatim.
                const RP = (typeof window !== 'undefined' && window.RAM_PREDICT) || null;
                if (!RP || typeof RP.predict !== 'function') { showToast('Reliability prediction engine not loaded in this session.', 'warning', 4000); return; }
                const st = (projectConfig && projectConfig.ram && projectConfig.ram.predict) || null;
                if (!st || !Array.isArray(st.rows) || !st.rows.length) { showToast('No parts in the prediction yet. Add part categories on the R&M prediction page first.', 'warning', 4000); return; }
                let r;
                try { r = RP.predict(st.rows, st.env); }
                catch (e) { slAlert('Export refused, same as the engine: ' + e.message, { title: 'Export refused' }); return; }
                const rows = r.rows.map(x => [
                    String(x.name || ''), String(x.qty), String(x.lambdaG),
                    String(x.quality || ''), String(x.piQ),
                    Number(x.contrib).toFixed(4), String(x.cite || '')
                ]);
                rows.push(['TOTAL λ_EQUIP', '', '', '', '', Number(r.lambdaTotal).toFixed(4),
                    'MTBF ' + (r.mtbfHrs ? Math.round(r.mtbfHrs).toLocaleString() + ' h' : '—')
                    + ' · environment ' + r.env + ' (' + (r.envName || '') + ') · ' + (r.source || '')]);
                return downloadCSV(file('RM_Predictions'),
                    ['Part category','N','λg (/10⁶h)','Quality','πQ','Contribution (/10⁶h)','Handbook citation'],
                    rows);
            }
            case 'Markov_Models': {
                // Mirrors the mission-time answer table markov_ctmc.js appends to the
                // Markov page: Model | P(failed at T) | P(failed, steady) | Receipt —
                // plus a Notes column carrying what the renderer inlines in the Model
                // cell (warnings, REFUSED reasons, the phased §I.2.9 line).
                const models = (projectConfig && projectConfig.markovModels) || [];
                if (!models.length) { showToast('No Markov models in this project yet.', 'warning', 4000); return; }
                const canSolve = (typeof window !== 'undefined') && typeof window.validateMarkovModel === 'function' && typeof window.solveMarkovTransient === 'function';
                if (!canSolve) { showToast('Markov solver not loaded in this session. Open the Markov Models tab once, then export.', 'warning', 4000); return; }
                const T = (typeof ftaConfig === 'object' && ftaConfig && parseFloat(ftaConfig.exposureTime)) || 1;
                const rows = models.map(m => {
                    const v = window.validateMarkovModel(m);
                    if (!v.ok) return [String(m.name || ''), 'REFUSED', String(T), '', '', '', '', '', v.errors.join(' · ')];
                    const tr = window.solveMarkovTransient(m, T);
                    const ss = (typeof solveMarkovModel === 'function') ? solveMarkovModel(m) : { ok: false };
                    const notes = [];
                    if (v.warnings && v.warnings.length) notes.push(v.warnings.join(' · '));
                    if (m.phasePlan && m.phasePlan.enabled && typeof window.solveMarkovPhased === 'function') {
                        const ph = window.solveMarkovPhased(m);
                        notes.push(ph.ok
                            ? 'phased (§I.2.9): ' + ph.pFailed.toExponential(4) + ' over ' + ph.legs.length + ' phases / ' + ph.missionHours.toFixed(2) + ' FH'
                                + (ph.excluded && ph.excluded.length ? ' · excluded: ' + ph.excluded.join(' · ') : '')
                            : 'phased REFUSED — ' + ph.reason);
                    }
                    return [
                        String(m.name || ''), 'OK', String(T),
                        (tr.ok ? tr.pFailed.toExponential(4) : String(tr.reason || '')),
                        (ss.ok ? ss.pFailed.toExponential(4) : '—'),
                        (tr.ok ? String(tr.receipt.method) : ''),
                        (tr.ok ? tr.receipt.Lambda.toExponential(2) : ''),
                        (tr.ok ? String(tr.receipt.terms) + ' terms · tol ' + tr.receipt.tol : ''),
                        notes.join(' | ')
                    ];
                });
                return downloadCSV(file('Markov_Models'),
                    ['Model','Status','T (FH)','P(failed at T)','P(failed, steady)','Method','Λ','Receipt','Notes'],
                    rows);
            }
            // 30 Aug 2026 — EXPORT PARITY batch 2b: the last four no-path analyses
            // (HF register, event trees, STPA UCAs, MMEL/MLAS). Same rules: mirror
            // the renderer, coerce defensively, inherit each engine's refusals.
            case 'HF_Register': {
                // Mirrors the typed-assumptions register (hf_register_panel.js):
                // Assumption | Type | credited/uncredited lanes | Holds now | State,
                // plus Scope and the HFA task detail the hf rows expose.
                const HF = (typeof window !== 'undefined' && window.HF_ASSUMPTIONS) || null;
                if (!HF || typeof HF.asmAllTyped !== 'function') { showToast('HF register engine not loaded in this session. Open the Human Factors page once, then export.', 'warning', 4000); return; }
                const all = HF.asmAllTyped().filter(a => a.type || a.credited != null || a.uncredited != null);
                if (!all.length) { showToast('No typed assumptions in the HF register yet.', 'warning', 4000); return; }
                return downloadCSV(file('HF_Register'),
                    ['Scope','Assumption','Type','Credited lane','Uncredited lane','Holds now','State','HFA detail'],
                    all.map(a => {
                        const validated = (typeof HF.isValidated === 'function') ? HF.isValidated(a.state) : /validated|verified/i.test(String(a.state || ''));
                        const holds = validated ? 'credited' : 'uncredited (conservative)';
                        const h = a.hf || null;
                        const det = (a.type === 'hf' && h)
                            ? ['direction ' + (h.direction || '—'), 'phase ' + (h.responsePhase || '—'), 'crew ' + (h.crewmember || '—'),
                               (h.taskTimeS != null ? 'task ' + h.taskTimeS + 's (' + (h.taskTimeBasis || 'unstated basis') + ')' : 'task time unstated')].join(' · ')
                            : '';
                        return [String(a.scope || ''), String(a.text || ''), String(a.typeLabel || a.type || ''),
                                String(a.credited == null ? '' : a.credited), String(a.uncredited == null ? '' : a.uncredited),
                                holds, String(a.state || 'Open'), det];
                    }));
            }
            // 30 Aug 2026 — HF's OWN ANALYSES (Waqas: "human factors is not just
            // about assumptions"). Same rules as every export: mirror the module's
            // renderer, inherit its refusal posture, invent nothing.
            case 'HF_Allocation': {
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function') { showToast('HF analyses module not loaded in this session. Open the Function Allocation page once, then export.', 'warning', 4000); return; }
                const fns = (typeof acFunctionsData !== 'undefined' && Array.isArray(acFunctionsData)) ? acFunctionsData : [];
                if (!fns.length) { showToast('No functions to allocate yet. Build the Functions lane first.', 'warning', 4000); return; }
                const byKey = {};
                HX._read('alloc').rows.forEach(r => { byKey[String(r.key)] = r; });
                return downloadCSV(file('HF_Allocation'),
                    ['Sub-function','Name','Allocated to','Rationale'],
                    fns.map(f => {
                        const r = byKey[String(f.internalId)] || {};
                        return [String(f.subId || ''), String(f.subName || ''), String(r.allocation || 'UNALLOCATED'), String(r.rationale || '')];
                    }));
            }
            case 'HF_HEA': {
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function') { showToast('HF analyses module not loaded in this session. Open the Human Error Analysis page once, then export.', 'warning', 4000); return; }
                const rows = HX._read('hea').rows;
                if (!rows.length) { showToast('No error rows in the human error analysis yet.', 'warning', 4000); return; }
                return downloadCSV(file('HF_HEA'),
                    ['ID','Task assumption','Task','Error mode (NUREG/CR-1278)','Effect','Detection','Recovery','Feeds FC'],
                    rows.map(r => [String(r.heaId || ''), String(r.asmId || ''), String(r.task || ''), String(r.errorMode || ''),
                                   String(r.effect || ''), String(r.detection || ''), String(r.recovery || ''), String(r.fcIds || '')]));
            }
            case 'HF_Alerts': {
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function') { showToast('HF analyses module not loaded in this session. Open the Crew Alerting page once, then export.', 'warning', 4000); return; }
                const rows = HX._read('alerts').rows;
                if (!rows.length) { showToast('No alerts in the crew alerting inventory yet.', 'warning', 4000); return; }
                return downloadCSV(file('HF_Alerts'),
                    ['ID','Alert','Priority (25.1322)','Modality','Cited by FC','Notes'],
                    rows.map(r => [String(r.alertId || ''), String(r.name || ''), String(r.priority || ''), String(r.modality || ''),
                                   String(r.fcIds || ''), String(r.notes || '')]));
            }
            case 'HF_Tasks': {
                // 30 Aug 2026 — task-first task analysis (Waqas: "it does not
                // start with just an assumption"). Authored crew tasks; the
                // credited link (asmId) shows which earned register places.
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function') { showToast('HF analyses module not loaded in this session. Open the Task Analysis page once, then export.', 'warning', 4000); return; }
                const rows = HX._read('tasks').rows;
                if (!rows.length) { showToast('No crew tasks authored yet.', 'warning', 4000); return; }
                return downloadCSV(file('HF_Tasks'),
                    ['ID','Phases','Crewmember','Task','Reaction (s)','Execution (s)','Response (s)','Time basis','Channels (HIDH)','Credited as','Notes'],
                    rows.map(r => [String(r.taskId || ''), String(r.phase || ''), String(r.crewmember || ''), String(r.task || ''),
                                   String(r.reactionS || ''), String(r.execS || ''), String((HX.taskResponseS ? HX.taskResponseS(r) : r.timeS) || ''), String(r.basis || ''), String(r.channels || ''), String(r.asmId || 'not credited'), String(r.notes || '')]));
            }
            case 'HF_Ergo': {
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function') { showToast('HF analyses module not loaded in this session. Open the Ergonomics page once, then export.', 'warning', 4000); return; }
                const rows = HX._read('ergo').rows;
                if (!rows.length) { showToast('No ergonomics evaluations authored yet.', 'warning', 4000); return; }
                return downloadCSV(file('HF_Ergo'),
                    ['ID','Item','Criterion (cite)','Finding','Status','Notes'],
                    rows.map(r => [String(r.ergoId || ''), String(r.item || ''), String(r.clause || ''), String(r.finding || ''), String(r.status || ''), String(r.notes || '')]));
            }
            case 'HF_ControlsDisplays': {
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function') { showToast('HF analyses module not loaded in this session. Open the Controls & Displays page once, then export.', 'warning', 4000); return; }
                const rows = HX._read('cd').rows;
                if (!rows.length) { showToast('No controls & displays evaluations authored yet.', 'warning', 4000); return; }
                return downloadCSV(file('HF_ControlsDisplays'),
                    ['ID','Item','Kind','§25.1302 consideration','Supports','Finding','Status','Notes'],
                    rows.map(r => [String(r.cdId || ''), String(r.item || ''), String(r.kind || ''), String(r.consideration || ''), String(r.supports || ''), String(r.finding || ''), String(r.status || ''), String(r.notes || '')]));
            }
            case 'HF_FunctionAllocation': {
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function' || typeof HX._functions !== 'function') { showToast('HF analyses module not loaded in this session. Open the Function Allocation page once, then export.', 'warning', 4000); return; }
                const fns = HX._functions();
                if (!fns.length) { showToast('No aircraft sub-functions defined yet. Allocation is keyed to the functions lane.', 'warning', 4000); return; }
                const byKey = {};
                HX._read('alloc').rows.forEach(r => { byKey[String(r.key)] = r; });
                // Every sub-function is a line, allocated or not: an unallocated row exporting
                // as blank IS the finding, and dropping it would hide the gap the lane exists for.
                return downloadCSV(file('HF_FunctionAllocation'),
                    ['Sub-function','Name','Allocated to','Rationale'],
                    fns.map(f => { const r = byKey[String(f.internalId)] || {}; return [String(f.subId || ''), String(f.subName || ''), String(r.allocation || ''), String(r.rationale || '')]; }));
            }
            case 'HF_TaskIdentification': {
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function') { showToast('HF analyses module not loaded in this session. Open the Task Identification page once, then export.', 'warning', 4000); return; }
                const rows = HX._read('tid').rows;
                if (!rows.length) { showToast('No task steps identified yet.', 'warning', 4000); return; }
                return downloadCSV(file('HF_TaskIdentification'),
                    ['Task ID','Proc ID','Procedure','Mode','Phase','Task step','Definition','Crew','Trigger','Source','Notes'],
                    rows.map(r => [String(r.taskId || ''), String(r.procId || ''), String(r.procName || ''), String(r.opsMode || ''), String(r.phase || ''), String(r.taskName || ''), String(r.taskDef || ''), String(r.crew || ''), String(r.trigger || ''), String(r.source || ''), String(r.notes || '')]));
            }
            case 'HF_SituationAwareness': {
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function') { showToast('HF analyses module not loaded in this session. Open the Situation Awareness page once, then export.', 'warning', 4000); return; }
                const rows = HX._read('sa').rows;
                if (!rows.length) { showToast('No situation-awareness elements authored yet.', 'warning', 4000); return; }
                return downloadCSV(file('HF_SituationAwareness'),
                    ['ID','SA element','Level','Cue / source','Phase','Finding','Status','Notes'],
                    rows.map(r => [String(r.saId || ''), String(r.element || ''), String(r.level || ''), String(r.cue || ''), String(r.phase || ''), String(r.finding || ''), String(r.status || ''), String(r.notes || '')]));
            }
            case 'HF_MFC': {
                const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
                if (!HX || typeof HX._read !== 'function') { showToast('HF analyses module not loaded in this session. Open the Minimum Flight Crew page once, then export.', 'warning', 4000); return; }
                const st = HX._read('mfc') || {};
                const fnRows = st.rows || [], factors = st.factors || {}, concl = st.conclusion || {};
                const byKey = {}; fnRows.forEach(r => { byKey[String(r.key)] = r; });
                const FN = HX.MFC_FUNCTIONS || [], FAC = HX.MFC_FACTORS || [];
                const anyFn = fnRows.some(r => r.role || r.bedford || r.note);
                const anyFac = Object.keys(factors).some(k => String(factors[k] || '').trim());
                if (!anyFn && !anyFac && !concl.minCrew && !concl.rationale) { showToast('No minimum-flight-crew determination authored yet.', 'warning', 4000); return; }
                const out = [];
                FN.forEach(f => { const r = byKey[f.key] || {}; out.push(['Basic workload function', String(f.label || ''), String(r.role || ''), 'Bedford ' + String(r.bedford || '') + (r.note ? (' — ' + r.note) : '')]); });
                FAC.forEach((f, i) => { out.push(['Workload factor', '(' + (i + 1) + ') ' + String(f), String(factors[i] || ''), '']); });
                out.push(['Determination', 'Minimum flight crew (§25.1523)', String(concl.minCrew || ''), String(concl.rationale || '')]);
                return downloadCSV(file('HF_MFC'),
                    ['Section','Item','Assignment / disposition','Bedford / note / rationale'],
                    out);
            }
            case 'Event_Trees': {
                // Mirrors the ETA outcome enumeration (event_trees.js etaEvaluate):
                // one row per OUTCOME with the full barrier sequence, path probability,
                // frequency, assessed severity and FHA link. A tree the engine REFUSES
                // (2^n outcome budget) exports as one REFUSED row carrying the
                // engine's own message — never a partial enumeration.
                const trees = (typeof window !== 'undefined' && typeof window.etaStore === 'function') ? window.etaStore() : ((projectConfig && projectConfig.eventTrees) || []);
                if (!trees.length) { showToast('No event trees in this project yet.', 'warning', 4000); return; }
                if (typeof window === 'undefined' || typeof window.etaEvaluate !== 'function') { showToast('Event-tree engine not loaded in this session. Open the Event Trees page once, then export.', 'warning', 4000); return; }
                const rows = [];
                trees.forEach(t => {
                    let ev;
                    try { ev = window.etaEvaluate(t); }
                    catch (e) { rows.push([String(t.id || ''), String(t.name || ''), 'REFUSED', '', '', '', '', '', '', String(e.message || e)]); return; }
                    ev.outcomes.forEach(o => rows.push([
                        String(t.id || ''), String(t.name || ''), 'OK',
                        String((t.initiator && t.initiator.desc) || ''),
                        (ev.freq ? Number(ev.freq).toExponential(3) : ''),
                        (o.seq || []).join(' → '),
                        Number(o.prob).toExponential(4),
                        Number(o.freq).toExponential(4),
                        String(o.severity || ''), String(o.linkedFcId || '') + (o.note ? (' · ' + o.note) : '')
                    ]));
                    if (!ev.closed) rows.push([String(t.id || ''), String(t.name || ''), 'CHECK', '', '', 'Σp over outcomes', Number(ev.sum).toPrecision(6), '', '', 'path probabilities do not sum to 1 — barrier probability out of range']);
                });
                return downloadCSV(file('Event_Trees'),
                    ['Tree','Name','Status','Initiator','Initiator freq (/FH)','Sequence','P(path)','Frequency (/FH)','Severity','Linked FC / note'],
                    rows);
            }
            case 'STPA_UCAs': {
                // Mirrors the UCA discipline in stpa_core.ucaSeeds: every control
                // action × guide phrase, with disposition, J3307 context clause and
                // spine links. The ENGINE'S refusals (silent dismissal, assessed
                // without context, dangling hazard link) surface VERBATIM — an export
                // must not launder a register the engine itself rejects.
                const ENG2 = (typeof window !== 'undefined' && window.STPA) || null;
                if (!ENG2 || typeof ENG2.ucaSeeds !== 'function') { showToast('STPA engine not loaded in this session. Open the STPA page once, then export.', 'warning', 4000); return; }
                const sd = (typeof stpaData !== 'undefined' && stpaData) || null;
                if (!sd || !sd.cs || !(sd.cs.actions || []).length) { showToast('No STPA control structure yet. Author control actions on the STPA page first.', 'warning', 4000); return; }
                let seeds;
                try { seeds = ENG2.ucaSeeds(sd.cs, sd.dispositions || {}, sd); }
                catch (e) { slAlert('Export refused, same as the engine: ' + e.message, { title: 'Export refused' }); return; }
                return downloadCSV(file('STPA_UCAs'),
                    ['UCA ID','Controller','Control action','Guide phrase','Status','Context (J3307 §7.3.1.2)','Hazard links','FC links (legacy)','Rationale','UCA statement'],
                    seeds.map(u => [
                        String(u.ucaId || ''), String(u.controller || ''), String(u.action || ''), String(u.phrase || ''),
                        String(u.status || 'open'), String(u.context || ''),
                        (u.hazardIds || []).join(', '), (u.fcIds || []).join(', '),
                        String(u.rationale || ''), String(u.text || '')
                    ]));
            }
            case 'MMEL_MLAS': {
                // Mirrors the MMEL/MLAS table (mmel_module.js): Item | Equipment |
                // ATA | Inst/Req | Category | Protection check | Quantitative |
                // TLD max | (m)/(o) procedures | State.
                const mm = (projectConfig && projectConfig.mmel) || null;
                const items = (mm && Array.isArray(mm.items)) ? mm.items : [];
                if (!items.length) { showToast('No MMEL/MLAS items in this project yet.', 'warning', 4000); return; }
                return downloadCSV(file('MMEL_MLAS'),
                    ['Item','Equipment','ATA','Installed','Required','Category','TLD max (days)','Protection check','Quantitative (dispatched)','(m) procedure','(o) procedure','State'],
                    items.map(it => [
                        String(it.id || ''), String(it.title || ''), String(it.ata || ''),
                        String(it.installed == null ? '' : it.installed), String(it.required == null ? '' : it.required),
                        String(it.category || ''), String(it.catDays == null ? '' : it.catDays),
                        String(it.protection || ''), String(it.quant || ''),
                        String(it.mProc || ''), String(it.oProc || ''), String(it.state || '')
                    ]));
            }
            default:
                slAlert(`Export for "${moduleName}" is not yet implemented.`, { title: 'Export' });
        }
    } catch (err) {
        console.error('Export error', err);
        slAlert('Export failed: ' + err.message, { title: 'Export failed' });
    }
}

function csvToArray(text) {
    let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
    for (let l of text) {
        if ('"' === l) { if (s && l === p) row[i] += l; s = !s; } else if (',' === l && s) l = row[++i] = ''; else if ('\n' === l && s) { if ('\r' === p) row[i] = row[i].slice(0, -1); row = ret[++r] = [l = '']; i = 0; } else row[i] += l; p = l;
    }
    return ret.filter(r => r.length > 1 || r[0].trim() !== '');
}

function importTabularCSV(text, moduleName) {
    const arr = csvToArray(text);
    if(arr.length < 2) throw new Error("CSV appears empty or lacks headers.");
    const headers = arr[0].map(h => h.trim().toUpperCase());
    const getColIndex = (names) => { for(let n of names) { const idx = headers.indexOf(n.toUpperCase()); if(idx > -1) return idx; } return -1; };
    const getValue = (row, names) => { const idx = getColIndex(names); return idx > -1 ? row[idx].trim() : ''; };

    // HF lanes import into projectConfig.hf.<key>.rows (their own module store), not a global array.
    const _allocMisses = [];
    const _HF_IMPORT_KEY = { 'HF_HEA':'hea', 'HF_Alerts':'alerts', 'HF_Tasks':'tasks', 'HF_Ergo':'ergo', 'HF_ControlsDisplays':'cd', 'HF_SituationAwareness':'sa', 'HF_TaskIdentification':'tid' }[moduleName];   // NOTE: HF_FunctionAllocation is deliberately absent — its rows are keyed to the live functions lane and are set, never appended.
    let _hfBase = 0, _hfRows = null;
    if (_HF_IMPORT_KEY && typeof projectConfig !== 'undefined' && projectConfig) {
        if (!projectConfig.hf) projectConfig.hf = {};
        if (!projectConfig.hf[_HF_IMPORT_KEY] || !Array.isArray(projectConfig.hf[_HF_IMPORT_KEY].rows)) projectConfig.hf[_HF_IMPORT_KEY] = { rows: [] };
        _hfRows = projectConfig.hf[_HF_IMPORT_KEY].rows;
        _hfBase = _hfRows.reduce((m, r) => { const idf = r.cdId||r.saId||r.ergoId||r.heaId||r.alertId||r.taskId||''; const x = parseInt(String(idf).replace(/^\D+/, ''), 10); return isNaN(x) ? m : Math.max(m, x); }, 0);
    }
    const _hfId = (prefix, i, provided) => provided || (prefix + String(_hfBase + i).padStart(3, '0'));
    let _mfcStore = null;
    if (moduleName === 'HF_MFC' && typeof projectConfig !== 'undefined' && projectConfig) {
        if (!projectConfig.hf) projectConfig.hf = {};
        _mfcStore = { rows: [], factors: {}, conclusion: { minCrew: '', rationale: '' } };
        projectConfig.hf.mfc = _mfcStore;   // import REPLACES the determination (fixed Appendix D structure)
    }
    const _MFC_FN = (typeof window !== 'undefined' && window.HF_ANALYSES && window.HF_ANALYSES.MFC_FUNCTIONS) || [];

    for(let i=1; i<arr.length; i++) {
        const row = arr[i]; const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

        if(moduleName === 'AC_Functions') {
            acFunctionsData.push({ internalId: newId, funcId: getValue(row, ['Function ID']), funcName: getValue(row, ['Function', 'Aircraft Function']), funcDef: getValue(row, ['Definition']), subId: getValue(row, ['Sub-Function ID']), subName: getValue(row, ['Sub-Function']), subDef: getValue(row, ['Sub-Definition']) });
        } else if(moduleName === 'AC_FCIM') {
            acFcimData.push({ internalId: newId, subId: getValue(row, ['Sub-Function']), awareness: getValue(row, ['Awareness']), tlId: getValue(row, ['Total Loss ID']), tlDesc: getValue(row, ['Total Loss']), plId: getValue(row, ['Partial Loss ID']), plDesc: getValue(row, ['Partial Loss']), mId: getValue(row, ['Malfunction ID']), mDesc: getValue(row, ['Malfunction']) });
        } else if(moduleName === 'AC_FHA') {
            let combinedEffects = getValue(row, ['Effects']); let effA = '', effC = '', effP = '';
            if(combinedEffects) { const parts = combinedEffects.split('\n'); parts.forEach(p => { if(p.includes('AC:')) effA = p.split('AC:')[1].trim(); if(p.includes('Crew:')) effC = p.split('Crew:')[1].trim(); if(p.includes('Pax:')) effP = p.split('Pax:')[1].trim(); }); } else { effA = getValue(row, ['Aircraft Effect']); effC = getValue(row, ['Crew Effect']); effP = getValue(row, ['Pax Effect']); }
            // Accept either new "Assumption IDs" (semicolon-list) or legacy "Assumptions" string.
            const asmIdsRaw = getValue(row, ['Assumption IDs']);
            const legacyAsm = getValue(row, ['Assumptions']);
            const assumptionIds = asmIdsRaw
                ? asmIdsRaw.split(';').map(s => s.trim()).filter(Boolean)
                : (parseAssumptionField(legacyAsm).id ? [parseAssumptionField(legacyAsm).id] : []);
            acFhaData.push({ internalId: newId, subId: getValue(row, ['Sub-Function']), fcId: getValue(row, ['FC ID']), fcDesc: getValue(row, ['Failure Condition']), phases: getValue(row, ['Phases']), effAc: effA, effCrew: effC, effPax: effP, effAcLevel: _axisLvl('ac', getValue(row, ['Aircraft Level'])), effCrewLevel: _axisLvl('crew', getValue(row, ['Crew Level'])), effPaxLevel: _axisLvl('pax', getValue(row, ['Pax Level'])), severity: getValue(row, ['Severity']), assumptionIds, comments: getValue(row, ['Comments']) });
        } else if(moduleName === 'AC_Requirements') {
            acReqData.push({ internalId: newId, traceId: getValue(row, ['Trace']), level: getValue(row, ['Level']), type: getValue(row, ['Type']), text: getValue(row, ['Requirement Statement']), rat: getValue(row, ['Rationale']) });
        } else if(moduleName === 'Sys_Functions') {
            // Accept either the new "AC Trace IDs" (semicolon-list) or the legacy single "AC Trace" column.
            const tracesRaw = getValue(row, ['AC Trace IDs', 'AC Trace']);
            const traceIds = tracesRaw
                ? tracesRaw.split(';').map(s => s.trim()).filter(Boolean)
                : [];
            sys().functions.push({
                internalId: newId,
                traceIds,
                funcId: getValue(row, ['Function ID']),
                funcName: getValue(row, ['Function']),
                funcDef: getValue(row, ['Definition'])
            });
        } else if(moduleName === 'Sys_FCIM') {
            sys().fcim.push({ internalId: newId, subId: getValue(row, ['Sub-Function']), awareness: getValue(row, ['Awareness']), tlId: getValue(row, ['Total Loss ID']), tlDesc: getValue(row, ['Total Loss']), plId: getValue(row, ['Partial Loss ID']), plDesc: getValue(row, ['Partial Loss']), mId: getValue(row, ['Malfunction ID']), mDesc: getValue(row, ['Malfunction']) });
        } else if(moduleName === 'Sys_FHA') {
            let combinedEffects = getValue(row, ['Effects']); let effA = '', effC = '', effP = '';
            if(combinedEffects) { const parts = combinedEffects.split('\n'); parts.forEach(p => { if(p.includes('AC:')) effA = p.split('AC:')[1].trim(); if(p.includes('Crew:')) effC = p.split('Crew:')[1].trim(); if(p.includes('Pax:')) effP = p.split('Pax:')[1].trim(); }); } else { effA = getValue(row, ['Aircraft Effect']); effC = getValue(row, ['Crew Effect']); effP = getValue(row, ['Pax Effect']); }
            const asmIdsRaw = getValue(row, ['Assumption IDs']);
            const legacyAsm = getValue(row, ['Assumptions']);
            const assumptionIds = asmIdsRaw
                ? asmIdsRaw.split(';').map(s => s.trim()).filter(Boolean)
                : (parseAssumptionField(legacyAsm).id ? [parseAssumptionField(legacyAsm).id] : []);
            sys().fha.push({ internalId: newId, acTrace: getValue(row, ['AC Trace']), subId: getValue(row, ['Sub-Function']), fcId: getValue(row, ['FC ID']), fcDesc: getValue(row, ['Failure Condition']), phases: getValue(row, ['Phases']), effAc: effA, effCrew: effC, effPax: effP, effAcLevel: _axisLvl('ac', getValue(row, ['Aircraft Level'])), effCrewLevel: _axisLvl('crew', getValue(row, ['Crew Level'])), effPaxLevel: _axisLvl('pax', getValue(row, ['Pax Level'])), severity: getValue(row, ['Severity']), assumptionIds, comments: getValue(row, ['Comments']) });
        } else if(moduleName === 'Sys_Requirements') {
            sys().req.push({ internalId: newId, traceId: getValue(row, ['Trace']), level: getValue(row, ['Level']), type: getValue(row, ['Type']), text: getValue(row, ['Requirement Statement']), rat: getValue(row, ['Rationale']) });
        } else if(moduleName === 'PRA') {
            praData.push({ internalId: newId, praId: getValue(row, ['PRA ID']), threat: getValue(row, ['Threat Source']), desc: getValue(row, ['Propagation Path']), systems: getValue(row, ['Target Systems']), csfl: getValue(row, ['CSFL Impact Analysis']), mitigation: getValue(row, ['Mitigation Strategy']) });
        } else if(moduleName === 'ZSA') {
            zsaData.push({ internalId: newId, zoneId: getValue(row, ['Zone ID']), desc: getValue(row, ['Boundaries']), equip: getValue(row, ['Installed Equipment']), severity: getValue(row, ['Worst Severity']), interference: getValue(row, ['Interference Profile']), mitigation: getValue(row, ['Separation & Mitigations']),
                assessedBy: getValue(row, ['Assessed By']) || '',
                assessMethod: (typeof SLZsaRecord !== 'undefined') ? SLZsaRecord.methodFrom(getValue(row, ['Assessment Method'])) : '',
                assessedOn: getValue(row, ['Assessed On']) || '',
                findingStatus: ((typeof SLZsaRecord !== 'undefined') ? SLZsaRecord.statusFrom(getValue(row, ['Status'])) : '') || 'open' });
        } else if(moduleName === 'HW_FMEA') {
            const lRate = parseFloat(getValue(row, ['Rate (λ)', 'Rate'])) || 0; const tTime = parseFloat(getValue(row, ['Time (t)', 'Time'])) || 0;
            fmeaData.push({ internalId: newId, fmeaType: 'piece-part', scope: 'system', owningSystemId: activeSystemId || '', beId: getValue(row, ['FTA Link']), part: getValue(row, ['Component']), mode: getValue(row, ['Failure Mode']), rate: lRate, time: tTime, prob: -Math.expm1(-lRate * tTime) });
        } else if(moduleName === 'Flight_Phases') {
            if(i===1) flightPhasesData = [];
            flightPhasesData.push({ phase: getValue(row, ['Phase of Flight']), altFrom: getValue(row, ['Altitude From']), altFromUnit: getValue(row, ['Unit From', 'Unit']), altTo: getValue(row, ['Altitude To']), altToUnit: getValue(row, ['Unit To', 'Unit']), duration: getValue(row, ['Duration']), durationUnit: getValue(row, ['Duration Unit', 'Unit']) });
        } else if(moduleName === 'HF_HEA' && _hfRows) {
            _hfRows.push({ heaId: _hfId('HEA-', i, getValue(row, ['ID'])), asmId: getValue(row, ['Task assumption','Assumption']), task: getValue(row, ['Task']), errorMode: getValue(row, ['Error mode (NUREG/CR-1278)','Error mode','Error Mode']), effect: getValue(row, ['Effect']), detection: getValue(row, ['Detection']), recovery: getValue(row, ['Recovery']), fcIds: getValue(row, ['Feeds FC','Cited by FC']) });
        } else if(moduleName === 'HF_Alerts' && _hfRows) {
            _hfRows.push({ alertId: _hfId('ALR-', i, getValue(row, ['ID'])), name: getValue(row, ['Alert','Name']), priority: getValue(row, ['Priority (25.1322)','Priority']), modality: getValue(row, ['Modality']), fcIds: getValue(row, ['Cited by FC']), notes: getValue(row, ['Notes']) });
        } else if(moduleName === 'HF_Tasks' && _hfRows) {
            const _cr = getValue(row, ['Credited as']);
            _hfRows.push({ taskId: _hfId('TASK-', i, getValue(row, ['ID'])), phase: getValue(row, ['Phases','Phase']), crewmember: getValue(row, ['Crewmember']), task: getValue(row, ['Task']), reactionS: getValue(row, ['Reaction (s)','Reaction']), execS: getValue(row, ['Execution (s)','Execution']), timeS: getValue(row, ['Time (s)','Time']), basis: getValue(row, ['Time basis','Basis']), channels: getValue(row, ['Channels (HIDH)','Channels']), asmId: (_cr && _cr !== 'not credited') ? _cr : '', notes: getValue(row, ['Notes']) });
        } else if(moduleName === 'HF_Ergo' && _hfRows) {
            _hfRows.push({ ergoId: _hfId('ERG-', i, getValue(row, ['ID'])), item: getValue(row, ['Item']), clause: getValue(row, ['Criterion (cite)','Criterion','Clause']), finding: getValue(row, ['Finding']), status: getValue(row, ['Status']) || 'Open', notes: getValue(row, ['Notes']) });
        } else if(moduleName === 'HF_ControlsDisplays' && _hfRows) {
            _hfRows.push({ cdId: _hfId('CD-', i, getValue(row, ['ID'])), item: getValue(row, ['Item']), kind: getValue(row, ['Kind']) || 'Control', consideration: getValue(row, ['\u00a725.1302 consideration','Consideration']), supports: getValue(row, ['Supports']), finding: getValue(row, ['Finding']), status: getValue(row, ['Status']) || 'Open', notes: getValue(row, ['Notes']) });
        } else if(moduleName === 'HF_FunctionAllocation') {
            const HX = (typeof window !== 'undefined' && window.HF_ANALYSES) || null;
            const sub = getValue(row, ['Sub-function','SubId','Sub function']);
            const alloc = String(getValue(row, ['Allocated to','Allocation']) || '').toLowerCase();
            if (HX && typeof HX.setAllocBySubId === 'function' && sub) {
                if (!HX.setAllocBySubId(sub, alloc, getValue(row, ['Rationale']))) _allocMisses.push(sub);
            }
        } else if(moduleName === 'HF_TaskIdentification' && _hfRows) {
            _hfRows.push({ taskId: _hfId('TSK-', i, getValue(row, ['Task ID','ID'])), procId: getValue(row, ['Proc ID','Procedure ID']), procName: getValue(row, ['Procedure']), opsMode: getValue(row, ['Mode','Operating mode']) || 'Normal', phase: getValue(row, ['Phase']), taskName: getValue(row, ['Task step','Task']), taskDef: getValue(row, ['Definition']), crew: getValue(row, ['Crew','Crewmember']), trigger: getValue(row, ['Trigger']), source: getValue(row, ['Source']), notes: getValue(row, ['Notes']) });
        } else if(moduleName === 'HF_SituationAwareness' && _hfRows) {
            _hfRows.push({ saId: _hfId('SA-', i, getValue(row, ['ID'])), element: getValue(row, ['SA element','Element']), level: getValue(row, ['Level']) || 'L1 Perception', cue: getValue(row, ['Cue / source','Cue']), phase: getValue(row, ['Phase']), finding: getValue(row, ['Finding']), status: getValue(row, ['Status']) || 'Open', notes: getValue(row, ['Notes']) });
        } else if(moduleName === 'HF_MFC' && _mfcStore) {
            const section = getValue(row, ['Section']); const item = getValue(row, ['Item']); const val = getValue(row, ['Assignment / disposition','Assignment']); const extra = getValue(row, ['Bedford / note / rationale','Bedford / note','Rationale']);
            if (/workload function/i.test(section)) {
                const fn = _MFC_FN.find(f => String(f.label) === item); if (fn) { const m = /Bedford\s*([0-9]+)/i.exec(extra || ''); const note = String(extra || '').split('—').slice(1).join('—').trim(); _mfcStore.rows.push({ key: fn.key, role: val || '', bedford: m ? m[1] : '', note: note }); }
            } else if (/workload factor/i.test(section)) {
                const mi = /^\((\d+)\)/.exec(item || ''); if (mi) { _mfcStore.factors[String(parseInt(mi[1], 10) - 1)] = val || ''; }
            } else if (/determination/i.test(section)) {
                _mfcStore.conclusion.minCrew = val || ''; _mfcStore.conclusion.rationale = extra || '';
            }
        }
    }

    if(moduleName === 'HF_FunctionAllocation') {
        try {
            const HX = (typeof window !== 'undefined') ? window.HF_ANALYSES : null;
            if (HX && typeof HX.renderAlloc === 'function') HX.renderAlloc();
            if (typeof scheduleAutosave === 'function') scheduleAutosave();
            if (_allocMisses.length) slAlert('Imported. ' + _allocMisses.length + ' row(s) named a sub-function that is not in the functions lane and were refused rather than orphaned: ' + _allocMisses.slice(0, 8).join(', ') + (_allocMisses.length > 8 ? '\u2026' : ''));
        } catch(_) {}
    }

    // Sync Extractors
    acExtractedFCs = []; _pushExtractedFCs(acFcimData, acExtractedFCs);
    if(activeSystemId) { sys().extractedFCs = []; _pushExtractedFCs(sys().fcim, sys().extractedFCs); }

    if(moduleName.startsWith('AC_')) { renderACFunctions(); renderACFCIM(); renderACFHA(); renderACReq(); renderACAssumptions(); }
    if(moduleName.startsWith('Sys_')) { renderSysFunctions(); renderSysFCIM(); renderSysFHA(); renderSysReq(); renderSysAssumptions(); }
    if(moduleName === 'PRA') renderPRA(); if(moduleName === 'ZSA') renderZSA(); if(moduleName === 'HW_FMEA') renderFMEA(); if(moduleName === 'Flight_Phases') renderFlightPhases();
    if(_HF_IMPORT_KEY) { try { const HX = (typeof window !== 'undefined') ? window.HF_ANALYSES : null; const fn = { hea:'renderHea', alerts:'renderAlerts', tasks:'renderTasks', ergo:'renderErgo', cd:'renderCd', sa:'renderSa', tid:'renderTid' }[_HF_IMPORT_KEY]; if (HX && typeof HX[fn] === 'function') HX[fn](); if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {} }
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}   // 13 Sep 2026 (R18) — an import is a project change (only the HF allocation branch used to save)
    if(moduleName === 'HF_MFC') { try { const HX = (typeof window !== 'undefined') ? window.HF_ANALYSES : null; if (HX && typeof HX.renderMfc === 'function') HX.renderMfc(); if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {} }
}

// Minimal CSV importer for a fault tree page. Accepts the column layout produced by
// exportData('Fault_Tree', ...): Display ID, Parent ID, Type, Name, Lambda, Probability, CCF Group, Beta, Voting K.
// Builds a new FTA page from the rows and makes it the active tree.
function importFaultTreeCSV(text) {
    const arr = csvToArray(text);
    if (arr.length < 2) throw new Error('CSV is empty or missing a header row.');
    const headers = arr[0].map(h => h.trim().toUpperCase());
    const col = (name) => headers.indexOf(name.toUpperCase());
    const iId = col('Display ID'), iParent = col('Parent ID'), iType = col('Type'),
          iName = col('Name'), iLambda = col('Lambda'), iProb = col('Probability'),
          iCCF = col('CCF Group'), iBeta = col('Beta'), iVK = col('Voting K'),
          iDalOpt = col('DAL Option'), iAllocDal = col('Allocated DAL'),
          iInputMode = col('Input Mode'), iLibKey = col('Library Key');
    if (iId < 0 || iParent < 0 || iType < 0) throw new Error('CSV must include Display ID, Parent ID, and Type columns.');

    const gateTypes = new Set(['AND','OR','XOR','VOTING','INHIBIT','TRANSFER']);
    const nodesByDisplayId = new Map();
    const rows = arr.slice(1).filter(r => (r[iId] || '').trim() !== '');

    // First pass — create node objects keyed by their Display ID.
    rows.forEach(r => {
        const displayId = (r[iId] || '').trim();
        const rawType = (r[iType] || 'basic').trim();
        const isGate = gateTypes.has(rawType.toUpperCase());
        const _nid = internalIdCounter++;
        const node = {
            id: _nid,
            logicalId: _nid, // fresh logical event per imported row; common-mode flows from copy/paste
            displayId: displayId,
            name: r[iName] || '',
            type: isGate ? 'gate' : (rawType || 'basic'),
            gateType: isGate ? rawType.toUpperCase() : null,
            probability: iProb >= 0 ? (parseFloat(r[iProb]) || 0) : 0,
            lambda: iLambda >= 0 ? (parseFloat(r[iLambda]) || 0) : 0,
            ccfGroup: iCCF >= 0 ? (r[iCCF] || '') : '',
            beta: iBeta >= 0 ? (parseFloat(r[iBeta]) || 0) : 0,
            votingK: iVK >= 0 ? (parseInt(r[iVK]) || 0) : 0,
            dalOption: iDalOpt >= 0 ? (r[iDalOpt] || '') : '',
            allocatedDAL: iAllocDal >= 0 ? (r[iAllocDal] || null) : null,
            inputMode: iInputMode >= 0 ? (r[iInputMode] || '') : '',
            libraryKey: iLibKey >= 0 ? (r[iLibKey] || '') : '',
            children: []
        };
        nodesByDisplayId.set(displayId, node);
    });

    // Second pass — wire up parents.
    let root = null;
    rows.forEach(r => {
        const node = nodesByDisplayId.get((r[iId] || '').trim());
        const parentDisplayId = (r[iParent] || '').trim();
        if (!parentDisplayId) { if (!root) root = node; return; }
        const parent = nodesByDisplayId.get(parentDisplayId);
        if (parent) parent.children.push(node);
        else if (!root) root = node;
    });

    if (!root) throw new Error('Could not identify the top event (no row with an empty Parent ID).');
    const newPage = { id: 'page-' + Date.now(), name: root.name || `Imported Tree ${ftaPages.length + 1}`, root };
    ftaPages.push(newPage);
    activeFTAPageId = newPage.id;
    renderFTASidebar(); calculateAllProbabilities(); updateD3();
    try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}   // 13 Sep 2026 (R18)
}

function migrateFHAAssumptions(fhaArr) {
    if (!Array.isArray(fhaArr)) return;
    fhaArr.forEach(row => {
        if (Array.isArray(row.assumptionIds)) return;
        row.assumptionIds = [];
        if (row.assumptions) {
            const parsed = parseAssumptionField(row.assumptions);
            if (parsed.id) row.assumptionIds.push(parsed.id);
        }
        delete row.assumptions;
    });
}
function migrateAllFHAAssumptions() {
    migrateFHAAssumptions(acFhaData);
    systemsData.forEach(s => migrateFHAAssumptions(s.fha));
    // 28 Aug 2026 — heal the phase-shape split (see _applyFhaSuggestion's note in
    // ai_assistant.js). AI-accepted rows stored row.phases as an ARRAY; the project
    // vocabulary is a comma string and the readers assume it. The write side now
    // joins at birth; this heals every row already saved with the array shape —
    // 63 live on Aeolus alone when found. Idempotent: a string passes through.
    migrateFhaPhaseShape();
}
function migrateFhaPhaseShape() {
    const heal = rows => (rows || []).forEach(r => {
        if (r && Array.isArray(r.phases)) r.phases = r.phases.filter(Boolean).join(', ');
    });
    heal(typeof acFhaData !== 'undefined' ? acFhaData : []);
    (typeof systemsData !== 'undefined' ? systemsData : []).forEach(s => heal(s && s.fha));
}

// Phase 28 — promote legacy scalar trace fields to arrays so a single record can carry
// 1-to-many traceability. Each block converts the legacy scalar (kept for backwards-compat
// reads) into a 1-element array; downstream code reads both forms. Migration is idempotent.
function migrateLegacyMultiTraces() {
    const toArray = (rec, scalar, plural) => {
        if (!rec) return;
        if (!Array.isArray(rec[plural])) {
            rec[plural] = rec[scalar] ? [rec[scalar]] : [];
        }
        // Legacy scalar kept untouched for backwards-compat callers; we don't delete it
        // because some external consumers (CSV importers, older save files) might still
        // expect the field. New writes go through the array path.
    };

    // 1. AC + Sys FHAs: subId → subIds[]; sys FHA acTrace → acTraces[].
    (acFhaData || []).forEach(f => toArray(f, 'subId', 'subIds'));
    (systemsData || []).forEach(s => {
        (s.fha || []).forEach(f => {
            toArray(f, 'subId', 'subIds');
            toArray(f, 'acTrace', 'acTraces');
        });
    });
    // 2. AC + Sys requirements: traceId → traceIds[].
    (acReqData || []).forEach(r => toArray(r, 'traceId', 'traceIds'));
    (systemsData || []).forEach(s => (s.req || []).forEach(r => toArray(r, 'traceId', 'traceIds')));
    // 3. FTA pages: linkedFhaId → linkedFhaIds[].
    (ftaPages || []).forEach(p => toArray(p, 'linkedFhaId', 'linkedFhaIds'));
    // 4. FMEA functional rows: funcSubId → funcSubIds[].
    (fmeaData || []).forEach(m => {
        if (m && (m.fmeaType === 'functional' || (!m.fmeaType && m.funcSubId))) {
            toArray(m, 'funcSubId', 'funcSubIds');
        }
    });
    // 5. CMA + FMEA: owningSystemId → owningSystemIds[].
    (cmaData  || []).forEach(c => toArray(c, 'owningSystemId', 'owningSystemIds'));
    (fmeaData || []).forEach(m => toArray(m, 'owningSystemId', 'owningSystemIds'));
    // 6. Assumption.linkedFunctions[] — pure additive field, no migration needed beyond
    // ensuring the array exists so downstream reads don't have to guard.
    (acAssumptionsData || []).forEach(a => { if (!Array.isArray(a.linkedFunctions)) a.linkedFunctions = []; });
    (systemsData || []).forEach(s => (s.asm || []).forEach(a => { if (!Array.isArray(a.linkedFunctions)) a.linkedFunctions = []; }));
    // 7. Phase 68 — FMEA is per-system & item-level only now; drop untagged / functional rows.
    _pruneFmeaToPerSystem();
}

// Phase 68 dropped functional FMEA here ("Beta: confirmed no production data") —
// and then the rest of the product kept treating it as first-class: ffmea is a
// committable Program-Planning lane, the worksheet has a live functional mode,
// the fmeaFunctional template schema shipped 2 Aug, the golden thread and the
// reports both branch on fmeaType === 'functional'. Measured live 5 Aug on HL-1:
// laneOn('ffmea') = true while this filter deleted every hand-authored
// functional row on EVERY load path — including restoring a saved revision —
// with no message. The l3Source wrapper in mac_flows.js existed precisely
// because generated functional rows were being destroyed; it saved the
// machine's rows and left the user's dead.
//
// RULED 5 Aug (Waqas): honour the lane. Functional rows PERSIST. A functional
// row authored at aircraft scope carries owningSystemId '' by design
// (_readFmeaForm), so the owner requirement applies to piece-part only —
// piece-part remains a per-system, item-level model. Untagged rows with
// neither an owner nor a function link are stale and still dropped.
function _pruneFmeaToPerSystem() {
    if (Array.isArray(fmeaData)) {
        fmeaData = fmeaData.filter(m => {
            if (!m) return false;
            const t = m.fmeaType || (m.funcSubId ? 'functional' : 'piece-part');
            if (t === 'functional') return true;
            return !!m.owningSystemId;
        });
    }
}

// Phase 24 — collapse sys "sub-functions" into "functions". The Sys Functions form used to
// carry both `funcId/funcName/funcDef` (function level) and `subId/subName/subDef` (sub-function
// level). FHA / FCIM / Req records referenced the sub-function via `subId`. After this migration:
//   - Every function record exposes only `funcId/funcName/funcDef` (+ `traceId` to AC).
//   - Child records (FHA, FCIM, Req) keep their `subId` field name in storage, but its VALUE
//     is rewritten to the corresponding funcId so the runtime resolves to the consolidated
//     function record. Orphan references (no mapping found) are preserved untouched so the user
//     can fix them in-place rather than seeing silent data loss.
function migrateSysSubFunctionsToFunctions() {
    (systemsData || []).forEach(s => {
        if (!s) return;
        const subToFunc = new Map();
        (s.functions || []).forEach(f => {
            if (f && f.subId && f.funcId && !subToFunc.has(f.subId)) {
                subToFunc.set(f.subId, f.funcId);
            }
        });
        (s.functions || []).forEach(f => {
            if (!f) return;
            // Promote sub-* → func-* when the record lacks a function-level identifier.
            if (!f.funcId && f.subId) {
                f.funcId   = f.subId;
                if (!f.funcName) f.funcName = f.subName || '';
                if (!f.funcDef)  f.funcDef  = f.subDef  || '';
                subToFunc.set(f.subId, f.funcId);
            }
            delete f.subId; delete f.subName; delete f.subDef;
            // Phase 25 — collapse legacy single traceId into the new traceIds array.
            if (!Array.isArray(f.traceIds)) {
                f.traceIds = f.traceId ? [f.traceId] : [];
            }
            delete f.traceId;
        });
        // Rewrite child-record references via the subId → funcId map.
        ['fha', 'fcim'].forEach(arrKey => {
            (s[arrKey] || []).forEach(r => {
                if (!r || !r.subId) return;
                const mapped = subToFunc.get(r.subId);
                if (mapped) r.subId = mapped;
            });
        });
        (s.req || []).forEach(r => {
            if (!r) return;
            if (r.traceTo && subToFunc.has(r.traceTo)) r.traceTo = subToFunc.get(r.traceTo);
            if (r.traceId && subToFunc.has(r.traceId)) r.traceId = subToFunc.get(r.traceId);
        });
    });
}

// Find an assumption record across AC + all system scopes. Returns null when not found.
function findAssumption(asmId) {
    if (!asmId) return null;
    const ac = acAssumptionsData.find(a => a.asmId === asmId);
    if (ac) return { record: ac, scope: 'Aircraft', source: 'ac' };
    for (const s of systemsData) {
        const m = s.asm.find(a => a.asmId === asmId);
        if (m) return { record: m, scope: `System: ${s.name}`, source: 'sys', system: s };
    }
    return null;
}

// All assumption records, annotated with scope. Used by the FHA assumption dropdown.
function getAllAssumptions() {
    return [
        ...acAssumptionsData.map(a => ({ ...a, scope: 'AC' })),
        ...systemsData.flatMap(s => s.asm.map(a => ({ ...a, scope: `Sys: ${s.name}` })))
    ];
}

// Reverse trace: every FHA row (AC + all systems) that references the given assumption.
// Returns [{ scope, fcId, subId }]. Used by the Assumptions table and Golden Thread.
function getLinkedFHAs(asmId) {
    const links = [];
    acFhaData.forEach(r => { if ((r.assumptionIds || []).includes(asmId)) links.push({ scope: 'AC', fcId: r.fcId, subId: r.subId }); });
    systemsData.forEach(s => {
        s.fha.forEach(r => { if ((r.assumptionIds || []).includes(asmId)) links.push({ scope: s.name, fcId: r.fcId, subId: r.subId }); });
    });
    return links;
}

// Format the linked-FHAs list as a compact HTML fragment (already escaped).
function renderLinkedFHAsHtml(asmId) {
    const links = getLinkedFHAs(asmId);
    if (!links.length) return '<span class="u-muted-italic">Not linked</span>';
    return links.map(l => `<span style="display:inline-block; margin: 2px 4px 2px 0; padding: 2px 6px; background: var(--bg-control); border: 1px solid var(--border-primary); border-radius: 3px; font-size: 0.85em;"><strong>${esc(l.fcId)}</strong> <span class="u-muted">(${esc(l.scope)} / ${esc(l.subId)})</span></span>`).join('');
}

// Render the assumption IDs linked to an FHA row as compact chips for the FHA table cell.
// 3 Sep 2026 — FHA CSV round-trip carries the three effect levels (closed
// vocabulary via severity_axes.js; an off-list cell imports as empty, never a guess).
function _axisLvl(axis, v) {
    try { return (window.SLSeverityAxes && typeof SLSeverityAxes.normLevel === 'function') ? SLSeverityAxes.normLevel(axis, v) : String(v || '').trim(); } catch (_) { return ''; }
}
function renderFhaAsmLinksHtml(asmIds) {
    if (!asmIds || !asmIds.length) return '<span class="u-muted-italic">None</span>';
    return asmIds.map(id => {
        const found = findAssumption(id);
        const tooltip = found ? `${id}: ${found.record.text}` : `${id} (missing)`;
        return `<span style="display:inline-block; margin: 2px 2px 2px 0; padding: 2px 6px; background: var(--bg-control); border: 1px solid var(--border-primary); border-radius: 3px; font-size: 0.85em;" title="${esc(tooltip)}">${esc(id)}</span>`;
    }).join('');
}

// ==========================================
// FHA ASSUMPTION CHIP WIDGET
// The DOM is the source of truth for the currently-linked assumptions on the form.
// Chips carry `data-asm-id`; getFhaAsmIds(...) reads them back at submit time.
// ==========================================
function _fhaChipsContainerId(domain) { return domain === 'ac' ? 'ac-fha-asm-chips' : 'sys-fha-asm-chips'; }
function _fhaSelectId(domain)         { return domain === 'ac' ? 'ac-fha-asm-select' : 'sys-fha-asm-select'; }
function _fhaNewInputId(domain)       { return domain === 'ac' ? 'ac-fha-asm'        : 'sys-fha-asm'; }

function renderFhaAsmChips(domain, asmIds) {
    const c = document.getElementById(_fhaChipsContainerId(domain));
    if (!c) return;
    c.innerHTML = '';
    (asmIds || []).forEach(id => {
        const found = findAssumption(id);
        const text = found ? found.record.text : '(missing)';
        const label = `${id}: ${text}`;
        const displayLabel = label.length > 70 ? label.slice(0, 70) + '…' : label;
        const chip = document.createElement('span');
        chip.className = 'asm-chip';
        chip.dataset.asmId = id;
        chip.title = label;
        chip.innerHTML = `<span class="asm-chip-label">${esc(displayLabel)}</span><span class="asm-chip-remove" data-domain="${esc(domain)}" data-id="${esc(id)}">✕</span>`;
        chip.querySelector('.asm-chip-remove').addEventListener('click', (ev) => {
            ev.preventDefault();
            removeAsmFromFHA(domain, id);
        });
        c.appendChild(chip);
    });
}
function getFhaAsmIds(domain) {
    const c = document.getElementById(_fhaChipsContainerId(domain));
    if (!c) return [];
    return Array.from(c.querySelectorAll('[data-asm-id]')).map(el => el.dataset.asmId);
}
function populateFhaAsmDropdown(domain) {
    const sel = document.getElementById(_fhaSelectId(domain));
    if (!sel) return;
    const previous = sel.value;
    sel.innerHTML = '<option value="">-- Link an existing assumption --</option>';
    getAllAssumptions().forEach(a => {
        const trimmed = (a.text || '').length > 60 ? (a.text || '').slice(0, 60) + '…' : (a.text || '');
        sel.innerHTML += `<option value="${esc(a.asmId)}">[${esc(a.scope)}] ${esc(a.asmId)}: ${esc(trimmed)}</option>`;
    });
    if (previous && Array.from(sel.options).some(o => o.value === previous)) sel.value = previous;
}
function linkExistingAssumption(domain) {
    const sel = document.getElementById(_fhaSelectId(domain));
    const id = sel ? sel.value : '';
    if (!id) return;
    const current = getFhaAsmIds(domain);
    if (current.includes(id)) return;
    renderFhaAsmChips(domain, [...current, id]);
    if (sel) sel.value = '';
}
function createNewAssumption(domain) {
    const input = document.getElementById(_fhaNewInputId(domain));
    const text = (input ? input.value : '').trim();
    if (!text) return;
    let newAsmId = null;
    if (domain === 'ac') {
        newAsmId = `ASM-AC-${String(acAsmCounter++).padStart(3, '0')}`;
        acAssumptionsData.push({ asmId: newAsmId, text, state: 'Proposed', valStrategy: '', valArtifact: '', verArtifact: '', origin: 'AC FHA' });
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}   // 13 Sep 2026 (R18)
        renderACAssumptions();
    } else {
        if (!sys()) { showToast('Please open a system folder first.', 'warning', 4000); return; }
        newAsmId = `ASM-SYS-${String(sys().asmCounter++).padStart(3, '0')}`;
        sys().asm.push({ asmId: newAsmId, text, state: 'Proposed', valStrategy: '', valArtifact: '', verArtifact: '', origin: 'Sys FHA' });
        renderSysAssumptions();
    }
    renderFhaAsmChips(domain, [...getFhaAsmIds(domain), newAsmId]);
    populateFhaAsmDropdown(domain);
    if (input) input.value = '';
}
function removeAsmFromFHA(domain, asmId) {
    const current = getFhaAsmIds(domain);
    renderFhaAsmChips(domain, current.filter(id => id !== asmId));
}

// ==========================================
// AC MATRICES CRUD LOGIC
// Driven by the makeCRUD factory — each module declares its form↔data map,
// render template, and (optionally) afterChange/validate hooks. FHA stays custom below.
// ==========================================
// Decomposition view — render the AC Functions table with each aircraft function's
// identity (ID / name / definition) merged once across all of its sub-functions,
// Excel-style (rowspan), instead of repeating the function on every sub-function row.
// Rows are clustered by funcId in first-appearance order, so a sub-function added to an
// existing function later still merges into that function's block rather than splitting off.
function _acFuncRenderRows(arr, ctx) {
    const groups = [];
    const byFunc = new Map();
    (arr || []).forEach(row => {
        const fid = String(row.funcId || '').trim();
        // Blank function id → keep the row on its own (don't merge unrelated blanks together).
        const gkey = fid ? ('f:' + fid) : ('r:' + row.internalId);
        let g = byFunc.get(gkey);
        if (!g) { g = { funcId: row.funcId, funcName: row.funcName, funcDef: row.funcDef, rows: [] }; byFunc.set(gkey, g); groups.push(g); }
        g.rows.push(row);
    });
    let html = '';
    groups.forEach((g, gi) => {
        const span = g.rows.length;
        // Alternate the band shade per aircraft function (not per sub-function) so each
        // function reads as one uniform block. Both the group-start row and its children
        // carry the same band class.
        const band = (gi % 2 === 0) ? 'slab-func-band-a' : 'slab-func-band-b';
        g.rows.forEach((row, i) => {
            const sub = `<td><strong>${esc(row.subId)}</strong></td><td>${esc(row.subName)}</td><td>${esc(row.subDef)}</td>`;
            if (i === 0) {
                const rs = span > 1 ? ` rowspan="${span}"` : '';
                const merged = span > 1 ? ' slab-merged-cell' : '';
                html += `<tr class="slab-func-group-start ${band}">`
                      + `<td>${ctx.actionsFor(row.internalId)}</td>`
                      + `<td${rs} class="slab-func-id${merged}"><strong>${esc(g.funcId)}</strong></td>`
                      + `<td${rs} class="slab-func-name${merged}">${esc(g.funcName)}</td>`
                      + `<td${rs} class="slab-func-def${merged}">${esc(g.funcDef)}</td>`
                      + `${sub}${ctx.reviewFor(row.internalId)}</tr>`;
            } else {
                html += `<tr class="slab-func-group-child ${band}">`
                      + `<td>${ctx.actionsFor(row.internalId)}</td>`
                      + `${sub}${ctx.reviewFor(row.internalId)}</tr>`;
            }
        });
    });
    return html;
}

// E1 — 26 Aug 2026. THE RECOVERY WINDOW IS NOW CLOSED TO AUTOSAVE.
//
// Reproduced live on the deployed build: a reload came back to a blank project
// and within seconds BOTH local copies had been overwritten with that blank
// state. localStorage 4,823 B / all counts 0; IndexedDB 5,056 B, blank, and
// stamped LATER than the mirror — so IDB was not lagging behind holding good
// data, it had been overwritten too. The session immediately before: 19
// functions · 32 FCIM rows · 114 extracted conditions · 38 FHA rows · 11 fault
// trees. Recoverable only from the cloud.
//
// The asymmetry that allowed it: _autosaveHasContent() is consulted on the way
// OUT (below, twice — an empty snapshot is correctly refused as not worth
// restoring) and NEVER on the way in. _writeAutosave's only guard was
// `if (_autosaveSuspended) return;`, and _autosaveSuspended was set for project
// load and sample load — not for recovery. safety_lab.js runs
// checkAutosaveRecovery() and then _wrapForUndoAndAutosave() immediately after,
// so from that moment any tracked call could schedule a write of whatever was
// on screen. The IDB branch here is `.then()`-async, so it can still be in
// flight at that point: the blank-state write lands first and destroys the very
// payload the pending restore was about to read.
//
// So the window is held shut against exactly one thing: an EMPTY write. The
// window opens at entry and closes when recovery has RESOLVED — synchronous
// path and IndexedDB fallback both — with a timeout backstop so it cannot stay
// open if the promise never settles.
//
// WHAT THIS DOES NOT DO, on purpose. It does not touch _autosaveSuspended, and
// it does not block writes generally. Two reasons, both learned by trying the
// blunter version first:
//   · _applyProjectData sets and clears _autosaveSuspended in its own
//     try/finally and schedules a write from that finally to persist the
//     migrations it just ran. Reusing the same flag here means the restore's
//     finally re-opens the window early, and — when SLIdle is absent and the
//     write runs synchronously inside the finally — that legitimate write is
//     swallowed by the very hold meant to protect it.
//   · A suspended-forever autosave is a worse bug than the one being fixed. A
//     guard that only ever refuses ONE specific write cannot strand the feature.
// So the rule is narrow: during the recovery window, refuse to write a snapshot
// that has NO content over a stored one that HAS content. Content-bearing
// writes go through untouched, on every path, at all times.
//
// Deliberately NOT built tonight (E1 part 3): a separate last-good slot. It
// would double the write cost of every autosave on projects up to 4.5 MB to
// protect against content→content regressions, which is not what happened here.
// Refusing the empty overwrite keeps the good copy in the primary slot, which
// is the whole of the value at a fraction of the cost.
//
// The window is bounded in BOTH directions: it opens at recovery and closes
// when recovery resolves, or after the backstop, whichever comes first. Outside
// it, behaviour is byte-for-byte what shipped — createNewProject and any other
// deliberate blanking still persist exactly as they do today, because they
// happen long after boot.
const _RECOVERY_RELEASE_MS = 12000;

function _recoveryHoldBegin() {
    _autosaveRecoveryPending = true;
    try { clearTimeout(_autosaveRecoveryTimer); } catch (_) {}
    _autosaveRecoveryTimer = setTimeout(function () {
        console.warn('[E1] autosave recovery did not resolve in ' + _RECOVERY_RELEASE_MS + 'ms — closing the window.');
        _recoveryHoldEnd();
    }, _RECOVERY_RELEASE_MS);
}

function _recoveryHoldEnd() {
    _bootRecoveryHasRun = true;              // #2Sep2026 boot durability: recovery has now RUN — empty writes may persist again
    if (!_autosaveRecoveryPending) return;   // idempotent — both paths may call it
    _autosaveRecoveryPending = false;
    try { clearTimeout(_autosaveRecoveryTimer); } catch (_) {}
    _autosaveRecoveryTimer = null;
}

// 31 Aug 2026 — session resume restores the DATA but used to drop the cloud
// identity: the resumed tab came up with _activeCloudProjectId null, so the
// first autosave push PROVISIONED A DUPLICATE project row (db0b5a9e), and the
// save paths ran with a null version token. The identity now rides in the
// autosave META (written atomically with the payload in _writeAutosave); after
// a successful restore we adopt it. Guards: never clobber a live identity, and
// only accept a plausible id string.
function _adoptCloudIdentityFromMeta(m) {
    try {
        if (!m || typeof m !== 'object') return;
        if (typeof _activeCloudProjectId === 'undefined') return;
        if (_activeCloudProjectId) return;                      // a live identity always wins
        if (typeof m.cloudProjectId === 'string' && m.cloudProjectId.length >= 8) {
            _activeCloudProjectId = m.cloudProjectId;
            _activeCloudDocVersion = (typeof m.cloudDocVersion === 'number') ? m.cloudDocVersion : null;
            try { if (typeof _rtUpdatePresenceProject === 'function') _rtUpdatePresenceProject(); } catch (_) {}
        }
    } catch (_) {}
}

function checkAutosaveRecovery() {
    // Phase 57 — auto-recover the latest autosave on refresh (silent, no banner). The localStorage
    // path stays synchronous so the common case has zero behaviour change and no welcome-flash.
    let recovered = false;
    let _recoveredTs = 0;   // ts of the copy applied from localStorage, so IndexedDB can newest-win
    _recoveryHoldBegin();
    try {
        const meta = localStorage.getItem(AUTOSAVE_META_KEY);
        if (meta) {
            const m = JSON.parse(meta);
            const payload = localStorage.getItem(AUTOSAVE_KEY);
            if (m && m.ts && payload) {
                let parsed; try { parsed = JSON.parse(payload); } catch(e) { parsed = null; }
                // E1 — record what the STORED copy is worth, so _writeAutosave can
                // refuse to overwrite a good one with an empty one without having to
                // re-read and re-parse the whole payload on every single write.
                _autosaveStoredHasContent = _autosaveHasContent(parsed);
                if (_autosaveStoredHasContent) {
                    try { _applyProjectData(parsed); recovered = true; _recoveredTs = (m && m.ts) || 0; _adoptCloudIdentityFromMeta(m); } catch (e) { console.warn('Auto-recover failed:', e); }
                }
            }
        }
    } catch(e){ console.warn('Recovery check failed:', e); }
    // #14 / 2 Sep 2026 NEWEST-WINS — the durable copy, not merely the first one found.
    // A project too large for the localStorage quota lives ONLY in IndexedDB, and even when
    // both stores hold the project a torn write (localStorage quota-failed while IndexedDB
    // succeeded) leaves localStorage STALE. So IndexedDB is ALWAYS consulted — not only when
    // localStorage recovered nothing — and its copy is applied when localStorage recovered
    // nothing OR when IndexedDB is newer than the copy we applied. localStorage still runs
    // first and synchronously for a flash-free common case; this only re-applies when the
    // durable store is genuinely fresher.
    if (SLDB.available()) {
        Promise.all([ SLDB.get(AUTOSAVE_KEY).then(_maybeDecompress).catch(function(){return null;}),
                      SLDB.get(AUTOSAVE_META_KEY).catch(function(){return null;}) ])
        .then(function (pair) {
            var payload = pair[0];
            var idbMeta = pair[1];
            if (typeof idbMeta === 'string') { try { idbMeta = JSON.parse(idbMeta); } catch (_) { idbMeta = null; } }
            var idbTs = (idbMeta && idbMeta.ts) || 0;
            if (!payload) return false;
            let parsed; try { parsed = JSON.parse(payload); } catch(e) { return false; }
            if (!_autosaveHasContent(parsed)) return false;
            // Prefer IndexedDB only if nothing was recovered, or it is strictly newer than
            // what localStorage gave us. Equal timestamps => keep the sync apply, no churn.
            if (recovered && !(idbTs > _recoveredTs)) return false;
            _autosaveStoredHasContent = true;
            try {
                _applyProjectData(parsed); _dismissWelcomeIfOpen();
                // fire-and-forget: adopt the cloud identity from the IDB meta copy
                try {
                    SLDB.get(AUTOSAVE_META_KEY).then(function (mm) {
                        if (typeof mm === 'string') { try { mm = JSON.parse(mm); } catch (_) { mm = null; } }
                        _adoptCloudIdentityFromMeta(mm);
                    }).catch(function () {});
                } catch (_) {}
                return true;
            }
            catch(e){ console.warn('IDB auto-recover failed:', e); return false; }
        }).catch(function (e) { console.warn('IDB recovery check failed:', e); return false; })
          // The .catch above turns a rejection into `false`, so this single
          // handler covers BOTH outcomes — restored, empty, or IndexedDB down.
          // An onRejected arm here would be dead code; the behavioural check
          // "a REJECTED IndexedDB read still closes the recovery window" is what
          // proves the coverage, rather than a second handler that never runs.
          .then(function (ok) { _recoveryHoldEnd(); if (!ok && !recovered) _offerLastGoodIfAny(); });
        return;
    }
    _recoveryHoldEnd();
    if (!recovered) _offerLastGoodIfAny();
}

// E1 part 3 — when the CURRENT snapshot has nothing to give, say that an older
// one exists. Deliberately an OFFER, never a silent restore: the current slot
// being empty is also what a genuinely new project looks like, and quietly
// resurrecting the previous project on top of one would be its own data-loss
// story — the user's new work replaced by old work, which is exactly the shape
// of bug this item exists to close. So it surfaces through the recovery banner
// that has been built and unreachable since the silent-recovery path landed,
// and nothing happens until someone clicks.
function _offerLastGoodIfAny() {
    const consider = function (payload, ts) {
        if (!payload) return false;
        let parsed; try { parsed = JSON.parse(payload); } catch (_) { return false; }
        if (!_autosaveHasContent(parsed)) return false;
        try { _showLastGoodBanner(ts); } catch (_) {}
        return true;
    };
    try {
        let ts = 0;
        try { const m = JSON.parse(localStorage.getItem(LASTGOOD_META_KEY) || 'null'); ts = (m && m.ts) || 0; } catch (_) {}
        if (consider(localStorage.getItem(LASTGOOD_KEY), ts)) return;
    } catch (_) {}
    try {
        if (!SLDB.available()) return;
        SLDB.get(LASTGOOD_KEY).then(_maybeDecompress).then(function (payload) {
            return SLDB.get(LASTGOOD_META_KEY).then(function (m) { consider(payload, (m && m.ts) || 0); });
        }).catch(function () {});
    } catch (_) {}
}

function _showLastGoodBanner(ts) {
    const host = document.querySelector('.container');
    if (!host || document.querySelector('.recovery-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'recovery-banner';
    let ago = '';
    if (ts) {
        const age = Math.round((Date.now() - ts) / 1000);
        ago = age < 60 ? age + 's ago' : age < 3600 ? Math.round(age / 60) + ' min ago' : Math.round(age / 3600) + ' hr ago';
    }
    banner.innerHTML =
        '<div class="recovery-banner-text"><strong>This project is empty, but an earlier snapshot exists' +
        (ago ? ' from ' + ago : '') + '.</strong> Restore it, or dismiss to keep working in the blank project.</div>' +
        '<div class="recovery-banner-actions">' +
          '<button onclick="recoverLastGood()">Restore it</button>' +
          '<button class="btn-ghost" onclick="discardLastGood()">Dismiss</button>' +
        '</div>';
    const header = host.querySelector('.global-header');
    if (header && header.nextSibling) host.insertBefore(banner, header.nextSibling);
    else host.insertBefore(banner, host.firstChild);
}

function recoverLastGood() {
    const apply = function (payload) {
        let parsed; try { parsed = JSON.parse(payload); } catch (_) { return false; }
        if (!_autosaveHasContent(parsed)) return false;
        _applyProjectData(parsed);
        _dismissRecoveryBanner();
        showToast('Project restored from the earlier snapshot.', 'success');
        return true;
    };
    try {
        const p = localStorage.getItem(LASTGOOD_KEY);
        if (p && apply(p)) return;
        if (SLDB.available()) {
            SLDB.get(LASTGOOD_KEY).then(_maybeDecompress).then(function (q) {
                if (!q || !apply(q)) showToast('Nothing to restore.', 'warning');
            }).catch(function (e) { showToast('Restore failed: ' + ((e && e.message) || e), 'error'); });
            return;
        }
        showToast('Nothing to restore.', 'warning');
    } catch (e) { showToast('Restore failed: ' + e.message, 'error'); }
}

// Dismiss the OFFER without destroying the snapshot. The banner is advisory; a
// user who clicks Dismiss is saying "not now", not "delete my only other copy".
function discardLastGood() {
    _dismissRecoveryBanner();
}
function _showRecoveryBanner(ts) {
    const host = document.querySelector('.container');
    if(!host) return;
    const banner = document.createElement('div');
    banner.className = 'recovery-banner';
    const age = Math.round((Date.now() - ts) / 1000);
    const ago = age < 60 ? age + 's ago' : age < 3600 ? Math.round(age/60) + ' min ago' : Math.round(age/3600) + ' hr ago';
    banner.innerHTML =
        '<div class="recovery-banner-text"><strong>Unsaved work detected.</strong> An autosave from ' + ago +
        ' is available. Recover it, or discard to start fresh.</div>' +
        '<div class="recovery-banner-actions">' +
          '<button onclick="recoverAutosave()">Recover</button>' +
          '<button class="btn-ghost" onclick="discardAutosave()">Discard</button>' +
        '</div>';
    // Insert at top of container, right after global header.
    const header = host.querySelector('.global-header');
    if(header && header.nextSibling) host.insertBefore(banner, header.nextSibling);
    else host.insertBefore(banner, host.firstChild);
}
function recoverAutosave() {
    try {
        const payload = localStorage.getItem(AUTOSAVE_KEY);
        if (payload) {
            _applyProjectData(JSON.parse(payload));
            _dismissRecoveryBanner();
            showToast('Project recovered from autosave.', 'success');
            return;
        }
        // #14 — large projects live only in IndexedDB; fall back to it.
        if (SLDB.available()) {
            SLDB.get(AUTOSAVE_KEY).then(_maybeDecompress).then(function (p) {   // #44 — auto-detect compressed/plain
                if (!p) return showToast('Nothing to recover.', 'warning');
                _applyProjectData(JSON.parse(p)); _dismissRecoveryBanner();
                showToast('Project recovered from autosave.', 'success');
            }).catch(function (e) { showToast('Recovery failed: ' + ((e && e.message) || e), 'error'); });
            return;
        }
        showToast('Nothing to recover.', 'warning');
    } catch(e){ showToast('Recovery failed: ' + e.message, 'error'); }
}
function discardAutosave() {
    // E1 — the user has said, in as many words, that the stored copy is not worth
    // keeping. Clear the cached judgement with it, or the refusal in _writeAutosave
    // would go on protecting a slot that no longer exists.
    _autosaveStoredHasContent = false;
    try { localStorage.removeItem(AUTOSAVE_KEY); localStorage.removeItem(AUTOSAVE_META_KEY); } catch(e){}
    try { if (SLDB.available()) { SLDB.del(AUTOSAVE_KEY); SLDB.del(AUTOSAVE_META_KEY); } } catch(_){}   // #14 — clear IndexedDB copy too
    _dismissRecoveryBanner();
    showToast('Autosave discarded.', 'info');
}
function _dismissRecoveryBanner() {
    document.querySelectorAll('.recovery-banner').forEach(b => b.remove());
}

// Common project-data applier used by recovery + loadSampleProject.
function _applyProjectData(data) {
    _autosaveSuspended = true;
    try { _quantClearCache(); } catch(_) {}   // #45 — new project ⇒ drop any cached quant results
    try {
        // 20 Aug 2026 — DERIVED. This block used to assign ~35 stores by hand, and it is
        // the exact code that turns a PARTIAL payload into a wipe: every key it does not
        // find becomes empty, and `ftaPages = data.ftaPages || [one blank page]` is the
        // 84-byte fingerprint found on four destroyed customer projects. Deriving does not
        // change that semantics — a load must apply what it is given — but it guarantees
        // this path and the cloud/local snapshots agree on the SET of stores, which they
        // did not: projectTemplates was saved by everything and read back only by
        // open-from-cloud, so undo, autosave recovery, session resume and the multi-tab
        // guard all silently dropped it.
        //
        // The defence against a partial payload lives where it belongs: cloud_sync's shrink
        // guard and the sl_guard_project_document trigger in the database.
        if (typeof window !== 'undefined' && window.SLStores) {
            window.SLStores.restore(data);
        } else {
            _applyProjectDataLegacyAssign(data);
        }
        // The old block ended with this, and lifting the assignments out took it with them.
        // Caught on production, not by the wall: state was correct — projectName really was
        // "Aeolus HL-1 · Outsized Freighter" — while the browser tab still read "Untitled
        // Project". SLStores.restore() sets the BINDING; repainting what depends on it is
        // this function's job, and a store's UI side effect is not the declaration's business.
        if (typeof _refreshProjectNameUI === 'function') _refreshProjectNameUI();
        migrateAllFHAAssumptions();
        migrateSysSubFunctionsToFunctions();
        migrateLegacyMultiTraces();
        // Phase 53.42 — rebuild extractedFCs for every system (recovery + sample-project path).
        if (typeof rebuildExtractedFCsForAllSystems === 'function') rebuildExtractedFCsForAllSystems();
        backfillLogicalIds();
        try { AutoReq.recomputeFlags('ac'); systemsData.forEach(s => AutoReq.recomputeFlags('sys-' + s.id)); } catch(e){}
        selectedNodeData = null;
        const ncp = document.getElementById('node-config-panel'); if(ncp) ncp.style.display = 'none';
        Object.keys(formConfigs).forEach(mod => cancelEdit(mod));
        renderProjectConfigUI();
        // Phase 53.47 — honor the persisted last tab + FTA mode on recovery, instead of forcing
        // dashboard. Recovery is "pick up where I left off" — sending the user back to dashboard
        // every time is the opposite of that.
        let _recoveryTab = 'dashboard';
        try {
            const validTabs = ['dashboard', 'defs', 'ac-func', 'ac-fcim', 'phases', 'ac-fha', 'ac-req', 'ac-asm', 'sys-dir', 'sys-workspace', 'pra', 'zsa', 'cma', 'fmea', 'fta', 'library', 'markov', 'validation', 'trace', 'graph', 'moc', 'baselines', 'cm', 'review'];
            const saved = localStorage.getItem(_UI_LAST_TAB_KEY);
            if (saved && validTabs.indexOf(saved) >= 0) _recoveryTab = saved;
            const savedMode = localStorage.getItem(_UI_FTA_MODE_KEY);
            if (savedMode === 'top-down' || savedMode === 'bottom-up') {
                ftaConfig.mode = savedMode;
                const modeSel = document.getElementById('fta-calc-mode');
                if (modeSel) modeSel.value = savedMode;
            }
            // Phase 56.47 — also restore apportion on recovery.
            const savedApportion = localStorage.getItem(_UI_FTA_APPORTION_KEY);
            if (savedApportion === 'equal' || savedApportion === 'weighted') {
                ftaConfig.apportion = savedApportion;
                const aSel = document.getElementById('fta-apportion');
                if (aSel) aSel.value = savedApportion;
            }
        } catch(_) {}
        // ENG-5 — staged load: the recovery tab's tables render synchronously
        // (that's what the user sees); the other module tables stream through
        // idle slices with a flush-on-entry guarantee (streaming_load.js).
        // Fallback: legacy inline renders, identical to the pre-ENG-5 path.
        if (typeof SLStream !== 'undefined' && SLStream && SLStream.stageLoadRenders) {
            SLStream.stageLoadRenders(_recoveryTab);
        } else {
            renderACFunctions(); renderACFCIM(); renderACFHA(); renderACReq(); renderACAssumptions();
            renderPRA(); renderZSA(); renderFMEA(); renderFlightPhases();
        }
        switchTab(_recoveryTab); renderFTASidebar();
        // Phase 66 — allocations are derived state: re-derive per-page targets and
        // re-run the allocator on EVERY load (all pages, not just the active one),
        // so a save captured mid-state can never surface as P=0.
        if (typeof bakeAllAllocations === 'function') bakeAllAllocations(); else calculateAllProbabilities();
        updateD3();
    } finally {
        _autosaveSuspended = false;
        // ENG-5 — the load-end persistence write (full-project stringify; it
        // records the migrations) prefers an idle frame; _autosavePending +
        // the flush-on-hide path guarantee it can never be lost.
        if (typeof SLIdle !== 'undefined' && SLIdle) { _autosavePending = true; SLIdle.schedule('autosave', _writeAutosave, { timeout: 2500 }); }
        else _writeAutosave();
    }
}

function _loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (_xlsxLoading) return _xlsxLoading;
    _xlsxLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/xlsx.full.min.js';
        s.onload = () => resolve(window.XLSX);
        s.onerror = () => reject(new Error('Could not load SheetJS (vendor/xlsx.full.min.js is missing from this build)'));
        document.head.appendChild(s);
    });
    return _xlsxLoading;
}

// ExcelImport / SysMLImport / JamaConnect — extracted to importers.js (Phase 76
// modularization; byte-identical, loaded as a classic script BEFORE this file).

// #55 — shared branded letterhead for PDF exports, matching the white-paper / letterhead look
// (accent rule + SAFETY LAB AERO wordmark + report title). Version-safe (no align option).
function _pdfBrandHeader(doc, M, W, title, subtitle) {
    doc.setDrawColor(124, 58, 237); doc.setLineWidth(2.5); doc.line(M, 34, W - M, 34);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(124, 58, 237);
    doc.text('SAFETY LAB AERO', M, 50);
    doc.setFontSize(22); doc.setTextColor(17, 24, 39); doc.text(String(title || 'Safety Report'), M, 78);
    if (subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(110); doc.text(String(subtitle), M, 96); }
    doc.setDrawColor(220); doc.setLineWidth(0.5); doc.line(M, 108, W - M, 108);
    doc.setTextColor(0); doc.setFont('helvetica', 'normal');
    return 130;
}

async function exportProjectAsPDF() {
    showToast('Generating PDF…', 'info', 2500);
    try {
        const { jsPDF } = await _loadJsPDF();
        const doc = new jsPDF({ unit: 'pt', format: 'letter' });
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const M = 50;   // margin
        let y = M;

        // Branded cover letterhead (#55)
        y = _pdfBrandHeader(doc, M, W, 'Safety Lab Aero Report', projectScopeLabel() + '   ·   Generated ' + new Date().toLocaleString());
        y += 14;

        // Summary
        doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('Executive Summary', M, y); y += 22;
        doc.setFontSize(11); doc.setFont('helvetica', 'normal');
        const cat = acFhaData.filter(f => f.severity === 'Catastrophic').length;
        const haz = acFhaData.filter(f => f.severity === 'Hazardous').length;
        const lines = [
            'Regulation: ' + projectConfig.regulation + (projectConfig.regulation === 'Part 23' ? ' Class ' + projectConfig.part23Class : ''),
            'Aircraft hazards: ' + acFhaData.length + ' (Catastrophic: ' + cat + ', Hazardous: ' + haz + ')',
            'System folders: ' + systemsData.length,
            'Fault tree pages: ' + ftaPages.length,
            'Total requirements: ' + (acReqData.length + systemsData.reduce((a, s) => a + (s.req || []).length, 0)),
            'Open assumptions: ' + acAssumptionsData.filter(a => a.state !== 'Verified').length
        ];
        lines.forEach(l => { doc.text(l, M, y); y += 16; });
        y += 12;

        // FHA table
        if(acFhaData.length) {
            if(y > H - 200) { doc.addPage(); y = M; }
            doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('Aircraft FHA', M, y); y += 18;
            doc.setFontSize(9); doc.setFont('helvetica', 'normal');
            acFhaData.slice(0, 30).forEach(f => {
                if(y > H - 60) { doc.addPage(); y = M; }
                const t = getSafetyTarget(f.severity);
                const line = (f.fcId || '—') + '  ·  ' + (f.severity || '—') +
                             '  ·  DAL ' + (t.dal || '—') +
                             '  ·  ≤ ' + (t.prob ? t.prob.toExponential(0) + '/FH' : 'n/a');
                doc.setFont('helvetica', 'bold'); doc.text(line, M, y); y += 12;
                doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
                const wrapped = doc.splitTextToSize(f.fcDesc || '', W - 2*M);
                wrapped.forEach(wl => { if(y > H - 50) { doc.addPage(); y = M; } doc.text(wl, M + 10, y); y += 11; });
                doc.setTextColor(0); y += 4;
            });
            y += 10;
        }

        // FTA pages — serialize each tree's SVG to PNG via a quick canvas raster, then place.
        for(const page of ftaPages) {
            if(!page.root) continue;
            doc.addPage(); y = M;
            doc.setFontSize(16); doc.setFont('helvetica', 'bold');
            doc.text('Fault Tree: ' + (page.name || page.id), M, y); y += 22;

            // Snapshot the currently rendered SVG if this is the active page; otherwise skip rasterization.
            // (Rasterizing a non-active tree would require rendering it in a hidden d3 context — out of scope here.)
            if(page.id === activeFTAPageId) {
                try {
                    try { if (typeof SLLazy !== 'undefined') SLLazy.settle('fta-svg'); } catch (_) {}   // lazy_render.js: never photograph a stale canvas
                    const svgEl = document.getElementById('fta-svg');
                    const svgStr = new XMLSerializer().serializeToString(svgEl);
                    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const img = new Image();
                    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
                    const canvas = document.createElement('canvas');
                    const ratio = img.width / img.height;
                    const maxW = W - 2*M; const maxH = H - y - M;
                    let drawW = maxW, drawH = drawW / ratio;
                    if(drawH > maxH) { drawH = maxH; drawW = drawH * ratio; }
                    canvas.width = drawW * 2; canvas.height = drawH * 2;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(url);
                    const dataUrl = canvas.toDataURL('image/png');
                    doc.addImage(dataUrl, 'PNG', M, y, drawW, drawH);
                    y += drawH + 12;
                } catch(e) {
                    doc.setFontSize(10); doc.setFont('helvetica', 'italic');
                    doc.text('(Tree rendering not available for inactive pages — switch to the page and re-export to include.)', M, y); y += 16;
                }
            } else {
                doc.setFontSize(10); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
                doc.text('(Switch to this fault tree page and re-export to include its rendered graph.)', M, y); y += 16; doc.setTextColor(0);
            }
        }

        // Requirements
        if(acReqData.length) {
            doc.addPage(); y = M;
            doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('Aircraft Safety Requirements', M, y); y += 18;
            doc.setFontSize(9); doc.setFont('helvetica', 'normal');
            acReqData.slice(0, 60).forEach((r, i) => {
                if(y > H - 80) { doc.addPage(); y = M; }
                const head = (r.level || '—') + '  ·  ' + (r.type || '—') + '  ·  ' + (r.traceId || '—');
                doc.setFont('helvetica', 'bold'); doc.text('REQ-' + (i+1) + '  ' + head, M, y); y += 12;
                doc.setFont('helvetica', 'normal');
                const wrapped = doc.splitTextToSize(r.text || '', W - 2*M);
                wrapped.forEach(wl => { if(y > H - 50) { doc.addPage(); y = M; } doc.text(wl, M + 10, y); y += 11; });
                if(r.rat) {
                    doc.setTextColor(110);
                    const rat = doc.splitTextToSize('Rationale: ' + r.rat, W - 2*M);
                    rat.forEach(wl => { if(y > H - 50) { doc.addPage(); y = M; } doc.text(wl, M + 10, y); y += 11; });
                    doc.setTextColor(0);
                }
                y += 6;
            });
        }

        _stampBetaFooter(doc); await _savePdf(doc, 'Safety_Lab_' + _safeFileName(projectName) + '_Report_' + new Date().toISOString().slice(0,10) + '.pdf');
        showToast('PDF exported.', 'success', 3000);
    } catch(e) {
        showToast('PDF export failed: ' + e.message, 'error', 5000);
        console.error(e);
    }
}

// ============================================================================
// Phase 15 — Per-tab PDF export
// One unified entry point: exportTabAsPDF(moduleName). Tabular modules go through
// a generic table renderer; special tabs (Dashboard, FTA, Graph, Markov, Validation)
// have dedicated handlers.
// ============================================================================

// Generic paginated table renderer. Builds a PDF with:
//   • a title row + project scope subtitle
//   • a styled header row
//   • zebra-striped body rows with cell wrap + auto column sizing
//   • automatic page breaks
async function _pdfTableRenderer(title, headers, rows, opts) {
    opts = opts || {};
    const { jsPDF } = await _loadJsPDF();
    const orientation = (opts.landscape || (headers && headers.length > 6)) ? 'landscape' : 'portrait';
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 40;
    let y = M;

    // Branded cover heading (#55).
    const scope = (typeof projectScopeLabel === 'function') ? projectScopeLabel() : 'Safety Lab Aero project';
    y = _pdfBrandHeader(doc, M, W, title, scope + '   ·   ' + new Date().toLocaleString() + '   ·   ' + (rows || []).length + ' row' + ((rows || []).length === 1 ? '' : 's'));

    if (!rows || !rows.length) {
        doc.setFontSize(11); doc.setFont('helvetica', 'italic'); doc.setTextColor(140);
        doc.text('(No rows to export from this tab.)', M, y);
        _stampBetaFooter(doc); await _savePdf(doc, _safeFileName(projectName) + '_' + title.replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0,10) + '.pdf');
        return;
    }

    // Compute column widths. Equal allocation, capped by content length when narrow.
    const usable = W - 2 * M;
    const colW = headers.map(() => usable / headers.length);
    const headerH = 18;
    const rowFontSize = headers.length > 8 ? 7 : (headers.length > 5 ? 8 : 9);
    const cellPad = 5;
    const lineH = rowFontSize + 2;

    const drawHeader = () => {
        doc.setFillColor(238, 240, 244);
        doc.rect(M, y, usable, headerH, 'F');
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(50);
        let x = M;
        headers.forEach((h, i) => {
            doc.text(String(h).slice(0, 60), x + cellPad, y + 13);
            x += colW[i];
        });
        doc.setTextColor(0);
        y += headerH + 2;
    };
    drawHeader();

    doc.setFont('helvetica', 'normal'); doc.setFontSize(rowFontSize);

    rows.forEach((row, ri) => {
        // Estimate row height by tallest wrapped cell.
        const wraps = headers.map((_, ci) => {
            const v = row[ci] == null ? '' : String(row[ci]);
            return doc.splitTextToSize(v, colW[ci] - 2 * cellPad);
        });
        const rowH = Math.max(lineH, wraps.reduce((m, w) => Math.max(m, w.length), 0) * lineH) + 4;

        // Page break.
        if (y + rowH > H - M) {
            doc.addPage();
            y = M;
            drawHeader();
            doc.setFont('helvetica', 'normal'); doc.setFontSize(rowFontSize);
        }
        // Zebra stripe.
        if (ri % 2 === 1) {
            doc.setFillColor(249, 250, 252);
            doc.rect(M, y - 1, usable, rowH, 'F');
        }
        let x = M;
        wraps.forEach((w, ci) => {
            doc.text(w, x + cellPad, y + rowFontSize);
            x += colW[ci];
        });
        // Cell borders (light).
        doc.setDrawColor(228, 230, 235); doc.setLineWidth(0.4);
        let bx = M;
        for (let i = 0; i <= headers.length; i++) { doc.line(bx, y - 1, bx, y + rowH - 1); bx += colW[i] || 0; }
        doc.line(M, y + rowH - 1, M + usable, y + rowH - 1);
        y += rowH;
    });

    // Phase 42 — beta watermark in the footer of every page. Traceable if the PDF leaks.
    _stampBetaFooter(doc);
    const slug = title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    await _savePdf(doc, _safeFileName(projectName) + '_' + slug + '_' + new Date().toISOString().slice(0,10) + '.pdf');
    return doc;
}

// Phase 42 — walk every page of a jsPDF doc and stamp the build ID + tester label +
// export timestamp into the bottom margin. Used by _pdfTableRenderer and called manually
// by the special-handler exporters (Dashboard, FTA, Graph, Markov, Validation).
function _stampBetaFooter(doc) {
    if (!doc || typeof doc.getNumberOfPages !== 'function') return;
    try {
        const pageCount = doc.getNumberOfPages();
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const buildId = typeof BETA_BUILD_ID !== 'undefined' ? BETA_BUILD_ID : 'unknown';
        const tester  = typeof BETA_TESTER_LABEL !== 'undefined' ? BETA_TESTER_LABEL : 'unknown';
        const stamp   = 'Safety Lab Aero beta · build ' + buildId + ' · ' + tester + ' · exported ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z';
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(160);
            doc.text(stamp, 20, H - 12);
            doc.text('Page ' + i + ' / ' + pageCount, W - 20, H - 12, { align: 'right' });
            doc.setTextColor(0);
        }
    } catch(e) { /* never let the watermark break the export */ }
}

function _pdfDataForModule(moduleName) {
    const sName = (typeof sys === 'function' && sys()) ? sys().name : 'System';
    const fmtNum = v => v == null ? '' : (typeof v === 'number' ? v : v);
    switch (moduleName) {
        case 'AC_Functions':
            return { title: 'Aircraft Functions',
                headers: ['Function ID','Aircraft Function','Definition','Sub-Function ID','Sub-Function','Sub-Definition'],
                rows: (acFunctionsData || []).map(r => [r.funcId, r.funcName, r.funcDef, r.subId, r.subName, r.subDef]) };
        case 'AC_FCIM':
            return { title: 'Aircraft FCIM',
                headers: ['Sub-Function','Awareness','Total Loss ID','Total Loss','Partial Loss ID','Partial Loss','Malfunction ID','Malfunction'],
                rows: (acFcimData || []).map(r => [r.subId, r.awareness, r.tlId, r.tlDesc, r.plId, r.plDesc, r.mId, r.mDesc]) };
        case 'AC_FHA':
            return { title: 'Aircraft FHA',
                headers: ['Sub-Function','FC ID','Failure Condition','Phases','Effect on Aircraft','Effect on Crew','Effect on Pax','Aircraft Level','Crew Level','Pax Level','Severity','Assumption IDs','Comments'],
                rows: (acFhaData || []).map(r => [r.subId, r.fcId, r.fcDesc, r.phases, r.effAc, r.effCrew, r.effPax, r.effAcLevel || '', r.effCrewLevel || '', r.effPaxLevel || '', r.severity, (r.assumptionIds || []).join('; '), r.comments]) };
        case 'AC_Requirements':
            return { title: 'Aircraft Safety Requirements',
                headers: ['Trace','Level','Type','Requirement Statement','Rationale'],
                rows: (acReqData || []).map(r => [r.traceId, r.level, r.type, r.text, r.rat]) };
        case 'AC_Assumptions':
            return { title: 'Aircraft Assumptions Log',
                headers: ['Assumption ID','Origin','Statement','State','Linked Failure Conditions','Validation Strategy','Validation Artifacts','Verification Artifacts'],
                rows: (acAssumptionsData || []).map(r => {
                    const links = typeof getLinkedFHAs === 'function' ? getLinkedFHAs(r.asmId).map(l => l.scope + ':' + l.fcId).join('; ') : '';
                    return [r.asmId, r.origin, r.text, r.state, links, r.valStrategy, r.valArtifact, r.verArtifact];
                }) };
        case 'Sys_Functions': {
            if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return null; }
            return { title: sName + ' Functions',
                headers: ['AC Trace IDs','Function ID','Function','Definition'],
                rows: sys().functions.map(r => [
                    Array.isArray(r.traceIds) ? r.traceIds.join('; ') : (r.traceId || ''),
                    r.funcId, r.funcName, r.funcDef
                ]) };
        }
        case 'Sys_FCIM': {
            if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return null; }
            return { title: sName + ' FCIM',
                headers: ['Sub-Function','Awareness','Total Loss ID','Total Loss','Partial Loss ID','Partial Loss','Malfunction ID','Malfunction'],
                rows: sys().fcim.map(r => [r.subId, r.awareness, r.tlId, r.tlDesc, r.plId, r.plDesc, r.mId, r.mDesc]) };
        }
        case 'Sys_FHA': {
            if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return null; }
            return { title: sName + ' FHA',
                headers: ['AC Trace','Sub-Function','FC ID','Failure Condition','Phases','Effect on Aircraft','Effect on Crew','Effect on Pax','Aircraft Level','Crew Level','Pax Level','Severity','Assumption IDs','Comments'],
                rows: sys().fha.map(r => [r.acTrace, r.subId, r.fcId, r.fcDesc, r.phases, r.effAc, r.effCrew, r.effPax, r.effAcLevel || '', r.effCrewLevel || '', r.effPaxLevel || '', r.severity, (r.assumptionIds || []).join('; '), r.comments]) };
        }
        case 'Sys_Requirements': {
            if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return null; }
            return { title: sName + ' Safety Requirements',
                headers: ['Trace','Level','Type','Requirement Statement','Rationale'],
                rows: sys().req.map(r => [r.traceId, r.level, r.type, r.text, r.rat]) };
        }
        case 'Sys_Assumptions': {
            if (!sys()) { showToast('Open a system folder first.', 'warning', 4000); return null; }
            return { title: sName + ' Assumptions Log',
                headers: ['Assumption ID','Origin','Statement','State','Linked Failure Conditions','Validation Strategy','Validation Artifacts','Verification Artifacts'],
                rows: sys().asm.map(r => {
                    const links = typeof getLinkedFHAs === 'function' ? getLinkedFHAs(r.asmId).map(l => l.scope + ':' + l.fcId).join('; ') : '';
                    return [r.asmId, r.origin, r.text, r.state, links, r.valStrategy, r.valArtifact, r.verArtifact];
                }) };
        }
        case 'PRA':
            return { title: 'Particular Risk Analysis',
                headers: ['PRA ID','Threat','Description','Target Systems','Affected Zones','Exposed Functions','CSFL','Mitigation'],
                rows: (praData || []).map(p => {
                    const exposed = (typeof _exposedFunctionsForZones === 'function') ? _exposedFunctionsForZones(p.affectedZones || []) : [];
                    return [p.praId, p.threat, p.desc, p.systems, (p.affectedZones || []).join(', '), exposed.join(', '), p.csfl, p.mitigation];
                }) };
        case 'ZSA':
            return { title: 'Zonal Safety Analysis',
                headers: ['Zone ID','Boundaries','Installed Equipment','Worst Severity','Housed Functions','Interference','Mitigation','Status','Assessed (by / method / date)'],
                rows: (zsaData || []).map(z => [z.zoneId, z.desc, z.equip, z.severity, (z.housedFunctions || []).join(', '), z.interference, z.mitigation,
                    (typeof SLZsaRecord !== 'undefined' ? SLZsaRecord.statusText(z) : (z.findingStatus || '')),
                    [z.assessedBy, (typeof SLZsaRecord !== 'undefined' ? SLZsaRecord.methodText(z) : z.assessMethod), z.assessedOn].filter(Boolean).join(' / ')]) };
        case 'CMA':
            return { title: 'Common Mode Analysis',
                headers: ['Scope','CMA ID','Subject','Independence Claim','Linked Gates','Modes','Findings','Mitigation','Status'],
                rows: (cmaData || []).map(c => [
                    (c.scope === 'system') ? ('System: ' + ((systemsData.find(s => s.id === c.owningSystemId) || {}).name || c.owningSystemId || '')) : 'Aircraft',
                    c.cmaId, c.subject, c.claim,
                    (c.linkedGateIds || []).join(', '),
                    (c.modes || []).join(', '),
                    c.findings, c.mitigation, c.status
                ]) };
        case 'HW_FMEA':
            return { title: 'Failure Modes and Effects Analysis',
                headers: ['Scope','Type','FMEA ID','Reference','Failure Mode','Local Effect','Next Effect','End Effect','Severity','λ /hr','t (hr)','P'],
                rows: (fmeaData || []).map(r => {
                    const scope = (r.scope === 'system') ? ('Sys: ' + ((systemsData.find(s => s.id === r.owningSystemId) || {}).name || '')) : 'AC';
                    const isFunc = r.fmeaType === 'functional';
                    let ref = '';
                    if (isFunc) ref = r.funcSubId || '';
                    else {
                        for (let p of (ftaPages || [])) { const t = (typeof findNode === 'function') ? findNode(p.root, r.beId) : null; if (t) { ref = t.displayId; break; } }
                    }
                    return [
                        scope, isFunc ? 'Functional' : 'Piece-part', r.fmeaId, ref,
                        isFunc ? (FMEA_FUNC_MODE_LABELS && FMEA_FUNC_MODE_LABELS[r.funcMode] || r.funcMode || '') : r.mode,
                        r.localEffect, r.nextEffect, r.endEffect, r.severity,
                        isFunc ? '' : (r.rate || 0),
                        isFunc ? '' : (r.time || 0),
                        isFunc ? '' : ((r.prob || 0).toExponential ? (r.prob || 0).toExponential(3) : r.prob)
                    ];
                }) };
        case 'Flight_Phases':
            return { title: 'Flight Phases',
                headers: ['Phase of Flight','Altitude From','Unit From','Altitude To','Unit To','Duration','Duration Unit'],
                rows: (flightPhasesData || []).map(p => [p.phase, p.altFrom, p.altFromUnit, p.altTo, p.altToUnit, p.duration, p.durationUnit]) };
        case 'Fault_Tree': {
            const rows = [];
            (ftaPages || []).forEach(page => { if (page.root && typeof flattenFTAForExport === 'function') flattenFTAForExport(page.root, '', rows); });
            return { title: 'Fault Tree (All Pages — Tabular)',
                headers: ['Display ID','Parent ID','Type','Name','λ','P','CCF Group','β','Voting K','DAL Option','Allocated DAL','DAL Kind','Input Mode','Library Key','Library Source'],
                rows };
        }
        case 'Library': {
            if (typeof getActiveLibrary !== 'function') return null;
            const active = getActiveLibrary();
            return { title: 'Component Library',
                headers: ['Key','Name','Group','λ','Source','Status'],
                rows: Object.entries(active).map(([key, def]) => {
                    const isCustom = !isBuiltinLibraryEntry(key);
                    const isOverride = !isCustom && projectConfig.customLibrary[key];
                    return [key, def.name, def.group || '', def.lambda, def.source || '',
                            isCustom ? 'custom' : (isOverride ? 'override' : 'built-in')];
                }) };
        }
        case 'Cutset_Analysis': {
            const rootNode = (typeof getActiveFTARoot === 'function') ? getActiveFTARoot() : null;
            if (!rootNode) { showToast('No active fault tree to analyze.', 'warning', 4000); return null; }
            let raw;
            try { raw = getCutsets(rootNode); }
            catch (err) { if (err && err.name === 'CutsetExplosionError') { slAlert('Fault tree too complex to enumerate cut sets (exceeds ' + _CUTSET_BUDGET.toLocaleString() + ' combinations). Cut-set export aborted; simplify or split the tree.', { title: 'Cut-set export aborted' }); return null; } throw err; }
            const valid = raw.filter(c => c.length > 0).sort((a, b) => a.length - b.length);
            const min = [];
            for (let curr of valid) {
                const ids = curr.map(e => e.id); let sup = false;
                for (let m of min) if (m.map(e => e.id).every(id => ids.includes(id))) { sup = true; break; }
                if (!sup) min.push(curr);
            }
            const finalCutsets = (typeof expandCCFCutsets === 'function') ? expandCCFCutsets(min) : min;
            return { title: 'Minimal Cutsets',
                headers: ['Cutset #','Order','Event IDs','Event Names','Probability','CCF'],
                rows: finalCutsets.map((cs, i) => [
                    i + 1, cs.length,
                    cs.map(e => e.displayId).join(' AND '),
                    cs.map(e => e.name).join(' AND '),
                    cs.reduce((acc, e) => acc * (e.probability || 0), 1).toExponential(4),
                    cs.some(e => e.isCCF) ? 'Yes' : 'No'
                ]) };
        }
        case 'Trace_Matrix': {
            const rows = [];
            const allSysFhas = (typeof getAllSysFha === 'function') ? getAllSysFha() : [];
            (acFhaData || []).forEach(ac => {
                const linkedSys = allSysFhas.filter(s => s.acTrace === ac.fcId || (s.acTrace && s.acTrace.includes(ac.fcId)));
                if (!linkedSys.length) rows.push([ac.fcId, ac.severity, '(no system trace)', '', '']);
                else linkedSys.forEach(s => rows.push([ac.fcId, ac.severity, s.fcId, s.severity, s.subId]));
            });
            return { title: 'Traceability Matrix',
                headers: ['AC Hazard FC ID','AC Severity','System Hazard FC ID','System Severity','System Sub-Function'],
                rows };
        }
        case 'Definitions':
            return { title: 'AC 1309 Severity Definitions',
                headers: ['Classification','Effect on Aircraft','Effect on Occupants','Effect on Flight Crew'],
                rows: [
                    ['Catastrophic','Normally with hull loss. A failure condition that would prevent continued safe flight and landing is Catastrophic.','Multiple fatalities.','Fatalities or incapacitation.'],
                    ['Hazardous','Large reduction in functional capabilities or safety margins.','Serious or fatal injury to a small number of persons other than the flightcrew.','Physical distress or excessive workload such that the flightcrew cannot be relied upon to perform their tasks accurately or completely.'],
                    ['Major','Significant reduction in safety margins or functional capabilities.','Physical distress, possibly including injuries.','A physical discomfort or significant increase in workload or in conditions impairing the efficiency of the flightcrew.'],
                    ['Minor','Slight reduction in functional capabilities or safety margins.','Physical discomfort.','Slight increase in workload (routine flight plan changes, emergency procedures well within crew capability).'],
                    ['No Safety Effect','No effect on operational capabilities or safety.','Inconvenience.','No effect on flightcrew workload.']
                ] };
    }
    return null;
}

// Capture an HTML element (canvas, svg-wrapping div) into a data-URL PNG. Falls back
// gracefully if the element doesn't exist or is hidden.
async function _captureElementAsPng(el, maxW) {
    if (!el) return null;
    try {
        // Case 1: native <canvas> — just toDataURL it.
        if (el.tagName === 'CANVAS') return el.toDataURL('image/png');
        // Case 2: contains an <svg> — serialize and rasterize.
        const svgEl = (el.tagName === 'svg' || el.tagName === 'SVG') ? el : el.querySelector('svg');
        if (svgEl) {
            const svgStr = new XMLSerializer().serializeToString(svgEl);
            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
            const ratio = img.width / img.height;
            const drawW = Math.min(img.width, maxW || 1100);
            const drawH = drawW / ratio;
            const canvas = document.createElement('canvas');
            canvas.width = drawW * 2; canvas.height = drawH * 2;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            return canvas.toDataURL('image/png');
        }
    } catch (e) { console.warn('PNG capture failed', e); }
    return null;
}

// Dashboard — metrics, charts, worklist.
async function _exportDashboardPDF() {
    const { jsPDF } = await _loadJsPDF();
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 40; let y = M;
    doc.setFontSize(20); doc.setFont('helvetica', 'bold');
    doc.text('Executive Safety Dashboard', M, y); y += 18;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(110);
    doc.text((typeof projectScopeLabel === 'function' ? projectScopeLabel() : '') + '   ·   ' + new Date().toLocaleString(), M, y); y += 24;
    doc.setTextColor(0);

    // Tile metrics
    const getN = id => { const el = document.getElementById(id); return el ? el.textContent : '0'; };
    const cards = [
        ['Open Assumptions',  getN('dash-asm-open'),  'Proposed ' + getN('dash-asm-proposed') + ' · Validated ' + getN('dash-asm-validated') + ' · Verified ' + getN('dash-asm-verified')],
        ['Safety Requirements', getN('dash-req-total'), 'L1 ' + getN('dash-req-l1') + ' · L2 ' + getN('dash-req-l2') + ' · L3 ' + getN('dash-req-l3') + ' · L4 ' + getN('dash-req-l4')],
        ['Catastrophic Hazards', getN('dash-cat-haz'), 'AC ' + getN('dash-cat-haz-ac') + ' · Sys ' + getN('dash-cat-haz-sys')]
    ];
    const cardW = (W - 2*M - 20) / 3;
    cards.forEach((c, i) => {
        const x = M + i * (cardW + 10);
        doc.setDrawColor(220); doc.roundedRect(x, y, cardW, 70, 6, 6);
        doc.setFontSize(9); doc.setTextColor(110); doc.text(c[0], x + 10, y + 16);
        doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(0); doc.text(c[1], x + 10, y + 44);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120); doc.text(c[2], x + 10, y + 60);
    });
    y += 90;
    doc.setTextColor(0);

    // Phase 53.11 — reordered to match the live dashboard:
    //   tiles → activity → worklist → charts.
    // Rationale: actionable content (activity deltas + worklist) belongs above
    // the visualizations so a reader scanning the PDF sees what needs attention
    // first; the donut charts become a visual coda confirming the picture.

    // Activity since last Dashboard PDF — rendered against the PRIOR baseline so
    // the values reflect what's changed since the last export (the executor at
    // the end of this function captures a fresh baseline post-save).
    try {
        const d = typeof _computeDashboardDeltas === 'function' ? _computeDashboardDeltas() : null;
        if (d) {
            if (y + 80 > H - M) { doc.addPage(); y = M; }
            doc.setFontSize(14); doc.setFont('helvetica', 'bold');
            doc.text('Activity since last Dashboard PDF', M, y); y += 14;
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(110);
            const sinceLabel = new Date(d.since).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
            doc.text('Baseline ' + sinceLabel, M, y); y += 14;
            doc.setTextColor(0);
            doc.setFont('helvetica', 'bold'); doc.text('Requirements:', M, y); y += 11;
            doc.setFont('helvetica', 'normal');
            const reqLine = '  · +' + d.reqs.added + ' new   · ' + d.reqs.verified + ' newly verified   · '
                + d.reqs.archived + ' archived   · ' + d.reqs.obsoleted + ' obsoleted   · ' + d.reqs.removed + ' removed';
            doc.text(reqLine, M, y); y += 14;
            doc.setFont('helvetica', 'bold'); doc.text('Assumptions:', M, y); y += 11;
            doc.setFont('helvetica', 'normal');
            const asmLine = '  · +' + d.asms.added + ' new   · ' + d.asms.validated + ' newly validated   · '
                + d.asms.verified + ' newly verified   · ' + d.asms.removed + ' removed';
            doc.text(asmLine, M, y); y += 18;
        }
    } catch (e) { console.warn('Activity panel PDF render:', e); }

    // Worklist
    if (typeof Traceability !== 'undefined') {
        const w = Traceability.getWorklist();
        const sections = [
            ['Stale requirements',           w.staleReqs],
            ['Compromised independence reqs', w.compromisedReqs],
            ['Obsolete pending archive',     w.obsoletePending],
            ['Orphan FMEA rows',             w.orphanFmea],
            ['Open CMAs with findings',      w.openCmas]
        ];
        if (y + 40 > H - M) { doc.addPage(); y = M; }
        doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text('Worklist', M, y); y += 16;
        doc.setFontSize(9);
        sections.forEach(([title, items]) => {
            if (y + 24 > H - M) { doc.addPage(); y = M; }
            doc.setFont('helvetica', 'bold'); doc.setTextColor(80);
            doc.text(title + ' (' + items.length + ')', M, y); y += 12;
            doc.setFont('helvetica', 'normal'); doc.setTextColor(50);
            if (!items.length) { doc.setTextColor(160); doc.text('  · Nothing to address.', M, y); y += 12; doc.setTextColor(50); return; }
            items.slice(0, 18).forEach(item => {
                if (y + 12 > H - M) { doc.addPage(); y = M; }
                const wrapped = doc.splitTextToSize('  · ' + item.label, W - 2*M);
                wrapped.forEach(wl => { if (y + 12 > H - M) { doc.addPage(); y = M; } doc.text(wl, M, y); y += 11; });
            });
            y += 4;
        });
        doc.setTextColor(0);
        y += 6;
    }

    // Charts last — supporting visual context. Section header keeps the order
    // legible when scanning the printed deliverable.
    if (y + 220 > H - M) { doc.addPage(); y = M; }
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Hazard severity & lifecycle breakdown', M, y); y += 18;
    const chartIds = ['acChart', 'sysChart', 'asmStateChart', 'reqLevelChart'];
    const chartLabels = ['Aircraft Hazard Severities', 'System Hazard Severities', 'Assumption Lifecycle', 'Requirements by Level'];
    const chW = (W - 2*M - 10) / 2; const chH = 160;
    for (let i = 0; i < chartIds.length; i++) {
        // Phase 62.1 — charts removed from the dashboard; skip gracefully when absent.
        if (!document.getElementById(chartIds[i])) continue;
        if (y + chH + 24 > H - M) { doc.addPage(); y = M; }
        const png = await _captureElementAsPng(document.getElementById(chartIds[i]));
        const x = M + (i % 2) * (chW + 10);
        if (png) doc.addImage(png, 'PNG', x, y + 12, chW, chH);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text(chartLabels[i], x, y + 8);
        if (i % 2 === 1) y += chH + 24;
    }
    if (chartIds.length % 2 === 1) y += chH + 24;

    _stampBetaFooter(doc); await _savePdf(doc, _safeFileName(projectName) + '_Dashboard_' + new Date().toISOString().slice(0,10) + '.pdf');

    // Phase 51 — capture a fresh activity baseline now that the snapshot has shipped.
    // From here on, dashboard deltas count changes since THIS export.
    try {
        if (typeof _captureDashboardBaseline === 'function') _captureDashboardBaseline();
        if (typeof renderDashboardActivityPanel === 'function') renderDashboardActivityPanel();
    } catch (e) { console.warn('Baseline capture after PDF:', e); }
}

// FTA — active page raster + cutset table.
async function _exportFtaPDF() {
    const { jsPDF } = await _loadJsPDF();
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
    const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 40; let y = M;
    const activePage = (ftaPages || []).find(p => p.id === activeFTAPageId);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text('Fault Tree: ' + (activePage ? activePage.name : '(no active tree)'), M, y); y += 16;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(110);
    doc.text((typeof projectScopeLabel === 'function' ? projectScopeLabel() : '') + '   ·   ' + new Date().toLocaleString(), M, y);
    doc.setTextColor(0); y += 22;

    // Tree image
    try { if (typeof SLLazy !== 'undefined') SLLazy.settle('fta-svg'); } catch (_) {}   // lazy_render.js: never photograph a stale canvas
    const svgEl = document.getElementById('fta-svg');
    if (svgEl && activePage) {
        const png = await _captureElementAsPng(svgEl, 1100);
        if (png) {
            const img = new Image(); img.src = png;
            await new Promise(r => { img.onload = r; });
            const ratio = img.width / img.height;
            const maxW = W - 2*M, maxH = H - y - M - 40;
            let drawW = maxW, drawH = drawW / ratio;
            if (drawH > maxH) { drawH = maxH; drawW = drawH * ratio; }
            doc.addImage(png, 'PNG', M, y, drawW, drawH);
            y += drawH + 16;
        }
    }
    // Cutsets
    const data = _pdfDataForModule('Cutset_Analysis');
    if (data && data.rows.length) {
        if (y + 40 > H - M) { doc.addPage(); y = M; }
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('Minimal Cutsets', M, y); y += 14;
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        data.rows.slice(0, 80).forEach(r => {
            if (y + 12 > H - M) { doc.addPage(); y = M; }
            doc.text('#' + r[0] + '  ord=' + r[1] + '  ' + r[2] + '   P=' + r[4], M, y); y += 10;
        });
    }
    _stampBetaFooter(doc); await _savePdf(doc, _safeFileName(projectName) + '_FaultTree_' + (activePage ? activePage.name : 'untitled').replace(/[^A-Za-z0-9]+/g, '_') + '_' + new Date().toISOString().slice(0,10) + '.pdf');
}

// Graph — vis-network canvas snapshot + stats.
async function _exportGraphPDF() {
    const { jsPDF } = await _loadJsPDF();
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
    const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 40; let y = M;
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text('Traceability Graph', M, y); y += 16;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(110);
    doc.text((typeof projectScopeLabel === 'function' ? projectScopeLabel() : '') + '   ·   ' + new Date().toLocaleString(), M, y);
    doc.setTextColor(0); y += 22;

    const host = document.getElementById('trace-graph-canvas');
    if (host) {
        const cnv = host.querySelector('canvas');
        if (cnv) {
            const png = cnv.toDataURL('image/png');
            const img = new Image(); img.src = png;
            await new Promise(r => { img.onload = r; });
            const ratio = img.width / img.height;
            const maxW = W - 2*M, maxH = H - y - M - 20;
            let drawW = maxW, drawH = drawW / ratio;
            if (drawH > maxH) { drawH = maxH; drawW = drawH * ratio; }
            doc.addImage(png, 'PNG', M, y, drawW, drawH);
        } else {
            doc.setFontSize(11); doc.setFont('helvetica', 'italic');
            doc.text('Graph not yet rendered — open the Traceability Graph tab and click Re-layout, then re-export.', M, y);
        }
    }
    _stampBetaFooter(doc); await _savePdf(doc, _safeFileName(projectName) + '_Traceability_Graph_' + new Date().toISOString().slice(0,10) + '.pdf');
}

// Markov — summary of all models + their solution.
async function _exportMarkovPDF() {
    const models = (projectConfig && Array.isArray(projectConfig.markovModels)) ? projectConfig.markovModels : [];
    if (!models.length) {
        showToast('No Markov models to export.', 'warning', 3000); return;
    }
    const { jsPDF } = await _loadJsPDF();
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 40; let y = M;
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.text('Markov Models', M, y); y += 16;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(110);
    doc.text((typeof projectScopeLabel === 'function' ? projectScopeLabel() : '') + '   ·   ' + new Date().toLocaleString(), M, y);
    doc.setTextColor(0); y += 22;
    models.forEach(model => {
        if (y > H - 120) { doc.addPage(); y = M; }
        doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text(model.name || '(unnamed model)', M, y); y += 14;
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        doc.text('States: ' + ((model.states || []).map(s => s.name + (s.isFailed ? ' [FAIL]' : '')).join(', ')), M, y); y += 11;
        doc.text('Transitions: ' + ((model.transitions || []).length), M, y); y += 11;
        if (model.lastSolution) {
            doc.setTextColor(80);
            doc.text('Steady-state failure probability: ' + (model.lastSolution.pSS != null ? model.lastSolution.pSS.toExponential(4) : 'n/a'), M, y); y += 11;
            doc.setTextColor(0);
        }
        y += 6;
    });
    _stampBetaFooter(doc); await _savePdf(doc, _safeFileName(projectName) + '_Markov_' + new Date().toISOString().slice(0,10) + '.pdf');
}

// Validation — benchmark results.
async function _exportValidationPDF() {
    if (typeof BENCHMARKS === 'undefined' || !BENCHMARKS.length) {
        showToast('No benchmarks available to export.', 'warning', 3000); return;
    }
    const data = (typeof _benchmarkResults !== 'undefined' && Array.isArray(_benchmarkResults)) ? _benchmarkResults : null;
    const rows = BENCHMARKS.map((b, i) => {
        const r = data && data[i];
        return [b.id || ('BM-' + (i+1)), b.name, b.standard || '', b.category || '', r ? (r.pass ? 'PASS' : 'FAIL') : '(not run)', r ? (r.value != null ? r.value : '') : '', r ? (r.expected != null ? r.expected : '') : '', r ? (r.tol != null ? r.tol : '') : ''];
    });
    return _pdfTableRenderer('Math Validation', ['ID','Benchmark','Standard','Category','Result','Computed','Expected','Tolerance'], rows, { landscape: true });
}

// Unified entry point.
async function exportTabAsPDF(moduleName) {
    showToast('Generating PDF…', 'info', 2200);
    try {
        if (moduleName === 'Dashboard') return _exportDashboardPDF();
        if (moduleName === 'FTA' || moduleName === 'Fault_Tree_Page') return _exportFtaPDF();
        if (moduleName === 'Graph') return _exportGraphPDF();
        if (moduleName === 'Markov') return _exportMarkovPDF();
        if (moduleName === 'Validation') return _exportValidationPDF();
        const data = _pdfDataForModule(moduleName);
        if (!data) { showToast('No PDF exporter for "' + moduleName + '".', 'warning', 3000); return; }
        return _pdfTableRenderer(data.title, data.headers, data.rows, { landscape: data.headers.length > 6 });
    } catch (e) {
        console.error(e);
        showToast('PDF export failed: ' + e.message, 'error', 5000);
    }
}

// Lazy-load the showcase bundle (demo_showcase.js, ~88KB) on first use so it stays off the
// critical path for real users. The module self-installs window.SL_SHOWCASE synchronously on
// execution (its install() runs immediately, not on a future window 'load' event).
function _ensureShowcaseLoaded() {
    return new Promise(function (resolve, reject) {
        if (window.SL_SHOWCASE && typeof window.SL_SHOWCASE.build === 'function') return resolve();
        var existing = document.getElementById('sl-showcase-lazy');
        if (existing) {
            existing.addEventListener('load', function () { resolve(); });
            existing.addEventListener('error', function () { reject(new Error('showcase load failed')); });
            return;
        }
        var s = document.createElement('script');
        s.id = 'sl-showcase-lazy';
        s.src = window.SL_SHOWCASE_SRC || 'demo_showcase.js?v=65.43';
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('showcase load failed')); };
        document.head.appendChild(s);
    });
}

async function loadSampleProject() {
    // Phase E3 — the K350 Kestrel program showcase (demo_showcase.js) replaces
    // the SV-7 / ES-9 pair: one comprehensive worked example threading all six
    // assessments and every method surface. The MAC rules are compiled to
    // MF&MS trees by the LIVE engine at load (postLoad), not shipped as data.
    try { await _ensureShowcaseLoaded(); } catch (_) {}
    if (!(window.SL_SHOWCASE && typeof window.SL_SHOWCASE.build === 'function')) {
        showToast('The sample project is unavailable in this build.', 'error', 3500); return;
    }
    let data;
    try { data = window.SL_SHOWCASE.build(); }
    catch (err) { showToast('Could not build the sample: ' + (err && err.message || err), 'error', 4500); return; }
    try { _applyProjectData(data); }
    catch (err) { showToast('Could not load the sample: ' + (err && err.message || err), 'error', 4500); return; }
    try { window.SL_SHOWCASE.postLoad(); } catch (_) {}
    try { localStorage.setItem('safetyLab.onrampState.v1', 'dismissed'); if (window._refreshOnramp) window._refreshOnramp(); } catch (_) {}
    showToast('K350 Kestrel showcase loaded — MAC trees compiled and proven live. Start at the Dashboard cockpits, then Aircraft Safety → PASA.', 'success', 6000);
}

function _buildSampleProject() {
    // ============================================================================
    // uSTOL Demo Project — Part 23 Class III commuter, 1-hour mission profile.
    // ----------------------------------------------------------------------------
    // 5 systems (FCS / EPS / AVS / PROP / LGS), credible functions + FCIM linkage,
    // PRA + ZSA populated, multiple LRUs per system, FTAs reach down to LRU level
    // via transfer gates between aircraft- and system-level trees.
    //
    // Deliberately empty: acReqData + every system .req array, plus DAL allocations
    // on FTA nodes. The user runs Auto-generate / DAL allocation themselves to
    // explore those flows.
    // ============================================================================
    let nextId = 1000;
    const id = () => nextId++;

    // ---- Page IDs (declared first so transfer gates can reference them) ----
    const PAGE_AC_PITCH    = 'page-ac-pitch';
    const PAGE_AC_THRUST   = 'page-ac-thrust';
    const PAGE_AC_LDG      = 'page-ac-ldg';
    const PAGE_FCS_PITCH   = 'page-fcs-pitch';
    const PAGE_EPS_FCS     = 'page-eps-fcs';
    const PAGE_PROP_THRUST = 'page-prop-thrust';
    const PAGE_AVS_PFD     = 'page-avs-pfd';
    const PAGE_LGS_EXT     = 'page-lgs-ext';

    // ---- AC FHA internal IDs (referenced by FTA pages + traces) ----
    const FHA_PITCH    = 'fha-ac-pitch';
    const FHA_ROLL     = 'fha-ac-roll';
    const FHA_YAW      = 'fha-ac-yaw';
    const FHA_THRUST   = 'fha-ac-thrust';
    const FHA_ASYM     = 'fha-ac-asym';
    const FHA_ELEC     = 'fha-ac-elec';
    const FHA_PFD      = 'fha-ac-pfd';
    const FHA_NAV      = 'fha-ac-nav';
    const FHA_LDG_EXT  = 'fha-ac-ldg-ext';
    const FHA_LDG_COL  = 'fha-ac-ldg-col';

    // Convenience builders -----------------------------------------------------
    const gate = (gateType, name, kids, opts) => Object.assign({
        id: id(), displayId: opts && opts.displayId || '',
        name, type: 'gate', gateType, probability: 0,
        children: kids || []
    }, opts || {});
    const xfer = (linkedPageId, name, displayId) => ({
        id: id(), displayId, name,
        type: 'gate', gateType: 'TRANSFER',
        linkedPageId, probability: 0, children: []
    });
    const be = (name, lambda, opts) => Object.assign({
        id: id(), displayId: opts && opts.displayId || '',
        name, type: 'basic', lambda, probability: 0, inputMode: 'lambda',
        children: []
    }, opts || {});
    // logicalId defaults to id (post-construction patch — keeps each call site terse).
    const seal = (node) => {
        if (node.logicalId == null) node.logicalId = node.id;
        const kids = node.children || [];
        kids.forEach(seal);
        return node;
    };
    const setDisplayIds = (root, prefix) => {
        let g = 1, b = 1, u = 1;
        (function walk(n) {
            if (!n) return;
            if (!n.displayId) {
                if (n.type === 'gate' && n.gateType === 'TRANSFER') { n.displayId = `${prefix}-T${b++}`; }
                else if (n.type === 'gate') { n.displayId = `${prefix}-G${g++}`; }
                else { n.displayId = `${prefix}-BE${u++}`; }
            }
            (n.children || []).forEach(walk);
        })(root);
    };

    // ============================================================================
    // AIRCRAFT-LEVEL ARTIFACTS
    // ============================================================================
    const acFunctionsData = [
        // F-CONTROL — flight control
        { internalId: 'acfn-1',  funcId: 'F-CONTROL', funcName: 'Maintain Controlled Flight', funcDef: 'Provide axes of control and stability through full envelope.', subId: 'SF-PITCH', subName: 'Pitch Control',  subDef: 'Stabilize and command aircraft pitch attitude.' },
        { internalId: 'acfn-2',  funcId: 'F-CONTROL', funcName: 'Maintain Controlled Flight', funcDef: '', subId: 'SF-ROLL',  subName: 'Roll Control',   subDef: 'Roll axis stabilization and command authority.' },
        { internalId: 'acfn-3',  funcId: 'F-CONTROL', funcName: 'Maintain Controlled Flight', funcDef: '', subId: 'SF-YAW',   subName: 'Yaw Control',    subDef: 'Directional control via rudder.' },
        // F-PROPEL — propulsion
        { internalId: 'acfn-4',  funcId: 'F-PROPEL',  funcName: 'Provide Thrust',             funcDef: 'Generate and modulate thrust over the operating envelope.', subId: 'SF-THRUST', subName: 'Thrust Generation', subDef: 'Provide commanded thrust from twin turboprop installation.' },
        { internalId: 'acfn-5',  funcId: 'F-PROPEL',  funcName: 'Provide Thrust',             funcDef: '', subId: 'SF-FUEL',  subName: 'Fuel Delivery',   subDef: 'Deliver fuel at required pressure and flow to both engines.' },
        // F-POWER — electrical
        { internalId: 'acfn-6',  funcId: 'F-POWER',   funcName: 'Provide Electrical Power',   funcDef: 'Generate, store, distribute regulated electrical power.', subId: 'SF-GEN',   subName: 'Power Generation', subDef: 'Generator and battery power generation/storage.' },
        { internalId: 'acfn-7',  funcId: 'F-POWER',   funcName: 'Provide Electrical Power',   funcDef: '', subId: 'SF-DIST',  subName: 'Power Distribution', subDef: 'Distribute power to loads via main and emergency buses.' },
        // F-NAVIGATE — avionics
        { internalId: 'acfn-8',  funcId: 'F-NAV',     funcName: 'Provide Navigation & Displays', funcDef: 'Provide attitude, position, and guidance information to the crew.', subId: 'SF-PFD',  subName: 'Primary Flight Display', subDef: 'Display attitude, airspeed, altitude, heading.' },
        { internalId: 'acfn-9',  funcId: 'F-NAV',     funcName: 'Provide Navigation & Displays', funcDef: '', subId: 'SF-NAV',  subName: 'Navigation', subDef: 'Provide position and course guidance (GPS + nav radio).' },
        // F-LAND — landing
        { internalId: 'acfn-10', funcId: 'F-LAND',    funcName: 'Enable Safe Landing',        funcDef: 'Provide gear extension, ground stability, and braking.', subId: 'SF-LGS',   subName: 'Landing Gear', subDef: 'Extend, retract, and support aircraft on ground.' }
    ];

    // FCIM — Functional Crew Interaction Matrix. One row per AC sub-function.
    const acFcimData = [
        { internalId: 'fcim-1',  subId: 'SF-PITCH',  awareness: 'PFD attitude indication; control feel',           tlId: 'TL-PITCH',  tlDesc: 'Total loss of pitch attitude command',     plId: 'PL-PITCH',  plDesc: 'Reduced pitch authority',          mId: 'M-PITCH',  mDesc: 'Erroneous pitch command (runaway elevator)' },
        { internalId: 'fcim-2',  subId: 'SF-ROLL',   awareness: 'PFD bank indicator; lateral feel',                tlId: 'TL-ROLL',   tlDesc: 'Total loss of roll authority',             plId: 'PL-ROLL',   plDesc: 'Sluggish roll response',           mId: 'M-ROLL',   mDesc: 'Hardover roll command' },
        { internalId: 'fcim-3',  subId: 'SF-YAW',    awareness: 'Heading indicator; slip/skid ball; pedal feel',   tlId: 'TL-YAW',    tlDesc: 'Total loss of yaw control',                plId: 'PL-YAW',    plDesc: 'Reduced rudder authority',         mId: 'M-YAW',    mDesc: 'Uncommanded yaw input' },
        { internalId: 'fcim-4',  subId: 'SF-THRUST', awareness: 'ITT/TQ gauges; engine page; auditory cues',       tlId: 'TL-THRUST', tlDesc: 'Total thrust loss (both engines)',         plId: 'PL-THRUST', plDesc: 'Asymmetric thrust',                mId: 'M-THRUST', mDesc: 'Erroneous thrust commanded (uncommanded high/low)' },
        { internalId: 'fcim-5',  subId: 'SF-FUEL',   awareness: 'Fuel quantity / flow gauges; CAS alerts',         tlId: 'TL-FUEL',   tlDesc: 'Total loss of fuel delivery',              plId: 'PL-FUEL',   plDesc: 'Reduced fuel pressure / flow',     mId: 'M-FUEL',   mDesc: 'Incorrect fuel flow indication' },
        { internalId: 'fcim-6',  subId: 'SF-GEN',    awareness: 'Bus voltage indicators; CAS alerts',              tlId: 'TL-GEN',    tlDesc: 'Total loss of power generation',           plId: 'PL-GEN',    plDesc: 'Single generator loss',            mId: 'M-GEN',    mDesc: 'Voltage out of regulation' },
        { internalId: 'fcim-7',  subId: 'SF-DIST',   awareness: 'Bus tie indications; equipment loss patterns',    tlId: 'TL-DIST',   tlDesc: 'Total loss of main bus distribution',      plId: 'PL-DIST',   plDesc: 'Loss of single bus / partial loads', mId: 'M-DIST', mDesc: 'Cross-bus fault (incorrect power source)' },
        { internalId: 'fcim-8',  subId: 'SF-PFD',    awareness: 'X-flags; comparator warnings; standby instruments', tlId: 'TL-PFD',  tlDesc: 'Loss of PFD information (blank/red-X)',    plId: 'PL-PFD',    plDesc: 'Degraded PFD (one channel)',       mId: 'M-PFD',    mDesc: 'Misleading PFD data (no flag)' },
        { internalId: 'fcim-9',  subId: 'SF-NAV',    awareness: 'CDI deflections; GPS integrity flags',            tlId: 'TL-NAV',    tlDesc: 'Total loss of navigation',                 plId: 'PL-NAV',    plDesc: 'Degraded navigation accuracy',     mId: 'M-NAV',    mDesc: 'Hazardously misleading navigation' },
        { internalId: 'fcim-10', subId: 'SF-LGS',    awareness: 'Gear position lights; horn; pressure gauges',     tlId: 'TL-LGS',    tlDesc: 'Failure to extend landing gear',           plId: 'PL-LGS',    plDesc: 'Asymmetric / partial gear extension', mId: 'M-LGS', mDesc: 'False gear-down indication' }
    ];

    const acExtractedFCs = [
        'FC-PITCH-LOSS','FC-ROLL-DEG','FC-YAW-LOSS','FC-THRUST-LOSS','FC-THRUST-ASYM',
        'FC-ELEC-LOSS','FC-PFD-LOSS','FC-NAV-ERR','FC-LDG-NOEXT','FC-LDG-COLLAPSE'
    ];

    const acFhaData = [
        { internalId: FHA_PITCH,   subId: 'SF-PITCH',  fcId: 'FC-PITCH-LOSS',    fcDesc: 'Total loss of pitch control authority',   phases: 'Takeoff, Initial Climb, Approach, Landing', effAc: 'Loss of controlled flight', effCrew: 'Crew unable to maintain pitch attitude', effPax: 'Catastrophic injuries probable', severity: 'Catastrophic', assumptionIds: ['ASM-1','ASM-2'], comments: 'Drives AC top tree FTA-AC-PITCH.' },
        { internalId: FHA_ROLL,    subId: 'SF-ROLL',   fcId: 'FC-ROLL-DEG',      fcDesc: 'Degraded roll authority',                  phases: 'Cruise, Approach',                          effAc: 'Reduced maneuverability', effCrew: 'Increased workload', effPax: 'Passenger discomfort', severity: 'Hazardous', assumptionIds: ['ASM-1'], comments: '' },
        { internalId: FHA_YAW,     subId: 'SF-YAW',    fcId: 'FC-YAW-LOSS',      fcDesc: 'Total loss of yaw control',                phases: 'Takeoff, Landing',                          effAc: 'Loss of directional control during ground roll', effCrew: 'Significant workload', effPax: 'Possible runway excursion', severity: 'Hazardous', assumptionIds: [], comments: '' },
        { internalId: FHA_THRUST,  subId: 'SF-THRUST', fcId: 'FC-THRUST-LOSS',   fcDesc: 'Total loss of thrust (both engines)',      phases: 'All',                                       effAc: 'Forced glide / off-airport landing', effCrew: 'Emergency descent procedure', effPax: 'Catastrophic injuries probable', severity: 'Catastrophic', assumptionIds: ['ASM-1','ASM-3'], comments: 'Drives AC top tree FTA-AC-THRUST.' },
        { internalId: FHA_ASYM,    subId: 'SF-THRUST', fcId: 'FC-THRUST-ASYM',   fcDesc: 'Asymmetric thrust at low altitude',         phases: 'Takeoff, Initial Climb',                    effAc: 'Lateral/directional excursion', effCrew: 'Vmc handling procedure', effPax: 'Significant', severity: 'Hazardous', assumptionIds: ['ASM-2'], comments: '' },
        { internalId: FHA_ELEC,    subId: 'SF-GEN',    fcId: 'FC-ELEC-LOSS',     fcDesc: 'Total loss of electrical power',           phases: 'All',                                       effAc: 'Degraded avionics; battery-only ops', effCrew: 'Emergency electrical procedure', effPax: 'Reduced cabin lighting', severity: 'Hazardous', assumptionIds: [], comments: 'Drives EPS-level trees.' },
        { internalId: FHA_PFD,     subId: 'SF-PFD',    fcId: 'FC-PFD-LOSS',      fcDesc: 'Loss of primary flight display',           phases: 'All',                                       effAc: 'Reversion to standby instruments', effCrew: 'Increased workload', effPax: 'No direct effect', severity: 'Major', assumptionIds: [], comments: '' },
        { internalId: FHA_NAV,     subId: 'SF-NAV',    fcId: 'FC-NAV-ERR',       fcDesc: 'Hazardously misleading navigation',        phases: 'Cruise, Approach',                          effAc: 'Course/terrain deviation', effCrew: 'Cross-check workload', effPax: 'Possible terrain encounter', severity: 'Hazardous', assumptionIds: [], comments: '' },
        { internalId: FHA_LDG_EXT, subId: 'SF-LGS',    fcId: 'FC-LDG-NOEXT',     fcDesc: 'Landing gear fails to extend',              phases: 'Approach, Landing',                         effAc: 'Belly landing', effCrew: 'Emergency landing procedure', effPax: 'Significant injury risk', severity: 'Major', assumptionIds: ['ASM-2'], comments: '' },
        { internalId: FHA_LDG_COL, subId: 'SF-LGS',    fcId: 'FC-LDG-COLLAPSE',  fcDesc: 'Landing gear collapse on landing',         phases: 'Landing',                                   effAc: 'Loss of ground stability', effCrew: 'Reduced control', effPax: 'Possible serious injury', severity: 'Hazardous', assumptionIds: [], comments: '' }
    ];

    const acAssumptionsData = [
        { asmId: 'ASM-1', origin: 'Top-down derivation', text: 'Aircraft is operated within the approved flight envelope at all times.',                              state: 'Validated', valStrategy: 'Operational limits in AFM',                  valArtifact: 'AFM section 3.1',     verArtifact: '', linkedFunctions: ['acfn-1','acfn-2','acfn-3'] },
        { asmId: 'ASM-2', origin: 'Maintenance',         text: 'Aircraft is maintained per the Instructions for Continued Airworthiness (ICA).',                       state: 'Open',      valStrategy: 'AMM compliance audit at first scheduled check', valArtifact: '',                  verArtifact: '', linkedFunctions: [] },
        { asmId: 'ASM-3', origin: 'Crew',                text: 'Flight crew is trained to AFM emergency procedures and recurrent training requirements per Part 61.',  state: 'Open',      valStrategy: 'Training program review',                       valArtifact: '',                  verArtifact: '', linkedFunctions: ['acfn-4'] }
    ];

    // ============================================================================
    // SYSTEM-LEVEL DATA — 5 systems
    // ============================================================================
    const systemsData = [
        // ---- 1. FCS — Flight Control System ----
        // dependsOn references OTHER systems' funcIds (cross-system tracing).
        {
            id: 'sys-fcs', name: 'Flight Control System', asmCounter: 2,
            functions: [
                { internalId: 'sysfn-fcs-1', traceIds: ['SF-PITCH'], funcId: 'FCS-ELEV', funcName: 'Elevator Drive',  funcDef: 'Drive elevator surfaces in response to pilot/autopilot commands. Requires hydraulic supply from LGS-HYD and electrical command power from EPS-DIST.', subId: 'SSF-ELEV', subName: 'Elevator Actuation', subDef: 'Move elevators per surface command.', dependsOn: ['LGS-HYD','EPS-DIST'] },
                { internalId: 'sysfn-fcs-2', traceIds: ['SF-ROLL'],  funcId: 'FCS-AIL',  funcName: 'Aileron Drive',   funcDef: 'Drive aileron surfaces for roll command. Requires hydraulic supply and electrical command power.', subId: 'SSF-AIL',  subName: 'Aileron Actuation',  subDef: 'Move ailerons per surface command.', dependsOn: ['LGS-HYD','EPS-DIST'] },
                { internalId: 'sysfn-fcs-3', traceIds: ['SF-YAW'],   funcId: 'FCS-RUD',  funcName: 'Rudder Drive',    funcDef: 'Drive rudder for yaw command and ground steering. Requires hydraulic supply and electrical command power.', subId: 'SSF-RUD',  subName: 'Rudder Actuation',   subDef: 'Move rudder per surface command.', dependsOn: ['LGS-HYD','EPS-DIST'] },
                { internalId: 'sysfn-fcs-4', traceIds: ['SF-PITCH','SF-ROLL','SF-YAW'], funcId: 'FCS-COMP', funcName: 'Flight Control Computation', funcDef: 'Compute surface commands from pilot and autopilot inputs. Reads attitude/airspeed/altitude from AVS-AHRS; receives electrical power from EPS-DIST (main bus + emergency bus failover).', subId: 'SSF-COMP', subName: 'FBW Computation', subDef: 'Dual-redundant flight control law execution.', dependsOn: ['EPS-DIST','AVS-AHRS'] }
            ],
            fcim: [
                { internalId: 'fcim-fcs-1', subId: 'SSF-ELEV', awareness: 'Surface position feedback; stick force',  tlId: 'TL-ELEV', tlDesc: 'Elevator jam', plId: 'PL-ELEV', plDesc: 'Reduced elevator rate', mId: 'M-ELEV', mDesc: 'Uncommanded elevator deflection' },
                { internalId: 'fcim-fcs-2', subId: 'SSF-AIL',  awareness: 'Roll attitude rate vs. wheel input',      tlId: 'TL-AIL',  tlDesc: 'Aileron jam',  plId: 'PL-AIL',  plDesc: 'Reduced aileron authority', mId: 'M-AIL',  mDesc: 'Hardover aileron command' },
                { internalId: 'fcim-fcs-3', subId: 'SSF-RUD',  awareness: 'Pedal feel; yaw rate gyro',               tlId: 'TL-RUD',  tlDesc: 'Rudder jam',   plId: 'PL-RUD',  plDesc: 'Reduced rudder authority',  mId: 'M-RUD',  mDesc: 'Hardover rudder command' },
                { internalId: 'fcim-fcs-4', subId: 'SSF-COMP', awareness: 'CAS messages; reversion annunciation',    tlId: 'TL-COMP', tlDesc: 'Loss of both FCC channels', plId: 'PL-COMP', plDesc: 'Loss of one FCC channel', mId: 'M-COMP', mDesc: 'Erroneous control law output (no flag)' }
            ],
            extractedFCs: ['FC-ELEV-JAM','FC-AIL-JAM','FC-RUD-JAM','FC-FCC-LOSS'],
            fha: [
                { internalId: 'sfha-fcs-1', acTraces: [FHA_PITCH],  subIds: ['SSF-ELEV'], fcId: 'FC-ELEV-JAM', fcDesc: 'Both elevator actuators jammed',  phases: 'All', severity: 'Catastrophic', assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: 'Decomposed from AC pitch hazard.' },
                { internalId: 'sfha-fcs-2', acTraces: [FHA_ROLL],   subIds: ['SSF-AIL'],  fcId: 'FC-AIL-JAM',  fcDesc: 'Aileron actuator jammed',          phases: 'All', severity: 'Hazardous',    assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' },
                { internalId: 'sfha-fcs-3', acTraces: [FHA_YAW],    subIds: ['SSF-RUD'],  fcId: 'FC-RUD-JAM',  fcDesc: 'Rudder actuator jammed',           phases: 'Takeoff, Landing', severity: 'Hazardous', assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' },
                { internalId: 'sfha-fcs-4', acTraces: [FHA_PITCH,FHA_ROLL,FHA_YAW], subIds: ['SSF-COMP'], fcId: 'FC-FCC-LOSS', fcDesc: 'Loss of both FCC channels', phases: 'All', severity: 'Catastrophic', assumptionIds: ['ASM-FCS-1'], effAc: '', effCrew: '', effPax: '', comments: 'Common-mode FCC hazard.' }
            ],
            req: [], asm: [
                { asmId: 'ASM-FCS-1', origin: 'System design', text: 'FCC channels A and B are developed by independent design teams using diverse coding standards.', state: 'Open', valStrategy: 'Independence review per ARP 4754A §5.4.3', valArtifact: '', verArtifact: '', linkedFunctions: ['sysfn-fcs-4'] }
            ]
        },
        // ---- 2. EPS — Electrical Power System ----
        // EPS is the spine — most other systems trace UP to here. Itself depends on PROP for engine-driven generation.
        {
            id: 'sys-eps', name: 'Electrical Power System', asmCounter: 1,
            functions: [
                { internalId: 'sysfn-eps-1', traceIds: ['SF-GEN'],  funcId: 'EPS-GEN',   funcName: 'Power Generation',     funcDef: 'Generate regulated 28 VDC from engine-driven generators. Requires engine rotation from PROP-ENG (left + right).', subId: 'SSF-GEN',   subName: 'AC/DC Generation', subDef: 'Two engine-driven gens + ground power.', dependsOn: ['PROP-ENG'] },
                { internalId: 'sysfn-eps-2', traceIds: ['SF-GEN'],  funcId: 'EPS-BATT',  funcName: 'Energy Storage',       funcDef: 'Store emergency electrical energy. Independent of engine-driven sources.',                              subId: 'SSF-BATT',  subName: 'Battery Storage',  subDef: 'Two 24 V lead-acid batteries on emergency bus.', dependsOn: [] },
                { internalId: 'sysfn-eps-3', traceIds: ['SF-DIST'], funcId: 'EPS-DIST',  funcName: 'Power Distribution',   funcDef: 'Distribute power via main and emergency buses with tie logic. Loads: FCS-COMP, FCS-ELEV/AIL/RUD command power, AVS-PFD, AVS-AHRS, AVS-NAV, PROP-FADEC, PROP-FUEL, LGS-EXT, LGS-HYD pump.', subId: 'SSF-DIST',  subName: 'Bus Distribution', subDef: 'Main bus + Emergency bus with bus tie.', dependsOn: ['EPS-GEN','EPS-BATT'] }
            ],
            fcim: [
                { internalId: 'fcim-eps-1', subId: 'SSF-GEN',  awareness: 'Bus voltage; gen-fail CAS',  tlId: 'TL-GEN-S',  tlDesc: 'Both generators lost', plId: 'PL-GEN-S',  plDesc: 'Single generator lost',           mId: 'M-GEN-S',  mDesc: 'Voltage out of regulation' },
                { internalId: 'fcim-eps-2', subId: 'SSF-BATT', awareness: 'Battery amp meter; capacity', tlId: 'TL-BATT',   tlDesc: 'Both batteries failed', plId: 'PL-BATT',  plDesc: 'Reduced battery capacity',         mId: 'M-BATT',   mDesc: 'False capacity indication' },
                { internalId: 'fcim-eps-3', subId: 'SSF-DIST', awareness: 'Equipment loss pattern; bus annunciator', tlId: 'TL-DIST-S', tlDesc: 'Loss of both buses', plId: 'PL-DIST-S', plDesc: 'Loss of single bus / loads',  mId: 'M-DIST-S', mDesc: 'Cross-bus fault' }
            ],
            extractedFCs: ['FC-EPS-MAINBUS','FC-EPS-EMRGBUS','FC-EPS-CROSSFAULT'],
            fha: [
                { internalId: 'sfha-eps-1', acTraces: [FHA_ELEC], subIds: ['SSF-DIST'], fcId: 'FC-EPS-MAINBUS', fcDesc: 'Loss of main bus electrical power',      phases: 'All', severity: 'Hazardous', assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' },
                { internalId: 'sfha-eps-2', acTraces: [FHA_ELEC], subIds: ['SSF-DIST'], fcId: 'FC-EPS-EMRGBUS', fcDesc: 'Loss of emergency bus electrical power', phases: 'All', severity: 'Major',     assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' }
            ],
            req: [], asm: []
        },
        // ---- 3. AVS — Avionics & Displays ----
        {
            id: 'sys-avs', name: 'Avionics & Displays', asmCounter: 1,
            functions: [
                { internalId: 'sysfn-avs-1', traceIds: ['SF-PFD'], funcId: 'AVS-PFD',    funcName: 'Primary Flight Display', funcDef: 'Render attitude, airspeed, altitude, heading to crew. Receives 28 VDC from EPS-DIST main bus; consumes attitude/air data from AVS-AHRS.',     subId: 'SSF-PFD',     subName: 'Display Rendering',  subDef: 'Dual PFD with comparator.', dependsOn: ['EPS-DIST','AVS-AHRS'] },
                { internalId: 'sysfn-avs-2', traceIds: ['SF-PFD'], funcId: 'AVS-AHRS',   funcName: 'Air Data & Inertial',    funcDef: 'Sense air data and inertial attitude for PFD/autopilot. Receives emergency-bus 28 VDC from EPS-DIST.',    subId: 'SSF-AHRS',    subName: 'ADAHRS',             subDef: 'Dual ADAHRS units.', dependsOn: ['EPS-DIST'] },
                { internalId: 'sysfn-avs-3', traceIds: ['SF-NAV'], funcId: 'AVS-NAV',    funcName: 'Navigation',             funcDef: 'Provide GPS/VHF-NAV position and guidance. Receives 28 VDC from EPS-DIST emergency bus.',                  subId: 'SSF-NAV-COMP', subName: 'Navigation Computation', subDef: 'GPS+nav radio fusion.', dependsOn: ['EPS-DIST'] }
            ],
            fcim: [
                { internalId: 'fcim-avs-1', subId: 'SSF-PFD',     awareness: 'Red-X; comparator flag', tlId: 'TL-PFD-S',  tlDesc: 'Both PFDs blank', plId: 'PL-PFD-S',  plDesc: 'Single PFD blank', mId: 'M-PFD-S',  mDesc: 'Misleading PFD (no flag)' },
                { internalId: 'fcim-avs-2', subId: 'SSF-AHRS',    awareness: 'Comparator; attitude X-flag', tlId: 'TL-AHRS', tlDesc: 'Both ADAHRS failed', plId: 'PL-AHRS', plDesc: 'One ADAHRS failed', mId: 'M-AHRS', mDesc: 'Misleading attitude data' },
                { internalId: 'fcim-avs-3', subId: 'SSF-NAV-COMP', awareness: 'GPS integrity flag; CDI', tlId: 'TL-NAV-S',  tlDesc: 'Loss of navigation', plId: 'PL-NAV-S',  plDesc: 'Degraded accuracy', mId: 'M-NAV-S',  mDesc: 'Hazardously misleading navigation' }
            ],
            extractedFCs: ['FC-AVS-PFD-BLANK','FC-AVS-AHRS-LOSS','FC-AVS-NAV-MISLEAD'],
            fha: [
                { internalId: 'sfha-avs-1', acTraces: [FHA_PFD], subIds: ['SSF-PFD'],     fcId: 'FC-AVS-PFD-BLANK',   fcDesc: 'Both PFDs lose information',                 phases: 'All', severity: 'Major',     assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' },
                { internalId: 'sfha-avs-2', acTraces: [FHA_NAV], subIds: ['SSF-NAV-COMP'], fcId: 'FC-AVS-NAV-MISLEAD', fcDesc: 'Hazardously misleading navigation guidance', phases: 'Cruise, Approach', severity: 'Hazardous', assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' }
            ],
            req: [], asm: []
        },
        // ---- 4. PROP — Propulsion System ----
        // Circular-ish: PROP-ENG drives EPS-GEN, but PROP-FADEC needs power from EPS-DIST.
        // Resolved by FADEC having an internal battery-backed ECU on engine start.
        {
            id: 'sys-prop', name: 'Propulsion System', asmCounter: 1,
            functions: [
                { internalId: 'sysfn-prop-1', traceIds: ['SF-THRUST'], funcId: 'PROP-ENG',   funcName: 'Engine Operation', funcDef: 'Operate twin turboprop engines. Requires fuel from PROP-FUEL and command schedule from PROP-FADEC.',           subId: 'SSF-ENG',   subName: 'Engine Module',   subDef: 'PT6-class turboprop, twin installation.', dependsOn: ['PROP-FUEL','PROP-FADEC'] },
                { internalId: 'sysfn-prop-2', traceIds: ['SF-THRUST'], funcId: 'PROP-FADEC', funcName: 'Engine Control',   funcDef: 'Provide full authority digital engine control. Receives 28 VDC from EPS-DIST emergency bus (FADEC has internal alternator for engine-running operation).', subId: 'SSF-FADEC', subName: 'FADEC',           subDef: 'Dual-channel FADEC per engine.', dependsOn: ['EPS-DIST'] },
                { internalId: 'sysfn-prop-3', traceIds: ['SF-FUEL'],   funcId: 'PROP-FUEL',  funcName: 'Fuel Delivery',    funcDef: 'Deliver fuel from tanks to engines. Boost pumps powered by EPS-DIST main bus.',         subId: 'SSF-FUEL-DEL', subName: 'Fuel Pumps', subDef: 'Primary + boost pump per engine feed.', dependsOn: ['EPS-DIST'] }
            ],
            fcim: [
                { internalId: 'fcim-prop-1', subId: 'SSF-ENG',     awareness: 'ITT/TQ; vibration', tlId: 'TL-ENG-S',  tlDesc: 'Both engines failed', plId: 'PL-ENG-S',  plDesc: 'Single engine failure', mId: 'M-ENG-S',  mDesc: 'Engine overspeed' },
                { internalId: 'fcim-prop-2', subId: 'SSF-FADEC',   awareness: 'FADEC fault annunciation', tlId: 'TL-FADEC', tlDesc: 'Both FADEC channels lost', plId: 'PL-FADEC', plDesc: 'Single FADEC channel lost', mId: 'M-FADEC', mDesc: 'Erroneous fuel schedule' },
                { internalId: 'fcim-prop-3', subId: 'SSF-FUEL-DEL', awareness: 'Fuel pressure low CAS', tlId: 'TL-FUEL-S', tlDesc: 'Total fuel delivery loss', plId: 'PL-FUEL-S', plDesc: 'Reduced fuel pressure', mId: 'M-FUEL-S', mDesc: 'Incorrect fuel flow indication' }
            ],
            extractedFCs: ['FC-PROP-DUAL-OUT','FC-PROP-FADEC-DUAL','FC-PROP-FUEL-LOSS'],
            fha: [
                { internalId: 'sfha-prop-1', acTraces: [FHA_THRUST], subIds: ['SSF-ENG'],   fcId: 'FC-PROP-DUAL-OUT',    fcDesc: 'Total loss of thrust (both engines)',     phases: 'All', severity: 'Catastrophic', assumptionIds: ['ASM-PROP-1'], effAc: '', effCrew: '', effPax: '', comments: 'Top of PROP tree.' },
                { internalId: 'sfha-prop-2', acTraces: [FHA_ASYM],   subIds: ['SSF-ENG'],   fcId: 'FC-PROP-SINGLE-OUT',  fcDesc: 'Single engine failure',                   phases: 'Takeoff, Initial Climb', severity: 'Hazardous', assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' },
                { internalId: 'sfha-prop-3', acTraces: [FHA_THRUST], subIds: ['SSF-FADEC'], fcId: 'FC-PROP-FADEC-DUAL', fcDesc: 'Loss of both FADEC channels (per engine)', phases: 'All', severity: 'Hazardous', assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' }
            ],
            req: [], asm: [
                { asmId: 'ASM-PROP-1', origin: 'Engine certification', text: 'Each engine is type-certified per Part 33 with declared dispatch reliability ≥ 99.95%.', state: 'Validated', valStrategy: 'Engine TC data sheet', valArtifact: 'PT6A TC data sheet rev 12', verArtifact: '', linkedFunctions: ['sysfn-prop-1'] }
            ]
        },
        // ---- 5. LGS — Landing Gear System ----
        // LGS-HYD also feeds the FCS surface actuators (shared hydraulic source).
        {
            id: 'sys-lgs', name: 'Landing Gear System', asmCounter: 1,
            functions: [
                { internalId: 'sysfn-lgs-1', traceIds: ['SF-LGS'], funcId: 'LGS-EXT', funcName: 'Gear Extension/Retraction', funcDef: 'Extend and retract landing gear on command. Requires hydraulic pressure from LGS-HYD and 28 VDC selector valve power from EPS-DIST.', subId: 'SSF-EXT', subName: 'Extension Actuation', subDef: 'Hydraulic actuators with mechanical down-lock.', dependsOn: ['LGS-HYD','EPS-DIST'] },
                { internalId: 'sysfn-lgs-2', traceIds: ['SF-LGS'], funcId: 'LGS-HYD', funcName: 'Hydraulic Supply',          funcDef: 'Provide hydraulic pressure for gear actuation and (shared) flight control surface actuators. Requires engine rotation from PROP-ENG (engine-driven pump).', subId: 'SSF-HYD', subName: 'Hydraulic Pump',     subDef: 'Engine-driven hydraulic pump + accumulator.', dependsOn: ['PROP-ENG'] }
            ],
            fcim: [
                { internalId: 'fcim-lgs-1', subId: 'SSF-EXT', awareness: 'Gear position lights; horn',     tlId: 'TL-EXT', tlDesc: 'All three legs fail to extend', plId: 'PL-EXT', plDesc: 'One leg fails to extend', mId: 'M-EXT', mDesc: 'False down-and-locked indication' },
                { internalId: 'fcim-lgs-2', subId: 'SSF-HYD', awareness: 'Hyd pressure gauge; pump amber', tlId: 'TL-HYD', tlDesc: 'Total loss of hydraulic pressure', plId: 'PL-HYD', plDesc: 'Reduced hydraulic pressure', mId: 'M-HYD', mDesc: 'Incorrect pressure indication' }
            ],
            extractedFCs: ['FC-LGS-NOEXT','FC-LGS-HYD-LOSS'],
            fha: [
                { internalId: 'sfha-lgs-1', acTraces: [FHA_LDG_EXT], subIds: ['SSF-EXT'], fcId: 'FC-LGS-NOEXT',    fcDesc: 'Failure to extend any landing gear leg', phases: 'Approach, Landing', severity: 'Major',     assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' },
                { internalId: 'sfha-lgs-2', acTraces: [FHA_LDG_COL], subIds: ['SSF-HYD'], fcId: 'FC-LGS-HYD-LOSS', fcDesc: 'Loss of hydraulic supply',               phases: 'All',               severity: 'Hazardous', assumptionIds: [], effAc: '', effCrew: '', effPax: '', comments: '' }
            ],
            req: [], asm: []
        }
    ];

    // ============================================================================
    // ZSA — Zonal Safety Analysis
    // ----------------------------------------------------------------------------
    // housedFunctions[] references AC sub-function subIds (e.g., 'SF-PFD') —
    // drives the AutoReq ZSA generator + the PRA→ZSA exposed-functions join.
    // ============================================================================
    const zsaData = [
        { internalId: 'zsa-1', zsaId: 'Z-ENG-NACELLE', zoneId: 'Z-ENG-NACELLE', zoneName: 'Engine Nacelle (L+R)',   desc: 'Engine nacelle and firewall — FS 80 to FS 130 (both wings).',  equip: 'Engine, FADEC, fuel/oil lines, fire detection',     severity: 'Hazardous', housedFunctions: ['SF-THRUST','SF-FUEL'],                    interference: 'Fuel line leak could reach hot section; FADEC harness near vibration source.', interferences: 'Fuel line leak could reach hot section; FADEC harness near vibration source.', mitigation: 'Fire-resistant fuel lines; FADEC harness routed away from vibration nodes; firewall seal integrity per ICA.', comments: '' },
        { internalId: 'zsa-2', zsaId: 'Z-AVIONICS-BAY', zoneId: 'Z-AVIONICS-BAY', zoneName: 'Forward Avionics Bay', desc: 'Forward avionics bay — FS 60 to FS 80, below cockpit floor.', equip: 'PFDs, ADAHRS, GPS receivers, COMM/NAV radios',      severity: 'Major',     housedFunctions: ['SF-PFD','SF-NAV'],                        interference: 'High heat load from radios could affect ADAHRS thermal stability.',                  interferences: 'High heat load from radios could affect ADAHRS thermal stability.', mitigation: 'Forced air cooling; thermal isolation between radio stack and ADAHRS shelf.', comments: '' },
        { internalId: 'zsa-3', zsaId: 'Z-BATTERY-BAY', zoneId: 'Z-BATTERY-BAY', zoneName: 'Battery Compartment',    desc: 'Battery compartment — FS 200, below aft cabin floor.',         equip: 'Main battery, emergency battery, battery monitor',  severity: 'Hazardous', housedFunctions: ['SF-GEN','SF-DIST'],                       interference: 'Cell venting could affect adjacent cabin floor structure and adjacent wire bundle.', interferences: 'Cell venting could affect adjacent cabin floor structure and adjacent wire bundle.', mitigation: 'Sealed bay with overboard vent; thermal sensor with CAS alert; wire bundle armored conduit.', comments: '' },
        { internalId: 'zsa-4', zsaId: 'Z-CABIN-FLOOR', zoneId: 'Z-CABIN-FLOOR', zoneName: 'Cabin Underfloor',        desc: 'Cabin underfloor wire run — FS 100 to FS 250.',                equip: 'Main bus feeders, FCS signal harness, ECS ducts',   severity: 'Major',     housedFunctions: ['SF-PITCH','SF-ROLL','SF-YAW','SF-DIST'],   interference: 'ECS duct condensation could drip onto wire bundles.',                                 interferences: 'ECS duct condensation could drip onto wire bundles.', mitigation: 'Drip shields; bundle routing above ECS ducts; lacing per SAE AS50881.', comments: '' },
        { internalId: 'zsa-5', zsaId: 'Z-TAILCONE',    zoneId: 'Z-TAILCONE',    zoneName: 'Empennage Tailcone',     desc: 'Empennage tailcone — FS 400 to tail.',                          equip: 'Elevator/rudder actuators, trim actuators, ELT', severity: 'Hazardous', housedFunctions: ['SF-PITCH','SF-YAW'],                       interference: 'Elevator actuator hydraulic leak could affect rudder actuator (co-located).',         interferences: 'Elevator actuator hydraulic leak could affect rudder actuator (co-located).', mitigation: 'Separation per SAE ARP4761 §A.3; hydraulic leak detection sensors.', comments: '' }
    ];

    // ============================================================================
    // PRA — Particular Risk Analysis
    // ----------------------------------------------------------------------------
    // riskType uses the canonical enum (matches the PRA form dropdown).
    // affectedZones[] references the ZSA zoneIds above — the join key EVERY
    // consumer uses (_exposedFunctionsForZones, praDynamicModel, the sweep).
    // 8 Aug 2026 (SL-ARC-0001 §20 D1): the seed previously wrote internalIds
    // here, so the join silently returned [] and the retention check reported
    // "no Catastrophic consequence" — a silent false negative. exposedFunctions[]
    // is the derived join result, captured explicitly so the table renders
    // without recomputing it; it must stay consistent with the join.
    // ============================================================================
    const praData = [
        { internalId: 'pra-1', praId: 'PRA-BIRD',      riskType: 'Bird Strike', threat: 'Bird Strike',                description: 'Engine ingestion or windshield impact during low-altitude operations (≤ 3000 ft AGL).', desc: 'Engine ingestion or windshield impact during low-altitude operations (≤ 3000 ft AGL).', systems: 'Propulsion, Windshield, Airframe', csfl: 'Thrust loss, crew visibility loss',          affectedZones: ['Z-ENG-NACELLE'],          exposedFunctions: ['SF-THRUST','SF-FUEL'],                                        mitigation: 'Twin-engine redundancy; bird-strike certified windshield; pilot procedure for bird-prone aerodromes.', comments: '' },
        { internalId: 'pra-2', praId: 'PRA-LIGHTNING', riskType: 'Lightning',   threat: 'Lightning Strike',           description: 'Direct or swept lightning attachment to airframe during convective weather.',           desc: 'Direct or swept lightning attachment to airframe during convective weather.',           systems: 'Avionics, EPS, Airframe',          csfl: 'Avionics upset, electrical transient',       affectedZones: ['Z-AVIONICS-BAY','Z-BATTERY-BAY'],  exposedFunctions: ['SF-PFD','SF-NAV','SF-GEN','SF-DIST'],                         mitigation: 'Lightning protection per DO-160G §22/23; bonding paths verified; transient suppression on EPS.', comments: '' },
        { internalId: 'pra-3', praId: 'PRA-ICE',       riskType: 'Ice',         threat: 'Ice Ingestion / Accretion', description: 'Airframe and engine inlet ice in icing conditions.',                                   desc: 'Airframe and engine inlet ice in icing conditions.',                                   systems: 'Propulsion, Airframe, Pitot',      csfl: 'Engine flameout, lift loss, airspeed error', affectedZones: ['Z-ENG-NACELLE'],          exposedFunctions: ['SF-THRUST','SF-FUEL'],                                        mitigation: 'Engine inlet anti-ice; pitot heat; airframe de-ice boots; AFM icing procedures.', comments: '' },
        { internalId: 'pra-4', praId: 'PRA-DEBRIS',    riskType: 'Tire Burst',  threat: 'Runway Debris (FOD)',        description: 'Foreign object damage during takeoff or landing rollout.',                              desc: 'Foreign object damage during takeoff or landing rollout.',                              systems: 'Propulsion, Tires, Hydraulics',    csfl: 'Engine damage, tire burst, hyd line damage', affectedZones: ['Z-ENG-NACELLE','Z-CABIN-FLOOR'],  exposedFunctions: ['SF-THRUST','SF-FUEL','SF-PITCH','SF-ROLL','SF-YAW','SF-DIST'],                              mitigation: 'High wing layout (engine clearance); tire pressure monitoring; pre-flight runway inspection.', comments: '' },
        { internalId: 'pra-5', praId: 'PRA-TBATT',     riskType: 'Cabin Fire',  threat: 'Lithium Battery Thermal Runaway', description: 'Avionics lithium battery cell venting causing fire / smoke in battery bay.', desc: 'Avionics lithium battery cell venting causing fire / smoke in battery bay.',          systems: 'EPS, Cabin',                       csfl: 'Smoke in cabin, loss of standby power',      affectedZones: ['Z-BATTERY-BAY'],          exposedFunctions: ['SF-GEN','SF-DIST'],                                          mitigation: 'Sealed battery bay; thermal sensor + CAS alert; battery cells per RTCA DO-311A.', comments: '' }
    ];

    // ============================================================================
    // FMEA — sample piece-part FMEA rows
    // ============================================================================
    const fmeaData = [
        { internalId: 'fmea-1',  fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-fcs',  fmeaId: 'FME-001', part: 'Elevator Actuator A', mode: 'Hydraulic supply loss', rate: 1e-5, time: 1, prob: 1e-5, localEffect: 'Loss of elevator actuator authority',  severity: 'Major' },
        { internalId: 'fmea-2',  fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-fcs',  fmeaId: 'FME-002', part: 'Elevator Actuator B', mode: 'Hydraulic supply loss', rate: 1e-5, time: 1, prob: 1e-5, localEffect: 'Loss of elevator actuator authority',  severity: 'Major' },
        { internalId: 'fmea-3',  fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-fcs',  fmeaId: 'FME-003', part: 'FCC A',               mode: 'Software unavailability', rate: 3e-6, time: 1, prob: 3e-6, localEffect: 'Loss of FCC channel A',              severity: 'Major' },
        { internalId: 'fmea-4',  fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-fcs',  fmeaId: 'FME-004', part: 'FCC B',               mode: 'Software unavailability', rate: 3e-6, time: 1, prob: 3e-6, localEffect: 'Loss of FCC channel B',              severity: 'Major' },
        { internalId: 'fmea-5',  fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-eps',  fmeaId: 'FME-005', part: 'Main Generator',      mode: 'Bearing failure',          rate: 8e-6, time: 1, prob: 8e-6, localEffect: 'Loss of main bus generation',         severity: 'Hazardous' },
        { internalId: 'fmea-6',  fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-eps',  fmeaId: 'FME-006', part: 'Aux Generator',       mode: 'Field winding fault',      rate: 8e-6, time: 1, prob: 8e-6, localEffect: 'Loss of emergency bus generation',    severity: 'Hazardous' },
        { internalId: 'fmea-7',  fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-eps',  fmeaId: 'FME-007', part: 'Battery 1',           mode: 'Cell venting',             rate: 5e-7, time: 1, prob: 5e-7, localEffect: 'Loss of battery 1 capacity',          severity: 'Hazardous' },
        { internalId: 'fmea-8',  fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-avs',  fmeaId: 'FME-008', part: 'PFD Pilot',           mode: 'Display failure',          rate: 2e-5, time: 1, prob: 2e-5, localEffect: 'Loss of pilot PFD',                   severity: 'Major' },
        { internalId: 'fmea-9',  fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-prop', fmeaId: 'FME-009', part: 'Left FADEC',          mode: 'Channel A+B simultaneous', rate: 1e-7, time: 1, prob: 1e-7, localEffect: 'Loss of L-engine control',            severity: 'Hazardous' },
        { internalId: 'fmea-10', fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-fcs',  fmeaId: 'FME-010', part: 'Hydraulic Pump',      mode: 'Seizure',                  rate: 6e-6, time: 1, prob: 6e-6, localEffect: 'Loss of hydraulic pressure',          severity: 'Major' }
    ];

    // CMA is declared after the FTA trees are built (need real gate IDs).

    // ============================================================================
    // ITEMS / LRUs — multiple per system, no DAL assigned (user can play)
    // ============================================================================
    const itemsData = [
        // FCS LRUs
        { internalId: 'itm-1',  itemId: 'ITM-FCS-001', name: 'Elevator Actuator A',  type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-fcs',  description: 'Tandem hydraulic elevator actuator, left.',  realizedByCSCI: '', realizedByHWCI: 'HWCI-ELV-A',  traceIds: [], comments: [], history: [] },
        { internalId: 'itm-2',  itemId: 'ITM-FCS-002', name: 'Elevator Actuator B',  type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-fcs',  description: 'Tandem hydraulic elevator actuator, right.', realizedByCSCI: '', realizedByHWCI: 'HWCI-ELV-B',  traceIds: [], comments: [], history: [] },
        { internalId: 'itm-3',  itemId: 'ITM-FCS-003', name: 'Aileron Actuator L',   type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-fcs',  description: 'Left aileron actuator.',                     realizedByCSCI: '', realizedByHWCI: 'HWCI-AIL-L',  traceIds: [], comments: [], history: [] },
        { internalId: 'itm-4',  itemId: 'ITM-FCS-004', name: 'Aileron Actuator R',   type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-fcs',  description: 'Right aileron actuator.',                    realizedByCSCI: '', realizedByHWCI: 'HWCI-AIL-R',  traceIds: [], comments: [], history: [] },
        { internalId: 'itm-5',  itemId: 'ITM-FCS-005', name: 'Rudder Actuator',      type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-fcs',  description: 'Single rudder actuator.',                    realizedByCSCI: '', realizedByHWCI: 'HWCI-RUD',    traceIds: [], comments: [], history: [] },
        { internalId: 'itm-6',  itemId: 'ITM-FCS-006', name: 'FCC A',                type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-fcs',  description: 'Flight Control Computer, channel A.',        realizedByCSCI: 'CSCI-FCC-A', realizedByHWCI: 'HWCI-FCC-A', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-7',  itemId: 'ITM-FCS-007', name: 'FCC B',                type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-fcs',  description: 'Flight Control Computer, channel B.',        realizedByCSCI: 'CSCI-FCC-B', realizedByHWCI: 'HWCI-FCC-B', traceIds: [], comments: [], history: [] },
        // EPS LRUs
        { internalId: 'itm-8',  itemId: 'ITM-EPS-001', name: 'Main Generator',       type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-eps',  description: 'Engine-driven 28 VDC main generator.',       realizedByCSCI: '', realizedByHWCI: 'HWCI-GEN-M', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-9',  itemId: 'ITM-EPS-002', name: 'Aux Generator',        type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-eps',  description: 'Engine-driven 28 VDC aux generator.',        realizedByCSCI: '', realizedByHWCI: 'HWCI-GEN-A', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-10', itemId: 'ITM-EPS-003', name: 'Battery 1',            type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-eps',  description: '24 V lead-acid main battery.',               realizedByCSCI: '', realizedByHWCI: 'HWCI-BATT-1', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-11', itemId: 'ITM-EPS-004', name: 'Battery 2',            type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-eps',  description: '24 V lead-acid emergency battery.',          realizedByCSCI: '', realizedByHWCI: 'HWCI-BATT-2', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-12', itemId: 'ITM-EPS-005', name: 'Main Bus',             type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-eps',  description: 'Main 28 VDC distribution bus.',               realizedByCSCI: '', realizedByHWCI: 'HWCI-BUS-M',  traceIds: [], comments: [], history: [] },
        { internalId: 'itm-13', itemId: 'ITM-EPS-006', name: 'Emergency Bus',        type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-eps',  description: 'Emergency 28 VDC distribution bus.',          realizedByCSCI: '', realizedByHWCI: 'HWCI-BUS-E',  traceIds: [], comments: [], history: [] },
        // AVS LRUs
        { internalId: 'itm-14', itemId: 'ITM-AVS-001', name: 'PFD Pilot',            type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-avs',  description: 'Pilot Primary Flight Display.',               realizedByCSCI: 'CSCI-PFD-P', realizedByHWCI: 'HWCI-PFD-P', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-15', itemId: 'ITM-AVS-002', name: 'PFD Co-Pilot',         type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-avs',  description: 'Co-pilot Primary Flight Display.',            realizedByCSCI: 'CSCI-PFD-C', realizedByHWCI: 'HWCI-PFD-C', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-16', itemId: 'ITM-AVS-003', name: 'ADAHRS 1',             type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-avs',  description: 'Air Data and Attitude/Heading Reference System.', realizedByCSCI: 'CSCI-ADAHRS-1', realizedByHWCI: 'HWCI-ADAHRS-1', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-17', itemId: 'ITM-AVS-004', name: 'ADAHRS 2',             type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-avs',  description: 'Air Data and Attitude/Heading Reference System.', realizedByCSCI: 'CSCI-ADAHRS-2', realizedByHWCI: 'HWCI-ADAHRS-2', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-18', itemId: 'ITM-AVS-005', name: 'GPS Receiver',         type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-avs',  description: 'TSO-C146 GPS receiver.',                       realizedByCSCI: '', realizedByHWCI: 'HWCI-GPS', traceIds: [], comments: [], history: [] },
        // PROP LRUs
        { internalId: 'itm-19', itemId: 'ITM-PRP-001', name: 'Engine Left',          type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-prop', description: 'Left turboprop engine.',                       realizedByCSCI: '', realizedByHWCI: 'HWCI-ENG-L',   traceIds: [], comments: [], history: [] },
        { internalId: 'itm-20', itemId: 'ITM-PRP-002', name: 'Engine Right',         type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-prop', description: 'Right turboprop engine.',                      realizedByCSCI: '', realizedByHWCI: 'HWCI-ENG-R',   traceIds: [], comments: [], history: [] },
        { internalId: 'itm-21', itemId: 'ITM-PRP-003', name: 'FADEC Left',           type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-prop', description: 'Dual-channel FADEC, left engine.',             realizedByCSCI: 'CSCI-FADEC-L', realizedByHWCI: 'HWCI-FADEC-L', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-22', itemId: 'ITM-PRP-004', name: 'FADEC Right',          type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-prop', description: 'Dual-channel FADEC, right engine.',            realizedByCSCI: 'CSCI-FADEC-R', realizedByHWCI: 'HWCI-FADEC-R', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-23', itemId: 'ITM-PRP-005', name: 'Fuel Pump Left',       type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-prop', description: 'Left engine boost pump.',                       realizedByCSCI: '', realizedByHWCI: 'HWCI-FP-L', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-24', itemId: 'ITM-PRP-006', name: 'Fuel Pump Right',      type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-prop', description: 'Right engine boost pump.',                      realizedByCSCI: '', realizedByHWCI: 'HWCI-FP-R', traceIds: [], comments: [], history: [] },
        // LGS LRUs
        { internalId: 'itm-25', itemId: 'ITM-LGS-001', name: 'MLG Actuator Left',    type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-lgs',  description: 'Main landing gear actuator, left.',            realizedByCSCI: '', realizedByHWCI: 'HWCI-MLG-L', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-26', itemId: 'ITM-LGS-002', name: 'MLG Actuator Right',   type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-lgs',  description: 'Main landing gear actuator, right.',           realizedByCSCI: '', realizedByHWCI: 'HWCI-MLG-R', traceIds: [], comments: [], history: [] },
        { internalId: 'itm-27', itemId: 'ITM-LGS-003', name: 'NLG Actuator',         type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-lgs',  description: 'Nose landing gear actuator.',                  realizedByCSCI: '', realizedByHWCI: 'HWCI-NLG',   traceIds: [], comments: [], history: [] },
        { internalId: 'itm-28', itemId: 'ITM-LGS-004', name: 'Hydraulic Pump',       type: 'LRU', dal: '', daType: 'IDAL', owningSystemId: 'sys-lgs',  description: 'Engine-driven hydraulic pump (gear + brakes).', realizedByCSCI: '', realizedByHWCI: 'HWCI-HYD-P', traceIds: [], comments: [], history: [] }
    ];

    // ============================================================================
    // FTA PAGES — aircraft top-level trees + system-level transfer trees
    // ============================================================================
    // Build leaves first, then gates, then seal and assign display IDs.

    // --- FCS pitch system tree (PAGE_FCS_PITCH) ---
    const fcsPitchBeElA   = be('Elevator Actuator A', 1e-5, { ccfGroup: 'ELEV-ACT', beta: 0.05 });
    const fcsPitchBeElB   = be('Elevator Actuator B', 1e-5, { ccfGroup: 'ELEV-ACT', beta: 0.05 });
    const fcsPitchBeFccA  = be('FCC A', 3e-6, { ccfGroup: 'FCC', beta: 0.1 });
    const fcsPitchBeFccB  = be('FCC B', 3e-6, { ccfGroup: 'FCC', beta: 0.1 });
    const fcsPitchBeLink  = be('Mechanical linkage jam', 5e-7);
    const fcsPitchGAct    = gate('AND', 'Both elevator actuators failed', [fcsPitchBeElA, fcsPitchBeElB]);
    const fcsPitchGFcc    = gate('AND', 'Both FCC channels failed',       [fcsPitchBeFccA, fcsPitchBeFccB]);
    const fcsPitchRoot    = gate('OR', 'Loss of FCS pitch control authority', [fcsPitchGAct, fcsPitchGFcc, fcsPitchBeLink]);
    setDisplayIds(fcsPitchRoot, 'FCS-PIT'); seal(fcsPitchRoot);

    // --- EPS power-to-FCS tree (PAGE_EPS_FCS) ---
    const epsBeMainGen  = be('Main Generator failure', 8e-6);
    const epsBeMainBus  = be('Main Bus short / fault', 1e-6);
    const epsBeAuxGen   = be('Aux Generator failure', 8e-6);
    const epsBeBatt1    = be('Battery 1 failure', 5e-7);
    const epsBeBatt2    = be('Battery 2 failure', 5e-7);
    const epsGMainBus   = gate('OR', 'Main bus failure', [epsBeMainGen, epsBeMainBus]);
    const epsGEmrgBus   = gate('OR', 'Emergency bus failure', [epsBeAuxGen, epsBeBatt1, epsBeBatt2]);
    const epsRoot       = gate('AND', 'Loss of FCS electrical power', [epsGMainBus, epsGEmrgBus]);
    setDisplayIds(epsRoot, 'EPS-FCS'); seal(epsRoot);

    // --- PROP total thrust loss tree (PAGE_PROP_THRUST) ---
    const propBeEngLMech  = be('Engine L mechanical failure', 1e-5);
    const propBeFadecL    = be('FADEC L dual-channel loss', 1e-7);
    const propBeFuelPumpL = be('Fuel Pump L failure', 6e-6);
    const propBeEngRMech  = be('Engine R mechanical failure', 1e-5);
    const propBeFadecR    = be('FADEC R dual-channel loss', 1e-7);
    const propBeFuelPumpR = be('Fuel Pump R failure', 6e-6);
    const propGEngL = gate('OR', 'Left engine failure',  [propBeEngLMech, propBeFadecL, propBeFuelPumpL]);
    const propGEngR = gate('OR', 'Right engine failure', [propBeEngRMech, propBeFadecR, propBeFuelPumpR]);
    const propRoot  = gate('AND', 'Total loss of thrust', [propGEngL, propGEngR]);
    setDisplayIds(propRoot, 'PROP-T'); seal(propRoot);

    // --- AVS PFD loss tree (PAGE_AVS_PFD) ---
    const avsBePfdP   = be('PFD Pilot failure', 2e-5);
    const avsBePfdC   = be('PFD Co-pilot failure', 2e-5);
    const avsBeAhrs1  = be('ADAHRS 1 failure', 1e-5, { ccfGroup: 'ADAHRS', beta: 0.08 });
    const avsBeAhrs2  = be('ADAHRS 2 failure', 1e-5, { ccfGroup: 'ADAHRS', beta: 0.08 });
    const avsGAhrs    = gate('AND', 'Both ADAHRS lost', [avsBeAhrs1, avsBeAhrs2]);
    const avsGPfdHw   = gate('AND', 'Both PFD displays failed (hardware)', [avsBePfdP, avsBePfdC]);
    const avsRoot     = gate('OR', 'Loss of primary flight display info', [avsGPfdHw, avsGAhrs]);
    setDisplayIds(avsRoot, 'AVS-PFD'); seal(avsRoot);

    // --- LGS extension failure tree (PAGE_LGS_EXT) ---
    const lgsBeMlgL = be('MLG L fails to extend', 1e-5);
    const lgsBeMlgR = be('MLG R fails to extend', 1e-5);
    const lgsBeNlg  = be('NLG fails to extend', 1e-5);
    const lgsBeHyd  = be('Hydraulic pump failure', 6e-6);
    const lgsRoot   = gate('OR', 'Landing gear extension failure', [lgsBeMlgL, lgsBeMlgR, lgsBeNlg, lgsBeHyd]);
    setDisplayIds(lgsRoot, 'LGS-E'); seal(lgsRoot);

    // --- AC pitch tree (PAGE_AC_PITCH) — transfers down to FCS + EPS ---
    const acPitchXferFcs = xfer(PAGE_FCS_PITCH, 'FCS pitch authority loss', 'AC-P-T1');
    const acPitchXferEps = xfer(PAGE_EPS_FCS,   'EPS power loss to FCS',    'AC-P-T2');
    const acPitchRoot = gate('OR', 'Loss of pitch control authority', [acPitchXferFcs, acPitchXferEps], { displayId: 'TOP-AC-P' });
    seal(acPitchRoot);

    // --- AC thrust tree (PAGE_AC_THRUST) — transfers to PROP ---
    const acThrustXferProp = xfer(PAGE_PROP_THRUST, 'Total loss of thrust', 'AC-T-T1');
    const acThrustRoot = gate('OR', 'Total loss of thrust', [acThrustXferProp], { displayId: 'TOP-AC-T' });
    seal(acThrustRoot);

    // --- AC landing tree (PAGE_AC_LDG) — transfers to LGS ---
    const acLdgXferLgs = xfer(PAGE_LGS_EXT, 'Landing gear extension failure', 'AC-L-T1');
    const acLdgRoot = gate('OR', 'Landing gear failure to extend', [acLdgXferLgs], { displayId: 'TOP-AC-L' });
    seal(acLdgRoot);

    // Build ftaPages array.
    const ftaPages = [
        { id: PAGE_AC_PITCH,    name: 'AC — Loss of Pitch Control',         root: acPitchRoot,    treeLevel: 'aircraft', linkedFhaIds: [FHA_PITCH],  targetP: 1e-9 },
        { id: PAGE_AC_THRUST,   name: 'AC — Total Loss of Thrust',          root: acThrustRoot,   treeLevel: 'aircraft', linkedFhaIds: [FHA_THRUST], targetP: 1e-9 },
        { id: PAGE_AC_LDG,      name: 'AC — Landing Gear Extension',        root: acLdgRoot,      treeLevel: 'aircraft', linkedFhaIds: [FHA_LDG_EXT], targetP: 1e-5 },
        { id: PAGE_FCS_PITCH,   name: 'FCS — Pitch Control Loss',           root: fcsPitchRoot,   treeLevel: 'system', systemId: 'sys-fcs',  linkedFhaIds: ['sfha-fcs-1'] },
        { id: PAGE_EPS_FCS,     name: 'EPS — Power Loss to FCS',            root: epsRoot,        treeLevel: 'system', systemId: 'sys-eps',  linkedFhaIds: ['sfha-eps-1'] },
        { id: PAGE_PROP_THRUST, name: 'PROP — Total Thrust Loss',           root: propRoot,       treeLevel: 'system', systemId: 'sys-prop', linkedFhaIds: ['sfha-prop-1'] },
        { id: PAGE_AVS_PFD,     name: 'AVS — Loss of PFD Information',      root: avsRoot,        treeLevel: 'system', systemId: 'sys-avs',  linkedFhaIds: ['sfha-avs-1'] },
        { id: PAGE_LGS_EXT,     name: 'LGS — Gear Extension Failure',       root: lgsRoot,        treeLevel: 'system', systemId: 'sys-lgs',  linkedFhaIds: ['sfha-lgs-1'] }
    ];

    // ============================================================================
    // CMA — Common Mode Analysis
    // ----------------------------------------------------------------------------
    // linkedGateIds use the canonical "pageId:nodeId" format the AutoReq engine
    // and traceability index both consume. References point at real AND-family
    // gates in the trees above so the independence-compromise check fires.
    // ============================================================================
    const _gid = (pageId, n) => pageId + ':' + n.id;
    const cmaData = [
        { internalId: 'cma-1', cmaId: 'CMA-FCC',  description: 'FCC A and FCC B independence claim — both channels execute the same control law compiled by separate teams with diverse toolchains, but the source library version is shared.', sharedResource: 'Control-law source library v3.2', linkedGateIds: [_gid(PAGE_FCS_PITCH, fcsPitchGFcc)], linkedGates: [_gid(PAGE_FCS_PITCH, fcsPitchGFcc)], severity: 'Catastrophic', mitigation: 'Diverse compilers; independent V&V; staff isolation per ARP 4754A §5.4.3.', comments: '', scope: 'system', owningSystemIds: ['sys-fcs'], owningSystemId: 'sys-fcs' },
        { internalId: 'cma-2', cmaId: 'CMA-HYD',  description: 'Single hydraulic source (LGS-HYD) feeds both elevator actuators — defeats the AND-gate independence claim in the FCS pitch tree.',                                              sharedResource: 'LGS-HYD pump output',              linkedGateIds: [_gid(PAGE_FCS_PITCH, fcsPitchGAct)], linkedGates: [_gid(PAGE_FCS_PITCH, fcsPitchGAct)], severity: 'Hazardous',    mitigation: 'Add secondary hydraulic source for one actuator (design option pending).', comments: 'Currently open — drives cross-system requirement on LGS-HYD redundancy.', scope: 'system', owningSystemIds: ['sys-fcs'], owningSystemId: 'sys-fcs' },
        { internalId: 'cma-3', cmaId: 'CMA-AHRS', description: 'ADAHRS 1 and ADAHRS 2 share a common bus topology in the AVS-PFD tree — bus fault could affect both attitude channels simultaneously.',                                          sharedResource: 'AVS attitude bus harness',         linkedGateIds: [_gid(PAGE_AVS_PFD, avsGAhrs)],       linkedGates: [_gid(PAGE_AVS_PFD, avsGAhrs)],       severity: 'Major',        mitigation: 'Bus segmentation with diode isolation between ADAHRS feeds.', comments: '', scope: 'system', owningSystemIds: ['sys-avs'], owningSystemId: 'sys-avs' },
        { internalId: 'cma-4', cmaId: 'CMA-EPS-LOAD', description: 'FCS-COMP, AVS-PFD, AVS-AHRS, PROP-FADEC, and LGS selector valves all share the EPS-DIST main bus — loss of main bus defeats apparent redundancy across systems.',          sharedResource: 'EPS main bus',                     linkedGateIds: [],                                   linkedGates: [],                                   severity: 'Hazardous',    mitigation: 'Critical loads dual-fed (main + emergency bus); bus tie logic verified.', comments: 'Cross-system CMA — affects FCS / AVS / PROP / LGS.', scope: 'aircraft', owningSystemIds: [], owningSystemId: '' }
    ];

    // Routing runs (additive). Demo seeds empty — analyst adds zone-spanning paths in the Routing tab.
    const routingData = [];

    // Resources (additive). Demo seeds empty — analyst adds provided/consumed resources in the Resources tab.
    const resourcesData = [];

    // AI source documents (additive). Demo seeds empty — analyst uploads in the AI panels.
    const projectSourceDocs = [];

    // AI Assumptions ledger (additive). Demo seeds empty — assumptions are logged
    // automatically when the analyst runs an AI analysis.
    const aiAssumptions = [];

    return {
        projectName: 'uSTOL Demo — Part 23 Class III',
        acFunctionsData, acFcimData, acExtractedFCs, acFhaData,
        acReqData: [],
        acAssumptionsData, acAsmCounter: 4,
        systemsData, activeSystemId: null,
        praData, zsaData, cmaData, routingData, resourcesData, projectSourceDocs, aiAssumptions, fmeaData, fmeaCounter: 11, itemsData,
        flightPhasesData: [
            { phase: 'Taxi',         altFrom: '',     altFromUnit: 'AGL', altTo: '',     altToUnit: 'AGL', duration: '5',  durationUnit: 'mins' },
            { phase: 'Takeoff',      altFrom: '0',    altFromUnit: 'AGL', altTo: '1500', altToUnit: 'AGL', duration: '1',  durationUnit: 'mins' },
            { phase: 'Initial Climb',altFrom: '1500', altFromUnit: 'AGL', altTo: '8000', altToUnit: 'ASL', duration: '4',  durationUnit: 'mins' },
            { phase: 'Cruise',       altFrom: '8000', altFromUnit: 'ASL', altTo: '8000', altToUnit: 'ASL', duration: '35', durationUnit: 'mins' },
            { phase: 'Descent',      altFrom: '8000', altFromUnit: 'ASL', altTo: '3000', altToUnit: 'ASL', duration: '7',  durationUnit: 'mins' },
            { phase: 'Approach',     altFrom: '3000', altFromUnit: 'ASL', altTo: '1000', altToUnit: 'AGL', duration: '5',  durationUnit: 'mins' },
            { phase: 'Landing',      altFrom: '1000', altFromUnit: 'AGL', altTo: '0',    altToUnit: 'AGL', duration: '3',  durationUnit: 'mins' }
        ],
        ftaPages,
        activeFTAPageId: PAGE_AC_PITCH,
        internalIdCounter: nextId + 1000,
        typeCounters: { gate: 30, basic: 30, undeveloped: 1, conditioning: 1, house: 1 },
        ftaConfig: { mode: 'top-down', apportion: 'equal', targetP: 1e-9, linkedFhaId: 'AC_' + FHA_PITCH, exposureTime: 1, exposureSource: 'auto' },
        projectConfig: {
            regulation: 'Part 23', part23Class: 'III', part23CertLevel: '3', part23Propulsion: 'turbine-multi', override: false,
            customLibrary: {}, piQ: 1, piE: 1,
            missionDuration: 1,  // 1 hour, distributed across the flight phases above
            markovModels: []
        }
    };
}

// Wrap key mutating actions so they push to the undo stack and trigger autosave.
// We do this via function-name wrapping after the originals are defined.
// 20 Aug 2026 — this list was SHORT, and short here is silent. Measured on production
// against the live autosave timestamp (safetyLab.autosave.meta.v1), 4s settle per action:
// submitACFHA saved; submitACFunction, submitACFCIM and submitSysFunction did NOT. Every
// artifact on the left-hand side of the V above the AFHA — the aircraft function register,
// both FCIMs — plus EVERY system-level artifact was outside the list, so an hour of
// authoring functions and system FHAs was neither undoable nor written to the autosave
// snapshot. Close the tab and recovery restores a project with none of it. The snapshot
// PAYLOAD was always complete (_snapshotProject captures all of these); only the trigger
// was missing, which is why this stayed invisible — the data was durable the instant you
// happened to touch an FHA row, and gone if you didn't.
//
// The list stays EXPLICIT rather than derived, deliberately: auto-wrapping everything
// matching /^(submit|delete)/ would have wrapped submitSignup and pushed an undo snapshot
// around an auth call. But an explicit list that nobody notices going stale is the actual
// defect, so _UNDO_EXEMPT below names every project-mutating candidate we are deliberately
// NOT wrapping, and tests/regression_undo_autosave_coverage asserts that every global
// submit*/delete* is in exactly one of the two lists. A new artifact now fails the wall
// instead of silently not saving.
const _UNDO_TARGETS = [
    // --- fault tree structure -------------------------------------------------------
    'addTopEvent', 'addNewFTAPage', 'addSelectedGate', 'addSelectedEvent',
    'deleteSelectedNode', 'pasteAsChild', 'transferOutSelectedGate',
    'runDALAllocation', 'clearAndRedraw',
    // --- aircraft level -------------------------------------------------------------
    'submitACFunction', 'deleteACFunction',      // added 20 Aug — was not saving
    'submitACFCIM',     'deleteACFCIM',          // added 20 Aug — was not saving
    'submitACFHA',      'deleteACFHA',
    'submitACReq',      'deleteACReq',
    // --- system level (NONE of these were wrapped before 20 Aug) ---------------------
    'submitSysFunction', 'deleteSysFunction',
    'submitSysFCIM',     'deleteSysFCIM',
    'submitSysFHA',      'deleteSysFHA',
    'submitSysReq',      'deleteSysReq',
    // --- cross-cutting analyses -----------------------------------------------------
    'submitPRA', 'deletePRA',
    'submitZSA', 'deleteZSA',
    'submitFMEA', 'deleteFMEA',
    'submitCMA', 'deleteCMA',                    // added 20 Aug
    'submitRouting', 'deleteRouting',            // added 20 Aug
    'submitResource', 'deleteResource',          // added 20 Aug
    'submitItem', 'deleteItem',                  // added 20 Aug
    // --- exposure basis. deletePhaseRow / deleteMissionProfile change t_mission, which
    //     is the denominator behind every top-down apportionment. Losing a phase edit
    //     silently re-bases the whole allocation. --------------------------------------
    'deletePhaseRow', 'deleteMissionProfile',    // added 20 Aug
    'deleteBaseline'                             // added 20 Aug
];

// Deliberately NOT wrapped. Each needs a reason; the coverage test reads this list.
const _UNDO_EXEMPT = {
    submitSignup:        'auth, not project data — never snapshot around a credential flow',
    submitSignoff:       'signoff ledger is append-only and legally distinct from project edits; undoing a signature is not a thing',
    submitReviewCompose: 'review comments are their own audit trail — see submitSignoff',
    submitReviewRequest: 'review comments are their own audit trail — see submitSignoff',
    deleteReviewComment: 'review comments are their own audit trail — see submitSignoff',
    deleteCustomColumn:  'view/layout preference, not project data',
    deleteLibraryEntry:  'edits the shared component library, not this project',
    deleteMarkovModel:   'markov editor manages its own undo within projectConfig.markovModels',
    deleteMarkovState:   'markov editor manages its own undo within projectConfig.markovModels',
    deleteMarkovTransition: 'markov editor manages its own undo within projectConfig.markovModels',
    deleteNodeRecursive: 'internal helper of deleteSelectedNode, which IS wrapped — wrapping both would double-push'
};
if (typeof window !== 'undefined') { window._UNDO_TARGETS = _UNDO_TARGETS; window._UNDO_EXEMPT = _UNDO_EXEMPT; }

function _wrapForUndoAndAutosave() {
    // copySelectedBranch isn't included — it only writes to the clipboard, no project state mutation.
    const targets = _UNDO_TARGETS;
    // A name that does not resolve here (rename, load-order change, typo) used to `return`
    // silently, leaving an action unsaved and looking exactly like an action that was never
    // meant to be covered. Record the misses so the runtime smoke gate can fail on them —
    // this is the same failure shape as the list being short in the first place.
    const unresolved = [];
    const wrappedNames = [];
    targets.forEach(name => {
        const fn = window[name];
        if(typeof fn !== 'function') { unresolved.push(name); return; }
        if(fn._wrappedForUndo) { wrappedNames.push(name); return; }
        const wrapped = function(){
            pushUndo(name);
            const r = fn.apply(this, arguments);
            scheduleAutosave();
            return r;
        };
        wrapped._wrappedForUndo = true;
        // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
        // 21 Aug 2026 — this line said preserve(orig, wrapped); `orig` does not exist in
        // this scope (the local is `fn`), so the ReferenceError was silently swallowed
        // and prior wrappers' markers were never preserved here.
        try { if (window.SLWrap) SLWrap.preserve(fn, wrapped); } catch (_) {}
        window[name] = wrapped;
        wrappedNames.push(name);
    });
    try {
        window._UNDO_UNRESOLVED = unresolved;
        // Coverage is recorded HERE, not read back off the function later, because
        // window[name] is contested: nine modules in this codebase monkey-patch functions by
        // name (auth_gate, avail_closedform, cloud_sync, delete_guard, notify_agents, ram_ai,
        // ram_derive, this one, and the edit-modal block in safety_lab), each rebinding
        // window[name] around whatever it found and none of them carrying the others' flags.
        // Behaviour composes fine — every one of them calls through, so the undo push and the
        // autosave still happen — but the _wrappedForUndo MARKER gets dropped by whoever wraps
        // last, which made coverage unverifiable: submitACFHA read as unwrapped on production
        // while demonstrably saving. This list is the truthful record of what we wrapped, and
        // nothing downstream can erase it.
        window._UNDO_WRAPPED = wrappedNames;
        if (unresolved.length) console.warn('[undo/autosave] not wrapped — these actions will NOT save:', unresolved);
    } catch (_) {}
}

// The pre-20-Aug assignment block, kept ONLY for a failed project_stores.js load.
// The wall asserts it still covers every declared store.
function _applyProjectDataLegacyAssign(data) {
        acFunctionsData = data.acFunctionsData || [];
        acFcimData = data.acFcimData || [];
        acExtractedFCs = data.acExtractedFCs || [];
        acFhaData = data.acFhaData || [];
        acReqData = data.acReqData || [];
        acAssumptionsData = data.acAssumptionsData || [];
        acAsmCounter = data.acAsmCounter || 1;
        systemsData = data.systemsData || [];
        activeSystemId = null;
        praData = data.praData || []; zsaData = data.zsaData || []; cmaData = data.cmaData || []; routingData = Array.isArray(data.routingData) ? data.routingData : []; resourcesData = Array.isArray(data.resourcesData) ? data.resourcesData : []; projectSourceDocs = Array.isArray(data.projectSourceDocs) ? data.projectSourceDocs : []; aiAssumptions = Array.isArray(data.aiAssumptions) ? data.aiAssumptions : []; fmeaData = data.fmeaData || []; fmeaCounter = data.fmeaCounter || 1; itemsData = data.itemsData || [];
        projectBaselines = Array.isArray(data.projectBaselines) ? data.projectBaselines : [];
        // Phase 55.0.8 — AutoReq template overrides (per-project)
        autoReqTemplateOverrides = (data.autoReqTemplateOverrides && typeof data.autoReqTemplateOverrides === 'object') ? data.autoReqTemplateOverrides : {};
        try { if (typeof window !== 'undefined') window.autoReqTemplateOverrides = autoReqTemplateOverrides; } catch(_) {}
        // Phase 56.9 — per-project report-section edits
        projectReportEdits = (data.projectReportEdits && typeof data.projectReportEdits === 'object') ? data.projectReportEdits : {};
        try { if (typeof window !== 'undefined') window.projectReportEdits = projectReportEdits; } catch(_) {}
        // 20 Aug 2026 — projectTemplates was SAVED by every snapshot builder and read
        // back by _restoreProjectSnapshot (open-from-cloud) but never here. This is the
        // path taken by undo, autosave recovery, session resume and the multi-tab guard,
        // so a user's per-project AutoReq template customisation survived a cloud reopen
        // and was silently dropped by a refresh or a Ctrl-Z. Found by the derived test
        // asserting _applyProjectData reads back everything _snapshotProject writes.
        projectTemplates = (data.projectTemplates && typeof data.projectTemplates === 'object')
            ? data.projectTemplates
            : ((typeof emptyTemplateOverrides === 'function') ? emptyTemplateOverrides() : {});
        try { if (typeof window !== 'undefined') window.projectTemplates = projectTemplates; } catch(_) {}
        reviewCommentsData = Array.isArray(data.reviewCommentsData) ? data.reviewCommentsData : [];
        reviewCounter = (typeof data.reviewCounter === 'number' && data.reviewCounter > 0) ? data.reviewCounter : (reviewCommentsData.length + 1);
        // Phase E3 — sample projects ship signed line-item approvals; without this
        // restore the cockpits would show an unreviewed program.
        reviewApprovalsData = Array.isArray(data.reviewApprovalsData) ? data.reviewApprovalsData : [];
        projectName = (typeof data.projectName === 'string' && data.projectName.trim()) ? data.projectName : (projectName || 'Untitled Project');
        if (typeof _refreshProjectNameUI === 'function') _refreshProjectNameUI();
        if(data.flightPhasesData) flightPhasesData = data.flightPhasesData;
        // STPA lane — older saves predate it; default to an empty structure.
        // AI/ML lane — older saves predate it; default to an empty register.
        mlData = (data.mlData && Array.isArray(data.mlData.constituents)) ? data.mlData : { constituents: [], odd: [], datasets: [], monitors: [], capture: [], captureEnabled: false, counter: 1 };
        stpaData = (data.stpaData && data.stpaData.cs) ? data.stpaData : { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }, dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' }, losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} };
        ftaPages = data.ftaPages || [{ id: 'page-' + Date.now(), name: 'Untitled Fault Tree', root: null }];
        activeFTAPageId = data.activeFTAPageId || ftaPages[0].id;
        internalIdCounter = data.internalIdCounter || 1;
        typeCounters = data.typeCounters || { gate: 1, basic: 1, undeveloped: 1, conditioning: 1, house: 1 };
        ftaConfig = data.ftaConfig || { mode: 'bottom-up', apportion: 'equal', targetP: 0.00001, linkedFhaId: '', exposureTime: 1, exposureSource: 'auto' };
        projectConfig = data.projectConfig || { regulation: 'Part 25', part23Class: 'IV', override: false, customLibrary: {}, piQ: 1, piE: 1, markovModels: [], libraryStandard: 'MIL-HDBK-217F', libraryEnv: 'GB', libraryQuality: 'B2', useStressPrediction: false, operatingTempC: 25, activationEnergyEv: 0.4 };
        if(!projectConfig.customLibrary) projectConfig.customLibrary = {};
        if(projectConfig.piQ == null) projectConfig.piQ = 1;
        if(projectConfig.piE == null) projectConfig.piE = 1;
        if(!Array.isArray(projectConfig.markovModels)) projectConfig.markovModels = [];
        if(!Array.isArray(projectConfig.interfaces)) projectConfig.interfaces = [];   // #IFACE migration-safe default
}

function runOneBenchmark(b) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    try {
        const out = b.run();
        const dt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        let pass = false;
        let relErr = null;
        if (b.tolerance === 0 || out.isExact) {
            pass = (out.computed === b.expected);
        } else if (typeof b.expected === 'number' && typeof out.computed === 'number') {
            const absDiff = Math.abs(out.computed - b.expected);
            relErr = b.expected === 0 ? absDiff : absDiff / Math.abs(b.expected);
            // tolerance < 1 → relative; tolerance ≥ 1 → absolute (rare).
            pass = (b.tolerance < 1) ? (relErr <= b.tolerance) : (absDiff <= b.tolerance);
        }
        return { id: b.id, name: b.name, source: b.source, citation: b.citation, category: b.category,
                 expected: b.expected, computed: out.computed, detail: out.detail || '',
                 tolerance: b.tolerance, relErr, pass, dtMs: dt, error: null };
    } catch (e) {
        const dt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        return { id: b.id, name: b.name, source: b.source, citation: b.citation, category: b.category,
                 expected: b.expected, computed: null, detail: '',
                 tolerance: b.tolerance, relErr: null, pass: false, dtMs: dt, error: e.message };
    }
}

function runAllBenchmarks() {
    showToast('Running ' + BENCHMARKS.length + ' benchmarks…', 'info', 1500);
    const results = BENCHMARKS.map(runOneBenchmark);
    _benchmarkResults = results;
    const pass = results.filter(r => r.pass).length;
    if (pass === results.length) {
        showToast('All ' + results.length + ' benchmarks passed.', 'success', 3500);
    } else {
        showToast(pass + ' of ' + results.length + ' benchmarks passed — see Math Validation tab.', 'warning', 5000);
    }
    renderValidationTable();
    return results;
}

function _formatBenchValue(v) {
    if (typeof v === 'number') {
        if (Math.abs(v) >= 1e-3 && Math.abs(v) < 1e6) return v.toFixed(6).replace(/\.?0+$/, '');
        return v.toExponential(4);
    }
    return String(v);
}

// ============================================================================
// Phase 56.37 — Click-to-expand stepwise calculation breakdowns for each
// benchmark. Public to all users — every reference cited is a published
// textbook / industry standard (Vesely NUREG-0492, Andrews & Moss, Bryant
// 1986, NUREG/CR-5485, Trivedi, MIL-HDBK-217F, ARP4754A, AC 25.1309-1A).
// None of these expose Safety Lab Aero's pending patent-pending integrations
// (Patents 01-08) which are not exercised by these benchmarks.
// ============================================================================
function _buildBenchmarkSteps(r) {
    const id = r.id;
    const s = [];
    switch (id) {
        case 'B01-and-2':
            s.push({ label: 'Inputs',     value: 'P(A) = 0.1,  P(B) = 0.2' });
            s.push({ label: 'Formula',    value: 'P(A ∧ B) = P(A) · P(B)   (independent events)' });
            s.push({ label: 'Substitute', value: '0.1 · 0.2' });
            s.push({ label: 'Result',     value: '= 0.02' });
            break;
        case 'B02-or-2':
            s.push({ label: 'Inputs',     value: 'P(A) = 0.1,  P(B) = 0.2' });
            s.push({ label: 'Formula',    value: 'P(A ∨ B) = 1 − (1 − P(A))(1 − P(B))' });
            s.push({ label: 'Substitute', value: '1 − (0.9)(0.8) = 1 − 0.72' });
            s.push({ label: 'Result',     value: '= 0.28' });
            break;
        case 'B03-or-3':
            s.push({ label: 'Inputs',     value: 'P(A) = P(B) = P(C) = 0.1' });
            s.push({ label: 'Formula',    value: 'P(A ∨ B ∨ C) = 1 − ∏(1 − P(Xi))' });
            s.push({ label: 'Substitute', value: '1 − (0.9)³ = 1 − 0.729' });
            s.push({ label: 'Result',     value: '= 0.271' });
            break;
        case 'B04-voting-2of3':
            s.push({ label: 'Inputs',     value: 'p = 0.1 for each of 3 events,  k = 2' });
            s.push({ label: 'Formula',    value: 'P(2-of-3) = C(3,2)·p²(1−p) + C(3,3)·p³ = 3p²(1−p) + p³' });
            s.push({ label: 'Substitute', value: '3 · 0.01 · 0.9 + 0.001 = 0.027 + 0.001' });
            s.push({ label: 'Result',     value: '= 0.028' });
            break;
        case 'B05-bdd-repeated':
            s.push({ label: 'Tree',       value: '(A ∧ B) ∨ (A ∧ C),  A repeated (shared logicalId)' });
            s.push({ label: 'Inputs',     value: 'P(A) = 0.1,  P(B) = 0.2,  P(C) = 0.3' });
            s.push({ label: 'BDD logic',  value: 'Shannon expand on A — factor out P(A); residual is B ∨ C' });
            s.push({ label: 'Formula',    value: 'P(top) = P(A) · [1 − (1 − P(B))(1 − P(C))]' });
            s.push({ label: 'Substitute', value: '0.1 · [1 − 0.8 · 0.7] = 0.1 · [1 − 0.56] = 0.1 · 0.44' });
            s.push({ label: 'Result',     value: '= 0.044' });
            break;
        case 'B06-mcs-vs-bdd':
            s.push({ label: 'Tree',       value: 'Same as B05: cutsets {A·B} and {A·C}' });
            s.push({ label: 'Inputs',     value: 'P(A) = 0.1,  P(B) = 0.2,  P(C) = 0.3' });
            s.push({ label: 'MCS bound',  value: 'Σ P(cutset) = P(A)·P(B) + P(A)·P(C)' });
            s.push({ label: 'Substitute', value: '0.02 + 0.03' });
            s.push({ label: 'Result',     value: '= 0.05' });
            s.push({ label: 'Note',       value: 'MCS bound (0.05) > BDD exact (0.044) — confirms repeated-event over-counting' });
            break;
        case 'B07-birnbaum':
            s.push({ label: 'Tree',       value: 'Same as B05' });
            s.push({ label: 'Formula',    value: 'I_B(A) = P(top | A=1) − P(top | A=0)' });
            s.push({ label: 'P(top|A=1)', value: '1 − (1 − P(B))(1 − P(C)) = 1 − 0.8·0.7 = 0.44' });
            s.push({ label: 'P(top|A=0)', value: '0   (A appears in every cutset)' });
            s.push({ label: 'Result',     value: 'I_B(A) = 0.44 − 0 = 0.44' });
            break;
        case 'B08-fv':
            s.push({ label: 'Tree',       value: 'Same as B05' });
            s.push({ label: 'Formula',    value: 'FV(A) = (P_top − P(top | A=0)) / P_top' });
            s.push({ label: 'P_top',      value: '0.044 (from B05)' });
            s.push({ label: 'P(top|A=0)', value: '0   (A in every cutset)' });
            s.push({ label: 'Result',     value: 'FV(A) = 0.044 / 0.044 = 1.0' });
            break;
        case 'B09-beta-ccf':
            s.push({ label: 'Inputs',     value: 'β = 0.1,  q = 0.01,  2-component group' });
            s.push({ label: 'Formula',    value: 'P(D ∧ E) = β·q + (1 − β)²·q²' });
            s.push({ label: 'CCF term',   value: 'β · q = 0.1 · 0.01 = 1.0e-3' });
            s.push({ label: 'Indep term', value: '(0.9)² · (0.01)² = 0.81 · 1e-4 = 8.1e-5' });
            s.push({ label: 'Result',     value: '= 1.0e-3 + 8.1e-5 = 1.081e-3' });
            break;
        case 'B10-mgl-ccf':
            s.push({ label: 'Inputs',     value: 'β = 0.05,  γ = 0.5,  q = 0.01,  3-component (δ = 0)' });
            s.push({ label: 'Formula',    value: 'P(3-of-3 CCF) = q · β · γ' });
            s.push({ label: 'Substitute', value: '0.01 · 0.05 · 0.5' });
            s.push({ label: 'Result',     value: '= 2.5e-4' });
            break;
        case 'B11-markov-2state':
            s.push({ label: 'States',     value: 'Working ↔ Failed' });
            s.push({ label: 'Rates',      value: 'λ (W → F) = 1e-3,   μ (F → W) = 1e-1' });
            s.push({ label: 'Formula',    value: 'π_F = λ / (λ + μ)   (closed-form steady state)' });
            s.push({ label: 'Substitute', value: '0.001 / (0.001 + 0.1) = 0.001 / 0.101' });
            s.push({ label: 'Result',     value: '≈ 9.901e-3' });
            break;
        case 'B12-markov-3state':
            s.push({ label: 'States',     value: 'Working → Degraded → Failed → Working' });
            s.push({ label: 'Rates',      value: 'W → D: 1e-4,   D → F: 1e-3,   F → W: 1e-2' });
            s.push({ label: 'Solver',     value: 'Gaussian elimination on  π·Q = 0  with  Σ πᵢ = 1' });
            s.push({ label: 'Result',     value: 'π_F = 1 / 111 ≈ 9.009e-3' });
            break;
        case 'B13-phase-lambda':
            s.push({ label: 'Phases',     value: 'Takeoff: 2 min @ λ = 1e-2,   Cruise: 4 hr @ λ = 5e-4' });
            s.push({ label: 'Formula',    value: 'λ_eff = Σ(λᵢ · tᵢ) / Σ(tᵢ)' });
            s.push({ label: 'Convert',    value: 'Takeoff = 1/30 hr,  Cruise = 4 hr' });
            s.push({ label: 'Numerator',  value: '1e-2 · (1/30) + 5e-4 · 4 = 3.333e-4 + 2.000e-3 = 2.333e-3' });
            s.push({ label: 'Denominator',value: '(1/30 + 4) = 4.0333 hr' });
            s.push({ label: 'Result',     value: '≈ 5.785e-4 / hr_op' });
            break;
        case 'B14-arrhenius-pi-t':
            s.push({ label: 'Inputs',     value: 'T_j = 75 °C = 348.15 K,   T_ref = 298.15 K,   E_a = 0.4 eV' });
            s.push({ label: 'Constant',   value: 'k = 8.617e-5 eV/K  (Boltzmann)' });
            s.push({ label: 'Formula',    value: 'π_T = exp( − E_a / k · (1/T_j − 1/T_ref) )' });
            s.push({ label: 'Exponent',   value: '−(0.4 / 8.617e-5) · (1/348.15 − 1/298.15) ≈ 2.236' });
            s.push({ label: 'Result',     value: 'π_T = exp(2.236) ≈ 9.356' });
            break;
        case 'B15-effective-lambda':
            s.push({ label: 'Inputs',     value: 'λ_b = 5e-7  (Digital MOS IC, MIL-HDBK-217F N2)' });
            s.push({ label: 'Factors',    value: 'π_E = 4 (AIC env),  π_Q = 1 (B2 qual),  π_T = 9.356 (from B14)' });
            s.push({ label: 'Formula',    value: 'λ_eff = λ_b · π_E · π_Q · π_T' });
            s.push({ label: 'Substitute', value: '5e-7 · 4 · 1 · 9.356' });
            s.push({ label: 'Result',     value: '≈ 1.871e-5 / hr' });
            break;
        case 'B16-lognormal-uncertainty':
            s.push({ label: 'Inputs',     value: 'median = 1e-5,   error factor EF = 3' });
            s.push({ label: 'σ',          value: 'ln(EF) / 1.645 = ln(3) / 1.645 ≈ 0.668' });
            s.push({ label: 'μ',          value: 'ln(median) = ln(1e-5) ≈ −11.513' });
            s.push({ label: 'Formula',    value: 'Mean = exp(μ + σ²/2)   (lognormal closed form)' });
            s.push({ label: 'Substitute', value: 'exp(−11.513 + 0.223) = exp(−11.290)' });
            s.push({ label: 'Result',     value: '≈ 1.204e-5' });
            break;
        case 'B17-pand-mc':
            s.push({ label: 'Inputs',     value: 'λ_X = 0.1,  λ_Y = 0.1,  mission t = 1 hr' });
            s.push({ label: 'PAND',       value: 'Priority-AND: X must fail strictly before Y, both within [0, t]' });
            s.push({ label: 'Closed form',value: '∫₀ᵗ λ·e^(−λs) · (1 − e^(−λ(t−s))) ds ≈ 0.00468' });
            s.push({ label: 'Method',     value: '50,000 Monte Carlo trials,  tolerance 10 % (statistical)' });
            s.push({ label: 'Result',     value: 'MC estimate matches closed form within tolerance' });
            break;
        case 'B18-dalgebra-opt2':
            s.push({ label: 'Setup',      value: 'AND gate, top DAL = A,  ARP4754A Option 2 (no independence claim)' });
            s.push({ label: 'Rule',       value: 'Option 2 — every child decrements by one level' });
            s.push({ label: 'Allocation', value: 'child DAL = A − 1 = B' });
            s.push({ label: 'Result',     value: 'Child allocated DAL = B' });
            break;
        case 'B19-dalgebra-opt1':
            s.push({ label: 'Setup',      value: 'AND gate, top DAL = A,  ARP4754A Option 1 (carrier + independence claim)' });
            s.push({ label: 'Rule',       value: 'Option 1 — carrier keeps full DAL; sibling decrements by two levels (max)' });
            s.push({ label: 'Allocation', value: 'carrier DAL = A,   sibling DAL = A − 2 = C' });
            s.push({ label: 'Result',     value: 'carrier = A,  sibling = C' });
            break;
        case 'B20-targets-part25':
            s.push({ label: 'Inputs',     value: 'Regulation = 14 CFR Part 25,  Severity = Catastrophic' });
            s.push({ label: 'Reference',  value: 'AC 25.1309-1B §3.3 / Table 4-1 safety-target table' });
            s.push({ label: 'Lookup',     value: 'Catastrophic → P ≤ 1e-9 / FH,  FDAL A' });
            s.push({ label: 'Result',     value: '(1e-9, A)' });
            break;
    }
    return s;
}

function _renderBenchmarkStepsHtml(steps) {
    if (!steps || !steps.length) {
        return '<div style="font-size: 12px; color: var(--color-text-tertiary); font-style: italic;">No calculation breakdown available for this benchmark.</div>';
    }
    let html = '<div style="display: grid; grid-template-columns: auto 1fr; gap: 6px 18px; font-family: var(--font-mono); font-size: 12px; line-height: 1.55;">';
    steps.forEach(s => {
        html += '<div style="color: var(--color-text-tertiary); white-space: nowrap;">' + esc(s.label) + '</div>';
        html += '<div style="color: var(--color-text-primary);">' + esc(s.value) + '</div>';
    });
    html += '</div>';
    return html;
}

function _toggleBenchmarkRow(benchId) {
    const exp = document.getElementById('bench-exp-' + benchId);
    const chev = document.getElementById('bench-chev-' + benchId);
    if (!exp) return;
    const isOpen = exp.style.display !== 'none';
    exp.style.display = isOpen ? 'none' : 'block';
    if (chev) chev.textContent = isOpen ? '▸' : '▾';
}

function _renderBackrefBody() {
    const body = document.getElementById('backref-body');
    const subtitleEl = document.getElementById('backref-subtitle');
    if (!body || !_backrefTarget) return;
    if (_backrefActiveTab === 'history') {
        _renderHistoryTab(body, subtitleEl);
    } else {
        _renderRefsTab(body, subtitleEl);
    }
}

// Phase 56.18b — find every basic / undeveloped event whose externalSource
// points at the target FHA row or FTA node. Returns the inheriting-events
// section HTML, or '' when no inheritances exist or the target isn't an
// inheritance source.
function _renderInheritingEvents(target) {
    if (!target) return '';
    if (typeof ftaPages === 'undefined' || !Array.isArray(ftaPages)) return '';
    if (target.kind !== 'acFha' && target.kind !== 'sysFha' && target.kind !== 'ftaNode') return '';
    const found = [];
    function _matches(node) {
        if (!node || !node.externalSource) return false;
        const s = node.externalSource;
        const kind = s.kind || (s.targetId && !s.targetNodeId ? 'fha' : (s.targetNodeId ? 'fta' : ''));
        if (target.kind === 'acFha' && kind === 'fha' && s.scope === 'aircraft' && s.targetId === target.id) return true;
        if (target.kind === 'sysFha' && kind === 'fha' && s.scope === 'system' && s.systemId === target.systemId && s.targetId === target.id) return true;
        if (target.kind === 'ftaNode' && kind === 'fta' && s.targetPageId === target.pageId && s.targetNodeId === target.id) return true;
        return false;
    }
    (ftaPages || []).forEach(page => {
        if (!page || !page.root) return;
        const stack = [page.root];
        const seen = new Set();
        while (stack.length) {
            const n = stack.pop();
            if (!n || seen.has(n.id)) continue;
            seen.add(n.id);
            if (_matches(n)) {
                found.push({ event: n, page });
            }
            const kids = n.children || n._children || [];
            for (const k of kids) stack.push(k);
        }
    });
    if (!found.length) return '';
    let html = '<div class="backref-group">';
    html += '<div class="backref-group-title">Events inheriting from this <span class="backref-count">' + found.length + '</span></div>';
    html += '<div style="margin: 6px 0 2px; padding: 6px 10px; font-size: 11px; color: var(--color-text-secondary); background: var(--color-surface-2); border-radius: 4px;">These FTA basic / undeveloped events have an external-source link to this artifact. The event\'s probability and λ are inherited from this source; if the source value changes, the linked events are flagged stale until reviewed.</div>';
    found.forEach(({ event, page }) => {
        const descriptor = { kind: 'ftaNode', id: event.id, pageId: page.id };
        const json = JSON.stringify(descriptor).replace(/"/g, '&quot;');
        const stale = event._externalSourceStale ? ' <span style="color: var(--color-warning, #f59e0b); font-weight: 600; font-size: 11px;">⚠ STALE</span>' : '';
        const lam = (typeof event.lambda === 'number' && isFinite(event.lambda)) ? event.lambda.toExponential(2) + ' /hr' : '—';
        const p   = (typeof event.probability === 'number' && isFinite(event.probability)) ? event.probability.toExponential(2) : '—';
        html += '<div class="backref-row" tabindex="0" role="button" data-descriptor="' + json + '" '
              + 'onclick="jumpToArtifact(JSON.parse(this.getAttribute(\'data-descriptor\').replace(/&quot;/g, \'\\&quot;\').replace(/\\\\&quot;/g, \'&quot;\')))" '
              + 'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault(); this.click();}">';
        html += '<div class="backref-row-label"><strong>' + esc(event.displayId || event.id) + '</strong> · ' + esc(event.name || '(unnamed)') + stale + '</div>';
        html += '<div class="backref-row-detail">Page: ' + esc(page.name || page.id) + ' · λ=' + esc(lam) + ' · P=' + esc(p) + '</div>';
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function _renderRefsTab(body, subtitleEl) {
    const refs = Traceability.getReferrers(_backrefTarget);
    // Phase 53.64 — pre-pend the derivation chain when the target is a requirement.
    const derivHtml = _renderDerivationChainSection(_backrefTarget);
    // Phase 56.22 — for FHA targets, render the auto-derived sibling hazards as
    // their own section. These are computed by deriveHazardTraces() (walks
    // function-trace edges + external-source FTA links + legacy acTraces[])
    // so the user sees the full cross-system trace without any manual entry.
    const hazardSiblingHtml = _renderAutoDerivedHazardSiblings(_backrefTarget);
    // Phase 56.18b — for FHA targets and FTA-node targets, list every basic event
    // whose externalSource link inherits from this target. Lets the user trace
    // forward from a hazard or a node into the fault-tree events consuming it.
    const inheritingHtml = _renderInheritingEvents(_backrefTarget);
    if (subtitleEl) subtitleEl.textContent = refs.length === 0 ? 'No back-references found for this artifact.' : refs.length + ' related artifact' + (refs.length === 1 ? '' : 's');
    if (!refs.length) {
        body.innerHTML = derivHtml + hazardSiblingHtml + inheritingHtml + ((hazardSiblingHtml || inheritingHtml) ? '' : '<div class="backref-empty">Nothing in the project currently references this artifact.</div>');
        return;
    }
    const groups = {};
    refs.forEach(r => { (groups[r.kind] = groups[r.kind] || []).push(r); });
    const order = ['acFha', 'sysFha', 'acFunc', 'sysFunc', 'acFcim', 'sysFcim', 'ftaPage', 'ftaNode', 'acReq', 'sysReq', 'acAsm', 'sysAsm', 'pra', 'zsa', 'cma', 'fmea'];
    let html = derivHtml + hazardSiblingHtml + inheritingHtml;
    order.forEach(k => {
        if (!groups[k]) return;
        const items = groups[k];
        html += '<div class="backref-group">';
        html += '<div class="backref-group-title">' + esc(Traceability.KIND_LABELS[k] || k) + ' <span class="backref-count">' + items.length + '</span></div>';
        items.forEach((d, i) => {
            const json = JSON.stringify(d).replace(/"/g, '&quot;');
            html += '<div class="backref-row" tabindex="0" role="button" data-descriptor="' + json + '" onclick="jumpToArtifact(JSON.parse(this.getAttribute(\'data-descriptor\').replace(/&quot;/g, \'\\&quot;\').replace(/\\\\&quot;/g, \'&quot;\')))" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault(); this.click();}">';
            html += '<div class="backref-row-label">' + esc(d.label) + '</div>';
            if (d.detail) html += '<div class="backref-row-detail">' + esc(d.detail) + '</div>';
            html += '</div>';
        });
        html += '</div>';
    });
    body.innerHTML = html;
}

// Phase 56.22 — auto-derived hazard sibling section for the back-ref panel.
// Renders a card listing every FHA on the OTHER side of an auto-derived edge
// from this FHA (whether AC↔Sys or Sys↔Sys). The list is collapsible (one card
// per related FHA) and each entry is clickable — jumpToArtifact takes the user
// to the related hazard's row. Returns '' when the target isn't an FHA or has
// no derived siblings.
function _renderAutoDerivedHazardSiblings(target) {
    if (!target || (target.kind !== 'acFha' && target.kind !== 'sysFha')) return '';
    if (typeof window.getAutoDerivedFhaSiblings !== 'function') return '';
    const edges = window.getAutoDerivedFhaSiblings(target.kind, target.id, target.systemId);
    if (!edges.length) return '';
    // Build the section. Group by basis so the user can see WHY the trace was inferred.
    const groups = { 'function-trace': [], 'external-source': [], 'manual-acTraces': [] };
    edges.forEach(e => { (groups[e.basis] || (groups[e.basis] = [])).push(e); });
    const basisHeading = {
        'function-trace':  'Linked via function trace',
        'external-source': 'Linked via external FTA source',
        'manual-acTraces': 'Linked via manual AC trace (legacy)'
    };
    const basisBlurb = {
        'function-trace':  'These hazards share a function trace path with this hazard. Adding or removing a sys function ↔ AC function trace edge changes this list automatically.',
        'external-source': 'These hazards are linked because an FTA basic event on one tree inherits its target probability from the other.',
        'manual-acTraces': 'These hazards were linked by an explicit acTrace entry on the sys FHA form (pre-auto-derivation projects).'
    };
    let html = '<div class="backref-group">';
    html += '<div class="backref-group-title">Related hazards (auto-derived) <span class="backref-count">' + edges.length + '</span></div>';
    ['function-trace', 'external-source', 'manual-acTraces'].forEach(basis => {
        const items = groups[basis] || [];
        if (!items.length) return;
        html += '<div style="margin: 6px 0 2px; padding: 6px 10px; font-size: 11px; color: var(--color-text-secondary); background: var(--color-surface-2); border-radius: 4px;">'
              + '<strong>' + esc(basisHeading[basis]) + '</strong> · '
              + items.length + ' linked hazard' + (items.length === 1 ? '' : 's')
              + '<div style="font-size: 11px; color: var(--color-text-tertiary); margin-top: 3px;">' + esc(basisBlurb[basis]) + '</div>'
              + '</div>';
        items.forEach(e => {
            const tgt = e.target;
            const tgtFha = tgt.fha;
            const scopeLabel = tgt.scope === 'ac' ? 'Aircraft FHA' : ('Sys: ' + (tgt.systemName || tgt.systemId || '?'));
            const descriptor = (tgt.scope === 'ac')
                ? { kind: 'acFha', id: tgtFha.internalId }
                : { kind: 'sysFha', id: tgtFha.internalId, systemId: tgt.systemId };
            const json = JSON.stringify(descriptor).replace(/"/g, '&quot;');
            const sev = tgtFha.severity || '';
            html += '<div class="backref-row" tabindex="0" role="button" data-descriptor="' + json + '" '
                  + 'onclick="jumpToArtifact(JSON.parse(this.getAttribute(\'data-descriptor\').replace(/&quot;/g, \'\\&quot;\').replace(/\\\\&quot;/g, \'&quot;\')))" '
                  + 'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault(); this.click();}">';
            html += '<div class="backref-row-label">'
                  + '<strong>' + esc(tgtFha.fcId || '') + '</strong> · ' + esc(scopeLabel)
                  + (sev ? ' ' + _sevPill(sev) : '')
                  + '</div>';
            const desc = (tgtFha.fcDesc || '').slice(0, 80);
            if (desc) html += '<div class="backref-row-detail">' + esc(desc) + '</div>';
            html += '</div>';
        });
    });
    html += '</div>';
    return html;
}

// Phase 53.64 — derivation chain section for the back-ref panel. Renders nothing
// when the target is not a requirement (or has no derivation info). Otherwise shows
// the chain of parents walking up (top-level → … → this) and the list of children
// derived from this req.
function _renderDerivationChainSection(target) {
    if (!target || (target.kind !== 'acReq' && target.kind !== 'sysReq')) return '';
    if (typeof findReqAnyScope !== 'function') return '';
    const found = findReqAnyScope(target.id);
    if (!found) return '';
    const req = found.req;
    // Walk up.
    const parents = [];
    let cur = req.parentReqId;
    const seen = new Set([req.internalId]);
    while (cur && !seen.has(cur)) {
        seen.add(cur);
        const f = findReqAnyScope(cur);
        if (!f) break;
        parents.unshift(f);
        cur = f.req.parentReqId;
    }
    // Find children (everything where parentReqId === this.internalId).
    const children = [];
    const tryPush = (r, scope) => { if (r.parentReqId === req.internalId) children.push({ req: r, scope }); };
    (acReqData || []).forEach(r => tryPush(r, 'ac'));
    (systemsData || []).forEach(s => (s.req || []).forEach(r => tryPush(r, 'sys-' + s.id)));
    if (!parents.length && !children.length && !req.derivationType) return '';
    const chipForReq = (entry) => {
        const r = entry.req;
        const kind = entry.scope === 'ac' ? 'acReq' : 'sysReq';
        const desc = { kind, id: r.internalId };
        if (entry.scope !== 'ac') desc.systemId = entry.scope.replace(/^sys-/, '');
        const json = JSON.stringify(desc).replace(/"/g, '&quot;');
        const label = (r.traceId || 'REQ') + ' — ' + ((r.text || '').slice(0, 60));
        const typeChip = derivationBadgeHtml(r);
        return '<div class="backref-row" tabindex="0" role="button" data-descriptor="' + json + '" onclick="jumpToArtifact(JSON.parse(this.getAttribute(\'data-descriptor\').replace(/&quot;/g, \'\\&quot;\').replace(/\\\\&quot;/g, \'&quot;\')))" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault(); this.click();}">'
             + '<div class="backref-row-label">' + esc(label) + typeChip + '</div>'
             + '</div>';
    };
    let html = '<div class="backref-group" style="background: rgba(94, 92, 230, 0.04); border: 1px solid rgba(94, 92, 230, 0.18); border-radius: var(--r-md); padding: 8px 10px;">';
    html += '<div class="backref-group-title">Derivation chain <span class="backref-count">ARP 4754B §6.1.1</span></div>';
    if (req.derivationType) {
        html += '<div style="font-size: 11.5px; color: var(--color-text-secondary); margin-bottom: 8px;">This requirement is <strong>' + esc(req.derivationType) + '</strong>.</div>';
    }
    if (parents.length) {
        html += '<div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-tertiary); font-weight: 600; margin: 6px 0 4px 0;">Parents (up to root)</div>';
        parents.forEach(entry => { html += chipForReq(entry); });
    }
    if (children.length) {
        html += '<div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-tertiary); font-weight: 600; margin: 10px 0 4px 0;">Children (derived from this)</div>';
        children.forEach(entry => { html += chipForReq(entry); });
    }
    if (!parents.length && !children.length && req.derivationType) {
        html += '<div style="font-size: 11.5px; color: var(--color-text-tertiary); font-style: italic;">No parent or child requirements linked yet.</div>';
    }
    html += '</div>';
    return html;
}

// Phase 53.56 — render the History tab for a requirement target.
function _renderHistoryTab(body, subtitleEl) {
    const t = _backrefTarget;
    if (!t || (t.kind !== 'acReq' && t.kind !== 'sysReq')) {
        body.innerHTML = '<div class="backref-empty">History is only available for requirements.</div>';
        if (subtitleEl) subtitleEl.textContent = '';
        return;
    }
    const found = findReqAnyScope(t.id);
    if (!found) {
        body.innerHTML = '<div class="backref-empty">Requirement not found.</div>';
        if (subtitleEl) subtitleEl.textContent = '';
        return;
    }
    const req = found.req;
    const history = ReqHistory.getHistory(req);
    if (subtitleEl) subtitleEl.textContent = history.length === 0 ? 'No history captured for this requirement yet.' : history.length + ' revision' + (history.length === 1 ? '' : 's');
    if (!history.length) {
        body.innerHTML = '<div class="backref-empty">No changes have been recorded yet. Edit this requirement, or run AutoReq, to start the audit trail.</div>';
        return;
    }
    const fmtTs = (ts) => {
        try {
            const d = new Date(ts);
            return d.toLocaleString();
        } catch(_) { return ts; }
    };
    const fmtValue = (v) => {
        if (v == null) return '<em class="u-muted">(empty)</em>';
        if (Array.isArray(v)) return v.length ? esc(v.join(', ')) : '<em class="u-muted">(empty list)</em>';
        if (typeof v === 'object') { try { return '<code>' + esc(JSON.stringify(v)) + '</code>'; } catch(_) { return ''; } }
        const s = String(v);
        return esc(s.length > 220 ? s.slice(0, 220) + '…' : s);
    };
    const actionColor = (a) => {
        if (a === 'create' || a === 'auto-create') return '#34c759';
        if (a === 'delete') return '#ff3b30';
        if (a === 'restore') return '#34c759';
        if (a === 'archive') return '#ff9500';
        if (a === 'auto-update') return '#5e5ce6';
        return '#4E63D8';
    };
    let html = '<div class="reqhist-timeline">';
    history.forEach((entry, idx) => {
        const isCreate = entry.action === 'create' || entry.action === 'auto-create';
        let changesHtml = '';
        if (isCreate && entry.snapshot) {
            const keys = Object.keys(entry.snapshot);
            changesHtml = '<div class="reqhist-changes">';
            keys.forEach(k => {
                changesHtml += '<div class="reqhist-change">';
                changesHtml += '<div class="reqhist-field">' + esc(ReqHistory.FIELD_LABELS[k] || k) + '</div>';
                changesHtml += '<div class="reqhist-diff"><span class="reqhist-to">' + fmtValue(entry.snapshot[k]) + '</span></div>';
                changesHtml += '</div>';
            });
            changesHtml += '</div>';
        } else if (entry.changes) {
            const keys = Object.keys(entry.changes);
            if (keys.length) {
                changesHtml = '<div class="reqhist-changes">';
                keys.forEach(k => {
                    const c = entry.changes[k];
                    changesHtml += '<div class="reqhist-change">';
                    changesHtml += '<div class="reqhist-field">' + esc(ReqHistory.FIELD_LABELS[k] || k) + '</div>';
                    changesHtml += '<div class="reqhist-diff">';
                    changesHtml += '<span class="reqhist-from">' + fmtValue(c.from) + '</span>';
                    changesHtml += '<span class="reqhist-arrow"> → </span>';
                    changesHtml += '<span class="reqhist-to">' + fmtValue(c.to) + '</span>';
                    changesHtml += '</div>';
                    changesHtml += '</div>';
                });
                changesHtml += '</div>';
            }
        }
        html += '<div class="reqhist-entry" style="--reqhist-dot:' + actionColor(entry.action) + '">';
        html += '<div class="reqhist-head">';
        html += '<span class="reqhist-action" style="background:' + actionColor(entry.action) + '20; color:' + actionColor(entry.action) + ';">' + esc(ReqHistory.ACTION_LABELS[entry.action] || entry.action) + '</span>';
        html += '<span class="reqhist-ts">' + esc(fmtTs(entry.ts)) + '</span>';
        if (entry.actor) html += '<span class="reqhist-actor">· ' + esc(entry.actor) + '</span>';
        if (entry.note) html += '<span class="reqhist-note"> (' + esc(entry.note) + ')</span>';
        html += '</div>';
        html += changesHtml;
        html += '</div>';
    });
    html += '</div>';
    // If the req is currently soft-deleted, surface a Restore button at the top.
    if (req.deleted) {
        const fn = found.scope === 'ac' ? 'restoreACReq' : 'restoreSysReq';
        const banner = '<div class="reqhist-deleted-banner">'
            + '<div><strong>This requirement is currently deleted.</strong><br><span style="font-size:11.5px; color: var(--color-text-tertiary);">It is hidden from the main view. Restore to bring it back.</span></div>'
            + '<button class="action-btn" style="background:#34c759; color:#fff;" onclick="window.' + fn + '(\'' + esc(req.internalId) + '\'); setTimeout(()=>_renderBackrefBody(),50);">↺ Restore</button>'
            + '</div>';
        html = banner + html;
    }
    body.innerHTML = html;
}

function _reviewJumpDescriptorFor(target) {
    if (!target) return null;
    const k = target.kind;
    const sysKinds = { sysFha: 'sys-workspace', sysReq: 'sys-workspace', sysAsm: 'sys-workspace' };
    if (sysKinds[k]) {
        return { kind: k, id: target.id, tab: 'sys-workspace', systemId: target.systemId,
                 sysSubtab: ({sysFha:'fha', sysReq:'req', sysAsm:'asm'})[k] };
    }
    const TAB_BY_KIND = {
        acFha: 'ac-fha', acReq: 'ac-req', acAsm: 'ac-asm',
        pra: 'pra', zsa: 'zsa', cma: 'cma', fmea: 'fmea'
    };
    return { kind: k, id: target.id, tab: TAB_BY_KIND[k] || 'dashboard' };
}

// Lightweight refresh handle used from the side panel after a CRUD action.
function renderReviewDashboardBucket() {
    // Dashboard worklist is regenerated wholesale by renderWorklist(); easiest path:
    if (typeof renderWorklist === 'function') {
        try { renderWorklist(); } catch (_) {}
    }
}

// ============================================================================
// Phase 50.5 — Consolidated review summary tab
// One collapsible bucket per assessment kind. Filters: "Open only" + "Mine only".
// ============================================================================
function renderReviewSummary() {
    const host = document.getElementById('review-summary-host');
    if (!host) return;
    if (typeof Review === 'undefined') { host.innerHTML = ''; return; }

    const openOnlyEl = document.getElementById('review-filter-open-only');
    const mineOnlyEl = document.getElementById('review-filter-mine');
    const openOnly = !openOnlyEl || openOnlyEl.checked;
    const mineOnly = !!(mineOnlyEl && mineOnlyEl.checked);
    const me = Review.getReviewerName();

    // Index comments by kind. Open count == open-status comments only; total
    // count includes resolved. The filters affect which threads we render but
    // the per-bucket counters always reflect the "open / total" reality.
    const byKind = new Map();
    for (const k of Review.KIND_ORDER) byKind.set(k, []);
    for (const c of reviewCommentsData) {
        if (!byKind.has(c.target.kind)) byKind.set(c.target.kind, []);
        byKind.get(c.target.kind).push(c);
    }

    let totalOpen = 0, totalAll = 0;
    let html = '';

    for (const k of Review.KIND_ORDER) {
        const all = byKind.get(k) || [];
        const open = all.filter(c => c.status === 'open');
        totalOpen += open.length;
        totalAll  += all.length;

        // Build threads per artifact ID (artifact → threads).
        const threadsByArtifact = new Map();
        for (const c of all) {
            // Index by id (+ systemId if sys-*). Skip non-roots — threadsFor will collect descendants.
            if (c.parentId) continue;
            const key = (c.target.systemId ? c.target.systemId + '|' : '') + c.target.id;
            if (!threadsByArtifact.has(key)) {
                threadsByArtifact.set(key, { target: c.target, roots: [] });
            }
            threadsByArtifact.get(key).roots.push(c);
        }

        // Render bucket.
        const openLabel = open.length + ' open' + (all.length > open.length ? ' · ' + (all.length - open.length) + ' resolved' : '');
        const counterCls = open.length === 0 ? 'zero' : 'warning';
        html += '<details class="review-bucket"' + (open.length > 0 ? ' open' : '') + '>';
        html += '<summary class="review-bucket-summary">' +
            '<span class="review-bucket-title">' + esc(Review.kindLabel(k)) + '</span>' +
            '<span class="review-bucket-count ' + counterCls + '">' + esc(openLabel) + '</span>' +
            '</summary>';
        html += '<div class="review-bucket-body">';

        if (threadsByArtifact.size === 0) {
            html += '<div class="review-empty">No comments on ' + esc(Review.kindLabel(k)) + '.</div>';
        } else {
            // Per-artifact rows. Each row groups all open + resolved threads on that artifact.
            const rows = [];
            for (const [key, grp] of threadsByArtifact.entries()) {
                const target = grp.target;
                const threads = Review.threadsFor(target, { includeResolved: true });
                // Apply filters.
                let displayThreads = threads;
                if (openOnly) {
                    displayThreads = threads.filter(t =>
                        t.root.status === 'open' ||
                        t.descendants.some(d => d.c.status === 'open')
                    );
                }
                if (mineOnly && me) {
                    displayThreads = displayThreads.filter(t =>
                        t.root.authorName === me ||
                        t.descendants.some(d => d.c.authorName === me)
                    );
                }
                if (displayThreads.length === 0) continue;
                rows.push({ target, threads: displayThreads });
            }
            if (rows.length === 0) {
                html += '<div class="review-empty">Nothing matches the current filters.</div>';
            } else {
                for (const row of rows) {
                    html += _renderReviewSummaryRow(row.target, row.threads);
                }
            }
        }
        html += '</div></details>';
    }

    // Totals strip.
    const totalsEl = document.getElementById('review-summary-totals');
    if (totalsEl) {
        totalsEl.textContent = totalOpen + ' open · ' + (totalAll - totalOpen) + ' resolved · ' + totalAll + ' total';
    }

    host.innerHTML = html;
}

function _renderReviewSummaryRow(target, threads) {
    const subtitle = esc(_reviewTargetSubtitle(target));
    // Pick the first thread's root comment ID as a stable handle for the row's buttons —
    // either jump-to-artifact or open-thread can reconstitute the target from it.
    const handleId = threads.length ? threads[0].root.commentId : '';
    const handleEsc = esc(handleId);

    // Quick stats.
    const openTotal = threads.reduce((n, t) => {
        return n + (t.root.status === 'open' ? 1 : 0) + t.descendants.filter(d => d.c.status === 'open').length;
    }, 0);
    const totalTotal = threads.reduce((n, t) => n + 1 + t.descendants.length, 0);

    let body = '';
    for (const thread of threads) {
        body += '<div class="review-summary-thread">';
        body += _renderReviewComment(thread.root, 0);
        for (const d of thread.descendants) {
            body += _renderReviewComment(d.c, d.depth);
        }
        body += '</div>';
    }

    return '<div class="review-summary-row">' +
        '<div class="review-summary-row-head">' +
            '<div class="review-summary-row-title">' + subtitle + '</div>' +
            '<div class="review-summary-row-actions">' +
                '<span class="review-pill">' + openTotal + ' open' + (totalTotal > openTotal ? ' · ' + (totalTotal - openTotal) + ' resolved' : '') + '</span>' +
                '<button class="review-action-btn" onclick="reviewOpenThreadFromComment(\'' + handleEsc + '\')">Open thread</button>' +
                '<button class="review-action-btn" onclick="reviewJumpFromComment(\'' + handleEsc + '\')">Jump to artifact</button>' +
            '</div>' +
        '</div>' +
        '<div class="review-summary-row-body">' + body + '</div>' +
    '</div>';
}
