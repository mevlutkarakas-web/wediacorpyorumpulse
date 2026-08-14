export type Platform = "YOUTUBE" | "FACEBOOK";

export function isPlatform(value?: string): value is Platform {
  return value === "YOUTUBE" || value === "FACEBOOK";
}

export function platformLabel(platform: Platform) {
  return platform === "FACEBOOK" ? "Facebook" : "YouTube";
}

export function platformTagClass(platform: Platform) {
  return platform === "FACEBOOK"
    ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300";
}

export function platformAvatarClass(platform: Platform) {
  return platform === "FACEBOOK"
    ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
    : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300";
}
