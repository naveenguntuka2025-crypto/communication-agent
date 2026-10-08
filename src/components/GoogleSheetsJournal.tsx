import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  ExternalLink,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Link2,
  Table,
  UploadCloud,
  FileCheck,
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ConfirmModal } from './ConfirmModal';
import {
  createCoachingJournalSheet,
  fetchJournalRows,
  clearSessionRows,
  appendSessionToSheet,
  extractSpreadsheetId,
  SessionRecord,
} from '../services/googleSheets';

interface GoogleSheetsJournalProps {
  user: User | null;
  isLoggingIn: boolean;
  onLogin: () => void;
  currentSheetId: string;
  setCurrentSheetId: (id: string) => void;
  recentSessions: SessionRecord[];
  onAddSession: (session: SessionRecord) => void;
}

export const GoogleSheetsJournal: React.FC<GoogleSheetsJournalProps> = ({
  user,
  isLoggingIn,
  onLogin,
  currentSheetId,
  setCurrentSheetId,
  recentSessions,
  onAddSession,
}) => {
  const [sheetInput, setSheetInput] = useState(currentSheetId);
  const [sheetTitle, setSheetTitle] = useState('Clarity Communication Journal');
  const [sheetTabName, setSheetTabName] = useState('Coaching Sessions');
  const [rows, setRows] = useState<any[][]>([]);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Destructive modal state
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Sync sheetInput with currentSheetId
  useEffect(() => {
    setSheetInput(currentSheetId);
    if (currentSheetId && user) {
      loadSheetData(currentSheetId);
    }
  }, [currentSheetId, user]);

  const loadSheetData = async (id: string) => {
    if (!id) return;
    setIsLoadingRows(true);
    setStatusNotice(null);
    try {
      const data = await fetchJournalRows(id);
      setRows(data.rows);
      setSheetTitle(data.title);
      setSheetTabName(data.sheetName);
    } catch (err: any) {
      console.error('Failed to load sheet:', err);
      setStatusNotice({
        type: 'error',
        message: err.message || 'Unable to read spreadsheet rows. Ensure permissions are granted.',
      });
    } finally {
      setIsLoadingRows(false);
    }
  };

  const handleCreateNewSheet = async () => {
    setIsCreatingSheet(true);
    setStatusNotice(null);
    try {
      const result = await createCoachingJournalSheet();
      setCurrentSheetId(result.id);
      setSheetInput(result.id);
      setSheetTitle(result.title);
      setStatusNotice({
        type: 'success',
        message: `New Google Sheet created: "${result.title}". Ready to log practice sessions.`,
      });

      // If we have recent un-synced sessions, auto-sync the latest
      if (recentSessions.length > 0) {
        await appendSessionToSheet(result.id, recentSessions[0]);
      }
      await loadSheetData(result.id);
    } catch (err: any) {
      console.error('Failed to create sheet:', err);
      setStatusNotice({
        type: 'error',
        message: err.message || 'Could not create new Google Sheet.',
      });
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleConnectExisting = () => {
    const id = extractSpreadsheetId(sheetInput);
    if (!id) {
      setStatusNotice({
        type: 'error',
        message: 'Please paste a valid Google Sheets URL or Spreadsheet ID.',
      });
      return;
    }
    setCurrentSheetId(id);
    loadSheetData(id);
    setStatusNotice({
      type: 'info',
      message: `Connecting to sheet: ${id}...`,
    });
  };

  const handleSyncSampleRow = async () => {
    if (!currentSheetId) return;
    const sample: SessionRecord = {
      id: `SES-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: new Date().toLocaleString(),
      scenario: 'Quarterly Executive Review',
      durationSeconds: 48,
      wordCount: 114,
      wpm: 142,
      clarityScore: 95,
      fillerCount: 1,
      presenceScore: 92,
      keyStrength: 'Bottom-line-up-front conclusion',
      improvement: 'Pacing pause after Q3 financials',
      coachVerdict: 'Strong cadence and executive authority. One minimal filler word.',
    };

    try {
      await appendSessionToSheet(currentSheetId, sample);
      onAddSession(sample);
      await loadSheetData(currentSheetId);
      setStatusNotice({
        type: 'success',
        message: 'Logged practice session to Google Sheet successfully!',
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        message: err.message || 'Failed to log session row.',
      });
    }
  };

  const handleExecuteClear = async () => {
    if (!currentSheetId) return;
    setIsClearing(true);
    try {
      await clearSessionRows(currentSheetId, sheetTabName);
      await loadSheetData(currentSheetId);
      setStatusNotice({
        type: 'info',
        message: 'Spreadsheet rows cleared. Header row preserved.',
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        message: err.message || 'Failed to clear rows.',
      });
    } finally {
      setIsClearing(false);
      setIsConfirmClearOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Status Notice */}
      {statusNotice && (
        <div
          className={`p-4 rounded-2xl text-sm flex items-start gap-3 border ${
            statusNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : statusNotice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          }`}
        >
          {statusNotice.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs sm:text-sm">{statusNotice.message}</div>
          <button
            onClick={() => setStatusNotice(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Auth Gate if user is not signed in */}
      {!user ? (
        <div className="bg-white rounded-2xl border border-[#111827]/[0.06] p-8 text-center max-w-xl mx-auto shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#111827]">
              Connect Google Sheets to Clarity
            </h3>
            <p className="text-sm text-[#464555] mt-1.5 leading-relaxed">
              Log each voice coaching session, track speech pacing trends (WPM), eliminate filler words, and review AI coach appraisals directly in your personal Google Sheets journal.
            </p>
          </div>
          <div className="pt-2">
            <GoogleSignInButton
              onClick={onLogin}
              isLoading={isLoggingIn}
              text="Sign in with Google to Connect Sheets"
              className="py-3 px-6 text-sm"
            />
          </div>
        </div>
      ) : (
        <>
          {/* Active Sheet Card & Controls */}
          <div className="bg-white rounded-2xl border border-[#111827]/[0.06] p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-[#111827]">
                      {sheetTitle}
                    </h3>
                    {currentSheetId && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    Sheet ID: {currentSheetId || 'No sheet selected'} • Tab: {sheetTabName}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {currentSheetId && (
                  <>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${currentSheetId}/edit`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open in Google Sheets
                    </a>

                    <button
                      onClick={() => loadSheetData(currentSheetId)}
                      disabled={isLoadingRows}
                      className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors"
                      title="Refresh Sheet Rows"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${isLoadingRows ? 'animate-spin' : ''}`}
                      />
                    </button>

                    <button
                      onClick={() => setIsConfirmClearOpen(true)}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 flex items-center gap-1.5 transition-colors"
                      title="Clear session rows"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear Logs
                    </button>
                  </>
                )}

                <button
                  onClick={handleCreateNewSheet}
                  disabled={isCreatingSheet}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#4F46E5] hover:bg-indigo-700 text-white flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  {isCreatingSheet ? 'Creating Sheet...' : 'Create New Journal Sheet'}
                </button>
              </div>
            </div>

            {/* Input to Switch or Connect Existing Spreadsheet */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
              <div className="relative flex-1 w-full">
                <Link2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  placeholder="Paste Google Sheets URL or ID..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                />
              </div>
              <button
                onClick={handleConnectExisting}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold bg-gray-900 hover:bg-black text-white transition-colors flex-shrink-0"
              >
                Connect Sheet
              </button>
              <button
                onClick={handleSyncSampleRow}
                disabled={!currentSheetId}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors flex items-center gap-1.5 flex-shrink-0 disabled:opacity-40"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Log Sample Drill
              </button>
            </div>
          </div>

          {/* Sheet Rows Data Table */}
          <div className="bg-white rounded-2xl border border-[#111827]/[0.06] p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-emerald-600" />
                <h4 className="font-semibold text-sm text-[#111827]">
                  Google Sheet Entries ({rows.length > 0 ? rows.length - 1 : 0} sessions logged)
                </h4>
              </div>
              <span className="text-xs text-gray-400">
                Live sync via Google Sheets API v4
              </span>
            </div>

            {isLoadingRows ? (
              <div className="py-12 text-center text-sm text-gray-400 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                <span>Reading Google Sheets rows...</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500 bg-[#FAFAFA] rounded-xl border border-dashed border-gray-200">
                <FileCheck className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="font-medium text-gray-700">No session rows logged yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Complete a Live Voice session or Practice Drill to append your first executive report!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#4F46E5] text-white">
                      {rows[0]?.map((header: any, idx: number) => (
                        <th
                          key={idx}
                          className="px-3 py-2.5 font-semibold tracking-wider whitespace-nowrap border-b border-indigo-700"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.slice(1).map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="hover:bg-gray-50/80 transition-colors"
                      >
                        {row.map((cell: any, cellIdx: number) => (
                          <td
                            key={cellIdx}
                            className={`px-3 py-2.5 whitespace-nowrap text-[#141B2B] ${
                              cellIdx === 5 || cellIdx === 6
                                ? 'font-semibold text-indigo-700'
                                : cellIdx === 7 && Number(cell) > 0
                                ? 'text-rose-600 font-semibold'
                                : ''
                            }`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Mandatory Destructive Operation Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmClearOpen}
        title="Clear Google Sheet Practice Logs?"
        description="Are you sure you want to clear all logged session rows from this Google Sheet? The column headers will be preserved, but all recorded session scores, transcripts, and metrics will be erased from the sheet. This action cannot be undone."
        confirmLabel="Yes, Clear Rows"
        cancelLabel="Cancel"
        isDestructive={true}
        isLoading={isClearing}
        onConfirm={handleExecuteClear}
        onCancel={() => setIsConfirmClearOpen(false)}
      />
    </div>
  );
};
