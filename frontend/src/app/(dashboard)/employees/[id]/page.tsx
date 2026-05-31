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
  CircleDollarSign,
  Check,
  Clock,
  Calendar,
  FileText,
  Activity,
  ClipboardList,
  Star,
  Trash2,
  Settings,
  ThumbsUp,
  Plus,
  ArrowLeft,
  CalendarDays,
  ShieldCheck,
  CheckSquare,
  Square,
  Coins,
  TrendingUp,
  Wallet,
  Lock
} from "lucide-react";

export default function EmployeeCommandCenter() {
  const { id } = useParams();
  const router = useRouter();
  const { token, user: currentUser } = useAuth();
  
  const [employee, setEmployee] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // Tab State Handlers
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);

  // Forms States
  const [profileData, setProfileData] = useState({ department: "", designation: "", salary: "", status: "ACTIVE" });
  const [leaveData, setLeaveData] = useState({ startDate: "", endDate: "", type: "ANNUAL", reason: "" });
  const [docData, setDocData] = useState({ name: "", category: "ID", fileUrl: "" });
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutSummaryText, setCheckoutSummaryText] = useState("");
  const [taskData, setTaskData] = useState({ title: "", description: "", dueDate: "" });
  const [reviewData, setReviewData] = useState({ rating: "5", feedback: "" });
  const [payrollData, setPayrollData] = useState({ month: new Date().toISOString().slice(0, 7), baseSalary: "", allowances: "0", deductions: "0", status: "UNPAID" });
  const [isVaultLockOpen, setIsVaultLockOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [newPasswordVal, setNewPasswordVal] = useState("");

  const fetchEmployeeData = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployee(data);
        
        // Find today's attendance (format: YYYY-MM-DD)
        const todayStr = new Date().toISOString().split("T")[0];
        const todayAtt = data.employeeProfile?.attendances?.find((a: any) => a.dateStr === todayStr);
        setTodayAttendance(todayAtt || null);

        // Prep Edit Profile Form
        if (data.employeeProfile) {
          setProfileData({
            department: data.employeeProfile.department || "",
            designation: data.employeeProfile.designation || "",
            salary: data.employeeProfile.salary?.toString() || "",
            status: data.employeeProfile.status || "ACTIVE",
          });
        }
      }
    } catch (error) {
      console.error("Error fetching employee detail:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeeData();
  }, [id, token]);

  const getTodayStr = () => new Date().toISOString().split("T")[0];

  // 1. Check-In & Out Actions
  const handleCheckIn = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/attendance/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ dateStr: getTodayStr() })
      });
      if (res.ok) {
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckOut = async (summaryText: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/attendance/check-out`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ dateStr: getTodayStr(), summary: summaryText })
      });
      if (res.ok) {
        setIsCheckoutOpen(false);
        setCheckoutSummaryText("");
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Profile Details Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      if (res.ok) {
        alert("Employee Profile updated successfully!");
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Leave Requests
  const handleRequestLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/leaves`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(leaveData)
      });
      if (res.ok) {
        setLeaveData({ startDate: "", endDate: "", type: "ANNUAL", reason: "" });
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateLeaveStatus = async (leaveId: string, status: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/leaves/${leaveId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 4. Documents Upload & Delete
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(docData)
      });
      if (res.ok) {
        setDocData({ name: "", category: "ID", fileUrl: "" });
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 5. Activity Log Addition (Removed manual logging in favor of automated checkout summary)

  // 6. Assign Tasks
  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(taskData)
      });
      if (res.ok) {
        setTaskData({ title: "", description: "", dueDate: "" });
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTaskStatus = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "COMPLETED" ? "PENDING" : "COMPLETED";
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 7. Performance Ratings
  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/performance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(reviewData)
      });
      if (res.ok) {
        setReviewData({ rating: "5", feedback: "" });
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 8. Payroll Handlers
  const handleGeneratePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/payrolls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          month: payrollData.month,
          baseSalary: payrollData.baseSalary || profile.salary || 0,
          allowances: payrollData.allowances,
          deductions: payrollData.deductions,
          status: payrollData.status
        })
      });
      if (res.ok) {
        setPayrollData({ month: new Date().toISOString().slice(0, 7), baseSalary: "", allowances: "0", deductions: "0", status: "UNPAID" });
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePayrollStatus = async (payrollId: string, status: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/payrolls/${payrollId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeletePayroll = async (payrollId: string) => {
    if (!confirm("Are you sure you want to delete this payroll record?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/payrolls/${payrollId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchEmployeeData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasswordVal.trim() || !token) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees/${id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ password: newPasswordVal })
      });
      if (res.ok) {
        alert("🔒 User password reset successfully!");
        setNewPasswordVal("");
        setIsResetPasswordOpen(false);
      } else {
        const err = await res.json();
        alert(`⚠️ Failed to reset password: ${err.message || 'Server error'}`);
      }
    } catch (e) {
      console.error(e);
      alert("⚠️ Network connection error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Authorization Check Helpers
  const isAdmin = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN" || currentUser?.role === "HR";



  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
        <div className="absolute top-[30%] left-[30%] w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <Loader2 className="w-10 h-10 animate-spin text-primary glow-primary" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center text-center">
        <p className="text-xl font-bold text-red-400 mb-4">Employee command center profile not found.</p>
        <button onClick={() => router.push(isAdmin ? "/employees" : "/dashboard")} className="bg-primary px-5 py-2.5 rounded-xl font-bold text-white shadow-lg flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" /> {isAdmin ? "Back to Directory" : "Back to Dashboard"}
        </button>
      </div>
    );
  }

  const profile = employee.employeeProfile || {};
  const fullName = `${employee.firstName} ${employee.lastName || ""}`;

  // Computations
  const averageRating = profile.reviews?.length > 0 
    ? (profile.reviews.reduce((acc: number, item: any) => acc + item.rating, 0) / profile.reviews.length).toFixed(1)
    : "N/A";

  const tabs = [
    { id: "overview", name: "Overview", icon: User },
    { id: "splits", name: "Earnings & Splits", icon: Coins },
    { id: "attendance", name: "Attendance", icon: Clock },
    { id: "leaves", name: "Leaves Planner", icon: CalendarDays },
    { id: "documents", name: "Documents", icon: FileText },
    { id: "activities", name: "Activities Tracker", icon: Activity },
    { id: "tasks", name: "Tasks Assigned", icon: ClipboardList },
    { id: "performance", name: "Performance", icon: Star },
    { id: "payroll", name: "Payroll Locker", icon: CircleDollarSign }
  ];

  return (
    <div className="min-h-screen p-8 relative z-10 overflow-x-hidden space-y-8">
      {/* Background Neon Glows */}
      <div className="absolute top-10 right-10 w-96 h-96 bg-primary/15 rounded-full blur-3xl -z-10 pointer-events-none"></div>
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header back bar */}
      <div className="flex justify-between items-center animate-fade-in">
        <button
          onClick={() => router.push(isAdmin ? "/employees" : "/dashboard")}
          className="text-gray-400 hover:text-white transition-colors flex items-center gap-2.5 font-bold uppercase tracking-wider text-xs"
        >
          <ArrowLeft className="w-4.5 h-4.5" /> {isAdmin ? "Back to Directory" : "Back to Dashboard"}
        </button>
        <span className="text-xs font-black uppercase text-gray-500 tracking-widest bg-secondary/40 border border-border px-3 py-1.5 rounded-full">
          Employee ID: {employee.id.slice(0, 8)}...
        </span>
      </div>

      {/* Main Profile Command Center Card */}
      <div className="glass rounded-3xl p-6.5 border border-border flex flex-col md:flex-row gap-6 items-center md:items-start animate-fade-in">
        <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-gradient-to-tr from-primary to-cyan-500 flex items-center justify-center text-4xl font-extrabold text-white glow-primary select-none flex-shrink-0 shadow-xl shadow-primary/10">
          {employee.firstName.charAt(0)}
        </div>
        <div className="flex-1 text-center md:text-left space-y-3.5">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">{fullName}</h1>
            <p className="text-sm font-semibold text-gray-400 mt-1 flex items-center justify-center md:justify-start gap-2">
              <Briefcase className="w-4.5 h-4.5 text-primary" />
              {profile.designation || "Executive Realtor"} &bull;{" "}
              <span className="text-primary font-bold">{profile.department || "Residential Brokerage"}</span>
            </p>
          </div>

          <div className="flex flex-wrap justify-center md:justify-start gap-3 items-center pt-2">
            <span className="text-[11px] uppercase font-black px-3 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/30 tracking-widest">
              {employee.role}
            </span>
            <span className={`text-[11px] uppercase font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 border ${
              profile.status === 'ACTIVE' 
                ? 'bg-green-500/10 text-green-400 border-green-500/25 shadow-[0_0_12px_rgba(34,197,94,0.15)]' 
                : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${profile.status === 'ACTIVE' ? 'bg-green-400' : 'bg-amber-400'}`}></span>
              {profile.status || "ACTIVE"}
            </span>
            {averageRating !== "N/A" && (
              <span className="text-[11px] font-black px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/25 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-current" />
                Score: {averageRating} / 5.0
              </span>
            )}
          </div>
        </div>

        {/* Quick Check-In / Check-Out Controls */}
        <div className="glass p-5 rounded-2xl border border-border flex flex-col gap-3 min-w-[240px] text-center md:text-left self-stretch md:self-auto bg-card/40 backdrop-blur-md">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 justify-center md:justify-start">
            <Clock className="w-4 h-4 text-primary" /> Today's Attendance
          </p>
          {todayAttendance ? (
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-300">
                In: <span className="text-white font-black">{new Date(todayAttendance.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </p>
              {todayAttendance.checkOut ? (
                <p className="text-xs font-bold text-gray-300">
                  Out: <span className="text-white font-black">{new Date(todayAttendance.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </p>
              ) : (
                <button
                  onClick={() => setIsCheckoutOpen(true)}
                  disabled={isSubmitting}
                  className="w-full mt-2 py-2 text-xs font-bold uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-md shadow-amber-500/10 hover:scale-[1.02] active:scale-95 transition-all animate-pulse"
                >
                  Check Out
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleCheckIn}
              disabled={isSubmitting}
              className="w-full mt-1.5 py-2.5 text-xs font-black uppercase tracking-widest bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg glow-primary hover:scale-[1.02] active:scale-95 transition-all flex justify-center items-center gap-1.5"
            >
              Check In
            </button>
          )}
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-border/40 scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4.5 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all flex-shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(239,68,68,0.06)]"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
            }`}
          >
            <tab.icon className="w-4.5 h-4.5" />
            {tab.name}
          </button>
        ))}
      </div>

      {/* TAB CONTENTS */}
      <div className="animate-fade-in">
        
        {/* 1. OVERVIEW / EDIT PROFILE */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <Settings className="w-5 h-5 text-primary" /> Profile Settings & Organization Allocation
              </h2>

              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Department</label>
                    <input
                      type="text"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      placeholder="Residential Brokerage"
                      value={profileData.department}
                      disabled={!isAdmin}
                      onChange={(e) => setProfileData({ ...profileData, department: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Designation</label>
                    <input
                      type="text"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      placeholder="Senior Agent"
                      value={profileData.designation}
                      disabled={!isAdmin}
                      onChange={(e) => setProfileData({ ...profileData, designation: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Salary (PKR / month)</label>
                    <input
                      type="number"
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      placeholder="180000"
                      value={profileData.salary}
                      disabled={!isAdmin}
                      onChange={(e) => setProfileData({ ...profileData, salary: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Status</label>
                    <select
                      className="w-full glass-input px-4 py-2.5 rounded-xl text-sm text-white"
                      value={profileData.status}
                      disabled={!isAdmin}
                      onChange={(e) => setProfileData({ ...profileData, status: e.target.value })}
                    >
                      <option value="ACTIVE">Active Employee</option>
                      <option value="ON_LEAVE">On Leave</option>
                      <option value="TERMINATED">Terminated</option>
                    </select>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex justify-end pt-4.5 border-t border-border/40">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-6 py-3 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex items-center gap-2"
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Save Profile Allocation
                    </button>
                  </div>
                )}
              </form>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">General Information</h2>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-black">Email Address</p>
                  <p className="text-white font-bold mt-1.5 flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-primary" /> {employee.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-black">Designated System Role</p>
                  <p className="text-white font-bold mt-1.5 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-primary" /> {employee.role}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-black">Member Since</p>
                  <p className="text-white font-bold mt-1.5 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary" /> {new Date(employee.createdAt).toLocaleDateString([], { dateStyle: 'long' })}
                  </p>
                </div>

                {currentUser?.role === "SUPER_ADMIN" && (
                  <div className="pt-4.5 border-t border-border/40 space-y-3">
                    <p className="text-xs text-gray-400 uppercase tracking-widest font-black">Security Controls</p>
                    <button
                      onClick={() => setIsResetPasswordOpen(true)}
                      className="w-full py-2.5 bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/30 hover:border-red-500 text-red-400 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Lock className="w-4 h-4" /> Reset User Password
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. ATTENDANCE LOG */}
        {activeTab === "attendance" && (
          <div className="glass rounded-2xl p-6 border border-border space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
              <Clock className="w-5 h-5 text-primary" /> Monthly Attendance Sheet
            </h2>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-left text-sm text-gray-300">
                <thead className="bg-secondary/40 text-xs font-black uppercase text-gray-400 tracking-wider">
                  <tr>
                    <th className="p-4 border-b border-border">Date</th>
                    <th className="p-4 border-b border-border">Check In</th>
                    <th className="p-4 border-b border-border">Check Out</th>
                    <th className="p-4 border-b border-border">Total Hours</th>
                    <th className="p-4 border-b border-border">Daily Summary</th>
                    <th className="p-4 border-b border-border">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {profile.attendances?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground bg-card/10">No attendance logs available for this period.</td>
                    </tr>
                  ) : (
                    profile.attendances?.map((att: any) => {
                      const checkInTime = att.checkIn ? new Date(att.checkIn) : null;
                      const checkOutTime = att.checkOut ? new Date(att.checkOut) : null;
                      
                      let diffHours = "N/A";
                      if (checkInTime && checkOutTime) {
                        const diffMs = checkOutTime.getTime() - checkInTime.getTime();
                        diffHours = (diffMs / (1000 * 60 * 60)).toFixed(2) + " hrs";
                      }
                      
                      return (
                        <tr key={att.id} className="hover:bg-secondary/15 transition-colors">
                          <td className="p-4 font-bold text-white">{att.dateStr}</td>
                          <td className="p-4 font-semibold text-gray-300">
                            {checkInTime ? checkInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}
                          </td>
                          <td className="p-4 font-semibold text-gray-300">
                            {checkOutTime ? checkOutTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}
                          </td>
                          <td className="p-4 font-bold text-primary">{diffHours}</td>
                          <td className="p-4 text-xs font-semibold text-gray-300 max-w-[240px] truncate" title={att.checkoutSummary}>
                            {att.checkoutSummary || <span className="text-gray-600 italic">No summary logged</span>}
                          </td>
                          <td className="p-4">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-green-500/10 border border-green-500/25 text-green-400 tracking-widest">
                              {att.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. LEAVE PLANNER */}
        {activeTab === "leaves" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <CalendarDays className="w-5 h-5 text-primary" /> Leave Requests Timeline
              </h2>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-left text-sm text-gray-300">
                  <thead className="bg-secondary/40 text-xs font-black uppercase text-gray-400 tracking-wider">
                    <tr>
                      <th className="p-4 border-b border-border">Type</th>
                      <th className="p-4 border-b border-border">Date Interval</th>
                      <th className="p-4 border-b border-border">Reason</th>
                      <th className="p-4 border-b border-border">Status</th>
                      {isAdmin && <th className="p-4 border-b border-border text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {profile.leaveRequests?.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 5 : 4} className="p-6 text-center text-muted-foreground bg-card/10">No leaves requests found.</td>
                      </tr>
                    ) : (
                      profile.leaveRequests?.map((leave: any) => (
                        <tr key={leave.id} className="hover:bg-secondary/15 transition-colors">
                          <td className="p-4 font-extrabold text-white text-xs tracking-wider">{leave.type}</td>
                          <td className="p-4 text-xs font-bold text-gray-300">
                            {new Date(leave.startDate).toLocaleDateString([], { month: 'short', day: 'numeric' })} - {new Date(leave.endDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="p-4 max-w-[180px] truncate text-xs text-gray-400 font-semibold" title={leave.reason}>
                            {leave.reason || "Personal"}
                          </td>
                          <td className="p-4">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-widest ${
                              leave.status === 'APPROVED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                              leave.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {leave.status}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="p-4 text-right space-x-2">
                              {leave.status === 'PENDING' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateLeaveStatus(leave.id, 'APPROVED')}
                                    className="bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleUpdateLeaveStatus(leave.id, 'REJECTED')}
                                    className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Request Leave</h2>
              <form onSubmit={handleRequestLeave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Leave Type</label>
                  <select
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    value={leaveData.type}
                    onChange={(e) => setLeaveData({ ...leaveData, type: e.target.value })}
                  >
                    <option value="ANNUAL">Annual Leave</option>
                    <option value="SICK">Sick Leave</option>
                    <option value="CASUAL">Casual Leave</option>
                    <option value="UNPAID">Unpaid Leave</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Start Date</label>
                  <input
                    required
                    type="date"
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    value={leaveData.startDate}
                    onChange={(e) => setLeaveData({ ...leaveData, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">End Date</label>
                  <input
                    required
                    type="date"
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    value={leaveData.endDate}
                    onChange={(e) => setLeaveData({ ...leaveData, endDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Reason / Explanation</label>
                  <textarea
                    rows={2}
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm resize-none"
                    placeholder="Brief explanation..."
                    value={leaveData.reason}
                    onChange={(e) => setLeaveData({ ...leaveData, reason: e.target.value })}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex justify-center items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Leave Request
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 4. DOCUMENT LOCKER */}
        {activeTab === "documents" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <FileText className="w-5 h-5 text-primary" /> Digital Document Locker
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profile.documents?.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">
                    No documents uploaded yet. Add a new document in the locker.
                  </div>
                ) : (
                  profile.documents?.map((doc: any) => (
                    <div key={doc.id} className="glass p-5 rounded-2xl border border-border flex items-center justify-between group/card">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-sm line-clamp-1">{doc.name}</h4>
                          <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-secondary/50 border border-border text-gray-400 tracking-wider">
                            {doc.category}
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
                          View File
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
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Locker Upload</h2>
              <form onSubmit={handleUploadDocument} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Document Name</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    placeholder="Emirates ID - Ahmed Raza"
                    value={docData.name}
                    onChange={(e) => setDocData({ ...docData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Category</label>
                  <select
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    value={docData.category}
                    onChange={(e) => setDocData({ ...docData, category: e.target.value })}
                  >
                    <option value="ID">Identification card (ID)</option>
                    <option value="CONTRACT">Brokerage Contract</option>
                    <option value="RESUME">Resume / CV</option>
                    <option value="OTHER">Other Credentials</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Document URL (PDF / Image)</label>
                  <input
                    type="url"
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    placeholder="https://example.com/file.pdf"
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
                  Register Document
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 5. ACTIVITIES TRACKER */}
        {activeTab === "activities" && (
          <div className="glass rounded-2xl p-6 border border-border space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
              <Activity className="w-5 h-5 text-primary" /> Daily Activity Timeline & Checkout Summaries
            </h2>
 
            <div className="relative pl-6 space-y-6 border-l border-border/80 ml-3 py-2">
              {profile.activities?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground glass rounded-xl border border-border border-dashed ml-[-24px] pl-6">
                  No daily activities logged yet. Daily checkout accomplishment summaries will automatically populate here.
                </div>
              ) : (
                profile.activities?.map((activity: any) => (
                  <div key={activity.id} className="relative group animate-fade-in">
                    {/* Timeline node sphere */}
                    <span className="absolute left-[-31px] top-1.5 w-4 h-4 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center glow-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                    </span>
                    <div className="space-y-1 ml-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary tracking-wider">
                          {activity.category}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold">
                          {new Date(activity.logTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &bull; {new Date(activity.logTime).toLocaleDateString([], { dateStyle: 'medium' })}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white leading-relaxed">{activity.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 6. TASKS ASSIGNED */}
        {activeTab === "tasks" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <ClipboardList className="w-5 h-5 text-primary" /> Operational Checklists
              </h2>

              <div className="space-y-3">
                {employee.assignedTasks?.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">
                    No checklists or tasks assigned to this employee. Assign a task using the panel on the right.
                  </div>
                ) : (
                  employee.assignedTasks?.map((task: any) => (
                    <div
                      key={task.id}
                      className={`glass p-4 rounded-xl border border-border flex items-center justify-between transition-opacity ${
                        task.status === "COMPLETED" ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleTaskStatus(task.id, task.status)}
                          className="mt-0.5 focus:outline-none transition-transform active:scale-95 text-gray-400 hover:text-primary flex-shrink-0"
                        >
                          {task.status === "COMPLETED" ? (
                            <ThumbsUp className="w-5.5 h-5.5 text-green-500 fill-current" />
                          ) : (
                            <Square className="w-5.5 h-5.5" />
                          )}
                        </button>
                        <div>
                          <h4 className={`font-bold text-sm ${task.status === "COMPLETED" ? "line-through text-gray-400" : "text-white"}`}>
                            {task.title}
                          </h4>
                          {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                        </div>
                      </div>
                      {task.dueDate && (
                        <span className="text-[10px] font-black uppercase text-gray-500 px-2 py-0.5 rounded bg-secondary">
                          Due: {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Assign Task</h2>
              <form onSubmit={handleAssignTask} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Task Title</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    placeholder="Prepare residential agreement"
                    value={taskData.title}
                    onChange={(e) => setTaskData({ ...taskData, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Details</label>
                  <textarea
                    rows={2}
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm resize-none"
                    placeholder="Incorporate owner details..."
                    value={taskData.description}
                    onChange={(e) => setTaskData({ ...taskData, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Due Date</label>
                  <input
                    type="date"
                    className="w-full glass-input px-3.5 py-2 rounded-xl text-sm"
                    value={taskData.dueDate}
                    onChange={(e) => setTaskData({ ...taskData, dueDate: e.target.value })}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex justify-center items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Assign Task Check
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 7. PERFORMANCE TRACKING */}
        {activeTab === "performance" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <Star className="w-5 h-5 text-primary" /> Manager Performance Evaluations
              </h2>

              <div className="space-y-4">
                {profile.reviews?.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground glass border border-dashed border-border rounded-xl">
                    No performance reviews evaluated. Submit a review using the panel on the right.
                  </div>
                ) : (
                  profile.reviews?.map((review: any) => (
                    <div key={review.id} className="glass p-5 rounded-2xl border border-border space-y-2 relative group/card">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <Star
                              key={idx}
                              className={`w-4 h-4 ${idx < review.rating ? "text-yellow-400 fill-current shadow-[0_0_8px_rgba(234,179,8,0.2)]" : "text-gray-600"}`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-gray-500 font-bold uppercase">
                          {new Date(review.reviewDate).toLocaleDateString([], { dateStyle: 'medium' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 font-medium leading-relaxed italic">"{review.feedback}"</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Submit Evaluation</h2>
              {isAdmin ? (
                <form onSubmit={handleAddReview} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Score (1 to 5 Stars)</label>
                    <select
                      className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm font-bold text-yellow-400 bg-secondary"
                      value={reviewData.rating}
                      onChange={(e) => setReviewData({ ...reviewData, rating: e.target.value })}
                    >
                      <option value="5">⭐⭐⭐⭐⭐ Excellent (5)</option>
                      <option value="4">⭐⭐⭐⭐ Great (4)</option>
                      <option value="3">⭐⭐⭐ Good (3)</option>
                      <option value="2">⭐⭐ Fair (2)</option>
                      <option value="1">⭐ Poor (1)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Review Feedback</label>
                    <textarea
                      required
                      rows={3}
                      className="w-full glass-input px-3.5 py-2 rounded-xl text-sm resize-none text-white leading-relaxed"
                      placeholder="Write qualitative feedback for the employee performance..."
                      value={reviewData.feedback}
                      onChange={(e) => setReviewData({ ...reviewData, feedback: e.target.value })}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex justify-center items-center gap-1.5 shadow-lg"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Register Performance Check
                  </button>
                </form>
              ) : (
                <div className="p-4 bg-secondary/30 border border-border rounded-xl text-center text-xs text-muted-foreground leading-relaxed">
                  Only Super Admins, Admins, or Human Resources can evaluate and register employee performance reviews.
                </div>
              )}
            </div>
          </div>
        )}

        {/* 8. PAYROLL LOCKER */}
        {activeTab === "payroll" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 glass rounded-2xl p-6 border border-border space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2 border-b border-border pb-3.5 text-white">
                <CircleDollarSign className="w-5 h-5 text-primary" /> Monthly Payroll Payslips
              </h2>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-left text-sm text-gray-300">
                  <thead className="bg-secondary/40 text-xs font-black uppercase text-gray-400 tracking-wider">
                    <tr>
                      <th className="p-4 border-b border-border">Month</th>
                      <th className="p-4 border-b border-border">Base Salary</th>
                      <th className="p-4 border-b border-border">Allowances</th>
                      <th className="p-4 border-b border-border">Deductions</th>
                      <th className="p-4 border-b border-border">Net Pay</th>
                      <th className="p-4 border-b border-border">Status</th>
                      {isAdmin && <th className="p-4 border-b border-border text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {profile.payrolls?.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} className="p-6 text-center text-muted-foreground bg-card/10">No payslips recorded for this employee.</td>
                      </tr>
                    ) : (
                      profile.payrolls?.map((p: any) => (
                        <tr key={p.id} className="hover:bg-secondary/15 transition-colors text-xs">
                          <td className="p-4 font-extrabold text-white text-sm">{p.month}</td>
                          <td className="p-4 font-semibold">PKR {p.baseSalary?.toLocaleString()}</td>
                          <td className="p-4 font-semibold text-green-400">+PKR {p.allowances?.toLocaleString()}</td>
                          <td className="p-4 font-semibold text-red-400">-PKR {p.deductions?.toLocaleString()}</td>
                          <td className="p-4 font-black text-primary">PKR {p.netSalary?.toLocaleString()}</td>
                          <td className="p-4">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-widest ${
                              p.status === 'PAID' ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {p.status}
                            </span>
                            {p.paidAt && (
                              <span className="block text-[8px] text-gray-500 font-bold mt-1">
                                Paid: {new Date(p.paidAt).toLocaleDateString()}
                              </span>
                            )}
                          </td>
                          {isAdmin && (
                            <td className="p-4 text-right space-x-2">
                              {p.status === 'UNPAID' ? (
                                <button
                                  onClick={() => handleUpdatePayrollStatus(p.id, 'PAID')}
                                  className="bg-green-500 hover:bg-green-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow"
                                >
                                  Mark Paid
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUpdatePayrollStatus(p.id, 'UNPAID')}
                                  className="bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow"
                                >
                                  Mark Unpaid
                                </button>
                              )}
                              <button
                                onClick={() => handleDeletePayroll(p.id)}
                                className="text-red-400 hover:text-red-500 p-1.5 rounded inline-flex items-center"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass rounded-2xl p-6 border border-border space-y-5 h-fit">
              <h2 className="text-xl font-bold border-b border-border pb-3.5 text-white">Generate Payslip</h2>
              {isAdmin ? (
                <form onSubmit={handleGeneratePayroll} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Target Month</label>
                    <input
                      required
                      type="month"
                      className="w-full glass-input px-3.5 py-2 rounded-xl text-sm text-white"
                      value={payrollData.month}
                      onChange={(e) => setPayrollData({ ...payrollData, month: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Base Salary (Leave blank for default: PKR {profile.salary?.toLocaleString() || 0})</label>
                    <input
                      type="number"
                      className="w-full glass-input px-3.5 py-2 rounded-xl text-sm text-white"
                      placeholder={profile.salary?.toString() || "0"}
                      value={payrollData.baseSalary}
                      onChange={(e) => setPayrollData({ ...payrollData, baseSalary: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Allowances</label>
                      <input
                        type="number"
                        className="w-full glass-input px-3.5 py-2 rounded-xl text-sm text-white"
                        value={payrollData.allowances}
                        onChange={(e) => setPayrollData({ ...payrollData, allowances: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Deductions</label>
                      <input
                        type="number"
                        className="w-full glass-input px-3.5 py-2 rounded-xl text-sm text-white"
                        value={payrollData.deductions}
                        onChange={(e) => setPayrollData({ ...payrollData, deductions: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Payment Status</label>
                    <select
                      className="w-full glass-input px-3.5 py-2 rounded-xl text-sm text-white bg-secondary"
                      value={payrollData.status}
                      onChange={(e) => setPayrollData({ ...payrollData, status: e.target.value })}
                    >
                      <option value="UNPAID">UNPAID (Pending)</option>
                      <option value="PAID">PAID (Settled)</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs uppercase tracking-wider glow-primary transition-all flex justify-center items-center gap-1.5 shadow-lg"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create Payslip Entry
                  </button>
                </form>
              ) : (
                <div className="p-4 bg-secondary/30 border border-border rounded-xl text-center text-xs text-muted-foreground leading-relaxed">
                  Only Super Admins, Admins, or HR departments can generate and modify monthly payroll records.
                </div>
              )}
            </div>
          </div>
        )}

        {/* 9. EARNINGS & SPLITS PANEL */}
        {activeTab === "splits" && (
          <div className="space-y-8 animate-fade-in">
            {/* Glowing Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass p-6 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/5 to-transparent relative overflow-hidden group shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -z-10 transition-transform group-hover:scale-150 duration-500"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Brokerage Split Ratio</p>
                    <h3 className="text-2xl font-black text-white mt-1.5">70/30 Split</h3>
                    <p className="text-xs text-gray-400 mt-1 font-semibold">70% Agent / 30% RENS</p>
                  </div>
                  <div className="w-10 h-10 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="glass p-6 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden group shadow-[0_0_20px_rgba(239,68,68,0.05)]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -z-10 transition-transform group-hover:scale-150 duration-500"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase text-primary tracking-wider">Total Commission Earned</p>
                    <h3 className="text-2xl font-black text-white mt-1.5">PKR 1,513,500</h3>
                    <p className="text-xs text-gray-400 mt-1 font-semibold">Net closed deal revenues</p>
                  </div>
                  <div className="w-10 h-10 bg-primary/15 text-primary border border-primary/25 rounded-xl flex items-center justify-center">
                    <Coins className="w-5 h-5" />
                  </div>
                </div>
              </div>

              <div className="glass p-6 rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/5 to-transparent relative overflow-hidden group shadow-[0_0_20px_rgba(6,182,212,0.05)]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl -z-10 transition-transform group-hover:scale-150 duration-500"></div>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase text-cyan-400 tracking-wider">Pending Split Payout</p>
                    <h3 className="text-2xl font-black text-white mt-1.5">PKR 936,500</h3>
                    <p className="text-xs text-gray-400 mt-1 font-semibold">Awaiting administrative release</p>
                  </div>
                  <div className="w-10 h-10 bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 rounded-xl flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Table list of closed deals splits ledger */}
            <div className="glass rounded-2xl p-6 border border-border space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Coins className="w-5 h-5 text-primary" /> Closed Deals Commission Splits Ledger
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Audited split calculations for closed real estate transactions.</p>
                </div>

                {isAdmin && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsVaultLockOpen(true)}
                      className="px-4 py-2 border border-border/60 hover:border-primary/40 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-white rounded-xl bg-secondary/30 transition-all cursor-pointer"
                    >
                      Adjust Split Plan
                    </button>
                    <button
                      onClick={() => setIsVaultLockOpen(true)}
                      className="px-4 py-2 bg-primary hover:bg-primary/95 text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-lg glow-primary transition-all cursor-pointer"
                    >
                      Release Split Payout
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-left text-sm text-gray-300">
                  <thead className="bg-secondary/40 text-xs font-black uppercase text-gray-400 tracking-wider">
                    <tr>
                      <th className="p-4 border-b border-border">Deal ID</th>
                      <th className="p-4 border-b border-border">Closed Property</th>
                      <th className="p-4 border-b border-border">Deal Value</th>
                      <th className="p-4 border-b border-border">Brokerage Comm.</th>
                      <th className="p-4 border-b border-border">Agent Split (70%)</th>
                      <th className="p-4 border-b border-border">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 text-xs">
                    <tr className="hover:bg-secondary/10 transition-colors">
                      <td className="p-4 font-extrabold text-white">DEAL-2026-081</td>
                      <td className="p-4 font-bold text-gray-300">5 Marla Apartment, DHA Phase 6</td>
                      <td className="p-4 font-semibold">PKR 12,500,000</td>
                      <td className="p-4 font-semibold">PKR 250,000 (2.0%)</td>
                      <td className="p-4 font-black text-emerald-400">PKR 175,000</td>
                      <td className="p-4">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                          RELEASED
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-secondary/10 transition-colors">
                      <td className="p-4 font-extrabold text-white">DEAL-2026-079</td>
                      <td className="p-4 font-bold text-gray-300">10 Marla Corporate Suite, Gulberg Heights</td>
                      <td className="p-4 font-semibold">PKR 45,000,000</td>
                      <td className="p-4 font-semibold">PKR 900,000 (2.0%)</td>
                      <td className="p-4 font-black text-emerald-400">PKR 630,000</td>
                      <td className="p-4">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                          RELEASED
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-secondary/10 transition-colors">
                      <td className="p-4 font-extrabold text-white">DEAL-2026-075</td>
                      <td className="p-4 font-bold text-gray-300">1 Kanal Luxury Villa, DHA Phase 5</td>
                      <td className="p-4 font-semibold">PKR 68,000,000</td>
                      <td className="p-4 font-semibold">PKR 1,360,000 (2.0%)</td>
                      <td className="p-4 font-black text-amber-400">PKR 952,000</td>
                      <td className="p-4">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          PENDING_RELEASE
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-secondary/10 transition-colors">
                      <td className="p-4 font-extrabold text-white">DEAL-2026-072</td>
                      <td className="p-4 font-bold text-gray-300">Commercial Office Loft, Clifton Tower</td>
                      <td className="p-4 font-semibold">PKR 35,500,000</td>
                      <td className="p-4 font-semibold">PKR 710,000 (2.0%)</td>
                      <td className="p-4 font-black text-emerald-400">PKR 497,000</td>
                      <td className="p-4">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                          RELEASED
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-secondary/10 transition-colors">
                      <td className="p-4 font-extrabold text-white">DEAL-2026-068</td>
                      <td className="p-4 font-bold text-gray-300">Residential Penthouse, Navy Heights</td>
                      <td className="p-4 font-semibold">PKR 28,000,000</td>
                      <td className="p-4 font-semibold">PKR 560,000 (2.0%)</td>
                      <td className="p-4 font-black text-amber-400">PKR 392,000</td>
                      <td className="p-4">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          PENDING_RELEASE
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Checkout Summary Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-md rounded-2xl overflow-hidden border border-amber-500/40 shadow-2xl glow-amber max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-border bg-amber-950/10">
              <h2 className="text-xl font-bold flex items-center gap-2 text-amber-400">
                <Clock className="w-5 h-5 animate-pulse" />
                Daily Checkout Summary
              </h2>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCheckOut(checkoutSummaryText); }} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-2 tracking-widest leading-relaxed">
                  What did you accomplish today?
                </label>
                <textarea
                  required
                  rows={5}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm resize-none text-white leading-relaxed placeholder-gray-600 bg-secondary/20"
                  placeholder="Provide a summary of your daily achievements, viewer viewings conducted, prepared agreement drafts, etc."
                  value={checkoutSummaryText}
                  onChange={(e) => setCheckoutSummaryText(e.target.value)}
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary transition-colors text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-2 font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all duration-300"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Complete Checkout
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vault Security Warning Modal */}
      {isVaultLockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-lg animate-fade-in">
          <div className="glass w-full max-w-md rounded-3xl overflow-hidden border border-primary/40 shadow-2xl glow-primary">
            <div className="flex flex-col items-center justify-center text-center p-8 space-y-5">
              <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center text-primary shadow-lg shadow-primary/15 animate-bounce">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-white uppercase tracking-wider">RENS Secure Vault Lock</h3>
                <p className="text-xs text-gray-400 leading-relaxed max-w-sm">
                  This transaction represents an audited brokerage payout. Financial adjustments and split releases are strictly locked under enterprise permission clearances.
                </p>
              </div>

              <div className="w-full bg-secondary/30 border border-border p-4.5 rounded-2xl text-left space-y-2 text-xs">
                <p className="text-gray-400 font-bold flex justify-between">
                  Target Broker: <span className="text-white font-black">{fullName}</span>
                </p>
                <p className="text-gray-400 font-bold flex justify-between">
                  Pending Payout Amount: <span className="text-primary font-black">PKR 936,500</span>
                </p>
                <p className="text-gray-400 font-bold flex justify-between">
                  Security Code Required: <span className="text-cyan-400 font-black">RENS-VAULT-ACTIVE</span>
                </p>
              </div>

              <div className="flex gap-3 w-full pt-4 border-t border-border/40">
                <button
                  onClick={() => setIsVaultLockOpen(false)}
                  className="flex-1 py-3 border border-border/60 hover:border-primary/40 text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-white rounded-xl bg-secondary/30 transition-all cursor-pointer"
                >
                  Dismiss Lock
                </button>
                <button
                  onClick={() => {
                    alert("This feature is currently configured in Sandbox Mode. Production clearances require backend Vault Ledger integrations.");
                    setIsVaultLockOpen(false);
                  }}
                  className="flex-1 py-3 bg-primary hover:bg-primary/95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg glow-primary transition-all cursor-pointer"
                >
                  Unlock Portal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Password Reset Modal */}
      {isResetPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-md rounded-2xl overflow-hidden border border-red-500/40 shadow-2xl glow-red max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-border bg-red-950/10">
              <h2 className="text-xl font-bold flex items-center gap-2 text-red-400">
                <Lock className="w-5 h-5 animate-pulse" />
                Reset User Password
              </h2>
              <button onClick={() => { setIsResetPasswordOpen(false); setNewPasswordVal(""); }} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleResetPassword} className="p-6 space-y-4 text-sm">
              <div className="bg-red-500/10 border border-red-500/20 p-3.5 rounded-xl text-[11px] text-red-400 leading-relaxed font-semibold">
                ⚠️ WARNING: You are initiating a password override for <strong className="text-white">{fullName}</strong>. The user will be logged out and must use the new password to log back in.
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-2 tracking-widest leading-relaxed">
                  Enter New Password
                </label>
                <input
                  required
                  type="password"
                  minLength={6}
                  className="w-full glass-input px-3.5 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 bg-secondary/20"
                  placeholder="•••••••• (Min 6 characters)"
                  value={newPasswordVal}
                  onChange={(e) => setNewPasswordVal(e.target.value)}
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => { setIsResetPasswordOpen(false); setNewPasswordVal(""); }}
                  className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary transition-colors text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white flex items-center gap-2 font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/20 transition-all duration-300 cursor-pointer"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
