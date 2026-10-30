import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { ANALYTICS_SINK } from './core/analytics/analytics.service';
import { SkyEngineService } from './core/engine/sky-engine.service';
import { LocationService } from './core/sensors/location.service';
import { OrientationService } from './core/sensors/orientation.service';
import { CameraFovService } from './core/projection/camera-fov.service';
import { StatsService } from './core/personality/stats.service';
import { LINE_PACKS } from './core/personality/lines';

// Each test bootstraps the whole App, and the first one in a file pays the cold start: slow on a loaded or
// 2-core CI machine. A per-file allowance (the global default stays 5 s).
vi.setConfig({ testTimeout: 15_000 });

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };

describe('App: analytics wiring', () => {
  let sent: { name: string; props: Record<string, unknown> }[];

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
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
    localStorage.clear();
  });

  async function render(search = '') {
    sent = [];
    history.replaceState(null, '', '/' + search);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ANALYTICS_SINK,
          useValue: (name: string, props: Record<string, unknown>) => sent.push({ name, props }),
        },
      ],
    });
    TestBed.inject(LocationService).setManual(POS);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const named = (n: string) => sent.filter((s) => s.name === n);

  it('the first target is reported once: "default" for the Moon, "link" for ?target=', async () => {
    await render();
    expect(named('target_selected').map((s) => s.props)).toEqual([
      { target: 'moon', from: 'default' },
    ]);
    await render('?target=jupiter');
    expect(named('target_selected').map((s) => s.props)).toEqual([
      { target: 'jupiter', from: 'link' },
    ]);
  });

  it('a remembered choice counts as "default", not a link', async () => {
    localStorage.setItem('ptm.target', 'saturn');
    await render();
    expect(named('target_selected').map((s) => s.props)).toEqual([
      { target: 'saturn', from: 'default' },
    ]);
  });

  it('nothing is sent under ?debug', async () => {
    await render('?debug&target=iss');
    TestBed.inject(OrientationService).status.set('manual');
    TestBed.inject(SkyEngineService).events$.next({
      type: 'found',
      targetId: 'iss',
      durationMs: 2000,
      findIndex: 1,
    });
    expect(sent).toEqual([]);
  });

  it('sensor_mode: one event per session, by path (ios / absolute / drag / no-compass)', async () => {
    const cases = [
      ['active', 'ios-compass', 'ios'],
      ['active', 'absolute', 'absolute'],
      ['manual', null, 'drag'],
      ['unsupported', null, 'drag'],
      ['no-compass', null, 'no-compass'],
    ] as const;
    for (const [status, source, mode] of cases) {
      const { fixture } = await render();
      const ori = TestBed.inject(OrientationService);
      ori.headingSource.set(source);
      ori.status.set(status);
      fixture.detectChanges();
      await fixture.whenStable();
      ori.status.set('waiting');
      fixture.detectChanges();
      ori.status.set(status);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(
        named('sensor_mode').map((s) => s.props),
        `${status}/${source}`,
      ).toEqual([{ mode }]);
    }
  });

  it('a find reports bucketed time, availability, camera and alignment and shows a line from the pack', async () => {
    const { fixture, el } = await render('?target=jupiter');
    TestBed.tick();
    const engine = TestBed.inject(SkyEngineService);
    expect(engine.target()!.id).toBe('jupiter');
    TestBed.inject(CameraFovService).cameraOn.set(true);
    engine.events$.next({ type: 'found', targetId: 'jupiter', durationMs: 4200, findIndex: 1 });
    fixture.detectChanges();

    const found = named('target_found');
    expect(found).toHaveLength(1);
    expect(Object.keys(found[0].props).sort()).toEqual([
      'aligned',
      'camera',
      'seconds',
      'target',
      'visibility',
    ]);
    expect(found[0].props).toMatchObject({
      target: 'jupiter',
      seconds: '3-10',
      camera: true,
      aligned: false,
    });
    expect(['up-visible', 'up-daylight', 'up-too-faint', 'below-horizon']).toContain(
      found[0].props['visibility'],
    );
    // The first find of Jupiter says its first line, and it counts as a find in the stats.
    expect(el.querySelector('.found-line')!.textContent).toBe(LINE_PACKS['jupiter']['first']![0]);
    expect(TestBed.inject(StatsService).stats().perTarget['jupiter'].finds).toBe(1);
  });

  it('the second find of a target speaks from the rest of its pack', async () => {
    const { fixture, el } = await render('?target=saturn');
    TestBed.tick();
    const engine = TestBed.inject(SkyEngineService);
    engine.events$.next({ type: 'found', targetId: 'saturn', durationMs: 8000, findIndex: 1 });
    engine.events$.next({ type: 'found', targetId: 'saturn', durationMs: 8000, findIndex: 2 });
    fixture.detectChanges();
    const shown = el.querySelector('.found-line')!.textContent!;
    expect(shown).not.toBe(LINE_PACKS['saturn']['first']![0]);
    const all = Object.values(LINE_PACKS['saturn']).flat();
    expect(all).toContain(shown);
  });

  it('the Sun only ever says a safety line', async () => {
    const { fixture, el } = await render('?target=sun');
    TestBed.tick();
    const engine = TestBed.inject(SkyEngineService);
    for (let i = 1; i <= 3; i++) {
      engine.events$.next({ type: 'found', targetId: 'sun', durationMs: 5000, findIndex: i });
      fixture.detectChanges();
      expect(LINE_PACKS['sun']['safety']).toContain(el.querySelector('.found-line')!.textContent);
    }
  });
});
