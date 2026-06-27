import React, { useMemo, useState } from 'react';
import {
  X, Send, AlertCircle, CheckCircle, Clipboard, Image as ImageIcon,
  Layers, Target, FileText, Sparkles, Loader2, ServerCog,
} from 'lucide-react';
import { AdCampaign, AdSet, AdCreative, HistoryItem, MetaAccount } from '../../types';
import {
  buildMetaPayload, buildMcpAgentPrompt, validateForPush,
  ValidationIssue, MetaPushPayload,
} from '../../services/metaPushPayload';
import { pushCampaign, PushResult, PushStepResult } from '../../services/metaPushClient';

interface Props {
  campaign: AdCampaign;
  adSets: AdSet[];
  creatives: AdCreative[];
  banners: HistoryItem[];
  metaAccounts: MetaAccount[];
  onClose: () => void;
  onPushed?: () => Promise<void> | void;
}

type PreviewTab = 'validation' | 'payload' | 'agent' | 'result';

export const MetaPushModal: React.FC<Props> = ({ campaign, adSets, creatives, banners, metaAccounts, onClose, onPushed }) => {
  const [tab, setTab] = useState<PreviewTab>('validation');
  const [pushing, setPushing] = useState<'idle' | 'dry' | 'real'>('idle');
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const campaignAdSets = adSets.filter(a => a.campaignId === campaign.id);
  const campaignCreatives = creatives.filter(c => c.campaignId === campaign.id);

  const runPush = async (dryRun: boolean) => {
    setPushError(null);
    setPushing(dryRun ? 'dry' : 'real');
    try {
      const result = await pushCampaign(campaign.id, { dryRun });
      setPushResult(result);
      setTab('result');
      if (!dryRun && result.success && onPushed) {
        await onPushed();
      }
    } catch (e: any) {
      setPushError(e?.message || 'Push lỗi');
    } finally {
      setPushing('idle');
    }
  };

  const report = useMemo(
    () => validateForPush(campaign, campaignAdSets, creatives, banners, metaAccounts),
    [campaign, campaignAdSets, creatives, banners, metaAccounts],
  );

  const payload = useMemo(
    () => buildMetaPayload(campaign, campaignAdSets, creatives, banners, metaAccounts),
    [campaign, campaignAdSets, creatives, banners, metaAccounts],
  );

  const agentPrompt = useMemo(
    () => buildMcpAgentPrompt(payload),
    [payload],
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line bg-surface/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-brand/15 text-brand p-2 rounded-md border border-brand/30">
              <Send size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-fg truncate">Meta push preview · {campaign.name}</h3>
              <p className="text-[11px] text-subtle">
                {campaignAdSets.length} ad set · {campaignCreatives.length} creative · {payload.uploads.length} image upload
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg">
            <X size={16} />
          </button>
        </header>

        {/* Top status banner */}
        <div className={`px-5 py-2.5 border-b border-line text-xs flex items-center gap-2 ${
          report.canPush
            ? 'bg-emerald-500/5 text-emerald-300'
            : 'bg-red-500/5 text-red-300'
        }`}>
          {report.canPush ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          <span className="flex-1">
            {report.canPush
              ? `Sẵn sàng push — ${report.warnings.length} cảnh báo, 0 lỗi`
              : `Chưa thể push — ${report.errors.length} lỗi, ${report.warnings.length} cảnh báo`}
          </span>
          <span className="text-[10px] font-mono text-subtle">Meta API {payload.apiVersion}</span>
        </div>

        <div className="border-b border-line bg-surface/30 px-5">
          <div className="flex gap-1">
            {([
              { id: 'validation', label: `Validation (${report.issues.length})`, icon: <AlertCircle size={12} /> },
              { id: 'payload',    label: 'Meta API payload',              icon: <FileText size={12} /> },
              { id: 'agent',      label: 'Agent prompt (MCP)',            icon: <Sparkles size={12} /> },
              ...(pushResult ? [{ id: 'result', label: `Push result · ${pushResult.mode}`, icon: <ServerCog size={12} /> }] : []),
            ] as { id: PreviewTab; label: string; icon: React.ReactNode }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                  tab === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'validation' && (
            <ValidationView issues={report.issues} />
          )}
          {tab === 'payload' && (
            <PayloadView payload={payload} />
          )}
          {tab === 'agent' && (
            <AgentView prompt={agentPrompt} />
          )}
          {tab === 'result' && pushResult && (
            <ResultView result={pushResult} />
          )}
        </div>

        {pushError && (
          <div className="mx-5 mb-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded flex items-center gap-2">
            <AlertCircle size={12} /> {pushError}
          </div>
        )}

        <footer className="px-5 py-3 border-t border-line bg-surface/60 flex items-center justify-between gap-2">
          <p className="text-[10px] text-subtle">
            Push thật cần env <code className="text-fg">META_SYSTEM_USER_TOKEN</code> ở Vercel.
            Không có token → dry-run.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => runPush(true)}
              disabled={pushing !== 'idle'}
              className="text-xs px-3 py-2 rounded-md bg-raised hover:bg-raised-2 text-fg flex items-center gap-1.5 disabled:opacity-50"
              title="Gọi Edge function ở chế độ dry-run, không POST lên Meta"
            >
              {pushing === 'dry' ? <Loader2 size={12} className="animate-spin" /> : <ServerCog size={12} />}
              Test (dry-run)
            </button>
            <button
              onClick={() => {
                if (!report.canPush) return;
                if (!confirm('Push lên Meta? Status mặc định PAUSED, bạn review trên Ads Manager rồi activate.')) return;
                runPush(false);
              }}
              disabled={pushing !== 'idle' || !report.canPush}
              className="text-xs px-4 py-2 rounded-md bg-brand hover:bg-brand-dark text-white font-medium shadow-pop flex items-center gap-1.5 disabled:opacity-50 disabled:shadow-none"
            >
              {pushing === 'real' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Push to Meta
            </button>
            <button onClick={onClose} className="text-xs px-3 py-2 rounded-md text-muted hover:text-fg">
              Đóng
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

// ────────────── Validation tab ──────────────

const ValidationView: React.FC<{ issues: ValidationIssue[] }> = ({ issues }) => {
  if (issues.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center justify-center mb-3">
          <CheckCircle size={24} />
        </div>
        <p className="text-sm font-semibold text-fg">Không có vấn đề gì</p>
        <p className="text-[11px] text-subtle">Tất cả required fields đã đầy đủ — payload sẵn sàng.</p>
      </div>
    );
  }

  // Group by scope
  const byScope: Record<string, ValidationIssue[]> = {};
  for (const i of issues) (byScope[i.scope] ||= []).push(i);
  const ORDER: ValidationIssue['scope'][] = ['campaign', 'adset', 'creative'];
  const ICON: Record<ValidationIssue['scope'], React.ReactNode> = {
    campaign: <Layers size={12} />,
    adset:    <Target size={12} />,
    creative: <ImageIcon size={12} />,
  };

  return (
    <div className="space-y-3">
      {ORDER.filter(s => byScope[s]?.length).map(scope => (
        <div key={scope} className="bg-surface border border-line rounded-lg overflow-hidden">
          <header className="px-3 py-2 border-b border-line flex items-center gap-2 bg-canvas/40">
            <span className="text-muted">{ICON[scope]}</span>
            <span className="text-xs font-semibold text-fg capitalize">{scope}</span>
            <span className="text-[10px] text-subtle">({byScope[scope].length})</span>
          </header>
          <div className="divide-y divide-line">
            {byScope[scope].map((i, idx) => (
              <div key={idx} className="px-3 py-2 flex items-start gap-2 text-xs">
                <span className={`mt-0.5 shrink-0 ${i.level === 'error' ? 'text-red-300' : 'text-amber-300'}`}>
                  {i.level === 'error' ? <AlertCircle size={12} /> : <AlertCircle size={12} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-fg">{i.message}</p>
                  <p className="text-[10px] text-subtle font-mono">
                    {i.scope}.{i.field} · {i.refId.slice(0, 8)}
                  </p>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  i.level === 'error'
                    ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}>
                  {i.level}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ────────────── Payload tab ──────────────

const PayloadView: React.FC<{ payload: MetaPushPayload }> = ({ payload }) => {
  return (
    <div className="space-y-3">
      <Section
        icon={<ImageIcon size={12} />}
        title={`Step 1 — Image upload (${payload.uploads.length})`}
        body={payload.uploads.length === 0
          ? '// Không có image cần upload'
          : payload.uploads.map((u, i) => `# Upload ${i + 1}: banner ${u.localBannerId}\nPOST /${payload.apiVersion}/${payload.accountId}/adimages\n  multipart bytes=<fetch ${u.sourceUrl}>\n  → returns image_hash`).join('\n\n')}
        copyText={JSON.stringify(payload.uploads, null, 2)}
      />
      <Section
        icon={<Layers size={12} />}
        title="Step 2 — Create campaign"
        body={`POST ${payload.campaign.endpoint}\n${JSON.stringify(payload.campaign.body, null, 2)}`}
        copyText={JSON.stringify(payload.campaign.body, null, 2)}
      />
      <Section
        icon={<Target size={12} />}
        title={`Step 3 — Create ad sets (${payload.adSets.length})`}
        body={payload.adSets.map((a, i) => `# Ad set ${i + 1}: ${a.localId}\nPOST ${a.endpoint}\n${JSON.stringify({ ...a.body, campaign_id: '<CAMPAIGN_ID>' }, null, 2)}`).join('\n\n')}
        copyText={JSON.stringify(payload.adSets.map(a => a.body), null, 2)}
      />
      <Section
        icon={<ImageIcon size={12} />}
        title={`Step 4 — Create creatives (${payload.creatives.length})`}
        body={payload.creatives.map((c, i) => `# Creative ${i + 1}: ${c.localId} (banner ${c.localBannerId})\nPOST ${c.endpoint}\n${JSON.stringify(c.body, null, 2).replace(/"__FILLED_AFTER_UPLOAD__"/g, '"<IMAGE_HASH>"')}`).join('\n\n')}
        copyText={JSON.stringify(payload.creatives.map(c => c.body), null, 2)}
      />
      <Section
        icon={<Send size={12} />}
        title={`Step 5 — Create ads (${payload.ads.length})`}
        body={payload.ads.map((ad, i) => `# Ad ${i + 1}\nPOST ${ad.endpoint}\n${JSON.stringify({ ...ad.body, adset_id: `<ADSET_${ad.localAdsetId}>`, creative: { creative_id: `<CREATIVE_${ad.localCreativeId}>` } }, null, 2)}`).join('\n\n')}
        copyText={JSON.stringify(payload.ads.map(a => a.body), null, 2)}
      />
    </div>
  );
};

const Section: React.FC<{ icon: React.ReactNode; title: string; body: string; copyText: string }> = ({ icon, title, body, copyText }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(copyText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden">
      <header className="px-3 py-2 border-b border-line flex items-center gap-2 bg-canvas/40">
        <span className="text-muted">{icon}</span>
        <span className="text-xs font-semibold text-fg flex-1">{title}</span>
        <button
          onClick={copy}
          className="text-[10px] text-muted hover:text-fg flex items-center gap-1 px-2 py-1 rounded border border-line hover:border-line-strong"
        >
          <Clipboard size={10} />
          {copied ? 'Đã copy' : 'Copy JSON'}
        </button>
      </header>
      <pre className="text-[10px] font-mono text-fg/85 p-3 overflow-x-auto whitespace-pre max-h-[280px]">
        {body}
      </pre>
    </div>
  );
};

// ────────────── Result tab ──────────────

const STEP_ICON: Record<PushStepResult['step'], React.ReactNode> = {
  upload:   <ImageIcon size={12} />,
  campaign: <Layers size={12} />,
  adset:    <Target size={12} />,
  creative: <FileText size={12} />,
  ad:       <Send size={12} />,
};

const ResultView: React.FC<{ result: PushResult }> = ({ result }) => {
  return (
    <div className="space-y-3">
      <div className={`p-4 rounded-lg border ${
        result.success
          ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-200'
          : 'bg-red-500/5 border-red-500/30 text-red-200'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          {result.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span className="text-sm font-semibold">
            {result.mode === 'dry-run' ? 'Dry-run' : 'Push'}
            {result.success ? ' thành công' : ' có lỗi'}
          </span>
        </div>
        {result.message && (
          <p className="text-xs">{result.message}</p>
        )}
        {result.metaCampaignId && (
          <p className="text-[11px] mt-1 font-mono">
            Meta campaign id: <span className="text-fg">{result.metaCampaignId}</span>
          </p>
        )}
      </div>

      {result.errors && result.errors.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-red-300 font-mono">Errors ({result.errors.length})</p>
          {result.errors.map((e, i) => (
            <p key={i} className="text-xs text-red-200">• {e}</p>
          ))}
        </div>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-amber-300 font-mono">Warnings ({result.warnings.length})</p>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-200">• {w}</p>
          ))}
        </div>
      )}

      {result.steps && result.steps.length > 0 && (
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <header className="px-3 py-2 border-b border-line bg-canvas/40">
            <p className="text-[10px] uppercase tracking-wider text-subtle font-mono">Steps ({result.steps.length})</p>
          </header>
          <div className="divide-y divide-line">
            {result.steps.map((s, i) => (
              <div key={i} className="px-3 py-2 flex items-center gap-2 text-xs">
                <span className="text-muted">{STEP_ICON[s.step]}</span>
                <span className="font-mono text-fg w-20">{s.step}</span>
                {s.localId && <span className="text-[10px] text-subtle font-mono">{s.localId.slice(0, 8)}</span>}
                {s.metaId && <span className="text-[10px] text-emerald-300 font-mono">→ {s.metaId}</span>}
                {s.imageHash && <span className="text-[10px] text-emerald-300 font-mono">hash: {s.imageHash.slice(0, 12)}…</span>}
                <span className="flex-1" />
                {s.error && <span className="text-[10px] text-red-300 truncate max-w-[280px]" title={s.error}>{s.error}</span>}
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  s.status === 'ok'      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                  s.status === 'failed'  ? 'bg-red-500/15 text-red-300 border border-red-500/30' :
                                           'bg-raised text-muted border border-line'
                }`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ────────────── Agent prompt tab ──────────────

const AgentView: React.FC<{ prompt: string }> = ({ prompt }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <div className="space-y-3">
      <div className="bg-surface border border-line rounded-lg p-3 text-[11px] text-muted space-y-1">
        <p>
          <b className="text-fg">Cách dùng:</b> copy prompt bên dưới → paste vào Claude (Desktop) hoặc OpenClaw đã enable Pipeboard MCP.
        </p>
        <p>
          Agent sẽ chạy từng step (upload image → campaign → adsets → creatives → ads) và return Meta IDs.
        </p>
        <p className="text-subtle">
          Initial status mặc định <code className="bg-canvas text-fg px-1 rounded">PAUSED</code> — review trên Meta trước khi activate.
        </p>
      </div>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <header className="px-3 py-2 border-b border-line flex items-center gap-2 bg-canvas/40">
          <Sparkles size={12} className="text-brand" />
          <span className="text-xs font-semibold text-fg flex-1">MCP agent instructions</span>
          <button
            onClick={copy}
            className="text-xs bg-brand hover:bg-brand-dark text-white px-2.5 py-1 rounded flex items-center gap-1 shadow-pop"
          >
            <Clipboard size={11} />
            {copied ? 'Đã copy' : 'Copy full prompt'}
          </button>
        </header>
        <pre className="text-[10px] font-mono text-fg/85 p-3 overflow-x-auto whitespace-pre max-h-[420px]">
          {prompt}
        </pre>
      </div>
    </div>
  );
};
