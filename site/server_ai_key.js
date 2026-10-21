// ============================================================================
// server_ai_key.js, v1.0, 21 Oct 2026: the AI key of a customer's own server, set from the app.
//
// Waqas: "why cant he just save his API key directly in safety lab". On a customer's own server
// the AI runs through that server, so the key belongs on the server, and until now the only way
// to put it there was a command in the server's terminal. This panel (AI Assistant settings)
// lets the server's ADMINISTRATOR paste it here instead. The app hands it straight to the
// server's AI service (selfhost/ai-proxy/server_key.mjs), which checks it with Anthropic, stores
// it on the server and uses it from the next AI call. The key never comes back: this page can
// only learn THAT a key is set and its last four characters. Everyone else sees who to ask.
//
// Shown only on a customer's own server (the same test slab_seats.js uses); on Safety Lab's
// cloud the AI is ours and this panel stays hidden.
// ============================================================================
(function () {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : {};
  var _esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var busy = false, last = null;

  function base() {
    var c = W.SLConfig || {};
    if (!(c.mode === 'self-hosted' || c.mode === 'desktop')) return '';
    if (!c.supabaseUrl || !c.aiEndpoint) return '';
    try { if (typeof c.pointsAtSafetyLab === 'function' && (c.pointsAtSafetyLab(c.aiEndpoint) || c.pointsAtSafetyLab(c.supabaseUrl))) return ''; } catch (_) { return ''; }
    return String(c.aiEndpoint).replace(/\/+$/, '');
  }
  function token() {
    try { var s = W.getSupabaseSession && W.getSupabaseSession(); return (s && s.access_token) || ''; } catch (_) { return ''; }
  }
  function call(method, body) {
    var b = base(), t = token();
    if (!b) return Promise.resolve({ status: 0, data: { message: 'This install has no server of its own.' } });
    if (!t) return Promise.resolve({ status: 401, data: { message: 'Sign in first.' } });
    var opts = { method: method, headers: { authorization: 'Bearer ' + t, accept: 'application/json' }, cache: 'no-store' };
    if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(b + '/admin/ai-key', opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d || {} }; });
    }).catch(function () { return { status: 0, data: { message: 'The server did not answer.' } }; });
  }
  function host() { return document.getElementById('server-ai-key-panel'); }

  function statusLine(s) {
    if (!s || !s.set) return '<span style="color:var(--color-warning); font-weight:600;">No AI key on this server yet.</span> The AI buttons will not work until one is added.';
    var who = s.source === 'app'
      ? 'set here' + (s.setBy ? ' by ' + _esc(s.setBy) : '') + (s.setAt ? ' on ' + _esc(String(s.setAt).slice(0, 10)) : '')
      : 'set in the server\'s settings file (stack/ai-proxy.env)';
    return '<span style="color:var(--color-success); font-weight:600;">Key set</span> (ending …' + _esc(s.last4 || '') + '), ' + who + '.';
  }

  function paint(state) {
    var h = host(); if (!h) return;
    var b = base();
    if (!b) { h.style.display = 'none'; h.innerHTML = ''; return; }
    h.style.display = '';
    var head = '<div style="font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:6px;">Server AI key</div>' +
      '<div style="font-size:12px; color:var(--color-text-secondary); margin-bottom:8px;">On your organization\'s own server the AI runs through the server, so one key, kept on the server, serves everyone. It is never stored on anyone\'s computer.</div>';
    var body = '';
    if (state.kind === 'loading') body = '<div style="font-size:12px; color:var(--color-text-tertiary);">Checking the server…</div>';
    else if (state.kind === 'admin') {
      body = '<div id="server-ai-key-status" style="font-size:12.5px; margin-bottom:8px;">' + statusLine(state.s) + '</div>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">' +
        '<input type="password" id="server-ai-key-input" placeholder="Paste the Anthropic key (sk-ant-…)" autocomplete="off" spellcheck="false" style="font-size:12px; padding:5px 9px; width:320px;">' +
        '<button class="action-btn btn-cyan" onclick="SLServerAiKey.save()"' + (busy ? ' disabled' : '') + '>' + (state.s && state.s.set ? 'Replace key' : 'Save key') + '</button>' +
        (state.s && state.s.source === 'app' ? '<button class="action-btn" onclick="SLServerAiKey.remove()"' + (busy ? ' disabled' : '') + '>Remove</button>' : '') +
        '</div><div id="server-ai-key-msg" style="font-size:12px; margin-top:6px;">' + (state.msg || '') + '</div>' +
        '<div style="font-size:11px; color:var(--color-text-tertiary); margin-top:6px;">The server checks the key with Anthropic before keeping it, and uses it from the next AI request. Nobody can read it back, including you.</div>';
    } else if (state.kind === 'notadmin') {
      body = '<div style="font-size:12.5px;">' + statusLine(state.s) + '</div><div style="font-size:12px; color:var(--color-text-secondary); margin-top:4px;">Only your Safety Lab administrator can add or change the server\'s AI key, here on this page.</div>';
    } else {
      body = '<div style="font-size:12px; color:var(--color-warning);">' + _esc(state.msg || 'The server\'s AI key could not be checked.') + '</div>';
    }
    h.innerHTML = head + body;
  }

  function render() {
    if (!base()) { paint({}); return Promise.resolve(); }
    paint({ kind: 'loading' });
    return call('GET').then(function (r) {
      if (r.status === 200) { last = r.data; paint({ kind: 'admin', s: r.data }); }
      else if (r.status === 403) paint({ kind: 'notadmin', s: null });
      else if (r.status === 404) paint({ kind: 'error', msg: 'This server\'s AI service is older than this app, so the key can only be set on the server itself. Ask IT to install the latest Safety Lab server package.' });
      else paint({ kind: 'error', msg: (r.data && r.data.message) || ('The server answered ' + r.status + '.') });
    });
  }

  function save() {
    var el = document.getElementById('server-ai-key-input');
    var key = el ? String(el.value || '').trim() : '';
    if (el) el.value = '';                              // never leave a pasted key sitting in the page
    if (!key) { paint({ kind: 'admin', s: last, msg: '<span style="color:var(--color-danger);">Paste the key first.</span>' }); return Promise.resolve(); }
    busy = true; paint({ kind: 'admin', s: last, msg: 'Checking the key with Anthropic…' });
    return call('POST', { key: key }).then(function (r) {
      key = '';
      busy = false;
      if (r.status === 200) {
        last = r.data;
        paint({ kind: 'admin', s: r.data, msg: '<span style="color:var(--color-success); font-weight:600;">Saved.</span> Everyone on this server can use the AI now.' });
        try { if (typeof W.jrnl === 'function') W.jrnl('server-ai-key', 'Server AI key ' + (r.data.last4 ? '(ending ' + r.data.last4 + ') ' : '') + 'set from the app'); } catch (_) {}
      } else {
        paint({ kind: 'admin', s: last, msg: '<span style="color:var(--color-danger);">' + _esc((r.data && r.data.message) || ('Not saved: the server answered ' + r.status + '.')) + '</span>' });
      }
    });
  }

  function remove() {
    var go = function () {
      busy = true;
      return call('POST', { remove: true }).then(function (r) {
        busy = false;
        if (r.status === 200) { last = r.data; paint({ kind: 'admin', s: r.data, msg: 'Removed.' + (r.data.set ? ' The server now uses the key in its settings file.' : '') }); }
        else paint({ kind: 'admin', s: last, msg: '<span style="color:var(--color-danger);">' + _esc((r.data && r.data.message) || 'Not removed.') + '</span>' });
      });
    };
    if (typeof W.slConfirm === 'function') return Promise.resolve(W.slConfirm('Remove the server\'s AI key? AI stops working for everyone on this server until a key is added again.', { title: 'Remove the AI key' })).then(function (ok) { if (ok) return go(); });
    return go();
  }

  (function wrap() {
    if (typeof W.switchTab !== 'function' || W.switchTab._serverKeyWrapped) return;
    var orig = W.switchTab;
    var wrapped = function (tabId) {
      var r = orig.apply(this, arguments);
      try { if (tabId === 'ai') render(); } catch (_) {}
      return r;
    };
    Object.keys(orig).forEach(function (k) { try { wrapped[k] = orig[k]; } catch (_) {} });
    wrapped._serverKeyWrapped = true;
    W.switchTab = wrapped;
  })();

  W.SLServerAiKey = { render: render, save: save, remove: remove, _base: base };
})();
