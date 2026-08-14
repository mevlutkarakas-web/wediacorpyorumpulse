"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="card max-w-md p-10 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle size={26} />
        </span>
        <h1 className="mt-4 text-xl font-black">Bir şeyler ters gitti</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sayfa yüklenirken beklenmedik bir hata oluştu. Tekrar deneyebilir ya da panele dönebilirsiniz.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className="btn-primary">
            Tekrar dene
          </button>
          <Link href="/" className="btn-outline">
            Panele dön
          </Link>
        </div>
      </div>
    </div>
  );
}
