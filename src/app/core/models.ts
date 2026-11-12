export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'BACK_OFFICE';
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
  /** Employees here can ask for days off up to this date (a manager opened it further ahead); null = usual window. */
  requestsOpenUntil?: string | null;
  requestsOpenedBy?: string | null;
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
  /** Fewest people needed this weekday when it differs from the store's usual minimum; null/absent = the usual. */
  minStaff?: number | null;
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
  /** Most floaters auto-fill sends here on one day; 0 = no limit. */
  maxFloatersPerDay: number;
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
  /** Most floaters auto-fill sends here on one day (0 = no limit); leave out to keep the current limit. */
  maxFloatersPerDay?: number;
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
  /** Agreed to text messages (only they can turn it on). */
  smsOptIn: boolean;
  /** Date of birth 'yyyy-MM-dd', or null when not on file. */
  birthDate: string | null;
  /** Stores auto-fill may send them to when they float or cover (empty = any store in the area). */
  floatStoreIds: number[];
  floatStoreNames: string[];
  /** Works shifts and is on the schedule (a manager who only manages is not). */
  onSchedule: boolean;
  /** The admin who recorded their agreement to texts (null if they turned texts on themselves). */
  smsConsentBy: string | null;
  smsConsentAt: string | null;
  /** Days of the week they're normally off (reserved for them when a week opens), Monday first. */
  regularDaysOff?: DayOfWeek[];
  /** In training: shown as "Trainee" (an employee). */
  trainee?: boolean;
}

/** A coming birthday, for the dashboard and the staff list (admins: everyone; managers: their area). */
export interface UpcomingBirthday {
  employeeId: number;
  fullName: string;
  role: Role;
  areaId: number | null;
  areaName: string | null;
  homeStoreName: string | null;
  birthDate: string;
  /** The date it falls on next ('yyyy-MM-dd'); Feb 29 birthdays fall on Feb 28 outside leap years. */
  nextBirthday: string;
  /** 0 = today. */
  daysUntil: number;
  /** The age they turn that day. */
  turning: number;
}

/** Returned once when an account is created or its password is reset. */
/** The weekly day-off request window ('yyyy-MM-dd' dates). */
export interface RequestWindow {
  /** The window applies to people asking for themselves (emergencies are exempt). */
  enabled: boolean;
  weekStart: string;
  weekEnd: string;
  /** The Friday it closes. */
  deadline: string;
  /** The Saturday the following week opens. */
  nextOpens: string;
  oneEmergencyPerMonth: boolean;
  emergencyUsedThisMonth: boolean;
  /** AUTO = Friday cycle; OPEN / CLOSED = set by an admin. */
  mode: PortalMode;
  /** Mondays of the weeks taking requests right now (empty when closed). */
  openWeeks: string[];
  changedBy: string | null;
  changedAt: string | null;
  /** Days off are reserved for everyone when a week opens. */
  reservations: boolean;
  /** Their area takes requests up to this date (opened further ahead by a manager), and who opened it. */
  openUntil?: string | null;
  openUntilBy?: string | null;
  /** The last date someone asking for themselves can pick. */
  lastDate?: string | null;
  /** Weeks (Mondays) whose schedule is already published in their area: the day off it gives stays there. */
  publishedWeeks?: string[];
}

export type PortalMode = 'AUTO' | 'OPEN' | 'CLOSED';

export type WeekRequestState = 'MISSING' | 'PENDING' | 'APPROVED' | 'DENIED' | 'RESERVED' | 'FULL_WEEK';

export interface WeekRequestPerson {
  employeeId: number;
  name: string;
  homeStoreName: string | null;
  state: WeekRequestState;
  dates: string[];
  /** Days off they normally take a week (7 − work days). */
  daysOffNeeded: number;
  /** Pending or approved days off this week. */
  daysOffAsked: number;
  /** Their phone (international form), so a manager can call people who haven't picked. */
  phone?: string | null;
}

/** How a direct message went out: the ways it was sent and the ones that couldn't, with why. */
export interface DirectMessageResult {
  sentBy: string[];
  notSentBy: string[];
}

/** Who has sent their day-off request for a week (managers). */
/** A manager asking an admin to open a week that has passed. */
export interface PastWeekAccess {
  id: number;
  areaId: number;
  areaName: string;
  weekStart: string;
  requestedById: number;
  requestedByName: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  openUntil: string | null;
  /** Approved and still within its time. */
  open: boolean;
  note: string | null;
}

/** A week that has passed is locked for managers until an admin opens it. */
export interface PastWeekStatus {
  passed: boolean;
  locked: boolean;
  request: PastWeekAccess | null;
}

export interface WeekRequestStatus {
  weekStart: string;
  total: number;
  sent: number;
  missing: WeekRequestPerson[];
  denied: WeekRequestPerson[];
  /** Asked, but for fewer days than they normally take off. */
  fewer: WeekRequestPerson[];
  /** Haven't picked yet; have the days the system reserved. */
  reserved: WeekRequestPerson[];
  others: WeekRequestPerson[];
  /** The week is still taking requests. */
  requestsOpen: boolean;
  /** Shifts the stores need against the shifts the team can work, and each day with the days off so far. */
  capacity: WeekCapacity;
  /** Working all 7 days this week (a manager or admin decided). */
  fullWeek: WeekRequestPerson[];
  /** Get their regular day(s) off this week (nothing else asked for). */
  regular?: WeekRequestPerson[];
}

export interface WeekCapacity {
  shiftsNeeded: number;
  shiftsAvailable: number;
  /** Days off the team takes in a normal week (7 − work days, for everyone). */
  daysOffToGive: number;
  days: DayCapacity[];
}

/** One day: people working with the days off so far, and shifts the stores still can't fill (with which stores). */
export interface DayCapacity {
  date: string;
  needed: number;
  working: number;
  off: number;
  shortBy: number;
  shortStores: string[];
}

/** A suggested day off for someone without a request (or whose request was turned down). */
export interface DayOffSuggestion {
  employeeId: number;
  name: string;
  homeStoreName: string | null;
  state: WeekRequestState;
  date: string;
  /** Every day of the week, most convenient first. */
  options: string[];
  reason: string;
  /** Which of their days off this is (e.g. 2 of 2). */
  dayNumber: number;
  daysNeeded: number;
}

export interface Credentials {
  employee: Employee;
  temporaryPassword: string;
  /** A set-password link was emailed / texted to them. */
  linkEmailed?: boolean;
  linkTexted?: boolean;
  /** Why the link wasn't (fully) sent, if it wasn't. */
  linkNote?: string | null;
}

/** Who a set-password link is for. */
export interface SetupLinkInfo {
  firstName: string;
  email: string;
  /** Welcome link for a new account (false: password reset). */
  newAccount: boolean;
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
  /** Gets schedule updates by text message. */
  smsOptIn?: boolean;
  /** Date of birth 'yyyy-MM-dd', or null when not on file. */
  birthDate?: string | null;
  /** Days they work in a normal week (7 minus their usual days off). */
  workDaysPerWeek?: number;
  /** Their regular days off, the same every week (e.g. 'TUESDAY'). A day they ask for replaces it that week. */
  regularDaysOff?: string[];
  /** On the weekly schedule (false for managers who only manage). */
  worksShifts?: boolean;
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
  /** Date of birth 'yyyy-MM-dd' (optional), for birthday reminders. */
  birthDate?: string | null;
  /** Stores they may float to (empty = any store in the area). */
  floatStoreIds?: number[];
  /** Managers: works shifts and is on the schedule (false = only manages). */
  onSchedule?: boolean;
  /** Text-message updates: only an admin can turn them on for someone (they agreed); null keeps it. */
  smsOptIn?: boolean;
  trainee?: boolean;
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
  /** Reserved by the system when the week opened; asking for another day swaps it automatically. */
  reserved?: boolean;
  /** Reserved because it is one of their regular days off. */
  regular?: boolean;
  /** Emergencies (managers and admins): the person's other days off that same week. */
  weekDaysOff?: WeekDayOff[] | null;
}

/** Another day off the same person has that week. */
export interface WeekDayOff {
  id: number;
  date: string;
  /** REGULAR (usual day), SYSTEM (the system gave it), ASKED (they asked for it) or EMERGENCY. */
  kind: 'REGULAR' | 'SYSTEM' | 'ASKED' | 'EMERGENCY';
  status: DayOffStatus;
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
  /** Managers and admins, for someone else: approved now, skipping the usual checks. */
  override?: boolean;
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
  /** true: only days reserved by the system; false: only days people asked for. */
  reserved?: boolean | null;
  /** true: only regular days off; false: leave them out. */
  regular?: boolean | null;
  /** true: only emergency requests; false: leave them out. */
  emergency?: boolean | null;
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
  /** On an approved day off: the request it comes from, so managers can revoke it from the schedule. */
  approvedRequestId?: number | null;
  /** On an approved day off, where it came from. Managers and admins only: employees just see "Day off". */
  offSource?: OffSource | null;
}

export type OffSource = 'REQUESTED' | 'REGULAR' | 'RESERVED' | 'EMERGENCY' | 'MANAGER';

/** Label, icon and tooltip for each kind of day off on the schedule (and in the PDF). */
export const OFF_SOURCES: Record<OffSource, { label: string; icon: string; title: string }> = {
  REQUESTED: { label: 'Requested', icon: 'bi-hand-index-thumb', title: 'Day off they asked for' },
  REGULAR: { label: 'Regular', icon: 'bi-arrow-repeat', title: 'Their regular day off (same day every week)' },
  RESERVED: { label: 'By system', icon: 'bi-cpu', title: 'Day off assigned by the system: they didn\'t ask for a day' },
  EMERGENCY: { label: 'Emergency', icon: 'bi-exclamation-octagon-fill', title: 'Emergency day off, approved by a manager' },
  MANAGER: { label: 'By manager', icon: 'bi-person-check-fill', title: 'Day off given by a manager' },
};

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
  /** Reserved by the system rather than asked for; approved like any request. */
  reserved?: boolean;
  /** Reserved because it is one of their regular days off. */
  regular?: boolean;
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
  address: string | null;
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
  /** Stores they may float to (empty = any store in the area). */
  floatStoreIds?: number[];
  /** In training (shown as "Trainee", listed last). */
  trainee?: boolean;
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
  /** Last "Save draft" checkpoint, or null if the draft was never saved. */
  draftSavedAt: string | null;
  /** The draft changed after its last save (always true before the first save). */
  changedSinceSave: boolean;
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
  BACK_OFFICE: 'Back office',
};

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  WORK: 'Work',
  OFF: 'Off',
  /** An approved day-off request: shown as Off with a check mark, and locked. */
  REQUESTED_OFF: 'Off (approved)',
};

// ---- WhatsApp messages ---------------------------------------------------------------------------------

export type NotificationKind = 'WEEK_PUBLISHED' | 'WEEK_CHANGED' | 'DAY_OFF_DECISION' | 'ANNOUNCEMENT' | 'SMS_OPT_IN' | 'BIRTHDAY_REMINDER' | 'ACCOUNT_SETUP';
export type NotificationStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'NOT_SENT';
export type NotificationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  WEEK_PUBLISHED: 'Week published',
  WEEK_CHANGED: 'Schedule changed',
  DAY_OFF_DECISION: 'Day-off decision',
  ANNOUNCEMENT: 'Announcement',
  SMS_OPT_IN: 'Text sign-up',
  BIRTHDAY_REMINDER: 'Birthday reminder',
  ACCOUNT_SETUP: 'Set-password link',
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
  /** Text messages (Twilio): connected, the sender, and people with a phone who haven't agreed yet. */
  smsConnected: boolean;
  smsFrom: string;
  smsNotAgreed: number;
  /** WhatsApp through Meta or Twilio, and the Twilio Sandbox number and join phrase, if used. */
  whatsappProvider: 'meta' | 'twilio';
  sandboxNumber: string | null;
  sandboxJoin: string | null;
  /** Twilio: the number WhatsApp comes from, and whether all four approved templates are set. */
  whatsappFrom: string | null;
  whatsappTemplatesReady: boolean;
}

/** Which update channels are on, for everyone signed in (shown in the account menu). */
export interface MessagingInfo {
  whatsappConnected: boolean;
  whatsappProvider: 'meta' | 'twilio';
  /** The Twilio WhatsApp Sandbox number to message first, e.g. +14155238886. */
  sandboxNumber: string | null;
  /** What to send it, e.g. "join happy-tiger". */
  sandboxJoin: string | null;
  smsConnected: boolean;
}

// ---- Time clock ----------------------------------------------------------------------------------------

/** One person on the day's time-clock sheet (times 'HH:mm[:ss]'). */
export interface TimeClockRow {
  employeeId: number;
  name: string;
  employeeCode: string;
  areaName: string | null;
  storeId: number | null;
  storeName: string | null;
  storeColor: string | null;
  /** On the published schedule to work that day. */
  scheduled: boolean;
  opensAt: string | null;
  entryId: number | null;
  clockIn: string | null;
  clockOut: string | null;
  clockedInBy: string | null;
  clockedOutBy: string | null;
  note: string | null;
  minutesLate: number;
  /** Scheduled, the store is open past the grace period, and nobody clocked them in. */
  missing: boolean;
  hoursWorked: number | null;
}

export interface TimeClockDay {
  date: string;
  today: boolean;
  scheduled: number;
  clockedIn: number;
  missing: number;
  late: number;
  /** Back office and admins clock people in; managers look. */
  canEdit: boolean;
  graceMinutes: number;
  rows: TimeClockRow[];
  others: TimeClockRow[];
}
