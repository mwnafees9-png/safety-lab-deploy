// regression_empty_banner_20261016: a project holding only CAD, zones, risk areas or AI inputs is NOT empty.
//
// The bug (16 Oct 2026, live, AI test project): after a reload the app showed
// "This project is empty, but an earlier snapshot exists" over a project holding a CAD model,
// four risk areas, damage notes and five AI source documents. The emptiness check only looked at
// FHA, requirements, fault trees, systems and the HF/RAM/MMEL/Markov lanes. A second gap: the
// banner is shown after a slow IndexedDB read, so it could appear after the cloud project had opened.
//
// Run: node tests/regression_empty_banner_20261016.test.js           (mutation: add --mutate)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const MUTATE = process.argv.includes('--mutate');
let pass = 0, fail = 0;
function check(name, ok) { if (ok) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }
const S = f => fs.readFileSync(path.join(ROOT, 'site', f), 'utf8');
function fn(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
    const j = src.indexOf('\n}', i);
    return src.slice(i, j + 2);
}
let helpers = S('helpers_modules.js');
if (MUTATE) helpers = helpers.replace("var ARR = ['cadModels', 'praVolumes', 'zones', 'interfaces'];", "var ARR = [];");
const dataOps = S('data_ops_modules.js');
const cloud = S('cloud_sync.js');
const idx = S('index.html');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fn(helpers, '_projectConfigHasAuthoredContent') + '\n' + fn(helpers, '_autosaveHasContent'), ctx);
const has = d => vm.runInContext('_autosaveHasContent(' + JSON.stringify(d) + ')', ctx);
const BLANK = () => ({ projectName: 'Untitled Project', acFhaData: [], acReqData: [], systemsData: [], ftaPages: [{ root: null }],
    flightPhasesData: [{ phase: 'Taxi' }], projectConfig: { regulation: 'Part 25', markovModels: [], interfaces: [], missionProfiles: [] } });

console.log('\n[A] the content check, executed');
check('A1 a blank new project is still empty', has(BLANK()) === false);
check('A2 the seeded flight phase table alone is not content', has(Object.assign(BLANK(), { flightPhasesData: [{ phase: 'Cruise' }] })) === false);
const pcWith = (k, v) => { const b = BLANK(); b.projectConfig[k] = v; return b; };
check('A3 an imported CAD model is content', has(pcWith('cadModels', [{ id: 'cad-1' }])) === true);
check('A4 risk areas are content', has(pcWith('praVolumes', [{ id: 'v1', kind: 'fire' }])) === true);
check('A5 zones are content', has(pcWith('zones', [{ id: 'z1' }])) === true);
check('A6 CAD links are content', has(pcWith('cadLinks', { 'cad-1|p1': { on: true } })) === true);
check('A7 AI damage notes are content', has(pcWith('damageAssumptions', { k: [{ text: 'x' }] })) === true);
check('A8 an empty notes object is not content', has(pcWith('damageAssumptions', {})) === false);
const top = (k, v) => { const b = BLANK(); b[k] = v; return b; };
check('A9 AI source documents are content', has(top('projectSourceDocs', [{ id: 'd1' }])) === true);
['acFunctionsData', 'acFcimData', 'acAssumptionsData', 'fmeaData', 'itemsData', 'praData', 'zsaData', 'cmaData', 'routingData', 'resourcesData']
    .forEach(k => check('A10 ' + k + ' rows are content', has(top(k, [{ id: 1 }])) === true));
check('A11 the live AI test shape (CAD + 4 risk areas + 5 docs) is content', has(Object.assign(BLANK(), {
    projectSourceDocs: [1, 2, 3, 4, 5].map(i => ({ id: 'd' + i })),
    projectConfig: { cadModels: [{ id: 'cad-1' }], praVolumes: [1, 2, 3, 4].map(i => ({ id: 'v' + i })), damageAssumptions: { a: [] } } })) === true);

console.log('\n[B] the banner is not shown over a project that has content');
check('B1 the offer checks the project on screen before showing the banner',
    /_liveProjectHasContent\(\)\) return false;\s*try \{ _showLastGoodBanner\(ts\)/.test(fn(dataOps, '_offerLastGoodIfAny')));
check('B2 an open cloud project counts as not empty', /_activeCloudProjectId\) return true/.test(fn(dataOps, '_liveProjectHasContent')));
check('B3 the banner is marked so it can be removed alone', /data-sl-lastgood/.test(fn(dataOps, '_showLastGoodBanner')));
check('B4 opening a cloud project removes the banner', /recovery-banner\[data-sl-lastgood\]/.test(fn(helpers, '_restoreProjectSnapshot')));
check('B5 applying project data removes the banner', /recovery-banner\[data-sl-lastgood\]/.test(fn(dataOps, '_applyProjectData')));
// executed: a late IndexedDB answer while a cloud project is open shows nothing
{
    const c = { console, shown: 0, _activeCloudProjectId: 'b408d862-x', localStorage: { getItem: () => null }, LASTGOOD_KEY: 'k', LASTGOOD_META_KEY: 'm',
        SLDB: { available: () => true, get: () => Promise.resolve(JSON.stringify({ acFhaData: [1] })) }, _maybeDecompress: x => x };
    vm.createContext(c);
    vm.runInContext(fn(helpers, '_projectConfigHasAuthoredContent') + fn(helpers, '_autosaveHasContent') + fn(dataOps, '_liveProjectHasContent') +
        fn(dataOps, '_offerLastGoodIfAny') + '\nfunction _showLastGoodBanner(){ shown++; }', c);
    vm.runInContext('_offerLastGoodIfAny()', c);
    setTimeout(() => {
        check('B6 executed: no banner while a cloud project is open', c.shown === 0);
        vm.runInContext('_activeCloudProjectId = null; _buildProjectSnapshot = function(){ return { acFhaData: [] }; }; _offerLastGoodIfAny()', c);
        setTimeout(() => {
            check('B7 executed: a truly blank tab still gets the offer', c.shown === 1);
            console.log('\n[C] cloud_sync uses the same check');
            check('C1 _hasRealContent consults the shared check', /window\.__slProjectHasContent\(s\)\) return true/.test(fn(cloud, '_hasRealContent')));
            check('C2 helpers exposes it', /window\.__slProjectHasContent = _autosaveHasContent/.test(helpers));
            check('C3 index.html loads the new versions', /helpers_modules\.js\?v=3\.(3[1-9]|[4-9]\d)"/.test(idx) && /data_ops_modules\.js\?v=66\.55/.test(idx) && /cloud_sync\.js\?v=2\.([7-9]|\d\d)"/.test(idx));
            console.log('\n' + pass + ' passed, ' + fail + ' failed');
            if (MUTATE) { console.log(fail ? 'mutation caught' : 'MUTATION NOT CAUGHT'); process.exit(fail ? 0 : 1); }
            process.exit(fail ? 1 : 0);
        }, 20);
    }, 20);
}
