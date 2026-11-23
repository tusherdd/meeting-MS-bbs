import { describe, expect, it } from "vitest";
import {
  bareMime,
  canShowPdfInline,
  isAppleMobile,
  opensInPanel,
  viewKind,
} from "@/lib/file-viewer";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** v1.17 (SPEC.md §13.22): the shared file viewer side panel rules. */
describe("file viewer: what is shown", () => {
  it("PDF → iframe, JPG / PNG → img, DOCX and anything else → download only", () => {
    expect(viewKind("application/pdf")).toBe("pdf");
    expect(viewKind("Application/PDF; charset=binary")).toBe("pdf");
    expect(viewKind("image/jpeg")).toBe("image");
    expect(viewKind("image/png")).toBe("image");
    expect(viewKind(DOCX)).toBe("download");
    expect(viewKind("text/html")).toBe("download");
    expect(viewKind("image/svg+xml")).toBe("download");
    expect(viewKind(null)).toBe("download");
    expect(opensInPanel("application/pdf")).toBe(true);
    expect(opensInPanel(DOCX)).toBe(false);
    expect(bareMime(" IMAGE/PNG ; x=y")).toBe("image/png");
  });
});

describe("file viewer: can this device show a PDF inline?", () => {
  const desktopChrome = {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    platform: "MacIntel",
    maxTouchPoints: 0,
    pdfViewerEnabled: true,
  };

  it("desktop browsers with a PDF viewer: yes", () => {
    expect(isAppleMobile(desktopChrome)).toBe(false);
    expect(canShowPdfInline(desktopChrome)).toBe(true);
    // Older browsers without the flag are assumed to have one.
    expect(canShowPdfInline({ userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/128.0" })).toBe(
      true,
    );
  });

  it("iPhone and iPad (also iPadOS reporting a Mac): no", () => {
    const iphone = {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      pdfViewerEnabled: true,
    };
    const ipadOs = { ...desktopChrome, maxTouchPoints: 5 };
    expect(canShowPdfInline(iphone)).toBe(false);
    expect(canShowPdfInline(ipadOs)).toBe(false);
  });

  it("browsers that cannot show PDFs inline (e.g. Android Chrome): no", () => {
    expect(
      canShowPdfInline({
        userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile Safari/537.36",
        pdfViewerEnabled: false,
      }),
    ).toBe(false);
  });
});
