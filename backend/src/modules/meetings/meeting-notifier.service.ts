import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import type { LoadedMeeting } from './conflict-engine.service';
import { formatDhakaRange } from './meeting-format';

/** What the notices need about a meeting. */
export interface MeetingInfo {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  room: string | null;
  onlineLink: string | null;
  organizerNameBn: string;
  organizerDesignationBn: string | null;
}

export interface MeetingChange {
  label: string;
  before: string;
  after: string;
}

const link = (id: string) => `/meetings/${id}`;

function organizerLine(m: MeetingInfo): string {
  return `আয়োজক: ${m.organizerNameBn}${m.organizerDesignationBn ? ` (${m.organizerDesignationBn})` : ''}`;
}

function detailLines(m: MeetingInfo): string[] {
  return [
    `সময়: ${formatDhakaRange(m.startAt, m.endAt)}`,
    ...(m.room ? [`স্থান: ${m.room}`] : []),
    ...(m.onlineLink ? [`অনলাইন লিংক: ${m.onlineLink}`] : []),
    organizerLine(m),
  ];
}

/**
 * Bangla meeting notices (in-app + e-mail via NotificationsService), times in Asia/Dhaka.
 * All calls run inside the caller's transaction, so a rolled-back change sends nothing.
 */
@Injectable()
export class MeetingNotifierService {
  constructor(private readonly notifications: NotificationsService) {}

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
   * A higher-priority meeting N now overlaps lower meeting E (SPEC.md §6.4): E's organizer and
   * the shared officers are asked to cancel or reschedule E. N's title is only shown to people
   * invited to N; everyone else sees N's time and its organizer's designation.
   */
  async conflict(
    manager: EntityManager,
    higher: MeetingInfo,
    higherPeopleIds: ReadonlySet<string>,
    lower: LoadedMeeting,
    sharedOfficerNames: string[],
    recipientIds: string[],
  ): Promise<void> {
    const byDesignation =
      higher.organizerDesignationBn ?? 'একজন উচ্চতর পদমর্যাদার কর্মকর্তা';
    const message = (showTitle: boolean) => ({
      type: NotificationType.MEETING_CONFLICT,
      title: `সময় সংঘাত: আপনার সভা “${lower.title}” পুনঃনির্ধারণ বা বাতিল করুন`,
      body: [
        `${formatDhakaRange(higher.startAt, higher.endAt)} সময়ে ${byDesignation}-এর আহ্বানে একটি উচ্চতর অগ্রাধিকারের সভা${showTitle ? ` (“${higher.title}”)` : ''} নির্ধারিত হয়েছে।`,
        `দুই সভাতেই আছেন: ${sharedOfficerNames.join(', ')}।`,
        `আপনার সভা: “${lower.title}”, ${formatDhakaRange(lower.startAt, lower.endAt)}।`,
        'অনুগ্রহ করে আপনার সভাটি বাতিল অথবা অন্য সময়ে পুনঃনির্ধারণ করুন।',
      ].join('\n'),
      link: link(lower.id),
    });
    const invited = recipientIds.filter((id) => higherPeopleIds.has(id));
    const others = recipientIds.filter((id) => !higherPeopleIds.has(id));
    if (invited.length)
      await this.notifications.notify(
        invited,
        message(true),
        undefined,
        manager,
      );
    if (others.length)
      await this.notifications.notify(
        others,
        message(false),
        undefined,
        manager,
      );
  }
}
