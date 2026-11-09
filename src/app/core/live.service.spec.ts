import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { LiveChange, LiveService, TAB_ID, parseSse } from './live.service';
import { storeTestSession } from './test-session';

/** A fetch response whose body streams the given chunks, then stays open until the test aborts it. */
function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('parseSse', () => {
  it('splits events and keeps an unfinished one for later', () => {
    const { events, rest } = parseSse(
      'event: ready\ndata: {}\n\n:ping\n\nevent: change\ndata: {"topic":"schedule"}\n\nevent: chan',
    );
    expect(events).toEqual([
      { event: 'ready', data: '{}' },
      { event: 'change', data: '{"topic":"schedule"}' },
    ]);
    expect(rest).toBe('event: chan');
  });

  it('copes with Windows line endings', () => {
    expect(parseSse('event: ready\r\ndata: {}\r\n\r\n').events).toEqual([{ event: 'ready', data: '{}' }]);
  });
});

describe('LiveService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  function setup(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchMock);
    storeTestSession('MANAGER');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const live = TestBed.inject(LiveService);
    TestBed.tick();
    return live;
  }

  it('connects with the token in the header (not the URL) and passes changes on', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse(['event: ready\ndata: {}\n\n', 'event: change\ndata: {"topic":"dayoff","byName":"Ana"}\n\n']),
    );
    const live = setup(fetchMock);
    const seen: LiveChange[] = [];
    live.changes().subscribe((c) => seen.push(c));
    await flush();
    await flush();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/live?client=${encodeURIComponent(TAB_ID)}`);
    expect(String(url)).not.toContain('test-token');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
    expect(live.status()).toBe('live');
    expect(seen).toEqual([{ topic: 'dayoff', byName: 'Ana' }]);
  });

  it('ignores events it does not know', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamResponse(['event: ready\ndata: {}\n\n', 'event: change\ndata: {"topic":"secrets"}\n\n', 'event: change\ndata: nope\n\n']),
    );
    const live = setup(fetchMock);
    const seen: LiveChange[] = [];
    live.changes().subscribe((c) => seen.push(c));
    await flush();
    await flush();
    expect(seen).toEqual([]);
  });

  it('stops trying when the server says the sign-in is no good', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const live = setup(fetchMock);
    await flush();
    expect(live.status()).toBe('off');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
