// AI Integration Service (supports any OpenAI-Compatible API endpoint like Gemini, OpenAI, Ollama, DeepSeek, etc.)
// Integrated with Chat History Context, Nous-Hermes persistent memory (USER.md & MEMORY.md) in SQLite
// Equipped with Web Search (Google CSE / Tavily AI Search / DuckDuckGo Lite / SearXNG), Web Content Extraction (Scraper), and System Clock tools
// Supports both Native JSON Tool Calls and Text-based XML/DSML Tool Calls

import { getDatabase } from "../database/db";

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

// Get API config from Settings (localStorage)
export function getAIConfig(): AIConfig {
  try {
    const configStr = localStorage.getItem("ai_config");
    if (configStr) {
      return JSON.parse(configStr);
    }
  } catch (err) {
    console.error("Failed to parse AI config:", err);
  }
  // Default values
  return { 
    baseUrl: "https://api.openai.com/v1", 
    modelName: "gpt-3.5-turbo", 
    apiKey: "" 
  };
}

// Get Web Search config from Settings (localStorage)
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

const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
const isDevServer = typeof window !== "undefined" && (
  window.location.hostname === "localhost" || 
  window.location.hostname === "127.0.0.1"
);

// Safe Fetch helper that dynamically uses Tauri HTTP plugin (bypasses CORS on Desktop) or window.fetch (on Web)
// Automatically tunnels absolute requests through Vite Dev Proxy in development to bypass Cloudflare 403 blocks
async function safeFetch(url: string, options: any) {
  const isTargetAbsolute = url.startsWith("http://") || url.startsWith("https://");

  // Clean headers to wipe out browser/tauri specific security tokens to prevent Cloudflare blocks
  const cleanHeaders = { ...(options.headers || {}) };
  
  if (url.includes("duckduckgo.com")) {
    delete cleanHeaders["Origin"];
    delete cleanHeaders["origin"];
    cleanHeaders["Referer"] = "https://lite.duckduckgo.com/";
    cleanHeaders["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  // In development mode, route external APIs through Vite local proxy. 
  // MUST use standard window.fetch instead of tauriFetch to prevent Tauri security scope errors on localhost.
  if (isDevServer && isTargetAbsolute && !url.includes("localhost") && !url.includes("127.0.0.1")) {
    const proxyPath = "/api-proxy";
    const proxyOptions = { ...options };
    proxyOptions.headers = { ...cleanHeaders };
    proxyOptions.headers["x-target-url"] = url;

    console.log(`[SafeFetch] Dev Proxy: Tunneling absolute URL "${url}" via relative "/api-proxy" using window.fetch`);
    return await fetch(proxyPath, proxyOptions);
  }

  // In production mode, use Tauri Native HTTP fetch (Rust backend client) to easily bypass CORS
  if (isTauri && isTargetAbsolute) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    console.log(`[SafeFetch] Production: Fetching absolute URL "${url}" via Tauri HTTP plugin`);
    return await tauriFetch(url, {
      ...options,
      headers: cleanHeaders
    });
  }

  // Standard window.fetch fallback
  console.log(`[SafeFetch] Standard fetch: "${url}"`);
  return await fetch(url, {
    ...options,
    headers: cleanHeaders
  });
}

// Web Search router based on user preferences in settings
async function searchWeb(query: string): Promise<string> {
  const cfg = getSearchConfig();
  if (cfg.provider === "google" && cfg.googleApiKey?.trim() && cfg.googleCx?.trim()) {
    return await searchWebGoogle(query, cfg.googleApiKey, cfg.googleCx);
  }
  if (cfg.provider === "tavily" && cfg.apiKey.trim()) {
    return await searchWebTavily(query, cfg.apiKey);
  }
  
  // Default free search: Try SearXNG first (clean Google JSON results). Fallback to DuckDuckGo Lite POST on failure.
  try {
    return await searchWebSearXNG(query);
  } catch (err) {
    console.warn("[WebSearch] SearXNG free query failed. Attempting DuckDuckGo Lite POST fallback...", err);
    return await searchWebDuckDuckGo(query);
  }
}

// SearXNG Free Meta-Search API integration (combines Google, Bing, DDG results, completely free & no API keys)
async function searchWebSearXNG(query: string): Promise<string> {
  const instances = [
    "https://searx.be/search",
    "https://baresearch.org/search",
    "https://searx.priv.no/search",
    "https://search.disclosure.gdn/search"
  ];

  let lastError = null;
  for (const instance of instances) {
    try {
      console.log(`[WebSearch] Querying SearXNG instance: ${instance} for: "${query}"`);
      const targetUrl = `${instance}?q=${encodeURIComponent(query)}&format=json&categories=general`;
      
      const headers: Record<string, string> = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      };

      const response = await safeFetch(targetUrl, { method: "GET", headers });
      if (!response.ok) {
        throw new Error(`SearXNG HTTP error: ${response.statusText} (${response.status})`);
      }

      const data = await response.json();
      const results = data.results || [];

      if (results.length > 0) {
        console.log(`[WebSearch] SearXNG successfully fetched ${results.length} results from: ${instance}`);
        return results.slice(0, 4).map((r: any, i: number) => 
          `[Kết quả ${i + 1}]\nTiêu đề: ${r.title || "Không có tiêu đề"}\nLink: ${r.url || ""}\nTóm tắt nội dung: ${r.content || ""}`
        ).join("\n\n");
      }
    } catch (err: any) {
      console.warn(`[WebSearch] SearXNG instance failed: ${instance}`, err);
      lastError = err;
    }
  }

  throw lastError || new Error("All SearXNG public gateways are currently busy.");
}

// Google Programmable Search Engine API integration (returns direct Google Search results)
async function searchWebGoogle(query: string, apiKey: string, cx: string): Promise<string> {
  try {
    console.log(`[WebSearch] Querying Google Custom Search API for: "${query}"`);
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey.trim()}&cx=${cx.trim()}&q=${encodeURIComponent(query)}`;
    const response = await safeFetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Google API HTTP error: ${response.statusText} (${response.status})`);
    }

    const data = await response.json();
    const items = data.items || [];

    if (items.length === 0) {
      return "Không tìm thấy kết quả nào trên Google.";
    }

    return items.slice(0, 4).map((item: any, i: number) => 
      `[Kết quả ${i + 1}]\nTiêu đề: ${item.title}\nLink: ${item.link}\nTóm tắt nội dung: ${item.snippet}`
    ).join("\n\n");
  } catch (err: any) {
    console.warn("[WebSearch] Google Custom Search failed. Falling back to DuckDuckGo Lite...", err);
    return await searchWebDuckDuckGo(query);
  }
}

// Tavily AI Search implementation (optimized for AI agents and RAG, clean and fast)
async function searchWebTavily(query: string, apiKey: string): Promise<string> {
  try {
    console.log(`[WebSearch] Querying Tavily Search API for: "${query}"`);
    const response = await safeFetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: apiKey.trim(),
        query: query,
        search_depth: "basic",
        max_results: 4
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily HTTP error: ${response.statusText} (${response.status})`);
    }

    const data = await response.json();
    const results = data.results || [];

    if (results.length === 0) {
      return "Không tìm thấy kết quả nào liên quan trên internet.";
    }

    return results.map((r: any, i: number) => 
      `[Kết quả ${i + 1}]\nTiêu đề: ${r.title}\nLink: ${r.url}\nTóm tắt nội dung: ${r.content}`
    ).join("\n\n");
  } catch (err: any) {
    console.warn("[WebSearch] Tavily API failed. Falling back to DuckDuckGo Lite...", err);
    return await searchWebDuckDuckGo(query);
  }
}

// DuckDuckGo Lite search scraper that uses POST form submission method to bypass WAF/Cloudflare 403 blocks
async function searchWebDuckDuckGo(query: string): Promise<string> {
  const targetUrl = "https://lite.duckduckgo.com/lite/";
  
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": "https://lite.duckduckgo.com/",
    "Cache-Control": "max-age=0"
  };

  try {
    console.log(`[WebSearch] Querying DuckDuckGo Lite (POST scraping method) for: "${query}"`);
    const response = await safeFetch(targetUrl, { 
      method: "POST", 
      headers,
      body: `q=${encodeURIComponent(query)}`
    });
    
    if (!response.ok) {
      return `Lỗi kết nối DuckDuckGo: ${response.statusText} (Mã lỗi HTTP ${response.status})`;
    }

    const html = await response.text();
    const results: { title: string; link: string; snippet: string }[] = [];
    
    const resultRegex = /<a\s+href="([^"]+)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
    
    let match;
    let count = 0;
    while ((match = resultRegex.exec(html)) !== null && count < 4) {
      let rawUrl = match[1];
      if (rawUrl.includes("uddg=")) {
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          rawUrl = decodeURIComponent(uddgMatch[1]);
        }
      }
      
      const title = match[2].replace(/<[^>]*>/g, "").trim();
      const snippet = match[3].replace(/<[^>]*>/g, "").trim();
      results.push({ title, link: rawUrl, snippet });
      count++;
    }
    
    if (results.length === 0) {
      console.warn("[WebSearch] DuckDuckGo Lite primary parse returned empty. Trying fallback parser...");
      const fallbackLinkRegex = /<a\s+href="([^"]+)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/g;
      let fbMatch;
      let fbCount = 0;
      while ((fbMatch = fallbackLinkRegex.exec(html)) !== null && fbCount < 4) {
        let rawUrl = fbMatch[1];
        if (rawUrl.includes("uddg=")) {
          const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
          if (uddgMatch) rawUrl = decodeURIComponent(uddgMatch[1]);
        }
        const title = fbMatch[2].replace(/<[^>]*>/g, "").trim();
        results.push({ title, link: rawUrl, snippet: "Không có tóm tắt." });
        fbCount++;
      }
    }
    
    if (results.length === 0) {
      return "Không tìm thấy kết quả nào liên quan trên DuckDuckGo.";
    }
    
    return results.map((r, i) => `[Kết quả ${i + 1}]\nTiêu đề: ${r.title}\nLink: ${r.link}\nTóm tắt nội dung: ${r.snippet}`).join("\n\n");
  } catch (err: any) {
    console.error("[WebSearch] Search execution failed:", err);
    return `Lỗi thực thi tìm kiếm mạng: ${err.message || err}`;
  }
}

// Extractor that downloads and strips HTML to expose clean full-text from a specific webpage to the AI
async function extractWebContent(url: string): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.google.com/"
  };

  try {
    console.log(`[WebExtract] Extracting content from: "${url}"`);
    const response = await safeFetch(url, { method: "GET", headers });
    
    if (!response.ok) {
      return `Lỗi tải trang web: ${response.statusText}`;
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").trim() : "Không có tiêu đề";

    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

    let contentArea = cleanHtml;
    const mainMatch = cleanHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || 
                       cleanHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                       cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (mainMatch) {
      contentArea = mainMatch[1];
    }

    let text = contentArea
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    if (text.length > 6000) {
      text = text.substring(0, 6000) + "... [Nội dung bị cắt bớt do quá dài]";
    }

    return `URL nguồn: ${url}\nTiêu đề trang: ${title}\n\nNội dung chính trích xuất:\n${text}`;
  } catch (err: any) {
    console.error("[WebExtract] Content extraction failed:", err);
    return `Lỗi trích xuất nội dung trang web: ${err.message || err}`;
  }
}

interface TextToolCall {
  name: string;
  args: Record<string, any>;
}

// Parses custom/alternative XML-like or DSML-like tool calling tags in raw LLM text outputs (supports parallel calls)
function parseTextBasedToolCalls(content: string): TextToolCall[] {
  const toolCalls: TextToolCall[] = [];
  
  const invokeBlockRegex = /<\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\s*\/\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*invoke\s*>/gi;
  
  let match;
  while ((match = invokeBlockRegex.exec(content)) !== null) {
    const toolName = match[1].trim();
    const innerContent = match[2];
    const args: Record<string, any> = {};
    
    const paramRegex = /<\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\s*\/\s*(?:\|\s*\|\s*DSML\s*\|\s*\|\s*)?\s*parameter\s*>/gi;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(innerContent)) !== null) {
      const paramName = paramMatch[1].trim();
      const paramValue = paramMatch[2].trim();
      args[paramName] = paramValue;
    }
    
    toolCalls.push({ name: toolName, args });
  }
  
  return toolCalls;
}

// Call AI API to generate content using OpenAI-Compatible Chat Completions format
// Injects content from USER.md and MEMORY.md SQLite notes as Hermes long-term memory
// Supports native tool call loops AND custom text-based XML/DSML tool call wrappers
export async function askAI(chatMessages: ChatMessage[], bypassMemory = false): Promise<string> {
  const { baseUrl, modelName, apiKey } = getAIConfig();

  // Validate basic config
  if (!baseUrl.trim() || !modelName.trim()) {
    console.warn("[AIService] AI config incomplete. Using mock response.");
    await new Promise(resolve => setTimeout(resolve, 1500));
    const lastUserMsg = [...chatMessages].reverse().find(m => m.role === "user")?.content || "";
    return getMockAIResponse(lastUserMsg);
  }

  const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") || baseUrl.includes("::1");
  if (!isLocal && !apiKey.trim()) {
    console.warn("[AIService] No API Key configured for remote AI. Using mock response.");
    await new Promise(resolve => setTimeout(resolve, 1500));
    const lastUserMsg = [...chatMessages].reverse().find(m => m.role === "user")?.content || "";
    return getMockAIResponse(lastUserMsg);
  }

  // 1. Retrieve USER.md & MEMORY.md content from SQLite database (Hermes Memory)
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  const formattedTime = now.toLocaleDateString('vi-VN', options);

  let systemInstruction = 
    `Bạn là trợ lý AI thông minh tích hợp trong ứng dụng Personal AI Work Notebook.\n` +
    `[THÔNG TIN HỆ THỐNG]:\n` +
    `- Thời gian hiện tại: ${formattedTime}\n\n`;
  
  if (!bypassMemory) {
    try {
      const db = await getDatabase();
      
      // Load USER.md
      const userNotes = (await db.select("SELECT content FROM notes WHERE title = 'USER.md' LIMIT 1")) as any[];
      if (userNotes.length > 0 && userNotes[0].content) {
        systemInstruction += `\n\n[USER PROFILE (USER.md)]:\n${userNotes[0].content}`;
      }
      
      // Load MEMORY.md
      const memoryNotes = (await db.select("SELECT content FROM notes WHERE title = 'MEMORY.md' LIMIT 1")) as any[];
      if (memoryNotes.length > 0 && memoryNotes[0].content) {
        systemInstruction += `\n\n[TECHNICAL CONTEXT (MEMORY.md)]:\n${memoryNotes[0].content}`;
      }
    } catch (dbErr) {
      console.error("[AIService] Failed to load Hermes memory notes from SQLite:", dbErr);
    }
  }

  const systemMessage: ChatMessage = {
    role: "system",
    content: systemInstruction
  };

  const finalMessages = [systemMessage, ...chatMessages];

  // Map custom URL to standard completions endpoint
  let customUrl = baseUrl.trim();
  if (!customUrl.endsWith("/chat/completions")) {
    customUrl = customUrl.endsWith("/") 
      ? `${customUrl}chat/completions` 
      : `${customUrl}/chat/completions`;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  // Define tools exposed to the model
  const tools = [
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Tìm kiếm các trang web trên internet để lấy danh sách URL liên quan, tin tức thời sự mới nhất, tài liệu kỹ thuật, giá cả, thời tiết.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Câu truy vấn tìm kiếm (VD: 'thời tiết Hà Nội hôm nay', 'giá bitcoin')"
            }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "web_extract",
        description: "Truy cập trực tiếp vào một URL cụ thể để lấy toàn văn nội dung trang web đó. Hữu ích khi người dùng cung cấp link, hoặc sau khi tìm kiếm mạng cần đọc sâu một bài viết cụ thể.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Địa chỉ URL đầy đủ của trang web cần trích xuất (VD: 'https://vi.wikipedia.org/wiki/React')"
            }
          },
          required: ["url"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_current_time",
        description: "Lấy ngày giờ hiện tại của thiết bị chính xác đến từng giây.",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    }
  ];

  let responseMessage: any = null;
  let useFallback = false;

  // LƯỢT 1: Thử gọi API với schema tools
  try {
    const response = await safeFetch(customUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelName.trim(),
        messages: finalMessages,
        tools: tools,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 400 && (errorText.includes("tools") || errorText.includes("tool_choice"))) {
        console.warn("[AIService] Provider does not support tools. Retrying without tool schema...");
        useFallback = true;
      } else {
        throw new Error(`AI API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
    } else {
      const data = await response.json();
      responseMessage = data.choices?.[0]?.message;
    }
  } catch (err: any) {
    console.warn("[AIService] Failed with tools, attempting fallback without tool schemas:", err);
    useFallback = true;
  }

  // LƯỢT 1 (Fallback): Gọi không có schema tools
  if (useFallback) {
    try {
      const response = await safeFetch(customUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelName.trim(),
          messages: finalMessages,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API error (No Tools Fallback): ${response.status} - ${errText}`);
      }

      const data = await response.json();
      responseMessage = data.choices?.[0]?.message;
    } catch (fallbackErr: any) {
      throw new Error(`Lỗi kết nối tới AI API: ${fallbackErr.message || fallbackErr}`);
    }
  }

  if (!responseMessage) {
    return "Không nhận được phản hồi từ AI.";
  }

  // LƯỢT 2: Xử lý Tool Calling (Hỗ trợ cả Native JSON và Text XML)
  
  // A. Xử lý Native JSON Tool Calls
  if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
    const toolCall = responseMessage.tool_calls[0];
    const toolName = toolCall.function.name;
    let toolResult = "";

    if (toolName === "web_search") {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      toolResult = await searchWeb(args.query || "");
    } else if (toolName === "web_extract") {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      toolResult = await extractWebContent(args.url || "");
    } else if (toolName === "get_current_time") {
      toolResult = `Thời gian hệ thống hiện tại: ${new Date().toLocaleString('vi-VN')}`;
    } else {
      toolResult = "Không tìm thấy công cụ tương thích.";
    }

    console.log(`[AIService] Native Tool "${toolName}" executed. Injecting response back...`);

    // Build standard tool call sequence
    const nextMessages = [
      ...finalMessages,
      responseMessage,
      {
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: toolResult
      }
    ];

    try {
      const finalResponse = await safeFetch(customUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelName.trim(),
          messages: nextMessages,
          temperature: 0.7
        })
      });

      if (!finalResponse.ok) {
        throw new Error(`HTTP ${finalResponse.status}`);
      }

      const finalData = await finalResponse.json();
      return finalData.choices?.[0]?.message?.content || "Không nhận được phản hồi sau khi gọi công cụ.";
    } catch (err: any) {
      console.warn("[AIService] Native tool second call failed. Falling back to plain-text context injection...", err);
      // Fallback: Send plain user text message enclosing search results (bypasses "role: tool" Bad Request errors on proxy endpoints)
      const plainMessages = [
        systemMessage,
        ...chatMessages.filter(m => m.role === "user" || m.role === "assistant"),
        {
          role: "user" as const,
          content: `[KẾT QUẢ THỰC THI CÔNG CỤ ${toolName.toUpperCase()}]:\n${toolResult}\n\nHãy sử dụng kết quả này để trả lời câu hỏi gốc của tôi.`
        }
      ];
      return await askAINoTools(customUrl, headers, modelName.trim(), plainMessages);
    }
  }

  // B. Xử lý Text-based XML/DSML Tool Calls (Dành cho cả luồng thường lẫn luồng fallback!)
  const rawContent = responseMessage.content || "";
  const textToolCalls = parseTextBasedToolCalls(rawContent);
  if (textToolCalls.length > 0) {
    console.log(`[AIService] Detected ${textToolCalls.length} custom text-based tool calls.`);
    
    const resultsPromises = textToolCalls.map(async (tc) => {
      const toolName = tc.name;
      const args = tc.args;
      let toolResult = "";

      if (toolName === "web_search") {
        toolResult = await searchWeb(tc.args.query || "");
      } else if (toolName === "web_extract") {
        toolResult = await extractWebContent(tc.args.url || "");
      } else if (toolName === "get_current_time") {
        toolResult = `Thời gian hệ thống hiện tại: ${new Date().toLocaleString('vi-VN')}`;
      } else {
        toolResult = "Không tìm thấy công cụ tương thích.";
      }

      return `[KẾT QUẢ THỰC THI CÔNG CỤ ${toolName.toUpperCase()} với tham số ${JSON.stringify(args)}]:\n${toolResult}`;
    });

    const toolResults = await Promise.all(resultsPromises);
    const combinedToolResult = toolResults.join("\n\n---\n\n");

    console.log(`[AIService] Text Tools executed. Re-submitting to LLM...`);

    const nextMessages = [
      ...finalMessages,
      { role: "assistant", content: rawContent },
      {
        role: "user",
        content: `${combinedToolResult}\n\nHãy sử dụng các kết quả trên để trả lời câu hỏi gốc của tôi.`
      }
    ];

    try {
      const finalResponse = await safeFetch(customUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelName.trim(),
          messages: nextMessages,
          temperature: 0.7
        })
      });

      if (!finalResponse.ok) {
        throw new Error(`HTTP ${finalResponse.status}`);
      }

      const finalData = await finalResponse.json();
      return finalData.choices?.[0]?.message?.content || "Không nhận được phản hồi sau khi chạy công cụ.";
    } catch (err: any) {
      console.warn("[AIService] Text tool second call failed. Falling back to plain-text context injection...", err);
      const plainMessages = [
        systemMessage,
        ...chatMessages.filter(m => m.role === "user" || m.role === "assistant"),
        {
          role: "user" as const,
          content: `${combinedToolResult}\n\nHãy sử dụng kết quả tìm kiếm trên để trả lời câu hỏi gốc của tôi.`
        }
      ];
      return await askAINoTools(customUrl, headers, modelName.trim(), plainMessages);
    }
  }

  return rawContent;
}

// Fallback completions helper to prevent errors on strict/custom endpoints (Ollama, local proxies)
async function askAINoTools(url: string, headers: any, model: string, messages: ChatMessage[]): Promise<string> {
  const response = await safeFetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI API error (No Tools Fallback): ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Không nhận được phản hồi từ AI.";
}

// Extract memories implicitly in background after each user interaction
// Classifies facts into USER (USER.md) or TECH (MEMORY.md) and updates SQLite notes directly
export async function extractAndSaveMemory(userText: string, aiText: string): Promise<void> {
  const { baseUrl, modelName, apiKey } = getAIConfig();
  if (!baseUrl.trim() || !modelName.trim()) return;

  // Prevent extraction if inputs are too short
  if (userText.trim().length < 3 || aiText.trim().length < 3) return;

  console.log("[HermesMemory] Analyzing dialog to extract facts for USER.md or MEMORY.md...");

  try {
    const extractionPrompt = 
      `Dưới đây là cuộc hội thoại ngắn giữa người dùng và trợ lý AI.\n` +
      `Câu hỏi của người dùng: "${userText}"\n` +
      `Câu trả lời của AI: "${aiText}"\n\n` +
      `Hãy phân tích xem cuộc hội thoại này có chứa thông tin gì quan trọng cần ghi nhớ lâu dài không. Phân loại và viết lại thành 1 câu ngắn gọn:\n` +
      `1. Nếu là thông tin về Tên người dùng, sở thích, thông tin cá nhân, thói quen hoặc công ty của họ: Hãy trả về định dạng: USER: - [Thông tin ngắn gọn] (Ví dụ: USER: - Tên của người dùng là Bảo.)\n` +
      `2. Nếu là thông tin về lỗi kỹ thuật, cách cấu hình code, công nghệ dự án, hoặc câu lệnh command đã chạy: Hãy trả về định dạng: TECH: - [Thông tin ngắn gọn] (Ví dụ: TECH: - Cổng kết nối Postgres local là 5434.)\n` +
      `3. Nếu không có thông tin gì quan trọng cần nhớ lâu dài, trả về duy nhất chữ "NONE".\n\n` +
      `Không viết bất kỳ giải thích nào khác ngoài định dạng trên.`;

    let customUrl = baseUrl.trim();
    if (!customUrl.endsWith("/chat/completions")) {
      customUrl = customUrl.endsWith("/") 
        ? `${customUrl}chat/completions` 
        : `${customUrl}/chat/completions`;
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }

    const response = await safeFetch(customUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: modelName.trim(),
        messages: [{ role: "user", content: extractionPrompt }],
        temperature: 0.1 // Extremely low temperature for precise extraction
      })
    });

    if (response.ok) {
      const data = await response.json();
      const output = (data.choices?.[0]?.message?.content || "").trim();
      
      if (output.toUpperCase() === "NONE" || output.toUpperCase().includes("NONE") || output.length < 6) {
        return;
      }

      const db = await getDatabase();

      if (output.startsWith("USER:")) {
        const fact = output.replace("USER:", "").trim();
        const cleanFact = fact.replace(/^[-\s*§]+/g, "").trim();
        // Load USER.md
        const userNotes = (await db.select("SELECT content FROM notes WHERE title = 'USER.md' LIMIT 1")) as any[];
        if (userNotes.length > 0 && cleanFact) {
          const currentContent = userNotes[0].content || "";
          // Check if memory already exists to avoid duplication
          if (!currentContent.toLowerCase().includes(cleanFact.toLowerCase())) {
            const newContent = `${currentContent.trim()}\n\n§\n\n${cleanFact}\n`;
            await db.execute("UPDATE notes SET content = ?, updated_at = ? WHERE title = ?", [newContent, new Date().toISOString(), "USER.md"]);
            console.log(`[HermesMemory] Appended user fact to USER.md: "${cleanFact}"`);
          }
        }
      } 
      else if (output.startsWith("TECH:")) {
        const fact = output.replace("TECH:", "").trim();
        const cleanFact = fact.replace(/^[-\s*§]+/g, "").trim();
        // Load MEMORY.md
        const memoryNotes = (await db.select("SELECT content FROM notes WHERE title = 'MEMORY.md' LIMIT 1")) as any[];
        if (memoryNotes.length > 0 && cleanFact) {
          const currentContent = memoryNotes[0].content || "";
          // Check if memory already exists
          if (!currentContent.toLowerCase().includes(cleanFact.toLowerCase())) {
            const newContent = `${currentContent.trim()}\n\n§\n\n${cleanFact}\n`;
            await db.execute("UPDATE notes SET content = ?, updated_at = ? WHERE title = ?", [newContent, new Date().toISOString(), "MEMORY.md"]);
            console.log(`[HermesMemory] Appended tech fact to MEMORY.md: "${cleanFact}"`);
          }
        }
      }
    }
  } catch (err) {
    console.error("[HermesMemory] Failed to extract and save memory note:", err);
  }
}

// AI Daily Summary generator
export async function generateDailySummaryAI(
  date: string,
  tasksDone: string[],
  commandsUsed: string[]
): Promise<string> {
  const prompt = 
    `Bạn là một trợ lý AI thông minh tích hợp trong ứng dụng Personal AI Work Notebook.\n` +
    `Hãy tạo một báo cáo tóm tắt ngắn gọn, chuyên nghiệp và có chiều sâu về ngày làm việc hôm nay (${date}).\n\n` +
    `Dưới đây là dữ liệu công việc đã ghi nhận hôm nay:\n` +
    `- Các công việc đã hoàn thành: ${tasksDone.length > 0 ? tasksDone.join(", ") : "Không có"}\n` +
    `- Các câu lệnh command/code đã dùng: ${commandsUsed.length > 0 ? commandsUsed.join(", ") : "Không có"}\n\n` +
    `Hãy xuất ra một bản báo cáo tóm tắt cấu trúc markdown gọn gàng theo dạng:\n` +
    `• **Năng suất:** [Đánh giá ngắn gọn các task đã xong]\n` +
    `• **Hoạt động lệnh:** [Đánh giá/tổng kết các command đã dùng]\n` +
    `• **Đề xuất ngày mai:** [Gợi ý hành động tiếp theo dựa trên tiến độ]`;

  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  return await askAI(messages, true);
}

// Simple logic rules to provide realistic mock responses based on user queries
function getMockAIResponse(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("daily") || lowerPrompt.includes("năng suất")) {
    return (
      `• **Năng suất:** Đã hoàn thành setup cấu trúc dự án và SQLite local database. Tiến độ vượt mong đợi.\n` +
      `• **Hoạt động lệnh:** Đã sử dụng thành công lệnh port-forward postgres, kiểm thử kết nối database local mượt mà.\n` +
      `• **Đề xuất ngày mai:** Tập trung hoàn thiện giao diện Markdown Editor và các Copy Block thông minh có biến.`
    );
  }

  if (lowerPrompt.includes("postgres") || lowerPrompt.includes("port")) {
    return "Lệnh kết nối Postgres trên staging của bạn là: `kubectl port-forward svc/postgres 5434:5432 -n staging`.";
  }

  if (lowerPrompt.includes("jira")) {
    return "Tôi thấy Jira của bạn đã kết nối. Hiện tại bạn có 1 task: **GL-123 (Dashboard UI coding)** đang ở trạng thái *In Progress*.";
  }

  return (
    `[Mock AI Response - API Key chưa cấu hình]\n\n` +
    `Chào Bảo! Tôi là trợ lý AI. Để sử dụng AI thực tế, bạn vui lòng điền API URL, Model Name, và API Key trong tab Settings.\n` +
    `Hiện tại tôi đang hoạt động ở chế độ giả lập cục bộ dựa trên SQLite data của bạn.`
  );
}
