import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateDesignationDto } from '../../modules/designations/dto/designation.dto';
import { UpdateProfileDto } from '../../modules/profile/dto/profile.dto';
import { CreateWingDto } from '../../modules/wings/dto/wing.dto';
import { lookupMessage } from '../i18n/translate';
import { ENGLISH_NAME_MESSAGE, ENGLISH_NAME_PATTERN } from './english-name';

describe('English names must be Latin text (v1.7)', () => {
  it('accepts names with dots, digits, brackets and hyphens', () => {
    for (const ok of [
      'Md. Rahim Uddin',
      'Deputy Director (Grade 5)',
      "O'Neil-Khan",
      'ICT Wing 2',
    ]) {
      expect(ENGLISH_NAME_PATTERN.test(ok)).toBe(true);
    }
  });

  it('rejects Bangla characters and text without a Latin letter', () => {
    for (const bad of ['রহিম', 'Md. রহিম', '১২৩', '...', '']) {
      expect(ENGLISH_NAME_PATTERN.test(bad)).toBe(false);
    }
  });

  it('is enforced on designations, wings and the profile (and so on officers)', () => {
    const errorsOf = (cls: new () => object, body: object) =>
      validateSync(plainToInstance(cls, body)).flatMap((e) =>
        Object.values(e.constraints ?? {}),
      );
    expect(
      errorsOf(CreateDesignationDto, {
        nameBn: 'উপপরিচালক',
        nameEn: 'উপপরিচালক',
        priority: 5,
      }),
    ).toContain(ENGLISH_NAME_MESSAGE);
    expect(errorsOf(CreateWingDto, { nameBn: 'উইং', nameEn: 'উইং' })).toContain(
      ENGLISH_NAME_MESSAGE,
    );
    expect(errorsOf(UpdateProfileDto, { nameEn: 'রহিম' })).toContain(
      ENGLISH_NAME_MESSAGE,
    );
    expect(errorsOf(UpdateProfileDto, { nameEn: 'Rahim' })).toEqual([]);
  });

  it('has an English translation in the message catalog', () => {
    expect(lookupMessage(ENGLISH_NAME_MESSAGE)?.code).toBe('NAME_EN_LATIN');
  });
});
