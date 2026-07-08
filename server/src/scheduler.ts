import { getDatabase } from './database.js';

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

// Function to run the checks and send notifications
export async function runScheduledCheck(): Promise<void> {
  try {
    const db = getDatabase();
    
    // Find all users with a telegram_chat_id
    const users = db.prepare('SELECT id, email, telegram_chat_id FROM users WHERE telegram_chat_id IS NOT NULL').all() as {
      id: string;
      email: string;
      telegram_chat_id: string;
    }[];

    if (users.length === 0) return;

    // Get current date in UTC+7
    const now = new Date();
    const localTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = localTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const [, currentMonth, currentDay] = todayStr.split('-').map(Number);

    console.log(`[Scheduler] Running notification check for date: ${todayStr}`);

    for (const user of users) {
      const messages: string[] = [];

      // 1. Check due/overdue tasks
      const tasks = db.prepare(`
        SELECT title, due_date, priority FROM tasks 
        WHERE user_id = ? AND status != 'done' AND due_date IS NOT NULL AND due_date <= ?
      `).all(user.id, todayStr) as { title: string; due_date: string; priority: string }[];

      if (tasks.length > 0) {
        const overdue = tasks.filter(t => t.due_date < todayStr);
        const dueToday = tasks.filter(t => t.due_date === todayStr);

        if (overdue.length > 0 || dueToday.length > 0) {
          messages.push(`📋 *Nhắc nhở Công việc:*`);
          if (overdue.length > 0) {
            messages.push(`⚠️ *Trễ hạn (${overdue.length} việc):*`);
            overdue.forEach(t => {
              const title = t.title.startsWith('E2EE:v1:') ? '🔒 [Công việc mã hóa]' : t.title;
              messages.push(`- ${title} (Hạn: ${t.due_date})`);
            });
          }
          if (dueToday.length > 0) {
            messages.push(`📅 *Hôm nay (${dueToday.length} việc):*`);
            dueToday.forEach(t => {
              const title = t.title.startsWith('E2EE:v1:') ? '🔒 [Công việc mã hóa]' : t.title;
              messages.push(`- ${title}`);
            });
          }
          messages.push(''); // spacing
        }
      }

      // 2. Check solar calendar events for today
      const events = db.prepare(`
        SELECT title, solar_date, repeat_yearly, event_type FROM calendar_events 
        WHERE user_id = ? AND date_type = 'solar'
      `).all(user.id) as { title: string; solar_date: string | null; repeat_yearly: number; event_type: string }[];

      const todayEvents = events.filter(e => {
        if (!e.solar_date) return false;
        const [y, m, d] = e.solar_date.split('-').map(Number);
        if (e.repeat_yearly === 1) {
          return m === currentMonth && d === currentDay;
        } else {
          return e.solar_date === todayStr;
        }
      });

      if (todayEvents.length > 0) {
        messages.push(`📅 *Nhắc nhở Sự kiện Hôm nay:*`);
        todayEvents.forEach(e => {
          const title = e.title.startsWith('E2EE:v1:') ? '🔒 [Sự kiện mã hóa]' : e.title;
          const typeText = e.event_type === 'birthday' ? 'Sinh nhật' : 
                           e.event_type === 'holiday' ? 'Ngày lễ' :
                           e.event_type === 'anniversary' ? 'Kỷ niệm' : 'Sự kiện';
          messages.push(`- ${typeText}: ${title}`);
        });
        messages.push(''); // spacing
      }

      if (messages.length > 0) {
        // Construct final message
        const finalMessage = `🔔 *THÔNG BÁO TỪ NOTE APP*\n\n` + messages.join('\n').trim();
        await sendTelegramMessage(user.telegram_chat_id, finalMessage);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error running scheduled check:', err);
  }
}

// Initialize Scheduler
export function initScheduler(): void {
  console.log('⏰ Initializing Scheduler...');
  
  // Last checked date to prevent double run on the same day
  let lastCheckedDay = '';

  setInterval(async () => {
    try {
      const now = new Date();
      // Current date and hour in UTC+7
      const localTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const todayStr = localTime.toISOString().split('T')[0]; // YYYY-MM-DD
      const localHour = localTime.getUTCHours(); // Hour in UTC+7 since we shifted it

      // Run at 8:00 AM local time
      if (localHour === 8 && lastCheckedDay !== todayStr) {
        lastCheckedDay = todayStr;
        await runScheduledCheck();
      }
    } catch (err) {
      console.error('[Scheduler] Error in scheduler interval:', err);
    }
  }, 10 * 60 * 1000); // Check every 10 minutes
}
