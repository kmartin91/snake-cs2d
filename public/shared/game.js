import { DIRS, CONFIG, TICK_MS, timings, SHOP, DIFFICULTY, ZONE, SPAWNS, T_ROUTES, BOT_NAMES } from './config.js';
import { MAP_ROWS, parseMap } from './map.js';
import { computeVision, FOG_PHASES } from './vision.js';
import { SKINS, SKIN_IDS } from './skins.js';
import { enemyOf, opposite, clamp, rand, pick, same, shuffle, flatten } from './utils.js';
import * as bots from './bots.js';
import * as combat from './combat.js';
import * as objectives from './objectives.js';

function createPlayer(id, name, bot, team) {
  return {
    id,
    skin: 'classic',
    name,
    bot,
    team,
    alive: false,
    snake: [],
    dir: 0,
    queue: [],
    growBy: 0,
    spawnSeq: 0,
    moved: 0,
    steps: 0,
    stepping: false,
    nh: null,
    money: CONFIG.money.start,
    kills: 0,
    deaths: 0,
    mvps: 0,
    roundKills: 0,
    streak: 0,
    lastKillTick: -999,
    armor: false,
    he: 0,
    flash: 0,
    smoke: 0,
    kit: false,
    extBought: false,
    stamina: CONFIG.staminaMax,
    boostHeld: false,
    boosting: false,
    boostLocked: false,
    actionHeld: false,
    acting: null,
    fireHeld: false,
    wantFire: false,
    wantThrow: null,
    fireCd: 0,
    flashed: 0,
    respawn: 0,
    survived: false,
    hasBomb: false,
    ping: 0,
    joinedAt: Date.now(),
    ai: bot ? { goal: null, retarget: 0, seen: 0, waypoint: null, site: 'A', pathLen: 0 } : null
  };
}

function freshBomb() {
  return {
    state: 'none',
    x: 0,
    y: 0,
    carrier: null,
    timer: 0,
    planter: null,
    plantProgress: 0,
    defuser: null,
    defuseProgress: 0,
    site: null
  };
}

export class Game {
  constructor(opts = {}) {
    const winRounds = clamp(Number(opts.winRounds) || CONFIG.winRounds, 2, 10);
    this.opts = {
      teamSize: clamp(Number(opts.teamSize) || 3, 1, 5),
      bots: opts.bots !== false,
      difficulty: DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal',
      winRounds,
      halftime: winRounds - 1
    };
    this.tickMs = TICK_MS;
    this.T = timings(this.tickMs);
    this.map = parseMap(MAP_ROWS);
    const n = this.map.width * this.map.height;
    this.occ = {
      T: { p: new Int16Array(n), s: new Int16Array(n) },
      CT: { p: new Int16Array(n), s: new Int16Array(n) }
    };
    this.selfMark = new Int32Array(n);
    this.vision = { T: new Uint8Array(n), CT: new Uint8Array(n) };
    this.fogOn = false;
    this.selfStamp = 0;
    this.bfsSeen = new Int32Array(n);
    this.bfsFirst = new Int8Array(n);
    this.bfsDist = new Int16Array(n);
    this.bfsQueue = new Int32Array(n);
    this.bfsStamp = 0;
    this.occList = [];

    this.players = new Map();
    this.tickCount = 0;
    this.phase = 'idle';
    this.timer = 0;
    this.round = 0;
    this.score = { T: 0, CT: 0 };
    this.crates = [];
    this.pellets = [];
    this.bullets = [];
    this.grenades = [];
    this.smokes = [];
    this.bomb = freshBomb();
    this.events = [];
    this.roundResult = null;
    this.matchWinner = null;
    this.swapPending = false;
    this.halftimeDone = false;
    this.uid = 1;
    this.plan = 'A';
    this.botSeq = 0;
    this.lastBotChat = -999;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  isWall(x, y) {
    const { width, height, wall } = this.map;
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    return wall[y * width + x] === 1;
  }

  zoneAt(x, y) {
    if (this.isWall(x, y)) return ZONE.NONE;
    return this.map.zone[y * this.map.width + x];
  }

  siteAt(x, y) {
    const z = this.zoneAt(x, y);
    if (z === ZONE.A) return 'A';
    if (z === ZONE.B) return 'B';
    return null;
  }

  inSmoke(x, y) {
    for (const s of this.smokes) {
      if (Math.hypot(s.x - x, s.y - y) <= s.r) return true;
    }
    return false;
  }

  lineOfSight(a, b) {
    let x0 = a.x;
    let y0 = a.y;
    const dx = Math.abs(b.x - x0);
    const dy = -Math.abs(b.y - y0);
    const sx = x0 < b.x ? 1 : -1;
    const sy = y0 < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (this.isWall(x0, y0)) return false;
      if (x0 === b.x && y0 === b.y) return true;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
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

  cellOccupied(x, y) {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const s of p.snake) if (s.x === x && s.y === y) return true;
    }
    return false;
  }

  randomFreeCell(avoidSpawns = true) {
    const { floor, zone, width } = this.map;
    for (let i = 0; i < 300; i += 1) {
      const c = pick(floor);
      const z = zone[c.y * width + c.x];
      if (avoidSpawns && (z === ZONE.T || z === ZONE.CT)) continue;
      if (this.cellOccupied(c.x, c.y)) continue;
      if (this.crates.some((k) => same(k, c))) continue;
      if (this.bomb.state === 'ground' && same(this.bomb, c)) continue;
      return { x: c.x, y: c.y };
    }
    return null;
  }

  addPlayer({ id, name, bot = false, team = null, skin = 'classic' }) {
    if (this.players.has(id)) return this.players.get(id);

    let chosen = team === 'T' || team === 'CT' ? team : null;
    if (!chosen) {
      const humans = (t) => this.teamMembers(t).filter((p) => !p.bot).length;
      const hT = humans('T');
      const hC = humans('CT');
      if (hT !== hC) {
        chosen = hT < hC ? 'T' : 'CT';
      } else {
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

    if (this.phase === 'idle') {
      this.startMatch();
    } else if (this.phase === 'freeze' || this.phase === 'warmup') {
      this.spawnAnywhere(p);
    } else {
      p.alive = false;
      p.respawn = 0;
    }
    return p;
  }

  replaceBotFor(team) {
    if (!this.opts.bots) return;
    const members = this.teamMembers(team);
    if (members.length <= this.opts.teamSize) return;
    const bots = members.filter((p) => p.bot);
    const victim =
      bots.find((b) => !b.alive) ||
      (this.phase === 'freeze' || this.phase === 'warmup' || this.phase === 'idle' ? bots[0] : null);
    if (victim) this.removePlayer(victim.id, true);
  }

  removePlayer(id, silent = false) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.alive && p.hasBomb) this.dropBomb(p.snake[0]);
    if (p.alive) this.dropPellets(p.snake, 1);
    p.alive = false;
    this.players.delete(id);
    if (!silent) this.emit('leave', { id, name: p.name });

    if (this.humanCount() === 0 && !this.opts.bots) {
      this.phase = 'idle';
      return;
    }
    if (this.players.size === 0) {
      this.phase = 'idle';
    }
  }

  renamePlayer(id, name) {
    const p = this.players.get(id);
    if (p) p.name = String(name).slice(0, 16);
  }

  fillBots() {
    for (const team of ['T', 'CT']) {
      const members = this.teamMembers(team);
      const humans = members.filter((p) => !p.bot);
      const bots = members.filter((p) => p.bot);
      const want = this.opts.bots ? Math.max(0, this.opts.teamSize - humans.length) : 0;
      while (bots.length > want) {
        const b = bots.pop();
        this.players.delete(b.id);
      }
      while (bots.length < want) {
        const used = new Set([...this.players.values()].map((p) => p.name));
        const free = BOT_NAMES.filter((n) => !used.has(`BOT ${n}`));
        const name = `BOT ${free.length ? pick(free) : `${pick(BOT_NAMES)}${rand(99)}`}`;
        this.botSeq += 1;
        const b = createPlayer(`bot-${this.botSeq}`, name, true, team);
        b.skin = Math.random() < 0.45 ? 'classic' : pick(SKINS).id;
        this.players.set(b.id, b);
        bots.push(b);
      }
    }
  }

  autoBalance() {
    const hT = this.teamMembers('T').filter((p) => !p.bot);
    const hC = this.teamMembers('CT').filter((p) => !p.bot);
    if (Math.abs(hT.length - hC.length) < 2) return;
    const [big, target] = hT.length > hC.length ? [hT, 'CT'] : [hC, 'T'];
    const mover = big.sort((a, b) => b.joinedAt - a.joinedAt)[0];
    mover.team = target;
    mover.armor = false;
    mover.kit = false;
    this.emit('teamswitch', { id: mover.id, name: mover.name, team: target });
  }

  startMatch() {
    this.score = { T: 0, CT: 0 };
    this.round = 0;
    this.halftimeDone = false;
    this.swapPending = false;
    this.matchWinner = null;
    this.roundResult = null;
    for (const p of this.players.values()) {
      p.money = CONFIG.money.start;
      p.kills = 0;
      p.deaths = 0;
      p.mvps = 0;
      p.armor = false;
      p.he = 0;
      p.flash = 0;
      p.smoke = 0;
      p.kit = false;
      p.survived = false;
    }
    this.autoBalance();
    this.fillBots();
    if (!this.teamsReady()) {
      this.startWarmup();
      return;
    }
    this.emit('matchstart', { winRounds: this.opts.winRounds });
    this.startRound();
  }

  startWarmup() {
    this.phase = 'warmup';
    this.timer = 0;
    this.resetEntities();
    for (const p of this.players.values()) {
      p.money = CONFIG.money.max;
      this.spawnAnywhere(p);
    }
    this.emit('warmup');
  }

  resetEntities() {
    this.crates = [];
    this.pellets = [];
    this.bullets = [];
    this.grenades = [];
    this.smokes = [];
    this.bomb = freshBomb();
    for (const p of this.players.values()) {
      p.alive = false;
      p.snake = [];
      p.hasBomb = false;
    }
  }

  startRound() {
    if (this.swapPending) {
      this.swapPending = false;
      this.halftimeDone = true;
      for (const p of this.players.values()) {
        p.team = p.team === 'T' ? 'CT' : 'T';
        p.money = CONFIG.money.start;
        p.armor = false;
        p.he = 0;
        p.flash = 0;
        p.smoke = 0;
        p.kit = false;
        p.survived = false;
      }
      this.emit('halftime');
    }

    this.round += 1;
    this.autoBalance();
    this.fillBots();
    this.resetEntities();
    this.roundResult = null;

    for (const team of ['T', 'CT']) {
      const slots = shuffle([0, 1, 2, 3, 4]);
      this.teamMembers(team).forEach((p, i) => {
        if (!p.survived) {
          p.armor = false;
          p.he = 0;
          p.flash = 0;
          p.smoke = 0;
          p.kit = false;
        }
        this.spawnPlayer(p, slots[i % slots.length]);
      });
    }

    const ts = this.teamMembers('T').filter((p) => p.alive);
    if (ts.length) {
      const carrier = pick(ts);
      carrier.hasBomb = true;
      this.bomb.state = 'carried';
      this.bomb.carrier = carrier.id;
      this.bomb.x = carrier.snake[0].x;
      this.bomb.y = carrier.snake[0].y;
    }

    this.plan = Math.random() < 0.5 ? 'A' : 'B';
    let ctIndex = rand(2);
    for (const p of this.players.values()) {
      if (!p.bot) continue;
      p.ai.goal = null;
      p.ai.retarget = 0;
      p.ai.seen = 0;
      if (p.team === 'T') {
        p.ai.waypoint = pick(T_ROUTES[this.plan]);
      } else {
        p.ai.site = ctIndex % 2 === 0 ? 'A' : 'B';
        ctIndex += 1;
        p.ai.waypoint = null;
      }
      this.botBuy(p);
    }

    this.phase = 'freeze';
    this.timer = this.T.freeze;
    this.refillCrates(true);
    this.emit('freeze', { round: this.round });
    if (Math.random() < 0.35) {
      const bot = pick([...this.players.values()].filter((p) => p.bot));
      if (bot) this.botChat(bot, 'start', 1);
    }
  }

  spawnPlayer(p, slot) {
    const s = SPAWNS[p.team][slot % SPAWNS[p.team].length];
    const D = DIRS[s.d];
    p.snake = [];
    for (let i = 0; i < CONFIG.startLength; i += 1) {
      p.snake.push({ x: s.x - D.x * i, y: s.y - D.y * i });
    }
    this.resetLife(p, s.d);
  }

  resetLife(p, dir) {
    p.dir = dir;
    p.queue = [];
    p.growBy = 0;
    p.alive = true;
    p.stamina = CONFIG.staminaMax;
    p.boostLocked = false;
    p.boosting = false;
    p.fireCd = 0;
    p.flashed = 0;
    p.actionHeld = false;
    p.acting = null;
    p.wantThrow = null;
    p.wantFire = false;
    p.hasBomb = false;
    p.moved = 0;
    p.respawn = 0;
    p.roundKills = 0;
    p.extBought = false;
    p.spawnSeq += 1;
  }

  spawnAnywhere(p) {
    const slots = shuffle([0, 1, 2, 3, 4]);
    for (const slot of slots) {
      const s = SPAWNS[p.team][slot];
      const D = DIRS[s.d];
      let free = true;
      for (let i = 0; i < CONFIG.startLength; i += 1) {
        if (this.cellOccupied(s.x - D.x * i, s.y - D.y * i)) {
          free = false;
          break;
        }
      }
      if (free) {
        this.spawnPlayer(p, slot);
        return true;
      }
    }
    p.alive = false;
    p.respawn = 5;
    return false;
  }

  endRound(winner, reason) {
    if (this.phase !== 'live' && this.phase !== 'planted') return;
    this.phase = 'over';
    this.timer = this.T.result;
    this.score[winner] += 1;

    let mvp = null;
    for (const p of this.players.values()) {
      p.survived = p.alive;
      const bonus = p.team === winner ? CONFIG.money.win : CONFIG.money.loss;
      p.money = Math.min(CONFIG.money.max, p.money + bonus);
      if (p.team === winner && (!mvp || p.roundKills > mvp.roundKills)) mvp = p;
    }
    if (reason === 'defuse' && this.bomb.defuser) mvp = this.players.get(this.bomb.defuser) || mvp;
    if (reason === 'bomb' && this.bomb.planter && (!mvp || mvp.roundKills < 2)) {
      mvp = this.players.get(this.bomb.planter) || mvp;
    }
    if (mvp) mvp.mvps += 1;

    this.roundResult = { winner, reason, mvp: mvp ? mvp.id : null };
    this.emit('roundend', { winner, reason, mvp: mvp ? mvp.id : null });

    const winBot = pick([...this.players.values()].filter((p) => p.bot && p.team === winner));
    if (winBot) this.botChat(winBot, 'win', 0.3);

    if (this.score[winner] >= this.opts.winRounds) {
      this.matchWinner = winner;
    } else if (!this.halftimeDone && this.score.T + this.score.CT === this.opts.halftime) {
      this.swapPending = true;
    }
  }

  input(id, msg) {
    const p = this.players.get(id);
    if (!p || !Array.isArray(msg)) return;
    const [type, v] = msg;
    switch (type) {
      case 'd': {
        const d = Number(v);
        if (!Number.isInteger(d) || d < 0 || d > 3 || !p.alive) return;
        if (this.phase === 'freeze') {
          const h = p.snake[0];
          const neck = p.snake[1];
          const nx = h.x + DIRS[d].x;
          const ny = h.y + DIRS[d].y;
          if (!neck || neck.x !== nx || neck.y !== ny) p.dir = d;
          p.queue.length = 0;
          return;
        }
        const last = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
        if (d === last) return;
        if (p.queue.length < 3) p.queue.push(d);
        return;
      }
      case 'a':
        p.actionHeld = Boolean(v);
        return;
      case 'b':
        p.boostHeld = Boolean(v);
        return;
      case 'f':
        p.fireHeld = Boolean(v);
        return;
      case 'g':
        if (v === 'he' || v === 'flash' || v === 'smoke') p.wantThrow = v;
        return;
      case 'buy':
        this.buy(p, v);
        return;
      default:
    }
  }

  chat(id, text) {
    const p = this.players.get(id);
    if (!p) return;
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!clean) return;
    this.emit('chat', { id, name: p.name, team: p.team, text: clean });
  }

  canBuy() {
    return this.phase === 'freeze' || this.phase === 'warmup';
  }

  buy(p, itemId) {
    const item = SHOP.find((s) => s.id === itemId);
    if (!item) return false;
    const fail = (msg) => {
      if (!p.bot) this.emit('buyfail', { to: p.id, msg });
      return false;
    };
    if (!this.canBuy()) return fail('Achats uniquement pendant le freeze time');
    if (item.team && item.team !== p.team) return fail('Réservé aux CT');
    if (item.id === 'armor' && p.armor) return fail('Déjà équipé');
    if (item.id === 'kit' && p.kit) return fail('Déjà équipé');
    if ((item.id === 'he' || item.id === 'flash' || item.id === 'smoke') && p[item.id] >= 1) {
      return fail('Une seule par type');
    }
    if (item.id === 'ext' && p.extBought) return fail('Déjà acheté ce round');
    const free = this.phase === 'warmup';
    if (!free && p.money < item.price) return fail('Pas assez d\'argent');
    if (!free) p.money -= item.price;

    if (item.id === 'armor') p.armor = true;
    else if (item.id === 'kit') p.kit = true;
    else if (item.id === 'ext') {
      p.extBought = true;
      p.growBy += 5;
    } else p[item.id] += 1;

    this.emit('buy', { id: p.id, item: item.id });
    return true;
  }

  step() {
    this.tickCount += 1;
    switch (this.phase) {
      case 'warmup':
        if (this.teamsReady()) {
          this.startMatch();
          break;
        }
        this.simulate();
        this.warmupRespawns();
        break;
      case 'freeze':
        if (!this.teamsReady()) {
          this.startWarmup();
          break;
        }
        this.timer -= 1;
        if (this.timer <= 0) {
          this.phase = 'live';
          this.timer = this.T.round;
          for (const p of this.players.values()) p.wantThrow = null;
          this.emit('live');
        }
        break;
      case 'live':
        if (!this.teamsReady()) {
          this.startWarmup();
          break;
        }
        this.simulate();
        if (this.phase === 'live') {
          this.timer -= 1;
          if (this.timer <= 0) this.endRound('CT', 'time');
        }
        break;
      case 'planted':
        this.simulate();
        break;
      case 'over':
        this.simulate();
        this.timer -= 1;
        if (this.timer <= 0) {
          if (this.matchWinner) {
            this.phase = 'matchover';
            this.timer = this.T.matchOver;
            this.emit('matchend', { winner: this.matchWinner });
          } else {
            this.startRound();
          }
        }
        break;
      case 'matchover':
        this.timer -= 1;
        if (this.timer <= 0) this.startMatch();
        break;
      default:
    }
    this.updateVision();
    const snap = this.snapshot();
    this.events = [];
    return snap;
  }

  warmupRespawns() {
    for (const p of this.players.values()) {
      if (p.alive) continue;
      p.respawn -= 1;
      if (p.respawn <= 0) this.spawnAnywhere(p);
    }
  }

  alivePlayers() {
    const out = [];
    for (const p of this.players.values()) if (p.alive) out.push(p);
    return out;
  }

  simulate() {
    const alive = this.alivePlayers();

    for (const p of alive) {
      if (p.fireCd > 0) p.fireCd -= 1;
      if (p.flashed > 0) p.flashed -= 1;
    }

    this.buildOcc(alive);
    for (const p of alive) {
      if (p.bot) this.botThink(p, alive);
    }

    for (const p of alive) p.acting = this.actingOf(p);

    for (const p of alive) {
      p.moved = 0;
      p.boosting = false;
      p.steps = p.acting ? 0 : 1;
      if (p.stamina < CONFIG.boostCost) p.boostLocked = true;
      if (p.boostLocked && p.stamina >= CONFIG.boostRestart) p.boostLocked = false;
      if (p.steps && p.boostHeld && !p.boostLocked) {
        p.steps = 2;
        p.boosting = true;
        p.stamina -= CONFIG.boostCost;
      } else {
        p.stamina = Math.min(CONFIG.staminaMax, p.stamina + CONFIG.staminaRegen);
      }
    }

    for (let sub = 0; sub < 2; sub += 1) {
      const movers = alive.filter((p) => p.alive && p.steps > sub);
      if (!movers.length) break;
      this.moveStep(movers, alive);
    }

    for (const p of alive) {
      if (!p.alive) continue;
      if ((p.fireHeld || p.wantFire) && p.fireCd === 0 && p.snake.length >= CONFIG.minFireLength) {
        this.fire(p);
      }
      p.wantFire = false;
      if (p.wantThrow) {
        this.throwGrenade(p, p.wantThrow);
        p.wantThrow = null;
      }
    }

    this.updateBullets(alive);
    this.updateGrenades(alive);
    this.updateSmokes();
    this.updateObjectives(alive);
    this.refillCrates(false);

    if (this.phase === 'live' || this.phase === 'planted') this.checkWin();
  }

  buildOcc(alive) {
    const { width } = this.map;
    this.occ.T.p.fill(-1);
    this.occ.CT.p.fill(-1);
    this.occList = alive;
    for (let pi = 0; pi < alive.length; pi += 1) {
      const p = alive[pi];
      if (!p.alive) continue;
      const grid = this.occ[p.team];
      const skipTail = p.stepping && p.growBy === 0 ? 1 : 0;
      for (let s = p.snake.length - 1 - skipTail; s >= 0; s -= 1) {
        const c = p.snake[s];
        const i = c.y * width + c.x;
        grid.p[i] = pi;
        grid.s[i] = s;
      }
    }
  }

  occAt(x, y, team) {
    if (this.isWall(x, y)) return null;
    const grid = this.occ[team];
    const i = y * this.map.width + x;
    const pi = grid.p[i];
    if (pi < 0) return null;
    const p = this.occList[pi];
    if (!p || !p.alive) return null;
    return { p, seg: grid.s[i] };
  }

  hitsSelf(m, x, y) {
    const last = m.snake.length - (m.growBy === 0 ? 1 : 0);
    for (let i = 1; i < last; i += 1) {
      if (m.snake[i].x === x && m.snake[i].y === y) return true;
    }
    return false;
  }

  moveStep(movers, alive) {
    for (const m of movers) m.stepping = true;
    this.buildOcc(alive);

    for (const m of movers) {
      while (m.queue.length) {
        const d = m.queue.shift();
        if (d !== m.dir && d !== opposite(m.dir)) {
          m.dir = d;
          break;
        }
      }
      const h = m.snake[0];
      const D = DIRS[m.dir];
      m.nh = { x: h.x + D.x, y: h.y + D.y };
    }

    const dead = new Map();
    const heads = new Map();
    const { width } = this.map;

    for (const m of movers) {
      const { x, y } = m.nh;
      if (this.isWall(x, y)) {
        dead.set(m, { killer: null, how: 'wall' });
        continue;
      }
      if (this.hitsSelf(m, x, y)) {
        dead.set(m, { killer: null, how: 'self' });
      } else {
        const hit = this.occAt(x, y, enemyOf(m.team));
        if (hit) {
          const o = hit.p;
          if (hit.seg === 0 && o.stepping && o.nh && same(o.nh, m.snake[0])) {
            this.resolveHeadOn(m, [o], dead);
          } else {
            dead.set(m, { killer: o, how: 'body' });
          }
        }
      }
      const key = y * width + x;
      if (!heads.has(key)) heads.set(key, []);
      heads.get(key).push(m);
    }

    for (const group of heads.values()) {
      if (group.length < 2) continue;
      for (const m of group) {
        const enemies = group.filter((o) => o.team !== m.team);
        if (enemies.length) this.resolveHeadOn(m, enemies, dead);
      }
    }

    for (const m of movers) {
      m.stepping = false;
      if (dead.has(m)) continue;
      m.snake.unshift(m.nh);
      if (m.growBy > 0) m.growBy -= 1;
      else m.snake.pop();
      m.moved += 1;
      this.collect(m);
    }

    for (const [p, info] of dead) this.kill(p, info.killer, info.how);
  }

  resolveHeadOn(m, enemies, dead) {
    if (dead.has(m)) return;
    const strongest = enemies.reduce((a, b) => (b.snake.length > a.snake.length ? b : a));
    if (m.snake.length <= strongest.snake.length) dead.set(m, { killer: strongest, how: 'headon' });
  }

  collect(p) {
    const h = p.snake[0];
    const ci = this.crates.findIndex((c) => same(c, h));
    if (ci >= 0) {
      this.crates.splice(ci, 1);
      p.growBy += CONFIG.crateGrow;
      this.emit('pickup', { id: p.id, k: 'crate', x: h.x, y: h.y });
    }
    const pi = this.pellets.findIndex((c) => same(c, h));
    if (pi >= 0) {
      this.pellets.splice(pi, 1);
      p.growBy += 1;
      this.emit('pickup', { id: p.id, k: 'pellet', x: h.x, y: h.y });
    }
    if (this.bomb.state === 'ground' && p.team === 'T' && same(this.bomb, h)) {
      this.bomb.state = 'carried';
      this.bomb.carrier = p.id;
      p.hasBomb = true;
      this.emit('bombpick', { id: p.id });
    }
  }

  dropPellets(cells, every = 2) {
    for (let i = 1; i < cells.length; i += every) {
      if (this.pellets.length >= CONFIG.maxPellets) break;
      const c = cells[i];
      if (!this.pellets.some((k) => same(k, c))) this.pellets.push({ x: c.x, y: c.y });
    }
  }

  kill(p, killer, how) {
    if (!p.alive) return;
    const head = p.snake[0];
    p.alive = false;
    p.deaths += 1;
    p.respawn = this.T.warmupRespawn;
    p.acting = null;
    if (p.hasBomb) this.dropBomb(head);
    p.hasBomb = false;
    this.dropPellets(p.snake, 1);
    p.snake = [];

    let streak = 0;
    if (killer && killer !== p && killer.team !== p.team) {
      killer.kills += 1;
      killer.roundKills += 1;
      if (this.phase !== 'warmup') {
        killer.money = Math.min(CONFIG.money.max, killer.money + CONFIG.money.kill);
      }
      killer.streak = this.tickCount - killer.lastKillTick <= 45 ? killer.streak + 1 : 1;
      killer.lastKillTick = this.tickCount;
      streak = killer.streak;
      if (killer.bot) this.botChat(killer, 'kill', 0.18);
    }
    if (p.bot) this.botChat(p, 'death', 0.15);

    const enemiesLeft = [...this.players.values()].filter((o) => o.team === p.team && o.alive).length;
    const ace = Boolean(killer && killer.roundKills >= 5 && enemiesLeft === 0);
    this.emit('kill', {
      killer: killer && killer !== p ? killer.id : null,
      victim: p.id,
      how,
      streak,
      ace,
      x: head ? head.x : 0,
      y: head ? head.y : 0
    });
  }

  cut(p, index, killer, how) {
    if (!p.alive || index <= 0 || index >= p.snake.length) return;
    const removed = p.snake.splice(index);
    this.dropPellets([removed[0], ...removed], 2);
    this.emit('cut', {
      victim: p.id,
      by: killer ? killer.id : null,
      n: removed.length,
      x: removed[0].x,
      y: removed[0].y
    });
    if (p.snake.length < 2) this.kill(p, killer, how);
  }

  refillCrates(force) {
    if (!force && this.tickCount % 12 !== 0) return;
    const alive = this.alivePlayers().length;
    const target = clamp(3 + Math.floor(alive / 2), 3, 8);
    let guard = 0;
    while (this.crates.length < target && guard < 10) {
      guard += 1;
      const c = this.randomFreeCell(true);
      if (c) this.crates.push(c);
      if (!force) break;
    }
  }

  updateVision() {
    this.fogOn = FOG_PHASES.has(this.phase);
    if (!this.fogOn) return;
    for (const team of ['T', 'CT']) {
      const heads = [];
      for (const p of this.players.values()) if (p.alive && p.team === team) heads.push(p.snake[0]);
      computeVision(this.map, heads, this.smokes, this.vision[team]);
    }
  }

  canSee(team, p) {
    if (!this.fogOn || p.team === team) return true;
    const mask = this.vision[team];
    const w = this.map.width;
    return p.snake.some((c) => mask[c.y * w + c.x] === 1);
  }

  viewFor(snap, team) {
    if (!this.fogOn || !team) return snap;
    if (![...this.players.values()].some((p) => p.alive && p.team === team)) return snap;
    const mask = this.vision[team];
    const w = this.map.width;
    const seen = (x, y) => mask[y * w + x] === 1;
    const enemy = team === 'T' ? 1 : 0;
    const players = snap.p.map((p) => {
      if (p.tm === team || !p.a) return p;
      for (let i = 0; i < p.s.length; i += 2) if (seen(p.s[i], p.s[i + 1])) return p;
      return { ...p, s: [], hb: 0, ac: null, h: 1 };
    });
    const bomb = { ...snap.bomb };
    if (team === 'CT' && (bomb.s === 'ground' || bomb.s === 'carried') && !seen(bomb.x, bomb.y)) bomb.s = 'unknown';
    return {
      ...snap,
      p: players,
      bu: snap.bu.filter((b) => b[5] !== enemy || seen(b[1], b[2]) || seen(b[3], b[4])),
      gr: snap.gr.filter((g) => g[6] !== enemy || seen(g[2], g[3]) || seen(g[4], g[5])),
      bomb,
      fog: 1
    };
  }

  snapshot() {
    const b = this.bomb;
    const defuser = b.defuser ? this.players.get(b.defuser) : null;
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id,
        n: p.name,
        b: p.bot ? 1 : 0,
        tm: p.team,
        a: p.alive ? 1 : 0,
        s: flatten(p.snake),
        d: p.dir,
        mv: p.moved,
        sq: p.spawnSeq,
        $: p.money,
        k: p.kills,
        dt: p.deaths,
        mvp: p.mvps,
        ar: p.armor ? 1 : 0,
        he: p.he,
        fl: p.flash,
        sm: p.smoke,
        kit: p.kit ? 1 : 0,
        st: Math.round(p.stamina),
        bo: p.boosting ? 1 : 0,
        fx: p.flashed,
        cd: p.fireCd,
        ac: p.acting,
        hb: p.hasBomb ? 1 : 0,
        gb: p.growBy,
        pg: p.ping,
        rs: p.respawn,
        sk: p.skin
      });
    }
    return {
      t: this.tickCount,
      tk: this.tickMs,
      ph: this.phase,
      tm: this.timer,
      rd: this.round,
      sc: [this.score.T, this.score.CT],
      wr: this.opts.winRounds,
      ts: this.opts.teamSize,
      p: players,
      cr: flatten(this.crates),
      pe: flatten(this.pellets),
      bu: this.bullets.map((x) => [x.id, x.x, x.y, x.px, x.py, x.team === 'T' ? 0 : 1, x.done ? 1 : 0]),
      gr: this.grenades.map((g) => [g.id, g.type, g.x, g.y, g.px, g.py, g.team === 'T' ? 0 : 1]),
      sm: this.smokes.map((s) => [s.x, s.y, s.ttl]),
      bomb: {
        s: b.state,
        x: b.x,
        y: b.y,
        c: b.carrier,
        t: b.timer,
        pp: b.plantProgress,
        dp: b.defuseProgress,
        dn: defuser && defuser.kit ? this.T.defuseKit : this.T.defuse,
        site: b.site
      },
      rr: this.roundResult,
      mw: this.matchWinner,
      ev: this.events
    };
  }
}

Object.assign(Game.prototype, bots, combat, objectives);
