"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { 
  Truck, 
  User, 
  Key, 
  MapPin, 
  Calendar, 
  Loader2, 
  X, 
  AlertCircle, 
  Plus, 
  ShieldCheck, 
  Wrench, 
  ArrowRightLeft,
  Check,
  Compass
} from "lucide-react";

export default function LogisticsPage() {
  const { token, user: currentUser } = useAuth();
  
  // Data lists
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("schedules"); // schedules, vehicles, drivers, keys

  // Modal Triggers
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isVehicleOpen, setIsVehicleOpen] = useState(false);
  const [isDriverOpen, setIsDriverOpen] = useState(false);
  const [isKeyOpen, setIsKeyOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forms States
  const [scheduleForm, setScheduleForm] = useState({ visitDate: "", pickupLocation: "", dropLocation: "", driverId: "", vehicleId: "" });
  const [vehicleForm, setVehicleForm] = useState({ modelName: "", plateNumber: "" });
  const [driverForm, setDriverForm] = useState({ employeeProfileId: "", licenseNumber: "" });
  const [keyForm, setKeyForm] = useState({ keyTag: "", propertyId: "" });
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [maintenanceForm, setMaintenanceForm] = useState({ description: "", cost: "0" });

  const fetchData = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      // 1. Drivers
      const driversRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/drivers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (driversRes.ok) setDrivers(await driversRes.json());

      // 2. Vehicles
      const vehiclesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/vehicles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (vehiclesRes.ok) setVehicles(await vehiclesRes.json());

      // 3. Transit Schedules
      const schedulesRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/schedules`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (schedulesRes.ok) setSchedules(await schedulesRes.json());

      // 4. Keys
      const keysRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/keys`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (keysRes.ok) setKeys(await keysRes.json());

      // 5. Employees list for driver dropdown
      const empRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (empRes.ok) setEmployees(await empRes.json());

      // 6. Properties list for keys dropdown
      const propRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/properties`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (propRes.ok) setProperties(await propRes.json());
    } catch (e) {
      console.error(e);
      // Fallback premium stubs
      setDrivers([
        { id: "driver1", licenseNumber: "DL-PK-49823", status: "AVAILABLE", employeeProfile: { user: { firstName: "Abid", lastName: "Shah" } } },
        { id: "driver2", licenseNumber: "DL-PK-12903", status: "BUSY", employeeProfile: { user: { firstName: "Ghulam", lastName: "Rasool" } } }
      ]);
      setVehicles([
        { id: "car1", modelName: "Toyota Corolla S", plateNumber: "LEA-4902", status: "ACTIVE", maintenanceRequests: [] },
        { id: "car2", modelName: "Honda Civic Sedan", plateNumber: "KHI-8293", status: "MAINTENANCE", maintenanceRequests: [{ id: "m1", description: "Engine Tuning", cost: 12000, status: "PENDING" }] }
      ]);
      setSchedules([
        { id: "sched1", visitDate: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), pickupLocation: "RENS Office, Gulberg", dropLocation: "DHA Phase 6 Block B", status: "SCHEDULED", driver: { employeeProfile: { user: { firstName: "Abid", lastName: "Shah" } } }, vehicle: { modelName: "Toyota Corolla S", plateNumber: "LEA-4902" } }
      ]);
      setKeys([
        { id: "key1", keyTag: "KEY-DHA6-B42", status: "IN_OFFICE", property: { title: "DHA Phase 6 Villa", location: "DHA Phase 6" }, checkouts: [] },
        { id: "key2", keyTag: "KEY-GUL3-P18", status: "CHECKED_OUT", property: { title: "Gulberg Skyline Apt", location: "Gulberg III" }, checkouts: [{ id: "c1", checkoutDate: new Date().toISOString(), notes: "Client Viewing Visit", user: { firstName: "Zain" } }] }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(scheduleForm)
      });
      if (res.ok) {
        setIsScheduleOpen(false);
        setScheduleForm({ visitDate: "", pickupLocation: "", dropLocation: "", driverId: "", vehicleId: "" });
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVehicleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(vehicleForm)
      });
      if (res.ok) {
        setIsVehicleOpen(false);
        setVehicleForm({ modelName: "", plateNumber: "" });
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(driverForm)
      });
      if (res.ok) {
        setIsDriverOpen(false);
        setDriverForm({ employeeProfileId: "", licenseNumber: "" });
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(keyForm)
      });
      if (res.ok) {
        setIsKeyOpen(false);
        setKeyForm({ keyTag: "", propertyId: "" });
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/keys/${selectedItem.id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes: checkoutNotes })
      });
      if (res.ok) {
        setIsCheckoutOpen(false);
        setCheckoutNotes("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnKey = async (checkoutId: string) => {
    const notes = prompt("Enter checkout return check notes:") || "";
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/checkout/${checkoutId}/return`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notes })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/vehicles/${selectedItem.id}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(maintenanceForm)
      });
      if (res.ok) {
        setIsMaintenanceOpen(false);
        setMaintenanceForm({ description: "", cost: "0" });
        fetchData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveMaintenance = async (maintenanceId: string) => {
    if (!confirm("Complete vehicle maintenance and set car status back to active?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/maintenance/${maintenanceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "COMPLETED" })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateScheduleStatus = async (sId: string, status: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/schedules/${sId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const subtabs = [
    { id: "schedules", name: "Pickup Schedules", icon: Compass },
    { id: "vehicles", name: "Company Cars Roster", icon: Truck },
    { id: "drivers", name: "Driver Profiles", icon: User },
    { id: "keys", name: "Property Keys Cabinet", icon: Key }
  ];

  return (
    <div className="min-h-screen p-8 relative z-10 space-y-8">
      {/* Background Neon glows */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex justify-between items-center animate-fade-in">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Operations & Logistics</h1>
          <p className="text-muted-foreground mt-1">Manage company vehicles, driver profiles, viewing pickups transit coordinates, and property key locker checkouts.</p>
        </div>
        
        {/* Quick Add buttons dynamically matching tab */}
        {activeSubTab === "schedules" && (
          <button onClick={() => setIsScheduleOpen(true)} className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary hover:scale-[1.03] transition-all">
            <Calendar className="w-5 h-5" /> Schedule Pickup Visit
          </button>
        )}
        {activeSubTab === "vehicles" && (
          <button onClick={() => setIsVehicleOpen(true)} className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary hover:scale-[1.03] transition-all">
            <Truck className="w-5 h-5" /> Add Car to Roster
          </button>
        )}
        {activeSubTab === "drivers" && (
          <button onClick={() => setIsDriverOpen(true)} className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary hover:scale-[1.03] transition-all">
            <User className="w-5 h-5" /> Register Driver
          </button>
        )}
        {activeSubTab === "keys" && (
          <button onClick={() => setIsKeyOpen(true)} className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary hover:scale-[1.03] transition-all">
            <Key className="w-5 h-5" /> Register Property Key
          </button>
        )}
      </div>

      {/* Subtabs list */}
      <div className="flex gap-2 border-b border-border/40 pb-2 overflow-x-auto scrollbar-none animate-fade-in">
        {subtabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4.5 py-3 rounded-xl text-xs uppercase tracking-widest font-black transition-all flex-shrink-0 cursor-pointer ${
              activeSubTab === tab.id
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            }`}
          >
            <tab.icon className="w-4.5 h-4.5 mr-2 inline" />
            {tab.name}
          </button>
        ))}
      </div>

      {/* Renders dynamic sub-tab tables */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
        </div>
      ) : (
        <div className="animate-fade-in">
          
          {/* A. TRANSIT VISIT SCHEDULES */}
          {activeSubTab === "schedules" && (
            <div className="glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white flex items-center gap-2">
                <Compass className="w-5 h-5 text-primary" /> Scheduled Client Pickups & Site Visits
              </h2>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-left text-sm text-gray-300">
                  <thead className="bg-secondary/40 text-xs font-black uppercase text-gray-400 tracking-wider">
                    <tr>
                      <th className="p-4 border-b border-border">Visit Date & Time</th>
                      <th className="p-4 border-b border-border">Pickup Location</th>
                      <th className="p-4 border-b border-border">Drop Location</th>
                      <th className="p-4 border-b border-border">Driver</th>
                      <th className="p-4 border-b border-border">Vehicle Assigned</th>
                      <th className="p-4 border-b border-border">Status</th>
                      <th className="p-4 border-b border-border text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {schedules.length === 0 ? (
                      <tr><td colSpan={7} className="p-6 text-center text-muted-foreground bg-card/10">No scheduled visits in the logs today.</td></tr>
                    ) : (
                      schedules.map((s) => (
                        <tr key={s.id} className="hover:bg-secondary/15 transition-colors text-xs">
                          <td className="p-4 font-bold text-white">
                            {new Date(s.visitDate).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="p-4 font-semibold text-gray-300 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-primary" />{s.pickupLocation}</td>
                          <td className="p-4 font-semibold text-gray-300"><MapPin className="w-3.5 h-3.5 text-cyan-400" /> {s.dropLocation}</td>
                          <td className="p-4 font-bold text-gray-200">
                            {s.driver?.employeeProfile?.user ? `${s.driver.employeeProfile.user.firstName} ${s.driver.employeeProfile.user.lastName || ""}` : "No Driver"}
                          </td>
                          <td className="p-4 font-bold text-primary">
                            {s.vehicle ? `${s.vehicle.modelName} [${s.vehicle.plateNumber}]` : "No Vehicle"}
                          </td>
                          <td className="p-4">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-widest ${
                              s.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                              s.status === 'CANCELLED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              s.status === 'IN_TRANSIT' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            {s.status === 'SCHEDULED' && (
                              <button onClick={() => handleUpdateScheduleStatus(s.id, 'IN_TRANSIT')} className="bg-cyan-500 hover:bg-cyan-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow">Start Transit</button>
                            )}
                            {s.status === 'IN_TRANSIT' && (
                              <button onClick={() => handleUpdateScheduleStatus(s.id, 'COMPLETED')} className="bg-green-500 hover:bg-green-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow">Complete</button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* B. VEHICLES INVENTORY ROSTER */}
          {activeSubTab === "vehicles" && (
            <div className="glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-primary" /> Corporate Vehicle Fleet & Repair logs
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
                {vehicles.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">No active company cars registered.</div>
                ) : (
                  vehicles.map((v) => (
                    <div key={v.id} className="glass p-5 rounded-2xl border border-border flex flex-col justify-between hover:border-primary/50 transition-colors">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-extrabold text-white text-base">{v.modelName}</h4>
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 block">Plate: <strong className="text-white">{v.plateNumber}</strong></span>
                          </div>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-widest ${
                            v.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' :
                            v.status === 'MAINTENANCE' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {v.status}
                          </span>
                        </div>

                        {/* Recent Maintenance Requests */}
                        {v.maintenanceRequests?.length > 0 && (
                          <div className="space-y-1.5 pt-3 border-t border-border/40 text-xs">
                            <p className="text-[9px] font-black uppercase text-gray-500 tracking-wider">Active Repair Request</p>
                            {v.maintenanceRequests.map((m: any) => (
                              <div key={m.id} className="flex justify-between items-center text-xs p-2 bg-secondary/30 rounded-lg">
                                <span className="text-gray-300 font-semibold">{m.description}</span>
                                {m.status === 'PENDING' ? (
                                  <button onClick={() => handleResolveMaintenance(m.id)} className="bg-green-500 hover:bg-green-600 text-white text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded">Resolve</button>
                                ) : (
                                  <span className="text-green-400 text-[8px] font-bold uppercase tracking-widest bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded">Resolved</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {v.status === 'ACTIVE' && (
                        <button
                          onClick={() => {
                            setSelectedItem(v);
                            setIsMaintenanceOpen(true);
                          }}
                          className="w-full mt-5 py-2.5 rounded-xl bg-secondary hover:bg-amber-500 hover:text-white transition-all text-xs font-bold uppercase tracking-wider text-gray-300 shadow border border-border flex justify-center items-center gap-1.5"
                        >
                          <Wrench className="w-3.5 h-3.5" /> Log Repair Request
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* C. DRIVERS ROSTER */}
          {activeSubTab === "drivers" && (
            <div className="glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white flex items-center gap-2">
                <User className="w-5 h-5 text-primary" /> Active Company Drivers Profiles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
                {drivers.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">No corporate driver profiles registered.</div>
                ) : (
                  drivers.map((d) => (
                    <div key={d.id} className="glass p-5 rounded-2xl border border-border flex items-center justify-between hover:border-primary/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20 flex-shrink-0 font-bold">
                          {d.employeeProfile?.user?.firstName?.charAt(0) || "D"}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-white text-base truncate">
                            {d.employeeProfile?.user ? `${d.employeeProfile.user.firstName} ${d.employeeProfile.user.lastName || ""}` : "Company Driver"}
                          </h4>
                          <span className="text-[10px] text-gray-400 font-bold block mt-0.5">License: <strong className="text-white">{d.licenseNumber}</strong></span>
                        </div>
                      </div>
                      
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-widest ${
                        d.status === 'AVAILABLE' ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' :
                        d.status === 'BUSY' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {d.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* D. REAL ESTATE PROPERTY KEYS CABINET */}
          {activeSubTab === "keys" && (
            <div className="glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" /> Key Cabinet & Checkout Vault
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
                {keys.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">No property keys archived in the cabinet yet.</div>
                ) : (
                  keys.map((k) => {
                    const activeCheckout = k.checkouts?.find((c: any) => !c.returnDate);
                    return (
                      <div key={k.id} className="glass p-5 rounded-2xl border border-border flex flex-col justify-between hover:border-primary/50 transition-colors">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-extrabold text-white text-base flex items-center gap-1.5"><Key className="w-4 h-4 text-primary" /> {k.keyTag}</h4>
                              <span className="text-[10px] text-gray-400 font-bold block mt-1">Property: <strong className="text-white">{k.property?.title}</strong></span>
                            </div>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-widest ${
                              k.status === 'IN_OFFICE' ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {k.status === 'IN_OFFICE' ? "In Cabinet" : "Checked Out"}
                            </span>
                          </div>

                          {/* Active checkout details */}
                          {activeCheckout && (
                            <div className="p-3 bg-secondary/30 rounded-xl border border-border/40 text-xs space-y-1">
                              <p className="text-[9px] font-black uppercase text-amber-400 tracking-wider">Checked Out By</p>
                              <p className="text-white font-bold">{activeCheckout.user?.firstName} {activeCheckout.user?.lastName || ""}</p>
                              {activeCheckout.notes && <p className="text-[10px] text-gray-400 font-semibold italic">Notes: "{activeCheckout.notes}"</p>}
                              <p className="text-[9px] text-gray-500 font-bold">Since: {new Date(activeCheckout.checkoutDate).toLocaleDateString()}</p>
                            </div>
                          )}
                        </div>

                        {k.status === 'IN_OFFICE' ? (
                          <button
                            onClick={() => {
                              setSelectedItem(k);
                              setIsCheckoutOpen(true);
                            }}
                            className="w-full mt-5 py-2 rounded-xl bg-primary hover:bg-primary/95 text-white transition-all text-xs font-black uppercase tracking-widest shadow glow-primary flex justify-center items-center gap-1"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" /> Checkout Key
                          </button>
                        ) : activeCheckout ? (
                          <button
                            onClick={() => handleReturnKey(activeCheckout.id)}
                            className="w-full mt-5 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white transition-all text-xs font-black uppercase tracking-widest shadow flex justify-center items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Return key to Cabinet
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* 1. Schedule Transit Modal */}
      {isScheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-lg rounded-2xl border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2"><Compass className="w-5 h-5 text-primary" /> Schedule Pickup Visit</h2>
              <button onClick={() => setIsScheduleOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleScheduleSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Pickup Date & Time</label>
                <input
                  required
                  type="datetime-local"
                  className="w-full glass-input px-4 py-2 rounded-xl text-sm"
                  value={scheduleForm.visitDate}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, visitDate: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Pickup Coordinates/Location</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="Gulberg Office Lobby"
                    value={scheduleForm.pickupLocation}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, pickupLocation: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Drop Location / Site</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                    placeholder="DHA Phase 6 Villa"
                    value={scheduleForm.dropLocation}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, dropLocation: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Select Driver</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={scheduleForm.driverId}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, driverId: e.target.value })}
                  >
                    <option value="">-- Choose Driver --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.employeeProfile?.user?.firstName} {d.employeeProfile?.user?.lastName || ""} ({d.status})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Assign Fleet Vehicle</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={scheduleForm.vehicleId}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, vehicleId: e.target.value })}
                  >
                    <option value="">-- Choose Car --</option>
                    {vehicles.filter(v => v.status === 'ACTIVE').map(v => (
                      <option key={v.id} value={v.id}>{v.modelName} [{v.plateNumber}]</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/60">
                <button type="button" onClick={() => setIsScheduleOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center gap-2 glow-primary">{isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}Confirm Visit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Add Vehicle Modal */}
      {isVehicleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-md rounded-2xl border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2"><Truck className="w-5 h-5 text-primary" /> Add Vehicle</h2>
              <button onClick={() => setIsVehicleOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleVehicleSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Car Model Name</label>
                <input
                  required
                  type="text"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="Toyota Corolla Altis"
                  onChange={(e) => setVehicleForm({ ...vehicleForm, modelName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Plate Number</label>
                <input
                  required
                  type="text"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="LEA-8293"
                  value={vehicleForm.plateNumber}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/60">
                <button type="button" onClick={() => setIsVehicleOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center gap-2 glow-primary">{isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}Save Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Register Driver Modal */}
      {isDriverOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-md rounded-2xl border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2"><User className="w-5 h-5 text-primary" /> Register Driver</h2>
              <button onClick={() => setIsDriverOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleDriverSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Choose Employee Profile</label>
                <select
                  required
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                  value={driverForm.employeeProfileId}
                  onChange={(e) => setDriverForm({ ...driverForm, employeeProfileId: e.target.value })}
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.employeeProfile?.id}>{e.firstName} {e.lastName || ""} ({e.employeeProfile?.designation || "Realtor"})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Direct Driver License Number</label>
                <input
                  required
                  type="text"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="DL-LHR-49203"
                  value={driverForm.licenseNumber}
                  onChange={(e) => setDriverForm({ ...driverForm, licenseNumber: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/60">
                <button type="button" onClick={() => setIsDriverOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center gap-2 glow-primary">{isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}Register Driver</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Add Key Tracker Modal */}
      {isKeyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-md rounded-2xl border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2"><Key className="w-5 h-5 text-primary" /> Register Property Key</h2>
              <button onClick={() => setIsKeyOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleKeySubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Key tag/box code</label>
                <input
                  required
                  type="text"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="KEY-DHA6-B42"
                  value={keyForm.keyTag}
                  onChange={(e) => setKeyForm({ ...keyForm, keyTag: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Select Property</label>
                <select
                  required
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                  value={keyForm.propertyId}
                  onChange={(e) => setKeyForm({ ...keyForm, propertyId: e.target.value })}
                >
                  <option value="">-- Select Listing --</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.title} - {p.location}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/60">
                <button type="button" onClick={() => setIsKeyOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center gap-2 glow-primary">{isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}Archive Key</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Keys Checkout Modal */}
      {isCheckoutOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-md rounded-2xl border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2"><Key className="w-5 h-5 text-primary" /> Checkout Key tag {selectedItem.keyTag}</h2>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleCheckoutSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Checkout Purpose / notes</label>
                <textarea
                  required
                  rows={3}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm resize-none text-white"
                  placeholder="Checked out keys for customer viewing visit scheduled at 5 PM..."
                  value={checkoutNotes}
                  onChange={(e) => setCheckoutNotes(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/60">
                <button type="button" onClick={() => setIsCheckoutOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center gap-2 glow-primary">{isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}Checkout Key</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Vehicle Maintenance Modal */}
      {isMaintenanceOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-md rounded-2xl border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2"><Wrench className="w-5 h-5 text-primary" /> Log Maintenance for {selectedItem.modelName}</h2>
              <button onClick={() => setIsMaintenanceOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleMaintenanceSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Issue / Repairs Details</label>
                <input
                  required
                  type="text"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="Engine oil change and filter swap required"
                  value={maintenanceForm.description}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Estimated Cost (PKR)</label>
                <input
                  type="number"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="8500"
                  value={maintenanceForm.cost}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/60">
                <button type="button" onClick={() => setIsMaintenanceOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center gap-2 glow-primary">{isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}Submit Repair Logs</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
