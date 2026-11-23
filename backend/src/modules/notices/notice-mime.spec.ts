import type { EntityManager } from 'typeorm';
import { noticeMimes } from './notice-mime';

describe('noticeMimes (v1.17)', () => {
  const manager = (rows: Array<{ meetingId: string; mime: string }>) => {
    const find = jest.fn().mockResolvedValue(rows);
    return {
      find,
      manager: {
        getRepository: () => ({ find }),
      } as unknown as EntityManager,
    };
  };

  it('no ids → no query, empty map', async () => {
    const m = manager([]);
    expect((await noticeMimes(m.manager, [])).size).toBe(0);
    expect(m.find).not.toHaveBeenCalled();
  });

  it('maps meeting id → mime, one query for unique ids', async () => {
    const m = manager([
      { meetingId: 'a', mime: 'application/pdf' },
      {
        meetingId: 'b',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ]);
    const map = await noticeMimes(m.manager, ['a', 'b', 'a']);
    expect(m.find).toHaveBeenCalledTimes(1);
    expect(map.get('a')).toBe('application/pdf');
    expect(map.get('b')).toMatch(/wordprocessingml/);
    expect(map.has('c')).toBe(false);
  });
});
