"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  Loader2,
  ArrowLeft,
  Building,
  MapPin,
  BedDouble,
  Bath,
  Square,
  DollarSign,
  Calendar,
  Activity,
  Heart,
  User,
  Settings,
  Plus,
  Trash2,
  Check,
  Tag,
  ShieldCheck,
  TrendingUp,
  Image as ImageIcon
} from "lucide-react";

export default function PropertyCommandCenter() {
  const { id } = useParams();
  const router = useRouter();
  const { token, user: currentUser } = useAuth();

  const [property, setProperty] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Edit states
  const [profileData, setProfileData] = useState({
    title: "",
    description: "",
    type: "APARTMENT",
    status: "AVAILABLE",
    listingType: "SALE",
    price: "",
    location: "",
    bedrooms: "",
    bathrooms: "",
    areaSqft: "",
    assignedToId: "",
    ownerId: "",
    amenitiesInput: "",
  });

  const fetchPropertyData = async () => {
    if (!token) return;
    try {
      // 1. Fetch Property details
      const res = await fetch(`http://localhost:3001/properties/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProperty(data);

        setProfileData({
          title: data.title || "",
          description: data.description || "",
          type: data.type || "APARTMENT",
          status: data.status || "AVAILABLE",
          listingType: data.listingType || "SALE",
          price: data.price?.toString() || "",
          location: data.location || "",
          bedrooms: data.bedrooms?.toString() || "",
          bathrooms: data.bathrooms?.toString() || "",
          areaSqft: data.areaSqft?.toString() || "",
          assignedToId: data.assignedToId || "",
          ownerId: data.ownerId || "",
          amenitiesInput: data.amenities?.join(", ") || "",
        });
      }

      // 2. Fetch Agents
      const agentsRes = await fetch("http://localhost:3001/employees", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (agentsRes.ok) {
        setAgents(await agentsRes.json());
      }

      // 3. Fetch Owners
      const ownersRes = await fetch("http://localhost:3001/owners", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (ownersRes.ok) {
        setOwners(await ownersRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMatches = async () => {
    if (!token) return;
    setIsLoadingMatches(true);
    try {
      const res = await fetch(`http://localhost:3001/properties/${id}/matches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setMatches(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMatches(false);
    }
  };

  useEffect(() => {
    fetchPropertyData();
  }, [id, token]);

  useEffect(() => {
    if (activeTab === "matches") {
      fetchMatches();
    }
  }, [activeTab]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const amenities = profileData.amenitiesInput
        ? profileData.amenitiesInput.split(",").map(x => x.trim()).filter(Boolean)
        : [];

      const res = await fetch(`http://localhost:3001/properties/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...profileData,
          amenities,
          assignedToId: profileData.assignedToId || null,
          ownerId: profileData.ownerId || null,
        })
      });
      if (res.ok) {
        alert("Property details and price logs successfully saved!");
        fetchPropertyData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAdminOrAgent = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN" || currentUser?.role === "AGENT";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        <Loader2 className="w-10 h-10 animate-spin text-primary glow-primary" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center text-center">
        <p className="text-xl font-bold text-red-400 mb-4">Property details not found.</p>
        <button onClick={() => router.push("/properties")} className="bg-primary px-5 py-2.5 rounded-xl font-bold text-white shadow-lg flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" /> Back to Properties
        </button>
      </div>
    );
  }

  const tabs = [
    { id: "overview", name: "Overview & Specs", icon: Building },
    { id: "priceHistory", name: "Price Fluctuations", icon: TrendingUp },
    { id: "gallery", name: "Media Gallery", icon: ImageIcon },
    { id: "matches", name: "AI Lead Matcher", icon: Heart },
    { id: "agentOwner", name: "Agent & Owner", icon: User }
  ];

  return (
    <div className="min-h-screen p-8 relative z-10 overflow-x-hidden space-y-8 animate-fade-in">
      <div className="absolute top-10 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header back button */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => router.push("/properties")}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 font-bold uppercase tracking-wider text-xs"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Listings
        </button>
        <span className="text-xs font-black uppercase text-gray-500 tracking-widest bg-secondary/40 border border-border px-3 py-1.5 rounded-full">
          LISTING ID: {property.id.slice(0, 8)}...
        </span>
      </div>

      {/* Main Property Overview Card */}
      <div className="glass rounded-3xl p-6 border border-border flex flex-col lg:flex-row gap-6 bg-card/25">
        <div className="w-full lg:w-72 h-48 rounded-2xl overflow-hidden relative flex-shrink-0 shadow-lg border border-border/40 bg-secondary/50">
          <img
            src={property.images?.[0] || "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"}
            alt={property.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent"></div>
          <span className={`absolute top-4 right-4 text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-lg ${
            property.status === 'AVAILABLE' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'
          }`}>
            {property.status}
          </span>
          <span className="absolute bottom-4 left-4 text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded bg-primary/95 text-white shadow">
            {property.listingType}
          </span>
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">{property.title}</h1>
            <p className="text-sm font-semibold text-gray-400 mt-1 flex items-center gap-1.5">
              <MapPin className="w-4.5 h-4.5 text-primary" /> {property.location}
            </p>
          </div>

          <div className="text-3xl font-black text-primary glow-primary pt-1">
            PKR {property.price?.toLocaleString()}
          </div>

          <div className="flex flex-wrap gap-3 items-center pt-2">
            <span className="text-[10px] uppercase font-black px-3 py-1.5 rounded-full bg-secondary border border-border text-gray-300">
              {property.type}
            </span>
            {property.bedrooms && (
              <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 flex items-center gap-1">
                <BedDouble className="w-3.5 h-3.5" /> {property.bedrooms} Bedrooms
              </span>
            )}
            {property.bathrooms && (
              <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 flex items-center gap-1">
                <Bath className="w-3.5 h-3.5" /> {property.bathrooms} Bathrooms
              </span>
            )}
            {property.areaSqft && (
              <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/25 flex items-center gap-1">
                <Square className="w-3.5 h-3.5" /> {property.areaSqft} Sq Ft
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
        
        {/* 1. OVERVIEW & SPECS */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <Settings className="w-5 h-5 text-primary" /> Edit Listing Parameters
              </h2>

              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Listing Title</label>
                    <input
                      required
                      type="text"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      value={profileData.title}
                      disabled={!isAdminOrAgent}
                      onChange={(e) => setProfileData({ ...profileData, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Listing Location</label>
                    <input
                      required
                      type="text"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      value={profileData.location}
                      disabled={!isAdminOrAgent}
                      onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Listing Price (PKR)</label>
                    <input
                      required
                      type="number"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white font-bold"
                      value={profileData.price}
                      disabled={!isAdminOrAgent}
                      onChange={(e) => setProfileData({ ...profileData, price: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Listing Type</label>
                    <select
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      value={profileData.listingType}
                      disabled={!isAdminOrAgent}
                      onChange={(e) => setProfileData({ ...profileData, listingType: e.target.value })}
                    >
                      <option value="SALE">For Sale</option>
                      <option value="RENT">For Rent</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Listing Status</label>
                    <select
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      value={profileData.status}
                      disabled={!isAdminOrAgent}
                      onChange={(e) => setProfileData({ ...profileData, status: e.target.value })}
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="SOLD">Sold</option>
                      <option value="RENTED">Rented</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Property Type</label>
                    <select
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      value={profileData.type}
                      disabled={!isAdminOrAgent}
                      onChange={(e) => setProfileData({ ...profileData, type: e.target.value })}
                    >
                      <option value="APARTMENT">Apartment</option>
                      <option value="VILLA">Villa</option>
                      <option value="COMMERCIAL">Commercial Shop/Office</option>
                      <option value="PLOT">Plot of Land</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Bedrooms</label>
                    <input
                      type="number"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      value={profileData.bedrooms}
                      disabled={!isAdminOrAgent}
                      onChange={(e) => setProfileData({ ...profileData, bedrooms: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Bathrooms</label>
                    <input
                      type="number"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      value={profileData.bathrooms}
                      disabled={!isAdminOrAgent}
                      onChange={(e) => setProfileData({ ...profileData, bathrooms: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Area (Sq Ft)</label>
                    <input
                      type="number"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      value={profileData.areaSqft}
                      disabled={!isAdminOrAgent}
                      onChange={(e) => setProfileData({ ...profileData, areaSqft: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Amenities (Comma separated tags)</label>
                  <input
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                    placeholder="Swimming Pool, Gym, Covered Parking, 24/7 Security"
                    value={profileData.amenitiesInput}
                    disabled={!isAdminOrAgent}
                    onChange={(e) => setProfileData({ ...profileData, amenitiesInput: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Listing Description</label>
                  <textarea
                    rows={3}
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white resize-none"
                    value={profileData.description}
                    disabled={!isAdminOrAgent}
                    onChange={(e) => setProfileData({ ...profileData, description: e.target.value })}
                  />
                </div>

                {isAdminOrAgent && (
                  <div className="flex justify-end pt-4 border-t border-border/40">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex items-center gap-2"
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save Listing Details
                    </button>
                  </div>
                )}
              </form>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit text-sm">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Amenities Checklist</h2>
              <div className="flex flex-wrap gap-2.5">
                {property.amenities?.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No amenities registered for this listing.</p>
                ) : (
                  property.amenities?.map((amenity: string, idx: number) => (
                    <span key={idx} className="bg-primary/10 border border-primary/20 text-primary px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> {amenity}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. PRICE FLUCTUATIONS HISTORY */}
        {activeTab === "priceHistory" && (
          <div className="glass rounded-2xl p-6 border border-border space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white font-sans">
              <TrendingUp className="w-5 h-5 text-primary" /> Market Price History logs
            </h2>

            <div className="relative pl-6 space-y-6 border-l border-border/80 ml-3 py-2">
              {property.priceHistory?.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground glass rounded-xl border border-border border-dashed ml-[-24px] pl-6">
                  No pricing modifications logged. Initial price matches current list price.
                </div>
              ) : (
                property.priceHistory?.map((log: any, idx: number) => (
                  <div key={log.id} className="relative group flex items-start gap-4">
                    <span className="absolute left-[-31px] top-1.5 w-4 h-4 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center glow-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    </span>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-black text-white">PKR {log.price?.toLocaleString()}</span>
                        <span className="text-[10px] text-gray-500 font-bold">
                          {new Date(log.changeDate).toLocaleDateString([], { dateStyle: 'long' })} at {new Date(log.changeDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {idx === 0 && <span className="text-[8px] tracking-widest font-black uppercase px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/25">Current Listing Price</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 3. MEDIA GALLERY */}
        {activeTab === "gallery" && (
          <div className="glass rounded-2xl p-6 border border-border space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
              <ImageIcon className="w-5 h-5 text-primary" /> Listing Media Slider
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {property.images?.length === 0 ? (
                <div className="col-span-full text-center py-16 text-muted-foreground glass border border-dashed border-border rounded-xl">
                  No images captured for this property listing gallery.
                </div>
              ) : (
                property.images?.map((img: string, idx: number) => (
                  <div key={idx} className="glass rounded-xl overflow-hidden border border-border/40 aspect-video relative group">
                    <img src={img} alt={`Gallery index ${idx}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-black uppercase tracking-widest">Image #{idx + 1}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 4. AI LEAD MATCHER */}
        {activeTab === "matches" && (
          <div className="glass rounded-2xl p-6 border border-border space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white font-sans">
              <Heart className="w-5 h-5 text-primary fill-current shadow-lg animate-pulse" /> Compatible CRM Buyers & Tenants
            </h2>

            {isLoadingMatches ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
              </div>
            ) : matches.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">
                No matched clients or leads found in the database matching this property location, price, or preferences.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {matches.map((m: any) => (
                  <div key={m.client.id} className="glass p-5 rounded-2xl border border-border space-y-4 hover:border-primary/50 transition-colors flex flex-col justify-between">
                    <div className="space-y-3.5">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h4 className="font-extrabold text-white text-base">{m.client.name}</h4>
                          <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-secondary border border-border text-gray-400 block w-fit mt-1.5">
                            {m.client.type}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-primary uppercase bg-primary/10 border border-primary/25 px-2.5 py-1 rounded-full">
                            {m.score}% Match
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-border/40 text-xs">
                        <p className="text-gray-400 font-bold">Preferences: <span className="text-gray-200 italic font-semibold">"{m.client.preferences || 'Any'}"</span></p>
                        {m.client.budget && <p className="text-gray-400 font-bold">Max Budget: <span className="text-white font-extrabold">PKR {m.client.budget?.toLocaleString()}</span></p>}
                      </div>

                      <div className="pt-2 space-y-1">
                        <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Matching Criteria</p>
                        {m.reasons.map((r: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[11px] text-green-400 font-semibold">
                            <Check className="w-3.5 h-3.5" /> {r}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => router.push(`/clients/${m.client.id}`)}
                      className="w-full mt-3 py-2 rounded-xl bg-secondary hover:bg-primary hover:text-white transition-all text-xs font-bold uppercase tracking-wider text-gray-300 shadow border border-border"
                    >
                      Enter Client CRM &rarr;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. ASSIGNED AGENT & OWNER */}
        {activeTab === "agentOwner" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit text-sm">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Assigned Agent</h2>
              {isAdminOrAgent ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Lead Realtor Agent</label>
                    <select
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-white bg-secondary"
                      value={profileData.assignedToId}
                      onChange={(e) => setProfileData({ ...profileData, assignedToId: e.target.value })}
                    >
                      <option value="">-- Choose Agent --</option>
                      {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.firstName} {a.lastName || ""} ({a.role})</option>
                      ))}
                    </select>
                  </div>
                  {property.assignedTo && (
                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-primary to-cyan-500 flex items-center justify-center font-bold text-white shadow">
                        {property.assignedTo.firstName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-white text-sm">{property.assignedTo.firstName} {property.assignedTo.lastName || ""}</h4>
                        <span className="text-[10px] text-gray-400 font-bold block mt-0.5">{property.assignedTo.email}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-secondary/30 border border-border rounded-xl text-center text-xs text-muted-foreground leading-relaxed">
                  Only Admins or authorized Realtor Agents can reallocate broker assignments.
                </div>
              )}
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit text-sm">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Asset Landlord</h2>
              {isAdminOrAgent ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Listing Owner</label>
                    <select
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-white bg-secondary"
                      value={profileData.ownerId}
                      onChange={(e) => setProfileData({ ...profileData, ownerId: e.target.value })}
                    >
                      <option value="">-- Choose Landlord --</option>
                      {owners.map(o => (
                        <option key={o.id} value={o.id}>{o.name} - {o.phone}</option>
                      ))}
                    </select>
                  </div>
                  {property.owner && (
                    <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="font-extrabold text-white text-sm flex items-center gap-1.5">
                          <ShieldCheck className="w-4.5 h-4.5 text-primary" /> {property.owner.name}
                        </h4>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-widest ${
                          property.owner.kycVerified ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {property.owner.kycVerified ? "KYC Approved" : "KYC Pending"}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-bold">Contact Phone: <span className="text-white font-extrabold">{property.owner.phone}</span></p>
                      {property.owner.commissionRate && (
                        <p className="text-[10px] text-gray-400 font-bold">Direct Contract Rate: <span className="text-primary font-black uppercase text-xs">{property.owner.commissionRate}% Commission</span></p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-secondary/30 border border-border rounded-xl text-center text-xs text-muted-foreground leading-relaxed">
                  Only authorized Real estate brokers can view and manage private asset owner mappings.
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
