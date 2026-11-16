"use client";

import { getImageProps } from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/providers/locale-provider";

/**
 * The BBS logo (v1.8, SPEC.md §13.16) is allowed in exactly two places: the app header (small,
 * next to the app name, linking to the dashboard) and the login / forgot-password /
 * reset-password pages (large, above the form). Never in PDFs, mails or other pages.
 * `data-brand-logo` lets e2e/no-icons.spec.ts check exactly these places.
 */
export const LOGO_SRC = "/brand/bbs-logo.png";

/**
 * next/image without its inline `style="color:transparent"`: the production CSP (style-src with a
 * nonce, proxy.ts) blocks inline style attributes in server HTML. Same optimised srcset otherwise.
 */
function Logo({
  size,
  alt,
  priority = false,
  place,
}: {
  size: number;
  alt: string;
  priority?: boolean;
  place: "header" | "public";
}) {
  const { props } = getImageProps({
    src: LOGO_SRC,
    alt,
    width: size,
    height: size,
    // Above the fold everywhere: load at once; on the login page with high priority (LCP).
    loading: "eager",
    fetchPriority: priority ? "high" : "auto",
  });
  const { style: _inlineStyle, ...img } = props;
  void _inlineStyle;
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- next/image props (alt included)
    <img
      {...img}
      className={place === "header" ? "size-9 shrink-0" : "size-24"}
      data-brand-logo={place}
    />
  );
}

/** Public pages that show the large logo. */
export const LOGO_PAGES = ["/login", "/forgot-password", "/reset-password"] as const;

/** App header: small logo + app name, linking to the dashboard. */
export function Brand({
  href = "/dashboard",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5 rounded-md leading-tight">
      {compact && <Logo size={36} alt={t.app.logoAlt} place="header" />}
      <span className="min-w-0">
        <span
          className={
            compact
              ? // Narrow phones: the logo alone (the name stays for screen readers), no overflow.
                "block truncate text-lg font-bold text-brand-800 max-[419px]:sr-only"
              : "block truncate text-lg font-bold text-brand-800"
          }
        >
          {t.app.name}
        </span>
        {!compact && <span className="block text-xs text-slate-600">{t.app.org}</span>}
      </span>
    </Link>
  );
}

/** Public layout header: the large logo on the three login pages, the plain app name elsewhere. */
export function PublicBrand() {
  const t = useT();
  const pathname = usePathname();
  const withLogo = (LOGO_PAGES as readonly string[]).includes(pathname);
  if (!withLogo) return <Brand href="/login" />;
  return (
    <Link href="/login" className="flex flex-col items-center gap-2 rounded-md text-center">
      <Logo size={96} alt={t.app.logoAlt} priority={pathname === "/login"} place="public" />
      <span className="text-base font-semibold text-slate-800">{t.app.org}</span>
      <span className="text-xl font-bold text-brand-800">{t.app.name}</span>
    </Link>
  );
}
