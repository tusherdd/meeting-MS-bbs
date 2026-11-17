import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { MailService } from '../mail/mail.service';
import {
  guestMeetingMail,
  type GuestMailKind,
} from '../mail/templates/mail-templates';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import type { LoadedMeeting } from './conflict-engine.service';
import {
  formatDhakaRange,
  NO_VENUE_BN,
  organizerLabelBn,
} from './meeting-format';

/** What the notices need about a meeting. */
export interface MeetingInfo {
  id: string;
  title: string;
  agenda: string | null;
  startAt: Date;
  endAt: Date;
  room: string | null;
  onlineLink: string | null;
  organizerNameBn: string;
  organizerDesignationBn: string | null;
  /** Organizer's current wing: what notices show as "আয়োজক" (v1.9; no wing → designation). */
  organizerWingBn: string | null;
  /** "name, designation" of the chair (officer or guest); null = no chair. */
  chairLine: string | null;
  /**
   * The designation the meeting is "led" by (SPEC.md §6.4 conflict notice): the internal chair's,
   * or the organizer's when the chair is a guest officer or there is no chair.
   */
  leadDesignationBn: string | null;
}

export interface MeetingChange {
  label: string;
  before: string;
  after: string;
}

/** A guest officer as the notices need it. */
export interface GuestRecipient {
  name: string;
  email: string;
}

const link = (id: string) => `/meetings/${id}`;

/** "আয়োজক: <wing>" (or the designation when the organizer has no wing), v1.9. */
function organizerLine(m: MeetingInfo): string {
  return `আয়োজক: ${organizerLabelBn(m.organizerWingBn, m.organizerDesignationBn)}`;
}

function detailLines(m: MeetingInfo): string[] {
  return [
    `সময়: ${formatDhakaRange(m.startAt, m.endAt)}`,
    m.room ? `স্থান: ${m.room}` : NO_VENUE_BN,
    ...(m.onlineLink ? [`Online Link: ${m.onlineLink}`] : []),
    organizerLine(m),
  ];
}

/** "রহিম", "রহিম ও করিম", "রহিম, করিম ও জামাল" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ও ${names[names.length - 1]}`;
}

/**
 * Bangla meeting notices (in-app + e-mail via NotificationsService; guest officers by e-mail
 * only, through the outbox), times in Asia/Dhaka. All calls run inside the caller's
 * transaction, so a rolled-back change sends nothing.
 */
@Injectable()
export class MeetingNotifierService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  invited(
    manager: EntityManager,
    m: MeetingInfo,
    userIds: string[],
  ): Promise<void> {
    return this.notifications.notify(
      userIds,
      {
        type: NotificationType.MEETING_INVITED,
        title: `সভার আমন্ত্রণ: ${m.title}`,
        body: [
          'আপনাকে একটি সভায় আমন্ত্রণ জানানো হয়েছে।',
          ...detailLines(m),
        ].join('\n'),
        link: link(m.id),
      },
      undefined,
      manager,
    );
  }

  updated(
    manager: EntityManager,
    m: MeetingInfo,
    userIds: string[],
    changes: MeetingChange[],
  ): Promise<void> {
    if (changes.length === 0) return Promise.resolve();
    return this.notifications.notify(
      userIds,
      {
        type: NotificationType.MEETING_UPDATED,
        title: `সভায় পরিবর্তন: ${m.title}`,
        body: [
          'যে সভায় আপনি আমন্ত্রিত, তাতে পরিবর্তন করা হয়েছে:',
          ...changes.map((c) => `${c.label}: ${c.before} → ${c.after}`),
          ...detailLines(m),
        ].join('\n'),
        link: link(m.id),
      },
      undefined,
      manager,
    );
  }

  removed(
    manager: EntityManager,
    m: MeetingInfo,
    userIds: string[],
  ): Promise<void> {
    return this.notifications.notify(
      userIds,
      {
        type: NotificationType.MEETING_REMOVED,
        title: `সভার অংশগ্রহণকারী তালিকা থেকে বাদ: ${m.title}`,
        body: [
          'আপনাকে এই সভার অংশগ্রহণকারী তালিকা থেকে বাদ দেওয়া হয়েছে; আপনার উপস্থিতির প্রয়োজন নেই।',
          `সময়: ${formatDhakaRange(m.startAt, m.endAt)}`,
          organizerLine(m),
        ].join('\n'),
        link: null, // they can no longer open the meeting
      },
      undefined,
      manager,
    );
  }

  cancelled(
    manager: EntityManager,
    m: MeetingInfo,
    userIds: string[],
    reason: string,
  ): Promise<void> {
    return this.notifications.notify(
      userIds,
      {
        type: NotificationType.MEETING_CANCELLED,
        title: `সভা বাতিল: ${m.title}`,
        body: [
          'নিচের সভাটি বাতিল করা হয়েছে।',
          `সময়: ${formatDhakaRange(m.startAt, m.endAt)}`,
          `বাতিলের কারণ: ${reason}`,
          organizerLine(m),
        ].join('\n'),
        link: link(m.id),
      },
      undefined,
      manager,
    );
  }

  /**
   * SPEC.md §6.3 (v1.5): an officer other than the organizer became the chair, so the meeting
   * took the chair's designation priority. Separate from the invitation; no priority number.
   */
  chairAssigned(
    manager: EntityManager,
    m: MeetingInfo,
    chairId: string,
  ): Promise<void> {
    return this.notifications.notify(
      [chairId],
      {
        type: NotificationType.MEETING_CHAIR_ASSIGNED,
        title: `সভাপতি: ${m.title}`,
        body: `আপনাকে “${m.title}” সভার সভাপতি করা হয়েছে, তাই সভাটি আপনার পদবির অগ্রাধিকার পেয়েছে। (${formatDhakaRange(m.startAt, m.endAt)})`,
        link: link(m.id),
      },
      undefined,
      manager,
    );
  }

  /**
   * A higher-priority meeting N now overlaps lower meeting E through shared officers
   * (SPEC.md §6.4, v1.5). Informational, not a cancel request: E's organizer and each shared
   * officer get the same notice once (someone who is both gets one). N's title appears only for
   * people invited to N; everyone else sees "আরেকটি সভা".
   */
  async conflict(
    manager: EntityManager,
    higher: MeetingInfo,
    higherPeopleIds: ReadonlySet<string>,
    lower: LoadedMeeting,
    sharedOfficers: ReadonlyArray<{ id: string; nameBn: string }>,
    recipientIds: string[],
  ): Promise<void> {
    const designation =
      higher.leadDesignationBn ?? 'একজন উচ্চতর পদমর্যাদার কর্মকর্তা';
    const when = formatDhakaRange(higher.startAt, higher.endAt);
    for (const recipientId of [...new Set(recipientIds)]) {
      const isOrganizer = recipientId === lower.organizerId;
      const isShared = sharedOfficers.some((o) => o.id === recipientId);
      const others = sharedOfficers
        .filter((o) => o.id !== recipientId)
        .map((o) => o.nameBn);
      // Whose meeting with the higher designation it is: "আপনার", "রহিম-এর", "আপনার ও রহিম-এর".
      const whose = isShared
        ? others.length > 0
          ? `আপনার ও ${joinNames(others)}-এর`
          : 'আপনার'
        : `${joinNames(others)}-এর`;
      const other = higherPeopleIds.has(recipientId)
        ? `আরেকটি সভা (“${higher.title}”)`
        : 'আরেকটি সভা';
      const choice = isOrganizer
        ? `আপনি চাইলে আপনার সভা “${lower.title}” বাতিল করতে পারেন অথবা অন্য সিদ্ধান্ত নিতে পারেন।`
        : `আপনি চাইলে “${lower.title}” সভাটি বাতিলের জন্য আয়োজককে বলতে পারেন অথবা অন্য সিদ্ধান্ত নিতে পারেন।`;
      await this.notifications.notify(
        [recipientId],
        {
          type: NotificationType.MEETING_CONFLICT,
          title: `সময় কনফ্লিক্ট: ${lower.title}`,
          body: `সময় কনফ্লিক্ট: একই সময়ে ${whose} ${designation} মহোদয়ের সাথে ${other} আছে (${when})। ${choice}`,
          link: link(lower.id),
        },
        undefined,
        manager,
      );
    }
  }

  /**
   * Guest officers (SPEC.md §6.7): mail only, straight into the outbox (they have no account
   * and no notification email of their own). Respects MAIL_DRY_RUN like every mail.
   */
  async guests(
    manager: EntityManager,
    kind: GuestMailKind,
    m: MeetingInfo,
    guests: readonly GuestRecipient[],
    extra: { changes?: MeetingChange[]; cancelReason?: string } = {},
  ): Promise<void> {
    if (kind === 'updated' && !extra.changes?.length) return;
    for (const guest of guests) {
      const content = guestMeetingMail({
        guestName: guest.name,
        kind,
        meeting: {
          title: m.title,
          when: formatDhakaRange(m.startAt, m.endAt),
          room: m.room,
          onlineLink: m.onlineLink,
          agenda: m.agenda,
          organizer: organizerLabelBn(
            m.organizerWingBn,
            m.organizerDesignationBn,
          ),
          chair: m.chairLine,
        },
        changes: extra.changes,
        cancelReason: extra.cancelReason,
      });
      await this.mail.enqueue({ to: guest.email, ...content }, manager);
    }
  }
}
