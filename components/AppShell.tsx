import React, { useEffect, useState } from 'react';
import {
  Home, Wand2, UserSquare2, Palette, Clock, Key, Menu, X,
  Sun, Moon, Zap, ChevronLeft, LogOut, User as UserIcon, Megaphone, Edit3,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { AppPage } from '../types';
import { getActiveBackend } from '../services/storageService';
import { getTheme, toggleTheme, Theme } from '../services/themeService';
import { signOut } from '../services/authService';
import { APP_VERSION } from '../data/appVersion';
import { ProfileSettingsModal } from './ProfileSettingsModal';

interface AppShellProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  user?: User;
  children: React.ReactNode;
}

interface NavItem {
  id: AppPage;
  label: string;
  icon: React.ReactNode;
  accent?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'menu',        label: 'Dashboard',   icon: <Home size={18} /> },
  { id: 'banner',      label: 'Banner Tool', icon: <Wand2 size={18} />,        accent: 'text-brand' },
  { id: 'ugc-studio',  label: 'UGC Studio',  icon: <UserSquare2 size={18} />,  accent: 'text-cyan-500' },
  { id: 'brand-style', label: 'Brand Style', icon: <Palette size={18} />,      accent: 'text-pink-500' },
  { id: 'history',     label: 'History',     icon: <Clock size={18} />,        accent: 'text-emerald-500' },
  { id: 'ads-manager', label: 'Ads Manager', icon: <Megaphone size={18} />,    accent: 'text-amber-500' },
];

const PAGE_TITLE: Record<AppPage, string> = {
  'menu':        'Dashboard',
  'banner':      'Banner Tool',
  'ugc-studio':  'UGC Studio',
  'brand-style': 'Brand Style',
  'history':     'History',
  'ads-manager': 'Ads Manager',
};

export const AppShell: React.FC<AppShellProps> = ({ currentPage, onNavigate, user, children }) => {
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsModal, setSettingsModal] = useState<null | { tab: 'profile' | 'keys' }>(null);
  const backend = getActiveBackend();

  useEffect(() => {
    // close mobile drawer when route changes
    setMobileOpen(false);
  }, [currentPage]);

  const handleThemeToggle = () => {
    const next = toggleTheme();
    setThemeState(next);
  };

  const Sidebar = (
    <aside
      className={`
        bg-surface border-r border-line flex flex-col
        w-64 shrink-0
        ${mobileOpen ? 'fixed inset-y-0 left-0 z-50' : 'hidden lg:flex'}
      `}
    >
      {/* Brand */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-line">
        <button onClick={() => onNavigate('menu')} className="flex items-center gap-3 text-left">
          <div className="bg-brand text-white p-2 rounded-md border-2 border-fg/10 shadow-pop">
            <Wand2 size={18} />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-fg">AI Banner Pro</h1>
            <p className="text-[10px] font-mono text-subtle">v{APP_VERSION}</p>
          </div>
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-muted hover:text-fg p-1 rounded-md"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all
                ${active
                  ? 'bg-brand/10 text-brand border-l-2 border-brand'
                  : 'text-muted hover:text-fg hover:bg-raised border-l-2 border-transparent'
                }
              `}
            >
              <span className={active ? 'text-brand' : item.accent || ''}>{item.icon}</span>
              <span>{item.label}</span>
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand" />}
            </button>
          );
        })}

        {/* API Settings sidebar entry hidden — access via profile box → API Keys tab */}
        {false && (
          <button
            onClick={() => setSettingsModal({ tab: 'keys' })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted hover:text-fg hover:bg-raised border-l-2 border-transparent transition-all"
          >
            <Key size={18} className="text-orange-400" />
            <span>API Settings</span>
          </button>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 pt-3 border-t border-line space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-raised text-[11px] text-muted">
          <Zap size={12} className={backend === 'coachio' ? 'text-brand' : 'text-accent-blue'} />
          <span>Active:</span>
          <span className="font-semibold text-fg">{backend === 'coachio' ? 'Coachio' : 'Gemini'}</span>
        </div>
        <button
          onClick={handleThemeToggle}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm text-muted hover:text-fg hover:bg-raised transition-colors"
          title="Đổi giao diện sáng/tối"
        >
          <span className="flex items-center gap-2">
            {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
            <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          </span>
          <span className="text-[10px] text-subtle">⌘+L</span>
        </button>

        {user && (
          <div className="border-t border-line pt-2 mt-2">
            <button
              onClick={() => setSettingsModal({ tab: 'profile' })}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-raised transition-colors text-left"
              title="Mở Hồ sơ & Cài đặt"
            >
              {(user.user_metadata?.avatar_url as string) ? (
                <img
                  src={user.user_metadata.avatar_url as string}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover border border-line"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-brand/15 text-brand flex items-center justify-center text-xs font-bold">
                  {(user.user_metadata?.display_name || user.email || '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-fg truncate">
                  {user.user_metadata?.display_name || user.email?.split('@')[0]}
                </p>
                <p className="text-[10px] text-subtle truncate">{user.email}</p>
              </div>
              <Edit3 size={12} className="text-muted shrink-0" />
            </button>
            <button
              onClick={async () => { try { await signOut(); } catch (e) { console.warn(e); } }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors mt-1"
              title="Đăng xuất"
            >
              <LogOut size={15} />
              <span>Đăng xuất</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      {/* Sidebar */}
      {Sidebar}

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-line bg-surface/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-muted hover:text-fg p-2 rounded-md hover:bg-raised"
            >
              <Menu size={18} />
            </button>
            {currentPage !== 'menu' && (
              <button
                onClick={() => onNavigate('menu')}
                className="hidden md:flex items-center gap-1 text-xs text-muted hover:text-fg px-2 py-1 rounded-md hover:bg-raised transition-colors"
              >
                <ChevronLeft size={14} /> Dashboard
              </button>
            )}
            <h2 className="text-sm font-semibold text-fg">{PAGE_TITLE[currentPage]}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleThemeToggle}
              className="text-muted hover:text-fg p-2 rounded-md hover:bg-raised transition-colors"
              title={theme === 'dark' ? 'Chuyển sang Light' : 'Chuyển sang Dark'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {settingsModal && (
        <ProfileSettingsModal
          user={user}
          initialTab={settingsModal.tab}
          onClose={() => setSettingsModal(null)}
        />
      )}
    </div>
  );
};
