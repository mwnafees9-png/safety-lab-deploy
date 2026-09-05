// regression_hf_table_modal.test.js — the HF lanes in the worksheets' own layout.
//
// Waqas, 2 Sep 2026: "all these lanes need text wrapping features coz most of the text is
// hidden, match the same table format and layout as FHAs, and instead of in table editing
// I want editing in a modal see how it was done in the FHAs, and we will need the same
// kebab here."
//
// WHY THE TEXT WAS HIDDEN: every HF cell was a live <input>. An input shows one line of
// whatever it holds, so a 200-character finding showed twenty characters. The worksheets
// never had the problem because their cells are TEXT and editing happens elsewhere. So the
// fix is structural, not cosmetic — the input goes, the text wraps under the base table
// CSS, and editing moves to the modal the way it always was on the FHA.
//
// WHAT THIS FILE LOCKS: one schema drives the table head, the row cells and the modal
// fields (nine lanes × three surfaces = twenty-seven places to drift, collapsed to one);
// no lane renders an in-cell input; the kebab leads with Edit and the keyed lanes get
// nothing destructive; the modal saves through the LANE'S OWN setters so every vocabulary
// guard still fires on a typed value. The save path is EXECUTED against a stub DOM — a
// modal that renders but writes nowhere is the failure a grep cannot see.

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');

function pinAtLeast(hay, file, floor) {
    const m = hay.match(new RegExp(file.replace(/\./g, '\\.') + '\\.js\\?v=([\\d.]+)'));
    if (!m) return false;
    const a = m[1].split('.').map(Number), b = String(floor).split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; }
    return true;
}
let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_hf_table_modal — text cells, one schema, the FHA layout, the modal\n');

const src = R('site/hf_analyses.js');
const idx = R('site/index.html');

// ---------------------------------------------------------------- schema
ok('one schema drives the lanes', /var HF_SCHEMA = \{/.test(src));
ok('the three-surface rationale is recorded', /ONE SCHEMA, THREE SURFACES/.test(src));
ok('why the text was hidden is recorded, as a structural cause', /Every HF cell was a live <input> with a min-width/.test(src));
const schema = (src.match(/var HF_SCHEMA = \{[\s\S]*?\n    \};/) || [''])[0];
['tid', 'tasks', 'hea', 'alerts', 'ergo', 'cd', 'sa', 'alloc', 'mfc', 'mfcFactor'].forEach(l => {
    ok('schema declares lane ' + l, new RegExp('\\n        ' + l + ': \\{').test(schema));
});
ok('the schema names vocabularies the lane already declares, never restates them',
    /opts: 'TID_MODES'/.test(schema) && /opts: 'CD_CONSIDERATIONS'/.test(schema) && !/opts: \[/.test(schema));
ok('the vocabulary resolver maps names to the lane lists', /function _hfVocab\(name\)/.test(src) && /CD_CONSIDERATIONS: CD_CONSIDERATIONS/.test(src));
ok('the credited-assumption id is a computed vocabulary, not free text', /optsFn: 'asmOptions'/.test(schema) && /function _hfOptsFn\(name\)/.test(src));
ok('the keyed lanes are marked fixed', /alloc: \{[\s\S]*?fixedRows: true/.test(schema) && /mfc: \{[\s\S]*?fixedRows: true/.test(schema));
ok('long prose columns get a max-width so one cell cannot squeeze the rest', /max-width:' \+ c\.w/.test(src));

// ---------------------------------------------------------------- table
ok('one table builder', /function _hfTableHtml\(lane\)/.test(src));
ok('the kebab is the FIRST column, as on every worksheet', /'<tr><th style="width:52px;">Actions<\/th>'/.test(src));
ok('the review cell is the LAST column', /\(cfg\.kind \? _revTd\(cfg\.kind, id\) : ''\) \+ '<\/tr>'/.test(src));
ok('why the order matters is recorded', /the shared kebab positioner, the selection layer and mass_actions all\s*\n\s*\/\/ expect to find the action cell where every other worksheet puts it/.test(src));
ok('rows carry their store id', /data-hf-id="/.test(src));
ok('no lane builds an in-cell input any more', !/onchange="HF_ANALYSES\.set(Tid|Task|Hea|Alert|Ergo|Cd|Sa|Alloc|MfcFn|MfcFactor)\(/.test(src));
ok('the shared inline-input style is gone with the inputs', !/var IN = 'style="font:inherit/.test(src));
ok('every render uses the builder', ['tid', 'tasks', 'hea', 'alerts', 'ergo', 'cd', 'sa', 'alloc', 'mfc', 'mfcFactor']
    .every(l => new RegExp("_hfTableHtml\\('" + l + "'\\)").test(src)));
ok('the TID uncited flag survived the refactor', /rowStyle: function \(r\) \{ return String\(r\.source \|\| ''\)\.trim\(\) \? '' : 'border-left:3px solid #B7791F;'; \}/.test(src));

// ---------------------------------------------------------------- kebab
ok('Edit leads the menu', /'<button type="button" role="menuitem" onclick="HF_ANALYSES\.openHfEdit\(/.test(src));
ok('the reason Edit is now present is recorded', /EDIT IS NOW THE FIRST ITEM/.test(src));
ok('keyed lanes omit Duplicate and Delete', /\(fixed \? '' : '<button type="button" role="menuitem" onclick="HF_ANALYSES\.duplicateRow/.test(src) &&
    /\(fixed \? '' : '<button type="button" role="menuitem" class="ram-danger"/.test(src));
ok('Credit moved into the tasks kebab, the way the FHA carries its own actions', /⤴ Credit into register<\/button>/.test(src) && /function creditTaskById\(id\)/.test(src));
ok('Credit is offered only while the task is uncredited', /return r\.asmId \? '' : '<button/.test(src));

// ---------------------------------------------------------------- modal
ok('the modal uses the house pattern', /ov\.className = 'modal-overlay show';/.test(src) && /'<div class="modal" style="max-width:880px;">'/.test(src));
ok('read-only fields are shown, never offered', /if \(c\.ro\) \{/.test(src));
ok('closed vocabularies become selects', /if \(c\.opts \|\| c\.optsFn\) \{/.test(src));
ok('long text becomes a textarea', /if \(c\.area\) \{/.test(src) && /<textarea rows="3"/.test(src));
ok('AI provenance is shown to the reviewer in the modal', /AI-drafted by ' \+ esc\(String\(row\.aiModel/.test(src));
ok('save writes through the lane setters, never onto the row object', /API\[cfg\.save\.fn\]\(idx, c\.k, v\)/.test(src) && /API\[cfg\.save\.fn\]\(rows\[idx\]\[cfg\.idField\], c\.k, v\)/.test(src));
ok('why that matters is recorded', /every vocabulary guard the\s*\n\s*\/\/ lane enforces on a typed value still fires/.test(src));
ok('the modal is exported', /openHfEdit: openHfEdit, saveHfEdit: saveHfEdit, closeHfEdit: closeHfEdit, HF_SCHEMA: HF_SCHEMA/.test(src));
ok('hf_analyses cache-bust bumped', pinAtLeast(idx, 'hf_analyses', '1.12'));

// ============================================================== EXECUTED
(function behaviour() {
    global.projectConfig = { hf: {} };
    global.scheduleAutosave = function () {};
    global.acFunctionsData = [{ internalId: 7, subId: 'SF-1', subName: 'Extend gear' }];
    global.acFhaData = []; global.acAssumptionsData = []; global.systemsData = [];
    global.window = {};
    global.esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    // A stub document: the modal appends an overlay; the save path asks that overlay for
    // its fields by data-hf-field. The stub serves whatever values the test plants.
    let fields = {}; let appended = null;
    global.document = {
        body: { appendChild(el) { appended = el; } },
        createElement() { return { style: {}, set innerHTML(h) { this._h = h; }, get innerHTML() { return this._h; },
            querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, remove() { appended = null; } }; },
        getElementById(id) {
            if (id === 'hf-edit-overlay' && appended) return { querySelector(sel) { const m = /data-hf-field="([^"]+)"/.exec(sel); return (m && m[1] in fields) ? { value: fields[m[1]] } : null; }, remove() { appended = null; } };
            if (/^hfe-/.test(id)) return { set onclick(f) {} };
            return null;
        }
    };
    let H;
    try { delete require.cache[require.resolve(path.join(SITE, 'site/hf_analyses.js'))]; H = require(path.join(SITE, 'site/hf_analyses.js')); }
    catch (e) { ok('module loads headless', false, e.message); return; }
    ok('module loads headless', !!H && typeof H.openHfEdit === 'function');

    // ---- text cells wrap: the value is in the markup as text, not inside an input ----
    H.addCd(); H.setCd(0, 'finding', 'A finding long enough that the old input box showed one fifth of it and the rest existed only if you arrowed along');
    const t = H._hfTableHtml('cd');
    ok('a long finding is rendered as text', /one fifth of it and the rest existed/.test(t));
    ok('and inside no input', !/<input|<select|<textarea/.test(t));
    ok('the action cell is first and the review cell last',
        /<tr data-hf-id="CD-001"[^>]*><td><div class="row-actions">/.test(t) && /<\/td><\/tr><\/tbody>/.test(t));

    // ---- the modal saves through the setter, and the setter's guard still fires ----
    H.openHfEdit('cd', 'CD-001');
    ok('the modal opened', !!appended && /Edit evaluation · CD-001/.test(appended.innerHTML));
    ok('the modal shows the finding in a textarea', /<textarea rows="3" id="hfe-finding"/.test(appended.innerHTML));
    ok('the modal shows the four §25.1302 considerations as a select', /<select id="hfe-consideration"/.test(appended.innerHTML) && /\(d\) error management/.test(appended.innerHTML));
    fields = { item: 'Gear lever', kind: 'Lever', consideration: '(b) usable by the qualified crew', supports: 'Extend gear', finding: 'Reach OK', status: 'Closed', notes: 'x' };
    ok('save returns true', H.saveHfEdit() === true);
    const row = H._read('cd').rows[0];
    ok('legal values landed', row.item === 'Gear lever' && row.consideration === '(b) usable by the qualified crew' && row.status === 'Closed' && row.finding === 'Reach OK');
    ok('an off-vocabulary kind was REFUSED by the lane setter — the modal is convenience, the setter is the guard',
        row.kind === 'Control', 'got ' + row.kind);
    ok('the modal closed after save', appended === null);

    // ---- keyed lanes: allocation saves by function internalId ----
    H.openHfEdit('alloc', 7);
    ok('the allocation modal opened on the function key', !!appended && /Edit allocation · 7/.test(appended.innerHTML));
    fields = { allocation: 'shared', rationale: 'Pilot judgement with automation cross-check' };
    H.saveHfEdit();
    const a = H._read('alloc').rows.find(r => String(r.key) === '7');
    ok('allocation saved through setAlloc', !!a && a.allocation === 'shared' && /cross-check/.test(a.rationale));

    // ---- the factors table saves by index ----
    H.openHfEdit('mfcFactor', '(3)');
    fields = { disposition: 'Adequate — dual FMC, dual radio nav' };
    H.saveHfEdit();
    ok('a workload factor disposition saved through setMfcFactor', /dual FMC/.test(String((H._read('mfc').factors || {})[2] || '')));

    // ---- the kebab knows which lanes are fixed ----
    ok('allocation kebab has Edit and nothing destructive', /openHfEdit\('alloc'/.test(H._hfTableHtml('alloc')) && !/deleteRow\('alloc'/.test(H._hfTableHtml('alloc')));
    ok('cd kebab has Edit, Duplicate and Delete', /openHfEdit\('cd'/.test(t) && /duplicateRow\('cd'/.test(t) && /deleteRow\('cd'/.test(t));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
