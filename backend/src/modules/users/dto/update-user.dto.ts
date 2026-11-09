import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';
import { CreateUserDto } from './create-user.dto';

/**
 * Any subset of the create fields (SPEC.md §8: admins may edit any field, including loginEmail
 * and designation). Role and status have their own endpoints. Required fields cannot be null.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UpdateUserStatusDto {
  @ApiProperty({
    example: false,
    description: 'false = deactivate (ends all sessions)',
  })
  @IsBoolean({ message: 'isActive true অথবা false হতে হবে।' })
  isActive!: boolean;
}

/** SUPER_ADMIN can never be assigned through the API. */
export const ASSIGNABLE_ROLES = [UserRole.ADMIN, UserRole.OFFICER] as const;

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES, example: UserRole.ADMIN })
  @IsIn(ASSIGNABLE_ROLES, { message: 'ভূমিকা ADMIN অথবা OFFICER হতে হবে।' })
  role!: (typeof ASSIGNABLE_ROLES)[number];
}
