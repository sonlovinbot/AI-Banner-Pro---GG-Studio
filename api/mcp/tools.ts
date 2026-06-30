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
import {
  submitCoachioTask, checkCoachioStatus, fetchImageBytes, uploadBytesToBunny,
} from '../_lib/coachioGen';

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

// ─────────────────── Banner generation (async, 2-call pattern) ───────────────────
//
// Coachio gen takes 30-90s — too long for a single 25s Edge call. Split into:
//   1. start_banner_gen  → submit task, return our internal task_id (~2s)
//   2. check_banner_gen  → poll Coachio once, finalize on completion (~3-5s)
//
// Claude loops check every 10-30s until status='completed' or 'failed'.

const VALID_ASPECT_RATIOS_GEN = ['1:1', '4:3', '3:4', '16:9', '9:16'];
const VALID_MODELS = ['gpt_image_2', 'nano-banana-pro'];

const start_banner_gen: McpToolDef = {
  name: 'start_banner_gen',
  description:
    'Kick off a Coachio banner generation. Returns a task_id immediately (~2s). ' +
    'You MUST then call check_banner_gen repeatedly (every 10-30s) until ' +
    'status=completed or failed. Typical end-to-end: 30-90s. ' +
    'Three modes: (1) text-only — no refs; (2) style ref only; (3) full refs. ' +
    'Reference banner_ids must come from list_banners (must be user\'s own).',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        minLength: 5,
        maxLength: 2000,
        description: 'Vivid description of what to render.',
      },
      aspect_ratio: {
        type: 'string',
        enum: VALID_ASPECT_RATIOS_GEN,
        default: '1:1',
      },
      model: {
        type: 'string',
        enum: VALID_MODELS,
        default: 'gpt_image_2',
        description: 'gpt_image_2 = OpenAI GPT-Image-2 (fast). nano-banana-pro = Gemini-based (higher quality, slower).',
      },
      style_reference_banner_id: {
        type: 'string',
        description: 'Optional banner_id to use as style/composition reference',
      },
      product_reference_banner_id: {
        type: 'string',
        description: 'Optional banner_id to use as product reference (object integrated into design)',
      },
    },
    required: ['prompt'],
  },
  requiredScopes: ['banners:write'],
  handler: async (args, ctx) => {
    // 1. Pull user's Coachio API key from DB.
    const keyRow = await supaSelectOne<any>('user_api_keys',
      `user_id=eq.${ctx.userId}&select=coachio_api_key`);
    const apiKey = keyRow?.coachio_api_key;
    if (!apiKey) {
      return error(
        'Server không có Coachio API key của user. Mở Banner Ads Pro → Settings → Coachio AI → save key. ' +
        'Sau khi save, key sẽ tự sync sang server.',
      );
    }

    // 2. Resolve reference banner URLs if provided.
    const refUrls: string[] = [];
    for (const refKey of ['style_reference_banner_id', 'product_reference_banner_id']) {
      const refId = args[refKey];
      if (!refId) continue;
      const ref = await supaSelectOne<any>('banner_history',
        `id=eq.${refId}&user_id=eq.${ctx.userId}&select=image_url`);
      if (!ref?.image_url) {
        return error(`Reference banner ${refId} not found or no image_url`);
      }
      refUrls.push(ref.image_url);
    }

    // 3. Submit to Coachio.
    let coachioTaskId: string;
    try {
      coachioTaskId = await submitCoachioTask({
        apiKey,
        prompt: args.prompt,
        aspectRatio: args.aspect_ratio || '1:1',
        resolution: '1K',
        modelIdentifier: args.model || 'gpt_image_2',
        imageUrls: refUrls,
      });
    } catch (e: any) {
      return error(`Coachio submit failed: ${e?.message || e}`);
    }

    // 4. Insert our internal tracking row.
    const taskId = 'gen_' + newId();
    try {
      await supaPost('mcp_gen_tasks', {
        id: taskId,
        user_id: ctx.userId,
        coachio_task_id: coachioTaskId,
        status: 'pending',
        prompt: args.prompt,
        aspect_ratio: args.aspect_ratio || '1:1',
        model: args.model || 'gpt_image_2',
        style_reference_banner_id: args.style_reference_banner_id || null,
        product_reference_banner_id: args.product_reference_banner_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      return error(`Coachio task submitted but local tracker insert failed: ${e?.message || e}`);
    }

    return textJson({
      task_id: taskId,
      coachio_task_id: coachioTaskId,
      status: 'pending',
      message:
        `Started gen task ${taskId}. Call check_banner_gen({task_id: "${taskId}"}) every 10-30 seconds ` +
        `until status=completed (~30-90s typical) or failed. Don't poll faster than every 5s.`,
    });
  },
};

const check_banner_gen: McpToolDef = {
  name: 'check_banner_gen',
  description:
    'Poll a Coachio gen task started by start_banner_gen. Returns one of: ' +
    'pending / generating / completed (with banner_id + image_url) / failed. ' +
    'When completed, the image is automatically mirrored to our CDN and saved ' +
    'in banner_history — ready to pass into Meta MCP ads_create_creative.',
  inputSchema: {
    type: 'object',
    properties: { task_id: { type: 'string' } },
    required: ['task_id'],
  },
  requiredScopes: ['banners:write'],
  handler: async (args, ctx) => {
    const taskRow = await supaSelectOne<any>('mcp_gen_tasks',
      `id=eq.${args.task_id}&user_id=eq.${ctx.userId}&select=*`);
    if (!taskRow) return error(`Task ${args.task_id} not found`);

    // Already terminal? Return cached result without re-polling Coachio.
    if (taskRow.status === 'completed') {
      return textJson({
        task_id: taskRow.id,
        status: 'completed',
        banner_id: taskRow.banner_id,
        image_url: taskRow.image_url,
        message: 'Already completed (cached).',
      });
    }
    if (taskRow.status === 'failed') {
      return textJson({
        task_id: taskRow.id,
        status: 'failed',
        error: taskRow.error_message,
      });
    }

    // Need user's Coachio key for the status poll.
    const keyRow = await supaSelectOne<any>('user_api_keys',
      `user_id=eq.${ctx.userId}&select=coachio_api_key`);
    const apiKey = keyRow?.coachio_api_key;
    if (!apiKey) return error('Coachio API key missing — task cannot be polled');

    // 1. Poll Coachio status.
    let status;
    try {
      status = await checkCoachioStatus(taskRow.coachio_task_id, apiKey);
    } catch (e: any) {
      return error(`Status check failed: ${e?.message || e}`);
    }

    // Still working? Just update our row + return.
    if (status.status === 'pending' || status.status === 'processing') {
      const localStatus = status.status === 'processing' ? 'generating' : 'pending';
      if (localStatus !== taskRow.status) {
        await supaPatch('mcp_gen_tasks', `id=eq.${taskRow.id}`, {
          status: localStatus,
          updated_at: new Date().toISOString(),
        }).catch(() => {});
      }
      return textJson({
        task_id: taskRow.id,
        status: localStatus,
        message: `Still ${localStatus}. Wait 10-30s and call again.`,
      });
    }

    if (status.status === 'failed') {
      await supaPatch('mcp_gen_tasks', `id=eq.${taskRow.id}`, {
        status: 'failed',
        error_message: status.errorMessage || 'unknown',
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      return textJson({
        task_id: taskRow.id,
        status: 'failed',
        error: status.errorMessage,
      });
    }

    // status === 'completed' → mirror to Bunny + save banner_history.
    const sourceUrl = status.outputUrls?.[0];
    if (!sourceUrl) {
      await supaPatch('mcp_gen_tasks', `id=eq.${taskRow.id}`, {
        status: 'failed',
        error_message: 'Coachio completed but no output URL',
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      return error('Coachio completed but no output URL');
    }

    // 2. Fetch image from Coachio CDN.
    let fetched;
    try {
      fetched = await fetchImageBytes(sourceUrl);
    } catch (e: any) {
      return error(`Failed to fetch Coachio image: ${e?.message || e}`);
    }

    // 3. Upload to our Bunny CDN (stable URL for Meta MCP).
    let uploaded;
    try {
      uploaded = await uploadBytesToBunny({
        userId: ctx.userId,
        bytes: fetched.bytes,
        mimeType: fetched.mimeType,
        folder: 'banners',
      });
    } catch (e: any) {
      return error(`Bunny upload failed: ${e?.message || e}`);
    }

    // 4. Insert banner_history row.
    const bannerId = newId();
    try {
      await supaPost('banner_history', {
        id: bannerId,
        user_id: ctx.userId,
        image_url: uploaded.url,
        prompt_used: taskRow.prompt,
        model: taskRow.model,
        quality: '1K',
        aspect_ratio: taskRow.aspect_ratio,
        parent_id: taskRow.style_reference_banner_id || null,
        version: taskRow.style_reference_banner_id ? 2 : 1,
        created_at: new Date().toISOString(),
      });
    } catch (e: any) {
      return error(`Image uploaded but banner_history insert failed: ${e?.message || e}`);
    }

    // 5. Mark task complete.
    await supaPatch('mcp_gen_tasks', `id=eq.${taskRow.id}`, {
      status: 'completed',
      banner_id: bannerId,
      image_url: uploaded.url,
      updated_at: new Date().toISOString(),
    }).catch(() => {});

    return textJson({
      task_id: taskRow.id,
      status: 'completed',
      banner_id: bannerId,
      image_url: uploaded.url,
      message:
        `Banner ${bannerId} ready. Pass image_url to Meta MCP ads_create_creative, ` +
        `or to save_creative_draft.`,
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
  // Banner generation — async 2-call pattern (Coachio takes 30-90s)
  start_banner_gen,
  check_banner_gen,
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
