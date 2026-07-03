import React, { useState, useEffect } from "react";
import { Download, Globe, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { getDatabase } from "../database/db";
import { testJiraConnection } from "../services/jiraService";

interface SettingsViewProps {
  jiraConnected: boolean;
  setJiraConnected: (connected: boolean) => void;
  triggerToast: (message: string) => void;
}

export default function SettingsView({ 
  jiraConnected, 
  setJiraConnected, 
  triggerToast 
}: SettingsViewProps) {
  // Jira Form States
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [testingJira, setTestingJira] = useState(false);

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

  // Load configuration from localStorage
  useEffect(() => {
    // Load Jira
    const jiraConfig = localStorage.getItem("jira_config");
    if (jiraConfig) {
      try {
        const parsed = JSON.parse(jiraConfig);
        setJiraBaseUrl(parsed.baseUrl || "");
        setJiraEmail(parsed.email || "");
        setJiraApiToken(parsed.apiToken || "");
      } catch (err) {
        console.error(err);
      }
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
      setAiModelName("gpt-3.5-turbo");
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
  }, []);

  // Save Configs
  const handleSaveConfigs = () => {
    // 1. Save Jira
    const jiraData = {
      baseUrl: jiraBaseUrl.trim(),
      email: jiraEmail.trim(),
      apiToken: jiraApiToken.trim()
    };
    localStorage.setItem("jira_config", JSON.stringify(jiraData));

    // 2. Save AI
    const aiData = {
      apiKey: aiApiKey.trim(),
      baseUrl: aiBaseUrl.trim(),
      modelName: aiModelName.trim()
    };
    localStorage.setItem("ai_config", JSON.stringify(aiData));

    // 3. Save Search
    const searchData = {
      provider: searchProvider,
      apiKey: searchApiKey.trim(),
      googleApiKey: googleApiKey.trim(),
      googleCx: googleCx.trim()
    };
    localStorage.setItem("search_config", JSON.stringify(searchData));

    triggerToast("Đã lưu cấu hình trợ lý AI & Tìm kiếm thành công!");
  };

  // Test connection to Jira API
  const handleTestJira = async () => {
    if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
      triggerToast("Vui lòng điền đủ thông tin kết nối Jira!");
      return;
    }

    setTestingJira(true);
    triggerToast("Đang kiểm tra kết nối Jira Cloud...");

    const config = {
      baseUrl: jiraBaseUrl.trim(),
      email: jiraEmail.trim(),
      apiToken: jiraApiToken.trim()
    };

    try {
      const isOk = await testJiraConnection(config);
      if (isOk) {
        setJiraConnected(true);
        // Save automatically if test succeeds
        localStorage.setItem("jira_config", JSON.stringify(config));
        triggerToast("Kết nối Jira Cloud thành công! Đã lưu cấu hình.");
      } else {
        setJiraConnected(false);
        triggerToast("Kết nối thất bại! Vui lòng kiểm tra lại thông tin.");
      }
    } catch (err: any) {
      setJiraConnected(false);
      triggerToast(err.message || "Lỗi kiểm tra kết nối!");
    } finally {
      setTestingJira(false);
    }
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
    <div className="flex-1 flex flex-col overflow-y-auto space-y-6 pr-1 pb-10">
      <div>
        <h3 className="text-sm sm:text-base font-bold text-white">Settings & Integrations</h3>
        <p className="text-[10px] text-zinc-500">Cấu hình kết nối API thực tế cho Jira và Trợ lý AI của bạn.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 max-w-6xl">
        
        {/* 1. Integration Card (Jira) */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">Jira Cloud Integration</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-500">Cho phép kéo thả task Jira và sync trạng thái an toàn.</p>
            </div>
            <span className={`ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold ${
              jiraConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"
            }`}>
              {jiraConnected ? "Connected" : "Disconnected"}
            </span>
          </div>

          <div className="space-y-3 text-xs text-zinc-300">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Jira Base URL</label>
              <input 
                type="text" 
                value={jiraBaseUrl} 
                onChange={(e) => setJiraBaseUrl(e.target.value)}
                placeholder="Ví dụ: https://company.atlassian.net" 
                className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs" 
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Email Tài khoản</label>
              <input 
                type="email" 
                value={jiraEmail} 
                onChange={(e) => setJiraEmail(e.target.value)}
                placeholder="email@company.vn" 
                className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs" 
              />
            </div>
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Jira API Token</label>
              <input 
                type="password" 
                value={jiraApiToken} 
                onChange={(e) => setJiraApiToken(e.target.value)}
                placeholder="Nhập API Token Jira của bạn..." 
                className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs" 
              />
              <span className="text-[9px] text-zinc-500 mt-1 block">Tạo token tại id.atlassian.com/manage-profile/security/api-tokens</span>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={handleTestJira}
                disabled={testingJira}
                className="px-3.5 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold transition-all disabled:opacity-50"
              >
                {testingJira ? "Testing..." : "Test & Save"}
              </button>
            </div>
          </div>
        </div>

        {/* 2. Integration Card (AI API Keys) */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">AI Assistant Keys</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-500">Cấu hình kết nối để kích hoạt Trợ lý AI thông minh.</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-zinc-300">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">API Base URL / Endpoint</label>
              <input 
                type="text" 
                value={aiBaseUrl} 
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="Ví dụ: https://api.openai.com/v1 hoặc http://localhost:11434/v1" 
                className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs" 
              />
              <span className="text-[9px] text-zinc-500 mt-1 block">Hỗ trợ OpenAI, DeepSeek, Gemini (OpenAI endpoint), Ollama.</span>
            </div>

            <div>
              <label className="block text-zinc-400 font-medium mb-1">Model Name</label>
              <input 
                type="text" 
                value={aiModelName} 
                onChange={(e) => setAiModelName(e.target.value)}
                placeholder="Ví dụ: gpt-4o, gemini-1.5-flash, deepseek-chat..." 
                className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-medium mb-1">API Key</label>
              <input 
                type="password" 
                value={aiApiKey} 
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={aiBaseUrl.includes("localhost") ? "Không cần Key đối với Local Ollama..." : "AI API Key..."} 
                className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={handleSaveConfigs}
                className="px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all"
              >
                Lưu cấu hình AI
              </button>
            </div>
          </div>
        </div>

        {/* 2.5 Web Search Engine Configuration Card */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center text-white shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">Web Search Skills</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-500">Cấu hình dịch vụ tìm kiếm để trợ lý AI tra cứu thông tin trực tuyến.</p>
            </div>
          </div>

          <div className="space-y-3 text-xs text-zinc-300">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Dịch vụ Tìm kiếm</label>
              <select 
                value={searchProvider} 
                onChange={(e) => setSearchProvider(e.target.value)}
                className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs bg-zinc-900 border border-white/5" 
              >
                <option value="ddg">DuckDuckGo Lite (Miễn phí - Không cần Key)</option>
                <option value="tavily">Tavily AI Search (Tốt nhất cho AI - Cần API Key)</option>
                <option value="google">Google Custom Search (Cần API Key & CX ID)</option>
              </select>
            </div>

            {searchProvider === "tavily" && (
              <div>
                <label className="block text-zinc-400 font-medium mb-1">Tavily API Key</label>
                <input 
                  type="password" 
                  value={searchApiKey} 
                  onChange={(e) => setSearchApiKey(e.target.value)}
                  placeholder="Nhập Tavily API Key của bạn..." 
                  className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
                />
                <span className="text-[9px] text-zinc-500 mt-1 block">Đăng ký lấy API Key miễn phí (1000 lượt tìm kiếm/tháng) tại app.tavily.com</span>
              </div>
            )}

            {searchProvider === "google" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Google Custom Search API Key</label>
                  <input 
                    type="password" 
                    value={googleApiKey} 
                    onChange={(e) => setGoogleApiKey(e.target.value)}
                    placeholder="Nhập Google API Key..." 
                    className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Search Engine ID (CX)</label>
                  <input 
                    type="text" 
                    value={googleCx} 
                    onChange={(e) => setGoogleCx(e.target.value)}
                    placeholder="Ví dụ: a1b2c3d4e5f6g7h8i" 
                    className="w-full p-2.5 rounded glass-input text-zinc-300 focus:outline-none focus:ring-1 focus:ring-purple-500/20 text-xs font-mono" 
                  />
                </div>
                <span className="text-[9px] text-zinc-500 mt-1 block">Tạo Google Programmable Search Engine miễn phí (100 searches/ngày) tại cse.google.com</span>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={handleSaveConfigs}
                className="px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all"
              >
                Lưu cấu hình Tìm kiếm
              </button>
            </div>
          </div>
        </div>

        {/* 3. Security Lock Option */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-3">
            <div className="w-8 h-8 rounded bg-purple-600/20 text-purple-400 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-semibold text-white">App PIN Security Lock</h4>
              <p className="text-[9px] sm:text-[10px] text-zinc-500">Khóa ứng dụng khi khởi chạy bằng mã PIN cá nhân.</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <div>
              <span className="text-zinc-400 font-medium block">Kích hoạt khóa bằng mã PIN</span>
              <span className="text-[10px] text-zinc-500">Yêu cầu nhập mã PIN bảo mật khi mở ứng dụng.</span>
            </div>
            <button 
              onClick={handleTogglePin}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                pinEnabled ? "bg-red-600/20 text-red-400 border border-red-500/10" : "bg-purple-600 text-white"
              }`}
            >
              {pinEnabled ? "Tắt Khóa PIN" : "Kích hoạt"}
            </button>
          </div>

          {showPinInput && (
            <div className="p-3 bg-zinc-950/60 rounded border border-white/5 space-y-3 max-w-sm">
              <label className="block text-xs text-zinc-400">Thiết lập mã PIN mới (Tối thiểu 4 chữ số)</label>
              <div className="flex gap-2">
                <input 
                  type="password" 
                  maxLength={8}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ví dụ: 1234"
                  className="w-1/2 p-2 rounded glass-input text-zinc-300 font-mono text-center tracking-widest"
                />
                <button 
                  onClick={handleSavePin}
                  className="bg-purple-600 text-white px-4 py-2 rounded text-xs font-semibold"
                >
                  Lưu PIN
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. Data Backup Card */}
        <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-3 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1.5">Backup & Export</h4>
            <p className="text-xs text-zinc-400">Tải xuống toàn bộ cơ sở dữ liệu SQLite cục bộ dưới dạng tệp tin sao lưu JSON.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button 
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-700 transition-all text-xs font-semibold"
            >
              <Download className="w-4 h-4" /> Tải về Backup JSON
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
