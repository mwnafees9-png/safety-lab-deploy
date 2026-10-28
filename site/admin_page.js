// ============================================================================
// admin_page.js, v1.0, 28 Oct 2026: the Admin page.
//
// Waqas: "why dont we make admin a page instead of a a modal and make connections live there, this is not just a
// requirements thing"; on what else lives there: "AI key is fine where it is, seats, and licenses yes".
//
// The Admin section of the left menu is a page with three tabs (nav_areas.js lays them out like every section):
//   Connections           connections.js draws it (#view-conn), as before; it left the Requirements section.
//   Workspaces and locks  the areas and the activity list that used to open in a window (openWorkspacesPanel,
//                         helpers_modules.js), drawn on the page.
//   Seats and license     this install's license (who it is for, the plan, seats, when it ends) and, on a
//                         customer's own server, how many seats are in use and by whom. An admin can load a renewed
//                         license file here; it is checked by the same verifier as the license screen
//                         (slab_license.js) and only kept if it verifies.
// ============================================================================
(function () {
    'use strict';
    var W = (typeof window !== 'undefined') ? window : globalThis;
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function _isAdmin() { try { return !!(W.SLConnections && W.SLConnections.isAdmin && W.SLConnections.isAdmin()); } catch (_) { return false; } }
    function _report(e, where) { try { if (W.SLErrorWatch) W.SLErrorWatch.report(e, 'admin_page: ' + where); } catch (_) {} }
    function _btn(label, js, primary) { return '<button type="button" class="ckpt-m-btn' + (primary ? ' ckpt-m-btn-primary' : '') + '" onclick="' + js + '">' + label + '</button>'; }

    // ------------------------------------------------------------------ Workspaces and locks
    function drawWs() {
        var host = document.getElementById('admin-ws-host'); if (!host) return;
        try { if (typeof W.openWorkspacesPanel === 'function') W.openWorkspacesPanel(host); else host.innerHTML = '<div class="cx-card cx-dim">Workspaces are not available in this build.</div>'; }
        catch (e) { _report(e, 'workspaces'); host.innerHTML = '<div class="cx-card cx-err">' + _esc((e && e.message) || e) + '</div>'; }
    }

    // ------------------------------------------------------------------ Seats and license
    function _date(iso) { var t = Date.parse(iso || ''); return isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; }
    function licenseHtml() {
        var L = W.SLLicense || null, mode = (W.SLConfig && W.SLConfig.mode) || 'hosted-demo';
        var customer = mode === 'self-hosted' || mode === 'browser-only' || mode === 'desktop';
        var rows = [];
        if (L && L.valid) {
            rows.push(['Licensed to', L.customer || '']);
            rows.push(['Plan', String(L.tier || '') + (L.trial ? ' (trial)' : '')]);
            if (L.seats != null) rows.push(['Seats', String(L.seats)]);
            rows.push(['Ends', _date(L.expiresAt) + (L.daysLeft != null ? ' (' + L.daysLeft + ' day' + (L.daysLeft === 1 ? '' : 's') + ' left)' : '')]);
            if (L.id) rows.push(['License number', L.id]);
        }
        var status = (L && L.valid) ? '<span class="cx-pill ok">Valid</span>'
            : (customer ? '<span class="cx-pill red">No valid license</span>' : '<span class="cx-pill tool">Hosted service</span>');
        var why = (L && !L.valid && customer) ? '<div class="cx-warn">' + _esc(typeof W.SLLicensePlainReason === 'function' ? W.SLLicensePlainReason(L.reason) : (L.reason || '')) + '</div>' : '';
        var hosted = (!customer && !(L && L.valid)) ? '<div class="cx-dim">This is Safety Lab’s hosted service: the plan comes with your account, so there is no license file to manage here.</div>' : '';
        var load = (customer || (L && L.present)) ? (_isAdmin()
            ? '<div class="cx-row cx-gap"><label class="cx-lab">Load a renewed license file<input type="file" id="adm-lic-file" accept=".lic,.txt"></label>' + _btn('Check and load', 'SLAdminPage.loadLicense()', true) + '<div class="cx-err" role="alert" id="adm-lic-err"></div></div><div class="cx-dim">The file is checked first; it is only kept if Safety Lab issued it, for this server, and it is in date. The page then reloads to use it.</div>'
            : '<div class="cx-dim">Only an admin can load a new license.</div>') : '';
        return '<section class="cx-card"><div class="cx-row"><h4>License</h4>' + status + '</div>' +
            (rows.length ? '<table class="cx-table"><tbody>' + rows.map(function (r) { return '<tr><td class="cx-dim cx-nowrap">' + _esc(r[0]) + '</td><td>' + _esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
            why + hosted + load + '</section>';
    }
    function seatsHtml() {
        var S = null; try { S = W.SLSeats && W.SLSeats.state ? W.SLSeats.state() : null; } catch (_) { S = null; }
        if (!S || !S.active) {
            var what = S && S.status === 'off' ? 'This server counts no seats (its license sets no seat number).' : 'Seats are counted only on a customer’s own Safety Lab server. This install does not count them.';
            return '<section class="cx-card"><h4>Seats</h4><div class="cx-dim">' + _esc(what) + '</div></section>';
        }
        var hs = (S.holders || []).map(function (h) { return '<li>' + _esc(h.email || '') + (h.you ? ' (you)' : '') + '</li>'; }).join('');
        var word = { held: 'You hold a seat.', full: 'Every seat is in use.', unreachable: 'The server could not be reached just now.', 'signed-out': 'Sign in again to hold a seat.' }[S.status] || '';
        return '<section class="cx-card"><div class="cx-row"><h4>Seats</h4><span class="cx-pill ' + (S.status === 'full' ? 'red' : 'ok') + '">' + _esc(String(S.inUse == null ? '?' : S.inUse) + ' of ' + String(S.seats == null ? '?' : S.seats) + ' in use') + '</span><span class="cx-right">' + _btn('Check now', 'SLAdminPage.seatsNow()') + '</span></div>' +
            (word ? '<div class="cx-dim">' + _esc(word) + '</div>' : '') +
            (hs ? '<div><b>In use by</b><ul>' + hs + '</ul></div>' : '') +
            '<div class="cx-dim">A seat is given back on sign-out or when the window closes; one that stops checking in (a closed lid, a lost network) frees itself after 30 minutes.</div></section>';
    }
    function drawLic() {
        var host = document.getElementById('admin-lic-host'); if (!host) return;
        host.innerHTML = '<div class="cx-head"><div><h3>Seats and license</h3><p>This install’s license, and how many of its seats are in use.</p></div></div><div class="cx-body">' + licenseHtml() + seatsHtml() + '</div>';
    }
    async function loadLicense() {
        var err = document.getElementById('adm-lic-err'), inp = document.getElementById('adm-lic-file');
        var say = function (t) { if (err) err.textContent = t || ''; };
        if (!_isAdmin()) { say('Only an admin can load a new license.'); return; }
        var f = inp && inp.files && inp.files[0]; if (!f) { say('Choose the license file first.'); return; }
        if (typeof W.SLLicenseInstall !== 'function') { say('This build cannot load licenses.'); return; }
        var text = ''; try { text = await f.text(); } catch (e) { say('The file could not be read.'); return; }
        say('Checking...');
        var r = await W.SLLicenseInstall(text);
        if (!r || !r.valid) { say(typeof W.SLLicensePlainReason === 'function' ? W.SLLicensePlainReason(r && r.reason) : ('Not loaded: ' + (r && r.reason))); return; }
        say('Loaded: ' + (r.customer || '') + ', ' + (r.tier || '') + ', ends ' + _date(r.expiresAt) + '. Reloading to use it...');
        setTimeout(function () { try { W.location.reload(); } catch (_) {} }, 900);
    }
    async function seatsNow() { try { if (W.SLSeats && W.SLSeats.claimNow) await W.SLSeats.claimNow(); } catch (e) { _report(e, 'seats'); } drawLic(); }

    // ------------------------------------------------------------------ in the app's navigation
    (function wrapNav() {
        if (typeof W.switchTab !== 'function' || W.switchTab._adminWrapped) return;
        var orig = W.switchTab;
        var wrapped = function (tabId) {
            if (tabId === 'admin') tabId = 'conn';             // the section's first page
            var r = orig.call(this, tabId);
            try { if (tabId === 'admin-ws') drawWs(); if (tabId === 'admin-lic') drawLic(); } catch (e) { _report(e, 'draw'); }
            return r;
        };
        wrapped._adminWrapped = true;
        // keep the flags the other wrappers look for, so none of them wraps twice
        Object.keys(orig).forEach(function (k) { if (/Wrapped$/.test(k)) wrapped[k] = orig[k]; });
        W.switchTab = wrapped;
    })();
    try { if (typeof W.addEventListener === 'function') W.addEventListener('slab-license-changed', function () { try { var v = document.getElementById('view-admin-lic'); if (v && v.style.display !== 'none') drawLic(); } catch (_) {} }); } catch (_) {}

    W.SLAdminPage = { drawWs: drawWs, drawLic: drawLic, loadLicense: loadLicense, seatsNow: seatsNow, licenseHtml: licenseHtml, seatsHtml: seatsHtml };
})();
