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
import { initTheme } from './services/themeService';

export default function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('menu');
  // Optional sub-tab hint when arriving at AdsManagerPage. Cleared after use.
  const [adsInitialTab, setAdsInitialTab] = useState<string | undefined>();

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
