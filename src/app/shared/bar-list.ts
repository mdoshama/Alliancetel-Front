import { Component, computed, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

export interface BarItem {
  id: number;
  label: string;
  value: number;
  /** Shown in the tooltip under the value, e.g. "3 NL/AAL · 1 UPG". */
  detail?: string;
}

/**
 * Horizontal bars, one series, ranked: one hue, thin bars from a shared baseline, the value at each tip.
 * Rows are buttons when `selectable` (opens that person). The values are always visible, so the tooltip only adds detail.
 */
@Component({
  selector: 'app-bar-list',
  imports: [],
  template: `
    <ul class="bar-list" [attr.aria-label]="label()">
      @for (b of rows(); track b.id) {
        <li>
          <button type="button" class="bar-row" [disabled]="!selectable()" (click)="picked.emit(b.id)"
                  (mouseenter)="active.set(b.id)" (mouseleave)="active.set(null)" (focus)="active.set(b.id)" (blur)="active.set(null)"
                  [attr.aria-label]="b.label + ': ' + display(b.value) + (b.detail ? ', ' + b.detail : '')">
            <span class="bar-label">{{ b.label }}</span>
            <span class="bar-track">
              <span class="bar" [style.width.%]="b.pct"></span>
              <span class="bar-value">{{ display(b.value) }}</span>
            </span>
          </button>
        </li>
      } @empty {
        <li class="text-muted-2 small py-3">Nothing to show for this period.</li>
      }
    </ul>
    @if (hasDetail()) {
      <div class="bar-readout" aria-live="polite">
        @if (activeRow(); as a) { <strong>{{ a.label }}</strong> · {{ a.detail }} } @else { <span class="text-muted-2">Hover or focus a bar for the breakdown.</span> }
      </div>
    }
  `,
  styles: `
    .bar-list { list-style: none; margin: 0; padding: 0; }
    .bar-row {
      position: relative; display: grid; grid-template-columns: minmax(7rem, 11rem) 1fr; align-items: center;
      gap: 0.75rem; width: 100%; padding: 0.3rem 0.25rem; border: 0; background: none; text-align: left;
      border-radius: 0.4rem; color: inherit; font-variant-numeric: tabular-nums;
    }
    .bar-row:not(:disabled) { cursor: pointer; }
    .bar-row:not(:disabled):hover, .bar-row:focus-visible { background: var(--at-page-bg); }
    .bar-row:focus-visible { outline: 2px solid var(--at-primary); outline-offset: 1px; }
    .bar-label { font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
    .bar { height: 14px; min-width: 2px; background: var(--at-primary); border-radius: 0 4px 4px 0; flex: none; }
    .bar-value { font-size: 0.82rem; font-weight: 600; white-space: nowrap; color: var(--at-navy); }
    .bar-readout { min-height: 1.4rem; margin-top: 0.4rem; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
    @media (max-width: 575.98px) { .bar-row { grid-template-columns: 6.5rem 1fr; } }
  `,
})
export class BarList {
  readonly items = input<BarItem[]>([]);
  readonly format = input<'count' | 'money'>('count');
  readonly label = input('');
  readonly selectable = input(false);
  readonly picked = output<number>();

  private readonly currency = new CurrencyPipe('en-US');
  protected readonly active = signal<number | null>(null);
  protected readonly hasDetail = computed(() => this.items().some((i) => !!i.detail));
  protected readonly activeRow = computed(() => this.items().find((i) => i.id === this.active() && i.detail) ?? null);

  protected readonly rows = computed(() => {
    const items = this.items();
    const max = Math.max(0, ...items.map((i) => i.value));
    // Leave room at the tip for the value label.
    return items.map((i) => ({ ...i, pct: max > 0 ? (i.value / max) * 82 : 0 }));
  });

  protected display(v: number): string {
    return this.format() === 'money' ? (this.currency.transform(v) ?? '') : String(v);
  }
}
