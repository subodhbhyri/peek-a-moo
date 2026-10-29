import { shareMessage, shareUrl } from './share';

describe('share', () => {
  const loc = { origin: 'https://find-the-moon.example', pathname: '/app/' };

  it('builds a link that opens straight into the target', () => {
    expect(shareUrl('jupiter', loc)).toBe('https://find-the-moon.example/app/?target=jupiter');
    expect(shareUrl('galactic-center', loc)).toBe(
      'https://find-the-moon.example/app/?target=galactic-center',
    );
  });

  it('never carries over other params such as ?debug', () => {
    expect(shareUrl('moon', loc)).not.toContain('debug');
  });

  it('formats "Found Jupiter in 4.2s — https://…"', () => {
    expect(shareMessage('Found Jupiter in 4.2s', shareUrl('jupiter', loc))).toBe(
      'Found Jupiter in 4.2s — https://find-the-moon.example/app/?target=jupiter',
    );
  });
});
