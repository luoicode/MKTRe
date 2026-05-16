import { useState, type RefObject } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Camera, Eye, EyeOff, Download, FolderOpen, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  chooseReportScreenshotFolder,
  saveReportDataUrlToPreferredFolder,
} from "@/lib/reportScreenshotStorage";

export function ReportActions({
  targetRef,
  filename,
  screenshotMode,
  onToggleScreenshot,
}: {
  targetRef: RefObject<HTMLDivElement | null>;
  filename: string;
  screenshotMode: boolean;
  onToggleScreenshot: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const capture = async () => {
    if (!targetRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(targetRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      if (await saveReportDataUrlToPreferredFolder(filename, dataUrl)) {
        return;
      }
      setPreview(dataUrl);
    } catch {
      toast.error("Chụp màn hình thất bại");
    } finally {
      setBusy(false);
    }
  };

  const chooseFolder = async () => {
    try {
      if (await chooseReportScreenshotFolder()) {
        toast.success("Đã chọn thư mục lưu ảnh");
      }
    } catch {
      toast.error("Không chọn được thư mục");
    }
  };

  const downloadPreview = async () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.download = filename;
    a.href = preview;
    a.click();
    toast.success("Đã tải ảnh báo cáo");
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={capture} disabled={busy} size="sm">
          <Camera className="mr-2 h-4 w-4" />
          {busy ? "Đang chụp..." : "Chụp màn hình báo cáo"}
        </Button>
        <Button onClick={chooseFolder} variant="outline" size="sm">
          <FolderOpen className="mr-2 h-4 w-4" />
          Thư mục lưu
        </Button>
        <Button onClick={onToggleScreenshot} variant="outline" size="sm">
          {screenshotMode ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
          {screenshotMode ? "Tắt Screenshot Mode" : "Screenshot Mode"}
        </Button>
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-2xl border-0 bg-slate-950 p-0 text-white shadow-2xl">
          <DialogHeader className="border-b border-white/10 px-4 py-3">
            <DialogTitle className="text-sm">Preview ảnh báo cáo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4">
            {preview && (
              <div className="max-h-[70vh] overflow-auto rounded-lg bg-white p-2">
                <img src={preview} alt="Report preview" className="mx-auto max-w-full rounded" />
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={downloadPreview}>
                <Download className="mr-2 h-4 w-4" />
                Tải ảnh
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                <X className="mr-2 h-4 w-4" />
                Đóng
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
