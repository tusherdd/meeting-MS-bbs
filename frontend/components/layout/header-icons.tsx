/**
 * The only two icons of the UI (owner decision 2026-11-14, SPEC.md §13.5): the notification bell
 * and the profile icon in the top header. Small inline SVGs written here: no icon library, no
 * external request. They take the text colour (currentColor) and are decorative for screen
 * readers: the button around them carries the aria-label and the tooltip.
 * `data-header-icon` marks them for the "no icons" test, which allows exactly these two.
 */
interface IconProps {
  className?: string;
}

const common = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

export function BellIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} data-header-icon="bell">
      <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function PersonIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} data-header-icon="profile">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}
