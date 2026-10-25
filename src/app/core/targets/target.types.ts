import type { MoonPhaseName } from '../astro/ephemeris';
import type { Vec3 } from '../math/vec3';

export type TargetKind = 'moon' | 'sun' | 'planet' | 'fixed' | 'satellite';
export type TargetCategory = 'solar-system' | 'stars' | 'deep-sky' | 'satellites';
export type RenderStyle = 'moon' | 'planet' | 'sun' | 'star' | 'extended' | 'satellite';

/** Static catalog entry. See ARCHITECTURE §5.1. */
export interface TargetDef {
  /** URL-safe, stable (used in ?target= and stats). */
  id: string;
  name: string;
  kind: TargetKind;
  category: TargetCategory;
  /** One line for the picker. */
  blurb: string;
  render: RenderStyle;
  fixed?: {
    raHours: number;
    decDeg: number;
    magnitude: number; // J2000
    sizeDeg?: [major: number, minor: number];
    positionAngleDeg?: number;
  };
  body?:
    'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune';
  satellite?: { noradId: number };
}

/** Computed position/appearance of a target at a moment. See ARCHITECTURE §5.2. */
export interface TargetState {
  id: string;
  computedAt: Date;
  /** Unit ENU, apparent (refraction included). */
  direction: Vec3;
  azimuthDeg: number;
  altitudeDeg: number;
  /** null when not meaningful. */
  magnitude: number | null;
  /** True size; the renderer decides display size. */
  angularSizeDeg: number;
  /** Moon, Mercury, Venus. `name` is a Moon phase name for now; Phase 3 widens it for planets. */
  phase?: { illuminatedFraction: number; phaseDeg: number; name: MoonPhaseName };
  /** For lit-limb orientation (Moon, inner planets). */
  sunDirection?: Vec3;
  /** For orienting extended objects on screen. */
  skyNorthDirection?: Vec3;
  satellite?: { sunlit: boolean; velocityDegPerSec: Vec3; tleAgeDays: number };
  /**
   * Added in Phase 2 (not in ARCHITECTURE §5.2): Sun altitude at `computedAt`. The find-line selector
   * needs it ("daytime Moon"), and the Moon provider already has it for free.
   */
  sunAltitudeDeg?: number;
}
