import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Sparkles, X, History, Plus, Trash2 } from "lucide-react";
import { askAI, extractAndSaveMemory } from "../services/aiService";
import CopyBlock from "./CopyBlock";
import GenericConfirmModal from "./GenericConfirmModal";
import { useLanguage } from "../contexts/LanguageContext";
import { 
  getAISessions, 
  createAISession, 
  deleteAISession, 
  getAIMessages, 
  addAIMessage,
  updateAIMessage,
  updateAISessionTitle,
  AISession
} from "../database/queries/aiChat";

interface Message {
  id?: string;
  sender: "user" | "ai";
  text: string;
  isStreaming?: boolean;
  thinking?: string;
}

interface AIChatPanelProps {
  onClose: () => void;
}

// Helper to normalise welcome message across updates

export default function AIChatPanel({ onClose }: AIChatPanelProps) {
  const { t, language } = useLanguage();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const normalizeWelcomeMessage = (message: Message): Message => {
    if (
      (message.text.includes("Notebook Agent") || message.text.includes("Trợ lý Sổ tay") || message.text.includes("Notebook Assistant")) &&
      (message.text.includes("note") || message.text.includes("ghi chú") || message.text.includes("task") || message.text.includes("công việc"))
    ) {
      return { ...message, text: t("aiChat.welcomeText") };
    }
    return message;
  };
  const [sessionIdToDelete, setSessionIdToDelete] = useState<string | null>(null);
  
  // Session States
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Message States
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamRunRef = useRef(0);

  const scrollToBottom = (instant = false) => {
    if (instant && messagesEndRef.current) {
      // Use direct scrollTop for instant scroll during streaming (no animation fight)
      const container = messagesEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const updateMessage = (id: string, patch: Partial<Message>) => {
    setMessages(prev =>
      prev.map(message =>
        message.id === id ? { ...message, ...patch } : message
      )
    );
  };

  const finishAssistantResponse = (messageId: string, fullText: string, runId: number) => {
    if (streamRunRef.current !== runId) return;

    updateMessage(messageId, {
      text: fullText,
      isStreaming: false,
      thinking: undefined
    });
    setTimeout(() => scrollToBottom(), 0);
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
      const normalizedMessages = await Promise.all(
        list.map(async (m) => {
          const message = normalizeWelcomeMessage({ sender: m.sender, text: m.text });
          if (message.text !== m.text) {
            await updateAIMessage(m.id, message.text);
          }
          return { ...message, id: m.id };
        })
      );
      setMessages(normalizedMessages);
    } else {
      setMessages([
        {
          id: "welcome-message",
          sender: "ai",
          text: t("aiChat.welcomeText")
        }
      ]);
    }
  };

  useEffect(() => {
    loadSessions(activeSessionId);
  }, [language]);

  useEffect(() => {
    const handleSyncUpdate = () => {
      loadSessions(activeSessionId);
    };
    window.addEventListener("ai-chat-updated", handleSyncUpdate);
    return () => {
      window.removeEventListener("ai-chat-updated", handleSyncUpdate);
    };
  }, [activeSessionId]);

  useEffect(() => {
    // Only smooth-scroll for non-streaming updates (new messages, session switch)
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg?.isStreaming) {
      scrollToBottom();
    }
  }, [messages.length]);

  useEffect(() => {
    return () => {
      streamRunRef.current += 1;
    };
  }, []);

  // 3. Create a brand new chat session
  const handleNewChat = async () => {
    streamRunRef.current += 1;
    const newId = `session-${Date.now()}`;
    const defaultTitle = t("aiChat.newChatTitle");
    
    await createAISession(newId, defaultTitle);
    
    // Add default initial message to SQLite
    const msgId = `msg-${Math.random().toString(36).substring(2, 9)}`;
    await addAIMessage(msgId, newId, "ai", t("aiChat.welcomeText"));

    setActiveSessionId(newId);
    setMessages([{ id: msgId, sender: "ai", text: t("aiChat.welcomeText") }]);
    
    // Reload sessions list
    const list = await getAISessions();
    setSessions(list);
    setShowHistory(false);
  };

  // 4. Delete session
  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSessionIdToDelete(sessionId);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteSession = async () => {
    if (!sessionIdToDelete) return;
    try {
      await deleteAISession(sessionIdToDelete);
      
      // If we deleted the active session, reset active ID
      if (activeSessionId === sessionIdToDelete) {
        await loadSessions(null);
      } else {
        const list = await getAISessions();
        setSessions(list);
      }
    } catch (err) {
      console.error("Failed to delete chat session:", err);
    } finally {
      setShowDeleteConfirm(false);
      setSessionIdToDelete(null);
    }
  };

  // 5. Select a session from history
  const handleSelectSession = async (sessionId: string) => {
    streamRunRef.current += 1;
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
      await updateAISessionTitle(activeSessionId, shortTitle);
      
      // Update session title in local state list
      setSessions(prev => 
        prev.map(s => s.id === activeSessionId ? { ...s, title: shortTitle } : s)
      );
    }

    // Save user message to database
    const userMsgId = `msg-${Math.random().toString(36).substring(2, 9)}`;
    await addAIMessage(userMsgId, activeSessionId, "user", userQuery);
    const aiMsgId = `msg-${Math.random().toString(36).substring(2, 9)}`;

    // Build the conversational history to send to AI
    const historyMessages = messages.map(m => ({
      role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
      content: m.text
    }));
    historyMessages.push({ role: "user", content: userQuery });

    setMessages(prev => [
      ...prev,
      { id: userMsgId, sender: "user", text: userQuery },
      { id: aiMsgId, sender: "ai", text: "", isStreaming: true, thinking: "Đang suy nghĩ..." }
    ]);
    setInput("");
    setLoading(true);

    const requestRunId = ++streamRunRef.current;
    setTimeout(() => scrollToBottom(), 0);

    try {
      // Call actual AI service with history messages array
      const response = await askAI(historyMessages, false, (status) => {
        if (streamRunRef.current !== requestRunId) return;
        updateMessage(aiMsgId, {
          thinking: status.trim() || "Đang suy nghĩ...",
          isStreaming: true
        });
      });
      
      // Save AI response to database
      await addAIMessage(aiMsgId, activeSessionId, "ai", response);

      finishAssistantResponse(aiMsgId, response, requestRunId);

      // Run background memory extraction (Hermes-style)
      extractAndSaveMemory(userQuery, response);

    } catch (err: any) {
      console.error(err);
      const errMsg = err.message || "Lỗi kết nối API AI.";
      
      // Save error message to database
      await addAIMessage(aiMsgId, activeSessionId, "ai", errMsg);

      finishAssistantResponse(aiMsgId, errMsg, requestRunId);
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

    const renderInlineMarkdown = (value: string, keyPrefix: string): React.ReactNode[] => {
      const nodes: React.ReactNode[] = [];
      const inlinePattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let nodeIndex = 0;

      while ((match = inlinePattern.exec(value)) !== null) {
        if (match.index > lastIndex) {
          nodes.push(value.slice(lastIndex, match.index));
        }

        const token = match[0];
        const key = `${keyPrefix}-inline-${nodeIndex++}`;

        if (token.startsWith("`")) {
          nodes.push(
            <code key={key} className="rounded bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 text-[11px] text-purple-750 dark:text-purple-200">
              {token.slice(1, -1)}
            </code>
          );
        } else if (token.startsWith("**")) {
          nodes.push(
            <strong key={key} className="font-semibold text-zinc-950 dark:text-zinc-100">
              {token.slice(2, -2)}
            </strong>
          );
        } else if (token.startsWith("*")) {
          nodes.push(
            <em key={key} className="text-zinc-800 dark:text-zinc-200">
              {token.slice(1, -1)}
            </em>
          );
        } else {
          const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (linkMatch) {
            nodes.push(
              <a
                key={key}
                href={linkMatch[2]}
                target="_blank"
                rel="noreferrer"
                className="text-purple-650 dark:text-purple-300 underline decoration-purple-500/30 dark:decoration-purple-400/50 underline-offset-2 hover:text-purple-800 dark:hover:text-purple-200"
              >
                {linkMatch[1]}
              </a>
            );
          } else {
            nodes.push(token);
          }
        }

        lastIndex = inlinePattern.lastIndex;
      }

      if (lastIndex < value.length) {
        nodes.push(value.slice(lastIndex));
      }

      return nodes;
    };

    const isTableSeparator = (line: string) =>
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

    const parseTableRow = (line: string) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map(cell => cell.trim());

    const renderMarkdownTable = (tableLines: string[], key: string) => {
      const header = parseTableRow(tableLines[0]);
      const rows = tableLines.slice(2).map(parseTableRow);

      return (
        <div key={key} className="my-2 overflow-x-auto rounded-md border border-zinc-200 dark:border-white/10">
          <table className="min-w-full border-collapse text-left text-[11px]">
            <thead className="bg-black/5 dark:bg-white/5 text-zinc-800 dark:text-zinc-200">
              <tr>
                {header.map((cell, index) => (
                  <th key={`${key}-h-${index}`} className="border-b border-zinc-200 dark:border-white/10 px-2 py-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
                    {renderInlineMarkdown(cell, `${key}-h-${index}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${key}-r-${rowIndex}`} className="odd:bg-black/[0.01] dark:odd:bg-white/[0.02]">
                  {header.map((_, cellIndex) => (
                    <td key={`${key}-r-${rowIndex}-${cellIndex}`} className="border-t border-zinc-200 dark:border-white/5 px-2 py-1.5 text-zinc-700 dark:text-zinc-300">
                      {renderInlineMarkdown(row[cellIndex] || "", `${key}-r-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    const lines = cleanText.split("\n");
    const elements: React.ReactNode[] = [];
    let isCode = false;
    let codeLanguage = "bash";
    let codeLines: string[] = [];
    let paragraphLines: string[] = [];

    const flushParagraph = (key: string) => {
      if (paragraphLines.length === 0) return;
      const paragraph = paragraphLines.join(" ");
      elements.push(
        <p key={key} className="my-1 text-zinc-750 dark:text-zinc-300 leading-relaxed">
          {renderInlineMarkdown(paragraph, key)}
        </p>
      );
      paragraphLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        if (!isCode) {
          flushParagraph(`p-before-code-${i}`);
          isCode = true;
          codeLanguage = trimmed.substring(3) || "bash";
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
        continue;
      }

      if (!trimmed) {
        flushParagraph(`p-${i}`);
        continue;
      }

      if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        flushParagraph(`p-before-table-${i}`);
        const tableLines = [line, lines[i + 1]];
        i += 2;
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
          tableLines.push(lines[i]);
          i += 1;
        }
        i -= 1;
        elements.push(renderMarkdownTable(tableLines, `table-${i}`));
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph(`p-before-heading-${i}`);
        const level = headingMatch[1].length;
        const headingClass =
          level <= 2
            ? "mt-2 mb-1 text-sm font-bold text-zinc-900 dark:text-white"
            : "mt-2 mb-1 text-xs font-semibold text-zinc-800 dark:text-zinc-100";
        elements.push(
          <div key={`h-${i}`} className={headingClass}>
            {renderInlineMarkdown(headingMatch[2], `h-${i}`)}
          </div>
        );
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushParagraph(`p-before-hr-${i}`);
        elements.push(<hr key={`hr-${i}`} className="my-2 border-zinc-200 dark:border-white/10" />);
        continue;
      }

      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        flushParagraph(`p-before-li-${i}`);
        elements.push(
          <div key={`li-${i}`} className="my-1 flex gap-2 text-zinc-700 dark:text-zinc-300">
            <span className="mt-[1px] text-purple-650 dark:text-purple-300">•</span>
            <span>{renderInlineMarkdown(bulletMatch[1], `li-${i}`)}</span>
          </div>
        );
        continue;
      }

      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (orderedMatch) {
        flushParagraph(`p-before-ol-${i}`);
        elements.push(
          <div key={`ol-${i}`} className="my-1 flex gap-2 text-zinc-700 dark:text-zinc-300">
            <span className="min-w-4 text-right text-purple-650 dark:text-purple-300">{orderedMatch[1]}.</span>
            <span>{renderInlineMarkdown(orderedMatch[2], `ol-${i}`)}</span>
          </div>
        );
        continue;
      }

      const quoteMatch = trimmed.match(/^>\s?(.+)$/);
      if (quoteMatch) {
        flushParagraph(`p-before-quote-${i}`);
        elements.push(
          <blockquote key={`quote-${i}`} className="my-2 border-l-2 border-purple-400/60 pl-2 text-zinc-700 dark:text-zinc-300">
            {renderInlineMarkdown(quoteMatch[1], `quote-${i}`)}
          </blockquote>
        );
        continue;
      }

      paragraphLines.push(trimmed);
    }

    flushParagraph("p-final");

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
    <aside className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm sm:w-96 xl:static xl:w-80 xl:z-10 xl:h-auto glass-panel border-l border-zinc-200 dark:border-white/5 flex flex-col h-full min-h-0 max-h-full shrink-0 shadow-2xl xl:shadow-none transition-all duration-300">
      
      {/* 1. AI Chat Header */}
      <div className="p-4 border-b border-zinc-200 dark:border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {/* History Toggle Button */}
          <button 
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer ${showHistory ? "text-purple-650 dark:text-purple-400" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"}`}
            title={t("aiChat.historyTitle")}
          >
            <History className="w-4 h-4" />
          </button>
          
          <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider select-none">{t("aiChat.agentTitle")}</h3>
        </div>
        
        <div className="flex items-center gap-1">
          {/* New Chat Button */}
          <button 
            type="button"
            onClick={handleNewChat}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer mr-1"
            title={t("aiChat.newChatTitle")}
          >
            <Plus className="w-4 h-4" />
          </button>
          {/* Close Panel Button */}
          <button 
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
            title={t("aiChat.closeAssistant")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. OVERLAY: CHAT HISTORY LIST */}
      {showHistory ? (
        <div className="flex-1 flex flex-col bg-zinc-50/95 dark:bg-zinc-950/95 absolute inset-x-0 bottom-0 top-[49px] z-20">
          <div className="p-3 border-b border-zinc-200 dark:border-white/5 flex justify-between items-center bg-zinc-200/50 dark:bg-zinc-900/40 shrink-0">
            <span className="text-[10px] uppercase font-bold text-zinc-550 dark:text-zinc-400 tracking-wider">{t("aiChat.historyHeader")}</span>
            <button 
              type="button"
              onClick={() => setShowHistory(false)}
              className="text-[10px] text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 font-semibold"
            >
              {t("common.close")}
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
                      ? "bg-purple-600/20 text-purple-700 dark:text-purple-300 border border-purple-500/20" 
                      : "hover:bg-black/5 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 border border-transparent"
                  }`}
                >
                  <span className="truncate pr-2 font-medium">{s.title}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(e, s.id)}
                    className="opacity-0 group-hover/item:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all cursor-pointer"
                    title={t("aiChat.deleteHistory")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            
            {sessions.length === 0 && (
              <p className="text-center text-zinc-600 py-10">{t("aiChat.noHistory")}</p>
            )}
          </div>

          {/* Bottom Actions inside history overlay */}
          <div className="p-3 border-t border-zinc-200 dark:border-white/5 bg-zinc-200/20 dark:bg-zinc-900/20 shrink-0">
            <button 
              type="button"
              onClick={handleNewChat}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1 transition-all"
            >
              <Plus className="w-4 h-4" /> {t("aiChat.startNewChat")}
            </button>
          </div>
        </div>
      ) : null}

      {/* 3. AI Chat Messages list */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto text-xs">
        {messages.map((msg, index) => {
          const isUser = msg.sender === "user";
          return isUser ? (
            <motion.div 
              key={msg.id || `user-${index}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="text-right"
            >
              <span className="inline-block bg-purple-600 text-white p-2.5 rounded-lg max-w-[85%] text-left whitespace-pre-wrap">
                {msg.text}
              </span>
            </motion.div>
          ) : (
            <div 
              key={msg.id || `ai-${index}`}
              className="bg-zinc-200/50 dark:bg-zinc-900/40 p-3 rounded-lg border border-zinc-200 dark:border-white/5 text-zinc-700 dark:text-zinc-300 leading-relaxed text-left shadow-sm"
            >
              {msg.isStreaming ? (
                <div className="space-y-3">
                  <div className="min-h-8 flex items-center gap-2 rounded-md border border-purple-500/10 bg-purple-500/10 px-2.5 py-1.5 text-purple-700 dark:text-purple-300">
                    <Sparkles className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{msg.thinking || "Đang suy nghĩ..."}</span>
                    <span className="flex items-center gap-0.5 shrink-0" aria-hidden="true">
                      <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
                      <span className="w-1 h-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "120ms" }} />
                      <span className="w-1 h-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "240ms" }} />
                    </span>
                  </div>
                  {msg.text ? (
                    <div>
                      {renderMessageContent(msg.text)}
                      <span className="inline-block w-1.5 h-3 ml-0.5 align-[-1px] bg-purple-400 animate-pulse" />
                    </div>
                  ) : null}
                </div>
              ) : (
                renderMessageContent(msg.text)
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. AI Chat Input */}
      <div className="p-3 border-t border-zinc-200 dark:border-white/5 shrink-0">
        <div className={`relative flex items-center w-full rounded-lg transition-all duration-300 glass-panel ${
          (isInputFocused || loading) ? "premium-gradient-border border-transparent" : ""
        }`}>
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            disabled={loading}
            placeholder={loading ? t("aiChat.placeholderActive") : t("aiChat.placeholderIdle")} 
            className="w-full pl-3 pr-10 py-2.5 rounded-lg bg-transparent border-none text-xs text-zinc-700 dark:text-zinc-300 placeholder-zinc-500 dark:placeholder-zinc-600 focus:outline-none disabled:opacity-50"
          />
          <button 
            type="button"
            onClick={handleSend}
            disabled={loading}
            className="absolute right-2 p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* CUSTOM DANGER CONFIRM MODAL FOR DELETING CHAT SESSION */}
      <GenericConfirmModal 
        isOpen={showDeleteConfirm}
        title={t("aiChat.deleteSessionTitle")}
        message={t("aiChat.deleteSessionMessage")}
        confirmLabel={t("aiChat.deleteSessionConfirm")}
        cancelLabel={t("common.cancel")}
        type="danger"
        onConfirm={handleConfirmDeleteSession}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setSessionIdToDelete(null);
        }}
      />
    </aside>
  );
}
