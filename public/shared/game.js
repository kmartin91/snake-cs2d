import { CONFIG, DT, TICK_MS, WEAPONS, LOOT, LOOT_WEAPONS, DIFFICULTY, ZONE, BOT_NAMES, BOT_LINES } from './config.js';
import { MAP_ROWS, parseMap } from './map.js';
import { computeVision, FOG_PHASES } from './vision.js';
import { SKINS, SKIN_IDS } from './skins.js';
import { clamp, rand, pick } from './utils.js';
import { circleHitsWall, pointAlong, trimTrail, lineClear } from './physics.js';
import * as bots from './bots.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
export const WEAPON_KEYS = Object.keys(WEAPONS);

function createPlayer(id, name, bot, team) {
  return {
    id,
    name,
    bot,
    team,
    skin: 'classic',
    alive: false,
    x: 0,
    y: 0,
    angle: 0,
    mvx: 0,
    mvy: 0,
    moving: false,
    stuck: 0,
    started: false,
    heading: 0,
    turning: false,
    turnSign: 0,
    aim: 0,
    aimDist: 6,
    fireHeld: false,
    wantFire: false,
    hp: CONFIG.leaderHp,
    followers: [],
    trail: [],
    weapon: 'pistol',
    ammo: WEAPONS.pistol.mag,
    reload: 0,
    cd: 0,
    he: 0,
    flash: 0,
    smoke: 0,
    wantThrow: null,
    flashed: 0,
    shield: 0,
    respawn: 0,
    kills: 0,
    deaths: 0,
    downs: 0,
    streak: 0,
    lastKill: -999,
    spawnSeq: 0,
    ping: 0,
    noiseSeed: [...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6,
    joinedAt: Date.now(),
    ai: bot
      ? { think: 0, seen: 0, goal: null, path: [], strafe: 1, strafeT: 0, lastPos: null, stuckT: 0, unstick: 0, roam: null, roamT: 0 }
      : null
  };
}

export class Game {
  constructor(opts = {}) {
    this.opts = {
      teamSize: clamp(Number(opts.teamSize) || 3, 1, 5),
      bots: opts.bots !== false,
      difficulty: DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal',
      scoreToWin: clamp(Number(opts.scoreToWin) || CONFIG.scoreToWin, 5, 100)
    };
    this.tickMs = TICK_MS;
    this.map = parseMap(MAP_ROWS);
    const n = this.map.width * this.map.height;
    this.spawnCells = { T: [], CT: [] };
    this.lootCells = [];
    for (const c of this.map.floor) {
      const z = this.map.zone[c.y * this.map.width + c.x];
      if (z === ZONE.T) this.spawnCells.T.push(c);
      else if (z === ZONE.CT) this.spawnCells.CT.push(c);
      else this.lootCells.push(c);
    }
    const cx = this.map.width / 2;
    const cy = this.map.height / 2;
    this.center = this.lootCells.reduce((best, c) =>
      Math.hypot(c.x - cx, c.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? c : best
    );
    this.vision = { T: new Uint8Array(n), CT: new Uint8Array(n) };
    this.fogOn = false;
    this.bfsSeen = new Int32Array(n);
    this.bfsPrev = new Int32Array(n);
    this.bfsQueue = new Int32Array(n);
    this.bfsStamp = 0;
    this.soldierGrid = new Map();

    this.players = new Map();
    this.tickCount = 0;
    this.phase = 'idle';
    this.time = 0;
    this.score = { T: 0, CT: 0 };
    this.loot = [];
    this.bullets = [];
    this.newBullets = [];
    this.grenades = [];
    this.smokes = [];
    this.events = [];
    this.winner = null;
    this.uid = 1;
    this.botSeq = 0;
    this.lootTimer = 0;
    this.goldenTimer = CONFIG.goldenEvery;
    this.lastBotChat = -999;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  teamMembers(team) {
    return [...this.players.values()].filter((p) => p.team === team);
  }

  teamsReady() {
    let t = 0;
    let ct = 0;
    for (const p of this.players.values()) {
      if (p.team === 'T') t += 1;
      else ct += 1;
    }
    return t > 0 && ct > 0;
  }

  humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n += 1;
    return n;
  }

  isWall(x, y) {
    const { width, height, wall } = this.map;
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    return wall[y * width + x] === 1;
  }

  inSmoke(x, y) {
    for (const s of this.smokes) if (Math.hypot(s.x - x, s.y - y) <= s.r) return true;
    return false;
  }

  soldiersOf(p) {
    const out = [{ x: p.x, y: p.y, f: null }];
    for (const f of p.followers) out.push({ x: f.x, y: f.y, f });
    return out;
  }

  addPlayer({ id, name, bot = false, team = null, skin = 'classic' }) {
    if (this.players.has(id)) return this.players.get(id);
    let chosen = team === 'T' || team === 'CT' ? team : null;
    if (!chosen) {
      const humans = (t) => this.teamMembers(t).filter((p) => !p.bot).length;
      const hT = humans('T');
      const hC = humans('CT');
      if (hT !== hC) chosen = hT < hC ? 'T' : 'CT';
      else {
        const aT = this.teamMembers('T').length;
        const aC = this.teamMembers('CT').length;
        chosen = aT < aC ? 'T' : aT > aC ? 'CT' : Math.random() < 0.5 ? 'T' : 'CT';
      }
    }
    const cleanName = String(name || 'Joueur').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Joueur';
    const p = createPlayer(id, cleanName, bot, chosen);
    p.skin = SKIN_IDS.has(skin) ? skin : 'classic';
    this.players.set(id, p);
    if (!bot) {
      this.emit('join', { id, name: p.name, team: chosen });
      this.replaceBotFor(chosen);
    }
    if (this.phase === 'idle') this.startMatch();
    else if (this.phase === 'countdown') this.spawn(p);
    else p.respawn = 1;
    return p;
  }

  replaceBotFor(team) {
    if (!this.opts.bots) return;
    const members = this.teamMembers(team);
    if (members.length <= this.opts.teamSize) return;
    const bot = members.find((p) => p.bot && !p.alive) || members.find((p) => p.bot);
    if (bot) this.removePlayer(bot.id, true);
  }

  removePlayer(id, silent = false) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.alive) this.dropLoot(p);
    this.players.delete(id);
    if (!silent) this.emit('leave', { id, name: p.name });
    if (this.players.size === 0 || (this.humanCount() === 0 && !this.opts.bots)) this.phase = 'idle';
  }

  fillBots() {
    for (const team of ['T', 'CT']) {
      const members = this.teamMembers(team);
      const humans = members.filter((p) => !p.bot);
      const list = members.filter((p) => p.bot);
      const want = this.opts.bots ? Math.max(0, this.opts.teamSize - humans.length) : 0;
      while (list.length > want) this.players.delete(list.pop().id);
      while (list.length < want) {
        const used = new Set([...this.players.values()].map((p) => p.name));
        const free = BOT_NAMES.filter((n) => !used.has(`BOT ${n}`));
        const name = `BOT ${free.length ? pick(free) : `${pick(BOT_NAMES)}${rand(99)}`}`;
        this.botSeq += 1;
        const b = createPlayer(`bot-${this.botSeq}`, name, true, team);
        b.skin = Math.random() < 0.45 ? 'classic' : pick(SKINS).id;
        this.players.set(b.id, b);
        list.push(b);
      }
    }
  }

  startMatch() {
    this.score = { T: 0, CT: 0 };
    this.winner = null;
    this.loot = [];
    this.bullets = [];
    this.grenades = [];
    this.smokes = [];
    this.lootTimer = 0;
    this.goldenTimer = CONFIG.goldenEvery;
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.downs = 0;
      p.streak = 0;
      p.alive = false;
    }
    this.fillBots();
    for (let i = 0; i < Math.ceil(CONFIG.lootMax / 2); i += 1) this.spawnLoot();
    for (const p of this.players.values()) this.spawn(p);
    if (!this.teamsReady()) {
      this.phase = 'warmup';
      this.time = 0;
      this.emit('warmup');
      return;
    }
    this.phase = 'countdown';
    this.time = CONFIG.countdown;
    this.emit('matchstart', { goal: this.opts.scoreToWin });
    const talker = pick([...this.players.values()].filter((p) => p.bot));
    if (talker) this.botChat(talker, 'start', 0.5);
  }

  endMatch() {
    this.phase = 'matchover';
    this.time = CONFIG.matchOver;
    this.winner = this.score.T === this.score.CT ? 'draw' : this.score.T > this.score.CT ? 'T' : 'CT';
    for (const p of this.players.values()) {
      p.fireHeld = false;
      p.mvx = 0;
      p.mvy = 0;
    }
    this.emit('matchend', { winner: this.winner });
  }

  spawn(p) {
    const cells = this.spawnCells[p.team];
    const others = [...this.players.values()].filter((o) => o.alive && o !== p);
    let cell = pick(cells);
    for (let i = 0; i < 20; i += 1) {
      const c = pick(cells);
      if (others.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 1.6)) {
        cell = c;
        break;
      }
    }
    p.x = cell.x;
    p.y = cell.y;
    p.angle = p.team === 'T' ? 0 : Math.PI;
    p.aim = p.angle;
    const bx = -Math.cos(p.angle);
    const by = -Math.sin(p.angle);
    p.trail = [];
    for (let i = 1; i <= 12; i += 1) p.trail.push({ x: p.x + bx * i * 0.25, y: p.y + by * i * 0.25 });
    p.followers = [];
    for (let i = 0; i < CONFIG.startFollowers; i += 1) this.addFollower(p);
    this.placeFollowers(p);
    p.alive = true;
    p.hp = CONFIG.leaderHp;
    p.weapon = 'pistol';
    p.ammo = WEAPONS.pistol.mag;
    p.reload = 0;
    p.cd = 0;
    p.he = 0;
    p.flash = 0;
    p.smoke = 0;
    p.flashed = 0;
    p.shield = CONFIG.spawnShield;
    p.respawn = 0;
    p.mvx = 0;
    p.mvy = 0;
    p.moving = false;
    p.started = p.bot;
    p.heading = p.angle;
    p.turnSign = 0;
    p.fireHeld = false;
    p.wantThrow = null;
    p.spawnSeq += 1;
    if (p.ai) {
      p.ai.goal = null;
      p.ai.path = [];
      p.ai.seen = 0;
    }
    this.emit('spawn', { id: p.id, x: p.x, y: p.y });
  }

  addFollower(p) {
    if (p.followers.length >= CONFIG.maxFollowers) return false;
    const d = (p.followers.length + 1) * CONFIG.spacing;
    p.followers.push({ id: this.uid++, hp: CONFIG.followerHp, d, x: p.x, y: p.y, cd: Math.random() * 0.5 });
    return true;
  }

  input(id, msg) {
    const p = this.players.get(id);
    if (!p || !Array.isArray(msg)) return;
    const [type, a, b] = msg;
    switch (type) {
      case 'mv': {
        let x = Number(a);
        let y = Number(b);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const len = Math.hypot(x, y);
        if (len > 1) {
          x /= len;
          y /= len;
        }
        p.mvx = x;
        p.mvy = y;
        return;
      }
      case 'aim': {
        const angle = Number(a);
        if (!Number.isFinite(angle)) return;
        p.aim = angle;
        const d = Number(b);
        if (Number.isFinite(d)) p.aimDist = clamp(d, 1, 30);
        p.aimStick = Boolean(msg[3]);
        return;
      }
      case 'f':
        p.fireHeld = Boolean(a);
        return;
      case 'r':
        if (p.alive && p.reload <= 0 && p.ammo < WEAPONS[p.weapon].mag) this.startReload(p);
        return;
      case 'g':
        if (a === 'he' || a === 'flash' || a === 'smoke') p.wantThrow = a;
        return;
      default:
    }
  }

  chat(id, text) {
    const p = this.players.get(id);
    if (!p) return;
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (clean) this.emit('chat', { id, name: p.name, team: p.team, text: clean });
  }

  botChat(p, kind, chance) {
    if (Math.random() > chance || this.tickCount - this.lastBotChat < 80) return;
    this.lastBotChat = this.tickCount;
    this.emit('chat', { id: p.id, name: p.name, team: p.team, text: pick(BOT_LINES[kind]) });
  }

  step() {
    this.tickCount += 1;
    this.newBullets = [];
    switch (this.phase) {
      case 'warmup':
        if (this.teamsReady()) this.startMatch();
        else this.simulate();
        break;
      case 'countdown':
        this.tickTimers();
        this.time -= DT;
        if (this.time <= 0) {
          this.phase = 'live';
          this.time = CONFIG.matchTime;
          this.emit('live');
        }
        break;
      case 'live':
        if (!this.teamsReady()) {
          this.phase = 'warmup';
          this.emit('warmup');
          break;
        }
        this.simulate();
        this.time -= DT;
        if (this.phase === 'live' && this.time <= 0) this.endMatch();
        break;
      case 'matchover':
        this.time -= DT;
        if (this.time <= 0) this.startMatch();
        break;
      default:
    }
    if (this.tickCount % 2 === 0) this.updateVision();
    const snap = this.snapshot();
    this.events = [];
    return snap;
  }

  tickTimers() {
    for (const p of this.players.values()) {
      if (p.shield > 0) p.shield -= DT;
      if (p.flashed > 0) p.flashed -= DT;
      if (p.cd > 0) p.cd -= DT;
      if (p.reload > 0) {
        p.reload -= DT;
        if (p.reload <= 0) p.ammo = WEAPONS[p.weapon].mag;
      }
    }
  }

  simulate() {
    this.tickTimers();
    for (const p of this.players.values()) {
      if (p.alive) continue;
      p.respawn -= DT;
      if (p.respawn <= 0) this.spawn(p);
    }
    const alive = [...this.players.values()].filter((p) => p.alive);
    for (const p of alive) if (p.bot) this.botThink(p, alive);
    for (const p of alive) this.move(p, alive);
    for (const p of alive) this.placeFollowers(p);
    this.buildSoldierGrid(alive);
    for (const p of alive) this.shoot(p);
    this.updateBullets();
    this.updateGrenades(alive);
    this.updateSmokes();
    this.updateLoot(alive);
    if (this.phase === 'live') {
      const goal = this.opts.scoreToWin;
      if (this.score.T >= goal || this.score.CT >= goal) this.endMatch();
    }
  }

  blockedAt(p, x, y, alive, ignoreSelf) {
    if (circleHitsWall(this.map, x, y, CONFIG.leaderRadius)) return true;
    const reach = CONFIG.leaderRadius + CONFIG.soldierRadius - 0.04;
    const r2max = reach * reach;
    if (!ignoreSelf) {
      for (let i = 2; i < p.followers.length; i += 1) {
        const f = p.followers[i];
        if ((f.x - x) ** 2 + (f.y - y) ** 2 < r2max) return true;
      }
    }
    for (const o of alive) {
      if (o === p || o.team === p.team || !o.alive) continue;
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < r2max) return true;
      for (const f of o.followers) if ((f.x - x) ** 2 + (f.y - y) ** 2 < r2max) return true;
    }
    return false;
  }

  move(p, alive) {
    p.moving = false;
    p.turning = false;
    const len = Math.hypot(p.mvx, p.mvy);
    if (len >= 0.15) {
      p.started = true;
      p.heading = Math.atan2(p.mvy, p.mvx);
    }
    if (!p.started) {
      p.stuck = 0;
      return;
    }
    const want = p.heading;
    const diff = Math.atan2(Math.sin(want - p.angle), Math.cos(want - p.angle));
    const maxTurn = CONFIG.turnRate * DT;
    let sign = Math.sign(diff) || 1;
    if (Math.abs(diff) > 2.5) {
      if (!p.turnSign) {
        const side = (s) => circleHitsWall(this.map, p.x - Math.sin(p.angle) * s * 0.9, p.y + Math.cos(p.angle) * s * 0.9, CONFIG.leaderRadius);
        p.turnSign = side(sign) && !side(-sign) ? -sign : sign;
      }
      sign = p.turnSign;
    } else if (Math.abs(diff) < 0.3) {
      p.turnSign = 0;
    }
    p.angle = Math.abs(diff) <= maxTurn ? want : p.angle + sign * maxTurn;
    p.turning = Math.abs(diff) > 0.35;
    const mx = Math.cos(p.angle);
    const my = Math.sin(p.angle);
    const speed = CONFIG.speed * (p.weapon === 'sniper' ? 0.85 : 1) * (p.flashed > 0 ? 0.7 : 1);
    const stepLen = speed * DT;
    const ignoreSelf = p.stuck > 0.5;
    const tries = [
      [p.x + mx * stepLen, p.y + my * stepLen],
      [p.x + Math.sign(mx) * stepLen * Math.min(1, Math.abs(mx) + 0.3), p.y],
      [p.x, p.y + Math.sign(my) * stepLen * Math.min(1, Math.abs(my) + 0.3)]
    ];
    for (const [nx, ny] of tries) {
      if ((nx === p.x && ny === p.y) || this.blockedAt(p, nx, ny, alive, ignoreSelf)) continue;
      p.x = nx;
      p.y = ny;
      p.moving = true;
      break;
    }
    p.stuck = p.moving ? 0 : p.stuck + DT;
  }

  placeFollowers(p) {
    const head = { x: p.x, y: p.y };
    const last = p.trail[0];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) >= 0.2) p.trail.unshift(head);
    trimTrail(head, p.trail, (CONFIG.maxFollowers + 3) * CONFIG.spacing);
    const pts = [head, ...p.trail];
    p.followers.forEach((f, i) => {
      const target = (i + 1) * CONFIG.spacing;
      f.d = f.d > target ? Math.max(target, f.d - 6 * DT) : target;
      const pos = pointAlong(pts, f.d);
      f.x = pos.x;
      f.y = pos.y;
    });
  }

  startReload(p) {
    p.reload = WEAPONS[p.weapon].reload;
    this.emit('reload', { id: p.id });
  }

  buildSoldierGrid(alive) {
    this.soldierGrid = new Map();
    const w = this.map.width;
    const add = (owner, f, x, y) => {
      const key = Math.round(y) * w + Math.round(x);
      let list = this.soldierGrid.get(key);
      if (!list) {
        list = [];
        this.soldierGrid.set(key, list);
      }
      list.push({ owner, f, x, y });
    };
    for (const p of alive) {
      add(p, null, p.x, p.y);
      for (const f of p.followers) add(p, f, f.x, f.y);
    }
  }

  spawnBullets(p, ox, oy, angle, mult) {
    const w = WEAPONS[p.weapon];
    const spread = w.spread * (p.turning && p.weapon !== 'shotgun' ? 2 : 1) + (p.flashed > 0 ? 0.25 : 0);
    for (let k = 0; k < w.pellets; k += 1) {
      const a = angle + (Math.random() * 2 - 1) * spread;
      const b = {
        id: this.uid++,
        owner: p.id,
        team: p.team,
        weapon: p.weapon,
        x: ox,
        y: oy,
        vx: Math.cos(a),
        vy: Math.sin(a),
        speed: w.speed,
        range: w.range,
        dmg: w.dmg * mult
      };
      this.bullets.push(b);
      this.newBullets.push([b.id, r2(ox), r2(oy), r2(a), w.speed, w.range, p.team === 'T' ? 0 : 1, WEAPON_KEYS.indexOf(p.weapon)]);
    }
  }

  shoot(p) {
    const w = WEAPONS[p.weapon];
    if (p.wantThrow) {
      this.throwGrenade(p, p.wantThrow);
      p.wantThrow = null;
    }
    const firing = (p.fireHeld || p.wantFire) && p.reload <= 0 && p.ammo > 0;
    p.wantFire = false;
    if (!firing) return;
    const reach = Math.max(3, p.aimDist);
    let tx = p.x + Math.cos(p.aim) * reach;
    let ty = p.y + Math.sin(p.aim) * reach;
    let angle = p.aim;
    const lock = p.bot ? null : this.assistTarget(p, w, tx, ty);
    if (lock) {
      tx = lock.x;
      ty = lock.y;
      angle = Math.atan2(ty - p.y, tx - p.x);
    }
    if (p.cd <= 0) {
      p.cd = 1 / w.rate;
      p.ammo -= 1;
      this.spawnBullets(p, p.x + Math.cos(angle) * 0.45, p.y + Math.sin(angle) * 0.45, angle, 1);
      this.emit('shot', { id: p.id, x: r2(p.x), y: r2(p.y), a: r2(angle), w: p.weapon });
      if (p.ammo <= 0) this.startReload(p);
    }
    const shooters = Math.min(CONFIG.firingFollowers, p.followers.length);
    for (let i = 0; i < shooters; i += 1) {
      const f = p.followers[i];
      f.cd -= DT;
      if (f.cd > 0) continue;
      f.cd = (1 / (w.rate * CONFIG.followerRate)) * (0.8 + Math.random() * 0.4);
      const a = Math.atan2(ty - f.y, tx - f.x);
      this.spawnBullets(p, f.x + Math.cos(a) * 0.4, f.y + Math.sin(a) * 0.4, a, CONFIG.followerDamage);
    }
  }

  assistTarget(p, w, ax, ay) {
    const cone = p.aimStick ? CONFIG.assistConeStick : CONFIG.assistCone;
    let best = null;
    let bestScore = Infinity;
    for (const o of this.players.values()) {
      if (!o.alive || o.team === p.team || !this.canSee(p.team, o)) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d > w.range + 1) continue;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(o.y - p.y, o.x - p.x) - p.aim), Math.cos(Math.atan2(o.y - p.y, o.x - p.x) - p.aim)));
      const near = Math.hypot(o.x - ax, o.y - ay);
      if (off > cone && near > CONFIG.assistRadius) continue;
      if (!lineClear(this.map, p.x, p.y, o.x, o.y)) continue;
      const score = off * d + near * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { o, d };
      }
    }
    if (!best) return null;
    const { o, d } = best;
    const t = (d / w.speed) * 0.85;
    return o.moving ? { x: o.x + Math.cos(o.angle) * CONFIG.speed * t, y: o.y + Math.sin(o.angle) * CONFIG.speed * t } : { x: o.x, y: o.y };
  }

  updateBullets() {
    const w = this.map.width;
    const keep = [];
    const bodyR2 = CONFIG.soldierRadius * CONFIG.soldierRadius;
    const leadR2 = CONFIG.leaderHitRadius * CONFIG.leaderHitRadius;
    for (const b of this.bullets) {
      let travel = b.speed * DT;
      let done = false;
      while (travel > 0 && !done) {
        const step = Math.min(0.25, travel);
        travel -= step;
        b.x += b.vx * step;
        b.y += b.vy * step;
        b.range -= step;
        const cx = Math.round(b.x);
        const cy = Math.round(b.y);
        if (this.isWall(cx, cy)) break;
        for (let dy = -1; dy <= 1 && !done; dy += 1) {
          for (let dx = -1; dx <= 1 && !done; dx += 1) {
            const list = this.soldierGrid.get((cy + dy) * w + cx + dx);
            if (!list) continue;
            for (const s of list) {
              if (s.owner.team === b.team || !s.owner.alive) continue;
              if (s.f && !s.owner.followers.includes(s.f)) continue;
              if ((s.x - b.x) ** 2 + (s.y - b.y) ** 2 > (s.f ? bodyR2 : leadR2)) continue;
              this.damage(s.owner, s.f, b.dmg, this.players.get(b.owner) || null, b.weapon, b.x, b.y);
              this.emit('bhit', { b: b.id, x: r2(b.x), y: r2(b.y) });
              done = true;
              break;
            }
          }
        }
        if (b.range <= 0) break;
      }
      if (!done && b.range > 0 && !this.isWall(Math.round(b.x), Math.round(b.y))) keep.push(b);
    }
    this.bullets = keep;
  }

  damage(owner, follower, dmg, attacker, how, x, y) {
    if (!owner.alive || owner.shield > 0) return;
    const by = attacker ? attacker.id : null;
    if (!follower) {
      owner.hp -= dmg;
      this.emit('hit', { id: owner.id, by, x: r2(x), y: r2(y), dmg: Math.round(dmg), lead: 1 });
      if (owner.hp <= 0) this.kill(owner, attacker, how);
      return;
    }
    follower.hp -= dmg;
    this.emit('hit', { id: owner.id, by, x: r2(x), y: r2(y), dmg: Math.round(dmg), lead: 0 });
    if (follower.hp > 0) return;
    const i = owner.followers.indexOf(follower);
    if (i < 0) return;
    owner.followers.splice(i, 1);
    if (attacker && attacker.team !== owner.team) attacker.downs += 1;
    if (Math.random() < CONFIG.tagChance) this.addLoot('tag', follower.x, follower.y);
    this.emit('down', { id: owner.id, by, x: r2(follower.x), y: r2(follower.y) });
  }

  kill(p, killer, how) {
    if (!p.alive) return;
    p.alive = false;
    p.deaths += 1;
    p.respawn = CONFIG.respawn;
    p.fireHeld = false;
    this.dropLoot(p);
    let streak = 0;
    if (killer && killer !== p && killer.team !== p.team) {
      killer.kills += 1;
      killer.streak = this.tickCount - killer.lastKill <= 100 ? killer.streak + 1 : 1;
      killer.lastKill = this.tickCount;
      streak = killer.streak;
      if (this.phase === 'live') this.score[killer.team] += 1;
      if (killer.bot) this.botChat(killer, 'kill', 0.12);
    }
    if (p.bot) this.botChat(p, 'death', 0.1);
    this.emit('kill', {
      killer: killer ? killer.id : null,
      victim: p.id,
      how,
      streak,
      squad: p.followers.length,
      x: r2(p.x),
      y: r2(p.y)
    });
    p.followers = [];
  }

  dropLoot(p) {
    for (const f of p.followers) if (Math.random() < CONFIG.tagChance) this.addLoot('tag', f.x, f.y);
    if (p.weapon !== 'pistol') this.addLoot(p.weapon === 'golden' ? 'golden' : 'weapon', p.x, p.y, p.weapon);
  }

  throwGrenade(p, type) {
    if (p[type] < 1) return;
    p[type] -= 1;
    this.grenades.push({
      id: this.uid++,
      type,
      owner: p.id,
      team: p.team,
      x: p.x,
      y: p.y,
      vx: Math.cos(p.aim),
      vy: Math.sin(p.aim),
      range: clamp(p.aimDist, 2, CONFIG.grenadeRange),
      fuse: -1
    });
    this.emit('throw', { id: p.id, g: type, x: r2(p.x), y: r2(p.y) });
  }

  updateGrenades(alive) {
    const keep = [];
    for (const g of this.grenades) {
      if (g.fuse < 0) {
        let travel = CONFIG.grenadeSpeed * DT;
        while (travel > 0 && g.range > 0) {
          const step = Math.min(0.25, travel);
          const nx = g.x + g.vx * step;
          const ny = g.y + g.vy * step;
          if (this.isWall(Math.round(nx), Math.round(ny))) {
            g.range = 0;
            break;
          }
          g.x = nx;
          g.y = ny;
          g.range -= step;
          travel -= step;
        }
        if (g.range > 0) {
          keep.push(g);
          continue;
        }
        g.fuse = g.type === 'he' ? 0.6 : g.type === 'flash' ? 0.3 : 0;
      }
      g.fuse -= DT;
      if (g.fuse > 0) {
        keep.push(g);
        continue;
      }
      this.detonate(g, alive);
    }
    this.grenades = keep;
  }

  detonate(g, alive) {
    const owner = this.players.get(g.owner) || null;
    const seen = (x, y) => lineClear(this.map, g.x, g.y, x, y);
    if (g.type === 'he') {
      this.emit('he', { x: r2(g.x), y: r2(g.y), id: g.owner });
      for (const p of alive) {
        if (!p.alive || p.team === g.team) continue;
        for (const s of this.soldiersOf(p)) {
          const d = Math.hypot(s.x - g.x, s.y - g.y);
          if (d > CONFIG.heRadius || !seen(s.x, s.y)) continue;
          this.damage(p, s.f, CONFIG.heDamage * (1 - d / (CONFIG.heRadius + 0.6)), owner, 'he', s.x, s.y);
          if (!p.alive) break;
        }
      }
    } else if (g.type === 'flash') {
      const hit = [];
      for (const p of alive) {
        if (!p.alive || p.team === g.team) continue;
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        if (d > CONFIG.flashRadius || !seen(p.x, p.y)) continue;
        p.flashed = Math.max(p.flashed, CONFIG.flashTime * (1 - d / (CONFIG.flashRadius + 3)) + 0.4);
        hit.push(p.id);
      }
      this.emit('flash', { x: r2(g.x), y: r2(g.y), id: g.owner, hit });
    } else {
      this.smokes.push({ x: g.x, y: g.y, r: CONFIG.smokeRadius, ttl: CONFIG.smokeTime });
      this.emit('smoke', { x: r2(g.x), y: r2(g.y) });
    }
  }

  updateSmokes() {
    for (const s of this.smokes) s.ttl -= DT;
    this.smokes = this.smokes.filter((s) => s.ttl > 0);
  }

  addLoot(kind, x, y, weapon = null) {
    const item = { id: this.uid++, kind, x, y, w: weapon, ttl: kind === 'tag' ? 25 : Infinity };
    this.loot.push(item);
    return item;
  }

  spawnLoot() {
    const regular = this.loot.filter((l) => l.kind !== 'tag' && l.kind !== 'golden').length;
    if (regular >= CONFIG.lootMax) return;
    const total = Object.values(LOOT).reduce((s, l) => s + l.weight, 0);
    for (let i = 0; i < 20; i += 1) {
      const c = pick(this.lootCells);
      if (this.loot.some((l) => Math.hypot(l.x - c.x, l.y - c.y) < 4)) continue;
      if ([...this.players.values()].some((p) => p.alive && Math.hypot(p.x - c.x, p.y - c.y) < 3)) continue;
      let roll = Math.random() * total;
      let kind = 'recruit';
      for (const [k, v] of Object.entries(LOOT)) {
        roll -= v.weight;
        if (roll <= 0) {
          kind = k;
          break;
        }
      }
      this.addLoot(kind, c.x, c.y, kind === 'weapon' ? pick(LOOT_WEAPONS) : null);
      return;
    }
  }

  updateLoot(alive) {
    this.lootTimer -= DT;
    if (this.lootTimer <= 0) {
      this.lootTimer = CONFIG.lootEvery;
      this.spawnLoot();
    }
    if (this.phase === 'live') {
      const goldenOut =
        this.loot.some((l) => l.kind === 'golden') || [...this.players.values()].some((p) => p.alive && p.weapon === 'golden');
      if (goldenOut) this.goldenTimer = CONFIG.goldenEvery;
      else {
        this.goldenTimer -= DT;
        if (this.goldenTimer <= 0) {
          this.goldenTimer = CONFIG.goldenEvery;
          this.addLoot('golden', this.center.x, this.center.y, 'golden');
          this.emit('golden', { x: this.center.x, y: this.center.y });
        }
      }
    }
    for (const l of this.loot) l.ttl -= DT;
    this.loot = this.loot.filter((l) => l.ttl > 0);
    for (const p of alive) {
      if (!p.alive) continue;
      for (let i = this.loot.length - 1; i >= 0; i -= 1) {
        const l = this.loot[i];
        if (Math.hypot(l.x - p.x, l.y - p.y) > 0.8 || !this.applyLoot(p, l)) continue;
        this.loot.splice(i, 1);
        this.emit('pickup', { id: p.id, k: l.kind, w: l.w, x: r2(l.x), y: r2(l.y) });
        if (l.kind === 'golden' && p.bot) this.botChat(p, 'golden', 0.6);
      }
    }
  }

  applyLoot(p, l) {
    switch (l.kind) {
      case 'recruit':
      case 'tag':
        return this.addFollower(p);
      case 'medkit':
        if (p.hp >= CONFIG.leaderHp) return false;
        p.hp = Math.min(CONFIG.leaderHp, p.hp + CONFIG.medkitHeal);
        return true;
      case 'weapon':
      case 'golden':
        if (p.weapon === l.w) return false;
        if (p.weapon !== 'pistol' && p.weapon !== 'golden') {
          this.addLoot('weapon', p.x - Math.cos(p.angle) * 1.4, p.y - Math.sin(p.angle) * 1.4, p.weapon);
        }
        p.weapon = l.w;
        p.ammo = WEAPONS[l.w].mag;
        p.reload = 0;
        p.cd = 0.2;
        return true;
      case 'he':
      case 'flash':
      case 'smoke':
        if (p[l.kind] >= 1) return false;
        p[l.kind] = 1;
        return true;
      default:
        return false;
    }
  }

  updateVision() {
    this.fogOn = FOG_PHASES.has(this.phase);
    if (!this.fogOn) return;
    for (const team of ['T', 'CT']) {
      const sources = [];
      for (const p of this.players.values()) {
        if (!p.alive || p.team !== team) continue;
        sources.push({ x: p.x, y: p.y, r: CONFIG.visionLeader });
        for (const f of p.followers) sources.push({ x: f.x, y: f.y, r: CONFIG.visionFollower });
      }
      computeVision(this.map, sources, this.smokes, this.vision[team]);
    }
  }

  canSee(team, p) {
    if (!this.fogOn || p.team === team) return true;
    const mask = this.vision[team];
    const w = this.map.width;
    if (mask[Math.round(p.y) * w + Math.round(p.x)]) return true;
    return p.followers.some((f) => mask[Math.round(f.y) * w + Math.round(f.x)] === 1);
  }

  heardBy(team, p) {
    if (!this.fogOn || !p.moving) return false;
    for (const o of this.players.values()) {
      if (o.alive && o.team === team && Math.hypot(o.x - p.x, o.y - p.y) <= CONFIG.hearRadius) return true;
    }
    return false;
  }

  viewFor(snap, team) {
    if (!this.fogOn || !team) return snap;
    if (![...this.players.values()].some((p) => p.alive && p.team === team)) return snap;
    const noises = [];
    const players = snap.p.map((sp) => {
      if (sp.tm === team || !sp.a) return sp;
      const p = this.players.get(sp.id);
      if (!p || this.canSee(team, p)) return sp;
      if ((this.tickCount + p.noiseSeed) % 6 === 0 && this.heardBy(team, p)) {
        noises.push([r1(p.x + Math.random() * 2 - 1), r1(p.y + Math.random() * 2 - 1)]);
      }
      return { ...sp, s: [], h: 1 };
    });
    const mask = this.vision[team];
    const w = this.map.width;
    const seen = (x, y) => mask[Math.round(y) * w + Math.round(x)] === 1;
    return {
      ...snap,
      p: players,
      gr: snap.gr.filter((g) => g[6] === (team === 'T' ? 0 : 1) || seen(g[2], g[3])),
      ns: noises,
      fog: 1
    };
  }

  snapshot() {
    const players = [];
    for (const p of this.players.values()) {
      const s = [];
      if (p.alive) {
        s.push(r1(p.x), r1(p.y));
        for (const f of p.followers) s.push(r1(f.x), r1(f.y));
      }
      players.push({
        id: p.id,
        n: p.name,
        b: p.bot ? 1 : 0,
        tm: p.team,
        a: p.alive ? 1 : 0,
        s,
        an: r2(p.angle),
        am: r2(p.aim),
        ad: r1(p.aimDist),
        hp: Math.max(0, Math.round(p.hp)),
        w: p.weapon,
        mg: p.ammo,
        rl: r1(Math.max(0, p.reload)),
        he: p.he,
        fl: p.flash,
        sm: p.smoke,
        k: p.kills,
        dt: p.deaths,
        dn: p.downs,
        sh: p.shield > 0 ? 1 : 0,
        fx: r1(Math.max(0, p.flashed)),
        rs: r1(Math.max(0, p.respawn)),
        mv: p.moving ? 1 : 0,
        im: p.started ? 0 : 1,
        sq: p.spawnSeq,
        sk: p.skin,
        pg: p.ping
      });
    }
    return {
      t: this.tickCount,
      tk: TICK_MS,
      ph: this.phase,
      tm: r1(Math.max(0, this.time)),
      sc: [this.score.T, this.score.CT],
      goal: this.opts.scoreToWin,
      ts: this.opts.teamSize,
      p: players,
      lt: this.loot.map((l) => [l.id, l.kind, l.w || '', r1(l.x), r1(l.y)]),
      nb: this.newBullets,
      gr: this.grenades.map((g) => [g.id, g.type, r2(g.x), r2(g.y), 0, 0, g.team === 'T' ? 0 : 1]),
      sm: this.smokes.map((s) => [r1(s.x), r1(s.y), r1(s.ttl)]),
      mw: this.winner,
      ev: this.events
    };
  }
}

Object.assign(Game.prototype, bots);
