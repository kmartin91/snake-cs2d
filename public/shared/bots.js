import { DIRS, CONFIG, SHOP, DIFFICULTY, ZONE, BOT_LINES } from './config.js';
import { enemyOf, opposite, rand, pick, cheb, manh, dist, minBy } from './utils.js';

export function botChat(p, kind, chance) {
  if (Math.random() > chance) return;
  if (this.tickCount - this.lastBotChat < 30) return;
  this.lastBotChat = this.tickCount;
  this.emit('chat', { id: p.id, name: p.name, team: p.team, text: pick(BOT_LINES[kind]) });
}

export function botBuy(p) {
  const r = Math.random;
  const owned = { armor: p.armor, kit: p.kit, he: p.he > 0, flash: p.flash > 0, smoke: p.smoke > 0, ext: p.extBought };
  const tryBuy = (id, chance, reserve = 0) => {
    const item = SHOP.find((s) => s.id === id);
    if (owned[id] || p.money - item.price < reserve || r() >= chance) return;
    this.buy(p, id);
  };
  tryBuy('armor', 0.75, 0);
  if (p.team === 'CT') tryBuy('kit', 0.5, 200);
  tryBuy('he', 0.6, 0);
  tryBuy('flash', 0.5, 0);
  tryBuy('smoke', 0.3, 0);
  tryBuy('ext', 0.4, 0);
}

export function markSelf(p) {
  this.selfStamp += 1;
  const w = this.map.width;
  for (const c of p.snake) this.selfMark[c.y * w + c.x] = this.selfStamp;
}

export function blockedFor(p, i) {
  if (this.map.wall[i]) return true;
  if (this.selfMark[i] === this.selfStamp) return true;
  const pi = this.occ[enemyOf(p.team)].p[i];
  return pi >= 0 && this.occList[pi] && this.occList[pi].alive;
}

export function bfs(p, goal) {
  const { width, height } = this.map;
  this.bfsStamp += 1;
  const stamp = this.bfsStamp;
  const seen = this.bfsSeen;
  const first = this.bfsFirst;
  const distA = this.bfsDist;
  const queue = this.bfsQueue;
  const h = p.snake[0];
  seen[h.y * width + h.x] = stamp;
  let qt = 0;
  for (let d = 0; d < 4; d += 1) {
    if (d === opposite(p.dir)) continue;
    const nx = h.x + DIRS[d].x;
    const ny = h.y + DIRS[d].y;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const i = ny * width + nx;
    if (this.blockedFor(p, i)) continue;
    seen[i] = stamp;
    first[i] = d;
    distA[i] = 1;
    if (goal(nx, ny)) return { dir: d, dist: 1 };
    queue[qt++] = i;
  }
  let qh = 0;
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % width;
    const y = (i - x) / width;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + DIRS[d].x;
      const ny = y + DIRS[d].y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (seen[n] === stamp || this.blockedFor(p, n)) continue;
      seen[n] = stamp;
      first[n] = first[i];
      distA[n] = distA[i] + 1;
      if (goal(nx, ny)) return { dir: first[n], dist: distA[n] };
      queue[qt++] = n;
    }
  }
  return null;
}

export function flood(p, sx, sy, limit) {
  const { width, height } = this.map;
  this.bfsStamp += 1;
  const stamp = this.bfsStamp;
  const seen = this.bfsSeen;
  const queue = this.bfsQueue;
  const start = sy * width + sx;
  seen[start] = stamp;
  const h = p.snake[0];
  seen[h.y * width + h.x] = stamp;
  queue[0] = start;
  let qh = 0;
  let qt = 1;
  while (qh < qt && qt < limit) {
    const i = queue[qh++];
    const x = i % width;
    const y = (i - x) / width;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + DIRS[d].x;
      const ny = y + DIRS[d].y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (seen[n] === stamp || this.blockedFor(p, n)) continue;
      seen[n] = stamp;
      queue[qt++] = n;
    }
  }
  return qt;
}

export function scanLine(p, d, range) {
  const h = p.snake[0];
  const D = DIRS[d];
  let x = h.x;
  let y = h.y;
  for (let i = 1; i <= range; i += 1) {
    x += D.x;
    y += D.y;
    if (this.isWall(x, y) || this.inSmoke(x, y)) return null;
    const hit = this.occAt(x, y, enemyOf(p.team));
    if (hit) return { p: hit.p, seg: hit.seg, dist: i };
  }
  return null;
}

export function botThink(p, alive) {
  const ai = p.ai;
  const D = DIFFICULTY[this.opts.difficulty];
  const h = p.snake[0];
  p.wantFire = false;
  p.queue.length = 0;
  this.markSelf(p);

  if (p.flashed > 0) {
    p.actionHeld = false;
    p.boostHeld = false;
    const want = Math.random() < 0.15 ? (p.dir + (Math.random() < 0.5 ? 1 : 3)) % 4 : p.dir;
    if (Math.random() < 0.5) this.botSteer(p, want);
    else p.queue.push(want);
    return;
  }

  const threat = this.scanLine(p, p.dir, 16);
  if (threat) {
    ai.seen += 1;
    if (ai.seen >= D.reaction && p.fireCd === 0) {
      const len = p.snake.length;
      const worth = threat.seg === 0 || threat.dist <= 7 || len > 6;
      if (worth && len >= CONFIG.minFireLength && Math.random() < D.fire) p.wantFire = true;
      if (Math.random() < D.nade && threat.dist >= 3 && threat.dist <= 9) {
        if (p.he) p.wantThrow = 'he';
        else if (p.flash && threat.dist <= 7) p.wantThrow = 'flash';
      }
    }
  } else {
    ai.seen = 0;
  }

  const canPlant = this.phase === 'live' && p.hasBomb && this.siteAt(h.x, h.y);
  const canDefuse =
    this.phase === 'planted' && p.team === 'CT' && this.bomb.state === 'planted' && cheb(h, this.bomb) <= 1;
  if (canPlant || canDefuse) {
    p.actionHeld = true;
    p.boostHeld = false;
    return;
  }
  p.actionHeld = false;

  if (Math.random() < D.mistake) {
    p.boostHeld = false;
    return;
  }

  ai.retarget -= 1;
  if (!ai.goal || ai.retarget <= 0 || cheb(h, ai.goal) <= ai.goal.r) {
    if (ai.goal && ai.goal.kind === 'wp' && cheb(h, ai.goal) <= ai.goal.r) ai.waypoint = null;
    ai.goal = this.chooseGoal(p, alive);
    ai.retarget = ai.goal.kind === 'enemy' ? 3 : 8 + rand(6);
  }

  let want = null;
  const hunting = p.team === 'T' && this.bomb.state === 'planted' && this.bomb.defuser;
  if (!threat && Math.random() < (hunting ? Math.max(0.6, D.aim) : D.aim)) {
    for (const d of [(p.dir + 1) % 4, (p.dir + 3) % 4]) {
      const t = this.scanLine(p, d, 12);
      if (t && (t.seg === 0 || t.dist <= 8)) {
        want = d;
        break;
      }
    }
  }

  if (want === null) {
    const g = ai.goal;
    let res = null;
    if (g.kind === 'site') {
      const zone = g.site === 'A' ? ZONE.A : ZONE.B;
      const reachSite = p.hasBomb;
      res = this.bfs(p, (x, y) =>
        reachSite ? this.map.zone[y * this.map.width + x] === zone : Math.max(Math.abs(x - g.x), Math.abs(y - g.y)) <= g.r
      );
    } else {
      res = this.bfs(p, (x, y) => Math.max(Math.abs(x - g.x), Math.abs(y - g.y)) <= g.r);
    }
    if (res) {
      want = res.dir;
      ai.pathLen = res.dist;
    } else {
      ai.pathLen = 0;
    }
  }
  if (want === null) want = p.dir;

  const chosen = this.botSteer(p, want);

  const urgent =
    (p.hasBomb && ai.pathLen > 4) ||
    (p.team === 'CT' && this.bomb.state === 'planted' && ai.pathLen > 3) ||
    (ai.goal && ai.goal.kind === 'enemy') ||
    ai.pathLen > 16;
  let boost = urgent && Math.random() < D.boost + 0.3;
  if (boost && chosen !== null) {
    const D1 = DIRS[chosen];
    const x2 = h.x + D1.x * 2;
    const y2 = h.y + D1.y * 2;
    const x3 = h.x + D1.x * 3;
    const y3 = h.y + D1.y * 3;
    const w = this.map.width;
    if (this.isWall(x2, y2) || this.blockedFor(p, y2 * w + x2)) boost = false;
    else if (this.isWall(x3, y3) || this.blockedFor(p, y3 * w + x3)) boost = false;
  }
  p.boostHeld = boost;
}

export function botSteer(p, want) {
  const h = p.snake[0];
  const { width } = this.map;
  const need = Math.min(p.snake.length + 4, 45);
  const candidates = [want, (want + 1) % 4, (want + 3) % 4, (want + 2) % 4].filter(
    (d, i, arr) => d !== opposite(p.dir) && arr.indexOf(d) === i
  );
  let best = null;
  let bestScore = -Infinity;
  for (const d of candidates) {
    const nx = h.x + DIRS[d].x;
    const ny = h.y + DIRS[d].y;
    if (this.isWall(nx, ny) || this.blockedFor(p, ny * width + nx)) continue;
    const area = this.flood(p, nx, ny, need);
    let score = area >= need ? 1000 : area * 10;
    if (d === want) score += 60;
    if (d === p.dir) score += 5;
    for (const o of this.occList) {
      if (!o.alive || o.team === p.team) continue;
      const oh = o.snake[0];
      if (Math.abs(oh.x - nx) + Math.abs(oh.y - ny) === 1 && o.snake.length >= p.snake.length) score -= 40;
    }
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  if (best !== null) p.queue.push(best);
  return best;
}

export function pointNear(c, r) {
  for (let i = 0; i < 20; i += 1) {
    const x = Math.round(c.x + (Math.random() * 2 - 1) * r);
    const y = Math.round(c.y + (Math.random() * 2 - 1) * r);
    if (!this.isWall(x, y)) return { x, y, r: 1, kind: 'point' };
  }
  return { x: Math.round(c.x), y: Math.round(c.y), r: 2, kind: 'point' };
}

export function aimGoal(p, target) {
  const h = p.snake[0];
  const t = target.snake[0];
  let best = null;
  let bestScore = Infinity;
  for (const D of DIRS) {
    for (let k = 1; k <= 8; k += 1) {
      const x = t.x + D.x * k;
      const y = t.y + D.y * k;
      if (this.isWall(x, y) || this.inSmoke(x, y)) break;
      if (k < 3) continue;
      const score = Math.abs(x - h.x) + Math.abs(y - h.y) + Math.abs(k - 5);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  if (!best) return { x: t.x, y: t.y, r: 3, kind: 'enemy' };
  return { x: best.x, y: best.y, r: 1, kind: 'enemy' };
}

export function siteGoal(site) {
  const c = pick(this.map.sites[site]);
  return { x: c.x, y: c.y, r: 1, kind: 'site', site };
}

export function chooseGoal(p, alive) {
  const D = DIFFICULTY[this.opts.difficulty];
  const ai = p.ai;
  const b = this.bomb;
  const h = p.snake[0];
  const enemies = alive.filter((o) => o.alive && o.team !== p.team);
  const mates = alive.filter((o) => o.alive && o.team === p.team);
  const nearestEnemy = minBy(enemies, (o) => manh(o.snake[0], h));
  const enemyDist = nearestEnemy ? manh(nearestEnemy.snake[0], h) : Infinity;

  if (p.team === 'T') {
    if (p.hasBomb) {
      if (ai.waypoint && Math.random() < 0.5) return { ...ai.waypoint, r: 2, kind: 'wp' };
      return this.siteGoal(this.plan);
    }
    if (b.state === 'ground') {
      const closest = minBy(mates, (o) => manh(o.snake[0], b));
      if (closest === p) return { x: b.x, y: b.y, r: 0, kind: 'bomb' };
    }
    if (b.state === 'planted') {
      const defuser = b.defuser ? this.players.get(b.defuser) : null;
      if (defuser && defuser.alive) return this.aimGoal(p, defuser);
      const intruder = minBy(enemies, (o) => manh(o.snake[0], b));
      if (intruder && manh(intruder.snake[0], b) < 12) return this.aimGoal(p, intruder);
      return this.pointNear(b, 3);
    }
  } else {
    if (b.state === 'planted') {
      const closest = minBy(mates, (o) => manh(o.snake[0], b));
      if (closest === p || manh(h, b) < 6) return { x: b.x, y: b.y, r: 1, kind: 'defuse' };
      return this.pointNear(b, 4);
    }
    if (b.state === 'ground' && Math.random() < 0.4) return this.pointNear(b, 3);
  }

  if (nearestEnemy && enemyDist < 12 && Math.random() < D.chase) return this.aimGoal(p, nearestEnemy);

  const crate = minBy(this.crates, (c) => manh(c, h));
  if (crate && manh(crate, h) < 8) return { x: crate.x, y: crate.y, r: 0, kind: 'crate' };
  const pellet = minBy(this.pellets, (c) => manh(c, h));
  if (pellet && manh(pellet, h) < 5) return { x: pellet.x, y: pellet.y, r: 0, kind: 'crate' };

  if (p.team === 'T') {
    if (ai.waypoint) return { ...ai.waypoint, r: 2, kind: 'wp' };
    return this.siteGoal(this.plan);
  }
  return this.siteGoal(ai.site || 'A');
}
