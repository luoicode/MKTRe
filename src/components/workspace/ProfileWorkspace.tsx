import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Copy,
  ExternalLink,
  Mail,
  MessageCircle,
  Phone,
  Save,
  Unlink,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";

export function ProfileWorkspace() {
  const { profile, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [editProfile, setEditProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkExpiresAt, setLinkExpiresAt] = useState<string | null>(null);
  const [creatingLinkCode, setCreatingLinkCode] = useState(false);
  const [unlinkingTelegram, setUnlinkingTelegram] = useState(false);
  const [checkingTelegram, setCheckingTelegram] = useState(false);

  const { data: telegramAccount, refetch: refetchTelegram } = useQuery({
    queryKey: ["telegram-account", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telegram_accounts")
        .select("id, telegram_username, linked_at, is_active")
        .eq("profile_id", profile!.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const action = sessionStorage.getItem("profile-action");
    sessionStorage.removeItem("profile-action");
    if (action === "edit") setEditProfile(true);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    setAvatarUrl(profile.avatar_url ?? "");
    setPhone(profile.phone ?? "");
  }, [profile?.id, profile?.avatar_url, profile?.phone]);

  useEffect(() => {
    if (!linkCode || telegramAccount || !linkExpiresAt) return;

    const expiresAt = new Date(linkExpiresAt).getTime();
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      const isExpired = Date.now() > expiresAt;
      const isTimedOut = Date.now() - startedAt > 60_000;
      if (isExpired || isTimedOut) {
        window.clearInterval(timer);
        return;
      }

      const result = await refetchTelegram();
      if (result.data) {
        setLinkCode(null);
        setLinkExpiresAt(null);
        toast.success("Đã liên kết Telegram");
        window.clearInterval(timer);
      }
    }, 4_000);

    return () => window.clearInterval(timer);
  }, [linkCode, linkExpiresAt, refetchTelegram, telegramAccount]);

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((part) => part[0])
      .slice(-2)
      .join("")
      .toUpperCase() || "U";

  const saveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        avatar_url: avatarUrl.trim() || null,
        phone: phone.trim() || null,
      })
      .eq("id", profile.id);
    setSavingProfile(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    setEditProfile(false);
    toast.success("Đã cập nhật thông tin cá nhân");
  };

  const cancelProfileEdit = () => {
    setAvatarUrl(profile?.avatar_url ?? "");
    setPhone(profile?.phone ?? "");
    setEditProfile(false);
  };

  const createTelegramLinkCode = async () => {
    if (!profile?.id) return;
    setCreatingLinkCode(true);
    const code = generateTelegramCode();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error } = await supabase.from("telegram_link_codes").insert({
      profile_id: profile.id,
      code,
      expires_at: expiresAt,
    });
    setCreatingLinkCode(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLinkCode(code);
    setLinkExpiresAt(expiresAt);
    toast.success("Đã tạo mã liên kết Telegram");
  };

  const unlinkTelegram = async () => {
    if (!profile?.id || !telegramAccount?.id) return;
    setUnlinkingTelegram(true);
    const { error } = await supabase
      .from("telegram_accounts")
      .update({ is_active: false })
      .eq("id", telegramAccount.id)
      .eq("profile_id", profile.id);
    setUnlinkingTelegram(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLinkCode(null);
    setLinkExpiresAt(null);
    await queryClient.invalidateQueries({ queryKey: ["telegram-account", profile.id] });
    toast.success("Đã huỷ liên kết Telegram");
  };

  const checkTelegramLink = async () => {
    setCheckingTelegram(true);
    const result = await refetchTelegram();
    setCheckingTelegram(false);
    if (result.data) {
      setLinkCode(null);
      setLinkExpiresAt(null);
      toast.success("Telegram đã được liên kết");
      return;
    }
    toast.info("Chưa thấy liên kết Telegram. Hãy gửi đúng mã cho bot rồi kiểm tra lại.");
  };

  const copyTelegramCommand = async () => {
    if (!linkCode) return;
    if (!navigator.clipboard?.writeText) {
      toast.error("Trình duyệt không hỗ trợ copy tự động");
      return;
    }
    await navigator.clipboard.writeText(`/start ${linkCode}`);
    toast.success("Đã copy mã liên kết");
  };

  return (
    <div className="flex h-auto min-h-0 flex-col md:h-full md:overflow-hidden">
      <WorkspacePageHeader title="Thông tin cá nhân" className="mb-3" />

      <div className="min-h-0 flex-1 overflow-visible pb-4 md:overflow-y-auto md:pr-2">
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="h-4 w-4" />
                Hồ sơ
              </CardTitle>
              {!editProfile && (
                <Button variant="outline" size="sm" onClick={() => setEditProfile(true)}>
                  Chỉnh sửa thông tin
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={avatarUrl || undefined} alt={profile?.full_name ?? ""} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{profile?.full_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{profile?.email}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Họ và tên">
                  <div className="relative">
                    <UserRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-9 bg-muted/60 pl-9"
                      value={profile?.full_name ?? ""}
                      disabled
                    />
                  </div>
                </Field>

                <Field label="Email đăng nhập">
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="h-9 bg-muted/60 pl-9" value={profile?.email ?? ""} disabled />
                  </div>
                </Field>
              </div>

              {!editProfile ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="Ảnh đại diện" value={profile?.avatar_url || "Chưa cập nhật"} />
                  <Info label="Số điện thoại" value={profile?.phone || "Chưa cập nhật"} />
                </div>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Ảnh đại diện">
                      <div className="relative">
                        <Camera className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="h-9 pl-9"
                          value={avatarUrl}
                          onChange={(event) => setAvatarUrl(event.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                    </Field>

                    <Field label="Số điện thoại">
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="h-9 pl-9"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder="Nhập số điện thoại"
                        />
                      </div>
                    </Field>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
                      <Save className="mr-2 h-4 w-4" />
                      {savingProfile ? "Đang lưu..." : "Lưu"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={cancelProfileEdit}
                      disabled={savingProfile}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Hủy
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageCircle className="h-4 w-4" />
                Telegram
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={checkTelegramLink}
                disabled={checkingTelegram}
              >
                {checkingTelegram ? "Đang kiểm tra..." : "Kiểm tra liên kết"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              {telegramAccount ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">
                      Đã liên kết{" "}
                      {telegramAccount.telegram_username
                        ? `@${telegramAccount.telegram_username}`
                        : "Telegram"}
                    </p>
                    <p className="text-xs text-emerald-700">
                      Liên kết lúc {new Date(telegramAccount.linked_at).toLocaleString("vi-VN")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={unlinkTelegram}
                    disabled={unlinkingTelegram}
                  >
                    <Unlink className="mr-2 h-4 w-4" />
                    Hủy liên kết
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border bg-slate-50 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold">Chưa liên kết Telegram</p>
                    <p className="text-xs text-muted-foreground">
                      Telegram chỉ gửi thông báo đúng tài khoản đã liên kết.
                    </p>
                  </div>
                  <Button size="sm" onClick={createTelegramLinkCode} disabled={creatingLinkCode}>
                    {creatingLinkCode ? "Đang tạo..." : "Tạo mã liên kết Telegram"}
                  </Button>
                  {linkCode ? (
                    <div className="space-y-2 rounded-lg border bg-white p-3">
                      <p className="text-xs text-muted-foreground">
                        Mở @workspacemiz_bot và gửi lệnh:
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold">
                          /start {linkCode}
                        </code>
                        <Button variant="outline" size="sm" onClick={copyTelegramCommand}>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={`https://t.me/workspacemiz_bot?start=${linkCode}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Mở bot
                          </a>
                        </Button>
                      </div>
                      {linkExpiresAt ? (
                        <p className="text-xs text-muted-foreground">
                          Mã hết hạn lúc {new Date(linkExpiresAt).toLocaleTimeString("vi-VN")}.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function generateTelegramCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
