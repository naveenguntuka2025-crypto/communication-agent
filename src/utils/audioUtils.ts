/**
 * Audio helpers for Gemini 3.8 Live API and Real-Time Waveform
 */

// Converts Float32Array audio data (from Web Audio API) to 16-bit mono PCM base64 string
export function floatTo16BitPCMBase64(input: Float32Array): string {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(output.buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Converts base64 PCM (24kHz, 16-bit mono little endian) to AudioBuffer
export function pcmBase64ToAudioBuffer(
  base64: string,
  audioCtx: AudioContext,
  sampleRate = 24000
): AudioBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }

  const audioBuffer = audioCtx.createBuffer(1, float32Array.length, sampleRate);
  audioBuffer.copyToChannel(float32Array, 0);
  return audioBuffer;
}

/**
 * Audio Queue Player to smoothly stream and interrupt Gemini Live audio chunks
 */
export class LiveAudioPlayer {
  private ctx: AudioContext | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  public isPlaying = false;

  constructor() {
    // Lazily initialized on user interaction
  }

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx({ sampleRate: 24000 });
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public enqueueChunk(base64PCM: string) {
    try {
      const ctx = this.getContext();
      const buffer = pcmBase64ToAudioBuffer(base64PCM, ctx, 24000);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += buffer.duration;
      this.isPlaying = true;

      this.activeSources.push(source);
      source.onended = () => {
        this.activeSources = this.activeSources.filter((s) => s !== source);
        if (this.activeSources.length === 0 && this.nextPlayTime <= ctx.currentTime) {
          this.isPlaying = false;
        }
      };
    } catch (err) {
      console.error('Error playing audio chunk:', err);
    }
  }

  public interrupt() {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // ignore
      }
    }
    this.activeSources = [];
    if (this.ctx) {
      this.nextPlayTime = this.ctx.currentTime;
    }
    this.isPlaying = false;
  }

  public close() {
    this.interrupt();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export const COMMON_FILLER_WORDS = [
  'um',
  'uh',
  'like',
  'you know',
  'basically',
  'sort of',
  'kind of',
  'literally',
  'actually',
  'i mean',
  'right',
  'so yeah',
];

export function detectFillers(text: string): { totalCount: number; fillersMap: Record<string, number> } {
  if (!text) return { totalCount: 0, fillersMap: {} };
  const lower = text.toLowerCase();
  const map: Record<string, number> = {};
  let total = 0;

  for (const filler of COMMON_FILLER_WORDS) {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      map[filler] = matches.length;
      total += matches.length;
    }
  }

  return { totalCount: total, fillersMap: map };
}
