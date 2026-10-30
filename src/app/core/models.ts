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
  /** Agreed to WhatsApp schedule updates. */
  whatsappOptIn: boolean;
  /** Gets schedule updates by email. */
  emailOptIn: boolean;
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
  /** International form, e.g. +16195550142. */
  phone?: string | null;
  /** Gets schedule updates on WhatsApp. */
  whatsappOptIn?: boolean;
  /** Gets schedule updates by email (on unless turned off). */
  emailOptIn?: boolean;
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
  /** Agreed to WhatsApp schedule updates (needs a phone number). */
  whatsappOptIn?: boolean;
  emailOptIn?: boolean;
}

export interface EmployeeFilter {
  areaId?: number | null;
  role?: Role | null;
  active?: boolean | null;
  q?: string | null;
}

/** Filters for the paged staff list. */
export interface EmployeePageFilter extends EmployeeFilter, PageParams {
  storeId?: number | null;
  storeRole?: StoreRole | null;
  sort?: 'name' | 'code' | 'role' | null;
}

/** Which page to fetch: page starts at 0. */
export interface PageParams {
  page?: number;
  size?: number;
}

/** One page of a list from the server. */
export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
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
  /** Set when a manager or admin changed the decision later: the earlier decision, who, why and when. */
  previousStatus?: DayOffStatus | null;
  decisionChangedBy?: string | null;
  decisionChangeReason?: string | null;
  decisionChangedAt?: string | null;
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
/** A day a normal request can't use: a colleague at the same store has it, or the area is full that day. */
export interface TakenDay {
  date: string;
  /** First name of the colleague; null when the day is full. */
  takenBy: string | null;
  status: DayOffStatus | null;
  /** Enough people in the area are already off that the stores can't spare anyone else. */
  full: boolean;
}

export interface DayOffFilter {
  areaId?: number | null;
  employeeId?: number | null;
  status?: DayOffStatus | null;
  from?: string | null;
  to?: string | null;
}

export interface DayOffPageFilter extends DayOffFilter, PageParams {
  /** Employee name or code. */
  q?: string | null;
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
  /** A pending day-off request for this day (managers only). */
  request: WeekRequest | null;
}

/** A day-off request waiting for a decision, shown on the week's schedule. */
export interface WeekRequest {
  id: number;
  employeeId: number;
  employeeName: string;
  date: string;
  emergency: boolean;
  reason: string | null;
  /** The signed-in user may approve it (managers can't decide their own). */
  canReview: boolean;
}

/** Result of approving several requests at once. */
export interface ApproveManyResult {
  approved: DayOffRequest[];
  skipped: { id: number; employeeName: string; date: string; reason: string }[];
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
  /** Pending day-off requests this week, by day (managers only). */
  requests: WeekRequest[];
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  WORK: 'Work',
  OFF: 'Off',
  /** An approved day-off request: shown as Off with a check mark, and locked. */
  REQUESTED_OFF: 'Off (approved)',
};

// ---- WhatsApp messages ---------------------------------------------------------------------------------

export type NotificationKind = 'WEEK_PUBLISHED' | 'WEEK_CHANGED' | 'DAY_OFF_DECISION' | 'ANNOUNCEMENT';
export type NotificationStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'NOT_SENT';
export type NotificationChannel = 'EMAIL' | 'WHATSAPP';

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  WEEK_PUBLISHED: 'Week published',
  WEEK_CHANGED: 'Schedule changed',
  DAY_OFF_DECISION: 'Day-off decision',
  ANNOUNCEMENT: 'Announcement',
};

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  QUEUED: 'Sending…',
  SENT: 'Sent',
  FAILED: 'Failed',
  NOT_SENT: 'Not sent',
};

export interface NotificationItem {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  channel: NotificationChannel;
  phone: string | null;
  email: string | null;
  subject: string | null;
  kind: NotificationKind;
  status: NotificationStatus;
  preview: string;
  error: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
}

export interface WhatsAppStatus {
  connected: boolean;
  apiVersion: string;
  language: string;
  appUrlSet: boolean;
  templates: { kind: NotificationKind; name: string; body: string }[];
  queued: number;
  failed: number;
  notSent: number;
  withoutPhone: number;
  notAgreed: number;
  emailConnected: boolean;
  emailFrom: string;
  emailOff: number;
}
