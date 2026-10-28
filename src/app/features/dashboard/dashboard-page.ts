import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { formatDay, today, weekStartOf } from '../../core/date-utils';
import { Area, DayOffRequest } from '../../core/models';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink],
  templateUrl: './dashboard-page.html',
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly areas = signal<Area[]>([]);
  protected readonly pending = signal<DayOffRequest[]>([]);
  protected readonly loaded = signal(false);
  protected readonly format = formatDay;

  protected readonly activeAreas = computed(() => this.areas().filter((a) => a.active));
  protected readonly totalStaff = computed(() => this.activeAreas().reduce((sum, a) => sum + a.employeeCount, 0));
  protected readonly largestArea = computed(() => Math.max(1, ...this.activeAreas().map((a) => a.employeeCount)));

  ngOnInit(): void {
    this.api.areas().subscribe((list) => {
      this.areas.set(list);
      this.loaded.set(true);
    });
    this.api
      .dayOffRequests({ status: 'PENDING', from: weekStartOf(today()) })
      .subscribe((list) => this.pending.set(list));
  }
}
