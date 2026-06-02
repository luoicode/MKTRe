import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { APP_ROLES, getRoleProfilePath, ROLE_LABELS, SALE_ROLES, type AppRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Users,
  UsersRound,
  FileText,
  LogOut,
  LayoutDashboard,
  Target,
  CheckSquare,
  BookOpen,
  Trophy,
  UserRound,
  Lock,
  Package,
  Bell,
  CalendarCheck,
  Menu,
  ClipboardList,
  Receipt,
  Warehouse,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  { to: "/admin/dashboard", label: "Tổng quan", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/admin/reports", label: "Báo cáo", icon: FileText, roles: ["admin"] },
  { to: "/admin/ads-dashboard", label: "Ads Dashboard", icon: BarChart3, roles: ["admin"] },
  { to: "/admin/kpi", label: "KPI", icon: Target, roles: ["admin"] },
  { to: "/admin/floating-pool", label: "Kho thả nổi", icon: Warehouse, roles: ["admin"] },
  { to: "/admin/products", label: "Sản phẩm", icon: Package, roles: ["admin"] },
  { to: "/admin/invoices", label: "Hoá đơn", icon: Receipt, roles: ["admin"] },
  { to: "/admin/users", label: "Người dùng", icon: Users, roles: ["admin"] },
  { to: "/admin/teams", label: "Quản lý team", icon: UsersRound, roles: ["admin"] },
  { to: "/admin/tasks", label: "Công việc", icon: CheckSquare, roles: ["admin"] },
  { to: "/admin/attendance", label: "Điểm danh", icon: CalendarCheck, roles: ["admin"] },
  { to: "/admin/notifications", label: "Thông báo", icon: Bell, roles: ["admin"] },
  { to: "/admin/assets", label: "Tài sản", icon: Package, roles: ["admin"] },
  { to: "/admin/ranking", label: "Ranking Marketing", icon: Trophy, roles: ["admin"] },
  { to: "/admin/resources", label: "Đào tạo", icon: BookOpen, roles: ["admin"] },

  // Marketing Manager
  {
    to: "/manager/dashboard",
    label: "Dashboard Marketing",
    icon: LayoutDashboard,
    roles: ["manager"],
  },
  { to: "/manager/kpi", label: "KPI Marketing", icon: Target, roles: ["manager"] },
  { to: "/manager/tasks", label: "Công việc", icon: CheckSquare, roles: ["manager"] },
  { to: "/manager/attendance", label: "Điểm danh", icon: CalendarCheck, roles: ["manager"] },
  { to: "/manager/notifications", label: "Thông báo", icon: Bell, roles: ["manager"] },
  { to: "/manager/assets", label: "Tài sản", icon: Package, roles: ["manager"] },
  { to: "/manager/ranking", label: "Ranking Marketing", icon: Trophy, roles: ["manager"] },
  { to: "/manager/teams", label: "Team Marketing", icon: UsersRound, roles: ["manager"] },
  {
    to: "/manager/resources",
    label: "Đào tạo",
    icon: BookOpen,
    roles: ["manager"],
  },

  // Leader
  {
    to: "/leader/dashboard",
    label: "Dashboard Marketing",
    icon: LayoutDashboard,
    roles: ["leader"],
  },
  { to: "/leader/report-slots", label: "Nhập báo cáo", icon: FileText, roles: ["leader"] },
  { to: "/leader/ads-dashboard", label: "Ads Dashboard", icon: BarChart3, roles: ["leader"] },
  { to: "/leader/daily-report", label: "Báo cáo Marketing", icon: FileText, roles: ["leader"] },
  { to: "/leader/floating-pool", label: "Kho thả nổi", icon: Warehouse, roles: ["leader"] },
  { to: "/leader/kpi", label: "KPI Marketing", icon: Target, roles: ["leader"] },
  { to: "/leader/tasks", label: "Công việc", icon: CheckSquare, roles: ["leader"] },
  { to: "/leader/attendance", label: "Điểm danh", icon: CalendarCheck, roles: ["leader"] },
  { to: "/leader/assets", label: "Tài sản", icon: Package, roles: ["leader"] },
  { to: "/leader/ranking", label: "Ranking Marketing", icon: Trophy, roles: ["leader"] },
  { to: "/leader/resources", label: "Đào tạo", icon: BookOpen, roles: ["leader"] },

  // Employee
  {
    to: "/employee/dashboard",
    label: "Dashboard Marketing",
    icon: LayoutDashboard,
    roles: ["employee"],
  },
  { to: "/employee/ads-dashboard", label: "Ads Dashboard", icon: BarChart3, roles: ["employee"] },
  { to: "/employee/report", label: "Nhập báo cáo", icon: FileText, roles: ["employee"] },
  { to: "/employee/floating-pool", label: "Kho thả nổi", icon: Warehouse, roles: ["employee"] },
  { to: "/employee/kpi", label: "KPI Marketing", icon: Target, roles: ["employee"] },
  { to: "/employee/tasks", label: "Công việc", icon: CheckSquare, roles: ["employee"] },
  { to: "/employee/attendance", label: "Điểm danh", icon: CalendarCheck, roles: ["employee"] },
  { to: "/employee/assets", label: "Tài sản", icon: Package, roles: ["employee"] },
  { to: "/employee/ranking", label: "Ranking Marketing", icon: Trophy, roles: ["employee"] },
  { to: "/employee/resources", label: "Đào tạo", icon: BookOpen, roles: ["employee"] },

  // Sale
  {
    to: "/sale/dashboard",
    label: "Tổng quan",
    icon: LayoutDashboard,
    roles: [...SALE_ROLES],
  },
  {
    to: "/sale/report",
    label: "Báo cáo sale",
    icon: ClipboardList,
    roles: [...SALE_ROLES],
  },
  { to: "/sale/kpi", label: "KPI sale", icon: Target, roles: [...SALE_ROLES] },
  { to: "/sale/attendance", label: "Điểm danh", icon: CalendarCheck, roles: [...SALE_ROLES] },
  {
    to: "/sale/floating-pool",
    label: "Kho thả nổi",
    icon: Warehouse,
    roles: [...SALE_ROLES],
  },
  { to: "/sale/products", label: "Sản phẩm", icon: Package, roles: [...SALE_ROLES] },
  { to: "/sale/invoices", label: "Hoá đơn", icon: Receipt, roles: [...SALE_ROLES] },
  {
    to: "/sale/team",
    label: "Thành viên team",
    icon: UsersRound,
    roles: [APP_ROLES.SALE_LEADER],
  },
  { to: "/sale/resources", label: "Đào tạo sale", icon: BookOpen, roles: [...SALE_ROLES] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const items = NAV.filter((n) => role && n.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const profilePath = role ? getRoleProfilePath(role) : "/login";
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
    <div className="flex h-full min-h-0 w-full min-w-0 bg-background md:h-screen md:overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:min-h-0 md:flex-col">
        <SidebarContent items={items} pathname={location.pathname} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
        <header className="sticky top-0 z-40 flex min-h-14 shrink-0 items-center gap-2 border-b bg-card/95 px-3 py-2 shadow-sm backdrop-blur md:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Mở menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <SidebarContent
                items={items}
                pathname={location.pathname}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <BrandMark compact />
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <NotificationsBell />
            {UserMenu}
          </div>
        </header>

        <header className="hidden min-h-14 shrink-0 items-center border-b bg-card/95 px-4 py-2 shadow-sm backdrop-blur md:flex xl:px-6">
          <div className="min-w-0 text-sm font-medium text-muted-foreground">
            {items.find((item) => location.pathname.startsWith(item.to))?.label ?? ""}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <NotificationsBell />
            {UserMenu}
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden md:min-h-0 md:overflow-hidden">
          <div className="w-full min-w-0 px-3 py-3 md:h-full md:min-h-0 md:overflow-y-auto md:overflow-x-hidden md:px-4 md:py-4 xl:px-6">
            <div className="h-auto min-h-full w-full min-w-0">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-blue-600 to-violet-600 text-base font-black text-white shadow-lg shadow-blue-500/25">
        M
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-extrabold tracking-tight text-slate-950",
            compact ? "text-sm" : "text-base",
          )}
        >
          Workspace MIZ
        </p>
        <p className="truncate text-xs font-medium text-muted-foreground">Nội bộ • Quản trị</p>
      </div>
    </div>
  );
}

function SidebarContent({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-16 shrink-0 items-center border-b px-4">
        <BrandMark />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <NavSection items={items} pathname={pathname} onNavigate={onNavigate} />
      </nav>
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
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const active = pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={cn(
              "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
              active
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
            )}
          >
            <it.icon className={cn("h-4 w-4 shrink-0", active ? "text-blue-700" : "")} />
            <span className="truncate">{it.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
