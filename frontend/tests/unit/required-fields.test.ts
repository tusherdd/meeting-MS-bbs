import { describe, expect, it } from "vitest";
import { attachmentEntrySchema } from "@/lib/attachments";
import { guestEntrySchema } from "@/lib/guest-entry";
import { requiredFields } from "@/lib/required-fields";
import { createSchemas } from "@/lib/schemas";
import { bn, en } from "@/messages";

/**
 * v1.17 part 3 (SPEC.md §13.6a): the red "*" + "আবশ্যক" / "Required" mark comes from the form's
 * zod schema (a field is required when it rejects ""), so it always matches the validation.
 */
describe("required fields derived from the zod schemas", () => {
  for (const [lang, t] of [
    ["bn", bn],
    ["en", en],
  ] as const) {
    const s = createSchemas(t);

    it(`meeting form (${lang}): title, date, times and venue only`, () => {
      expect(requiredFields(s.meetingFormSchema)).toEqual({
        title: true,
        agenda: false,
        date: true,
        startTime: true,
        endTime: true,
        room: true,
        onlineLink: false,
        chairId: false,
      });
    });

    it(`auth forms (${lang}): every field, also "confirm password"`, () => {
      expect(requiredFields(s.loginSchema)).toEqual({ loginEmail: true, password: true });
      expect(requiredFields(s.forgotPasswordSchema)).toEqual({ loginEmail: true });
      expect(requiredFields(s.newPasswordSchema)).toEqual({
        newPassword: true,
        confirmPassword: true,
      });
      expect(requiredFields(s.changePasswordSchema("a@b.gov.bd"))).toEqual({
        currentPassword: true,
        newPassword: true,
        confirmPassword: true,
      });
    });

    it(`profile and officer forms (${lang}): names, login email, designation`, () => {
      expect(requiredFields(s.profileFormSchema)).toEqual({
        nameBn: true,
        nameEn: true,
        designationRemark: false,
        wingId: false,
        mobile: false,
        mobileAlt: false,
        officePhone: false,
        fax: false,
      });
      const user = requiredFields(s.userFormSchema);
      expect(user.loginEmail).toBe(true);
      expect(user.designationId).toBe(true);
      expect(user.organizationBn).toBe(false);
      expect(user.organizationEn).toBe(false);
      expect(user.wingId).toBe(false);
    });

    it(`small forms (${lang})`, () => {
      expect(requiredFields(s.cancelReasonSchema)).toEqual({ reason: true });
      expect(requiredFields(s.rejectNoteSchema)).toEqual({ note: true });
      expect(requiredFields(s.emailFormSchema)).toEqual({ email: true });
      expect(requiredFields(s.loginEmailRequestSchema)).toEqual({ loginEmail: true });
      expect(requiredFields(s.designationRequestSchema)).toEqual({ designationId: true });
      expect(requiredFields(s.designationFormSchema)).toEqual({
        nameBn: true,
        nameEn: true,
        priority: true,
        officeReportScope: true,
      });
      // Wings have no priority field.
      expect(requiredFields(s.wingFormSchema).priority).toBe(false);
    });
  }

  it("conditionally required: guest name, designation and email; attachment name and file", () => {
    expect(requiredFields(guestEntrySchema)).toEqual({
      name: true,
      designation: true,
      email: true,
    });
    expect(requiredFields(attachmentEntrySchema)).toEqual({ name: true, file: true });
  });

  it("the guest schema matches the Add rules", () => {
    const ok = { name: "জনাব ক", designation: "পরিচালক", email: "a@b.gov.bd" };
    expect(guestEntrySchema.safeParse(ok).success).toBe(true);
    expect(guestEntrySchema.safeParse({ ...ok, name: "   " }).success).toBe(false);
    expect(guestEntrySchema.safeParse({ ...ok, designation: "" }).success).toBe(false);
    expect(guestEntrySchema.safeParse({ ...ok, email: "not-an-email" }).success).toBe(false);
    expect(guestEntrySchema.safeParse({ ...ok, name: "ক".repeat(201) }).success).toBe(false);
  });
});
