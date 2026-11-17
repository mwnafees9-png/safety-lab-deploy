/* ============================================================================
 * apx_autopilots.js (SLApxAuto v1.0, 15 Nov 2026): the Interdependence Autopilot and the page the three Autopilots share. Step 2 of 5 of the Interdependence,
 * MAC and CoFFE Autopilots (apx_engine.js holds the rulings and the math; the MAC and CoFFE Autopilots join this file
 * in steps 3 and 4: apx_mac.js and apx_coffe.js register themselves here, and apx_bridge.js carries the answers
 * to the PASA and to the files that read today's stores).
 *
 * BEHIND A SWITCH ONLY OUR TEAM SEES. Nothing here shows until the switch is on (open the tool once with ?apx=1 in the
 * address, or SLApxAuto.on(); ?apx=0 or SLApxAuto.off() turns it off). With it on, the Interdependence page shows this
 * Autopilot, with a switch back to today's page. Customers keep today's page, unchanged.
 * IT SAVES IN ITS OWN PLACE (projectConfig.apx). Nothing else in a project is changed until the engineer sends a
 * failure condition to the PASA: what was sent is then carried to today's stores for the files that read them
 * (apx_bridge.js, which can also take it back out). One more thing changes the project, and the engineer asks for it
 * by name: creating a system, a system function or a shared resource here adds it to the
 * architecture, exactly as creating it on its own page does (Waqas: "you create systems and systems function, which
 * should be setting the basis for system level assessments, similarly for common resources").
 *
 * Waqas, 15 Nov 2026: "you select the failure condition you are working on with a drop down list, then select the
 * applicable systems and their functions"; "auto pilot only shows the parts of the table that are relevant to the
 * failure condition and carries them over to the PASA, systems not applicable dont get shown"; the tables are
 * "exactly" the ARP4761A contiguous example's (Table Q.4-1, Table Q.4-2, and Table B3 for the common resource
 * analysis); headers are black, short, with a list of abbreviations under each table; everything uses the full width.
 * Rulings from the audit of today's page: a function the project's own data says feeds the failure condition (it
 * traces to that aircraft function, it provides a resource consumed for it, or a system failure condition traces to
 * it) comes checked and CANNOT be unchecked until that link is fixed; what was asserted on today's table comes checked
 * ("existing work auto-populates"); the AI's proposals are shown to accept, never applied; one sign-off per failure
 * condition when sending to the PASA, recorded on every answer in it.
 *
 * v1.2, Waqas, 16 Nov 2026, on a Table Q.4-1 that showed the electrical and hydraulic systems as columns: "where are we
 * identifying resources here, 4 over to the right are all resources"; "how would you know which bus feeds the function
 * without reviewing architectecture, fault trees are built from interdepenedence and common resource assessments not the
 * other way round"; "they will be creating SFHA functions as part of the PASA flow, identifying resources and their
 * functions"; "ask them to add systems, and their functions as part of the PASA"; "ask them if the system is a resource
 * system". So: the page asks for each system and its function and whether it is a resource system (the architecture's
 * own system role: function, resource or both). A resource system's function supplies a resource: it is a row of Table
 * Q.4-2 and is never a column of Table Q.4-1. No resource and no feed is checked by the tool: the resource register only
 * says a system uses a resource, not which bus feeds which function, so it is shown as a hint in words. A system that
 * only provides a resource for the aircraft function is no longer taken as a contributor here.
 *
 * The record of one failure condition (projectConfig.apx.idp[<governing row internalId>]):
 *   cols:  { 'fn:<funcId>': { role: 'does' | 'fails', how: 'loss' | 'malfunction' } }   what the engineer checked
 *   off:   { 'fn:<funcId>': true }        an earlier assertion or AI proposal the engineer turned down
 *   res:   { <resKey>: { on, feeds: { colId: true|false }, modes: [name] } }
 *   cra:   { '<resKey>|<mode>|<colId>': text, '<resKey>|<mode>|': aircraft-level text }
 *   sent:  { by, at } once sent to the PASA; cleared by any later change (the PASA then says it changed since)
 *
 * API (window.SLApxAuto): enabled(), on(), off(), model (the worked-out answers, for the PASA and the tests),
 * tables (the three tables as HTML), render(host). Tests: tests/regression_apx_interdependence_20261115.test.js.
 * ==========================================================================*/
(function (root) {
    'use strict';
    var VERSION = '1.4';   // 1.4 17 Nov 2026: "check" for "tick"; the AI reads a design document or the engineer's words and proposes the systems, functions and resources (a person accepts each); the resources are Assumed until compared with the architecture document; what was sent can be taken back out from the page.   // 1.3 17 Nov 2026: a function that does the job is traced up to the aircraft function when it is checked or added here (and the trace the Autopilot made comes off with the check); a resource's providing function is written where the architecture reads it (providedByFunctions).   // 1.2 16 Nov 2026: the Autopilot ASKS for each system and its function, and whether it is a resource system; a resource system is a row of Table Q.4-2, never a column of Table Q.4-1; no resource is checked by the tool.   // 1.1 16 Nov 2026: a field in a row lines up with its label and its button (the site's own bottom margin on fields is taken off inside the Autopilots)
    function g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function S(v) { return v == null ? '' : String(v); }
    function E(s) { return S(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function T(v) { return S(v).replace(/\s*\u2014\s*/g, '; ').replace(/\s+/g, ' ').trim(); }
    function lc(s) { s = S(s); return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function fn(name) { var f = g(name); return typeof f === 'function' ? f : null; }
    function pc() { var p = g('projectConfig'); return p && typeof p === 'object' ? p : null; }
    function now() { return new Date().toISOString(); }
    function who() { return root.SLAutopilotUI && root.SLAutopilotUI.who ? S(safe(function () { return root.SLAutopilotUI.who(); }, '')) : ''; }
    function save() { try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {} try { if (root.SLAutopilotUI && root.SLAutopilotUI.save) root.SLAutopilotUI.save(); else if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }
    function toast(m, kind) { try { if (typeof root.showToast === 'function') root.showToast(m, kind || 'info', 5000); } catch (_) {} }

    // ---- the switch ---------------------------------------------------------------------------------------------------
    var KEY = 'sl_apx';
    function ls() { try { return root.localStorage || null; } catch (_) { return null; } }
    function enabled() { var l = ls(); try { return !!(l && l.getItem(KEY) === '1'); } catch (_) { return false; } }
    function on() { var l = ls(); try { if (l) l.setItem(KEY, '1'); } catch (_) {} rerender(); }
    function off() { var l = ls(); try { if (l) l.removeItem(KEY); } catch (_) {} rerender(); }
    (function fromAddress() {
        try { var m = /[?&]apx=([01])\b/.exec(S(root.location && root.location.search)); if (!m) return; var l = ls(); if (!l) return; if (m[1] === '1') l.setItem(KEY, '1'); else l.removeItem(KEY); } catch (_) {}
    })();

    // ---- the store ----------------------------------------------------------------------------------------------------
    function store() {
        var p = pc(); if (!p) return { v: 1, idp: {} };
        if (!p.apx || typeof p.apx !== 'object') p.apx = { v: 1 };
        if (!p.apx.idp || typeof p.apx.idp !== 'object') p.apx.idp = {};
        return p.apx;
    }
    function peek(fcKey) { var p = pc(); return (p && p.apx && p.apx.idp && p.apx.idp[fcKey]) || null; }
    function rec(fcKey) {
        var s0 = store(), r = s0.idp[fcKey];
        if (!r || typeof r !== 'object') r = s0.idp[fcKey] = {};
        ['cols', 'off', 'res', 'cra'].forEach(function (k) { if (!r[k] || typeof r[k] !== 'object') r[k] = {}; });
        return r;
    }
    function touched(fcKey) { var r = rec(fcKey); if (r.sent) { r.changedSince = { at: now() }; r.wasSent = r.sent; delete r.sent; } save(); }

    // ---- the project: failure conditions, systems, functions, resources -------------------------------------------------
    function fcs() {
        var F = root.SLFcTrees, out = [], seen = {};
        var groups = F && typeof F.groups === 'function' ? safe(function () { return F.groups('ac'); }, null) : null;
        if (groups && groups.length) groups.forEach(function (gr) { if (gr && gr.gov && gr.gov.internalId != null) out.push(gr.gov); });
        else arr(g('acFhaData')).forEach(function (r) { if (r && r.internalId != null) { var k = S(r.fcId) || ('#' + r.internalId); if (!seen[k]) { seen[k] = 1; out.push(r); } } });
        return out.map(function (r) { return { key: S(r.internalId), fcId: T(r.fcId), desc: T(r.fcDesc), sev: T(r.severity), phases: T(Array.isArray(r.phases) ? r.phases.join(', ') : r.phases), subId: S(r.subId), row: r }; });
    }
    function fcOf(key) { return fcs().filter(function (f) { return f.key === S(key); })[0] || null; }
    function acFnName(subId) { var f = arr(g('acFunctionsData')).filter(function (x) { return x && S(x.subId) === S(subId); })[0]; return f ? T(f.subName || f.funcName || '') : ''; }
    function acFnLabel(fc) { var n = acFnName(fc.subId); return (fc.subId ? fc.subId + (n ? ' ' + n : '') : n) || 'Not set'; }
    function systems() { return arr(g('systemsData')).filter(function (s) { return s && s.id != null; }); }
    // every system function is a possible column (Table Q.4-1: the system with its function)
    function allCols() {
        var out = [];
        systems().forEach(function (s) {
            arr(s.functions).forEach(function (f) { if (f && f.funcId) out.push({ colId: 'fn:' + f.funcId, sysId: S(s.id), sysName: T(s.name || s.id), funcId: S(f.funcId), fnName: T(f.funcName || f.funcId) }); });
        });
        return out;
    }
    function colOf(colId) { return allCols().filter(function (c) { return c.colId === colId; })[0] || null; }
    // what the project's own data says (today's derivation, helpers_modules.js _idpDerivedFn): null or { kind, why }
    function derived(fc, col) { var f = fn('_idpDerivedFn'); return f ? safe(function () { return f(fc.row, col.funcId); }, null) || null : null; }
    function oldCell(fc, col) { var p = pc(); var cells = p && p.interdep && p.interdep.cells; return (cells && cells[fc.key + '§' + col.colId]) || null; }
    var WHY = { implements: 'its function traces to this aircraft function', resource: 'it provides a resource used for this aircraft function', sfha: 'one of its system failure conditions traces to this failure condition' };

    // One column's state for one failure condition:
    //   { on, locked, why, src: 'data' | 'you' | 'earlier' | 'ai' | null, role, how, proposal }
    function cellOf(fc, col) {
        var r = peek(fc.key) || {}, mine = (r.cols || {})[col.colId], offd = !!(r.off || {})[col.colId];
        var d = derived(fc, col), old = oldCell(fc, col);
        var role = mine ? mine.role : (d && d.kind === 'implements' ? 'does' : (d && d.kind !== 'resource' ? 'fails' : 'does')), how = mine && mine.how === 'malfunction' ? 'malfunction' : 'loss';
        if (d && d.kind === 'resource') d = null;   // v1.2: providing a resource makes it a row of Table Q.4-2, not a column here
        if (d) return { on: true, locked: true, src: 'data', why: WHY[d.kind] || T(d.why), detail: T(d.why), role: role, how: how };
        if (mine) return { on: true, locked: false, src: 'you', role: role, how: how };
        if (old && old.state === 'asserted' && !offd) return { on: true, locked: false, src: 'earlier', why: 'checked on the earlier interdependence table' + (old.by ? ' by ' + T(old.by) : ''), role: 'does', how: 'loss' };
        if (old && old.state === 'proposed' && old.dir !== 'clear' && !offd) return { on: false, locked: false, src: null, role: 'does', how: 'loss', proposal: { why: T(old.why || ''), model: T(old.model || '') } };
        return { on: false, locked: false, src: null, role: 'does', how: 'loss' };
    }
    // the columns of this failure condition, in a steady order: the systems' own order
    function picked(fc) { return allCols().filter(function (c) { return cellOf(fc, c).on; }); }

    function resources() { return arr(g('resourcesData')).filter(Boolean).map(function (r) { return { key: S(r.internalId != null ? r.internalId : r.resId), name: T(r.name || r.resId), type: T(r.type || ''), row: r }; }); }
    function sysByName(name) { name = T(name).toLowerCase(); return name ? systems().filter(function (x) { return T(x.name).toLowerCase() === name; })[0] || null : null; }
    function isResSys(x) { return !!x && x.role === 'resource'; }
    // who provides a resource, in words: the system and, where it is set, its function
    function providerText(r) {
        var names = providerNames(r), fid = S(r.row.providedByFn || arr(r.row.providedByFunctions)[0] || ''), f = null;
        if (fid) systems().forEach(function (x) { arr(x.functions).forEach(function (y) { if (y && S(y.funcId) === fid) f = y; }); });
        return names.length ? names.join(', ') + (f ? ': ' + lc(T(f.funcName || f.funcId)) : '') : '';
    }
    function providerNames(r) { return arr(r.row.providedBy).map(function (id) { var s = systems().filter(function (x) { return S(x.id) === S(id); })[0]; return s ? T(s.name || s.id) : ''; }).filter(Boolean); }
    function dataFeeds(r, col) {
        var x = r.row, f = fn('_resFnConsumers'), viaFn = f ? safe(function () { return f(x); }, null) : null;
        return arr(x.consumedBySystems).map(S).indexOf(col.sysId) !== -1 || !!(viaFn && viaFn.has && (viaFn.has(col.sysId) || viaFn.has(Number(col.sysId))));
    }
    // v1.2: nothing is checked by the tool. The register's system-level "uses it" is a hint in words (st.hint), never a check.
    function resState(fc, r) {
        var me = ((peek(fc.key) || {}).res || {})[r.key] || null, cols = picked(fc);
        var hint = cols.filter(function (c) { return dataFeeds(r, c); }).map(function (c) { return c.sysName; }).filter(function (n, k, a) { return a.indexOf(n) === k; });
        var feeds = {};
        cols.forEach(function (c) { feeds[c.colId] = !!(me && me.feeds && me.feeds[c.colId] === true); });
        return { on: !!(me && me.on === true), fromData: false, hint: hint, feeds: feeds, modes: me && Array.isArray(me.modes) ? me.modes.slice() : [] };
    }
    function resPicked(fc) { return resources().filter(function (r) { return resState(fc, r).on; }); }
    var MODES = ['Partial loss', 'Total loss', 'Degraded', 'Erroneous'];
    function craText(fc, r, mode, colId) {
        var mine = ((peek(fc.key) || {}).cra || {})[r.key + '|' + mode + '|' + (colId || '')];
        if (mine != null) return mine;
        // what was typed on today's common resource analysis is carried in (same resource, same failure, same column)
        var p = pc(), old = p && p.interdep && p.interdep.cra;
        return old ? T(old[fc.key + '§' + r.key + '·' + mode + '§' + (colId || '')] || '') : '';
    }
    function effectRows(fc) { var out = []; resPicked(fc).forEach(function (r) { resState(fc, r).modes.forEach(function (m) { out.push({ r: r, mode: m }); }); }); return out; }
    function unfinished(fc) {
        var cols = picked(fc);
        return effectRows(fc).filter(function (x) { var st = resState(fc, x.r); return !craText(fc, x.r, x.mode, '') || cols.some(function (c) { return st.feeds[c.colId] && !craText(fc, x.r, x.mode, c.colId); }); });
    }
    function left(fc) {
        var out = [];
        if (!picked(fc).length) out.push('No system is checked yet.');
        resPicked(fc).forEach(function (r) { if (!resState(fc, r).modes.length) out.push('Say how ' + r.name + ' can fail.'); });
        var u = unfinished(fc).length; if (u) out.push(u + ' resource failure' + (u > 1 ? 's are' : ' is') + ' not finished.');
        return out;
    }
    function status(fc) { var r = peek(fc.key) || {}; return r.sent ? { k: 'sent', by: r.sent.by, at: r.sent.at } : r.changedSince ? { k: 'changed' } : (r.cols && Object.keys(r.cols).length) || (r.res && Object.keys(r.res).length) ? { k: 'started' } : { k: 'new' }; }

    // ---- the three tables, exactly as the PASA shows them ---------------------------------------------------------------
    function abbr(list) { return '<div class="apx-abbr"><b>Abbreviations</b><div class="apx-abl">' + list.map(function (a) { return '<span><b>' + E(a[0]) + '</b> ' + E(a[1]) + '</span>'; }).join('') + '</div></div>'; }
    function colHead(c) { return '<th><span class="apx-sysn">' + E(c.sysName) + '</span>(' + E(c.funcId) + ' - ' + E(c.fnName) + ')</th>'; }
    function tableQ41(fc) {
        var cols = picked(fc);
        if (!cols.length) return '<p>No system is checked for this failure condition yet.</p>';
        return '<div class="apx-cap">Table Q.4-1 - (PASA)<br>Interdependence table</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp">'
            + '<tr><th colspan="3"></th><th colspan="' + cols.length + '">AC Systems (Function)</th></tr>'
            + '<tr><th><span class="apx-sysn">AC Function</span></th><th><span class="apx-sysn">AC FC ID</span></th><th><span class="apx-sysn">AC FC Description</span></th>' + cols.map(colHead).join('') + '</tr>'
            + '<tr><td class="l">' + E(acFnLabel(fc)) + '</td><td class="l">' + E(fc.fcId) + '</td><td class="l">' + E(fc.desc) + '</td>' + cols.map(function () { return '<td>X</td>'; }).join('') + '</tr></table></div>'
            + abbr([['AC', 'Aircraft'], ['FC', 'Failure Condition']]);
    }
    function tableQ42(fc, clickable) {
        var cols = picked(fc), rs = resPicked(fc);
        if (!cols.length || !rs.length) return '<p>No shared resource is checked for this failure condition yet.</p>';
        return '<div class="apx-cap">Table Q.4-2 - (PASA)<br>Interdependence (common resource) table</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp' + (clickable ? ' apx-grid' : '') + '">'
            + '<tr><th class="apx-diag" colspan="2" rowspan="2"></th><th colspan="' + cols.length + '">AC Systems (Function)</th></tr><tr>' + cols.map(colHead).join('') + '</tr>'
            + rs.map(function (r, k) {
                var st = resState(fc, r);
                return '<tr>' + (k === 0 ? '<th rowspan="' + rs.length + '">Common Sources and Resources (Generation and Distribution)</th>' : '') + '<th class="l">R' + (k + 1) + '. ' + E(r.name) + (providerText(r) ? '<span class="apx-prov">' + E(providerText(r)) + '</span>' : '') + '</th>'
                    + cols.map(function (c) { return '<td' + (clickable ? ' class="apx-cell" data-apx-feed="' + E(r.key + '|' + c.colId) + '" title="Click to change"' : '') + '>' + (st.feeds[c.colId] ? 'x' : '--') + '</td>'; }).join('') + '</tr>';
            }).join('') + '</table></div>' + abbr([['AC', 'Aircraft'], ['R', 'Resource']]);
    }
    function tableB3(fc) {
        var cols = picked(fc), rows = effectRows(fc);
        if (!cols.length || !rows.length) return '<p>No resource failure is set for this failure condition yet.</p>';
        var by = {}; rows.forEach(function (x) { (by[x.r.key] = by[x.r.key] || []).push(x); });
        var body = '';
        Object.keys(by).forEach(function (k) {
            by[k].forEach(function (x, i) {
                var st = resState(fc, x.r);
                body += '<tr>' + (i === 0 ? '<td class="l" rowspan="' + by[k].length + '">' + E(x.r.name) + '</td>' : '') + '<td class="l">' + E(x.mode) + '</td>'
                    + cols.map(function (c) { return '<td class="l">' + (st.feeds[c.colId] ? E(craText(fc, x.r, x.mode, c.colId)) : '--') + '</td>'; }).join('')
                    + '<td class="l">' + E(craText(fc, x.r, x.mode, '')) + '</td></tr>';
            });
        });
        return '<div class="apx-cap">Table B3 - Common Resource Analysis table for<br>failure condition "' + E(fc.desc) + '"</div><div class="apx-tw"><table data-sl-worksheet="1" class="apx-arp"><tr><th>Common Resource</th><th>Failure Mode</th>'
            + cols.map(function (c) { return '<th><span class="apx-sysn">' + E(c.sysName) + '</span>(' + E(c.funcId) + ')</th>'; }).join('') + '<th>AC-Level Effect on FC</th></tr>' + body + '</table></div>'
            + abbr([['AC', 'Aircraft'], ['FC', 'Failure Condition']]);
    }

    // ---- creating what is missing (the architecture's own rows, with its own duplicate rule) ----------------------------
    // The architecture's own system role: function, resource or both. Saying an existing function system is a resource
    // system (or the other way) makes it both; nothing is taken away.
    function setRole2(x, kind, existed) { if (!x || !kind) return; var cur = x.role || 'function'; if (kind === 'res' && cur === 'function') x.role = existed && arr(x.functions).length ? 'both' : 'resource'; else if (kind === 'fn' && cur === 'resource') x.role = 'both'; }
    function addSystem(name, kind) {
        name = T(name); if (!name) return { ok: false, why: 'Give the system a name.' };
        var list = g('systemsData'); if (!Array.isArray(list)) return { ok: false, why: 'No project is open.' };
        var N = root.SLNoDupes, clash = N && N.systemNameClash ? safe(function () { return N.systemNameClash(name, list, null); }, null) : null;
        if (clash) { setRole2(clash.system, kind, true); return { ok: true, system: clash.system, existed: true }; }
        var s = { id: 'sys-' + Date.now(), name: name, role: kind === 'res' ? 'resource' : 'function', asmCounter: 1, functions: [], fcim: [], extractedFCs: [], fha: [], req: [], asm: [] };
        list.push(s);
        try { if (root.PROGRAM_PLAN && root.PROGRAM_PLAN.initSystemPlan) root.PROGRAM_PLAN.initSystemPlan(s.id, null); } catch (_) {}
        return { ok: true, system: s };
    }
    function nextFuncId() {
        var max = 0; systems().forEach(function (s) { arr(s.functions).forEach(function (f) { var m = /^SF-(\d+)$/.exec(S(f && f.funcId)); if (m && +m[1] > max) max = +m[1]; }); });
        return 'SF-' + (max + 1);
    }
    function addFunction(sysId, name) {
        name = T(name); if (!name) return { ok: false, why: 'Give the function a name.' };
        var s = systems().filter(function (x) { return S(x.id) === S(sysId); })[0]; if (!s) return { ok: false, why: 'That system is not in the project.' };
        if (!Array.isArray(s.functions)) s.functions = [];
        var row = { internalId: Date.now() + Math.floor(Math.random() * 1000), funcId: '', funcName: name, funcDef: '', traceIds: [] };
        var N = root.SLNoDupes, clash = N && N.sysFunctionClash ? safe(function () { return N.sysFunctionClash(row, s.functions); }, null) : null;
        if (clash && clash.row && clash.row.funcId) return { ok: true, funcId: S(clash.row.funcId), existed: true };
        try { var an = fn('_slAutoNumber'); if (an) an('sysFunc', row); } catch (_) {}
        if (!row.funcId) row.funcId = nextFuncId();
        s.functions.push(row);
        return { ok: true, funcId: S(row.funcId) };
    }
    // v1.3 (Waqas, 17 Nov 2026: what is added at the aircraft level "should be added to system level analyses automatically",
    // "linked directly"): a system function that does the job for this aircraft function is traced up to it, the same
    // trace its own page writes. The record remembers the traces the Autopilot made, so unchecking takes that one off again.
    function fnRow(funcId) { var hit = null; systems().forEach(function (x) { arr(x.functions).forEach(function (y) { if (y && S(y.funcId) === S(funcId)) hit = y; }); }); return hit; }
    function traceUp(fc, funcId) {
        var x = fnRow(funcId); if (!x || !fc.subId) return false;
        if (!Array.isArray(x.traceIds)) x.traceIds = x.traceId ? [x.traceId] : [];
        if (x.traceIds.indexOf(fc.subId) !== -1) return false;
        x.traceIds.push(fc.subId);
        var r = rec(fc.key); if (!r.madeTrace || typeof r.madeTrace !== 'object') r.madeTrace = {};
        r.madeTrace['fn:' + funcId] = fc.subId;
        return true;
    }
    function traceDown(fc, colId) {
        var r = rec(fc.key), sub = r.madeTrace && r.madeTrace[colId]; if (!sub) return false;
        var x = fnRow(colId.replace(/^fn:/, '')); if (x && Array.isArray(x.traceIds)) x.traceIds = x.traceIds.filter(function (t) { return t !== sub; });
        delete r.madeTrace[colId];
        return true;
    }
    // A resource with who provides it: the system (made a resource system) and that system's function, created if missing.
    function addResourceFull(name, sysName, fnName) {
        var r = addResource(name); if (!r.ok) return r;
        if (!T(sysName)) return r;
        var list = g('resourcesData'), row = list.filter(function (x) { return x && S(x.internalId != null ? x.internalId : x.resId) === r.key; })[0];
        var s2 = addSystem(sysName, 'res'); if (!s2.ok) return s2;
        if (!Array.isArray(row.providedBy)) row.providedBy = [];
        if (row.providedBy.map(S).indexOf(S(s2.system.id)) === -1) row.providedBy.push(s2.system.id);
        if (T(fnName)) { var f2 = addFunction(s2.system.id, fnName); if (!f2.ok) return f2; row.providedByFn = f2.funcId; if (!Array.isArray(row.providedByFunctions)) row.providedByFunctions = []; if (row.providedByFunctions.indexOf(f2.funcId) === -1) row.providedByFunctions.push(f2.funcId); }
        r.system = s2.system;
        return r;
    }
    function addResource(name) {
        name = T(name); if (!name) return { ok: false, why: 'Give the resource a name.' };
        var list = g('resourcesData'); if (!Array.isArray(list)) return { ok: false, why: 'No project is open.' };
        var same = list.filter(function (r) { return r && T(r.name).toLowerCase() === name.toLowerCase(); })[0];
        if (same) return { ok: true, key: S(same.internalId != null ? same.internalId : same.resId), existed: true };
        var r = { internalId: 'res-' + Date.now(), resId: 'RES-' + String(list.length + 1).padStart(3, '0'), name: name, type: 'Other', providedBy: [], consumedBy: [], consumedBySystems: [] };
        list.push(r);
        return { ok: true, key: S(r.internalId) };
    }

    // ---- what the engineer does -------------------------------------------------------------------------------------------
    var ui = { ap: 'idp', stepOf: { idp: 0 }, fc: null, step: 0, eff: 0, old: false, blocked: '', signMiss: false, open: {}, kind: {}, draft: {} };
    // The MAC and CoFFE Autopilots register here: { name, steps: [title], render(i, fc), click(action, arg, el, fc), change(action, arg, el, fc), status(fc) }
    var EXT = {}, ORDER = ['idp', 'mac', 'cof'];
    function register(key, def) { EXT[key] = def; if (ORDER.indexOf(key) === -1) ORDER.push(key); try { rerender(); } catch (_) {} }
    function apName(k) { return k === 'idp' ? 'Interdependence' : (EXT[k] && EXT[k].name) || k; }
    function apSteps(k) { return k === 'idp' ? STEPS : (EXT[k] && EXT[k].steps) || []; }
    function apStatus(k, fc) { return k === 'idp' ? status(fc) : (EXT[k] && EXT[k].status ? safe(function () { return EXT[k].status(fc); }, { k: 'new' }) : { k: 'new' }); }
    function setAp(k) { if (k !== 'idp' && !EXT[k]) k = 'idp'; ui.takeAsk = null; ui.stepOf[ui.ap] = ui.step; ui.ap = k; ui.step = ui.stepOf[k] || 0; ui.blocked = ''; ui.signMiss = false; ui.sign = null; }
    function curFc() { var all = fcs(); if (!all.length) return null; var f = ui.fc && fcOf(ui.fc); if (!f) { f = all[0]; ui.fc = f.key; } return f; }
    function tick(fc, colId, role) {
        var col = colOf(colId); if (!col) return;
        var c = cellOf(fc, col), r = rec(fc.key);
        ui.blocked = '';
        if (c.on && c.locked) {
            // a link the Autopilot made itself comes off with the check; any other link has to be fixed where it lives
            if (!traceDown(fc, colId)) { ui.blocked = colId; return; }
            c = cellOf(fc, col);
            if (c.on && c.locked) { ui.blocked = colId; touched(fc.key); return; }
        }
        if (c.on) { delete r.cols[colId]; if (c.src === 'earlier') r.off[colId] = true; }
        else { r.cols[colId] = { role: role === 'fails' ? 'fails' : 'does', how: 'loss' }; delete r.off[colId]; if (role !== 'fails') traceUp(fc, col.funcId); }
        touched(fc.key);
    }
    function setRole(fc, colId, role, how) {
        var r = rec(fc.key), cur = r.cols[colId] || { role: 'does', how: 'loss' };
        r.cols[colId] = { role: role || cur.role, how: how || cur.how };
        touched(fc.key);
    }
    function proposal(fc, colId, accept) { var r = rec(fc.key); if (accept) { r.cols[colId] = { role: 'does', how: 'loss' }; delete r.off[colId]; } else r.off[colId] = true; touched(fc.key); }
    function resRec(fc, r) { var me = rec(fc.key).res; if (!me[r.key]) { var st = resState(fc, r); me[r.key] = { on: st.on, feeds: {}, modes: st.modes }; } if (!me[r.key].feeds) me[r.key].feeds = {}; if (!Array.isArray(me[r.key].modes)) me[r.key].modes = []; return me[r.key]; }
    function resTick(fc, key) { var r = resources().filter(function (x) { return x.key === key; })[0]; if (!r) return; var st = resState(fc, r), me = resRec(fc, r); me.on = !st.on; touched(fc.key); }
    function feed(fc, key, colId) { var r = resources().filter(function (x) { return x.key === key; })[0]; if (!r) return; var st = resState(fc, r), me = resRec(fc, r); me.feeds[colId] = !st.feeds[colId]; touched(fc.key); }
    function mode(fc, key, m, onNow) { var r = resources().filter(function (x) { return x.key === key; })[0]; if (!r) return; var me = resRec(fc, r), i = me.modes.indexOf(m); if (onNow && i === -1) me.modes.push(m); if (!onNow && i !== -1) me.modes.splice(i, 1); me.modes.sort(function (a, b) { return MODES.indexOf(a) - MODES.indexOf(b); }); touched(fc.key); }
    function setCra(fc, k, text) { rec(fc.key).cra[k] = T(text); touched(fc.key); }
    function send(fc, name) {
        name = T(name); if (!name) return { ok: false, why: 'Type your name to sign before sending.' };
        var l = left(fc); if (l.length) return { ok: false, why: l[0] };
        var r = rec(fc.key), at = now();
        // what is sent is what was shown: every checked column is written down, the data's and the earlier table's too
        picked(fc).forEach(function (c) { var x = cellOf(fc, c); r.cols[c.colId] = { role: x.role, how: x.how, src: x.src, by: name, at: at }; });
        resources().forEach(function (x) { var st = resState(fc, x); if (st.on || (r.res[x.key] && r.res[x.key].on === false)) { r.res[x.key] = { on: st.on, feeds: st.feeds, modes: st.modes }; } });
        effectRows(fc).forEach(function (x) { [''].concat(picked(fc).map(function (c) { return c.colId; })).forEach(function (cid) { var t = craText(fc, x.r, x.mode, cid); if (t) r.cra[x.r.key + '|' + x.mode + '|' + cid] = t; }); });
        r.sent = { by: name, at: at, resStatus: resStatus(fc).k, resStatusText: resStatus(fc).t }; delete r.changedSince;
        // what was sent goes to the PASA and to the files that read today's table (apx_bridge.js)
        try { if (root.SLApxBridge && root.SLApxBridge.project) root.SLApxBridge.project(fc, 'idp'); } catch (e) { r.bridgeError = e && e.message ? e.message : String(e); }
        save();
        return { ok: true };
    }

    // ---- the page -----------------------------------------------------------------------------------------------------------
    var CSS = ''
        + '.apx{font-size:14px;line-height:1.45;color:var(--color-text-primary,#101216)}'
        + '.apx-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}'
        + '.apx-sw{display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;border:1.5px solid var(--color-border-strong,#14171C);border-radius:11px;overflow:hidden}'
        + '.apx-sw button{font:inherit;font-weight:600;border:0;background:transparent;color:inherit;padding:8px 16px;cursor:pointer;border-right:1.5px solid var(--color-border-strong,#14171C)}.apx-sw button:last-child{border-right:0}'
        + '.apx-sw button.on{background:var(--color-text-primary,#101216);color:var(--color-surface-1,#fff)}.apx-aps{display:grid;margin:0 0 12px;width:100%}.apx-aps button{font-size:15.5px;padding:11px 16px}'
        + '.apx-pills{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.apx-pill{border:1px solid var(--color-border,rgba(20,23,28,.82));border-radius:999px;padding:4px 12px;background:var(--color-surface-1,#fff);font-size:13px}'
        + '.apx-steps{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 12px}.apx-prog{flex:1;min-width:160px;height:8px;border-radius:99px;background:var(--color-surface-2,#F6F6F4);overflow:hidden;border:1px solid var(--color-border,rgba(20,23,28,.3))}.apx-prog i{display:block;height:100%;background:#1A6EF2}'
        + '.apx input,.apx select,.apx textarea{margin:0}'
        + '.apx-urow2{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:8px}@media (max-width:760px){.apx-urow2{grid-template-columns:1fr}}'
        + '.apx-ask{border:2px solid #1A6EF2;border-radius:14px;padding:16px 18px;background:rgba(26,110,242,.05);display:flex;flex-direction:column;gap:10px}.apx-askq{font-size:17px;font-weight:700}'
        + '.apx-askrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:center}.apx-askrow.one{grid-template-columns:minmax(200px,340px) minmax(0,1fr)}.apx-kind{display:grid;width:100%}.apx-kind button{padding:10px 14px;font-size:15px}'
        + 'table.apx-arp th.l{min-width:210px}table.apx-arp th .apx-prov{display:block;font-weight:400;text-transform:none;letter-spacing:0;font-size:11.5px;margin-top:2px}@media (max-width:760px){.apx-askrow,.apx-askrow.one{grid-template-columns:1fr}}'
        + '.apx select{font:inherit;color:inherit;padding:8px 12px;border:1px solid var(--color-border-strong,#14171C);border-radius:9px;background-color:var(--color-surface-1,#fff);max-width:100%}'
        + '.apx select.apx-big{font-size:16px;padding:12px 14px;width:100%;border-width:1.5px;border-radius:12px;font-weight:600}'
        + '.apx input[type=text]{font:inherit;color:inherit;padding:8px 10px;border:1px solid var(--color-border-strong,#14171C);border-radius:9px;background:var(--color-surface-1,#fff);width:100%;box-sizing:border-box}'
        + '.apx-card{background:var(--color-surface-1,#fff);border:1px solid var(--color-border,rgba(20,23,28,.82));border-radius:14px;padding:20px 22px;margin:0 0 16px}'
        + '.apx-q{font-size:22px;font-weight:700;margin:0 0 6px;letter-spacing:-.01em}.apx-help{margin:0 0 16px;font-size:14.5px}'
        + '.apx-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:14px}.apx-fact{border:1px solid var(--color-border,rgba(20,23,28,.3));border-radius:10px;padding:10px 12px;background:var(--color-surface-2,#F6F6F4)}.apx-fact b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}'
        + '.apx-ticks{display:flex;flex-direction:column;gap:8px}'
        + '.apx-tick{display:grid;grid-template-columns:26px minmax(160px,1.1fr) minmax(0,1.6fr);gap:12px;align-items:center;border:1.5px solid var(--color-border,rgba(20,23,28,.3));border-radius:12px;padding:10px 14px;background:var(--color-surface-1,#fff)}'
        + '.apx-tick.on{border-color:#1A6EF2;background:rgba(26,110,242,.07)}'
        + '.apx-box{width:24px;height:24px;border-radius:7px;border:2px solid var(--color-text-primary,#101216);display:grid;place-items:center;cursor:pointer;background:var(--color-surface-1,#fff);padding:0}'
        + '.apx-tick.on .apx-box{background:#1A6EF2;border-color:#1A6EF2}.apx-tick.on .apx-box::after{content:"";width:11px;height:6px;border-left:3px solid #fff;border-bottom:3px solid #fff;transform:rotate(-45deg) translate(1px,-1px)}'
        + '.apx-nm{font-weight:700;font-size:15px}.apx-why{font-size:13px}'
        + '.apx-tag{display:inline-block;font-size:11.5px;font-weight:700;border:1px solid currentColor;border-radius:6px;padding:1px 6px;margin-right:6px}'
        + '.apx-fold{border:1px solid var(--color-border,rgba(20,23,28,.3));border-radius:12px;margin:0 0 8px;background:var(--color-surface-1,#fff)}.apx-fold>summary{cursor:pointer;padding:10px 14px;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:10px}.apx-fold>summary::-webkit-details-marker{display:none}.apx-fold>summary::after{content:"\\25BE"}.apx-fold[open]>summary::after{content:"\\25B4"}.apx-fold>div{padding:0 12px 12px}'
        + '.apx-add{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(0,1fr) auto;gap:8px;align-items:center;border:1.5px dashed var(--color-border-strong,#14171C);border-radius:12px;padding:10px 12px;margin-top:10px}'
        + '.apx-btn{font:inherit;font-weight:600;color:inherit;border:1.5px solid var(--color-border-strong,#14171C);background:var(--color-surface-1,#fff);border-radius:11px;padding:9px 16px;cursor:pointer}.apx-btn.p{background:#1A6EF2;border-color:#1A6EF2;color:#fff}.apx-btn.big{font-size:16px;padding:13px 22px;border-radius:13px}.apx-btn:disabled{opacity:.4;cursor:default}'
        + '.apx-nav{display:flex;justify-content:space-between;gap:10px;margin-top:6px;flex-wrap:wrap}'
        + '.apx-note{border-left:4px solid #1A6EF2;background:rgba(26,110,242,.07);padding:10px 14px;border-radius:8px;margin:12px 0}.apx-note.warn{border-left-color:#9A5B00;background:rgba(154,91,0,.08)}.apx-note.bad{border-left-color:#B42318;background:rgba(180,35,24,.07)}.apx-note.good{border-left-color:#0B7A3E;background:rgba(11,122,62,.08)}'
        + '.apx-eff{display:grid;grid-template-columns:minmax(180px,260px) minmax(0,1fr);gap:10px 14px;align-items:center}.apx-eff select{width:100%}'
        + '.apx-modes{display:flex;flex-direction:column;gap:10px}.apx-mode{display:grid;grid-template-columns:minmax(180px,260px) minmax(0,1fr);gap:12px;align-items:center;border:1px solid var(--color-border,rgba(20,23,28,.3));border-radius:12px;padding:12px 14px}'
        + '.apx-chips{display:flex;gap:8px;flex-wrap:wrap}.apx-chips label{display:flex;gap:6px;align-items:center;border:1.5px solid var(--color-border,rgba(20,23,28,.3));border-radius:10px;padding:6px 10px;cursor:pointer}.apx-chips label.on{border-color:#1A6EF2;background:rgba(26,110,242,.07)}'
        + '.apx-pager{display:flex;gap:10px;align-items:center;margin:0 0 14px;flex-wrap:wrap}'
        + '.apx-cap{text-align:center;font-weight:700;font-style:italic;margin:12px 0 6px;font-size:13.5px}.apx-tw{overflow-x:auto}'
        + 'table.apx-arp{border-collapse:collapse;width:100%;font-size:13px;background:var(--color-surface-1,#fff)}table.apx-arp th,table.apx-arp td{border:1px solid #101216;padding:6px 8px;text-align:center;vertical-align:middle}'
        + 'table.apx-arp th{background:#101216;color:#fff;font-weight:700;vertical-align:top;line-height:1.25}table.apx-arp td.l,table.apx-arp th.l{text-align:left}'
        + 'table.apx-arp th .apx-sysn{display:block;margin-bottom:4px;white-space:nowrap}'
        + 'table.apx-arp th.apx-diag{min-width:230px;background:linear-gradient(to top right,#101216 calc(50% - 1px),#fff 50%,#101216 calc(50% + 1px))}'
        + 'table.apx-grid td.apx-cell{cursor:pointer;font-weight:700;min-width:70px}table.apx-grid td.apx-cell:hover{background:rgba(26,110,242,.1)}'
        + '.apx-abbr{margin:10px 0 0;font-size:12.5px}.apx-abl{margin:4px 0 0;display:flex;flex-wrap:wrap;gap:4px 18px}.apx-abl b{margin-right:4px}'
        + '.apx-sent{border:2px solid #0B7A3E;border-radius:14px;padding:14px 16px;background:rgba(11,122,62,.07);margin-top:12px}'
        + '#view-interdep.apx-on>p,#view-interdep.apx-on .header-with-export .action-group{display:none}'
        + '@media (max-width:760px){.apx-tick,.apx-eff,.apx-mode,.apx-add{grid-template-columns:1fr}}'
        + 'body.theme-dark table.apx-arp th{background:#E8EAED;color:#101216;border-color:#E8EAED}body.theme-dark table.apx-arp td{border-color:#E8EAED}body.theme-dark table.apx-arp th.apx-diag{background:linear-gradient(to top right,#E8EAED calc(50% - 1px),#101216 50%,#E8EAED calc(50% + 1px))}';
    function style() { if (typeof document === 'undefined' || document.getElementById('apx-style')) return; var st = document.createElement('style'); st.id = 'apx-style'; st.textContent = CSS; document.head.appendChild(st); }

    var STEPS = ['Failure condition', 'Systems that do the job', 'Systems that could cause it by failing', 'Shared resources', 'How each resource can fail', 'What each failure does', 'Check and send to the PASA'];
    var EFFECTS = ['No effect', 'No effect. Loss of redundancy', 'Loss of redundancy', 'Partial loss of this function', 'Total loss of this function', 'Reduced performance', 'Wrong output'];
    function acEffects(r) { var p = providerNames(r)[0]; return ['The failure condition happens', 'Degraded, failure condition not reached' + (p ? '. See ' + p + ' SFHA' : ''), 'Loss of redundancy only' + (p ? '. See ' + p + ' SFHA' : ''), 'No effect']; }
    function card(q, help, body) { return '<div class="apx-card"><div class="apx-q">' + q + '</div>' + (help ? '<p class="apx-help">' + help + '</p>' : '') + body + '</div>'; }
    function preview(title, body) { return '<div class="apx-card">' + (title ? '<h4 style="margin:0 0 8px">' + title + '</h4>' : '') + body + '</div>'; }
    function fcWord(fc) { return lc(acFnName(fc.subId) || 'this function'); }

    function stepFc(fc) {
        var all = fcs();
        var opts = all.map(function (f) { var st = apStatus(ui.ap, f); return '<option value="' + E(f.key) + '"' + (f.key === fc.key ? ' selected' : '') + '>' + E(f.fcId + '  ' + f.desc + (f.sev ? ' (' + f.sev + ')' : '') + (st.k === 'sent' ? '  · sent to the PASA' : st.k === 'changed' ? '  · changed since it was sent' : st.k === 'started' ? '  · started' : '')) + '</option>'; }).join('');
        var body = '<select class="apx-big" data-apx-fc="1" aria-label="Failure condition">' + opts + '</select>'
            + '<div class="apx-facts"><div class="apx-fact"><b>Aircraft function</b>' + E(acFnLabel(fc)) + '</div><div class="apx-fact"><b>Failure condition ID</b>' + E(fc.fcId) + '</div><div class="apx-fact"><b>Description</b>' + E(fc.desc) + '</div><div class="apx-fact"><b>Classification</b>' + E(fc.sev || 'Not classified') + (fc.phases ? ', ' + E(fc.phases) : '') + '</div></div>';
        return card('Which failure condition are you working on?', (ui.ap === 'idp' ? 'You will pick the systems and shared resources behind it. ' : 'The three Autopilots work on the same failure condition. ') + 'Each failure condition is listed once, as its most conservative case.', body);
    }
    function tickRow(fc, c, stepRole) {
        var x = cellOf(fc, c), right = '';
        if (x.src === 'data') right = '<span class="apx-tag">' + (((peek(fc.key) || {}).madeTrace || {})[c.colId] ? 'Linked here' : 'From the project') + '</span>' + E(x.why) + (ui.blocked === c.colId ? '<div class="apx-note bad" style="margin:8px 0 0">Can\'t uncheck: the project says ' + E(x.detail || x.why) + '. Fix that link first, then it can come off this table.</div>' : '');
        else if (x.src === 'earlier') right = '<span class="apx-tag">Earlier work</span>' + E(x.why);
        else if (x.proposal) right = '<span class="apx-tag">AI suggests</span>' + E(x.proposal.why || 'it feeds this failure condition') + ' <button class="apx-btn" data-apx-prop="' + E(c.colId) + '|1">Accept</button> <button class="apx-btn" data-apx-prop="' + E(c.colId) + '|0">Dismiss</button>';
        if (x.on && stepRole === 'fails') right = '<select data-apx-how="' + E(c.colId) + '" aria-label="How it causes it"><option value="loss"' + (x.how === 'loss' ? ' selected' : '') + '>By not working (loss)</option><option value="malfunction"' + (x.how === 'malfunction' ? ' selected' : '') + '>By doing the wrong thing (malfunction)</option></select> ' + right;
        return '<div class="apx-tick' + (x.on ? ' on' : '') + '"><button type="button" class="apx-box" data-apx-tick="' + E(c.colId) + '" aria-label="' + (x.on ? 'Uncheck ' : 'Check ') + E(c.fnName) + '" aria-pressed="' + (x.on ? 'true' : 'false') + '"></button><span class="apx-nm">' + E(c.fnName) + ' <span class="apx-tag" style="font-weight:600">' + E(c.funcId) + '</span></span><span class="apx-why">' + right + '</span></div>';
    }
    function dl(id, names) { return '<datalist id="' + id + '">' + names.map(function (n) { return '<option value="' + E(n) + '"></option>'; }).join('') + '</datalist>'; }
    // The ask: each system and its function, and whether it is a resource system. Then what the project already holds.
    function askSystem(fc, stepRole) {
        var k = ui.kind[stepRole] || '', d = ui.draft, typed = sysByName(d.name), known = typed ? (typed.role === 'resource' ? 'res' : typed.role === 'both' ? '' : '') : '';
        if (!k && known) k = known;
        var sw = '<div class="apx-sw apx-kind" role="group" aria-label="What kind of system it is"><button type="button" class="' + (k === 'fn' ? 'on' : '') + '" data-apx-kind="' + stepRole + '|fn">' + (stepRole === 'fails' ? 'It causes it by failing' : 'It does this job') + '</button><button type="button" class="' + (k === 'res' ? 'on' : '') + '" data-apx-kind="' + stepRole + '|res">It is a resource system</button></div>';
        return '<div class="apx-ask"><div class="apx-askq">Add a system and its function</div>'
            + '<div class="apx-askrow"><input type="text" list="apx-dl-sys" data-apx-newsys="name" value="' + E(d.name || '') + '" placeholder="System, for example: Wheel Brake" aria-label="System name"><input type="text" data-apx-newsys="fn" value="' + E(d.fn || '') + '" placeholder="Its function, for example: decelerate wheels on ground" aria-label="System function"></div>'
            + '<div class="apx-askrow one"><div><b>Is it a resource system?</b><div style="font-size:12.5px">A resource system supplies something other systems need, like electrical or hydraulic power. It goes in the shared resources table, not in this one.</div></div>' + sw + '</div>'
            + (k === 'res' ? '<div class="apx-askrow one"><b>What it supplies</b><input type="text" list="apx-dl-res" data-apx-newsys="res" value="' + E(d.res || '') + '" placeholder="The resource, as your design names it, for example: 28 VDC Bus A" aria-label="The resource it supplies"></div>' : '')
            + '<div><button class="apx-btn p" data-apx-addsys="' + stepRole + '">' + (k === 'res' ? 'Add it as a resource' : 'Add and check') + '</button></div>'
            + dl('apx-dl-sys', systems().map(function (x) { return T(x.name || x.id); })) + dl('apx-dl-res', resources().map(function (r) { return r.name; }))
            + '<p style="margin:6px 0 0;font-size:12.5px">A system and its function are added to the architecture with their names, and become the starting point for that system\'s FHA and PSSA. A name already in the project is used, never added twice.</p></div>';
    }
    function sysLists(fc, stepRole) {
        var cols = allCols(), other = stepRole === 'does' ? 'fails' : 'does', h = askSystem(fc, stepRole), lists = '', resNames = [];
        systems().forEach(function (s) {
            var all = cols.filter(function (c) { return c.sysId === S(s.id); }), mine = all.filter(function (c) { var x = cellOf(fc, c); return !(x.on && x.role === other); });
            var onN = mine.filter(function (c) { return cellOf(fc, c).on; }).length, sug = mine.some(function (c) { return cellOf(fc, c).proposal; });
            // a resource system is not offered as a column (it is in step 4), unless one of its functions is already checked here
            if (isResSys(s) && !all.some(function (c) { return cellOf(fc, c).on; })) { resNames.push(T(s.name || s.id)); return; }
            var k = S(s.id), open = ui.open[k] != null ? ui.open[k] : (onN > 0 || sug);
            lists += '<details class="apx-fold" data-apx-sys="' + E(k) + '"' + (open ? ' open' : '') + '><summary><span>' + E(T(s.name || s.id)) + ' (' + mine.length + ' function' + (mine.length === 1 ? '' : 's') + (onN ? ', ' + onN + ' checked' : '') + ')</span></summary><div><div class="apx-ticks">'
                + mine.map(function (c) { return tickRow(fc, c, stepRole); }).join('')
                + '</div><div class="apx-add" style="grid-template-columns:auto minmax(0,1fr) auto"><b>New function</b><input type="text" data-apx-newfn="' + E(k) + '" placeholder="Its name, for example: decelerate wheels on ground" aria-label="New function of ' + E(T(s.name)) + '"><button class="apx-btn" data-apx-addfn="' + E(k) + '|' + stepRole + '">Create and check</button></div></div></details>';
        });
        if (lists) h += '<p style="margin:18px 0 8px;font-weight:700">Already in the project: check what applies</p>' + lists;
        if (resNames.length) h += '<p style="margin:10px 0 0;font-size:12.5px">Resource systems are not listed here. They are in the shared resources step: ' + E(resNames.join(', ')) + '.</p>';
        return h;
    }
    function stepDoes(fc) {
        var ai = fn('idpAiSweep') ? '<p><button class="apx-btn" data-apx-ai="1">AI draft: suggest the systems for this failure condition</button> <span style="font-size:12.5px">Suggestions show here to accept or dismiss. Nothing is checked for you.</span></p>' : '';
        return card('Which systems do the job?', 'Add each system that helps ' + E(fcWord(fc)) + ', with the function it performs. Only what you add or check is shown; nothing else appears anywhere.', waysBar(fc) + sysLists(fc, 'does') + propList(fc, function (it) { return it.t === 'sys' && it.kind === 'does'; }) + ai) + preview('What the PASA will show', tableQ41(fc));
    }
    function stepFails(fc) {
        return card('Which other systems could cause it by failing?', 'Some systems are not part of the job but still matter. Flaps that don\'t extend mean a faster landing. Engines stuck at high thrust fight the brakes. Add them with their function, and say how.', waysBar(fc) + sysLists(fc, 'fails') + propList(fc, function (it) { return it.t === 'sys' && it.kind === 'fails'; })) + preview('What the PASA will show', tableQ41(fc));
    }
    function cmpHtml(fc, r) {
        var b = resBasis(fc, r), one = resOne(fc, r);
        if (b.basis && b.basis.src === 'doc' && !(b.cmp && b.cmp.state === 'differs')) return '<div style="margin-top:6px;font-size:12.5px"><span class="apx-tag">Read from the document</span>' + E(b.basis.doc) + (b.basis.where ? ', ' + E(b.basis.where) : '') + (b.basis.quote ? ': "' + E(b.basis.quote) + '"' : '') + ', accepted by ' + E(b.basis.by) + '</div>';
        return '<div class="apx-urow2" style="margin-top:6px"><select data-apx-rcmp="' + E(r.key) + '" aria-label="Compared with the architecture document"><option value="">Assumed: not compared with the architecture document yet</option><option value="same"' + (one === 'backed' ? ' selected' : '') + '>Matches the architecture document</option><option value="differs"' + (one === 'differs' ? ' selected' : '') + '>Differs from it</option></select><input type="text" data-apx-rcmpref="' + E(r.key) + '" value="' + E(b.cmp ? b.cmp.ref : '') + '" placeholder="Document, section or page" aria-label="Reference"></div>';
    }
    function stepRes(fc) {
        var rs = resources(), d = ui.draft;
        var ask = '<div class="apx-ask"><div class="apx-askq">Add a shared resource and who provides it</div>'
            + '<div class="apx-askrow one"><b>The resource</b><input type="text" list="apx-dl-res" data-apx-newres="name" value="' + E(d.rname || '') + '" placeholder="As your design names it, for example: 28 VDC Bus A, or Hydraulic System A" aria-label="Resource name"></div>'
            + '<div class="apx-askrow"><input type="text" list="apx-dl-sys" data-apx-newres="sys" value="' + E(d.rsys || '') + '" placeholder="The system that provides it, for example: Electrical Power" aria-label="Providing system"><input type="text" data-apx-newres="fn" value="' + E(d.rfn || '') + '" placeholder="That system\'s function, for example: distribute electrical power" aria-label="Providing function"></div>'
            + '<div><button class="apx-btn p" data-apx-addres="1">Add and check</button></div>'
            + dl('apx-dl-sys', systems().map(function (x) { return T(x.name || x.id); })) + dl('apx-dl-res', rs.map(function (r) { return r.name; }))
            + '<p style="margin:6px 0 0;font-size:12.5px">The providing system becomes a resource system in the architecture, with that function, and that is where its own FHA starts. Which bus or supply feeds which function comes from your review of the architecture; the tool does not fill in any of it.</p></div>';
        var h = waysBar(fc) + ask + propList(fc, function (it) { return it.t === 'res' || it.kind === 'resource'; }) + (rs.length ? '<p style="margin:18px 0 8px;font-weight:700">Already in the project: check what applies</p><div class="apx-ticks">' + rs.map(function (r) {
            var st = resState(fc, r), prov = providerText(r);
            return '<div class="apx-tick' + (st.on ? ' on' : '') + '"><button type="button" class="apx-box" data-apx-res="' + E(r.key) + '" aria-label="' + (st.on ? 'Uncheck ' : 'Check ') + E(r.name) + '" aria-pressed="' + (st.on ? 'true' : 'false') + '"></button><span class="apx-nm">' + E(r.name) + '</span><span class="apx-why">' + (prov ? 'Provided by ' + E(prov) + '. ' : 'No provider set yet: add it above with the same name. ') + (st.hint.length && !st.on ? '<span class="apx-tag">Hint</span>the resource register says ' + E(st.hint.join(', ')) + ' use' + (st.hint.length === 1 ? 's' : '') + ' it, at system level. It does not say which function' : '') + (st.on ? cmpHtml(fc, r) : '') + '</span></div>';
        }).join('') + '</div>' : '');
        if (resPicked(fc).length && picked(fc).length) h += '<p style="margin:18px 0 8px;font-weight:700">Click a box to say which system function each resource feeds. Nothing is filled in for you. This is the table exactly as the PASA will show it.</p>' + tableQ42(fc, true);
        if (resPicked(fc).length) { var rst = resStatus(fc); h += '<div class="apx-note ' + (rst.k === 'backed' ? 'good' : 'warn') + '">Resources: <b>' + E(rst.t) + '</b></div>'; }
        return card('Which shared resources feed these systems?', 'Shared resources are things many systems need, like hydraulic power, electrical power or air data. Add each one that matters for this failure condition, as specific as your design is, and say who provides it.', h);
    }
    function stepModes(fc) {
        var rs = resPicked(fc);
        if (!rs.length) return card('How can each resource fail?', 'Check a shared resource first.', '');
        return card('How can each resource fail?', 'Check each way it can fail. Partial loss means some of it is lost (for example one of three hydraulic systems). Total loss means all of it.',
            '<div class="apx-modes">' + rs.map(function (r) { var st = resState(fc, r); return '<div class="apx-mode"><b>' + E(r.name) + '</b><div class="apx-chips">' + MODES.map(function (m) { var o = st.modes.indexOf(m) !== -1; return '<label class="' + (o ? 'on' : '') + '"><input type="checkbox" data-apx-mode="' + E(r.key + '|' + m) + '"' + (o ? ' checked' : '') + '> ' + m + '</label>'; }).join('') + '</div></div>'; }).join('') + '</div>');
    }
    function effectSelect(key, cur, opts, placeholder) {
        var own = cur && opts.indexOf(cur) === -1;
        return '<select data-apx-cra="' + E(key) + '"><option value="">' + E(placeholder) + '</option>' + opts.map(function (o) { return '<option' + (o === cur ? ' selected' : '') + '>' + E(o) + '</option>'; }).join('') + '<option value="__own"' + (own ? ' selected' : '') + '>Write my own</option></select>'
            + (own || ui.own === key ? '<input type="text" style="margin-top:6px" data-apx-craown="' + E(key) + '" value="' + E(own ? cur : '') + '" placeholder="In your words" aria-label="In your words">' : '');
    }
    function stepEffects(fc) {
        var rows = effectRows(fc);
        if (!rows.length) return card('What does each failure do?', 'Say how each checked resource can fail first.', '');
        ui.eff = Math.max(0, Math.min(ui.eff, rows.length - 1));
        var x = rows[ui.eff], st = resState(fc, x.r), cols = picked(fc), k = x.r.key + '|' + x.mode + '|';
        var body = '<div class="apx-pager"><button class="apx-btn" data-apx-eff="-1"' + (ui.eff === 0 ? ' disabled' : '') + '>Previous</button><b>' + (ui.eff + 1) + ' of ' + rows.length + '</b><button class="apx-btn" data-apx-eff="1"' + (ui.eff === rows.length - 1 ? ' disabled' : '') + '>Next failure</button></div><div class="apx-eff">'
            + cols.map(function (c) {
                return '<div><b>' + E(c.sysName) + '</b><div style="font-size:12.5px">' + E(c.fnName) + '</div></div><div>' + (st.feeds[c.colId] ? effectSelect(k + c.colId, craText(fc, x.r, x.mode, c.colId), EFFECTS, 'Pick what happens') : '-- <span style="font-size:12.5px">(not fed by ' + E(x.r.name) + ', so nothing to say)</span>') + '</div>';
            }).join('')
            + '<div style="padding-top:8px"><b>For the whole aircraft</b></div><div style="padding-top:8px">' + effectSelect(k, craText(fc, x.r, x.mode, ''), acEffects(x.r), 'Pick the aircraft-level effect') + '</div></div>';
        return card('If ' + E(x.r.name) + ' has a ' + E(lc(x.mode)) + ', what happens?', 'Pick what happens to each system function it feeds, then what that adds up to for the aircraft.', body) + preview('What the PASA will show', tableB3(fc));
    }
    // v1.4: where an answer comes from. The systems, functions and resources come from a person's review of the
    // architecture: by hand, or the AI reads a design document or the engineer's words and proposes them, and a person
    // accepts each one. Nothing a proposal says is in the tables until it is accepted.
    function docs() { var api = root.SafetyLabSourceDocs, l = api && api.list ? safe(function () { return api.list(); }, []) : []; return arr(l).filter(function (d) { return d && T(d.name) && T(d.text); }); }
    function parseJson(text) { try { return JSON.parse(S(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch (_) {} try { var m = S(text).match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch (_) {} return null; }
    var AI_IDP = 'You read aircraft design material for a safety engineer working ONE aircraft failure condition (the interdependence and common resource analysis of ARP4761A). Use ONLY what the supplied text says. Return two lists. "systems": each system that performs the aircraft function, or could cause the failure condition by failing, or supplies a shared resource, as {"system","function" (that system\'s function, in the text\'s words),"kind" (exactly one of: does, fails, resource),"how" (for fails: loss or malfunction),"supplies" (for a resource system: the resource, named as the text names it),"quote" (the words this rests on, verbatim),"where" (section or page)}. "resources": each shared resource (electrical power, hydraulic power, data, air and so on), as specific as the text is (a named bus, a named hydraulic system), as {"resource","providedBySystem","providedByFunction","feeds":[{"system","function"}],"quote","where"}; list in "feeds" only what the text says it feeds. If the text does not say something, leave it out; never guess. Reply with JSON only: {"systems":[...],"resources":[...]}.';
    function cleanProposals(j) {
        var out = [], n = 0, q = function (x) { return { quote: T(x.quote).slice(0, 400), where: T(x.where).slice(0, 120) }; };
        arr(j && j.systems).forEach(function (x) {
            if (!x || !T(x.system) || !T(x['function'])) return;
            var kind = ['does', 'fails', 'resource'].indexOf(x.kind) !== -1 ? x.kind : null; if (!kind) return;
            if (kind === 'resource' && !T(x.supplies)) return;
            out.push(Object.assign({ id: 'p' + (++n), t: 'sys', system: T(x.system).slice(0, 80), fn: T(x['function']).slice(0, 120), kind: kind, how: x.how === 'malfunction' ? 'malfunction' : 'loss', supplies: T(x.supplies).slice(0, 80) }, q(x)));
        });
        arr(j && j.resources).forEach(function (x) {
            if (!x || !T(x.resource)) return;
            out.push(Object.assign({ id: 'p' + (++n), t: 'res', resource: T(x.resource).slice(0, 80), system: T(x.providedBySystem).slice(0, 80), fn: T(x.providedByFunction).slice(0, 120), feeds: arr(x.feeds).filter(function (f) { return f && T(f.system); }).map(function (f) { return { system: T(f.system).slice(0, 80), fn: T(f['function']).slice(0, 120) }; }) }, q(x)));
        });
        return out;
    }
    function propose(fc, mode, payload) {
        var loader = typeof root.slLoadAI === 'function' ? Promise.resolve().then(function () { return root.slLoadAI(); }).catch(function () {}) : Promise.resolve();
        return loader.then(function () {
            var P = root.SafetyLabAI; if (!(P && typeof P.complete === 'function')) throw new Error('The AI is not available on this plan or in this session. Add the systems and resources by hand.');
            var text = mode === 'doc' ? S(payload && payload.text).slice(0, 60000) : S(payload && payload.text).slice(0, 8000);
            if (!T(text)) throw new Error(mode === 'doc' ? 'Pick a document with readable text first.' : 'Describe the architecture in your own words first.');
            var ctx = { failureCondition: fc.fcId + ' ' + fc.desc, aircraftFunction: acFnLabel(fc), phases: fc.phases, source: mode === 'doc' ? { document: payload.name, text: text } : { engineerSays: text } };
            return P.complete({ feature: 'apx.idp.propose', system: AI_IDP, messages: [{ role: 'user', content: JSON.stringify(ctx, null, 1) }], maxTokens: 4000, temperature: 0 }).then(function (r) {
                var j = parseJson(r && r.text); if (!j) throw new Error('The AI\'s reply could not be read. Nothing was proposed.');
                var items = cleanProposals(j);
                rec(fc.key).prop = { items: items, src: mode === 'doc' ? 'doc' : 'told', doc: mode === 'doc' ? T(payload.name) : '', model: (r && r.model) || '', at: now() };
                try { if (root.AiFidelity && root.AiFidelity.recordProvenance) root.AiFidelity.recordProvenance({ kind: 'draft', feature: 'apx.idp.propose', section: fc.fcId, model: (r && r.model) || '' }); } catch (_) {}
                save();
                return { n: items.length };
            });
        });
    }
    function proposals(fc) { var r = peek(fc.key); return r && r.prop && Array.isArray(r.prop.items) ? r.prop : null; }
    function basisOf(pr, it) { return { src: pr.src, doc: pr.doc, where: it.where, quote: it.quote, by: who(), at: now() }; }
    function findCol(fc, sysName, fnName) {
        var cols = picked(fc), sn = T(sysName).toLowerCase(), fnn = T(fnName).toLowerCase();
        var same = cols.filter(function (c) { return c.sysName.toLowerCase() === sn; });
        var exact = same.filter(function (c) { return c.fnName.toLowerCase() === fnn; })[0];
        return exact || (same.length === 1 ? same[0] : null);
    }
    function acceptProposal(fc, id) {
        var pr = proposals(fc); if (!pr) return { ok: false, why: 'That proposal is gone.' };
        var it = pr.items.filter(function (x) { return x.id === id; })[0]; if (!it) return { ok: false, why: 'That proposal is gone.' };
        var r = rec(fc.key), res = null;
        if (it.t === 'sys' && it.kind !== 'resource') {
            var a = addSystem(it.system, 'fn'); if (!a.ok) return a;
            var b = addFunction(a.system.id, it.fn); if (!b.ok) return b;
            r.cols['fn:' + b.funcId] = { role: it.kind === 'fails' ? 'fails' : 'does', how: it.kind === 'fails' ? it.how : 'loss' };
            if (it.kind === 'does') traceUp(fc, b.funcId);
            if (!r.basis || typeof r.basis !== 'object') r.basis = {}; r.basis['fn:' + b.funcId] = basisOf(pr, it);
        } else {
            var c = addResourceFull(it.t === 'res' ? it.resource : it.supplies, it.system, it.fn); if (!c.ok) return c;
            res = resources().filter(function (x) { return x.key === c.key; })[0];
            if (res) {
                var me = resRec(fc, res); me.on = true;
                arr(it.feeds).forEach(function (f) { var col = findCol(fc, f.system, f.fn); if (col) me.feeds[col.colId] = true; });
                if (!r.rbasis || typeof r.rbasis !== 'object') r.rbasis = {}; r.rbasis[res.key] = basisOf(pr, it);
            }
        }
        pr.items = pr.items.filter(function (x) { return x.id !== id; });
        touched(fc.key);
        return { ok: true };
    }
    function dismissProposal(fc, id) { var pr = proposals(fc); if (!pr) return; pr.items = pr.items.filter(function (x) { return x.id !== id; }); save(); }
    function propLine(fc, it, pr) {
        var from = (pr.src === 'doc' ? 'From ' + E(pr.doc) : 'From your words') + (it.where ? ', ' + E(it.where) : '') + (it.quote ? ': "' + E(it.quote) + '"' : '');
        var what = it.t === 'res' ? '<b>' + E(it.resource) + '</b>' + (it.system ? ', provided by ' + E(it.system) + (it.fn ? ' (' + E(lc(it.fn)) + ')' : '') : '') + (arr(it.feeds).length ? '. It feeds ' + E(it.feeds.map(function (f) { return f.system + (f.fn ? ' (' + lc(f.fn) + ')' : ''); }).join(', ')) : '')
            : '<b>' + E(it.system) + '</b>: ' + E(lc(it.fn)) + (it.kind === 'resource' ? '. A resource system that supplies <b>' + E(it.supplies) + '</b>' : it.kind === 'fails' ? '. Causes it by ' + (it.how === 'malfunction' ? 'doing the wrong thing' : 'failing') : '. Does the job');
        return '<div class="apx-note" data-apx-prop-item="' + E(it.id) + '"><span class="apx-tag">AI proposes</span>' + what + '.<div style="font-size:12.5px;margin-top:4px">' + from + '</div><div style="margin-top:8px"><button class="apx-btn p" data-apx-pacc="' + E(it.id) + '">Accept</button> <button class="apx-btn" data-apx-pdis="' + E(it.id) + '">Dismiss</button></div></div>';
    }
    function propList(fc, want) { var pr = proposals(fc); if (!pr) return ''; var items = pr.items.filter(want); return items.length ? '<div style="margin:12px 0 0">' + items.map(function (it) { return propLine(fc, it, pr); }).join('') + '</div>' : ''; }
    function waysBar(fc) {
        var dl2 = docs(), w = ui.way || 'hand';
        var h = '<div class="apx-sw" role="group" aria-label="Where it comes from" style="margin:0 0 12px">' + [['hand', 'Add it by hand'], ['doc', 'The AI reads a design document'], ['told', 'Tell the AI in your words']].map(function (x) { return '<button type="button" class="' + (w === x[0] ? 'on' : '') + '" data-apx-way="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
        if (w === 'doc') h += dl2.length ? '<div class="apx-add" style="grid-template-columns:auto minmax(0,1fr) auto;margin:0 0 12px"><b>Design document</b><select data-apx-aidoc="1" aria-label="Design document"><option value="">Pick the architecture description or the SDD</option>' + dl2.map(function (d) { return '<option' + (d.name === ui.aidoc ? ' selected' : '') + '>' + E(d.name) + '</option>'; }).join('') + '</select><button class="apx-btn" data-apx-aiprop="doc"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy === 'doc' ? 'The AI is reading it...' : 'Read it and propose') + '</button></div>' : '<div class="apx-note warn">This project has no source document with readable text yet. Add the architecture description or the SDD on the AI inputs page, then come back. Until then, add by hand or tell the AI in your words.</div>';
        if (w === 'told') h += '<div style="margin:0 0 12px"><textarea data-apx-told="1" rows="3" style="width:100%;box-sizing:border-box;font:inherit;padding:8px 10px;border:1px solid var(--color-border-strong,#14171C);border-radius:9px" placeholder="For example: wheel brakes, ground spoilers and thrust reversers stop the aircraft. Hydraulic System A feeds the brakes and the spoilers. 28 VDC Bus A feeds the brake control unit." aria-label="The architecture in your words">' + E(ui.told || '') + '</textarea><button class="apx-btn" style="margin-top:6px" data-apx-aiprop="told"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy === 'told' ? 'The AI is working it out...' : 'Propose from my words') + '</button></div>';
        if (w !== 'hand') h += '<p style="margin:0 0 12px;font-size:12.5px">The AI proposes systems, their functions and the shared resources, each with the words it rests on. Nothing is added until you accept it. Proposals show in the step they belong to.</p>';
        return h;
    }
    // The resources are Assumed until each is read from, or compared with, the architecture document.
    function resBasis(fc, r) { var x = peek(fc.key) || {}; return { basis: (x.rbasis || {})[r.key] || null, cmp: (x.rcmp || {})[r.key] || null }; }
    function resOne(fc, r) { var b = resBasis(fc, r); return b.cmp && b.cmp.state === 'differs' ? 'differs' : (b.cmp && b.cmp.state === 'same') || (b.basis && b.basis.src === 'doc') ? 'backed' : 'assumed'; }
    function resStatus(fc) {
        var rs = resPicked(fc); if (!rs.length) return { k: 'none', t: 'No shared resource is checked', word: '' };
        var st = rs.map(function (r) { return resOne(fc, r); }), nd = st.filter(function (x) { return x === 'differs'; }).length, na = st.filter(function (x) { return x === 'assumed'; }).length;
        if (nd) return { k: 'differs', t: 'Different from the architecture document on ' + nd + ' resource' + (nd > 1 ? 's' : ''), word: 'Different from the architecture document' };
        if (na) return { k: 'assumed', t: 'Assumed: ' + na + ' of ' + rs.length + ' resource' + (rs.length > 1 ? 's are' : ' is') + ' not compared with the architecture document yet', word: 'Assumed' };
        return { k: 'backed', t: 'Backed by the architecture document', word: 'Backed by the architecture document' };
    }
    function setCompare(fc, key, state, ref) { var r = rec(fc.key); if (!r.rcmp || typeof r.rcmp !== 'object') r.rcmp = {}; if (!state) delete r.rcmp[key]; else r.rcmp[key] = { state: state === 'differs' ? 'differs' : 'same', ref: T(ref != null ? ref : (r.rcmp[key] || {}).ref), by: who(), at: now() }; touched(fc.key); }

    // v1.4 (Waqas, 17 Nov 2026: "all three"): what was sent can be taken back out of the PASA and of today's tables, from the
    // page, in two clicks. The answers here stay; the system FHA lines and the links stay.
    function takeOut(fc, which) {
        if (!(root.SLApxBridge && root.SLApxBridge.unproject)) return '';
        if (ui.takeAsk === which) return '<div class="apx-note warn" data-apx-takeask="' + which + '"><b>Take it back out?</b> This takes what was sent for ' + E(fc.fcId) + ' out of the PASA and out of today\'s tables, and puts back what was there before. Your answers here stay, and so do the lines added to the system FHAs and the links. <div style="margin-top:8px"><button class="apx-btn" data-apx-take="' + which + '|yes">Yes, take it out</button> <button class="apx-btn" data-apx-take="' + which + '|no">Keep it</button></div></div>';
        return '<p style="margin:10px 0 0"><button class="apx-btn" data-apx-take="' + which + '|ask">Take it back out of the PASA</button></p>';
    }
    function doTakeOut(fc, which) {
        var s0 = store(), r = s0[which] && s0[which][fc.key]; if (!r || !r.sent) return false;
        root.SLApxBridge.unproject(fc, which);
        r.tookOut = { by: who(), at: now(), was: r.sent }; delete r.sent; delete r.changedSince;
        save(); return true;
    }
    function stepSend(fc) {
        var l = left(fc), st = status(fc), body, rs7 = resStatus(fc);
        body = l.length ? '<div class="apx-note warn">' + l.map(E).join('<br>') + '</div>' : '<div class="apx-note good">Everything is answered. These three tables go to the PASA exactly as shown.</div>';
        if (rs7.k !== 'none') body += '<div class="apx-note ' + (rs7.k === 'backed' ? 'good' : 'warn') + '">Resources: <b>' + E(rs7.t) + '</b></div>';
        if (st.k === 'sent') body += '<div class="apx-sent"><b>Sent to the PASA.</b> Signed by <b>' + E(st.by) + '</b> on ' + E(S(st.at).slice(0, 10)) + '; the name and date are recorded on every answer in it.</div>' + takeOut(fc, 'idp');
        else body += (st.k === 'changed' ? '<div class="apx-note warn">Something changed since this was sent. Send it again to bring the PASA up to date.</div>' : '')
            + '<div class="apx-eff" style="margin-top:14px"><div><b>Sign with your name</b></div><div><input type="text" data-apx-sign="1" value="' + E(ui.sign != null ? ui.sign : who()) + '" placeholder="One signature covers every answer for this failure condition" aria-label="Sign with your name"></div></div>'
            + (ui.signMiss ? '<div class="apx-note bad">' + E(ui.signMiss) + '</div>' : '')
            + '<button class="apx-btn p big" style="margin-top:12px" data-apx-send="1"' + (l.length ? ' disabled' : '') + '>' + (rs7.k === 'assumed' || rs7.k === 'differs' ? 'Send to the PASA, resources marked ' + E(rs7.word) : 'Send to the PASA') + '</button>';
        return card('Check and send to the PASA', 'This is exactly what the PASA will show. Nothing else gets added.', body) + preview('', tableQ41(fc)) + preview('', tableQ42(fc, false)) + preview('', tableB3(fc));
    }

    function html() {
        var fc = curFc();
        var bar = '<div class="apx-bar"><div class="apx-sw" role="group" aria-label="Which page"><button type="button" class="' + (ui.old ? '' : 'on') + '" data-apx-view="new">New Autopilot (preview)</button><button type="button" class="' + (ui.old ? 'on' : '') + '" data-apx-view="old">Today\'s page</button></div><span style="font-size:12.5px">Only our team sees this switch. Nothing reaches the PASA or today\'s tables until you send it.</span></div>';
        if (!fc) return '<div class="apx">' + bar + card('Nothing to work on yet', 'The Interdependence Autopilot needs at least one aircraft failure condition. Add them in the aircraft FHA first.', '') + '</div>';
        if (ui.ap !== 'idp' && !EXT[ui.ap]) setAp('idp');
        var STP = apSteps(ui.ap), aps = ORDER.filter(function (k) { return k === 'idp' || EXT[k]; });
        ui.step = Math.max(0, Math.min(ui.step, STP.length - 1));
        var st = apStatus(ui.ap, fc), i = ui.step;
        var h = '<div class="apx">' + bar
            + (aps.length > 1 ? '<div class="apx-sw apx-aps" role="group" aria-label="Which Autopilot">' + aps.map(function (k) { var sk = apStatus(k, fc).k; return '<button type="button" class="' + (k === ui.ap ? 'on' : '') + '" data-apx-ap="' + k + '">' + E(apName(k)) + (sk === 'sent' ? ' (sent)' : sk === 'changed' ? ' (changed)' : '') + '</button>'; }).join('') + '</div>' : '')
            + '<div class="apx-pills"><span class="apx-pill"><b>' + E(apName(ui.ap)) + ' Autopilot</b></span>'
            + (i > 0 ? '<span class="apx-pill">Working on <b>' + E(fc.fcId) + '</b> ' + E(fc.desc) + '</span>' + (fc.sev ? '<span class="apx-pill">' + E(fc.sev) + '</span>' : '') + (fc.phases ? '<span class="apx-pill">Phase: <b>' + E(fc.phases) + '</b></span>' : '') : '')
            + '<span class="apx-pill">' + (st.k === 'sent' ? 'Sent to the PASA' : st.k === 'changed' ? 'Changed since it was sent' : st.k === 'started' ? 'Started, not sent' : 'Not started') + '</span></div>'
            + '<div class="apx-steps"><select data-apx-jump="1" aria-label="Step" style="font-weight:600;border-width:1.5px">' + STP.map(function (t, k) { return '<option value="' + k + '"' + (k === i ? ' selected' : '') + '>Step ' + (k + 1) + ' of ' + STP.length + ': ' + E(t) + '</option>'; }).join('') + '</select><div class="apx-prog"><i style="width:' + Math.round((i + 1) / STP.length * 100) + '%"></i></div></div>';
        if (ui.ap === 'idp') h += [stepFc, stepDoes, stepFails, stepRes, stepModes, stepEffects, stepSend][i](fc);
        else if (i === 0) h += stepFc(fc);
        else { var body; try { body = EXT[ui.ap].render(i, fc); } catch (e) { body = card('This step could not be drawn', E(e && e.message ? e.message : e), ''); } h += body; }
        h += '<div class="apx-nav"><button class="apx-btn big" data-apx-nav="-1"' + (i === 0 ? ' disabled' : '') + '>Back</button><button class="apx-btn p big" data-apx-nav="1"' + (i === STP.length - 1 ? ' disabled' : '') + '>Next</button></div></div>';
        return h;
    }

    var _host = null, _orig = null;
    function mark(onNow) { try { var v = document.getElementById('view-interdep'); if (v) v.classList.toggle('apx-on', !!onNow); } catch (_) {} }
    // Drawing replaces the page; a field that loses focus as it is replaced may report its change mid-draw. That change
    // is taken, and the page is drawn once more after, never inside itself.
    var _drawing = false, _again = false;
    function draw() {
        if (!_host) return;
        if (_drawing) { _again = true; return; }
        _drawing = true;
        try { style(); mark(true); var y = typeof root.scrollY === 'number' ? root.scrollY : 0; _host.innerHTML = html(); try { root.scrollTo(0, y); } catch (_) {} }
        finally { _drawing = false; }
        if (_again) { _again = false; draw(); }
    }
    function val(sel) { var el = _host && _host.querySelector(sel); return el ? el.value : ''; }
    function onClick(e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-apx-view],[data-apx-ap],[data-apx-x],[data-apx-kind],[data-apx-take],[data-apx-way],[data-apx-aiprop],[data-apx-pacc],[data-apx-pdis],[data-apx-nav],[data-apx-tick],[data-apx-prop],[data-apx-res],[data-apx-feed],[data-apx-eff],[data-apx-addfn],[data-apx-addsys],[data-apx-addres],[data-apx-send],[data-apx-ai]') : null;
        if (!t || !_host || !_host.contains(t)) return;
        var d = t.dataset, fc = curFc();
        if (d.apxView) { ui.old = d.apxView === 'old'; if (ui.old && ui.ap === 'mac' && typeof root.switchTab === 'function') { root.switchTab('mac'); return; } rerender(); return; }
        if (!fc) return;
        if (d.apxAp) { setAp(d.apxAp); draw(); return; }
        if (d.apxWay) { ui.way = d.apxWay; draw(); return; }
        if (d.apxAiprop) {
            var pl = d.apxAiprop === 'doc' ? docs().filter(function (x) { return x.name === ui.aidoc; })[0] : { text: val('[data-apx-told]') || ui.told };
            if (d.apxAiprop === 'doc' && !pl) { toast('Pick the document first.', 'warning'); return; }
            ui.told = d.apxAiprop === 'told' ? pl.text : ui.told; ui.busy = d.apxAiprop; draw();
            propose(fc, d.apxAiprop, pl).then(function (r9) { ui.busy = ''; toast(r9.n ? 'The AI proposed ' + r9.n + ' item' + (r9.n > 1 ? 's' : '') + '. Accept or dismiss each one, in the step it belongs to.' : 'The AI found nothing it could rest a proposal on. Nothing was proposed.', r9.n ? 'info' : 'warning'); draw(); }, function (e9) { ui.busy = ''; toast(e9 && e9.message ? e9.message : String(e9), 'warning'); draw(); });
            return;
        }
        if (d.apxPacc) { var ra = acceptProposal(fc, d.apxPacc); if (!ra.ok) toast(ra.why, 'warning'); draw(); return; }
        if (d.apxPdis) { dismissProposal(fc, d.apxPdis); draw(); return; }
        if (d.apxTake) { var tk = d.apxTake.split('|'); if (tk[1] === 'ask') ui.takeAsk = tk[0]; else { if (tk[1] === 'yes' && doTakeOut(fc, tk[0])) toast('Taken back out. The PASA and today\'s tables are as they were before it was sent.'); ui.takeAsk = null; } draw(); return; }
        if (d.apxX != null && EXT[ui.ap] && EXT[ui.ap].click) { var xa = d.apxX.split('|'), xr; try { xr = EXT[ui.ap].click(xa[0], xa.slice(1).join('|'), t, fc); } catch (e) { toast(e && e.message ? e.message : String(e), 'warning'); xr = true; } if (xr && typeof xr.then === 'function') { xr.then(draw, function (e) { toast(e && e.message ? e.message : String(e), 'warning'); draw(); }); return; } if (xr !== false) draw(); return; }
        if (d.apxNav) { ui.step += Number(d.apxNav); ui.blocked = ''; draw(); try { _host.scrollIntoView({ block: 'start' }); } catch (_) {} return; }
        if (d.apxTick) tick(fc, d.apxTick, ui.step === 2 ? 'fails' : 'does');
        else if (d.apxProp) { var pp = d.apxProp.split('|'); proposal(fc, pp[0], pp[1] === '1'); }
        else if (d.apxRes) resTick(fc, d.apxRes);
        else if (d.apxFeed) { var fd = d.apxFeed.split('|'); feed(fc, fd[0], fd.slice(1).join('|')); }
        else if (d.apxEff) ui.eff += Number(d.apxEff);
        else if (d.apxAddfn) { var a = d.apxAddfn.split('|'), r1 = addFunction(a[0], val('[data-apx-newfn="' + a[0] + '"]')); if (!r1.ok) { toast(r1.why, 'warning'); return; } if (r1.existed) toast('That function is already in this system. It is checked here instead of being added again.'); ui.open[a[0]] = true; var c1 = cellOf(fc, colOf('fn:' + r1.funcId) || { colId: 'fn:' + r1.funcId, funcId: r1.funcId }); if (!c1.on) { rec(fc.key).cols['fn:' + r1.funcId] = { role: a[1] === 'fails' ? 'fails' : 'does', how: 'loss' }; if (a[1] !== 'fails') traceUp(fc, r1.funcId); } touched(fc.key); }
        else if (d.apxKind) { var kk = d.apxKind.split('|'); ui.kind[kk[0]] = kk[1]; }
        else if (d.apxAddsys) {
            var nm = T(val('[data-apx-newsys="name"]')), fnm = T(val('[data-apx-newsys="fn"]')), rnm = T(val('[data-apx-newsys="res"]')), known = sysByName(nm), kind = ui.kind[d.apxAddsys] || (known && known.role === 'resource' ? 'res' : '');
            ui.draft.name = nm; ui.draft.fn = fnm; ui.draft.res = rnm;
            if (!nm) { toast('Give the system its name.', 'warning'); return; }
            if (!fnm) { toast('Give the system its function too.', 'warning'); return; }
            if (!kind) { toast('Say whether it ' + (d.apxAddsys === 'fails' ? 'causes it by failing' : 'does this job') + ' or is a resource system.', 'warning'); return; }
            if (kind === 'res') {
                if (!rnm) { toast('Say what it supplies: the resource, as your design names it.', 'warning'); draw(); return; }
                var r5 = addResourceFull(rnm, nm, fnm); if (!r5.ok) { toast(r5.why, 'warning'); return; }
                var rr5 = resources().filter(function (x) { return x.key === r5.key; })[0]; if (rr5) resRec(fc, rr5).on = true;
                toast(nm + ' is a resource system. ' + rnm + ' is checked in the shared resources step, where you say which function it feeds.');
            } else {
                var r2 = addSystem(nm, 'fn'); if (!r2.ok) { toast(r2.why, 'warning'); return; }
                if (r2.existed) toast('A system with that name is already in the project. The function is added to it.');
                var r3 = addFunction(r2.system.id, fnm); if (!r3.ok) { toast(r3.why, 'warning'); return; }
                ui.open[S(r2.system.id)] = true; rec(fc.key).cols['fn:' + r3.funcId] = { role: d.apxAddsys === 'fails' ? 'fails' : 'does', how: 'loss' }; if (d.apxAddsys !== 'fails') traceUp(fc, r3.funcId);
            }
            ui.draft.name = ''; ui.draft.fn = ''; ui.draft.res = ''; delete ui.kind[d.apxAddsys]; touched(fc.key);
        }
        else if (d.apxAddres) { var rn = T(val('[data-apx-newres="name"]')), rsn = T(val('[data-apx-newres="sys"]')), rfn = T(val('[data-apx-newres="fn"]')); ui.draft.rname = rn; ui.draft.rsys = rsn; ui.draft.rfn = rfn; if (!rn) { toast('Give the resource a name.', 'warning'); return; } if (rfn && !rsn) { toast('Name the system that function belongs to.', 'warning'); return; } var r4 = addResourceFull(rn, rsn, rfn); if (!r4.ok) { toast(r4.why, 'warning'); return; } if (r4.existed) toast('That resource is already in the project. It is checked here' + (rsn ? ', with its provider set.' : '.')); var rr = resources().filter(function (x) { return x.key === r4.key; })[0]; if (rr) { resRec(fc, rr).on = true; touched(fc.key); } ui.draft.rname = ''; ui.draft.rsys = ''; ui.draft.rfn = ''; }
        else if (d.apxSend) { var res = send(fc, val('[data-apx-sign]')); ui.sign = val('[data-apx-sign]'); ui.signMiss = res.ok ? false : res.why; }
        else if (d.apxAi) { var sweep = fn('idpAiSweep'); if (sweep) { t.disabled = true; t.textContent = 'The AI is reading the architecture...'; Promise.resolve(safe(function () { return sweep({ fcIds: [fc.row.internalId] }); }, null)).then(function () { draw(); }, function () { draw(); }); return; } }
        draw();
    }
    function onChange(e) {
        var t = e.target; if (!t || !_host || !_host.contains(t) || !t.dataset) return;
        var d = t.dataset, fc = curFc();
        if (d.apxFc) { ui.fc = t.value; ui.eff = 0; ui.blocked = ''; ui.signMiss = false; ui.sign = null; draw(); return; }
        if (d.apxJump) { ui.step = Number(t.value); ui.blocked = ''; draw(); return; }
        if (d.apxNewsys) { ui.draft[d.apxNewsys] = t.value; return; }
        if (d.apxAidoc) { ui.aidoc = t.value; return; }
        if (d.apxTold) { ui.told = t.value; return; }
        if (d.apxRcmp && fc) { setCompare(fc, d.apxRcmp, t.value, val('[data-apx-rcmpref="' + d.apxRcmp.replace(/"/g, '\\"') + '"]')); draw(); return; }
        if (d.apxRcmpref && fc) { var cur9 = ((peek(fc.key) || {}).rcmp || {})[d.apxRcmpref]; if (cur9) setCompare(fc, d.apxRcmpref, cur9.state, t.value); return; }
        if (d.apxNewres) { ui.draft['r' + d.apxNewres] = t.value; return; }
        if (!fc) return;
        if (d.apxXc != null && EXT[ui.ap] && EXT[ui.ap].change) { var ca = d.apxXc.split('|'), cr; try { cr = EXT[ui.ap].change(ca[0], ca.slice(1).join('|'), t, fc); } catch (e2) { toast(e2 && e2.message ? e2.message : String(e2), 'warning'); cr = true; } if (cr !== false) draw(); return; }
        if (d.apxHow) { setRole(fc, d.apxHow, 'fails', t.value); draw(); }
        else if (d.apxMode) { var m = d.apxMode.split('|'); mode(fc, m[0], m[1], !!t.checked); draw(); }
        else if (d.apxCra != null && d.apxCra !== '') { if (t.value === '__own') { ui.own = d.apxCra; draw(); var inp = _host.querySelector('[data-apx-craown="' + d.apxCra.replace(/"/g, '\\"') + '"]'); if (inp) inp.focus(); return; } ui.own = null; setCra(fc, d.apxCra, t.value); draw(); }
        else if (d.apxCraown != null && d.apxCraown !== '') { ui.own = null; setCra(fc, d.apxCraown, t.value); draw(); }
        else if (d.apxSign) { ui.sign = t.value; }
    }
    function onToggle(e) { var t = e.target; if (t && t.dataset && t.dataset.apxSys != null && _host && _host.contains(t)) ui.open[t.dataset.apxSys] = !!t.open; }

    function render(host) {
        if (!host) return;
        if (_host !== host) { _host = host; host.addEventListener('click', onClick); host.addEventListener('change', onChange); host.addEventListener('toggle', onToggle, true); }
        draw();
    }
    function rerender() { try { var f = root.renderInterdepPage; if (typeof f === 'function') f(); } catch (_) {} }

    // With the switch on, the Interdependence page draws this Autopilot (and a switch back to today's page).
    (function wrap(tries) {
        if (typeof document === 'undefined') return;
        var f = root.renderInterdepPage;
        if (typeof f !== 'function') { if (tries > 0) setTimeout(function () { wrap(tries - 1); }, 250); return; }
        if (f._apx) return;
        _orig = f;
        var w = function () {
            if (!enabled()) { mark(false); return _orig.apply(this, arguments); }
            var host = document.getElementById('interdep-host');
            if (!host) return _orig.apply(this, arguments);
            if (ui.old) {
                mark(false);
                var r = _orig.apply(this, arguments);
                // today's page, with the way back on top (drawn after it, also when it drew late)
                var put = function () { if (!ui.old || !enabled() || host.querySelector('[data-apx-back]')) return; style(); var b = document.createElement('div'); b.className = 'apx'; b.setAttribute('data-apx-back', '1'); b.innerHTML = '<div class="apx-bar"><div class="apx-sw" role="group" aria-label="Which page"><button type="button" data-apx-view="new">New Autopilot (preview)</button><button type="button" class="on" data-apx-view="old">Today\'s page</button></div></div>'; host.insertBefore(b, host.firstChild); if (_host !== host) { _host = host; host.addEventListener('click', onClick); host.addEventListener('change', onChange); host.addEventListener('toggle', onToggle, true); } };
                put(); setTimeout(put, 400);
                return r;
            }
            render(host);
        };
        w._apx = true; Object.keys(f).forEach(function (k) { try { w[k] = f[k]; } catch (_) {} });
        root.renderInterdepPage = w;
    })(80);

    // The page is opened like any other (switchTab('interdep')); it is drawn on arrival. With the switch on, the PASA page
    // carries the way in: the Autopilots that feed it.
    function open(which) { try { ui.old = false; setAp(which || 'idp'); if (typeof root.switchTab === 'function') root.switchTab('interdep'); } catch (_) {} }
    function placeEntry() {
        if (typeof document === 'undefined') return;
        var v = document.getElementById('view-pasa'); if (!v) return;
        var old = v.querySelector(':scope > [data-apx-entry]'); if (old) old.remove();
        if (!enabled()) return;
        style();
        var b = document.createElement('div'); b.className = 'apx'; b.setAttribute('data-apx-entry', '1');
        b.innerHTML = '<div class="apx-bar" style="margin:0 0 10px"><b>The Autopilots that feed this report (preview, our team only):</b>' + ORDER.filter(function (k) { return k === 'idp' || EXT[k]; }).map(function (k) { return '<button type="button" class="apx-btn" data-apx-open="' + k + '">' + E(apName(k)) + ' Autopilot</button>'; }).join('') + '</div>';
        b.addEventListener('click', function (e) { var t = e.target && e.target.closest ? e.target.closest('[data-apx-open]') : null; if (t) open(t.dataset.apxOpen); });
        var head = v.querySelector(':scope > .header-with-export');
        if (head && head.nextSibling) v.insertBefore(b, head.nextSibling); else v.insertBefore(b, v.firstChild);
    }
    (function wrapNav(tries) {
        if (typeof document === 'undefined') return;
        if (typeof root.switchTab !== 'function') { if (tries > 0) setTimeout(function () { wrapNav(tries - 1); }, 100); return; }
        if (root.switchTab._apx) return;
        var orig = root.switchTab, w = function (tabId) {
            var r = orig.apply(this, arguments);
            try { if (tabId === 'pasa') placeEntry(); if (tabId === 'interdep' && enabled()) { var f = root.renderInterdepPage; if (typeof f === 'function') f(); } } catch (_) {}
            return r;
        };
        w._apx = true; Object.keys(orig).forEach(function (k) { try { w[k] = orig[k]; } catch (_) {} });
        root.switchTab = w;
    })(80);

    var api = { VERSION: VERSION, open: open, enabled: enabled, on: on, off: off, render: render,
        model: { proposals: proposals, resStatus: resStatus, resBasis: resBasis, fcs: fcs, fcOf: fcOf, allCols: allCols, cellOf: cellOf, picked: picked, resources: resources, resState: resState, resPicked: resPicked, effectRows: effectRows, craText: craText, left: left, status: status, MODES: MODES },
        act: { propose: propose, acceptProposal: acceptProposal, dismissProposal: dismissProposal, setCompare: setCompare, cleanProposals: cleanProposals, addResourceFull: addResourceFull, tick: tick, setRole: setRole, proposal: proposal, resTick: resTick, feed: feed, mode: mode, setCra: setCra, send: send, addSystem: addSystem, addFunction: addFunction, addResource: addResource },
        tables: { q41: tableQ41, q42: tableQ42, b3: tableB3 }, _ui: ui, _html: html, register: register, setAp: setAp,
        kit: { takeOut: takeOut, doTakeOut: doTakeOut, traceUp: traceUp, fnRow: fnRow, derived: derived, isResSys: isResSys, providerText: providerText, g: g, arr: arr, S: S, E: E, T: T, lc: lc, safe: safe, fn: fn, pc: pc, now: now, who: who, save: save, toast: toast, store: store, card: card, preview: preview, abbr: abbr, style: style, fcs: fcs, fcOf: fcOf, curFc: curFc, systems: systems, allCols: allCols, colOf: colOf, cellOf: cellOf, picked: picked, resources: resources, resState: resState, resPicked: resPicked, providerNames: providerNames, acFnName: acFnName, acFnLabel: acFnLabel, fcWord: fcWord, status: status, apStatus: apStatus, peek: peek, ui: ui, draw: function () { draw(); }, val: function (sel) { return val(sel); }, rerender: function () { rerender(); } } };
    try { root.SLApxAuto = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
