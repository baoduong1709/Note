import { useState, useEffect } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  FileText, 
  CheckSquare, 
  Calendar, 
  Settings, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Check,
  Share2
} from "lucide-react";
import { getImportantTasks, updateTaskStatus, Task } from "../database/queries/tasks";

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
}

export default function Sidebar({ activeView, setActiveView }: SidebarProps) {
  const { t } = useLanguage();
  const [importantTasks, setImportantTasks] = useState<Task[]>([]);
  const [isOpenReminders, setIsOpenReminders] = useState(false);

  const [, setForceUpdate] = useState(0);

  const fetchImportantTasks = async () => {
    try {
      const imptTasks = await getImportantTasks();
      setImportantTasks(imptTasks);
    } catch (err) {
      console.error("Failed to load important tasks count in Sidebar:", err);
    }
  };

  useEffect(() => {
    fetchImportantTasks();

    // Listen to custom updates from other views
    const handleSync = () => {
      fetchImportantTasks();
    };
    const handleAuthChange = () => {
      setForceUpdate(prev => prev + 1);
    };
    window.addEventListener("task-updated", handleSync);
    window.addEventListener("auth-state-changed", handleAuthChange);
    return () => {
      window.removeEventListener("task-updated", handleSync);
      window.removeEventListener("auth-state-changed", handleAuthChange);
    };
  }, [activeView]);

  const handleCompleteTask = async (id: string) => {
    try {
      await updateTaskStatus(id, "done");
      // Re-fetch local count
      fetchImportantTasks();
      // Dispatch global sync event
      window.dispatchEvent(new CustomEvent("task-updated"));
    } catch (err) {
      console.error("Failed to complete task from sidebar:", err);
    }
  };

  const menuItems = [
    { id: "dashboard", label: t("sidebar.dashboard"), icon: LayoutDashboard },
    { id: "notes", label: t("sidebar.notes"), icon: FileText },
    { id: "tasks", label: t("sidebar.tasks"), icon: CheckSquare },
    { id: "calendar", label: t("sidebar.calendar"), icon: Calendar },
    { id: "share", label: t("sidebar.share"), icon: Share2 },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-zinc-200 dark:border-white/5 flex flex-col h-full min-h-0 max-h-full z-10 shrink-0 hidden md:flex">
      {/* Header Logo with animated gradient */}
      <div className="p-5 flex items-center gap-3 relative">
        <div className="w-9 h-9 rounded-xl bg-zinc-950 dark:bg-black border border-white/10 flex items-center justify-center shadow-lg shadow-purple-500/10 relative overflow-hidden group shrink-0 p-1">
          {/* Subtle spinning background glow */}
          <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/30 to-blue-500/30 opacity-60 blur-sm group-hover:scale-110 transition-all duration-500"></div>
          <img src="/logo.png" className="w-full h-full object-contain rounded-lg z-10 relative" alt="Logo" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wide text-zinc-900 dark:text-white flex items-center gap-0.5">
            AI <span className="font-extrabold bg-gradient-to-r from-purple-600 to-blue-400 bg-clip-text text-transparent">NOTEBOOK</span>
          </h1>
          <span className="text-[9px] text-zinc-650 dark:text-zinc-400 uppercase tracking-widest font-bold">Personal Work v2</span>
        </div>
      </div>
      
      {/* Gradient divider instead of border */}
      <div className="divider-gradient mx-3"></div>

      {/* Navigation menu */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        <div className="space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.97 }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shimmer-hover ${
                  isActive 
                    ? "menu-active-gradient bg-purple-500/10 dark:bg-purple-500/10 text-zinc-900 dark:text-white" 
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "icon-glow" : ""}`} />
                <span>{item.label}</span>
                {item.id === "tasks" && importantTasks.length > 0 && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse animate-duration-1000" title={t("sidebar.urgentTasksTitle", { count: importantTasks.length })} />
                )}
              </motion.button>
            );
          })}
        </div>

      </nav>

      {/* 2.5 Collapsible Reminders Panel */}
      {importantTasks.length > 0 && (
        <div className="px-3 mb-2 shrink-0">
          <div className="rounded-lg border border-red-200/50 dark:border-red-500/10 bg-red-50/50 dark:bg-red-950/5 overflow-hidden transition-all duration-300">
            {/* Header Button */}
            <button
              type="button"
              onClick={() => setIsOpenReminders(!isOpenReminders)}
              className="w-full flex items-center justify-between p-2 text-left text-[10px] font-bold text-red-650 dark:text-red-400 hover:bg-red-100/30 dark:hover:bg-red-500/10 transition-all select-none cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                <span>{t("sidebar.urgentTasks", { count: importantTasks.length })}</span>
              </div>
              {isOpenReminders ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* Collapsible List Container */}
            {isOpenReminders && (
              <div className="p-2 border-t border-red-200/30 dark:border-red-500/10 space-y-1.5 max-h-32 overflow-y-auto text-[9px] animate-fade-in-up">
                {importantTasks.map(task => (
                  <div key={task.id} className="flex items-start gap-1.5 py-1 hover:bg-black/5 dark:hover:bg-white/5 rounded px-1 transition-all group">
                    <button
                      type="button"
                      onClick={() => handleCompleteTask(task.id)}
                      className="w-3.5 h-3.5 rounded border border-red-300 dark:border-red-500/20 bg-white dark:bg-zinc-950 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0 mt-0.5"
                      title={t("sidebar.completeTask")}
                    >
                      <Check className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p 
                        onClick={() => {
                          setActiveView("tasks");
                        }}
                        className="text-zinc-800 dark:text-zinc-300 font-semibold truncate cursor-pointer hover:underline text-left"
                        title={task.title}
                      >
                        {task.title}
                      </p>
                      {task.due_date && (
                        <span className="text-[8px] text-red-500 font-bold block mt-0.5 flex items-center gap-0.5">
                          <Clock className="w-2 h-2" /> {t("sidebar.dueDate", { date: task.due_date })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Gradient divider */}
      <div className="divider-gradient mx-3"></div>

      {/* Footer Profile & Settings */}
      <div className="p-3 flex flex-col gap-2 shrink-0">
        <motion.button
          type="button"
          onClick={() => setActiveView("settings")}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.97 }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shimmer-hover ${
            activeView === "settings"
              ? "menu-active-gradient bg-purple-500/10 dark:bg-purple-500/10 text-zinc-900 dark:text-white"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <Settings className={`w-4 h-4 ${activeView === "settings" ? "icon-glow" : ""}`} />
          <span>{t("sidebar.settings")}</span>
        </motion.button>

        {/* Global Google login profile box */}
        {localStorage.getItem("sync_user_email") ? (
          <div 
            className="px-3 py-2 flex items-center gap-2.5 bg-purple-500/5 border border-purple-500/10 rounded-lg select-none"
          >
            <div className="w-7 h-7 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center font-bold text-xs shrink-0 avatar-gradient-ring">
              {(localStorage.getItem("sync_user_name") || "B").charAt(0)}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">
                {localStorage.getItem("sync_user_name")}
              </p>
              <span className="text-[8px] text-teal-400 font-semibold block">
                {t("sidebar.syncEnabled")}
              </span>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => {
              setActiveView("share");
              // Phát sự kiện để mở thẳng modal đăng nhập trên view Share
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("trigger-google-login"));
              }, 150);
            }}
            className="px-3 py-2 flex items-center gap-2.5 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 rounded-lg cursor-pointer transition-all group border border-dashed border-zinc-400/20"
            title="Nhấp để đăng nhập bằng Google và kích hoạt đồng bộ"
          >
            <div className="w-7 h-7 rounded-full bg-zinc-300 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.22-.67-.35-1.37-.35-2.09z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[10px] font-bold text-zinc-800 dark:text-zinc-300 group-hover:text-purple-500 transition-colors">
                {t("sidebar.signinGoogle")}
              </p>
              <span className="text-[8px] text-zinc-500 block">
                {t("sidebar.offlineMode")}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
