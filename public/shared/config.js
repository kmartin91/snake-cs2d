export const TICK_MS = 170;

export const DURATIONS = {
  freeze: 5,
  warmupRespawn: 2,
  round: 60,
  bomb: 15,
  plant: 1.5,
  defuse: 10,
  defuseKit: 5,
  result: 4.5,
  matchOver: 11,
  flash: 3.2,
  smoke: 12
};

export function timings(tickMs = TICK_MS) {
  const out = {};
  for (const [key, sec] of Object.entries(DURATIONS)) out[key] = Math.max(1, Math.round((sec * 1000) / tickMs));
  return out;
}

export const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
];

export const CONFIG = {
  startLength: 7,
  winRounds: 5,
  fireCooldown: 4,
  minFireLength: 3,
  bulletSpeed: 3,
  bulletRange: 22,
  staminaMax: 100,
  boostCost: 5,
  boostRestart: 25,
  staminaRegen: 1.25,
  grenadeSpeed: 2,
  grenadeRange: 9,
  heRadius: 2.7,
  flashRadius: 7.5,
  smokeRadius: 3.3,
  bombRadius: 7.5,
  crateGrow: 2,
  maxPellets: 220,
  money: { start: 800, max: 16000, win: 3250, loss: 1900, kill: 300, plant: 300, defuse: 300 }
};

export const SHOP = [
  { id: 'armor', label: 'Kevlar + casque', price: 650, desc: 'Encaisse un headshot ou une HE' },
  { id: 'he', label: 'Grenade HE', price: 300, desc: 'Découpe tout dans la zone (G)' },
  { id: 'flash', label: 'Flashbang', price: 200, desc: 'Aveugle les ennemis (F)' },
  { id: 'smoke', label: 'Fumigène', price: 300, desc: 'Bloque la vue 12 s (C)' },
  { id: 'ext', label: 'Chargeur étendu', price: 400, desc: '+5 segments pour ce round' },
  { id: 'kit', label: 'Kit de désamorçage', price: 400, desc: 'Désamorce 2x plus vite', team: 'CT' }
];

export const DIFFICULTY = {
  easy: { reaction: 6, fire: 0.3, aim: 0.12, chase: 0.25, mistake: 0.04, boost: 0.25, nade: 0.03 },
  normal: { reaction: 3, fire: 0.55, aim: 0.35, chase: 0.5, mistake: 0.012, boost: 0.6, nade: 0.06 },
  hard: { reaction: 1, fire: 0.9, aim: 0.7, chase: 0.7, mistake: 0, boost: 0.9, nade: 0.1 }
};

export const ZONE = { NONE: 0, A: 1, B: 2, T: 3, CT: 4 };

export const SPAWNS = {
  T: [
    { x: 3, y: 11, d: 0 },
    { x: 4, y: 18, d: 2 },
    { x: 5, y: 11, d: 0 },
    { x: 6, y: 18, d: 2 },
    { x: 7, y: 11, d: 0 }
  ],
  CT: [
    { x: 44, y: 11, d: 0 },
    { x: 43, y: 18, d: 2 },
    { x: 42, y: 11, d: 0 },
    { x: 41, y: 18, d: 2 },
    { x: 40, y: 11, d: 0 }
  ]
};

export const T_ROUTES = {
  A: [{ x: 20, y: 2 }, { x: 26, y: 14 }],
  B: [{ x: 20, y: 26 }, { x: 26, y: 15 }]
};

export const BOT_NAMES = [
  'Albert', 'Bert', 'Cecil', 'Crusher', 'Elmer', 'Eugene', 'Fergus', 'Frasier', 'Gus', 'Harvey',
  'Irwin', 'Lester', 'Marvin', 'Niles', 'Opie', 'Quinn', 'Rock', 'Shark', 'Ulric', 'Vinny',
  'Waldo', 'Wolf', 'Yanni', 'Yogi', 'Zach', 'Gérard', 'Michel', 'Jean-Kévin', 'Bernard', 'Josiane'
];

export const BOT_LINES = {
  kill: ['ez', 'boom headshot', 'trop facile', 'nice', 'next', '1 tap', 'tu sors', 'gg ez', 'cheh'],
  death: ['lag', 'wtf ??', 'nooon', 'il campe là', 'jsuis aveugle', 'ff', 'hacker', 'mon clavier a buggé', 'sérieux ?'],
  plant: ['bombe posée, on tient !', 'C4 down', 'plant ok, défendez'],
  win: ['gg', 'ez round', 'let\'s gooo', 'trop forts'],
  start: ['rush B', 'rush B cyka', 'on tient A', 'go go go', 'je lurk', 'eco ?', 'full buy']
};
