import type { ValidationError } from '@nestjs/common';
import { validationMessages } from './validation.pipe';

describe('validationMessages', () => {
  it('translates forbidden fields and keeps DTO messages', () => {
    const errors: ValidationError[] = [
      {
        property: 'loginEmail',
        constraints: {
          whitelistValidation: 'property loginEmail should not exist',
        },
      },
      { property: 'nameBn', constraints: { isNotEmpty: 'বাংলা নাম দিন।' } },
      {
        property: 'meta',
        children: [
          { property: 'role', constraints: { whitelistValidation: 'x' } },
        ],
      },
    ];
    expect(validationMessages(errors)).toEqual([
      '"loginEmail" ফিল্ডটি এখানে পাঠানো বা পরিবর্তন করা যাবে না।',
      'বাংলা নাম দিন।',
      '"meta.role" ফিল্ডটি এখানে পাঠানো বা পরিবর্তন করা যাবে না।',
    ]);
  });
});
