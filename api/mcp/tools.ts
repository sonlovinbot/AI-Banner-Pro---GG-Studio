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

// ─────────────────── Registry + helpers ───────────────────

export const ALL_TOOLS: McpToolDef[] = [
  list_brand_styles,
  get_brand_style,
  list_banners,
  get_banner,
  list_creative_drafts,
  get_creative_draft,
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

// Internal supaSelect wrapper kept thin (Edge runtime, service role)
async function supaSelect(table: string, filter: string): Promise<any[]> {
  const supaUrl = process.env.SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(`${supaUrl}/rest/v1/${table}?${filter}`, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
  });
  if (!res.ok) throw new Error(`Supabase ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}
