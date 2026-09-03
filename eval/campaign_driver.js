// ============================================================================
// eval/campaign_driver.js — the consistency-campaign driver (4 Sep 2026).
//
// Paste once into the app's console (or load it), then drive lanes by name. It
// exists in the REPO rather than in a console scratchpad because the 3 Sep
// campaign died three times with its logic living only in a tab: markup drift,
// a ghost "Accept all" from another project's panel, and finally the tab itself
// going away. Logic in a diff can be reviewed, tested and re-run; logic in a
// console cannot.
//
// It never touches the DOM. Every draw goes through THE CAPTURE SEAM
// (SafetyLabAI.captureNextDraft) — the same code path the engineer runs,
// resolved one line before it would render. Nothing is applied, so the project
// is never mutated and no rows need un-accepting between runs.
//
// DURABILITY (rule 25). A record is written BEFORE the draw ('started') and
// again after it lands ('ok'/'failed'). An interrupted run is therefore
// visible as an unfinished record instead of vanishing — the failure mode that
// cost two draws on 4 Sep, when the result lived only in a page variable.
// ============================================================================
(function () {
    'use strict';
    var KEY = 'slab.campaign.v1';
    // NORMALISE, don't just parse. A value that is valid JSON but the wrong shape
    // (a leftover from an earlier scratch harness, a half-written store) used to sail
    // through the try/catch and then explode on .runs.filter — found live, 4 Sep.
    function read() {
        var v = null;
        try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { v = null; }
        if (!v || typeof v !== 'object' || !Array.isArray(v.runs)) return { runs: [] };
        return v;
    }
    function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { try { console.warn('[camp] store write failed', e); } catch (_) {} return false; } }
    function put(rec) {                        // upsert by tag, so 'started' becomes the result
        var s = read(), i = -1;
        for (var k = 0; k < s.runs.length; k++) if (s.runs[k].tag === rec.tag) { i = k; break; }
        if (i >= 0) s.runs[i] = rec; else s.runs.push(rec);
        write(s); return s.runs.length;
    }
    function counts(a) { var o = {}; (a || []).forEach(function (x) { var k = x == null || x === '' ? '(blank)' : String(x); o[k] = (o[k] || 0) + 1; }); return o; }

    // ---- the lanes, by name. Each returns a thunk that STARTS one draft. ----
    // Unit-scoped lanes take ids; document-only lanes take nothing. Every entry
    // is the app's OWN public function — the driver adds no prompt of its own.
    var LANES = {
        fha:      function (u) { return function () { return SafetyLabAI.populateFha({ condIds: u }); }; },
        fhaFuncs: function (u) { return function () { return SafetyLabAI.populateFha({ funcIds: u }); }; },
        fcim:     function (u) { return function () { return SafetyLabAI.populateFcim(u && u.length ? { funcIds: u } : undefined); }; },
        decompose:function ()  { return function () { return SafetyLabAI.decompose(); }; },
        pra:      function ()  { return function () { return SafetyLabAI.draftPra(); }; },
        zsa:      function ()  { return function () { return SafetyLabAI.draftZsa(); }; },
        cma:      function ()  { return function () { return SafetyLabAI.draftCma(); }; },
        fmea:     function ()  { return function () { return SafetyLabAI.draftFmea(); }; },
        hf:       function (u) { return function () { return SafetyLabAI.draftHfLane(u); }; }   // u = lane key, e.g. 'tid'
    };

    // One draw. Returns the record; never throws.
    async function draw(tag, lane, units, timeoutMs) {
        var mk = LANES[lane];
        if (!mk) return put({ tag: tag, lane: lane, ok: false, error: 'unknown lane: ' + lane, at: Date.now() }) && read().runs.pop();
        var t0 = Date.now();
        var before = {
            fha: (typeof acFhaData !== 'undefined' && acFhaData) ? acFhaData.length : -1,
            asm: (typeof acAssumptionsData !== 'undefined' && acAssumptionsData) ? acAssumptionsData.length : -1
        };
        // written FIRST — an interrupted draw leaves this behind (rule 25)
        put({ tag: tag, lane: lane, units: units || null, state: 'started', ok: null,
              project: document.title, model: (SafetyLabAI.MODELS || {}).reason, startedAt: t0 });
        SafetyLabAI.evalFresh = true;              // finding #1 — or the draw is a cached echo
        var p = SafetyLabAI.captureNextDraft(timeoutMs || 900000);
        try { mk(units)(); }
        catch (e) { p.catch(function () {});   // the cancel below rejects it; an unhandled rejection would kill a long campaign
                    try { SafetyLabAI.captureCancel(); } catch (_) {}
                    var bad = { tag: tag, lane: lane, units: units || null, state: 'done', ok: false,
                                error: 'call threw: ' + String((e && e.message) || e), secs: 0, at: Date.now() };
                    put(bad); return bad; }
        var rec;
        try {
            var d = await p;
            rec = { tag: tag, lane: lane, units: units || null, state: 'done', ok: true,
                    secs: Math.round((Date.now() - t0) / 1000), project: document.title,
                    model: (SafetyLabAI.MODELS || {}).reason, skill: d.skill, feature: d.feature,
                    declined: !!d.declined, n: d.items.length, coverage: d.coverage || null,
                    verifyReport: d.verifyReport || null, assumptions: d.assumptions || [], items: d.items,
                    // the seam's promise, asserted every single draw rather than trusted
                    mutated: { fha: ((typeof acFhaData !== 'undefined' && acFhaData) ? acFhaData.length : -1) - before.fha,
                               asm: ((typeof acAssumptionsData !== 'undefined' && acAssumptionsData) ? acAssumptionsData.length : -1) - before.asm },
                    at: Date.now() };
        } catch (e) {
            rec = { tag: tag, lane: lane, units: units || null, state: 'done', ok: false,
                    secs: Math.round((Date.now() - t0) / 1000), error: String((e && e.message) || e), at: Date.now() };
        }
        put(rec);
        try {
            console.info('[camp] ' + tag + ' → ' + (rec.ok ? (rec.n + ' row(s) in ' + rec.secs + 's · ' + rec.skill
                + (rec.mutated && (rec.mutated.fha || rec.mutated.asm) ? ' · ⚠ PROJECT MUTATED ' + JSON.stringify(rec.mutated) : ' · project untouched'))
                : ('FAILED after ' + rec.secs + 's: ' + rec.error)));
        } catch (_) {}
        return rec;
    }

    // N draws of one lane over the SAME units, sequential (parallel draws would
    // share the app's single capture slot and the provider's rate limit).
    async function runs(lane, units, n, tagBase) {
        var out = [];
        for (var i = 1; i <= (n || 3); i++) out.push(await draw((tagBase || lane) + '-r' + i, lane, units));
        return out;
    }

    // ---- scoring ------------------------------------------------------------
    // Consistency only. Accuracy needs a golden and is scored offline against
    // eval/golden_*.json — a number computed here would have no reference.
    function score(tagBase) {
        var rs = read().runs.filter(function (r) { return r.ok && r.tag.indexOf(tagBase) === 0; });
        if (rs.length < 2) return { error: 'need >=2 completed runs for ' + tagBase, have: rs.length };
        var idOf = function (it) { return String((it && (it.srcCondId || it.fcId || it.subId)) || '').trim(); };
        var per = rs.map(function (r) { var m = {}; (r.items || []).forEach(function (it) { var k = idOf(it); if (k && !m[k]) m[k] = it; }); return { tag: r.tag, n: r.items.length, m: m, secs: r.secs }; });
        var ids = Object.keys(per[0].m).filter(function (k) { return per.every(function (p) { return p.m[k]; }); });
        var AX = { severity: 'severity', ac: 'effAcLevel', crew: 'effCrewLevel', pax: 'effPaxLevel' };
        var fields = {};
        Object.keys(AX).forEach(function (f) {
            var agree = 0, both = 0, flips = 0, values = [];
            ids.forEach(function (k) {
                var vs = per.map(function (p) { return String(p.m[k][AX[f]] || '').trim().toLowerCase(); });
                values.push(vs.join(' | '));
                var set = vs.filter(Boolean);
                if (set.length === vs.length) { both++; if (vs.every(function (v) { return v === vs[0]; })) agree++; }
                else if (set.length) flips++;                     // committed in one run, blank in another
            });
            fields[f] = { bothCommitted: both, agreed: agree, agreement: both ? +(agree / both).toFixed(3) : null,
                          commitmentFlips: flips, disagreements: values.filter(function (v) { var a = v.split(' | '); return a.every(Boolean) && !a.every(function (x) { return x === a[0]; }); }) };
        });
        return { tagBase: tagBase, runs: per.map(function (p) { return { tag: p.tag, rows: p.n, secs: p.secs }; }),
                 rowSpread: { min: Math.min.apply(null, per.map(function (p) { return p.n; })), max: Math.max.apply(null, per.map(function (p) { return p.n; })) },
                 matchedOnAllRuns: ids.length, fields: fields };
    }

    window.SLCampaign = { LANES: Object.keys(LANES), draw: draw, runs: runs, score: score,
        read: read, clear: function () { localStorage.removeItem(KEY); },
        pending: function () { return read().runs.filter(function (r) { return r.state === 'started'; }).map(function (r) { return r.tag; }); },
        summary: function () { return read().runs.map(function (r) { return { tag: r.tag, lane: r.lane, state: r.state, ok: r.ok, n: r.n, secs: r.secs, model: r.model, skill: r.skill, error: r.error, mutated: r.mutated }; }); },
        exportJson: function () { return JSON.stringify(read(), null, 1); } };
    try { console.info('[camp] driver ready — SLCampaign.runs(lane, units, 3, tag) · lanes: ' + Object.keys(LANES).join(', ')); } catch (_) {}
})();
