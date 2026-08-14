"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { DASHBOARD_RANGES, type DashboardRange } from "@/lib/dashboard-range";

export function DashboardRangePicker({ value }: { value: DashboardRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(key: DashboardRange) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "week") params.delete("range");
    else params.set("range", key);
    startTransition(() => {
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
    });
  }

  return (
    <div className={`inline-flex rounded-xl border bg-card p-1 ${isPending ? "opacity-60" : ""}`}>
      {DASHBOARD_RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => select(r.key)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${value === r.key ? "bg-violet-600 text-white" : "text-slate-500"}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
