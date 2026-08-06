// Minimal inline stroke-icon set — keeps the dashboard dependency-free.
// 20x20 viewbox, 1.6px stroke, rounded joins, currentColor.

type IconProps = { className?: string };
const base = "1.6";

export function GridIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth={base} />
      <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth={base} />
      <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth={base} />
      <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth={base} />
    </svg>
  );
}

export function DocumentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M6 2.5h5.5L15 6v11a1 1 0 01-1 1H6a1 1 0 01-1-1v-13a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth={base}
        strokeLinejoin="round"
      />
      <path d="M11.5 2.5V6H15" stroke="currentColor" strokeWidth={base} strokeLinejoin="round" />
      <path d="M7.2 10.5h5.6M7.2 13.2h5.6" stroke="currentColor" strokeWidth={base} strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth={base} />
      <path
        d="M10 3v1.6M10 15.4V17M17 10h-1.6M4.6 10H3M14.9 5.1l-1.1 1.1M6.2 13.7l-1.1 1.1M14.9 14.9l-1.1-1.1M6.2 6.2L5.1 5.1"
        stroke="currentColor"
        strokeWidth={base}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M5 8a5 5 0 0110 0c0 3.2 1 4.3 1.5 5H3.5C4 12.3 5 11.2 5 8z"
        stroke="currentColor"
        strokeWidth={base}
        strokeLinejoin="round"
      />
      <path d="M8 15.5a2 2 0 004 0" stroke="currentColor" strokeWidth={base} strokeLinecap="round" />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M3 17V3M3 17h14" stroke="currentColor" strokeWidth={base} strokeLinecap="round" />
      <rect x="6" y="10" width="2.2" height="5" rx="0.6" fill="currentColor" />
      <rect x="10" y="7" width="2.2" height="8" rx="0.6" fill="currentColor" />
      <rect x="14" y="4" width="2.2" height="11" rx="0.6" fill="currentColor" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth={base} />
      <path d="M6.8 10.2l2.1 2.1 4.3-4.6" stroke="currentColor" strokeWidth={base} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth={base} />
      <path d="M10 5.8V10l3 1.8" stroke="currentColor" strokeWidth={base} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
