/**
 * Every mail of the system (step 7). No mail ever contains a password (SPEC.md §9.1): new
 * accounts and admin resets point to the default password the office announced (2026-11-09).
 */
import { renderMail, type MailContent } from './render';

export type { MailContent } from './render';

/** "rahim.uddin@gmail.com" → "ra***@gmail.com" (enough to recognise, not to copy). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

// ------------------------------------------------------------------ accounts / passwords

/** Shown instead of the password itself (owner decision 2026-11-09, SPEC.md §6.2). */
export const DEFAULT_PASSWORD_HINT_BN = 'অফিস থেকে জানানো ডিফল্ট পাসওয়ার্ড';

/** New account (admin created it): log in with the default password the office announced. */
export function accountCreatedMail(input: {
  nameBn: string;
  loginEmail: string;
  loginUrl: string;
}): MailContent {
  return renderMail('আপনার অ্যাকাউন্ট তৈরি হয়েছে', input.nameBn, [
    {
      kind: 'paragraph',
      text: 'বাংলাদেশ পরিসংখ্যান ব্যুরোর সভা সূচি ব্যবস্থাপনায় আপনার জন্য একটি অ্যাকাউন্ট তৈরি করা হয়েছে।',
    },
    {
      kind: 'table',
      rows: [
        ['লগইন ইমেইল', input.loginEmail],
        ['পাসওয়ার্ড', DEFAULT_PASSWORD_HINT_BN],
      ],
    },
    { kind: 'button', label: 'লগইন করুন', url: input.loginUrl },
    {
      kind: 'note',
      text: 'চাইলে লগইনের পর "পাসওয়ার্ড পরিবর্তন" থেকে নিজের পাসওয়ার্ড দিতে পারেন।',
    },
  ]);
}

/** An admin reset the password to the default one; all sessions were ended. */
export function adminResetNoticeMail(input: {
  nameBn: string;
  loginEmail: string;
  loginUrl: string;
}): MailContent {
  return renderMail('আপনার পাসওয়ার্ড রিসেট করা হয়েছে', input.nameBn, [
    {
      kind: 'paragraph',
      text: `একজন প্রশাসক আপনার অ্যাকাউন্টের পাসওয়ার্ড রিসেট করেছেন। এখন ${DEFAULT_PASSWORD_HINT_BN} দিয়ে লগইন করুন। সব ডিভাইস থেকে আপনাকে লগআউট করা হয়েছে।`,
    },
    { kind: 'table', rows: [['লগইন ইমেইল', input.loginEmail]] },
    { kind: 'button', label: 'লগইন করুন', url: input.loginUrl },
    {
      kind: 'note',
      text: 'আপনি এমন অনুরোধ না করে থাকলে দ্রুত প্রশাসকের সাথে যোগাযোগ করুন।',
    },
  ]);
}

/** "Forgot password" requested by the user. */
export function passwordResetMail(input: {
  nameBn: string;
  link: string;
  validMinutes: number;
}): MailContent {
  return renderMail('পাসওয়ার্ড রিসেট', input.nameBn, [
    {
      kind: 'paragraph',
      text: 'আপনার অ্যাকাউন্টের পাসওয়ার্ড রিসেট করার অনুরোধ পাওয়া গেছে। নিচের বাটনে ক্লিক করে নতুন পাসওয়ার্ড দিন:',
    },
    { kind: 'button', label: 'পাসওয়ার্ড রিসেট করুন', url: input.link },
    {
      kind: 'note',
      text: `লিংকটি ${input.validMinutes} মিনিট কার্যকর থাকবে এবং একবারই ব্যবহার করা যাবে। আপনি অনুরোধ না করে থাকলে এই ইমেইল উপেক্ষা করুন; আপনার পাসওয়ার্ড বদলাবে না।`,
    },
  ]);
}

// ------------------------------------------------------------------ notification email

/** To the NEW (not yet verified) notification email. */
export function notificationEmailVerifyMail(input: {
  nameBn: string;
  link: string;
  validHours: number;
}): MailContent {
  return renderMail('নোটিফিকেশন ইমেইল যাচাই করুন', input.nameBn, [
    {
      kind: 'paragraph',
      text: 'এই ঠিকানাটিকে আপনার নোটিফিকেশন ইমেইল হিসেবে ব্যবহারের অনুরোধ করা হয়েছে। নিশ্চিত করতে নিচের বাটনে ক্লিক করুন:',
    },
    { kind: 'button', label: 'ইমেইল যাচাই করুন', url: input.link },
    {
      kind: 'note',
      text: `লিংকটি ${input.validHours} ঘণ্টা কার্যকর থাকবে এবং একবারই ব্যবহার করা যাবে। আপনি অনুরোধ না করে থাকলে এই ইমেইল উপেক্ষা করুন।`,
    },
  ]);
}

/** To the CURRENT notification email: a change was requested (fraud warning). */
export function notificationEmailChangeNoticeMail(input: {
  nameBn: string;
  newEmail: string;
}): MailContent {
  return renderMail('নোটিফিকেশন ইমেইল পরিবর্তনের অনুরোধ', input.nameBn, [
    {
      kind: 'paragraph',
      text: `আপনার অ্যাকাউন্টের নোটিফিকেশন ইমেইল ${maskEmail(input.newEmail)} ঠিকানায় পরিবর্তনের অনুরোধ করা হয়েছে। নতুন ঠিকানাটি যাচাই না হওয়া পর্যন্ত সব ইমেইল এই ঠিকানাতেই আসবে।`,
    },
    {
      kind: 'note',
      text: 'আপনি এই অনুরোধ না করে থাকলে দ্রুত পাসওয়ার্ড পরিবর্তন করুন এবং প্রশাসকের সাথে যোগাযোগ করুন।',
    },
  ]);
}

// ------------------------------------------------------------------ change requests

export interface ChangeSummary {
  /** e.g. "লগইন ইমেইল" or "পদবি" */
  typeLabel: string;
  currentValue: string;
  requestedValue: string;
}

function changeRows(
  c: ChangeSummary,
): ReadonlyArray<readonly [string, string]> {
  return [
    ['বিষয়', c.typeLabel],
    ['বর্তমান', c.currentValue],
    ['অনুরোধকৃত', c.requestedValue],
  ];
}

/** To every admin: an officer submitted a change request. */
export function changeRequestSubmittedMail(
  input: ChangeSummary & {
    adminNameBn: string;
    requesterNameBn: string;
    link: string;
  },
): MailContent {
  return renderMail(
    `নতুন পরিবর্তনের অনুরোধ: ${input.typeLabel}`,
    input.adminNameBn,
    [
      {
        kind: 'paragraph',
        text: `${input.requesterNameBn} একটি পরিবর্তনের অনুরোধ পাঠিয়েছেন:`,
      },
      { kind: 'table', rows: changeRows(input) },
      {
        kind: 'button',
        label: 'অনুরোধটি দেখুন ও সিদ্ধান্ত দিন',
        url: input.link,
      },
    ],
  );
}

/** To the officer: their request was approved or rejected. */
export function changeRequestDecisionMail(
  input: ChangeSummary & {
    nameBn: string;
    approved: boolean;
    note: string | null;
    link: string;
  },
): MailContent {
  const result = input.approved ? 'অনুমোদিত হয়েছে' : 'প্রত্যাখ্যাত হয়েছে';
  return renderMail(
    `আপনার ${input.typeLabel} পরিবর্তনের অনুরোধ ${result}`,
    input.nameBn,
    [
      { kind: 'paragraph', text: `আপনার পরিবর্তনের অনুরোধটি ${result}।` },
      { kind: 'table', rows: changeRows(input) },
      ...(input.note
        ? [
            {
              kind: 'paragraph' as const,
              text: `প্রশাসকের মন্তব্য: ${input.note}`,
            },
          ]
        : []),
      { kind: 'button', label: 'আপনার অনুরোধগুলো দেখুন', url: input.link },
    ],
  );
}

/** To the old AND the new login email after an approved login-email change. */
export function loginEmailChangedMail(input: {
  nameBn: string;
  oldEmail: string;
  newEmail: string;
  loginUrl: string;
}): MailContent {
  return renderMail('আপনার লগইন ইমেইল পরিবর্তিত হয়েছে', input.nameBn, [
    {
      kind: 'paragraph',
      text: 'প্রশাসকের অনুমোদনে আপনার লগইন ইমেইল পরিবর্তন করা হয়েছে:',
    },
    {
      kind: 'table',
      rows: [
        ['আগের', input.oldEmail],
        ['নতুন', input.newEmail],
      ],
    },
    {
      kind: 'paragraph',
      text: 'নিরাপত্তার জন্য সব ডিভাইস থেকে আপনাকে লগআউট করা হয়েছে। এখন থেকে নতুন ইমেইল দিয়ে লগইন করুন; পাসওয়ার্ড আগেরটিই থাকবে।',
    },
    { kind: 'button', label: 'লগইন করুন', url: input.loginUrl },
    {
      kind: 'note',
      text: 'আপনি এই অনুরোধ না করে থাকলে দ্রুত প্রশাসকের সাথে যোগাযোগ করুন।',
    },
  ]);
}

// ------------------------------------------------------------------ generic

/** Default e-mail form of a bell notification (title + body + optional link). */
export function genericNotificationMail(input: {
  nameBn: string;
  title: string;
  body: string;
  link: string | null;
}): MailContent {
  return renderMail(input.title, input.nameBn, [
    // One paragraph per line, so multi-line bodies (meeting details) stay readable.
    ...input.body
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => ({ kind: 'paragraph' as const, text: line })),
    ...(input.link
      ? [{ kind: 'button' as const, label: 'বিস্তারিত দেখুন', url: input.link }]
      : []),
  ]);
}
