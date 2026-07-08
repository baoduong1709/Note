import { getDatabase } from "../database/db";
import { Task } from "../database/queries/tasks";
import { CalendarEvent } from "../database/queries/calendarEvents";
import { lunarToSolar, solarToLunar } from "../utils/lunarCalendar";
import { api } from "./apiClient";

const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;

// Request browser/Tauri Notification permission
export async function initNotifications(): Promise<boolean> {
  if (isTauri) {
    try {
      const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      return granted;
    } catch (err) {
      console.error("Tauri native notification init failed:", err);
    }
  }

  if (!("Notification" in window)) {
    console.warn("Notifications are not supported in this environment.");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
}

// Helper to send message to Telegram
export async function sendTelegramNotification(title: string, body: string): Promise<void> {
  try {
    const configStr = localStorage.getItem("telegram_config");
    if (!configStr) return;
    const config = JSON.parse(configStr);
    if (!config.enabled || !config.chatId) return;

    // Send through server since we deleted client bot token
    await api.post("/api/auth/telegram/send", { title, body });
  } catch (err) {
    console.error("Telegram notification error:", err);
  }
}

// Send system notification safely
export function sendNotification(title: string, body: string) {
  // Trigger Telegram notification asynchronously
  sendTelegramNotification(title, body).catch((err) =>
    console.error("Telegram async invoke error:", err)
  );

  if (isTauri) {
    import("@tauri-apps/plugin-notification").then(({ sendNotification: sendTauriNotification }) => {
      sendTauriNotification({
        title,
        body,
      });
    }).catch((err) => {
      console.error("Failed to send Tauri native notification:", err);
    });
    return;
  }

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  
  try {
    new Notification(title, {
      body,
      icon: "/logo.png"
    });
  } catch (err) {
    console.error("Failed to display notification:", err);
  }
}

// Check database for special calendar events and notify user
export async function checkAndNotifyCalendarEvents(): Promise<void> {
  const isAllowed = await initNotifications();
  if (!isAllowed) return;

  try {
    const db = await getDatabase();
    const today = new Date();
    // Normalize to local midnight for accurate date-only comparison
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Fetch all calendar events
    const events = await db.select<CalendarEvent[]>(
      "SELECT * FROM calendar_events"
    );

    if (events.length === 0) return;

    const getDiffDays = (d1: Date, d2: Date): number => {
      const date1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
      const date2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
      return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
    };

    const todayYear = todayMidnight.getFullYear();
    const eventsToNotify: { event: CalendarEvent; diffDays: number }[] = [];

    for (const event of events) {
      if (event.date_type === "solar") {
        if (!event.solar_date) continue;
        const [y, m, d] = event.solar_date.split("-").map(Number);
        
        if (event.repeat_yearly === 1) {
          // Check previous, current, and next solar years to handle cross-year notifications
          const candidateYears = [todayYear - 1, todayYear, todayYear + 1];
          for (const yr of candidateYears) {
            const eventDate = new Date(yr, m - 1, d);
            const diff = getDiffDays(todayMidnight, eventDate);
            if (diff >= 0 && diff <= 7) {
              eventsToNotify.push({ event, diffDays: diff });
              break;
            }
          }
        } else {
          const eventDate = new Date(y, m - 1, d);
          const diff = getDiffDays(todayMidnight, eventDate);
          if (diff >= 0 && diff <= 7) {
            eventsToNotify.push({ event, diffDays: diff });
          }
        }
      } else if (event.date_type === "lunar") {
        const lDay = event.lunar_day;
        const lMonth = event.lunar_month;
        const isLeap = event.is_lunar_leap === 1;

        if (lDay === null || lMonth === null) continue;

        if (event.repeat_yearly === 1) {
          try {
            const lunarToday = solarToLunar(todayMidnight);
            // Check adjacent lunar years to handle shifting date overlaps
            const candidateLunarYears = [lunarToday.year - 1, lunarToday.year, lunarToday.year + 1];
            for (const lyr of candidateLunarYears) {
              try {
                const eventDate = lunarToSolar(lDay, lMonth, lyr, isLeap);
                const diff = getDiffDays(todayMidnight, eventDate);
                if (diff >= 0 && diff <= 7) {
                  eventsToNotify.push({ event, diffDays: diff });
                  break;
                }
              } catch (e) {
                // Ignore invalid leap month for this specific year candidate
              }
            }
          } catch (err) {
            console.error("Error converting lunar date repeat:", err);
          }
        } else {
          const lYear = event.lunar_year;
          if (lYear === null) continue;
          try {
            const eventDate = lunarToSolar(lDay, lMonth, lYear, isLeap);
            const diff = getDiffDays(todayMidnight, eventDate);
            if (diff >= 0 && diff <= 7) {
              eventsToNotify.push({ event, diffDays: diff });
            }
          } catch (err) {
            console.error("Error converting lunar date once:", err);
          }
        }
      }
    }

    if (eventsToNotify.length === 0) return;

    // Retrieve storage logs to prevent duplicate notifications
    const todayDateStr = todayMidnight.toDateString();
    const lastNotifiedCalDay = localStorage.getItem("last_notified_cal_day");
    const notifiedEventIdsStr = localStorage.getItem("notified_event_ids") || "[]";
    let notifiedEventIds: string[] = JSON.parse(notifiedEventIdsStr);

    if (lastNotifiedCalDay !== todayDateStr) {
      // Reset for a new calendar day
      notifiedEventIds = [];
    }

    const newEventsToNotify = eventsToNotify.filter(
      ({ event }) => !notifiedEventIds.includes(event.id)
    );

    if (newEventsToNotify.length === 0) return;

    // Build the notification body with details
    const eventDetails = newEventsToNotify.map(({ event, diffDays }) => {
      const dayText = diffDays === 0 ? "hôm nay" : `sau ${diffDays} ngày nữa`;
      const typeText = event.event_type === "birthday" ? "Sinh nhật" : 
                       event.event_type === "holiday" ? "Ngày lễ" :
                       event.event_type === "anniversary" ? "Ngày kỷ niệm" : "Sự kiện";
      return `- ${typeText}: ${event.title} (${dayText})`;
    });

    const messageTitle = "📅 Nhắc nhở sự kiện đặc biệt!";
    const messageBody = `Sắp diễn ra các sự kiện đặc biệt:\n${eventDetails.join("\n")}`;

    sendNotification(messageTitle, messageBody);

    // Save notified IDs to avoid duplication on subsequent runs
    const updatedEventIds = Array.from(
      new Set([...notifiedEventIds, ...newEventsToNotify.map(({ event }) => event.id)])
    );
    localStorage.setItem("last_notified_cal_day", todayDateStr);
    localStorage.setItem("notified_event_ids", JSON.stringify(updatedEventIds));
  } catch (err) {
    console.error("Error checking calendar events for notifications:", err);
  }
}

// Check database for due or overdue tasks and notify user (throttled to avoid spam)
export async function checkAndNotifyDueTasks(): Promise<void> {
  console.log("[Notification] Running checkAndNotifyDueTasks...");
  const isAllowed = await initNotifications();
  console.log("[Notification] System permission isAllowed:", isAllowed, "permission:", Notification.permission);
  if (!isAllowed) {
    console.warn("[Notification] Permission is denied. Exiting.");
    return;
  }

  // Run calendar events check alongside task check
  await checkAndNotifyCalendarEvents();

  try {
    const db = await getDatabase();
    const todayStr = new Date().toISOString().split("T")[0];
    const queryTime = todayStr + 'T23:59:59';
    console.log("[Notification] Querying active tasks due <= ", queryTime);

    // Fetch tasks that are active (not done) and due date is today or earlier (overdue)
    const activeDueTasks = await db.select<Task[]>(
      `SELECT * FROM tasks 
       WHERE status != 'done' 
         AND due_date IS NOT NULL 
         AND due_date <= ?`,
      [queryTime]
    );

    console.log("[Notification] Found due tasks in database:", activeDueTasks.length, activeDueTasks);

    if (activeDueTasks.length === 0) {
      console.log("[Notification] No due or overdue tasks found in local DB.");
      return;
    }

    // Retrieve storage logs to prevent duplicate notifications
    const today = new Date().toDateString();
    const lastNotifiedDay = localStorage.getItem("last_notified_day");
    const notifiedTaskIdsStr = localStorage.getItem("notified_task_ids") || "[]";
    const notifiedTaskIds: string[] = JSON.parse(notifiedTaskIdsStr);
    console.log("[Notification] Today:", today, "Last notified day:", lastNotifiedDay, "Already notified task IDs:", notifiedTaskIds);

    // Filter out tasks we have already notified in this day
    const tasksToNotify = activeDueTasks.filter(
      (task) => !notifiedTaskIds.includes(task.id) || lastNotifiedDay !== today
    );
    console.log("[Notification] Tasks remaining to notify (after filtering):", tasksToNotify.length, tasksToNotify);

    if (tasksToNotify.length === 0) {
      console.log("[Notification] All due tasks have already been notified today.");
      return;
    }

    // Categorize into overdue (before today) and due today
    const overdueTasks = tasksToNotify.filter((t) => t.due_date! < todayStr);
    const dueTodayTasks = tasksToNotify.filter((t) => t.due_date!.startsWith(todayStr));
    console.log("[Notification] Overdue count:", overdueTasks.length, "Due today count:", dueTodayTasks.length);

    let messageTitle = "Nhắc nhở công việc!";
    let messageBody = "";

    if (overdueTasks.length > 0 && dueTodayTasks.length > 0) {
      messageTitle = "Cảnh báo: Công việc trễ hạn và đến hạn!";
      messageBody = `Bạn có ${overdueTasks.length} việc đã trễ hạn và ${dueTodayTasks.length} việc cần làm hôm nay.`;
    } else if (overdueTasks.length > 0) {
      messageTitle = "⚠️ Cảnh báo: Công việc đã trễ hạn!";
      messageBody = `Bạn có ${overdueTasks.length} công việc chưa hoàn thành đã quá hạn chót!`;
    } else if (dueTodayTasks.length > 0) {
      messageTitle = "📅 Lịch trình: Công việc hôm nay!";
      messageBody = `Bạn có ${dueTodayTasks.length} công việc cần hoàn thành trong hôm nay.`;
    }

    console.log("[Notification] Triggering system notification:", messageTitle, messageBody);
    // Trigger Native Notification
    sendNotification(messageTitle, messageBody);

    // Update notified log in localStorage
    const updatedIds = Array.from(new Set([...notifiedTaskIds, ...activeDueTasks.map((t) => t.id)]));
    localStorage.setItem("last_notified_day", today);
    localStorage.setItem("notified_task_ids", JSON.stringify(updatedIds));
    console.log("[Notification] Successfully notified. Saved state to localStorage.");
  } catch (err) {
    console.error("Error checking due tasks for notifications:", err);
  }
}

// Map taskId -> setTimeout object for exact-time notifications on client
const activeClientJobs = new Map<string, any>();
let nextClientScanTime = Date.now() + 60 * 60 * 1000;

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

// Cancel a scheduled client job
export function cancelClientTaskJob(taskId: string): void {
  const timeout = activeClientJobs.get(taskId);
  if (timeout) {
    clearTimeout(timeout);
    activeClientJobs.delete(taskId);
    console.log("[ClientScheduler] Cancelled job for task:", taskId);
  }
}

// Schedule client task job
export function scheduleClientTaskJob(task: Task): void {
  cancelClientTaskJob(task.id);

  if (task.status === 'done' || !task.due_date) {
    return;
  }

  const taskTime = parseTaskDueDate(task.due_date);
  if (isNaN(taskTime)) return;

  const now = Date.now();
  if (taskTime >= now && taskTime < nextClientScanTime) {
    const delay = taskTime - now;
    const timeout = setTimeout(() => {
      activeClientJobs.delete(task.id);
      
      const title = "🔔 NHẮC NHỞ CÔNG VIỆC ĐẾN HẠN";
      const body = `⏱️ Hiện đã đến giờ thực hiện công việc:\n- ${task.title}`;
      console.log("[ClientScheduler] Triggering exact-time notification for task:", task.title);
      sendNotification(title, body);

      // Prevent duplicate notification in subsequent checkAndNotifyDueTasks calls
      const today = new Date().toDateString();
      const notifiedTaskIdsStr = localStorage.getItem("notified_task_ids") || "[]";
      const notifiedTaskIds: string[] = JSON.parse(notifiedTaskIdsStr);
      const updatedIds = Array.from(new Set([...notifiedTaskIds, task.id]));
      localStorage.setItem("last_notified_day", today);
      localStorage.setItem("notified_task_ids", JSON.stringify(updatedIds));
      
    }, delay);
    activeClientJobs.set(task.id, timeout);
    console.log(`[ClientScheduler] Scheduled exact-time job for task ${task.id} in ${Math.round(delay / 1000)}s`);
  }
}

// Scan database for tasks due in the next 1 hour on client
export async function scanClientTasksForNextHour(): Promise<void> {
  try {
    const db = await getDatabase();
    const now = Date.now();
    nextClientScanTime = now + 60 * 60 * 1000; // Look ahead 1 hour

    console.log(`[ClientScheduler] Scanning tasks due between now and ${new Date(nextClientScanTime).toISOString()}...`);

    const todayStr = new Date().toISOString().split("T")[0];
    const queryTime = todayStr + 'T23:59:59';

    // Fetch active tasks
    const tasks = await db.select<Task[]>(
      `SELECT * FROM tasks 
       WHERE status != 'done' 
         AND due_date IS NOT NULL 
         AND due_date <= ?`,
      [queryTime]
    );

    let scheduledCount = 0;
    for (const task of tasks) {
      const taskTime = parseTaskDueDate(task.due_date);
      if (isNaN(taskTime)) continue;

      if (taskTime >= now && taskTime < nextClientScanTime) {
        scheduleClientTaskJob(task);
        scheduledCount++;
      }
    }

    console.log(`[ClientScheduler] Scan complete. Scheduled ${scheduledCount} tasks.`);
  } catch (err) {
    console.error("[ClientScheduler] Error during scan:", err);
  }
}

// Initialize client-side scheduler
export function initClientTaskScheduler(): void {
  console.log("⏰ Initializing Client-Side Task Scheduler (Time-Exact)...");
  
  // Run first scan immediately
  scanClientTasksForNextHour();

  // Run hourly scans
  setInterval(() => {
    scanClientTasksForNextHour();
  }, 60 * 60 * 1000);

  // Listen for task changes to reschedule
  if (typeof window !== "undefined") {
    const handleTaskUpdated = () => {
      console.log("[ClientScheduler] task-updated event received, rescanning...");
      scanClientTasksForNextHour();
    };
    window.addEventListener("task-updated", handleTaskUpdated);
  }
}
