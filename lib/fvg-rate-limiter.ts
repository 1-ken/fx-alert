const SOUND_COOLDOWN_MS = 60_000; // 1 minute per symbol
const TOAST_COOLDOWN_MS = 10_000; // 10 seconds per unique alert ID

class FvgRateLimiter {
  private lastSoundBySymbol = new Map<string, number>();
  private lastToastById = new Map<string, number>();

  /**
   * Checks whether an audio sound may be played for the given symbol.
   * Enforces at most 1 sound per symbol per minute.
   */
  shouldPlaySound(symbol: string, nowMs = Date.now()): boolean {
    const norm = symbol.toUpperCase();
    const last = this.lastSoundBySymbol.get(norm) ?? 0;
    if (nowMs - last >= SOUND_COOLDOWN_MS) {
      this.lastSoundBySymbol.set(norm, nowMs);
      return true;
    }
    return false;
  }

  /**
   * Checks whether a toast notification may be shown for the given alert ID.
   */
  shouldShowToast(alertId: string, nowMs = Date.now()): boolean {
    const last = this.lastToastById.get(alertId) ?? 0;
    if (nowMs - last >= TOAST_COOLDOWN_MS) {
      this.lastToastById.set(alertId, nowMs);
      return true;
    }
    return false;
  }

  reset(): void {
    this.lastSoundBySymbol.clear();
    this.lastToastById.clear();
  }
}

export const fvgRateLimiter = new FvgRateLimiter();
