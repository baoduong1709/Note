import { CalendarEvent } from "../database/queries/calendarEvents";

type HolidaySeed = Omit<CalendarEvent, "created_at" | "updated_at">;

const solarHoliday = (
  id: string,
  title: string,
  month: number,
  day: number,
  notes: string,
  isImportant = true
): HolidaySeed => ({
  id,
  title,
  event_type: "holiday",
  date_type: "solar",
  solar_date: `2000-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  lunar_day: null,
  lunar_month: null,
  lunar_year: null,
  is_lunar_leap: 0,
  repeat_yearly: 1,
  is_important: isImportant ? 1 : 0,
  notes
});

const lunarHoliday = (
  id: string,
  title: string,
  month: number,
  day: number,
  notes: string,
  isImportant = true
): HolidaySeed => ({
  id,
  title,
  event_type: "holiday",
  date_type: "lunar",
  solar_date: null,
  lunar_day: day,
  lunar_month: month,
  lunar_year: null,
  is_lunar_leap: 0,
  repeat_yearly: 1,
  is_important: isImportant ? 1 : 0,
  notes
});

export const vietnamHolidays: HolidaySeed[] = [
  solarHoliday("vn-new-year", "Tết Dương lịch", 1, 1, "Ngày nghỉ lễ chính thức."),
  solarHoliday("vn-party-founding", "Ngày thành lập Đảng Cộng sản Việt Nam", 2, 3, "Ngày kỷ niệm chính trị - lịch sử.", false),
  solarHoliday("vn-women-international", "Ngày Quốc tế Phụ nữ", 3, 8, "Ngày được kỷ niệm rộng rãi tại Việt Nam.", false),
  solarHoliday("vn-reunification", "Ngày Chiến thắng 30/4", 4, 30, "Ngày nghỉ lễ chính thức."),
  solarHoliday("vn-labor-day", "Ngày Quốc tế Lao động", 5, 1, "Ngày nghỉ lễ chính thức."),
  solarHoliday("vn-ho-chi-minh-birthday", "Ngày sinh Chủ tịch Hồ Chí Minh", 5, 19, "Ngày kỷ niệm lịch sử.", false),
  solarHoliday("vn-children-day", "Ngày Quốc tế Thiếu nhi", 6, 1, "Ngày dành cho thiếu nhi.", false),
  solarHoliday("vn-family-day", "Ngày Gia đình Việt Nam", 6, 28, "Ngày kỷ niệm gia đình Việt Nam.", false),
  solarHoliday("vn-war-invalids", "Ngày Thương binh Liệt sĩ", 7, 27, "Ngày tưởng niệm, tri ân.", false),
  solarHoliday("vn-national-day", "Quốc khánh", 9, 2, "Ngày nghỉ lễ chính thức."),
  solarHoliday("vn-women-vietnam", "Ngày Phụ nữ Việt Nam", 10, 20, "Ngày tôn vinh phụ nữ Việt Nam.", false),
  solarHoliday("vn-teachers-day", "Ngày Nhà giáo Việt Nam", 11, 20, "Ngày tri ân thầy cô.", false),
  solarHoliday("vn-army-day", "Ngày Quân đội Nhân dân Việt Nam", 12, 22, "Ngày truyền thống quân đội.", false),

  lunarHoliday("vn-tet-1", "Tết Nguyên đán - Mùng 1", 1, 1, "Tết Âm lịch, ngày nghỉ lễ chính thức."),
  lunarHoliday("vn-tet-2", "Tết Nguyên đán - Mùng 2", 1, 2, "Tết Âm lịch, ngày nghỉ lễ chính thức."),
  lunarHoliday("vn-tet-3", "Tết Nguyên đán - Mùng 3", 1, 3, "Tết Âm lịch, ngày nghỉ lễ chính thức."),
  lunarHoliday("vn-tet-4", "Tết Nguyên đán - Mùng 4", 1, 4, "Tết Âm lịch, lịch nghỉ thực tế có thể được điều chỉnh hằng năm."),
  lunarHoliday("vn-tet-5", "Tết Nguyên đán - Mùng 5", 1, 5, "Tết Âm lịch, lịch nghỉ thực tế có thể được điều chỉnh hằng năm."),
  lunarHoliday("vn-first-full-moon", "Rằm tháng Giêng", 1, 15, "Ngày lễ truyền thống theo âm lịch.", false),
  lunarHoliday("vn-cold-food", "Tết Hàn thực", 3, 3, "Ngày lễ truyền thống theo âm lịch.", false),
  lunarHoliday("vn-hung-kings", "Giỗ Tổ Hùng Vương", 3, 10, "Ngày nghỉ lễ chính thức."),
  lunarHoliday("vn-buddha-birthday", "Lễ Phật Đản", 4, 15, "Ngày lễ tôn giáo phổ biến.", false),
  lunarHoliday("vn-doan-ngo", "Tết Đoan Ngọ", 5, 5, "Ngày lễ truyền thống theo âm lịch.", false),
  lunarHoliday("vn-vu-lan", "Lễ Vu Lan", 7, 15, "Ngày lễ truyền thống, báo hiếu.", false),
  lunarHoliday("vn-mid-autumn", "Tết Trung thu", 8, 15, "Ngày lễ truyền thống.", false),
  lunarHoliday("vn-kitchen-gods", "Ông Công Ông Táo", 12, 23, "Ngày lễ truyền thống trước Tết.", false)
];
