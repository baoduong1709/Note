import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import DashboardView from "./views/DashboardView";
import NotesView from "./views/NotesView";
import TasksView from "./views/TasksView";
import DailyNotesView from "./views/DailyNotesView";
import SettingsView from "./views/SettingsView";
import AIChatPanel from "./components/AIChatPanel";
import { initDatabase, getDatabase } from "./database/db";
import { createNote, Note } from "./database/queries/notes";
import { CheckCircle, Lock, ShieldCheck, Sparkles } from "lucide-react";

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [jiraConnected, setJiraConnected] = useState(true);
  const [toast, setToast] = useState({ message: "", show: false });
  const [dbReady, setDbReady] = useState(false);
  const [showAiSidebar, setShowAiSidebar] = useState(true);

  // Theme settings
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("theme") as "light" | "dark") || "dark";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  // App PIN lock states
  const [isLocked, setIsLocked] = useState(false);
  const [inputPin, setInputPin] = useState("");
  const [pinError, setPinError] = useState(false);

  // Auto check and create Daily Note for today
  const checkAndCreateDailyNote = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const db = await getDatabase();
      const existing = await db.select<Note[]>(
        "SELECT * FROM notes WHERE type = 'daily' AND title LIKE ?",
        [`%${todayStr}%`]
      );

      if (existing.length === 0) {
        const defaultContent = 
          `# Daily Note - ${todayStr}\n\n` +
          `## Todo hôm nay\n` +
          `- [ ] Start working on main tasks\n\n` +
          `## Đang làm\n\n` +
          `## Đã xong\n\n` +
          `## Command đã dùng hôm nay\n\n` +
          `## Summary cuối ngày\n`;

        const newDailyNote: Note = {
          id: `daily-${todayStr}`,
          workspace_id: "personal",
          project_id: null,
          title: `Daily Note - ${todayStr}`,
          content: defaultContent,
          type: "daily",
          is_locked: 0,
          is_pending_sync: 1
        };

        await createNote(newDailyNote);
        console.log(`[DailyNote] Auto-created today's daily note: ${todayStr}`);
      }
    } catch (err) {
      console.error("Failed to auto-create daily note:", err);
    }
  };

  // Auto check and create USER.md & MEMORY.md for Hermes Memory
  const checkAndCreateHermesNotes = async () => {
    try {
      const db = await getDatabase();
      
      // 1. Check USER.md
      const userExisting = await db.select<Note[]>("SELECT * FROM notes WHERE title = 'USER.md' LIMIT 1");
      if (userExisting.length === 0) {
        const newUserNote: Note = {
          id: "hermes-user-md",
          workspace_id: "personal",
          project_id: null,
          title: "USER.md",
          content: "# USER.md\n*Bộ nhớ thông tin cá nhân của người dùng (Hermes Style).*\n\n- Tên của người dùng là Bảo.\n",
          type: "quick",
          is_locked: 0,
          is_pending_sync: 0
        };
        await createNote(newUserNote);
      }

      // 2. Check MEMORY.md
      const memExisting = await db.select<Note[]>("SELECT * FROM notes WHERE title = 'MEMORY.md' LIMIT 1");
      if (memExisting.length === 0) {
        const newMemNote: Note = {
          id: "hermes-memory-md",
          workspace_id: "personal",
          project_id: null,
          title: "MEMORY.md",
          content: "# MEMORY.md\n*Bộ nhớ kỹ thuật và cấu hình dự án (Hermes Style).*\n\n- Dự án hiện tại là Personal Work Notebook viết bằng Tauri v2 và React.\n",
          type: "quick",
          is_locked: 0,
          is_pending_sync: 0
        };
        await createNote(newMemNote);
      }
    } catch (err) {
      console.error("Failed to check/create Hermes notes:", err);
    }
  };

  // Initialize database and check PIN Lock when app starts
  useEffect(() => {
    async function setupApp() {
      try {
        await initDatabase();
        setDbReady(true);
        await checkAndCreateDailyNote();
        await checkAndCreateHermesNotes();

        // Check if PIN lock is enabled in localStorage
        const isPinEnabled = localStorage.getItem("pin_lock_enabled") === "true";
        if (isPinEnabled) {
          setIsLocked(true);
        }
      } catch (err) {
        console.error("App initialization failed:", err);
      }
    }
    setupApp();
  }, []);

  // Listen for view changes from other components
  useEffect(() => {
    const handleChangeView = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setActiveView(customEvent.detail);
      }
    };
    window.addEventListener("change-view", handleChangeView);
    return () => window.removeEventListener("change-view", handleChangeView);
  }, []);

  const triggerToast = (message: string) => {
    setToast({ message, show: true });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 2500);
  };

  // Handle PIN code submission
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const savedPin = localStorage.getItem("pin_lock_code");
    
    if (inputPin === savedPin) {
      setIsLocked(false);
      setInputPin("");
      setPinError(false);
      triggerToast("Chào mừng quay trở lại, Bảo!");
    } else {
      setPinError(true);
      setInputPin("");
      triggerToast("Mã PIN không chính xác!");
    }
  };

  const renderView = () => {
    if (!dbReady) {
      return (
        <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
          Đang kết nối cơ sở dữ liệu SQLite local...
        </div>
      );
    }

    switch (activeView) {
      case "dashboard":
        return (
          <DashboardView 
            setActiveView={setActiveView} 
            setSelectedNoteId={setSelectedNoteId}
            triggerToast={triggerToast}
          />
        );
      case "notes":
        return (
          <NotesView 
            selectedNoteId={selectedNoteId} 
            setSelectedNoteId={setSelectedNoteId}
            triggerToast={triggerToast}
          />
        );
      case "tasks":
        return <TasksView triggerToast={triggerToast} />;
      case "daily":
        return <DailyNotesView triggerToast={triggerToast} />;
      case "settings":
        return (
          <SettingsView 
            jiraConnected={jiraConnected} 
            setJiraConnected={setJiraConnected}
            triggerToast={triggerToast}
            theme={theme}
            setTheme={setTheme}
          />
        );
      default:
        return <div className="text-xs text-zinc-500">View not found</div>;
    }
  };

  // Lock Screen Overlay UI
  if (isLocked) {
    return (
      <div className="h-screen w-screen bg-zinc-100 dark:bg-[#070709] flex items-center justify-center relative font-sans text-zinc-700 dark:text-zinc-300 transition-colors duration-200">
        <div className="absolute inset-0 bg-gradient-to-tr from-purple-950/20 to-teal-950/20 opacity-40"></div>
        <div className="glass-panel w-full max-w-sm rounded-2xl p-6 sm:p-8 space-y-6 border border-zinc-200 dark:border-white/5 relative z-10 shadow-2xl flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-purple-600/10 text-purple-400 flex items-center justify-center mb-2">
            <Lock className="w-6 h-6 animate-pulse" />
          </div>
          
          <div className="text-center space-y-1.5">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-widest">AI NOTEBOOK LOCKED</h2>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Vui lòng nhập mã PIN bảo mật để mở khóa dữ liệu local.</p>
          </div>

          <form onSubmit={handlePinSubmit} className="w-full space-y-4 flex flex-col items-center">
            <input 
              type="password"
              maxLength={8}
              value={inputPin}
              onChange={(e) => {
                setPinError(false);
                setInputPin(e.target.value.replace(/\D/g, ""));
              }}
              placeholder="••••"
              className={`w-3/4 p-2.5 rounded-lg glass-input text-center text-lg font-mono tracking-[0.75em] text-zinc-800 dark:text-white focus:outline-none focus:ring-1 ${
                pinError ? "border-red-500/50 bg-red-950/10 focus:ring-red-500" : "focus:ring-purple-500"
              }`}
              autoFocus
              required
            />
            
            <button 
              type="submit"
              className="w-3/4 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs py-2 rounded-lg transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" /> Mở khóa
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-row overflow-hidden bg-zinc-200 dark:bg-[#0b0b0d] text-zinc-800 dark:text-zinc-300 font-sans transition-colors duration-200">
      {/* Aurora Background Glows */}
      <div className="absolute top-[-10%] left-[-5%] w-[45%] h-[45%] rounded-full bg-gradient-to-tr from-purple-400/20 to-teal-400/20 dark:from-purple-900/10 dark:to-teal-900/10 blur-[100px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[45%] h-[45%] rounded-full bg-gradient-to-br from-indigo-400/20 to-pink-400/20 dark:from-indigo-900/10 dark:to-pink-900/10 blur-[100px] pointer-events-none z-0"></div>

      {/* 1. SIDEBAR LEFT (PC/Web) */}
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView} 
        jiraConnected={jiraConnected} 
      />

      {/* CONTAINER CHO GIAO DIỆN CHÍNH & AI CHAT PANEL */}
      <div className="flex-1 min-w-0 h-full min-h-0 flex flex-row overflow-hidden relative">
        
        {/* 2. MAIN VIEW CONTENT */}
        <main key={activeView} className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden p-4 sm:p-6 pb-20 md:pb-6 view-enter-animate">
          {/* Top Bar for Mobile */}
          <div className="md:hidden flex items-center justify-between pb-3 border-b border-white/5 mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
              <span className="text-xs font-bold text-white tracking-wide">AI NOTEBOOK</span>
            </div>
            <div className="text-[10px] text-teal-400 font-semibold">
              SQLite local ready
            </div>
          </div>

          {/* Render Active Tab */}
          {renderView()}
        </main>

        {/* 3. AI CHAT PANEL (PC/Web only) */}
        {showAiSidebar && (
          <AIChatPanel onClose={() => setShowAiSidebar(false)} />
        )}
      </div>

      {/* 4. BOTTOM NAVIGATION BAR FOR MOBILE */}
      <BottomNav activeView={activeView} setActiveView={setActiveView} />

      {/* 5. TOAST MESSAGE */}
      <div 
        className={`toast fixed top-5 right-5 max-w-[min(420px,calc(100vw-2rem))] pointer-events-none glass-panel border border-teal-500/20 bg-teal-950/20 text-teal-400 px-4 py-3 rounded-lg flex items-center gap-2 shadow-lg z-50 ${
          toast.show ? "show" : ""
        }`}
      >
        <CheckCircle className="w-4 h-4" />
        <span className="text-xs font-semibold">{toast.message}</span>
      </div>

      {/* 6. FLOATING OPEN AI SIDEBAR BUTTON */}
      {!showAiSidebar && (
        <button 
          onClick={() => setShowAiSidebar(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-purple-600/80 hover:bg-purple-600 backdrop-blur text-white p-2 py-3 rounded-l-lg shadow-2xl border border-r-0 border-white/10 flex flex-col items-center gap-1.5 transition-all z-40 cursor-pointer"
          title="Mở trợ lý AI"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-200" />
          <span className="text-[8px] font-bold uppercase tracking-wider [writing-mode:vertical-lr] select-none">AI Chat</span>
        </button>
      )}
    </div>
  );
}
