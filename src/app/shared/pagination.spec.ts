import { TestBed } from '@angular/core/testing';
import { Pagination } from './pagination';

describe('Pagination', () => {
  function render(page: number, size: number, total: number) {
    const fixture = TestBed.createComponent(Pagination);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('size', size);
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('label', 'people');
    fixture.detectChanges();
    return fixture;
  }

  it('shows the range and page links', () => {
    const el: HTMLElement = render(1, 25, 132).nativeElement;
    expect(el.querySelector('.pager-info')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Showing 26–50 of 132 people');
    const nums = [...el.querySelectorAll('.pager-num')].map((li) => li.textContent?.trim());
    expect(nums).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(el.querySelector('.pager-num.active')?.textContent?.trim()).toBe('2');
  });

  it('emits the page clicked and the new size', () => {
    const fixture = render(0, 10, 45);
    const pages: number[] = [];
    const sizes: number[] = [];
    fixture.componentInstance.pageChange.subscribe((p) => pages.push(p));
    fixture.componentInstance.sizeChange.subscribe((s) => sizes.push(s));
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelectorAll('.pager-num button')[2] as HTMLButtonElement).click();
    (el.querySelector('[aria-label="Next page"]') as HTMLButtonElement).click();
    (el.querySelector('[aria-label="Previous page"]') as HTMLButtonElement).click(); // disabled on page 1
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    expect(pages).toEqual([2, 1]);
    expect(sizes).toEqual([50]);
  });

  it('hides page links when everything fits and the bar when empty', () => {
    expect((render(0, 25, 8).nativeElement as HTMLElement).querySelector('.pagination')).toBeNull();
    expect((render(0, 25, 0).nativeElement as HTMLElement).querySelector('.pager')).toBeNull();
  });
});
