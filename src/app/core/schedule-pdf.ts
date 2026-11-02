import { DayCell, Schedule } from './models';
import { formatDay, formatWeekRange } from './date-utils';
import { formatTime } from './store-hours';

/** File name like "AllianceTel-San-Diego-2026-11-02.pdf". */
export function schedulePdfName(s: Schedule): string {
  const area = s.areaName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `AllianceTel-${area || 'Schedule'}-${s.weekStart}.pdf`;
}

/** What one day says in the PDF: "Oceanside\n10:00 AM – 8:00 PM", "Off" or "Day off (approved)". */
export function pdfCellText(cell: DayCell): string {
  if (cell.type === 'OFF') {
    return 'Off';
  }
  if (cell.type === 'REQUESTED_OFF') {
    return 'Day off';
  }
  const where = cell.storeName ?? 'Work';
  return cell.opensAt && cell.closesAt
    ? `${where}\n${formatTime(cell.opensAt)} – ${formatTime(cell.closesAt)}`
    : where;
}

/**
 * Builds the published week as a one-page landscape PDF: one row per person, one column per day, with each store's
 * color on its days. jsPDF is loaded only when someone asks for the PDF, so it doesn't slow down the app.
 */
export async function buildSchedulePdf(s: Schedule): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`AllianceTel · ${s.areaName}`, margin, margin + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Weekly schedule · ${formatWeekRange(s.weekStart)}`, margin, margin + 22);
  if (s.publishedAt) {
    const published = new Date(s.publishedAt).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    doc.text(`Published ${published}`, pageWidth - margin, margin + 22, { align: 'right' });
  }
  doc.setTextColor(0);

  const head = [['Employee', ...s.dates.map((d) => formatDay(d, { weekday: 'short', month: 'short', day: 'numeric' }))]];
  const body = s.rows.map((r) => [r.employeeName, ...r.days.map(pdfCellText)]);

  autoTable(doc, {
    head,
    body,
    startY: margin + 36,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 4, valign: 'middle', lineColor: [222, 226, 230], lineWidth: 0.5 },
    headStyles: { fillColor: [33, 37, 41], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' } },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index === 0) {
        return;
      }
      const cell = s.rows[data.row.index]?.days[data.column.index - 1];
      if (!cell) {
        return;
      }
      data.cell.styles.halign = 'center';
      if (cell.type !== 'WORK') {
        data.cell.styles.fillColor = [241, 243, 245];
        data.cell.styles.textColor = [108, 117, 125];
        data.cell.styles.fontStyle = 'italic';
      } else if (cell.storeColor) {
        data.cell.styles.fillColor = tint(cell.storeColor);
      }
    },
  });

  // Footer under the table.
  const endY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin + 60;
  doc.setFontSize(8);
  doc.setTextColor(108);
  doc.text(
    `${s.rows.length} people · Off = regular day off · Day off = approved request · Generated ${new Date().toLocaleDateString('en-US')}`,
    margin,
    Math.min(endY + 16, doc.internal.pageSize.getHeight() - 16),
  );

  return doc.output('blob');
}

/** A light version of a store color (e.g. "#2563EB") so the text on it stays readable when printed. */
function tint(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    return [255, 255, 255];
  }
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.8);
  return [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
}

/** Saves the PDF to the device. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Opens the device's share sheet with the PDF attached (WhatsApp, Mail, Messages… on phones and most laptops).
 * Resolves 'shared', 'cancelled', or 'unsupported' when the browser can't share files.
 */
export async function sharePdf(blob: Blob, fileName: string, title: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) {
    return 'unsupported';
  }
  try {
    await nav.share({ files: [file], title, text: title });
    return 'shared';
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') {
      return 'cancelled';
    }
    throw e;
  }
}
