// Compact Output row — replaces the Variants Count slider + Quality 3-button
// grid + Aspect Ratio 11-button grid that used to eat 3 vertical sections in
// the sidebar.
//
// Now a single row: Aspect / Quality / Qty selects side-by-side. Total banner
// count preview below.

import React from 'react';
import { Sliders } from 'lucide-react';

interface Props {
  aspectRatio: string;
  aspectRatios: string[];
  onChangeAspect: (v: string) => void;

  quality: string;
  qualities: string[];
  isQualityDisabled?: (q: string) => boolean;
  onChangeQuality: (v: string) => void;

  /** Qty label + value: single-mode = variantCount, multi-mode = versionsPerContent */
  qtyLabel: string;
  qty: number;
  qtyMax: number;
  onChangeQty: (n: number) => void;

  /** Total banner preview: (variants × versions) */
  totalPreview?: number;
  totalHint?: string;
}

export const OutputRow: React.FC<Props> = ({
  aspectRatio, aspectRatios, onChangeAspect,
  quality, qualities, isQualityDisabled, onChangeQuality,
  qtyLabel, qty, qtyMax, onChangeQty,
  totalPreview, totalHint,
}) => {
  return (
    <section className="space-y-2">
      <label className="text-xs font-semibold text-subtle uppercase tracking-wider flex items-center gap-1.5">
        <Sliders size={12} /> Đầu ra
      </label>
      <div className="grid grid-cols-3 gap-2">
        <Select
          label="Tỉ lệ"
          value={aspectRatio}
          options={aspectRatios.map(r => ({ value: r, label: r }))}
          onChange={onChangeAspect}
        />
        <Select
          label="Độ nét"
          value={quality}
          options={qualities.map(q => ({
            value: q,
            label: q,
            disabled: isQualityDisabled?.(q),
          }))}
          onChange={onChangeQuality}
        />
        <Select
          label={qtyLabel}
          value={String(qty)}
          options={Array.from({ length: qtyMax }, (_, i) => ({
            value: String(i + 1),
            label: String(i + 1),
          }))}
          onChange={(v) => onChangeQty(Number(v))}
        />
      </div>
      {totalPreview != null && totalPreview > 0 && (
        <p className="text-[11px] text-brand bg-brand/5 border border-brand/20 rounded px-2 py-1.5">
          Sẽ tạo <b>{totalPreview}</b> banner{totalHint ? ` (${totalHint})` : ''}.
        </p>
      )}
    </section>
  );
};

// ─── Select primitive ───

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const Select: React.FC<{
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div>
    <label className="text-[10px] text-subtle uppercase tracking-wider block mb-1">
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-canvas border border-line rounded-md px-2.5 py-2 text-sm text-fg focus:outline-none focus:border-brand"
    >
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}{o.disabled ? ' (n/a)' : ''}
        </option>
      ))}
    </select>
  </div>
);
