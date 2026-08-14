import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="card max-w-md p-10 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
          <SearchX size={26} />
        </span>
        <h1 className="mt-4 text-xl font-black">Sayfa bulunamadı</h1>
        <p className="mt-2 text-sm text-slate-500">Aradığınız içerik taşınmış ya da hiç var olmamış olabilir.</p>
        <div className="mt-6 flex justify-center">
          <Link href="/" className="btn-primary">
            Panele dön
          </Link>
        </div>
      </div>
    </div>
  );
}
