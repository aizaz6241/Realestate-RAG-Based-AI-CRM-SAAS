"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  UserCircle, 
  CheckSquare, 
  LogOut, 
  Menu,
  X,
  Target,
  Loader2,
  Handshake,
  Folder,
  Truck,
  ShieldAlert,
  MessageSquare,
  Calendar,
  Bell,
  Bot,
  Send,
  ChevronRight,
  AlertCircle,
  Wallet,
  Mic,
  MicOff
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEffect } from "react";

// Strict Role-Based Permission Matrix Mapping
const isRouteAllowed = (href: string, role: string, userId?: string) => {
  // Dashboard, Tasks, Chat, Calendar, and the employee's own profile are universally accessible to all roles
  if (
    href === "/dashboard" || 
    href === "/tasks" || 
    href === "/chat" || 
    href === "/calendar" ||
    href === "/assistant" ||
    (userId && href === `/employees/${userId}`)
  ) {
    return true;
  }

  switch (href) {
    case "/properties":
      return ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER", "AGENT", "RECEPTIONIST", "VIEWER"].includes(role);
    case "/owners":
      return ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER", "AGENT"].includes(role);
    case "/clients":
      return ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER", "AGENT", "RECEPTIONIST"].includes(role);
    case "/leads":
      return ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER", "AGENT"].includes(role);
    case "/employees":
      return ["SUPER_ADMIN", "ADMIN", "HR"].includes(role);
    case "/documents":
      return ["SUPER_ADMIN", "ADMIN", "HR", "FINANCE", "SALES_MANAGER", "AGENT"].includes(role);
    case "/logistics":
      return ["SUPER_ADMIN", "ADMIN", "LOGISTICS", "SALES_MANAGER", "AGENT"].includes(role);
    case "/finance":
      return ["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(role);
    default:
      return true;
  }
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  // Notifications State
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [systemRoomId, setSystemRoomId] = useState<string | null>(null);

  // Header Calendar dropdown states
  const [isHeaderCalOpen, setIsHeaderCalOpen] = useState(false);
  const [layoutEvents, setLayoutEvents] = useState<any[]>([]);

  // Mini-Chat State
  const [isMiniChatOpen, setIsMiniChatOpen] = useState(false);
  const [miniRooms, setMiniRooms] = useState<any[]>([]);
  const [miniActiveRoom, setMiniActiveRoom] = useState<any>(null);
  const [miniMessages, setMiniMessages] = useState<any[]>([]);
  const [miniNewMsg, setMiniNewMsg] = useState("");
  const [miniIsSending, setMiniIsSending] = useState(false);
  const [miniTab, setMiniTab] = useState("all"); // all, direct, system, ai
  const miniMessagesEndRef = React.useRef<HTMLDivElement>(null);

  // Floating AI Chat State variables
  const [aiMessages, setAiMessages] = useState<any[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);

  // Voice Input Speech Recognition States for Unified Floating AI Chat
  const [aiIsListening, setAiIsListening] = useState(false);
  const [aiSpeechLang, setAiSpeechLang] = useState("en-US");
  const aiRecognitionRef = React.useRef<any>(null);

  // Web Speech API: Toggle Listening for Floating Assistant
  const toggleAiListening = () => {
    if (aiIsListening) {
      if (aiRecognitionRef.current) {
        aiRecognitionRef.current.stop();
      }
      setAiIsListening(false);
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
    recognition.lang = aiSpeechLang;

    recognition.onstart = () => {
      setAiIsListening(true);
    };

    recognition.onend = () => {
      setAiIsListening(false);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setAiIsListening(false);
      if (event.error === "not-allowed") {
        alert("🔒 Microphone access is blocked. Please enable microphone permissions in your browser settings!");
      }
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        setAiInput((prev) => {
          const spacing = prev.trim() === "" ? "" : " ";
          return prev + spacing + transcript;
        });
      }
    };

    aiRecognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => {
    return () => {
      if (aiRecognitionRef.current) {
        aiRecognitionRef.current.stop();
      }
    };
  }, []);

  const initFloatingAiSession = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const sessionsData = await res.json();
        let targetSession = sessionsData.find((s: any) => s.title === "Unified Floating Chat" || s.title === "New Conversation");
        if (!targetSession && sessionsData.length > 0) {
          targetSession = sessionsData[0];
        }

        if (targetSession) {
          setAiSessionId(targetSession.id);
          const detailsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/sessions/${targetSession.id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (detailsRes.ok) {
            const data = await detailsRes.json();
            if (data.messages && data.messages.length > 0) {
              setAiMessages(data.messages);
            } else {
              setAiMessages([
                {
                  id: "welcome-float",
                  role: "model",
                  content: "🤖 Salam! Main aapka RENS ERP Intelligent AI Assistant hoon. Main aapke corporate documents (RAG) se sawal-jawab kar sakta hoon aur live database ko query kar sakta hoon.\n\nKuch puchna chahenge?",
                  createdAt: new Date().toISOString(),
                }
              ]);
            }
          }
        } else {
          const createRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/sessions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ title: "Unified Floating Chat" })
          });
          if (createRes.ok) {
            const newSession = await createRes.json();
            setAiSessionId(newSession.id);
            setAiMessages([
              {
                id: "welcome-float",
                role: "model",
                content: "🤖 Salam! Main aapka RENS ERP Intelligent AI Assistant hoon. Main aapke corporate documents (RAG) se sawal-jawab kar sakta hoon aur live database ko query kar sakta hoon.\n\nKuch puchna chahenge?",
                createdAt: new Date().toISOString(),
              }
            ]);
          }
        }
      }
    } catch (e) {
      console.error("Failed to initialize floating AI session:", e);
    }
  };

  useEffect(() => {
    if (token) {
      initFloatingAiSession();
    }
  }, [token]);

  const executeFloatingAiQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || !token || aiIsLoading || !aiSessionId) return;

    const queryText = aiInput;
    setAiInput("");

    const userMsg = {
      id: `ai-user-${Date.now()}`,
      role: "user",
      content: queryText,
      createdAt: new Date().toISOString(),
    };

    setAiMessages(prev => [...prev, userMsg]);
    setAiIsLoading(true);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: queryText,
          sessionId: aiSessionId
        })
      });

      if (response.ok) {
        const data = await response.json();
        const modelMsg = {
          id: `ai-model-${Date.now()}`,
          role: "model",
          content: data.response,
          toolExecuted: data.toolExecuted,
          toolData: data.toolData,
          citations: data.citations,
          createdAt: new Date().toISOString(),
        };
        setAiMessages(prev => [...prev, modelMsg]);
      } else {
        throw new Error("AI query failed");
      }
    } catch (err) {
      console.error(err);
      setAiMessages(prev => [...prev, {
        id: `ai-err-${Date.now()}`,
        role: "model",
        content: "🤖 System Alert: RENS AI is currently experiencing API connection delays. Please verify your keys and network status.",
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setAiIsLoading(false);
    }
  };

  // Load notifications from local storage / system logs
  const fetchLayoutNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/chat/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const roomsData = await res.json();
      setMiniRooms(roomsData);

      const sysRoom = roomsData.find((r: any) => r.isSystem);
      if (sysRoom) {
        setSystemRoomId(sysRoom.id);
        const msgRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/chat/rooms/${sysRoom.id}/messages`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (msgRes.ok) {
          const messagesData = await msgRes.json();
          const sorted = [...messagesData].reverse();
          setNotifications(sorted.slice(0, 8)); // Top 8 recent alerts

          const lastViewedStr = localStorage.getItem("rens_notifications_last_viewed");
          const lastViewed = lastViewedStr ? new Date(lastViewedStr) : new Date(0);
          
          const newAlerts = messagesData.filter((m: any) => new Date(m.createdAt) > lastViewed);
          setUnreadNotifCount(newAlerts.length);
        }
      }

      // Fetch calendar events
      const evRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (evRes.ok) {
        setLayoutEvents(await evRes.json());
      }
    } catch (err) {
      console.error("Failed to load layout notifications:", err);
    }
  };

  // Poll layouts endpoints every 2.5 seconds
  useEffect(() => {
    if (!token) return;
    fetchLayoutNotifications();
    const interval = setInterval(fetchLayoutNotifications, 2500);
    return () => clearInterval(interval);
  }, [token]);

  // Load mini chat messages when active room changes
  const fetchMiniMessages = async () => {
    if (!token || !miniActiveRoom) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/chat/rooms/${miniActiveRoom.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setMiniMessages(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (miniActiveRoom) {
      fetchMiniMessages();
    }
  }, [miniActiveRoom]);

  // Fast poll for active mini-room messages
  useEffect(() => {
    if (!token || !miniActiveRoom) return;
    const interval = setInterval(fetchMiniMessages, 1500);
    return () => clearInterval(interval);
  }, [token, miniActiveRoom]);

  // Scroll mini-messages feed
  useEffect(() => {
    miniMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [miniMessages]);

  // Send message in mini chat
  const handleMiniSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!miniNewMsg.trim() || !miniActiveRoom) return;
    
    const textToSend = miniNewMsg;
    setMiniNewMsg("");

    const optMsg = {
      id: `mini-temp-${Date.now()}`,
      content: textToSend,
      createdAt: new Date().toISOString(),
      senderId: user?.id,
      sender: { id: user?.id, firstName: user?.firstName || user?.email?.split("@")[0] || "Me", role: user?.role }
    };
    setMiniMessages(prev => [...prev, optMsg]);

    setMiniIsSending(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/chat/rooms/${miniActiveRoom.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: textToSend })
      });
      if (res.ok) {
        fetchMiniMessages();
        fetchLayoutNotifications();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMiniIsSending(false);
    }
  };

  const getMicroDaysInMonth = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const prevMonthDays = new Date(year, month, 0).getDate();
    const fillPrevDays = [];
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      fillPrevDays.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }
    
    const currentDays = [];
    for (let i = 1; i <= totalDays; i++) {
      currentDays.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }
    
    const totalBlocks = 35;
    const actualBlocks = (fillPrevDays.length + currentDays.length) > 35 ? 42 : 35;
    const finalNextCount = actualBlocks - (fillPrevDays.length + currentDays.length);
    const fillNextDays = [];

    for (let i = 1; i <= finalNextCount; i++) {
      fillNextDays.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }
    
    return [...fillPrevDays, ...currentDays, ...fillNextDays];
  };

  useEffect(() => {
    if (!isLoading && !token) {
      router.push("/login");
    }
  }, [token, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        {/* Neon blur background */}
        <div className="absolute top-[30%] left-[30%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary glow-primary" />
          <p className="text-xs font-black tracking-widest text-primary/70 uppercase">Verifying Session...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return null; // Prevents layout flashing while redirecting
  }

  const userRole = user?.role || "AGENT";

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "My Profile", href: `/employees/${user?.id || ""}`, icon: UserCircle },
    { name: "Properties", href: "/properties", icon: Building2 },
    { name: "Owners & Sellers", href: "/owners", icon: Handshake },
    { name: "Buyers & Tenants CRM", href: "/clients", icon: Users },
    { name: "Leads CRM", href: "/leads", icon: Target },
    { name: "Employees", href: "/employees", icon: Users },
    { name: "Finance Management", href: "/finance", icon: Wallet },
    { name: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Calendar Terminal", href: "/calendar", icon: Calendar },
    { name: "Documents Vault", href: "/documents", icon: Folder },
    { name: "Operations & Logistics", href: "/logistics", icon: Truck },
    { name: "Chat Terminal", href: "/chat", icon: MessageSquare },
    { name: "AI Chat Assistant", href: "/assistant", icon: Bot },
  ];

  // Dynamic filtration of sidebar links
  const allowedNavigation = navigation.filter(item => isRouteAllowed(item.href, userRole, user?.id));

  // Dynamic Route Protection Interception check
  const isEmployeeDetail = pathname.startsWith("/employees/");
  const employeeId = isEmployeeDetail ? pathname.split("/employees/")[1] : null;
  const isSelf = employeeId && user?.id && employeeId === user.id;

  const currentNavItem = navigation.find(item => pathname.startsWith(item.href));
  const isCurrentAllowed = isSelf ? true : (currentNavItem ? isRouteAllowed(currentNavItem.href, userRole, user?.id) : true);

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {!isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(true)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed lg:static inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out border-r border-border bg-card/80 backdrop-blur-xl flex flex-col ${
          isSidebarOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-20"
        }`}
      >
        {/* Logo Area */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-border">
          <div className={`font-bold text-gradient text-xl whitespace-nowrap overflow-hidden transition-all ${!isSidebarOpen && "lg:opacity-0"}`}>
            RENS ERP
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden text-muted-foreground hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation Links filtered by security clearance */}
        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-2">
          {allowedNavigation.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <a
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
                title={!isSidebarOpen ? item.name : ""}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full glow-primary"></div>}
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? "text-primary" : "text-gray-400 group-hover:text-white"}`} />
                <span className={`font-medium whitespace-nowrap transition-all ${!isSidebarOpen && "lg:hidden"}`}>
                  {item.name}
                </span>
              </a>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div className="p-4 border-t border-border">
          <div className={`flex items-center gap-3 mb-4 px-2 ${!isSidebarOpen && "lg:hidden"}`}>
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user?.email?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold truncate">{user?.email || "Admin User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.role || "ADMIN"}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className={`flex items-center gap-3 px-3 py-3 w-full rounded-xl text-red-400 hover:bg-red-500/10 transition-colors ${!isSidebarOpen && "lg:justify-center"}`}
            title={!isSidebarOpen ? "Logout" : ""}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className={`font-medium whitespace-nowrap ${!isSidebarOpen && "lg:hidden"}`}>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card/50 backdrop-blur-md z-30">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-muted-foreground hover:text-white transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-4 relative">
              {/* Topbar Calendar Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setIsHeaderCalOpen(!isHeaderCalOpen)}
                  className="relative p-2.5 text-gray-400 hover:text-white hover:bg-secondary/40 rounded-xl transition-all duration-200 cursor-pointer"
                  title="Quick Calendar"
                >
                  <Calendar className="w-5 h-5" />
                  {layoutEvents.filter(e => {
                    const d = new Date(e.startTime);
                    const today = new Date();
                    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                  }).length > 0 && (
                    <span className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_6px_var(--primary)]"></span>
                  )}
                </button>

                {/* Topbar Micro-Calendar Dropdown Cabinet */}
                {isHeaderCalOpen && (
                  <div className="absolute right-0 mt-3 w-80 bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-2xl z-50 animate-fade-in text-left p-4">
                    <div className="flex justify-between items-center border-b border-border/40 pb-2 mb-3">
                      <h4 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-primary glow-primary" />
                        Quick Calendar
                      </h4>
                      <Link 
                        href="/calendar"
                        onClick={() => setIsHeaderCalOpen(false)}
                        className="text-[9px] font-black uppercase tracking-wider text-primary hover:text-white transition-all"
                      >
                        Terminal View →
                      </Link>
                    </div>

                    {/* Micro Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, index) => (
                        <span key={index} className="text-[9px] font-black text-muted-foreground uppercase">{d}</span>
                      ))}
                      {getMicroDaysInMonth().map(({ date, isCurrentMonth }, idx) => {
                        const dayEvents = layoutEvents.filter(event => {
                          const evStart = new Date(event.startTime);
                          return evStart.getDate() === date.getDate() && evStart.getMonth() === date.getMonth() && evStart.getFullYear() === date.getFullYear();
                        });

                        const isToday = new Date().toDateString() === date.toDateString();

                        return (
                          <div 
                            key={idx}
                            className={`p-1 flex flex-col items-center justify-between rounded-lg min-h-[38px] transition-all ${
                              isCurrentMonth ? "bg-secondary/15 hover:bg-secondary/35 text-white" : "opacity-25 pointer-events-none"
                            } ${isToday ? "border border-primary bg-primary/10 text-white" : "border border-transparent"}`}
                          >
                            <span className="text-[10px] font-bold">{date.getDate()}</span>
                            {/* Color Dots */}
                            <div className="flex gap-0.5 justify-center mt-0.5 max-w-[32px] overflow-hidden flex-wrap">
                              {dayEvents.slice(0, 3).map(e => {
                                const dotColor = 
                                  e.color === "green" ? "bg-emerald-500" :
                                  e.color === "yellow" ? "bg-amber-500" :
                                  e.color === "purple" ? "bg-purple-500" : "bg-blue-500";
                                return (
                                  <span key={e.id} className={`w-1 h-1 rounded-full ${dotColor}`}></span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Notification Bell Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => {
                    setIsNotifOpen(!isNotifOpen);
                    // Mark notifications as read when opening
                    if (!isNotifOpen) {
                      localStorage.setItem("rens_notifications_last_viewed", new Date().toISOString());
                      setUnreadNotifCount(0);
                    }
                  }}
                  className="relative p-2.5 text-gray-400 hover:text-white hover:bg-secondary/40 rounded-xl transition-all duration-200 cursor-pointer"
                  title="Notifications Desk"
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotifCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping shadow-[0_0_8px_#ef4444]"></span>
                  )}
                  {unreadNotifCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]"></span>
                  )}
                </button>

                {/* Glassmorphic Dropdown Drawer */}
                {isNotifOpen && (
                  <div className="absolute right-0 mt-3 w-80 bg-card border border-border/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-2xl z-50 animate-fade-in text-left">
                    <div className="p-4 border-b border-border/40 flex justify-between items-center bg-secondary/15">
                      <h4 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-2">
                        <Bell className="w-3.5 h-3.5 text-primary glow-primary" />
                        Notifications Terminal
                      </h4>
                      <button 
                        onClick={() => {
                          localStorage.setItem("rens_notifications_last_viewed", new Date().toISOString());
                          setUnreadNotifCount(0);
                          setIsNotifOpen(false);
                        }}
                        className="text-[9px] font-black uppercase tracking-wider text-primary hover:text-primary/80 transition-colors cursor-pointer"
                      >
                        Clear Badge
                      </button>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto divide-y divide-border/20 py-1.5 scrollbar-thin">
                      {notifications.length === 0 ? (
                        <p className="text-[10px] text-center text-muted-foreground italic py-8">No alerts registered in this session.</p>
                      ) : (
                        notifications.map(notif => {
                          // Extract icon and color based on notification type
                          let IconComponent = Bot;
                          let colorClass = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                          
                          if (notif.content.includes("Task")) {
                            IconComponent = CheckSquare;
                            colorClass = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                          } else if (notif.content.includes("Meeting") || notif.content.includes("scheduled")) {
                            IconComponent = Calendar;
                            colorClass = "text-blue-400 bg-blue-500/10 border-blue-500/20";
                          } else if (notif.content.includes("Logistics") || notif.content.includes("transit")) {
                            IconComponent = Truck;
                            colorClass = "text-purple-400 bg-purple-500/10 border-purple-500/20";
                          }

                          return (
                            <div 
                              key={notif.id}
                              className="p-3 hover:bg-secondary/20 transition-all flex gap-3 text-xs leading-relaxed"
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 mt-0.5 ${colorClass}`}>
                                <IconComponent className="w-4 h-4" />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-gray-200 font-medium">{notif.content}</p>
                                <span className="block text-[8px] text-gray-500 font-black uppercase tracking-wider">
                                  {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(notif.createdAt).toLocaleDateString([], { dateStyle: 'short' })}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="p-2 border-t border-border/40 text-center bg-secondary/10">
                      <Link 
                        href="/chat"
                        onClick={() => setIsNotifOpen(false)}
                        className="text-[9px] font-black uppercase text-primary hover:text-white transition-all tracking-widest block w-full py-1.5"
                      >
                        Open Chat Drawer
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

        {/* Page Content with dynamic role interception */}
        <div className="flex-1 overflow-y-auto">
          {isCurrentAllowed ? (
            children
          ) : (
            <div className="min-h-[70vh] flex items-center justify-center p-8 relative overflow-hidden">
              {/* Glow indicators */}
              <div className="absolute top-[35%] left-[35%] w-[350px] h-[350px] bg-red-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
              
              <div className="glass max-w-lg w-full rounded-3xl p-8 border border-red-500/20 shadow-2xl text-center space-y-6 animate-fade-in relative z-10">
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-500 mx-auto shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                  <ShieldAlert className="w-8 h-8 animate-pulse" />
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-white uppercase tracking-wider">Access Clearance Level Required</h2>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Your current credentials as a <strong className="text-red-400 font-extrabold uppercase tracking-wider">{userRole}</strong> do not possess security clearance to access <strong className="text-white font-extrabold">{currentNavItem?.name || "this directory"}</strong> database archives.
                  </p>
                </div>
                
                <div className="pt-4 border-t border-border/40">
                  <Link 
                    href="/dashboard" 
                    className="px-5 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold inline-block text-xs uppercase tracking-widest glow-primary transition-all duration-300 hover:scale-[1.02]"
                  >
                    Back to Terminal Dashboard
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Floating Mini-Chat Button (Bottom Right, as requested) */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsMiniChatOpen(!isMiniChatOpen)}
          className="w-14 h-14 bg-primary/20 border border-primary/30 hover:bg-primary text-white rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 active:scale-95 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] relative"
          title="Mini Chat Cabinet"
        >
          <MessageSquare className="w-6 h-6 animate-pulse" />
          {unreadNotifCount > 0 && (
            <span className="absolute top-1 left-1 w-3.5 h-3.5 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444] border-2 border-background"></span>
          )}
        </button>
      </div>

      {/* Floating Mini-Chat Cabinet Window Overlay */}
      {isMiniChatOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[420px] h-[550px] bg-card border border-border/80 shadow-2xl rounded-3xl flex flex-col backdrop-blur-2xl animate-slide-in text-left overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-border/40 bg-secondary/20 flex justify-between items-center flex-shrink-0">
            {miniTab === "ai" ? (
              <span className="font-black text-xs uppercase tracking-wider text-white flex items-center gap-1.5 animate-pulse">
                <Bot className="w-4 h-4 text-primary glow-primary" />
                RENS AI Assistant
              </span>
            ) : miniActiveRoom ? (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setMiniActiveRoom(null);
                    setMiniMessages([]);
                  }}
                  className="text-primary hover:text-white font-extrabold text-[10px] uppercase tracking-wider bg-secondary/50 border border-border/40 px-2 py-0.5 rounded cursor-pointer"
                >
                  ← Back
                </button>
                <span className="font-extrabold text-xs text-white truncate max-w-[150px]">
                  {miniActiveRoom.isSystem ? "System Bot" : miniActiveRoom.isGroup ? "General Chat" : 
                    miniActiveRoom.members?.find((m: any) => m.id !== user?.id)?.firstName || "Direct Chat"}
                </span>
              </div>
            ) : (
              <span className="font-black text-xs uppercase tracking-wider text-white flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-primary" />
                Mini RENS Chat
              </span>
            )}
            <button 
              onClick={() => setIsMiniChatOpen(false)}
              className="text-muted-foreground hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mini-Chat Body content */}
          {miniTab === "ai" ? (
            /* Floating AI Chat Dialogue View */
            <div className="flex-1 flex flex-col justify-between overflow-hidden bg-card/10">
              {/* Scrolling messages feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                {aiMessages.length === 0 ? (
                  <p className="text-[10px] text-center text-muted-foreground italic py-10">
                    🤖 Salam! Main aapka RENS ERP Intelligent AI Assistant hoon. Kuch poochhna chahenge?
                  </p>
                ) : (
                  aiMessages.map((msg, index) => {
                    const isUser = msg.role === "user";
                    return (
                      <div 
                        key={msg.id || index}
                        className={`flex flex-col gap-0.5 max-w-[85%] text-[11px] leading-relaxed ${
                          isUser ? "ml-auto text-right items-end" : "mr-auto text-left"
                        }`}
                      >
                        {!isUser && (
                          <span className="block text-[8px] text-gray-500 font-bold uppercase tracking-wide">
                            RENS Cognitive Core
                          </span>
                        )}
                        <div className={`p-3 rounded-2xl border text-[10.5px] whitespace-pre-wrap shadow-md ${
                          isUser 
                            ? "bg-primary/20 border-primary/30 text-white rounded-tr-none shadow-[0_0_12px_rgba(6,182,212,0.05)]" 
                            : "bg-card border-border/50 text-gray-200 rounded-tl-none"
                        }`}>
                          <p className="font-medium">{msg.content}</p>
                          <span className="block text-[7px] text-gray-500 font-bold mt-1">
                            {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                {aiIsLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground pl-2 select-none animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary glow-primary" />
                    <span>AI calculations in progress...</span>
                  </div>
                )}
              </div>

              {/* Input Form */}
              <form 
                onSubmit={executeFloatingAiQuery}
                className="p-3 border-t border-border/40 bg-secondary/15 flex gap-2 items-center flex-shrink-0"
              >
                {/* Language Switcher Pill */}
                <button
                  type="button"
                  disabled={aiIsLoading || aiIsListening}
                  onClick={() => {
                    setAiSpeechLang((prev) => {
                      if (prev === "en-US") return "ur-PK";
                      if (prev === "ur-PK") return "en-NG";
                      return "en-US";
                    });
                  }}
                  className="px-2 py-2 bg-secondary/50 hover:bg-secondary border border-border/60 rounded-xl text-[9px] font-bold text-gray-300 hover:text-white flex items-center gap-1 transition-all select-none cursor-pointer disabled:opacity-50 flex-shrink-0"
                  title="Click to toggle speaking language"
                >
                  {aiSpeechLang === "en-US" && <span>🇺🇸 EN</span>}
                  {aiSpeechLang === "ur-PK" && <span>🇵🇰 UR</span>}
                  {aiSpeechLang === "en-NG" && <span>🇳🇬 NG</span>}
                </button>

                <input 
                  type="text"
                  required
                  disabled={aiIsLoading}
                  placeholder={
                    aiIsListening
                      ? `Listening (${
                          aiSpeechLang === "en-US" ? "EN" : aiSpeechLang === "ur-PK" ? "UR" : "NG"
                        })...`
                      : "Ask RENS AI Assistant..."
                  }
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  className="flex-1 bg-secondary/40 border border-border/60 outline-none text-[11px] px-3.5 py-2.5 rounded-xl text-white focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/45"
                />

                {/* Microphone Button */}
                <button
                  type="button"
                  disabled={aiIsLoading}
                  onClick={toggleAiListening}
                  className={`p-2.5 rounded-xl border flex items-center justify-center flex-shrink-0 transition-all duration-300 active:scale-95 cursor-pointer ${
                    aiIsListening
                      ? "bg-red-500/20 border-red-500/60 text-red-400 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                      : "bg-secondary/40 border-border/60 text-gray-400 hover:text-white hover:border-border/80"
                  }`}
                  title={aiIsListening ? "Stop listening" : "Start voice input"}
                >
                  {aiIsListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <button 
                  type="submit"
                  disabled={aiIsLoading || !aiInput.trim()}
                  className="bg-primary hover:bg-primary/90 text-white p-2.5 rounded-xl flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          ) : miniActiveRoom ? (
            /* Message Logs View */
            <div className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 scrollbar-thin">
                {miniMessages.length === 0 ? (
                  <p className="text-[10px] text-center text-muted-foreground italic py-10">No messages in feed.</p>
                ) : (
                  miniMessages.map(msg => {
                    const isSelf = msg.senderId === user?.id;
                    const isSystemAlert = msg.isSystem || msg.isSystem === "true";
                    
                    if (isSystemAlert) {
                      return (
                        <div key={msg.id} className="p-2 border border-amber-500/20 bg-amber-500/5 text-amber-400 text-[10px] rounded-xl text-left leading-relaxed">
                          ⚠️ <span className="font-bold text-[9px] uppercase">System:</span> {msg.content}
                        </div>
                      );
                    }

                    return (
                      <div 
                        key={msg.id}
                        className={`flex flex-col gap-0.5 max-w-[85%] text-[11px] leading-relaxed ${isSelf ? "ml-auto text-right items-end" : "mr-auto text-left"}`}
                      >
                        {!isSelf && (
                          <span className="block text-[8px] text-gray-500 font-bold uppercase tracking-wide">
                            {msg.sender?.firstName}
                          </span>
                        )}
                        <div className={`p-2.5 rounded-xl border ${
                          isSelf 
                            ? "bg-primary/20 border-primary/30 text-white rounded-tr-none" 
                            : "bg-secondary/40 border-border/40 text-gray-200 rounded-tl-none"
                        }`}>
                          <p className="font-medium whitespace-pre-wrap">{msg.content}</p>
                          <span className="block text-[7px] text-gray-500 font-bold mt-1">
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={miniMessagesEndRef} />
              </div>

              {/* Message Input box */}
              {miniActiveRoom.isSystem ? (
                <div className="p-2 border-t border-border/40 bg-secondary/5 text-center text-[9px] text-muted-foreground select-none">
                  🤖 Bot logs are read-only.
                </div>
              ) : (
                <form 
                  onSubmit={handleMiniSend}
                  className="p-2 border-t border-border/40 bg-secondary/15 flex gap-2 items-center"
                >
                  <input 
                    type="text"
                    required
                    placeholder="Type message..."
                    value={miniNewMsg}
                    onChange={(e) => setMiniNewMsg(e.target.value)}
                    className="flex-1 bg-secondary/40 border border-border/60 outline-none text-[11px] px-3 py-1.5 rounded-xl text-white focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
                  />
                  <button 
                    type="submit"
                    disabled={miniIsSending || !miniNewMsg.trim()}
                    className="bg-primary hover:bg-primary/90 text-white p-2 rounded-xl flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* Rooms List View */
            <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
              {/* Mini Rooms Tab filters */}
              <div className="flex border-b border-border/20 pb-2 mb-2 gap-1 text-[8px] font-black uppercase tracking-wider select-none flex-wrap">
                {["all", "direct", "system", "ai"].map(t => (
                  <button 
                    key={t}
                    onClick={() => {
                      setMiniTab(t);
                      if (t === "ai") {
                        setMiniActiveRoom(null);
                        setMiniMessages([]);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer font-bold ${
                      miniTab === t 
                        ? "bg-primary/20 border-primary/30 text-primary glow-primary" 
                        : "bg-secondary/40 border-border/30 text-muted-foreground hover:text-white"
                    }`}
                  >
                    {t === "ai" ? "🤖 RENS AI" : t}
                  </button>
                ))}
              </div>

              {miniRooms
                .filter(r => {
                  if (miniTab === "direct" && (r.isGroup || r.isSystem)) return false;
                  if (miniTab === "system" && !r.isSystem) return false;
                  return true;
                })
                .map(room => {
                  let displayName = room.name || "Conversation";
                  if (room.isSystem) displayName = "🤖 System Bot";
                  else if (!room.isGroup) {
                    const other = room.members?.find((m: any) => m.id !== user?.id);
                    displayName = other ? `👤 ${other.firstName} ${other.lastName || ''}` : "Direct Message";
                  } else {
                    displayName = `👥 ${room.name}`;
                  }

                  const lastMsg = room.messages?.[0]?.content || "No messages yet";

                  return (
                    <div 
                      key={room.id}
                      onClick={() => setMiniActiveRoom(room)}
                      className="p-3 rounded-2xl border border-border/20 hover:border-border/60 hover:bg-secondary/20 cursor-pointer flex justify-between items-center transition-all"
                    >
                      <div className="overflow-hidden flex-1 text-left">
                        <p className="text-[11px] font-black text-white truncate">{displayName}</p>
                        <p className="text-[9px] text-muted-foreground truncate mt-0.5">{lastMsg}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
