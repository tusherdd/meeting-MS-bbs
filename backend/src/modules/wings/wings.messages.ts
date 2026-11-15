export const WING_MESSAGES = {
  notFound: 'উইংটি পাওয়া যায়নি।',
  duplicateName: 'এই ইংরেজি নামে একটি উইং আগে থেকেই আছে।',
  inUse: (count: number) =>
    `এই উইংটি ${count} জন কর্মকর্তার সাথে যুক্ত, তাই মুছে ফেলা যাবে না। প্রয়োজনে উইংটি Inactive করুন।`,
  inUseGeneric:
    'এই উইংটি কর্মকর্তাদের সাথে যুক্ত, তাই মুছে ফেলা যাবে না। প্রয়োজনে উইংটি Inactive করুন।',
} as const;
