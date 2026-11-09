import { escapeLike } from './sql';

describe('escapeLike', () => {
  it('escapes wildcards and backslashes', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('leaves normal text alone', () => {
    expect(escapeLike('Rahim রহিম')).toBe('Rahim রহিম');
  });
});
