import React, { useState, useEffect } from "react";
import { 
  Zap, 
  CheckSquare, 
  Terminal, 
  FileText, 
  ChevronRight
} from "lucide-react";
import { createNote, getNotes, Note } from "../database/queries/notes";
import { getTodayTasks, Task } from "../database/queries/tasks";

interface DashboardViewProps {
  setActiveView: (view: string) => void;
  setSelectedNoteId: (id: string | null) => void;
  triggerToast: (message: string) => void;
}

export default function DashboardView({ 
  setActiveView, 
  setSelectedNoteId,
  triggerToast 
}: DashboardViewProps) {
  const [quickText, setQuickText] = useState("");
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);

  // Load data from local SQLite
  useEffect(() => {
    async function loadData() {
      try {
        const tasks = await getTodayTasks();
        setTodayTasks(tasks.slice(0, 5)); // Show top 5 today tasks

        const notes = await getNotes();
        setRecentNotes(notes.slice(0, 3)); // Show top 3 recent notes
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      }
    }
    loadData();
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
      setRecentNotes(notes.slice(0, 3));
    } catch (err) {
      console.error("Failed to save quick note:", err);
      triggerToast("Lỗi lưu ghi chú!");
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto space-y-6 pr-1">
      {/* Welcome Header */}
      <div className="flex justify-between items-start shrink-0">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Chào buổi chiều, Bảo!</h2>
          <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5">Mọi sửa đổi sẽ tự động được lưu trữ local (Offline-first).</p>
        </div>
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        
        {/* Main Content Columns (8 cols on Desktop) */}
        <div className="col-span-12 md:col-span-8 space-y-5">
          
          {/* Quick Capture Panel */}
          <section className="glass-panel rounded-xl p-4 sm:p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-500 to-teal-500"></div>
            <h3 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              Quick Capture / Ghi nhanh note mới
            </h3>
            <textarea 
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder="Nhập nhanh ghi chú ở đây... Bấm nút lưu để cất vào Inbox" 
              className="w-full h-20 p-2.5 rounded-lg glass-input text-xs text-zinc-300 resize-none"
            />
            <div className="flex justify-end mt-2">
              <button 
                onClick={handleQuickSave}
                className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] px-3.5 py-1.5 rounded-md font-semibold transition-all"
              >
                Lưu nhanh
              </button>
            </div>
          </section>

          {/* Today Tasks and Commands side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Today Tasks Widget */}
            <div className="glass-panel rounded-xl p-4">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                <CheckSquare className="w-3.5 h-3.5 text-teal-400" />
                Today Tasks
              </h3>
              {todayTasks.length === 0 ? (
                <p className="text-[10px] text-zinc-500 py-3 text-center">Không có việc cần làm hôm nay.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {todayTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2 hover:bg-white/5 p-1.5 rounded">
                      <input 
                        type="checkbox" 
                        checked={task.status === "done"}
                        readOnly
                        className="rounded border-zinc-700 bg-zinc-800 text-purple-600 focus:ring-purple-600"
                      />
                      <span className="text-zinc-300 truncate">{task.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Command Blocks Widget */}
            <div className="glass-panel rounded-xl p-4">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-purple-400" />
                Command Block nổi bật
              </h3>
              <div className="space-y-2 text-xs">
                <div className="bg-zinc-900/60 p-2.5 rounded border border-white/5 flex flex-col gap-1.5">
                  <code className="text-[10px] font-mono text-zinc-300 truncate">kubectl port-forward svc/postgres 5434:5432</code>
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => triggerToast("Nhập biến (Chức năng mẫu)")}
                      className="text-[9px] text-purple-400 font-semibold hover:underline"
                    >
                      Nhập Biến
                    </button>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText("kubectl port-forward svc/postgres 5434:5432 -n staging");
                        triggerToast("Đã copy command!");
                      }}
                      className="text-[9px] bg-purple-600/20 text-purple-400 px-1.5 py-0.5 rounded font-bold"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Columns (4 cols on Desktop) */}
        <div className="col-span-12 md:col-span-4 space-y-5">
          {/* Daily Note Status */}
          <section className="glass-panel rounded-xl p-4">
            <h3 className="text-xs font-bold text-white mb-2">Daily Note hôm nay</h3>
            <div className="p-3 rounded-lg bg-zinc-900/60 border border-white/5 space-y-2">
              <p className="text-xs text-white font-medium">Daily Note - {new Date().toISOString().split('T')[0]}</p>
              <p className="text-[10px] text-zinc-500 leading-relaxed">Tiến độ ngày hôm nay của bạn. Ghi nhận các hoạt động và tự động summary cuối ngày.</p>
              <button 
                onClick={() => setActiveView("daily")}
                className="text-[9px] text-teal-400 font-semibold hover:underline flex items-center gap-1 pt-1"
              >
                Mở Daily Note <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </section>

          {/* Recent Notes Widget */}
          <section className="glass-panel rounded-xl p-4">
            <h3 className="text-xs font-bold text-white mb-3">Ghi chú gần đây</h3>
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
                    className="p-2 rounded hover:bg-white/5 border border-white/5 cursor-pointer transition-all flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="text-zinc-300 truncate font-medium flex-1">{note.title}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

      </div>
    </div>
  );
}
