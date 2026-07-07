import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Cake,
  ChevronLeft,
  ChevronRight,
  Gift,
  Moon,
  Plus,
  RotateCcw,
  Star,
  Sun,
  Trash2,
  Check
} from "lucide-react";
import {
  CalendarDateType,
  CalendarEvent,
  CalendarEventType,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents
} from "../../../shared/database/queries/calendarEvents";
import { vietnamHolidays } from "../../../shared/data/vietnamHolidays";
import { formatLunarDate, lunarToSolar, solarToLunar } from "../../../shared/utils/lunarCalendar";
import { useLanguage } from "../../../shared/contexts/LanguageContext";

interface CalendarViewProps {
  triggerToast: (message: string) => void;
}

type DisplayCalendarEvent = CalendarEvent & { isBuiltInHoliday?: boolean };
type CalendarViewMode = "month" | "year";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addYears(date: Date, amount: number): Date {
  return new Date(date.getFullYear() + amount, date.getMonth(), 1);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function dateInMonthWithClampedDay(year: number, monthIndex: number, preferredDay: number): Date {
  return new Date(year, monthIndex, Math.min(preferredDay, daysInMonth(year, monthIndex)));
}

function getCalendarGrid(monthDate: Date): Date[] {
  const first = startOfMonth(monthDate);
  const mondayIndex = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function formatSolarLong(date: Date, locale: string = "vi-VN"): string {
  return date.toLocaleDateString(locale, {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function eventColor(event: CalendarEvent): string {
  if (event.event_type === "birthday") return "bg-pink-500/10 text-pink-600 dark:text-pink-300 border-pink-500/20";
  if (event.event_type === "holiday") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20";
  if (event.event_type === "anniversary") return "bg-amber-500/10 text-amber-650 dark:text-amber-300 border-amber-500/20";
  return "bg-purple-500/10 text-purple-650 dark:text-purple-300 border-purple-500/20";
}

function eventIcon(event: CalendarEvent) {
  if (event.event_type === "birthday") return Cake;
  if (event.event_type === "holiday") return Gift;
  return Star;
}

function eventTypeLabel(event: CalendarEvent, options: Array<{ value: CalendarEventType; label: string }>): string {
  return options.find(option => option.value === event.event_type)?.label || "Quan trọng";
}

function eventOccursOnDate(event: CalendarEvent, date: Date): boolean {
  if (event.date_type === "solar") {
    if (!event.solar_date) return false;
    const eventDate = parseDateKey(event.solar_date);
    if (event.repeat_yearly === 1) {
      return eventDate.getMonth() === date.getMonth() && eventDate.getDate() === date.getDate();
    }
    return event.solar_date === toDateKey(date);
  }

  const lunar = solarToLunar(date);
  const sameLunarDate =
    event.lunar_day === lunar.day &&
    event.lunar_month === lunar.month &&
    (event.is_lunar_leap || 0) === (lunar.isLeap ? 1 : 0);

  if (!sameLunarDate) return false;
  return event.repeat_yearly === 1 || event.lunar_year === lunar.year;
}

function getDefaultLunarForm(date: Date) {
  const lunar = solarToLunar(date);
  return {
    lunarDay: String(lunar.day),
    lunarMonth: String(lunar.month),
    lunarYear: String(lunar.year),
    isLeap: lunar.isLeap
  };
}

export default function CalendarView({ triggerToast }: CalendarViewProps) {
  const { t, language } = useLanguage();
  const today = useMemo(() => new Date(), []);
  const jumpDateRef = useRef<HTMLInputElement>(null);
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(today));

  const weekdays = language === "vi" 
    ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] 
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const monthNames = language === "vi"
    ? [
        "Tháng 1",
        "Tháng 2",
        "Tháng 3",
        "Tháng 4",
        "Tháng 5",
        "Tháng 6",
        "Tháng 7",
        "Tháng 8",
        "Tháng 9",
        "Tháng 10",
        "Tháng 11",
        "Tháng 12"
      ]
    : [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ];

  const eventTypeOptions: Array<{ value: CalendarEventType; label: string }> = [
    { value: "birthday", label: t("calendar.eventTypeBirthday") },
    { value: "holiday", label: t("calendar.eventTypeHoliday") },
    { value: "anniversary", label: t("calendar.eventTypeAnniversary") },
    { value: "other", label: language === "vi" ? "Quan trọng" : "Important" }
  ];

  const getEventLabel = (event: CalendarEvent): string => {
    return eventTypeLabel(event, eventTypeOptions);
  };

  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [jumpDate, setJumpDate] = useState(toDateKey(today));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<CalendarEventType>("birthday");
  const [dateType, setDateType] = useState<CalendarDateType>("solar");
  const [solarDate, setSolarDate] = useState(toDateKey(today));
  const [lunarDay, setLunarDay] = useState(getDefaultLunarForm(today).lunarDay);
  const [lunarMonth, setLunarMonth] = useState(getDefaultLunarForm(today).lunarMonth);
  const [lunarYear, setLunarYear] = useState(getDefaultLunarForm(today).lunarYear);
  const [isLunarLeap, setIsLunarLeap] = useState(getDefaultLunarForm(today).isLeap);
  const [repeatYearly, setRepeatYearly] = useState(true);
  const [isImportant, setIsImportant] = useState(true);
  const [notes, setNotes] = useState("");
  const [showAddEventMobile, setShowAddEventMobile] = useState(false);

  const gridDays = useMemo(() => getCalendarGrid(currentMonth), [currentMonth]);
  const builtInHolidays = useMemo<DisplayCalendarEvent[]>(
    () => vietnamHolidays.map(event => ({ ...event, isBuiltInHoliday: true })),
    []
  );
  const displayEvents = useMemo<DisplayCalendarEvent[]>(
    () => [...builtInHolidays, ...events],
    [builtInHolidays, events]
  );
  const selectedLunar = solarToLunar(selectedDate);
  const selectedEvents = displayEvents.filter(event => eventOccursOnDate(event, selectedDate));

  const loadEvents = async () => {
    try {
      const list = await getCalendarEvents();
      setEvents(list);
    } catch (err) {
      console.error("Failed to load calendar events:", err);
      triggerToast("Lỗi tải lịch.");
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    const handleSyncUpdate = () => {
      loadEvents();
    };
    window.addEventListener("calendar-updated", handleSyncUpdate);
    return () => {
      window.removeEventListener("calendar-updated", handleSyncUpdate);
    };
  }, []);

  useEffect(() => {
    const event = new CustomEvent("mobile-drawer-toggle", {
      detail: { open: showAddEventMobile }
    });
    window.dispatchEvent(event);
  }, [showAddEventMobile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      const key = event.key.toLowerCase();
      if (key === "t") {
        event.preventDefault();
        handleToday();
      } else if (key === "g") {
        event.preventDefault();
        jumpDateRef.current?.focus();
      } else if (key === "m") {
        event.preventDefault();
        setViewMode("month");
      } else if (key === "y") {
        event.preventDefault();
        setViewMode("year");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.shiftKey ? navigateYear(-1) : navigateMonth(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        event.shiftKey ? navigateYear(1) : navigateMonth(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const syncFormDateFromSelection = (date: Date) => {
    setSelectedDate(date);
    setJumpDate(toDateKey(date));
    setSolarDate(toDateKey(date));
    const lunar = getDefaultLunarForm(date);
    setLunarDay(lunar.lunarDay);
    setLunarMonth(lunar.lunarMonth);
    setLunarYear(lunar.lunarYear);
    setIsLunarLeap(lunar.isLeap);
  };

  const showDate = (date: Date, mode: CalendarViewMode = viewMode) => {
    setCurrentMonth(startOfMonth(date));
    setViewMode(mode);
    syncFormDateFromSelection(date);
  };

  const navigateMonth = (amount: number) => {
    const targetMonth = addMonths(currentMonth, amount);
    const targetDate = dateInMonthWithClampedDay(
      targetMonth.getFullYear(),
      targetMonth.getMonth(),
      selectedDate.getDate()
    );
    showDate(targetDate, "month");
  };

  const navigateYear = (amount: number) => {
    const targetMonth = addYears(currentMonth, amount);
    const targetDate = dateInMonthWithClampedDay(
      targetMonth.getFullYear(),
      targetMonth.getMonth(),
      selectedDate.getDate()
    );
    showDate(targetDate, viewMode);
  };

  const handleMonthSelect = (monthIndex: number) => {
    const targetDate = dateInMonthWithClampedDay(currentMonth.getFullYear(), monthIndex, selectedDate.getDate());
    showDate(targetDate, "month");
  };

  const handleYearInput = (value: string) => {
    const targetYear = Number(value);
    if (!Number.isInteger(targetYear) || targetYear < 1900 || targetYear > 2100) return;
    const targetDate = dateInMonthWithClampedDay(targetYear, currentMonth.getMonth(), selectedDate.getDate());
    showDate(targetDate, viewMode);
  };

  const handleJumpDate = (value: string) => {
    setJumpDate(value);
    if (!value) return;
    const targetDate = parseDateKey(value);
    if (Number.isNaN(targetDate.getTime())) return;
    showDate(targetDate, "month");
  };

  const handleSelectDate = (date: Date) => {
    syncFormDateFromSelection(date);
    setViewMode("month");
    if (date.getMonth() !== currentMonth.getMonth() || date.getFullYear() !== currentMonth.getFullYear()) {
      setCurrentMonth(startOfMonth(date));
    }
  };

  const handleToday = () => {
    showDate(today, "month");
  };

  const resetForm = () => {
    setTitle("");
    setEventType("birthday");
    setDateType("solar");
    setRepeatYearly(true);
    setIsImportant(true);
    setNotes("");
    syncFormDateFromSelection(selectedDate);
  };

  const handleSaveEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      triggerToast(language === "vi" ? "Vui lòng nhập tên sự kiện." : "Please enter event name.");
      return;
    }

    let normalizedSolarDate: string | null = solarDate;
    let normalizedLunarDay: number | null = null;
    let normalizedLunarMonth: number | null = null;
    let normalizedLunarYear: number | null = null;
    let normalizedLeap = 0;

    try {
      if (dateType === "solar") {
        const solar = parseDateKey(solarDate);
        const lunar = solarToLunar(solar);
        normalizedLunarDay = lunar.day;
        normalizedLunarMonth = lunar.month;
        normalizedLunarYear = lunar.year;
        normalizedLeap = lunar.isLeap ? 1 : 0;
      } else {
        normalizedLunarDay = Number(lunarDay);
        normalizedLunarMonth = Number(lunarMonth);
        normalizedLunarYear = repeatYearly ? null : Number(lunarYear);
        normalizedLeap = isLunarLeap ? 1 : 0;

        if (
          !Number.isInteger(normalizedLunarDay) ||
          !Number.isInteger(normalizedLunarMonth) ||
          normalizedLunarDay < 1 ||
          normalizedLunarDay > 30 ||
          normalizedLunarMonth < 1 ||
          normalizedLunarMonth > 12
        ) {
          triggerToast(language === "vi" ? "Ngày âm lịch không hợp lệ." : "Invalid lunar date.");
          return;
        }

        if (!repeatYearly) {
          const oneTimeLunarYear = Number(lunarYear);
          if (!Number.isInteger(oneTimeLunarYear) || oneTimeLunarYear < 1900) {
            triggerToast(language === "vi" ? "Vui lòng nhập năm âm lịch hợp lệ." : "Please enter a valid lunar year.");
            return;
          }
          normalizedLunarYear = oneTimeLunarYear;
          normalizedSolarDate = toDateKey(
            lunarToSolar(normalizedLunarDay, normalizedLunarMonth, oneTimeLunarYear, isLunarLeap)
          );
        } else {
          normalizedSolarDate = null;
        }
      }

      await createCalendarEvent({
        id: Math.random().toString(36).substring(2, 11),
        title: title.trim(),
        event_type: eventType,
        date_type: dateType,
        solar_date: normalizedSolarDate,
        lunar_day: normalizedLunarDay,
        lunar_month: normalizedLunarMonth,
        lunar_year: normalizedLunarYear,
        is_lunar_leap: normalizedLeap,
        repeat_yearly: repeatYearly ? 1 : 0,
        is_important: isImportant ? 1 : 0,
        notes: notes.trim() || null
      });

      triggerToast(t("calendar.saveSuccess"));
      resetForm();
      await loadEvents();
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || t("calendar.saveError"));
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteCalendarEvent(id);
      triggerToast(t("calendar.deleteSuccess"));
      await loadEvents();
    } catch (err) {
      console.error(err);
      triggerToast(t("calendar.deleteError"));
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden space-y-4 view-enter-animate">
      <div className="flex flex-col gap-3 shrink-0">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white">{t("calendar.title")}</h3>
          <p className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-zinc-400">
            {t("calendar.description")}
          </p>
        </div>

        <div className="w-full text-xs">
          <div className="grid gap-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100/70 dark:bg-zinc-900/60 p-2 shadow-sm 2xl:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex items-center gap-2">
              <div className="hidden sm:grid grid-cols-2 rounded-lg bg-white/70 dark:bg-zinc-950/40 p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("month")}
                  className={`h-8 px-3 rounded-md text-[10px] font-bold transition-all ${
                    viewMode === "month"
                      ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                  }`}
                >
                  {t("calendar.month")}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("year")}
                  className={`h-8 px-3 rounded-md text-[10px] font-bold transition-all ${
                    viewMode === "year"
                      ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                  }`}
                >
                  {t("calendar.year")}
                </button>
              </div>

              <div className="rounded-lg bg-white/70 dark:bg-zinc-950/40 p-0.5 shrink-0 flex-1 sm:flex-none flex w-full">
                <button
                  type="button"
                  onClick={handleToday}
                  className="h-8 px-3 rounded-md bg-white dark:bg-zinc-800 text-[10px] font-bold text-zinc-900 dark:text-white shadow-sm flex items-center justify-center gap-1.5 w-full transition-all active:scale-[0.98]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t("calendar.today")}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-[minmax(112px,1fr)_124px] sm:grid-cols-[minmax(120px,1fr)_124px_136px] items-center gap-1.5 min-w-0">
              <select
                value={currentMonth.getMonth()}
                onChange={(event) => handleMonthSelect(Number(event.target.value))}
                className="h-8 w-full min-w-0 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/60 px-2 text-[10px] font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none"
                title="Chọn tháng"
                aria-label="Chọn tháng"
              >
                {monthNames.map((name, index) => (
                  <option key={name} value={index}>{name}</option>
                ))}
              </select>
              <div className="grid h-8 grid-cols-[32px_minmax(0,1fr)_32px] overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950/60">
                <button
                  type="button"
                  onClick={() => navigateYear(-1)}
                  className="flex items-center justify-center text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                  title="Giảm 1 năm"
                  aria-label="Giảm 1 năm"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={currentMonth.getFullYear()}
                  onChange={(event) => handleYearInput(event.target.value)}
                  className="h-full min-w-0 border-x border-zinc-200 bg-transparent px-1 text-center text-[10px] font-bold text-zinc-850 dark:text-zinc-200 focus:outline-none dark:border-white/10"
                  title="Chọn năm"
                  aria-label="Chọn năm"
                />
                <button
                  type="button"
                  onClick={() => navigateYear(1)}
                  className="flex items-center justify-center text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                  title="Tăng 1 năm"
                  aria-label="Tăng 1 năm"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                ref={jumpDateRef}
                type="date"
                value={jumpDate}
                onChange={(event) => handleJumpDate(event.target.value)}
                className="col-span-2 h-8 w-full sm:col-span-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/60 px-2 text-[10px] font-semibold text-zinc-850 dark:text-zinc-200 focus:outline-none"
                title={t("calendar.goToDate")}
                aria-label={t("calendar.goToDate")}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 flex-1 min-h-0 overflow-y-auto xl:overflow-hidden">
        <section className="glass-panel rounded-xl p-3 sm:p-4 flex flex-col min-h-[340px] sm:min-h-[620px] xl:min-h-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/5 pb-3 mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-600/15 text-purple-650 dark:text-purple-300 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-zinc-950 dark:text-white">
                  {viewMode === "month" ? (language === "vi" ? `Tháng ${currentMonth.getMonth() + 1}` : monthNames[currentMonth.getMonth()]) : (language === "vi" ? "Cả năm" : "Whole Year")} {currentMonth.getFullYear()}
                </h4>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {viewMode === "month" ? t("calendar.calendarGuide") : (language === "vi" ? "Bấm vào một tháng để mở lịch chi tiết." : "Click a month to open detailed calendar.")}
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-amber-400" /> {t("calendar.sun")}</span>
              <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-purple-400" /> {t("calendar.moon")}</span>
            </div>
          </div>

          {viewMode === "month" ? (
            <>
              <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-zinc-500 dark:text-zinc-500 uppercase shrink-0">
                {weekdays.map(day => (
                  <div key={day} className="py-1">{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5 flex-1 min-h-0">
                {gridDays.map(date => {
                  const key = toDateKey(date);
                  const lunar = solarToLunar(date);
                  const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                  const isToday = key === toDateKey(today);
                  const isSelected = key === toDateKey(selectedDate);
                  const dayEvents = displayEvents.filter(event => eventOccursOnDate(event, date));

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectDate(date)}
                      className={`min-h-[56px] sm:min-h-[96px] rounded-lg border p-1.5 sm:p-2 text-left flex flex-col justify-between sm:justify-start gap-1 transition-all overflow-hidden ${
                        isSelected
                          ? "border-purple-500 bg-purple-500/10 shadow-sm shadow-purple-500/10"
                          : "border-zinc-200 dark:border-white/5 bg-zinc-100/50 dark:bg-zinc-900/35 hover:border-purple-500/30"
                      } ${isCurrentMonth ? "" : "opacity-45"} ${isToday ? "ring-1 ring-teal-400/50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-1 w-full shrink-0">
                        <span className={`text-[11px] sm:text-sm font-bold ${isToday ? "text-teal-600 dark:text-teal-300" : "text-zinc-900 dark:text-zinc-100"}`}>
                          {date.getDate()}
                        </span>
                        <span className="shrink-0 text-right text-[7px] sm:text-[9px] leading-tight text-zinc-500 dark:text-zinc-500 font-mono">
                          {lunar.day === 1 ? `${lunar.day}/${lunar.month}` : lunar.day}
                          <span className="hidden sm:inline"> AL</span>
                        </span>
                      </div>

                      {/* Desktop Event Text Labels */}
                      <div className="hidden sm:block space-y-1 overflow-hidden w-full flex-1">
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            className={`truncate rounded border px-1.5 py-0.5 text-[9px] font-semibold ${eventColor(event)}`}
                            title={event.title}
                          >
                            {event.date_type === "lunar" ? "ÂL " : ""}
                            {event.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[9px] text-zinc-500 dark:text-zinc-400">+{dayEvents.length - 3} {language === "vi" ? "mục" : "items"}</div>
                        )}
                      </div>

                      {/* Mobile Event Dot Indicators */}
                      <div className="sm:hidden flex flex-wrap gap-1 justify-start items-center w-full min-h-[6px] mt-0.5 overflow-hidden">
                        {dayEvents.slice(0, 4).map(event => {
                          let dotColor = "bg-purple-500";
                          if (event.isBuiltInHoliday || event.event_type === "holiday") dotColor = "bg-emerald-500";
                          else if (event.event_type === "birthday") dotColor = "bg-pink-500";
                          else if (event.event_type === "anniversary") dotColor = "bg-amber-500";
                          return (
                            <span 
                              key={event.id} 
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`}
                              title={event.title}
                            />
                          );
                        })}
                        {dayEvents.length > 4 && (
                          <span className="text-[7px] font-bold text-zinc-450">+</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3 overflow-y-auto pr-1">
              {monthNames.map((monthName, monthIndex) => {
                const monthDate = new Date(currentMonth.getFullYear(), monthIndex, 1);
                const days = Array.from(
                  { length: daysInMonth(currentMonth.getFullYear(), monthIndex) },
                  (_, index) => new Date(currentMonth.getFullYear(), monthIndex, index + 1)
                );
                const monthEvents = displayEvents.filter(event => days.some(day => eventOccursOnDate(event, day)));
                const isThisMonth =
                  today.getFullYear() === currentMonth.getFullYear() && today.getMonth() === monthIndex;
                const isSelectedMonth =
                  selectedDate.getFullYear() === currentMonth.getFullYear() && selectedDate.getMonth() === monthIndex;

                return (
                  <button
                    key={monthName}
                    type="button"
                    onClick={() => showDate(monthDate, "month")}
                    className={`min-h-36 rounded-lg border p-3 text-left transition-all flex flex-col gap-2 ${
                      isSelectedMonth
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-zinc-200 dark:border-white/5 bg-zinc-100/50 dark:bg-zinc-900/35 hover:border-purple-500/30"
                    } ${isThisMonth ? "ring-1 ring-teal-400/50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h5 className="text-xs font-bold text-zinc-950 dark:text-white">{monthName}</h5>
                        <p className="text-[9px] text-zinc-500 dark:text-zinc-400">{t("calendar.eventsCount", { count: monthEvents.length })}</p>
                      </div>
                      <span className="rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[9px] font-bold text-zinc-600 dark:text-zinc-300">
                        {monthIndex + 1}
                      </span>
                    </div>

                    <div className="space-y-1 overflow-hidden">
                      {monthEvents.slice(0, 5).map(event => (
                        <div
                          key={event.id}
                          className={`truncate rounded border px-1.5 py-0.5 text-[9px] font-semibold ${eventColor(event)}`}
                          title={event.title}
                        >
                          {event.date_type === "lunar" ? (language === "vi" ? "ÂL " : "Lunar ") : ""}
                          {event.title}
                        </div>
                      ))}
                      {monthEvents.length === 0 && (
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-450">{language === "vi" ? "Không có mục nổi bật." : "No prominent events."}</div>
                      )}
                      {monthEvents.length > 5 && (
                        <div className="text-[9px] text-zinc-500 dark:text-zinc-400">+{monthEvents.length - 5} {language === "vi" ? "mục khác" : "more items"}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4 xl:overflow-y-auto xl:pr-1">
          <section className="glass-panel rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 dark:border-white/5 pb-3">
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">{formatSolarLong(selectedDate, language === "vi" ? "vi-VN" : "en-US")}</h4>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{t("calendar.lunarDate")}{formatLunarDate(selectedLunar)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddEventMobile(true)}
                  className="sm:hidden flex items-center justify-center gap-1 px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-[10px] font-bold text-white transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  {t("calendar.addBtn")}
                </button>
                <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[9px] font-bold text-purple-650 dark:text-purple-300">
                  {t("calendar.eventsCount", { count: selectedEvents.length })}
                </span>
              </div>
            </div>

            {selectedEvents.length > 0 ? (
              <div className="space-y-2">
                {selectedEvents.map(event => {
                  const Icon = eventIcon(event);
                  return (
                    <div key={event.id} className={`rounded-lg border p-2.5 ${eventColor(event)}`}>
                      <div className="flex items-start gap-2">
                        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold truncate">{event.title}</p>
                            {event.is_important === 1 && <Star className="w-3 h-3 fill-current shrink-0" />}
                          </div>
                          <p className="text-[9px] opacity-80">
                            {event.isBuiltInHoliday ? t("calendar.holidayViet") : getEventLabel(event)} · {event.date_type === "lunar" ? t("calendar.dateTypeLunar") : t("calendar.dateTypeSolar")}
                            {event.repeat_yearly === 1 ? ` · ${t("calendar.repeatAnnual")}` : ""}
                          </p>
                          {event.notes ? <p className="mt-1 text-[10px] opacity-90 break-words">{event.notes}</p> : null}
                        </div>
                        {!event.isBuiltInHoliday && (
                          <button
                            type="button"
                            onClick={() => handleDeleteEvent(event.id)}
                            className="p-1 rounded hover:bg-red-500/10 hover:text-red-400 transition-all"
                            title={t("calendar.deleteEvent")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-4 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-100/50 dark:bg-zinc-900/35 gap-2">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t("calendar.noEvents")}
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddEventMobile(true)}
                  className="sm:hidden flex items-center gap-1 text-[10px] font-bold text-purple-650 dark:text-purple-400 hover:underline py-1 px-2 cursor-pointer"
                  title={t("calendar.addEvent")}
                >
                  <Plus className="w-3 h-3" /> {t("calendar.addEvent")}
                </button>
              </div>
            )}
          </section>

          <form onSubmit={handleSaveEvent} className="hidden sm:block glass-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-white/5 pb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-300 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-950 dark:text-white">{t("calendar.formTitle")}</h4>
                <p className="text-[9px] text-zinc-500 dark:text-zinc-500">{t("calendar.formDesc")}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.eventName")}</label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("calendar.eventNamePlaceholder")}
                className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.eventType")}</label>
                <select
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value as CalendarEventType)}
                  className="w-full p-2.5 rounded glass-input bg-white dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
                >
                  {eventTypeOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.dateType")}</label>
                <select
                  value={dateType}
                  onChange={(event) => setDateType(event.target.value as CalendarDateType)}
                  className="w-full p-2.5 rounded glass-input bg-white dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
                >
                  <option value="solar">{t("calendar.dateTypeSolar")}</option>
                  <option value="lunar">{t("calendar.dateTypeLunar")}</option>
                </select>
              </div>
            </div>

            {dateType === "solar" ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.dateSolar")}</label>
                <input
                  type="date"
                  value={solarDate}
                  onChange={(event) => {
                    setSolarDate(event.target.value);
                    const date = parseDateKey(event.target.value);
                    setSelectedDate(date);
                    setCurrentMonth(startOfMonth(date));
                    const lunar = getDefaultLunarForm(date);
                    setLunarDay(lunar.lunarDay);
                    setLunarMonth(lunar.lunarMonth);
                    setLunarYear(lunar.lunarYear);
                    setIsLunarLeap(lunar.isLeap);
                  }}
                  className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.dateLunar")}</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={lunarDay}
                    onChange={(event) => setLunarDay(event.target.value)}
                    className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{language === "vi" ? "Tháng âm" : "Lunar Month"}</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={lunarMonth}
                    onChange={(event) => setLunarMonth(event.target.value)}
                    className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{language === "vi" ? "Năm âm" : "Lunar Year"}</label>
                  <input
                    type="number"
                    min={1900}
                    disabled={repeatYearly}
                    value={lunarYear}
                    onChange={(event) => setLunarYear(event.target.value)}
                    className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none disabled:opacity-50"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 text-[10px] text-zinc-650 dark:text-zinc-400">
              <label className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-100/50 dark:bg-zinc-900/35 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={repeatYearly}
                  onChange={(event) => setRepeatYearly(event.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 text-purple-600 focus:ring-purple-600"
                />
                {t("calendar.repeatAnnual")}
              </label>

              {dateType === "lunar" && (
                <label className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-100/50 dark:bg-zinc-900/35 px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={isLunarLeap}
                    onChange={(event) => setIsLunarLeap(event.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-700 text-purple-650 focus:ring-purple-650"
                  />
                  {language === "vi" ? "Tháng âm nhuận" : "Leap Month"}
                </label>
              )}

              <label className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-100/50 dark:bg-zinc-900/35 px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={isImportant}
                  onChange={(event) => setIsImportant(event.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 text-purple-650 focus:ring-purple-650"
                />
                {t("calendar.markImportant")}
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.notes")}</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t("calendar.notesPlaceholder")}
                className="w-full min-h-20 p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-2 rounded bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 transition-all"
              >
                {t("calendar.resetForm")}
              </button>
              <button
                type="submit"
                className="px-3.5 py-2 rounded bg-purple-600 hover:bg-purple-500 text-[10px] font-semibold text-white transition-all shadow-md shadow-purple-500/10 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {t("calendar.save")}
              </button>
            </div>
          </form>
        </aside>
      </div>

      {/* Mobile Slide-up Bottom Drawer Form */}
      {showAddEventMobile && (
        <div className="sm:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowAddEventMobile(false)} />
          
          <div className="relative w-full max-h-[85%] bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-white/10 rounded-t-2xl p-4 overflow-y-auto space-y-4 shadow-2xl z-50 select-text">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-250 dark:border-white/5">
              <div>
                <h4 className="text-xs font-bold text-zinc-950 dark:text-white">{t("calendar.formTitle")}</h4>
                <p className="text-[9px] text-zinc-500 dark:text-zinc-550">{t("calendar.formDesc")}</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowAddEventMobile(false)}
                className="text-[11px] font-bold text-purple-650 dark:text-purple-400 p-1 hover:underline cursor-pointer"
              >
                {t("calendar.closeBtn")}
              </button>
            </div>
            
            <form 
              onSubmit={async (e) => {
                await handleSaveEvent(e);
                setShowAddEventMobile(false);
              }} 
              className="space-y-3"
            >
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.eventName")}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("calendar.eventNamePlaceholder")}
                  className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.eventType")}</label>
                  <select
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value as CalendarEventType)}
                    className="w-full p-2.5 rounded glass-input bg-white dark:bg-zinc-900 text-xs text-zinc-855 dark:text-zinc-300 focus:outline-none" // wait, original used text-zinc-850
                  >
                    {eventTypeOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.dateType")}</label>
                  <select
                    value={dateType}
                    onChange={(event) => setDateType(event.target.value as CalendarDateType)}
                    className="w-full p-2.5 rounded glass-input bg-white dark:bg-zinc-900 text-xs text-zinc-855 dark:text-zinc-300 focus:outline-none" // wait, original used text-zinc-850
                  >
                    <option value="solar">{t("calendar.dateTypeSolar")}</option>
                    <option value="lunar">{t("calendar.dateTypeLunar")}</option>
                  </select>
                </div>
              </div>

              {dateType === "solar" ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.dateSolar")}</label>
                  <input
                    type="date"
                    value={solarDate}
                    onChange={(event) => {
                      setSolarDate(event.target.value);
                      const date = parseDateKey(event.target.value);
                      setSelectedDate(date);
                      setCurrentMonth(startOfMonth(date));
                      const lunar = getDefaultLunarForm(date);
                      setLunarDay(lunar.lunarDay);
                      setLunarMonth(lunar.lunarMonth);
                      setLunarYear(lunar.lunarYear);
                      setIsLunarLeap(lunar.isLeap);
                    }}
                    className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.dateLunar")}</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={lunarDay}
                      onChange={(event) => setLunarDay(event.target.value)}
                      className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{language === "vi" ? "Tháng âm" : "Lunar Month"}</label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={lunarMonth}
                      onChange={(event) => setLunarMonth(event.target.value)}
                      className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{language === "vi" ? "Năm âm" : "Lunar Year"}</label>
                    <input
                      type="number"
                      min={1900}
                      disabled={repeatYearly}
                      value={lunarYear}
                      onChange={(event) => setLunarYear(event.target.value)}
                      className="w-full p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 text-[10px] text-zinc-650 dark:text-zinc-400">
                <label className="flex items-center gap-2 rounded-lg border border-zinc-200/60 dark:border-white/5 bg-zinc-100/50 dark:bg-zinc-900/35 px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={repeatYearly}
                    onChange={(event) => setRepeatYearly(event.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-700 text-purple-650 focus:ring-purple-650"
                  />
                  {t("calendar.repeatAnnual")}
                </label>

                {dateType === "lunar" && (
                  <label className="flex items-center gap-2 rounded-lg border border-zinc-200/60 dark:border-white/5 bg-zinc-100/50 dark:bg-zinc-900/35 px-2.5 py-2">
                    <input
                      type="checkbox"
                      checked={isLunarLeap}
                      onChange={(event) => setIsLunarLeap(event.target.checked)}
                      className="rounded border-zinc-300 dark:border-zinc-700 text-purple-650 focus:ring-purple-650"
                    />
                    {language === "vi" ? "Tháng âm nhuận" : "Leap Month"}
                  </label>
                )}

                <label className="flex items-center gap-2 rounded-lg border border-zinc-200/60 dark:border-white/5 bg-zinc-100/50 dark:bg-zinc-900/35 px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={isImportant}
                    onChange={(event) => setIsImportant(event.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-700 text-purple-650 focus:ring-purple-650"
                  />
                  {t("calendar.markImportant")}
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-zinc-650 dark:text-zinc-400">{t("calendar.notes")}</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={t("calendar.notesPlaceholder")}
                  className="w-full min-h-20 p-2.5 rounded glass-input text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3.5 py-2 rounded bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-[10px] font-bold text-zinc-700 dark:text-zinc-350 transition-all active:scale-[0.98]"
                >
                  {t("calendar.resetForm")}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-500 text-[10px] font-bold text-white transition-all shadow-md shadow-purple-500/10 flex items-center gap-1.5 active:scale-[0.98]"
                >
                  <Check className="w-3.5 h-3.5" />
                  {t("calendar.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
