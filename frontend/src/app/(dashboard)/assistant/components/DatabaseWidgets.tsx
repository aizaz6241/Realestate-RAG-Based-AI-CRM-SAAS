import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Building2, 
  Wallet, 
  CheckSquare, 
  Users, 
  Calendar, 
  Video, 
  Palmtree, 
  Truck, 
  Clock, 
  Terminal, 
  Database, 
  ChevronDown, 
  ChevronRight, 
  Star, 
  User, 
  Award
} from "lucide-react";

interface DatabaseWidgetsProps {
  toolExecuted: string | null;
  toolData: any;
  msgId: string;
}

export const DatabaseWidgets: React.FC<DatabaseWidgetsProps> = ({
  toolExecuted,
  toolData,
  msgId
}) => {
  const router = useRouter();
  const [expandedQueries, setExpandedQueries] = useState<Record<string, boolean>>({});

  const toggleQuery = (id: string) => {
    setExpandedQueries(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  if (!toolData) return null;

  switch (toolExecuted) {
    case "searchProperties": {
      if (!Array.isArray(toolData)) return null;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
            <Building2 className="w-3.5 h-3.5" /> Property Matches ({toolData.length})
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
            {toolData.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No matching properties registered in this bracket.</p>
            ) : (
              toolData.map((prop: any) => (
                <div 
                  key={prop.id} 
                  onClick={() => router.push(`/properties/${prop.id}`)}
                  className="w-64 flex-shrink-0 glass rounded-2xl border border-border/80 overflow-hidden flex flex-col shadow-lg bg-card/45 cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                >
                  {/* Ambient Building Placeholder Banner */}
                  <div className="h-24 bg-gradient-to-br from-primary/20 to-secondary/35 flex items-center justify-center border-b border-border/40 relative">
                    <Building2 className="w-8 h-8 text-primary glow-primary opacity-60 animate-pulse" />
                    <span className="absolute bottom-2 right-2 text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-md text-white">
                      {prop.listingType}
                    </span>
                  </div>
                  <div className="p-3 text-left space-y-2">
                    <div>
                      <span className="text-[9px] font-black uppercase text-primary tracking-wider">{prop.type}</span>
                      <h4 className="font-extrabold text-xs text-white truncate">{prop.title}</h4>
                    </div>
                    <div className="flex justify-between items-center border-y border-border/20 py-1.5 text-[10px] text-gray-400">
                      <span>🛏️ {prop.bedrooms || 0} Beds</span>
                      <span>🚿 {prop.bathrooms || 0} Baths</span>
                      <span>📐 {prop.areaSqft || 0} Sqft</span>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-xs font-black text-white glow-primary">{parseFloat(prop.price).toLocaleString()} PKR</span>
                      <span className="text-[8px] font-extrabold bg-green-500/10 border border-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full uppercase tracking-wider">{prop.status}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    case "getFinanceAnalytics": {
      if (!toolData.totals) return null;
      return (
        <div className="glass rounded-2xl border border-border/80 p-4 space-y-4 max-w-xl bg-card/30">
          <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest border-b border-border/30 pb-2">
            <Wallet className="w-3.5 h-3.5 text-primary glow-primary" /> Finance Aggregate Analysis
          </div>
          
          {/* Stats Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            {[
              { label: "Net Salaries", val: toolData.totals.netSalary, color: "text-white" },
              { label: "Base Salaries", val: toolData.totals.baseSalary, color: "text-gray-400" },
              { label: "Allowances", val: toolData.totals.allowances, color: "text-emerald-400" },
              { label: "Deductions", val: toolData.totals.deductions, color: "text-red-400" }
            ].map((stat, i) => (
              <div key={i} className="p-2.5 rounded-xl border border-border/40 bg-secondary/15 flex flex-col justify-center">
                <span className="text-[8px] font-black uppercase text-gray-500 tracking-wider">{stat.label}</span>
                <span className={`text-[11px] font-black truncate mt-1 ${stat.color}`}>{parseFloat(stat.val).toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Dynamic SVG Salary Bar Chart */}
          {toolData.staffDetails && toolData.staffDetails.length > 0 && (
            <div className="space-y-2 mt-2">
              <span className="block text-[9px] font-black uppercase text-gray-500 tracking-wider">Salary Distribution Graph</span>
              <div className="p-3 bg-secondary/20 border border-border/40 rounded-xl flex flex-col gap-2 relative">
                {toolData.staffDetails.slice(0, 5).map((staff: any, idx: number) => {
                  const maxSalary = Math.max(...toolData.staffDetails.map((s: any) => s.salary), 1);
                  const percent = (staff.salary / maxSalary) * 100;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-[9px] text-gray-300 font-bold">
                        <span>👤 {staff.name} ({staff.designation || "Staff"})</span>
                        <span className="text-white">{parseFloat(staff.salary).toLocaleString()} PKR</span>
                      </div>
                      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/20">
                        <div 
                          className="h-full bg-gradient-to-r from-primary to-secondary glow-primary rounded-full transition-all duration-1000"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    case "getTasksBoard": {
      if (!Array.isArray(toolData)) return null;
      return (
        <div className="glass rounded-2xl border border-border/80 p-4 max-w-md bg-card/30 text-left space-y-3">
          <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest border-b border-border/30 pb-2">
            <CheckSquare className="w-3.5 h-3.5 text-primary glow-primary" /> Active ERP Tasks Board ({toolData.length})
          </div>
          <div className="space-y-2 divide-y divide-border/20 max-h-48 overflow-y-auto scrollbar-thin">
            {toolData.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Zero operational tasks registered on index.</p>
            ) : (
              toolData.map((task: any) => {
                const isDone = task.status === "COMPLETED";
                const isProgress = task.status === "IN_PROGRESS";
                
                return (
                  <div key={task.id} className="pt-2 flex items-start gap-3 text-xs leading-relaxed group">
                    <input 
                      type="checkbox"
                      readOnly
                      checked={isDone}
                      className="mt-0.5 rounded border-border text-primary outline-none focus:ring-0 cursor-pointer pointer-events-none"
                    />
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                      <span className={`block font-semibold truncate ${isDone ? "line-through text-gray-500" : "text-white"}`}>
                        {task.title}
                      </span>
                      <div className="flex items-center gap-2 text-[8px] font-black uppercase text-gray-500">
                        <span>👤 {task.assignedTo?.firstName || "Unassigned"}</span>
                        <span>•</span>
                        <span className={isDone ? "text-green-400" : isProgress ? "text-amber-400 animate-pulse" : "text-gray-400"}>
                          {task.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    case "searchClients": {
      if (!Array.isArray(toolData)) return null;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
            <Users className="w-3.5 h-3.5" /> CRM Client Contacts ({toolData.length})
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
            {toolData.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No matching client database entries found.</p>
            ) : (
              toolData.map((client: any) => (
                <div 
                  key={client.id} 
                  onClick={() => router.push(`/clients/${client.id}`)}
                  className="w-56 flex-shrink-0 glass rounded-2xl border border-border/80 p-3 bg-card/45 flex flex-col justify-between text-left space-y-2 cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                >
                  <div className="space-y-1">
                    <div className="flex justify-between items-start gap-1">
                      <h4 className="font-extrabold text-xs text-white truncate">{client.name}</h4>
                      <span className="text-[7px] font-black uppercase bg-primary/10 border border-primary/30 text-primary px-1.5 py-0.5 rounded">
                        {client.type}
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-500 font-extrabold tracking-wider truncate uppercase">Preference: {client.preferences || "None"}</p>
                  </div>
                  <div className="border-t border-border/20 pt-2 flex justify-between items-center text-[10px]">
                    <span className="font-semibold text-gray-400">Budget:</span>
                    <span className="font-black text-white glow-primary">
                      {client.budget ? `${parseFloat(client.budget).toLocaleString()} PKR` : "Unspecified"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    case "getMeetingsAnalytics": {
      if (!Array.isArray(toolData)) return null;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
            <Calendar className="w-3.5 h-3.5 text-primary glow-primary" /> Scheduled Meetings ({toolData.length})
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
            {toolData.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No meetings recorded in the system.</p>
            ) : (
              toolData.map((meeting: any) => {
                const isVirtual = meeting.location?.toLowerCase().includes("virtual") || meeting.location?.toLowerCase().includes("http");
                const totalInvited = meeting.attendanceSummary?.totalInvited || 0;
                const totalAttended = meeting.attendanceSummary?.totalAttended || 0;
                const totalAbsent = meeting.attendanceSummary?.totalAbsent || 0;
                const attendanceRate = totalInvited > 0 ? Math.round((totalAttended / totalInvited) * 100) : 0;
                
                return (
                  <div key={meeting.id} className="w-72 flex-shrink-0 glass rounded-2xl border border-border/80 overflow-hidden flex flex-col shadow-lg bg-card/45">
                    {/* Gradient Banner Header */}
                    <div className={`h-20 bg-gradient-to-br ${isVirtual ? "from-cyan-500/20 to-blue-500/35" : "from-emerald-500/20 to-teal-500/35"} flex items-center justify-between px-4 border-b border-border/40 relative flex-shrink-0`}>
                      <div className="flex items-center gap-2">
                        {isVirtual ? <Video className="w-6 h-6 text-primary glow-primary animate-pulse" /> : <Calendar className="w-6 h-6 text-emerald-400" />}
                        <div className="text-left">
                          <span className="block text-[7.5px] font-black uppercase tracking-widest text-gray-400">Location type</span>
                          <span className="block text-[9.5px] font-bold text-white uppercase">{isVirtual ? "Virtual / Online" : "Physical Meeting"}</span>
                        </div>
                      </div>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md border ${
                        meeting.isTerminated 
                          ? "bg-red-500/10 border-red-500/20 text-red-400" 
                          : "bg-green-500/10 border-green-500/20 text-green-400 animate-pulse"
                      }`}>
                        {meeting.isTerminated ? "Ended" : "Active"}
                      </span>
                    </div>

                    {/* Meeting Body Contents */}
                    <div className="p-4 text-left space-y-3.5 flex-1 flex flex-col justify-between">
                      <div className="space-y-1">
                        <span className="text-[8px] font-black uppercase text-primary tracking-wider">Title</span>
                        <h4 className="font-extrabold text-xs text-white truncate" title={meeting.title}>{meeting.title}</h4>
                        {meeting.description && (
                          <p className="text-[10px] text-gray-400 line-clamp-1 italic">{meeting.description}</p>
                        )}
                      </div>

                      {/* Meeting Schedule details */}
                      <div className="space-y-2 border-y border-border/20 py-2.5 text-[10px] text-gray-300">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">📅 Time:</span>
                          <span className="font-bold text-white">
                            {new Date(meeting.startTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">👤 Host:</span>
                          <span className="font-bold text-white flex items-center gap-1">
                            {meeting.organizer} 
                            {meeting.organizerRole && (
                              <span className="text-[7px] font-black uppercase bg-secondary border border-border/40 px-1 py-0.2 rounded text-gray-400">
                                {meeting.organizerRole.replace("SUPER_", "")}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Attendance Statistics */}
                      <div className="space-y-2 pt-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-400 font-extrabold uppercase tracking-wider text-[8px]">Attendance Details ({attendanceRate}% Present)</span>
                          <span className="text-gray-500 font-semibold">{totalAttended} / {totalInvited} Present</span>
                        </div>
                        
                        {/* CSS Attendance Progress Bar */}
                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden border border-border/20">
                          <div 
                            className={`h-full bg-gradient-to-r ${attendanceRate > 50 ? "from-emerald-400 to-teal-500" : "from-red-400 to-orange-500"} rounded-full`}
                            style={{ width: `${attendanceRate}%` }}
                          ></div>
                        </div>

                        {/* Present / Absent participants drawer preview */}
                        <div className="grid grid-cols-2 gap-2 text-[9.5px] pt-1">
                          <div className="space-y-1">
                            <span className="block text-[8px] font-black uppercase text-green-400 tracking-wider">👥 Present ({totalAttended})</span>
                            <div className="max-h-16 overflow-y-auto scrollbar-none space-y-0.5">
                              {meeting.attendedParticipants?.length === 0 ? (
                                <span className="text-gray-500 italic block text-[8px]">Nobody attended</span>
                              ) : (
                                meeting.attendedParticipants?.map((p: any, idx: number) => (
                                  <span key={idx} className="block truncate text-gray-300 font-medium">• {p.name}</span>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="space-y-1 border-l border-border/20 pl-2">
                            <span className="block text-[8px] font-black uppercase text-red-400 tracking-wider">🚫 Absent ({totalAbsent})</span>
                            <div className="max-h-16 overflow-y-auto scrollbar-none space-y-0.5">
                              {meeting.absentParticipants?.length === 0 ? (
                                <span className="text-gray-500 italic block text-[8px]">No absentees</span>
                              ) : (
                                meeting.absentParticipants?.map((p: any, idx: number) => (
                                  <span key={idx} className="block truncate text-gray-300 font-medium">• {p.name}</span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons (Join Link) */}
                      {isVirtual && meeting.location && !meeting.isTerminated && meeting.status !== 'COMPLETED' && (
                        <div className="pt-3">
                          <a 
                            href={meeting.location.includes("http") ? meeting.location : "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2 rounded-xl bg-primary/20 hover:bg-primary border border-primary/30 hover:border-primary text-white font-black text-[10px] uppercase tracking-widest text-center block transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] cursor-pointer"
                          >
                            Join Virtual Meeting
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    case "getLeaveRequests": {
      if (!Array.isArray(toolData)) return null;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest text-left">
            <Palmtree className="w-3.5 h-3.5 text-primary glow-primary animate-pulse" /> Leave Requests ({toolData.length})
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
            {toolData.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-left">No leave requests registered under your current criteria.</p>
            ) : (
              toolData.map((leave: any) => {
                const isApproved = leave.status === "APPROVED";
                const isPending = leave.status === "PENDING";
                
                return (
                  <div key={leave.id} className="w-64 flex-shrink-0 glass rounded-2xl border border-border/80 overflow-hidden flex flex-col shadow-lg bg-card/45">
                    {/* Banner Header */}
                    <div className={`h-12 bg-gradient-to-br ${
                      isApproved ? "from-emerald-500/10 to-teal-500/20" :
                      isPending ? "from-amber-500/10 to-orange-500/20" : "from-red-500/10 to-pink-500/20"
                    } flex items-center justify-between px-3 border-b border-border/40`}>
                      <span className="text-[10px] font-black uppercase text-white tracking-wider flex items-center gap-1">
                        🌴 {leave.type} Leave
                      </span>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                        isApproved ? "bg-green-500/10 border-green-500/20 text-green-400" :
                        isPending ? "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse" :
                        "bg-red-500/10 border-red-500/20 text-red-400"
                      }`}>
                        {leave.status}
                      </span>
                    </div>

                    {/* Card Details */}
                    <div className="p-3 text-left space-y-2 flex-1 flex flex-col justify-between">
                      <div className="space-y-0.5">
                        <span className="block text-[7.5px] font-black uppercase text-gray-500 tracking-wider">Applicant</span>
                        <h4 className="font-extrabold text-xs text-white truncate">{leave.employeeName}</h4>
                        <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-wider">{leave.employeeRole}</span>
                      </div>

                      <div className="border-y border-border/20 py-2 flex flex-col gap-1 text-[9.5px] text-gray-300">
                        <div className="flex justify-between">
                          <span className="text-gray-500">From:</span>
                          <span className="font-bold text-white">{new Date(leave.startDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">To:</span>
                          <span className="font-bold text-white">{new Date(leave.endDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>
                      </div>

                      {leave.reason && (
                        <div className="bg-secondary/20 border border-border/30 rounded-xl p-2 text-[9.5px] text-gray-400 italic line-clamp-2 mt-1">
                          "{leave.reason}"
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    }

    case "getLogisticsAnalytics": {
      return (
        <div className="glass rounded-2xl border border-border/80 p-4 space-y-4 w-full max-w-xl bg-card/30">
          <div className="flex items-center justify-between border-b border-border/30 pb-2">
            <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest text-left">
              <Truck className="w-4 h-4 text-primary glow-primary animate-pulse" /> Fleet & Logistics Terminal
            </div>
            <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
              {toolData.vehiclesCount || 0} Vehicles Active
            </span>
          </div>

          {/* Vehicles & Maintenance Split */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fleet Left Cabinet */}
            <div className="space-y-2 text-left">
              <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Fleet Maintenance Costs</span>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                {(!toolData.vehicles || toolData.vehicles.length === 0) ? (
                  <p className="text-[10px] text-muted-foreground italic text-left">No vehicles indexed.</p>
                ) : (
                  toolData.vehicles.map((veh: any) => (
                    <div key={veh.id} className="p-2 border border-border/30 bg-secondary/15 rounded-xl flex justify-between items-center gap-2">
                      <div className="overflow-hidden text-left">
                        <h5 className="font-extrabold text-[10.5px] text-white truncate">{veh.modelName}</h5>
                        <span className="block text-[8px] font-bold text-gray-500 uppercase tracking-widest">{veh.plateNumber}</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`block text-[8px] font-black uppercase px-1.5 py-0.2 rounded border ${
                          veh.status === "ACTIVE" ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}>{veh.status}</span>
                        <span className="block text-[9.5px] font-black text-white glow-primary mt-1">{veh.maintenanceCostTotal?.toLocaleString() || 0} PKR</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Logistics Schedules Timeline Right Cabinet */}
            <div className="space-y-2 text-left border-l border-border/20 pl-0 md:pl-4">
              <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Active schedules timeline</span>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                {(!toolData.schedules || toolData.schedules.length === 0) ? (
                  <p className="text-[10px] text-muted-foreground italic text-left">No active logistics schedules indexed.</p>
                ) : (
                  toolData.schedules.map((sch: any) => {
                    const isCompleted = sch.status === "COMPLETED";
                    const isInTransit = sch.status === "IN_TRANSIT";
                    
                    return (
                      <div key={sch.id} className="p-2 border border-border/30 bg-secondary/10 hover:bg-secondary/25 rounded-xl transition-all space-y-1 text-[9.5px] text-left">
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-white">👤 {sch.driver || "Unassigned"}</span>
                          <span className={`text-[7px] font-black uppercase px-1 rounded border ${
                            isCompleted ? "bg-green-500/10 border-green-500/20 text-green-400" :
                            isInTransit ? "bg-purple-500/10 border-purple-500/20 text-purple-400 animate-pulse" :
                            "bg-blue-500/10 border-blue-500/20 text-blue-400"
                          }`}>{sch.status}</span>
                        </div>
                        <div className="text-[9px] text-gray-400 leading-tight">
                          <span className="text-primary font-bold">📍 Pick:</span> {sch.pickupLocation} <br/>
                          <span className="text-secondary font-bold">📍 Drop:</span> {sch.dropLocation}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    case "searchEmployees": {
      if (!Array.isArray(toolData)) return null;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest text-left">
            <Users className="w-3.5 h-3.5 text-primary glow-primary" /> Employee Directory ({toolData.length})
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 w-full scrollbar-thin">
            {toolData.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-left">No employees found matching the search criteria.</p>
            ) : (
              toolData.map((emp: any) => (
                <div 
                  key={emp.id} 
                  onClick={() => router.push(`/employees/${emp.userId}`)}
                  className="w-60 flex-shrink-0 glass rounded-2xl border border-border/80 p-4 bg-card/45 flex flex-col justify-between text-left space-y-3 shadow-lg cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.02] active:scale-[0.98] group"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                      <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 text-primary px-1.5 py-0.5 rounded">
                        {emp.department || "Staff"}
                      </span>
                      <h4 className="font-extrabold text-xs text-white truncate mt-1.5">
                        {emp.user ? `${emp.user.firstName} ${emp.user.lastName || ''}`.trim() : "Unknown Employee"}
                      </h4>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider truncate">
                        {emp.designation || "Employee"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="border-t border-border/20 pt-2.5 space-y-1.5 text-[9.5px]">
                    <div className="flex justify-between items-center text-gray-400">
                      <span>📧 Email:</span>
                      <span className="font-semibold text-white truncate max-w-[130px]">{emp.user?.email || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-400">
                      <span>📅 Joined:</span>
                      <span className="font-semibold text-white">
                        {emp.joiningDate ? new Date(emp.joiningDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-gray-400">
                      <span>💰 Payout:</span>
                      <span className="font-extrabold text-white">
                        {typeof emp.salary === 'number' ? `${emp.salary.toLocaleString()} PKR` : emp.salary}
                      </span>
                    </div>
                  </div>
                  
                  <div className="border-t border-border/20 pt-2 flex justify-between items-center text-[8px]">
                    <span className="font-black uppercase text-gray-500">Security Clearance</span>
                    <span className="font-black bg-secondary border border-border/40 text-gray-300 px-1.5 py-0.5 rounded uppercase">
                      {emp.user?.role || "USER"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    case "fetchEmployeePerformance": {
      if (toolData.error) return null;
      if (toolData.isRankingsList) {
        return (
          <div className="glass rounded-2xl border border-border/80 p-5 space-y-4 w-full max-w-lg bg-card/30 text-left animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                <Award className="w-4 h-4 text-primary glow-primary animate-pulse" /> Team Performance Rankings Board
              </div>
              <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
                {toolData.leaderboard?.length || 0} Staff Active
              </span>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
              {toolData.leaderboard?.map((item: any, idx: number) => {
                let rankMedal = "🏅";
                if (idx === 0) rankMedal = "🥇";
                else if (idx === 1) rankMedal = "🥈";
                else if (idx === 2) rankMedal = "🥉";

                return (
                  <div 
                    key={item.profileId}
                    onClick={() => router.push(`/employees/${item.userId}`)}
                    className="flex items-center justify-between p-3 border border-border/30 bg-secondary/10 hover:bg-secondary/20 hover:border-primary/45 rounded-xl gap-3 text-[11px] transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-[150px] max-w-[200px]">
                      <span className="text-sm">{rankMedal}</span>
                      <div className="text-left overflow-hidden">
                        <h5 className="font-extrabold text-white truncate group-hover:text-primary transition-colors">
                          {item.employee}
                        </h5>
                        <p className="text-[8px] text-gray-400 font-black uppercase tracking-wider truncate">
                          {item.designation} • {item.department}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-1 justify-end">
                      <div className="text-right space-y-0.5 hidden sm:block">
                        <span className="block text-[7.5px] font-black uppercase text-gray-500">Task Completion</span>
                        <div className="flex items-center gap-1.5 justify-end">
                          <div className="w-12 h-1 bg-secondary rounded-full overflow-hidden border border-border/20">
                            <div 
                              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full" 
                              style={{ width: `${item.taskStats.completionRate}%` }}
                            ></div>
                          </div>
                          <span className="font-extrabold text-emerald-400 text-[9px]">{item.taskStats.completionRate}%</span>
                        </div>
                      </div>

                      <div className="text-right flex flex-col justify-center items-end min-w-[70px]">
                        <span className="text-amber-400 font-extrabold flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          <span className="text-[10px] font-black">{item.avgRating || "0.0"}</span>
                        </span>
                        <span className="text-[7.5px] font-bold text-gray-500">
                          {item.taskStats.completed}/{item.taskStats.total} Tasks
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      } else {
        return (
          <div className="glass rounded-2xl border border-border/80 p-5 space-y-4 w-full max-w-md bg-card/30 text-left animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                <Award className="w-4 h-4 text-primary glow-primary animate-pulse" /> Employee Performance Analysis
              </div>
              <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
                {toolData.designation || "Staff"}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/35 border border-border/50 flex items-center justify-center relative flex-shrink-0">
                <User className="w-6 h-6 text-primary glow-primary" />
              </div>
              <div className="text-left overflow-hidden">
                <h4 className="font-extrabold text-sm text-white truncate">{toolData.employee}</h4>
                <span className="block text-[8px] font-black uppercase text-primary tracking-wider">{toolData.department || "General"} Department</span>
              </div>
            </div>

            {toolData.taskStats && (
              <div className="p-3.5 bg-secondary/15 border border-border/30 rounded-xl space-y-2.5">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-gray-400 font-extrabold uppercase tracking-wider text-[8px]">Task Completion ({toolData.taskStats.completionRate})</span>
                  <span className="text-gray-500 font-semibold">{toolData.taskStats.completed} / {toolData.taskStats.total} Completed</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden border border-border/20">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-secondary glow-primary rounded-full transition-all duration-1000"
                    style={{ width: toolData.taskStats.completionRate }}
                  ></div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-[9px] pt-1">
                  <div className="p-1.5 rounded-lg border border-border/20 bg-secondary/10">
                    <span className="block text-[7.5px] font-black uppercase text-gray-500">Pending Tasks</span>
                    <span className="text-xs font-black text-amber-400">{toolData.taskStats.pending}</span>
                  </div>
                  <div className="p-1.5 rounded-lg border border-border/20 bg-secondary/10">
                    <span className="block text-[7.5px] font-black uppercase text-gray-500">Completed Tasks</span>
                    <span className="text-xs font-black text-emerald-400">{toolData.taskStats.completed}</span>
                  </div>
                </div>
              </div>
            )}

            {toolData.reviews && toolData.reviews.length > 0 && (
              <div className="space-y-1.5 text-left">
                <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Performance Reviews</span>
                <div className="space-y-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                  {toolData.reviews.map((rev: any, idx: number) => (
                    <div key={idx} className="p-2.5 border border-border/30 bg-secondary/10 rounded-xl space-y-1.5 text-[9.5px]">
                      <div className="flex justify-between items-center">
                        <span className="text-amber-400 font-extrabold flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star 
                              key={i} 
                              className={`w-2.5 h-2.5 ${i < rev.rating ? "fill-amber-400 text-amber-400" : "text-gray-600"}`} 
                            />
                          ))}
                        </span>
                        <span className="text-[7.5px] font-bold text-gray-500">
                          {new Date(rev.date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                      <p className="text-gray-300 italic leading-relaxed">"{rev.feedback}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toolData.recentActivities && toolData.recentActivities.length > 0 && (
              <div className="space-y-1.5 text-left">
                <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Recent Activity Logs</span>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                  {toolData.recentActivities.map((act: any, idx: number) => (
                    <div key={idx} className="p-2 border border-border/30 bg-secondary/10 rounded-xl flex justify-between items-center gap-2 text-[9px]">
                      <span className="text-gray-300 font-medium truncate max-w-[190px]">• {act.description}</span>
                      <span className="text-[7px] font-black uppercase bg-secondary border border-border/40 text-gray-400 px-1 py-0.2 rounded flex-shrink-0">
                        {act.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }
    }

    case "getAttendanceRecord": {
      if (!Array.isArray(toolData)) return null;
      return (
        <div className="glass rounded-2xl border border-border/80 p-4 space-y-4 w-full max-w-xl bg-card/30 text-left">
          <div className="flex items-center justify-between border-b border-border/30 pb-2">
            <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
              <Clock className="w-4 h-4 text-primary glow-primary animate-pulse" /> Shift Attendance & Analytics Graph
            </div>
            <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
              {toolData.length} Logs Analyzed
            </span>
          </div>

          {/* Metric Overview (Present / Late / Absent Rates) */}
          {toolData.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5 text-center">
              {(() => {
                const total = toolData.length;
                const present = toolData.filter((a: any) => a.status === "PRESENT").length;
                const late = toolData.filter((a: any) => a.status === "LATE").length;
                const absent = toolData.filter((a: any) => a.status === "ABSENT").length;
                const onLeave = toolData.filter((a: any) => a.status === "ON_LEAVE").length;
                
                const presentPct = Math.round((present / total) * 100) || 0;
                const latePct = Math.round((late / total) * 100) || 0;
                const absentPct = Math.round(((absent + onLeave) / total) * 100) || 0;

                return (
                  <>
                    {[
                      { label: "Present Rate", pct: presentPct, val: present, color: "text-emerald-400" },
                      { label: "Late Rate", pct: latePct, val: late, color: "text-amber-400" },
                      { label: "Absent/Leave", pct: absentPct, val: absent + onLeave, color: "text-red-400" }
                    ].map((metric, i) => (
                      <div key={i} className="p-2 border border-border/30 bg-secondary/10 rounded-xl flex flex-col justify-between">
                        <span className="text-[7.5px] font-black uppercase text-gray-500 tracking-wider">{metric.label}</span>
                        <span className={`text-base font-black mt-1 ${metric.color}`}>{metric.pct}%</span>
                        <span className="text-[8px] text-gray-400 font-bold mt-0.5">{metric.val} Days</span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          )}

          {/* Interactive Attendance History Chart */}
          {toolData.length > 0 && (() => {
            const uniqueEmployees = Array.from(new Set(toolData.map((a: any) => a.employeeName)));
            const isSingleEmployee = uniqueEmployees.length <= 1;

            if (isSingleEmployee) {
              return (
                <div className="space-y-1.5">
                  <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Attendance Activity Graph (Daily Timeline)</span>
                  <div className="p-3 bg-secondary/20 border border-border/40 rounded-xl flex flex-col gap-2 relative">
                    <div className="h-28 flex items-end justify-between gap-1 pt-4 relative">
                      {/* Gridlines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10">
                        <div className="w-full border-t border-gray-400"></div>
                        <div className="w-full border-t border-gray-400"></div>
                        <div className="w-full border-t border-gray-400"></div>
                      </div>

                      {toolData.slice(0, 10).reverse().map((att: any, idx: number) => {
                        let hours = 0;
                        if (att.status === "PRESENT") hours = 9;
                        else if (att.status === "LATE") hours = 7.5;
                        
                        const barHeight = (hours / 10) * 100;
                        const isPresent = att.status === "PRESENT";
                        const isLate = att.status === "LATE";
                        const barColor = isPresent ? "from-emerald-500 to-teal-400" : isLate ? "from-amber-500 to-orange-400" : "from-red-500 to-pink-500";

                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group/bar relative">
                            <div className="absolute bottom-full mb-1 bg-card border border-border text-[8px] font-black text-white px-2 py-0.5 rounded shadow-xl opacity-0 group-hover/bar:opacity-100 transition-opacity z-50 pointer-events-none whitespace-nowrap">
                              {att.status}: {hours} Hours ({att.dateStr})
                            </div>
                            <div 
                              className={`w-full rounded-t bg-gradient-to-t ${barColor} glow-primary transition-all duration-1000`} 
                              style={{ height: `${Math.max(barHeight, 8)}%` }}
                            ></div>
                            <span className="text-[7.5px] font-extrabold text-gray-500 truncate max-w-[36px]">
                              {new Date(att.dateStr).toLocaleDateString([], { month: "short", day: "numeric" })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            } else {
              const employeeStats = uniqueEmployees.map((empName: any) => {
                const empLogs = toolData.filter((a: any) => a.employeeName === empName);
                const total = empLogs.length;
                const present = empLogs.filter((a: any) => a.status === "PRESENT").length;
                const late = empLogs.filter((a: any) => a.status === "LATE").length;
                const absent = empLogs.filter((a: any) => a.status === "ABSENT").length;
                const onLeave = empLogs.filter((a: any) => a.status === "ON_LEAVE").length;
                const activeRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
                return {
                  name: empName,
                  activeRate,
                  present,
                  late,
                  absent,
                  onLeave,
                  role: empLogs[0]?.employeeRole || "Staff",
                };
              });

              return (
                <div className="space-y-1.5">
                  <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Team Attendance Comparison Chart</span>
                  <div className="p-3 bg-secondary/20 border border-border/40 rounded-xl flex flex-col gap-3 relative">
                    {employeeStats.map((emp: any, idx: number) => (
                      <div key={idx} className="space-y-1 group/bar relative text-left">
                        <div className="flex justify-between text-[9.5px] text-gray-300 font-bold">
                          <span className="flex items-center gap-1.5">
                            👤 {emp.name}
                            <span className="text-[7px] font-black uppercase bg-secondary border border-border/40 px-1 py-0.2 rounded text-gray-400">
                              {emp.role.replace("SUPER_", "")}
                            </span>
                          </span>
                          <span className="text-white font-extrabold">{emp.activeRate}% Rate ({emp.present}P / {emp.late}L / {emp.absent + emp.onLeave}A)</span>
                        </div>
                        <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden border border-border/20">
                          <div 
                            className="h-full bg-gradient-to-r from-primary to-secondary glow-primary rounded-full transition-all duration-1000"
                            style={{ width: `${emp.activeRate}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
          })()}

          {/* Scrolling Check-in Check-out Timeline Logs */}
          <div className="space-y-1.5">
            <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider">Detailed Shift Logs Timeline</span>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
              {toolData.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic text-center py-4">No attendance check-in records found for this criteria.</p>
              ) : (
                toolData.map((att: any) => {
                  const isPresent = att.status === "PRESENT";
                  const isLate = att.status === "LATE";
                  
                  return (
                    <div key={att.id} className="p-2.5 border border-border/30 bg-secondary/10 hover:bg-secondary/25 rounded-xl transition-all flex justify-between items-center gap-4 text-xs">
                      <div className="text-left space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-white truncate">{att.employeeName}</span>
                          <span className="text-[7.5px] font-black bg-secondary border border-border/40 text-gray-400 px-1 py-0.2 rounded uppercase">
                            {att.employeeRole.replace("SUPER_", "")}
                          </span>
                        </div>
                        {att.checkoutSummary && (
                          <p className="text-[10px] text-gray-500 italic truncate max-w-[280px]" title={att.checkoutSummary}>
                            "{att.checkoutSummary}"
                          </p>
                        )}
                        <span className="block text-[8px] font-bold text-gray-500">📅 {att.dateStr}</span>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className={`inline-block text-[7.5px] font-black uppercase px-2 py-0.5 rounded border ${
                          isPresent ? "bg-green-500/10 border-green-500/20 text-green-400" :
                          isLate ? "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse" :
                          "bg-red-500/10 border-red-500/20 text-red-400"
                        }`}>{att.status}</span>
                        <div className="text-[9px] text-gray-400 font-semibold mt-1 space-y-0.2">
                          {att.checkIn && (
                            <div>In: {new Date(att.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          )}
                          {att.checkOut && (
                            <div>Out: {new Date(att.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
    }

    case "runQueryPlan":
    case "runDatabaseQuery": {
      return (
        <div className="space-y-3.5 w-full">
          {/* SQL code drawer */}
          {toolData.query && (
            <div className="space-y-1 text-left">
              <button
                type="button"
                onClick={() => toggleQuery(msgId)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/40 hover:border-slate-700/80 rounded-xl text-[10px] text-gray-300 transition-all font-mono outline-none cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>{expandedQueries[msgId] ? "Hide SQL Query" : "View SQL Query"}</span>
                {expandedQueries[msgId] ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
              </button>
              {expandedQueries[msgId] && (
                <div className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[10px] text-cyan-400 overflow-x-auto shadow-inner w-full max-w-xl whitespace-pre scrollbar-thin">
                  {toolData.query}
                </div>
              )}
            </div>
          )}

          {/* Database results error visualization */}
          {toolData.error && (
            <div className="p-3 border border-red-500/30 bg-red-500/10 rounded-xl text-red-400 text-xs font-semibold leading-relaxed text-left max-w-xl animate-fade-in">
              ⚠️ Query Error: {toolData.message || toolData.error}
            </div>
          )}

          {/* Database results success visualization */}
          {toolData.rows && Array.isArray(toolData.rows) && (
            <div className="glass rounded-2xl border border-border/80 p-5 space-y-4 max-w-xl bg-card/30 text-left animate-fade-in shadow-2xl">
              <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-black text-primary uppercase tracking-widest">
                  <Database className="w-4 h-4 text-primary glow-primary" />
                  <span>{toolData.visualization?.config?.title || "Database Query Result"}</span>
                </div>
                <span className="text-[8px] font-black uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-white">
                  {toolData.rows.length} records
                </span>
              </div>

              {toolData.rows.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-3">No database records found matching this query.</p>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const visType = toolData.visualization?.type || "table";
                    const config = toolData.visualization?.config || {};
                    const keys = Object.keys(toolData.rows[0]);
                    const xKey = config.xKey || keys[0];
                    const yKey = config.yKeys?.[0] || keys.find(k => k !== xKey && (typeof toolData.rows[0][k] === 'number' || !isNaN(parseFloat(toolData.rows[0][k]))));
                    const yValues = toolData.rows.map((r: any) => yKey ? parseFloat(r[yKey]) || 0 : 0);

                    // Table View
                    if (visType === "table" || !yKey) {
                      return (
                        <div className="overflow-x-auto border border-border/30 rounded-xl scrollbar-thin">
                          <table className="w-full text-left border-collapse text-[10.5px]">
                            <thead>
                              <tr className="bg-secondary/35 border-b border-border/40 text-gray-400 font-extrabold uppercase text-[8px] tracking-wider">
                                {keys.map((col, i) => (
                                  <th key={i} className="px-3 py-2">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                              {toolData.rows.map((row: any, ri: number) => (
                                <tr key={ri} className="hover:bg-secondary/15 transition-all text-gray-200">
                                  {keys.map((col, ci) => {
                                    const val = row[col];
                                    return (
                                      <td key={ci} className="px-3 py-2 truncate max-w-[150px]" title={String(val)}>
                                        {val instanceof Date ? new Date(val).toLocaleDateString() : typeof val === 'number' ? val.toLocaleString() : String(val)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }

                    // Prepare chart data (cap at 8 items)
                    const chartData = toolData.rows.slice(0, 8).map((row: any) => {
                      const rawX = row[xKey];
                      let xLabel = "";
                      if (rawX instanceof Date) {
                        xLabel = new Date(rawX).toLocaleDateString([], { month: "short", day: "numeric" });
                      } else if (typeof rawX === 'string' && rawX.includes("T") && !isNaN(Date.parse(rawX))) {
                        xLabel = new Date(rawX).toLocaleDateString([], { month: "short", day: "numeric" });
                      } else {
                        xLabel = String(rawX);
                      }
                      const yVal = parseFloat(row[yKey]) || 0;
                      return { label: xLabel, value: yVal };
                    });

                    const maxY = Math.max(...yValues, 1);
                    const minY = Math.min(...yValues, 0);

                    // Bar Chart View
                    if (visType === "bar_chart") {
                      return (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center text-[9px] text-gray-500 font-black uppercase px-1">
                            <span>{xKey}</span>
                            <span>{yKey}</span>
                          </div>
                          <div className="p-3 bg-secondary/15 border border-border/30 rounded-xl flex flex-col gap-2.5">
                            {chartData.map((data: any, idx: number) => {
                              const percent = Math.max((data.value / maxY) * 100, 4);
                              const barColors = [
                                "from-cyan-500 to-blue-400",
                                "from-purple-500 to-indigo-400",
                                "from-emerald-500 to-teal-400",
                                "from-amber-500 to-orange-400",
                                "from-pink-500 to-rose-400"
                              ];
                              const color = barColors[idx % barColors.length];

                              return (
                                <div key={idx} className="space-y-1 text-[9.5px]">
                                  <div className="flex justify-between text-gray-300 font-bold">
                                    <span className="truncate max-w-[160px]">{data.label}</span>
                                    <span className="text-white font-extrabold">{data.value.toLocaleString()}</span>
                                  </div>
                                  <div className="w-full h-2 bg-secondary/40 rounded-full overflow-hidden border border-border/20">
                                    <div
                                      className={`h-full bg-gradient-to-r ${color} glow-primary rounded-full transition-all duration-1000`}
                                      style={{ width: `${percent}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    // Line Chart View
                    if (visType === "line_chart") {
                      const width = 450;
                      const height = 180;
                      const padding = 30;
                      const yKeys: string[] = config.yKeys || [yKey];

                      const lineChartData = toolData.rows.slice(0, 12).map((row: any) => {
                        const rawX = row[xKey];
                        let xLabel = "";
                        if (rawX instanceof Date) {
                          xLabel = new Date(rawX).toLocaleDateString([], { month: "short", day: "numeric" });
                        } else if (typeof rawX === 'string' && rawX.includes("T") && !isNaN(Date.parse(rawX))) {
                          xLabel = new Date(rawX).toLocaleDateString([], { month: "short", day: "numeric" });
                        } else {
                          xLabel = String(rawX);
                        }
                        
                        const values: Record<string, number> = {};
                        yKeys.forEach((yk: string) => {
                          values[yk] = parseFloat(row[yk]) || 0;
                        });

                        return { label: xLabel, values };
                      });

                      const allYValues = lineChartData.flatMap((d: any) => Object.values(d.values) as number[]);
                      const chartMaxY = Math.max(...allYValues, 1);
                      const chartMinY = Math.min(...allYValues, 0);

                      const lineColors = [
                        "#06b6d4", // Cyan
                        "#8b5cf6", // Purple
                        "#ec4899", // Pink
                        "#f59e0b", // Amber
                        "#10b981", // Emerald
                        "#3b82f6", // Blue
                      ];

                      return (
                        <div className="space-y-2">
                          <div className="p-3 bg-secondary/15 border border-border/30 rounded-xl overflow-hidden flex justify-center">
                            <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
                              <defs>
                                {yKeys.map((yk: string, yIdx: number) => {
                                  const color = lineColors[yIdx % lineColors.length];
                                  return (
                                    <linearGradient key={`grad-${yIdx}`} id={`areaGrad-${yIdx}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
                                      <stop offset="100%" stopColor={color} stopOpacity="0"/>
                                    </linearGradient>
                                  );
                                })}
                                <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                                  <feGaussianBlur stdDeviation="3" result="blur" />
                                  <feMerge>
                                    <feMergeNode in="blur" />
                                    <feMergeNode in="SourceGraphic" />
                                  </feMerge>
                                </filter>
                              </defs>

                              <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#334155" strokeDasharray="3" strokeWidth="0.5" opacity="0.3"/>
                              <line x1={padding} y1={(height) / 2} x2={width - padding} y2={(height) / 2} stroke="#334155" strokeDasharray="3" strokeWidth="0.5" opacity="0.3"/>
                              <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#475569" strokeWidth="1" opacity="0.5"/>

                              {/* Area */}
                              {yKeys.map((yk: string, yIdx: number) => {
                                const points = lineChartData.map((d: any, idx: number) => {
                                  const x = padding + (idx * (width - 2 * padding)) / Math.max(lineChartData.length - 1, 1);
                                  const yVal = d.values[yk] || 0;
                                  const y = height - padding - ((yVal - chartMinY) / (chartMaxY - chartMinY || 1)) * (height - 2 * padding);
                                  return { x, y };
                                });
                                const pathD = points.reduce((acc: string, p: any, idx: number) => {
                                  return acc + (idx === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
                                }, "");
                                const areaD = points.length > 0 
                                  ? `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
                                  : "";
                                return areaD ? <path key={`area-${yIdx}`} d={areaD} fill={`url(#areaGrad-${yIdx})`} /> : null;
                              })}

                              {/* Paths */}
                              {yKeys.map((yk: string, yIdx: number) => {
                                const points = lineChartData.map((d: any, idx: number) => {
                                  const x = padding + (idx * (width - 2 * padding)) / Math.max(lineChartData.length - 1, 1);
                                  const yVal = d.values[yk] || 0;
                                  const y = height - padding - ((yVal - chartMinY) / (chartMaxY - chartMinY || 1)) * (height - 2 * padding);
                                  return { x, y };
                                });
                                const pathD = points.reduce((acc: string, p: any, idx: number) => {
                                  return acc + (idx === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
                                }, "");
                                const color = lineColors[yIdx % lineColors.length];
                                return pathD ? (
                                  <path
                                    key={`line-${yIdx}`}
                                    d={pathD}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth="2.5"
                                    filter="url(#neonGlow)"
                                    className="transition-all duration-1000"
                                  />
                                ) : null;
                              })}

                              {/* Circle point markers */}
                              {yKeys.map((yk: string, yIdx: number) => {
                                const color = lineColors[yIdx % lineColors.length];
                                return lineChartData.map((d: any, idx: number) => {
                                  const x = padding + (idx * (width - 2 * padding)) / Math.max(lineChartData.length - 1, 1);
                                  const yVal = d.values[yk] || 0;
                                  const y = height - padding - ((yVal - chartMinY) / (chartMaxY - chartMinY || 1)) * (height - 2 * padding);
                                  
                                  return (
                                    <g key={`dot-${yIdx}-${idx}`} className="group/dot cursor-pointer">
                                      <circle
                                        cx={x}
                                        cy={y}
                                        r="4.5"
                                        className="fill-slate-900 stroke-[2] transition-all hover:scale-150"
                                        stroke={color}
                                        filter="url(#neonGlow)"
                                      />
                                      <text
                                        x={x}
                                        y={y - 10}
                                        textAnchor="middle"
                                        className="fill-white text-[8px] font-black opacity-0 group-hover/dot:opacity-100 transition-opacity bg-slate-950 px-1 py-0.5 rounded pointer-events-none"
                                      >
                                        {yk}: {yVal.toLocaleString()}
                                      </text>
                                    </g>
                                  );
                                });
                              })}

                              {/* X Axis Labels */}
                              {lineChartData.map((d: any, idx: number) => {
                                const x = padding + (idx * (width - 2 * padding)) / Math.max(lineChartData.length - 1, 1);
                                return (
                                  <text
                                    key={`lbl-${idx}`}
                                    x={x}
                                    y={height - 10}
                                    textAnchor="middle"
                                    className="fill-gray-500 text-[7px] font-black"
                                  >
                                    {d.label}
                                  </text>
                                );
                              })}
                            </svg>
                          </div>
                          
                          {/* Legend */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center justify-center text-[8px] font-black uppercase text-gray-500 tracking-wider px-1 mt-2">
                            {yKeys.map((yk: string, yIdx: number) => {
                              const color = lineColors[yIdx % lineColors.length];
                              return (
                                <span key={yIdx} className="flex items-center gap-1.5 bg-secondary/10 px-2 py-1 rounded-lg border border-border/20">
                                  <span className="w-2.5 h-0.5 rounded-full inline-block" style={{ backgroundColor: color }}></span>
                                  <span className="text-gray-300 font-bold">{yk}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    // Pie Chart View
                    if (visType === "pie_chart") {
                      const totalSum = yValues.reduce((acc: number, v: number) => acc + v, 0) || 1;
                      const donutColors = [
                        "text-cyan-400",
                        "text-purple-400",
                        "text-emerald-400",
                        "text-amber-400",
                        "text-pink-400",
                        "text-indigo-400",
                        "text-rose-400"
                      ];
                      const borderColors = [
                        "border-cyan-400/20",
                        "border-purple-400/20",
                        "border-emerald-400/20",
                        "border-amber-400/20",
                        "border-pink-400/20",
                        "border-indigo-400/20",
                        "border-rose-400/20"
                      ];

                      return (
                        <div className="space-y-4 animate-fade-in">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                            
                            <div className="flex justify-center items-center py-2 relative">
                              <svg width="140" height="140" viewBox="0 0 140 140" className="transform -rotate-90">
                                <circle
                                  cx="70"
                                  cy="70"
                                  r="50"
                                  className="fill-none stroke-slate-800"
                                  strokeWidth="12"
                                />
                                {(() => {
                                  let accumulatedPercentage = 0;
                                  return chartData.map((d: any, idx: number) => {
                                    const percent = (d.value / totalSum) * 100;
                                    const r = 50;
                                    const circ = 2 * Math.PI * r;
                                    const strokeDash = (percent / 100) * circ;
                                    const strokeOffset = circ - (accumulatedPercentage / 100) * circ;
                                    accumulatedPercentage += percent;

                                    const strokeColors = [
                                      "#22d3ee", "#c084fc", "#34d399", "#fbbf24", "#f472b6", "#818cf8", "#fb7185"
                                    ];
                                    const strokeColor = strokeColors[idx % strokeColors.length];

                                    return (
                                      <circle
                                        key={idx}
                                        cx="70"
                                        cy="70"
                                        r="50"
                                        className="fill-none transition-all duration-1000"
                                        strokeWidth="12"
                                        stroke={strokeColor}
                                        strokeDasharray={`${strokeDash} ${circ}`}
                                        strokeDashoffset={strokeOffset}
                                        strokeLinecap="round"
                                      />
                                    );
                                  });
                                })()}
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-[14px] font-black text-white glow-primary">{totalSum.toLocaleString()}</span>
                                <span className="text-[7.5px] font-black uppercase text-gray-500 tracking-wider">Total Sum</span>
                              </div>
                            </div>

                            <div className="space-y-2 text-[9.5px]">
                              {chartData.map((d: any, idx: number) => {
                                const percent = Math.round((d.value / totalSum) * 100) || 0;
                                const textColor = donutColors[idx % donutColors.length];
                                const borderBg = borderColors[idx % borderColors.length];

                                return (
                                  <div key={idx} className={`p-2 border ${borderBg} bg-secondary/10 rounded-xl flex justify-between items-center gap-2`}>
                                    <span className="flex items-center gap-1.5 truncate max-w-[120px] font-bold text-gray-300">
                                      <span className={`w-2 h-2 rounded-full ${textColor} bg-current`}></span>
                                      {d.label}
                                    </span>
                                    <span className="text-white font-extrabold shrink-0">{d.value.toLocaleString()} ({percent}%)</span>
                                  </div>
                                );
                              })}
                            </div>
                            
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
};

export default DatabaseWidgets;
