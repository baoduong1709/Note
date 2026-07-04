import { useState, useEffect, useRef } from "react";
import { 
  Zap, 
  CheckSquare, 
  FileText, 
  AlertTriangle,
  Clock
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
      className="flex-1 flex flex-col overflow-y-auto space-y-6 pr-1"
    >
      {/* Welcome Header */}
      <div className="flex justify-between items-start shrink-0">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight gradient-text-animated">Chào buổi chiều, Bảo!</h2>
          <p className="text-[10px] sm:text-xs text-zinc-650 dark:text-zinc-400 mt-0.5">Mọi sửa đổi sẽ tự động được lưu trữ local (Offline-first).</p>
        </div>
      </div>

      {/* Reminders Alert Section */}
      <motion.section 
        variants={cardVariants}
        className={`glass-panel ${importantTasks.length > 0 ? "premium-gradient-border premium-gradient-border-urgent border-transparent" : "border-l-4 border-l-emerald-500"} rounded-xl p-4 relative overflow-hidden transition-all duration-300 shimmer-hover`}
      >
        {importantTasks.length > 0 ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
              <h3 className="text-xs font-bold text-red-650 dark:text-red-400 uppercase tracking-wider">Cần chú ý: Nhắc nhở việc quan trọng</h3>
              <span className="text-[10px] bg-red-100 dark:bg-red-500/10 text-red-650 dark:text-red-400 px-2 py-0.5 rounded-full font-bold ml-1">{importantTasks.length} việc gấp</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {importantTasks.map(task => {
                const isOverdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());
                return (
                  <div key={task.id} className="p-3 rounded-lg bg-red-50/40 dark:bg-red-950/10 border border-red-200/50 dark:border-red-500/10 flex flex-col justify-between gap-2 shadow-sm hover:scale-[1.01] transition-all">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="text-[7px] bg-red-500/10 text-red-600 dark:text-red-400 px-1 py-0.5 rounded font-bold uppercase tracking-wider">HIGH</span>
                      </div>
                      <p className="text-xs text-zinc-800 dark:text-zinc-200 font-semibold leading-normal break-words line-clamp-2">{task.title}</p>
                    </div>
                    {task.due_date && (
                      <div className="flex items-center gap-1 text-[9px] text-zinc-550 dark:text-zinc-400 font-medium">
                        <Clock className={`w-3 h-3 ${isOverdue ? "text-red-500" : "text-zinc-400"}`} />
                        <span className={isOverdue ? "text-red-600 dark:text-red-400 font-bold" : ""}>
                          Hạn: {task.due_date} {isOverdue ? "(Trễ)" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <h3 className="text-xs font-semibold">Tất cả việc quan trọng đã được xử lý xong. Chúc bạn một ngày tốt lành!</h3>
            </div>
          </>
        )}
      </motion.section>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 flex-1 min-h-0">
        
        {/* Main Content Columns (8 cols on Desktop) */}
        <div className="col-span-12 md:col-span-8 flex flex-col space-y-5 min-h-0">
          
          {/* Quick Capture Panel */}
          <motion.section 
            variants={cardVariants}
            className={`glass-panel ${(isQuickCaptureFocused || quickText.trim().length > 0) ? "premium-gradient-border border-transparent" : "border-l-4 border-l-purple-500"} premium-hover-glow shimmer-hover rounded-xl p-4 sm:p-5 relative overflow-hidden transition-all duration-300`}
          >
            <h3 className="text-xs font-semibold text-zinc-800 dark:text-white mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400 icon-glow" />
              Quick Capture / Ghi nhanh note mới
            </h3>
            <textarea 
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onFocus={() => setIsQuickCaptureFocused(true)}
              onBlur={() => setIsQuickCaptureFocused(false)}
              placeholder="Nhập nhanh ghi chú ở đây... Bấm nút lưu để cất vào Inbox" 
              className="w-full h-20 p-2.5 rounded-lg glass-input text-xs text-zinc-700 dark:text-zinc-300 resize-none"
            />
            <div className="flex justify-end mt-2">
              <button 
                onClick={handleQuickSave}
                className="gradient-btn text-[10px] px-3.5 py-1.5 rounded-md font-semibold shadow-md shadow-purple-500/10"
              >
                Lưu nhanh
              </button>
            </div>
          </motion.section>

          {/* Today Tasks Widget */}
          <motion.div variants={cardVariants} className="glass-panel premium-hover-glow shimmer-hover rounded-xl p-4 flex flex-col flex-1 min-h-0">
            <h3 className="text-xs font-bold text-zinc-850 dark:text-white mb-3 flex items-center gap-2">
              <CheckSquare className="w-3.5 h-3.5 text-teal-400 icon-glow" />
              Today Tasks
            </h3>
            {todayTasks.length === 0 ? (
              <p className="text-[10px] text-zinc-500 py-3 text-center">Không có việc cần làm hôm nay.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {todayTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 p-1.5 rounded">
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
        <div className="col-span-12 md:col-span-4 flex flex-col space-y-5 min-h-0">
          {/* Recent Notes Widget */}
          <motion.section variants={cardVariants} className="glass-panel premium-hover-glow shimmer-hover rounded-xl p-4 flex-1 flex flex-col">
            <h3 className="text-xs font-bold text-zinc-850 dark:text-white mb-3">Ghi chú gần đây</h3>
            {recentNotes.length === 0 ? (
              <p className="text-[10px] text-zinc-500 py-3 text-center">Chưa có ghi chú nào.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {recentNotes.map(note => (
                  <div 
                    key={note.id} 
                    onClick={() => {
                      setSelectedNoteId(note.id);
                      setActiveView("notes");
                    }}
                    className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/5 border border-zinc-200 dark:border-white/5 cursor-pointer transition-all flex items-center gap-2"
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
