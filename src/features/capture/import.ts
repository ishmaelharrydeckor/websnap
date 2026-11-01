import type { LoadedImage } from "@/lib/state/editor-store";
import { isVideoBlob, loadVideo, VIDEO_TYPES } from "@/lib/video/media";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp"];

export function isImageFile(file: File | Blob): boolean {
  return ACCEPTED.includes(file.type);
}

export function isMediaFile(file: File | Blob): boolean {
  return isImageFile(file) || VIDEO_TYPES.includes(file.type);
}

/** Loads an image or a video. `knownDuration` is for recordings, whose files carry no duration. */
export async function blobToLoadedMedia(blob: Blob, id: string = crypto.randomUUID(), knownDuration?: number): Promise<LoadedImage> {
  return isVideoBlob(blob) ? loadVideo(blob, id, knownDuration) : blobToLoadedImage(blob, id);
}

export async function blobToLoadedImage(blob: Blob, id: string = crypto.randomUUID()): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(blob);
  return { id, width: bitmap.width, height: bitmap.height, source: bitmap, blob };
}

/** First image or video found in a clipboard or drag-and-drop transfer. */
export function firstImageFrom(data: DataTransfer | null): File | undefined {
  if (!data) return undefined;
  for (const file of Array.from(data.files)) if (isMediaFile(file)) return file;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && (ACCEPTED.includes(item.type) || VIDEO_TYPES.includes(item.type))) {
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
