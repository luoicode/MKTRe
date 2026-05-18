import { useState, type RefObject } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Camera, Eye, EyeOff, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { chooseReportImageDirectory, saveReportImage } from "@/utils/reportImageStorage";

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

  const capture = async () => {
    if (!targetRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(targetRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const blob = await (await fetch(dataUrl)).blob();
      await saveReportImage(blob, filename);
    } catch {
      toast.error("Chụp màn hình thất bại");
    } finally {
      setBusy(false);
    }
  };

  const chooseFolder = async () => {
    await chooseReportImageDirectory();
  };

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button onClick={capture} disabled={busy} size="sm">
        <Camera className="mr-2 h-4 w-4" />
        {busy ? "Đang chụp..." : "Chụp màn hình báo cáo"}
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
    </div>
  );
}
