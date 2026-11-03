import type { ReactNode } from "react";

/** Small outline icons, drawn here so the editor needs no icon package. They are decorative: the button's text names it. */
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="shrink-0">
      {children}
    </svg>
  );
}

export const icons = {
  upload: (
    <Icon>
      <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
    </Icon>
  ),
  screen: (
    <Icon>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Icon>
  ),
  link: (
    <Icon>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />
    </Icon>
  ),
  record: (
    <Icon>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </Icon>
  ),
  undo: (
    <Icon>
      <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
    </Icon>
  ),
  redo: (
    <Icon>
      <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
    </Icon>
  ),
  timeline: (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M8 5v5M16 5v5" />
    </Icon>
  ),
  search: (
    <Icon>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4-4" />
    </Icon>
  ),
  copy: (
    <Icon>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </Icon>
  ),
  sizes: (
    <Icon>
      <rect x="3" y="3" width="9" height="9" rx="1.5" />
      <rect x="14" y="8" width="7" height="13" rx="1.5" />
      <rect x="3" y="15" width="9" height="6" rx="1.5" />
    </Icon>
  ),
  video: (
    <Icon>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </Icon>
  ),
  share: (
    <Icon>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
    </Icon>
  ),
  download: (
    <Icon>
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </Icon>
  ),
  help: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
    </Icon>
  ),
  reset: (
    <Icon>
      <path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5" />
    </Icon>
  ),
  chevron: (
    <Icon size={16}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  ),
  // Panel tabs
  templates: (
    <Icon size={20}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  canvas: (
    <Icon size={20}>
      <path d="M7 3v14h14M3 7h14v14" />
    </Icon>
  ),
  background: (
    <Icon size={20}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m21 16-5-5-8 8" />
    </Icon>
  ),
  style: (
    <Icon size={20}>
      <rect x="4" y="5" width="16" height="12" rx="2.5" />
      <path d="M2 21h20" />
    </Icon>
  ),
  text: (
    <Icon size={20}>
      <path d="M5 6V4h14v2M12 4v16M9 20h6" />
    </Icon>
  ),
  insert: (
    <Icon size={20}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </Icon>
  ),
  layers: (
    <Icon size={20}>
      <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" />
    </Icon>
  ),
  brand: (
    <Icon size={20}>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.4-1.2-1.6-1.2-2.7 0-.8.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4C21 7 17 3 12 3Z" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" />
      <circle cx="10.5" cy="7.5" r="1" fill="currentColor" />
      <circle cx="15" cy="8" r="1" fill="currentColor" />
    </Icon>
  ),
} as const;
