/**
 * notify-signin — Safety Lab Supabase Edge Function
 * ============================================================================
 * Triggered by a Database Webhook on `auth.users` UPDATE.
 * Sends an email each time an existing user signs in (detected by a change
 * to last_sign_in_at). Mirrors the structure of notify-signup so the two
 * functions share the same Resend setup, secrets, and notification_log table.
 *
 * What it does:
 *   1. Verifies the webhook auth header matches WEBHOOK_SECRET.
 *   2. Compares old_record vs record to confirm last_sign_in_at advanced.
 *   3. Skips emails on confirmation-only updates (first sign-in is covered by
 *      notify-signup already — we de-dupe by only firing when this is NOT the
 *      first sign-in event).
 *   4. Sends a notification email to ADMIN_EMAIL via Resend.
 *   5. Inserts an audit row into public.notification_log.
 *
 * Required environment variables (same as notify-signup):
 *   - RESEND_API_KEY
 *   - NOTIFY_FROM_EMAIL
 *   - ADMIN_EMAIL
 *   - WEBHOOK_SECRET
 *   - SUPABASE_URL              (auto-injected)
 *   - SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 * ============================================================================
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const RESEND_API_KEY     = Deno.env.get('RESEND_API_KEY')     ?? '';
const NOTIFY_FROM_EMAIL  = Deno.env.get('NOTIFY_FROM_EMAIL')  ?? 'Safety Lab <onboarding@resend.dev>';
const ADMIN_EMAIL        = Deno.env.get('ADMIN_EMAIL')        ?? 'waqas.nafees@safetylabaero.com';
const WEBHOOK_SECRET     = Deno.env.get('WEBHOOK_SECRET')     ?? '';
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')       ?? '';
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ageDescription(createdAtIso: string | null, signedInAtIso: string | null): string {
  if (!createdAtIso || !signedInAtIso) return '—';
  const created = new Date(createdAtIso).getTime();
  const signedIn = new Date(signedInAtIso).getTime();
  if (!isFinite(created) || !isFinite(signedIn)) return '—';
  const deltaMs = Math.max(0, signedIn - created);
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 60) return `${mins} min after signup`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h after signup`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} after signup`;
}

// ---------------------------------------------------------------------------
async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: NOTIFY_FROM_EMAIL,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body?.message || `Resend HTTP ${res.status}` };
  }
  return { ok: true, id: body?.id ?? '' };
}

async function logNotification(row: {
  kind: string;
  target_email: string;
  subject: string;
  resend_id?: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string;
  payload?: any;
}) {
  try {
    await sb.from('notification_log').insert(row);
  } catch (e) {
    console.error('[notify-signin] notification_log insert failed', e);
  }
}

// ---------------------------------------------------------------------------

// S10 (14 Sep 2026): this function is invoked ONLY by a database trigger / cron that sends the
// project service-role key as the Bearer token. Verify it in constant time. The previous check
// accepted ANY Bearer of 16+ characters, so anyone who knew the URL could trigger it.
function _ctEq(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length === 0) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
// 17 Sep 2026. Accept EITHER the purpose-built hook secret or the project service-role key.
//
// Why two. Requiring the service-role key exactly (14 Sep) was correct as far as it went, but
// it tied every notification to the database master key, and the callers are database triggers
// that carry their Bearer as a literal baked into the trigger definition. When the key the
// platform injects here stopped matching the literal in those triggers, every send started
// returning 401 and nothing noticed for three days: sign-in, signup, review and licence-expiry
// mail all stopped. NOTIFY_HOOK_SECRET is a secret whose only power is to ask for a
// notification, read from Vault by the trigger at send time, so rotating it is one row.
//
// The service-role branch stays so this can be deployed before or after the database side
// without a window where mail is dead. Once the triggers are on the hook secret it can go.
const HOOK_SECRET = Deno.env.get('NOTIFY_HOOK_SECRET') ?? '';

function _authorizedBySvc(authHeader: string): boolean {
  const m = /^Bearer\s+(.+)$/.exec(authHeader ?? '');
  if (!m) return false;
  const presented = m[1].trim();
  // Evaluate both, always, so the answer does not depend on which one matched.
  const okHook = HOOK_SECRET ? _ctEq(presented, HOOK_SECRET) : false;
  const okSvc  = SERVICE_ROLE_KEY ? _ctEq(presented, SERVICE_ROLE_KEY) : false;
  return okHook || okSvc;                              // fail closed when neither is configured
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' });
  }

  // Auth check — accept any well-formed Bearer token. The function URL is only
  // reachable through Supabase's internal webhook infrastructure (the auto-injected
  // service_role JWT can't be forged from outside), so requiring an exact match on
  // a specific secret value was creating reliability problems without meaningfully
  // improving security. If the Authorization header is present and starts with
  // "Bearer ", we accept.
  const auth = req.headers.get('authorization') ?? '';
  if (!_authorizedBySvc(auth)) {
    console.warn('[notify-signin] unauthorized — header malformed:', auth.slice(0, 24));
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid json' });
  }

  // Supabase Database Webhook payload shape for an UPDATE on auth.users:
  //   { type: "UPDATE", table: "users", schema: "auth", record: { ... }, old_record: { ... } }
  const record    = payload?.record     ?? payload?.new ?? {};
  const oldRecord = payload?.old_record ?? payload?.old ?? {};

  const newSignIn = record?.last_sign_in_at ?? null;
  const oldSignIn = oldRecord?.last_sign_in_at ?? null;

  // Only fire when last_sign_in_at actually advanced.
  if (!newSignIn || newSignIn === oldSignIn) {
    return jsonResponse(200, { ok: true, skipped: 'no sign-in advance' });
  }

  // De-dupe vs notify-signup: if the user has never signed in before
  // (oldSignIn === null), this is the *first* sign-in, which notify-signup
  // already covered. Skip to avoid double-notifying.
  if (!oldSignIn) {
    return jsonResponse(200, { ok: true, skipped: 'first sign-in (covered by notify-signup)' });
  }

  const userId    = record.id ?? null;
  const email     = record.email ?? '(no email)';
  const provider  = record.raw_app_meta_data?.provider ?? 'email';
  const createdAt = record.created_at ?? null;

  const domain = (email.split('@')[1] || '').toLowerCase();
  const tier =
    email === 'mwnafees9@gmail.com' || domain === 'electra.aero'
      ? 'Pro+ (comped)'
      : '(free trial / unknown)';

  const age = ageDescription(createdAt, newSignIn);

  const subject = `[Safety Lab] Sign-in: ${email}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #111; max-width: 560px;">
      <p style="font-size: 18px; margin: 0 0 12px;"><strong>Safety Lab sign-in</strong></p>
      <p style="margin: 0 0 14px; color:#444;">${escapeHtml(email)} signed in (${escapeHtml(age)}).</p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Email</td><td style="padding: 4px 0;"><strong>${escapeHtml(email)}</strong></td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Domain</td><td style="padding: 4px 0;">${escapeHtml(domain)}</td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Tier</td><td style="padding: 4px 0;">${escapeHtml(tier)}</td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Provider</td><td style="padding: 4px 0;">${escapeHtml(provider)}</td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">User ID</td><td style="padding: 4px 0;"><code>${escapeHtml(userId ?? '')}</code></td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Signed in at</td><td style="padding: 4px 0;">${escapeHtml(newSignIn)}</td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Previous sign-in</td><td style="padding: 4px 0;">${escapeHtml(oldSignIn ?? '(first)')}</td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Account age</td><td style="padding: 4px 0;">${escapeHtml(age)}</td></tr>
      </table>
      <p style="margin-top: 24px; font-size: 12px; color: #999;">
        Sent by the notify-signin edge function. Returns indicate this user is engaged and worth following up with.
      </p>
    </div>
  `;
  const text =
    `Safety Lab sign-in\n\n` +
    `Email:            ${email}\n` +
    `Domain:           ${domain}\n` +
    `Tier:             ${tier}\n` +
    `Provider:         ${provider}\n` +
    `User ID:          ${userId}\n` +
    `Signed in at:     ${newSignIn}\n` +
    `Previous sign-in: ${oldSignIn ?? '(first)'}\n` +
    `Account age:      ${age}\n`;

  const send = await sendViaResend({ to: ADMIN_EMAIL, subject, html, text });

  await logNotification({
    kind: 'signin',
    target_email: ADMIN_EMAIL,
    subject,
    resend_id: send.ok ? send.id : undefined,
    status: send.ok ? 'sent' : 'failed',
    error: send.ok ? undefined : send.error,
    payload: { user_id: userId, email, provider, domain, tier, signed_in_at: newSignIn, previous_sign_in: oldSignIn },
  });

  if (!send.ok) {
    console.error('[notify-signin] send failed', send.error);
    return jsonResponse(500, { ok: false, error: send.error });
  }
  return jsonResponse(200, { ok: true, id: send.id });
});
