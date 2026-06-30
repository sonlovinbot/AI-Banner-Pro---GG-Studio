// Banner Ads Pro MCP tools — Sprint D.
//
// Read tools (this commit):
//   - list_brand_styles, get_brand_style
//   - list_banners, get_banner
//   - list_creative_drafts, get_creative_draft
//
// Write tools (next commit):
//   - create_banner, save_creative_draft, clone_banner_with_variations
//
// Design:
//   - Each tool: name, description, inputSchema (JSON Schema), required
//     scopes (OAuth), handler(args, ctx) → returns MCP content[].
//   - Handlers run with service-role Supabase access but ALWAYS filter by
//     ctx.userId — token user MUST own every row touched.
//   - Returns text content with JSON-stringified payload — Claude parses it.

import { supaSelectOne } from '../_lib/mcpOAuth';
import { generateImage, uploadBytesToBunny } from '../_lib/imageGen';

export interface McpToolContext {
  userId: string;
  scope: string[];
  accessToken: string;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: object;
  requiredScopes: string[];
  handler: (args: any, ctx: McpToolContext) => Promise<McpToolResult>;
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: any;  // Some clients prefer parsed JSON
}

// ─────────────────── Tool definitions ───────────────────

const list_brand_styles: McpToolDef = {
  name: 'list_brand_styles',
  description:
    'List the user\'s brand style profiles (logo, voice, color, references). ' +
    'Use as a starting point when the user wants to create a campaign — pick the right brand first.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    },
  },
  requiredScopes: ['brand:read'],
  handler: async (args, ctx) => {
    const limit = args?.limit ?? 50;
    const rows = await supaSelect('brand_projects',
      `user_id=eq.${ctx.userId}&select=id,name,brand_info,event_info,json_prompt,logo,style_references,product_references,created_at,updated_at&order=updated_at.desc&limit=${limit}`,
    );
    return textJson({
      brand_styles: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        brand_info: r.brand_info || '',
        event_info: r.event_info || '',
        json_prompt: r.json_prompt || '',
        logo_url: r.logo?.url || r.logo?.base64 || null,
        style_reference_count: Array.isArray(r.style_references) ? r.style_references.length : 0,
        product_reference_count: Array.isArray(r.product_references) ? r.product_references.length : 0,
        updated_at: r.updated_at,
      })),
      count: rows.length,
    });
  },
};

const get_brand_style: McpToolDef = {
  name: 'get_brand_style',
  description: 'Get a single brand style profile by id, including all reference images.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  requiredScopes: ['brand:read'],
  handler: async (args, ctx) => {
    const row = await supaSelectOne<any>('brand_projects',
      `id=eq.${args.id}&user_id=eq.${ctx.userId}&select=*`);
    if (!row) return error(`Brand style ${args.id} not found`);
    return textJson({
      brand_style: {
        id: row.id,
        name: row.name,
        brand_info: row.brand_info || '',
        event_info: row.event_info || '',
        json_prompt: row.json_prompt || '',
        logo: row.logo || null,
        style_references: row.style_references || [],
        product_references: row.product_references || [],
        updated_at: row.updated_at,
      },
    });
  },
};

const list_banners: McpToolDef = {
  name: 'list_banners',
  description:
    'List banner images the user has generated. Each banner has a public CDN URL ' +
    'that Meta MCP can pass directly to ads_create_creative as image_url. ' +
    'Filter by recency, parent banner (variations), or model.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      since_days: { type: 'integer', minimum: 1, description: 'Only banners from the last N days' },
      parent_id: { type: 'string', description: 'Only banners derived from this parent (variations)' },
      model: { type: 'string', description: 'Filter by generation model (e.g. "gemini", "coachio")' },
    },
  },
  requiredScopes: ['banners:read'],
  handler: async (args, ctx) => {
    let filter = `user_id=eq.${ctx.userId}&select=id,image_url,prompt_used,model,quality,aspect_ratio,parent_id,version,created_at,duration&order=created_at.desc&limit=${args?.limit ?? 50}`;
    if (args?.since_days) {
      const since = new Date(Date.now() - args.since_days * 86400000).toISOString();
      filter += `&created_at=gte.${since}`;
    }
    if (args?.parent_id) filter += `&parent_id=eq.${args.parent_id}`;
    if (args?.model)     filter += `&model=ilike.*${args.model}*`;

    const rows = await supaSelect('banner_history', filter);
    return textJson({
      banners: rows.map((r: any) => ({
        id: r.id,
        image_url: r.image_url,
        prompt_used: r.prompt_used,
        model: r.model,
        quality: r.quality,
        aspect_ratio: r.aspect_ratio,
        parent_id: r.parent_id,
        version: r.version,
        created_at: r.created_at,
      })),
      count: rows.length,
    });
  },
};

const get_banner: McpToolDef = {
  name: 'get_banner',
  description: 'Get a single banner by id with full prompt + metadata.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  requiredScopes: ['banners:read'],
  handler: async (args, ctx) => {
    const row = await supaSelectOne<any>('banner_history',
      `id=eq.${args.id}&user_id=eq.${ctx.userId}&select=*`);
    if (!row) return error(`Banner ${args.id} not found`);
    return textJson({ banner: row });
  },
};

const list_creative_drafts: McpToolDef = {
  name: 'list_creative_drafts',
  description:
    'List ad creative drafts the user has built — these bundle a banner with ' +
    'headline / primary text / CTA / destination URL, ready for Meta MCP to push.',
  inputSchema: {
    type: 'object',
    properties: {
      campaign_id: { type: 'string', description: 'Filter to one local campaign' },
      adset_id:    { type: 'string', description: 'Filter to one local ad set' },
      status:      { type: 'string', enum: ['draft', 'ready', 'pushed', 'paused', 'failed', 'archived'] },
      limit:       { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    },
  },
  requiredScopes: ['drafts:read'],
  handler: async (args, ctx) => {
    let filter = `user_id=eq.${ctx.userId}&select=id,campaign_id,adset_id,name,banner_id,primary_text,headline,description,cta,destination_url,status,tags,source,meta_ad_id,updated_at&order=updated_at.desc&limit=${args?.limit ?? 50}`;
    if (args?.campaign_id) filter += `&campaign_id=eq.${args.campaign_id}`;
    if (args?.adset_id)    filter += `&adset_id=eq.${args.adset_id}`;
    if (args?.status)      filter += `&status=eq.${args.status}`;
    const rows = await supaSelect('ad_creatives', filter);
    return textJson({
      drafts: rows.map((r: any) => ({
        id: r.id,
        campaign_id: r.campaign_id,
        adset_id: r.adset_id,
        name: r.name,
        banner_id: r.banner_id,
        primary_text: r.primary_text,
        headline: r.headline,
        description: r.description,
        cta: r.cta,
        destination_url: r.destination_url,
        status: r.status,
        tags: r.tags || [],
        meta_ad_id: r.meta_ad_id,
        updated_at: r.updated_at,
      })),
      count: rows.length,
    });
  },
};

const get_creative_draft: McpToolDef = {
  name: 'get_creative_draft',
  description:
    'Get a single creative draft by id, plus the attached banner URL — gives ' +
    'Meta MCP everything it needs in one call: image_url, headline, message, ' +
    'description, call_to_action_type, link_url.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  requiredScopes: ['drafts:read'],
  handler: async (args, ctx) => {
    const row = await supaSelectOne<any>('ad_creatives',
      `id=eq.${args.id}&user_id=eq.${ctx.userId}&select=*`);
    if (!row) return error(`Creative draft ${args.id} not found`);

    // Resolve banner URL so the response is "Meta MCP ready"
    let bannerUrl: string | null = null;
    if (row.banner_id) {
      const b = await supaSelectOne<any>('banner_history',
        `id=eq.${row.banner_id}&user_id=eq.${ctx.userId}&select=image_url`);
      bannerUrl = b?.image_url || null;
    }
    return textJson({
      draft: {
        ...row,
        banner_image_url: bannerUrl,
        // Hint payload shaped exactly like ads_create_creative expects
        meta_creative_args_preview: {
          image_url: bannerUrl,
          link_url: row.destination_url,
          message: row.primary_text,
          headline: row.headline,
          description: row.description,
          call_to_action_type: row.cta || 'LEARN_MORE',
          name: row.name,
        },
      },
    });
  },
};

// ─────────────────── Write tools (Sprint D phase 2) ───────────────────

const VALID_CTAS = [
  'SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'BUY_NOW', 'BOOK_TRAVEL',
  'DOWNLOAD', 'CONTACT_US', 'GET_QUOTE', 'MESSAGE_PAGE', 'SUBSCRIBE',
  'WATCH_MORE', 'GET_OFFER', 'INSTALL_MOBILE_APP', 'NO_BUTTON',
];

const save_creative_draft: McpToolDef = {
  name: 'save_creative_draft',
  description:
    'Create a new ad creative draft in Banner Ads Pro. Bundles a banner ' +
    '(by banner_id from list_banners) with headline + primary text + CTA + ' +
    'destination URL. The draft appears immediately in the user\'s app. ' +
    'Use after composing copy in chat — give the human a starting point to refine.',
  inputSchema: {
    type: 'object',
    properties: {
      banner_id: { type: 'string', description: 'Banner from list_banners (image source)' },
      campaign_id: { type: 'string', description: 'Optional local Campaign id to attach to' },
      adset_id:    { type: 'string', description: 'Optional local AdSet id to attach to' },
      name: { type: 'string', description: 'Internal name (defaults to "MCP draft <timestamp>")' },
      headline: { type: 'string', maxLength: 250 },
      primary_text: { type: 'string', maxLength: 5000 },
      description: { type: 'string', maxLength: 250 },
      cta: { type: 'string', enum: VALID_CTAS, default: 'LEARN_MORE' },
      destination_url: { type: 'string', format: 'uri' },
      display_link: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['banner_id'],
  },
  requiredScopes: ['drafts:write'],
  handler: async (args, ctx) => {
    // Verify the banner belongs to the user before linking — prevents
    // silently dropping a wrong/foreign banner id.
    const banner = await supaSelectOne<any>('banner_history',
      `id=eq.${args.banner_id}&user_id=eq.${ctx.userId}&select=id`);
    if (!banner) return error(`Banner ${args.banner_id} not found or not owned by user`);

    const id = newId();
    const now = new Date().toISOString();
    const row = {
      id,
      user_id: ctx.userId,
      campaign_id: args.campaign_id || null,
      adset_id: args.adset_id || null,
      name: args.name || `MCP draft ${new Date().toLocaleString('vi-VN')}`,
      banner_id: args.banner_id,
      primary_text: args.primary_text || null,
      headline: args.headline || null,
      description: args.description || null,
      cta: args.cta || 'LEARN_MORE',
      destination_url: args.destination_url || null,
      display_link: args.display_link || null,
      status: 'draft',
      tags: args.tags || [],
      source: 'agent',  // distinct from 'user' so the UI can mark "AI-created"
      created_at: now,
      updated_at: now,
    };
    const inserted = await supaPost('ad_creatives', row);
    return textJson({
      draft: {
        id: inserted.id,
        name: inserted.name,
        banner_id: inserted.banner_id,
        status: inserted.status,
        created_at: inserted.created_at,
      },
      message: `Saved draft "${inserted.name}" — user can refine in Banner Ads Pro UI.`,
    });
  },
};

const update_creative_draft: McpToolDef = {
  name: 'update_creative_draft',
  description:
    'Patch fields on an existing draft. Only pass the fields you want to ' +
    'change — others stay the same. Use to refine copy without recreating.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      headline: { type: 'string' },
      primary_text: { type: 'string' },
      description: { type: 'string' },
      cta: { type: 'string', enum: VALID_CTAS },
      destination_url: { type: 'string' },
      display_link: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', enum: ['draft', 'ready', 'paused', 'archived'] },
      campaign_id: { type: 'string' },
      adset_id: { type: 'string' },
    },
    required: ['id'],
  },
  requiredScopes: ['drafts:write'],
  handler: async (args, ctx) => {
    // RLS-equivalent: ensure draft belongs to user before patch.
    const existing = await supaSelectOne<any>('ad_creatives',
      `id=eq.${args.id}&user_id=eq.${ctx.userId}&select=id,status`);
    if (!existing) return error(`Creative draft ${args.id} not found or not owned by user`);

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const k of [
      'name', 'headline', 'primary_text', 'description', 'cta',
      'destination_url', 'display_link', 'tags', 'status',
      'campaign_id', 'adset_id',
    ]) {
      if (args[k] !== undefined) patch[k] = args[k];
    }
    if (Object.keys(patch).length === 1) return error('Nothing to update');

    await supaPatch('ad_creatives', `id=eq.${args.id}`, patch);
    return textJson({
      updated: { id: args.id, patched_fields: Object.keys(patch).filter(k => k !== 'updated_at') },
      message: `Updated draft ${args.id}`,
    });
  },
};

const VALID_ASPECT_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16'];

const create_banner: McpToolDef = {
  name: 'create_banner',
  description:
    'Generate a new banner image from a text prompt via Imagen 4 fast, ' +
    'upload to CDN, and save to the user\'s banner history. Returns banner_id ' +
    'and image_url ready for Meta MCP ads_create_creative (image_url param). ' +
    'Takes 5-15s. The image is text-only generation — for product/brand image ' +
    'editing, the user should use the Banner Ads Pro UI which supports reference inputs.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        minLength: 5,
        maxLength: 2000,
        description: 'Vivid description of what to render. More specific = better.',
      },
      aspect_ratio: {
        type: 'string',
        enum: VALID_ASPECT_RATIOS,
        default: '1:1',
      },
      tag: {
        type: 'string',
        description: 'Optional label stored alongside (eg. "black-friday", "winter-sale")',
      },
    },
    required: ['prompt'],
  },
  requiredScopes: ['banners:write'],
  handler: async (args, ctx) => {
    const prompt = String(args.prompt).trim();
    const aspect = args.aspect_ratio || '1:1';
    const startedAt = Date.now();

    // 1. Generate (5-15s typical).
    let image;
    try {
      image = await generateImage({ prompt, aspectRatio: aspect });
    } catch (e: any) {
      return error(`Image generation failed: ${e?.message || e}`);
    }

    // 2. Upload to Bunny — returns public CDN URL we can feed to Meta MCP.
    let uploaded;
    try {
      uploaded = await uploadBytesToBunny({
        userId: ctx.userId,
        bytes: image.bytes,
        mimeType: image.mimeType,
        folder: 'banners',
      });
    } catch (e: any) {
      return error(`Upload to CDN failed: ${e?.message || e}`);
    }

    // 3. Persist row in banner_history so it appears in the app History tab.
    const id = newId();
    const duration = Date.now() - startedAt;
    const promptWithTag = args.tag ? `${prompt} [#${args.tag}]` : prompt;
    try {
      await supaPost('banner_history', {
        id,
        user_id: ctx.userId,
        image_url: uploaded.url,
        prompt_used: promptWithTag,
        model: 'imagen-4.0-fast-generate-001',
        quality: '1K',
        aspect_ratio: aspect,
        duration,
        version: 1,
        created_at: new Date().toISOString(),
      });
    } catch (e: any) {
      return error(`Saved to CDN but DB insert failed: ${e?.message || e}`);
    }

    return textJson({
      banner: {
        id,
        image_url: uploaded.url,
        prompt: promptWithTag,
        aspect_ratio: aspect,
        model: 'imagen-4.0-fast-generate-001',
        duration_ms: duration,
      },
      message: `Generated banner ${id} in ${(duration / 1000).toFixed(1)}s. ` +
               `Pass image_url to Meta MCP ads_create_creative or to save_creative_draft.`,
    });
  },
};

const clone_banner_with_variations: McpToolDef = {
  name: 'clone_banner_with_variations',
  description:
    'Generate N variations of a source banner. Uses the source\'s prompt as a ' +
    'starting point, then asks Imagen to render N alternatives with the ' +
    'angle hint(s) provided. Returns the new banner_ids — Claude can chain ' +
    'into Meta MCP to A/B test them. Cost: ~5-15s per variant. Cap at 5 / call.',
  inputSchema: {
    type: 'object',
    properties: {
      source_banner_id: { type: 'string' },
      count: { type: 'integer', minimum: 1, maximum: 5, default: 3 },
      angle_hint: {
        type: 'string',
        description: 'Optional steering text appended to each variant prompt ' +
                     '(eg. "more urgency", "minimalist", "evening lighting")',
      },
    },
    required: ['source_banner_id'],
  },
  requiredScopes: ['banners:write', 'banners:read'],
  handler: async (args, ctx) => {
    const source = await supaSelectOne<any>('banner_history',
      `id=eq.${args.source_banner_id}&user_id=eq.${ctx.userId}&select=id,prompt_used,aspect_ratio`);
    if (!source) return error(`Source banner ${args.source_banner_id} not found`);

    const count = Math.min(5, Math.max(1, args.count ?? 3));
    const angles = [
      'benefit-led — emphasize the upside for the viewer',
      'urgency-led — limited time / scarcity vibe',
      'social-proof — shows other people loving the result',
      'minimalist — clean, single subject',
      'aspirational — premium, lifestyle, evening light',
    ];

    const results: any[] = [];
    const errors: string[] = [];

    // Sequential to stay under 25s Edge timeout (parallel would race the limit).
    for (let i = 0; i < count; i++) {
      const angle = args.angle_hint || angles[i % angles.length];
      const prompt = `${source.prompt_used}\n\nVariation ${i + 1}/${count} — angle: ${angle}. ` +
                     `Keep core composition similar but vary visual hook.`;
      try {
        const img = await generateImage({ prompt, aspectRatio: source.aspect_ratio });
        const uploaded = await uploadBytesToBunny({
          userId: ctx.userId,
          bytes: img.bytes,
          mimeType: img.mimeType,
          folder: 'banners',
        });
        const id = newId();
        await supaPost('banner_history', {
          id,
          user_id: ctx.userId,
          image_url: uploaded.url,
          prompt_used: prompt,
          model: 'imagen-4.0-fast-generate-001',
          quality: '1K',
          aspect_ratio: source.aspect_ratio,
          parent_id: source.id,
          version: i + 2,  // source is v1, variants start at v2
          created_at: new Date().toISOString(),
        });
        results.push({ id, image_url: uploaded.url, angle });
      } catch (e: any) {
        errors.push(`Variant ${i + 1}: ${e?.message || e}`);
      }
    }

    return textJson({
      source_banner_id: source.id,
      generated: results.length,
      variants: results,
      errors: errors.length > 0 ? errors : undefined,
      message: results.length === count
        ? `Generated all ${count} variants. Use list_banners with parent_id=${source.id} to see them grouped.`
        : `Generated ${results.length}/${count} variants. See errors[].`,
    });
  },
};

const delete_creative_draft: McpToolDef = {
  name: 'delete_creative_draft',
  description:
    'Delete a creative draft permanently. Refuses to delete drafts that ' +
    'have already been pushed to Meta (status=pushed / failed) — archive ' +
    'those manually instead.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  requiredScopes: ['drafts:write'],
  handler: async (args, ctx) => {
    const existing = await supaSelectOne<any>('ad_creatives',
      `id=eq.${args.id}&user_id=eq.${ctx.userId}&select=id,name,status,meta_ad_id`);
    if (!existing) return error(`Creative draft ${args.id} not found`);
    if (existing.meta_ad_id || ['pushed', 'failed'].includes(existing.status)) {
      return error(
        `Cannot delete draft "${existing.name}" — already pushed to Meta (ad ${existing.meta_ad_id || existing.status}). ` +
        `Archive in the UI instead, or pause the ad on Meta first.`,
      );
    }
    await supaDelete('ad_creatives', `id=eq.${args.id}`);
    return textJson({
      deleted: { id: args.id, name: existing.name },
      message: `Deleted draft "${existing.name}".`,
    });
  },
};

// ─────────────────── Registry + helpers ───────────────────

export const ALL_TOOLS: McpToolDef[] = [
  // Read
  list_brand_styles,
  get_brand_style,
  list_banners,
  get_banner,
  list_creative_drafts,
  get_creative_draft,
  // Write — drafts
  save_creative_draft,
  update_creative_draft,
  delete_creative_draft,
  // Write — banner generation
  create_banner,
  clone_banner_with_variations,
];

export function getTool(name: string): McpToolDef | undefined {
  return ALL_TOOLS.find(t => t.name === name);
}

export function toolListResponse(grantedScope: string[]): object {
  return {
    tools: ALL_TOOLS
      .filter(t => t.requiredScopes.every(s => grantedScope.includes(s)))
      .map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
  };
}

// ─── helpers ───
function textJson(obj: any): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
    structuredContent: obj,
  };
}

function error(msg: string): McpToolResult {
  return {
    content: [{ type: 'text', text: msg }],
    isError: true,
  };
}

// Internal Supabase REST wrappers (Edge runtime, service role).

function supaHeaders(extra: HeadersInit = {}): HeadersInit {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  };
}

async function supaSelect(table: string, filter: string): Promise<any[]> {
  const supaUrl = process.env.SUPABASE_URL!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}?${filter}`, {
    headers: supaHeaders(),
  });
  if (!res.ok) throw new Error(`Supabase ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supaPost(table: string, row: any): Promise<any> {
  const supaUrl = process.env.SUPABASE_URL!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: supaHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert ${table} ${res.status}: ${await res.text()}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

async function supaPatch(table: string, filter: string, patch: any): Promise<void> {
  const supaUrl = process.env.SUPABASE_URL!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: supaHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Supabase patch ${table} ${res.status}: ${await res.text()}`);
}

async function supaDelete(table: string, filter: string): Promise<void> {
  const supaUrl = process.env.SUPABASE_URL!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: supaHeaders({ Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new Error(`Supabase delete ${table} ${res.status}: ${await res.text()}`);
}

function newId(): string {
  return Math.random().toString(36).substring(2, 8) + Date.now().toString(36);
}
