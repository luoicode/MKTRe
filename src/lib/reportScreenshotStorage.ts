import { toast } from "sonner";

type WritableFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

export type DirectoryHandle = {
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<WritableFileHandle>;
  queryPermission?: (options?: { mode?: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: "readwrite" }) => Promise<PermissionState>;
};

let reportDirectoryHandle: DirectoryHandle | null = null;
const DB_NAME = "mktre-report-screenshots";
const STORE_NAME = "handles";
const HANDLE_KEY = "default-folder";

export async function chooseReportScreenshotFolder() {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandle> })
    .showDirectoryPicker;
  if (!picker) {
    toast.info("Trình duyệt chưa hỗ trợ chọn thư mục. Hệ thống sẽ tải ảnh theo cách mặc định.");
    return false;
  }
  reportDirectoryHandle = await picker();
  await storeDirectoryHandle(reportDirectoryHandle);
  window.localStorage.setItem("report_screenshot_folder_enabled", "1");
  return true;
}

export async function saveReportDataUrlToPreferredFolder(filename: string, dataUrl: string) {
  const directoryHandle = reportDirectoryHandle ?? (await getStoredDirectoryHandle());
  if (!directoryHandle || !(await ensureWritePermission(directoryHandle))) return false;
  reportDirectoryHandle = directoryHandle;
  const blob = await (await fetch(dataUrl)).blob();
  await saveBlobToDirectory(directoryHandle, filename, blob);
  toast.success("Đã lưu ảnh vào thư mục đã chọn");
  return true;
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
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getStoredDirectoryHandle() {
  if (window.localStorage.getItem("report_screenshot_folder_enabled") !== "1") return null;
  try {
    const db = await openHandleDb();
    const handle = await new Promise<DirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = () => resolve((request.result as DirectoryHandle | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}
