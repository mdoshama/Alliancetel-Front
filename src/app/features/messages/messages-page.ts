import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import {
  Area,
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

/** WhatsApp messages: connection status, announcements to an area, and what was sent to whom. */
@Component({
  selector: 'app-messages-page',
  imports: [FormsModule, DatePipe, RouterLink, Pagination],
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
  protected readonly tabs: { value: StatusTab; label: string }[] = [
    { value: 'ALL', label: 'All' },
    { value: 'SENT', label: 'Sent' },
    { value: 'FAILED', label: 'Failed' },
    { value: 'NOT_SENT', label: 'Not sent' },
    { value: 'QUEUED', label: 'Sending' },
  ];

  protected readonly status = signal<WhatsAppStatus | null>(null);
  protected readonly areas = signal<Area[]>([]);
  protected readonly items = signal<NotificationItem[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly pageSize = signal(savedPageSize());
  protected readonly tab = signal<StatusTab>('ALL');
  protected readonly channel = signal<NotificationChannel | null>(null);
  /** Which setup guide is open (admins): email or WhatsApp. */
  protected readonly setup = signal<'EMAIL' | 'WHATSAPP' | null>(null);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly retrying = signal<number | null>(null);
  protected readonly copied = signal<string | null>(null);
  protected readonly showTemplates = signal(false);

  protected announceArea: number | null = null;
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

  protected toggleSetup(which: 'EMAIL' | 'WHATSAPP'): void {
    this.setup.set(this.setup() === which ? null : which);
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
        'Everyone gets it by email (unless they turned email off)' + (s?.connected ? ', and on WhatsApp if they agreed.' : '.'),
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

  protected copy(text: string, key: string): void {
    navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(key);
      setTimeout(() => this.copied.set(null), 1500);
    });
  }

  protected readonly emailVars = [
    { name: 'EMAIL_ENABLED', value: 'true', note: 'Turns email on.' },
    { name: 'RESEND_API_KEY', value: 're_…', note: 'Resend → API Keys → Create (Sending access).' },
    { name: 'EMAIL_FROM', value: 'AllianceTel <schedule@yourdomain.com>', note: 'An address on the domain you verified in Resend.' },
    { name: 'EMAIL_REPLY_TO', value: 'manager@yourdomain.com', note: 'Optional: where replies go.' },
    { name: 'APP_URL', value: 'https://your-domain.com', note: 'The button in each email opens this.' },
  ];

  protected readonly envVars = [
    { name: 'WHATSAPP_ENABLED', value: 'true', note: 'Turns sending on.' },
    { name: 'WHATSAPP_PHONE_NUMBER_ID', value: '', note: 'WhatsApp Manager → Phone numbers (the ID, not the number).' },
    { name: 'WHATSAPP_ACCESS_TOKEN', value: '', note: 'A permanent System User token with whatsapp_business_messaging.' },
    { name: 'APP_URL', value: 'https://your-domain.com', note: 'Link at the end of each schedule message.' },
  ];
}
