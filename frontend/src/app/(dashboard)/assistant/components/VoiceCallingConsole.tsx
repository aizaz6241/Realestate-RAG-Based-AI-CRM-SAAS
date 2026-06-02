import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Loader2, Volume2, X, PhoneOff, RefreshCw } from "lucide-react";

interface VoiceCallingConsoleProps {
  isMuted: boolean;
  onToggleMute: () => void;
  voiceAgentState: 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';
  onExitVoiceMode: () => void;
  onResetListening: () => void;
  subtitleFeedUser: string;
  subtitleFeedAi: string;
  activeCallPersona: 'ORCHESTRATOR' | 'HR' | 'FINANCE' | 'PROPERTY' | 'LOGISTICS';
  onPersonaChange?: (persona: 'ORCHESTRATOR' | 'HR' | 'FINANCE' | 'PROPERTY' | 'LOGISTICS') => void;
  voiceGender: 'female' | 'male';
  onVoiceGenderChange: (gender: 'female' | 'male') => void;
  voiceRate: number;
  onVoiceRateChange: (rate: number) => void;
  voicePitch: number;
  onVoicePitchChange: (pitch: number) => void;
}

export const VoiceCallingConsole: React.FC<VoiceCallingConsoleProps> = ({
  isMuted,
  onToggleMute,
  voiceAgentState,
  onExitVoiceMode,
  onResetListening,
  subtitleFeedUser,
  subtitleFeedAi,
  activeCallPersona,
  onPersonaChange,
  voiceGender,
  onVoiceGenderChange,
  voiceRate,
  onVoiceRateChange,
  voicePitch,
  onVoicePitchChange
}) => {
  const [amplitude, setAmplitude] = useState<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Hook up real-time mic volume tracking when listening and not muted
  useEffect(() => {
    const startMicTracking = async () => {
      if (voiceAgentState !== 'LISTENING' || isMuted) {
        stopMicTracking();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 32;
        source.connect(analyser);
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const trackVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const average = sum / bufferLength;
          // Normalize volume to a scale of 0 to 100
          setAmplitude(average);

          animationFrameRef.current = requestAnimationFrame(trackVolume);
        };

        trackVolume();
      } catch (err) {
        console.warn("⚠️ Microphone volume visualizer access blocked or unavailable:", err);
      }
    };

    startMicTracking();

    return () => {
      stopMicTracking();
    };
  }, [voiceAgentState, isMuted]);

  const stopMicTracking = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAmplitude(0);
  };

  // Generate dynamic wave heights based on voiceAgentState and current mic amplitude
  const getWaveBarStyles = (index: number) => {
    const baseHeight = 12; // minimum height
    if (isMuted) {
      // Small ambient breathing in muted state
      const sinusVal = Math.sin((Date.now() / 250) + index) * 5 + 10;
      return { height: `${sinusVal}px`, opacity: 0.25 };
    }

    if (voiceAgentState === 'LISTENING') {
      // Check if user is actively speaking based on microphone input amplitude (threshold is 5)
      const isSpeaking = amplitude > 5;
      
      if (isSpeaking) {
        // Active speaking: HIGH vibration / energetic shaking!
        // We use a high frequency sine wave for jitter and vertical translation to simulate voice vibrations
        const speed = Date.now() / 25; // extremely rapid oscillation
        const offset = Math.sin(index * 0.8) * 8;
        const jitter = Math.sin(speed + index * 1.5) * 12 + Math.cos(Date.now() / 15 - index) * 6;
        const height = Math.max(baseHeight, (amplitude * 1.8) + offset + jitter);
        
        return { 
          height: `${Math.min(96, height)}px`, 
          transition: 'height 0.03s cubic-bezier(0.1, 0.8, 0.3, 1)',
          boxShadow: '0 0 22px rgba(6, 182, 212, 0.8)',
          transform: `translateY(${Math.sin(Date.now() / 8 + index) * 3}px)`,
          opacity: 1
        };
      } else {
        // Silent / Khamosh: Slow, peaceful breathing ambient wave
        const speed = Date.now() / 800; // super slow breathe
        const sinusVal = Math.sin(speed + index * 0.4) * 6 + baseHeight + 4;
        
        return { 
          height: `${sinusVal}px`, 
          transition: 'height 0.25s ease-in-out',
          boxShadow: 'none',
          transform: 'translateY(0px)',
          opacity: 0.6
        };
      }
    }

    if (voiceAgentState === 'SPEAKING') {
      // AI is speaking: simulate active voice amplitude with high frequency
      const speed = Date.now() / 120;
      const sinusVal = Math.sin(speed + index * 1.2) * 28 + 36;
      return { 
        height: `${sinusVal}px`, 
        transition: 'height 0.08s ease-in-out',
        boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)'
      };
    }

    if (voiceAgentState === 'THINKING') {
      // Slow pulsing green light thinking state
      const sinusVal = Math.sin((Date.now() / 150) + index * 0.5) * 8 + 18;
      return { height: `${sinusVal}px`, transition: 'height 0.15s ease-in-out' };
    }

    // Default IDLE / breathing state
    const sinusVal = Math.sin((Date.now() / 350) + index * 0.4) * 6 + 14;
    return { height: `${sinusVal}px` };
  };

  return (
    <div className="lg:col-span-8 glass border border-primary/20 overflow-hidden flex flex-col items-center justify-between bg-slate-950/90 shadow-[0_10px_60px_rgba(0,0,0,0.65)] relative p-8 backdrop-blur-2xl h-full animate-fade-in rounded-3xl min-h-[620px]">
      
      {/* Background glowing gradients */}
      <div className="absolute -top-32 -left-32 w-72 h-72 rounded-full bg-primary/20 blur-[80px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-72 h-72 rounded-full bg-secondary/20 blur-[80px] pointer-events-none" />

      {/* Glowing top line indicator */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-purple-500 to-secondary animate-pulse" />

      {/* Close / Hang up Button */}
      <button 
        onClick={onExitVoiceMode}
        className="absolute top-6 right-6 text-red-400 hover:text-white transition-all p-3 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 cursor-pointer flex items-center justify-center z-[100]"
        title="Hang up Call"
      >
        <X className="w-5 h-5 animate-pulse" />
      </button>

      {/* Header branding */}
      <div className="space-y-2 mt-4 text-center">
        <span className="text-[10px] font-black uppercase text-primary tracking-widest animate-pulse">RENS Voice Live 2.0</span>
        <h2 className="text-xl font-black text-white flex items-center gap-2.5 justify-center">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
          RENS AI Live Calling Center
        </h2>
        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-wider">
          Line 1: {activeCallPersona === 'ORCHESTRATOR' ? 'Operational Core' : `${activeCallPersona} Specialised`} Agent • Connected
        </p>
      </div>

      {/* Main Glowing Call Visualizer Orb & Dynamic Waveform */}
      <div className="flex flex-col items-center justify-center my-8 relative w-full max-w-md flex-1">
        <div 
          onClick={() => {
            if (voiceAgentState === "SPEAKING") {
              if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
              onResetListening();
            }
          }}
          className={`w-32 h-32 rounded-full flex items-center justify-center relative cursor-pointer group transition-all duration-500 z-10 ${
            isMuted
              ? "bg-red-500/10 border-2 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.2)]"
              : voiceAgentState === 'LISTENING' 
              ? "bg-cyan-500/20 border-2 border-cyan-400 animate-pulse shadow-[0_0_50px_rgba(6,182,212,0.5)] scale-105" 
              : voiceAgentState === 'THINKING'
              ? "bg-emerald-500/20 border-2 border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.6)]"
              : voiceAgentState === 'SPEAKING'
              ? "bg-purple-500/20 border-2 border-purple-500 animate-pulse shadow-[0_0_50px_rgba(168,85,247,0.6)]"
              : "bg-secondary/40 border-2 border-border shadow-[0_0_30px_rgba(255,255,255,0.05)]"
          }`}
        >
          <div className="absolute inset-2.5 rounded-full border border-white/5 bg-black/40 flex items-center justify-center">
            {isMuted ? (
              <MicOff className="w-8 h-8 text-red-400 glow-red animate-pulse" />
            ) : voiceAgentState === 'THINKING' ? (
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin glow-emerald" />
            ) : voiceAgentState === 'SPEAKING' ? (
              <Volume2 className="w-8 h-8 text-purple-400 glow-purple animate-bounce" />
            ) : (
              <Mic className={`w-8 h-8 text-cyan-400 glow-primary ${voiceAgentState === 'LISTENING' ? "scale-110" : ""}`} />
            )}
          </div>
          
          {voiceAgentState === 'SPEAKING' && !isMuted && (
            <span className="absolute -bottom-6 text-[8px] font-bold text-purple-400 uppercase tracking-widest animate-pulse">Tap to Interrupt</span>
          )}
        </div>

        {/* Dynamic Waveform Visualizer - Scaled by actual real-time volume! */}
        <div className="flex items-center gap-2 justify-center h-24 mt-10 overflow-hidden w-full px-6">
          {[...Array(12)].map((_, i) => {
            const barStyle = getWaveBarStyles(i);
            const colorClass = isMuted ? "bg-red-500/30" :
              voiceAgentState === 'LISTENING' ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" :
              voiceAgentState === 'THINKING' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
              voiceAgentState === 'SPEAKING' ? "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" : "bg-cyan-500/40";
            return (
              <div 
                key={i} 
                className={`w-2.5 rounded-full ${colorClass} transition-all duration-[40ms]`} 
                style={barStyle} 
              />
            );
          })}
        </div>
      </div>

      {/* Subtitles & Spoken Captions Feed Console - SOLID DARK GLASS for High-Legibility under Dim-Lighting */}
      <div className="w-full max-w-xl p-5 rounded-3xl border border-white/10 bg-slate-950/95 text-left space-y-4 relative overflow-hidden backdrop-blur-xl shadow-[0_15px_40px_rgba(0,0,0,0.9)] min-h-36">
        <span className="absolute top-2 right-4 text-[8px] font-black uppercase text-gray-500 tracking-widest select-none">Live Captions</span>
        
        <div className="space-y-3.5 mt-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
          {subtitleFeedUser && (
            <div className="flex gap-3 items-start bg-slate-900/95 p-3 rounded-2xl border border-white/10 shadow-inner animate-fade-in">
              <span className="text-[8px] font-black uppercase bg-slate-800 text-white px-2 py-0.5 rounded-lg border border-white/10 flex-shrink-0 mt-0.5 select-none">YOU</span>
              <p className="text-sm font-bold text-white leading-relaxed tracking-wide">{subtitleFeedUser}</p>
            </div>
          )}
          
          {subtitleFeedAi && (
            <div className="flex gap-3 items-start bg-cyan-950/90 p-3 rounded-2xl border border-cyan-500/20 shadow-inner animate-fade-in">
              <span className="text-[8px] font-black uppercase bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-lg border border-cyan-400/30 flex-shrink-0 mt-0.5 select-none">AI</span>
              <p className="text-sm font-bold text-cyan-300 leading-relaxed tracking-wide drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">{subtitleFeedAi}</p>
            </div>
          )}

          {!subtitleFeedUser && !subtitleFeedAi && (
            <p className="text-xs text-cyan-400/80 font-extrabold italic text-center py-6 animate-pulse uppercase tracking-wider">
              {voiceAgentState === 'LISTENING' ? "🎙️ Actively listening. Speak now..." : "📞 Connecting to Operational Core..."}
            </p>
          )}
        </div>
      </div>

      {/* Call State Controls Strip */}
      <div className="w-full max-w-xl border-t border-border/25 mt-6 pt-5 flex items-center justify-between gap-6 flex-shrink-0">
        
        {/* Mute Mic Button */}
        <button
          onClick={onToggleMute}
          className={`p-3 rounded-2xl border transition-all duration-300 active:scale-95 cursor-pointer flex items-center gap-2 px-4 py-2.5 ${
            isMuted 
              ? "bg-red-500/20 border-red-500/60 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse" 
              : "bg-secondary/40 border-border/20 text-gray-400 hover:text-white hover:border-border/40"
          }`}
          title={isMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {isMuted ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
          <span className="text-[10px] font-extrabold uppercase tracking-wider">{isMuted ? "Muted" : "Mute"}</span>
        </button>

        {/* Centered HANG UP Button */}
        <button
          onClick={onExitVoiceMode}
          className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 border border-red-500/30 text-white font-extrabold text-xs uppercase tracking-wider transition-all duration-300 active:scale-95 cursor-pointer shadow-[0_0_20px_rgba(220,38,38,0.4)] flex items-center gap-2"
          title="Disconnect Call"
        >
          <PhoneOff className="w-4 h-4 animate-pulse" />
          <span>End Session</span>
        </button>

        {/* Force Recut / Restart State Button */}
        <button
          onClick={onResetListening}
          className="p-3 rounded-2xl border bg-secondary/40 border-border/20 text-gray-400 hover:text-white hover:border-border/40 transition-all duration-300 active:scale-95 cursor-pointer flex items-center gap-2 px-4 py-2.5"
          title="Restart Listening State"
        >
          <RefreshCw className="w-4.5 h-4.5" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider">Reset</span>
        </button>
      </div>

      {/* Customizer Slider Settings Panel (Integrated Desk) */}
      <div className="w-full max-w-xl border-t border-border/20 mt-5 pt-4 grid grid-cols-3 gap-4 text-left flex-shrink-0">
        <div className="space-y-1.5 flex flex-col">
          <label className="text-[8px] font-black text-gray-500 uppercase tracking-wider">Voice Gender</label>
          <div className="flex gap-1.5 bg-secondary/35 border border-border/40 p-0.5 rounded-xl">
            <button
              onClick={() => onVoiceGenderChange('female')}
              className={`flex-1 text-[9px] font-extrabold uppercase py-1 rounded-lg transition-all cursor-pointer ${
                voiceGender === 'female' ? "bg-primary text-white font-black" : "text-gray-400 hover:text-white"
              }`}
            >
              Female
            </button>
            <button
              onClick={() => onVoiceGenderChange('male')}
              className={`flex-1 text-[9px] font-extrabold uppercase py-1 rounded-lg transition-all cursor-pointer ${
                voiceGender === 'male' ? "bg-primary text-white font-black" : "text-gray-400 hover:text-white"
              }`}
            >
              Male
            </button>
          </div>
        </div>

        <div className="space-y-1.5 flex flex-col">
          <div className="flex justify-between items-center">
            <label className="text-[8px] font-black text-gray-500 uppercase tracking-wider">Voice Pace</label>
            <span className="text-[8px] font-extrabold text-primary">{voiceRate.toFixed(1)}x</span>
          </div>
          <input 
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            className="accent-primary cursor-pointer w-full h-1.5 bg-secondary border border-border/30 rounded-lg outline-none"
            value={voiceRate}
            onChange={(e) => onVoiceRateChange(parseFloat(e.target.value))}
          />
        </div>

        <div className="space-y-1.5 flex flex-col">
          <div className="flex justify-between items-center">
            <label className="text-[8px] font-black text-gray-500 uppercase tracking-wider">Voice Pitch</label>
            <span className="text-[8px] font-extrabold text-primary">{voicePitch.toFixed(1)}x</span>
          </div>
          <input 
            type="range"
            min="0.5"
            max="1.5"
            step="0.1"
            className="accent-primary cursor-pointer w-full h-1.5 bg-secondary border border-border/30 rounded-lg outline-none"
            value={voicePitch}
            onChange={(e) => onVoicePitchChange(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
};

export default VoiceCallingConsole;
