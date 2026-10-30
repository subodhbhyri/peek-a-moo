import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  ANALYTICS_SINK,
  AnalyticsEventName,
  AnalyticsService,
  correctionBucket,
  secondsBucket,
} from './analytics.service';

interface Sent {
  name: string;
  props: Record<string, unknown>;
}

/** The properties each event may carry: exactly the table in docs/phases/phase7.md. */
const ALLOWED: Record<AnalyticsEventName, string[]> = {
  target_selected: ['from', 'target'],
  target_found: ['aligned', 'camera', 'seconds', 'target', 'visibility'],
  alignment_locked: ['correction'],
  share: ['method', 'target'],
  sensor_mode: ['mode'],
  look_around_opened: ['from'],
  target_info_opened: ['from', 'target'],
};

function setup(search = '') {
  history.replaceState(null, '', '/' + search);
  const sent: Sent[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ANALYTICS_SINK,
        useValue: (name: string, props: Sent['props']) => sent.push({ name, props }),
      },
    ],
  });
  return { sent, analytics: TestBed.inject(AnalyticsService) };
}

describe('AnalyticsService', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it('every event carries exactly the properties in the table, and nothing else', () => {
    const { sent, analytics } = setup();
    analytics.targetSelected('jupiter', 'picker');
    analytics.targetFound({
      target: 'jupiter',
      durationMs: 4200,
      visibility: 'up-visible',
      camera: false,
      aligned: true,
    });
    analytics.alignmentLocked(7.3);
    analytics.share('iss', 'native');
    analytics.sensorMode('ios');
    expect(sent.map((s) => s.name)).toEqual([
      'target_selected',
      'target_found',
      'alignment_locked',
      'share',
      'sensor_mode',
    ]);
    for (const s of sent) {
      expect(Object.keys(s.props).sort(), s.name).toEqual(ALLOWED[s.name as AnalyticsEventName]);
    }
    expect(sent[0].props).toEqual({ target: 'jupiter', from: 'picker' });
    expect(sent[1].props).toEqual({
      target: 'jupiter',
      seconds: '3-10',
      visibility: 'up-visible',
      camera: false,
      aligned: true,
    });
    expect(sent[2].props).toEqual({ correction: '5-15' });
    expect(sent[3].props).toEqual({ target: 'iss', method: 'native' });
    expect(sent[4].props).toEqual({ mode: 'ios' });
  });

  it('target_selected also reports from "info" ("Find it" on an info card), with exactly { target, from }', () => {
    const { sent, analytics } = setup();
    analytics.targetSelected('saturn', 'info');
    expect(sent).toEqual([{ name: 'target_selected', props: { target: 'saturn', from: 'info' } }]);
    expect(Object.keys(sent[0].props).sort()).toEqual(ALLOWED.target_selected);
  });

  it('Phase 8 events carry exactly { from } and { target, from }', () => {
    const { sent, analytics } = setup();
    analytics.lookAroundOpened('picker');
    analytics.lookAroundOpened('link');
    analytics.lookAroundOpened('restored');
    analytics.targetInfoOpened('jupiter', 'picker');
    analytics.targetInfoOpened('iss', 'found');
    analytics.targetInfoOpened('sirius', 'look-around');
    expect(sent.map((s) => s.name)).toEqual([
      'look_around_opened',
      'look_around_opened',
      'look_around_opened',
      'target_info_opened',
      'target_info_opened',
      'target_info_opened',
    ]);
    for (const s of sent) {
      expect(Object.keys(s.props).sort(), s.name).toEqual(ALLOWED[s.name as AnalyticsEventName]);
    }
    expect(sent.slice(0, 3).map((s) => s.props)).toEqual([
      { from: 'picker' },
      { from: 'link' },
      { from: 'restored' },
    ]);
    expect(sent[4].props).toEqual({ target: 'iss', from: 'found' });
  });

  it('the Phase 8 events are silent under ?debug', () => {
    const { sent, analytics } = setup('?debug');
    analytics.lookAroundOpened('picker');
    analytics.targetInfoOpened('moon', 'picker');
    expect(sent).toEqual([]);
  });

  it('extra input never reaches the sink: location, coordinates and user agent cannot ride along', () => {
    const { sent, analytics } = setup();
    // Even if a caller (or a future refactor) hands in more than the types allow, the event is rebuilt
    // from named fields only.
    analytics.targetFound({
      target: 'moon',
      durationMs: 1000,
      visibility: 'up-visible',
      camera: true,
      aligned: false,
      latitude: 39.6,
      longitude: -104.7,
      userAgent: navigator.userAgent,
    } as never);
    const text = JSON.stringify(sent);
    expect(Object.keys(sent[0].props).sort()).toEqual(ALLOWED.target_found);
    expect(text).not.toMatch(/lat|lon|coord|39\.6|104\.7|position|location|agent|Mozilla/i);
  });

  it('buckets seconds: <3, 3-10, 10-30, 30+', () => {
    expect(secondsBucket(0)).toBe('<3');
    expect(secondsBucket(2999)).toBe('<3');
    expect(secondsBucket(3000)).toBe('3-10');
    expect(secondsBucket(9999)).toBe('3-10');
    expect(secondsBucket(10_000)).toBe('10-30');
    expect(secondsBucket(29_999)).toBe('10-30');
    expect(secondsBucket(30_000)).toBe('30+');
    expect(secondsBucket(600_000)).toBe('30+');
  });

  it('buckets alignment corrections by size, ignoring sign: <5, 5-15, 15-45, 45+', () => {
    expect(correctionBucket(0)).toBe('<5');
    expect(correctionBucket(-4.9)).toBe('<5');
    expect(correctionBucket(5)).toBe('5-15');
    expect(correctionBucket(-14.9)).toBe('5-15');
    expect(correctionBucket(15)).toBe('15-45');
    expect(correctionBucket(44.9)).toBe('15-45');
    expect(correctionBucket(45)).toBe('45+');
    expect(correctionBucket(-120)).toBe('45+');
  });

  it('sensor_mode is sent once per session', () => {
    const { sent, analytics } = setup();
    analytics.sensorMode('absolute');
    analytics.sensorMode('drag');
    analytics.sensorMode('absolute');
    expect(sent).toHaveLength(1);
    expect(sent[0].props).toEqual({ mode: 'absolute' });
  });

  it('sends nothing at all under ?debug', () => {
    const { sent, analytics } = setup('?debug');
    analytics.targetSelected('moon', 'default');
    analytics.targetFound({
      target: 'moon',
      durationMs: 1,
      visibility: 'up-visible',
      camera: false,
      aligned: false,
    });
    analytics.alignmentLocked(3);
    analytics.share('moon', 'clipboard');
    analytics.sensorMode('ios');
    expect(sent).toEqual([]);
  });

  it('swallows a failing sink (blocked script, ad blocker)', () => {
    history.replaceState(null, '', '/');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ANALYTICS_SINK,
          useValue: vi.fn(() => {
            throw new Error('blocked');
          }),
        },
      ],
    });
    const analytics = TestBed.inject(AnalyticsService);
    expect(() => analytics.targetSelected('moon', 'default')).not.toThrow();
    expect(() => analytics.sensorMode('ios')).not.toThrow();
  });
});
