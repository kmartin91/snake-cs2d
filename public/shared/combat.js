import { DIRS, CONFIG } from './config.js';
import { dist, enemyOf } from './utils.js';

export function fire(p) {
  const h = p.snake[0];
  this.bullets.push({
    id: this.uid++,
    owner: p.id,
    team: p.team,
    x: h.x,
    y: h.y,
    px: h.x,
    py: h.y,
    dir: p.dir,
    range: CONFIG.bulletRange,
    fresh: true,
    done: false
  });
  p.fireCd = CONFIG.fireCooldown;
  if (p.growBy > 0) p.growBy -= 1;
  else p.snake.pop();
  this.emit('shot', { id: p.id, x: h.x, y: h.y, d: p.dir });
}

export function hitPlayer(victim, seg, shooter, how) {
  this.interrupt(victim);
  if (seg === 0) {
    if (victim.armor) {
      victim.armor = false;
      const h = victim.snake[0];
      this.emit('armor', { id: victim.id, by: shooter ? shooter.id : null, x: h.x, y: h.y });
      return;
    }
    this.kill(victim, shooter, how === 'bullet' ? 'headshot' : how);
    return;
  }
  this.cut(victim, seg, shooter, how === 'bullet' ? 'cut' : how);
}

export function updateBullets(alive) {
  this.bullets = this.bullets.filter((b) => !b.done);
  if (!this.bullets.length) return;
  this.buildOcc(alive);

  const tryHit = (b) => {
    const hit = this.occAt(b.x, b.y, enemyOf(b.team));
    if (!hit) return false;
    const shooter = this.players.get(b.owner) || null;
    this.hitPlayer(hit.p, hit.seg, shooter, 'bullet');
    this.buildOcc(alive);
    b.done = true;
    return true;
  };

  for (const b of this.bullets) {
    b.px = b.x;
    b.py = b.y;
    if (!b.fresh && tryHit(b)) continue;
    b.fresh = false;
    const D = DIRS[b.dir];
    for (let s = 0; s < CONFIG.bulletSpeed && !b.done; s += 1) {
      const nx = b.x + D.x;
      const ny = b.y + D.y;
      if (this.isWall(nx, ny)) {
        b.done = true;
        this.emit('impact', { x: b.x + D.x * 0.5, y: b.y + D.y * 0.5 });
        break;
      }
      b.x = nx;
      b.y = ny;
      b.range -= 1;
      if (tryHit(b)) break;
      if (b.range <= 0) b.done = true;
    }
  }
}

export function throwGrenade(p, type) {
  if (!p.alive || p[type] < 1) return;
  if (this.phase === 'freeze' || this.phase === 'matchover') return;
  p[type] -= 1;
  const h = p.snake[0];
  this.grenades.push({
    id: this.uid++,
    type,
    owner: p.id,
    team: p.team,
    x: h.x,
    y: h.y,
    px: h.x,
    py: h.y,
    dir: p.dir,
    range: CONFIG.grenadeRange,
    fuse: -1
  });
  this.emit('throw', { id: p.id, g: type, x: h.x, y: h.y });
}

export function updateGrenades(alive) {
  const keep = [];
  for (const g of this.grenades) {
    g.px = g.x;
    g.py = g.y;
    if (g.fuse < 0) {
      const D = DIRS[g.dir];
      for (let s = 0; s < CONFIG.grenadeSpeed; s += 1) {
        if (g.range <= 0 || this.isWall(g.x + D.x, g.y + D.y)) {
          g.fuse = g.type === 'he' ? 4 : g.type === 'flash' ? 2 : 0;
          break;
        }
        g.x += D.x;
        g.y += D.y;
        g.range -= 1;
      }
      if (g.range <= 0 && g.fuse < 0) g.fuse = g.type === 'he' ? 4 : g.type === 'flash' ? 2 : 0;
      if (g.fuse !== 0) {
        keep.push(g);
        continue;
      }
    } else {
      g.fuse -= 1;
      if (g.fuse > 0) {
        keep.push(g);
        continue;
      }
    }
    this.detonate(g, alive);
  }
  this.grenades = keep;
}

export function detonate(g, alive) {
  const owner = this.players.get(g.owner) || null;
  const c = { x: g.x, y: g.y };
  if (g.type === 'he') {
    this.emit('he', { x: c.x, y: c.y, id: g.owner });
    for (const p of alive) {
      if (!p.alive || p.team === g.team) continue;
      let idx = -1;
      for (let i = 0; i < p.snake.length; i += 1) {
        if (dist(p.snake[i], c) <= CONFIG.heRadius && this.lineOfSight(c, p.snake[i])) {
          idx = i;
          break;
        }
      }
      if (idx < 0) continue;
      if (idx === 0) this.hitPlayer(p, 0, owner, 'he');
      else this.cut(p, idx, owner, 'he');
    }
  } else if (g.type === 'flash') {
    const hit = [];
    for (const p of alive) {
      if (!p.alive || p.team === g.team) continue;
      const h = p.snake[0];
      const d = dist(h, c);
      if (d > CONFIG.flashRadius || !this.lineOfSight(c, h)) continue;
      const ticks = Math.round(this.T.flash * (1 - d / (CONFIG.flashRadius + 3) + 0.25));
      p.flashed = Math.max(p.flashed, ticks);
      hit.push(p.id);
    }
    this.emit('flash', { x: c.x, y: c.y, id: g.owner, hit });
  } else if (g.type === 'smoke') {
    this.smokes.push({ x: c.x, y: c.y, r: CONFIG.smokeRadius, ttl: this.T.smoke });
    this.emit('smoke', { x: c.x, y: c.y });
  }
}

export function updateSmokes() {
  for (const s of this.smokes) s.ttl -= 1;
  this.smokes = this.smokes.filter((s) => s.ttl > 0);
}
