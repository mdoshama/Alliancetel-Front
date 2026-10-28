import { Injectable, signal } from '@angular/core';

export type ConfirmTone = 'primary' | 'danger' | 'warning';

export interface ConfirmOptions {
  title: string;
  /** Main sentence under the title. */
  message: string;
  /** Optional icon (Bootstrap Icons name, e.g. 'bi-send-check'). */
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  /** Extra lines shown as a highlighted list, e.g. warnings to consider before confirming. */
  notes?: string[];
  /** Ask for optional text (e.g. a reason); the entered text is returned on confirm. */
  input?: { label: string; placeholder?: string; maxLength?: number };
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (result: string | null) => void;
}

/**
 * In-app replacement for window.confirm / window.prompt, rendered by <app-confirm-dialog> in the app root.
 *
 *   if (await this.confirm.ask({ title: 'Publish schedule?', message: '…' })) { … }
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<ConfirmRequest | null>(null);

  /** Resolves true if the user confirms, false if they cancel or dismiss. */
  async ask(options: ConfirmOptions): Promise<boolean> {
    return (await this.open(options)) !== null;
  }

  /** Like ask(), but with a text box; resolves to the text (possibly empty) on confirm, or null on cancel. */
  askWithInput(options: ConfirmOptions & { input: NonNullable<ConfirmOptions['input']> }): Promise<string | null> {
    return this.open(options);
  }

  private open(options: ConfirmOptions): Promise<string | null> {
    // A new request replaces any open one; the old one counts as cancelled.
    this.current()?.resolve(null);
    return new Promise((resolve) => {
      this.current.set({
        ...options,
        resolve: (result) => {
          this.current.set(null);
          resolve(result);
        },
      });
    });
  }
}
