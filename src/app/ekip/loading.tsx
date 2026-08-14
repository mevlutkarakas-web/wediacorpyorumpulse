import { Skeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Skeleton className="h-96" />
      <Skeleton className="h-96" />
    </div>
  );
}
