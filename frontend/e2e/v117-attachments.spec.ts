import { expect, test } from "@playwright/test";
import { bn } from "../messages/bn";
import {
  addParticipant,
  cancelMeetingAs,
  dhakaDate,
  fillMeetingTime,
  nameOf,
  pageAs,
  uniqueTitle,
} from "./support/helpers";

/**
 * v1.17 part 2 (SPEC.md §6.11, §13.6, §13.22): "অন্যান্য সংযুক্তি" / other attachments.
 * The organizer (dd1) adds one attachment on create (uploaded after the save), more on edit
 * (immediate) up to the limit of 5, and removes one; the chair (so) does not see the section on
 * edit; the detail page lists the attachments under the notice with "দেখুন" (file viewer panel).
 */
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
  "latin1",
);
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: PDF });

test("organizer adds, lists and removes other attachments; the chair does not see the section", async ({
  browser,
}) => {
  const org = await pageAs(browser, "dd1");
  const chair = await pageAs(browser, "so");
  const date = dhakaDate(57);
  const title = uniqueTitle("সংযুক্তি");
  let id: string | null = null;

  try {
    await org.goto("/meetings/new");
    await org.getByLabel("সভার শিরোনাম").fill(title);
    await fillMeetingTime(org, date, "08:10", "08:40");
    await org.getByLabel("স্থান", { exact: true }).fill("সম্মেলন কক্ষ");
    await addParticipant(org, "so");
    await org.getByLabel(bn.meetingForm.chair).selectOption({ label: nameOf("so") });

    const field = org.getByTestId("attachments-field");
    await expect(field).toContainText(bn.attachments.label);
    await expect(field).not.toContainText("ঐচ্ছিক");
    const add = field.getByRole("button", { name: bn.attachments.add });

    // Add stays disabled until both the name and the file are valid.
    await expect(add).toBeDisabled();
    await field.getByLabel(bn.attachments.nameLabel).fill("বাজেট প্রস্তাব");
    await expect(add).toBeDisabled();
    await field
      .getByLabel(bn.attachments.fileLabel, { exact: true })
      .setInputFiles(pdf("budget.pdf"));
    await expect(add).toBeEnabled();
    await add.click();
    await expect(field).toContainText("বাজেট প্রস্তাব");
    await expect(field).toContainText("budget.pdf");

    await org.getByRole("button", { name: bn.meetingForm.create }).click();
    await expect(org).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
    id = org.url().split("/").pop()!;

    // Detail: listed under the notice with "দেখুন" → the file viewer panel.
    const list = org.getByTestId("meeting-attachments");
    await expect(list).toContainText("বাজেট প্রস্তাব");
    await list.getByRole("button", { name: bn.fileViewer.view }).click();
    const viewer = org.getByRole("dialog");
    await expect(viewer.locator("iframe")).toHaveAttribute("src", /^blob:/);
    await viewer.getByRole("button", { name: bn.fileViewer.close }).click();

    // Edit: add is immediate; at 5 files Add is disabled with the limit text.
    await org.goto(`/meetings/${id}/edit`);
    const edit = org.getByTestId("attachments-field");
    for (let n = 2; n <= 5; n++) {
      await edit.getByLabel(bn.attachments.nameLabel).fill(`ফাইল ${n}`);
      await edit
        .getByLabel(bn.attachments.fileLabel, { exact: true })
        .setInputFiles(pdf(`f${n}.pdf`));
      await edit.getByRole("button", { name: bn.attachments.add }).click();
      await expect(edit).toContainText(`f${n}.pdf`);
    }
    await expect(edit.getByRole("button", { name: bn.attachments.add })).toBeDisabled();
    await expect(edit).toContainText(bn.attachments.limit);

    // Remove is immediate too.
    await edit
      .getByRole("listitem")
      .filter({ hasText: "f5.pdf" })
      .getByRole("button", { name: bn.attachments.remove })
      .click();
    await expect(edit).not.toContainText("f5.pdf");
    await expect(edit).not.toContainText(bn.attachments.limit);

    // The chair may edit the meeting but never sees the section.
    await chair.goto(`/meetings/${id}/edit`);
    await expect(chair.getByLabel("সভার শিরোনাম")).toBeVisible();
    await expect(chair.getByTestId("attachments-field")).toHaveCount(0);
    // …but sees the attachments on the detail page.
    await chair.goto(`/meetings/${id}`);
    await expect(chair.getByTestId("meeting-attachments")).toContainText("ফাইল 4");
  } finally {
    if (id) await cancelMeetingAs(org, id);
    await Promise.all([org, chair].map((p) => p.context().close()));
  }
});
