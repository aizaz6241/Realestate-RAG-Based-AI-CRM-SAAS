"use client";

import React, { useState } from "react";
import { Send, Bot, User, Loader2, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/context/AuthContext";

export default function CompareModelsPage() {
  const { token } = useAuth();
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  
  const [results, setResults] = useState<{
    nemotron: { result: string | null; error: string | null } | null;
    qwen3: { result: string | null; error: string | null } | null;
    llama3: { result: string | null; error: string | null } | null;
  }>({
    nemotron: null,
    qwen3: null,
    llama3: null
  });

  const [currentQuery, setCurrentQuery] = useState("");

  const handleSend = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setHasSearched(true);
    setCurrentQuery(query);
    
    // Reset previous results
    setResults({
      nemotron: null,
      qwen3: null,
      llama3: null
    });

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/ai-new/compare`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      if (data.status === "SUCCESS") {
        setResults(data.results);
      } else {
        alert("Error: " + data.error);
      }
    } catch (error) {
      console.error("Failed to fetch comparison:", error);
      alert("Failed to reach server.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  const ModelColumn = ({ 
    title, 
    modelName, 
    data 
  }: { 
    title: string, 
    modelName: string, 
    data: { result: string | null; error: string | null } | null 
  }) => {
    return (
      <div className="flex flex-col h-full border border-gray-800 rounded-xl bg-[#111111] overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900/50 p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-gray-200">{title}</h3>
          </div>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-md">{modelName}</span>
        </div>

        {/* Chat Area */}
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          {!hasSearched ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              Waiting for query...
            </div>
          ) : (
            <>
              {/* User Message */}
              <div className="flex justify-end">
                <div className="bg-indigo-600/20 text-indigo-200 px-4 py-2 rounded-2xl rounded-tr-sm max-w-[85%] text-sm">
                  {currentQuery}
                </div>
              </div>

              {/* AI Response */}
              <div className="flex justify-start">
                <div className="bg-gray-800/50 text-gray-300 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[95%] text-sm prose prose-invert prose-sm">
                  {isLoading && !data ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating response...
                    </div>
                  ) : data?.error ? (
                    <div className="text-red-400">Error: {data.error}</div>
                  ) : data?.result ? (
                    <ReactMarkdown>{data.result}</ReactMarkdown>
                  ) : (
                    <div className="text-gray-500">No response</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-gray-100">
      {/* Top Header */}
      <div className="h-16 border-b border-gray-800 flex items-center px-6 shrink-0 bg-[#0A0A0A]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h1 className="font-bold text-gray-100">AI Arena</h1>
            <p className="text-xs text-gray-500">Compare Nemotron, Qwen 3, and Llama 3</p>
          </div>
        </div>
      </div>

      {/* Main Content (3 Columns) */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="grid grid-cols-3 gap-4 h-full">
          <ModelColumn 
            title="Nemotron 4 (340B)" 
            modelName="nvidia/nemotron-4-340b" 
            data={results.nemotron} 
          />
          <ModelColumn 
            title="Qwen 3 (80B)" 
            modelName="qwen/qwen3-next-80b" 
            data={results.qwen3} 
          />
          <ModelColumn 
            title="Llama 3.3 (70B)" 
            modelName="meta-llama/llama-3.3-70b" 
            data={results.llama3} 
          />
        </div>
      </div>

      {/* Bottom Input Area */}
      <div className="p-4 border-t border-gray-800 bg-[#0A0A0A] shrink-0">
        <div className="max-w-4xl mx-auto relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a query to send to all 3 models..."
            className="w-full bg-gray-900 border border-gray-700 text-gray-200 rounded-xl pl-4 pr-12 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <div className="text-center mt-2 text-xs text-gray-500">
          Responses are generated simultaneously. This is a temporary testing route.
        </div>
      </div>
    </div>
  );
}
