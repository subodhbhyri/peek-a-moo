import type { TargetDef } from './target.types';

export const DEFAULT_TARGET_ID = 'moon';

/** Curated catalog. Later phases add entries without touching the engine. */
export const TARGETS: readonly TargetDef[] = [
  {
    id: 'moon',
    name: 'Moon',
    kind: 'moon',
    category: 'solar-system',
    blurb: 'Our nearest neighbour, and a bit awkward about it.',
    render: 'moon',
    body: 'Moon',
  },
  {
    id: 'sun',
    name: 'Sun',
    kind: 'sun',
    category: 'solar-system',
    blurb: 'Our star. Never look at it directly, or through a camera.',
    render: 'sun',
    body: 'Sun',
    planet: { radiusKm: 695700, color: '#fff4d6' },
  },
  {
    id: 'mercury',
    name: 'Mercury',
    kind: 'planet',
    category: 'solar-system',
    blurb: 'The smallest planet, never far from the Sun in the sky.',
    render: 'planet',
    body: 'Mercury',
    planet: { radiusKm: 2439.7, color: '#b8b2a8', phased: true },
  },
  {
    id: 'venus',
    name: 'Venus',
    kind: 'planet',
    category: 'solar-system',
    blurb: 'The brightest planet, often the first "star" of the evening.',
    render: 'planet',
    body: 'Venus',
    planet: { radiusKm: 6051.8, color: '#f3e7c4', phased: true },
  },
  {
    id: 'mars',
    name: 'Mars',
    kind: 'planet',
    category: 'solar-system',
    blurb: 'The red planet, tinted by iron-rich dust.',
    render: 'planet',
    body: 'Mars',
    planet: { radiusKm: 3396.2, color: '#d9744a' },
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    kind: 'planet',
    category: 'solar-system',
    blurb: 'The largest planet, with a mass of about 2.5 times all the others combined.',
    render: 'planet',
    body: 'Jupiter',
    planet: { radiusKm: 71492, color: '#e3c9a3', bands: true },
  },
  {
    id: 'saturn',
    name: 'Saturn',
    kind: 'planet',
    category: 'solar-system',
    blurb: 'The ringed planet; its rings are mostly water ice.',
    render: 'planet',
    body: 'Saturn',
    planet: { radiusKm: 60268, color: '#e8d49a', rings: true },
  },
  {
    id: 'uranus',
    name: 'Uranus',
    kind: 'planet',
    category: 'solar-system',
    blurb: 'An ice giant that orbits tilted on its side; just at the edge of naked-eye visibility.',
    render: 'planet',
    body: 'Uranus',
    planet: { radiusKm: 25559, color: '#a8dbe0' },
  },
  {
    id: 'neptune',
    name: 'Neptune',
    kind: 'planet',
    category: 'solar-system',
    blurb: 'The farthest planet, too faint to see without binoculars.',
    render: 'planet',
    body: 'Neptune',
    planet: { radiusKm: 24764, color: '#5d7fd6' },
  },
];

export function getTarget(id: string): TargetDef | undefined {
  return TARGETS.find((t) => t.id === id);
}
