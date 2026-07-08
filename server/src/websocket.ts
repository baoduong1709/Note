import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

// Map syncId -> Set of connected WebSocket clients
const channels = new Map<string, Set<WebSocket>>();

let wss: WebSocketServer;

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let subscribedChannel: string | null = null;

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        
        // Subscribe to a share channel
        if (msg.type === 'subscribe' && msg.syncId) {
          // Unsubscribe from previous channel
          if (subscribedChannel) {
            channels.get(subscribedChannel)?.delete(ws);
          }
          
          subscribedChannel = msg.syncId;
          if (!channels.has(msg.syncId)) {
            channels.set(msg.syncId, new Set());
          }
          channels.get(msg.syncId)!.add(ws);
          
          ws.send(JSON.stringify({ type: 'subscribed', syncId: msg.syncId }));
        }
      } catch (err) {
        console.error('[WS] Invalid message:', err);
      }
    });

    ws.on('close', () => {
      if (subscribedChannel) {
        channels.get(subscribedChannel)?.delete(ws);
        // Clean up empty channels
        if (channels.get(subscribedChannel)?.size === 0) {
          channels.delete(subscribedChannel);
        }
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err);
    });
  });

  console.log('🔌 WebSocket server initialized on /ws');
}

// Broadcast a new share to all clients subscribed to a syncId
export function broadcastShare(syncId: string, shareData: any): void {
  const clients = channels.get(syncId);
  if (!clients) return;
  
  const message = JSON.stringify({
    type: 'new_share',
    data: shareData,
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Broadcast database sync signal to all other devices in the same syncId channel
export function broadcastSyncUpdate(syncId: string): void {
  const clients = channels.get(syncId);
  if (!clients) return;
  
  const message = JSON.stringify({
    type: 'sync_update',
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Send real-time notification to all connected clients of a specific user
export function sendNotificationToUser(syncId: string, title: string, body: string): void {
  const clients = channels.get(syncId);
  if (!clients) return;

  const message = JSON.stringify({
    type: 'notification',
    title,
    body,
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
