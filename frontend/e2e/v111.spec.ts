import { expect, test, type Page } from "@playwright/test";
import { toBanglaDigits } from "../lib/format";
import { bn } from "../messages/bn";
import {
  apiAsPage,
  cancelMeetingAs,
  pageAs,
  uniqueTitle,
  userIdOf,
  type MeetingDetail,
} from "./support/helpers";

/**
 * v1.11 (SPEC.md §6.9, §13.19): meeting decisions "সভা সিদ্ধান্ত".
 * A member opens "Upload decision" from the row menu, uploads a PDF and the status turns
 * Complete; the organizer sees the counts in the sidebar, on the dashboard card and in the
 * /decisions tabs (the numbers come from the same API, so other test meetings do not matter).
 */
interface Summary {
  pending: number;
  complete: number;
  leads: boolean;
}

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
  "latin1",
);

async function summaryOf(page: Page): Promise<Summary> {
  return apiAsPage<Summary>(page, "GET", "/decisions/summary");
}

async function expectOrganizerCounts(page: Page, s: Summary) {
  // Sidebar: the Pending count (hidden when 0).
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: bn.nav.mainMenu });
  const navLink = nav.getByRole("link", { name: new RegExp(`^${bn.nav.decisions}`) });
  await expect(navLink).toBeVisible();
  if (s.pending > 0) {
    await expect(nav.getByTestId("nav-decision-count")).toContainText(toBanglaDigits(s.pending));
  } else {
    await expect(nav.getByTestId("nav-decision-count")).toHaveCount(0);
  }
  // Dashboard card.
  const card = page.getByTestId("decision-card");
  await expect(card.getByTestId("decision-card-pending")).toHaveText(toBanglaDigits(s.pending));
  await expect(card.getByTestId("decision-card-complete")).toHaveText(toBanglaDigits(s.complete));
  // /decisions tabs with counts.
  await card.getByRole("link", { name: bn.decisions.cardLink }).click();
  await expect(page).toHaveURL(/\/decisions$/);
  await expect(page.getByRole("heading", { name: bn.decisions.title, level: 1 })).toBeVisible();
  await expect(
    page.getByRole("tab", {
      name: bn.decisions.tabs("Pending", toBanglaDigits(s.pending)),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", {
      name: bn.decisions.tabs("Complete", toBanglaDigits(s.complete)),
    }),
  ).toBeVisible();
}

test("a member uploads a decision → Complete; the organizer sees the counts", async ({
  browser,
}) => {
  const org = await pageAs(browser, "dd1");
  const member = await pageAs(browser, "so");
  const title = uniqueTitle("সিদ্ধান্ত");
  const before = await summaryOf(org);
  // Started one minute ago (allowed: up to 5 min in the past) → the decision is Pending at once.
  const start = new Date(Date.now() - 60_000);
  const meeting = await apiAsPage<MeetingDetail>(org, "POST", "/meetings", {
    title,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 20 * 60_000).toISOString(),
    room: "কক্ষ ৫০১",
    participantIds: [await userIdOf(member)],
  });

  try {
    const pending = await summaryOf(org);
    expect(pending.pending).toBe(before.pending + 1);
    await expectOrganizerCounts(org, pending);
    // The new meeting is listed under Pending.
    await expect(org.getByRole("link", { name: title })).toBeVisible();

    // The member: "আমি সদস্য" lists it; the row menu offers "Upload decision".
    await member.goto("/decisions");
    const memberRow = member.getByRole("row").filter({ hasText: title });
    await expect(memberRow).toBeVisible();
    await memberRow.getByRole("button", { name: bn.rowMenu.button }).click();
    await member.getByRole("menuitem", { name: bn.rowMenu.upload }).click();
    await expect(member).toHaveURL(new RegExp(`/meetings/${meeting.id}/decision$`));
    await expect(member.getByTestId("decision-status")).toHaveText("Pending");

    await member.getByLabel(bn.decisions.pickLabel).setInputFiles({
      name: "সভার সিদ্ধান্ত.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await member.getByRole("button", { name: bn.decisions.uploadButton, exact: true }).click();
    await expect(member.getByTestId("decision-status")).toHaveText("Complete");
    await expect(member.getByTestId("decision-files")).toContainText("সভার সিদ্ধান্ত.pdf");

    // A wrong file type is refused with a clear message.
    await member.getByLabel(bn.decisions.pickLabel).setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("plain text"),
    });
    await expect(member.getByTestId("decision-upload").getByRole("alert")).toContainText(
      bn.decisions.badType("notes.txt"),
    );

    // Download works.
    const download = member.waitForEvent("download");
    await member.getByRole("button", { name: bn.decisions.download }).click();
    expect((await download).suggestedFilename()).toBe("সভার সিদ্ধান্ত.pdf");

    // The organizer: one Pending less, one Complete more; and a bell notice.
    const after = await summaryOf(org);
    expect(after.pending).toBe(pending.pending - 1);
    expect(after.complete).toBe(pending.complete + 1);
    await expectOrganizerCounts(org, after);
    await org.getByRole("tab", { name: new RegExp("^Complete") }).click();
    await expect(org.getByRole("link", { name: title })).toBeVisible();
    const notes = await apiAsPage<{ items: Array<{ body: string }> }>(
      org,
      "GET",
      "/notifications?limit=20",
    );
    expect(notes.items.map((n) => n.body)).toContain(
      `"${title}" সভার সিদ্ধান্ত আপলোড করা হয়েছে।`,
    );
  } finally {
    await cancelMeetingAs(org, meeting.id);
    await Promise.all([org, member].map((p) => p.context().close()));
  }
});
