import React, { useEffect, useState } from 'react';
import { AppPage } from './types';
import { MenuPage } from './components/MenuPage';
import { BannerTool } from './components/BannerTool';
import { HistoryPage } from './components/HistoryPage';
import { BrandStylePage } from './components/BrandStylePage';
import { UGCStudio } from './components/UGCStudio';
import { AdsManagerPage } from './components/AdsManagerPage';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { McpConsentPage } from './components/McpConsentPage';
import { initTheme } from './services/themeService';

// OAuth consent for MCP clients lives outside the normal app shell — when
// /api/mcp/authorize bounces the user back here with `?oauth_consent=1`,
// we render the standalone consent page instead of the dashboard.
function isMcpConsentRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('oauth_consent') === '1';
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('menu');
  // Optional sub-tab hint when arriving at AdsManagerPage. Cleared after use.
  const [adsInitialTab, setAdsInitialTab] = useState<string | undefined>();
  const consentMode = isMcpConsentRoute();

  useEffect(() => {
    initTheme();
  }, []);

  /** Single navigation entry — accepts a sub-target so a page can deep-link
   *  into a specific tab (e.g. History "Brainstorm" jumps to ads-manager/studio). */
  const navigate = (page: AppPage, opts?: { adsTab?: string }) => {
    if (opts?.adsTab) setAdsInitialTab(opts.adsTab);
    else setAdsInitialTab(undefined);
    setCurrentPage(page);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'banner':      return <BannerTool onNavigate={navigate} />;
      case 'history':     return <HistoryPage onNavigate={navigate} />;
      case 'brand-style': return <BrandStylePage onNavigate={navigate} />;
      case 'ugc-studio':  return <UGCStudio onNavigate={navigate} />;
      case 'ads-manager': return <AdsManagerPage onNavigate={navigate} initialTab={adsInitialTab} />;
      default:            return <MenuPage onNavigate={navigate} />;
    }
  };

  // MCP consent flow requires the user to be logged in but bypasses the
  // dashboard shell — render the consent UI directly inside AuthGate.
  if (consentMode) {
    return (
      <AuthGate>
        {() => <McpConsentPage />}
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      {(user) => (
        <AppShell currentPage={currentPage} onNavigate={navigate} user={user}>
          {renderPage()}
        </AppShell>
      )}
    </AuthGate>
  );
}
