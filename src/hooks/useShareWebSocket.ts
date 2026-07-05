import { useEffect, useRef, useCallback } from 'react';
import { ShareData } from '../services/shareService';
import { pullCloudDataToLocal } from '../services/appSyncService';

interface UseShareWebSocketOptions {
  syncId: string | null;
  onNewShare?: (share: ShareData) => void;
  triggerToastGlobal?: (msg: string) => void;
}

export function useShareWebSocket({ syncId, onNewShare, triggerToastGlobal }: UseShareWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNewShareRef = useRef(onNewShare);
  const triggerToastRef = useRef(triggerToastGlobal);
  const isCleanedUpRef = useRef(false);
  onNewShareRef.current = onNewShare;
  triggerToastRef.current = triggerToastGlobal;

  const connect = useCallback(() => {
    if (!syncId || isCleanedUpRef.current) return;

    // Close existing connection first
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Determine WebSocket URL based on runtime environment and VITE_API_URL
    const apiURL = import.meta.env.VITE_API_URL;
    let wsUrl = '';
    
    if (apiURL) {
      wsUrl = apiURL.replace(/^http/, 'ws') + '/ws';
    } else {
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = isTauri
        ? 'ws://localhost:3001/ws'
        : `${wsProtocol}//${window.location.host}/ws`;
    }
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to channel:', syncId);
        ws.send(JSON.stringify({ type: 'subscribe', syncId }));
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          // 1. Handle Real-Time Share
          if (msg.type === 'new_share' && msg.data) {
            const share: ShareData = {
              type: msg.data.type,
              content: msg.data.content,
              timestamp: new Date(msg.data.updated_at || msg.data.created_at).getTime(),
              userEmail: msg.data.user_email,
              userName: msg.data.user_name,
            };

            // Notify local listener if present
            if (onNewShareRef.current) {
              onNewShareRef.current(share);
            }
            
            // Dispatch global event for ShareView to consume if it's currently mounted elsewhere
            window.dispatchEvent(new CustomEvent('ws-new-share', { detail: share }));
          }

          // 2. Handle Real-Time App Sync Update (Notes/Tasks/Calendar)
          if (msg.type === 'sync_update') {
            console.log('[WS-Sync] Received update signal from server. Pulling changes...');
            
            // Pull changes incrementally
            const updated = await pullCloudDataToLocal();
            if (updated) {
              console.log('[WS-Sync] Database updated via WebSocket pull.');
              
              // Dispatch UI update events
              window.dispatchEvent(new CustomEvent('task-updated'));
              window.dispatchEvent(new CustomEvent('notes-updated'));
              window.dispatchEvent(new CustomEvent('calendar-updated'));
              window.dispatchEvent(new CustomEvent('ai-chat-updated'));
            }
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        if (!isCleanedUpRef.current) {
          console.log('[WS] Disconnected, reconnecting in 3s...');
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err);
      if (!isCleanedUpRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    }
  }, [syncId]);

  useEffect(() => {
    isCleanedUpRef.current = false;
    connect();
    
    return () => {
      isCleanedUpRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);
}
