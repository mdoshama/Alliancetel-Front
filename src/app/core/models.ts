export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type DayOffStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DayType = 'WORK' | 'OFF' | 'REQUESTED_OFF';
export type ScheduleStatus = 'DRAFT' | 'PUBLISHED';
export type StoreRole = 'PRIMARY' | 'SECONDARY' | 'FLOATER';

export const STORE_ROLE_LABELS: Record<StoreRole, string> = {
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
  FLOATER: 'Floater',
};

export const STORE_ROLE_HELP: Record<StoreRole, string> = {
  PRIMARY: 'Always at their home store; only moved by hand',
  SECONDARY: 'Home store, but auto-fill can send them to cover other stores',
  FLOATER: 'No home store; auto-fill places them where needed',
};

export interface Area {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  employeeCount: number;
}

export interface AreaRequest {
  name: string;
  description: string | null;
  active: boolean;
}

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

/** Opening hours on one weekday; times are "HH:mm" (the API may add ":ss"). */
export interface DayHours {
  day: DayOfWeek;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
}

export interface Store {
  id: number;
  areaId: number;
  areaName: string;
  name: string;
  code: string | null;
  /** Short code if set, otherwise the name. */
  label: string;
  address: string | null;
  /** Fewest people needed on any day; 0 = no minimum. */
  minStaffPerDay: number;
  active: boolean;
  employeeCount: number;
  /** Seven entries, Monday first. Days never set are 10:00–20:00. */
  hours: DayHours[];
  /** Hex color like "#2563EB" used for the store on the schedule. */
  color: string;
}

export interface StoreRequest {
  areaId: number;
  name: string;
  code: string | null;
  address: string | null;
  minStaffPerDay: number;
  active: boolean;
  /** Leave out to keep the current hours. */
  hours?: DayHours[];
  /** Leave out to keep the current color. */
  color?: string;
}

export interface Employee {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  areaId: number | null;
  areaName: string | null;
  homeStoreId: number | null;
  homeStoreName: string | null;
  /** Primary or secondary at the home store; floater without one. */
  storeRole: StoreRole;
  workDaysPerWeek: number;
  active: boolean;
  loginEnabled: boolean;
  lastLoginAt: string | null;
}

/** Returned once when an account is created or its password is reset. */
export interface Credentials {
  employee: Employee;
  temporaryPassword: string;
}

export interface Me {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  role: Role;
  areaId: number | null;
  areaName: string | null;
  /** Where they normally work (null for floaters and most admins). */
  homeStoreId?: number | null;
  homeStoreName?: string | null;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: Me;
}

export interface EmployeeRequest {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  areaId: number | null;
  homeStoreId: number | null;
  workDaysPerWeek: number;
  active: boolean;
  /** Primary (true) or secondary (false) at the home store. */
  primaryAtStore?: boolean;
}

export interface EmployeeFilter {
  areaId?: number | null;
  role?: Role | null;
  active?: boolean | null;
  q?: string | null;
}

export interface DayOffRequest {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  areaId: number | null;
  areaName: string | null;
  date: string;
  dayOfWeek: string;
  reason: string | null;
  /** Urgent request: allowed even when a colleague at the same store is off, outside the weekly limit. */
  emergency: boolean;
  status: DayOffStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /** After approval: how that week's existing schedule was updated. */
  scheduleUpdate?: string | null;
}

export type ImpactLevel = 'OK' | 'TIGHT' | 'SHORT';

export interface Shortage {
  storeName: string;
  date: string;
  scheduled: number;
  required: number;
}

/** What approving a day off would do to staffing that week. */
export interface DayOffImpact {
  requestId: number;
  employeeName: string;
  date: string;
  level: ImpactLevel;
  summary: string;
  workingBefore: number;
  workingAfter: number;
  neededThatDay: number;
  /** Their regular day off that becomes a work day instead. */
  replacementWorkDay: string | null;
  scheduleStatus: ScheduleStatus | null;
  alreadyOff: string[];
  alsoRequested: string[];
  /** Colleagues at the same home store who are off (or asked to be) that day. */
  sameStoreOff: string[];
  emergency: boolean;
  newShortages: Shortage[];
  existingShortages: number;
}

export interface CreateDayOffRequest {
  employeeId: number;
  dates: string[];
  reason: string | null;
  emergency?: boolean;
}

/** A day a colleague at the same store already has off, so a normal request can't take it. */
export interface TakenDay {
  date: string;
  takenBy: string;
  status: DayOffStatus;
}

export interface DayOffFilter {
  areaId?: number | null;
  employeeId?: number | null;
  status?: DayOffStatus | null;
  from?: string | null;
  to?: string | null;
}

export interface DayCell {
  entryId: number;
  date: string;
  type: DayType;
  storeId: number | null;
  storeName: string | null;
  storeLabel: string | null;
  storeColor: string | null;
  /** Sent away from the home store automatically to cover another store's minimum. */
  autoAssigned: boolean;
  manuallyEdited: boolean;
  /** The store's hours that day (the shift); null without a store. */
  opensAt: string | null;
  closesAt: string | null;
  /** The assigned store is closed that day. */
  storeClosed: boolean;
}

export interface StoreRef {
  id: number;
  name: string;
  code: string | null;
  label: string;
  minStaffPerDay: number;
  /** Seven entries, Monday first. */
  hours: DayHours[];
  color: string;
}

/** Head count per store per day; storeId null means work days with no store assigned. */
export interface StoreCoverage {
  storeId: number | null;
  storeName: string;
  label: string;
  minStaffPerDay: number;
  dailyHeadCount: number[];
  /** The store's hours on each date of the week. */
  dailyHours: DayHours[];
  /** Null for the "no store assigned" row. */
  color: string | null;
}

/** A store with fewer people than its minimum on a day. */
export interface CoverageGap {
  storeId: number;
  storeName: string;
  date: string;
  scheduled: number;
  required: number;
}

export interface EmployeeRow {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  role: Role;
  homeStoreId: number | null;
  homeStoreName: string | null;
  /** Primary or secondary at the home store; floater without one. */
  storeRole: StoreRole;
  expectedWorkDays: number;
  scheduledWorkDays: number;
  days: DayCell[];
}

export interface Schedule {
  id: number;
  areaId: number;
  areaName: string;
  weekStart: string;
  weekEnd: string;
  status: ScheduleStatus;
  publishedAt: string | null;
  updatedAt: string;
  dates: string[];
  dailyHeadCount: number[];
  pendingDayOffRequests: number;
  stores: StoreRef[];
  storeCoverage: StoreCoverage[];
  coverageGaps: CoverageGap[];
  rows: EmployeeRow[];
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  WORK: 'Work',
  OFF: 'Off',
  REQUESTED_OFF: 'Requested off',
};
