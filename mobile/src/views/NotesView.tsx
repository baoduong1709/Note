import { useState, useEffect } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { useLanguage } from "../../../shared/contexts/LanguageContext";
import { getNotes, createNote, updateNote, deleteNote, Note } from "../../../shared/database/queries/notes";
import RichTextEditor from "../../../shared/components/RichTextEditor";
import GenericConfirmModal from "../../../shared/components/GenericConfirmModal";

interface NotesViewProps {
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  triggerToast: (message: string) => void;
}

const SYSTEM_NOTE_TITLES = new Set(["USER.md", "MEMORY.md"]);

const isUserFacingNote = (note: Note) => !SYSTEM_NOTE_TITLES.has(note.title);

export default function NotesView({ 
  selectedNoteId, 
  setSelectedNoteId,
  triggerToast 
}: NotesViewProps) {
  const { t } = useLanguage();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditingMobile, setIsEditingMobile] = useState(false);

  const loadNotes = async () => {
    try {
      const results = await getNotes();
      const visibleNotes = results.filter(isUserFacingNote);

      setNotes(visibleNotes);

      if (visibleNotes.length === 0) {
        if (selectedNoteId) {
          setSelectedNoteId(null);
        }
        return;
      }

      if (!selectedNoteId || !visibleNotes.some(note => note.id === selectedNoteId)) {
        setSelectedNoteId(visibleNotes[0].id);
      }
    } catch (err) {
      console.error("Failed to load notes:", err);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [selectedNoteId]);

  useEffect(() => {
    const handleSyncUpdate = () => {
      loadNotes();
    };
    window.addEventListener("notes-updated", handleSyncUpdate);
    return () => {
      window.removeEventListener("notes-updated", handleSyncUpdate);
    };
  }, []);

  // Handle Note Save (Triggered by MarkdownEditor)
  const handleNoteSave = async (title: string, content: string) => {
    if (!selectedNoteId) return;
    try {
      await updateNote(selectedNoteId, title, content);
      // Reload lists without resetting selected note
      const results = await getNotes();
      setNotes(results.filter(isUserFacingNote));
    } catch (err) {
      console.error("Failed to save note:", err);
      triggerToast(t("notes.saveError"));
    }
  };

  // Handle Create Note
  const handleCreateNote = async () => {
    const id = `note-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const newNote: Note = {
      id,
      workspace_id: "personal",
      project_id: null,
      title: `${t("notes.untitledNote")} - ${new Date().toLocaleDateString()}`,
      content: "",
      type: "quick",
      is_locked: 0,
      is_pending_sync: 1
    };

    try {
      await createNote(newNote);
      triggerToast(t("notes.createSuccess"));
      setSelectedNoteId(id);
      setIsEditingMobile(true);
      loadNotes();
    } catch (err) {
      console.error("Failed to create note:", err);
      triggerToast(t("notes.createError"));
    }
  };

  // Handle Delete Note
  const handleDeleteNote = (id: string) => {
    const note = notes.find(n => n.id === id);
    if (note) {
      setNoteToDelete(note);
      setShowDeleteConfirm(true);
    }
  };

  const handleConfirmDeleteNote = async () => {
    if (!noteToDelete) return;
    try {
      await deleteNote(noteToDelete.id);
      triggerToast(t("notes.deleteSuccess"));
      setSelectedNoteId(null);
      setIsEditingMobile(false);
      loadNotes();
    } catch (err) {
      console.error("Failed to delete note:", err);
      triggerToast(t("notes.deleteError"));
    } finally {
      setShowDeleteConfirm(false);
      setNoteToDelete(null);
    }
  };

  // Filter notes by search query
  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeNote = notes.find(n => n.id === selectedNoteId) || null;

  return (
    <div className="flex-1 flex flex-col sm:flex-row overflow-hidden gap-5 view-enter-animate">
      {/* Notes List Column */}
      <div className={`w-full sm:w-56 shrink-0 flex flex-col gap-3 ${selectedNoteId && isEditingMobile ? "hidden sm:flex" : "flex"}`}>
        <div className="flex justify-between items-center shrink-0">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t("notes.listHeader")}</h3>
          <button 
            type="button"
            onClick={handleCreateNote}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            title={t("notes.newNote")}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search bar inside column */}
        <div className="relative shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-zinc-500" />
          <input 
            type="text" 
            placeholder={t("notes.searchPlaceholder")} 
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
                onClick={() => {
                  setSelectedNoteId(note.id);
                  setIsEditingMobile(true);
                }}
                className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-start justify-between group ${
                  isActive 
                    ? "bg-purple-50/50 dark:bg-white/5 border-transparent text-zinc-900 dark:text-white font-medium rainbow-border-active" 
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <div className="overflow-hidden flex-1 mr-2">
                  <h4 className="text-xs truncate">{note.title || t("notes.emptyNoteTitle")}</h4>
                  <span className="text-[9px] text-zinc-600 block mt-0.5 uppercase tracking-wider">
                    {note.type === "quick" ? t("notes.typeQuick") : note.type}
                  </span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNote(note.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all shrink-0"
                  title={t("notes.deleteNote")}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {filteredNotes.length === 0 && (
            <p className="text-[10px] text-zinc-500 text-center py-4">{t("notes.noRecentNotes")}</p>
          )}
        </div>
      </div>

      {/* Editor Frame */}
      <div className={`flex-1 glass-panel rounded-xl p-4 sm:p-5 flex flex-col overflow-hidden min-h-0 ${selectedNoteId && isEditingMobile ? "flex" : "hidden sm:flex"}`}>
        {activeNote ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Mobile Back Button */}
            <div className="sm:hidden flex items-center pb-2 border-b border-black/5 dark:border-white/5 mb-3 shrink-0">
              <button
                onClick={() => setIsEditingMobile(false)}
                className="text-[11px] font-bold text-purple-650 dark:text-purple-400 flex items-center gap-1 hover:underline cursor-pointer"
              >
                {t("notes.backToList")}
              </button>
            </div>
            <RichTextEditor 
              key={activeNote.id}
              noteId={activeNote.id}
              initialTitle={activeNote.title}
              initialContent={activeNote.content}
              onSave={handleNoteSave}
              triggerToast={triggerToast}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
            {t("notes.selectNotePrompt")}
          </div>
        )}
      </div>

      {/* CUSTOM DANGER CONFIRM MODAL FOR DELETING NOTES */}
      <GenericConfirmModal 
        isOpen={showDeleteConfirm}
        title={t("notes.deleteNote")}
        message={t("notes.deleteNoteConfirm", { title: noteToDelete?.title || "" })}
        confirmLabel={t("notes.deleteNote")}
        cancelLabel={t("common.cancel")}
        type="danger"
        onConfirm={handleConfirmDeleteNote}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setNoteToDelete(null);
        }}
      />
    </div>
  );
}
