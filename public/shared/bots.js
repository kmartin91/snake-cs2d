import { CONFIG, DT, WEAPONS, DIFFICULTY } from './config.js';
import { pick } from './utils.js';
import { lineClear } from './physics.js';

const DIRS4 = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

export function botPath(p, gx, gy) {
  const { width, height, wall } = this.map;
  const sx = Math.round(p.x);
  const sy = Math.round(p.y);
  const goal = gy * width + gx;
  const start = sy * width + sx;
  if (goal === start) return [];
  this.bfsStamp += 1;
  const stamp = this.bfsStamp;
  const seen = this.bfsSeen;
  const prev = this.bfsPrev;
  const queue = this.bfsQueue;
  seen[start] = stamp;
  let qh = 0;
  let qt = 0;
  queue[qt++] = start;
  while (qh < qt) {
    const i = queue[qh++];
    if (i === goal) break;
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = ny * width + nx;
      if (seen[n] === stamp || wall[n]) continue;
      seen[n] = stamp;
      prev[n] = i;
      queue[qt++] = n;
    }
  }
  if (seen[goal] !== stamp) return [];
  const path = [];
  for (let i = goal; i !== start; i = prev[i]) path.push({ x: i % width, y: Math.floor(i / width) });
  return path.reverse();
}

export function botClear(ax, ay, bx, by) {
  return lineClear(this.map, ax, ay, bx, by, (i, j) => this.inSmoke(i, j));
}

export function botTarget(p, alive) {
  const ai = p.ai;
  const D = ai.diff || DIFFICULTY[this.opts.difficulty];
  ai.focusT = (ai.focusT || 0) - DT;
  if (ai.focusT <= 0) {
    ai.focusLeader = Math.random() < D.focus;
    ai.focusT = 1.5 + Math.random();
  }
  const range = WEAPONS[p.weapon].range + 1;
  let lead = null;
  let body = null;
  for (const o of alive) {
    if (!o.alive || o.team === p.team || o.shield > 0 || !this.canSee(p.team, o)) continue;
    const dl = Math.hypot(o.x - p.x, o.y - p.y);
    if (dl <= range && (!lead || dl < lead.d) && this.botClear(p.x, p.y, o.x, o.y)) {
      lead = { o, x: o.x, y: o.y, d: dl, lead: true };
    }
    for (const f of o.followers) {
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d > range || (body && d >= body.d) || !this.botClear(p.x, p.y, f.x, f.y)) continue;
      body = { o, x: f.x, y: f.y, d, lead: false };
    }
  }
  if (ai.focusLeader) return lead || body;
  return body || lead;
}

const spot = (it, kind) => ({ x: Math.round(it.x), y: Math.round(it.y), px: it.x, py: it.y, kind });

function nearest(list, p, maxD) {
  let best = null;
  let bestD = maxD;
  for (const it of list) {
    const d = Math.abs(it.x - p.x) + Math.abs(it.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  return best;
}

export function botGoal(p, alive) {
  const ai = p.ai;
  const D = ai.diff || DIFFICULTY[this.opts.difficulty];
  if (p.hp < 60) {
    const med = nearest(this.loot.filter((l) => l.kind === 'medkit'), p, 22);
    if (med) return spot(med, 'loot');
  }
  const golden = this.loot.find((l) => l.kind === 'golden');
  if (golden) {
    if (ai.wantsGold === undefined) ai.wantsGold = Math.random() < D.aggro;
    if (ai.wantsGold) return spot(golden, 'loot');
  } else {
    ai.wantsGold = undefined;
  }
  if (p.weapon === 'pistol') {
    const gun = nearest(this.loot.filter((l) => l.kind === 'weapon'), p, 20);
    if (gun) return spot(gun, 'loot');
  }
  if (p.followers.length < CONFIG.maxFollowers - 2) {
    const rec = nearest(this.loot.filter((l) => l.kind === 'recruit' || l.kind === 'tag'), p, p.followers.length < 5 ? 16 : 9);
    if (rec) return spot(rec, 'loot');
  }
  const nade = nearest(this.loot.filter((l) => (l.kind === 'he' || l.kind === 'flash') && p[l.kind] < 1), p, 8);
  if (nade) return spot(nade, 'loot');
  const known = alive.filter((o) => o.alive && o.team !== p.team && (this.canSee(p.team, o) || this.heardBy(p.team, o)));
  const prey = nearest(known, p, 30);
  if (prey && Math.random() < 0.4 + D.aggro * 0.6) return { x: Math.round(prey.x), y: Math.round(prey.y), kind: 'hunt' };
  ai.roamT -= 0.4;
  if (!ai.roam || ai.roamT <= 0 || Math.hypot(ai.roam.x - p.x, ai.roam.y - p.y) < 2) {
    const s = pick([this.map.siteCenter.A, this.map.siteCenter.B, this.center, pick(this.lootCells), pick(this.lootCells)]);
    let x = Math.round(s.x);
    let y = Math.round(s.y);
    if (this.isWall(x, y)) ({ x, y } = pick(this.lootCells));
    ai.roam = { x, y, kind: 'roam' };
    ai.roamT = 6 + Math.random() * 6;
  }
  return ai.roam;
}

export function botThink(p, alive) {
  const ai = p.ai;
  const D = ai.diff || DIFFICULTY[this.opts.difficulty];
  const w = WEAPONS[p.weapon];
  const target = p.flashed > 0 ? null : this.botTarget(p, alive);

  if (target) {
    ai.seen += DT;
    let tx = target.x;
    let ty = target.y;
    if (target.lead && target.o.moving && D.lead > 0) {
      const t = target.d / w.speed;
      tx += Math.cos(target.o.angle) * CONFIG.speed * t * D.lead;
      ty += Math.sin(target.o.angle) * CONFIG.speed * t * D.lead;
    }
    p.aim = Math.atan2(ty - p.y, tx - p.x) + (Math.random() * 2 - 1) * D.spread;
    p.aimDist = target.d;
    ai.burst = (ai.burst || 0) + DT;
    p.fireHeld = ai.seen >= D.reaction && target.d <= w.range + 0.5 && ai.burst % 1.2 < 1.2 * D.fire;
    if (ai.seen > D.reaction && target.d > 3 && target.d < 8.5 && Math.random() < 0.015 * (1 + D.aggro)) {
      if (p.he) p.wantThrow = 'he';
      else if (p.flash) p.wantThrow = 'flash';
    }
  } else {
    ai.seen = Math.max(0, ai.seen - DT * 2);
    p.fireHeld = false;
    if (p.moving) p.aim = p.angle;
    if (p.reload <= 0 && p.ammo < w.mag * 0.6) this.startReload(p);
  }

  ai.think -= DT;
  if (ai.think <= 0) {
    ai.think = 0.4;
    if (target && target.d <= w.range * 0.9) {
      ai.goal = null;
    } else {
      const goal = target ? { x: Math.round(target.x), y: Math.round(target.y), kind: 'hunt' } : this.botGoal(p, alive);
      ai.repath = (ai.repath || 0) - 0.4;
      if (!ai.goal || goal.x !== ai.goal.x || goal.y !== ai.goal.y || !ai.path.length || ai.repath <= 0) {
        ai.goal = goal;
        ai.path = this.botPath(p, goal.x, goal.y);
        ai.repath = 2;
      }
    }
    const moved = ai.lastPos ? Math.hypot(ai.lastPos.x - p.x, ai.lastPos.y - p.y) : 1;
    ai.stuckT = moved < 0.15 && (p.mvx || p.mvy) ? ai.stuckT + 0.4 : 0;
    ai.lastPos = { x: p.x, y: p.y };
    if (ai.stuckT >= 1.2) {
      ai.unstick = 0.6;
      ai.unstickDir = Math.random() * Math.PI * 2;
      ai.stuckT = 0;
      ai.path = [];
    }
  }

  if (ai.unstick > 0) {
    ai.unstick -= DT;
    p.mvx = Math.cos(ai.unstickDir);
    p.mvy = Math.sin(ai.unstickDir);
    return;
  }

  if (p.flashed > 0) {
    p.mvx = Math.cos(p.angle);
    p.mvy = Math.sin(p.angle);
    return;
  }

  if (target && target.d <= w.range * 0.9) {
    ai.strafeT -= DT;
    if (ai.strafeT <= 0) {
      ai.strafe = Math.random() < 0.5 ? -1 : 1;
      ai.strafeT = 0.8 + Math.random() * 1.4;
    }
    const dx = (target.x - p.x) / target.d;
    const dy = (target.y - p.y) / target.d;
    const want = p.weapon === 'shotgun' ? 2.5 : w.range * 0.55;
    const push = target.d > want + 1.5 ? 0.6 : target.d < want - 1.5 ? -0.6 : 0;
    p.mvx = -dy * ai.strafe + dx * push;
    p.mvy = dx * ai.strafe + dy * push;
    return;
  }

  const path = ai.path;
  while (path.length) {
    const a = path[0];
    if (Math.hypot(a.x - p.x, a.y - p.y) < 0.5) {
      path.shift();
      continue;
    }
    if (path.length > 1 && Math.hypot(path[1].x - p.x, path[1].y - p.y) < 1) {
      path.shift();
      continue;
    }
    break;
  }
  if (!path.length) {
    const g = ai.goal;
    const gx = g ? g.px ?? g.x : p.x;
    const gy = g ? g.py ?? g.y : p.y;
    const d = Math.hypot(gx - p.x, gy - p.y);
    p.mvx = d > 0.25 ? (gx - p.x) / d : 0;
    p.mvy = d > 0.25 ? (gy - p.y) / d : 0;
    return;
  }
  const wp = path.length > 1 && this.botClear(p.x, p.y, path[1].x, path[1].y) ? path[1] : path[0];
  const dx = wp.x - p.x;
  const dy = wp.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  p.mvx = dx / len;
  p.mvy = dy / len;
}
