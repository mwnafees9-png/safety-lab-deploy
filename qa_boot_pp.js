// Boot QA — plan-driven nav + STPA walkthrough (Increments A+B).
// Serves site/ on 8901, boots Chromium, and pokes the real wiring:
// grandfather hides STPA, opt-in shows it, walkthrough renders, GLA seed
// fires INV-18, guard reroutes a hidden tab to the SPP page.
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');

(async () => {
    const server = spawn('python3', ['-m', 'http.server', '8901', '--directory', 'site'], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1200));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('ERR_TUNNEL_CONNECTION_FAILED') === -1) errors.push('console: ' + m.text()); });

    await page.goto('http://localhost:8901/', { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    // splash removal (house pattern)
    await page.evaluate(() => { document.querySelectorAll('#splash, .splash, #app-splash').forEach(e => e.remove()); });

    const r = await page.evaluate(async () => {
        const out = {};
        const vis = id => { const el = document.getElementById(id); if (!el) return null;
            const t = (el.tagName === 'SUMMARY' && el.parentElement) ? el.parentElement : el;
            return t.style.display !== 'none'; };
        out.ppLoaded = typeof PROGRAM_PLAN !== 'undefined';
        out.stpaEngine = typeof STPA !== 'undefined';
        out.stpaPanel = typeof STPA_PANEL !== 'undefined';
        out.grandfatherFtaVisible = vis('snav-fta');
        out.grandfatherStpaHidden = vis('snav-stpa') === false;
        // guard: navigating to the hidden lane reroutes to the plan page
        switchTab('stpa');
        await new Promise(r2 => setTimeout(r2, 200));
        out.guardReroutedToSpp = window._slCurrentTab === 'spp';
        out.sppScopeSection = !!document.getElementById('pp-scope-host') && document.getElementById('pp-scope-host').innerHTML.indexOf('Program scope') >= 0;
        // opt in to the system lane — the launch moment
        PROGRAM_PLAN.setLane('stpa', true);
        out.stpaNavAppears = vis('snav-stpa') === true;
        switchTab('stpa');
        await new Promise(r2 => setTimeout(r2, 300));
        out.stpaTabLands = window._slCurrentTab === 'stpa';
        const v = document.getElementById('view-stpa');
        out.walkthroughRenders = !!v && v.innerHTML.indexOf('Control structure') >= 0 && v.innerHTML.indexOf('INTERACTION HAZARDS') >= 0;
        // seed the GLA case → INV-18 must fire and draw
        STPA_PANEL.go(2);
        STPA_PANEL.seedGla();
        await new Promise(r2 => setTimeout(r2, 300));
        out.seedLoaded = stpaData.cs.controllers.length === 2 && stpaData.cs.actions.length === 2;
        out.inv18Fires = v.innerHTML.indexOf('INV-32 · missing feedback') >= 0;
        out.diagramDrawsMissingEdge = v.innerHTML.indexOf('no feedback path (INV-32)') >= 0;
        // UCA step renders 8 computed seeds
        STPA_PANEL.go(3);
        await new Promise(r2 => setTimeout(r2, 200));
        out.ucaSeeds8 = (v.innerHTML.match(/guide|OPEN/g) || []).length >= 8 && v.innerHTML.indexOf('Unsafe control actions') >= 0;
        // INV-18 registered in the sweep
        out.invSweepHas32 = (typeof invRun === 'function') ? invRun().results.some(x => x.id === 'INV-32' && x.failCount === 2) : null;
        // turning the lane back off hides nav again (data survives)
        PROGRAM_PLAN.setLane('stpa', false);
        out.laneOffHidesNav = vis('snav-stpa') === false;
        out.dataSurvives = stpaData.cs.controllers.length === 2;
        PROGRAM_PLAN.setLane('stpa', true); switchTab('stpa'); STPA_PANEL.go(2);
        return out;
    });

    await page.waitForTimeout(400);
    // strip the beta sign-in gate + any toasts for the screenshot (visual only)
    await page.evaluate(() => {
        document.querySelectorAll('div').forEach(d => {
            const s = getComputedStyle(d);
            if ((s.position === 'fixed' || s.position === 'absolute') &&
                (d.textContent.indexOf('Welcome to Safety Lab Aero') >= 0 || /toast/i.test(d.className)) &&
                d.offsetWidth > 200) d.remove();
        });
        document.body.style.overflow = 'auto';
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'qa_boot_pp_stpa.png', fullPage: false });
    console.log(JSON.stringify(r, null, 2));
    console.log('page errors:', errors.length ? errors.slice(0, 8) : 'none');
    await browser.close();
    server.kill();
    const ok = Object.entries(r).every(([k, v]) => v === true || v === null) && errors.length === 0;
    console.log(ok ? 'BOOT QA: ALL GREEN' : 'BOOT QA: FAILURES PRESENT');
    process.exit(ok ? 0 : 1);
})();
