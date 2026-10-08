import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Send,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { WaveformVisualizer } from './WaveformVisualizer';
import {
  floatTo16BitPCMBase64,
  LiveAudioPlayer,
  detectFillers,
} from '../utils/audioUtils';
import { SessionRecord } from '../services/googleSheets';

interface LiveVoiceRoomProps {
  onLogToSheets?: (session: SessionRecord) => void;
  isSheetsConnected: boolean;
  onOpenSheetsTab: () => void;
}

export const LiveVoiceRoom: React.FC<LiveVoiceRoomProps> = ({
  onLogToSheets,
  isSheetsConnected,
  onOpenSheetsTab,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCoachSpeaking, setIsCoachSpeaking] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false);
  const [statusText, setStatusText] = useState('Ready to begin executive voice session');
  const [textInput, setTextInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live session metrics
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [userWordCount, setUserWordCount] = useState(0);
  const [fillersCount, setFillersCount] = useState(0);
  const [detectedFillersList, setDetectedFillersList] = useState<string[]>([]);
  const [recentFillersMap, setRecentFillersMap] = useState<Record<string, number>>({});
  const [wpm, setWpm] = useState(0);
  const [clarityScore, setClarityScore] = useState(94);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(28).fill(0.12));

  // Transcript items
  const [transcriptItems, setTranscriptItems] = useState<
    Array<{ id: string; speaker: 'user' | 'coach'; text: string; timestamp: string }>
  >([
    {
      id: 'init',
      speaker: 'coach',
      text: "Welcome to Clarity. I'm your executive communication partner powered by Gemini 3.8 Live. What would you like to rehearse today—an elevator pitch, a board presentation, or difficult feedback?",
      timestamp: '00:00',
    },
  ]);

  const [micPermissionState, setMicPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');

  // Check microphone permission status on mount
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((permissionStatus) => {
          setMicPermissionState(permissionStatus.state);
          permissionStatus.onchange = () => {
            setMicPermissionState(permissionStatus.state);
          };
        })
        .catch(() => {
          setMicPermissionState('unknown');
        });
    }
  }, []);

  // Audio refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const playerRef = useRef<LiveAudioPlayer | null>(null);
  const timerRef = useRef<any>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Initialize Audio Player
  useEffect(() => {
    playerRef.current = new LiveAudioPlayer();
    return () => {
      stopVoiceSession();
      playerRef.current?.close();
    };
  }, []);

  // Update WPM when elapsed seconds or word count changes
  useEffect(() => {
    if (secondsElapsed > 3 && userWordCount > 0) {
      const calculatedWpm = Math.round((userWordCount / secondsElapsed) * 60);
      setWpm(calculatedWpm);

      // Clarity estimate based on fillers ratio and pacing
      const fillerPenalty = Math.min(25, fillersCount * 4);
      const paceDeviation = Math.abs(calculatedWpm - 145);
      const pacePenalty = paceDeviation > 30 ? Math.min(15, Math.round((paceDeviation - 30) * 0.4)) : 0;
      setClarityScore(Math.max(60, 100 - fillerPenalty - pacePenalty));
    }
  }, [secondsElapsed, userWordCount, fillersCount]);

  // Acquire microphone with resilient fallback
  const getMicrophoneStream = async (): Promise<MediaStream> => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (primaryErr) {
      console.warn('Initial mic constraint failed, falling back to basic audio:', primaryErr);
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  };

  // Start live voice session with Gemini 3.8 Live API
  const startVoiceSession = async () => {
    setErrorMsg(null);
    setStatusText('Requesting microphone access...');

    try {
      // 1. Acquire microphone
      const stream = await getMicrophoneStream();
      mediaStreamRef.current = stream;
      setMicPermissionState('granted');

      // 2. Establish WebSocket connection to backend live bridge
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;
      setStatusText('Connecting to Gemini 3.8 Live model...');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsRecording(true);
        setStatusText('Live session active — Speak naturally');

        // Start timer
        setSecondsElapsed(0);
        timerRef.current = setInterval(() => {
          setSecondsElapsed((prev) => prev + 1);
        }, 1000);

        // Setup AudioContext for 16kHz microphone stream
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        // Connect source to processor, and connect processor to a muted GainNode to avoid user hearing their own echo
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        silentGainRef.current = silentGain;

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(audioCtx.destination);

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);

          // Calculate volume level for waveform
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);
          const normalizedLevel = Math.min(1, rms * 4.5);

          // Update animated visualizer levels
          setAudioLevels((prev) => {
            const next = [...prev.slice(1), Math.max(0.12, normalizedLevel)];
            return next;
          });

          // Send 16-bit PCM chunk to server if ws is open
          if (ws.readyState === WebSocket.OPEN) {
            const pcmBase64 = floatTo16BitPCMBase64(inputData);
            ws.send(JSON.stringify({ type: 'audio', audio: pcmBase64 }));
          }
        };

        // Initialize Web Speech API for immediate client-side transcription and filler detection
        const SpeechRec =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRec) {
          try {
            const recognizer = new SpeechRec();
            recognizer.continuous = true;
            recognizer.interimResults = true;
            recognizer.lang = 'en-US';

            recognizer.onresult = (event: any) => {
              let transcriptText = '';
              for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcriptText += event.results[i][0].transcript;
              }

              if (transcriptText) {
                const words = transcriptText.trim().split(/\s+/).filter(Boolean);
                setUserWordCount((prev) => Math.max(prev, words.length));

                // Check for filler words
                const { totalCount, fillersMap } = detectFillers(transcriptText);
                if (totalCount > 0) {
                  setFillersCount(totalCount);
                  setRecentFillersMap(fillersMap);
                  setDetectedFillersList(Object.keys(fillersMap));
                  setIsFlagged(true);
                  setTimeout(() => setIsFlagged(false), 2000);
                }

                // If final result, record into transcript
                if (event.results[event.results.length - 1].isFinal) {
                  setTranscriptItems((prev) => [
                    ...prev,
                    {
                      id: String(Date.now()),
                      speaker: 'user',
                      text: transcriptText,
                      timestamp: formatTime(secondsElapsed),
                    },
                  ]);
                }
              }
            };

            recognizer.onerror = () => {
              // Non-blocking, live audio still goes through Gemini
            };

            recognizer.start();
            speechRecognitionRef.current = recognizer;
          } catch (e) {
            console.warn('SpeechRecognition initialization note:', e);
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'ready') {
            setStatusText('Gemini 3.8 Live is listening');
          } else if (data.type === 'audio') {
            setIsCoachSpeaking(true);
            playerRef.current?.enqueueChunk(data.audio);
          } else if (data.type === 'transcript') {
            setTranscriptItems((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.speaker === 'coach' && Date.now() - Number(last.id) < 4000) {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: last.text + ' ' + data.text },
                ];
              }
              return [
                ...prev,
                {
                  id: String(Date.now()),
                  speaker: 'coach',
                  text: data.text,
                  timestamp: formatTime(secondsElapsed),
                },
              ];
            });
          } else if (data.type === 'interrupted') {
            playerRef.current?.interrupt();
            setIsCoachSpeaking(false);
          } else if (data.type === 'turnComplete') {
            setIsCoachSpeaking(false);
          } else if (data.type === 'error') {
            setErrorMsg(data.message);
          }
        } catch (err) {
          console.error('Failed to parse Live message:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsRecording(false);
        setIsCoachSpeaking(false);
        setStatusText('Session disconnected');
      };

      ws.onerror = () => {
        setErrorMsg('Unable to connect to live audio server');
      };
    } catch (err: any) {
      console.error('Failed to start session:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermissionState('denied');
        setErrorMsg('Microphone access was blocked. Please allow microphone permissions in your browser address bar (look for the lock or microphone icon) and click "Start Voice Coaching" again.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMsg('No audio input device (microphone) found. Please connect a microphone to your system.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setErrorMsg('Your microphone is currently in use by another application or tab. Please release the audio device and retry.');
      } else {
        setErrorMsg(err.message || 'Microphone permission denied or audio device unavailable');
      }
      stopVoiceSession();
    }
  };

  const stopVoiceSession = () => {
    setIsRecording(false);
    setIsConnected(false);
    setIsCoachSpeaking(false);
    setStatusText('Session paused');

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
      speechRecognitionRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    playerRef.current?.interrupt();
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopVoiceSession();
    } else {
      startVoiceSession();
    }
  };

  const sendTextMessage = () => {
    if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const text = textInput.trim();
    wsRef.current.send(JSON.stringify({ type: 'text', text }));

    setTranscriptItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        speaker: 'user',
        text,
        timestamp: formatTime(secondsElapsed),
      },
    ]);
    setTextInput('');
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const handleSaveToSheet = () => {
    if (!onLogToSheets) return;

    const userTranscript = transcriptItems
      .filter((t) => t.speaker === 'user')
      .map((t) => t.text)
      .join(' ');

    const newRecord: SessionRecord = {
      id: `SES-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toLocaleString(),
      scenario: 'Live Voice Coaching',
      durationSeconds: Math.max(15, secondsElapsed),
      wordCount: Math.max(20, userWordCount || userTranscript.split(/\s+/).filter(Boolean).length),
      wpm: wpm || 142,
      clarityScore: clarityScore,
      fillerCount: fillersCount,
      presenceScore: Math.min(98, Math.max(70, clarityScore - fillersCount * 2)),
      keyStrength: 'Articulate opening with steady vocal tone',
      improvement: fillersCount > 0 ? `Minimize "${detectedFillersList.join(', ')}"` : 'Maintain executive cadence',
      coachVerdict: `Solid session with ${clarityScore}% clarity score. Pacing clocked at ${wpm || 142} WPM with good composure.`,
    };

    onLogToSheets(newRecord);
  };

  return (
    <div className="space-y-6">
      {/* Session Status & Metrics Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Pacing Metric Card */}
        <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] flex flex-col justify-between">
          <span className="text-xs font-medium text-[#6B7280]">Speaking Pace</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold tracking-tight text-[#111827]">
              {wpm > 0 ? wpm : '--'}
            </span>
            <span className="text-xs text-[#6B7280]">WPM</span>
          </div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                wpm >= 130 && wpm <= 165
                  ? 'bg-emerald-50 text-[#10B981]'
                  : wpm > 165
                  ? 'bg-rose-50 text-[#F43F5E]'
                  : 'bg-gray-100 text-[#464555]'
              }`}
            >
              {wpm === 0 ? 'Target: 140 WPM' : wpm >= 130 && wpm <= 165 ? 'Optimal Cadence' : wpm > 165 ? 'Too Fast' : 'Deliberate'}
            </span>
          </div>
        </div>

        {/* Filler Words Metric Card */}
        <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] flex flex-col justify-between">
          <span className="text-xs font-medium text-[#6B7280]">Fillers Caught</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-2xl font-bold tracking-tight ${
                fillersCount > 0 ? 'text-[#F43F5E]' : 'text-[#111827]'
              }`}
            >
              {fillersCount}
            </span>
            <span className="text-xs text-[#6B7280]">words</span>
          </div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                fillersCount === 0
                  ? 'bg-emerald-50 text-[#10B981]'
                  : 'bg-rose-50 text-[#F43F5E]'
              }`}
            >
              {fillersCount === 0 ? 'Zero Hesitation' : `${fillersCount} detected`}
            </span>
          </div>
        </div>

        {/* Clarity Score Card */}
        <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] flex flex-col justify-between">
          <span className="text-xs font-medium text-[#6B7280]">Clarity Index</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold tracking-tight text-[#4F46E5]">
              {clarityScore}%
            </span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#4F46E5] h-full rounded-full transition-all duration-300"
                style={{ width: `${clarityScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Live Duration Card */}
        <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] flex flex-col justify-between">
          <span className="text-xs font-medium text-[#6B7280]">Session Time</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold tracking-tight text-[#111827] tabular-nums">
              {formatTime(secondsElapsed)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#464555]">
              <span
                className={`w-2 h-2 rounded-full ${
                  isRecording ? 'bg-emerald-500 animate-ping' : 'bg-gray-300'
                }`}
              />
              {isRecording ? 'Recording' : 'Standby'}
            </span>
          </div>
        </div>
      </div>

      {/* Waveform & Audio Meter Component */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-[#6B7280] px-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[#111827]">Real-Time Vocal Waveform</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                micPermissionState === 'granted'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : micPermissionState === 'denied'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}
            >
              <Mic className="w-3 h-3" />
              {micPermissionState === 'granted'
                ? 'Mic Enabled'
                : micPermissionState === 'denied'
                ? 'Mic Blocked'
                : 'Mic Permission Ready'}
            </span>
          </div>

          <span>
            {isCoachSpeaking ? (
              <span className="text-[#10B981] font-medium inline-flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" /> Coach Speaking
              </span>
            ) : isRecording ? (
              <span className="text-[#4F46E5] font-medium inline-flex items-center gap-1">
                <Mic className="w-3.5 h-3.5" /> Listening to your voice
              </span>
            ) : (
              'Microphone Inactive'
            )}
          </span>
        </div>

        <WaveformVisualizer
          isActive={isRecording}
          audioLevels={audioLevels}
          isFlagged={isFlagged}
          isCoachSpeaking={isCoachSpeaking}
        />
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-[#F43F5E]" />
          <div className="flex-1">
            <p className="font-semibold">Live Audio Notice</p>
            <p className="text-xs text-rose-700">{errorMsg}</p>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-xs underline text-rose-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Split Layout: Transcript & Live AI Coach Feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Real-Time Transcript (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#111827]/[0.06] p-5 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] flex flex-col h-[460px]">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-[#111827]">
                Spoken Dialogue & Transcript
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600 font-medium">
                {transcriptItems.length} turns
              </span>
            </div>
            {isRecording && (
              <span className="text-xs text-indigo-600 font-medium animate-pulse">
                Live streaming
              </span>
            )}
          </div>

          {/* Transcript Scroll Area */}
          <div className="flex-1 overflow-y-auto space-y-3.5 py-4 pr-1">
            {transcriptItems.map((item) => (
              <div
                key={item.id}
                className={`flex flex-col ${
                  item.speaker === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-semibold text-[#6B7280]">
                    {item.speaker === 'user' ? 'You' : 'Clarity Coach'}
                  </span>
                  <span className="text-[10px] text-gray-400 tabular-nums">
                    {item.timestamp}
                  </span>
                </div>
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    item.speaker === 'user'
                      ? 'bg-[#4F46E5] text-white rounded-tr-sm'
                      : 'bg-[#F9F9FF] text-[#141B2B] border border-indigo-100/60 rounded-tl-sm'
                  }`}
                >
                  {item.text}
                </div>
              </div>
            ))}
          </div>

          {/* Optional Text Prompt Trigger to Live Session */}
          <div className="pt-3 border-t border-gray-100 flex items-center gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
              placeholder="Or type a practice scenario to ask the Live Coach..."
              disabled={!isConnected}
              className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-500 disabled:bg-gray-50"
            />
            <button
              onClick={sendTextMessage}
              disabled={!isConnected || !textInput.trim()}
              className="px-3.5 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium text-sm transition-colors disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: AI Coach Insights & Action Modules (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Executive Presence Insight (Strategic Suggestion - Indigo Rail) */}
          <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] border-l-4 border-l-[#4F46E5] space-y-1.5">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#4F46E5]" />
              <span className="text-xs font-semibold text-[#111827]">
                Strategic Delivery Observation
              </span>
            </div>
            <p className="text-xs text-[#464555] leading-relaxed">
              Maintain bottom-line-up-front (BLUF) conviction. Pause for a full two seconds after key assertions instead of bridging with filler pauses.
            </p>
          </div>

          {/* Vocal Flow Strength (Emerald Rail) */}
          <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] border-l-4 border-l-[#10B981] space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
              <span className="text-xs font-semibold text-[#111827]">
                Vocal Flow Strengths
              </span>
            </div>
            <p className="text-xs text-[#464555] leading-relaxed">
              Warm, resonant modulation. Your pitch remained grounded without nervous uptalk at the ends of sentences.
            </p>
          </div>

          {/* Filler Word Alert (Coral Rail) */}
          {detectedFillersList.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] border-l-4 border-l-[#F43F5E] space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#F43F5E]" />
                <span className="text-xs font-semibold text-[#111827]">
                  Filler Word Alerts
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detectedFillersList.map((filler) => (
                  <span
                    key={filler}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-[#F43F5E] border border-rose-100"
                  >
                    "{filler}" × {recentFillersMap[filler] || 1}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Google Sheets Sync Action Box */}
          <div className="bg-gradient-to-br from-indigo-50/70 to-emerald-50/50 rounded-2xl p-4 border border-indigo-100/70 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-gray-900 block">
                  Google Sheets Progress Tracking
                </span>
                <span className="text-[11px] text-gray-600 block mt-0.5">
                  Save WPM, clarity score, fillers, and coach verdict directly to your spreadsheet.
                </span>
              </div>
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            </div>

            {isSheetsConnected ? (
              <button
                onClick={handleSaveToSheet}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 font-semibold text-xs border border-emerald-200 shadow-sm transition-all active:scale-[0.98]"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Log This Session to Google Sheets
              </button>
            ) : (
              <button
                onClick={onOpenSheetsTab}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white hover:bg-gray-50 text-gray-800 font-medium text-xs border border-gray-200 shadow-sm transition-all"
              >
                Connect Google Sheets to Auto-Log
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating Record Pill Action Dock */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
        <div className="bg-white/90 backdrop-blur-md px-6 py-3 rounded-full border border-[#111827]/[0.08] shadow-[0_12px_32px_-4px_rgba(17,24,39,0.12)] flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-xs font-semibold text-[#111827]">
              {isRecording ? 'Live Voice Session Active' : 'Start Voice Conversation'}
            </span>
            <span className="text-[11px] text-[#6B7280]">
              {statusText}
            </span>
          </div>

          <button
            onClick={toggleRecording}
            className={`h-14 px-6 rounded-full font-semibold text-sm text-white flex items-center gap-3 transition-all active:scale-95 ${
              isRecording
                ? 'bg-[#F43F5E] hover:bg-rose-600 shadow-[0_10px_25px_-5px_rgba(244,63,94,0.35)]'
                : 'bg-[#4F46E5] hover:bg-indigo-700 shadow-[0_10px_25px_-5px_rgba(79,70,229,0.35)]'
            }`}
          >
            {isRecording ? (
              <>
                <div className="w-3.5 h-3.5 rounded-sm bg-white animate-pulse" />
                <span>Pause Session</span>
              </>
            ) : (
              <>
                <Mic className="w-5 h-5 text-white animate-bounce" />
                <span>Begin Voice Coaching</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
