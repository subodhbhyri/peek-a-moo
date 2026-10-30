/**
 * Exactly three facts for each of the 22 rank-1 constellations (the other 66 have none). Same rules as the
 * other info cards: nothing that goes stale, rounded numbers written as "about", at most 120 characters.
 * Everything here is long-established astronomy; the basis of each is in the comment beside it.
 */
export const CONSTELLATION_FACTS: Readonly<Record<string, readonly [string, string, string]>> = {
  andromeda: [
    // M31, the nearest large galaxy.
    'It holds the Andromeda Galaxy (M31), the nearest large galaxy to the Milky Way.',
    // Alpheratz (Alpha Andromedae) is the NE corner of the Great Square of Pegasus.
    'Its brightest star, Alpheratz, is also a corner of the Great Square of Pegasus.',
    // Perseus rescues her in the myth.
    'In the myth, Andromeda is a princess chained to a rock as an offering to a sea monster.',
  ],
  aquila: [
    // Altair, Vega, Deneb.
    'Its brightest star, Altair, is one of the three stars of the Summer Triangle.',
    // Altair's rotation period is well under a day.
    'Altair spins so fast that it is visibly flattened, turning once in well under a day.',
    // It lies along the Milky Way.
    'The Milky Way runs through it, so the sky here is thick with faint stars.',
  ],
  aries: [
    // Aries is on the ecliptic.
    'It is one of the twelve zodiac constellations, along the path of the Sun, Moon and planets.',
    // Hamal: orange giant, 66 light-years.
    'Its brightest star, Hamal, is an orange giant about 66 light-years away.',
    // Precession has carried the March equinox into Pisces.
    "The March equinox once lay in Aries; because of Earth's slow wobble it now lies in Pisces.",
  ],
  auriga: [
    // Capella: two yellow giants in a close orbit.
    'Its brightest star, Capella, is a close pair of yellow giant stars orbiting each other.',
    // Capella: sixth-brightest star overall, among the very brightest in the north.
    'Capella is one of the brightest stars of the northern sky.',
    // M36, M37, M38.
    'It holds three open star clusters, M36, M37 and M38, that show up in binoculars.',
  ],
  bootes: [
    // Arcturus: brightest star of the northern celestial hemisphere.
    'Its brightest star, Arcturus, is the brightest star in the northern half of the sky.',
    // The old "arc to Arcturus" rule.
    'Follow the curve of the Big Dipper\'s handle and you arrive at Arcturus: "arc to Arcturus".',
    // Kite shape.
    'Its main stars are often pictured as a kite or an ice-cream cone.',
  ],
  'canis-major': [
    // Sirius.
    'It contains Sirius, the brightest star in the night sky.',
    // Sirius is 8.6 ly away.
    'Sirius is only about 8.6 light-years away, one of the Sun’s nearest neighbours.',
    // The Romans linked Sirius to the hottest part of summer.
    'Sirius is the "Dog Star", which gave the "dog days" of summer their name.',
  ],
  carina: [
    // Canopus: second-brightest star.
    'It holds Canopus, the second-brightest star in the night sky.',
    // Eta Carinae sits in the Carina Nebula.
    'Eta Carinae, one of the most massive stars known, sits in the glowing Carina Nebula.',
    // Argo Navis was split into Carina, Puppis, Vela (and Pyxis).
    'It was once part of a far larger constellation, Argo Navis, the ship of the Argonauts.',
  ],
  cassiopeia: [
    // The W/M asterism.
    'Its five brightest stars form a W or an M, depending on the time of night.',
    // Dec about +60: circumpolar from latitudes above about 30 degrees north.
    'From much of the northern hemisphere it never sets, circling the north celestial pole.',
    // It lies in the Milky Way.
    'It sits in the Milky Way, so it is rich in star clusters.',
  ],
  centaurus: [
    // Alpha Centauri.
    'It contains Alpha Centauri, the closest star system to the Sun.',
    // Omega Centauri.
    'Omega Centauri, the largest globular star cluster in the Milky Way, is here.',
    // Declinations about -30 to -65.
    'Most of it lies in the far southern sky.',
  ],
  cetus: [
    // Fourth-largest constellation by area.
    'It is one of the largest constellations, named for a sea monster of Greek myth.',
    // Mira: period about 332 days, magnitude about 3 to 9.
    'Mira, a famous variable star here, fades from easy naked-eye brightness to invisible and back every 11 months.',
    // Tau Ceti: about 12 light-years, Sun-like.
    'Tau Ceti, a Sun-like star only about 12 light-years away, is in Cetus.',
  ],
  cygnus: [
    // Deneb.
    'Its brightest star, Deneb, is one of the three stars of the Summer Triangle.',
    // The Northern Cross asterism.
    'Its main stars form a cross, so it is also called the Northern Cross.',
    // Cygnus X-1.
    'Cygnus X-1, one of the first black holes ever identified, is in this constellation.',
  ],
  eridanus: [
    // Sixth-largest by area.
    'It is a long, winding river of stars, one of the largest constellations.',
    // Achernar: about ninth-brightest star.
    'Its brightest star, Achernar, marks the far southern end of the river and is one of the ten brightest stars.',
    // Epsilon Eridani: about 10.5 light-years, Sun-like.
    'Epsilon Eridani, a Sun-like star about 10.5 light-years away, is one of our nearest neighbours.',
  ],
  gemini: [
    // Castor and Pollux.
    'Its two brightest stars, Castor and Pollux, are named for the twins of Greek myth.',
    // Castor is a system of six stars.
    'Castor looks like one star but is really a system of six stars orbiting each other.',
    // Geminids radiate from near Castor.
    'The Geminid meteor shower seems to radiate from near Castor each December.',
  ],
  leo: [
    // Regulus at the base of the Sickle.
    'Its brightest star, Regulus, sits at the bottom of the Sickle, a backwards question mark.',
    // Regulus is within about half a degree of the ecliptic.
    'Regulus lies almost exactly on the ecliptic, so the Moon and planets sometimes pass close to it.',
    // Mesopotamian lion.
    'People have seen a lion in this part of the sky for thousands of years.',
  ],
  orion: [
    // Betelgeuse: red supergiant; Rigel: blue supergiant.
    'Its stars Betelgeuse and Rigel are a red supergiant and a blue supergiant.',
    // The Belt.
    "Three stars in a row form Orion's Belt, easy to spot and used to find other stars.",
    // M42.
    'Below the Belt hangs the Orion Nebula, a star-forming cloud you can see by eye.',
  ],
  pegasus: [
    // The Great Square.
    'The Great Square of Pegasus is a big square of four stars, a handy landmark for finding others.',
    // 51 Pegasi b, 1995.
    '51 Pegasi b, found in 1995, was the first planet discovered around a Sun-like star.',
    // Drawn upside down, front half only.
    'Pegasus is drawn upside down, and only the front half of the horse appears.',
  ],
  perseus: [
    // The Double Cluster.
    'It holds the Double Cluster, two bright star clusters side by side that show up in binoculars.',
    // Algol: period 2.87 days.
    'Algol, the "Demon Star", dims noticeably about every three days as a companion passes in front.',
    // The Perseids.
    'The Perseid meteor shower seems to radiate from here each August.',
  ],
  sagittarius: [
    // Direction of the Galactic Center.
    'The center of the Milky Way lies in this direction.',
    // The Teapot.
    'Its brightest stars form the shape of a teapot.',
    // The Lagoon and Trifid nebulae, M22 and so on.
    'It is a zodiac constellation, rich in nebulae and star clusters.',
  ],
  scorpius: [
    // Antares: red supergiant; name means rival of Mars.
    'Its brightest star, Antares, is a red supergiant whose name means "rival of Mars".',
    // The curved shape.
    'Its curve of stars really does look like a scorpion with a curled tail.',
    // The myth.
    'In myth the scorpion stung Orion, and the two constellations sit on opposite sides of the sky.',
  ],
  taurus: [
    // Aldebaran.
    "Its brightest star, Aldebaran, is an orange giant that marks the Bull's red eye.",
    // Pleiades and Hyades.
    'It holds the Pleiades and the Hyades, two of the best-known star clusters.',
    // Crab Nebula: supernova of 1054.
    'The Crab Nebula, the remains of a star that exploded in the year 1054, is in Taurus.',
  ],
  'ursa-major': [
    // The Big Dipper is an asterism.
    'The Big Dipper is part of it, but it is only a small part of the whole constellation.',
    // Dubhe and Merak point to Polaris.
    "The two stars at the end of the Dipper's bowl point toward Polaris, the North Star.",
    // Third-largest by area.
    'It is one of the largest constellations in the sky.',
  ],
  virgo: [
    // Second-largest after Hydra.
    'It is the second-largest constellation, after Hydra.',
    // Spica: close pair of blue stars, about 250 light-years.
    'Its brightest star, Spica, is a close pair of blue stars about 250 light-years away.',
    // The Virgo Cluster.
    'The Virgo Cluster, a group of more than a thousand galaxies, lies largely in Virgo.',
  ],
};
