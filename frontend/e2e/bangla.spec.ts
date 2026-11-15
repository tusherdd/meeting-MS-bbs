import { expect, test } from "@playwright/test";
import { BANGLA_NUKTA, normalizeBangla, normalizeBanglaDeep } from "../lib/bangla";
import { pageAs } from "./support/helpers";

/**
 * Bangla nukta letters (SPEC.md §13.13): RRA / RHA precomposed, YYA as YA + NUKTA. The fonts draw
 * the other forms (U+09DF, DDA + NUKTA, DDHA + NUKTA) with a detached dot.
 */
const { YYA, YA_NUKTA, RRA, DDA_NUKTA, RHA, DDHA_NUKTA } = BANGLA_NUKTA;

test("normalizeBangla: the stored forms, idempotent, secrets untouched", () => {
  expect(normalizeBangla(`সম${YYA} ব${DDA_NUKTA} আষা${DDHA_NUKTA}`)).toBe(
    `সম${YA_NUKTA} ব${RRA} আষা${RHA}`,
  );
  const ok = `সম${YA_NUKTA} ব${RRA} আষা${RHA} English 0-9`;
  expect(normalizeBangla(ok)).toBe(ok);
  expect(
    normalizeBanglaDeep({ title: `বিষ${YYA}`, list: [`ব${DDA_NUKTA}`], newPassword: `p${YYA}` }),
  ).toEqual({ title: `বিষ${YA_NUKTA}`, list: [`ব${RRA}`], newPassword: `p${YYA}` });
});

test("no page shows a broken nukta form", async ({ browser }) => {
  const officer = await pageAs(browser, "officer");
  const admin = await pageAs(browser, "admin");
  try {
    for (const [page, paths] of [
      [officer, ["/dashboard", "/meetings", "/meetings/new", "/conflicts", "/reports", "/profile"]],
      [
        admin,
        ["/admin", "/admin/users", "/admin/designations", "/admin/wings", "/admin/email-outbox"],
      ],
    ] as const) {
      for (const path of paths) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByText("লোড হচ্ছে…")).toHaveCount(0);
        const text = await page.locator("body").innerText();
        const bad = [YYA, DDA_NUKTA, DDHA_NUKTA].filter((form) => text.includes(form));
        expect(bad, `broken nukta form on ${path}`).toEqual([]);
      }
    }
  } finally {
    await officer.context().close();
    await admin.context().close();
  }
});
