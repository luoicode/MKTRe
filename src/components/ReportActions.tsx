import { useState, type RefObject } from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Camera, Copy, Check, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function ReportActions({
  targetRef,
  filename,
  buildText,
  screenshotMode,
  onToggleScreenshot,
}: {
  targetRef: RefObject<HTMLDivElement | null>;
  filename: string;
  buildText: () => string;
  screenshotMode: boolean;
  onToggleScreenshot: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const capture = async () => {
    if (!targetRef.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(targetRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const a = document.createElement("a");
      a.download = filename;
      a.href = dataUrl;
      a.click();
      toast.success("Đã tải ảnh báo cáo");
    } catch {
      toast.error("Chụp màn hình thất bại");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      toast.success("Đã copy nội dung báo cáo");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy thất bại");
    }
  };

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button onClick={capture} disabled={busy} size="sm">
        <Camera className="mr-2 h-4 w-4" />
        {busy ? "Đang chụp..." : "Chụp màn hình báo cáo"}
      </Button>
      <Button onClick={copy} variant="secondary" size="sm">
        {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
        Copy nội dung báo cáo
      </Button>
      <Button onClick={onToggleScreenshot} variant="outline" size="sm">
        {screenshotMode ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
        {screenshotMode ? "Tắt Screenshot Mode" : "Screenshot Mode"}
      </Button>
    </div>
  );
}
