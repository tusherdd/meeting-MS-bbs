/**
 * Which admin actions to offer for a user row, mirroring the backend (users/user-policy.ts):
 * - the SUPER_ADMIN account is protected: no actions in the admin panel (badge "সুরক্ষিত");
 * - nobody changes their own role or deactivates themselves.
 * The backend checks every action again.
 */
import type { Role } from "./types";

interface Party {
  id: string;
  role: Role;
}

export interface UserActions {
  protected: boolean;
  edit: boolean;
  status: boolean;
  role: boolean;
  resetPassword: boolean;
}

export function userActions(actor: Party, target: Party): UserActions {
  if (target.role === "SUPER_ADMIN") {
    return { protected: true, edit: false, status: false, role: false, resetPassword: false };
  }
  const self = actor.id === target.id;
  return {
    protected: false,
    edit: true,
    // Activating yourself never happens (you are logged in); deactivating yourself is refused.
    status: !self,
    role: !self,
    resetPassword: true,
  };
}
