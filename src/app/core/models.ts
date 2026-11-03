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
  /** Sales tax in percent (e.g. 7.75); commission uses it to take tax off accessories. */
  taxRate: number;
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
  /** Sales tax in percent; leave out to keep the current rate. */
  taxRate?: number;
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
  /** Gets schedule updates by text message. */
  smsOptIn?: boolean;
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
export type NotificationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

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
  /** Text messages (Twilio): connected, the sender, and people with a phone who haven't agreed yet. */
  smsConnected: boolean;
  smsFrom: string;
  smsNotAgreed: number;
  /** WhatsApp through Meta or Twilio, and the Twilio Sandbox number and join phrase, if used. */
  whatsappProvider: 'meta' | 'twilio';
  sandboxNumber: string | null;
  sandboxJoin: string | null;
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

// ---------- End of day (EOD) ----------

export type EodStatus = 'OPEN' | 'SUBMITTED' | 'APPROVED';
export type EodLineType = 'SALE' | 'ACCESSORY';
export type EodCategory = 'NL_AAL' | 'BTS' | 'UPG' | 'FREE_LINE' | 'REACT' | 'UNLOCK' | 'M_LOCK' | 'HINT';

export interface EodCategoryOption {
  value: EodCategory;
  label: string;
  help: string;
  /** Unlock / Metro-locked: needs the last 4 of the IMEI and the phone number. */
  needsDevice: boolean;
}

export interface EodLine {
  id: number;
  type: EodLineType;
  category: EodCategory | null;
  categoryLabel: string;
  description: string;
  qpay: number;
  /** The device list's price, for reference. */
  retail: number;
  /** Old sales only; 0 on new ones. */
  tax: number;
  taxRate: number;
  /** As the rep wrote it. */
  subtotal: number;
  soldFor: number;
  /** sold for − QPAY − subtotal */
  accessories: number;
  customerRef: string | null;
  imeiLast4: string | null;
  phone: string | null;
  repId: number;
  repName: string;
  /** Picked from the device list, if any. */
  deviceId: number | null;
  /** Colleagues sharing the credit. */
  sharedWith: EodPerson[];
  createdAt: string;
  canEdit: boolean;
}

export interface EodPerson {
  id: number;
  name: string;
}

/** Someone a sale can be credited to or split with; scheduledHere = on the schedule at this store that day. */
export interface EodColleague {
  id: number;
  name: string;
  scheduledHere: boolean;
}

export interface EodTeamMember {
  id: number;
  name: string;
  /** On the published schedule at this store that day. */
  scheduled: boolean;
  boxes: number;
  accessories: number;
}

export interface EodSplitShare {
  employeeId: number;
  name: string;
  amount: number;
}

export interface EodLineRequest {
  storeId: number;
  date: string;
  type: EodLineType;
  category: EodCategory | null;
  description: string | null;
  qpay: number | null;
  /** As written on the receipt. */
  subtotal: number | null;
  soldFor: number;
  customerRef: string | null;
  imeiLast4: string | null;
  phone: string | null;
  repId: number | null;
  deviceId: number | null;
  /** Colleagues who split this sale's accessories evenly with the rep (the box stays with the rep), up to 3. */
  shareWith: number[];
}

export interface EodClosingRequest {
  storeId: number;
  date: string;
  qpayTotal: number | null;
  cash: number | null;
  credit: number | null;
  finance: number | null;
  layawayRedeem: number | null;
  newLayaway: number | null;
  note: string | null;
}

export interface EodCategoryCount {
  category: EodCategory;
  label: string;
  count: number;
}

/** A box always belongs to one rep; accessories can be split. */
export interface EodRepSummary {
  repId: number;
  repName: string;
  boxes: number;
  byCategory: EodCategoryCount[];
  accessories: number;
  soldFor: number;
  /** Sales they shared with someone. */
  sharedSales: number;
}

export interface EodTotals {
  /** The sales' subtotals added up. */
  subtotal: number;
  accessories: number;
  grandTotal: number;
  lineQpay: number;
  qpayTotal: number;
  newLayaway: number;
  totalSale: number;
  cash: number;
  credit: number;
  finance: number;
  layawayRedeem: number;
  totalDrop: number;
  /** Positive = over, negative = short. */
  overShort: number;
  boxes: number;
}

export interface EodReport {
  /** Null until something is saved for that store and day. */
  id: number | null;
  storeId: number;
  storeName: string;
  areaId: number;
  date: string;
  status: EodStatus;
  qpayTotal: number | null;
  cash: number | null;
  credit: number | null;
  finance: number | null;
  layawayRedeem: number | null;
  newLayaway: number | null;
  note: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Who last reopened it for corrections (null once it's submitted again). */
  reopenedBy: string | null;
  reopenedAt: string | null;
  lines: EodLine[];
  totals: EodTotals;
  categories: EodCategoryCount[];
  reps: EodRepSummary[];
  /** Today's team (from the schedule, plus anyone with credit) and each person's credit. */
  team: EodTeamMember[];
  /** The day's accessories split by hand at close; empty = credited to whoever sold them. */
  accessorySplit: EodSplitShare[];
  canAddSales: boolean;
  canClose: boolean;
  canApprove: boolean;
  canReopen: boolean;
  myId: number;
}

export interface EodStoreOption {
  id: number;
  name: string;
  label: string;
}

export interface EodToday {
  date: string;
  storeId: number | null;
  storeName: string | null;
  reason: string | null;
  stores: EodStoreOption[];
  report: EodReport | null;
}

export interface EodStoreDay {
  date: string;
  storeId: number;
  storeName: string;
  storeLabel: string;
  reportId: number | null;
  /** Null when nothing was logged that day. */
  status: EodStatus | null;
  sales: number;
  totalSale: number;
  totalDrop: number;
  overShort: number;
  submittedBy: string | null;
  submittedAt: string | null;
}

export interface EodDayOverview {
  date: string;
  stores: EodStoreDay[];
  submitted: number;
  missing: number;
}

export interface EodMonthSummary {
  month: string;
  areaId: number;
  days: EodStoreDay[];
  totals: EodTotals;
  categories: EodCategoryCount[];
  reps: EodRepSummary[];
  reports: number;
  approved: number;
}

// ---------- Device list (kept by admins, picked when logging a sale) ----------

export interface CatalogDevice {
  id: number;
  brandId: number;
  brandName: string;
  name: string;
  /** e.g. "Samsung Galaxy A16" */
  displayName: string;
  retailPrice: number;
  active: boolean;
}

export interface CatalogBrand {
  id: number;
  name: string;
  active: boolean;
  devices: CatalogDevice[];
}

export interface BrandRequest {
  name: string;
  active: boolean;
}

export interface DeviceRequest {
  brandId: number;
  name: string;
  retailPrice: number;
  active: boolean;
}

// ---------- Performance (from the EOD credit ledger) ----------

export interface PerfCategoryBoxes {
  category: EodCategory;
  label: string;
  boxes: number;
}

/** One person's numbers for a period. "Confirmed" = only manager-approved days (what commission is paid on). */
export interface PerfEmployeeStats {
  employeeId: number;
  name: string;
  employeeCode: string;
  role: Role;
  homeStoreName: string | null;
  active: boolean;
  boxes: number;
  byCategory: PerfCategoryBoxes[];
  accessories: number;
  soldFor: number;
  sales: number;
  sharedSales: number;
  daysWithSales: number;
  /** Shifts worked on published schedules. */
  shifts: number;
  accessoriesPerShift: number | null;
  confirmedBoxes: number;
  confirmedAccessories: number;
}

export interface PerfDay {
  date: string;
  boxes: number;
  accessories: number;
  soldFor: number;
}

export interface PerfTotals {
  boxes: number;
  accessories: number;
  soldFor: number;
  sales: number;
  confirmedBoxes: number;
  confirmedAccessories: number;
  reports: number;
  approvedReports: number;
}

export interface PerfLeaderboard {
  from: string;
  to: string;
  areaId: number | null;
  storeId: number | null;
  totals: PerfTotals;
  employees: PerfEmployeeStats[];
  days: PerfDay[];
}

export interface PerfCreditItem {
  date: string;
  storeName: string;
  status: EodStatus;
  type: EodLineType;
  category: EodCategory | null;
  categoryLabel: string;
  description: string;
  boxes: number;
  accessories: number;
  soldFor: number;
  shared: boolean;
  /** They made the sale (have the box). */
  rep: boolean;
  /** A share of the day's accessories split at close. */
  daySplit: boolean;
}

export interface PerfStoreStats {
  storeId: number;
  storeName: string;
  boxes: number;
  accessories: number;
  sales: number;
}

export interface PerfProfile {
  employeeId: number;
  name: string;
  employeeCode: string;
  role: Role;
  areaName: string | null;
  homeStoreName: string | null;
  email: string;
  active: boolean;
  from: string;
  to: string;
  stats: PerfEmployeeStats;
  days: PerfDay[];
  stores: PerfStoreStats[];
  recent: PerfCreditItem[];
  rank: number;
  ranked: number;
}

// ---------- Commission (admins only) ----------

export type PaysAs = 'ACTIVATION' | 'UPGRADE' | 'NONE';
export type AccessoryMode = 'WHOLE' | 'BRACKETS';
export type AdjustmentType =
  | 'LATE'
  | 'NO_CALL_NO_SHOW'
  | 'NO_UNIFORM'
  | 'MISSED_MEETING'
  | 'MISSED_SYNC_MEETING'
  | 'SCORECARD_REWARD'
  | 'OTHER_FINE'
  | 'OTHER_BONUS';

export interface CommissionPlan {
  activationTier1Max: number;
  activationTier1Rate: number;
  activationTier2Max: number;
  activationTier2Rate: number;
  activationTier3Rate: number;
  upgradeTier1Max: number;
  upgradeTier1Rate: number;
  upgradeTier2Rate: number;
  btsRate: number;
  homeInternetRate: number;
  unlockRate: number;
  metroLockedRate: number;
  freeLinePaysAs: PaysAs;
  reactivationPaysAs: PaysAs;
  costPercent: number;
  accessoryTier1Max: number;
  accessoryTier1Percent: number;
  accessoryTier3From: number;
  accessoryTier2Percent: number;
  accessoryTier3Percent: number;
  accessoryMode: AccessoryMode;
  lateFinePerMinute: number;
  noCallNoShowFine: number;
  noUniformFine: number;
  missedMeetingFine: number;
  missedSyncMeetingFine: number;
  scorecardReward: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdjustmentTypeOption {
  value: AdjustmentType;
  label: string;
  reward: boolean;
  perMinute: boolean;
  defaultAmount: number;
}

export interface CommissionAdjustment {
  id: number;
  employeeId: number;
  employeeName: string;
  date: string;
  type: AdjustmentType;
  typeLabel: string;
  quantity: number;
  /** Negative = fine. */
  amount: number;
  note: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CommissionBreakdown {
  activations: number;
  activationRate: number;
  activationPay: number;
  upgrades: number;
  upgradeRate: number;
  upgradePay: number;
  bts: number;
  btsPay: number;
  homeInternet: number;
  homeInternetPay: number;
  unlock: number;
  unlockPay: number;
  metroLocked: number;
  metroLockedPay: number;
  accessoriesGross: number;
  accessoriesNet: number;
  accessoryPercent: number;
  accessoryPay: number;
  boxPay: number;
  fines: number;
  rewards: number;
  total: number;
}

export interface CommissionStatement {
  employeeId: number;
  name: string;
  employeeCode: string;
  areaName: string | null;
  homeStoreName: string | null;
  active: boolean;
  pay: CommissionBreakdown;
  pendingBoxes: number;
  pendingAccessories: number;
  noCallNoShows: number;
  adjustments: CommissionAdjustment[];
}

export interface CommissionMonth {
  month: string;
  areaId: number | null;
  finalized: boolean;
  finalizedAt: string | null;
  finalizedBy: string | null;
  totals: { boxPay: number; accessoryPay: number; fines: number; rewards: number; total: number; people: number };
  statements: CommissionStatement[];
  warnings: string[];
  unapprovedReports: number;
}
