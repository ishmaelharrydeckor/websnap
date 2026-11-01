import type { LoadedImage } from "@/lib/state/editor-store";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp"];

export function isImageFile(file: File | Blob): boolean {
  return ACCEPTED.includes(file.type);
}

export async function blobToLoadedImage(blob: Blob, id: string = crypto.randomUUID()): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(blob);
  return { id, width: bitmap.width, height: bitmap.height, source: bitmap, blob };
}

/** First image found in a clipboard or drag-and-drop transfer. */
export function firstImageFrom(data: DataTransfer | null): File | undefined {
  if (!data) return undefined;
  for (const file of Array.from(data.files)) if (isImageFile(file)) return file;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && ACCEPTED.includes(item.type)) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return undefined;
}

/** Asks the user to pick a screen, tab or window and grabs a single frame as a PNG. */
export async function captureScreenFrame(): Promise<Blob> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // Give the browser a moment to deliver a real frame.
    await new Promise<void>((resolve) => {
      if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(() => resolve());
      else setTimeout(resolve, 250);
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not capture the screen"))), "image/png"),
    );
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
