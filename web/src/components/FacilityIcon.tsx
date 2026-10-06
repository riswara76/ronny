// Simple line icons drawn for DCU Active (no third-party artwork). Stroke style matches lucide.
const common = {
  width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export function FacilityIcon({ code, size = 28 }: { code: string; size?: number }) {
  const props = { ...common, width: size, height: size, 'aria-hidden': true, focusable: false } as const;
  switch (code) {
    case 'TENNIS':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6a9 9 0 0 1 0 12.8" />
          <path d="M18.4 5.6a9 9 0 0 0 0 12.8" />
        </svg>
      );
    case 'BASKETBALL_FUTSAL':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18" />
          <path d="M5.6 5.6c2.5 2.5 2.5 10.3 0 12.8M18.4 5.6c-2.5 2.5-2.5 10.3 0 12.8" />
        </svg>
      );
    case 'TABLE_TENNIS':
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="6" />
          <path d="M14.2 14.2 19 19" />
          <circle cx="19" cy="6" r="1.6" />
        </svg>
      );
    case 'FOOTBALL':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="m12 7.5 3.2 2.3-1.2 3.7h-4l-1.2-3.7Z" />
          <path d="M12 3v4.5M15.2 9.8l4.4-1.4M14 13.5l2.6 3.6M10 13.5l-2.6 3.6M8.8 9.8 4.4 8.4" />
        </svg>
      );
    case 'AIR_HOCKEY':
      return (
        <svg {...props}>
          <ellipse cx="9" cy="15" rx="6" ry="2.5" />
          <path d="M3 15v1.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V15" />
          <circle cx="18" cy="7" r="3" />
          <path d="M18 4V2" />
        </svg>
      );
    case 'FOOSBALL':
      return (
        <svg {...props}>
          <path d="M2 8h20M2 16h20" />
          <rect x="6" y="5" width="3" height="6" rx="1" />
          <rect x="15" y="5" width="3" height="6" rx="1" />
          <rect x="10.5" y="13" width="3" height="6" rx="1" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}
