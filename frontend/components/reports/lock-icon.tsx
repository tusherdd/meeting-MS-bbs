/**
 * v1.15: the small lock inside the locked wing select of the office report (owner decision
 * 2026-11-20, SPEC.md §13.21) — the only icon outside the header and the "⋮" row menu. Inline SVG,
 * 16 px, `currentColor`, always `aria-hidden` (the select itself says that it is locked).
 */
export function LockIcon() {
  return (
    <svg
      data-lock-icon=""
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
