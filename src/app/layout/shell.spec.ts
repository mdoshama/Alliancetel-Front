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
    expect(labels).toEqual(['Dashboard', 'Weekly Schedule', 'Day-off Requests', 'Employees', 'Areas', 'Stores']);
  });

  it('shows managers their team but not areas', async () => {
    const { labels } = await renderAs('MANAGER');
    expect(labels).toEqual(['Dashboard', 'Weekly Schedule', 'Day-off Requests', 'Stores', 'My Team']);
  });

  it('shows employees only their own pages', async () => {
    const { labels } = await renderAs('EMPLOYEE');
    expect(labels).toEqual(['My Schedule', 'My Days Off', 'Stores']);
  });

  it('shows the signed-in user and their area in the top bar', async () => {
    const { el } = await renderAs('MANAGER');
    expect(el.querySelector('.user-menu-toggle')?.textContent).toContain('Sam Rivera');
    expect(el.querySelector('.user-menu-toggle')?.textContent).toContain('Manager · San Diego');
    expect(el.querySelector('.avatar')?.textContent?.trim()).toBe('SR');
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
