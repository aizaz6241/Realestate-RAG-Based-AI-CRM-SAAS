"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Plus, 
  Phone, 
  Loader2, 
  Target, 
  X, 
  User, 
  Sparkles, 
  Trash2, 
  Mail, 
  AlertTriangle, 
  ExternalLink,
  Search,
  Filter
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const COLUMNS = [
  { id: "NEW", title: "New Leads", color: "bg-cyan-500", text: "text-cyan-400", border: "border-cyan-500/20" },
  { id: "CONTACTED", title: "Contacted", color: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/20" },
  { id: "ENGAGED", title: "Engaged", color: "bg-purple-500", text: "text-purple-400", border: "border-purple-500/20" },
  { id: "DISQUALIFIED", title: "Disqualified", color: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/20" },
  { id: "CLOSED", title: "Closed / Won", color: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/20" },
];

export default function LeadsCRMPage() {
  const { token, user: currentUser } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modals & Submitting
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState("ALL");

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    source: "WEBSITE",
    status: "NEW",
    description: "",
    assignedToId: "",
  });

  const fetchLeads = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("http://localhost:3001/leads", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (error) {
      console.error("Error fetching leads:", error);
      // Premium Mock Fallback
      setLeads([
        { 
          id: "mock1", 
          name: "Sara Khan", 
          phone: "0300 111 2222", 
          email: "sara.k@gmail.com", 
          source: "FACEBOOK", 
          status: "NEW", 
          score: 85,
          isDuplicate: true,
          assignedTo: { firstName: "Ali", lastName: "Raza" },
          createdAt: new Date() 
        },
        { 
          id: "mock2", 
          name: "Ali Raza", 
          phone: "0321 555 6666", 
          email: "ali.raza@yahoo.com", 
          source: "WEBSITE", 
          status: "CONTACTED", 
          score: 55,
          isDuplicate: false,
          assignedTo: null,
          createdAt: new Date() 
        },
        { 
          id: "mock3", 
          name: "Bilal Ahmed", 
          phone: "0312 999 8888", 
          email: "bilal@outlook.com", 
          source: "ZILLOW", 
          status: "ENGAGED", 
          score: 95,
          isDuplicate: false,
          assignedTo: { firstName: "Zain", lastName: "Khan" },
          createdAt: new Date() 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (!token) return;
    try {
      const res = await fetch("http://localhost:3001/employees", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (e) {
      console.error("Error fetching employees:", e);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchEmployees();
  }, [token]);

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId !== destination.droppableId) {
      const updatedStatus = destination.droppableId;
      setLeads(leads.map(lead => lead.id === draggableId ? { ...lead, status: updatedStatus } : lead));
      
      try {
        await fetch(`http://localhost:3001/leads/${draggableId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: updatedStatus }),
        });
      } catch (error) {
        console.error("Failed to update status on server:", error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        phone: formData.phone,
        email: formData.email || null,
        source: formData.source,
        status: formData.status,
        description: formData.description || null,
        assignedToId: formData.assignedToId || undefined,
      };

      const res = await fetch("http://localhost:3001/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFormData({
          name: "",
          phone: "",
          email: "",
          source: "WEBSITE",
          status: "NEW",
          description: "",
          assignedToId: "",
        });
        fetchLeads();
      } else {
        const errText = await res.text();
        console.error("Server error when saving lead:", res.status, errText);
        alert(`Error: Server returned status ${res.status} - ${errText}`);
      }
    } catch (error) {
      console.error("Error creating lead:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLead = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm("Are you sure you want to permanently delete this lead?")) return;
    try {
      const res = await fetch(`http://localhost:3001/leads/${leadId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchLeads();
      }
    } catch (e) {
      console.error("Error deleting lead:", e);
    }
  };

  const getSourceColor = (source: string) => {
    switch (source?.toUpperCase()) {
      case "FACEBOOK": return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "WEBSITE": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "INSTAGRAM": return "bg-pink-500/10 text-pink-400 border-pink-500/20";
      case "ZILLOW": return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
      case "PROPERTY_FINDER": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "REFERRAL": return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default: return "bg-secondary/40 text-gray-400 border-border/40";
    }
  };

  const getScoreStyle = (score: number) => {
    if (score >= 70) return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]";
    if (score >= 40) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  };

  // Filtering leads locally before columns mapping
  const filteredLeads = leads.filter(l => {
    const matchesSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          l.phone?.includes(searchQuery) ||
                          l.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSource = selectedSource === "ALL" || l.source?.toUpperCase() === selectedSource.toUpperCase();
    return matchesSearch && matchesSource;
  });

  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";

  return (
    <div className="min-h-screen p-8 relative z-10 overflow-x-hidden space-y-8">
      {/* Background Neon Glows */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex justify-between items-center animate-fade-in">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Leads CRM Command Center</h1>
          <p className="text-muted-foreground mt-1">Manage, qualify, score, and allocate real estate client leads through drag-and-drop pipeline stages.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary transition-all duration-300 hover:scale-[1.03]"
        >
          <Plus className="w-5 h-5" />
          Add CRM Lead
        </button>
      </div>

      {/* Filters & Tools Cabinet */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between animate-fade-in bg-secondary/20 p-4 rounded-2xl border border-border/40 backdrop-blur-md">
        <div className="flex flex-1 items-center gap-3 bg-secondary/40 border border-border/60 rounded-xl px-3 py-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search leads by name, email, or phone..."
            className="w-full bg-transparent border-0 outline-none focus:ring-0 text-sm text-white py-2"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-xs text-gray-300 font-bold">Source:</span>
          <select
            className="glass-input px-3.5 py-2 rounded-xl text-xs bg-secondary border border-border/60 outline-none"
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
          >
            <option value="ALL">All Lead Sources</option>
            <option value="WEBSITE">Website</option>
            <option value="FACEBOOK">Facebook Ads</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="ZILLOW">Zillow Listing</option>
            <option value="PROPERTY_FINDER">Property Finder</option>
            <option value="REFERRAL">Referral Agent</option>
            <option value="DIRECT">Direct Call</option>
          </select>
        </div>
      </div>

      {/* Kanban Pipeline Column Container */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-6 overflow-x-auto pb-8 snap-x min-h-[650px] scrollbar-thin">
            {COLUMNS.map((col) => {
              const columnLeads = filteredLeads.filter(l => l.status === col.id);
              return (
                <div key={col.id} className="min-w-[320px] max-w-[320px] flex flex-col snap-center">
                  
                  {/* Column Header */}
                  <div className={`flex justify-between items-center mb-4 px-3 py-2 rounded-xl bg-secondary/30 border ${col.border} backdrop-blur-md`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3.5 h-3.5 rounded-full ${col.color} shadow-[0_0_10px_currentColor]`}></div>
                      <h3 className="font-bold text-sm tracking-wide text-white">{col.title}</h3>
                    </div>
                    <span className="text-xs font-black bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full text-gray-300">
                      {columnLeads.length}
                    </span>
                  </div>

                  {/* Droppable Board Column Area */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 glass rounded-3xl p-3.5 flex flex-col gap-4 min-h-[500px] border border-border/40 transition-all duration-300 ${
                          snapshot.isDraggingOver ? "bg-primary/5 border-primary/30" : ""
                        }`}
                      >
                        {columnLeads.map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`bg-card/75 hover:bg-card border border-border/50 rounded-2xl p-4.5 shadow-md transition-all duration-300 relative group flex flex-col justify-between ${
                                  snapshot.isDragging ? "glow-primary border-primary bg-card/95 scale-[1.03] rotate-1" : "hover:border-primary/40"
                                }`}
                              >
                                <div className="space-y-3.5">
                                  
                                  {/* Duplicate Match Blinking Alert */}
                                  {lead.isDuplicate && (
                                    <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/25 px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-red-400 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.08)]">
                                      <AlertTriangle className="w-3 h-3 text-red-400" />
                                      Potential Duplicate Match
                                    </div>
                                  )}

                                  {/* Lead Header */}
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="overflow-hidden flex-1">
                                      <Link
                                        href={`/leads/${lead.id}`}
                                        className="font-extrabold text-white text-base hover:text-primary transition-colors flex items-center gap-1 group/link cursor-pointer leading-tight truncate"
                                      >
                                        {lead.name}
                                        <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover/link:text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                                      </Link>
                                    </div>
                                    
                                    {isAdmin && (
                                      <button
                                        onClick={(e) => handleDeleteLead(lead.id, e)}
                                        className="text-gray-500 hover:text-red-400 transition-colors p-1"
                                        title="Delete Lead"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                  
                                  {/* Lead Source & Score Pills */}
                                  <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
                                    <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${getSourceColor(lead.source)}`}>
                                      {lead.source || "DIRECT"}
                                    </span>

                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-md border flex items-center gap-1 ${getScoreStyle(lead.score)}`}>
                                      <Sparkles className="w-2.5 h-2.5" />
                                      {lead.score || 0}% score
                                    </span>
                                  </div>

                                  {/* Contact Details */}
                                  <div className="space-y-2 text-xs text-gray-300">
                                    <div className="flex items-center gap-2 font-medium">
                                      <Phone className="w-3.5 h-3.5 text-primary" />
                                      <span>{lead.phone || "No phone archived"}</span>
                                    </div>
                                    {lead.email && (
                                      <div className="flex items-center gap-2 font-medium">
                                        <Mail className="w-3.5 h-3.5 text-primary" />
                                        <span className="truncate max-w-[200px]">{lead.email}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Realtor Agent Roster Tag */}
                                <div className="mt-4 pt-3 border-t border-border/40 flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3 text-primary" />
                                    <span>
                                      {lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName || ""}` : "Unallocated"}
                                    </span>
                                  </span>
                                  
                                  <Link
                                    href={`/leads/${lead.id}`}
                                    className="text-primary hover:text-white transition-colors cursor-pointer text-[9px] font-black tracking-widest bg-primary/10 border border-primary/20 px-2 py-0.5 rounded"
                                  >
                                    LOGS TIMELINE
                                  </Link>
                                </div>

                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Add Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-xl rounded-2xl overflow-hidden border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Add New CRM Lead
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Lead Client Name</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="Sara Khan"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Realtor Roster Assignment</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.assignedToId}
                    onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                  >
                    <option value="">-- Auto Assignment (Round-Robin) --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName || ""} ({e.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Phone Number</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="0300 1234567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="sara@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Lead Acquisition Channel</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  >
                    <option value="WEBSITE">Website Form Submission</option>
                    <option value="FACEBOOK">Facebook Campaign</option>
                    <option value="INSTAGRAM">Instagram Chat</option>
                    <option value="ZILLOW">Zillow Listing Portal</option>
                    <option value="PROPERTY_FINDER">Property Finder Aggregator</option>
                    <option value="REFERRAL">Brokerage Referral</option>
                    <option value="DIRECT">Direct Call / Office Walk-in</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Initial Pipeline Stage</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="NEW">New Leads Queue</option>
                    <option value="CONTACTED">Active Contacted</option>
                    <option value="ENGAGED">Engaged Proposal</option>
                    <option value="DISQUALIFIED">Disqualified Trash</option>
                    <option value="CLOSED">Closed/Won Deal</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Brief Description (Impacts Lead Quality Score)</label>
                <textarea
                  rows={3}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="Client looking for a 3-bedroom villa in DHA Bahria Lahore. Budget is ~6.5 Crores."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center gap-2 glow-primary transition-all duration-300"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Register & Assign Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
