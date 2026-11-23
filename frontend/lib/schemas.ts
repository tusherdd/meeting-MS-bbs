/**
 * Form validation. The rules mirror the backend DTOs (login.dto.ts, change-password.dto.ts,
 * reset-password.dto.ts, common/utils/password.ts) so most mistakes are caught before sending.
 * The backend still checks everything again.
 */
import { z } from "zod";
import type { Messages } from "@/messages";
import { BD_MOBILE_PATTERN, PHONE_PATTERN, normalizeMobile, normalizePhone } from "./phone";
import { ENGLISH_NAME_PATTERN } from "@/lib/display-name";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;

export interface PasswordRuleResult {
  key: "minLength" | "letter" | "digit" | "notEmail";
  ok: boolean;
}

/** Same checks as backend checkPasswordStrength(); used for the live checklist. */
export function checkPasswordRules(password: string, email?: string | null): PasswordRuleResult[] {
  const rules: PasswordRuleResult[] = [
    { key: "minLength", ok: password.length >= PASSWORD_MIN_LENGTH },
    { key: "letter", ok: /[A-Za-z]/.test(password) },
    { key: "digit", ok: /[0-9]/.test(password) },
  ];
  if (email) {
    rules.push({
      key: "notEmail",
      ok: password.length > 0 && password.trim().toLowerCase() !== email.trim().toLowerCase(),
    });
  }
  return rules;
}

export const MAX_ADDITIONAL_CHARGES = 20;
const MAX_MEETING_MS = 12 * 3_600_000;

/**
 * All form schemas with their messages in one UI language (v1.6). Components use useSchemas()
 * (lib/hooks/use-schemas.ts), so the error texts follow the language switch.
 */
export function createSchemas(t: Messages) {
  const email = z
    .string()
    .trim()
    .min(1, t.validation.emailRequired)
    .max(EMAIL_MAX_LENGTH, t.validation.emailTooLong)
    .pipe(z.email(t.validation.emailInvalid));

  const newPassword = z
    .string()
    .max(PASSWORD_MAX_LENGTH, t.validation.passwordTooLong)
    .refine((v) => checkPasswordRules(v).every((r) => r.ok), t.validation.passwordWeak);

  /** v1.17 part 3: its own `.min(1)` so the field carries the required mark (lib/required-fields). */
  const confirmPassword = z.string().min(1, t.validation.confirmPasswordRequired);

  const loginSchema = z.object({
    loginEmail: email,
    password: z
      .string()
      .min(1, t.validation.passwordRequired)
      .max(PASSWORD_MAX_LENGTH, t.validation.passwordTooLong),
  });

  const forgotPasswordSchema = z.object({ loginEmail: email });

  const newPasswordSchema = z
    .object({ newPassword, confirmPassword })
    .refine((v) => v.newPassword === v.confirmPassword, {
      path: ["confirmPassword"],
      message: t.validation.passwordMismatch,
    });

  /** Change password: also "not equal to my login email" and "different from the current one". */
  function changePasswordSchema(loginEmail: string) {
    return z
      .object({
        currentPassword: z
          .string()
          .min(1, t.validation.currentPasswordRequired)
          .max(PASSWORD_MAX_LENGTH, t.validation.passwordTooLong),
        newPassword,
        confirmPassword,
      })
      .refine((v) => v.newPassword.trim().toLowerCase() !== loginEmail.trim().toLowerCase(), {
        path: ["newPassword"],
        message: t.validation.passwordSameAsEmail,
      })
      .refine((v) => v.newPassword !== v.currentPassword, {
        path: ["newPassword"],
        message: t.validation.passwordSameAsCurrent,
      })
      .refine((v) => v.newPassword === v.confirmPassword, {
        path: ["confirmPassword"],
        message: t.validation.passwordMismatch,
      });
  }

  // Meetings ---------------------------------------------------------------------------------------
  /** Same limits as backend CreateMeetingDto + meeting-rules (end after start, at most 12 h). */
  const meetingFormSchema = z
    .object({
      title: z
        .string()
        .trim()
        .min(3, t.meetingForm.titleLength)
        .max(200, t.meetingForm.titleLength),
      agenda: z.string().max(5000, t.meetingForm.agendaTooLong),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t.meetingForm.dateRequired),
      startTime: z.string().regex(/^\d{2}:\d{2}$/, t.meetingForm.timeRequired),
      endTime: z.string().regex(/^\d{2}:\d{2}$/, t.meetingForm.timeRequired),
      // v1.9: the venue is required (same rule as the backend DTO).
      room: z
        .string()
        .trim()
        .min(1, t.meetingForm.roomRequired)
        .max(100, t.meetingForm.roomTooLong),
      onlineLink: z
        .string()
        .trim()
        .max(1000, t.meetingForm.linkInvalid)
        .refine(
          (v) => v === "" || /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(v),
          t.meetingForm.linkInvalid,
        ),
      chairId: z.string(),
    })
    .superRefine((v, ctx) => {
      if (!/^\d{2}:\d{2}$/.test(v.startTime) || !/^\d{2}:\d{2}$/.test(v.endTime)) return;
      const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
      const duration = (minutes(v.endTime) - minutes(v.startTime)) * 60_000;
      if (duration <= 0) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: t.meetingForm.endBeforeStart });
      } else if (duration > MAX_MEETING_MS) {
        ctx.addIssue({ code: "custom", path: ["endTime"], message: t.meetingForm.tooLong });
      }
    });

  const cancelReasonSchema = z.object({
    reason: z
      .string()
      .trim()
      .min(3, t.meetingDetail.cancelReasonLength)
      .max(1000, t.meetingDetail.cancelReasonLength),
  });

  // Profile and users (backend CreateUserDto / UpdateProfileDto) --------------------------------------
  const optionalText = (max: number, message: string) => z.string().trim().max(max, message);

  const optionalMobile = z
    .string()
    .trim()
    .refine(
      (v) => v === "" || BD_MOBILE_PATTERN.test(normalizeMobile(v)),
      t.validation.mobileInvalid,
    );

  const optionalPhone = (tooLong: string) =>
    z
      .string()
      .trim()
      .max(50, tooLong)
      .refine((v) => v === "" || PHONE_PATTERN.test(normalizePhone(v)), t.validation.phoneInvalid);

  /**
   * v1.16 (SPEC.md §6.2): structured additional charges, admin only. A row that still needs review
   * may stay without a designation while the list is not changed; once the list is saved every row
   * needs a designation (checked on submit, see chargesProblems). No charge twice.
   */
  const additionalCharges = z
    .array(
      z.object({
        designationId: z.string(),
        wingId: z.string(),
        note: z.string().trim().max(300, t.validation.chargeTooLong),
        needsReview: z.boolean(),
      }),
    )
    .max(MAX_ADDITIONAL_CHARGES, t.validation.tooManyCharges)
    .superRefine((list, ctx) => {
      const seen = new Set<string>();
      list.forEach((c, i) => {
        if (!c.designationId) {
          if (!c.needsReview)
            ctx.addIssue({
              code: "custom",
              path: [i, "designationId"],
              message: t.validation.chargeDesignationRequired,
            });
          return;
        }
        const key = `${c.designationId}|${c.wingId}`;
        if (seen.has(key))
          ctx.addIssue({
            code: "custom",
            path: [i, "designationId"],
            message: t.validation.chargeDuplicate,
          });
        seen.add(key);
      });
    });

  /** Fields an officer may edit on their own profile (PATCH /profile). */
  const profileFormSchema = z.object({
    nameBn: z
      .string()
      .trim()
      .min(1, t.validation.nameBnRequired)
      .max(200, t.validation.nameTooLong),
    nameEn: z
      .string()
      .trim()
      .min(1, t.validation.nameEnRequired)
      .max(200, t.validation.nameTooLong)
      .regex(ENGLISH_NAME_PATTERN, t.validation.nameEnLatin),
    designationRemark: optionalText(100, t.validation.remarkTooLong),
    wingId: z.string(),
    mobile: optionalMobile,
    mobileAlt: optionalMobile,
    officePhone: optionalPhone(t.validation.phoneTooLong),
    fax: optionalPhone(t.validation.faxTooLong),
  });

  /** Admin: create / edit an officer (POST /users, PATCH /users/:id). */
  const userFormSchema = profileFormSchema.extend({
    loginEmail: email,
    designationId: z.string().min(1, t.validation.designationRequired),
    organizationBn: optionalText(300, t.validation.organizationTooLong),
    organizationEn: optionalText(300, t.validation.organizationTooLong),
    additionalCharges,
  });

  const emailFormSchema = z.object({ email });

  const loginEmailRequestSchema = z.object({ loginEmail: email });

  /** The designation Change Request (profile): one select, a designation must be chosen. */
  const designationRequestSchema = z.object({
    designationId: z.string().min(1, t.validation.designationRequired),
  });

  // Designations and wings (CreateDesignationDto / CreateWingDto) -----------------------------------
  const nameBn = z
    .string()
    .trim()
    .min(1, t.validation.nameBnRequired)
    .max(150, t.validation.shortNameTooLong);
  const nameEn = z
    .string()
    .trim()
    .min(1, t.validation.nameEnRequired)
    .max(150, t.validation.shortNameTooLong)
    .regex(ENGLISH_NAME_PATTERN, t.validation.nameEnLatin);

  const designationFormSchema = z.object({
    nameBn,
    nameEn,
    priority: z
      .string()
      .trim()
      .regex(/^\d+$/, t.validation.priorityInvalid)
      .refine((v) => Number(v) >= 1 && Number(v) <= 999, t.validation.priorityInvalid),
    /** v1.15: "অফিস রিপোর্ট: নেই / নিজ উইং / পুরো অফিস" (SPEC.md §6.10). */
    officeReportScope: z.enum(["NONE", "WING", "OFFICE"]),
  });

  /** Wings have no priority: same form shape, the (hidden) priority field is not checked. */
  const wingFormSchema = designationFormSchema.extend({ priority: z.string() });

  const rejectNoteSchema = z.object({
    note: z.string().trim().min(3, t.validation.noteRequired).max(1000, t.validation.noteTooLong),
  });

  return {
    loginSchema,
    forgotPasswordSchema,
    newPasswordSchema,
    changePasswordSchema,
    meetingFormSchema,
    cancelReasonSchema,
    profileFormSchema,
    userFormSchema,
    emailFormSchema,
    loginEmailRequestSchema,
    designationRequestSchema,
    designationFormSchema,
    wingFormSchema,
    rejectNoteSchema,
  };
}

type Schemas = ReturnType<typeof createSchemas>;
export type LoginForm = z.infer<Schemas["loginSchema"]>;
export type ForgotPasswordForm = z.infer<Schemas["forgotPasswordSchema"]>;
export type NewPasswordForm = z.infer<Schemas["newPasswordSchema"]>;
export type ChangePasswordForm = z.infer<ReturnType<Schemas["changePasswordSchema"]>>;
export type MeetingFormValues = z.infer<Schemas["meetingFormSchema"]>;
export type CancelReasonForm = z.infer<Schemas["cancelReasonSchema"]>;
export type ProfileFormValues = z.infer<Schemas["profileFormSchema"]>;
export type UserFormValues = z.infer<Schemas["userFormSchema"]>;
export type EmailFormValues = z.infer<Schemas["emailFormSchema"]>;
export type LoginEmailRequestValues = z.infer<Schemas["loginEmailRequestSchema"]>;
export type DesignationFormValues = z.infer<Schemas["designationFormSchema"]>;

/** "" → null, Bangla digits → English, mobiles → 01XXXXXXXXX (what the backend stores). */
export function toProfilePayload(v: ProfileFormValues) {
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    nameBn: v.nameBn.trim(),
    nameEn: v.nameEn.trim(),
    designationRemark: orNull(v.designationRemark),
    wingId: v.wingId || null,
    mobile: v.mobile.trim() ? normalizeMobile(v.mobile) : null,
    mobileAlt: v.mobileAlt.trim() ? normalizeMobile(v.mobileAlt) : null,
    officePhone: v.officePhone.trim() ? normalizePhone(v.officePhone) : null,
    fax: v.fax.trim() ? normalizePhone(v.fax) : null,
  };
}

/**
 * Admin user payload. v1.16: `additionalCharges` is sent only when `withCharges` (new officer, or
 * the list was changed): it replaces the whole list, so untouched needs-review rows stay as they are.
 */
export function toUserPayload(v: UserFormValues, withCharges = true) {
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    ...toProfilePayload(v),
    loginEmail: v.loginEmail.trim().toLowerCase(),
    designationId: v.designationId,
    organizationBn: orNull(v.organizationBn),
    organizationEn: orNull(v.organizationEn),
    ...(withCharges
      ? {
          additionalCharges: v.additionalCharges.map((c) => ({
            designationId: c.designationId,
            wingId: c.wingId || null,
            note: c.note.trim() || null,
          })),
        }
      : {}),
  };
}

/**
 * v1.16: before the charge list is saved, every row (also one that needed review) must have a
 * designation. Returns the row indexes without one.
 */
export function chargesWithoutDesignation(v: Pick<UserFormValues, "additionalCharges">): number[] {
  return v.additionalCharges.flatMap((c, i) => (c.designationId ? [] : [i]));
}
