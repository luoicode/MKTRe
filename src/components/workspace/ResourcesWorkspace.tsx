import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

type IntroSection = Tables<"intro_sections">;

type IntroFormState = {
  id: string;
  icon: string;
  title: string;
  summary: string;
  content: string;
  image_url: string;
  link_url: string;
  sort_order: number;
  is_active: boolean;
};

const emptyIntroForm: IntroFormState = {
  id: "",
  icon: "🚀",
  title: "",
  summary: "",
  content: "",
  image_url: "",
  link_url: "",
  sort_order: 0,
  is_active: true,
};

export function ResourcesWorkspace() {
  const { profile, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin";
  const [introDialogOpen, setIntroDialogOpen] = useState(false);
  const [selectedIntro, setSelectedIntro] = useState<IntroSection | null>(null);
  const [showAllIntro, setShowAllIntro] = useState(false);
  const [introForm, setIntroForm] = useState<IntroFormState>(emptyIntroForm);

  const { data: introSections = [], isLoading } = useQuery({
    queryKey: ["resources-intro-sections", role],
    enabled: !!role,
    queryFn: async () => {
      let query = supabase
        .from("intro_sections")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (!isAdmin) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as IntroSection[];
    },
  });

  const visibleIntroSections = showAllIntro ? introSections : introSections.slice(0, 8);

  const resetIntroForm = () => setIntroForm(emptyIntroForm);

  const saveIntroSection = async () => {
    if (!introForm.title.trim()) {
      toast.error("Nhập tiêu đề giới thiệu");
      return;
    }

    const payload: TablesUpdate<"intro_sections"> = {
      icon: introForm.icon.trim() || null,
      title: introForm.title.trim(),
      summary: introForm.summary.trim() || null,
      content: introForm.content.trim() || null,
      image_url: introForm.image_url.trim() || null,
      link_url: introForm.link_url.trim() || null,
      sort_order: Number(introForm.sort_order) || 0,
      is_active: introForm.is_active,
      updated_by: profile?.id,
    };

    const query = introForm.id
      ? supabase.from("intro_sections").update(payload).eq("id", introForm.id)
      : supabase.from("intro_sections").insert({
          ...payload,
          section_key: `intro-${Date.now()}-${introForm.title
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`,
        } as TablesInsert<"intro_sections">);

    const { error } = await query;
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Đã lưu thẻ giới thiệu");
    setIntroDialogOpen(false);
    resetIntroForm();
    qc.invalidateQueries({ queryKey: ["resources-intro-sections"] });
  };

  const deleteIntroSection = async (id: string) => {
    const { error } = await supabase.from("intro_sections").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Đã xóa thẻ giới thiệu");
    qc.invalidateQueries({ queryKey: ["resources-intro-sections"] });
  };

  const editIntroSection = (intro: IntroSection) => {
    setIntroForm({
      id: intro.id,
      icon: intro.icon ?? "🚀",
      title: intro.title,
      summary: intro.summary ?? "",
      content: intro.content ?? "",
      image_url: intro.image_url ?? "",
      link_url: intro.link_url ?? "",
      sort_order: intro.sort_order ?? 0,
      is_active: intro.is_active,
    });
    setIntroDialogOpen(true);
  };

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-7xl flex-col gap-4 overflow-hidden">
      <div className="shrink-0 rounded-2xl border bg-background/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Giới thiệu & Tài nguyên</h1>
            <p className="text-sm text-muted-foreground">
              Giới thiệu, hướng dẫn và quy trình chung của hệ thống.
            </p>
          </div>
          {isAdmin && (
            <Dialog open={introDialogOpen} onOpenChange={setIntroDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetIntroForm}>
                  <Plus className="mr-2 h-4 w-4" /> Thẻ giới thiệu
                </Button>
              </DialogTrigger>
              <IntroSectionDialog
                form={introForm}
                setForm={setIntroForm}
                onSave={saveIntroSection}
                onCancel={() => setIntroDialogOpen(false)}
              />
            </Dialog>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <section className="rounded-3xl border bg-slate-950 p-5 text-white shadow-sm md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Giới thiệu</h2>
              <p className="mt-1 text-sm text-white/60">Click vào từng thẻ để xem chi tiết</p>
            </div>
            {introSections.length > 8 && (
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={() => setShowAllIntro((current) => !current)}
              >
                {showAllIntro ? "Thu gọn" : "Xem thêm"}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-white/60">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Đang tải giới thiệu...
            </div>
          ) : visibleIntroSections.length ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {visibleIntroSections.map((intro) => (
                <IntroCard
                  key={intro.id}
                  intro={intro}
                  canEdit={isAdmin}
                  onOpen={() => setSelectedIntro(intro)}
                  onEdit={() => editIntroSection(intro)}
                  onDelete={() => deleteIntroSection(intro.id)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/60">
              Chưa có thẻ giới thiệu.
            </div>
          )}
        </section>

        <IntroDetailDialog
          intro={selectedIntro}
          onOpenChange={(open) => !open && setSelectedIntro(null)}
        />
      </div>
    </div>
  );
}

function IntroSectionDialog({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: IntroFormState;
  setForm: (form: IntroFormState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{form.id ? "Sửa thẻ giới thiệu" : "Thêm thẻ giới thiệu"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 md:grid-cols-[120px_1fr_140px]">
        <Field label="Icon/emoji">
          <Input
            value={form.icon}
            onChange={(event) => setForm({ ...form, icon: event.target.value })}
            placeholder="🚀"
          />
        </Field>
        <Field label="Tiêu đề">
          <Input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Giới thiệu & Hướng dẫn"
          />
        </Field>
        <Field label="Thứ tự">
          <Input
            type="number"
            value={form.sort_order}
            onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value) || 0 })}
          />
        </Field>
        <div className="md:col-span-3">
          <Label>Mô tả ngắn</Label>
          <Textarea
            className="mt-1 min-h-20"
            value={form.summary}
            onChange={(event) => setForm({ ...form, summary: event.target.value })}
            placeholder="Mô tả ngắn hiển thị trên thẻ"
          />
        </div>
        <Field label="Ảnh URL">
          <Input
            value={form.image_url}
            onChange={(event) => setForm({ ...form, image_url: event.target.value })}
            placeholder="https://..."
          />
        </Field>
        <Field label="Link URL">
          <Input
            value={form.link_url}
            onChange={(event) => setForm({ ...form, link_url: event.target.value })}
            placeholder="https://..."
          />
        </Field>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <Checkbox
            checked={form.is_active}
            onCheckedChange={(value) => setForm({ ...form, is_active: !!value })}
          />
          Đang hiển thị
        </label>
        <div className="md:col-span-3">
          <Label>Nội dung mô tả chi tiết</Label>
          <Textarea
            className="mt-1 min-h-40"
            value={form.content}
            onChange={(event) => setForm({ ...form, content: event.target.value })}
            placeholder="Nội dung chi tiết khi mở popup"
          />
        </div>
        <div className="flex justify-end gap-2 md:col-span-3">
          <Button variant="outline" onClick={onCancel}>
            <X className="mr-2 h-4 w-4" /> Hủy
          </Button>
          <Button onClick={onSave}>
            <Save className="mr-2 h-4 w-4" /> Lưu
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function IntroCard({
  intro,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
}: {
  intro: IntroSection;
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="group flex min-h-56 flex-col rounded-[28px] border border-white/10 bg-white/[0.08] p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:bg-white/[0.12] hover:shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-3xl shadow-inner">
          {intro.icon ?? "🚀"}
        </div>
        {canEdit && (
          <div className="flex gap-1 opacity-80 transition group-hover:opacity-100">
            {!intro.is_active && (
              <Badge variant="secondary" className="border-white/10 bg-white/10 text-white">
                Ẩn
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-white/70 hover:bg-red-500/15 hover:text-red-200"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="mt-8 flex flex-1 flex-col">
        <h3 className="line-clamp-2 text-xl font-extrabold tracking-tight text-white">
          {intro.title}
        </h3>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/60">
          {intro.summary ?? intro.content ?? "Click để xem chi tiết."}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-violet-300">
          Xem chi tiết
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
        </div>
      </div>
    </div>
  );
}

function IntroDetailDialog({
  intro,
  onOpenChange,
}: {
  intro: IntroSection | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!intro} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl border-slate-700 bg-slate-950 p-0 text-white shadow-2xl [&>button]:rounded-full [&>button]:text-white/70 [&>button]:opacity-100 [&>button:hover]:bg-white/10 [&>button:hover]:text-white">
        {intro && (
          <>
            <DialogHeader className="shrink-0 border-b border-white/10 bg-slate-950/95 px-6 py-5 pr-14 text-left">
              <DialogTitle className="flex items-center gap-3 text-2xl font-extrabold">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-2xl">
                  {intro.icon ?? "🚀"}
                </span>
                {intro.title}
              </DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.28)_transparent]">
              {intro.image_url && (
                <div className="mb-6 flex justify-center">
                  <img
                    src={intro.image_url}
                    alt={intro.title}
                    className="aspect-square w-full max-w-sm rounded-2xl border border-white/10 object-cover shadow-lg"
                  />
                </div>
              )}
              {intro.summary && (
                <p className="mb-5 text-base font-medium leading-8 text-white/85">
                  {intro.summary}
                </p>
              )}
              <div className="whitespace-pre-line text-sm leading-8 text-white/70">
                {intro.content ?? "Chưa có nội dung chi tiết."}
              </div>
            </div>
            {intro.link_url && (
              <div className="shrink-0 border-t border-white/10 bg-slate-950/95 px-6 py-4">
                <Button
                  asChild
                  className="ml-auto flex w-fit rounded-full bg-violet-500 text-white hover:bg-violet-400"
                >
                  <a href={intro.link_url} target="_blank" rel="noreferrer">
                    Mở liên kết <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
