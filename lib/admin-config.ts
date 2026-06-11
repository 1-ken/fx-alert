/** Admin panel path when NEXT_PUBLIC_ADMIN_PATH_SECRET is configured. */
export function getAdminPanelPath(): string | null {
  const secret = process.env.NEXT_PUBLIC_ADMIN_PATH_SECRET?.trim();
  if (!secret) {
    return null;
  }
  return `/admin/${secret}`;
}

export function getDefaultAdminPhone(): string {
  return process.env.NEXT_PUBLIC_ADMIN_PHONE?.trim() || "+254707879716";
}

/** Match backend AdminRoutes normalizePhone (digits + optional leading +). */
export function normalizeAdminPhone(phone: string): string {
  let out = "";
  for (const char of phone) {
    if (char >= "0" && char <= "9") {
      out += char;
    } else if (char === "+" && out.length === 0) {
      out += char;
    }
  }
  return out;
}
