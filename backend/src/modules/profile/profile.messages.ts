export const PROFILE_MESSAGES = {
  photoMissing: 'একটি ছবি ফাইল নির্বাচন করুন (ফিল্ডের নাম: file)।',
  photoBadType: 'শুধু JPEG, PNG অথবা WebP ছবি আপলোড করা যাবে।',
  photoUnreadable: 'ছবিটি পড়া যায়নি। ফাইলটি নষ্ট অথবা আসল ছবি নয়।',
  photoTooLarge: (mb: number) => `ছবির আকার সর্বোচ্চ ${mb} MB হতে পারে।`,
  photoTooManyFiles: 'একবারে শুধু একটি ছবি আপলোড করা যাবে।',
  photoRemoved: 'প্রোফাইল ছবি মুছে ফেলা হয়েছে।',
  wingInactive: 'নির্বাচিত উইংটি নিষ্ক্রিয় অথবা পাওয়া যায়নি।',
  superAdminNoWing:
    'সুপার অ্যাডমিন একটি সিস্টেম অ্যাকাউন্ট; এতে উইং দেওয়া যাবে না।',
  fieldRequired: (field: string) => `${field} খালি রাখা যাবে না।`,
  sameNotificationEmail: 'এটিই আপনার বর্তমান নোটিফিকেশন ইমেইল।',
  notificationEmailRequested:
    'নতুন ঠিকানায় একটি যাচাই লিংক পাঠানো হয়েছে। লিংকে ক্লিক না করা পর্যন্ত আগের ঠিকানাতেই ইমেইল যাবে।',
  notificationEmailVerified: 'নোটিফিকেশন ইমেইল সফলভাবে পরিবর্তন করা হয়েছে।',
  invalidVerifyToken:
    'যাচাই লিংকটি অবৈধ, ইতিমধ্যে ব্যবহৃত অথবা মেয়াদোত্তীর্ণ।',
} as const;
