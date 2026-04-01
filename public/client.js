const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('nameInput');
const joinBox = document.getElementById('joinBox');

const phaseEl = document.getElementById('phase');
const eventEl = document.getElementById('event');
const scoreTEl = document.getElementById('scoreT');
const scoreCTEl = document.getElementById('scoreCT');
const leaderboardEl = document.getElementById('leaderboard');

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

function formatTimer(ticks) {
  if (!gameState) return '--';
  const ms = ticks * 130;
  return (ms / 1000).toFixed(1);
}

function samePos(a, b) {
  return Boolean(a && b) && a.x === b.x && a.y === b.y;
}

function drawGrid(grid, cellSize) {
  ctx.strokeStyle = 'rgba(135, 170, 190, 0.13)';
  ctx.lineWidth = 1;

  for (let x = 0; x <= grid.width; x += 1) {
    const xPos = x * cellSize;
    ctx.beginPath();
    ctx.moveTo(xPos, 0);
    ctx.lineTo(xPos, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= grid.height; y += 1) {
    const yPos = y * cellSize;
    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.lineTo(canvas.width, yPos);
    ctx.stroke();
  }
}

function fillCell(cell, cellSize, color, pad = 2) {
  ctx.fillStyle = color;
  ctx.fillRect(cell.x * cellSize + pad, cell.y * cellSize + pad, cellSize - pad * 2, cellSize - pad * 2);
}

function draw() {
  if (!gameState) return;

  const { grid, players, crates, site, bomb } = gameState;
  const cellSize = canvas.width / grid.width;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid(grid, cellSize);

  fillCell(site, cellSize, colors.site, 3);

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

  if (gameState.roundResult?.show || gameState.matchOver) {
    drawRoundOverlay();
  }
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
      ? `Round break ${Math.ceil((gameState.roundFreezeTicks * 130) / 1000)}s${halftime}`
      : planted
        ? `Bomb planted - ${formatTimer(gameState.bomb.timer)}s`
        : `Live round${halftime}`;

  const selfPlayer = gameState.players.find((p) => p.id === selfId);
  let objectiveHint = '';
  if (selfPlayer && selfPlayer.alive) {
    const selfHead = selfPlayer.snake[0];
    const onSite = samePos(selfHead, gameState.site);
    const onBomb = samePos(selfHead, gameState.bomb);

    if (selfPlayer.faction === 'T' && selfPlayer.hasBomb) {
      objectiveHint = onSite
        ? selfPlayer.actionHeld
          ? `Planting... ${Math.min(gameState.bomb.plantProgress, 8)}/8`
          : 'Hold E to plant'
        : 'Carry bomb to center site';
    } else if (selfPlayer.faction === 'CT' && planted) {
      objectiveHint = onBomb
        ? selfPlayer.actionHeld
          ? `Defusing... ${Math.min(gameState.bomb.defuseProgress, 10)}/10`
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

function setActionHeld(nextHeld) {
  if (!socket) return;
  if (eHeld === nextHeld) return;

  eHeld = nextHeld;
  socket.emit('action', nextHeld);
}

window.addEventListener('keydown', (e) => {
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
});

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim() || 'Player';
  socket = io({
    transports: ['websocket', 'polling']
  });
  eHeld = false;

  socket.on('joined', ({ id, faction }) => {
    selfId = id;
    joinBox.innerHTML = `<p>Connected as <strong>${faction}</strong>.</p>`;
  });

  socket.on('state', (nextState) => {
    gameState = nextState;
    updateHud();
    draw();
  });

  socket.emit('join', name);
  joinBtn.disabled = true;
  nameInput.disabled = true;
});

canvas.width = 1020;
canvas.height = 660;
