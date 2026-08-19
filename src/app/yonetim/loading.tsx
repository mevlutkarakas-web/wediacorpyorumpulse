import { Skeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-24" />
      <Skeleton className="h-[32rem]" />
    </div>
  );
}
