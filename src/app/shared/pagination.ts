import { Component, computed, input, output } from '@angular/core';
import { PAGE_SIZES, pageItems } from '../core/paging';

/**
 * Page bar under a list: "Showing 26–50 of 132 people", page links with Previous / Next, and rows per page.
 * Pages start at 0 in code and at 1 on screen.
 */
@Component({
  selector: 'app-pagination',
  template: `
    @if (total() > 0) {
      <nav class="pager" [attr.aria-label]="label() + ' pages'">
        <div class="pager-info">
          Showing <strong>{{ from() }}–{{ to() }}</strong> of <strong>{{ total() }}</strong> {{ label() }}
        </div>
        @if (total() > sizes[0]) {
          <label class="pager-size">
            <span>Rows</span>
            <select class="form-select form-select-sm" [value]="size()" (change)="onSize($event)" aria-label="Rows per page">
              @for (s of sizes; track s) {
                <option [value]="s" [selected]="s === size()">{{ s }}</option>
              }
            </select>
          </label>
        }
        @if (totalPages() > 1) {
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item" [class.disabled]="page() === 0">
              <button type="button" class="page-link" (click)="go(page() - 1)" [disabled]="page() === 0" aria-label="Previous page">
                <i class="bi bi-chevron-left"></i><span class="pager-word">Previous</span>
              </button>
            </li>
            @for (item of items(); track $index) {
              @if (item === null) {
                <li class="page-item disabled pager-gap"><span class="page-link">…</span></li>
              } @else {
                <li class="page-item pager-num" [class.active]="item === page()">
                  <button type="button" class="page-link" (click)="go(item)" [attr.aria-current]="item === page() ? 'page' : null">
                    {{ item + 1 }}
                  </button>
                </li>
              }
            }
            <li class="page-item pager-of"><span class="page-link">{{ page() + 1 }} / {{ totalPages() }}</span></li>
            <li class="page-item" [class.disabled]="page() >= totalPages() - 1">
              <button type="button" class="page-link" (click)="go(page() + 1)" [disabled]="page() >= totalPages() - 1" aria-label="Next page">
                <span class="pager-word">Next</span><i class="bi bi-chevron-right"></i>
              </button>
            </li>
          </ul>
        }
      </nav>
    }
  `,
})
export class Pagination {
  /** Current page, starting at 0. */
  readonly page = input.required<number>();
  readonly size = input.required<number>();
  /** Items across all pages. */
  readonly total = input.required<number>();
  /** What is being counted, e.g. "people" or "requests". */
  readonly label = input('items');

  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();

  protected readonly sizes = PAGE_SIZES;
  protected readonly totalPages = computed(() => Math.ceil(this.total() / this.size()));
  protected readonly items = computed(() => pageItems(this.page(), this.totalPages()));
  protected readonly from = computed(() => Math.min(this.total(), this.page() * this.size() + 1));
  protected readonly to = computed(() => Math.min(this.total(), (this.page() + 1) * this.size()));

  protected go(page: number): void {
    if (page >= 0 && page < this.totalPages() && page !== this.page()) {
      this.pageChange.emit(page);
    }
  }

  protected onSize(event: Event): void {
    this.sizeChange.emit(Number((event.target as HTMLSelectElement).value));
  }
}
