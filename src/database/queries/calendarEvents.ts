import { getDatabase } from "../db";

export type CalendarEventType = "birthday" | "holiday" | "anniversary" | "other";
export type CalendarDateType = "solar" | "lunar";

export interface CalendarEvent {
  id: string;
  title: string;
  event_type: CalendarEventType;
  date_type: CalendarDateType;
  solar_date: string | null;
  lunar_day: number | null;
  lunar_month: number | null;
  lunar_year: number | null;
  is_lunar_leap: number;
  repeat_yearly: number;
  is_important: number;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const db = await getDatabase();
  return await db.select<CalendarEvent[]>("SELECT * FROM calendar_events ORDER BY created_at DESC");
}

export async function createCalendarEvent(event: CalendarEvent): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO calendar_events (
      id, title, event_type, date_type, solar_date, lunar_day, lunar_month, lunar_year,
      is_lunar_leap, repeat_yearly, is_important, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.title,
      event.event_type,
      event.date_type,
      event.solar_date,
      event.lunar_day,
      event.lunar_month,
      event.lunar_year,
      event.is_lunar_leap,
      event.repeat_yearly,
      event.is_important,
      event.notes || null
    ]
  );
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM calendar_events WHERE id = ?", [id]);
}
