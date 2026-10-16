import { z } from "zod";

export const FVG_TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"] as const;

export const FvgTimeframeSchema = z.enum(["M1", "M5", "M15", "M30", "H1", "H4", "D1"]);
export type FvgTimeframe = z.infer<typeof FvgTimeframeSchema>;

export const FvgDirectionSchema = z.enum(["BULLISH", "BEARISH"]);
export type FvgDirection = z.infer<typeof FvgDirectionSchema>;

export const FvgStatusSchema = z.enum(["FORMED", "MITIGATED"]);
export type FvgStatus = z.infer<typeof FvgStatusSchema>;

export const FvgAlertPayloadSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  timeframe: FvgTimeframeSchema,
  direction: FvgDirectionSchema,
  top: z.number().finite(),
  bottom: z.number().finite(),
  bar_time: z.number().finite(),
  status: FvgStatusSchema,
});

export type FvgAlertPayload = z.infer<typeof FvgAlertPayloadSchema>;

export const FvgAlertMessageSchema = z.object({
  type: z.literal("FVG_ALERT"),
  data: FvgAlertPayloadSchema,
});

export type FvgAlertMessage = z.infer<typeof FvgAlertMessageSchema>;

export function generateFvgCompositeId(symbol: string, timeframe: string, barTime: number): string {
  return `${symbol}_${timeframe}_${barTime}`;
}

export function normalizeFvgTimeframe(interval: string): FvgTimeframe | null {
  const norm = interval.toUpperCase();
  if (norm === "M1" || norm === "1M") return "M1";
  if (norm === "M5" || norm === "5M") return "M5";
  if (norm === "M15" || norm === "15M") return "M15";
  if (norm === "M30" || norm === "30M") return "M30";
  if (norm === "H1" || norm === "1H") return "H1";
  if (norm === "H4" || norm === "4H") return "H4";
  if (norm === "D1" || norm === "1D") return "D1";
  return null;
}
