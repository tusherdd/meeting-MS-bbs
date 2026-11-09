import type { NavIcon as IconName } from "./nav-items";

const paths: Record<IconName, string> = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  meetings:
    "M8 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm-4 13a7 7 0 0 1 14 0M17 4.5a3 3 0 0 1 0 5M20 20a6 6 0 0 0-3-5.2",
  calendar:
    "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  conflicts: "M12 4 2.5 20h19L12 4Zm0 6v4m0 3v.01",
  reports: "M6 3h9l4 4v14H6V3Zm9 0v4h4M9 17v-3m3 3v-6m3 6v-4",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  admin: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Zm-3 9 2 2 4-4",
};

export function NavIcon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none">
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
