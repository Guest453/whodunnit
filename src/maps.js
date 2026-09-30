// maps.js — the three house layouts for the Whodunnit 3D scene.
//
// Every map is pure data: five named rooms, each an axis-aligned rectangle on
// the XZ ground plane (Y is up, the floor sits at y = 0). Rectangles never
// overlap; neighbours abut exactly on a shared edge so env.js can cut a
// doorway between them. `size` is [width (x), depth (z)] and `center` is
// [x, z]. All rooms are at least 7 x 7.
//
// The three layouts have deliberately different shapes and palettes:
//   manor   — a central hall with four wings   (warm, sooty browns)
//   terrace — a single linear row of rooms      (cool, moonlit blues)
//   chapel  — a cross / plus around the hall    (sepia, candlelit olive)

export const ROOMS = ["foyer", "library", "study", "conservatory", "cellar"];

export const MAPS = [
  // -------------------------------------------------------------------------
  // 1. Central hall with wings. The foyer is the hub; library (west) and
  //    study (east) hang off its sides, cellar (north) and conservatory
  //    (south) sit above and below it.
  {
    id: "manor",
    name: "Ashcroft Manor",
    shape: "central hall with wings",
    palette: {
      floor: 0x3a2c22,
      wall: 0x241b15,
      ceiling: 0x140f0b,
      accent: 0x6b4a2f,
      fog: 0x0b0907,
      light: 0xffd9a0,
      lamp: 0xffb060,
    },
    rooms: {
      foyer:        { center: [0, 0],       size: [12, 10] },
      library:      { center: [-11.5, -3],  size: [11, 8] },
      study:        { center: [11.5, -3],   size: [11, 8] },
      conservatory: { center: [0, 10],      size: [10, 10] },
      cellar:       { center: [0, -9.5],    size: [10, 9] },
    },
  },

  // -------------------------------------------------------------------------
  // 2. A linear row: five rooms threaded along x, each a different width so
  //    the terrace reads as a run of adjoining townhouse rooms.
  {
    id: "terrace",
    name: "Belgrave Terrace",
    shape: "linear row",
    palette: {
      floor: 0x2b2a33,
      wall: 0x1c1b26,
      ceiling: 0x0e0d15,
      accent: 0x4a5a6b,
      fog: 0x080a12,
      light: 0xbcd0ff,
      lamp: 0x8fb0e0,
    },
    rooms: {
      foyer:        { center: [-18, 0], size: [12, 10] },
      library:      { center: [-8, 0],  size: [8, 9] },
      study:        { center: [0, 0],   size: [8, 10] },
      conservatory: { center: [8, 0],   size: [8, 8] },
      cellar:       { center: [17, 0],  size: [10, 9] },
    },
  },

  // -------------------------------------------------------------------------
  // 3. A cross / plus: the foyer is the junction, with one arm reaching out
  //    on each of the four sides.
  {
    id: "chapel",
    name: "St. Ives Chapel House",
    shape: "cross",
    palette: {
      floor: 0x33301f,
      wall: 0x232117,
      ceiling: 0x12110a,
      accent: 0x7a6a3a,
      fog: 0x0c0b06,
      light: 0xffd9a0,
      lamp: 0xffc070,
    },
    rooms: {
      foyer:        { center: [0, 0],      size: [10, 10] },
      library:      { center: [0, -9.5],   size: [8, 9] },
      conservatory: { center: [0, 9.5],    size: [8, 9] },
      study:        { center: [-9.5, 0],   size: [9, 8] },
      cellar:       { center: [9.5, 0],    size: [9, 8] },
    },
  },
];
