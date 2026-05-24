"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Search, Plus, UserCircle, Phone, Mail, MapPin, Loader2, X, Activity, DollarSign, Target } from "lucide-react";

export default function ClientsPage() {
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    type: "BUYER", // BUYER, TENANT, INVESTOR
    address: "",
    stage: "INQUIRY",
    budget: "",
    preferences: "",
  });

  const fetchClients = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setClients(await res.json());
      }
    } catch (error) {
      console.error(error);
      // Fallback fallback data
      setClients([
        { id: "client1", name: "Zain Ali", type: "BUYER", stage: "INQUIRY", phone: "+92 300 1234567", email: "zain@email.com", budget: 35000000, preferences: "3 Bed Apartment in DHA Phase 6" },
        { id: "client2", name: "Raza Khan", type: "TENANT", stage: "VIEWING", phone: "+92 333 7654321", email: "raza@email.com", budget: 150000, preferences: "Fully Furnished Villa in Bahria Town" }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({
          name: "",
          email: "",
          phone: "",
          type: "BUYER",
          address: "",
          stage: "INQUIRY",
          budget: "",
          preferences: "",
        });
        fetchClients();
      } else {
        const err = await res.text();
        alert(`Error: ${err}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage?.toUpperCase()) {
      case "CLOSED": return "bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]";
      case "OFFER": return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "VIEWING": return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
      default: return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.preferences?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen p-8 relative z-10 space-y-8">
      {/* Background glow */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex justify-between items-center animate-fade-in">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Buyers & Tenants CRM</h1>
          <p className="text-muted-foreground mt-1">Nurture client relationships, evaluate buying/renting portfolios, and track pipeline deals.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary transition-all duration-300 hover:scale-[1.03]"
        >
          <Plus className="w-5 h-5" />
          Add Client Profile
        </button>
      </div>

      {/* Search Filter */}
      <div className="flex gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search buyers or preferences..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
          {filteredClients.length === 0 ? (
            <div className="col-span-full text-center py-16 text-muted-foreground glass rounded-2xl border border-border/40">
              <Target className="w-10 h-10 mx-auto text-primary mb-3 opacity-80" />
              No buyers or tenants registered. Click 'Add Client Profile' to start tracking!
            </div>
          ) : (
            filteredClients.map((client) => (
              <Link
                href={`/clients/${client.id}`}
                key={client.id}
                className="glass rounded-2xl p-6 hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 group relative flex flex-col justify-between cursor-pointer text-left block"
              >
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-center gap-4">
                    <div className="w-13 h-13 rounded-xl bg-gradient-to-tr from-primary to-cyan-500 flex items-center justify-center text-lg font-bold text-white glow-primary select-none flex-shrink-0 shadow-lg">
                      {client.name.charAt(0)}
                    </div>
                    <div className="overflow-hidden">
                      <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors truncate">
                        {client.name}
                      </h3>
                      <div className="flex gap-2 items-center mt-1">
                        <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-secondary border border-border text-gray-300">
                          {client.type}
                        </span>
                        <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded border ${getStageColor(client.stage)}`}>
                          {client.stage}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metadata fields */}
                  <div className="space-y-2.5 pt-4 border-t border-border/60 text-sm">
                    <div className="flex items-center gap-3 text-gray-300">
                      <Phone className="w-4 h-4 text-primary" />
                      <span>{client.phone}</span>
                    </div>
                    {client.email && (
                      <div className="flex items-center gap-3 text-gray-300">
                        <Mail className="w-4 h-4 text-primary" />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.budget && (
                      <div className="flex items-center gap-3 text-gray-300">
                        <DollarSign className="w-4 h-4 text-primary" />
                        <span>Max Budget: <strong className="text-white font-bold">PKR {client.budget.toLocaleString()}</strong></span>
                      </div>
                    )}
                    {client.preferences && (
                      <div className="flex items-start gap-3 text-gray-300">
                        <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2 text-xs italic">"{client.preferences}"</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border/40 flex justify-between items-center text-xs font-bold text-primary">
                  <span>Owner Agent: {client.assignedTo?.firstName || "Office Assigned"}</span>
                  <span className="group-hover:underline flex items-center gap-1">
                    CRM Command &rarr;
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* Add Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-lg rounded-2xl overflow-hidden border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Add Buyer / Tenant Profile
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Client Name</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="Zain Ali"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
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
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-300">Email Address</label>
                <input
                  type="email"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="zain@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Client Type</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="BUYER">Property Buyer</option>
                    <option value="TENANT">Property Tenant</option>
                    <option value="INVESTOR">Asset Investor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">CRM Deal Stage</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    value={formData.stage}
                    onChange={(e) => setFormData({ ...formData, stage: e.target.value })}
                  >
                    <option value="INQUIRY">Inquiry Received</option>
                    <option value="VIEWING">Viewings Scheduled</option>
                    <option value="OFFER">Offers Registered</option>
                    <option value="CLOSED">Deals Closed</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Maximum Budget (PKR)</label>
                  <input
                    type="number"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="35000000"
                    value={formData.budget}
                    onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1 text-gray-300">Buying / Renting Preferences</label>
                <textarea
                  rows={2}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm resize-none"
                  placeholder="3 Bedroom Apartment in DHA Lahore, Phase 6."
                  value={formData.preferences}
                  onChange={(e) => setFormData({ ...formData, preferences: e.target.value })}
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
                  Register Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
