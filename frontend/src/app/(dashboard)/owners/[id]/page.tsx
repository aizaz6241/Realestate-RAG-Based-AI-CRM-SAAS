"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Briefcase,
  Mail,
  Loader2,
  X,
  User,
  Check,
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
  Square
} from "lucide-react";

export default function OwnerCommandCenter() {
  const { id } = useParams();
  const router = useRouter();
  const { token, user: currentUser } = useAuth();

  const [owner, setOwner] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form States
  const [profileData, setProfileData] = useState({ name: "", email: "", phone: "", commissionRate: "", kycVerified: false, kycNotes: "", status: "ACTIVE" });
  const [docData, setDocData] = useState({ name: "", fileUrl: "" });
  const [commsData, setCommsData] = useState({ type: "CALL", summary: "" });

  const fetchOwnerData = async () => {
    if (!token) return;
    try {
      const res = await fetch(`http://localhost:3001/owners/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOwner(data);

        // Prep Forms
        setProfileData({
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
          commissionRate: data.commissionRate?.toString() || "5.0",
          kycVerified: data.kycVerified || false,
          kycNotes: data.kycNotes || "",
          status: data.status || "ACTIVE"
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOwnerData();
  }, [id, token]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`http://localhost:3001/owners/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      if (res.ok) {
        alert("Landlord Profile settings updated successfully!");
        fetchOwnerData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`http://localhost:3001/owners/${id}/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(docData)
      });
      if (res.ok) {
        setDocData({ name: "", fileUrl: "" });
        fetchOwnerData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      const res = await fetch(`http://localhost:3001/owners/${id}/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchOwnerData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`http://localhost:3001/owners/${id}/communications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(commsData)
      });
      if (res.ok) {
        setCommsData({ type: "CALL", summary: "" });
        fetchOwnerData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN" || currentUser?.role === "HR";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        <Loader2 className="w-10 h-10 animate-spin text-primary glow-primary" />
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center text-center">
        <p className="text-xl font-bold text-red-400 mb-4">Landlord details not found.</p>
        <button onClick={() => router.push("/owners")} className="bg-primary px-5 py-2.5 rounded-xl font-bold text-white shadow-lg flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" /> Back to List
        </button>
      </div>
    );
  }

  const tabs = [
    { id: "overview", name: "Landlord Profile", icon: User },
    { id: "portfolio", name: "Property Portfolio", icon: Building },
    { id: "documents", name: "KYC / Agreements", icon: FileText },
    { id: "timeline", name: "Call Logs Timeline", icon: Activity }
  ];

  return (
    <div className="min-h-screen p-8 relative z-10 overflow-x-hidden space-y-8 animate-fade-in">
      <div className="absolute top-10 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header back button */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/owners")}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 font-bold uppercase tracking-wider text-xs"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Landlords
        </button>
        <span className="text-xs font-black uppercase text-gray-500 tracking-widest bg-secondary/40 border border-border px-3 py-1.5 rounded-full">
          Landlord ID: {owner.id.slice(0, 8)}...
        </span>
      </div>

      {/* Base Info Header Card */}
      <div className="glass rounded-3xl p-6.5 border border-border flex flex-col md:flex-row gap-6 items-center md:items-start bg-card/25">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-primary to-cyan-500 flex items-center justify-center text-4xl font-extrabold text-white glow-primary select-none flex-shrink-0 shadow-lg">
          {owner.name.charAt(0)}
        </div>
        <div className="flex-1 text-center md:text-left space-y-3.5">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">{owner.name}</h1>
            <p className="text-sm font-semibold text-gray-400 mt-1 flex items-center justify-center md:justify-start gap-2">
              <Phone className="w-4.5 h-4.5 text-primary" /> {owner.phone} &bull;{" "}
              <Mail className="w-4.5 h-4.5 text-primary" /> {owner.email || "No Email Address"}
            </p>
          </div>
          <div className="flex flex-wrap justify-center md:justify-start gap-3 items-center pt-2">
            <span className={`text-[10px] uppercase font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 border ${
              owner.kycVerified 
                ? 'bg-green-500/10 text-green-400 border-green-500/25 shadow-[0_0_12px_rgba(34,197,94,0.1)]' 
                : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
            }`}>
              {owner.kycVerified ? "KYC Approved & Verified" : "KYC Pending Review"}
            </span>
            <span className="text-[10px] font-black uppercase px-3 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/25 tracking-widest">
              Rate: {owner.commissionRate}% Commission
            </span>
            <span className="text-[10px] font-black uppercase px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
              Portfolio: {owner.properties?.length || 0} Listed Unit
            </span>
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
        
        {/* 1. PROFILE OVERVIEW */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <Settings className="w-5 h-5 text-primary" /> Landlord File Details
              </h2>
              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Landlord Name</label>
                    <input
                      required
                      type="text"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Direct Phone</label>
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
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Landlord Email</label>
                    <input
                      type="email"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                      value={profileData.commissionRate}
                      onChange={(e) => setProfileData({ ...profileData, commissionRate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    id="kycVerified"
                    className="w-4 h-4 accent-primary rounded"
                    checked={profileData.kycVerified}
                    onChange={(e) => setProfileData({ ...profileData, kycVerified: e.target.checked })}
                  />
                  <label htmlFor="kycVerified" className="text-sm font-bold text-gray-300 cursor-pointer">
                    KYC & LandRegistry Deeds verified by Legal Desk
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">KYC Registration Notes</label>
                  <textarea
                    rows={3}
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm resize-none"
                    value={profileData.kycNotes}
                    onChange={(e) => setProfileData({ ...profileData, kycNotes: e.target.value })}
                  />
                </div>

                <div className="flex justify-end pt-4.5 border-t border-border/40">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex items-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Landlord File
                  </button>
                </div>
              </form>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-4 h-fit text-sm">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white font-sans">KYC Status Summary</h2>
              {profileData.kycVerified ? (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 flex gap-2">
                  <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-white text-sm">Verified Profile</h4>
                    <p className="text-xs text-gray-400 mt-1">This landlord is cleared for listing agreements. Emirates ID and Deed papers are archived.</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 flex gap-2">
                  <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-white text-sm">Pending Verification</h4>
                    <p className="text-xs text-gray-400 mt-1">KYC Registry checks are incomplete. Archive deed certificates to clear this profile.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. LISTED PORTFOLIO */}
        {activeTab === "portfolio" && (
          <div className="glass rounded-2xl p-6 border border-border space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
              <Building className="w-5 h-5 text-primary" /> Owned Real Estate Portfolios
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {owner.properties?.length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">
                  No properties currently assigned to this landlord. Allocate listings using the Property Module.
                </div>
              ) : (
                owner.properties?.map((property: any) => (
                  <div key={property.id} className="glass rounded-2xl overflow-hidden hover:border-primary transition-all group">
                    <div className="h-44 w-full relative overflow-hidden">
                      <img src={property.images?.[0] || ""} alt={property.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent"></div>
                      <span className={`absolute top-4 right-4 text-xs px-3 py-1 rounded-full font-bold shadow-lg ${property.status === 'AVAILABLE' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>{property.status}</span>
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-base line-clamp-1 text-white">{property.title}</h3>
                        <div className="flex items-center gap-1 text-muted-foreground text-xs mt-1"><MapPin className="w-3.5 h-3.5 text-primary" />{property.location}</div>
                        <div className="text-xl font-extrabold text-gradient mt-3">Rs {property.price?.toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-4 text-gray-400 text-xs pt-4 mt-4 border-t border-border/60">
                        {property.type !== 'PLOT' && <><div className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5 text-primary" />{property.bedrooms || 0}</div><div className="flex items-center gap-1"><Bath className="w-3.5 h-3.5 text-primary" />{property.bathrooms || 0}</div></>}
                        <div className="flex items-center gap-1"><Square className="w-3.5 h-3.5 text-primary" />{property.areaSqft || 0} sqft</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 3. AGREEMENTS LOCKER */}
        {activeTab === "documents" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <FileText className="w-5 h-5 text-primary" /> Agreements & Deeds locker
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {owner.documents?.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">
                    No documents uploaded. Archive Title Deeds or Passport papers.
                  </div>
                ) : (
                  owner.documents?.map((doc: any) => (
                    <div key={doc.id} className="glass p-5 rounded-2xl border border-border flex items-center justify-between group/card">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-sm line-clamp-1">{doc.name}</h4>
                          <span className="text-[10px] text-gray-400 font-bold">
                            Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-primary hover:bg-primary/10 rounded-lg text-xs font-bold"
                        >
                          Download
                        </a>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover/card:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Upload Documents</h2>
              <form onSubmit={handleUploadDocument} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Document Title</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    placeholder="Title Deed - DHA Phase 6"
                    value={docData.name}
                    onChange={(e) => setDocData({ ...docData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Document Link / PDF File</label>
                  <input
                    type="url"
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    placeholder="https://example.com/agreement.pdf"
                    value={docData.fileUrl}
                    onChange={(e) => setDocData({ ...docData, fileUrl: e.target.value })}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex justify-center items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Archive Document
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 4. COMMUNICATION TIMELINE */}
        {activeTab === "timeline" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <Activity className="w-5 h-5 text-primary" /> Calling & Landlord timeline
              </h2>
              <div className="relative pl-6 space-y-6 border-l border-border/80 ml-3 py-2">
                {owner.communications?.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground glass rounded-xl border border-border border-dashed ml-[-24px] pl-6">
                    No communication history logged yet. Timelines are blank.
                  </div>
                ) : (
                  owner.communications?.map((comm: any) => (
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
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Log Communication</h2>
              <form onSubmit={handleAddCommunication} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Type</label>
                  <select
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    value={commsData.type}
                    onChange={(e) => setCommsData({ ...commsData, type: e.target.value })}
                  >
                    <option value="CALL">Phone Call</option>
                    <option value="WHATSAPP">WhatsApp chat</option>
                    <option value="EMAIL">Email message</option>
                    <option value="MEETING">Landlord Meetup</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Conversation Summary</label>
                  <textarea
                    required
                    rows={3}
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm resize-none"
                    placeholder="Agreed on 5% commission, listing properties today..."
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
                  Register Log Note
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
