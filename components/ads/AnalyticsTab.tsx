import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, RefreshCw, Loader2, AlertCircle, TrendingUp, Eye, MousePointerClick,
  DollarSign, Target, Trophy,
} from 'lucide-react';
import { AdCampaign, MetaAccount } from '../../types';
import {
  fetchInsights, InsightRow, InsightDatePreset,
} from '../../services/metaFetchService';
import {
  listMetaAccountsFromCloud, MetaAccountsSetupRequiredError,
} from '../../services/metaAccountsService';

interface Props {
  campaigns: AdCampaign[];
}

const DATE_PRESETS: { id: InsightDatePreset; label: string }[] = [
  { id: 'today',      label: 'Hôm nay' },
  { id: 'yesterday',  label: 'Hôm qua' },
  { id: 'last_7d',    label: '7 ngày' },
  { id: 'last_14d',   label: '14 ngày' },
  { id: 'last_30d',   label: '30 ngày' },
  { id: 'this_month', label: 'Tháng này' },
  { id: 'last_month', label: 'Tháng trước' },
  { id: 'lifetime',   label: 'Lifetime' },
];

type SortKey = 'spend' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'roas' | 'leads' | 'purchases';

export const AnalyticsTab: React.FC<Props> = ({ campaigns }) => {
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<InsightDatePreset>('last_7d');
  const [rows, setRows] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Load Meta accounts once
  useEffect(() => {
    listMetaAccountsFromCloud()
      .then(accs => {
        setMetaAccounts(accs);
        const def = accs.find(a => a.isDefault) || accs[0];
        if (def && !accountId) setAccountId(def.accountId);
      })
      .catch(e => {
        if (!(e instanceof MetaAccountsSetupRequiredError)) {
          console.warn('metaAccounts load failed', e);
        }
      });
  }, []);

  const load = async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetchInsights({ accountId, level: 'campaign', datePreset });
      setRows(r);
      setFetchedAt(Date.now());
    } catch (e: any) {
      setError(e?.message || 'Fetch insights lỗi');
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on account/preset change
  useEffect(() => {
    if (accountId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, datePreset]);

  // Account-level rollup
  const totals = useMemo(() => {
    return rows.reduce((t, r) => ({
      spend:       t.spend + r.spend,
      impressions: t.impressions + r.impressions,
      clicks:      t.clicks + r.clicks,
      reach:       t.reach + r.reach,
      leads:       t.leads + (r.leads || 0),
      purchases:   t.purchases + (r.purchases || 0),
      purchaseValue: t.purchaseValue + (r.purchaseValue || 0),
    }), { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, purchases: 0, purchaseValue: 0 });
  }, [rows]);

  const ctr  = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpc  = totals.clicks > 0      ? totals.spend / totals.clicks                : 0;
  const cpm  = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000  : 0;
  const roas = totals.spend > 0       ? totals.purchaseValue / totals.spend         : 0;

  const sorted = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      const av = (a[sortKey] as number) || 0;
      const bv = (b[sortKey] as number) || 0;
      return (av - bv) * dir;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  // Pick top performer (highest ROAS if any, else most leads, else most clicks)
  const topPerformer = useMemo(() => {
    if (rows.length === 0) return null;
    const withRoas = rows.filter(r => r.roas && r.roas > 0);
    if (withRoas.length > 0) return withRoas.sort((a, b) => (b.roas! - a.roas!))[0];
    const withLeads = rows.filter(r => r.leads && r.leads > 0);
    if (withLeads.length > 0) return withLeads.sort((a, b) => (b.leads! - a.leads!))[0];
    return rows.sort((a, b) => b.clicks - a.clicks)[0];
  }, [rows]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  if (metaAccounts.length === 0) {
    return (
      <div className="py-16 text-center text-muted">
        <BarChart3 size={36} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">Chưa cấu hình Meta Account.</p>
        <p className="text-xs text-subtle mt-1">Vào Settings → Meta Accounts → Thêm account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-fg flex items-center gap-2">
            <BarChart3 size={16} className="text-success" />
            Analytics
          </h2>
          <p className="text-[11px] text-subtle">
            Insights kéo từ Meta qua Pipeboard. 1 fetch = 1 Pipeboard call.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="text-xs bg-canvas border border-line rounded-md px-2.5 py-1.5 focus:outline-none focus:border-brand"
          >
            {metaAccounts.map(a => (
              <option key={a.id} value={a.accountId}>{a.label}</option>
            ))}
          </select>
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as InsightDatePreset)}
            className="text-xs bg-canvas border border-line rounded-md px-2.5 py-1.5 focus:outline-none focus:border-brand"
          >
            {DATE_PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={load}
            disabled={loading || !accountId}
            className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Fetch
          </button>
        </div>
      </div>

      {fetchedAt && (
        <p className="text-[11px] text-subtle">
          Cập nhật: {new Date(fetchedAt).toLocaleString('vi-VN')} · {rows.length} campaign
        </p>
      )}

      {error && (
        <div className="status-danger border text-xs px-3 py-2 rounded-lg flex items-center gap-2">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {!loading && rows.length === 0 && !error && fetchedAt && (
        <div className="bg-surface border border-line rounded-xl p-8 text-center text-muted">
          <BarChart3 size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Không có dữ liệu trong khoảng thời gian này.</p>
          <p className="text-xs text-subtle mt-1">Thử date preset khác hoặc đợi Meta xử lý insights.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <Kpi icon={<DollarSign size={14} />} label="Spend"       value={formatVnd(totals.spend)} accent="text-fg" />
            <Kpi icon={<Eye size={14} />}        label="Impressions" value={totals.impressions.toLocaleString('vi-VN')} />
            <Kpi icon={<MousePointerClick size={14} />} label="Clicks · CTR"
                 value={`${totals.clicks.toLocaleString('vi-VN')} · ${ctr.toFixed(2)}%`} />
            <Kpi icon={<TrendingUp size={14} />} label={totals.purchases > 0 ? `Sales · ROAS` : 'CPC · CPM'}
                 value={totals.purchases > 0
                   ? `${totals.purchases.toLocaleString('vi-VN')} · ${roas.toFixed(2)}x`
                   : `${formatVnd(cpc)} · ${formatVnd(cpm)}`} />
          </div>

          {totals.leads > 0 && (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2.5">
              <Kpi icon={<Target size={14} />} label="Leads"
                   value={`${totals.leads} · CPL ${formatVnd(totals.leads > 0 ? totals.spend / totals.leads : 0)}`} />
              <Kpi icon={<Eye size={14} />} label="Reach"
                   value={`${totals.reach.toLocaleString('vi-VN')}`} />
              {totals.purchaseValue > 0 && (
                <Kpi icon={<DollarSign size={14} />} label="Revenue"
                     value={formatVnd(totals.purchaseValue)} accent="text-success" />
              )}
            </div>
          )}

          {topPerformer && (
            <div className="status-success border rounded-xl p-3 flex items-center gap-3">
              <Trophy size={18} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">Top performer</p>
                <p className="text-sm truncate">{topPerformer.campaignName || topPerformer.campaignId}</p>
              </div>
              <div className="shrink-0 text-right text-xs font-mono">
                {topPerformer.roas ? <p>ROAS <b>{topPerformer.roas.toFixed(2)}x</b></p> : null}
                {topPerformer.leads ? <p>{topPerformer.leads} leads</p> : null}
                <p className="text-muted">{formatVnd(topPerformer.spend)} spent</p>
              </div>
            </div>
          )}

          {/* Per-campaign table */}
          <div className="bg-surface border border-line rounded-xl overflow-hidden">
            <header className="px-4 py-2.5 border-b border-line bg-canvas">
              <p className="text-xs font-mono uppercase tracking-wider text-muted">
                Per-campaign — click cột để sort
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-canvas/60 text-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Campaign</th>
                    <SortableTh col="spend"       cur={sortKey} dir={sortDir} onClick={() => setSort('spend')}       label="Spend" />
                    <SortableTh col="impressions" cur={sortKey} dir={sortDir} onClick={() => setSort('impressions')} label="Impr." />
                    <SortableTh col="clicks"      cur={sortKey} dir={sortDir} onClick={() => setSort('clicks')}      label="Clicks" />
                    <SortableTh col="ctr"         cur={sortKey} dir={sortDir} onClick={() => setSort('ctr')}         label="CTR" />
                    <SortableTh col="cpc"         cur={sortKey} dir={sortDir} onClick={() => setSort('cpc')}         label="CPC" />
                    {rows.some(r => r.leads) && (
                      <SortableTh col="leads"     cur={sortKey} dir={sortDir} onClick={() => setSort('leads')}       label="Leads" />
                    )}
                    {rows.some(r => r.purchases) && (
                      <SortableTh col="purchases" cur={sortKey} dir={sortDir} onClick={() => setSort('purchases')}   label="Sales" />
                    )}
                    {rows.some(r => r.roas) && (
                      <SortableTh col="roas"      cur={sortKey} dir={sortDir} onClick={() => setSort('roas')}        label="ROAS" />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sorted.map((r, i) => {
                    const localCampaign = campaigns.find(c => c.metaCampaignId === r.campaignId);
                    return (
                      <tr key={r.campaignId || i} className="hover:bg-canvas/50">
                        <td className="px-3 py-2">
                          <p className="text-fg font-medium truncate max-w-[280px]" title={r.campaignName}>
                            {r.campaignName || r.campaignId}
                          </p>
                          {localCampaign && (
                            <p className="text-[10px] text-subtle">local: {localCampaign.name}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{formatVnd(r.spend)}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.impressions.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.clicks.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.ctr.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right font-mono">{formatVnd(r.cpc)}</td>
                        {rows.some(x => x.leads) && (
                          <td className="px-3 py-2 text-right font-mono">{r.leads ?? '—'}</td>
                        )}
                        {rows.some(x => x.purchases) && (
                          <td className="px-3 py-2 text-right font-mono">{r.purchases ?? '—'}</td>
                        )}
                        {rows.some(x => x.roas) && (
                          <td className="px-3 py-2 text-right font-mono">
                            {r.roas ? <span className={r.roas >= 2 ? 'text-success font-semibold' : ''}>{r.roas.toFixed(2)}x</span> : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string; accent?: string }> = ({ icon, label, value, accent }) => (
  <div className="bg-surface border border-line rounded-lg p-3">
    <div className="flex items-center gap-1.5 text-muted text-[11px]">
      {icon} {label}
    </div>
    <p className={`text-base font-semibold mt-1 ${accent || 'text-fg'}`}>{value}</p>
  </div>
);

const SortableTh: React.FC<{
  col: SortKey; cur: SortKey; dir: 'asc' | 'desc'; onClick: () => void; label: string;
}> = ({ col, cur, dir, onClick, label }) => (
  <th
    onClick={onClick}
    className="text-right px-3 py-2 font-medium cursor-pointer select-none hover:text-fg"
  >
    {label}{cur === col ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
  </th>
);

function formatVnd(n: number): string {
  if (!n) return '0đ';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString('vi-VN');
}
