import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';

/**
 * One PdfService (one lazy, shared browser) for the whole app: report PDFs and the meeting
 * notice (v1.10) both import this module instead of providing their own PdfService.
 */
@Module({
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
