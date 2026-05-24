"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Loader2,
  X,
  User,
  Clock,
  Calendar,
  FileText,
  Activity,
  Trash2,
  Settings,
  ArrowLeft,
  ShieldCheck,
  Building,
  Phone,
  Handshake,
  MapPin,
  BedDouble,
  Bath,
  Square,
  DollarSign,
  Heart,
  Plus,
  Mail
} from "lucide-react";

export default function ClientCommandCenter() {
  const { id } = useParams();
  const router = useRouter();
  const { token } = useAuth();

  const [client, setClient] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form States
  const [profileData, setProfileData] = useState({ name: "", email: "", phone: "", type: "BUYER", stage: "INQUIRY", budget: "", preferences: "", address: "" });
  const [interestData, setInterestData] = useState({ propertyId: "" });
  const [viewingData, setViewingData] = useState({ propertyId: "", viewingDate: "", feedback: "" });
  const [commsData, setCommsData] = useState({ type: "CALL", summary: "" });

  const fetchClientData = async () => {
    if (!token) return;
    try {
      // 1. Fetch Client CRM
      const res = await fetch(`http://localhost:3001/clients/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClient(data);

        // Prep Forms
        setProfileData({
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
          type: data.type || "BUYER",
          stage: data.stage || "INQUIRY",
          budget: data.budget?.toString() || "",
          preferences: data.preferences || "",
          address: data.address || ""
        });
      }

      // 2. Fetch all properties to populate dropdowns
      const propRes = await fetch("http://localhost:3001/properties", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (propRes.ok) {
        setProperties(await propRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClientData();
  }, [id, token]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`http://localhost:3001/clients/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      if (res.ok) {
        alert("Client CRM Profile updated successfully!");
        fetchClientData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddInterest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interestData.propertyId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`http://localhost:3001/clients/${id}/interests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(interestData)
      });
      if (res.ok) {
        setInterestData({ propertyId: "" });
        fetchClientData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveInterest = async (interestId: string) => {
    try {
      const res = await fetch(`http://localhost:3001/clients/${id}/interests/${interestId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchClientData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleScheduleViewing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingData.propertyId || !viewingData.viewingDate) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`http://localhost:3001/clients/${id}/viewings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(viewingData)
      });
      if (res.ok) {
        setViewingData({ propertyId: "", viewingDate: "", feedback: "" });
        fetchClientData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateViewingStatus = async (viewingId: string, status: string, feedback?: string) => {
    try {
      const res = await fetch(`http://localhost:3001/clients/${id}/viewings/${viewingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, feedback })
      });
      if (res.ok) {
        fetchClientData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`http://localhost:3001/clients/${id}/communications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(commsData)
      });
      if (res.ok) {
        setCommsData({ type: "CALL", summary: "" });
        fetchClientData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        <Loader2 className="w-10 h-10 animate-spin text-primary glow-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center text-center">
        <p className="text-xl font-bold text-red-400 mb-4">Client not found.</p>
        <button onClick={() => router.push("/clients")} className="bg-primary px-5 py-2.5 rounded-xl font-bold text-white shadow-lg flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" /> Back to Directory
        </button>
      </div>
    );
  }

  const tabs = [
    { id: "overview", name: "CRM Profile", icon: User },
    { id: "interests", name: "Property Interest", icon: Heart },
    { id: "viewings", name: "Viewing Schedules", icon: Calendar },
    { id: "timeline", name: "Contact Timelines", icon: Activity }
  ];

  return (
    <div className="min-h-screen p-8 relative z-10 overflow-x-hidden space-y-8 animate-fade-in">
      <div className="absolute top-10 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header back button */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/clients")}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 font-bold uppercase tracking-wider text-xs"
        >
          <ArrowLeft className="w-4 h-4" /> Back to CRM
        </button>
        <span className="text-xs font-black uppercase text-gray-500 tracking-widest bg-secondary/40 border border-border px-3 py-1.5 rounded-full">
          Client ID: {client.id.slice(0, 8)}...
        </span>
      </div>

      {/* Header Profile Summary */}
      <div className="glass rounded-3xl p-6.5 border border-border flex flex-col md:flex-row gap-6 items-center md:items-start bg-card/25">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-primary to-cyan-500 flex items-center justify-center text-4xl font-extrabold text-white glow-primary select-none flex-shrink-0 shadow-lg">
          {client.name.charAt(0)}
        </div>
        <div className="flex-1 text-center md:text-left space-y-3.5">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">{client.name}</h1>
            <p className="text-sm font-semibold text-gray-400 mt-1 flex items-center justify-center md:justify-start gap-2">
              <Phone className="w-4.5 h-4.5 text-primary" /> {client.phone} &bull;{" "}
              <Mail className="w-4.5 h-4.5 text-primary" /> {client.email || "No Email Address"}
            </p>
          </div>
          <div className="flex flex-wrap justify-center md:justify-start gap-3 items-center pt-2">
            <span className="text-[10px] uppercase font-black px-3 py-1.5 rounded-full bg-secondary border border-border text-gray-300">
              {client.type}
            </span>
            <span className="text-[10px] uppercase font-black px-3 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/25 tracking-widest">
              Stage: {client.stage}
            </span>
            {client.budget && (
              <span className="text-[10px] font-black uppercase px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                Budget Limit: PKR {client.budget.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/40 pb-2 overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4.5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all flex-shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            }`}
          >
            <tab.icon className="w-4.5 h-4.5" />
            {tab.name}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="animate-fade-in">
        
        {/* 1. CRM PROFILE */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <Settings className="w-5 h-5 text-primary" /> CRM Profile settings
              </h2>
              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Client Name</label>
                    <input
                      required
                      type="text"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Phone Number</label>
                    <input
                      required
                      type="text"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Max Budget Limit (PKR)</label>
                    <input
                      type="number"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={profileData.budget}
                      onChange={(e) => setProfileData({ ...profileData, budget: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Client Type</label>
                    <select
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={profileData.type}
                      onChange={(e) => setProfileData({ ...profileData, type: e.target.value })}
                    >
                      <option value="BUYER">Property Buyer</option>
                      <option value="TENANT">Property Tenant</option>
                      <option value="INVESTOR">Asset Investor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">CRM Deal Stage</label>
                    <select
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={profileData.stage}
                      onChange={(e) => setProfileData({ ...profileData, stage: e.target.value })}
                    >
                      <option value="INQUIRY">Inquiry Received</option>
                      <option value="VIEWING">Viewings Scheduled</option>
                      <option value="OFFER">Offers Registered</option>
                      <option value="CLOSED">Deals Closed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Renting / Buying Preferences</label>
                  <textarea
                    rows={3}
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm resize-none"
                    value={profileData.preferences}
                    onChange={(e) => setProfileData({ ...profileData, preferences: e.target.value })}
                  />
                </div>

                <div className="flex justify-end pt-4.5 border-t border-border/40">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex items-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Client Settings
                  </button>
                </div>
              </form>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-4 h-fit text-sm">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white font-sans">Agent Allocation</h2>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest font-black">Lead Owner Agent</p>
                <p className="text-white font-bold mt-1.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-4.5 h-4.5 text-primary" /> {client.assignedTo?.firstName ? `${client.assignedTo.firstName} ${client.assignedTo.lastName || ""}` : "Office Pool"}
                </p>
              </div>
              <div className="pt-2">
                <p className="text-xs text-gray-400 uppercase tracking-widest font-black">Registered Since</p>
                <p className="text-white font-bold mt-1.5 flex items-center gap-1.5">
                  <Calendar className="w-4.5 h-4.5 text-primary" /> {new Date(client.createdAt).toLocaleDateString([], { dateStyle: 'long' })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. PROPERTY INTERESTS */}
        {activeTab === "interests" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white font-sans">
                <Heart className="w-5 h-5 text-primary" /> Properties of Interest
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {client.interestedProperties?.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">
                    No active property interests linked. Match property profiles on the right.
                  </div>
                ) : (
                  client.interestedProperties?.map((interest: any) => (
                    <div key={interest.id} className="glass p-5 rounded-2xl border border-border flex items-center justify-between group/card">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                          <Building className="w-5 h-5" />
                        </div>
                        <div className="overflow-hidden">
                          <h4 className="font-bold text-white text-sm line-clamp-1">{interest.property?.title}</h4>
                          <span className="text-[10px] text-gray-400 font-bold block truncate">
                            {interest.property?.location}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveInterest(interest.id)}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover/card:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Link Interest</h2>
              <form onSubmit={handleAddInterest} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Select Property</label>
                  <select
                    className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
                    value={interestData.propertyId}
                    onChange={(e) => setInterestData({ propertyId: e.target.value })}
                  >
                    <option value="">-- Choose Listing --</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.title} - {p.location} (PKR {p.price?.toLocaleString()})</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex justify-center items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Register Property Link
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 3. VIEWING SCHEDULER */}
        {activeTab === "viewings" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <Calendar className="w-5 h-5 text-primary" /> Property viewing schedule
              </h2>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-left text-sm text-gray-300">
                  <thead className="bg-secondary/40 text-xs font-black uppercase text-gray-400 tracking-wider">
                    <tr>
                      <th className="p-4 border-b border-border">Property</th>
                      <th className="p-4 border-b border-border">Scheduled Date</th>
                      <th className="p-4 border-b border-border">Feedback Notes</th>
                      <th className="p-4 border-b border-border">Status</th>
                      <th className="p-4 border-b border-border text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {client.viewings?.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground bg-card/10">No viewings schedules found.</td>
                      </tr>
                    ) : (
                      client.viewings?.map((v: any) => (
                        <tr key={v.id} className="hover:bg-secondary/15 transition-colors text-xs">
                          <td className="p-4 font-bold text-white max-w-[150px] truncate">{v.property?.title}</td>
                          <td className="p-4 font-semibold text-gray-300">
                            {new Date(v.viewingDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="p-4 max-w-[150px] truncate text-gray-400 font-semibold" title={v.feedback}>
                            {v.feedback || "-"}
                          </td>
                          <td className="p-4">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-widest ${
                              v.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                              v.status === 'CANCELLED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {v.status}
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            {v.status === 'SCHEDULED' && (
                              <>
                                <button
                                  onClick={() => handleUpdateViewingStatus(v.id, 'COMPLETED', prompt("Enter client feedback:") || "")}
                                  className="bg-green-500 hover:bg-green-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded"
                                >
                                  Complete
                                </button>
                                <button
                                  onClick={() => handleUpdateViewingStatus(v.id, 'CANCELLED')}
                                  className="bg-red-500 hover:bg-red-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white font-sans">Schedule Visit</h2>
              <form onSubmit={handleScheduleViewing} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Target Property</label>
                  <select
                    className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm"
                    value={viewingData.propertyId}
                    onChange={(e) => setViewingData({ ...viewingData, propertyId: e.target.value })}
                  >
                    <option value="">-- Choose Unit --</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.title} - {p.location}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Viewing Date & Time</label>
                  <input
                    required
                    type="datetime-local"
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    value={viewingData.viewingDate}
                    onChange={(e) => setViewingData({ ...viewingData, viewingDate: e.target.value })}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex justify-center items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Schedule Viewing Check
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 4. CALL TIMELINES */}
        {activeTab === "timeline" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <Activity className="w-5 h-5 text-primary" /> Follow-ups & CRM Calling logs
              </h2>
              <div className="relative pl-6 space-y-6 border-l border-l-border/80 ml-3 py-2">
                {client.communications?.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground glass rounded-xl border border-border border-dashed ml-[-24px] pl-6">
                    No follow-ups recorded yet. Call logs are empty.
                  </div>
                ) : (
                  client.communications?.map((comm: any) => (
                    <div key={comm.id} className="relative group">
                      <span className="absolute left-[-31px] top-1.5 w-4 h-4 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center glow-primary">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                      </span>
                      <div className="space-y-1 ml-1.5 text-sm">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary tracking-wider">
                            {comm.type}
                          </span>
                          <span className="text-[10px] text-gray-400 font-bold">
                            {new Date(comm.date).toLocaleDateString([], { dateStyle: 'medium' })} &bull; {new Date(comm.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-white leading-relaxed">{comm.summary}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Log CRM Activity</h2>
              <form onSubmit={handleAddCommunication} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Channel</label>
                  <select
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    value={commsData.type}
                    onChange={(e) => setCommsData({ ...commsData, type: e.target.value })}
                  >
                    <option value="CALL">Phone call log</option>
                    <option value="WHATSAPP">WhatsApp follow-up</option>
                    <option value="EMAIL">Email sent</option>
                    <option value="MEETING">Property view mockup</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Details Summary</label>
                  <textarea
                    required
                    rows={3}
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm resize-none"
                    placeholder="Briefly log what you discussed..."
                    value={commsData.summary}
                    onChange={(e) => setCommsData({ ...commsData, summary: e.target.value })}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex justify-center items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Register Timeline Log
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
