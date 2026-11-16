"use client";

import { useState, type KeyboardEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/messages";

/** A guest officer (অতিথি কর্মকর্তা, SPEC.md §6.7): no account, invited by name and email. */
export interface GuestEntry {
  name: string;
  designation: string;
  email: string;
}

/** Same limits as the backend MeetingGuestInputDto. */
export const MAX_GUESTS = 50;
const MAX_TEXT = 200;
const MAX_EMAIL = 254;

/** The chair select stores a guest chair as "guest:<email>" (officer chairs are user ids). */
export const GUEST_CHAIR_PREFIX = "guest:";
export const guestChairValue = (email: string) => `${GUEST_CHAIR_PREFIX}${email}`;

const emailSchema = z.email();
const clean = (v: string) => v.trim().replace(/\s+/g, " ");
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The optional "অতিথি কর্মকর্তা" section of the meeting form: three fields and "যোগ করুন"
 * (enabled once all three are filled and the email is valid and new), then the list with
 * "বাদ দিন" per guest. Lives inside the meeting <form>, so Enter adds a guest instead of
 * submitting the meeting.
 */
export function GuestOfficers({
  guests,
  onChange,
}: {
  guests: GuestEntry[];
  onChange: (next: GuestEntry[]) => void;
}) {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);

  const emailValid =
    emailSchema.safeParse(email.trim()).success && email.trim().length <= MAX_EMAIL;
  const duplicate = email.trim() !== "" && guests.some((g) => sameEmail(g.email, email));
  const full = guests.length >= MAX_GUESTS;
  const tooLong = clean(name).length > MAX_TEXT || clean(designation).length > MAX_TEXT;
  const canAdd =
    clean(name) !== "" &&
    clean(designation) !== "" &&
    emailValid &&
    !duplicate &&
    !full &&
    !tooLong;

  const emailError = duplicate
    ? t.meetingForm.guestEmailDuplicate
    : emailTouched && email.trim() !== "" && !emailValid
      ? t.meetingForm.guestEmailInvalid
      : undefined;

  function add() {
    if (!canAdd) {
      setEmailTouched(true);
      return;
    }
    onChange([
      ...guests,
      { name: clean(name), designation: clean(designation), email: email.trim().toLowerCase() },
    ]);
    setName("");
    setDesignation("");
    setEmail("");
    setEmailTouched(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault(); // never submit the meeting form from here
    add();
  }

  return (
    <section aria-labelledby="guests-title" className="space-y-3" data-testid="guest-officers">
      <div>
        <h3 id="guests-title" className="text-sm font-semibold text-slate-800">
          {t.meetingForm.guestsTitle}
        </h3>
        <p className="text-xs text-slate-500">{t.meetingForm.guestsHint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          id="guest-name"
          label={t.meetingForm.guestName}
          value={name}
          maxLength={MAX_TEXT}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <Input
          id="guest-designation"
          label={t.meetingForm.guestDesignation}
          value={designation}
          maxLength={MAX_TEXT}
          autoComplete="off"
          onChange={(e) => setDesignation(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <Input
          id="guest-email"
          type="email"
          inputMode="email"
          label={t.meetingForm.guestEmail}
          value={email}
          maxLength={MAX_EMAIL}
          autoComplete="off"
          error={emailError}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={add} disabled={!canAdd}>
          {t.meetingForm.guestAdd}
        </Button>
        {full && <p className="text-xs text-slate-600">{t.meetingForm.guestsMax}</p>}
      </div>

      {guests.length > 0 && (
        <div>
          <h4 className="sr-only">{t.meetingForm.guestsList}</h4>
          <ul className="space-y-2" data-testid="guest-list">
            {guests.map((g) => (
              <li
                key={g.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200"
              >
                <span className="min-w-0 break-words text-slate-800">
                  {g.name} — {g.designation} — <span className="text-slate-600">{g.email}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onChange(guests.filter((x) => x.email !== g.email))}
                  aria-label={t.meetingForm.guestRemoveLabel(g.name)}
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-white hover:text-red-700"
                >
                  {t.meetingForm.guestRemove}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
