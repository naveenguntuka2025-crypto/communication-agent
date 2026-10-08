import React, { useMemo } from 'react';

interface WaveformVisualizerProps {
  isActive: boolean;
  audioLevels?: number[]; // Normalized 0-1 values for bars
  isFlagged?: boolean; // Filler detected or high-stress pitch
  isCoachSpeaking?: boolean;
  barsCount?: number;
  className?: string;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  isActive,
  audioLevels,
  isFlagged = false,
  isCoachSpeaking = false,
  barsCount = 28,
  className = '',
}) => {
  // Generate visual bar heights either from live audio levels or gentle dynamic animation
  const bars = useMemo(() => {
    if (audioLevels && audioLevels.length > 0) {
      return audioLevels;
    }
    // Fallback baseline
    return Array.from({ length: barsCount }, (_, i) => {
      if (!isActive) return 0.12;
      const seed = Math.sin((i / barsCount) * Math.PI) * 0.7 + 0.3;
      return seed;
    });
  }, [audioLevels, isActive, barsCount]);

  // Determine bar theme colors based on state
  const getBarColor = (index: number) => {
    if (!isActive) return 'bg-[#E5E7EB]';
    if (isFlagged) return 'bg-[#F43F5E] shadow-[0_0_8px_rgba(244,63,94,0.4)]'; // Coral on filler or hitch
    if (isCoachSpeaking) return 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.3)]'; // Emerald for coach
    return 'bg-[#4F46E5] shadow-[0_0_6px_rgba(79,70,229,0.25)]'; // Indigo during clear executive speech
  };

  return (
    <div
      className={`w-full flex items-center justify-center gap-[4px] sm:gap-[5px] h-20 px-4 py-3 rounded-2xl bg-white border border-[#111827]/[0.06] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.03)] transition-colors ${className}`}
    >
      {bars.map((level, i) => {
        const heightPercent = Math.max(12, Math.min(100, Math.round(level * 100)));
        return (
          <div
            key={i}
            className={`w-[4px] sm:w-[5px] rounded-full transition-all duration-150 ease-out ${getBarColor(
              i
            )}`}
            style={{
              height: `${heightPercent}%`,
              opacity: isActive ? Math.max(0.4, level) : 0.45,
            }}
          />
        );
      })}
    </div>
  );
};
