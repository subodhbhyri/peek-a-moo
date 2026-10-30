import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANALYTICS_SINK } from '../../core/analytics/analytics.service';
import { LocationService } from '../../core/sensors/location.service';
import { OrientationService } from '../../core/sensors/orientation.service';
import { AlignControl } from './align-control';

interface Internals {
  pending: WritableSignal<number | null>;
  commit(): void;
}

describe('AlignControl: analytics', () => {
  const cases: [number, string][] = [
    [3, '<5'],
    [-10, '5-15'],
    [30, '15-45'],
    [-60, '45+'],
  ];

  for (const [yaw, bucket] of cases) {
    it(`locking a ${yaw}° correction reports only { correction: "${bucket}" }`, () => {
      localStorage.clear();
      const sent: { name: string; props: Record<string, unknown> }[] = [];
      TestBed.configureTestingModule({
        providers: [
          {
            provide: ANALYTICS_SINK,
            useValue: (name: string, props: Record<string, unknown>) => sent.push({ name, props }),
          },
        ],
      });
      TestBed.inject(LocationService).setManual({ latitude: 39.6, longitude: -104.7, heightM: 0 });
      TestBed.inject(OrientationService).headingSource.set('absolute');
      const fixture = TestBed.createComponent(AlignControl);
      const c = fixture.componentInstance as unknown as Internals;
      c.pending.set(yaw);
      c.commit();
      expect(sent).toEqual([{ name: 'alignment_locked', props: { correction: bucket } }]);
      localStorage.clear();
    });
  }
});
