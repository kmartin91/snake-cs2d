import { Game } from '../public/shared/game.js';

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
  }

  makeCode() {
    for (let i = 0; i < 50; i += 1) {
      let code = '';
      for (let j = 0; j < 4; j += 1) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  create({ isPublic = false, teamSize, bots = true, winRounds } = {}) {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const code = this.makeCode();
    if (!code) return null;
    const game = new Game({
      teamSize: clampInt(teamSize, 1, 5, PUBLIC_TEAM_SIZE),
      bots: bots !== false,
      difficulty: 'normal',
      winRounds: clampInt(winRounds, 2, 10, 5)
    });
    const room = { code, game, isPublic, sockets: new Set(), createdAt: Date.now() };
    room.interval = setInterval(() => this.io.to(code).emit('s', game.step()), game.tickMs);
    this.rooms.set(code, room);
    return room;
  }

  humans(room) {
    return room.game.humanCount();
  }

  quickMatch() {
    const candidates = [...this.rooms.values()]
      .filter((r) => r.isPublic && this.humans(r) < MAX_HUMANS && r.game.phase !== 'matchover')
      .sort((a, b) => this.humans(b) - this.humans(a));
    return candidates[0] || this.create({ isPublic: true, teamSize: PUBLIC_TEAM_SIZE, bots: true });
  }

  join(room, socket, name) {
    if (this.humans(room) >= MAX_HUMANS) return { ok: false, error: 'Salle pleine' };
    this.leave(socket);
    room.sockets.add(socket.id);
    socket.join(room.code);
    socket.data.room = room.code;
    const player = room.game.addPlayer({ id: socket.id, name });
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
