// Browser QA — J3307/STPA reachability through the live AI retrieval spine.
// The unit test proves the corpus is correct and the wiring is present in the
// source. This proves the shipped app actually RETRIEVES it: real script load
// order, real BM25 index, real synonym expansion — via the read-only
// SafetyLabAI.kbRetrieve hook (calls no model, writes nothing).
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const STPA_Q = [
    'what is STPA and what does J3307 require',
    'how do I write an unsafe control action',
    'what are the four UCA types',
    'what goes in the control structure',
    'why did the controller issue that command — step 4 causal factors',
    'does J3307 require a safety improvement plan',
    'how many work products does J3307 have'
];
const FTA_Q = [
    'how do I build a fault tree from an architecture',
    'what is a minimal cut set',
    'what does ARP 4761A say about the FHA'
];

(async () => {
    const server = spawn('python3', ['-m', 'http.server', '8907', '--directory', 'site'], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1200));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('ERR_TUNNEL') === -1) errors.push('console: ' + m.text()); });

    await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} });
    await page.goto('http://localhost:8907/?ai=1', { waitUntil: 'load' });
    await page.waitForTimeout(3200);
    await page.evaluate(() => { document.querySelectorAll('#splash, .splash, #app-splash').forEach(e => e.remove()); });

    const r = await page.evaluate(async (qs) => {
        const out = {};
        await window.slLoadAI();
        await new Promise(r2 => setTimeout(r2, 400));
        out.aiLaneLoaded = !!(window.SafetyLabAI && typeof SafetyLabAI.openChat === 'function');
        out.kbHookPresent = !!(window.SafetyLabAI && typeof SafetyLabAI.kbRetrieve === 'function');
        out.stpaModuleLoaded = !!(window.SL_STPA_KB && window.SL_STPA_KB.chunks && window.SL_STPA_KB.chunks.length === 23);
        out.allThreeCorporaPresent = !!(window.SL_FTA_KB && window.SL_SORA_KB && window.SL_STPA_KB);

        // every STPA-shaped question must ground on J3307 chunks, top-ranked
        const stpa = qs.stpa.map(q => (SafetyLabAI.kbRetrieve(q, 5) || []).map(c => c.id));
        out.everyStpaQueryRetrievesJ3307 = stpa.every(ids => ids.some(i => /^stpa-/.test(i)));
        out.everyStpaQueryRanksJ3307First = stpa.every(ids => /^stpa-/.test(ids[0] || ''));
        out.stpaTopHits = qs.stpa.map((q, i) => q.slice(0, 34) + ' → ' + (stpa[i][0] || 'NONE'));

        // the overview chunk must be in reach of the plainest possible question
        out.overviewInReach = (SafetyLabAI.kbRetrieve('what is STPA', 5) || []).some(c => c.id === 'stpa-01');

        // the acronym must reach the chunks that spell it out (synonym expansion)
        out.acronymUcaWorks = (SafetyLabAI.kbRetrieve('UCA', 5) || []).some(c => /^stpa-/.test(c.id));

        // the erratum chunk must be reachable — the assistant must not repeat the defect
        out.erratumReachable = (SafetyLabAI.kbRetrieve('what are the 3a work products for unsafe control actions', 6) || [])
            .some(c => c.id === 'stpa-13');

        // NO REGRESSION: FTA questions still land on the FTA/ARP corpus
        const fta = qs.fta.map(q => (SafetyLabAI.kbRetrieve(q, 5) || []).map(c => c.id));
        out.ftaLaneUnregressed = fta.every(ids => ids.length > 0 && !/^stpa-/.test(ids[0] || 'x'));

        // the hook is genuinely read-only: same query twice, same answer, nothing mutated
        const a = JSON.stringify((SafetyLabAI.kbRetrieve('unsafe control action', 4) || []).map(c => c.id));
        const b = JSON.stringify((SafetyLabAI.kbRetrieve('unsafe control action', 4) || []).map(c => c.id));
        out.retrievalDeterministic = a === b;
        out.corpusUnmutated = window.SL_STPA_KB.chunks.length === 23;
        return out;
    }, { stpa: STPA_Q, fta: FTA_Q });

    await page.waitForTimeout(200);
    console.log(JSON.stringify(r, null, 2));
    console.log('page errors:', errors.length ? errors.slice(0, 8) : 'none');
    await browser.close();
    server.kill();
    const bools = Object.entries(r).filter(([, v]) => typeof v === 'boolean');
    const ok = bools.every(([, v]) => v === true) && errors.length === 0;
    console.log(ok ? 'STPA KB QA: ALL GREEN' : 'STPA KB QA: FAILURES PRESENT');
    process.exit(ok ? 0 : 1);
})();
