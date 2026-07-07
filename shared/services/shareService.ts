// Share service - uses backend server API instead of jsonblob.com
import { apiRequest, clearAuthToken } from './apiClient';

export interface ShareData {
  type: 'text' | 'image';
  content: string;
  timestamp: number;
  userEmail?: string;
  userName?: string;
}

// Generate a deterministic sync ID from an email address using SHA-256
export async function generateSyncIdFromEmail(email: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  const msgBuffer = new TextEncoder().encode(cleanEmail);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const fullHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return fullHash.substring(0, 32);
}

// Retrieve stored user info from localStorage
export function getStoredUser(): { email: string; name: string } | null {
  const email = localStorage.getItem('sync_user_email');
  const name = localStorage.getItem('sync_user_name');
  if (email && name) return { email, name };
  return null;
}

// Persist user info to localStorage
export function storeUser(email: string, name: string): void {
  localStorage.setItem('sync_user_email', email.trim());
  localStorage.setItem('sync_user_name', name.trim());
}

// Remove all stored user and sync data from localStorage
export function clearStoredUser(): void {
  localStorage.removeItem('sync_user_email');
  localStorage.removeItem('sync_user_name');
  localStorage.removeItem('sync_share_id');
  localStorage.removeItem('last_sync_time');
  localStorage.removeItem('sync_deletions');
  localStorage.removeItem('sync_upserts');
  localStorage.removeItem('e2ee_passphrase');
  localStorage.removeItem('e2ee_enabled');
  localStorage.removeItem('pin_lock_enabled');
  localStorage.removeItem('pin_lock_code');
  clearAuthToken();
}

// Push share data to the server for the given sync ID
export async function sendShareData(
  syncId: string, type: 'text' | 'image', content: string, email: string, name: string
): Promise<void> {
  if (!syncId) throw new Error('Sync ID is not configured.');
  await apiRequest(`/api/share/${syncId}`, {
    method: 'PUT',
    body: JSON.stringify({ type, content, user_email: email, user_name: name }),
  });
}

// Delete the entire share channel data from the server
export async function deleteShareChannel(syncId: string): Promise<void> {
  if (!syncId) return;
  try {
    await apiRequest(`/api/share/${syncId}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Failed to delete share channel:', err);
  }
}

// Fetch the latest share data from the server
export async function receiveShareData(syncId: string): Promise<ShareData | null> {
  if (!syncId) return null;
  try {
    const result = await apiRequest<{ success: boolean; data: any; history?: any[] }>(`/api/share/${syncId}`, { method: 'GET' });
    if (result.success && result.data) {
      return mapToShareData(result.data);
    }
    return null;
  } catch {
    return null;
  }
}

// Fetch full share history from the server
export async function receiveShareHistory(syncId: string): Promise<ShareData[]> {
  if (!syncId) return [];
  try {
    const result = await apiRequest<{ success: boolean; history?: any[] }>(`/api/share/${syncId}`, { method: 'GET' });
    if (result.success && result.history) {
      return result.history.map(mapToShareData);
    }
    return [];
  } catch {
    return [];
  }
}

// Map server response to ShareData
export function mapToShareData(item: any): ShareData {
  let timeStr = item.updated_at || item.created_at;
  if (typeof timeStr === 'string' && !timeStr.includes('T') && !timeStr.includes('Z')) {
    // SQLite format: "YYYY-MM-DD HH:MM:SS" -> convert to ISO 8601 UTC
    timeStr = timeStr.replace(' ', 'T') + 'Z';
  } else if (typeof timeStr === 'string' && !timeStr.includes('Z') && !timeStr.includes('+')) {
    // Has 'T' but no timezone offset
    timeStr = timeStr + 'Z';
  }

  return {
    type: item.type,
    content: item.content,
    timestamp: new Date(timeStr).getTime(),
    userEmail: item.user_email,
    userName: item.user_name,
  };
}
