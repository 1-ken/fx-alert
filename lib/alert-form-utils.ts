export type NotifyChannel = "sms" | "call" | "sound" | "email";

/** Apply initial notifyVia only on first mount; ignore later prop reference changes. */
export function shouldApplyInitialNotifyVia(
  alreadyApplied: boolean,
  initialNotifyVia?: NotifyChannel[],
): initialNotifyVia is NotifyChannel[] {
  return !alreadyApplied && Boolean(initialNotifyVia?.length);
}
