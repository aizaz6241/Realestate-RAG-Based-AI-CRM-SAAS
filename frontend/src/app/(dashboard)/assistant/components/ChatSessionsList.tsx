import React from "react";
import { Plus, Loader2, Trash2 } from "lucide-react";

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
}

interface ChatSessionsListProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoadingSessions: boolean;
  onCreateNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (e: React.MouseEvent, id: string) => void;
}

export const ChatSessionsList: React.FC<ChatSessionsListProps> = ({
  sessions,
  activeSessionId,
  isLoadingSessions,
  onCreateNewChat,
  onSelectSession,
  onDeleteSession
}) => {
  return (
    <div className="lg:col-span-2 glass rounded-3xl border border-border/60 p-4 bg-card/25 flex flex-col overflow-hidden text-left shadow-xl h-full">
      {/* "+ New Chat" Button */}
      <button
        onClick={onCreateNewChat}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary/95 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl glow-primary transition-all duration-300 hover:scale-[1.02] active:scale-95 mb-4 flex-shrink-0 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        New Chat
      </button>

      <span className="block text-[8px] font-black uppercase text-gray-500 tracking-wider mb-2.5 pl-1.5 flex-shrink-0">
        Recent Conversations
      </span>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
        {isLoadingSessions ? (
          <div className="flex items-center justify-center py-10 gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary glow-primary" />
            <span>Loading...</span>
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-[10px] text-center text-muted-foreground italic py-10">No chats found.</p>
        ) : (
          sessions.map((sess) => {
            const isActive = activeSessionId === sess.id;
            return (
              <div
                key={sess.id}
                onClick={() => onSelectSession(sess.id)}
                className={`p-2.5 rounded-2xl border flex justify-between items-center gap-2 group transition-all duration-200 cursor-pointer ${
                  isActive 
                    ? "bg-primary/25 border-primary/40 shadow-lg glow-primary" 
                    : "bg-secondary/10 border-border/30 hover:bg-secondary/35 hover:border-border/60"
                }`}
              >
                <div className="overflow-hidden space-y-0.5 flex-1 select-none">
                  <p className={`text-[10.5px] font-extrabold truncate ${isActive ? "text-white" : "text-gray-300 group-hover:text-white"}`}>
                    {sess.title}
                  </p>
                  <span className="block text-[7.5px] text-gray-500 font-medium">
                    {new Date(sess.updatedAt || sess.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </span>
                </div>
                <button
                  onClick={(e) => onDeleteSession(e, sess.id)}
                  className="text-muted-foreground hover:text-red-400 p-1 rounded-md hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-pointer"
                  title="Delete Conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChatSessionsList;
