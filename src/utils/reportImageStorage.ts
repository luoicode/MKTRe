import { toast } from "sonner";

type WritableFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type DirectoryHandle = {
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<WritableFileHandle>;
  queryPermission?: (options?: { mode?: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: "readwrite" }) => Promise<PermissionState>;
};

const DB_NAME = "mktre-report-image-storage";
const STORE_NAME = "handles";
const DIRECTORY_KEY = "mktre_report_image_directory";

let cachedDirectoryHandle: DirectoryHandle | null = null;

export async function chooseReportImageDirectory() {
  if (!supportsDirectoryPicker()) {
    toast.info("Trình duyệt không hỗ trợ lưu thư mục cố định.");
    return false;
  }

  try {
    const handle = await windowWithDirectoryPicker().showDirectoryPicker();
    cachedDirectoryHandle = handle;
    await storeDirectoryHandle(handle);
    toast.success("Đã chọn thư mục lưu ảnh báo cáo");
    return true;
  } catch (error) {
    if (isAbortError(error)) return false;
    toast.error("Không chọn được thư mục lưu ảnh báo cáo");
    return false;
  }
}

export async function saveReportImage(blob: Blob, filename: string) {
  const safeFilename = sanitizeFilename(filename);
  const saveResult = await persistReportImage(blob, safeFilename);

  if (saveResult.saved && saveResult.message) {
    toast.success(saveResult.message);
  }

  return saveResult.saved;
}

async function persistReportImage(blob: Blob, safeFilename: string) {
  if (!supportsDirectoryPicker()) {
    downloadBlob(blob, safeFilename);
    return {
      saved: true,
      message: "Trình duyệt không hỗ trợ lưu thư mục cố định, ảnh đã được tải xuống.",
    };
  }

  const handle = cachedDirectoryHandle ?? (await getStoredDirectoryHandle());
  if (!handle || !(await ensureWritePermission(handle))) {
    downloadBlob(blob, safeFilename);
    return { saved: true, message: "Đã tải ảnh báo cáo" };
  }

  try {
    await saveBlobToDirectory(handle, safeFilename, blob);
    cachedDirectoryHandle = handle;
    return { saved: true, message: "Đã lưu ảnh báo cáo" };
  } catch (error) {
    if (isAbortError(error)) return { saved: false };
    toast.error("Không lưu được ảnh báo cáo");
    return { saved: false };
  }
}

export async function copyReportImageToClipboard(blob: Blob) {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard?.write ||
    typeof ClipboardItem === "undefined"
  ) {
    return false;
  }

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function hasReportImageDirectory() {
  if (!supportsDirectoryPicker()) return false;
  return !!(cachedDirectoryHandle ?? (await getStoredDirectoryHandle()));
}

function supportsDirectoryPicker() {
  return (
    typeof window !== "undefined" &&
    typeof windowWithDirectoryPicker().showDirectoryPicker === "function"
  );
}

function windowWithDirectoryPicker() {
  return window as unknown as { showDirectoryPicker: () => Promise<DirectoryHandle> };
}

async function ensureWritePermission(handle: DirectoryHandle) {
  const options = { mode: "readwrite" as const };
  if (handle.queryPermission && (await handle.queryPermission(options)) === "granted") return true;
  if (handle.requestPermission) return (await handle.requestPermission(options)) === "granted";
  return true;
}

async function saveBlobToDirectory(handle: DirectoryHandle, filename: string, blob: Blob) {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function openHandleDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeDirectoryHandle(handle: DirectoryHandle) {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, DIRECTORY_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getStoredDirectoryHandle() {
  try {
    const db = await openHandleDb();
    const handle = await new Promise<DirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(DIRECTORY_KEY);
      request.onsuccess = () => resolve((request.result as DirectoryHandle | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(filename: string) {
  const cleaned = filename
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return cleaned.endsWith(".png") ? cleaned : `${cleaned || "report"}.png`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
