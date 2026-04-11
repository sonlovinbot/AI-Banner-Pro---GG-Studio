import React, { useState } from 'react';
import { AppPage } from './types';
import { MenuPage } from './components/MenuPage';
import { BannerTool } from './components/BannerTool';
import { HistoryPage } from './components/HistoryPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('menu');

  switch (currentPage) {
    case 'banner':
      return <BannerTool onNavigate={setCurrentPage} />;
    case 'history':
      return <HistoryPage onNavigate={setCurrentPage} />;
    default:
      return <MenuPage onNavigate={setCurrentPage} />;
  }
}
