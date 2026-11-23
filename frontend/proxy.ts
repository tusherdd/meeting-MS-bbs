import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy with a fresh nonce per request (SPEC.md §13.4, production readiness):
 * scripts only from this origin plus Next.js' own inline scripts carrying the nonce; frames only
 * for blob: URLs (v1.17 file viewer), no plugins, no foreign forms. Next.js reads the nonce from this header and puts it on its
 * scripts automatically (the root layout renders per request for that).
 *
 * Development: React needs eval for its debug stacks and the Next.js dev overlay uses inline
 * styles, so those two are allowed there only.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const https =
    request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    dev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    // v1.17: the file viewer panel shows session-fetched PDFs through a Blob URL in an iframe.
    "frame-src blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the backend proxy paths, static files or the app icons (app/favicon.ico,
      // app/icon.png, app/apple-icon.png — served by Next.js from the file convention).
      source: "/((?!api/|uploads/|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
