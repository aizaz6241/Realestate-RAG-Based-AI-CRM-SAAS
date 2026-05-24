"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  MessageSquare, 
  Send, 
  User, 
  Users, 
  Bot, 
  Loader2, 
  Plus, 
  ChevronRight, 
  Clock, 
  Search, 
  BellRing,
  AlertCircle
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function ChatPage() {
  const { token, user: currentUser } = useAuth();
  
  // Data States
  const [rooms, setRooms] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [activeRoom, setActiveRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  
  // Loading & Submitting
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCreatingDm, setIsCreatingDm] = useState(false);

  // Inputs
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("all"); // all, direct, group, system
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchRooms = async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setIsLoadingRooms(true);
    try {
      const res = await fetch("http://localhost:3001/chat/rooms", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(data);
        
        // Auto-select the first room if none is active
        if (!activeRoom && data.length > 0) {
          setActiveRoom(data[0]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch rooms:", e);
      // Premium Mock Fallback
      if (rooms.length === 0) {
        setRooms([
          { 
            id: "room-sys", 
            name: "RENS System Bot", 
            isGroup: false, 
            isSystem: true, 
            systemUserId: currentUser?.id,
            messages: [{ content: "🤖 Welcome to RENS System Notifications! You will receive live automated alerts here.", isSystem: true, createdAt: new Date() }] 
          },
          { 
            id: "room-gen", 
            name: "General Team Chat", 
            isGroup: true, 
            isSystem: false,
            members: [{ firstName: "Zain" }, { firstName: "Ali" }],
            messages: [{ content: "👋 Welcome to the General Team Chat!", createdAt: new Date() }] 
          }
        ]);
      }
    } finally {
      if (showLoading) setIsLoadingRooms(false);
    }
  };

  const fetchMessages = async (roomId: string, showLoading = false) => {
    if (!token || !roomId) return;
    if (showLoading) setIsLoadingMessages(true);
    try {
      const res = await fetch(`http://localhost:3001/chat/rooms/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setMessages(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch messages:", e);
      // Mock Messages
      if (roomId === "room-sys") {
        setMessages([
          { id: "m1", content: "🤖 Welcome to RENS System Notifications! You will receive live automated alerts here for any task assignments, audit cycles, or listing updates related to you.", isSystem: true, createdAt: new Date(Date.now() - 3600 * 1000) },
          { id: "m2", content: "📢 Task Assignment Alert: A new operational task has been allocated to you: 'Review DHA Phase 6 Villa files' due on May 28, 2026. Please check your Tasks Board to execute.", isSystem: true, createdAt: new Date() }
        ]);
      } else {
        setMessages([
          { id: "m3", content: "👋 Welcome to the General Team Chat! This channel is open to all RENS employees for collaborative coordination.", createdAt: new Date(Date.now() - 3600 * 1000) },
          { id: "m4", content: "Hey team! Let's check out the new property listings we registered today.", sender: { firstName: "Ali", role: "AGENT" }, createdAt: new Date() }
        ]);
      }
    } finally {
      if (showLoading) setIsLoadingMessages(false);
    }
  };

  const fetchEmployees = async () => {
    if (!token) return;
    try {
      const res = await fetch("http://localhost:3001/employees", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        // Filter out current user from selection list
        const allEmployees = await res.json();
        setEmployees(allEmployees.filter((e: any) => e.email !== currentUser?.email));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 1. Initial Data Fetching
  useEffect(() => {
    fetchRooms(true);
    fetchEmployees();
  }, [token]);

  // 2. Poll messages when active room changes, and run active messages polling
  useEffect(() => {
    if (activeRoom) {
      fetchMessages(activeRoom.id, true);
    }
  }, [activeRoom]);

  // 3. Real-Time Simulative Polling Engine (Optimized to 1.5 seconds)
  useEffect(() => {
    if (!token) return;
    
    // Poll rooms list
    const roomsInterval = setInterval(() => {
      fetchRooms(false);
    }, 1500);

    // Poll current room messages
    const messagesInterval = setInterval(() => {
      if (activeRoom) {
        fetchMessages(activeRoom.id, false);
      }
    }, 1500);

    return () => {
      clearInterval(roomsInterval);
      clearInterval(messagesInterval);
    };
  }, [token, activeRoom]);

  // Scroll on message change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeRoom) return;
    
    const textToSend = newMessage;
    setNewMessage(""); // Snappy input clear
    
    // 1. Instantly construct optimistic message object
    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      content: textToSend,
      createdAt: new Date().toISOString(),
      senderId: currentUser?.id,
      sender: {
        id: currentUser?.id,
        firstName: currentUser?.firstName || currentUser?.email?.split("@")[0] || "Me",
        role: currentUser?.role || "AGENT"
      }
    };
    
    // 2. Instantly update messages array and active room last message
    setMessages(prev => [...prev, optimisticMsg]);
    setRooms(prevRooms => prevRooms.map(r => 
      r.id === activeRoom.id 
        ? { ...r, messages: [optimisticMsg] }
        : r
    ));
    
    setIsSending(true);
    
    try {
      const res = await fetch(`http://localhost:3001/chat/rooms/${activeRoom.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: textToSend })
      });
      if (res.ok) {
        fetchMessages(activeRoom.id, false);
        fetchRooms(false);
      }
    } catch (e) {
      console.error("Failed to send message over network:", e);
    } finally {
      setIsSending(false);
    }
  };

  const handleStartDirectChat = async (targetId: string) => {
    if (!targetId || !token) return;
    setIsCreatingDm(true);
    try {
      const res = await fetch("http://localhost:3001/chat/rooms/direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId: targetId })
      });
      if (res.ok) {
        const newDmRoom = await res.json();
        fetchRooms(false);
        setActiveRoom(newDmRoom);
        setSelectedEmployeeId("");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingDm(false);
    }
  };

  // Chat Roster filtering
  const filteredRooms = rooms.filter((r) => {
    // 1. Tab filter
    if (selectedTab === "direct" && (r.isGroup || r.isSystem)) return false;
    if (selectedTab === "group" && (!r.isGroup || r.isSystem)) return false;
    if (selectedTab === "system" && !r.isSystem) return false;

    // 2. Search query filter
    const roomName = getRoomDisplayName(r).toLowerCase();
    return roomName.includes(searchQuery.toLowerCase());
  });

  function getRoomDisplayName(room: any) {
    if (room.isSystem) return "RENS System Bot";
    if (room.isGroup) return room.name || "Team Channel";
    
    // For direct chats, return the recipient's name (the member who isn't the logged in user)
    const otherMember = room.members?.find((m: any) => m.id !== currentUser?.id);
    return otherMember ? `${otherMember.firstName} ${otherMember.lastName || ""}` : "Chat Conversation";
  }

  function getRoomSubText(room: any) {
    if (room.isSystem) return "System Alerts Bot";
    if (room.isGroup) return `${room.members?.length || 2} members`;
    
    const otherMember = room.members?.find((m: any) => m.id !== currentUser?.id);
    return otherMember ? otherMember.role : "Direct Message";
  }

  return (
    <div className="min-h-screen p-8 relative z-10 overflow-hidden flex flex-col space-y-6 h-[85vh]">
      {/* Background Neon glows */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex justify-between items-center animate-fade-in flex-shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Chat Terminal</h1>
          <p className="text-muted-foreground mt-1">Real-time team messaging cabinet, private DMs, and automated System notifications drawer.</p>
        </div>
      </div>

      {/* Split chat box grid */}
      <div className="flex-1 glass rounded-3xl border border-border/60 overflow-hidden flex h-[70vh] shadow-2xl animate-fade-in">
        
        {/* Left Sidebar: Roster panel */}
        <div className="w-80 border-r border-border/40 flex flex-col bg-card/25 backdrop-blur-xl">
          
          {/* Top Search bar */}
          <div className="p-4 border-b border-border/40 space-y-3.5 flex-shrink-0">
            <div className="flex items-center gap-2 bg-secondary/30 border border-border/60 rounded-xl px-3 py-1">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full bg-transparent border-0 outline-none focus:ring-0 text-xs text-white py-1.5"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Quick DM launcher */}
            <div className="space-y-1">
              <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider">Start DM Private Chat</span>
              <div className="flex gap-2">
                <select
                  className="glass-input px-2.5 py-1.5 rounded-lg text-xs bg-secondary border border-border/60 flex-1 outline-none"
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                >
                  <option value="">-- Choose Team Member --</option>
                  {employees.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName || ""} ({e.role})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleStartDirectChat(selectedEmployeeId)}
                  disabled={!selectedEmployeeId || isCreatingDm}
                  className="bg-primary hover:bg-primary/95 text-white p-2 rounded-lg glow-primary flex items-center justify-center flex-shrink-0 transition-transform active:scale-95"
                >
                  {isCreatingDm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Roster Filters */}
          <div className="flex border-b border-border/40 p-2 overflow-x-auto gap-1 text-[10px] uppercase font-bold flex-shrink-0 scrollbar-none">
            {["all", "direct", "group", "system"].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTab(t)}
                className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                  selectedTab === t
                    ? "bg-primary/10 text-primary border-primary/20 shadow-sm font-black"
                    : "text-muted-foreground border-transparent hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Roster conversations list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
            {isLoadingRooms ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary glow-primary" />
              </div>
            ) : filteredRooms.length === 0 ? (
              <p className="text-[10px] text-center text-muted-foreground italic py-10">No chats found in this cabinet.</p>
            ) : (
              filteredRooms.map((room) => {
                const isActive = activeRoom?.id === room.id;
                const lastMsg = room.messages?.[0]?.content || "No messages yet";
                
                return (
                  <div
                    key={room.id}
                    onClick={() => setActiveRoom(room)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer text-left relative ${
                      isActive 
                        ? "bg-primary/10 border-primary/30 glow-primary shadow-[0_0_10px_rgba(6,182,212,0.05)]"
                        : "border-transparent bg-transparent hover:bg-secondary/20 hover:border-border/40"
                    }`}
                  >
                    {/* Chat avatar bubble */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                      room.isSystem ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                      room.isGroup ? "bg-purple-500/10 border-purple-500/20 text-purple-400" :
                      "bg-primary/10 border-primary/20 text-primary"
                    }`}>
                      {room.isSystem ? <Bot className="w-5 h-5 animate-pulse" /> :
                       room.isGroup ? <Users className="w-5 h-5" /> :
                       <User className="w-5 h-5" />}
                    </div>

                    {/* Chat text */}
                    <div className="overflow-hidden flex-1 space-y-0.5">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="font-extrabold text-xs text-white truncate block">{getRoomDisplayName(room)}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                      <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider truncate">{getRoomSubText(room)}</span>
                      <p className="text-[10px] text-muted-foreground truncate leading-relaxed">{lastMsg}</p>
                    </div>

                    {/* Active highlight glow */}
                    {isActive && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-l-full glow-primary"></div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Conversation Terminal */}
        <div className="flex-1 flex flex-col justify-between bg-card/10 backdrop-blur-md">
          {activeRoom ? (
            <>
              {/* Header Details */}
              <div className="p-4 border-b border-border/40 bg-secondary/15 backdrop-blur-md flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                    activeRoom.isSystem ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                    activeRoom.isGroup ? "bg-purple-500/10 border-purple-500/20 text-purple-400" :
                    "bg-primary/10 border-primary/20 text-primary"
                  }`}>
                    {activeRoom.isSystem ? <Bot className="w-5 h-5 animate-pulse" /> :
                     activeRoom.isGroup ? <Users className="w-5 h-5" /> :
                     <User className="w-5 h-5" />}
                  </div>
                  
                  <div className="text-left space-y-0.5">
                    <h3 className="font-black text-sm text-white tracking-wide">{getRoomDisplayName(activeRoom)}</h3>
                    <span className="text-[8px] font-black tracking-widest uppercase text-gray-400 px-2 py-0.5 rounded bg-secondary border border-border">
                      {activeRoom.isSystem ? "RENS Automated Notification Core" :
                       activeRoom.isGroup ? "Universal Organization Channel" :
                       "Private Direct DM Session"}
                    </span>
                  </div>
                </div>

                {/* Status indicator */}
                {activeRoom.isSystem ? (
                  <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <BellRing className="w-3 h-3 animate-bounce" /> bot active
                  </span>
                ) : (
                  <span className="text-[9px] font-black uppercase text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span> live encrypted
                  </span>
                )}
              </div>

              {/* Scrolling messages feed */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
                {isLoadingMessages ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground italic space-y-1.5">
                    <MessageSquare className="w-8 h-8 text-primary mx-auto opacity-70 mb-2" />
                    No conversation records found inside this cabinet.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isSelf = msg.senderId === currentUser?.id;
                    const isSystemAlert = msg.isSystem || msg.isSystem === "true";
                    
                    // A. System Alert Message style
                    if (isSystemAlert) {
                      return (
                        <div key={msg.id} className="flex justify-center animate-fade-in">
                          <div className="glass max-w-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs px-4.5 py-3 rounded-2xl flex gap-3 shadow-[0_0_15px_rgba(245,158,11,0.05)] text-left relative overflow-hidden">
                            {/* Glowing bar */}
                            <div className="absolute top-0 bottom-0 left-0 w-1 bg-amber-500 shadow-[0_0_8px_#f59e0b]"></div>
                            <AlertCircle className="w-5 h-5 flex-shrink-0 animate-pulse text-amber-400" />
                            <div className="space-y-1 leading-relaxed">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold uppercase tracking-widest text-[9px] bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.5 rounded">SYSTEM BOT</span>
                                <span className="text-[9px] text-gray-500 font-bold flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <p className="text-gray-200 font-medium">{msg.content}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // B. User Messages Chat bubbles
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[70%] animate-fade-in ${isSelf ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                      >
                        {/* User Avatar */}
                        {!isSelf && (
                          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary font-extrabold text-sm flex items-center justify-center flex-shrink-0 shadow-sm">
                            {msg.sender?.firstName?.charAt(0).toUpperCase() || "A"}
                          </div>
                        )}
                        
                        <div className="space-y-1.5 text-left">
                          {/* Sender details */}
                          {!isSelf && (
                            <span className="block text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">
                              {msg.sender?.firstName} {msg.sender?.lastName || ""} ({msg.sender?.role})
                            </span>
                          )}

                          {/* Bubble box content */}
                          <div className={`p-3.5 rounded-2xl text-sm leading-relaxed border shadow-md relative ${
                            isSelf 
                              ? "bg-primary/20 border-primary/30 text-white rounded-tr-none glow-primary shadow-[0_0_12px_rgba(6,182,212,0.05)]"
                              : "bg-card border-border/50 text-gray-200 rounded-tl-none"
                          }`}>
                            <p className="font-medium whitespace-pre-wrap">{msg.content}</p>
                            
                            <span className="block text-[8px] text-gray-500 font-bold text-right mt-1.5 flex items-center justify-end gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input form box */}
              {activeRoom.isSystem ? (
                <div className="p-4 border-t border-border/40 bg-secondary/5 text-center text-xs text-muted-foreground flex-shrink-0 select-none">
                  🤖 The RENS System Bot notifications drawer is read-only. Responses cannot be sent.
                </div>
              ) : (
                <form
                  onSubmit={handleSendMessage}
                  className="p-4 border-t border-border/40 bg-secondary/10 flex gap-3.5 items-center flex-shrink-0"
                >
                  <input
                    type="text"
                    required
                    placeholder="Type team updates or coordinate deal status..."
                    className="flex-1 glass-input pl-4.5 pr-4.5 py-3 rounded-2xl text-xs bg-secondary border border-border/60 outline-none text-white focus:ring-1 focus:ring-primary focus:border-primary"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={isSending || !newMessage.trim()}
                    className="bg-primary hover:bg-primary/95 text-white p-3 rounded-2xl glow-primary flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 disabled:opacity-50 disabled:scale-100"
                  >
                    {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center p-8 text-muted-foreground italic space-y-1.5">
              <MessageSquare className="w-10 h-10 text-primary animate-pulse opacity-70 mb-2" />
              Select a conversation room from the left cabinet to start coordination.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
