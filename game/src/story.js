// The story of Palmera Heat as data: who is who, and the seven missions, each with the place it
// starts, its opening scene, its steps and its reward. missions.js plays them.
import { CITY } from './config.js';
import { nodeCoord } from './citymap.js';

export const CAST = {
  NICO: { name: 'Nico', color: '#2ee6d6' },
  MARI: { name: 'Mari', color: '#ff6fa8' },
  TEO: { name: 'Teo', color: '#ffd166' },
  INES: { name: 'Ines', color: '#8ecae6' },
  KROLL: { name: 'Victor Kroll', color: '#f1f1f1' },
  RADIO: { name: 'Sunwave FM', color: '#c792ff' },
};

const n = nodeCoord;

export const MISSIONS = [
  {
    id: 'homecoming',
    title: 'Back in the Sun',
    giver: 'busStation',
    npc: null,
    reward: 500,
    intro: [
      ['NICO', 'Five years in Hollow Reef and the sun still hits the same.'],
      ['NICO', "Mari said the cantina's still open. First thing I need is wheels."],
    ],
    steps: [
      { type: 'getCar', text: 'Get a car: walk up to any car and press F' },
      { type: 'goto', place: 'cantina', radius: 6, text: "Drive to ~Mari's Cantina~" },
      { type: 'talk', lines: [
        ['MARI', 'Nico Reyes. Look at you, pale as a tourist.'],
        ['MARI', "Teo's in trouble. Kroll has him running errands for a debt he never owed."],
        ['NICO', 'Victor Kroll. The condo king.'],
        ['MARI', 'He owns half the Keys and every cop with a mortgage. Come back when you are ready.'],
      ] },
    ],
  },
  {
    id: 'cousin',
    title: 'Cousin Trouble',
    giver: 'cantina',
    npc: 'mari',
    reward: 1500,
    intro: [
      ['MARI', "Teo's hiding at the Eight Ball Hall in Old Town."],
      ['MARI', 'Kroll sent his pet officers to collect him. Get there first.'],
      ['NICO', 'On my way.'],
    ],
    steps: [
      { type: 'goto', place: 'poolhall', radius: 6, text: 'Get to ~Teo~ at the Eight Ball Hall' },
      { type: 'talk', lines: [
        ['TEO', 'Primo! Took you long enough.'],
        ['TEO', "Those PKPD guys out front are on Kroll's payroll. They saw you come in!"],
      ] },
      { type: 'wanted', stars: 2, text: '~Lose the cops~' },
      { type: 'goto', place: 'safehouse', radius: 6, text: "Lay low at ~Nico's Apartment~" },
    ],
  },
  {
    id: 'ledger',
    title: 'Paper Trail',
    giver: 'poolhall',
    npc: 'teo',
    reward: 2500,
    intro: [
      ['TEO', 'Kroll moves his books every Friday in a Sunbus van. Today is Friday.'],
      ['TEO', 'That ledger is everything. Who he pays. Who he owns.'],
      ['NICO', 'So we take the van.'],
      ['TEO', 'We take the ledger. The van can burn.'],
    ],
    steps: [
      { type: 'getCar', text: 'Get a car' },
      { type: 'chase', model: 'sunbus', from: { i: 5, j: 3 }, to: { i: 5, j: 4 }, text: 'Destroy the ~courier van~' },
      { type: 'pickup', id: 'ledger', label: "Kroll's ledger", text: 'Grab the ~ledger~ from the wreck' },
      { type: 'goto', place: 'cantina', radius: 6, text: "Bring the ledger to ~Mari's Cantina~" },
      { type: 'talk', lines: [['MARI', 'Names, dates, payoffs... Nico, this is a bomb.'], ['MARI', 'Ines Duarte at the harbor knows who to hand it to. Go see her.']] },
    ],
  },
  {
    id: 'showroom',
    title: 'Showroom Lift',
    giver: 'shipping',
    npc: 'ines',
    reward: 4000,
    intro: [
      ['INES', "So you're the wheelman Teo won't shut up about."],
      ['INES', 'Kroll keeps a Vortex GT outside his villa in Palm Heights. His pride and joy.'],
      ['INES', 'Bring it to Pier 9. Keep it pretty, and the ledger reaches the right desks.'],
    ],
    steps: [
      { type: 'stealCar', model: 'vortex', place: 'villa', color: 0xff3d6e, text: 'Steal the ~Vortex GT~ at Kroll Villa' },
      { type: 'say', lines: [['RADIO', 'Car alarm in Palm Heights. PKPD units responding.']] },
      { type: 'wantedOnly', stars: 2 },
      { type: 'deliverCar', place: 'harborGarage', minHealth: 0.35, text: 'Deliver the Vortex to ~Pier 9 Garage~ (keep it in one piece)' },
    ],
  },
  {
    id: 'docks',
    title: 'Dock Sweep',
    giver: 'shipping',
    npc: 'ines',
    reward: 5000,
    intro: [
      ['INES', 'Kroll knows. His Sunset Syndicate boys are at the container yard, ready to torch my warehouse.'],
      ['INES', 'Take this Hornet. Make them regret the trip.'],
    ],
    give: { weapon: 2, ammo: 160 },
    steps: [
      { type: 'goto', at: { x: 200, z: n(10) }, radius: 22, text: 'Go to the ~container yard~' },
      { type: 'eliminate', text: 'Kill the ~Sunset Syndicate~ gunmen', spawns: [
        { x: 100, z: n(10) + 4, weapon: 1 }, { x: 140, z: CITY.size + 15, weapon: 2 }, { x: 190, z: n(10) + 5, weapon: 1 },
        { x: 230, z: CITY.size + 15, weapon: 3 }, { x: 270, z: n(10) + 3, weapon: 1 }, { x: 305, z: CITY.size + 15, weapon: 2 },
        { x: 335, z: n(10) + 6, weapon: 1 },
      ] },
      { type: 'say', lines: [['INES', 'Clean work. Now get out before PKPD paints the docks blue.']] },
      { type: 'wanted', stars: 2, text: '~Lose the cops~' },
    ],
  },
  {
    id: 'sprint',
    title: 'Boulevard Sprint',
    giver: 'poolhall',
    npc: 'teo',
    reward: 3000,
    intro: [
      ['TEO', "Kroll's nephew Dario runs Coral Boulevard every night. Nobody beats his time."],
      ['TEO', 'Beat it, and his crew starts talking about where Kroll sleeps.'],
    ],
    steps: [
      { type: 'getCar', text: 'Get a fast car' },
      { type: 'goto', at: { x: n(10) + 3.6, z: 120 }, radius: 8, inVehicle: true, text: 'Drive to the ~start line~ on Coral Boulevard' },
      { type: 'race', time: 100, text: 'Race through the ~checkpoints~', checkpoints: [
        [n(10), 260], [n(10), 450], [n(10), 640], [n(10), n(9)], [n(8), n(9)], [n(6), n(9)],
        [n(6), n(7)], [n(6), n(5)], [n(6), n(4)], [n(8), n(4)], [n(10), n(4)],
      ] },
      { type: 'say', lines: [['TEO', 'Dario is crying into his energy drink! Kroll sleeps at the tower now. Top floor.']] },
    ],
  },
  {
    id: 'finale',
    title: "Kroll's Last Sunset",
    giver: 'cantina',
    npc: 'mari',
    reward: 20000,
    intro: [
      ['MARI', 'The ledger hit the papers this morning. Half of PKPD is suspended.'],
      ['MARI', "Kroll's holed up at his tower with what's left of the Syndicate, shredding everything."],
      ['NICO', "Then I'll get there before the shredder does."],
    ],
    give: { weapon: 3, ammo: 30 },
    steps: [
      { type: 'goto', place: 'krollTower', radius: 18, text: 'Go to ~Kroll Tower~' },
      { type: 'eliminate', text: 'Take out ~Victor Kroll~ and his guards', spawns: [
        { x: 459, z: 382, weapon: 2 }, { x: 459, z: 410, weapon: 1 }, { x: 459, z: 430, weapon: 3 },
        { x: 475, z: 370, weapon: 2 }, { x: 505, z: 370, weapon: 1 }, { x: 490, z: 438, weapon: 2 },
        { x: 470, z: 438, weapon: 4, role: 'boss' },
      ] },
      { type: 'say', lines: [['KROLL', 'You think this town changes because one man falls?'], ['NICO', 'No. But it changes tonight.']] },
      { type: 'wanted', stars: 4, text: '~Escape~ the police' },
      { type: 'goto', place: 'cantina', radius: 6, text: "Return to ~Mari's Cantina~" },
      { type: 'talk', lines: [
        ['MARI', "It's over, Nico."],
        ['NICO', "In this town? It's never over. But tonight the sun is ours."],
      ] },
    ],
  },
];
