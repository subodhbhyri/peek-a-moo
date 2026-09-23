import { FindTrackerState, initialTrackerState, stepTracker } from './find-tracker';

function run(frames: [number, boolean, boolean][], start = 0) {
  let s: FindTrackerState = initialTrackerState(start);
  const events: unknown[] = [];
  for (const [now, onScreen, centered] of frames) {
    const r = stepTracker(s, { now, onScreen, centered });
    s = r.state;
    if (r.event) events.push({ at: now, ...r.event });
  }
  return { s, events };
}

describe('stepTracker', () => {
  it('needs the dwell time centered before firing found', () => {
    const { s, events } = run([
      [1000, true, true],
      [1300, true, true],
      [1400, true, true],
    ]);
    expect(events).toEqual([{ at: 1400, type: 'found', durationMs: 1400, findIndex: 1 }]);
    expect(s.phase).toBe('found');
  });

  it('on screen but not centered stays visible', () => {
    const { s, events } = run([
      [100, true, false],
      [2000, true, false],
    ]);
    expect(s.phase).toBe('visible');
    expect(events).toEqual([]);
  });

  it('leaving center resets the dwell timer', () => {
    const { events } = run([
      [0, true, true],
      [300, true, false],
      [400, true, true],
      [700, true, true],
      [800, true, true],
    ]);
    expect(events).toEqual([{ at: 800, type: 'found', durationMs: 800, findIndex: 1 }]);
  });

  it('brief exits after finding do not count as lost', () => {
    const { s, events } = run([
      [0, true, true],
      [400, true, true],
      [500, false, false],
      [1200, false, false],
      [1300, true, false],
    ]);
    expect(s.phase).toBe('found');
    expect(events.length).toBe(1);
  });

  it('a sustained exit is lost, and the next find is timed from the loss', () => {
    const { s, events } = run([
      [0, true, true],
      [400, true, true], // found #1
      [500, false, false],
      [1500, false, false], // lost at 1500
      [4000, true, true],
      [4400, true, true], // found #2 after 2.9s
    ]);
    expect(events).toEqual([
      { at: 400, type: 'found', durationMs: 400, findIndex: 1 },
      { at: 1500, type: 'lost' },
      { at: 4400, type: 'found', durationMs: 2900, findIndex: 2 },
    ]);
    expect(s.findCount).toBe(2);
  });
});
