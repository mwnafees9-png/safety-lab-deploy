/**
 * notify-invite — Safety Lab Supabase Edge Function (31 Aug 2026)
 * ============================================================================
 * Sends a workspace invitation email. Called by inviteWorkspaceMember() after
 * the invitations row is inserted.
 *
 * ---------------------------------------------------------------------------
 * TWO DEFECTS FOUND BY RUNNING IT, NOT BY READING IT. Both are recorded because
 * each produced a symptom that pointed somewhere else entirely.
 *
 * [v1 -> v2] NO CORS, SO IT NEVER RAN. The browser calls this cross-origin
 *   (safetylabaero.com -> *.supabase.co) and issues an OPTIONS preflight first.
 *   v1 answered that with 405 and carried no Access-Control-Allow-Origin on any
 *   response, so the request died in the browser before reaching a line of this
 *   code. supabase-js reports that as "Failed to send a request to the Edge
 *   Function", which reads like a missing function and sent us auditing RLS and
 *   grants that were correct all along. Live symptom: invitations rows created,
 *   zero emails, and NOTHING in notification_log — the log write is inside this
 *   function, so a preflight failure leaves no trace anywhere.
 *
 * [v2 -> v3] SUPABASE_ANON_KEY IS NOT INJECTED IN THIS PROJECT. v2 built the
 *   caller-scoped client with `Deno.env.get('SUPABASE_ANON_KEY') ?? ''`, so it
 *   was constructed with an empty key, getUser() failed, and the function
 *   returned its own 401 — indistinguishable at the client from the gateway
 *   rejecting the JWT. The anon key was never needed: the service-role client
 *   can validate a JWT directly with auth.getUser(token). The membership check
 *   below is then done explicitly rather than leaning on RLS, which is why it
 *   filters on BOTH the workspace and the caller's own id.
 * ---------------------------------------------------------------------------
 * SECURITY. verify_jwt = true, so the gateway rejects anything without a valid
 * project JWT. That is not sufficient alone: any signed-in user could otherwise
 * post someone else's invitation_id and make us mail a stranger on their
 * behalf. So the caller's identity is resolved from their own token and
 * re-checked against that workspace — only owner/admin may trigger a send. The
 * invitation is read with the service role because the token column must never
 * travel to a browser.
 *
 * The accept link carries the token. That is unavoidable — it is how an invitee
 * with no membership yet proves the invitation is theirs — which is exactly why
 * public.accept_invitation() also requires the signed-in email to match the
 * invited address. A leaked link alone is not access.
 * ============================================================================
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')    ?? '';
const NOTIFY_FROM_EMAIL = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'Safety Lab <onboarding@resend.dev>';
const ADMIN_EMAIL       = Deno.env.get('ADMIN_EMAIL')       ?? 'waqas.nafees@safetylabaero.com';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_BASE_URL      = Deno.env.get('APP_BASE_URL')      ?? 'https://safetylabaero.com/app';
const LOGO_URL          = 'https://safetylabaero.com/email-logo.png';
const TRUST_URL         = 'https://safetylabaero.com/trust';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

function escapeHtml(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendViaResend(opts: { to: string; subject: string; html: string; text?: string; replyTo?: string }) {
  if (!RESEND_API_KEY) return { ok: false as const, error: 'RESEND_API_KEY not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: NOTIFY_FROM_EMAIL, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text, reply_to: opts.replyTo }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: body?.message || `Resend HTTP ${res.status}` };
  return { ok: true as const, id: body?.id ?? '' };
}

async function logNotification(row: any) {
  try { await admin.from('notification_log').insert(row); }
  catch (e) { console.error('[notify-invite] notification_log insert failed', e); }
}

const ROLE_BLURB: Record<string, string> = {
  admin:    'You will be an admin — full access, and you can invite others.',
  editor:   'You will be an editor — you can create and change analyses.',
  reviewer: 'You will be a reviewer — you can read everything and sign off on reviews.',
  viewer:   'You will be a viewer — read-only access.',
};

function inviteEmail(o: { workspace: string; role: string; inviter: string; link: string; expires: string }) {
  const subject = `${o.inviter} invited you to the ${o.workspace} workspace on Safety Lab Aero`;
  const roleLine = ROLE_BLURB[o.role] ?? `Your role will be ${escapeHtml(o.role)}.`;
  const html = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size:15px; line-height:1.55; color:#16213A; max-width:560px;">
    <p style="margin:0 0 22px;">
      <img src="${LOGO_URL}" width="280" height="60" alt="Safety Lab Aero"
           style="display:block; border:0; outline:none; text-decoration:none; font-family:inherit; font-size:19px; font-weight:700; color:#16213A;">
    </p>
    <p style="margin:0 0 16px;"><strong>${escapeHtml(o.inviter)}</strong> has invited you to join the
       <strong>${escapeHtml(o.workspace)}</strong> workspace on Safety Lab Aero.</p>
    <p style="margin:0 0 16px;">Safety Lab is an ARP 4761A / 4754B safety workbench — aircraft functions through FHA,
       fault trees, common-cause analysis, requirements and verification, with every artifact linked.</p>
    <p style="margin:0 0 16px; color:#5A6B85;">${roleLine}</p>
    <p style="margin:0 0 22px;">
      <a href="${o.link}" style="display:inline-block; background:#0A63CC; color:#fff; text-decoration:none;
                padding:11px 20px; border-radius:6px; font-weight:600;">Accept the invitation</a>
    </p>
    <p style="margin:0 0 16px; color:#5A6B85; font-size:13px;">
      Sign in with <strong>this email address</strong> to accept — the invitation is issued to you personally and
      will not work from another account. The link expires on ${escapeHtml(o.expires)}.
    </p>
    <p style="margin:0 0 16px; color:#8494AB; font-size:12px;">If you were not expecting this, you can ignore it — nothing happens until you accept.</p>
    <p style="margin:24px 0 0;">Safety Lab Aero</p>
    <div style="margin:30px 0 0; padding-top:16px; border-top:1px solid #E1E7F0; font-size:12px; line-height:1.6; color:#8494AB;">
      <a href="https://safetylabaero.com" style="color:#5A6B85; text-decoration:none;">safetylabaero.com</a>
      &nbsp;·&nbsp;<a href="${TRUST_URL}" style="color:#5A6B85; text-decoration:none;">Trust &amp; security</a><br>
      You are receiving this because someone invited you to a Safety Lab Aero workspace.
    </div>
  </div>`;
  const text =
    `${o.inviter} has invited you to join the ${o.workspace} workspace on Safety Lab Aero.\n\n` +
    `Accept the invitation:\n  ${o.link}\n\n` +
    `Sign in with THIS email address to accept — the invitation is issued to you personally and will\n` +
    `not work from another account. The link expires on ${o.expires}.\n\n` +
    `If you were not expecting this, you can ignore it — nothing happens until you accept.\n\n` +
    `Safety Lab Aero — https://safetylabaero.com\n`;
  return { subject, html, text };
}

Deno.serve(async (req: Request) => {
  // THE PREFLIGHT. Without this the browser never sends the POST at all (v1 defect).
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' });

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse(401, { error: 'missing bearer token' });
  const jwt = auth.slice(7).trim();

  let payload: any;
  try { payload = await req.json(); } catch { return jsonResponse(400, { error: 'invalid json' }); }
  const invitationId = payload?.invitation_id;
  if (!invitationId) return jsonResponse(400, { error: 'invitation_id required' });

  // ---- who is calling. Validated with the SERVICE-ROLE client against the
  // caller's own token: no anon key needed (the v2 defect), and the identity
  // still comes from the JWT rather than from anything the caller sent us.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const callerId = userData?.user?.id;
  const callerEmail = userData?.user?.email ?? '';
  if (userErr || !callerId) return jsonResponse(401, { error: 'could not resolve caller from token: ' + (userErr?.message ?? 'no user') });

  // ---- the invitation (service role: the token must not reach a browser) --
  const { data: inv, error: invErr } = await admin
    .from('invitations')
    .select('id, workspace_id, email, role, token, expires_at, accepted_at')
    .eq('id', invitationId)
    .maybeSingle();
  if (invErr || !inv) return jsonResponse(404, { error: 'invitation not found' });
  if (inv.accepted_at) return jsonResponse(409, { error: 'invitation already accepted' });

  // ---- the caller must actually administer THAT workspace -----------------
  // Explicit, because this client is service-role and RLS is not doing it for
  // us: filter on the workspace AND the caller's own id, then check the role.
  const { data: mem } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', inv.workspace_id)
    .eq('user_id', callerId)
    .maybeSingle();
  if (!mem || !['owner', 'admin'].includes(String(mem.role))) {
    return jsonResponse(403, { error: 'only a workspace owner or admin can send invitations' });
  }

  const { data: ws } = await admin.from('workspaces').select('name').eq('id', inv.workspace_id).maybeSingle();
  const workspace = ws?.name || 'a workspace';
  const link = `${APP_BASE_URL}/?invite=${encodeURIComponent(inv.token)}`;
  const expires = new Date(inv.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const mail = inviteEmail({ workspace, role: String(inv.role), inviter: callerEmail || 'A colleague', link, expires });
  const send = await sendViaResend({ to: inv.email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: callerEmail || ADMIN_EMAIL });

  await logNotification({
    kind: 'invite',
    target_email: inv.email,
    subject: mail.subject,
    resend_id: send.ok ? send.id : undefined,
    status: send.ok ? 'sent' : 'failed',
    error: send.ok ? undefined : send.error,
    payload: { invitation_id: inv.id, workspace_id: inv.workspace_id, workspace, role: inv.role, invited_by: callerId },
  });

  if (!send.ok) {
    console.error('[notify-invite] send failed', send.error);
    return jsonResponse(502, { ok: false, error: send.error });
  }
  return jsonResponse(200, { ok: true, id: send.id, to: inv.email });
});
