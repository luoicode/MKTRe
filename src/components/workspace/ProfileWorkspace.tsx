import { useEffect, useState, type ReactNode } from "react";
import { Camera, Mail, Phone, Save, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

export function ProfileWorkspace() {
  const { profile, refresh } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [editProfile, setEditProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

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

  return (
    <div className="flex h-auto min-h-0 flex-col md:h-full md:overflow-hidden">
      <div className="shrink-0 pb-3">
        <h1 className="text-2xl font-bold">Thông tin cá nhân</h1>
      </div>

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
        </div>
      </div>
    </div>
  );
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
