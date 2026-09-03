/**
 * stripe-webhook — Safety Lab Supabase Edge Function (Phase 55.0.6 + SEC-4)
 * ============================================================================
 * Listens for Stripe subscription events and mints / updates / expires
 * license_tokens rows accordingly.
 *
 * Handles:
 *   - checkout.session.completed                → mint or refresh license_tokens
 *   - customer.subscription.created             → mint or refresh
 *   - customer.subscription.updated             → refresh (plan changes)
 *   - customer.subscription.deleted             → set expires_at = now()
 *
 * Stripe sends events in random order; all handlers are idempotent.
 *
 * Auth: Stripe HMAC-SHA256 signature verified against STRIPE_WEBHOOK_SECRET,
 * with a 5-minute timestamp tolerance (SEC-4) so captured events cannot be replayed.
 * ============================================================================
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const STRIPE_API_KEY        = Deno.env.get('STRIPE_API_KEY')        ?? '';
const PRO_PLUS_PRICE_ID     = Deno.env.get('PRO_PLUS_PRICE_ID')     ?? '';
const ENTERPRISE_PRICE_ID   = Deno.env.get('ENTERPRISE_PRICE_ID')   ?? '';
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')          ?? '';
const SERVICE_ROLE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const PRO_PLUS_ALLOWANCE    = 2_000_000;   // tokens / month (Sonnet-equivalent)
const ENTERPRISE_ALLOWANCE  = 10_000_000;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ----- helpers ---------------------------------------------------------------

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyStripeSignature(payload: string, sigHeader: string | null, secret: string): Promise<boolean> {
  if (!sigHeader || !secret) return false;
  // Stripe format: "t=<ts>,v1=<sig>,v0=<...>"
  const parts = sigHeader.split(',').reduce<Record<string, string>>((acc, p) => {
    const idx = p.indexOf('=');
    if (idx > 0) acc[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
    return acc;
  }, {});
  const ts = parts.t;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  // SEC-4 — replay defense: reject events outside Stripe's recommended 5-minute
  // tolerance window. A captured valid webhook can no longer be replayed later.
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${payload}`));
  return timingSafeEqual(hexEncode(sig), v1);
}

function genToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return hexEncode(buf.buffer);
}

async function stripeGet(path: string): Promise<any | null> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { authorization: `Bearer ${STRIPE_API_KEY}` },
  });
  if (!res.ok) {
    console.warn('[stripe-webhook] stripe GET', path, res.status);
    return null;
  }
  return await res.json();
}

function priceIdToPlan(priceId: string): 'pro-plus' | 'enterprise' | null {
  if (priceId === PRO_PLUS_PRICE_ID)   return 'pro-plus';
  if (priceId === ENTERPRISE_PRICE_ID) return 'enterprise';
  return null;
}

function allowanceFor(plan: 'pro-plus' | 'enterprise'): number {
  return plan === 'enterprise' ? ENTERPRISE_ALLOWANCE : PRO_PLUS_ALLOWANCE;
}

async function emailToUserId(email: string): Promise<string | null> {
  const norm = email.trim().toLowerCase();
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const users = (data as any)?.users ?? [];
    const hit = users.find((u: any) => (u.email || '').toLowerCase() === norm);
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  return null;
}

async function upsertLicense(userId: string, plan: 'pro-plus' | 'enterprise'): Promise<{ token: string; created: boolean }> {
  const allowance = allowanceFor(plan);
  const { data: existing } = await sb
    .from('license_tokens')
    .select('token')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.token) {
    const { error } = await sb
      .from('license_tokens')
      .update({ plan, monthly_allowance: allowance, expires_at: null })
      .eq('user_id', userId);
    if (error) throw error;
    return { token: existing.token, created: false };
  }

  const token = genToken();
  const { error } = await sb.from('license_tokens').insert({
    token,
    user_id: userId,
    plan,
    monthly_allowance: allowance,
    tokens_used_this_month: 0,
    reset_month: new Date().toISOString().slice(0, 7),
  });
  if (error) throw error;
  return { token, created: true };
}

async function expireLicense(userId: string): Promise<void> {
  await sb
    .from('license_tokens')
    .update({ expires_at: new Date().toISOString() })
    .eq('user_id', userId);
}

// ----- event handlers --------------------------------------------------------

async function handleSubscriptionLike(subscription: any): Promise<Response> {
  const priceId = subscription?.items?.data?.[0]?.price?.id;
  if (!priceId) return jsonResponse(200, { ok: true, skipped: 'no_price' });

  const plan = priceIdToPlan(priceId);
  if (!plan) {
    console.log('[stripe-webhook] unknown price_id, skipping:', priceId);
    return jsonResponse(200, { ok: true, skipped: 'unknown_price', priceId });
  }

  const customer = await stripeGet(`/v1/customers/${subscription.customer}`);
  if (!customer?.email) return jsonResponse(200, { ok: true, skipped: 'no_customer_email' });

  const userId = await emailToUserId(customer.email);
  if (!userId) {
    console.log('[stripe-webhook] no user for email:', customer.email);
    return jsonResponse(200, { ok: true, skipped: 'no_user_for_email', email: customer.email });
  }

  const { created } = await upsertLicense(userId, plan);
  return jsonResponse(200, { ok: true, plan, userId, minted: created });
}

async function handleCheckoutCompleted(session: any): Promise<Response> {
  if (!session?.subscription) return jsonResponse(200, { ok: true, skipped: 'no_subscription' });
  const subscription = await stripeGet(`/v1/subscriptions/${session.subscription}`);
  if (!subscription) return jsonResponse(200, { ok: true, skipped: 'subscription_fetch_failed' });
  return handleSubscriptionLike(subscription);
}

async function handleSubscriptionDeleted(subscription: any): Promise<Response> {
  const customer = await stripeGet(`/v1/customers/${subscription.customer}`);
  if (!customer?.email) return jsonResponse(200, { ok: true, skipped: 'no_customer_email' });
  const userId = await emailToUserId(customer.email);
  if (!userId) return jsonResponse(200, { ok: true, skipped: 'no_user_for_email' });
  await expireLicense(userId);
  return jsonResponse(200, { ok: true, expired: true, userId });
}

// ----- entrypoint ------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' });

  const sigHeader = req.headers.get('stripe-signature');
  const payload = await req.text();

  const ok = await verifyStripeSignature(payload, sigHeader, STRIPE_WEBHOOK_SECRET);
  if (!ok) {
    console.warn('[stripe-webhook] signature verification failed');
    return jsonResponse(401, { error: 'invalid_signature' });
  }

  let event: any;
  try { event = JSON.parse(payload); }
  catch (_) { return jsonResponse(400, { error: 'invalid_json' }); }

  console.log('[stripe-webhook] event:', event.type, event.id);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        return await handleCheckoutCompleted(event.data.object);
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        return await handleSubscriptionLike(event.data.object);
      case 'customer.subscription.deleted':
        return await handleSubscriptionDeleted(event.data.object);
      default:
        return jsonResponse(200, { ok: true, ignored: event.type });
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error:', e);
    return jsonResponse(500, { error: String(e) });
  }
});
