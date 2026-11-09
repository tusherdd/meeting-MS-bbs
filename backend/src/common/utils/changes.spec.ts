import { pickChanges } from './changes';

describe('pickChanges', () => {
  const current = {
    name: 'A',
    priority: 6,
    remark: null as string | null,
    tags: ['x'],
  };

  it('returns only changed fields with old and new values', () => {
    expect(
      pickChanges(current, { name: 'A', priority: 5, remark: 'চলতি দায়িত্ব' }),
    ).toEqual({
      before: { priority: 6, remark: null },
      after: { priority: 5, remark: 'চলতি দায়িত্ব' },
    });
  });

  it('ignores undefined and equal arrays', () => {
    expect(pickChanges(current, { name: undefined, tags: ['x'] })).toBeNull();
  });

  it('detects changed arrays', () => {
    expect(pickChanges(current, { tags: ['x', 'y'] })).toEqual({
      before: { tags: ['x'] },
      after: { tags: ['x', 'y'] },
    });
  });
});
