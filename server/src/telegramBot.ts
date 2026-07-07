import { getDatabase } from './database.js';
import { broadcastSyncUpdate } from './websocket.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Helper to generate deterministic syncId from user email (must match shareService.ts / sync.ts)
function generateSyncIdFromEmail(email: string): string {
  const cleanEmail = email.trim().toLowerCase();
  const hash = crypto.createHash('sha256').update(cleanEmail).digest('hex');
  return hash.substring(0, 32);
}

export function initTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('ℹ️ Telegram Bot Token not set. System bot disabled.');
    return;
  }

  console.log('🤖 Initializing Telegram Bot...');
  let offset = 0;

  async function pollUpdates() {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=30`);
      if (!response.ok) {
        // Wait 10 seconds before retrying on HTTP errors
        setTimeout(pollUpdates, 10000);
        return;
      }
      
      const body = await response.json() as any;
      if (body.ok && body.result && body.result.length > 0) {
        for (const update of body.result) {
          offset = update.update_id + 1;
          if (update.message) {
            try {
              await handleMessage(update.message);
            } catch (err) {
              console.error('❌ Error handling telegram message:', err);
            }
          }
        }
      }
      // Immediately poll again
      setTimeout(pollUpdates, 100);
    } catch (err) {
      console.error('❌ Telegram Bot polling error:', err);
      // Wait 10 seconds before retrying on network error
      setTimeout(pollUpdates, 10000);
    }
  }

  pollUpdates();
}

async function handleMessage(message: any) {
  const chatId = message.chat?.id?.toString();
  const text = message.text?.trim() || '';
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!chatId) return;

  async function sendReply(replyText: string) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
          parse_mode: 'Markdown',
        }),
      });
    } catch (err) {
      console.error('Failed to send telegram reply:', err);
    }
  }

  // 1. Handle link command for unlinked users
  if (text.startsWith('/start') || text.startsWith('/link')) {
    await sendReply(
      `👋 *Xin chào!* Đây là bot trợ lý của ứng dụng Note.\n\n` +
      `ID Telegram của bạn là: \`${chatId}\`\n\n` +
      `Hãy sao chép ID này và dán vào phần *Cài đặt > Tích hợp Telegram* trên ứng dụng Note của bạn để liên kết tài khoản.`
    );
    return;
  }

  // 2. Query the user by telegram_chat_id
  const db = getDatabase();
  const user = db.prepare('SELECT id, email FROM users WHERE telegram_chat_id = ?').get(chatId) as { id: string; email: string } | undefined;

  if (!user) {
    await sendReply(
      `⚠️ ID Telegram của bạn (\`${chatId}\`) chưa được liên kết với tài khoản nào trên ứng dụng Note.\n\n` +
      `Vui lòng dán ID này vào mục *Cài đặt > Tích hợp Telegram* trong ứng dụng của bạn để liên kết.`
    );
    return;
  }

  // 3. Handle commands for linked users
  if (text.startsWith('/help')) {
    await sendReply(
      `📝 *Hướng dẫn sử dụng Bot Note:*\n\n` +
      `- *Gửi tin nhắn văn bản bất kỳ* để lưu nhanh vào *Ghi chú nhanh* (Quick Note).\n` +
      `- \`/todo <nội dung>\` hoặc \`/task <nội dung>\`: Tạo công việc mới.\n` +
      `- \`/tasks\`: Xem danh sách công việc chưa hoàn thành của hôm nay.\n` +
      `- \`/note <tiêu đề> | <nội dung>\`: Tạo ghi chú có tiêu đề (cách nhau bởi dấu gạch đứng \`|\`).`
    );
    return;
  }

  if (text.startsWith('/todo ') || text.startsWith('/task ')) {
    const taskTitle = text.substring(text.indexOf(' ') + 1).trim();
    if (!taskTitle) {
      await sendReply('❌ Vui lòng nhập nội dung công việc.');
      return;
    }
    const taskId = uuidv4();
    db.prepare(`
      INSERT INTO tasks (id, user_id, title, status, priority, source, created_at, updated_at)
      VALUES (?, ?, ?, 'todo', 'medium', 'telegram', datetime('now'), datetime('now'))
    `).run(taskId, user.id, taskTitle);

    // Broadcast sync update
    const syncId = generateSyncIdFromEmail(user.email);
    broadcastSyncUpdate(syncId);

    await sendReply(`✅ Đã thêm công việc: *${taskTitle}*`);
    return;
  }

  if (text === '/tasks') {
    const activeTasks = db.prepare(`
      SELECT title, priority, due_date FROM tasks 
      WHERE user_id = ? AND status != 'done'
      ORDER BY due_date ASC, priority DESC
    `).all(user.id) as { title: string; priority: string; due_date: string | null }[];

    if (activeTasks.length === 0) {
      await sendReply('📅 Bạn không có công việc nào chưa hoàn thành.');
      return;
    }

    const taskLines = activeTasks.map((t, idx) => {
      const pText = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
      const dText = t.due_date ? ` (Hạn: ${t.due_date})` : '';
      return `${idx + 1}. ${pText} ${t.title}${dText}`;
    });

    await sendReply(`📋 *Danh sách công việc chưa hoàn thành:*\n\n${taskLines.join('\n')}`);
    return;
  }

  if (text.startsWith('/note ')) {
    const rest = text.substring(6).trim();
    let noteTitle = 'Telegram Note';
    let noteContent = rest;

    if (rest.includes('|')) {
      const parts = rest.split('|');
      noteTitle = parts[0].trim();
      noteContent = parts.slice(1).join('|').trim();
    }

    const noteId = uuidv4();
    db.prepare(`
      INSERT INTO notes (id, user_id, title, content, type, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'quick', datetime('now'), datetime('now'))
    `).run(noteId, user.id, noteTitle, noteContent);

    // Broadcast sync update
    const syncId = generateSyncIdFromEmail(user.email);
    broadcastSyncUpdate(syncId);

    await sendReply(`✅ Đã tạo ghi chú: *${noteTitle}*`);
    return;
  }

  // Default: save as a quick note
  const noteId = uuidv4();
  const summaryTitle = text.length > 30 ? text.substring(0, 30) + '...' : text;
  db.prepare(`
    INSERT INTO notes (id, user_id, title, content, type, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'quick', datetime('now'), datetime('now'))
  `).run(noteId, user.id, `Nhanh: ${summaryTitle}`, text);

  // Broadcast sync update
  const syncId = generateSyncIdFromEmail(user.email);
  broadcastSyncUpdate(syncId);

  await sendReply(`✅ Đã lưu ghi chú nhanh: \n"${summaryTitle}"`);
}
