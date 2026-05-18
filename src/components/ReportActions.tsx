import { useEffect, useRef, useState, type RefObject } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Camera, Eye, EyeOff, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { chooseReportImageDirectory } from "@/utils/reportImageStorage";
import {
  ReportSheetImageTemplate,
  type ReportSheetImageData,
} from "@/components/ReportSheetImageTemplate";
import { ReportImagePreviewDialog } from "@/components/ReportImagePreviewDialog";

export function ReportActions({
  targetRef,
  filename,
  screenshotMode,
  onToggleScreenshot,
  sheetData,
}: {
  targetRef: RefObject<HTMLDivElement | null>;
  filename: string;
  screenshotMode: boolean;
  onToggleScreenshot: () => void;
  sheetData?: ReportSheetImageData;
}) {
  const [busy, setBusy] = useState(false);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  const capture = async () => {
    const target = sheetData ? sheetRef.current : targetRef.current;
    if (!target) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const blob = await (await fetch(dataUrl)).blob();
      setImageBlob(blob);
      setImageUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return URL.createObjectURL(blob);
      });
      setPreviewOpen(true);
    } catch {
      toast.error("Không tạo được ảnh báo cáo");
    } finally {
      setBusy(false);
    }
  };

  const chooseFolder = async () => {
    await chooseReportImageDirectory();
  };

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button onClick={capture} disabled={busy} size="sm">
        <Camera className="mr-2 h-4 w-4" />
        {busy ? "Đang xuất..." : "Tải ảnh"}
      </Button>
      <Button
        onClick={chooseFolder}
        variant="outline"
        size="sm"
        title="Chọn thư mục lưu ảnh báo cáo"
      >
        <FolderOpen className="mr-2 h-4 w-4" />
        Thư mục lưu
      </Button>
      <Button onClick={onToggleScreenshot} variant="outline" size="sm">
        {screenshotMode ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
        {screenshotMode ? "Tắt Screenshot Mode" : "Screenshot Mode"}
      </Button>
      {sheetData && (
        <div className="pointer-events-none fixed -left-[10000px] top-0 opacity-100">
          <ReportSheetImageTemplate ref={sheetRef} data={sheetData} />
        </div>
      )}
      <ReportImagePreviewDialog
        open={previewOpen}
        imageUrl={imageUrl}
        blob={imageBlob}
        filename={filename}
        isGenerating={busy}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
