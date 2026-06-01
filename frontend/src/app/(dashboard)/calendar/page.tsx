"use client";

import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Loader2, 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  MapPin, 
  Clock, 
  Users, 
  Info, 
  Trash2, 
  X,
  Lock,
  Globe,
  Bell,
  CheckCircle,
  Briefcase,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  MessageSquare,
  History,
  Sparkles,
  Cpu
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  type: "meeting" | "private" | "task" | "logistics";
  color: "blue" | "green" | "yellow" | "purple";
  isPrivate: boolean;
  targetRoles: string[];
  targetUserIds: string[];
  createdBy?: {
    id: string;
    firstName: string;
    lastName?: string;
    role: string;
    email: string;
  };
  metadata?: {
    taskId?: string;
    status?: string;
    createdByName?: string;
    scheduleId?: string;
    driverName?: string;
    vehicleModel?: string;
  };
}

const ALL_ROLES = ["SUPER_ADMIN", "ADMIN", "SALES_MANAGER", "AGENT", "HR", "LOGISTICS", "FINANCE", "RECEPTIONIST", "VIEWER"];

function PeerVideoPlayer({ stream, className }: { stream: MediaStream; className?: string }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline className={className} />;
}

export default function CalendarPage() {
  const { token, user: currentUser } = useAuth();
  
  // Date State
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Data State
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal & Drawer State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Phase 4 Extensions
  const [activeTab, setActiveTab] = useState<"calendar" | "schedules">("calendar");
  const [joinTime, setJoinTime] = useState<number>(0);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any | null>(null);
  const [drawerMeetingState, setDrawerMeetingState] = useState<any | null>(null);
  const [isFetchingDrawerSummary, setIsFetchingDrawerSummary] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    startTime: "",
    endTime: "",
    isPrivate: false,
    targetRoles: [] as string[],
    targetUserIds: [] as string[],
  });

  const [colleagueSearch, setColleagueSearch] = useState("");

  // Virtual Conference & WebRTC Hub States
  const [isCallActive, setIsCallActive] = useState(false);
  const [callRoomEvent, setCallRoomEvent] = useState<CalendarEvent | null>(null);
  const [isCamMuted, setIsCamMuted] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [meetingMessages, setMeetingMessages] = useState<any[]>([
    { id: 1, sender: "System Bot", text: "🤖 Virtual Meeting room initialized. Waiting for participants to join...", isSystem: true, time: "Just now" }
  ]);

  const [isCaptionsOn, setIsCaptionsOn] = useState(false);
  const [spokenLang, setSpokenLang] = useState("en-US");
  const [preferredTranslationLang, setPreferredTranslationLang] = useState("en-US");
  const [activeCaptions, setActiveCaptions] = useState<any[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [activePeers, setActivePeers] = useState<any[]>([]);
  const [peerStreams, setPeerStreams] = useState<{ [peerId: string]: MediaStream }>({});
  const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const broadcastChannelRef = React.useRef<BroadcastChannel | null>(null);
  const peerConnectionsRef = React.useRef<{ [peerId: string]: RTCPeerConnection }>({});
  const peerStreamsRef = React.useRef<{ [peerId: string]: MediaStream }>({});
  const myPeerIdRef = React.useRef<string>("");

  // Synchronize Call Room Event ID with sessionStorage to survive browser reloads
  useEffect(() => {
    if (callRoomEvent) {
      sessionStorage.setItem("activeCallRoomEventId", callRoomEvent.id);
      if (joinTime) {
        sessionStorage.setItem("activeCallJoinTime", joinTime.toString());
      } else {
        sessionStorage.setItem("activeCallJoinTime", Date.now().toString());
      }
    } else {
      sessionStorage.removeItem("activeCallRoomEventId");
      sessionStorage.removeItem("activeCallJoinTime");
    }
  }, [callRoomEvent, joinTime]);

  // Restore Call Room Session on reload/refresh
  useEffect(() => {
    if (events.length > 0 && !isCallActive && !callRoomEvent) {
      const savedEventId = sessionStorage.getItem("activeCallRoomEventId");
      if (savedEventId) {
        const savedEvent = events.find(e => e.id === savedEventId);
        if (savedEvent) {
          const savedJoinTime = sessionStorage.getItem("activeCallJoinTime");
          if (savedJoinTime) {
            setJoinTime(parseInt(savedJoinTime, 10));
          } else {
            setJoinTime(Date.now());
          }
          setCallRoomEvent(savedEvent);
          setIsCallActive(true);
          console.log("Restored active call room session:", savedEvent.title);
        }
      }
    }
  }, [events, isCallActive, callRoomEvent]);

  const getDisplayName = (u: any) => {
    if (!u) return "Colleague";
    const first = u.firstName && u.firstName !== "undefined" ? u.firstName : "";
    const last = u.lastName && u.lastName !== "undefined" ? u.lastName : "";
    const full = `${first} ${last}`.trim();
    if (full) return full;
    if (u.email) return u.email.split("@")[0];
    return "Colleague";
  };

  // Handle Event / Task Updates (Phase 4 Extension)
  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.startTime || !editingEventId) {
      alert("Please fill in the required fields.");
      return;
    }
    setIsSubmitting(true);
    try {
      const isTask = selectedEvent?.type === "task" || selectedEvent?.id?.startsWith("task-") || editingEventId.startsWith("task-");
      const cleanId = editingEventId.replace("task-", "").replace("logistics-", "");
      
      const endpoint = isTask
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tasks/${cleanId}`
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${cleanId}`;

      const payload = isTask
        ? {
            title: formData.title.replace("📋 [Task] ", ""),
            description: formData.description,
            dueDate: new Date(formData.startTime)
          }
        : formData;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsModalOpen(false);
        setIsEditing(false);
        setEditingEventId(null);
        setSelectedEvent(null);
        setFormData({
          title: "",
          description: "",
          location: "",
          startTime: "",
          endTime: "",
          isPrivate: false,
          targetRoles: [],
          targetUserIds: [],
        });
        fetchEvents(false);
      } else {
        const errorData = await res.json();
        alert(errorData.message || "Failed to update details.");
      }
    } catch (err) {
      console.error("Error updating event:", err);
      alert("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Task Status (Phase 4 Extension)
  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
    const cleanId = taskId.replace("task-", "");
    const newStatus = currentStatus === "COMPLETED" ? "PENDING" : "COMPLETED";
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tasks/${cleanId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        fetchEvents(false);
      } else {
        alert("Failed to update task status.");
      }
    } catch (err) {
      console.error("Failed to toggle task status:", err);
    }
  };

  // Handle Leave/Exit Virtual Call and Summarize Session (Phase 4 Extension)
  const handleLeaveCall = async (terminate = false, preFetchedSummaryReport: any = null) => {
    const activeRoom = callRoomEvent || selectedEvent;
    if (!activeRoom || !token) {
      setIsCallActive(false);
      setCallRoomEvent(null);
      return;
    }

    const eventId = activeRoom.id.replace("task-", "").replace("logistics-", "");
    const eventTitle = activeRoom.title;
    const finalJoinTime = joinTime || Date.now();

    try {
      // 1. Fetch final state to get all attendees
      const stateRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${eventId}/meeting-state`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      let finalAttendees: any[] = [];
      let finalSummaryReport = preFetchedSummaryReport;
      if (stateRes.ok) {
        const state = await stateRes.json();
        finalAttendees = state.allTimeAttendees || [];
        if (!finalSummaryReport && state.summaryReport) {
          finalSummaryReport = state.summaryReport;
        }
      }
      
      // Calculate my duration in call
      const durationMs = Date.now() - finalJoinTime;
      const formatTime = (ms: number) => {
        const secs = Math.floor(ms / 1000);
        const hrs = Math.floor(secs / 3600);
        const mins = Math.floor((secs % 3600) / 60);
        const leftSecs = secs % 60;
        return `${hrs > 0 ? `${hrs.toString().padStart(2, '0')}:` : ''}${mins.toString().padStart(2, '0')}:${leftSecs.toString().padStart(2, '0')}`;
      };

      // Resolve absentees: those who were invited but never showed up in finalAttendees
      const inviteeIds = activeRoom.targetUserIds || [];
      const inviteeRoles = activeRoom.targetRoles || [];
      
      const inviteesList = employees.filter(emp => {
        return inviteeIds.includes(emp.id) || inviteeRoles.includes(emp.role);
      });
      
      const absentees = inviteesList.filter(emp => {
        return !finalAttendees.some(att => att.id === emp.id);
      }).map(emp => ({
        name: `${emp.firstName} ${emp.lastName || ''}`.trim(),
        role: emp.role
      }));

      // Calculate stay duration for each attendee
      const formattedAttendees = finalAttendees.map(att => {
        const stayMs = Math.max(0, att.lastPing - att.joinedAt);
        return {
          ...att,
          duration: formatTime(stayMs)
        };
      });

      const isHostUser = currentUser?.id === activeRoom.createdBy?.id || currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
      
      // Generate and cache summary report via AI orchestrator if not provided and is Host
      if (terminate && isHostUser && !finalSummaryReport) {
        try {
          const summaryRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/meeting/${eventId}/summary`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (summaryRes.ok) {
            finalSummaryReport = await summaryRes.json();
          }
        } catch (err) {
          console.error("Failed to generate AI executive meeting summary:", err);
        }
      }

      setSummaryData({
        title: eventTitle,
        eventId: eventId,
        joinedAt: finalJoinTime,
        duration: formatTime(durationMs),
        allTimeAttendees: formattedAttendees,
        absentees: absentees,
        isHost: isHostUser,
        summaryReport: finalSummaryReport
      });

      // 2. If host wants to terminate:
      if (terminate) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${eventId}/meeting-state/terminate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        });
      }

      setShowSummary(true);
    } catch (err) {
      console.error("Failed to generate meeting summary:", err);
      alert("Failed to summarize call session.");
    } finally {
      setIsCallActive(false);
      setCallRoomEvent(null);
      
      // Fully clean up and close lingering peer connections to allow seamless re-connections later
      if (peerConnectionsRef.current) {
        Object.keys(peerConnectionsRef.current).forEach(peerId => {
          try {
            peerConnectionsRef.current[peerId].close();
          } catch (e) {
            console.warn("Failed closing peer connection on leave:", e);
          }
        });
        peerConnectionsRef.current = {};
      }
      if (peerStreamsRef.current) {
        peerStreamsRef.current = {};
      }
      setPeerStreams({});
    }
  };

  // Real-time client-side auto-translation dictionary and simulation helper
  // Real-time client-side auto-translation dictionary and simulation helper
  const translateCaption = (text: string, fromLang: string, toLang: string): string => {
    const from = (fromLang || "en-US").substring(0, 2).toLowerCase();
    const to = (toLang || "en-US").substring(0, 2).toLowerCase();
    if (from === to) return text;

    const dictionary: { [key: string]: { [lang: string]: string[] } } = {
      "how are you": {
        "en": ["how are you"],
        "ur": ["آپ کیسے ہیں", "کیسے ہو", "آپ کیسے ہو", "کیسے ہیں"],
        "ur-roman": ["aap kaise ho", "aap kaise hain", "ap kaise ho", "ap kaise hain", "kese ho", "kese hain", "aap kese ho", "aap kese hain"],
        "ru": ["как дела", "как вы", "как ты"],
        "tr": ["nasılsın", "nasılsınız"]
      },
      "i am fine": {
        "en": ["i am fine", "i'm fine", "doing good", "fine"],
        "ur": ["میں ٹھیک ہوں", "میں خیریت سے ہوں"],
        "ur-roman": ["main theek hoon", "mein theek hoon", "main theek hu", "mein theek hu", "theek hoon", "theek hu", "main khairiyat se hoon"],
        "ru": ["я в порядке", "хорошо", "все хорошо"],
        "tr": ["iyiyim", "iyi ben de"]
      },
      "what about you": {
        "en": ["what about you", "how about you", "and you"],
        "ur": ["آپ کا کیا حال ہے", "آپ سنائیں", "اور آپ"],
        "ur-roman": ["aap ka kya haal hai", "ap ka kya haal hai", "aap sunayein", "ap sunain", "aur aap", "aur ap"],
        "ru": ["как насчет тебя", "а ты", "как у тебя дела"],
        "tr": ["ya sen", "sen nasılsın"]
      },
      "thank you": {
        "en": ["thank you", "thanks", "thank you very much"],
        "ur": ["شکریہ", "بہت بہت شکریہ"],
        "ur-roman": ["shukriya", "shukria", "bohot shukriya", "bohat shukriya", "thanks"],
        "ru": ["спасибо", "большое спасибо"],
        "tr": ["teşekkür ederim", "tesekkur ederim", "sağol", "sagol"]
      },
      "goodbye": {
        "en": ["goodbye", "bye", "bye bye"],
        "ur": ["اللہ حافظ", "خدا حافظ"],
        "ur-roman": ["allah hafiz", "khuda hafiz", "bye", "bye bye"],
        "ru": ["до свидания", "пока"],
        "tr": ["güle güle", "gule gule", "hoşça kal", "hosca kal", "görüşürüz"]
      },
      "nice to meet you": {
        "en": ["nice to meet you", "pleasure meeting you", "glad to meet you"],
        "ur": ["آپ سے مل کر خوشی ہوئی", "مل کر خوشی ہوئی"],
        "ur-roman": ["ap se mil kar khushi hui", "aap se mil kar khushi hui", "mil kar khushi hui", "milkar khushi hui"],
        "ru": ["приятно познакомиться", "очень приятно"],
        "tr": ["tanıştığıma memnun oldum", "tanistigima memnun oldum", "memnun oldum"]
      },
      "where are you from": {
        "en": ["where are you from", "where do you live"],
        "ur": ["آپ کہاں سے ہیں", "آپ کہاں رہتے ہیں"],
        "ur-roman": ["ap kahan se hain", "aap kahan se hain", "ap kahan se ho", "aap kahan se ho", "ap kidhar se ho", "aap kidhar se ho"],
        "ru": ["откуда ты", "откуда вы", "где ты живешь"],
        "tr": ["nerelisin", "nerelisiniz", "nereden geliyorsun"]
      },
      "what is your name": {
        "en": ["what is your name", "your name please"],
        "ur": ["آپ کا نام کیا ہے", "آپ کا نام"],
        "ur-roman": ["apka naam kya hai", "aapka naam kya hai", "apka nam kya hai", "aapka nam kya hai", "apka kya naam hai", "aapka kya naam hai"],
        "ru": ["как тебя зовут", "как вас зовут", "ваше имя"],
        "tr": ["adın ne", "adiniz ne", "isminiz nedir"]
      },
      "who is sara": {
        "en": ["who is sara"],
        "ur": ["سارہ کون ہے", "سارہ کون ہے؟"],
        "ur-roman": ["sara kaun hai", "sara kaun he", "sara kon hai", "sara kon he"],
        "ru": ["кто такая сара", "кто сара"],
        "tr": ["sara kim", "sara kimdir"]
      },
      "what are you doing": {
        "en": ["what are you doing"],
        "ur": ["آپ کیا کر رہے ہیں", "تم کیا کر رہے ہو", "کیا کر رہے ہو"],
        "ur-roman": ["ap kya kar rahe ho", "aap kya kar rahe ho", "ap kya kar rahe hain", "aap kya kar rahe hain", "kya kar rahe ho"],
        "ru": ["что ты делаешь", "что вы делаете"],
        "tr": ["ne yapıyorsun", "ne yapiyorsun"]
      },
      "can you hear me": {
        "en": ["can you hear me", "am i audible"],
        "ur": ["کیا آپ مجھے سن سکتے ہیں", "کیا میری آواز آ رہی ہے", "میری آواز آ رہی ہے؟"],
        "ur-roman": ["kya aap mujhe sun sakte hain", "kya meri awaz aa rahi hai", "kya meri awaz aa rahi he", "meri awaz aa rahi hai", "awaz aa rahi hai"],
        "ru": ["ты меня слышишь", "вы меня слышите", "меня слышно"],
        "tr": ["beni duyabiliyor musun", "sesim geliyor mu", "duyuyor musun"]
      },
      "yes i can hear you": {
        "en": ["yes i can hear you", "i can hear you", "yes audible"],
        "ur": ["جی ہاں میں سن سکتا ہوں", "جی آواز آ رہی ہے", "میں سن سکتا ہوں"],
        "ur-roman": ["haan main sun sakta hoon", "ji awaz aa rahi hai", "haan awaz aa rahi he", "ji main sun sakta hu", "awaz aa rahi hai haan"],
        "ru": ["да я слышу тебя", "да слышно", "я слышу вас"],
        "tr": ["evet duyabiliyorum", "evet sesin geliyor", "duyuyorum"]
      },
      "how many employees do we have": {
        "en": ["how many employees do we have", "so how many employees do we have"],
        "ur": ["ہمارے پاس کتنے ملازمین ہیں", "تو ہمارے پاس کتنے ملازمین ہیں"],
        "ur-roman": ["hamare pas kitne employees hain", "hamare paas kitne employees hain", "hamare pas kitne employees he", "to hamare pas kitne employees hain", "toh hamare pas kitne employees hain", "hamare pas kitne employees hai", "hamare pas kitne mulazim hain"],
        "ru": ["сколько у нас сотрудников", "итак сколько у нас сотрудников"],
        "tr": ["kaç çalışanımız var", "peki kaç çalışanımız var"]
      },
      "who is sara in our team": {
        "en": ["who is sara in our team", "who is sara in the team"],
        "ur": ["ہماری ٹیم میں سارہ کون ہے", "ٹیم میں سارہ کون ہے"],
        "ur-roman": ["hamari team mein sara kaun hai", "hamari team me sara kaun he", "team mein sara kaun hai", "team me sara kaun he", "sara kaun hai team mein"],
        "ru": ["кто такая сара в нашей команде", "кто сара в нашей команде"],
        "tr": ["ekibimizdeki sara kim", "ekipteki sara kim"]
      },
      "do you have an employee with the name sara": {
        "en": ["do you have an employee with the name sara", "is there an employee named sara"],
        "ur": ["کیا سارہ نام کا کوئی ملازم ہے", "کیا سارہ نام کا کوئی ملازم ہے؟"],
        "ur-roman": ["kya sara naam ka koi employee hai", "kya sara naam ka koi employee he", "kya sara naam ka koi mulazim hai", "kya koi employee hai sara naam ka"],
        "ru": ["есть ли у вас сотрудник по имени сара", "у вас есть сотрудник по имени сара"],
        "tr": ["sara adında bir çalışanınız var mı", "sara adında çalışan var mı"]
      },
      "assign task to sara to verify rens property documents till sunday": {
        "en": ["assign task to sara to verify rens property documents till sunday", "assign task to sara to verify rens property documents by sunday"],
        "ur": ["اتوار تک رینس پراپرٹی کے دستاویزات کی تصدیق کے لیے سارہ کو ٹاسک تفویض کریں", "اتوار تک رینس پراپرٹی کے دستاویزات کی تصدیق کے لیے سارہ کو ٹاسک دیں"],
        "ur-roman": ["sundey tak rens property documents verify karne ke liye sara ko task assign karein", "sunday tak rens property ke documents verify karne ke liye sara ko task assign karein", "sara ko task assign karein rens property documents verify karne ke liye sunday tak"],
        "ru": ["поручить саре проверить документы на недвижимость rens до воскресенья", "нагрузить сару верификацией документов rens до воскресенья"],
        "tr": ["sara'ya pazar gününe kadar rens gayrimenkul belgelerini doğrulaması için görev ata", "sara'ya pazar gününe kadar rens gayrimenkul belgelerini doğrulamak için görev ver"]
      },
      "how many meetings we have today": {
        "en": ["how many meetings we have today", "how many meetings do we have today"],
        "ur": ["آج ہماری کتنی میٹنگز ہیں", "آج ہماری کتنی میٹنگیں ہیں"],
        "ur-roman": ["aaj hamari kitni meetings hain", "aaj hamari kitni meetings he", "aaj kitni meetings hain hamari", "aaj hamari kitni meetings hai"],
        "ru": ["сколько у нас встреч сегодня", "сколько встреч сегодня"],
        "tr": ["bugün kaç toplantımız var", "bugün kaç toplantı var"]
      },
      "any pending meetings today": {
        "en": ["any pending meetings today", "is there any pending meetings today"],
        "ur": ["کیا آج کوئی پینڈنگ میٹنگز ہیں", "کیا آج کوئی زیر التواء میٹنگز ہیں"],
        "ur-roman": ["kya aaj koi pending meetings hain", "kya aaj koi pending meetings he", "kya koi pending meeting hai aaj", "kya aaj koi pending meetings hai"],
        "ru": ["есть ли сегодня нерешенные встречи", "есть ли сегодня ожидающие встречи"],
        "tr": ["bugün bekleyen toplantı var mı", "bugün bekleyen toplantılar var mı"]
      },
      "hello": {
        "en": ["hello", "hi"],
        "ur": ["ہیلو", "اسلام علیکم", "سلام"],
        "ur-roman": ["hello", "salam", "assalam o alaikum", "aaoa"],
        "ru": ["привет", "здравствуйте"],
        "tr": ["merhaba", "selam"]
      },
      "yes": {
        "en": ["yes", "yeah"],
        "ur": ["جی ہاں", "جی", "ہاں"],
        "ur-roman": ["ji haan", "ji", "haan", "yes"],
        "ru": ["да"],
        "tr": ["evet"]
      },
      "no": {
        "en": ["no", "nope"],
        "ur": ["جی نہیں", "نہیں"],
        "ur-roman": ["ji nahi", "nahi", "no"],
        "ru": ["нет"],
        "tr": ["hayır"]
      },
      "ok": {
        "en": ["ok", "okay"],
        "ur": ["ٹھیک ہے", "اوکے"],
        "ur-roman": ["theek hai", "ok", "okay", "theek he"],
        "ru": ["ок", "хорошо"],
        "tr": ["tamam", "ok"]
      },
      "perfect": {
        "en": ["perfect", "excellent"],
        "ur": ["بہترین", "زبردست"],
        "ur-roman": ["behtareen", "zabardast", "perfect"],
        "ru": ["отлично", "прекрасно"],
        "tr": ["harika", "mükemmel"]
      },
      "employee": {
        "en": ["employee"],
        "ur": ["ملازم"],
        "ur-roman": ["employee", "mulazim"],
        "ru": ["сотрудник"],
        "tr": ["çalışan"]
      },
      "employees": {
        "en": ["employees"],
        "ur": ["ملازمین"],
        "ur-roman": ["employees", "mulazmeen", "mulazim"],
        "ru": ["сотрудники"],
        "tr": ["çalışanlar"]
      },
      "meeting": {
        "en": ["meeting"],
        "ur": ["میٹنگ"],
        "ur-roman": ["meeting"],
        "ru": ["встреча"],
        "tr": ["toplantı"]
      },
      "meetings": {
        "en": ["meetings"],
        "ur": ["میٹنگز"],
        "ur-roman": ["meetings"],
        "ru": ["встречи"],
        "tr": ["toplantılar"]
      },
      "pending": {
        "en": ["pending"],
        "ur": ["زیر التواء", "پینڈنگ"],
        "ur-roman": ["pending"],
        "ru": ["в ожидании"],
        "tr": ["beklemede"]
      },
      "sara": {
        "en": ["sara"],
        "ur": ["سارہ"],
        "ur-roman": ["sara"],
        "ru": ["сара"],
        "tr": ["sara"]
      },
      "task": {
        "en": ["task"],
        "ur": ["ٹاسک"],
        "ur-roman": ["task"],
        "ru": ["задача"],
        "tr": ["görev"]
      }
    };

    const cleanInput = text.toLowerCase().trim().replace(/[.?؟!]/g, "").trim();

    // Helper to find the English key for any text in any language
    const findEnglishKey = (inputText: string): string | null => {
      // 1. Check direct exact match with English key first
      for (const engKey of Object.keys(dictionary)) {
        if (engKey === inputText) {
          return engKey;
        }
      }

      // 2. Search all language variants inside the dictionary values
      for (const [engKey, langMap] of Object.entries(dictionary)) {
        for (const [langCode, phrases] of Object.entries(langMap)) {
          for (const phrase of phrases) {
            const cleanPhrase = phrase.toLowerCase().trim().replace(/[.?؟!]/g, "").trim();
            if (cleanPhrase === inputText) {
              return engKey;
            }
          }
        }
      }

      // 3. Substring check: if the input is a subset or contains a key phrase
      for (const [engKey, langMap] of Object.entries(dictionary)) {
        for (const [langCode, phrases] of Object.entries(langMap)) {
          for (const phrase of phrases) {
            const cleanPhrase = phrase.toLowerCase().trim().replace(/[.?؟!]/g, "").trim();
            if (cleanPhrase.length > 3 && (inputText.includes(cleanPhrase) || cleanPhrase.includes(inputText))) {
              return engKey;
            }
          }
        }
      }
      
      return null;
    };

    // 1. Try to find a matching full-sentence English key
    const engKey = findEnglishKey(cleanInput);
    if (engKey) {
      if (to === "en") {
        return dictionary[engKey]["en"][0];
      }
      if (dictionary[engKey] && dictionary[engKey][to] && dictionary[engKey][to][0]) {
        return dictionary[engKey][to][0];
      }
    }

    // 2. Word-by-word fallback omnidirectional translation
    const words = text.split(" ");
    const translatedWords = words.map(w => {
      const cleanW = w.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?؟!]/g,"").trim();
      if (!cleanW) return w;

      // Find if cleanW matches any entry in the dictionary (keys or values)
      for (const [engKey, langMap] of Object.entries(dictionary)) {
        // If the word itself is the English key (e.g., "employee")
        if (engKey === cleanW) {
          if (to === "en") return engKey;
          if (langMap[to] && langMap[to][0]) return langMap[to][0];
          if (langMap["ur"] && langMap["ur"][0]) return langMap["ur"][0]; // default
        }
        
        // Check all other language entries for this word
        for (const [langCode, phrases] of Object.entries(langMap)) {
          for (const phrase of phrases) {
            const cleanPhrase = phrase.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?؟!]/g,"").trim();
            if (cleanPhrase === cleanW) {
              if (to === "en") return engKey;
              if (langMap[to] && langMap[to][0]) return langMap[to][0];
            }
          }
        }
      }

      return w;
    });

    return translatedWords.join(" ");
  };

  // Continuous Speech Recognition for Live Meeting Subtitles / Captions
  useEffect(() => {
    if (typeof window === "undefined" || !isCallActive || !isCaptionsOn || isMicMuted || !callRoomEvent || !token) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("Browser SpeechRecognition is not supported.");
      return;
    }

    let recognition: any = null;
    let isStoppedIntentionally = false;

    const startRecognition = () => {
      try {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = spokenLang;

        recognition.onstart = () => {
          console.log(`🎙️ Speech recognition active for spoken language: ${spokenLang}`);
        };

        recognition.onend = () => {
          if (!isStoppedIntentionally && isCallActive && isCaptionsOn && !isMicMuted) {
            try {
              recognition.start();
            } catch (err) {
              console.warn("Speech recognition restart failed:", err);
            }
          }
        };

        recognition.onerror = (e: any) => {
          console.warn("Speech recognition error in call room:", e.error);
        };

        recognition.onresult = async (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript && transcript.trim() && callRoomEvent && token) {
            console.log("🗣️ Call speech detected:", transcript);
            try {
              await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${callRoomEvent.id}/meeting-state/caption`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  senderId: currentUser?.id || "anonymous",
                  senderName: getDisplayName(currentUser),
                  role: currentUser?.role || "AGENT",
                  text: transcript.trim(),
                  language: spokenLang
                })
              });
            } catch (err) {
              console.error("Failed to post live caption:", err);
            }
          }
        };

        recognition.start();
      } catch (err) {
        console.error("Speech recognition startup error in call room:", err);
      }
    };

    startRecognition();

    return () => {
      isStoppedIntentionally = true;
      if (recognition) {
        try {
          recognition.abort();
        } catch (e) {}
      }
    };
  }, [isCallActive, isCaptionsOn, spokenLang, isMicMuted, callRoomEvent, token, currentUser]);

  // Webcam & P2P Broadcast Channel Sync Lifecycle
  // Webcam, REST Signaling & WebRTC Cockpit Sync Lifecycle
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    let pollInterval: any = null;
    let mediaInitComplete = false;

    if (!myPeerIdRef.current) {
      myPeerIdRef.current = currentUser?.id || `peer-${Math.random().toString(36).substr(2, 9)}`;
    }
    const myPeerId = myPeerIdRef.current;

    const initiatePC = (peerId: string, streamObj: MediaStream | null) => {
      if (peerConnectionsRef.current[peerId]) {
        return peerConnectionsRef.current[peerId];
      }
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      peerConnectionsRef.current[peerId] = pc;

      // Add local stream tracks to PC
      if (streamObj) {
        streamObj.getTracks().forEach(track => {
          try {
            pc.addTrack(track, streamObj);
          } catch (e) {
            console.warn("Failed to add track inside initiatePC:", e);
          }
        });
      } else {
        try {
          pc.addTransceiver("audio", { direction: "recvonly" });
          pc.addTransceiver("video", { direction: "recvonly" });
        } catch (e) {
          console.warn("addTransceiver failed:", e);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && token && callRoomEvent) {
          fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${callRoomEvent.id}/meeting-state/signal`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              type: "webrtc-ice",
              senderId: myPeerId,
              targetId: peerId,
              payload: event.candidate
            })
          }).catch(err => console.error("Failed to send ICE candidate:", err));
        }
      };

      pc.ontrack = (event) => {
        console.log(`🎥 Received remote track from peer ${peerId}:`, event.track.kind);
        
        if (!peerStreamsRef.current[peerId]) {
          peerStreamsRef.current[peerId] = new MediaStream();
        }
        
        const stream = peerStreamsRef.current[peerId];
        // Ensure track is not already present in remote stream before adding
        if (!stream.getTracks().some(t => t.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        
        setPeerStreams(prev => ({
          ...prev,
          [peerId]: stream
        }));
      };

      return pc;
    };

    if (isCallActive && callRoomEvent && token) {
      // 1. Request Browser permissions for Mic & Camera
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          activeStream = stream;
          setLocalStream(stream);
          
          // Apply initial mute states to stream tracks
          stream.getVideoTracks().forEach(track => { track.enabled = !isCamMuted; });
          stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });

          // If peer connections are already active, add tracks to them
          Object.values(peerConnectionsRef.current).forEach(pc => {
            stream.getTracks().forEach(track => {
              try {
                const alreadyAdded = pc.getSenders().some(sender => sender.track === track);
                if (!alreadyAdded) {
                  pc.addTrack(track, stream);
                }
              } catch (e) {
                console.warn("Failed to add track inside getUserMedia:", e);
              }
            });
          });
          
          mediaInitComplete = true;
        })
        .catch(err => {
          console.error("Camera/Mic access rejected or unavailable:", err);
          mediaInitComplete = true; // allow receiving streams even if local media fails
        });

      // 2. Setup periodic polling loop (every 1.5 seconds)
      const myName = getDisplayName(currentUser);
      
      const pollFunction = async () => {
        if (!mediaInitComplete) {
          return; // Wait until media device check completes to avoid negotiation glare / race conditions
        }
        try {
          // A. Ping our presence
          await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${callRoomEvent.id}/meeting-state/ping`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              id: myPeerId,
              name: myName,
              role: currentUser?.role || "AGENT",
              isMicMuted,
              isCamMuted
            })
          });

          // B. Get active participants and chat messages
          const stateRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${callRoomEvent.id}/meeting-state`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (stateRes.ok) {
            const state = await stateRes.json();
            
            if (state.isTerminated) {
              alert("⚠️ This meeting has been closed/terminated by the host.");
              handleLeaveCall(false, state.summaryReport);
              return;
            }

            // Update live captions state
            if (state.captions) {
              setActiveCaptions(state.captions);
            }

            // Set dynamic peers list (excluding ourselves)
            const peers = state.participants.filter((p: any) => p.id !== myPeerId);
            setActivePeers(peers);

            // Trigger offers for new peers that we don't have peer connections for yet
            peers.forEach((peer: any) => {
              // WebRTC Glare Prevention: Only the alphabetically smaller peer ID acts as initiator
              const isInitiator = myPeerId < peer.id;
              
              if (isInitiator && !peerConnectionsRef.current[peer.id]) {
                const pc = initiatePC(peer.id, activeStream);
                pc.createOffer()
                  .then(offer => pc.setLocalDescription(offer))
                  .then(() => {
                    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${callRoomEvent.id}/meeting-state/signal`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                      },
                      body: JSON.stringify({
                        type: "webrtc-offer",
                        senderId: myPeerId,
                        targetId: peer.id,
                        payload: pc.localDescription
                      })
                    });
                  })
                  .catch(err => console.error("Failed to generate WebRTC offer:", err));
              }
            });

            // Set chat logs
            setMeetingMessages(state.messages);
          }

          // C. Get incoming WebRTC signals targeting us
          const signalsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${callRoomEvent.id}/meeting-state/signals/${myPeerId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (signalsRes.ok) {
            const signals = await signalsRes.json();
            for (const sig of signals) {
              if (sig.type === "webrtc-offer") {
                const pc = initiatePC(sig.senderId, activeStream) as any;
                // If collision occurs (state is not stable), polite peer rolls back description
                if (pc.signalingState !== "stable") {
                  await pc.setLocalDescription({ type: "rollback" });
                }
                await pc.setRemoteDescription(new RTCSessionDescription(sig.payload));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${callRoomEvent.id}/meeting-state/signal`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                  },
                  body: JSON.stringify({
                    type: "webrtc-answer",
                    senderId: myPeerId,
                    targetId: sig.senderId,
                    payload: pc.localDescription
                  })
                });

                // Add queued ICE candidates
                if (pc.iceQueue) {
                  for (const candidate of pc.iceQueue) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e: any) => console.error("Error adding queued ICE candidate:", e));
                  }
                  pc.iceQueue = [];
                }
              } else if (sig.type === "webrtc-answer") {
                const pc = peerConnectionsRef.current[sig.senderId] as any;
                // WebRTC state check: Only apply remote answer SDP if we are actively expecting it (have-local-offer)
                if (pc && pc.signalingState === "have-local-offer") {
                  await pc.setRemoteDescription(new RTCSessionDescription(sig.payload));

                  // Add queued ICE candidates
                  if (pc.iceQueue) {
                    for (const candidate of pc.iceQueue) {
                      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e: any) => console.error("Error adding queued ICE candidate:", e));
                    }
                    pc.iceQueue = [];
                  }
                }
              } else if (sig.type === "webrtc-ice") {
                const pc = peerConnectionsRef.current[sig.senderId] as any;
                if (pc) {
                  // Only add ICE candidate if remote description is set (RTCPeerConnection requirement)
                  if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(sig.payload)).catch((e: any) => console.error("Error adding ICE candidate:", e));
                  } else {
                    pc.iceQueue = pc.iceQueue || [];
                    pc.iceQueue.push(sig.payload);
                  }
                }
              }
            }
          }

        } catch (error) {
          console.error("Error polling call signaling state:", error);
        }
      };

      // Run immediately
      pollFunction();
      // Setup interval
      pollInterval = setInterval(pollFunction, 400);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      
      if (activeStream) {
        activeStream.getTracks().forEach(track => {
          track.stop();
        });
      }
      setLocalStream(null);
      setActivePeers([]);
      setPeerStreams({});

      // Close WebRTC peer connections
      Object.values(peerConnectionsRef.current).forEach(pc => {
        try {
          pc.close();
        } catch (e) {
          console.warn("Failed to close peer connection on unmount:", e);
        }
      });
      peerConnectionsRef.current = {};
      peerStreamsRef.current = {};
    };
  }, [isCallActive, callRoomEvent, currentUser]);

  // Bind local webcam stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCallActive]);

  // Toggle Camera tracks & broadcast status
  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isCamMuted;
      });
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "status",
          senderId: currentUser?.id || "anonymous",
          isMicMuted,
          isCamMuted
        });
      }
    }
  }, [isCamMuted, localStream, currentUser, isMicMuted]);

  // Toggle Mic tracks & broadcast status
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMicMuted;
      });
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "status",
          senderId: currentUser?.id || "anonymous",
          isMicMuted,
          isCamMuted
        });
      }
    }
  }, [isMicMuted, localStream, currentUser, isCamMuted]);

  // API Call: Fetch all events
  const fetchEvents = async (showLoading = false) => {
    if (!token) return;
    if (showLoading) setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // API Call: Fetch employees (for invitees dropdown)
  const fetchEmployees = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data);
      }
    } catch (err) {
      console.error("Failed to fetch employees list:", err);
    }
  };

  useEffect(() => {
    fetchEvents(true);
    fetchEmployees();
  }, [token]);

  // Real-time synchronization (every 3 seconds)
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetchEvents(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [token]);

  // Dynamic drawer meeting state fetching & background polling
  useEffect(() => {
    let intervalId: any = null;
    
    if (isDrawerOpen && selectedEvent && selectedEvent.type === "meeting") {
      setDrawerMeetingState(null);
      setIsFetchingDrawerSummary(false);
      
      const fetchMeetingState = async () => {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${selectedEvent.id}/meeting-state`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setDrawerMeetingState(data);
          }
        } catch (err) {
          console.error("Failed to fetch meeting state for drawer:", err);
        }
      };
      
      fetchMeetingState();
    } else {
      setDrawerMeetingState(null);
      setIsFetchingDrawerSummary(false);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isDrawerOpen, selectedEvent, token]);

  const handleOpenDrawerSummary = () => {
    if (!selectedEvent || !drawerMeetingState) return;
    
    const finalAttendees = drawerMeetingState.allTimeAttendees || [];
    const inviteeIds = selectedEvent.targetUserIds || [];
    const inviteeRoles = selectedEvent.targetRoles || [];
    
    const inviteesList = employees.filter((emp: any) => {
      return inviteeIds.includes(emp.id) || inviteeRoles.includes(emp.role);
    });
    
    const absentees = inviteesList.filter((emp: any) => {
      return !finalAttendees.some((att: any) => att.id === emp.id);
    }).map((emp: any) => ({
      name: `${emp.firstName} ${emp.lastName || ''}`.trim(),
      role: emp.role
    }));

    const formatTimeHelper = (ms: number) => {
      const secs = Math.floor(ms / 1000);
      const hrs = Math.floor(secs / 3600);
      const mins = Math.floor((secs % 3600) / 60);
      const leftSecs = secs % 60;
      return `${hrs > 0 ? `${hrs.toString().padStart(2, '0')}:` : ''}${mins.toString().padStart(2, '0')}:${leftSecs.toString().padStart(2, '0')}`;
    };

    const formattedAttendees = finalAttendees.map((att: any) => {
      const stayMs = Math.max(0, att.lastPing - att.joinedAt);
      return {
        ...att,
        duration: formatTimeHelper(stayMs)
      };
    });

    setSummaryData({
      title: selectedEvent.title,
      eventId: selectedEvent.id,
      joinedAt: new Date(selectedEvent.startTime).getTime(),
      duration: "Meeting Completed",
      allTimeAttendees: formattedAttendees,
      absentees: absentees,
      isHost: currentUser?.id === selectedEvent.createdBy?.id || currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN",
      summaryReport: drawerMeetingState.summaryReport
    });
    setShowSummary(true);
  };

  const handleTriggerSummaryFromDrawer = async () => {
    if (!selectedEvent) return;
    setIsFetchingDrawerSummary(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/ai/meeting/${selectedEvent.id}/summary`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        if (attempts > 30) {
          clearInterval(interval);
          setIsFetchingDrawerSummary(false);
          return;
        }
        
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${selectedEvent.id}/meeting-state`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.summaryReport) {
              setDrawerMeetingState(data);
              clearInterval(interval);
              setIsFetchingDrawerSummary(false);
            }
          }
        } catch (err) {
          console.error("Error polling meeting state:", err);
        }
      }, 5000);
    } catch (err) {
      console.error("Failed to trigger background summary:", err);
      setIsFetchingDrawerSummary(false);
    }
  };

  // Calculate calendar grid days
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of the month
    const firstDayIndex = new Date(year, month, 1).getDay();
    
    // Last day of the month
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // Days from previous month to fill the first row
    const prevMonthDays = new Date(year, month, 0).getDate();
    const fillPrevDays = [];
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      fillPrevDays.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }
    
    // Current month days
    const currentDays = [];
    for (let i = 1; i <= totalDays; i++) {
      currentDays.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }
    
    // Days from next month to fill the grid (35 or 42 grid blocks)
    const totalGridBlocks = 42; // Always render a clean 6-row layout
    const fillNextDaysCount = totalGridBlocks - (fillPrevDays.length + currentDays.length);
    const fillNextDays = [];
    for (let i = 1; i <= fillNextDaysCount; i++) {
      fillNextDays.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }
    
    return [...fillPrevDays, ...currentDays, ...fillNextDays];
  };

  // Navigations
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Filter events by date
  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventStart = new Date(event.startTime);
      return (
        eventStart.getFullYear() === date.getFullYear() &&
        eventStart.getMonth() === date.getMonth() &&
        eventStart.getDate() === date.getDate()
      );
    });
  };

  // Handle Event Creation
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.startTime || !formData.endTime) {
      alert("Please fill in the required fields (Title, Start Time, and End Time).");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFormData({
          title: "",
          description: "",
          location: "",
          startTime: "",
          endTime: "",
          isPrivate: false,
          targetRoles: [],
          targetUserIds: [],
        });
        fetchEvents(false);
      } else {
        const errorData = await res.json();
        alert(errorData.message || "Failed to schedule calendar event.");
      }
    } catch (err) {
      console.error("Error creating event:", err);
      alert("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Event Deletion
  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to cancel/delete this event? This will also remove notifications associated with it.")) return;
    try {
      const actualId = eventId.startsWith("task-") 
        ? eventId.replace("task-", "") 
        : eventId.startsWith("logistics-") 
          ? eventId.replace("logistics-", "") 
          : eventId;
      
      const endpoint = eventId.startsWith("task-")
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tasks/${actualId}`
        : eventId.startsWith("logistics-")
          ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/logistics/schedules/${actualId}` // wait, deleting logistics might be restricted
          : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${actualId}`;

      const method = "DELETE";

      const res = await fetch(endpoint, {
        method,
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setIsDrawerOpen(false);
        setSelectedEvent(null);
        fetchEvents(false);
      } else {
        const errData = await res.json();
        alert(errData.message || "Could not delete/cancel the event.");
      }
    } catch (err) {
      console.error("Error deleting event:", err);
      alert("Failed to delete event.");
    }
  };

  // End of operational handlers

  // Handle multi-select role checkmarks
  const toggleRoleSelect = (roleName: string) => {
    setFormData(prev => {
      const exists = prev.targetRoles.includes(roleName);
      return {
        ...prev,
        targetRoles: exists 
          ? prev.targetRoles.filter(r => r !== roleName)
          : [...prev.targetRoles, roleName]
      };
    });
  };

  // Handle multi-select colleague IDs
  const toggleColleagueSelect = (userId: string) => {
    setFormData(prev => {
      const exists = prev.targetUserIds.includes(userId);
      return {
        ...prev,
        targetUserIds: exists
          ? prev.targetUserIds.filter(id => id !== userId)
          : [...prev.targetUserIds, userId]
      };
    });
  };

  // Render Grid Headers
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="p-6 space-y-6 min-h-screen relative overflow-hidden bg-background">
      {/* Background Neon Blur Pills */}
      <div className="absolute top-[10%] right-[10%] w-[350px] h-[350px] bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
      <div className="absolute bottom-[20%] left-[5%] w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Top Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-3xl font-black text-white uppercase tracking-wider flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-primary glow-primary" />
            Calendar Terminal
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Realty Cockpit: Unified view of Meetings, Private realtor viewings, Tasks, and Fleet site transits.
          </p>
        </div>

        <div className="flex gap-2.5">
          <button 
            onClick={() => setIsHistoryOpen(true)}
            className="px-5 py-3 border border-border/60 hover:bg-secondary text-muted-foreground hover:text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all duration-300 hover:scale-[1.02] flex items-center gap-2 cursor-pointer"
          >
            <History className="w-4 h-4" />
            Call History
          </button>
          <button 
            onClick={() => {
              // Set default times to today at next hour
              const now = new Date();
              now.setMinutes(0, 0, 0);
              const startStr = new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);
              const endStr = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
              setFormData({
                title: "",
                description: "",
                location: "",
                startTime: startStr,
                endTime: endStr,
                isPrivate: false,
                targetRoles: [],
                targetUserIds: [],
              });
              setIsModalOpen(true);
            }}
            className="px-5 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl text-xs uppercase tracking-widest glow-primary transition-all duration-300 hover:scale-[1.02] flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Schedule Event
          </button>
        </div>
      </div>

      {/* View Switcher Tabs (Phase 4 Extension) */}
      <div className="flex p-1 bg-slate-900/60 border border-white/5 rounded-2xl w-fit backdrop-blur-md">
        <button
          onClick={() => setActiveTab("calendar")}
          className={`px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider font-extrabold transition-all duration-300 flex items-center gap-2 cursor-pointer ${
            activeTab === "calendar"
              ? "bg-primary text-white shadow-lg glow-primary"
              : "text-muted-foreground hover:text-white"
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          Calendar Grid
        </button>
        <button
          onClick={() => setActiveTab("schedules")}
          className={`px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider font-extrabold transition-all duration-300 flex items-center gap-2 cursor-pointer ${
            activeTab === "schedules"
              ? "bg-primary text-white shadow-lg glow-primary"
              : "text-muted-foreground hover:text-white"
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Manage Schedules
        </button>
      </div>

      {activeTab === "calendar" && (
        <>
          {/* Calendar Controller (Today, Prev, Next Month) */}
          <div className="flex flex-col sm:flex-row justify-between items-center bg-card/45 backdrop-blur-xl border border-white/5 rounded-2xl p-4 gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrevMonth}
                className="p-2 border border-border/60 hover:bg-secondary rounded-xl text-muted-foreground hover:text-white transition-all"
                title="Previous Month"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={handleToday}
                className="px-4 py-2 border border-border/60 hover:bg-secondary rounded-xl text-xs uppercase tracking-widest font-black text-muted-foreground hover:text-white transition-all"
              >
                Today
              </button>
              <button 
                onClick={handleNextMonth}
                className="p-2 border border-border/60 hover:bg-secondary rounded-xl text-muted-foreground hover:text-white transition-all"
                title="Next Month"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <h2 className="text-xl font-black uppercase text-white tracking-widest">
              {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>

            {/* Legend Indicators */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-full">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                Meetings (Corporate)
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                Private Schedules
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>
                Due Tasks
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-full">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"></div>
                Logistics Transits
              </div>
            </div>
          </div>

          {/* Main Grid View */}
          {isLoading ? (
            <div className="min-h-[50vh] flex flex-col items-center justify-center bg-card/20 border border-white/5 rounded-3xl gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
              <p className="text-xs uppercase tracking-widest font-black text-primary/70">Syncing database events...</p>
            </div>
          ) : (
            <div className="bg-card/45 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
              {/* Weekdays Header Row */}
              <div className="grid grid-cols-7 border-b border-border/40 text-center py-3 bg-secondary/30">
                {WEEKDAYS.map(day => (
                  <div key={day} className="text-xs font-black uppercase text-muted-foreground tracking-widest">{day}</div>
                ))}
              </div>

              {/* Grid Cells */}
              <div className="grid grid-cols-7 grid-rows-6 auto-rows-fr divide-x divide-y divide-border/20 border-t border-border/20">
                {getDaysInMonth().map(({ date, isCurrentMonth }, idx) => {
                  const dayEvents = getEventsForDate(date);
                  const isToday = new Date().toDateString() === date.toDateString();

                  return (
                    <div 
                      key={idx} 
                      className={`min-h-[120px] p-2 flex flex-col justify-between transition-all duration-300 hover:bg-secondary/20 relative ${
                        isCurrentMonth ? "bg-card/5" : "bg-card/2 opacity-30 pointer-events-none"
                      } ${isToday && "bg-primary/5 border border-primary/20 shadow-[inset_0_0_15px_rgba(30,144,255,0.05)]"}`}
                    >
                      {/* Day Number */}
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-xs font-black px-2 py-1 rounded-md ${
                          isToday 
                            ? "bg-primary text-white glow-primary" 
                            : isCurrentMonth ? "text-white" : "text-gray-500"
                        }`}>
                          {date.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] bg-secondary/80 text-muted-foreground px-1.5 py-0.5 rounded-full font-bold">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      {/* Day Event Pills List */}
                      <div className="flex-1 overflow-y-auto space-y-1 max-h-[80px] scrollbar-thin">
                        {dayEvents.slice(0, 3).map(event => {
                          const colorClass = 
                            event.color === "green" 
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" 
                              : event.color === "yellow"
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                                : event.color === "purple"
                                  ? "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
                                  : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20";

                          return (
                            <div
                              key={event.id}
                              onClick={() => {
                                setSelectedEvent(event);
                                setIsDrawerOpen(true);
                              }}
                              className={`text-[10px] font-semibold px-2 py-1 border rounded-lg truncate cursor-pointer transition-all duration-200 select-none ${colorClass}`}
                              title={event.title}
                            >
                              {event.isPrivate ? "🔒 " : ""}
                              {event.title}
                            </div>
                          );
                        })}
                        {dayEvents.slice(0, 3).length === 0 && (
                          <div className="h-full flex items-center justify-center text-[9px] text-muted-foreground/35 select-none font-bold uppercase tracking-wider py-2">
                            No Schedules
                          </div>
                        )}
                        {dayEvents.length > 3 && (
                          <div className="text-[9px] text-center text-muted-foreground font-black uppercase py-0.5 tracking-wider bg-secondary/30 rounded-md">
                            + {dayEvents.length - 3} More
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "schedules" && (
        <div className="space-y-6 animate-fade-in">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-4 bg-card/45 backdrop-blur-xl border border-white/5 rounded-2xl p-4 justify-between items-center">
            <div className="w-full sm:max-w-xs relative">
              <input 
                type="text" 
                placeholder="Search events or tasks..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-secondary/40 border border-border/60 focus:border-primary text-sm pl-4 pr-10 py-2.5 rounded-xl text-white outline-none transition-all placeholder:text-muted-foreground/50"
              />
            </div>
            
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground items-center">
              <span className="font-extrabold uppercase tracking-wider text-[10px]">Filter Legend:</span>
              <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2.5 py-1 rounded-full uppercase text-[9px] font-black">Meetings</span>
              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full uppercase text-[9px] font-black">Private</span>
              <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full uppercase text-[9px] font-black">Tasks</span>
              <span className="bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2.5 py-1 rounded-full uppercase text-[9px] font-black">Logistics</span>
            </div>
          </div>

          {/* List layout */}
          <div className="grid grid-cols-1 gap-4">
            {events
              .filter(e => {
                const matchSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
                  (e.location && e.location.toLowerCase().includes(searchQuery.toLowerCase()));
                return matchSearch;
              })
              .map(event => {
                const isTask = event.type === "task";
                const isMeeting = event.type === "meeting";
                const isPrivate = event.type === "private";
                const isLogistics = event.type === "logistics";

                let badgeColor = "bg-blue-500/10 border-blue-500/20 text-blue-400";
                let typeIcon = <Users className="w-4 h-4 text-blue-400" />;
                if (isPrivate) {
                  badgeColor = "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                  typeIcon = <Lock className="w-4 h-4 text-emerald-400" />;
                } else if (isTask) {
                  badgeColor = "bg-amber-500/10 border-amber-500/20 text-amber-400";
                  typeIcon = <CheckCircle className="w-4 h-4 text-amber-400" />;
                } else if (isLogistics) {
                  badgeColor = "bg-purple-500/10 border-purple-500/20 text-purple-400";
                  typeIcon = <Briefcase className="w-4 h-4 text-purple-400" />;
                }

                const isCreator = event.createdBy?.id === currentUser?.id || currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";

                return (
                  <div 
                    key={event.id}
                    className="glass border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all duration-300 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/25 backdrop-blur-xl"
                  >
                    {/* Event Metadata (Left Side) */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      {/* Checkbox if Task */}
                      {isTask ? (
                        <input 
                          type="checkbox"
                          checked={event.metadata?.status === "COMPLETED"}
                          onChange={() => toggleTaskStatus(event.id, event.metadata?.status || "PENDING")}
                          className="w-5 h-5 accent-amber-500 mt-1 cursor-pointer hover:scale-110 transition-all shrink-0"
                          title="Toggle Task Status"
                        />
                      ) : (
                        <div className={`p-3 rounded-xl border ${badgeColor.split(" ")[0]} border-white/10 shrink-0`}>
                          {typeIcon}
                        </div>
                      )}

                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={`text-base font-extrabold text-white truncate ${event.metadata?.status === "COMPLETED" && "line-through opacity-50"}`}>
                            {event.title}
                          </h3>
                          <span className={`text-[9px] font-black uppercase tracking-wider border px-2.5 py-0.5 rounded-full ${badgeColor}`}>
                            {event.type}
                          </span>
                          {isTask && (
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              event.metadata?.status === "COMPLETED"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-red-500/10 border-red-500/20 text-red-400"
                            }`}>
                              {event.metadata?.status || "PENDING"}
                            </span>
                          )}
                        </div>

                        {event.description && (
                          <p className="text-xs text-gray-400 line-clamp-2 max-w-xl">
                            {event.description}
                          </p>
                        )}

                        {/* Timing and Location */}
                        <div className="flex flex-wrap gap-y-1.5 gap-x-4 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            {new Date(event.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1.5 truncate max-w-[200px]">
                              <MapPin className="w-3.5 h-3.5 text-primary" />
                              {event.location.replace("VIRTUAL: ", "")}
                            </span>
                          )}
                          {event.createdBy && (
                            <span className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-primary" />
                              Host: {event.createdBy.firstName} ({event.createdBy.role})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Panel (Right Side) */}
                    <div className="flex gap-2 w-full md:w-auto justify-end">
                      {event.location?.startsWith("VIRTUAL:") && !event.metadata?.status && (
                        <button
                          onClick={async () => {
                            const cleanId = event.id.replace("task-", "").replace("logistics-", "");
                            try {
                              const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${cleanId}/meeting-state`, {
                                headers: { Authorization: `Bearer ${token}` }
                              });
                              if (res.ok) {
                                const state = await res.json();
                                if (state.isTerminated) {
                                  alert("❌ This meeting room has been closed permanently by the host.");
                                  return;
                                }
                              }
                            } catch (err) {
                              console.error("Failed to check room status:", err);
                            }

                            setJoinTime(Date.now());
                            setCallRoomEvent(event);
                            setIsCallActive(true);
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-extrabold rounded-xl text-[10px] uppercase tracking-widest shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer animate-pulse"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Join Call
                        </button>
                      )}

                      {isCreator && !isLogistics && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedEvent(event);
                              const cleanId = event.id.replace("task-", "").replace("logistics-", "");
                              setEditingEventId(cleanId);
                              setIsEditing(true);
                              setFormData({
                                title: event.title.replace("📋 [Task] ", "").replace("🚚 [Logistics] Site Transit", ""),
                                description: event.description || "",
                                location: event.location || "",
                                startTime: new Date(event.startTime).toISOString().slice(0, 16),
                                endTime: event.endTime ? new Date(event.endTime).toISOString().slice(0, 16) : new Date(event.startTime).toISOString().slice(0, 16),
                                isPrivate: event.isPrivate,
                                targetRoles: event.targetRoles || [],
                                targetUserIds: event.targetUserIds || [],
                              });
                              setIsModalOpen(true);
                            }}
                            className="px-3.5 py-2 bg-secondary border border-border hover:border-white/20 text-[10px] font-black uppercase tracking-wider rounded-xl text-gray-300 hover:text-white transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            className="p-2 border border-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded-xl transition-all"
                            title="Delete Schedule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

            {events.length === 0 && (
              <div className="min-h-[250px] flex flex-col items-center justify-center bg-card/20 border border-white/5 rounded-3xl gap-2.5">
                <CalendarIcon className="w-10 h-10 text-muted-foreground/45" />
                <p className="text-xs uppercase tracking-widest font-black text-muted-foreground">No scheduled items found in the organization.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unified Side-Drawer details */}
      {isDrawerOpen && selectedEvent && (
        <div className="fixed inset-y-0 right-0 w-[420px] bg-card/95 backdrop-blur-2xl border-l border-border/80 shadow-2xl z-50 p-6 flex flex-col justify-between animate-slide-in">
          {/* Header */}
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-border/40 pb-4">
              <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${
                selectedEvent.color === "green" 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : selectedEvent.color === "yellow"
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : selectedEvent.color === "purple"
                      ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                      : "bg-blue-500/10 border-blue-500/20 text-blue-400"
              }`}>
                {selectedEvent.type}
              </span>
              <button 
                onClick={() => {
                  setIsDrawerOpen(false);
                  setSelectedEvent(null);
                }}
                className="text-muted-foreground hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">{selectedEvent.title}</h3>
              <div className="flex flex-wrap gap-2">
                {selectedEvent.isPrivate ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/5 px-2.5 py-1.5 rounded-lg border border-emerald-500/10 w-fit">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Private Schedule</span>
                  </div>
                ) : (
                  selectedEvent.type === "meeting" && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/5 px-2.5 py-1.5 rounded-lg border border-blue-500/10 w-fit">
                      <Globe className="w-3.5 h-3.5" />
                      <span>Broadcast Meeting</span>
                    </div>
                  )
                )}
                {selectedEvent.location?.startsWith("VIRTUAL:") && (
                  <div className="flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-500/10 px-2.5 py-1.5 rounded-lg border border-cyan-500/20 w-fit animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></span>
                    <span className="font-extrabold uppercase text-[10px] tracking-wider">RENS Virtual Call Active</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/20 text-sm text-gray-300">
              {/* Start & End Times */}
              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Date & Time</p>
                  <p className="font-bold text-white mt-0.5">
                    {new Date(selectedEvent.startTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  {selectedEvent.endTime && selectedEvent.startTime !== selectedEvent.endTime && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      to {new Date(selectedEvent.endTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </div>
              </div>

              {/* Location */}
              {selectedEvent.location && (
                selectedEvent.location.startsWith("VIRTUAL:") ? (
                  <div className="space-y-3.5 border-t border-border/20 pt-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="w-full overflow-hidden">
                        <p className="text-xs text-muted-foreground">Virtual Room Link</p>
                        <p className="font-extrabold text-cyan-400 text-xs mt-0.5 break-all select-all">
                          {selectedEvent.location.replace("VIRTUAL: ", "").replace("VIRTUAL:", "")}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const cleanId = selectedEvent.id.replace("task-", "").replace("logistics-", "");
                        try {
                          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${cleanId}/meeting-state`, {
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          if (res.ok) {
                            const state = await res.json();
                            if (state.isTerminated) {
                              alert("❌ This meeting room has been closed permanently by the host.");
                              return;
                            }
                          }
                        } catch (err) {
                          console.error("Failed to check room status:", err);
                        }

                        setJoinTime(Date.now());
                        setCallRoomEvent(selectedEvent);
                        setIsCallActive(true);
                        setIsDrawerOpen(false);
                      }}
                      className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-extrabold rounded-xl text-xs uppercase tracking-widest shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Video className="w-4.5 h-4.5" />
                      Join Video Call Room
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Location Coordinates</p>
                      <p className="font-bold text-white mt-0.5">{selectedEvent.location}</p>
                    </div>
                  </div>
                )
              )}

              {/* Description */}
              {selectedEvent.description && (
                <div className="flex items-start gap-3">
                  <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <div className="w-full">
                    <p className="text-xs text-muted-foreground">Description Details</p>
                    <p className="text-xs text-gray-400 bg-secondary/30 border border-border/40 p-3 rounded-xl mt-1.5 whitespace-pre-wrap leading-relaxed">
                      {selectedEvent.description}
                    </p>
                  </div>
                </div>
              )}

              {/* Creators Info */}
              {selectedEvent.createdBy && (
                <div className="flex items-start gap-3 border-t border-border/20 pt-4">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-black uppercase flex-shrink-0 mt-0.5">
                    {selectedEvent.createdBy.firstName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scheduled / Hosted By</p>
                    <p className="font-bold text-white mt-0.5">
                      {selectedEvent.createdBy.firstName} {selectedEvent.createdBy.lastName || ''}
                    </p>
                    <p className="text-[10px] text-primary/70 uppercase tracking-widest font-black mt-0.5">
                      {selectedEvent.createdBy.role}
                    </p>
                  </div>
                </div>
              )}

              {/* Targets / Invitees Clearance inside broadcast */}
              {!selectedEvent.isPrivate && selectedEvent.type === "meeting" && (
                <div className="space-y-2 border-t border-border/20 pt-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="w-4 h-4 text-primary" />
                    <span>Target Invitees List</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedEvent.targetRoles.map(role => (
                      <span key={role} className="text-[9px] font-black tracking-wider uppercase bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full">
                        💼 {role}
                      </span>
                    ))}
                    {selectedEvent.targetUserIds.map(userId => {
                      const emp = employees.find(e => e.id === userId);
                      const name = emp ? `${emp.firstName} ${emp.lastName || ''}`.trim() : `ID: ${userId.slice(0, 8)}...`;
                      return (
                        <span key={userId} className="text-[9px] font-semibold bg-secondary border border-border text-gray-300 px-2 py-0.5 rounded-full">
                          👤 {name}
                        </span>
                      );
                    })}
                    {selectedEvent.targetRoles.length === 0 && selectedEvent.targetUserIds.length === 0 && (
                      <span className="text-[10px] text-muted-foreground italic">No specific invitees set (global visibility).</span>
                    )}
                  </div>
                </div>
              )}

              {/* AI Summary Sidebar Drawer Integration */}
              {selectedEvent.type === "meeting" && drawerMeetingState && (
                <div className="mt-4 p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/10 space-y-3 shadow-[0_0_20px_rgba(6,182,212,0.02)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">AI Cognitive Summary</span>
                    </div>
                    {drawerMeetingState.summaryReport ? (
                      <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Ready
                      </span>
                    ) : isFetchingDrawerSummary ? (
                      <span className="text-[9px] font-black uppercase text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 animate-pulse">
                        Generating...
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                        Not Generated
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Analyze the chronological conversation transcripts of this conference. Synthesize action items, agenda themes, and role contributions.
                  </p>

                  {drawerMeetingState.summaryReport ? (
                    <button
                      onClick={handleOpenDrawerSummary}
                      className="w-full py-2.5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500 hover:to-blue-500 text-cyan-300 hover:text-white font-extrabold rounded-xl text-xs uppercase tracking-widest border border-cyan-500/30 hover:border-cyan-500 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      View AI Meeting Summary
                    </button>
                  ) : isFetchingDrawerSummary ? (
                    <div className="w-full py-2.5 bg-secondary/20 border border-border/30 text-muted-foreground font-semibold rounded-xl text-xs flex items-center justify-center gap-2 animate-pulse">
                      <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground border-t-transparent animate-spin"></div>
                      Generating in background...
                    </div>
                  ) : (
                    <button
                      onClick={handleTriggerSummaryFromDrawer}
                      className="w-full py-2.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500 hover:to-orange-500 text-amber-300 hover:text-white font-extrabold rounded-xl text-xs uppercase tracking-widest border border-amber-500/30 hover:border-amber-500 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                    >
                      <Cpu className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
                      Generate AI Meeting Summary
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions: Cancel/Delete Event */}
          <div className="border-t border-border/40 pt-4 space-y-2">
            {(selectedEvent.createdBy?.id === currentUser?.id || currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN") ? (
              <button
                onClick={() => handleDeleteEvent(selectedEvent.id)}
                className="w-full py-3 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 hover:border-red-500 font-bold rounded-xl text-xs uppercase tracking-widest transition-all duration-300 hover:scale-[1.01] flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.05)]"
              >
                <Trash2 className="w-4 h-4" />
                Cancel / Delete Event
              </button>
            ) : (
              <p className="text-[10px] text-center text-muted-foreground italic bg-secondary/20 p-2.5 rounded-lg border border-border/20">
                🔒 You cannot delete this event because it was scheduled by another colleague.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Schedule Meeting / Event modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card/95 border border-white/5 rounded-3xl w-full max-w-lg shadow-2xl p-6 relative overflow-hidden animate-fade-in">
            {/* Modal header */}
            <div className="flex justify-between items-center border-b border-border/40 pb-4 mb-4">
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                  {isEditing ? <Lock className="w-5 h-5 text-cyan-400" /> : <Plus className="w-5 h-5 text-primary" />}
                  {isEditing ? "Edit Scheduled Event" : "Schedule Calendar Event"}
                </h3>
                <p className="text-[10px] text-muted-foreground">{isEditing ? "Modify scheduled details and target invitees." : "Add a private schedule or broadcast a corporate meeting."}</p>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); setIsEditing(false); setEditingEventId(null); setSelectedEvent(null); }}
                className="text-muted-foreground hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={isEditing ? handleUpdateEvent : handleCreateEvent} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 scrollbar-thin">
              {/* Event Title */}
              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Event Title *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Sync Meeting / Client View DHA flat"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full mt-1.5 bg-secondary/40 border border-border/60 focus:border-primary text-sm px-4 py-2.5 rounded-xl text-white outline-none transition-all placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Start & End Date-Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Start Time *</label>
                  <input 
                    type="datetime-local" 
                    required
                    value={formData.startTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                    className="w-full mt-1.5 bg-secondary/40 border border-border/60 focus:border-primary text-xs px-4 py-2.5 rounded-xl text-white outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">End Time *</label>
                  <input 
                    type="datetime-local" 
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                    className="w-full mt-1.5 bg-secondary/40 border border-border/60 focus:border-primary text-xs px-4 py-2.5 rounded-xl text-white outline-none transition-all"
                  />
                </div>
              </div>

              {/* Meeting Type Selection */}
              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Meeting Medium</label>
                <div className="grid grid-cols-2 gap-3 mt-1.5 mb-3.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, location: "" }));
                    }}
                    className={`py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      !formData.location.startsWith("VIRTUAL:")
                        ? "bg-primary/10 text-primary border-primary/20 shadow-lg shadow-primary/5"
                        : "bg-secondary/40 border-border/60 text-muted-foreground hover:text-white"
                    }`}
                  >
                    Physical Meet
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const roomCode = Math.random().toString(36).substring(2, 10).toUpperCase();
                      setFormData(prev => ({ ...prev, location: `VIRTUAL: https://rens.meet/${roomCode}` }));
                    }}
                    className={`py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      formData.location.startsWith("VIRTUAL:")
                        ? "bg-primary/10 text-primary border-primary/20 shadow-lg shadow-primary/5"
                        : "bg-secondary/40 border-border/60 text-muted-foreground hover:text-white"
                    }`}
                  >
                    Virtual Call Room
                  </button>
                </div>
              </div>

              {/* Location Coordinates / Virtual Room Link */}
              {formData.location.startsWith("VIRTUAL:") ? (
                <div>
                  <label className="text-[10px] font-black uppercase text-cyan-400 tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                    Generated Virtual Link
                  </label>
                  <input 
                    type="text" 
                    readOnly
                    value={formData.location}
                    className="w-full mt-1.5 bg-cyan-950/20 border border-cyan-500/25 text-cyan-400 font-bold text-xs px-4 py-2.5 rounded-xl cursor-not-allowed select-all"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Location / Physical Address</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Conference Room A / DHA Phase 6"
                    value={formData.location}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full mt-1.5 bg-secondary/40 border border-border/60 focus:border-primary text-sm px-4 py-2.5 rounded-xl text-white outline-none transition-all placeholder:text-muted-foreground/50"
                  />
                </div>
              )}

              {/* Event Description details */}
              <div>
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">Agenda / Descriptions</label>
                <textarea 
                  rows={2}
                  placeholder="Add meeting agenda topics or viewing coordinates detail..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full mt-1.5 bg-secondary/40 border border-border/60 focus:border-primary text-sm p-4 rounded-xl text-white outline-none transition-all resize-none placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Toggle Private Event */}
              <div className="flex items-center justify-between p-3 bg-secondary/30 border border-border/40 rounded-2xl">
                <div className="flex items-center gap-2">
                  <Lock className={`w-4 h-4 ${formData.isPrivate ? "text-emerald-400" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-xs font-bold text-white">Private Agent Schedule</p>
                    <p className="text-[9px] text-muted-foreground">Visible only to you, hidden from company calendar directory.</p>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={formData.isPrivate}
                  onChange={(e) => setFormData(prev => ({ ...prev, isPrivate: e.target.checked }))}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
              </div>

              {/* Target Broadcast selection (only if not private) */}
              {!formData.isPrivate && (
                <div className="space-y-4 border border-border/40 p-4 rounded-2xl bg-secondary/10">
                  {/* Select target roles */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-primary" />
                      Target Departments / Roles (Select to Invite)
                    </label>
                    <p className="text-[9px] text-muted-foreground mb-2">All employees matching checked roles will receive a System Notification alert.</p>
                    
                    <div className="grid grid-cols-2 gap-2 max-h-[110px] overflow-y-auto pr-1">
                      {ALL_ROLES.map(role => (
                        <label 
                          key={role}
                          className="flex items-center gap-2 text-xs p-2 hover:bg-secondary/40 rounded-lg cursor-pointer border border-border/20 transition-all select-none"
                        >
                          <input 
                            type="checkbox"
                            checked={formData.targetRoles.includes(role)}
                            onChange={() => toggleRoleSelect(role)}
                            className="w-3.5 h-3.5 accent-primary"
                          />
                          <span className="truncate text-gray-300 font-medium text-[10px] uppercase tracking-wider">{role.replace("_", " ")}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Select target users */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      Specific Invitees
                    </label>
                    
                    {/* Search colleagues filter */}
                    <input 
                      type="text"
                      placeholder="Filter colleagues by name..."
                      value={colleagueSearch}
                      onChange={(e) => setColleagueSearch(e.target.value)}
                      className="w-full mt-2 bg-secondary/50 border border-border/40 text-[11px] px-3 py-1.5 rounded-lg text-white outline-none focus:border-primary transition-all mb-2"
                    />

                    <div className="max-h-[110px] overflow-y-auto space-y-1.5 pr-1">
                      {employees
                        .filter(emp => emp.id !== currentUser?.id) // Exclude creator from options
                        .filter(emp => {
                          const fullName = `${emp.firstName} ${emp.lastName || ''}`.toLowerCase();
                          return fullName.includes(colleagueSearch.toLowerCase()) || emp.email.toLowerCase().includes(colleagueSearch.toLowerCase());
                        })
                        .map(emp => {
                          const isSelected = formData.targetUserIds.includes(emp.id);
                          return (
                            <div 
                              key={emp.id}
                              onClick={() => toggleColleagueSelect(emp.id)}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border text-xs transition-all select-none ${
                                isSelected 
                                  ? "bg-primary/10 border-primary/40 text-white" 
                                  : "bg-secondary/30 border-border/30 text-gray-400 hover:bg-secondary/60 hover:text-white"
                              }`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[9px] uppercase ${
                                  isSelected ? "bg-primary text-white" : "bg-secondary text-gray-300"
                                }`}>
                                  {emp.firstName.charAt(0)}
                                </div>
                                <div className="truncate">
                                  <p className="font-semibold truncate">{emp.firstName} {emp.lastName || ''}</p>
                                  <p className="text-[9px] text-muted-foreground truncate uppercase">{emp.role}</p>
                                </div>
                              </div>
                              <input 
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="w-3.5 h-3.5 accent-primary pointer-events-none"
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}

              {/* Submission buttons */}
              <div className="border-t border-border/40 pt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setIsEditing(false); setEditingEventId(null); setSelectedEvent(null); }}
                  className="px-4 py-2.5 border border-border/60 hover:bg-secondary hover:text-white text-muted-foreground rounded-xl text-xs uppercase tracking-widest font-black transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/95 text-white font-bold rounded-xl text-xs uppercase tracking-widest glow-primary transition-all duration-300 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {isEditing ? "Saving Changes..." : "Scheduling..."}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      {isEditing ? "Save Changes" : "Schedule Meeting"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RENS Virtual Conference Hub Overlay (Immersive full-screen calling room) */}
      {isCallActive && callRoomEvent && (
        <div className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-2xl flex flex-col justify-between text-white animate-fade-in select-none">
          {/* Header */}
          <div className="p-5.5 border-b border-white/5 bg-slate-900/40 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping"></span>
              <div>
                <h2 className="text-lg font-black tracking-tight flex items-center gap-2 text-white">
                  {callRoomEvent.title}
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 rounded-full tracking-wider animate-pulse">
                    Live Digital Meeting
                  </span>
                </h2>
                <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                  Secure Call Room ID: <span className="text-cyan-400 select-all font-mono font-bold">{callRoomEvent.location?.replace("VIRTUAL: https://rens.meet/", "").replace("VIRTUAL:", "")}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              {/* Spoken Language Dropdown */}
              {isCaptionsOn && (
                <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-xl px-2.5 py-1.5">
                  <span className="text-[9px] font-black uppercase text-gray-400">I Will Speak In:</span>
                  <select
                    value={spokenLang}
                    onChange={(e) => setSpokenLang(e.target.value)}
                    className="bg-transparent text-[10px] font-extrabold text-cyan-400 outline-none border-none cursor-pointer"
                  >
                    <option value="en-US" className="bg-slate-900 text-white font-semibold">English (US)</option>
                    <option value="ur-PK" className="bg-slate-900 text-white font-semibold">Urdu (اردو)</option>
                    <option value="ru-RU" className="bg-slate-900 text-white font-semibold">Russian (Русский)</option>
                    <option value="tr-TR" className="bg-slate-900 text-white font-semibold">Turkish (Türkçe)</option>
                  </select>
                </div>
              )}

              {/* Subtitles Target Language Dropdown */}
              {isCaptionsOn && (
                <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-xl px-2.5 py-1.5">
                  <span className="text-[9px] font-black uppercase text-gray-400">Show Subtitles In:</span>
                  <select
                    value={preferredTranslationLang}
                    onChange={(e) => setPreferredTranslationLang(e.target.value)}
                    className="bg-transparent text-[10px] font-extrabold text-emerald-400 outline-none border-none cursor-pointer"
                  >
                    <option value="en-US" className="bg-slate-900 text-white font-semibold">English</option>
                    <option value="ur-PK" className="bg-slate-900 text-white font-semibold">Urdu (اردو)</option>
                    <option value="ru-RU" className="bg-slate-900 text-white font-semibold">Russian (Русский)</option>
                    <option value="tr-TR" className="bg-slate-900 text-white font-semibold">Turkish (Türkçe)</option>
                  </select>
                </div>
              )}

              <span className="text-xs font-black bg-slate-800 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                Live: 00:04:12
              </span>
              <button
                onClick={() => handleLeaveCall(false)}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-wider rounded-xl shadow-lg shadow-red-500/15 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" /> Leave Meeting
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
            {/* Webcam Grid (Left Side) */}
            <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 gap-5 overflow-y-auto min-h-[350px]">
              {/* Participant Card 1: YOU */}
              <div className="glass rounded-2xl border border-white/10 relative overflow-hidden flex flex-col justify-between p-4 min-h-[180px] bg-slate-900/60 backdrop-blur-md">
                {!isCamMuted && localStream ? (
                  <div className="absolute inset-0 transition-opacity duration-300">
                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 p-4">
                    <div className="w-20 h-20 rounded-full bg-cyan-500/10 border-2 border-cyan-500/30 flex items-center justify-center text-cyan-400 font-black text-3xl shadow-[0_0_20px_rgba(6,182,212,0.15)] mb-3">
                      {getDisplayName(currentUser)?.charAt(0)}
                    </div>
                    <p className="text-sm font-black text-white">{getDisplayName(currentUser)}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">You</p>
                  </div>
                )}

                {/* Overlays (only visible when camera is on) */}
                {!isCamMuted && (
                  <>
                    <div className="flex justify-between items-start z-10">
                      <span className="bg-black/60 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase text-gray-300 tracking-wider">
                        {getDisplayName(currentUser)} (You)
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-black border ${
                        !isMicMuted ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {!isMicMuted ? '🎙️ Mic Active' : '🔇 Muted'}
                      </span>
                    </div>

                    <div className="flex justify-between items-end z-10">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider bg-black/40 px-2 py-0.5 rounded">
                        Role: {currentUser?.role}
                      </p>
                      {!isMicMuted && (
                        <div className="flex gap-0.5 items-end h-3">
                          <span className="w-0.5 bg-cyan-400 animate-pulse h-2"></span>
                          <span className="w-0.5 bg-cyan-400 animate-pulse h-3"></span>
                          <span className="w-0.5 bg-cyan-400 animate-pulse h-1.5"></span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Dynamic Peers from BroadcastChannel with WebRTC */}
              {activePeers.map(peer => {
                const hasStream = peerStreams[peer.id];
                const displayName = peer.name || "Colleague";
                const isPeerCamMuted = peer.isCamMuted;

                return (
                  <div 
                    key={peer.id} 
                    className="glass rounded-2xl border border-white/10 relative overflow-hidden flex flex-col justify-between p-4 min-h-[180px] bg-slate-900/60 backdrop-blur-md"
                  >
                    {!isPeerCamMuted && hasStream ? (
                      <div className="absolute inset-0 transition-opacity duration-300">
                        <PeerVideoPlayer stream={peerStreams[peer.id]} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 p-4">
                        <div className="w-20 h-20 rounded-full bg-cyan-500/10 border-2 border-cyan-500/30 flex items-center justify-center text-cyan-400 font-black text-3xl shadow-[0_0_20px_rgba(6,182,212,0.15)] mb-3">
                          {displayName.charAt(0)}
                        </div>
                        <p className="text-sm font-black text-white">{displayName}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mt-1">{peer.role}</p>
                      </div>
                    )}

                    {!isPeerCamMuted && (
                      <>
                        <div className="flex justify-between items-start z-10">
                          <span className="bg-black/60 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase text-gray-300 tracking-wider">
                            {displayName}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-black border ${
                            !peer.isMicMuted ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {!peer.isMicMuted ? '🎙️ Mic Active' : '🔇 Muted'}
                          </span>
                        </div>

                        <div className="flex justify-between items-end z-10">
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider bg-black/40 px-2 py-0.5 rounded">
                            Peer Connection
                          </p>
                          {!peer.isMicMuted && (
                            <div className="flex gap-0.5 items-end h-3">
                              <span className="w-0.5 bg-cyan-400 animate-pulse h-2"></span>
                              <span className="w-0.5 bg-cyan-400 animate-pulse h-3"></span>
                              <span className="w-0.5 bg-cyan-400 animate-pulse h-1.5"></span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Live Subtitles HUD Overlay */}
            {isCaptionsOn && activeCaptions && activeCaptions.length > 0 && (() => {
              const latestCap = activeCaptions[activeCaptions.length - 1];
              // Subtitle disappears after 10 seconds of silence (with absolute clock-drift tolerance)
              const diff = Date.now() - latestCap.timestamp;
              const isRecent = latestCap ? (diff < 10000 && diff > -10000) : false;
              
              if (!isRecent) return null;

              const translatedText = translateCaption(latestCap.text, latestCap.language, preferredTranslationLang);
              
              // Role dynamic classes
              const roleColors: { [role: string]: string } = {
                "SUPER_ADMIN": "bg-red-500/10 border-red-500/20 text-red-400",
                "ADMIN": "bg-red-500/10 border-red-500/20 text-red-400",
                "HR": "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
                "FINANCE": "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
                "LOGISTICS": "bg-purple-500/10 border-purple-500/20 text-purple-400",
                "AGENT": "bg-blue-500/10 border-blue-500/20 text-blue-400"
              };
              const roleClass = roleColors[latestCap.role] || "bg-slate-500/10 border-slate-500/20 text-slate-400";

              return (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-[85%] max-w-xl bg-slate-950/90 backdrop-blur-md border border-cyan-500/30 rounded-full px-5 py-3 shadow-[0_0_30px_rgba(6,182,212,0.2)] flex items-center justify-center gap-3 animate-fade-in">
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${roleClass} shrink-0`}>
                    {latestCap.role || 'MEMBER'}
                  </span>
                  <span className="font-extrabold text-cyan-400 shrink-0 text-xs">
                    {latestCap.senderName}:
                  </span>
                  <p className="text-gray-100 font-extrabold text-xs leading-relaxed text-center break-words flex-1">
                    {translatedText}
                  </p>
                </div>
              );
            })()}

            {/* Live Chat & Messages Sidebar (Right Side) */}
            <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/5 bg-slate-900/20 flex flex-col justify-between min-h-[250px] lg:min-h-0">
              <div className="p-4.5 border-b border-white/5 bg-slate-900/30 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-cyan-400 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4" /> Real-Time Call Chat
                </h3>
                <span className="text-[9px] bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5 rounded font-black text-cyan-400 uppercase">
                  Connected
                </span>
              </div>

              {/* Chat Message Logs */}
              <div className="flex-1 p-4.5 overflow-y-auto space-y-4 max-h-[300px] lg:max-h-[50vh] scrollbar-thin">
                {meetingMessages.map(msg => (
                  <div key={msg.id} className="space-y-1.5 animate-fade-in">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className={`font-black uppercase ${msg.isSystem ? 'text-cyan-400 font-black' : 'text-gray-300 font-bold'}`}>
                        {msg.sender}
                      </span>
                      <span className="text-gray-500 font-semibold">{msg.time}</span>
                    </div>
                    <p className={`text-xs p-2.5 rounded-xl border leading-relaxed ${
                      msg.isSystem 
                        ? 'bg-cyan-950/15 border-cyan-500/15 text-cyan-300 italic font-medium' 
                        : 'bg-slate-800/80 border-slate-700/50 text-slate-100 font-medium'
                    }`}>
                      {msg.text}
                    </p>
                  </div>
                ))}
              </div>

              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!chatInput.trim() || !callRoomEvent || !token) return;
                  const senderName = getDisplayName(currentUser);
                  
                  try {
                    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${callRoomEvent.id}/meeting-state/message`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                      },
                      body: JSON.stringify({
                        sender: senderName,
                        text: chatInput.trim()
                      })
                    });
                    
                    // Fetch state immediately to update the log
                    const stateRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${callRoomEvent.id}/meeting-state`, {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    if (stateRes.ok) {
                      const state = await stateRes.json();
                      setMeetingMessages(state.messages);
                    }
                  } catch (err) {
                    console.error("Failed to post call chat message:", err);
                  }

                  setChatInput("");
                }} 
                className="p-3 border-t border-white/5 flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Type call message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="flex-1 bg-slate-800/85 border border-slate-700 text-xs px-3.5 py-2.5 rounded-xl outline-none focus:border-cyan-500 text-white placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  className="px-3.5 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-bold uppercase transition-all cursor-pointer"
                >
                  Send
                </button>
              </form>
            </div>
          </div>

          {/* Controller Dock (Bottom center floating bar) */}
          <div className="p-6 bg-slate-900/60 border-t border-white/5 flex flex-wrap justify-center items-center gap-4.5">
            <button
              onClick={() => setIsMicMuted(prev => !prev)}
              className={`p-4.5 rounded-2xl border transition-all cursor-pointer ${
                !isMicMuted 
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shadow-md shadow-emerald-500/5 hover:bg-emerald-500/20' 
                  : 'bg-red-500/10 border-red-500/25 text-red-400 shadow-md shadow-red-500/5 hover:bg-red-500/20'
              }`}
              title={!isMicMuted ? "Mute Mic" : "Unmute Mic"}
            >
              {!isMicMuted ? <Mic className="w-5.5 h-5.5" /> : <MicOff className="w-5.5 h-5.5" />}
            </button>

            <button
              onClick={() => setIsCamMuted(prev => !prev)}
              className={`p-4.5 rounded-2xl border transition-all cursor-pointer ${
                !isCamMuted 
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shadow-md shadow-emerald-500/5 hover:bg-emerald-500/20' 
                  : 'bg-red-500/10 border-red-500/25 text-red-400 shadow-md shadow-red-500/5 hover:bg-red-500/20'
              }`}
              title={!isCamMuted ? "Mute Camera" : "Unmute Camera"}
            >
              {!isCamMuted ? <Video className="w-5.5 h-5.5" /> : <VideoOff className="w-5.5 h-5.5" />}
            </button>

            <button
              onClick={() => {
                setIsScreenSharing(prev => !prev);
                alert(isScreenSharing ? "Screen sharing terminated." : "Simulated screen sharing session successfully active!");
              }}
              className={`p-4.5 rounded-2xl border transition-all cursor-pointer ${
                isScreenSharing 
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400 shadow-lg' 
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
              title="Share Screen"
            >
              <Monitor className="w-5.5 h-5.5" />
            </button>

            <button
              onClick={() => setIsCaptionsOn(prev => !prev)}
              className={`p-4.5 rounded-2xl border transition-all cursor-pointer ${
                isCaptionsOn 
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400 shadow-lg shadow-cyan-500/10 hover:bg-cyan-500/30' 
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
              title={isCaptionsOn ? "Disable Captions" : "Enable AI Subtitles"}
            >
              <Globe className={`w-5.5 h-5.5 ${isCaptionsOn ? 'animate-pulse' : ''}`} />
            </button>

            <div className="w-[1px] h-8 bg-white/10 mx-2 hidden sm:block"></div>

            <button
              onClick={() => handleLeaveCall(false)}
              className="px-6 py-4 bg-red-500 hover:bg-red-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-red-500/20 flex items-center gap-2.5 transition-all hover:scale-[1.02] cursor-pointer"
            >
              <PhoneOff className="w-4.5 h-4.5" /> End Call
            </button>
          </div>
        </div>
      )}

      {/* Call History ledger Drawer */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-background/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="glass w-full max-w-md rounded-3xl overflow-hidden border border-white/5 shadow-2xl flex flex-col justify-between h-[90vh] animate-slide-in bg-card/95 backdrop-blur-2xl">
            {/* Header */}
            <div className="p-6 border-b border-border bg-secondary/20 flex justify-between items-center">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <History className="w-5 h-5 text-primary glow-primary" />
                  Past Meetings Ledger
                </h3>
                <p className="text-[9px] text-muted-foreground mt-0.5">Audited log history of RENS conference sessions.</p>
              </div>
              <button 
                onClick={() => setIsHistoryOpen(false)}
                className="text-muted-foreground hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 scrollbar-thin">
              <div className="p-4.5 glass border border-border/80 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-white text-sm">Residential Listings Sync</span>
                  <span className="text-[8px] bg-green-500/10 border border-green-500/25 px-2 py-0.5 text-green-400 font-black rounded uppercase">
                    Success
                  </span>
                </div>
                <p className="text-gray-400 font-semibold leading-relaxed">Weekly corporate listing allocation with residential agents.</p>
                <div className="flex justify-between text-[10px] text-gray-500 pt-2 border-t border-border/20">
                  <span>Host: Zainab Raza</span>
                  <span>Duration: 42 mins</span>
                </div>
                <p className="text-[8px] text-muted-foreground font-mono">Date: May 22, 2026 at 10:30 AM</p>
              </div>

              <div className="p-4.5 glass border border-border/80 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-white text-sm">Q2 Commission split Audit</span>
                  <span className="text-[8px] bg-green-500/10 border border-green-500/25 px-2 py-0.5 text-green-400 font-black rounded uppercase">
                    Success
                  </span>
                </div>
                <p className="text-gray-400 font-semibold leading-relaxed">Audited payout status ledger alignment session with Finance.</p>
                <div className="flex justify-between text-[10px] text-gray-500 pt-2 border-t border-border/20">
                  <span>Host: Adnan Malik (HR)</span>
                  <span>Duration: 28 mins</span>
                </div>
                <p className="text-[8px] text-muted-foreground font-mono">Date: May 20, 2026 at 02:00 PM</p>
              </div>

              <div className="p-4.5 glass border border-border/80 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-white text-sm">Fleet transit & Logistics review</span>
                  <span className="text-[8px] bg-green-500/10 border border-green-500/25 px-2 py-0.5 text-green-400 font-black rounded uppercase">
                    Success
                  </span>
                </div>
                <p className="text-gray-400 font-semibold leading-relaxed">Site transit logistics and driver route optimization sync.</p>
                <div className="flex justify-between text-[10px] text-gray-500 pt-2 border-t border-border/20">
                  <span>Host: Admin Coordinator</span>
                  <span>Duration: 15 mins</span>
                </div>
                <p className="text-[8px] text-muted-foreground font-mono">Date: May 17, 2026 at 11:15 AM</p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border bg-secondary/10 flex justify-end">
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="w-full py-3 bg-secondary hover:bg-secondary/80 border border-border hover:border-white/10 text-xs font-black uppercase tracking-wider rounded-xl text-white transition-all cursor-pointer"
              >
                Dismiss Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Summary Modal */}
      {showSummary && summaryData && (
        <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-3xl w-full max-w-4xl shadow-2xl p-6 relative overflow-hidden animate-fade-in text-white max-h-[90vh] flex flex-col justify-between">
            {/* Background glowing pills */}
            <div className="absolute -top-[20%] -right-[20%] w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-3xl -z-10"></div>
            <div className="absolute -bottom-[20%] -left-[20%] w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-3xl -z-10"></div>
            
            <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400">
                  <Globe className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider text-cyan-400">
                    RENS Cognitive Core AI Conference Report
                  </h3>
                  <p className="text-[10px] text-gray-400 font-semibold">{summaryData.title}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowSummary(false);
                  setSummaryData(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-1 scrollbar-thin">
              {/* Meeting stats banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-950/40 border border-white/5 rounded-2xl">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-gray-500 font-black">Your Stay Duration</p>
                  <p className="text-lg font-black text-cyan-400 mt-1">{summaryData.duration}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-gray-500 font-black">Total Attendees</p>
                  <p className="text-lg font-black text-white mt-1">{summaryData.allTimeAttendees?.length || 0}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-gray-500 font-black">Meeting Link</p>
                  <p className="text-lg font-black text-emerald-400 mt-1 uppercase tracking-wider">Secured</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-gray-500 font-black">AI Analysis</p>
                  <p className="text-lg font-black text-purple-400 mt-1 uppercase tracking-wider">Completed</p>
                </div>
              </div>

              {/* AI Report Section */}
              {summaryData.summaryReport ? (
                <div className="space-y-6">
                  {/* Grid: Agenda / Highlights & Actions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Left Column: Agenda & Highlights */}
                    <div className="glass p-5 rounded-2xl border border-white/5 bg-slate-950/20 flex flex-col gap-4">
                      <div>
                        <h4 className="text-[10px] font-black uppercase text-cyan-400 tracking-widest mb-1.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></span>
                          Conference Agenda
                        </h4>
                        <p className="text-xs font-bold text-gray-100 leading-relaxed">
                          {summaryData.summaryReport.agenda}
                        </p>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-black uppercase text-cyan-400 tracking-widest mb-2 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></span>
                          Key Discussion Highlights
                        </h4>
                        <ul className="space-y-2">
                          {summaryData.summaryReport.keyPoints?.map((pt: string, idx: number) => (
                            <li key={idx} className="text-xs text-gray-300 font-semibold leading-relaxed flex items-start gap-2">
                              <span className="text-cyan-400 select-none mt-0.5">•</span>
                              <span>{pt}</span>
                            </li>
                          ))}
                          {(!summaryData.summaryReport.keyPoints || summaryData.summaryReport.keyPoints.length === 0) && (
                            <p className="text-[10px] text-gray-500 italic">No key highlights identified.</p>
                          )}
                        </ul>
                      </div>
                    </div>

                    {/* Right Column: Action Items & Priorities */}
                    <div className="glass p-5 rounded-2xl border border-white/5 bg-slate-950/20 flex flex-col gap-3">
                      <h4 className="text-[10px] font-black uppercase text-emerald-400 tracking-widest mb-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                        Action Items List
                      </h4>
                      <div className="space-y-2">
                        {summaryData.summaryReport.actionItems?.map((act: string, idx: number) => {
                          const isHigh = act.toUpperCase().includes("[HIGH]");
                          const cleanAct = act.replace(/\[HIGH\]|\[STANDARD\]|\[LOW\]/gi, "").trim();
                          
                          return (
                            <div key={idx} className="flex items-start gap-2.5 p-2 bg-slate-900/40 border border-white/5 rounded-xl text-xs hover:border-white/10 transition-colors">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0 cursor-pointer mt-0.5" 
                              />
                              <div className="flex-1">
                                <p className="font-semibold text-gray-200">{cleanAct}</p>
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase mt-1 inline-block tracking-wider ${
                                  isHigh ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-slate-500/10 border-slate-500/20 text-gray-400'
                                }`}>
                                  {isHigh ? 'High Priority' : 'Standard Priority'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {(!summaryData.summaryReport.actionItems || summaryData.summaryReport.actionItems.length === 0) && (
                          <p className="text-[10px] text-gray-500 italic">No explicit tasks assigned.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Role-split Accordion/Grid */}
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-purple-400 tracking-widest mb-3.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-ping"></span>
                      Department Contributions Breakdown
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {summaryData.summaryReport.roleContributions?.map((contr: any, idx: number) => {
                        const isHR = contr.role.includes("HR");
                        const isFinance = contr.role.includes("Finance") || contr.role.includes("FINANCE");
                        const badgeColor = isHR 
                          ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                          : isFinance 
                            ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                            : 'bg-purple-500/10 border-purple-500/20 text-purple-400';

                        return (
                          <div key={idx} className="p-3.5 bg-slate-950/20 border border-white/5 rounded-2xl flex flex-col gap-2 hover:border-white/10 transition-colors">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider self-start ${badgeColor}`}>
                              {contr.role}
                            </span>
                            <p className="text-xs text-gray-300 font-semibold leading-relaxed">
                              {contr.contribution}
                            </p>
                          </div>
                        );
                      })}
                      {(!summaryData.summaryReport.roleContributions || summaryData.summaryReport.roleContributions.length === 0) && (
                        <p className="text-[10px] text-gray-500 italic col-span-2 text-center py-4">No role contributions analyzed.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-950/30 border border-white/5 rounded-2xl text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-cyan-400 animate-spin mb-3"></div>
                  <p className="text-xs font-black uppercase text-gray-400 tracking-wider animate-pulse">RENS Cognitive Core Synthesizing Executive Summary...</p>
                  <p className="text-[10px] text-gray-500 font-semibold mt-1">Analyzing transcripts log and generating role actions breakdown.</p>
                </div>
              )}

              {/* Standard Attendees Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-white/5">
                {/* Attendees List */}
                <div>
                  <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    All-Time Attendees ({summaryData.allTimeAttendees?.length || 0})
                  </h4>
                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                    {summaryData.allTimeAttendees?.map((att: any) => (
                      <div key={att.id} className="flex justify-between items-center p-2.5 bg-slate-900/60 border border-white/5 rounded-xl text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center font-black text-[10px] text-cyan-400 uppercase">
                            {att.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-white">{att.name}</p>
                            <p className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">{att.role}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-slate-950/60 border border-white/5 text-gray-300 px-2 py-0.5 rounded">
                          ⌛ {att.duration || "Just joined"}
                        </span>
                      </div>
                    ))}
                    {(!summaryData.allTimeAttendees || summaryData.allTimeAttendees.length === 0) && (
                      <p className="text-[10px] text-gray-500 italic text-center py-2">No other attendees logged.</p>
                    )}
                  </div>
                </div>

                {/* Absentees List */}
                <div>
                  <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2 flex items-center gap-1">
                    <VideoOff className="w-3.5 h-3.5 text-red-400" />
                    Absent Invitees ({summaryData.absentees?.length || 0})
                  </h4>
                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                    {summaryData.absentees?.map((abs: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-2.5 bg-red-950/5 border border-red-500/10 rounded-xl text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center font-black text-[10px] text-red-400 uppercase">
                            {abs.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-gray-300">{abs.name}</p>
                            <p className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">{abs.role}</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-red-500/10">
                          Absent
                        </span>
                      </div>
                    ))}
                    {(!summaryData.absentees || summaryData.absentees.length === 0) && (
                      <p className="text-[10px] text-emerald-400 italic text-center py-2.5 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                        🎉 100% Attendance: No invitees were absent!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-white/10 pt-4 mt-4 flex flex-col sm:flex-row gap-2.5">
              {/* Host Terminate Button */}
              {summaryData.isHost && (
                <button
                  onClick={async () => {
                    if (!confirm("⚠️ Are you sure you want to permanently CLOSE this meeting link? Once closed, no one can join this session again.")) return;
                    try {
                      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/calendar/events/${summaryData.eventId}/meeting-state/terminate`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`
                        }
                      });
                      alert("🔒 Meeting room link closed permanently.");
                      setShowSummary(false);
                      setSummaryData(null);
                      fetchEvents(false);
                    } catch (e) {
                      console.error("Failed to terminate meeting:", e);
                    }
                  }}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-extrabold rounded-xl text-xs uppercase tracking-widest transition-all duration-300 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-1.5 shadow-lg shadow-red-500/15"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Terminate & Close Meeting Session
                </button>
              )}

              <button
                onClick={() => {
                  setShowSummary(false);
                  setSummaryData(null);
                }}
                className="flex-1 py-3 bg-secondary hover:bg-secondary/80 border border-white/10 hover:border-white/20 text-xs font-black uppercase tracking-widest rounded-xl text-white transition-all cursor-pointer text-center"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
