import React, { useState, useEffect } from "react";
import { Plus, Trash2, Play, CheckCircle, Clock, X } from "lucide-react";
import { getTasks, createTask, updateTaskStatus, deleteTask, Task } from "../database/queries/tasks";
import GenericConfirmModal from "../components/GenericConfirmModal";
import { useLanguage } from "../contexts/LanguageContext";

interface TasksViewProps {
  triggerToast: (message: string) => void;
}

export default function TasksView({ triggerToast }: TasksViewProps) {
  const { t, language } = useLanguage();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"todo" | "in_progress" | "done">("todo");

  // Form states
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");
  const workspace = "personal";

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const formatTaskDateTime = (value?: string | null) => {
    if (!value) return "";

    const normalized = value.length === 10 ? `${value}T00:00` : value;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString(language === "vi" ? "vi-VN" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getTaskTimeLabel = (task: Task) => {
    if (task.due_date) return `${language === "vi" ? "Hạn" : "Due"} ${formatTaskDateTime(task.due_date)}`;
    if (task.created_at) return `${language === "vi" ? "Tạo" : "Created"} ${formatTaskDateTime(task.created_at)}`;
    return language === "vi" ? "Chưa đặt thời gian" : "No due date set";
  };

  const isTaskOverdue = (task: Task) => {
    if (!task.due_date || task.status === "done") return false;
    const dueAt = new Date(task.due_date.length === 10 ? `${task.due_date}T23:59` : task.due_date).getTime();
    return Number.isFinite(dueAt) && dueAt < Date.now();
  };

  const loadTasks = async () => {
    try {
      const results = await getTasks();
      setTasks(results);
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  };

  useEffect(() => {
    loadTasks();

    const handleSync = () => {
      loadTasks();
    };
    window.addEventListener("task-updated", handleSync);
    return () => window.removeEventListener("task-updated", handleSync);
  }, []);

  const handleStatusChange = async (id: string, newStatus: Task["status"]) => {
    try {
      await updateTaskStatus(id, newStatus);
      triggerToast(language === "vi" ? `Đã chuyển trạng thái sang: ${newStatus}` : `Status changed to: ${newStatus}`);
      loadTasks();
      window.dispatchEvent(new CustomEvent("task-updated"));
    } catch (err) {
      console.error("Failed to update status:", err);
      triggerToast(language === "vi" ? "Lỗi cập nhật trạng thái!" : "Failed to update status!");
    }
  };

  const handleDelete = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      setTaskToDelete(task);
      setShowDeleteConfirm(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    try {
      await deleteTask(taskToDelete.id);
      triggerToast(t("tasks.deleteSuccess"));
      loadTasks();
      window.dispatchEvent(new CustomEvent("task-updated"));
    } catch (err) {
      console.error("Failed to delete task:", err);
      triggerToast(t("tasks.deleteError"));
    } finally {
      setShowDeleteConfirm(false);
      setTaskToDelete(null);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: Task = {
      id: Math.random().toString(36).substring(2, 11),
      note_id: null,
      title,
      status: "todo",
      priority,
      due_date: dueDate || null,
      workspace_id: workspace,
      project_id: null,
      source: "local",
      external_id: null,
      external_url: null,
      external_status: null,
      is_pending_sync: 1
    };

    try {
      await createTask(newTask);
      triggerToast(t("tasks.createSuccess"));
      setTitle("");
      setDueDate("");
      setShowAddForm(false);
      loadTasks();
      window.dispatchEvent(new CustomEvent("task-updated"));
    } catch (err) {
      console.error("Failed to create task:", err);
      triggerToast(t("tasks.createError"));
    }
  };

  const todoTasks = tasks.filter(t => t.status === "todo");
  const inProgressTasks = tasks.filter(t => t.status === "in_progress");
  const doneTasks = tasks.filter(t => t.status === "done");

  return (
    <div className="flex-1 flex flex-col overflow-hidden space-y-4 view-enter-animate">
      {/* Top Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-zinc-955 dark:text-white">{t("tasks.title")}</h3>
          <p className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-zinc-400">{t("tasks.description")}</p>
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="relative group overflow-hidden bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-500 hover:to-blue-400 text-white text-xs px-2.5 sm:px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all duration-300 shadow-md shadow-purple-500/25 hover:shadow-lg hover:shadow-blue-500/35 hover:scale-[1.03] active:scale-[0.97] border border-white/10 shrink-0"
        >
          {/* Subtle inner reflection flare */}
          <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"></span>
          {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{showAddForm ? t("tasks.cancel") : t("tasks.addTask")}</span>
        </button>
      </div>

      {/* Add Task Form Modal/Inline */}
      {showAddForm && (
        <form onSubmit={handleAddTask} className="glass-panel p-4 rounded-xl space-y-3 shrink-0 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-zinc-400 mb-1">{t("tasks.taskName")}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("tasks.taskPlaceholder")}
                className="w-full p-2 rounded glass-input text-zinc-300"
                required
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">{t("tasks.priority")}</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task["priority"])}
                className="w-full p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 focus:outline-none"
              >
                <option value="low">{t("tasks.priorityLow")}</option>
                <option value="medium">{t("tasks.priorityMedium")}</option>
                <option value="high">{t("tasks.priorityHigh")}</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">{t("tasks.dueDate")}</label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="submit"
              className="bg-gradient-to-r from-purple-600 to-indigo-650 hover:from-purple-500 hover:to-indigo-550 text-white px-4 py-1.5 rounded font-semibold shadow-md shadow-purple-500/10 hover:shadow-lg hover:shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("tasks.createTask")}
            </button>
          </div>
        </form>
      )}

      {/* Mobile-only Kanban Column Tab Switcher */}
      <div className="md:hidden flex p-1.5 bg-black/15 dark:bg-white/5 backdrop-blur rounded-xl border border-zinc-200/50 dark:border-white/5 shrink-0">
        <button
          type="button"
          onClick={() => setActiveMobileTab("todo")}
          className={`flex-1 text-center py-2 text-[10px] font-bold rounded-lg transition-all ${
            activeMobileTab === "todo"
              ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
              : "text-zinc-500 dark:text-zinc-450 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {t("tasks.columnTodo")} ({todoTasks.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileTab("in_progress")}
          className={`flex-1 text-center py-2 text-[10px] font-bold rounded-lg transition-all ${
            activeMobileTab === "in_progress"
              ? "bg-purple-600/90 text-white shadow-sm shadow-purple-500/10"
              : "text-zinc-500 dark:text-zinc-450 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {t("tasks.columnInProgress")} ({inProgressTasks.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileTab("done")}
          className={`flex-1 text-center py-2 text-[10px] font-bold rounded-lg transition-all ${
            activeMobileTab === "done"
              ? "bg-teal-600/90 text-white shadow-sm shadow-teal-500/10"
              : "text-zinc-500 dark:text-zinc-450 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          {t("tasks.columnDone")} ({doneTasks.length})
        </button>
      </div>

      {/* Kanban Board Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto md:overflow-hidden min-h-0 pb-1">
        {/* 1. TODO COLUMN */}
        <div className={`glass-panel rounded-xl p-3 flex flex-col h-full overflow-hidden kanban-col-animate ${activeMobileTab === "todo" ? "flex" : "hidden md:flex"}`}>
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
              {t("tasks.columnTodo")}
            </h4>
            <span className="text-[9px] bg-zinc-200 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">{todoTasks.length}</span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto pr-1 select-none min-h-0">
            {todoTasks.map(task => (
              <div 
                key={task.id} 
                className={`p-3 rounded-lg border bg-white dark:bg-zinc-950/40 relative group border-zinc-250 dark:border-white/5 ${
                  isTaskOverdue(task) ? "shadow-md shadow-red-500/5 !border-red-500/20" : "premium-hover-glow"
                }`}
              >
                <h5 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 pr-5 leading-snug break-words text-left">{task.title}</h5>
                <span className="text-[9px] text-zinc-500 block mt-1 flex items-center gap-0.5">
                  <Clock className={`w-3.5 h-3.5 ${isTaskOverdue(task) ? "text-red-500 font-bold" : "text-zinc-400"}`} />
                  <span className={isTaskOverdue(task) ? "text-red-600 dark:text-red-400 font-bold" : ""}>
                    {getTaskTimeLabel(task)}
                  </span>
                </span>
                
                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all absolute right-2 top-2 cursor-pointer"
                  title={t("tasks.deleteTask")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex justify-between items-center pt-1 text-[9px] text-zinc-500">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold ${
                    task.priority === "high" ? "bg-red-500/10 text-red-400" : task.priority === "medium" ? "bg-amber-500/10 text-amber-400" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400"
                  }`}>{task.priority === "high" ? t("tasks.priorityHighTag") : task.priority === "medium" ? t("tasks.priorityMediumTag") : t("tasks.priorityLowTag")}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(task.id, "in_progress")}
                      className="text-[10px] bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 text-purple-650 dark:text-purple-400 px-2.5 py-1 rounded-md font-bold flex items-center gap-1 transition-all shadow-sm shadow-purple-500/5"
                    >
                      <Play className="w-3 h-3" /> {t("tasks.actionStart")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. IN PROGRESS COLUMN */}
        <div className={`glass-panel rounded-xl p-3 flex flex-col h-full overflow-hidden kanban-col-animate ${activeMobileTab === "in_progress" ? "flex" : "hidden md:flex"}`}>
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h4 className="text-xs font-semibold text-purple-650 dark:text-purple-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
              {t("tasks.columnInProgress")}
            </h4>
            <span className="text-[9px] bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full">{inProgressTasks.length}</span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto pr-1 select-none min-h-0">
            {inProgressTasks.map(task => (
              <div 
                key={task.id} 
                className={`p-3 rounded-lg border bg-white dark:bg-zinc-950/40 relative group border-zinc-250 dark:border-white/5 ${
                  isTaskOverdue(task) ? "shadow-md shadow-red-500/5 !border-red-500/20" : "premium-hover-glow"
                }`}
              >
                <h5 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 pr-5 leading-snug break-words text-left">{task.title}</h5>
                <span className="text-[9px] text-zinc-500 block mt-1 flex items-center gap-0.5">
                  <Clock className={`w-3.5 h-3.5 ${isTaskOverdue(task) ? "text-red-500 font-bold" : "text-zinc-400"}`} />
                  <span className={isTaskOverdue(task) ? "text-red-600 dark:text-red-400 font-bold" : ""}>
                    {getTaskTimeLabel(task)}
                  </span>
                </span>
                
                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all absolute right-2 top-2 cursor-pointer"
                  title={t("tasks.deleteTask")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex justify-between items-center pt-1 text-[9px] text-zinc-500">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold ${
                    task.priority === "high" ? "bg-red-500/10 text-red-400" : task.priority === "medium" ? "bg-amber-500/10 text-amber-400" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400"
                  }`}>{task.priority === "high" ? t("tasks.priorityHighTag") : task.priority === "medium" ? t("tasks.priorityMediumTag") : t("tasks.priorityLowTag")}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(task.id, "done")}
                      className="text-[10px] bg-teal-500/10 hover:bg-teal-500/20 active:scale-95 text-teal-650 dark:text-teal-400 px-2.5 py-1 rounded-md font-bold flex items-center gap-1 transition-all shadow-sm shadow-teal-500/5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> {t("tasks.actionDone")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. DONE COLUMN */}
        <div className={`glass-panel rounded-xl p-3 flex flex-col h-full overflow-hidden kanban-col-animate ${activeMobileTab === "done" ? "flex" : "hidden md:flex"}`}>
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {t("tasks.columnDone")}
            </h4>
            <span className="text-[9px] bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">{doneTasks.length}</span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto pr-1 select-none min-h-0">
            {doneTasks.map(task => (
              <div 
                key={task.id} 
                className="p-3 rounded-lg border bg-white dark:bg-zinc-950/40 relative group border-zinc-250 dark:border-white/5 opacity-75 hover:opacity-100 transition-opacity"
              >
                <h5 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 pr-5 leading-snug line-through break-words text-left">{task.title}</h5>
                <span className="text-[9px] text-zinc-500 block mt-1 flex items-center gap-0.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{getTaskTimeLabel(task)}</span>
                </span>
                
                <button
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all absolute right-2 top-2 cursor-pointer"
                  title={t("tasks.deleteTask")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex justify-between items-center pt-1 text-[9px] text-zinc-500">
                  <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-550 dark:text-zinc-500 px-1 rounded uppercase tracking-wider font-bold">{t("tasks.doneLabel")}</span>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(task.id, "todo")}
                    className="text-[10px] bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-95 text-zinc-650 dark:text-zinc-300 px-2.5 py-1 rounded-md font-bold transition-all"
                  >
                    {t("tasks.actionReopen")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CUSTOM DANGER CONFIRM MODAL FOR DELETING TASKS */}
      <GenericConfirmModal
        isOpen={showDeleteConfirm}
        title={t("tasks.deleteTask")}
        message={t("tasks.deleteTaskConfirm")}
        confirmLabel={t("tasks.deleteTask")}
        cancelLabel={t("common.cancel")}
        type="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setTaskToDelete(null);
        }}
      />
    </div>
  );
}
