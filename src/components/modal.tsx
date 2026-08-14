"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className={cn("w-full max-w-lg rounded-2xl bg-card p-6", className)}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalCloseButton({ onClick, label = "Kapat" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="text-slate-400 hover:text-foreground">
      <X />
    </button>
  );
}
