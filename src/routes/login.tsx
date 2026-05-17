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
  employee: "/employee/dashboard",
};
const INTERNAL_AUTH_DOMAIN = "mktre.local";

function normalizeLoginEmail(value: string) {
  const raw = value.trim().toLowerCase();
  const localPart = raw.includes("@") ? raw.split("@")[0] : raw;
  const loginName = localPart.replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "_");
  return loginName ? `${loginName}@${INTERNAL_AUTH_DOMAIN}` : "";
}

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
    const loginValue = emailInput.trim();
    const authEmail = normalizeLoginEmail(loginValue);
    if (!authEmail || !password) {
      toast.error("Vui lòng nhập đầy đủ tài khoản đăng nhập và mật khẩu.");
      return;
    }
    setSubmitting(true);
    if (import.meta.env.DEV) {
      console.info("[login] signInWithPassword payload", {
        input: loginValue,
        email: authEmail,
        passwordLength: password.length,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      });
    }
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });
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
          <img src="/favicon_main.png" alt="MKTRe" className="h-16 w-16 rounded-2xl object-cover" />
          <h1 className="text-2xl font-bold tracking-tight">Marketing Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hệ thống nội bộ</p>
        </div>

        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle>Đăng nhập</CardTitle>
            <CardDescription>Sử dụng tài khoản đăng nhập nội bộ được Admin cấp</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Tài khoản đăng nhập</Label>
                <Input
                  id="email"
                  type="text"
                  autoComplete="username"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="vd: dangkhoa123"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
