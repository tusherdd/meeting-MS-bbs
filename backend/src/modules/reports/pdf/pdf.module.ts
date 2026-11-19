import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';

/** One PdfService (one lazy, shared browser) for the whole app's report PDFs. */
@Module({
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
