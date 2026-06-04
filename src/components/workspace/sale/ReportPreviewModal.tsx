import { Copy, Download, ImageIcon, Loader2, RotateCcw, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveReportImage } from "@/utils/reportImageStorage";

export function ReportPreviewModal({
  open,
  imageUrl,
  blob,
  filename,
  isCapturing,
  isSubmitting,
  showSubmitAction,
  onClose,
  onRecapture,
  onConfirmSubmit,
}: {
  open: boolean;
  imageUrl: string | null;
  blob: Blob | null;
  filename: string;
  isCapturing: boolean;
  isSubmitting: boolean;
  showSubmitAction: boolean;
  onClose: () => void;
  onRecapture: () => void;
  onConfirmSubmit: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);

  const downloadImage = async () => {
    if (!blob) return;
    setDownloading(true);
    try {
      await saveReportImage(blob, filename);
    } finally {
      setDownloading(false);
    }
  };

  const copyImage = async () => {
    if (!blob) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      toast.error("Trình duyệt chưa hỗ trợ copy ảnh vào clipboard.");
      return;
    }

    setCopying(true);
    try {
      const imageBlob = blob.type === "image/png" ? blob : new Blob([blob], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ [imageBlob.type]: imageBlob })]);
      toast.success("Đã copy ảnh báo cáo");
    } catch {
      toast.error("Không thể copy ảnh. Vui lòng thử tải ảnh xuống.");
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
            Preview báo cáo ca làm
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[75vh] overflow-y-auto bg-slate-100 p-4">
          {isCapturing ? (
            <div className="flex min-h-80 items-center justify-center rounded-lg bg-white">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : imageUrl ? (
            <div className="flex justify-center">
              <img
                src={imageUrl}
                alt="Preview báo cáo ca làm"
                className="max-h-[68vh] w-auto max-w-full border border-slate-300 bg-white"
              />
            </div>
          ) : (
            <div className="flex min-h-80 items-center justify-center rounded-lg bg-white text-sm text-slate-500">
              Chưa tạo được ảnh báo cáo.
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-wrap justify-end gap-2 border-t bg-white px-4 py-3 sm:justify-end">
          <Button
            type="button"
            onClick={downloadImage}
            disabled={!blob || downloading || isCapturing || isSubmitting}
            size="sm"
          >
            <Download className="mr-2 h-4 w-4" />
            {downloading ? "Đang tải..." : "Tải ảnh"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={copyImage}
            disabled={!blob || copying || isCapturing || isSubmitting}
            size="sm"
          >
            {copying ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Copy ảnh
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onRecapture}
            disabled={isCapturing || isSubmitting}
            size="sm"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Chụp lại
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            size="sm"
          >
            Đóng
          </Button>
          {showSubmitAction && (
            <Button
              type="button"
              onClick={onConfirmSubmit}
              disabled={!blob || isCapturing || isSubmitting}
              size="sm"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Xác nhận gửi báo cáo
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
