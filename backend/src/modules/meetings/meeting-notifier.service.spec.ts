import type { EntityManager } from 'typeorm';
import type { MailService } from '../mail/mail.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import type { NotificationsService } from '../notifications/notifications.service';
import type { LoadedMeeting } from './conflict-engine.service';
import { MeetingStatus } from './enums/meeting-status.enum';
import {
  MeetingNotifierService,
  type MeetingInfo,
} from './meeting-notifier.service';

const manager = {} as EntityManager;

const higher: MeetingInfo = {
  id: 'N',
  title: 'জরুরি সমন্বয় সভা',
  agenda: '১. বাজেট\n২. বিবিধ',
  startAt: new Date('2030-01-01T04:00:00Z'), // 10:00 Dhaka
  endAt: new Date('2030-01-01T05:00:00Z'),
  room: 'সম্মেলন কক্ষ',
  onlineLink: 'https://meet.example.org/abc',
  organizerNameBn: 'মোঃ আয়োজক',
  organizerDesignationBn: 'উপপরিচালক',
  organizerWingBn: 'কম্পিউটার উইং',
  chairLine: 'মোঃ সচিব, সচিব',
  leadDesignationBn: 'সচিব',
};

const lower: LoadedMeeting = {
  id: 'E',
  title: 'মাঠ জরিপ প্রস্তুতি সভা',
  status: MeetingStatus.SCHEDULED,
  priority: 7,
  startAt: new Date('2030-01-01T04:30:00Z'),
  endAt: new Date('2030-01-01T05:30:00Z'),
  peopleIds: ['E-org', 'rahim', 'karim'],
  organizerId: 'E-org',
  organizerNameBn: 'নিম্ন আয়োজক',
  organizerNameEn: 'EN_ONLY organizer',
  organizerDesignationBn: 'পরিসংখ্যান কর্মকর্তা',
  organizerDesignationEn: 'EN_ONLY designation',
  organizerWingBn: 'জনশুমারি উইং',
  organizerWingEn: 'EN_ONLY wing',
};

function setup() {
  const notifications = { notify: jest.fn() };
  const mail = { enqueue: jest.fn() };
  const service = new MeetingNotifierService(
    notifications as unknown as NotificationsService,
    mail as unknown as MailService,
  );
  /** userId → the one message that user got. */
  const sent = () =>
    new Map(
      notifications.notify.mock.calls.map(
        (c: [string[], { type: string; title: string; body: string }]) => [
          c[0][0],
          c[1],
        ],
      ),
    );
  return { service, notifications, mail, sent };
}

describe('MeetingNotifierService.conflict (v1.5: informational)', () => {
  it('organizer and each shared officer get the same notice, worded for them, once each', async () => {
    const { service, notifications, sent } = setup();
    await service.conflict(
      manager,
      higher,
      new Set(['N-org', 'rahim']), // rahim is invited to N, karim and E-org are not
      lower,
      [
        { id: 'rahim', nameBn: 'রহিম' },
        { id: 'karim', nameBn: 'করিম' },
      ],
      ['E-org', 'rahim', 'karim', 'rahim'],
    );
    expect(notifications.notify).toHaveBeenCalledTimes(3); // rahim only once
    // v1.7: bell texts use the Bangla names only, never the English ones.
    expect(JSON.stringify(notifications.notify.mock.calls)).not.toContain(
      'EN_ONLY',
    );
    const byUser = sent();

    const toOrganizer = byUser.get('E-org')!;
    expect(toOrganizer.type).toBe(NotificationType.MEETING_CONFLICT);
    expect(toOrganizer.title).toBe('সময় কনফ্লিক্ট: মাঠ জরিপ প্রস্তুতি সভা');
    expect(toOrganizer.body).toBe(
      'সময় কনফ্লিক্ট: একই সময়ে রহিম ও করিম-এর সচিব মহোদয়ের সাথে আরেকটি সভা আছে (১ জানুয়ারী ২০৩০ (মঙ্গলবার), সকাল ১০:০০ – সকাল ১১:০০)। আপনি চাইলে আপনার সভা “মাঠ জরিপ প্রস্তুতি সভা” বাতিল করতে পারেন অথবা অন্য সিদ্ধান্ত নিতে পারেন।',
    );

    // Shared officer invited to N: "আপনার", and may see N's title.
    const toRahim = byUser.get('rahim')!;
    expect(toRahim.body).toContain(
      'একই সময়ে আপনার ও করিম-এর সচিব মহোদয়ের সাথে আরেকটি সভা (“জরুরি সমন্বয় সভা”) আছে',
    );
    expect(toRahim.body).toContain('বাতিলের জন্য আয়োজককে বলতে পারেন');

    // Not invited to N: no title of N.
    const toKarim = byUser.get('karim')!;
    expect(toKarim.body).toContain('একই সময়ে আপনার ও রহিম-এর সচিব মহোদয়ের');
    expect(toKarim.body).not.toContain('জরুরি সমন্বয় সভা');

    for (const m of byUser.values()) {
      expect(m.body).not.toMatch(/অনুগ্রহ করে|পুনঃনির্ধারণ করুন/); // no cancel request
      expect(m.body).not.toMatch(
        /[০-৯]+\s*\)?\s*অগ্রাধিকার|অগ্রাধিকার\s*[০-৯0-9]/,
      );
    }
  });

  it('an organizer who is also the shared officer gets one notice with "আপনার"', async () => {
    const { service, notifications, sent } = setup();
    await service.conflict(
      manager,
      higher,
      new Set(['N-org']),
      lower,
      [{ id: 'E-org', nameBn: 'নিম্ন আয়োজক' }],
      ['E-org', 'E-org'],
    );
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(sent().get('E-org')!.body).toContain(
      'একই সময়ে আপনার সচিব মহোদয়ের সাথে আরেকটি সভা আছে',
    );
    expect(sent().get('E-org')!.body).toContain('আপনি চাইলে আপনার সভা');
  });

  it('without an internal chair the organizer designation is used (leadDesignationBn)', async () => {
    const { service, sent } = setup();
    await service.conflict(
      manager,
      { ...higher, leadDesignationBn: 'উপপরিচালক' },
      new Set(),
      lower,
      [{ id: 'rahim', nameBn: 'রহিম' }],
      ['E-org'],
    );
    expect(sent().get('E-org')!.body).toContain(
      'রহিম-এর উপপরিচালক মহোদয়ের সাথে',
    );
  });
});

describe('MeetingNotifierService.chairAssigned', () => {
  it('tells the chair why the meeting got their priority, without a number', async () => {
    const { service, notifications } = setup();
    await service.chairAssigned(manager, higher, 'chair-id');
    const [ids, message] = notifications.notify.mock.calls[0] as [
      string[],
      { type: string; body: string; link: string },
    ];
    expect(ids).toEqual(['chair-id']);
    expect(message.type).toBe(NotificationType.MEETING_CHAIR_ASSIGNED);
    expect(message.body).toBe(
      'আপনাকে “জরুরি সমন্বয় সভা” সভার সভাপতি করা হয়েছে, তাই সভাটি আপনার পদবির অগ্রাধিকার পেয়েছে। (১ জানুয়ারী ২০৩০ (মঙ্গলবার), সকাল ১০:০০ – সকাল ১১:০০)',
    );
    expect(message.link).toBe('/meetings/N');
  });
});

describe('MeetingNotifierService.guests (mail only, through the outbox)', () => {
  const guests = [
    { name: 'ড. ফারহানা', email: 'farhana@example.org' },
    { name: 'জন', email: 'john@example.org' },
  ];

  it('one outbox mail per guest with the full meeting details and no login link', async () => {
    const { service, mail, notifications } = setup();
    await service.guests(manager, 'invited', higher, guests);
    expect(notifications.notify).not.toHaveBeenCalled(); // no bell: guests have no account
    expect(mail.enqueue).toHaveBeenCalledTimes(2);
    const [first] = mail.enqueue.mock.calls[0] as [
      { to: string; subject: string; text: string; html: string },
    ];
    expect(first.to).toBe('farhana@example.org');
    expect(first.subject).toBe('সভার আমন্ত্রণ: জরুরি সমন্বয় সভা');
    for (const part of [
      'প্রিয় ড. ফারহানা',
      'অতিথি কর্মকর্তা হিসেবে',
      'শিরোনাম: জরুরি সমন্বয় সভা',
      'তারিখ ও সময়: ১ জানুয়ারী ২০৩০ (মঙ্গলবার), সকাল ১০:০০ – সকাল ১১:০০',
      'স্থান: সম্মেলন কক্ষ',
      'Online Link: https://meet.example.org/abc',
      'আয়োজক: কম্পিউটার উইং',
      'সভাপতি: মোঃ সচিব, সচিব',
      '১. বাজেট',
      '২. বিবিধ',
    ]) {
      expect(first.text).toContain(part);
    }
    // v1.9: the organizer is shown as the wing, never as the person
    expect(first.text).not.toContain('মোঃ আয়োজক');
    expect(first.html).not.toMatch(/\/login|\/meetings\//);
    expect(first.text).not.toMatch(/\/login|\/meetings\/|Password/);
  });

  it('update mail lists the changes; nothing is sent without changes', async () => {
    const { service, mail } = setup();
    await service.guests(manager, 'updated', higher, guests, { changes: [] });
    expect(mail.enqueue).not.toHaveBeenCalled();
    await service.guests(manager, 'updated', higher, guests.slice(0, 1), {
      changes: [{ label: 'স্থান', before: 'কক্ষ ১', after: 'সম্মেলন কক্ষ' }],
    });
    const [m] = mail.enqueue.mock.calls[0] as [
      { subject: string; text: string },
    ];
    expect(m.subject).toBe('সভায় পরিবর্তন: জরুরি সমন্বয় সভা');
    expect(m.text).toContain('স্থান: কক্ষ ১ → সম্মেলন কক্ষ');
  });

  it('cancel and removal mails', async () => {
    const { service, mail } = setup();
    await service.guests(manager, 'cancelled', higher, guests.slice(0, 1), {
      cancelReason: 'জরুরি কারণে স্থগিত',
    });
    await service.guests(manager, 'removed', higher, guests.slice(1));
    const [cancel] = mail.enqueue.mock.calls[0] as [
      { subject: string; text: string },
    ];
    const [removed] = mail.enqueue.mock.calls[1] as [
      { to: string; subject: string; text: string },
    ];
    expect(cancel.subject).toBe('সভা বাতিল: জরুরি সমন্বয় সভা');
    expect(cancel.text).toContain('বাতিলের কারণ: জরুরি কারণে স্থগিত');
    expect(removed.to).toBe('john@example.org');
    expect(removed.subject).toBe(
      'অতিথি কর্মকর্তার তালিকা থেকে বাদ: জরুরি সমন্বয় সভা',
    );
    expect(removed.text).toContain('আপনার উপস্থিতির প্রয়োজন নেই');
  });
});

describe('MeetingNotifierService: organizer shown as the wing, venue (v1.9)', () => {
  it('bell + mail notices show "আয়োজক: <wing>" and are still sent to the invited people', async () => {
    const { service, notifications } = setup();
    await service.invited(manager, higher, ['rahim', 'karim']);
    const [ids, message] = notifications.notify.mock.calls[0] as [
      string[],
      { body: string },
    ];
    expect(ids).toEqual(['rahim', 'karim']);
    expect(message.body).toContain('আয়োজক: কম্পিউটার উইং');
    expect(message.body).toContain('স্থান: সম্মেলন কক্ষ');
    expect(message.body).not.toContain('মোঃ আয়োজক');
    expect(message.body).not.toContain('উপপরিচালক');
  });

  it('an organizer without a wing is shown with their designation', async () => {
    const { service, notifications, mail } = setup();
    const noWing = { ...higher, organizerWingBn: null };
    await service.cancelled(manager, noWing, ['rahim'], 'জরুরি কারণ');
    await service.removed(manager, noWing, ['karim']);
    await service.guests(manager, 'invited', noWing, [
      { name: 'জন', email: 'john@example.org' },
    ]);
    const bodies = notifications.notify.mock.calls.map(
      (c: [string[], { body: string }]) => c[1].body,
    );
    for (const body of bodies) {
      expect(body).toContain('আয়োজক: উপপরিচালক');
      expect(body).not.toContain('মোঃ আয়োজক');
    }
    const [guestMail] = mail.enqueue.mock.calls[0] as [{ text: string }];
    expect(guestMail.text).toContain('আয়োজক: উপপরিচালক');
  });

  it('a meeting without a venue (created before v1.9) says "স্থান উল্লেখ নেই"', async () => {
    const { service, notifications, mail } = setup();
    const noVenue = { ...higher, room: null };
    await service.invited(manager, noVenue, ['rahim']);
    await service.guests(manager, 'invited', noVenue, [
      { name: 'জন', email: 'john@example.org' },
    ]);
    const [, message] = notifications.notify.mock.calls[0] as [
      string[],
      { body: string },
    ];
    expect(message.body).toContain('স্থান উল্লেখ নেই');
    const [guestMail] = mail.enqueue.mock.calls[0] as [{ text: string }];
    expect(guestMail.text).toContain('স্থান: স্থান উল্লেখ নেই');
  });
});
