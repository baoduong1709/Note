import { useState, useEffect, useRef } from "react";
import { Brain, Download, Globe, Lock, RefreshCw, Sparkles, Sun, Moon } from "lucide-react";
import { getDatabase } from "../database/db";
import { createNote, getNotes, Note, updateNote } from "../database/queries/notes";

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

  // Google Auth Client ID State
  const [googleClientId, setGoogleClientId] = useState("");

  // Agent memory viewer
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
        is_pending_sync: 0
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
        is_pending_sync: 0
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
          0
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
          0
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

    // Load AI
    const aiConfig = localStorage.getItem("ai_config");
    if (aiConfig) {
      try {
        const parsed = JSON.parse(aiConfig);
        setAiApiKey(parsed.apiKey || "");
        setAiBaseUrl(parsed.baseUrl || "");
        setAiModelName(parsed.modelName || "");
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

    // Load PIN
    const enabled = localStorage.getItem("pin_lock_enabled") === "true";
    const code = localStorage.getItem("pin_lock_code") || "";
    setPinEnabled(enabled);
    setPinCode(code);

    // Load Google Client ID
    const savedClientId = localStorage.getItem("google_client_id") || "";
    setGoogleClientId(savedClientId);

    loadAgentMemoryData();
  }, []);

  // Save Configs
  const handleSaveConfigs = () => {
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

    triggerToast("Đã lưu cấu hình trợ lý AI & Tìm kiếm thành công!");
  };

  const handleSaveGoogleAuth = () => {
    localStorage.setItem("google_client_id", googleClientId.trim());
    window.dispatchEvent(new CustomEvent("auth-state-changed"));
    triggerToast("Đã lưu Google Client ID thành công!");
  };

  const handleTogglePin = () => {
    if (pinEnabled) {
      localStorage.setItem("pin_lock_enabled", "false");
      localStorage.removeItem("pin_lock_code");
      setPinEnabled(false);
      setPinCode("");
      triggerToast("Đã tắt bảo mật bằng mã PIN.");
    } else {
      setShowPinInput(true);
    }
  };

  const handleSavePin = () => {
    if (pinCode.length < 4) {
      triggerToast("Mã PIN phải có ít nhất 4 chữ số!");
      return;
    }
    localStorage.setItem("pin_lock_enabled", "true");
    localStorage.setItem("pin_lock_code", pinCode);
    setPinEnabled(true);
    setShowPinInput(false);
    triggerToast("Đã kích hoạt bảo mật mã PIN thành công!");
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
    <div ref={containerRef} className="flex-1 flex flex-col overflow-y-auto space-y-6 pr-1 pb-10">
      <div>
        <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">Settings & Integrations</h3>
        <p className="text-[10px] text-zinc-600 dark:text-zinc-500">Cấu hình trợ lý AI, tìm kiếm, bảo mật và sao lưu dữ liệu.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 max-w-6xl">

        {/* 1. Integration Card (AI API Keys) */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">AI Assistant Keys</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">Cấu hình kết nối để kích hoạt Trợ lý AI thông minh.</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-zinc-750 dark:text-zinc-300">
            <div>
              <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">API Base URL / Endpoint</label>
              <input 
                type="text" 
                value={aiBaseUrl} 
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="Ví dụ: https://api.openai.com/v1 hoặc http://localhost:11434/v1" 
                className="w-full p-2.5 rounded glass-input text-zinc-800 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs" 
              />
              <span className="text-[9px] text-zinc-655 dark:text-zinc-500 mt-1 block">Hỗ trợ OpenAI, DeepSeek, Gemini (OpenAI endpoint), Ollama.</span>
            </div>

            <div>
              <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">Model Name</label>
              <input 
                type="text" 
                value={aiModelName} 
                onChange={(e) => setAiModelName(e.target.value)}
                placeholder="Ví dụ: gpt-4o-mini, gpt-4o, gemini-1.5-flash, deepseek-chat..." 
                className="w-full p-2.5 rounded glass-input text-zinc-800 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
              />
            </div>

            <div>
              <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">API Key</label>
              <input 
                type="password" 
                value={aiApiKey} 
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={aiBaseUrl.includes("localhost") ? "Không cần Key đối với Local Ollama..." : "AI API Key..."} 
                autoComplete="new-password"
                className="w-full p-2.5 rounded glass-input text-zinc-800 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={handleSaveConfigs}
                className="px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-md shadow-purple-500/10"
              >
                Lưu cấu hình AI
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
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">Web Search Skills</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">Cấu hình dịch vụ tìm kiếm để trợ lý AI tra cứu thông tin trực tuyến.</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-zinc-750 dark:text-zinc-350">
            <div>
              <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">Dịch vụ Tìm kiếm</label>
              <select 
                value={searchProvider} 
                onChange={(e) => setSearchProvider(e.target.value)}
                className="w-full p-2.5 rounded glass-input text-zinc-705 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/5" 
              >
                <option value="ddg">DuckDuckGo Lite (Miễn phí - Không cần Key)</option>
                <option value="tavily">Tavily AI Search (Tốt nhất cho AI - Cần API Key)</option>
                <option value="google">Google Custom Search (Cần API Key & CX ID)</option>
              </select>
            </div>

            {searchProvider === "tavily" && (
              <div>
                <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">Tavily API Key</label>
                <input 
                  type="password" 
                  value={searchApiKey} 
                  onChange={(e) => setSearchApiKey(e.target.value)}
                  placeholder="Nhập Tavily API Key của bạn..." 
                  className="w-full p-2.5 rounded glass-input text-zinc-850 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
                />
                <span className="text-[9px] text-zinc-650 dark:text-zinc-500 mt-1 block">Đăng ký lấy API Key miễn phí (1000 lượt tìm kiếm/tháng) tại app.tavily.com</span>
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
                    placeholder="Nhập Google API Key..." 
                    className="w-full p-2.5 rounded glass-input text-zinc-850 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
                  />
                </div>
                <div>
                  <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">Search Engine ID (CX)</label>
                  <input 
                    type="text" 
                    value={googleCx} 
                    onChange={(e) => setGoogleCx(e.target.value)}
                    placeholder="Ví dụ: a1b2c3d4e5f6g7h8i" 
                    className="w-full p-2.5 rounded glass-input text-zinc-855 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
                  />
                </div>
                <span className="text-[9px] text-zinc-650 dark:text-zinc-500 mt-1 block">Tạo Google Programmable Search Engine miễn phí (100 searches/ngày) tại cse.google.com</span>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={handleSaveConfigs}
                className="px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-md shadow-purple-500/10"
              >
                Lưu cấu hình Tìm kiếm
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
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">Agent Memory</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">Nguồn lưu duy nhất: USER.md cho thông tin cá nhân và MEMORY.md cho kỹ thuật/dự án.</p>
            </div>
            <button
              type="button"
              onClick={() => loadAgentMemoryData(true)}
              disabled={memoryLoading}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold transition-all disabled:opacity-50 text-[10px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${memoryLoading ? "animate-spin" : ""}`} />
              Tải lại
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">USER.md</h5>
                <span className="text-[9px] text-zinc-600 dark:text-zinc-500">Thông tin cá nhân</span>
              </div>
              <pre className="max-h-64 min-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-300 dark:border-white/5 bg-zinc-100/80 dark:bg-zinc-950/55 p-3 text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-300">
                {userMemoryContent}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">MEMORY.md</h5>
                <span className="text-[9px] text-zinc-600 dark:text-zinc-500">Kỹ thuật & dự án</span>
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
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">App PIN Security Lock</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">Khóa ứng dụng khi khởi chạy bằng mã PIN cá nhân.</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <div>
              <span className="text-zinc-700 dark:text-zinc-400 font-medium block">Kích hoạt khóa bằng mã PIN</span>
              <span className="text-[10px] text-zinc-605 dark:text-zinc-500">Yêu cầu nhập mã PIN bảo mật khi mở ứng dụng.</span>
            </div>
            <button 
              type="button"
              onClick={handleTogglePin}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                pinEnabled ? "bg-red-600/20 text-red-400 border border-red-500/10" : "bg-purple-600 text-white shadow-md shadow-purple-500/10"
              }`}
            >
              {pinEnabled ? "Tắt Khóa PIN" : "Kích hoạt"}
            </button>
          </div>

          {showPinInput && (
            <div className="p-3 bg-zinc-200/50 dark:bg-zinc-950/60 rounded border border-zinc-200 dark:border-white/5 space-y-3 max-w-sm">
              <label className="block text-xs text-zinc-650 dark:text-zinc-400">Thiết lập mã PIN mới (Tối thiểu 4 chữ số)</label>
              <div className="flex gap-2">
                <input 
                  type="password" 
                  maxLength={8}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ví dụ: 1234"
                  className="w-1/2 p-2 rounded glass-input text-zinc-800 dark:text-zinc-300 font-mono text-center tracking-widest"
                />
                <button 
                  type="button"
                  onClick={handleSavePin}
                  className="bg-purple-600 text-white px-4 py-2 rounded text-xs font-semibold shadow-md shadow-purple-500/10"
                >
                  Lưu PIN
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Google Sync Client ID Configuration */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">Google OAuth Client ID</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-605 dark:text-zinc-500">Cấu hình OAuth Client ID để sử dụng Đăng nhập Google thật sự.</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-zinc-750 dark:text-zinc-300">
            <div>
              <label className="block text-zinc-550 dark:text-zinc-400 font-medium mb-1">OAuth Web Client ID</label>
              <input 
                type="text" 
                value={googleClientId} 
                onChange={(e) => setGoogleClientId(e.target.value)}
                placeholder="Ví dụ: 123456-abc.apps.googleusercontent.com" 
                className="w-full p-2.5 rounded glass-input text-zinc-800 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
              />
              <span className="text-[9px] text-zinc-655 dark:text-zinc-500 mt-1.5 block leading-normal">
                Để lấy Client ID: Vào Google Cloud Console &rarr; API & Services &rarr; Credentials &rarr; Create OAuth Client ID (loại Web Application). Thêm JavaScript Origin: <code>http://localhost:5173</code> (hoặc port chạy app dev).
              </span>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={handleSaveGoogleAuth}
                className="px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-md shadow-purple-500/10"
              >
                Lưu Client ID
              </button>
            </div>
          </div>
        </div>

        {/* 3.5 Theme Settings Card */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0">
              <Sun className="w-4 h-4 dark:hidden" />
              <Moon className="w-4 h-4 hidden dark:block" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white">Theme Settings</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-500">Lựa chọn chế độ giao diện sáng hoặc tối cho ứng dụng.</p>
            </div>
          </div>

          <div className="flex gap-4 pt-1">
            <button 
              type="button"
              onClick={() => setTheme("light")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                theme === "light" 
                  ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/20" 
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800"
              }`}
            >
              <Sun className="w-4 h-4" /> Giao diện Sáng
            </button>
            <button 
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                theme === "dark" 
                  ? "bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-500/20" 
                  : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-white/5"
              }`}
            >
              <Moon className="w-4 h-4" /> Giao diện Tối
            </button>
          </div>
        </div>

        {/* 4. Data Backup Card */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-3 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider mb-1.5">Backup & Export</h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Tải xuống toàn bộ cơ sở dữ liệu SQLite cục bộ dưới dạng tệp tin sao lưu JSON.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button 
              type="button"
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-zinc-205 hover:bg-zinc-300 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 dark:hover:text-white dark:hover:bg-zinc-700 transition-all text-xs font-semibold shadow-sm"
            >
              <Download className="w-4 h-4" /> Tải về Backup JSON
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
