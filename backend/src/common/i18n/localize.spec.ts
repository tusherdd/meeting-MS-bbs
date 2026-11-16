import { BadRequestException, StreamableFile } from '@nestjs/common';
import {
  localizeErrorBody,
  toErrorBody,
} from '../filters/all-exceptions.filter';
import { localizeSuccessBody } from '../interceptors/message-language.interceptor';
import { MESSAGE_CATALOG } from './message-catalog';
import { requestLanguage, resolveApiLanguage } from './translate';

describe('API language of responses (v1.6)', () => {
  it('Accept-Language: missing or unknown → bn; en / en-* → en', () => {
    expect(resolveApiLanguage(undefined)).toBe('bn');
    expect(resolveApiLanguage('')).toBe('bn');
    expect(resolveApiLanguage('fr')).toBe('bn');
    expect(resolveApiLanguage('bn')).toBe('bn');
    expect(resolveApiLanguage('en')).toBe('en');
    expect(resolveApiLanguage('EN-gb,en;q=0.8')).toBe('en');
    expect(resolveApiLanguage(['en'])).toBe('en');
  });

  it('X-Lang wins over Accept-Language (WebKit overwrites Accept-Language)', () => {
    expect(
      requestLanguage({ 'x-lang': 'en', 'accept-language': 'bn-BD' }),
    ).toBe('en');
    expect(
      requestLanguage({ 'x-lang': 'bn', 'accept-language': 'en-US' }),
    ).toBe('bn');
    expect(requestLanguage({ 'x-lang': 'fr', 'accept-language': 'en' })).toBe(
      'en',
    );
    expect(requestLanguage({})).toBe('bn');
  });

  it('error bodies: translated message + code; lists get codes; unknown text keeps HTTP_<status>', () => {
    const one = toErrorBody(
      new BadRequestException(MESSAGE_CATALOG.INVALID_ID.bn),
      true,
    );
    expect(localizeErrorBody(one, 'en')).toMatchObject({
      message: 'Invalid ID.',
      code: 'INVALID_ID',
    });
    expect(localizeErrorBody(one, 'bn')).toMatchObject({
      message: MESSAGE_CATALOG.INVALID_ID.bn,
      code: 'INVALID_ID',
    });
    const list = toErrorBody(
      new BadRequestException([MESSAGE_CATALOG.PAGE_MIN.bn, 'something else']),
      true,
    );
    expect(localizeErrorBody(list, 'en')).toMatchObject({
      message: ['page must be at least 1.', 'something else'],
      code: 'PAGE_MIN',
      codes: ['PAGE_MIN', 'HTTP_400'],
    });
  });

  it('success bodies: only a catalog `message` is translated; files pass through', () => {
    expect(
      localizeSuccessBody({ message: MESSAGE_CATALOG.LOGGED_OUT.bn }, 'en'),
    ).toEqual({
      message: MESSAGE_CATALOG.LOGGED_OUT.en,
      code: 'LOGGED_OUT',
    });
    const data = { message: 'ব্যবহারকারীর লেখা', title: 'সভা' };
    expect(localizeSuccessBody(data, 'en')).toBe(data);
    const file = new StreamableFile(Buffer.from('%PDF-'));
    expect(localizeSuccessBody(file, 'en')).toBe(file);
    expect(localizeSuccessBody([1, 2], 'en')).toEqual([1, 2]);
  });
});
