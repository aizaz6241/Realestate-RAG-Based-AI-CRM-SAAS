"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Building2, Lock, Mail, Loader2, ArrowRight } from "lucide-react";
import axios from "axios";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/auth/login`, { email, password });
      const { access_token, user: loggedInUser } = response.data;
      
      login(access_token, loggedInUser);
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err.response?.data?.message || "Invalid credentials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-blue-500/10 blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-md p-6 relative z-10 animate-fade-in opacity-0">
        
        {/* Logo & Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center shadow-xl shadow-primary/20 mb-6">
            <Building2 className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Welcome to <span className="text-gradient">Nexora</span>
          </h1>
          <p className="text-muted-foreground text-sm text-center">
            Sign in to your organization's workspace to manage properties, leads, and operations.
          </p>
        </div>

        {/* Login Form (Glassmorphism) */}
        <div className="glass rounded-2xl p-8 relative">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            <div className="space-y-2 animate-fade-in opacity-0 delay-100">
              <label className="text-sm font-medium text-gray-300 ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@nexora.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-sm placeholder:text-gray-500"
                  required
                />
              </div>
            </div>

            <div className="space-y-2 animate-fade-in opacity-0 delay-200">
              <div className="flex justify-between items-center ml-1">
                <label className="text-sm font-medium text-gray-300">Password</label>
                <a href="#" className="text-xs text-primary hover:text-primary/80 transition-colors">Forgot password?</a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-sm placeholder:text-gray-500"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center animate-fade-in">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 animate-fade-in opacity-0 delay-300 disabled:opacity-70 disabled:cursor-not-allowed group"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Sign In to Workspace
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
            
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-muted-foreground mt-8 animate-fade-in opacity-0 delay-300">
          By signing in, you agree to our Terms of Service and Privacy Policy.
          <br/>© 2026 Nexora Ecosystem.
        </p>
      </div>
    </div>
  );
}
