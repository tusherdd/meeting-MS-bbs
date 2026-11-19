import sharp from 'sharp';
import {
  DOCX_MIME,
  mayOpenInline,
  contentDisposition,
  decodeUploadName,
  detectDecisionType,
  DecisionFileError,
  displayName,
  processDecisionFile,
  sanitizeFileName,
} from './decision-file';
import { checkDocx } from './docx';
import {
  docm,
  docx,
  docxWithVba,
  legacyDoc,
  plainZip,
  renamedExe,
} from './docx.fixture-spec';

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
  'latin1',
);

async function jpegWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: '#016b4f' },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps-owner' } } })
    .toBuffer();
}

describe('decision file type sniffing (magic bytes)', () => {
  it('detects PDF, JPEG and PNG from the bytes', async () => {
    expect(detectDecisionType(PDF)).toBe('pdf');
    expect(detectDecisionType(await jpegWithExif())).toBe('jpeg');
    const png = await sharp({
      create: { width: 4, height: 4, channels: 4, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    expect(detectDecisionType(png)).toBe('png');
  });

  it('a fake PDF (text with a .pdf name) is rejected', async () => {
    const fake = Buffer.from('This is not a PDF at all', 'utf8');
    expect(detectDecisionType(fake)).toBeNull();
    await expect(processDecisionFile(fake)).rejects.toEqual(
      new DecisionFileError('type'),
    );
  });

  it('rejects other types even with an allowed name (HTML, WebP, a broken ZIP)', async () => {
    for (const bytes of [
      Buffer.from('<html><script>alert(1)</script></html>'),
      Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1'),
      Buffer.from('PK\x03\x04', 'latin1'),
    ]) {
      await expect(processDecisionFile(bytes)).rejects.toBeInstanceOf(
        DecisionFileError,
      );
    }
  });

  it('a PDF header without an end marker is unreadable', async () => {
    await expect(
      processDecisionFile(Buffer.from('%PDF-1.7\nnothing else', 'latin1')),
    ).rejects.toEqual(new DecisionFileError('unreadable'));
  });

  it('a JPEG header with garbage after it is unreadable', async () => {
    await expect(
      processDecisionFile(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02])),
    ).rejects.toEqual(new DecisionFileError('unreadable'));
  });

  it('keeps a valid PDF byte for byte and hashes it', async () => {
    const out = await processDecisionFile(PDF);
    expect(out.mime).toBe('application/pdf');
    expect(out.extension).toBe('.pdf');
    expect(out.content.equals(PDF)).toBe(true);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('strips image metadata (EXIF) from JPEG', async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await processDecisionFile(input);
    expect(out.mime).toBe('image/jpeg');
    expect((await sharp(out.content).metadata()).exif).toBeUndefined();
    expect(out.content.includes('secret-gps-owner')).toBe(false);
  });
});

describe('file names', () => {
  it('keeps only the last path segment and the detected extension', () => {
    expect(sanitizeFileName('../../etc/passwd.pdf', '.pdf')).toBe('passwd.pdf');
    expect(sanitizeFileName('C:\\Users\\x\\minutes.exe', '.pdf')).toBe(
      'minutes.pdf',
    );
    expect(sanitizeFileName('photo.PNG', '.jpg')).toBe('photo.jpg');
  });

  it('removes control and bidi characters, replaces reserved ones', () => {
    const rlo = String.fromCharCode(0x202e);
    const name = `a<b>:c"d|e?f*${rlo}fdp.exe\u0000.pdf`;
    const out = sanitizeFileName(name, '.pdf');
    expect(out).toBe('a_b__c_d_e_f_fdp.exe.pdf');
    expect(out.includes(rlo)).toBe(false);
  });

  it('keeps Bangla names (with ZWNJ / ZWJ) and gives a default when empty', () => {
    expect(sanitizeFileName('সভার কার্যবিবরণী.pdf', '.pdf')).toBe(
      'সভার কার্যবিবরণী.pdf',
    );
    expect(sanitizeFileName('...', '.png')).toBe('decision.png');
    expect(sanitizeFileName(undefined, '.pdf')).toBe('decision.pdf');
    expect(displayName('nested/dir/report.docx')).toBe('report.docx');
  });

  it('limits the name to 150 characters before the extension', () => {
    expect(sanitizeFileName(`${'x'.repeat(400)}.pdf`, '.pdf')).toHaveLength(
      154,
    );
  });

  it('decodes UTF-8 names that multer read as latin1', () => {
    const bangla = 'সিদ্ধান্ত.pdf';
    expect(
      decodeUploadName(Buffer.from(bangla, 'utf8').toString('latin1')),
    ).toBe(bangla);
    expect(decodeUploadName('café.pdf')).toBe('café.pdf');
  });

  it('Content-Disposition: ASCII fallback + UTF-8 name, no quotes or newlines', () => {
    const header = contentDisposition('সভা "x"\r\nX-Evil: 1.pdf', false);
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain("filename*=UTF-8''");
    expect(contentDisposition('minutes.pdf', true)).toBe(
      `inline; filename="minutes.pdf"; filename*=UTF-8''minutes.pdf`,
    );
  });
});

describe('DOCX by the bytes (v1.13)', () => {
  it('a valid DOCX is accepted, stored unchanged, with the DOCX type and extension', async () => {
    const bytes = docx();
    expect(checkDocx(bytes)).toBe('docx');
    expect(detectDecisionType(bytes)).toBe('docx');
    const result = await processDecisionFile(bytes);
    expect(result).toMatchObject({
      type: 'docx',
      mime: DOCX_MIME,
      extension: '.docx',
    });
    expect(result.content.equals(bytes)).toBe(true);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a macro-enabled file (DOCM) is rejected as "macro"', async () => {
    expect(checkDocx(docm())).toBe('macro');
    await expect(processDecisionFile(docm())).rejects.toEqual(
      new DecisionFileError('macro'),
    );
  });

  it('a DOCX with a hidden vbaProject.bin is rejected as "macro"', async () => {
    expect(checkDocx(docxWithVba())).toBe('macro');
    await expect(processDecisionFile(docxWithVba())).rejects.toEqual(
      new DecisionFileError('macro'),
    );
  });

  it('legacy .doc (OLE) is rejected as the wrong type', async () => {
    expect(detectDecisionType(legacyDoc())).toBeNull();
    await expect(processDecisionFile(legacyDoc())).rejects.toEqual(
      new DecisionFileError('type'),
    );
  });

  it('a renamed .exe is rejected as the wrong type', async () => {
    expect(detectDecisionType(renamedExe())).toBeNull();
    await expect(processDecisionFile(renamedExe())).rejects.toEqual(
      new DecisionFileError('type'),
    );
  });

  it('a ZIP that is not a Word file is the wrong type; a cut-off ZIP is unreadable', async () => {
    expect(checkDocx(plainZip())).toBe('notDocx');
    await expect(processDecisionFile(plainZip())).rejects.toEqual(
      new DecisionFileError('type'),
    );
    const cut = docx().subarray(0, 60);
    expect(checkDocx(cut)).toBe('broken');
    await expect(processDecisionFile(cut)).rejects.toEqual(
      new DecisionFileError('unreadable'),
    );
  });

  it('only PDF and images may open inline; a DOCX is always downloaded', () => {
    expect(mayOpenInline('application/pdf')).toBe(true);
    expect(mayOpenInline('image/jpeg')).toBe(true);
    expect(mayOpenInline('image/png')).toBe(true);
    expect(mayOpenInline(DOCX_MIME)).toBe(false);
  });
});
