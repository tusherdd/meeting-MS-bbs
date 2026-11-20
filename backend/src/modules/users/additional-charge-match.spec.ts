import { matchCharge, type NamedRef } from './additional-charge-match';

const D: NamedRef[] = [
  { id: 'dg', nameBn: 'মহাপরিচালক', nameEn: 'Director General' },
  { id: 'ddg', nameBn: 'উপমহাপরিচালক', nameEn: 'Deputy Director General' },
  { id: 'dir', nameBn: 'পরিচালক', nameEn: 'Director' },
  { id: 'dd', nameBn: 'উপপরিচালক', nameEn: 'Deputy Director' },
  { id: 'so', nameBn: 'পরিসংখ্যান কর্মকর্তা', nameEn: 'Statistical Officer' },
];
const W: NamedRef[] = [
  { id: 'census', nameBn: 'সেন্সাস উইং', nameEn: 'Census Wing' },
  { id: 'sdg', nameBn: 'এসডিজি সেল', nameEn: 'SDG Cell' },
  {
    id: 'dgo',
    nameBn: 'মহাপরিচালকের দপ্তর',
    nameEn: "Director General's Office",
  },
];

describe('matchCharge (v1.16 additional charge migration)', () => {
  it('matched: one designation, optional wing', () => {
    expect(matchCharge('পরিচালক', D, W)).toEqual({
      designationId: 'dir',
      wingId: null,
      needsReview: false,
    });
    expect(matchCharge('পরিচালক (বিকল্প), সেন্সাস উইং', D, W)).toEqual({
      designationId: 'dir',
      wingId: 'census',
      needsReview: false,
    });
    expect(
      matchCharge('Deputy Director General (current charge)', D, W),
    ).toEqual({
      designationId: 'ddg',
      wingId: null,
      needsReview: false,
    });
  });

  it('whole words only: "উপপরিচালক" is never "পরিচালক", "পরিচালকের" is no match', () => {
    expect(matchCharge('উপপরিচালক, সেন্সাস উইং', D, W).designationId).toBe(
      'dd',
    );
    expect(matchCharge('পরিচালকের সহকারী', D, W)).toMatchObject({
      designationId: null,
      needsReview: true,
    });
  });

  it('unmatched → needs review (designation null), a wing alone is kept', () => {
    expect(matchCharge('এসডিজি সেল', D, W)).toEqual({
      designationId: null,
      wingId: 'sdg',
      needsReview: true,
    });
    expect(
      matchCharge('ফোকাল পয়েন্ট কর্মকর্তা, এসডিজি সেল', D, W),
    ).toMatchObject({
      designationId: null,
      needsReview: true,
    });
    expect(matchCharge('', D, W)).toMatchObject({ needsReview: true });
  });

  it('ambiguous → needs review: two designations or two wings', () => {
    expect(matchCharge('পরিচালক ও মহাপরিচালক', D, W)).toMatchObject({
      designationId: null,
      needsReview: true,
    });
    expect(matchCharge('পরিচালক, সেন্সাস উইং ও এসডিজি সেল', D, W)).toEqual({
      designationId: 'dir',
      wingId: null,
      needsReview: true,
    });
  });

  it('a designation name inside a wing name never counts (no accidental office scope)', () => {
    expect(matchCharge("Director General's Office", D, W)).toEqual({
      designationId: null,
      wingId: 'dgo',
      needsReview: true,
    });
    expect(matchCharge('মহাপরিচালকের দপ্তর', D, W)).toMatchObject({
      designationId: null,
      wingId: 'dgo',
    });
  });
});
