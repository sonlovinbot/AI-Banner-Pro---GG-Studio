import React, { useState } from 'react';
import {
  Wand2, Clock, ArrowRight, Palette, UserSquare2,
  Tag, X, Sparkles, Image as ImageIcon, Box,
} from 'lucide-react';
import { AppPage } from '../types';
import { getHistory, getBrandProjects, getActiveBackend, getGeminiApiKey } from '../services/storageService';
import { getCoachioApiKey } from '../services/coachioService';
import { APP_VERSION, APP_VERSION_NAME, APP_RELEASE_DATE, APP_CHANGELOG } from '../data/appVersion';
import { proxiedBannerUrl } from '../services/cdnProxy';

interface MenuPageProps {
  onNavigate: (page: AppPage) => void;
}

interface ToolCard {
  id: AppPage;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;       // tailwind text class
  bgAccent: string;     // tailwind bg class
}

const TOOLS: ToolCard[] = [
  {
    id: 'banner',
    title: 'Banner Tool',
    description: 'Generate ad banners. Style ref + product → AI sinh nhiều variant.',
    icon: <Wand2 size={20} />,
    accent: 'text-brand',
    bgAccent: 'bg-brand',
  },
  {
    id: 'ugc-studio',
    title: 'UGC Studio',
    description: 'Face-consistent UGC. Khuôn mặt + fashion + product.',
    icon: <UserSquare2 size={20} />,
    accent: 'text-cyan-500',
    bgAccent: 'bg-cyan-500',
  },
  {
    id: 'brand-style',
    title: 'Brand Style',
    description: 'Lưu brand kit: logo, references, JSON prompt cho team.',
    icon: <Palette size={20} />,
    accent: 'text-pink-500',
    bgAccent: 'bg-pink-500',
  },
  {
    id: 'history',
    title: 'History',
    description: 'Xem & chỉnh sửa banner đã tạo. Edit prompt + ảnh ref.',
    icon: <Clock size={20} />,
    accent: 'text-emerald-500',
    bgAccent: 'bg-emerald-500',
  },
];

export const MenuPage: React.FC<MenuPageProps> = ({ onNavigate }) => {
  const historyCount = getHistory().length;
  const brandCount = getBrandProjects().length;
  const hasCoachioKey = !!getCoachioApiKey();
  const hasGoogleKey = !!getGeminiApiKey();
  const activeBackend = getActiveBackend();
  const [showChangelog, setShowChangelog] = useState(false);

  const recent = getHistory().slice(0, 4);

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto w-full">
      {/* Hero / Welcome */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-subtle mb-2">
            <Sparkles size={12} className="text-brand" /> AI BANNER PRO
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-fg mb-1">
            Chào bạn quay lại.
          </h1>
          <p className="text-sm text-muted">
            Active backend:{' '}
            <span className={`font-semibold ${activeBackend === 'coachio' ? 'text-brand' : 'text-accent-blue'}`}>
              {activeBackend === 'coachio' ? 'Coachio AI' : 'Gemini Direct'}
            </span>
            {' · '}
            <button
              onClick={() => setShowChangelog(true)}
              className="hover:text-fg underline-offset-4 hover:underline"
            >
              v{APP_VERSION} · {APP_VERSION_NAME}
            </button>
          </p>
        </div>
        <button
          onClick={() => onNavigate('banner')}
          className="bg-brand hover:bg-brand-dark text-white font-medium px-5 py-2.5 rounded-md flex items-center gap-2 transition-colors shadow-pop"
        >
          <Wand2 size={16} /> Tạo banner mới
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Banners trong history" value={historyCount} icon={<Clock size={14} />} accent="text-emerald-500" />
        <StatCard label="Brand projects" value={brandCount} icon={<Palette size={14} />} accent="text-pink-500" />
        <StatCard
          label="Gemini API key"
          value={hasGoogleKey ? 'Configured' : 'Missing'}
          icon={<Box size={14} />}
          accent={hasGoogleKey ? 'text-emerald-500' : 'text-subtle'}
          numeric={false}
        />
        <StatCard
          label="Coachio API key"
          value={hasCoachioKey ? 'Configured' : 'Missing'}
          icon={<Box size={14} />}
          accent={hasCoachioKey ? 'text-emerald-500' : 'text-subtle'}
          numeric={false}
        />
      </div>

      {/* Tools grid */}
      <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-3">Công cụ</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {TOOLS.map(t => (
          <button
            key={t.id}
            onClick={() => onNavigate(t.id)}
            className="group text-left bg-surface border border-line hover:border-line-strong rounded-lg p-5 transition-all hover:shadow-pop"
          >
            <div className={`${t.bgAccent} text-white w-10 h-10 rounded-md flex items-center justify-center mb-4`}>
              {t.icon}
            </div>
            <h2 className="text-sm font-bold text-fg mb-1 flex items-center gap-1">
              {t.title}
              <ArrowRight size={14} className={`opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all ${t.accent}`} />
            </h2>
            <p className="text-xs text-muted leading-relaxed">{t.description}</p>
          </button>
        ))}
      </div>

      {/* Recent banners */}
      {recent.length > 0 && (
        <>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-subtle flex items-center gap-2">
              <ImageIcon size={12} /> Banner gần đây
            </h3>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs text-muted hover:text-fg flex items-center gap-1"
            >
              Xem tất cả <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {recent.map(item => (
              <button
                key={item.id}
                onClick={() => onNavigate('history')}
                className="aspect-square bg-surface border border-line hover:border-line-strong rounded-md overflow-hidden transition-colors group"
              >
                <img src={proxiedBannerUrl(item.imageUrl)} alt="Recent" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Changelog Modal */}
      {showChangelog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowChangelog(false)}>
          <div className="bg-surface border border-line rounded-lg max-w-xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-pop-lg" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div className="flex items-center gap-3">
                <div className="bg-brand/10 text-brand p-2 rounded-md border border-brand/20">
                  <Tag size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-fg">Changelog</h3>
                  <p className="text-[11px] text-muted">v{APP_VERSION} · {APP_VERSION_NAME} · {APP_RELEASE_DATE}</p>
                </div>
              </div>
              <button onClick={() => setShowChangelog(false)} className="p-2 rounded-md hover:bg-raised text-muted hover:text-fg">
                <X size={16} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {APP_CHANGELOG.map((rel) => (
                <div key={rel.version} className="border-l-2 border-brand/50 pl-4">
                  <div className="flex items-baseline gap-2">
                    <h4 className="text-sm font-bold text-fg">v{rel.version}</h4>
                    <span className="text-[11px] text-subtle">· {rel.date}</span>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {rel.highlights.map((h, i) => (
                      <li key={i} className="text-[12px] text-muted leading-snug">• {h}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{
  label: string; value: string | number; icon: React.ReactNode; accent: string; numeric?: boolean;
}> = ({ label, value, icon, accent, numeric = true }) => (
  <div className="bg-surface border border-line rounded-lg p-4">
    <div className={`flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider mb-2 ${accent}`}>
      {icon} {label}
    </div>
    <div className={`text-2xl font-bold text-fg ${numeric ? 'font-mono' : 'text-base'}`}>
      {value}
    </div>
  </div>
);
