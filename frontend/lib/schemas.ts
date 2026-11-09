/**
 * Form validation. The rules mirror the backend DTOs (login.dto.ts, change-password.dto.ts,
 * reset-password.dto.ts, common/utils/password.ts) so most mistakes are caught before sending.
 * The backend still checks everything again.
 */
import { z } from "zod";
import { t } from "@/messages";

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

export const loginSchema = z.object({
  loginEmail: email,
  password: z
    .string()
    .min(1, t.validation.passwordRequired)
    .max(PASSWORD_MAX_LENGTH, t.validation.passwordTooLong),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ loginEmail: email });
export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export const newPasswordSchema = z
  .object({ newPassword, confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: t.validation.passwordMismatch,
  });
export type NewPasswordForm = z.infer<typeof newPasswordSchema>;

/** Change password: also "not equal to my login email" and "different from the current one". */
export function changePasswordSchema(loginEmail: string) {
  return z
    .object({
      currentPassword: z
        .string()
        .min(1, t.validation.currentPasswordRequired)
        .max(PASSWORD_MAX_LENGTH, t.validation.passwordTooLong),
      newPassword,
      confirmPassword: z.string(),
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
export type ChangePasswordForm = z.infer<ReturnType<typeof changePasswordSchema>>;

// Meetings ---------------------------------------------------------------------------------------
const MAX_MEETING_MS = 12 * 3_600_000;

/** Same limits as backend CreateMeetingDto + meeting-rules (end after start, at most 12 h). */
export const meetingFormSchema = z
  .object({
    title: z.string().trim().min(3, t.meetingForm.titleLength).max(200, t.meetingForm.titleLength),
    agenda: z.string().max(5000, t.meetingForm.agendaTooLong),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t.meetingForm.dateRequired),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, t.meetingForm.timeRequired),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, t.meetingForm.timeRequired),
    room: z.string().trim().max(100, t.meetingForm.roomTooLong),
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
export type MeetingFormValues = z.infer<typeof meetingFormSchema>;

export const cancelReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, t.meetingDetail.cancelReasonLength)
    .max(1000, t.meetingDetail.cancelReasonLength),
});
export type CancelReasonForm = z.infer<typeof cancelReasonSchema>;
