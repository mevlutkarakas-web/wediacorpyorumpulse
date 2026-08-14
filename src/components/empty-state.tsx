import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ size?: number; className?: string }>;

const SIZE = {
  sm: { padding: "p-8", icon: 28 },
  md: { padding: "p-10", icon: 34 },
  lg: { padding: "p-14", icon: 40 },
} as const;

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "md",
  card = false,
  className,
}: {
  icon?: IconComponent;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  card?: boolean;
  className?: string;
}) {
  const tokens = SIZE[size];
  return (
    <div className={cn("text-center", tokens.padding, card && "card", className)}>
      {Icon && <Icon className="mx-auto text-slate-300" size={tokens.icon} />}
      <p className={cn("font-bold", Icon && "mt-3")}>{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
