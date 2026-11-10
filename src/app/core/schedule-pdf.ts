import { DayCell, DayHours, Schedule } from './models';
import { formatDay, formatWeekRange } from './date-utils';
import { formatTime } from './store-hours';

/** File name like "AllianceTel-San-Diego-2026-11-02.pdf" ("...-DRAFT.pdf" for a week not published yet). */
export function schedulePdfName(s: Schedule): string {
  const area = s.areaName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `AllianceTel-${area || 'Schedule'}-${s.weekStart}${s.status === 'DRAFT' ? '-DRAFT' : ''}.pdf`;
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

type Rgb = [number, number, number];

/** Dark, high-contrast palette for print: navy ink, slate lines, strong status colors. */
const INK: Rgb = [15, 23, 42];
const INK_SOFT: Rgb = [51, 65, 85];
const LINE: Rgb = [100, 116, 139];
const OFF_FILL: Rgb = [226, 232, 240];
const DAY_OFF_FILL: Rgb = [254, 243, 199];
const DAY_OFF_INK: Rgb = [146, 64, 14];
const GREEN: Rgb = [21, 128, 61];
const RED: Rgb = [185, 28, 28];

/**
 * Builds the week as a landscape PDF for printing and sharing.
 *
 * Page 1 (and on, if the team is long): a dark header band with the area, week and status, then one row per person
 * and one column per day in bold type, each work day tinted with its store's color and marked with a store-color bar,
 * plus a color key. Store details (code, address, each day's hours and who works there) start on a page of their
 * own. Every page carries a footer with page numbers. jsPDF loads only when someone asks for the PDF.
 */
export async function buildSchedulePdf(s: Schedule): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const draft = s.status === 'DRAFT';
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin + 80;
  const dayHeads = s.dates.map((d) => formatDay(d, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase());

  /** Dark band across the top of a page with a title, a subtitle and the status badge. */
  const band = (title: string, subtitle: string): number => {
    const h = 58;
    doc.setFillColor(...INK);
    doc.rect(0, 0, pageWidth, h, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(title, margin, 27);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(203, 213, 225);
    doc.text(subtitle, margin, 44);
    // Status badge on the right: green PUBLISHED or red DRAFT.
    const label = draft ? 'DRAFT · MAY STILL CHANGE' : 'PUBLISHED';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const w = doc.getTextWidth(label) + 20;
    doc.setFillColor(...(draft ? RED : GREEN));
    doc.roundedRect(pageWidth - margin - w, 14, w, 20, 10, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, pageWidth - margin - w / 2, 27.5, { align: 'center' });
    const when = draft ? `Printed ${stamp(new Date())}` : s.publishedAt ? `Published ${stamp(new Date(s.publishedAt))}` : '';
    if (when) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      doc.text(when, pageWidth - margin, 47, { align: 'right' });
    }
    doc.setTextColor(...INK);
    return h;
  };

  // ---- Page 1: the week, person by person ------------------------------------------------------------------
  const top = band(`AllianceTel · ${s.areaName}`, `${draft ? 'Draft schedule' : 'Weekly schedule'} · ${formatWeekRange(s.weekStart)}`);

  // Quick numbers under the band.
  const shifts = s.rows.reduce((n, r) => n + r.days.filter((d) => d.type === 'WORK').length, 0);
  const facts = [`${s.rows.length} people`, `${shifts} shifts`, `${s.stores.length} stores`];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  let fx = margin;
  for (const f of facts) {
    const w = doc.getTextWidth(f) + 18;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.6);
    doc.roundedRect(fx, top + 10, w, 18, 4, 4, 'FD');
    doc.setTextColor(...INK);
    doc.text(f, fx + 9, top + 22.5);
    fx += w + 8;
  }

  const body = s.rows.map((r) => [r.employeeName, ...r.days.map(pdfCellText)]);
  autoTable(doc, {
    head: [['EMPLOYEE', ...dayHeads]],
    body,
    startY: top + 38,
    margin: { left: margin, right: margin, top: margin, bottom: 34 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      fontStyle: 'bold',
      textColor: INK,
      cellPadding: { top: 5, bottom: 5, left: 6, right: 4 },
      valign: 'middle',
      lineColor: LINE,
      lineWidth: 0.6,
    },
    headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center', valign: 'middle' },
    columnStyles: { 0: { cellWidth: 128, fontSize: 9.5, halign: 'left' } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index === 0) {
        if (data.section === 'head' && data.column.index === 0) data.cell.styles.halign = 'left';
        return;
      }
      const cell = s.rows[data.row.index]?.days[data.column.index - 1];
      if (!cell) return;
      data.cell.styles.halign = 'center';
      if (cell.type === 'OFF') {
        data.cell.styles.fillColor = OFF_FILL;
        data.cell.styles.textColor = INK_SOFT;
      } else if (cell.type === 'REQUESTED_OFF') {
        data.cell.styles.fillColor = DAY_OFF_FILL;
        data.cell.styles.textColor = DAY_OFF_INK;
      } else if (cell.storeColor) {
        data.cell.styles.fillColor = tint(cell.storeColor, 0.72);
        data.cell.styles.textColor = shade(cell.storeColor, 0.55);
      }
    },
    didDrawCell: (data) => {
      // A solid store-color bar on the left of each work day, so stores read at a glance (and in black & white).
      if (data.section !== 'body' || data.column.index === 0) return;
      const cell = s.rows[data.row.index]?.days[data.column.index - 1];
      if (cell?.type === 'WORK' && cell.storeColor) {
        doc.setFillColor(...rgb(cell.storeColor));
        doc.rect(data.cell.x, data.cell.y, 4, data.cell.height, 'F');
      }
    },
  });

  // Color key: each store's color and code, plus what Off and Day off mean.
  let ky = lastY() + 16;
  if (ky > pageHeight - 48) {
    doc.addPage();
    ky = margin + 10;
  }
  doc.setFontSize(8.5);
  let kx = margin;
  const key = (fill: Rgb, label: string, bar?: Rgb) => {
    const w = doc.getTextWidth(label) + 26;
    if (kx + w > pageWidth - margin) {
      kx = margin;
      ky += 18;
    }
    doc.setFillColor(...fill);
    doc.setDrawColor(...LINE);
    doc.rect(kx, ky - 9, 14, 12, 'FD');
    if (bar) {
      doc.setFillColor(...bar);
      doc.rect(kx, ky - 9, 3.5, 12, 'F');
    }
    doc.setTextColor(...INK);
    doc.text(label, kx + 19, ky);
    kx += w;
  };
  doc.setFont('helvetica', 'bold');
  doc.text('KEY', kx, ky);
  kx += doc.getTextWidth('KEY') + 10;
  for (const st of s.stores) {
    key(tint(st.color, 0.72), st.code || st.label || st.name, rgb(st.color));
  }
  key(OFF_FILL, 'Off = regular day off');
  key(DAY_OFF_FILL, 'Day off = approved request');

  // ---- Store details: always on their own page ---------------------------------------------------------------
  if (s.stores.length > 0) {
    const stores = storeDetails(s);
    const boldHours = new Map<object, string[]>();
    doc.addPage();
    const t2 = band(`Store details · ${s.areaName}`, `Hours and team for each day · ${formatWeekRange(s.weekStart)}`);
    autoTable(doc, {
      head: [['STORE', ...dayHeads]],
      body: stores.map((st) => [st.title, ...st.days]),
      startY: t2 + 14,
      margin: { left: margin, right: margin, top: margin, bottom: 34 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        textColor: INK,
        cellPadding: { top: 6, bottom: 6, left: 6, right: 5 },
        valign: 'top',
        lineColor: LINE,
        lineWidth: 0.6,
      },
      headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center', valign: 'middle' },
      columnStyles: { 0: { cellWidth: 150, fontStyle: 'bold', fontSize: 9.5, cellPadding: { top: 6, bottom: 6, left: 12, right: 5 } } },
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index === 0) data.cell.styles.halign = 'left';
        if (data.section !== 'body') return;
        const st = stores[data.row.index];
        if (data.column.index === 0) {
          data.cell.styles.fillColor = tint(st.color, 0.72);
          data.cell.styles.textColor = shade(st.color, 0.55);
        } else if (st.closed[data.column.index - 1]) {
          data.cell.styles.fillColor = OFF_FILL;
          data.cell.styles.textColor = INK_SOFT;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.halign = 'center';
          data.cell.styles.valign = 'middle';
        }
      },
      willDrawCell: (data) => {
        // Open days: the hours line(s) are drawn in bold below (didDrawCell), so the table leaves them blank here.
        if (data.section !== 'body' || data.column.index === 0) return;
        if (stores[data.row.index].closed[data.column.index - 1]) return;
        const n = hoursLineCount(String(data.cell.raw ?? ''), data.cell.text);
        boldHours.set(data.cell, data.cell.text.slice(0, n));
        data.cell.text = [...data.cell.text.map((t, i) => (i < n ? '' : t))];
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        if (data.column.index === 0) {
          doc.setFillColor(...rgb(stores[data.row.index].color));
          doc.rect(data.cell.x, data.cell.y, 6, data.cell.height, 'F');
          return;
        }
        const lines = boldHours.get(data.cell);
        if (!lines?.length) return;
        const fontSize = data.cell.styles.fontSize;
        const lineHeight = (fontSize * doc.getLineHeightFactor());
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(...INK);
        lines.forEach((line, i) => {
          doc.text(line, data.cell.x + data.cell.padding('left'), data.cell.y + data.cell.padding('top') + i * lineHeight,
            { baseline: 'top' });
        });
      },
    });
  }

  // ---- Footer on every page ----------------------------------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.6);
    doc.line(margin, pageHeight - 24, pageWidth - margin, pageHeight - 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK_SOFT);
    doc.text(`AllianceTel Enterprise · ${s.areaName} · ${formatWeekRange(s.weekStart)}${draft ? ' · DRAFT' : ''}`,
      margin, pageHeight - 12);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 12, { align: 'right' });
  }

  return doc.output('blob');
}

/** How many of a cell's wrapped lines belong to its first line of text (the hours). */
export function hoursLineCount(raw: string, lines: string[]): number {
  const first = raw.split('\n')[0].replace(/\s+/g, '');
  let joined = '';
  for (let i = 0; i < lines.length; i++) {
    joined += lines[i].replace(/\s+/g, '');
    if (joined.length >= first.length) return i + 1;
  }
  return lines.length;
}

/** "Nov 9, 2026, 6:15 PM". */
function stamp(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Each store's line in the PDF: name, code and address, then each day's hours and the people working there. */
export function storeDetails(s: Schedule): { title: string; color: string; days: string[]; closed: boolean[] }[] {
  return s.stores.map((st) => {
    const title = [st.name + (st.code ? ` (${st.code})` : ''), st.address?.trim() || null].filter(Boolean).join('\n');
    const closed: boolean[] = [];
    const days = s.dates.map((date, i) => {
      const h = hoursOn(st.hours, date);
      if (!h || h.closed) {
        closed.push(true);
        return 'Closed';
      }
      closed.push(false);
      const team = s.rows
        .filter((r) => r.days[i]?.type === 'WORK' && r.days[i]?.storeId === st.id)
        .map((r) => shortName(r.employeeName));
      const hours = h.opensAt && h.closesAt ? `${formatTime(h.opensAt)} – ${formatTime(h.closesAt)}` : 'Open';
      // One person per line, so a name never breaks across lines.
      return [hours, ...(team.length ? team : ['Nobody scheduled'])].join('\n');
    });
    return { title, color: st.color, days, closed };
  });
}

/** The store's hours on a date (hours are listed by weekday). */
function hoursOn(hours: DayHours[], date: string): DayHours | undefined {
  const day = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][
    new Date(date + 'T00:00:00').getDay()
  ];
  return hours.find((h) => h.day === day);
}

/** "Aisha Khan" → "Aisha K." so a day's team fits in its cell. */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : full;
}

/** A store color (e.g. "#2563EB") as RGB; slate gray if it isn't a valid color. */
function rgb(hex: string | null | undefined): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) {
    return [100, 116, 139];
  }
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A light version of a store color, so bold dark text on it stays readable when printed. */
export function tint(hex: string | null | undefined, amount = 0.8): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) {
    return [255, 255, 255];
  }
  const [r, g, b] = rgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return [mix(r), mix(g), mix(b)];
}

/** A dark version of a store color for text on its tint (keeps strong contrast). */
export function shade(hex: string | null | undefined, amount = 0.55): Rgb {
  const [r, g, b] = rgb(hex);
  const mix = (c: number) => Math.round(c * (1 - amount));
  return [mix(r), mix(g), mix(b)];
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
