// SessionsPanel — bottom strip in the Generated Workspace showing recent
// generation sessions. A session = a batch of banners generated together
// (either via shared sessionId or bucketed by close timestamps in
// historyService.bucketIntoSessions).
//
// UI has two modes:
//   - row   (default, tight): one horizontal thumbnail strip per session.
//   - grid  (expanded):        session rows are taller with 2×3-ish grid.
//
// Clicking a thumbnail bubbles the item up to the parent so it can open
// the existing HistoryEditModal (same flow as the History page).

import React, { useMemo, useState } from 'react';
import { Clock, LayoutGrid, Rows3, History as HistoryIcon, ChevronDown } from 'lucide-react';
import { HistoryItem, FeatureType } from '../types';
import { bucketIntoSessions } from '../services/historyService';
import { proxiedBannerUrl } from '../services/cdnProxy';

type Mode = 'row' | 'grid';

interface Props {
  /** All history items — panel filters by featureType internally. */
  history: HistoryItem[];
  /** Only show sessions matching this feature. */
  featureType: FeatureType;
  /** Click a banner to open the edit modal (parent already owns that state). */
  onSelectItem: (item: HistoryItem) => void;

  /** Optional: navigate to the full HistoryPage. */
  onOpenFullHistory?: () => void;
  /** Cap number of sessions shown to keep the panel scannable. */
  maxSessions?: number;
}

const DEFAULT_MAX = 12;

export const SessionsPanel: React.FC<Props> = ({
  history, featureType, onSelectItem, onOpenFullHistory,
  maxSessions = DEFAULT_MAX,
}) => {
  const [mode, setMode] = useState<Mode>('row');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sessions = useMemo(() => {
    const filtered = history.filter(h => (h.featureType || 'banner') === featureType);
    return bucketIntoSessions(filtered).slice(0, maxSessions);
  }, [history, featureType, maxSessions]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (sessions.length === 0) {
    return (
      <div className="border-t border-line bg-surface/50 backdrop-blur-sm px-6 py-4 flex items-center gap-2 text-xs text-subtle">
        <HistoryIcon size={13} />
        <span>Chưa có phiên nào — banner sẽ hiện ở đây sau khi generate.</span>
      </div>
    );
  }

  return (
    <div className="border-t border-line bg-surface/60 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-line bg-canvas/40">
        <div className="flex items-center gap-2 text-xs">
          <HistoryIcon size={13} className="text-brand" />
          <span className="font-semibold text-fg">Phiên gần đây</span>
          <span className="text-subtle font-mono text-[11px]">
            {sessions.length} phiên · {sessions.reduce((n, s) => n + s.items.length, 0)} banner
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ModeButton active={mode === 'row'}  onClick={() => setMode('row')}  icon={<Rows3 size={12} />}     label="Dòng" />
          <ModeButton active={mode === 'grid'} onClick={() => setMode('grid')} icon={<LayoutGrid size={12} />} label="Lưới" />
          {onOpenFullHistory && (
            <button
              onClick={onOpenFullHistory}
              className="text-[11px] px-2 py-1 rounded-md text-muted hover:text-brand hover:underline"
            >
              Xem toàn bộ →
            </button>
          )}
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-[42vh] min-h-[120px]">
        {sessions.map(s => {
          const isExpanded = expanded.has(s.key);
          return mode === 'row' ? (
            <SessionRow
              key={s.key}
              session={s}
              onSelectItem={onSelectItem}
              expanded={isExpanded}
              onToggleExpand={() => toggleExpand(s.key)}
            />
          ) : (
            <SessionGrid
              key={s.key}
              session={s}
              onSelectItem={onSelectItem}
            />
          );
        })}
      </div>
    </div>
  );
};

// ─────────── Session row (compact) ───────────

interface SessionRowProps {
  session: ReturnType<typeof bucketIntoSessions>[number];
  onSelectItem: (item: HistoryItem) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

const SessionRow: React.FC<SessionRowProps> = ({ session, onSelectItem, expanded, onToggleExpand }) => {
  const shown = expanded ? session.items : session.items.slice(0, 8);
  const overflow = session.items.length - shown.length;

  return (
    <div className="rounded-md border border-line bg-canvas hover:border-brand/40 transition-colors">
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 px-3 py-2 text-left"
      >
        <ChevronDown size={13} className={`text-muted shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        <Clock size={11} className="text-subtle shrink-0" />
        <span className="text-[11px] text-fg font-medium shrink-0">
          {relativeTime(session.startedAt)}
        </span>
        <span className="text-[11px] text-subtle shrink-0 font-mono">
          {session.items.length} banner
        </span>
        <span className="text-[10px] text-subtle truncate ml-auto pl-3">
          {sessionSubtitle(session.items[0])}
        </span>
      </button>

      <div className="px-3 pb-2 flex items-center gap-1.5 overflow-x-auto">
        {shown.map(it => (
          <Thumb key={it.id} item={it} size={44} onClick={() => onSelectItem(it)} />
        ))}
        {overflow > 0 && (
          <button
            onClick={onToggleExpand}
            className="shrink-0 w-11 h-11 rounded border border-dashed border-line text-[10px] text-muted hover:text-brand hover:border-brand/40"
          >
            +{overflow}
          </button>
        )}
      </div>
    </div>
  );
};

// ─────────── Session grid (expanded) ───────────

const SessionGrid: React.FC<{
  session: ReturnType<typeof bucketIntoSessions>[number];
  onSelectItem: (item: HistoryItem) => void;
}> = ({ session, onSelectItem }) => {
  return (
    <div className="rounded-md border border-line bg-canvas p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px]">
        <Clock size={11} className="text-brand" />
        <span className="text-fg font-medium">{relativeTime(session.startedAt)}</span>
        <span className="text-subtle font-mono">{session.items.length} banner</span>
        <span className="text-subtle truncate ml-2 flex-1 min-w-0">
          {sessionSubtitle(session.items[0])}
        </span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
        {session.items.map(it => (
          <Thumb key={it.id} item={it} size={0} onClick={() => onSelectItem(it)} />
        ))}
      </div>
    </div>
  );
};

// ─────────── Shared thumbnail ───────────

const Thumb: React.FC<{
  item: HistoryItem;
  onClick: () => void;
  /** Fixed pixel size for row mode; 0 = grid mode with aspect-square */
  size: number;
}> = ({ item, onClick, size }) => {
  const style = size > 0 ? { width: size, height: size } : undefined;
  return (
    <button
      onClick={onClick}
      style={style}
      className={`group relative overflow-hidden rounded border border-line hover:border-brand hover:ring-2 hover:ring-brand/30 transition-all shrink-0 ${
        size === 0 ? 'aspect-square w-full' : ''
      }`}
      title={item.promptUsed || 'Mở để sửa'}
    >
      <img
        src={proxiedBannerUrl(item.imageUrl)}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1">
        <span className="text-[8px] text-white font-mono truncate w-full">
          {item.aspectRatio} · {item.quality}
        </span>
      </div>
    </button>
  );
};

// ─────────── Mode toggle button ───────────

const ModeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`text-[11px] px-2 py-1 rounded-md border transition-colors flex items-center gap-1 ${
      active
        ? 'bg-brand/15 border-brand/40 text-brand'
        : 'bg-canvas border-line text-muted hover:border-brand/30 hover:text-fg'
    }`}
    title={label}
  >
    {icon} {label}
  </button>
);

// ─────────── Helpers ───────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60)         return `${s}s trước`;
  const m = Math.floor(s / 60);
  if (m < 60)         return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24)         return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d === 1)        return 'Hôm qua';
  if (d < 7)          return `${d} ngày trước`;
  const w = Math.floor(d / 7);
  if (w < 5)          return `${w} tuần trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
}

function sessionSubtitle(first: HistoryItem | undefined): string {
  if (!first) return '';
  const p = (first.promptUsed || '').trim();
  const short = p.length > 80 ? p.slice(0, 80) + '…' : p;
  return short || `${first.model || 'unknown model'}`;
}
