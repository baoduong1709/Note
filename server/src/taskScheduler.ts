import { getDatabase } from './database.js';
import { sendNotificationToUser } from './websocket.js';
import crypto from 'crypto';

// Map taskId -> setTimeout object
const activeJobs = new Map<string, NodeJS.Timeout>();

// We keep track of the next scan time (1 hour from the last scan)
export let nextScanTime = Date.now() + 60 * 60 * 1000;

// Helper to parse due_date string to Unix timestamp, default to UTC+7 (Vietnam) if no timezone is provided
export function parseTaskDueDate(dueDateStr: string | null): number {
  if (!dueDateStr) return NaN;
  let formatted = dueDateStr.trim();
  
  if (formatted.includes('T')) {
    const timePart = formatted.split('T')[1];
    const hasTz = timePart.includes('Z') || timePart.includes('+') || timePart.includes('-');
    if (!hasTz) {
      formatted = formatted + '+07:00';
    }
  } else {
    // Treat date-only string as local midnight in Vietnam
    formatted = formatted + 'T00:00:00+07:00';
  }
  return new Date(formatted).getTime();
}

// Cancel an existing job
export function cancelTaskJob(taskId: string): void {
  const timeout = activeJobs.get(taskId);
  if (timeout) {
    clearTimeout(timeout);
    activeJobs.delete(taskId);
    console.log(`[TaskScheduler] Cancelled job for task: ${taskId}`);
  }
}

// Send Telegram Message helper
async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    return response.ok;
  } catch (err) {
    console.error('Error sending Telegram notification:', err);
    return false;
  }
}

// Send actual notification to user
async function sendTaskNotification(userId: string, taskTitle: string): Promise<void> {
  try {
    const db = getDatabase();
    const user = db.prepare('SELECT email, telegram_chat_id FROM users WHERE id = ?').get(userId) as { email: string; telegram_chat_id: string | null } | undefined;
    
    if (!user) return;

    const title = taskTitle.startsWith('E2EE:v1:') ? '🔒 [Công việc mã hóa]' : taskTitle;
    const plainTextTitle = `🔔 NHẮC NHỞ CÔNG VIỆC ĐẾN HẠN`;
    const plainTextBody = `⏱️ Hiện đã đến giờ thực hiện công việc:\n- ${title}`;

    // 1. Send via WebSocket to all connected desktop/mobile clients of this user
    const syncId = crypto.createHash('sha256').update(user.email.trim().toLowerCase()).digest('hex');
    sendNotificationToUser(syncId, plainTextTitle, plainTextBody);
    console.log(`[TaskScheduler] Dispatched WebSocket notification for user ${userId} / syncId ${syncId}`);

    // 2. Send via Telegram if linked
    if (user.telegram_chat_id) {
      const message = `🔔 *NHẮC NHỞ CÔNG VIỆC ĐẾN HẠN*\n\n` +
                      `⏱️ Hiện đã đến giờ thực hiện công việc:\n` +
                      `- *${title}*`;
      await sendTelegramMessage(user.telegram_chat_id, message);
      console.log(`[TaskScheduler] Sent Telegram notification for task "${title}" to user ${userId}`);
    }
  } catch (err) {
    console.error('[TaskScheduler] Failed to send task notification:', err);
  }
}

// Schedule task helper (handles create/edit/delete/status update)
export function scheduleTaskJob(task: { id: string; title: string; due_date: string | null; status: string; user_id: string }): void {
  // 1. Cancel any existing job to prevent duplicates/stale times
  cancelTaskJob(task.id);

  // 2. If status is done, or no due date is set, do not schedule
  if (task.status === 'done' || !task.due_date) {
    return;
  }

  // 3. Parse due_date
  const taskTime = parseTaskDueDate(task.due_date);
  if (isNaN(taskTime)) return;

  const now = Date.now();
  // 4. Only schedule if it starts in the future and before the next scan
  if (taskTime >= now && taskTime < nextScanTime) {
    const delay = taskTime - now;
    const timeout = setTimeout(async () => {
      activeJobs.delete(task.id);
      await sendTaskNotification(task.user_id, task.title);
    }, delay);
    activeJobs.set(task.id, timeout);
    console.log(`[TaskScheduler] Scheduled job for task ${task.id} in ${Math.round(delay / 1000)}s`);
  } else {
    console.log(`[TaskScheduler] Task ${task.id} (${task.due_date}) is outside active window [now, ${new Date(nextScanTime).toISOString()}], job deleted/not scheduled.`);
  }
}

// Scan database for tasks due in the next 1 hour
export async function scanTasksForNextHour(): Promise<void> {
  try {
    const db = getDatabase();
    const now = Date.now();
    nextScanTime = now + 60 * 60 * 1000; // Look ahead 1 hour

    console.log(`[TaskScheduler] Scanning tasks due between now and ${new Date(nextScanTime).toISOString()}...`);

    // Fetch active tasks (due_date in YYYY-MM-DD or ISO 8601 string)
    const tasks = db.prepare(`
      SELECT id, title, due_date, status, user_id FROM tasks 
      WHERE status != 'done' AND due_date IS NOT NULL
    `).all() as { id: string; title: string; due_date: string; status: string; user_id: string }[];

    let scheduledCount = 0;
    for (const task of tasks) {
      const taskTime = parseTaskDueDate(task.due_date);
      if (isNaN(taskTime)) continue;

      if (taskTime >= now && taskTime < nextScanTime) {
        scheduleTaskJob(task);
        scheduledCount++;
      }
    }

    console.log(`[TaskScheduler] Scan complete. Scheduled ${scheduledCount} tasks.`);
  } catch (err) {
    console.error('[TaskScheduler] Error during task scan:', err);
  }
}

// Initialize hourly scheduler
export function initTaskScheduler(): void {
  console.log('⏰ Initializing Task Scheduler (Time-Exact)...');

  // Run the first scan immediately on server start
  scanTasksForNextHour();

  // Run hourly scans
  setInterval(async () => {
    await scanTasksForNextHour();
  }, 60 * 60 * 1000);
}
