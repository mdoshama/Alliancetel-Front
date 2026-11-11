import { DayHours, Schedule } from './models';
import { formatDay, formatWeekRange } from './date-utils';
import { formatTime } from './store-hours';

/** File name like "AllianceTel-San-Diego-2026-11-02.pdf" ("...-DRAFT.pdf" for a week not published yet). */
export function schedulePdfName(s: Schedule): string {
  const area = s.areaName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `AllianceTel-${area || 'Schedule'}-${s.weekStart}${s.status === 'DRAFT' ? '-DRAFT' : ''}.pdf`;
}

/** Each day: people working against the people the open stores need (their minimums), and the difference. */
export function workingVsNeeded(s: Schedule): { working: number; needed: number; diff: number; label: string }[] {
  return s.dates.map((_, i) => {
    const working = s.dailyHeadCount?.[i] ?? 0;
    const needed = (s.storeCoverage ?? [])
      .filter((c) => c.storeId !== null && !c.dailyHours[i]?.closed)
      .reduce((n, c) => n + c.minStaffPerDay, 0);
    const diff = working - needed;
    return { working, needed, diff, label: diff === 0 ? 'Exact' : diff > 0 ? `+${diff}` : `${-diff} short` };
  });
}

type Rgb = [number, number, number];

/** Dark, high-contrast palette for print: navy ink, slate lines, strong status colors. */
const INK: Rgb = [15, 23, 42];
const INK_SOFT: Rgb = [51, 65, 85];
const LINE: Rgb = [100, 116, 139];
const WHITE: Rgb = [255, 255, 255];
const ROW_ALT: Rgb = [248, 250, 252];
const MUTED: Rgb = [100, 116, 139];
const FAINT: Rgb = [148, 163, 184];
const DAY_OFF_FILL: Rgb = [255, 251, 235];
const DAY_OFF_LINE: Rgb = [253, 230, 138];
const AMBER_INK: Rgb = [146, 64, 14];
const GREEN: Rgb = [21, 128, 61];
const RED: Rgb = [185, 28, 28];
const ACCENT: Rgb = [37, 99, 235];
const NAVY_2: Rgb = [30, 41, 59];
const GRID: Rgb = [203, 213, 225];

/**
 * Builds the week as a landscape PDF for printing and sharing.
 *
 * Every section starts with the company header (AllianceTel, area, week, status). Section 1, schedule by employee: one
 * row per person, each work day a pale chip with a solid edge in its store's color and days off in amber (just
 * "Day off", not where it came from). Section 2, on its own page: schedule by store (hours and team each day), then a location card per
 * store. Every page has a footer with page numbers. jsPDF loads only when someone asks for the PDF.
 */
export async function buildSchedulePdf(s: Schedule): Promise<Blob> {
  // Team members A to Z, the same order as the schedule page.
  s = { ...s, rows: [...s.rows].sort((a, b) => a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: 'base' })) };
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const draft = s.status === 'DRAFT';
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin + 80;

  /**
   * Top of every section: the company header (logo mark, "AllianceTel", "Enterprise Suite"), the area and week and
   * the status badge on the right, then the section number and title under it.
   * @returns where the content can start
   */
  const band = (section: string, title: string): number => {
    const h = 74;
    // Navy header with a lighter strip at the bottom and a blue accent line.
    doc.setFillColor(...INK);
    doc.rect(0, 0, pageWidth, h, 'F');
    doc.setFillColor(...NAVY_2);
    doc.rect(0, h - 18, pageWidth, 18, 'F');
    doc.setFillColor(...ACCENT);
    doc.rect(0, h, pageWidth, 3, 'F');

    // Logo mark: "AT" on a blue rounded square.
    doc.setFillColor(...ACCENT);
    doc.roundedRect(margin, 12, 34, 34, 8, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('AT', margin + 17, 34, { align: 'center' });
    // Company name.
    doc.setFontSize(19);
    doc.text('AllianceTel', margin + 44, 29);
    doc.setFontSize(7.5);
    doc.setTextColor(147, 197, 253);
    doc.setCharSpace(1.6);
    doc.text('ENTERPRISE SUITE', margin + 45, 41);
    doc.setCharSpace(0);

    // Right: status badge, then area and week.
    const label = draft ? 'DRAFT · MAY STILL CHANGE' : 'PUBLISHED';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const w = doc.getTextWidth(label) + 22;
    doc.setFillColor(...(draft ? RED : GREEN));
    doc.roundedRect(pageWidth - margin - w, 12, w, 19, 9.5, 9.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(label, pageWidth - margin - w / 2, 24.5, { align: 'center' });
    doc.setFontSize(11);
    doc.text(s.areaName, pageWidth - margin, 45, { align: 'right' });

    // Strip: the week on the left, the section on the right.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(226, 232, 240);
    doc.text(`WEEK OF ${formatWeekRange(s.weekStart).toUpperCase()}`, margin, h - 6);
    doc.setTextColor(147, 197, 253);
    doc.setCharSpace(0.8);
    doc.text(section.toUpperCase(), pageWidth - margin, h - 6, { align: 'right' });
    doc.setCharSpace(0);

    // Section title under the header.
    const ty = h + 30;
    doc.setFillColor(...ACCENT);
    doc.roundedRect(margin, ty - 15, 4, 19, 2, 2, 'F');
    doc.setTextColor(...INK);
    doc.setFontSize(17);
    doc.text(title, margin + 12, ty);
    return ty + 10;
  };

  // ---- Section 1: schedule by employee ----------------------------------------------------------------------
  const top = band('Section 1 of 2', 'Schedule by employee');

  // Two-line day headers: "MON" over "NOV 16".
  const heads = s.dates.map((d) => {
    const [wd, md] = [formatDay(d, { weekday: 'short' }), formatDay(d, { month: 'short', day: 'numeric' })];
    return `${wd.toUpperCase()}\n${md.toUpperCase()}`;
  });
  const zebra = (row: number): Rgb => (row % 2 === 0 ? WHITE : ROW_ALT);
  /** Store colors, softened so the page reads calm and corporate: a pale wash with a solid edge. */
  const wash = (hex: string | null | undefined): Rgb => tint(hex, 0.9);

  /** A rounded chip inside a cell, with an optional colored edge on the left. */
  const chip = (x: number, y: number, w: number, h: number, fill: Rgb, edge?: Rgb, border?: Rgb) => {
    doc.setFillColor(...fill);
    if (border) {
      doc.setDrawColor(...border);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, y, w, h, 3, 3, 'FD');
    } else {
      doc.roundedRect(x, y, w, h, 3, 3, 'F');
    }
    if (edge) {
      doc.setFillColor(...edge);
      doc.roundedRect(x, y, 3, h, 1.5, 1.5, 'F');
    }
  };
  const write = (text: string, x: number, y: number, size: number, color: Rgb, bold: boolean, maxW: number,
    align: 'left' | 'center' = 'left') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const line = (doc.splitTextToSize(text, maxW) as string[])[0] ?? '';
    doc.text(line, x, y, { align, baseline: 'middle' });
  };

  // ---- Section 1 table ---------------------------------------------------------------------------------------
  autoTable(doc, {
    head: [['TEAM MEMBER', ...heads]],
    body: s.rows.map((r) => [r.employeeName, ...r.days.map(() => '')]),
    startY: top + 6,
    margin: { left: margin, right: margin, top: margin, bottom: 34 },
    theme: 'plain',
    styles: {
      font: 'helvetica', fontSize: 9, textColor: INK, minCellHeight: 32, valign: 'middle',
      cellPadding: { top: 4, bottom: 4, left: 8, right: 4 },
      lineColor: GRID, lineWidth: { bottom: 0.5 },
    },
    headStyles: {
      fillColor: INK, textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center', valign: 'middle',
      minCellHeight: 30, lineWidth: 0, cellPadding: { top: 4, bottom: 4, left: 8, right: 4 },
    },
    columnStyles: { 0: { cellWidth: 132 } },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index === 0) data.cell.styles.halign = 'left';
      if (data.section === 'body') data.cell.styles.fillColor = zebra(data.row.index);
    },
    willDrawCell: (data) => {
      if (data.column.index === 0 && data.section === 'body') data.cell.text = [];
    },
    didDrawCell: (data) => {
      const { x, y, width: w, height: h } = data.cell;
      const cx = x + w / 2;
      if (data.section !== 'body') return;
      const row = s.rows[data.row.index];
      if (!row) return;
      if (data.column.index === 0) {
        write(row.employeeName, x + 8, y + h / 2, 9.5, INK, true, w - 12);
        return;
      }
      const cell = row.days[data.column.index - 1];
      if (!cell) return;
      const px = x + 4, py = y + 4, pw = w - 8, ph = h - 8;
      if (cell.type === 'WORK') {
        chip(px, py, pw, ph, wash(cell.storeColor), rgb(cell.storeColor));
        write(cell.storeName ?? 'Work', px + 8, y + h / 2 - 4.5, 8, INK, true, pw - 10);
        if (cell.opensAt && cell.closesAt) {
          write(`${formatTime(cell.opensAt)} – ${formatTime(cell.closesAt)}`, px + 8, y + h / 2 + 5.5, 7, MUTED, false, pw - 10);
        }
      } else if (cell.type === 'REQUESTED_OFF') {
        chip(px, py, pw, ph, DAY_OFF_FILL, undefined, DAY_OFF_LINE);
        // Just "Day off": where it came from (requested, reserved, …) stays in the app.
        write('DAY OFF', cx, y + h / 2, 8, AMBER_INK, true, pw - 6, 'center');
      } else {
        write('Off', cx, y + h / 2, 8, FAINT, false, pw, 'center');
      }
    },
  });

  // Key: each store's color and code, then what Off and Day off mean.
  let ky = lastY() + 18;
  if (ky > pageHeight - 48) {
    doc.addPage();
    ky = margin + 10;
  }
  let kx = margin;
  const key = (label: string, fill: Rgb, edge?: Rgb, border?: Rgb) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const w = doc.getTextWidth(label) + 30;
    if (kx + w > pageWidth - margin) {
      kx = margin;
      ky += 18;
    }
    chip(kx, ky - 7, 16, 11, fill, edge, border);
    doc.setTextColor(...INK_SOFT);
    doc.text(label, kx + 21, ky + 1);
    kx += w;
  };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  doc.text('KEY', kx, ky + 1);
  kx += doc.getTextWidth('KEY') + 12;
  for (const st of s.stores) {
    key(st.name, wash(st.color), rgb(st.color));
  }
  key('Day off', DAY_OFF_FILL, undefined, DAY_OFF_LINE);
  key('Off · not scheduled', ROW_ALT, undefined, GRID);

  // ---- Section 2: schedule by store, always starting on its own page ----------------------------------------
  if (s.stores.length > 0) {
    const stores = storeDetails(s);
    doc.addPage();
    const t2 = band('Section 2 of 2', 'Schedule by store');
    // Each cell lists that day's hours and team; the text is drawn by hand below so the hours stand out.
    const teams = s.stores.map((st) => s.dates.map((_, i) => s.rows
      .filter((r) => r.days[i]?.type === 'WORK' && r.days[i]?.storeId === st.id)
      .map((r) => shortName(r.employeeName))));
    autoTable(doc, {
      head: [['STORE', ...heads]],
      body: stores.map((st) => [st.title, ...st.days]),
      startY: t2 + 6,
      margin: { left: margin, right: margin, top: margin, bottom: 34 },
      theme: 'plain',
      styles: {
        font: 'helvetica', fontSize: 8, textColor: INK, valign: 'top', minCellHeight: 40,
        cellPadding: { top: 9, bottom: 8, left: 8, right: 6 },
        lineColor: GRID, lineWidth: { bottom: 0.5 },
      },
      headStyles: {
        fillColor: INK, textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center', valign: 'middle',
        minCellHeight: 30, lineWidth: 0, cellPadding: { top: 4, bottom: 4, left: 12, right: 4 },
      },
      columnStyles: { 0: { cellWidth: 132 } },
      didParseCell: (data) => {
        if (data.section === 'head' && data.column.index === 0) data.cell.styles.halign = 'left';
        if (data.section === 'body') data.cell.styles.fillColor = zebra(data.row.index);
      },
      willDrawCell: (data) => {
        if (data.section === 'body') data.cell.text = [];
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const st = s.stores[data.row.index];
        const { x, y, width: w, height: h } = data.cell;
        if (data.column.index === 0) {
          doc.setFillColor(...rgb(st.color));
          doc.rect(x, y, 4, h, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(...INK);
          doc.text(doc.splitTextToSize(st.name, w - 20)[0] as string, x + 12, y + 14);
          if (st.code) {
            doc.setFontSize(7);
            const cw = doc.getTextWidth(st.code) + 10;
            chip(x + 12, y + 20, cw, 12, wash(st.color), undefined, tint(st.color, 0.55));
            doc.setTextColor(...shade(st.color, 0.5));
            doc.text(st.code, x + 12 + cw / 2, y + 28.3, { align: 'center' });
          }
          return;
        }
        const i = data.column.index - 1;
        const h0 = hoursOn(st.hours, s.dates[i]);
        if (!h0 || h0.closed) {
          chip(x + 4, y + 4, w - 8, h - 8, ROW_ALT, undefined, GRID);
          write('Closed', x + w / 2, y + h / 2, 8, FAINT, true, w - 10, 'center');
          return;
        }
        const hours = h0.opensAt && h0.closesAt ? `${formatTime(h0.opensAt)} – ${formatTime(h0.closesAt)}` : 'Open';
        doc.setFillColor(...rgb(st.color));
        doc.circle(x + 9, y + 11.5, 2, 'F');
        write(hours, x + 14, y + 12, 7.5, INK, true, w - 18);
        const team = teams[data.row.index][i];
        if (team.length === 0) {
          write('Nobody scheduled', x + 8, y + 24, 7.5, RED, true, w - 12);
        }
        team.forEach((name, k) => write(name, x + 8, y + 24 + k * 10, 7.5, INK_SOFT, false, w - 12));
      },
    });
  }

  // ---- Store locations: one card per store ----------------------------------------------------------------
  if (s.stores.length > 0) {
    const cols = 3;
    const gap = 12;
    const cardW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
    const cardH = 54;
    let y = lastY() + 22;
    if (y + 20 + cardH > pageHeight - 40) {
      doc.addPage();
      y = margin + 6;
    }
    doc.setFillColor(...ACCENT);
    doc.roundedRect(margin, y - 11, 4, 14, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text('Store locations', margin + 12, y);
    y += 12;
    s.stores.forEach((st, i) => {
      const col = i % cols;
      if (i > 0 && col === 0) {
        y += cardH + gap;
      }
      if (y + cardH > pageHeight - 40) {
        doc.addPage();
        y = margin + 6;
      }
      const x = margin + col * (cardW + gap);
      doc.setFillColor(...tint(st.color, 0.88));
      doc.setDrawColor(...tint(st.color, 0.5));
      doc.setLineWidth(0.8);
      doc.roundedRect(x, y, cardW, cardH, 6, 6, 'FD');
      doc.setFillColor(...rgb(st.color));
      doc.rect(x, y + 6, 4, cardH - 12, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...shade(st.color, 0.55));
      const name = doc.splitTextToSize(st.name, cardW - 70)[0] as string;
      doc.text(name, x + 14, y + 17);
      if (st.code) {
        doc.setFontSize(8);
        const cw = doc.getTextWidth(st.code) + 12;
        doc.setFillColor(...rgb(st.color));
        doc.roundedRect(x + cardW - cw - 10, y + 7, cw, 14, 7, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(st.code, x + cardW - cw / 2 - 10, y + 16.8, { align: 'center' });
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...INK_SOFT);
      // Map pin: a dot on a small triangle, in the store's color.
      doc.setFillColor(...rgb(st.color));
      doc.circle(x + 17, y + 29.5, 3, 'F');
      doc.triangle(x + 14.4, y + 31, x + 19.6, y + 31, x + 17, y + 36, 'F');
      doc.setFillColor(255, 255, 255);
      doc.circle(x + 17, y + 29.5, 1.1, 'F');
      const address = st.address?.trim() || 'No address on file';
      const lines = (doc.splitTextToSize(address, cardW - 40) as string[]).slice(0, 2);
      lines.forEach((line, k) => doc.text(line, x + 26, y + 33 + k * 11));
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
    doc.setTextColor(...ACCENT);
    doc.text('AllianceTel', margin, pageHeight - 12);
    const brandW = doc.getTextWidth('AllianceTel ');
    doc.setTextColor(...INK_SOFT);
    doc.setFont('helvetica', 'normal');
    doc.text(`Enterprise Suite  ·  ${s.areaName}  ·  ${formatWeekRange(s.weekStart)}${draft ? '  ·  DRAFT' : ''}`,
      margin + brandW, pageHeight - 12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, pageHeight - 12, { align: 'right' });
  }

  return doc.output('blob');
}

/** Each store's line in the PDF: name and code, then each day's hours and the people working there. */
export function storeDetails(s: Schedule): { title: string; color: string; days: string[]; closed: boolean[] }[] {
  return s.stores.map((st) => {
    // The address is on the store's location card below the table.
    const title = st.name + (st.code ? ` (${st.code})` : '');
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
