import React from 'react';
import {
  TrendingUp,
  Award,
  Zap,
  Clock,
  CheckCircle,
  FileSpreadsheet,
  Layers,
  Sparkles,
} from 'lucide-react';
import { SessionRecord } from '../services/googleSheets';

interface AnalyticsViewProps {
  sessions: SessionRecord[];
  onOpenSheets: () => void;
  isSheetsConnected: boolean;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  sessions,
  onOpenSheets,
  isSheetsConnected,
}) => {
  // Compute aggregate metrics
  const totalSessions = sessions.length;
  const avgWpm =
    totalSessions > 0
      ? Math.round(sessions.reduce((acc, s) => acc + s.wpm, 0) / totalSessions)
      : 144;
  const avgClarity =
    totalSessions > 0
      ? Math.round(sessions.reduce((acc, s) => acc + s.clarityScore, 0) / totalSessions)
      : 93;
  const totalFillers =
    totalSessions > 0
      ? sessions.reduce((acc, s) => acc + s.fillerCount, 0)
      : 2;
  const avgPresence =
    totalSessions > 0
      ? Math.round(sessions.reduce((acc, s) => acc + s.presenceScore, 0) / totalSessions)
      : 90;

  const POWER_PHRASING_DICTIONARY = [
    {
      hedge: 'I just wanted to check if maybe we could...',
      executive: 'I propose we advance on...',
      category: 'Decisiveness',
    },
    {
      hedge: 'Does that make sense?',
      executive: 'What questions do you have regarding the timeline?',
      category: 'Authority',
    },
    {
      hedge: 'Sort of / kind of like a platform',
      executive: 'Specifically architected as an enterprise platform',
      category: 'Precision',
    },
    {
      hedge: 'We think it might work out',
      executive: 'The pilot validated our projected return within 60 days',
      category: 'Conviction',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Aggregates */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)]">
          <span className="text-xs font-medium text-gray-500">Average Pacing</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-gray-900">{avgWpm}</span>
            <span className="text-xs text-gray-500">WPM</span>
          </div>
          <span className="text-[11px] font-medium text-emerald-600 mt-2 block">
            Target: 135-155 WPM
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)]">
          <span className="text-xs font-medium text-gray-500">Mean Clarity</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-[#4F46E5]">{avgClarity}%</span>
          </div>
          <span className="text-[11px] font-medium text-gray-500 mt-2 block">
            Cadence & articulation
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)]">
          <span className="text-xs font-medium text-gray-500">Hesitations Caught</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-[#F43F5E]">{totalFillers}</span>
            <span className="text-xs text-gray-500">total</span>
          </div>
          <span className="text-[11px] font-medium text-gray-500 mt-2 block">
            Over {totalSessions} recorded turns
          </span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)]">
          <span className="text-xs font-medium text-gray-500">Executive Presence</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-emerald-600">{avgPresence}%</span>
          </div>
          <span className="text-[11px] font-medium text-emerald-600 mt-2 block">
            High gravitas benchmark
          </span>
        </div>
      </div>

      {/* Rhetoric Improvement Radar & Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Power Phrasing Guide (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#111827]/[0.06] p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-[#4F46E5]" />
              <h3 className="font-semibold text-base text-[#111827]">
                Executive Power Phrasing Bank
              </h3>
            </div>
            <span className="text-xs text-gray-400">
              Transform weak speech habits
            </span>
          </div>

          <div className="space-y-3">
            {POWER_PHRASING_DICTIONARY.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-gray-100 bg-[#FAFAFA] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {item.category}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-rose-500 font-medium min-w-[50px]">
                    Avoid:
                  </span>
                  <span className="text-xs text-gray-500 line-through">
                    "{item.hedge}"
                  </span>
                </div>
                <div className="flex items-baseline gap-2 pt-0.5">
                  <span className="text-xs text-emerald-600 font-semibold min-w-[50px]">
                    Use:
                  </span>
                  <span className="text-xs font-semibold text-[#111827]">
                    "{item.executive}"
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Recent Practice Log & Sheets Sync (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#111827]/[0.06] p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-base text-[#111827]">
                Recent Sessions
              </h3>
            </div>
            <button
              onClick={onOpenSheets}
              className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              View in Sheets
            </button>
          </div>

          <div className="space-y-3">
            {sessions.slice(0, 4).map((s) => (
              <div
                key={s.id}
                className="p-3.5 rounded-xl border border-gray-100 hover:border-indigo-100 bg-[#FAFAFA] transition-colors"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-[#111827]">
                  <span>{s.scenario}</span>
                  <span className="text-indigo-600">{s.clarityScore}% Clarity</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
                  <span>{s.wpm} WPM</span>
                  <span>•</span>
                  <span>{s.fillerCount} fillers</span>
                  <span>•</span>
                  <span>{s.durationSeconds}s duration</span>
                </div>
                <p className="text-[11px] text-gray-600 mt-1.5 line-clamp-1 italic">
                  "{s.coachVerdict}"
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
