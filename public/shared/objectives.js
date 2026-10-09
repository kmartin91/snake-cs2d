import { CONFIG } from './config.js';
import { cheb, dist } from './utils.js';

export function actingOf(p) {
  if (!p.alive || !p.actionHeld) return null;
  const h = p.snake[0];
  if (this.phase === 'live' && p.team === 'T' && p.hasBomb && this.siteAt(h.x, h.y)) return 'plant';
  if (
    this.phase === 'planted' &&
    p.team === 'CT' &&
    this.bomb.state === 'planted' &&
    cheb(h, this.bomb) <= 1
  ) {
    return 'defuse';
  }
  return null;
}

export function interrupt(p) {
  const b = this.bomb;
  if (b.defuser === p.id && b.defuseProgress > 0) {
    b.defuseProgress = 0;
    this.emit('interrupt', { id: p.id });
  }
  if (b.planter === p.id && b.plantProgress > 0 && b.state === 'carried') {
    b.plantProgress = 0;
    this.emit('interrupt', { id: p.id });
  }
}

export function dropBomb(pos) {
  const b = this.bomb;
  b.state = 'ground';
  b.x = pos.x;
  b.y = pos.y;
  b.carrier = null;
  b.plantProgress = 0;
  b.planter = null;
  this.emit('bombdrop', { x: pos.x, y: pos.y });
}

export function updateObjectives(alive) {
  const b = this.bomb;
  if (b.state === 'carried') {
    const c = this.players.get(b.carrier);
    if (c && c.alive && c.snake[0]) {
      b.x = c.snake[0].x;
      b.y = c.snake[0].y;
    }
  }

  if (this.phase === 'live') {
    const planter = alive.find((p) => p.alive && p.acting === 'plant');
    if (planter) {
      if (b.planter !== planter.id) {
        b.planter = planter.id;
        b.plantProgress = 0;
        this.emit('plantstart', { id: planter.id });
      }
      b.plantProgress += 1;
      if (b.plantProgress >= this.T.plant) this.plant(planter);
    } else {
      b.plantProgress = 0;
      b.planter = null;
    }
  }

  if (b.state !== 'planted') return;

  if (this.phase === 'planted') {
    let defuser = b.defuser ? this.players.get(b.defuser) : null;
    if (!defuser || !defuser.alive || defuser.acting !== 'defuse') {
      defuser = alive.find((p) => p.alive && p.acting === 'defuse') || null;
    }
    if (defuser) {
      if (b.defuser !== defuser.id) {
        b.defuser = defuser.id;
        b.defuseProgress = 0;
        this.emit('defusestart', { id: defuser.id, kit: defuser.kit });
      }
      b.defuseProgress += 1;
      const need = defuser.kit ? this.T.defuseKit : this.T.defuse;
      if (b.defuseProgress >= need) {
        this.defuse(defuser);
        return;
      }
    } else {
      b.defuser = null;
      b.defuseProgress = 0;
    }
  }

  b.timer -= 1;
  if (b.timer <= 0) this.explode(alive);
}

export function plant(p) {
  const b = this.bomb;
  const h = p.snake[0];
  b.state = 'planted';
  b.x = h.x;
  b.y = h.y;
  b.site = this.siteAt(h.x, h.y);
  b.carrier = null;
  b.timer = this.T.bomb;
  b.defuser = null;
  b.defuseProgress = 0;
  b.planter = p.id;
  p.hasBomb = false;
  p.money = Math.min(CONFIG.money.max, p.money + CONFIG.money.plant);
  this.phase = 'planted';
  this.emit('planted', { id: p.id, site: b.site, x: h.x, y: h.y });
  if (p.bot) this.botChat(p, 'plant', 0.4);
}

export function defuse(p) {
  const b = this.bomb;
  b.state = 'defused';
  p.money = Math.min(CONFIG.money.max, p.money + CONFIG.money.defuse);
  this.emit('defused', { id: p.id });
  this.endRound('CT', 'defuse');
}

export function explode(alive) {
  const b = this.bomb;
  b.state = 'exploded';
  this.emit('explode', { x: b.x, y: b.y });
  for (const p of alive) {
    if (!p.alive) continue;
    if (dist(p.snake[0], b) <= CONFIG.bombRadius) this.kill(p, null, 'bomb');
  }
  if (this.phase === 'planted') this.endRound('T', 'bomb');
}

export function checkWin() {
  let tAlive = 0;
  let ctAlive = 0;
  for (const p of this.players.values()) {
    if (!p.alive) continue;
    if (p.team === 'T') tAlive += 1;
    else ctAlive += 1;
  }
  if (this.phase === 'live') {
    if (tAlive === 0) this.endRound('CT', 'elim');
    else if (ctAlive === 0) this.endRound('T', 'elim');
  } else if (this.phase === 'planted' && ctAlive === 0) {
    this.endRound('T', 'elim');
  }
}
