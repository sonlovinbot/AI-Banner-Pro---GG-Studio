import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Sparkles, Loader2, Wand2, ArrowRight, ArrowLeft, CheckCircle, AlertCircle,
  Image as ImageIcon, Palette, Save,
} from 'lucide-react';
import {
  AdCampaign, AdSet, AdCreative, AdCampaignObjective, AdCTA, HistoryItem, BrandProject, MetaAccount,
} from '../../types';
import { chatComplete, LLMMessage, CoachioLLMError, DEFAULT_MODEL } from '../../services/coachioLLMService';
import { listCoachioModels, CoachioModel, providerLabel } from '../../services/coachioModelsService';
import { listBrandProjectsFromCloud } from '../../services/brandProjectService';
import { listMetaAccountsFromCloud, MetaAccountsSetupRequiredError } from '../../services/metaAccountsService';
import { buildBrandContext } from './BrandPickerModal';
import { saveCampaignToCloud, newCampaignDraft, OBJECTIVE_LABELS } from '../../services/adCampaignService';
import { saveAdSetToCloud, newAdSetDraft } from '../../services/adSetService';
import { saveCreativeToCloud } from '../../services/adCreativeService';
import { proxiedBannerUrl } from '../../services/cdnProxy';

interface Props {
  banners: HistoryItem[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

interface BriefInput {
  product: string;
  goal: AdCampaignObjective;
  audienceHint: string;
  dailyBudgetVND: number;
  /** Reference to meta_accounts table */
  metaAccountRefId?: string;
  brandId?: string;
  selectedBannerIds: string[];
  model: string;
}

interface AIPlan {
  campaign: {
    name: string;
    objective: AdCampaignObjective;
    useCBO: boolean;
    dailyBudgetVND: number;
    bidStrategy?: 'LOWEST_COST_WITHOUT_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'COST_CAP' | 'LOWEST_COST_WITH_MIN_ROAS';
    notes?: string;
  };
  adSets: {
    name: string;
    destinationType: 'WEBSITE' | 'ON_POST' | 'MESSENGER' | 'INSTAGRAM_DIRECT';
    optimizationGoal: string;
    billingEvent: 'IMPRESSIONS' | 'LINK_CLICKS' | 'POST_ENGAGEMENT';
    dailyBudgetVND?: number;
    targeting: {
      countries: string[];
      ageMin: number;
      ageMax: number;
      genders?: ('male' | 'female')[];
      interestLabels: string[];
    };
    creatives: {
      name: string;
      primaryText: string;
      headline: string;
      description?: string;
      cta: AdCTA;
      destinationUrl?: string;
      bannerHistoryId?: string | null;
      tags: string[];
    }[];
  }[];
}

type Step = 'brief' | 'generating' | 'review' | 'saving' | 'done';

const OBJECTIVE_HINTS: Record<AdCampaignObjective, string> = {
  OUTCOME_AWARENESS: 'Phủ thương hiệu, tăng nhận biết',
  OUTCOME_TRAFFIC: 'Kéo người vào website / landing',
  OUTCOME_ENGAGEMENT: 'Like/comment/share/message',
  OUTCOME_LEADS: 'Thu form / data khách hàng',
  OUTCOME_SALES: 'Bán hàng (conversion, ROAS)',
  OUTCOME_APP_PROMOTION: 'Cài app',
};

export const CampaignWizard: React.FC<Props> = ({ banners, onClose, onDone }) => {
  const [step, setStep] = useState<Step>('brief');
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<CoachioModel[]>([]);
  const [brands, setBrands] = useState<BrandProject[]>([]);
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);
  const [plan, setPlan] = useState<AIPlan | null>(null);

  const [brief, setBrief] = useState<BriefInput>({
    product: '',
    goal: 'OUTCOME_TRAFFIC',
    audienceHint: '',
    dailyBudgetVND: 200000,
    selectedBannerIds: [],
    model: DEFAULT_MODEL,
  });

  useEffect(() => {
    listCoachioModels().then(setModels).catch(e => console.warn('models', e));
    listBrandProjectsFromCloud().then(setBrands).catch(e => console.warn('brands', e));
    listMetaAccountsFromCloud()
      .then(list => {
        setMetaAccounts(list);
        // auto-pick default account if any
        const def = list.find(a => a.isDefault) || list[0];
        if (def) setBrief(prev => ({ ...prev, metaAccountRefId: def.id }));
      })
      .catch(e => {
        if (!(e instanceof MetaAccountsSetupRequiredError)) console.warn('meta accounts', e);
      });
  }, []);

  const selectedBrand = brands.find(b => b.id === brief.brandId);
  const selectedBanners = banners.filter(b => brief.selectedBannerIds.includes(b.id));

  const toggleBanner = (id: string) => {
    setBrief(prev => ({
      ...prev,
      selectedBannerIds: prev.selectedBannerIds.includes(id)
        ? prev.selectedBannerIds.filter(x => x !== id)
        : [...prev.selectedBannerIds, id],
    }));
  };

  const generate = async () => {
    setError(null);
    if (!brief.product.trim()) { setError('Mô tả sản phẩm/dịch vụ là bắt buộc'); return; }
    setStep('generating');
    try {
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(brief, selectedBrand, selectedBanners);
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      const { text: raw } = await chatComplete(messages, { model: brief.model, temperature: 0.6 });
      const parsed = extractJSON(raw);
      if (!parsed) throw new Error('AI không trả JSON hợp lệ. Thử model khác hoặc giảm temperature.');
      const normalized = normalizePlan(parsed, brief);
      setPlan(normalized);
      setStep('review');
    } catch (e: any) {
      const msg = e instanceof CoachioLLMError ? e.message : (e?.message || 'AI generate lỗi');
      setError(msg);
      setStep('brief');
    }
  };

  const save = async () => {
    if (!plan) return;
    setError(null);
    setStep('saving');
    try {
      const campaignDraft: AdCampaign = {
        ...newCampaignDraft(plan.campaign.name, plan.campaign.objective),
        useCBO: plan.campaign.useCBO,
        dailyBudget: plan.campaign.useCBO ? plan.campaign.dailyBudgetVND * 100 : undefined,
        bidStrategy: plan.campaign.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
        metaAccountRefId: brief.metaAccountRefId,
        notes: plan.campaign.notes,
        status: 'draft',
      };
      const savedCampaign = await saveCampaignToCloud(campaignDraft);

      for (const adSetPlan of plan.adSets) {
        const adSetDraft: AdSet = {
          ...newAdSetDraft(savedCampaign.id, adSetPlan.name),
          destinationType: adSetPlan.destinationType as any,
          optimizationGoal: adSetPlan.optimizationGoal as any,
          billingEvent: adSetPlan.billingEvent as any,
          dailyBudget: !plan.campaign.useCBO && adSetPlan.dailyBudgetVND
            ? adSetPlan.dailyBudgetVND * 100
            : undefined,
          targeting: adSetPlan.targeting,
        };
        const savedAdSet = await saveAdSetToCloud(adSetDraft);

        for (const cr of adSetPlan.creatives) {
          const creativeDraft: AdCreative = {
            id: Math.random().toString(36).substring(2, 8) + Date.now().toString(36),
            campaignId: savedCampaign.id,
            adsetId: savedAdSet.id,
            name: cr.name,
            bannerId: cr.bannerHistoryId || undefined,
            primaryText: cr.primaryText,
            headline: cr.headline,
            description: cr.description,
            cta: cr.cta || 'SHOP_NOW',
            destinationUrl: cr.destinationUrl,
            status: 'draft',
            tags: cr.tags || [],
            source: 'agent',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await saveCreativeToCloud(creativeDraft);
        }
      }

      await onDone();
      setStep('done');
      setTimeout(onClose, 1500);
    } catch (e: any) {
      setError(e?.message || 'Lưu lỗi');
      setStep('review');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={step === 'generating' || step === 'saving' ? undefined : onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/60">
          <div className="flex items-center gap-3">
            <div className="bg-brand/15 text-brand p-2 rounded-md border border-brand/30">
              <Wand2 size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">AI tạo Campaign từ đầu</h3>
              <p className="text-[11px] text-subtle">
                {step === 'brief'      && 'Trả lời vài câu, AI sinh full campaign + ad sets + creatives'}
                {step === 'generating' && 'AI đang phân tích & sinh kế hoạch...'}
                {step === 'review'     && 'Xem trước trước khi lưu vào Library'}
                {step === 'saving'     && 'Đang lưu vào Supabase...'}
                {step === 'done'       && '✓ Đã tạo xong'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg" disabled={step === 'generating' || step === 'saving'}>
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'brief' && (
            <BriefForm
              brief={brief}
              setBrief={setBrief}
              brands={brands}
              models={models}
              metaAccounts={metaAccounts}
              banners={banners}
              toggleBanner={toggleBanner}
            />
          )}

          {step === 'generating' && (
            <div className="py-16 text-center text-muted space-y-3">
              <Loader2 className="animate-spin mx-auto" size={28} />
              <p className="text-sm">AI đang sinh plan ({brief.model})...</p>
              <p className="text-[11px] text-subtle">10-30s tuỳ model. Đừng đóng modal.</p>
            </div>
          )}

          {step === 'review' && plan && (
            <PlanReview plan={plan} setPlan={setPlan} banners={banners} />
          )}

          {step === 'saving' && (
            <div className="py-16 text-center text-muted space-y-2">
              <Loader2 className="animate-spin mx-auto" size={24} />
              <p className="text-sm">Lưu campaign + ad sets + creatives...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="py-16 text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-full status-success border flex items-center justify-center">
                <CheckCircle size={28} />
              </div>
              <p className="text-sm font-semibold text-fg">Đã tạo campaign</p>
              <p className="text-[11px] text-subtle">Tab Campaigns đã refresh, mở campaign mới để review.</p>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-3 status-danger border text-sm px-3 py-2 rounded-lg flex items-center gap-2">
            <AlertCircle size={12} /> {error}
          </div>
        )}

        <footer className="px-5 py-3 border-t border-line bg-surface/60 flex items-center justify-between gap-2">
          <div className="text-[10px] text-subtle">
            {step === 'brief'  && 'Bước 1/2 — Brief'}
            {step === 'review' && 'Bước 2/2 — Review trước lưu'}
          </div>
          <div className="flex gap-2">
            {step === 'review' && (
              <button
                onClick={() => setStep('brief')}
                className="text-xs px-3 py-2 rounded-md bg-raised hover:bg-raised-2 text-fg flex items-center gap-1.5"
              >
                <ArrowLeft size={12} /> Quay lại brief
              </button>
            )}
            {step === 'brief' && (
              <button
                onClick={generate}
                disabled={!brief.product.trim()}
                className="text-xs px-4 py-2 rounded-md bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-medium shadow-pop flex items-center gap-1.5"
              >
                <Sparkles size={12} /> AI sinh plan
              </button>
            )}
            {step === 'review' && (
              <button
                onClick={save}
                className="text-xs px-4 py-2 rounded-md bg-brand hover:bg-brand-dark text-white font-medium shadow-pop flex items-center gap-1.5"
              >
                <Save size={12} /> Lưu vào Library
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

// ────────────── Brief form ──────────────

const BriefForm: React.FC<{
  brief: BriefInput;
  setBrief: (b: BriefInput) => void;
  brands: BrandProject[];
  models: CoachioModel[];
  metaAccounts: MetaAccount[];
  banners: HistoryItem[];
  toggleBanner: (id: string) => void;
}> = ({ brief, setBrief, brands, models, metaAccounts, banners, toggleBanner }) => {
  const set = <K extends keyof BriefInput>(k: K, v: BriefInput[K]) => setBrief({ ...brief, [k]: v });

  return (
    <div className="space-y-4">
      <Field label="Sản phẩm / Dịch vụ *" hint="Mô tả ngắn 2-4 câu — AI cần biết bạn bán gì">
        <textarea
          value={brief.product}
          onChange={(e) => set('product', e.target.value)}
          placeholder="VD: Serum dưỡng da Niacinamide 10% cho da dầu mụn. Giá 380k. Thương hiệu mới ra mắt, USP: không cồn, độ pH 5.5, đóng chai thủy tinh tối màu."
          className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand min-h-[80px] resize-y"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Mục tiêu chính" hint={OBJECTIVE_HINTS[brief.goal]}>
          <select
            value={brief.goal}
            onChange={(e) => set('goal', e.target.value as AdCampaignObjective)}
            className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
          >
            {(Object.keys(OBJECTIVE_LABELS) as AdCampaignObjective[]).map(o => (
              <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>
            ))}
          </select>
        </Field>
        <Field label="Daily budget (VND)">
          <input
            type="number"
            value={brief.dailyBudgetVND}
            onChange={(e) => set('dailyBudgetVND', Number(e.target.value) || 0)}
            placeholder="200000"
            className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
          />
        </Field>
      </div>

      <Field label="Audience hint (optional)" hint="Hint AI về demographics + insight. Để trống cho AI tự đề xuất 2-3 angle khác nhau">
        <textarea
          value={brief.audienceHint}
          onChange={(e) => set('audienceHint', e.target.value)}
          placeholder="VD: Nữ 20-35 ở HCM/HN, đang đi làm, ngân sách skincare 200-500k/tháng, theo dõi beauty bloggers"
          className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand min-h-[60px] resize-y"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand context (optional)" hint="Bóc brand info + style nạp vào AI">
          <select
            value={brief.brandId || ''}
            onChange={(e) => set('brandId', e.target.value || undefined)}
            className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
          >
            <option value="">— Không dùng brand —</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Meta Account" hint={metaAccounts.length === 0 ? 'Chưa có Meta Account. Vào Settings → Meta Accounts để thêm.' : 'Account + Page sẽ publish ad'}>
          {metaAccounts.length === 0 ? (
            <div className="w-full status-warning border rounded-lg px-3 py-2 text-sm">
              Chưa có Meta Account
            </div>
          ) : (
            <select
              value={brief.metaAccountRefId || ''}
              onChange={(e) => set('metaAccountRefId', e.target.value || undefined)}
              className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand"
            >
              <option value="">— Chọn —</option>
              {metaAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.label}{a.isDefault ? ' · default' : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field label="Model LLM" hint="Model nào sinh plan tốt hơn — thử nhiều cái">
        <ModelSelect models={models} value={brief.model} onChange={(v) => set('model', v)} />
      </Field>

      {banners.length > 0 && (
        <Field
          label={`Banner đã có (${brief.selectedBannerIds.length}/${banners.length})`}
          hint="Chọn banner để AI gán cho creative phù hợp. Bỏ trống → AI gợi ý cần generate banner mới"
        >
          <div className="grid grid-cols-5 md:grid-cols-7 gap-1.5 max-h-[180px] overflow-y-auto p-1 bg-surface rounded border border-line">
            {banners.slice(0, 30).map(b => {
              const on = brief.selectedBannerIds.includes(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => toggleBanner(b.id)}
                  className={`relative aspect-square rounded overflow-hidden border-2 ${
                    on ? 'border-brand ring-1 ring-brand/40' : 'border-line hover:border-line-strong'
                  }`}
                  title={b.promptUsed?.slice(0, 80)}
                >
                  <img src={proxiedBannerUrl(b.imageUrl)} alt="" className="w-full h-full object-cover" />
                  {on && (
                    <div className="absolute top-0.5 right-0.5 bg-brand text-white w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold">
                      ✓
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {banners.length > 30 && (
            <p className="text-[10px] text-subtle mt-1">Hiển thị 30 banner mới nhất. Vào History để chọn cụ thể hơn.</p>
          )}
        </Field>
      )}
    </div>
  );
};

const ModelSelect: React.FC<{
  models: CoachioModel[];
  value: string;
  onChange: (v: string) => void;
}> = ({ models, value, onChange }) => {
  if (models.length === 0) {
    return (
      <p className="text-[11px] text-subtle">Đang tải model list... ({value})</p>
    );
  }
  const grouped: Record<string, CoachioModel[]> = {};
  for (const m of models) {
    const p = providerLabel(m.id);
    (grouped[p] ||= []).push(m);
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
    >
      {Object.entries(grouped).map(([p, list]) => (
        <optgroup key={p} label={p}>
          {list.map(m => (
            <option key={m.id} value={m.id}>{m.displayName.replace(/^[^:]+:\s*/, '')}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

const Field: React.FC<{ label: React.ReactNode; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className="text-[11px] font-medium text-muted block mb-1">{label}</label>
    {children}
    {hint && <p className="text-[10px] text-subtle mt-1">{hint}</p>}
  </div>
);

// ────────────── Plan review ──────────────

const PlanReview: React.FC<{
  plan: AIPlan;
  setPlan: (p: AIPlan) => void;
  banners: HistoryItem[];
}> = ({ plan, setPlan, banners }) => {
  const bannerById = (id?: string | null) => id ? banners.find(b => b.id === id) : undefined;

  return (
    <div className="space-y-4">
      {/* Campaign overview */}
      <div className="bg-surface border border-line rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand" />
          <span className="text-[10px] uppercase tracking-wider text-subtle font-mono">Campaign</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-subtle">Tên</p>
            <input
              type="text"
              value={plan.campaign.name}
              onChange={(e) => setPlan({ ...plan, campaign: { ...plan.campaign, name: e.target.value } })}
              className="w-full bg-canvas border border-line rounded px-2 py-1 text-sm focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <p className="text-[10px] text-subtle">Objective</p>
            <select
              value={plan.campaign.objective}
              onChange={(e) => setPlan({ ...plan, campaign: { ...plan.campaign, objective: e.target.value as AdCampaignObjective } })}
              className="w-full bg-canvas border border-line rounded px-2 py-1 text-sm focus:outline-none focus:border-brand"
            >
              {(Object.keys(OBJECTIVE_LABELS) as AdCampaignObjective[]).map(o => (
                <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-subtle">CBO</p>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={plan.campaign.useCBO}
                onChange={(e) => setPlan({ ...plan, campaign: { ...plan.campaign, useCBO: e.target.checked } })}
              />
              {plan.campaign.useCBO ? 'Bật' : 'Tắt (budget ở ad set)'}
            </label>
          </div>
          <div>
            <p className="text-[10px] text-subtle">Daily budget (VND)</p>
            <input
              type="number"
              value={plan.campaign.dailyBudgetVND}
              onChange={(e) => setPlan({ ...plan, campaign: { ...plan.campaign, dailyBudgetVND: Number(e.target.value) } })}
              className="w-full bg-canvas border border-line rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <p className="text-[10px] text-subtle">Bid strategy</p>
            <p className="text-xs text-fg pt-1">{plan.campaign.bidStrategy || 'LOWEST_COST_WITHOUT_CAP'}</p>
          </div>
        </div>
        {plan.campaign.notes && (
          <div>
            <p className="text-[10px] text-subtle">Strategy notes</p>
            <p className="text-[11px] text-muted bg-canvas rounded border border-line p-2 leading-relaxed whitespace-pre-wrap">{plan.campaign.notes}</p>
          </div>
        )}
      </div>

      {/* Ad sets */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-subtle font-mono">Ad Sets ({plan.adSets.length})</p>
        {plan.adSets.map((a, i) => (
          <div key={i} className="bg-surface border border-line rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono bg-raised text-fg px-1.5 py-0.5 rounded">#{i + 1}</span>
              <input
                type="text"
                value={a.name}
                onChange={(e) => {
                  const next = [...plan.adSets];
                  next[i] = { ...next[i], name: e.target.value };
                  setPlan({ ...plan, adSets: next });
                }}
                className="flex-1 bg-canvas border border-line rounded px-2 py-1 text-sm font-medium focus:outline-none focus:border-brand"
              />
            </div>
            <p className="text-[11px] text-muted">
              {a.optimizationGoal} · {a.billingEvent} · {a.destinationType}
              {a.dailyBudgetVND ? ` · ${a.dailyBudgetVND.toLocaleString('vi-VN')}đ/ngày` : ''}
            </p>
            <p className="text-[11px] text-subtle">
              {a.targeting.countries.join(', ')} · {a.targeting.ageMin}-{a.targeting.ageMax} · {a.targeting.genders?.join('/') || 'all'} · {a.targeting.interestLabels.join(', ') || 'no interests'}
            </p>

            <div className="space-y-1.5 pt-1 border-t border-line">
              <p className="text-[10px] uppercase tracking-wider text-subtle font-mono">Creatives ({a.creatives.length})</p>
              {a.creatives.map((cr, j) => {
                const banner = bannerById(cr.bannerHistoryId);
                return (
                  <div key={j} className="flex gap-2 bg-canvas border border-line rounded p-2">
                    {banner ? (
                      <img src={proxiedBannerUrl(banner.imageUrl)} alt="" className="w-12 h-12 object-cover rounded border border-line shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-raised border border-dashed border-line flex items-center justify-center text-muted shrink-0">
                        <ImageIcon size={14} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-fg truncate">{cr.name}</p>
                      <p className="text-[11px] text-fg line-clamp-2 leading-snug">{cr.primaryText}</p>
                      <p className="text-[10px] text-subtle mt-0.5">
                        <span className="font-medium text-muted">H:</span> {cr.headline}
                        {cr.description && <> · <span className="font-medium text-muted">D:</span> {cr.description}</>}
                        {' · '}
                        <span className="font-mono bg-raised text-fg px-1 rounded">{cr.cta}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ────────────── Prompt building ──────────────

function buildSystemPrompt(): string {
  return `Bạn là Meta Ads strategist chuyên thị trường Việt Nam. Nhiệm vụ: thiết kế full Meta Ads campaign từ brief.

Output PHẢI là JSON hợp lệ duy nhất (không kèm markdown fence, không kèm giải thích), schema:

{
  "campaign": {
    "name": "string — tên campaign ≤60 chars",
    "objective": "OUTCOME_AWARENESS|OUTCOME_TRAFFIC|OUTCOME_ENGAGEMENT|OUTCOME_LEADS|OUTCOME_SALES|OUTCOME_APP_PROMOTION",
    "useCBO": true|false,
    "dailyBudgetVND": number (VND, đơn vị chính),
    "bidStrategy": "LOWEST_COST_WITHOUT_CAP",
    "notes": "string — 2-4 câu rationale chiến lược"
  },
  "adSets": [
    {
      "name": "string — tên ad set (audience angle)",
      "destinationType": "WEBSITE|ON_POST|MESSENGER|INSTAGRAM_DIRECT",
      "optimizationGoal": "string — phải hợp lệ với objective",
      "billingEvent": "IMPRESSIONS|LINK_CLICKS|POST_ENGAGEMENT",
      "dailyBudgetVND": number|null (null nếu CBO bật),
      "targeting": {
        "countries": ["VN"],
        "ageMin": 18,
        "ageMax": 45,
        "genders": ["male"]|["female"]|["male","female"]|null,
        "interestLabels": ["..."]
      },
      "creatives": [
        {
          "name": "string ≤60 chars",
          "primaryText": "string 150-500 chars — hook 100 đầu, AIDA/PAS, văn tự nhiên VN, có thể xuống dòng",
          "headline": "string ≤40 chars — câu chốt deal",
          "description": "string ≤30 chars — phụ",
          "cta": "SHOP_NOW|LEARN_MORE|SIGN_UP|BUY_NOW|CONTACT_US|GET_QUOTE|MESSAGE_PAGE|SUBSCRIBE|DOWNLOAD|GET_OFFER|NO_BUTTON",
          "destinationUrl": "string — landing URL hoặc empty",
          "bannerHistoryId": "string|null — chỉ điền nếu match với banner trong input",
          "tags": ["string"]
        }
      ]
    }
  ]
}

Quy tắc:
- 2-3 ad set với 2-3 ANGLE audience KHÁC NHAU (demographics OR interests). Đặt tên ad set thể hiện angle.
- Mỗi ad set 1-2 creative.
- Optimization goal map đúng objective:
  • OUTCOME_AWARENESS: REACH/IMPRESSIONS/AD_RECALL_LIFT/THRUPLAY
  • OUTCOME_TRAFFIC: LANDING_PAGE_VIEWS/LINK_CLICKS/IMPRESSIONS/REACH
  • OUTCOME_ENGAGEMENT (WEBSITE): OFFSITE_CONVERSIONS/LANDING_PAGE_VIEWS/LINK_CLICKS
  • OUTCOME_ENGAGEMENT (ON_POST): POST_ENGAGEMENT/IMPRESSIONS/REACH
  • OUTCOME_LEADS: LEAD_GENERATION/QUALITY_LEAD/OFFSITE_CONVERSIONS/LINK_CLICKS
  • OUTCOME_SALES: OFFSITE_CONVERSIONS/VALUE/CONVERSIONS
- Nếu user cung cấp banner list, gán mỗi creative MỘT bannerHistoryId phù hợp. Không gán quá 1.
- Nếu không có banner phù hợp, để bannerHistoryId = null.
- Primary text bám brand voice nếu cung cấp brand context.
- Không trả markdown, không trả comment, chỉ JSON.`;
}

function buildUserPrompt(brief: BriefInput, brand: BrandProject | undefined, banners: HistoryItem[]): string {
  const parts: string[] = [];

  parts.push(`Brief:\n${brief.product.trim()}\n`);
  parts.push(`Mục tiêu marketing: ${brief.goal} — ${OBJECTIVE_LABELS[brief.goal]}`);
  parts.push(`Daily budget gợi ý: ${brief.dailyBudgetVND.toLocaleString('vi-VN')}đ`);

  if (brief.audienceHint.trim()) {
    parts.push(`\nAudience hint:\n${brief.audienceHint.trim()}`);
  } else {
    parts.push(`\nKhông có audience hint — hãy đề xuất 2-3 angle audience khác nhau dựa trên sản phẩm.`);
  }

  if (brand) {
    parts.push(`\n${buildBrandContext(brand)}`);
  }

  if (banners.length > 0) {
    parts.push(`\nBanner có sẵn (${banners.length}). Format: ID — prompt tóm tắt:`);
    banners.forEach((b, i) => {
      parts.push(`  ${i + 1}. ${b.id} — ${(b.promptUsed || 'no prompt').slice(0, 100)}`);
    });
    parts.push(`\nGán mỗi creative một bannerHistoryId từ list trên (không trùng). Banner không phù hợp thì để null.`);
  } else {
    parts.push(`\nKhông có banner sẵn → để bannerHistoryId = null trong tất cả creative. User sẽ generate sau.`);
  }

  return parts.join('\n');
}

// ────────────── JSON extraction (robust) ──────────────

function extractJSON(text: string): any | null {
  if (!text) return null;
  // 1. Fenced ```json ... ```
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch {}
  }
  // 2. First { ... last }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch {}
  }
  return null;
}

function normalizePlan(raw: any, brief: BriefInput): AIPlan {
  const c = raw.campaign || {};
  const adSets = Array.isArray(raw.adSets) ? raw.adSets : (Array.isArray(raw.ad_sets) ? raw.ad_sets : []);

  return {
    campaign: {
      name: String(c.name || 'AI campaign').slice(0, 80),
      objective: (c.objective as AdCampaignObjective) || brief.goal,
      useCBO: typeof c.useCBO === 'boolean' ? c.useCBO : true,
      dailyBudgetVND: Number(c.dailyBudgetVND || c.daily_budget_vnd || brief.dailyBudgetVND),
      bidStrategy: c.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
      notes: c.notes || c.rationale || '',
    },
    adSets: adSets.map((a: any) => ({
      name: String(a.name || 'Ad set').slice(0, 80),
      destinationType: a.destinationType || a.destination_type || 'WEBSITE',
      optimizationGoal: a.optimizationGoal || a.optimization_goal || 'LANDING_PAGE_VIEWS',
      billingEvent: a.billingEvent || a.billing_event || 'IMPRESSIONS',
      dailyBudgetVND: a.dailyBudgetVND || a.daily_budget_vnd || undefined,
      targeting: {
        countries: Array.isArray(a.targeting?.countries) ? a.targeting.countries : ['VN'],
        ageMin: Number(a.targeting?.ageMin || a.targeting?.age_min || 18),
        ageMax: Number(a.targeting?.ageMax || a.targeting?.age_max || 55),
        genders: Array.isArray(a.targeting?.genders) ? a.targeting.genders : undefined,
        interestLabels: Array.isArray(a.targeting?.interestLabels || a.targeting?.interest_labels)
          ? (a.targeting.interestLabels || a.targeting.interest_labels)
          : [],
      },
      creatives: (Array.isArray(a.creatives) ? a.creatives : []).map((cr: any) => ({
        name: String(cr.name || 'Creative').slice(0, 80),
        primaryText: String(cr.primaryText || cr.primary_text || ''),
        headline: String(cr.headline || '').slice(0, 40),
        description: cr.description ? String(cr.description).slice(0, 30) : undefined,
        cta: (cr.cta as AdCTA) || 'SHOP_NOW',
        destinationUrl: cr.destinationUrl || cr.destination_url || '',
        bannerHistoryId: cr.bannerHistoryId || cr.banner_history_id || null,
        tags: Array.isArray(cr.tags) ? cr.tags : [],
      })),
    })),
  };
}
