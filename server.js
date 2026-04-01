const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const TICK_MS = 130;

const GRID = {
  width: 34,
  height: 22
};

const START_LENGTH = 4;
const MAX_CRATES = 4;
const ROUND_FREEZE_TICKS = 24;
const RESPAWN_TICKS = 20;
const ROUND_RESULT_TICKS = 18;
const PLANT_TICKS = 8;
const DEFUSE_TICKS = 10;
const BOMB_TIMER_TICKS = Math.round(40_000 / TICK_MS);
const MATCH_WIN_ROUNDS = 13;
const HALFTIME_AFTER_ROUNDS = 12;
const MATCH_RESULT_TICKS = 46;

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const SPAWNS = {
  T: [
    { x: 3, y: 3 },
    { x: 5, y: 4 },
    { x: 4, y: 6 }
  ],
  CT: [
    { x: GRID.width - 4, y: GRID.height - 4 },
    { x: GRID.width - 6, y: GRID.height - 5 },
    { x: GRID.width - 5, y: GRID.height - 7 }
  ]
};

const SITE = {
  x: Math.floor(GRID.width / 2),
  y: Math.floor(GRID.height / 2)
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*'
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const state = {
  tick: 0,
  roundFreezeTicks: ROUND_FREEZE_TICKS,
  roundsPlayed: 0,
  didHalftimeSwap: false,
  matchOver: false,
  matchResultTicks: 0,
  roundResult: {
    show: false,
    winner: null,
    reason: '',
    ticksLeft: 0
  },
  players: new Map(),
  crates: [],
  bomb: {
    state: 'ground',
    x: SITE.x,
    y: 2,
    carrierId: null,
    timer: BOMB_TIMER_TICKS,
    plantBy: null,
    plantProgress: 0,
    defuseBy: null,
    defuseProgress: 0
  },
  score: {
    T: 0,
    CT: 0
  },
  lastEvent: 'Round started! Ts: grab the bomb and plant with E. CTs: defuse with E.'
};

function randInt(max) {
  return Math.floor(Math.random() * max);
}

function wrapPos(pos) {
  return {
    x: (pos.x + GRID.width) % GRID.width,
    y: (pos.y + GRID.height) % GRID.height
  };
}

function samePos(a, b) {
  return a.x === b.x && a.y === b.y;
}

function directionOpposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

function randomEmptyCell() {
  for (let i = 0; i < 500; i += 1) {
    const p = { x: randInt(GRID.width), y: randInt(GRID.height) };
    if (isCellFree(p)) {
      return p;
    }
  }
  return { x: randInt(GRID.width), y: randInt(GRID.height) };
}

function isCellFree(pos) {
  for (const player of state.players.values()) {
    for (const segment of player.snake) {
      if (samePos(segment, pos)) return false;
    }
  }

  if (state.bomb.state === 'ground' && samePos(pos, state.bomb)) return false;
  if (samePos(pos, SITE)) return false;

  return !state.crates.some((c) => samePos(c, pos));
}

function buildSnake(head, dir) {
  const snake = [head];
  const backward = { x: -dir.x, y: -dir.y };
  let cursor = head;

  for (let i = 1; i < START_LENGTH; i += 1) {
    cursor = wrapPos({ x: cursor.x + backward.x, y: cursor.y + backward.y });
    snake.push(cursor);
  }

  return snake;
}

function countFaction(faction) {
  let count = 0;
  for (const p of state.players.values()) {
    if (p.faction === faction) count += 1;
  }
  return count;
}

function assignFaction() {
  const tCount = countFaction('T');
  const ctCount = countFaction('CT');
  return tCount <= ctCount ? 'T' : 'CT';
}

function spawnPlayer(player) {
  const points = SPAWNS[player.faction];
  const spawn = points[randInt(points.length)];
  const dir = player.faction === 'T' ? DIRECTIONS.right : DIRECTIONS.left;

  player.direction = dir;
  player.nextDirection = dir;
  player.snake = buildSnake(spawn, dir);
  player.growBy = 0;
  player.alive = true;
  player.hasBomb = false;
  player.actionHeld = false;
  player.respawnTicks = 0;
}

function dropBomb(pos, playerId = null) {
  state.bomb.state = 'ground';
  state.bomb.x = pos.x;
  state.bomb.y = pos.y;
  state.bomb.carrierId = null;
  state.bomb.timer = BOMB_TIMER_TICKS;
  state.bomb.plantBy = playerId;
  state.bomb.plantProgress = 0;
  state.bomb.defuseBy = null;
  state.bomb.defuseProgress = 0;
}

function resetBomb() {
  const bombPos = randomEmptyCell();
  state.bomb.state = 'ground';
  state.bomb.x = bombPos.x;
  state.bomb.y = bombPos.y;
  state.bomb.carrierId = null;
  state.bomb.timer = BOMB_TIMER_TICKS;
  state.bomb.plantBy = null;
  state.bomb.plantProgress = 0;
  state.bomb.defuseBy = null;
  state.bomb.defuseProgress = 0;
}

function refillCrates() {
  while (state.crates.length < MAX_CRATES) {
    state.crates.push(randomEmptyCell());
  }
}

function resetRound(message) {
  state.roundFreezeTicks = ROUND_FREEZE_TICKS;
  state.lastEvent = message;
  state.bomb.plantProgress = 0;
  state.bomb.plantBy = null;
  state.bomb.defuseProgress = 0;
  state.bomb.defuseBy = null;

  for (const player of state.players.values()) {
    spawnPlayer(player);
  }

  state.crates = [];
  resetBomb();
  refillCrates();
}

function swapFactions() {
  for (const player of state.players.values()) {
    player.faction = player.faction === 'T' ? 'CT' : 'T';
    player.hasBomb = false;
    player.actionHeld = false;
  }
}

function resetMatch(message) {
  state.score.T = 0;
  state.score.CT = 0;
  state.roundsPlayed = 0;
  state.didHalftimeSwap = false;
  state.matchOver = false;
  state.matchResultTicks = 0;
  state.roundResult = {
    show: false,
    winner: null,
    reason: '',
    ticksLeft: 0
  };
  resetRound(message);
}

function endRound(winner, reason) {
  state.roundsPlayed += 1;
  state.score[winner] += 1;
  state.roundResult = {
    show: true,
    winner,
    reason,
    ticksLeft: ROUND_RESULT_TICKS
  };

  const reachedMatchPoint =
    state.score.T >= MATCH_WIN_ROUNDS || state.score.CT >= MATCH_WIN_ROUNDS;

  if (reachedMatchPoint) {
    state.matchOver = true;
    state.matchResultTicks = MATCH_RESULT_TICKS;
    state.lastEvent = `${winner} win the match ${state.score.T}-${state.score.CT}.`;
    resetRound(`${winner} win the match - ${reason}`);
    return;
  }

  if (!state.didHalftimeSwap && state.roundsPlayed >= HALFTIME_AFTER_ROUNDS) {
    state.didHalftimeSwap = true;
    swapFactions();
    resetRound(`${winner} win the round - ${reason}. Halftime: teams swapped.`);
    return;
  }

  resetRound(`${winner} win the round - ${reason}`);
}

function killPlayer(player, byFaction = null, deathPos = null) {
  if (!player.alive) return;
  player.alive = false;
  player.deaths += 1;
  player.respawnTicks = RESPAWN_TICKS;

  if (player.hasBomb) {
    dropBomb(deathPos || player.snake[0], player.id);
  }

  player.hasBomb = false;

  if (byFaction && byFaction !== player.faction) {
    state.lastEvent = `${byFaction} scored a frag.`;
  }
}

function allFactionDead(faction) {
  let any = false;
  for (const p of state.players.values()) {
    if (p.faction !== faction) continue;
    any = true;
    if (p.alive) return false;
  }
  return any;
}

function serialize() {
  return {
    tick: state.tick,
    grid: GRID,
    site: SITE,
    roundFreezeTicks: state.roundFreezeTicks,
    roundsPlayed: state.roundsPlayed,
    didHalftimeSwap: state.didHalftimeSwap,
    matchOver: state.matchOver,
    matchResultTicks: state.matchResultTicks,
    matchWinRounds: MATCH_WIN_ROUNDS,
    roundResult: state.roundResult,
    players: [...state.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      faction: p.faction,
      snake: p.snake,
      alive: p.alive,
      score: p.score,
      kills: p.kills,
      deaths: p.deaths,
      hasBomb: p.hasBomb,
      actionHeld: p.actionHeld,
      respawnTicks: p.respawnTicks
    })),
    crates: state.crates,
    bomb: {
      state: state.bomb.state,
      x: state.bomb.x,
      y: state.bomb.y,
      carrierId: state.bomb.carrierId,
      timer: state.bomb.timer,
      plantProgress: state.bomb.plantProgress,
      defuseProgress: state.bomb.defuseProgress
    },
    score: state.score,
    lastEvent: state.lastEvent
  };
}

function runTick() {
  state.tick += 1;

  if (state.roundResult.show && state.roundResult.ticksLeft > 0) {
    state.roundResult.ticksLeft -= 1;
    if (state.roundResult.ticksLeft <= 0) {
      state.roundResult.show = false;
    }
  }

  if (state.matchOver) {
    if (state.matchResultTicks > 0) {
      state.matchResultTicks -= 1;
      io.emit('state', serialize());
      return;
    }

    resetMatch('New match started! First to 13 rounds.');
    io.emit('state', serialize());
    return;
  }

  if (state.roundFreezeTicks > 0) {
    state.roundFreezeTicks -= 1;
    io.emit('state', serialize());
    return;
  }

  const livingPlayers = [...state.players.values()].filter((p) => p.alive);

  const nextHeads = new Map();
  const actionHolders = new Set();
  for (const player of livingPlayers) {
    const head = player.snake[0];
    const isPlantingHold =
      state.bomb.state === 'carried' &&
      state.bomb.carrierId === player.id &&
      player.faction === 'T' &&
      player.actionHeld &&
      samePos(head, SITE);
    const isDefusingHold =
      state.bomb.state === 'planted' &&
      player.faction === 'CT' &&
      player.actionHeld &&
      samePos(head, state.bomb);

    if (isPlantingHold || isDefusingHold) {
      actionHolders.add(player.id);
      nextHeads.set(player.id, head);
      continue;
    }

    if (!directionOpposite(player.nextDirection, player.direction)) {
      player.direction = player.nextDirection;
    }

    const step = DIRECTIONS[player.direction.name] || player.direction;
    const nextHead = wrapPos({ x: head.x + step.x, y: head.y + step.y });
    nextHeads.set(player.id, nextHead);
  }

  const occupiedBefore = [];
  for (const player of livingPlayers) {
    const isHoldingAction = actionHolders.has(player.id);
    const tailWillMove = !isHoldingAction && player.growBy === 0;
    const body = tailWillMove ? player.snake.slice(0, -1) : player.snake.slice();
    for (const seg of body) {
      occupiedBefore.push({ owner: player.id, pos: seg });
    }
  }

  const deadIds = new Set();
  const headCells = new Map();

  for (const [id, head] of nextHeads.entries()) {
    const key = `${head.x},${head.y}`;
    if (!headCells.has(key)) {
      headCells.set(key, []);
    }
    headCells.get(key).push(id);

    for (const occ of occupiedBefore) {
      if (samePos(head, occ.pos)) {
        const isOwnStationaryHead =
          actionHolders.has(id) &&
          occ.owner === id &&
          samePos(occ.pos, state.players.get(id).snake[0]);
        if (isOwnStationaryHead) {
          continue;
        }
        deadIds.add(id);
        break;
      }
    }
  }

  for (const ids of headCells.values()) {
    if (ids.length > 1) {
      ids.forEach((id) => deadIds.add(id));
    }
  }

  for (const player of livingPlayers) {
    const nextHead = nextHeads.get(player.id);

    if (deadIds.has(player.id)) {
      killPlayer(player, null, nextHead);
      continue;
    }

    if (!actionHolders.has(player.id)) {
      player.snake.unshift(nextHead);

      const crateIndex = state.crates.findIndex((c) => samePos(c, nextHead));
      if (crateIndex >= 0) {
        state.crates.splice(crateIndex, 1);
        player.growBy += 2;
        player.score += 1;
        state.lastEvent = `${player.name} grabbed utility and grew.`;
      }

      if (player.growBy > 0) {
        player.growBy -= 1;
      } else {
        player.snake.pop();
      }

      if (state.bomb.state === 'ground' && player.faction === 'T' && samePos(nextHead, state.bomb)) {
        state.bomb.state = 'carried';
        state.bomb.carrierId = player.id;
        player.hasBomb = true;
        state.lastEvent = `${player.name} picked up the bomb.`;
      }
    }

    const effectiveHead = actionHolders.has(player.id) ? player.snake[0] : nextHead;

    if (state.bomb.state === 'carried' && state.bomb.carrierId === player.id) {
      state.bomb.x = effectiveHead.x;
      state.bomb.y = effectiveHead.y;

      if (samePos(effectiveHead, SITE) && player.faction === 'T' && player.actionHeld) {
        state.bomb.plantBy = player.id;
        state.bomb.plantProgress += 1;
        if (state.bomb.plantProgress >= PLANT_TICKS) {
          state.bomb.state = 'planted';
          state.bomb.carrierId = null;
          player.hasBomb = false;
          state.bomb.timer = BOMB_TIMER_TICKS;
          state.bomb.defuseProgress = 0;
          state.bomb.defuseBy = null;
          state.lastEvent = `${player.name} planted the bomb!`;
        }
      } else {
        state.bomb.plantProgress = 0;
        state.bomb.plantBy = null;
      }
    }
  }

  for (const player of state.players.values()) {
    if (!player.alive && player.respawnTicks > 0) {
      player.respawnTicks -= 1;
      if (player.respawnTicks === 0) {
        spawnPlayer(player);
        player.actionHeld = false;
      }
    }
  }

  if (state.bomb.state === 'planted') {
    state.bomb.timer -= 1;

    const defusers = [...state.players.values()].filter(
      (p) => p.alive && p.faction === 'CT' && p.actionHeld && samePos(p.snake[0], state.bomb)
    );

    if (defusers.length > 0) {
      const defuser = defusers[0];
      if (state.bomb.defuseBy === defuser.id) {
        state.bomb.defuseProgress += 1;
      } else {
        state.bomb.defuseBy = defuser.id;
        state.bomb.defuseProgress = 1;
      }

      if (state.bomb.defuseProgress >= DEFUSE_TICKS) {
        endRound('CT', `${defuser.name} defused the bomb`);
      }
    } else {
      state.bomb.defuseBy = null;
      state.bomb.defuseProgress = 0;
    }

    if (state.bomb.timer <= 0) {
      endRound('T', 'bomb exploded');
    }
  }

  if (state.bomb.state !== 'planted' && allFactionDead('T')) {
    endRound('CT', 'all terrorists eliminated');
  }

  if (allFactionDead('CT')) {
    endRound('T', 'all counter-terrorists eliminated');
  }

  refillCrates();
  io.emit('state', serialize());
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    const safeName = String(name || 'Player').trim().slice(0, 18) || 'Player';
    const faction = assignFaction();

    const player = {
      id: socket.id,
      name: safeName,
      faction,
      direction: faction === 'T' ? DIRECTIONS.right : DIRECTIONS.left,
      nextDirection: faction === 'T' ? DIRECTIONS.right : DIRECTIONS.left,
      snake: [],
      growBy: 0,
      alive: true,
      hasBomb: false,
      actionHeld: false,
      score: 0,
      kills: 0,
      deaths: 0,
      respawnTicks: 0
    };

    spawnPlayer(player);
    state.players.set(socket.id, player);
    refillCrates();
    state.lastEvent = `${safeName} joined as ${faction}.`;

    socket.emit('joined', { id: socket.id, faction });
    io.emit('state', serialize());
  });

  socket.on('input', (dirName) => {
    const player = state.players.get(socket.id);
    if (!player) return;

    const dir = DIRECTIONS[dirName];
    if (!dir) return;

    player.nextDirection = { ...dir, name: dirName };
  });

  socket.on('action', (isHeld) => {
    const player = state.players.get(socket.id);
    if (!player) return;

    player.actionHeld = Boolean(isHeld);
  });

  socket.on('disconnect', () => {
    const player = state.players.get(socket.id);
    if (!player) return;

    if (player.hasBomb && player.snake[0]) {
      dropBomb(player.snake[0], socket.id);
    }

    state.players.delete(socket.id);
    state.lastEvent = `${player.name} disconnected.`;
    io.emit('state', serialize());
  });
});

setInterval(runTick, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`SnakeCS2D running on http://localhost:${PORT}`);
});
