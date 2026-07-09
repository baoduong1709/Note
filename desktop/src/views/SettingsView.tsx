import { useState, useEffect, useRef } from "react";
import { Brain, Download, Globe, Lock, RefreshCw, Sparkles, Sun, Moon, LogOut, User } from "lucide-react";
import { getDatabase } from "../../../shared/database/db";
import { createNote, getNotes, Note, updateNote } from "../../../shared/database/queries/notes";
import { getStoredUser, clearStoredUser } from "../../../shared/services/shareService";
import { api } from "../../../shared/services/apiClient";
import { useLanguage } from "../../../shared/contexts/LanguageContext";

interface SettingsViewProps {
  triggerToast: (message: string) => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}

interface LegacyAIMemory {
  id: string;
  content: string;
  created_at: string;
}

export default function SettingsView({ 
  triggerToast,
  theme,
  setTheme
}: SettingsViewProps) {
  const { language, setLanguage } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);

  // AI Form States
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiModelName, setAiModelName] = useState("");

  // Search Form States
  const [searchProvider, setSearchProvider] = useState("ddg");
  const [searchApiKey, setSearchApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [googleCx, setGoogleCx] = useState("");

  // PIN lock settings
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinCode, setPinCode] = useState("");
  const [showPinInput, setShowPinInput] = useState(false);

  // Telegram settings
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [systemBotUsername, setSystemBotUsername] = useState("");

  // User state
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null);  // Agent memory viewer
  const [userMemoryContent, setUserMemoryContent] = useState("");
  const [techMemoryContent, setTechMemoryContent] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(false);

  const cleanMemoryLine = (content: string) =>
    content.replace(/^(USER|TECH)\s*:\s*/i, "").trim();

  const isUserMemory = (content: string) => {
    const lower = content.toLowerCase();
    return content.trim().toUpperCase().startsWith("USER:") || lower.includes("người dùng");
  };

  const isTechMemory = (content: string) => content.trim().toUpperCase().startsWith("TECH:");

  const uniqueLines = (lines: string[]) => Array.from(new Set(lines.filter(Boolean)));

  const buildUserNoteContent = (memories: LegacyAIMemory[] = []) => {
    const lines = uniqueLines(
      memories
        .filter(memory => isUserMemory(memory.content))
        .map(memory => `- ${cleanMemoryLine(memory.content)}`)
    );

    return [
      "# USER.md",
      "*Bộ nhớ thông tin cá nhân của người dùng.*",
      "",
      ...(lines.length > 0 ? lines : ["- Tên của người dùng là Bảo."]),
      ""
    ].join("\n");
  };

  const buildTechNoteContent = (memories: LegacyAIMemory[] = []) => {
    const lines = uniqueLines(
      memories
        .filter(memory => isTechMemory(memory.content))
        .map(memory => `- ${cleanMemoryLine(memory.content)}`)
    );

    return [
      "# MEMORY.md",
      "*Bộ nhớ kỹ thuật, cấu hình và quy ước dự án.*",
      "",
      ...(lines.length > 0 ? lines : ["- Dự án hiện tại là Personal Work Notebook viết bằng Tauri v2 và React."]),
      ""
    ].join("\n");
  };

  const ensureAgentMemoryNotes = async (notes: Note[], memories: LegacyAIMemory[] = []) => {
    const userNote = notes.find(note => note.title === "USER.md");
    const memoryNote = notes.find(note => note.title === "MEMORY.md");

    if (!userNote) {
      await createNote({
        id: "hermes-user-md",
        workspace_id: "personal",
        project_id: null,
        title: "USER.md",
        content: buildUserNoteContent(memories),
        type: "quick",
        is_locked: 0,
        is_pending_sync: 1
      });
    }

    if (!memoryNote) {
      await createNote({
        id: "hermes-memory-md",
        workspace_id: "personal",
        project_id: null,
        title: "MEMORY.md",
        content: buildTechNoteContent(memories),
        type: "quick",
        is_locked: 0,
        is_pending_sync: 1
      });
    }
  };

  const appendUniqueMemoryLines = async (notes: Note[], legacyMemories: LegacyAIMemory[]) => {
    const userNote = notes.find(note => note.title === "USER.md");
    const memoryNote = notes.find(note => note.title === "MEMORY.md");
    const userLines = uniqueLines(
      legacyMemories
        .filter(memory => isUserMemory(memory.content))
        .map(memory => `- ${cleanMemoryLine(memory.content)}`)
    );
    const techLines = uniqueLines(
      legacyMemories
        .filter(memory => isTechMemory(memory.content))
        .map(memory => `- ${cleanMemoryLine(memory.content)}`)
    );

    if (userNote && userLines.length > 0) {
      const missingLines = userLines.filter(line => !userNote.content.includes(line));
      if (missingLines.length > 0) {
        await updateNote(
          userNote.id,
          userNote.title,
          `${userNote.content.trim()}\n\n${missingLines.join("\n")}\n`,
          userNote.type,
          1
        );
      }
    }

    if (memoryNote && techLines.length > 0) {
      const missingLines = techLines.filter(line => !memoryNote.content.includes(line));
      if (missingLines.length > 0) {
        await updateNote(
          memoryNote.id,
          memoryNote.title,
          `${memoryNote.content.trim()}\n\n${missingLines.join("\n")}\n`,
          memoryNote.type,
          1
        );
      }
    }
  };

  const migrateLegacyAIMemories = async (notes: Note[]) => {
    const db = await getDatabase();
    const legacyMemories = await db.select<LegacyAIMemory[]>("SELECT * FROM ai_memories ORDER BY created_at ASC");
    if (legacyMemories.length === 0) {
      await ensureAgentMemoryNotes(notes);
      return;
    }

    await ensureAgentMemoryNotes(notes, legacyMemories);
    const refreshedNotes = await getNotes();
    await appendUniqueMemoryLines(refreshedNotes, legacyMemories);

    await Promise.all(
      legacyMemories.map(memory => db.execute("DELETE FROM ai_memories WHERE id = ?", [memory.id]))
    );
  };

  const loadAgentMemoryData = async (showToast = false) => {
    setMemoryLoading(true);
    try {
      let notes = await getNotes();
      await migrateLegacyAIMemories(notes);
      notes = await getNotes();

      const userNote = notes.find(note => note.title === "USER.md");
      const memoryNote = notes.find(note => note.title === "MEMORY.md");

      setUserMemoryContent(userNote?.content || "Chưa có note USER.md.");
      setTechMemoryContent(memoryNote?.content || "Chưa có note MEMORY.md.");
      if (showToast) {
        triggerToast("Đã tải lại bộ nhớ agent.");
      }

      // Reset scroll position after DOM updates
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = 0;
        }
      }, 60);
    } catch (err) {
      console.error("Failed to load agent memory:", err);
      triggerToast("Lỗi tải bộ nhớ agent.");
    } finally {
      setMemoryLoading(false);
    }
  };

  useEffect(() => {
    // Force scroll to top on mount to avoid browser auto-scrolling
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }

    const loadConfigs = () => {
      // Load AI
      const aiConfig = localStorage.getItem("ai_config");
      let aiUpdated = false;
      if (aiConfig) {
        try {
          const parsed = JSON.parse(aiConfig);
          setAiApiKey(prev => { if (prev !== (parsed.apiKey || "")) aiUpdated = true; return parsed.apiKey || ""; });
          setAiBaseUrl(prev => { if (prev !== (parsed.baseUrl || "")) aiUpdated = true; return parsed.baseUrl || ""; });
          setAiModelName(prev => { if (prev !== (parsed.modelName || "")) aiUpdated = true; return parsed.modelName || ""; });
        } catch (err) {
          console.error(err);
        }
      } else {
        setAiBaseUrl("https://api.openai.com/v1");
        setAiModelName("gpt-4o-mini");
      }

      // Load Search
      const searchConfig = localStorage.getItem("search_config");
      if (searchConfig) {
        try {
          const parsed = JSON.parse(searchConfig);
          setSearchProvider(parsed.provider || "ddg");
          setSearchApiKey(parsed.apiKey || "");
          setGoogleApiKey(parsed.googleApiKey || "");
          setGoogleCx(parsed.googleCx || "");

        } catch (err) {
          console.error(err);
        }
      }

      // Load Telegram Config
      const tgConfig = localStorage.getItem("telegram_config");
      if (tgConfig) {
        try {
          const parsed = JSON.parse(tgConfig);
          setTelegramEnabled(parsed.enabled || false);
          setTelegramChatId(parsed.chatId || "");
        } catch (err) {
          console.error(err);
        }
      }
    };

    loadConfigs();
    window.addEventListener("settings-sync-completed", loadConfigs);
    window.addEventListener("focus", loadConfigs);
    window.addEventListener("storage", loadConfigs);
    
    // Poll a few times in case of race condition with background sync
    const poll1 = setTimeout(loadConfigs, 500);
    const poll2 = setTimeout(loadConfigs, 1500);
    const poll3 = setTimeout(loadConfigs, 3000);

    // Load PIN/E2EE lock
    const enabled = localStorage.getItem("pin_lock_enabled") === "true";
    const code = localStorage.getItem("e2ee_passphrase") || localStorage.getItem("pin_lock_code") || "";
    setPinEnabled(enabled);
    setPinCode(code);

    const user = getStoredUser();
    setCurrentUser(user);

    const fetchBotInfo = async () => {
      try {
        const res = await api.get("/api/auth/telegram/bot-info");
        if (res.success && res.data) {
          setSystemBotUsername(res.data.username);
        }
      } catch (err) {
        console.warn("Failed to load Telegram system bot info:", err);
      }
    };
    if (user) {
      fetchBotInfo();
    }

    const handleAuthChange = () => {
      const updatedUser = getStoredUser();
      setCurrentUser(updatedUser);
      if (updatedUser) {
        fetchBotInfo();
      } else {
        setSystemBotUsername("");
      }
    };
    window.addEventListener("auth-state-changed", handleAuthChange);

    loadAgentMemoryData();

    return () => {
      window.removeEventListener("auth-state-changed", handleAuthChange);
      window.removeEventListener("settings-sync-completed", loadConfigs);
    };
  }, []);

  // Save Configs
  const handleSaveConfigs = async () => {
    // 1. Save AI
    const aiData = {
      apiKey: aiApiKey.trim(),
      baseUrl: aiBaseUrl.trim(),
      modelName: aiModelName.trim()
    };
    localStorage.setItem("ai_config", JSON.stringify(aiData));

    // 2. Save Search
    const searchData = {
      provider: searchProvider,
      apiKey: searchApiKey.trim(),
      googleApiKey: googleApiKey.trim(),
      googleCx: googleCx.trim()
    };
    localStorage.setItem("search_config", JSON.stringify(searchData));

    // 3. Save Telegram Config
    const telegramData = {
      enabled: telegramEnabled,
      chatId: telegramChatId.trim()
    };
    localStorage.setItem("telegram_config", JSON.stringify(telegramData));

    // If logged in, sync to server
    if (currentUser) {
      try {
        const { saveUserSettingsToServer } = await import("../../../shared/services/authService");
        await saveUserSettingsToServer(aiData, searchData, telegramData);
      } catch (err) {
        console.error("Failed to sync settings to server:", err);
      }
    }

    triggerToast("Đã lưu cấu hình trợ lý AI, Tìm kiếm & Telegram thành công!");
  };

  const handleTestTelegram = async () => {
    if (!telegramChatId) {
      triggerToast("Vui lòng điền Chat ID trước khi test!");
      return;
    }
    // Save locally and sync to server first so the test send can retrieve the Chat ID
    const telegramData = {
      enabled: telegramEnabled,
      chatId: telegramChatId.trim()
    };
    localStorage.setItem("telegram_config", JSON.stringify(telegramData));

    if (currentUser) {
      try {
        await api.post("/api/auth/telegram", { telegramChatId: telegramChatId.trim() });
      } catch (err) {
        console.error("Failed to sync Telegram Chat ID to server:", err);
      }
    }

    try {
      const res = await api.post("/api/auth/telegram/send", {
        title: "Tin nhắn thử nghiệm",
        body: "Tích hợp Telegram của bạn đã hoạt động thành công!"
      });
      if (res.success) {
        triggerToast("Đã gửi tin nhắn thử nghiệm thành công! Hãy kiểm tra Telegram.");
      } else {
        triggerToast("Gửi tin nhắn thất bại! Vui lòng kiểm tra lại cấu hình.");
      }
    } catch (err: any) {
      console.error(err);
      triggerToast(`Lỗi kết nối: ${err.message || err}`);
    }
  };

  const handleLogout = () => {
    clearStoredUser();
    setCurrentUser(null);
    window.dispatchEvent(new CustomEvent("auth-state-changed"));
    triggerToast(language === "vi" ? "Đã đăng xuất thành công!" : "Logged out successfully!");
  };  const handleTogglePin = async () => {
    if (pinEnabled) {
      localStorage.setItem("pin_lock_enabled", "false");
      localStorage.setItem("e2ee_enabled", "false");
      localStorage.removeItem("e2ee_passphrase");
      localStorage.removeItem("pin_lock_code");
      setPinEnabled(false);
      setPinCode("");
      triggerToast("Đã tắt khóa và mã hóa đầu cuối (E2EE).");
      
      // Save e2ee flag to server
      try {
        const { saveUserSettingsToServer } = await import("../../../shared/services/authService");
        const aiData = localStorage.getItem('ai_config');
        const searchData = localStorage.getItem('search_config');
        const tgData = localStorage.getItem('telegram_config');
        await saveUserSettingsToServer(
          aiData ? JSON.parse(aiData) : null,
          searchData ? JSON.parse(searchData) : null,
          tgData ? JSON.parse(tgData) : null,
          false // e2eeEnabled
        );
      } catch (err) {
        console.error("Failed to push e2ee_enabled to server:", err);
      }
    } else {
      setShowPinInput(true);
    }
  };

  const handleSavePin = async () => {
    if (pinCode.length < 6) {
      triggerToast("Mật khẩu mã hóa đầu cuối phải có ít nhất 6 ký tự!");
      return;
    }
    localStorage.setItem("pin_lock_enabled", "true");
    localStorage.setItem("e2ee_enabled", "true");
    localStorage.setItem("e2ee_passphrase", pinCode);
    localStorage.setItem("pin_lock_code", pinCode); // for backward compatibility/lock mechanism
    setPinEnabled(true);
    setShowPinInput(false);
    triggerToast("Đã kích hoạt khóa và mã hóa đầu cuối (E2EE) thành công!");
    
    // Save e2ee flag to server
    try {
      const { saveUserSettingsToServer } = await import("../../../shared/services/authService");
      const aiData = localStorage.getItem('ai_config');
      const searchData = localStorage.getItem('search_config');
      const tgData = localStorage.getItem('telegram_config');
      await saveUserSettingsToServer(
        aiData ? JSON.parse(aiData) : null,
        searchData ? JSON.parse(searchData) : null,
        tgData ? JSON.parse(tgData) : null,
        true // e2eeEnabled
      );
    } catch (err) {
      console.error("Failed to push e2ee_enabled to server:", err);
    }
  };

  const handleExportJSON = async () => {
    try {
      const db = await getDatabase();
      const notes = await db.select("SELECT * FROM notes");
      const tasks = await db.select("SELECT * FROM tasks");
      const workspaces = await db.select("SELECT * FROM workspaces");
      const logs = await db.select("SELECT * FROM activity_logs");
      
      const backupData = {
        version: "2.0",
        exportedAt: new Date().toISOString(),
        workspaces,
        notes,
        tasks,
        logs
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `notebook_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      triggerToast("Đã tải tệp sao lưu JSON thành công!");
    } catch (err) {
      console.error(err);
      triggerToast("Lỗi xuất dữ liệu SQLite!");
    }
  };

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-y-auto space-y-6 pr-1 pb-10 view-enter-animate">
      <div>
        <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">{language === "vi" ? "Cài đặt & Tích hợp" : "Settings & Integrations"}</h3>
        <p className="text-[10px] text-zinc-600 dark:text-zinc-500">{language === "vi" ? "Cấu hình trợ lý AI, tìm kiếm, bảo mật và sao lưu dữ liệu." : "Configure AI assistant, search, security, and data backup."}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 max-w-6xl">

        {/* 1. Integration Card (AI API Keys) */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">{language === "vi" ? "Cài đặt khóa Trợ lý AI" : "AI Assistant Keys"}</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">{language === "vi" ? "Cấu hình kết nối để kích hoạt Trợ lý AI thông minh." : "Configure connection parameters to enable the smart AI Assistant."}</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-zinc-750 dark:text-zinc-300">
            <div>
              <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">API Base URL / Endpoint</label>
              <input 
                type="text" 
                value={aiBaseUrl} 
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder={language === "vi" ? "Ví dụ: https://api.openai.com/v1 hoặc http://localhost:11434/v1" : "e.g., https://api.openai.com/v1 or http://localhost:11434/v1"} 
                className="w-full p-2.5 rounded glass-input text-zinc-800 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs" 
              />
              <span className="text-[9px] text-zinc-655 dark:text-zinc-500 mt-1 block">{language === "vi" ? "Hỗ trợ OpenAI, DeepSeek, Gemini (OpenAI endpoint), Ollama." : "Supports OpenAI, DeepSeek, Gemini (OpenAI endpoint), Ollama."}</span>
            </div>

            <div>
              <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">Model Name</label>
              <input 
                type="text" 
                value={aiModelName} 
                onChange={(e) => setAiModelName(e.target.value)}
                placeholder={language === "vi" ? "Ví dụ: gpt-4o-mini, gpt-4o, gemini-1.5-flash, deepseek-chat..." : "e.g., gpt-4o-mini, gpt-4o, gemini-1.5-flash, deepseek-chat..."} 
                className="w-full p-2.5 rounded glass-input text-zinc-800 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
              />
            </div>

            <div>
              <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">API Key</label>
              <input 
                type="password" 
                value={aiApiKey} 
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={aiBaseUrl.includes("localhost") ? (language === "vi" ? "Không cần Key đối với Local Ollama..." : "No Key needed for Local Ollama...") : "AI API Key..."} 
                autoComplete="new-password"
                className="w-full p-2.5 rounded glass-input text-zinc-800 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={handleSaveConfigs}
                className="px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-md shadow-purple-500/10 cursor-pointer"
              >
                {language === "vi" ? "Lưu cấu hình AI" : "Save AI Config"}
              </button>
            </div>
          </div>
        </div>

        {/* 2.5 Web Search Engine Configuration Card */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center text-white shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">{language === "vi" ? "Cấu hình tìm kiếm Web" : "Web Search Skills"}</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">{language === "vi" ? "Cấu hình dịch vụ tìm kiếm để trợ lý AI tra cứu thông tin trực tuyến." : "Configure search services for AI Assistant web search."}</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-zinc-750 dark:text-zinc-350">
            <div>
              <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">{language === "vi" ? "Dịch vụ Tìm kiếm" : "Search Service"}</label>
              <select 
                value={searchProvider} 
                onChange={(e) => setSearchProvider(e.target.value)}
                className="w-full p-2.5 rounded glass-input text-zinc-705 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 cursor-pointer" 
              >
                <option value="ddg">{language === "vi" ? "DuckDuckGo Lite (Miễn phí - Không cần Key)" : "DuckDuckGo Lite (Free - No Key Needed)"}</option>
                <option value="tavily">{language === "vi" ? "Tavily AI Search (Tốt nhất cho AI - Cần API Key)" : "Tavily AI Search (Best for AI - API Key Required)"}</option>
                <option value="google">{language === "vi" ? "Google Custom Search (Cần API Key & CX ID)" : "Google Custom Search (API Key & CX ID Required)"}</option>
              </select>
            </div>

            {searchProvider === "tavily" && (
              <div>
                <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">Tavily API Key</label>
                <input 
                  type="password" 
                  value={searchApiKey} 
                  onChange={(e) => setSearchApiKey(e.target.value)}
                  placeholder={language === "vi" ? "Nhập Tavily API Key của bạn..." : "Enter your Tavily API Key..."} 
                  className="w-full p-2.5 rounded glass-input text-zinc-850 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
                />
                <span className="text-[9px] text-zinc-650 dark:text-zinc-500 mt-1 block">{language === "vi" ? "Đăng ký lấy API Key miễn phí (1000 lượt tìm kiếm/tháng) tại app.tavily.com" : "Register for a free API Key (1000 searches/month) at app.tavily.com"}</span>
              </div>
            )}

            {searchProvider === "google" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">Google Custom Search API Key</label>
                  <input 
                    type="password" 
                    value={googleApiKey} 
                    onChange={(e) => setGoogleApiKey(e.target.value)}
                    placeholder={language === "vi" ? "Nhập Google API Key..." : "Enter Google API Key..."} 
                    className="w-full p-2.5 rounded glass-input text-zinc-850 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
                  />
                </div>
                <div>
                  <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">Search Engine ID (CX)</label>
                  <input 
                    type="text" 
                    value={googleCx} 
                    onChange={(e) => setGoogleCx(e.target.value)}
                    placeholder={language === "vi" ? "Ví dụ: a1b2c3d4e5f6g7h8i" : "e.g., a1b2c3d4e5f6g7h8i"} 
                    className="w-full p-2.5 rounded glass-input text-zinc-855 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
                  />
                </div>
                <span className="text-[9px] text-zinc-650 dark:text-zinc-500 mt-1 block">{language === "vi" ? "Tạo Google Programmable Search Engine miễn phí (100 searches/ngày) tại cse.google.com" : "Create a free Google Programmable Search Engine (100 searches/day) at cse.google.com"}</span>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={handleSaveConfigs}
                className="px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-md shadow-purple-500/10 cursor-pointer"
              >
                {language === "vi" ? "Lưu cấu hình Tìm kiếm" : "Save Search Config"}
              </button>
            </div>
          </div>
        </div>

        {/* 2.5.5 Telegram Integration Card */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15.82-1.05 6.09-1.5 8.56-.19 1.04-.57 1.39-.94 1.42-.82.08-1.44-.54-2.24-1.06-1.25-.82-1.95-1.33-3.16-2.13-1.4-1.03-.49-1.58.31-2.4 2.08-2.14 3.82-3.79 5.86-5.83.23-.23.46-.08.19.14-.36.31-4.7 3.32-5.4 3.8-.68.46-1.3.7-1.8.69-.55 0-1.61-.31-2.4-.58-.97-.33-1.74-.5-1.68-1.07.03-.3.41-.6 1.15-.9 4.54-1.97 7.57-3.28 9.08-3.92 4.34-1.8 5.24-2.1 5.83-2.11.13 0 .42.03.6.18.15.12.2.29.22.42-.02.09-.01.44-.02.66z"/>
              </svg>
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">{language === "vi" ? "Tích hợp Telegram" : "Telegram Integration"}</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">{language === "vi" ? "Cấu hình gửi nhắc nhở công việc và liên kết bot để lưu ghi chú nhanh." : "Configure reminders and bot link to save quick notes."}</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-zinc-750 dark:text-zinc-300">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="telegramEnabled"
                checked={telegramEnabled}
                onChange={(e) => setTelegramEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 dark:border-white/5 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
              <label htmlFor="telegramEnabled" className="font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer">
                {language === "vi" ? "Kích hoạt nhắc nhở Telegram" : "Enable Telegram Reminders"}
              </label>
            </div>

            {telegramEnabled && (
              <div className="space-y-3 pt-1 border-t border-zinc-100 dark:border-white/5">
                <div>
                  <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">Telegram Chat ID</label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder={language === "vi" ? "Nhập Chat ID của bạn..." : "Enter your Chat ID..."}
                    className="w-full p-2.5 rounded glass-input text-zinc-800 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    className="px-3 py-1.5 rounded bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold cursor-pointer"
                  >
                    {language === "vi" ? "Gửi tin nhắn thử" : "Send Test Message"}
                  </button>
                </div>
              </div>
            )}

            {systemBotUsername && (
              <div className="p-3 bg-sky-500/10 rounded border border-sky-500/20 text-xs space-y-1">
                <span className="font-semibold text-sky-600 dark:text-sky-400">🤖 Telegram Bot Hệ Thống</span>
                <p className="text-[10px] text-zinc-600 dark:text-sky-400 leading-relaxed">
                  {language === "vi" 
                    ? `Bạn có thể liên kết tài khoản và ghi chú nhanh bằng cách nhắn tin cho Bot:`
                    : `You can link your account and quick note by messaging our Bot:`}
                </p>
                <a
                  href={`https://t.me/${systemBotUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300 font-bold underline"
                >
                  @{systemBotUsername}
                </a>
              </div>
            )}
            
            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={handleSaveConfigs}
                className="px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-md shadow-purple-500/10 cursor-pointer"
              >
                {language === "vi" ? "Lưu cấu hình Telegram" : "Save Telegram Config"}
              </button>
            </div>
          </div>
        </div>

        {/* 2.6 Agent Memory Viewer */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4 xl:col-span-2">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">{language === "vi" ? "Bộ nhớ Trợ lý" : "Agent Memory"}</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">{language === "vi" ? "Nguồn lưu duy nhất: USER.md cho thông tin cá nhân và MEMORY.md cho kỹ thuật/dự án." : "Single source of truth: USER.md for personal data and MEMORY.md for tech info."}</p>
            </div>
            <button
              type="button"
              onClick={() => loadAgentMemoryData(true)}
              disabled={memoryLoading}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold transition-all disabled:opacity-50 text-[10px] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${memoryLoading ? "animate-spin" : ""}`} />
              {language === "vi" ? "Tải lại" : "Reload"}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">USER.md</h5>
                <span className="text-[9px] text-zinc-600 dark:text-zinc-500">{language === "vi" ? "Thông tin cá nhân" : "Personal Profile"}</span>
              </div>
              <pre className="max-h-64 min-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-300 dark:border-white/5 bg-zinc-100/80 dark:bg-zinc-950/55 p-3 text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-300">
                {userMemoryContent}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">MEMORY.md</h5>
                <span className="text-[9px] text-zinc-600 dark:text-zinc-500">{language === "vi" ? "Kỹ thuật & dự án" : "Tech & Project"}</span>
              </div>
              <pre className="max-h-64 min-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-300 dark:border-white/5 bg-zinc-100/80 dark:bg-zinc-950/55 p-3 text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-300">
                {techMemoryContent}
              </pre>
            </div>
          </div>
        </div>

        {/* 3. Security Lock Option */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">{language === "vi" ? "Mã hóa đầu cuối & Khóa" : "E2EE Encryption & Lock"}</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">{language === "vi" ? "Khóa ứng dụng khi khởi chạy và mã hóa dữ liệu cục bộ bằng mật khẩu E2EE." : "Lock the application and encrypt local database using an E2EE passphrase."}</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <div>
              <span className="text-zinc-700 dark:text-zinc-400 font-medium block">{language === "vi" ? "Khóa & Mã hóa đầu cuối (E2EE)" : "E2EE Encryption & Lock"}</span>
              <span className="text-[10px] text-zinc-605 dark:text-zinc-500">{language === "vi" ? "Yêu cầu nhập mật khẩu bảo mật và kích hoạt mã hóa dữ liệu cục bộ." : "Requires security passphrase and activates local database encryption."}</span>
            </div>
            <button 
              type="button"
              onClick={handleTogglePin}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                pinEnabled ? "bg-red-600/20 text-red-400 border border-red-500/10" : "bg-purple-600 text-white shadow-md shadow-purple-500/10 cursor-pointer"
              }`}
            >
              {pinEnabled ? (language === "vi" ? "Tắt Khóa E2EE" : "Disable E2EE Lock") : (language === "vi" ? "Kích hoạt" : "Enable")}
            </button>
          </div>

          {showPinInput && (
            <div className="p-3 bg-zinc-200/50 dark:bg-zinc-950/60 rounded border border-zinc-200 dark:border-white/5 space-y-3 max-w-sm">
              <label className="block text-xs text-zinc-650 dark:text-zinc-400">{language === "vi" ? "Thiết lập mật khẩu E2EE mới (Tối thiểu 6 ký tự)" : "Set new E2EE passphrase (Minimum 6 characters)"}</label>
              <div className="flex gap-2">
                <input 
                  type="password" 
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  placeholder={language === "vi" ? "Nhập mật khẩu E2EE..." : "Enter E2EE passphrase..."}
                  className="flex-1 p-2 rounded glass-input text-zinc-800 dark:text-zinc-300 text-xs text-center"
                />
                <button 
                  type="button"
                  onClick={handleSavePin}
                  className="bg-purple-600 text-white px-4 py-2 rounded text-xs font-semibold shadow-md shadow-purple-500/10 cursor-pointer"
                >
                  {language === "vi" ? "Lưu mật khẩu" : "Save Passphrase"}
                </button>
              </div>
            </div>
          )}
        </div>



        {/* 3.5 Theme & Language Settings Card */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0">
              <Sun className="w-4 h-4 dark:hidden" />
              <Moon className="w-4 h-4 hidden dark:block" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">{language === "vi" ? "Giao diện & Ngôn ngữ" : "Theme & Language"}</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-500">{language === "vi" ? "Lựa chọn chế độ hiển thị và ngôn ngữ của ứng dụng." : "Choose the interface theme and display language."}</p>
            </div>
          </div>

          <div className="flex gap-4 pt-1">
            <button 
              type="button"
              onClick={() => setTheme("light")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                theme === "light" 
                  ? "bg-purple-600 text-white border-transparent shadow-md shadow-purple-500/20 rainbow-border-active"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300"
              }`}
            >
              <Sun className="w-4 h-4" /> {language === "vi" ? "Giao diện Sáng" : "Light Theme"}
            </button>
            <button 
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                theme === "dark" 
                  ? "bg-purple-600 text-white border-transparent shadow-md shadow-purple-500/20 rainbow-border-active"
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-white/5"
              }`}
            >
              <Moon className="w-4 h-4" /> {language === "vi" ? "Giao diện Tối" : "Dark Theme"}
            </button>
          </div>

          <div className="pt-2 border-t border-zinc-200 dark:border-white/5 flex items-center justify-between">
            <span className="text-xs text-zinc-700 dark:text-zinc-400 font-medium">{language === "vi" ? "Ngôn ngữ hệ thống" : "System Language"}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLanguage("vi")}
                className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                  language === "vi"
                    ? "bg-purple-600 text-white border-transparent shadow-sm rainbow-border-active"
                    : "border-zinc-200 dark:border-white/5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
                }`}
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all cursor-pointer ${
                  language === "en"
                    ? "bg-purple-600 text-white border-transparent shadow-sm rainbow-border-active"
                    : "border-zinc-200 dark:border-white/5 text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5"
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>

        {/* 4. Data Backup Card */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-3 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-1.5">{language === "vi" ? "Sao lưu & Xuất dữ liệu" : "Backup & Export"}</h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{language === "vi" ? "Tải xuống toàn bộ cơ sở dữ liệu SQLite cục bộ dưới dạng tệp tin sao lưu JSON." : "Download the entire local SQLite database as a JSON backup file."}</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button 
              type="button"
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-zinc-205 hover:bg-zinc-300 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 dark:hover:text-white dark:hover:bg-zinc-700 transition-all text-xs font-semibold shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4" /> {language === "vi" ? "Tải về Backup JSON" : "Download Backup JSON"}
            </button>
          </div>
        </div>

        {/* 5. Account Settings Card */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-3 flex flex-col justify-between">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">{language === "vi" ? "Tài khoản" : "Account"}</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-500">{language === "vi" ? "Quản lý phiên đăng nhập tài khoản của bạn." : "Manage your account login session."}</p>
            </div>
          </div>
          
          <div className="pt-2">
            {currentUser ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{currentUser.name}</p>
                  <p className="text-[10px] text-zinc-500">{currentUser.email}</p>
                </div>
                <button 
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-4 py-2 rounded bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-all text-xs font-semibold shadow-sm cursor-pointer border border-red-500/20"
                >
                  <LogOut className="w-4 h-4" /> {language === "vi" ? "Đăng xuất" : "Logout"}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">{language === "vi" ? "Chưa đăng nhập." : "Not logged in."}</p>
                <button 
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("trigger-google-login"))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white transition-all text-xs font-semibold shadow-sm cursor-pointer"
                >
                  <User className="w-4 h-4" /> {language === "vi" ? "Đăng nhập" : "Login"}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
