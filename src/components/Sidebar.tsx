import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  FileText, 
  CheckSquare, 
  Calendar, 
  Settings, 
  BrainCircuit,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Check
} from "lucide-react";
import { getImportantTasks, updateTaskStatus, Task } from "../database/queries/tasks";

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  jiraConnected: boolean;
}

export default function Sidebar({ activeView, setActiveView, jiraConnected }: SidebarProps) {
  const [importantTasks, setImportantTasks] = useState<Task[]>([]);
  const [isOpenReminders, setIsOpenReminders] = useState(false);

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
    window.addEventListener("task-updated", handleSync);
    return () => window.removeEventListener("task-updated", handleSync);
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
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "notes", label: "Notes Editor", icon: FileText },
    { id: "tasks", label: "Tasks & Kanban", icon: CheckSquare },
    { id: "daily", label: "Daily Notes", icon: Calendar },
  ];

  return (
    <aside className="w-64 glass-panel border-r border-zinc-200 dark:border-white/5 flex flex-col h-full min-h-0 max-h-full z-10 shrink-0 hidden md:flex">
      {/* Header Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-zinc-200 dark:border-white/5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-teal-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <BrainCircuit className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wide text-zinc-900 dark:text-white">AI NOTEBOOK</h1>
          <span className="text-[9px] text-zinc-650 dark:text-zinc-400 uppercase tracking-widest font-bold">Personal Work v2</span>
        </div>
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        <div className="space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isActive 
                    ? "menu-active text-zinc-900 dark:text-white" 
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
                {item.id === "tasks" && importantTasks.length > 0 && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse animate-duration-1000" title={`Có ${importantTasks.length} việc quan trọng cần xử lý!`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Workspace Mock Section */}
        <div className="space-y-1">
          <p className="px-3 text-[9px] font-bold text-zinc-550 dark:text-zinc-550 uppercase tracking-wider mb-2">WORKSPACES</p>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-zinc-700 dark:text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>GL Work</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-zinc-700 dark:text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-teal-500"></span>
            <span>Game Dev</span>
          </div>
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
                <span>{importantTasks.length} việc khẩn cấp</span>
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
                      title="Hoàn thành công việc"
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
                          <Clock className="w-2 h-2" /> Hạn: {task.due_date}
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

      {/* Footer Profile & Settings */}
      <div className="p-3 border-t border-zinc-200 dark:border-white/5 flex flex-col gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setActiveView("settings")}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeView === "settings"
              ? "menu-active text-zinc-900 dark:text-white"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings & Integrations</span>
        </button>

        <div className="px-3 py-2 flex items-center gap-2.5 bg-black/5 dark:bg-white/5 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
            B
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">Bao Duong</p>
            <span className="text-[8px] text-zinc-650 dark:text-zinc-450 font-medium">
              {jiraConnected ? "Connected: Jira" : "Local mode"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
