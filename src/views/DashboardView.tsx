import { useState, useEffect, useRef } from "react";
import { 
  Zap, 
  CheckSquare, 
  FileText, 
  AlertTriangle,
  Clock,
  Save
} from "lucide-react";
import { motion } from "framer-motion";
import { createNote, getNotes, Note } from "../database/queries/notes";
import { getTodayTasks, getImportantTasks, Task } from "../database/queries/tasks";

interface DashboardViewProps {
  setActiveView: (view: string) => void;
  setSelectedNoteId: (id: string | null) => void;
  triggerToast: (message: string) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06
    }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } }
};

export default function DashboardView({ 
  setActiveView, 
  setSelectedNoteId,
  triggerToast 
}: DashboardViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [quickText, setQuickText] = useState("");
  const [isQuickCaptureFocused, setIsQuickCaptureFocused] = useState(false);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [importantTasks, setImportantTasks] = useState<Task[]>([]);

  // Load data from local SQLite
  useEffect(() => {
    // Force scroll to top on mount to avoid browser auto-scrolling
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }

    async function loadData() {
      try {
        const tasks = await getTodayTasks();
        setTodayTasks(tasks.slice(0, 5)); // Show top 5 today tasks

        const notes = await getNotes();
        const HIDDEN_NOTES = ['USER.md', 'MEMORY.md'];
        setRecentNotes(notes.filter(n => !HIDDEN_NOTES.includes(n.title)).slice(0, 3)); // Show top 3 recent notes, exclude system files

        const imptTasks = await getImportantTasks();
        setImportantTasks(imptTasks);

        // Force scroll-to-top after DOM updates
        setTimeout(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = 0;
          }
        }, 60);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      }
    }
    loadData();

    // Trigger alert toast once on mount
    async function triggerInitialAlert() {
      try {
        const imptTasks = await getImportantTasks();
        if (imptTasks.length > 0) {
          setTimeout(() => {
            triggerToast(`⚠️ Bạn có ${imptTasks.length} việc quan trọng cần làm gấp!`);
          }, 800);
        }
      } catch (e) {
        console.error(e);
      }
    }
    triggerInitialAlert();

    // Listen to updates from other components (like Sidebar completions)
    window.addEventListener("task-updated", loadData);
    return () => window.removeEventListener("task-updated", loadData);
  }, []);

  // Save quick note
  const handleQuickSave = async () => {
    if (!quickText.trim()) return;

    const newNote: Note = {
      id: Math.random().toString(36).substring(2, 11),
      workspace_id: "personal",
      project_id: null,
      title: `Quick Capture - ${new Date().toLocaleDateString()}`,
      content: quickText,
      type: "quick",
      is_locked: 0,
      is_pending_sync: 1
    };

    try {
      await createNote(newNote);
      setQuickText("");
      triggerToast("Đã lưu ghi chú nhanh vào Inbox!");
      
      // Reload recent notes
      const notes = await getNotes();
      const HIDDEN_NOTES = ['USER.md', 'MEMORY.md'];
      setRecentNotes(notes.filter(n => !HIDDEN_NOTES.includes(n.title)).slice(0, 3));
    } catch (err) {
      console.error("Failed to save quick note:", err);
      triggerToast("Lỗi lưu ghi chú!");
    }
  };

  return (
    <motion.div 
      ref={containerRef} 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex-1 flex flex-col overflow-y-auto space-y-3 pr-1"
    >
      {/* Welcome Header */}
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-base sm:text-lg font-extrabold tracking-tight gradient-text-animated">Chào Bảo</h2>
      </div>

      {/* Reminders Alert Section */}
      {importantTasks.length > 0 && (
        <motion.section
          variants={cardVariants}
          className="glass-panel rounded-lg p-3 relative overflow-hidden border-red-500/20"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <h3 className="text-xs font-bold text-red-650 dark:text-red-400 uppercase tracking-wide truncate">Việc gấp</h3>
            </div>
            <span className="text-[10px] bg-red-100 dark:bg-red-500/10 text-red-650 dark:text-red-400 px-2 py-0.5 rounded-full font-bold shrink-0">
              {importantTasks.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {importantTasks.map(task => {
              const isOverdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());
              return (
                <div key={task.id} className="flex items-center justify-between gap-2 rounded-md bg-red-50/40 dark:bg-red-950/10 border border-red-200/50 dark:border-red-500/10 px-2.5 py-2">
                  <p className="text-xs text-zinc-800 dark:text-zinc-200 font-semibold leading-snug truncate min-w-0">{task.title}</p>
                  {task.due_date && (
                    <div className="flex items-center gap-1 text-[9px] text-zinc-550 dark:text-zinc-400 font-medium shrink-0">
                      <Clock className={`w-3 h-3 ${isOverdue ? "text-red-500" : "text-zinc-400"}`} />
                      <span className={isOverdue ? "text-red-600 dark:text-red-400 font-bold" : ""}>
                        {isOverdue ? "Trễ" : task.due_date}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:flex-1 md:min-h-0">
        
        {/* Main Content Columns (8 cols on Desktop) */}
        <div className="col-span-12 md:col-span-8 flex flex-col space-y-3 min-h-0">
          
          {/* Quick Capture Panel */}
          <motion.section 
            variants={cardVariants}
            className={`glass-panel ${(isQuickCaptureFocused || quickText.trim().length > 0) ? "border-purple-500/40" : "border-white/5"} premium-hover-glow rounded-lg p-3 relative overflow-hidden transition-all duration-300`}
          >
            <h3 className="text-xs font-semibold text-zinc-800 dark:text-white mb-2 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400 icon-glow" />
              Ghi nhanh
            </h3>
            <div className="flex items-stretch gap-2">
              <textarea
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                onFocus={() => setIsQuickCaptureFocused(true)}
                onBlur={() => setIsQuickCaptureFocused(false)}
                placeholder="Ghi chú nhanh..."
                className="w-full h-14 p-2.5 rounded-lg glass-input text-xs text-zinc-700 dark:text-zinc-300 resize-none"
              />
              <button 
                onClick={handleQuickSave}
                disabled={!quickText.trim()}
                className="gradient-btn disabled:opacity-40 disabled:cursor-not-allowed text-[10px] px-3 rounded-md font-semibold shadow-md shadow-purple-500/10 shrink-0 flex items-center gap-1.5"
              >
                <Save className="w-3 h-3" />
                Lưu
              </button>
            </div>
          </motion.section>

          {/* Today Tasks Widget */}
          <motion.div variants={cardVariants} className="glass-panel premium-hover-glow rounded-lg p-3 flex flex-col min-h-0">
            <h3 className="text-xs font-bold text-zinc-850 dark:text-white mb-2 flex items-center gap-2">
              <CheckSquare className="w-3.5 h-3.5 text-teal-400 icon-glow" />
              Hôm nay
            </h3>
            {todayTasks.length === 0 ? (
              <p className="text-[10px] text-zinc-500 py-2 text-center">Không có việc hôm nay.</p>
            ) : (
              <div className="space-y-1 text-xs">
                {todayTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 px-1.5 py-1 rounded">
                    <input 
                      type="checkbox" 
                      checked={task.status === "done"}
                      readOnly
                      className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-purple-600 focus:ring-purple-600"
                    />
                    <span className="text-zinc-700 dark:text-zinc-300 truncate">{task.title}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Right Columns (4 cols on Desktop) */}
        <div className="col-span-12 md:col-span-4 flex flex-col space-y-3 min-h-0">
          {/* Recent Notes Widget */}
          <motion.section variants={cardVariants} className="glass-panel premium-hover-glow rounded-lg p-3 flex flex-col">
            <h3 className="text-xs font-bold text-zinc-850 dark:text-white mb-2">Gần đây</h3>
            {recentNotes.length === 0 ? (
              <p className="text-[10px] text-zinc-500 py-2 text-center">Chưa có ghi chú.</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                {recentNotes.map((note, index) => (
                  <div 
                    key={`${note.id}-${index}`} 
                    onClick={() => {
                      setSelectedNoteId(note.id);
                      setActiveView("notes");
                    }}
                    className="px-2 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 border border-zinc-200 dark:border-white/5 cursor-pointer transition-all flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    <span className="text-zinc-700 dark:text-zinc-300 truncate font-medium flex-1">{note.title}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        </div>

      </div>
    </motion.div>
  );
}
