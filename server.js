import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from './server/rooms.js';

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const rooms = new RoomManager(io);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, ...rooms.stats() }));

const MSG_PER_SEC = 60;

function allow(socket) {
  const now = Date.now();
  const rate = socket.data.rate;
  if (now - rate.at > 1000) {
    rate.at = now;
    rate.count = 0;
  }
  rate.count += 1;
  return rate.count <= MSG_PER_SEC;
}

const safeName = (name) => String(name || 'Joueur').slice(0, 16);
const reply = (ack, payload) => typeof ack === 'function' && ack(payload);

io.on('connection', (socket) => {
  socket.data.room = null;
  socket.data.rate = { at: Date.now(), count: 0 };
  socket.data.lastChat = 0;

  socket.on('rooms', (ack) => reply(ack, { list: rooms.list(), ...rooms.stats() }));

  socket.on('quick', (payload, ack) => {
    const room = rooms.quickMatch();
    if (!room) return reply(ack, { ok: false, error: 'Serveur plein' });
    reply(ack, rooms.join(room, socket, safeName(payload?.name)));
  });

  socket.on('create', (payload, ack) => {
    const room = rooms.create({
      isPublic: Boolean(payload?.isPublic),
      teamSize: payload?.teamSize,
      bots: payload?.bots,
      winRounds: payload?.winRounds
    });
    if (!room) return reply(ack, { ok: false, error: 'Serveur plein' });
    reply(ack, rooms.join(room, socket, safeName(payload?.name)));
  });

  socket.on('join', (payload, ack) => {
    const code = String(payload?.code || '').trim().toUpperCase();
    const room = rooms.rooms.get(code);
    if (!room) return reply(ack, { ok: false, error: `Salle ${code || '?'} introuvable` });
    reply(ack, rooms.join(room, socket, safeName(payload?.name)));
  });

  socket.on('leave', () => rooms.leave(socket));

  socket.on('i', (msg) => {
    if (!Array.isArray(msg) || msg.length > 2 || !allow(socket)) return;
    rooms.roomOf(socket)?.game.input(socket.id, msg);
  });

  socket.on('chat', (text) => {
    const now = Date.now();
    if (now - socket.data.lastChat < 700) return;
    socket.data.lastChat = now;
    rooms.roomOf(socket)?.game.chat(socket.id, text);
  });

  socket.on('pg', (t, ack) => reply(ack, t));

  socket.on('lat', (ms) => {
    const player = rooms.roomOf(socket)?.game.players.get(socket.id);
    if (player) player.ping = Math.max(0, Math.min(999, Math.round(Number(ms) || 0)));
  });

  socket.on('disconnect', () => rooms.leave(socket));
});

httpServer.listen(PORT, () => {
  console.log(`Snake CS2D sur http://localhost:${PORT}`);
});
