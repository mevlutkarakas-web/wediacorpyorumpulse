import { cn, initials } from "@/lib/utils";

type AvatarVariant = "flat" | "flat-dark" | "muted";

const VARIANT_CLASS: Record<AvatarVariant, string> = {
  flat: "bg-slate-700 text-white",
  "flat-dark": "bg-slate-800 text-white",
  muted: "bg-muted text-foreground",
};

const SIZE_CLASS = {
  sm: "size-9 text-xs",
  md: "size-10 text-xs",
  lg: "size-12 text-sm",
} as const;

export function AvatarBadge({
  name,
  variant = "flat",
  size = "md",
  className,
}: {
  name: string;
  variant?: AvatarVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl font-bold",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}
