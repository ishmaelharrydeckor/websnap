/** Picks the best container the browser can record: WebM first (widely supported for recording), MP4 as a fallback. */
export function pickRecordingType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
}

export interface Recording {
  blob: Blob;
  /** Measured length in seconds (recorded files carry no reliable duration). */
  duration: number;
}

export interface RecorderHandle {
  /** Stops recording. The `finished` promise then resolves. */
  stop: () => void;
  /** Resolves with the recording once it stops, whether you stopped it or the user ended sharing in the browser. */
  finished: Promise<Recording>;
}

/** Asks the user to pick a screen, window or tab and starts recording it, with sound if they share it. */
export async function startScreenRecording(): Promise<RecorderHandle> {
  const mimeType = pickRecordingType();
  if (!mimeType) throw new Error("Screen recording isn't supported in this browser.");
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  const startedAt = performance.now();

  const finished = new Promise<Recording>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("Recording failed."));
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const duration = (performance.now() - startedAt) / 1000;
      if (chunks.length === 0) reject(new Error("Nothing was recorded."));
      else resolve({ blob: new Blob(chunks, { type: mimeType.split(";")[0] }), duration });
    };
  });

  // The user can end sharing from the browser's own control; treat that as stop.
  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    if (recorder.state !== "inactive") recorder.stop();
  });
  recorder.start(1000);
  return { stop: () => recorder.state !== "inactive" && recorder.stop(), finished };
}
