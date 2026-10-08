import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
} from './services/googleAuth';
import {
  SessionRecord,
  appendSessionToSheet,
} from './services/googleSheets';
import { Header } from './components/Header';
import { LiveVoiceRoom } from './components/LiveVoiceRoom';
import { PracticeDrills } from './components/PracticeDrills';
import { GoogleSheetsJournal } from './components/GoogleSheetsJournal';
import { AnalyticsView } from './components/AnalyticsView';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const INITIAL_SESSIONS: SessionRecord[] = [
  {
    id: 'SES-948123',
    timestamp: 'Today, 2:15 PM',
    scenario: 'Executive Briefing',
    durationSeconds: 58,
    wordCount: 138,
    wpm: 143,
    clarityScore: 96,
    fillerCount: 1,
    presenceScore: 94,
    keyStrength: 'Direct bottom-line answer in first 10 seconds',
    improvement: 'Pause deliberately before transition',
    coachVerdict: 'Outstanding executive composure and pacing. Eliminated hedging language.',
  },
  {
    id: 'SES-831940',
    timestamp: 'Yesterday, 4:40 PM',
    scenario: 'Investor Elevator Pitch',
    durationSeconds: 44,
    wordCount: 106,
    wpm: 145,
    clarityScore: 92,
    fillerCount: 2,
    presenceScore: 90,
    keyStrength: 'Compelling market urgency framing',
    improvement: 'Ground traction metric with pause',
    coachVerdict: 'Strong hook and vocal energy. Pacing stayed within optimal executive band.',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'live' | 'drills' | 'sheets' | 'analytics'>('live');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentSheetId, setCurrentSheetId] = useState<string>(() => {
    return localStorage.getItem('clarity_sheet_id') || '';
  });
  const [sessions, setSessions] = useState<SessionRecord[]>(INITIAL_SESSIONS);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, accessToken) => {
        setUser(authedUser);
        setToken(accessToken);
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Persist currentSheetId to localStorage
  useEffect(() => {
    if (currentSheetId) {
      localStorage.setItem('clarity_sheet_id', currentSheetId);
    }
  }, [currentSheetId]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        showToast('Signed in with Google. Connected to Google Sheets API.');
      }
    } catch (err: any) {
      console.error('Google Sign In failed:', err);
      showToast(err.message || 'Failed to sign in with Google.', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      showToast('Signed out of Google Workspace.');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Called when a session is logged from Live Voice or Drills
  const handleLogSession = async (session: SessionRecord) => {
    setSessions((prev) => [session, ...prev]);

    if (currentSheetId && token) {
      try {
        await appendSessionToSheet(currentSheetId, session);
        showToast(`Logged session to Google Sheet: "${session.scenario}" (${session.clarityScore}% clarity)`);
      } catch (err: any) {
        console.error('Failed to log to sheet:', err);
        showToast(`Saved locally. Could not sync to Sheet: ${err.message}`, 'error');
      }
    } else {
      showToast(
        user
          ? 'Saved locally. Connect a Google Sheet to auto-sync.'
          : 'Saved locally. Sign in with Google to log to your spreadsheet.',
        'success'
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#141b2b] flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg border text-xs sm:text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-white text-emerald-900 border-emerald-200 shadow-emerald-500/10'
                : 'bg-white text-rose-900 border-rose-200 shadow-rose-500/10'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#10B981] flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#F43F5E] flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Primary Sticky Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        isLoggingIn={isLoggingIn}
        onLogin={handleLogin}
        onLogout={handleLogout}
        sheetId={currentSheetId}
        isLiveActive={activeTab === 'live'}
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        {activeTab === 'live' && (
          <LiveVoiceRoom
            onLogToSheets={handleLogSession}
            isSheetsConnected={Boolean(user && currentSheetId)}
            onOpenSheetsTab={() => setActiveTab('sheets')}
          />
        )}

        {activeTab === 'drills' && (
          <PracticeDrills
            onLogToSheets={handleLogSession}
            isSheetsConnected={Boolean(user && currentSheetId)}
            onOpenSheetsTab={() => setActiveTab('sheets')}
          />
        )}

        {activeTab === 'sheets' && (
          <GoogleSheetsJournal
            user={user}
            isLoggingIn={isLoggingIn}
            onLogin={handleLogin}
            currentSheetId={currentSheetId}
            setCurrentSheetId={setCurrentSheetId}
            recentSessions={sessions}
            onAddSession={(newS) => setSessions((prev) => [newS, ...prev])}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            sessions={sessions}
            onOpenSheets={() => setActiveTab('sheets')}
            isSheetsConnected={Boolean(user && currentSheetId)}
          />
        )}
      </main>
    </div>
  );
}
