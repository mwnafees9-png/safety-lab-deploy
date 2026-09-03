// Browser QA — NASA HF corpus reachability through the live AI retrieval spine.
// The unit test proves the corpus is correct and the wiring is present in the
// source. This proves the shipped app actually RETRIEVES it: real script load
// order, real BM25 index, real synonym expansion, real cross-lane damping — via
// the read-only SafetyLabAI.kbRetrieve hook (calls no model, writes nothing).
//
// The assertion that earns its keep here: NO REGRESSION on the other THREE
// lanes. #172 only had two lanes to protect; this run protects FTA/ARP, SORA
// and STPA at once, because ai_assistant.js is shared and the HF lane speaks
// dangerous words ("crew", "severity", "AC 25.1309").
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const HF_Q = [
    'what human factors standards does the tool carry',
    'what is the HIDH and how are its presets used',
    'what is the 80% workload red line',
    'how does NASA-HFACS classify human error',
    'what are the nanocode tiers',
    'how do I use Fitts law for a cockpit control',
    'what is the workload severity divergence check',
    'what does the applicability tag on a preset mean'
];
const FTA_Q = [
    'how do I build a fault tree from an architecture',
    'what is a minimal cut set',
    'what does ARP 4761A say about the FHA'
];
const SORA_Q = [
    'what is a SAIL and how is it determined',
    'what are the operational safety objectives in SORA'
];
const STPA_Q = [
    'what are the four UCA types',
    'how do I write an unsafe control action under J3307'
];

(async () => {
    const server = spawn('python3', ['-m', 'http.server', '8909', '--directory', 'site'], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1200));
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('ERR_TUNNEL') === -1) errors.push('console: ' + m.text()); });

    await page.addInitScript(() => { try { localStorage.setItem('safetyLab.ai.enabled', '1'); } catch (_) {} });
    await page.goto('http://localhost:8909/?ai=1', { waitUntil: 'load' });
    await page.waitForTimeout(3200);
    await page.evaluate(() => { document.querySelectorAll('#splash, .splash, #app-splash').forEach(e => e.remove()); });

    const r = await page.evaluate(async (qs) => {
        const out = {};
        await window.slLoadAI();
        await new Promise(r2 => setTimeout(r2, 400));
        out.aiLaneLoaded = !!(window.SafetyLabAI && typeof SafetyLabAI.openChat === 'function');
        out.kbHookPresent = !!(window.SafetyLabAI && typeof SafetyLabAI.kbRetrieve === 'function');
        out.hfModuleLoaded = !!(window.SL_HF_KB && window.SL_HF_KB.chunks && window.SL_HF_KB.chunks.length === 24);
        out.allFourCorporaPresent = !!(window.SL_FTA_KB && window.SL_SORA_KB && window.SL_STPA_KB && window.SL_HF_KB);

        // every HF-shaped question must ground on HF chunks, top-ranked
        const hf = qs.hf.map(q => (SafetyLabAI.kbRetrieve(q, 5) || []).map(c => c.id));
        out.everyHfQueryRetrievesHf = hf.every(ids => ids.some(i => /^hf-/.test(i)));
        out.everyHfQueryRanksHfFirst = hf.every(ids => /^hf-/.test(ids[0] || ''));
        out.hfTopHits = qs.hf.map((q, i) => q.slice(0, 40) + ' → ' + (hf[i][0] || 'NONE'));

        // the acronyms must reach their chunks via synonym expansion
        out.acronymHidhWorks = (SafetyLabAI.kbRetrieve('HIDH', 5) || []).some(c => /^hf-/.test(c.id));
        out.acronymHfacsWorks = (SafetyLabAI.kbRetrieve('HFACS', 5) || []).some(c => /^hf-/.test(c.id));

        // the honest-limits chunk must be in reach of the compliance question
        out.honestLimitsInReach = (SafetyLabAI.kbRetrieve('is the HIDH an accepted means of compliance', 6) || [])
            .some(c => c.id === 'hf-23' || c.id === 'hf-02');

        // NO REGRESSION on the other three lanes — each still top-ranks its own corpus
        const fta = qs.fta.map(q => (SafetyLabAI.kbRetrieve(q, 5) || []).map(c => c.id));
        out.ftaLaneUnregressed = fta.every(ids => ids.length > 0 && !/^hf-/.test(ids[0] || 'x') && !/^stpa-/.test(ids[0] || 'x') && !/^sora-/.test(ids[0] || 'x'));
        const sora = qs.sora.map(q => (SafetyLabAI.kbRetrieve(q, 5) || []).map(c => c.id));
        out.soraLaneUnregressed = sora.every(ids => /^sora-/.test(ids[0] || ''));
        const stpa = qs.stpa.map(q => (SafetyLabAI.kbRetrieve(q, 5) || []).map(c => c.id));
        out.stpaLaneUnregressed = stpa.every(ids => /^stpa-/.test(ids[0] || ''));

        // read-only + deterministic
        const a = JSON.stringify((SafetyLabAI.kbRetrieve('crew workload red line', 4) || []).map(c => c.id));
        const b = JSON.stringify((SafetyLabAI.kbRetrieve('crew workload red line', 4) || []).map(c => c.id));
        out.retrievalDeterministic = a === b;
        out.corpusUnmutated = window.SL_HF_KB.chunks.length === 24 && window.SL_STPA_KB.chunks.length === 23;
        return out;
    }, { hf: HF_Q, fta: FTA_Q, sora: SORA_Q, stpa: STPA_Q });

    await page.waitForTimeout(200);
    console.log(JSON.stringify(r, null, 2));
    console.log('page errors:', errors.length ? errors.slice(0, 8) : 'none');
    await browser.close();
    server.kill();
    const bools = Object.entries(r).filter(([, v]) => typeof v === 'boolean');
    const ok = bools.every(([, v]) => v === true) && errors.length === 0;
    console.log(ok ? 'HF KB QA: ALL GREEN' : 'HF KB QA: FAILURES PRESENT');
    process.exit(ok ? 0 : 1);
})();
