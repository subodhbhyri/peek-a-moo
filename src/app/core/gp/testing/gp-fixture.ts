import type { GpPayload } from '../gp.types';

/** A real CelesTrak snapshot (2026-10-29), frozen for tests: ISS, Tiangong, Hubble. */
export const GP_FIXTURE: GpPayload = {
  fetchedAt: '2026-10-29T19:59:57.669Z',
  elements: [
    {
      OBJECT_NAME: 'ISS (ZARYA)',
      OBJECT_ID: '1998-067A',
      EPOCH: '2026-10-28T14:18:15.597504',
      MEAN_MOTION: 15.49090321,
      ECCENTRICITY: 0.00069949,
      INCLINATION: 51.6336,
      RA_OF_ASC_NODE: 359.9178,
      ARG_OF_PERICENTER: 320.4528,
      MEAN_ANOMALY: 39.5949,
      NORAD_CAT_ID: 25544,
      REV_AT_EPOCH: 59243,
      BSTAR: 0.00011161276,
      MEAN_MOTION_DOT: 0.00005724,
      MEAN_MOTION_DDOT: 0,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      ELEMENT_SET_NO: 999,
    },
    {
      OBJECT_NAME: 'CSS (TIANHE)',
      OBJECT_ID: '2021-035A',
      EPOCH: '2026-10-28T04:01:09.757920',
      MEAN_MOTION: 15.61213365,
      ECCENTRICITY: 0.00034912,
      INCLINATION: 41.4693,
      RA_OF_ASC_NODE: 234.1262,
      ARG_OF_PERICENTER: 225.6683,
      MEAN_ANOMALY: 134.387,
      NORAD_CAT_ID: 48274,
      REV_AT_EPOCH: 31393,
      BSTAR: 0.000082271706,
      MEAN_MOTION_DOT: 0.00006834,
      MEAN_MOTION_DDOT: 0,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      ELEMENT_SET_NO: 999,
    },
    {
      OBJECT_NAME: 'HST',
      OBJECT_ID: '1990-037B',
      EPOCH: '2026-10-28T12:57:20.282112',
      MEAN_MOTION: 15.32105918,
      ECCENTRICITY: 0.00018696,
      INCLINATION: 28.4736,
      RA_OF_ASC_NODE: 248.2212,
      ARG_OF_PERICENTER: 190.0188,
      MEAN_ANOMALY: 170.0372,
      NORAD_CAT_ID: 20580,
      REV_AT_EPOCH: 80903,
      BSTAR: 0.00013180523,
      MEAN_MOTION_DOT: 0.0000444,
      MEAN_MOTION_DDOT: 0,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      ELEMENT_SET_NO: 999,
    },
  ],
};

/** Element sets as the satellite provider wants them. */
export const FIXTURE_ELEMENTS = new Map(
  GP_FIXTURE.elements.map((e) => [Number(e.NORAD_CAT_ID), e]),
);

/** A moment close to the fixture epochs. */
export const FIXTURE_NOW = new Date('2026-10-28T20:00:00Z');
