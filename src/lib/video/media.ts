import type { LoadedAudio, LoadedImage } from "../state/editor-store";

export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/ogg"];

export function isVideoBlob(blob: Blob): boolean {
  return blob.type.startsWith("video/");
}

/** Resolves when `type` fires, rejects on a media error or after `ms`. */
function once(video: HTMLVideoElement, type: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      video.removeEventListener(type, onEvent);
      video.removeEventListener("error", onError);
      fn();
    };
    const onEvent = () => done(resolve);
    const onError = () => done(() => reject(new Error("This video can't be played by your browser.")));
    const timer = setTimeout(() => done(() => reject(new Error(`Timed out waiting for video (${type}).`))), ms);
    video.addEventListener(type, onEvent);
    video.addEventListener("error", onError);
  });
}

/**
 * Moves a video to `time` and resolves once the frame there is ready to draw. Used when we need a
 * specific frame (export, thumbnails); playback just assigns currentTime and lets the element catch up.
 */
export async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, time);
  if (Math.abs(video.currentTime - target) < 0.0005 && video.readyState >= 2 && !video.seeking) return;
  const seeked = once(video, "seeked", 8000);
  video.currentTime = target;
  await seeked;
}

/**
 * Loads a video file as a media source. `knownDuration` (seconds) is used for recordings: browsers write
 * MediaRecorder output without a duration, so we pass the measured length and make the element seekable.
 */
export async function loadVideo(blob: Blob, id: string = crypto.randomUUID(), knownDuration?: number): Promise<LoadedImage> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadedmetadata", 20000);
    if (!Number.isFinite(video.duration)) {
      // Recorded WebM has no duration or index. Seeking far past the end makes the browser scan it and learn the length.
      const learned = once(video, "durationchange", 8000).catch(() => undefined);
      video.currentTime = 1e101;
      await Promise.race([learned, once(video, "seeked", 8000).catch(() => undefined)]);
      await seekVideo(video, 0).catch(() => undefined);
    }
    if (video.readyState < 2) await once(video, "loadeddata", 8000);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const duration = knownDuration ?? (Number.isFinite(video.duration) ? video.duration : 0);
  if (!(duration > 0) || video.videoWidth === 0) {
    URL.revokeObjectURL(url);
    throw new Error("This file has no video to show.");
  }
  // Giving the element its pixel size lets it stand in anywhere we expect an image with width and height.
  video.width = video.videoWidth;
  video.height = video.videoHeight;
  const dispose = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  };
  return { id, kind: "video", width: video.videoWidth, height: video.videoHeight, source: video, blob, duration, video, dispose };
}

export const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/opus", "audio/flac", "audio/x-m4a"];

export function isAudioBlob(blob: Blob): boolean {
  return blob.type.startsWith("audio/");
}

/** Loads an audio file (music) and reads its length. */
export async function loadAudio(blob: Blob, id: string = crypto.randomUUID()): Promise<LoadedAudio> {
  const url = URL.createObjectURL(blob);
  const element = new Audio();
  element.preload = "auto";
  element.src = url;
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out reading this audio file.")), 20000);
    element.addEventListener("loadedmetadata", () => {
      clearTimeout(timer);
      resolve();
    });
    element.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("This audio file can't be played by your browser."));
    });
  });
  try {
    await ready;
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  if (!Number.isFinite(element.duration) || element.duration <= 0) {
    URL.revokeObjectURL(url);
    throw new Error("This audio file has no length, so it can't be used.");
  }
  const dispose = () => {
    element.pause();
    element.removeAttribute("src");
    element.load();
    URL.revokeObjectURL(url);
  };
  return { id, blob, duration: element.duration, element, dispose };
}
