import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usernameToEmail } from "@/lib/username";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { session, role, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Bootstrap default admin once on mount.
  useEffect(() => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bootstrap-admin`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || !session) return;
    if (role === "admin") navigate({ to: "/admin/dashboard" });
    else if (role === "leader") navigate({ to: "/leader/dashboard" });
    else if (role === "employee") navigate({ to: "/employee/report" });
  }, [loading, session, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
      return;
    }
    setSubmitting(true);
    const email = usernameToEmail(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      toast.error("Đăng nhập thất bại. Kiểm tra lại tên đăng nhập hoặc mật khẩu.");
      return;
    }
    await refresh();
    toast.success("Đăng nhập thành công");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-12">
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
            <CardDescription>Sử dụng tên đăng nhập được Admin cấp</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Tên đăng nhập</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="vd: admin@001"
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
              Tài khoản được cấp bởi Admin hệ thống. Vui lòng liên hệ Admin nếu bạn chưa có tài khoản.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
