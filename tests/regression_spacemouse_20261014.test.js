#!/usr/bin/env node
/* Regression: SpaceMouse over WebHID (site/spacemouse.js), 14 Oct 2026. Synthetic HID reports in the
 * old split format (report 1 translation, report 2 rotation) and the new combined format (report 1,
 * 12 bytes), buttons, deadzone, dominant axis, locks, and the camera motion they make. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'spacemouse.js'), 'utf8');
const rep = (...v) => { const b = new Uint8Array(v.length * 2); v.forEach((x, i) => { const u = x & 0xffff; b[i * 2] = u & 0xff; b[i * 2 + 1] = u >> 8; }); return b; };
function scenario(src) {
    const store = {}; const sb = { Math, JSON, Object, Array, Uint8Array, setTimeout: (f) => { sb._q.push(f); return 1; }, _q: [], Date, Promise,
        localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb); vm.runInContext(src || SRC, sb);
    const S = sb.SLSpaceMouse, R = {};
    R.split1 = S.parseReport(1, rep(100, -200, 300)); R.split2 = S.parseReport(2, rep(-5, 6, -7));
    R.comb = S.parseReport(1, rep(1, 2, 3, 4, 5, 6)); R.btn = S.parseReport(3, new Uint8Array([3, 0]));
    const D = Object.assign({}, S.DEFAULTS);
    R.dead = S.motion([10, 0, 0], [0, 0, 0], D);                    // 10 counts = 3% < 6% deadzone
    R.full = S.motion([350, 0, 0], [0, 0, 0], D);
    R.dom = S.motion([200, 0, 0], [0, 0, 300], Object.assign({}, D, { dominant: true }));
    R.lockR = S.motion([0, 0, 0], [300, 300, 300], Object.assign({}, D, { lockRotation: true }));
    R.lockT = S.motion([300, 300, 300], [300, 0, 0], Object.assign({}, D, { lockTranslation: true }));
    R.inv = S.motion([350, 0, 0], [0, 0, 0], Object.assign({}, D, { invertTranslation: true }));
    // camera: looking along +x at the origin from x = -10000, z up
    const V = { pos: [-10000, 0, 0], target: [0, 0, 0], up: [0, 0, 1], pivot: [0, 0, 0] };
    R.yaw = S.step(V, S.motion([0, 0, 0], [0, 0, 350], D), 0.1);       // twist
    R.pitch = S.step(V, S.motion([0, 0, 0], [350, 0, 0], D), 0.1);     // tilt forward
    R.panR = S.step(V, S.motion([350, 0, 0], [0, 0, 0], D), 0.1);      // cap right
    R.lift = S.step(V, S.motion([0, 0, -350], [0, 0, 0], D), 0.1);     // cap lifted (z up is negative)
    R.push = S.step(V, S.motion([0, 350, 0], [0, 0, 0], D), 0.1);      // push toward the screen
    // attach: buttons, the fly / walk guard and the settings store
    let view = JSON.parse(JSON.stringify(V)), fits = 0, menus = 0, busy = false;
    const sm = S.attach({ getView: () => view, setView: v => { view = v; }, fitAll: () => { fits++; }, openMenu: () => { menus++; }, busy: () => busy, onStatus: t => { R.status = t; } });
    sm.feed(3, new Uint8Array([1, 0])); sm.feed(3, new Uint8Array([0, 0])); sm.feed(3, new Uint8Array([2, 0]));
    R.fits = fits; R.menus = menus;
    sm.feed(1, rep(350, 0, 0, 0, 0, 0)); sb._q.shift()(16); R.moved = view.pos[1] !== 0;
    busy = true; const before = JSON.stringify(view); sb._q.length && sb._q.shift()(32); R.busyKept = JSON.stringify(view) === before;
    sm.set('sensitivity', 2); R.stored = JSON.parse(store['sl-spacemouse-settings']).sensitivity; R.loaded = S.loadSettings().sensitivity;
    store['sl-spacemouse-settings'] = '{bad json'; R.badStore = S.loadSettings().sensitivity;
    R.acc = { mouse: S.accepts({ vendorId: 0x046d, productId: 0xc52b }), kbd: S.accepts({ vendorId: 0x046d, productId: 0xc31c }), nav: S.accepts({ vendorId: 0x046d, productId: 0xc626 }), pro: S.accepts({ vendorId: 0x046d, productId: 0xc62b }), new3dx: S.accepts({ vendorId: 0x256f, productId: 0xc635 }), other: S.accepts({ vendorId: 0x1234, productId: 0xc626 }) };
    R.filters = S.DEVICES.filter(f => f.vendorId === 0x046d).every(f => f.productId != null) && S.DEVICES.some(f => f.vendorId === 0x256f && f.productId == null);
    return R;
}
const R = scenario();
check('devices: a Logitech mouse (046d:c52b) and keyboard are rejected; SpaceNavigator and SpaceMouse Pro under 046d and any 3Dconnexion (256f) device are accepted', !R.acc.mouse && !R.acc.kbd && R.acc.nav && R.acc.pro && R.acc.new3dx && !R.acc.other, JSON.stringify(R.acc));
check('request filters: every 046d entry names a product ID; 256f accepts any product', R.filters);
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-6);
check('old split format: report 1 translation, report 2 rotation, int16 little endian with signs', R.split1.t.join() === '100,-200,300' && !R.split1.r && R.split2.r.join() === '-5,6,-7');
check('new combined format: report 1 of 12 bytes carries all six axes', R.comb.t.join() === '1,2,3' && R.comb.r.join() === '4,5,6');
check('report 3: buttons bitmask', R.btn.buttons === 3);
check('deadzone: a small deflection makes no motion', !R.dead.any && R.dead.panX === 0);
check('full deflection: unit motion on that axis only', near(R.full.panX, 1) && R.full.panY === 0 && R.full.dolly === 0 && R.full.yaw === 0);
check('dominant axis: only the largest axis moves', R.dom.yaw > 0 && R.dom.panX === 0);
check('locks: rotation locked keeps pan, translation locked keeps rotation', !R.lockR.any && R.lockT.pitch > 0 && R.lockT.panX === 0 && R.lockT.dolly === 0);
check('invert pan and zoom', near(R.inv.panX, -1));
const dist = v => Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
check('twist: the camera orbits about the vertical through the pivot, distance kept', R.yaw.pos[1] !== 0 && near(R.yaw.pos[2], 0) && near(dist(R.yaw), 10000, 1e-3), JSON.stringify(R.yaw.pos));
check('tilt: the camera orbits about the screen right axis (rises or drops), distance kept', !near(R.pitch.pos[2], 0) && near(R.pitch.pos[1], 0) && near(dist(R.pitch), 10000, 1e-3), JSON.stringify(R.pitch.pos));
check('cap right: object mode, the model moves right, so the camera and target move left (y +)', R.panR.pos[1] > 0 && R.panR.target[1] > 0 && near(R.panR.pos[1], R.panR.target[1]), JSON.stringify(R.panR));
check('cap lifted: the model moves up, the camera moves down', R.lift.pos[2] < 0 && near(R.lift.pos[2], R.lift.target[2]));
check('push toward the screen: dolly in, closer to the target, direction kept', dist(R.push) < 10000 && near(R.push.pos[1], 0) && near(R.push.pos[2], 0));
check('buttons: left = Fit all, right = open the Navigate menu, on press only', R.fits === 1 && R.menus === 1);
check('motion runs per frame from the reports; in Fly / Walk (busy) the camera is left alone', R.moved && R.busyKept);
check('settings saved and read back; a broken store falls back to the defaults', R.stored === 2 && R.loaded === 2 && R.badStore === 1);
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(scenario(SRC.replace(from, to))); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mut('swapped axes (pan from tz, lift from tx)', "panX: it * k * ax[0], panY: -it * k * ax[2]", "panX: it * k * ax[2], panY: -it * k * ax[0]", r => near(r.full.panX, 1) && r.lift.pos[2] < 0);
mut('deadzone ignored', "return Math.abs(n) < s.deadzone ? 0 :", "return false ? 0 :", r => !r.dead.any);
mut('combined report read as translation only', "if (id === 1 && b.length >= 12)", "if (false)", r => r.comb.r && r.comb.r.join() === '4,5,6');
mut('all of Logitech accepted', "(f.productId == null || f.productId === dev.productId)", "true", r => !r.acc.mouse);
mut('locks ignored', "if (s.lockRotation) { ax[3] = ax[4] = ax[5] = 0; }", "", r => !r.lockR.any);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
