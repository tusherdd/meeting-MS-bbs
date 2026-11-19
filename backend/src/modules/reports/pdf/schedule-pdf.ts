import {
  MEASURE_ATTR,
  PAGE_CONTENT_HEIGHT_PX,
  PAGE_CONTENT_WIDTH_PX,
  renderScheduleHtml,
  type ScheduleHeader,
} from './report-template';
import { paginateRows, type ScheduleRow } from './schedule-format';

/** What the two passes need from PdfService (a fake in unit tests). */
export interface PdfRenderer {
  measure(html: string, widthPx: number, attr: string): Promise<number[]>;
  render(html: string): Promise<Buffer>;
}

/**
 * The report PDF "কর্মসূচি" in two passes (v1.14): measure the header block, the table header and
 * every row in Chromium, split the rows into pages (rows never split; a date cell is repeated
 * on a new page), then print one table per page. Chromium itself never repeats a rowspan cell.
 */
export async function buildSchedulePdf(
  pdf: PdfRenderer,
  header: ScheduleHeader,
  rows: readonly ScheduleRow[],
): Promise<Buffer> {
  let pages: number[][] | undefined;
  if (rows.length > 0) {
    const heights = await pdf.measure(
      renderScheduleHtml({ header, rows, mode: 'measure' }),
      PAGE_CONTENT_WIDTH_PX,
      MEASURE_ATTR,
    );
    // [header block, table header, ...rows]; anything else → one table (Chromium breaks it).
    if (heights.length === rows.length + 2) {
      const [top, tableHeader, ...rowHeights] = heights;
      pages = paginateRows(rowHeights, {
        firstPage: PAGE_CONTENT_HEIGHT_PX - top,
        otherPages: PAGE_CONTENT_HEIGHT_PX,
        tableHeader,
      });
    }
  }
  return pdf.render(renderScheduleHtml({ header, rows, pages }));
}
