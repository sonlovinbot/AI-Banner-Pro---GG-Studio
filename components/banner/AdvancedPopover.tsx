// Advanced settings popover — collapsed by default. Contains the Coachio
// model picker + banner type + anything else that was cluttering the sidebar
// before the H-sprint UI cleanup.

import React, { useState } from 'react';
import { ChevronDown, Cpu, Megaphone } from 'lucide-react';

interface CoachioModel {
  id: string;
  name: string;
}

interface BannerTypeOption {
  id: string;
  label: string;
}

interface Props {
  coachioModel: string;
  coachioModels: CoachioModel[];
  onChangeCoachioModel: (id: string) => void;

  bannerType: string;
  bannerTypeOptions: BannerTypeOption[];
  onChangeBannerType: (id: string) => void;

  /** Start expanded or collapsed. Default false (collapsed). */
  defaultOpen?: boolean;
}

export const AdvancedPopover: React.FC<Props> = ({
  coachioModel, coachioModels, onChangeCoachioModel,
  bannerType, bannerTypeOptions, onChangeBannerType,
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const activeModel = coachioModels.find(m => m.id === coachioModel)?.name;
  const activeType  = bannerTypeOptions.find(t => t.id === bannerType)?.label;

  return (
    <section className="space-y-2">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border transition-colors text-left ${
          open ? 'bg-canvas border-line' : 'bg-canvas border-line hover:bg-raised'
        }`}
      >
        <span className="text-xs font-semibold text-subtle uppercase tracking-wider flex items-center gap-1.5">
          Advanced
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          {!open && activeModel && (
            <span className="font-mono">
              {activeType ? `${activeType} · ${activeModel}` : activeModel}
            </span>
          )}
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="space-y-3 border border-line rounded-md p-3 bg-canvas/50">
          {/* Model */}
          <div>
            <label className="text-[10px] text-subtle uppercase tracking-wider block mb-1 flex items-center gap-1">
              <Cpu size={11} /> Model
            </label>
            <select
              value={coachioModel}
              onChange={(e) => onChangeCoachioModel(e.target.value)}
              className="w-full bg-canvas border border-line rounded-md px-2.5 py-2 text-sm text-fg focus:outline-none focus:border-brand"
            >
              {coachioModels.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Banner Type — only when the caller passes options (banner tool) */}
          {bannerTypeOptions.length > 0 && (
            <div>
              <label className="text-[10px] text-subtle uppercase tracking-wider block mb-1 flex items-center gap-1">
                <Megaphone size={11} /> Loại banner
              </label>
              <select
                value={bannerType}
                onChange={(e) => onChangeBannerType(e.target.value)}
                className="w-full bg-canvas border border-line rounded-md px-2.5 py-2 text-sm text-fg focus:outline-none focus:border-brand"
              >
                {bannerTypeOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
