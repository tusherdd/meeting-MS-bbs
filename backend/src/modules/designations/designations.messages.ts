export const DESIGNATION_MESSAGES = {
  notFound: 'পদবিটি পাওয়া যায়নি।',
  duplicateName: 'এই ইংরেজি নামে একটি পদবি আগে থেকেই আছে।',
  inUse: (count: number) =>
    `এই পদবিটি ${count} জন কর্মকর্তার সাথে যুক্ত, তাই মুছে ফেলা যাবে না। প্রয়োজনে পদবিটি Inactive করুন।`,
  inUseGeneric:
    'এই পদবিটি কর্মকর্তাদের সাথে যুক্ত, তাই মুছে ফেলা যাবে না। প্রয়োজনে পদবিটি Inactive করুন।',
} as const;
