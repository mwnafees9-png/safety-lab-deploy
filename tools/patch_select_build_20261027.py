#!/usr/bin/env python3
"""27 Oct 2026: the desktop app crashed a few seconds after opening a project (customer report: "when they
press control R instead of refreshing it crashes the app").

Found by starting the real desktop app on a real project (Aeolus HL-1, 2,080 aircraft assumptions) and
sampling the page's stack until it died: the page crashed every time, about 7 seconds after it loaded,
with "FATAL ERROR: Oilpan: Large allocation. Allocation failed - process out of memory". Every sample
was inside populateFhaAsmDropdown, called by switchTab as the FHA page opened. It built its drop-down
with `sel.innerHTML += '<option>...'` once per assumption: each += reads the whole list back out as text,
adds one option and parses all of it again, so 2,080 assumptions meant about two million options made
and thrown away. Ctrl+R reloads the page, which reopens the FHA page and crashes again, which is what
the customer saw. Any project with enough rows hits it; it is not specific to reloading.

Fix: every drop-down built with innerHTML += in a loop now builds its markup once and assigns it once
(the assumption picker, the generic picker every page uses for functions, failure conditions and rows,
the FMEA basic-event picker, the fault tree's transfer and DAL-carrier pickers, and the flight-phase
table). The generic picker also drops its quadratic duplicate check for a Set. Same options, same
order, same selection.

Run from the repo root: python3 tools/patch_select_build_20261027.py   (refuses on any missing anchor)
"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = lambda p: os.path.join(ROOT, 'site', p)
def rd(p):
    with open(p, encoding='utf-8') as f: return f.read()
def wr(p, s):
    with open(p, 'w', encoding='utf-8') as f: f.write(s)
def sub1(s, old, new, name):
    n = s.count(old)
    if n != 1: sys.exit('anchor %s found %d times' % (name, n))
    return s.replace(old, new)

d = rd(S('data_ops_modules.js'))
d = sub1(d, """    sel.innerHTML = '<option value="">-- Link an existing assumption --</option>';
    getAllAssumptions().forEach(a => {
        const trimmed = (a.text || '').length > 60 ? (a.text || '').slice(0, 60) + '…' : (a.text || '');
        sel.innerHTML += `<option value="${esc(a.asmId)}">[${esc(a.scope)}] ${esc(a.asmId)}: ${esc(trimmed)}</option>`;
    });""", """    // 27 Oct 2026: built once and assigned once. `sel.innerHTML +=` per assumption re-parsed the whole list every
    // time (quadratic): a project with 2,080 assumptions crashed the desktop page as the FHA tab opened.
    let html = '<option value="">-- Link an existing assumption --</option>';
    getAllAssumptions().forEach(a => {
        const trimmed = (a.text || '').length > 60 ? (a.text || '').slice(0, 60) + '…' : (a.text || '');
        html += `<option value="${esc(a.asmId)}">[${esc(a.scope)}] ${esc(a.asmId)}: ${esc(trimmed)}</option>`;
    });
    sel.innerHTML = html;""", 'asm dropdown')
wr(S('data_ops_modules.js'), d)

h = rd(S('helpers_modules.js'))
h = sub1(h, """    select.innerHTML = '<option value="">-- Select --</option>'; let unique = [];
    dataArray.forEach(item => { let val = item[valProp]; if(!unique.includes(val)) { unique.push(val); select.innerHTML += `<option value="${esc(val)}">${isFlat ? esc(val) : `${esc(val)}: ${esc(item[labelProp])}`}</option>`; } });""",
"""    // 27 Oct 2026: built once and assigned once (innerHTML += per row re-parsed the whole list every time), and the
    // duplicate check is a Set, not a scan of every value so far: both were quadratic in the number of rows.
    let html = '<option value="">-- Select --</option>'; const unique = new Set();
    (dataArray || []).forEach(item => { let val = item[valProp]; if(!unique.has(val)) { unique.add(val); html += `<option value="${esc(val)}">${isFlat ? esc(val) : `${esc(val)}: ${esc(item[labelProp])}`}</option>`; } });
    select.innerHTML = html;""", 'populateDropdowns')
h = sub1(h, """    let _headerDrawn = false;
    _ordered.forEach(({ row: p, idx }) => {
        if (_isSpecial(p) && !_headerDrawn) {
            _headerDrawn = true;
            tbody.innerHTML += `<tr><td colspan="10\"""", """    let _headerDrawn = false, _rowsHtml = '';   // 27 Oct 2026: built once, assigned once
    _ordered.forEach(({ row: p, idx }) => {
        if (_isSpecial(p) && !_headerDrawn) {
            _headerDrawn = true;
            _rowsHtml += `<tr><td colspan="10\"""", 'phases header')
h = sub1(h, """        tbody.innerHTML += `<tr${_isSpecial(p) ? ' data-contingency="1"' : ''}>""", """        _rowsHtml += `<tr${_isSpecial(p) ? ' data-contingency="1"' : ''}>""", 'phases row')
# the phase loop's end: assign after it
i = h.index("_rowsHtml += `<tr${_isSpecial(p) ? ' data-contingency=\"1\"' : ''}>")
j = h.index("\n    });\n}", i)
h = h[:j] + "\n    });\n    tbody.innerHTML = _rowsHtml;\n}" + h[j + len("\n    });\n}"):]
wr(S('helpers_modules.js'), h)

v = rd(S('fta_view_modules.js'))
v = sub1(v, """linkSel.innerHTML = '<option value="">-- Select Tree to Link --</option>'; ftaPages.forEach(p => { if(p.id !== activeFTAPageId) linkSel.innerHTML += `<option value="${esc(p.id)}" ${dataNode.linkedPageId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`; }); }""",
            """let _lh = '<option value="">-- Select Tree to Link --</option>'; ftaPages.forEach(p => { if(p.id !== activeFTAPageId) _lh += `<option value="${esc(p.id)}" ${dataNode.linkedPageId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`; }); linkSel.innerHTML = _lh; /* 27 Oct 2026: built once */ }""", 'transfer view')
v = sub1(v, """            carrierSel.innerHTML = '<option value="">-- pick a child --</option>';
            kids.forEach(c => carrierSel.innerHTML += `<option value="${esc(c.id)}" ${dataNode.dalCarrierChildId === c.id ? 'selected' : ''}>[${esc(c.displayId)}] ${esc(c.name || '')}</option>`);""",
            """            // 27 Oct 2026: built once, assigned once
            carrierSel.innerHTML = '<option value="">-- pick a child --</option>' + kids.map(c => `<option value="${esc(c.id)}" ${dataNode.dalCarrierChildId === c.id ? 'selected' : ''}>[${esc(c.displayId)}] ${esc(c.name || '')}</option>`).join('');""", 'carrier')
wr(S('fta_view_modules.js'), v)

m = rd(S('misc_fn_modules.js'))
m = sub1(m, """    const select = document.getElementById('fmea-basic-event'); select.innerHTML = '<option value="">-- Select FTA Basic Event --</option>';
    const events = getBasicEventsFromAllTrees(); events.forEach(e => select.innerHTML += `<option value="${esc(e.id)}">[${esc(e.displayId)}] ${esc(e.name)}</option>`);""",
            """    // 27 Oct 2026: built once, assigned once (innerHTML += per basic event re-parsed the whole list every time)
    const select = document.getElementById('fmea-basic-event');
    const events = getBasicEventsFromAllTrees();
    select.innerHTML = '<option value="">-- Select FTA Basic Event --</option>' + events.map(e => `<option value="${esc(e.id)}">[${esc(e.displayId)}] ${esc(e.name)}</option>`).join('');""", 'fmea events')
m = sub1(m, "linkSel.innerHTML += acGroup + sysGroup;", "linkSel.innerHTML = '<option value=\"\">-- No Link (1 Hr Default) --</option>' + acGroup + sysGroup; /* 27 Oct 2026: assigned once */", 'fha link')
wr(S('misc_fn_modules.js'), m)

s = rd(S('safety_lab.js'))
s = sub1(s, """linkSel.innerHTML = '<option value="">-- Select Tree to Link --</option>'; ftaPages.forEach(p => { if(p.id !== activeFTAPageId) linkSel.innerHTML += `<option value="${esc(p.id)}">${esc(p.name)}</option>`; }); }""",
            """let _lh = '<option value="">-- Select Tree to Link --</option>'; ftaPages.forEach(p => { if(p.id !== activeFTAPageId) _lh += `<option value="${esc(p.id)}">${esc(p.name)}</option>`; }); linkSel.innerHTML = _lh; /* 27 Oct 2026: built once */ }""", 'transfer type')
wr(S('safety_lab.js'), s)

x = rd(S('index.html'))
for nm in ('data_ops_modules.js', 'helpers_modules.js', 'fta_view_modules.js', 'misc_fn_modules.js', 'safety_lab.js'):
    mm = re.search(re.escape(nm) + r'\?v=(\d+)\.(\d+)', x)
    if not mm: sys.exit('no version for ' + nm)
    minor = mm.group(2)
    x = x.replace(mm.group(0), '%s?v=%s.%s' % (nm, mm.group(1), str(int(minor) + 1).zfill(len(minor))), 1)
wr(S('index.html'), x)
print('patched: data_ops_modules.js, helpers_modules.js, fta_view_modules.js, misc_fn_modules.js, safety_lab.js, index.html')
