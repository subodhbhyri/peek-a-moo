import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';
import { LocationService } from './core/sensors/location.service';
import { OrientationService } from './core/sensors/orientation.service';
import { TargetSelectionService } from './core/targets/target-selection.service';

// Each test bootstraps the whole App, and the first one in a file pays the cold start: slow on a loaded or
// 2-core CI machine. A per-file allowance (the global default stays 5 s).
vi.setConfig({ testTimeout: 15_000 });

const POS = { latitude: 39.6, longitude: -104.7, heightM: 1800 };
const setUrl = (search: string) => history.replaceState(null, '', '/' + search);

describe('App intro (target-aware)', () => {
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
    TestBed.inject(LocationService).setManual(POS);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setUrl('');
    localStorage.clear();
  });

  async function render(search = '') {
    // Fresh injector each time: selection and location services read their inputs once.
    TestBed.resetTestingModule();
    TestBed.inject(LocationService).setManual(POS);
    setUrl(search);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const h1 = (el: HTMLElement) => el.querySelector('.intro h1')?.textContent?.trim();

  it('Moon on first visit: the same wording as before, except "moon" is now "Moon"', async () => {
    const { el } = await render();
    expect(h1(el)).toBe('Find the Moon.');
    expect(el.querySelector('.intro p')!.textContent).toBe('Move your phone until it appears.');
    expect(el.querySelector('.intro .privacy')!.textContent).toBe(
      'Your location stays on your phone.',
    );
  });

  it('uses the sentence name for any target, including a shared ?target= link', async () => {
    expect(h1((await render('?target=jupiter')).el)).toBe('Find Jupiter.');
    expect(h1((await render('?target=m31')).el)).toBe('Find the Andromeda Galaxy.');
    expect(h1((await render('?target=polaris')).el)).toBe('Find Polaris.');
  });

  it('has a tappable "or pick something else" that opens the picker', async () => {
    const { fixture, el } = await render();
    const link = el.querySelector<HTMLButtonElement>('.intro .link')!;
    expect(link.textContent).toContain('or pick something else');
    link.click();
    fixture.detectChanges();
    expect(el.querySelector('[role=dialog]')).not.toBeNull();
  });

  it('the target chip shows the current target and opens the picker', async () => {
    const { fixture, el } = await render('?target=m31');
    const chip = el.querySelector<HTMLButtonElement>('.target-chip')!;
    expect(chip.textContent).toContain('Andromeda');
    expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
    chip.click();
    fixture.detectChanges();
    expect(el.querySelector('[role=dialog]')).not.toBeNull();
  });

  it('adds an honest line for a target that never rises from here', async () => {
    const { el } = await render('?target=lmc');
    expect(h1(el)).toBe('Find the Large Magellanic Cloud.');
    expect(el.querySelector('.intro .note')!.textContent).toBe(
      'The Large Magellanic Cloud never rises from here.',
    );
  });

  it('the Galactic Center intro mentions dust when up, or when it rises when not', async () => {
    const { el } = await render('?target=galactic-center');
    const note = el.querySelector('.intro .note')!.textContent!;
    expect(note).toMatch(
      /^The Galactic Center is (up, but hidden behind dust\.|below the horizon right now — it rises )/,
    );
  });

  it('a target that is below the horizon says when it rises and that you can still point at it', async () => {
    // Saturn, Jupiter etc. may be up or down depending on the day; a note, if shown, must be honest.
    const { el } = await render('?target=moon');
    const note = el.querySelector('.intro .note')?.textContent ?? null;
    if (note !== null) {
      expect(note).toMatch(
        /^The Moon is (below the horizon right now — it rises .*\. You can still point at it through the ground\.|up, but .*)/,
      );
    }
  });

  it('switching target shows that target intro again', async () => {
    const { fixture, el } = await render();
    TestBed.inject(TargetSelectionService).select('saturn');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(h1(el)).toBe('Find Saturn.');
  });

  it('?target=garbage still shows the Moon intro', async () => {
    expect(h1((await render('?target=garbage')).el)).toBe('Find the Moon.');
  });

  it('desktop / drag mode: pressing "t" opens the picker, but not while typing in a field', async () => {
    const { fixture, el } = await render();
    TestBed.inject(OrientationService).setManualPose(0, 20); // status becomes 'manual'
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role=dialog]')).toBeNull();
    input.remove();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    fixture.detectChanges();
    expect(el.querySelector('[role=dialog]')).not.toBeNull();
  });
});
