/**
 * A guest officer row of the meeting form (অতিথি কর্মকর্তা, SPEC.md §6.7): same limits as the
 * backend MeetingGuestInputDto. The schema decides when "যোগ করুন" is enabled. The section is optional,
 * so its fields carry no required mark (SPEC.md §13.6a exception).
 */
import { z } from "zod";

export const MAX_GUEST_TEXT = 200;
export const MAX_GUEST_EMAIL = 254;

/** Trim and collapse inner whitespace (what is stored). */
export const cleanGuestText = (v: string) => v.trim().replace(/\s+/g, " ");

const guestText = z.string().transform(cleanGuestText).pipe(z.string().min(1).max(MAX_GUEST_TEXT));

export const guestEntrySchema = z.object({
  name: guestText,
  designation: guestText,
  email: z.string().trim().max(MAX_GUEST_EMAIL).pipe(z.email()),
});
