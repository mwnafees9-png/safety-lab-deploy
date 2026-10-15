/* SpaceMouse (3Dconnexion) support, shared by the CAD viewer and the exported report viewer.
 * WebHID (Chrome, Edge, the desktop app). Object mode 6DOF: the cap moves the model, so the camera
 * moves the opposite way about the pivot (selection center or model center).
 * Report 1: translation x, y, z (int16 LE); report 2: rotation rx, ry, rz (int16 LE); newer devices
 * send all six axes in report 1 (12 bytes). Report 3: buttons bitmask (bit 0 left, bit 1 right).
 * Axis mapping (device frame: x right, y toward the screen, z down; the cap's own axes):
 *   tx -> pan right, tz -> pan down (lift the cap: the view moves up), ty -> dolly (push in: closer),
 *   rx (tilt forward) -> pitch about the screen right axis, rz (twist) -> yaw about the screen up axis,
 *   ry (roll) -> roll about the view direction.
 * In Fly / Walk mode the input is ignored (the keyboard and mouse own the camera there).
 * The whole module is one factory so the export can inline it as source (SLSpaceMouse.source). */
(function (root) {
    'use strict';
    function factory(root) {
        var VERSION = '1.1', FULL = 350;   // typical full deflection counts
        // Accepted devices. 0x256f is 3Dconnexion's own vendor ID (any product). 0x046d is all of Logitech
        // (mice, keyboards), so only the 3Dconnexion products sold under it are accepted. The desktop app
        // mirrors this list in its HID permission handler.
        var DEVICES = [
            { vendorId: 0x256f },                       // 3Dconnexion, any product
            { vendorId: 0x046d, productId: 0xc603 },    // SpaceMouse Plus XT (USB); source: FreeSpacenav (spacenavd) device table
            { vendorId: 0x046d, productId: 0xc623 },    // SpaceTraveler
            { vendorId: 0x046d, productId: 0xc625 },    // SpacePilot
            { vendorId: 0x046d, productId: 0xc626 },    // SpaceNavigator
            { vendorId: 0x046d, productId: 0xc627 },    // SpaceExplorer
            { vendorId: 0x046d, productId: 0xc628 },    // SpaceNavigator for Notebooks
            { vendorId: 0x046d, productId: 0xc629 },    // SpacePilot Pro
            { vendorId: 0x046d, productId: 0xc62b }     // SpaceMouse Pro
        ];
        function accepts(dev) { return !!dev && DEVICES.some(function (f) { return f.vendorId === dev.vendorId && (f.productId == null || f.productId === dev.productId); }); }
        var DEFAULTS = { sensitivity: 1, deadzone: 0.06, invertRotation: false, invertTranslation: false, dominant: false, lockRotation: false, lockTranslation: false };
        var KEY = 'sl-spacemouse-settings';
        function loadSettings() { var s = {}; try { s = JSON.parse(root.localStorage.getItem(KEY) || '{}') || {}; } catch (_) { s = {}; } var o = {}; Object.keys(DEFAULTS).forEach(function (k) { o[k] = s[k] != null && typeof s[k] === typeof DEFAULTS[k] ? s[k] : DEFAULTS[k]; }); return o; }
        function saveSettings(o) { try { root.localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) {} }
        function i16(b, o) { var v = b[o] | (b[o + 1] << 8); return v >= 0x8000 ? v - 0x10000 : v; }
        // parseReport(id, bytes): { t } | { r } | { t, r } | { buttons }
        function parseReport(id, bytes) {
            var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer ? bytes.buffer.slice(bytes.byteOffset || 0, (bytes.byteOffset || 0) + bytes.byteLength) : bytes);
            if (id === 1 && b.length >= 12) return { t: [i16(b, 0), i16(b, 2), i16(b, 4)], r: [i16(b, 6), i16(b, 8), i16(b, 10)] };
            if (id === 1 && b.length >= 6) return { t: [i16(b, 0), i16(b, 2), i16(b, 4)] };
            if (id === 2 && b.length >= 6) return { r: [i16(b, 0), i16(b, 2), i16(b, 4)] };
            if (id === 3 && b.length >= 1) return { buttons: b[0] | ((b[1] || 0) << 8) };
            return null;
        }
        // motion(t, r, settings): normalized motion per second, after deadzone, dominant axis, locks and inversion
        function motion(t, r, s) {
            s = s || DEFAULTS;
            var ax = [t[0], t[1], t[2], r[0], r[1], r[2]].map(function (v) { var n = Math.max(-1, Math.min(1, v / FULL)); return Math.abs(n) < s.deadzone ? 0 : (n - Math.sign(n) * s.deadzone) / (1 - s.deadzone); });
            if (s.lockTranslation) { ax[0] = ax[1] = ax[2] = 0; }
            if (s.lockRotation) { ax[3] = ax[4] = ax[5] = 0; }
            if (s.dominant) { var bi = 0; for (var i = 1; i < 6; i++) if (Math.abs(ax[i]) > Math.abs(ax[bi])) bi = i; ax = ax.map(function (v, i) { return i === bi ? v : 0; }); }
            var it = s.invertTranslation ? -1 : 1, ir = s.invertRotation ? -1 : 1, k = s.sensitivity;
            return { panX: it * k * ax[0], panY: -it * k * ax[2], dolly: it * k * ax[1], pitch: ir * k * ax[3], roll: ir * k * ax[4], yaw: ir * k * ax[5], any: ax.some(function (v) { return v !== 0; }) };
        }
        function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
        function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
        function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
        function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
        function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
        function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
        function rot(v, axis, ang) { var c = Math.cos(ang), s = Math.sin(ang), k = axis; return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))); }
        var ROT_RATE = 1.2, PAN_RATE = 0.8, DOLLY_RATE = 1.0;   // rad/s, view widths/s, fraction of distance/s at full deflection
        // step(view {pos, target, up, pivot}, m, dt): the new view (object mode: camera moves opposite to the cap)
        function step(view, m, dt) {
            var pos = view.pos.slice(), tgt = view.target.slice(), up = norm(view.up), pv = view.pivot || tgt;
            var f = norm(sub(tgt, pos)), rgt = norm(cross(f, up)), u = cross(rgt, f), dist = Math.hypot.apply(null, sub(tgt, pos));
            var turns = [[u, -m.yaw * ROT_RATE * dt], [rgt, -m.pitch * ROT_RATE * dt], [f, -m.roll * ROT_RATE * dt]];
            turns.forEach(function (q) { if (!q[1]) return; pos = add(pv, rot(sub(pos, pv), q[0], q[1])); tgt = add(pv, rot(sub(tgt, pv), q[0], q[1])); up = rot(up, q[0], q[1]); });
            f = norm(sub(tgt, pos)); rgt = norm(cross(f, up)); u = cross(rgt, f);
            var pan = add(mul(rgt, -m.panX * PAN_RATE * dt * dist), mul(u, -m.panY * PAN_RATE * dt * dist)); pos = add(pos, pan); tgt = add(tgt, pan);
            if (m.dolly) { var nd = Math.max(dist * 0.02, dist * (1 - Math.max(-0.9, Math.min(0.9, m.dolly * DOLLY_RATE * dt)))); pos = sub(tgt, mul(f, nd)); }
            return { pos: pos, target: tgt, up: norm(up), pivot: pv };
        }
        // attach(adapter): adapter = { getView(), setView(v), fitAll(), openMenu(), busy() -> true in Fly/Walk, onStatus(text) }
        function attach(adapter) {
            var st = { t: [0, 0, 0], r: [0, 0, 0], buttons: 0, settings: loadSettings(), device: null, raf: 0, last: 0 };
            var raf = root.requestAnimationFrame ? root.requestAnimationFrame.bind(root) : function (fn) { return setTimeout(function () { fn(Date.now()); }, 16); };
            function status(t) { st.status = t; if (adapter.onStatus) adapter.onStatus(t); }
            function tick(now) {
                st.raf = 0; var dt = st.last ? Math.min(0.1, (now - st.last) / 1000) : 1 / 60; st.last = now;
                var m = motion(st.t, st.r, st.settings); if (!m.any) { st.last = 0; return; }
                if (!(adapter.busy && adapter.busy())) adapter.setView(step(adapter.getView(), m, dt));
                st.raf = raf(tick);
            }
            function feed(id, bytes) {
                var p = parseReport(id, bytes); if (!p) return;
                if (p.t) st.t = p.t; if (p.r) st.r = p.r;
                if (p.buttons != null) { var pressed = p.buttons & ~st.buttons; st.buttons = p.buttons; if (pressed & 1) adapter.fitAll(); if (pressed & 2 && adapter.openMenu) adapter.openMenu(); }
                if (!st.raf && motion(st.t, st.r, st.settings).any) st.raf = raf(tick);
            }
            function use(dev) {
                if (!dev) return Promise.resolve(false);
                st.device = dev; dev.oninputreport = function (e) { feed(e.reportId, new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength)); };
                return Promise.resolve(dev.opened ? null : dev.open()).then(function () { status('SpaceMouse connected: ' + (dev.productName || 'device')); return true; }, function (e) { status('SpaceMouse could not be opened: ' + (e && e.message || e)); return false; });
            }
            var hid = root.navigator && root.navigator.hid;
            var api = {
                available: !!hid, state: st, feed: feed, step: step,
                settings: function () { return Object.assign({}, st.settings); },
                set: function (k, v) { if (!(k in DEFAULTS)) return; st.settings[k] = v; saveSettings(st.settings); },
                connect: function () { if (!hid) { status(UNAVAILABLE); return Promise.resolve(false); } return hid.requestDevice({ filters: DEVICES.map(function (f) { return Object.assign({}, f); }) }).then(function (list) { var d = (list || []).filter(accepts)[0]; if (list && list.length && !d) { status('That device is not a SpaceMouse'); return false; } return use(d); }, function (e) { status('SpaceMouse not connected: ' + (e && e.message || e)); return false; }); },
                reconnect: function () { if (!hid || !hid.getDevices) return Promise.resolve(false); return hid.getDevices().then(function (list) { var d = (list || []).filter(accepts)[0]; return d ? use(d) : (status('SpaceMouse not connected'), false); }); }
            };
            if (hid && hid.addEventListener) hid.addEventListener('disconnect', function (e) { if (e.device === st.device) { st.device = null; st.t = [0, 0, 0]; st.r = [0, 0, 0]; status('SpaceMouse disconnected'); } });
            status(hid ? 'SpaceMouse not connected' : UNAVAILABLE);
            return api;
        }
        var UNAVAILABLE = 'SpaceMouse needs Chrome, Edge or the desktop app';
        return { VERSION: VERSION, DEVICES: DEVICES, accepts: accepts, DEFAULTS: DEFAULTS, UNAVAILABLE: UNAVAILABLE, parseReport: parseReport, motion: motion, step: step, attach: attach, loadSettings: loadSettings };
    }
    var api = factory(root);
    api.source = '(' + factory.toString() + ')';
    try { root.SLSpaceMouse = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
