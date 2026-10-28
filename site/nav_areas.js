// ============================================================================
// nav_areas.js v1.6 (28 Oct 2026): Admin is a page of its own (Connections, Workspaces and locks, Seats and license);
// Connections leaves Requirements (Waqas: "this is not just a requirements thing").
// nav_areas.js v1.4 (25 Oct 2026): Waqas: "when you click on left nav menu it flickers"; "CCA in system folders
// take longer to appear"; "AFHA and SFHA symbols should match". (1) A system's CMA, R&M and HF links were
// flipped on and off by every refresh (the on/off test could come out undefined, and toggle(x, undefined) flips):
// one click refreshes several times, so an odd count left Common cause and R&M hidden until the next check. The
// test is now a plain yes or no. (2) Every refresh emptied the bar above the page and filled it again, 8 to 28
// times a click: the bar now only moves, shows or hides what differs from what is on screen, and a refresh
// that changes nothing touches nothing; the Working on picker is rebuilt only when its choices change. (3) The SFHA carries the AFHA's sign.
// nav_areas.js v1.3 (25 Oct 2026): Waqas: "Rename system workspaces to SFHA, Rename Hazards at aircraft level To
// AFHA and have the FMEA split out from the system workspaces" (into the SSA); "AI/ML assurance can be completely
// removed from the software for now". The system section is SFHA, the aircraft's AFHA; a system's FMEA is a tab of
// its SSA (the workspace's own FMEA button is hidden: the same page, the same handlers); no AI/ML link.
// nav_areas.js v1.2 (25 Oct 2026): a system has its own Common cause (CMA), R&M and Human factors sections
// (level_view.js): the same pages as the aircraft's, showing that system's rows, each link gated by the system's
// plan. goto(level, tab) opens a page at a level (the "View ... analysis" links).
// nav_areas.js v1.1 (24 Oct 2026, later the same day): the fault trees and diagrams move to their homes
// (tree_homes.js). Waqas: "top down fault trees to be in the PASA, and bottom up trees to be in ASA, top down
// system trees in the that systems PSSA, and bottom up ones in that systems SSA"; "where did the PSSA and SSA
// go": a system now has three sections, its workspace, its PSSA (allocation and DAL, requirements, fault trees,
// diagrams) and its SSA (verification trees, the SSA report); and "a separate fault trees option for stand alone
// trees" with the diagrams that belong to no level: the Standalone section, shown for the aircraft and for every
// system. The PSSA buttons inside the workspace move up into the PSSA section (the same pages, the same handlers).
// nav_areas.js v1.0 (24 Oct 2026): Safety Lab's left navigation laid out the way Sys Lab's is.
//
// Waqas, 24 Oct 2026: "Make Safety Lab's left-hand navigation match Sys Lab's upgraded navigation so it is not
// so busy ... where you drop down and select which level, aircraft or whichever system, and then all other
// analyses are laid out horizontally." And: "we are not removing functionality we are just moving things
// around to make it cleaner ... no dead buttons."
//
// THE LAYOUT
//   Left: Dashboard, Golden Thread, a "Working on" picker (Aircraft, each system, + New system), the
//   sections for that choice, then AI Assistant and Admin. Above the page: the open section's pages as tabs
//   (#sl-areabar), with a second row where a section groups pages (R&M: Reliability, Maintainability).
//   Pages that already carry their own tab bar (Prove, AFHA, Fault trees, ZSA, CMA: prove_tabs.js; the PASA
//   sub-tabs; a system workspace's tabs) keep it, under this one.
//
// NOTHING IS REMOVED. The menu's own entries (the snav-* links, each with the handler it always had) are the
// tabs: this module MOVES them into the bar of their section and back into a hidden holder when another
// section is open. So every handler, every program-plan lane gate and the R&M tier gate (they set the link's
// display), the active highlight (switchTab sets snav-active) and every id other modules and tests use stay
// exactly as they were. A section whose every page is gated off is hidden with them.
//
// API (window.SLNavAreas): AREAS, areaOf(tab), sync(), open(areaKey), scope(), pickScope(value).
// Load: after support_modules.js (switchTab) and helpers_modules.js (openSystemWorkspace); wraps switchTab once
// on load. Tests: tests/regression_nav_areas_20261024.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.6';
    // A section: key, label, icon, scope ('aircraft' | 'system' | 'foot'), items (menu link ids, or a group
    // { group, label, ids }), and pages: every page (switchTab id) that belongs to it, with the link that stands
    // for it in the bar (a page that has no link of its own, such as the AFHA's Functions tab, lights its area's link).
    var AREAS = [
        { key: 'plan', label: 'Plan and basis', ic: '📐', scope: 'aircraft', items: ['snav-defs', 'snav-arp-process', 'snav-spp', 'snav-phases'] },
        { key: 'afha', label: 'AFHA', ic: '⚠', scope: 'aircraft', items: ['snav-afha'],
          pages: { 'ac-func': 'snav-afha', 'ac-fcim': 'snav-afha', 'ac-asm': 'snav-afha' } },
        // the fault trees and diagram tools of a level are links made here (DYN below): their pages decide their
        // section from the tree home on screen (SLTreeHomes.navArea)
        { key: 'pasa', label: 'PASA', ic: '🌳', scope: 'aircraft', items: ['snav-pasa', 'snav-ac-req', 'snav-fta', 'sl-nav-diag-pasa'],
          pages: { interdep: 'snav-pasa', resources: 'snav-pasa', mac: 'snav-pasa', mfms: 'snav-pasa', coffe: 'snav-pasa' } },
        { key: 'cca', label: 'Common cause', ic: '🔗', scope: 'aircraft', items: ['snav-zsa', 'snav-pra', 'snav-cma', 'snav-cea', 'snav-stpa'],
          pages: { zonal: 'snav-zsa', cad: 'snav-zsa', routing: 'snav-zsa', phys: 'snav-zsa', ipledger: 'snav-cma', cra: 'snav-cma' } },
        { key: 'asa', label: 'ASA', ic: '✈', scope: 'aircraft', items: ['snav-asa', 'sl-nav-trees-asa', 'snav-ccmr', 'snav-mmel', 'snav-sse'] },
        { key: 'hf', label: 'Human factors', ic: '👤', scope: 'aircraft', items: ['snav-hfa', 'snav-hfa-tid', 'snav-hfa-alloc', 'snav-hfa-hea', 'snav-hfa-alerts', 'snav-hfa-task', 'snav-hfa-ergo', 'snav-hfa-cd', 'snav-hfa-sa', 'snav-hfa-mfc'] },
        { key: 'ram', label: 'R&M', ic: '🔧', scope: 'aircraft', items: ['snav-ram-hub', 'snav-library',
            { group: 'rel', label: 'Reliability', ids: ['snav-ram-rel', 'snav-ram-predict', 'snav-ram-rbd', 'snav-ram-weibull', 'snav-ram-growth', 'snav-ram-alloc', 'snav-ram-tol', 'snav-rbd-mc', 'snav-rel-frameworks', 'snav-swrel', 'snav-sneak', 'snav-lcc'] },
            { group: 'mx', label: 'Maintainability', ids: ['snav-ram-mx', 'snav-ram-msg3', 'snav-msg3x', 'snav-ram-pmopt', 'snav-ram-test', 'snav-ram-lora'] },
            'snav-ram-settings'] },
        { key: 'req', label: 'Requirements', ic: '📋', scope: 'aircraft', items: ['snav-reqs-repo', 'snav-val-matrix', 'snav-moc', 'snav-vv-status', 'snav-reqif', 'snav-xmi', 'snav-dal-ref'] },
        { key: 'prove', label: 'Prove', ic: '✅', scope: 'aircraft', items: ['snav-prove'],
          pages: { 'gt-integrity': 'snav-prove', evpkg: 'snav-prove', appa: 'snav-prove', validation: 'snav-prove', cm: 'snav-prove', review: 'snav-prove', pr: 'snav-prove', mod: 'snav-prove', 'sora-thread': 'snav-prove' } },
        // a system: its workspace (functions, FCIM, FHA, FMEA, assumptions: the workspace's own tabs), AI/ML
        // learning assurance and the directory of every system; then its PSSA and its SSA
        { key: 'sys', label: 'SFHA', ic: '⚠', scope: 'system', items: ['sl-nav-sysws', 'sl-nav-sys-plan', 'snav-sys-dir'],
          pages: { 'sys-workspace': 'sl-nav-sysws' } },
        { key: 'pssa', label: 'PSSA', ic: '🌳', scope: 'system', items: ['sl-nav-pssa-alloc', 'sl-nav-pssa-req', 'sl-nav-trees-pssa', 'sl-nav-diag-pssa'] },
        { key: 'ssa', label: 'SSA', ic: '✔', scope: 'system', items: ['sl-nav-trees-ssa', 'sl-nav-ssa-fmea', 'sl-nav-ssa-report'] },
        // 25 Oct 2026 (level_view.js): a system's own CMA, R&M and human factors, the same pages as the aircraft's,
        // showing that system's rows (ZSA and PRA stay with the aircraft)
        { key: 'sys-cca', label: 'Common cause', ic: '🔗', scope: 'system', items: ['sl-nav-sys-cma'] },
        { key: 'sys-ram', label: 'R&M', ic: '🔧', scope: 'system', items: ['sl-nav-sys-ram-predict', 'sl-nav-sys-ram-mx', 'sl-nav-sys-msg3', 'sl-nav-sys-mmel'] },
        { key: 'sys-hf', label: 'Human factors', ic: '👤', scope: 'system', items: ['sl-nav-sys-hfa-tid', 'sl-nav-sys-hfa-task', 'sl-nav-sys-hfa-hea', 'sl-nav-sys-hfa-alerts', 'sl-nav-sys-hfa-cd'] },
        // trees and diagrams that belong to no level, for the aircraft and every system alike
        { key: 'standalone', label: 'Standalone', ic: '🧪', scope: 'any', items: ['sl-nav-trees-standalone', 'sl-nav-diag-standalone'] },
        { key: 'ai', label: 'AI Assistant', ic: '✦', scope: 'foot', items: ['snav-ai', 'snav-anem', 'snav-assumptions'] },
        // 28 Oct 2026 (Waqas): Admin is a page: Connections (not a Requirements thing: it feeds functions, failure
        // conditions, assumptions and systems too), Workspaces and locks (no longer a pop-up), Seats and license
        { key: 'admin', label: 'Admin', ic: '⚙', scope: 'foot', items: ['snav-conn', 'snav-ws-locks', 'snav-admin-lic'] }
    ];
    var PINS = ['snav-dashboard', 'snav-golden-thread'];

    // the words a link shows as a tab (the old menu's labels were written for a long list)
    var SHORT = { 'snav-conn': 'Connections', 'snav-pasa': 'PASA', 'snav-afha': 'AFHA', 'snav-ram-hub': 'Overview', 'snav-sys-dir': 'All systems', 'snav-reqif': 'Requirements exchange',
                  'snav-xmi': 'Architecture import', 'snav-defs': 'Certification basis', 'snav-arp-process': 'Safety process map', 'snav-stpa': 'STPA',
                  'snav-cea': 'Cascading effects', 'snav-zsa': 'ZSA', 'snav-pra': 'PRA', 'snav-cma': 'CMA', 'snav-asa': 'ASA', 'snav-hfa': 'HF analysis',
                  'snav-ws-locks': 'Workspaces and locks', 'snav-admin-lic': 'Seats and license', 'snav-anem': 'ANEM live chat', 'snav-dal-ref': 'DAL credit (DO-178C / 254)', 'snav-prove': 'Prove', 'snav-fta': 'Fault trees' };
    function _ids(a) { var out = []; a.items.forEach(function (it) { if (typeof it === 'string') out.push(it); else out = out.concat(it.ids); }); return out; }
    function _el(id) { return document.getElementById(id); }
    function _tabOfLink(el) { var m = /switchTab\('([^']+)'\)/.exec((el && el.getAttribute('onclick')) || ''); return m ? m[1] : null; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    // page (switchTab id) -> { area, link }
    var PAGE = {};
    function _indexPages() {
        PAGE = {};
        AREAS.forEach(function (a) {
            _ids(a).forEach(function (id) { var t = _tabOfLink(_el(id)); if (t && !PAGE[t]) PAGE[t] = { area: a.key, link: id }; });
            Object.keys(a.pages || {}).forEach(function (t) { if (!PAGE[t]) PAGE[t] = { area: a.key, link: a.pages[t] }; });
        });
    }
    // the section and the link of a page: a tree or diagram page from its tree home, a system workspace page from
    // its tab (the PSSA tabs are the PSSA section's), every other page from the index
    var WS_PSSA = { pssa: 'sl-nav-pssa-alloc', req: 'sl-nav-pssa-req' };
    var WS_SSA = { fmea: 'sl-nav-ssa-fmea' };   // 25 Oct 2026: the system's FMEA is the SSA's (bottom-up evidence)
    function _where(tab) {
        // a CMA, R&M or HF page while a system is picked: that system's section
        if (_scope !== 'aircraft') { var sl = _sysTabLinks()[tab]; if (sl) return { area: _sysAreaOfLink(sl), link: sl, systemId: _scope }; }
        try { var n = root.SLTreeHomes && root.SLTreeHomes.navArea(tab); if (n) return n; } catch (_) {}
        if (tab === 'sys-workspace' && WS_PSSA[_wsSub]) return { area: 'pssa', link: WS_PSSA[_wsSub] };
        if (tab === 'sys-workspace' && WS_SSA[_wsSub]) return { area: 'ssa', link: WS_SSA[_wsSub] };
        return PAGE[tab] || null;
    }
    function areaOf(tab) { var p = _where(tab); return p ? p.area : null; }
    function _area(key) { for (var i = 0; i < AREAS.length; i++) if (AREAS[i].key === key) return AREAS[i]; return null; }
    function _cur() { try { return root._slCurrentTab || ''; } catch (_) { return ''; } }
    function _shown(el) { return !!el && el.style.display !== 'none' && !el.classList.contains('sl-sys-lane-off'); }   // the lane and tier gates hide a link this way (a system's own plan: the class)
    function _systems() { try { return (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : (root.systemsData || []); } catch (_) { return []; } }
    function _activeSys() { try { return (typeof activeSystemId !== 'undefined') ? activeSystemId : root.activeSystemId; } catch (_) { return null; } }

    var _open = null;          // the section whose links are in the bar
    var _last = {};            // section -> the page last open in it
    var _scope = 'aircraft';   // what the sections are for
    var _wsSub = '';           // the system workspace tab on screen (switchWorkspaceTab's argument)
    var _built = false;

    function _sysScope() { return _scope !== 'aircraft' ? _scope : (_systems()[0] ? String(_systems()[0].id) : null); }
    function _homes() { return root.SLTreeHomes || null; }
    function _openWs(tab) { var id = _sysScope(); if (id == null) return; if (typeof root.openSystemWorkspace === 'function') root.openSystemWorkspace(id); if (typeof root.switchWorkspaceTab === 'function') root.switchWorkspaceTab(tab); }
    var DYN = {
        'sl-nav-diag-pasa':        ['Diagrams', function () { _homes() && _homes().openDiagrams('pasa'); }, 'Bow-ties, event trees, Markov models, monitors, exposure cases and frequency for the aircraft'],
        'sl-nav-trees-asa':        ['Verification trees', function () { _homes() && _homes().open('asa'); }, 'The aircraft\u2019s bottom-up verification trees, one for each PASA fault tree'],
        'sl-nav-sys-plan':         ['Analysis plan', function () { var id = _sysScope(); try { if (id != null && root.PROGRAM_PLAN && typeof root.PROGRAM_PLAN.openSystemPlanModal === 'function') root.PROGRAM_PLAN.openSystemPlanModal(id); } catch (_) {} }, 'The analyses this system is to have (copied from the aircraft\u2019s plan when the system was made, then its own): they decide the sections and tabs below'],
        'sl-nav-pssa-alloc':       ['Allocation and DAL', function () { _openWs('pssa'); }, 'This system\u2019s allocation and DAL overview'],
        'sl-nav-pssa-req':         ['Requirements', function () { _openWs('req'); }, 'This system\u2019s requirements'],
        'sl-nav-trees-pssa':       ['Fault trees', function () { _homes() && _homes().open('pssa', _sysScope()); }, 'This system\u2019s top-down fault trees'],
        'sl-nav-diag-pssa':        ['Diagrams', function () { _homes() && _homes().openDiagrams('pssa', _sysScope()); }, 'Bow-ties, event trees, Markov models, monitors, exposure cases and frequency for this system'],
        'sl-nav-trees-ssa':        ['Verification trees', function () { _homes() && _homes().open('ssa', _sysScope()); }, 'This system\u2019s bottom-up verification trees, one for each PSSA fault tree'],
        'sl-nav-ssa-fmea':         ['FMEA', function () { _openWs('fmea'); }, 'This system\u2019s FMEA: functional and piece-part failure modes, the bottom-up evidence for its verification trees'],
        'sl-nav-ssa-report':       ['SSA report', function () { var id = _sysScope(); try { if (root.Reports && typeof root.Reports.open === 'function') root.Reports.open('SSA', { systemId: id }); } catch (_) {} }, 'Generate this system\u2019s SSA report'],
        'sl-nav-trees-standalone': ['Fault trees', function () { _homes() && _homes().open('standalone'); }, 'Fault trees that belong to neither the aircraft nor a system'],
        'sl-nav-diag-standalone':  ['Diagrams', function () { _homes() && _homes().openDiagrams('standalone'); }, 'Diagrams that belong to neither the aircraft nor a system']
    };

    // 25 Oct 2026: a system's CMA, R&M and HF links (level_view.js KINDS): each opens the same page as the aircraft
    // link, for the system picked; the page shows that system's rows
    var SYS_KIND_LINKS = {
        'sl-nav-sys-cma': ['cma', 'CMA', 'Common mode analysis inside this system: independence between its own channels and resources'],
        'sl-nav-sys-ram-predict': ['ramPredict', 'Reliability prediction', 'This system\u2019s parts-count reliability prediction and MTBF'],
        'sl-nav-sys-ram-mx': ['ramTask', 'Maintainability', 'This system\u2019s maintenance tasks, MTTR and downtime'],
        'sl-nav-sys-msg3': ['msg3', 'MSG-3 systems', 'MSG-3 systems analysis of this system\u2019s significant items'],
        'sl-nav-sys-mmel': ['mmel', 'MMEL', 'Dispatch relief items for this system'],
        'sl-nav-sys-hfa-tid': ['hfTid', 'Task identification', 'Crew tasks with this system\u2019s controls and displays'],
        'sl-nav-sys-hfa-task': ['hfTasks', 'Task analysis', 'Timing and workload of this system\u2019s crew tasks'],
        'sl-nav-sys-hfa-hea': ['hfHea', 'Human error analysis', 'What the crew can get wrong with this system'],
        'sl-nav-sys-hfa-alerts': ['hfAlerts', 'Crew alerting', 'The alerts this system raises'],
        'sl-nav-sys-hfa-cd': ['hfCd', 'Controls and displays', 'This system\u2019s controls and displays (\u00a725.1302)']
    };
    function _lvKind(k) { try { return root.SLLevelView && root.SLLevelView.KINDS[k]; } catch (_) { return null; } }
    var SYS_TAB_LINK = {};   // page -> its system link
    Object.keys(SYS_KIND_LINKS).forEach(function (id) {
        var spec = SYS_KIND_LINKS[id];
        DYN[id] = [spec[1], function () { var K = _lvKind(spec[0]); if (K && typeof root.switchTab === 'function') root.switchTab(K.tab); }, spec[2]];
    });
    function _sysTabLinks() {
        if (Object.keys(SYS_TAB_LINK).length) return SYS_TAB_LINK;
        Object.keys(SYS_KIND_LINKS).forEach(function (id) { var K = _lvKind(SYS_KIND_LINKS[id][0]); if (K) SYS_TAB_LINK[K.tab] = id; });
        return SYS_TAB_LINK;
    }
    function _sysAreaOfLink(id) { for (var i = 0; i < AREAS.length; i++) if (AREAS[i].scope === 'system' && _ids(AREAS[i]).indexOf(id) >= 0) return AREAS[i].key; return null; }

    // 24 Oct 2026 (Stage 4, Waqas: "when you are starting a system directory it should automatically give all of the
    // analyses you are supposed to be performing for that system"): a system's sections and tabs are its own plan's
    // (PROGRAM_PLAN.systemLaneOn: the aircraft's plan copied when the system was made, then tailored). A lane off
    // hides its tabs for that system (a class, so the aircraft's gates that set style.display are not disturbed);
    // nothing is deleted, and on again shows it again.
    var SYS_LANE_LINKS = { fta: ['sl-nav-trees-pssa', 'sl-nav-diag-pssa', 'sl-nav-trees-ssa', 'sl-nav-ssa-report'] };
    function _sysLaneOn(lane) {
        var id = _scope !== 'aircraft' ? _scope : null; if (id == null) return true;
        try { var PP = root.PROGRAM_PLAN; if (PP && typeof PP.systemLaneOn === 'function') return PP.systemLaneOn(id, lane) !== false; } catch (_) {}
        return true;
    }
    function _sysLanes() {
        var sysScope = _scope !== 'aircraft';
        Object.keys(SYS_LANE_LINKS).forEach(function (lane) {
            var off = !!(sysScope && !_sysLaneOn(lane));
            SYS_LANE_LINKS[lane].forEach(function (id) { var x = _el(id); if (x && x.classList.contains('sl-sys-lane-off') !== off) x.classList.toggle('sl-sys-lane-off', off); });
        });
        // a system's CMA, R&M and HF links: its own plan's lane (for HF: its HF lane and the sub-analysis, both from
        // the system's plan, which falls back to the aircraft's for a lane it never set)
        Object.keys(SYS_KIND_LINKS).forEach(function (id) {
            var K = _lvKind(SYS_KIND_LINKS[id][0]), x = _el(id); if (!K || !x) return;
            var off = !!(sysScope && (!_sysLaneOn(K.lane) || (K.sub && !_sysLaneOn(K.sub))));   // a plain yes or no: toggle(c, undefined) flips
            if (x.classList.contains('sl-sys-lane-off') !== off) x.classList.toggle('sl-sys-lane-off', off);
        });
        // the SSA's FMEA link: the system's functional or piece-part FMEA lane
        var fm = _el('sl-nav-ssa-fmea');
        if (fm) { var offF = !!(sysScope && !_sysLaneOn('ffmea') && !_sysLaneOn('ppfmea')); if (fm.classList.contains('sl-sys-lane-off') !== offF) fm.classList.toggle('sl-sys-lane-off', offF); }
    }

    // ---- building the frame once -----------------------------------------------------------------
    function build() {
        if (_built || typeof document === 'undefined') return false;
        var nav = document.querySelector('#app-sidebar .asb-nav');
        var anchor = _el('view-dashboard');
        if (!nav || !anchor || !_el('snav-dashboard')) return false;
        _built = true;
        // the holder: every menu link not on screen right now waits here, with its handler and gates
        var pool = document.createElement('div'); pool.id = 'sl-nav-pool'; pool.hidden = true; pool.setAttribute('aria-hidden', 'true');
        // the system workspace link (the old menu opened a workspace from the system list)
        var ws = document.createElement('a'); ws.className = 'asb-item sub'; ws.id = 'sl-nav-sysws'; ws.setAttribute('role', 'button'); ws.tabIndex = 0;
        ws.innerHTML = '<span class="asb-lbl">SFHA</span>'; ws.title = 'This system\u2019s functions, FCIM, FHA and assumptions';
        ws.addEventListener('click', function () { var id = _scope !== 'aircraft' ? _scope : null; if (id != null && typeof root.openSystemWorkspace === 'function') root.openSystemWorkspace(id); });
        pool.appendChild(ws);
        // the menu's Fault Tree Analysis link is the PASA's fault trees (it keeps its id, its place in the plan's FTA
        // lane gate and the tour): it opens the PASA trees now, not every tree
        var fta = _el('snav-fta'); if (fta) fta.setAttribute('onclick', "if (window.SLTreeHomes) SLTreeHomes.open('pasa'); else switchTab('fta');");
        // the tree, diagram, PSSA and SSA links (DYN): plain links like every other, each with its handler
        Object.keys(DYN).forEach(function (id) {
            var a = document.createElement('a'); a.className = 'asb-item sub'; a.id = id; a.setAttribute('role', 'button'); a.tabIndex = 0;
            a.innerHTML = '<span class="asb-lbl">' + _esc(DYN[id][0]) + '</span>'; a.title = DYN[id][2] || '';
            a.addEventListener('click', function () { try { DYN[id][1](); } catch (e) { try { console.warn('[nav_areas] ' + id, e); } catch (_) {} } });
            a.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a.click(); } });
            pool.appendChild(a);
        });
        // The R&M tier gate hid the Maintainability links by hiding their group (ram_modules.js, #asb-grp-ram-mx);
        // the group goes, so each of its links carries the tier class the other R&M links carry (same rule, same gate).
        Array.prototype.forEach.call(document.querySelectorAll('#asb-grp-ram-mx .asb-item'), function (x) { x.classList.add('ram-proplus'); });
        // a system's R&M links carry the same tier gate
        ['sl-nav-sys-ram-predict', 'sl-nav-sys-ram-mx', 'sl-nav-sys-msg3', 'sl-nav-sys-mmel'].forEach(function (id) { var x = _el(id); if (x) x.classList.add('ram-proplus'); });
        Array.prototype.slice.call(nav.querySelectorAll('.asb-item')).forEach(function (a) {
            if (PINS.indexOf(a.id) >= 0) return;
            if (SHORT[a.id]) { var l = a.querySelector('.asb-lbl'); if (l) { if (!a.title) a.title = l.textContent; l.textContent = SHORT[a.id]; } }
            var ico = a.querySelector('.asb-ico'); if (ico && a.id !== 'snav-prove') ico.remove();
            pool.appendChild(a);
        });
        // what else lived in the menu (the system list host other modules draw into) stays, in the holder
        Array.prototype.slice.call(nav.querySelectorAll('[id]')).forEach(function (x) { if (!x.closest('.asb-item') && x.tagName !== 'DETAILS' && x.tagName !== 'SUMMARY' && x.id.indexOf('asb-grp') !== 0) pool.appendChild(x); });
        // the menu itself, Sys Lab's way (the two pinned links are held while the old groups are cleared)
        var pins = PINS.map(_el).filter(Boolean);
        pins.forEach(function (p) { p.parentNode.removeChild(p); });
        nav.innerHTML = '';
        pins.forEach(function (p) { nav.appendChild(p); });
        var sc = document.createElement('label'); sc.className = 'asb-scope'; sc.title = 'What the sections open for: the aircraft, or one system';
        sc.innerHTML = '<span class="asb-scope-l">Working on</span><select id="sl-scope-pick" aria-label="Working on"></select>';
        nav.appendChild(sc);
        var secs = document.createElement('div'); secs.id = 'sl-nav-areas'; nav.appendChild(secs);
        var sep = document.createElement('div'); sep.className = 'asb-sep'; nav.appendChild(sep);
        var foot = document.createElement('div'); foot.id = 'sl-nav-foot'; nav.appendChild(foot);
        nav.appendChild(pool);
        AREAS.forEach(function (a) {
            var b = document.createElement('a'); b.className = 'asb-item asb-area'; b.setAttribute('data-area', a.key); b.setAttribute('role', 'button'); b.tabIndex = 0;
            b.title = a.label; b.innerHTML = '<span class="asb-ico">' + _esc(a.ic) + '</span><span class="asb-lbl">' + _esc(a.label) + '</span>';
            b.addEventListener('click', function () { open(a.key); });
            b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(a.key); } });
            (a.scope === 'foot' ? foot : secs).appendChild(b);
        });
        // the bar above the page
        var bar = document.createElement('div'); bar.id = 'sl-areabar'; bar.className = 'sl-areabar'; bar.setAttribute('role', 'navigation'); bar.setAttribute('aria-label', 'Pages of this section');
        bar.innerHTML = '<div class="sl-ab-crumb"></div><div class="sl-ab-row" id="sl-ab-row1"></div><div class="sl-ab-row sl-ab-sub" id="sl-ab-row2"></div>';
        anchor.parentNode.insertBefore(bar, anchor);
        _el('sl-scope-pick').addEventListener('change', function (e) { pickScope(e.target.value); });
        _indexPages();
        _injectStyle();
        return true;
    }

    // ---- the bar: the open section's links, moved in; the rest back in the holder ---------------
    // a style or text set only when it differs (setting the same value still counts as a change on screen)
    function _disp(el, show) { var v = show ? '' : 'none'; if (el.style.display !== v) el.style.display = v; }
    function _cls(el, c, on) { if (el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); }
    // a row holds exactly these, in this order: anything else goes back to the holder, nothing is emptied
    function _rowIs(row, want) {
        var have = Array.prototype.slice.call(row.children);
        if (have.length === want.length && have.every(function (x, i) { return x === want[i]; })) return;
        var pool = _el('sl-nav-pool');
        have.forEach(function (x) { if (want.indexOf(x) < 0) { if (x.classList.contains('asb-item')) pool.appendChild(x); else row.removeChild(x); } });
        want.forEach(function (x, i) { if (row.children[i] !== x) row.insertBefore(x, row.children[i] || null); });
    }
    var _groups = {};   // section:group -> its group button, made once
    function _group(a, it) {
        var k = a.key + ':' + it.group; if (_groups[k]) return _groups[k];
        var g = document.createElement('a'); g.className = 'sl-ab-grp'; g.setAttribute('data-group', it.group); g.setAttribute('role', 'button'); g.tabIndex = 0;
        g.textContent = it.label;
        g.addEventListener('click', function () { var first = it.ids.map(_el).filter(_shown)[0]; if (first) first.click(); });
        return (_groups[k] = g);
    }
    function _fill(a, cur) {
        var pool = _el('sl-nav-pool'), r1 = _el('sl-ab-row1'), r2 = _el('sl-ab-row2'), bar = _el('sl-areabar');
        if (!pool || !r1) return;
        if (!a) { _rowIs(r1, []); _rowIs(r2, []); _cls(bar, 'sl-ab-off', true); return; }
        var _w = _where(cur), link = _w ? _w.link : null, openGroup = null, want1 = [], want2 = [];
        a.items.forEach(function (it) {
            if (typeof it === 'string') { var x = _el(it); if (x) { want1.push(x); _cls(x, 'sl-ab-on', it === link); } return; }
            var g = _group(a, it);
            _disp(g, it.ids.some(function (id) { return _shown(_el(id)); }));
            var inIt = it.ids.indexOf(link) >= 0; _cls(g, 'sl-ab-on', inIt); if (inIt) openGroup = it;
            want1.push(g);
        });
        if (openGroup) openGroup.ids.forEach(function (id) { var x = _el(id); if (x) { want2.push(x); _cls(x, 'sl-ab-on', id === link); } });
        _rowIs(r1, want1); _rowIs(r2, want2);
        _disp(r2, !!openGroup);
        // a section of one link (its page carries its own tab bar) needs no first row
        var visible = want1.filter(function (x) { return x.style.display !== 'none'; });
        _disp(r1, visible.length > 1 || !!openGroup);
        var where = a.scope === 'system' ? (_sysName(_scope) || 'System') : (a.scope === 'foot' || a.scope === 'any' ? '' : 'Aircraft');
        var crumb = bar.querySelector('.sl-ab-crumb'), text = (where ? where + ' · ' : '') + a.label;
        if (crumb.textContent !== text) crumb.textContent = text;
        _cls(bar, 'sl-ab-off', false);
    }
    function _sysName(id) { var s = _systems().find(function (x) { return x && String(x.id) === String(id); }); return s ? (s.name || s.id) : ''; }

    // ---- keeping everything in step with the page on screen --------------------------------------
    function sync() {
        if (!_built && !build()) return;
        // the plan's FTA lane gate hides the Fault Tree Analysis link: every tree and diagram link follows it
        var ftaLink = _el('snav-fta'), gateOff = !!ftaLink && ftaLink.style.display === 'none';
        Object.keys(DYN).forEach(function (id) { if (/^sl-nav-(trees|diag)-/.test(id)) { var x = _el(id); if (x && (x.style.display === 'none') !== gateOff) x.style.display = gateOff ? 'none' : ''; } });
        _sysLanes();
        var cur = _cur(), w = _where(cur), key = w ? w.area : null;
        if (cur === 'sys-workspace') { var sid = _activeSys(); if (sid != null && sid !== '') _scope = String(sid); }
        else if (w && w.systemId) _scope = String(w.systemId);
        else if (key && _area(key).scope === 'aircraft') _scope = 'aircraft';
        if (key) { _open = key; _last[key] = { tab: cur, link: w.link }; }
        // the picker
        var pick = _el('sl-scope-pick');
        if (pick) {
            var opts = [['aircraft', 'Aircraft']].concat(_systems().filter(function (s) { return s && s.id != null; }).map(function (s) { return [String(s.id), s.name || String(s.id)]; }));
            var html = opts.map(function (o) { return '<option value="' + _esc(o[0]) + '"' + (o[0] === _scope ? ' selected' : '') + '>' + _esc(o[1]) + '</option>'; }).join('') + '<option value="+new">+ New system…</option>';
            // the picker is rebuilt only when its choices change (the page writes its options back differently from
            // the text given, so comparing with innerHTML rebuilt it on every refresh)
            if (pick._slSig !== html) { pick.innerHTML = html; pick._slSig = html; }
            pick.value = _scope;
        }
        // the sections for this choice; one whose every page is gated off goes with them
        Array.prototype.forEach.call(document.querySelectorAll('#app-sidebar .asb-area'), function (b) {
            var a = _area(b.getAttribute('data-area'));
            var fits = a.scope === 'foot' || a.scope === 'any' || (a.scope === 'system') === (_scope !== 'aircraft');
            var any = _ids(a).some(function (id) { return _shown(_el(id)); });
            _disp(b, fits && any);
            _cls(b, 'snav-active', a.key === key);
        });
        _fill(key ? _area(key) : null, cur);
    }
    // open a section: the page last open in it, else its first page the plan and tier allow
    function open(k) {
        var a = _area(k); if (!a) return;
        if (a.scope === 'system' && _scope === 'aircraft') { var s0 = _systems()[0]; if (s0) _scope = String(s0.id); }
        var last = _last[k];
        // the page last open in it: its link (a tree home, a workspace tab), else the page itself
        if (last) { var le = last.link && _el(last.link); if (le && _shown(le)) { le.click(); return; } if (last.tab !== 'sys-workspace' && typeof root.switchTab === 'function') { root.switchTab(last.tab); return; } }
        var first = _ids(a).map(_el).filter(_shown)[0];
        if (first) first.click();
    }
    function pickScope(v) {
        if (v === '+new') { sync(); try { if (typeof root.promptCreateSystem === 'function') root.promptCreateSystem(); } catch (_) {} return; }
        if (v === 'aircraft') {
            _scope = 'aircraft';
            var k = (_open && _area(_open).scope === 'aircraft') ? _open : 'afha';
            var lastAc = null; Object.keys(_last).some(function (key) { if (_area(key) && _area(key).scope === 'aircraft') { lastAc = key; return true; } return false; });
            open(_open && _area(_open).scope === 'aircraft' ? _open : (lastAc || k));
            return;
        }
        _scope = String(v);
        if (typeof root.openSystemWorkspace === 'function') root.openSystemWorkspace(v);
        setTimeout(sync, 0);
    }
    function scope() { return _scope; }
    // 25 Oct 2026: open a page at a level ('aircraft' or a system id), the "View ... analysis" links (level_view.js)
    function goto(level, tab) {
        if (level !== 'aircraft' && !_systems().some(function (s) { return s && String(s.id) === String(level); })) return false;
        _scope = level === 'aircraft' ? 'aircraft' : String(level);
        try { if (typeof root.switchTab === 'function') root.switchTab(tab); } catch (e) { try { console.warn('[nav_areas] goto', e); } catch (_) {} }
        sync();
        return true;
    }

    function _injectStyle() {
        if (_el('sl-nav-areas-style')) return;
        var st = document.createElement('style'); st.id = 'sl-nav-areas-style';
        st.textContent = [
            '#sl-nav-pool{display:none!important}',
            // the workspace's PSSA buttons: their pages are the PSSA section's tabs now (the same handlers)
            '#ws-tab-pssa,#ws-pssa-subnav,#ws-tab-fmea{display:none!important}',
            '.sl-sys-lane-off{display:none!important}',
            // the picker sits on the sidebar's own backdrop: its text is the sidebar's white (safety_lab.css forces
            // white text on sidebar selects); the open list is a light surface with dark text
            '.asb-scope{display:flex;flex-direction:column;gap:5px;margin:10px 4px 8px;padding:8px 8px 9px;border:1px solid rgba(255,255,255,.22);border-radius:var(--r-md);background:rgba(255,255,255,.08)}',
            '.asb-scope-l{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#FFFFFF}',
            '.asb-scope select{width:100%;font-size:13px;font-weight:600;padding:5px 6px;border-radius:var(--r-sm)}',
            '.asb-scope select option{color:#101216;background:#FFFFFF}',
            '.asb-sep{height:1px;background:var(--color-border-hair);margin:8px 6px}',
            'body.nav-sidebar.nav-rail .asb-scope{display:none}',
            '.sl-areabar{margin:0 0 14px;padding:0 0 2px;border-bottom:1px solid var(--color-border-thin)}',
            '.sl-areabar.sl-ab-off{display:none}',
            '.sl-ab-crumb{font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--color-text-primary);margin:0 0 6px}',
            '.sl-ab-row{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 6px}',
            '.sl-ab-sub{padding-left:12px;border-left:2px solid var(--color-border-thin)}',
            // the menu's links keep the sidebar's skin rules (some with !important); in the bar they are tabs on a light page
            '#sl-areabar .asb-item,#sl-areabar .sl-ab-grp{display:inline-flex;align-items:center;padding:6px 12px !important;border-radius:999px;border:1px solid var(--color-border-thin) !important;background:var(--color-surface-1) !important;color:var(--color-text-primary) !important;font-size:12.5px;font-weight:600 !important;cursor:pointer;white-space:nowrap;text-decoration:none;text-shadow:none !important}',
            '#sl-areabar .asb-item .asb-lbl{color:inherit !important}',
            '#sl-areabar .asb-item::before,#sl-areabar .asb-item::after{display:none !important}',
            '#sl-areabar .asb-item .asb-ico{display:none}',
            '#sl-areabar .asb-item:hover,#sl-areabar .sl-ab-grp:hover{background:var(--color-surface-2) !important}',
            '#sl-areabar .asb-item.sl-ab-on,#sl-areabar .asb-item.snav-active,#sl-areabar .sl-ab-grp.sl-ab-on{background:var(--color-accent-soft) !important;border-color:var(--color-accent) !important;color:var(--color-accent) !important}',
            '#sl-areabar .sl-ab-grp::after{content:" ▾";font-size:10px}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(st);
    }

    // ---- wiring: after every page change (switchTab and the workspace openers) ------------------
    var _wrappedOnce = {};   // once per name (a later wrapper over ours does not make us wrap again)
    function _wrap(name) {
        var f = root[name]; if (typeof f !== 'function' || f._navAreas || _wrappedOnce[name]) return;
        _wrappedOnce[name] = true;
        var g = function () { if (name === 'switchWorkspaceTab') _wsSub = String(arguments[0] || ''); else if (name === 'openSystemWorkspace') _wsSub = 'func'; var r = f.apply(this, arguments); try { sync(); setTimeout(sync, 60); } catch (_) {} return r; };
        g._navAreas = true; try { if (root.SLWrap) root.SLWrap.preserve(f, g); } catch (_) {}
        Object.keys(f).forEach(function (k) { try { if (g[k] === undefined) g[k] = f[k]; } catch (_) {} });
        root[name] = g;
    }
    function wire() {
        ['switchTab', 'openSystemWorkspace', 'switchWorkspaceTab'].forEach(_wrap);
        // a system's plan changed: its sections follow at once
        try {
            var PP = root.PROGRAM_PLAN;
            if (PP && typeof PP.setSystemLane === 'function' && !PP.setSystemLane._navAreas) {
                var f = PP.setSystemLane, g = function () { var r = f.apply(this, arguments); try { sync(); } catch (_) {} return r; };
                g._navAreas = true; PP.setSystemLane = g;
            }
        } catch (_) {}
    }
    if (typeof root.addEventListener === 'function' && typeof document !== 'undefined') {
        var boot = function () { if (build()) { wire(); sync(); } };
        root.addEventListener('load', function () { boot(); var n = 0, iv = setInterval(function () { wire(); if (++n >= 20) clearInterval(iv); }, 500); });
        // a program plan or tier change hides or shows links: the sections follow (the gates set style.display)
        // a system's plan tailored in its plan window (its writes stay inside program_plan.js): the sections follow
        root.addEventListener('load', function () {
            var last = '';
            setInterval(function () {
                try {
                    if (_scope === 'aircraft') { last = ''; return; }
                    var sig = _scope + ':' + Object.keys(SYS_LANE_LINKS).concat(['ffmea', 'ppfmea', 'cma', 'ram-reliability', 'ram-mx', 'ram-msg3', 'ram-mmel', 'hfa']).map(function (l) { return _sysLaneOn(l) ? 1 : 0; }).join('');
                    if (sig !== last) { last = sig; sync(); }
                } catch (_) {}
            }, 1500);
        });
        root.addEventListener('load', function () {
            try { var pool = _el('sl-nav-pool'); if (pool && typeof MutationObserver === 'function') new MutationObserver(function () { sync(); }).observe(pool, { attributes: true, subtree: true, attributeFilter: ['style'] }); } catch (_) {}
        });
    }

    var api = { VERSION: VERSION, AREAS: AREAS, PINS: PINS, areaOf: areaOf, sync: sync, open: open, scope: scope, pickScope: pickScope, goto: goto, _build: build };
    try { root.SLNavAreas = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
