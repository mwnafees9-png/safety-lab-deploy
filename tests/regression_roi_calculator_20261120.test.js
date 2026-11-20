/* The ROI calculator on the website (site/roi.html), 20 Nov 2026.
 * The numbers are checked against sums done by hand, not against the page's own code.
 *   1  the defaults: 5 licenses, 1,190 hours saved per engineer per year, 5 years, the published Pro+ rate
 *   2  the value side is built from the licenses: licenses x hours saved x years x rate, plus rework (by hand)
 *   3  the cost side covers the same years; the licenses drive both sides
 *   4  the 57% and the two quick picks come from the phase table
 *   5  hygiene: no em dash, no customer price on the public page
 * Optional: SL_ROI_CUSTOMER_FILE points at the customer version; its prices are checked by hand too.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + JSON.stringify(d) + ')' : '')); } };
const near = (a, b) => Math.abs(a - b) < 0.005;
function load(file) {
    const html = fs.readFileSync(file, 'utf8');
    const scripts = html.match(/<script>[\s\S]*?<\/script>/g) || [];
    const js = scripts.map(s => s.replace(/<\/?script>/g, '')).filter(s => /PHASES/.test(s))[0];
    const els = {};
    (html.match(/<(input|select)[^>]*id="[^"]+"[^>]*>/g) || []).forEach(t => { const id = /id="([^"]+)"/.exec(t)[1], v = /value="([^"]*)"/.exec(t); els[id] = { value: v ? v[1] : '', textContent: '', addEventListener() {} }; });
    const sel = /<select id="term">[\s\S]*?<\/select>/.exec(html);
    if (sel) els.term.value = /<option value="(\d+)" selected/.exec(sel[0])[1];
    const doc = { getElementById: id => els[id] || (els[id] = { value: '', textContent: '', innerHTML: '', addEventListener() {} }), querySelectorAll: () => Object.values(els) };
    const ctx = { document: doc, Math, parseFloat, parseInt, isNaN, Array };
    vm.createContext(ctx); vm.runInContext(js, ctx);
    return { html, els, ctx };
}
const site = process.env.SL_ROI_SITE_FILE || path.join(__dirname, '..', 'site', 'roi.html');
const S = load(site);
console.log('[site] ' + site);
// by hand: the savings are built from the licenses. 5 licenses x 1,190 hours x 5 years = 29,750 hours.
check('1 defaults are a full-size team: 5 licenses, 1,190 hours each a year, 5 years, $2,500', S.els.lic.value === '5' && S.els.hrs.value === '1190' && S.els.years.value === '5' && S.els.price.value === '2500', [S.els.lic.value, S.els.hrs.value, S.els.years.value, S.els.price.value]);
check('1 systems, complexity and churn are no longer inputs', !S.els.systems && !S.els.cx && !S.els.iter);
let m = S.ctx.model();
check('2 hours saved: 5 x 1,190 = 5,950 a year, 29,750 over 5 years', m.hoursYear === 5950 && m.hoursTot === 29750, [m.hoursYear, m.hoursTot]);
check('2 effort = 29,750 x $110 = $3,272,500; rework = 3 x 200 x $110 = $66,000; total $3,338,500', near(m.effort, 3272500) && near(m.rework, 66000) && near(m.total, 3338500), [m.effort, m.rework, m.total]);
check('2 person-years = (29,750 + 600) / 2,080', near(m.py, 30350 / 2080), m.py);
check('3 license cost = 5 x $2,500 x 12 x 5 = $750,000, net $2,588,500, return 4.4513', near(m.cost, 750000) && near(m.net, 2588500) && Math.abs(m.roi - 3338500 / 750000) < 1e-9 && S.els.oRoi.textContent === '$4.45', [m.cost, m.net, m.roi, S.els.oRoi.textContent]);
S.els.lic.value = '10'; m = S.ctx.model();
check('3 the licenses drive BOTH sides: 10 licenses double the hours saved and double the cost', m.hoursTot === 59500 && near(m.cost, 1500000), [m.hoursTot, m.cost]);
S.els.lic.value = '5'; S.els.hrs.value = '590'; m = S.ctx.model();
check('3 half time on the analyses: 5 x 590 x 5 = 14,750 hours, $1,622,500 + $66,000', m.hoursTot === 14750 && near(m.total, 1688500), [m.hoursTot, m.total]);
S.els.hrs.value = '9999'; m = S.ctx.model();
check('3 nobody saves more hours than a working year: held at 2,080', m.hrs === 2080, m.hrs);
S.els.hrs.value = '1190'; S.els.years.value = '1'; m = S.ctx.model();
check('3 one year of the program costs one year of licenses ($150,000)', near(m.cost, 150000), m.cost);
S.els.lic.value = '0'; S.ctx.calc(); m = S.ctx.model();
check('3 no licenses: no division by zero, the return shows as none', m.roi === 0 && S.els.oRoi.textContent === '-', [m.roi, S.els.oRoi.textContent]);
// the 57%: once-per-aircraft first-draft hours 2,240 (saved 1,326); per system 1,000 (saved 572); 20 systems
let t = S.ctx.refTable();
check('4 where the 57% comes from: (1,326 + 20 x 572) / (2,240 + 20 x 1,000) = 12,766 / 22,240 = 57.4%', near(t.baseTot, 22240) && near(t.savedTot, 12766) && Math.floor(t.blended * 100) === 57 && S.ctx.REDUCTION === 0.57, [t.baseTot, t.savedTot, t.blended]);
check('4 the two quick picks are 57% of a full and a half working year, to the nearest 10: 1,190 and 590', S.ctx.FULL_TIME === 1190 && S.ctx.HALF_TIME === 590 && /data-hrs="1190"/.test(S.html) && /data-hrs="590"/.test(S.html) && /57% of the analysis hours/.test(S.html), [S.ctx.FULL_TIME, S.ctx.HALF_TIME]);
check('5 no em dash on the page', S.html.indexOf(String.fromCharCode(0x2014)) === -1);
check('5 the public page carries no customer name or customer price', !/Radia|SL-ROM|2,?250|perpetual/i.test(S.html));
check('5 the page shows the cost and the net', /id="oCost"/.test(S.html) && /id="oNet"/.test(S.html) && !/id="sub"/.test(S.html));

const cf = process.env.SL_ROI_CUSTOMER_FILE;
if (cf) {
    console.log('[customer] ' + cf);
    const C = load(cf), cost = C.ctx.radiaCost, val = C.ctx.valueModel;
    let v = val({ lic: 2, hrs: 1190, rate: 110, years: 5 });
    check('C the value side is the website model: 2 x 1,190 x 5 = 11,900 hours, $1,309,000 + $66,000 = $1,375,000', v.hoursTot === 11900 && near(v.total, 1375000) && C.ctx.REDUCTION === 0.57 && Math.floor(C.ctx.refTable().blended * 100) === 57, [v.hoursTot, v.total]);
    // 2 licenses, 5 year term: $1,500 x 2 x 12 = $36,000 in year 1; x (1.1^5 - 1)/0.1 = 6.1051 -> $219,783.60; terms 20% $43,956.72
    let c = cost({ lic: 2, rev: 0, years: 5, term: 5 });
    check('C 2 licenses, 5 year term, 5 years: licenses $219,783.60, terms $43,956.72, total $263,740.32', near(c.y1, 36000) && near(c.sLic, 219783.6) && near(c.sTerms, 43956.72) && near(c.sTot, 263740.32), [c.y1, c.sLic, c.sTerms, c.sTot]);
    check('C perpetual: $500,000 covers 5 licenses, nothing added, no terms line', c.pTot === 500000 && c.perpAdd === 0 && c.pRev === 0, [c.pTot, c.perpAdd]);
    c = cost({ lic: 2, rev: 0, years: 1, term: 1 });
    check('C 1 year term: 2 x $2,250 x 12 = $54,000, + 20% = $64,800', near(c.sLic, 54000) && near(c.sTot, 64800), [c.sLic, c.sTot]);
    c = cost({ lic: 2, rev: 0, years: 2, term: 2 });
    check('C 2 year term: $48,000 then $52,800 = $100,800, + 20% = $120,960', near(c.sLic, 100800) && near(c.sTot, 120960), [c.sLic, c.sTot]);
    c = cost({ lic: 2, rev: 0, years: 3, term: 3 });
    check('C 3 year term: $42,000 x 3.31 = $139,020, + 20% = $166,824', near(c.sLic, 139020) && near(c.sTot, 166824), [c.sLic, c.sTot]);
    // 12 licenses, 3 year term: 2 x 1,750 + 2 x 1,500 + 5 x 1,250 + 3 x 1,000 = 15,750 a month
    c = cost({ lic: 12, rev: 4, years: 1, term: 3 });
    check('C 12 licenses and 4 reviewers: $15,750 + $1,000 a month, $201,000 a year, + 20% = $241,200', c.engMonth === 15750 && c.revMonth === 1000 && near(c.sLic, 201000) && near(c.sTot, 241200), [c.engMonth, c.revMonth, c.sLic, c.sTot]);
    check('C ...perpetual for 12: $500,000 + 7 x $25,000 = $675,000, plus the same reviewers ($12,000)', c.perpAdd === 175000 && near(c.pRev, 12000) && near(c.pTot, 687000), [c.perpAdd, c.pRev, c.pTot]);
    check('C each license is priced by its place: the 4th is $1,500, the 5th $1,250, the 9th $1,250, the 10th $1,000', cost({ lic: 4, rev: 0, years: 1, term: 5 }).engMonth === 6000 && cost({ lic: 5, rev: 0, years: 1, term: 5 }).engMonth === 7250 && cost({ lic: 9, rev: 0, years: 1, term: 5 }).engMonth === 12250 && cost({ lic: 10, rev: 0, years: 1, term: 5 }).engMonth === 13250);
    // break-even by hand, 5 licenses, 5 year term: year 1 of subscription 87,000 x 1.2 = 104,400; running 104,400, 219,240, 345,564, 484,520.40, 637,372.44
    c = cost({ lic: 5, rev: 0, years: 5, term: 5 });
    check('C 5 licenses, 5 years: subscription $637,372.44 against perpetual $500,000; perpetual is lower from year 5', near(c.sTot, 637372.44) && c.pTot === 500000 && c.even === 5 && near(c.rows[3].sCum, 484520.4), [c.sTot, c.even, c.rows[3].sCum]);
    c = cost({ lic: 2, rev: 0, years: 5, term: 5 });
    // 2 licenses: running subscription 43,200 x (1.1^n - 1)/0.1; passes 500,000 when 1.1^n >= 2.1574 -> n = 9 (1.1^8 = 2.1436, 1.1^9 = 2.3579)
    check('C 2 licenses: perpetual is lower only from year 9', c.even === 9, c.even);
    check('C the year table has one row per year compared and its last running total is the total', c.rows.length === 5 && near(c.rows[4].sCum, c.sTot) && near(c.rows[4].pCum, c.pTot), c.rows.length);
    c = cost({ lic: 2.9, rev: -3, years: 99, term: 7 });
    check('C odd input is held: whole licenses, no negative reviewers, at most 15 years, unknown term falls to the 5 year rate', c.lic === 2 && c.rev === 0 && c.years === 15 && c.engMonth === 3000, [c.lic, c.rev, c.years, c.engMonth]);
    check('C no em dash; works offline (no outside file or address loaded)', C.html.indexOf(String.fromCharCode(0x2014)) === -1 && !/<link|src="http|href="http|@import|url\(/i.test(C.html));
    check('C the page drew: totals and the return are filled in', C.els.sTot.textContent === '$263,740' && C.els.pTot.textContent === '$500,000' && C.els.sRoi.textContent === '$5.21' && C.els.pRoi.textContent === '$2.75' && C.els.licEcho.textContent === '2' && (C.html.match(/id="lic"/g) || []).length === 1 && /year 9/.test(C.els.even.textContent), [C.els.sTot.textContent, C.els.pTot.textContent, C.els.sRoi.textContent, C.els.pRoi.textContent, C.els.even.textContent]);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
