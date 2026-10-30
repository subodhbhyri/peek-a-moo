import { Injectable, inject, signal } from '@angular/core';
import { AnalyticsService, InfoSource } from '../../core/analytics/analytics.service';
import type { TargetDef } from '../../core/targets/target.types';

/**
 * Which target's info card is open, if any. Any part of the app can open it (a picker row, the found
 * toast, a Look Around label); the one card in app.html shows it.
 */
@Injectable({ providedIn: 'root' })
export class TargetInfoService {
  private readonly analytics = inject(AnalyticsService);

  readonly current = signal<{ def: TargetDef; from: InfoSource } | null>(null);

  open(def: TargetDef, from: InfoSource): void {
    this.analytics.targetInfoOpened(def.id, from);
    this.current.set({ def, from });
  }

  close(): void {
    this.current.set(null);
  }
}
