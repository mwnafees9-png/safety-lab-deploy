// ============================================================================
// thread_client.js — v1.1 — THE GOLDEN THREAD, live across THE LABS.
//
// One protocol connects the roster — Safety Lab, Cert Lab, CAD Lab, Sim Lab.
// Each tool PUBLISHES the state changes of the artifacts it owns and
// SUBSCRIBES to the ones it stands on:
//
//   Safety Lab → 'asm-state'     an assumption's state changed (the big one:
//                                CAD release gates react LIVE)
//   CAD Lab    → 'part-release'  a part released — rev + deterministic mesh hash
//              → 'part-revise'   a released part reopened as WIP
//   Sim Lab    → 'evidence'      an evidence packet ready for an assumption
//   Cert Lab   → 'req-state'     a compliance artifact moved
//
// ENVELOPE v1 (validated, versioned):
//   { v:1, thread: <program>, tool, kind, id, state?, rev?, hash?, seq, at, payload? }
//
// TRANSPORTS — pluggable, stacked, all optional:
//   loopback   in-process (tests, demos)
//   broadcast  BroadcastChannel 'labs-thread' (same browser profile)
//   supabase   Realtime channel via injected config (window.LABS_THREAD_CONFIG
//              = { url, anonKey, channel? }) — NO credentials hard-coded here;
//              the family's Supabase project carries the channel in production.
//              Adapter activates only when config + client library are present.
//
// DISCIPLINE:
//   · outbox — publishes while offline queue and replay on reconnect; nothing
//     is silently dropped.
//   · idempotent — consumers dedupe on (tool, kind, id, seq); replays are safe.
//   · display-lane at the edges — the thread MOVES state; each tool's own
//     store decides what it means. The thread never flips anything itself.
// ============================================================================
(function () {
    'use strict';

    const PROTOCOL_V = 1;
    const KINDS = ['asm-state', 'part-release', 'part-revise', 'evidence', 'req-state'];
    const TOOLS = ['safetylab', 'certlab', 'cadlab', 'simlab'];

    function validate(env) {
        const errs = [];
        if (!env || typeof env !== 'object') return ['envelope required'];
        if (env.v !== PROTOCOL_V) errs.push('unknown protocol version');
        if (!env.thread) errs.push('thread (program) required');
        if (TOOLS.indexOf(env.tool) === -1) errs.push('unknown tool "' + env.tool + '"');
        if (KINDS.indexOf(env.kind) === -1) errs.push('unknown kind "' + env.kind + '"');
        if (!env.id) errs.push('artifact id required');
        if (typeof env.seq !== 'number') errs.push('seq required');
        return errs;
    }

    function createClient(opts) {
        opts = opts || {};
        const tool = opts.tool || 'cadlab';
        const thread = opts.thread || 'AE-001';
        let seq = 0;
        const seen = new Set();          // dedupe: tool|kind|id|seq
        const listeners = [];
        const outbox = [];
        const transports = [];
        let connected = false;

        function _key(e) { return e.tool + '|' + e.kind + '|' + e.id + '|' + e.seq; }

        function _deliver(env) {
            const k = _key(env);
            if (seen.has(k)) return;     // idempotent
            seen.add(k);
            listeners.forEach(fn => { try { fn(env); } catch (_) {} });
        }

        // ---- transports ------------------------------------------------------
        // loopback — in-process; every client in this page/process shares it.
        const LOOP = (typeof window !== 'undefined' ? (window.__labsLoop = window.__labsLoop || [])
                     : (createClient.__loop = createClient.__loop || []));
        function addLoopback() {
            const t = { name: 'loopback', send: (env) => LOOP.forEach(fn => fn(env)), up: true };
            const rx = (env) => { if (env.thread === thread) _deliver(env); };
            LOOP.push(rx);
            transports.push(t);
            connected = true;
            return t;
        }
        function addBroadcast() {
            if (typeof BroadcastChannel === 'undefined') return null;
            const ch = new BroadcastChannel('labs-thread');
            const t = { name: 'broadcast', send: (env) => { try { ch.postMessage(env); } catch (_) {} }, up: true };
            ch.onmessage = (m) => {
                const env = m && m.data;
                if (env && !validate(env).length && env.thread === thread) _deliver(env);
            };
            transports.push(t);
            connected = true;
            return t;
        }
        function addSupabase(cfg) {
            // Activates only when the host injects config AND the supabase-js
            // client is loaded. Same shape the family's other tools use.
            cfg = cfg || (typeof window !== 'undefined' && window.LABS_THREAD_CONFIG) || null;
            if (!cfg || !cfg.url || !cfg.anonKey) return null;
            if (typeof window === 'undefined' || !window.supabase || !window.supabase.createClient) return null;
            try {
                // v1.1: the bus client is auth-inert — no session persistence, no
                // token refresh. In Safety Lab the SAME page carries the real
                // auth client; a second GoTrue instance sharing its storage key
                // could clobber live sign-ins. The thread needs none of it.
                const sb = window.supabase.createClient(cfg.url, cfg.anonKey,
                    { auth: { persistSession: false, autoRefreshToken: false } });
                const chName = (cfg.channel || 'labs-thread') + ':' + thread;
                const ch = sb.channel(chName);
                const t = { name: 'supabase', up: false,
                    send: (env) => { try { ch.send({ type: 'broadcast', event: 'thread', payload: env }); } catch (_) {} } };
                ch.on('broadcast', { event: 'thread' }, (m) => {
                    const env = m && m.payload;
                    if (env && !validate(env).length && env.thread === thread) _deliver(env);
                }).subscribe((status) => {
                    t.up = status === 'SUBSCRIBED';
                    connected = transports.some(x => x.up);
                    if (t.up) flush();
                });
                transports.push(t);
                return t;
            } catch (_) { return null; }
        }

        // ---- publish / subscribe --------------------------------------------
        function publish(partial) {
            const env = Object.assign({ v: PROTOCOL_V, thread, tool, seq: ++seq, at: Date.now() }, partial);
            const errs = validate(env);
            if (errs.length) throw new Error('thread: invalid envelope — ' + errs.join('; '));
            seen.add(_key(env));                       // don't echo our own back to ourselves
            const up = transports.filter(t => t.up);
            if (!up.length) { outbox.push(env); return { queued: true, env }; }
            up.forEach(t => t.send(env));
            return { queued: false, env };
        }
        function flush() {
            const up = transports.filter(t => t.up);
            if (!up.length) return 0;
            let n = 0;
            while (outbox.length) { const env = outbox.shift(); up.forEach(t => t.send(env)); n++; }
            return n;
        }
        function onEvent(fn) { listeners.push(fn); }
        function status() {
            return { connected: transports.some(t => t.up),
                     transports: transports.map(t => t.name + (t.up ? '·up' : '·down')),
                     outbox: outbox.length, seen: seen.size };
        }

        return { tool, thread, publish, onEvent, flush, status,
                 addLoopback, addBroadcast, addSupabase,
                 _outbox: outbox };
    }

    const API = { PROTOCOL_V, KINDS, TOOLS, validate, createClient };
    if (typeof window !== 'undefined') window.THREAD = API;
    if (typeof module !== 'undefined') module.exports = API;
})();
