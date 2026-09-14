/**
 * notify-review — Safety Lab Supabase Edge Function
 * ============================================================================
 * Role-aware review notifications. Triggered by Database Webhooks on three tables:
 *
 *   1) INSERT on public.review_assignments
 *        -> emails the assigned teammate: "you've been asked to review/approve X"
 *   2) UPDATE on public.reviews (status change)
 *        -> emails the review PARTICIPANTS (requester + all assigned reviewers/approver)
 *           when status becomes changes_requested / approved / released / rejected
 *   3) INSERT on public.review_comments
 *        -> emails the workspace ANALYSTS (members who can edit: owner/admin/editor),
 *           excluding the comment's author
 *
 * Routing matrix (per product spec):
 *   sent-for-review / status change  -> reviewers + approver (+ requester)
 *   new comment                      -> analysts (editors)
 *
 * NOTE: "analyst" maps to a workspace member who can edit (owner/admin/editor).
 * Per-recipient engagement-level preferences are a separate task (#17) and will
 * filter this recipient list before sending once shipped.
 *
 * Env (already set for the other notify-* functions):
 *   RESEND_API_KEY, NOTIFY_FROM_EMAIL, ADMIN_EMAIL,
 *   SUPABASE_URL (auto), SUPABASE_SERVICE_ROLE_KEY (auto)
 * ============================================================================
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')    ?? '';
const NOTIFY_FROM_EMAIL = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'Safety Lab <onboarding@resend.dev>';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const APP_URL = 'https://safetylabaero.com/app';
const ANALYST_ROLES = ['owner', 'admin', 'editor'];

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendViaResend(opts: { to: string; replyTo?: string; subject: string; html: string; text?: string; }):
  Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: NOTIFY_FROM_EMAIL, to: [opts.to], reply_to: opts.replyTo, subject: opts.subject, html: opts.html, text: opts.text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.message || `Resend HTTP ${res.status}` };
  return { ok: true, id: body?.id ?? '' };
}

async function logNotification(row: any) {
  try { await sb.from('notification_log').insert(row); }
  catch (e) { console.error('[notify-review] notification_log insert failed', e); }
}

function emailShell(headline: string, rows: Array<[string, string]>, ctaLabel: string): string {
  const tableRows = rows.map(([k, v]) =>
    `<tr><td style="padding:4px 8px 4px 0; color:#666; width:130px;">${escapeHtml(k)}</td><td style="padding:4px 0;">${v}</td></tr>`).join('');
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; font-size:14px; color:#111; max-width:600px;">
      <p style="font-size:18px; margin:0 0 12px;"><strong>${escapeHtml(headline)}</strong></p>
      <table style="border-collapse:collapse; width:100%;">${tableRows}</table>
      <p style="margin:22px 0 0;"><a href="${APP_URL}" style="display:inline-block; background:#1144ee; color:#fff; text-decoration:none; padding:10px 18px; border-radius:6px; font-weight:600;">${escapeHtml(ctaLabel)}</a></p>
      <p style="margin-top:22px; font-size:12px; color:#999;">Sent by the Safety Lab review workflow.</p>
    </div>`;
}

// Map of user_id -> email for a set of ids.
async function emailsForIds(ids: Array<string | null | undefined>): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const uniq = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (!uniq.length) return map;
  const { data } = await sb.from('users').select('id, email').in('id', uniq);
  (data ?? []).forEach((u: any) => { if (u?.id && u?.email) map[u.id] = u.email; });
  return map;
}

// Send the same email to many recipients (deduped by email), logging each.
async function sendToMany(emails: string[], kind: string, subject: string, html: string, text: string, payload: any): Promise<number> {
  const seen = new Set<string>();
  const targets = emails.filter((e) => {
    if (!e) return false;
    const k = e.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  await Promise.all(targets.map(async (to) => {
    const send = await sendViaResend({ to, subject, html, text });
    await logNotification({
      kind, target_email: to, subject,
      resend_id: send.ok ? send.id : null,
      status: send.ok ? 'sent' : 'failed',
      error: send.ok ? null : send.error,
      payload,
    });
  }));
  return targets.length;
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
function _authorizedBySvc(authHeader: string): boolean {
  if (!SERVICE_ROLE_KEY) return false;                 // fail closed if the key is not injected
  const m = /^Bearer\s+(.+)$/.exec(authHeader ?? '');
  return !!m && _ctEq(m[1].trim(), SERVICE_ROLE_KEY);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' });
  const auth = req.headers.get('authorization') ?? '';
  if (!_authorizedBySvc(auth)) return jsonResponse(401, { error: 'unauthorized' });

  let payload: any;
  try { payload = await req.json(); } catch { return jsonResponse(400, { error: 'invalid json' }); }

  const type   = payload?.type ?? '';
  const table  = payload?.table ?? '';
  const record = payload?.record ?? payload?.new ?? {};
  const oldRec = payload?.old_record ?? payload?.old ?? {};

  // =========================================================================
  // CASE 1 — a teammate was assigned to a review
  // =========================================================================
  if (table === 'review_assignments' && type === 'INSERT') {
    const reviewId = record?.review_id ?? null;
    const assigneeId = record?.user_id ?? null;
    const roleAssigned = record?.role ?? 'reviewer';
    if (!reviewId || !assigneeId) return jsonResponse(200, { ok: true, skipped: 'missing ids' });

    const { data: review } = await sb.from('reviews').select('id, title, project_id, requested_by').eq('id', reviewId).maybeSingle();
    if (!review) return jsonResponse(200, { ok: true, skipped: 'review not found' });
    const [{ data: assignee }, { data: project }] = await Promise.all([
      sb.from('users').select('email').eq('id', assigneeId).maybeSingle(),
      sb.from('projects').select('name').eq('id', review.project_id).maybeSingle(),
    ]);
    const toEmail = assignee?.email ?? null;
    if (!toEmail) return jsonResponse(200, { ok: true, skipped: 'assignee has no email' });

    let requesterEmail: string | null = null;
    if (review.requested_by) {
      const { data: r } = await sb.from('users').select('email').eq('id', review.requested_by).maybeSingle();
      requesterEmail = r?.email ?? null;
    }
    const verb = roleAssigned === 'approver' ? 'approve' : 'review';
    const projectName = project?.name ?? '(project)';
    const subject = `[Safety Lab] You've been asked to ${verb}: ${review.title}`;
    const html = emailShell(`You've been asked to ${verb} a safety analysis`,
      [['Review', `<strong>${escapeHtml(review.title)}</strong>`], ['Project', escapeHtml(projectName)],
       ['Your role', escapeHtml(roleAssigned)], ['Requested by', escapeHtml(requesterEmail ?? '—')]],
      verb === 'approve' ? 'Open & approve' : 'Open & review');
    const text = `You've been asked to ${verb} a safety analysis on Safety Lab.\n\nReview: ${review.title}\nProject: ${projectName}\nRole: ${roleAssigned}\n\nOpen: ${APP_URL}\n`;
    const n = await sendToMany([toEmail], 'review_assigned', subject, html, text, { review_id: reviewId, role: roleAssigned });
    return jsonResponse(200, { ok: true, sent: n });
  }

  // =========================================================================
  // CASE 2 — review status changed → notify participants (reviewers + approver + requester)
  // =========================================================================
  if (table === 'reviews' && type === 'UPDATE') {
    const newStatus = record?.status ?? null;
    const oldStatus = oldRec?.status ?? null;
    if (!newStatus || newStatus === oldStatus) return jsonResponse(200, { ok: true, skipped: 'no status change' });
    const notifyOn = ['changes_requested', 'approved', 'released', 'rejected'];
    if (!notifyOn.includes(newStatus)) return jsonResponse(200, { ok: true, skipped: `status ${newStatus} not notified` });

    const reviewId = record?.id;
    const [{ data: assignments }, { data: project }] = await Promise.all([
      sb.from('review_assignments').select('user_id').eq('review_id', reviewId),
      sb.from('projects').select('name').eq('id', record.project_id).maybeSingle(),
    ]);
    const ids = (assignments ?? []).map((a: any) => a.user_id).concat([record.requested_by]);
    const emap = await emailsForIds(ids);
    const recipients = Object.values(emap);
    if (!recipients.length) return jsonResponse(200, { ok: true, skipped: 'no recipients' });

    const pretty: Record<string, string> = { changes_requested: 'Changes requested', approved: 'Approved', released: 'Released', rejected: 'Rejected' };
    const statusLabel = pretty[newStatus] ?? newStatus;
    const projectName = project?.name ?? '(project)';
    const subject = `[Safety Lab] Review ${statusLabel.toLowerCase()}: ${record.title}`;
    const html = emailShell(`Review is now: ${statusLabel}`,
      [['Review', `<strong>${escapeHtml(record.title)}</strong>`], ['Project', escapeHtml(projectName)],
       ['New status', `<strong>${escapeHtml(statusLabel)}</strong>`]], 'Open in Safety Lab');
    const text = `A review you're on is now: ${statusLabel}.\n\nReview: ${record.title}\nProject: ${projectName}\n\nOpen: ${APP_URL}\n`;
    const n = await sendToMany(recipients, 'review_status', subject, html, text, { review_id: reviewId, status: newStatus });
    return jsonResponse(200, { ok: true, sent: n });
  }

  // =========================================================================
  // CASE 3 — new comment → notify the workspace analysts (editors), minus the author
  // =========================================================================
  if (table === 'review_comments' && type === 'INSERT') {
    const reviewId = record?.review_id ?? null;
    const authorId = record?.author ?? null;
    if (!reviewId) return jsonResponse(200, { ok: true, skipped: 'missing review_id' });

    const { data: review } = await sb.from('reviews').select('id, title, project_id').eq('id', reviewId).maybeSingle();
    if (!review) return jsonResponse(200, { ok: true, skipped: 'review not found' });
    const { data: project } = await sb.from('projects').select('name, workspace_id').eq('id', review.project_id).maybeSingle();
    if (!project?.workspace_id) return jsonResponse(200, { ok: true, skipped: 'no workspace' });

    const { data: members } = await sb.from('workspace_members').select('user_id').eq('workspace_id', project.workspace_id).in('role', ANALYST_ROLES);
    const analystIds = (members ?? []).map((m: any) => m.user_id).filter((id: string) => id !== authorId);
    const emap = await emailsForIds(analystIds);
    let authorEmail: string | null = null;
    if (authorId) { const { data: a } = await sb.from('users').select('email').eq('id', authorId).maybeSingle(); authorEmail = a?.email ?? null; }
    const recipients = Object.values(emap).filter((e) => !authorEmail || e.toLowerCase() !== authorEmail.toLowerCase());
    if (!recipients.length) return jsonResponse(200, { ok: true, skipped: 'no analyst recipients' });

    const projectName = project?.name ?? '(project)';
    const snippet = String(record?.body ?? '').slice(0, 240);
    const subject = `[Safety Lab] New comment on review: ${review.title}`;
    const html = emailShell('New comment on a review',
      [['Review', `<strong>${escapeHtml(review.title)}</strong>`], ['Project', escapeHtml(projectName)],
       ['From', escapeHtml(authorEmail ?? '—')], ['Comment', escapeHtml(snippet)]], 'Open the review');
    const text = `New comment on "${review.title}" (${projectName}) from ${authorEmail ?? 'a teammate'}:\n\n${snippet}\n\nOpen: ${APP_URL}\n`;
    const n = await sendToMany(recipients, 'review_comment', subject, html, text, { review_id: reviewId });
    return jsonResponse(200, { ok: true, sent: n });
  }

  return jsonResponse(200, { ok: true, skipped: `unhandled ${type} on ${table}` });
});
