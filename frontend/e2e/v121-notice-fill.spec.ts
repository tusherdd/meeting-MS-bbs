import { expect, test, type Page, type Route } from "@playwright/test";
import { bn } from "../messages/bn";
import { dhakaDate, nameOf, pageAs, userIdOf } from "./support/helpers";

/**
 * v1.21 part 3 (SPEC.md §6.12, §13.6): "নোটিশ থেকে পূরণ করুন" in the meeting form. The endpoint
 * POST /meetings/notice-extract is mocked (no OCR / AI runs); the officers in the reply are real
 * test officers so the chips and the concurrent-meeting check work. Nothing is saved.
 */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
  "latin1",
);
const notice = { name: "notice.pdf", mimeType: "application/pdf", buffer: PDF };
const EXTRACT = "**/api/v1/meetings/notice-extract";

const officerRef = (id: string, nameBn: string) => ({
  id,
  nameBn,
  nameEn: nameBn,
  designation: null,
  wing: null,
});
const cand = (o: ReturnType<typeof officerRef>) => ({
  officer: o,
  score: 0.7,
  designationMatch: false,
  wingMatch: false,
});
const line = (n: number, text: string, name: string | null = null) => ({
  line: n,
  text,
  name,
  designation: name ? "উপসচিব" : null,
  wing: null,
});

async function ids(page: Page) {
  const [dd2, director, so, dg] = await Promise.all(
    (["dd2", "director", "so", "dg"] as const).map(async (k) => {
      const p = await pageAs(page.context().browser()!, k);
      const id = await userIdOf(p);
      await p.context().close();
      return officerRef(id, nameOf(k));
    }),
  );
  return { dd2, director, so, dg };
}

test("notice field on top; fill, markers and the sure / maybe / unmatched lists", async ({
  browser,
}) => {
  const org = await pageAs(browser, "dd1");
  const o = await ids(org);
  const date = dhakaDate(61);
  await org.route(EXTRACT, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        method: "AI",
        fields: {
          title: "নোটিশের সভা",
          date,
          startTime: "15:00",
          endTime: "15:45",
          venue: "সম্মেলন কক্ষ",
          agenda: null,
        },
        chair: {
          status: "sure",
          text: nameOf("director"),
          name: null,
          designation: null,
          match: cand(o.director),
          candidates: [],
          reason: null,
        },
        participants: {
          sure: [{ ...line(1, nameOf("dd2")), match: cand(o.dd2) }],
          maybe: [{ ...line(2, "সম্ভাব্য লাইন"), candidates: [cand(o.so), cand(o.dg)] }],
          unmatched: [
            { ...line(3, "জনাব অচেনা, উপসচিব", "অচেনা"), reason: "not-found" },
            { ...line(4, "কর্মকর্তা (সকল)"), reason: "group" },
          ],
        },
        warnings: [
          { code: "AI_FALLBACK", message: "x" },
          { code: "TIME_ASSUMED_AFTERNOON", message: "x" },
        ],
      }),
    }),
  );

  try {
    await org.goto("/meetings/new");
    const field = org.getByTestId("notice-field");
    // The notice section is the first thing in the form, above the title.
    const noticeBox = await field.boundingBox();
    const titleBox = await org.getByLabel(bn.meetingForm.title).boundingBox();
    expect(noticeBox!.y).toBeLessThan(titleBox!.y);
    // The other attachments stay below the title.
    const attachBox = await org.getByTestId("attachments-field").boundingBox();
    expect(attachBox!.y).toBeGreaterThan(titleBox!.y);

    // No button before a file is chosen.
    const fill = org.getByRole("button", { name: bn.noticeFill.button });
    await expect(fill).toHaveCount(0);
    await field.getByLabel(bn.notice.label).setInputFiles(notice);
    await expect(fill).toBeVisible();
    await fill.click(); // empty form: no confirmation

    const summary = org.getByTestId("notice-fill-summary");
    await expect(summary).toContainText(bn.noticeFill.fields("৫"));
    await expect(summary).toContainText(bn.noticeFill.people("৪", "১", "১", "২"));
    await expect(summary).toContainText(bn.noticeFill.method(bn.noticeFill.methodAi));
    await expect(summary).toContainText(bn.noticeFill.warnings.AI_FALLBACK);
    await expect(summary).toContainText(bn.noticeFill.warnings.TIME_ASSUMED_AFTERNOON);
    await expect(org.getByTestId("notice-fill-live")).toContainText(bn.noticeFill.fields("৫"));

    // Fields filled, each with the marker; agenda (null) untouched.
    const title = org.getByLabel(bn.meetingForm.title);
    await expect(title).toHaveValue("নোটিশের সভা");
    await expect(org.locator("#date")).toHaveValue(date);
    await expect(org.locator("#startTime")).toHaveValue("15:00");
    await expect(org.locator("#endTime")).toHaveValue("15:45");
    await expect(org.locator("#room")).toHaveValue("সম্মেলন কক্ষ");
    for (const f of ["title", "date", "startTime", "endTime", "room"]) {
      await expect(org.getByTestId(`autofill-tag-${f}`)).toHaveText(bn.noticeFill.tag);
    }
    await expect(org.getByTestId("autofill-tag-agenda")).toHaveCount(0);
    // Editing a field removes its marker only.
    await title.fill("নোটিশের সভা (সংশোধিত)");
    await expect(org.getByTestId("autofill-tag-title")).toHaveCount(0);
    await expect(org.getByTestId("autofill-tag-room")).toBeVisible();

    // Sure: participant added, sure chair added and selected.
    const chips = org.getByTestId("selected-people");
    await expect(chips).toContainText(nameOf("dd2"));
    await expect(chips).toContainText(nameOf("director"));
    await expect(org.getByLabel(bn.meetingForm.chair)).toHaveValue(o.director.id);
    await expect(org.getByTestId("notice-fill-chair")).toContainText(
      bn.noticeFill.chairSet(nameOf("director")),
    );

    // Maybe: pick a candidate → added, the line disappears.
    const maybe = org.getByTestId("notice-fill-maybe");
    await expect(maybe).toContainText(bn.noticeFill.maybeTitle);
    await expect(maybe).toContainText("সম্ভাব্য লাইন");
    await maybe.getByRole("button", { name: new RegExp(nameOf("so")) }).click();
    await expect(chips).toContainText(nameOf("so"));
    await expect(maybe).toHaveCount(0);

    // Unmatched: the group line shows its reason; "add as guest" prefills the guest fields.
    const unmatched = org.getByTestId("notice-fill-unmatched");
    await expect(unmatched).toContainText(bn.noticeFill.unmatchedTitle);
    await expect(unmatched).toContainText(bn.noticeFill.reason.group);
    await unmatched
      .getByRole("listitem")
      .filter({ hasText: "অচেনা" })
      .getByRole("button", { name: bn.noticeFill.addAsGuest })
      .click();
    await expect(org.locator("#guest-name")).toHaveValue("অচেনা");
    await expect(org.locator("#guest-designation")).toHaveValue("উপসচিব");
    await expect(org.locator("#guest-email")).toHaveValue("");
    await expect(org.locator("#guest-email")).toBeFocused();
    await unmatched
      .getByRole("listitem")
      .filter({ hasText: "কর্মকর্তা (সকল)" })
      .getByRole("button", { name: bn.noticeFill.dismiss })
      .click();
    await expect(unmatched).toHaveCount(0);

    // Nothing was saved: still on the create page.
    await expect(org).toHaveURL(/\/meetings\/new/);
  } finally {
    await org.context().close();
  }
});

test("asks before replacing, cancels, and shows the limit and failure messages", async ({
  browser,
}) => {
  const org = await pageAs(browser, "dd1");
  let reply: "slow" | "429" | "422" = "slow";
  await org.route(EXTRACT, async (route: Route) => {
    if (reply === "slow") {
      await new Promise((r) => setTimeout(r, 4000));
      return route.fulfill({ status: 422, body: "{}" }).catch(() => undefined);
    }
    return route.fulfill({
      status: reply === "429" ? 429 : 422,
      contentType: "application/json",
      body: JSON.stringify({ message: "x" }),
    });
  });

  try {
    await org.goto("/meetings/new");
    await org.getByLabel(bn.meetingForm.title).fill("আগের লেখা");
    await org.getByTestId("notice-field").getByLabel(bn.notice.label).setInputFiles(notice);
    const fill = org.getByRole("button", { name: bn.noticeFill.button });

    // The form has text: the in-page confirmation comes first; "বাতিল" keeps everything.
    await fill.click();
    const dialog = org.getByRole("dialog");
    await expect(dialog).toContainText(bn.noticeFill.confirmTitle);
    await dialog.getByRole("button", { name: bn.noticeFill.cancel }).click();
    await expect(dialog).toHaveCount(0);
    await expect(org.getByLabel(bn.meetingForm.title)).toHaveValue("আগের লেখা");

    // "বসান" starts reading; the button is disabled and the request can be cancelled.
    await fill.click();
    await org.getByRole("dialog").getByRole("button", { name: bn.noticeFill.confirmOk }).click();
    const form = org.getByTestId("notice-fill");
    await expect(form).toContainText(bn.noticeFill.reading);
    await expect(fill).toBeDisabled();
    await form.getByRole("button", { name: bn.noticeFill.cancel }).click();
    await expect(form).not.toContainText(bn.noticeFill.reading);
    await expect(fill).toBeEnabled();

    reply = "429";
    await fill.click();
    await org.getByRole("dialog").getByRole("button", { name: bn.noticeFill.confirmOk }).click();
    await expect(form.getByRole("alert")).toHaveText(bn.noticeFill.rateLimited);

    reply = "422";
    await fill.click();
    await org.getByRole("dialog").getByRole("button", { name: bn.noticeFill.confirmOk }).click();
    await expect(form.getByRole("alert")).toHaveText(bn.noticeFill.failed);
    await expect(org.getByLabel(bn.meetingForm.title)).toHaveValue("আগের লেখা");
  } finally {
    await org.context().close();
  }
});
