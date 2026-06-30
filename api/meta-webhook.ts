// Vercel Edge function — receives Meta webhook events and patches Supabase
// status rows in real time.
//
// ┌─ IMPORTANT: deployment status ────────────────────────────────────────┐
// │ This endpoint is SCAFFOLDED but currently not subscribed.             │
// │                                                                       │
// │ Meta webhooks are bound to a Meta App. Banner Pro pushes campaigns    │
// │ via Pipeboard's Meta App — so Meta sends ad-account-level events to   │
// │ Pipeboard's webhook URL, NOT to us. Three ways to flip this on:       │
// │                                                                       │
// │  A. Pipeboard adds webhook forwarding to Banner Pro (ask their team)  │
// │  B. User registers their own Meta Marketing App (Dev tier is enough   │
// │     for read events) and configures it to POST here                   │
// │  C. We deploy a tiny Cloudflare Worker that proxies Pipeboard's       │
// │     webhook → here (only works if Pipeboard exposes their webhook)    │
// │                                                                       │
// │ Until one of those lands, this endpoint will only receive events from │
// │ whatever app the user manually wires up. Keep the handler defensive.  │
// └──────────────────────────────────────────────────────────────────────┘
//
// Setup steps (when ready):
//   1. Set env META_WEBHOOK_VERIFY_TOKEN in Vercel to a random string.
//   2. In Meta Developer Console → App → Webhooks → Add subscription:
//        Callback URL: https://<your-domain>/api/meta-webhook
//        Verify token: <same random string>
//        Fields to subscribe: campaign / adset / ad (object=ad_account)
//   3. Meta will GET this URL with hub.challenge — we echo it back to verify.
//   4. Subsequent POSTs from Meta land here; we patch Supabase.

export const config = { runtime: 'edge' };

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || '';

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// ─── Meta webhook verification (one-time when subscribing) ─────────────
async function handleVerification(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode      = url.searchParams.get('hub.mode');
  const token     = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (!VERIFY_TOKEN) {
    return text('META_WEBHOOK_VERIFY_TOKEN not set on server', 500);
  }
  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return text(challenge, 200);
  }
  return text('forbidden', 403);
}

// ─── Status field mapping ──────────────────────────────────────────────
function mapMetaStatus(s: string | undefined): 'active' | 'paused' | 'archived' | undefined {
  if (!s) return undefined;
  const u = String(s).toUpperCase();
  if (u === 'ACTIVE')               return 'active';
  if (u === 'PAUSED')               return 'paused';
  if (u === 'ARCHIVED' || u === 'DELETED') return 'archived';
  return undefined;
}

async function supaPatchByMetaId(
  table: string,
  metaIdField: 'meta_campaign_id' | 'meta_ad_set_id' | 'meta_ad_id',
  metaId: string,
  patch: any,
): Promise<void> {
  const supaUrl = process.env.SUPABASE_URL!;
  const supaSrv = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
  if (!supaUrl || !supaSrv) return;
  await fetch(`${supaUrl}/rest/v1/${table}?${metaIdField}=eq.${metaId}`, {
    method: 'PATCH',
    headers: {
      apikey: supaSrv,
      Authorization: `Bearer ${supaSrv}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

// ─── Event handler ─────────────────────────────────────────────────────
//
// Meta payload shape for ad-account changes is roughly:
//   { object: 'ad_account',
//     entry: [{ id: '<account_id>', changes: [{ field, value }] }] }
//
// The actual `value` payload varies per `field`. For status changes the
// useful fields are usually `campaign` / `adset` / `ad` with `value.id` +
// `value.status`/`value.effective_status`. Be lenient.
async function handleEvent(body: any): Promise<{ touched: number; events: number }> {
  let touched = 0;
  let events = 0;
  const entries: any[] = Array.isArray(body?.entry) ? body.entry : [];
  for (const e of entries) {
    const changes: any[] = Array.isArray(e?.changes) ? e.changes : [];
    for (const ch of changes) {
      events++;
      const field = ch.field;
      const val = ch.value || {};
      const status = mapMetaStatus(val.status || val.effective_status);
      if (!status) continue;
      const metaId = String(val.id || val[`${field}_id`] || '');
      if (!metaId) continue;

      if (field === 'campaign') {
        await supaPatchByMetaId('ad_campaigns', 'meta_campaign_id', metaId, {
          status,
          updated_at: new Date().toISOString(),
        });
        touched++;
      } else if (field === 'adset' || field === 'ad_set') {
        await supaPatchByMetaId('ad_sets', 'meta_ad_set_id', metaId, {
          status,
          updated_at: new Date().toISOString(),
        });
        touched++;
      } else if (field === 'ad') {
        // Creatives store the ad id in meta_ad_id. Only flip status if Meta
        // says paused/archived — keeps the extended creative lifecycle
        // ('pushed' etc) intact when Meta still says ACTIVE.
        await supaPatchByMetaId('ad_creatives', 'meta_ad_id', metaId, {
          status: status === 'active' ? 'pushed' : status,
          updated_at: new Date().toISOString(),
        });
        touched++;
      }
    }
  }
  return { touched, events };
}

export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method === 'GET') return handleVerification(req);
    if (req.method !== 'POST') return text('method not allowed', 405);

    // Optional shared-secret check via header so unsubscribed sources can't
    // freely write to our DB. Meta itself doesn't send this — but if you
    // proxy events through Cloudflare Worker etc., add a static secret.
    const proxySecret = req.headers.get('x-banner-pro-secret');
    const requiredSecret = process.env.META_WEBHOOK_PROXY_SECRET;
    if (requiredSecret && proxySecret !== requiredSecret) {
      return text('forbidden', 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) return text('bad json', 400);

    const result = await handleEvent(body);
    return json({ ok: true, ...result });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
}
