// Centralized API client for backend server communication

// In Tauri: must use full URL since there's no Vite proxy
// In web dev: empty string (Vite proxy forwards /api/* to server)
// In web prod: empty string (served from same origin)
// On Android mobile: localhost refers to the phone, not the PC - skip server calls
const isTauriApp = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
const isAndroidApp = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
const API_BASE_URL = import.meta.env.VITE_API_URL || (isTauriApp && !isAndroidApp ? 'https://note.baoduong.dev' : '');

export function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setAuthToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function clearAuthToken(): void {
  localStorage.removeItem('auth_token');
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
  const url = `${API_BASE_URL}${endpoint}`;

  let response: Response;
  if (isTauri) {
    try {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      response = await tauriFetch(url, { ...options, headers } as any);
    } catch (err: any) {
      console.warn("tauriFetch failed, falling back to window.fetch", err);
      response = await fetch(url, { ...options, headers });
    }
  } else {
    response = await fetch(url, { ...options, headers });
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `API Error: ${response.status}`);
  }
  return response.json();
}

export const api = {
  get: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any) =>
    apiRequest<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(endpoint: string, body?: any) =>
    apiRequest<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
};
