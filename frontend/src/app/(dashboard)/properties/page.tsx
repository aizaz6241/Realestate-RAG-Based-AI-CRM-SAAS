"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Filter, MapPin, BedDouble, Bath, Square, X, Loader2, Building, Heart } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function PropertiesPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [properties, setProperties] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    type: "APARTMENT",
    status: "AVAILABLE",
    listingType: "SALE",
    price: "",
    location: "",
    bedrooms: "",
    bathrooms: "",
    areaSqft: "",
    amenitiesInput: "",
    description: "",
  });

  const fetchProperties = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("http://localhost:3001/properties", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProperties(data);
      }
    } catch (error) {
      console.error("Error fetching properties:", error);
      // Fallback premium data if backend has issue
      setProperties([
        { id: "mock1", title: "Neon Skyline Penthouse", type: "APARTMENT", status: "AVAILABLE", listingType: "SALE", price: 250000000, location: "Gulberg III, Lahore", bedrooms: 4, bathrooms: 5, areaSqft: 6500, images: ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&q=80&w=800"] },
        { id: "mock2", title: "Aurora Commercial Hub", type: "COMMERCIAL", status: "SOLD", listingType: "SALE", price: 420000000, location: "DHA Phase 8, Karachi", areaSqft: 12000, images: ["https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=800"] }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const amenities = formData.amenitiesInput
        ? formData.amenitiesInput.split(",").map(x => x.trim()).filter(Boolean)
        : [];

      const payload = {
        title: formData.title,
        description: formData.description,
        type: formData.type,
        status: formData.status,
        listingType: formData.listingType,
        price: parseFloat(formData.price),
        location: formData.location,
        bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : null,
        bathrooms: formData.bathrooms ? parseInt(formData.bathrooms) : null,
        areaSqft: formData.areaSqft ? parseFloat(formData.areaSqft) : null,
        amenities,
        images: ["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"]
      };

      const res = await fetch("http://localhost:3001/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({ title: "", type: "APARTMENT", status: "AVAILABLE", listingType: "SALE", price: "", location: "", bedrooms: "", bathrooms: "", areaSqft: "", amenitiesInput: "", description: "" });
        fetchProperties();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProperties = properties.filter(p =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen p-8 relative z-10 space-y-8">
      {/* Background Neon glows */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex justify-between items-center animate-fade-in">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Real Estate Listings</h1>
          <p className="text-muted-foreground mt-1">Manage broker portfolios, track listing price curves, and link lead interests.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary transition-all duration-300 hover:scale-[1.03]"
        >
          <Plus className="w-5 h-5" />
          Add Property Listing
        </button>
      </div>

      {/* Search Filter */}
      <div className="flex gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search listings by title or location..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Directory Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
          {filteredProperties.length === 0 ? (
            <div className="col-span-full text-center py-16 text-muted-foreground glass rounded-2xl border border-border/40">
              <Building className="w-10 h-10 mx-auto text-primary mb-3 opacity-80" />
              No active listings captured. Click 'Add Property Listing' to begin.
            </div>
          ) : (
            filteredProperties.map((property) => (
              <div
                onClick={() => router.push(`/properties/${property.id}`)}
                key={property.id}
                className="glass rounded-2xl overflow-hidden hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 group cursor-pointer text-left block flex flex-col justify-between"
              >
                <div>
                  <div className="h-48 w-full relative overflow-hidden bg-secondary/40">
                    <img
                      src={property.images?.[0] || "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"}
                      alt={property.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent"></div>
                    <span className={`absolute top-4 right-4 text-[9px] font-black uppercase px-2.5 py-1 rounded-full font-bold shadow-lg ${
                      property.status === 'AVAILABLE' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'
                    }`}>
                      {property.status}
                    </span>
                    <span className="absolute bottom-4 left-4 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-primary text-white shadow">
                      {property.listingType}
                    </span>
                  </div>
                  
                  <div className="p-5 space-y-2">
                    <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors truncate">
                      {property.title}
                    </h3>
                    <div className="flex items-center gap-1 text-muted-foreground text-xs">
                      <MapPin className="w-3.5 h-3.5 text-primary" /> {property.location}
                    </div>
                    <div className="text-xl font-extrabold text-primary pt-2">
                      PKR {property.price?.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="p-5 pt-0 mt-auto">
                  <div className="flex items-center gap-4 text-gray-400 text-xs pt-4 border-t border-border/40 font-bold uppercase tracking-wider">
                    {property.type !== 'PLOT' && (
                      <>
                        <div className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5 text-primary" /> {property.bedrooms || 0} Bed</div>
                        <div className="flex items-center gap-1"><Bath className="w-3.5 h-3.5 text-primary" /> {property.bathrooms || 0} Bath</div>
                      </>
                    )}
                    <div className="flex items-center gap-1"><Square className="w-3.5 h-3.5 text-primary" /> {property.areaSqft || 0} SqFt</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Property Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-2xl rounded-2xl overflow-hidden border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Building className="w-5 h-5 text-primary" />
                Add Real Estate Listing
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Listing Title</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="Luxury 3 Bed DHA Phase 6 Apartment"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Property Type</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="APARTMENT">Apartment</option>
                    <option value="VILLA">Villa</option>
                    <option value="COMMERCIAL">Commercial Office/Shop</option>
                    <option value="PLOT">Plot</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Listing Type</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.listingType}
                    onChange={(e) => setFormData({ ...formData, listingType: e.target.value })}
                  >
                    <option value="SALE">For Sale</option>
                    <option value="RENT">For Rent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Status</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="DRAFT">Draft</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Listing Price (PKR)</label>
                  <input
                    required
                    type="number"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="35000000"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Listing Location</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="DHA Phase 6, Lahore"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                {formData.type !== 'PLOT' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Bedrooms</label>
                      <input
                        type="number"
                        className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                        placeholder="3"
                        value={formData.bedrooms}
                        onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Bathrooms</label>
                      <input
                        type="number"
                        className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                        placeholder="3"
                        value={formData.bathrooms}
                        onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Area (Sq Ft)</label>
                  <input
                    type="number"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="2400"
                    value={formData.areaSqft}
                    onChange={(e) => setFormData({ ...formData, areaSqft: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Amenities (Comma separated tags)</label>
                <input
                  type="text"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="Swimming Pool, Gym, 24/7 Security, Covered Parking"
                  value={formData.amenitiesInput}
                  onChange={(e) => setFormData({ ...formData, amenitiesInput: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Listing Description</label>
                <textarea
                  rows={2}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm resize-none"
                  placeholder="Luxury residential flat located inside the premium blocks of DHA Phase 6..."
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
                  Save Listing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
