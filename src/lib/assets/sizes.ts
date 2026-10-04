export interface SizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
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
];

export function getSizePreset(id: string): SizePreset | undefined {
  return SIZE_PRESETS.find((s) => s.id === id);
}
