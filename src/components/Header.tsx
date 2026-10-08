import React from 'react';
import { User } from 'firebase/auth';
import {
  Mic2,
  FileSpreadsheet,
  Target,
  BarChart3,
  Radio,
  LogOut,
  ExternalLink,
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';

interface HeaderProps {
  activeTab: 'live' | 'drills' | 'sheets' | 'analytics';
  setActiveTab: (tab: 'live' | 'drills' | 'sheets' | 'analytics') => void;
  user: User | null;
  isLoggingIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  sheetId?: string;
  isLiveActive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  user,
  isLoggingIn,
  onLogin,
  onLogout,
  sheetId,
  isLiveActive,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-[#111827]/[0.06] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#4F46E5] text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Mic2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg tracking-tight text-[#111827]">
                  Clarity
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-[#4F46E5] border border-indigo-100">
                  <Radio className={`w-3 h-3 ${isLiveActive ? 'animate-pulse text-emerald-500' : ''}`} />
                  gemini-3.8-live
                </span>
              </div>
              <p className="text-xs text-[#6B7280] hidden sm:block">
                Executive Rhetoric & Speech Coach
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-[#F1F3FF] p-1.5 rounded-2xl border border-indigo-100/50">
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'live'
                  ? 'bg-white text-[#4F46E5] shadow-sm font-semibold'
                  : 'text-[#464555] hover:text-[#111827]'
              }`}
            >
              <Mic2 className="w-4 h-4" />
              Live Coach
            </button>
            <button
              onClick={() => setActiveTab('drills')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'drills'
                  ? 'bg-white text-[#4F46E5] shadow-sm font-semibold'
                  : 'text-[#464555] hover:text-[#111827]'
              }`}
            >
              <Target className="w-4 h-4" />
              Drills
            </button>
            <button
              onClick={() => setActiveTab('sheets')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'sheets'
                  ? 'bg-white text-[#006C49] shadow-sm font-semibold'
                  : 'text-[#464555] hover:text-[#111827]'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Google Sheets
              {sheetId && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'analytics'
                  ? 'bg-white text-[#4F46E5] shadow-sm font-semibold'
                  : 'text-[#464555] hover:text-[#111827]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Analytics
            </button>
          </nav>

          {/* Google Auth & User State */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-2.5">
                {sheetId && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Open Sheet
                    <ExternalLink className="w-3 h-3 text-emerald-500" />
                  </a>
                )}
                <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-2xl bg-white border border-[#111827]/[0.08] shadow-sm">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-7 h-7 rounded-full object-cover border border-indigo-100"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-semibold text-xs flex items-center justify-center">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-medium text-gray-800 hidden sm:inline max-w-[120px] truncate">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                  <button
                    onClick={onLogout}
                    title="Sign Out"
                    className="p-1 text-gray-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <GoogleSignInButton
                onClick={onLogin}
                isLoading={isLoggingIn}
                text="Connect Sheets"
                className="py-2 text-xs sm:text-sm"
              />
            )}
          </div>
        </div>

        {/* Mobile Sub-Navigation */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-gray-100">
          <button
            onClick={() => setActiveTab('live')}
            className={`flex flex-col items-center gap-1 py-1 text-xs font-medium ${
              activeTab === 'live' ? 'text-[#4F46E5] font-semibold' : 'text-gray-500'
            }`}
          >
            <Mic2 className="w-4 h-4" />
            Live
          </button>
          <button
            onClick={() => setActiveTab('drills')}
            className={`flex flex-col items-center gap-1 py-1 text-xs font-medium ${
              activeTab === 'drills' ? 'text-[#4F46E5] font-semibold' : 'text-gray-500'
            }`}
          >
            <Target className="w-4 h-4" />
            Drills
          </button>
          <button
            onClick={() => setActiveTab('sheets')}
            className={`flex flex-col items-center gap-1 py-1 text-xs font-medium ${
              activeTab === 'sheets' ? 'text-[#006C49] font-semibold' : 'text-gray-500'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Sheets
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col items-center gap-1 py-1 text-xs font-medium ${
              activeTab === 'analytics' ? 'text-[#4F46E5] font-semibold' : 'text-gray-500'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Stats
          </button>
        </div>
      </div>
    </header>
  );
};
