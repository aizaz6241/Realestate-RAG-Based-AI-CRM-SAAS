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

export default function AssistantPage() {
  const router = useRouter();
  const { token, user: currentUser } = useAuth();

  // Voice Input Speech Recognition States
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState("en-US");
  const recognitionRef = useRef<any>(null);

  // RENS Voice Live: Real-Time Spoken AI Agent States
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
      setVoiceAgentState("LISTENING");
      onEndCallback?.();
    };

    utterance.onerror = (e: any) => {
      if (e.error !== "interrupted" && e.error !== "canceled" && e.error !== "interrupted-by-cancel") {
        console.error("SpeechSynthesis error:", e);
      } else {
        console.warn("SpeechSynthesis interrupted by barge-in or cancel.");
      }
      setVoiceAgentState("LISTENING");
      onEndCallback?.();
    };

    window.speechSynthesis.speak(utterance);
  };

  // RENS Voice Live Speech-to-Text Orchestrator Effect (Continuous single-instance loop with instant interim barge-in support)
  useEffect(() => {
    if (typeof window === "undefined" || !isVoiceModeActive) return;
    
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
      // Auto-restart loop if still active, regardless of state, to keep mic hot and reduce cold-start delay
      if (isVoiceModeActiveRef.current) {
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
      if (voiceAgentStateRef.current === "THINKING") return;

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (!transcript || !transcript.trim()) continue;

        if (event.results[i].isFinal) {
          console.log("🗣️ Speech Final transcript dictation:", transcript);
          
          if (/exit voice mode|goodbye|allah hafiz|band karo/i.test(transcript)) {
            handleExitVoiceMode();
            return;
          }

          // BARGE-IN INTERRUPTION logic (if user keeps speaking after final capture):
          if (voiceAgentStateRef.current === "SPEAKING") {
            const cleanAiResponse = lastAiResponseRef.current?.toLowerCase() || "";
            if (cleanAiResponse.includes(transcript.toLowerCase()) || transcript.length < 3) {
              console.log("🤫 Echo of AI response detected, ignoring final barge-in...");
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
              setSubtitleFeedAi(spokenText);
              speakText(spokenText);
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
            const cleanAiResponse = lastAiResponseRef.current?.toLowerCase() || "";
            if (cleanAiResponse.includes(transcript.toLowerCase()) || transcript.length < 3) {
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
  }, [isVoiceModeActive, speechLang]);

  const handleToggleVoiceMode = () => {
    if (isVoiceModeActive) {
      handleExitVoiceMode();
    } else {
      setIsVoiceModeActive(true);
      setVoiceAgentState("THINKING");
      setSubtitleFeedUser("RENS Core Calling Desk... Dialing...");
      setSubtitleFeedAi("");
      AudioSynthesizer.playDialTone();

      if (isListening) {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setIsListening(false);
      }

      setTimeout(() => {
        if (isVoiceModeActiveRef.current) {
          AudioSynthesizer.playConnectionChime();
          setVoiceAgentState("LISTENING");
          setSubtitleFeedUser("");
          setSubtitleFeedAi("RENS Operational Intelligence System is connected and ready. Speak now!");
          speakText("Welcome! RENS Cognitive Core system is connected. Speak naturally now.");
        }
      }, 3500);
    }
  };

  const handleExitVoiceMode = () => {
    AudioSynthesizer.playHangupChime();
    setIsVoiceModeActive(false);
    setVoiceAgentState("IDLE");
    setSubtitleFeedUser("");
    setSubtitleFeedAi("");
    
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
      content: "🤖 Salam! Main aapka RENS ERP Intelligent AI Assistant hoon. Main aapke corporate documents (RAG) se sawal-jawab kar sakta hoon aur live database (Properties, CRM Clients, Employees, Finances, Tasks) ko query kar sakta hoon.\n\nKuch puchna chahenge? Neeche diye gaye quick prompts try karein!",
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
              content: "🤖 Salam! Main aapka RENS ERP Intelligent AI Assistant hoon. Main aapke corporate documents (RAG) se sawal-jawab kar sakta hoon aur live database (Properties, CRM Clients, Employees, Finances, Tasks) ko query kar sakta hoon.\n\nKuch puchna chahenge? Neeche diye gaye quick prompts try karein!",
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
            content: "🤖 Salam! Main aapka RENS ERP Intelligent AI Assistant hoon. Main aapke corporate documents (RAG) se sawal-jawab kar sakta hoon aur live database (Properties, CRM Clients, Employees, Finances, Tasks) ko query kar sakta hoon.\n\nKuch puchna chahenge? Neeche diye gaye quick prompts try karein!",
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
        : "🤖 System Alert: RENS AI is currently experiencing API connection delays. Please verify your keys and network status.";
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

      {/* Main Split Grid layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-10 gap-6 overflow-hidden h-[70vh] animate-fade-in">
        
        <ChatSessionsList
          sessions={sessions}
          activeSessionId={activeSessionId}
          isLoadingSessions={isLoadingSessions}
          onCreateNewChat={handleCreateNewChat}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
        />

        {isVoiceModeActive ? (
          <VoiceCallingConsole
            isMuted={isMuted}
            onToggleMute={() => setIsMuted(prev => !prev)}
            voiceAgentState={voiceAgentState}
            onExitVoiceMode={handleExitVoiceMode}
            onResetListening={() => {
              if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
              setVoiceAgentState("LISTENING");
            }}
            subtitleFeedUser={subtitleFeedUser}
            subtitleFeedAi={subtitleFeedAi}
            activeCallPersona={activeCallPersona}
            voiceGender={voiceGender}
            onVoiceGenderChange={setVoiceGender}
            voiceRate={voiceRate}
            onVoiceRateChange={setVoiceRate}
            voicePitch={voicePitch}
            onVoicePitchChange={setVoicePitch}
          />
        ) : (
          <>
            {/* MIDDLE PANEL: Chat Dialogue Feed (50%) */}
            <div className="lg:col-span-5 glass rounded-3xl border border-border/60 overflow-hidden flex flex-col bg-card/10 shadow-2xl h-full">
          
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
                  <div className="space-y-2 text-left">
                    {!isUser && (
                      <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">RENS Cognitive Core</span>
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
                        <div className="mt-3 animate-fade-in w-full overflow-hidden">
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
              executeChatQuery(userInput);
            }}
            className="p-4 border-t border-border/40 bg-secondary/20 flex gap-3.5 items-center flex-shrink-0"
          >
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

            {/* RENS Voice Live Toggle Button */}
            <button
              type="button"
              disabled={isLoadingChat}
              onClick={handleToggleVoiceMode}
              className={`p-3.5 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-all duration-300 active:scale-95 cursor-pointer bg-gradient-to-br hover:border-primary/50 ${
                isVoiceModeActive
                  ? "from-primary to-secondary border-primary/80 text-white animate-pulse shadow-[0_0_20px_rgba(var(--color-primary),0.6)]"
                  : "bg-secondary/40 border-border/60 text-gray-400 hover:text-white hover:border-border/80"
              }`}
              title="RENS Voice Live Mode"
            >
              <Volume2 className={`w-5 h-5 ${isVoiceModeActive ? "animate-bounce" : ""}`} />
            </button>

            {/* Microphone Button */}
            <button
              type="button"
              disabled={isLoadingChat}
              onClick={toggleListening}
              className={`p-3.5 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-all duration-300 active:scale-95 cursor-pointer ${
                isListening
                  ? "bg-red-500/20 border-red-500/60 text-red-400 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                  : "bg-secondary/40 border-border/60 text-gray-400 hover:text-white hover:border-border/80"
              }`}
              title={isListening ? "Stop listening" : "Start voice input"}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              type="submit"
              disabled={isLoadingChat || !userInput.trim()}
              className="bg-primary hover:bg-primary/95 text-white p-3.5 rounded-2xl glow-primary flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 disabled:opacity-50 disabled:scale-100 cursor-pointer"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>

        </div>

        {/* RIGHT SIDEBAR: Document Vault Manager (30%) */}
        <div className="lg:col-span-3 flex flex-col gap-6 h-full overflow-hidden">
          
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
    )}

      </div>

      {/* RENS VOICE LIVE SYSTEM OVERLAY */}
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
              <span className="text-[9px] font-black uppercase text-primary tracking-widest animate-pulse">RENS Voice Live 2.0</span>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 justify-center">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                RENS Cognitive Call Room
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
                onClick={() => setIsMuted(prev => !prev)}
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
                  <p className="text-[10px] text-gray-500 italic text-center py-4">Silence detected. Speak to talk with RENS AI...</p>
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
                        const greeting = `Direct call line established with RENS ${agent.label} Agent. How can I help you?`;
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
