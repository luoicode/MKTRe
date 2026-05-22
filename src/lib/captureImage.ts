import { toBlob } from "html-to-image";

const TRANSPARENT_IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export type CaptureElementOptions = {
  target: HTMLElement | null;
  backgroundColor?: string;
  filename?: string;
  fullContent?: boolean;
  pixelRatio?: number;
  waitMs?: number;
  expandScrollableChildren?: boolean;
  filter?: (domNode: HTMLElement) => boolean;
};

export type CapturedPng = {
  blob: Blob;
  url: string;
};

export async function captureElementAsPngBlob({
  target,
  backgroundColor = "#ffffff",
  fullContent = true,
  pixelRatio = 2,
  waitMs = 80,
  expandScrollableChildren = fullContent,
  filter,
}: CaptureElementOptions): Promise<Blob> {
  if (!target) {
    throw new Error("Không tìm thấy vùng cần chụp");
  }

  const restoreScrollableChildren = expandScrollableChildren
    ? expandScrollableDescendants(target)
    : () => undefined;

  try {
    await waitForCaptureReady(waitMs);

    const width = fullContent
      ? Math.max(target.scrollWidth, target.offsetWidth)
      : target.offsetWidth;
    const height = fullContent
      ? Math.max(target.scrollHeight, target.offsetHeight)
      : target.offsetHeight;

    const blob = await toBlob(target, {
      cacheBust: true,
      imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
      pixelRatio,
      backgroundColor,
      width,
      height,
      style: fullContent
        ? {
            maxHeight: "none",
            overflow: "visible",
            transform: "none",
            width: `${width}px`,
            height: `${height}px`,
          }
        : { transform: "none" },
      filter: (node) => {
        if (node instanceof HTMLElement && node.classList.contains("screenshot-hide")) {
          return false;
        }
        return filter ? filter(node) : true;
      },
    });

    if (!blob) {
      throw new Error("Không thể tạo ảnh PNG");
    }

    return blob;
  } finally {
    restoreScrollableChildren();
  }
}

export async function captureElementAsPngUrl(options: CaptureElementOptions): Promise<CapturedPng> {
  const blob = await captureElementAsPngBlob(options);
  return { blob, url: URL.createObjectURL(blob) };
}

export function downloadBlob(blob: Blob, filename = "screenshot.png") {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function waitForCaptureReady(waitMs = 80) {
  await document.fonts?.ready;
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  if (waitMs > 0) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, waitMs));
  }
}

function expandScrollableDescendants(target: HTMLElement) {
  const changedNodes: Array<{
    node: HTMLElement;
    height: string;
    maxHeight: string;
    minHeight: string;
    overflow: string;
    overflowY: string;
  }> = [];

  const nodes = [target, ...Array.from(target.querySelectorAll<HTMLElement>("*"))];
  for (const node of nodes) {
    const style = window.getComputedStyle(node);
    const clipsContent =
      node.scrollHeight > node.clientHeight + 2 &&
      ["auto", "scroll", "hidden", "clip"].some(
        (value) => style.overflowY === value || style.overflow === value,
      );

    if (!clipsContent) continue;

    changedNodes.push({
      node,
      height: node.style.height,
      maxHeight: node.style.maxHeight,
      minHeight: node.style.minHeight,
      overflow: node.style.overflow,
      overflowY: node.style.overflowY,
    });
    node.style.height = "auto";
    node.style.maxHeight = "none";
    node.style.minHeight = `${Math.max(node.scrollHeight, node.clientHeight)}px`;
    node.style.overflow = "visible";
    node.style.overflowY = "visible";
  }

  return () => {
    for (const entry of changedNodes.reverse()) {
      entry.node.style.height = entry.height;
      entry.node.style.maxHeight = entry.maxHeight;
      entry.node.style.minHeight = entry.minHeight;
      entry.node.style.overflow = entry.overflow;
      entry.node.style.overflowY = entry.overflowY;
    }
  };
}
