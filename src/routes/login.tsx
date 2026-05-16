import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

const ROLE_HOME: Record<AppRole, string> = {
  admin: "/admin/dashboard",
  manager: "/manager/dashboard",
  leader: "/leader/dashboard",
  employee: "/employee/report",
};

function LoginPage() {
  const { session, role, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    if (role) navigate({ to: ROLE_HOME[role] });
  }, [loading, session, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email || !password) {
      toast.error("Vui lòng nhập đầy đủ email đăng nhập và mật khẩu.");
      return;
    }
    setSubmitting(true);
    if (import.meta.env.DEV) {
      console.info("[login] signInWithPassword payload", {
        email,
        passwordLength: password.length,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      });
    }
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, status")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setSubmitting(false);
      toast.error("Không tìm thấy hồ sơ người dùng. Vui lòng liên hệ Admin.");
      return;
    }

    if (profile.status === "inactive") {
      await supabase.auth.signOut();
      setSubmitting(false);
      toast.error("Tài khoản đã bị khóa. Vui lòng liên hệ Admin.");
      return;
    }

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (roleError || !roleRow?.role) {
      await supabase.auth.signOut();
      setSubmitting(false);
      toast.error("Tài khoản chưa được phân quyền. Vui lòng liên hệ Admin.");
      return;
    }

    const nextRole = roleRow.role as AppRole;
    await refresh();
    setSubmitting(false);
    toast.success("Đăng nhập thành công");
    await navigate({ to: ROLE_HOME[nextRole] });
  };

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-background to-muted px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="gradient-primary shadow-elegant mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
            <BarChart3 className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing Sales Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hệ thống báo cáo nội bộ</p>
        </div>

        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle>Đăng nhập</CardTitle>
            <CardDescription>Sử dụng email đăng nhập được Admin cấp</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email đăng nhập</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="vd: admin@dasnotri.com"
                  disabled={submitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Đăng nhập
              </Button>
            </form>
            <p className="mt-6 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              Tài khoản được cấp bởi Admin hệ thống. Vui lòng liên hệ Admin nếu bạn chưa có tài
              khoản.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
