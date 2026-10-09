import { CONFIG, TICK_MS, WEAPONS } from '../shared/config.js';
import { Renderer, TEAM_COLORS, soldiersOf } from './render.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Menu } from './menu.js';
import { bindInput } from './input.js';
import { LocalSession, DemoSession, OnlineSession, getSocket, request } from './net.js';
import { Progress, SOLO_XP, ONLINE_XP, rankName } from './progress.js';

const $ = (id) => document.getElementById(id);
const DIFF_LABEL = { easy: 'Facile', normal: 'Normal', hard: 'Hardcore' };
const STREAKS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUADRA KILL', 5: 'PENTA KILL' };

const stage = $('stage');
const canvas = $('game');
const renderer = new Renderer(canvas);
const audio = new Audio();
const hud = new Hud();
const progress = new Progress();
hud.progress = progress;
hud.onReplay = () => {
  if (session && !session.online) session.restart();
};
hud.onMenu = () => leaveGame();
progress.onGain = ({ amount, label, levelUps, unlocks }) => {
  if (!session) return;
  hud.xpToast(amount, label);
  if (!levelUps.length) return;
  const level = levelUps[levelUps.length - 1];
  const unlockText = unlocks.length ? ` · Skin débloqué : ${unlocks.map((u) => u.name).join(', ')} !` : '';
  hud.announce(`NIVEAU ${level}`, `${rankName(level)}${unlockText}`, '#ffd25e', 3500);
  audio.play('levelup');
};

let session = null;
let demo = null;
let prev = null;
let curr = null;
let currAt = 0;
let lastFrame = performance.now();
let paused = false;
let chatOpen = false;
let socket = null;
const aim = { mode: 'heading', cx: 0, cy: 0, angle: 0, dist: 6, target: null, sentAngle: 99, sentDist: 0, sentAt: 0 };
const moveState = { x: 0, y: 0, sentAt: 0, pending: false };

const coarse = matchMedia('(pointer: coarse)');
const portrait = matchMedia('(pointer: coarse) and (orientation: portrait)');

const menu = new Menu(
  {
    solo: startSolo,
    quick: (name) => goOnline('quick', { name }),
    create: (opts) => goOnline('create', opts),
    join: (code, name) => goOnline('join', { code, name }),
    refresh: refreshRooms
  },
  progress
);


function resize() {
  if (coarse.matches) {
    const side = Math.round(Math.min(150, Math.max(96, stage.clientWidth * 0.18)));
    stage.style.setProperty('--side', `${side}px`);
    renderer.resize(stage.clientWidth - side * 2, stage.clientHeight - 44);
  } else {
    renderer.resize(stage.clientWidth - 16, stage.clientHeight - 112);
  }
}

function fullscreenSupported() {
  const el = document.documentElement;
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
}

function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function goFullscreen() {
  if (!coarse.matches) return;
  const lock = () => screen.orientation?.lock?.('landscape').catch(() => {});
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (isFullscreen() || !req) {
    lock();
    return;
  }
  Promise.resolve(req.call(el, { navigationUI: 'hide' }))
    .then(lock)
    .catch(() => {});
}

function syncPause() {
  session?.setPaused(paused || portrait.matches);
  if (portrait.matches) inputs.releaseAll();
}

portrait.addEventListener('change', () => {
  syncPause();
  resize();
});
window.addEventListener('resize', resize);
resize();

function onSnapshot(snap) {
  prev = curr;
  curr = snap;
  currAt = performance.now();
  renderer.addBullets(snap.nb);
  if (!session) return;
  hud.snap = snap;
  hud.selfId = session.selfId;
  for (const [x, y] of snap.ns || []) renderer.ping(x, y, 'step');
  for (const ev of snap.ev) {
    handleEvent(ev, snap);
    progress.handleEvent(ev, snap, session.selfId);
  }
  hud.update(snap, session.selfId);
}

function startDemo() {
  if (demo) return;
  prev = null;
  curr = null;
  renderer.fx.clear();
  demo = new DemoSession((snap) => {
    if (!session) onSnapshot(snap);
  });
}

function stopDemo() {
  if (demo) demo.leave();
  demo = null;
}

function enterGame(newSession, roomInfo) {
  stopDemo();
  session = newSession;
  prev = null;
  curr = null;
  paused = false;
  renderer.fx.clear();
  renderer.bullets = [];
  hud.reset();
  hud.online = session.online;
  hud.setRoom(roomInfo);
  menu.hide();
  $('hud').classList.remove('hidden');
  stage.classList.add('ingame');
  aim.sentAngle = 99;
  $('pauseMenu').classList.add('hidden');
  audio.unlock();
  syncPause();
}

function leaveGame(errorMsg = '') {
  if (session) session.leave();
  session = null;
  inputs.releaseAll();
  closeChat();
  $('hud').classList.add('hidden');
  stage.classList.remove('ingame');
  $('flash').style.opacity = '0';
  history.replaceState(null, '', location.pathname);
  menu.show();
  menu.error(errorMsg);
  startDemo();
}

function startSolo(opts) {
  goFullscreen();
  audio.unlock();
  progress.setMultiplier(SOLO_XP[opts.difficulty] || 1);
  progress.resetMatch();
  const s = new LocalSession({ ...opts, skin: progress.s.skin }, onSnapshot);
  enterGame(s, { solo: true, label: `${opts.teamSize}v${opts.teamSize} · ${DIFF_LABEL[opts.difficulty]}` });
  hud.system('Mode solo — Échap pour mettre en pause.');
}

async function ensureSocket() {
  if (socket) return socket;
  socket = await getSocket();
  if (!socket.connected) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Serveur injoignable')), 6000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  return socket;
}

async function refreshRooms() {
  try {
    const s = await ensureSocket();
    const res = await request(s, 'rooms');
    menu.setServer(res);
  } catch {
    menu.setServer(null);
  }
}

async function goOnline(kind, payload) {
  goFullscreen();
  audio.unlock();
  menu.setBusy(true);
  menu.error('');
  try {
    const s = await ensureSocket();
    const res = await request(s, kind, { ...payload, skin: progress.s.skin });
    if (!res || !res.ok) throw new Error(res?.error || 'Impossible de rejoindre');
    progress.setMultiplier(ONLINE_XP);
    progress.resetMatch();
    const online = new OnlineSession(s, res, onSnapshot, (msg) => leaveGame(msg));
    online.onPing = (ms) => hud.setPing(ms);
    enterGame(online, { code: res.code });
    history.replaceState(null, '', `${location.pathname}?room=${res.code}`);
    hud.system(`Salle ${res.code}${res.isPublic ? ' (publique)' : ' (privée)'} — partage le lien pour inviter tes potes !`);
  } catch (err) {
    menu.error(err.message || 'Serveur injoignable');
    menu.setBusy(false);
  }
}

function selfPlayer(snap = curr) {
  return snap && session ? snap.p.find((p) => p.id === session.selfId) : null;
}

function sendAim(now, force = false) {
  if (!session) return;
  const turned = Math.abs(Math.atan2(Math.sin(aim.angle - aim.sentAngle), Math.cos(aim.angle - aim.sentAngle)));
  if (!force && (now - aim.sentAt < 50 || (turned < 0.02 && Math.abs(aim.dist - aim.sentDist) < 0.5))) return;
  session.send(['aim', Math.round(aim.angle * 1000) / 1000, Math.round(aim.dist * 10) / 10, aim.mode === 'stick' ? 1 : 0]);
  aim.sentAngle = aim.angle;
  aim.sentDist = aim.dist;
  aim.sentAt = now;
}

function updateAim(now) {
  const self = selfPlayer();
  if (!session || !self || !self.a || !self.s.length) return null;
  const head = renderer.lastPaths.get(self.id)?.[0] || { x: self.s[0], y: self.s[1] };
  aim.target = null;
  if (aim.mode === 'mouse') {
    const p = renderer.toCell(aim.cx, aim.cy);
    aim.angle = Math.atan2(p.y - head.y, p.x - head.x);
    aim.dist = Math.hypot(p.x - head.x, p.y - head.y);
    aim.target = p;
  } else if (aim.mode === 'heading') {
    aim.angle = self.an;
    aim.dist = 6;
  }
  sendAim(now);
  return { head, angle: aim.angle, dist: aim.dist, target: aim.target };
}

function sendMove(now, force = false) {
  if (!session || !moveState.pending) return;
  if (!force && now - moveState.sentAt < 45) return;
  session.send(['mv', Math.round(moveState.x * 100) / 100, Math.round(moveState.y * 100) / 100]);
  moveState.sentAt = now;
  moveState.pending = false;
}

function volumeAt(x, y, id) {
  if (session && id === session.selfId) return 1;
  const self = selfPlayer();
  if (!self || !self.a) return 0.5;
  const d = Math.hypot(self.s[0] - x, self.s[1] - y);
  return Math.max(0.12, 1 - d / 30) * 0.75;
}

function playerName(snap, id) {
  return snap.p.find((p) => p.id === id)?.n || '?';
}

function handleEvent(ev, snap) {
  const fx = renderer.fx;
  const selfId = session.selfId;
  const self = snap.p.find((p) => p.id === selfId);
  const mine = ev.id === selfId;

  switch (ev.type) {
    case 'shot': {
      const dx = Math.cos(ev.a);
      const dy = Math.sin(ev.a);
      fx.cone(ev.x + dx * 0.6, ev.y + dy * 0.6, dx, dy, { n: 5, life: 0.1 });
      if (!mine && !renderer.visible(Math.round(ev.x), Math.round(ev.y))) renderer.ping(ev.x, ev.y, 'shot');
      if (mine) fx.addShake(ev.w === 'sniper' || ev.w === 'shotgun' ? 3 : 0.8);
      audio.shot(ev.w, volumeAt(ev.x, ev.y, ev.id));
      break;
    }
    case 'bhit':
      renderer.hitBullet(ev.b, ev.x, ev.y);
      break;
    case 'hit': {
      const victim = snap.p.find((p) => p.id === ev.id);
      const col = victim ? TEAM_COLORS[victim.tm] : TEAM_COLORS.T;
      fx.burst(ev.x, ev.y, { n: ev.lead ? 7 : 4, color: [col.main, col.dark], speed: 4, life: 0.35, size: 0.12, kind: 'blob' });
      if (ev.by === selfId) {
        fx.text(ev.x, ev.y - 0.5, `${ev.dmg}`, ev.lead ? '#ffd25e' : '#ffffff', ev.lead ? 0.7 : 0.5, 0.6);
        audio.play(ev.lead ? 'hitlead' : 'hitmark');
      }
      if (mine && ev.lead) {
        fx.addShake(4);
        flashScreen('#ff2a1a', 0.18);
      }
      break;
    }
    case 'down': {
      const victim = snap.p.find((p) => p.id === ev.id);
      const col = victim ? TEAM_COLORS[victim.tm] : TEAM_COLORS.T;
      fx.burst(ev.x, ev.y, { n: 12, color: [col.main, col.light, col.dark], speed: 6, life: 0.5, size: 0.16, kind: 'blob' });
      if (ev.by === selfId) audio.play('cut');
      if (mine) audio.play('hurt');
      break;
    }
    case 'kill':
      onKill(ev, snap);
      break;
    case 'pickup':
      onPickup(ev, snap, mine);
      break;
    case 'golden':
      fx.ring(ev.x, ev.y, 3, '#ffd25e', 0.9, 0.4);
      hud.announce('DEAGLE D\'OR', 'Il vient d\'apparaître au centre de la carte', '#ffd25e', 2600);
      audio.play('golden');
      break;
    case 'spawn':
      if (mine) {
        fx.ring(ev.x, ev.y, 1.6, '#9be3ff', 0.5, 0.25);
        audio.play('spawn');
      }
      break;
    case 'reload':
      if (mine) audio.play('reload');
      break;
    case 'he':
      fx.ring(ev.x, ev.y, CONFIG.heRadius + 0.5, '#ffb347', 0.5, 0.5);
      fx.burst(ev.x, ev.y, { n: 50, color: ['#ffdf7a', '#ff8a3d', '#ff3b1f'], speed: 12, life: 0.6, size: 0.22 });
      fx.burst(ev.x, ev.y, { n: 14, color: ['#3d342b', '#5b5046'], speed: 3, life: 1.5, size: 0.7, grow: 0.8, kind: 'smoke' });
      fx.addShake(10);
      audio.play('he', volumeAt(ev.x, ev.y));
      break;
    case 'flash':
      fx.ring(ev.x, ev.y, CONFIG.flashRadius, 'rgba(255,255,255,0.9)', 0.35, 0.3);
      fx.burst(ev.x, ev.y, { n: 24, color: '#fff', speed: 16, life: 0.25, size: 0.14 });
      audio.play('flashbang', volumeAt(ev.x, ev.y));
      if (ev.hit.includes(selfId)) audio.ring(2.4);
      else if (mine && ev.hit.length) hud.system(`Tu as flashé ${ev.hit.length} ennemi${ev.hit.length > 1 ? 's' : ''} !`);
      break;
    case 'smoke':
      fx.burst(ev.x, ev.y, { n: 18, color: ['#c8cdd0', '#aeb4b8'], speed: 4, life: 1.2, size: 0.6, grow: 1.2, kind: 'smoke' });
      audio.play('smoke', volumeAt(ev.x, ev.y));
      break;
    case 'throw':
      audio.play('throw', volumeAt(ev.x, ev.y, ev.id));
      if (mine) audio.say(ev.g === 'flash' ? 'Flashbang out!' : ev.g === 'smoke' ? 'Smoke out!' : 'Fire in the hole!');
      break;
    case 'matchstart':
      hud.announce('SNAKE STRIKE', `Premier à ${ev.goal} kills · ramasse des recrues !`, '#ffd25e', 2600);
      break;
    case 'live':
      hud.announce('GO GO GO !', '', '#ffd25e', 1100);
      audio.play('go');
      audio.say('Go go go');
      break;
    case 'matchend':
      if (self) audio.play(ev.winner === 'draw' ? 'go' : self.tm === ev.winner ? 'win' : 'lose');
      setTimeout(() => {
        if (ev.winner !== 'draw') audio.say(ev.winner === 'T' ? 'Terrorists win' : 'Counter-terrorists win');
      }, 500);
      break;
    case 'warmup':
      hud.announce('ÉCHAUFFEMENT', 'En attente d\'un adversaire…', '#ffd25e', 3000);
      break;
    case 'join':
      if (ev.id !== selfId) hud.system(`${ev.name} a rejoint (${ev.team})`);
      break;
    case 'leave':
      hud.system(`${ev.name} est parti`);
      break;
    case 'chat':
      hud.chat(ev);
      if (ev.id !== selfId) audio.play('chat');
      break;
    default:
  }
}

function onPickup(ev, snap, mine) {
  const fx = renderer.fx;
  const colors = { recruit: '#7dff7a', tag: '#b8c2c9', medkit: '#ff6b5a', weapon: '#ffd25e', golden: '#ffd25e' };
  fx.burst(ev.x, ev.y, { n: 10, color: colors[ev.k] || '#fff', speed: 4, life: 0.4, size: 0.12 });
  if (ev.k === 'golden') {
    hud.system(`👑 ${playerName(snap, ev.id)} a le Deagle d'or !`);
    if (mine) hud.announce('DEAGLE D\'OR', 'Gros dégâts — tout le monde va te traquer', '#ffd25e', 2200);
  }
  if (!mine) return;
  if (ev.k === 'recruit' || ev.k === 'tag') {
    fx.text(ev.x, ev.y - 0.6, '+1 🐍', '#7dff7a', 0.6, 0.8);
    audio.play('recruit');
  } else if (ev.k === 'medkit') {
    fx.text(ev.x, ev.y - 0.6, `+${CONFIG.medkitHeal} ❤`, '#ff8a7a', 0.6, 0.8);
    audio.play('heal');
  } else if (ev.k === 'weapon' || ev.k === 'golden') {
    fx.text(ev.x, ev.y - 0.6, WEAPONS[ev.w].name, WEAPONS[ev.w].color, 0.7, 1);
    audio.play('weapon');
  } else {
    fx.text(ev.x, ev.y - 0.6, ev.k.toUpperCase(), '#ffffff', 0.6, 0.8);
    audio.play('pickup');
  }
}

function onKill(ev, snap) {
  const fx = renderer.fx;
  const selfId = session.selfId;
  const prevVictim = prev ? prev.p.find((p) => p.id === ev.victim) : null;
  const team = snap.p.find((p) => p.id === ev.victim)?.tm || prevVictim?.tm || 'T';
  const col = TEAM_COLORS[team];
  let body = renderer.lastPaths.get(ev.victim) || (prevVictim ? soldiersOf(prevVictim.s) : []);
  if (!body.length) body = [{ x: ev.x, y: ev.y }];
  for (const s of body) {
    fx.burst(s.x, s.y, { n: 5, color: [col.main, col.light, col.dark], speed: 6, life: 0.7, size: 0.18, kind: 'blob' });
  }
  fx.burst(ev.x, ev.y, { n: 24, color: [col.main, '#fff'], speed: 10, life: 0.6, size: 0.14 });
  fx.ring(ev.x, ev.y, 2.2, col.main, 0.5, 0.35);
  hud.killfeed(ev);

  if (ev.killer === selfId) {
    fx.text(ev.x, ev.y - 1, 'ÉLIMINÉ', '#ffd25e', 0.9, 1.2);
    audio.play('kill');
    if (ev.streak >= 2) {
      const label = STREAKS[Math.min(5, ev.streak)];
      hud.announce(label, `${ev.squad ? `+${ev.squad} soldats à terre` : ''}`, '#ffd25e', 1600);
      audio.say(label.toLowerCase());
    }
  } else if (ev.victim === selfId) {
    fx.addShake(14);
    flashScreen('#ff2a1a', 0.4);
    audio.play('lose');
  } else {
    audio.play('kill', volumeAt(ev.x, ev.y) * 0.6);
  }
}

function flashScreen(color, opacity) {
  const el = $('flash');
  el.style.transition = 'none';
  el.style.background = color;
  el.style.opacity = String(opacity);
  requestAnimationFrame(() => {
    el.style.transition = 'opacity 0.5s ease-out';
    el.style.opacity = '0';
    setTimeout(() => {
      el.style.background = '#fff';
      el.style.transition = '';
    }, 550);
  });
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const t = curr ? Math.max(0, Math.min(1, (now - currAt) / (curr.tk || TICK_MS))) : 0;
  sendMove(now);
  const aimView = updateAim(now);
  renderer.draw({ prev, curr, t, selfId: session ? session.selfId : null, now, dt, aim: aimView });
  requestAnimationFrame(frame);
}

function openChat() {
  if (!session) return;
  chatOpen = true;
  const input = $('chatInput');
  input.classList.remove('hidden');
  input.focus();
}

function closeChat() {
  chatOpen = false;
  const input = $('chatInput');
  input.value = '';
  input.classList.add('hidden');
  input.blur();
}

$('chatInput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const text = e.target.value.trim();
    if (text && session) session.chat(text);
    closeChat();
  } else if (e.key === 'Escape') {
    closeChat();
  }
});

function setPaused(value) {
  paused = value;
  $('pauseMenu').classList.toggle('hidden', !value);
  syncPause();
  if (value) inputs.releaseAll();
  $('fullscreenBtn').classList.toggle('hidden', !coarse.matches || !fullscreenSupported() || isFullscreen());
  $('muteBtn').textContent = `Son : ${audio.muted ? 'non' : 'oui'}`;
  $('voiceBtn').textContent = `Voix : ${audio.voiceOn ? 'oui' : 'non'}`;
}

$('resumeBtn').addEventListener('click', () => setPaused(false));
$('quitBtn').addEventListener('click', () => {
  setPaused(false);
  leaveGame();
});
$('muteBtn').addEventListener('click', () => {
  audio.toggleMute();
  setPaused(true);
});
$('fullscreenBtn').addEventListener('click', () => {
  goFullscreen();
  setPaused(false);
});
$('voiceBtn').addEventListener('click', () => {
  audio.toggleVoice();
  setPaused(true);
});

const inputs = bindInput(canvas, {
  active: () => Boolean(session) && !paused && !chatOpen,
  move: (x, y) => {
    moveState.x = x;
    moveState.y = y;
    moveState.pending = true;
    sendMove(performance.now(), x === 0 && y === 0);
  },
  fire: (v) => {
    if (!session) return;
    if (v) sendAim(performance.now(), true);
    session.send(['f', v ? 1 : 0]);
  },
  aimAt: (x, y) => {
    aim.cx = x;
    aim.cy = y;
    if (session && !coarse.matches) aim.mode = 'mouse';
  },
  aimStick: (angle) => {
    aim.mode = 'stick';
    aim.angle = angle;
    aim.dist = 6;
  },
  reload: () => session?.send(['r']),
  nade: (g) => {
    sendAim(performance.now(), true);
    session.send(['g', g]);
  },
  scoreboard: (v) => session && hud.toggleScoreboard(v),
  chat: openChat,
  mute: () => hud.system(audio.toggleMute() ? 'Son coupé (M)' : 'Son activé'),
  escape: () => {
    if (!session) return;
    if (chatOpen) closeChat();
    else setPaused(!paused);
  }
});

document.addEventListener(
  'pointerdown',
  () => {
    audio.unlock();
    goFullscreen();
  },
  { once: true }
);

startDemo();
requestAnimationFrame(frame);
