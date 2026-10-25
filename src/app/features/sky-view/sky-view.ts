import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { displayedVerticalFovDeg } from '../../core/projection/camera-fov';
import { CameraFovService } from '../../core/projection/camera-fov.service';
import {
  NOT_VISIBLE_NOTE,
  isNotNakedEye,
  targetFoundLine,
  targetFoundToast,
} from '../../core/personality/target-lines';
import { FindLineContext, selectFindLine } from '../../core/personality/find-lines';
import { StatsService } from '../../core/personality/stats.service';
import { phaseEmoji } from '../../core/render/phase-emoji';
import { SkyEngineService, SkyFrame } from '../../core/engine/sky-engine.service';
import { LookAngles, dragToLook, keyToLook } from '../../core/sensors/drag-look';
import { OrientationService } from '../../core/sensors/orientation.service';
import { Viewport, edgeGlowPoint } from '../../core/projection/projection';
import { drawTarget } from '../../core/render/draw-target';
import { TargetSelectionService } from '../../core/targets/target-selection.service';
import { CornerStat } from '../corner-stat/corner-stat';
import { MoonFace } from '../moon-face/moon-face';

/** Feel parameter: smaller = the moon moves faster across the screen and is harder to find. */
const V_FOV_DEG = 62;
const FOUND_LINE_MS = 5000;
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
    @if (foundLine(); as line) {
      <p class="found-line" role="status">{{ line }}</p>
    }
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
    .found-line {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 22%;
      margin: 0;
      padding: 0 1.5rem;
      text-align: center;
      font-family: system-ui, sans-serif;
      font-size: 1rem;
      color: #e9e6dc;
      opacity: 0.85;
      pointer-events: none;
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
  private readonly selection = inject(TargetSelectionService);
  private readonly cameraFov = inject(CameraFovService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly glowRef = viewChild.required<ElementRef<HTMLDivElement>>('glow');
  private readonly faceRef = viewChild.required(MoonFace);
  private readonly cornerRef = viewChild.required(CornerStat);

  /** Fires once, the first time any part of the Moon is on screen. */
  readonly moonVisible = output<void>();

  /** Short line for non-Moon targets (the Moon has the face and its speech bubble). */
  protected readonly foundLine = signal<string | null>(null);
  private foundLineTimer: ReturnType<typeof setTimeout> | null = null;
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
      if (event.type === 'found') this.onFound(event.targetId, event.durationMs, event.findIndex);
      else {
        this.faceRef().clearSpeech();
        this.clearFoundLine();
      }
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
      this.syncVerticalFov();
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
    const target = this.engine.target();
    if (this.orientation.status() !== 'manual' && target) {
      this.manualLook = {
        azimuthDeg: target.azimuthDeg,
        altitudeDeg: Math.max(0, target.altitudeDeg),
      };
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

  private onFound(targetId: string, durationMs: number, findIndex: number): void {
    const target = this.engine.target();
    if (!target || target.id !== targetId) return;
    const updated = this.stats.recordFind(targetId, durationMs);
    // The Moon is the only target with a face, lines and a phase emoji so far (Phase 7 adds the rest).
    const phase = target.phase;
    if (this.selection.selected().kind === 'moon' && phase?.kind === 'moon') {
      const ctx: FindLineContext = {
        sessionFindIndex: findIndex,
        lifetimeFindCount: updated.lifetime.finds,
        durationMs,
        moonPhase: phase.name,
        moonAltitudeDeg: target.altitudeDeg,
        sunAltitudeDeg: target.sunAltitudeDeg ?? 0,
        localHour: new Date().getHours(),
      };
      const { text } = selectFindLine(ctx, this.stats.stats().recentLines);
      this.stats.recordLineShown(text);
      this.faceRef().say(text);
      this.cornerRef().show({ durationMs, emoji: phaseEmoji(phase.name) });
    } else {
      // No face for anything but the Moon. One factual line plus the toast (Phase 7 adds voices).
      const def = this.selection.selected();
      const line = targetFoundLine(def.id);
      if (line) this.showFoundLine(line);
      this.cornerRef().show({
        durationMs,
        emoji: '',
        text: targetFoundToast(def, durationMs),
        note: isNotNakedEye(target.magnitude) ? NOT_VISIBLE_NOTE : undefined,
      });
    }
    try {
      navigator.vibrate?.(30);
    } catch {
      // haptics unsupported — silently skip
    }
  }

  private showFoundLine(text: string): void {
    this.foundLine.set(text);
    if (this.foundLineTimer) clearTimeout(this.foundLineTimer);
    this.foundLineTimer = setTimeout(() => this.foundLine.set(null), FOUND_LINE_MS);
  }

  private clearFoundLine(): void {
    if (this.foundLineTimer) clearTimeout(this.foundLineTimer);
    this.foundLine.set(null);
  }

  private resize(canvas: HTMLCanvasElement): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * this.dpr);
    canvas.height = Math.round(height * this.dpr);
    this.viewport = { width, height, vFovDeg: this.verticalFovDeg(width, height) };
    this.cameraFov.vFovInUseDeg.set(this.viewport.vFovDeg);
  }

  /** Camera on: the FOV the cover-cropped video really shows. Camera off: the V_FOV_DEG feel parameter. */
  private verticalFovDeg(width: number, height: number): number {
    const video = this.cameraFov.cameraOn() ? this.cameraFov.videoSize() : null;
    if (!video || video.width <= 0 || video.height <= 0 || width <= 0 || height <= 0) {
      return V_FOV_DEG;
    }
    return displayedVerticalFovDeg({
      videoWidth: video.width,
      videoHeight: video.height,
      viewportWidth: width,
      viewportHeight: height,
      longSideFovDeg: this.cameraFov.longSideFovDeg(),
    });
  }

  /** Cheap per-frame check; only touches state when the camera toggles, the slider moves or the video changes. */
  private syncVerticalFov(): void {
    const { width, height } = this.viewport;
    const v = this.verticalFovDeg(width, height);
    if (v === this.viewport.vFovDeg) return;
    this.viewport = { width, height, vFovDeg: v };
    this.cameraFov.vFovInUseDeg.set(v);
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

    if (this.engine.trackerPaused()) {
      this.faceRef().clearSpeech();
      this.clearFoundLine();
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
    drawTarget(ctx, frame);
    this.faceRef().update(
      x,
      y,
      frame.radiusPx,
      frame.def.kind === 'moon' && frame.phase === 'found',
    );
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
