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
  MicOff
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AssistantPage() {
  const { token, user: currentUser } = useAuth();

  // Voice Input Speech Recognition States
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState("en-US");
  const recognitionRef = useRef<any>(null);

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
      const res = await fetch("http://localhost:3001/ai/sessions", {
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
      const res = await fetch(`http://localhost:3001/ai/sessions/${sessionId}`, {
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
      const res = await fetch("http://localhost:3001/ai/sessions", {
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
      const res = await fetch(`http://localhost:3001/ai/sessions/${sessionId}`, {
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
      const res = await fetch("http://localhost:3001/ai/documents", {
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
      const response = await fetch("http://localhost:3001/ai/chat", {
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
      const res = await fetch("http://localhost:3001/ai/documents/upload", {
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
      const res = await fetch("http://localhost:3001/ai/documents/upload", {
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
      const res = await fetch(`http://localhost:3001/ai/documents/${id}`, {
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
                                  <div key={prop.id} className="w-64 flex-shrink-0 glass rounded-2xl border border-border/80 overflow-hidden flex flex-col shadow-lg bg-card/45">
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
                                  <div key={client.id} className="w-56 flex-shrink-0 glass rounded-2xl border border-border/80 p-3 bg-card/45 flex flex-col justify-between text-left space-y-2">
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
                                        {isVirtual && meeting.location && (
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
            {/* Language Switcher Pill */}
            <button
              type="button"
              disabled={isLoadingChat || isListening}
              onClick={() => {
                setSpeechLang((prev) => {
                  if (prev === "en-US") return "ur-PK";
                  if (prev === "ur-PK") return "en-NG";
                  return "en-US";
                });
              }}
              className="px-3 py-2.5 bg-secondary/50 hover:bg-secondary border border-border/60 rounded-xl text-[10px] font-bold text-gray-300 hover:text-white flex items-center gap-1.5 transition-all select-none cursor-pointer disabled:opacity-50 flex-shrink-0"
              title="Click to toggle speaking language"
            >
              {speechLang === "en-US" && <span>🇺🇸 EN</span>}
              {speechLang === "ur-PK" && <span>🇵🇰 UR</span>}
              {speechLang === "en-NG" && <span>🇳🇬 NG</span>}
            </button>

            <input
              type="text"
              required
              disabled={isLoadingChat}
              placeholder={
                isListening
                  ? `Listening in ${
                      speechLang === "en-US" ? "English (US)" : speechLang === "ur-PK" ? "Urdu (Urdu script)" : "Nigerian English"
                    }... Speak now!`
                  : "Ask documents (RAG) or query live ERP Postgres tables..."
              }
              className="flex-1 glass-input pl-4.5 pr-4.5 py-3.5 rounded-2xl text-xs bg-secondary border border-border/60 outline-none text-white focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground/45"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
            />

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
    </div>
  );
}
