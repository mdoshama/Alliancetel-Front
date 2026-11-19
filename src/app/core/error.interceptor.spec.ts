import { HttpErrorResponse } from '@angular/common/http';
import { describeError } from './error.interceptor';

const err = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('describeError', () => {
  it('never shows a status code', () => {
    expect(describeError(err(404))).toBe('Not found. It may have been removed.');
    expect(describeError(err(500))).toBe('Something went wrong on our side. Try again.');
    expect(describeError(err(418))).toBe('Something went wrong. Try again.');
    expect(describeError(err(0))).toContain('No connection');
  });

  it("keeps the app's own rule messages", () => {
    expect(describeError(err(409, { detail: 'Friday is full.' }))).toBe('Friday is full.');
  });

  it('hides technical details', () => {
    expect(describeError(err(404, { detail: 'Day-off request with id 12 not found' }))).toBe('Not found. It may have been removed.');
    expect(describeError(err(400, { detail: "Invalid value for 'areaId'." }))).toBe("Something's not right. Check and try again.");
  });

  it('shows field messages', () => {
    expect(describeError(err(400, { errors: { phone: 'Phone must be a valid number.' } }))).toBe('Phone must be a valid number.');
  });
});
