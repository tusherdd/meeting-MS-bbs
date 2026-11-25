"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cleanGuestText as clean,
  guestEntrySchema,
  MAX_GUEST_EMAIL as MAX_EMAIL,
  MAX_GUEST_TEXT as MAX_TEXT,
} from "@/lib/guest-entry";
import { useT } from "@/providers/locale-provider";

/** A guest officer (অতিথি কর্মকর্তা, SPEC.md §6.7): no account, invited by name and email. */
export interface GuestEntry {
  name: string;
  designation: string;
  email: string;
}

/** Same limits as the backend MeetingGuestInputDto. */
export const MAX_GUESTS = 50;

/** The chair select stores a guest chair as "guest:<email>" (officer chairs are user ids). */
export const GUEST_CHAIR_PREFIX = "guest:";
export const guestChairValue = (email: string) => `${GUEST_CHAIR_PREFIX}${email}`;

/**
 * v1.21 part 3: name and designation taken from a notice line ("অতিথি হিসেবে যোগ করুন"); the email
 * is still typed by the user. A new `seq` applies a new prefill; `asChair` offers to make the guest
 * the chair once added.
 */
export interface GuestPrefill {
  seq: number;
  name: string;
  designation: string;
  asChair: boolean;
}

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The "অতিথি কর্মকর্তা" section of the meeting form: three fields and "যোগ করুন"
 * (enabled once all three are filled and the email is valid and new), then the list with
 * "বাদ দিন" per guest (rules: guestEntrySchema). An optional sub-section, so the fields carry
 * no required mark (SPEC.md §13.6a exception). Lives inside the meeting <form>, so Enter adds a
 * guest instead of submitting the meeting.
 */
export function GuestOfficers({
  guests,
  onChange,
  prefill,
  onMakeChair,
}: {
  guests: GuestEntry[];
  onChange: (next: GuestEntry[]) => void;
  prefill?: GuestPrefill | null;
  /** v1.21: called with the new guest's email when "make this guest the chair" was ticked. */
  onMakeChair?: (email: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [asChair, setAsChair] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [offerChair, setOfferChair] = useState(false); // prefilled from the notice's chair line
  const emailRef = useRef<HTMLInputElement>(null);

  // A new prefill replaces the fields (state adjusted during render, React's pattern for props).
  const [seenSeq, setSeenSeq] = useState(0);
  if (prefill && prefill.seq !== seenSeq) {
    setSeenSeq(prefill.seq);
    setName(prefill.name);
    setDesignation(prefill.designation);
    setEmail("");
    setEmailTouched(false);
    setAsChair(prefill.asChair);
    setOfferChair(prefill.asChair);
    setPrefilled(true);
  }
  // ...and moves the focus to the email field, the one thing left to type.
  const prefillSeq = prefill?.seq ?? 0;
  useEffect(() => {
    if (prefillSeq === 0) return;
    emailRef.current?.focus();
    emailRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [prefillSeq]);

  const emailValid = guestEntrySchema.shape.email.safeParse(email).success;
  const duplicate = email.trim() !== "" && guests.some((g) => sameEmail(g.email, email));
  const full = guests.length >= MAX_GUESTS;
  const canAdd =
    guestEntrySchema.safeParse({ name, designation, email }).success && !duplicate && !full;

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
    const added = email.trim().toLowerCase();
    onChange([...guests, { name: clean(name), designation: clean(designation), email: added }]);
    if (prefilled && offerChair && asChair) onMakeChair?.(added);
    setName("");
    setDesignation("");
    setEmail("");
    setEmailTouched(false);
    setAsChair(false);
    setOfferChair(false);
    setPrefilled(false);
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
          ref={emailRef}
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
      {prefilled && (
        <div className="space-y-2" data-testid="guest-prefilled">
          <p className="text-sm text-slate-700">{t.noticeFill.guestPrefilled}</p>
          {onMakeChair && offerChair && (
            <label className="flex w-fit items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                checked={asChair}
                onChange={(e) => setAsChair(e.target.checked)}
              />
              {t.noticeFill.guestAsChair}
            </label>
          )}
        </div>
      )}
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
