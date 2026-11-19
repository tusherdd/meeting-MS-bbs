export const MEETING_MESSAGES = {
  notFound: 'সভাটি পাওয়া যায়নি।',
  endBeforeStart: 'শেষের সময় অবশ্যই শুরুর সময়ের পরে হতে হবে।',
  tooLong: 'একটি সভা সর্বোচ্চ ১২ ঘণ্টার হতে পারে।',
  inPast: 'অতীতের সময়ে সভা তৈরি বা সরানো যাবে না।',
  superAdminOrganize:
    'Super Admin একটি সিস্টেম অ্যাকাউন্ট; এটি সভা আয়োজন করতে পারে না।',
  superAdminInvite:
    'Super Admin একটি সিস্টেম অ্যাকাউন্ট; একে সভায় আমন্ত্রণ জানানো যাবে না।',
  peopleInvalid: 'নির্বাচিত ব্যক্তিদের মধ্যে কেউ Inactive অথবা পাওয়া যায়নি।',
  organizerNoDesignation: 'আপনার কোনো পদবি নেই, তাই সভা আয়োজন করা যাবে না।',
  notOrganizer: 'শুধু সভার আয়োজক অথবা প্রশাসক এই কাজটি করতে পারেন।',
  /** v1.10: edit and cancel are also allowed for the internal chair. */
  notOrganizerOrChair:
    'শুধু সভার আয়োজক, সভাপতি অথবা প্রশাসক এই কাজটি করতে পারেন।',
  /** v1.10: the meeting notice PDF. */
  noticeForbidden:
    'শুধু সভার সংশ্লিষ্ট কর্মকর্তা অথবা প্রশাসক এই সভার নোটিশ নিতে পারেন।',
  noticeCancelled: 'বাতিল সভার নোটিশ তৈরি করা যাবে না।',
  notScheduled: 'বাতিল বা সম্পন্ন সভা পরিবর্তন করা যাবে না।',
  alreadyEnded:
    'সভাটি ইতিমধ্যে শেষ হয়েছে; শুধু সম্পন্ন হিসেবে চিহ্নিত করে নোট যোগ করা যাবে।',
  notStartedYet: 'সভা শুরু হওয়ার আগে সম্পন্ন হিসেবে চিহ্নিত করা যাবে না।',
  cancelledCannotComplete: 'বাতিল সভা সম্পন্ন হিসেবে চিহ্নিত করা যাবে না।',
  /** v1.12: the only blocking rule — the organizer's own schedule (SPEC.md §6.4). */
  blocking: 'আয়োজক একই সময়ে আরেকটি সভার আয়োজক বা সভাপতি।',
  hiddenTitle: 'অন্য একটি সভা',
  /** v1.9: the venue (স্থান, field `room`) is required on create and edit. */
  venueRequired: 'স্থান লিখতে হবে।',
  venueTooLong: 'স্থান সর্বোচ্চ ১০০ অক্ষরের হতে পারে।',
  scopeAllAdminOnly: 'সব সভা দেখার অনুমতি শুধু প্রশাসকের আছে।',
  oneChair: 'সভাপতি একজনই হতে পারেন: একজন কর্মকর্তা অথবা একজন অতিথি কর্মকর্তা।',
  guestDuplicateEmail: (email: string) =>
    `একই Email (${email}) একাধিক অতিথি কর্মকর্তার জন্য দেওয়া যাবে না।`,
  guestIsOfficer: (email: string, nameBn: string) =>
    `${email} ঠিকানাটি কর্মকর্তা ${nameBn}-এর। তাঁকে অতিথি কর্মকর্তা হিসেবে না দিয়ে অংশগ্রহণকারী তালিকা থেকে নির্বাচন করুন।`,
} as const;
