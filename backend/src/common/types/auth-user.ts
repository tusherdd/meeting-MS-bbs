import type { Request } from 'express';
import type { UserRole } from '../../modules/users/enums/user-role.enum';

/** The logged-in user as attached to the request by JwtAuthGuard (fresh from the DB). */
export interface AuthUser {
  id: string;
  role: UserRole;
  mustChangePassword: boolean;
}

/** Express request after cookie-parser and JwtAuthGuard. */
export interface AppRequest extends Request {
  cookies: Record<string, string | undefined>;
  user?: AuthUser;
}
