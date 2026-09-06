// ============================================================================
// labs_thread_config.js — v1.0 — THE INJECTION POINT for the golden thread bus.
//
// Identical role to the CAD Lab copy: the ONLY file that names the Supabase
// Realtime endpoint. thread_client.js reads window.LABS_THREAD_CONFIG at
// boot; remove or empty this file and the thread degrades gracefully to
// BroadcastChannel/loopback — the tool itself is untouched.
//
// Honors the Safety Lab on-prem override pattern (same precedence as
// safety_lab.js): a desktop preload or on-prem bootstrap that sets
// window.__SLAB_SUPABASE_URL__ / __SLAB_SUPABASE_KEY__ BEFORE this file
// points the thread at the customer's own Supabase alongside auth + CRDT.
//
// The key is Supabase's PUBLISHABLE key (the same one the live tool already
// ships for auth/presence) — public by design, RLS-enforced. The
// service-role key must NEVER appear anywhere in this repo.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    window.LABS_THREAD_CONFIG = {
        url: String((window.SLConfig && window.SLConfig.supabaseUrl) ||
            window.__SLAB_SUPABASE_URL__ ||
            (window.SafetyLab && window.SafetyLab.SUPABASE_URL) ||
            'https://fhrqkhdrwbfnizkepkch.supabase.co').replace(/\/+$/, ''),
        anonKey: String((window.SLConfig && window.SLConfig.supabaseKey) ||
            window.__SLAB_SUPABASE_KEY__ ||
            (window.SafetyLab && window.SafetyLab.SUPABASE_KEY) ||
            'sb_publishable_ExwM8wVKnQ3chHQKPyRFOw_WMtLGfiQ'),
        channel: 'labs-thread'
    };
})();
