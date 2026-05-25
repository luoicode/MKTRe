import { useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Link2,
  Megaphone,
  Pin,
  Search,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saleDocuments, type SaleDocument, type SaleDocumentType } from "@/lib/saleDocuments";

type SaleDocumentFilter = "all" | SaleDocumentType;

const documentFilters: Array<{ value: SaleDocumentFilter; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word" },
  { value: "xlsx", label: "Excel" },
  { value: "link", label: "Link" },
  { value: "announcement", label: "Thông báo" },
];

export function SaleInfoPage() {
  const [activeFilter, setActiveFilter] = useState<SaleDocumentFilter>("all");
  const [search, setSearch] = useState("");

  const pinnedDocument = useMemo(
    () =>
      [...saleDocuments]
        .filter((document) => document.is_pinned)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? saleDocuments[0],
    [],
  );

  const filteredDocuments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return saleDocuments.filter((document) => {
      const matchesFilter = activeFilter === "all" || document.file_type === activeFilter;
      const matchesSearch =
        !keyword ||
        document.title.toLowerCase().includes(keyword) ||
        document.description.toLowerCase().includes(keyword) ||
        document.category.toLowerCase().includes(keyword);
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, search]);

  const recentDocuments = useMemo(
    () => [...saleDocuments].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4),
    [],
  );

  return (
    <div className="space-y-4 pb-4">
      <WorkspacePageHeader
        icon={<BookOpen className="h-5 w-5" />}
        title="Tài liệu & Thông báo"
        subtitle="Tài liệu, quy trình và thông báo dành cho đội Sale"
      />

      <SaleAnnouncementBanner document={pinnedDocument} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-3 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Tìm theo tên tài liệu, quy trình, script..."
                    className="h-10 rounded-xl pl-9"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                  {documentFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      className={cn(
                        "whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold transition",
                        activeFilter === filter.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                      )}
                      onClick={() => setActiveFilter(filter.value)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            {filteredDocuments.map((document) => (
              <SaleDocumentCard key={document.id} document={document} />
            ))}
          </div>

          {!filteredDocuments.length ? (
            <Card className="rounded-2xl border-dashed bg-slate-50">
              <CardContent className="flex min-h-44 flex-col items-center justify-center p-6 text-center">
                <BookOpen className="h-8 w-8 text-slate-400" />
                <p className="mt-3 font-bold text-slate-900">Không tìm thấy tài liệu</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Thử đổi bộ lọc hoặc tìm bằng từ khóa khác.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <RecentSaleUpdates documents={recentDocuments} />
      </div>
    </div>
  );
}

function SaleAnnouncementBanner({ document }: { document: SaleDocument }) {
  return (
    <Card className="overflow-hidden rounded-3xl border-0 bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-700 text-white shadow-xl">
      <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-white/20 bg-white/15 text-white hover:bg-white/15">
              <Pin className="mr-1 h-3 w-3" />
              Ghim
            </Badge>
            <Badge className="border-white/20 bg-white/15 text-white hover:bg-white/15">
              {document.category}
            </Badge>
            <span className="text-xs font-semibold text-white/70">
              Cập nhật {formatSaleDocumentDate(document.updated_at)}
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">{document.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/78">{document.description}</p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-white/70">
            <UserRound className="h-3.5 w-3.5" />
            Người đăng: {document.uploaded_by}
          </p>
        </div>
        <div className="flex gap-2 md:flex-col">
          <DocumentActionButton document={document} mode="view" variant="secondary" />
          <DocumentActionButton document={document} mode="download" variant="outline" />
        </div>
      </CardContent>
    </Card>
  );
}

function SaleDocumentCard({ document }: { document: SaleDocument }) {
  const Icon = getSaleDocumentIcon(document.file_type);
  return (
    <Card className="group rounded-2xl border-slate-200 transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                getSaleDocumentTone(document.file_type),
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="rounded-full">
                  {getSaleDocumentTypeLabel(document.file_type)}
                </Badge>
                {document.is_pinned ? (
                  <Badge className="rounded-full bg-amber-50 text-amber-700 hover:bg-amber-50">
                    Ghim
                  </Badge>
                ) : null}
              </div>
              <h3 className="mt-2 line-clamp-2 font-black text-slate-950">{document.title}</h3>
            </div>
          </div>
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {document.description}
        </p>
        <div className="mt-auto space-y-3">
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatSaleDocumentDate(document.updated_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              {document.uploaded_by}
            </span>
          </div>
          <div className="flex gap-2">
            <DocumentActionButton document={document} mode="view" />
            <DocumentActionButton document={document} mode="download" variant="outline" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentSaleUpdates({ documents }: { documents: SaleDocument[] }) {
  return (
    <Card className="h-fit rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-5 w-5 text-primary" />
          Cập nhật gần đây
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.map((document) => {
          const Icon = getSaleDocumentIcon(document.file_type);
          return (
            <div key={document.id} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  getSaleDocumentTone(document.file_type),
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-bold text-slate-950">{document.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatSaleDocumentDate(document.updated_at)} · {document.uploaded_by}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DocumentActionButton({
  document,
  mode,
  variant = "default",
}: {
  document: SaleDocument;
  mode: "view" | "download";
  variant?: "default" | "secondary" | "outline";
}) {
  const handleClick = () => {
    if (document.file_url === "#") {
      toast.info("Tài liệu mock, chưa có file thật để mở.");
      return;
    }
    window.open(document.file_url, "_blank", "noopener,noreferrer");
  };

  return (
    <Button size="sm" variant={variant} className="gap-2" onClick={handleClick}>
      {mode === "view" ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      {mode === "view" ? "Xem" : "Tải xuống"}
    </Button>
  );
}

function getSaleDocumentIcon(fileType: SaleDocumentType) {
  if (fileType === "xlsx") return FileSpreadsheet;
  if (fileType === "link") return Link2;
  if (fileType === "announcement") return Megaphone;
  return FileText;
}

function getSaleDocumentTone(fileType: SaleDocumentType) {
  const tones: Record<SaleDocumentType, string> = {
    pdf: "bg-rose-50 text-rose-700",
    docx: "bg-blue-50 text-blue-700",
    xlsx: "bg-emerald-50 text-emerald-700",
    link: "bg-violet-50 text-violet-700",
    announcement: "bg-amber-50 text-amber-700",
  };
  return tones[fileType];
}

function getSaleDocumentTypeLabel(fileType: SaleDocumentType) {
  const labels: Record<SaleDocumentType, string> = {
    pdf: "PDF",
    docx: "DOCX",
    xlsx: "XLSX",
    link: "LINK",
    announcement: "Thông báo",
  };
  return labels[fileType];
}

function formatSaleDocumentDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
