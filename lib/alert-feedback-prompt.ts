const COUNT_KEY_PREFIX = "fx-alert:alert-create-count:";

export function incrementAlertCreateCount(userId: string): number {
  if (typeof window === "undefined" || !userId) {
    return 0;
  }

  const key = `${COUNT_KEY_PREFIX}${userId}`;
  const current = Number(window.localStorage.getItem(key) ?? "0");
  const next = Number.isFinite(current) ? current + 1 : 1;
  window.localStorage.setItem(key, String(next));
  return next;
}

export function shouldPromptForFeedback(createCount: number): boolean {
  return createCount > 0 && createCount % 3 === 0;
}
