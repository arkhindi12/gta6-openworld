// scale.js — the single place the world's measurements come from.
//
// A unit is one metre. The town is a square lattice of avenues: seven lines on each axis, 252 m
// apart, each avenue 46 m wide from kerb to kerb. That leaves a 206 m block between two avenues,
// and 13 m of pavement between a kerb and the frontage of whatever stands on the block. Every
// other module derives its geometry from these numbers, so re-proportioning the city means editing
// this file and nothing else.
//
// Colours live here too. They are the only colour literals outside the texture painter: anything
// that needs the tarmac grey asks for it, rather than keeping a private copy that can drift.

export const GRID = {
  cols: 7,
  rows: 7,
  pitch: 252,
  half: 23, // centre line to kerb
  setback: 13, // pavement depth, kerb to frontage
  storey: 3.7,
};

// The town measured in world coordinates: the outer kerbs bound the drivable ground.
export const CITY = {
  first: -GRID.half,
  last: (GRID.cols - 1) * GRID.pitch + GRID.half,
  blockSide: GRID.pitch - GRID.half * 2,
};

// The shoreline. West of the first avenue the town gives way to promenade, beach and water; south
// of the last avenue to the marina quay and the bay.
export const SHORE = {
  kerb: -GRID.half,
  promenade: -98,
  sand: -268,
  water: -304,
  quay: CITY.last,
  bay: CITY.last + 34,
};

// On foot.
export const GAIT = {
  walk: 4.2,
  sprint: 8.5,
  pivot: 11.5, // radians per second the body swings round
  girth: 0.42, // collision radius against a wall
  reach: 3.6, // a car door answers within this many metres
};

// Behind the wheel.
export const DRIVE = {
  vmax: 37,
  vreverse: 12,
  push: 9.2,
  stop: 23,
  coast: 2.3,
  steer: 1.85,
};

// The pistol.
export const GUN = {
  magazine: 15,
  pouch: 60,
  reloadTime: 1.2,
  cycle: 0.17, // seconds between rounds
  reach: 90,
  muzzle: 205, // metres per second
  scatter: 0.02,
};

export const CROWD = {
  size: 92,
  stroll: [1.15, 1.9],
  bolt: 5.3,
  panic: 3.4,
};

export const FLEET = { size: 32 };

// The law. One cruiser per star, two officers to a cruiser, heat that only drains after nobody has
// had eyes on the player for `blindAfter` seconds.
export const LAW = {
  stars: 5,
  perStar: [0, 1, 2, 3, 4, 5],
  crew: 2,
  run: 5.5,
  walk: 3.1,
  volley: 0.6,
  round: 145,
  range: 56,
  blindAfter: 9,
  drainTime: 6,
  spawnNear: 150,
  spawnFar: 225,
  dismount: 34,
};

// A low sun over the gulf, a little south of due west, so every avenue runs into the light. The
// key light comes from a shade higher than the disc itself: at this hour the sun is a ball sitting
// on the water while its light still rakes across the rooftops.
export const SUN = {
  bearing: Math.PI * 0.82,
  altitude: 0.34,
  discAltitude: 0.12,
  colour: '#ffd0a0',
  strength: 4.5,
};

export const AIR = {
  haze: '#f4b58e',
  hazeDensity: 0.00058,
  skyHigh: '#1f4f7d',
  skyFill: '#b7dcf1',
  groundFill: '#d69b78',
};

export const PAINT = {
  asphalt: '#5c5969',
  laneDash: '#f1e0ac',
  centre: '#ffcf5a',
  crossing: '#fbf4e2',
  kerb: '#e6d4ba',
  pavement: '#d6bda4',
  grass: '#4e8b5d',
  dune: '#efd2a4',
  water: '#0d6b7c',
  facades: ['#cf7a63', '#e6b184', '#9b7cab', '#608f8a', '#e7ccb0', '#b56a60', '#7187af', '#f0dbc7', '#c88b72'],
  curtain: ['#2e5969', '#3a4969', '#4e6e69', '#6a4969'],
  neon: ['#ff2f86', '#22e6d0', '#ffd23c', '#8f5bff', '#ff7a30', '#3d8bff'],
  skins: ['#f1c7a0', '#d9a06b', '#a86b3f', '#7a4a2a', '#e8b98c', '#f6d9c1'],
  tops: ['#ff3d7f', '#22e6d0', '#ffd23c', '#f4efe3', '#3d8bff', '#8f5bff', '#ff7a30', '#63d07a', '#e8483f'],
  legs: ['#26324a', '#2f2f36', '#e6e0d2', '#5b4530', '#37415a', '#1f1f26'],
  cars: ['#ff3d7f', '#22e6d0', '#ffd23c', '#f2f0ea', '#232331', '#8f5bff', '#e8483f', '#177d95', '#ff7a30', '#0f5f8a'],
};