"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow } from "@/lib/pagination";

export function PaginationControls({
  page,
  totalPages,
  paramName = "page",
  totalCount,
  pageSize,
}: {
  page: number;
  totalPages: number;
  paramName?: string;
  totalCount?: number;
  pageSize?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  if (totalPages <= 1) return null;

  function go(target: number) {
    const next = Math.min(Math.max(target, 1), totalPages);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 1) params.delete(paramName);
    else params.set(paramName, String(next));
    startTransition(() => {
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
    });
  }

  const from = totalCount !== undefined && pageSize ? (page - 1) * pageSize + 1 : undefined;
  const to = totalCount !== undefined && pageSize ? Math.min(page * pageSize, totalCount) : undefined;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${isPending ? "opacity-60" : ""}`}>
      {totalCount !== undefined && from !== undefined && to !== undefined && (
        <p className="text-xs text-slate-400">
          {totalCount.toLocaleString("tr-TR")} kayıttan {from.toLocaleString("tr-TR")}–{to.toLocaleString("tr-TR")} arası
        </p>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          className="grid size-8 place-items-center rounded-lg border bg-card disabled:opacity-40"
          aria-label="Önceki sayfa"
        >
          <ChevronLeft size={16} />
        </button>
        {pageWindow(page, totalPages).map((item, index) =>
          item === "…" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-xs text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              onClick={() => go(item)}
              className={`grid size-8 place-items-center rounded-lg text-xs font-semibold ${
                item === page ? "bg-teal-600 text-white" : "border bg-card text-slate-500 hover:bg-muted"
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
          className="grid size-8 place-items-center rounded-lg border bg-card disabled:opacity-40"
          aria-label="Sonraki sayfa"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
