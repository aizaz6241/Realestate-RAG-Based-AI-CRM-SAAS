"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { 
  Folder, 
  FileText, 
  Upload, 
  Trash2, 
  Calendar, 
  AlertTriangle, 
  Shield, 
  Tag, 
  Loader2, 
  X, 
  History, 
  Download,
  Plus
} from "lucide-react";

export default function DocumentsPage() {
  const { token, user: currentUser } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // State for tabs
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isVersionOpen, setIsVersionOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forms States
  const [formData, setFormData] = useState({
    name: "",
    category: "SALES", // SALES, TENANCY, KYC, CORPORATE, OTHER
    fileUrl: "",
    tagsInput: "",
    expiryDate: "",
    accessRole: "VIEWER", // VIEWER, AGENT, ADMIN, SUPER_ADMIN
  });

  const [versionFileUrl, setVersionFileUrl] = useState("");

  // Custom Granular Access Control States
  const [employees, setEmployees] = useState<any[]>([]);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [writeRoles, setWriteRoles] = useState<string[]>([]);
  const [writeUserIds, setWriteUserIds] = useState<string[]>([]);

  const fetchEmployees = async () => {
    if (!token) return;
    try {
      const res = await fetch("http://localhost:3001/employees", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setEmployees(await res.json());
      }
    } catch (e) {
      console.error("Error fetching employees:", e);
    }
  };

  const fetchDocuments = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("http://localhost:3001/documents", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDocuments(await res.json());
      }
    } catch (e) {
      console.error(e);
      // Premium Mock Fallbacks
      setDocuments([
        { 
          id: "doc1", 
          name: "Tenancy Agreement - Malik Mansion", 
          category: "TENANCY", 
          fileUrl: "https://example.com/tenancy.pdf", 
          version: 2, 
          tags: ["bahria", "malik", "deed"], 
          expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // Expiring in 15 days
          isExpired: false,
          accessRole: "AGENT",
          createdBy: { firstName: "Zain" },
          versions: [
            { version: 2, fileUrl: "https://example.com/tenancy_v2.pdf", updatedAt: new Date().toISOString() },
            { version: 1, fileUrl: "https://example.com/tenancy_v1.pdf", updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }
          ]
        },
        { 
          id: "doc2", 
          name: "Title Deed - DHA Phase 6", 
          category: "SALES", 
          fileUrl: "https://example.com/deed.pdf", 
          version: 1, 
          tags: ["sales", "dha", "legal"], 
          expiryDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Expired 2 days ago
          isExpired: true,
          accessRole: "ADMIN",
          createdBy: { firstName: "Admin" },
          versions: [
            { version: 1, fileUrl: "https://example.com/deed.pdf", updatedAt: new Date().toISOString() }
          ]
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    fetchEmployees();
  }, [token]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const tags = formData.tagsInput
        ? formData.tagsInput.split(",").map(x => x.trim().toLowerCase()).filter(Boolean)
        : [];

      const payload = {
        name: formData.name,
        category: formData.category,
        fileUrl: formData.fileUrl || "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        tags,
        expiryDate: formData.expiryDate || null,
        accessRole: formData.accessRole,
        targetRoles,
        targetUserIds,
        writeRoles,
        writeUserIds
      };

      const res = await fetch("http://localhost:3001/documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsUploadOpen(false);
        setFormData({ name: "", category: "SALES", fileUrl: "", tagsInput: "", expiryDate: "", accessRole: "VIEWER" });
        setTargetRoles([]);
        setTargetUserIds([]);
        setWriteRoles([]);
        setWriteUserIds([]);
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionFileUrl || !selectedDoc) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`http://localhost:3001/documents/${selectedDoc.id}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fileUrl: versionFileUrl })
      });
      if (res.ok) {
        setIsVersionOpen(false);
        setVersionFileUrl("");
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("Are you sure you want to permanently delete this document from vault?")) return;
    try {
      const res = await fetch(`http://localhost:3001/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filters
  const categories = ["ALL", "SALES", "TENANCY", "KYC", "CORPORATE", "OTHER"];

  const filteredDocs = documents.filter((doc) => {
    const matchesCategory = activeCategory === "ALL" || doc.category === activeCategory;
    const matchesTag = !selectedTag || doc.tags?.includes(selectedTag);
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          doc.tags?.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesTag && matchesSearch;
  });

  // Extract all unique tags
  const allTags = Array.from(new Set(documents.flatMap((doc) => doc.tags || [])));

  // Expiry alert status checkers
  const getExpiryStyle = (doc: any) => {
    if (!doc.expiryDate) return "border-border/40 bg-card/20";
    const now = new Date();
    const expiry = new Date(doc.expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0 || doc.isExpired) {
      return "border-red-500/50 bg-red-950/10 shadow-[0_0_15px_rgba(239,68,68,0.05)]"; // Expired
    }
    if (diffDays <= 30) {
      return "border-amber-500/50 bg-amber-950/10 shadow-[0_0_15px_rgba(245,158,11,0.05)]"; // Expiring soon
    }
    return "border-border/40 bg-card/20";
  };

  const getExpiryBadge = (doc: any) => {
    if (!doc.expiryDate) return null;
    const now = new Date();
    const expiry = new Date(doc.expiryDate);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0 || doc.isExpired) {
      return (
        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/25 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Expired
        </span>
      );
    }
    if (diffDays <= 30) {
      return (
        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Expiring in {diffDays} Days
        </span>
      );
    }
    return null;
  };

  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";
  const AVAILABLE_ROLES = ["SALES_MANAGER", "AGENT", "HR", "LOGISTICS", "FINANCE", "RECEPTIONIST", "VIEWER"];

  const hasWriteClearance = (doc: any) => {
    if (!currentUser || !doc) return false;
    if (currentUser.role === "SUPER_ADMIN" || currentUser.role === "ADMIN") return true;
    if (doc.createdById === currentUser.id) return true;
    if (doc.writeRoles?.includes(currentUser.role)) return true;
    if (doc.writeUserIds?.includes(currentUser.id)) return true;
    return false;
  };

  return (
    <div className="min-h-screen p-8 relative z-10 space-y-8">
      {/* Background Neon glows */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex justify-between items-center animate-fade-in">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Documents Vault</h1>
          <p className="text-muted-foreground mt-1">Archived tenancy sheets, legal deed certificates, and corporate assets locker.</p>
        </div>
        <button
          onClick={() => {
            setFormData({ name: "", category: "SALES", fileUrl: "", tagsInput: "", expiryDate: "", accessRole: "VIEWER" });
            setTargetRoles([]);
            setTargetUserIds([]);
            setWriteRoles([]);
            setWriteUserIds([]);
            setIsUploadOpen(true);
          }}
          className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary transition-all duration-300 hover:scale-[1.03]"
        >
          <Upload className="w-5 h-5" />
          Archive Document
        </button>
      </div>

      {/* Search and Tag filter bars */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between animate-fade-in">
        <input
          type="text"
          placeholder="Search document archives or tags..."
          className="glass-input pl-4 pr-4 py-2.5 rounded-xl text-sm max-w-md w-full"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        {/* Selected tag pill alert */}
        {selectedTag && (
          <div className="flex items-center gap-2 bg-primary/15 border border-primary/30 px-3 py-1.5 rounded-full text-xs font-semibold text-primary">
            <span>Filter Tag: <strong className="text-white">{selectedTag}</strong></span>
            <button onClick={() => setSelectedTag(null)} className="text-primary hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>

      {/* Tags Pills cabinet */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 animate-fade-in">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                selectedTag === tag 
                  ? "bg-primary/20 text-primary border-primary/40 shadow-sm"
                  : "bg-secondary/40 text-gray-400 border-border/40 hover:text-white hover:border-border"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Tab Selectors */}
      <div className="flex gap-2 border-b border-border/40 pb-2 overflow-x-auto scrollbar-none animate-fade-in">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveCategory(cat);
              setSelectedTag(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest font-black transition-all flex-shrink-0 cursor-pointer ${
              activeCategory === cat
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            }`}
          >
            {cat === "ALL" ? "All Vaults" : `${cat} Cabinet`}
          </button>
        ))}
      </div>

      {/* Document roster grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
          {filteredDocs.length === 0 ? (
            <div className="col-span-full text-center py-16 text-muted-foreground glass rounded-2xl border border-border/40">
              <Folder className="w-10 h-10 mx-auto text-primary mb-3 opacity-80" />
              No document sheets found inside this cabinet.
            </div>
          ) : (
            filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className={`glass rounded-2xl p-6 border transition-all duration-300 relative group flex flex-col justify-between ${getExpiryStyle(doc)}`}
              >
                <div className="space-y-4">
                  {/* Card Header info */}
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20 flex-shrink-0">
                      <FileText className="w-5.5 h-5.5" />
                    </div>
                    <div className="overflow-hidden flex-1 space-y-1">
                      <h4 className="font-extrabold text-white text-base truncate pr-6" title={doc.name}>
                        {doc.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[8px] tracking-wider uppercase font-black px-1.5 py-0.5 rounded bg-secondary border border-border text-gray-400">
                          {doc.category}
                        </span>
                        <span className="text-[8px] tracking-widest uppercase font-black px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/25">
                          v{doc.version}
                        </span>
                        {getExpiryBadge(doc)}
                      </div>
                    </div>
                  </div>

                  {/* Metadata and tag capsules */}
                  <div className="space-y-2 text-xs pt-4 border-t border-border/30">
                    {doc.expiryDate && (
                      <div className="flex items-center gap-2 text-gray-400 font-medium">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>Expiry Date: <strong className="text-white font-extrabold">{new Date(doc.expiryDate).toLocaleDateString([], { dateStyle: 'medium' })}</strong></span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-400 font-medium">
                      <Shield className="w-4 h-4 text-primary" />
                      <span>Clearance: <strong className="text-white font-bold">{doc.accessRole}</strong></span>
                    </div>

                    {/* Granular permissions display */}
                    <div className="pt-2 mt-1 border-t border-border/20 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-gray-500 font-bold">Read:</span>
                        {doc.targetRoles?.length > 0 || doc.targetUserIds?.length > 0 ? (
                          <>
                            {doc.targetRoles.map((r: string) => (
                              <span key={r} className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                                {r}
                              </span>
                            ))}
                            {doc.targetUserIds?.length > 0 && (
                              <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25">
                                +{doc.targetUserIds.length} Colleague(s)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/25">
                            Private (Admins Only)
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-gray-500 font-bold">Write:</span>
                        {doc.writeRoles?.length > 0 || doc.writeUserIds?.length > 0 ? (
                          <>
                            {doc.writeRoles.map((r: string) => (
                              <span key={r} className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">
                                {r}
                              </span>
                            ))}
                            {doc.writeUserIds?.length > 0 && (
                              <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">
                                +{doc.writeUserIds.length} Colleague(s)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/25">
                            Private (Admins Only)
                          </span>
                        )}
                      </div>
                    </div>
                    {doc.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1.5">
                        {doc.tags.map((t: string) => (
                          <span key={t} className="text-[9px] font-bold text-gray-400 flex items-center gap-1">
                            <Tag className="w-2.5 h-2.5 text-primary" /> {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Operations links and buttons */}
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-border/30">
                  <span className="text-[9px] text-gray-500 font-bold tracking-widest uppercase">
                    Uploaded by: {doc.createdBy?.firstName || "Office"}
                  </span>
                  
                  <div className="flex items-center gap-1.5">
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-primary hover:bg-primary/10 rounded-lg"
                      title="Download/View physical file"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    
                    <button
                      onClick={() => {
                        setSelectedDoc(doc);
                        setIsVersionOpen(true);
                      }}
                      className="p-2 text-cyan-400 hover:bg-cyan-500/10 rounded-lg"
                      title="Versioning History & revisions locker"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg inline-flex items-center"
                        title="Delete Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Upload Document Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-2xl rounded-2xl overflow-hidden border border-primary/40 shadow-2xl glow-primary max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                Archive Document Sheet
              </h2>
              <button onClick={() => setIsUploadOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Document Title</label>
                <input
                  required
                  type="text"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="Tenancy Contract - Villa DHA Phase 6"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Cabinet Category</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="SALES">Sales Cabinet</option>
                    <option value="TENANCY">Tenancy Cabinet</option>
                    <option value="KYC">KYC Locker</option>
                    <option value="CORPORATE">Corporate Files</option>
                    <option value="OTHER">Other Documents</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Access Clearance</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.accessRole}
                    onChange={(e) => setFormData({ ...formData, accessRole: e.target.value })}
                  >
                    <option value="VIEWER">Viewer (Public)</option>
                    <option value="AGENT">Agent (Broker)</option>
                    <option value="ADMIN">Admin (Managers)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Document File URL (Mocks)</label>
                <input
                  type="url"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="https://example.com/agreement.pdf"
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Expiry Date (Alert trigger)</label>
                  <input
                    type="date"
                    className="w-full glass-input px-4 py-2 rounded-xl text-sm"
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Keywords / Tags (Comma separated)</label>
                  <input
                    type="text"
                    className="w-full glass-input px-4 py-2 rounded-xl text-sm"
                    placeholder="bahria, rent, contract"
                    value={formData.tagsInput}
                    onChange={(e) => setFormData({ ...formData, tagsInput: e.target.value })}
                  />
                </div>
              </div>

              {/* Security & Access Controls section */}
              <div className="border-t border-border/40 pt-4 mt-2 space-y-4">
                <h3 className="font-extrabold text-white text-xs uppercase tracking-widest text-primary">Security & Access Controls</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Read Access Section */}
                  <div className="space-y-3 bg-secondary/10 p-3 rounded-xl border border-border/40">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase text-gray-300">Read/View Access</label>
                      <span className="text-[10px] text-gray-500 font-bold">Who can view</span>
                    </div>
                    
                    {/* Target Roles */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-gray-400 block">Allowed Departments:</span>
                      <div className="flex flex-wrap gap-1">
                        {AVAILABLE_ROLES.map(role => {
                          const isSelected = targetRoles.includes(role);
                          return (
                            <button
                              type="button"
                              key={`read-${role}`}
                              onClick={() => setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])}
                              className={`text-[9px] font-bold px-2 py-1 rounded transition-all ${
                                isSelected 
                                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" 
                                  : "bg-secondary/60 text-gray-500 border border-border/40 hover:text-gray-300"
                              }`}
                            >
                              {role}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Target Users */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-gray-400 block">Allowed Colleagues:</span>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                        {employees.length === 0 ? (
                          <span className="text-[10px] text-gray-500 italic block">No colleagues listed</span>
                        ) : (
                          employees.map(emp => {
                            const isSelected = targetUserIds.includes(emp.id);
                            return (
                              <button
                                type="button"
                                key={`read-user-${emp.id}`}
                                onClick={() => setTargetUserIds(prev => prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id])}
                                className={`w-full flex items-center justify-between text-left p-1.5 rounded transition-all text-xs border ${
                                  isSelected 
                                    ? "bg-cyan-500/10 border-cyan-500/30 text-white font-bold" 
                                    : "bg-transparent border-transparent hover:bg-secondary/40 text-gray-400 hover:text-white"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                    {emp.firstName?.[0] || emp.email?.[0]?.toUpperCase()}
                                  </div>
                                  <span className="truncate">{emp.firstName} {emp.lastName || ""}</span>
                                </div>
                                <span className="text-[8px] font-bold text-gray-500 bg-secondary px-1 py-0.5 rounded flex-shrink-0">{emp.role}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Write Access Section */}
                  <div className="space-y-3 bg-secondary/10 p-3 rounded-xl border border-border/40">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase text-gray-300">Write/Update Access</label>
                      <span className="text-[10px] text-gray-500 font-bold">Who can upload revisions</span>
                    </div>
                    
                    {/* Write Roles */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-gray-400 block">Allowed Departments:</span>
                      <div className="flex flex-wrap gap-1">
                        {AVAILABLE_ROLES.map(role => {
                          const isSelected = writeRoles.includes(role);
                          return (
                            <button
                              type="button"
                              key={`write-${role}`}
                              onClick={() => setWriteRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])}
                              className={`text-[9px] font-bold px-2 py-1 rounded transition-all ${
                                isSelected 
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" 
                                  : "bg-secondary/60 text-gray-500 border border-border/40 hover:text-gray-300"
                              }`}
                            >
                              {role}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Write Users */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-gray-400 block">Allowed Colleagues:</span>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                        {employees.length === 0 ? (
                          <span className="text-[10px] text-gray-500 italic block">No colleagues listed</span>
                        ) : (
                          employees.map(emp => {
                            const isSelected = writeUserIds.includes(emp.id);
                            return (
                              <button
                                type="button"
                                key={`write-user-${emp.id}`}
                                onClick={() => setWriteUserIds(prev => prev.includes(emp.id) ? prev.filter(id => id !== emp.id) : [...prev, emp.id])}
                                className={`w-full flex items-center justify-between text-left p-1.5 rounded transition-all text-xs border ${
                                  isSelected 
                                    ? "bg-amber-500/10 border-amber-500/30 text-white font-bold" 
                                    : "bg-transparent border-transparent hover:bg-secondary/40 text-gray-400 hover:text-white"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                    {emp.firstName?.[0] || emp.email?.[0]?.toUpperCase()}
                                  </div>
                                  <span className="truncate">{emp.firstName} {emp.lastName || ""}</span>
                                </div>
                                <span className="text-[8px] font-bold text-gray-500 bg-secondary px-1 py-0.5 rounded flex-shrink-0">{emp.role}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="text-[10px] text-gray-500 italic">
                  *Note: Admins, Super Admins, and the Document Creator always maintain full access. If no departments or colleagues are chosen, this document remains private to you and the Admins.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
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
                  Archive File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {isVersionOpen && selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-lg rounded-2xl overflow-hidden border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Revision Locker: {selectedDoc.name}
              </h2>
              <button onClick={() => setIsVersionOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-6 text-sm">
              
              {/* Revision Upload */}
              {hasWriteClearance(selectedDoc) ? (
                <form onSubmit={handleAddVersionSubmit} className="space-y-3.5 bg-secondary/30 p-4 border border-border/60 rounded-xl">
                  <h4 className="font-extrabold text-white text-xs uppercase tracking-wider">Push New Revision (v{selectedDoc.version + 1})</h4>
                  <div className="flex gap-2">
                    <input
                      required
                      type="url"
                      placeholder="https://example.com/revision_v3.pdf"
                      className="glass-input px-3.5 py-2 rounded-xl text-xs flex-1"
                      value={versionFileUrl}
                      onChange={(e) => setVersionFileUrl(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="bg-primary px-3 rounded-xl text-xs font-black text-white hover:bg-primary/95 flex items-center gap-1 shadow"
                    >
                      {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                      Upload v{selectedDoc.version + 1}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-4 bg-red-950/20 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center gap-2 font-semibold">
                  <Shield className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>Read-Only Vault: You do not have write clearance to push new revisions to this document.</span>
                </div>
              )}

              {/* Revision List */}
              <div className="space-y-3 max-h-[35vh] overflow-y-auto scrollbar-thin">
                <h4 className="font-extrabold text-gray-400 text-xs uppercase tracking-widest">Historical Uploads</h4>
                {selectedDoc.versions?.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No historical versions available.</p>
                ) : (
                  selectedDoc.versions?.map((v: any) => (
                    <div key={v.version} className="flex justify-between items-center p-3 border border-border/40 rounded-xl hover:bg-secondary/15 transition-colors">
                      <div className="space-y-0.5">
                        <span className="text-xs font-black text-white">Revision Version #{v.version}</span>
                        <span className="block text-[10px] text-gray-500 font-bold">
                          Uploaded: {new Date(v.updatedAt).toLocaleDateString([], { dateStyle: 'medium' })} &bull; {new Date(v.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <a
                        href={v.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        Download Revision
                      </a>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
