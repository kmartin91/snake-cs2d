import { CONFIG, DT, ZONE } from './config.js';
import { pick } from './utils.js';

export const MODES = {
  tdm: { label: 'Match à mort' },
  classic: { label: 'Classique' },
  gungame: { label: 'Course à l\'armement' }
};

export const LADDER = [
  { w: 'pistol', kills: 2 },
  { w: 'smg', kills: 2 },
  { w: 'shotgun', kills: 2 },
  { w: 'rifle', kills: 2 },
  { w: 'sniper', kills: 2 },
  { w: 'golden', kills: 1 }
];

export const CLASSIC = {
  freeze: 4,
  roundTime: 75,
  bombTime: 40,
  plantTime: 3,
  defuseTime: 6,
  roundOver: 4,
  bombRadius: 6,
  defuseRange: 1.2
};

export function freshBomb() {
  return { state: 'none', x: 0, y: 0, carrier: null, timer: 0, plant: 0, planter: null, defuse: 0, defuser: null, site: null };
}

export function gunGameKill(killer) {
  killer.tierKills += 1;
  if (killer.tierKills < LADDER[killer.tier].kills) return;
  killer.tier += 1;
  killer.tierKills = 0;
  if (killer.tier >= LADDER.length) {
    this.endMatch(killer.team, killer.id);
    return;
  }
  this.giveWeapon(killer, LADDER[killer.tier].w);
  this.emit('tierup', { id: killer.id, tier: killer.tier, w: killer.weapon });
}

export function siteAt(x, y) {
  const i = Math.round(y) * this.map.width + Math.round(x);
  const z = this.map.zone[i];
  return z === ZONE.A ? 'A' : z === ZONE.B ? 'B' : null;
}

export function startRound() {
  if (this.swapPending) {
    this.swapPending = false;
    this.halftimeDone = true;
    for (const p of this.players.values()) {
      p.team = p.team === 'T' ? 'CT' : 'T';
      p.alive = false;
    }
    this.emit('halftime');
  }
  this.round += 1;
  this.bullets = [];
  this.grenades = [];
  this.smokes = [];
  this.loot = [];
  for (let i = 0; i < Math.ceil(CONFIG.lootMax / 2); i += 1) this.spawnLoot();
  this.bomb = freshBomb();
  for (const p of this.players.values()) this.spawn(p, p.alive);
  const ts = [...this.players.values()].filter((p) => p.team === 'T' && p.alive);
  const humans = ts.filter((p) => !p.bot);
  const carrier = pick(humans.length ? humans : ts);
  if (carrier) {
    carrier.hasBomb = true;
    this.bomb.state = 'carried';
    this.bomb.carrier = carrier.id;
  }
  this.plan = Math.random() < 0.5 ? 'A' : 'B';
  let i = 0;
  for (const p of this.players.values()) {
    if (!p.bot) continue;
    p.ai.site = p.team === 'CT' ? (i++ % 2 === 0 ? 'A' : 'B') : this.plan;
    p.ai.siteCell = null;
  }
  this.phase = 'countdown';
  this.time = CLASSIC.freeze;
  this.emit('round', { round: this.round });
}

export function endRound(winner, reason) {
  if (this.phase !== 'live' && this.phase !== 'planted') return;
  this.phase = 'roundover';
  this.time = CLASSIC.roundOver;
  this.score[winner] += 1;
  this.emit('roundend', { winner, reason });
  const goal = this.opts.roundsToWin;
  if (this.score[winner] >= goal) this.matchWinner = winner;
  else if (!this.halftimeDone && this.score.T + this.score.CT === goal - 1) this.swapPending = true;
}

export function actingOf(p) {
  if (!p.alive || !p.actionHeld) return null;
  const b = this.bomb;
  if (this.phase === 'live' && p.hasBomb && this.siteAt(p.x, p.y)) return 'plant';
  if (this.phase === 'planted' && p.team === 'CT' && b.state === 'planted' && Math.hypot(p.x - b.x, p.y - b.y) <= CLASSIC.defuseRange) {
    return 'defuse';
  }
  return null;
}

export function interruptAction(p) {
  const b = this.bomb;
  if (p.acting === 'plant' && b.plant > 0) {
    b.plant = 0;
    this.emit('interrupt', { id: p.id });
  }
  if (p.acting === 'defuse' && b.defuse > 0) {
    b.defuse = 0;
    this.emit('interrupt', { id: p.id });
  }
}

export function dropBomb(p) {
  if (!p.hasBomb) return;
  p.hasBomb = false;
  const b = this.bomb;
  b.state = 'ground';
  b.x = p.x;
  b.y = p.y;
  b.carrier = null;
  b.plant = 0;
  this.emit('bombdrop', { x: p.x, y: p.y });
}

export function classicTick(alive) {
  const b = this.bomb;
  if (b.state === 'carried') {
    const c = this.players.get(b.carrier);
    if (c && c.alive) {
      b.x = c.x;
      b.y = c.y;
    }
  }
  if (b.state === 'ground') {
    const picker = alive.find((p) => p.alive && p.team === 'T' && Math.hypot(p.x - b.x, p.y - b.y) <= 0.8);
    if (picker) {
      picker.hasBomb = true;
      b.state = 'carried';
      b.carrier = picker.id;
      this.emit('bombpick', { id: picker.id });
    }
  }
  if (this.phase === 'live') {
    const planter = alive.find((p) => p.alive && p.acting === 'plant');
    if (planter) {
      if (b.planter !== planter.id) {
        b.planter = planter.id;
        b.plant = 0;
        this.emit('plantstart', { id: planter.id });
      }
      b.plant += DT;
      if (b.plant >= CLASSIC.plantTime) {
        planter.hasBomb = false;
        b.state = 'planted';
        b.x = planter.x;
        b.y = planter.y;
        b.site = this.siteAt(planter.x, planter.y);
        b.carrier = null;
        b.timer = CLASSIC.bombTime;
        b.defuse = 0;
        b.defuser = null;
        this.phase = 'planted';
        this.emit('planted', { id: planter.id, site: b.site, x: b.x, y: b.y });
      }
    } else {
      b.plant = 0;
      b.planter = null;
    }
  }
  if (b.state === 'planted') {
    if (this.phase === 'planted') {
      const defuser = alive.find((p) => p.alive && p.acting === 'defuse');
      if (defuser) {
        if (b.defuser !== defuser.id) {
          b.defuser = defuser.id;
          b.defuse = 0;
          this.emit('defusestart', { id: defuser.id });
        }
        b.defuse += DT;
        if (b.defuse >= CLASSIC.defuseTime) {
          b.state = 'defused';
          this.emit('defused', { id: defuser.id });
          this.endRound('CT', 'defuse');
          return;
        }
      } else {
        b.defuse = 0;
        b.defuser = null;
      }
    }
    b.timer -= DT;
    if (b.timer <= 0) {
      b.state = 'exploded';
      this.emit('explode', { x: b.x, y: b.y });
      for (const p of alive) {
        if (p.alive && Math.hypot(p.x - b.x, p.y - b.y) <= CLASSIC.bombRadius) this.kill(p, null, 'bomb');
      }
      this.endRound('T', 'bomb');
      return;
    }
  }
  if (this.phase !== 'live' && this.phase !== 'planted') return;
  let t = 0;
  let ct = 0;
  for (const p of this.players.values()) {
    if (!p.alive) continue;
    if (p.team === 'T') t += 1;
    else ct += 1;
  }
  if (ct === 0) this.endRound('T', 'elim');
  else if (t === 0 && this.phase === 'live') this.endRound('CT', 'elim');
}

export function eloExpected(a, b) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}
