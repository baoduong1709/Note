import React, { useState, useEffect } from "react";
import { Sparkles, Calendar, Terminal, CheckCircle2, FileText, ArrowRight } from "lucide-react";
import { getDatabase } from "../database/db";
import { generateDailySummaryAI } from "../services/aiService";
import { updateNote, getNoteById, Note } from "../database/queries/notes";

interface DailyNotesViewProps {
  triggerToast: (message: string) => void;
}

export default function DailyNotesView({ triggerToast }: DailyNotesViewProps) {
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [doneTasks, setDoneTasks] = useState<string[]>([]);
  const [copiedCommands, setCopiedCommands] = useState<string[]>([]);
  const todayStr = new Date().toISOString().split('T')[0];
  const noteId = `daily-${todayStr}`;

  // Load completed tasks and copied commands from SQLite local database
  const loadTodayStats = async () => {
    try {
      const db = await getDatabase();
      const startOfDay = `${todayStr} 00:00:00`;
      
      // 1. Get tasks completed today
      const completedTasks = await db.select<any[]>(
        "SELECT title FROM tasks WHERE status = 'done' AND updated_at >= ?",
        [startOfDay]
      );
      setDoneTasks(completedTasks.map(t => t.title));

      // 2. Get commands copied today from activity logs
      const logs = await db.select<any[]>(
        "SELECT description FROM activity_logs WHERE target_type = 'note' AND action = 'updated' AND created_at >= ?",
        [startOfDay]
      );
      // Fallback command mock or real command strings parsed from logs
      const commands = logs
        .filter(l => l.description.toLowerCase().includes("copied"))
        .map(l => l.description.replace("Copied command: ", ""));
        
      setCopiedCommands(commands.length > 0 ? commands : ["kubectl port-forward svc/postgres 5434:5432 -n staging"]);
    } catch (err) {
      console.error("Failed to load today's stats:", err);
    }
  };

  useEffect(() => {
    loadTodayStats();
    
    // Check if there is already a summary in the Daily Note in database
    async function checkExistingSummary() {
      try {
        const note = await getNoteById(noteId);
        if (note && note.content) {
          const match = note.content.match(/## Summary cuối ngày\n([\s\S]+)/);
          if (match && match[1].trim() && !match[1].includes("Bấm nút")) {
            setAiSummary(match[1].trim());
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    checkExistingSummary();
  }, []);

  const handleGenerateSummary = async () => {
    setLoading(true);
    try {
      const summary = await generateDailySummaryAI(todayStr, doneTasks, copiedCommands);
      setAiSummary(summary);
      triggerToast("AI đã sinh báo cáo thành công!");
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || "Lỗi kết nối AI!");
    } finally {
      setLoading(false);
    }
  };

  const handleInsertIntoNote = async () => {
    if (!aiSummary) return;
    try {
      const note = await getNoteById(noteId);
      if (note) {
        // Replace or append to ## Summary cuối ngày section
        let content = note.content;
        const summarySection = `## Summary cuối ngày\n${aiSummary}\n`;
        
        if (content.includes("## Summary cuối ngày")) {
          content = content.replace(/## Summary cuối ngày[\s\S]*/, summarySection);
        } else {
          content += `\n\n${summarySection}`;
        }

        await updateNote(noteId, note.title, content);
        triggerToast("Đã chèn và lưu báo cáo vào Daily Note!");
      }
    } catch (err) {
      console.error(err);
      triggerToast("Lỗi chèn báo cáo vào note!");
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto space-y-6">
      <div className="pb-3 border-b border-white/5 flex justify-between items-center shrink-0">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-white">Daily Note: {todayStr}</h3>
          <p className="text-[10px] text-zinc-400">Tự động khởi tạo theo dõi nhật ký làm việc</p>
        </div>
        
        <button 
          onClick={handleGenerateSummary}
          disabled={loading}
          className="flex items-center gap-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-[10px] px-3.5 py-2 rounded-lg font-medium transition-all shrink-0 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          AI Summary
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
        {/* Left Stats Column */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl glass-panel space-y-2.5">
            <h4 className="font-bold text-teal-400 border-b border-white/5 pb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Task đã hoàn thành hôm nay
            </h4>
            {doneTasks.length === 0 ? (
              <p className="text-zinc-500 italic py-2">Chưa hoàn thành task nào. Hãy đổi status task sang Done để cập nhật tại đây.</p>
            ) : (
              <ul className="list-disc list-inside space-y-1.5 text-zinc-300">
                {doneTasks.map((t, idx) => <li key={idx}>{t}</li>)}
              </ul>
            )}
          </div>

          <div className="p-4 rounded-xl glass-panel space-y-2.5">
            <h4 className="font-bold text-purple-400 border-b border-white/5 pb-1 flex items-center gap-1.5">
              <Terminal className="w-4 h-4" />
              Command đã copy hôm nay
            </h4>
            <ul className="space-y-1.5 text-zinc-400 font-mono text-[9px]">
              {copiedCommands.map((cmd, idx) => (
                <li key={idx} className="bg-black/30 p-1.5 rounded truncate" title={cmd}>
                  {cmd}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right AI Report Column */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl glass-panel space-y-3 flex flex-col h-full min-h-[250px]">
            <h4 className="font-bold text-purple-400 border-b border-white/5 pb-1 flex items-center gap-1.5 shrink-0">
              <Sparkles className="w-4 h-4 text-purple-400" />
              AI Daily Summary (Tóm tắt tự động)
            </h4>
            
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-6 text-purple-400">
                <Sparkles className="w-5 h-5 animate-spin mb-2" />
                <span>AI đang đọc SQLite data và lập báo cáo...</span>
              </div>
            ) : aiSummary ? (
              <div className="flex-1 flex flex-col justify-between space-y-4 min-h-0">
                <div className="text-zinc-300 bg-zinc-950/40 p-3 rounded-lg border border-white/5 leading-relaxed whitespace-pre-wrap text-xs overflow-y-auto">
                  {aiSummary}
                </div>
                <div className="flex justify-end pt-2 border-t border-white/5 shrink-0">
                  <button 
                    onClick={handleInsertIntoNote}
                    className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] px-3.5 py-1.5 rounded font-bold transition-all flex items-center gap-1"
                  >
                    Chèn vào Daily Note <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 text-zinc-500 bg-zinc-950/40 p-3 rounded-lg border border-white/5 text-center flex items-center justify-center leading-relaxed">
                Bấm nút "AI Summary" ở góc trên bên phải để AI phân tích logs, ghi chú, tasks hôm nay và sinh báo cáo markdown.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
