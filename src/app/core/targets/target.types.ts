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
  /** J2000 (ICRS) coordinates for fixed-sky targets. */
  fixed?: {
    raHours: number;
    decDeg: number;
    /** null when not meaningful (the Galactic Center is not visible to the eye). */
    magnitude: number | null;
    sizeDeg?: [major: number, minor: number];
    /** Degrees, from north through east. */
    positionAngleDeg?: number;
    /** How an extended object is drawn. */
    style?: ExtendedStyle;
    /** B-V color index, for star colors. */
    bv?: number;
  };
  body?:
    'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune';
  satellite?: { noradId: number };
  /** Sun and planets: how to draw the disc, and the radius its angular size is computed from. */
  planet?: PlanetStyle;
}

export type ExtendedStyle = 'galaxy' | 'nebula' | 'cluster' | 'marker';

export interface PlanetStyle {
  /** Equatorial radius, km. */
  radiusKm: number;
  /** Disc fill. */
  color: string;
  /** Draw a phase (Mercury, Venus). */
  phased?: boolean;
  rings?: boolean;
  bands?: boolean;
}

/** 'new' | 'crescent' | 'quarter' | 'gibbous' | 'full': no waxing/waning, the lit limb shows that. */
export type PlanetPhaseName = 'new' | 'crescent' | 'quarter' | 'gibbous' | 'full';

export interface MoonPhaseInfo {
  kind: 'moon';
  illuminatedFraction: number;
  /** 0 = new, 180 = full. */
  phaseDeg: number;
  name: MoonPhaseName;
}

export interface PlanetPhaseInfo {
  kind: 'planet';
  illuminatedFraction: number;
  phaseDeg: number;
  name: PlanetPhaseName;
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
  /** Moon, Mercury, Venus. Discriminated on `kind`, so Moon-only code narrows without casts. */
  phase?: MoonPhaseInfo | PlanetPhaseInfo;
  /** Saturn: ring tilt away from the line of sight, degrees (signed). */
  rings?: { tiltDeg: number };
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
