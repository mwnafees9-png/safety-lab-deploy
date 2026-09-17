/**
 * notify-expiry — Safety Lab Supabase Edge Function
 * ============================================================================
 * Nothing watched an expiry. Access can lapse from two independent surfaces —
 * the 10-day signup trial (public.users.trial_ends_at) and a comped or
 * purchased licence (license_tokens.expires_at) — and both ended in a FULL
 * LOCKOUT with no warning to the user and no notice to us.
 *
 * That failure is invisible by construction. The user opens the tool, finds it
 * locked, and we only hear about it if they bother to write. Most people don't;
 * they conclude the trial is over and move on. On 31 Jul 2026 the two most
 * engaged accounts on the platform were both due to lock out on 10 August.
 *
 * WHAT THIS DOES, once a day:
 *   1. Reads public.expiry_watch (the view owns the date arithmetic, so this
 *      function and any dashboard can never disagree about who is expiring).
 *   2. Warns the user at T-3 and again at T-1. Two touches: three days is
 *      enough notice to reply and ask for more time, one day is the last
 *      honest moment to say so. No third nag.
 *   3. Sends the admin one digest of everything expiring inside 14 days, plus
 *      anything that lapsed in the last 7 — so a lockout is never the first
 *      you hear of it.
 *   4. Logs every send to public.notification_log.
 *
 * IDEMPOTENCE. Every send carries a dedupe_key built from subject + expiry date
 * + stage. Before sending, the function looks for a 'sent' row with that key.
 * Running twice in a day, or re-running after a partial failure, therefore
 * sends nothing extra — which matters, because the failure mode of a mail cron
 * is not silence, it is the same warning eight times.
 *
 * DRY RUN. POST {"dryRun": true} returns exactly what it would send, sending
 * nothing and logging nothing. Use it to inspect the recipient list against a
 * real database before letting it mail anyone.
 *
 * Environment (shared with notify-signup):
 *   RESEND_API_KEY · NOTIFY_FROM_EMAIL · ADMIN_EMAIL
 *   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY   (auto-injected)
 *   SEND_EXPIRY_EMAIL   optional, "0" disables USER mail without redeploying
 *                       (the admin digest still goes out, so disabling it
 *                       cannot make you blind as well as silent)
 * ============================================================================
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')    ?? '';
const NOTIFY_FROM_EMAIL = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'Safety Lab <onboarding@resend.dev>';
const ADMIN_EMAIL       = Deno.env.get('ADMIN_EMAIL')       ?? 'waqas.nafees@safetylabaero.com';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SEND_USER_MAIL    = (Deno.env.get('SEND_EXPIRY_EMAIL') ?? '1') !== '0';

const APP_URL   = 'https://safetylabaero.com/app';
const TRUST_URL = 'https://safetylabaero.com/trust';
const LOGO_URL  = 'https://safetylabaero.com/email-logo.png';

// Resend allows 10 requests/second. Small gap between sends so a busy day
// (several expiries at once) cannot trip the limiter and drop warnings.
const SEND_GAP_MS = 250;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body, null, 2), {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function humanDate(d: string): string {
  try {
    return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  } catch { return d; }
}

// ---------------------------------------------------------------------------
type SendResult = { ok: boolean; id?: string; error?: string };

async function sendViaResend(opts: { to: string; subject: string; html: string; text?: string; replyTo?: string })
  : Promise<SendResult> {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: NOTIFY_FROM_EMAIL,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      reply_to: opts.replyTo,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.message || `Resend HTTP ${res.status}` };
  return { ok: true, id: body?.id ?? '' };
}

async function logNotification(row: {
  kind: string; target_email: string; subject: string;
  resend_id?: string; status: 'sent' | 'failed'; error?: string; payload?: any;
}) {
  try { await sb.from('notification_log').insert(row); }
  catch (e) { console.error('[notify-expiry] notification_log insert failed', e); }
}

// Has this exact warning already gone out? The dedupe key pins subject, expiry
// date and stage, so this is a question about THIS send, not about the user.
async function alreadySent(dedupeKey: string): Promise<boolean> {
  try {
    const { data, error } = await sb
      .from('notification_log')
      .select('id')
      .eq('kind', 'expiry')
      .eq('status', 'sent')
      .eq('payload->>dedupe_key', dedupeKey)
      .limit(1);
    if (error) throw error;
    return !!(data && data.length);
  } catch (e) {
    // Fail CLOSED. If we cannot prove the warning has not already gone out,
    // staying quiet is the recoverable error; mailing a customer the same
    // notice repeatedly is not.
    console.error('[notify-expiry] dedupe check failed — suppressing send', e);
    return true;
  }
}

// ---------------------------------------------------------------------------
// The user warning. Short, no marketing, one clear action: reply and ask.
// ---------------------------------------------------------------------------
function warningEmail(opts: { scope: string; daysLeft: number; endsOn: string; stage: string }) {
  const { scope, daysLeft, endsOn } = opts;
  const isTrial = scope === 'trial';
  const when = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
  const human = humanDate(endsOn);

  const subject = isTrial
    ? (daysLeft === 1 ? 'Your Safety Lab Aero trial ends tomorrow' : `Your Safety Lab Aero trial ends in ${daysLeft} days`)
    : (daysLeft === 1 ? 'Your Safety Lab Aero access ends tomorrow' : `Your Safety Lab Aero access ends in ${daysLeft} days`);

  const lead = isTrial
    ? `Your free trial of Safety Lab Aero ends ${when}, on ${human}.`
    : `Your Safety Lab Aero licence ends ${when}, on ${human}.`;

  // Say plainly what happens. A vague "your access may be affected" makes
  // people ignore it; they need to know the app locks and the work stays.
  const consequence = `After that the app locks and you will not be able to open your projects. Nothing is deleted — your work stays exactly where it is and comes straight back when access is restored.`;

  const ask = `If you need more time to evaluate, just reply to this email and say so. We would rather extend it than have you lose your thread halfway through an assessment.`;

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size:15px; line-height:1.55; color:#16213A; max-width:560px;">
    <p style="margin:0 0 22px;">
      <img src="${LOGO_URL}" width="280" height="60" alt="Safety Lab Aero"
           style="display:block; border:0; outline:none; text-decoration:none; font-family:inherit; font-size:19px; font-weight:700; color:#16213A;">
    </p>

    <p style="margin:0 0 16px;">${escapeHtml(lead)}</p>
    <p style="margin:0 0 16px;">${escapeHtml(consequence)}</p>
    <p style="margin:0 0 22px;">${escapeHtml(ask)}</p>

    <p style="margin:0 0 22px;">
      <a href="${APP_URL}"
         style="display:inline-block; background:#0A63CC; color:#fff; text-decoration:none;
                padding:11px 20px; border-radius:6px; font-weight:600;">
        Open Safety Lab
      </a>
    </p>

    <p style="margin:24px 0 0;">Waqas Nafees<br>
      <span style="color:#5A6B85;">Safety Lab Aero</span>
    </p>

    <div style="margin:30px 0 0; padding-top:16px; border-top:1px solid #E1E7F0; font-size:12px; line-height:1.6; color:#8494AB;">
      Safety Lab Aero — ARP 4761A / 4754B safety analysis, from aircraft function to signed evidence.<br>
      <a href="https://safetylabaero.com" style="color:#5A6B85; text-decoration:none;">safetylabaero.com</a>
      &nbsp;·&nbsp;
      <a href="${TRUST_URL}" style="color:#5A6B85; text-decoration:none;">Trust &amp; security</a><br>
      You are receiving this because you have a Safety Lab Aero account.
    </div>
  </div>`;

  const text =
    `${lead}\n\n${consequence}\n\n${ask}\n\n  ${APP_URL}\n\n` +
    `Waqas Nafees\nSafety Lab Aero\n\n--\n` +
    `Safety Lab Aero — ARP 4761A / 4754B safety analysis, from aircraft function\n` +
    `to signed evidence.  https://safetylabaero.com\n` +
    `You are receiving this because you have a Safety Lab Aero account.\n`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// The admin digest. Whatever happens to the user mail, this must arrive, so a
// lockout is never the first Waqas hears of it.
// ---------------------------------------------------------------------------
function digestEmail(upcoming: any[], lapsed: any[], warned: any[]) {
  const subject = upcoming.length
    ? `[Safety Lab] ${upcoming.length} expiring within 14 days`
    : `[Safety Lab] no expiries in the next 14 days`;

  const row = (r: any) => `
    <tr>
      <td style="padding:5px 12px 5px 0;"><strong>${escapeHtml(r.email)}</strong></td>
      <td style="padding:5px 12px 5px 0; color:#5A6B85;">${escapeHtml(r.scope)} · ${escapeHtml(r.plan)}</td>
      <td style="padding:5px 12px 5px 0;">${escapeHtml(humanDate(r.expires_on))}</td>
      <td style="padding:5px 0; ${r.days_left <= 3 ? 'color:#B03030; font-weight:600;' : 'color:#5A6B85;'}">
        ${r.days_left < 0 ? `${Math.abs(r.days_left)}d ago` : `${r.days_left}d`}
      </td>
    </tr>`;

  const table = (rows: any[], heading: string) => !rows.length ? '' : `
    <p style="margin:22px 0 6px; font-weight:600;">${heading}</p>
    <table style="border-collapse:collapse; width:100%; font-size:14px;">${rows.map(row).join('')}</table>`;

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size:14px; line-height:1.5; color:#16213A; max-width:640px;">
    <p style="font-size:17px; margin:0 0 4px;"><strong>Expiry watch</strong></p>
    <p style="margin:0 0 4px; color:#5A6B85;">Trials and licences. Expiry is a full lockout.</p>
    ${table(upcoming, 'Expiring within 14 days')}
    ${table(lapsed, 'Lapsed in the last 7 days')}
    ${warned.length ? `<p style="margin:22px 0 6px; font-weight:600;">Warned in this run</p>
      <ul style="margin:0; padding-left:18px; color:#5A6B85;">
        ${warned.map((w: any) => `<li>${escapeHtml(w.email)} — ${escapeHtml(w.stage)}${w.ok ? '' : ' <strong style="color:#B03030;">FAILED</strong>'}</li>`).join('')}
      </ul>` : `<p style="margin:22px 0 0; color:#5A6B85;">No user warnings were due in this run.</p>`}
    <p style="margin-top:26px; font-size:12px; color:#8494AB;">
      Extensions are manual — move <code>trial_ends_at</code> or <code>license_tokens.expires_at</code>.<br>
      Sent by the notify-expiry edge function.
    </p>
  </div>`;

  const line = (r: any) => `  ${r.email}  (${r.scope}/${r.plan})  ${r.expires_on}  ${r.days_left < 0 ? Math.abs(r.days_left) + 'd ago' : r.days_left + 'd'}`;
  const text =
    `Expiry watch — trials and licences. Expiry is a full lockout.\n\n` +
    (upcoming.length ? `Expiring within 14 days:\n${upcoming.map(line).join('\n')}\n\n` : `No expiries within 14 days.\n\n`) +
    (lapsed.length ? `Lapsed in the last 7 days:\n${lapsed.map(line).join('\n')}\n\n` : '') +
    (warned.length ? `Warned in this run:\n${warned.map((w: any) => `  ${w.email} — ${w.stage}${w.ok ? '' : ' FAILED'}`).join('\n')}\n\n` : `No user warnings were due in this run.\n\n`) +
    `Extensions are manual — move trial_ends_at or license_tokens.expires_at.\n`;

  return { subject, html, text };
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
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' });

  const auth = req.headers.get('authorization') ?? '';
  if (!_authorizedBySvc(auth)) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is a normal cron call */ }
  const dryRun = body?.dryRun === true;

  // ---- who is expiring ----------------------------------------------------
  const { data: watch, error: wErr } = await sb
    .from('expiry_watch')
    .select('scope,user_id,email,plan,expires_on,days_left,stage,dedupe_key')
    .order('days_left', { ascending: true });

  if (wErr) {
    console.error('[notify-expiry] expiry_watch read failed', wErr);
    return jsonResponse(500, { ok: false, error: wErr.message });
  }

  const all = watch ?? [];
  const upcoming = all.filter((r: any) => r.days_left >= 0 && r.days_left <= 14);
  const lapsed   = all.filter((r: any) => r.days_left < 0 && r.days_left >= -7);
  const due      = all.filter((r: any) => r.stage === 'T-3' || r.stage === 'T-1');

  // ---- user warnings ------------------------------------------------------
  const warned: any[] = [];
  const skipped: any[] = [];

  for (const r of due) {
    if (!SEND_USER_MAIL) { skipped.push({ ...r, why: 'SEND_EXPIRY_EMAIL=0' }); continue; }
    if (!dryRun && await alreadySent(r.dedupe_key)) { skipped.push({ ...r, why: 'already sent' }); continue; }

    const w = warningEmail({ scope: r.scope, daysLeft: r.days_left, endsOn: r.expires_on, stage: r.stage });

    if (dryRun) { warned.push({ email: r.email, stage: r.stage, subject: w.subject, ok: true, dryRun: true }); continue; }

    const send = await sendViaResend({ to: r.email, subject: w.subject, html: w.html, text: w.text, replyTo: ADMIN_EMAIL });
    await logNotification({
      kind: 'expiry',
      target_email: r.email,
      subject: w.subject,
      resend_id: send.id,
      status: send.ok ? 'sent' : 'failed',
      error: send.error,
      payload: { dedupe_key: r.dedupe_key, scope: r.scope, plan: r.plan, stage: r.stage, expires_on: r.expires_on, user_id: r.user_id },
    });
    warned.push({ email: r.email, stage: r.stage, subject: w.subject, ok: send.ok, error: send.error });
    if (!send.ok) console.error('[notify-expiry] warning send failed', r.email, send.error);
    await sleep(SEND_GAP_MS);
  }

  // ---- admin digest, once a day ------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const digestKey = `digest:${today}`;
  let digest: any = { skipped: true, why: 'already sent today' };

  if (dryRun || !(await alreadySent(digestKey))) {
    const d = digestEmail(upcoming, lapsed, warned);
    if (dryRun) {
      digest = { dryRun: true, subject: d.subject, to: ADMIN_EMAIL };
    } else {
      const send = await sendViaResend({ to: ADMIN_EMAIL, subject: d.subject, html: d.html, text: d.text });
      await logNotification({
        kind: 'expiry',
        target_email: ADMIN_EMAIL,
        subject: d.subject,
        resend_id: send.id,
        status: send.ok ? 'sent' : 'failed',
        error: send.error,
        payload: { dedupe_key: digestKey, kind: 'digest', upcoming: upcoming.length, lapsed: lapsed.length, warned: warned.length },
      });
      digest = { ok: send.ok, id: send.id, error: send.error };
    }
  }

  return jsonResponse(200, {
    ok: true,
    dryRun,
    counts: { watched: all.length, upcoming_14d: upcoming.length, lapsed_7d: lapsed.length, due_now: due.length, warned: warned.length, skipped: skipped.length },
    upcoming: upcoming.map((r: any) => ({ email: r.email, scope: r.scope, expires_on: r.expires_on, days_left: r.days_left })),
    warned,
    skipped,
    digest,
  });
});
