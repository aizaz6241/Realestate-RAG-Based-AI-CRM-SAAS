import React, { useRef } from "react";
import { UploadCloud, Loader2, BookOpen, RefreshCw, Search, FileText, Trash2 } from "lucide-react";

interface DocumentItem {
  id: string;
  name: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

interface RagDocumentsDrawerProps {
  documents: DocumentItem[];
  isUploading: boolean;
  searchDocQuery: string;
  onSearchDocQueryChange: (query: string) => void;
  showNoteUpload: boolean;
  onToggleNoteUpload: (show: boolean) => void;
  noteName: string;
  onNoteNameChange: (name: string) => void;
  noteContent: string;
  onNoteContentChange: (content: string) => void;
  onNoteSubmit: (e: React.FormEvent) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSyncIndices: () => void;
  onDeleteDocument?: (id: string) => void;
}

export const RagDocumentsDrawer: React.FC<RagDocumentsDrawerProps> = ({
  documents,
  isUploading,
  searchDocQuery,
  onSearchDocQueryChange,
  showNoteUpload,
  onToggleNoteUpload,
  noteName,
  onNoteNameChange,
  noteContent,
  onNoteContentChange,
  onNoteSubmit,
  onFileUpload,
  onSyncIndices,
  onDeleteDocument
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const filteredDocs = documents.filter((d) => 
    d.name.toLowerCase().includes(searchDocQuery.toLowerCase())
  );

  return (
    <div className="lg:col-span-3 flex flex-col gap-6 h-full overflow-hidden">
      
      {/* Drag & Drop Vector Upload Cabinet */}
      <div className="glass rounded-3xl border border-border/60 p-4 bg-card/25 text-center flex flex-col justify-between items-center gap-4 relative overflow-hidden flex-shrink-0">
        {isUploading && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary glow-primary" />
            <span className="text-[10px] font-black uppercase text-primary tracking-widest">Generating Embeddings...</span>
          </div>
        )}
        
        <div className="space-y-1.5 text-left w-full border-b border-border/30 pb-2 flex justify-between items-center">
          <div>
            <h3 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
              <UploadCloud className="w-4 h-4 text-primary" /> Vector Upload Zone
            </h3>
            <p className="text-[9px] text-muted-foreground">Upload and index unstructured files inside RAG pipeline.</p>
          </div>
          <button 
            onClick={() => onToggleNoteUpload(!showNoteUpload)}
            className="text-[9px] font-black uppercase border border-border px-2 py-0.5 rounded bg-secondary/50 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            {showNoteUpload ? "File Upload" : "Paste Note"}
          </button>
        </div>

        {/* Ingest paste note layout */}
        {showNoteUpload ? (
          <form onSubmit={onNoteSubmit} className="w-full flex flex-col gap-2.5 text-left">
            <input 
              type="text"
              placeholder="Note Title (e.g. DHA Policy Changes)"
              className="glass-input text-[11px] px-2.5 py-1.5 rounded-lg border border-border/80 w-full outline-none bg-secondary/40 text-white placeholder-gray-500"
              value={noteName}
              onChange={(e) => onNoteNameChange(e.target.value)}
            />
            <textarea 
              required
              placeholder="Paste manual note or list specifications here..."
              className="glass-input text-[11px] px-2.5 py-1.5 rounded-lg border border-border/80 w-full h-24 outline-none resize-none bg-secondary/40 text-white placeholder-gray-500"
              value={noteContent}
              onChange={(e) => onNoteContentChange(e.target.value)}
            />
            <button
              type="submit"
              className="w-full bg-primary hover:bg-primary/95 text-white py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider glow-primary transition-transform active:scale-95 cursor-pointer"
            >
              Index Text Note
            </button>
          </form>
        ) : (
          /* PDF/TXT standard file picker */
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-border/60 hover:border-primary/50 bg-secondary/10 hover:bg-primary/5 rounded-2xl p-6 transition-all cursor-pointer flex flex-col items-center gap-2 group"
          >
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".pdf,.txt" 
              onChange={onFileUpload}
            />
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <UploadCloud className="w-5 h-5 glow-primary" />
            </div>
            <div className="space-y-0.5">
              <span className="block text-[10px] font-black text-white uppercase group-hover:text-primary transition-colors">Select PDF or TXT</span>
              <span className="block text-[8px] text-gray-500">Maximum size limit is 10 MB.</span>
            </div>
          </div>
        )}
      </div>

      {/* Knowledge Base Logs Cabinet */}
      <div className="glass rounded-3xl border border-border/60 p-4 bg-card/25 flex-1 flex flex-col overflow-hidden text-left shadow-xl">
        
        <div className="flex-shrink-0 border-b border-border/30 pb-3 flex justify-between items-center">
          <div>
            <h3 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-primary" /> Knowledge Base ({documents.length})
            </h3>
            <p className="text-[9px] text-muted-foreground">Indexed sources queried by Chat Assistant.</p>
          </div>
          <button 
            onClick={onSyncIndices}
            className="p-1 text-gray-500 hover:text-white transition-colors cursor-pointer"
            title="Sync Indices"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Roster Search Bar */}
        <div className="flex-shrink-0 mt-3 mb-2 flex items-center gap-2 bg-secondary/30 border border-border/60 rounded-xl px-2.5 py-1">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input 
            type="text"
            placeholder="Search indexed files..."
            className="w-full bg-transparent border-0 outline-none focus:ring-0 text-[10px] text-white py-1"
            value={searchDocQuery}
            onChange={(e) => onSearchDocQueryChange(e.target.value)}
          />
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto space-y-2 mt-2 scrollbar-thin">
          {filteredDocs.length === 0 ? (
            <p className="text-[10px] text-center text-muted-foreground italic py-10">No indexed document logs found.</p>
          ) : (
            filteredDocs.map((doc) => (
              <div key={doc.id} className="p-2.5 rounded-2xl border border-border/30 bg-secondary/15 hover:bg-secondary/35 flex justify-between items-center gap-2 group transition-all">
                <div className="overflow-hidden space-y-0.5 flex-1">
                  <p className="text-[10px] font-black text-white truncate flex items-center gap-1">
                    <FileText className="w-3 h-3 text-primary flex-shrink-0" />
                    {doc.name}
                  </p>
                  <div className="flex items-center gap-1.5 text-[8px] font-black uppercase text-gray-500 font-medium">
                    <span>{doc.fileType}</span>
                    <span>•</span>
                    <span>{formatBytes(doc.fileSize)}</span>
                  </div>
                </div>
                {onDeleteDocument && (
                  <button 
                    onClick={() => onDeleteDocument(doc.id)}
                    className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 cursor-pointer"
                    title="Delete Index"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default RagDocumentsDrawer;
