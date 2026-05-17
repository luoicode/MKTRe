import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Users,
  UsersRound,
  FileText,
  LogOut,
  LayoutDashboard,
  Menu,
  Target,
  CheckSquare,
  BookOpen,
  Trophy,
  UserRound,
  Lock,
  Package,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/NotificationsBell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  { to: "/admin/assets", label: "Tài sản", icon: Package, roles: ["admin"] },
  { to: "/admin/ranking", label: "Bảng xếp hạng", icon: Trophy, roles: ["admin"] },
  { to: "/admin/resources", label: "Hướng dẫn tân thủ", icon: BookOpen, roles: ["admin"] },

  // Marketing Manager
  { to: "/manager/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["manager"] },
  { to: "/manager/kpi", label: "KPI", icon: Target, roles: ["manager"] },
  { to: "/manager/tasks", label: "Checklist công việc", icon: CheckSquare, roles: ["manager"] },
  { to: "/manager/assets", label: "Tài sản", icon: Package, roles: ["manager"] },
  { to: "/manager/ranking", label: "Bảng xếp hạng", icon: Trophy, roles: ["manager"] },
  { to: "/manager/teams", label: "Teams", icon: UsersRound, roles: ["manager"] },
  {
    to: "/manager/resources",
    label: "Hướng dẫn tân thủ",
    icon: BookOpen,
    roles: ["manager"],
  },

  // Leader
  { to: "/leader/resources", label: "Hướng dẫn tân thủ", icon: BookOpen, roles: ["leader"] },
  { to: "/leader/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["leader"] },
  { to: "/leader/kpi", label: "KPI", icon: Target, roles: ["leader"] },
  { to: "/leader/report-slots", label: "Nhập báo cáo cá nhân", icon: FileText, roles: ["leader"] },
  { to: "/leader/daily-report", label: "Báo cáo tổng", icon: FileText, roles: ["leader"] },
  { to: "/leader/tasks", label: "Checklist công việc", icon: CheckSquare, roles: ["leader"] },
  { to: "/leader/assets", label: "Tài sản", icon: Package, roles: ["leader"] },
  { to: "/leader/ranking", label: "Bảng xếp hạng", icon: Trophy, roles: ["leader"] },

  // Employee
  {
    to: "/employee/resources",
    label: "Hướng dẫn tân thủ",
    icon: BookOpen,
    roles: ["employee"],
  },
  { to: "/employee/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["employee"] },
  { to: "/employee/kpi", label: "KPI", icon: Target, roles: ["employee"] },
  { to: "/employee/report", label: "Nhập báo cáo", icon: FileText, roles: ["employee"] },
  { to: "/employee/tasks", label: "Checklist công việc", icon: CheckSquare, roles: ["employee"] },
  { to: "/employee/assets", label: "Tài sản", icon: Package, roles: ["employee"] },
  { to: "/employee/ranking", label: "Bảng xếp hạng", icon: Trophy, roles: ["employee"] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const items = NAV.filter((n) => role && n.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const profilePath = role ? `/${role}/profile` : "/login";
  const initials =
    profile?.full_name
      ?.split(" ")
      .map((part) => part[0])
      .slice(-2)
      .join("")
      .toUpperCase() || "U";

  const openProfile = () => {
    navigate({ to: profilePath });
  };

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
  };

  const handlePasswordOpenChange = (nextOpen: boolean) => {
    setPasswordOpen(nextOpen);
    if (!nextOpen) resetPasswordForm();
  };

  const savePassword = async () => {
    if (!currentPassword) {
      toast.error("Nhập mật khẩu hiện tại");
      return;
    }
    if (password.length < 6) {
      toast.error("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    resetPasswordForm();
    setPasswordOpen(false);
    toast.success("Đã cập nhật mật khẩu");
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const logScrollRoot = () => {
      const root = document.scrollingElement;
      console.info("[layout-scroll-debug]", {
        pathname: location.pathname,
        scrollHeight: root?.scrollHeight,
        windowHeight: window.innerHeight,
        matchesViewport: root?.scrollHeight === window.innerHeight,
      });
    };
    logScrollRoot();
    window.requestAnimationFrame(logScrollRoot);
  }, [location.pathname]);

  const SidebarInner = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 py-5">
        <div className="flex items-center gap-3 rounded-xl px-2">
          <div className="h-10 w-10 overflow-hidden rounded-xl">
            <img
              src="/favicon_main.png"
              alt="MKTRe"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-sidebar-foreground">MKTRe</p>
            <p className="text-xs text-sidebar-foreground/60">Báo cáo nội bộ</p>
          </div>
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <NavSection items={items} pathname={location.pathname} onNavigate={() => setOpen(false)} />
      </nav>
    </div>
  );

  const UserMenu = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-10 gap-2 rounded-full px-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt={profile?.full_name ?? ""} />
              <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-32 truncate text-sm font-medium md:inline">
              {profile?.full_name}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 rounded-2xl p-2 shadow-xl">
          <DropdownMenuLabel className="p-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11">
                <AvatarImage
                  src={profile?.avatar_url ?? undefined}
                  alt={profile?.full_name ?? ""}
                />
                <AvatarFallback className="bg-slate-900 text-sm font-semibold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{profile?.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  @{profile?.username} · {role ? ROLE_LABELS[role] : ""}
                </p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="rounded-xl" onSelect={() => openProfile()}>
            <UserRound className="h-4 w-4" /> Thông tin cá nhân
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-xl" onSelect={() => setPasswordOpen(true)}>
            <Lock className="h-4 w-4" /> Đổi mật khẩu
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="rounded-xl text-destructive" onSelect={handleSignOut}>
            <LogOut className="h-4 w-4" /> Đăng xuất
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={passwordOpen} onOpenChange={handlePasswordOpenChange}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi mật khẩu</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Mật khẩu hiện tại</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mật khẩu mới</Label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Xác nhận mật khẩu mới</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handlePasswordOpenChange(false)}
              disabled={savingPassword}
            >
              Hủy
            </Button>
            <Button onClick={savePassword} disabled={savingPassword}>
              {savingPassword ? "Đang cập nhật..." : "Cập nhật"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <div className="h-full min-h-0 bg-background md:h-screen md:overflow-hidden">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 overflow-hidden border-r border-sidebar-border bg-sidebar md:flex">
        {SidebarInner}
      </aside>

      {/* Mobile */}
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative flex h-screen w-64 flex-col overflow-hidden bg-sidebar">
            {SidebarInner}
          </aside>
        </div>
      )}

      <div className="flex h-full min-h-0 min-w-0 flex-col md:ml-64 md:h-screen md:min-h-0">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold">MKTRe</span>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            {UserMenu}
          </div>
        </header>
        <header className="hidden h-14 items-center justify-end gap-2 border-b bg-card px-6 md:flex">
          <NotificationsBell />
          {UserMenu}
        </header>
        <main className="flex-1 overflow-x-hidden p-4 md:min-h-0 md:overflow-hidden md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavSection({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="space-y-1">
      {items.map((it) => {
        const active = pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <it.icon className="h-4 w-4" />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
