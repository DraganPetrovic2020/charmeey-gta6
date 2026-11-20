// Every tuning number of Palmera Heat in one place: the city's grid, movement, vehicles,
// weapons, police response and how fast the day turns.

/** The city is a square grid of blocks with a road between every pair of blocks. */
export const CITY = {
  blocks: 10,
  block: 72,
  road: 16,
  sidewalk: 4,
  lane: 3.6,
  beach: 70,
  seaLevel: -0.6,
};
CITY.pitch = CITY.block + CITY.road;
CITY.size = CITY.blocks * CITY.pitch + CITY.road;

export const STEP = 1 / 60;

export const PLAYER = {
  walk: 4.2,
  run: 8.2,
  turn: 12,
  radius: 0.45,
  maxHealth: 100,
  maxArmor: 100,
  jump: 6.5,
  gravity: 22,
};

/** Each vehicle model: top speed (m/s), acceleration, grip, mass, health and its look. */
export const VEHICLES = {
  brava: { name: 'Brava Sedan', top: 34, accel: 13, grip: 7.5, mass: 1.0, health: 900, length: 4.6, width: 2.0, height: 1.45, colors: [0xe8e2d4, 0x2f4f6f, 0x9a2b2b, 0x3d3d3d, 0x5d7f5a] },
  vortex: { name: 'Vortex GT', top: 52, accel: 22, grip: 9.5, mass: 0.9, health: 800, length: 4.4, width: 2.0, height: 1.15, colors: [0xff3d6e, 0x18c6c6, 0xffb000, 0xf2f2f2] },
  mule: { name: 'Mule Pickup', top: 30, accel: 11, grip: 6.5, mass: 1.4, health: 1300, length: 5.0, width: 2.2, height: 1.8, colors: [0x6e4b2a, 0xd9cfb0, 0x234d3c, 0xb34a1e] },
  cabana: { name: 'Cabana Cruiser', top: 40, accel: 16, grip: 8.0, mass: 1.0, health: 850, length: 4.8, width: 2.0, height: 1.25, colors: [0x7fe0d1, 0xffa8c0, 0xfff1a8, 0xc7b6ff] },
  sunbus: { name: 'Sunbus Van', top: 27, accel: 9, grip: 6.0, mass: 1.7, health: 1500, length: 5.6, width: 2.3, height: 2.4, colors: [0xf4f0e6, 0x3b6ea5, 0xe0a33a] },
  cab: { name: 'Palmera Cab', top: 34, accel: 13, grip: 7.5, mass: 1.0, health: 900, length: 4.6, width: 2.0, height: 1.45, colors: [0x23a8a0] },
  cruiser: { name: 'PKPD Cruiser', top: 46, accel: 19, grip: 8.6, mass: 1.15, health: 1100, length: 4.8, width: 2.05, height: 1.5, colors: [0x101826], police: true },
};
export const TRAFFIC_MODELS = ['brava', 'brava', 'brava', 'mule', 'cabana', 'cab', 'sunbus', 'vortex'];

/** Weapons: damage per hit, shots per second, magazine, spread (radians), range and price. */
export const WEAPONS = [
  { id: 'fists', name: 'Fists', damage: 12, rate: 2.2, mag: Infinity, spread: 0, range: 1.8, price: 0, melee: true },
  { id: 'pistol', name: 'Kestrel 9', damage: 24, rate: 3.5, mag: 14, spread: 0.02, range: 70, price: 400, ammoPrice: 60 },
  { id: 'smg', name: 'Hornet SMG', damage: 15, rate: 11, mag: 32, spread: 0.05, range: 60, price: 1800, ammoPrice: 120 },
  { id: 'shotgun', name: 'Breaker 12', damage: 14, rate: 1.2, mag: 6, spread: 0.12, range: 30, price: 2600, ammoPrice: 140, pellets: 7 },
  { id: 'rifle', name: 'Gulf Carbine', damage: 34, rate: 6, mag: 30, spread: 0.018, range: 120, price: 6500, ammoPrice: 260 },
];

/** Heat points a crime adds; stars are thresholds of heat. */
export const CRIME = {
  hitPed: 18,
  killPed: 40,
  shootNear: 6,
  killCop: 140,
  stealSeen: 30,
  damageCop: 30,
  starHeat: [0, 20, 120, 300, 600, 1000],
  copSight: 70,
  searchTime: 14,
};

export const POLICE = {
  carsPerStar: [0, 1, 2, 3, 4, 5],
  footPerStar: [0, 2, 3, 4, 5, 6],
  copAccuracy: [0, 0.0, 0.18, 0.26, 0.34, 0.42],
  bustTime: 2.2,
  heliStars: 4,
};

export const POPULATION = {
  traffic: 26,
  peds: 44,
  spawnNear: 45,
  spawnFar: 190,
  despawn: 230,
};

/** One in-game day lasts this many real seconds. */
export const DAY_SECONDS = 1440;
export const START_HOUR = 17.2;

export const SAVE_KEY = 'palmera-heat-save-v1';
