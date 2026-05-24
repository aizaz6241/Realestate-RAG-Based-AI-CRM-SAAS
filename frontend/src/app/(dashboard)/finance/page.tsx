"use client";

import React, { useState, useEffect } from "react";
import { 
  Wallet, 
  Coins, 
  DollarSign, 
  TrendingUp, 
  FileText, 
  ArrowUpRight, 
  Download, 
  Clock, 
  Check, 
  AlertCircle, 
  Lock, 
  Sparkles, 
  ChevronRight, 
  Plus, 
  User, 
  Building,
  Printer,
  Mail,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function FinanceHubPage() {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState("commissions");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const triggerPreviewAlert = (actionName: string) => {
    setToastMessage(`🔒 Finance Vault Lock: "${actionName}" is currently locked in Read-Only Preview Mode. Live database transactional pipelines will launch in Sprint 3.`);
  };

  const kpis = [
    { 
      title: "Total Commissions Pool", 
      value: "Rs 12,450,000", 
      change: "+14.2% MoM", 
      icon: Coins, 
      color: "text-emerald-400 border-emerald-500/20", 
      bg: "bg-emerald-500/5",
      detail: "Pending agent splits & margins"
    },
    { 
      title: "Outstanding Invoices (AR)", 
      value: "Rs 3,210,000", 
      change: "-2.5% MoM", 
      icon: DollarSign, 
      color: "text-cyan-400 border-cyan-500/20", 
      bg: "bg-cyan-500/5",
      detail: "Unpaid tenant rents & agency splits"
    },
    { 
      title: "Monthly Expenses (AP)", 
      value: "Rs 1,560,000", 
      change: "+5.1% MoM", 
      icon: TrendingUp, 
      color: "text-rose-400 border-rose-500/20", 
      bg: "bg-rose-500/5",
      detail: "Software fees, fuels & office rents"
    },
    { 
      title: "Rents Collected Today", 
      value: "Rs 450,000", 
      change: "100% On-Time", 
      icon: Wallet, 
      color: "text-amber-400 border-amber-500/20", 
      bg: "bg-amber-500/5",
      detail: "Active tenant collections synced"
    },
  ];

  const commissions = [
    { id: "COM-01", agent: "Zain Ali", role: "AGENT", property: "DHA Phase 6 Block H Villa", price: "Rs 35M", rate: "2.5%", split: "70/30 Split", payout: "Rs 612,500", margin: "Rs 262,500", status: "PENDING_RELEASE" },
    { id: "COM-02", agent: "Ayesha Malik", role: "AGENT", property: "Emaar Canyon Views Villa", price: "Rs 120M", rate: "2.0%", split: "75/25 Split", payout: "Rs 1,800,000", margin: "Rs 600,000", status: "RELEASED" },
    { id: "COM-03", agent: "Raza Khan", role: "AGENT", property: "Bahria Heights Apt 412", price: "Rs 18M", rate: "3.0%", split: "60/40 Split", payout: "Rs 324,000", margin: "Rs 216,000", status: "PENDING_RELEASE" },
    { id: "COM-04", agent: "Hamza Ali", role: "HR", property: "DHA Penthouse Suite 8B", price: "Rs 85M", rate: "2.0%", split: "50/50 Split", payout: "Rs 850,000", margin: "Rs 850,000", status: "RELEASED" },
  ];

  const invoices = [
    { id: "INV-2026-089", client: "Zohaib Hassan", category: "Agency Commission Fee", dueDate: "2026-05-28", amount: "Rs 850,000", status: "UNPAID" },
    { id: "INV-2026-088", client: "DHA Properties Ltd", category: "Property Management Contract", dueDate: "2026-05-25", amount: "Rs 120,000", status: "PAID" },
    { id: "INV-2026-087", client: "Sana Malik", category: "Tenant Security Deposit", dueDate: "2026-05-20", amount: "Rs 300,000", status: "PAID" },
    { id: "INV-2026-086", client: "Bilal Lodhi", category: "Residential Rent Collection", dueDate: "2026-05-18", amount: "Rs 150,000", status: "OVERDUE" },
  ];

  const expenses = [
    { id: "EXP-890", category: "Fleet & Fuel Logistics", details: "Fuel refills for Prado (LE-099) & Civic (MN-101)", cost: "Rs 45,000", date: "2026-05-22", reporter: "Logistics Admin" },
    { id: "EXP-889", category: "Software & IT SaaS", details: "Neon AWS Cloud Server & Mapbox Location APIs", cost: "Rs 120,000", date: "2026-05-20", reporter: "Finance Lead" },
    { id: "EXP-888", category: "Marketing & Ads", details: "Zillow Listings Promotion & Facebook Ads campaign", cost: "Rs 280,000", date: "2026-05-18", reporter: "Sales Manager" },
    { id: "EXP-887", category: "Property Maintenance", details: "AC compressor replacement at DHA Phase 6 Block H", cost: "Rs 32,000", date: "2026-05-15", reporter: "HR Manager" },
  ];

  const settlements = [
    { id: "SET-402", owner: "Malik Riaz", property: "DHA Phase 6 Villa", totalRent: "Rs 250,000", feeDeducted: "Rs 12,500", netPayout: "Rs 237,500", paidDate: "2026-05-22", status: "SETTLED" },
    { id: "SET-401", owner: "Mian Mansha", property: "Canyon Views Villa", totalRent: "Rs 600,000", feeDeducted: "Rs 30,000", netPayout: "Rs 570,000", paidDate: "Pending Cycles", status: "UNSETTLED" },
    { id: "SET-400", owner: "Sania Mirza", property: "Bahria Phase 8 Apartment", totalRent: "Rs 90,000", feeDeducted: "Rs 4,500", netPayout: "Rs 85,500", paidDate: "2026-05-18", status: "SETTLED" },
  ];

  return (
    <div className="p-8 animate-fade-in relative z-10 space-y-8 select-none">
      {/* Background neon glows */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[450px] h-[450px] bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Top Warning Banner Cabinet */}
      <div className="glass p-4.5 rounded-2xl border border-amber-500/25 bg-amber-500/5 flex items-center justify-between gap-4 animate-pulse-slow">
        <div className="flex items-center gap-3.5 text-left">
          <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
            <Lock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-1.5">
              Finance Hub &bull; Preview Mode Clearance
            </h4>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
              This terminal is currently locked in <strong>Read-Only Preview Mode</strong>. Transactional data commits, live banks, and payroll processing pipelines will be activated in Sprint 3.
            </p>
          </div>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500/15 border border-amber-500/35 px-3 py-1.5 rounded-full text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)] flex-shrink-0">
          DEVELOPMENT CLEARANCE - SPRINT 3
        </span>
      </div>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight flex items-center gap-3">
            Finance Management <span className="text-gradient font-black">Ledger</span>
          </h1>
          <p className="text-muted-foreground mt-1">Manage agency commissions, outstanding bills, corporate costs, and owner collection sheets.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => triggerPreviewAlert("Generate Ledger Report")}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-95 text-white font-semibold flex items-center gap-2 glow-primary transition-all duration-300 active:scale-[0.98]"
          >
            <Download className="w-5 h-5" />
            Download Monthly Audit
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((k, idx) => (
          <div 
            key={idx}
            className={`glass p-6 rounded-3xl border ${k.color} ${k.bg} transition-all duration-300 hover:-translate-y-1 relative group overflow-hidden`}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-card border border-border/80 ${k.color.split(" ")[0]}`}>
                <k.icon className="w-5.5 h-5.5" />
              </div>
              <span className={`text-[9px] font-black px-2.5 py-1.5 rounded-full bg-white/5 border border-white/10 ${k.change.startsWith("+") || k.change.includes("100%") ? "text-emerald-400" : "text-rose-400"}`}>
                {k.change}
              </span>
            </div>
            <div className="relative z-10 text-left">
              <h3 className="text-2.5xl font-black text-white">{k.value}</h3>
              <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mt-1.5">{k.title}</p>
              <p className="text-[10px] text-gray-500 mt-1 italic">{k.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Ledger Content Body */}
      <div className="glass rounded-3xl border border-border/40 overflow-hidden flex flex-col min-h-[500px]">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border/40 bg-secondary/15 p-2 overflow-x-auto gap-1">
          {[
            { id: "commissions", name: "Commissions split", count: commissions.length },
            { id: "invoices", name: "Invoices desk", count: invoices.length },
            { id: "expenses", name: "Expenses ledger", count: expenses.length },
            { id: "settlements", name: "Owner Settlements", count: settlements.length },
            { id: "reports", name: "Financial Audit Cabinet", count: null },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-5 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === t.id 
                  ? "bg-primary/10 border border-primary/20 text-primary glow-primary" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/40 border border-transparent"
              }`}
            >
              {t.name}
              {t.count !== null && (
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                  activeTab === t.id ? "bg-primary/25 text-primary" : "bg-white/5 text-muted-foreground border border-white/5"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Panel Content Box */}
        <div className="p-6 flex-1 flex flex-col justify-between">
          
          {/* 1. Commissions split */}
          {activeTab === "commissions" && (
            <div className="space-y-6 animate-fade-in text-left">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Coins className="w-5 h-5 text-primary" /> Brokerage Split Ledger
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">List of deal closings, agent split allocations, and corporate margin reserves.</p>
                </div>
                <button 
                  onClick={() => triggerPreviewAlert("Release Commission Split")}
                  className="px-4 py-2.5 rounded-xl border border-border/80 bg-secondary hover:bg-primary/10 text-xs font-semibold text-white flex items-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-accent" /> Release Agent Splits
                </button>
              </div>

              <div className="overflow-x-auto border border-border/40 rounded-2xl">
                <table className="w-full text-sm text-left divide-y divide-border/20">
                  <thead className="bg-secondary/20 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Trans-ID</th>
                      <th className="px-6 py-4">Closing Agent</th>
                      <th className="px-6 py-4">Listed Property</th>
                      <th className="px-6 py-4">Sale price</th>
                      <th className="px-6 py-4 text-center">Split Ratio</th>
                      <th className="px-6 py-4">Realtor payout</th>
                      <th className="px-6 py-4">Agency margin</th>
                      <th className="px-6 py-4">Payout status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {commissions.map(c => (
                      <tr key={c.id} className="hover:bg-secondary/15 transition-all">
                        <td className="px-6 py-4.5 font-mono font-bold text-primary">{c.id}</td>
                        <td className="px-6 py-4.5">
                          <div>
                            <div className="font-bold text-white">{c.agent}</div>
                            <div className="text-[9px] font-extrabold uppercase text-gray-500 tracking-wider mt-0.5">{c.role}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4.5 font-medium text-gray-300">{c.property}</td>
                        <td className="px-6 py-4.5 font-bold font-mono text-gray-200">{c.price}</td>
                        <td className="px-6 py-4.5 text-center">
                          <span className="text-[10px] font-black px-2.5 py-1 rounded bg-white/5 border border-white/10 text-gray-400 font-mono">
                            {c.split}
                          </span>
                        </td>
                        <td className="px-6 py-4.5 font-mono font-extrabold text-emerald-400">{c.payout}</td>
                        <td className="px-6 py-4.5 font-mono font-extrabold text-cyan-400">{c.margin}</td>
                        <td className="px-6 py-4.5">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 border rounded-full ${
                            c.status === "RELEASED" 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                              : "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse"
                          }`}>
                            {c.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. Invoices Desk */}
          {activeTab === "invoices" && (
            <div className="space-y-6 animate-fade-in text-left">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" /> Accounts Receivable (Invoices)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Manage Tenant rents, Brokerage invoice splits, and Landlord deposit statements.</p>
                </div>
                <button 
                  onClick={() => triggerPreviewAlert("Issue New Invoice")}
                  className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-xs font-semibold text-white flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                >
                  <Plus className="w-4 h-4" /> Issue Invoice
                </button>
              </div>

              <div className="overflow-x-auto border border-border/40 rounded-2xl">
                <table className="w-full text-sm text-left divide-y divide-border/20">
                  <thead className="bg-secondary/20 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Invoice No</th>
                      <th className="px-6 py-4">Client / Tenant</th>
                      <th className="px-6 py-4">Bill Category</th>
                      <th className="px-6 py-4">Due Date</th>
                      <th className="px-6 py-4">Invoice Amount</th>
                      <th className="px-6 py-4">Payment status</th>
                      <th className="px-6 py-4 text-center">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {invoices.map(i => (
                      <tr key={i.id} className="hover:bg-secondary/15 transition-all">
                        <td className="px-6 py-4.5 font-mono font-bold text-gray-300">{i.id}</td>
                        <td className="px-6 py-4.5">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-primary" />
                            {i.client}
                          </div>
                        </td>
                        <td className="px-6 py-4.5 font-medium text-gray-400">{i.category}</td>
                        <td className="px-6 py-4.5 font-mono text-gray-400">{i.dueDate}</td>
                        <td className="px-6 py-4.5 font-bold font-mono text-white">{i.amount}</td>
                        <td className="px-6 py-4.5">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 border rounded-full ${
                            i.status === "PAID" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                            i.status === "OVERDUE" ? "bg-rose-500/10 border-rose-500/20 text-rose-400 animate-pulse" :
                            "bg-amber-500/10 border-amber-500/20 text-amber-400"
                          }`}>
                            {i.status}
                          </span>
                        </td>
                        <td className="px-6 py-4.5">
                          <div className="flex gap-2 justify-center">
                            <button 
                              onClick={() => triggerPreviewAlert(`Print Invoice: ${i.id}`)}
                              className="p-2 rounded bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-secondary transition-all"
                              title="Print Statement"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => triggerPreviewAlert(`Send Email Remind: ${i.id}`)}
                              className="p-2 rounded bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-secondary transition-all"
                              title="Send Reminder"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. Expense Logger */}
          {activeTab === "expenses" && (
            <div className="space-y-6 animate-fade-in text-left">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" /> Accounts Payable (Expenses)
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Track office utility overheads, fleet repair request bills, and operational payouts.</p>
                </div>
                <button 
                  onClick={() => triggerPreviewAlert("Add New Operating Expense")}
                  className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-semibold text-white flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(244,63,94,0.15)]"
                >
                  <Plus className="w-4 h-4" /> Add Expense
                </button>
              </div>

              <div className="overflow-x-auto border border-border/40 rounded-2xl">
                <table className="w-full text-sm text-left divide-y divide-border/20">
                  <thead className="bg-secondary/20 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Expense ID</th>
                      <th className="px-6 py-4">Log Category</th>
                      <th className="px-6 py-4">Particular Details</th>
                      <th className="px-6 py-4">Outflow Cost</th>
                      <th className="px-6 py-4">Date Registered</th>
                      <th className="px-6 py-4">Authorized By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {expenses.map(e => (
                      <tr key={e.id} className="hover:bg-rose-500/5 transition-all">
                        <td className="px-6 py-4.5 font-mono font-bold text-rose-400">{e.id}</td>
                        <td className="px-6 py-4.5 font-bold text-white">{e.category}</td>
                        <td className="px-6 py-4.5 text-gray-300 text-xs leading-relaxed max-w-xs">{e.details}</td>
                        <td className="px-6 py-4.5 font-bold font-mono text-rose-300">{e.cost}</td>
                        <td className="px-6 py-4.5 font-mono text-gray-400">{e.date}</td>
                        <td className="px-6 py-4.5 font-bold text-gray-400">{e.reporter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. Owner Settlements */}
          {activeTab === "settlements" && (
            <div className="space-y-6 animate-fade-in text-left">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-primary" /> Landlord Settlements & Collections
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Manage Rent collection payouts to Landlords, subtracting ERP agency commissions.</p>
                </div>
                <button 
                  onClick={() => triggerPreviewAlert("Process Landlord Settlement Payout")}
                  className="px-4 py-2.5 rounded-xl border border-primary/20 bg-primary/10 hover:bg-primary/20 text-xs font-semibold text-primary flex items-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-accent animate-pulse" /> Settle Pending Payouts
                </button>
              </div>

              <div className="overflow-x-auto border border-border/40 rounded-2xl">
                <table className="w-full text-sm text-left divide-y divide-border/20">
                  <thead className="bg-secondary/20 text-muted-foreground text-[10px] font-black uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Settlement ID</th>
                      <th className="px-6 py-4">Landlord (Asset Owner)</th>
                      <th className="px-6 py-4">Listed Property</th>
                      <th className="px-6 py-4">Total Collected</th>
                      <th className="px-6 py-4">Agency Fee Split (5%)</th>
                      <th className="px-6 py-4">Net Landlord Payout</th>
                      <th className="px-6 py-4">Payout Date</th>
                      <th className="px-6 py-4">Settlement status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {settlements.map(s => (
                      <tr key={s.id} className="hover:bg-secondary/15 transition-all">
                        <td className="px-6 py-4.5 font-mono font-bold text-gray-300">{s.id}</td>
                        <td className="px-6 py-4.5 font-bold text-white">{s.owner}</td>
                        <td className="px-6 py-4.5 font-medium text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <Building className="w-3.5 h-3.5 text-primary" />
                            {s.property}
                          </div>
                        </td>
                        <td className="px-6 py-4.5 font-mono font-semibold text-gray-200">{s.totalRent}</td>
                        <td className="px-6 py-4.5 font-mono font-bold text-rose-400">{s.feeDeducted}</td>
                        <td className="px-6 py-4.5 font-mono font-extrabold text-emerald-400">{s.netPayout}</td>
                        <td className="px-6 py-4.5 font-mono text-gray-400">{s.paidDate}</td>
                        <td className="px-6 py-4.5">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 border rounded-full ${
                            s.status === "SETTLED" 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                              : "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse"
                          }`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Financial Reports Cabinet */}
          {activeTab === "reports" && (
            <div className="space-y-6 animate-fade-in text-left">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" /> Corporate Audit Statements
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Aggregate profitability splits, operating margins, and custom Excel/PDF statement prints.</p>
                </div>
                <button 
                  onClick={() => triggerPreviewAlert("Generate Audit PDF Report")}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-95 text-xs font-semibold text-white flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                >
                  <Download className="w-4 h-4" /> Export Audit Sheets
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Net Income Report Card */}
                <div className="glass p-6 rounded-2xl border border-border/40 relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 p-3">
                    <span className="text-[8px] font-black uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
                      Live
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Brokerage Net Income</span>
                    <h2 className="text-3xl font-black text-white mt-1.5">Rs 14,100,000</h2>
                    <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" /> +14.2% Growth vs Last Quarter
                    </p>
                  </div>
                  <button 
                    onClick={() => triggerPreviewAlert("View Profit/Loss Ledger")}
                    className="mt-6 w-full py-2.5 rounded-xl bg-secondary hover:bg-primary/10 border border-border/60 text-center text-xs font-semibold text-white transition-all flex items-center justify-center gap-1 group"
                  >
                    View Profit/Loss Statement
                    <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                </div>

                {/* Operating Costs Report Card */}
                <div className="glass p-6 rounded-2xl border border-border/40 relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 p-3">
                    <span className="text-[8px] font-black uppercase bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded">
                      Budget
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Operating Outflows</span>
                    <h2 className="text-3xl font-black text-white mt-1.5">Rs 1,560,000</h2>
                    <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 animate-pulse" /> 84% of Allocated Monthly Budget Spent
                    </p>
                  </div>
                  <button 
                    onClick={() => triggerPreviewAlert("View Corporate Expenses Ledger")}
                    className="mt-6 w-full py-2.5 rounded-xl bg-secondary hover:bg-primary/10 border border-border/60 text-center text-xs font-semibold text-white transition-all flex items-center justify-center gap-1 group"
                  >
                    View Cost Breakdown
                    <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                </div>

                {/* Tax & Auditing Report Card */}
                <div className="glass p-6 rounded-2xl border border-border/40 relative overflow-hidden flex flex-col justify-between">
                  <div className="absolute top-0 right-0 p-3">
                    <span className="text-[8px] font-black uppercase bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded">
                      Compliant
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Tax & Regulatory Audits</span>
                    <h2 className="text-3xl font-black text-white mt-1.5">Q2 2026 Audit</h2>
                    <p className="text-xs text-cyan-400 mt-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> Fully synchronized FBR Tax Statements
                    </p>
                  </div>
                  <button 
                    onClick={() => triggerPreviewAlert("View Regulatory Tax Roster")}
                    className="mt-6 w-full py-2.5 rounded-xl bg-secondary hover:bg-primary/10 border border-border/60 text-center text-xs font-semibold text-white transition-all flex items-center justify-center gap-1 group"
                  >
                    Open Regulatory Ledger
                    <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Roster Footnote */}
          <div className="mt-8 border-t border-border/20 pt-4 flex justify-between items-center text-[10px] text-muted-foreground select-none">
            <div className="flex gap-4">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live Balances</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Pending Audits</span>
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Expense Caps</span>
            </div>
            <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-muted-foreground" /> Security Clearances Active</span>
          </div>

        </div>
      </div>

      {/* Floating Glassmorphic Alert Toast Notification Cabinet */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[100] animate-slide-up-fade">
          <div className="glass max-w-sm p-4 rounded-2xl border border-rose-500/30 bg-rose-950/20 text-left shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-rose-500/5 to-transparent pointer-events-none"></div>
            <div className="flex items-start gap-3 relative z-10">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4.5 h-4.5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black uppercase text-white tracking-wider">Transaction Vault Lock</h4>
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  {toastMessage.split(": ")[1] || toastMessage}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
