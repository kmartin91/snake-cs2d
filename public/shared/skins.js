export const SKINS = [
  { id: 'classic', name: 'Classique', level: 1 },
  { id: 'tiger', name: 'Tigre', level: 2, body: '#f29a2e', stripe: '#2a1606', dash: [0.22, 0.3], width: 0.3 },
  { id: 'jungle', name: 'Jungle', level: 3, body: '#5d7a3a', stripe: '#c9b46a', dash: [0.5, 0.45] },
  { id: 'neon', name: 'Néon', level: 5, body: '#16122a', stripe: '#39f5ff', dash: [1, 0], width: 0.16, glow: 'rgba(57,245,255,0.35)' },
  { id: 'asiimov', name: 'Asiimov', level: 7, body: '#f4f4f0', stripe: '#ff6a13', dash: [0.6, 0.4], width: 0.28 },
  { id: 'fade', name: 'Fade', level: 9, gradient: ['#ff4fa3', '#a259ff', '#ffd23f'], stripe: 'rgba(255,255,255,0.55)', dash: [0.15, 0.85] },
  { id: 'hyper', name: 'Hyper Beast', level: 12, gradient: ['#3cff7a', '#ff3bd4', '#3b7bff', '#ffe23b'], stripe: '#111', dash: [0.15, 0.85] },
  { id: 'lore', name: 'Dragon Lore', level: 15, body: '#c9a24a', stripe: '#3c6b2f', dash: [0.4, 0.3], glow: 'rgba(255,210,122,0.3)' },
  { id: 'doppler', name: 'Doppler', level: 19, gradient: ['#1b1464', '#ff2d95', '#1b1464'], stripe: '#ffffff', dash: [0.08, 0.6] },
  { id: 'gold', name: 'Karambit Or', level: 24, body: '#ffcf3f', stripe: '#fff6c9', dash: [0.2, 0.5], glow: 'rgba(255,210,94,0.4)' },
  { id: 'rainbow', name: 'Arc-en-ciel', level: 30, rainbow: true, stripe: 'rgba(255,255,255,0.6)', dash: [0.2, 0.8] }
];

export const SKIN_IDS = new Set(SKINS.map((s) => s.id));

export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
