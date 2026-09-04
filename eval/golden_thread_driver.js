// eval/golden_thread_driver.js — the GOLDEN-THREAD campaign driver (3–4 Sep 2026).
//
// One complete pass down the thread — decompose → FCIM → FHA → trees → FMEA / PRA /
// ZSA / CMA → the nine HF lanes — into a FRESH project, ACCEPTING at every step, then
// exported as a golden. Three or four such passes are both the new reference snapshots
// and, compared with each other, the consistency measurement (Waqas, 3 Sep).
//
// Unlike campaign_driver.js this one MUTATES the project on purpose: every step's draft
// is applied through SafetyLabAI.applyDraft — the review panel's own executor, no DOM —
// so the snapshot is built by exactly the code an engineer's click runs.
//
// Same disciplines as the capture driver: never touches the DOM; a 'started' record
// is written BEFORE each step so a killed tab leaves evidence; every outcome — landed,
// declined, bailed, threw, timed out — is a record; the store is normalised on read.
// The tool is fed NOTHING beyond what is already in AI Inputs.
//
// Load in the campaign tab, then:   await SLGolden.thread('aeolus-g1')
// Progress:                          SLGolden.summary('aeolus-g1')
// Stop after the current step:       SLGolden.stop()
(function () {
    var KEY = 'slab.golden.v1';
    var STEP_TIMEOUT_MS = 20 * 60 * 1000;   // a 60k-char SDD decompose or a 100-condition FHA can take minutes; a bail returns in ms
    var HF = ['task', 'ergo', 'alloc', 'hea', 'alerts', 'tid', 'cd', 'sa', 'mfc'];

    var THREAD = [
        // 4 Sep 2026 (Waqas): "the AFHA level failure conditions can just be total loss /
        // partial loss [by MAC] because MAC may not be defined till systems get designed and
        // that detail can be parsed out at the SFHA level." So: aircraft first, generic
        // ("Loss of X outside / within MAC limits"); then systems → MAC → system FCIM and
        // SFHA per system, where the MAC detail (copies, counts, sides) is used.
        { step: 'decompose', call: function () { return SafetyLabAI.decompose(); } },
        { step: 'fcim',      call: function () { return SafetyLabAI.populateFcim(); } },
        { step: 'fha',       call: function () { return SafetyLabAI.populateFha(); } },
        { step: 'systems',   call: function () { return SafetyLabAI.decomposeSystems(); } },
        { step: 'mac',       call: function () { return SafetyLabAI.draftMac(); } },
        { step: 'sfcim',     each: 'systems', call: function (sy) { return SafetyLabAI.populateSysFcim(sy.id); } },
        { step: 'sfha',      each: 'systems', call: function (sy) { return SafetyLabAI.populateSfha(sy.id); } },
        { step: 'resources', call: function () { return SafetyLabAI.draftResources(); } },   // electrical / hydraulic / pneumatic / fuel — the CRA lane of the compiled trees
        { step: 'interdep',  direct: interdepSweepAndAccept },
        { step: 'coffe',     direct: function () { return SafetyLabAI.draftCoffe({ fcCap: 200 }); } },
        // F15 step 5 — TREES ARE COMPILED, not drawn: SLLaneTrees.compileAll() builds every
        // lane page from the MAC rules + interdependence + CoFFE residue + resources. The AI
        // synthesiser stays reachable as 'trees-ai' (optional — only when named in opts.only).
        { step: 'trees',     direct: compileTrees },
        { step: 'trees-ai',  call: function () { return SafetyLabAI.synthesizeTree(); }, optional: true },
        { step: 'fmea',      call: function () { return SafetyLabAI.draftFmea(); } },
        { step: 'pra',       call: function () { return SafetyLabAI.draftPra(); } },
        { step: 'zsa',       call: function () { return SafetyLabAI.draftZsa(); } },
        { step: 'cma',       call: function () { return SafetyLabAI.draftCma(); } }
    ].concat(HF.map(function (k) { return { step: 'hf:' + k, lane: k, call: function () { return SafetyLabAI.draftHfLane(k); } }; }));

    // ---- direct steps: lanes that do not go through the review panel -------------
    // The interdependence sweep writes PROPOSED cells straight into the store (a
    // proposal is never a review). For the campaign the harness then accepts every
    // proposal the way an engineer's signature would — marked as harness-accepted,
    // TESTING ONLY (Waqas, 3 Sep: "accept without a click is just for testing") —
    // so CoFFE, the MAC and the compiled trees downstream have contributors to work
    // from. The sweep is capped at 25 FCs per call, so it loops until nothing is
    // left unreviewed or it stops making progress.
    async function interdepSweepAndAccept() {
        if (typeof idpAiSweep !== 'function' || typeof idpStats !== 'function' || typeof _idpStore !== 'function') throw new Error('interdependence sweep not available on this page');
        var before = idpStats(), loops = 0, last = -1, calls = 0;
        while (loops < 12) {
            var st = idpStats();
            var empty = st.unreviewed - st.proposed;
            if (empty <= 0 || empty === last) break;
            last = empty; loops++; calls++;
            await idpAiSweep();
        }
        var store = _idpStore(), accepted = 0, cleared = 0, model = '';
        Object.keys(store.cells).forEach(function (k) {
            var c = store.cells[k];
            if (!c || c.state !== 'proposed') return;
            model = model || c.model || '';
            store.cells[k] = { state: c.dir === 'clear' ? 'cleared' : 'asserted', by: 'AI (' + (c.model || 'model') + ') — harness-accepted, TESTING ONLY', at: new Date().toISOString(), note: 'AI-proposed, harness-accepted: ' + (c.why || ''), aiProposed: true };
            if (c.dir === 'clear') cleared++; else accepted++;
        });
        try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
        try { if (typeof renderInterdepPage === 'function') renderInterdepPage(); } catch (_) {}
        var after = idpStats();
        return { sweeps: calls, before: before, after: after, accepted: accepted, cleared: cleared, model: model };
    }

    // F15 step 5 — compile the multifunction / multisystem trees from the lanes.
    function compileTrees() {
        var LT = window.SLLaneTrees;
        if (!LT || typeof LT.compileAll !== 'function') throw new Error('SLLaneTrees.compileAll not available on this page');
        var before = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.length : null;
        var res = LT.compileAll();
        var findings = [];
        try {
            ((projectConfig.macModels) || []).forEach(function (r) {
                var c = LT.compile(r.id);
                (c.findings || []).forEach(function (f) { findings.push({ rule: r.id, subId: r.subId, kind: f.kind, msg: String(f.msg || '').slice(0, 200) }); });
            });
        } catch (_) {}
        var after = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.length : null;
        try { if (typeof renderFTASidebar === 'function') renderFTASidebar(); } catch (_) {}
        return { rules: res.rules, pages: res.pages, findings: res.findings, findingDetail: findings.slice(0, 60), pagesBefore: before, pagesAfter: after };
    }

    function read() {
        var v = null;
        try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { v = null; }
        if (!v || typeof v !== 'object' || !Array.isArray(v.steps)) return { steps: [] };
        return v;
    }
    function write(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
    function put(rec) {
        var s = read(), i = -1;
        for (var k = 0; k < s.steps.length; k++) if (s.steps[k].run === rec.run && s.steps[k].step === rec.step) { i = k; break; }
        if (i >= 0) s.steps[i] = rec; else s.steps.push(rec);
        write(s); return rec;
    }
    // project row counts, read from the page's own stores (not the lagging autosave)
    function counts() {
        var g = function (n) { try { var v = eval(n); return Array.isArray(v) ? v.length : null; } catch (_) { return null; } };
        var hf = {};
        try { HF.forEach(function (k) { var v = (window.HF_ANALYSES && HF_ANALYSES.rows) ? HF_ANALYSES.rows(k) : null; if (Array.isArray(v)) hf[k] = v.length; }); } catch (_) {}
        var idp = null, mac = null, coffe = null, sysFns = null;
        try { idp = (typeof idpStats === 'function') ? idpStats() : null; } catch (_) {}
        try { mac = ((projectConfig.macModels) || []).length; } catch (_) {}
        try { coffe = Object.keys((projectConfig.coffe && projectConfig.coffe.verdicts) || {}).length; } catch (_) {}
        try { sysFns = (systemsData || []).reduce(function (n, sy) { return n + ((sy.functions || []).length); }, 0); } catch (_) {}
        var sysFcim = null, sysFha = null;
        try { sysFcim = (systemsData || []).reduce(function (n, sy) { return n + ((sy.fcim || []).length); }, 0); sysFha = (systemsData || []).reduce(function (n, sy) { return n + ((sy.fha || []).length); }, 0); } catch (_) {}
        return { functions: g('acFunctionsData'), fcim: g('acFcimData'), fha: g('acFhaData'), systems: g('systemsData'), systemFunctions: sysFns, systemFcim: sysFcim, systemFha: sysFha, interdep: idp ? { contributes: idp.contributes, cleared: idp.cleared, unreviewed: idp.unreviewed, proposed: idp.proposed, multi: idp.multi } : null, mac: mac, coffeVerdicts: coffe, trees: g('ftaPages'), fmea: g('fmeaData'), pra: g('praData'), zsa: g('zsaData'), cma: g('cmaData'), assumptions: g('acAssumptionsData'), aiLedger: g('aiAssumptions'), hf: hf };
    }
    // the page's project name is a top-level `let`, so it is reachable by name but not via window
    function _pname() { try { return String(projectName || ''); } catch (_) { try { return document.title; } catch (__) { return ''; } } }

    async function step(run, s, timeoutMs) {
        var rec = { run: run, step: s.step, state: 'started', at: Date.now(), project: _pname(), before: counts() };
        put(rec);
        if (typeof s.direct === 'function') {   // F15 — no review panel to capture; the lane reports its own numbers
            var t1 = Date.now();
            try { rec.direct = await s.direct(); rec.ok = true; }
            catch (e) { rec.ok = false; rec.error = 'direct step threw: ' + ((e && e.message) || e); }
            rec.secs = Math.round((Date.now() - t1) / 1000); rec.state = 'done'; rec.after = counts();
            return put(rec);
        }
        try { SafetyLabAI.evalFresh = true; } catch (_) {}
        var p = SafetyLabAI.captureNextDraft(timeoutMs || STEP_TIMEOUT_MS);
        var t0 = Date.now();
        try { s.call(); }
        catch (e) {
            p.catch(function () {});
            try { SafetyLabAI.captureCancel(); } catch (_) {}
            rec.state = 'done'; rec.ok = false; rec.error = 'lane threw: ' + ((e && e.message) || e); rec.secs = 0; return put(rec);
        }
        var d;
        try { d = await p; }
        catch (e) { rec.state = 'done'; rec.ok = false; rec.error = String((e && e.message) || e); rec.secs = Math.round((Date.now() - t0) / 1000); return put(rec); }
        rec.secs = Math.round((Date.now() - t0) / 1000);
        rec.skill = d.skill || null; rec.feature = d.feature || ''; rec.declined = !!d.declined; rec.bailed = !!d.bailed;
        rec.reason = String(d.reason || d.reply || '').slice(0, 300);
        rec.saidToUser = String(d.saidToUser || '').slice(0, 300);   // the tool's own words, kept separately (4 Sep: the guard's reason masked them)
        rec.drafted = Array.isArray(d.items) ? d.items.length : 0;
        rec.assumptionsDeclared = Array.isArray(d.assumptions) ? d.assumptions.length : 0;
        rec.coverage = d.coverage || null;
        rec.judgementDrafted = (d.items || []).filter(function (x) { return x && x.judgementCall === true; }).length;
        if (d.declined) { rec.ok = true; rec.state = 'done'; rec.apply = null; rec.after = counts(); return put(rec); }
        var ap;
        try { ap = SafetyLabAI.applyDraft(d, { lane: s.lane }); }
        catch (e) { rec.state = 'done'; rec.ok = false; rec.error = 'apply threw: ' + ((e && e.message) || e); rec.after = counts(); return put(rec); }
        rec.apply = { applied: ap.applied, updated: ap.updated, blocked: ap.blocked, protected: ap.protected, failed: ap.failed, unsupported: ap.unsupported, judgement: ap.judgement };
        rec.applyDetail = (ap.results || []).filter(function (r) { return r && (r.ok === false || r.kind); }).slice(0, 40);
        rec.ok = (ap.failed === 0 && ap.unsupported === 0);
        rec.state = 'done'; rec.after = counts();
        return put(rec);
    }

    function exportGolden(run) {
        var rec = { run: run, step: 'export', state: 'started', at: Date.now(), project: _pname() };
        put(rec);
        try {
            var g = SafetyLabAI.runRepeatabilityExport();   // downloads <meta.name>.json to Downloads; also returned
            rec.name = g && g.meta ? g.meta.name : null;
            rec.sizes = g ? Object.keys(g).filter(function (k) { return Array.isArray(g[k]); }).reduce(function (o, k) { o[k] = g[k].length; return o; }, {}) : null;
            rec.ok = !!rec.name;
        } catch (e) { rec.ok = false; rec.error = String((e && e.message) || e); }
        rec.state = 'done'; rec.after = counts();
        return put(rec);
    }

    async function thread(run, opts) {
        opts = opts || {};
        window.__goldenStop = false;
        var only = opts.only ? [].concat(opts.only) : null;
        var skip = opts.skip ? [].concat(opts.skip) : [];
        var out = [];
        for (var i = 0; i < THREAD.length; i++) {
            var s = THREAD[i];
            if (only && only.indexOf(s.step) < 0) continue;
            if (skip.indexOf(s.step) >= 0) continue;
            if (s.optional && !(only && only.indexOf(s.step) >= 0)) continue;   // 'trees-ai' runs only when named
            if (window.__goldenStop) { console.info('[golden] stopped before ' + s.step); break; }
            if (s.each === 'systems') {   // F15 — one captured lane call per system (system FCIM, SFHA)
                var syss = (typeof systemsData !== 'undefined' && systemsData) ? systemsData.slice() : [];
                if (!syss.length) { var r0 = { run: run, step: s.step, state: 'done', ok: false, error: 'no systems in the project', at: Date.now(), project: _pname() }; put(r0); out.push(r0); console.info('[golden] ' + run + ' ' + s.step + ': FAIL · no systems'); if (opts.stopOnFail) break; continue; }
                for (var k = 0; k < syss.length; k++) {
                    if (window.__goldenStop) break;
                    var sy = syss[k];
                    var rs = await step(run, { step: s.step + ':' + (sy.name || sy.id), call: (function (fn, x) { return function () { return fn(x); }; })(s.call, sy) }, opts.timeoutMs);
                    console.info('[golden] ' + run + ' ' + s.step + ' · ' + (sy.name || sy.id) + ': ' + (rs.ok ? 'ok' : 'FAIL') + ' · drafted ' + (rs.drafted || 0));
                    out.push(rs);
                }
                continue;
            }
            var r = await step(run, s, opts.timeoutMs);
            console.info('[golden] ' + run + ' ' + s.step + ': ' + (r.ok ? 'ok' : 'FAIL') + ' · drafted ' + (r.drafted || 0) + (r.apply ? (' · applied ' + r.apply.applied + ' updated ' + r.apply.updated + ' blocked ' + r.apply.blocked + ' protected ' + r.apply.protected + ' failed ' + r.apply.failed + ' unsupported ' + r.apply.unsupported + ' judgement ' + r.apply.judgement) : '') + (r.declined ? (' · DECLINED: ' + r.reason) : '') + (r.error ? (' · ERROR: ' + r.error) : '') + ' · ' + r.secs + 's');
            out.push(r);
            if (opts.stopOnFail && !r.ok) break;
        }
        if (!window.__goldenStop && !opts.noExport) out.push(exportGolden(run));
        return summary(run);
    }

    function summary(run) {
        var s = read().steps.filter(function (x) { return !run || x.run === run; });
        return s.map(function (r) { return { run: r.run, step: r.step, state: r.state, ok: r.ok, secs: r.secs, drafted: r.drafted, judgement: r.judgementDrafted, apply: r.apply, declined: r.declined, reason: r.reason, error: r.error, after: r.after, name: r.name }; });
    }
    function pending() { return read().steps.filter(function (r) { return r.state === 'started'; }); }
    function stop() { window.__goldenStop = true; return 'will stop after the current step'; }

    window.SLGolden = { KEY: KEY, THREAD: THREAD, HF: HF, step: step, thread: thread, exportGolden: exportGolden, read: read, summary: summary, pending: pending, counts: counts, stop: stop };
})();
