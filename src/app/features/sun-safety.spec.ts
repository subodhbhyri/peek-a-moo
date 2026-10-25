import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { App } from '../app';
import { SkyEngineService } from '../core/engine/sky-engine.service';
import { OrientationService } from '../core/sensors/orientation.service';
import { getTarget } from '../core/targets/catalog';
import { computeTargetState } from '../core/targets/compute';
import { AlignControl } from './align-control/align-control';

const setUrl = (search: string) => history.replaceState(null, '', '/' + search);

describe('Sun safety', () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom has no ResizeObserver; the sky view only needs it to exist.
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
    setUrl('');
    localStorage.clear();
  });

  function alignButton(target: string): HTMLElement | null {
    setUrl(`?target=${target}`);
    const engine = TestBed.inject(SkyEngineService);
    TestBed.inject(OrientationService).status.set('active');
    // A target comfortably above the horizon, so only the Sun rule can hide the button.
    const state = computeTargetState(getTarget(target)!, new Date('2026-10-26T15:00:00Z'), {
      latitude: 39.6,
      longitude: -104.7,
    });
    engine.target.set({ ...state, altitudeDeg: 40 });
    const fixture = TestBed.createComponent(AlignControl);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.align-button');
  }

  it('the align button is offered for the Moon...', () => {
    const b = alignButton('moon');
    expect(b).not.toBeNull();
    expect(b!.getAttribute('aria-label')).toBe('Align with the real Moon');
  });

  it('...and for a planet, with its name', () => {
    expect(alignButton('jupiter')!.getAttribute('aria-label')).toBe('Align with the real Jupiter');
  });

  it('...but never for the Sun', () => {
    expect(alignButton('sun')).toBeNull();
  });

  describe('app shell', () => {
    function render(target: string) {
      setUrl(`?target=${target}`);
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('shows the banner and disables the camera toggle for the Sun', () => {
      const el = render('sun');
      expect(el.querySelector('.sun-banner')?.textContent).toContain(
        'Never look at the Sun — not directly, not through your camera.',
      );
      const toggle = el.querySelector('.camera-toggle')!;
      expect(toggle.getAttribute('aria-disabled')).toBe('true');
      expect(toggle.getAttribute('title')).toBe('Camera is off for the Sun.');
      expect(el.querySelector('.sun-camera-note')?.textContent).toContain(
        'Camera is off for the Sun.',
      );
    });

    it('has no banner and an enabled camera toggle for the Moon', () => {
      const el = render('moon');
      expect(el.querySelector('.sun-banner')).toBeNull();
      expect(el.querySelector('.camera-toggle')!.getAttribute('aria-disabled')).toBe('false');
      expect(el.querySelector('.sun-camera-note')).toBeNull();
    });
  });
});
