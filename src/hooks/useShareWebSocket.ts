import { useEffect, useRef, useCallback } from 'react';
import { ShareData } from '../services/shareService';

interface UseShareWebSocketOptions {
  syncId: string | null;
  onNewShare: (share: ShareData) => void;
}

export function useShareWebSocket({ syncId, onNewShare }: UseShareWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNewShareRef = useRef(onNewShare);
  const isCleanedUpRef = useRef(false); // Prevent reconnect after cleanup
  onNewShareRef.current = onNewShare;

  const connect = useCallback(() => {
    if (!syncId || isCleanedUpRef.current) return;

    // Close existing connection first
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent onclose from triggering reconnect
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Determine WebSocket URL based on runtime environment
    const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
    const wsUrl = isTauri 
      ? 'ws://localhost:3001/ws'
      : `ws://${window.location.host}/ws`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        ws.send(JSON.stringify({ type: 'subscribe', syncId }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'new_share' && msg.data) {
            const share: ShareData = {
              type: msg.data.type,
              content: msg.data.content,
              timestamp: new Date(msg.data.updated_at || msg.data.created_at).getTime(),
              userEmail: msg.data.user_email,
              userName: msg.data.user_name,
            };
            onNewShareRef.current(share);
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        // Only reconnect if not intentionally cleaned up
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
      // Mark as cleaned up to prevent any reconnection
      isCleanedUpRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent onclose reconnect
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);
}
