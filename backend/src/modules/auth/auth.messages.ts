/** User-facing auth messages (Bangla, CLAUDE.md). */
export const AUTH_MESSAGES = {
  /** Same text for every failed login (known or unknown email), so nothing is revealed. */
  invalidCredentials:
    'Email অথবা Password সঠিক নয়। Password মনে না থাকলে "Password ভুলে গেছেন?" ব্যবহার করে Email-এ Reset Link নিন।',
  accountInactive:
    'আপনার অ্যাকাউন্টটি Inactive করা হয়েছে। প্রশাসকের সাথে যোগাযোগ করুন।',
  loginRequired: 'অনুগ্রহ করে Login করুন।',
  sessionExpired: 'Session-এর মেয়াদ শেষ হয়েছে। অনুগ্রহ করে আবার Login করুন।',
  mustChangePassword:
    'নিরাপত্তার জন্য প্রথমে আপনার Password পরিবর্তন করুন। এর আগে অন্য কোনো কাজ করা যাবে না।',
  forbiddenRole: 'এই কাজটি করার অনুমতি আপনার নেই।',
  badOrigin: 'অনুরোধটি অনুমোদিত উৎস থেকে আসেনি।',
  wrongCurrentPassword: 'বর্তমান Password সঠিক নয়।',
  samePassword: 'নতুন Password বর্তমান Password থেকে আলাদা হতে হবে।',
  passwordChanged: 'Password সফলভাবে পরিবর্তন করা হয়েছে।',
  forgotPasswordSent:
    'Email-টি নিবন্ধিত থাকলে Password Reset-এর Link পাঠানো হয়েছে। অনুগ্রহ করে Email দেখুন।',
  invalidResetToken:
    'Reset Link-টি অবৈধ অথবা মেয়াদোত্তীর্ণ। নতুন Link-এর জন্য আবার অনুরোধ করুন।',
  passwordReset: 'Password Reset হয়েছে। নতুন Password দিয়ে Login করুন।',
  passwordSet:
    'Password সেট হয়েছে। এখন Login Email ও এই Password দিয়ে Login করুন।',
  loggedOut: 'আপনি Logout করেছেন।',
} as const;
