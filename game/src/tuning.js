// The numbers the city is built out of. Everything downstream reads from here rather than
// carrying literals of its own, so the world can be re-proportioned in one place.
//
// One unit is one metre. A block is 264 m on a side with a 48 m avenue between them; a person is
// 1.7 m tall; the camera rides a couple of metres over the asphalt. Seven avenues each way make
// a town about 1.6 km across, the sea closes the west side, and the marina closes the south.

export const MAP = {
  cols: 7,
  rows: 7,
  block: 264,
  road: 48,
  walkInset: 12,
};

export const TOWN = {
  min: -MAP.road / 2,
  max: (MAP.cols - 1) * MAP.block + MAP.road / 2,
};

// How the player moves on foot.
export const GAIT = {
  walk: 4.1,
  run: 8.6,
  turn: 11,
  body: 0.42,
  reach: 3.4, // how close a car has to be before its door opens
};

// And in a car.
export const DRIVE = {
  topSpeed: 38,
  reverse: 13,
  accel: 9.5,
  brake: 24,
  coast: 2.4,
  steer: 1.9,
};

// The pistol.
export const WEAPON = {
  clip: 17,
  reserve: 68,
  reload: 1.25,
  cadence: 0.17,
  range: 95,
  speed: 210,
  spread: 0.018,
};

export const CROWD = {
  count: 96,
  walk: [1.1, 1.9],
  flee: 5.4,
};

export const TRAFFIC = { count: 34 };

export const LAW = {
  maxStars: 5,
  cruisersPerStar: [0, 1, 2, 3, 4, 5],
  crew: 2,
  copRun: 5.6,
  copWalk: 3.2,
  fireGap: 0.62,
  bulletSpeed: 150,
  copRange: 58,
  coolAfter: 9,
  coolFor: 6,
  spawnMin: 150,
  spawnMax: 230,
};

// A low sun over the gulf: west and a little south, so every avenue runs into the light.
export const SUN = {
  azimuth: Math.PI * 0.965,
  height: 0.4,
  colour: '#ffd2a2',
  power: 4.6,
};

export const SKY = {
  fog: '#f6b892',
};

// Every colour the world is painted with.
export const PALETTE = {
  asphalt: '#5a5768',
  paint: '#f2dfa6',
  kerb: '#e7d6bd',
  pave: '#d6bda4',
  verge: '#4d8a5c',
  sand: '#f0d3a4',
  sea: '#0f6d7d',
  towers: ['#d07a62', '#e7b285', '#9a7ba8', '#5f8f8a', '#e8cdb0', '#b56a5f', '#7288b0', '#f1dcc8', '#c98b72'],
  glass: ['#2f5a6e', '#3b4a6e', '#4f6f6a', '#6b4a6a'],
  neon: ['#ff2f86', '#22e6d0', '#ffd23c', '#8f5bff', '#ff7a30', '#3d8bff'],
  skins: ['#f1c7a0', '#d9a06b', '#a86b3f', '#7a4a2a', '#e8b98c', '#f6d9c1'],
  shirts: ['#ff3d7f', '#22e6d0', '#ffd23c', '#f4efe3', '#3d8bff', '#8f5bff', '#ff7a30', '#63d07a', '#e8483f'],
  trousers: ['#26324a', '#2f2f36', '#e6e0d2', '#5b4530', '#37415a', '#1f1f26'],
  cars: ['#ff3d7f', '#22e6d0', '#ffd23c', '#f2f0ea', '#232331', '#8f5bff', '#e8483f', '#177d95', '#ff7a30', '#0f5f8a'],
};
