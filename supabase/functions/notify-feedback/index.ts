/**
 * notify-feedback — Safety Lab Supabase Edge Function (Phase 55.0.7)
 * ============================================================================
 * Called by the in-app Feedback button. The browser POSTs:
 *
 *   POST /functions/v1/notify-feedback
 *   Authorization: Bearer <user_jwt>           ← Supabase session access token
 *   Content-Type: application/json
 *   {
 *     "category":     "general" | "bug" | "feature" | "praise" | "other",
 *     "rating":       1 | 2 | 3 | 4 | 5 | null,
 *     "message":      "...",
 *     "source_url":   "https://safetylabaero.com/...",
 *     "user_agent":   "...",
 *     "build_id":     "p55.0-...",
 *     "context_json": { ... }            ← optional, e.g. active tab, project id
 *   }
 *
 * What it does:
 *   1. Verifies the caller's JWT via the Supabase client.
 *   2. Inserts the feedback into public.feedback.
 *   3. Sends an email notification to ADMIN_EMAIL via Resend.
 *   4. Logs the notification to public.notification_log.
 *   5. Rate-limits to 10 submissions per user per hour.
 *
 * Environment variables (same set as notify-signup):
 *   RESEND_API_KEY, NOTIFY_FROM_EMAIL, ADMIN_EMAIL,
 *   SUPABASE_URL (auto), SUPABASE_SERVICE_ROLE_KEY (auto),
 *   SUPABASE_ANON_KEY (auto)
 * ============================================================================
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')    ?? '';
const NOTIFY_FROM_EMAIL = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'Safety Lab <onboarding@resend.dev>';
const ADMIN_EMAIL       = Deno.env.get('ADMIN_EMAIL')       ?? 'waqas.nafees@safetylabaero.com';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const RATE_LIMIT_PER_HOUR = 10;

// service-role client for DB writes and authoritative reads
const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// CORS headers — the in-browser Feedback button calls this directly
const CORS = {
  'access-control-allow-origin':  '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: any, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...extra },
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
  replyTo?: string;
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
      reply_to: opts.replyTo,
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

// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method not allowed' });
  }

  // ----- Auth: verify caller JWT -----
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'missing bearer token' });
  }
  const accessToken = auth.slice('Bearer '.length);

  // Verify the token by asking Supabase Auth who it belongs to.
  const sbAsUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes, error: userErr } = await sbAsUser.auth.getUser();
  if (userErr || !userRes?.user) {
    return jsonResponse(401, { error: 'invalid token' });
  }
  const user = userRes.user;
  const userId = user.id;
  const userEmail = user.email ?? null;

  // ----- Rate limit -----
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: rateErr } = await sbAdmin
    .from('feedback')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sinceIso);
  if (!rateErr && (recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return jsonResponse(429, {
      error: `rate limit: max ${RATE_LIMIT_PER_HOUR} feedback per hour per user`,
    });
  }

  // ----- Parse + validate body -----
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'invalid json' });
  }
  const category = String(body?.category ?? 'general').toLowerCase();
  const allowedCats = ['general', 'bug', 'feature', 'praise', 'other'];
  if (!allowedCats.includes(category)) {
    return jsonResponse(400, { error: `category must be one of ${allowedCats.join(', ')}` });
  }
  const rating = body?.rating == null ? null : Math.max(1, Math.min(5, Math.round(Number(body.rating))));
  const message = String(body?.message ?? '').trim();
  if (!message) {
    return jsonResponse(400, { error: 'message is required' });
  }
  if (message.length > 8000) {
    return jsonResponse(400, { error: 'message too long (max 8000 chars)' });
  }
  const sourceUrl   = body?.source_url   ? String(body.source_url).slice(0, 1024) : null;
  const userAgent   = body?.user_agent   ? String(body.user_agent).slice(0, 1024) : null;
  const buildId     = body?.build_id     ? String(body.build_id).slice(0, 256)    : null;
  const workspaceId = body?.workspace_id || null;
  const projectId   = body?.project_id   || null;
  let contextJson: any = null;
  try {
    if (body?.context_json && typeof body.context_json === 'object') {
      contextJson = body.context_json;
    }
  } catch { /* ignore */ }

  // ----- Insert into feedback -----
  const { data: feedbackRow, error: insertErr } = await sbAdmin
    .from('feedback')
    .insert({
      user_id:      userId,
      user_email:   userEmail,
      workspace_id: workspaceId,
      project_id:   projectId,
      category,
      rating,
      message,
      source_url:   sourceUrl,
      user_agent:   userAgent,
      build_id:     buildId,
      context_json: contextJson,
    })
    .select('id, created_at')
    .single();

  if (insertErr || !feedbackRow) {
    console.error('[notify-feedback] insert failed', insertErr);
    return jsonResponse(500, { error: 'database insert failed', detail: insertErr?.message });
  }

  // ----- Build + send email -----
  const subject = `[Safety Lab feedback] ${category}${rating != null ? ' · ' + rating + '/5' : ''} — ${userEmail ?? userId}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #111; max-width: 640px;">
      <p style="font-size: 18px; margin: 0 0 12px;"><strong>New feedback from Safety Lab</strong></p>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 4px 8px 4px 0; color:#666; width:120px;">From</td><td style="padding: 4px 0;"><strong>${escapeHtml(userEmail ?? '(no email)')}</strong></td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">User ID</td><td style="padding: 4px 0;"><code>${escapeHtml(userId)}</code></td></tr>
        <tr><td style="padding: 4px 8px 4px 0; color:#666;">Category</td><td style="padding: 4px 0;"><strong>${escapeHtml(category)}</strong></td></tr>
        ${rating != null ? `<tr><td style="padding: 4px 8px 4px 0; color:#666;">Rating</td><td style="padding: 4px 0;">${rating}/5</td></tr>` : ''}
        ${sourceUrl ? `<tr><td style="padding: 4px 8px 4px 0; color:#666;">URL</td><td style="padding: 4px 0;"><a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a></td></tr>` : ''}
        ${buildId ? `<tr><td style="padding: 4px 8px 4px 0; color:#666;">Build</td><td style="padding: 4px 0;"><code>${escapeHtml(buildId)}</code></td></tr>` : ''}
        ${userAgent ? `<tr><td style="padding: 4px 8px 4px 0; color:#666;">UA</td><td style="padding: 4px 0; font-size: 12px;">${escapeHtml(userAgent)}</td></tr>` : ''}
      </table>
      <p style="margin: 16px 0 4px; color:#666;">Message</p>
      <pre style="background:#f6f8fa; padding: 12px; border-radius: 6px; font-size: 13px; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(message)}</pre>
      ${contextJson ? `<p style="margin: 16px 0 4px; color:#666;">Context</p>
      <pre style="background:#f6f8fa; padding: 10px; border-radius: 6px; font-size: 12px; overflow-x: auto;">${escapeHtml(JSON.stringify(contextJson, null, 2))}</pre>` : ''}
      <p style="margin-top: 24px; font-size: 12px; color: #999;">
        Feedback ID: <code>${escapeHtml(feedbackRow.id)}</code> · ${escapeHtml(feedbackRow.created_at)}
        <br/>Reply directly to this email — it will go to the user.
      </p>
    </div>
  `;
  const text =
    `Safety Lab feedback\n\n` +
    `From:     ${userEmail}\n` +
    `Category: ${category}\n` +
    (rating != null ? `Rating:   ${rating}/5\n` : '') +
    (sourceUrl ? `URL:      ${sourceUrl}\n` : '') +
    (buildId ? `Build:    ${buildId}\n` : '') +
    `\nMessage:\n${message}\n`;

  const send = await sendViaResend({
    to: ADMIN_EMAIL,
    replyTo: userEmail ?? undefined,
    subject,
    html,
    text,
  });

  await sbAdmin.from('notification_log').insert({
    kind: 'feedback',
    target_email: ADMIN_EMAIL,
    subject,
    resend_id: send.ok ? send.id : null,
    status: send.ok ? 'sent' : 'failed',
    error: send.ok ? null : send.error,
    payload: { feedback_id: feedbackRow.id, user_id: userId, category, rating },
  });

  if (!send.ok) {
    // The DB row is already inserted, so return success but flag the email failure.
    console.error('[notify-feedback] email send failed', send.error);
    return jsonResponse(200, {
      ok: true,
      feedback_id: feedbackRow.id,
      email_status: 'failed',
      email_error: send.error,
    });
  }

  return jsonResponse(200, {
    ok: true,
    feedback_id: feedbackRow.id,
    email_status: 'sent',
  });
});
