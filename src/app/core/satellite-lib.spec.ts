import * as lib from './satellite-lib';

describe('satellite-lib: every re-export resolves', () => {
  // If a satellite.js release moves a dist/ file, this import fails (or a name goes missing) in CI.
  it.each([
    'json2satrec',
    'twoline2satrec',
    'gstime',
    'propagate',
    'sgp4',
    'degreesToRadians',
    'ecfToLookAngles',
    'eciToEcf',
    'geodeticToEcf',
  ] as const)('%s is a function', (name) => {
    expect(typeof lib[name]).toBe('function');
  });

  it('is the pinned version (exact, no caret)', async () => {
    const pkg = (await import('../../../node_modules/satellite.js/package.json')) as {
      default: { version: string };
    };
    expect(pkg.default.version).toBe('7.1.0');
  });
});
