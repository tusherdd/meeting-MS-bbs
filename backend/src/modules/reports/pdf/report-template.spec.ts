import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../../meetings/enums/participant-role.enum';
import { REPORT_TITLE_BN, renderReportHtml } from './report-template';

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
    // Nikosh (owner decision 2026-11-14), embedded from backend/assets/fonts/Nikosh.ttf.
    expect(out).toContain("@font-face{font-family:'Nikosh'");
    expect(out).toContain('src:url(data:font/ttf;base64,');
    expect(out).toContain("font-family: 'Nikosh', sans-serif");
    expect(out).not.toContain('Noto');
    expect(out).toContain('counter(page, bengali)');
    expect(out).not.toMatch(/https?:\/\//); // nothing to fetch from the internet
  });
});
