export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type DayOffStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DayType = 'WORK' | 'OFF' | 'REQUESTED_OFF';
export type ScheduleStatus = 'DRAFT' | 'PUBLISHED';

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
}

export interface StoreRequest {
  areaId: number;
  name: string;
  code: string | null;
  address: string | null;
  minStaffPerDay: number;
  active: boolean;
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
  status: DayOffStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CreateDayOffRequest {
  employeeId: number;
  dates: string[];
  reason: string | null;
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
  /** Sent away from the home store automatically to cover another store's minimum. */
  autoAssigned: boolean;
  manuallyEdited: boolean;
}

export interface StoreRef {
  id: number;
  name: string;
  code: string | null;
  label: string;
  minStaffPerDay: number;
}

/** Head count per store per day; storeId null means work days with no store assigned. */
export interface StoreCoverage {
  storeId: number | null;
  storeName: string;
  label: string;
  minStaffPerDay: number;
  dailyHeadCount: number[];
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
