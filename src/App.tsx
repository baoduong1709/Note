import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import DashboardView from "./views/DashboardView";
import NotesView from "./views/NotesView";
import TasksView from "./views/TasksView";
import CalendarView from "./views/CalendarView";
import SettingsView from "./views/SettingsView";
import ShareView from "./views/ShareView";
import AIChatPanel from "./components/AIChatPanel";
import { initDatabase, getDatabase } from "./database/db";
import { createNote, Note } from "./database/queries/notes";
import { CheckCircle, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { initNotifications, checkAndNotifyDueTasks } from "./services/notificationService";
import { useShareWebSocket } from "./hooks/useShareWebSocket";

export default function App() {
  const [activeView, setActiveView] = useState("dashboard");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
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
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const handleDrawerToggle = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsMobileDrawerOpen(!!customEvent.detail?.open);
    };
    window.addEventListener("mobile-drawer-toggle", handleDrawerToggle);
    return () => {
      window.removeEventListener("mobile-drawer-toggle", handleDrawerToggle);
    };
  }, []);

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

  const [authState, setAuthState] = useState(0);
  const [globalSyncId, setGlobalSyncId] = useState<string | null>(null);

  // Compute and set global syncId when authentication state changes
  useEffect(() => {
    async function loadSyncId() {
      const email = localStorage.getItem("sync_user_email");
      if (email) {
        const { generateSyncIdFromEmail } = await import("./services/shareService");
        const id = await generateSyncIdFromEmail(email);
        setGlobalSyncId(id);
      } else {
        setGlobalSyncId(null);
      }
    }
    loadSyncId();
  }, [authState]);

  // Global WebSocket listener for real-time Share & Sync signaling
  useShareWebSocket({
    syncId: globalSyncId,
    triggerToastGlobal: (msg) => {
      triggerToast(msg);
    }
  });

  // Global show-toast custom event listener
  useEffect(() => {
    const handleShowToast = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        triggerToast(customEvent.detail);
      }
    };
    window.addEventListener("show-toast", handleShowToast);
    return () => {
      window.removeEventListener("show-toast", handleShowToast);
    };
  }, []);

  // Initialize database and check PIN Lock when app starts
  useEffect(() => {
    async function setupApp() {
      try {
        await initDatabase();
        setDbReady(true);
        await checkAndCreateHermesNotes();
        localStorage.removeItem("jira_config");

        // Check if PIN lock is enabled in localStorage
        const isPinEnabled = localStorage.getItem("pin_lock_enabled") === "true";
        if (isPinEnabled) {
          setIsLocked(true);
        }

        // Initialize and check for due task notifications
        await initNotifications();
        await checkAndNotifyDueTasks();

        // Cloud sync data pull on startup if logged in
        const userEmail = localStorage.getItem("sync_user_email");
        if (userEmail) {
          const { pullCloudDataToLocal } = await import("./services/appSyncService");
          const updated = await pullCloudDataToLocal();
          if (updated) {
            window.dispatchEvent(new CustomEvent("task-updated"));
            window.dispatchEvent(new CustomEvent("notes-updated"));
            window.dispatchEvent(new CustomEvent("calendar-updated"));
            window.dispatchEvent(new CustomEvent("ai-chat-updated"));
          }
        }
      } catch (err) {
        console.error("App initialization failed:", err);
      }
    }
    setupApp();

    const handleAuth = () => {
      setAuthState(prev => prev + 1);
    };
    window.addEventListener("auth-state-changed", handleAuth);

    // Check for due tasks periodically in the background every 15 minutes
    const intervalId = setInterval(() => {
      checkAndNotifyDueTasks();
    }, 15 * 60 * 1000);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("auth-state-changed", handleAuth);
    };
  }, [authState]);

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
      case "calendar":
        return <CalendarView triggerToast={triggerToast} />;
      case "share":
        return <ShareView triggerToast={triggerToast} />;
      case "settings":
        return (
          <SettingsView 
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
      <div className={`h-screen w-screen flex items-center justify-center relative font-sans text-zinc-700 dark:text-zinc-300 transition-colors duration-200 ${theme === 'dark' ? 'lockscreen-aurora' : 'lockscreen-aurora-light'}`}>
        {/* Animated aurora orbs on lock screen */}
        <div className="aurora-orb aurora-orb-1"></div>
        <div className="aurora-orb aurora-orb-2"></div>
        <div className="aurora-orb aurora-orb-3"></div>
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

  const showCheckIcon = !toast.message.startsWith("⚠️") && 
                        !toast.message.startsWith("🔄") && 
                        !toast.message.startsWith("❌") && 
                        !toast.message.startsWith("👋") &&
                        !toast.message.startsWith("📋") &&
                        !toast.message.startsWith("📥");

  return (
    <>
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-zinc-200 dark:bg-[#0b0b0d] text-zinc-800 dark:text-zinc-300 font-sans transition-colors duration-200">
      {/* Animated Aurora Floating Orbs - wrapped in absolute container to stay out of flex flow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="aurora-orb aurora-orb-1"></div>
        <div className="aurora-orb aurora-orb-2"></div>
        <div className="aurora-orb aurora-orb-3"></div>
        <div className="aurora-orb aurora-orb-4"></div>
        <div className="mesh-gradient-overlay"></div>
      </div>

      {/* ROW CONTAINER: Sidebar + Main Content (takes all available space) */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* 1. SIDEBAR LEFT (PC/Web) */}
        <Sidebar 
          activeView={activeView} 
          setActiveView={setActiveView} 
        />

        {/* CONTAINER CHO GIAO DIỆN CHÍNH & AI CHAT PANEL */}
        <div className="flex-1 min-w-0 h-full min-h-0 flex flex-row overflow-hidden relative">
          
          {/* 2. MAIN VIEW CONTENT */}
          <main className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden p-3 sm:p-6">
            {/* Top Bar for Mobile */}
            <div className="md:hidden flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
                <span className="text-xs font-bold text-zinc-900 dark:text-white tracking-wide">AI NOTEBOOK</span>
              </div>
              <span className="h-2 w-2 rounded-full bg-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.65)]" aria-label="Local database ready" />
            </div>

            {/* Render Active Tab with Framer Motion transitions */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden"
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* 3. AI CHAT PANEL (Mobile Drawer & Desktop Sidebar) */}
          {showAiSidebar && (
            <>
              {/* Mobile/Tablet Backdrop Overlay */}
              <div 
                className="xl:hidden fixed inset-0 bg-black/45 backdrop-blur-[2px] z-40 transition-opacity duration-300"
                onClick={() => setShowAiSidebar(false)}
                aria-label="Close AI Assistant"
              />
              <AIChatPanel onClose={() => setShowAiSidebar(false)} />
            </>
          )}
        </div>
      </div>

      {/* 4. BOTTOM NAVIGATION BAR FOR MOBILE - inside flex-col flow, always at bottom */}
      <BottomNav activeView={activeView} setActiveView={setActiveView} />
    </div>

    {/* Fixed overlays - outside flex container to prevent layout interference */}

    {/* 5. TOAST MESSAGE */}
    <div 
      className={`toast toast-gradient pointer-events-none glass-panel border-transparent bg-white/95 dark:bg-zinc-900/90 text-teal-600 dark:text-teal-400 px-4 py-3 rounded-lg flex items-start gap-2.5 shadow-lg ${
        toast.show ? "show" : ""
      }`}
    >
      {showCheckIcon && <CheckCircle className="w-4 h-4 shrink-0 icon-glow mt-0.5" />}
      <span className="text-xs font-semibold relative z-10">{toast.message}</span>
    </div>

    {/* 6. FLOATING OPEN AI SIDEBAR BUTTON */}
    {!showAiSidebar && (
      <>
        {/* Mobile View: Floating Action Button (FAB) */}
        {!isMobileDrawerOpen && (
          <button
            onClick={() => setShowAiSidebar(true)}
            className="sm:hidden fixed right-4 bottom-20 w-11 h-11 rounded-full bg-purple-650 text-white flex items-center justify-center shadow-xl border border-white/15 z-40 cursor-pointer ai-glow-pulse"
            title="Mở trợ lý AI"
          >
            <Sparkles className="w-4 h-4 text-white icon-glow" />
          </button>
        )}

        {/* Desktop View: Vertical side handle */}
        <button 
          onClick={() => setShowAiSidebar(true)}
          className="hidden sm:flex fixed right-0 top-1/2 -translate-y-1/2 bg-purple-600/80 hover:bg-purple-600 backdrop-blur text-white p-2 py-3 rounded-l-lg shadow-2xl border border-r-0 border-white/10 flex flex-col items-center gap-1.5 transition-all z-40 cursor-pointer ai-glow-pulse"
          title="Mở trợ lý AI"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-200 icon-glow" />
          <span className="text-[8px] font-bold uppercase tracking-wider [writing-mode:vertical-lr] select-none">AI Chat</span>
        </button>
      </>
    )}
    </>
  );
}
