import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function compactNumber(value: number) { return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
export function formatDate(value: string | Date) { return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
export function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("tr-TR"); }

const PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%*?";
// Web Crypto hem tarayıcıda hem Node 18+ üzerinde var; parola üretimi UI tarafında da çalışsın diye burada.
export function generatePassword(length = 16) {
  const bytes = new Uint32Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join("");
}
