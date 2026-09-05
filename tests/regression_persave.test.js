// regression_persave.test.js — per-change immediate save + newest-wins recovery + required
// save location. The durability programme, 2 Sep 2026.
//
// Waqas, after losing a session to a refresh: "I want saving per change", "require the user
// to specify a save location", "we should be able to refresh where we left off." Three
// changes, one goal — no window in which a committed change is unsaved, and load that
// always comes back to the newest good copy.
//
// WHAT IS PINNED, and why each is a real regression risk:
//   1. scheduleAutosave writes on a coalesced MICROTASK, not a 2s debounce. The debounce was
//      the loss window. The microtask must (a) fire — proven by running the real function
//      against a fake _writeAutosave and flushing the microtask queue — and (b) COALESCE a
//      synchronous burst of N calls into ONE write, which is what stops a 44-row accept from
//      writing the whole document 44 times.
//   2. checkAutosaveRecovery is NEWEST-WINS: IndexedDB is consulted even when localStorage
//      recovered something, and re-applies only when strictly newer. Pinned structurally on
//      the shipped source (the executed E1/recovery harness lives in regression_autosave_e1,
//      which still passes).
//   3. New Project requires a save location via SaveFs, on a real click gesture, with an
//      honest browser-only fallback — never a hard lockout.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? ('\n       ' + extra) : '')); }
}
console.log('\nregression_persave — per-change save, newest-wins load, required save location\n');

const misc = R('site/misc_fn_modules.js');
const dops = R('site/data_ops_modules.js');
const bind = R('site/bindings_modules.js');
const idx = R('site/index.html');

// ---------------------------------------------------- 1. per-change immediate save
ok('the 2-second debounce is gone from scheduleAutosave', !/_autosaveDebounceTimer = setTimeout\(\(\) => \{[\s\S]*?\}, 2000\)/.test(misc));
ok('the coalesce flag is declared', /let _autosaveFlushQueued = false;/.test(bind));
ok('scheduleAutosave queues a single microtask flush', /if \(_autosaveFlushQueued\) return;[\s\S]*?_autosaveFlushQueued = true;/.test(misc) && /queueMicrotask\(_flush\)/.test(misc));
ok('the flush writes through the real _writeAutosave', /var _flush = function \(\) \{[\s\S]*?_writeAutosave\(\);/.test(misc));
ok('the loss-window reason is recorded', /That window was the loss/.test(misc));
ok('the burst-coalesce reason is recorded', /accepting 44 drafted rows calls this 44 times/.test(misc));
ok('the exit flush clears the coalesce flag so it cannot double-write', /_autosaveFlushQueued = false;   \/\/ per-change: this synchronous flush/.test(misc));

// EXECUTED: the real scheduleAutosave, against a counting stub, proving fire + coalesce.
(function behaviour() {
    const body = (misc.match(/function scheduleAutosave\(\) \{[\s\S]*?\n\}/) || [''])[0];
    ok('scheduleAutosave lifted', body.length > 300);
    let writes = 0;
    const sandbox = {
        _autosaveSuspended: false, _dirtySinceSave: false, _autosavePending: false, _autosaveFlushQueued: false,
        _quantClearCache() {}, _wsTrackActivity() {}, _updateSaveIndicator() {},
        _writeAutosave() { writes++; },
        window: {}, queueMicrotask: (fn) => { sandbox.__q = sandbox.__q || []; sandbox.__q.push(fn); }
    };
    sandbox.window = sandbox;
    const vm = require('vm');
    vm.createContext(sandbox);
    vm.runInContext('var scheduleAutosave = ' + body.replace(/^function scheduleAutosave/, 'function') + ';', sandbox);
    // a synchronous BURST of 44 calls, exactly the batch-accept shape
    vm.runInContext('for (var i=0;i<44;i++) scheduleAutosave();', sandbox);
    ok('no write happens synchronously during the burst (it is queued)', writes === 0);
    ok('the burst queued exactly ONE flush, not 44', (sandbox.__q || []).length === 1, 'queued ' + (sandbox.__q || []).length);
    // flush the microtask queue
    (sandbox.__q || []).forEach(fn => fn());
    ok('after the microtask, exactly ONE write landed for the whole burst', writes === 1, 'writes ' + writes);
    // a second, separate change queues and writes again — per change, not once ever
    sandbox.__q = [];
    vm.runInContext('scheduleAutosave();', sandbox);
    (sandbox.__q || []).forEach(fn => fn());
    ok('a later separate change writes again', writes === 2);
    // suspended => nothing
    sandbox.__q = []; sandbox._autosaveSuspended = true;
    vm.runInContext('scheduleAutosave();', sandbox);
    ok('a suspended autosave neither queues nor writes', (sandbox.__q || []).length === 0 && writes === 2);
})();

// ---------------------------------------------------- 2. newest-wins recovery
ok('recovery captures the localStorage ts it applied', /_recoveredTs = \(m && m\.ts\) \|\| 0;/.test(dops));
ok('IndexedDB is consulted even when localStorage recovered (not `!recovered &&`)',
    /if \(SLDB\.available\(\)\) \{[\s\S]*?SLDB\.get\(AUTOSAVE_KEY\)/.test(dops) && !/if \(!recovered && SLDB\.available\(\)\)/.test(dops));
ok('IndexedDB re-applies only when strictly newer than the localStorage copy', /if \(recovered && !\(idbTs > _recoveredTs\)\) return false;/.test(dops));
ok('the newest-wins reason (torn write / quota) is recorded', /a torn write \(localStorage quota-failed while IndexedDB/.test(dops));
ok('last-good is offered only when NOTHING recovered from either store', /if \(!ok && !recovered\) _offerLastGoodIfAny\(\);/.test(dops));
ok('the HF-durability fix it builds on is present', /_projectConfigHasAuthoredContent/.test(R('site/helpers_modules.js')));

// ---------------------------------------------------- 3. required save location
ok('New Project create is async so the picker can be awaited', /async function npwCreate\(\)/.test(misc));
ok('it requires a save location at the end', /await _requireSaveLocation\(\);/.test(misc));
ok('the requirer exists and uses SaveFs', /async function _requireSaveLocation\(\)/.test(misc) && /SaveFs\.chooseDefaultDir\(\)/.test(misc));
ok('an already-bound folder is reused, not re-prompted', /if \(existing\) \{ try \{ scheduleAutosave\(\); \} catch \(_\) \{\} return; \}/.test(misc));
ok('unsupported browsers defer silently to IndexedDB + cloud', /!SaveFs\.isSupported\(\)\) return;/.test(misc));
ok('cancelling warns plainly and never hard-locks the user out', /kept in your browser only and can be lost/.test(misc));
ok('binding a folder writes the first .sl immediately', /if \(handle\) \{ try \{ scheduleAutosave\(\); \} catch \(_\) \{\} \}/.test(misc));

// ---------------------------------------------------- cache-busts
// 66.34 -> 66.35 (3 Sep 2026): HF_Tasks CSV carries Reaction / Execution / Response.
// 66.35 -> 66.36 (3 Sep 2026): FHA CSV carries Aircraft / Crew / Pax Level (three effect axes).
// misc 66.53 -> 66.54 (4 Sep 2026, F15): CoFFE resolves function-member MAC tokens to the owner system.
// misc 66.54 -> 66.55 (4 Sep 2026, F16b): … and configuration-item members (itemId / internalId → owningSystemId).
// bindings 1.35 -> 1.36 (5 Sep 2026, lever 3): every seeded phase carries its escape.
['data_ops_modules.js?v=66.36', 'bindings_modules.js?v=1.36', 'misc_fn_modules.js?v=66.55'].forEach(pin => {
    ok('index pins ' + pin, idx.indexOf(pin) >= 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
