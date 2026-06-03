"use client";

import React, { useState, useEffect } from "react";
import { 
  Building2, 
  Users, 
  CheckSquare, 
  Target, 
  ArrowUpRight, 
  TrendingUp, 
  Sparkles, 
  Plus, 
  Clock,
  Calendar,
  ChevronRight,
  Bot,
  LogOut,
  Check,
  Loader2,
  X,
  ShieldAlert,
  AlertTriangle,
  Play,
  ArrowRight,
  Lightbulb
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { token, user } = useAuth();
  
  // States
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Attendance & Shift counter states
  const [employeeProfile, setEmployeeProfile] = useState<any>(null);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [activeShiftDuration, setActiveShiftDuration] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Checkout Modal states
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutSummaryText, setCheckoutSummaryText] = useState("");

  // AI Operations Advisor states
  const [aiData, setAiData] = useState<any>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'loading' | 'error'>('success');

  // Fetch events for dashboard dots
  const fetchDashboardEvents = async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setEvents(await res.json());
      }
    } catch (err) {
      console.error("Failed to load dashboard events:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch logged-in user profile & attendance status
  const fetchAttendanceStatus = async () => {
    if (!token || !user?.id) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployeeProfile(data);
        
        // Find today's attendance (format: YYYY-MM-DD)
        const todayStr = new Date().toISOString().split("T")[0];
        const todayAtt = data.employeeProfile?.attendances?.find((a: any) => a.dateStr === todayStr);
        setTodayAttendance(todayAtt || null);
      }
    } catch (err) {
      console.error("Failed to load employee attendance in dashboard:", err);
    }
  };

  // Fetch dynamic AI dashboard intelligence
  const fetchDashboardIntelligence = async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setIsLoadingAi(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/dashboard-intelligence`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAiData(data);
      }
    } catch (err) {
      console.error("Failed to load dashboard AI intelligence:", err);
    } finally {
      setIsLoadingAi(false);
    }
  };

  // Agentic Action Execution through Chat API
  const handleExecuteAiAction = async (command: string) => {
    if (!token) return;
    setToastType('loading');
    setToastMessage(`Executing: "${command}"`);
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: command
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        let answer = data.response;
        // Parse the first direct answer block if it has a header, else fallback
        const directAnswerMatch = data.response.match(/🟢?\s*1\.\s*DIRECT\s*ANSWER\s*\(Assistant Mode\)\s*\n([\s\S]*?)(?:\n\n?\s*🧠|\n\n?\s*🧠|$)/i) ||
                                  data.response.match(/🟢?\s*1\.\s*DIRECT\s*ANSWER\s*\n([\s\S]*?)(?:\n\n?\s*🧠|\n\n?\s*🧠|$)/i);
        if (directAnswerMatch && directAnswerMatch[1]) {
          answer = directAnswerMatch[1].trim();
        }
        
        // Remove markdown formatting
        answer = answer.replace(/\*\*/g, "");
        if (answer.length > 200) {
          answer = answer.substring(0, 197) + "...";
        }
        
        setToastType('success');
        setToastMessage(answer);
        
        // Refresh all dashboards metrics dynamically
        fetchDashboardIntelligence(false);
        fetchAttendanceStatus();
        fetchDashboardEvents(false);
      } else {
        setToastType('error');
        setToastMessage("Execution failed. AI could not complete this request.");
      }
    } catch (err) {
      console.error(err);
      setToastType('error');
      setToastMessage("Network error during action execution.");
    }
  };

  useEffect(() => {
    fetchDashboardEvents(true);
    fetchAttendanceStatus();
    fetchDashboardIntelligence(true);
  }, [token, user?.id]);

  // Polling loop (every 3 seconds)
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetchDashboardEvents(false);
      fetchAttendanceStatus();
      fetchDashboardIntelligence(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [token, user?.id]);

  // Dynamic Shift Stopwatch counter loop (1 second tick)
  useEffect(() => {
    if (!todayAttendance || !todayAttendance.checkIn || todayAttendance.checkOut) {
      setActiveShiftDuration(0);
      return;
    }

    const calculateTime = () => {
      const start = new Date(todayAttendance.checkIn).getTime();
      const diff = Math.floor((Date.now() - start) / 1000);
      setActiveShiftDuration(diff > 0 ? diff : 0);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [todayAttendance]);

  // Formatting helpers for Shift Stopwatch
  const formatSeconds = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, "0")}h ${mins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
  };

  const getCompletedShiftDuration = (checkIn: string, checkOut: string) => {
    const diff = Math.floor((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 1000);
    return formatSeconds(diff > 0 ? diff : 0);
  };

  const getTodayStr = () => new Date().toISOString().split("T")[0];

  const handleDashboardCheckIn = async () => {
    if (!token || !user?.id) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${user.id}/attendance/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ dateStr: getTodayStr() })
      });
      if (res.ok) {
        fetchAttendanceStatus();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDashboardCheckOut = async (summaryText: string) => {
    if (!token || !user?.id) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${user.id}/attendance/check-out`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ dateStr: getTodayStr(), summary: summaryText })
      });
      if (res.ok) {
        setIsCheckoutOpen(false);
        setCheckoutSummaryText("");
        fetchAttendanceStatus();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate calendar grid days
  const getDashboardDaysInMonth = () => {
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

  // Filter today's items
  const getTodaysEvents = () => {
    const todayStr = new Date().toDateString();
    return events.filter(e => new Date(e.startTime).toDateString() === todayStr);
  };

  // Get monthly worked hours trend for personal dashboard
  const getMonthlyWorkedHoursData = () => {
    if (!employeeProfile?.employeeProfile?.attendances) return [];
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    return Array.from({ length: totalDays }, (_, i) => {
      const dayNum = i + 1;
      const dateStr = `${year}-${(month + 1).toString().padStart(2, "0")}-${dayNum.toString().padStart(2, "0")}`;
      
      const attendance = employeeProfile.employeeProfile.attendances.find((a: any) => a.dateStr === dateStr);
      let hours = 0;
      
      if (attendance && attendance.checkIn) {
        const start = new Date(attendance.checkIn).getTime();
        const end = attendance.checkOut ? new Date(attendance.checkOut).getTime() : Date.now();
        hours = Math.max(0, (end - start) / (1000 * 3600));
      }
      
      return {
        day: dayNum,
        hours: parseFloat(hours.toFixed(1))
      };
    });
  };

  // Get personal task status stats for personal dashboard
  const getPersonalTaskStats = () => {
    const tasks = employeeProfile?.assignedTasks || [];
    let completed = 0;
    let cancelled = 0;
    let delayed = 0;
    let pending = 0;
    
    const now = new Date();
    
    tasks.forEach((t: any) => {
      if (t.status === "COMPLETED") {
        completed++;
      } else if (t.status === "CANCELLED") {
        cancelled++;
      } else if (t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.dueDate && new Date(t.dueDate) < now) {
        delayed++;
      } else {
        pending++;
      }
    });
    
    return {
      completed,
      cancelled,
      delayed,
      pending,
      total: tasks.length
    };
  };

  const stats = [
    { 
      title: "Active Properties", 
      value: "24", 
      change: "+12.5%", 
      icon: Building2, 
      color: "text-cyan-400", 
      bg: "bg-cyan-500/10",
      border: "hover:border-cyan-500/30",
      shadow: "shadow-cyan-500/5"
    },
    { 
      title: "New Leads", 
      value: "12", 
      change: "+24.8%", 
      icon: Target, 
      color: "text-purple-400", 
      bg: "bg-purple-500/10",
      border: "hover:border-purple-500/30",
      shadow: "shadow-purple-500/5"
    },
    { 
      title: "Total Clients", 
      value: "145", 
      change: "+8.2%", 
      icon: Users, 
      color: "text-emerald-400", 
      bg: "bg-emerald-500/10",
      border: "hover:border-emerald-500/30",
      shadow: "shadow-emerald-500/5"
    },
    { 
      title: "Pending Tasks", 
      value: "8", 
      change: "-5.0%", 
      icon: CheckSquare, 
      color: "text-amber-400", 
      bg: "bg-amber-500/10",
      border: "hover:border-amber-500/30",
      shadow: "shadow-amber-500/5"
    },
  ];

  const recentLeads = [
    { name: "Zain Ali", email: "zain@email.com", status: "New", value: "Rs 45M", avatar: "Z" },
    { name: "Raza Khan", email: "raza@email.com", status: "Qualified", value: "Rs 120M", avatar: "R" },
    { name: "Ayesha Malik", email: "ayesha@email.com", status: "Won", value: "Rs 85M", avatar: "A" },
  ];

  const todaysSchedule = getTodaysEvents();

  return (
    <div className="p-8 animate-fade-in relative z-10 space-y-8">
      {/* Background Neon Blobs for Vibrancy */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">
            Welcome back, <span className="text-gradient font-black">{user?.firstName || 'Admin'}</span>! 👋
          </h1>
          <p className="text-muted-foreground mt-1">Here's a premium, high-level summary of your brokerage performance today.</p>
        </div>
        <div className="flex gap-3">
          <Link 
            href="/properties" 
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-95 text-white font-semibold flex items-center gap-2 glow-primary transition-all duration-300 hover:scale-[1.03]"
          >
            <Plus className="w-5 h-5" />
            New Listing
          </Link>
        </div>
      </div>

      {/* Shift Command Center Widget */}
      <div className="glass p-6 rounded-3xl border border-border/40 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 glow-primary">
        {/* Background micro-particles or gradients */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-transparent pointer-events-none"></div>
        
        {/* Left Side: Active Shift Status Details */}
        <div className="flex items-center gap-5 relative z-10 text-left w-full md:w-auto">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
            !todayAttendance ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]" :
            todayAttendance.checkOut ? "bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]" :
            "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-pulse"
          }`}>
            <Clock className="w-7 h-7" />
          </div>
          
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                !todayAttendance ? "bg-amber-500/15 border-amber-500/35 text-amber-400" :
                todayAttendance.checkOut ? "bg-purple-500/15 border-purple-500/35 text-purple-400" :
                "bg-emerald-500/15 border-emerald-500/35 text-emerald-400"
              }`}>
                {!todayAttendance ? "Shift Not Started" : todayAttendance.checkOut ? "Shift Completed" : "Active Shift"}
              </span>
              
              {todayAttendance && (
                <span className="text-[10px] text-muted-foreground font-semibold">
                  Clock In: {new Date(todayAttendance.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
            
            {todayAttendance?.checkoutSummary ? (
              <p className="text-xs text-gray-400 mt-1 max-w-lg italic line-clamp-1">
                &ldquo;{todayAttendance.checkoutSummary}&rdquo;
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                {!todayAttendance ? "You have not checked in for today's shift yet." :
                 todayAttendance.checkOut ? "Your shift details have been synced to the Monthly Register." :
                 "Your shift timer is active and running in real-time."}
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Stopwatch Display and Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-4 relative z-10 w-full md:w-auto justify-end">
          {/* Running Clock */}
          <div className="text-center sm:text-right min-w-[150px]">
            <div className={`text-3xl font-black font-mono tracking-tight transition-all duration-300 ${
              !todayAttendance ? "text-muted-foreground" :
              todayAttendance.checkOut ? "text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.3)]" :
              "text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]"
            }`}>
              {!todayAttendance ? "00h 00m 00s" :
               todayAttendance.checkOut ? getCompletedShiftDuration(todayAttendance.checkIn, todayAttendance.checkOut) :
               formatSeconds(activeShiftDuration)}
            </div>
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-black">
              Total Shift Duration
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5 w-full sm:w-auto font-sans">
            {!todayAttendance ? (
              <button
                onClick={handleDashboardCheckIn}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-white font-semibold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all duration-300 hover:scale-[1.03]"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
                Check In Shift
              </button>
            ) : !todayAttendance.checkOut ? (
              <button
                onClick={() => setIsCheckoutOpen(true)}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:opacity-95 text-white font-semibold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all duration-300 hover:scale-[1.03]"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                Check Out Shift
              </button>
            ) : (
              <div className="hidden sm:flex px-4 py-2.5 rounded-xl border border-purple-500/20 bg-purple-500/5 text-[10px] text-purple-400 uppercase font-black tracking-widest items-center gap-1.5">
                <Check className="w-4 h-4" /> Shift Logged
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Operations Advisor Panel */}
      {aiData && (
        <div className="glass p-6 rounded-3xl border border-primary/20 bg-primary/5 relative overflow-hidden flex flex-col gap-6 shadow-[0_0_30px_rgba(138,43,226,0.05)]">
          {/* Header */}
          <div className="flex justify-between items-center border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Bot className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm font-black tracking-widest uppercase text-white flex items-center gap-1.5">
                  Nexora Operations Advisor
                  <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">Augmented Real-Time Cognitive Analytics Core</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full text-[9px] font-bold text-primary tracking-wider uppercase">
              <Sparkles className="w-3 h-3 animate-spin-slow" />
              Continuous Learning Active
            </div>
          </div>

          {/* Body Content */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 text-left">
            
            {/* Column 1: AI KPI Snapshots */}
            <div className="space-y-3 lg:border-r lg:border-white/5 lg:pr-6">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                KPI Snapshots
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {aiData.kpis?.map((kpi: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{kpi.label}</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-lg font-black text-white">{kpi.value}</span>
                      <span className="text-[8px] font-bold text-cyan-400">{kpi.change}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Critical Priorities */}
            <div className="space-y-3 lg:border-r lg:border-white/5 lg:pr-6">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                <Target className="w-3.5 h-3.5 text-violet-400" />
                Critical Priorities
              </div>
              <div className="space-y-2.5">
                {aiData.priorities?.map((priority: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/10 flex flex-col gap-1.5">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[9px] font-bold text-violet-400 uppercase bg-violet-500/10 px-1.5 py-0.5 rounded leading-none">
                        Priority {idx + 1}
                      </span>
                      <h4 className="text-xs font-extrabold text-white leading-tight">{priority.title}</h4>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-normal">{priority.description}</p>
                    {priority.actionCommand && (
                      <button
                        onClick={() => handleExecuteAiAction(priority.actionCommand)}
                        className="w-full mt-1.5 py-1 px-2.5 rounded bg-violet-500/20 hover:bg-violet-500 text-[9px] font-black uppercase tracking-wider text-violet-300 hover:text-white transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Play className="w-2 h-2 fill-current" />
                        {priority.actionText || "Execute Action"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Column 3: Risk Alerts */}
            <div className="space-y-3 lg:border-r lg:border-white/5 lg:pr-6">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                Risk Audit
              </div>
              <div className="space-y-2.5">
                {aiData.risks?.map((risk: any, idx: number) => {
                  const isHigh = risk.level === "HIGH";
                  const isMedium = risk.level === "MEDIUM";
                  const levelColor = isHigh ? "text-rose-400 bg-rose-500/15 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.1)]" : 
                                     isMedium ? "text-amber-400 bg-amber-500/15 border-amber-500/30" : 
                                     "text-blue-400 bg-blue-500/15 border-blue-500/30";
                  return (
                    <div key={idx} className={`p-3 rounded-xl border flex flex-col gap-1.5 ${levelColor}`}>
                      <div className="flex items-center gap-1.5 justify-between">
                        <h4 className="text-xs font-extrabold text-white leading-tight">{risk.title}</h4>
                        <span className="text-[7px] font-black tracking-widest uppercase">{risk.level}</span>
                      </div>
                      <p className="text-[10px] text-gray-300 leading-normal">{risk.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 4: Opportunities */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                Growth Opportunities
              </div>
              <div className="space-y-2.5">
                {aiData.opportunities?.map((opp: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 flex flex-col gap-1.5">
                    <h4 className="text-xs font-extrabold text-white leading-tight flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
                      {opp.title}
                    </h4>
                    <p className="text-[10px] text-gray-400 leading-normal">{opp.description}</p>
                    {opp.actionCommand && (
                      <button
                        onClick={() => handleExecuteAiAction(opp.actionCommand)}
                        className="w-full mt-1.5 py-1 px-2.5 rounded bg-amber-500/20 hover:bg-amber-500 text-[9px] font-black uppercase tracking-wider text-amber-300 hover:text-white transition-all text-center flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Play className="w-2 h-2 fill-current" />
                        {opp.actionText || "Capture Opp"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Quick AI Execution Buttons Bar */}
          {aiData.actions && aiData.actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-white/5 text-left">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mr-1">Suggested System Actions:</span>
              {aiData.actions.map((act: any, idx: number) => {
                const isPrimary = act.style === "primary";
                const btnStyle = isPrimary 
                  ? "bg-primary hover:bg-primary/95 text-white border-primary/20 hover:scale-[1.02] shadow-[0_0_15px_rgba(138,43,226,0.2)]" 
                  : "bg-secondary border-border hover:bg-secondary/80 hover:scale-[1.02]";
                return (
                  <button
                    key={idx}
                    onClick={() => handleExecuteAiAction(act.command)}
                    className={`py-2 px-4 rounded-xl border text-xs font-semibold transition-all duration-300 flex items-center gap-1.5 cursor-pointer ${btnStyle}`}
                  >
                    <Play className="w-2.5 h-2.5 fill-current opacity-85" />
                    {act.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div 
            key={i} 
            className={`glass p-6 rounded-2xl border border-border/40 ${stat.border} shadow-lg ${stat.shadow} transition-all duration-300 hover:-translate-y-1 group`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg} ${stat.color} glow-primary transition-all group-hover:scale-110`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full bg-white/5 border border-white/10 ${stat.change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
                {stat.change}
              </span>
            </div>
            <div>
              <h3 className="text-3xl font-black mb-1 text-white group-hover:text-primary transition-colors">{stat.value}</h3>
              <p className="text-muted-foreground text-sm font-semibold tracking-wide uppercase text-xs">{stat.title}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Charts & Widgets Section */}
      {(user?.role === "SUPER_ADMIN" || user?.role === "ADMIN") ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          
          {/* Analytics Card (Admin) */}
          <div className="lg:col-span-2 glass p-8 rounded-3xl border border-border/40 relative overflow-hidden flex flex-col justify-between">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Revenue Performance
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Monthly business volume & deal completions.</p>
              </div>
              <div className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-lg border border-border text-xs text-gray-300">
                <Sparkles className="w-4 h-4 text-accent" />
                Real-time Analytics
              </div>
            </div>

            {/* Gorgeous SVG Line Chart representation */}
            <div className="h-64 w-full relative flex items-end pt-4">
              <svg className="w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                <line x1="0" y1="40" x2="100" y2="40" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />

                <path 
                  d="M0,50 L0,38 Q15,10 30,30 T60,15 T90,20 L100,28 L100,50 Z" 
                  fill="url(#chart-grad)" 
                />
                <path 
                  d="M0,38 Q15,10 30,30 T60,15 T90,20 L100,28" 
                  fill="none" 
                  stroke="hsl(260, 100%, 65%)" 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                  className="drop-shadow-[0_0_10px_rgba(138,43,226,0.8)]"
                />
              </svg>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-[10px] text-gray-400 font-bold">
                <span>JAN</span>
                <span>FEB</span>
                <span>MAR</span>
                <span>APR</span>
                <span>MAY</span>
                <span>JUN</span>
              </div>
            </div>
          </div>

          {/* Recent Pipeline Leads (Admin) */}
          <div className="glass p-8 rounded-3xl border border-border/40 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <Clock className="w-5 h-5 text-primary" />
                Active Leads
              </h2>
              <div className="space-y-4">
                {recentLeads.map((lead, i) => (
                  <div key={i} className="flex justify-between items-center p-4 rounded-2xl bg-secondary/35 border border-border/30 hover:border-primary/40 transition-all duration-300">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary/20 to-accent/20 flex items-center justify-center font-bold text-primary">
                        {lead.avatar}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-white">{lead.name}</h4>
                        <p className="text-xs text-muted-foreground">{lead.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-accent">{lead.value}</div>
                      <span className="text-[9px] font-extrabold uppercase bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-gray-300">
                        {lead.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Link href="/leads" className="mt-6 w-full py-3 rounded-xl bg-secondary hover:bg-primary/10 border border-border/60 text-center text-sm font-semibold text-white transition-all flex items-center justify-center gap-1.5 group">
              Open Pipeline
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          
          {/* Personal Shift Worked Hours Bar Chart (Employee) */}
          <div className="lg:col-span-2 glass p-8 rounded-3xl border border-border/40 relative overflow-hidden flex flex-col justify-between">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary glow-primary" />
                  My Worked Hours
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Daily shift duration logged in the current month.</p>
              </div>
              <div className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-lg border border-border text-xs text-gray-300">
                <Sparkles className="w-4 h-4 text-accent" />
                Personal Shift Roster
              </div>
            </div>

            {/* Custom SVG Bar Chart */}
            <div className="h-64 w-full relative flex items-end pt-6 gap-1 sm:gap-2 justify-between">
              {getMonthlyWorkedHoursData().map((d, index) => {
                const maxVal = Math.max(8, ...getMonthlyWorkedHoursData().map(x => x.hours));
                const pct = (d.hours / maxVal) * 100;
                const isToday = new Date().getDate() === d.day;
                
                return (
                  <div key={index} className="flex-1 flex flex-col items-center group h-full justify-end relative">
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-2 bg-card border border-border/80 text-[10px] font-bold px-2.5 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20 whitespace-nowrap shadow-2xl">
                      Day {d.day}: <span className="text-primary">{d.hours} hrs</span>
                    </div>
                    
                    {/* Bar */}
                    <div 
                      style={{ height: `${pct > 0 ? pct : 4}%` }} 
                      className={`w-full max-w-[12px] rounded-t-md transition-all duration-500 group-hover:scale-y-[1.08] relative ${
                        isToday 
                          ? "bg-gradient-to-t from-primary to-accent shadow-[0_0_12px_var(--primary)]" 
                          : d.hours > 0 
                            ? "bg-gradient-to-t from-primary/30 to-accent/40 border border-primary/25 shadow-sm" 
                            : "bg-white/5 border border-white/5 opacity-40"
                      }`}
                    />
                    
                    {/* Day label */}
                    {d.day % 5 === 0 || d.day === 1 || d.day === getMonthlyWorkedHoursData().length ? (
                      <span className="text-[9px] font-black text-muted-foreground mt-2 font-mono">{d.day}</span>
                    ) : (
                      <span className="text-[9px] opacity-0 mt-2 font-mono">{d.day}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Personal Task Performance Breakdown (Employee) */}
          <div className="glass p-8 rounded-3xl border border-border/40 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <CheckSquare className="w-5 h-5 text-primary glow-primary" />
                Task Performance
              </h2>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Completed */}
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 hover:border-emerald-500/20 transition-all duration-300 text-left">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">Completed</span>
                  <h3 className="text-3xl font-black text-white mt-1.5 drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]">
                    {getPersonalTaskStats().completed}
                  </h3>
                  <p className="text-[9px] text-muted-foreground mt-1">Assignments finished</p>
                </div>

                {/* Delayed */}
                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10 hover:border-rose-500/20 transition-all duration-300 text-left">
                  <span className="text-[9px] font-black uppercase tracking-wider text-rose-400">Delayed</span>
                  <h3 className="text-3xl font-black text-white mt-1.5 drop-shadow-[0_0_6px_rgba(244,63,94,0.3)]">
                    {getPersonalTaskStats().delayed}
                  </h3>
                  <p className="text-[9px] text-muted-foreground mt-1">Crossed deadlines</p>
                </div>

                {/* Pending */}
                <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 hover:border-amber-500/20 transition-all duration-300 text-left">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">Active</span>
                  <h3 className="text-3xl font-black text-white mt-1.5 drop-shadow-[0_0_6px_rgba(245,158,11,0.3)]">
                    {getPersonalTaskStats().pending}
                  </h3>
                  <p className="text-[9px] text-muted-foreground mt-1">In progress lists</p>
                </div>

                {/* Cancelled */}
                <div className="p-4 rounded-2xl bg-gray-500/5 border border-gray-500/10 hover:border-gray-500/20 transition-all duration-300 text-left">
                  <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">Cancelled</span>
                  <h3 className="text-3xl font-black text-white mt-1.5">
                    {getPersonalTaskStats().cancelled}
                  </h3>
                  <p className="text-[9px] text-muted-foreground mt-1">Cancelled checklist</p>
                </div>
              </div>
            </div>
            
            <Link href="/tasks" className="mt-6 w-full py-3 rounded-xl bg-secondary hover:bg-primary/10 border border-border/60 text-center text-sm font-semibold text-white transition-all flex items-center justify-center gap-1.5 group">
              Manage Personal Board
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      )}

      {/* Row 2: Operations Calendar and Today's Agenda (As requested) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Operations Calendar Sidebar Widget */}
        <div className="glass p-6 rounded-3xl border border-border/40 flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                <Calendar className="w-5 h-5 text-primary glow-primary" />
                Operations Calendar
              </h2>
              <span className="text-[9px] font-black uppercase bg-secondary border border-border/40 px-2 py-1 rounded text-gray-400 font-extrabold">
                {new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </span>
            </div>

            {/* Micro Grid Days */}
            <div className="grid grid-cols-7 gap-1 text-center mt-2.5">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, index) => (
                <span key={index} className="text-[9px] font-black text-muted-foreground uppercase">{d}</span>
              ))}
              {getDashboardDaysInMonth().map(({ date, isCurrentMonth }, idx) => {
                const dayEvents = events.filter(event => {
                  const evStart = new Date(event.startTime);
                  return evStart.getDate() === date.getDate() && evStart.getMonth() === date.getMonth() && evStart.getFullYear() === date.getFullYear();
                });

                const isToday = new Date().toDateString() === date.toDateString();

                return (
                  <div 
                    key={idx}
                    className={`p-1 rounded-lg min-h-[38px] flex flex-col items-center justify-between transition-all ${
                      isCurrentMonth ? "bg-secondary/15 hover:bg-secondary/35 text-white" : "opacity-25 pointer-events-none"
                    } ${isToday ? "border border-primary bg-primary/10 text-white" : "border border-transparent"}`}
                  >
                    <span className="text-[10px] font-bold">{date.getDate()}</span>
                    {/* Glowing dots under number */}
                    <div className="flex gap-0.5 justify-center mt-0.5 max-w-[32px] overflow-hidden flex-wrap">
                      {dayEvents.slice(0, 3).map(e => {
                        const dotColor = 
                          e.color === "green" ? "bg-emerald-500 shadow-[0_0_4px_#10b981]" :
                          e.color === "yellow" ? "bg-amber-500 shadow-[0_0_4px_#f59e0b]" :
                          e.color === "purple" ? "bg-purple-500 shadow-[0_0_4px_#a855f7]" : "bg-blue-500 shadow-[0_0_4px_#3b82f6]";
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

          <Link href="/calendar" className="mt-5 w-full py-2.5 rounded-xl bg-secondary hover:bg-primary/10 border border-border/60 text-center text-xs font-semibold text-white transition-all flex items-center justify-center gap-1.5 group">
            Open Calendar Terminal
            <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        {/* Today's Agenda and Due checklists */}
        <div className="lg:col-span-2 glass p-6 rounded-3xl border border-border/40 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-white">
              <Clock className="w-5 h-5 text-primary glow-primary animate-pulse" />
              Today's Agenda & Deadlines
            </h2>

            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
              {isLoading ? (
                <p className="text-[10px] text-center text-muted-foreground italic py-10">Synchronizing database schedules...</p>
              ) : todaysSchedule.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-xs space-y-1 bg-secondary/15 rounded-2xl border border-border/20">
                  <Bot className="w-6 h-6 mx-auto text-primary opacity-60 mb-1" />
                  <p>All clear today! No meetings, due tasks, or transits scheduled.</p>
                </div>
              ) : (
                todaysSchedule.map((item) => {
                  const pillColor = 
                    item.color === "green" ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" :
                    item.color === "yellow" ? "bg-amber-500/10 border-amber-500/25 text-amber-400" :
                    item.color === "purple" ? "bg-purple-500/10 border-purple-500/25 text-purple-400" :
                    "bg-blue-500/10 border-blue-500/25 text-blue-400";

                  return (
                    <div 
                      key={item.id}
                      className="flex justify-between items-center p-3 rounded-xl bg-secondary/25 border border-border/30 hover:border-primary/20 transition-all duration-200"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span className={`text-[9px] font-black uppercase px-2.5 py-1.5 border rounded-lg flex-shrink-0 ${pillColor}`}>
                          {item.type}
                        </span>
                        <div className="truncate text-left">
                          <h4 className="font-bold text-xs text-white truncate">{item.title}</h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                            <Clock className="w-3 h-3 text-primary flex-shrink-0" />
                            {new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {item.location || 'No Location Details'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-border/20 pt-4 flex justify-between items-center text-[10px] text-muted-foreground select-none">
            <div className="flex gap-3">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Meetings</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Private</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Tasks</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span> Transits</span>
            </div>
            <span>Auto-refreshing</span>
          </div>
        </div>

      </div>

      {/* Dynamic Glassmorphic Checkout Modal Cabinet */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-md rounded-3xl overflow-hidden border border-rose-500/30 shadow-2xl shadow-rose-500/5 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-rose-500/5 to-transparent pointer-events-none"></div>
            
            <div className="p-6 border-b border-border/60 flex justify-between items-center relative z-10">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-rose-400 animate-pulse" />
                <h3 className="font-extrabold text-lg text-white">Daily Shift Checkout</h3>
              </div>
              <button 
                onClick={() => {
                  setIsCheckoutOpen(false);
                  setCheckoutSummaryText("");
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 relative z-10 text-left">
              <div>
                <label className="block text-xs font-black uppercase text-gray-300 tracking-wider mb-2">
                  Shift Work Summary Statement
                </label>
                <textarea
                  required
                  rows={4}
                  className="w-full glass-input p-4 rounded-2xl text-sm text-white placeholder-gray-500 resize-none outline-none focus:border-rose-500/50"
                  placeholder="Tell your team and admin what tasks, viewings, or deals you completed during today's shift..."
                  value={checkoutSummaryText}
                  onChange={(e) => setCheckoutSummaryText(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-2">
                  * Providing a daily checkout summary is required. This report is logged into your permanent activity feed.
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border/40 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsCheckoutOpen(false);
                    setCheckoutSummaryText("");
                  }}
                  className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !checkoutSummaryText.trim()}
                  onClick={() => handleDashboardCheckOut(checkoutSummaryText)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:opacity-95 text-white font-semibold flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all disabled:opacity-50 disabled:scale-100 active:scale-[0.98]"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Complete Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Toast Notifications */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-[100] p-4 rounded-2xl border backdrop-blur-md shadow-2xl flex items-center gap-3 max-w-md animate-fade-in ${
          toastType === "loading" ? "bg-primary/20 border-primary/30 text-white shadow-[0_0_20px_rgba(138,43,226,0.15)]" :
          toastType === "error" ? "bg-rose-500/20 border-rose-500/30 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.15)]" :
          "bg-emerald-500/20 border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
        }`}>
          {toastType === "loading" ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary shrink-0" />
          ) : toastType === "error" ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <Check className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          <div className="flex-1 text-xs font-semibold leading-normal">
            {toastMessage}
          </div>
          <button 
            onClick={() => setToastMessage(null)}
            className="w-5 h-5 rounded-full hover:bg-white/10 flex items-center justify-center text-current/70 hover:text-current transition-all shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

    </div>
  );
}
