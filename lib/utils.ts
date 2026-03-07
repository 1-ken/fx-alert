import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateString
  }
}

/**
 * Converts name to ALL CAPS
 * @param name - The name string to convert to uppercase
 * @returns The uppercase name
 * 
 * @example
 * capitalizeName("john doe") // "JOHN DOE"
 * capitalizeName("Mary Smith") // "MARY SMITH"
 */
export function capitalizeName(name: string | null | undefined): string {
  if (!name) return "";
  
  return name.toUpperCase();
}
