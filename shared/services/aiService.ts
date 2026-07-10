import { getDatabase } from "../database/db";
import { getActivityLogs } from "../database/queries/logs";
import { createNote, getNotes, Note, searchNotes, updateNote } from "../database/queries/notes";
import { createTask, getTasks, searchTasks, Task } from "../database/queries/tasks";
import {
  CalendarDateType,
  CalendarEvent,
  CalendarEventType,
  createCalendarEvent,
  getCalendarEvents
} from "../database/queries/calendarEvents";
import { lunarToSolar, solarToLunar } from "../utils/lunarCalendar";

// OpenAI-compatible AI service with a local notebook agent tool layer.

export interface AIConfig {
  baseUrl: string;
  modelName: string;
  apiKey: string;
}

export interface SearchConfig {
  provider: string;
  apiKey: string;
  googleApiKey?: string;
  googleCx?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: Record<string, any>) => Promise<string>;
}

interface AgentToolCall {
  id?: string;
  name: string;
  args: Record<string, any>;
}

interface ExecutedToolResult {
  id?: string;
  name: string;
  result: string;
}

interface TextToolCall {
  name: string;
  args: Record<string, any>;
}

const MAX_TOOL_ROUNDS = 15;
const MAX_HISTORY_MESSAGES = 18;
const MAX_TOOL_RESULT_CHARS = 7000;

const isTauri =
  typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
const isDevServer =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export function getAIConfig(): AIConfig {
  try {
    const configStr = localStorage.getItem("ai_config");
    if (configStr) {
      return JSON.parse(configStr);
    }
  } catch (err) {
    console.error("Failed to parse AI config:", err);
  }

  return {
    baseUrl: "https://api.openai.com/v1",
    modelName: "gpt-4o-mini",
    apiKey: ""
  };
}

export function getSearchConfig(): SearchConfig {
  try {
    const configStr = localStorage.getItem("search_config");
    if (configStr) {
      return JSON.parse(configStr);
    }
  } catch (err) {
    console.error("Failed to parse search config:", err);
  }

  return { provider: "ddg", apiKey: "" };
}

async function safeFetch(url: string, options: any) {
  const isTargetAbsolute = url.startsWith("http://") || url.startsWith("https://");
  const cleanHeaders: Record<string, string> = { ...(options.headers || {}) };

  if (url.includes("duckduckgo.com")) {
    delete cleanHeaders.Origin;
    delete cleanHeaders.origin;
    cleanHeaders.Referer = "https://lite.duckduckgo.com/";
    cleanHeaders["User-Agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
  }

  if (isDevServer && isTargetAbsolute && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    const parsedUrl = new URL(url);
    const proxyPath = `/api-proxy${parsedUrl.pathname}${parsedUrl.search}`;
    const proxyOptions = { ...options, headers: { ...cleanHeaders, "x-target-url": parsedUrl.origin } };
    console.log(`[SafeFetch] Dev proxy: ${url}`);
    return await fetch(proxyPath, proxyOptions);
  }

  if (isTauri && isTargetAbsolute) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    console.log(`[SafeFetch] Tauri HTTP: ${url}`);
    return await tauriFetch(url, { ...options, headers: cleanHeaders });
  }

  return await fetch(url, { ...options, headers: cleanHeaders });
}

async function readJsonResponse<T = any>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const contentType = response.headers.get("content-type") || "unknown";
    const preview = text
      .slice(0, 220)
      .replace(/[^\x09\x0A\x0D\x20-\x7E\u00C0-\u1EF9]/g, "?");
    throw new Error(
      `${label} trả về dữ liệu không phải JSON hợp lệ. Content-Type: ${contentType}. Preview: ${preview}`
    );
  }
}

function normalizeApiUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function getApiHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

function compactText(text: string, maxChars = 900): string {
  const clean = redactSensitiveText(
    String(text || "")
      .replace(/\s+/g, " ")
      .trim()
  );
  return clean.length > maxChars ? `${clean.slice(0, maxChars)}...` : clean;
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_OPENAI_KEY]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_GOOGLE_KEY]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]")
    .replace(/(xox[baprs]-[0-9A-Za-z-]{20,})/g, "[REDACTED_SLACK_TOKEN]")
    .replace(/(api[_-]?token|api[_-]?key|password|secret)\s*[:=]\s*["']?[^"'\s]{8,}/gi, "$1=[REDACTED]");
}

function formatDateTime(value?: string | null): string {
  if (!value) return "không rõ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayIsoDate(): string {
  return toLocalDateKey(new Date());
}

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;
  if (["true", "1", "yes", "y", "có", "co", "đúng", "dung"].includes(text)) return true;
  if (["false", "0", "no", "n", "không", "khong", "sai"].includes(text)) return false;
  return fallback;
}

function normalizeNoteType(value: unknown): Note["type"] {
  const text = String(value || "").trim().toLowerCase();
  if (["command", "cmd", "lệnh", "lenh"].includes(text)) return "command";
  if (["workflow", "quy trình", "quy trinh"].includes(text)) return "workflow";
  if (["error_fix", "error fix", "fix", "lỗi", "loi"].includes(text)) return "error_fix";
  if (["prompt"].includes(text)) return "prompt";
  return "quick";
}

function normalizeTaskStatus(value: unknown): Task["status"] {
  const text = String(value || "").trim().toLowerCase();
  if (["in_progress", "doing", "đang làm", "dang lam", "progress"].includes(text)) return "in_progress";
  if (["blocked", "block", "kẹt", "ket"].includes(text)) return "blocked";
  if (["done", "xong", "hoàn thành", "hoan thanh"].includes(text)) return "done";
  return "todo";
}

function normalizeTaskPriority(value: unknown): Task["priority"] {
  const text = String(value || "").trim().toLowerCase();
  if (["high", "cao", "gấp", "gap", "urgent", "quan trọng", "quan trong"].includes(text)) return "high";
  if (["low", "thấp", "thap"].includes(text)) return "low";
  return "medium";
}

function normalizeCalendarEventType(value: unknown, title = ""): CalendarEventType {
  const text = `${String(value || "")} ${title}`.trim().toLowerCase();
  if (text.includes("sinh nhật") || text.includes("sinh nhat") || text.includes("birthday")) return "birthday";
  if (text.includes("ngày lễ") || text.includes("ngay le") || text.includes("holiday") || text.includes("lễ")) return "holiday";
  if (text.includes("kỷ niệm") || text.includes("ky niem") || text.includes("anniversary")) return "anniversary";
  return "other";
}

function normalizeCalendarDateType(value: unknown, promptText = ""): CalendarDateType {
  const text = `${String(value || "")} ${promptText}`.trim().toLowerCase();
  return text.includes("âm") || text.includes("am ") || text.includes("lunar") ? "lunar" : "solar";
}

function parseDateInput(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const today = new Date();
  
  let datePart: Date | null = null;
  
  // 1. Check relative date
  if (lower.includes("hôm nay") || lower.includes("hom nay") || lower.includes("today")) {
    datePart = today;
  } else if (lower.includes("ngày mai") || lower.includes("ngay mai") || lower.includes("tomorrow") || lower.startsWith("mai")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    datePart = tomorrow;
  }

  // 2. Check absolute date patterns if no relative date matched
  let year = today.getFullYear();
  let month = today.getMonth() + 1;
  let day = today.getDate();
  let dateMatched = false;

  if (!datePart) {
    // Check YYYY-MM-DD
    const isoMatch = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (isoMatch) {
      year = Number(isoMatch[1]);
      month = Number(isoMatch[2]);
      day = Number(isoMatch[3]);
      dateMatched = true;
    } else {
      // Check DD/MM/YYYY or DD-MM-YYYY
      const vnMatch = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
      if (vnMatch) {
        day = Number(vnMatch[1]);
        month = Number(vnMatch[2]);
        year = vnMatch[3] ? Number(vnMatch[3]) : today.getFullYear();
        if (year < 100) year += 2000;
        dateMatched = true;
      }
    }

    if (dateMatched) {
      // Validate date parts
      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const parsedDate = new Date(year, month - 1, day);
        if (parsedDate.getFullYear() === year && parsedDate.getMonth() === month - 1 && parsedDate.getDate() === day) {
          datePart = parsedDate;
        }
      }
    }
  }

  if (!datePart) {
    return null;
  }

  // Now, let's extract time if present in the string
  // Match HH:mm:ss or HH:mm or H:mm
  const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  let hour = 0;
  let minute = 0;
  let hasTime = false;

  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
    hasTime = true;
    
    // Handle AM/PM or sáng/tối
    const afterTime = raw.slice(timeMatch.index! + timeMatch[0].length).toLowerCase();
    const beforeTime = raw.slice(0, timeMatch.index).toLowerCase();
    const isPM = afterTime.includes("pm") || afterTime.includes("tối") || afterTime.includes("chiều") ||
                 beforeTime.includes("tối") || beforeTime.includes("chiều");
    const isAM = afterTime.includes("am") || afterTime.includes("sáng") || beforeTime.includes("sáng");
    
    if (isPM && hour < 12) {
      hour += 12;
    } else if (isAM && hour === 12) {
      hour = 0;
    }
  } else {
    // Check for simple hour like "8h", "8h30", "8 giờ"
    const wordTimeMatch = raw.match(/\b(\d{1,2})\s*(?:h|giờ)\s*(\d{2})?\b/i);
    if (wordTimeMatch) {
      hour = Number(wordTimeMatch[1]);
      minute = wordTimeMatch[2] ? Number(wordTimeMatch[2]) : 0;
      hasTime = true;

      const afterTime = raw.slice(wordTimeMatch.index! + wordTimeMatch[0].length).toLowerCase();
      const beforeTime = raw.slice(0, wordTimeMatch.index).toLowerCase();
      const isPM = afterTime.includes("pm") || afterTime.includes("tối") || afterTime.includes("chiều") ||
                   beforeTime.includes("tối") || beforeTime.includes("chiều");
      const isAM = afterTime.includes("am") || afterTime.includes("sáng") || beforeTime.includes("sáng");
      
      if (isPM && hour < 12) {
        hour += 12;
      } else if (isAM && hour === 12) {
        hour = 0;
      }
    } else {
      // Check for standalone hour with am/pm or sáng/tối e.g., "8pm", "8 tối", "8 sáng"
      const ampmHourMatch = raw.match(/\b(\d{1,2})\s*(am|pm|sáng|tối|chiều)\b/i);
      if (ampmHourMatch) {
        hour = Number(ampmHourMatch[1]);
        minute = 0;
        hasTime = true;
        const period = ampmHourMatch[2].toLowerCase();
        const isPM = period === "pm" || period === "tối" || period === "chiều";
        const isAM = period === "am" || period === "sáng";

        if (isPM && hour < 12) {
          hour += 12;
        } else if (isAM && hour === 12) {
          hour = 0;
        }
      }
    }
  }

  const dateStr = `${datePart.getFullYear()}-${pad2(datePart.getMonth() + 1)}-${pad2(datePart.getDate())}`;

  if (hasTime && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
    return `${dateStr}T${pad2(hour)}:${pad2(minute)}`;
  }

  // If no valid time was parsed, return just the date
  return dateStr;
}


function parseLunarInput(args: Record<string, any>, fallbackText = ""): { day: number; month: number; year: number; isLeap: boolean } | null {
  const todayLunar = solarToLunar(new Date());
  const directDay = Number(args.lunar_day ?? args.day);
  const directMonth = Number(args.lunar_month ?? args.month);
  const directYear = Number(args.lunar_year ?? args.year ?? todayLunar.year);
  const directLeap = normalizeBoolean(args.is_lunar_leap ?? args.isLeap, false);

  if (Number.isInteger(directDay) && Number.isInteger(directMonth) && Number.isInteger(directYear)) {
    if (directDay >= 1 && directDay <= 30 && directMonth >= 1 && directMonth <= 12 && directYear >= 1900 && directYear <= 2100) {
      return { day: directDay, month: directMonth, year: directYear, isLeap: directLeap };
    }
  }

  const raw = String(args.date || args.lunar_date || fallbackText || "").trim();
  const match = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : todayLunar.year;
  if (year < 100) year += 2000;
  if (day < 1 || day > 30 || month < 1 || month > 12 || year < 1900 || year > 2100) return null;
  return { day, month, year, isLeap: raw.toLowerCase().includes("nhuận") || raw.toLowerCase().includes("nhuan") };
}

function formatList(items: string[], emptyText: string): string {
  if (items.length === 0) return emptyText;
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

async function buildNotebookContext(includeMemory: boolean): Promise<string> {
  try {
    const [notes, tasks, logs] = await Promise.all([
      getNotes(),
      getTasks(),
      getActivityLogs()
    ]);

    const today = todayIsoDate();
    const recentNotes = notes
      .filter((note) => note.title !== "USER.md" && note.title !== "MEMORY.md" && note.is_locked !== 1)
      .slice(0, 6)
      .map(
        (note) =>
          `${note.title} (${note.type}, cập nhật ${formatDateTime(note.updated_at)}): ${compactText(note.content, 260)}`
      );

    const todayTasks = tasks
      .filter((task) => task.status !== "done" && (!task.due_date || task.due_date <= today))
      .slice(0, 8)
      .map(
        (task) =>
          `${task.title} [${task.status}, ${task.priority}${task.due_date ? `, hạn ${task.due_date}` : ""}]`
      );

    const recentActivity = logs
      .slice(0, 8)
      .map((log) => `${formatDateTime(log.created_at)} - ${log.action}: ${compactText(log.description, 180)}`);

    const userNote = includeMemory
      ? notes.find((note) => note.title === "USER.md" && note.is_locked !== 1)
      : null;
    const memoryNote = includeMemory
      ? notes.find((note) => note.title === "MEMORY.md" && note.is_locked !== 1)
      : null;

    return [
      "[LOCAL NOTEBOOK CONTEXT - redacted & minified snippets only]",
      `Current Date: ${today}`,
      `Overview: ${notes.length} notes, ${tasks.length} tasks, ${logs.length} activity logs.`,
      "",
      "[USER.md]",
      userNote ? compactText(userNote.content, 1200) : "No USER.md found or note is locked.",
      "",
      "[MEMORY.md]",
      memoryNote ? compactText(memoryNote.content, 1400) : "No MEMORY.md found or note is locked.",
      "",
      "[RECENT NOTES]",
      formatList(recentNotes, "No recent notes."),
      "",
      "[TODAY / OVERDUE TASKS]",
      formatList(todayTasks, "No open overdue/today tasks."),
      "",
      "[RECENT ACTIVITY]",
      formatList(recentActivity, "No recent activity log.")
    ].join("\n");
  } catch (err) {
    console.error("[AIService] Failed to build local notebook context:", err);
    return "[LOCAL NOTEBOOK CONTEXT]\nFailed to load local data this turn.";
  }
}

function buildSystemPrompt(localContext: string): string {
  const now = new Date().toLocaleString("vi-VN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const toolGuide = AGENT_TOOLS.map(
    (tool) => `- ${tool.name}: ${tool.description}`
  ).join("\n");

  return [
    "You are Notebook Agent, an advanced AI assistant running in Personal AI Work Notebook.",
    "Always reply in Vietnamese. Be pragmatic, concise, and provide clear actionable steps when necessary.",
    "",
    "[OPERATING PRINCIPLES]",
    "- Prioritize using local notebook data before guessing.",
    "- For time-sensitive or factual information (news, prices, laws, software versions, schedules, or web data), use web_search/web_extract before concluding.",
    "- You are allowed to create notes, tasks, or important dates when explicitly requested. If required fields are missing, ask at most one short question.",
    "- After creating data via tools, clearly state what was created, the ID, and main fields. Do not claim to have created it if the tool hasn't successfully executed.",
    "- Do not delete or modify data unless explicitly requested by the user.",
    "- Do not leak API keys, tokens, passwords, or secrets. If you see a secret in the context, redact it.",
    "- You are allowed to call web_search multiple times (with different keywords) if data is insufficient or errors occur, but the final result must be highly accurate, curated, and well-synthesized.",
    "- Stop searching and conclude immediately if you are certain the data/event does not exist. STRICTLY DO NOT loop search tools uselessly if you know there are no results.",
    "- When providing dangerous commands (rm -rf, drop database, kubectl delete, terraform destroy, git reset --hard), clearly warn about the risks.",
    "- If lacking data to do the task correctly, ask at most one short question. If a reasonable assumption can be made, state the assumption and proceed.",
    "- When the user asks about relative dates, use specific dates. Current system time: " + now + ".",
    "",
    "[AVAILABLE NOTEBOOK TOOLS]",
    toolGuide,
    "",
    "[HOW TO CALL TOOLS WHEN MODEL LACKS NATIVE TOOL SUPPORT]",
    'Use exact XML format one or multiple times: <invoke name="tool_name"><parameter name="query">...</parameter></invoke>',
    "After receiving tool results, synthesize them into the final answer. Do not show XML tool calls to the user.",
    "",
    localContext
  ].join("\n");
}

async function searchWeb(query: string): Promise<string> {
  const cfg = getSearchConfig();
  if (cfg.provider === "google" && cfg.googleApiKey?.trim() && cfg.googleCx?.trim()) {
    return await searchWebGoogle(query, cfg.googleApiKey, cfg.googleCx);
  }
  if (cfg.provider === "tavily" && cfg.apiKey.trim()) {
    return await searchWebTavily(query, cfg.apiKey);
  }

  try {
    return await searchWebDuckDuckGo(query);
  } catch (err) {
    console.warn("[WebSearch] DuckDuckGo Lite failed, falling back to SearXNG.", err);
    return await searchWebSearXNG(query);
  }
}

async function searchWebSearXNG(query: string): Promise<string> {
  const instances = [
    "https://searx.be/search",
    "https://baresearch.org/search",
    "https://searx.priv.no/search",
    "https://search.disclosure.gdn/search"
  ];

  let lastError: unknown = null;
  for (const instance of instances) {
    try {
      const targetUrl = `${instance}?q=${encodeURIComponent(query)}&format=json&categories=general`;
      const response = await safeFetch(targetUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        throw new Error(`SearXNG HTTP ${response.status}`);
      }

      const data = await readJsonResponse(response, "SearXNG");
      const results = data.results || [];
      if (results.length > 0) {
        return results
          .slice(0, 5)
          .map(
            (result: any, index: number) =>
              `[Result ${index + 1}]\nTitle: ${compactText(result.title || "No title", 180)}\nLink: ${
                result.url || ""
              }\nSnippet: ${compactText(result.content || "", 700)}`
          )
          .join("\n\n");
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Không tìm được gateway SearXNG khả dụng.");
}

async function searchWebGoogle(query: string, apiKey: string, cx: string): Promise<string> {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey.trim()}&cx=${cx.trim()}&q=${encodeURIComponent(
      query
    )}`;
    const response = await safeFetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Google API HTTP ${response.status}`);
    }

    const data = await readJsonResponse(response, "Google Search");
    const items = data.items || [];
    if (items.length === 0) return "No results found on Google.";

    return items
      .slice(0, 5)
      .map(
        (item: any, index: number) =>
          `[Result ${index + 1}]\nTitle: ${compactText(item.title, 180)}\nLink: ${item.link}\nSnippet: ${compactText(
            item.snippet || "",
            700
          )}`
      )
      .join("\n\n");
  } catch (err) {
    console.warn("[WebSearch] Google failed, falling back to DuckDuckGo Lite.", err);
    return await searchWebDuckDuckGo(query);
  }
}

async function searchWebTavily(query: string, apiKey: string): Promise<string> {
  try {
    const response = await safeFetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey.trim(),
        query,
        search_depth: "basic",
        max_results: 5
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily HTTP ${response.status}`);
    }

    const data = await readJsonResponse(response, "Tavily");
    const results = data.results || [];
    if (results.length === 0) return "No related results found on Tavily.";

    return results
      .slice(0, 5)
      .map(
        (result: any, index: number) =>
          `[Result ${index + 1}]\nTitle: ${compactText(result.title, 180)}\nLink: ${
            result.url
          }\nSnippet: ${compactText(result.content || "", 900)}`
      )
      .join("\n\n");
  } catch (err) {
    console.warn("[WebSearch] Tavily failed, falling back to DuckDuckGo Lite.", err);
    return await searchWebDuckDuckGo(query);
  }
}

async function searchWebDuckDuckGo(query: string): Promise<string> {
  const targetUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const response = await safeFetch(targetUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://lite.duckduckgo.com/"
    }
  });

  if (!response.ok) {
    return `Lỗi kết nối DuckDuckGo: HTTP ${response.status}`;
  }

  const html = await response.text();
  const results: { title: string; link: string; snippet: string }[] = [];
  const resultRegex =
    /<a\s+[^>]*href=(["'])(.*?)\1[^>]*class=(["'])result-link\3[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class=(["'])result-snippet\5[^>]*>([\s\S]*?)<\/td>/g;

  let match: RegExpExecArray | null;
  while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
    let rawUrl = match[2];
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) rawUrl = decodeURIComponent(uddgMatch[1]);
    if (rawUrl.startsWith("//")) rawUrl = `https:${rawUrl}`;

    results.push({
      title: decodeHtml(match[4].replace(/<[^>]*>/g, "").trim()),
      link: rawUrl,
      snippet: decodeHtml(match[6].replace(/<[^>]*>/g, "").trim())
    });
  }

  if (results.length === 0) {
    return "No related results found on DuckDuckGo.";
  }

  return results
    .map(
      (result, index) =>
        `[Result ${index + 1}]\nTitle: ${compactText(result.title, 180)}\nLink: ${result.link}\nSnippet: ${compactText(
          result.snippet,
          700
        )}`
    )
    .join("\n\n");
}

async function extractWebContent(url: string): Promise<string> {
  try {
    const response = await safeFetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });

    if (!response.ok) {
      return `Lỗi tải trang web: HTTP ${response.status}`;
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]*>/g, "").trim()) : "Không có tiêu đề";

    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

    const mainMatch =
      cleanHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
      cleanHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    const contentArea = mainMatch ? mainMatch[1] : cleanHtml;
    const text = decodeHtml(contentArea.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

    return `Source URL: ${url}\nPage Title: ${compactText(title, 220)}\n\nMain Content:\n${compactText(text, 6000)}`;
  } catch (err: any) {
    console.error("[WebExtract] Failed:", err);
    return `Lỗi trích xuất nội dung trang web: ${err.message || err}`;
  }
}

function decodeHtml(text: string): string {
  if (typeof document !== "undefined") {
    const element = document.createElement("textarea");
    element.innerHTML = text;
    return element.value;
  }

  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function searchLocalNotesTool(args: Record<string, any>): Promise<string> {
  const query = String(args.query || "").trim();
  const limit = Number(args.limit || 6);
  const notes = query ? await searchNotes(query) : await getNotes();
  const visibleNotes = notes.filter((note) => note.is_locked !== 1).slice(0, limit);

  if (visibleNotes.length === 0) {
    return query ? `No notes found matching "${query}".` : "No notes available to display.";
  }

  return visibleNotes
    .map(
      (note, index) =>
        `[Note ${index + 1}]\nID: ${note.id}\nTitle: ${note.title}\nType: ${note.type}\nUpdated: ${formatDateTime(
          note.updated_at
        )}\nSnippet: ${compactText(note.content, 900)}`
    )
    .join("\n\n");
}

async function searchLocalTasksTool(args: Record<string, any>): Promise<string> {
  const query = String(args.query || "").trim();
  const status = String(args.status || "").trim();
  const limit = Number(args.limit || 10);
  let tasks = query ? await searchTasks(query) : await getTasks();

  if (status) {
    tasks = tasks.filter((task) => task.status === status);
  }

  const visibleTasks = tasks.slice(0, limit);
  if (visibleTasks.length === 0) {
    return query || status ? "No matching tasks found." : "No tasks available.";
  }

  return visibleTasks
    .map(
      (task, index) =>
        `[Task ${index + 1}]\nID: ${task.id}\nTitle: ${task.title}\nStatus: ${task.status}\nPriority: ${
          task.priority
        }\nDue: ${task.due_date || "none"}\nSource: ${task.source}${
          task.external_id ? ` (${task.external_id})` : ""
        }\nUpdated: ${formatDateTime(task.updated_at)}`
    )
    .join("\n\n");
}

async function getTodayBriefTool(): Promise<string> {
  const [tasks, logs] = await Promise.all([getTasks(), getActivityLogs()]);
  const today = todayIsoDate();
  const dueTasks = tasks.filter((task) => task.status !== "done" && (!task.due_date || task.due_date <= today));
  const doneToday = tasks.filter(
    (task) => task.status === "done" && typeof task.updated_at === "string" && task.updated_at.startsWith(today)
  );
  const activityToday = logs.filter((log) => log.created_at?.startsWith(today)).slice(0, 20);

  return [
    `Date: ${today}`,
    "",
    "[Tasks to do]",
    formatList(
      dueTasks.slice(0, 12).map((task) => `${task.title} [${task.status}, ${task.priority}]`),
      "No open overdue/today tasks."
    ),
    "",
    "[Tasks done today]",
    formatList(
      doneToday.slice(0, 12).map((task) => task.title),
      "No tasks completed today."
    ),
    "",
    "[Today Activity]",
    formatList(
      activityToday.map((log) => `${formatDateTime(log.created_at)} - ${log.action}: ${compactText(log.description, 220)}`),
      "No activity today."
    )
  ].join("\n");
}

async function getRecentActivityTool(args: Record<string, any>): Promise<string> {
  const limit = Number(args.limit || 20);
  const logs = (await getActivityLogs()).slice(0, limit);
  if (logs.length === 0) return "Chưa có activity log.";

  return logs
    .map(
      (log, index) =>
        `[Log ${index + 1}] ${formatDateTime(log.created_at)} - ${log.target_type}/${log.action}: ${compactText(
          log.description,
          320
        )}`
    )
    .join("\n");
}

async function createLocalNoteTool(args: Record<string, any>): Promise<string> {
  const title = String(args.title || "").trim();
  const content = String(args.content || args.body || "").trim();
  const type = normalizeNoteType(args.type);

  if (!title) {
    return "Thiếu tiêu đề note. Hãy cung cấp title.";
  }

  const note: Note = {
    id: makeLocalId("note"),
    workspace_id: null,
    project_id: null,
    title,
    content,
    type,
    is_locked: 0,
    is_pending_sync: 1
  };

  await createNote(note);
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("notes-updated"));
  }
  return `Created note.\nID: ${note.id}\nTitle: ${note.title}\nType: ${note.type}\nContent: ${compactText(note.content || "(empty)", 900)}`;
}

async function createLocalTaskTool(args: Record<string, any>): Promise<string> {
  const title = String(args.title || "").trim();
  const dueDate = parseDateInput(args.due_date || args.dueDate || args.date);

  if (!title) {
    return "Thiếu tiêu đề task. Hãy cung cấp title.";
  }

  const task: Task = {
    id: makeLocalId("task"),
    note_id: args.note_id ? String(args.note_id) : null,
    title,
    status: normalizeTaskStatus(args.status),
    priority: normalizeTaskPriority(args.priority),
    due_date: dueDate,
    workspace_id: null,
    project_id: null,
    source: "local",
    external_id: null,
    external_url: null,
    external_status: null,
    is_pending_sync: 1
  };

  await createTask(task);
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("task-updated"));
  }
  return [
    "Created task.",
    `ID: ${task.id}`,
    `Title: ${task.title}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    `Due: ${task.due_date || "none"}`
  ].join("\n");
}

async function searchImportantDatesTool(args: Record<string, any>): Promise<string> {
  const query = String(args.query || "").trim().toLowerCase();
  const limit = Number(args.limit || 12);
  let events = await getCalendarEvents();

  if (query) {
    events = events.filter((event) => {
      const haystack = `${event.title} ${event.event_type} ${event.notes || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  const visibleEvents = events.slice(0, limit);
  if (visibleEvents.length === 0) {
    return query ? `No important dates found matching "${query}".` : "No important dates created by you yet.";
  }

  return visibleEvents
    .map((event, index) => {
      const dateText =
        event.date_type === "lunar"
          ? `Lunar ${event.lunar_day}/${event.lunar_month}${event.lunar_year ? `/${event.lunar_year}` : ""}${event.is_lunar_leap ? " leap" : ""}`
          : `Solar ${event.solar_date || "unknown"}`;

      return [
        `[Date ${index + 1}]`,
        `ID: ${event.id}`,
        `Title: ${event.title}`,
        `Type: ${event.event_type}`,
        `Date: ${dateText}`,
        `Yearly repeat: ${event.repeat_yearly ? "yes" : "no"}`,
        `Important: ${event.is_important ? "yes" : "no"}`,
        event.notes ? `Notes: ${compactText(event.notes, 500)}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

async function createImportantDateTool(args: Record<string, any>): Promise<string> {
  const title = String(args.title || args.name || "").trim();
  if (!title) {
    return "Thiếu tên ngày quan trọng. Hãy cung cấp title.";
  }

  const dateType = normalizeCalendarDateType(args.date_type || args.dateType, `${title} ${args.date || ""}`);
  const repeatYearly = normalizeBoolean(args.repeat_yearly ?? args.repeatYearly, true);
  const notes = String(args.notes || args.note || "").trim() || null;
  const eventType = normalizeCalendarEventType(args.event_type || args.eventType, title);
  let solarDate: string | null = null;
  let lunarDay: number | null = null;
  let lunarMonth: number | null = null;
  let lunarYear: number | null = null;
  let isLunarLeap = 0;

  if (dateType === "solar") {
    solarDate = parseDateInput(args.solar_date || args.solarDate || args.date);
    if (!solarDate) {
      return "Ngày dương lịch không hợp lệ. Hãy dùng định dạng YYYY-MM-DD hoặc DD/MM/YYYY.";
    }

    const solar = new Date(`${solarDate}T12:00:00`);
    const lunar = solarToLunar(solar);
    lunarDay = lunar.day;
    lunarMonth = lunar.month;
    lunarYear = lunar.year;
    isLunarLeap = lunar.isLeap ? 1 : 0;
  } else {
    const lunar = parseLunarInput(args, `${title} ${args.date || ""}`);
    if (!lunar) {
      return "Ngày âm lịch không hợp lệ. Hãy cung cấp lunar_day/lunar_month/lunar_year hoặc ngày dạng DD/MM/YYYY.";
    }

    lunarDay = lunar.day;
    lunarMonth = lunar.month;
    lunarYear = repeatYearly ? null : lunar.year;
    isLunarLeap = lunar.isLeap ? 1 : 0;
    solarDate = repeatYearly ? null : toLocalDateKey(lunarToSolar(lunar.day, lunar.month, lunar.year, lunar.isLeap));
  }

  const event: CalendarEvent = {
    id: makeLocalId("cal"),
    title,
    event_type: eventType,
    date_type: dateType,
    solar_date: solarDate,
    lunar_day: lunarDay,
    lunar_month: lunarMonth,
    lunar_year: lunarYear,
    is_lunar_leap: isLunarLeap,
    repeat_yearly: repeatYearly ? 1 : 0,
    is_important: normalizeBoolean(args.is_important ?? args.isImportant, true) ? 1 : 0,
    notes
  };

  await createCalendarEvent(event);
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("calendar-updated"));
  }
  const dateText =
    event.date_type === "lunar"
      ? `Lunar ${event.lunar_day}/${event.lunar_month}${event.lunar_year ? `/${event.lunar_year}` : ""}${event.is_lunar_leap ? " leap" : ""}`
      : `Solar ${event.solar_date}`;

  return [
    "Created important date.",
    `ID: ${event.id}`,
    `Title: ${event.title}`,
    `Type: ${event.event_type}`,
    `Date: ${dateText}`,
    `Yearly repeat: ${event.repeat_yearly ? "yes" : "no"}`
  ].join("\n");
}

const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "search_notes",
    description: "Search local notes by title or content. Use this when the user asks about saved notes, commands, prompts, or fixed errors.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query. Leave empty to fetch recent notes." },
        limit: { type: "number", description: "Maximum number of results, default 6." }
      }
    },
    execute: searchLocalNotesTool
  },
  {
    name: "create_note",
    description: "Create a new local note when explicitly requested by the user. Do not use this tool if the user is only asking a question or previewing.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the note." },
        content: { type: "string", description: "Content of the note. Can be empty if the user only provides a title." },
        type: {
          type: "string",
          enum: ["quick", "command", "workflow", "error_fix", "prompt"],
          description: "Type of the note, default is quick."
        }
      },
      required: ["title"]
    },
    execute: createLocalNoteTool
  },
  {
    name: "search_tasks",
    description: "Search local tasks, filter by status if needed.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Task search query. Leave empty to fetch recent tasks." },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "blocked", "done"],
          description: "Task status to filter."
        },
        limit: { type: "number", description: "Maximum number of results, default 10." }
      }
    },
    execute: searchLocalTasksTool
  },
  {
    name: "create_task",
    description: "Create a new local task when explicitly requested by the user.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the task." },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority, default is medium."
        },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "blocked", "done"],
          description: "Status, default is todo."
        },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD HH:mm, YYYY-MM-DD, DD/MM/YYYY HH:mm, today, or tomorrow." },
        note_id: { type: "string", description: "Related note ID if any." }
      },
      required: ["title"]
    },
    execute: createLocalTaskTool
  },
  {
    name: "search_important_dates",
    description: "Read/search for important dates saved in the user's calendar.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query by name, type, or notes. Can be empty." },
        limit: { type: "number", description: "Maximum number of results, default 12." }
      }
    },
    execute: searchImportantDatesTool
  },
  {
    name: "create_important_date",
    description: "Create an important date in the calendar when explicitly requested, e.g., birthday, holiday, anniversary.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Name of the important date." },
        event_type: {
          type: "string",
          enum: ["birthday", "holiday", "anniversary", "other"],
          description: "Event type. Infer if unsure."
        },
        date_type: {
          type: "string",
          enum: ["solar", "lunar"],
          description: "'solar' for Gregorian calendar, 'lunar' for Lunar calendar."
        },
        date: { type: "string", description: "Date in YYYY-MM-DD or DD/MM/YYYY. For lunar, also use DD/MM/YYYY or DD/MM." },
        solar_date: { type: "string", description: "Solar date if date_type=solar." },
        lunar_day: { type: "number", description: "Lunar day if date_type=lunar." },
        lunar_month: { type: "number", description: "Lunar month if date_type=lunar." },
        lunar_year: { type: "number", description: "Lunar year if not repeating yearly." },
        is_lunar_leap: { type: "boolean", description: "Is it a leap lunar month." },
        repeat_yearly: { type: "boolean", description: "Does it repeat yearly, default true." },
        is_important: { type: "boolean", description: "Is it marked as important, default true." },
        notes: { type: "string", description: "Additional notes if any." }
      },
      required: ["title"]
    },
    execute: createImportantDateTool
  },
  {
    name: "get_today_brief",
    description: "Get today's brief including overdue tasks, completed tasks, and today's activity from local notebook.",
    parameters: { type: "object", properties: {} },
    execute: async () => await getTodayBriefTool()
  },
  {
    name: "get_recent_activity",
    description: "Read recent activity logs from the local notebook.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of logs, default 20." }
      }
    },
    execute: getRecentActivityTool
  },
  {
    name: "web_search",
    description: "Search the web for fresh data, documents, news, prices, schedules, software versions, or any topic outside the notebook.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Web search query." }
      },
      required: ["query"]
    },
    execute: async (args) => await searchWeb(String(args.query || ""))
  },
  {
    name: "web_extract",
    description: "Read the main content of a specific URL after the user provides a link or after web_search finds a source that needs deep reading.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to extract." }
      },
      required: ["url"]
    },
    execute: async (args) => await extractWebContent(String(args.url || ""))
  },
  {
    name: "get_current_time",
    description: "Get the current system time.",
    parameters: { type: "object", properties: {} },
    execute: async () => `Current system time: ${new Date().toLocaleString("vi-VN")}`
  }
];

function getNativeToolSchemas() {
  return AGENT_TOOLS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

function safeParseToolArgs(rawArgs: unknown): Record<string, any> {
  if (!rawArgs) return {};
  if (typeof rawArgs === "object") return rawArgs as Record<string, any>;
  if (typeof rawArgs !== "string") return {};

  try {
    return JSON.parse(rawArgs);
  } catch {
    const args: Record<string, any> = {};
    rawArgs
      .split(/\n|,/)
      .map((part) => part.trim())
      .forEach((part) => {
        const match = part.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
        if (match) args[match[1].trim()] = match[2].trim();
      });
    return args;
  }
}

function normalizeNativeToolCalls(responseMessage: any): AgentToolCall[] {
  const calls: AgentToolCall[] = [];

  if (Array.isArray(responseMessage?.tool_calls)) {
    for (const call of responseMessage.tool_calls) {
      const name = call?.function?.name || call?.name;
      if (!name) continue;
      calls.push({
        id: call.id,
        name,
        args: safeParseToolArgs(call?.function?.arguments ?? call?.arguments)
      });
    }
  }

  if (responseMessage?.function_call?.name) {
    calls.push({
      name: responseMessage.function_call.name,
      args: safeParseToolArgs(responseMessage.function_call.arguments)
    });
  }

  return calls;
}

function parseTextBasedToolCalls(content: string): TextToolCall[] {
  const toolCalls: TextToolCall[] = [];
  const invokeBlockRegex =
    /<\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\s*\/\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*invoke\s*>/gi;

  let match: RegExpExecArray | null;
  while ((match = invokeBlockRegex.exec(content)) !== null) {
    const toolName = match[1].trim();
    const innerContent = match[2];
    const args: Record<string, any> = {};
    const paramRegex =
      /<\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\s*\/\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*parameter\s*>/gi;

    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(innerContent)) !== null) {
      args[paramMatch[1].trim()] = decodeHtml(paramMatch[2].trim());
    }

    toolCalls.push({ name: toolName, args });
  }

  return toolCalls;
}

async function executeToolCall(call: AgentToolCall): Promise<ExecutedToolResult> {
  const tool = AGENT_TOOLS.find((candidate) => candidate.name === call.name);
  if (!tool) {
    return {
      id: call.id,
      name: call.name,
      result: `Không tìm thấy tool "${call.name}".`
    };
  }

  try {
    const result = await tool.execute(call.args || {});
    return {
      id: call.id,
      name: call.name,
      result: compactText(result, MAX_TOOL_RESULT_CHARS)
    };
  } catch (err: any) {
    console.error(`[AIService] Tool ${call.name} failed:`, err);
    return {
      id: call.id,
      name: call.name,
      result: `Tool "${call.name}" lỗi: ${err.message || err}. Hãy thử dùng từ khóa tìm kiếm khác, nguồn khác, hoặc tổng hợp từ các kết quả đã có để có câu trả lời chuẩn xác và chọn lọc nhất.`
    };
  }
}

function toolResultsToPrompt(results: ExecutedToolResult[]): string {
  return results
    .map((item) => `[TOOL RESULT: ${item.name}]\n${item.result}`)
    .join("\n\n---\n\n");
}

function sanitizeFinalContent(content: string): string {
  const withoutToolBlocks = String(content || "")
    .replace(/<\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*tool_calls\s*>[\s\S]*?<\s*\/\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*tool_calls\s*>/gi, "")
    .replace(/<\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*invoke\s+name="[^"]+"\s*>[\s\S]*?<\s*\/\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*invoke\s*>/gi, "")
    .trim();

  return withoutToolBlocks || "Mình đã chạy công cụ nhưng chưa nhận được câu trả lời cuối cùng rõ ràng.";
}

function compactMessages(messages: ChatMessage[]): ChatMessage[] {
  const filtered = messages.filter((message) => message.role === "user" || message.role === "assistant");
  return filtered.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content: compactText(message.content, 5000)
  }));
}

function isProviderToolSchemaError(errorText: string, status: number): boolean {
  const lower = errorText.toLowerCase();
  return (
    status === 400 &&
    (lower.includes("tools") ||
      lower.includes("tool_choice") ||
      lower.includes("function") ||
      lower.includes("unsupported parameter"))
  );
}

async function requestChatCompletion(
  url: string,
  headers: Record<string, string>,
  model: string,
  messages: any[],
  useNativeTools: boolean
): Promise<any> {
  const body: Record<string, any> = {
    model,
    messages,
    temperature: 0.35
  };

  if (useNativeTools) {
    body.tools = getNativeToolSchemas();
    body.tool_choice = "auto";
  }

  const response = await safeFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`AI API error: ${response.status} ${response.statusText} - ${errorText}`);
    (error as any).status = response.status;
    (error as any).isToolSchemaError = isProviderToolSchemaError(errorText, response.status);
    throw error;
  }

  const data = await readJsonResponse(response, "AI API");
  return data.choices?.[0]?.message;
}

function stripVietnameseAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function extractIntentPayload(input: string, keywords: string[]): string {
  const normalized = stripVietnameseAccents(input).toLowerCase();
  const matchedKeyword = keywords.find((keyword) => normalized.includes(keyword));
  if (!matchedKeyword) return "";
  const start = normalized.indexOf(matchedKeyword) + matchedKeyword.length;
  return input
    .slice(start)
    .replace(/^\s*(giúp tôi|giup toi|cho tôi|cho toi|với|voi|là|la|:|-)\s*/i, "")
    .trim();
}

function splitTitleAndContent(payload: string): { title: string; content: string } {
  const clean = payload.trim().replace(/^[:\-\s]+/, "");
  if (!clean) return { title: "", content: "" };

  const contentMatch = clean.match(/(.+?)\s+(?:nội dung|noi dung|content)\s*[:：-]?\s*(.+)$/i);
  if (contentMatch) {
    return { title: contentMatch[1].trim(), content: contentMatch[2].trim() };
  }

  const colonIndex = clean.indexOf(":");
  if (colonIndex > 0) {
    return {
      title: clean.slice(0, colonIndex).trim(),
      content: clean.slice(colonIndex + 1).trim()
    };
  }

  return { title: clean, content: "" };
}

function extractDueDateFromText(text: string): { dueDate: string | null; cleanText: string } {
  const dueMatch = text.match(/\b(?:hạn|han|deadline|due)(?:\s+là|\s+la|\s+ngày|\s+ngay)?\s+([^,.;]+)/i);
  if (dueMatch) {
    return {
      dueDate: parseDateInput(dueMatch[1]),
      cleanText: text.replace(dueMatch[0], "").trim()
    };
  }

  if (/(hôm nay|hom nay|today)/i.test(text)) {
    return { dueDate: parseDateInput("hôm nay"), cleanText: text.replace(/hôm nay|hom nay|today/gi, "").trim() };
  }

  if (/(ngày mai|ngay mai|tomorrow)/i.test(text)) {
    return { dueDate: parseDateInput("ngày mai"), cleanText: text.replace(/ngày mai|ngay mai|tomorrow/gi, "").trim() };
  }

  const dateMatch = text.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/);
  if (dateMatch) {
    return {
      dueDate: parseDateInput(dateMatch[0]),
      cleanText: text.replace(dateMatch[0], "").trim()
    };
  }

  return { dueDate: null, cleanText: text };
}

function extractSearchQuery(input: string, keywords: string[]): string {
  return extractIntentPayload(input, keywords)
    .replace(/^(note|ghi chú|ghi chu|task|việc|viec|ngày quan trọng|ngay quan trong)\s*/i, "")
    .trim();
}

async function tryHandleOfflineNotebookCommand(input: string): Promise<string | null> {
  const normalized = stripVietnameseAccents(input).toLowerCase();

  if (normalized.includes("tao ngay quan trong") || normalized.includes("luu ngay quan trong")) {
    const payload = extractIntentPayload(input, ["tao ngay quan trong", "luu ngay quan trong"]);
    const dateMatch = payload.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/) || payload.match(/\b\d{4}-\d{1,2}-\d{1,2}\b/);
    const date = dateMatch?.[0] || (normalized.includes("hom nay") ? "hôm nay" : normalized.includes("ngay mai") ? "ngày mai" : "");
    const title = payload.replace(dateMatch?.[0] || "", "").replace(/\b(?:âm lịch|am lich|dương lịch|duong lich)\b/gi, "").trim();

    if (!title || !date) {
      return "Mình cần tên và ngày để tạo ngày quan trọng. Ví dụ: `tạo ngày quan trọng Sinh nhật mẹ 20/10/2026`.";
    }

    const result = await createImportantDateTool({
      title,
      date,
      date_type: normalized.includes("am lich") ? "lunar" : "solar",
      event_type: normalizeCalendarEventType("", title),
      repeat_yearly: true,
      is_important: true
    });
    return `[Chế độ offline/mock]\n\n${result}`;
  }

  if (normalized.includes("tao note") || normalized.includes("tao ghi chu")) {
    const payload = extractIntentPayload(input, ["tao ghi chu", "tao note"]);
    const { title, content } = splitTitleAndContent(payload);
    if (!title) {
      return "Mình cần tiêu đề note. Ví dụ: `tạo note Ý tưởng app: nội dung...`.";
    }

    const result = await createLocalNoteTool({ title, content });
    return `[Chế độ offline/mock]\n\n${result}`;
  }

  if (normalized.includes("tao task") || normalized.includes("tao viec")) {
    const payload = extractIntentPayload(input, ["tao task", "tao viec"]);
    const { dueDate, cleanText } = extractDueDateFromText(payload);
    const priority = /ưu tiên cao|uu tien cao|gấp|gap|urgent|quan trọng|quan trong/i.test(payload)
      ? "high"
      : /ưu tiên thấp|uu tien thap/i.test(payload)
        ? "low"
        : "medium";
    const title = cleanText
      .replace(/ưu tiên (cao|thấp|trung bình)|uu tien (cao|thap|trung binh)|gấp|gap|urgent|quan trọng|quan trong/gi, "")
      .replace(/^[:\-\s]+/, "")
      .trim();

    if (!title) {
      return "Mình cần tên task. Ví dụ: `tạo task gọi khách hàng hạn ngày mai ưu tiên cao`.";
    }

    const result = await createLocalTaskTool({ title, due_date: dueDate || "", priority });
    return `[Chế độ offline/mock]\n\n${result}`;
  }

  if (normalized.includes("doc note") || normalized.includes("xem note") || normalized.includes("tim note") || normalized.includes("doc ghi chu")) {
    const query = extractSearchQuery(input, ["doc ghi chu", "doc note", "xem note", "tim note"]);
    const result = await searchLocalNotesTool({ query, limit: 8 });
    return `[Chế độ offline/mock]\n\n${result}`;
  }

  if (normalized.includes("doc task") || normalized.includes("xem task") || normalized.includes("tim task") || normalized.includes("doc viec")) {
    const query = extractSearchQuery(input, ["doc viec", "doc task", "xem task", "tim task"]);
    const result = await searchLocalTasksTool({ query, limit: 12 });
    return `[Chế độ offline/mock]\n\n${result}`;
  }

  if (normalized.includes("doc ngay quan trong") || normalized.includes("xem ngay quan trong") || normalized.includes("tim ngay quan trong")) {
    const query = extractSearchQuery(input, ["doc ngay quan trong", "xem ngay quan trong", "tim ngay quan trong"]);
    const result = await searchImportantDatesTool({ query, limit: 12 });
    return `[Chế độ offline/mock]\n\n${result}`;
  }

  return null;
}

async function getOfflineAgentResponse(
  chatMessages: ChatMessage[],
  includeMemory: boolean,
  onStatus?: (status: string) => void
): Promise<string> {
  const lastUserMsg = [...chatMessages].reverse().find((message) => message.role === "user")?.content || "";
  const lowerPrompt = lastUserMsg.toLowerCase();

  onStatus?.("Đang kiểm tra lệnh notebook...");
  const notebookCommandResult = await tryHandleOfflineNotebookCommand(lastUserMsg);
  if (notebookCommandResult) {
    return notebookCommandResult;
  }

  const needsCurrentWebLookup =
    lowerPrompt.includes("giá vàng") ||
    lowerPrompt.includes("giá bạc") ||
    lowerPrompt.includes("giá bitcoin") ||
    lowerPrompt.includes("tỷ giá") ||
    lowerPrompt.includes("thời tiết") ||
    lowerPrompt.includes("tin mới") ||
    lowerPrompt.includes("hôm nay") && (lowerPrompt.includes("giá") || lowerPrompt.includes("tìm"));

  if (needsCurrentWebLookup) {
    onStatus?.("Đang tìm kiếm web...");
    const webResults = await searchWeb(lastUserMsg);
    return [
      "[Chế độ offline/mock - chưa cấu hình AI API]",
      "",
      "Mình chưa có model AI để tổng hợp sâu, nhưng đã chạy web search cho truy vấn thời sự/giá cả này:",
      "",
      webResults,
      "",
      "Khi cấu hình AI API trong Settings, agent sẽ tự đọc các nguồn này và trả lời thành bản tóm tắt gọn hơn."
    ].join("\n");
  }

  onStatus?.("Đang đọc dữ liệu local...");
  const todayBrief = await getTodayBriefTool();

  if (lowerPrompt.includes("tổng hợp ngày") || lowerPrompt.includes("việc hôm nay")) {
    return [
      "[Chế độ offline/mock - chưa cấu hình AI API]",
      "",
      "Mình có thể đọc dữ liệu local và tóm tắt nhanh như sau:",
      "",
      todayBrief,
      "",
      "Để agent suy luận sâu, gọi web và dùng tool loop đầy đủ, hãy cấu hình API Base URL, Model Name và API Key trong Settings."
    ].join("\n");
  }

  onStatus?.("Đang đọc ngữ cảnh notebook...");
  const context = await buildNotebookContext(includeMemory);
  return [
    "[Chế độ offline/mock - chưa cấu hình AI API]",
    "",
    "Agent đã sẵn sàng với các năng lực: đọc/tạo note, đọc/tạo task, đọc/tạo ngày quan trọng, tìm kiếm web và ghi nhớ dài hạn. Khi chưa có API model thật, các lệnh tạo/đọc cơ bản vẫn chạy bằng parser offline.",
    "",
    context
  ].join("\n");
}

export async function askAI(
  chatMessages: ChatMessage[],
  bypassMemory = false,
  onStatus?: (status: string) => void
): Promise<string> {
  const { baseUrl, modelName, apiKey } = getAIConfig();
  const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") || baseUrl.includes("::1");

  if (!baseUrl.trim() || !modelName.trim()) {
    onStatus?.("Đang chạy chế độ offline...");
    return await getOfflineAgentResponse(chatMessages, !bypassMemory, onStatus);
  }

  if (!isLocal && !apiKey.trim()) {
    onStatus?.("Đang chạy chế độ offline...");
    return await getOfflineAgentResponse(chatMessages, !bypassMemory, onStatus);
  }

  const url = normalizeApiUrl(baseUrl);
  const headers = getApiHeaders(apiKey);
  onStatus?.("Đang đọc ngữ cảnh notebook...");
  const localContext = await buildNotebookContext(!bypassMemory);
  const systemMessage: ChatMessage = {
    role: "system",
    content: buildSystemPrompt(localContext)
  };

  const messages: any[] = [systemMessage, ...compactMessages(chatMessages)];
  let useNativeTools = true;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    onStatus?.(round === 0 ? "Đang suy nghĩ..." : "Đang tổng hợp kết quả công cụ...");
    let responseMessage: any;
    try {
      responseMessage = await requestChatCompletion(url, headers, modelName.trim(), messages, useNativeTools);
    } catch (err: any) {
      if (useNativeTools && err?.isToolSchemaError) {
        console.warn("[AIService] Provider rejected native tools. Retrying with text-based tool protocol.");
        useNativeTools = false;
        responseMessage = await requestChatCompletion(url, headers, modelName.trim(), messages, false);
      } else {
        throw new Error(`Lỗi kết nối tới AI API: ${err.message || err}`);
      }
    }

    if (!responseMessage) {
      return "Không nhận được phản hồi từ AI.";
    }

    const nativeToolCalls = normalizeNativeToolCalls(responseMessage);
    if (nativeToolCalls.length > 0) {
      onStatus?.(`Đang chạy ${nativeToolCalls.length} công cụ...`);
      const results = await Promise.all(nativeToolCalls.map(executeToolCall));
      messages.push(responseMessage);

      for (const result of results) {
        if (result.id) {
          messages.push({
            role: "tool",
            tool_call_id: result.id,
            name: result.name,
            content: result.result
          });
        } else {
          messages.push({
            role: "user",
            content: `[TOOL RESULT: ${result.name}]\n${result.result}`
          });
        }
      }
      continue;
    }

    const rawContent = responseMessage.content || "";
    const textToolCalls = parseTextBasedToolCalls(rawContent);
    if (textToolCalls.length > 0) {
      onStatus?.(`Đang chạy ${textToolCalls.length} công cụ...`);
      const results = await Promise.all(
        textToolCalls.map((call) => executeToolCall({ name: call.name, args: call.args }))
      );
      messages.push({ role: "assistant", content: rawContent });
      messages.push({
        role: "user",
        content: `${toolResultsToPrompt(results)}\n\nHãy dùng kết quả tool để trả lời câu hỏi gốc. Không hiển thị XML tool call.`
      });
      continue;
    }

    return sanitizeFinalContent(rawContent);
  }

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const lastToolMsg = [...messages].reverse().find((message) => message.role === "tool" || (message.role === "user" && message.content.includes("[TOOL RESULT")));
  
  let fallbackText = "Mình đã chạy nhiều vòng tool nhưng model chưa đưa ra câu trả lời cuối cùng.";
  if (lastToolMsg) {
    fallbackText += "\n\nKết quả tool cuối cùng:\n" + lastToolMsg.content;
  }

  return sanitizeFinalContent(
    lastAssistant?.content || fallbackText
  );
}

async function callMemoryExtractionModel(prompt: string): Promise<string> {
  const { baseUrl, modelName, apiKey } = getAIConfig();
  const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") || baseUrl.includes("::1");
  if (!baseUrl.trim() || !modelName.trim() || (!isLocal && !apiKey.trim())) {
    return "NONE";
  }

  const response = await safeFetch(normalizeApiUrl(baseUrl), {
    method: "POST",
    headers: getApiHeaders(apiKey),
    body: JSON.stringify({
      model: modelName.trim(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    return "NONE";
  }

  const data = await readJsonResponse(response, "AI memory extraction API");
  return (data.choices?.[0]?.message?.content || "").trim();
}

function parseMemoryExtraction(output: string): { category: "USER" | "TECH"; fact: string } | null {
  const clean = output.trim();
  if (!clean || clean.toUpperCase() === "NONE" || clean.toUpperCase().includes("NONE")) return null;

  try {
    const parsed = JSON.parse(clean);
    const category = String(parsed.category || "").toUpperCase();
    const fact = String(parsed.fact || "").trim();
    if ((category === "USER" || category === "TECH") && fact) {
      return { category, fact };
    }
  } catch {
    // Support older USER:/TECH: text outputs.
  }

  const match = clean.match(/^(USER|TECH)\s*:\s*(.+)$/is);
  if (!match) return null;

  const category = match[1].toUpperCase() as "USER" | "TECH";
  const fact = match[2].replace(/^[-\s*]+/, "").trim();
  return fact ? { category, fact } : null;
}

async function appendFactToMemoryNote(category: "USER" | "TECH", fact: string): Promise<void> {
  const notes = await getNotes();
  const title = category === "USER" ? "USER.md" : "MEMORY.md";
  const target = notes.find((note) => note.title === title);
  const normalizedFact = compactText(fact.replace(/^[-\s*]+/, "").trim(), 500);
  if (!normalizedFact) return;

  if (target) {
    const currentContent = target.content || "";
    if (currentContent.toLowerCase().includes(normalizedFact.toLowerCase())) return;
    const newContent = `${currentContent.trim()}\n\n- ${normalizedFact}\n`;
    await updateNote(target.id, target.title, newContent, target.type, 1);
  } else {
    const isUser = category === "USER";
    const header = isUser
      ? "# USER.md\n*Bộ nhớ thông tin cá nhân của người dùng.*"
      : "# MEMORY.md\n*Bộ nhớ kỹ thuật, cấu hình và quy ước dự án.*";

    await createNote({
      id: isUser ? "hermes-user-md" : "hermes-memory-md",
      workspace_id: "personal",
      project_id: null,
      title,
      content: `${header}\n\n- ${normalizedFact}\n`,
      type: "quick",
      is_locked: 0,
      is_pending_sync: 1
    });
  }
}

export async function extractAndSaveMemory(userText: string, aiText: string): Promise<void> {
  if (userText.trim().length < 3 || aiText.trim().length < 3) return;

  try {
    const extractionPrompt = [
      "Phân tích hội thoại sau và trích xuất đúng 1 thông tin đáng nhớ lâu dài nếu có.",
      "Chỉ lưu thông tin bền vững về người dùng, sở thích, công ty, quy ước làm việc, cấu hình kỹ thuật, lỗi/cách xử lý quan trọng.",
      "Không lưu câu hỏi thoáng qua, dữ liệu nhạy cảm, API key, password, token hoặc nội dung có thể gây hại.",
      'Trả về JSON {"category":"USER|TECH","fact":"..."} hoặc đúng chữ NONE.',
      "",
      `[USER]\n${compactText(userText, 2000)}`,
      "",
      `[AI]\n${compactText(aiText, 2000)}`
    ].join("\n");

    const output = await callMemoryExtractionModel(extractionPrompt);
    const parsed = parseMemoryExtraction(output);
    if (!parsed) return;

    await appendFactToMemoryNote(parsed.category, parsed.fact);
    console.log(`[Memory] Saved ${parsed.category} fact: ${parsed.fact}`);
  } catch (err) {
    console.error("[Memory] Failed to extract and save memory:", err);
  }
}

// Kept for compatibility with older modules that import getDatabase through this service indirectly.
export async function warmUpAIServiceDatabase(): Promise<void> {
  await getDatabase();
}
