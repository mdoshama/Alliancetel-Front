import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import {
  Area,
  Employee,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_STATUS_LABELS,
  NotificationChannel,
  NotificationItem,
  NotificationStatus,
  WhatsAppStatus,
} from '../../core/models';
import { savePageSize, savedPageSize } from '../../core/paging';
import { RULES, clean, formatPhone } from '../../core/validation';
import { Pagination } from '../../shared/pagination';

type StatusTab = NotificationStatus | 'ALL';

/** Messages: which channels are connected, announcements to an area, and what was sent to whom (an inbox-style feed). */
@Component({
  selector: 'app-messages-page',
  imports: [FormsModule, DatePipe, Pagination],
  templateUrl: './messages-page.html',
})
export class MessagesPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly auth = inject(AuthService);

  protected readonly kindLabels = NOTIFICATION_KIND_LABELS;
  protected readonly statusLabels = NOTIFICATION_STATUS_LABELS;
  protected readonly formatPhone = formatPhone;
  protected readonly maxMessage = 500;
  protected readonly tabs: { value: StatusTab; label: string; icon: string }[] = [
    { value: 'ALL', label: 'All', icon: 'bi-inbox' },
    { value: 'SENT', label: 'Sent', icon: 'bi-check2-all' },
    { value: 'FAILED', label: 'Failed', icon: 'bi-exclamation-triangle' },
    { value: 'NOT_SENT', label: 'Not sent', icon: 'bi-slash-circle' },
    { value: 'QUEUED', label: 'Sending', icon: 'bi-send' },
  ];
  protected readonly channels: { value: NotificationChannel | null; label: string; icon: string }[] = [
    { value: null, label: 'All', icon: 'bi-collection' },
    { value: 'EMAIL', label: 'Email', icon: 'bi-envelope' },
    { value: 'WHATSAPP', label: 'WhatsApp', icon: 'bi-whatsapp' },
    { value: 'SMS', label: 'Text', icon: 'bi-chat-text' },
  ];
  /** Icon, color class and name for each channel. */
  protected readonly channelMeta: Record<NotificationChannel, { icon: string; css: string; name: string }> = {
    EMAIL: { icon: 'bi-envelope-fill', css: 'ch-email', name: 'Email' },
    WHATSAPP: { icon: 'bi-whatsapp', css: 'ch-whatsapp', name: 'WhatsApp' },
    SMS: { icon: 'bi-chat-text-fill', css: 'ch-sms', name: 'Text message' },
  };
  /** Count shown on a status tab (from the live status), or null. */
  protected tabCount(tab: StatusTab): number | null {
    const s = this.status();
    if (!s) return null;
    return tab === 'FAILED' ? s.failed : tab === 'QUEUED' ? s.queued : tab === 'NOT_SENT' ? s.notSent : null;
  }

  /** Messages opened to read in full. */
  protected readonly expanded = signal<Set<number>>(new Set());
  protected toggle(id: number): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** The list grouped by day: "Today", "Yesterday", "Mon, Nov 9". */
  protected readonly groups = computed(() => {
    const out: { label: string; items: NotificationItem[] }[] = [];
    for (const m of this.items()) {
      const label = this.dayLabel(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    }
    return out;
  });

  private dayLabel(iso: string): string {
    const d = new Date(iso);
    const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((start(new Date()) - start(d)) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
    });
  }

  /** Initials for the avatar. */
  protected initials(name: string | null): string {
    return (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  }

  /** The preview without blank lines, so the first lines say something. */
  protected compact(text: string | null): string {
    return (text ?? '').replace(/\n\s*\n+/g, '\n').trim();
  }

  /** Long enough that it's cut short in the list. */
  protected isLong(m: NotificationItem): boolean {
    return (m.preview?.length ?? 0) > 160 || (m.preview?.split('\n').length ?? 0) > 3;
  }

  protected readonly status = signal<WhatsAppStatus | null>(null);
  protected readonly areas = signal<Area[]>([]);
  protected readonly items = signal<NotificationItem[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly pageSize = signal(savedPageSize());
  protected readonly tab = signal<StatusTab>('ALL');
  protected readonly channel = signal<NotificationChannel | null>(null);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly retrying = signal<number | null>(null);
  /** Admins: clearing old messages. */
  protected readonly clearOptions = [30, 60, 90, 180, 365];
  protected clearDays = 90;
  protected readonly clearing = signal(false);
  protected readonly deleting = signal<number | null>(null);

  protected announceArea: number | null = null;

  // ---------- To one person ----------
  /** Who the message goes to: everyone in the area, or one person. */
  protected readonly sendTo = signal<'AREA' | 'PERSON'>('AREA');
  /** People in the chosen area, A to Z. */
  protected readonly people = signal<Employee[]>([]);
  protected readonly personSearch = signal('');
  protected readonly personId = signal<number | null>(null);
  protected readonly personChoices = computed(() => {
    const q = this.personSearch().trim().toLowerCase();
    const chosen = this.personId();
    return this.people().filter(
      (e) => e.id === chosen || !q || e.fullName.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q),
    );
  });
  protected readonly person = computed(() => this.people().find((e) => e.id === this.personId()) ?? null);

  protected setSendTo(to: 'AREA' | 'PERSON'): void {
    this.sendTo.set(to);
    if (to === 'PERSON' && this.people().length === 0) this.loadPeople();
  }

  protected onAreaChange(): void {
    this.personId.set(null);
    this.people.set([]);
    if (this.sendTo() === 'PERSON') this.loadPeople();
  }

  private loadPeople(): void {
    if (this.announceArea == null) return;
    this.api.employees({ areaId: this.announceArea, active: true }).subscribe((list) =>
      this.people.set(
        list
          .filter((e) => e.role !== 'ADMIN' && e.id !== this.auth.user()?.id)
          .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' })),
      ),
    );
  }

  /** Sends the message to one person (email, and WhatsApp / text if they agreed). */
  protected async sendToPerson(): Promise<void> {
    const text = clean(this.message());
    const p = this.person();
    if (!text || this.messageError() || !p) return;
    const ok = await this.confirm.ask({
      title: `Send to ${p.fullName}?`,
      message: `“${text}”`,
      icon: 'bi-person-lines-fill',
      tone: 'primary',
      confirmText: 'Send message',
    });
    if (!ok) return;
    this.sending.set(true);
    this.api.messagePerson(p.id, text).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.message.set('');
        const how = res.sentBy.length ? res.sentBy.join(', ') : 'nowhere';
        if (res.sentBy.length) this.toast.success(`Message to ${p.fullName} sent by ${how}.`);
        else this.toast.error(`Couldn't reach ${p.fullName}: ${res.notSentBy.join('; ') || 'no way to contact them'}.`);
        this.tab.set('ALL');
        this.page.set(0);
        this.loadStatus();
        this.load();
      },
      error: () => this.sending.set(false),
    });
  }
  protected readonly message = signal('');
  protected readonly messageError = computed(() => {
    const m = this.message();
    if (!RULES.safeText.re.test(m)) return `Message: ${RULES.safeText.msg}`;
    if (m.length > this.maxMessage) return `Message can be at most ${this.maxMessage} characters.`;
    return '';
  });

  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    if (this.auth.isAdmin()) {
      this.api.areas().subscribe((list) => {
        this.areas.set(list.filter((a) => a.active));
        this.announceArea ??= this.areas()[0]?.id ?? null;
      });
    } else {
      this.announceArea = this.auth.user()?.areaId ?? null;
    }
    this.loadStatus();
    this.load();
    // Messages leave the queue within seconds: refresh while any are still sending.
    this.timer = setInterval(() => {
      if ((this.status()?.queued ?? 0) > 0 || this.items().some((i) => i.status === 'QUEUED')) {
        this.loadStatus();
        this.load(true);
      }
    }, 5000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  protected loadStatus(): void {
    this.api.whatsappStatus().subscribe((s) => this.status.set(s));
  }

  protected load(quiet = false): void {
    if (!quiet) this.loading.set(true);
    const tab = this.tab();
    this.api
      .notifications({ status: tab === 'ALL' ? null : tab, channel: this.channel(), page: this.page(), size: this.pageSize() })
      .subscribe({
        next: (res) => {
          this.items.set(res.content);
          this.total.set(res.totalElements);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected setTab(tab: StatusTab): void {
    this.tab.set(tab);
    this.page.set(0);
    this.load();
  }

  protected setChannel(channel: NotificationChannel | null): void {
    this.channel.set(channel);
    this.page.set(0);
    this.load();
  }

  protected goToPage(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected changePageSize(size: number): void {
    savePageSize(size);
    this.pageSize.set(size);
    this.page.set(0);
    this.load();
  }

  protected areaName(id: number | null): string {
    if (!this.auth.isAdmin()) return this.auth.user()?.areaName ?? 'your area';
    return this.areas().find((a) => a.id === id)?.name ?? '';
  }

  protected async sendAnnouncement(): Promise<void> {
    const text = clean(this.message());
    if (!text || this.messageError() || this.announceArea == null) return;
    const s = this.status();
    const ok = await this.confirm.ask({
      title: `Send to everyone in ${this.areaName(this.announceArea)}?`,
      message: `“${text}”`,
      icon: 'bi-megaphone',
      tone: 'primary',
      notes: [
        'Everyone gets it by email (unless they turned email off)' +
          (s?.connected ? ', on WhatsApp if they agreed' : '') +
          (s?.smsConnected ? ', and by text if they agreed' : '') +
          '.',
        ...(s && !s.emailConnected ? ["Email isn't connected yet, so it will only be recorded here."] : []),
      ],
      confirmText: 'Send announcement',
    });
    if (!ok) return;
    this.sending.set(true);
    this.api.announce(this.announceArea, text).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.message.set('');
        const missed = res.recipients - res.reachable;
        this.toast.success(
          `Announcement queued for ${res.recipients} people` +
            (missed > 0 ? ` (${missed} turned messages off and won't get it).` : '.'),
        );
        this.tab.set('ALL');
        this.page.set(0);
        this.loadStatus();
        this.load();
      },
      error: () => this.sending.set(false),
    });
  }

  /** Admins: remove messages older than the chosen age (all areas). Ones still being sent are kept. */
  protected async clearOld(): Promise<void> {
    const days = this.clearDays;
    const ok = await this.confirm.ask({
      title: `Clear messages older than ${days} days?`,
      message: 'They are removed from the Messages page for every area. This can\'t be undone.',
      icon: 'bi-trash3',
      tone: 'danger',
      notes: ['Messages still being sent are kept.', 'People keep the emails, texts and WhatsApp messages they already got.'],
      confirmText: 'Clear messages',
    });
    if (!ok) return;
    this.clearing.set(true);
    this.api.clearNotifications(days).subscribe({
      next: (res) => {
        this.clearing.set(false);
        this.toast.success(res.deleted === 0 ? `No messages older than ${days} days.` : `Cleared ${res.deleted} message${res.deleted === 1 ? '' : 's'}.`);
        this.page.set(0);
        this.loadStatus();
        this.load();
      },
      error: () => this.clearing.set(false),
    });
  }

  /** Admins: remove one message from the history. */
  protected async remove(item: NotificationItem): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete this message?',
      message: `The message to ${item.employeeName} is removed from this page. It isn't recalled from their phone or inbox.`,
      icon: 'bi-trash3',
      tone: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    this.deleting.set(item.id);
    this.api.deleteNotification(item.id).subscribe({
      next: () => {
        this.deleting.set(null);
        this.toast.success('Message deleted.');
        this.loadStatus();
        this.load(true);
      },
      error: () => this.deleting.set(null),
    });
  }

  protected retry(item: NotificationItem): void {
    this.retrying.set(item.id);
    this.api.retryNotification(item.id).subscribe({
      next: () => {
        this.retrying.set(null);
        this.toast.info(`Sending the message to ${item.employeeName} again.`);
        this.loadStatus();
        this.load(true);
      },
      error: () => this.retrying.set(null),
    });
  }
}
