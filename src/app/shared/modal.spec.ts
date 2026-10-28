import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `
    <app-modal [open]="open()" title="Add store" (closed)="closedCount = closedCount + 1">
      <form id="f" (submit)="submitted = submitted + 1; $event.preventDefault()"><input id="name" /></form>
      <ng-container modal-footer><button id="save" type="submit" form="f">Save</button></ng-container>
    </app-modal>
  `,
})
class Host {
  open = signal(true);
  submitted = 0;
  closedCount = 0;
}

describe('Modal', () => {
  it('lets submit buttons in the footer submit the form', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('#save') as HTMLButtonElement).click();
    expect(fixture.componentInstance.submitted).toBe(1);
    expect(fixture.componentInstance.closedCount).toBe(0);
  });

  it('closes when the area outside the dialog is clicked, not when clicking inside', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('#name') as HTMLElement).click();
    expect(fixture.componentInstance.closedCount).toBe(0);
    (el.querySelector('.modal') as HTMLElement).click();
    expect(fixture.componentInstance.closedCount).toBe(1);
  });
});
