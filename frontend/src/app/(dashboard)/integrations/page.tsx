"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Cable, 
  Mail, 
  MessageSquare, 
  Smartphone, 
  PhoneCall, 
  Globe, 
  HardDrive, 
  MapPin, 
  Settings, 
  Play, 
  Pause, 
  CheckCircle, 
  XCircle, 
  FileText, 
  Copy, 
  Check, 
  Send, 
  Plus,
  Loader2,
  ExternalLink,
  ChevronRight,
  Database,
  User,
  Activity,
  ArrowRightLeft,
  Bot
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function IntegrationsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("voice"); // voice, email, whatsapp, portals, google
  const [configs, setConfigs] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active settings configuration modal states
  const [editingConfig, setEditingConfig] = useState<any | null>(null);
  const [configCredentials, setConfigCredentials] = useState<any>({});
  const [configEnabled, setConfigEnabled] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // New Template form states
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", subject: "", content: "", channel: "EMAIL" });
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Copy success indicator states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Email Sandbox States
  const [emailLeadId, setEmailLeadId] = useState("");
  const [emailTemplateId, setEmailTemplateId] = useState("");
  const [emailCustomSubject, setEmailCustomSubject] = useState("");
  const [emailCustomBody, setEmailCustomBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<any | null>(null);

  // WhatsApp Sandbox States
  const [waLeadId, setWaLeadId] = useState("");
  const [waText, setWaText] = useState("Salam {{leadName}}! Main Zorvex properties se baat kar raha hoon. Palm Jumeirah property details download karne ke liye is link pe click karein.");
  const [waMediaUrl, setWaMediaUrl] = useState("https://zorvex.com/brochures/palm_jumeirah_villa.pdf");
  const [waSending, setWaSending] = useState(false);
  const [waChatMessages, setWaChatMessages] = useState<any[]>([
    { role: "agent", text: "Salam! How can we help you today?", time: "10:30 AM" }
  ]);

  // SMS Sandbox States
  const [smsLeadId, setSmsLeadId] = useState("");
  const [smsText, setSmsText] = useState("Zorvex Alert: Dear {{leadName}}, a meeting has been scheduled with your Agent. Please verify your OTP code: 8291.");
  const [smsSending, setSmsSending] = useState(false);
  const [smsSentLogs, setSmsSentLogs] = useState<any[]>([]);

  // Vapi.ai Voice Sandbox States
  const [vapiLeadId, setVapiLeadId] = useState("");
  const [vapiCalling, setVapiCalling] = useState(false);
  const [vapiTranscript, setVapiTranscript] = useState<string[]>([]);
  const [vapiAudioPlaying, setVapiAudioPlaying] = useState(false);
  const [vapiCallEndedInfo, setVapiCallEndedInfo] = useState<any | null>(null);
  const [vapiSimulatedPayload, setVapiSimulatedPayload] = useState<any | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Property Portals Sandbox States
  const [xmlFeedText, setXmlFeedText] = useState("");
  const [loadingXml, setLoadingXml] = useState(false);
  const [portalSelect, setPortalSelect] = useState("BAYUT");
  const [portalLeadData, setPortalLeadData] = useState({
    name: "Aizaz Ahmed",
    email: "aizaz@zorvex.com",
    phone: "+971501234567",
    propertyRef: "Zorvex-PROP-101",
    message: "Hi, I am interested in this beautiful 3-bedroom Palm Jumeirah listing. Please call me back."
  });
  const [portalSyncing, setPortalSyncing] = useState(false);
  const [portalResult, setPortalResult] = useState<any | null>(null);

  // Google Maps / Drive Sandbox States
  const [selectedPropId, setSelectedPropId] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResult, setGeocodeResult] = useState<any | null>(null);

  const [selectedDocId, setSelectedDocId] = useState("");
  const [syncingDoc, setSyncingDoc] = useState(false);
  const [docSyncResult, setDocSyncResult] = useState<any | null>(null);

  // Inspector payload modal
  const [inspectedPayload, setInspectedPayload] = useState<any | null>(null);

  const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // -----------------------------------------------------------------------------
  // Data Loaders
  // -----------------------------------------------------------------------------

  const loadData = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      // 1. Load Configurations
      const configRes = await fetch(`${getApiUrl()}/integrations/configs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (configRes.ok) setConfigs(await configRes.json());

      // 2. Load Templates
      const templateRes = await fetch(`${getApiUrl()}/integrations/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (templateRes.ok) setTemplates(await templateRes.json());

      // 3. Load Logs
      const logsRes = await fetch(`${getApiUrl()}/integrations/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (logsRes.ok) setLogs(await logsRes.json());

      // 4. Load Leads for Sandboxes
      const leadsRes = await fetch(`${getApiUrl()}/leads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setLeads(leadsData);
        if (leadsData.length > 0) {
          setEmailLeadId(leadsData[0].id);
          setWaLeadId(leadsData[0].id);
          setSmsLeadId(leadsData[0].id);
          setVapiLeadId(leadsData[0].id);
        }
      }

      // 5. Load Properties for Maps Sandbox
      const propRes = await fetch(`${getApiUrl()}/properties`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (propRes.ok) {
        const propData = await propRes.json();
        setProperties(propData);
        if (propData.length > 0) setSelectedPropId(propData[0].id);
      }

      // 6. Load Documents for Drive Sandbox
      const docRes = await fetch(`${getApiUrl()}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (docRes.ok) {
        const docData = await docRes.json();
        setDocuments(docData);
        if (docData.length > 0) setSelectedDocId(docData[0].id);
      }

    } catch (err) {
      console.error("Failed to load integrations page data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  // Load XML feed dynamically when Portals tab is opened
  const loadXmlFeed = async () => {
    if (!token) return;
    setLoadingXml(true);
    try {
      // Find logged in user's org id by checking leads / properties
      let orgId = leads[0]?.organizationId || "dabe2766-b29e-4dcb-9923-22f83d8a6138";
      const res = await fetch(`${getApiUrl()}/integrations/portals/${orgId}/xml-feed`);
      if (res.ok) {
        setXmlFeedText(await res.text());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingXml(false);
    }
  };

  useEffect(() => {
    if (activeTab === "portals") {
      loadXmlFeed();
    }
  }, [activeTab]);

  // -----------------------------------------------------------------------------
  // Configuration Handlers
  // -----------------------------------------------------------------------------

  const handleOpenConfig = (config: any) => {
    setEditingConfig(config);
    setConfigEnabled(config.isEnabled);
    setConfigCredentials(config.credentials || {});
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingConfig) return;
    setIsSavingConfig(true);
    try {
      const res = await fetch(`${getApiUrl()}/integrations/configs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type: editingConfig.type,
          isEnabled: configEnabled,
          credentials: configCredentials
        })
      });

      if (res.ok) {
        setEditingConfig(null);
        loadData();
        alert(`🎉 ${editingConfig.type} Integration settings saved successfully!`);
      }
    } catch (err) {
      console.error("Failed to save integration config:", err);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSavingTemplate(true);
    try {
      const res = await fetch(`${getApiUrl()}/integrations/templates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newTemplate)
      });
      if (res.ok) {
        setShowTemplateModal(false);
        setNewTemplate({ name: "", subject: "", content: "", channel: "EMAIL" });
        loadData();
        alert("🎉 Custom template created successfully!");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingTemplateTemplate(false);
    }
  };

  const setIsSavingTemplateTemplate = (val: boolean) => {
    setIsSavingTemplate(val);
  };

  // Helper copy webhook and feed URLs
  const triggerCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // -----------------------------------------------------------------------------
  // Sandbox Dispatchers
  // -----------------------------------------------------------------------------

  const handleSendEmail = async () => {
    if (!token || !emailLeadId) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      const res = await fetch(`${getApiUrl()}/integrations/simulate/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          leadId: emailLeadId,
          templateId: emailTemplateId || undefined,
          customSubject: emailCustomSubject || undefined,
          customBody: emailCustomBody || undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        setEmailResult(data.payload);
        loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEmailSending(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!token || !waLeadId) return;
    setWaSending(true);
    try {
      const res = await fetch(`${getApiUrl()}/integrations/simulate/whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          leadId: waLeadId,
          text: waText,
          mediaUrl: waMediaUrl || undefined
        })
      });

      if (res.ok) {
        const data = await res.json();
        setWaChatMessages(prev => [
          ...prev, 
          { role: "agent", text: data.payload.message, time: "Just Now", media: data.payload.mediaUrl }
        ]);
        loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWaSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!token || !smsLeadId) return;
    setSmsSending(true);
    try {
      const res = await fetch(`${getApiUrl()}/integrations/simulate/sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          leadId: smsLeadId,
          text: smsText
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSmsSentLogs(prev => [data.payload, ...prev]);
        loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSmsSending(false);
    }
  };

  // Vapi.ai Trigger & Simulating Outbound Voice Call
  const handleVapiCallTrigger = async () => {
    if (!token || !vapiLeadId) return;
    setVapiCalling(true);
    setVapiTranscript([]);
    setVapiCallEndedInfo(null);
    setVapiSimulatedPayload(null);
    if (audioRef.current) {
      audioRef.current.pause();
      setVapiAudioPlaying(false);
    }

    try {
      const res = await fetch(`${getApiUrl()}/integrations/simulate/vapi-call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ leadId: vapiLeadId })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.live) {
          alert("📞 Outbound Vapi.ai call triggered live! Monitor calls on Vapi dashboard.");
          setVapiCalling(false);
          loadData();
        } else {
          // Simulation flow: stream transcript turns one by one
          const payload = data.simulatedWebhookPayload;
          setVapiSimulatedPayload(payload);
          const turns = payload.message.call.transcript.split("\n");
          
          let i = 0;
          const streamInterval = setInterval(() => {
            if (i < turns.length) {
              setVapiTranscript(prev => [...prev, turns[i]]);
              i++;
            } else {
              clearInterval(streamInterval);
              setVapiCalling(false);
              setVapiCallEndedInfo(payload.message.call);
              // Trigger local webhook simulation to execute lead scoring/status updates
              triggerSimulatedVapiWebhook(payload);
            }
          }, 1800); // Realistic conversational delay
        }
      }
    } catch (err) {
      console.error(err);
      setVapiCalling(false);
    }
  };

  const triggerSimulatedVapiWebhook = async (payload: any) => {
    try {
      const res = await fetch(`${getApiUrl()}/integrations/vapi/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleVapiAudio = () => {
    if (!vapiCallEndedInfo?.recordingUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(vapiCallEndedInfo.recordingUrl);
      audioRef.current.onended = () => setVapiAudioPlaying(false);
    }

    if (vapiAudioPlaying) {
      audioRef.current.pause();
      setVapiAudioPlaying(false);
    } else {
      audioRef.current.play();
      setVapiAudioPlaying(true);
    }
  };

  // Property Portal Inbound lead simulator
  const handlePortalLeadSimulate = async () => {
    if (!token) return;
    setPortalSyncing(true);
    setPortalResult(null);
    try {
      const res = await fetch(`${getApiUrl()}/integrations/portals/simulate-lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          portal: portalSelect,
          leadData: portalLeadData
        })
      });

      if (res.ok) {
        const data = await res.json();
        setPortalResult(data);
        loadData();
        alert(`🔔 Inbound lead successfully created from ${portalSelect}! Synced to CRM Dashboard.`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPortalSyncing(false);
    }
  };

  // Google Maps Geocoding sync
  const handleMapsGeocodeTrigger = async () => {
    if (!token || !selectedPropId) return;
    setGeocoding(true);
    setGeocodeResult(null);
    try {
      const res = await fetch(`${getApiUrl()}/integrations/simulate/maps-geocoding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ propertyId: selectedPropId })
      });
      if (res.ok) {
        setGeocodeResult(await res.json());
        loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGeocoding(false);
    }
  };

  // Google Drive cloud vault sync
  const handleDriveSyncTrigger = async () => {
    if (!token || !selectedDocId) return;
    setSyncingDoc(true);
    setDocSyncResult(null);
    try {
      const res = await fetch(`${getApiUrl()}/integrations/simulate/drive-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ documentId: selectedDocId })
      });
      if (res.ok) {
        setDocSyncResult(await res.json());
        loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSyncingDoc(false);
    }
  };

  // Config mapping titles and descriptions
  const getCatalogMeta = (type: string) => {
    switch (type) {
      case "EMAIL":
        return {
          title: "SMTP / Email Integration",
          description: "Sync corporate SMTP servers to dispatch automatic notifications, lead updates, and custom template drip campaigns.",
          icon: Mail,
          color: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5 glow-primary",
        };
      case "WHATSAPP":
        return {
          title: "Meta WhatsApp Cloud API",
          description: "Automate two-way messages, PDF property brochure dispatches, media, and customer support channels.",
          icon: MessageSquare,
          color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5 shadow-emerald-500/5",
        };
      case "SMS":
        return {
          title: "Twilio SMS & Alerts",
          description: "Configure SMS triggers for lead reminders, active agent assignment notifications, and customer OTP codes.",
          icon: Smartphone,
          color: "text-purple-400 border-purple-500/20 bg-purple-500/5 shadow-purple-500/5",
        };
      case "VOICE":
        return {
          title: "Vapi.ai Voice Automation",
          description: "Connect Vapi voice agents. Triggers outbound calls to CRM leads and processes webhook transcripts for auto-qualification.",
          icon: PhoneCall,
          color: "text-amber-400 border-amber-500/20 bg-amber-500/5 glow-accent",
        };
      case "PORTAL_FEED":
        return {
          title: "UAE Portals (Bayut & Dubizzle)",
          description: "Generates live, UAE compliant XML listing feeds and enables inbound webhook leads synchronization.",
          icon: Globe,
          color: "text-rose-400 border-rose-500/20 bg-rose-500/5 shadow-rose-500/5",
        };
      case "GOOGLE_DRIVE":
        return {
          title: "Google Drive Cloud Vault",
          description: "Automatically back up client Emirates IDs, lease contracts, and POA documents to organization Drive archives.",
          icon: HardDrive,
          color: "text-blue-400 border-blue-500/20 bg-blue-500/5 shadow-blue-500/5",
        };
      case "GOOGLE_MAPS":
        return {
          title: "Google Maps Geocoding",
          description: "Geolocate palm/marina properties automatically, rendering dynamic maps within agent CRM sheets.",
          icon: MapPin,
          color: "text-teal-400 border-teal-500/20 bg-teal-500/5 shadow-teal-500/5",
        };
      default:
        return {
          title: type,
          description: "External system connector.",
          icon: Cable,
          color: "text-gray-400 border-gray-500/20 bg-gray-500/5",
        };
    }
  };

  return (
    <div className="p-8 animate-fade-in relative z-10 space-y-8 max-w-7xl mx-auto">
      {/* Background Glow Blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header Area */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">
            Integrations <span className="text-gradient font-black">Control Hub</span> 🔌
          </h1>
          <p className="text-muted-foreground mt-1">Connect your CRM to leading providers, generate UAE XML feeds, and execute AI calling with Vapi.ai.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowTemplateModal(true)}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-95 text-white font-semibold flex items-center gap-2 glow-primary transition-all duration-300 hover:scale-[1.03]"
          >
            <Plus className="w-4 h-4" />
            Create Custom Template
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
          <p className="text-xs font-black tracking-widest text-primary/70 uppercase">Loading Integrations Registry...</p>
        </div>
      ) : (
        <>
          {/* CATALOG SECTION */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {configs.map((config) => {
              const meta = getCatalogMeta(config.type);
              const Icon = meta.icon;
              
              return (
                <div 
                  key={config.type}
                  className={`glass p-6 rounded-2xl border ${meta.color} flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:border-white/25 group relative`}
                >
                  <div className="space-y-4">
                    {/* Icon and status flag */}
                    <div className="flex justify-between items-center">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 group-hover:scale-110 transition-transform`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                        config.isEnabled 
                          ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400" 
                          : "bg-muted border-white/10 text-muted-foreground"
                      }`}>
                        {config.isEnabled ? "Connected" : "Disconnected"}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="text-left space-y-1">
                      <h3 className="font-bold text-lg text-white group-hover:text-primary transition-colors">{meta.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2.5 mt-6 border-t border-white/5 pt-4">
                    <button 
                      onClick={() => handleOpenConfig(config)}
                      className="flex-1 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Configure
                    </button>
                    <button 
                      onClick={() => {
                        const tabMapping: Record<string, string> = {
                          "VOICE": "voice",
                          "EMAIL": "email",
                          "WHATSAPP": "whatsapp",
                          "SMS": "whatsapp",
                          "PORTAL_FEED": "portals",
                          "GOOGLE_DRIVE": "google",
                          "GOOGLE_MAPS": "google"
                        };
                        setActiveTab(tabMapping[config.type] || "voice");
                        const sandboxEl = document.getElementById("sandbox-workspace");
                        if (sandboxEl) sandboxEl.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="px-3.5 py-2.5 rounded-lg bg-primary/20 hover:bg-primary border border-primary/30 text-xs font-bold text-white transition-all flex items-center justify-center cursor-pointer"
                      title="Open Sandbox Testing"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* SANDBOX SECTION */}
          <div id="sandbox-workspace" className="glass rounded-3xl border border-white/10 overflow-hidden text-left shadow-2xl">
            {/* Sandbox Tabs Header */}
            <div className="bg-secondary/40 border-b border-white/10 px-6 py-4 flex flex-wrap gap-2 justify-between items-center">
              <div className="flex gap-1">
                {[
                  { id: "voice", name: "Vapi.ai Voice", icon: PhoneCall },
                  { id: "email", name: "SMTP Email", icon: Mail },
                  { id: "whatsapp", name: "WhatsApp & SMS", icon: MessageSquare },
                  { id: "portals", name: "UAE Portals", icon: Globe },
                  { id: "google", name: "Google API Sync", icon: HardDrive },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      activeTab === tab.id 
                        ? "bg-primary/20 text-primary border border-primary/30" 
                        : "text-muted-foreground hover:text-white hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.name}
                  </button>
                ))}
              </div>
              <div className="text-[10px] uppercase font-black tracking-widest text-muted-foreground flex items-center gap-1.5 bg-white/5 border border-white/5 px-3 py-1.5 rounded-xl">
                <Activity className="w-3.5 h-3.5 text-accent animate-pulse" />
                Integration Testing Sandbox
              </div>
            </div>

            {/* Sandbox Tab Workspace Content */}
            <div className="p-8">
              
              {/* 1. VAPI.AI VOICE SANDBOX */}
              {activeTab === "voice" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                  
                  {/* Left Column: Outbound Voice trigger form */}
                  <div className="space-y-6">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded">Vapi AI Platform</span>
                      <h2 className="text-xl font-bold text-white">Outbound AI Lead Qualifier</h2>
                      <p className="text-xs text-muted-foreground leading-relaxed">Select any active CRM lead and trigger an autonomous AI-calling sequence. If Vapi keys are saved, this calls the customer; otherwise, it runs our high-fidelity dialog simulator.</p>
                    </div>

                    <div className="space-y-4">
                      {/* Lead Selector */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-300">Select CRM Target Lead</label>
                        <select 
                          value={vapiLeadId} 
                          onChange={(e) => setVapiLeadId(e.target.value)}
                          className="w-full glass-input p-3.5 rounded-xl text-xs"
                        >
                          <option value="">-- Choose Lead Profile --</option>
                          {leads.map((l) => (
                            <option key={l.id} value={l.id}>{l.name} ({l.phone || "No phone"}) - Score: {l.score}%</option>
                          ))}
                        </select>
                      </div>

                      {/* Trigger Buttons */}
                      <button
                        onClick={handleVapiCallTrigger}
                        disabled={vapiCalling || !vapiLeadId}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.25)] transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
                      >
                        {vapiCalling ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Call Connected... Streaming Transcript
                          </>
                        ) : (
                          <>
                            <PhoneCall className="w-4 h-4" />
                            Initiate Vapi.ai Voice Call
                          </>
                        )}
                      </button>
                    </div>

                    {/* Vapi Webhook Copier */}
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[10px] font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-primary" />
                          Vapi Webhook Receiver Link
                        </h4>
                        <button
                          onClick={() => triggerCopy(`${getApiUrl()}/integrations/vapi/webhook`, "vapi-webhook")}
                          className="text-[9px] font-black text-primary hover:text-white uppercase flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === "vapi-webhook" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copiedKey === "vapi-webhook" ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Plug this webhook URL directly inside your Vapi.ai Assistant dashboard under Webhooks to auto-sync live transcripts, call recordings, and lead status logs.</p>
                      <input 
                        type="text" 
                        readOnly 
                        value={`${getApiUrl()}/integrations/vapi/webhook`} 
                        className="w-full bg-secondary/50 text-[10px] font-mono border border-white/10 p-2.5 rounded-lg text-gray-400"
                      />
                    </div>
                  </div>

                  {/* Right Column: Live transcript terminal / play waveform */}
                  <div className="glass p-6 rounded-2xl border border-white/5 bg-slate-900/60 relative overflow-hidden flex flex-col justify-between min-h-[400px]">
                    <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent pointer-events-none"></div>

                    {/* Terminal Header */}
                    <div className="flex justify-between items-center border-b border-white/15 pb-3">
                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-2">
                        <Activity className={`w-3.5 h-3.5 text-amber-400 ${vapiCalling ? "animate-pulse" : ""}`} />
                        Vapi Call Console Monitor
                      </span>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 uppercase tracking-widest">
                        {vapiCalling ? "Live Stream" : vapiCallEndedInfo ? "Call Finished" : "Idle"}
                      </span>
                    </div>

                    {/* Feed Viewport */}
                    <div className="flex-1 my-4 overflow-y-auto space-y-3 p-3 bg-card/60 rounded-xl border border-white/5 max-h-[250px] scrollbar-thin">
                      {vapiTranscript.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic text-center py-16">
                          System ready. Trigger a voice call to monitor AI Agent conversation transcript logs.
                        </p>
                      ) : (
                        vapiTranscript.filter(t => typeof t === 'string' && t.trim() !== '').map((turn, index) => {
                          const isAI = turn.startsWith("[Vapi AI]");
                          const text = turn.replace(/\[Vapi AI\]:|\[Lead\]:/, "");
                          
                          return (
                            <div 
                              key={index}
                              className={`flex flex-col gap-0.5 text-[11px] leading-relaxed max-w-[85%] ${
                                isAI ? "mr-auto text-left" : "ml-auto text-right items-end"
                              }`}
                            >
                              <span className="block text-[8px] text-gray-500 font-bold uppercase tracking-wide">
                                {isAI ? "Vapi AI Voice Assistant" : "Customer Prospect"}
                              </span>
                              <div className={`p-3 rounded-2xl border text-[10.5px] ${
                                isAI 
                                  ? "bg-secondary text-gray-200 border-white/5 rounded-tl-none" 
                                  : "bg-primary/20 text-white border-primary/20 rounded-tr-none"
                              }`}>
                                {text}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Audio Player and Outcomes */}
                    {vapiCallEndedInfo && (
                      <div className="border-t border-white/15 pt-4 space-y-3 animate-fade-in text-left">
                        {/* Audio Waveform Bar */}
                        <div className="flex items-center gap-4 bg-secondary/60 border border-white/10 p-3.5 rounded-xl">
                          <button
                            onClick={toggleVapiAudio}
                            className="w-10 h-10 bg-primary/20 border border-primary/40 hover:bg-primary text-white rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 flex-shrink-0"
                          >
                            {vapiAudioPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                          </button>
                          
                          <div className="flex-1">
                            <span className="block text-[9px] uppercase font-black text-primary tracking-widest">Listen Call Recording</span>
                            <div className="flex items-end gap-1.5 h-6 mt-1 overflow-hidden pointer-events-none">
                              {/* Glowing Wave Lines */}
                              {Array.from({ length: 28 }).map((_, idx) => {
                                const heights = [10, 30, 60, 40, 20, 50, 70, 40, 20, 10, 45, 80, 50, 30, 20, 60, 90, 70, 40, 20, 50, 30, 10, 35, 60, 40, 20, 10];
                                const h = heights[idx];
                                const activeStyle = vapiAudioPlaying 
                                  ? { height: `${h}%`, transition: "height 0.2s ease", animation: `pulse 1.2s infinite ease-in-out ${idx * 0.05}s` } 
                                  : { height: "15%" };

                                return (
                                  <span 
                                    key={idx} 
                                    style={activeStyle}
                                    className={`w-1.5 rounded-t-sm ${vapiAudioPlaying ? "bg-primary glow-primary" : "bg-white/10"}`}
                                  ></span>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Automatic CRM Outcome update */}
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                            <span className="block text-[9px] text-muted-foreground uppercase font-semibold">CRM Status Update</span>
                            <span className="font-extrabold text-emerald-400 uppercase tracking-widest text-xs flex items-center gap-1.5 mt-0.5">
                              <CheckCircle className="w-3.5 h-3.5" /> ENGAGED
                            </span>
                          </div>
                          <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl">
                            <span className="block text-[9px] text-muted-foreground uppercase font-semibold">Lead Score Update</span>
                            <span className="font-extrabold text-primary tracking-widest text-xs flex items-center gap-1.5 mt-0.5">
                              <Activity className="w-3.5 h-3.5 text-primary glow-primary" /> HOT LEAD (Score: 85%)
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. SMTP EMAIL SANDBOX */}
              {activeTab === "email" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in text-left">
                  <div className="space-y-5">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded">SMTP Drip campaigns</span>
                      <h2 className="text-xl font-bold text-white">Email Dispatcher Sandbox</h2>
                      <p className="text-xs text-muted-foreground">Select a lead, pick a pre-built template, or compile dynamic custom variables locally to test corporate messaging systems.</p>
                    </div>

                    <div className="space-y-4">
                      {/* Lead Selector */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-300">Target Lead</label>
                        <select 
                          value={emailLeadId} 
                          onChange={(e) => setEmailLeadId(e.target.value)}
                          className="w-full glass-input p-3.5 rounded-xl text-xs"
                        >
                          {leads.map((l) => (
                            <option key={l.id} value={l.id}>{l.name} ({l.email || "No email"})</option>
                          ))}
                        </select>
                      </div>

                      {/* Template Selector */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-300">Choose Template (Optional)</label>
                        <select 
                          value={emailTemplateId} 
                          onChange={(e) => {
                            setEmailTemplateId(e.target.value);
                            const t = templates.find(x => x.id === e.target.value);
                            if (t) {
                              setEmailCustomSubject(t.subject || "");
                              setEmailCustomBody(t.content || "");
                            }
                          }}
                          className="w-full glass-input p-3.5 rounded-xl text-xs"
                        >
                          <option value="">-- Choose Template --</option>
                          {templates.filter(t => t.channel === "EMAIL").map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Subject */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-300">Subject</label>
                        <input 
                          type="text" 
                          placeholder="Welcome to Zorvex CRM" 
                          value={emailCustomSubject}
                          onChange={(e) => setEmailCustomSubject(e.target.value)}
                          className="w-full glass-input p-3.5 rounded-xl text-xs"
                        />
                      </div>

                      {/* Custom Body */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-300">Message Body (Support variables: {"{{leadName}}"} & {"{{agentName}}"})</label>
                        <textarea 
                          rows={4}
                          placeholder="Salam {{leadName}},\n\nWelcome aboard..." 
                          value={emailCustomBody}
                          onChange={(e) => setEmailCustomBody(e.target.value)}
                          className="w-full glass-input p-3.5 rounded-xl text-xs"
                        />
                      </div>

                      <button
                        onClick={handleSendEmail}
                        disabled={emailSending || !emailLeadId}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all duration-300 hover:scale-[1.01] cursor-pointer"
                      >
                        {emailSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
                        Send Simulated Email
                      </button>
                    </div>
                  </div>

                  {/* Right Column: HTML client window preview */}
                  <div className="glass p-6 rounded-2xl border border-white/5 bg-slate-900/40 relative flex flex-col min-h-[400px]">
                    <div className="h-10 flex items-center justify-between border-b border-white/10 pb-3 bg-secondary/15 -mx-6 -mt-6 px-6 rounded-t-2xl">
                      <div className="flex gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                        <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                        <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                      </div>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-cyan-400" />
                        SMTP Mail Terminal Client
                      </span>
                    </div>

                    <div className="flex-1 mt-6 text-xs leading-relaxed space-y-4">
                      {emailResult ? (
                        <div className="space-y-4 text-left">
                          {/* Headers */}
                          <div className="space-y-2 border-b border-white/10 pb-4 text-gray-400">
                            <p><strong>To:</strong> <span className="text-white font-mono bg-white/5 px-2.5 py-0.5 rounded">{emailResult.to}</span></p>
                            <p><strong>From:</strong> <span className="text-white font-mono bg-white/5 px-2.5 py-0.5 rounded">{emailResult.from}</span></p>
                            <p><strong>Subject:</strong> <span className="text-white font-bold">{emailResult.subject}</span></p>
                          </div>
                          
                          {/* Body */}
                          <div className="p-4 bg-card rounded-xl border border-white/5 min-h-[180px] text-gray-200 whitespace-pre-wrap font-sans">
                            {emailResult.body}
                          </div>
                          
                          <div className="flex items-center gap-2.5 text-[10px] font-black text-emerald-400 uppercase bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl animate-fade-in">
                            <CheckCircle className="w-4 h-4" />
                            SMTP Sync Completed. Output written to system integration logs.
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-50 py-24">
                          <Bot className="w-10 h-10 text-cyan-400 mb-2 animate-bounce" />
                          <p className="font-bold text-white text-xs">Waiting for Dispatch Trigger</p>
                          <p className="text-[10px] text-muted-foreground max-w-xs">Fill out the sandbox parameters and dispatch a test email to render the client frame preview.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 3. WHATSAPP & SMS SANDBOX */}
              {activeTab === "whatsapp" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in text-left">
                  
                  {/* Left Column: Input Panel */}
                  <div className="space-y-8">
                    
                    {/* WhatsApp Console */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded">WhatsApp Business API</span>
                        <h3 className="text-lg font-bold text-white">WhatsApp Sandbox Dispatch</h3>
                      </div>
                      
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-gray-300 font-bold">Target Lead</label>
                            <select 
                              value={waLeadId} 
                              onChange={(e) => setWaLeadId(e.target.value)}
                              className="w-full glass-input p-3 rounded-lg text-xs"
                            >
                              {leads.map((l) => (
                                <option key={l.id} value={l.id}>{l.name} ({l.phone || "No phone"})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-gray-300 font-bold">PDF Brochure (URL)</label>
                            <input 
                              type="text" 
                              value={waMediaUrl}
                              onChange={(e) => setWaMediaUrl(e.target.value)}
                              className="w-full glass-input p-3 rounded-lg text-xs"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-gray-300 font-bold">Message Text</label>
                          <textarea 
                            rows={3}
                            value={waText}
                            onChange={(e) => setWaText(e.target.value)}
                            className="w-full glass-input p-3 rounded-lg text-xs"
                          />
                        </div>

                        <button
                          onClick={handleSendWhatsApp}
                          disabled={waSending || !waLeadId}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all cursor-pointer"
                        >
                          {waSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Dispatch WhatsApp Brochure
                        </button>
                      </div>
                    </div>

                    {/* SMS Console */}
                    <div className="space-y-4 pt-6 border-t border-white/5">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded">Twilio SMS System</span>
                        <h3 className="text-lg font-bold text-white">Twilio SMS Alert Sandbox</h3>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-gray-300 font-bold">Target Lead</label>
                            <select 
                              value={smsLeadId} 
                              onChange={(e) => setSmsLeadId(e.target.value)}
                              className="w-full glass-input p-3 rounded-lg text-xs"
                            >
                              {leads.map((l) => (
                                <option key={l.id} value={l.id}>{l.name} ({l.phone || "No phone"})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-gray-300 font-bold">SMS Text</label>
                            <input 
                              type="text" 
                              value={smsText}
                              onChange={(e) => setSmsText(e.target.value)}
                              className="w-full glass-input p-3 rounded-lg text-xs"
                            />
                          </div>
                        </div>

                        <button
                          onClick={handleSendSMS}
                          disabled={smsSending || !smsLeadId}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(168,85,247,0.2)] transition-all cursor-pointer"
                        >
                          {smsSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
                          Trigger SMS Notification
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Phone Mockup Frame for WhatsApp Chat */}
                  <div className="flex justify-center items-center">
                    <div className="w-[320px] h-[550px] bg-slate-950 border-[10px] border-slate-800 rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col justify-between">
                      {/* Phone Camera Notch */}
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-800 rounded-full z-20 flex items-center justify-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700"></span>
                        <span className="w-8 h-1 bg-slate-900 rounded-full"></span>
                      </div>

                      {/* Header */}
                      <div className="bg-secondary/90 border-b border-white/5 pt-8 pb-3.5 px-4 flex justify-between items-center text-xs flex-shrink-0 z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary font-bold">
                            RE
                          </div>
                          <div>
                            <p className="font-extrabold text-white text-[10px]">Zorvex Business AI</p>
                            <span className="block text-[7px] text-emerald-400 font-bold uppercase tracking-wider">Official WhatsApp</span>
                          </div>
                        </div>
                        <span className="text-[7px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-400">Online</span>
                      </div>

                      {/* Chat Messages Feed */}
                      <div className="flex-1 p-3.5 space-y-3.5 overflow-y-auto bg-slate-900/60 relative scrollbar-thin text-xs">
                        {waChatMessages.map((msg, index) => (
                          <div 
                            key={index}
                            className={`flex flex-col gap-0.5 max-w-[80%] text-[10px] leading-relaxed ${
                              msg.role === "agent" ? "ml-auto items-end" : "mr-auto"
                            }`}
                          >
                            <div className={`p-2.5 rounded-2xl border ${
                              msg.role === "agent"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-white rounded-tr-none"
                                : "bg-card border-white/5 text-gray-200 rounded-tl-none"
                            }`}>
                              <p className="font-medium">{msg.text}</p>
                              {msg.media && (
                                <a 
                                  href={msg.media} 
                                  target="_blank" 
                                  className="mt-2 block p-1.5 bg-white/5 border border-white/10 rounded-lg text-[8px] text-emerald-400 font-bold truncate flex items-center gap-1"
                                >
                                  <FileText className="w-3 h-3 flex-shrink-0" />
                                  Brochure Attachment
                                </a>
                              )}
                            </div>
                            <span className="block text-[6px] text-gray-600 font-bold">{msg.time}</span>
                          </div>
                        ))}
                      </div>

                      {/* SMS overlay logger in mockup base */}
                      {smsSentLogs.length > 0 && (
                        <div className="bg-secondary/95 border-t border-white/10 p-3 text-[8.5px] leading-snug text-left text-gray-400 flex-shrink-0 z-10 space-y-1 font-mono">
                          <span className="block text-[7px] font-black uppercase text-purple-400 tracking-wider">Latest Twilio Log:</span>
                          <p className="truncate"><strong>To:</strong> {smsSentLogs[0].recipient}</p>
                          <p className="line-clamp-2 italic">"{smsSentLogs[0].message}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. PROPERTY PORTALS (BAYUT & DUBIZZLE) */}
              {activeTab === "portals" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in text-left">
                  
                  {/* Left Column: XML listing Feeder */}
                  <div className="space-y-5">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded">UAE Listing Aggregations</span>
                      <h2 className="text-xl font-bold text-white">Dubizzle & Bayut XML Feed</h2>
                      <p className="text-xs text-muted-foreground">Expose listing directories to national portal search bots. The feed engine automatically compiles live metadata, landlord profiles, and active agent contacts.</p>
                    </div>

                    {/* Feed Copier */}
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-[10px] font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-rose-400" />
                          Aggregation Feed URL
                        </h4>
                        <button
                          onClick={() => {
                            let orgId = leads[0]?.organizationId || "dabe2766-b29e-4dcb-9923-22f83d8a6138";
                            triggerCopy(`${getApiUrl()}/integrations/portals/${orgId}/xml-feed`, "portal-xml");
                          }}
                          className="text-[9px] font-black text-rose-400 hover:text-white uppercase flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === "portal-xml" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copiedKey === "portal-xml" ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <input 
                        type="text" 
                        readOnly 
                        value={`${getApiUrl()}/integrations/portals/${leads[0]?.organizationId || "dabe2766-b29e-4dcb-9923-22f83d8a6138"}/xml-feed`} 
                        className="w-full bg-secondary/50 text-[10px] font-mono border border-white/10 p-2.5 rounded-lg text-gray-400"
                      />
                    </div>

                    {/* Live XML Feed Syntax Highlight Box */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Live Feed XML Preview:</span>
                      {loadingXml ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-2 border border-white/10 rounded-2xl bg-slate-900/40">
                          <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
                          <span className="text-[10px] text-gray-500 font-bold uppercase">Compiling Listing XML...</span>
                        </div>
                      ) : (
                        <div className="h-64 overflow-y-auto p-4 border border-white/10 rounded-2xl bg-slate-900/40 font-mono text-[9px] text-rose-300 whitespace-pre scrollbar-thin text-left">
                          {xmlFeedText}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Webhook Lead Simulator Form */}
                  <div className="glass p-6 rounded-2xl border border-white/5 bg-slate-900/40 space-y-6">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-accent bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded">Inbound Webhook Sandbox</span>
                      <h3 className="text-lg font-bold text-white">Simulate Portal Lead Inquiry</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">Trigger an incoming lead inquiry webhook simulation from Dubizzle or Bayut. This pushes new prospects directly onto the CRM Leads desk, evaluating quality scores and executing automated agent round-robin assignment queues.</p>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-gray-300 font-bold">Portal Channel</label>
                          <select
                            value={portalSelect}
                            onChange={(e) => setPortalSelect(e.target.value)}
                            className="w-full glass-input p-3 rounded-lg text-xs"
                          >
                            <option value="BAYUT">BAYUT PORTAL</option>
                            <option value="DUBIZZLE">DUBIZZLE PORTAL</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-gray-300 font-bold">Client Full Name</label>
                          <input
                            type="text"
                            value={portalLeadData.name}
                            onChange={(e) => setPortalLeadData(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full glass-input p-3 rounded-lg text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-gray-300 font-bold">Client Email</label>
                          <input
                            type="text"
                            value={portalLeadData.email}
                            onChange={(e) => setPortalLeadData(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full glass-input p-3 rounded-lg text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-gray-300 font-bold">Client Phone Number</label>
                          <input
                            type="text"
                            value={portalLeadData.phone}
                            onChange={(e) => setPortalLeadData(prev => ({ ...prev, phone: e.target.value }))}
                            className="w-full glass-input p-3 rounded-lg text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-gray-300 font-bold">Property Reference ID</label>
                        <input
                          type="text"
                          value={portalLeadData.propertyRef}
                          onChange={(e) => setPortalLeadData(prev => ({ ...prev, propertyRef: e.target.value }))}
                          className="w-full glass-input p-3 rounded-lg text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-gray-300 font-bold">Client Inquiry Message</label>
                        <textarea
                          rows={2}
                          value={portalLeadData.message}
                          onChange={(e) => setPortalLeadData(prev => ({ ...prev, message: e.target.value }))}
                          className="w-full glass-input p-3 rounded-lg text-xs"
                        />
                      </div>

                      <button
                        onClick={handlePortalLeadSimulate}
                        disabled={portalSyncing}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.25)] transition-all cursor-pointer"
                      >
                        {portalSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-3.5 h-3.5 animate-pulse" />}
                        Simulate Inbound Portal Webhook
                      </button>

                      {portalResult && (
                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl space-y-1.5 animate-fade-in">
                          <span className="font-extrabold text-emerald-400 uppercase tracking-widest text-[9px] flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4" /> Webhook processed successfully
                          </span>
                          <p className="text-[10px] text-gray-300">Lead <strong>{portalResult.lead?.name}</strong> has been auto-assigned to an active Agent Realtor via standard round-robin CRM distribution. Quality score set at: <strong>{portalResult.lead?.score}%</strong>.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 5. GOOGLE DRIVE & GOOGLE MAPS API */}
              {activeTab === "google" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in text-left">
                  
                  {/* Google Maps Geocoder */}
                  <div className="glass p-6 rounded-2xl border border-white/5 bg-slate-900/40 space-y-6">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2.5 py-0.5 rounded">Google Maps Platform</span>
                      <h3 className="text-lg font-bold text-white">Dynamic Geocoding Sync</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">Geocode listing addresses dynamically, resolving locations to precise latitudes and longitudes. This coordinates mapping systems inside Zorvex listing pages.</p>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div className="space-y-2">
                        <label className="text-gray-300 font-bold">Select Property Listing</label>
                        <select
                          value={selectedPropId}
                          onChange={(e) => setSelectedPropId(e.target.value)}
                          className="w-full glass-input p-3.5 rounded-xl text-xs"
                        >
                          {properties.map((p) => (
                            <option key={p.id} value={p.id}>{p.title} - {p.location}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleMapsGeocodeTrigger}
                        disabled={geocoding || !selectedPropId}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(20,184,166,0.2)] transition-all cursor-pointer"
                      >
                        {geocoding ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                        Trigger Geocoding Request
                      </button>

                      {geocodeResult && (
                        <div className="p-4 bg-teal-500/5 border border-teal-500/10 rounded-xl space-y-1.5 animate-fade-in text-left">
                          <span className="font-extrabold text-teal-400 uppercase tracking-widest text-[9px] flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5" /> Geocoder coordinates resolved
                          </span>
                          <p className="text-[10px] text-gray-300">Formatted Address: <strong>{geocodeResult.payload?.formattedAddress}</strong></p>
                          <p className="text-[10px] text-gray-400 font-mono">Latitude: {geocodeResult.coordinates?.lat} | Longitude: {geocodeResult.coordinates?.lng}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Google Drive Vault */}
                  <div className="glass p-6 rounded-2xl border border-white/5 bg-slate-900/40 space-y-6">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded">Google Drive APIs</span>
                      <h3 className="text-lg font-bold text-white">Vault File Archiving Sync</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">Instantly sync Emirates IDs, owner titles, and KYC documents to Google Drive secure folders under tenant organizational folders.</p>
                    </div>

                    <div className="space-y-4 text-xs">
                      <div className="space-y-2">
                        <label className="text-gray-300 font-bold">Select Client Document</label>
                        <select
                          value={selectedDocId}
                          onChange={(e) => setSelectedDocId(e.target.value)}
                          className="w-full glass-input p-3.5 rounded-xl text-xs"
                        >
                          {documents.map((d) => (
                            <option key={d.id} value={d.id}>{d.name} ({d.category})</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={handleDriveSyncTrigger}
                        disabled={syncingDoc || !selectedDocId}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.2)] transition-all cursor-pointer"
                      >
                        {syncingDoc ? <Loader2 className="w-5 h-5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
                        Archive Document to Drive
                      </button>

                      {docSyncResult && (
                        <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl space-y-1.5 animate-fade-in text-left font-mono text-[9px] text-blue-300">
                          <span className="font-extrabold text-blue-400 uppercase tracking-widest text-[9px] flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5" /> File synced successfully
                          </span>
                          <p>Target Drive Folder: {docSyncResult.payload?.driveFolder}</p>
                          <p>Document Metadata: id={docSyncResult.payload?.fileId} name={docSyncResult.payload?.fileName}</p>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>

          {/* INTEGRATIONS EXECUTION LOGS TERMINAL */}
          <div className="glass rounded-3xl border border-white/10 overflow-hidden text-left shadow-2xl">
            {/* Logs Header */}
            <div className="bg-secondary/20 border-b border-white/10 px-6 py-4 flex justify-between items-center">
              <h2 className="text-sm font-black uppercase text-white tracking-widest flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-primary glow-primary animate-pulse" />
                Unified Integration Audit Terminal
              </h2>
              <button 
                onClick={loadData}
                className="text-[10px] font-black uppercase bg-secondary/50 border border-white/10 px-3 py-1.5 rounded-xl text-primary hover:text-white transition-all cursor-pointer"
              >
                Refresh Log Console
              </button>
            </div>

            {/* Logs Table */}
            <div className="overflow-x-auto max-h-[350px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-xs font-mono text-gray-300">
                <thead>
                  <tr className="bg-secondary/40 border-b border-white/10 text-[9px] font-black uppercase tracking-wider text-gray-400 text-left">
                    <th className="p-4 pl-6">Timestamp</th>
                    <th className="p-4">Channel</th>
                    <th className="p-4">Direction</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Details Summary</th>
                    <th className="p-4 text-center pr-6">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground italic text-xs">No integration operations compiled yet in this workspace.</td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const badgeStyles: Record<string, string> = {
                        "VOICE": "text-amber-400 bg-amber-500/10 border-amber-500/20",
                        "EMAIL": "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
                        "WHATSAPP": "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                        "SMS": "text-purple-400 bg-purple-500/10 border-purple-500/20",
                        "PORTAL": "text-rose-400 bg-rose-500/10 border-rose-500/20",
                        "GOOGLE_DRIVE": "text-blue-400 bg-blue-500/10 border-blue-500/20",
                        "GOOGLE_MAPS": "text-teal-400 bg-teal-500/10 border-teal-500/20"
                      };
                      
                      const directionColors = log.direction === "INBOUND" ? "text-indigo-400" : "text-amber-400";
                      const statusIcon = log.status === "SUCCESS" ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-rose-500" />;

                      return (
                        <tr key={log.id} className="hover:bg-white/5 transition-all text-left">
                          <td className="p-4 pl-6 font-sans text-gray-500 text-[10px] font-semibold whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "medium" })}
                          </td>
                          <td className="p-4">
                            <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 border rounded-lg ${badgeStyles[log.channel] || "text-gray-400 border-white/15 bg-white/5"}`}>
                              {log.channel}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`text-[8.5px] font-black uppercase flex items-center gap-1 ${directionColors}`}>
                              {log.direction}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1.5 font-bold uppercase text-[9px]">
                              {statusIcon}
                              <span className={log.status === "SUCCESS" ? "text-emerald-400" : "text-rose-500"}>{log.status}</span>
                            </div>
                          </td>
                          <td className="p-4 max-w-[280px] truncate text-gray-400 font-sans text-[11px] font-medium">
                            {log.channel === "VOICE" && `Vapi voice analysis: status updated`}
                            {log.channel === "PORTAL" && `Lead synced from portal inquiries`}
                            {log.channel === "EMAIL" && `SMTP dispatch sent to client`}
                            {log.channel === "WHATSAPP" && `WhatsApp notification compiled`}
                            {log.channel === "SMS" && `Twilio text notification logged`}
                            {log.channel === "GOOGLE_MAPS" && `Google geocoder palm Resolved`}
                            {log.channel === "GOOGLE_DRIVE" && `Google Drive cloud synced`}
                          </td>
                          <td className="p-4 text-center pr-6">
                            <button
                              onClick={() => setInspectedPayload(log.payload)}
                              className="text-[9px] font-black uppercase tracking-wider text-primary hover:text-white bg-secondary border border-white/10 px-2 py-1 rounded cursor-pointer"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* -----------------------------------------------------------------------------
          MODALS & DRAWERS
          ----------------------------------------------------------------------------- */}

      {/* 1. Glassmorphic Configurations Drawer */}
      {editingConfig && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass max-w-lg w-full rounded-3xl p-8 border border-white/10 shadow-2xl space-y-6 text-left relative">
            <button 
              onClick={() => setEditingConfig(null)}
              className="absolute top-5 right-5 text-muted-foreground hover:text-white transition-colors cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded">Setup Credentials</span>
              <h2 className="text-xl font-bold text-white">Configure {getCatalogMeta(editingConfig.type).title}</h2>
              <p className="text-xs text-muted-foreground">Save API tokens and configurations. Multi-tenant security ensures isolated storage.</p>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs leading-relaxed">
              {/* Enabled Toggler */}
              <div className="flex justify-between items-center p-4 bg-secondary/40 border border-white/10 rounded-2xl">
                <div>
                  <span className="block font-bold text-white">Activate Integration Status</span>
                  <span className="block text-[10px] text-muted-foreground">Toggle to enable live triggers.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={configEnabled} 
                    onChange={(e) => setConfigEnabled(e.target.checked)} 
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Vapi.ai Specific Credentials */}
              {editingConfig.type === "VOICE" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">Vapi.ai API Key</label>
                    <input 
                      type="password"
                      placeholder="vapi-api-key..."
                      value={configCredentials.apiKey || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, apiKey: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">Vapi Public Key (For Web calls)</label>
                    <input 
                      type="text"
                      placeholder="e.g., public-key-uuid..."
                      value={configCredentials.publicKey || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, publicKey: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">Assistant ID</label>
                    <input 
                      type="text"
                      placeholder="e.g., 2d3e1sc4-mb4q-..."
                      value={configCredentials.assistantId || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, assistantId: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">Phone Number ID</label>
                    <input 
                      type="text"
                      placeholder="e.g., phone-number-uuid..."
                      value={configCredentials.phoneNumberId || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, phoneNumberId: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              {/* SMTP Credentials */}
              {editingConfig.type === "EMAIL" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-bold text-gray-300">SMTP Host</label>
                      <input 
                        type="text"
                        placeholder="smtp.gmail.com"
                        value={configCredentials.smtpHost || ""}
                        onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, smtpHost: e.target.value }))}
                        className="w-full glass-input p-3 rounded-lg text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-bold text-gray-300">SMTP Port</label>
                      <input 
                        type="text"
                        placeholder="587"
                        value={configCredentials.smtpPort || ""}
                        onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, smtpPort: e.target.value }))}
                        className="w-full glass-input p-3 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">SMTP User / Username</label>
                    <input 
                      type="text"
                      placeholder="username@gmail.com"
                      value={configCredentials.smtpUser || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, smtpUser: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">SMTP Password</label>
                    <input 
                      type="password"
                      placeholder="••••••••••••"
                      value={configCredentials.smtpPassword || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, smtpPassword: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Twilio SMS / WhatsApp Credentials */}
              {(editingConfig.type === "SMS" || editingConfig.type === "WHATSAPP") && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">Twilio Account SID</label>
                    <input 
                      type="text"
                      placeholder="AC..."
                      value={configCredentials.accountSid || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, accountSid: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">Twilio Auth Token</label>
                    <input 
                      type="password"
                      placeholder="••••••••••••"
                      value={configCredentials.authToken || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, authToken: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">{editingConfig.type === "SMS" ? "Twilio Phone Number" : "Twilio WhatsApp Sender Number"}</label>
                    <input 
                      type="text"
                      placeholder="+1123456789"
                      value={configCredentials.senderNumber || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, senderNumber: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Stub credential loader for remaining types */}
              {["PORTAL_FEED", "GOOGLE_DRIVE", "GOOGLE_MAPS"].includes(editingConfig.type) && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">Client Secrets ID / API License Key</label>
                    <input 
                      type="password"
                      placeholder="License keys..."
                      value={configCredentials.apiKey || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, apiKey: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-gray-300">Connection Endpoint Scope (Metadata)</label>
                    <input 
                      type="text"
                      placeholder="Scope definitions"
                      value={configCredentials.scope || ""}
                      onChange={(e) => setConfigCredentials((prev: any) => ({ ...prev, scope: e.target.value }))}
                      className="w-full glass-input p-3 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingConfig}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-95 text-white font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 glow-primary transition-all cursor-pointer"
              >
                {isSavingConfig && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Integration Configuration
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Custom Template Creation Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass max-w-lg w-full rounded-3xl p-8 border border-white/10 shadow-2xl space-y-6 text-left relative">
            <button 
              onClick={() => setShowTemplateModal(false)}
              className="absolute top-5 right-5 text-muted-foreground hover:text-white transition-colors cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-accent bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded">Templates Cabinet</span>
              <h2 className="text-xl font-bold text-white">Create Custom Message Template</h2>
              <p className="text-xs text-muted-foreground">Draft custom layouts. Integrate CRM dynamic data variables like {"{{leadName}}"} and {"{{agentName}}"}.</p>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4 text-xs text-left">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-gray-300">Template Title Name</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g., Lead Follow-up"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full glass-input p-3 rounded-lg text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-bold text-gray-300">Channel Type</label>
                  <select
                    value={newTemplate.channel}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, channel: e.target.value }))}
                    className="w-full glass-input p-3 rounded-lg text-xs"
                  >
                    <option value="EMAIL">EMAIL (SMTP)</option>
                    <option value="WHATSAPP">WHATSAPP (Meta API)</option>
                    <option value="SMS">SMS (Twilio)</option>
                  </select>
                </div>
              </div>

              {newTemplate.channel === "EMAIL" && (
                <div className="space-y-1.5">
                  <label className="font-bold text-gray-300">Email Subject Line</label>
                  <input 
                    type="text"
                    placeholder="Premium listings Palm Jumeirah"
                    value={newTemplate.subject}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full glass-input p-3 rounded-lg text-xs"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-bold text-gray-300">Layout Content Body</label>
                <textarea 
                  rows={5}
                  required
                  placeholder="Salam {{leadName}}! Welcome aboard to Zorvex ERP..."
                  value={newTemplate.content}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full glass-input p-3 rounded-lg text-xs font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingTemplate}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-95 text-white font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 glow-primary transition-all cursor-pointer"
              >
                {isSavingTemplate && <Loader2 className="w-4 h-4 animate-spin" />}
                Create & Compile Template
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. JSON Payload Inspector Modal */}
      {inspectedPayload && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass max-w-xl w-full rounded-3xl p-8 border border-white/10 shadow-2xl space-y-6 text-left relative">
            <button 
              onClick={() => setInspectedPayload(null)}
              className="absolute top-5 right-5 text-muted-foreground hover:text-white transition-colors cursor-pointer"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded">Metadata Inspector</span>
              <h2 className="text-xl font-bold text-white">Operation Payload JSON</h2>
              <p className="text-xs text-muted-foreground">Audit precise structured values transmitted through integration handlers.</p>
            </div>

            <div className="p-4 border border-white/15 bg-card rounded-2xl max-h-[300px] overflow-y-auto font-mono text-[10px] text-cyan-300 whitespace-pre scrollbar-thin text-left">
              {JSON.stringify(inspectedPayload, null, 2)}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(inspectedPayload, null, 2));
                  alert("🎉 JSON payload copied successfully!");
                }}
                className="flex-1 py-3 rounded-xl bg-secondary hover:bg-white/5 border border-white/10 text-xs font-bold text-white transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Copy className="w-4 h-4" /> Copy JSON
              </button>
              <button 
                onClick={() => setInspectedPayload(null)}
                className="flex-1 py-3 rounded-xl bg-primary hover:opacity-95 text-white text-xs font-bold transition-all cursor-pointer text-center"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
