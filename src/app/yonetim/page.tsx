import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PAGE_SIZE, parsePage, paginate } from "@/lib/pagination";
import { UserAdmin, type AdminUser } from "@/components/user-admin";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MANAGER", "EDITOR"] as const;
type RoleFilter = (typeof ROLES)[number];

function matches(user: AdminUser, query: string) {
  if (!query) return true;
  return `${user.name} ${user.email}`.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr"));
}

export default async function UserAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }> }) {
  const session = await getSession();
  if (session?.role !== "ADMIN") redirect("/");
  const { q: rawQuery, role: rawRole, status: rawStatus, page: rawPage } = await searchParams;

  // 500 hesaba kadar tek sorgu: arama/filtre bellekte uygulanıyor, ayrıca özet kutuları tüm listeyi sayıyor.
  const rows = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    take: 500,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { assignedChannels: true, ledChannels: true, tasks: true, createdTasks: true } },
    },
  });
  const allUsers: AdminUser[] = rows.map(row => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    counts: { assignedChannels: row._count.assignedChannels, ledChannels: row._count.ledChannels, tasks: row._count.tasks, createdTasks: row._count.createdTasks },
  }));

  const query = (rawQuery || "").trim();
  const roleFilter = ROLES.includes(rawRole as RoleFilter) ? (rawRole as RoleFilter) : null;
  const statusFilter = rawStatus === "active" || rawStatus === "inactive" ? rawStatus : null;
  const filtered = allUsers.filter(
    user =>
      matches(user, query) &&
      (!roleFilter || user.role === roleFilter) &&
      (!statusFilter || (statusFilter === "active" ? user.active : !user.active)),
  );
  const { skip, take, page, totalPages, totalCount } = paginate(parsePage(rawPage), PAGE_SIZE.ADMIN_USERS, filtered.length);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div>
        <h1 className="text-3xl font-black">Kullanıcı Yönetimi</h1>
        <p className="mt-1 text-sm text-slate-500">Hesap açın, rolleri ve parolaları yönetin. Yalnızca admin görebilir.</p>
      </div>
      <Suspense>
        <UserAdmin
          users={filtered.slice(skip, skip + take)}
          currentUserId={session.sub}
          totals={{ all: allUsers.length, admins: allUsers.filter(u => u.role === "ADMIN" && u.active).length, inactive: allUsers.filter(u => !u.active).length }}
          filters={{ q: query, role: roleFilter, status: statusFilter }}
          pagination={{ page, totalPages, totalCount }}
        />
      </Suspense>
    </div>
  );
}
