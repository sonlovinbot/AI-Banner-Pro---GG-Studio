import React, { useState } from 'react';
import { Layers, Wand2, Clock, ArrowRight, Key, Zap, Palette, UserSquare2 } from 'lucide-react';
import { AppPage } from '../types';
import { getHistory, getBrandProjects } from '../services/storageService';
import { getCoachioApiKey } from '../services/coachioService';
import { getGeminiApiKey, getActiveBackend } from '../services/storageService';
import { ApiKeySettings } from './ApiKeySettings';

interface MenuPageProps {
  onNavigate: (page: AppPage) => void;
}

export const MenuPage: React.FC<MenuPageProps> = ({ onNavigate }) => {
  const historyCount = getHistory().length;
  const brandCount = getBrandProjects().length;
  const hasCoachioKey = !!getCoachioApiKey();
  const hasGoogleKey = !!getGeminiApiKey();
  const activeBackend = getActiveBackend();
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 text-slate-200 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-xl text-white">
              <Layers size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">AI Banner Pro</h1>
              <p className="text-sm text-indigo-400 font-mono">Nano Banana Pro</p>
            </div>
          </div>
          {/* Active backend badge in header */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-medium ${
            activeBackend === 'coachio'
              ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
          }`}>
            <Zap size={14} />
            Active: {activeBackend === 'coachio' ? 'Coachio AI' : 'Gemini Direct'}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-7xl w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">

          {/* Banner Tool Card */}
          <button
            onClick={() => onNavigate('banner')}
            className="group bg-gray-900 border border-gray-800 rounded-2xl p-8 text-left hover:border-indigo-500/50 hover:bg-gray-900/80 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10"
          >
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-4 rounded-xl w-fit mb-6">
              <Wand2 size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              Banner Tool
              <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Upload images, configure settings, and generate professional advertising banners with AI.
            </p>
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-3 py-1 rounded-full border ${
                activeBackend === 'coachio'
                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                  : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
              }`}>
                {activeBackend === 'coachio' ? 'Coachio AI' : 'Gemini Direct'}
              </span>
              <span className="text-xs bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full border border-purple-500/20">
                Multi-upload
              </span>
            </div>
          </button>

          {/* UGC Studio Card */}
          <button
            onClick={() => onNavigate('ugc-studio')}
            className="group bg-gray-900 border border-gray-800 rounded-2xl p-8 text-left hover:border-cyan-500/50 hover:bg-gray-900/80 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
          >
            <div className="bg-gradient-to-br from-cyan-600 to-sky-600 p-4 rounded-xl w-fit mb-6">
              <UserSquare2 size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              UGC Studio
              <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Tạo content với khuôn mặt nhất quán: upload face + fashion/style + product.
            </p>
            <div className="mt-4">
              <span className="text-xs bg-cyan-500/10 text-cyan-300 px-3 py-1 rounded-full border border-cyan-500/20">
                Face-consistent
              </span>
            </div>
          </button>

          {/* Brand Style Card */}
          <button
            onClick={() => onNavigate('brand-style')}
            className="group bg-gray-900 border border-gray-800 rounded-2xl p-8 text-left hover:border-pink-500/50 hover:bg-gray-900/80 transition-all duration-300 hover:shadow-lg hover:shadow-pink-500/10"
          >
            <div className="bg-gradient-to-br from-pink-600 to-rose-600 p-4 rounded-xl w-fit mb-6">
              <Palette size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              Brand Style
              <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Tạo sẵn brand kit (logo, ảnh tham chiếu, JSON, brand info) để dùng nhanh khi tạo banner.
            </p>
            <div className="mt-4">
              <span className="text-xs bg-pink-500/10 text-pink-400 px-3 py-1 rounded-full border border-pink-500/20">
                {brandCount} brand{brandCount !== 1 ? 's' : ''} saved
              </span>
            </div>
          </button>

          {/* History Card */}
          <button
            onClick={() => onNavigate('history')}
            className="group bg-gray-900 border border-gray-800 rounded-2xl p-8 text-left hover:border-emerald-500/50 hover:bg-gray-900/80 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10"
          >
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-4 rounded-xl w-fit mb-6">
              <Clock size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              History
              <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              View and manage all your previously generated banners saved locally.
            </p>
            <div className="mt-4">
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">
                {historyCount} banner{historyCount !== 1 ? 's' : ''} saved
              </span>
            </div>
          </button>

          {/* API Key Settings Card */}
          <button
            onClick={() => setShowApiKeySettings(true)}
            className="group bg-gray-900 border border-gray-800 rounded-2xl p-8 text-left hover:border-orange-500/50 hover:bg-gray-900/80 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/10"
          >
            <div className="bg-gradient-to-br from-orange-600 to-amber-600 p-4 rounded-xl w-fit mb-6">
              <Key size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              API Settings
              <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Configure API keys for Google Gemini and Coachio AI backends.
            </p>
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                hasGoogleKey
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : 'bg-gray-800 text-gray-500 border-gray-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasGoogleKey ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                Google
              </span>
              <span className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                hasCoachioKey
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : 'bg-gray-800 text-gray-500 border-gray-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasCoachioKey ? 'bg-green-400' : 'bg-gray-600'}`}></span>
                Coachio
              </span>
            </div>
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-4 text-center text-xs text-gray-600">
        AI Banner Pro &mdash; Powered by Gemini & Coachio AI
      </footer>

      {/* API Key Settings Modal */}
      {showApiKeySettings && (
        <ApiKeySettings onClose={() => setShowApiKeySettings(false)} />
      )}
    </div>
  );
};
