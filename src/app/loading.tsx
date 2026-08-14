import { Skeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-7">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-72" />
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </section>
      <Skeleton className="h-64" />
    </div>
  );
}
