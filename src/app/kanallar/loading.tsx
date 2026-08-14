import { Skeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-11 w-full max-w-md" />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    </div>
  );
}
