export const TICK_MS = 50;
export const DT = TICK_MS / 1000;

export const CONFIG = {
  speed: 4,
  turnRate: 9,
  leaderRadius: 0.38,
  soldierRadius: 0.36,
  leaderHitRadius: 0.48,
  assistCone: 0.16,
  assistConeStick: 0.32,
  assistRadius: 2.2,
  spacing: 0.8,
  startFollowers: 2,
  maxFollowers: 12,
  leaderHp: 100,
  followerHp: 35,
  followerDamage: 0.5,
  followerRate: 0.5,
  firingFollowers: 5,
  spawnShield: 1.5,
  respawn: 3,
  matchTime: 240,
  matchOver: 10,
  countdown: 3,
  scoreToWin: 25,
  visionLeader: 8,
  visionFollower: 3.5,
  hearRadius: 11,
  lootMax: 9,
  lootEvery: 3,
  goldenEvery: 40,
  medkitHeal: 45,
  tagChance: 0.4,
  grenadeSpeed: 10,
  grenadeRange: 9,
  heRadius: 2.8,
  heDamage: 80,
  flashRadius: 7,
  flashTime: 2.6,
  smokeRadius: 3.3,
  smokeTime: 14
};

export const WEAPONS = {
  pistol: { name: 'Pistolet', dmg: 20, rate: 3.2, spread: 0.05, speed: 24, range: 14, mag: 12, reload: 1.1, pellets: 1, color: '#d6dde2' },
  smg: { name: 'SMG', dmg: 13, rate: 8.5, spread: 0.13, speed: 24, range: 10, mag: 30, reload: 1.7, pellets: 1, color: '#7dd3fc' },
  rifle: { name: 'AK-47', dmg: 24, rate: 5.5, spread: 0.07, speed: 28, range: 17, mag: 25, reload: 2.1, pellets: 1, color: '#f59e0b' },
  shotgun: { name: 'Pompe', dmg: 12, rate: 1.3, spread: 0.3, speed: 22, range: 6.5, mag: 6, reload: 2.2, pellets: 6, color: '#ef4444' },
  sniper: { name: 'AWP', dmg: 95, rate: 0.75, spread: 0.004, speed: 46, range: 30, mag: 5, reload: 2.6, pellets: 1, color: '#a78bfa' },
  golden: { name: 'Deagle d\'or', dmg: 55, rate: 2.6, spread: 0.02, speed: 34, range: 20, mag: 9, reload: 1.1, pellets: 1, color: '#ffd25e' }
};

export const LOOT = {
  recruit: { label: 'Recrue', weight: 5 },
  medkit: { label: 'Soin', weight: 3 },
  weapon: { label: 'Arme', weight: 3 },
  he: { label: 'Grenade HE', weight: 1 },
  flash: { label: 'Flashbang', weight: 1 },
  smoke: { label: 'Fumigène', weight: 1 }
};

export const LOOT_WEAPONS = ['smg', 'rifle', 'shotgun', 'sniper'];

export const DIFFICULTY = {
  easy: { reaction: 0.9, fire: 0.55, spread: 0.38, lead: 0, aggro: 0.35, focus: 0.2 },
  normal: { reaction: 0.55, fire: 0.75, spread: 0.26, lead: 0.3, aggro: 0.55, focus: 0.4 },
  hard: { reaction: 0.3, fire: 0.95, spread: 0.13, lead: 0.7, aggro: 0.75, focus: 0.7 }
};

export const ZONE = { NONE: 0, A: 1, B: 2, T: 3, CT: 4 };

export const BOT_NAMES = [
  'Albert', 'Bert', 'Cecil', 'Crusher', 'Elmer', 'Eugene', 'Fergus', 'Frasier', 'Gus', 'Harvey',
  'Irwin', 'Lester', 'Marvin', 'Niles', 'Opie', 'Quinn', 'Rock', 'Shark', 'Ulric', 'Vinny',
  'Waldo', 'Wolf', 'Yanni', 'Yogi', 'Zach', 'Gérard', 'Michel', 'Jean-Kévin', 'Bernard', 'Josiane'
];

export const BOT_LINES = {
  kill: ['ez', 'trop facile', 'nice', 'next', 'tu sors', 'gg ez', 'cheh', 'mon escouade te salue'],
  death: ['lag', 'wtf ??', 'nooon', 'il campe là', 'jsuis aveugle', 'ff', 'hacker', 'sérieux ?', 'mes soldats m\'ont lâché'],
  golden: ['le gold est à moi', 'DEAGLE D\'OR LETS GO', 'personne touche au gold'],
  start: ['go go go', 'je prends le centre', 'on fonce', 'qui va au gold ?', 'je lurk']
};
