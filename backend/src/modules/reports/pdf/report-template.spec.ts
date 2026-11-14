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
        organizerDesignationId: null,
        organizerDesignationBn: 'সচিব',
        organizerDesignationPriority: 1,
        organizerWingId: null,
        organizerWingBn: null,
        myRole: ParticipantRole.ORGANIZER,
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

  it('has the BBS header, Bangla digits, the embedded font and Bangla page numbers', () => {
    const out = html();
    expect(out).toContain(REPORT_TITLE_BN);
    expect(out).toContain('১২'); // 12 in Bangla digits
    // Owner decisions 2026-11-14: Bangla in Nikosh, English in Tinos, both embedded from
    // backend/assets/fonts with the same unicode-range split as the web pages.
    expect(out).toContain("@font-face{font-family:'Nikosh';font-weight:400");
    expect(out).toContain('unicode-range:U+0980-09FF,U+0964-0965,U+200C-200D');
    expect(out).toContain("@font-face{font-family:'Tinos';font-weight:400");
    expect(out).toContain("@font-face{font-family:'Tinos';font-weight:700");
    expect(out.match(/src:url\(data:font\/ttf;base64,/g)).toHaveLength(3);
    expect(out).toContain("font-family: 'Nikosh', 'Tinos', serif");
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
          organizerDesignationId: null,
          organizerDesignationBn: 'পরিচালক (Grade 4)',
          organizerDesignationPriority: 4,
          organizerWingId: null,
          organizerWingBn: null,
          myRole: ParticipantRole.ORGANIZER,
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
    expect(out).toContain('Officer 3 (পরিচালক (Grade 4))');
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
  });
});
