import type { TargetInfo } from './target.types';

/**
 * Plain-language info for every target. Facts are things that do not go stale (no "currently", no crew
 * counts or names, no mission end dates, no records likely to be broken). Numbers are rounded and written
 * as "about"; the basis of each is in the comment beside it.
 *
 * `distanceLy` (fixed-sky targets only) is the table from docs/phases/phase8.md, used exactly.
 */
export const TARGET_INFO: Readonly<Record<string, TargetInfo>> = {
  moon: {
    type: 'Natural satellite of Earth',
    description:
      "Earth's only natural satellite. It always shows us the same face, and its changing phases come from how much of its sunlit half we can see.",
    facts: [
      // Mean distance 384,400 km; Earth's diameter 12,742 km, so about 30 Earth-widths.
      'It is about 384,000 km away on average, roughly 30 Earth-widths.',
      // Synodic month: 29.53 days.
      'It takes about 29.5 days to go from one new moon to the next.',
      // Lunar laser ranging: 3.8 cm per year.
      'It is slowly drifting away from Earth, by about 3.8 cm every year.',
    ],
  },
  sun: {
    type: 'Yellow dwarf star',
    description:
      'The star at the center of our solar system. Its light takes about 8 minutes to reach Earth.',
    facts: [
      'Never look at the Sun — not directly, not through your camera.',
      // 99.86% of the solar system's mass.
      'It holds about 99.8% of all the mass in the solar system.',
      // Volume ratio about 1.3 million.
      'About 1.3 million Earths would fit inside it.',
    ],
  },
  mercury: {
    type: 'Rocky planet',
    description:
      'The smallest planet and the closest to the Sun. It stays so near the Sun in our sky that it is only seen low at dawn or dusk.',
    facts: [
      // Orbital period 87.97 days.
      'A year on Mercury lasts about 88 Earth days.',
      // Diameter 4,879 km; the Moon is 3,474 km, a ratio of 1.4.
      "It is about 4,900 km across, roughly 1.4 times the Moon's width.",
      // Essentially no atmosphere (a thin exosphere).
      'It has almost no atmosphere, so its temperature swings between day and night are huge.',
    ],
  },
  venus: {
    type: 'Rocky planet',
    description:
      "The brightest planet in our sky, wrapped in thick clouds. It often shows up as a brilliant 'star' just after sunset or before sunrise.",
    facts: [
      // Mean surface temperature 464 degrees C.
      'It is the hottest planet, with a surface around 460 °C.',
      // Retrograde rotation.
      'It spins backwards compared with most planets, and very slowly.',
      // Rotation 243 days, orbit 225 days.
      'Its day is longer than its year: one spin takes about 243 Earth days, one orbit about 225.',
    ],
  },
  mars: {
    type: 'Rocky planet',
    description:
      'The red planet. Iron-rich dust gives it its rusty colour, and it has seasons, polar ice caps and the tallest volcano known in the solar system.',
    facts: [
      // Sol length 24 h 39 min 35 s.
      'A day on Mars is about 24 hours 40 minutes, very close to ours.',
      // Olympus Mons about 22 km high; Everest 8.85 km, a ratio of about 2.5.
      'Olympus Mons is about 22 km high, roughly two and a half times Mount Everest.',
      'It has two small moons, Phobos and Deimos.',
    ],
  },
  jupiter: {
    type: 'Gas giant planet',
    description:
      'The largest planet, a giant ball of hydrogen and helium with banded clouds. Its mass is more than twice that of all the other planets combined.',
    facts: [
      // Continuous observation since the late 1800s, possibly seen in the 1600s.
      'The Great Red Spot is a storm that has been watched for well over a century.',
      // Volume ratio about 1,320.
      'About 1,300 Earths would fit inside it.',
      // Galileo, 1610.
      'Its four big moons, found by Galileo in 1610, can be seen with binoculars.',
    ],
  },
  saturn: {
    type: 'Gas giant planet',
    description:
      'The ringed planet. The rings are countless pieces of ice and rock, from dust grains to boulders, and they are very thin compared with their width.',
    facts: [
      // Mean density 0.69 g/cm3, less than water.
      'It is less dense than water, so it would float in a big enough bathtub.',
      // Orbital period 29.4 years.
      'Saturn takes about 29 Earth years to go once around the Sun.',
      // Main rings span ~270,000 km; thickness typically 10 m to a kilometre.
      'The rings stretch hundreds of thousands of km across but are mostly under a kilometre thick.',
    ],
  },
  uranus: {
    type: 'Ice giant planet',
    description:
      'A pale blue-green ice giant. It is tipped on its side, so it rolls around the Sun like a ball rather than spinning like a top.',
    facts: [
      // Discovered 13 March 1781 by William Herschel.
      'It was the first planet found with a telescope, by William Herschel in 1781.',
      // Axial tilt 97.8 degrees.
      'Its axis is tilted by about 98 degrees.',
      // Orbital period 84.0 years.
      'A year on Uranus lasts about 84 Earth years.',
    ],
  },
  neptune: {
    type: 'Ice giant planet',
    description:
      'The farthest planet from the Sun, a deep blue ice giant with some of the fastest winds in the solar system. It is too faint to see without binoculars.',
    facts: [
      // Predicted by Le Verrier and Adams, found by Galle in 1846.
      'It was found in 1846 using math, before anyone had seen it.',
      // Orbital period 164.8 years.
      'One Neptune year is about 165 Earth years.',
      // Measured wind speeds up to about 2,000 km/h.
      'Its winds can blow faster than 1,500 km/h.',
    ],
  },
  polaris: {
    type: 'Yellow supergiant star',
    description:
      "The North Star. It sits almost exactly above Earth's north pole, so it barely moves while the rest of the sky turns around it.",
    distanceLy: 430, // phase8.md table; estimates vary a little
    facts: [
      // The pole star is within about 0.7 degrees of the celestial pole.
      'Its height above your horizon is about your latitude.',
      // Polaris is roughly the 50th brightest star, not one of the brightest.
      'It is only moderately bright, not one of the brightest stars in the sky.',
      // Axial precession, a cycle of about 26,000 years.
      "Earth's axis slowly wobbles, so Polaris has not always been, and will not always be, the pole star.",
    ],
  },
  sirius: {
    type: 'Bright star with a white dwarf companion',
    description:
      'The brightest star in the night sky. It is really a pair: a bright white star and a faint, dense white dwarf companion.',
    distanceLy: 8.6, // phase8.md table
    facts: [
      // About 2.06 solar masses and 25 solar luminosities.
      'It is about twice as massive as the Sun and about 25 times as luminous.',
      // Atmospheric scintillation near the horizon.
      'Low in the sky it can flash many colours as the air bends its light.',
      // Heliacal rising of Sopdet and the Nile flood in ancient Egypt.
      'Ancient Egyptians linked its first rising before dawn to the yearly flooding of the Nile.',
    ],
  },
  vega: {
    type: 'Blue-white star',
    description:
      'A bright blue-white star high overhead on northern summer evenings, and one corner of the Summer Triangle.',
    distanceLy: 25, // phase8.md table
    facts: [
      // Daguerreotype by Whipple and Bond, Harvard, 1850.
      'It was the first star other than the Sun to be photographed, in 1850.',
      // Rotation period about 16 hours.
      'It spins so fast that it bulges around its equator.',
      // Precession: pole star about 14,000 years ago, again in about 12,000 years.
      'It was the pole star over 10,000 years ago and will be again in about 12,000 years.',
    ],
  },
  arcturus: {
    type: 'Orange giant star',
    description:
      "An orange giant and the brightest star in the northern half of the sky. Find it by following the curve of the Big Dipper's handle.",
    distanceLy: 37, // phase8.md table
    facts: [
      // Radius about 25 times the Sun's.
      'It is about 25 times wider than the Sun.',
      // Evolved off the main sequence.
      'It has swollen into a giant after running low on hydrogen in its core.',
      // High proper motion.
      'It moves fast relative to the Sun, so it slowly shifts against the other stars over thousands of years.',
    ],
  },
  betelgeuse: {
    type: 'Red supergiant star',
    description:
      'A huge red supergiant marking the shoulder of Orion. Placed where the Sun is, it would reach past the orbit of Mars.',
    distanceLy: 550, // phase8.md table; estimates range roughly 500 to 700
    facts: [
      // Radius estimates of several hundred solar radii, i.e. more than 3 AU; Mars orbits at 1.5 AU.
      "Its radius is bigger than Mars's orbit around the Sun.",
      // Semiregular variable star.
      'Its brightness changes noticeably over months and years.',
      // Rigel, in the same constellation, is blue-white.
      'Its red-orange colour is easy to see next to blue-white Rigel in the same constellation.',
    ],
  },
  m31: {
    type: 'Spiral galaxy',
    description:
      'The nearest large galaxy to ours: a spiral of hundreds of billions of stars. On a dark night it looks like a faint, stretched smudge.',
    distanceLy: 2_500_000, // phase8.md table
    facts: [
      // Commonly cited as among the farthest objects visible to the naked eye.
      'It is among the farthest things you can see with the naked eye.',
      // Approaching at about 110 km/s; the timing of any merger is uncertain.
      'It is moving toward the Milky Way, though any merger is billions of years away.',
      // Disk diameter commonly quoted above 150,000 light-years.
      'It is a bit larger than the Milky Way, over 150,000 light-years across.',
    ],
  },
  m42: {
    type: 'Emission nebula',
    description:
      'A glowing cloud of gas where new stars are forming, in the sword of Orion below the three belt stars. It looks like a fuzzy star to the naked eye.',
    distanceLy: 1350, // phase8.md table
    facts: [
      // Trapezium cluster age about 1 to 3 million years.
      'The young stars inside it are only a few million years old.',
      // About 24 light-years across.
      'It is about 24 light-years across.',
      'Binoculars or a small telescope show four bright stars at its heart, called the Trapezium.',
    ],
  },
  m45: {
    type: 'Open star cluster',
    description:
      'The Pleiades, or Seven Sisters: a bright cluster of young blue stars, surrounded by a faint blue haze of dust in long-exposure photos.',
    distanceLy: 440, // phase8.md table
    facts: [
      // Naked-eye observers usually count 6 to 7; the cluster has over a thousand members.
      'Most people see six or seven stars, but the cluster has over a thousand.',
      // Age about 100 million years.
      'Its stars are young, roughly 100 million years old.',
      'People around the world have told stories about it for thousands of years.',
    ],
  },
  'galactic-center': {
    type: 'Center of the Milky Way',
    description:
      'The direction of the middle of our galaxy, in Sagittarius. Thick dust hides it from our eyes, so this marks where it is rather than something you can see.',
    distanceLy: 26_000, // phase8.md table
    facts: [
      // Sagittarius A*: about 4 million solar masses.
      "A black hole about four million times the Sun's mass sits there, called Sagittarius A*.",
      // Orbital period of the Sun about 225 to 250 million years.
      'The Sun orbits the galaxy center about once every 230 million years.',
      'Radio and infrared telescopes can see through the dust that blocks visible light.',
    ],
  },
  lmc: {
    type: 'Dwarf galaxy',
    description:
      'A small galaxy that orbits the Milky Way. From the southern hemisphere it is visible to the naked eye as a hazy cloud.',
    distanceLy: 160_000, // phase8.md table
    facts: [
      'It holds the Tarantula Nebula, one of the most active star-forming regions nearby.',
      // SN 1987A, February 1987; the closest observed supernova since Kepler's in 1604.
      'Supernova 1987A, seen in 1987, was the closest supernova seen since 1604.',
      'It travels with the smaller Small Magellanic Cloud around the Milky Way.',
    ],
  },
  iss: {
    type: 'Space station',
    description:
      'A research laboratory in orbit, built by several countries from modules launched over many years. When it passes overhead it can be one of the brightest objects in the night sky.',
    facts: [
      // Orbital speed about 7.66 km/s; about 15.5 orbits a day.
      'It circles Earth about every 90 minutes, so the crew sees about 16 sunrises a day.',
      // About 109 m by 73 m.
      'It is about as long as a football field.',
      // Expedition 1 arrived November 2000.
      'The first crew moved in during November 2000.',
    ],
  },
  tiangong: {
    type: 'Space station',
    description:
      "China's space station, built in orbit from modules launched from 2021. It is smaller than the ISS but can still be a bright, fast-moving 'star'.",
    facts: [
      // 天宫, "heavenly palace".
      "Tiangong means 'heavenly palace' in Chinese.",
      // Tianhe, Wentian and Mengtian modules.
      'Its three main modules are arranged in a T shape.',
      // Orbital inclination about 41.5 degrees.
      'It never passes over places beyond about 41 degrees north or south.',
    ],
  },
  hubble: {
    type: 'Space telescope',
    description:
      'A space telescope launched in 1990 that orbits above the blurring of our atmosphere. It is faint and fast, so spotting it takes a clear, dark sky and good timing.',
    facts: [
      // Named for Edwin Hubble.
      'It is named after Edwin Hubble, who showed that other galaxies exist beyond ours.',
      // Primary mirror diameter 2.4 m.
      'Its main mirror is 2.4 metres across.',
      // Servicing missions 1993, 1997, 1999, 2002, 2009.
      'Visiting astronauts serviced it five times between 1993 and 2009.',
    ],
  },
};
