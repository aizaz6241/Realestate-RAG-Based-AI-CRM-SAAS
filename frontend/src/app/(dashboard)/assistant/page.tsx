"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
  Send, 
  Loader2, 
  Plus, 
  Trash2, 
  UploadCloud, 
  FileText, 
  ChevronRight, 
  Building2, 
  Wallet, 
  CheckSquare, 
  Users, 
  Sparkles, 
  ArrowRight,
  RefreshCw,
  Search,
  BookOpen,
  Calendar,
  Video,
  Truck,
  Clock,
  Palmtree,
  MapPin,
  Mic,
  MicOff,
  Terminal,
  Database,
  ChevronDown,
  TrendingUp,
  Volume2,
  X,
  Award,
  Star,
  User,
  PhoneOff
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import ChatSessionsList from "./components/ChatSessionsList";
import RagDocumentsDrawer from "./components/RagDocumentsDrawer";
import DatabaseWidgets from "./components/DatabaseWidgets";
import VoiceCallingConsole from "./components/VoiceCallingConsole";
import AudioSynthesizer from "./components/AudioSynthesizer";
import FormattedAiMessage from "./components/FormattedAiMessage";

const SPEECH_LANGUAGES = [
  { code: "en-US", name: "English (US)", flag: "🇺🇸", label: "EN" },
  { code: "ur-PK", name: "Urdu (Pakistan)", flag: "🇵🇰", label: "UR" },
  { code: "ru-RU", name: "Russian (Russia)", flag: "🇷🇺", label: "RU" },
  { code: "tr-TR", name: "Turkish (Turkey)", flag: "🇹🇷", label: "TR" },
  { code: "fil-PH", name: "Filipino (Philippines)", flag: "🇵🇭", label: "PH" },
  { code: "ar-SA", name: "Arabic (Saudi Arabia)", flag: "🇸🇦", label: "AR" },
  { code: "es-ES", name: "Spanish (Spain)", flag: "🇪🇸", label: "ES" },
  { code: "fr-FR", name: "French (France)", flag: "🇫🇷", label: "FR" },
  { code: "de-DE", name: "German (Germany)", flag: "🇩🇪", label: "DE" },
  { code: "zh-CN", name: "Chinese (Simplified)", flag: "🇨🇳", label: "ZH" },
  { code: "hi-IN", name: "Hindi (India)", flag: "🇮🇳", label: "HI" },
  { code: "en-NG", name: "English (Nigeria)", flag: "🇳🇬", label: "NG" }
];

// Urdu-to-Roman Transliteration Dictionary & Edit Distance algorithm for acoustic echo loop protection
const URDU_TO_ROMAN_DICT: Record<string, string[]> = {
  "سلام": ["salam", "slm", "shalam"],
  "میں": ["main", "mein", "me", "men", "mai"],
  "آپ": ["aap", "ap", "aapka", "aapki", "aapke"],
  "کا": ["ka"],
  "کی": ["ki"],
  "کے": ["ke", "kay"],
  "کو": ["ko"],
  "ہوں": ["hoon", "hun", "ho"],
  "ہے": ["hai", "he", "hye"],
  "ہیں": ["hain", "hein", "he"],
  "اور": ["aur", "or"],
  "اسسٹنٹ": ["assistant", "asistant"],
  "جی": ["jee", "ji"],
  "ہاں": ["haan", "han"],
  "ٹھیک": ["theek", "thik", "tk"],
  "کیا": ["kya", "kiya"],
  "کرنا": ["karna"],
  "کرنے": ["karne"],
  "بند": ["band", "bund"],
  "برو": ["bro"],
  "بھائی": ["bhai"],
  "شکریہ": ["shukriya"],
  "کرو": ["karo"],
  "اللہ": ["allah"],
  "حافظ": ["hafiz"],
  "کام": ["kaam", "kam"],
  "پراپرٹی": ["property", "properties"],
  "پراپرٹیز": ["properties", "property"],
  "میرا": ["mera"],
  "مجھے": ["mujhe", "mjhe"],
  "سن": ["sun", "soan"],
  "رہا": ["raha"],
  "رہی": ["rahi"],
  "رہے": ["rahe"],
  "تھا": ["tha"],
  "تھی": ["thi"],
  "تھے": ["the"],
  "تم": ["tum", "tm"],
  "تو": ["to", "tu"],
  "وہ": ["wo", "woh"],
  "ہم": ["hum", "hm"],
  "مجھ": ["mujh"],
  "اس": ["is", "us"],
  "ان": ["in", "un"],
  "یہ": ["yeh", "ye"],
  "سے": ["se", "say"],
  "پر": ["par", "per"],
  "تک": ["tak"],
  "نہ": ["na"],
  "نہیں": ["nahin", "nahi", "nae"]
};

const transliterateUrduToRoman = (word: string): string => {
  if (!/[\u0600-\u06FF\u0750-\u077F]/.test(word)) return word.toLowerCase();
  
  const map: Record<string, string> = {
    "ا": "a", "آ": "aa", "ب": "b", "پ": "p", "ت": "t", "ٹ": "t", "ث": "s",
    "ج": "j", "چ": "ch", "ح": "h", "خ": "kh", "د": "d", "ڈ": "d", "ذ": "z",
    "ر": "r", "ڑ": "r", "ز": "z", "ژ": "z", "س": "s", "ش": "sh", "ص": "s",
    "ض": "z", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q",
    "ک": "k", "گ": "g", "ل": "l", "م": "m", "ن": "n", "ں": "n", "و": "o",
    "ہ": "h", "ھ": "h", "ء": "", "ی": "y", "ے": "e"
  };
  let res = "";
  for (const char of word) {
    res += map[char] || char;
  }
  return res;
};

const getEditDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const isWordSimilar = (w1: string, w2: string): boolean => {
  const clean1 = w1.toLowerCase().trim();
  const clean2 = w2.toLowerCase().trim();
  if (clean1 === clean2) return true;
  if (clean1.includes(clean2) || clean2.includes(clean1)) return true;

  // Dictionary check
  const dict1 = URDU_TO_ROMAN_DICT[clean1];
  if (dict1 && dict1.includes(clean2)) return true;
  const dict2 = URDU_TO_ROMAN_DICT[clean2];
  if (dict2 && dict2.includes(clean1)) return true;

  // Phonetic transliteration comparison
  const t1 = transliterateUrduToRoman(clean1);
  const t2 = transliterateUrduToRoman(clean2);
  if (t1 === t2) return true;
  if (t1.includes(t2) || t2.includes(t1)) return true;

  const dist = getEditDistance(t1, t2);
  const maxLen = Math.max(t1.length, t2.length);
  if (maxLen <= 4) return dist <= 1;
  if (maxLen <= 7) return dist <= 2;
  return dist <= 3;
};

const extractFieldsFromCallJson = (text: string): { writtenResponse?: string; spokenResponse?: string } => {
  let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(cleanText);
    if (parsed.writtenResponse || parsed.spokenResponse) {
      return {
        writtenResponse: parsed.writtenResponse,
        spokenResponse: parsed.spokenResponse
      };
    }
  } catch (e) {}

  let jsonStart = cleanText.indexOf('{');
  let jsonEnd = cleanText.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const slice = cleanText.substring(jsonStart, jsonEnd + 1);
    try {
      const parsed = JSON.parse(slice);
      if (parsed.writtenResponse || parsed.spokenResponse) {
        return {
          writtenResponse: parsed.writtenResponse,
          spokenResponse: parsed.spokenResponse
        };
      }
    } catch (e) {}
  }

  const extractField = (key: string): string | undefined => {
    let keyIdx = cleanText.indexOf(`"${key}"`);
    if (keyIdx === -1) keyIdx = cleanText.indexOf(`'${key}'`);
    if (keyIdx === -1) keyIdx = cleanText.indexOf(key);
    if (keyIdx === -1) return undefined;

    const colonIdx = cleanText.indexOf(':', keyIdx);
    if (colonIdx === -1) return undefined;

    let startQuoteIdx = -1;
    let quoteChar = '';
    for (let i = colonIdx + 1; i < cleanText.length; i++) {
      const char = cleanText[i];
      if (char === '"' || char === "'") {
        startQuoteIdx = i;
        quoteChar = char;
        break;
      }
    }

    if (startQuoteIdx === -1) return undefined;

    let value = '';
    let escape = false;
    for (let i = startQuoteIdx + 1; i < cleanText.length; i++) {
      const char = cleanText[i];
      if (escape) {
        if (char === 'n') value += '\n';
        else if (char === 't') value += '\t';
        else value += char;
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === quoteChar) {
        return value;
      } else {
        value += char;
      }
    }
    return value;
  };

  return {
    writtenResponse: extractField('writtenResponse'),
    spokenResponse: extractField('spokenResponse')
  };
};

const summarizeForSpeech = (text: string): string => {
  if (!text) return "";

  // 1. If it's a JSON block, parse it and extract spokenResponse if present
  const containsJson = text.includes('"writtenResponse"') || text.includes('"spokenResponse"') || text.trim().startsWith("{");
  if (containsJson) {
    const extracted = extractFieldsFromCallJson(text);
    if (extracted.spokenResponse) {
      return summarizeForSpeech(extracted.spokenResponse);
    }
    if (extracted.writtenResponse) {
      text = extracted.writtenResponse;
    }
  }

  // 2. Clean formatting and markdown symbols
  let clean = text
    .replace(/```[\s\S]*?```/g, "") // remove code
    .replace(/\[?Execute\]?/gi, "")  // remove Execute buttons
    .replace(/🟢|🔍|💡|🎯|⚡|📧|📅|💰|👥|🤖|⭐|❌|✔️/g, "") // remove emojis
    .replace(/\*\*|__/g, ""); // remove bold

  // 3. Extract the "Direct Answer" section
  const sectionSplit = clean.split(/(?:\d\.\s*[A-Z\s]{4,}|[A-Z\s]{4,}\s*Layer|[A-Z\s]{4,}\s*Mode|Analytical\s*Insight|Observations|Insights|Recommendations|Execution\s*Options|Dynamic\s*Interpretation|Suggested\s*Action)/i);
  
  if (sectionSplit.length > 1) {
    clean = sectionSplit[1];
  } else {
    const fallbackSplit = clean.split(/(?:Observations|Analytical\s*Insight|Insights|Recommendations|Dynamic\s*Interpretation|Suggested\s*Action)/i);
    if (fallbackSplit.length > 0) {
      clean = fallbackSplit[0];
    }
  }

  // Clean leading headers, colons, spaces
  clean = clean
    .replace(/^(Direct\s*Answer|Direct\s*Response|Answer|Response|Assistant\s*Mode)[:\-\s\(\)]*/i, "")
    .trim();

  // Strip optional leading Assistant Mode wrapper with parentheses
  clean = clean.replace(/^\(?Assistant\s*Mode\)?[:\-\s\(\)]*/i, "").trim();

  // 4. Handle lists and summarize
  const lines = clean.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  // Find list items (lines starting with bullets)
  const listItems = lines.filter(l => /^[\s•\-*]/.test(l) || l.startsWith("•") || l.startsWith("-") || l.startsWith("*"));
  
  if (listItems.length > 0) {
    // Contains a list. Extract introductory text and first 3 names (splitting by commas)
    const intro = lines.find(l => !/^[\s•\-*]/.test(l) && !l.startsWith("•") && !l.startsWith("-") && !l.startsWith("*")) || "Here is the summary:";
    const cleanedNames = listItems.map(item => {
      const parts = item.replace(/^[\s•\-*]*\s*/, "").trim().split(",");
      return parts[0].trim();
    });
    const firstFew = cleanedNames.slice(0, 3).join(", ");
    
    if (cleanedNames.length > 3) {
      return `${intro.replace(/[:\-]$/, "")} ${firstFew}, and ${cleanedNames.length - 3} others. I have displayed the complete list on your chat screen.`;
    } else {
      return `${intro.replace(/[:\-]$/, "")} ${firstFew}.`;
    }
  }

  // If no bullet list, take the first paragraph and limit to 2 sentences
  const firstParagraph = lines[0] || "";
  if (firstParagraph.replace(/[\[\]\s]/g, "").length === 0) {
    return "I have displayed the requested database cards on your screen.";
  }

  const sentences = firstParagraph.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 2) {
    return sentences.slice(0, 2).join(" ").trim();
  }
  return firstParagraph.trim();
};

const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function AssistantPage() {
  const router = useRouter();
  const { token, user: currentUser } = useAuth();
  const [activeMobileTab, setActiveMobileTab] = useState<'chat' | 'sessions' | 'knowledge'>('chat');

  // Microphone amplitude visualizer states
  const [amplitude, setAmplitude] = useState<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Vapi Voice Integration refs and state
  const vapiInstanceRef = useRef<any>(null);
  const [vapiConfig, setVapiConfig] = useState<{ isEnabled: boolean; publicKey: string | null; assistantId: string | null } | null>(null);

  useEffect(() => {
    if (token) {
      fetch(`${getApiUrl()}/integrations/vapi/public-config`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setVapiConfig(data))
        .catch(err => console.error("Error loading Vapi public config:", err));
    }
  }, [token]);

  // Voice Input Speech Recognition States
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState("en-US");
  const recognitionRef = useRef<any>(null);

  // Zorvex Voice Live: Real-Time Spoken AI Agent States
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const [voiceAgentState, setVoiceAgentState] = useState<'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING'>('IDLE');
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>('female');
  const [voiceRate, setVoiceRate] = useState(1.0);
  const [voicePitch, setVoicePitch] = useState(1.0);
  const voiceRecognitionRef = useRef<any>(null);
  const lastAiResponseRef = useRef<string>("");

  const [activeCallPersona, setActiveCallPersona] = useState<'ORCHESTRATOR' | 'HR' | 'FINANCE' | 'PROPERTY' | 'LOGISTICS'>('ORCHESTRATOR');
  const [subtitleFeedUser, setSubtitleFeedUser] = useState("");
  const [subtitleFeedAi, setSubtitleFeedAi] = useState("");

  // Voice Mute & Active States orchestrators (Rule 1 & 6)
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(isMuted);
  const isVoiceModeActiveRef = useRef(isVoiceModeActive);
  const voiceAgentStateRef = useRef(voiceAgentState);
  
  const lastChimeTimeRef = useRef<number>(0);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isVoiceModeActiveRef.current = isVoiceModeActive;
  }, [isVoiceModeActive]);

  useEffect(() => {
    voiceAgentStateRef.current = voiceAgentState;
  }, [voiceAgentState]);

  // Pre-load Web Speech API voice dictionary on page mount to resolve production asynchronous delay
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Echo protection overlap algorithm
  const isEchoOfAiResponse = (transcript: string, aiResponse: string): boolean => {
    if (!aiResponse) return false;
    const cleanStr = (s: string) => s.toLowerCase().replace(/[^\w\s\u0600-\u06FF\u0900-\u097F]/g, "").replace(/\s+/g, " ").trim();
    const tClean = cleanStr(transcript);
    const aClean = cleanStr(aiResponse);
    if (!tClean) return true;
    if (aClean.includes(tClean) || tClean.includes(aClean)) return true;

    // Word-by-word cross-lingual overlap count
    const tWords = tClean.split(" ");
    const aWords = aClean.split(" ");
    let matchCount = 0;
    
    for (const w of tWords) {
      const matched = aWords.some(aWord => isWordSimilar(w, aWord));
      if (matched) {
        matchCount++;
      }
    }
    
    const overlapRatio = matchCount / tWords.length;
    console.log(`🤖 Echo check - Transcript: "${transcript}" | AI Response: "${aiResponse.substring(0, 30)}..." | Match Ratio: ${overlapRatio.toFixed(2)}`);
    return overlapRatio > 0.60;
  };

  const getWaveBarStyles = (index: number) => {
    const baseHeight = 8;
    if (isMuted) {
      const sinusVal = Math.sin((Date.now() / 650) + index * 0.4) * 2 + 6;
      return { 
        height: `${sinusVal}px`, 
        transition: 'height 0.3s ease-in-out', 
        opacity: 0.2 
      };
    }

    if (voiceAgentState === 'LISTENING') {
      const isSpeaking = amplitude > 5;
      
      if (isSpeaking) {
        const speed = Date.now() / 120;
        const offset = Math.sin(index * 0.6) * 3;
        const jitter = Math.sin(speed + index * 1.2) * 4 + Math.cos(Date.now() / 60 - index) * 1.5;
        const height = Math.max(baseHeight, (amplitude * 1.1) + offset + jitter);
        
        return { 
          height: `${Math.min(45, height)}px`, 
          transition: 'height 0.05s cubic-bezier(0.1, 0.8, 0.3, 1)',
          boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)',
          transform: `translateY(${Math.sin(Date.now() / 50 + index) * 0.8}px)`,
          opacity: 1
        };
      } else {
        const speed = Date.now() / 800;
        const sinusVal = Math.sin(speed + index * 0.3) * 2.5 + baseHeight + 1;
        
        return { 
          height: `${sinusVal}px`, 
          transition: 'height 0.3s ease-in-out',
          boxShadow: 'none',
          transform: 'translateY(0px)',
          opacity: 0.4
        };
      }
    }

    if (voiceAgentState === 'SPEAKING') {
      const speed = Date.now() / 150;
      const sinusVal = Math.sin(speed - index * 0.5) * 10 + 16;
      return { 
        height: `${sinusVal}px`, 
        transition: 'height 0.08s ease-in-out',
        boxShadow: '0 0 10px rgba(168, 85, 247, 0.4)',
        opacity: 0.9
      };
    }

    if (voiceAgentState === 'THINKING') {
      const speed = Date.now() / 180;
      const sinusVal = Math.sin(speed - index * 0.7) * 4 + 10;
      return { 
        height: `${sinusVal}px`, 
        transition: 'height 0.08s ease-in-out',
        boxShadow: '0 0 8px rgba(16, 185, 129, 0.35)',
        opacity: 0.75
      };
    }

    const sinusVal = Math.sin((Date.now() / 600) + index * 0.4) * 2 + 6;
    return { height: `${sinusVal}px`, opacity: 0.4 };
  };

  // Real-time mic volume tracking when active and not muted in Voice Mode
  useEffect(() => {
    const startMicTracking = async () => {
      if (!isVoiceModeActive || voiceAgentState !== 'LISTENING' || isMuted) {
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
  }, [isVoiceModeActive, voiceAgentState, isMuted]);

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

  // Web Speech API: Toggle Listening for Speech Input
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("⚠️ Your browser does not support Speech Recognition. Please try Google Chrome or Microsoft Edge!");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = speechLang;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (event.error === "not-allowed") {
        alert("🔒 Microphone access is blocked. Please enable microphone permissions in your browser settings!");
      }
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        setUserInput((prev) => {
          const spacing = prev.trim() === "" ? "" : " ";
          return prev + spacing + transcript;
        });
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // speakText: Text-to-Speech synthesizer with language auto-accent matching
  const speakText = (text: string, onEndCallback?: () => void) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    // Cancel any active speech first
    window.speechSynthesis.cancel();

    // Prepare clean text (remove markdown, emojis, HTML/JSON blocks for smoother speech)
    let cleanText = text
      .replace(/\*\*|__/g, "") // strip bold
      .replace(/#+\s+/g, "") // strip headers
      .replace(/-\s+/g, "") // strip list dashes
      .replace(/https?:\/\/[^\s]+/g, "") // strip urls
      .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "") // strip emojis
      .trim();

    if (!cleanText) {
      onEndCallback?.();
      return;
    }

    lastAiResponseRef.current = cleanText;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = voiceRate;
    utterance.pitch = voicePitch;

    // Detect if content is Urdu / Hindi / Roman Urdu
    const isUrduOrHindi = /[\u0600-\u06FF\u0750-\u077F\u0900-\u097F]/i.test(text) || 
                          /bhai|salam|shukriya|kaam|karna|karne|hai|hain|he|aur|kiya|kya|aizaz|ahmed|sarah/i.test(cleanText.toLowerCase());

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;

    if (isUrduOrHindi) {
      // Find Urdu/Hindi or Indian accented English voice
      selectedVoice = voices.find(v => v.lang.startsWith("ur") || v.lang.startsWith("hi")) ||
                      voices.find(v => v.lang.includes("IN")) ||
                      voices.find(v => v.lang.startsWith("en-GB")) ||
                      voices[0];
    } else {
      const filtered = voices.filter(v => v.lang.toLowerCase().startsWith("en"));
      if (voiceGender === "female") {
        const femaleKeywords = ["zira", "samantha", "female", "karen", "siri", "google us english", "hazel", "microsoft", "natural", "premium"];
        for (const kw of femaleKeywords) {
          selectedVoice = filtered.find(v => v.name.toLowerCase().includes(kw));
          if (selectedVoice) break;
        }
      } else {
        const maleKeywords = ["david", "male", "daniel", "google uk english", "premium", "microsoft"];
        for (const kw of maleKeywords) {
          selectedVoice = filtered.find(v => v.name.toLowerCase().includes(kw));
          if (selectedVoice) break;
        }
      }
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith("en")) || voices[0];
      }
    }

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    setVoiceAgentState("SPEAKING");

    utterance.onend = () => {
      if (voiceAgentStateRef.current === "SPEAKING") {
        setVoiceAgentState("LISTENING");
      }
      onEndCallback?.();
    };

    utterance.onerror = (e: any) => {
      if (e.error !== "interrupted" && e.error !== "canceled" && e.error !== "interrupted-by-cancel") {
        console.error("SpeechSynthesis error:", e);
      } else {
        console.warn("SpeechSynthesis interrupted by barge-in or cancel.");
      }
      if (voiceAgentStateRef.current === "SPEAKING") {
        setVoiceAgentState("LISTENING");
      }
      onEndCallback?.();
    };

    window.speechSynthesis.speak(utterance);
  };

  // Zorvex Voice Live Speech-to-Text Orchestrator Effect (Continuous single-instance loop with instant interim barge-in support)
  useEffect(() => {
    if (typeof window === "undefined" || !isVoiceModeActive) return;

    if (isMuted || voiceAgentState === "IDLE" || voiceAgentState === "THINKING") {
      if (voiceRecognitionRef.current) {
        try {
          voiceRecognitionRef.current.stop();
        } catch (e) {}
      }
      return;
    }
    
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    console.log("🎙️ Continuous Speech Recognition Service Instantiating...");
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLang;

    recognition.onstart = () => {
      console.log("🎙️ Microphone is active and continuously listening...");
    };

    recognition.onend = () => {
      // Auto-restart loop if still active, not muted, and in listening states
      if (isVoiceModeActiveRef.current && !isMutedRef.current && 
          (voiceAgentStateRef.current === "LISTENING" || voiceAgentStateRef.current === "SPEAKING")) {
        try {
          recognition.start();
        } catch (e) {
          console.warn("SpeechRecognition auto-restart failed:", e);
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "no-speech") {
        console.warn("Speech recognition error:", e.error);
      }
    };

    recognition.onresult = async (event: any) => {
      if (isMutedRef.current) return;
      if (voiceAgentStateRef.current === "THINKING" || voiceAgentStateRef.current === "IDLE") return;

      // Connection chime guard: ignore all mic inputs within 2.5s of the chime to avoid chime feedback loops
      if (Date.now() - lastChimeTimeRef.current < 2500) {
        console.log("🤫 Chime guard active: ignoring speech during dial chimes.");
        return;
      }

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (!transcript || !transcript.trim()) continue;

        if (event.results[i].isFinal) {
          console.log("🗣️ Speech Final transcript dictation:", transcript);
          
          if (/exit voice mode|goodbye|allah hafiz|band karo/i.test(transcript)) {
            handleExitVoiceMode();
            return;
          }

          // BARGE-IN INTERRUPTION logic & ECHO PROTECTION:
          if (voiceAgentStateRef.current === "SPEAKING") {
            const aiResponse = lastAiResponseRef.current || "";
            if (isEchoOfAiResponse(transcript, aiResponse) || transcript.length < 3) {
              console.log("🤫 Echo of AI response detected, ignoring final transcript...");
              continue;
            }
            console.log("🤫 User interrupted AI! Cancelling speaking...");
            if (typeof window !== "undefined" && window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
          }

          setSubtitleFeedUser(transcript);
          setVoiceAgentState("THINKING");

          try {
            const userMsgId = `user-${Date.now()}`;
            setMessages(prev => [...prev, {
              id: userMsgId,
              role: "user",
              content: transcript,
              createdAt: new Date().toISOString()
            }]);

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/chat`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                message: transcript,
                sessionId: activeSessionId || undefined,
                callPersona: "ORCHESTRATOR"
              })
            });

            if (res.ok) {
              const data = await res.json();
              
              setMessages(prev => [...prev, {
                id: `model-${Date.now()}`,
                role: "model",
                content: data.response,
                toolExecuted: data.toolExecuted,
                toolData: data.toolData,
                citations: data.citations,
                createdAt: new Date().toISOString(),
              }]);

              const spokenText = data.spokenResponse || data.response;
              const summarizedText = data.spokenResponse ? spokenText : summarizeForSpeech(spokenText);
              setSubtitleFeedAi(summarizedText);
              speakText(summarizedText);
            } else {
              speakText("Sorry, I encountered a connection issue. Please try again.");
            }
          } catch (err) {
            console.error("Voice chat error:", err);
            speakText("Connection failed. Please check your network.");
          }
        } else {
          // Interim Result: perfect for fast barge-in detection
          if (voiceAgentStateRef.current === "SPEAKING") {
            const aiResponse = lastAiResponseRef.current || "";
            if (isEchoOfAiResponse(transcript, aiResponse) || transcript.length < 3) {
              // Ignore AI's own echo
              continue;
            }
            console.log("🤫 Interim Barge-in user interruption detected:", transcript);
            if (typeof window !== "undefined" && window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
            setVoiceAgentState("LISTENING");
            setSubtitleFeedAi("Listening to you...");
          }
        }
      }
    };

    voiceRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start SpeechRecognition:", e);
    }

    return () => {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch (e) {}
    };
  }, [isVoiceModeActive, speechLang, voiceAgentState, isMuted]);

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (vapiInstanceRef.current) {
      try {
        vapiInstanceRef.current.setMuted(nextMuted);
      } catch (err) {}
    }
  };

  const handleToggleVoiceMode = async () => {
    if (isVoiceModeActive) {
      handleExitVoiceMode();
    } else {
      setIsVoiceModeActive(true);
      setVoiceAgentState("THINKING");
      setSubtitleFeedUser("Connecting to Vapi Voice Core...");
      setSubtitleFeedAi("");

      if (isListening) {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setIsListening(false);
      }

      // Check if Vapi is enabled and has credentials
      if (vapiConfig && vapiConfig.isEnabled && vapiConfig.publicKey && vapiConfig.assistantId) {
        try {
          const VapiSdk = (await import("@vapi-ai/web")).default;
          const vapi = new VapiSdk(vapiConfig.publicKey);
          vapiInstanceRef.current = vapi;

          // Wire up event listeners
          vapi.on("call-start", () => {
            console.log("Vapi Call Started");
            AudioSynthesizer.playConnectionChime();
            lastChimeTimeRef.current = Date.now();
            setVoiceAgentState("LISTENING");
            setSubtitleFeedUser("");
            setSubtitleFeedAi("Aisha is connected and ready. Speak naturally now!");
          });

          vapi.on("call-end", () => {
            console.log("Vapi Call Ended");
            setIsVoiceModeActive(false);
            setVoiceAgentState("IDLE");
            setSubtitleFeedUser("");
            setSubtitleFeedAi("");
            AudioSynthesizer.playHangupChime();
            vapiInstanceRef.current = null;
          });

          vapi.on("volume-level", (level: number) => {
            if (!isMutedRef.current) {
              setAmplitude(level * 45); // Scale volume to match visualization
            }
          });

          vapi.on("message", (msg: any) => {
            if (msg.type === "transcript") {
              if (msg.role === "assistant") {
                setSubtitleFeedAi(msg.transcript);
                setVoiceAgentState("SPEAKING");
              } else {
                setSubtitleFeedUser(msg.transcript);
                setVoiceAgentState("LISTENING");
              }
            }
          });

          vapi.on("error", (err: any) => {
            console.error("Vapi call error:", err);
            handleExitVoiceMode();
            alert("Vapi Call Error: " + (err.message || "Unknown error"));
          });

          // Start the call
          AudioSynthesizer.playDialTone();
          vapi.start(vapiConfig.assistantId);
          if (isMuted) {
            vapi.setMuted(true);
          }
        } catch (err: any) {
          console.error("Vapi initialization error:", err);
          handleExitVoiceMode();
          alert("Failed to initialize Vapi Web SDK. Falling back to local browser mode.");
        }
      } else {
        // FALLBACK TO SIMULATED SYSTEM VOICE MODE (existing local speech-synthesis agent)
        AudioSynthesizer.playDialTone();
        setTimeout(() => {
          if (isVoiceModeActiveRef.current) {
            AudioSynthesizer.playConnectionChime();
            lastChimeTimeRef.current = Date.now();
            setVoiceAgentState("LISTENING");
            setSubtitleFeedUser("");
            setSubtitleFeedAi("Zorvex Operational Intelligence System (Local Simulation) is connected and ready. Speak now!");
            speakText("Welcome! Zorvex Cognitive Core system is connected. Speak naturally now.");
          }
        }, 3500);
      }
    }
  };

  const handleExitVoiceMode = () => {
    AudioSynthesizer.playHangupChime();
    setIsVoiceModeActive(false);
    setVoiceAgentState("IDLE");
    setSubtitleFeedUser("");
    setSubtitleFeedAi("");
    
    // Stop Vapi call if active
    if (vapiInstanceRef.current) {
      try {
        vapiInstanceRef.current.stop();
      } catch (err) {}
      vapiInstanceRef.current = null;
    }

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  // Cleanups on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Data States
  const [messages, setMessages] = useState<any[]>([
    {
      id: "welcome",
      role: "model",
      content: "🤖 Salam! Main aapka Zorvex ERP Intelligent AI Assistant hoon. Main aapke corporate documents (RAG) se sawal-jawab kar sakta hoon aur live database (Properties, CRM Clients, Employees, Finances, Tasks) ko query kar sakta hoon.\n\nKuch puchna chahenge? Neeche diye gaye quick prompts try karein!",
      createdAt: new Date().toISOString(),
    }
  ]);
  const [documents, setDocuments] = useState<any[]>([]);
  
  // Session States
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  
  // Input States
  const [userInput, setUserInput] = useState("");
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedQueries, setExpandedQueries] = useState<Record<string, boolean>>({});
  
  // Document Paste note states
  const [noteName, setNoteName] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [showNoteUpload, setShowNoteUpload] = useState(false);
  
  // Roster Filters
  const [searchDocQuery, setSearchDocQuery] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch all sessions from Postgres
  const fetchSessions = async (selectFirstId?: boolean) => {
    if (!token) return;
    setIsLoadingSessions(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const sessionsData = await res.json();
        setSessions(sessionsData);
        if (selectFirstId) {
          if (sessionsData.length > 0) {
            handleSelectSession(sessionsData[0].id);
          } else {
            handleCreateNewChat();
          }
        }
      }
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Select and load specific session
  const handleSelectSession = async (sessionId: string) => {
    if (!token) return;
    setActiveSessionId(sessionId);
    setIsLoadingChat(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const sessionData = await res.json();
        if (sessionData.messages && sessionData.messages.length > 0) {
          setMessages(sessionData.messages);
        } else {
          setMessages([
            {
              id: "welcome",
              role: "model",
              content: "🤖 Salam! Main aapka Zorvex ERP Intelligent AI Assistant hoon. Main aapke corporate documents (RAG) se sawal-jawab kar sakta hoon aur live database (Properties, CRM Clients, Employees, Finances, Tasks) ko query kar sakta hoon.\n\nKuch puchna chahenge? Neeche diye gaye quick prompts try karein!",
              createdAt: new Date().toISOString(),
            }
          ]);
        }
      }
    } catch (e) {
      console.error("Failed to load session details:", e);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Create new session in database
  const handleCreateNewChat = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: "New Conversation" })
      });
      if (res.ok) {
        const newSession = await res.json();
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setMessages([
          {
            id: "welcome",
            role: "model",
            content: "🤖 Salam! Main aapka Zorvex ERP Intelligent AI Assistant hoon. Main aapke corporate documents (RAG) se sawal-jawab kar sakta hoon aur live database (Properties, CRM Clients, Employees, Finances, Tasks) ko query kar sakta hoon.\n\nKuch puchna chahenge? Neeche diye gaye quick prompts try karein!",
            createdAt: new Date().toISOString(),
          }
        ]);
      }
    } catch (e) {
      console.error("Failed to create new chat session:", e);
    }
  };

  // Delete chat session cleanly
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!token) return;
    if (!confirm("Are you sure you want to delete this conversation history?")) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          const remaining = sessions.filter(s => s.id !== sessionId);
          if (remaining.length > 0) {
            handleSelectSession(remaining[0].id);
          } else {
            handleCreateNewChat();
          }
        }
      }
    } catch (e) {
      console.error("Failed to delete chat session:", e);
    }
  };

  // Fetch all documents indexed in organization
  const fetchDocuments = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDocuments(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch documents list:", e);
    }
  };

  useEffect(() => {
    fetchSessions(true);
    fetchDocuments();
  }, [token]);

  // Handle Dynamic Prompts / Suggestion chips clicking
  const handleChipClick = (promptText: string) => {
    setUserInput(promptText);
    executeChatQuery(promptText);
  };

  // Submit Chat Message
  const executeChatQuery = async (queryText: string) => {
    if (!queryText.trim() || !token || isLoadingChat || !activeSessionId) return;

    const userMessageText = queryText;
    setUserInput(""); // Snappy input clear

    // 1. Construct user message object and optimistic model response placeholder
    const userMsg = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessageText,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoadingChat(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMessageText,
          sessionId: activeSessionId
        })
      });

      if (response.ok) {
        const data = await response.json();
        const modelMsg = {
          id: `model-${Date.now()}`,
          role: "model",
          content: data.response,
          toolExecuted: data.toolExecuted,
          toolData: data.toolData,
          citations: data.citations,
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, modelMsg]);
        fetchSessions(false); // Refresh sessions sidebar to load updated titles
      } else {
        if (response.status === 401) {
          throw new Error("SESSION_EXPIRED");
        }
        throw new Error("API Failure");
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err.message === "SESSION_EXPIRED"
        ? "🔒 Session Expired: Aapka security login session expire ho chuka hai. Please dynamic dashboard menu se LOGOUT karein aur dobara LOGIN karein taaki live database aur AI RAG features safely access ho sakein!"
        : "🤖 System Alert: Zorvex AI is currently experiencing API connection delays. Please verify your keys and network status.";
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: "model",
        content: errMsg,
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  // Handle uploading files
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/documents/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        alert(` Indexed successfully: ${data.message}`);
        fetchDocuments();
      } else {
        const errorData = await res.json();
        alert(` Upload failed: ${errorData.message || 'File processing failed'}`);
      }
    } catch (e) {
      console.error(e);
      alert(" Failed to upload file to vector service.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Upload Paste Custom Note
  const handleNoteUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || !token) return;

    setIsUploading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/documents/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: noteName,
          noteContent: noteContent
        })
      });

      if (res.ok) {
        const data = await res.json();
        alert(` Note indexed successfully: ${data.message}`);
        setNoteName("");
        setNoteContent("");
        setShowNoteUpload(false);
        fetchDocuments();
      } else {
        alert(" Failed to index quick note.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploading(false);
    }
  };

  // Delete Document Index cleanly
  const handleDeleteDocument = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete indexed database knowledge of "${name}"?`)) return;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/documents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        alert(" Knowledge deleted successfully!");
        fetchDocuments();
      } else {
        alert(" Failed to delete document index.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Quick chips definitions
  const suggestionChips = [
    { text: "Show active properties", icon: Building2 },
    { text: "Calculate total payroll expenses", icon: Wallet },
    { text: "List active tasks on board", icon: CheckSquare },
    { text: "Find CRM buyers/leads", icon: Users },
    { text: "Meri leaves check karein", icon: Palmtree },
    { text: "Logistics fleet active schedules", icon: Truck },
  ];

  // Helper to format file sizes
  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getVoiceSubStatus = () => {
    if (voiceAgentState === "LISTENING") {
      return isMuted ? "Microphone is muted" : "Speak naturally now...";
    }
    if (voiceAgentState === "SPEAKING") {
      return "AI is vocalizing response...";
    }
    if (voiceAgentState === "THINKING") {
      // Find the last user message to extract dynamic intent
      const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content || "";
      const text = lastUserMsg.toLowerCase();
      
      if (text.includes("aizaz") || text.includes("sarah") || text.includes("robert") || text.includes("john") || text.includes("agent") || text.includes("manager")) {
        // Extract capitalized name
        const match = lastUserMsg.match(/[A-Z][a-z]+/g);
        const name = match ? match.join(" ") : "Employee";
        return `🔍 Finding ${name} in Directory...`;
      }
      if (text.includes("assign") || text.includes("task") || text.includes("kaam") || text.includes("zimadari")) {
        return "✍️ Orchestrating Task Assignment...";
      }
      if (text.includes("salary") || text.includes("payroll") || text.includes("expenses") || text.includes("finance")) {
        return "📊 Auditing Payroll & Finances...";
      }
      if (text.includes("attendance") || text.includes("shift") || text.includes("check-in") || text.includes("present")) {
        return "🕒 Fetching Daily Attendance Record...";
      }
      if (text.includes("leave") || text.includes("vacation") || text.includes("chutti")) {
        return "📅 Pulling Leave Applications...";
      }
      if (text.includes("property") || text.includes("rent") || text.includes("sale") || text.includes("price")) {
        return "🏢 Querying Real Estate Listings...";
      }
      return "⚡ Thinking & Processing...";
    }
    return "Standby Mode";
  };

  return (
    <div className="min-h-screen p-8 relative z-10 overflow-hidden flex flex-col space-y-6 h-[85vh]">
      {/* Background ambient glowing */}
      <div className="absolute top-[20%] left-[20%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Page Header */}
      <div className="flex justify-between items-center animate-fade-in flex-shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <Bot className="w-8 h-8 text-primary glow-primary animate-pulse" />
            AI Chat Assistant
          </h1>
          <p className="text-muted-foreground mt-1">RAG-based conversational AI. Ask questions about your database or upload documents to query manuals in real-time.</p>
        </div>
      </div>

      {/* Mobile Tab Selector */}
      <div className="flex lg:hidden gap-1.5 p-1.5 bg-secondary/15 border border-border/40 rounded-2xl w-full flex-shrink-0">
        <button 
          onClick={() => setActiveMobileTab('sessions')}
          className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
            activeMobileTab === 'sessions' ? 'bg-primary text-white shadow-lg glow-primary' : 'text-gray-400 hover:text-white'
          }`}
        >
          Sessions
        </button>
        <button 
          onClick={() => setActiveMobileTab('chat')}
          className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
            activeMobileTab === 'chat' ? 'bg-primary text-white shadow-lg glow-primary' : 'text-gray-400 hover:text-white'
          }`}
        >
          Chat Feed
        </button>
        <button 
          onClick={() => setActiveMobileTab('knowledge')}
          className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center ${
            activeMobileTab === 'knowledge' ? 'bg-primary text-white shadow-lg glow-primary' : 'text-gray-400 hover:text-white'
          }`}
        >
          Knowledge
        </button>
      </div>

      {/* Main Split Grid layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-10 gap-6 overflow-hidden h-[70vh] animate-fade-in">
        
        <div className={`${activeMobileTab === 'sessions' ? 'block' : 'hidden'} lg:block lg:col-span-2 h-full overflow-hidden`}>
          <ChatSessionsList
            sessions={sessions}
            activeSessionId={activeSessionId}
            isLoadingSessions={isLoadingSessions}
            onCreateNewChat={handleCreateNewChat}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
          />
        </div>

          <>
            {/* MIDDLE PANEL: Chat Dialogue Feed (50%) */}
            <div className={`${activeMobileTab === 'chat' ? 'flex' : 'hidden'} lg:flex lg:col-span-5 glass rounded-3xl border border-border/60 overflow-hidden flex flex-col bg-card/10 shadow-2xl h-full`}>
              
              {/* Scrollable conversation logs */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                {messages.map((msg, index) => {
                  const isUser = msg.role === "user";
                  
                  return (
                    <div key={msg.id || index} className={`flex gap-3 max-w-[85%] animate-fade-in ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                      {/* Avatar Bubble */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                        isUser ? "bg-primary/10 border-primary/20 text-primary" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                      }`}>
                        {isUser ? <span className="font-extrabold text-sm uppercase">{currentUser?.firstName?.charAt(0) || "A"}</span> : <Bot className="w-5 h-5" />}
                      </div>

                      {/* Conversation Bubble Content */}
                      <div className="space-y-2 text-left min-w-0 flex-1 w-full">
                        {!isUser && (
                          <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Zorvex Cognitive Core</span>
                        )}

                        <div className={`p-4 rounded-2xl border text-sm leading-relaxed shadow-lg ${
                          isUser 
                            ? "bg-primary/20 border-primary/30 text-white rounded-tr-none glow-primary shadow-[0_0_15px_rgba(6,182,212,0.05)] whitespace-pre-wrap" 
                            : "bg-card border-border/50 text-gray-200 rounded-tl-none w-full"
                        }`}>
                          {isUser ? (
                            <p className="font-medium">{msg.content}</p>
                          ) : (
                            <FormattedAiMessage 
                              content={msg.content} 
                              onExecuteCommand={(cmd) => executeChatQuery(cmd)} 
                            />
                          )}

                          {/* CITATION PILLS */}
                          {msg.citations && msg.citations.length > 0 && (
                            <div className="mt-3.5 pt-2 border-t border-border/30 space-y-1">
                              <span className="block text-[8px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-1">
                                <BookOpen className="w-2.5 h-2.5 text-primary" /> Sources Referenced:
                              </span>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {Array.from(new Set(msg.citations.map((c: any) => c.documentName))).map((docName: any, idx) => (
                                  <span 
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 border border-border/60 text-[9px] text-gray-400 font-bold"
                                    title={docName}
                                  >
                                    <FileText className="w-2.5 h-2.5 text-primary" />
                                    {docName.length > 25 ? docName.substring(0, 22) + "..." : docName}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* DYNAMIC COMPONENT CARD RENDERING SECTION */}
                          {!isUser && msg.toolData && (
                            <div className="mt-3 animate-fade-in w-full overflow-x-auto scrollbar-thin">
                              <DatabaseWidgets 
                                toolExecuted={msg.toolExecuted} 
                                toolData={msg.toolData} 
                                msgId={msg.id} 
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Real-time Voice Mode Subtitles Feed */}
              {isVoiceModeActive && (subtitleFeedUser || subtitleFeedAi || voiceAgentState === 'THINKING') && (
                <div className="mx-6 mb-3 p-3.5 rounded-2xl border border-border/30 bg-slate-950/90 flex flex-col gap-2 shadow-2xl animate-fade-in text-left">
                  {subtitleFeedUser && (
                    <div className="flex gap-2.5 items-start text-xs">
                      <span className="text-[8px] font-black uppercase bg-slate-800 text-white px-2 py-0.5 rounded-md border border-white/5 flex-shrink-0 mt-0.5 select-none">YOU</span>
                      <p className="font-semibold text-gray-300 leading-relaxed">{subtitleFeedUser}</p>
                    </div>
                  )}
                  {subtitleFeedAi && (
                    <div className="flex gap-2.5 items-start text-xs border-t border-border/35 pt-2">
                      <span className="text-[8px] font-black uppercase bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-md border border-cyan-500/30 flex-shrink-0 mt-0.5 select-none">AI</span>
                      <p className="font-semibold text-cyan-300 leading-relaxed drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">{subtitleFeedAi}</p>
                    </div>
                  )}
                  {voiceAgentState === 'THINKING' && (
                    <div className="flex gap-2.5 items-center text-xs border-t border-border/35 pt-2 text-emerald-400">
                      <span className="text-[8px] font-black uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30 flex-shrink-0 select-none animate-pulse">THINKING</span>
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        <span className="font-semibold text-emerald-400/90">{getVoiceSubStatus() || "Running database analytics..."}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scrolling Loading Indicator */}
              {isLoadingChat && (
                <div className="p-4 flex items-center justify-start gap-2.5 pl-6 border-t border-border/30 bg-secondary/5 text-xs text-muted-foreground select-none">
                  <Loader2 className="w-4 h-4 animate-spin text-primary glow-primary" />
                  <span>AI calculations in progress...</span>
                </div>
              )}

              {/* Quick Prompts Chips Feed */}
              <div className="p-3 border-t border-border/30 bg-secondary/15 flex items-center gap-2 overflow-x-auto scrollbar-none flex-shrink-0">
                <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider flex items-center gap-1 whitespace-nowrap pl-2">
                  <Sparkles className="w-3 h-3 text-primary animate-pulse" /> Try Quick Chip:
                </span>
                {suggestionChips.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => handleChipClick(chip.text)}
                    disabled={isLoadingChat}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 hover:bg-primary/10 border border-border/60 hover:border-primary/30 rounded-xl text-[10px] text-gray-300 hover:text-white transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <chip.icon className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary" />
                    {chip.text}
                  </button>
                ))}
              </div>

              {/* Form input bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isVoiceModeActive) return;
                  executeChatQuery(userInput);
                }}
                className="p-4 border-t border-border/40 bg-secondary/20 flex gap-3.5 items-center flex-shrink-0 relative overflow-hidden"
              >
                {isVoiceModeActive ? (
                  <>
                    {/* Mute Mic Button */}
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      className={`p-3.5 rounded-2xl border transition-all duration-300 active:scale-95 cursor-pointer flex items-center justify-center ${
                        isMuted 
                          ? "bg-red-500/20 border-red-500/60 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse" 
                          : "bg-secondary/40 border-border/60 text-gray-400 hover:text-white"
                      }`}
                      title={isMuted ? "Unmute Mic" : "Mute Mic"}
                    >
                      {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
     
                    {/* Dynamic Waveform Visualizer - Slower and smooth oscillations */}
                    <div className="flex-1 flex items-center justify-center gap-1.5 h-12 overflow-hidden px-4">
                      {voiceAgentState === 'THINKING' ? (
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 animate-pulse">
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                          <span>{getVoiceSubStatus()}</span>
                        </div>
                      ) : (
                        [...Array(10)].map((_, i) => {
                          const barStyle = getWaveBarStyles(i);
                          const colorClass = isMuted ? "bg-red-500/30" :
                            voiceAgentState === 'LISTENING' ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" :
                            (voiceAgentState as any) === 'THINKING' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
                            voiceAgentState === 'SPEAKING' ? "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" : "bg-cyan-500/40";
                          return (
                            <div 
                              key={i} 
                              className={`w-2 rounded-full ${colorClass} transition-all duration-[40ms]`} 
                              style={barStyle} 
                            />
                          );
                        })
                      )}
                    </div>
     
                    {/* Call End / Disconnect Button (X layout) */}
                    <button
                      type="button"
                      onClick={handleExitVoiceMode}
                      className="bg-red-600 hover:bg-red-500 border border-red-500/30 text-white p-3.5 rounded-2xl shadow-[0_0_15px_rgba(220,38,38,0.3)] flex items-center justify-center flex-shrink-0 transition-all duration-300 active:scale-95 cursor-pointer"
                      title="End Call"
                    >
                      <X className="w-5 h-5 animate-pulse" />
                    </button>
                  </>
                ) : (
                  <>
                    {/* Language Switcher Dropdown */}
                    <select
                      disabled={isLoadingChat || isListening}
                      value={speechLang}
                      onChange={(e) => setSpeechLang(e.target.value)}
                      className="px-2 py-2.5 bg-secondary/60 hover:bg-secondary border border-border/60 rounded-xl text-[10px] font-bold text-gray-200 outline-none transition-all cursor-pointer disabled:opacity-50 flex-shrink-0 appearance-none text-center"
                      style={{ minWidth: "75px" }}
                      title="Select Speech Input Language"
                    >
                      {SPEECH_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code} className="bg-card text-gray-200">
                          {lang.flag} {lang.label}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      required
                      disabled={isLoadingChat}
                      placeholder={
                        isListening
                          ? `Listening in ${
                              SPEECH_LANGUAGES.find((l) => l.code === speechLang)?.name || "selected language"
                            }... Speak now!`
                          : "Ask documents (RAG) or query live ERP Postgres tables..."
                      }
                      className="flex-1 glass-input pl-4.5 pr-4.5 py-3.5 rounded-2xl text-xs bg-secondary border border-border/60 outline-none text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground/45"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                    />

                    {/* Zorvex Voice Live Toggle Button */}
                    <button
                      type="button"
                      disabled={isLoadingChat}
                      onClick={handleToggleVoiceMode}
                      className="p-3.5 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-all duration-300 active:scale-95 cursor-pointer bg-secondary/40 border-border/60 text-gray-400 hover:text-white hover:border-border/80"
                      title="Zorvex Voice Live Mode"
                    >
                      <Volume2 className="w-5 h-5 text-gray-400 hover:text-primary" />
                    </button>

                    {/* Mic dictation button */}
                    <button
                      type="button"
                      disabled={isLoadingChat}
                      onClick={toggleListening}
                      className={`p-3.5 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-all active:scale-95 cursor-pointer ${
                        isListening
                          ? "bg-red-500/20 border-red-500/80 text-red-400 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.25)]"
                          : "bg-secondary/40 border-border/60 text-gray-400 hover:text-white"
                      }`}
                      title={isListening ? "Stop dictation" : "Voice dictation"}
                    >
                      {isListening ? <X className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>

                    <button
                      type="submit"
                      disabled={isLoadingChat || !userInput.trim()}
                      className="bg-primary hover:bg-primary/95 text-white p-3.5 rounded-2xl glow-primary flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 disabled:opacity-50 disabled:scale-100 cursor-pointer"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </>
                )}
              </form>

            </div>

            {/* RIGHT SIDEBAR: Document Vault Manager (30%) */}
            <div className={`${activeMobileTab === 'knowledge' ? 'flex' : 'hidden'} lg:flex lg:col-span-3 flex-col gap-6 h-full overflow-hidden`}>
              
              {/* Drag & Drop Vector Upload Cabinet */}
              <div className="glass rounded-3xl border border-border/60 p-4 bg-card/25 text-center flex flex-col justify-between items-center gap-4 relative overflow-hidden flex-shrink-0">
                {isUploading && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest">Generating Embeddings...</span>
                  </div>
                )}
                
                <div className="space-y-1.5 text-left w-full border-b border-border/30 pb-2 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                      <UploadCloud className="w-4 h-4 text-primary" /> Vector Upload Zone
                    </h3>
                    <p className="text-[9px] text-muted-foreground">Upload and index unstructured files inside RAG pipeline.</p>
                  </div>
                  <button 
                    onClick={() => setShowNoteUpload(!showNoteUpload)}
                    className="text-[9px] font-black uppercase border border-border px-2 py-0.5 rounded bg-secondary/50 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showNoteUpload ? "File Upload" : "Paste Note"}
                  </button>
                </div>

                {/* Ingest paste note layout */}
                {showNoteUpload ? (
                  <form onSubmit={handleNoteUpload} className="w-full flex flex-col gap-2.5 text-left">
                    <input 
                      type="text"
                      placeholder="Note Title (e.g. DHA Policy Changes)"
                      className="glass-input text-[11px] px-2.5 py-1.5 rounded-lg border border-border/80 w-full outline-none bg-secondary/40"
                      value={noteName}
                      onChange={(e) => setNoteName(e.target.value)}
                    />
                    <textarea 
                      required
                      placeholder="Paste manual note or list specifications here..."
                      className="glass-input text-[11px] px-2.5 py-1.5 rounded-lg border border-border/80 w-full h-24 outline-none resize-none bg-secondary/40"
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary/95 text-white py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider glow-primary transition-transform active:scale-95 cursor-pointer"
                    >
                      Index Text Note
                    </button>
                  </form>
                ) : (
                  /* PDF/TXT standard file picker */
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-border/60 hover:border-primary/50 bg-secondary/10 hover:bg-primary/5 rounded-2xl p-6 transition-all cursor-pointer flex flex-col items-center gap-2 group"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      className="hidden" 
                      accept=".pdf,.txt" 
                      onChange={handleFileUpload}
                    />
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-5 h-5 glow-primary" />
                    </div>
                    <div className="space-y-0.5">
                      <span className="block text-[10px] font-black text-white uppercase group-hover:text-primary transition-colors">Select PDF or TXT</span>
                      <span className="block text-[8px] text-gray-500">Maximum size limit is 10 MB.</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Knowledge Base Logs Cabinet */}
              <div className="glass rounded-3xl border border-border/60 p-4 bg-card/25 flex-1 flex flex-col overflow-hidden text-left shadow-xl">
                
                <div className="flex-shrink-0 border-b border-border/30 pb-3 flex justify-between items-center">
                  <div>
                    <h3 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-primary" /> Knowledge Base ({documents.length})
                    </h3>
                    <p className="text-[9px] text-muted-foreground">Indexed sources queried by Chat Assistant.</p>
                  </div>
                  <button 
                    onClick={fetchDocuments}
                    className="p-1 text-gray-500 hover:text-white transition-colors cursor-pointer"
                    title="Sync Indices"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Roster Search Bar */}
                <div className="flex-shrink-0 mt-3 mb-2 flex items-center gap-2 bg-secondary/30 border border-border/60 rounded-xl px-2.5 py-1">
                  <Search className="w-3.5 h-3.5 text-muted-foreground" />
                  <input 
                    type="text"
                    placeholder="Search indexed files..."
                    className="w-full bg-transparent border-0 outline-none focus:ring-0 text-[10px] text-white py-1"
                    value={searchDocQuery}
                    onChange={(e) => setSearchDocQuery(e.target.value)}
                  />
                </div>

                {/* Documents List */}
                <div className="flex-1 overflow-y-auto space-y-2 mt-2 scrollbar-thin">
                  {documents.filter((d: any) => d.name.toLowerCase().includes(searchDocQuery.toLowerCase())).length === 0 ? (
                    <p className="text-[10px] text-center text-muted-foreground italic py-10">No indexed document logs found.</p>
                  ) : (
                    documents
                      .filter((d: any) => d.name.toLowerCase().includes(searchDocQuery.toLowerCase()))
                      .map((doc: any) => (
                        <div key={doc.id} className="p-2.5 rounded-2xl border border-border/30 bg-secondary/15 hover:bg-secondary/35 flex justify-between items-center gap-2 group transition-all">
                          <div className="overflow-hidden space-y-0.5 flex-1">
                            <p className="text-[10px] font-black text-white truncate flex items-center gap-1">
                              <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                              {doc.name}
                            </p>
                            <div className="flex items-center gap-1.5 text-[8px] font-black uppercase text-gray-500">
                              <span>{doc.fileType}</span>
                              <span>•</span>
                              <span>{formatBytes(doc.fileSize)}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteDocument(doc.id, doc.name)}
                            className="text-muted-foreground hover:text-red-400 p-1 rounded-md hover:bg-red-500/10 cursor-pointer flex-shrink-0"
                            title="Delete index chunks"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                  )}
                </div>

              </div>

            </div>
          </>
      </div>

      {/* Zorvex VOICE LIVE SYSTEM OVERLAY */}
      {false && (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-center justify-center animate-fade-in transition-all">
          <div className="w-88 p-6 rounded-3xl glass border border-primary/20 bg-card/95 flex flex-col items-center text-center shadow-[0_10px_60px_rgba(0,0,0,0.55)] relative overflow-hidden backdrop-blur-2xl">
            {/* Background glowing gradients */}
            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-primary/25 blur-[60px] pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-secondary/25 blur-[60px] pointer-events-none" />

            {/* Glowing top line indicator */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-purple-500 to-secondary animate-pulse" />

            {/* Close / Hang up Button */}
            <button 
              onClick={handleExitVoiceMode}
              className="absolute top-4 right-4 text-red-400 hover:text-white transition-all p-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 cursor-pointer flex items-center justify-center"
              title="Hang up Call"
            >
              <X className="w-4 h-4 animate-pulse" />
            </button>

            {/* Header branding */}
            <div className="space-y-1.5 mt-2">
              <span className="text-[9px] font-black uppercase text-primary tracking-widest animate-pulse">Zorvex Voice Live 2.0</span>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                Zorvex Cognitive Call Room
              </h3>
            </div>

            {/* Dialed Agent Display */}
            <div className="w-full mt-4 p-3 rounded-2xl bg-secondary/35 border border-border/20 flex flex-col items-center">
              <span className="text-[8px] font-black uppercase text-gray-500 tracking-widest">Active Line</span>
              <span className="text-xs font-black text-white mt-1 uppercase flex items-center gap-1.5">
                {activeCallPersona === 'ORCHESTRATOR' && '📞 General Orchestrator (Core)'}
                {activeCallPersona === 'HR' && '👥 Human Resources (HR AI Officer)'}
                {activeCallPersona === 'FINANCE' && '💼 Finance & Payroll (Auditor AI)'}
                {activeCallPersona === 'PROPERTY' && '🏢 Property Listings (Assets AI)'}
                {activeCallPersona === 'LOGISTICS' && '🚚 Logistics Fleet (Transit AI)'}
              </span>
              <span className="text-[9px] text-primary font-bold mt-0.5 tracking-wider animate-pulse">CONNECTED</span>
            </div>

            {/* Main Control Panel */}
            <div className="flex items-center gap-6 mt-6 relative justify-center">
              {/* Mute/Unmute Mic Button */}
              <button
                onClick={handleToggleMute}
                className={`p-3.5 rounded-full border transition-all duration-300 active:scale-95 cursor-pointer ${
                  isMuted 
                    ? "bg-red-500/20 border-red-500/60 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse" 
                    : "bg-secondary/35 border-border/20 text-gray-400 hover:text-white hover:border-border/40"
                }`}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isMuted ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
              </button>

              {/* Main Glowing Orb */}
              <div 
                onClick={() => {
                  if (voiceAgentState === "SPEAKING") {
                    if (typeof window !== "undefined" && window.speechSynthesis) {
                      window.speechSynthesis.cancel();
                    }
                    setVoiceAgentState("LISTENING");
                  }
                }}
                className={`w-28 h-28 rounded-full flex flex-col items-center justify-center relative cursor-pointer group transition-all duration-500 ${
                  isMuted
                    ? "bg-red-500/10 border-2 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
                    : voiceAgentState === 'LISTENING' 
                    ? "bg-primary/20 border-2 border-primary animate-pulse shadow-[0_0_40px_rgba(var(--color-primary),0.5)]" 
                    : voiceAgentState === 'THINKING'
                    ? "bg-emerald-500/20 border-2 border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.5)]"
                    : voiceAgentState === 'SPEAKING'
                    ? "bg-purple-500/20 border-2 border-purple-500 animate-pulse shadow-[0_0_40px_rgba(168,85,247,0.5)]"
                    : "bg-secondary/40 border-2 border-border"
                }`}
              >
                <div className="absolute inset-2 rounded-full border border-white/5 bg-black/35 flex items-center justify-center">
                  {isMuted ? (
                    <MicOff className="w-7 h-7 text-red-400 glow-red animate-pulse" />
                  ) : voiceAgentState === 'THINKING' ? (
                    <Loader2 className="w-7 h-7 text-emerald-400 animate-spin glow-emerald" />
                  ) : voiceAgentState === 'SPEAKING' ? (
                    <Volume2 className="w-7 h-7 text-purple-400 glow-purple animate-bounce" />
                  ) : (
                    <Mic className={`w-7 h-7 text-primary glow-primary ${voiceAgentState === 'LISTENING' ? "scale-110" : ""}`} />
                  )}
                </div>
                
                {voiceAgentState === 'SPEAKING' && !isMuted && (
                  <span className="absolute -bottom-6 text-[8px] font-bold text-purple-400 uppercase tracking-widest animate-pulse">Tap to Interrupt</span>
                )}
              </div>

              {/* Force Recut / Restart State Button */}
              <button
                onClick={() => {
                  if (typeof window !== "undefined" && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                  setVoiceAgentState("LISTENING");
                }}
                className="p-3.5 rounded-full border bg-secondary/35 border-border/20 text-gray-400 hover:text-white hover:border-border/40 transition-all duration-300 active:scale-95 cursor-pointer"
                title="Restart Listening State"
              >
                <RefreshCw className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Subtitles & Spoken Captions Feed */}
            <div className="w-full mt-6 p-4 rounded-2xl border border-border/20 bg-black/30 text-left space-y-3 relative overflow-hidden backdrop-blur-sm">
              <span className="absolute top-2 right-3 text-[7px] font-black uppercase text-gray-600 tracking-widest">Subtitle Feed</span>
              
              <div className="space-y-2 mt-1 min-h-16 max-h-24 overflow-y-auto scrollbar-thin">
                {subtitleFeedUser && (
                  <div className="flex gap-1.5 items-start">
                    <span className="text-[9px] font-black uppercase bg-secondary/50 text-white px-1.5 py-0.5 rounded border border-border/20 flex-shrink-0 mt-0.5">YOU</span>
                    <p className="text-[10px] font-medium text-gray-300 leading-normal">{subtitleFeedUser}</p>
                  </div>
                )}
                
                {subtitleFeedAi && (
                  <div className="flex gap-1.5 items-start">
                    <span className="text-[9px] font-black uppercase bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/20 flex-shrink-0 mt-0.5">AI</span>
                    <p className="text-[10px] font-bold text-primary-light glow-primary leading-normal">{subtitleFeedAi}</p>
                  </div>
                )}

                {!subtitleFeedUser && !subtitleFeedAi && (
                  <p className="text-[10px] text-gray-500 italic text-center py-4">Silence detected. Speak to talk with Zorvex AI...</p>
                )}
              </div>
            </div>

            {/* Dynamic Status Display */}
            <div className="mt-5 space-y-1 w-full">
              <h4 className={`text-sm font-extrabold tracking-wider ${
                isMuted ? "text-red-400 glow-red" :
                voiceAgentState === 'LISTENING' ? "text-primary glow-primary animate-pulse" :
                voiceAgentState === 'THINKING' ? "text-emerald-400 glow-emerald animate-pulse" :
                voiceAgentState === 'SPEAKING' ? "text-purple-400 glow-purple" : "text-gray-400"
              }`}>
                {isMuted ? "🔇 MUTED" :
                 voiceAgentState === 'LISTENING' ? "🎙️ LISTENING..." :
                 voiceAgentState === 'THINKING' ? "⚡ ROUTING..." :
                 voiceAgentState === 'SPEAKING' ? "🔊 VOCALIZING..." : "💤 IDLE"}
              </h4>
              <p className="text-[9px] font-semibold text-muted-foreground/60 transition-all">
                {getVoiceSubStatus()}
              </p>
            </div>

            {/* Bouncing Audio Visualizer */}
            {(voiceAgentState === 'LISTENING' || voiceAgentState === 'SPEAKING') && (
              <div className="flex items-center gap-1.5 justify-center h-8 mt-4 overflow-hidden">
                <style>{`
                  @keyframes bounce-bar {
                    0%, 100% { transform: scaleY(0.25); }
                    50% { transform: scaleY(1.0); }
                  }
                  .animate-bounce-bar {
                    animation: bounce-bar 0.9s ease-in-out infinite;
                    transform-origin: center;
                  }
                `}</style>
                {[
                  { delay: '0.1s', h: 'h-4' },
                  { delay: '0.3s', h: 'h-6' },
                  { delay: '0.5s', h: 'h-8' },
                  { delay: '0.2s', h: 'h-5' },
                  { delay: '0.4s', h: 'h-4' }
                ].map((bar, i) => (
                  <div 
                    key={i} 
                    className={`w-1 rounded-full animate-bounce-bar ${
                      voiceAgentState === 'LISTENING' ? "bg-primary glow-primary" : "bg-purple-500 glow-purple"
                    }`} 
                    style={{ animationDelay: bar.delay }} 
                  />
                ))}
              </div>
            )}

            {/* Department Dialer Roster */}
            <div className="w-full border-t border-border/25 mt-6 pt-5 space-y-3 text-left">
              <span className="block text-[8px] font-black uppercase text-gray-500 tracking-widest">AI Department Line Dialer</span>
              
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'ORCHESTRATOR', label: 'Core AI', emoji: '🎙️', desc: 'Central Brain' },
                  { id: 'HR', label: 'HR Officer', emoji: '👥', desc: 'Staff Reviews' },
                  { id: 'FINANCE', label: 'Finance', emoji: '💼', desc: 'Payroll Accounts' },
                  { id: 'PROPERTY', label: 'Listings', emoji: '🏢', desc: 'Assets & Sales' },
                  { id: 'LOGISTICS', label: 'Logistics', emoji: '🚚', desc: 'Fleet Schedules' }
                ].map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      if (activeCallPersona === agent.id) return;
                      AudioSynthesizer.playConnectionChime();
                      setActiveCallPersona(agent.id as any);
                      
                      // Restart session for the new agent persona
                      setVoiceAgentState("THINKING");
                      setSubtitleFeedUser(`Routing call to ${agent.label}...`);
                      setSubtitleFeedAi("");
                      
                      setTimeout(() => {
                        setVoiceAgentState("LISTENING");
                        const greeting = `Direct call line established with Zorvex ${agent.label} Agent. How can I help you?`;
                        setSubtitleFeedAi(greeting);
                        speakText(greeting);
                      }, 2000);
                    }}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer flex flex-col transition-all active:scale-95 ${
                      activeCallPersona === agent.id 
                        ? "bg-primary/20 border-primary/50 text-white shadow-[0_0_10px_rgba(var(--color-primary),0.3)]" 
                        : "bg-secondary/20 border-border/30 text-gray-400 hover:text-white hover:border-border/60"
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase flex items-center gap-1">
                      <span>{agent.emoji}</span>
                      <span>{agent.label}</span>
                    </span>
                    <span className="text-[7px] text-gray-500 font-semibold truncate mt-0.5">{agent.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Customizer Slider Settings */}
            <div className="w-full border-t border-border/25 mt-5 pt-4 space-y-4 text-left">
              <span className="block text-[8px] font-black uppercase text-gray-500 tracking-widest">Audio Controls & Accent Desk</span>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[9px] font-extrabold text-gray-400 uppercase">Voice Gender</label>
                  <select 
                    value={voiceGender}
                    onChange={(e) => setVoiceGender(e.target.value as any)}
                    className="p-2.5 rounded-xl border border-border/40 bg-secondary/35 text-[10px] text-gray-200 outline-none cursor-pointer focus:ring-1 focus:ring-primary"
                  >
                    <option value="female">👤 Female Narrator</option>
                    <option value="male">👤 Male Narrator</option>
                  </select>
                </div>

                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[9px] font-extrabold text-gray-400 uppercase">Speaking Speed</label>
                  <select 
                    value={voiceRate}
                    onChange={(e) => setVoiceRate(parseFloat(e.target.value))}
                    className="p-2.5 rounded-xl border border-border/40 bg-secondary/35 text-[10px] text-gray-200 outline-none cursor-pointer focus:ring-1 focus:ring-primary"
                  >
                    <option value="0.8">🐢 Slow (0.8x)</option>
                    <option value="1.0">👤 Standard (1.0x)</option>
                    <option value="1.15">🚀 Fast (1.15x)</option>
                    <option value="1.3">⚡ High-Speed (1.3x)</option>
                  </select>
                </div>
              </div>

              {/* Language Selection */}
              <div className="space-y-1.5 flex flex-col">
                <label className="text-[9px] font-extrabold text-gray-400 uppercase">STT Speech Language & TTS Accent</label>
                <select 
                  value={speechLang}
                  onChange={(e) => setSpeechLang(e.target.value)}
                  className="p-2.5 rounded-xl border border-border/40 bg-secondary/35 text-[10px] text-gray-200 outline-none cursor-pointer focus:ring-1 focus:ring-primary w-full"
                >
                  {SPEECH_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-secondary/15 rounded-xl border border-border/20 text-center mt-3">
                <p className="text-[9px] text-gray-500 leading-relaxed font-medium">
                  💡 Speak naturally to check dashboards, create tasks, or query profiles.<br />
                  Say <b className="text-gray-300">"Exit voice mode"</b> or click the red hang-up button to close.
                </p>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
