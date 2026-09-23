import { MoonPhaseName } from '../astro/ephemeris';

const PHASE_EMOJI: Record<MoonPhaseName, string> = {
  new: '🌑',
  'waxing-crescent': '🌒',
  'first-quarter': '🌓',
  'waxing-gibbous': '🌔',
  full: '🌕',
  'waning-gibbous': '🌖',
  'last-quarter': '🌗',
  'waning-crescent': '🌘',
};

export function phaseEmoji(phase: MoonPhaseName): string {
  return PHASE_EMOJI[phase];
}
