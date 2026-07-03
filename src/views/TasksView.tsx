import React, { useState, useEffect } from "react";
import { Plus, Trash2, Play, CheckCircle } from "lucide-react";
import { getTasks, createTask, updateTaskStatus, deleteTask, Task } from "../database/queries/tasks";
import { transitionJiraIssue } from "../services/jiraService";
import ConfirmModal from "../components/ConfirmModal";

interface TasksViewProps {
  triggerToast: (message: string) => void;
}

export default function TasksView({ triggerToast }: TasksViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form states
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task['priority']>("medium");
  const [dueDate, setDueDate] = useState("");
  const workspace = "personal";

  // Jira confirmation state
  const [showJiraConfirm, setShowJiraConfirm] = useState(false);
  const [pendingJiraAction, setPendingJiraAction] = useState<{
    id: string;
    newStatus: Task['status'];
    task: Task;
  } | null>(null);

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
  }, []);

  const handleStatusChange = async (id: string, newStatus: Task['status']) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Check if task is linked to Jira. If yes, require user confirmation before writing
    if (task.source === "jira" && task.external_id) {
      setPendingJiraAction({ id, newStatus, task });
      setShowJiraConfirm(true);
      return;
    }

    // Direct write for local tasks
    try {
      await updateTaskStatus(id, newStatus);
      triggerToast(`Đã chuyển trạng thái sang: ${newStatus}`);
      loadTasks();
    } catch (err) {
      console.error("Failed to update status:", err);
      triggerToast("Lỗi cập nhật trạng thái!");
    }
  };

  // Perform actual Jira update after user confirmed
  const handleConfirmJiraWrite = async () => {
    if (!pendingJiraAction) return;
    const { id, newStatus, task } = pendingJiraAction;
    
    setShowJiraConfirm(false);
    triggerToast("Đang đồng bộ trạng thái lên Jira...");

    try {
      // 1. Write back to Jira Cloud
      await transitionJiraIssue(task.external_id!, newStatus, "Status updated via Work Notebook App.");
      
      // 2. Update local SQLite status
      await updateTaskStatus(id, newStatus);
      
      triggerToast(`🚀 Đã cập nhật Jira ${task.external_id} thành công!`);
      setPendingJiraAction(null);
      loadTasks();
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || "Lỗi đồng bộ lên Jira!");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa task này không?")) return;
    try {
      await deleteTask(id);
      triggerToast("Đã xóa task!");
      loadTasks();
    } catch (err) {
      console.error("Failed to delete task:", err);
      triggerToast("Lỗi xóa task!");
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
      is_pending_sync: 1
    };

    try {
      await createTask(newTask);
      triggerToast("Đã tạo task mới!");
      setTitle("");
      setDueDate("");
      setShowAddForm(false);
      loadTasks();
    } catch (err) {
      console.error("Failed to create task:", err);
      triggerToast("Lỗi tạo task!");
    }
  };

  // Generate mock Jira tasks if list is empty for demo purpose
  const handleCreateMockJiraTask = async () => {
    const mockJiraTask: Task = {
      id: "jira-mock-123",
      note_id: null,
      title: "[GL-123] Code UI Main Dashboard for Work Notebook",
      status: "in_progress",
      priority: "high",
      due_date: null,
      workspace_id: "work",
      project_id: null,
      source: "jira",
      external_id: "GL-123",
      external_url: "https://gamelifestyle.atlassian.net/browse/GL-123",
      is_pending_sync: 0
    };

    try {
      await createTask(mockJiraTask);
      triggerToast("Đã import Mock Jira task (GL-123) để test confirm!");
      loadTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const todoTasks = tasks.filter(t => t.status === "todo");
  const inProgressTasks = tasks.filter(t => t.status === "in_progress");
  const doneTasks = tasks.filter(t => t.status === "done");

  return (
    <div className="flex-1 flex flex-col overflow-hidden space-y-4">
      {/* Top Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white">Quản lý Công việc & Kanban</h3>
          <p className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-zinc-400">Xem tiến độ công việc local của bạn.</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={handleCreateMockJiraTask}
            className="border border-blue-500/30 text-blue-400 text-[10px] px-3.5 py-1.5 rounded-lg font-semibold hover:bg-blue-500/10 transition-all"
            title="Import task Jira giả lập để test"
          >
            Import Jira Task
          </button>
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> 
            {showAddForm ? "Hủy bỏ" : "Thêm Task"}
          </button>
        </div>
      </div>

      {/* Add Task Form Modal/Inline */}
      {showAddForm && (
        <form onSubmit={handleAddTask} className="glass-panel p-4 rounded-xl space-y-3 shrink-0 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-zinc-400 mb-1">Tên công việc</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: deploy code lên staging..."
                className="w-full p-2 rounded glass-input text-zinc-300"
                required
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Độ ưu tiên</label>
              <select 
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task['priority'])}
                className="w-full p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 focus:outline-none"
              >
                <option value="low">Thấp (Low)</option>
                <option value="medium">Trung bình (Medium)</option>
                <option value="high">Cao (High)</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Hạn chót (Due date)</label>
              <input 
                type="date" 
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 text-zinc-800 dark:text-zinc-300 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button 
              type="submit"
              className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded font-semibold"
            >
              Tạo Task
            </button>
          </div>
        </form>
      )}

      {/* Kanban Board Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto md:overflow-hidden min-h-0 pb-1">
        
        {/* 1. TODO COLUMN */}
        <div className="glass-panel rounded-xl p-3 flex flex-col h-full overflow-hidden">
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
              Cần làm (Todo)
            </h4>
            <span className="text-[9px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">{todoTasks.length}</span>
          </div>
          <div className="space-y-2 pr-1 overflow-y-auto flex-1 min-h-[150px]">
            {todoTasks.map(task => (
              <div 
                key={task.id} 
                className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/5 space-y-2 hover:border-purple-500/20 transition-all relative group"
              >
                {task.source === "jira" && (
                  <span className="text-[8px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Jira</span>
                )}
                <p className="text-xs text-zinc-800 dark:text-white font-medium pr-6 leading-relaxed">{task.title}</p>
                <button 
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all"
                  title="Xóa task"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex justify-between items-center pt-1 text-[9px] text-zinc-500">
                  <span className={`px-1 rounded uppercase tracking-wider font-bold ${
                    task.priority === "high" ? "bg-red-500/10 text-red-400" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  }`}>{task.priority}</span>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => handleStatusChange(task.id, "in_progress")}
                      className="text-[9px] text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 font-semibold flex items-center gap-0.5"
                    >
                      <Play className="w-2.5 h-2.5" /> Start
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. IN PROGRESS COLUMN */}
        <div className="glass-panel rounded-xl p-3 flex flex-col h-full overflow-hidden">
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h4 className="text-xs font-semibold text-purple-650 dark:text-purple-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
              Đang làm (In Progress)
            </h4>
            <span className="text-[9px] bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full">{inProgressTasks.length}</span>
          </div>
          <div className="space-y-2 pr-1 overflow-y-auto flex-1 min-h-[150px]">
            {inProgressTasks.map(task => (
              <div 
                key={task.id} 
                className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/5 space-y-2 hover:border-purple-500/20 transition-all relative group"
              >
                {task.source === "jira" && (
                  <span className="text-[8px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Jira</span>
                )}
                <p className="text-xs text-zinc-800 dark:text-white font-medium pr-6 leading-relaxed">{task.title}</p>
                <div className="flex justify-between items-center pt-1 text-[9px] text-zinc-500">
                  <span className={`px-1 rounded uppercase tracking-wider font-bold ${
                    task.priority === "high" ? "bg-red-500/10 text-red-400" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400"
                  }`}>{task.priority}</span>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => handleStatusChange(task.id, "done")}
                      className="text-[9px] text-teal-650 dark:text-teal-400 hover:text-teal-500 dark:hover:text-teal-300 font-semibold flex items-center gap-0.5"
                    >
                      <CheckCircle className="w-2.5 h-2.5" /> Done
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. DONE COLUMN */}
        <div className="glass-panel rounded-xl p-3 flex flex-col h-full overflow-hidden">
          <div className="flex justify-between items-center mb-3 shrink-0">
            <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Đã xong (Done)
            </h4>
            <span className="text-[9px] bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">{doneTasks.length}</span>
          </div>
          <div className="space-y-2 pr-1 overflow-y-auto flex-1 min-h-[150px]">
            {doneTasks.map(task => (
              <div 
                key={task.id} 
                className="p-3 rounded-lg bg-zinc-100/50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-white/5 opacity-60 relative group"
              >
                {task.source === "jira" && (
                  <span className="text-[8px] bg-zinc-200 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider block mb-1">Jira</span>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-through pr-6 leading-relaxed">{task.title}</p>
                <button 
                  type="button"
                  onClick={() => handleDelete(task.id)}
                  className="absolute top-2 right-2 p-1 opacity-0 group-hover:opacity-100 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all"
                  title="Xóa task"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex justify-between items-center pt-1 text-[9px] text-zinc-500">
                  <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-500 px-1 rounded uppercase tracking-wider font-bold">Done</span>
                  <button 
                    type="button"
                    onClick={() => handleStatusChange(task.id, "todo")}
                    className="text-[9px] text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 font-semibold"
                  >
                    Re-open
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* JIRA WRITE BACK CONFIRMATION MODAL */}
      {showJiraConfirm && pendingJiraAction && (
        <ConfirmModal 
          isOpen={showJiraConfirm}
          title="Đồng bộ trạng thái lên Jira"
          provider="Jira Cloud Service"
          target={`${pendingJiraAction.task.external_id} (${pendingJiraAction.task.title.replace(/^\[[^\]]+\]\s*/, "")})`}
          actionDetails={[
            {
              label: "Trạng thái local",
              oldVal: pendingJiraAction.task.status,
              newVal: pendingJiraAction.newStatus
            },
            {
              label: "Jira Issue Transition",
              newVal: pendingJiraAction.newStatus === "done" ? "Done (Closed)" : pendingJiraAction.newStatus
            }
          ]}
          warningMessage="Hành động này sẽ thực hiện transition trạng thái của Issue trên Jira Cloud của công ty."
          onConfirm={handleConfirmJiraWrite}
          onCancel={() => {
            setShowJiraConfirm(false);
            setPendingJiraAction(null);
          }}
        />
      )}
    </div>
  );
}
