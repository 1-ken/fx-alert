import { format, startOfMonth, startOfWeek } from "date-fns";

export type ActivityDatePreset = "today" | "this_week" | "this_month" | "custom";

export const ACTIVITY_DATE_PRESET_LABELS: Record<
  Exclude<ActivityDatePreset, "custom">,
  string
> = {
  today: "Today",
  this_week: "This week",
  this_month: "This month",
};

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatActivityDateParam(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function getActivityDateRange(
  preset: Exclude<ActivityDatePreset, "custom">,
): { start: string; end: string } {
  const today = startOfLocalDay(new Date());

  if (preset === "today") {
    const value = formatActivityDateParam(today);
    return { start: value, end: value };
  }

  if (preset === "this_week") {
    const from = startOfWeek(today, { weekStartsOn: 1 });
    return {
      start: formatActivityDateParam(from),
      end: formatActivityDateParam(today),
    };
  }

  const from = startOfMonth(today);
  return {
    start: formatActivityDateParam(from),
    end: formatActivityDateParam(today),
  };
}

export function detectActivityDatePreset(
  start?: string | null,
  end?: string | null,
): ActivityDatePreset {
  if (!start || !end) {
    return "custom";
  }

  for (const preset of ["today", "this_week", "this_month"] as const) {
    const range = getActivityDateRange(preset);
    if (range.start === start && range.end === end) {
      return preset;
    }
  }

  return "custom";
}

export function getDefaultActivityDateRange(): { start: string; end: string } {
  return getActivityDateRange("today");
}
