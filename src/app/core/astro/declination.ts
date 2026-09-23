import * as geomagnetism from 'geomagnetism';

/**
 * Magnetic declination (degrees, east positive) from the World Magnetic Model.
 * Phone compasses report MAGNETIC north; the ephemeris uses TRUE north.
 *   trueAzimuth = magneticAzimuth + declination
 *
 * Returns 0 if the model can't be evaluated (e.g. date outside the bundled WMM range) —
 * a few degrees off is better than crashing.
 */
export function magneticDeclinationDeg(
  latitude: number,
  longitude: number,
  date = new Date(),
): number {
  try {
    const model = geomagnetism.model(date, { allowOutOfBoundsModel: true });
    const d = model.point([latitude, longitude]).decl;
    return Number.isFinite(d) ? d : 0;
  } catch {
    return 0;
  }
}
