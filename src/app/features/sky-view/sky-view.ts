import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { FindLineContext, selectFindLine } from '../../core/personality/find-lines';
import { StatsService } from '../../core/personality/stats.service';
import { phaseEmoji } from '../../core/render/phase-emoji';
import { SkyEngineService, SkyFrame } from '../../core/engine/sky-engine.service';
import { LookAngles, dragToLook, keyToLook } from '../../core/sensors/drag-look';
import { OrientationService } from '../../core/sensors/orientation.service';
import { Viewport, edgeGlowPoint } from '../../core/projection/projection';
import { drawMoonPhase } from '../../core/render/moon-phase';
import { CornerStat } from '../corner-stat/corner-stat';
import { MoonFace } from '../moon-face/moon-face';

/** Feel parameter: smaller = the moon moves faster across the screen and is harder to find. */
const V_FOV_DEG = 62;
const EDGE_GLOW_DELAY_MS = 20_000;
const EDGE_GLOW_RAMP_MS = 6_000;
const EDGE_GLOW_MAX_OPACITY = 0.45;

/**
 * Full-screen canvas plus its overlays. Runs its own requestAnimationFrame loop (outside change
 * detection) and asks the engine for a frame each tick; everything per-frame (canvas draw, face
 * position, edge-glow) is a direct style/canvas write, not a signal, to keep 60fps cheap.
 * Found/lost events (rare) are the only place this talks to Angular's normal reactivity.
 */
@Component({
  selector: 'app-sky-view',
  imports: [MoonFace, CornerStat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #canvas (pointerdown)="onPointerDown($event)"></canvas>
    <div #glow class="edge-glow"></div>
    <app-moon-face #face />
    <app-corner-stat #corner />
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      touch-action: none;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    .edge-glow {
      position: absolute;
      top: 0;
      left: 0;
      width: 220px;
      height: 220px;
      margin: -110px 0 0 -110px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(242, 239, 230, 0.9) 0%, rgba(242, 239, 230, 0) 70%);
      opacity: 0;
      pointer-events: none;
    }
  `,
})
export class SkyView implements AfterViewInit {
  private readonly engine = inject(SkyEngineService);
  private readonly orientation = inject(OrientationService);
  private readonly stats = inject(StatsService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly glowRef = viewChild.required<ElementRef<HTMLDivElement>>('glow');
  private readonly faceRef = viewChild.required(MoonFace);
  private readonly cornerRef = viewChild.required(CornerStat);

  /** Fires once, the first time any part of the Moon is on screen. */
  readonly moonVisible = output<void>();

  private announcedVisible = false;
  private rafId = 0;
  private dpr = 1;
  private viewport: Viewport = { width: 1, height: 1, vFovDeg: V_FOV_DEG };
  private reducedMotion = false;

  // Drag-to-look (desktop / no-sensor fallback).
  private dragging = false;
  private lastPointer: { x: number; y: number } | null = null;
  private manualLook: LookAngles = { azimuthDeg: 0, altitudeDeg: 20 };

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.faceRef().setReducedMotion(this.reducedMotion);

    const ro = new ResizeObserver(() => this.resize(canvas));
    ro.observe(canvas);
    this.resize(canvas);

    const sub = this.engine.events$.subscribe((event) => {
      if (event.type === 'found') this.onFound(event.durationMs, event.findIndex);
      else this.faceRef().clearSpeech();
    });

    const onKey = (e: KeyboardEvent) => {
      if (!this.shouldUseDragMode()) return;
      const next = keyToLook(this.manualLook, e.key);
      if (next) {
        this.manualLook = next;
        this.orientation.setManualPose(next.azimuthDeg, next.altitudeDeg);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    const onMove = (e: PointerEvent) => this.onPointerMove(e);
    const onUp = () => this.onPointerUp();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const loop = (t: number) => {
      this.draw(canvas, this.engine.tick(t, this.viewport));
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.rafId);
      ro.disconnect();
      sub.unsubscribe();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    });
  }

  /** True once we've given up on (or never had) a real sensor heading — canvas drag takes over. */
  private shouldUseDragMode(): boolean {
    const s = this.orientation.status();
    return s === 'unsupported' || s === 'no-compass' || s === 'manual' || s === 'idle';
  }

  protected onPointerDown(e: PointerEvent): void {
    if (!this.shouldUseDragMode()) return;
    this.dragging = true;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    const moon = this.engine.moon();
    if (this.orientation.status() !== 'manual' && moon) {
      this.manualLook = { azimuthDeg: moon.azimuthDeg, altitudeDeg: Math.max(0, moon.altitudeDeg) };
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging || !this.lastPointer) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.manualLook = dragToLook(this.manualLook, dx, dy);
    this.orientation.setManualPose(this.manualLook.azimuthDeg, this.manualLook.altitudeDeg);
  }

  private onPointerUp(): void {
    this.dragging = false;
    this.lastPointer = null;
  }

  private onFound(durationMs: number, findIndex: number): void {
    const moon = this.engine.moon();
    if (!moon) return;
    const updated = this.stats.recordFind(durationMs);
    const ctx: FindLineContext = {
      sessionFindIndex: findIndex,
      lifetimeFindCount: updated.lifetimeFinds,
      durationMs,
      moonPhase: moon.phaseName,
      moonAltitudeDeg: moon.altitudeDeg,
      sunAltitudeDeg: moon.sunAltitudeDeg,
      localHour: new Date().getHours(),
    };
    const { text } = selectFindLine(ctx, this.stats.stats().recentLines);
    this.stats.recordLineShown(text);
    this.faceRef().say(text);
    this.cornerRef().show({ durationMs, emoji: phaseEmoji(moon.phaseName) });
    try {
      navigator.vibrate?.(30);
    } catch {
      // haptics unsupported — silently skip
    }
  }

  private resize(canvas: HTMLCanvasElement): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * this.dpr);
    canvas.height = Math.round(height * this.dpr);
    this.viewport = { width, height, vFovDeg: V_FOV_DEG };
  }

  private draw(canvas: HTMLCanvasElement, frame: SkyFrame | null): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);

    if (!frame) {
      this.faceRef().update(0, 0, 0, false);
      this.glowRef().nativeElement.style.opacity = '0';
      return;
    }

    this.updateEdgeGlow(frame);

    if (!frame.projection.onScreen) {
      this.faceRef().update(0, 0, 0, false);
      return;
    }
    if (!this.announcedVisible) {
      this.announcedVisible = true;
      this.moonVisible.emit();
    }
    const { x, y } = frame.projection;
    drawMoonPhase(ctx, x, y, frame.radiusPx, frame.moon.illuminatedFraction, frame.brightLimbRad);
    this.faceRef().update(x, y, frame.radiusPx, frame.phase === 'found');
  }

  private updateEdgeGlow(frame: SkyFrame): void {
    const el = this.glowRef().nativeElement;
    if (frame.phase !== 'searching' || frame.searchElapsedMs < EDGE_GLOW_DELAY_MS) {
      el.style.opacity = '0';
      return;
    }
    const ramp = Math.min(1, (frame.searchElapsedMs - EDGE_GLOW_DELAY_MS) / EDGE_GLOW_RAMP_MS);
    const { x, y } = edgeGlowPoint(this.viewport, frame.projection.edgeAngleRad, 24);
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.opacity = `${ramp * EDGE_GLOW_MAX_OPACITY}`;
  }
}
