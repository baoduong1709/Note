import React, { useState, useRef, useEffect } from "react";
import { Send, Sparkles, X, History, Plus, Trash2 } from "lucide-react";
import { askAI } from "../services/aiService";
import CopyBlock from "./CopyBlock";
import { 
  getAISessions, 
  createAISession, 
  deleteAISession, 
  getAIMessages, 
  addAIMessage,
  AISession,
  AIMessage 
} from "../database/queries/aiChat";

interface Message {
  sender: "user" | "ai";
  text: string;
  isStreaming?: boolean;
}

interface AIChatPanelProps {
  onClose: () => void;
}

export default function AIChatPanel({ onClose }: AIChatPanelProps) {
  // Session States
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Message States
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Initial Load: Get sessions list
  const loadSessions = async (selectActiveId: string | null = null) => {
    const list = await getAISessions();
    setSessions(list);
    
    if (list.length > 0) {
      const targetId = selectActiveId || list[0].id;
      setActiveSessionId(targetId);
      await loadMessages(targetId);
    } else {
      // Create a default new session if database is empty
      await handleNewChat();
    }
  };

  // 2. Load messages for a session
  const loadMessages = async (sessionId: string) => {
    const list = await getAIMessages(sessionId);
    if (list.length > 0) {
      setMessages(list.map(m => ({ sender: m.sender, text: m.text })));
    } else {
      setMessages([
        {
          sender: "ai",
          text: "Chào Bảo! Tôi là trợ lý AI của bạn. Tôi có thể giúp bạn tìm kiếm ghi chú, giải thích các command, tóm tắt Daily Note hoặc Jira task hôm nay."
        }
      ]);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 3. Create a brand new chat session
  const handleNewChat = async () => {
    const newId = `session-${Date.now()}`;
    const defaultTitle = "Phiên chat mới";
    
    await createAISession(newId, defaultTitle);
    
    // Add default initial message to SQLite
    const msgId = `msg-${Math.random().toString(36).substring(2, 9)}`;
    const welcomeText = "Chào Bảo! Tôi là trợ lý AI của bạn. Tôi có thể giúp bạn tìm kiếm ghi chú, giải thích các command, tóm tắt Daily Note hoặc Jira task hôm nay.";
    await addAIMessage(msgId, newId, "ai", welcomeText);

    setActiveSessionId(newId);
    setMessages([{ sender: "ai", text: welcomeText }]);
    
    // Reload sessions list
    const list = await getAISessions();
    setSessions(list);
    setShowHistory(false);
  };

  // 4. Delete session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (window.confirm("Bạn có chắc chắn muốn xóa phiên chat này và toàn bộ lịch sử tin nhắn liên quan?")) {
      await deleteAISession(sessionId);
      
      // If we deleted the active session, reset active ID
      if (activeSessionId === sessionId) {
        await loadSessions(null);
      } else {
        const list = await getAISessions();
        setSessions(list);
      }
    }
  };

  // 5. Select a session from history
  const handleSelectSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    await loadMessages(sessionId);
    setShowHistory(false);
  };

  // 6. Send User message and get AI response
  const handleSend = async () => {
    if (!input.trim() || loading || !activeSessionId) return;

    const userQuery = input.trim();
    
    // Check if session has default title, if so, update title with user's first query
    const activeSession = sessions.find(s => s.id === activeSessionId);
    if (activeSession && (activeSession.title === "Phiên chat mới" || messages.length <= 1)) {
      const shortTitle = userQuery.length > 22 ? `${userQuery.substring(0, 22)}...` : userQuery;
      // Import directly to update title dynamically
      const { updateAISessionTitle } = await import("../database/queries/aiChat");
      await updateAISessionTitle(activeSessionId, shortTitle);
      
      // Update session title in local state list
      setSessions(prev => 
        prev.map(s => s.id === activeSessionId ? { ...s, title: shortTitle } : s)
      );
    }

    // Save user message to database
    const userMsgId = `msg-${Math.random().toString(36).substring(2, 9)}`;
    await addAIMessage(userMsgId, activeSessionId, "user", userQuery);

    // Build the conversational history to send to AI
    const historyMessages = messages.map(m => ({
      role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text
    }));
    historyMessages.push({ role: "user", content: userQuery });

    setMessages(prev => [...prev, { sender: "user", text: userQuery }]);
    setInput("");
    setLoading(true);

    // Add temporary AI streaming response placeholder
    setMessages(prev => [...prev, { sender: "ai", text: "Đang suy nghĩ...", isStreaming: true }]);

    try {
      // Call actual AI service with history messages array
      const response = await askAI(historyMessages);
      
      // Save AI response to database
      const aiMsgId = `msg-${Math.random().toString(36).substring(2, 9)}`;
      await addAIMessage(aiMsgId, activeSessionId, "ai", response);

      // Update UI state
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].sender === "ai") {
          updated[lastIdx] = { sender: "ai", text: response };
        }
        return updated;
      });

      // Run background memory extraction (Hermes-style)
      const { extractAndSaveMemory } = await import("../services/aiService");
      extractAndSaveMemory(userQuery, response);

    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "Lỗi kết nối API AI.";
      
      // Save error message to database
      const aiMsgId = `msg-${Math.random().toString(36).substring(2, 9)}`;
      await addAIMessage(aiMsgId, activeSessionId, "ai", errMsg);

      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].sender === "ai") {
          updated[lastIdx] = { sender: "ai", text: errMsg };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper to parse AI responses containing markdown code blocks
  const renderMessageContent = (text: string) => {
    // Strip raw XML/DSML tool_calls block from final UI display
    let cleanText = text.replace(/<\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*tool_calls\s*>[\s\S]*?<\s*\/\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*tool_calls\s*>/gi, "").trim();
    
    if (!cleanText) {
      cleanText = "*(Đang thực thi công cụ tìm kiếm mạng...)*";
    }

    const lines = cleanText.split("\n");
    const elements: React.ReactNode[] = [];
    let isCode = false;
    let codeLanguage = "bash";
    let codeLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith("```")) {
        if (!isCode) {
          isCode = true;
          codeLanguage = line.trim().substring(3) || "bash";
          codeLines = [];
        } else {
          isCode = false;
          elements.push(
            <CopyBlock 
              key={`ai-code-${i}`} 
              code={codeLines.join("\n")} 
              language={codeLanguage} 
              triggerToast={(msg) => console.log(msg)} 
            />
          );
        }
        continue;
      }

      if (isCode) {
        codeLines.push(line);
      } else if (line.trim() !== "") {
        elements.push(
          <p key={`p-${i}`} className="my-1 text-zinc-300">
            {line}
          </p>
        );
      }
    }

    if (isCode) {
      elements.push(
        <CopyBlock 
          key={`ai-code-unclosed`} 
          code={codeLines.join("\n")} 
          language={codeLanguage} 
          triggerToast={(msg) => console.log(msg)} 
        />
      );
    }

    return elements.length > 0 ? <div className="space-y-1">{elements}</div> : <span>{text}</span>;
  };

  return (
    <aside className="w-80 glass-panel border-l border-white/5 flex flex-col h-full shrink-0 z-10 transition-all duration-300 hidden xl:flex relative">
      
      {/* 1. AI Chat Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {/* History Toggle Button */}
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1 rounded hover:bg-white/5 transition-all cursor-pointer ${showHistory ? "text-purple-400" : "text-zinc-500 hover:text-white"}`}
            title="Lịch sử chat"
          >
            <History className="w-4 h-4" />
          </button>
          
          <h3 className="text-xs font-bold text-white uppercase tracking-wider select-none">AI ASSISTANT</h3>
        </div>
        
        <div className="flex items-center gap-1">
          {/* New Chat Button */}
          <button 
            onClick={handleNewChat}
            className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/5 transition-all cursor-pointer mr-1"
            title="Cuộc trò chuyện mới"
          >
            <Plus className="w-4 h-4" />
          </button>
          {/* Close Panel Button */}
          <button 
            onClick={onClose}
            className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/5 transition-all cursor-pointer"
            title="Đóng trợ lý AI"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. OVERLAY: CHAT HISTORY LIST */}
      {showHistory ? (
        <div className="flex-1 flex flex-col bg-zinc-950/95 absolute inset-x-0 bottom-0 top-[49px] z-20">
          <div className="p-3 border-b border-white/5 flex justify-between items-center bg-zinc-900/40 shrink-0">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Lịch sử cuộc hội thoại</span>
            <button 
              onClick={() => setShowHistory(false)}
              className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold"
            >
              Đóng
            </button>
          </div>
          
          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1 text-xs">
            {sessions.map(s => {
              const isActive = s.id === activeSessionId;
              return (
                <div 
                  key={s.id}
                  onClick={() => handleSelectSession(s.id)}
                  className={`w-full p-2.5 rounded-lg flex items-center justify-between transition-all group/item cursor-pointer ${
                    isActive 
                      ? "bg-purple-600/20 text-purple-300 border border-purple-500/20" 
                      : "hover:bg-white/5 text-zinc-400 hover:text-zinc-200 border border-transparent"
                  }`}
                >
                  <span className="truncate pr-2 font-medium">{s.title}</span>
                  <button
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="opacity-0 group-hover/item:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all cursor-pointer"
                    title="Xóa lịch sử"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            
            {sessions.length === 0 && (
              <p className="text-center text-zinc-600 py-10">Không có lịch sử trò chuyện.</p>
            )}
          </div>

          {/* Bottom Actions inside history overlay */}
          <div className="p-3 border-t border-white/5 bg-zinc-900/20 shrink-0">
            <button 
              onClick={handleNewChat}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-all"
            >
              <Plus className="w-4 h-4" /> Bắt đầu Chat mới
            </button>
          </div>
        </div>
      ) : null}

      {/* 3. AI Chat Messages list */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs">
        {messages.map((msg, index) => {
          const isUser = msg.sender === "user";
          return (
            <div 
              key={index} 
              className={isUser ? "text-right" : "bg-zinc-900/40 p-3 rounded-lg border border-white/5 text-zinc-300 leading-relaxed text-left"}
            >
              {isUser ? (
                <span className="inline-block bg-purple-600 text-white p-2.5 rounded-lg max-w-[85%] text-left whitespace-pre-wrap">
                  {msg.text}
                </span>
              ) : (
                msg.isStreaming ? (
                  <div className="flex items-center gap-1.5 text-purple-400">
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>AI đang phân tích...</span>
                  </div>
                ) : (
                  renderMessageContent(msg.text)
                )
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. AI Chat Input */}
      <div className="p-3 border-t border-white/5 shrink-0">
        <div className="relative flex items-center">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={loading}
            placeholder={loading ? "AI đang trả lời..." : "Hỏi AI..."} 
            className="w-full pl-3 pr-10 py-2.5 rounded-lg glass-input text-xs text-zinc-300 focus:outline-none disabled:opacity-50"
          />
          <button 
            onClick={handleSend}
            disabled={loading}
            className="absolute right-2 p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
