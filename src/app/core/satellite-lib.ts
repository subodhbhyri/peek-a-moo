/**
 * The parts of satellite.js we use, imported from its files directly.
 *
 * Its package entry also re-exports a WebAssembly build that imports Node built-ins and ships as extra
 * bundles (hundreds of KB, prefetched by the service worker); we use none of that, and importing the
 * entry would make `ng build` fail on the Node imports. The package `exports` map blocks subpath
 * imports, so these are relative paths into node_modules.
 *
 * PINNED to satellite.js 7.1.0 (exact version in package.json). The files imported are
 * dist/io.js, dist/propagation.js, dist/transforms.js, dist/common-types.js (types only) and
 * dist/propagation/SatRec.js (type only). satellite-lib.spec.ts imports every re-export, so a version
 * that moves a file fails CI loudly instead of at runtime.
 */
export { json2satrec, twoline2satrec } from '../../../node_modules/satellite.js/dist/io.js';
export { gstime, propagate, sgp4 } from '../../../node_modules/satellite.js/dist/propagation.js';
export {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  geodeticToEcf,
} from '../../../node_modules/satellite.js/dist/transforms.js';
export type {
  EcfVec3,
  GeodeticLocation,
  OMMJsonObject,
} from '../../../node_modules/satellite.js/dist/common-types.js';
export type { SatRec } from '../../../node_modules/satellite.js/dist/propagation/SatRec.js';
