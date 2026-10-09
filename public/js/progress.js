import { SKINS } from '../shared/skins.js';
import { store } from './audio.js';

export const RANKS = [
  ['Silver I', 'S1'],
  ['Silver II', 'S2'],
  ['Silver III', 'S3'],
  ['Silver IV', 'S4'],
  ['Silver Elite', 'SE'],
  ['Silver Elite Master', 'SEM'],
  ['Gold Nova I', 'GN1'],
  ['Gold Nova II', 'GN2'],
  ['Gold Nova III', 'GN3'],
  ['Gold Nova Master', 'GNM'],
  ['Master Guardian I', 'MG1'],
  ['Master Guardian II', 'MG2'],
  ['Master Guardian Elite', 'MGE'],
  ['Distinguished Master Guardian', 'DMG'],
  ['Legendary Eagle', 'LE'],
  ['Legendary Eagle Master', 'LEM'],
  ['Supreme Master First Class', 'SMFC'],
  ['The Global Elite', 'GE']
];

const TIER_COLORS = ['#aeb6bf', '#e8c15a', '#4aa3ff', '#b07cff', '#ff9a3c', '#ff4b3a'];

const CHALLENGES = [
  { id: 'kills', stat: 'kills', goal: 12, xp: 60, label: 'Élimine 12 leaders' },
  { id: 'downs', stat: 'downs', goal: 40, xp: 50, label: 'Abats 40 soldats ennemis' },
  { id: 'recruits', stat: 'recruits', goal: 25, xp: 40, label: 'Recrute 25 soldats' },
  { id: 'golden', stat: 'golden', goal: 1, xp: 60, label: 'Ramasse le Deagle d\'or' },
  { id: 'sniper', stat: 'sniperKills', goal: 3, xp: 70, label: 'Fais 3 kills à l\'AWP' },
  { id: 'shotgun', stat: 'shotgunKills', goal: 4, xp: 60, label: 'Fais 4 kills au pompe' },
  { id: 'he', stat: 'heKills', goal: 1, xp: 60, label: 'Tue un leader à la HE' },
  { id: 'multi', stat: 'multiKills', goal: 1, xp: 50, label: 'Fais un double kill' },
  { id: 'squad', stat: 'bigSquad', goal: 1, xp: 50, label: 'Atteins une escouade de 10' },
  { id: 'match', stat: 'matchesWon', goal: 1, xp: 100, label: 'Gagne un match' },
  { id: 'heal', stat: 'heals', goal: 5, xp: 30, label: 'Ramasse 5 soins' }
];

const STREAK_NAMES = { 2: 'Double kill', 3: 'Triple kill', 4: 'Quadra kill', 5: 'Penta kill' };

export const SOLO_XP = { easy: 0.7, normal: 1, hard: 1.4 };
export const ONLINE_XP = 1.2;

export const xpToNext = (level) => 80 + (level - 1) * 30;
export const rankOf = (level) => Math.min(RANKS.length - 1, Math.floor((level - 1) / 2));
export const rankName = (level) => RANKS[rankOf(level)][0];
export const rankShort = (level) => RANKS[rankOf(level)][1];
export const rankColor = (level) => {
  const r = rankOf(level);
  return TIER_COLORS[r < 6 ? 0 : r < 10 ? 1 : r < 14 ? 2 : r < 16 ? 3 : r < 17 ? 4 : 5];
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function badgeHtml(level, cls = '') {
  return `<span class="rank-badge ${cls}" style="--rc:${rankColor(level)}">${rankShort(level)}</span>`;
}

export function dailiesHtml(list) {
  return list
    .map(
      (d) => `<li class="${d.done ? 'done' : ''}"><span>${d.done ? '✓ ' : ''}${esc(d.label)}</span><b>+${d.xp} XP</b>
        <span class="xpbar"><i style="width:${Math.round((100 * d.count) / d.goal)}%"></i></span></li>`
    )
    .join('');
}

const today = () => new Date().toISOString().slice(0, 10);

function dailyIds(date) {
  let seed = [...date].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const pool = CHALLENGES.map((c) => c.id);
  const out = [];
  while (out.length < 3) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const id = pool.splice(seed % pool.length, 1)[0];
    out.push(id);
  }
  return out;
}

function defaults() {
  return {
    level: 1,
    xp: 0,
    total: 0,
    skin: 'classic',
    streak: 0,
    bestStreak: 0,
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0, downs: 0, bestKills: 0 },
    daily: { date: '', ids: [], counts: {}, done: [] }
  };
}

export class Progress {
  constructor() {
    const saved = store.get('scs-progress', null);
    const base = defaults();
    this.s = saved ? { ...base, ...saved, stats: { ...base.stats, ...saved.stats }, daily: { ...base.daily, ...saved.daily } } : base;
    this.mult = 1;
    this.onGain = null;
    this.resetMatch();
    this.ensureDaily();
  }

  save() {
    store.set('scs-progress', this.s);
  }

  ensureDaily() {
    const date = today();
    const ids = this.s.daily.ids || [];
    const valid = ids.length === 3 && ids.every((id) => CHALLENGES.some((c) => c.id === id));
    if (this.s.daily.date === date && valid) return;
    this.s.daily = { date, ids: dailyIds(date), counts: {}, done: [] };
    this.save();
  }

  dailies() {
    this.ensureDaily();
    return this.s.daily.ids.map((id) => {
      const ch = CHALLENGES.find((c) => c.id === id);
      return { ...ch, count: Math.min(ch.goal, this.s.daily.counts[ch.stat] || 0), done: this.s.daily.done.includes(id) };
    });
  }

  resetMatch() {
    this.match = { xp: 0, lines: new Map(), kills: 0, startLevel: this.s.level, startXp: this.s.xp };
  }

  setMultiplier(mult) {
    this.mult = mult;
  }

  unlocked(skinId) {
    const skin = SKINS.find((s) => s.id === skinId);
    return Boolean(skin) && skin.level <= this.s.level;
  }

  nextUnlock() {
    return SKINS.find((s) => s.level > this.s.level) || null;
  }

  setSkin(id) {
    if (!this.unlocked(id)) return false;
    this.s.skin = id;
    this.save();
    return true;
  }

  gain(base, label, scaled = true) {
    const amount = Math.max(1, Math.round(base * (scaled ? this.mult : 1)));
    this.s.xp += amount;
    this.s.total += amount;
    this.match.xp += amount;
    this.match.lines.set(label, (this.match.lines.get(label) || 0) + amount);
    const levelUps = [];
    while (this.s.xp >= xpToNext(this.s.level)) {
      this.s.xp -= xpToNext(this.s.level);
      this.s.level += 1;
      levelUps.push(this.s.level);
    }
    const unlocks = SKINS.filter((sk) => levelUps.includes(sk.level));
    this.save();
    if (this.onGain) this.onGain({ amount, label, levelUps, unlocks });
  }

  bump(stat, n = 1) {
    this.ensureDaily();
    const d = this.s.daily;
    d.counts[stat] = (d.counts[stat] || 0) + n;
    for (const id of d.ids) {
      const ch = CHALLENGES.find((c) => c.id === id);
      if (ch.stat !== stat || d.done.includes(id) || d.counts[stat] < ch.goal) continue;
      d.done.push(id);
      this.gain(ch.xp, `Défi : ${ch.label}`, false);
    }
    this.save();
  }

  handleEvent(ev, snap, selfId) {
    if (snap.ph === 'warmup' && ev.type !== 'matchstart') return;
    const self = snap.p.find((p) => p.id === selfId);
    const st = this.s.stats;
    switch (ev.type) {
      case 'matchstart':
        this.resetMatch();
        break;
      case 'kill':
        if (ev.victim === selfId) st.deaths += 1;
        if (ev.killer !== selfId) break;
        st.kills += 1;
        this.match.kills += 1;
        this.gain(10, 'Éliminations');
        this.bump('kills');
        if (ev.how === 'sniper') this.bump('sniperKills');
        if (ev.how === 'shotgun') this.bump('shotgunKills');
        if (ev.how === 'he') this.bump('heKills');
        if (ev.streak >= 2) {
          this.gain(5 * ev.streak, STREAK_NAMES[Math.min(5, ev.streak)]);
          if (ev.streak === 2) this.bump('multiKills');
        }
        break;
      case 'down':
        if (ev.by !== selfId) break;
        st.downs = (st.downs || 0) + 1;
        this.gain(2, 'Soldats abattus');
        this.bump('downs');
        break;
      case 'pickup':
        if (ev.id !== selfId) break;
        if (ev.k === 'recruit' || ev.k === 'tag') {
          this.bump('recruits');
          if (self && self.s.length / 2 >= 10 && !this.match.bigSquad) {
            this.match.bigSquad = true;
            this.bump('bigSquad');
          }
        }
        if (ev.k === 'medkit') this.bump('heals');
        if (ev.k === 'golden') {
          this.gain(15, 'Deagle d\'or');
          this.bump('golden');
        }
        break;
      case 'matchend': {
        st.matches += 1;
        st.bestKills = Math.max(st.bestKills, this.match.kills);
        this.gain(20, 'Match joué');
        if (self && self.tm === ev.winner) {
          st.wins += 1;
          this.s.streak += 1;
          this.s.bestStreak = Math.max(this.s.bestStreak, this.s.streak);
          const bonus = 1 + Math.min(1, 0.25 * (this.s.streak - 1));
          this.gain(60 * bonus, this.s.streak > 1 ? `Victoire (série ×${this.s.streak})` : 'Victoire');
          this.bump('matchesWon');
        } else if (ev.winner !== 'draw') {
          this.s.streak = 0;
        }
        this.save();
        break;
      }
      default:
    }
  }

}
