import { Page } from './models';

/** Page sizes offered under every list. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

const SIZE_KEY = 'alliancetel.pageSize';

/** The page size this browser last chose (25 when unknown or storage is unavailable). */
export function savedPageSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY));
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function savePageSize(size: number): void {
  try {
    localStorage.setItem(SIZE_KEY, String(size));
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}

/**
 * Page links to show, 0-based, with null for a gap ("…"). Always shows the first and last page and
 * the pages next to the current one, e.g. 0 … 4 5 6 … 19.
 */
export function pageItems(current: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const keep = new Set([0, totalPages - 1, current - 1, current, current + 1]);
  // Near either end, show a few more so the bar keeps the same width.
  if (current <= 3) [1, 2, 3, 4].forEach((i) => keep.add(i));
  if (current >= totalPages - 4) [1, 2, 3, 4].forEach((i) => keep.add(totalPages - 1 - i));
  const pages = [...keep].filter((i) => i >= 0 && i < totalPages).sort((a, b) => a - b);
  const items: (number | null)[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) items.push(p - pages[i - 1] === 2 ? p - 1 : null);
    items.push(p);
  });
  return items;
}

/** One page of a list held in the browser (for short lists such as stores and areas). */
export function slicePage<T>(list: readonly T[], page: number, size: number): Page<T> {
  const totalPages = Math.ceil(list.length / size);
  const p = Math.min(Math.max(0, page), Math.max(0, totalPages - 1));
  return {
    content: list.slice(p * size, p * size + size),
    page: p,
    size,
    totalElements: list.length,
    totalPages,
  };
}

/** Case- and accent-insensitive text for searching. */
export function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** True when every word of the query appears in one of the fields ("ana ocean" finds Ana at Oceanside). */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.map(normalize).join(' ');
  return words.every((w) => haystack.includes(w));
}
