"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  Users,
  Wallet,
  Coins,
  BarChart3,
  Plus,
  Lock,
  Unlock,
  KeyRound,
  Activity,
  FileText,
  Calendar,
  Edit,
  TrendingUp,
  Loader2,
  AlertCircle,
  Building,
  CheckCircle2,
  X,
  UserCheck,
  Server,
  DollarSign
} from "lucide-react";

interface Organization {
  id: string;
  name: string;
  domain: string;
  userCount: number;
  createdAt: string;
  subscription: {
    id: string;
    plan: string;
    status: 'ACTIVE' | 'OVERDUE' | 'SUSPENDED';
    monthlyPrice: number;
    currency: string;
    nextBillingDate: string;
    daysUntilDue: number;
    paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
    amountPaidThisCycle: number;
    amountPending: number;
    contractTerms?: string;
    lastPaymentDate?: string;
    payments?: any[];
  } | null;
}

interface Stats {
  activeOrganizations: number;
  totalOrganizations: number;
  monthlyRecurringRevenue: number;
  overdueOrganizations: number;
  apiCostEstimate: number;
  totalPendingRent: number;
  apiRequests: {
    ollama: number;
    gemini: number;
    openai: number;
    total: number;
  };
  monthlyRevenueTrend?: {
    month: string;
    amount: number;
  }[];
}

export default function SaasAdminDashboard() {
  const { user, token } = useAuth();
  const router = useRouter();

  // Redirect if not system admin
  useEffect(() => {
    if (user && !user.isSystemAdmin) {
      router.push("/dashboard");
    }
  }, [user, router]);

  // UI State
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modals state
  const [isNewOrgModalOpen, setIsNewOrgModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isEditSubModalOpen, setIsEditSubModalOpen] = useState(false);

  // Selected Org for actions
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  // Form states
  const [newOrgForm, setNewOrgForm] = useState({
    name: "",
    domain: "",
    adminEmail: "",
    adminPasswordHash: "",
    adminFirstName: "",
    adminLastName: "",
    monthlyPrice: 3000,
    plan: "STANDARD",
    contractTerms: "Monthly rental subscription agreement."
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: 3000,
    billingPeriod: new Date().toISOString().substring(0, 7) // e.g. "2026-06"
  });

  const [passwordForm, setPasswordForm] = useState({
    email: "",
    newPasswordHash: ""
  });

  const [editSubForm, setEditSubForm] = useState({
    plan: "STANDARD",
    monthlyPrice: 3000,
    nextBillingDate: "",
    contractTerms: ""
  });

  // Fetch Stats and Companies
  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      
      const statsRes = await fetch(`${apiUrl}/saas-admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const statsData = statsRes.ok ? await statsRes.json() : null;

      const compRes = await fetch(`${apiUrl}/saas-admin/companies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const compData = compRes.ok ? await compRes.json() : [];

      if (statsData) setStats(statsData);
      setCompanies(compData);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Failed to connect to system endpoints. Please verify service logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && user?.isSystemAdmin) {
      fetchData();
    }
  }, [token, user]);

  // Actions
  const handleToggleBlock = async (orgId: string, currentStatus: string) => {
    if (!token || actionLoading) return;
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/saas-admin/companies/${orgId}/toggle-block`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccessMsg(
          currentStatus === "SUSPENDED" 
            ? "Organization access has been successfully restored."
            : "Organization access has been manually blocked. All active sessions invalidated."
        );
        fetchData();
      } else {
        setErrorMsg("Failed to toggle block status.");
      }
    } catch (err) {
      setErrorMsg("Network error occurred.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || actionLoading) return;
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/saas-admin/companies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newOrgForm)
      });
      if (res.ok) {
        setSuccessMsg(`Successfully registered "${newOrgForm.name}" and initialized standard active subscription.`);
        setIsNewOrgModalOpen(false);
        setNewOrgForm({
          name: "",
          domain: "",
          adminEmail: "",
          adminPasswordHash: "",
          adminFirstName: "",
          adminLastName: "",
          monthlyPrice: 3000,
          plan: "STANDARD",
          contractTerms: "Monthly rental subscription agreement."
        });
        fetchData();
      } else {
        const errorData = await res.json();
        setErrorMsg(errorData.message || "Failed to register new organization.");
      }
    } catch (err) {
      setErrorMsg("Network error occurred during registration.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedOrg || actionLoading) return;
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/saas-admin/companies/${selectedOrg.id}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(paymentForm)
      });
      if (res.ok) {
        setSuccessMsg(`Successfully logged receipt of ${paymentForm.amount} AED for ${selectedOrg.name}.`);
        setIsPaymentModalOpen(false);
        fetchData();
      } else {
        setErrorMsg("Failed to record payment transaction.");
      }
    } catch (err) {
      setErrorMsg("Network error occurred.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedOrg || actionLoading) return;
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/saas-admin/companies/${selectedOrg.id}/reset-admin-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(passwordForm)
      });
      if (res.ok) {
        setSuccessMsg(`Successfully reset password for Super Admin: ${passwordForm.email}.`);
        setIsPasswordModalOpen(false);
        setPasswordForm({ email: "", newPasswordHash: "" });
      } else {
        const errorData = await res.json();
        setErrorMsg(errorData.message || "Failed to reset password.");
      }
    } catch (err) {
      setErrorMsg("Network error occurred.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedOrg || actionLoading) return;
    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/saas-admin/companies/${selectedOrg.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editSubForm)
      });
      if (res.ok) {
        setSuccessMsg(`Successfully updated subscription parameters for ${selectedOrg.name}.`);
        setIsEditSubModalOpen(false);
        fetchData();
      } else {
        setErrorMsg("Failed to update subscription parameters.");
      }
    } catch (err) {
      setErrorMsg("Network error occurred.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!user || !user.isSystemAdmin) {
    return null;
  }

  // Helper stats values (with mock fallbacks to prevent breaking UI if backend empty)
  const statsActive = stats?.activeOrganizations ?? 0;
  const statsTotal = stats?.totalOrganizations ?? 0;
  const statsMRR = stats?.monthlyRecurringRevenue ?? 0;
  const statsOverdue = stats?.overdueOrganizations ?? 0;
  const statsPending = stats?.totalPendingRent ?? 0;
  
  const apiRequestsTotal = stats?.apiRequests?.total ?? 0;
  const apiRequestsOllama = stats?.apiRequests?.ollama ?? 0;
  const apiRequestsGemini = stats?.apiRequests?.gemini ?? 0;
  const apiRequestsOpenai = stats?.apiRequests?.openai ?? 0;

  const trendData = stats?.monthlyRevenueTrend || [];
  const maxAmount = Math.max(...trendData.map(d => d.amount), 1000);

  const points = trendData.map((d, index) => {
    const x = 30 + (index * 440) / Math.max(1, trendData.length - 1);
    const y = 160 - (d.amount / maxAmount) * 110;
    return { x, y, label: d.month, amount: d.amount };
  });

  const pathD = points.length > 0 
    ? `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}` 
    : "M 20 160 Q 120 130, 220 90 T 420 50 L 480 40";

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`
    : "M 20 160 Q 120 130, 220 90 T 420 50 L 480 40 L 480 180 L 20 180 Z";

  return (
    <div className="p-6 space-y-6 relative min-h-screen text-left">
      {/* Glow Effects */}
      <div className="absolute top-[10%] left-[5%] w-[400px] h-[400px] bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div className="absolute bottom-[20%] right-[10%] w-[350px] h-[350px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -z-10"></div>

      {/* Top Banner Alert System Messages */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 rounded-2xl animate-fade-in text-xs font-bold relative">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="absolute right-4 top-4 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/35 text-red-400 rounded-2xl animate-fade-in text-xs font-bold relative">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="absolute right-4 top-4 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Heading Container */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-widest text-white flex items-center gap-3">
            <ShieldAlert className="w-7 h-7 text-primary glow-primary" />
            SaaS Super Admin Control Desk
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-semibold">
            Manage your real estate tenant companies, track MRR collections, log manual rents, and inspect AI token consumption.
          </p>
        </div>
        <button
          onClick={() => setIsNewOrgModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 hover:scale-[1.02] shadow-[0_0_20px_rgba(6,182,212,0.15)] active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Register Client Company
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
          <p className="text-xs font-black tracking-widest text-muted-foreground uppercase">Querying core SaaS ledger...</p>
        </div>
      ) : (
        <>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Active Tenants */}
            <div className="glass p-5 rounded-3xl border border-border/80 relative overflow-hidden group hover:border-primary/20 transition-all duration-300 shadow-md">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Tenant Companies</span>
                  <h3 className="text-2xl font-black text-white">{statsActive} <span className="text-xs text-muted-foreground font-medium">/ {statsTotal} active</span></h3>
                </div>
                <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shadow-sm">
                  <Building className="w-4.5 h-4.5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold">
                <span className="text-primary font-black">100% cloud delivery</span>
                <span>across active domains</span>
              </div>
            </div>

            {/* MRR */}
            <div className="glass p-5 rounded-3xl border border-border/80 relative overflow-hidden group hover:border-emerald-500/20 transition-all duration-300 shadow-md">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Monthly Recurring Rent</span>
                  <h3 className="text-2xl font-black text-emerald-400">{statsMRR.toLocaleString()} <span className="text-xs text-muted-foreground font-medium">AED/mo</span></h3>
                </div>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-sm">
                  <Coins className="w-4.5 h-4.5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-black">All active contracts</span>
                <span>accumulating correctly</span>
              </div>
            </div>

            {/* Overdue/Outstanding Rents */}
            <div className="glass p-5 rounded-3xl border border-border/80 relative overflow-hidden group hover:border-red-500/20 transition-all duration-300 shadow-md">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Overdue Accounts</span>
                  <h3 className={`text-2xl font-black ${statsOverdue > 0 ? "text-red-400 animate-pulse" : "text-white"}`}>{statsOverdue} <span className="text-xs text-muted-foreground font-medium">pending ({statsPending.toLocaleString()} AED)</span></h3>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-sm ${statsOverdue > 0 ? "bg-red-500/15 border-red-500/25 text-red-400" : "bg-secondary/20 border-border/40 text-muted-foreground"}`}>
                  <Wallet className="w-4.5 h-4.5" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold">
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-400 font-black">Overdue clients retain access</span>
                <span>but receive banners</span>
              </div>
            </div>

            {/* AI Requests API Cost */}
            <div className="glass p-5 rounded-3xl border border-border/80 relative overflow-hidden group hover:border-indigo-500/20 transition-all duration-300 shadow-md">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">AI API Token Cost</span>
                  <h3 className="text-2xl font-black text-indigo-400">~{stats?.apiCostEstimate ?? 0} <span className="text-xs text-muted-foreground font-medium">AED est. ({apiRequestsTotal.toLocaleString()} calls)</span></h3>
                </div>
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shadow-sm">
                  <Activity className="w-4.5 h-4.5 animate-pulse" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold">
                <span className="text-indigo-400 font-black">Gemini & OpenAI tokens</span>
                <span>logged per request</span>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Native SVG Line Chart for MRR Payment Ledger Growth */}
            <div className="glass p-5 rounded-3xl border border-border/80 shadow-md space-y-4">
              <h3 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-2 border-b border-border/30 pb-3">
                <TrendingUp className="w-4.5 h-4.5 text-primary glow-primary" />
                Monthly Cash Flow & Rent Projection (AED)
              </h3>
              
              <div className="relative w-full h-[220px] flex items-center justify-center">
                {/* SVG Graph */}
                <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="50" x2="500" y2="50" stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3,3" />
                  <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3,3" />
                  <line x1="0" y1="150" x2="500" y2="150" stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3,3" />

                  {/* Gradient Area Fill */}
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25"/>
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0"/>
                    </linearGradient>
                  </defs>
                  
                  {/* Path representing revenue growth */}
                  <path 
                    d={areaD} 
                    fill="url(#chartGrad)" 
                  />

                  {/* Top Line */}
                  <path 
                    d={pathD} 
                    fill="none" 
                    stroke="#06b6d4" 
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                  />

                  {/* Plot Dots and Hover Labels */}
                  {points.map((p, idx) => (
                    <g key={idx}>
                      <circle 
                        cx={p.x} 
                        cy={p.y} 
                        r="5" 
                        fill={idx === points.length - 1 ? "#34d399" : "#06b6d4"} 
                        stroke="#0f172a" 
                        strokeWidth="2" 
                      />
                      <text
                        x={p.x}
                        y={p.y - 12}
                        textAnchor="middle"
                        fill="#06b6d4"
                        fontSize="8"
                        fontWeight="black"
                      >
                        {p.amount > 0 ? `${p.amount.toLocaleString()}` : ""}
                      </text>
                    </g>
                  ))}
                </svg>

                {/* Graph Labels */}
                <div className="absolute bottom-1.5 left-0 right-0 h-4 flex justify-between px-4 pointer-events-none">
                  {points.map((p, idx) => (
                    <span 
                      key={idx} 
                      className="text-[7.5px] font-black uppercase text-muted-foreground tracking-wider absolute"
                      style={{ left: `${(p.x / 500) * 100}%`, transform: "translateX(-50%)" }}
                    >
                      {p.label}
                    </span>
                  ))}
                </div>

                {/* Top value badge */}
                <div className="absolute top-2 right-4 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-xl text-[9px] font-black text-emerald-400 uppercase tracking-widest shadow-md">
                  MRR Projection: {statsMRR} AED
                </div>
              </div>
            </div>

            {/* Native SVG Bar Chart for AI requests breakdown */}
            <div className="glass p-5 rounded-3xl border border-border/80 shadow-md space-y-4">
              <h3 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-2 border-b border-border/30 pb-3">
                <BarChart3 className="w-4.5 h-4.5 text-indigo-400" />
                Cognitive Services API Usage (Requests)
              </h3>
              
              <div className="relative w-full h-[220px] flex items-end justify-around pb-6 pt-6">
                {/* Background lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
                  <div className="border-t border-border/20 w-full"></div>
                  <div className="border-t border-border/20 w-full"></div>
                  <div className="border-t border-border/20 w-full"></div>
                  <div className="border-t border-border/20 w-full"></div>
                </div>

                {/* Ollama Bar */}
                <div className="flex flex-col items-center gap-2 z-10 w-16">
                  <span className="text-[10px] font-extrabold text-gray-300">{apiRequestsOllama.toLocaleString()}</span>
                  <div 
                    className="w-10 bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/35 rounded-t-xl transition-all duration-500 shadow-md"
                    style={{ height: `${apiRequestsTotal > 0 ? Math.max(15, (apiRequestsOllama / apiRequestsTotal) * 140) : 25}px` }}
                  />
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Ollama</span>
                </div>

                {/* Gemini Bar */}
                <div className="flex flex-col items-center gap-2 z-10 w-16">
                  <span className="text-[10px] font-extrabold text-primary">{apiRequestsGemini.toLocaleString()}</span>
                  <div 
                    className="w-10 bg-primary/20 hover:bg-primary/40 border border-primary/30 rounded-t-xl transition-all duration-500 shadow-[0_0_12px_rgba(6,182,212,0.1)]"
                    style={{ height: `${apiRequestsTotal > 0 ? Math.max(15, (apiRequestsGemini / apiRequestsTotal) * 140) : 80}px` }}
                  />
                  <span className="text-[9px] font-black text-primary uppercase tracking-wider">Gemini</span>
                </div>

                {/* OpenAI Bar */}
                <div className="flex flex-col items-center gap-2 z-10 w-16">
                  <span className="text-[10px] font-extrabold text-amber-400">{apiRequestsOpenai.toLocaleString()}</span>
                  <div 
                    className="w-10 bg-amber-500/20 hover:bg-amber-500/40 border border-amber-500/30 rounded-t-xl transition-all duration-500 shadow-md"
                    style={{ height: `${apiRequestsTotal > 0 ? Math.max(15, (apiRequestsOpenai / apiRequestsTotal) * 140) : 40}px` }}
                  />
                  <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">OpenAI</span>
                </div>

                {/* Legend total cost */}
                <div className="absolute top-2 right-4 text-[9px] text-muted-foreground font-semibold flex gap-3">
                  <span>Total calls: <strong className="text-white font-extrabold">{apiRequestsTotal.toLocaleString()}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Companies Directory Table */}
          <div className="glass rounded-3xl border border-border/80 shadow-md overflow-hidden">
            <div className="p-5 border-b border-border/30 bg-secondary/10 flex justify-between items-center">
              <h3 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-2">
                <Users className="w-5 h-5 text-primary glow-primary" />
                Registered Organizations & Subscriptions
              </h3>
              <span className="text-[9px] font-black bg-secondary/50 border border-border/40 text-muted-foreground px-2 py-0.5 rounded-lg uppercase">
                {companies.length} Records
              </span>
            </div>

            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-secondary/15 border-b border-border/30 text-muted-foreground font-bold uppercase text-[9px] tracking-wider">
                    <th className="p-4">Organization & Domain</th>
                    <th className="p-4">Users</th>
                    <th className="p-4">Plan & Rent</th>
                    <th className="p-4">Billing Status</th>
                    <th className="p-4 text-right">Pending Balance</th>
                    <th className="p-4 text-center">Due In</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20 font-medium">
                  {companies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground italic">
                        No client organizations registered in PostgreSQL database yet.
                      </td>
                    </tr>
                  ) : (
                    companies.map((org) => {
                      const sub = org.subscription;
                      const status = sub?.status || "ACTIVE";
                      const pending = sub?.amountPending || 0;
                      const monthlyRent = sub?.monthlyPrice || 0;
                      const daysUntilDue = sub?.daysUntilDue ?? 0;
                      
                      // Payment Status Badge Styles
                      const statusStyles = 
                        status === "SUSPENDED" 
                          ? "bg-red-500/10 text-red-400 border-red-500/20" 
                          : status === "OVERDUE" 
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse" 
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";

                      return (
                        <tr key={org.id} className="hover:bg-secondary/10 transition-colors">
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-white text-sm">{org.name}</span>
                              <span className="text-[10px] text-muted-foreground">{org.domain || "no domain"}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1.5 text-gray-300">
                              <Users className="w-3.5 h-3.5 text-gray-500" />
                              <span>{org.userCount} users</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className="text-gray-300 font-extrabold text-xs">{sub?.plan || "STANDARD"}</span>
                              <span className="text-[10px] text-emerald-400 font-black">{monthlyRent.toLocaleString()} AED / mo</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${statusStyles}`}>
                              {status}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <span className={`font-extrabold ${pending > 0 ? "text-red-400 font-black" : "text-gray-400"}`}>
                              {pending.toLocaleString()} AED
                            </span>
                          </td>
                          <td className="p-4 text-center font-extrabold">
                            {status === "SUSPENDED" ? (
                              <span className="text-red-400 text-[10px] uppercase font-black">Blocked</span>
                            ) : daysUntilDue <= 0 ? (
                              <span className="text-red-400 text-[10px] uppercase font-black">Overdue</span>
                            ) : (
                              <span className={`${daysUntilDue <= 3 ? "text-amber-400 font-black" : "text-gray-300"}`}>{daysUntilDue} days</span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex gap-2.5 justify-end items-center flex-wrap">
                              {/* Log Payment */}
                              <button
                                onClick={() => {
                                  setSelectedOrg(org);
                                  setPaymentForm({ amount: pending > 0 ? pending : monthlyRent, billingPeriod: new Date().toISOString().substring(0, 7) });
                                  setIsPaymentModalOpen(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                title="Log Rent Payment Receipt"
                              >
                                Log Pay
                              </button>

                              {/* Edit Sub parameters */}
                              <button
                                onClick={() => {
                                  setSelectedOrg(org);
                                  setEditSubForm({
                                    plan: sub?.plan || "STANDARD",
                                    monthlyPrice: sub?.monthlyPrice || 3000,
                                    nextBillingDate: sub?.nextBillingDate ? new Date(sub.nextBillingDate).toISOString().substring(0, 10) : "",
                                    contractTerms: sub?.contractTerms || ""
                                  });
                                  setIsEditSubModalOpen(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/40 text-gray-300 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                title="Edit Subscription Plan Details"
                              >
                                Plan
                              </button>

                              {/* Reset admin password */}
                              <button
                                onClick={() => {
                                  setSelectedOrg(org);
                                  setPasswordForm({ email: "", newPasswordHash: "" });
                                  setIsPasswordModalOpen(true);
                                }}
                                className="px-2 w-8 h-8 rounded-lg bg-secondary hover:bg-secondary/80 border border-border/40 text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                title="Reset Tenant Super Admin Password"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>

                              {/* Hard Block Toggle */}
                              <button
                                onClick={() => handleToggleBlock(org.id, status)}
                                className={`px-2 w-8 h-8 rounded-lg border flex items-center justify-center transition-colors duration-200 cursor-pointer ${
                                  status === "SUSPENDED"
                                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20"
                                    : "bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/20"
                                }`}
                                title={status === "SUSPENDED" ? "Restore Organization Access" : "Block Organization Access Instantly"}
                              >
                                {status === "SUSPENDED" ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODALS SECTION */}

      {/* Register New Organization Modal */}
      {isNewOrgModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fade-in">
          <form 
            onSubmit={handleRegisterOrg}
            className="glass max-w-xl w-full rounded-3xl border border-border/80 shadow-2xl p-6 text-left space-y-4 overflow-y-auto max-h-[90vh]"
          >
            <div className="flex justify-between items-center border-b border-border/40 pb-3">
              <h3 className="text-sm font-black uppercase text-white tracking-widest flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary glow-primary" />
                Register New Client Company
              </h3>
              <button 
                type="button"
                onClick={() => setIsNewOrgModalOpen(false)}
                className="p-1 rounded-xl hover:bg-secondary/40 text-muted-foreground hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Company Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Al Hamra Properties" 
                  value={newOrgForm.name}
                  onChange={(e) => setNewOrgForm({...newOrgForm, name: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Domain</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. alhamra-realestate.com" 
                  value={newOrgForm.domain}
                  onChange={(e) => setNewOrgForm({...newOrgForm, domain: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Admin First Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Faisal" 
                  value={newOrgForm.adminFirstName}
                  onChange={(e) => setNewOrgForm({...newOrgForm, adminFirstName: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Admin Last Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Al-Dossari" 
                  value={newOrgForm.adminLastName}
                  onChange={(e) => setNewOrgForm({...newOrgForm, adminLastName: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Admin Super-User Email</label>
                <input 
                  type="email" 
                  required
                  placeholder="e.g. admin@alhamra-realestate.com" 
                  value={newOrgForm.adminEmail}
                  onChange={(e) => setNewOrgForm({...newOrgForm, adminEmail: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Admin Account Password</label>
                <input 
                  type="password" 
                  required
                  placeholder="Super Admin Initial Password" 
                  value={newOrgForm.adminPasswordHash}
                  onChange={(e) => setNewOrgForm({...newOrgForm, adminPasswordHash: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Monthly Price (AED)</label>
                <input 
                  type="number" 
                  required
                  value={newOrgForm.monthlyPrice}
                  onChange={(e) => setNewOrgForm({...newOrgForm, monthlyPrice: parseInt(e.target.value)})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Subscription Plan Tier</label>
                <select
                  value={newOrgForm.plan}
                  onChange={(e) => setNewOrgForm({...newOrgForm, plan: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="STARTER" className="bg-card text-white">Starter (1,500 AED)</option>
                  <option value="STANDARD" className="bg-card text-white">Standard (3,000 AED)</option>
                  <option value="PREMIUM" className="bg-card text-white">Premium (5,000 AED)</option>
                  <option value="ENTERPRISE" className="bg-card text-white">Enterprise (Custom)</option>
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Contract Terms</label>
                <textarea
                  value={newOrgForm.contractTerms}
                  onChange={(e) => setNewOrgForm({...newOrgForm, contractTerms: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white h-16 outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
              <button 
                type="button" 
                onClick={() => setIsNewOrgModalOpen(false)}
                className="px-4 py-2 bg-secondary hover:bg-secondary/85 text-gray-300 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-1.5 glow-primary cursor-pointer disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Registration
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Payment Receipt Modal */}
      {isPaymentModalOpen && selectedOrg && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fade-in">
          <form 
            onSubmit={handleRecordPayment}
            className="glass max-w-md w-full rounded-3xl border border-border/80 shadow-2xl p-6 text-left space-y-4"
          >
            <div className="flex justify-between items-center border-b border-border/40 pb-3">
              <h3 className="text-sm font-black uppercase text-white tracking-widest flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-400" />
                Record Rent Payment Receipt
              </h3>
              <button 
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 rounded-xl hover:bg-secondary/40 text-muted-foreground hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-secondary/15 rounded-xl border border-border/30 space-y-1">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Target Organization</span>
              <p className="text-sm font-extrabold text-white">{selectedOrg.name}</p>
              <p className="text-xs text-emerald-400 font-bold">Monthly Price: {selectedOrg.subscription?.monthlyPrice} AED | Outstanding: {selectedOrg.subscription?.amountPending} AED</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Payment Amount Received (AED)</label>
                <input 
                  type="number" 
                  required
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value)})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
                <span className="text-[9px] text-muted-foreground block">SaaS owner records manual payments here (supports partial amounts).</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Billing Period / Cycle Month</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. 2026-06"
                  value={paymentForm.billingPeriod}
                  onChange={(e) => setPaymentForm({...paymentForm, billingPeriod: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
              <button 
                type="button" 
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 bg-secondary hover:bg-secondary/85 text-gray-300 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={actionLoading || paymentForm.amount <= 0}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Log Payment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset password Modal */}
      {isPasswordModalOpen && selectedOrg && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fade-in">
          <form 
            onSubmit={handleResetPassword}
            className="glass max-w-md w-full rounded-3xl border border-border/80 shadow-2xl p-6 text-left space-y-4"
          >
            <div className="flex justify-between items-center border-b border-border/40 pb-3">
              <h3 className="text-sm font-black uppercase text-white tracking-widest flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                Reset Super Admin Credentials
              </h3>
              <button 
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="p-1 rounded-xl hover:bg-secondary/40 text-muted-foreground hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-secondary/15 rounded-xl border border-border/30">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Company</span>
              <p className="text-xs font-extrabold text-white">{selectedOrg.name} ({selectedOrg.domain})</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Admin Super-User Email</label>
                <input 
                  type="email" 
                  required
                  placeholder="e.g. admin@zorvex.com"
                  value={passwordForm.email}
                  onChange={(e) => setPasswordForm({...passwordForm, email: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">New Credentials Password</label>
                <input 
                  type="password" 
                  required
                  placeholder="Enter secure password hash"
                  value={passwordForm.newPasswordHash}
                  onChange={(e) => setPasswordForm({...passwordForm, newPasswordHash: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
              <button 
                type="button" 
                onClick={() => setIsPasswordModalOpen(false)}
                className="px-4 py-2 bg-secondary hover:bg-secondary/85 text-gray-300 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={actionLoading || !passwordForm.email || !passwordForm.newPasswordHash}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Change Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Subscription Modal */}
      {isEditSubModalOpen && selectedOrg && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fade-in">
          <form 
            onSubmit={handleUpdateSubscription}
            className="glass max-w-md w-full rounded-3xl border border-border/80 shadow-2xl p-6 text-left space-y-4"
          >
            <div className="flex justify-between items-center border-b border-border/40 pb-3">
              <h3 className="text-sm font-black uppercase text-white tracking-widest flex items-center gap-2">
                <Edit className="w-5 h-5 text-primary" />
                Modify Subscription Parameters
              </h3>
              <button 
                type="button"
                onClick={() => setIsEditSubModalOpen(false)}
                className="p-1 rounded-xl hover:bg-secondary/40 text-muted-foreground hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-secondary/15 rounded-xl border border-border/30">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">Company</span>
              <p className="text-xs font-extrabold text-white">{selectedOrg.name} ({selectedOrg.domain})</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Plan Tier Name</label>
                <input 
                  type="text" 
                  required
                  value={editSubForm.plan}
                  onChange={(e) => setEditSubForm({...editSubForm, plan: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Monthly Rent price (AED)</label>
                <input 
                  type="number" 
                  required
                  value={editSubForm.monthlyPrice}
                  onChange={(e) => setEditSubForm({...editSubForm, monthlyPrice: parseInt(e.target.value)})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Next Billing Due Date</label>
                <input 
                  type="date" 
                  required
                  value={editSubForm.nextBillingDate}
                  onChange={(e) => setEditSubForm({...editSubForm, nextBillingDate: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Agreement Notes</label>
                <textarea
                  value={editSubForm.contractTerms}
                  onChange={(e) => setEditSubForm({...editSubForm, contractTerms: e.target.value})}
                  className="w-full bg-secondary/30 border border-border/60 text-xs rounded-xl px-3 py-2 text-white h-16 outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
              <button 
                type="button" 
                onClick={() => setIsEditSubModalOpen(false)}
                className="px-4 py-2 bg-secondary hover:bg-secondary/85 text-gray-300 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Plan Parameters
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
