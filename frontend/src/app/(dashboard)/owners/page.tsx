"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Plus, User, Phone, Mail, Loader2, ShieldCheck, X, FileText, Activity, Handshake } from "lucide-react";

export default function OwnersPage() {
  const { token } = useAuth();
  const [owners, setOwners] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    commissionRate: "5.0",
    kycNotes: "",
  });

  const fetchOwners = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/owners`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOwners(data);
      }
    } catch (error) {
      console.error("Error fetching owners:", error);
      // Premium vibrant fallback data
      setOwners([
        { id: "owner1", name: "Malik Riaz", phone: "+92 300 999 8888", email: "riaz@bahria.com.pk", commissionRate: 5.0, kycVerified: true, properties: [1, 2, 3] },
        { id: "owner2", name: "Sheikh Rasheed", phone: "+92 321 555 4444", email: "sheikh@lalhaveli.pk", commissionRate: 4.5, kycVerified: false, properties: [1] }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOwners();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/owners`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFormData({
          name: "",
          phone: "",
          email: "",
          commissionRate: "5.0",
          kycNotes: "",
        });
        fetchOwners();
      } else {
        const err = await res.text();
        alert(`Error: ${err}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-8 relative z-10 space-y-8">
      {/* Background Neon glows */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex justify-between items-center animate-fade-in">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Landlords & Owners</h1>
          <p className="text-muted-foreground mt-1">Manage real estate asset owners, commission parameters, and KYC documents.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary transition-all duration-300 hover:scale-[1.03]"
        >
          <Plus className="w-5 h-5" />
          Add Owner
        </button>
      </div>

      {/* Directory Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
          {owners.length === 0 ? (
            <div className="col-span-full text-center py-16 text-muted-foreground glass rounded-2xl border border-border/40">
              <Handshake className="w-10 h-10 mx-auto text-primary mb-3 opacity-80 animate-pulse" />
              No asset owners registered yet. Click 'Add Owner' to begin!
            </div>
          ) : (
            owners.map((owner) => {
              const propertiesCount = owner.properties?.length || 0;
              return (
                <Link
                  href={`/owners/${owner.id}`}
                  key={owner.id}
                  className="glass rounded-2xl p-6 hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 group relative flex flex-col justify-between cursor-pointer text-left block"
                >
                  <div className="space-y-4">
                    {/* User Info Header */}
                    <div className="flex items-center gap-4">
                      <div className="w-13 h-13 rounded-xl bg-gradient-to-tr from-primary to-cyan-500 flex items-center justify-center text-lg font-bold text-white glow-primary select-none flex-shrink-0 shadow-lg">
                        {owner.name.charAt(0)}
                      </div>
                      <div className="overflow-hidden">
                        <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors truncate">
                          {owner.name}
                        </h3>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider ${
                          owner.kycVerified
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}>
                          {owner.kycVerified ? "KYC Verified" : "KYC Pending"}
                        </span>
                      </div>
                    </div>

                    {/* Metadata details */}
                    <div className="space-y-2.5 pt-4 border-t border-border/60 text-sm">
                      <div className="flex items-center gap-3 text-gray-300">
                        <Phone className="w-4 h-4 text-primary" />
                        <span>{owner.phone}</span>
                      </div>
                      {owner.email && (
                        <div className="flex items-center gap-3 text-gray-300">
                          <Mail className="w-4 h-4 text-primary" />
                          <span className="truncate">{owner.email}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-gray-300">
                        <Activity className="w-4 h-4 text-primary" />
                        <span>Listed Portfolio: <strong className="text-white font-bold">{propertiesCount} property</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-border/40 flex justify-between items-center text-xs font-bold">
                    <span className="text-gray-400 uppercase tracking-widest">
                      Rate: <span className="text-primary font-black text-sm">{owner.commissionRate}%</span>
                    </span>
                    <span className="text-primary group-hover:underline flex items-center gap-1">
                      Manage Owner &rarr;
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {/* Add Owner Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-lg rounded-2xl overflow-hidden border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Add Landlord / Owner
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm mb-1 text-gray-300">Full Name</label>
                <input
                  required
                  type="text"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="Malik Riaz"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Phone Number</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="+92 300 1234567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Email Address</label>
                  <input
                    type="email"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="riaz@bahriatown.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Base Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="5.0"
                    value={formData.commissionRate}
                    onChange={(e) => setFormData({ ...formData, commissionRate: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-300">KYC verification / Land Registry Notes</label>
                <textarea
                  rows={2}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm resize-none"
                  placeholder="Registry verified. Emirates ID logged."
                  value={formData.kycNotes}
                  onChange={(e) => setFormData({ ...formData, kycNotes: e.target.value })}
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
                  Register Owner
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
