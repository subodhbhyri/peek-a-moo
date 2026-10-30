import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ANALYTICS_SINK } from '../../core/analytics/analytics.service';
import { CornerStat } from './corner-stat';

describe('CornerStat sharing', () => {
  let sent: { name: string; props: Record<string, unknown> }[];
  beforeEach(() => {
    sent = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ANALYTICS_SINK,
          useValue: (name: string, props: Record<string, unknown>) => sent.push({ name, props }),
        },
      ],
    });
  });

  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  afterEach(() => {
    vi.restoreAllMocks();
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    delete (navigator as unknown as Record<string, unknown>)['share'];
    history.replaceState(null, '', '/');
  });

  function shown(stat: Parameters<CornerStat['show']>[0]) {
    const fixture = TestBed.createComponent(CornerStat);
    fixture.componentInstance.show(stat);
    fixture.detectChanges();
    return fixture;
  }

  it('the Moon keeps its exact v1 toast wording', () => {
    const f = shown({ durationMs: 4200, emoji: '🌕', targetId: 'moon' });
    expect(f.nativeElement.querySelector('.pill').textContent.trim()).toBe(
      'Found the moon in 4.2s 🌕',
    );
  });

  it('the Web Share text is the toast and the url deep-links to the target (no ?debug)', async () => {
    history.replaceState(null, '', '/?debug&target=moon');
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>)['share'] = share;
    const f = shown({
      durationMs: 4200,
      emoji: '',
      text: 'Found Jupiter in 4.2s',
      targetId: 'jupiter',
    });
    f.nativeElement.querySelector('.pill').click();
    await f.whenStable();
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0];
    expect(arg.text).toBe('Found Jupiter in 4.2s');
    expect(arg.url).toBe(`${location.origin}${location.pathname}?target=jupiter`);
    expect(arg.url).not.toContain('debug');
  });

  it('without Web Share it copies "Found Jupiter in 4.2s — <link>"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const f = shown({
      durationMs: 4200,
      emoji: '',
      text: 'Found Jupiter in 4.2s',
      targetId: 'jupiter',
    });
    f.nativeElement.querySelector('.pill').click();
    await f.whenStable();
    expect(writeText).toHaveBeenCalledWith(
      `Found Jupiter in 4.2s — ${location.origin}${location.pathname}?target=jupiter`,
    );
  });

  it('shows the not-visible note under the toast when given', () => {
    const f = shown({
      durationMs: 9000,
      emoji: '',
      text: 'Found the Galactic Center in 9.0s',
      note: 'Not visible to the eye — it is there, behind dust.',
      targetId: 'galactic-center',
    });
    expect(f.nativeElement.querySelector('.note').textContent).toContain('Not visible to the eye');
  });

  it('analytics: a native share reports { target, method: "native" }, only once it went through', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    (navigator as unknown as Record<string, unknown>)['share'] = share;
    const f = shown({
      durationMs: 4200,
      emoji: '',
      text: 'Found the ISS in 4.2s',
      targetId: 'iss',
    });
    f.nativeElement.querySelector('.pill').click();
    await f.whenStable();
    expect(sent).toEqual([{ name: 'share', props: { target: 'iss', method: 'native' } }]);
  });

  it('analytics: a cancelled share reports nothing', async () => {
    (navigator as unknown as Record<string, unknown>)['share'] = vi
      .fn()
      .mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const f = shown({ durationMs: 4200, emoji: '', text: 'x', targetId: 'iss' });
    f.nativeElement.querySelector('.pill').click();
    await f.whenStable();
    expect(sent).toEqual([]);
  });

  it('analytics: the clipboard fallback reports method "clipboard"', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    const f = shown({ durationMs: 4200, emoji: '🌕', targetId: 'moon' });
    f.nativeElement.querySelector('.pill').click();
    await f.whenStable();
    expect(sent).toEqual([{ name: 'share', props: { target: 'moon', method: 'clipboard' } }]);
  });
});
