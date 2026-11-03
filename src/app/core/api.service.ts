import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  AdjustmentType,
  AdjustmentTypeOption,
  CommissionAdjustment,
  CommissionMonth,
  CommissionPlan,
  PerfLeaderboard,
  PerfProfile,
  BrandRequest,
  CatalogBrand,
  CatalogDevice,
  DeviceRequest,
  EodColleague,
  EodCategoryOption,
  EodClosingRequest,
  EodDayOverview,
  EodLineRequest,
  EodMonthSummary,
  EodReport,
  EodToday,
  NotificationItem,
  NotificationChannel,
  NotificationStatus,
  WhatsAppStatus,
  ApproveManyResult,
  Area,
  AreaRequest,
  CreateDayOffRequest,
  Credentials,
  DayOffFilter,
  DayOffPageFilter,
  DayOffImpact,
  TakenDay,
  DayOffRequest,
  DayType,
  Employee,
  EmployeeFilter,
  EmployeePageFilter,
  Page,
  EmployeeRequest,
  Schedule,
  Store,
  StoreRequest,
} from './models';

function toParams(filter: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  // Areas
  areas(): Observable<Area[]> {
    return this.http.get<Area[]>(`${this.base}/areas`);
  }
  createArea(body: AreaRequest): Observable<Area> {
    return this.http.post<Area>(`${this.base}/areas`, body);
  }
  updateArea(id: number, body: AreaRequest): Observable<Area> {
    return this.http.put<Area>(`${this.base}/areas/${id}`, body);
  }
  deleteArea(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/areas/${id}`);
  }

  // Stores
  stores(areaId?: number | null): Observable<Store[]> {
    return this.http.get<Store[]>(`${this.base}/stores`, { params: toParams({ areaId }) });
  }
  createStore(body: StoreRequest): Observable<Store> {
    return this.http.post<Store>(`${this.base}/stores`, body);
  }
  updateStore(id: number, body: StoreRequest): Observable<Store> {
    return this.http.put<Store>(`${this.base}/stores/${id}`, body);
  }
  deleteStore(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/stores/${id}`);
  }

  // Employees
  employees(filter: EmployeeFilter = {}): Observable<Employee[]> {
    return this.http.get<Employee[]>(`${this.base}/employees`, { params: toParams(filter) });
  }
  /** One page of the staff list (server-side filters, search and paging). */
  employeesPage(filter: EmployeePageFilter = {}): Observable<Page<Employee>> {
    return this.http.get<Page<Employee>>(`${this.base}/employees/page`, { params: toParams(filter) });
  }
  /** Creates the employee and returns a one-time temporary password for their first sign-in. */
  createEmployee(body: EmployeeRequest): Observable<Credentials> {
    return this.http.post<Credentials>(`${this.base}/employees`, body);
  }
  /** Move someone to another store in their area (managers can do this for their own area). */
  /** primary: true = primary, false = secondary, undefined = keep. */
  changeHomeStore(id: number, storeId: number | null, primary?: boolean): Observable<Employee> {
    return this.http.patch<Employee>(`${this.base}/employees/${id}/home-store`, { storeId, primary: primary ?? null });
  }
  resetPassword(id: number): Observable<Credentials> {
    return this.http.post<Credentials>(`${this.base}/employees/${id}/reset-password`, {});
  }
  updateEmployee(id: number, body: EmployeeRequest): Observable<Employee> {
    return this.http.put<Employee>(`${this.base}/employees/${id}`, body);
  }
  deactivateEmployee(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/employees/${id}`);
  }

  // Day-off requests
  dayOffRequests(filter: DayOffFilter = {}): Observable<DayOffRequest[]> {
    return this.http.get<DayOffRequest[]>(`${this.base}/day-off-requests`, { params: toParams(filter) });
  }
  dayOffRequestsPage(filter: DayOffPageFilter = {}): Observable<Page<DayOffRequest>> {
    return this.http.get<Page<DayOffRequest>>(`${this.base}/day-off-requests/page`, { params: toParams(filter) });
  }
  createDayOff(body: CreateDayOffRequest): Observable<DayOffRequest[]> {
    return this.http.post<DayOffRequest[]>(`${this.base}/day-off-requests`, body);
  }
  takenDays(employeeId: number, from: string, to: string): Observable<TakenDay[]> {
    return this.http.get<TakenDay[]>(`${this.base}/day-off-requests/taken-days`, {
      params: { employeeId, from, to },
    });
  }
  dayOffImpact(id: number): Observable<DayOffImpact> {
    return this.http.get<DayOffImpact>(`${this.base}/day-off-requests/${id}/impact`);
  }
  approveDayOff(id: number, note?: string): Observable<DayOffRequest> {
    return this.http.post<DayOffRequest>(`${this.base}/day-off-requests/${id}/approve`, { note: note ?? null });
  }
  /** Approves many requests; with onlyIfCovered, ones that would leave a store short stay pending. */
  approveManyDaysOff(ids: number[], onlyIfCovered = true): Observable<ApproveManyResult> {
    return this.http.post<ApproveManyResult>(`${this.base}/day-off-requests/approve-many`, { ids, onlyIfCovered });
  }
  // WhatsApp messages
  notifications(filter: { areaId?: number | null; status?: NotificationStatus | null; channel?: NotificationChannel | null; page?: number; size?: number } = {}): Observable<Page<NotificationItem>> {
    return this.http.get<Page<NotificationItem>>(`${this.base}/notifications`, { params: toParams(filter) });
  }
  whatsappStatus(): Observable<WhatsAppStatus> {
    return this.http.get<WhatsAppStatus>(`${this.base}/notifications/status`);
  }
  announce(areaId: number, message: string): Observable<{ recipients: number; reachable: number }> {
    return this.http.post<{ recipients: number; reachable: number }>(`${this.base}/notifications/announce`, { areaId, message });
  }
  retryNotification(id: number): Observable<NotificationItem> {
    return this.http.post<NotificationItem>(`${this.base}/notifications/${id}/retry`, {});
  }
  rejectDayOff(id: number, note?: string): Observable<DayOffRequest> {
    return this.http.post<DayOffRequest>(`${this.base}/day-off-requests/${id}/reject`, { note: note ?? null });
  }
  /** Managers/admins: switch an approved request to rejected (or back); the reason is required. */
  changeDayOffDecision(id: number, status: 'APPROVED' | 'REJECTED', reason: string): Observable<DayOffRequest> {
    return this.http.post<DayOffRequest>(`${this.base}/day-off-requests/${id}/change-decision`, { status, reason });
  }
  cancelDayOff(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/day-off-requests/${id}`);
  }

  // Weekly schedules
  /** Emits null when no schedule exists yet for that area and week (API returns 204). */
  schedule(areaId: number, weekStart: string): Observable<Schedule | null> {
    return this.http
      .get<Schedule>(`${this.base}/schedules`, { params: toParams({ areaId, weekStart }), observe: 'response' })
      .pipe(map((res) => (res.status === 204 ? null : res.body)));
  }
  generateSchedule(areaId: number, weekStart: string): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/generate`, { areaId, weekStart });
  }
  updateScheduleEntry(scheduleId: number, entryId: number, type: DayType, storeId: number | null = null): Observable<Schedule> {
    return this.http.patch<Schedule>(`${this.base}/schedules/${scheduleId}/entries/${entryId}`, { type, storeId });
  }
  /** Two people trade their assignment (store and work/off) on the same day. */
  swapEntries(scheduleId: number, entryIdA: number, entryIdB: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/swap`, { entryIdA, entryIdB });
  }  /** Drag and drop: two days trade places (any person, any day); storeId puts the dragged work day at a store. */
  exchangeDays(scheduleId: number, fromEntryId: number, toEntryId: number, storeId?: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/exchange`, {
      fromEntryId,
      toEntryId,
      storeId: storeId ?? null,
    });
  }
  /** One person's work day and day off trade places (moves their day off within the week). */
  swapDays(scheduleId: number, entryIdA: number, entryIdB: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/swap-days`, { entryIdA, entryIdB });
  }

  /** Re-run automatic store assignment on a draft; days set by hand are kept. */
  autoAssignStores(scheduleId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/auto-assign-stores`, {});
  }
  /** Send someone to a store for every day they work this week. */
  moveForWeek(scheduleId: number, employeeId: number, storeId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/move-for-week`, { employeeId, storeId });
  }
  /** "Save draft": a checkpoint so the manager can stop here and carry on later. */
  saveDraft(scheduleId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/save-draft`, {});
  }
  /** "Add people where needed": move someone who works that day to a short store (never someone who is off). */
  addToStore(scheduleId: number, entryId: number, storeId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/add-to-store`, { entryId, storeId });
  }
  publishSchedule(scheduleId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/publish`, {});
  }
  revertSchedule(scheduleId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/revert-to-draft`, {});
  }

  // End of day
  eodCategories(): Observable<EodCategoryOption[]> {
    return this.http.get<EodCategoryOption[]>(`${this.base}/eod/categories`);
  }
  eodToday(): Observable<EodToday> {
    return this.http.get<EodToday>(`${this.base}/eod/today`);
  }
  eodReport(storeId: number, date: string): Observable<EodReport> {
    return this.http.get<EodReport>(`${this.base}/eod`, { params: toParams({ storeId, date }) });
  }
  eodDay(areaId: number | null, date: string): Observable<EodDayOverview> {
    return this.http.get<EodDayOverview>(`${this.base}/eod/day`, { params: toParams({ areaId, date }) });
  }
  eodMonth(areaId: number | null, month: string, storeId: number | null = null): Observable<EodMonthSummary> {
    return this.http.get<EodMonthSummary>(`${this.base}/eod/month`, { params: toParams({ areaId, month, storeId }) });
  }
  addEodLine(line: EodLineRequest): Observable<EodReport> {
    return this.http.post<EodReport>(`${this.base}/eod/lines`, line);
  }
  updateEodLine(id: number, line: EodLineRequest): Observable<EodReport> {
    return this.http.put<EodReport>(`${this.base}/eod/lines/${id}`, line);
  }
  deleteEodLine(id: number): Observable<EodReport> {
    return this.http.delete<EodReport>(`${this.base}/eod/lines/${id}`);
  }
  saveEodClosing(closing: EodClosingRequest): Observable<EodReport> {
    return this.http.put<EodReport>(`${this.base}/eod/closing`, closing);
  }
  submitEod(closing: EodClosingRequest): Observable<EodReport> {
    return this.http.post<EodReport>(`${this.base}/eod/submit`, closing);
  }
  approveEod(reportId: number): Observable<EodReport> {
    return this.http.post<EodReport>(`${this.base}/eod/${reportId}/approve`, {});
  }
  reopenEod(reportId: number): Observable<EodReport> {
    return this.http.post<EodReport>(`${this.base}/eod/${reportId}/reopen`, {});
  }
  eodColleagues(storeId: number, date: string): Observable<EodColleague[]> {
    return this.http.get<EodColleague[]>(`${this.base}/eod/colleagues`, { params: toParams({ storeId, date }) });
  }
  /** Splits the day's accessories by hand; an empty list goes back to "whoever sold it". */
  saveEodSplit(storeId: number, date: string, shares: { employeeId: number; amount: number }[]): Observable<EodReport> {
    return this.http.put<EodReport>(`${this.base}/eod/accessory-split`, { storeId, date, shares });
  }

  // Device list
  brands(): Observable<CatalogBrand[]> {
    return this.http.get<CatalogBrand[]>(`${this.base}/catalog/brands`);
  }
  createBrand(body: BrandRequest): Observable<CatalogBrand> {
    return this.http.post<CatalogBrand>(`${this.base}/catalog/brands`, body);
  }
  updateBrand(id: number, body: BrandRequest): Observable<CatalogBrand> {
    return this.http.put<CatalogBrand>(`${this.base}/catalog/brands/${id}`, body);
  }
  deleteBrand(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/catalog/brands/${id}`);
  }
  createDevice(body: DeviceRequest): Observable<CatalogDevice> {
    return this.http.post<CatalogDevice>(`${this.base}/catalog/devices`, body);
  }
  updateDevice(id: number, body: DeviceRequest): Observable<CatalogDevice> {
    return this.http.put<CatalogDevice>(`${this.base}/catalog/devices/${id}`, body);
  }
  deleteDevice(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/catalog/devices/${id}`);
  }

  // Performance
  leaderboard(filter: { areaId?: number | null; storeId?: number | null; from: string; to: string }): Observable<PerfLeaderboard> {
    return this.http.get<PerfLeaderboard>(`${this.base}/performance/leaderboard`, { params: toParams(filter) });
  }
  employeePerformance(employeeId: number, from: string, to: string): Observable<PerfProfile> {
    return this.http.get<PerfProfile>(`${this.base}/performance/employees/${employeeId}`, { params: toParams({ from, to }) });
  }
  myPerformance(from: string, to: string): Observable<PerfProfile> {
    return this.http.get<PerfProfile>(`${this.base}/performance/me`, { params: toParams({ from, to }) });
  }

  // Commission (admins only)
  commissionPlan(): Observable<CommissionPlan> {
    return this.http.get<CommissionPlan>(`${this.base}/commission/plan`);
  }
  updateCommissionPlan(plan: CommissionPlan): Observable<CommissionPlan> {
    return this.http.put<CommissionPlan>(`${this.base}/commission/plan`, plan);
  }
  adjustmentTypes(): Observable<AdjustmentTypeOption[]> {
    return this.http.get<AdjustmentTypeOption[]>(`${this.base}/commission/adjustment-types`);
  }
  addAdjustment(body: {
    employeeId: number;
    date: string;
    type: AdjustmentType;
    quantity: number | null;
    amount: number | null;
    note: string | null;
  }): Observable<CommissionAdjustment> {
    return this.http.post<CommissionAdjustment>(`${this.base}/commission/adjustments`, body);
  }
  deleteAdjustment(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/commission/adjustments/${id}`);
  }
  commissionMonth(month: string, areaId: number | null): Observable<CommissionMonth> {
    return this.http.get<CommissionMonth>(`${this.base}/commission/months/${month}`, { params: toParams({ areaId }) });
  }
  finalizeCommission(month: string): Observable<CommissionMonth> {
    return this.http.post<CommissionMonth>(`${this.base}/commission/months/${month}/finalize`, {});
  }
  reopenCommission(month: string): Observable<CommissionMonth> {
    return this.http.post<CommissionMonth>(`${this.base}/commission/months/${month}/reopen`, {});
  }
}
