import React, { useEffect, useState } from 'react';
import { AppPage } from './types';
import { MenuPage } from './components/MenuPage';
import { BannerTool } from './components/BannerTool';
import { HistoryPage } from './components/HistoryPage';
import { BrandStylePage } from './components/BrandStylePage';
import { UGCStudio } from './components/UGCStudio';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { initTheme } from './services/themeService';

export default function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('menu');

  useEffect(() => {
    initTheme();
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'banner':      return <BannerTool onNavigate={setCurrentPage} />;
      case 'history':     return <HistoryPage onNavigate={setCurrentPage} />;
      case 'brand-style': return <BrandStylePage onNavigate={setCurrentPage} />;
      case 'ugc-studio':  return <UGCStudio onNavigate={setCurrentPage} />;
      default:            return <MenuPage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <AuthGate>
      {(user) => (
        <AppShell currentPage={currentPage} onNavigate={setCurrentPage} user={user}>
          {renderPage()}
        </AppShell>
      )}
    </AuthGate>
  );
}
