import { getDatabase } from "../database/db";
import { Task } from "../database/queries/tasks";

// Request browser Notification permission
export async function initNotifications(): Promise<boolean> {
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

// Send system notification safely
export function sendNotification(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  
  try {
    new Notification(title, {
      body,
      icon: "/src/assets/logo.png" // fallback path
    });
  } catch (err) {
    console.error("Failed to display notification:", err);
  }
}

// Check database for due or overdue tasks and notify user (throttled to avoid spam)
export async function checkAndNotifyDueTasks(): Promise<void> {
  const isAllowed = await initNotifications();
  if (!isAllowed) return;

  try {
    const db = await getDatabase();
    const todayStr = new Date().toISOString().split("T")[0];

    // Fetch tasks that are active (not done) and due date is today or earlier (overdue)
    const activeDueTasks = await db.select<Task[]>(
      `SELECT * FROM tasks 
       WHERE status != 'done' 
         AND due_date IS NOT NULL 
         AND due_date <= ?`,
      [todayStr]
    );

    if (activeDueTasks.length === 0) return;

    // Retrieve storage logs to prevent duplicate notifications
    const today = new Date().toDateString();
    const lastNotifiedDay = localStorage.getItem("last_notified_day");
    const notifiedTaskIdsStr = localStorage.getItem("notified_task_ids") || "[]";
    const notifiedTaskIds: string[] = JSON.parse(notifiedTaskIdsStr);

    // Filter out tasks we have already notified in this day
    const tasksToNotify = activeDueTasks.filter(
      (task) => !notifiedTaskIds.includes(task.id) || lastNotifiedDay !== today
    );

    if (tasksToNotify.length === 0) return;

    // Categorize into overdue (before today) and due today
    const overdueTasks = tasksToNotify.filter((t) => t.due_date! < todayStr);
    const dueTodayTasks = tasksToNotify.filter((t) => t.due_date! === todayStr);

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

    // Trigger Native Notification
    sendNotification(messageTitle, messageBody);

    // Update notified log in localStorage
    const updatedIds = Array.from(new Set([...notifiedTaskIds, ...activeDueTasks.map((t) => t.id)]));
    localStorage.setItem("last_notified_day", today);
    localStorage.setItem("notified_task_ids", JSON.stringify(updatedIds));
  } catch (err) {
    console.error("Error checking due tasks for notifications:", err);
  }
}
