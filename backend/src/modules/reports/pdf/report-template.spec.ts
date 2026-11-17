import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../../meetings/enums/participant-role.enum';
import { REPORT_TITLE_BN, dayRows, renderReportHtml } from './report-template';

const evil = '<img src=x onerror=alert(1)>';

function html() {
  return renderReportHtml({
    header: {
      subjectLines: [['কর্মকর্তা', evil]],
      periodLabelBn: 'ডিসেম্বর ২০২৬',
      generatedAtBn: 'প্রস্তুত: ১ ডিসেম্বর ২০২৬, ১০:০০',
    },
    summary: [{ label: 'মোট সভা', value: 12 }],
    extraTables: [{ title: 'উইং', headers: ['উইং', 'সভা'], rows: [[evil, 3]] }],
    meetings: [
      {
        id: 'm1',
        title: evil,
        startAt: new Date('2026-12-01T04:00:00Z'),
        endAt: new Date('2026-12-01T05:00:00Z'),
        room: '"><script>x</script>',
        status: MeetingStatus.SCHEDULED,
        organizerId: 'o',
        organizerNameBn: 'আয়োজক',
        organizerNameEn: 'EN_ONLY organizer',
        organizerDesignationId: null,
        organizerDesignationBn: 'সচিব',
        organizerDesignationEn: 'EN_ONLY designation',
        organizerDesignationPriority: 1,
        organizerWingId: null,
        organizerWingBn: null,
        organizerWingEn: 'EN_ONLY wing',
        myRole: ParticipantRole.ORGANIZER,
        chairNameBn: evil,
        chairNameEn: 'EN_ONLY chair',
        guests: [{ name: evil, designation: evil }],
      },
    ],
    showMyRole: true,
    totalMeetings: 1,
  });
}

describe('report PDF template', () => {
  it('HTML-escapes every value from the database', () => {
    const out = html();
    expect(out).not.toContain(evil);
    expect(out).not.toContain('<script>x</script>');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('v1.7: prints the Bangla names only, never the English ones', () => {
    const out = html();
    expect(out).toContain('সচিব'); // organizerDesignationBn
    expect(out).not.toContain('EN_ONLY');
  });

  it('has the BBS header, Bangla digits, the embedded font and Bangla page numbers', () => {
    const out = html();
    expect(out).toContain(REPORT_TITLE_BN);
    expect(out).toContain('১২'); // 12 in Bangla digits
    // Owner decisions 2026-11-14/15: Bangla in NikoshBAN, English in Tinos, both embedded from
    // backend/assets/fonts with the same unicode-range split as the web pages.
    expect(out).toContain("@font-face{font-family:'NikoshBAN';font-weight:400");
    expect(out).toContain('unicode-range:U+0980-09FF,U+0964-0965,U+200C-200D');
    expect(out).toContain("@font-face{font-family:'Tinos';font-weight:400");
    expect(out).toContain("@font-face{font-family:'Tinos';font-weight:700");
    expect(out.match(/src:url\(data:font\/ttf;base64,/g)).toHaveLength(3);
    expect(out).toContain("font-family: 'NikoshBAN', 'Tinos', serif");
    expect(out).not.toContain('Noto');
    expect(out).toContain('counter(page, bengali)');
    expect(out).not.toMatch(/https?:\/\//); // nothing to fetch from the internet
  });

  // SPEC.md §13.11: only system-generated numbers get Bangla digits; user text stays as typed.
  it('keeps user text exactly as typed and shows system numbers in Bangla digits', () => {
    const out = renderReportHtml({
      header: {
        subjectLines: [['কর্মকর্তা', 'Md. Rahim 2 — Unit 7']],
        periodLabelBn: 'ডিসেম্বর ২০২৬',
        generatedAtBn: 'প্রস্তুত: ১ ডিসেম্বর ২০২৬, ১০:০০',
      },
      summary: [{ label: 'মোট সভা', value: 12 }],
      extraTables: [
        { title: 'উইং', headers: ['উইং', 'সভা'], rows: [['Wing 7 (ICT)', 34]] },
        {
          title: 'দিন',
          headers: ['তারিখ', 'সভা', 'ঘণ্টা'],
          rows: dayRows([{ date: '2026-12-01', meetings: 5, hours: 1.5 }]),
        },
      ],
      meetings: [
        {
          id: 'm1',
          title: 'সভা: Joint Coordination Meeting 2026 (SDG Tracker v2.1)',
          startAt: new Date('2026-12-01T04:00:00Z'),
          endAt: new Date('2026-12-01T05:00:00Z'),
          room: 'Conference Room 501',
          status: MeetingStatus.SCHEDULED,
          organizerId: 'o',
          organizerNameBn: 'Officer 3',
          organizerNameEn: 'EN_ONLY organizer',
          organizerDesignationId: null,
          organizerDesignationBn: 'পরিচালক (Grade 4)',
          organizerDesignationEn: 'EN_ONLY designation',
          organizerDesignationPriority: 4,
          organizerWingId: null,
          organizerWingBn: null,
          organizerWingEn: 'EN_ONLY wing',
          myRole: ParticipantRole.ORGANIZER,
          chairNameBn: 'ড. ফারহানা ইসলাম',
          chairNameEn: 'EN_ONLY chair',
          guests: [
            { name: 'ড. ফারহানা ইসলাম', designation: 'যুগ্মসচিব (Planning)' },
            { name: 'Mr. John Doe', designation: 'Consultant, UNFPA' },
          ],
        },
      ],
      showMyRole: true,
      totalMeetings: 1,
    });
    // User text: unchanged.
    expect(out).toContain(
      'সভা: Joint Coordination Meeting 2026 (SDG Tracker v2.1)',
    );
    expect(out).toContain('<td>Conference Room 501</td>');
    // v1.9: the organizer is shown as the wing; this one has none → the designation, no name.
    expect(out).toContain('<td>পরিচালক (Grade 4)</td>');
    expect(out).not.toContain('Officer 3');
    expect(out).toContain('<td>Wing 7 (ICT)</td>');
    expect(out).toContain('Md. Rahim 2 — Unit 7');
    expect(out).not.toContain('v২.১');
    expect(out).not.toContain('Room ৫০১');
    // System numbers: Bangla digits (counts, hours, dates, the time range).
    expect(out).toContain('<td>১২</td>');
    expect(out).toContain('<td>৩৪</td>');
    expect(out).toContain('<td>২০২৬-১২-০১</td><td>৫</td><td>১.৫</td>');
    expect(out).toContain('১ ডিসেম্বর ২০২৬');
    expect(out).not.toContain('<td>2026-12-01</td>');
    // v1.5: chair column and the guest officers under the meeting, typed text unchanged.
    expect(out).toContain('<th>সভাপতি</th>');
    expect(out).toContain('<td>ড. ফারহানা ইসলাম</td>');
    expect(out).toContain(
      '<b>অতিথি কর্মকর্তা:</b> ড. ফারহানা ইসলাম — যুগ্মসচিব (Planning); Mr. John Doe — Consultant, UNFPA',
    );
  });

  it('adds no guest row for a meeting without guest officers', () => {
    const out = renderReportHtml({
      header: {
        subjectLines: [],
        periodLabelBn: 'ডিসেম্বর ২০২৬',
        generatedAtBn: 'প্রস্তুত',
      },
      summary: [],
      extraTables: [],
      meetings: [
        {
          id: 'm1',
          title: 'সভা',
          startAt: new Date('2026-12-01T04:00:00Z'),
          endAt: new Date('2026-12-01T05:00:00Z'),
          room: null,
          status: MeetingStatus.SCHEDULED,
          organizerId: 'o',
          organizerNameBn: 'আয়োজক',
          organizerNameEn: 'EN_ONLY organizer',
          organizerDesignationId: null,
          organizerDesignationBn: null,
          organizerDesignationEn: 'EN_ONLY designation',
          organizerDesignationPriority: null,
          organizerWingId: null,
          organizerWingBn: null,
          organizerWingEn: 'EN_ONLY wing',
          myRole: null,
          chairNameBn: null,
          chairNameEn: 'EN_ONLY chair',
          guests: [],
        },
      ],
      showMyRole: false,
      totalMeetings: 1,
    });
    expect(out).not.toContain('class="guests"');
    expect(out).not.toContain('অতিথি কর্মকর্তা:');
  });

  it('v1.9: organizer column shows the Bangla wing; a meeting without a venue says so', () => {
    const base = {
      id: 'm1',
      title: 'সভা',
      startAt: new Date('2026-12-01T04:00:00Z'),
      endAt: new Date('2026-12-01T05:00:00Z'),
      status: MeetingStatus.SCHEDULED,
      organizerId: 'o',
      organizerNameBn: 'মোঃ রহিম উদ্দিন',
      organizerNameEn: 'EN_ONLY organizer',
      organizerDesignationId: 'd',
      organizerDesignationBn: 'উপপরিচালক',
      organizerDesignationEn: 'EN_ONLY designation',
      organizerDesignationPriority: 6,
      organizerWingId: 'w',
      organizerWingBn: 'কম্পিউটার উইং',
      organizerWingEn: 'EN_ONLY wing',
      myRole: null,
      chairNameBn: null,
      chairNameEn: null,
      guests: [],
    };
    const out = renderReportHtml({
      header: {
        subjectLines: [],
        periodLabelBn: 'ডিসেম্বর ২০২৬',
        generatedAtBn: 'প্রস্তুত',
      },
      summary: [],
      extraTables: [],
      meetings: [
        { ...base, room: null },
        { ...base, id: 'm2', room: 'অনলাইন', organizerWingBn: null },
      ],
      showMyRole: false,
      totalMeetings: 2,
    });
    expect(out).toContain('<th>স্থান</th>');
    expect(out).toContain('<th>আয়োজক</th>');
    expect(out).toContain('<td>কম্পিউটার উইং</td>');
    expect(out).toContain('<td>উপপরিচালক</td>'); // no wing → designation
    expect(out).toContain('<td>স্থান উল্লেখ নেই</td>');
    expect(out).toContain('<td>অনলাইন</td>');
    expect(out).not.toContain('মোঃ রহিম উদ্দিন');
    expect(out).not.toContain('EN_ONLY');
  });
});
