"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { 
  Phone, 
  PhoneCall, 
  PhoneIncoming, 
  PhoneOutgoing, 
  Calendar, 
  Play, 
  Pause, 
  User, 
  Bot, 
  Sparkles, 
  Clock, 
  ExternalLink, 
  FileText, 
  Volume2, 
  RotateCw, 
  Search, 
  AlertCircle, 
  ThumbsUp, 
  ThumbsDown,
  ChevronRight,
  Database
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface IntegrationLog {
  id: string;
  channel: string;
  direction: string;
  status: string;
  payload: any;
  errorMessage: string | null;
  leadId: string | null;
  createdAt: string;
}

const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function CallLogsPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState<"summary" | "transcript" | "json">("summary");
  
  // Audio state
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchLogs = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/integrations/logs`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch logs: ${res.statusText}`);
      }
      const data = await res.json();
      // Filter logs by channel VOICE
      const voiceLogs = data.filter((log: IntegrationLog) => log.channel === "VOICE");
      setLogs(voiceLogs);
      if (voiceLogs.length > 0 && !selectedLogId) {
        setSelectedLogId(voiceLogs[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while loading logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token]);

  // Handle selected log details
  const selectedLog = logs.find(log => log.id === selectedLogId);

  // Extract call details safely
  const getCallDetails = (log: IntegrationLog | undefined) => {
    if (!log) return null;
    const payload = log.payload || {};
    const message = payload.message || payload;
    const call = message.call || message;
    
    // Fallbacks
    const transcript = call.transcript || "No transcript available for this call.";
    const recordingUrl = call.recordingUrl || "";
    const summary = call.summary || "No AI summary generated.";
    const isQualified = call.analysis?.structuredData?.isQualified ?? true;
    const budget = call.analysis?.structuredData?.budget || null;
    const interestLevel = call.analysis?.structuredData?.interestLevel || "MEDIUM";
    const leadName = call.customer?.name || call.variableValues?.leadName || "Dubai Lead";
    const leadPhone = call.customer?.number || "N/A";
    const durationSeconds = call.duration || null;
    
    return {
      transcript,
      recordingUrl,
      summary,
      isQualified,
      budget,
      interestLevel,
      leadName,
      leadPhone,
      durationSeconds,
      rawCall: call
    };
  };

  const activeCall = getCallDetails(selectedLog);

  useEffect(() => {
    // Reset audio state when call selection changes
    if (audioRef.current) {
      audioRef.current.pause();
      setAudioPlaying(false);
    }
    if (activeCall?.recordingUrl) {
      setAudioUrl(activeCall.recordingUrl);
    } else {
      setAudioUrl(null);
    }
  }, [selectedLogId, activeCall?.recordingUrl]);

  // Audio actions
  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (audioPlaying) {
      audioRef.current.pause();
      setAudioPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => setAudioPlaying(true))
        .catch(err => {
          console.error("Audio playback error:", err);
          alert("Failed to play audio. The recording might still be processing or unavailable.");
        });
    }
  };

  // Parse turn by turn transcript
  const parseTranscript = (rawTranscript: string) => {
    if (!rawTranscript) return [];
    const lines = rawTranscript.split("\n").map(l => l.trim()).filter(Boolean);
    return lines.map((line, idx) => {
      const aiPatterns = [
        /^[\[]?Vapi\s+AI[\]]?:/i, 
        /^[\[]?Agent[\]]?:/i, 
        /^[\[]?Assistant[\]]?:/i, 
        /^[\[]?AI[\]]?:/i, 
        /^[\[]?YOU[\]]?:/i, 
        /^Aisha:/i
      ];
      const customerPatterns = [
        /^[\[]?Lead[\]]?:/i, 
        /^[\[]?Customer[\]]?:/i, 
        /^[\[]?User[\]]?:/i, 
        /^[\[]?Client[\]]?:/i
      ];
      
      let isAi = false;
      let isCustomer = false;
      let cleanText = line;
      
      for (const pat of aiPatterns) {
        if (pat.test(line)) {
          isAi = true;
          cleanText = line.replace(pat, "").trim();
          break;
        }
      }
      
      if (!isAi) {
        for (const pat of customerPatterns) {
          if (pat.test(line)) {
            isCustomer = true;
            cleanText = line.replace(pat, "").trim();
            break;
          }
        }
      }
      
      let speaker = "customer";
      if (isAi) {
        speaker = "ai";
      } else if (isCustomer) {
        speaker = "customer";
      } else {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0 && colonIdx < 15) {
          const name = line.substring(0, colonIdx).toLowerCase();
          if (name.includes("vapi") || name.includes("agent") || name.includes("assistant") || name.includes("ai") || name.includes("aisha")) {
            speaker = "ai";
          } else {
            speaker = "customer";
          }
          cleanText = line.substring(colonIdx + 1).trim();
        } else {
          speaker = "customer";
        }
      }
      
      return { 
        id: idx,
        speaker, 
        text: cleanText 
      };
    });
  };

  const parsedTranscriptTurns = activeCall ? parseTranscript(activeCall.transcript) : [];

  // Filter logs list based on user selections
  const filteredLogs = logs.filter(log => {
    const details = getCallDetails(log);
    if (!details) return false;
    
    // Search filter
    const matchesSearch = 
      details.leadName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      details.leadPhone.includes(searchQuery) ||
      (log.leadId && log.leadId.includes(searchQuery)) ||
      details.summary.toLowerCase().includes(searchQuery.toLowerCase());
      
    // Direction filter
    const matchesDirection = directionFilter === "ALL" || log.direction === directionFilter;
    
    // Status filter
    const matchesStatus = statusFilter === "ALL" || log.status === statusFilter;
    
    return matchesSearch && matchesDirection && matchesStatus;
  });

  return (
    <div className="p-8 animate-fade-in relative z-10 space-y-8 max-w-7xl mx-auto">
      {/* Background Glow Blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">
            Vapi Voice <span className="text-gradient font-black">Call Logs</span> 📞
          </h1>
          <p className="text-muted-foreground mt-1">
            Review detailed AI outbound transcripts, recordings, summaries, and lead qualification structured reports.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-all flex items-center gap-2 cursor-pointer hover:scale-[1.02]"
        >
          <RotateCw className={`w-4 h-4 ${loading ? "animate-spin text-primary" : ""}`} />
          Sync Logs
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-black tracking-widest text-primary/70 uppercase">Syncing Call Logs Registry...</p>
        </div>
      ) : error && logs.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 border border-red-500/20 bg-red-500/5 rounded-2xl">
          <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">Failed to Load Logs</h3>
          <p className="text-sm text-red-300 max-w-md text-center">{error}</p>
          <button
            onClick={fetchLogs}
            className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/35 rounded-xl text-xs font-bold text-red-200 transition-all"
          >
            Retry Connection
          </button>
        </div>
      ) : logs.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center p-8 glass rounded-2xl text-center">
          <PhoneCall className="w-14 h-14 text-muted-foreground/45 mb-4" />
          <h3 className="text-xl font-bold text-white">No Call Logs Registered</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
            Ensure Vapi Voice outbound calls are being triggered from the leads panel or portal simulations.
          </p>
          <Link
            href="/integrations"
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-95 text-white font-semibold text-sm transition-all duration-300 hover:scale-[1.02]"
          >
            Go to Integrations Playground
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT LIST PANEL: 5 cols */}
          <div className="lg:col-span-5 space-y-4">
            {/* Filters Box */}
            <div className="glass p-4 rounded-2xl border border-white/5 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by customer, phone, lead ID..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground block mb-1">Direction</label>
                  <select
                    value={directionFilter}
                    onChange={e => setDirectionFilter(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-primary/50"
                  >
                    <option value="ALL">All Types</option>
                    <option value="INBOUND">Inbound Hook</option>
                    <option value="OUTBOUND">Outbound Dial</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground block mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-primary/50"
                  >
                    <option value="ALL">All Status</option>
                    <option value="SUCCESS">Success Only</option>
                    <option value="FAILED">Failed Runs</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Logs List scrollable */}
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="text-[10px] uppercase font-black tracking-widest text-muted-foreground px-1">
                Voice logs found: {filteredLogs.length}
              </div>
              {filteredLogs.map(log => {
                const details = getCallDetails(log);
                const isSelected = log.id === selectedLogId;
                if (!details) return null;

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer text-left relative overflow-hidden group ${
                      isSelected
                        ? "bg-gradient-to-br from-primary/10 to-accent/5 border-primary/45 shadow-lg shadow-primary/5"
                        : "glass hover:bg-white/10 border-white/5 hover:border-white/15"
                    }`}
                  >
                    {/* Glowing active bar */}
                    {isSelected && (
                      <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-primary to-accent"></div>
                    )}

                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${
                          log.direction === "OUTBOUND" ? "bg-cyan-500/10 text-cyan-400" : "bg-purple-500/10 text-purple-400"
                        }`}>
                          {log.direction === "OUTBOUND" ? <PhoneOutgoing className="w-3.5 h-3.5" /> : <PhoneIncoming className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          {log.direction}
                        </span>
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                        log.status === "SUCCESS"
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                          : "bg-red-500/10 border-red-500/25 text-red-400"
                      }`}>
                        {log.status}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-white group-hover:text-primary transition-colors">
                      {details.leadName}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{details.leadPhone}</p>

                    <p className="text-xs text-muted-foreground/75 mt-2 line-clamp-2 italic">
                      "{details.summary}"
                    </p>

                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(log.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                      {details.durationSeconds && (
                        <span className="flex items-center gap-1 font-bold text-white">
                          <Clock className="w-3 h-3" />
                          {Math.floor(details.durationSeconds)}s
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT DETAILED PANEL: 7 cols */}
          <div className="lg:col-span-7">
            {selectedLog && activeCall ? (
              <div className="glass rounded-2xl border border-white/10 p-6 space-y-6 text-left relative overflow-hidden">
                {/* Visual Glow Indicator */}
                <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] pointer-events-none -z-10 ${
                  activeCall.isQualified ? "bg-emerald-500/5" : "bg-red-500/5"
                }`}></div>

                {/* Card Top Title Banner */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-white/5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-2xl font-extrabold text-white">{activeCall.leadName}</h2>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                        activeCall.isQualified 
                          ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400" 
                          : "bg-red-500/15 border-red-500/35 text-red-400"
                      }`}>
                        {activeCall.isQualified ? "Qualified Lead" : "Disqualified"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{activeCall.leadPhone}</span>
                      <span>•</span>
                      <span>Call ID: {selectedLog.id.substring(0, 8).toUpperCase()}...</span>
                    </p>
                  </div>
                  
                  {selectedLog.leadId && (
                    <Link
                      href={`/leads/${selectedLog.leadId}`}
                      className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.03]"
                    >
                      View CRM Profile
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>

                {/* AUDIO CONTROLLER DRAWER */}
                {audioUrl ? (
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary glow-primary">
                        <Volume2 className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h4 className="text-sm font-bold text-white">Call Voice Recording</h4>
                        <p className="text-[10px] text-muted-foreground">Recorded call audio stored in cloud bucket</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={togglePlayAudio}
                      className="px-4 py-2 bg-gradient-to-r from-primary to-accent text-white font-semibold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-primary/10 transition-transform active:scale-95"
                    >
                      {audioPlaying ? (
                        <>
                          <Pause className="w-4 h-4" /> Pause Playback
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-white" /> Play Audio Recording
                        </>
                      )}
                    </button>
                    <audio
                      ref={audioRef}
                      src={audioUrl}
                      onEnded={() => setAudioPlaying(false)}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3 text-muted-foreground text-xs">
                    <AlertCircle className="w-4 h-4" />
                    Audio recording is not available or currently encoding for this call.
                  </div>
                )}

                {/* TABS SELECTOR */}
                <div className="flex border-b border-white/5 pb-0.5">
                  {(["summary", "transcript", "json"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 border-b-2 text-xs font-bold transition-all uppercase tracking-widest ${
                        activeTab === tab
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-white"
                      }`}
                    >
                      {tab === "summary" ? "Summary & Details" : tab === "transcript" ? "Transcript dialogue" : "Raw JSON payload"}
                    </button>
                  ))}
                </div>

                {/* TAB CONTENT: Summary & details */}
                {activeTab === "summary" && (
                  <div className="space-y-6">
                    {/* Summary card */}
                    <div className="space-y-2">
                      <h4 className="text-xs uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        AI Summary
                      </h4>
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-sm leading-relaxed text-white italic">
                        "{activeCall.summary}"
                      </div>
                    </div>

                    {/* Metrics/Params Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Budget */}
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-1">
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground block">
                          Extracted Budget
                        </span>
                        <div className="font-extrabold text-lg text-white">
                          {activeCall.budget 
                            ? `AED ${activeCall.budget.toLocaleString()}` 
                            : "Not specified on call"}
                        </div>
                      </div>

                      {/* Interest level */}
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-1">
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground block">
                          Interest / Engagement Level
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            activeCall.interestLevel === "HIGH" 
                              ? "bg-emerald-400" 
                              : activeCall.interestLevel === "MEDIUM" 
                              ? "bg-amber-400" 
                              : "bg-red-400"
                          }`}></span>
                          <span className="font-extrabold text-sm text-white uppercase">{activeCall.interestLevel}</span>
                        </div>
                      </div>

                      {/* AI Quality Qualification */}
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-1">
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground block">
                          CRM Assessment
                        </span>
                        <div className="flex items-center gap-2">
                          {activeCall.isQualified ? (
                            <>
                              <ThumbsUp className="w-4 h-4 text-emerald-400" />
                              <span className="font-bold text-sm text-emerald-400">Passed Qualification</span>
                            </>
                          ) : (
                            <>
                              <ThumbsDown className="w-4 h-4 text-red-400" />
                              <span className="font-bold text-sm text-red-400">Flagged / Not qualified</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Integration Type */}
                      <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-1">
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground block">
                          Technical Channel
                        </span>
                        <div className="flex items-center gap-2 text-white font-bold text-sm">
                          <Database className="w-4 h-4 text-primary" />
                          <span>Vapi API Outbound Webhook</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT: Transcript */}
                {activeTab === "transcript" && (
                  <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1 custom-scrollbar">
                    {parsedTranscriptTurns.length === 0 ? (
                      <div className="py-12 text-center text-muted-foreground text-xs">
                        No dialogue lines parsed from transcript.
                      </div>
                    ) : (
                      parsedTranscriptTurns.map(turn => {
                        const isAi = turn.speaker === "ai";
                        return (
                          <div
                            key={turn.id}
                            className={`flex gap-3 items-start max-w-[85%] ${
                              isAi ? "mr-auto text-left" : "ml-auto flex-row-reverse text-right"
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${
                              isAi
                                ? "bg-primary/10 border-primary/25 text-primary"
                                : "bg-white/5 border-white/10 text-white"
                            }`}>
                              {isAi ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                            </div>
                            <div className="space-y-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                                {isAi ? "Aisha (AI)" : "Customer / Lead"}
                              </span>
                              <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
                                isAi
                                  ? "bg-white/5 border border-white/5 text-white rounded-tl-none"
                                  : "bg-primary/20 border border-primary/20 text-white rounded-tr-none"
                              }`}>
                                {turn.text}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* TAB CONTENT: JSON raw inspection */}
                {activeTab === "json" && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                      Raw Webhook Payload JSON (IntegrationsLog payload details)
                    </p>
                    <pre className="p-4 rounded-xl bg-black/40 border border-white/5 text-xs text-emerald-400 font-mono overflow-auto max-h-[45vh] custom-scrollbar text-left">
                      {JSON.stringify(selectedLog.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="glass rounded-2xl border border-white/10 p-12 text-center min-h-[40vh] flex flex-col justify-center items-center">
                <Phone className="w-12 h-12 text-muted-foreground/35 mb-3" />
                <h4 className="text-base font-bold text-white">No Call Selected</h4>
                <p className="text-xs text-muted-foreground max-w-xs mt-0.5">
                  Select a call log from the left side panel to audit transcripts, structured parameters, and audio playbacks.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
