"use client";

import React, { useState, useEffect } from "react";
import { Plus, Briefcase, Mail, Loader2, X, ShieldAlert, Award, User, CircleDollarSign, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function EmployeesPage() {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "AGENT",
    department: "",
    designation: "",
    salary: "",
  });

  const fetchEmployees = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (error) {
      console.error("Error fetching employees:", error);
      // Premium vibrant fallback data
      setEmployees([
        {
          id: "mock1",
          firstName: "Ahmed",
          lastName: "Raza",
          email: "ahmed.raza@nexora.com",
          role: "AGENT",
          employeeProfile: {
            department: "Residential Sales",
            designation: "Senior Realtor",
            salary: 150000,
            status: "ACTIVE",
          },
        },
        {
          id: "mock2",
          firstName: "Ayesha",
          lastName: "Khan",
          email: "ayesha.k@nexora.com",
          role: "HR",
          employeeProfile: {
            department: "Human Resources",
            designation: "HR Manager",
            salary: 180000,
            status: "ACTIVE",
          },
        },
        {
          id: "mock3",
          firstName: "Hamza",
          lastName: "Ali",
          email: "hamza.ali@nexora.com",
          role: "ADMIN",
          employeeProfile: {
            department: "Operations",
            designation: "Operations Lead",
            salary: 220000,
            status: "ACTIVE",
          },
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees`, {
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
          firstName: "",
          lastName: "",
          email: "",
          password: "",
          role: "AGENT",
          department: "",
          designation: "",
          salary: "",
        });
        fetchEmployees();
      } else {
        const errText = await res.text();
        console.error("Server error when saving employee:", res.status, errText);
        alert(`Error: Server returned status ${res.status} - ${errText}`);
      }
    } catch (error) {
      console.error("Error creating employee:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-8 relative z-10">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Employee Directory</h1>
          <p className="text-muted-foreground mt-1">Manage team members, roles, and designations.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary transition-all duration-300 hover:scale-[1.03]"
        >
          <Plus className="w-5 h-5" />
          Add Employee
        </button>
      </div>

      {/* Directory Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
          {employees.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted-foreground glass rounded-2xl">
              No employees found.
            </div>
          ) : (
            employees.map((emp) => {
              const profile = emp.employeeProfile || {};
              const fullName = `${emp.firstName} ${emp.lastName || ""}`;
              return (
                <Link
                  href={`/employees/${emp.id}`}
                  key={emp.id}
                  className="glass rounded-2xl p-6 hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 group relative flex flex-col justify-between cursor-pointer text-left block"
                >
                  <div>
                    {/* User Info Header */}
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-xl font-bold text-white glow-primary">
                        {emp.firstName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-white group-hover:text-primary transition-colors">
                          {fullName}
                        </h3>
                        <span className="text-[10px] uppercase font-extrabold px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 tracking-wider">
                          {emp.role}
                        </span>
                      </div>
                    </div>

                    {/* Meta details */}
                    <div className="space-y-3 pt-4 border-t border-border/60">
                      <div className="flex items-center gap-3 text-sm text-gray-300">
                        <Briefcase className="w-4.5 h-4.5 text-primary" />
                        <span>
                          {profile.designation || "No Designation"} •{" "}
                          <span className="text-gray-400">
                            {profile.department || "No Department"}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-300">
                        <Mail className="w-4.5 h-4.5 text-primary" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                      {profile.salary && (
                        <div className="flex items-center gap-3 text-sm text-gray-300">
                          <CircleDollarSign className="w-4.5 h-4.5 text-primary" />
                          <span>Rs {profile.salary.toLocaleString()} / month</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-border/40 flex justify-between items-center">
                    <span className="text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                      {profile.status || "ACTIVE"}
                    </span>
                    <span className="text-xs font-bold text-primary group-hover:underline flex items-center gap-1">
                      Manage Command Center &rarr;
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {/* Add Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-2xl rounded-2xl overflow-hidden border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Add Employee
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
                  <label className="block text-sm mb-1 text-gray-300">First Name</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl"
                    placeholder="Ahmed"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Last Name</label>
                  <input
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl"
                    placeholder="Raza"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Email Address</label>
                  <input
                    required
                    type="email"
                    className="w-full glass-input px-4 py-2.5 rounded-xl"
                    placeholder="ahmed.raza@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Password</label>
                  <input
                    required
                    type="password"
                    className="w-full glass-input px-4 py-2.5 rounded-xl"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Role</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl bg-secondary"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="AGENT">Agent / Realtor</option>
                    <option value="ADMIN">Administrator</option>
                    <option value="SUPER_ADMIN">Super Administrator</option>
                    <option value="SALES_MANAGER">Sales Manager</option>
                    <option value="HR">Human Resources Manager</option>
                    <option value="FINANCE">Finance Controller</option>
                    <option value="LOGISTICS">Logistics Manager</option>
                    <option value="RECEPTIONIST">Receptionist / Front Desk</option>
                    <option value="VIEWER">General Viewer (Read-Only)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Department</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl"
                    placeholder="Residential Sales"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Designation</label>
                  <input
                    required
                    type="text"
                    className="w-full glass-input px-4 py-2.5 rounded-xl"
                    placeholder="Senior Advisor"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-300">Salary (Monthly)</label>
                  <input
                    type="number"
                    className="w-full glass-input px-4 py-2.5 rounded-xl"
                    placeholder="150000"
                    value={formData.salary}
                    onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  />
                </div>
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
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
