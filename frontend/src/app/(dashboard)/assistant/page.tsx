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
  User
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

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

    utterance.onerror = (e) => {
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

  // RENS Voice Live Speech-to-Text Orchestrator Effect (Rule 1 & 6 - continuous auto-listen loop with barge-in support)
  useEffect(() => {
    if (typeof window === "undefined" || !isVoiceModeActive) return;
    
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    let recognition: any = null;

    if ((voiceAgentState === "LISTENING" || voiceAgentState === "SPEAKING") && !isMuted) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = speechLang;

      recognition.onstart = () => {
        console.log("🎙️ Continuous Speech Recognition started...");
      };

      recognition.onend = () => {
        // Auto-restart loop if still active, listening or speaking, and not muted (solves stale closures via Refs)
        if (isVoiceModeActiveRef.current && (voiceAgentStateRef.current === "LISTENING" || voiceAgentStateRef.current === "SPEAKING") && !isMutedRef.current) {
          try {
            recognition.start();
          } catch (e) {
            console.warn("Attempted recognition restart failed:", e);
          }
        }
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition error:", e.error);
      };

      recognition.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript && transcript.trim()) {
          console.log("🗣️ Voice dictated:", transcript);
          
          if (/exit voice mode|goodbye|allah hafiz|band karo/i.test(transcript)) {
            handleExitVoiceMode();
            return;
          }

          // BARGE-IN INTERRUPTION logic:
          if (voiceAgentStateRef.current === "SPEAKING") {
            const cleanAiResponse = lastAiResponseRef.current?.toLowerCase() || "";
            if (cleanAiResponse.includes(transcript.toLowerCase()) || transcript.length < 3) {
              console.log("🤫 Echo of AI response detected, ignoring barge-in...");
              return;
            }
            console.log("🤫 User interrupted AI! Cancelling speaking...");
            if (typeof window !== "undefined" && window.speechSynthesis) {
              window.speechSynthesis.cancel();
            }
          }

          setVoiceAgentState("THINKING");

          try {
            // Push user message to dialog box
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
                sessionId: activeSessionId || undefined
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

              speakText(data.response);
            } else {
              speakText("Sorry, I encountered a connection issue. Please try again.");
            }
          } catch (err) {
            console.error("Voice chat error:", err);
            speakText("Connection failed. Please check your network.");
          }
        }
      };

      voiceRecognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {
        console.error("Failed to start SpeechRecognition:", e);
      }
    }

    return () => {
      if (recognition) {
        recognition.onend = null;
        recognition.onerror = null;
        recognition.onresult = null;
        try {
          recognition.stop();
        } catch (e) {}
      }
    };
  }, [isVoiceModeActive, voiceAgentState, isMuted, speechLang]);

  const handleToggleVoiceMode = () => {
    if (isVoiceModeActive) {
      handleExitVoiceMode();
    } else {
      setIsVoiceModeActive(true);
      setVoiceAgentState("LISTENING");
      if (isListening) {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        setIsListening(false);
      }
    }
  };

  const handleExitVoiceMode = () => {
    setIsVoiceModeActive(false);
    setVoiceAgentState("IDLE");
    
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
        
        {/* LEFT PANEL: Chat Sessions History (20%) */}
        <div className="lg:col-span-2 glass rounded-3xl border border-border/60 p-4 bg-card/25 flex flex-col overflow-hidden text-left shadow-xl h-full">
          {/* "+ New Chat" Button */}
          <button
            onClick={handleCreateNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary/95 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl glow-primary transition-all duration-300 hover:scale-[1.02] active:scale-95 mb-4 flex-shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>

          <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider mb-2.5 pl-1.5 flex-shrink-0">
            Recent Conversations
          </span>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
            {isLoadingSessions ? (
              <div className="flex items-center justify-center py-10 gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary glow-primary" />
                <span>Loading...</span>
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-[10px] text-center text-muted-foreground italic py-10">No chats found.</p>
            ) : (
              sessions.map((sess) => {
                const isActive = activeSessionId === sess.id;
                return (
                  <div
                    key={sess.id}
                    onClick={() => handleSelectSession(sess.id)}
                    className={`p-2.5 rounded-2xl border flex justify-between items-center gap-2 group transition-all duration-200 cursor-pointer ${
                      isActive 
                        ? "bg-primary/25 border-primary/40 shadow-lg glow-primary" 
                        : "bg-secondary/10 border-border/30 hover:bg-secondary/35 hover:border-border/60"
                    }`}
                  >
                    <div className="overflow-hidden space-y-0.5 flex-1 select-none">
                      <p className={`text-[10.5px] font-extrabold truncate ${isActive ? "text-white" : "text-gray-300 group-hover:text-white"}`}>
                        {sess.title}
                      </p>
                      <span className="block text-[7.5px] text-gray-500 font-medium">
                        {new Date(sess.updatedAt || sess.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(e, sess.id)}
                      className="text-muted-foreground hover:text-red-400 p-1 rounded-md hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-pointer"
                      title="Delete Conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

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

                    <div className={`p-4 rounded-2xl border text-sm leading-relaxed shadow-lg whitespace-pre-wrap ${
                      isUser 
                        ? "bg-primary/20 border-primary/30 text-white rounded-tr-none glow-primary shadow-[0_0_15px_rgba(6,182,212,0.05)]" 
                        : "bg-card border-border/50 text-gray-200 rounded-tl-none"
                    }`}>
                      <p className="font-medium">{msg.content}</p>

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
                    </div>

                    {/* DYNAMIC COMPONENT CARD RENDERING SECTION */}
                    {!isUser && msg.toolData && (
                      <div className="mt-3 animate-fade-in w-full overflow-hidden">
                        
                        {/* A. PROPERTY CAROUSEL WIDGET */}
                        {msg.toolExecuted === "searchProperties" && Array.isArray(msg.toolData) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                              <Building2 className="w-3.5 h-3.5" /> Property Matches ({msg.toolData.length})
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
                              {msg.toolData.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No matching properties registered in this bracket.</p>
                              ) : (
                                msg.toolData.map((prop: any) => (
                                  <div 
                                    key={prop.id} 
                                    onClick={() => router.push(`/properties/${prop.id}`)}
                                    className="w-64 flex-shrink-0 glass rounded-2xl border border-border/80 overflow-hidden flex flex-col shadow-lg bg-card/45 cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                                  >
                                    {/* Ambient Building Placeholder Banner */}
                                    <div className="h-24 bg-gradient-to-br from-primary/20 to-secondary/35 flex items-center justify-center border-b border-border/40 relative">
                                      <Building2 className="w-8 h-8 text-primary glow-primary opacity-60 animate-pulse" />
                                      <span className="absolute bottom-2 right-2 text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md text-white">
                                        {prop.listingType}
                                      </span>
                                    </div>
                                    <div className="p-3 text-left space-y-2">
                                      <div>
                                        <span className="text-[9px] font-black uppercase text-primary tracking-wider">{prop.type}</span>
                                        <h4 className="font-extrabold text-xs text-white truncate">{prop.title}</h4>
                                      </div>
                                      <div className="flex justify-between items-center border-y border-border/20 py-1.5 text-[10px] text-gray-400">
                                        <span>🛏️ {prop.bedrooms || 0} Beds</span>
                                        <span>🚿 {prop.bathrooms || 0} Baths</span>
                                        <span>📐 {prop.areaSqft || 0} Sqft</span>
                                      </div>
                                      <div className="flex justify-between items-center pt-1">
                                        <span className="text-xs font-black text-white glow-primary">{parseFloat(prop.price).toLocaleString()} PKR</span>
                                        <span className="text-[8px] font-extrabold bg-green-500/10 border border-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full uppercase tracking-wider">{prop.status}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {/* B. FINANCIAL STATS & PAYROLL SVG GRAPHICS WIDGET */}
                        {msg.toolExecuted === "getFinanceAnalytics" && msg.toolData.totals && (
                          <div className="glass rounded-2xl border border-border/80 p-4 space-y-4 max-w-xl bg-card/30">
                            <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest border-b border-border/30 pb-2">
                              <Wallet className="w-3.5 h-3.5 text-primary glow-primary" /> Finance Aggregate Analysis
                            </div>
                            
                            {/* Stats Metrics Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                              {[
                                { label: "Net Salaries", val: msg.toolData.totals.netSalary, color: "text-white" },
                                { label: "Base Salaries", val: msg.toolData.totals.baseSalary, color: "text-gray-400" },
                                { label: "Allowances", val: msg.toolData.totals.allowances, color: "text-emerald-400" },
                                { label: "Deductions", val: msg.toolData.totals.deductions, color: "text-red-400" }
                              ].map((stat, i) => (
                                <div key={i} className="p-2.5 rounded-xl border border-border/40 bg-secondary/15 flex flex-col justify-center">
                                  <span className="text-[8px] font-black uppercase text-gray-500 tracking-wider">{stat.label}</span>
                                  <span className={`text-[11px] font-black truncate mt-1 ${stat.color}`}>{parseFloat(stat.val).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>

                            {/* Dynamic SVG Salary Bar Chart */}
                            {msg.toolData.staffDetails && msg.toolData.staffDetails.length > 0 && (
                              <div className="space-y-2 mt-2">
                                <span className="block text-[9px] font-black uppercase text-gray-500 tracking-wider">Salary Distribution Graph</span>
                                <div className="p-3 bg-secondary/20 border border-border/40 rounded-xl flex flex-col gap-2 relative">
                                  {msg.toolData.staffDetails.slice(0, 5).map((staff: any, idx: number) => {
                                    const maxSalary = Math.max(...msg.toolData.staffDetails.map((s: any) => s.salary), 1);
                                    const percent = (staff.salary / maxSalary) * 100;
                                    return (
                                      <div key={idx} className="space-y-1">
                                        <div className="flex justify-between text-[9px] text-gray-300 font-bold">
                                          <span>👤 {staff.name} ({staff.designation || "Staff"})</span>
                                          <span className="text-white">{parseFloat(staff.salary).toLocaleString()} PKR</span>
                                        </div>
                                        {/* CSS progress bar */}
                                        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/20">
                                          <div 
                                            className="h-full bg-gradient-to-r from-primary to-secondary glow-primary rounded-full transition-all duration-1000"
                                            style={{ width: `${percent}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* C. DYNAMIC TASK OPERATIONAL CHECKLIST */}
                        {msg.toolExecuted === "getTasksBoard" && Array.isArray(msg.toolData) && (
                          <div className="glass rounded-2xl border border-border/80 p-4 max-w-md bg-card/30 text-left space-y-3">
                            <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest border-b border-border/30 pb-2">
                              <CheckSquare className="w-3.5 h-3.5 text-primary glow-primary" /> Active ERP Tasks Board ({msg.toolData.length})
                            </div>
                            <div className="space-y-2 divide-y divide-border/20 max-h-48 overflow-y-auto scrollbar-thin">
                              {msg.toolData.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic py-4 text-center">Zero operational tasks registered on index.</p>
                              ) : (
                                msg.toolData.map((task: any) => {
                                  const isDone = task.status === "COMPLETED";
                                  const isProgress = task.status === "IN_PROGRESS";
                                  
                                  return (
                                    <div key={task.id} className="pt-2 flex items-start gap-3 text-xs leading-relaxed group">
                                      <input 
                                        type="checkbox"
                                        readOnly
                                        checked={isDone}
                                        className="mt-0.5 rounded border-border text-primary outline-none focus:ring-0 cursor-pointer pointer-events-none"
                                      />
                                      <div className="flex-1 space-y-0.5 overflow-hidden">
                                        <span className={`block font-semibold truncate ${isDone ? "line-through text-gray-500" : "text-white"}`}>
                                          {task.title}
                                        </span>
                                        <div className="flex items-center gap-2 text-[8px] font-black uppercase text-gray-500">
                                          <span>👤 {task.assignedTo?.firstName || "Unassigned"}</span>
                                          <span>•</span>
                                          <span className={isDone ? "text-green-400" : isProgress ? "text-amber-400 animate-pulse" : "text-gray-400"}>
                                            {task.status}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {/* D. CRM CLIENT ROSTER */}
                        {msg.toolExecuted === "searchClients" && Array.isArray(msg.toolData) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                              <Users className="w-3.5 h-3.5" /> CRM Client Contacts ({msg.toolData.length})
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
                              {msg.toolData.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No matching client database entries found.</p>
                              ) : (
                                msg.toolData.map((client: any) => (
                                  <div 
                                    key={client.id} 
                                    onClick={() => router.push(`/clients/${client.id}`)}
                                    className="w-56 flex-shrink-0 glass rounded-2xl border border-border/80 p-3 bg-card/45 flex flex-col justify-between text-left space-y-2 cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                                  >
                                    <div className="space-y-1">
                                      <div className="flex justify-between items-start gap-1">
                                        <h4 className="font-extrabold text-xs text-white truncate">{client.name}</h4>
                                        <span className="text-[7px] font-black uppercase bg-primary/10 border border-primary/30 text-primary px-1.5 py-0.5 rounded">
                                          {client.type}
                                        </span>
                                      </div>
                                      <p className="text-[9px] text-gray-500 font-extrabold tracking-wider truncate uppercase">Preference: {client.preferences || "None"}</p>
                                    </div>
                                    <div className="border-t border-border/20 pt-2 flex justify-between items-center text-[10px]">
                                      <span className="font-semibold text-gray-400">Budget:</span>
                                      <span className="font-black text-white glow-primary">
                                        {client.budget ? `${parseFloat(client.budget).toLocaleString()} PKR` : "Unspecified"}
                                      </span>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {/* E. MEETINGS ANALYTICS CAROUSEL WIDGET */}
                        {msg.toolExecuted === "getMeetingsAnalytics" && Array.isArray(msg.toolData) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                              <Calendar className="w-3.5 h-3.5 text-primary glow-primary" /> Scheduled Meetings ({msg.toolData.length})
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
                              {msg.toolData.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No meetings recorded in the system.</p>
                              ) : (
                                msg.toolData.map((meeting: any) => {
                                  const isVirtual = meeting.location?.toLowerCase().includes("virtual") || meeting.location?.toLowerCase().includes("http");
                                  const totalInvited = meeting.attendanceSummary?.totalInvited || 0;
                                  const totalAttended = meeting.attendanceSummary?.totalAttended || 0;
                                  const totalAbsent = meeting.attendanceSummary?.totalAbsent || 0;
                                  const attendanceRate = totalInvited > 0 ? Math.round((totalAttended / totalInvited) * 100) : 0;
                                  
                                  return (
                                    <div key={meeting.id} className="w-72 flex-shrink-0 glass rounded-2xl border border-border/80 overflow-hidden flex flex-col shadow-lg bg-card/45">
                                      {/* Gradient Banner Header */}
                                      <div className={`h-20 bg-gradient-to-br ${isVirtual ? "from-cyan-500/20 to-blue-500/35" : "from-emerald-500/20 to-teal-500/35"} flex items-center justify-between px-4 border-b border-border/40 relative flex-shrink-0`}>
                                        <div className="flex items-center gap-2">
                                          {isVirtual ? <Video className="w-6 h-6 text-primary glow-primary animate-pulse" /> : <Calendar className="w-6 h-6 text-emerald-400" />}
                                          <div className="text-left">
                                            <span className="block text-[7.5px] font-black uppercase tracking-widest text-gray-400">Location type</span>
                                            <span className="block text-[9.5px] font-bold text-white uppercase">{isVirtual ? "Virtual / Online" : "Physical Meeting"}</span>
                                          </div>
                                        </div>
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md border ${
                                          meeting.isTerminated 
                                            ? "bg-red-500/10 border-red-500/20 text-red-400" 
                                            : "bg-green-500/10 border-green-500/20 text-green-400 animate-pulse"
                                        }`}>
                                          {meeting.isTerminated ? "Ended" : "Active"}
                                        </span>
                                      </div>

                                      {/* Meeting Body Contents */}
                                      <div className="p-4 text-left space-y-3.5 flex-1 flex flex-col justify-between">
                                        <div className="space-y-1">
                                          <span className="text-[8px] font-black uppercase text-primary tracking-wider">Title</span>
                                          <h4 className="font-extrabold text-xs text-white truncate" title={meeting.title}>{meeting.title}</h4>
                                          {meeting.description && (
                                            <p className="text-[10px] text-gray-400 line-clamp-1 italic">{meeting.description}</p>
                                          )}
                                        </div>

                                        {/* Meeting Schedule details */}
                                        <div className="space-y-2 border-y border-border/20 py-2.5 text-[10px] text-gray-300">
                                          <div className="flex justify-between items-center">
                                            <span className="text-gray-500">📅 Time:</span>
                                            <span className="font-bold text-white">
                                              {new Date(meeting.startTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-gray-500">👤 Host:</span>
                                            <span className="font-bold text-white flex items-center gap-1">
                                              {meeting.organizer} 
                                              {meeting.organizerRole && (
                                                <span className="text-[7px] font-black uppercase bg-secondary border border-border/40 px-1 py-0.2 rounded text-gray-400">
                                                  {meeting.organizerRole.replace("SUPER_", "")}
                                                </span>
                                              )}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Attendance Statistics */}
                                        <div className="space-y-2 pt-1">
                                          <div className="flex justify-between items-center text-[10px]">
                                            <span className="text-gray-400 font-extrabold uppercase tracking-wider text-[8px]">Attendance Details ({attendanceRate}% Present)</span>
                                            <span className="text-gray-500 font-semibold">{totalAttended} / {totalInvited} Present</span>
                                          </div>
                                          
                                          {/* CSS Attendance Progress Bar */}
                                          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden border border-border/20">
                                            <div 
                                              className={`h-full bg-gradient-to-r ${attendanceRate > 50 ? "from-emerald-400 to-teal-500" : "from-red-400 to-orange-500"} rounded-full`}
                                              style={{ width: `${attendanceRate}%` }}
                                            ></div>
                                          </div>

                                          {/* Present / Absent participants drawer preview */}
                                          <div className="grid grid-cols-2 gap-2 text-[9.5px] pt-1">
                                            <div className="space-y-1">
                                              <span className="block text-[8px] font-black uppercase text-green-400 tracking-wider">👥 Present ({totalAttended})</span>
                                              <div className="max-h-16 overflow-y-auto scrollbar-none space-y-0.5">
                                                {meeting.attendedParticipants?.length === 0 ? (
                                                  <span className="text-gray-500 italic block text-[8px]">Nobody attended</span>
                                                ) : (
                                                  meeting.attendedParticipants?.map((p: any, idx: number) => (
                                                    <span key={idx} className="block truncate text-gray-300 font-medium">• {p.name}</span>
                                                  ))
                                                )}
                                              </div>
                                            </div>
                                            <div className="space-y-1 border-l border-border/20 pl-2">
                                              <span className="block text-[8px] font-black uppercase text-red-400 tracking-wider">🚫 Absent ({totalAbsent})</span>
                                              <div className="max-h-16 overflow-y-auto scrollbar-none space-y-0.5">
                                                {meeting.absentParticipants?.length === 0 ? (
                                                  <span className="text-gray-500 italic block text-[8px]">No absentees</span>
                                                ) : (
                                                  meeting.absentParticipants?.map((p: any, idx: number) => (
                                                    <span key={idx} className="block truncate text-gray-300 font-medium">• {p.name}</span>
                                                  ))
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Action buttons (Join Link) */}
                                        {isVirtual && meeting.location && !meeting.isTerminated && meeting.status !== 'COMPLETED' && (
                                          <div className="pt-3">
                                            <a 
                                              href={meeting.location.includes("http") ? meeting.location : "#"}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="w-full py-2 rounded-xl bg-primary/20 hover:bg-primary border border-primary/30 hover:border-primary text-white font-black text-[10px] uppercase tracking-widest text-center block transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] cursor-pointer"
                                            >
                                              Join Virtual Meeting
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {/* F. DYNAMIC LEAVE REQUESTS CAROUSEL */}
                        {msg.toolExecuted === "getLeaveRequests" && Array.isArray(msg.toolData) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest text-left">
                              <Palmtree className="w-3.5 h-3.5 text-primary glow-primary animate-pulse" /> Leave Requests ({msg.toolData.length})
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
                              {msg.toolData.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic py-3 text-left">No leave requests registered under your current criteria.</p>
                              ) : (
                                msg.toolData.map((leave: any) => {
                                  const isApproved = leave.status === "APPROVED";
                                  const isPending = leave.status === "PENDING";
                                  
                                  return (
                                    <div key={leave.id} className="w-64 flex-shrink-0 glass rounded-2xl border border-border/80 overflow-hidden flex flex-col shadow-lg bg-card/45">
                                      {/* Banner Header */}
                                      <div className={`h-12 bg-gradient-to-br ${
                                        isApproved ? "from-emerald-500/10 to-teal-500/20" :
                                        isPending ? "from-amber-500/10 to-orange-500/20" : "from-red-500/10 to-pink-500/20"
                                      } flex items-center justify-between px-3 border-b border-border/40`}>
                                        <span className="text-[10px] font-black uppercase text-white tracking-wider flex items-center gap-1">
                                          🌴 {leave.type} Leave
                                        </span>
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                                          isApproved ? "bg-green-500/10 border-green-500/20 text-green-400" :
                                          isPending ? "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse" :
                                          "bg-red-500/10 border-red-500/20 text-red-400"
                                        }`}>
                                          {leave.status}
                                        </span>
                                      </div>

                                      {/* Card Details */}
                                      <div className="p-3 text-left space-y-2 flex-1 flex flex-col justify-between">
                                        <div className="space-y-0.5">
                                          <span className="block text-[7.5px] font-black uppercase text-gray-500 tracking-wider">Applicant</span>
                                          <h4 className="font-extrabold text-xs text-white truncate">{leave.employeeName}</h4>
                                          <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-wider">{leave.employeeRole}</span>
                                        </div>

                                        <div className="border-y border-border/20 py-2 flex flex-col gap-1 text-[9.5px] text-gray-300">
                                          <div className="flex justify-between">
                                            <span className="text-gray-500">From:</span>
                                            <span className="font-bold text-white">{new Date(leave.startDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-500">To:</span>
                                            <span className="font-bold text-white">{new Date(leave.endDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                                          </div>
                                        </div>

                                        {leave.reason && (
                                          <div className="bg-secondary/20 border border-border/30 rounded-xl p-2 text-[9.5px] text-gray-400 italic line-clamp-2 mt-1">
                                            "{leave.reason}"
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {/* G. DYNAMIC LOGISTICS & MAINTENANCE SPLIT-PANEL */}
                        {msg.toolExecuted === "getLogisticsAnalytics" && msg.toolData && (
                          <div className="glass rounded-2xl border border-border/80 p-4 space-y-4 w-full max-w-xl bg-card/30">
                            <div className="flex items-center justify-between border-b border-border/30 pb-2">
                              <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest text-left">
                                <Truck className="w-4 h-4 text-primary glow-primary animate-pulse" /> Fleet & Logistics Terminal
                              </div>
                              <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
                                {msg.toolData.vehiclesCount || 0} Vehicles Active
                              </span>
                            </div>

                            {/* Vehicles & Maintenance Split */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Fleet Left Cabinet */}
                              <div className="space-y-2 text-left">
                                <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Fleet Maintenance Costs</span>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                                  {(!msg.toolData.vehicles || msg.toolData.vehicles.length === 0) ? (
                                    <p className="text-[10px] text-muted-foreground italic text-left">No vehicles indexed.</p>
                                  ) : (
                                    msg.toolData.vehicles.map((veh: any) => (
                                      <div key={veh.id} className="p-2 border border-border/30 bg-secondary/15 rounded-xl flex justify-between items-center gap-2">
                                        <div className="overflow-hidden text-left">
                                          <h5 className="font-extrabold text-[10.5px] text-white truncate">{veh.modelName}</h5>
                                          <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest">{veh.plateNumber}</span>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                          <span className={`block text-[8px] font-black uppercase px-1.5 py-0.2 rounded border ${
                                            veh.status === "ACTIVE" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                                          }`}>{veh.status}</span>
                                          <span className="block text-[9.5px] font-black text-white glow-primary mt-1">{veh.maintenanceCostTotal?.toLocaleString() || 0} PKR</span>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              {/* Logistics Schedules Timeline Right Cabinet */}
                              <div className="space-y-2 text-left border-l border-border/20 pl-0 md:pl-4">
                                <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Active schedules timeline</span>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                                  {(!msg.toolData.schedules || msg.toolData.schedules.length === 0) ? (
                                    <p className="text-[10px] text-muted-foreground italic text-left">No active logistics schedules indexed.</p>
                                  ) : (
                                    msg.toolData.schedules.map((sch: any) => {
                                      const isCompleted = sch.status === "COMPLETED";
                                      const isInTransit = sch.status === "IN_TRANSIT";
                                      
                                      return (
                                        <div key={sch.id} className="p-2 border border-border/30 bg-secondary/10 hover:bg-secondary/25 rounded-xl transition-all space-y-1 text-[9.5px] text-left">
                                          <div className="flex justify-between items-center">
                                            <span className="font-extrabold text-white">👤 {sch.driver || "Unassigned"}</span>
                                            <span className={`text-[7px] font-black uppercase px-1 rounded border ${
                                              isCompleted ? "bg-green-500/10 border-green-500/20 text-green-400" :
                                              isInTransit ? "bg-purple-500/10 border-purple-500/20 text-purple-400 animate-pulse" :
                                              "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                            }`}>{sch.status}</span>
                                          </div>
                                          <div className="text-[9px] text-gray-400 leading-tight">
                                            <span className="text-primary font-bold">📍 Pick:</span> {sch.pickupLocation} <br/>
                                            <span className="text-secondary font-bold">📍 Drop:</span> {sch.dropLocation}
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* H. DYNAMIC EMPLOYEE ROSTER CARDS */}
                        {msg.toolExecuted === "searchEmployees" && Array.isArray(msg.toolData) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest text-left">
                              <Users className="w-3.5 h-3.5 text-primary glow-primary" /> Employee Directory ({msg.toolData.length})
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
                              {msg.toolData.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic py-3 text-left">No employees found matching the search criteria.</p>
                              ) : (
                                msg.toolData.map((emp: any) => (
                                  <div 
                                    key={emp.id} 
                                    onClick={() => router.push(`/employees/${emp.userId}`)}
                                    className="w-60 flex-shrink-0 glass rounded-2xl border border-border/80 p-4 bg-card/45 flex flex-col justify-between text-left space-y-3 shadow-lg cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                                  >
                                    <div className="flex justify-between items-start">
                                      <div className="space-y-0.5">
                                        <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded">
                                          {emp.department || "Staff"}
                                        </span>
                                        <h4 className="font-extrabold text-xs text-white truncate mt-1.5">
                                          {emp.user ? `${emp.user.firstName} ${emp.user.lastName || ''}`.trim() : "Unknown Employee"}
                                        </h4>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider truncate">
                                          {emp.designation || "Employee"}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    <div className="border-t border-border/20 pt-2.5 space-y-1.5 text-[9.5px]">
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>📧 Email:</span>
                                        <span className="font-semibold text-white truncate max-w-[130px]">{emp.user?.email || "N/A"}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>📅 Joined:</span>
                                        <span className="font-semibold text-white">
                                          {emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-gray-400">
                                        <span>💰 Payout:</span>
                                        <span className="font-extrabold text-white">
                                          {typeof emp.salary === 'number' ? `${emp.salary.toLocaleString()} PKR` : emp.salary}
                                        </span>
                                      </div>
                                    </div>
                                    
                                    <div className="border-t border-border/20 pt-2 flex justify-between items-center text-[8px]">
                                      <span className="font-black uppercase text-gray-500">Security Clearance</span>
                                      <span className="font-black bg-secondary border border-border/40 text-gray-300 px-1.5 py-0.5 rounded uppercase">
                                        {emp.user?.role || "USER"}
                                      </span>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {/* K. DYNAMIC EMPLOYEE PERFORMANCE CARD OR RANKINGS LEADERBOARD */}
                        {msg.toolExecuted === "fetchEmployeePerformance" && msg.toolData && !msg.toolData.error && (
                          msg.toolData.isRankingsList ? (
                            <div className="glass rounded-2xl border border-border/80 p-5 space-y-4 w-full max-w-lg bg-card/30 text-left animate-fade-in shadow-2xl">
                              <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                                <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                                  <Award className="w-4 h-4 text-primary glow-primary animate-pulse" /> Team Performance Rankings Board
                                </div>
                                <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
                                  {msg.toolData.leaderboard?.length || 0} Staff Active
                                </span>
                              </div>

                              <div className="space-y-3 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
                                {msg.toolData.leaderboard?.map((item: any, idx: number) => {
                                  // Medal or Rank Icon
                                  let rankMedal = "🏅";
                                  if (idx === 0) rankMedal = "🥇";
                                  else if (idx === 1) rankMedal = "🥈";
                                  else if (idx === 2) rankMedal = "🥉";

                                  return (
                                    <div 
                                      key={item.profileId}
                                      onClick={() => router.push(`/employees/${item.userId}`)}
                                      className="flex items-center justify-between p-3 border border-border/30 bg-secondary/10 hover:bg-secondary/20 hover:border-primary/45 rounded-xl gap-3 text-[11px] transition-all cursor-pointer group"
                                    >
                                      {/* Rank Medal & Name */}
                                      <div className="flex items-center gap-2.5 min-w-[150px] max-w-[200px]">
                                        <span className="text-sm">{rankMedal}</span>
                                        <div className="text-left overflow-hidden">
                                          <h5 className="font-extrabold text-white truncate group-hover:text-primary transition-colors">
                                            {item.employee}
                                          </h5>
                                          <p className="text-[8px] text-gray-400 font-black uppercase tracking-wider truncate">
                                            {item.designation} • {item.department}
                                          </p>
                                        </div>
                                      </div>

                                      {/* Task Completion Progress & Star Rating */}
                                      <div className="flex items-center gap-4 flex-1 justify-end">
                                        {/* Task Completion Rate */}
                                        <div className="text-right space-y-0.5 hidden sm:block">
                                          <span className="block text-[7.5px] font-black uppercase text-gray-500">Task Completion</span>
                                          <div className="flex items-center gap-1.5 justify-end">
                                            <div className="w-12 h-1 bg-secondary rounded-full overflow-hidden border border-border/20">
                                              <div 
                                                className="h-full bg-gradient-to-r from-primary to-secondary rounded-full" 
                                                style={{ width: `${item.taskStats.completionRate}%` }}
                                              ></div>
                                            </div>
                                            <span className="font-extrabold text-emerald-400 text-[9px]">{item.taskStats.completionRate}%</span>
                                          </div>
                                        </div>

                                        {/* Rating & Tasks Count */}
                                        <div className="text-right flex flex-col justify-center items-end min-w-[70px]">
                                          <span className="text-amber-400 font-extrabold flex items-center gap-0.5">
                                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                            <span className="text-[10px] font-black">{item.avgRating || "0.0"}</span>
                                          </span>
                                          <span className="text-[7.5px] font-bold text-gray-500">
                                            {item.taskStats.completed}/{item.taskStats.total} Tasks
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="glass rounded-2xl border border-border/80 p-5 space-y-4 w-full max-w-md bg-card/30 text-left animate-fade-in shadow-2xl">
                              <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                                <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                                  <Award className="w-4 h-4 text-primary glow-primary animate-pulse" /> Employee Performance Analysis
                                </div>
                                <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
                                  {msg.toolData.designation || "Staff"}
                                </span>
                              </div>

                              {/* Employee Header */}
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/35 border border-border/50 flex items-center justify-center relative flex-shrink-0">
                                  <User className="w-6 h-6 text-primary glow-primary" />
                                </div>
                                <div className="text-left overflow-hidden">
                                  <h4 className="font-extrabold text-sm text-white truncate">{msg.toolData.employee}</h4>
                                  <span className="block text-[8px] font-black uppercase text-primary tracking-wider">{msg.toolData.department || "General"} Department</span>
                                </div>
                              </div>

                              {/* Task Stats Block */}
                              {msg.toolData.taskStats && (
                                <div className="p-3.5 bg-secondary/15 border border-border/30 rounded-xl space-y-2.5">
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-gray-400 font-extrabold uppercase tracking-wider text-[8px]">Task Completion ({msg.toolData.taskStats.completionRate})</span>
                                    <span className="text-gray-500 font-semibold">{msg.toolData.taskStats.completed} / {msg.toolData.taskStats.total} Completed</span>
                                  </div>
                                  {/* Progress Bar */}
                                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/20">
                                    <div 
                                      className="h-full bg-gradient-to-r from-primary to-secondary glow-primary rounded-full transition-all duration-1000"
                                      style={{ width: msg.toolData.taskStats.completionRate }}
                                    ></div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-center text-[9px] pt-1">
                                    <div className="p-1.5 rounded-lg border border-border/20 bg-secondary/10">
                                      <span className="block text-[7.5px] font-black uppercase text-gray-500">Pending Tasks</span>
                                      <span className="text-xs font-black text-amber-400">{msg.toolData.taskStats.pending}</span>
                                    </div>
                                    <div className="p-1.5 rounded-lg border border-border/20 bg-secondary/10">
                                      <span className="block text-[7.5px] font-black uppercase text-gray-500">Completed Tasks</span>
                                      <span className="text-xs font-black text-emerald-400">{msg.toolData.taskStats.completed}</span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Recent Reviews (Rating & Feedback) */}
                              {msg.toolData.reviews && msg.toolData.reviews.length > 0 && (
                                <div className="space-y-1.5 text-left">
                                  <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Performance Reviews</span>
                                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                                    {msg.toolData.reviews.map((rev: any, idx: number) => (
                                      <div key={idx} className="p-2.5 border border-border/30 bg-secondary/10 rounded-xl space-y-1.5 text-[9.5px]">
                                        <div className="flex justify-between items-center">
                                          <span className="text-amber-400 font-extrabold flex items-center gap-0.5">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                              <Star 
                                                key={i} 
                                                className={`w-2.5 h-2.5 ${i < rev.rating ? "fill-amber-400 text-amber-400" : "text-gray-600"}`} 
                                              />
                                            ))}
                                          </span>
                                          <span className="text-[7.5px] font-bold text-gray-500">
                                            {new Date(rev.date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                                          </span>
                                        </div>
                                        <p className="text-gray-300 italic leading-relaxed">"{rev.feedback}"</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Recent Activities */}
                              {msg.toolData.recentActivities && msg.toolData.recentActivities.length > 0 && (
                                <div className="space-y-1.5 text-left">
                                  <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Recent Activity Logs</span>
                                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                                    {msg.toolData.recentActivities.map((act: any, idx: number) => (
                                      <div key={idx} className="p-2 border border-border/30 bg-secondary/10 rounded-xl flex justify-between items-center gap-2 text-[9px]">
                                        <span className="text-gray-300 font-medium truncate max-w-[190px]">• {act.description}</span>
                                        <span className="text-[7px] font-black uppercase bg-secondary border border-border/40 text-gray-400 px-1 py-0.2 rounded flex-shrink-0">
                                          {act.category}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        )}

                        {/* I. DYNAMIC ATTENDANCE TIMELINE & ANALYTICS GRAPH WIDGET */}
                        {msg.toolExecuted === "getAttendanceRecord" && Array.isArray(msg.toolData) && (
                          <div className="glass rounded-2xl border border-border/80 p-4 space-y-4 w-full max-w-xl bg-card/30 text-left">
                            <div className="flex items-center justify-between border-b border-border/30 pb-2">
                              <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                                <Clock className="w-4 h-4 text-primary glow-primary animate-pulse" /> Shift Attendance & Analytics Graph
                              </div>
                              <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
                                {msg.toolData.length} Logs Analyzed
                              </span>
                            </div>

                            {/* Metric Overview (Present / Late / Absent Rates) */}
                            {msg.toolData.length > 0 && (
                              <div className="grid grid-cols-3 gap-2.5 text-center">
                                {(() => {
                                  const total = msg.toolData.length;
                                  const present = msg.toolData.filter((a: any) => a.status === "PRESENT").length;
                                  const late = msg.toolData.filter((a: any) => a.status === "LATE").length;
                                  const absent = msg.toolData.filter((a: any) => a.status === "ABSENT").length;
                                  const onLeave = msg.toolData.filter((a: any) => a.status === "ON_LEAVE").length;
                                  
                                  const presentPct = Math.round((present / total) * 100) || 0;
                                  const latePct = Math.round((late / total) * 100) || 0;
                                  const absentPct = Math.round(((absent + onLeave) / total) * 100) || 0;

                                  return (
                                    <>
                                      {[
                                        { label: "Present Rate", pct: presentPct, val: present, color: "text-emerald-400", barBg: "bg-emerald-400" },
                                        { label: "Late Rate", pct: latePct, val: late, color: "text-amber-400", barBg: "bg-amber-400" },
                                        { label: "Absent/Leave", pct: absentPct, val: absent + onLeave, color: "text-red-400", barBg: "bg-red-400" }
                                      ].map((metric, i) => (
                                        <div key={i} className="p-2 border border-border/30 bg-secondary/10 rounded-xl flex flex-col justify-between">
                                          <span className="text-[7.5px] font-black uppercase text-gray-500 tracking-wider">{metric.label}</span>
                                          <span className={`text-base font-black mt-1 ${metric.color}`}>{metric.pct}%</span>
                                          <span className="text-[8px] text-gray-400 font-bold mt-0.5">{metric.val} Days</span>
                                        </div>
                                      ))}
                                    </>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Interactive Attendance History Chart (Dynamic Visual Graph Modes) */}
                            {msg.toolData.length > 0 && (() => {
                              const uniqueEmployees = Array.from(new Set(msg.toolData.map((a: any) => a.employeeName)));
                              const isSingleEmployee = uniqueEmployees.length <= 1;

                              if (isSingleEmployee) {
                                return (
                                  <div className="space-y-1.5">
                                    <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Attendance Activity Graph (Daily Timeline)</span>
                                    <div className="p-3 bg-secondary/20 border border-border/40 rounded-xl flex flex-col gap-2 relative">
                                      <div className="h-28 flex items-end justify-between gap-1 pt-4 relative">
                                        {/* Ambient Background Gridlines */}
                                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                                          <div className="w-full border-t border-gray-400"></div>
                                          <div className="w-full border-t border-gray-400"></div>
                                          <div className="w-full border-t border-gray-400"></div>
                                        </div>

                                        {msg.toolData.slice(0, 10).reverse().map((att: any, idx: number) => {
                                          // Calculate worked hours (default 9 hours if present)
                                          let hours = 0;
                                          if (att.status === "PRESENT") hours = 9;
                                          else if (att.status === "LATE") hours = 7.5;
                                          
                                          const barHeight = (hours / 10) * 100; // max 10 hours limit

                                          const isPresent = att.status === "PRESENT";
                                          const isLate = att.status === "LATE";
                                          const barColor = isPresent ? "from-emerald-500 to-teal-400" : isLate ? "from-amber-500 to-orange-400" : "from-red-500 to-pink-500";

                                          return (
                                            <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group/bar relative">
                                              {/* Tooltip on Hover */}
                                              <div className="absolute bottom-full mb-1 bg-card border border-border text-[8px] font-black text-white px-2 py-0.5 rounded shadow-xl opacity-0 group-hover/bar:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap">
                                                {att.status}: {hours} Hours ({att.dateStr})
                                              </div>
                                              
                                              {/* SVG/CSS Bar */}
                                              <div 
                                                className={`w-full rounded-t bg-gradient-to-t ${barColor} glow-primary transition-all duration-1000`} 
                                                style={{ height: `${Math.max(barHeight, 8)}%` }}
                                              ></div>
                                              
                                              {/* Label Date */}
                                              <span className="text-[7.5px] font-extrabold text-gray-500 truncate max-w-[36px]">
                                                {new Date(att.dateStr).toLocaleDateString([], { month: "short", day: "numeric" })}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                );
                              } else {
                                // Comparative Team Present Rates Progress bars
                                const employeeStats = uniqueEmployees.map((empName: any) => {
                                  const empLogs = msg.toolData.filter((a: any) => a.employeeName === empName);
                                  const total = empLogs.length;
                                  const present = empLogs.filter((a: any) => a.status === "PRESENT").length;
                                  const late = empLogs.filter((a: any) => a.status === "LATE").length;
                                  const absent = empLogs.filter((a: any) => a.status === "ABSENT").length;
                                  const onLeave = empLogs.filter((a: any) => a.status === "ON_LEAVE").length;
                                  const activeRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
                                  return {
                                    name: empName,
                                    activeRate,
                                    present,
                                    late,
                                    absent,
                                    onLeave,
                                    role: empLogs[0]?.employeeRole || "Staff",
                                  };
                                });

                                return (
                                  <div className="space-y-1.5">
                                    <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Team Attendance Comparison Chart</span>
                                    <div className="p-3 bg-secondary/20 border border-border/40 rounded-xl flex flex-col gap-3 relative">
                                      {employeeStats.map((emp: any, idx: number) => (
                                        <div key={idx} className="space-y-1 group/bar relative text-left">
                                          <div className="flex justify-between text-[9.5px] text-gray-300 font-bold">
                                            <span className="flex items-center gap-1.5">
                                              👤 {emp.name}
                                              <span className="text-[7px] font-black uppercase bg-secondary border border-border/40 px-1 py-0.2 rounded text-gray-400">
                                                {emp.role.replace("SUPER_", "")}
                                              </span>
                                            </span>
                                            <span className="text-white font-extrabold">{emp.activeRate}% Rate ({emp.present}P / {emp.late}L / {emp.absent + emp.onLeave}A)</span>
                                          </div>
                                          <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden border border-border/20">
                                            <div 
                                              className="h-full bg-gradient-to-r from-primary to-secondary glow-primary rounded-full transition-all duration-1000"
                                              style={{ width: `${emp.activeRate}%` }}
                                            ></div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                            })()}

                            {/* Scrolling Check-in Check-out Timeline Logs */}
                            <div className="space-y-1.5">
                              <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Detailed Shift Logs Timeline</span>
                              <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                                {msg.toolData.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground italic text-center py-4">No attendance check-in records found for this criteria.</p>
                                ) : (
                                  msg.toolData.map((att: any) => {
                                    const isPresent = att.status === "PRESENT";
                                    const isLate = att.status === "LATE";
                                    
                                    return (
                                      <div key={att.id} className="p-2.5 border border-border/30 bg-secondary/10 hover:bg-secondary/25 rounded-xl transition-all flex justify-between items-center gap-4 text-xs">
                                        <div className="text-left space-y-0.5 min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-extrabold text-white truncate">{att.employeeName}</span>
                                            <span className="text-[7.5px] font-black bg-secondary border border-border/40 text-gray-400 px-1 py-0.2 rounded uppercase">
                                              {att.employeeRole.replace("SUPER_", "")}
                                            </span>
                                          </div>
                                          {att.checkoutSummary && (
                                            <p className="text-[10px] text-gray-500 italic truncate max-w-[280px]" title={att.checkoutSummary}>
                                              "{att.checkoutSummary}"
                                            </p>
                                          )}
                                          <span className="block text-[8px] font-bold text-gray-500">📅 {att.dateStr}</span>
                                        </div>

                                        <div className="text-right flex-shrink-0">
                                          <span className={`inline-block text-[7.5px] font-black uppercase px-2 py-0.5 rounded border ${
                                            isPresent ? "bg-green-500/10 border-green-500/20 text-green-400" :
                                            isLate ? "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse" :
                                            "bg-red-500/10 border-red-500/20 text-red-400"
                                          }`}>{att.status}</span>
                                          <div className="text-[9px] text-gray-400 font-semibold mt-1 space-y-0.2">
                                            {att.checkIn && (
                                              <div>In: {new Date(att.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            )}
                                            {att.checkOut && (
                                              <div>Out: {new Date(att.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* J. GENERIC SQL ANALYTICS WIDGET */}
                        {msg.toolExecuted === "runDatabaseQuery" && msg.toolData && (
                          <div className="space-y-3.5 w-full">
                            {/* SQL code drawer */}
                            {msg.toolData.query && (
                              <div className="space-y-1 text-left">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedQueries(prev => ({
                                      ...prev,
                                      [msg.id]: !prev[msg.id]
                                    }));
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/40 hover:border-slate-700/80 rounded-xl text-[10px] text-gray-300 transition-all font-mono outline-none cursor-pointer"
                                >
                                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>{expandedQueries[msg.id] ? "Hide SQL Query" : "View SQL Query"}</span>
                                  {expandedQueries[msg.id] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                                </button>
                                {expandedQueries[msg.id] && (
                                  <div className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[10px] text-cyan-400 overflow-x-auto shadow-inner w-full max-w-xl whitespace-pre scrollbar-thin">
                                    {msg.toolData.query}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Database results error visualization */}
                            {msg.toolData.error && (
                              <div className="p-3 border border-red-500/30 bg-red-500/10 rounded-xl text-red-400 text-xs font-semibold leading-relaxed text-left max-w-xl animate-fade-in">
                                ⚠️ Query Error: {msg.toolData.message || msg.toolData.error}
                              </div>
                            )}

                            {/* Database results success visualization */}
                            {msg.toolData.rows && Array.isArray(msg.toolData.rows) && (
                              <div className="glass rounded-2xl border border-border/80 p-5 space-y-4 max-w-xl bg-card/30 text-left animate-fade-in shadow-2xl">
                                <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                                  <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                                    <Database className="w-4 h-4 text-primary glow-primary" />
                                    <span>{msg.toolData.visualization?.config?.title || "Database Query Result"}</span>
                                  </div>
                                  <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
                                    {msg.toolData.rows.length} records
                                  </span>
                                </div>

                                {msg.toolData.rows.length === 0 ? (
                                  <p className="text-xs text-muted-foreground italic py-3">No database records found matching this query.</p>
                                ) : (
                                  <div className="space-y-4">
                                    {(() => {
                                      const visType = msg.toolData.visualization?.type || "table";
                                      const config = msg.toolData.visualization?.config || {};
                                      const keys = Object.keys(msg.toolData.rows[0]);
                                      const xKey = config.xKey || keys[0];
                                      const yKey = config.yKeys?.[0] || keys.find(k => k !== xKey && (typeof msg.toolData.rows[0][k] === 'number' || !isNaN(parseFloat(msg.toolData.rows[0][k]))));

                                      // 1. Table View
                                      if (visType === "table" || !yKey) {
                                        return (
                                          <div className="overflow-x-auto border border-border/30 rounded-xl scrollbar-thin">
                                            <table className="w-full text-left border-collapse text-[10.5px]">
                                              <thead>
                                                <tr className="bg-secondary/35 border-b border-border/40 text-gray-400 font-extrabold uppercase text-[8px] tracking-wider">
                                                  {keys.map((col, i) => (
                                                    <th key={i} className="px-3 py-2">{col}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-border/20">
                                                {msg.toolData.rows.map((row: any, ri: number) => (
                                                  <tr key={ri} className="hover:bg-secondary/15 transition-all text-gray-200">
                                                    {keys.map((col, ci) => {
                                                      const val = row[col];
                                                      return (
                                                        <td key={ci} className="px-3 py-2 truncate max-w-[150px]" title={String(val)}>
                                                          {val instanceof Date ? new Date(val).toLocaleDateString() : typeof val === 'number' ? val.toLocaleString() : String(val)}
                                                        </td>
                                                      );
                                                    })}
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        );
                                      }

                                      // Prepare chart data (cap at 8 items)
                                      const chartData = msg.toolData.rows.slice(0, 8).map((row: any) => {
                                        const rawX = row[xKey];
                                        let xLabel = "";
                                        if (rawX instanceof Date) {
                                          xLabel = new Date(rawX).toLocaleDateString([], { month: "short", day: "numeric" });
                                        } else if (typeof rawX === 'string' && rawX.includes("T") && !isNaN(Date.parse(rawX))) {
                                          xLabel = new Date(rawX).toLocaleDateString([], { month: "short", day: "numeric" });
                                        } else {
                                          xLabel = String(rawX);
                                        }
                                        const yVal = parseFloat(row[yKey]) || 0;
                                        return { label: xLabel, value: yVal };
                                      });

                                      const yValues = chartData.map((d: any) => d.value);
                                      const maxY = Math.max(...yValues, 1);
                                      const minY = Math.min(...yValues, 0);

                                      // 2. Bar Chart View
                                      if (visType === "bar_chart") {
                                        return (
                                          <div className="space-y-3">
                                            <div className="flex justify-between items-center text-[9px] text-gray-500 font-black uppercase px-1">
                                              <span>{xKey}</span>
                                              <span>{yKey}</span>
                                            </div>
                                            <div className="p-3 bg-secondary/15 border border-border/30 rounded-xl flex flex-col gap-2.5">
                                              {chartData.map((data: any, idx: number) => {
                                                const percent = Math.max((data.value / maxY) * 100, 4);
                                                const barColors = [
                                                  "from-cyan-500 to-blue-400",
                                                  "from-purple-500 to-indigo-400",
                                                  "from-emerald-500 to-teal-400",
                                                  "from-amber-500 to-orange-400",
                                                  "from-pink-500 to-rose-400"
                                                ];
                                                const color = barColors[idx % barColors.length];

                                                return (
                                                  <div key={idx} className="space-y-1 text-[9.5px]">
                                                    <div className="flex justify-between text-gray-300 font-bold">
                                                      <span className="truncate max-w-[160px]">{data.label}</span>
                                                      <span className="text-white font-extrabold">{data.value.toLocaleString()}</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-secondary/40 rounded-full overflow-hidden border border-border/20">
                                                      <div
                                                        className={`h-full bg-gradient-to-r ${color} glow-primary rounded-full transition-all duration-1000`}
                                                        style={{ width: `${percent}%` }}
                                                      ></div>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      }

                                      // 3. Line Chart View
                                      if (visType === "line_chart") {
                                        const width = 450;
                                        const height = 180;
                                        const padding = 30;

                                        // Resolve multiple yKeys
                                        const yKeys: string[] = config.yKeys || [yKey];

                                        const lineChartData = msg.toolData.rows.slice(0, 12).map((row: any) => {
                                          const rawX = row[xKey];
                                          let xLabel = "";
                                          if (rawX instanceof Date) {
                                            xLabel = new Date(rawX).toLocaleDateString([], { month: "short", day: "numeric" });
                                          } else if (typeof rawX === 'string' && rawX.includes("T") && !isNaN(Date.parse(rawX))) {
                                            xLabel = new Date(rawX).toLocaleDateString([], { month: "short", day: "numeric" });
                                          } else {
                                            xLabel = String(rawX);
                                          }
                                          
                                          const values: Record<string, number> = {};
                                          yKeys.forEach((yk: string) => {
                                            values[yk] = parseFloat(row[yk]) || 0;
                                          });

                                          return { label: xLabel, values };
                                        });

                                        const allYValues = lineChartData.flatMap((d: any) => Object.values(d.values) as number[]);
                                        const maxY = Math.max(...allYValues, 1);
                                        const minY = Math.min(...allYValues, 0);

                                        const lineColors = [
                                          "#06b6d4", // Cyan
                                          "#8b5cf6", // Purple
                                          "#ec4899", // Pink
                                          "#f59e0b", // Amber
                                          "#10b981", // Emerald
                                          "#3b82f6", // Blue
                                        ];

                                        return (
                                          <div className="space-y-2">
                                            <div className="p-3 bg-secondary/15 border border-border/30 rounded-xl overflow-hidden flex justify-center">
                                              <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
                                                <defs>
                                                  {yKeys.map((yk: string, yIdx: number) => {
                                                    const color = lineColors[yIdx % lineColors.length];
                                                    return (
                                                      <linearGradient key={`grad-${yIdx}`} id={`areaGrad-${yIdx}`} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
                                                        <stop offset="100%" stopColor={color} stopOpacity="0"/>
                                                      </linearGradient>
                                                    );
                                                  })}
                                                  <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                                                    <feGaussianBlur stdDeviation="3" result="blur" />
                                                    <feMerge>
                                                      <feMergeNode in="blur" />
                                                      <feMergeNode in="SourceGraphic" />
                                                    </feMerge>
                                                  </filter>
                                                </defs>

                                                <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#334155" strokeDasharray="3" strokeWidth="0.5" opacity="0.3"/>
                                                <line x1={padding} y1={(height) / 2} x2={width - padding} y2={(height) / 2} stroke="#334155" strokeDasharray="3" strokeWidth="0.5" opacity="0.3"/>
                                                <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#475569" strokeWidth="1" opacity="0.5"/>

                                                {/* Area under the lines */}
                                                {yKeys.map((yk: string, yIdx: number) => {
                                                  const points = lineChartData.map((d: any, idx: number) => {
                                                    const x = padding + (idx * (width - 2 * padding)) / Math.max(lineChartData.length - 1, 1);
                                                    const yVal = d.values[yk] || 0;
                                                    const y = height - padding - ((yVal - minY) / (maxY - minY || 1)) * (height - 2 * padding);
                                                    return { x, y };
                                                  });
                                                  const pathD = points.reduce((acc: string, p: any, idx: number) => {
                                                    return acc + (idx === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
                                                  }, "");
                                                  const areaD = points.length > 0 
                                                    ? `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
                                                    : "";
                                                  return areaD ? <path key={`area-${yIdx}`} d={areaD} fill={`url(#areaGrad-${yIdx})`} /> : null;
                                                })}

                                                {/* Glowing line paths */}
                                                {yKeys.map((yk: string, yIdx: number) => {
                                                  const points = lineChartData.map((d: any, idx: number) => {
                                                    const x = padding + (idx * (width - 2 * padding)) / Math.max(lineChartData.length - 1, 1);
                                                    const yVal = d.values[yk] || 0;
                                                    const y = height - padding - ((yVal - minY) / (maxY - minY || 1)) * (height - 2 * padding);
                                                    return { x, y };
                                                  });
                                                  const pathD = points.reduce((acc: string, p: any, idx: number) => {
                                                    return acc + (idx === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
                                                  }, "");
                                                  const color = lineColors[yIdx % lineColors.length];
                                                  return pathD ? (
                                                    <path
                                                      key={`line-${yIdx}`}
                                                      d={pathD}
                                                      fill="none"
                                                      stroke={color}
                                                      strokeWidth="2.5"
                                                      filter="url(#neonGlow)"
                                                      className="transition-all duration-1000"
                                                    />
                                                  ) : null;
                                                })}

                                                {/* Circular point markers */}
                                                {yKeys.map((yk: string, yIdx: number) => {
                                                  const color = lineColors[yIdx % lineColors.length];
                                                  return lineChartData.map((d: any, idx: number) => {
                                                    const x = padding + (idx * (width - 2 * padding)) / Math.max(lineChartData.length - 1, 1);
                                                    const yVal = d.values[yk] || 0;
                                                    const y = height - padding - ((yVal - minY) / (maxY - minY || 1)) * (height - 2 * padding);
                                                    
                                                    return (
                                                      <g key={`dot-${yIdx}-${idx}`} className="group/dot cursor-pointer">
                                                        <circle
                                                          cx={x}
                                                          cy={y}
                                                          r="4.5"
                                                          className="fill-slate-900 stroke-[2] transition-all hover:scale-150"
                                                          stroke={color}
                                                          filter="url(#neonGlow)"
                                                        />
                                                        <text
                                                          x={x}
                                                          y={y - 10}
                                                          textAnchor="middle"
                                                          className="fill-white text-[8px] font-black opacity-0 group-hover/dot:opacity-100 transition-opacity bg-slate-950 px-1 py-0.5 rounded pointer-events-none"
                                                        >
                                                          {yk}: {yVal.toLocaleString()}
                                                        </text>
                                                      </g>
                                                    );
                                                  });
                                                })}

                                                {/* X Axis Labels */}
                                                {lineChartData.map((d: any, idx: number) => {
                                                  const x = padding + (idx * (width - 2 * padding)) / Math.max(lineChartData.length - 1, 1);
                                                  return (
                                                    <text
                                                      key={`lbl-${idx}`}
                                                      x={x}
                                                      y={height - 10}
                                                      textAnchor="middle"
                                                      className="fill-gray-500 text-[7px] font-black"
                                                    >
                                                      {d.label}
                                                    </text>
                                                  );
                                                })}
                                              </svg>
                                            </div>
                                            
                                            {/* Dynamic interactive legend block */}
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 items-center justify-center text-[8px] font-black uppercase text-gray-500 tracking-wider px-1 mt-2">
                                              {yKeys.map((yk: string, yIdx: number) => {
                                                const color = lineColors[yIdx % lineColors.length];
                                                return (
                                                  <span key={yIdx} className="flex items-center gap-1.5 bg-secondary/10 px-2 py-1 rounded-lg border border-border/20">
                                                    <span className="w-2.5 h-0.5 rounded-full inline-block" style={{ backgroundColor: color }}></span>
                                                    <span className="text-gray-300 font-bold">{yk}</span>
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      }

                                      // 4. Pie/Donut Chart View
                                      if (visType === "pie_chart") {
                                        const totalSum = yValues.reduce((acc: number, v: number) => acc + v, 0) || 1;
                                        const donutColors = [
                                          "text-cyan-400",
                                          "text-purple-400",
                                          "text-emerald-400",
                                          "text-amber-400",
                                          "text-pink-400",
                                          "text-indigo-400",
                                          "text-rose-400"
                                        ];
                                        const borderColors = [
                                          "border-cyan-400/20",
                                          "border-purple-400/20",
                                          "border-emerald-400/20",
                                          "border-amber-400/20",
                                          "border-pink-400/20",
                                          "border-indigo-400/20",
                                          "border-rose-400/20"
                                        ];

                                        return (
                                          <div className="space-y-4 animate-fade-in">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                              
                                              <div className="flex justify-center items-center py-2 relative">
                                                <svg width="140" height="140" viewBox="0 0 140 140" className="transform -rotate-90">
                                                  <circle
                                                    cx="70"
                                                    cy="70"
                                                    r="50"
                                                    className="fill-none stroke-slate-800"
                                                    strokeWidth="12"
                                                  />
                                                  {(() => {
                                                    let accumulatedPercentage = 0;
                                                    return chartData.map((d: any, idx: number) => {
                                                      const percent = (d.value / totalSum) * 100;
                                                      const r = 50;
                                                      const circ = 2 * Math.PI * r;
                                                      const strokeDash = (percent / 100) * circ;
                                                      const strokeOffset = circ - (accumulatedPercentage / 100) * circ;
                                                      accumulatedPercentage += percent;

                                                      const strokeColors = [
                                                        "#22d3ee", "#c084fc", "#34d399", "#fbbf24", "#f472b6", "#818cf8", "#fb7185"
                                                      ];
                                                      const strokeColor = strokeColors[idx % strokeColors.length];

                                                      return (
                                                        <circle
                                                          key={idx}
                                                          cx="70"
                                                          cy="70"
                                                          r="50"
                                                          className="fill-none transition-all duration-1000"
                                                          strokeWidth="12"
                                                          stroke={strokeColor}
                                                          strokeDasharray={`${strokeDash} ${circ}`}
                                                          strokeDashoffset={strokeOffset}
                                                          strokeLinecap="round"
                                                        />
                                                      );
                                                    });
                                                  })()}
                                                </svg>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                  <span className="text-[14px] font-black text-white glow-primary">{totalSum.toLocaleString()}</span>
                                                  <span className="text-[7.5px] font-black uppercase text-gray-500 tracking-wider">Total Sum</span>
                                                </div>
                                              </div>

                                              <div className="space-y-2 text-[9.5px]">
                                                {chartData.map((d: any, idx: number) => {
                                                  const percent = Math.round((d.value / totalSum) * 100) || 0;
                                                  const textColor = donutColors[idx % donutColors.length];
                                                  const borderBg = borderColors[idx % borderColors.length];

                                                  return (
                                                    <div key={idx} className={`p-2 border ${borderBg} bg-secondary/10 rounded-xl flex justify-between items-center gap-2`}>
                                                      <span className="flex items-center gap-1.5 truncate max-w-[120px] font-bold text-gray-300">
                                                        <span className={`w-2 h-2 rounded-full ${textColor} bg-current`}></span>
                                                        {d.label}
                                                      </span>
                                                      <span className="text-white font-extrabold shrink-0">{d.value.toLocaleString()} ({percent}%)</span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                              
                                            </div>
                                          </div>
                                        );
                                      }

                                      return null;
                                    })()}
                                  </div>
                                )}
                              </div>
                            )}

                          </div>
                        )}

                      </div>
                    )}
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

      </div>

      {/* RENS VOICE LIVE SYSTEM OVERLAY */}
      {isVoiceModeActive && (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-center justify-center animate-fade-in transition-all">
          <div className="w-80 p-5 rounded-3xl glass border border-primary/20 bg-card/90 flex flex-col items-center text-center shadow-[0_10px_50px_rgba(0,0,0,0.45)] relative overflow-hidden backdrop-blur-xl">
            {/* Background glowing gradients */}
            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-primary/20 blur-[60px]" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-secondary/20 blur-[60px]" />

            {/* Glowing top line indicator */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-secondary animate-pulse" />

            {/* Close Button */}
            <button 
              onClick={handleExitVoiceMode}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-all p-2 rounded-xl bg-secondary/35 border border-border/20 cursor-pointer flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header branding */}
            <div className="space-y-1 mt-4">
              <span className="text-[10px] font-black uppercase text-primary tracking-widest animate-pulse">RENS Voice Live Mode</span>
              <h3 className="text-sm font-extrabold text-white">Operational AI Assistant</h3>
            </div>

            {/* Main Control Panel (Rule 6 - Mute & Refresh controls) */}
            <div className="flex items-center gap-6 mt-6 relative justify-center">
              {/* Mute/Unmute Mic Button */}
              <button
                onClick={() => setIsMuted(prev => !prev)}
                className={`p-3 rounded-full border transition-all duration-300 active:scale-95 cursor-pointer ${
                  isMuted 
                    ? "bg-red-500/20 border-red-500/60 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse" 
                    : "bg-secondary/35 border-border/20 text-gray-400 hover:text-white hover:border-border/40"
                }`}
                title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
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
                    <MicOff className="w-6 h-6 text-red-400 glow-red animate-pulse" />
                  ) : voiceAgentState === 'THINKING' ? (
                    <Loader2 className="w-6 h-6 text-emerald-400 animate-spin glow-emerald" />
                  ) : voiceAgentState === 'SPEAKING' ? (
                    <Volume2 className="w-6 h-6 text-purple-400 glow-purple animate-bounce" />
                  ) : (
                    <Mic className={`w-6 h-6 text-primary glow-primary ${voiceAgentState === 'LISTENING' ? "scale-110" : ""}`} />
                  )}
                </div>
                
                {voiceAgentState === 'SPEAKING' && !isMuted && (
                  <span className="absolute -bottom-6 text-[8px] font-bold text-purple-400 uppercase tracking-widest animate-pulse">Tap to Interrupt</span>
                )}
              </div>

              {/* Restart State Button */}
              <button
                onClick={() => {
                  if (typeof window !== "undefined" && window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                  }
                  setVoiceAgentState("LISTENING");
                }}
                className="p-4 rounded-full border bg-secondary/35 border-border/20 text-gray-400 hover:text-white hover:border-border/40 transition-all duration-300 active:scale-95 cursor-pointer"
                title="Restart Listening State"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            {/* Status Text & Dynamic Sub-status (Rule 6 - Dynamic Progress Feedback) */}
            <div className="mt-8 space-y-1.5 w-full">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">System State</p>
              <h4 className={`text-base font-extrabold tracking-wider ${
                isMuted ? "text-red-400 glow-red" :
                voiceAgentState === 'LISTENING' ? "text-primary glow-primary animate-pulse" :
                voiceAgentState === 'THINKING' ? "text-emerald-400 glow-emerald animate-pulse" :
                voiceAgentState === 'SPEAKING' ? "text-purple-400 glow-purple" : "text-gray-400"
              }`}>
                {isMuted ? "🔇 MUTED" :
                 voiceAgentState === 'LISTENING' ? "🎙️ LISTENING..." :
                 voiceAgentState === 'THINKING' ? "⚡ THINKING..." :
                 voiceAgentState === 'SPEAKING' ? "🔊 SPEAKING..." : "💤 IDLE"}
              </h4>
              <p className={`text-[10px] font-semibold tracking-wide transition-all ${
                isMuted ? "text-red-400/80 animate-pulse" :
                voiceAgentState === 'THINKING' ? "text-emerald-400/95" :
                voiceAgentState === 'SPEAKING' ? "text-purple-400/80" : "text-muted-foreground/60"
              }`}>
                {getVoiceSubStatus()}
              </p>
            </div>

            {/* Bouncing Audio Visualizer */}
            {(voiceAgentState === 'LISTENING' || voiceAgentState === 'SPEAKING') && (
              <div className="flex items-center gap-1.5 justify-center h-10 mt-6 overflow-hidden">
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
                  { delay: '0.3s', h: 'h-8' },
                  { delay: '0.5s', h: 'h-10' },
                  { delay: '0.2s', h: 'h-7' },
                  { delay: '0.4s', h: 'h-5' }
                ].map((bar, i) => (
                  <div 
                    key={i} 
                    className={`w-1.5 ${bar.h} rounded-full animate-bounce-bar ${
                      voiceAgentState === 'LISTENING' ? "bg-primary glow-primary" : "bg-purple-500 glow-purple"
                    }`} 
                    style={{ animationDelay: bar.delay }} 
                  />
                ))}
              </div>
            )}

            {/* Settings Customizer */}
            <div className="w-full border-t border-border/20 mt-10 pt-6 space-y-4 text-left">
              <span className="block text-[8px] font-black uppercase text-gray-500 tracking-widest">Voice customizer settings</span>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 flex flex-col">
                  <label className="text-[9px] font-extrabold text-gray-400 uppercase">Voice Persona</label>
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

              <div className="p-3 bg-secondary/15 rounded-xl border border-border/20 text-center mt-4">
                <p className="text-[9px] text-gray-500 leading-relaxed font-medium">
                  💡 Speak naturally to check dashboards, create tasks, or query profiles.<br />
                  Say <b className="text-gray-300">"Exit voice mode"</b> or <b className="text-gray-300">"Goodbye"</b> to close.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
