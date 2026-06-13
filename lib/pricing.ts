export type SubscriptionTier = "none" | "trial" | "free" | "starter" | "trader" | "pro";

export interface PricingTier {
  id: SubscriptionTier;
  name: string;
  priceKes: number;
  priceLabel: string;
  includes: string;
  highlight?: boolean;
}

export interface TopUpPack {
  id: string;
  name: string;
  priceKes: number;
  contents: string;
}

export const TRIAL_DAYS = 14;
export const TRIAL_SMS_LIMIT = 10;
export const TRIAL_CALL_LIMIT = 5;
export const FREE_MAX_ALERTS = 5;

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    priceKes: 0,
    priceLabel: "KES 0",
    includes: "5 alerts, sound only",
  },
  {
    id: "starter",
    name: "Starter",
    priceKes: 499,
    priceLabel: "KES 499/mo",
    includes: "30 SMS credits",
  },
  {
    id: "trader",
    name: "Trader",
    priceKes: 999,
    priceLabel: "KES 999/mo",
    includes: "100 SMS + 3 call credits",
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    priceKes: 1999,
    priceLabel: "KES 1,999/mo",
    includes: "250 SMS + 8 call credits",
  },
];

export const TOP_UP_PACKS: TopUpPack[] = [
  { id: "sms-200", name: "SMS pack", priceKes: 200, contents: "18 SMS" },
  { id: "sms-500", name: "SMS pack", priceKes: 500, contents: "50 SMS" },
  { id: "call-500", name: "Call pack", priceKes: 500, contents: "3 calls " },
  { id: "call-1500", name: "Call pack", priceKes: 1500, contents: "10 calls " },
];

export function formatKes(amount: number): string {
  return `KES ${amount.toLocaleString("en-KE")}`;
}

export function tierDisplayName(tier: SubscriptionTier | string | undefined): string {
  const match = PRICING_TIERS.find((item) => item.id === tier);
  if (match) return match.name;
  if (tier === "trial") return "Free trial";
  if (tier === "none") return "Not started";
  return "Unknown";
}
