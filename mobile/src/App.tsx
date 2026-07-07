import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BottomNav from "./components/BottomNav";
import { useLanguage } from "../../shared/contexts/LanguageContext";

// Mobile Views
import DashboardView from "./views/DashboardView";
import NotesView from "./views/NotesView";
import TasksView from "./views/TasksView";
import CalendarView from "./views/CalendarView";
import SettingsView from "./views/SettingsView";
import ShareView from "./views/ShareView";

import AIChatPanel from "../../shared/components/AIChatPanel";
import { initDatabase, getDatabase } from "../../shared/database/db";
import { createNote, Note } from "../../shared/database/queries/notes";
import { CheckCircle, Lock, ShieldCheck, Sparkles, LogIn, ArrowRight, Database, RefreshCw, Bot } from "lucide-react";
import { initNotifications, checkAndNotifyDueTasks } from "../../shared/services/notificationService";
import { startGoogleOAuth } from "../../shared/services/authService";
import { useShareWebSocket } from "../../shared/hooks/useShareWebSocket";

export default function App() {
  const { t } = useLanguage();
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

  // Onboarding Wizard states
  const [isOnboarded, setIsOnboarded] = useState(() => {
    return localStorage.getItem("onboarding_completed") === "true";
  });
  const [onboardingStep, setOnboardingStep] = useState<'welcome' | 'pin_setup'>('welcome');
  const [isOnboardingLoginLoading, setIsOnboardingLoginLoading] = useState(false);
  const [pinSetupInput, setPinSetupInput] = useState("");
  const [showPinSetupPass, setShowPinSetupPass] = useState(false);

  // E2EE decryption states
  const [needDecryption, setNeedDecryption] = useState(false);
  const [showDecryptionModal, setShowDecryptionModal] = useState(false);
  const [decryptPassphraseInput, setDecryptPassphraseInput] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptionError, setDecryptionError] = useState(false);

  // Global simulated google login modal states
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginStep, setLoginStep] = useState<'email' | 'accounts' | 'loading'>('accounts');

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
      
      // 1. Check USER.md (by id or title)
      const userExisting = await db.select<Note[]>("SELECT * FROM notes WHERE id = 'hermes-user-md' OR title = 'USER.md' LIMIT 1");
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
        try {
          await createNote(newUserNote);
        } catch (err: any) {
          if (!err.toString().includes("UNIQUE constraint failed")) {
            throw err;
          }
        }
      }

      // 2. Check MEMORY.md (by id or title)
      const memExisting = await db.select<Note[]>("SELECT * FROM notes WHERE id = 'hermes-memory-md' OR title = 'MEMORY.md' LIMIT 1");
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
        try {
          await createNote(newMemNote);
        } catch (err: any) {
          if (!err.toString().includes("UNIQUE constraint failed")) {
            throw err;
          }
        }
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
      const anonCode = sessionStorage.getItem("anonymous_share_code");
      if (anonCode) {
        setGlobalSyncId(anonCode);
        return;
      }

      const email = localStorage.getItem("sync_user_email");
      if (email) {
        const { generateSyncIdFromEmail } = await import("../../shared/services/shareService");
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

        // Initialize and check for due task notifications
        await initNotifications();
        await checkAndNotifyDueTasks();

        // Cloud sync data pull on startup if logged in
        const userEmail = localStorage.getItem("sync_user_email");
        if (userEmail) {
          const { pullCloudDataToLocal } = await import("../../shared/services/appSyncService");
          const updated = await pullCloudDataToLocal();
          if (updated) {
            window.dispatchEvent(new CustomEvent("task-updated"));
            window.dispatchEvent(new CustomEvent("notes-updated"));
            window.dispatchEvent(new CustomEvent("calendar-updated"));
            window.dispatchEvent(new CustomEvent("ai-chat-updated"));
          }
        }

        // Check for encrypted local data
        const { hasEncryptedDataInLocal } = await import("../../shared/services/appSyncService");
        const hasEncrypted = await hasEncryptedDataInLocal();
        const storedPassphrase = localStorage.getItem("e2ee_passphrase");
        if (hasEncrypted && !storedPassphrase) {
          setNeedDecryption(true);
        } else {
          setNeedDecryption(false);
        }
      } catch (err) {
        console.error("App initialization failed:", err);
      }
    }
    setupApp();

    const handleAuth = async () => {
      setAuthState(prev => prev + 1);
      // Recheck encrypted data state
      try {
        const userEmail = localStorage.getItem("sync_user_email");
        if (userEmail) {
          const { pullCloudDataToLocal } = await import("../../shared/services/appSyncService");
          await pullCloudDataToLocal();
        }
        const { hasEncryptedDataInLocal } = await import("../../shared/services/appSyncService");
        const hasEncrypted = await hasEncryptedDataInLocal();
        const storedPassphrase = localStorage.getItem("e2ee_passphrase");
        if (hasEncrypted && !storedPassphrase) {
          setNeedDecryption(true);
          setShowDecryptionModal(true);
        } else {
          setNeedDecryption(false);
          setShowDecryptionModal(false);
        }
      } catch (err) {
        console.error(err);
      }
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

  // Handle PIN/Passphrase submission
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const savedPassphrase = localStorage.getItem("e2ee_passphrase") || localStorage.getItem("pin_lock_code") || "0000";
    
    if (inputPin === savedPassphrase) {
      setIsLocked(false);
      setInputPin("");
      setPinError(false);
      triggerToast("Chào mừng quay trở lại, Bảo!");
    } else {
      setPinError(true);
      setInputPin("");
      triggerToast("Mật khẩu không chính xác!");
    }
  };

  // Onboarding Login Handler
  const handleOnboardingLogin = async () => {
    setIsOnboardingLoginLoading(true);
    try {
      const account = await startGoogleOAuth(
        undefined,
        (msg) => triggerToast(msg)
      );
      if (account) {
        setOnboardingStep('pin_setup');
      }
    } catch (err) {
      console.error(err);
      triggerToast("Đăng nhập thất bại!");
    } finally {
      setIsOnboardingLoginLoading(false);
    }
  };

  const handleStartGoogleOAuthGlobal = async () => {
    setLoginStep('loading');
    try {
      const account = await startGoogleOAuth(
        (step) => setLoginStep(step),
        (msg) => triggerToast(msg)
      );
      if (account) {
        setShowLoginModal(false);
      }
    } catch (err) {
      console.error(err);
      setLoginStep('accounts');
    }
  };

  useEffect(() => {
    const handleTriggerLogin = () => {
      setLoginStep('accounts');
      setShowLoginModal(true);
    };
    window.addEventListener("trigger-google-login", handleTriggerLogin);
    return () => {
      window.removeEventListener("trigger-google-login", handleTriggerLogin);
    };
  }, []);

  // Onboarding Skip Handler (Offline Mode)
  const handleOnboardingSkip = () => {
    localStorage.setItem("onboarding_completed", "true");
    setIsOnboarded(true);
    triggerToast("Chế độ Offline: Bạn có thể viết ghi chú ngay bây giờ!");
  };

  // Onboarding PIN/Passphrase Setup Submit Handler
  const handleOnboardingPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinSetupInput.length < 6) {
      triggerToast("Mật khẩu mã hóa đầu cuối phải có ít nhất 6 ký tự!");
      return;
    }

    localStorage.setItem("e2ee_passphrase", pinSetupInput);
    localStorage.setItem("e2ee_enabled", "true");
    localStorage.setItem("pin_lock_code", pinSetupInput); // for backward compatibility/lock mechanism
    localStorage.setItem("pin_lock_enabled", "true");
    localStorage.setItem("onboarding_completed", "true");
    setIsOnboarded(true);
    triggerToast("Đã kích hoạt khóa và mã hóa đầu cuối (E2EE)!");

    // Trigger initial background sync
    try {
      const { pullCloudDataToLocal } = await import("../../shared/services/appSyncService");
      pullCloudDataToLocal();
    } catch (err) {
      console.error(err);
    }
  };

  // Onboarding PIN/Passphrase Skip Handler
  const handleOnboardingPinSkip = async () => {
    localStorage.setItem("e2ee_enabled", "false");
    localStorage.setItem("pin_lock_enabled", "false");
    localStorage.setItem("onboarding_completed", "true");
    setIsOnboarded(true);
    triggerToast("Đã bỏ qua thiết lập mã hóa đầu cuối.");

    // Trigger initial background sync
    try {
      const { pullCloudDataToLocal } = await import("../../shared/services/appSyncService");
      pullCloudDataToLocal();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDecryptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDecrypting(true);
    setDecryptionError(false);

    try {
      const { decryptLocalDatabase, hasEncryptedDataInLocal } = await import("../../shared/services/appSyncService");
      const success = await decryptLocalDatabase(decryptPassphraseInput);
      
      if (success) {
        localStorage.setItem("e2ee_enabled", "true");
        localStorage.setItem("e2ee_passphrase", decryptPassphraseInput);
        
        triggerToast("Giải mã dữ liệu thành công!");
        setNeedDecryption(false);
        setShowDecryptionModal(false);
        setDecryptPassphraseInput("");
        
        window.dispatchEvent(new CustomEvent("notes-updated"));
        window.dispatchEvent(new CustomEvent("task-updated"));
        window.dispatchEvent(new CustomEvent("calendar-updated"));
        window.dispatchEvent(new CustomEvent("ai-chat-updated"));
      } else {
        const stillEncrypted = await hasEncryptedDataInLocal();
        if (stillEncrypted) {
          setDecryptionError(true);
        } else {
          localStorage.setItem("e2ee_enabled", "true");
          localStorage.setItem("e2ee_passphrase", decryptPassphraseInput);
          setNeedDecryption(false);
          setShowDecryptionModal(false);
          setDecryptPassphraseInput("");
          triggerToast("Cơ sở dữ liệu không cần giải mã hoặc đã thiết lập khóa.");
        }
      }
    } catch (err) {
      console.error(err);
      setDecryptionError(true);
    } finally {
      setIsDecrypting(false);
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

  // Onboarding Wizard UI
  if (!isOnboarded) {
    if (onboardingStep === 'welcome') {
      return (
        <div className={`h-screen w-screen flex items-center justify-center relative font-sans text-zinc-700 dark:text-zinc-300 transition-colors duration-200 ${theme === 'dark' ? 'lockscreen-aurora' : 'lockscreen-aurora-light'}`}>
          <div className="aurora-orb aurora-orb-1"></div>
          <div className="aurora-orb aurora-orb-2"></div>
          <div className="aurora-orb aurora-orb-3"></div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass-panel w-full max-w-md rounded-2xl p-6 sm:p-8 space-y-6 border border-zinc-200 dark:border-white/5 relative z-10 shadow-2xl flex flex-col"
          >
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-purple-600/15 text-purple-600 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white gradient-text-animated">AI Notebook</h1>
              <p className="text-sm text-zinc-550 dark:text-zinc-400 font-normal leading-relaxed">{t("app.onboardingDesc")}</p>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3.5 text-left">
                <div className="w-6 h-6 rounded-full bg-teal-500/10 text-teal-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">{t("app.onboardingOfflineTitle")}</h4>
                  <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-normal leading-relaxed">{t("app.onboardingOfflineDesc")}</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 text-left">
                <div className="w-6 h-6 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">{t("app.onboardingE2eTitle")}</h4>
                  <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-normal leading-relaxed">{t("app.onboardingE2eDesc")}</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 text-left">
                <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">{t("app.onboardingAiTitle")}</h4>
                  <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-normal leading-relaxed">{t("app.onboardingAiDesc")}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 font-semibold">
              <button 
                onClick={handleOnboardingLogin}
                disabled={isOnboardingLoginLoading}
                className="w-full bg-purple-650 hover:bg-purple-600 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 cursor-pointer border border-white/10"
              >
                {isOnboardingLoginLoading ? (
                  <span>{t("app.onboardingConnecting")}</span>
                ) : (
                  <>
                    <LogIn className="w-4.5 h-4.5" />
                    {t("sidebar.signinGoogle")}
                  </>
                )}
              </button>

              <button 
                onClick={handleOnboardingSkip}
                className="w-full bg-transparent hover:bg-white/5 border border-zinc-300 dark:border-white/10 text-zinc-700 dark:text-zinc-300 font-bold text-sm py-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {t("app.onboardingSkip")} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    if (onboardingStep === 'pin_setup') {
      return (
        <div className={`h-screen w-screen flex items-center justify-center relative font-sans text-zinc-700 dark:text-zinc-300 transition-colors duration-200 ${theme === 'dark' ? 'lockscreen-aurora' : 'lockscreen-aurora-light'}`}>
          <div className="aurora-orb aurora-orb-1"></div>
          <div className="aurora-orb aurora-orb-2"></div>
          <div className="aurora-orb aurora-orb-3"></div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="glass-panel w-full max-w-sm rounded-2xl p-6 sm:p-8 space-y-5 border border-zinc-200 dark:border-white/5 relative z-10 shadow-2xl flex flex-col"
          >
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-purple-600/10 text-purple-400 flex items-center justify-center mx-auto shadow-inner mb-2 animate-bounce">
                <Lock className="w-6 h-6 text-purple-500" />
              </div>
              <h2 className="text-base font-extrabold uppercase tracking-wider text-zinc-955 dark:text-white">Mã hóa đầu cuối & Khóa</h2>
              <p className="text-xs sm:text-sm text-zinc-550 dark:text-zinc-400 leading-relaxed font-normal">
                Mật khẩu mã hóa đầu cuối (E2EE) giúp khóa ứng dụng và mã hóa toàn bộ dữ liệu ghi chú của bạn để bảo vệ quyền riêng tư tuyệt đối.
              </p>
            </div>

            <form onSubmit={handleOnboardingPinSubmit} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="block text-xs text-zinc-650 dark:text-zinc-400 font-bold uppercase tracking-wider">Mật khẩu E2EE mới (Tối thiểu 6 ký tự)</label>
                <div className="relative">
                  <input 
                    type={showPinSetupPass ? "text" : "password"}
                    value={pinSetupInput}
                    onChange={(e) => setPinSetupInput(e.target.value)}
                    placeholder="Nhập mật khẩu E2EE của bạn..."
                    className="w-full p-2.5 rounded-lg glass-input text-center text-sm text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500/30 border border-white/5"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinSetupPass(!showPinSetupPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-500 text-xs"
                  >
                    {showPinSetupPass ? "Ẩn" : "Hiện"}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={handleOnboardingPinSkip}
                  className="flex-1 bg-transparent hover:bg-white/5 border border-zinc-300 dark:border-white/10 text-zinc-600 dark:text-zinc-400 font-semibold text-sm py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  Bỏ qua
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-md shadow-purple-500/10 cursor-pointer"
                >
                  Lưu & Kích hoạt
                </button>
              </div>
            </form>

            <div className="text-xs text-zinc-500 text-center leading-normal pt-1">
              * Nếu chọn Bỏ qua, ứng dụng sẽ không kích hoạt mã hóa dữ liệu cục bộ và không yêu cầu mật khẩu khi mở app.
            </div>
          </motion.div>
        </div>
      );
    }
  }

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
            <h2 className="text-base font-bold text-zinc-900 dark:text-white uppercase tracking-widest">AI NOTEBOOK LOCKED</h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">Vui lòng nhập mật khẩu mã hóa đầu cuối (E2EE) để mở khóa.</p>
          </div>

          <form onSubmit={handlePinSubmit} className="w-full space-y-4 flex flex-col items-center">
            <input 
              type="password"
              value={inputPin}
              onChange={(e) => {
                setPinError(false);
                setInputPin(e.target.value);
              }}
              placeholder="Nhập mật khẩu E2EE..."
              className={`w-3/4 p-2.5 rounded-lg glass-input text-center text-sm text-zinc-800 dark:text-white focus:outline-none focus:ring-1 ${
                pinError ? "border-red-500/50 bg-red-950/10 focus:ring-red-500" : "focus:ring-purple-500"
              }`}
              autoFocus
              required
            />
            
            <button 
              type="submit"
              className="w-3/4 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm py-2.5 rounded-lg transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-1.5"
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
    {/* E2EE Decryption Banner */}
    {needDecryption && (
      <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between text-xs font-semibold relative z-50 animate-pulse border-b border-red-500/30">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Dữ liệu đám mây của bạn được mã hóa đầu cuối. Vui lòng nhập mật khẩu giải mã để khôi phục dữ liệu ghi chú.</span>
        </div>
        <button
          onClick={() => setShowDecryptionModal(true)}
          className="bg-white text-red-650 px-3 py-1 rounded font-bold hover:bg-zinc-100 transition-all text-[10px]"
        >
          Giải mã ngay
        </button>
      </div>
    )}

    {/* E2EE Decryption Modal */}
    {showDecryptionModal && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-[#121214] border border-white/5 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-red-600/20 text-red-400 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">{t("app.e2eeDecryptDb")}</h4>
              <p className="text-[10px] text-zinc-400">{t("app.e2eeModalTitle")}</p>
            </div>
          </div>

          <form onSubmit={handleDecryptSubmit} className="space-y-3">
            <input
              type="password"
              value={decryptPassphraseInput}
              onChange={(e) => setDecryptPassphraseInput(e.target.value)}
              placeholder={t("app.e2eeModalPlaceholder")}
              className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-red-500/40 text-xs font-mono text-center"
              autoFocus
              required
            />
            {decryptionError && (
              <p className="text-[10px] text-red-400 text-center font-medium">{t("app.e2eeIncorrectPass")}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDecryptionModal(false)}
                className="flex-1 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-semibold text-xs transition-all"
              >
                {t("app.e2eeLater")}
              </button>
              <button
                type="submit"
                disabled={isDecrypting}
                className="flex-1 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-all shadow-md shadow-red-500/10 flex items-center justify-center gap-1.5"
              >
                {isDecrypting ? t("app.e2eeDecrypting") : t("app.e2eeDecrypt")}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    <div className="fixed inset-0 flex flex-col overflow-hidden bg-zinc-200 dark:bg-[#0b0b0d] text-zinc-800 dark:text-zinc-300 font-sans transition-colors duration-200">
      {/* Animated Aurora Floating Orbs - wrapped in absolute container to stay out of flex flow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="aurora-orb aurora-orb-1"></div>
        <div className="aurora-orb aurora-orb-2"></div>
        <div className="aurora-orb aurora-orb-3"></div>
        <div className="aurora-orb aurora-orb-4"></div>
        <div className="mesh-gradient-overlay"></div>
      </div>

      {/* CONTAINER CHO GIAO DIỆN CHÍNH & AI CHAT PANEL */}
      <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col overflow-hidden relative">
        
        {/* 2. MAIN VIEW CONTENT */}
        <main className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden p-3 sm:p-6">
            {/* Top Bar for Mobile */}
            <div className="md:hidden flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-zinc-950 dark:bg-black border border-white/10 flex items-center justify-center shadow-md shadow-purple-500/10 relative overflow-hidden group shrink-0 p-0.5">
                  <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/30 to-blue-500/30 opacity-60"></div>
                  <img src="/logo-mobile.png" className="w-full h-full object-contain rounded z-10 relative" alt="Logo" />
                </div>
                <span className="text-xs font-bold text-zinc-900 dark:text-white tracking-wide flex items-center gap-0.5">
                  AI <span className="font-extrabold bg-gradient-to-r from-purple-600 to-blue-400 bg-clip-text text-transparent">NOTEBOOK</span>
                </span>
              </div>
              <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.65)]" aria-label="Local database ready" />
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
          <motion.button
            drag
            dragMomentum={true}
            dragElastic={0.1}
            dragTransition={{ bounceStiffness: 400, bounceDamping: 25 }}
            whileDrag={{ cursor: "grabbing" }}
            dragConstraints={{ top: -window.innerHeight + 150, bottom: 0, left: -window.innerWidth + 60, right: 0 }}
            onClick={() => setShowAiSidebar(true)}
            className="sm:hidden fixed right-4 bottom-24 w-14 h-14 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.38),transparent_36%),linear-gradient(135deg,#1e1b4b,#6d28d9_58%,#111827)] text-white flex items-center justify-center shadow-2xl shadow-cyan-500/20 border border-cyan-200/25 z-40 cursor-pointer ai-glow-pulse"
            title="Mở trợ lý AI"
            style={{ touchAction: "none" }}
          >
            <Bot className="w-6 h-6 text-cyan-100 icon-glow pointer-events-none" />
          </motion.button>
        )}

        {/* Desktop View: Vertical side handle */}
        <button 
          onClick={() => setShowAiSidebar(true)}
          className="hidden sm:flex fixed right-0 top-1/2 -translate-y-1/2 bg-purple-600/80 hover:bg-purple-600 backdrop-blur text-white p-2.5 py-3.5 rounded-l-lg shadow-2xl border border-r-0 border-white/10 flex flex-col items-center gap-1.5 transition-all z-40 cursor-pointer ai-glow-pulse"
          title="Mở trợ lý AI"
        >
          <Bot className="w-5 h-5 text-cyan-100 icon-glow" />
          <span className="text-[8px] font-bold uppercase tracking-wider [writing-mode:vertical-lr] select-none">AI Chat</span>
        </button>
      </>
    )}

    {/* Global Google Login Modal */}
    {showLoginModal && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl w-full max-w-sm p-6 sm:p-8 space-y-6 shadow-2xl relative animate-fade-in-up">
          
          <button
            onClick={() => setShowLoginModal(false)}
            className="absolute top-4 right-4 text-zinc-550 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
          >
            ✕
          </button>

          <div className="flex flex-col items-center text-center space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
            </div>
            <h3 className="font-bold text-sm text-zinc-955 dark:text-white tracking-tight flex items-center gap-1.5">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.22-.67-.35-1.37-.35-2.09z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              {t("sidebar.signinGoogle")}
            </h3>
            <p className="text-[10px] text-zinc-550 dark:text-zinc-500">{t("dashboard.syncDescription")}</p>
          </div>

          {loginStep === 'loading' ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
              <span className="text-[10px] font-semibold text-zinc-555">Đang thiết lập kết nối an toàn...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-zinc-555 dark:text-zinc-400 uppercase tracking-wider block text-center">Đăng nhập tài khoản Google thật</span>
                <button
                  onClick={handleStartGoogleOAuthGlobal}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 font-semibold text-xs py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4 mr-1 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.22-.67-.35-1.37-.35-2.09z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Đăng nhập qua Google
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    )}
    </>
  );
}
