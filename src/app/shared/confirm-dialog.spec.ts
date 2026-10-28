import { TestBed } from '@angular/core/testing';
import { ConfirmService } from '../core/confirm.service';
import { ConfirmDialog } from './confirm-dialog';

async function setup() {
  await TestBed.configureTestingModule({ imports: [ConfirmDialog] }).compileComponents();
  const fixture = TestBed.createComponent(ConfirmDialog);
  const service = TestBed.inject(ConfirmService);
  fixture.detectChanges();
  return { fixture, service, el: fixture.nativeElement as HTMLElement };
}

describe('ConfirmDialog', () => {
  it('shows nothing until asked', async () => {
    const { el } = await setup();
    expect(el.querySelector('.confirm-card')).toBeNull();
  });

  it('shows a card with title, message and notes, and resolves true on confirm', async () => {
    const { fixture, service, el } = await setup();
    const answer = service.ask({
      title: 'Publish schedule?',
      message: 'The ALLIANCETEL-SD schedule for Oct 26 – Nov 1, 2026 will become visible.',
      notes: ['2 store-day(s) are below their minimum staffing.'],
      confirmText: 'Publish anyway',
      tone: 'warning',
    });
    fixture.detectChanges();

    expect(el.querySelector('.confirm-card h5')?.textContent).toContain('Publish schedule?');
    expect(el.querySelector('.confirm-card p')?.textContent).toContain('ALLIANCETEL-SD');
    expect(el.querySelector('.confirm-notes')?.textContent).toContain('below their minimum');
    const buttons = el.querySelectorAll<HTMLButtonElement>('.modal-footer button');
    expect(buttons[1].textContent?.trim()).toBe('Publish anyway');

    buttons[1].click();
    expect(await answer).toBe(true);
    fixture.detectChanges();
    expect(el.querySelector('.confirm-card')).toBeNull();
  });

  it('resolves false on cancel', async () => {
    const { fixture, service, el } = await setup();
    const answer = service.ask({ title: 'Delete?', message: 'Gone for good.', tone: 'danger' });
    fixture.detectChanges();
    el.querySelectorAll<HTMLButtonElement>('.modal-footer button')[0].click();
    expect(await answer).toBe(false);
  });

  it('returns the typed text for input dialogs, or null when cancelled', async () => {
    const { fixture, service, el } = await setup();
    const answer = service.askWithInput({
      title: 'Reject day off?',
      message: 'Sam asked for Tuesday off.',
      input: { label: 'Reason' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const input = el.querySelector<HTMLInputElement>('#confirm-input')!;
    input.value = '  Short-staffed  ';
    input.dispatchEvent(new Event('input'));
    el.querySelectorAll<HTMLButtonElement>('.modal-footer button')[1].click();
    expect(await answer).toBe('Short-staffed');

    const second = service.askWithInput({ title: 'Reject?', message: 'x', input: { label: 'Reason' } });
    fixture.detectChanges();
    el.querySelectorAll<HTMLButtonElement>('.modal-footer button')[0].click();
    expect(await second).toBeNull();
  });
});
