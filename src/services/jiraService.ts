// Jira Cloud Integration Service (supports Tauri CORS-bypass, Vite Proxy bypass, and Mock Fallback)

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string;
  url: string;
}

// Get Jira connection configuration from localStorage
export function getJiraConfig(): JiraConfig | null {
  try {
    const configStr = localStorage.getItem("jira_config");
    if (configStr) {
      return JSON.parse(configStr);
    }
  } catch (err) {
    console.error("Failed to parse Jira config:", err);
  }
  return null;
}

// Check if we are running in a regular web browser (Vite dev server) to bypass CORS via local proxy
const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
const isWeb = !isTauri;

// Dynamic request URL builder that maps requests to local Vite proxy /api-proxy when running in browser mode
function getRequestUrl(baseUrl: string, path: string): { url: string; headers: Record<string, string> } {
  if (isWeb) {
    return {
      url: `/api-proxy${path}`,
      headers: { "x-target-url": baseUrl }
    };
  }
  return {
    url: `${baseUrl}${path}`,
    headers: {}
  };
}

// Safe Fetch helper that dynamically uses Tauri HTTP plugin (bypasses CORS on Desktop) or window.fetch (on Web)
async function safeFetch(url: string, options: any) {
  if (isTauri) {
    // Dynamic import to prevent crash in regular browser environment
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return await tauriFetch(url, options);
  }
  return await fetch(url, options);
}

// Test Jira Connection
export async function testJiraConnection(config: JiraConfig): Promise<boolean> {
  if (!config.apiToken || config.apiToken.includes("••••")) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }

  try {
    const authHeader = btoa(`${config.email}:${config.apiToken}`);
    const { url, headers: proxyHeaders } = getRequestUrl(config.baseUrl, "/rest/api/3/myself");

    const response = await safeFetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Accept": "application/json",
        ...proxyHeaders
      }
    });

    return response.ok;
  } catch (err: any) {
    console.error("[JiraService] Connection test failed:", err);
    throw new Error(`Lỗi kết nối: ${err.message || err}`);
  }
}

// Fetch Jira Issues assigned to the user
export async function fetchJiraIssues(): Promise<JiraIssue[]> {
  const config = getJiraConfig();

  // Mock Fallback if no real configuration exists
  if (!config || !config.baseUrl || !config.apiToken || config.apiToken.includes("••••")) {
    console.log("[JiraService] Using mock issues.");
    await new Promise(resolve => setTimeout(resolve, 800));
    return [
      {
        key: "GL-123",
        summary: "Code UI Main Dashboard for Work Notebook",
        status: "In Progress",
        priority: "High",
        assignee: "Bao Duong",
        url: "https://gamelifestyle.atlassian.net/browse/GL-123"
      },
      {
        key: "GL-456",
        summary: "Setup SQLite database connection and local queries",
        status: "To Do",
        priority: "Medium",
        assignee: "Bao Duong",
        url: "https://gamelifestyle.atlassian.net/browse/GL-456"
      }
    ];
  }

  try {
    const authHeader = btoa(`${config.email}:${config.apiToken}`);
    const jql = encodeURIComponent("assignee = currentUser() AND statusCategory != Done");
    const { url, headers: proxyHeaders } = getRequestUrl(config.baseUrl, `/rest/api/3/search?jql=${jql}`);

    const response = await safeFetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Accept": "application/json",
        ...proxyHeaders
      }
    });

    if (!response.ok) {
      throw new Error(`Jira API Error: ${response.status}`);
    }

    const data = await response.json();
    return (data.issues || []).map((issue: any) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name || "To Do",
      priority: issue.fields.priority?.name || "Medium",
      assignee: issue.fields.assignee?.displayName || "Me",
      url: `${config.baseUrl}/browse/${issue.key}`
    }));
  } catch (err) {
    console.error("[JiraService] Failed to fetch issues:", err);
    throw err;
  }
}

// Transition Jira Issue Status (Confirm Before Write required by flow!)
export async function transitionJiraIssue(
  issueKey: string,
  newStatusName: string,
  comment?: string
): Promise<void> {
  const config = getJiraConfig();

  // Mock Fallback
  if (!config || !config.baseUrl || !config.apiToken || config.apiToken.includes("••••")) {
    console.log(`[JiraService] [MOCK WRITE] Transited ${issueKey} to status: ${newStatusName}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return;
  }

  try {
    const authHeader = btoa(`${config.email}:${config.apiToken}`);
    
    // 1. Get available transitions
    const { url: transUrl, headers: transHeaders } = getRequestUrl(config.baseUrl, `/rest/api/3/issue/${issueKey}/transitions`);
    
    const transResponse = await safeFetch(transUrl, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Accept": "application/json",
        ...transHeaders
      }
    });

    if (!transResponse.ok) {
      throw new Error(`Jira API failed to fetch transitions: ${transResponse.status}`);
    }

    const transData = await transResponse.json();
    const transition = (transData.transitions || []).find(
      (t: any) => t.to?.name?.toLowerCase() === newStatusName.toLowerCase()
    );

    if (!transition) {
      throw new Error(`Không tìm thấy bước chuyển trạng thái sang "${newStatusName}" trên Jira.`);
    }

    // 2. Perform transition
    const body: any = {
      transition: { id: transition.id }
    };

    if (comment) {
      body.update = {
        comment: [
          {
            add: { body: comment }
          }
        ]
      };
    }

    const { url: performUrl, headers: performHeaders } = getRequestUrl(config.baseUrl, `/rest/api/3/issue/${issueKey}/transitions`);

    const response = await safeFetch(performUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/json",
        ...performHeaders
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Jira transition failed: ${response.status}`);
    }

    console.log(`[JiraService] Successfully transited ${issueKey} on Jira.`);
  } catch (err) {
    console.error("[JiraService] Transition failed:", err);
    throw err;
  }
}
