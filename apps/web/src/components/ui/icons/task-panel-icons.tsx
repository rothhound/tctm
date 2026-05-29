export const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconClose = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 16 16" {...stroke}><path d="M4 4L12 12M12 4L4 12" /></svg>
);
export const IconChevronDown = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 16 16" {...stroke}><path d="M3.5 6L8 10.5L12.5 6" /></svg>
);
export const IconChevronRight = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 16 16" {...stroke}><path d="M6 3.5L10.5 8L6 12.5" /></svg>
);
export const IconFlagFilled = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 14 14" fill="currentColor" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
    <path d="M3 1.5V12.5" /><path d="M3 2H10L8.5 4.5L10 7H3Z" />
  </svg>
);
export const IconCalendar = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 14 14" {...stroke}>
    <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" /><path d="M1.5 5.5H12.5" />
    <path d="M4.5 1V3.5" /><path d="M9.5 1V3.5" />
  </svg>
);
export const IconPlus = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 14 14" {...stroke}><path d="M7 2.5V11.5M2.5 7H11.5" /></svg>
);
export const IconCheck = (p: { size?: number }) => (
  <svg width={p.size ?? 10} height={p.size ?? 10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M2 5L4 7L8 3" /></svg>
);
export const IconGrip = (p: { size?: number }) => (
  <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 12 12" fill="currentColor">
    <circle cx="4.5" cy="3" r="0.9" /><circle cx="7.5" cy="3" r="0.9" />
    <circle cx="4.5" cy="6" r="0.9" /><circle cx="7.5" cy="6" r="0.9" />
    <circle cx="4.5" cy="9" r="0.9" /><circle cx="7.5" cy="9" r="0.9" />
  </svg>
);
export const IconNote = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 14 14" {...stroke}>
    <path d="M3 2H9L11 4V12H3V2Z" /><path d="M9 2V4H11" /><path d="M5 7H9M5 9.5H8" />
  </svg>
);
export const IconPencil = (p: { size?: number }) => (
  <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 12 12" {...stroke}>
    <path d="M8.5 1.5L10.5 3.5L4 10L1.5 10.5L2 8L8.5 1.5Z" />
  </svg>
);
export const IconArchive = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 14 14" {...stroke}>
    <rect x="1.5" y="2" width="11" height="2.5" rx="0.5" /><path d="M2.5 4.5V12H11.5V4.5" /><path d="M5.5 7H8.5" />
  </svg>
);
export const IconRecurrence = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 14 14" {...stroke}>
    <path d="M2 7C2 4.5 4 2.5 7 2.5C8.5 2.5 9.5 3 10.5 4M12 7C12 9.5 10 11.5 7 11.5C5.5 11.5 4.5 11 3.5 10" />
    <path d="M10.5 2V4H8.5" /><path d="M3.5 12V10H5.5" />
  </svg>
);
export const IconFlag = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 14 14" {...stroke}>
    <path d="M3 1.5V12.5" /><path d="M3 2H10L8.5 4.5L10 7H3" />
  </svg>
);
export const IconZzz = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 16 16" {...stroke}>
    <path d="M3 4H7L3 8H7" /><path d="M8 8H13L8 13H13" />
  </svg>
);
export const IconCheckBig = (p: { size?: number }) => (
  <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5L5 9L9.5 3.5" /></svg>
);
export const IconUndo = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 14 14" {...stroke}>
    <path d="M5 4L2 7L5 10" /><path d="M2 7H9C10.66 7 12 8.34 12 10V11" />
  </svg>
);
