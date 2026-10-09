import { CONFIG, DIRS, DURATIONS, SHOP, TICK_MS, timings } from '../shared/config.js';
import { Renderer, TEAM_COLORS, cellsOf } from './render.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Menu } from './menu.js';
import { bindInput } from './input.js';
import { LocalSession, DemoSession, OnlineSession, getSocket, request } from './net.js';

const $ = (id) => document.getElementById(id);
const DIFF_LABEL = { easy: 'Facile', normal: 'Normal', hard: 'Hardcore' };
const STREAKS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUADRA KILL', 5: 'PENTA KILL' };

const stage = $('stage');
const canvas = $('game');
const renderer = new Renderer(canvas);
const audio = new Audio();
const hud = new Hud({ onBuy: (item) => session?.send(['buy', item]) });

let session = null;
let demo = null;
let prev = null;
let curr = null;
let currAt = 0;
let lastFrame = performance.now();
let lastBeep = 0;
let lastDefuseTick = 0;
let paused = false;
let chatOpen = false;
let socket = null;

const menu = new Menu({
  solo: startSolo,
  quick: (name) => goOnline('quick', { name }),
  create: (opts) => goOnline('create', opts),
  join: (code, name) => goOnline('join', { code, name }),
  refresh: refreshRooms
});

function resize() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const portrait = touch && stage.clientHeight > stage.clientWidth;
  stage.classList.toggle('portrait', portrait);
  if (portrait) renderer.resize(stage.clientWidth - 8, stage.clientHeight * 0.42);
  else renderer.resize(stage.clientWidth - 16, stage.clientHeight - (touch ? 70 : 112));
}
window.addEventListener('resize', resize);
resize();

function onSnapshot(snap) {
  prev = curr;
  curr = snap;
  currAt = performance.now();
  if (!session) return;
  hud.update(snap, session.selfId);
  for (const ev of snap.ev) handleEvent(ev, snap);
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
  hud.reset();
  hud.online = session.online;
  hud.setRoom(roomInfo);
  menu.hide();
  $('hud').classList.remove('hidden');
  $('pauseMenu').classList.add('hidden');
  audio.unlock();
}

function leaveGame(errorMsg = '') {
  if (session) session.leave();
  session = null;
  inputs.releaseAll();
  closeChat();
  $('hud').classList.add('hidden');
  $('flash').style.opacity = '0';
  history.replaceState(null, '', location.pathname);
  menu.show();
  menu.error(errorMsg);
  startDemo();
}

function startSolo(opts) {
  audio.unlock();
  const s = new LocalSession(opts, onSnapshot);
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
  audio.unlock();
  menu.setBusy(true);
  menu.error('');
  try {
    const s = await ensureSocket();
    const res = await request(s, kind, payload);
    if (!res || !res.ok) throw new Error(res?.error || 'Impossible de rejoindre');
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

function volumeAt(x, y, id) {
  if (session && id === session.selfId) return 1;
  const self = selfPlayer();
  if (!self || !self.a) return 0.55;
  const d = Math.hypot(self.s[0] - x, self.s[1] - y);
  return Math.max(0.18, 1 - d / 36) * 0.8;
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
      const D = DIRS[ev.d];
      fx.cone(ev.x + D.x * 0.6, ev.y + D.y * 0.6, D.x, D.y);
      if (mine) fx.addShake(1.5);
      audio.play('shot', volumeAt(ev.x, ev.y, ev.id));
      break;
    }
    case 'impact':
      fx.burst(ev.x, ev.y, { n: 6, color: ['#ffe0a0', '#c9b08a'], speed: 5, life: 0.3, size: 0.09 });
      audio.play('impact', volumeAt(ev.x, ev.y) * 0.6);
      break;
    case 'cut': {
      const victim = snap.p.find((p) => p.id === ev.victim);
      const col = victim ? TEAM_COLORS[victim.tm] : TEAM_COLORS.T;
      fx.burst(ev.x, ev.y, { n: 14, color: [col.main, col.light, col.dark], speed: 7, life: 0.5, size: 0.16, kind: 'blob' });
      fx.text(ev.x, ev.y - 0.6, `-${ev.n}`, '#ff6b5a', 0.8, 0.9);
      if (ev.victim === selfId) fx.addShake(5);
      audio.play('cut', ev.by === selfId || ev.victim === selfId ? 1 : volumeAt(ev.x, ev.y));
      break;
    }
    case 'armor':
      fx.burst(ev.x, ev.y, { n: 12, color: ['#cfe3ee', '#8fa3ae'], speed: 7, life: 0.4, size: 0.1 });
      fx.text(ev.x, ev.y - 0.8, 'CASQUE !', '#cfe3ee', 0.8);
      audio.play('armor', ev.id === selfId || ev.by === selfId ? 1 : volumeAt(ev.x, ev.y));
      break;
    case 'kill':
      onKill(ev, snap, self);
      break;
    case 'pickup':
      if (ev.k === 'crate') fx.burst(ev.x, ev.y, { n: 8, color: ['#ffe07a', '#b37a3a'], speed: 4, life: 0.4, size: 0.12 });
      if (mine) audio.play(ev.k === 'crate' ? 'crate' : 'pickup', 0.8);
      break;
    case 'bombpick':
      if (mine) {
        hud.announce('TU AS LA BOMBE', 'Direction A ou B, maintiens E sur le site', '#ff7a45', 2200);
        audio.play('crate');
      } else if (self && self.tm === 'T') hud.system(`${playerName(snap, ev.id)} a récupéré la bombe`);
      break;
    case 'bombdrop':
      fx.ring(ev.x, ev.y, 2, '#ffd25e', 0.6);
      if (self && self.tm === 'T') hud.system('La bombe est au sol !');
      break;
    case 'plantstart':
      audio.play('beep', volumeAt(snap.bomb.x, snap.bomb.y, ev.id));
      break;
    case 'planted':
      fx.ring(ev.x, ev.y, 4, '#ff3b1f', 0.8, 0.4);
      hud.announce('BOMBE POSÉE', `Site ${ev.site} · ${DURATIONS.bomb} secondes`, '#ff4b3a', 2600);
      audio.play('plant');
      audio.say('Bomb has been planted');
      lastBeep = performance.now();
      break;
    case 'defusestart':
      if (self && self.tm === 'T') hud.system(`${playerName(snap, ev.id)} désamorce ${ev.kit ? 'AVEC un kit' : 'sans kit'} !`);
      break;
    case 'interrupt':
      {
        const p = snap.p.find((x) => x.id === ev.id);
        if (p && p.a) renderer.fx.text(p.s[0], p.s[1] - 1, 'INTERROMPU', '#ffd25e', 0.7);
        if (mine) audio.play('deny');
      }
      break;
    case 'defused':
      hud.announce('BOMBE DÉSAMORCÉE', playerName(snap, ev.id), '#45b5ff', 2600);
      audio.say('Bomb has been defused');
      break;
    case 'explode':
      fx.ring(ev.x, ev.y, CONFIG.bombRadius, '#ffb347', 1.1, 0.8);
      fx.ring(ev.x, ev.y, CONFIG.bombRadius * 0.6, '#fff1c2', 0.6, 0.6);
      fx.burst(ev.x, ev.y, { n: 160, color: ['#ffdf7a', '#ff8a3d', '#ff3b1f', '#fff'], speed: 22, life: 1.2, size: 0.3 });
      fx.burst(ev.x, ev.y, { n: 40, color: ['#4a3b2b', '#6b5a48'], speed: 6, life: 2.2, size: 0.9, grow: 1.2, kind: 'smoke' });
      fx.addShake(28);
      flashScreen('#ffb070', 0.75);
      audio.play('explosion');
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
      if (ev.hit.includes(selfId)) {
        audio.ring(2.6);
        hud.system('Flashé !');
      } else if (mine && ev.hit.length) {
        hud.system(`Tu as flashé ${ev.hit.length} ennemi${ev.hit.length > 1 ? 's' : ''} !`);
      }
      break;
    case 'smoke':
      fx.burst(ev.x, ev.y, { n: 18, color: ['#c8cdd0', '#aeb4b8'], speed: 4, life: 1.2, size: 0.6, grow: 1.2, kind: 'smoke' });
      audio.play('smoke', volumeAt(ev.x, ev.y));
      break;
    case 'throw':
      audio.play('throw', volumeAt(ev.x, ev.y, ev.id));
      if (mine) audio.say(ev.g === 'flash' ? 'Flashbang out!' : ev.g === 'smoke' ? 'Smoke out!' : 'Fire in the hole!');
      break;
    case 'buy':
      if (mine) audio.play('buy');
      break;
    case 'buyfail':
      if (ev.to === selfId) {
        audio.play('deny');
        hud.system(ev.msg);
      }
      break;
    case 'freeze':
      hud.announce(`ROUND ${ev.round}`, self ? `Tu es ${self.tm === 'T' ? 'TERRORISTE' : 'ANTI-TERRORISTE'} · B pour acheter` : '', self ? (self.tm === 'T' ? '#ff7a45' : '#45b5ff') : '#fff', 2400);
      hud.toggleBuy(false);
      break;
    case 'live':
      hud.toggleBuy(false);
      hud.announce('GO GO GO !', '', '#ffd25e', 1100);
      audio.play('go');
      if (Math.random() < 0.6) audio.say(self && self.tm === 'CT' ? "Let's move out" : 'Go go go');
      break;
    case 'roundend':
      hud.roundEnd(ev);
      if (self) audio.play(self.tm === ev.winner ? 'win' : 'lose');
      setTimeout(() => audio.say(ev.winner === 'T' ? 'Terrorists win' : 'Counter-terrorists win'), 600);
      break;
    case 'halftime':
      hud.announce('MI-TEMPS', 'Changement de camp ! Argent remis à zéro.', '#ffd25e', 3000);
      break;
    case 'matchstart':
      hud.system(`Nouveau match — premier à ${ev.winRounds} rounds.`);
      break;
    case 'matchend':
      if (self) audio.play(self.tm === ev.winner ? 'win' : 'lose');
      break;
    case 'warmup':
      hud.announce('ÉCHAUFFEMENT', 'En attente d\'un adversaire… respawn infini, achats gratuits', '#ffd25e', 3000);
      break;
    case 'join':
      if (ev.id !== selfId) hud.system(`${ev.name} a rejoint (${ev.team})`);
      break;
    case 'leave':
      hud.system(`${ev.name} est parti`);
      break;
    case 'teamswitch':
      hud.system(`${ev.name} passe ${ev.team} (équilibrage)`);
      break;
    case 'chat':
      hud.chat(ev);
      if (ev.id !== selfId) audio.play('chat');
      break;
    default:
  }
}

function onKill(ev, snap, self) {
  const fx = renderer.fx;
  const selfId = session.selfId;
  const prevVictim = prev ? prev.p.find((p) => p.id === ev.victim) : null;
  const team = snap.p.find((p) => p.id === ev.victim)?.tm || prevVictim?.tm || 'T';
  const col = TEAM_COLORS[team];
  const body = renderer.lastPaths.get(ev.victim) || (prevVictim ? cellsOf(prevVictim.s) : [{ x: ev.x, y: ev.y }]);
  for (const seg of body) {
    fx.burst(seg.x, seg.y, { n: 3, color: [col.main, col.light, col.dark], speed: 5, life: 0.7, size: 0.18, kind: 'blob' });
  }
  fx.burst(ev.x, ev.y, { n: 20, color: [col.main, '#fff'], speed: 10, life: 0.6, size: 0.14 });
  fx.ring(ev.x, ev.y, 1.8, col.main, 0.45, 0.3);
  hud.killfeed(ev);

  const headshot = ev.how === 'headshot';
  if (headshot) fx.text(ev.x, ev.y - 1, 'HEADSHOT', '#ffd25e', 0.9, 1.2);

  if (ev.killer === selfId) {
    fx.text(ev.x, ev.y - 1.8, `+$${CONFIG.money.kill}`, '#8ff08f', 0.7, 1.2);
    audio.play(headshot ? 'headshot' : 'kill');
    if (ev.ace) {
      hud.announce('ACE !!!', 'Toute l\'équipe adverse, à toi tout seul', '#ffd25e', 3000);
      audio.say('Ace!');
    } else if (ev.streak >= 2) {
      hud.announce(STREAKS[Math.min(5, ev.streak)], headshot ? 'HEADSHOT' : '', '#ffd25e', 1600);
      audio.say(STREAKS[Math.min(5, ev.streak)].toLowerCase());
    } else if (headshot) {
      hud.announce('HEADSHOT', '', '#ffd25e', 1000);
    }
  } else if (ev.victim === selfId) {
    fx.addShake(12);
    flashScreen('#ff2a1a', 0.35);
    audio.play('kill');
  } else {
    audio.play(headshot ? 'headshot' : 'kill', volumeAt(ev.x, ev.y) * 0.6);
  }
}

function flashScreen(color, opacity) {
  const el = $('flash');
  el.style.transition = 'none';
  el.style.background = color;
  el.style.opacity = String(opacity);
  requestAnimationFrame(() => {
    el.style.transition = 'opacity 0.6s ease-out';
    el.style.opacity = '0';
    setTimeout(() => {
      el.style.background = '#fff';
      el.style.transition = '';
    }, 650);
  });
}

function bombSounds(now) {
  if (!session || !curr) return;
  const b = curr.bomb;
  if (b.s === 'planted') {
    const k = Math.max(0, b.t / timings(curr.tk).bomb);
    const interval = Math.max(90, 1000 * k);
    if (now - lastBeep >= interval) {
      lastBeep = now;
      audio.play('beep', volumeAt(b.x, b.y) + 0.2);
    }
    if (b.dp > 0 && now - lastDefuseTick > 280) {
      lastDefuseTick = now;
      audio.play('defusing', volumeAt(b.x, b.y));
    }
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const t = curr ? Math.max(0, Math.min(1, (now - currAt) / (curr.tk || TICK_MS))) : 0;
  renderer.draw({ prev, curr, t, selfId: session ? session.selfId : null, now, dt });
  bombSounds(now);
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
  session?.setPaused(value);
  if (value) inputs.releaseAll();
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
$('voiceBtn').addEventListener('click', () => {
  audio.toggleVoice();
  setPaused(true);
});

const inputs = bindInput(canvas, {
  active: () => Boolean(session) && !paused && !chatOpen,
  dir: (d) => session.send(['d', d]),
  fire: (v) => session?.send(['f', v ? 1 : 0]),
  boost: (v) => session?.send(['b', v ? 1 : 0]),
  action: (v) => session?.send(['a', v ? 1 : 0]),
  nade: (g) => session.send(['g', g]),
  buy: (i) => {
    if (hud.isBuyOpen() && SHOP[i]) session.send(['buy', SHOP[i].id]);
  },
  toggleBuy: () => {
    if (!hud.toggleBuy() && curr && curr.ph !== 'freeze' && curr.ph !== 'warmup') {
      hud.system('Achats uniquement pendant le freeze time');
    }
  },
  scoreboard: (v) => session && hud.toggleScoreboard(v),
  chat: openChat,
  mute: () => hud.system(audio.toggleMute() ? 'Son coupé (M)' : 'Son activé'),
  escape: () => {
    if (!session) return;
    if (chatOpen) closeChat();
    else if (hud.isBuyOpen()) hud.toggleBuy(false);
    else setPaused(!paused);
  }
});

document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

startDemo();
requestAnimationFrame(frame);
