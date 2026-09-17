/**
 * Safety Lab Aero — Auth Gate (Phase 56.14j)
 * ============================================================================
 * Full-screen split-pane sign-in / sign-up gate. Blocks the app until the user
 * is authenticated with email + password (with Supabase email verification on
 * signup).
 *
 * Left pane: Safety Lab Aero branding — logo, tagline, customer references.
 * Right pane: Sign In / Create Account form with toggle. Email + password,
 * forgot-password link, terms link.
 *
 * Replaces the prior magic-link modal (Phase 55.0.8). The previous storage
 * keys are preserved so existing sessions survive the upgrade.
 *
 *   <script src="safety_lab.js?v=p56.6"></script>
 *   <script src="auth_gate.js?v=p56.6"></script>
 *
 * Comped domains/emails (electra.aero, mwnafees9@gmail.com) still get Pro+
 * automatically after sign-in.
 * ============================================================================
 */
(function () {
  'use strict';

  const GATE_ID = 'sl-auth-gate';
  const STYLE_ID = 'sl-auth-gate-styles';
  // Phase 56.14c — added 'set-new-password' state, entered when Supabase fires
  // PASSWORD_RECOVERY (user clicked the reset link). We MUST force a password
  // change before lifting the gate; otherwise the recovery flow effectively
  // becomes a passwordless sign-in via inbox access.
  let _mode = 'signin'; // 'signin' | 'signup' | 'verify-sent' | 'forgot' | 'reset-sent' | 'set-new-password'
  let _passwordRecoveryActive = false;

  // Phase 56.14f — Capture the URL at IIFE-load BEFORE Supabase strips it.
  // Two flows can land here from a password-reset email:
  //   (A) Token / implicit flow → hash contains "type=recovery&access_token=..."
  //   (B) PKCE flow             → query contains "?code=..." (no type marker)
  // safety_lab.js initializes Supabase with flowType:'pkce', so almost every
  // real reset link will be shape (B). We can't tell from the URL alone if
  // (B) is a recovery or a signup confirmation — same URL shape — so we treat
  // either signal as "potentially recovery" and wait for the PASSWORD_RECOVERY
  // event from the listener before deciding to lift the gate vs show the
  // set-new-password screen.
  const _initialUrlSnapshot = (function() {
    try {
      const href = (typeof window !== 'undefined' && window.location) ? String(window.location.href) : '';
      const hash = (typeof window !== 'undefined' && window.location) ? String(window.location.hash || '') : '';
      const search = (typeof window !== 'undefined' && window.location) ? String(window.location.search || '') : '';
      return { href, hash, search };
    } catch (_) { return { href: '', hash: '', search: '' }; }
  })();
  const _hasRecoveryHash = /[#&]type=recovery(?:[&]|$)/.test(_initialUrlSnapshot.hash);
  const _hasOurRecoveryMarker = /#sl-recovery(?:[?&]|$)/.test(_initialUrlSnapshot.hash);
  // Phase 56.14g — also check the localStorage breadcrumb set when the user
  // initiates Forgot Password through our UI. The breadcrumb is the most
  // reliable signal because we control it directly; Supabase's PASSWORD_RECOVERY
  // event is unreliable in PKCE flow across versions.
  const _hasRecoveryBreadcrumb = (function() {
    try {
      const raw = localStorage.getItem('safetyLab.auth.recoveryPending');
      const ts = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isFinite(ts)) return false;
      const ageMs = Date.now() - ts;
      // 60-minute window. Reset links are usually clicked within minutes.
      return ageMs >= 0 && ageMs < 60 * 60 * 1000;
    } catch (_) { return false; }
  })();
  const _hasPKCECode = /[?&]code=[^&]+/.test(_initialUrlSnapshot.search);
  const _isRecovery = _hasRecoveryHash || _hasOurRecoveryMarker || (_hasPKCECode && _hasRecoveryBreadcrumb);
  // _potentialRecovery is the looser check used to delay lift-gate decisions.
  const _potentialRecovery = _isRecovery || _hasPKCECode;
  try { console.log('[auth-gate] URL snapshot — hash:', _initialUrlSnapshot.hash, 'search:', _initialUrlSnapshot.search, 'recoveryBreadcrumb:', _hasRecoveryBreadcrumb, 'isRecovery:', _isRecovery, 'potentialRecovery:', _potentialRecovery); } catch (_) {}

  function getSupabase() {
    // Phase 56.14b — the actual Supabase CLIENT (with .auth.signUp etc.) lives
    // behind window.getSupabaseClient(). The bare window.supabase is just the
    // SDK namespace (with createClient) and has no .auth — calling signUp on
    // it produces "Cannot read properties of undefined (reading 'signUp')".
    // Lazy-init the client if safety_lab.js hasn't called _initSupabaseClient yet.
    try {
      if (typeof window.getSupabaseClient === 'function') {
        const c = window.getSupabaseClient();
        if (c) return c;
      }
      if (typeof window._initSupabaseClient === 'function') {
        const c = window._initSupabaseClient();
        if (c) return c;
      }
    } catch (_) {}
    return null;
  }

  function toast(msg, kind) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, kind || 'info');
    } else {
      console.log('[auth-gate: ' + (kind || 'info') + '] ' + msg);
    }
  }

  // -------------------------------------------------------------------------
  // Styles
  // -------------------------------------------------------------------------
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // Phase 56.14h — Theme-aware styling. The gate now picks up safety_lab.css
    // CSS variables and the user's saved theme preference (light/dark from
    // localStorage 'safetyLab.theme'). Hardcoded fallbacks remain for the
    // case where safety_lab.css hasn't loaded yet, but on a normal page load
    // the gate matches the app's exact palette.
    style.textContent = [
      // The gate itself uses surface-1 (white in light, near-black in dark).
      '#' + GATE_ID + ' { position: fixed; inset: 0; z-index: 2147483600; background: var(--color-surface-1, #ffffff); display: flex; font: 14px var(--font-system, "IBM Plex Sans", -apple-system, "Segoe UI", Arial, sans-serif); color: var(--color-text-primary, #000000); }',

      // Brand pane (left) — gradient stays for the marketing-side feel; theme adjusts the
      // overlay strength so the contrast holds in both modes.
      '#' + GATE_ID + ' .sl-brand-pane { flex: 0 0 44%; background: linear-gradient(165deg, #0a0c14 0%, #0a0a0d 52%, #110b16 100%); color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.30); padding: 56px 56px 40px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; }',
      '#' + GATE_ID + ' .sl-brand-pane::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12), transparent 60%); pointer-events: none; }',

      // Brand mark — matches safety_lab.css .brand-mark (gradient square with white triangle).
      '#' + GATE_ID + ' .sl-brand-logo { display: flex; align-items: center; gap: 14px; position: relative; z-index: 1; }',
      '#' + GATE_ID + ' .sl-brand-mark { width: 44px; height: 44px; border-radius: 11px; background: linear-gradient(135deg, #007aff 0%, #af52de 100%); position: relative; box-shadow: 0 6px 18px rgba(0,0,0,0.25); flex-shrink: 0; }',
      '#' + GATE_ID + ' .sl-brand-mark::before { content: ""; position: absolute; inset: 11px; background: rgba(255,255,255,0.97); clip-path: polygon(50% 0, 100% 100%, 0 100%); }',
      '#' + GATE_ID + ' .sl-brand-logo .sl-brand-text { display: flex; flex-direction: column; gap: 2px; }',
      '#' + GATE_ID + ' .sl-brand-logo .name { font-size: 22px; font-weight: 600; letter-spacing: -0.3px; line-height: 1.1; }',
      '#' + GATE_ID + ' .sl-brand-logo .tagline { font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.78); letter-spacing: 0.1px; line-height: 1.2; }',
      '#' + GATE_ID + ' .sl-brand-hero { position: relative; z-index: 1; margin-top: -40px; }',
      '#' + GATE_ID + ' .sl-brand-hero h2 { font-size: 32px; font-weight: 600; line-height: 1.2; margin: 0 0 16px; max-width: 440px; }',
      '#' + GATE_ID + ' .sl-brand-hero p { font-size: 15px; line-height: 1.55; opacity: 0.85; margin: 0; max-width: 420px; }',
      '#' + GATE_ID + ' .sl-brand-logos { position: relative; z-index: 1; }',
      '#' + GATE_ID + ' .sl-brand-logos-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.6; margin-bottom: 14px; }',
      '#' + GATE_ID + ' .sl-brand-logos-row { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }',
      '#' + GATE_ID + ' .sl-brand-logo-pill { padding: 7px 14px; border-radius: 999px; background: rgba(0,0,0,0.22); border: 1px solid rgba(0,0,0,0.60); font-size: 13px; font-weight: 500; letter-spacing: 0.2px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }',
      '#' + GATE_ID + ' .sl-brand-logo-pill.placeholder { opacity: 0.55; font-style: italic; }',

      // Form pane (right) — uses theme-aware tokens
      '#' + GATE_ID + ' .sl-form-pane { flex: 1; padding: 56px 56px 40px; display: flex; flex-direction: column; overflow-y: auto; background: var(--color-surface-1, #ffffff); color: var(--color-text-primary, #000000); }',
      '#' + GATE_ID + ' .sl-form-pane-inner { max-width: 420px; width: 100%; margin: auto 0; }',
      '#' + GATE_ID + ' .sl-form-tabs { display: flex; gap: 4px; padding: 4px; background: var(--color-surface-3, rgba(127,127,127,0.10)); border-radius: 10px; margin-bottom: 28px; }',
      '#' + GATE_ID + ' .sl-form-tab { flex: 1; padding: 9px 12px; border: none; background: transparent; color: var(--color-text-secondary, inherit); font: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; border-radius: 7px; transition: background 0.15s; }',
      '#' + GATE_ID + ' .sl-form-tab.active { background: var(--color-surface-1, #ffffff); color: var(--color-text-primary, #1F3A5F); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }',
      '#' + GATE_ID + ' h1.sl-form-title { font-size: 26px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.3px; color: var(--color-text-primary, #000); }',
      '#' + GATE_ID + ' p.sl-form-sub { margin: 0 0 24px; color: var(--color-text-secondary, rgba(0,0,0,0.7)); font-size: 14px; line-height: 1.5; }',
      '#' + GATE_ID + ' .sl-field { margin-bottom: 14px; }',
      '#' + GATE_ID + ' .sl-field label { display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: var(--color-text-secondary, rgba(0,0,0,0.85)); text-transform: uppercase; letter-spacing: 0.5px; }',
      '#' + GATE_ID + ' .sl-field input { width: 100%; box-sizing: border-box; padding: 11px 13px; border-radius: 9px; border: 1px solid var(--color-border-hair, rgba(127,127,127,0.35)); background: var(--color-surface-2, #ffffff); color: var(--color-text-primary, inherit); font: inherit; font-size: 14px; transition: border-color 0.12s, box-shadow 0.12s; }',
      '#' + GATE_ID + ' .sl-field input:focus { outline: none; border-color: var(--color-accent, #007aff); box-shadow: 0 0 0 3px var(--color-accent-soft, rgba(0,122,255,0.18)); }',
      '#' + GATE_ID + ' .sl-row-between { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; margin-bottom: 18px; }',
      '#' + GATE_ID + ' .sl-link { color: var(--color-accent, #007aff); text-decoration: none; cursor: pointer; background: none; border: none; padding: 0; font: inherit; font-size: 12.5px; }',
      '#' + GATE_ID + ' .sl-link:hover { text-decoration: underline; }',
      '#' + GATE_ID + ' button.sl-primary { width: 100%; padding: 12px 16px; border-radius: 9px; border: none; background: var(--color-accent, #007aff); color: #fff; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.12s, filter 0.12s; }',
      '#' + GATE_ID + ' button.sl-primary:hover:not(:disabled) { filter: brightness(1.08); }',
      '#' + GATE_ID + ' button.sl-primary:disabled { opacity: 0.55; cursor: not-allowed; }',
      '#' + GATE_ID + ' .sl-msg { margin-top: 16px; padding: 11px 13px; border-radius: 9px; font-size: 13px; line-height: 1.45; display: none; }',
      '#' + GATE_ID + ' .sl-msg.show { display: block; }',
      '#' + GATE_ID + ' .sl-msg.success { background: rgba(16,185,129,0.10); border: 1px solid rgba(16,185,129,0.30); color: var(--color-success, #047857); }',
      '#' + GATE_ID + ' .sl-msg.error { background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.30); color: var(--color-danger, #b91c1c); }',
      'body.theme-dark #' + GATE_ID + ' .sl-msg.success { color: #6ee7b7; }',
      'body.theme-dark #' + GATE_ID + ' .sl-msg.error { color: #fca5a5; }',
      '#' + GATE_ID + ' .sl-foot { margin-top: 32px; font-size: 11.5px; color: var(--color-text-tertiary, rgba(0,0,0,0.55)); line-height: 1.55; }',
      '#' + GATE_ID + ' .sl-foot a { color: inherit; text-decoration: underline; }',

      // Responsive — stack on mobile
      '@media (max-width: 880px) { #' + GATE_ID + ' { flex-direction: column; } #' + GATE_ID + ' .sl-brand-pane { flex: 0 0 auto; padding: 28px 28px 20px; } #' + GATE_ID + ' .sl-brand-hero { margin-top: 16px; } #' + GATE_ID + ' .sl-brand-hero h2 { font-size: 22px; } #' + GATE_ID + ' .sl-brand-hero p { font-size: 13.5px; } #' + GATE_ID + ' .sl-brand-logos { margin-top: 18px; } #' + GATE_ID + ' .sl-form-pane { padding: 28px 24px 32px; } }',

      // Block any interaction with the page behind the gate
      'html.sl-auth-gate-blocked, html.sl-auth-gate-blocked body { overflow: hidden !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // Phase 56.14h — Apply the user's saved theme preference to <body> so the
  // CSS variables resolve to the right palette. safety_lab.js does this on
  // its own DOMContentLoaded, but the auth gate may render BEFORE that runs,
  // so we mirror the logic here to avoid a flash of un-themed content.
  function applyThemePreference() {
    try {
      const pref = localStorage.getItem('safetyLab.theme') ||
                   (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const body = document.body;
      if (!body) return;
      body.classList.toggle('theme-dark', pref === 'dark');
      body.classList.toggle('theme-light', pref !== 'dark');
    } catch (_) {}
  }

  // -------------------------------------------------------------------------
  // Brand pane HTML — static; logo + tagline + customer logos
  // -------------------------------------------------------------------------
  function brandPaneHTML() {
    // Phase 56.14h — Brand mark replaces the "SL" placeholder dot; matches the
    // gradient-square + white-triangle styling of safety_lab.css .brand-mark.
    // Marketing copy block removed (user request); brand pane is now logo on
    // top and "Built for" regulatory badges at bottom, with the gradient
    // background providing the visual interest.
    return [
      '<div class="sl-brand-pane">',
      '  <div class="sl-brand-logo">',
      '    <div class="sl-brand-mark" aria-hidden="true"></div>',
      '    <div class="sl-brand-text">',
      '      <div class="name">Safety Lab Aero</div>',
      '      <div class="tagline">Aerospace safety analysis, integrated</div>',
      '    </div>',
      '  </div>',
      '  <div class="sl-brand-logos">',
      '    <div class="sl-brand-logos-label">Built for</div>',
      '    <div class="sl-brand-logos-row">',
      '      <div class="sl-brand-logo-pill">FAA Part 25</div>',
      '      <div class="sl-brand-logo-pill">Part 23</div>',
      '      <div class="sl-brand-logo-pill">Part 27 / 29</div>',
      '      <div class="sl-brand-logo-pill">SC-VTOL</div>',
      '      <div class="sl-brand-logo-pill">ARP 4761A</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Microsoft SSO block — a "Sign in with Microsoft" button + an "or use email"
  // divider, shown above the email form on the signin/signup screens. The button
  // drives Supabase's Azure OAuth provider via window.signInWithMicrosoft
  // (ms_sso.js). Tenant access is enforced server-side (approved_tenants hook).
  // Set window.SL_MS_SSO_ENABLED = false to hide it (e.g. before the Azure
  // provider is configured); it defaults to HIDDEN — see the flag below.
  // -------------------------------------------------------------------------
  function ssoBlockHTML() {
    // OPT-IN, 13 Aug 2026. The Azure provider is not enabled on the project, so
    // this button 400s for every visitor. It stays hidden until someone sets
    // window.SL_MS_SSO_ENABLED = true — the same flag ms_sso.js reads, so the
    // gate button and the signup-modal button can never disagree again.
    try { if (window.SL_MS_SSO_ENABLED !== true) return ''; } catch (_) { return ''; }
    var MS_LOGO = '<svg width="17" height="17" viewBox="0 0 21 21" aria-hidden="true" style="flex:0 0 auto;">' +
      '<rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/>' +
      '<rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>';
    return [
      '  <button type="button" id="sl-ms-sso" onclick="try{window.signInWithMicrosoft&&window.signInWithMicrosoft()}catch(e){}"',
      '    style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:11px 14px;',
      '    border:1px solid var(--color-border-hair,rgba(127,127,127,0.35));border-radius:9px;',
      '    background:var(--color-surface-2,#fff);color:var(--color-text-primary,inherit);font:inherit;font-size:14px;font-weight:600;cursor:pointer;">',
      '    ' + MS_LOGO + '<span>Sign in with Microsoft</span></button>',
      '  <div style="display:flex;align-items:center;gap:10px;margin:16px 0 4px;color:var(--color-text-tertiary,rgba(127,127,127,0.8));font-size:12px;">',
      '    <span style="flex:1;height:1px;background:var(--color-border-hair,rgba(127,127,127,0.25));"></span>or use email',
      '    <span style="flex:1;height:1px;background:var(--color-border-hair,rgba(127,127,127,0.25));"></span></div>',
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Form pane HTML — content varies by mode
  // -------------------------------------------------------------------------
  function formPaneHTML() {
    if (_mode === 'verify-sent') {
      return [
        '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
        '  <h1 class="sl-form-title">Check your email</h1>',
        '  <p class="sl-form-sub">We sent a verification link to <strong id="sl-verify-email-display">your inbox</strong>. Click it to activate your account and start your 10-day trial.</p>',
        '  <button class="sl-primary" type="button" onclick="window.SafetyLab._authBackToSignIn()">Back to sign in</button>',
        '  <div class="sl-msg" id="sl-msg"></div>',
        // If the link is reported invalid or expired, the usual cause on a corporate
        // mailbox is Microsoft 365 Defender Safe Links opening it in transit — the
        // link is single use, so the scan spends it. Proven in the auth log 13 Aug
        // 2026 (electra.aero, twice). Policy is to have the customer\'s IT allow
        // safetylabaero.com during setup; this copy is the fallback for everyone
        // who hits it before that conversation happens. Never a dead end: resend.
        '  <div class="sl-foot">Didn\'t receive it, or told the link is invalid? <button class="sl-link" onclick="window.SafetyLab._authResendVerification()">Send a new link</button>. Some corporate mail filters open links automatically, which can use one up — a fresh link normally works.</div>',
        '</div></div>',
      ].join('');
    }
    if (_mode === 'forgot') {
      return [
        '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
        '  <h1 class="sl-form-title">Reset your password</h1>',
        '  <p class="sl-form-sub">Enter your account email and we\'ll send a reset link.</p>',
        '  <form id="sl-auth-form" autocomplete="on" novalidate>',
        '    <div class="sl-field"><label for="sl-email">Email</label><input id="sl-email" type="email" required spellcheck="false" autocomplete="email" autocapitalize="off" autofocus></div>',
        '    <button class="sl-primary" type="submit" id="sl-submit">Send reset link</button>',
        '  </form>',
        '  <div class="sl-msg" id="sl-msg"></div>',
        '  <div class="sl-foot"><button class="sl-link" onclick="window.SafetyLab._authBackToSignIn()">← Back to sign in</button></div>',
        '</div></div>',
      ].join('');
    }
    if (_mode === 'reset-sent') {
      return [
        '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
        '  <h1 class="sl-form-title">Check your email</h1>',
        '  <p class="sl-form-sub">A password reset link has been sent to <strong id="sl-verify-email-display">your inbox</strong>. Click it to set a new password.</p>',
        '  <button class="sl-primary" type="button" onclick="window.SafetyLab._authBackToSignIn()">Back to sign in</button>',
        '</div></div>',
      ].join('');
    }
    if (_mode === 'set-new-password') {
      // Phase 56.14c — entered after Supabase fires PASSWORD_RECOVERY (recovery
      // link clicked). The user MUST set a new password before the gate lifts.
      // We do NOT show the sign-in/sign-up toggle here so they can\'t bypass.
      return [
        '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
        '  <h1 class="sl-form-title">Set a new password</h1>',
        '  <p class="sl-form-sub">You\'re finishing a password reset. Enter your new password below — once saved, you\'ll be signed in automatically.</p>',
        '  <form id="sl-auth-form" autocomplete="on" novalidate>',
        '    <div class="sl-field"><label for="sl-password">New password</label><input id="sl-password" type="password" required autocomplete="new-password" minlength="8" placeholder="At least 8 characters" autofocus></div>',
        '    <div class="sl-field"><label for="sl-password-confirm">Confirm new password</label><input id="sl-password-confirm" type="password" required autocomplete="new-password" minlength="8" placeholder="Re-enter to confirm"></div>',
        '    <button class="sl-primary" type="submit" id="sl-submit">Save new password</button>',
        '  </form>',
        '  <div class="sl-msg" id="sl-msg"></div>',
        '  <div class="sl-foot">For your security, the previous password is no longer valid. You\'ll need this new one for future sign-ins.</div>',
        '</div></div>',
      ].join('');
    }
    // signin | signup share the structure
    const isSignup = _mode === 'signup';
    return [
      '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
      '  <div class="sl-form-tabs" role="tablist">',
      '    <button class="sl-form-tab ' + (isSignup ? '' : 'active') + '" type="button" onclick="window.SafetyLab._authSetMode(\'signin\')">Sign in</button>',
      '    <button class="sl-form-tab ' + (isSignup ? 'active' : '') + '" type="button" onclick="window.SafetyLab._authSetMode(\'signup\')">Create account</button>',
      '  </div>',
      '  <h1 class="sl-form-title">' + (isSignup ? 'Create your account' : 'Welcome back') + '</h1>',
      '  <p class="sl-form-sub">' + (isSignup
              ? 'Start a 10-day trial. No credit card required. Email verification is required to activate the trial.'
              : 'Sign in to continue with Safety Lab Aero.') + '</p>',
      ssoBlockHTML(),
      '  <form id="sl-auth-form" autocomplete="on" novalidate>',
      (isSignup ? '    <div class="sl-field"><label for="sl-name">Full name</label><input id="sl-name" type="text" required autocomplete="name" autofocus placeholder="Jane Doe"></div>' : ''),
      '    <div class="sl-field"><label for="sl-email">Email</label><input id="sl-email" type="email" required spellcheck="false" autocomplete="email" autocapitalize="off"' + (isSignup ? '' : ' autofocus') + ' placeholder="you@example.com"></div>',
      (isSignup ? '    <div class="sl-field"><label for="sl-org">Organization</label><input id="sl-org" type="text" required autocomplete="organization" placeholder="Company or institution"></div>' : ''),
      '    <div class="sl-field"><label for="sl-password">Password</label><input id="sl-password" type="password" required autocomplete="' + (isSignup ? 'new-password' : 'current-password') + '" minlength="8" placeholder="' + (isSignup ? '8+ chars, with a capital and a number' : '') + '"></div>',
      (isSignup ? '    <div class="sl-field"><label for="sl-password-confirm">Confirm password</label><input id="sl-password-confirm" type="password" required autocomplete="new-password" minlength="8" placeholder="Re-enter password"></div>' : ''),
      (isSignup ? '' : '<div class="sl-row-between"><span></span><button type="button" class="sl-link" onclick="window.SafetyLab._authSetMode(\'forgot\')">Forgot password?</button></div>'),
      '    <button class="sl-primary" type="submit" id="sl-submit">' + (isSignup ? 'Create account' : 'Sign in') + '</button>',
      '  </form>',
      '  <div class="sl-msg" id="sl-msg"></div>',
      '  <div class="sl-foot">By continuing, you agree to the Safety Lab Aero End User License Agreement. Email is required for account verification and password recovery.</div>',
      '</div></div>',
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Inactivity timeout — after IDLE_MS of no interaction, sign the user out and
  // re-show the gate so they must sign in again. Applies to EVERY signed-in
  // session with NO exemption (including ones open since first sign-in): the
  // idle clock starts at sign-in (liftGate) and ANY interaction resets it.
  // Web (Supabase) sessions only — the desktop build has its own lock.
  // -------------------------------------------------------------------------
  const IDLE_MS = 20 * 60 * 1000;         // 20 minutes of inactivity
  const IDLE_WARN_MS = 2 * 60 * 1000;     // show a "stay signed in?" warning this long before the cutoff (≈18-min mark)
  const IDLE_TICK_MS = 10 * 1000;         // how often we check the idle clock
  const BUSY_MAX_MS = 15 * 60 * 1000;     // safety cap: a long op marked 'busy' longer than this is treated as leaked/hung and ignored
  const IDLE_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'scroll', 'touchstart', 'click'];
  const WARN_ID = 'sl-idle-warning', WARN_STYLE_ID = 'sl-idle-warning-style', WARN_COUNT_ID = 'sl-idle-warning-count', WARN_BTN_ID = 'sl-idle-warning-btn';
  // Phase 66.12 — THE IDLE CLOCK IS SHARED ACROSS TABS.
  // It used to be a per-tab variable while sign-out was global, so a SECOND tab
  // left open reached 20 minutes on its own clock and signed out the tab the user
  // was actually working in — with the warning banner rendering in the idle tab
  // where nobody saw it. Waqas, 18 Aug: "if someone is actively using the app they
  // should never be timed out." Activity in ANY tab now resets the clock for ALL of
  // them: every bump writes the timestamp to localStorage (throttled), every check
  // reads the newest of (this tab, storage), and a storage event bumps us live.
  const IDLE_LS_KEY = 'safetyLab.idle.lastActivity';
  const IDLE_LS_THROTTLE_MS = 4000;
  let _idleLast = 0, _idleInterval = null, _idleArmed = false, _idleLockMessage = '';
  let _idleLastWrite = 0;
  function _idleReadShared() {
    try { const v = parseInt(localStorage.getItem(IDLE_LS_KEY) || '0', 10); return isFinite(v) ? v : 0; } catch (_) { return 0; }
  }
  function _idleWriteShared(now) {
    if ((now - _idleLastWrite) < IDLE_LS_THROTTLE_MS) return;
    _idleLastWrite = now;
    try { localStorage.setItem(IDLE_LS_KEY, String(now)); } catch (_) {}
  }
  function _idleNewest() { const shared = _idleReadShared(); return shared > _idleLast ? shared : _idleLast; }

  // 6 Sep 2026 — WAS THE PREVIOUS SESSION ABANDONED, NOT ENDED?
  //
  // Waqas: "I signed in 7 hours later and it didn't ask me for my user name and
  // password." He was right to expect it to. The idle clock only runs while a
  // tab is OPEN: close the laptop before the 20 minutes elapse and the timer
  // simply stops, while the stored login (persistSession + autoRefresh) stays
  // valid indefinitely. On the next open, getSession() hands back that login,
  // the gate lifts, armIdleTimeout() runs — and the FIRST thing it did was
  // _idleBump(), overwriting the seven-hour-old timestamp with "now". The one
  // piece of evidence that the user had been away was destroyed before anyone
  // read it. So the "20-minute timeout" was a walked-away-from-an-open-tab
  // rule, never a you-must-sign-in-again rule.
  //
  // This reads that evidence BEFORE the arm overwrites it. It is consulted on
  // the RESTORED-login path only (the getSession() branch in init): a SIGNED_IN
  // event means the user just typed a password, and a fresh credential is the
  // very thing that legitimately resets the clock.
  //
  // WHY 0 MEANS "ALLOW", NOT "BOUNCE". A missing timestamp is a browser that
  // has never recorded activity — a first sign-in, or localStorage that was
  // cleared or is disabled. _idleWriteShared fails silently when storage is
  // unavailable, so if 0 bounced, such a browser could NEVER stay signed in:
  // every open would be a bounce, every bounce a re-sign-in, forever. Fail
  // closed is right for a data fence; for a sign-in gate a loop is a lockout.
  // Only a timestamp that EXISTS and is STALE is treated as an abandoned session.
  function _idleAbandonedSince() {
    try {
      if (typeof window !== 'undefined' && window.__SLAB_DESKTOP__) return 0;   // desktop stays signed in (Waqas 6 Sep: works like Office; optional local passcode lock)
      const last = _idleReadShared();
      if (!last) return 0;
      const away = Date.now() - last;
      return away >= IDLE_MS ? away : 0;
    } catch (_) { return 0; }
  }
  function _idleStorageEvent(e) {
    if (!e || e.key !== IDLE_LS_KEY) return;
    const v = parseInt(e.newValue || '0', 10);
    if (isFinite(v) && v > _idleLast) { _idleLast = v; if (_idleWarnShown) hideIdleWarning(); }
  }
  let _idleWarnShown = false, _idleCountdownTimer = null;       // option 2 — pre-logout warning toast
  let _busyCount = 0, _busySince = 0;                           // option 3 — long-running ops (AI/compute/export) hold the idle clock
  function _busyActive() {                                      // is a user-initiated long op currently holding the session open?
    if (_busyCount <= 0) return false;
    if ((Date.now() - _busySince) >= BUSY_MAX_MS) { _busyCount = 0; return false; }   // stale/leaked → self-heal so logout still works
    return true;
  }
  function _idleBump() {
    const now = Date.now();
    _idleLast = now;
    _idleWriteShared(now);
    if (_idleWarnShown) hideIdleWarning();
  }
  function _idleCheck() {
    if (!_idleArmed) return;
    if (_busyActive()) { _idleBump(); return; }                 // a long op the user kicked off is running → treat as active
    const idleFor = Date.now() - _idleNewest();   // newest activity across every open tab
    if (idleFor >= IDLE_MS) { onIdleTimeout(); return; }
    // Warn only where somebody can actually read it. A banner rendered in a hidden
    // tab is the reason these sign-outs arrived with no warning at all.
    if (idleFor >= (IDLE_MS - IDLE_WARN_MS) && document.visibilityState === 'visible') showIdleWarning();
  }
  function _idleVis() { if (document.visibilityState === 'visible') _idleCheck(); }
  function armIdleTimeout() {
    try { if (typeof window !== 'undefined' && window.__SLAB_DESKTOP__) return; } catch (_) {}   // desktop stays signed in (6 Sep ruling) — no idle sign-out
    if (_idleArmed) { _idleBump(); return; }
    _idleArmed = true; _idleBump();
    IDLE_EVENTS.forEach(function (ev) { try { document.addEventListener(ev, _idleBump, { passive: true, capture: true }); } catch (_) { try { document.addEventListener(ev, _idleBump, true); } catch (_) {} } });
    try { document.addEventListener('visibilitychange', _idleVis, true); } catch (_) {}
    try { window.addEventListener('storage', _idleStorageEvent); } catch (_) {}
    if (_idleInterval) { try { clearInterval(_idleInterval); } catch (_) {} }
    _idleInterval = setInterval(_idleCheck, IDLE_TICK_MS);
  }
  function disarmIdleTimeout() {
    _idleArmed = false;
    IDLE_EVENTS.forEach(function (ev) { try { document.removeEventListener(ev, _idleBump, true); } catch (_) {} });
    try { document.removeEventListener('visibilitychange', _idleVis, true); } catch (_) {}
    try { window.removeEventListener('storage', _idleStorageEvent); } catch (_) {}
    if (_idleInterval) { try { clearInterval(_idleInterval); } catch (_) {} _idleInterval = null; }
    try { hideIdleWarning(); } catch (_) {}                     // gate going up / signed out → drop any pending warning
  }
  function onIdleTimeout() {
    disarmIdleTimeout();
    _idleLockMessage = 'Signed out after 20 minutes of inactivity. Please sign in again.';
    try { renderGate(); } catch (_) {}                                                          // lock immediately, don't wait on the network
    // Phase 66.12 — LOCAL scope. supabase-js v2 defaults signOut() to 'global',
    // which revokes the refresh token server-side for every session of this user —
    // so an idle tab on the laptop was also signing the user out on their phone and
    // any other machine. An inactivity lock is about THIS browser.
    try {
      const sb = getSupabase();
      if (sb && sb.auth && typeof sb.auth.signOut === 'function') {
        try { sb.auth.signOut({ scope: 'local' }); } catch (_) { sb.auth.signOut(); }
      }
    } catch (_) {}
  }

  // -------------------------------------------------------------------------
  // Option 2 — pre-logout warning. Rather than silently signing the user out at
  // 20 min, surface a non-blocking banner at ~18 min with a live countdown and a
  // "Stay signed in" button. Any real interaction (or the button) resets the
  // clock and dismisses it; if ignored, onIdleTimeout still fires at 20 min.
  // -------------------------------------------------------------------------
  function ensureWarnStyles() {
    if (document.getElementById(WARN_STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = WARN_STYLE_ID;
    st.textContent = [
      '#' + WARN_ID + ' { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%) translateY(8px); z-index: 2147483550; display: flex; align-items: center; gap: 12px; max-width: calc(100vw - 32px); padding: 12px 14px 12px 16px; border-radius: 12px; background: var(--color-surface-1, #ffffff); color: var(--color-text-primary, #111111); border: 1px solid var(--color-border-hair, rgba(127,127,127,0.35)); box-shadow: 0 12px 34px rgba(0,0,0,0.20); font: 14px var(--font-system, "IBM Plex Sans", -apple-system, "Segoe UI", Arial, sans-serif); opacity: 0; pointer-events: none; transition: opacity .18s ease, transform .18s ease; }',
      '#' + WARN_ID + '.show { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }',
      '#' + WARN_ID + ' .sl-idle-warn-ico { font-size: 18px; line-height: 1; }',
      '#' + WARN_ID + ' .sl-idle-warn-txt { font-size: 13.5px; line-height: 1.35; }',
      '#' + WARN_ID + ' .sl-idle-warn-txt strong { font-variant-numeric: tabular-nums; }',
      '#' + WARN_ID + ' .sl-idle-warn-btn { flex: 0 0 auto; padding: 8px 14px; border-radius: 8px; border: none; background: var(--color-accent, #007aff); color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }',
      '#' + WARN_ID + ' .sl-idle-warn-btn:hover { filter: brightness(1.08); }',
      '@media (prefers-reduced-motion: reduce) { #' + WARN_ID + ' { transition: none; } }',
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }
  function updateIdleCountdown() {
    const remain = Math.max(0, IDLE_MS - (Date.now() - _idleLast));
    const el = document.getElementById(WARN_COUNT_ID);
    if (el) {
      const s = Math.ceil(remain / 1000), mm = Math.floor(s / 60), ss = s % 60;
      el.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
    if (remain <= 0) onIdleTimeout();   // hit zero between 10-s checks → sign out promptly at 0:00
  }
  function showIdleWarning() {
    if (_idleWarnShown) { updateIdleCountdown(); return; }
    _idleWarnShown = true;
    ensureWarnStyles();
    let el = document.getElementById(WARN_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = WARN_ID;
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-live', 'assertive');
      el.innerHTML =
        '<span class="sl-idle-warn-ico" aria-hidden="true">⏳</span>' +
        '<span class="sl-idle-warn-txt">You’ll be signed out in <strong id="' + WARN_COUNT_ID + '">2:00</strong> due to inactivity.</span>' +
        '<button type="button" class="sl-idle-warn-btn" id="' + WARN_BTN_ID + '">Stay signed in</button>';
      document.body.appendChild(el);
      const btn = document.getElementById(WARN_BTN_ID);
      if (btn) btn.addEventListener('click', function (e) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        _idleBump();          // reset the idle clock (extend the session)
        hideIdleWarning();    // force-dismiss directly — never rely only on state flags
      });
    }
    requestAnimationFrame(function () { try { el.classList.add('show'); } catch (_) {} });
    updateIdleCountdown();
    if (_idleCountdownTimer) { try { clearInterval(_idleCountdownTimer); } catch (_) {} }
    _idleCountdownTimer = setInterval(updateIdleCountdown, 1000);   // smooth 1-s countdown while the warning is up
  }
  function hideIdleWarning() {
    _idleWarnShown = false;
    if (_idleCountdownTimer) { try { clearInterval(_idleCountdownTimer); } catch (_) {} _idleCountdownTimer = null; }
    const el = document.getElementById(WARN_ID);
    // Remove the element outright (not just the .show class) so it can never linger
    // visible due to a transition, stacking-context, or re-show race. showIdleWarning
    // recreates it (with a fresh button handler) the next time a warning is needed.
    if (el) { el.classList.remove('show'); try { el.remove(); } catch (_) { if (el.parentNode) el.parentNode.removeChild(el); } }
  }

  // -------------------------------------------------------------------------
  // Option 3 — long-running, user-initiated work counts as activity so the idle
  // clock doesn't sign the user out mid-job. Two ways in:
  //   • window.SafetyLabActivity.begin()/end()/ping() — explicit, for any caller
  //     (wrap an export or compute in begin()/end() to cover it too).
  //   • a fetch hook scoped to AI endpoints — covers the common "I clicked
  //     Generate and I'm reading/waiting" case with no edits to the AI code.
  // BUSY_MAX_MS caps a leaked begin()/hung request so logout can't be disabled
  // forever, and only signed-in (armed) web sessions are ever affected.
  // -------------------------------------------------------------------------
  function _activityBegin() { if (_busyCount === 0) _busySince = Date.now(); _busyCount++; _idleBump(); return true; }
  function _activityEnd() { if (_busyCount > 0) _busyCount--; if (_busyCount === 0) _idleBump(); }   // restart the full idle window after the op
  try {
    window.SafetyLabActivity = {
      begin:  function () { try { return _activityBegin(); } catch (_) { return false; } },
      end:    function () { try { _activityEnd(); } catch (_) {} },
      ping:   function () { try { _idleBump(); } catch (_) {} },
      isBusy: function () { try { return _busyActive(); } catch (_) { return false; } }
    };
  } catch (_) {}
  // Phase 66.12 — LONG LOCAL COMPUTE HOLDS THE SESSION OPEN.
  // The fetch hook below only ever counted AI endpoints, and nothing else in the
  // codebase called SafetyLabActivity.begin(). So a user could click Run Uncertainty
  // Analysis, watch a Monte-Carlo run for twenty minutes without touching the mouse,
  // and be signed out for inactivity BY THE TOOL THEY WERE WATCHING WORK. These are
  // all user-clicked, genuinely long operations; each one now holds the idle clock
  // for its duration (BUSY_MAX_MS still caps a hung op so the lock can't be disabled
  // forever). Wrapped by NAME at load so the compute modules stay untouched.
  const HEAVY_OPS = [
    'runUncertaintyDisplay',      // Monte Carlo over lognormal basic-event lambdas
    'runDFTMonteCarlo',           // dynamic fault tree simulation
    'generateCutsetReport',       // minimal cut set enumeration
    'exportProjectAsPDF',         // whole-project PDF build
    'exportTabAsPDF',             // per-tab PDF build
    'calculateAllProbabilities'   // full re-allocation across every page
  ];
  function _wrapHeavyOps() {
    HEAVY_OPS.forEach(function (name) {
      try {
        const fn = window[name];
        if (typeof fn !== 'function' || fn.__slIdleWrapped) return;
        const wrapped = function () {
          _activityBegin();
          let out;
          try { out = fn.apply(this, arguments); }
          catch (e) { _activityEnd(); throw e; }
          if (out && typeof out.then === 'function') {
            try { out.then(function () { _activityEnd(); }, function () { _activityEnd(); }); }
            catch (_) { _activityEnd(); }
          } else {
            _activityEnd();
          }
          return out;
        };
        wrapped.__slIdleWrapped = true;
        // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
        // 21 Aug 2026 — this line said preserve(orig, wrapped); `orig` does not exist in
        // this scope (the local is `fn`), so the ReferenceError was silently swallowed
        // and prior wrappers' markers were never preserved here.
        try { if (window.SLWrap) SLWrap.preserve(fn, wrapped); } catch (_) {}
        window[name] = wrapped;
      } catch (_) {}
    });
  }
  try {
    if (document.readyState === 'complete') setTimeout(_wrapHeavyOps, 0);
    else window.addEventListener('load', function () { setTimeout(_wrapHeavyOps, 0); });
  } catch (_) {}

  try {
    if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !window.__slIdleFetchHook) {
      window.__slIdleFetchHook = true;
      const _origFetch = window.fetch.bind(window);
      const _isAiUrl = function (u) {
        const s = String(u || '');
        return s.indexOf('/v1/ai') !== -1 || s.indexOf('/v1/chat/completions') !== -1 || s.indexOf('/v1/embeddings') !== -1 ||
               s.indexOf('/v1/messages') !== -1 || s.indexOf('api.safetylabaero.com') !== -1 || s.indexOf('api.anthropic.com') !== -1;
      };
      window.fetch = function (input, init) {
        let counted = false;
        try {
          const url = (input && typeof input === 'object' && 'url' in input) ? input.url : input;
          if (_idleArmed && _isAiUrl(url)) { _activityBegin(); counted = true; }
        } catch (_) {}
        let p;
        try { p = _origFetch(input, init); }
        catch (e) { if (counted) { try { _activityEnd(); } catch (_) {} } throw e; }
        if (counted && p && typeof p.then === 'function') {
          const done = function () { try { _activityEnd(); } catch (_) {} };
          p.then(done, done);   // settle (response headers or network error) → release the hold
        } else if (counted) { try { _activityEnd(); } catch (_) {} }
        return p;
      };
    }
  } catch (_) {}

  function renderGate() {
    ensureStyles();
    applyThemePreference();
    document.documentElement.classList.add('sl-auth-gate-blocked');
    try { disarmIdleTimeout(); } catch (_) {}                 // gate is up = locked; stop the idle clock until next sign-in
    let gate = document.getElementById(GATE_ID);
    if (!gate) {
      gate = document.createElement('div');
      gate.id = GATE_ID;
      gate.setAttribute('role', 'dialog');
      gate.setAttribute('aria-modal', 'true');
      gate.setAttribute('aria-label', 'Sign in to Safety Lab Aero');
      document.body.appendChild(gate);
    }
    gate.innerHTML = brandPaneHTML() + formPaneHTML();
    // Wire submit
    const form = gate.querySelector('#sl-auth-form');
    if (form) form.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', escGuard, true);
    // Restore the pending email into the "check your email" screen.
    try {
      const pending = sessionStorage.getItem('sl-auth-pending-email');
      if (pending) {
        const el = gate.querySelector('#sl-verify-email-display');
        if (el) el.textContent = pending;
      }
    } catch (_) {}
    // Phase 56.31 — Auth UI is now on screen; dismiss the boot splash so the
    // gate is what the user sees (rather than the loader still hovering).
    try { if (typeof window.__slDismissBootSplash === 'function') window.__slDismissBootSplash(); } catch (_) {}
    try { if (_idleLockMessage) showMessage(_idleLockMessage, 'info'); } catch (_) {}
    return gate;
  }

  function escGuard(e) {
    if (e.key === 'Escape' && document.getElementById(GATE_ID)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function setMode(mode) {
    _mode = mode;
    renderGate();
  }
  function backToSignIn() { setMode('signin'); }

  function showMessage(text, kind) {
    const el = document.querySelector('#' + GATE_ID + ' #sl-msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'sl-msg show ' + (kind === 'error' ? 'error' : 'success');
  }

  async function onSubmit(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) { showMessage('Authentication service unavailable. Refresh and try again.', 'error'); return; }
    const emailEl = document.querySelector('#' + GATE_ID + ' #sl-email');
    const passEl  = document.querySelector('#' + GATE_ID + ' #sl-password');
    const btn     = document.querySelector('#' + GATE_ID + ' #sl-submit');
    const email = ((emailEl && emailEl.value) || '').trim().toLowerCase();
    const pass  = ((passEl  && passEl.value)  || '');
    // Phase 56.14e — set-new-password mode has no email field (the user is
    // already identified by the recovery session token), so skip email
    // validation entirely for that mode.
    if (_mode !== 'set-new-password') {
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        showMessage('Please enter a valid email address.', 'error');
        if (emailEl) emailEl.focus();
        return;
      }
    }
    if (_mode !== 'forgot' && pass.length < 8) {
      showMessage('Password must be at least 8 characters.', 'error');
      if (passEl) passEl.focus();
      return;
    }
    btn.disabled = true;
    const origLabel = btn.textContent;
    btn.textContent = 'Working…';
    try {
      if (_mode === 'set-new-password') {
        // Phase 56.14c — confirm-match + update the user\'s password against the
        // recovery session Supabase already established. Do NOT use the email
        // input here; the user is identified by the recovery session token.
        const confirmEl = document.querySelector('#' + GATE_ID + ' #sl-password-confirm');
        const confirmVal = ((confirmEl && confirmEl.value) || '');
        if (pass !== confirmVal) {
          showMessage('Passwords do not match.', 'error');
          if (confirmEl) confirmEl.focus();
          return;
        }
        const { error } = await sb.auth.updateUser({ password: pass });
        if (error) throw error;
        _passwordRecoveryActive = false;
        // Phase 56.14g — clear the recovery breadcrumb + URL marker so a
        // back-button visit or a future page-load doesn\'t re-trigger the flow.
        try {
          localStorage.removeItem('safetyLab.auth.recoveryPending');
          history.replaceState({}, '', window.location.pathname);
        } catch (_) {}
        showMessage('Password updated. Signing you in…', 'success');
        // The Supabase session from the recovery flow is still active; lift the gate.
        setTimeout(liftGate, 800);
        return;
      }
      if (_mode === 'signin') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        // Session is set; the auth state listener below will lift the gate.
        showMessage('Signed in. Loading…', 'success');
      } else if (_mode === 'signup') {
        // Sign-up is a profile: full name + organization + confirm-password, in
        // addition to email + password. (button reset handled by finally.)
        const nameEl    = document.querySelector('#' + GATE_ID + ' #sl-name');
        const orgEl     = document.querySelector('#' + GATE_ID + ' #sl-org');
        const confirmEl = document.querySelector('#' + GATE_ID + ' #sl-password-confirm');
        const fullName   = ((nameEl && nameEl.value) || '').trim();
        const org        = ((orgEl && orgEl.value) || '').trim();
        const confirmVal = ((confirmEl && confirmEl.value) || '');
        if (!fullName)           { showMessage('Please enter your full name.', 'error'); if (nameEl) nameEl.focus(); return; }
        if (!org)                { showMessage('Please enter your organization.', 'error'); if (orgEl) orgEl.focus(); return; }
        if (pass !== confirmVal) { showMessage('Passwords do not match.', 'error'); if (confirmEl) confirmEl.focus(); return; }
        // Supabase rejects weak passwords with a 422 the user only sees after a
        // round trip (it caught a real tester on 13 Aug). Check it here instead.
        if (!/[a-z]/.test(pass) || !/[A-Z]/.test(pass) || !/[0-9]/.test(pass)) {
          showMessage('Password needs at least one lowercase letter, one capital letter and one number.', 'error');
          if (passEl) passEl.focus(); return;
        }
        const redirect = window.location.origin + window.location.pathname;
        const { data, error } = await sb.auth.signUp({
          email,
          password: pass,
          options: { emailRedirectTo: redirect, data: { full_name: fullName, org: org } },
        });
        if (error) throw error;
        // Mirror the profile into the app's local signup record (tier/UX + outreach read it).
        try {
          localStorage.setItem('safetyLab.signup.name', fullName);
          localStorage.setItem('safetyLab.signup.org', org);
        } catch (_) {}
        try { sessionStorage.setItem('sl-auth-pending-email', email); } catch (_) {}
        setMode('verify-sent');
        return;
      } else if (_mode === 'forgot') {
        // Phase 56.14g — Use a custom hash marker (#sl-recovery) that Supabase
        // preserves through the redirect, plus a localStorage breadcrumb. Either
        // signal on return tells us this is a recovery flow even if Supabase\'s
        // PASSWORD_RECOVERY event never fires.
        const redirect = window.location.origin + window.location.pathname + '#sl-recovery';
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error;
        try {
          sessionStorage.setItem('sl-auth-pending-email', email);
          localStorage.setItem('safetyLab.auth.recoveryPending', String(Date.now()));
        } catch (_) {}
        setMode('reset-sent');
        return;
      }
    } catch (err) {
      console.error('[auth-gate]', err);
      const msg = (err && err.message) || 'Something went wrong. Please try again.';
      // Friendlier mapping for common Supabase errors.
      // Phase 56.14c — give the user a real next-step when sign-in fails.
      // "Invalid login credentials" can mean: wrong password, OR account doesn\'t
      // exist (e.g. signup failed earlier). The actionable message is: try the
      // Create Account tab.
      const friendly = /invalid login credentials/i.test(msg)
        ? 'Email or password is incorrect. If you have not signed up yet, switch to "Create account" above.'
        : (/email not confirmed/i.test(msg)
              ? 'Please verify your email first. Check your inbox for the activation link.'
              : (/user already registered/i.test(msg)
                  ? 'An account with this email already exists. Switch to "Sign in" above.'
                  : (/weak password|password.*8/i.test(msg)
                        ? 'Password must be at least 8 characters.'
                        : msg)));
      showMessage(friendly, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origLabel;
    }
  }

  async function resendVerification() {
    const sb = getSupabase(); if (!sb) return;
    let email = '';
    try { email = sessionStorage.getItem('sl-auth-pending-email') || ''; } catch (_) {}
    if (!email) { setMode('signup'); return; }
    try {
      const { error } = await sb.auth.resend({ type: 'signup', email });
      if (error) throw error;
      showMessage('A new verification link is on its way to ' + email + '.', 'success');
    } catch (err) {
      showMessage((err && err.message) || 'Could not send a new link.', 'error');
    }
  }

  function liftGate() {
    document.removeEventListener('keydown', escGuard, true);
    document.documentElement.classList.remove('sl-auth-gate-blocked');
    const gate = document.getElementById(GATE_ID);
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
    try { sessionStorage.removeItem('sl-auth-pending-email'); } catch (_) {}
    // Phase 56.31 — User is signed in; reveal the app shell.
    try { if (typeof window.__slDismissBootSplash === 'function') window.__slDismissBootSplash(); } catch (_) {}
    // One-time EULA acceptance gate — shows only until the account has accepted
    // the current EULA version (recorded in Supabase user_metadata).
    try {
      if (window.SafetyLab && typeof window.SafetyLab.checkEula === 'function') {
        window.SafetyLab.checkEula();
      }
    } catch (_) {}
    try { _idleLockMessage = ''; armIdleTimeout(); } catch (_) {}   // signed in → start/refresh the 20-min idle clock (every session, no exemption)
  }

  // Phase 62.62 — Two-factor step-up. If the account has a verified TOTP factor,
  // a password sign-in only reaches AAL1; require the 6-digit code to reach AAL2
  // BEFORE lifting the gate. Accounts with no factor are unaffected (needsChallenge
  // returns false → onLift runs immediately, exactly as before). If the module is
  // absent or the check throws, we fail OPEN to the prior behavior so a transient
  // error can never lock out a non-MFA user; a cancelled mandatory challenge signs
  // the user back out so an un-stepped-up session never proceeds.
  // 6 Sep 2026 (desktop parity) — THE LICENSE MUST COVER THE ACCOUNT. On a customer
  // install the signed license may be bound to e-mail domains / an Entra tenant; the
  // account that just signed in is checked against it BEFORE MFA and BEFORE the gate
  // lifts. A mismatch signs out locally and says why in plain words. On the hosted demo
  // (no authoritative license) this is a no-op. Fails OPEN only if the verifier is
  // absent — never on a real "not covered" verdict.
  function _sessionTenant(session) {
    try {
      const u = session && session.user; if (!u) return '';
      if (u.app_metadata && u.app_metadata.tid) return String(u.app_metadata.tid);
      const ids = Array.isArray(u.identities) ? u.identities : [];
      for (const id of ids) { const d = id && id.identity_data; if (d && d.tid) return String(d.tid); }
    } catch (_) {}
    return '';
  }
  async function _licenseCoversAccount(session) {
    try {
      if (typeof window.SLLicenseCheckIdentity !== 'function') return { ok: true };
      const email = session && session.user && session.user.email;
      const r = await window.SLLicenseCheckIdentity(email || '', _sessionTenant(session));
      if (!r || !r.authoritative) return { ok: true };
      if (r.valid) return { ok: true };
      const plain = (typeof window.SLLicensePlainReason === 'function') ? window.SLLicensePlainReason(r.reason) : String(r.reason || '');
      return { ok: false, reason: plain };
    } catch (_) { return { ok: true }; }
  }
  async function _licensedThenMfaThenLift(sb, session, onLift) {
    const cover = await _licenseCoversAccount(session);
    if (!cover.ok) {
      _idleLockMessage = 'You signed in as ' + ((session && session.user && session.user.email) || 'this account') + ', but ' + cover.reason.replace(/^This license does not cover this account: /, 'this install\'s license does not cover it: ');
      try { console.warn('[auth-gate] license does not cover the signed-in account — ' + cover.reason); } catch (_) {}
      try { await sb.auth.signOut({ scope: 'local' }); } catch (_) { try { await sb.auth.signOut(); } catch (__) {} }
      try { renderGate(); } catch (_) {}
      return;
    }
    return _mfaGateThenLift(sb, onLift);
  }

  // 6 Sep 2026 (desktop parity, "works like Office") — STAY SIGNED IN OFFLINE. On the
  // desktop a persisted login must still open the app with no network: supabase-js
  // cannot refresh an expired token offline and reports "no session", which is not a
  // sign-out. If this is the desktop and the stored login is still on disk (signing
  // out deletes it), open the app in offline mode; the first successful refresh once
  // the network returns carries on silently, and a refusal by the server arrives as a
  // real SIGNED_OUT event, which renders the gate. Web installs never take this path.
  function _storedLoginEmail() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!/^sb-.*-auth-token$/.test(k || '')) continue;
        const v = JSON.parse(localStorage.getItem(k) || 'null');
        const u = v && (v.user || (v.currentSession && v.currentSession.user));
        if (u && u.email) return String(u.email);
      }
    } catch (_) {}
    return '';
  }
  function _desktopOfflineRestore() {
    try {
      if (!(window.SLConfig && window.SLConfig.isDesktop)) return '';
      return _storedLoginEmail();
    } catch (_) { return ''; }
  }

  async function _mfaGateThenLift(sb, onLift) {
    const _signOutToGate = async function () {
      try { if (sb && sb.auth && typeof sb.auth.signOut === 'function') await sb.auth.signOut(); } catch (_) {}
      try { renderGate(); } catch (_) {}
    };
    try {
      // Master switch: window.SL_MFA_REQUIRED === false drops MFA entirely (no
      // step-up challenge and no forced enrollment). Defaults ON when unset.
      // 8 Sep 2026 — two INDEPENDENT controls (posture: available + enforced if enabled):
      //  - STEP-UP (default ON): an account that HAS a verified factor is always
      //    challenged to AAL2 at sign-in. Kill switch: window.SL_MFA_REQUIRED === false.
      //  - FORCED ENROLLMENT (default OFF): only when the org opts in via
      //    window.SL_MFA_MANDATORY === true is a factor-less account made to enroll
      //    before the app opens. Default forces 2FA on no one; it is offered in the
      //    account panel and honored at sign-in for anyone who turns it on.
      const _stepUpOn    = (typeof window.SL_MFA_REQUIRED === 'undefined') ? true : (window.SL_MFA_REQUIRED !== false);
      const _forceEnroll = (window.SL_MFA_MANDATORY === true);
      // 16 Sep 2026 — if the step-up is on and the MFA module is missing, that is a
      // broken build, not a reason to open the app. Previously this condition simply
      // fell through to onLift() and nobody was ever challenged.
      if (_stepUpOn && !window.SafetyLabMFA) {
        try { console.error('[auth-gate] MFA step-up is enabled but mfa.js did not load — refusing to lift the gate'); } catch (_) {}
        try { if (window.SLErrorWatch) window.SLErrorWatch.report(new Error('mfa.js missing with step-up enabled'), 'auth_gate'); } catch (_) {}
        await _signOutToGate();
        return;
      }
      if (_stepUpOn && window.SafetyLabMFA) {
        // (1) Account already has a factor → step up from AAL1 to AAL2.
        if (typeof window.SafetyLabMFA.needsChallenge === 'function') {
          const need = await window.SafetyLabMFA.needsChallenge();
          if (need) {
            const ok = await window.SafetyLabMFA.promptChallenge({ mandatory: true });
            if (!ok) { await _signOutToGate(); return; }
          }
        }
        // (2) Forced "grace enrollment" — ONLY under the mandatory policy (_forceEnroll).
        // promptEnroll fails OPEN if MFA infra is unavailable, so this can never lock
        // everyone out. Off by default: no one is forced to set up 2FA.
        if (_forceEnroll
                     && typeof window.SafetyLabMFA.hasVerifiedFactor === 'function'
                     && typeof window.SafetyLabMFA.promptEnroll === 'function') {
          const has = await window.SafetyLabMFA.hasVerifiedFactor();
          if (!has) {
            const done = await window.SafetyLabMFA.promptEnroll({ mandatory: true });
            if (!done) { await _signOutToGate(); return; }   // user declined to enroll → not signed in
          }
        }
      }
    } catch (e) {
      // 16 Sep 2026 — this used to swallow everything and lift the gate. A security gate
      // that cannot run must not open. It now opens ONLY for an account we can positively
      // say has no second factor; anything else goes back to the sign-in screen. That
      // keeps a network blip from locking out the people who never turned 2FA on, while
      // an account with a factor can no longer be let in by an exception.
      try { console.error('[auth-gate] MFA step-up failed', e); } catch (_) {}
      try { if (window.SLErrorWatch) window.SLErrorWatch.report(e, 'auth_gate'); } catch (_) {}
      let _known = false;
      try {
        _known = (window.SafetyLabMFA && typeof window.SafetyLabMFA.hasVerifiedFactor === 'function')
                   ? await window.SafetyLabMFA.hasVerifiedFactor() : true;
      } catch (_) { _known = true; }
      if (_known) { await _signOutToGate(); return; }
    }
    try { onLift(); } catch (_) {}
  }

  // -------------------------------------------------------------------------
  // Expose hooks for inline onclicks
  // -------------------------------------------------------------------------
  window.SafetyLab = window.SafetyLab || {};
  window.SafetyLab._authSetMode = setMode;
  window.SafetyLab._authBackToSignIn = backToSignIn;
  window.SafetyLab._authResendVerification = resendVerification;
  window.SafetyLab._authLiftGate = liftGate;

  // ---- desktop SSO return (17 Sep 2026) ------------------------------------------------
  // The shell receives safetylab://auth-callback?code=… from the system browser and calls this
  // through webContents.executeJavaScript, which runs in this page's own world.
  //
  // This used to live in the desktop preload, which reached in here for getSupabaseClient().
  // With contextIsolation now ON for the app window, the preload cannot reach into the page at
  // all, so the handler belongs on this side — where the Supabase client already is. The shell
  // side is unchanged: it still calls window.__slabAuthCallback(url).
  window.__slabAuthCallback = async function (url) {
    try {
      const u = new URL(String(url));
      const code = u.searchParams.get('code');
      const sb = getSupabase();
      if (!sb || !sb.auth) return false;
      if (code && typeof sb.auth.exchangeCodeForSession === 'function') {
        const r = await sb.auth.exchangeCodeForSession(code);
        return !r.error;
      }
      const h = new URLSearchParams(String(u.hash || '').replace(/^#/, ''));
      const at = h.get('access_token'), rt = h.get('refresh_token');
      if (at && rt && typeof sb.auth.setSession === 'function') {
        const r = await sb.auth.setSession({ access_token: at, refresh_token: rt });
        return !r.error;
      }
    } catch (e) {
      try { console.error('[auth-gate] SSO return failed', e); } catch (_) {}
    }
    return false;
  };

  // -------------------------------------------------------------------------
  // Main: check session, gate or lift accordingly
  // -------------------------------------------------------------------------
  async function init() {
    // 6 Sep 2026 — the desktop bypass that lived here ("skip the online auth gate on
    // Electron") is GONE. The desktop signs in at this gate exactly like the web; what
    // differs is only that a stored login still opens the app offline (below).
    const sb = getSupabase();
    if (!sb) { setTimeout(init, 300); return; }

    // Phase 56.14f — Install the auth-state listener BEFORE checking the session.
    // PKCE flow (which safety_lab.js uses) produces a URL like ?code=xxx for both
    // password-reset and signup-email-confirm — same URL shape, different intent.
    // We can only tell which by waiting for the PASSWORD_RECOVERY event from
    // Supabase, which fires AFTER the code is exchanged for a session.
    //
    // Strategy:
    //   - Install the listener immediately so we don't miss any event.
    //   - If the URL had a recovery-shaped signal (#type=recovery OR ?code=),
    //     hold the gate up and let the events decide. Lift only if we're
    //     confident it wasn't a recovery (timeout fallback).
    //   - Otherwise (no URL signal), check the existing session and lift or
    //     render as normal.
    // Phase 55.0.6b4 — License token lifecycle. Fetches the signed-in user's
    // license_tokens row (RLS-protected; returns 0 or 1 row) and writes the
    // token to localStorage so AiClient routes via the hosted proxy.
    // 4 Sep 2026 — "AI backend not ready" IN THE MIDDLE OF A DEMO (Waqas). Two causes,
    // both here. (1) On sign-in the gate lifted BEFORE this query returned, so for a few
    // seconds every AI button saw no license token and said "not ready". (2) A transient
    // query error REMOVED the stored token — one bad network moment and the AI stayed
    // off until the next sign-in. Now: the gate waits for this sync (bounded, 6 s) before
    // lifting; an error keeps the last known-good token; the sync is exposed as
    // window.__slabLicenseReady (a promise) and window.__slabSyncLicense (re-run) so the
    // AI's own guard can wait or retry instead of failing.
    let _licenseSyncPromise = null;
    function _syncLicenseTokenFromSupabase() {
      const run = (async function () {
        // 6 Sep 2026 — when a signed license is the authority (every customer install),
        // the cloud license row must NOT override or clear it. Wait for verification, then
        // stand down. The demo cloud (no signed license) keeps the row path below.
        try {
          if (typeof window.__slabSignedLicenseReady === 'object' && window.__slabSignedLicenseReady && typeof window.__slabSignedLicenseReady.then === 'function') { await window.__slabSignedLicenseReady; }
          if (window.SLLicense && window.SLLicense.authoritative) return { ok: true, signed: true, token: !!window.SLLicense.valid };
        } catch (_) {}
        try {
          const { data, error } = await sb.from('license_tokens').select('token,plan,expires_at').limit(1).maybeSingle();
          if (error) { console.warn('[auth-gate] license_tokens query error (keeping the stored token):', error.message || error); return { ok: false, kept: true }; }
          if (data && data.token && (!data.expires_at || new Date(data.expires_at) > new Date())) {
            try { localStorage.setItem('safetyLab.license.token', String(data.token)); } catch(_){}
            // Make the client license tier authoritative from the server's purchased plan
            // (e.g. an enterprise account is uncapped; a pro-plus account keeps the standard
            // allowance) rather than trusting the local onboarding guess. setLicenseTier
            // validates the value, so an unexpected plan string is simply ignored.
            try { if (data.plan && typeof window.setLicenseTier === 'function') window.setLicenseTier(String(data.plan)); } catch(_){}
            return { ok: true, token: true };
          }
          // The server positively says there is no valid token for this user.
          try { localStorage.removeItem('safetyLab.license.token'); } catch(_){}
          return { ok: true, token: false };
        } catch (e) { console.warn('[auth-gate] license token sync failed (keeping the stored token):', e); return { ok: false, kept: true }; }
      })();
      _licenseSyncPromise = run;
      try { window.__slabLicenseReady = run; } catch (_) {}
      return run;
    }
    try { window.__slabSyncLicense = _syncLicenseTokenFromSupabase; } catch (_) {}
    // Lift the gate once the license is known (or after 6 s, whichever first) so the
    // first AI click after sign-in never lands in the gap.
    function _syncThenLift() {
      let done = false;
      const lift = function () { if (done) return; done = true; try { liftGate(); } catch (_) {} };
      try { _syncLicenseTokenFromSupabase().then(lift, lift); } catch (_) { lift(); }
      setTimeout(lift, 6000);
    }

    sb.auth.onAuthStateChange((event, session) => {
      try { console.log('[auth-gate] auth event:', event, 'recovery-active:', _passwordRecoveryActive, 'potentialRecovery:', _potentialRecovery); } catch (_) {}
      if (event === 'PASSWORD_RECOVERY') {
        _passwordRecoveryActive = true;
        setMode('set-new-password');
        return;
      }
      if (event === 'SIGNED_IN' && session && session.user && session.user.email) {
        // If recovery is already known active, never lift on SIGNED_IN.
        if (_passwordRecoveryActive) return;
        // If the URL had a recovery-shaped signal, wait briefly for
        // PASSWORD_RECOVERY before deciding. Supabase emits SIGNED_IN before
        // PASSWORD_RECOVERY for reset flows, so a small delay catches it.
        if (_potentialRecovery) {
          try { console.log('[auth-gate] SIGNED_IN with potential-recovery URL; waiting 1500ms for PASSWORD_RECOVERY before lifting'); } catch (_) {}
          setTimeout(() => {
            if (_passwordRecoveryActive) return; // PASSWORD_RECOVERY fired, set-new-password already shown
            _licensedThenMfaThenLift(sb, session, function () {
              try { if (typeof window.setSignupEmail === 'function') window.setSignupEmail(session.user.email); } catch (_) {}
              _syncThenLift();
              toast('Signed in as ' + session.user.email, 'success');
            });
          }, 1500);
          return;
        }
        // Normal sign-in — license must cover the account, then the MFA step-up (if enrolled), then lift.
        _licensedThenMfaThenLift(sb, session, function () {
          try { if (typeof window.setSignupEmail === 'function') window.setSignupEmail(session.user.email); } catch (_) {}
          _syncThenLift();
          toast('Signed in as ' + session.user.email, 'success');
        });
      } else if (event === 'SIGNED_OUT') {
        _passwordRecoveryActive = false;
        try { localStorage.removeItem('safetyLab.license.token'); } catch(_){}
        renderGate();
      }
    });

    // Phase 56.14g — If we have a CONFIDENT recovery signal (our own marker
    // or breadcrumb), force the set-new-password screen immediately. Don't
    // wait for the unreliable PASSWORD_RECOVERY event.
    if (_isRecovery) {
      try { console.log('[auth-gate] confident recovery signal; forcing set-new-password mode'); } catch (_) {}
      _passwordRecoveryActive = true;
      setMode('set-new-password');
      return;
    }
    // If only a soft signal (PKCE ?code= with no breadcrumb), render the gate
    // and let the listener decide via PASSWORD_RECOVERY / SIGNED_IN events.
    if (_potentialRecovery) {
      try { console.log('[auth-gate] soft potential-recovery URL detected; rendering gate and waiting for events'); } catch (_) {}
      renderGate();
      return;
    }

    // Otherwise, normal session check.
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user && session.user.email) {
        // 6 Sep 2026 — a RESTORED login must answer for the time it was away.
        // See _idleAbandonedSince(). If the last recorded activity in this
        // browser is older than the idle limit, the previous session was
        // abandoned, not ended, and it does not get to walk back in: sign out
        // LOCALLY (this browser only — never revoke the user's phone), say why,
        // and show the gate. Typing the password then raises SIGNED_IN, which
        // lifts the gate and starts a fresh clock, exactly as a new sign-in
        // should. The check runs BEFORE the MFA step so an abandoned session is
        // never asked for a second factor on top of a first it no longer holds.
        const _away = _idleAbandonedSince();
        if (_away > 0) {
          const _mins = Math.max(20, Math.round(_away / 60000));
          _idleLockMessage = 'You were away for ' + (_mins >= 120 ? Math.round(_mins / 60) + ' hours' : _mins + ' minutes') + ', so you were signed out. Please sign in again.';
          try { console.info('[auth-gate] restored login refused: last activity ' + _mins + ' min ago (limit ' + (IDLE_MS / 60000) + ')'); } catch (_) {}
          try { await sb.auth.signOut({ scope: 'local' }); } catch (_) { try { await sb.auth.signOut(); } catch (__) {} }
          renderGate();
          return;
        }
        try {
          if (typeof window.setSignupEmail === 'function') window.setSignupEmail(session.user.email);
          else localStorage.setItem('safetyLab.signup.email', String(session.user.email).toLowerCase());
        } catch (_) {}
        _licensedThenMfaThenLift(sb, session, function () { _syncThenLift(); });
      } else {
        const offlineEmail = _desktopOfflineRestore();
        if (offlineEmail) {
          try { console.info('[auth-gate] desktop: stored login for ' + offlineEmail + ' opens the app offline; will refresh when the network returns'); } catch (_) {}
          try { if (typeof window.setSignupEmail === 'function') window.setSignupEmail(offlineEmail); } catch (_) {}
          _syncThenLift();
          toast('Working offline as ' + offlineEmail + ' — your changes sync when you reconnect.', 'info');
          return;
        }
        renderGate();
      }
    } catch (err) {
      console.error('[auth-gate] init', err);
      const offlineEmail = _desktopOfflineRestore();
      if (offlineEmail) { try { if (typeof window.setSignupEmail === 'function') window.setSignupEmail(offlineEmail); } catch (_) {} _syncThenLift(); return; }
      renderGate();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
