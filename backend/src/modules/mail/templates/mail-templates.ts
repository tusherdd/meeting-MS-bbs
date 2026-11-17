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
export const DEFAULT_PASSWORD_HINT_BN = 'অফিস থেকে জানানো Default Password';

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
        ['Login Email', input.loginEmail],
        ['Password', DEFAULT_PASSWORD_HINT_BN],
      ],
    },
    { kind: 'button', label: 'Login', url: input.loginUrl },
    {
      kind: 'note',
      text: 'চাইলে Login-এর পর "Password পরিবর্তন" থেকে নিজের Password দিতে পারেন।',
    },
  ]);
}

/** An admin reset the password to the default one; all sessions were ended. */
export function adminResetNoticeMail(input: {
  nameBn: string;
  loginEmail: string;
  loginUrl: string;
}): MailContent {
  return renderMail('আপনার Password Reset করা হয়েছে', input.nameBn, [
    {
      kind: 'paragraph',
      text: `একজন প্রশাসক আপনার অ্যাকাউন্টের Password Reset করেছেন। এখন ${DEFAULT_PASSWORD_HINT_BN} দিয়ে Login করুন। সব ডিভাইস থেকে আপনাকে Logout করা হয়েছে।`,
    },
    { kind: 'table', rows: [['Login Email', input.loginEmail]] },
    { kind: 'button', label: 'Login', url: input.loginUrl },
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
  return renderMail('Password Reset', input.nameBn, [
    {
      kind: 'paragraph',
      text: 'আপনার অ্যাকাউন্টের Password Reset করার অনুরোধ পাওয়া গেছে। নিচের বাটনে ক্লিক করে নতুন Password দিন:',
    },
    { kind: 'button', label: 'Reset Password', url: input.link },
    {
      kind: 'note',
      text: `Link-টি ${input.validMinutes} মিনিট কার্যকর থাকবে এবং একবারই ব্যবহার করা যাবে। আপনি অনুরোধ না করে থাকলে এই Email উপেক্ষা করুন; আপনার Password বদলাবে না।`,
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
  return renderMail('Notification Email যাচাই করুন', input.nameBn, [
    {
      kind: 'paragraph',
      text: 'এই ঠিকানাটিকে আপনার Notification Email হিসেবে ব্যবহারের অনুরোধ করা হয়েছে। নিশ্চিত করতে নিচের বাটনে ক্লিক করুন:',
    },
    { kind: 'button', label: 'Email যাচাই করুন', url: input.link },
    {
      kind: 'note',
      text: `Link-টি ${input.validHours} ঘণ্টা কার্যকর থাকবে এবং একবারই ব্যবহার করা যাবে। আপনি অনুরোধ না করে থাকলে এই Email উপেক্ষা করুন।`,
    },
  ]);
}

/** To the CURRENT notification email: a change was requested (fraud warning). */
export function notificationEmailChangeNoticeMail(input: {
  nameBn: string;
  newEmail: string;
}): MailContent {
  return renderMail('Notification Email পরিবর্তনের অনুরোধ', input.nameBn, [
    {
      kind: 'paragraph',
      text: `আপনার অ্যাকাউন্টের Notification Email ${maskEmail(input.newEmail)} ঠিকানায় Change Request করা হয়েছে। নতুন ঠিকানাটি যাচাই না হওয়া পর্যন্ত সব Email এই ঠিকানাতেই আসবে।`,
    },
    {
      kind: 'note',
      text: 'আপনি এই অনুরোধ না করে থাকলে দ্রুত Password পরিবর্তন করুন এবং প্রশাসকের সাথে যোগাযোগ করুন।',
    },
  ]);
}

// ------------------------------------------------------------------ change requests

export interface ChangeSummary {
  /** e.g. "Login Email" or "পদবি" */
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
    `নতুন Change Request: ${input.typeLabel}`,
    input.adminNameBn,
    [
      {
        kind: 'paragraph',
        text: `${input.requesterNameBn} একটি Change Request পাঠিয়েছেন:`,
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
  const result = input.approved ? 'Approved হয়েছে' : 'Rejected হয়েছে';
  return renderMail(
    `আপনার ${input.typeLabel} Change Request ${result}`,
    input.nameBn,
    [
      { kind: 'paragraph', text: `আপনার Change Request-টি ${result}।` },
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
  return renderMail('আপনার Login Email পরিবর্তিত হয়েছে', input.nameBn, [
    {
      kind: 'paragraph',
      text: 'প্রশাসকের অনুমোদনে আপনার Login Email পরিবর্তন করা হয়েছে:',
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
      text: 'নিরাপত্তার জন্য সব ডিভাইস থেকে আপনাকে Logout করা হয়েছে। এখন থেকে নতুন Email দিয়ে Login করুন; Password আগেরটিই থাকবে।',
    },
    { kind: 'button', label: 'Login', url: input.loginUrl },
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

// ------------------------------------------------------------------ guest officers (v1.5)

/** What a guest officer's mail shows about the meeting (all user text unchanged). */
export interface GuestMeetingDetails {
  title: string;
  /** System text, e.g. "১ ডিসেম্বর ২০২৬ (মঙ্গলবার), সকাল ১০:৩০ – সকাল ১১:৩০" (Asia/Dhaka). */
  when: string;
  room: string | null;
  onlineLink: string | null;
  agenda: string | null;
  /** The organizer as displayed: their wing, or their designation without one (v1.9). */
  organizer: string;
  /** "name, designation" of the officer or guest chair; null = no chair. */
  chair: string | null;
}

export type GuestMailKind = 'invited' | 'updated' | 'cancelled' | 'removed';

const GUEST_INTRO: Record<GuestMailKind, (title: string) => [string, string]> =
  {
    invited: (title) => [
      `সভার আমন্ত্রণ: ${title}`,
      'আপনাকে অতিথি কর্মকর্তা হিসেবে নিচের সভায় আমন্ত্রণ জানানো হয়েছে।',
    ],
    updated: (title) => [
      `সভায় পরিবর্তন: ${title}`,
      'যে সভায় আপনাকে অতিথি কর্মকর্তা হিসেবে আমন্ত্রণ জানানো হয়েছে, তাতে পরিবর্তন করা হয়েছে।',
    ],
    cancelled: (title) => [
      `সভা বাতিল: ${title}`,
      'যে সভায় আপনাকে অতিথি কর্মকর্তা হিসেবে আমন্ত্রণ জানানো হয়েছিল, সেটি বাতিল করা হয়েছে।',
    ],
    removed: (title) => [
      `অতিথি কর্মকর্তার তালিকা থেকে বাদ: ${title}`,
      'আপনাকে এই সভার অতিথি কর্মকর্তার তালিকা থেকে বাদ দেওয়া হয়েছে; আপনার উপস্থিতির প্রয়োজন নেই।',
    ],
  };

/**
 * Mail to a guest officer (no account, SPEC.md §6.7). Guests cannot log in, so the mail carries
 * every detail itself and has no button or link that needs a login (the meeting's own online
 * link is shown as text). Never a password.
 */
export function guestMeetingMail(input: {
  guestName: string;
  kind: GuestMailKind;
  meeting: GuestMeetingDetails;
  changes?: ReadonlyArray<{ label: string; before: string; after: string }>;
  cancelReason?: string;
}): MailContent {
  const m = input.meeting;
  const [subject, intro] = GUEST_INTRO[input.kind](m.title);
  const details: Array<[string, string]> = [
    ['শিরোনাম', m.title],
    ['তারিখ ও সময়', m.when],
    ['স্থান', m.room ?? 'স্থান উল্লেখ নেই'],
    ['Online Link', m.onlineLink ?? '—'],
    ['আয়োজক', m.organizer],
    ['সভাপতি', m.chair ?? '—'],
  ];
  const showDetails = input.kind === 'invited' || input.kind === 'updated';
  const agendaLines = (m.agenda ?? '')
    .split('\n')
    .filter((line) => line.trim() !== '');

  return renderMail(subject, input.guestName, [
    { kind: 'paragraph', text: intro },
    ...(input.changes?.length
      ? [
          { kind: 'paragraph' as const, text: 'যা বদলেছে:' },
          ...input.changes.map((c) => ({
            kind: 'paragraph' as const,
            text: c.before
              ? `${c.label}: ${c.before} → ${c.after}`
              : `${c.label}: ${c.after}`,
          })),
        ]
      : []),
    ...(input.cancelReason
      ? [
          {
            kind: 'paragraph' as const,
            text: `বাতিলের কারণ: ${input.cancelReason}`,
          },
        ]
      : []),
    {
      kind: 'table',
      rows: showDetails
        ? details
        : details.filter(([label]) =>
            ['শিরোনাম', 'তারিখ ও সময়', 'আয়োজক'].includes(label),
          ),
    },
    ...(showDetails && agendaLines.length > 0
      ? [
          { kind: 'paragraph' as const, text: 'আলোচ্যসূচি:' },
          ...agendaLines.map((line) => ({
            kind: 'paragraph' as const,
            text: line,
          })),
        ]
      : []),
    {
      kind: 'note',
      text: 'এই সভার জন্য কোনো Login লাগবে না। কোনো প্রশ্ন থাকলে আয়োজকের সাথে যোগাযোগ করুন।',
    },
  ]);
}
