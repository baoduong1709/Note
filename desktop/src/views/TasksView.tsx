import React, { useState, useEffect } from "react";
import { Plus, Trash2, Play, CheckCircle, Clock, X, Calendar } from "lucide-react";
import { getTasks, createTask, updateTaskStatus, deleteTask, Task, updateTask } from "../../../shared/database/queries/tasks";
import GenericConfirmModal from "../../../shared/components/GenericConfirmModal";
import { useLanguage } from "../../../shared/contexts/LanguageContext";

interface TasksViewProps {
  triggerToast: (message: string) => void;
}

export default function TasksView({ triggerToast }: TasksViewProps) {
  const { t, language } = useLanguage();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");
  const workspace = "personal";

  // Edit task states
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<Task["priority"]>("medium");
  const [editDueDate, setEditDueDate] = useState("");

  const editDatePart = editDueDate ? editDueDate.split("T")[0] : "";
  const editTimePart = editDueDate && editDueDate.includes("T") ? editDueDate.split("T")[1] : "";

  const handleEditDateChange = (newDate: string) => {
    if (!newDate) {
      setEditDueDate("");
    } else {
      const time = editTimePart || "18:00";
      setEditDueDate(`${newDate}T${time}`);
    }
  };

  const handleEditTimeChange = (newTime: string) => {
    if (!newTime) {
      const date = editDatePart || new Date().toISOString().slice(0, 10);
      setEditDueDate(`${date}T00:00`);
    } else {
      const date = editDatePart || new Date().toISOString().slice(0, 10);
      setEditDueDate(`${date}T${newTime}`);
    }
  };

  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditDueDate(task.due_date || "");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;
    try {
      const updated: Task = {
        ...editingTask,
        title: editTitle,
        priority: editPriority,
        due_date: editDueDate || null,
      };
      await updateTask(updated);
      triggerToast(language === "vi" ? "Đã cập nhật thông tin task!" : "Task updated successfully!");
      setEditingTask(null);
      loadTasks();
      window.dispatchEvent(new CustomEvent("task-updated"));
    } catch (err) {
      console.error("Failed to update task:", err);
      triggerToast(language === "vi" ? "Lỗi cập nhật task!" : "Failed to update task!");
    }
  };

  // Split due date into date and time parts for separate desktop inputs

  // Split due date into date and time parts for separate desktop inputs
  const datePart = dueDate ? dueDate.split("T")[0] : "";
  const timePart = dueDate && dueDate.includes("T") ? dueDate.split("T")[1] : "";

  // Handle changes to date input, default to 18:00 if time is not set
  const handleDateChange = (newDate: string) => {
    if (!newDate) {
      setDueDate("");
    } else {
      const time = timePart || "18:00";
      setDueDate(`${newDate}T${time}`);
    }
  };

  // Handle changes to time input, default to today if date is not set
  const handleTimeChange = (newTime: string) => {
    if (!newTime) {
      const date = datePart || new Date().toISOString().slice(0, 10);
      setDueDate(`${date}T00:00`);
    } else {
      const date = datePart || new Date().toISOString().slice(0, 10);
      setDueDate(`${date}T${newTime}`);
    }
  };

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
            <div className="relative">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-zinc-400">{t("tasks.dueDate")}</label>
                {dueDate && (
                  <button
                    type="button"
                    onClick={() => setDueDate("")}
                    className="text-[10px] text-red-500 hover:text-red-400 font-medium transition-colors cursor-pointer"
                  >
                    {t("tasks.presetClear")}
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                {/* Date input part */}
                <div className="relative flex-1">
                  <input
                    type="date"
                    id="task-due-date-part"
                    value={datePart}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="w-full p-2 pr-8 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 focus:outline-none focus:border-purple-500/50 transition-all text-xs hide-calendar-picker"
                  />
                  {/* Custom button to trigger default calendar picker */}
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("task-due-date-part") as HTMLInputElement;
                      if (el) {
                        if (typeof el.showPicker === "function") {
                          try {
                            el.showPicker();
                          } catch (err) {
                            console.error("Failed to show date picker:", err);
                            el.focus();
                          }
                        } else {
                          el.focus();
                        }
                      }
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300 p-0.5 cursor-pointer"
                    title={t("calendar.datePickerTitle")}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Time select part */}
                <div className="relative w-[85px] sm:w-[95px] shrink-0">
                  <select
                    id="task-due-time-part"
                    value={timePart || "18:00"}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 focus:outline-none focus:border-purple-500/50 transition-all text-xs rounded cursor-pointer appearance-none pr-7"
                  >
                    {Array.from({ length: 48 }).map((_, i) => {
                      const hour = String(Math.floor(i / 2)).padStart(2, "0");
                      const minute = i % 2 === 0 ? "00" : "30";
                      const val = `${hour}:${minute}`;
                      return (
                        <option key={val} value={val}>
                          {val}
                        </option>
                      );
                    })}
                    <option value="23:59">23:59</option>
                  </select>
                  {/* Custom arrow/clock icon */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Quick preset buttons to set task due dates quickly */}
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    // Set to 18:00 (end of workday)
                    today.setHours(18, 0, 0, 0);
                    const offset = today.getTimezoneOffset();
                    const localDate = new Date(today.getTime() - offset * 60 * 1000);
                    setDueDate(localDate.toISOString().slice(0, 16));
                  }}
                  className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-650 dark:text-zinc-400 border border-zinc-200 dark:border-white/5 hover:border-purple-500/30 hover:bg-purple-500/5 hover:text-purple-400 transition-all font-medium cursor-pointer"
                >
                  {t("tasks.presetToday")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(18, 0, 0, 0);
                    const offset = tomorrow.getTimezoneOffset();
                    const localDate = new Date(tomorrow.getTime() - offset * 60 * 1000);
                    setDueDate(localDate.toISOString().slice(0, 16));
                  }}
                  className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-650 dark:text-zinc-400 border border-zinc-200 dark:border-white/5 hover:border-purple-500/30 hover:bg-purple-500/5 hover:text-purple-400 transition-all font-medium cursor-pointer"
                >
                  {t("tasks.presetTomorrow")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextWeek = new Date();
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    nextWeek.setHours(9, 0, 0, 0); // Next week defaults to 9 AM
                    const offset = nextWeek.getTimezoneOffset();
                    const localDate = new Date(nextWeek.getTime() - offset * 60 * 1000);
                    setDueDate(localDate.toISOString().slice(0, 16));
                  }}
                  className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-650 dark:text-zinc-400 border border-zinc-200 dark:border-white/5 hover:border-purple-500/30 hover:bg-purple-500/5 hover:text-purple-400 transition-all font-medium cursor-pointer"
                >
                  {t("tasks.presetNextWeek")}
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="submit"
              className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-500 hover:to-blue-400 text-white px-4 py-1.5 rounded font-semibold shadow-md shadow-purple-500/10 hover:shadow-lg hover:shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("tasks.createTask")}
            </button>
          </div>
        </form>
      )}

      {/* Kanban Board Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto md:overflow-hidden min-h-0 pb-1">
        {/* 1. TODO COLUMN */}
        <div className="glass-panel rounded-xl p-3 flex flex-col h-full overflow-hidden kanban-col-animate">
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
                onClick={() => handleEditClick(task)}
                className={`p-3 rounded-lg border bg-white dark:bg-zinc-950/40 relative group border-zinc-250 dark:border-white/5 cursor-pointer hover:border-purple-500/30 transition-all ${
                  isTaskOverdue(task) ? "shadow-md shadow-red-500/5 !border-red-500/20" : "premium-hover-glow"
                }`}
              >
                <h5 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 pr-5 leading-snug break-words text-left">{task.title}</h5>
                <span className="text-[11px] text-zinc-500 block mt-1.5 flex items-center gap-0.5">
                  <Clock className={`w-4 h-4 ${isTaskOverdue(task) ? "text-red-500 font-bold" : "text-zinc-400"}`} />
                  <span className={isTaskOverdue(task) ? "text-red-600 dark:text-red-400 font-bold" : ""}>
                    {getTaskTimeLabel(task)}
                  </span>
                </span>
                
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all absolute right-2 top-2 cursor-pointer"
                  title={t("tasks.deleteTask")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex justify-between items-center pt-2 text-[10px] text-zinc-500">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${
                    task.priority === "high" ? "bg-red-500/10 text-red-400" : task.priority === "medium" ? "bg-amber-500/10 text-amber-400" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400"
                  }`}>{task.priority === "high" ? t("tasks.priorityHighTag") : task.priority === "medium" ? t("tasks.priorityMediumTag") : t("tasks.priorityLowTag")}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, "in_progress"); }}
                      className="text-xs bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 text-purple-650 dark:text-purple-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all shadow-sm shadow-purple-500/5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" /> {t("tasks.actionStart")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. IN PROGRESS COLUMN */}
        <div className="glass-panel rounded-xl p-3 flex flex-col h-full overflow-hidden kanban-col-animate">
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
                onClick={() => handleEditClick(task)}
                className={`p-3 rounded-lg border bg-white dark:bg-zinc-950/40 relative group border-zinc-250 dark:border-white/5 cursor-pointer hover:border-purple-500/30 transition-all ${
                  isTaskOverdue(task) ? "shadow-md shadow-red-500/5 !border-red-500/20" : "premium-hover-glow"
                }`}
              >
                <h5 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 pr-5 leading-snug break-words text-left">{task.title}</h5>
                <span className="text-[11px] text-zinc-500 block mt-1.5 flex items-center gap-0.5">
                  <Clock className={`w-4 h-4 ${isTaskOverdue(task) ? "text-red-500 font-bold" : "text-zinc-400"}`} />
                  <span className={isTaskOverdue(task) ? "text-red-600 dark:text-red-400 font-bold" : ""}>
                    {getTaskTimeLabel(task)}
                  </span>
                </span>
                
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all absolute right-2 top-2 cursor-pointer"
                  title={t("tasks.deleteTask")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex justify-between items-center pt-2 text-[10px] text-zinc-500">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${
                    task.priority === "high" ? "bg-red-500/10 text-red-400" : task.priority === "medium" ? "bg-amber-500/10 text-amber-400" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400"
                  }`}>{task.priority === "high" ? t("tasks.priorityHighTag") : task.priority === "medium" ? t("tasks.priorityMediumTag") : t("tasks.priorityLowTag")}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, "done"); }}
                      className="text-xs bg-teal-500/10 hover:bg-teal-500/20 active:scale-95 text-teal-650 dark:text-teal-400 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all shadow-sm shadow-teal-500/5 cursor-pointer"
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
        <div className="glass-panel rounded-xl p-3 flex flex-col h-full overflow-hidden kanban-col-animate">
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
                onClick={() => handleEditClick(task)}
                className="p-3 rounded-lg border bg-white dark:bg-zinc-950/40 relative group border-zinc-250 dark:border-white/5 opacity-75 hover:opacity-100 cursor-pointer hover:border-purple-500/30 transition-all"
              >
                <h5 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 pr-5 leading-snug line-through break-words text-left">{task.title}</h5>
                <span className="text-[11px] text-zinc-500 block mt-1.5 flex items-center gap-0.5">
                  <Clock className="w-4 h-4 text-zinc-400" />
                  <span>{getTaskTimeLabel(task)}</span>
                </span>
                
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all absolute right-2 top-2 cursor-pointer"
                  title={t("tasks.deleteTask")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex justify-between items-center pt-2 text-[10px] text-zinc-500">
                  <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-550 dark:text-zinc-500 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold">{t("tasks.doneLabel")}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleStatusChange(task.id, "todo"); }}
                    className="text-xs bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 active:scale-95 text-zinc-650 dark:text-zinc-300 px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer"
                  >
                    {t("tasks.actionReopen")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* EDIT TASK DIALOG MODAL */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveEdit} className="glass-panel w-full max-w-md rounded-2xl p-6 border border-zinc-200/50 dark:border-white/5 shadow-2xl flex flex-col space-y-4 text-xs text-zinc-750 dark:text-zinc-300 relative animate-fade-in bg-white dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setEditingTask(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-white cursor-pointer transition-all p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
            
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-white pb-2 border-b border-zinc-200/50 dark:border-white/5">
              {language === "vi" ? "Chỉnh sửa công việc" : "Edit Task"}
            </h3>

            <div>
              <label className="block text-zinc-400 mb-1">{t("tasks.taskName")}</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full p-2.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-white focus:outline-none focus:border-purple-500/50 transition-all text-xs"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">{t("tasks.priority")}</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as Task["priority"])}
                className="w-full p-2.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 focus:outline-none focus:border-purple-500/50 transition-all text-xs cursor-pointer"
              >
                <option value="low">{t("tasks.priorityLow")}</option>
                <option value="medium">{t("tasks.priorityMedium")}</option>
                <option value="high">{t("tasks.priorityHigh")}</option>
              </select>
            </div>

            <div className="relative">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-zinc-400">{t("tasks.dueDate")}</label>
                {editDueDate && (
                  <button
                    type="button"
                    onClick={() => setEditDueDate("")}
                    className="text-[10px] text-red-500 hover:text-red-400 font-medium transition-colors cursor-pointer"
                  >
                    {t("tasks.presetClear")}
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                {/* Date input part */}
                <div className="relative flex-1">
                  <input
                    type="date"
                    id="edit-task-due-date-part"
                    value={editDatePart}
                    onChange={(e) => handleEditDateChange(e.target.value)}
                    className="w-full p-2.5 pr-8 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 focus:outline-none focus:border-purple-500/50 transition-all text-xs hide-calendar-picker"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("edit-task-due-date-part") as HTMLInputElement;
                      if (el && typeof el.showPicker === "function") {
                        try { el.showPicker(); } catch (err) { el.focus(); }
                      } else if (el) { el.focus(); }
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300 p-0.5 cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Time select part */}
                <div className="relative w-[95px] shrink-0">
                  <select
                    id="edit-task-due-time-part"
                    value={editTimePart || "18:00"}
                    onChange={(e) => handleEditTimeChange(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 focus:outline-none focus:border-purple-500/50 transition-all text-xs rounded cursor-pointer appearance-none pr-7"
                  >
                    {Array.from({ length: 48 }).map((_, i) => {
                      const hour = String(Math.floor(i / 2)).padStart(2, "0");
                      const minute = i % 2 === 0 ? "00" : "30";
                      const val = `${hour}:${minute}`;
                      return (
                        <option key={val} value={val}>
                          {val}
                        </option>
                      );
                    })}
                    <option value="23:59">23:59</option>
                  </select>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Quick preset buttons */}
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    today.setHours(18, 0, 0, 0);
                    const offset = today.getTimezoneOffset();
                    const localDate = new Date(today.getTime() - offset * 60 * 1000);
                    setEditDueDate(localDate.toISOString().slice(0, 16));
                  }}
                  className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-650 dark:text-zinc-400 border border-zinc-200 dark:border-white/5 hover:border-purple-500/30 hover:bg-purple-500/5 hover:text-purple-400 transition-all font-medium cursor-pointer"
                >
                  {t("tasks.presetToday")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(18, 0, 0, 0);
                    const offset = tomorrow.getTimezoneOffset();
                    const localDate = new Date(tomorrow.getTime() - offset * 60 * 1000);
                    setEditDueDate(localDate.toISOString().slice(0, 16));
                  }}
                  className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-650 dark:text-zinc-400 border border-zinc-200 dark:border-white/5 hover:border-purple-500/30 hover:bg-purple-500/5 hover:text-purple-400 transition-all font-medium cursor-pointer"
                >
                  {t("tasks.presetTomorrow")}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200/50 dark:border-white/5">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="bg-transparent hover:bg-zinc-100 dark:hover:bg-white/5 border border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-xl font-semibold transition-all cursor-pointer text-xs"
              >
                {t("common.cancel") || "Cancel"}
              </button>
              <button
                type="submit"
                className="bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-500 hover:to-blue-400 text-white px-4 py-2 rounded-xl font-semibold shadow-md shadow-purple-500/10 hover:shadow-lg transition-all text-xs cursor-pointer"
              >
                {language === "vi" ? "Lưu thay đổi" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

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
