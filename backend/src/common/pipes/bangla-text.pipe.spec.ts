import { BANGLA_NUKTA } from '../utils/bangla';
import { BanglaTextPipe } from './bangla-text.pipe';

const { YYA, YA_NUKTA, DDA_NUKTA, RRA } = BANGLA_NUKTA;

describe('BanglaTextPipe', () => {
  const pipe = new BanglaTextPipe();

  it('normalises request bodies and query strings', () => {
    expect(
      pipe.transform(
        { title: `সম${YYA}`, password: `x${YYA}` },
        { type: 'body' },
      ),
    ).toEqual({ title: `সম${YA_NUKTA}`, password: `x${YYA}` });
    expect(pipe.transform({ q: `ব${DDA_NUKTA}` }, { type: 'query' })).toEqual({
      q: `ব${RRA}`,
    });
    // A single query value (@Query('q')) is normalised too.
    expect(pipe.transform(`ব${DDA_NUKTA}`, { type: 'query', data: 'q' })).toBe(
      `ব${RRA}`,
    );
  });

  it('leaves route params and secret single values alone', () => {
    expect(pipe.transform(`ব${DDA_NUKTA}`, { type: 'param' })).toBe(
      `ব${DDA_NUKTA}`,
    );
    expect(
      pipe.transform(`x${YYA}`, { type: 'body', data: 'newPassword' }),
    ).toBe(`x${YYA}`);
  });
});
