// ============================================================================
// edit_locks.js — v1.0 — COL-2: server-authoritative FIELD locks for live co-editing.
//
// One writer per field. When someone starts editing a field, the client claims a
// lock via the acquire_edit_lock RPC; everyone else is refused and shown who holds it.
// The SERVER is the single source of truth (the RPC enforces workspace edit-rights and
// one-holder-per-field); the Realtime broadcast on slab-locks:<ws>:<proj> only makes the
// "held by …" indicator instant instead of polled. Locks carry a TTL and are refreshed by
// a heartbeat, so a tab that walks away frees the field automatically.
//
// This is the LIVE UX layer (claim / release / who-holds-it). The hard write-time guarantee
// — the save path refusing to overwrite a field another user holds — is a separate server
// check (COL-3) and does not depend on this file.
//
// Fails OPEN: on a transient outage or in local (no-cloud) mode, editing is never trapped —
// the save-time guard remains the backstop. Fenced off ITAR (controlled work is single-writer).
// Opt-out: ?locks=0 or localStorage SLA_LOCKS='0'. Exports window.SLLocks. BORN MODULAR.
// ============================================================================
(function () {
  'use strict';
  var TTL = 120, HB_MS = 45000;                 // lock lifetime (s) and heartbeat (< TTL/2)
  var _chan = null, _started = false, _tok = null, _hb = null;
  var _mine = new Map();                          // key -> expiresAtMs (locks I hold)
  var _peers = new Map();                         // key -> {held_by, name, exp}
  var _cbs = [];

  function _flagOff() { try { if (/[?&]locks=0/.test(location.search)) return true; if (localStorage.getItem('SLA_LOCKS') === '0') return true; } catch (_) {} return false; }
  function _client() { try { return typeof getSupabaseClient === 'function' ? getSupabaseClient() : null; } catch (_) { return null; } }
  function _projId() { try { return (typeof getActiveCloudProjectId === 'function' && getActiveCloudProjectId()) || window._activeCloudProjectId || null; } catch (_) { return null; } }
  function _wsId() { try { return (typeof getActiveWorkspaceId === 'function' && getActiveWorkspaceId()) || null; } catch (_) { return null; } }
  function _uid() { try { var s = window._supabaseSession; return (s && s.user && s.user.id) || null; } catch (_) { return null; } }
  function _myName() { try { var id = (window.SLAvatar && window.SLAvatar.me && window.SLAvatar.me()) || null; return (id && id.name) || 'Someone'; } catch (_) { return 'Someone'; } }
  // Mirror presence.js's ITAR fence: co-editing (and its locks) are off for controlled projects.
  function _itar() { try { var E = (typeof SLEnv !== 'undefined') ? SLEnv : (typeof window !== 'undefined' ? window.SLEnv : null); if (E && typeof E.get === 'function') { var pc = E.get('projectConfig'); if (pc !== undefined) return !!(pc && pc.isITARControlled); } if (typeof projectConfig !== 'undefined') return !!(projectConfig && projectConfig.isITARControlled); return true; } catch (_) { return true; } }
  function _notify(key) { for (var i = 0; i < _cbs.length; i++) { try { _cbs[i](key); } catch (_) {} } }
  function _send(action, key, exp) { try { if (_chan) _chan.send({ type: 'broadcast', event: 'lock', payload: { action: action, key: key, held_by: _uid(), name: _myName(), exp: exp || 0, tok: _tok } }); } catch (_) {} }

  // Claim a field. Resolves {ok:true} if you hold it now, {ok:false, name} if someone else does.
  async function claim(key) {
    if (_flagOff() || _itar()) return { ok: true };
    var c = _client(), proj = _projId();
    if (!c || !proj || !key) return { ok: true };           // local mode → nothing to lock
    try {
      var r = await c.rpc('acquire_edit_lock', { p_project: proj, p_resource: String(key), p_ttl_seconds: TTL });
      if (r.error) return { ok: true };                      // outage → fail OPEN (save-guard backstops)
      var row = (r.data && r.data[0]) || r.data || {};
      if (row.ok) { var exp = new Date(row.expires_at).getTime() || (Date.now() + TTL * 1000); _mine.set(String(key), exp); _peers.delete(String(key)); _send('claim', String(key), exp); _ensureHb(); _notify(key); return { ok: true }; }
      var p = _peers.get(String(key)); _notify(key); return { ok: false, held_by: row.held_by, name: p ? p.name : null };
    } catch (_) { return { ok: true }; }
  }
  async function release(key) {
    _mine.delete(String(key)); _send('release', String(key)); _notify(key);
    var c = _client(), proj = _projId(); if (!c || !proj || !key) return;
    try { await c.rpc('release_edit_lock', { p_project: proj, p_resource: String(key) }); } catch (_) {}
  }
  // Name of the OTHER user holding this field (not me, not expired) — or null if free/mine.
  function heldBy(key) { var p = _peers.get(String(key)); if (p && p.held_by !== _uid() && (!p.exp || p.exp > Date.now())) return p.name || 'Someone'; return null; }
  function mine(key) { var e = _mine.get(String(key)); return !!(e && e > Date.now()); }
  function onChange(cb) { if (typeof cb === 'function') _cbs.push(cb); }

  function _ensureHb() {
    if (_hb) return;
    _hb = setInterval(async function () {
      if (!_mine.size) { clearInterval(_hb); _hb = null; return; }
      var c = _client(), proj = _projId(); if (!c || !proj) return;
      var keys = Array.from(_mine.keys());
      for (var i = 0; i < keys.length; i++) {
        try { var r = await c.rpc('acquire_edit_lock', { p_project: proj, p_resource: keys[i], p_ttl_seconds: TTL }); var row = (r.data && r.data[0]) || {}; if (row.ok) { var exp = new Date(row.expires_at).getTime(); _mine.set(keys[i], exp); _send('claim', keys[i], exp); } else { _mine.delete(keys[i]); _notify(keys[i]); } } catch (_) {}
      }
    }, HB_MS);
  }

  function start() {
    if (_started || _flagOff() || _itar()) return;
    var c = _client(), ws = _wsId(), proj = _projId();
    if (!c || !ws || !proj) { setTimeout(start, 4000); return; }
    _tok = (crypto.randomUUID ? crypto.randomUUID() : 'l' + Math.random().toString(36).slice(2)).slice(0, 8);
    _chan = c.channel('slab-locks:' + ws + ':' + proj);
    _chan.on('broadcast', { event: 'lock' }, function (m) {
      var p = m && m.payload; if (!p || p.tok === _tok) return;
      if (p.action === 'claim') _peers.set(String(p.key), { held_by: p.held_by, name: p.name, exp: p.exp || 0 });
      else if (p.action === 'release') _peers.delete(String(p.key));
      _notify(p.key);
    });
    _chan.subscribe();
    _started = true;
  }
  function stop() { try { Array.from(_mine.keys()).forEach(function (k) { release(k); }); } catch (_) {} try { if (_chan) _chan.unsubscribe(); } catch (_) {} _chan = null; _started = false; if (_hb) { clearInterval(_hb); _hb = null; } }

  function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  _ready(function () { setTimeout(start, 3200); });

  var api = { claim: claim, release: release, heldBy: heldBy, mine: mine, onChange: onChange, start: start, stop: stop };
  if (typeof window !== 'undefined') window.SLLocks = api;
  if (typeof globalThis !== 'undefined') globalThis.SLLocks = api;
})();
