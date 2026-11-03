import { Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { formatDay } from '../core/date-utils';

export interface DayValue {
  date: string;
  value: number;
}

/**
 * One value per day as columns: one hue, thin columns with a 4px rounded top on a single baseline, hairline grid,
 * clean y ticks. Hover or focus a day for its value; "Show as table" lists every day.
 */
@Component({
  selector: 'app-day-columns',
  imports: [],
  template: `
    <div class="dc">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="label()" class="dc-svg">
        @for (t of ticks(); track t) {
          <line [attr.x1]="PL" [attr.x2]="W - PR" [attr.y1]="y(t)" [attr.y2]="y(t)" class="grid" />
          <text [attr.x]="PL - 6" [attr.y]="y(t) + 4" text-anchor="end" class="tick">{{ tickLabel(t) }}</text>
        }
        @for (d of cols(); track d.date; let i = $index) {
          <g class="col" tabindex="0" (mouseenter)="hover.set(i)" (mouseleave)="hover.set(null)" (focus)="hover.set(i)" (blur)="hover.set(null)"
             [attr.aria-label]="dayLabel(d.date) + ': ' + display(d.value)">
            <rect [attr.x]="d.x - slot / 2" [attr.y]="PT" [attr.width]="slot" [attr.height]="H - PT - PB" class="hit" [class.on]="hover() === i" />
            @if (d.value > 0) {
              <path [attr.d]="column(d.x, d.value)" class="bar" />
            }
          </g>
        }
        @for (l of xLabels(); track l.date) {
          <text [attr.x]="l.x" [attr.y]="H - 6" text-anchor="middle" class="tick">{{ l.text }}</text>
        }
      </svg>
      @if (hover() !== null) {
        @let h = cols()[hover()!];
        <div class="dc-tip" [style.left.%]="(h.x / W) * 100">
          <strong>{{ display(h.value) }}</strong><span>{{ dayLabel(h.date) }}</span>
        </div>
      }
      <button type="button" class="btn btn-link btn-sm p-0 mt-1" (click)="showTable.set(!showTable())">
        {{ showTable() ? 'Hide table' : 'Show as table' }}
      </button>
      @if (showTable()) {
        <div class="table-responsive" style="max-height: 240px">
          <table class="table table-sm mb-0">
            <thead><tr><th>Day</th><th class="text-end">{{ valueName() }}</th></tr></thead>
            <tbody>
              @for (d of data(); track d.date) {
                <tr><td>{{ dayLabel(d.date) }}</td><td class="text-end">{{ display(d.value) }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .dc { position: relative; }
    .dc-svg { width: 100%; height: auto; display: block; overflow: visible; }
    .grid { stroke: var(--at-border); stroke-width: 1; vector-effect: non-scaling-stroke; }
    .tick { fill: var(--at-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
    .bar { fill: var(--at-primary); }
    .hit { fill: transparent; }
    .hit.on { fill: rgba(var(--at-primary-rgb), 0.07); }
    .col { outline: none; cursor: default; }
    .col:focus-visible .hit { fill: rgba(var(--at-primary-rgb), 0.12); }
    .dc-tip {
      position: absolute; top: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;
      padding: 0.3rem 0.55rem; border-radius: 0.4rem; background: var(--at-navy); color: #fff; font-size: 0.75rem;
      pointer-events: none; white-space: nowrap; font-variant-numeric: tabular-nums;
    }
  `,
})
export class DayColumns {
  readonly data = input<DayValue[]>([]);
  readonly format = input<'count' | 'money'>('count');
  readonly label = input('');
  readonly valueName = input('Value');

  protected readonly W = 640;
  protected readonly H = 190;
  protected readonly PL = 44;
  protected readonly PR = 8;
  protected readonly PT = 10;
  protected readonly PB = 24;
  protected readonly hover = signal<number | null>(null);
  protected readonly showTable = signal(false);
  private readonly currency = new CurrencyPipe('en-US');

  /** Clean axis maximum: 1, 2 or 5 × 10^n at or above the data's maximum. */
  protected readonly top = computed(() => {
    const max = Math.max(0, ...this.data().map((d) => d.value));
    if (max <= 0) {
      return this.format() === 'money' ? 100 : 4;
    }
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const step = [1, 2, 2.5, 5, 10].find((m) => m * pow >= max)! * pow;
    return this.format() === 'count' ? Math.max(Math.ceil(step), 2) : step;
  });

  protected readonly ticks = computed(() => [0, this.top() / 2, this.top()]);

  protected get slot(): number {
    return (this.W - this.PL - this.PR) / Math.max(1, this.data().length);
  }

  protected readonly cols = computed(() => {
    const n = this.data().length;
    const slot = (this.W - this.PL - this.PR) / Math.max(1, n);
    return this.data().map((d, i) => ({ ...d, x: this.PL + slot * (i + 0.5) }));
  });

  /** A few date labels only: first, last and evenly between. */
  protected readonly xLabels = computed(() => {
    const cols = this.cols();
    const every = Math.max(1, Math.ceil(cols.length / 7));
    return cols
      .filter((_, i) => i % every === 0 || i === cols.length - 1)
      .map((c) => ({ date: c.date, x: c.x, text: formatDay(c.date, { month: 'short', day: 'numeric' }) }));
  });

  protected y(v: number): number {
    return this.PT + (1 - v / this.top()) * (this.H - this.PT - this.PB);
  }

  /** A column with a 4px rounded top and a square base, at most 24px wide. */
  protected column(x: number, v: number): string {
    const w = Math.min(24, this.slot * 0.6);
    const top = this.y(v);
    const base = this.H - this.PB;
    const r = Math.min(4, w / 2, base - top);
    const l = x - w / 2;
    return `M${l},${base} V${top + r} Q${l},${top} ${l + r},${top} H${l + w - r} Q${l + w},${top} ${l + w},${top + r} V${base} Z`;
  }

  protected tickLabel(v: number): string {
    if (this.format() === 'money') {
      return v >= 1000 ? `$${Math.round(v / 100) / 10}K` : `$${Math.round(v)}`;
    }
    return String(Math.round(v * 10) / 10);
  }

  protected display(v: number): string {
    return this.format() === 'money' ? (this.currency.transform(v) ?? '') : String(v);
  }

  protected dayLabel(date: string): string {
    return formatDay(date, { weekday: 'short', month: 'short', day: 'numeric' });
  }
}
