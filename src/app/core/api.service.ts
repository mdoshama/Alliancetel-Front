import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Area,
  AreaRequest,
  CreateDayOffRequest,
  Credentials,
  DayOffFilter,
  DayOffRequest,
  DayType,
  Employee,
  EmployeeFilter,
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
  /** Creates the employee and returns a one-time temporary password for their first sign-in. */
  createEmployee(body: EmployeeRequest): Observable<Credentials> {
    return this.http.post<Credentials>(`${this.base}/employees`, body);
  }
  /** Move someone to another store in their area (managers can do this for their own area). */
  changeHomeStore(id: number, storeId: number | null): Observable<Employee> {
    return this.http.patch<Employee>(`${this.base}/employees/${id}/home-store`, { storeId });
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
  createDayOff(body: CreateDayOffRequest): Observable<DayOffRequest[]> {
    return this.http.post<DayOffRequest[]>(`${this.base}/day-off-requests`, body);
  }
  approveDayOff(id: number, note?: string): Observable<DayOffRequest> {
    return this.http.post<DayOffRequest>(`${this.base}/day-off-requests/${id}/approve`, { note: note ?? null });
  }
  rejectDayOff(id: number, note?: string): Observable<DayOffRequest> {
    return this.http.post<DayOffRequest>(`${this.base}/day-off-requests/${id}/reject`, { note: note ?? null });
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
  }
  /** Re-run automatic store assignment on a draft; days set by hand are kept. */
  autoAssignStores(scheduleId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/auto-assign-stores`, {});
  }
  /** Send someone to a store for every day they work this week. */
  moveForWeek(scheduleId: number, employeeId: number, storeId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/move-for-week`, { employeeId, storeId });
  }
  publishSchedule(scheduleId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/publish`, {});
  }
  revertSchedule(scheduleId: number): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.base}/schedules/${scheduleId}/revert-to-draft`, {});
  }
}
