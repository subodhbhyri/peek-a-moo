import type { TargetDef } from '../../core/targets/target.types';

/** A cheap one-character icon per render style, used in the picker rows and the target chip. */
export function targetGlyph(def: TargetDef): string {
  switch (def.render) {
    case 'moon':
      return '☾';
    case 'sun':
      return '☀';
    case 'planet':
      return def.planet?.rings ? '🪐' : '●';
    case 'star':
      return '✦';
    case 'extended':
      return def.fixed?.style === 'marker' ? '⊕' : '◌';
    case 'satellite':
      return '◆';
  }
}
