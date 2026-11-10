import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Observable, Subject, debounceTime, filter } from 'rxjs';
import { AuthService } from './auth.service';

/** What kind of data changed on another screen. "resync" means: we may have missed changes, reload anyway. */
export type LiveTopic = 'schedule' | 'dayoff' | 'people' | 'timeclock' | 'eod' | 'resync';

export interface LiveChange {
  topic: LiveTopic;
  /** First name of whoever made the change (managers and admins only). */
  byName: string | null;
}

export type LiveStatus = 'off' | 'connecting' | 'live' | 'retrying';

/** Random id for this browser tab, sent with every API call so the server doesn't echo our own changes back. */
export const TAB_ID = makeTabId();

function makeTabId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) {
    return 'tab-' + c.randomUUID();
  }
  return 'tab-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Splits a server-sent-events text stream into events. Returns the events found and the unfinished remainder. */
export function parseSse(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':') || line === '') continue;
      const i = line.indexOf(':');
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length || event !== 'message') {
      events.push({ event, data: data.join('\n') });
    }
  }
  return { events, rest };
}

/**
 * Keeps a live connection to the server while someone is signed in, so a change made on one device (a manager
 * editing a week, an admin approving a day off) shows up on every other open screen within a second or two.
 *
 * Uses fetch rather than EventSource so the sign-in token travels in the Authorization header, never in the URL.
 */
@Injectable({ providedIn: 'root' })
export class LiveService {
  private readonly auth = inject(AuthService);
  private readonly changes$ = new Subject<LiveChange>();
  private controller: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 2000;
  private hasConnectedBefore = false;

  readonly status = signal<LiveStatus>('off');

  constructor() {
    // Connect when signed in, disconnect on sign-out (or when the token changes).
    effect(() => {
      const token = this.auth.isLoggedIn() ? this.auth.token() : null;
      this.stop();
      if (token && typeof fetch === 'function' && typeof TextDecoder !== 'undefined') {
        this.hasConnectedBefore = false;
        this.retryDelay = 2000;
        void this.connect(token);
      }
    });
    // Back from sleep or a hidden tab: the stream may have died quietly; reconnect and refresh.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.status() === 'retrying') {
          clearTimeout(this.retryTimer);
          const token = this.auth.token();
          if (token) void this.connect(token);
        }
      });
    }
  }

  /**
   * Changes of the given kinds made elsewhere, bunched together (several quick edits arrive as one), for as long as
   * the calling component lives.
   */
  on(topics: LiveTopic[], destroyRef: DestroyRef, handler: (change: LiveChange) => void): void {
    const wanted = new Set<LiveTopic>([...topics, 'resync']);
    const sub = this.changes$
      .pipe(
        filter((c) => wanted.has(c.topic)),
        debounceTime(400),
      )
      .subscribe(handler);
    destroyRef.onDestroy(() => sub.unsubscribe());
  }

  /** For tests and other services: every change as it arrives. */
  changes(): Observable<LiveChange> {
    return this.changes$.asObservable();
  }

  private stop(): void {
    clearTimeout(this.retryTimer);
    this.controller?.abort();
    this.controller = null;
    this.status.set('off');
  }

  private async connect(token: string): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.status.set(this.hasConnectedBefore ? 'retrying' : 'connecting');
    try {
      const res = await fetch(`/api/live?client=${encodeURIComponent(TAB_ID)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream', 'X-Client-Id': TAB_ID },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (res.status === 401 || res.status === 403) {
        // Signed out elsewhere, or not allowed: the normal API calls will deal with it.
        this.status.set('off');
        return;
      }
      if (!res.ok || !res.body) {
        throw new Error(`Live stream: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSse(buffer);
        buffer = parsed.rest;
        for (const e of parsed.events) this.handle(e.event, e.data);
      }
      throw new Error('Live stream ended');
    } catch {
      if (controller.signal.aborted || this.controller !== controller) {
        return;
      }
      this.status.set('retrying');
      this.retryTimer = setTimeout(() => {
        const t = this.auth.token();
        if (t && this.controller === controller) void this.connect(t);
      }, this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 30000);
    }
  }

  private handle(event: string, data: string): void {
    if (event === 'ready') {
      this.status.set('live');
      this.retryDelay = 2000;
      // After a dropped connection we may have missed changes: tell pages to reload once.
      if (this.hasConnectedBefore) {
        this.changes$.next({ topic: 'resync', byName: null });
      }
      this.hasConnectedBefore = true;
      return;
    }
    if (event !== 'change') return;
    try {
      const body = JSON.parse(data) as { topic?: string; byName?: string | null };
      const topic = body.topic as LiveTopic;
      if (['schedule', 'dayoff', 'people', 'timeclock', 'eod'].includes(topic)) {
        this.changes$.next({ topic, byName: body.byName ?? null });
      }
    } catch {
      // Ignore anything we can't read.
    }
  }
}
