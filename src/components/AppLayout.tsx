import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Users,
  UsersRound,
  FileText,
  History,
  LogOut,
  LayoutDashboard,
  Menu,
  Camera,
  Briefcase,
  Target,
  TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof BarChart3;
  roles: AppRole[];
}

const NAV: NavItem[] = [
  // Admin
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/admin/users", label: "Quản lý User", icon: Users, roles: ["admin"] },
  { to: "/admin/teams", label: "Quản lý Team", icon: UsersRound, roles: ["admin"] },
  { to: "/admin/manager-assignments", label: "Phân công TP Marketing", icon: Briefcase, roles: ["admin"] },
  { to: "/admin/reports", label: "Báo cáo tổng hợp", icon: FileText, roles: ["admin"] },

  // Marketing Manager
  { to: "/manager/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["marketing_manager"] },

  // Leader
  { to: "/leader/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["leader"] },
  { to: "/leader/reports", label: "Báo cáo team", icon: FileText, roles: ["leader"] },

  // Employee
  { to: "/employee/report", label: "Nhập báo cáo", icon: FileText, roles: ["employee"] },
  { to: "/employee/history", label: "Lịch sử", icon: History, roles: ["employee"] },
];

// Suppress unused-import warnings for icons reserved for upcoming phases
void Camera; void Target; void TrendingUp;

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => role && n.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const SidebarInner = (
    <>
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl">
          <BarChart3 className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-sidebar-foreground">MSRS</p>
          <p className="text-xs text-sidebar-foreground/60">Báo cáo nội bộ</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((it) => {
          const active = location.pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="mb-3">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{profile?.full_name}</p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            @{profile?.username} · {role ? ROLE_LABELS[role] : ""}
          </p>
        </div>
        <Button variant="secondary" size="sm" className="w-full" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col bg-sidebar md:flex">{SidebarInner}</aside>

      {/* Mobile */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative flex w-64 flex-col bg-sidebar">{SidebarInner}</aside>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold">MSRS</span>
          <span />
        </header>
        <main className="flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
