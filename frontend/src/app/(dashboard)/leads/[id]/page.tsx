"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft,
  Loader2, 
  Target, 
  User, 
  Sparkles, 
  Mail, 
  Phone, 
  AlertTriangle, 
  Calendar, 
  ChevronRight,
  Plus,
  Send,
  MessageSquare,
  PhoneCall,
  FileText,
  Clock,
  Briefcase
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  
  const leadId = params.id as string;
  
  // Data State
  const [lead, setLead] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("overview"); // overview, timeline

  // Activity Form
  const [activityType, setActivityType] = useState("NOTES"); // CALL, EMAIL, NOTES
  const [activityDescription, setActivityDescription] = useState("");
  const [isLoggingActivity, setIsLoggingActivity] = useState(false);

  // Edit Lead Form
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    source: "WEBSITE",
    status: "NEW",
    score: 0,
    assignedToId: "",
  });

  const fetchData = async () => {
    if (!token || !leadId) return;
    try {
      // Fetch Lead Detail
      const leadRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/leads/${leadId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (leadRes.ok) {
        const leadData = await leadRes.json();
        setLead(leadData);
        setFormData({
          name: leadData.name || "",
          phone: leadData.phone || "",
          email: leadData.email || "",
          source: leadData.source || "WEBSITE",
          status: leadData.status || "NEW",
          score: leadData.score || 0,
          assignedToId: leadData.assignedToId || "",
        });
      } else {
        router.push("/leads");
      }

      // Fetch Employees for Reallocation
      const empRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (empRes.ok) {
        setEmployees(await empRes.json());
      }

    } catch (e) {
      console.error(e);
      // Fallback dummy detail
      const mockLead = {
        id: leadId,
        name: "Sara Khan",
        phone: "0300 111 2222",
        email: "sara.k@gmail.com",
        source: "FACEBOOK",
        status: "NEW",
        score: 85,
        isDuplicate: true,
        duplicateOfId: "original-client-uuid",
        assignedToId: "emp1",
        assignedTo: { firstName: "Ali", lastName: "Raza", role: "AGENT" },
        createdAt: new Date().toISOString(),
        activities: [
          { id: "act1", type: "NOTES", description: "Lead created from source: FACEBOOK. Automated lead quality score evaluated at: 85%.", activityDate: new Date(Date.now() - 4 * 3600 * 1000).toISOString() },
          { id: "act2", type: "CALL", description: "Initial call verification - Client confirmed interest in DHA Phase 6 villa.", activityDate: new Date(Date.now() - 2 * 3600 * 1000).toISOString() }
        ]
      };
      setLead(mockLead);
      setFormData({
        name: mockLead.name,
        phone: mockLead.phone,
        email: mockLead.email,
        source: mockLead.source,
        status: mockLead.status,
        score: mockLead.score,
        assignedToId: mockLead.assignedToId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, leadId]);

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/leads/${leadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        fetchData();
        alert("Lead command center details updated successfully!");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityDescription.trim()) return;
    setIsLoggingActivity(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/leads/${leadId}/activities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type: activityType,
          description: activityDescription
        })
      });

      if (res.ok) {
        setActivityDescription("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoggingActivity(false);
    }
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 70) return "text-cyan-400 border-cyan-500/30 bg-cyan-950/10 shadow-[0_0_15px_rgba(6,182,212,0.15)]";
    if (score >= 40) return "text-amber-400 border-amber-500/30 bg-amber-950/10";
    return "text-rose-400 border-rose-500/30 bg-rose-950/10";
  };

  const getActivityIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case "CALL": return PhoneCall;
      case "EMAIL": return Mail;
      case "STATUS_CHANGE": return Briefcase;
      default: return FileText;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type?.toUpperCase()) {
      case "CALL": return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
      case "EMAIL": return "text-pink-400 bg-pink-500/10 border-pink-500/20";
      case "STATUS_CHANGE": return "text-purple-400 bg-purple-500/10 border-purple-500/20";
      default: return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
        <div className="absolute top-[30%] left-[30%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary glow-primary" />
          <p className="text-xs font-black tracking-widest text-primary/70 uppercase">Acquiring Command Center Panel...</p>
        </div>
      </div>
    );
  }

  if (!lead) return null;

  return (
    <div className="min-h-screen p-8 relative z-10 space-y-8 max-w-7xl mx-auto">
      {/* Background Neon glows */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Breadcrumb Back Navigation */}
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground animate-fade-in">
        <Link href="/leads" className="hover:text-primary transition-colors flex items-center gap-1.5 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Leads Board
        </Link>
        <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
        <span className="text-white">Command Center Details</span>
      </div>

      {/* Main Header / Top Profile Dashboard */}
      <div className="glass rounded-3xl p-6.5 border border-border/60 animate-fade-in flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 flex-shrink-0">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">{lead.name}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Created: {new Date(lead.createdAt).toLocaleDateString([], { dateStyle: 'long' })}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded bg-secondary border border-border text-gray-300">
              Source: {lead.source || "DIRECT"}
            </span>
            <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded border ${
              lead.status === 'CLOSED' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
              lead.status === 'DISQUALIFIED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
              lead.status === 'ENGAGED' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
              'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
            }`}>
              Stage: {lead.status}
            </span>
          </div>
        </div>

        {/* Score indicator glow meter */}
        <div className={`p-4 border rounded-2xl flex items-center gap-4.5 ${getScoreColorClass(lead.score)}`}>
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground block">Deal Match score</span>
            <span className="text-2xl font-black">{lead.score || 0}%</span>
          </div>
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-white flex-shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse text-primary shadow-[0_0_10px_currentColor]" />
          </div>
        </div>
      </div>

      {/* Blinking Potential Duplicate Warning Box */}
      {lead.isDuplicate && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 bg-red-500/10 border border-red-500/25 rounded-2xl gap-4 animate-fade-in shadow-[0_0_15px_rgba(239,68,68,0.05)]">
          <div className="flex gap-3">
            <AlertTriangle className="w-5.5 h-5.5 text-red-400 flex-shrink-0" />
            <div>
              <h4 className="font-extrabold text-red-400 text-sm">Potential Duplicate Entry Warning</h4>
              <p className="text-xs text-gray-300 mt-1">This lead email/phone matches another registered client profile inside the ERP database. This may be a double allocation.</p>
            </div>
          </div>
          {lead.duplicateOfId && (
            <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-white">
              Original Record Ref: {lead.duplicateOfId.slice(0, 8)}...
            </span>
          )}
        </div>
      )}

      {/* Tabs Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Tab Selectors & Main Operations */}
        <div className="lg:col-span-2 space-y-6 animate-fade-in">
          
          {/* Tab Selector Links */}
          <div className="flex gap-2 border-b border-border/40 pb-2">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4.5 py-3 rounded-xl text-xs uppercase tracking-widest font-black transition-all cursor-pointer ${
                activeTab === "overview"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              }`}
            >
              Overview Profile
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-4.5 py-3 rounded-xl text-xs uppercase tracking-widest font-black transition-all cursor-pointer ${
                activeTab === "timeline"
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
              }`}
            >
              Logs & Timelines ({lead.activities?.length || 0})
            </button>
          </div>

          {/* 1. OVERVIEW PROFILE TAB CONTENT */}
          {activeTab === "overview" && (
            <div className="glass rounded-3xl p-6.5 border border-border/60">
              <form onSubmit={handleUpdateLead} className="space-y-6">
                <h3 className="text-lg font-bold border-b border-border pb-3 text-white">Lead Demographics & Assignment</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Lead Client Name</label>
                    <input
                      required
                      type="text"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Reallocated Agent Realtor</label>
                    <select
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                      value={formData.assignedToId}
                      onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                    >
                      <option value="">-- Unallocated Pool --</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.firstName} {e.lastName || ""} ({e.role})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Phone Contact</label>
                    <input
                      required
                      type="text"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Acquisition Source</label>
                    <select
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    >
                      <option value="WEBSITE">Website</option>
                      <option value="FACEBOOK">Facebook Campaign</option>
                      <option value="INSTAGRAM">Instagram Chat</option>
                      <option value="ZILLOW">Zillow Listing Portal</option>
                      <option value="PROPERTY_FINDER">Property Finder</option>
                      <option value="REFERRAL">Referral Agent</option>
                      <option value="DIRECT">Direct Call</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Pipeline Stage Status</label>
                    <select
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="NEW">New Leads Queue</option>
                      <option value="CONTACTED">Active Contacted</option>
                      <option value="MEETING_SCHEDULED">Meeting Scheduled</option>
                      <option value="ENGAGED">Engaged Proposal</option>
                      <option value="CLOSED">Closed/Won Deal</option>
                      <option value="DISQUALIFIED">Disqualified Trash</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Override Quality Score (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={formData.score}
                      onChange={(e) => setFormData({ ...formData, score: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-border/40">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold flex items-center gap-2 glow-primary transition-all duration-300"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Command Parameters
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 2. LOGS & TIMELINES TAB CONTENT */}
          {activeTab === "timeline" && (
            <div className="space-y-6">
              
              {/* Interaction registration form */}
              <div className="glass rounded-3xl p-6.5 border border-border/60">
                <form onSubmit={handleLogActivity} className="space-y-4">
                  <h3 className="text-lg font-bold border-b border-border pb-3 text-white flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" /> Log Realtor Activity Interaction
                  </h3>
                  
                  <div className="flex gap-2.5 pb-2">
                    {["NOTES", "CALL", "EMAIL"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActivityType(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors border cursor-pointer ${
                          activityType === t
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "text-muted-foreground border-border/40 hover:text-white"
                        }`}
                      >
                        {t === "NOTES" ? "Notes / WhatsApp" : t}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Interaction summary / Calling Logs Summary</label>
                    <textarea
                      required
                      rows={3}
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      placeholder="Type details of client calling feedback or contract review notes here..."
                      value={activityDescription}
                      onChange={(e) => setActivityDescription(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end pt-3">
                    <button
                      type="submit"
                      disabled={isLoggingActivity}
                      className="px-4.5 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold flex items-center gap-2 shadow glow-primary"
                    >
                      {isLoggingActivity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Push Timeline Log
                    </button>
                  </div>
                </form>
              </div>

              {/* Sequential Timeline logs */}
              <div className="glass rounded-3xl p-6.5 border border-border/60 space-y-6">
                <h3 className="text-lg font-bold border-b border-border pb-3 text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" /> Chronological CRM Engagement Timeline
                </h3>
                
                {lead.activities?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center italic">No communications logs found inside the lead timeline yet.</p>
                ) : (
                  <div className="relative border-l-2 border-border/60 pl-6 ml-4 space-y-6.5">
                    {lead.activities?.map((act: any) => {
                      const Icon = getActivityIcon(act.type);
                      return (
                        <div key={act.id} className="relative space-y-1.5 animate-fade-in group">
                          
                          {/* Chronological Dot icon glow indicator */}
                          <div className={`absolute -left-[35px] top-1 w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform ${getActivityColor(act.type)}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${getActivityColor(act.type)}`}>
                              {act.type}
                            </span>
                            <span className="text-[10px] text-gray-500 font-bold">
                              {new Date(act.activityDate).toLocaleDateString([], { dateStyle: 'medium' })} &bull; {new Date(act.activityDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <p className="text-sm text-gray-200 font-medium leading-relaxed bg-secondary/10 border border-border/30 rounded-xl p-3.5 max-w-2xl">
                            {act.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Right Column: Mini profile & assigned agent cards */}
        <div className="space-y-6 animate-fade-in">
          
          {/* Quick Demographics info card */}
          <div className="glass rounded-3xl p-6 border border-border/60 space-y-5">
            <h4 className="font-extrabold text-white text-sm border-b border-border pb-3 uppercase tracking-wider">Fast Contact Drawer</h4>
            
            <div className="space-y-4 text-sm text-gray-300">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-[10px] text-gray-500 font-black uppercase tracking-widest">Phone Direct</span>
                  <a href={`tel:${lead.phone}`} className="font-bold text-white hover:text-primary transition-colors hover:underline">{lead.phone || "N/A"}</a>
                </div>
              </div>

              {lead.email && (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <span className="block text-[10px] text-gray-500 font-black uppercase tracking-widest">Email Mailbox</span>
                    <a href={`mailto:${lead.email}`} className="font-bold text-white hover:text-primary transition-colors hover:underline block truncate max-w-[200px]" title={lead.email}>{lead.email}</a>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-[10px] text-gray-500 font-black uppercase tracking-widest">Registration Date</span>
                  <span className="font-bold text-white">{new Date(lead.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Assigned Agent detail Card */}
          <div className="glass rounded-3xl p-6 border border-border/60 space-y-4">
            <h4 className="font-extrabold text-white text-sm border-b border-border pb-3 uppercase tracking-wider">Assigned Realtor</h4>
            
            {lead.assignedTo ? (
              <div className="space-y-4.5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20 flex-shrink-0 font-bold text-lg">
                    {lead.assignedTo.firstName?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h5 className="font-extrabold text-white text-base leading-tight">
                      {lead.assignedTo.firstName} {lead.assignedTo.lastName || ""}
                    </h5>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5 block">Role: <strong className="text-white">{lead.assignedTo.role}</strong></span>
                  </div>
                </div>
                
                <div className="bg-secondary/20 border border-border/40 p-3 rounded-xl text-xs space-y-1.5 text-gray-300">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-primary" />
                    <span className="truncate block max-w-[200px]">{lead.assignedTo.email}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 bg-secondary/15 rounded-2xl border border-dashed border-border/60">
                <User className="w-8 h-8 text-primary mx-auto opacity-70 mb-2" />
                <p className="text-xs text-muted-foreground">Unallocated Pool Lead</p>
                <p className="text-[9px] text-gray-500 uppercase tracking-widest font-black mt-1">Pending Realtor allocation</p>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
