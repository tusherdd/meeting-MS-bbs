/**
 * API message catalog (v1.6, SPEC.md §13.14): every user-facing error / validation message (and the
 * few success messages) in Bangla and English, keyed by a stable code. The code is sent in the
 * response (`code`, `codes`) so clients can map it themselves.
 *
 * - Throw sites keep throwing the Bangla text (the `bn` value, byte for byte). The global
 *   exception filter / message interceptor look the text up here and answer in the language of
 *   the request's Accept-Language (bn when missing: old clients keep working).
 * - `{name}` marks a parameter (e.g. an email address); it is copied into the other language.
 * - Never used for PDFs, mails or bell notifications: those are always Bangla.
 * - catalog-coverage.spec.ts fails when a Bangla message in the code is missing here.
 */
export interface CatalogEntry {
  bn: string;
  en: string;
}

export const MESSAGE_CATALOG = {
  TOO_MANY_REQUESTS: {
    bn: 'অনেক বেশি অনুরোধ পাঠানো হয়েছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।',
    en: 'Too many requests. Please wait a little and try again.',
  },
  PAGE_NOT_INTEGER: {
    bn: 'page একটি পূর্ণসংখ্যা হতে হবে।',
    en: 'page must be a whole number.',
  },
  PAGE_MIN: {
    bn: 'page কমপক্ষে ১ হতে হবে।',
    en: 'page must be at least 1.',
  },
  LIMIT_NOT_INTEGER: {
    bn: 'limit একটি পূর্ণসংখ্যা হতে হবে।',
    en: 'limit must be a whole number.',
  },
  LIMIT_MIN: {
    bn: 'limit কমপক্ষে ১ হতে হবে।',
    en: 'limit must be at least 1.',
  },
  LIMIT_MAX: {
    bn: 'limit সর্বোচ্চ {MAX_PAGE_SIZE} হতে পারে।',
    en: 'limit can be at most {MAX_PAGE_SIZE}.',
  },
  SERVER_ERROR: {
    bn: 'সার্ভারে একটি অপ্রত্যাশিত ত্রুটি হয়েছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
    en: 'An unexpected server error occurred. Please try again after a while.',
  },
  INVALID_ID: {
    bn: 'অবৈধ আইডি।',
    en: 'Invalid ID.',
  },
  FIELD_NOT_ALLOWED: {
    bn: '"{path}" ফিল্ডটি এখানে পাঠানো বা পরিবর্তন করা যাবে না।',
    en: 'The field "{path}" cannot be sent or changed here.',
  },
  PASSWORD_TOO_SHORT: {
    bn: 'Password কমপক্ষে {PASSWORD_MIN_LENGTH} অক্ষরের হতে হবে।',
    en: 'The password must have at least {PASSWORD_MIN_LENGTH} characters.',
  },
  PASSWORD_NEEDS_LETTER: {
    bn: 'Password-এ অন্তত একটি ইংরেজি অক্ষর থাকতে হবে।',
    en: 'The password must contain at least one English letter.',
  },
  PASSWORD_NEEDS_DIGIT: {
    bn: 'Password-এ অন্তত একটি সংখ্যা থাকতে হবে।',
    en: 'The password must contain at least one digit.',
  },
  PASSWORD_SAME_AS_EMAIL: {
    bn: 'Password ও Email একই হতে পারবে না।',
    en: 'The password cannot be the same as the email address.',
  },
  INVALID_CREDENTIALS: {
    bn: 'Email অথবা Password সঠিক নয়। Password মনে না থাকলে "Password ভুলে গেছেন?" ব্যবহার করে Email-এ Reset Link নিন।',
    en: 'Email or password is incorrect. If you do not remember your password, use "Forgot your password?" to get a reset link by email.',
  },
  ACCOUNT_INACTIVE: {
    bn: 'আপনার অ্যাকাউন্টটি Inactive করা হয়েছে। প্রশাসকের সাথে যোগাযোগ করুন।',
    en: 'Your account has been deactivated. Please contact an administrator.',
  },
  LOGIN_REQUIRED: {
    bn: 'অনুগ্রহ করে Login করুন।',
    en: 'Please log in.',
  },
  SESSION_EXPIRED: {
    bn: 'Session-এর মেয়াদ শেষ হয়েছে। অনুগ্রহ করে আবার Login করুন।',
    en: 'Your session has expired. Please log in again.',
  },
  MUST_CHANGE_PASSWORD: {
    bn: 'নিরাপত্তার জন্য প্রথমে আপনার Password পরিবর্তন করুন। এর আগে অন্য কোনো কাজ করা যাবে না।',
    en: 'For security, change your password first. Nothing else can be done before that.',
  },
  FORBIDDEN: {
    bn: 'এই কাজটি করার অনুমতি আপনার নেই।',
    en: 'You do not have permission to do this.',
  },
  BAD_ORIGIN: {
    bn: 'অনুরোধটি অনুমোদিত উৎস থেকে আসেনি।',
    en: 'The request did not come from an allowed origin.',
  },
  WRONG_CURRENT_PASSWORD: {
    bn: 'বর্তমান Password সঠিক নয়।',
    en: 'The current password is incorrect.',
  },
  SAME_PASSWORD: {
    bn: 'নতুন Password বর্তমান Password থেকে আলাদা হতে হবে।',
    en: 'The new password must be different from the current password.',
  },
  PASSWORD_CHANGED: {
    bn: 'Password সফলভাবে পরিবর্তন করা হয়েছে।',
    en: 'The password has been changed.',
  },
  FORGOT_PASSWORD_SENT: {
    bn: 'Email-টি নিবন্ধিত থাকলে Password Reset-এর Link পাঠানো হয়েছে। অনুগ্রহ করে Email দেখুন।',
    en: 'If the email is registered, a password reset link has been sent. Please check your email.',
  },
  INVALID_RESET_TOKEN: {
    bn: 'Reset Link-টি অবৈধ অথবা মেয়াদোত্তীর্ণ। নতুন Link-এর জন্য আবার অনুরোধ করুন।',
    en: 'The reset link is invalid or has expired. Please request a new link.',
  },
  PASSWORD_RESET_DONE_SELF: {
    bn: 'Password Reset হয়েছে। নতুন Password দিয়ে Login করুন।',
    en: 'The password has been reset. Log in with the new password.',
  },
  PASSWORD_SET: {
    bn: 'Password সেট হয়েছে। এখন Login Email ও এই Password দিয়ে Login করুন।',
    en: 'The password has been set. Now log in with your login email and this password.',
  },
  LOGGED_OUT: {
    bn: 'আপনি Logout করেছেন।',
    en: 'You have logged out.',
  },
  CURRENT_PASSWORD_REQUIRED: {
    bn: 'বর্তমান Password দিন।',
    en: 'Enter your current password.',
  },
  PASSWORD_TOO_LONG: {
    bn: 'Password সর্বোচ্চ ১২৮ অক্ষরের হতে পারে।',
    en: 'The password can have at most 128 characters.',
  },
  NEW_PASSWORD_REQUIRED: {
    bn: 'নতুন Password দিন।',
    en: 'Enter the new password.',
  },
  EMAIL_INVALID: {
    bn: 'সঠিক Email ঠিকানা দিন।',
    en: 'Enter a valid email address.',
  },
  EMAIL_TOO_LONG: {
    bn: 'Email খুব দীর্ঘ।',
    en: 'The email address is too long.',
  },
  PASSWORD_REQUIRED: {
    bn: 'Password দিন।',
    en: 'Enter the password.',
  },
  RESET_TOKEN_REQUIRED: {
    bn: 'Reset টোকেন দিন।',
    en: 'Enter the reset token.',
  },
  RESET_LINK_INVALID: {
    bn: 'Reset Link-টি অবৈধ।',
    en: 'The reset link is invalid.',
  },
  CHANGE_REQUEST_NOT_FOUND: {
    bn: 'Change Request-টি পাওয়া যায়নি।',
    en: 'Change request not found.',
  },
  CHANGE_REQUEST_ONE_PENDING: {
    bn: 'এই বিষয়ে আপনার একটি অনুরোধ ইতিমধ্যে Pending আছে। আগে সেটির সিদ্ধান্ত হোক অথবা বাতিল করুন।',
    en: 'You already have a pending request of this type. Wait for the decision or cancel it first.',
  },
  CHANGE_REQUEST_NOT_PENDING: {
    bn: 'এই অনুরোধের ইতিমধ্যে নিষ্পত্তি হয়েছে।',
    en: 'This request has already been decided.',
  },
  CHANGE_REQUEST_SUPER_ADMIN: {
    bn: 'Super Admin নিজের অ্যাকাউন্ট সরাসরি সম্পাদনা করতে পারেন; অনুরোধের প্রয়োজন নেই।',
    en: 'The Super Admin can edit the account directly; no request is needed.',
  },
  CHANGE_REQUEST_SAME_LOGIN_EMAIL: {
    bn: 'এটিই আপনার বর্তমান Login Email।',
    en: 'This is already your login email.',
  },
  LOGIN_EMAIL_TAKEN: {
    bn: 'এই Email ইতিমধ্যে অন্য একটি অ্যাকাউন্টে ব্যবহৃত হচ্ছে।',
    en: 'This email is already used by another account.',
  },
  CHANGE_REQUEST_DESIGNATION_INVALID: {
    bn: 'নির্বাচিত পদবিটি পাওয়া যায়নি অথবা Inactive।',
    en: 'The selected designation was not found or is inactive.',
  },
  CHANGE_REQUEST_SAME_DESIGNATION: {
    bn: 'এটিই আপনার বর্তমান পদবি।',
    en: 'This is already your designation.',
  },
  CHANGE_REQUEST_DESIGNATION_GONE: {
    bn: 'অনুরোধকৃত পদবিটি এখন Inactive অথবা মুছে ফেলা হয়েছে; অনুমোদন দেওয়া যাবে না।',
    en: 'The requested designation is now inactive or deleted; the request cannot be approved.',
  },
  CHANGE_REQUEST_OWN: {
    bn: 'নিজের অনুরোধ নিজে অনুমোদন করা যাবে না। অন্য একজন প্রশাসককে অনুমোদন করতে হবে।',
    en: 'You cannot approve your own request. Another administrator must approve it.',
  },
  CHANGE_REQUEST_LOGIN_EMAIL_REQUIRED: {
    bn: 'নতুন Login Email দিন।',
    en: 'Enter the new login email.',
  },
  CHANGE_REQUEST_DESIGNATION_REQUIRED: {
    bn: 'নতুন পদবি নির্বাচন করুন।',
    en: 'Select the new designation.',
  },
  CHANGE_REQUEST_TYPE_INVALID: {
    bn: 'type LOGIN_EMAIL অথবা DESIGNATION হতে হবে।',
    en: 'type must be LOGIN_EMAIL or DESIGNATION.',
  },
  NOTE_NOT_STRING: {
    bn: 'মন্তব্য লেখা হতে হবে।',
    en: 'The note must be text.',
  },
  NOTE_TOO_LONG: {
    bn: 'মন্তব্য সর্বোচ্চ ১০০০ অক্ষরের হতে পারে।',
    en: 'The note can have at most 1000 characters.',
  },
  REJECT_REASON_REQUIRED: {
    bn: 'প্রত্যাখ্যানের কারণ লিখুন।',
    en: 'Write the reason for rejection.',
  },
  REJECT_REASON_TOO_SHORT: {
    bn: 'প্রত্যাখ্যানের কারণ কমপক্ষে ৩ অক্ষরের হতে হবে।',
    en: 'The reason for rejection must have at least 3 characters.',
  },
  STATUS_INVALID: {
    bn: 'অবৈধ status।',
    en: 'Invalid status.',
  },
  TYPE_INVALID: {
    bn: 'অবৈধ type।',
    en: 'Invalid type.',
  },
  DESIGNATION_NOT_FOUND: {
    bn: 'পদবিটি পাওয়া যায়নি।',
    en: 'Designation not found.',
  },
  DESIGNATION_DUPLICATE_NAME: {
    bn: 'এই ইংরেজি নামে একটি পদবি আগে থেকেই আছে।',
    en: 'A designation with this English name already exists.',
  },
  DESIGNATION_IN_USE: {
    bn: 'এই পদবিটি {count} জন কর্মকর্তার সাথে যুক্ত, তাই মুছে ফেলা যাবে না। প্রয়োজনে পদবিটি Inactive করুন।',
    en: 'This designation is assigned to {count} officers, so it cannot be deleted. Deactivate it if needed.',
  },
  DESIGNATION_IN_USE_GENERIC: {
    bn: 'এই পদবিটি কর্মকর্তাদের সাথে যুক্ত, তাই মুছে ফেলা যাবে না। প্রয়োজনে পদবিটি Inactive করুন।',
    en: 'This designation is assigned to officers, so it cannot be deleted. Deactivate it if needed.',
  },
  NAME_BN_REQUIRED: {
    bn: 'বাংলা নাম দিন।',
    en: 'Enter the name in Bangla.',
  },
  NAME_BN_TOO_LONG_150: {
    bn: 'বাংলা নাম সর্বোচ্চ ১৫০ অক্ষরের হতে পারে।',
    en: 'The Bangla name can have at most 150 characters.',
  },
  NAME_EN_REQUIRED: {
    bn: 'ইংরেজি নাম দিন।',
    en: 'Enter the name in English.',
  },
  NAME_EN_TOO_LONG_150: {
    bn: 'ইংরেজি নাম সর্বোচ্চ ১৫০ অক্ষরের হতে পারে।',
    en: 'The English name can have at most 150 characters.',
  },
  PRIORITY_NOT_INTEGER: {
    bn: 'অগ্রাধিকার একটি পূর্ণসংখ্যা হতে হবে।',
    en: 'Priority must be a whole number.',
  },
  PRIORITY_MIN: {
    bn: 'অগ্রাধিকার কমপক্ষে ১ হতে হবে।',
    en: 'Priority must be at least 1.',
  },
  PRIORITY_MAX: {
    bn: 'অগ্রাধিকার সর্বোচ্চ ৯৯৯ হতে পারে।',
    en: 'Priority can be at most 999.',
  },
  IS_ACTIVE_BOOLEAN: {
    bn: 'isActive true অথবা false হতে হবে।',
    en: 'isActive must be true or false.',
  },
  ACTIVE_ONLY_BOOLEAN: {
    bn: 'activeOnly true অথবা false হতে হবে।',
    en: 'activeOnly must be true or false.',
  },
  MAIL_NOT_FOUND: {
    bn: 'মেইলটি পাওয়া যায়নি।',
    en: 'Email not found.',
  },
  MAIL_RETRY_ONLY_FAILED: {
    bn: 'শুধু Failed Email আবার পাঠানো যায়।',
    en: 'Only failed emails can be sent again.',
  },
  TIME_FORMAT: {
    bn: 'সময় ISO 8601 আকারে, অফসেটসহ দিন (যেমন 2026-12-01T10:30:00+06:00)।',
    en: 'Give the time in ISO 8601 format with an offset (for example 2026-12-01T10:30:00+06:00).',
  },
  GUEST_NAME_REQUIRED: {
    bn: 'অতিথি কর্মকর্তার নাম দিন।',
    en: "Enter the guest officer's name.",
  },
  GUEST_NAME_LENGTH: {
    bn: 'অতিথি কর্মকর্তার নাম ১ থেকে ২০০ অক্ষরের হতে হবে।',
    en: "The guest officer's name must be 1 to 200 characters long.",
  },
  GUEST_DESIGNATION_REQUIRED: {
    bn: 'অতিথি কর্মকর্তার পদবি দিন।',
    en: "Enter the guest officer's designation.",
  },
  GUEST_DESIGNATION_LENGTH: {
    bn: 'অতিথি কর্মকর্তার পদবি ১ থেকে ২০০ অক্ষরের হতে হবে।',
    en: "The guest officer's designation must be 1 to 200 characters long.",
  },
  GUEST_EMAIL_REQUIRED: {
    bn: 'অতিথি কর্মকর্তার Email দিন।',
    en: "Enter the guest officer's email.",
  },
  GUEST_EMAIL_TOO_LONG: {
    bn: 'অতিথি কর্মকর্তার Email খুব দীর্ঘ।',
    en: "The guest officer's email is too long.",
  },
  GUEST_EMAIL_INVALID: {
    bn: 'অতিথি কর্মকর্তার সঠিক Email ঠিকানা দিন।',
    en: 'Enter a valid email address for the guest officer.',
  },
  IS_CHAIR_BOOLEAN: {
    bn: 'isChair true অথবা false হতে হবে।',
    en: 'isChair must be true or false.',
  },
  MINUTES_REQUIRED_BOOLEAN: {
    bn: 'minutesRequired true অথবা false হতে হবে।',
    en: 'minutesRequired must be true or false.',
  },
  MEETING_TITLE_REQUIRED: {
    bn: 'সভার শিরোনাম দিন।',
    en: 'Enter the meeting title.',
  },
  MEETING_TITLE_LENGTH: {
    bn: 'শিরোনাম ৩ থেকে ২০০ অক্ষরের হতে হবে।',
    en: 'The title must be 3 to 200 characters long.',
  },
  AGENDA_NOT_STRING: {
    bn: 'আলোচ্যসূচি লেখা হতে হবে।',
    en: 'The description must be text.',
  },
  AGENDA_TOO_LONG: {
    bn: 'আলোচ্যসূচি সর্বোচ্চ ৫০০০ অক্ষরের হতে পারে।',
    en: 'The description can have at most 5000 characters.',
  },
  // v1.9: the room field is shown as "স্থান" / "Venue" and is required (codes keep "ROOM").
  ROOM_REQUIRED: {
    bn: 'স্থান লিখতে হবে।',
    en: 'Venue is required.',
  },
  ROOM_TOO_LONG: {
    bn: 'স্থান সর্বোচ্চ ১০০ অক্ষরের হতে পারে।',
    en: 'The venue can have at most 100 characters.',
  },
  ONLINE_LINK_INVALID: {
    bn: 'Online Link https:// দিয়ে শুরু হওয়া সঠিক ঠিকানা হতে হবে।',
    en: 'The online link must be a valid address starting with https://.',
  },
  LINK_TOO_LONG: {
    bn: 'Link খুব দীর্ঘ।',
    en: 'The link is too long.',
  },
  CHAIR_INVALID: {
    bn: 'সঠিক সভাপতি নির্বাচন করুন।',
    en: 'Select a valid president.',
  },
  PARTICIPANTS_NOT_ARRAY: {
    bn: 'অংশগ্রহণকারীদের তালিকা দিন।',
    en: 'Give the list of participants.',
  },
  PARTICIPANTS_DUPLICATE: {
    bn: 'একই অংশগ্রহণকারী একাধিকবার দেওয়া যাবে না।',
    en: 'The same participant cannot be given more than once.',
  },
  PARTICIPANTS_MAX: {
    bn: 'সর্বোচ্চ ২০০ জন অংশগ্রহণকারী দেওয়া যাবে।',
    en: 'At most 200 participants are allowed.',
  },
  PARTICIPANT_ID_INVALID: {
    bn: 'অংশগ্রহণকারীর আইডি সঠিক নয়।',
    en: 'The participant ID is invalid.',
  },
  GUESTS_NOT_ARRAY: {
    bn: 'অতিথি কর্মকর্তাদের তালিকা দিন।',
    en: 'Give the list of guest officers.',
  },
  GUESTS_MAX: {
    bn: 'সর্বোচ্চ ৫০ জন অতিথি কর্মকর্তা দেওয়া যাবে।',
    en: 'At most 50 guest officers are allowed.',
  },
  MEETING_ID_INVALID: {
    bn: 'সভার আইডি সঠিক নয়।',
    en: 'The meeting ID is invalid.',
  },
  CANCEL_REASON_REQUIRED: {
    bn: 'বাতিলের কারণ লিখুন।',
    en: 'Write the reason for cancellation.',
  },
  CANCEL_REASON_LENGTH: {
    bn: 'বাতিলের কারণ ৩ থেকে ১০০০ অক্ষরের হতে হবে।',
    en: 'The reason for cancellation must be 3 to 1000 characters long.',
  },
  NOTES_NOT_STRING: {
    bn: 'নোট লেখা হতে হবে।',
    en: 'The notes must be text.',
  },
  NOTES_TOO_LONG: {
    bn: 'নোট সর্বোচ্চ ২০০০০ অক্ষরের হতে পারে।',
    en: 'The notes can have at most 20000 characters.',
  },
  ROLE_FILTER_INVALID: {
    bn: 'role organizer অথবা participant হতে হবে।',
    en: 'role must be organizer or participant.',
  },
  SCOPE_INVALID: {
    bn: 'scope mine অথবা all হতে হবে।',
    en: 'scope must be mine or all.',
  },
  MEETING_NOT_FOUND: {
    bn: 'সভাটি পাওয়া যায়নি।',
    en: 'Meeting not found.',
  },
  MEETING_END_BEFORE_START: {
    bn: 'শেষের সময় অবশ্যই শুরুর সময়ের পরে হতে হবে।',
    en: 'The end time must be after the start time.',
  },
  MEETING_TOO_LONG: {
    bn: 'একটি সভা সর্বোচ্চ ১২ ঘণ্টার হতে পারে।',
    en: 'A meeting can last at most 12 hours.',
  },
  MEETING_IN_PAST: {
    bn: 'অতীতের সময়ে সভা তৈরি বা সরানো যাবে না।',
    en: 'A meeting cannot be created or moved into the past.',
  },
  SUPER_ADMIN_CANNOT_ORGANIZE: {
    bn: 'Super Admin একটি সিস্টেম অ্যাকাউন্ট; এটি সভা আয়োজন করতে পারে না।',
    en: 'The Super Admin is a system account; it cannot organize meetings.',
  },
  SUPER_ADMIN_CANNOT_BE_INVITED: {
    bn: 'Super Admin একটি সিস্টেম অ্যাকাউন্ট; একে সভায় আমন্ত্রণ জানানো যাবে না।',
    en: 'The Super Admin is a system account; it cannot be invited to meetings.',
  },
  PEOPLE_INVALID: {
    bn: 'নির্বাচিত ব্যক্তিদের মধ্যে কেউ Inactive অথবা পাওয়া যায়নি।',
    en: 'Someone among the selected people is inactive or was not found.',
  },
  ORGANIZER_NO_DESIGNATION: {
    bn: 'আপনার কোনো পদবি নেই, তাই সভা আয়োজন করা যাবে না।',
    en: 'You have no designation, so you cannot organize a meeting.',
  },
  NOT_ORGANIZER: {
    bn: 'শুধু সভার আয়োজক অথবা প্রশাসক এই কাজটি করতে পারেন।',
    en: 'Only the organizer of the meeting or an administrator can do this.',
  },
  NOT_ORGANIZER_OR_CHAIR: {
    bn: 'শুধু সভার আয়োজক, সভাপতি অথবা প্রশাসক এই কাজটি করতে পারেন।',
    en: 'Only the organizer, the president of the meeting or an administrator can do this.',
  },
  MEETING_NOT_SCHEDULED: {
    bn: 'বাতিল বা সম্পন্ন সভা পরিবর্তন করা যাবে না।',
    en: 'Cancelled or completed meetings cannot be changed.',
  },
  MEETING_ALREADY_ENDED: {
    bn: 'সভাটি ইতিমধ্যে শেষ হয়েছে; শুধু সম্পন্ন হিসেবে চিহ্নিত করে নোট যোগ করা যাবে।',
    en: 'The meeting has already ended; it can only be marked as completed with notes.',
  },
  MEETING_NOT_STARTED: {
    bn: 'সভা শুরু হওয়ার আগে সম্পন্ন হিসেবে চিহ্নিত করা যাবে না।',
    en: 'A meeting cannot be marked as completed before it starts.',
  },
  MEETING_CANCELLED_CANNOT_COMPLETE: {
    bn: 'বাতিল সভা সম্পন্ন হিসেবে চিহ্নিত করা যাবে না।',
    en: 'A cancelled meeting cannot be marked as completed.',
  },
  TIME_CONFLICT_BLOCKING: {
    bn: 'আয়োজক একই সময়ে আরেকটি সভার আয়োজক বা সভাপতি।',
    en: 'The organizer is already the organizer or chair of another meeting at this time.',
  },
  TIME_CONFLICT_CHAIR_BLOCKING: {
    bn: 'সভাপতি একই সময়ে আরেকটি সভার আয়োজক বা সভাপতি।',
    en: 'The chair is already the organizer or chair of another meeting at this time.',
  },
  SCOPE_ALL_ADMIN_ONLY: {
    bn: 'সব সভা দেখার অনুমতি শুধু প্রশাসকের আছে।',
    en: 'Only administrators may view all meetings.',
  },
  ONE_CHAIR: {
    bn: 'সভাপতি একজনই হতে পারেন: একজন কর্মকর্তা অথবা একজন অতিথি কর্মকর্তা।',
    en: 'A meeting can have only one president: one officer or one guest officer.',
  },
  GUEST_DUPLICATE_EMAIL: {
    bn: 'একই Email ({email}) একাধিক অতিথি কর্মকর্তার জন্য দেওয়া যাবে না।',
    en: 'The same email ({email}) cannot be used for more than one guest officer.',
  },
  GUEST_IS_OFFICER: {
    bn: '{email} ঠিকানাটি কর্মকর্তা {nameBn}-এর। তাঁকে অতিথি কর্মকর্তা হিসেবে না দিয়ে অংশগ্রহণকারী তালিকা থেকে নির্বাচন করুন।',
    en: 'The address {email} belongs to the officer {nameBn}. Select them from the participant list instead of adding them as a guest officer.',
  },
  DECISION_FORBIDDEN: {
    bn: 'শুধু সভার সংশ্লিষ্ট কর্মকর্তা অথবা প্রশাসক সভা কার্যবিবরণী দেখতে পারেন।',
    en: 'Only the officers of this meeting or an administrator can see its minutes.',
  },
  DECISION_UPLOAD_FORBIDDEN: {
    bn: 'শুধু সভার আয়োজক, সভাপতি ও সদস্য সভা কার্যবিবরণী Upload করতে পারেন।',
    en: 'Only the organizer, the president and the members of the meeting can upload minutes.',
  },
  DECISION_NOT_STARTED: {
    bn: 'সভা শুরু হওয়ার আগে কার্যবিবরণী Upload করা যাবে না।',
    en: 'Minutes cannot be uploaded before the meeting starts.',
  },
  DECISION_CANCELLED: {
    bn: 'বাতিল সভার কার্যবিবরণী Upload করা যাবে না।',
    en: 'Minutes cannot be uploaded for a cancelled meeting.',
  },
  DECISION_FILE_MISSING: {
    bn: 'অন্তত একটি ফাইল নির্বাচন করুন (ফিল্ডের নাম: files)।',
    en: 'Select at least one file (field name: files).',
  },
  DECISION_FILE_BAD_TYPE: {
    bn: '"{name}" ফাইলটি গ্রহণ করা যায়নি: শুধু PDF, DOCX, JPEG অথবা PNG ফাইল Upload করা যাবে।',
    en: 'The file "{name}" was not accepted: only PDF, DOCX, JPEG or PNG files can be uploaded.',
  },
  DECISION_FILE_UNREADABLE: {
    bn: '"{name}" ফাইলটি পড়া যায়নি: ফাইলটি নষ্ট অথবা আসল PDF, DOCX বা ছবি নয়।',
    en: 'The file "{name}" could not be read: it is damaged or not a real PDF, DOCX or image.',
  },
  DECISION_FILE_MACRO: {
    bn: '"{name}" ফাইলটি গ্রহণ করা যায়নি: Macro-যুক্ত Word ফাইল Upload করা যাবে না।',
    en: 'The file "{name}" was not accepted: Word files with macros cannot be uploaded.',
  },
  DECISION_FILE_TOO_LARGE: {
    bn: 'প্রতিটি ফাইল সর্বোচ্চ ১০ MB হতে পারে।',
    en: 'Each file can be at most 10 MB.',
  },
  DECISION_TOO_MANY_FILES: {
    bn: 'একটি সভায় সর্বোচ্চ ১০টি কার্যবিবরণী ফাইল রাখা যায়।',
    en: 'A meeting can have at most 10 minutes files.',
  },
  DECISION_FILE_NOT_FOUND: {
    bn: 'কার্যবিবরণী ফাইলটি পাওয়া যায়নি।',
    en: 'The minutes file was not found.',
  },
  DECISION_DELETE_FORBIDDEN: {
    bn: 'শুধু ফাইলটি যিনি Upload করেছেন, সভার আয়োজক অথবা সভাপতি এটি মুছতে পারেন।',
    en: 'Only the person who uploaded the file, the organizer or the president of the meeting can delete it.',
  },
  NOTICE_FORBIDDEN: {
    bn: 'শুধু সভার সংশ্লিষ্ট কর্মকর্তা অথবা প্রশাসক এই সভার নোটিশ দেখতে পারেন।',
    en: 'Only the officers of this meeting or an administrator can see its notice.',
  },
  NOTICE_CHANGE_FORBIDDEN: {
    bn: 'শুধু সভার আয়োজক সভার নোটিশ Upload, পরিবর্তন বা মুছে ফেলতে পারেন।',
    en: 'Only the organizer of the meeting can upload, replace or remove its notice.',
  },
  NOTICE_CANCELLED: {
    bn: 'বাতিল সভার নোটিশ Upload, পরিবর্তন বা মুছে ফেলা যাবে না।',
    en: 'The notice of a cancelled meeting cannot be uploaded, replaced or removed.',
  },
  NOTICE_FILE_MISSING: {
    bn: 'একটি ফাইল নির্বাচন করুন (ফিল্ডের নাম: file)।',
    en: 'Select a file (field name: file).',
  },
  NOTICE_FILE_TOO_LARGE: {
    bn: 'সভার নোটিশ ফাইল সর্বোচ্চ ১০ MB হতে পারে।',
    en: 'The meeting notice file can be at most 10 MB.',
  },
  NOTICE_NOT_FOUND: {
    bn: 'এই সভার কোনো নোটিশ ফাইল নেই।',
    en: 'This meeting has no notice file.',
  },
  ATTACHMENT_FORBIDDEN: {
    bn: 'শুধু সভার সংশ্লিষ্ট কর্মকর্তা অথবা প্রশাসক এই সভার সংযুক্তি দেখতে পারেন।',
    en: 'Only the officers of this meeting or an administrator can see its attachments.',
  },
  ATTACHMENT_CHANGE_FORBIDDEN: {
    bn: 'শুধু সভার আয়োজক সংযুক্তি যোগ করতে বা বাদ দিতে পারেন।',
    en: 'Only the organizer of the meeting can add or remove attachments.',
  },
  ATTACHMENT_CANCELLED: {
    bn: 'বাতিল সভায় সংযুক্তি যোগ করা বা বাদ দেওয়া যাবে না।',
    en: 'Attachments of a cancelled meeting cannot be added or removed.',
  },
  ATTACHMENT_FILE_TOO_LARGE: {
    bn: 'প্রতিটি সংযুক্তি সর্বোচ্চ ১০ MB হতে পারে।',
    en: 'Each attachment can be at most 10 MB.',
  },
  ATTACHMENT_TOO_MANY: {
    bn: 'সর্বোচ্চ ৫টি সংযুক্তি যোগ করা যায়।',
    en: 'You can add up to 5 attachments.',
  },
  ATTACHMENT_NOT_FOUND: {
    bn: 'সংযুক্তিটি পাওয়া যায়নি।',
    en: 'The attachment was not found.',
  },
  ATTACHMENT_NAME_REQUIRED: {
    bn: 'ফাইলের নাম লিখুন।',
    en: 'Enter a file name.',
  },
  ATTACHMENT_NAME_TOO_LONG: {
    bn: 'ফাইলের নাম সর্বোচ্চ ১৫০ অক্ষরের হতে পারে।',
    en: 'The file name can be at most 150 characters.',
  },
  DECISION_STATUS_INVALID: {
    bn: 'status PENDING অথবা COMPLETE হতে হবে।',
    en: 'status must be PENDING or COMPLETE.',
  },
  DECISION_AS_INVALID: {
    bn: 'as lead অথবা member হতে হবে।',
    en: 'as must be lead or member.',
  },
  INLINE_INVALID: {
    bn: 'inline true অথবা false হতে হবে।',
    en: 'inline must be true or false.',
  },
  NOTIFICATION_NOT_FOUND: {
    bn: 'Notification-টি পাওয়া যায়নি।',
    en: 'Notification not found.',
  },
  VERIFY_TOKEN_REQUIRED: {
    bn: 'যাচাই টোকেন দিন।',
    en: 'Enter the verification token.',
  },
  VERIFY_LINK_INVALID: {
    bn: 'যাচাই Link-টি অবৈধ।',
    en: 'The verification link is invalid.',
  },
  PHOTO_MISSING: {
    bn: 'একটি ছবি ফাইল নির্বাচন করুন (ফিল্ডের নাম: file)।',
    en: 'Select a photo file (field name: file).',
  },
  PHOTO_BAD_TYPE: {
    bn: 'শুধু JPEG, PNG অথবা WebP ছবি Upload করা যাবে।',
    en: 'Only JPEG, PNG or WebP photos can be uploaded.',
  },
  PHOTO_UNREADABLE: {
    bn: 'ছবিটি পড়া যায়নি। ফাইলটি নষ্ট অথবা আসল ছবি নয়।',
    en: 'The photo could not be read. The file is damaged or not a real image.',
  },
  PHOTO_TOO_LARGE: {
    bn: 'ছবির আকার সর্বোচ্চ {mb} MB হতে পারে।',
    en: 'The photo can be at most {mb} MB.',
  },
  PHOTO_TOO_MANY_FILES: {
    bn: 'একবারে শুধু একটি ছবি Upload করা যাবে।',
    en: 'Only one photo can be uploaded at a time.',
  },
  PHOTO_REMOVED: {
    bn: 'Profile ছবি মুছে ফেলা হয়েছে।',
    en: 'The profile photo has been removed.',
  },
  PROFILE_WING_INACTIVE: {
    bn: 'নির্বাচিত উইংটি Inactive অথবা পাওয়া যায়নি।',
    en: 'The selected wing is inactive or was not found.',
  },
  SUPER_ADMIN_NO_WING: {
    bn: 'Super Admin একটি সিস্টেম অ্যাকাউন্ট; এতে উইং দেওয়া যাবে না।',
    en: 'The Super Admin is a system account; it cannot have a wing.',
  },
  FIELD_REQUIRED: {
    bn: '{field} খালি রাখা যাবে না।',
    en: '{field} cannot be empty.',
  },
  SAME_NOTIFICATION_EMAIL: {
    bn: 'এটিই আপনার বর্তমান Notification Email।',
    en: 'This is already your notification email.',
  },
  NOTIFICATION_EMAIL_REQUESTED: {
    bn: 'নতুন ঠিকানায় একটি যাচাই Link পাঠানো হয়েছে। Link-এ ক্লিক না করা পর্যন্ত আগের ঠিকানাতেই Email যাবে।',
    en: 'A verification link has been sent to the new address. Until you click it, email keeps going to the old address.',
  },
  NOTIFICATION_EMAIL_VERIFIED: {
    bn: 'Notification Email সফলভাবে পরিবর্তন করা হয়েছে।',
    en: 'The notification email has been changed.',
  },
  INVALID_VERIFY_TOKEN: {
    bn: 'যাচাই Link-টি অবৈধ, ইতিমধ্যে ব্যবহৃত অথবা মেয়াদোত্তীর্ণ।',
    en: 'The verification link is invalid, already used or expired.',
  },
  PHONE_INVALID: {
    bn: 'সঠিক Phone নম্বর দিন (শুধু সংখ্যা, +, স্পেস বা -)।',
    en: 'Enter a valid phone number (digits, +, spaces or - only).',
  },
  MOBILE_INVALID: {
    bn: 'সঠিক Mobile নম্বর দিন (যেমন 01712345678)।',
    en: 'Enter a valid mobile number (for example 01712345678).',
  },
  LOGIN_EMAIL_INVALID: {
    bn: 'সঠিক Login Email দিন।',
    en: 'Enter a valid login email.',
  },
  NOTIFICATION_EMAIL_INVALID: {
    bn: 'সঠিক Notification Email দিন।',
    en: 'Enter a valid notification email.',
  },
  NAME_BN_TOO_LONG: {
    bn: 'বাংলা নাম সর্বোচ্চ ২০০ অক্ষরের হতে পারে।',
    en: 'The Bangla name can have at most 200 characters.',
  },
  NAME_EN_TOO_LONG: {
    bn: 'ইংরেজি নাম সর্বোচ্চ ২০০ অক্ষরের হতে পারে।',
    en: 'The English name can have at most 200 characters.',
  },
  DESIGNATION_INVALID: {
    bn: 'সঠিক পদবি নির্বাচন করুন।',
    en: 'Select a valid designation.',
  },
  REMARK_NOT_STRING: {
    bn: 'পদবির মন্তব্য লেখা হতে হবে।',
    en: 'The designation remark must be text.',
  },
  REMARK_TOO_LONG: {
    bn: 'পদবির মন্তব্য সর্বোচ্চ ১০০ অক্ষরের হতে পারে।',
    en: 'The designation remark can have at most 100 characters.',
  },
  WING_INVALID: {
    bn: 'সঠিক উইং নির্বাচন করুন।',
    en: 'Select a valid wing.',
  },
  PHONE_TOO_LONG: {
    bn: 'Phone নম্বর খুব দীর্ঘ।',
    en: 'The phone number is too long.',
  },
  FAX_TOO_LONG: {
    bn: 'Fax নম্বর খুব দীর্ঘ।',
    en: 'The fax number is too long.',
  },
  ORGANIZATION_NOT_STRING: {
    bn: 'প্রতিষ্ঠানের নাম লেখা হতে হবে।',
    en: 'The organization name must be text.',
  },
  ORGANIZATION_TOO_LONG: {
    bn: 'প্রতিষ্ঠানের নাম খুব দীর্ঘ।',
    en: 'The organization name is too long.',
  },
  BCS_BATCH_NOT_STRING: {
    bn: 'বিসিএস ব্যাচ লেখা হতে হবে।',
    en: 'The BCS batch must be text.',
  },
  BCS_BATCH_TOO_LONG: {
    bn: 'বিসিএস ব্যাচ খুব দীর্ঘ।',
    en: 'The BCS batch is too long.',
  },
  CHARGES_NOT_ARRAY: {
    bn: 'অতিরিক্ত দায়িত্ব একটি তালিকা হতে হবে।',
    en: 'Additional charges must be a list.',
  },
  CHARGES_MAX: {
    bn: 'সর্বোচ্চ ২০টি অতিরিক্ত দায়িত্ব দেওয়া যাবে।',
    en: 'At most 20 additional charges are allowed.',
  },
  CHARGE_NOT_STRING: {
    bn: 'প্রতিটি অতিরিক্ত দায়িত্ব লেখা হতে হবে।',
    en: 'Each additional charge must be text.',
  },
  CHARGE_TOO_LONG: {
    bn: 'প্রতিটি অতিরিক্ত দায়িত্ব সর্বোচ্চ ৩০০ অক্ষরের হতে পারে।',
    en: 'Each additional charge can have at most 300 characters.',
  },
  ROLE_INVALID: {
    bn: 'ভূমিকা ADMIN অথবা OFFICER হতে হবে।',
    en: 'role must be ADMIN or OFFICER.',
  },
  SEARCH_TOO_LONG: {
    bn: 'খোঁজার শব্দ খুব দীর্ঘ।',
    en: 'The search text is too long.',
  },
  WING_ID_INVALID: {
    bn: 'অবৈধ উইং আইডি।',
    en: 'Invalid wing ID.',
  },
  DESIGNATION_ID_INVALID: {
    bn: 'অবৈধ পদবি আইডি।',
    en: 'Invalid designation ID.',
  },
  ROLE_FILTER_VALUE_INVALID: {
    bn: 'অবৈধ ভূমিকা।',
    en: 'Invalid role.',
  },
  PASSWORD_IS_DEFAULT_BOOLEAN: {
    bn: 'passwordIsDefault true অথবা false হতে হবে।',
    en: 'passwordIsDefault must be true or false.',
  },
  SORT_BY_INVALID: {
    bn: 'অবৈধ sortBy মান।',
    en: 'Invalid sortBy value.',
  },
  SORT_ORDER_INVALID: {
    bn: 'sortOrder asc অথবা desc হতে হবে।',
    en: 'sortOrder must be asc or desc.',
  },
  USER_NOT_FOUND: {
    bn: 'কর্মকর্তা পাওয়া যায়নি।',
    en: 'Officer not found.',
  },
  DUPLICATE_LOGIN_EMAIL: {
    bn: 'এই Login Email দিয়ে আগে থেকেই একটি অ্যাকাউন্ট আছে।',
    en: 'An account with this login email already exists.',
  },
  SUPER_ADMIN_PROTECTED: {
    bn: 'Super Admin অ্যাকাউন্ট শুধু Super Admin নিজেই পরিবর্তন করতে পারেন।',
    en: 'Only the Super Admin can change the Super Admin account.',
  },
  SUPER_ADMIN_STATUS_ROLE: {
    bn: 'Super Admin-কে Inactive করা বা তার ভূমিকা পরিবর্তন করা যাবে না।',
    en: 'The Super Admin cannot be deactivated and its role cannot be changed.',
  },
  SUPER_ADMIN_NO_DESIGNATION: {
    bn: 'Super Admin একটি সিস্টেম অ্যাকাউন্ট; এতে পদবি বা উইং দেওয়া যাবে না।',
    en: 'The Super Admin is a system account; it cannot have a designation or a wing.',
  },
  SELF_DEACTIVATE: {
    bn: 'আপনি নিজের অ্যাকাউন্ট Inactive করতে পারবেন না।',
    en: 'You cannot deactivate your own account.',
  },
  SELF_ROLE_CHANGE: {
    bn: 'আপনি নিজের ভূমিকা (role) পরিবর্তন করতে পারবেন না।',
    en: 'You cannot change your own role.',
  },
  USER_DESIGNATION_NOT_FOUND: {
    bn: 'নির্বাচিত পদবিটি পাওয়া যায়নি।',
    en: 'The selected designation was not found.',
  },
  USER_DESIGNATION_INACTIVE: {
    bn: 'নির্বাচিত পদবিটি Inactive।',
    en: 'The selected designation is inactive.',
  },
  USER_WING_NOT_FOUND: {
    bn: 'নির্বাচিত উইংটি পাওয়া যায়নি।',
    en: 'The selected wing was not found.',
  },
  USER_WING_INACTIVE: {
    bn: 'নির্বাচিত উইংটি Inactive।',
    en: 'The selected wing is inactive.',
  },
  RESET_INACTIVE: {
    bn: 'Inactive অ্যাকাউন্টের Password Reset করা যাবে না। আগে অ্যাকাউন্টটি Active করুন।',
    en: 'The password of an inactive account cannot be reset. Activate the account first.',
  },
  PASSWORD_RESET_DONE: {
    bn: 'Password Default Password-এ Reset করা হয়েছে, সব Session বন্ধ করা হয়েছে এবং কর্মকর্তাকে Email-এ জানানো হয়েছে।',
    en: 'The password has been reset to the default password, all sessions have ended and the officer has been informed by email.',
  },
  WING_NOT_FOUND: {
    bn: 'উইংটি পাওয়া যায়নি।',
    en: 'Wing not found.',
  },
  WING_DUPLICATE_NAME: {
    bn: 'এই ইংরেজি নামে একটি উইং আগে থেকেই আছে।',
    en: 'A wing with this English name already exists.',
  },
  WING_IN_USE: {
    bn: 'এই উইংটি {count} জন কর্মকর্তার সাথে যুক্ত, তাই মুছে ফেলা যাবে না। প্রয়োজনে উইংটি Inactive করুন।',
    en: 'This wing is assigned to {count} officers, so it cannot be deleted. Deactivate it if needed.',
  },
  WING_IN_USE_GENERIC: {
    bn: 'এই উইংটি কর্মকর্তাদের সাথে যুক্ত, তাই মুছে ফেলা যাবে না। প্রয়োজনে উইংটি Inactive করুন।',
    en: 'This wing is assigned to officers, so it cannot be deleted. Deactivate it if needed.',
  },
  FROM_INVALID: {
    bn: 'from সঠিক ISO 8601 সময় হতে হবে।',
    en: 'from must be a valid ISO 8601 time.',
  },
  PERIOD_INVALID: {
    bn: 'period day, week, month অথবা year হতে হবে। fiscal-year আর সমর্থিত নয়।',
    en: 'period must be day, week, month or year. fiscal-year is no longer supported.',
  },
  MAIL_STATUS_INVALID: {
    bn: 'status PENDING, SENT অথবা FAILED হতে হবে।',
    en: 'status must be PENDING, SENT or FAILED.',
  },
  TO_INVALID: {
    bn: 'to সঠিক ISO 8601 সময় হতে হবে।',
    en: 'to must be a valid ISO 8601 time.',
  },
  UNREAD_INVALID: {
    bn: 'unread true অথবা false হতে হবে।',
    en: 'unread must be true or false.',
  },
  AUDIT_ACTION_INVALID: {
    bn: 'অবৈধ action।',
    en: 'Invalid action.',
  },
  AUDIT_ACTOR_INVALID: {
    bn: 'অবৈধ actorId।',
    en: 'Invalid actorId.',
  },
  DATE_FORMAT_EXAMPLE: {
    bn: 'তারিখ YYYY-MM-DD আকারে দিন (যেমন 2026-12-01)।',
    en: 'Enter the date as YYYY-MM-DD (e.g. 2026-12-01).',
  },
  PDF_TIMEOUT: {
    bn: 'পিডিএফ তৈরি করতে বেশি সময় লাগছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
    en: 'Creating the PDF is taking too long. Please try again after a while.',
  },
  DATE_INVALID: {
    bn: 'সঠিক তারিখ দিন (YYYY-MM-DD)।',
    en: 'Enter a valid date (YYYY-MM-DD).',
  },
  CHARGE_DUPLICATE: {
    bn: 'একই অতিরিক্ত দায়িত্ব (পদবি ও উইং) দুবার দেওয়া যাবে না।',
    en: 'The same additional charge (designation and wing) cannot be given twice.',
  },
  CHARGE_DESIGNATION_REQUIRED: {
    bn: 'অতিরিক্ত দায়িত্বের পদবি বেছে নিন।',
    en: 'Choose the designation of the additional charge.',
  },
  CHARGE_NOTE_TOO_LONG: {
    bn: 'নোট সর্বোচ্চ ৩০০ অক্ষরের হতে পারে।',
    en: 'The note can be at most 300 characters.',
  },
  CHARGES_NEED_REVIEW_INVALID: {
    bn: 'chargesNeedReview true অথবা false হতে হবে।',
    en: 'chargesNeedReview must be true or false.',
  },
  OFFICE_REPORT_FORBIDDEN: {
    bn: 'অফিস রিপোর্ট দেখার অনুমতি আপনার নেই।',
    en: 'You do not have access to the office report.',
  },
  OFFICE_REPORT_NO_WING: {
    bn: 'আপনার প্রোফাইলে কোনো উইং নেই, তাই অফিস রিপোর্ট দেখানো যাবে না।',
    en: 'Your profile has no wing, so the office report cannot be shown.',
  },
  OFFICE_REPORT_OUT_OF_SCOPE: {
    bn: 'এই তথ্য আপনার অফিস রিপোর্টের আওতার বাইরে।',
    en: 'This is outside your office report scope.',
  },
  OFFICE_REPORT_OFFICER_ID_INVALID: {
    bn: 'অবৈধ কর্মকর্তা আইডি।',
    en: 'Invalid officer id.',
  },
  OFFICE_REPORT_STATUS_INVALID: {
    bn: 'status SCHEDULED, COMPLETED অথবা CANCELLED হতে হবে।',
    en: 'status must be SCHEDULED, COMPLETED or CANCELLED.',
  },
  OFFICE_REPORT_CHAIR_INVALID: {
    bn: 'সভাপতি ফিল্টার সঠিক নয়।',
    en: 'The president filter is not valid.',
  },
  OFFICE_REPORT_ROLE_INVALID: {
    bn: 'role ORGANIZER, CHAIR অথবা MEMBER হতে হবে।',
    en: 'role must be ORGANIZER, CHAIR or MEMBER.',
  },
  OFFICE_REPORT_SCOPE_INVALID: {
    bn: 'অফিস রিপোর্টের অনুমতি NONE, WING অথবা OFFICE হতে হবে।',
    en: 'Office report access must be NONE, WING or OFFICE.',
  },
  RANGE_INCOMPLETE: {
    bn: 'শুরুর তারিখ ও শেষ তারিখ দুটোই দিন।',
    en: 'Enter both the start date and the end date.',
  },
  RANGE_END_BEFORE_START: {
    bn: 'শেষ তারিখ শুরুর তারিখের আগে হতে পারে না।',
    en: 'End date cannot be before start date.',
  },
  RANGE_TOO_LONG: {
    bn: 'সময়কাল সর্বোচ্চ ২ বছর হতে পারে।',
    en: 'The range can be at most 2 years.',
  },
  NAME_EN_LATIN: {
    bn: 'ইংরেজি নাম ইংরেজি (Latin) অক্ষরে লিখুন; বাংলা অক্ষর দেওয়া যাবে না।',
    en: 'Write the English name in Latin letters; Bangla letters are not allowed.',
  },
} as const satisfies Record<string, CatalogEntry>;

export type MessageCode = keyof typeof MESSAGE_CATALOG;

/**
 * Bangla parameter values that have an English form (e.g. the field name in FIELD_REQUIRED).
 * Other parameters (emails, names typed by users) are copied unchanged.
 */
export const PARAM_TRANSLATIONS: Readonly<Record<string, string>> = {
  'বাংলা নাম': 'Name (Bangla)',
  'ইংরেজি নাম': 'Name (English)',
  পদবি: 'Designation',
};
