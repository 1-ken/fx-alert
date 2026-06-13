const STORAGE_KEY = "fx-alert:pwa-install-daily";
const MAX_DAILY_SHOWS = 2;

interface DailyRecord {
  date: string;
  count: number;
}

function todayKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readRecord(): DailyRecord {
  if (typeof window === "undefined") {
    return { date: todayKey(), count: 0 };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { date: todayKey(), count: 0 };
    }

    const parsed = JSON.parse(raw) as DailyRecord;
    if (parsed.date !== todayKey()) {
      return { date: todayKey(), count: 0 };
    }

    return parsed;
  } catch {
    return { date: todayKey(), count: 0 };
  }
}

export function canShowPwaInstallPrompt(): boolean {
  return readRecord().count < MAX_DAILY_SHOWS;
}

export function recordPwaInstallPromptShown(): void {
  if (typeof window === "undefined") {
    return;
  }

  const record = readRecord();
  const next: DailyRecord = {
    date: todayKey(),
    count: record.count + 1,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
