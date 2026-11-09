/**
 * Fixed seed data from SPEC.md. Designations are upserted by nameEn; on re-run the priority of
 * an existing designation is updated to match this table (SPEC.md §6.1).
 */

export interface DesignationSeed {
  nameBn: string;
  nameEn: string;
  priority: number;
}

export interface WingSeed {
  nameBn: string;
  nameEn: string;
}

/** SPEC.md §6.1 — lower number = higher priority. */
export const DESIGNATIONS: readonly DesignationSeed[] = [
  { priority: 1, nameBn: 'সচিব', nameEn: 'Secretary' },
  { priority: 2, nameBn: 'মহাপরিচালক', nameEn: 'Director General' },
  { priority: 3, nameBn: 'উপমহাপরিচালক', nameEn: 'Deputy Director General' },
  { priority: 4, nameBn: 'পরিচালক', nameEn: 'Director' },
  { priority: 5, nameBn: 'যুগ্মপরিচালক', nameEn: 'Joint Director' },
  { priority: 5, nameBn: 'সিস্টেম এনালিস্ট', nameEn: 'System Analyst' },
  { priority: 5, nameBn: 'সিনিয়র প্রোগ্রামার', nameEn: 'Senior Programmer' },
  { priority: 6, nameBn: 'উপপরিচালক', nameEn: 'Deputy Director' },
  {
    priority: 6,
    nameBn: 'মেইন্টেন্যান্স ইঞ্জিনিয়ার',
    nameEn: 'Maintenance Engineer',
  },
  { priority: 6, nameBn: 'প্রোগ্রামার', nameEn: 'Programmer' },
  {
    priority: 7,
    nameBn: 'পরিসংখ্যান কর্মকর্তা',
    nameEn: 'Statistical Officer',
  },
  { priority: 7, nameBn: 'সহকারী প্রোগ্রামার', nameEn: 'Assistant Programmer' },
  { priority: 7, nameBn: 'কার্টোগ্রাফার', nameEn: 'Cartographer' },
  {
    priority: 7,
    nameBn: 'গ্রাফিক রিপ্রোডাকশন অফিসার',
    nameEn: 'Graphic Reproduction Officer',
  },
  { priority: 7, nameBn: 'স্টাফ অফিসার', nameEn: 'Staff Officer' },
];

/**
 * Cells seeded as wings in addition to the CSV wings (SPEC.md §11.2).
 * Bangla names are exactly as written in the CSV's additional_charges column.
 */
export const EXTRA_WINGS: readonly WingSeed[] = [
  {
    nameEn: 'ECDS Cell',
    nameBn:
      'এনভায়রনমেন্ট, ক্লাইমেট চেঞ্জ অ্যান্ড ডিজাস্টার স্ট্যাটিস্টিকস (ইসিডিএস) সেল',
  },
  { nameEn: 'SDG Cell', nameBn: 'এসডিজি সেল' },
  {
    nameEn: 'Planning and Development Cell',
    nameBn: 'প্ল্যানিং অ্যান্ড ডেভেলপমেন্ট সেল',
  },
  { nameEn: 'R&D Cell', nameBn: 'রিসার্চ অ্যান্ড ডেভেলপমেন্ট (আরএন্ডডি) সেল' },
  {
    nameEn: 'PLS Cell',
    nameBn: 'পোভার্টি অ্যান্ড লাইভলিহুড স্ট্যাটিসটিকস (পিএলএস) সেল',
  },
];

/** Display name of the super admin system account (it is not an officer). */
export const SUPER_ADMIN_NAME = {
  nameBn: 'সুপার অ্যাডমিন',
  nameEn: 'Super Admin',
};
