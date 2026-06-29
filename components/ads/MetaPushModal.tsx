import React, { useMemo, useState } from 'react';
import {
  X, Send, AlertCircle, CheckCircle, Clipboard, Image as ImageIcon,
  Layers, Target, FileText, Sparkles, Loader2, ServerCog, Wand2, Edit3, Zap,
} from 'lucide-react';
import { AdCampaign, AdSet, AdCreative, HistoryItem, MetaAccount } from '../../types';
import {
  buildMetaPayload, buildMcpAgentPrompt, validateForPush,
  ValidationIssue, MetaPushPayload,
} from '../../services/metaPushPayload';
import { pushCampaign, PushResult, PushStepResult, EndpointUnavailableError } from '../../services/metaPushClient';
import { saveCreativeToCloud } from '../../services/adCreativeService';

interface Props {
  campaign: AdCampaign;
  adSets: AdSet[];
  creatives: AdCreative[];
  banners: HistoryItem[];
  metaAccounts: MetaAccount[];
  onClose: () => void;
  onPushed?: () => Promise<void> | void;
  /** Refresh source-of-truth data after an auto-fix mutates a creative. */
  onRefresh?: () => Promise<void> | void;
  /** Open the Creative Editor for manual fixes — caller closes this modal first. */
  onEditCreative?: (creativeId: string) => void;
}

type PreviewTab = 'validation' | 'payload' | 'agent' | 'result';

export const MetaPushModal: React.FC<Props> = ({ campaign, adSets, creatives, banners, metaAccounts, onClose, onPushed, onRefresh, onEditCreative }) => {
  const [tab, setTab] = useState<PreviewTab>('validation');
  const [pushing, setPushing] = useState<'idle' | 'dry' | 'real'>('idle');
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);   // creativeId being fixed
  const [fixToast, setFixToast] = useState<string | null>(null);

  const campaignAdSets = adSets.filter(a => a.campaignId === campaign.id);
  const campaignCreatives = creatives.filter(c => c.campaignId === campaign.id);

  /** Auto-fix: assign a creative to a target ad set. Saves to cloud + refresh. */
  const handleAutoAssignAdset = async (creativeId: string, adsetId: string) => {
    const c = creatives.find(x => x.id === creativeId);
    if (!c) return;
    setFixing(creativeId);
    setFixToast(null);
    try {
      await saveCreativeToCloud({ ...c, adsetId, updatedAt: Date.now() });
      const adsetName = adSets.find(a => a.id === adsetId)?.name || 'ad set';
      setFixToast(`Đã gán creative "${c.name || c.id.slice(0,8)}" vào "${adsetName}"`);
      if (onRefresh) await onRefresh();
      setTimeout(() => setFixToast(null), 3500);
    } catch (e: any) {
      setFixToast(`Fix lỗi: ${e?.message || e}`);
    } finally {
      setFixing(null);
    }
  };

  /** Batch auto-fix: every fixable issue gets applied in sequence. */
  const handleAutoFixAll = async () => {
    setFixing('all');
    setFixToast(null);
    try {
      let count = 0;
      for (const i of report.issues) {
        if (i.fix?.type === 'auto-assign-adset') {
          const c = creatives.find(x => x.id === i.fix.creativeId);
          if (!c) continue;
          await saveCreativeToCloud({ ...c, adsetId: i.fix.adsetId, updatedAt: Date.now() });
          count++;
        }
      }
      if (onRefresh) await onRefresh();
      setFixToast(count > 0 ? `Đã sửa ${count} creative tự động` : 'Không có lỗi nào tự sửa được');
      setTimeout(() => setFixToast(null), 3500);
    } catch (e: any) {
      setFixToast(`Fix lỗi: ${e?.message || e}`);
    } finally {
      setFixing(null);
    }
  };

  const handleEditCreativeClick = (creativeId: string) => {
    if (onEditCreative) {
      onClose();
      onEditCreative(creativeId);
    }
  };

  const runPush = async (dryRun: boolean) => {
    setPushError(null);
    setPushing(dryRun ? 'dry' : 'real');
    try {
      const result = await pushCampaign(campaign.id, { dryRun });
      setPushResult(result);
      // Always switch to Result tab — success OR partial failure with steps.
      setTab('result');
      if (!dryRun && result.success && onPushed) {
        await onPushed();
      }
    } catch (e: any) {
      // If Edge function is not deployed (Vite dev mode), fall back to local
      // dry-run using the same payload we already computed for the preview tabs.
      if (e instanceof EndpointUnavailableError && dryRun) {
        setPushResult({
          mode: 'dry-run',
          success: report.canPush,
          campaignId: campaign.id,
          payload,
          errors: report.errors.map(x => `[${x.scope}.${x.field}] ${x.message}`),
          warnings: report.warnings.map(x => `[${x.scope}.${x.field}] ${x.message}`),
          message: `Edge function chưa available (${e.message}). Đây là dry-run client-side, dùng cùng validator + payload builder.`,
        });
        setTab('result');
      } else {
        setPushError(e?.message || 'Push lỗi');
      }
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-canvas border border-line rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-brand text-white p-2 rounded-lg shrink-0">
              <Send size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-fg truncate">Meta push preview</h3>
              <p className="text-sm text-muted truncate">
                {campaign.name} · {campaignAdSets.length} ad set · {campaignCreatives.length} creative
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-raised text-muted hover:text-fg">
            <X size={18} />
          </button>
        </header>

        {/* Top status banner */}
        <div className={`px-6 py-3 border-b border-line text-sm flex items-center gap-2 ${
          report.canPush ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
        }`}>
          {report.canPush ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span className="flex-1 font-medium">
            {report.canPush
              ? `Sẵn sàng push — ${report.warnings.length} cảnh báo, 0 lỗi`
              : `Chưa thể push — ${report.errors.length} lỗi, ${report.warnings.length} cảnh báo`}
          </span>
          <span className="text-xs font-mono opacity-70">Meta API {payload.apiVersion}</span>
        </div>

        <div className="border-b border-line bg-surface px-6">
          <div className="flex gap-1">
            {([
              { id: 'validation', label: `Validation (${report.issues.length})`, icon: <AlertCircle size={14} /> },
              { id: 'payload',    label: 'Meta API payload',              icon: <FileText size={14} /> },
              { id: 'agent',      label: 'Agent prompt (MCP)',            icon: <Sparkles size={14} /> },
              ...(pushResult ? [{ id: 'result', label: `Push result · ${pushResult.mode}`, icon: <ServerCog size={14} /> }] : []),
            ] as { id: PreviewTab; label: string; icon: React.ReactNode }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-sm px-3 py-3 border-b-2 transition-colors flex items-center gap-2 font-medium ${
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
            <ValidationView
              issues={report.issues}
              fixingId={fixing}
              autoFixableCount={report.issues.filter(i => i.fix?.type === 'auto-assign-adset').length}
              onAutoFixAll={handleAutoFixAll}
              onAutoAssignAdset={handleAutoAssignAdset}
              onEditCreative={handleEditCreativeClick}
            />
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
          <div className="mx-6 mb-3 status-danger border text-sm px-3 py-2.5 rounded-lg flex items-center gap-2">
            <AlertCircle size={14} /> {pushError}
          </div>
        )}

        {fixToast && (
          <div className="mx-6 mb-3 status-success border text-sm px-3 py-2.5 rounded-lg flex items-center gap-2">
            <CheckCircle size={14} /> {fixToast}
          </div>
        )}

        <footer className="px-6 py-4 border-t border-line bg-surface space-y-3">
          <div className="flex items-start gap-2 status-warning border px-3 py-2 rounded-lg text-sm">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>
              Mọi push từ app này lên Meta đều ở trạng thái <b>PAUSED</b>. Bạn review + activate thủ công trên Meta Ads Manager.
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Push thật cần env <code className="text-fg bg-raised px-1 py-0.5 rounded">META_SYSTEM_USER_TOKEN</code> ở Vercel. Không token → server tự dry-run.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => runPush(true)}
                disabled={pushing !== 'idle'}
                className="text-sm px-4 py-2 rounded-lg bg-canvas hover:bg-raised text-fg border border-line-strong flex items-center gap-2 disabled:opacity-50 font-medium"
                title="Gọi Edge function ở chế độ dry-run, không POST lên Meta"
              >
                {pushing === 'dry' ? <Loader2 size={14} className="animate-spin" /> : <ServerCog size={14} />}
                Test (dry-run)
              </button>
              <button
                onClick={() => {
                  if (!report.canPush) return;
                  if (!confirm('Push lên Meta (PAUSED)?\nTất cả ad sẽ tạo ở trạng thái paused — bạn vào Meta Ads Manager review + activate thủ công.')) return;
                  runPush(false);
                }}
                disabled={pushing !== 'idle' || !report.canPush}
                className="text-sm px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                {pushing === 'real' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Push to Meta (PAUSED)
              </button>
              <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-muted hover:text-fg hover:bg-raised">
                Đóng
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

// ────────────── Validation tab ──────────────

const ValidationView: React.FC<{
  issues: ValidationIssue[];
  fixingId: string | null;
  autoFixableCount: number;
  onAutoFixAll: () => void;
  onAutoAssignAdset: (creativeId: string, adsetId: string) => void;
  onEditCreative: (creativeId: string) => void;
}> = ({ issues, fixingId, autoFixableCount, onAutoFixAll, onAutoAssignAdset, onEditCreative }) => {
  if (issues.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto w-14 h-14 rounded-full status-success border flex items-center justify-center mb-4">
          <CheckCircle size={28} />
        </div>
        <p className="text-base font-semibold text-fg">Không có vấn đề gì</p>
        <p className="text-sm text-muted mt-1">Tất cả required fields đã đầy đủ — payload sẵn sàng.</p>
      </div>
    );
  }

  const byScope: Record<string, ValidationIssue[]> = {};
  for (const i of issues) (byScope[i.scope] ||= []).push(i);
  const ORDER: ValidationIssue['scope'][] = ['campaign', 'adset', 'creative'];
  const ICON: Record<ValidationIssue['scope'], React.ReactNode> = {
    campaign: <Layers size={14} />,
    adset:    <Target size={14} />,
    creative: <ImageIcon size={14} />,
  };

  return (
    <div className="space-y-3">
      {/* Top-level auto-fix banner */}
      {autoFixableCount > 0 && (
        <div className="status-info border rounded-xl p-3 flex items-center gap-3">
          <Wand2 size={18} className="shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">{autoFixableCount} lỗi có thể tự sửa</p>
            <p className="text-xs opacity-80">
              Creative chưa gán Ad Set → tự gán vào Ad Set đầu tiên của campaign
            </p>
          </div>
          <button
            onClick={onAutoFixAll}
            disabled={fixingId === 'all'}
            className="text-sm bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {fixingId === 'all' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Sửa tự động hết
          </button>
        </div>
      )}

      {ORDER.filter(s => byScope[s]?.length).map(scope => (
        <div key={scope} className="bg-surface border border-line rounded-xl overflow-hidden">
          <header className="px-4 py-2.5 border-b border-line flex items-center gap-2 bg-canvas">
            <span className="text-muted">{ICON[scope]}</span>
            <span className="text-sm font-semibold text-fg capitalize">{scope}</span>
            <span className="text-xs text-muted">({byScope[scope].length})</span>
          </header>
          <div className="divide-y divide-line">
            {byScope[scope].map((i, idx) => (
              <div key={idx} className="px-4 py-3 flex items-start gap-3 text-sm">
                <span className={`mt-0.5 shrink-0 ${i.level === 'error' ? 'text-danger' : 'text-warning'}`}>
                  <AlertCircle size={14} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-fg leading-relaxed">{i.message}</p>
                  <p className="text-xs text-muted font-mono mt-0.5">
                    {i.scope}.{i.field} · {i.refId.slice(0, 8)}
                  </p>
                </div>

                {/* Inline fix button */}
                {i.fix?.type === 'auto-assign-adset' && (
                  <button
                    onClick={() => onAutoAssignAdset(i.fix!.type === 'auto-assign-adset' ? (i.fix as any).creativeId : '', (i.fix as any).adsetId)}
                    disabled={fixingId === i.refId || fixingId === 'all'}
                    className="text-xs bg-brand hover:bg-brand-dark text-white px-2.5 py-1.5 rounded-md font-medium flex items-center gap-1 shrink-0 disabled:opacity-50"
                    title={`Tự động gán vào "${(i.fix as any).adsetName}"`}
                  >
                    {fixingId === i.refId ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                    Gán → {(i.fix as any).adsetName.slice(0, 16)}
                  </button>
                )}
                {i.fix?.type === 'edit-creative' && (
                  <button
                    onClick={() => onEditCreative((i.fix as any).creativeId)}
                    className="text-xs bg-canvas hover:bg-raised text-fg border border-line-strong px-2.5 py-1.5 rounded-md font-medium flex items-center gap-1 shrink-0"
                    title="Mở Editor để sửa"
                  >
                    <Edit3 size={11} /> Sửa
                  </button>
                )}

                <span className={`text-xs font-mono px-2 py-0.5 rounded-md border shrink-0 ${
                  i.level === 'error' ? 'status-danger' : 'status-warning'
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
    <div className="bg-surface border border-line rounded-xl overflow-hidden">
      <header className="px-4 py-2.5 border-b border-line flex items-center gap-2 bg-canvas">
        <span className="text-muted">{icon}</span>
        <span className="text-sm font-semibold text-fg flex-1">{title}</span>
        <button
          onClick={copy}
          className="text-xs text-muted hover:text-fg flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line-strong hover:bg-raised"
        >
          <Clipboard size={12} />
          {copied ? 'Đã copy' : 'Copy JSON'}
        </button>
      </header>
      <pre className="text-xs font-mono text-fg p-3 overflow-x-auto whitespace-pre max-h-[280px] bg-canvas">
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
      <div className={`p-4 rounded-xl border ${
        result.success ? 'status-success' : 'status-danger'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          {result.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-base font-semibold">
            {result.mode === 'dry-run' ? 'Dry-run' : 'Push'}
            {result.success ? ' thành công' : ' có lỗi'}
          </span>
        </div>
        {result.message && (
          <p className="text-sm leading-relaxed">{result.message}</p>
        )}
        {result.metaCampaignId && (
          <p className="text-sm mt-2 font-mono">
            Meta campaign id: <span className="text-fg font-semibold">{result.metaCampaignId}</span>
          </p>
        )}
      </div>

      {result.errors && result.errors.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-danger font-mono mb-2">Errors ({result.errors.length})</p>
          {result.errors.map((e, i) => (
            <p key={i} className="text-sm text-fg">• {e}</p>
          ))}
        </div>
      )}

      {result.warnings && result.warnings.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-warning font-mono mb-2">Warnings ({result.warnings.length})</p>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-sm text-fg">• {w}</p>
          ))}
        </div>
      )}

      {result.steps && result.steps.length > 0 && (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <header className="px-4 py-2.5 border-b border-line bg-canvas">
            <p className="text-xs uppercase tracking-wider text-muted font-mono">Steps ({result.steps.length})</p>
          </header>
          <div className="divide-y divide-line">
            {result.steps.map((s, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-2 text-sm">
                <span className="text-muted">{STEP_ICON[s.step]}</span>
                <span className="font-mono text-fg w-20">{s.step}</span>
                {s.localId && <span className="text-xs text-muted font-mono">{s.localId.slice(0, 8)}</span>}
                {s.metaId && <span className="text-xs text-success font-mono">→ {s.metaId}</span>}
                {s.imageHash && <span className="text-xs text-success font-mono">hash: {s.imageHash.slice(0, 12)}…</span>}
                <span className="flex-1" />
                {s.error && <span className="text-xs text-danger truncate max-w-[280px]" title={s.error}>{s.error}</span>}
                <span className={`text-xs font-mono px-2 py-0.5 rounded-md border ${
                  s.status === 'ok'     ? 'status-success' :
                  s.status === 'failed' ? 'status-danger' :
                                          'bg-raised text-muted border-line'
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
      <div className="bg-surface border border-line rounded-xl p-4 text-sm text-muted space-y-1.5 leading-relaxed">
        <p>
          <b className="text-fg">Cách dùng:</b> copy prompt bên dưới → paste vào Claude (Desktop) hoặc OpenClaw đã enable Pipeboard MCP.
        </p>
        <p>Agent sẽ chạy từng step (upload image → campaign → adsets → creatives → ads) và return Meta IDs.</p>
        <p>
          Initial status <code className="bg-canvas text-fg px-1.5 py-0.5 rounded font-mono">PAUSED</code> — review trên Meta trước khi activate.
        </p>
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <header className="px-4 py-2.5 border-b border-line flex items-center gap-2 bg-canvas">
          <Sparkles size={14} className="text-brand" />
          <span className="text-sm font-semibold text-fg flex-1">MCP agent instructions</span>
          <button
            onClick={copy}
            className="text-sm bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium"
          >
            <Clipboard size={12} />
            {copied ? 'Đã copy' : 'Copy full prompt'}
          </button>
        </header>
        <pre className="text-xs font-mono text-fg p-3 overflow-x-auto whitespace-pre max-h-[420px] bg-canvas">
          {prompt}
        </pre>
      </div>
    </div>
  );
};
