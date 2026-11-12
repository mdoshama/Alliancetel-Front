import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  DirectMessageResult,
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
  DayOfWeek,
  DayType,
  Employee,
  EmployeeFilter,
  EmployeePageFilter,
  Page,
  EmployeeRequest,
  Schedule,
  Store,
  StoreRequest,
  UpcomingBirthday,
  RequestWindow,
  TimeClockDay,
  TimeClockRow,
  PortalMode,
  WeekRequestStatus,
  PastWeekAccess,
  PastWeekStatus,
  DayOffSuggestion,
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
  createEmployee(body: EmployeeRequest, textLink = false): Observable<Credentials> {
    return this.http.post<Credentials>(`${this.base}/employees`, body, { params: toParams({ textLink }) });
  }
  /** Move someone to another store in their area (managers can do this for their own area). */
  /** primary: true = primary, false = secondary, undefined = keep. */
  changeHomeStore(id: number, storeId: number | null, primary?: boolean): Observable<Employee> {
    return this.http.patch<Employee>(`${this.base}/employees/${id}/home-store`, { storeId, primary: primary ?? null });
  }
  /** Days of the week someone is normally off (managers of their area, admins). */
  setRegularDaysOff(id: number, days: DayOfWeek[]): Observable<Employee> {
    return this.http.put<Employee>(`${this.base}/employees/${id}/regular-days-off`, { days });
  }
  /** How many days a week someone works, 1 to 7 (managers of their area, admins). */
  setWorkDays(id: number, days: number): Observable<Employee> {
    return this.http.put<Employee>(`${this.base}/employees/${id}/work-days`, { days });
  }
  /** New temporary password; also emails (and texts, if they agreed to texts or textLink) a set-password link. */
  resetPassword(id: number, textLink = false): Observable<Credentials> {
    return this.http.post<Credentials>(`${this.base}/employees/${id}/reset-password`, {}, { params: toParams({ textLink }) });
  }
  updateEmployee(id: number, body: EmployeeRequest): Observable<Employee> {
    return this.http.put<Employee>(`${this.base}/employees/${id}`, body);
  }
  /** Birthdays in the next `days` days (default 30), soonest first. */
  upcomingBirthdays(days = 30, areaId: number | null = null): Observable<UpcomingBirthday[]> {
    return this.http.get<UpcomingBirthday[]>(`${this.base}/employees/birthdays`, { params: toParams({ days, areaId }) });
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
  /** The week people can ask for now and its Friday deadline. */
  dayOffWindow(): Observable<RequestWindow> {
    return this.http.get<RequestWindow>(`${this.base}/day-off-requests/window`);
  }
  /** Managers (their area) and admins: let employees ask up to a date; null = back to the usual window. */
  setOpenUntil(areaId: number, until: string | null): Observable<{ areaId: number; until: string | null; by: string | null }> {
    return this.http.put<{ areaId: number; until: string | null; by: string | null }>(
      `${this.base}/day-off-requests/open-until`, { areaId, until });
  }
  /** Admins: open or close day-off requests, or back to the Friday cycle (AUTO). */
  setRequestPortal(mode: PortalMode): Observable<RequestWindow> {
    return this.http.put<RequestWindow>(`${this.base}/day-off-requests/portal`, { mode });
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
  /** A message to one person, by email, WhatsApp and text (whatever reaches them). */
  messagePerson(employeeId: number, message: string): Observable<DirectMessageResult> {
    return this.http.post<DirectMessageResult>(`${this.base}/notifications/direct`, { employeeId, message });
  }
  announce(areaId: number, message: string): Observable<{ recipients: number; reachable: number }> {
    return this.http.post<{ recipients: number; reachable: number }>(`${this.base}/notifications/announce`, { areaId, message });
  }
  /** Admins only: remove one message from the history. */
  deleteNotification(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/notifications/${id}`);
  }
  /** Admins only: clear messages older than the given number of days (all areas, or one). */
  clearNotifications(olderThanDays: number, areaId: number | null = null): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(`${this.base}/notifications`, { params: toParams({ olderThanDays, areaId }) });
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
  /** The time-clock sheet for a day (default today). */
  timeClock(areaId: number | null, date: string | null): Observable<TimeClockDay> {
    return this.http.get<TimeClockDay>(`${this.base}/time-clock`, { params: toParams({ areaId, date }) });
  }
  clockIn(body: { employeeId: number; date: string; time?: string | null; storeId?: number | null; note?: string | null }): Observable<TimeClockRow> {
    return this.http.post<TimeClockRow>(`${this.base}/time-clock/clock-in`, body);
  }
  clockOut(entryId: number, time: string | null): Observable<TimeClockRow> {
    return this.http.post<TimeClockRow>(`${this.base}/time-clock/${entryId}/clock-out`, { time });
  }
  correctTime(entryId: number, body: { clockIn: string; clockOut: string | null; note: string | null }): Observable<TimeClockRow> {
    return this.http.put<TimeClockRow>(`${this.base}/time-clock/${entryId}`, body);
  }
  deleteTime(entryId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/time-clock/${entryId}`);
  }
  /** Managers: who has sent their day-off request for the week. */
  /** Managers and admins: someone works all 7 days of that week (on), or back to their usual days (off). */
  setFullWeek(employeeId: number, weekStart: string, on: boolean): Observable<WeekRequestStatus> {
    return this.http.post<WeekRequestStatus>(`${this.base}/schedules/requests/full-week`, { employeeId, weekStart, on });
  }
  /** Whether a week that has passed is locked for you, and the latest request to open it. */
  pastWeekStatus(areaId: number, weekStart: string): Observable<PastWeekStatus> {
    return this.http.get<PastWeekStatus>(`${this.base}/schedules/past-week-access`, { params: { areaId, weekStart } });
  }
  /** Managers: ask an admin to open a week that has passed. */
  askPastWeekAccess(areaId: number, weekStart: string, reason: string): Observable<PastWeekAccess> {
    return this.http.post<PastWeekAccess>(`${this.base}/schedules/past-week-access`, { areaId, weekStart, reason });
  }
  /** Admins: requests to open past weeks, waiting for a decision. */
  pendingPastWeekAccess(): Observable<PastWeekAccess[]> {
    return this.http.get<PastWeekAccess[]>(`${this.base}/schedules/past-week-access/pending`);
  }
  /** Admins: open the week (for "hours", 24 by default) or turn the request down. */
  decidePastWeekAccess(id: number, approve: boolean, note?: string | null, hours?: number): Observable<PastWeekAccess> {
    return this.http.post<PastWeekAccess>(`${this.base}/schedules/past-week-access/${id}/decide`, {
      approve,
      note: note ?? null,
      hours: hours ?? null,
    });
  }
  /** Admins: lock an opened week again. */
  lockPastWeek(id: number): Observable<PastWeekAccess> {
    return this.http.post<PastWeekAccess>(`${this.base}/schedules/past-week-access/${id}/lock`, {});
  }
  weekRequests(areaId: number, weekStart: string): Observable<WeekRequestStatus> {
    return this.http.get<WeekRequestStatus>(`${this.base}/schedules/requests`, { params: { areaId, weekStart } });
  }
  /** Managers: a suggested day off for everyone without a request (or turned down). */
  suggestDaysOff(areaId: number, weekStart: string): Observable<DayOffSuggestion[]> {
    return this.http.post<DayOffSuggestion[]>(`${this.base}/schedules/requests/suggest`, {}, { params: { areaId, weekStart } });
  }
  /** Managers: gives the chosen days off (approved; each person is told). */
  assignDaysOff(areaId: number, items: { employeeId: number; date: string }[]): Observable<DayOffRequest[]> {
    return this.http.post<DayOffRequest[]>(`${this.base}/schedules/requests/apply`, { areaId, items });
  }
  /** force: a manager or admin generating before everyone's requests are in. */
  generateSchedule(areaId: number, weekStart: string, force = false): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/generate`, { areaId, weekStart, force });
  }
  /** Throws the week's schedule away (draft or published) so it can be generated again from scratch. */
  resetSchedule(scheduleId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/schedules/${scheduleId}`);
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
}
