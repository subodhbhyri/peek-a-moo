import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ANALYTICS_SINK } from '../../core/analytics/analytics.service';
import { GpService } from '../../core/gp/gp.service';
import { GP_FIXTURE } from '../../core/gp/testing/gp-fixture';
import { LocationService } from '../../core/sensors/location.service';
import { getTarget } from '../../core/targets/catalog';
import type { TargetDef } from '../../core/targets/target.types';
import { TargetInfo } from './target-info';
import { TargetInfoService } from './target-info.service';

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };

describe('TargetInfo card', () => {
  let fixture: ComponentFixture<TargetInfo>;
  let svc: TargetInfoService;
  let sent: { name: string; props: Record<string, unknown> }[];
  let found: TargetDef[];
  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(s: string) => el().querySelector<T>(s);
  const qa = (s: string) => Array.from(el().querySelectorAll<HTMLElement>(s));
  const open = (id: string, from: 'picker' | 'found' | 'look-around' = 'picker') => {
    svc.open(getTarget(id)!, from);
    fixture.detectChanges();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T01:20:00Z'));
    sent = [];
    found = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ANALYTICS_SINK,
          useValue: (name: string, props: Record<string, unknown>) => sent.push({ name, props }),
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...GP_FIXTURE, fetchedAt: new Date().toISOString() }), {
            status: 200,
          }),
      ),
    );
    TestBed.inject(LocationService).setManual(POS);
    svc = TestBed.inject(TargetInfoService);
    fixture = TestBed.createComponent(TargetInfo);
    fixture.componentInstance.findIt.subscribe((d) => found.push(d));
    fixture.detectChanges();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is closed until a target is opened, then is a modal dialog labelled for that target', () => {
    expect(q('[role=dialog]')).toBeNull();
    open('jupiter');
    const d = q('[role=dialog]')!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('About Jupiter');
  });

  it('shows the name, type, description, exactly three facts and live rows', () => {
    open('jupiter');
    const def = getTarget('jupiter')!;
    expect(q('h2')!.textContent).toBe('Jupiter');
    expect(q('.type')!.textContent).toBe('Gas giant planet');
    expect(q('.desc')!.textContent).toBe(def.info.description);
    expect(qa('.facts li').map((l) => l.textContent)).toEqual([...def.info.facts]);
    const labels = qa('.stat dt').map((d) => d.textContent);
    expect(labels).toEqual(['Distance right now', 'Light takes', 'Brightness', 'Up from here']);
    expect(qa('.stat dd').every((d) => d.textContent!.trim().length > 0)).toBe(true);
  });

  it('fixed-sky targets show their distance', () => {
    open('m31');
    const rows = Object.fromEntries(
      qa('.stat').map((r) => [
        r.querySelector('dt')!.textContent,
        r.querySelector('dd')!.textContent,
      ]),
    );
    expect(rows['Distance']).toBe('about 2.5 million light-years');
  });

  it('the Sun card shows the safety line first, in warning style', () => {
    open('sun');
    const warning = q('.sun-warning')!;
    expect(warning.textContent).toBe(
      'Never look at the Sun — not directly, not through your camera.',
    );
    expect(warning.getAttribute('role')).toBe('alert');
    const order = qa('header, .sun-warning, .desc');
    expect(order.map((n) => n.className || n.tagName.toLowerCase())).toEqual([
      'header',
      'sun-warning',
      'desc',
    ]);
    open('jupiter');
    expect(q('.sun-warning')).toBeNull();
  });

  it('Find it hands the target to the parent; Close just closes', () => {
    open('saturn');
    q<HTMLButtonElement>('.pill.primary')!.click();
    expect(found.map((d) => d.id)).toEqual(['saturn']);
    const closeBtn = qa('.actions .pill').find((b) => b.textContent!.trim() === 'Close')!;
    closeBtn.click();
    fixture.detectChanges();
    expect(q('[role=dialog]')).toBeNull();
    expect(found).toHaveLength(1);
  });

  it('Escape and the backdrop close it; Escape stays inside the card (a sheet beneath is untouched)', () => {
    open('mars');
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    q('[role=dialog]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(q('[role=dialog]')).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
    open('mars');
    q('.backdrop')!.click();
    fixture.detectChanges();
    expect(q('[role=dialog]')).toBeNull();
  });

  it('focus moves into the card, stays there on Tab, and returns to the opener on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    open('venus');
    vi.advanceTimersByTime(10);
    expect(document.activeElement).toBe(q('[role=dialog]'));
    const buttons = qa('[role=dialog] button:not([tabindex="-1"])');
    buttons[buttons.length - 1].focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    buttons[buttons.length - 1].dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    svc.close();
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('swipe down on the handle closes it', () => {
    open('venus');
    const grab = q('.grab')!;
    const ptr = (type: string, y: number) =>
      grab.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), { clientY: y, pointerId: 1 }),
      );
    ptr('pointerdown', 100);
    ptr('pointermove', 150);
    ptr('pointerup', 150);
    fixture.detectChanges();
    expect(q('[role=dialog]')).not.toBeNull(); // 50 px is not enough
    ptr('pointerdown', 100);
    ptr('pointermove', 240);
    fixture.detectChanges();
    ptr('pointerup', 240);
    fixture.detectChanges();
    expect(q('[role=dialog]')).toBeNull();
  });

  it('live numbers refresh every 5 s (planets) and every second (satellites)', async () => {
    open('venus');
    const light = () => qa('.stat dd')[1].textContent;
    const before = light();
    const moved = vi.spyOn(Date, 'now');
    moved.mockRestore();
    vi.setSystemTime(new Date('2026-12-30T01:20:00Z')); // two months on: Venus is somewhere else
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(light()).toBe(before); // 4 s: not refreshed yet
    vi.advanceTimersByTime(1500);
    fixture.detectChanges();
    expect(light()).not.toBe(before);

    open('iss');
    const height = () =>
      qa('.stat')
        .find((r) => r.querySelector('dt')!.textContent === 'Height')
        ?.querySelector('dd')?.textContent;
    const speed = () =>
      qa('.stat')
        .find((r) => r.querySelector('dt')!.textContent === 'Speed')
        ?.querySelector('dd')?.textContent;
    // The orbit data arrives from the (mocked) request on a later macrotask: wait for it, not for a tick count.
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(height()).toMatch(/km above Earth$/);
    });
    expect(speed()).toMatch(/km\/s$/);
    const h0 = height();
    vi.setSystemTime(new Date(Date.now() + 600_000));
    vi.advanceTimersByTime(1100);
    fixture.detectChanges();
    expect(height()).not.toBe(h0);
  });

  it('asks for orbit data when a satellite card opens, and for nothing otherwise', async () => {
    const gp = TestBed.inject(GpService);
    const get = vi.spyOn(gp, 'get');
    open('jupiter');
    expect(get).not.toHaveBeenCalled();
    open('hubble');
    expect(get).toHaveBeenCalled();
  });

  it('analytics: reports { target, from } once per opening, for each entry point', () => {
    open('jupiter', 'picker');
    open('iss', 'found');
    open('sirius', 'look-around');
    expect(sent).toEqual([
      { name: 'target_info_opened', props: { target: 'jupiter', from: 'picker' } },
      { name: 'target_info_opened', props: { target: 'iss', from: 'found' } },
      { name: 'target_info_opened', props: { target: 'sirius', from: 'look-around' } },
    ]);
  });

  it('every target opens without error', () => {
    for (const id of [
      'moon',
      'sun',
      'mercury',
      'neptune',
      'polaris',
      'm42',
      'galactic-center',
      'lmc',
      'tiangong',
    ]) {
      open(id);
      expect(q('h2')!.textContent, id).toBe(getTarget(id)!.name);
      expect(qa('.facts li')).toHaveLength(3);
    }
  });
});
