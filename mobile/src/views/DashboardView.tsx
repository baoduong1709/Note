import { useState, useEffect, useRef } from "react";
import { 
  Zap, 
  CheckSquare, 
  FileText, 
  AlertTriangle, 
  Clock, 
  Save,
  Plus,
  BarChart2,
  Sparkles,
  Activity,
  Quote,
  Check
} from "lucide-react";
import { useLanguage } from "../../../shared/contexts/LanguageContext";
import { motion } from "framer-motion";
import { createNote, getNotes, Note } from "../../../shared/database/queries/notes";
import { getTodayTasks, getImportantTasks, Task, updateTaskStatus } from "../../../shared/database/queries/tasks";
import { getDatabase } from "../../../shared/database/db";

// Dynamic motivational quotes
const MOTIVATIONAL_QUOTES = [
  { vi: "Hành trình vạn dặm khởi đầu từ một bước chân.", en: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
  { vi: "Cách tốt nhất để dự đoán tương lai là tự mình kiến tạo nó.", en: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { vi: "Thành công không phải là chìa khóa mở cánh cửa hạnh phúc. Hạnh phúc mới là chìa khóa dẫn tới thành công.", en: "Success is not the key to happiness. Happiness is the key to success.", author: "Albert Schweitzer" },
  { vi: "Mỗi ngày là một cơ hội mới để học hỏi và trưởng thành.", en: "Every day is a new opportunity to learn and grow.", author: "Anonymous" },
  { vi: "Tập trung vào giải pháp, đừng tập trung vào vấn đề.", en: "Focus on the solution, not the problem.", author: "Anonymous" },
  { vi: "Kỷ luật là cầu nối giữa mục tiêu và thành tựu.", en: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" }
];

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
  const { t, language } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [quickText, setQuickText] = useState("");
  const [isQuickCaptureFocused, setIsQuickCaptureFocused] = useState(false);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [importantTasks, setImportantTasks] = useState<Task[]>([]);

  // Stats and activity states
  const [stats, setStats] = useState({
    totalNotes: 0,
    activeTasks: 0,
    completedTasksToday: 0,
    totalTasksToday: 0,
    completionRate: 0,
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [quote, setQuote] = useState({ vi: "", en: "", author: "" });

  // Auth check states
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!localStorage.getItem("sync_user_email");
  });
  const [userName, setUserName] = useState(() => {
    const storedName = localStorage.getItem("sync_user_name");
    return storedName ? storedName.split(" ")[0] : "bạn";
  });

  const [showCloudBanner, setShowCloudBanner] = useState(() => {
    return !localStorage.getItem("cloud_banner_dismissed");
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    const name = userName === "bạn" ? (language === "vi" ? "bạn" : "guest") : userName;
    if (hour < 12) return t("dashboard.greetingMorning", { name });
    if (hour < 18) return t("dashboard.greetingAfternoon", { name });
    return t("dashboard.greetingEvening", { name });
  };

  const handleDismissBanner = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem("cloud_banner_dismissed", "true");
    setShowCloudBanner(false);
  };

  const handleTriggerLogin = () => {
    window.dispatchEvent(new CustomEvent("trigger-google-login"));
  };

  // Load data from local SQLite
  useEffect(() => {
    // Force scroll to top on mount to avoid browser auto-scrolling
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }

    // Set daily motivational quote
    const day = new Date().getDate();
    const quoteIndex = day % MOTIVATIONAL_QUOTES.length;
    setQuote(MOTIVATIONAL_QUOTES[quoteIndex]);

    async function loadData() {
      try {
        const tasks = await getTodayTasks();
        setTodayTasks(tasks.slice(0, 5)); // Show top 5 today tasks

        const notes = await getNotes();
        const HIDDEN_NOTES = ['USER.md', 'MEMORY.md'];
        setRecentNotes(notes.filter(n => !HIDDEN_NOTES.includes(n.title)).slice(0, 3)); // Show top 3 recent notes, exclude system files

        const imptTasks = await getImportantTasks();
        setImportantTasks(imptTasks);

        // Fetch database stats & activities
        const db = await getDatabase();
        const allNotes = await db.select<Note[]>("SELECT * FROM notes");
        const allTasks = await db.select<Task[]>("SELECT * FROM tasks");

        const userNotes = allNotes.filter(n => !HIDDEN_NOTES.includes(n.title));
        const activeTasksList = allTasks.filter(t => t.status !== 'done');

        // Calculate today's tasks completion
        const todayStr = new Date().toISOString().split('T')[0];
        const tasksToday = allTasks.filter(t => t.due_date && t.due_date.slice(0, 10) === todayStr);
        const completedToday = tasksToday.filter(t => t.status === 'done').length;

        setStats({
          totalNotes: userNotes.length,
          activeTasks: activeTasksList.length,
          completedTasksToday: completedToday,
          totalTasksToday: tasksToday.length,
          completionRate: tasksToday.length > 0 ? Math.round((completedToday / tasksToday.length) * 100) : 0,
        });

        // Load activity logs
        const logs = await db.select<any[]>("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 5");
        setActivities(logs || []);

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
            triggerToast(t("dashboard.urgentToast", { count: imptTasks.length }));
          }, 800);
        }
      } catch (e) {
        console.error(e);
      }
    }
    triggerInitialAlert();

    // Listen to updates from other components (like Sidebar completions)
    window.addEventListener("task-updated", loadData);

    const handleAuthChange = () => {
      setIsLoggedIn(!!localStorage.getItem("sync_user_email"));
      const storedName = localStorage.getItem("sync_user_name");
      setUserName(storedName ? storedName.split(" ")[0] : "bạn");
    };
    window.addEventListener("auth-state-changed", handleAuthChange);

    return () => {
      window.removeEventListener("task-updated", loadData);
      window.removeEventListener("auth-state-changed", handleAuthChange);
    };
  }, []);

  // Save quick note
  const handleQuickSave = async () => {
    if (!quickText.trim()) return;

    const newNote: Note = {
      id: Math.random().toString(36).substring(2, 11),
      workspace_id: "personal",
      project_id: null,
      title: `${t("dashboard.defaultQuickNoteTitle")} - ${new Date().toLocaleDateString()}`,
      content: quickText,
      type: "quick",
      is_locked: 0,
      is_pending_sync: 1
    };

    try {
      await createNote(newNote);
      setQuickText("");
      triggerToast(t("dashboard.quickCaptureSaveSuccess"));
      
      // Reload recent notes
      const notes = await getNotes();
      const HIDDEN_NOTES = ['USER.md', 'MEMORY.md'];
      setRecentNotes(notes.filter(n => !HIDDEN_NOTES.includes(n.title)).slice(0, 3));

      // Reload activity log
      const db = await getDatabase();
      const logs = await db.select<any[]>("SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 5");
      setActivities(logs || []);
    } catch (err) {
      console.error("Failed to save quick note:", err);
      triggerToast(t("dashboard.quickCaptureSaveError"));
    }
  };

  // Create a new note from quick action
  const handleCreateNoteAction = async () => {
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
      setActiveView("notes");
    } catch (err) {
      console.error("Failed to create note:", err);
      triggerToast(t("notes.createError"));
    }
  };

  // Toggle AI chat sidebar
  const handleToggleAiChat = () => {
    window.dispatchEvent(new CustomEvent("toggle-ai-chat", { detail: true }));
  };

  // Toggle task status
  const handleToggleTaskStatus = async (id: string, currentStatus: Task['status']) => {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';
    try {
      await updateTaskStatus(id, newStatus);
      triggerToast(newStatus === 'done' 
        ? (language === 'vi' ? "Đã hoàn thành công việc!" : "Task completed!") 
        : (language === 'vi' ? "Đã đánh dấu chưa hoàn thành!" : "Task marked incomplete!")
      );
      
      // Notify other views and trigger reload
      window.dispatchEvent(new CustomEvent("task-updated"));
    } catch (err) {
      console.error("Failed to update task status:", err);
      triggerToast(language === 'vi' ? "Lỗi cập nhật công việc!" : "Failed to update task!");
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
      <div className="flex items-center justify-between shrink-0 mb-1">
        <h2 className="text-base sm:text-lg font-extrabold tracking-tight gradient-text-animated">{getGreeting()}</h2>
      </div>

      {/* Cloud Sync Reminder Banner */}
      {!isLoggedIn && showCloudBanner && (
        <motion.div
          variants={cardVariants}
          className="relative overflow-hidden glass-panel rounded-xl p-3.5 bg-gradient-to-r from-purple-500/5 to-indigo-500/5 dark:from-purple-500/10 dark:to-indigo-500/10 border border-purple-500/20 dark:border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 text-purple-650 dark:text-purple-400 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.5 19A5.5 5.5 0 0 0 22 14c0-2.5-2-4.5-4.5-4.5-.4 0-.8.05-1.2.15A7 7 0 1 0 3 11.5c0 3 .5 4.5 1.5 5.5"/>
                <path d="M12 13v6"/>
                <path d="m9 16 3 3 3-3"/>
              </svg>
            </div>
            <div className="text-left">
              <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                {t("dashboard.notSynced")}
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              </h4>
              <p className="text-[10px] text-zinc-555 dark:text-zinc-400 mt-0.5 leading-relaxed">
                {t("dashboard.syncDescription")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              onClick={handleTriggerLogin}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] shadow-md shadow-purple-500/10 hover:shadow-purple-500/20 cursor-pointer border border-white/5 transition-all"
            >
              {t("dashboard.connectNow")}
            </button>
            <button
              onClick={handleDismissBanner}
              className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-555 dark:text-zinc-400 transition-all cursor-pointer"
              title={t("dashboard.dismiss")}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18"/>
                <path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
        </motion.div>
      )}

      {/* Reminders Alert Section */}
      {importantTasks.length > 0 && (
        <motion.section
          variants={cardVariants}
          className="glass-panel rounded-lg p-3 relative overflow-hidden border-red-500/20"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <h3 className="text-xs font-bold text-red-655 dark:text-red-400 uppercase tracking-wide truncate">{t("dashboard.urgentTitle")}</h3>
            </div>
            <span className="text-[10px] bg-red-100 dark:bg-red-500/10 text-red-655 dark:text-red-400 px-2 py-0.5 rounded-full font-bold shrink-0">
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
                        {isOverdue ? t("dashboard.overdue") : task.due_date}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Mobile Stack Layout */}
      <div className="flex flex-col space-y-3">
        
        {/* Quick Capture Panel */}
        <motion.section 
          variants={cardVariants}
          className={`glass-panel ${(isQuickCaptureFocused || quickText.trim().length > 0) ? "rainbow-border-active border-transparent" : "border-white/5"} premium-hover-glow rounded-lg p-3 relative overflow-hidden transition-all duration-300`}
        >
          <h3 className="text-xs font-semibold text-zinc-800 dark:text-white mb-2 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400 icon-glow" />
            {t("dashboard.quickCapture")}
          </h3>
          <div className="flex items-stretch gap-2">
            <textarea
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onFocus={() => setIsQuickCaptureFocused(true)}
              onBlur={() => setIsQuickCaptureFocused(false)}
              placeholder={t("dashboard.quickCapturePlaceholder")}
              className="w-full h-14 p-2.5 rounded-lg glass-input text-xs text-zinc-700 dark:text-zinc-300 resize-none"
            />
            <button 
              onClick={handleQuickSave}
              disabled={!quickText.trim()}
              className="gradient-btn disabled:opacity-40 disabled:cursor-not-allowed text-[10px] px-3 rounded-md font-semibold shadow-md shadow-purple-500/10 shrink-0 flex items-center gap-1.5"
            >
              <Save className="w-3 h-3" />
              {t("common.save")}
            </button>
          </div>
        </motion.section>

        {/* Overview Statistics Card */}
        <motion.section variants={cardVariants} className="glass-panel premium-hover-glow rounded-lg p-3 flex flex-col">
          <h3 className="text-xs font-bold text-zinc-855 dark:text-white mb-2.5 flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-purple-400 icon-glow" />
            {t("dashboard.statsTitle")}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs mb-2.5">
            <div className="flex justify-between items-center bg-zinc-50/50 dark:bg-white/5 p-2 rounded-lg border border-zinc-200/50 dark:border-white/5">
              <span className="text-zinc-550 dark:text-zinc-400 font-semibold">{t("dashboard.totalNotes")}</span>
              <span className="font-extrabold text-purple-650 dark:text-purple-400 text-xs">{stats.totalNotes}</span>
            </div>
            <div className="flex justify-between items-center bg-zinc-50/50 dark:bg-white/5 p-2 rounded-lg border border-zinc-200/50 dark:border-white/5">
              <span className="text-zinc-550 dark:text-zinc-400 font-semibold">{t("dashboard.activeTasks")}</span>
              <span className="font-extrabold text-teal-650 dark:text-teal-400 text-xs">{stats.activeTasks}</span>
            </div>
          </div>
          <div className="bg-zinc-50/50 dark:bg-white/5 p-2 rounded-lg border border-zinc-200/50 dark:border-white/5 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-zinc-550 dark:text-zinc-400 font-semibold">{t("dashboard.todayProgress")}</span>
              <span className="font-extrabold text-indigo-650 dark:text-indigo-400">{stats.completedTasksToday}/{stats.totalTasksToday}</span>
            </div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <motion.div 
                className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${stats.completionRate}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </motion.section>

        {/* Quick Actions Panel */}
        <motion.section variants={cardVariants} className="glass-panel premium-hover-glow rounded-lg p-3">
          <h3 className="text-xs font-bold text-zinc-855 dark:text-white mb-2.5 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 icon-glow" />
            {t("dashboard.quickActionsTitle")}
          </h3>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button 
              onClick={handleCreateNoteAction}
              className="flex items-center justify-center flex-col gap-1.5 p-3 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/5 hover:bg-purple-500/10 hover:border-purple-500/20 transition-all cursor-pointer group text-center"
            >
              <Plus className="w-4 h-4 text-purple-500 group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-zinc-750 dark:text-zinc-300">{t("dashboard.newNoteAction")}</span>
            </button>
            <button 
              onClick={() => setActiveView("tasks")}
              className="flex items-center justify-center flex-col gap-1.5 p-3 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/5 hover:bg-teal-500/10 hover:border-teal-500/20 transition-all cursor-pointer group text-center"
            >
              <CheckSquare className="w-4 h-4 text-teal-500 group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-zinc-750 dark:text-zinc-300">{t("dashboard.newTaskAction")}</span>
            </button>
            <button 
              onClick={handleToggleAiChat}
              className="flex items-center justify-center flex-col gap-1.5 p-3 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/20 transition-all cursor-pointer group text-center"
            >
              <Zap className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-zinc-750 dark:text-zinc-300">{t("dashboard.chatAiAction")}</span>
            </button>
          </div>
        </motion.section>

        {/* Today Tasks Widget */}
        <motion.div variants={cardVariants} className="glass-panel premium-hover-glow rounded-lg p-3 flex flex-col min-h-0">
          <h3 className="text-xs font-bold text-zinc-850 dark:text-white mb-2.5 flex items-center gap-2">
            <CheckSquare className="w-3.5 h-3.5 text-teal-400 icon-glow" />
            {t("dashboard.todayTasks")}
          </h3>
          {todayTasks.length === 0 ? (
            <p className="text-[10px] text-zinc-500 py-2.5 text-center">{t("dashboard.noTasksToday")}</p>
          ) : (
            <div className="space-y-1.5 text-xs">
              {todayTasks.map(task => (
                <motion.div 
                  key={task.id}
                  whileHover={{ x: 2 }}
                  onClick={() => handleToggleTaskStatus(task.id, task.status)}
                  className="flex items-center justify-between gap-2.5 hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1.5 rounded-lg border border-zinc-200/40 dark:border-white/5 bg-zinc-50/20 dark:bg-white/5 cursor-pointer transition-all group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTaskStatus(task.id, task.status);
                      }}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                        task.status === "done"
                          ? "bg-teal-500 border-teal-500 text-white shadow-sm"
                          : "border-zinc-300 dark:border-zinc-700 bg-white/5 dark:bg-zinc-950/20 hover:border-teal-500 group-hover:border-teal-400"
                      }`}
                      title={t("sidebar.completeTask") || "Complete task"}
                    >
                      {task.status === "done" && <Check className="w-2.5 h-2.5 stroke-[3.5]" />}
                    </button>
                    <span className={`text-zinc-700 dark:text-zinc-300 truncate font-semibold text-xs transition-all ${
                      task.status === "done" ? "line-through text-zinc-400 dark:text-zinc-500 font-normal" : ""
                    }`}>
                      {task.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {task.priority === 'high' && (
                      <span className="text-[8px] bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                        {t("common.priorityHigh") || "High"}
                      </span>
                    )}
                    {task.due_date && (
                      <span className="text-[8px] text-zinc-550 dark:text-zinc-450 flex items-center gap-0.5 font-medium">
                        <Clock className="w-2.5 h-2.5" />
                        {task.due_date.slice(11, 16) || task.due_date.slice(5, 10)}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Notes Widget */}
        <motion.section variants={cardVariants} className="glass-panel premium-hover-glow rounded-lg p-3 flex flex-col">
          <h3 className="text-xs font-bold text-zinc-855 dark:text-white mb-2">{t("dashboard.recentNotes")}</h3>
          {recentNotes.length === 0 ? (
            <p className="text-[10px] text-zinc-500 py-2 text-center">{t("dashboard.noRecentNotes")}</p>
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

        {/* Recent Activities Feed */}
        <motion.section variants={cardVariants} className="glass-panel premium-hover-glow rounded-lg p-3 flex flex-col">
          <h3 className="text-xs font-bold text-zinc-855 dark:text-white mb-2 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-pink-400 icon-glow" />
            {t("dashboard.recentActivityTitle")}
          </h3>
          {activities.length === 0 ? (
            <p className="text-[10px] text-zinc-500 py-3 text-center">{t("dashboard.noActivity")}</p>
          ) : (
            <div className="space-y-1.5 text-[10px]">
              {activities.map((act) => (
                <div key={act.id} className="flex items-center justify-between py-1 border-b border-zinc-100 dark:border-white/5 last:border-0 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      act.target_type === 'note' ? 'bg-purple-500' : 'bg-teal-500'
                    }`} />
                    <p className="text-zinc-700 dark:text-zinc-300 truncate font-medium">{act.description}</p>
                  </div>
                  <span className="text-[8px] text-zinc-500 shrink-0">
                    {new Date(act.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Motivational Quote Card */}
        <motion.section variants={cardVariants} className="glass-panel premium-hover-glow rounded-lg p-3 flex flex-col bg-gradient-to-br from-indigo-500/5 to-purple-500/5 dark:from-indigo-500/10 dark:to-purple-500/10 border-indigo-500/10">
          <h3 className="text-xs font-bold text-zinc-855 dark:text-white mb-2 flex items-center gap-1.5">
            <Quote className="w-3.5 h-3.5 text-indigo-400 shrink-0 animate-pulse" />
            {t("dashboard.inspirationTitle")}
          </h3>
          <div className="flex-1 flex flex-col justify-center py-2 text-center text-xs">
            <p className="text-zinc-700 dark:text-zinc-300 italic font-semibold leading-relaxed">
              "{language === "vi" ? quote.vi : quote.en}"
            </p>
            <p className="text-[10px] text-zinc-500 mt-2 font-bold">— {quote.author}</p>
          </div>
        </motion.section>

      </div>
    </motion.div>
  );
}
