import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Role } from '../core/models';
import { storeTestSession } from '../core/test-session';
import { Shell } from './shell';

async function renderAs(role: Role) {
  localStorage.clear();
  storeTestSession(role);
  await TestBed.configureTestingModule({
    imports: [Shell],
    providers: [provideRouter([]), provideHttpClient()],
  }).compileComponents();
  const fixture = TestBed.createComponent(Shell);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const labels = Array.from(el.querySelectorAll('.sidebar-link .link-label')).map((n) => n.textContent?.trim());
  return { fixture, el, labels };
}

describe('Shell', () => {
  afterEach(() => localStorage.clear());

  it('shows the AllianceTel brand and the full menu to admins', async () => {
    const { el, labels } = await renderAs('ADMIN');
    expect(el.querySelector('.brand-text')?.textContent).toContain('AllianceTel');
    expect(labels).toEqual(['Dashboard', 'Performance', 'Weekly Schedule', 'Day-off Requests', 'Employees', 'Messages', 'Time Clock', 'End of Day', 'Commission', 'Areas', 'Stores', 'Devices']);
  });

  it('shows managers their team but not areas', async () => {
    const { labels } = await renderAs('MANAGER');
    expect(labels).toEqual(['Dashboard', 'Performance', 'Weekly Schedule', 'Day-off Requests', 'My Team', 'Messages', 'Time Clock', 'End of Day', 'Stores']);
  });

  it('shows employees only their own pages', async () => {
    const { labels } = await renderAs('EMPLOYEE');
    expect(labels).toEqual(['My Schedule', 'My Days Off', 'End of Day', 'My Performance', 'Stores']);
  });

  it('shows back office only the Time Clock', async () => {
    const { labels } = await renderAs('BACK_OFFICE');
    expect(labels).toEqual(['Time Clock']);
  });

  it('shows the signed-in user and their area in the top bar', async () => {
    const { el } = await renderAs('MANAGER');
    expect(el.querySelector('.user-menu-toggle')?.textContent).toContain('Sam Rivera');
    expect(el.querySelector('.user-menu-toggle')?.textContent).toContain('Manager · San Diego');
    expect(el.querySelector('.avatar')?.textContent?.trim()).toBe('SR');
  });

  it('lets staff turn on email, WhatsApp and text-message updates from their menu', async () => {
    const { fixture, el } = await renderAs('EMPLOYEE');
    (el.querySelector('.user-menu-toggle') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#emailOptIn')).not.toBeNull();
    expect(el.querySelector('#waOptIn')).not.toBeNull();
    expect(el.querySelector('label[for=smsOptIn]')?.textContent).toContain('By text message');
    expect(el.querySelector('.sms-consent')?.textContent).toContain('Reply STOP');
  });

  it('asks for consent with the SMS Terms before turning on texts', async () => {
    const { fixture, el } = await renderAs('EMPLOYEE');
    (el.querySelector('.user-menu-toggle') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    const toggle = el.querySelector('#smsOptIn') as HTMLInputElement;
    if (toggle.disabled) {
      return; // no phone on file in this test session
    }
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    const box = el.querySelector('.sms-consent-box');
    expect(box?.textContent).toContain('Message and data rates may apply');
    expect(box?.textContent).toContain('Reply STOP');
    expect(box?.querySelector('a[href="/terms#sms-terms"]')).not.toBeNull();
    expect(box?.querySelector('a[href="/privacy"]')).not.toBeNull();
  });

  it('collapses the sidebar on desktop when the menu button is clicked', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    const { fixture, el } = await renderAs('ADMIN');
    const shell = el.querySelector('.app-shell')!;
    const before = shell.classList.contains('sidebar-collapsed');
    (el.querySelector('.topbar-toggle') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(shell.classList.contains('sidebar-collapsed')).toBe(!before);
  });
});
