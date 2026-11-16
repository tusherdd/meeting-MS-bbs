import { expect, test, type Page } from "@playwright/test";
import { apiAsPage, fillLogin, pageAs } from "./support/helpers";
import { OFFICERS, defaultOfficerPassword } from "./support/officers";

interface UserRow {
  id: string;
  loginEmail: string;
  role: string;
  isActive: boolean;
  designation: { id: string; nameEn: string } | null;
}
interface DesignationRow {
  id: string;
  nameEn: string;
  nameBn: string;
  priority: number;
}
interface RequestRow {
  id: string;
  status: string;
  type: string;
}

async function findUser(page: Page, email: string): Promise<UserRow> {
  const res = await apiAsPage<{ items: UserRow[] }>(
    page,
    "GET",
    `/users?q=${encodeURIComponent(email)}&limit=5`,
  );
  const user = res.items.find((u) => u.loginEmail === email);
  if (!user) throw new Error(`user ${email} not found`);
  return user;
}

async function cancelPendingRequests(page: Page) {
  const mine = await apiAsPage<RequestRow[]>(page, "GET", "/profile/change-requests");
  for (const r of mine.filter((x) => x.status === "PENDING")) {
    await apiAsPage(page, "DELETE", `/profile/change-requests/${r.id}`);
  }
}

test("officer cannot open the admin pages (404) and has no admin menu", async ({ browser }) => {
  const page = await pageAs(browser, "officer");
  try {
    for (const path of ["/admin", "/admin/users", "/admin/audit-logs"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "পাতাটি পাওয়া যায়নি" })).toBeVisible();
    }
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation", { name: "প্রধান মেনু" })).toBeVisible();
    await expect(page.getByRole("link", { name: "অ্যাডমিন" })).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});

test("admin creates an officer, who logs in with the default password", async ({ browser }) => {
  const admin = await pageAs(browser, "admin");
  const email = `e2e-new-${Date.now().toString(36)}@example.com`;
  try {
    await admin.goto("/admin/users");
    await admin.getByRole("link", { name: "নতুন কর্মকর্তা" }).click();
    await expect(admin.getByRole("heading", { name: "নতুন কর্মকর্তা", level: 1 })).toBeVisible();
    // The form has no password field at all.
    await expect(admin.locator("input[type=password]")).toHaveCount(0);

    await admin.getByLabel("Login Email").fill(email);
    await admin.getByLabel("নাম (বাংলা)").fill("ই২ই নতুন কর্মকর্তা");
    await admin.getByLabel("নাম (ইংরেজি)").fill("E2E New Officer");
    await admin
      .getByRole("combobox", { name: "পদবি", exact: true })
      .selectOption({ label: "পরিসংখ্যান কর্মকর্তা" });
    await admin.getByLabel("Mobile", { exact: true }).fill("০১৮১১০০০০০২");
    await admin.getByRole("button", { name: "কর্মকর্তা তৈরি করুন" }).click();

    await expect(
      admin
        .getByText("কর্মকর্তা তৈরি হয়েছে। তিনি অফিসের Default Password দিয়ে Login করতে পারবেন।")
        .first(),
    ).toBeVisible();
    await expect(admin).toHaveURL(/\/admin\/users\/[0-9a-f-]+/);
    // The password itself is never on the page.
    expect(await admin.locator("body").innerText()).not.toContain(defaultOfficerPassword());

    // The new officer logs in with the office default password.
    const context = await browser.newContext();
    const fresh = await context.newPage();
    await fresh.goto("/login");
    await fillLogin(fresh, email, defaultOfficerPassword());
    await expect(fresh).toHaveURL(/\/dashboard$/);
    await expect(fresh.getByRole("heading", { name: "ড্যাশবোর্ড", level: 1 })).toBeVisible();
    await context.close();

    // Clean up: deactivate (with a confirmation dialog).
    await admin.reload();
    await admin.getByTestId("user-actions").getByRole("button", { name: "Deactivate" }).click();
    const dialog = admin.getByRole("dialog", { name: "কর্মকর্তা Inactive করবেন?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Deactivate" }).click();
    await expect(
      admin.getByTestId("user-actions").getByRole("button", { name: "Activate" }),
    ).toBeVisible();
  } finally {
    await admin.context().close();
  }
});

test("admin cannot touch the SUPER_ADMIN, and cannot deactivate or demote themselves", async ({
  browser,
}) => {
  const admin = await pageAs(browser, "admin");
  try {
    await admin.goto("/admin/users?role=SUPER_ADMIN");
    const row = admin.getByTestId("users-table").getByRole("row").nth(1);
    await expect(row).toContainText("Super Admin");
    await expect(row).toContainText("সুরক্ষিত");
    await expect(row.getByRole("link")).toHaveCount(0);
    await expect(row.getByRole("button")).toHaveCount(0);

    // The backend refuses it too.
    const superAdmin = (
      await apiAsPage<{ items: UserRow[] }>(admin, "GET", "/users?role=SUPER_ADMIN&limit=1")
    ).items[0];
    const res = await admin.request.fetch(`/api/v1/users/${superAdmin.id}/status`, {
      method: "PATCH",
      data: { isActive: false },
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status()).toBe(403);

    // My own page: no deactivate / remove-admin buttons.
    const me = await findUser(admin, OFFICERS.admin.loginEmail);
    await admin.goto(`/admin/users/${me.id}`);
    await expect(
      admin.getByText("নিজের অ্যাকাউন্ট Inactive বা Admin পদ থেকে সরানো যায় না।"),
    ).toBeVisible();
    const actions = admin.getByTestId("user-actions");
    await expect(actions.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
    await expect(actions.getByRole("button", { name: "Remove Admin" })).toHaveCount(0);
    await expect(actions.getByRole("button", { name: "Reset to Default Password" })).toBeVisible();
  } finally {
    await admin.context().close();
  }
});

test("designation change request: officer asks, admin approves; own request cannot be approved", async ({
  browser,
}) => {
  const officer = await pageAs(browser, "so");
  const admin = await pageAs(browser, "admin");
  try {
    await cancelPendingRequests(officer);
    await cancelPendingRequests(admin);
    const designations = await apiAsPage<DesignationRow[]>(
      admin,
      "GET",
      "/designations?activeOnly=true",
    );
    const target = designations.find((d) => d.nameEn === "Assistant Programmer");
    const original = designations.find((d) => d.nameEn === OFFICERS.so.designationEn);
    if (!target || !original) throw new Error("seed designations missing");

    // The officer asks for a new designation on the profile page.
    await officer.goto("/profile");
    await officer.getByLabel("নতুন পদবি").selectOption(target.id);
    await officer
      .getByTestId("request-designation-form")
      .getByRole("button", { name: "Send Request" })
      .click();
    await expect(
      officer.getByTestId("request-history").getByRole("listitem").first(),
    ).toContainText("Pending");

    // The admin also asks for something (own request → cannot approve it).
    await apiAsPage(admin, "POST", "/profile/change-requests", {
      type: "DESIGNATION",
      designationId: target.id,
    });

    await admin.goto("/admin/change-requests");
    const table = admin.getByTestId("change-requests-table");
    const ownRow = table.getByRole("row").filter({ hasText: OFFICERS.admin.nameBn });
    await expect(ownRow).toContainText("নিজের অনুরোধ অনুমোদন করা যায় না");
    await expect(ownRow.getByRole("button")).toHaveCount(0);

    const row = table.getByRole("row").filter({ hasText: OFFICERS.so.nameBn });
    await expect(row).toContainText(original.nameBn); // current value
    await expect(row).toContainText(target.nameBn); // requested value
    await row.getByRole("button", { name: /^Approve/ }).click();
    const dialog = admin.getByRole("dialog", { name: "অনুরোধ অনুমোদন করবেন?" });
    await dialog.getByRole("button", { name: "Approve" }).click();
    await expect(admin.getByText("Change Request Approved হয়েছে।")).toBeVisible();

    await admin.getByRole("tab", { name: "Approved" }).click();
    await expect(
      table.getByRole("row").filter({ hasText: OFFICERS.so.nameBn }).first(),
    ).toBeVisible();

    // The officer now has the new designation.
    await officer.reload();
    await expect(officer.getByTestId("profile-designation")).toContainText(target.nameBn);
  } finally {
    // Restore: the officer's original designation (admin edit), and no pending requests left.
    const so = await findUser(admin, OFFICERS.so.loginEmail).catch(() => null);
    const designations = await apiAsPage<DesignationRow[]>(admin, "GET", "/designations").catch(
      () => [],
    );
    const original = designations.find((d) => d.nameEn === OFFICERS.so.designationEn);
    if (so && original && so.designation?.id !== original.id) {
      await apiAsPage(admin, "PATCH", `/users/${so.id}`, { designationId: original.id });
    }
    await cancelPendingRequests(admin).catch(() => undefined);
    await cancelPendingRequests(officer).catch(() => undefined);
    await officer.context().close();
    await admin.context().close();
  }
});
