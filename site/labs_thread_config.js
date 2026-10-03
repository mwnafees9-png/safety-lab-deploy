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
        channel: 'labs-thread',
        // 3 Oct 2026 (security review, batch 4): the cross-machine leg is OFF. It was a PUBLIC
        // Realtime channel (labs-thread:AE-001) that every copy of the app joined, for every
        // project of every customer: anyone holding the publishable key could read each
        // assumption state change as it happened and inject "part-release" / "evidence" events
        // into every user's assumption register. It is the AE-001 family bus, not a customer
        // feature. Same-browser BroadcastChannel stays. Turning this back on needs an authorized
        // (private, workspace-scoped) channel first, like the co-editing channels; until then
        // nothing in a shipped build sets it.
        cloud: false
    };
})();
