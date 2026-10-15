import fs from 'node:fs';
import path from 'node:path';
import { eloExpected } from '../public/shared/modes.js';

const FILE = process.env.ELO_FILE || path.join(process.cwd(), 'data', 'elo.json');
const K = 32;
export const BOT_RATING = 1000;

export class EloStore {
  constructor() {
    this.players = new Map();
    this.timer = null;
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const [token, entry] of Object.entries(raw)) this.players.set(token, entry);
    } catch {}
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(this.players)));
      } catch (err) {
        console.error('ELO: sauvegarde impossible', err.message);
      }
    }, 1000);
  }

  get(token, name) {
    let entry = this.players.get(token);
    if (!entry) {
      entry = { name: name || 'Joueur', rating: 1000, games: 0, wins: 0 };
      this.players.set(token, entry);
    }
    if (name) entry.name = name;
    return entry;
  }

  rank(token) {
    const entry = this.players.get(token);
    if (!entry || !entry.games) return null;
    return [...this.players.values()].filter((p) => p.games > 0 && p.rating > entry.rating).length + 1;
  }

  top(n = 15) {
    return [...this.players.values()]
      .filter((p) => p.games > 0)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, n)
      .map(({ name, rating, games, wins }) => ({ name, rating, games, wins }));
  }

  applyMatch(sides, winner) {
    const avg = (side) => {
      const ratings = side.humans.map((h) => this.get(h.token, h.name).rating);
      for (let i = 0; i < side.bots; i += 1) ratings.push(BOT_RATING);
      return ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : BOT_RATING;
    };
    const rating = { T: avg(sides.T), CT: avg(sides.CT) };
    const results = new Map();
    for (const team of ['T', 'CT']) {
      const other = team === 'T' ? 'CT' : 'T';
      const expected = eloExpected(rating[team], rating[other]);
      const score = winner === 'draw' ? 0.5 : winner === team ? 1 : 0;
      const delta = Math.round(K * (score - expected));
      for (const h of sides[team].humans) {
        const entry = this.get(h.token, h.name);
        const before = entry.rating;
        entry.rating = Math.max(100, before + delta);
        entry.games += 1;
        if (score === 1) entry.wins += 1;
        results.set(h.token, { before, after: entry.rating, delta: entry.rating - before });
      }
    }
    this.save();
    return results;
  }
}
