"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import Cookies from "js-cookie";
import axios from "axios";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  firstName?: string;
  lastName?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const verifyToken = async () => {
      const storedToken = Cookies.get("access_token");
      const storedUser = Cookies.get("user");

      if (storedToken && storedUser) {
        try {
          axios.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
          // Verify with NestJS backend
          const response = await axios.get("http://localhost:3001/auth/profile");
          
          setToken(storedToken);
          setUser(response.data);
          Cookies.set("user", JSON.stringify(response.data), { expires: 1 });
        } catch (error: any) {
          console.warn("Token verification failed:", error);
          if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Explicit auth failure - clear bad/expired cookie and state
            setToken(null);
            setUser(null);
            Cookies.remove("access_token");
            Cookies.remove("user");
            delete axios.defaults.headers.common["Authorization"];
          } else {
            // Network error or backend offline - keep local session as fallback
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
          }
        }
      }
      setIsLoading(false);
    };

    verifyToken();
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    Cookies.set("access_token", newToken, { expires: 1 });
    Cookies.set("user", JSON.stringify(newUser), { expires: 1 });
    axios.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
    router.push("/dashboard"); // Redirect to dashboard
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    Cookies.remove("access_token");
    Cookies.remove("user");
    delete axios.defaults.headers.common["Authorization"];
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
