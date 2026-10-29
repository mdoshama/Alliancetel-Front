import { matchesSearch, pageItems, slicePage } from './paging';

describe('paging', () => {
  it('lists every page when there are few', () => {
    expect(pageItems(0, 1)).toEqual([0]);
    expect(pageItems(2, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(pageItems(0, 0)).toEqual([]);
  });

  it('shows gaps around the current page of a long list', () => {
    expect(pageItems(10, 20)).toEqual([0, null, 9, 10, 11, null, 19]);
    expect(pageItems(0, 20)).toEqual([0, 1, 2, 3, 4, null, 19]);
    expect(pageItems(19, 20)).toEqual([0, null, 15, 16, 17, 18, 19]);
  });

  it('keeps the bar the same length wherever you are', () => {
    for (let p = 0; p < 30; p++) expect(pageItems(p, 30).length).toBe(7);
    expect(pageItems(4, 10)).toEqual([0, null, 3, 4, 5, null, 9]);
  });

  it('slices a list and keeps the page in range', () => {
    const list = Array.from({ length: 23 }, (_, i) => i);
    const last = slicePage(list, 2, 10);
    expect(last.content).toEqual([20, 21, 22]);
    expect(last.totalPages).toBe(3);
    expect(slicePage(list, 9, 10).page).toBe(2);
    expect(slicePage([], 3, 10)).toEqual({ content: [], page: 0, size: 10, totalElements: 0, totalPages: 0 });
  });

  it('matches every word in any field, ignoring case and accents', () => {
    expect(matchesSearch('ana ocean', 'Ana López', 'Oceanside')).toBe(true);
    expect(matchesSearch('lopez', 'Ana López')).toBe(true);
    expect(matchesSearch('ana north', 'Ana López', 'Oceanside')).toBe(false);
    expect(matchesSearch('  ', 'anything')).toBe(true);
  });
});
