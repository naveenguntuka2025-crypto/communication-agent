import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  Sparkles,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Clock,
  Layers,
  Award,
} from 'lucide-react';
import { WaveformVisualizer } from './WaveformVisualizer';
import { detectFillers } from '../utils/audioUtils';
import { SessionRecord } from '../services/googleSheets';

interface DrillScenario {
  id: string;
  title: string;
  category: string;
  timeLimit: number; // seconds
  prompt: string;
  focusKeywords: string[];
}

const DEFAULT_DRILLS: DrillScenario[] = [
  {
    id: 'exec-briefing',
    title: 'The 60-Second Executive Briefing',
    category: 'Executive Briefing',
    timeLimit: 60,
    prompt:
      'Update the CEO on a delayed product launch. State the bottom-line impact immediately (BLUF), explain the root cause in one sentence, and outline two decisive mitigation steps.',
    focusKeywords: ['BLUF structure', 'Conciseness', 'Calm conviction'],
  },
  {
    id: 'investor-pitch',
    title: 'High-Stakes Investor Hook',
    category: 'Elevator Pitch',
    timeLimit: 45,
    prompt:
      'You step into the elevator with a Tier-1 partner. Pitch why your team is poised to win your industry category in under 45 seconds. Include market urgency and your unfair advantage.',
    focusKeywords: ['Hook', 'Traction', 'Bold metric'],
  },
  {
    id: 'radical-candor',
    title: 'Delivering Difficult Feedback',
    category: 'Difficult Feedback',
    timeLimit: 90,
    prompt:
      'Deliver constructive feedback to a senior direct report whose missed deadlines are impacting customer deliverables. Ground the feedback in observable behavior, not personality.',
    focusKeywords: ['Empathy', 'Directness', 'Actionable agreement'],
  },
  {
    id: 'board-crisis',
    title: 'Crisis Control & Mitigation',
    category: 'Crisis Response',
    timeLimit: 60,
    prompt:
      'A major service outage impacted 12% of enterprise clients this morning. Address the board with complete transparency, no defensive rationalizations, and the 24-hour restore protocol.',
    focusKeywords: ['Zero defensiveness', 'Gravitas', 'Pacing'],
  },
];

interface PracticeDrillsProps {
  onLogToSheets?: (session: SessionRecord) => void;
  isSheetsConnected: boolean;
  onOpenSheetsTab: () => void;
}

export const PracticeDrills: React.FC<PracticeDrillsProps> = ({
  onLogToSheets,
  isSheetsConnected,
  onOpenSheetsTab,
}) => {
  const [selectedDrill, setSelectedDrill] = useState<DrillScenario>(DEFAULT_DRILLS[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [isLogged, setIsLogged] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const speechRecognizerRef = useRef<any>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  const startDrillRecording = async () => {
    setErrorMessage(null);
    setAnalysisResult(null);
    setIsLogged(false);
    setTranscript('');
    setTimerSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      setIsRecording(true);
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);

      // Start Web Speech Recognition
      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        const recognizer = new SpeechRec();
        recognizer.continuous = true;
        recognizer.interimResults = true;
        recognizer.lang = 'en-US';

        recognizer.onresult = (event: any) => {
          let fullText = '';
          for (let i = 0; i < event.results.length; i++) {
            fullText += event.results[i][0].transcript + ' ';
          }
          setTranscript(fullText.trim());
        };

        recognizer.onerror = (e: any) => {
          console.warn('Speech recognition warning:', e);
        };

        recognizer.start();
        speechRecognizerRef.current = recognizer;
      } else {
        setErrorMessage(
          'Live speech recognition is not supported in this browser. You can type or paste your spoken remarks below to evaluate!'
        );
      }
    } catch (err: any) {
      console.error('Error starting drill:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage(
          'Microphone permission was blocked. Please grant microphone access in your browser address bar (lock/mic icon) to rehearse this drill.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('No microphone device was detected. Please connect an audio input device.');
      } else {
        setErrorMessage(
          err.message || 'Microphone access is required to practice spoken speech.'
        );
      }
      stopRecording();
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (speechRecognizerRef.current) {
      try {
        speechRecognizerRef.current.stop();
      } catch (e) {}
      speechRecognizerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  };

  const handleAnalyze = async () => {
    if (!transcript.trim()) {
      setErrorMessage('Please speak or enter your transcript before running AI evaluation.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
      const res = await fetch('/api/coach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          scenario: selectedDrill.title,
          durationSeconds: Math.max(10, timerSeconds),
          wordCount,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Speech analysis request failed');
      }

      const data = await res.json();
      setAnalysisResult(data);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setErrorMessage(err.message || 'Failed to complete speech analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportDrillToSheets = () => {
    if (!analysisResult || !onLogToSheets) return;

    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    const calculatedWpm =
      timerSeconds > 0 ? Math.round((words / timerSeconds) * 60) : 145;

    const session: SessionRecord = {
      id: `DRL-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toLocaleString(),
      scenario: selectedDrill.title,
      durationSeconds: Math.max(10, timerSeconds),
      wordCount: words,
      wpm: analysisResult.detectedWpm || calculatedWpm,
      clarityScore: analysisResult.clarityScore || analysisResult.overallScore || 90,
      fillerCount: analysisResult.totalFillers ?? (analysisResult.fillerWords?.length || 0),
      presenceScore: analysisResult.executivePresenceScore || 88,
      keyStrength: analysisResult.keyStrengths?.[0] || 'Clear message architecture',
      improvement:
        analysisResult.priorityImprovements?.[0] ||
        'Elevate power phrasing in opening thesis',
      coachVerdict:
        analysisResult.coachVerdict ||
        `Strong delivery on ${selectedDrill.title}. Keep practicing BLUF structure.`,
    };

    onLogToSheets(session);
    setIsLogged(true);
  };

  return (
    <div className="space-y-6">
      {/* Drill Scenario Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {DEFAULT_DRILLS.map((drill) => (
          <button
            key={drill.id}
            onClick={() => {
              if (isRecording) stopRecording();
              setSelectedDrill(drill);
              setAnalysisResult(null);
            }}
            className={`text-left p-4 rounded-2xl border transition-all duration-200 ${
              selectedDrill.id === drill.id
                ? 'bg-white border-[#4F46E5] shadow-md ring-2 ring-indigo-500/10'
                : 'bg-white/70 hover:bg-white border-[#111827]/[0.06] hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-[#4F46E5] uppercase tracking-wider">
                {drill.category}
              </span>
              <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {drill.timeLimit}s
              </span>
            </div>
            <h4 className="font-semibold text-sm text-[#111827] line-clamp-1">
              {drill.title}
            </h4>
            <p className="text-xs text-[#6B7280] mt-1 line-clamp-2 leading-relaxed">
              {drill.prompt}
            </p>
          </button>
        ))}
      </div>

      {/* Active Drill Briefing Board */}
      <div className="bg-white rounded-2xl border border-[#111827]/[0.06] p-6 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-[#4F46E5]">
                {selectedDrill.category}
              </span>
              <h3 className="font-semibold text-lg text-[#111827]">
                {selectedDrill.title}
              </h3>
            </div>
            <p className="text-sm text-[#464555] mt-1 leading-relaxed">
              {selectedDrill.prompt}
            </p>
          </div>

          {/* Time Limit & Timer Pill */}
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-100 text-center">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">
                Duration
              </span>
              <span className="text-base font-bold text-[#111827] tabular-nums">
                {timerSeconds}s / {selectedDrill.timeLimit}s
              </span>
            </div>
          </div>
        </div>

        {/* Focus Pillars */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#464555]">
          <span className="font-semibold text-[#111827]">Evaluation Criteria:</span>
          {selectedDrill.focusKeywords.map((kw) => (
            <span
              key={kw}
              className="px-2.5 py-1 rounded-md bg-indigo-50/70 text-[#4F46E5] font-medium"
            >
              • {kw}
            </span>
          ))}
        </div>

        {/* Live Audio Visualizer for Drill */}
        <WaveformVisualizer isActive={isRecording} />

        {/* Recording Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            {isRecording ? (
              <button
                onClick={stopRecording}
                className="px-6 py-2.5 rounded-xl bg-[#F43F5E] hover:bg-rose-600 text-white font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
              >
                <Square className="w-4 h-4 fill-white" />
                Stop Recording
              </button>
            ) : (
              <button
                onClick={startDrillRecording}
                className="px-6 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-medium text-sm flex items-center gap-2 shadow-sm transition-all"
              >
                <Mic className="w-4 h-4" />
                Start Drill Practice
              </button>
            )}

            <span className="text-xs text-[#6B7280]">
              {isRecording
                ? 'Listening to microphone...'
                : transcript
                ? 'Recording ready for appraisal'
                : 'Press start to rehearse aloud'}
            </span>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !transcript.trim() || isRecording}
            className="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white font-medium text-sm flex items-center gap-2 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyzing Rhetoric...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                Analyze Delivery (Gemini)
              </>
            )}
          </button>
        </div>

        {/* Transcript Box */}
        <div className="pt-2">
          <label className="text-xs font-semibold text-gray-700 block mb-1.5">
            Your Spoken Response / Transcript
          </label>
          <textarea
            rows={4}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Your spoken remarks will appear here automatically. You can also edit or write notes before running AI evaluation..."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed"
          />
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-[#F43F5E]" />
          <p className="text-xs">{errorMessage}</p>
        </div>
      )}

      {/* Analysis Results View */}
      {analysisResult && (
        <div className="bg-white rounded-2xl border border-[#111827]/[0.06] p-6 shadow-[0_12px_32px_-4px_rgba(17,24,39,0.06)] space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-4">
            <div>
              <span className="text-xs font-semibold text-[#4F46E5] uppercase tracking-wider">
                Executive Rhetoric Appraisal
              </span>
              <h3 className="text-xl font-bold text-[#111827] mt-0.5">
                Evaluation for "{selectedDrill.title}"
              </h3>
            </div>

            {/* Overall Score Dial */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-xs text-gray-500 block">Overall Score</span>
                <span className="text-3xl font-extrabold text-[#4F46E5] tracking-tight">
                  {analysisResult.overallScore ?? 92}/100
                </span>
              </div>

              {isSheetsConnected ? (
                <button
                  onClick={handleExportDrillToSheets}
                  disabled={isLogged}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-sm ${
                    isLogged
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {isLogged ? 'Synced to Sheet!' : 'Log Drill to Google Sheets'}
                </button>
              ) : (
                <button
                  onClick={onOpenSheetsTab}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Connect Sheets
                </button>
              )}
            </div>
          </div>

          {/* Metric Badges Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[#F9F9FF] border border-indigo-50">
              <span className="text-[11px] font-medium text-gray-500">Speaking Pace</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-gray-900">
                  {analysisResult.detectedWpm || 142}
                </span>
                <span className="text-[11px] text-gray-500">WPM</span>
              </div>
              <span className="text-[11px] font-medium text-emerald-600 mt-1 block">
                {analysisResult.pacingVerdict === 'optimal'
                  ? 'Optimal Executive Range'
                  : analysisResult.pacingVerdict === 'too_fast'
                  ? 'High Tempo (Breathe)'
                  : 'Deliberate'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F9F9FF] border border-indigo-50">
              <span className="text-[11px] font-medium text-gray-500">Hesitations & Fillers</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span
                  className={`text-xl font-bold ${
                    (analysisResult.totalFillers || 0) > 0 ? 'text-[#F43F5E]' : 'text-gray-900'
                  }`}
                >
                  {analysisResult.totalFillers ?? (analysisResult.fillerWords?.length || 0)}
                </span>
                <span className="text-[11px] text-gray-500">words</span>
              </div>
              <span className="text-[11px] font-medium text-gray-500 mt-1 block truncate">
                {analysisResult.fillerWords?.map((f: any) => f.word).join(', ') || 'Clean Delivery'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F9F9FF] border border-indigo-50">
              <span className="text-[11px] font-medium text-gray-500">Executive Presence</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-gray-900">
                  {analysisResult.executivePresenceScore ?? 88}%
                </span>
              </div>
              <span className="text-[11px] font-medium text-indigo-600 mt-1 block">
                Conviction & Tone
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F9F9FF] border border-indigo-50">
              <span className="text-[11px] font-medium text-gray-500">Conciseness & BLUF</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-gray-900">
                  {analysisResult.concisenessScore ?? 85}%
                </span>
              </div>
              <span className="text-[11px] font-medium text-gray-500 mt-1 block">
                Signal-to-Noise
              </span>
            </div>
          </div>

          {/* Coach Verdict Banner */}
          <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 border-l-4 border-l-[#4F46E5]">
            <span className="text-xs font-bold text-[#4F46E5] uppercase tracking-wider block mb-1">
              Executive Coach Summary
            </span>
            <p className="text-sm text-[#141B2B] leading-relaxed">
              {analysisResult.coachVerdict}
            </p>
          </div>

          {/* Power Phrasing Transformations */}
          {analysisResult.powerPhrasing && analysisResult.powerPhrasing.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-[#4F46E5]" />
                <h4 className="text-sm font-semibold text-[#111827]">
                  Power Phrasing Upgrades (Say this instead)
                </h4>
              </div>

              <div className="space-y-2.5">
                {analysisResult.powerPhrasing.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-gray-100 bg-[#FAFAFA] space-y-1.5"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-rose-500 min-w-[55px]">
                        Draft:
                      </span>
                      <span className="text-xs text-gray-600 line-through">
                        "{item.original}"
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-[#10B981] min-w-[55px]">
                        Executive:
                      </span>
                      <span className="text-xs font-semibold text-[#111827]">
                        "{item.refined}"
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 italic pl-[63px]">
                      Why: {item.rationale}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths & Actionable Refinements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 border-l-4 border-l-[#10B981] space-y-2">
              <span className="text-xs font-semibold text-[#006C49] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                Observed Strengths
              </span>
              <ul className="text-xs text-[#141B2B] space-y-1.5 pl-1">
                {analysisResult.keyStrengths?.map((str: string, i: number) => (
                  <li key={i}>• {str}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/30 border-l-4 border-l-[#F43F5E] space-y-2">
              <span className="text-xs font-semibold text-[#BA1A1A] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-[#F43F5E]" />
                Priority Refinements
              </span>
              <ul className="text-xs text-[#141B2B] space-y-1.5 pl-1">
                {analysisResult.priorityImprovements?.map((imp: string, i: number) => (
                  <li key={i}>• {imp}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
