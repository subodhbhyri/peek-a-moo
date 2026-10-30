import { Injectable, InjectionToken, inject } from '@angular/core';
import { track } from '@vercel/analytics';
import type { Visibility } from '../targets/availability';

export type SelectionSource = 'picker' | 'best-now' | 'link' | 'default' | 'info';
export type SecondsBucket = '<3' | '3-10' | '10-30' | '30+';
export type CorrectionBucket = '<5' | '5-15' | '15-45' | '45+';
export type SensorMode = 'ios' | 'absolute' | 'drag' | 'no-compass';
export type ShareMethod = 'native' | 'clipboard';
export type LookAroundSource = 'picker' | 'link' | 'restored';
export type InfoSource = 'picker' | 'found' | 'look-around';

/**
 * Every event and EXACTLY the properties it may carry. There is deliberately no free-form property
 * bag, and nothing here can hold a location, coordinates or a user agent: the compiler rejects a
 * new property, and analytics.service.spec.ts fails if one sneaks in at runtime.
 */
export interface AnalyticsEvents {
  target_selected: { target: string; from: SelectionSource };
  target_found: {
    target: string;
    seconds: SecondsBucket;
    visibility: Visibility;
    camera: boolean;
    aligned: boolean;
  };
  alignment_locked: { correction: CorrectionBucket };
  share: { target: string; method: ShareMethod };
  sensor_mode: { mode: SensorMode };
  look_around_opened: { from: LookAroundSource };
  target_info_opened: { target: string; from: InfoSource };
  night_mode_toggled: { on: boolean };
  constellations_toggled: { on: boolean };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

export function secondsBucket(durationMs: number): SecondsBucket {
  const s = durationMs / 1000;
  if (s < 3) return '<3';
  if (s < 10) return '3-10';
  if (s < 30) return '10-30';
  return '30+';
}

export function correctionBucket(degrees: number): CorrectionBucket {
  const d = Math.abs(degrees);
  if (d < 5) return '<5';
  if (d < 15) return '5-15';
  if (d < 45) return '15-45';
  return '45+';
}

/** Where events go. Replaced in tests; by default Vercel Web Analytics custom events. */
export type AnalyticsSink = (
  name: string,
  props: Record<string, string | number | boolean>,
) => void;
export const ANALYTICS_SINK = new InjectionToken<AnalyticsSink>('ANALYTICS_SINK', {
  providedIn: 'root',
  factory: () => (name, props) => track(name, props),
});

/**
 * Thin, anonymous analytics. Never throws (the script may be blocked), sends nothing under ?debug,
 * and sends `sensor_mode` at most once per session.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly sink = inject(ANALYTICS_SINK);
  private readonly enabled = !hasDebugFlag();
  private sensorModeSent = false;

  targetSelected(target: string, from: SelectionSource): void {
    this.send('target_selected', { target, from });
  }

  targetFound(e: {
    target: string;
    durationMs: number;
    visibility: Visibility;
    camera: boolean;
    aligned: boolean;
  }): void {
    this.send('target_found', {
      target: e.target,
      seconds: secondsBucket(e.durationMs),
      visibility: e.visibility,
      camera: e.camera,
      aligned: e.aligned,
    });
  }

  alignmentLocked(correctionDeg: number): void {
    this.send('alignment_locked', { correction: correctionBucket(correctionDeg) });
  }

  share(target: string, method: ShareMethod): void {
    this.send('share', { target, method });
  }

  lookAroundOpened(from: LookAroundSource): void {
    this.send('look_around_opened', { from });
  }

  targetInfoOpened(target: string, from: InfoSource): void {
    this.send('target_info_opened', { target, from });
  }

  nightModeToggled(on: boolean): void {
    this.send('night_mode_toggled', { on });
  }

  constellationsToggled(on: boolean): void {
    this.send('constellations_toggled', { on });
  }

  sensorMode(mode: SensorMode): void {
    if (this.sensorModeSent) return;
    this.sensorModeSent = true;
    this.send('sensor_mode', { mode });
  }

  private send<K extends AnalyticsEventName>(name: K, props: AnalyticsEvents[K]): void {
    if (!this.enabled) return;
    try {
      this.sink(name, { ...props });
    } catch {
      // Blocked script, offline, ad blocker: analytics must never affect the app.
    }
  }
}

function hasDebugFlag(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}
