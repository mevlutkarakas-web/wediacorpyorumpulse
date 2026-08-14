import type { ComponentType } from "react";
import Link from "next/link";

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export function StatCard({
  icon: Icon,
  value,
  label,
  href,
  iconClassName = "text-violet-600",
  className,
}: {
  icon?: IconComponent;
  value: React.ReactNode;
  label: string;
  href?: string;
  iconClassName?: string;
  className?: string;
}) {
  const content = (
    <>
      {Icon && <Icon className={iconClassName} />}
      <div className="mt-5 text-3xl font-black">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </>
  );
  if (href)
    return (
      <Link href={href} className={`card p-5 transition hover:-translate-y-0.5 hover:border-violet-300 ${className || ""}`}>
        {content}
      </Link>
    );
  return <div className={`card p-5 ${className || ""}`}>{content}</div>;
}
