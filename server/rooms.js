import { Game } from '../public/shared/game.js';
import { MODES } from '../public/shared/modes.js';
import { EloStore } from './elo.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_ROOMS = 200;
const MAX_HUMANS = 10;
const PUBLIC_TEAM_SIZE = 4;

const clampInt = (v, min, max, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.elo = new EloStore();
  }

  makeCode() {
    for (let i = 0; i < 50; i += 1) {
      let code = '';
      for (let j = 0; j < 4; j += 1) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  create({ isPublic = false, teamSize, bots = true, scoreToWin, mode } = {}) {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const code = this.makeCode();
    if (!code) return null;
    const game = new Game({
      teamSize: clampInt(teamSize, 1, 5, PUBLIC_TEAM_SIZE),
      bots: bots !== false,
      difficulty: 'normal',
      scoreToWin: clampInt(scoreToWin, 5, 100, 25),
      mode: MODES[mode] ? mode : 'tdm'
    });
    const room = { code, game, isPublic, sockets: new Set(), createdAt: Date.now() };
    room.interval = setInterval(() => this.broadcast(room), game.tickMs);
    this.rooms.set(code, room);
    return room;
  }

  broadcast(room) {
    let snap;
    try {
      snap = room.game.step();
    } catch (err) {
      console.error(`Salle ${room.code} : erreur de tick`, err);
      return;
    }
    const end = room.game.mode === 'classic' && snap.ev.find((e) => e.type === 'matchend');
    if (end) this.rateMatch(room, end.winner);
    const views = {};
    for (const id of room.sockets) {
      const team = room.game.players.get(id)?.team || 'none';
      if (!views[team]) views[team] = room.game.viewFor(snap, team === 'none' ? null : team);
      this.io.to(id).emit('s', views[team]);
    }
  }

  rateMatch(room, winner) {
    const sides = { T: { humans: [], bots: 0 }, CT: { humans: [], bots: 0 } };
    const tokens = new Map();
    for (const p of room.game.players.values()) {
      if (p.bot) {
        sides[p.team].bots += 1;
        continue;
      }
      const socket = this.io.sockets.sockets.get(p.id);
      if (!socket) continue;
      const token = socket.data.token;
      sides[p.team].humans.push({ token, name: p.name });
      tokens.set(token, socket);
    }
    const results = this.elo.applyMatch(sides, winner);
    for (const [token, result] of results) {
      tokens.get(token)?.emit('elo', { ...result, rank: this.elo.rank(token) });
    }
  }

  humans(room) {
    return room.game.humanCount();
  }

  quickMatch(mode) {
    const wanted = MODES[mode] ? mode : 'tdm';
    const candidates = [...this.rooms.values()]
      .filter((r) => r.isPublic && r.game.mode === wanted && this.humans(r) < MAX_HUMANS && r.game.phase !== 'matchover')
      .sort((a, b) => this.humans(b) - this.humans(a));
    return candidates[0] || this.create({ isPublic: true, teamSize: PUBLIC_TEAM_SIZE, bots: true, mode: wanted });
  }

  join(room, socket, name, skin, token) {
    if (this.humans(room) >= MAX_HUMANS) return { ok: false, error: 'Salle pleine' };
    this.leave(socket);
    room.sockets.add(socket.id);
    socket.join(room.code);
    socket.data.room = room.code;
    socket.data.token = /^[\w-]{8,64}$/.test(token) ? token : socket.id;
    this.elo.get(socket.data.token, name);
    const player = room.game.addPlayer({ id: socket.id, name, skin });
    return {
      ok: true,
      code: room.code,
      id: socket.id,
      team: player.team,
      isPublic: room.isPublic,
      opts: room.game.opts
    };
  }

  leave(socket) {
    const code = socket.data.room;
    if (!code) return;
    socket.data.room = null;
    socket.leave(code);
    const room = this.rooms.get(code);
    if (!room) return;
    room.sockets.delete(socket.id);
    room.game.removePlayer(socket.id);
    if (room.sockets.size === 0) {
      clearInterval(room.interval);
      this.rooms.delete(code);
    }
  }

  roomOf(socket) {
    const code = socket.data.room;
    return code ? this.rooms.get(code) : null;
  }

  list() {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic)
      .map((r) => ({
        code: r.code,
        humans: this.humans(r),
        max: MAX_HUMANS,
        teamSize: r.game.opts.teamSize,
        mode: r.game.mode,
        round: r.game.round,
        score: [r.game.score.T, r.game.score.CT],
        phase: r.game.phase
      }));
  }

  stats() {
    let players = 0;
    for (const r of this.rooms.values()) players += this.humans(r);
    return { rooms: this.rooms.size, players };
  }
}
