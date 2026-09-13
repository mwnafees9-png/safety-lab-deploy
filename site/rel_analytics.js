// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// rel_analytics.js — Phase F5: the reliability analytics suite.
// BORN MODULAR: new file, zero monolith edits; store under
// projectConfig.relAnalytics (auto-serialized); wraps switchTab for its views.
//
//   Weibull life-data analysis — median-rank regression (Benard) with
//     suspension handling via Johnson rank adjustment; β, η, B-lives,
//     MTBF via Γ(1+1/β) (Lanczos gamma); r² fit quality.
//   Crow-AMSAA reliability growth — NHPP power-law MLE (time-terminated):
//     β̂ = N/Σln(T/tᵢ), λ̂ = N/T^β̂; cumulative & instantaneous MTBF; α = 1−β̂.
//   Reliability allocation — series λ budget split by feasibility weights.
//   Spares — Poisson protection level: min s with P(X ≤ s) ≥ PL.
//   Demonstration planning — required test time T = m·χ²(C; 2r+2)/2.
//
// Two-lane discipline: everything here is the COMPUTED lane over elicited
// datasets (failure times, suspensions, demands). Fitted parameters never
// overwrite entered λ values anywhere else in the model.

(function () {
    'use strict';

    // ---------------------------------------------------------------- store
    function _store() {
        if (!projectConfig.relAnalytics) projectConfig.relAnalytics = { lifeData: [], growth: [], alloc: null, spares: [], demo: null };
        const r = projectConfig.relAnalytics;
        if (!Array.isArray(r.lifeData)) r.lifeData = [];
        if (!Array.isArray(r.growth)) r.growth = [];
        if (!Array.isArray(r.spares)) r.spares = [];
        return r;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    function _ask(msg, dflt) { return slPrompt(msg, dflt || ''); }
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _access() { return (typeof window._ramHasAccess === 'function') ? window._ramHasAccess() : true; }
    const _gate = host => { host.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:26px 30px; "><h3 style="margin:0 0 10px; border:none; padding:0;">Reliability analytics is a Pro+ capability</h3><p style="font-size:13px; color:var(--color-text-secondary);">Weibull life data, Crow-AMSAA growth, allocation, spares and demonstration planning.</p></div>'; };
    const _chip = (l, v, warn) => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + l + ' <b style="margin-left:6px;' + (warn ? ' color:#B45309;' : '') + '">' + v + '</b></div>';

    // ================================================================ math
    // Lanczos gamma (g=7, n=9) — |rel err| < 1e-13 over the domain we use.
    const _LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    function gammaFn(x) {
        if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
        x -= 1;
        let a = _LG[0];
        const t = x + 7.5;
        for (let i = 1; i < 9; i++) a += _LG[i] / (x + i);
        return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
    }

    // Weibull median-rank regression. data: [{t, suspended}] — suspensions
    // shift the adjusted ranks of later failures (Johnson) but contribute no
    // plotting point. Benard's approximation for the median rank.
    function weibullMrr(data) {
        const sorted = data.slice().sort((a, b) => a.t - b.t);
        const n = sorted.length;
        const pts = [];
        let prevAR = 0, seen = 0;
        sorted.forEach(d => {
            seen++;
            if (d.suspended) return;
            const remaining = n - seen + 1;
            const ar = prevAR + (n + 1 - prevAR) / (1 + remaining);
            prevAR = ar;
            const mr = (ar - 0.3) / (n + 0.4);            // Benard
            pts.push({ x: Math.log(d.t), y: Math.log(-Math.log(1 - mr)), t: d.t, mr });
        });
        if (pts.length < 2) return null;
        const m = pts.length;
        const sx = pts.reduce((a, p) => a + p.x, 0), sy = pts.reduce((a, p) => a + p.y, 0);
        const sxx = pts.reduce((a, p) => a + p.x * p.x, 0), sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
        const beta = (m * sxy - sx * sy) / (m * sxx - sx * sx);
        const intercept = (sy - beta * sx) / m;
        const eta = Math.exp(-intercept / beta);
        const syy = pts.reduce((a, p) => a + p.y * p.y, 0);
        const r2 = Math.pow(m * sxy - sx * sy, 2) / ((m * sxx - sx * sx) * (m * syy - sy * sy));
        const bLife = p => eta * Math.pow(-Math.log(1 - p), 1 / beta);
        return {
            beta, eta, r2, points: pts,
            b10: bLife(0.10), b50: bLife(0.50),
            mtbf: eta * gammaFn(1 + 1 / beta),
            failures: m, suspensions: n - m,
            regime: beta < 0.95 ? 'infant mortality (β<1) — screening/burn-in territory'
                : beta <= 1.05 ? 'constant rate (β≈1) — exponential assumption holds'
                : 'wear-out (β>1) — hard-time candidate; challenge the constant-rate assumption (CCMR E.3.2.5)',
        };
    }

    // Crow-AMSAA NHPP power-law, time-terminated MLE.
    // times: cumulative test times of failures (ascending); T: total test time.
    function crowAmsaa(times, T) {
        const N = times.length;
        if (N < 2 || !(T > 0)) return null;
        const sumLn = times.reduce((a, t) => a + Math.log(T / t), 0);
        const beta = N / sumLn;
        const lambda = N / Math.pow(T, beta);
        const instMtbf = 1 / (lambda * beta * Math.pow(T, beta - 1));
        // Cramér–von Mises goodness of fit with the unbiased β̄ = (N−1)/N · β̂:
        // C² = 1/(12N) + Σ[ (tᵢ/T)^β̄ − (2i−1)/(2N) ]². Compared against the
        // large-sample 10% critical value 0.173 (small N: treat as indicative).
        const betaBar = (N - 1) / N * beta;
        const sorted = times.slice().sort((a, b) => a - b);
        let c2 = 1 / (12 * N);
        sorted.forEach((t, i) => { const u = Math.pow(t / T, betaBar); const m = (2 * (i + 1) - 1) / (2 * N); c2 += (u - m) * (u - m); });
        const gofPass = c2 <= 0.173;
        // Forward projection assuming the observed trend continues.
        const projectMtbf = (Tf) => 1 / (lambda * beta * Math.pow(Tf, beta - 1));
        return {
            beta, lambda, N, T,
            cumMtbf: T / N,
            instMtbf,
            growthRate: 1 - beta,
            cvm: c2, gofPass, betaBar,
            projectMtbf,
            verdict: beta < 1 ? 'reliability GROWING (β<1)' : beta > 1 ? 'reliability DETERIORATING (β>1)' : 'no trend',
        };
    }

    // Crow-AMSAA on GROUPED data — least-squares regression of ln N(t) vs ln t
    // over cumulative (t, N) inspection points. The method reliability-growth
    // data usually arrives in (as opposed to individual failure times → MLE).
    // Fits ln N = ln λ + β ln t; β = slope, λ = e^intercept, matching crowAmsaa's
    // convention so the two lanes report the same quantities.
    function crowAmsaaGrouped(points) {
        const pts = (points || []).filter(p => p && p.t > 0 && p.N > 0);
        const n = pts.length;
        if (n < 2) return null;
        const x = pts.map(p => Math.log(p.t)), y = pts.map(p => Math.log(p.N));
        const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); }
        if (!(sxx > 0)) return null;
        const beta = sxy / sxx;
        const intercept = my - beta * mx;      // = ln λ
        const lambda = Math.exp(intercept);
        const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
        const T = pts[n - 1].t;                // last cumulative time
        const instMtbf = 1 / (lambda * beta * Math.pow(T, beta - 1));
        const projectMtbf = (Tf) => 1 / (lambda * beta * Math.pow(Tf, beta - 1));
        // Solve inst-MTBF(Tf) = m  →  Tf = (1/(m·λ·β))^(1/(β−1)).
        const timeToMtbf = (m) => (beta === 1) ? null : Math.pow(1 / (m * lambda * beta), 1 / (beta - 1));
        return {
            beta, lambda, intercept, r2, N: pts[n - 1].N, T,
            cumMtbf: T / pts[n - 1].N, instMtbf, growthRate: 1 - beta,
            projectMtbf, timeToMtbf,
            verdict: beta < 1 ? 'reliability GROWING (β<1)' : beta > 1 ? 'reliability DETERIORATING (β>1)' : 'no trend',
            grouped: true,
        };
    }

    // AGREE reliability allocation — λᵢ = nᵢ·(−ln R'(T)) / (Σn · Eᵢ · tᵢ);
    // Rᵢ(tᵢ) = e^(−λᵢ·tᵢ). Weights each series subsystem by its module count
    // (complexity) and importance factor Eᵢ (0–1). Rsys = Π Rᵢ.
    function agreeAllocate(Rsys, subs) {
        const list = (subs || []).filter(s => s && s.n > 0 && s.E > 0 && s.t > 0);
        if (!(Rsys > 0 && Rsys < 1) || list.length < 1) return null;
        const N = list.reduce((a, s) => a + s.n, 0);
        const negln = -Math.log(Rsys);
        const rows = list.map(s => {
            const lambda = s.n * negln / (N * s.E * s.t);
            const Ri = Math.exp(-lambda * s.t);         // raw subsystem reliability (design target)
            return { name: s.name, n: s.n, E: s.E, t: s.t, lambda, Ri };
        });
        // Formal AGREE guarantee is on the IMPORTANCE-WEIGHTED reliability:
        // Reff = exp(−Σ Eᵢλᵢtᵢ), which reconstitutes R'(T) exactly. The raw
        // product ΠRᵢ only equals R'(T) when every Eᵢ = 1.
        const Reff = Math.exp(-rows.reduce((a, r) => a + r.E * r.lambda * r.t, 0));
        const RprodRaw = rows.reduce((a, r) => a * r.Ri, 1);
        return { method: 'AGREE', Rreq: Rsys, N, rows, Rachieved: Reff, RprodRaw, meets: Reff >= Rsys - 1e-9 };
    }

    // ARINC allocation — apportions a series λ budget in proportion to each
    // subsystem's PREDICTED failure rate: λᵢ = λ_sys · λ̂ᵢ / Σλ̂. The weakest
    // (highest-rate) subsystem carries the largest share of the budget.
    function arincAllocate(target, subs) {
        const list = (subs || []).filter(s => s && s.pred > 0);
        if (!(target > 0) || list.length < 1) return null;
        const sum = list.reduce((a, s) => a + s.pred, 0);
        const rows = list.map(s => ({ name: s.name, pred: s.pred, weight: s.pred / sum, lambda: target * s.pred / sum }));
        return { method: 'ARINC', target, rows };
    }

    // Poisson spares: min s with Σ_{k≤s} e^{−d}·d^k/k! ≥ PL.
    function sparesLevel(demand, protectionLevel) {
        if (!(demand >= 0)) return null;
        let s = 0, term = Math.exp(-demand), cdf = term;
        while (cdf < protectionLevel && s < 1000) {
            s++;
            term *= demand / s;
            cdf += term;
        }
        return { s, achieved: cdf };
    }

    // Attribute (success/failure) demonstration: zero-failure sample size to
    // show reliability R at one-sided confidence C: n = ln(1−C)/ln(R).
    function attrTestN(R, C) {
        if (!(R > 0 && R < 1 && C > 0 && C < 1)) return null;
        return Math.ceil(Math.log(1 - C) / Math.log(R));
    }

    // Demonstration test time: accept on ≤ r failures at confidence C for
    // target MTBF m: T = m · χ²(C; 2r+2) / 2  (time-terminated).
    function demoTestTime(mtbf, r, C) {
        const chi2 = (typeof window._ramChi2Q === 'function') ? window._ramChi2Q(C, 2 * r + 2) : null;
        return chi2 != null ? mtbf * chi2 / 2 : null;
    }

    // ============================================================== actions
    async function relAddLifeSet() {
        if (!_access()) return;
        const name = await _ask('Life-data set name (e.g. "Brake shuttle valve, bench + field"):'); if (!name || !name.trim()) return;
        const ft = (await _ask('Failure times (hours, comma-separated):', '150, 320, 480, 710, 990')) || '';
        const st = (await _ask('Suspension times (hours, comma-separated: units removed unfailed; blank if none):', '')) || '';
        const failures = ft.split(',').map(x => parseFloat(x)).filter(x => x > 0);
        const susp = st.split(',').map(x => parseFloat(x)).filter(x => x > 0);
        if (failures.length < 2) { _toast('Need at least two failure times.', 'warning'); return; }
        _store().lifeData.push({ id: 'LD-' + Date.now(), name: name.trim(), failures, suspensions: susp });
        _save(); renderRamWeibullPage();
    }
    async function relDeleteLifeSet(id) {
        const s = _store();
        const i = s.lifeData.findIndex(x => x.id === id);
        if (i < 0) return;
        if (!(await slConfirm('Remove this data set?', { danger: true, okText: 'Remove' }))) return;
        s.lifeData.splice(i, 1); _save(); renderRamWeibullPage();
    }
    async function relAddGrowth() {
        if (!_access()) return;
        const name = await _ask('Growth test name (e.g. "DVT campaign, prototype 2"):'); if (!name || !name.trim()) return;
        const ft = (await _ask('Cumulative failure times (test hours, ascending, comma-separated):', '12, 45, 110, 260, 480')) || '';
        const T = parseFloat(await _ask('Total accumulated test time (hours):', '600')) || 0;
        const times = ft.split(',').map(x => parseFloat(x)).filter(x => x > 0).sort((a, b) => a - b);
        if (times.length < 2 || !(T >= times[times.length - 1])) { _toast('Need ≥2 failures and T ≥ the last failure time.', 'warning', 3500); return; }
        _store().growth.push({ id: 'GR-' + Date.now(), name: name.trim(), times, T });
        _save(); renderRamGrowthPage();
    }
    async function relDeleteGrowth(id) {
        const s = _store();
        const i = s.growth.findIndex(x => x.id === id);
        if (i < 0) return;
        if (!(await slConfirm('Remove this growth test?', { danger: true, okText: 'Remove' }))) return;
        s.growth.splice(i, 1); _save(); renderRamGrowthPage();
    }
    async function relAddGrowthGrouped() {
        if (!_access()) return;
        const name = await _ask('Grouped growth test name (e.g. "Field campaign, monthly cumulative"):'); if (!name || !name.trim()) return;
        const ts = (await _ask('Cumulative test times at each inspection (hours, ascending, comma-separated):', '1000, 2000, 3000, 4000, 5000, 6000')) || '';
        const Ns = (await _ask('Cumulative failure count at each of those times (comma-separated, same order):', '4, 7, 9, 11, 12, 13')) || '';
        const tArr = ts.split(',').map(x => parseFloat(x)).filter(x => x > 0);
        const nArr = Ns.split(',').map(x => parseFloat(x));
        if (tArr.length < 2 || tArr.length !== nArr.length) { _toast('Need ≥2 points with matching time and cumulative-count entries.', 'warning', 3500); return; }
        const points = tArr.map((t, i) => ({ t, N: nArr[i] })).filter(p => p.t > 0 && p.N > 0);
        if (points.length < 2) { _toast('Need ≥2 valid (time, cumulative-count) points.', 'warning', 3500); return; }
        _store().growth.push({ id: 'GR-' + Date.now(), name: name.trim(), mode: 'grouped', points });
        _save(); renderRamGrowthPage();
    }
    async function relRunAlloc() {
        if (!_access()) return;
        const target = parseFloat(await _ask('System failure-rate budget to allocate (λ per hour, series architecture):', '1e-4'));
        if (!(target > 0)) return;
        const names = (await _ask('Subsystems (comma-separated):', 'Flight controls, Avionics, Electrical, Landing gear')) || '';
        const weights = (await _ask('Feasibility/complexity weights (comma-separated, same order, heavier weight = more budget):', '2, 3, 2, 1')) || '';
        const ns = names.split(',').map(x => x.trim()).filter(Boolean);
        const ws = weights.split(',').map(x => parseFloat(x) || 1);
        if (!ns.length) return;
        const wsum = ns.reduce((a, _, i) => a + (ws[i] || 1), 0);
        _store().alloc = {
            target, at: new Date().toISOString(),
            rows: ns.map((n, i) => ({ name: n, weight: ws[i] || 1, lambda: target * (ws[i] || 1) / wsum })),
        };
        _save(); renderRamAllocPage();
    }
    async function relRunAgree() {
        if (!_access()) return;
        const Rsys = parseFloat(await _ask('System reliability requirement R\'(T) at mission time (0–1):', '0.98'));
        if (!(Rsys > 0 && Rsys < 1)) { _toast('Reliability requirement must be between 0 and 1.', 'warning'); return; }
        const names = (await _ask('Subsystems (comma-separated):', 'Flight controls, Avionics, Landing gear')) || '';
        const modules = (await _ask('Module/component count nᵢ per subsystem (comma-separated, same order: complexity):', '120, 250, 60')) || '';
        const imp = (await _ask('Importance factor Eᵢ per subsystem (0–1, fraction of mission-critical failures that fail the system):', '1, 1, 0.8')) || '';
        const ts = (await _ask('Operating time tᵢ per subsystem over the mission (hours, same order):', '10, 10, 10')) || '';
        const ns = names.split(',').map(x => x.trim()).filter(Boolean);
        const nn = modules.split(',').map(x => parseFloat(x));
        const ee = imp.split(',').map(x => parseFloat(x));
        const tt = ts.split(',').map(x => parseFloat(x));
        if (!ns.length) return;
        const subs = ns.map((name, i) => ({ name, n: nn[i], E: ee[i], t: tt[i] }));
        const res = agreeAllocate(Rsys, subs);
        if (!res) { _toast('Every subsystem needs a positive module count, importance and time.', 'warning', 3500); return; }
        _store().agree = Object.assign({ at: new Date().toISOString() }, res);
        _save(); renderRamAllocPage();
    }
    async function relRunArinc() {
        if (!_access()) return;
        const target = parseFloat(await _ask('System failure-rate budget to allocate (λ per hour, series architecture):', '1e-4'));
        if (!(target > 0)) return;
        const names = (await _ask('Subsystems (comma-separated):', 'Flight controls, Avionics, Electrical, Landing gear')) || '';
        const preds = (await _ask('Predicted / historical failure rate λ̂ᵢ per subsystem (per hour, same order):', '3e-5, 4e-5, 2e-5, 1e-5')) || '';
        const ns = names.split(',').map(x => x.trim()).filter(Boolean);
        const pp = preds.split(',').map(x => parseFloat(x));
        if (!ns.length) return;
        const subs = ns.map((name, i) => ({ name, pred: pp[i] }));
        const res = arincAllocate(target, subs);
        if (!res) { _toast('Every subsystem needs a positive predicted failure rate.', 'warning', 3500); return; }
        _store().arinc = Object.assign({ at: new Date().toISOString() }, res);
        _save(); renderRamAllocPage();
    }
    async function relAddSpares() {
        if (!_access()) return;
        const name = await _ask('Item (e.g. "Brake control unit"):'); if (!name || !name.trim()) return;
        const lam = parseFloat(await _ask('Item λ (per hour):', '5e-5')); if (!(lam > 0)) return;
        const units = parseInt(await _ask('Installed units across the fleet:', '12')) || 1;
        const tat = parseFloat(await _ask('Repair turnaround time (hours):', '720')) || 0;
        const pl = parseFloat(await _ask('Protection level (probability no stockout during turnaround):', '0.95')) || 0.95;
        _store().spares.push({ id: 'SP-' + Date.now(), name: name.trim(), lambda: lam, units, tat, pl });
        _save(); renderRamAllocPage();
    }
    async function relPlanDemo() {
        if (!_access()) return;
        const m = parseFloat(await _ask('MTBF to demonstrate (hours):', '10000')); if (!(m > 0)) return;
        const C = parseFloat(await _ask('Confidence (one-sided, 0–1):', '0.9')) || 0.9;
        const rMax = parseInt(await _ask('Plan up to how many allowed failures:', '3')) || 3;
        _store().demo = { mtbf: m, C, rMax, at: new Date().toISOString() };
        _save(); renderRamAllocPage();
    }

    // =============================================================== render
    function renderRamWeibullPage() {
        const host = document.getElementById('ram-weibull-host');
        if (!host) return;
        if (!_access()) { _gate(host); return; }
        const S = _store();
        let html = '<div style="margin:0 0 12px;"><button class="btn-cyan" onclick="relAddLifeSet()">+ Life-data set</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">median-rank regression (Benard) · suspensions via Johnson rank adjustment · β tells the failure regime</span></div>';
        if (!S.lifeData.length) html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No life data yet — enter bench, DVT or field failure times to characterize the failure regime and B-lives.</p>';
        S.lifeData.forEach(d => {
            const data = d.failures.map(t => ({ t, suspended: false })).concat((d.suspensions || []).map(t => ({ t, suspended: true })));
            const w = weibullMrr(data);
            html += '<h3>' + _esc(d.name) + ' <a href="#" style="font-size:11px;" onclick="relDeleteLifeSet(\'' + d.id + '\'); return false;">remove</a></h3>';
            if (!w) { html += '<p class="warn">Not enough failure points to fit.</p>'; return; }
            html += '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">' +
                _chip('β (shape)', w.beta.toFixed(3), w.beta > 1.05) + _chip('η (scale)', Math.round(w.eta).toLocaleString() + ' h') +
                _chip('B10', Math.round(w.b10).toLocaleString() + ' h') + _chip('B50', Math.round(w.b50).toLocaleString() + ' h') +
                _chip('MTBF (Γ)', Math.round(w.mtbf).toLocaleString() + ' h') + _chip('r²', w.r2.toFixed(4), w.r2 < 0.9) +
                _chip('n', w.failures + 'F / ' + w.suspensions + 'S') + '</div>' +
                '<p style="font-size:12px; font-family:var(--font-mono); color:' + (w.beta > 1.05 ? '#9A6200' : 'var(--color-text-secondary)') + ';">Regime: ' + _esc(w.regime) + '</p>' +
                '<table class="data-table" style="width:100%;  font-size:12px;"><thead><tr><th>t (h)</th><th>Median rank</th><th>ln t</th><th>ln(−ln(1−MR))</th></tr></thead><tbody>' +
                w.points.map(p => '<tr><td class="u-mono">' + p.t + '</td><td class="u-mono">' + (p.mr * 100).toFixed(1) + '%</td><td class="u-mono">' + p.x.toFixed(3) + '</td><td class="u-mono">' + p.y.toFixed(3) + '</td></tr>').join('') +
                '</tbody></table>';
        });
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Fitted parameters are the computed lane over YOUR failure data — they inform, and never silently overwrite, the λ entries in the library or trees. β&gt;1 findings should reopen the constant-rate assumption via the CCMR wear-out list.</p>';
        host.innerHTML = html;
    }

    function renderRamGrowthPage() {
        const host = document.getElementById('ram-growth-host');
        if (!host) return;
        if (!_access()) { _gate(host); return; }
        const S = _store();
        let html = '<div style="margin:0 0 12px;"><button class="btn-cyan" onclick="relAddGrowth()">+ Growth test (failure times → MLE)</button> ' +
            '<button class="btn-cyan" onclick="relAddGrowthGrouped()">+ Grouped test (cumulative counts → regression)</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Crow-AMSAA NHPP power law · β&lt;1 growing, β&gt;1 deteriorating</span></div>';
        if (!S.growth.length) html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No growth tests yet — enter individual failure times (exact-time MLE) or cumulative failure counts at inspection points (grouped-data regression) to track whether fixes are working.</p>';
        S.growth.forEach(g => {
            const grouped = g.mode === 'grouped';
            const r = grouped ? crowAmsaaGrouped(g.points) : crowAmsaa(g.times, g.T);
            html += '<h3>' + _esc(g.name) + ' <span style="font-size:10px; font-weight:600; letter-spacing:.04em; padding:2px 7px; border:1px solid var(--color-border-strong); color:var(--color-text-tertiary); margin-left:6px;">' + (grouped ? 'GROUPED · REGRESSION' : 'EXACT TIMES · MLE') + '</span> <a href="#" style="font-size:11px;" onclick="relDeleteGrowth(\'' + g.id + '\'); return false;">remove</a></h3>';
            if (!r) { html += '<p class="warn">Need ≥2 ' + (grouped ? 'inspection points' : 'failures') + '.</p>'; return; }
            html += '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">' +
                _chip('β̂', r.beta.toFixed(3), r.beta > 1) + _chip('λ̂', r.lambda.toExponential(3)) +
                _chip('Cum MTBF', Math.round(r.cumMtbf).toLocaleString() + ' h') +
                _chip('Instantaneous MTBF', Math.round(r.instMtbf).toLocaleString() + ' h') +
                _chip('Growth rate α', r.growthRate.toFixed(3)) +
                (grouped
                    ? _chip('r² fit', r.r2.toFixed(4), r.r2 < 0.9)
                    : _chip('CvM fit', r.cvm.toFixed(4) + (r.gofPass ? ' ✓' : ' ✗'), !r.gofPass)) + '</div>' +
                '<p style="font-size:12px; font-family:var(--font-mono); color:' + (r.beta > 1 ? '#8E2A2A' : '#1D9E75') + ';">' + _esc(r.verdict) +
                ' — ' + r.N + ' cumulative failures over ' + r.T.toLocaleString() + ' test hours. ' +
                (grouped
                    ? (r.r2 >= 0.9 ? 'Log-log regression fits (r² ≥ 0.90).' : 'r² &lt; 0.90 — points depart from a single power law; suspect a fix-regime change.')
                    : (r.gofPass ? 'Power-law model fits (C² ≤ 0.173, 10% asymptotic).' : 'C² &gt; 0.173 — the power-law model is suspect; look for a fix-regime change.')) + '</p>' +
                '<p style="font-size:12px; font-family:var(--font-mono); color:var(--color-text-secondary);">Projection if the trend holds: MTBF ' +
                Math.round(r.projectMtbf(2 * r.T)).toLocaleString() + ' h at ' + (2 * r.T).toLocaleString() + ' test hours · ' +
                Math.round(r.projectMtbf(4 * r.T)).toLocaleString() + ' h at ' + (4 * r.T).toLocaleString() + ' h.</p>';
            if (grouped) {
                html += '<table class="data-table" style="width:100%;  font-size:12px; margin-top:4px;"><thead><tr><th>Cum. time t (h)</th><th>Cum. failures N</th><th>ln t</th><th>ln N</th></tr></thead><tbody>' +
                    g.points.map(p => '<tr><td class="u-mono">' + p.t.toLocaleString() + '</td><td class="u-mono">' + p.N + '</td><td class="u-mono">' + Math.log(p.t).toFixed(3) + '</td><td class="u-mono">' + Math.log(p.N).toFixed(3) + '</td></tr>').join('') +
                    '</tbody></table>';
            }
        });
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Instantaneous MTBF (1/(λ̂β̂T^{β̂−1})) is the demonstrated CURRENT reliability — the number to compare against the prediction, not the cumulative average that mixes in pre-fix failures. Exact-time data uses the time-terminated MLE (β̂=N/Σln(T/tᵢ)); grouped cumulative counts use the ln N vs ln t least-squares fit — the two lanes report the same β̂ and λ̂.</p>';
        host.innerHTML = html;
    }

    function renderRamAllocPage() {
        const host = document.getElementById('ram-alloc-host');
        if (!host) return;
        if (!_access()) { _gate(host); return; }
        const S = _store();
        let html = '';
        // allocation — three methods
        html += '<h3>Reliability allocation</h3>' +
            '<div style="margin:0 0 10px; display:flex; gap:8px; flex-wrap:wrap;"><button class="btn-cyan" onclick="relRunAlloc()">Feasibility weight (λ budget)</button>' +
            '<button class="btn-cyan" onclick="relRunAgree()">AGREE (complexity + importance)</button>' +
            '<button class="btn-cyan" onclick="relRunArinc()">ARINC (predicted-rate weighting)</button></div>';
        // -- feasibility weight
        if (S.alloc) {
            html += '<h4 style="margin:14px 0 6px; font-size:13px;">Feasibility weight — series λ budget</h4>' +
                '<table class="data-table" style="width:100%;  font-size:12.5px;"><thead><tr><th>Subsystem</th><th>Weight</th><th>Allocated λ (/h)</th><th>Allocated MTBF (h)</th></tr></thead><tbody>' +
                S.alloc.rows.map(r => '<tr><td>' + _esc(r.name) + '</td><td class="u-mono">' + r.weight + '</td><td class="u-mono">' + r.lambda.toExponential(3) + '</td><td class="u-mono">' + Math.round(1 / r.lambda).toLocaleString() + '</td></tr>').join('') +
                '</tbody></table>' +
                '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Σλ = ' + S.alloc.target.toExponential(2) + ' /h (series: child rates sum exactly). Heavier weight = more budget = easier target; weight by achievability, not importance.</p>';
        }
        // -- AGREE
        if (S.agree) {
            const a = S.agree;
            html += '<h4 style="margin:16px 0 6px; font-size:13px;">AGREE — complexity nᵢ × importance Eᵢ</h4>' +
                '<table class="data-table" style="width:100%;  font-size:12.5px;"><thead><tr><th>Subsystem</th><th>Modules nᵢ</th><th>Importance Eᵢ</th><th>Time tᵢ (h)</th><th>Allocated λᵢ (/h)</th><th>Allocated MTBFᵢ (h)</th><th>Rᵢ(tᵢ)</th></tr></thead><tbody>' +
                a.rows.map(r => '<tr><td>' + _esc(r.name) + '</td><td class="u-mono">' + r.n + '</td><td class="u-mono">' + r.E + '</td><td class="u-mono">' + r.t + '</td><td class="u-mono">' + r.lambda.toExponential(3) + '</td><td class="u-mono">' + Math.round(1 / r.lambda).toLocaleString() + '</td><td class="u-mono">' + r.Ri.toFixed(5) + '</td></tr>').join('') +
                '</tbody></table>' +
                '<p style="font-size:12px; font-family:var(--font-mono); color:' + (a.meets ? '#1D9E75' : '#8E2A2A') + ';">Effective R<sub>sys</sub> = exp(−ΣEᵢλᵢtᵢ) = ' + a.Rachieved.toFixed(5) + ' vs required ' + a.Rreq.toFixed(5) + ' — ' + (a.meets ? 'meets the requirement ✓' : 'falls short ✗') + (typeof a.RprodRaw === 'number' ? '  ·  raw ΠRᵢ = ' + a.RprodRaw.toFixed(5) : '') + '</p>' +
                '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">λᵢ = nᵢ·(−ln R\'(T)) / (Σn·Eᵢ·tᵢ). Complex subsystems (high nᵢ) get the tightest λ; a low importance Eᵢ relaxes a subsystem\'s target because fewer of its failures fail the mission. The formal AGREE check is the importance-weighted reliability exp(−ΣEᵢλᵢtᵢ) ≥ R\'(T), which the allocation reconstitutes exactly. The raw ΠRᵢ equals R\'(T) only when every Eᵢ = 1.</p>';
        }
        // -- ARINC
        if (S.arinc) {
            const a = S.arinc;
            html += '<h4 style="margin:16px 0 6px; font-size:13px;">ARINC — apportion by predicted failure rate</h4>' +
                '<table class="data-table" style="width:100%;  font-size:12.5px;"><thead><tr><th>Subsystem</th><th>Predicted λ̂ᵢ (/h)</th><th>Weight</th><th>Allocated λᵢ (/h)</th><th>Allocated MTBFᵢ (h)</th></tr></thead><tbody>' +
                a.rows.map(r => '<tr><td>' + _esc(r.name) + '</td><td class="u-mono">' + r.pred.toExponential(2) + '</td><td class="u-mono">' + (r.weight * 100).toFixed(1) + '%</td><td class="u-mono">' + r.lambda.toExponential(3) + '</td><td class="u-mono">' + Math.round(1 / r.lambda).toLocaleString() + '</td></tr>').join('') +
                '</tbody></table>' +
                '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Σλ = ' + a.target.toExponential(2) + ' /h (series: child rates sum exactly). λᵢ = λ_sys·λ̂ᵢ/Σλ̂ — the subsystem history predicts as least reliable carries the largest share of the budget (an achievable target), rather than being handed an equal or arbitrary split.</p>';
        }
        // spares
        html += '<h3 style="margin-top:var(--s-5);">Spares — Poisson protection level</h3>' +
            '<div style="margin:0 0 10px;"><button class="btn-cyan" onclick="relAddSpares()">+ Spares case</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">demand d = units × λ × turnaround · s = min stock with P(X≤s) ≥ PL</span></div>';
        if (S.spares.length) {
            html += '<table class="data-table" style="width:100%;  font-size:12.5px;"><thead><tr><th>Item</th><th>λ (/h)</th><th>Units</th><th>TAT (h)</th><th>Demand d</th><th>PL</th><th>Spares s</th><th>Achieved</th></tr></thead><tbody>' +
                S.spares.map(sp => {
                    const d = sp.units * sp.lambda * sp.tat;
                    const r = sparesLevel(d, sp.pl);
                    return '<tr><td>' + _esc(sp.name) + '</td><td class="u-mono">' + sp.lambda.toExponential(1) + '</td><td class="u-mono">' + sp.units + '</td><td class="u-mono">' + sp.tat + '</td>' +
                        '<td class="u-mono">' + d.toFixed(3) + '</td><td class="u-mono">' + (sp.pl * 100).toFixed(0) + '%</td>' +
                        '<td class="u-mono"><b>' + r.s + '</b></td><td class="u-mono">' + (r.achieved * 100).toFixed(2) + '%</td></tr>';
                }).join('') + '</tbody></table>';
        }
        // demonstration planning
        html += '<h3 style="margin-top:var(--s-5);">Demonstration test planning — chi-square (time-terminated)</h3>' +
            '<div style="margin:0 0 10px;"><button class="btn-cyan" onclick="relPlanDemo()">Plan a demonstration</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">T = m·χ²(C; 2r+2)/2 — the classic ×2.30 zero-failure rule at 90% falls out of r=0</span></div>';
        if (S.demo) {
            const rows = [];
            for (let r = 0; r <= S.demo.rMax; r++) rows.push({ r, T: demoTestTime(S.demo.mtbf, r, S.demo.C) });
            html += '<table class="data-table" style="width:100%;  font-size:12.5px;"><thead><tr><th>Allowed failures r</th><th>Required test time (h)</th><th>× MTBF</th></tr></thead><tbody>' +
                rows.map(x => '<tr><td class="u-mono">' + x.r + '</td><td class="u-mono">' + Math.round(x.T).toLocaleString() + '</td><td class="u-mono">' + (x.T / S.demo.mtbf).toFixed(3) + '×</td></tr>').join('') +
                '</tbody></table>' +
                '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Demonstrating MTBF = ' + S.demo.mtbf.toLocaleString() + ' h at ' + (S.demo.C * 100).toFixed(0) + '% one-sided confidence. Accepting more failures costs more hours but derisks the campaign.</p>' +
                '<p style="font-size:12px; font-family:var(--font-mono); color:var(--color-text-secondary);">Attribute alternative (success/failure trials, zero failures allowed): ' +
                [0.9, 0.95, 0.99].map(R => 'R=' + R + ' → n=' + attrTestN(R, S.demo.C)).join(' · ') + '  (n = ln(1−C)/ln(R))</p>';
        }
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._relAnalyticsWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                [['ram-weibull', renderRamWeibullPage], ['ram-growth', renderRamGrowthPage], ['ram-alloc', renderRamAllocPage]].forEach(([id, fn]) => {
                    const v = document.getElementById('view-' + id);
                    if (v) v.style.display = (tabId === id) ? 'block' : 'none';
                    const s = document.getElementById('snav-' + id);
                    if (s) s.classList.toggle('snav-active', tabId === id);
                    if (tabId === id) fn();
                });
            } catch (_) {}
            return r;
        };
        wrapped._relAnalyticsWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderRamWeibullPage = renderRamWeibullPage;
    window.renderRamGrowthPage = renderRamGrowthPage;
    window.renderRamAllocPage = renderRamAllocPage;
    window.relAddLifeSet = relAddLifeSet;
    window.relDeleteLifeSet = relDeleteLifeSet;
    window.relAddGrowth = relAddGrowth;
    window.relAddGrowthGrouped = relAddGrowthGrouped;
    window.relDeleteGrowth = relDeleteGrowth;
    window.relRunAlloc = relRunAlloc;
    window.relRunAgree = relRunAgree;
    window.relRunArinc = relRunArinc;
    window.relAddSpares = relAddSpares;
    window.relPlanDemo = relPlanDemo;
    window.weibullMrr = weibullMrr;
    window.crowAmsaa = crowAmsaa;
    window.crowAmsaaGrouped = crowAmsaaGrouped;
    window.agreeAllocate = agreeAllocate;
    window.arincAllocate = arincAllocate;
    window.sparesLevel = sparesLevel;
    window.demoTestTime = demoTestTime;
    window.attrTestN = attrTestN;
    window._relGamma = gammaFn;
})();
