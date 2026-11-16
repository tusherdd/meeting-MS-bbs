import { Matches } from 'class-validator';

/**
 * v1.7 (SPEC.md §13.15): an English value (officer, designation or wing name) must be Latin
 * text: at least one Latin letter and no Bangla character. Dots, hyphens, brackets, digits and
 * spaces are fine ("Md. Rahim Uddin", "Deputy Director (Grade 5)").
 */
export const ENGLISH_NAME_PATTERN = /^[^ঀ-৿]*[A-Za-z][^ঀ-৿]*$/;

export const ENGLISH_NAME_MESSAGE =
  'ইংরেজি নাম ইংরেজি (Latin) অক্ষরে লিখুন; বাংলা অক্ষর দেওয়া যাবে না।';

export function IsEnglishName(): PropertyDecorator {
  return Matches(ENGLISH_NAME_PATTERN, { message: ENGLISH_NAME_MESSAGE });
}
