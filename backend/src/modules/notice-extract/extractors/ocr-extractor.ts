import { Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import type { ExtractWarning, NoticeExtraction } from '../notice-extract.types';
import { OcrEngineService } from '../ocr/ocr-engine.service';
import { parseNotice } from '../parse/notice-parser';
import { warning } from '../parse/notice-warnings';
import { readPdfPageImages, readPdfText } from '../text/pdf-pages';
import { hasUsableBanglaText } from '../text/text-quality';
import type { NoticeExtractor, NoticeFileInput } from './notice-extractor';

/** Where the text came from (only for the caller's diagnostics, never stored). */
export type TextSource = 'DOCX' | 'PDF_TEXT' | 'OCR';

/**
 * The local extractor (v1.21, SPEC.md §6.12): no network, no system tools.
 * - DOCX: the text (mammoth);
 * - PDF: the text layer if it holds real Bangla text, otherwise OCR of page 1 (and 2);
 * - JPEG / PNG: OCR.
 * Then the fixed-format parser. The text is never logged or stored.
 */
@Injectable()
export class OcrExtractor implements NoticeExtractor {
  readonly method = 'OCR' as const;
  private readonly logger = new Logger(OcrExtractor.name);

  constructor(private readonly ocr: OcrEngineService) {}

  async extract(file: NoticeFileInput): Promise<NoticeExtraction> {
    const { text, warnings } = await this.readText(file);
    if (!text.trim()) warnings.push(warning('TEXT_EMPTY'));
    const parsed = parseNotice(text);
    return {
      method: this.method,
      fields: parsed.fields,
      chairText: parsed.chairText,
      participants: parsed.participants,
      warnings: [...warnings, ...parsed.warnings],
    };
  }

  private async readText(
    file: NoticeFileInput,
  ): Promise<{ text: string; source: TextSource; warnings: ExtractWarning[] }> {
    if (file.type === 'docx') {
      const result = await mammoth.extractRawText({ buffer: file.content });
      return { text: result.value, source: 'DOCX', warnings: [] };
    }
    if (file.type === 'pdf') {
      const layer = await readPdfText(file.content);
      if (hasUsableBanglaText(layer.text))
        return { text: layer.text, source: 'PDF_TEXT', warnings: [] };
      const images = await readPdfPageImages(file.content);
      return this.ocrImages(images);
    }
    return this.ocrImages([file.content]);
  }

  private async ocrImages(
    images: Buffer[],
  ): Promise<{ text: string; source: TextSource; warnings: ExtractWarning[] }> {
    const warnings: ExtractWarning[] = [warning('OCR_USED')];
    const parts: string[] = [];
    for (const image of images) {
      try {
        parts.push(await this.ocr.recognize(image));
      } catch (err) {
        // Only the error type: never the content.
        this.logger.warn(
          `OCR page failed: ${err instanceof Error ? err.name : 'unknown'}`,
        );
        warnings.push(warning('OCR_PAGE_FAILED'));
      }
    }
    return { text: parts.join('\n'), source: 'OCR', warnings };
  }
}
