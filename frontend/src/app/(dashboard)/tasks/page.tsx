"use client";

import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Loader2, 
  X, 
  Calendar, 
  ClipboardList, 
  User, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Search,
  Filter,
  CheckSquare,
  Users2
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const COLUMNS = [
  { id: "PENDING", title: "New Tasks", color: "bg-cyan-500", text: "text-cyan-400", border: "border-cyan-500/20" },
  { id: "IN_PROGRESS", title: "In Progress", color: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/20" },
  { id: "COMPLETED", title: "Completed", color: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/20" },
  { id: "CANCELLED", title: "Cancelled", color: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/20" },
];

export default function TasksPage() {
  const { token, user: currentUser } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Tabs & Filters
  const [activeTab, setActiveTab] = useState("my-tasks"); // "my-tasks" | "delegated"
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssigneeFilter, setSelectedAssigneeFilter] = useState("ALL");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "PENDING",
    dueDate: "",
    assignedToId: "",
  });

  const fetchTasks = async (showLoading = false) => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    if (showLoading) setIsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
      // Fallback stubs
      setTasks([
        { 
          id: "mock1", 
          title: "Verify Front-Desk Roster", 
          description: "Verify operational check-in/out records from receptionist.", 
          status: "PENDING", 
          dueDate: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
          assignedToId: currentUser?.id,
          assignedTo: { id: currentUser?.id, firstName: "Me", role: currentUser?.role },
          createdById: "hr-id",
          createdBy: { id: "hr-id", firstName: "Ayesha", role: "HR" },
          createdAt: new Date() 
        },
        { 
          id: "mock2", 
          title: "Upload Malik Mansion documents", 
          description: "Upload KYC Emirates ID & Title deeds to Malik Mansion profile.", 
          status: "IN_PROGRESS", 
          dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
          assignedToId: "agent-id",
          assignedTo: { id: "agent-id", firstName: "Ali", role: "AGENT" },
          createdById: currentUser?.id,
          createdBy: { id: currentUser?.id, firstName: "Me", role: currentUser?.role },
          createdAt: new Date() 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/employees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setEmployees(await res.json());
      }
    } catch (e) {
      console.error("Error fetching employees:", e);
    }
  };

  useEffect(() => {
    fetchTasks(true);
    fetchEmployees();
  }, [token]);

  // Real-time polling for team updates (every 3 seconds)
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetchTasks(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [token]);

  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId !== destination.droppableId) {
      const updatedStatus = destination.droppableId;
      
      // Optimistic state update
      setTasks(tasks.map(t => t.id === draggableId ? { ...t, status: updatedStatus } : t));
      
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tasks/${draggableId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: updatedStatus }),
        });
      } catch (error) {
        console.error("Failed to update task status on server:", error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title,
        description: formData.description || null,
        status: formData.status,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        assignedToId: formData.assignedToId || undefined, // undefined triggers backend auto round-robin or me
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFormData({
          title: "",
          description: "",
          status: "PENDING",
          dueDate: "",
          assignedToId: "",
        });
        fetchTasks(false);
      }
    } catch (error) {
      console.error("Error creating task:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this task?")) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchTasks(false);
      }
    } catch (e) {
      console.error("Error deleting task:", e);
    }
  };

  const getDeadlineStyle = (dueDateStr: string) => {
    if (!dueDateStr) return "text-gray-400";
    const now = new Date();
    const due = new Date(dueDateStr);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "text-red-400 font-extrabold shadow-[0_0_8px_rgba(239,68,68,0.1)]";
    if (diffDays <= 2) return "text-amber-400 font-bold";
    return "text-gray-400";
  };

  // Dynamic Workspace filtering
  const workspaceTasks = tasks.filter(t => {
    if (activeTab === "my-tasks") {
      // Tasks assigned to me
      return t.assignedToId === currentUser?.id;
    } else {
      // Tasks delegated by me to other colleagues
      return t.createdById === currentUser?.id && t.assignedToId !== currentUser?.id;
    }
  });

  // Local search and assignee filters
  const filteredTasks = workspaceTasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAssignee = selectedAssigneeFilter === "ALL" || t.assignedToId === selectedAssigneeFilter;
    return matchesSearch && matchesAssignee;
  });

  const isSupervisor = ["SUPER_ADMIN", "ADMIN", "HR", "FINANCE", "SALES_MANAGER"].includes(currentUser?.role || "");

  return (
    <div className="min-h-screen p-8 relative z-10 overflow-x-hidden space-y-8">
      {/* Background Neon Glows */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* Header */}
      <div className="flex justify-between items-center animate-fade-in">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Task Command Kanban</h1>
          <p className="text-muted-foreground mt-1">Organize operational workflows, client coordinates checklist, and track team progress in real-time.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary/95 text-white px-5 py-3 rounded-xl font-semibold flex items-center gap-2 glow-primary transition-all duration-300 hover:scale-[1.03]"
        >
          <Plus className="w-5 h-5" />
          Add Task
        </button>
      </div>

      {/* Double Workspace Tabs & Filters Bar */}
      <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between animate-fade-in bg-secondary/10 p-4 rounded-3xl border border-border/40 backdrop-blur-md">
        
        {/* Workspace Selectors */}
        <div className="flex gap-2 p-1 bg-secondary/40 border border-border/50 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab("my-tasks")}
            className={`px-4.5 py-2.5 rounded-xl text-xs uppercase tracking-widest font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === "my-tasks"
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CheckSquare className="w-4 h-4" /> My Work Terminal
          </button>
          
          {isSupervisor && (
            <button
              onClick={() => setActiveTab("delegated")}
              className={`px-4.5 py-2.5 rounded-xl text-xs uppercase tracking-widest font-black transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "delegated"
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users2 className="w-4 h-4" /> Delegated Monitor ({tasks.filter(t => t.createdById === currentUser?.id && t.assignedToId !== currentUser?.id).length})
            </button>
          )}
        </div>

        {/* Global Filters */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center flex-1 max-w-2xl">
          <div className="flex-1 flex items-center gap-2.5 bg-secondary/30 border border-border/60 rounded-xl px-3 py-1.5">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tasks..."
              className="bg-transparent border-0 outline-none text-xs text-white w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {activeTab === "delegated" && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Filter className="w-3.5 h-3.5 text-primary" />
              <select
                className="glass-input px-3 py-1.5 rounded-xl text-xs bg-secondary border border-border/60 outline-none"
                value={selectedAssigneeFilter}
                onChange={(e) => setSelectedAssigneeFilter(e.target.value)}
              >
                <option value="ALL">All Assignees</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName || ""}</option>
                ))}
              </select>
            </div>
          )}
        </div>

      </div>

      {/* Kanban Board columns */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-6 overflow-x-auto pb-8 snap-x min-h-[600px] scrollbar-thin">
            {COLUMNS.map((col) => {
              const columnTasks = filteredTasks.filter(t => t.status === col.id);
              return (
                <div key={col.id} className="min-w-[320px] max-w-[320px] flex flex-col snap-center">
                  
                  {/* Column Header */}
                  <div className={`flex justify-between items-center mb-4 px-3 py-2 rounded-xl bg-secondary/30 border ${col.border} backdrop-blur-md`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`w-3.5 h-3.5 rounded-full ${col.color} shadow-[0_0_10px_currentColor]`}></div>
                      <h3 className="font-bold text-sm tracking-wide text-white">{col.title}</h3>
                    </div>
                    <span className="text-xs font-black bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full text-gray-300">
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Droppable Board Area */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 glass rounded-3xl p-3.5 flex flex-col gap-4 min-h-[480px] border border-border/40 transition-all duration-300 ${
                          snapshot.isDraggingOver ? "bg-primary/5 border-primary/30" : ""
                        }`}
                      >
                        {columnTasks.length === 0 ? (
                          <div className="text-center py-10 text-[10px] text-muted-foreground border border-dashed border-border/40 rounded-2xl">
                            No tasks in this stage
                          </div>
                        ) : (
                          columnTasks.map((task, index) => (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`bg-card/75 hover:bg-card border border-border/50 rounded-2xl p-4.5 shadow-md transition-all duration-300 relative group flex flex-col justify-between ${
                                    snapshot.isDragging ? "glow-primary border-primary bg-card/95 scale-[1.02] rotate-1" : "hover:border-primary/40"
                                  }`}
                                >
                                  <div className="space-y-3">
                                    {/* Card Title Header */}
                                    <div className="flex justify-between items-start gap-2">
                                      <h4 className="font-extrabold text-white text-sm leading-snug">
                                        {task.title}
                                      </h4>
                                      
                                      <button
                                        onClick={(e) => handleDeleteTask(task.id, e)}
                                        className="text-gray-500 hover:text-red-400 transition-colors p-1"
                                        title="Delete Task"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    {/* Description */}
                                    {task.description && (
                                      <p className="text-xs text-gray-300 font-medium leading-relaxed truncate-3-lines">
                                        {task.description}
                                      </p>
                                    )}
                                  </div>

                                  {/* Card Footer Details */}
                                  <div className="mt-4 pt-3 border-t border-border/40 flex flex-col gap-2.5">
                                    {/* Due Date Indicator */}
                                    {task.dueDate && (
                                      <div className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider ${getDeadlineStyle(task.dueDate)}`}>
                                        <Calendar className="w-3.5 h-3.5 text-primary" />
                                        <span>Due: {new Date(task.dueDate).toLocaleDateString([], { dateStyle: 'medium' })}</span>
                                      </div>
                                    )}

                                    {/* Context specific avatar tag */}
                                    {activeTab === "my-tasks" ? (
                                      <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-black uppercase tracking-wider">
                                        <User className="w-3.5 h-3.5 text-primary" />
                                        <span>Delegated By: <strong className="text-white">{task.createdBy ? `${task.createdBy.firstName} [${task.createdBy.role}]` : "System"}</strong></span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-black uppercase tracking-wider">
                                        <User className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                                        <span>Assignee: <strong className="text-white">{task.assignedTo ? `${task.assignedTo.firstName} [${task.assignedTo.role}]` : "Unassigned"}</strong></span>
                                      </div>
                                    )}
                                  </div>

                                </div>
                              )}
                            </Draggable>
                          ))
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

      {/* Add Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-lg rounded-2xl overflow-hidden border border-primary/40 shadow-2xl glow-primary">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Add New Task
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Task Title</label>
                <input
                  required
                  type="text"
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm"
                  placeholder="Verify Bahria flats price fluctuations logs"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Description details</label>
                <textarea
                  rows={3}
                  className="w-full glass-input px-4 py-2.5 rounded-xl text-sm resize-none"
                  placeholder="Coordinate with specific listings manager..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Initial Status</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="PENDING">New Task Queue</option>
                    <option value="IN_PROGRESS">Active In Progress</option>
                    <option value="COMPLETED">Completed Finish</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Roster Assignee</label>
                  <select
                    className="w-full glass-input px-4 py-2.5 rounded-xl text-sm bg-secondary"
                    value={formData.assignedToId}
                    onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                  >
                    <option value="">-- Assign to Me / Creator --</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.firstName} {e.lastName || ""} ({e.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-1.5">Due Date Deadline</label>
                <input
                  type="date"
                  className="w-full glass-input px-4 py-2 rounded-xl text-sm bg-secondary"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-border/60">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-gray-300 hover:text-white hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center gap-2 glow-primary transition-all">{isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
