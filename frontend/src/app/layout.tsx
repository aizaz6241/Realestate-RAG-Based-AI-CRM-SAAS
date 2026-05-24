import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "RENS Ecosystem | Real Estate ERP",
  description: "Premium SaaS Platform for Real Estate Brokerages",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased min-h-screen bg-background text-foreground`}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
