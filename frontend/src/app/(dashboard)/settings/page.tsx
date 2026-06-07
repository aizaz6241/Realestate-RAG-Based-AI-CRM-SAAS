"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Settings,
  Building,
  Image as ImageIcon,
  MapPin,
  Phone,
  Mail,
  FileText,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Eye,
  X
} from "lucide-react";

interface OrganizationData {
  id: string;
  name: string;
  domain: string;
  logo: string | null;
  description: string | null;
  businessLocation: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
}

export default function CompanySettingsPage() {
  const { token, user } = useAuth();
  
  // UI states
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form states
  const [form, setForm] = useState({
    name: "",
    logo: "",
    description: "",
    businessLocation: "",
    phone: "",
    email: "",
    taxId: ""
  });

  const hasAccess = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.isSystemAdmin;

  const fetchOrgDetails = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/organization`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data: OrganizationData = await res.json();
        setOrgData(data);
        setForm({
          name: data.name || "",
          logo: data.logo || "",
          description: data.description || "",
          businessLocation: data.businessLocation || "",
          phone: data.phone || "",
          email: data.email || "",
          taxId: data.taxId || ""
        });
      } else {
        const errJson = await res.json();
        setErrorMsg(errJson.message || "Failed to load company profile.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error occurred while fetching details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && hasAccess) {
      fetchOrgDetails();
    } else if (token && !hasAccess) {
      setLoading(false);
    }
  }, [token, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || saveLoading || !hasAccess) return;
    setSaveLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/organization`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setSuccessMsg("Company configuration parameters saved successfully.");
        fetchOrgDetails();
      } else {
        const errJson = await res.json();
        setErrorMsg(errJson.message || "Failed to save settings.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network connection error occurred.");
    } finally {
      setSaveLoading(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute top-[35%] left-[35%] w-[350px] h-[350px] bg-red-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="glass max-w-lg w-full rounded-3xl p-8 border border-red-500/20 shadow-2xl text-center space-y-6 animate-fade-in relative z-10">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-500 mx-auto shadow-[0_0_20px_rgba(239,68,68,0.1)]">
            <AlertCircle className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white uppercase tracking-wider">Clearance Denied</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Your account role does not possess permissions to edit the **Company Settings** parameters. Please contact your organization Super Admin.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 relative min-h-screen text-left">
      {/* Background blurs */}
      <div className="absolute top-[10%] left-[5%] w-[350px] h-[350px] bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div className="absolute bottom-[20%] right-[10%] w-[350px] h-[350px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -z-10"></div>

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl animate-fade-in text-xs font-bold relative">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="absolute right-4 top-4 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl animate-fade-in text-xs font-bold relative">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="absolute right-4 top-4 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-black uppercase tracking-widest text-white flex items-center gap-3">
          <Settings className="w-7 h-7 text-primary glow-primary" />
          Company Settings Profile
        </h1>
        <p className="text-xs text-muted-foreground mt-1 font-semibold">
          Configure corporate branding, workspace info, location listings, and fiscal VAT details for document templates.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
          <p className="text-xs font-black tracking-widest text-muted-foreground uppercase font-semibold">Querying company meta details...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settings Inputs Form */}
          <form 
            onSubmit={handleSubmit}
            className="lg:col-span-2 glass rounded-3xl border border-border/80 p-6 space-y-6 shadow-lg"
          >
            <h3 className="text-xs font-black uppercase tracking-widest text-white border-b border-border/30 pb-3 flex items-center gap-2">
              <Building className="w-4.5 h-4.5 text-primary" />
              Corporate Identity Configuration
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Company Name */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Registered Business Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Zorvex Real Estate"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-secondary/30 border border-border/60 rounded-xl px-3.5 py-2.5 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              {/* Company Logo URL */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Corporate Logo URL</label>
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="url"
                    placeholder="https://example.com/logo.png"
                    value={form.logo}
                    onChange={(e) => setForm({ ...form, logo: e.target.value })}
                    className="w-full bg-secondary/30 border border-border/60 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              {/* Business Support Email */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Corporate Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    placeholder="info@yourcompany.ae"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-secondary/30 border border-border/60 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              {/* Business Phone */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Office Contact Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="+971 4 123 4567"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-secondary/30 border border-border/60 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              {/* Business Location / Office Address */}
              <div className="space-y-1.5 md:col-span-2 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Business HQ Location / Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Marina Plaza, Office 1204, Dubai Marina, Dubai, UAE"
                    value={form.businessLocation}
                    onChange={(e) => setForm({ ...form, businessLocation: e.target.value })}
                    className="w-full bg-secondary/30 border border-border/60 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              {/* VAT / TRN Tax ID */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">VAT Registration / TRN Number</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="100XXXXXXXXXXXX"
                    value={form.taxId}
                    onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                    className="w-full bg-secondary/30 border border-border/60 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              {/* Workspace Domain (Read-Only) */}
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Workspace Domain (Protected)</label>
                <input
                  type="text"
                  disabled
                  value={orgData?.domain || "zorvex.com"}
                  className="w-full bg-secondary/10 border border-border/20 rounded-xl px-3.5 py-2.5 text-xs text-muted-foreground outline-none cursor-not-allowed"
                />
              </div>

              {/* Business Description */}
              <div className="space-y-1.5 md:col-span-2 text-left">
                <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Business Overview / Description</label>
                <textarea
                  placeholder="Tell clients about your real estate operations and agency listings..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-secondary/30 border border-border/60 text-xs rounded-xl px-3.5 py-2.5 text-white h-24 outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-border/30">
              <button
                type="submit"
                disabled={saveLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 hover:scale-[1.02] shadow-[0_0_20px_rgba(6,182,212,0.15)] active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {saveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Configuration
              </button>
            </div>
          </form>

          {/* Branding Preview Sidebar Column */}
          <div className="space-y-6">
            {/* Live Profile Card Preview */}
            <div className="glass p-5 rounded-3xl border border-border/80 shadow-md space-y-4 relative overflow-hidden text-left">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl"></div>
              
              <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 border-b border-border/20 pb-2.5">
                <Eye className="w-4 h-4 text-primary" />
                Live Branding Preview
              </h4>

              {/* Card Container */}
              <div className="space-y-4">
                {/* Logo & Name */}
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-secondary/30 border border-border/50 flex items-center justify-center overflow-hidden">
                    {form.logo ? (
                      <img src={form.logo} alt="Company Logo" className="w-full h-full object-cover" onError={(e) => {
                        (e.target as any).src = ""; // Clear bad URL
                      }} />
                    ) : (
                      <Building className="w-6 h-6 text-gray-500" />
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <h5 className="font-extrabold text-sm text-white truncate">{form.name || "Company Name"}</h5>
                    <span className="text-[10px] text-primary font-black uppercase tracking-wider">{orgData?.domain || "domain.com"}</span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-[10.5px] text-gray-400 font-medium leading-relaxed italic line-clamp-3 bg-secondary/10 p-2.5 rounded-xl border border-border/30">
                  {form.description || "Corporate description will show up here as summary for documents."}
                </p>

                {/* Info List */}
                <div className="space-y-2 text-[10px] font-semibold text-gray-300">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                    <span className="leading-tight">{form.businessLocation || "Business Address not set."}</span>
                  </div>
                  {form.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-500" />
                      <span>{form.phone}</span>
                    </div>
                  )}
                  {form.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-500" />
                      <span className="truncate">{form.email}</span>
                    </div>
                  )}
                  {form.taxId && (
                    <div className="flex items-center gap-2 bg-secondary/20 border border-border/30 px-2 py-1 rounded-lg w-fit">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span>TRN: <strong className="text-white">{form.taxId}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Explanatory Context Card */}
            <div className="glass p-5 rounded-3xl border border-border/80 text-[10.5px] text-muted-foreground font-semibold leading-relaxed space-y-2 text-left">
              <h5 className="text-white font-extrabold uppercase text-[10px] tracking-wider">Configuration Note</h5>
              <p>
                Corporate logo, business name, address aur support contact coordinates database settings main permanently override ho jate hain.
              </p>
              <p>
                Yeh data custom AI document parsing, invoices generation, aur client receipts models automatically pull karte hain.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
