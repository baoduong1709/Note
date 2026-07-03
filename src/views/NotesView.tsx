import React, { useState, useEffect } from "react";
import { Plus, Trash2, FileText, Search } from "lucide-react";
import { getNotes, createNote, updateNote, deleteNote, Note } from "../database/queries/notes";
import RichTextEditor from "../components/RichTextEditor";

interface NotesViewProps {
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  triggerToast: (message: string) => void;
}

export default function NotesView({ 
  selectedNoteId, 
  setSelectedNoteId,
  triggerToast 
}: NotesViewProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadNotes = async () => {
    try {
      const results = await getNotes();
      setNotes(results);
      if (results.length > 0 && !selectedNoteId) {
        setSelectedNoteId(results[0].id);
      }
    } catch (err) {
      console.error("Failed to load notes:", err);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [selectedNoteId]);

  // Handle Note Save (Triggered by MarkdownEditor)
  const handleNoteSave = async (title: string, content: string) => {
    if (!selectedNoteId) return;
    try {
      await updateNote(selectedNoteId, title, content);
      // Reload lists without resetting selected note
      const results = await getNotes();
      setNotes(results);
    } catch (err) {
      console.error("Failed to save note:", err);
      triggerToast("Lỗi lưu ghi chú!");
    }
  };

  // Handle Create Note
  const handleCreateNote = async () => {
    const id = Math.random().toString(36).substring(2, 11);
    const newNote: Note = {
      id,
      workspace_id: "personal",
      project_id: null,
      title: `Untitled Note - ${new Date().toLocaleDateString()}`,
      content: "",
      type: "quick",
      is_locked: 0,
      is_pending_sync: 1
    };

    try {
      await createNote(newNote);
      triggerToast("Đã tạo ghi chú mới!");
      setSelectedNoteId(id);
      loadNotes();
    } catch (err) {
      console.error("Failed to create note:", err);
      triggerToast("Lỗi tạo ghi chú!");
    }
  };

  // Handle Delete Note
  const handleDeleteNote = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa ghi chú này không?")) return;
    try {
      await deleteNote(id);
      triggerToast("Đã xóa ghi chú!");
      setSelectedNoteId(null);
      loadNotes();
    } catch (err) {
      console.error("Failed to delete note:", err);
      triggerToast("Lỗi xóa ghi chú!");
    }
  };

  // Filter notes by search query
  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeNote = notes.find(n => n.id === selectedNoteId) || null;

  return (
    <div className="flex-1 flex flex-col sm:flex-row overflow-y-auto sm:overflow-hidden gap-5">
      {/* Notes List Column */}
      <div className="w-full sm:w-56 shrink-0 flex flex-col gap-3">
        <div className="flex justify-between items-center shrink-0">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">DANH SÁCH NOTE</h3>
          <button 
            onClick={handleCreateNote}
            className="p-1 rounded hover:bg-white/5 text-zinc-400 hover:text-white"
            title="Tạo ghi chú mới"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search bar inside column */}
        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Tìm ghi chú..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 rounded-lg glass-input text-[11px] text-zinc-300 focus:outline-none"
          />
        </div>
        
        {/* Note list list */}
        <div className="flex-1 space-y-1.5 pr-1 overflow-y-auto min-h-0">
          {filteredNotes.map(note => {
            const isActive = note.id === selectedNoteId;
            return (
              <div 
                key={note.id}
                onClick={() => setSelectedNoteId(note.id)}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-start justify-between group ${
                  isActive 
                    ? "bg-white/5 border-purple-500/20 text-white font-medium" 
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="overflow-hidden flex-1 mr-2">
                  <h4 className="text-xs truncate">{note.title || "Ghi chú trống"}</h4>
                  <span className="text-[9px] text-zinc-600 block mt-0.5 uppercase tracking-wider">{note.type}</span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNote(note.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all shrink-0"
                  title="Xóa ghi chú"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {filteredNotes.length === 0 && (
            <p className="text-[10px] text-zinc-500 text-center py-4">Không tìm thấy ghi chú nào.</p>
          )}
        </div>
      </div>

      {/* Editor Frame */}
      <div className="flex-1 glass-panel rounded-xl p-4 sm:p-5 flex flex-col overflow-hidden min-h-0">
        {activeNote ? (
          <RichTextEditor 
            key={activeNote.id}
            noteId={activeNote.id}
            initialTitle={activeNote.title}
            initialContent={activeNote.content}
            onSave={handleNoteSave}
            triggerToast={triggerToast}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
            Chọn một ghi chú bên trái hoặc bấm + để tạo ghi chú mới.
          </div>
        )}
      </div>
    </div>
  );
}
