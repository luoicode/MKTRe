import { useState } from "react";
import { Download, ImageIcon, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyReportImageToClipboard, saveReportImage } from "@/utils/reportImageStorage";

export function ReportImagePreviewDialog({
  open,
  imageUrl,
  blob,
  filename,
  isGenerating,
  onClose,
}: {
  open: boolean;
  imageUrl: string | null;
  blob: Blob | null;
  filename: string;
  isGenerating: boolean;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  const handleSave = async () => {
    if (!blob) return;
    setSaving(true);
    try {
      await saveReportImage(blob, filename);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!blob) return;
    setCopying(true);
    try {
      const copied = await copyReportImageToClipboard(blob);
      if (copied) {
        toast.success("Đã copy ảnh báo cáo");
        return;
      }
      toast.error("Không copy được ảnh, hệ thống sẽ tải ảnh xuống");
      await saveReportImage(blob, filename);
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4" />
            Preview ảnh báo cáo
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-y-auto bg-slate-100 p-4">
          {isGenerating ? (
            <div className="flex min-h-80 items-center justify-center rounded-lg bg-white">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : imageUrl ? (
            <div className="flex justify-center">
              <img
                src={imageUrl}
                alt="Preview ảnh báo cáo"
                className="max-h-[68vh] w-auto max-w-full border border-slate-300 bg-white"
              />
            </div>
          ) : (
            <div className="flex min-h-80 items-center justify-center rounded-lg bg-white text-sm text-slate-500">
              Chưa tạo được ảnh báo cáo.
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t bg-white px-4 py-3">
          <Button onClick={handleSave} disabled={!blob || saving || isGenerating} size="sm">
            <Download className="mr-2 h-4 w-4" />
            {saving ? "Đang tải..." : "Tải ảnh"}
          </Button>
          <Button
            onClick={handleCopy}
            disabled={!blob || copying || isGenerating}
            variant="outline"
            size="sm"
          >
            <Copy className="mr-2 h-4 w-4" />
            {copying ? "Đang copy..." : "Copy ảnh"}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
