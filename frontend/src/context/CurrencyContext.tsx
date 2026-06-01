"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Currency = "AED" | "USD" | "PKR";

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatAmount: (amount: number | string) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

// Conversion rates relative to base database currency (PKR)
const CONVERSION_RATES = {
  PKR: 1,
  AED: 1 / 76.0,  // 1 AED = 76 PKR
  USD: 1 / 280.0, // 1 USD = 280 PKR
};

export const CurrencyProvider = ({ children }: { children: React.ReactNode }) => {
  // Default to Dubai Real Estate currency (AED)
  const [currency, setCurrencyState] = useState<Currency>("AED");

  useEffect(() => {
    const savedCurrency = localStorage.getItem("currency") as Currency | null;
    if (savedCurrency) {
      setCurrencyState(savedCurrency);
    }
  }, []);

  const setCurrency = (newCurrency: Currency) => {
    setCurrencyState(newCurrency);
    localStorage.setItem("currency", newCurrency);
  };

  const formatAmount = (amount: number | string) => {
    const num = typeof amount === "number" ? amount : parseFloat(amount) || 0;
    
    if (currency === "AED") {
      const converted = num * CONVERSION_RATES.AED;
      return `${converted.toLocaleString([], { maximumFractionDigits: 0 })} AED`;
    } else if (currency === "USD") {
      const converted = num * CONVERSION_RATES.USD;
      return `$${converted.toLocaleString([], { maximumFractionDigits: 0 })}`;
    } else {
      return `${num.toLocaleString([], { maximumFractionDigits: 0 })} PKR`;
    }
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatAmount }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
};
