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

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth={base} strokeLinecap="round" />
    </svg>
  );
}

export function PulseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M2.5 10.5h3.2l2-5.5 2.8 10 2-4.5h4.5"
        stroke="currentColor"
        strokeWidth={base}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

export function SunIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth={1.6} />
      <path
        d="M10 2v1.5M10 16.5V18M18 10h-1.5M3.5 10H2M15.7 4.3l-1 1M5.3 14.7l-1 1M15.7 15.7l-1-1M5.3 5.3l-1-1"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M16.5 11.8A7 7 0 018.2 3.5a7 7 0 108.3 8.3z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MonitorIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="2.5" y="4" width="15" height="10" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
      <path d="M7 17h6M10 14v3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

export function LogOutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M12.5 6.5V5a1 1 0 00-1-1h-6a1 1 0 00-1 1v10a1 1 0 001 1h6a1 1 0 001-1v-1.5M9 10h8m0 0l-2.5-2.5M17 10l-2.5 2.5"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
