const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stageEl = document.getElementById('stage');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('nameInput');
const joinBox = document.getElementById('joinBox');
const rulesModal = document.getElementById('rulesModal');
const rulesBtn = document.getElementById('rulesBtn');

const phaseEl = document.getElementById('phase');
const eventEl = document.getElementById('event');
const scoreTEl = document.getElementById('scoreT');
const scoreCTEl = document.getElementById('scoreCT');
const leaderboardEl = document.getElementById('leaderboard');
const touchButtons = Array.from(document.querySelectorAll('.touch-btn[data-dir]'));
const touchActionBtn = document.getElementById('touchAction');

const colors = {
  T: '#ff6645',
  CT: '#4fc4ff',
  site: '#79ff9e',
  crate: '#f8d66d',
  bomb: '#ff2f2f'
};

let selfId = null;
let gameState = null;
let socket = null;
let eHeld = false;
let prevSnapshot = null;
let nextSnapshot = null;
let prevSnapshotAt = 0;
let nextSnapshotAt = 0;
let isAnimating = false;
let staticLayer = null;
let staticLayerKey = '';
let directionHoldTimer = null;
let hasJoined = false;
let rulesDismissed = false;
let prevRoundsPlayed = 0;
let prevMatchOver = false;
const renderSnakeCache = new Map();
const renderBombCache = { x: 0, y: 0, ready: false };
const INTERP_DELAY_MS = 130;
const SMOOTH_ALPHA = 0.32;

function formatTimer(ticks) {
  if (!gameState) return '--';
  const ms = ticks * (gameState.tickMs || 80);
  return (ms / 1000).toFixed(1);
}

function samePos(a, b) {
  return Boolean(a && b) && a.x === b.x && a.y === b.y;
}

function inSiteArea(pos, site, siteRadius = 2) {
  return (
    Boolean(pos && site) &&
    Math.abs(pos.x - site.x) <= siteRadius &&
    Math.abs(pos.y - site.y) <= siteRadius
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpWrap(a, b, size, t) {
  let delta = b - a;
  if (Math.abs(delta) > size / 2) {
    delta -= Math.sign(delta) * size;
  }

  let value = a + delta * t;
  if (value < 0) value += size;
  if (value >= size) value -= size;
  return value;
}

function smoothWrap(curr, target, size, alpha) {
  return lerpWrap(curr, target, size, alpha);
}

function cellRect(x, y, w, h, cellSize) {
  return {
    x: x * cellSize,
    y: y * cellSize,
    w: w * cellSize,
    h: h * cellSize
  };
}

function drawDust2Backdrop(lctx, grid, site, cellSize, siteRadius = 2) {
  const w = grid.width * cellSize;
  const h = grid.height * cellSize;

  const sand = lctx.createLinearGradient(0, 0, 0, h);
  sand.addColorStop(0, '#d1b077');
  sand.addColorStop(0.55, '#be9a60');
  sand.addColorStop(1, '#a9834f');
  lctx.fillStyle = sand;
  lctx.fillRect(0, 0, w, h);

  const lanes = [
    cellRect(1, 8, 32, 5, cellSize),
    cellRect(2, 5, 10, 4, cellSize),
    cellRect(22, 5, 10, 4, cellSize),
    cellRect(12, 4, 10, 3, cellSize),
    cellRect(12, 13, 10, 4, cellSize)
  ];
  lanes.forEach((r) => {
    lctx.fillStyle = 'rgba(228, 200, 145, 0.34)';
    lctx.fillRect(r.x, r.y, r.w, r.h);
  });

  const walls = [
    cellRect(0, 0, 34, 2, cellSize),
    cellRect(0, 20, 34, 2, cellSize),
    cellRect(0, 0, 2, 22, cellSize),
    cellRect(32, 0, 2, 22, cellSize),
    cellRect(6, 3, 2, 5, cellSize),
    cellRect(9, 2, 3, 3, cellSize),
    cellRect(24, 3, 2, 5, cellSize),
    cellRect(22, 2, 2, 3, cellSize),
    cellRect(15, 2, 4, 2, cellSize),
    cellRect(15, 17, 4, 2, cellSize),
    cellRect(4, 14, 4, 4, cellSize),
    cellRect(26, 14, 4, 4, cellSize),
    cellRect(11, 15, 2, 4, cellSize),
    cellRect(21, 15, 2, 4, cellSize)
  ];

  walls.forEach((r) => {
    lctx.fillStyle = '#7b5f3e';
    lctx.fillRect(r.x, r.y, r.w, r.h);
    lctx.strokeStyle = '#5f462b';
    lctx.lineWidth = 2;
    lctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  });

  for (let i = 0; i < 1400; i += 1) {
    const px = Math.random() * w;
    const py = Math.random() * h;
    const alpha = 0.03 + Math.random() * 0.08;
    const size = 0.8 + Math.random() * 1.7;
    lctx.fillStyle = `rgba(80, 58, 30, ${alpha.toFixed(3)})`;
    lctx.fillRect(px, py, size, size);
  }

  const size = siteRadius * 2 + 1;
  const siteRect = cellRect(site.x - siteRadius, site.y - siteRadius, size, size, cellSize);
  lctx.fillStyle = 'rgba(185, 51, 30, 0.25)';
  lctx.fillRect(siteRect.x, siteRect.y, siteRect.w, siteRect.h);
  lctx.strokeStyle = 'rgba(210, 70, 40, 0.65)';
  lctx.lineWidth = 3;
  lctx.strokeRect(siteRect.x + 1, siteRect.y + 1, siteRect.w - 2, siteRect.h - 2);
  lctx.fillStyle = 'rgba(90, 20, 10, 0.8)';
  lctx.font = `700 ${Math.max(18, cellSize * 1.1)}px Space Mono`;
  lctx.textAlign = 'center';
  lctx.textBaseline = 'middle';
  lctx.fillText('A', site.x * cellSize + cellSize / 2, site.y * cellSize + cellSize / 2);
  lctx.textAlign = 'start';
  lctx.textBaseline = 'alphabetic';

  lctx.strokeStyle = 'rgba(70, 42, 18, 0.18)';
  lctx.lineWidth = 1;
  for (let x = 0; x <= grid.width; x += 1) {
    const xPos = x * cellSize;
    lctx.beginPath();
    lctx.moveTo(xPos, 0);
    lctx.lineTo(xPos, h);
    lctx.stroke();
  }
  for (let y = 0; y <= grid.height; y += 1) {
    const yPos = y * cellSize;
    lctx.beginPath();
    lctx.moveTo(0, yPos);
    lctx.lineTo(w, yPos);
    lctx.stroke();
  }
}

function buildStaticLayer(grid, site, cellSize, siteRadius = 2) {
  const key = `${grid.width}x${grid.height}:${site.x},${site.y},${siteRadius}:${canvas.width}x${canvas.height}`;
  if (staticLayer && staticLayerKey === key) return staticLayer;

  const layer = document.createElement('canvas');
  layer.width = canvas.width;
  layer.height = canvas.height;
  const lctx = layer.getContext('2d');

  drawDust2Backdrop(lctx, grid, site, cellSize, siteRadius);

  staticLayer = layer;
  staticLayerKey = key;
  return staticLayer;
}

function getInterpolatedState() {
  if (!nextSnapshot) return null;
  if (!prevSnapshot || nextSnapshotAt <= prevSnapshotAt) return nextSnapshot;

  const now = performance.now() - INTERP_DELAY_MS;
  const t = Math.max(0, Math.min(1, (now - prevSnapshotAt) / (nextSnapshotAt - prevSnapshotAt)));

  const prevById = new Map(prevSnapshot.players.map((p) => [p.id, p]));
  const players = nextSnapshot.players.map((player) => {
    const prevPlayer = prevById.get(player.id);
    if (!prevPlayer) return player;

    const snake = player.snake.map((seg, idx) => {
      const prevSeg = prevPlayer.snake[idx];
      if (!prevSeg) return seg;
      return {
        x: lerpWrap(prevSeg.x, seg.x, nextSnapshot.grid.width, t),
        y: lerpWrap(prevSeg.y, seg.y, nextSnapshot.grid.height, t)
      };
    });

    return {
      ...player,
      snake
    };
  });

  const bomb = {
    ...nextSnapshot.bomb
  };
  if (prevSnapshot.bomb && nextSnapshot.bomb) {
    bomb.x = lerpWrap(prevSnapshot.bomb.x, nextSnapshot.bomb.x, nextSnapshot.grid.width, t);
    bomb.y = lerpWrap(prevSnapshot.bomb.y, nextSnapshot.bomb.y, nextSnapshot.grid.height, t);
    bomb.timer = Math.max(0, Math.round(lerp(prevSnapshot.bomb.timer, nextSnapshot.bomb.timer, t)));
  }

  return {
    ...nextSnapshot,
    players,
    bomb
  };
}

function fillCell(cell, cellSize, color, pad = 2) {
  ctx.fillStyle = color;
  ctx.fillRect(cell.x * cellSize + pad, cell.y * cellSize + pad, cellSize - pad * 2, cellSize - pad * 2);
}

function getSmoothedPlayers(renderState) {
  const { grid, players } = renderState;
  const liveIds = new Set(players.map((p) => p.id));
  for (const cachedId of renderSnakeCache.keys()) {
    if (!liveIds.has(cachedId)) renderSnakeCache.delete(cachedId);
  }

  return players.map((player) => {
    const targetSnake = player.snake || [];
    const cached = renderSnakeCache.get(player.id);

    if (!cached || cached.length !== targetSnake.length) {
      const initSnake = targetSnake.map((seg) => ({ x: seg.x, y: seg.y }));
      renderSnakeCache.set(player.id, initSnake);
      return { ...player, snake: initSnake };
    }

    const smoothed = cached.map((seg, idx) => {
      const target = targetSnake[idx];
      return {
        x: smoothWrap(seg.x, target.x, grid.width, SMOOTH_ALPHA),
        y: smoothWrap(seg.y, target.y, grid.height, SMOOTH_ALPHA)
      };
    });

    renderSnakeCache.set(player.id, smoothed);
    return { ...player, snake: smoothed };
  });
}

function getSmoothedBomb(renderState) {
  const { grid, bomb } = renderState;
  if (!bomb) return bomb;

  if (!renderBombCache.ready) {
    renderBombCache.x = bomb.x;
    renderBombCache.y = bomb.y;
    renderBombCache.ready = true;
    return bomb;
  }

  renderBombCache.x = smoothWrap(renderBombCache.x, bomb.x, grid.width, SMOOTH_ALPHA);
  renderBombCache.y = smoothWrap(renderBombCache.y, bomb.y, grid.height, SMOOTH_ALPHA);

  return {
    ...bomb,
    x: renderBombCache.x,
    y: renderBombCache.y
  };
}

function clearStaticLayer() {
  staticLayer = null;
  staticLayerKey = '';
}

function resizeCanvas() {
  const grid = gameState?.grid || { width: 34, height: 22 };
  const ratio = grid.width / grid.height;
  const stageW = Math.max(320, Math.floor(stageEl.clientWidth));
  const stageH = Math.max(220, Math.floor(stageEl.clientHeight));

  let width = stageW;
  let height = Math.floor(width / ratio);
  if (height > stageH) {
    height = stageH;
    width = Math.floor(height * ratio);
  }

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    clearStaticLayer();
  }

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function draw(renderState) {
  if (!renderState) return;

  const { grid, crates, site, siteRadius } = renderState;
  const players = getSmoothedPlayers(renderState);
  const bomb = getSmoothedBomb(renderState);
  const cellSize = canvas.width / grid.width;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(buildStaticLayer(grid, site, cellSize, siteRadius), 0, 0);

  crates.forEach((crate) => fillCell(crate, cellSize, colors.crate, 4));

  players.forEach((player) => {
    const bodyColor = player.faction === 'T' ? colors.T : colors.CT;
    const alpha = player.alive ? 1 : 0.2;

    player.snake.forEach((seg, index) => {
      ctx.fillStyle = index === 0 ? bodyColor : `${bodyColor}${alpha === 1 ? '' : '70'}`;
      fillCell(seg, cellSize, ctx.fillStyle, index === 0 ? 1.8 : 2.8);
    });

    if (player.snake[0]) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Space Mono';
      ctx.fillText(player.name, player.snake[0].x * cellSize + 2, player.snake[0].y * cellSize - 4);
    }
  });

  if (bomb.state === 'ground' || bomb.state === 'planted' || bomb.state === 'carried') {
    const pulse = bomb.state === 'planted' ? Math.sin(Date.now() / 120) * 1.2 + 3 : 3;
    fillCell({ x: bomb.x, y: bomb.y }, cellSize, colors.bomb, pulse);
  }

  if (gameState?.roundResult?.show || gameState?.matchOver) {
    drawRoundOverlay();
  }
}

function animationLoop() {
  const renderState = getInterpolatedState() || gameState;
  draw(renderState);
  requestAnimationFrame(animationLoop);
}

function drawRoundOverlay() {
  if (!gameState) return;

  const { roundResult, matchOver, score } = gameState;
  const winner = roundResult?.winner || (score.T >= score.CT ? 'T' : 'CT');
  const title = matchOver ? `${winner} WIN THE MATCH` : `${winner} WIN THE ROUND`;
  const subtitle = roundResult?.reason || 'Objective completed';

  ctx.fillStyle = 'rgba(2, 9, 15, 0.76)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.fillStyle = winner === 'T' ? colors.T : colors.CT;
  ctx.font = '700 56px Space Mono';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 22);

  ctx.fillStyle = '#f3f7f8';
  ctx.font = '700 24px Space Mono';
  ctx.fillText(`${score.T} - ${score.CT}`, canvas.width / 2, canvas.height / 2 + 20);

  ctx.fillStyle = '#c7d7dd';
  ctx.font = '16px Space Mono';
  ctx.fillText(subtitle, canvas.width / 2, canvas.height / 2 + 52);
  ctx.fillText(`Round ${gameState.roundsPlayed} | First to ${gameState.matchWinRounds}`, canvas.width / 2, canvas.height / 2 + 80);

  ctx.textAlign = 'start';
}

function updateHud() {
  if (!gameState) return;

  const planted = gameState.bomb.state === 'planted';
  const freeze = gameState.roundFreezeTicks > 0;
  const halftime = gameState.didHalftimeSwap ? ' (sides swapped)' : '';
  const phase = gameState.matchOver
    ? `Match point reached${halftime}`
    : freeze
      ? `Round break ${Math.ceil((gameState.roundFreezeTicks * (gameState.tickMs || 80)) / 1000)}s${halftime}`
      : planted
        ? `Bomb planted - ${formatTimer(gameState.bomb.timer)}s`
        : `Live round - ${Math.max(0, ((gameState.roundTimerTicks || 0) * (gameState.tickMs || 80) / 1000).toFixed(1))}s${halftime}`;

  const selfPlayer = gameState.players.find((p) => p.id === selfId);
  let objectiveHint = '';
  if (selfPlayer && selfPlayer.alive) {
    const selfHead = selfPlayer.snake[0];
    const onSite = inSiteArea(selfHead, gameState.site, gameState.siteRadius || 2);
    const onBomb = samePos(selfHead, gameState.bomb);

    if (selfPlayer.faction === 'T' && selfPlayer.hasBomb) {
      const plantTicks = gameState.plantTicks || 8;
      objectiveHint = onSite
        ? selfPlayer.actionHeld
          ? `Planting... ${Math.min(gameState.bomb.plantProgress, plantTicks)}/${plantTicks}`
          : 'Hold E to plant'
        : 'Carry bomb to center site';
    } else if (selfPlayer.faction === 'CT' && planted) {
      const defuseTicks = gameState.defuseTicks || 10;
      objectiveHint = onBomb
        ? selfPlayer.actionHeld
          ? `Defusing... ${Math.min(gameState.bomb.defuseProgress, defuseTicks)}/${defuseTicks}`
          : 'Hold E to defuse'
        : 'Reach bomb and hold E';
    }
  }

  phaseEl.textContent = phase;
  eventEl.textContent = objectiveHint || gameState.lastEvent;
  scoreTEl.textContent = gameState.score.T;
  scoreCTEl.textContent = gameState.score.CT;

  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  leaderboardEl.innerHTML = sorted
    .map((p) => {
      const you = p.id === selfId ? ' (you)' : '';
      const bomb = p.hasBomb ? ' [C4]' : '';
      return `<li><span>${p.name}${you} - ${p.faction}${bomb}</span><strong>${p.score}</strong></li>`;
    })
    .join('');
}

function sendDirection(dir) {
  if (!socket) return;
  socket.emit('input', dir);
}

function startDirectionHold(dir, btn = null) {
  sendDirection(dir);
  if (btn) btn.classList.add('active');

  if (directionHoldTimer) clearInterval(directionHoldTimer);
  directionHoldTimer = setInterval(() => {
    sendDirection(dir);
  }, 130);
}

function stopDirectionHold(btn = null) {
  if (btn) btn.classList.remove('active');
  if (directionHoldTimer) {
    clearInterval(directionHoldTimer);
    directionHoldTimer = null;
  }
}

function setActionHeld(nextHeld) {
  if (!socket) return;
  if (eHeld === nextHeld) return;

  eHeld = nextHeld;
  socket.emit('action', nextHeld);
}

function maybeShowRulesModal() {
  if (!hasJoined || !gameState || !rulesModal) return;
  const isMatchStart = gameState.roundsPlayed === 0 && gameState.roundFreezeTicks > 0 && !gameState.matchOver;
  if (isMatchStart && !rulesDismissed) {
    rulesModal.classList.remove('hidden');
  }
}

window.addEventListener('keydown', (e) => {
  const target = e.target;
  const isTyping =
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable);
  if (isTyping) return;

  const key = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
    e.preventDefault();
  }

  if (key === 'arrowup' || key === 'w') sendDirection('up');
  if (key === 'arrowdown' || key === 's') sendDirection('down');
  if (key === 'arrowleft' || key === 'a') sendDirection('left');
  if (key === 'arrowright' || key === 'd') sendDirection('right');
  if (key === 'e') setActionHeld(true);
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'e') setActionHeld(false);
});

window.addEventListener('blur', () => {
  setActionHeld(false);
  stopDirectionHold();
});

window.addEventListener('resize', () => {
  resizeCanvas();
});

touchButtons.forEach((btn) => {
  const dir = btn.dataset.dir;
  if (!dir) return;

  const onDown = (e) => {
    e.preventDefault();
    startDirectionHold(dir, btn);
  };
  const onUp = (e) => {
    e.preventDefault();
    stopDirectionHold(btn);
  };

  btn.addEventListener('pointerdown', onDown);
  btn.addEventListener('pointerup', onUp);
  btn.addEventListener('pointercancel', onUp);
  btn.addEventListener('pointerleave', onUp);
});

if (touchActionBtn) {
  const onActionDown = (e) => {
    e.preventDefault();
    touchActionBtn.classList.add('active');
    setActionHeld(true);
  };
  const onActionUp = (e) => {
    e.preventDefault();
    touchActionBtn.classList.remove('active');
    setActionHeld(false);
  };

  touchActionBtn.addEventListener('pointerdown', onActionDown);
  touchActionBtn.addEventListener('pointerup', onActionUp);
  touchActionBtn.addEventListener('pointercancel', onActionUp);
  touchActionBtn.addEventListener('pointerleave', onActionUp);
}

if (rulesBtn && rulesModal) {
  rulesBtn.addEventListener('click', () => {
    rulesDismissed = true;
    rulesModal.classList.add('hidden');
  });
}

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Player';
  socket = io({
    transports: ['websocket', 'polling']
  });
  eHeld = false;

  socket.on('joined', ({ id, faction }) => {
    selfId = id;
    hasJoined = true;
    joinBox.classList.add('hidden');
    phaseEl.textContent = `Connected as ${faction}`;
  });

  socket.on('state', (nextState) => {
    if ((prevRoundsPlayed > 0 || prevMatchOver) && nextState.roundsPlayed === 0 && nextState.roundFreezeTicks > 0) {
      rulesDismissed = false;
    }
    prevRoundsPlayed = nextState.roundsPlayed;
    prevMatchOver = Boolean(nextState.matchOver);

    const now = performance.now();
    prevSnapshot = nextSnapshot || nextState;
    prevSnapshotAt = nextSnapshotAt || now;
    nextSnapshot = nextState;
    nextSnapshotAt = now;
    gameState = nextState;
    resizeCanvas();
    updateHud();
    maybeShowRulesModal();

    if (!isAnimating) {
      isAnimating = true;
      requestAnimationFrame(animationLoop);
    }
  });

  socket.emit('join', name);
  joinBtn.disabled = true;
  nameInput.disabled = true;
});
resizeCanvas();
