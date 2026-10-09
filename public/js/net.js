import { Game } from '../shared/game.js';

export class LocalSession {
  constructor({ name, team, teamSize, difficulty, winRounds, skin }, onSnap) {
    this.online = false;
    this.selfId = 'me';
    this.paused = false;
    this.onSnap = onSnap;
    this.game = new Game({ teamSize, difficulty, winRounds, bots: true });
    this.game.addPlayer({ id: this.selfId, name, skin, team: team === 'T' || team === 'CT' ? team : null });
    this.timer = setInterval(() => {
      if (this.paused) return;
      const snap = this.game.step();
      this.onSnap(this.game.viewFor(snap, this.game.players.get(this.selfId)?.team));
    }, this.game.tickMs);
  }

  send(msg) {
    this.game.input(this.selfId, msg);
  }

  chat(text) {
    this.game.chat(this.selfId, text);
  }

  setPaused(paused) {
    this.paused = paused;
  }

  restart() {
    this.game.startMatch();
  }

  leave() {
    clearInterval(this.timer);
  }
}

export class DemoSession {
  constructor(onSnap) {
    this.online = false;
    this.selfId = null;
    this.game = new Game({ teamSize: 4, difficulty: 'hard', bots: true });
    this.game.startMatch();
    this.timer = setInterval(() => onSnap(this.game.step()), this.game.tickMs);
  }

  leave() {
    clearInterval(this.timer);
  }
}

let socketPromise = null;

export function getSocket() {
  if (!socketPromise) {
    socketPromise = import('/socket.io/socket.io.esm.min.js')
      .then(({ io }) => io({ transports: ['websocket', 'polling'], reconnection: true }))
      .catch((err) => {
        socketPromise = null;
        throw err;
      });
  }
  return socketPromise;
}

export function request(socket, event, payload, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Le serveur ne répond pas')), timeout);
    const done = (res) => {
      clearTimeout(timer);
      resolve(res);
    };
    if (payload === undefined) socket.emit(event, done);
    else socket.emit(event, payload, done);
  });
}

export class OnlineSession {
  constructor(socket, info, onSnap, onClose) {
    this.online = true;
    this.socket = socket;
    this.selfId = info.id;
    this.code = info.code;
    this.ping = 0;
    this.onPing = null;
    this.handleSnap = (snap) => onSnap(snap);
    this.handleDisconnect = () => onClose('Connexion perdue avec le serveur');
    socket.on('s', this.handleSnap);
    socket.on('disconnect', this.handleDisconnect);
    this.pingTimer = setInterval(() => {
      const t = performance.now();
      socket.emit('pg', t, () => {
        this.ping = Math.round(performance.now() - t);
        socket.emit('lat', this.ping);
        if (this.onPing) this.onPing(this.ping);
      });
    }, 2000);
  }

  send(msg) {
    this.socket.emit('i', msg);
  }

  chat(text) {
    this.socket.emit('chat', text);
  }

  setPaused() {}

  leave() {
    clearInterval(this.pingTimer);
    this.socket.off('s', this.handleSnap);
    this.socket.off('disconnect', this.handleDisconnect);
    if (this.socket.connected) this.socket.emit('leave');
  }
}
