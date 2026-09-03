/**
 * notify-signup — Safety Lab Supabase Edge Function (Phase 55.0.9)
 * ============================================================================
 * Triggered by a Database Webhook on `auth.users` INSERT, and callable in
 * BACKFILL mode to replay a welcome to somebody who signed up while the webhook
 * was dead (2 Jun – 31 Jul 2026).
 *
 * What it does:
 *   1. Verifies the request carries a Bearer token.
 *   2. Extracts the new user's email + metadata.
 *   3. Sends a notification email to ADMIN_EMAIL via the Resend HTTP API
 *      (skipped in backfill mode — 23 notifications about people who joined
 *      weeks ago is noise, not signal).
 *   4. Sends a branded WELCOME email to the user, with a link to the
 *      "Welcome to Safety Lab Aero" walkthrough deck. The trial paragraph is
 *      chosen from the user's REAL trial state, so it never claims a date that
 *      has already passed.
 *   5. Inserts an audit row into public.notification_log for each send.
 *
 * ---------------------------------------------------------------------------
 * Why the welcome deck is a LINK and not an attachment
 * ---------------------------------------------------------------------------
 * The deck is ~17 MB as .pptx and ~15 MB as .pdf. Base64 inflates that by ~37%,
 * so attaching either would put a >20 MB payload through Resend on every signup.
 * That is over Gmail's 25 MB *received* budget once headers and the HTML part
 * are counted, it burns sending reputation, and many corporate gateways strip
 * or quarantine large Office attachments outright — which is exactly the
 * audience here. A link always arrives, can be updated without re-mailing
 * anyone, and lets us see nothing about who opened what.
 *
 * ---------------------------------------------------------------------------
 * Required environment variables (set via `supabase secrets set ...`):
 *   - RESEND_API_KEY         Resend API key, e.g. re_xxx
 *   - NOTIFY_FROM_EMAIL      Verified Resend sender on safetylabaero.com.
 *                            Resend's shared onboarding@resend.dev address only
 *                            delivers to the Resend account owner, so with that
 *                            set every customer email fails while the admin copy
 *                            keeps arriving — failure that looks like success.
 *   - ADMIN_EMAIL            Where admin notifications go
 *   - WELCOME_DECK_URL       (optional) overrides the deck link below
 *   - SEND_WELCOME_EMAIL     (optional) set to "0" to disable the welcome email
 *                            without redeploying
 *   - SUPABASE_URL           (auto-injected)
 *   - SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
 * ============================================================================
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const RESEND_API_KEY     = Deno.env.get('RESEND_API_KEY')     ?? '';
const NOTIFY_FROM_EMAIL  = Deno.env.get('NOTIFY_FROM_EMAIL')  ?? 'Safety Lab <onboarding@resend.dev>';
const ADMIN_EMAIL        = Deno.env.get('ADMIN_EMAIL')        ?? 'waqas.nafees@safetylabaero.com';
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')       ?? '';
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const WELCOME_DECK_URL   = Deno.env.get('WELCOME_DECK_URL')
  ?? 'https://updates.safetylabaero.com/docs/Welcome-to-Safety-Lab-Aero.pdf';
const WELCOME_DECK_PPTX  = 'https://updates.safetylabaero.com/docs/Welcome-to-Safety-Lab-Aero.pptx';
const SEND_WELCOME       = (Deno.env.get('SEND_WELCOME_EMAIL') ?? '1') !== '0';

const APP_URL   = 'https://safetylabaero.com/app';
const TRUST_URL = 'https://safetylabaero.com/trust';
// Served from the site's own origin (site/email-logo.png), so it ships with a
// normal deploy and needs no upload token or separate hosting.
const LOGO_URL  = 'https://safetylabaero.com/email-logo.png';

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

// ---------------------------------------------------------------------------
async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
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
      reply_to: opts.replyTo,
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
  status: 'sent' | 'failed';
  error?: string;
  payload?: any;
}) {
  try {
    await sb.from('notification_log').insert(row);
  } catch (e) {
    console.error('[notify-signup] notification_log insert failed', e);
  }
}

// ---------------------------------------------------------------------------
// The welcome email. Plain, short, one obvious next step. No tracking pixel, no
// click-wrapped links — this audience reads headers.
// ---------------------------------------------------------------------------
type TrialState = 'live' | 'expired' | 'none';

function welcomeEmail(trialEndsHuman: string, trial: TrialState, backfill: boolean) {
  const subject = backfill
    ? 'Your Safety Lab Aero walkthrough — sorry it is late'
    : 'Welcome to Safety Lab Aero — your walkthrough is inside';

  // The opener has to be honest about which of the two this is. Twenty of the
  // backfill recipients signed up in June and heard nothing, because the signup
  // webhook was 401'ing; pretending they just signed up reads badly.
  const openHtml = backfill
    ? 'You signed up to Safety Lab Aero a little while back and never got a proper introduction. That was a fault at our end, now fixed, and here is what you should have received on day one.'
    : 'Thanks for signing up to Safety Lab Aero.';
  const openText = openHtml;

  // The trial paragraph must match reality. Telling someone their trial runs
  // until a date six weeks in the past is worse than saying nothing.
  const trialHtml = trial === 'live'
    ? `Your account is on a free trial${trialEndsHuman ? ` until <strong>${escapeHtml(trialEndsHuman)}</strong>` : ''}. Everything is unlocked during the trial. If you need longer to evaluate, just reply to this email and ask.`
    : trial === 'expired'
      ? 'Your free trial has since ended, so the app is locked at the moment. Reply to this email if you would like to talk about getting back in.'
      : 'Your account is open — nothing to activate.';
  const trialText = trial === 'live'
    ? `Your account is on a free trial${trialEndsHuman ? ` until ${trialEndsHuman}` : ''}. Everything is unlocked\nduring the trial. If you need longer to evaluate, just reply to this email and ask.`
    : trial === 'expired'
      ? 'Your free trial has since ended, so the app is locked at the moment. Reply to this\nemail if you would like to talk about getting back in.'
      : 'Your account is open — nothing to activate.';

  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size:15px; line-height:1.55; color:#16213A; max-width:560px;">
    <!-- Branding. Remote images are blocked by default in most corporate mail
         clients, so the alt text has to carry the name on its own, and nothing
         below depends on the image loading. -->
    <p style="margin:0 0 22px;">
      <img src="${LOGO_URL}" width="280" height="60" alt="Safety Lab Aero"
           style="display:block; border:0; outline:none; text-decoration:none; font-family:inherit; font-size:19px; font-weight:700; color:#16213A;">
    </p>

    <p style="margin:0 0 16px;">${openHtml}</p>

    <p style="margin:0 0 16px;">
      Safety Lab is a complete ARP 4761A / 4754B workbench: aircraft functions through
      FHA, fault trees, common-cause analysis, requirements and verification — with every
      artifact linked, so changing one thing shows you everything downstream that just
      became questionable.
    </p>

    <p style="margin:0 0 16px;">
      To get oriented, here is a full walkthrough of the product. It covers all eleven
      stages, screen by screen, with a screenshot of each one, the controls to click
      highlighted, and every form field explained. It assumes no prior safety-engineering
      background.
    </p>

    <p style="margin:0 0 22px;">
      <a href="${WELCOME_DECK_URL}"
         style="display:inline-block; background:#0A63CC; color:#fff; text-decoration:none;
                padding:11px 20px; border-radius:6px; font-weight:600;">
        Open the walkthrough (PDF)
      </a>
      &nbsp;<a href="${WELCOME_DECK_PPTX}" style="color:#0A63CC; font-size:13px;">PowerPoint version</a>
    </p>

    <p style="margin:0 0 16px;">
      The fastest way to see it work is to open the app, then load the sample project from
      the <strong>Project</strong> menu — a fully worked K350 Kestrel programme you can click
      through without entering anything of your own.
    </p>

    <p style="margin:0 0 22px;">
      <a href="${APP_URL}" style="color:#0A63CC; font-weight:600;">Open Safety Lab &rarr;</a>
    </p>

    <p style="margin:0 0 16px; color:#5A6B85;">
      ${trialHtml}
    </p>

    <p style="margin:0 0 16px; color:#5A6B85;">
      Your data stays yours — how it is stored and what the AI features can and cannot touch
      is written up at <a href="${TRUST_URL}" style="color:#0A63CC;">safetylabaero.com/trust</a>.
    </p>

    <p style="margin:24px 0 0;">Waqas Nafees<br>
      <span style="color:#5A6B85;">Safety Lab Aero</span>
    </p>

    <div style="margin:30px 0 0; padding-top:16px; border-top:1px solid #E1E7F0; font-size:12px; line-height:1.6; color:#8494AB;">
      Safety Lab Aero — ARP 4761A / 4754B safety analysis, from aircraft function to signed evidence.<br>
      <a href="https://safetylabaero.com" style="color:#5A6B85; text-decoration:none;">safetylabaero.com</a>
      &nbsp;·&nbsp;
      <a href="${TRUST_URL}" style="color:#5A6B85; text-decoration:none;">Trust &amp; security</a>
      &nbsp;·&nbsp;
      <a href="https://safetylabaero.com/ai-guardrails" style="color:#5A6B85; text-decoration:none;">AI guardrails</a><br>
      You are receiving this because you created a Safety Lab Aero account.
    </div>
  </div>`;

  const text =
    openText + `\n\n` +
    `Safety Lab is a complete ARP 4761A / 4754B workbench: aircraft functions through FHA,\n` +
    `fault trees, common-cause analysis, requirements and verification — with every artifact\n` +
    `linked, so changing one thing shows you everything downstream that just became\n` +
    `questionable.\n\n` +
    `To get oriented, here is a full walkthrough of the product. It covers all eleven stages,\n` +
    `screen by screen, with a screenshot of each one, the controls to click highlighted, and\n` +
    `every form field explained. It assumes no prior safety-engineering background.\n\n` +
    `  PDF:        ${WELCOME_DECK_URL}\n` +
    `  PowerPoint: ${WELCOME_DECK_PPTX}\n\n` +
    `The fastest way to see it work is to open the app, then load the sample project from the\n` +
    `Project menu — a fully worked K350 Kestrel programme you can click through without\n` +
    `entering anything of your own.\n\n` +
    `  ${APP_URL}\n\n` +
    trialText + `\n\n` +
    `Your data stays yours — how it is stored and what the AI features can and cannot touch\n` +
    `is written up at ${TRUST_URL}\n\n` +
    `Waqas Nafees\nSafety Lab Aero\n\n` +
    `--\n` +
    `Safety Lab Aero — ARP 4761A / 4754B safety analysis, from aircraft function\n` +
    `to signed evidence.  https://safetylabaero.com\n` +
    `You are receiving this because you created a Safety Lab Aero account.\n`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' });
  }

  // Auth check. NOTE: this function is deployed with verify_jwt = true, so the
  // Supabase gateway has already rejected anything without a valid project JWT
  // before this line runs. Between 2 Jun and 31 Jul 2026 the auth.users INSERT
  // trigger was sending the raw WEBHOOK_SECRET as its bearer token instead of a
  // JWT; the gateway 401'd every one of them and 25 signups produced no
  // notification at all. The trigger now sends the service-role JWT.
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.length < 16) {
    console.warn('[notify-signup] unauthorized — header malformed:', auth.slice(0, 24));
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid json' });
  }

  // Backfill mode: replay a welcome to somebody who signed up while the webhook
  // was dead. Same email, delay acknowledged, and NO admin notification.
  const backfill = payload?.backfill === true;

  const record = payload?.record ?? payload?.new ?? {};
  const userId   = record.id ?? null;
  const email    = record.email ?? '(no email)';
  const provider = record.raw_app_meta_data?.provider ?? 'email';
  const createdAt = record.created_at ?? new Date().toISOString();
  const meta = record.raw_user_meta_data ?? {};

  const domain = (email.split('@')[1] || '').toLowerCase();
  const tier =
    email === 'mwnafees9@gmail.com' || domain === 'electra.aero'
      ? 'Pro+ (comped)'
      : '(free trial)';

  // -------------------------------------------------------------- admin copy
  const subject = `[Safety Lab] New signup: ${email}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #111; max-width: 560px;">
      <p style="font-size: 18px; margin: 0 0 12px;"><strong>New Safety Lab signup</strong></p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Email</td><td style="padding: 4px 0;"><strong>${escapeHtml(email)}</strong></td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Domain</td><td style="padding: 4px 0;">${escapeHtml(domain)}</td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Tier</td><td style="padding: 4px 0;">${escapeHtml(tier)}</td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Provider</td><td style="padding: 4px 0;">${escapeHtml(provider)}</td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">User ID</td><td style="padding: 4px 0;"><code>${escapeHtml(userId ?? '')}</code></td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Created</td><td style="padding: 4px 0;">${escapeHtml(createdAt)}</td></tr>
      </table>
      ${Object.keys(meta).length ? `<p style="margin: 16px 0 4px; color:#666;">User metadata</p>
      <pre style="background:#f6f8fa; padding: 10px; border-radius: 6px; font-size: 12px; overflow-x: auto;">${escapeHtml(JSON.stringify(meta, null, 2))}</pre>` : ''}
      <p style="margin-top: 24px; font-size: 12px; color: #999;">
        Sent by the notify-signup edge function.
      </p>
    </div>
  `;
  const text =
    `New Safety Lab signup\n\n` +
    `Email:    ${email}\nDomain:   ${domain}\nTier:     ${tier}\n` +
    `Provider: ${provider}\nUser ID:  ${userId}\nCreated:  ${createdAt}\n`;

  // Typed as the union so the narrowing below still holds in backfill mode.
  const send: { ok: true; id: string } | { ok: false; error: string } = backfill
    ? { ok: true, id: '(admin copy skipped — backfill)' }
    : await sendViaResend({ to: ADMIN_EMAIL, subject, html, text });

  if (!backfill) await logNotification({
    kind: 'signup',
    target_email: ADMIN_EMAIL,
    subject,
    resend_id: send.ok ? send.id : undefined,
    status: send.ok ? 'sent' : 'failed',
    error: send.ok ? undefined : send.error,
    payload: { user_id: userId, email, provider, domain, tier },
  });

  // ------------------------------------------------------------ welcome copy
  // Deliberately AFTER the admin notification and wrapped so that a failure to
  // reach the customer can never suppress the notification to Waqas. A dead
  // welcome email must be loud in notification_log, not silent.
  let welcome: any = { skipped: true };
  const emailLooksReal = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)
    && !email.endsWith('@safetylabaero.com');   // self-tests and internal addresses

  // Never mail a dead link. The deck lives in R2 behind a plain custom domain,
  // so a missing object is a real 404 rather than an SPA shell — but an error
  // page could still be a small 200, hence the size floor as well. This makes
  // the deploy order self-healing: if the function ships before the file is
  // uploaded, welcomes defer (loudly, in notification_log) instead of going out
  // with links that 404, and start working the moment the upload lands.
  let deckReachable = false;
  let deckBytes = 0;
  if (SEND_WELCOME && emailLooksReal) {
    try {
      const head = await fetch(WELCOME_DECK_URL, { method: 'HEAD' });
      deckBytes = parseInt(head.headers.get('content-length') || '0', 10);
      deckReachable = head.ok && deckBytes > 1_000_000;
    } catch (e) {
      console.error('[notify-signup] deck HEAD failed', e);
    }
    if (!deckReachable) {
      await logNotification({
        kind: backfill ? 'welcome-backfill' : 'welcome',
        target_email: email,
        subject: 'welcome DEFERRED — deck not reachable',
        status: 'failed',
        error: `deck HEAD ${WELCOME_DECK_URL} -> ${deckBytes} bytes; welcome not sent`,
        payload: { user_id: userId, deck: WELCOME_DECK_URL },
      });
      welcome = { ok: false, error: 'deck not reachable; welcome deferred' };
    }
  }

  if (SEND_WELCOME && emailLooksReal && deckReachable) {
    try {
      // The trial window is set by handle_new_user(); read it back rather than
      // recomputing the policy here, so the email can never claim a date the
      // paywall disagrees with.
      let trialEndsHuman = '';
      let trial: TrialState = 'none';
      try {
        const { data } = await sb.from('users').select('trial_ends_at').eq('id', userId).maybeSingle();
        if (data?.trial_ends_at) {
          const ends = new Date(data.trial_ends_at);
          trial = ends.getTime() > Date.now() ? 'live' : 'expired';
          trialEndsHuman = ends.toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          });
        }
      } catch (_) { /* no date read = no trial claim made */ }

      const w = welcomeEmail(trialEndsHuman, trial, backfill);
      const wSend = await sendViaResend({
        to: email,
        subject: w.subject,
        html: w.html,
        text: w.text,
        replyTo: ADMIN_EMAIL,
      });
      welcome = wSend;

      await logNotification({
        kind: backfill ? 'welcome-backfill' : 'welcome',
        target_email: email,
        subject: w.subject,
        resend_id: wSend.ok ? wSend.id : undefined,
        status: wSend.ok ? 'sent' : 'failed',
        error: wSend.ok ? undefined : wSend.error,
        payload: { user_id: userId, deck: WELCOME_DECK_URL, trial_ends: trialEndsHuman, trial, backfill },
      });

      if (!wSend.ok) console.error('[notify-signup] welcome send failed', wSend.error);
    } catch (e) {
      console.error('[notify-signup] welcome path threw', e);
      welcome = { ok: false, error: String(e) };
    }
  }

  if (!send.ok) {
    console.error('[notify-signup] admin send failed', send.error);
    return jsonResponse(500, { ok: false, error: send.error, welcome });
  }
  return jsonResponse(200, { ok: true, id: send.id, welcome });
});
