export interface SizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  /** Set for app-store and gallery sizes, which stores change from time to time. */
  store?: boolean;
}

export const SIZE_PRESETS: SizePreset[] = [
  { id: "x-post", label: "X post", width: 1600, height: 900 },
  { id: "x-header", label: "X header", width: 1500, height: 500 },
  { id: "linkedin", label: "LinkedIn", width: 1200, height: 627 },
  { id: "instagram", label: "Instagram", width: 1080, height: 1080 },
  { id: "portrait", label: "Portrait 4:5", width: 1080, height: 1350 },
  { id: "story", label: "Story / Reel", width: 1080, height: 1920 },
  { id: "og", label: "Open Graph", width: 1200, height: 630 },
  { id: "youtube", label: "YouTube", width: 1280, height: 720 },
  // Store sizes. These are common sizes from memory; check each store's current requirements before uploading.
  { id: "appstore-69", label: "App Store 6.9″", width: 1320, height: 2868, store: true },
  { id: "appstore-65", label: "App Store 6.5″", width: 1284, height: 2778, store: true },
  { id: "appstore-ipad", label: "App Store iPad 13″", width: 2064, height: 2752, store: true },
  { id: "play-phone", label: "Play phone", width: 1080, height: 1920, store: true },
  { id: "play-feature", label: "Play feature graphic", width: 1024, height: 500, store: true },
  { id: "producthunt", label: "Product Hunt gallery", width: 1270, height: 760, store: true },
];

export function getSizePreset(id: string): SizePreset | undefined {
  return SIZE_PRESETS.find((s) => s.id === id);
}
