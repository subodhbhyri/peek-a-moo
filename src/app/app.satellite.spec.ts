import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { SkyEngineService } from './core/engine/sky-engine.service';
import { GpService } from './core/gp/gp.service';
import { GP_FIXTURE } from './core/gp/testing/gp-fixture';
import { issOverheadMoment } from './core/gp/testing/iss-moment';
import { TARGETS } from './core/targets/catalog';
import { computeTargetState } from './core/targets/compute';
import { LocationService } from './core/sensors/location.service';
import { OrientationService } from './core/sensors/orientation.service';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const setUrl = (search: string) => history.replaceState(null, '', '/' + search);
const freshPayload = () => ({ ...GP_FIXTURE, fetchedAt: new Date().toISOString() });

describe('App: satellites and the network', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    fetchMock = vi.fn(async () => new Response(JSON.stringify(freshPayload()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setUrl('');
    localStorage.clear();
  });

  async function render(search = '') {
    TestBed.resetTestingModule();
    TestBed.inject(LocationService).setManual(POS);
    setUrl(search);
    const gpGet = vi.spyOn(TestBed.inject(GpService), 'get');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, gpGet };
  }

  it('no request at app start: the Moon (the default) never touches the network or GpService', async () => {
    const { gpGet } = await render();
    expect(gpGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nor for a planet, a star or a deep-sky object', async () => {
    for (const id of ['jupiter', 'sirius', 'm31']) {
      fetchMock.mockClear();
      const { gpGet } = await render(`?target=${id}`);
      expect(gpGet, id).not.toHaveBeenCalled();
      expect(fetchMock, id).not.toHaveBeenCalled();
    }
  });

  it('opening the picker is what asks (the Satellites section renders), once', async () => {
    const { fixture, el, gpGet } = await render();
    expect(gpGet).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('.intro .link')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(gpGet).toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/gp')).toHaveLength(1);
  });

  it('selecting a satellite fetches the orbit data and the intro says "Find the ISS." plus its pass label', async () => {
    const { fixture, el, gpGet } = await render('?target=iss');
    expect(gpGet).toHaveBeenCalled();
    expect(el.querySelector('.intro h1')!.textContent!.trim()).toBe('Find the ISS.');
    // The orbit data arrives asynchronously; the note follows.
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('.intro .note')).not.toBeNull();
    });
    const note = el.querySelector('.intro .note')!.textContent!;
    expect(note).toMatch(/^(Overhead now|Visible pass|No visible passes today)/);
  });

  it('with no orbit data at all it says so instead of showing nothing', async () => {
    fetchMock.mockImplementation(async () => new Response('nope', { status: 500 }));
    const { fixture, el } = await render('?target=iss');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('.orbit-status')?.textContent?.trim()).toBe('Orbit data unavailable');
    });
    expect(el.querySelector('.intro .note')!.textContent).toContain('Orbit data unavailable');
  });

  it('the sight-alignment button is hidden for satellites but shown for an ordinary target that is up', async () => {
    // Freeze the clock at a moment when the ISS is high, so hiding it is about its kind, not its altitude.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const when = issOverheadMoment(POS);
      vi.setSystemTime(when);
      const ordinary = TARGETS.find(
        (t) => t.kind === 'fixed' && computeTargetState(t, when, POS).altitudeDeg > 5,
      )!;
      for (const [id, expected] of [
        ['iss', false],
        [ordinary.id, true],
      ] as const) {
        const { fixture, el } = await render(`?target=${id}`);
        TestBed.inject(OrientationService).status.set('active');
        await vi.waitFor(() => {
          fixture.detectChanges();
          expect(TestBed.inject(SkyEngineService).target(), id).not.toBeNull();
        });
        expect(!!el.querySelector('.align-button'), id).toBe(expected);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
