import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LocationService } from '../../core/sensors/location.service';
import { SKY_URL, SkyDataService } from '../../core/sky/sky-data.service';
import { skyGeometry } from '../../core/sky/testing/sky-fixture';
import { ALL_TARGETS, getTarget } from '../../core/targets/catalog';
import { computeTargetState } from '../../core/targets/compute';
import { TargetInfo } from './target-info';
import { TargetInfoService } from './target-info.service';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const NIGHT = new Date('2026-12-15T04:00:00Z');

describe('TargetInfo card: constellations (Phase 10)', () => {
  let fixture: ComponentFixture<TargetInfo>;
  let svc: TargetInfoService;
  let fetchMock: ReturnType<typeof vi.fn>;
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(s: string) => el().querySelector<T>(s);
  const qa = (s: string) => Array.from(el().querySelectorAll<HTMLElement>(s));
  const open = (id: string) => {
    svc.open(getTarget(id)!, 'picker');
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NIGHT);
    fetchMock = vi.fn(async () => new Response('nope', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    TestBed.inject(LocationService).setManual(POS);
    svc = TestBed.inject(TargetInfoService);
    fixture = TestBed.createComponent(TargetInfo);
    fixture.detectChanges();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a rank-1 constellation: type, "{Latin} — the {English}", exactly three facts', () => {
    open('orion');
    expect(q('h2')!.textContent).toBe('Orion');
    expect(q('.type')!.textContent).toBe('Constellation');
    expect(q('.desc')!.textContent).toBe(
      'Orion — the Hunter. One of the 88 constellations recognized by the International Astronomical Union.',
    );
    expect(qa('.facts li')).toHaveLength(3);
    expect(q('[role=dialog]')!.getAttribute('aria-label')).toBe('About Orion');
  });

  it('every rank-1 card shows three facts and every rank 2-3 card shows no facts list at all', () => {
    for (const c of ALL_TARGETS.filter((t) => t.kind === 'constellation')) {
      open(c.id);
      if (c.constellation!.rank === 1) {
        expect(qa('.facts li'), c.id).toHaveLength(3);
      } else {
        expect(q('.facts'), c.id).toBeNull();
      }
      expect(q('.desc')!.textContent, c.id).toContain(`the ${c.constellation!.english}`);
      svc.close();
      fixture.detectChanges();
    }
  });

  it('opening a constellation card asks for the star map (once); other cards do not', () => {
    const skyCalls = () => fetchMock.mock.calls.filter((c) => c[0] === SKY_URL).length;
    open('jupiter');
    open('sirius');
    expect(skyCalls()).toBe(0);
    open('orion');
    expect(skyCalls()).toBe(1);
    // Without the map (the stub answers 404) the card still opens and shows no live row.
    expect(qa('.stat')).toHaveLength(0);
    open('crux');
    expect(skyCalls()).toBe(1); // already tried; the cool-down stops a second request
  });

  it('with the star map the live row says Up from here / Partly up / Below the horizon', () => {
    TestBed.inject(SkyDataService).geometry.set(skyGeometry());
    open('orion');
    const row = () =>
      qa('.stat').map((r) => [
        r.querySelector('dt')!.textContent,
        r.querySelector('dd')!.textContent,
      ]);
    expect(row()).toEqual([['Right now', 'Up from here']]);
    svc.close();
    fixture.detectChanges();
    open('octans');
    expect(row()).toEqual([['Right now', 'Below the horizon']]);
    svc.close();
    fixture.detectChanges();
    // Find any constellation that is partly up right now from here.
    const sky = skyGeometry();
    const partly = sky.constellations.find(
      (c) =>
        computeTargetState(getTarget(c.id)!, NIGHT, POS, undefined, sky).constellation?.partlyUp,
    );
    expect(partly).toBeDefined();
    open(partly!.id);
    expect(row()).toEqual([['Right now', 'Partly up']]);
  });

  it('"Find it" is offered like for any target', () => {
    open('crux');
    expect(q('.pill.primary')!.textContent!.trim()).toBe('Find it');
  });
});
