// The numbers the city is made of, and nothing else.
//
// One unit is a metre. Avenues run on a fixed pitch and are `road` metres wide kerb to kerb, so a
// block between two of them is `pitch - road` across. Seven avenue lines each way give a town a
// little over 1.5 km wide, with the gulf closing the west side and the marina the south.
//
// Every other module reads its scale from here: the plan, the fleet, the law, the camera. That is
// deliberate — re-proportioning the world is an edit to this file, not a hunt through the game.

export const GRID = {
  cols: 7,
  rows: 7,
  pitch: 252,
  road: 46,
  kerb: 23,
  setback: 13, // pavement depth between a kerb and the first building line
  storey: 3.7,
};

// The town's extent: the outer kerb lines of the first and last avenue on each axis.
export const CITY = {
  first: -GRID.kerb,
  last: (GRID.cols - 1) * GRID.pitch + GRID.kerb,
  blockSide: GRID.pitch - GRID.road,
};

// Walking.
export const GAIT = {
  walk: 4.2,
  run: 8.5,
  turn: 11.5, // radians per second the shoulders swing round
  radius: 0.42, // how fat the body is when it is tested against walls
  reach: 3.6, // a car door opens within this
};

// Driving.
export const DRIVE = {
  top: 37,
  reverse: 12,
  accel: 9.2,
  brake: 23,
  drag: 2.3,
  steer: 1.85,
};

// The pistol.
export const GUN = {
  clip: 15,
  reserve: 60,
  reload: 1.2,
  rate: 0.17,
  range: 90,
  speed: 205,
  spread: 0.02,
};

export const CROWD = {
  count: 92,
  walk: [1.15, 1.9],
  flee: 5.3,
  panicFor: 3.4,
};

export const FLEET = { count: 32 };

// The police. One cruiser per star on the street, two officers to a cruiser, and heat that drains
// only once nobody has had eyes on the player for `calmAfter` seconds.
export const LAW = {
  maxStars: 5,
  perStar: [0, 1, 2, 3, 4, 5],
  crew: 2,
  copRun: 5.5,
  copWalk: 3.1,
  fireGap: 0.6,
  bullet: 145,
  copRange: 56,
  calmAfter: 9,
  drainFor: 6,
  spawnMin: 150,
  spawnMax: 225,
  dismount: 34, // a cruiser stops this close and lets its crew out
};

// A low sun over the gulf, a little south of due west, so the avenues run into the light.
export const SUN = {
  azimuth: Math.PI * 0.955,
  height: 0.38,
  colour: '#ffd0a0',
  power: 4.5,
};

export const ATMOS = {
  fog: '#f4b58e',
  fogDensity: 0.00058,
  skyTop: '#1f4f7d',
  halfSky: '#b7dcf1',
  halfGround: '#d69b78',
};

// Every colour the world is painted with.
export const PALETTE = {
  tarmac: '#5c5969',
  lanePaint: '#f1e0ac',
  centrePaint: '#ffcf5a',
  zebra: '#fbf4e2',
  kerb: '#e6d4ba',
  pave: '#d6bda4',
  grass: '#4e8b5d',
  sand: '#efd2a4',
  sea: '#0d6b7c',
  walls: ['#cf7a63', '#e6b184', '#9b7cab', '#608f8a', '#e7ccb0', '#b56a60', '#7187af', '#f0dbc7', '#c88b72'],
  glass: ['#2e5969', '#3a4969', '#4e6e69', '#6a4969'],
  neon: ['#ff2f86', '#22e6d0', '#ffd23c', '#8f5bff', '#ff7a30', '#3d8bff'],
  skins: ['#f1c7a0', '#d9a06b', '#a86b3f', '#7a4a2a', '#e8b98c', '#f6d9c1'],
  shirts: ['#ff3d7f', '#22e6d0', '#ffd23c', '#f4efe3', '#3d8bff', '#8f5bff', '#ff7a30', '#63d07a', '#e8483f'],
  trousers: ['#26324a', '#2f2f36', '#e6e0d2', '#5b4530', '#37415a', '#1f1f26'],
  cars: ['#ff3d7f', '#22e6d0', '#ffd23c', '#f2f0ea', '#232331', '#8f5bff', '#e8483f', '#177d95', '#ff7a30', '#0f5f8a'],
};