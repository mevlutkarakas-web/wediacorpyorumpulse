"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bot,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  MonitorPlay,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Upload,
  UsersRound,
  X,
  Youtube,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Counts = {
  channels: number;
  facebookChannels: number;
  comments: number;
  tasks: number;
  alerts: number;
  none?: number;
};
const nav = [
  {
    href: "/",
    label: "Genel Bakış",
    icon: LayoutDashboard,
    count: "none" as const,
  },
  {
    href: "/kanallar",
    label: "Kanallar",
    icon: Youtube,
    count: "channels" as const,
  },
  {
    href: "/facebook",
    label: "Facebook",
    icon: MonitorPlay,
    count: "facebookChannels" as const,
  },
  {
    href: "/yorumlar",
    label: "Yorum Merkezi",
    icon: MessageSquareText,
    count: "comments" as const,
  },
  {
    href: "/analizler",
    label: "AI Analizleri",
    icon: Sparkles,
    count: "none" as const,
  },
  {
    href: "/bildirimler",
    label: "Bildirimler",
    icon: Bell,
    count: "alerts" as const,
  },
  {
    href: "/gorevler",
    label: "Görevler",
    icon: ClipboardCheck,
    count: "tasks" as const,
  },
  {
    href: "/ekip",
    label: "Ekip Yönetimi",
    icon: UsersRound,
    count: "none" as const,
    adminOnly: true,
  },
];

export function AppShell({
  children,
  user,
  counts,
}: {
  children: React.ReactNode;
  user: { name: string; role: string } | null;
  counts: Counts;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  useEffect(() => setMounted(true), []);
  if (path === "/login" || path === "/setup") return <>{children}</>;
  const initials =
    user?.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("tr-TR") || "YP";
  const visibleNav = nav.filter(
    (item) => !item.adminOnly || user?.role === "ADMIN",
  );
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/login";
  }
  return (
    <div className="min-h-screen">
      {open && (
        <button
          aria-label="Menüyü kapat"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r bg-card transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-20 items-center gap-3 px-6">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg">
            <Bot size={22} />
          </span>
          <div>
            <div className="text-lg font-black">YorumPulse</div>
            <div className="text-[10px] font-bold uppercase tracking-[.2em] text-violet-500">
              Community OS
            </div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="mx-4 mb-5 rounded-xl border bg-muted/60 p-3">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-red-600 text-white">
              <Youtube size={17} />
            </span>
            <div>
              <p className="text-xs font-bold">Kanallarım</p>
              <p className="text-[11px] text-slate-500">
                {counts.channels} kanal bağlı
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {visibleNav.map((item) => {
            const active =
              item.href === "/" ? path === "/" : path.startsWith(item.href);
            const badge = counts[item.count];
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-slate-500 hover:bg-muted",
                  active &&
                    "bg-violet-50 font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
                )}
              >
                <item.icon size={19} />
                <span className="flex-1">{item.label}</span>
                {badge !== undefined && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                    {badge.toLocaleString("tr-TR")}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        {user?.role === "ADMIN" && <div className="border-t p-3">
          <Link
            href="/ayarlar"
            className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm text-slate-500 hover:bg-muted"
          >
            <Settings size={19} />
            Ayarlar
          </Link>
        </div>}
      </aside>
      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-xl md:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu />
          </button>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              className="h-11 w-full rounded-xl border bg-card pl-10 pr-4 text-sm outline-none"
              placeholder="Kanal, yorum veya görev ara..."
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {user?.role === "ADMIN" && (
              <Link
                href="/kanallar?import=1"
                className="btn-primary hidden sm:inline-flex"
              >
                <Upload size={17} />
                Excel Yükle
              </Link>
            )}
            <button
              aria-label="Tema"
              className="grid size-10 place-items-center rounded-xl border bg-card"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {mounted && theme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </button>
            <Link
              aria-label="Bildirimler"
              href="/bildirimler"
              className="relative grid size-10 place-items-center rounded-xl border bg-card"
            >
              <Bell size={18} />
              {counts.alerts > 0 && (
                <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                  {counts.alerts}
                </span>
              )}
            </Link>
            <div className="ml-1 hidden items-center gap-2 border-l pl-3 sm:flex">
              <span className="grid size-10 place-items-center rounded-xl bg-slate-800 text-sm font-bold text-white">
                {initials}
              </span>
              <div>
                <div className="text-xs font-bold">{user?.name}</div>
                <div className="text-[11px] text-slate-500">{user?.role}</div>
              </div>
              <button
                onClick={logout}
                title="Çıkış yap"
                className="ml-1 text-slate-400 hover:text-red-500"
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
