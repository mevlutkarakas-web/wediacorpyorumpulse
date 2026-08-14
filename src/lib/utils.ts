import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function compactNumber(value: number) { return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
export function formatDate(value: string | Date) { return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
export function initials(name: string) { return name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("tr-TR"); }

