import { Skeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
      <Skeleton className="h-96" />
      <div className="space-y-3">
        <Skeleton className="h-11 w-full max-w-md" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}
