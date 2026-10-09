import { CONFIG, WEAPONS } from '../shared/config.js';
import { badgeHtml, dailiesHtml, rankName, xpToNext } from './progress.js';

const $ = (id) => document.getElementById(id);

const HOW = {
  pistol: '🔫',
  smg: '🔫',
  rifle: '🔫',
  shotgun: '💥',
  sniper: '🎯',
  golden: '👑',
  he: '🧨'
};

const ITEMS = [
  ['he', 'HE'],
  ['fl', 'FLASH'],
  ['sm', 'SMOKE']
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (seconds) => {
  const s = Math.max(0, Math.ceil(seconds - 0.05));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class Hud {
  constructor() {
    this.progress = null;
    this.onReplay = null;
    this.onMenu = null;
    this.el = {
      scoreT: $('scoreT'),
      scoreCT: $('scoreCT'),
      timer: $('timer'),
      phase: $('phase'),
      roomTag: $('roomTag'),
      killfeed: $('killfeed'),
      announce: $('announce'),
      hint: $('hint'),
      deathCard: $('deathCard'),
      chatLog: $('chatLog'),
      hp: $('hp'),
      hpBar: $('hpBar'),
      squad: $('squad'),
      weaponName: $('weaponName'),
      ammo: $('ammo'),
      items: $('items'),
      scoreboard: $('scoreboard'),
      matchOver: $('matchOver'),
      flash: $('flash')
    };
    this.announceTimer = null;
    this.lastKiller = null;
    this.snap = null;
    this.selfId = null;
    this.online = false;
    this.el.items.innerHTML = ITEMS.map(([k, label]) => `<span data-k="${k}">${label}</span>`).join('');
  }

  reset() {
    this.el.killfeed.innerHTML = '';
    this.el.chatLog.innerHTML = '';
    this.el.announce.innerHTML = '';
    this.el.matchOver.classList.add('hidden');
    this.el.scoreboard.classList.add('hidden');
    this.lastKiller = null;
  }

  setRoom(info) {
    if (!info) {
      this.el.roomTag.innerHTML = '';
      return;
    }
    if (info.solo) {
      this.el.roomTag.innerHTML = `<span>SOLO · ${esc(info.label)}</span>`;
      return;
    }
    this.el.roomTag.innerHTML = `<span>Salle</span><b>${esc(info.code)}</b><button id="copyLink">Copier le lien</button><span id="ping"></span>`;
    $('copyLink').addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?room=${info.code}`;
      navigator.clipboard?.writeText(url).then(
        () => this.system(`Lien copié : ${url}`),
        () => this.system(url)
      );
    });
  }

  setPing(ms) {
    const el = $('ping');
    if (el) el.textContent = `${ms} ms`;
  }

  player(id) {
    return this.snap ? this.snap.p.find((p) => p.id === id) : null;
  }

  nameTag(p) {
    if (!p) return '<span>?</span>';
    return `<span class="${p.tm}">${esc(p.n)}</span>`;
  }

  update(snap, selfId) {
    this.snap = snap;
    this.selfId = selfId;
    const el = this.el;
    const self = snap.p.find((p) => p.id === selfId);

    el.scoreT.textContent = snap.sc[0];
    el.scoreCT.textContent = snap.sc[1];
    const phases = {
      countdown: ['Départ dans', true],
      live: [`Premier à ${snap.goal} kills`, true],
      warmup: ['En attente d\'adversaires…', false],
      matchover: ['Fin du match', false]
    };
    const [label, showTime] = phases[snap.ph] || ['—', false];
    el.timer.textContent = showTime ? fmt(snap.tm) : snap.ph === 'matchover' ? 'GG' : 'WARMUP';
    el.timer.classList.toggle('low', snap.ph === 'live' && snap.tm < 30);
    el.phase.textContent = label;

    if (self) {
      const w = WEAPONS[self.w] || WEAPONS.pistol;
      el.hp.textContent = self.a ? self.hp : 0;
      el.hpBar.style.width = `${self.a ? Math.max(0, Math.min(100, (100 * self.hp) / CONFIG.leaderHp)) : 0}%`;
      el.hpBar.parentElement.parentElement.classList.toggle('low', self.a && self.hp <= 35);
      el.squad.textContent = self.a ? self.s.length / 2 : 0;
      el.weaponName.textContent = w.name;
      el.weaponName.style.color = w.color;
      el.ammo.textContent = self.rl > 0 ? 'RECH…' : `${self.mg}/${w.mag}`;
      el.ammo.parentElement.classList.toggle('reloading', self.rl > 0);
      el.ammo.parentElement.classList.toggle('low', self.rl === 0 && self.mg <= Math.ceil(w.mag * 0.2));
      for (const span of el.items.children) span.classList.toggle('on', Boolean(self[span.dataset.k]));
      el.flash.style.opacity = self.fx > 0 ? Math.min(1, self.fx / 1.6).toFixed(2) : '0';
    }

    this.updateHint(snap, self);
    this.updateDeathCard(snap, self);
    if (!el.scoreboard.classList.contains('hidden')) this.renderScoreboard(el.scoreboard);
    if (snap.ph === 'matchover') {
      if (el.matchOver.classList.contains('hidden')) this.showMatchOver();
    } else {
      el.matchOver.classList.add('hidden');
    }
  }

  updateHint(snap, self) {
    const el = this.el.hint;
    let text = '';
    let alert = false;
    if (self && self.a) {
      const squad = self.s.length / 2;
      if (snap.ph === 'countdown') text = 'Ramasse des recrues ➕ pour allonger ton escouade';
      else if (self.im) {
        text = 'Choisis une direction pour démarrer — ensuite ton serpent avance toujours';
        alert = true;
      }
      else if (snap.lt.some((l) => l[1] === 'golden') && self.w !== 'golden') {
        text = '👑 Deagle d\'or au centre de la carte !';
        alert = true;
      } else if (self.hp <= 35) {
        text = 'Leader blessé — trouve un soin ➕ ou recule derrière ton escouade';
        alert = true;
      } else if (self.rl > 0) text = 'Rechargement…';
      else if (squad <= 2) text = 'Escouade réduite — va chercher des recrues';
    }
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('alert', alert);
  }

  updateDeathCard(snap, self) {
    const el = this.el.deathCard;
    const show = self && !self.a && (snap.ph === 'live' || snap.ph === 'warmup');
    if (!show) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    let html = '<b>ESCOUADE DÉCIMÉE</b>';
    if (this.lastKiller) {
      const k = this.player(this.lastKiller.killer);
      if (k) html += `Tué par ${this.nameTag(k)} (${esc((WEAPONS[this.lastKiller.how] || {}).name || 'grenade')})<br>`;
    }
    html += `Réapparition dans ${Math.max(0, self.rs).toFixed(1)} s`;
    el.innerHTML = html;
  }

  killfeed(ev) {
    const killer = this.player(ev.killer);
    const victim = this.player(ev.victim);
    if (ev.victim === this.selfId) this.lastKiller = ev;
    const li = document.createElement('li');
    if (ev.killer === this.selfId || ev.victim === this.selfId) li.classList.add('mine');
    const icon = HOW[ev.how] || '☠️';
    const streak = ev.streak >= 2 ? ` <b>x${ev.streak}</b>` : '';
    const squad = ev.squad ? ` <small>+${ev.squad} 🐍</small>` : '';
    li.innerHTML = killer
      ? `${this.nameTag(killer)}<span class="how">${icon}</span>${this.nameTag(victim)}${squad}${streak}`
      : `<span class="how">${icon}</span>${this.nameTag(victim)}`;
    this.el.killfeed.prepend(li);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
    setTimeout(() => li.remove(), 7000);
  }

  chat(ev) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="${ev.team}">${esc(ev.name)}</span> : ${esc(ev.text)}`;
    this.pushChat(li);
  }

  system(text) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="sys">${esc(text)}</span>`;
    this.pushChat(li);
  }

  pushChat(li) {
    this.el.chatLog.append(li);
    while (this.el.chatLog.children.length > 8) this.el.chatLog.firstChild.remove();
    setTimeout(() => li.classList.add('old'), 9000);
    setTimeout(() => li.remove(), 10000);
  }

  announce(big, small = '', color = '#fff', ms = 1800) {
    this.el.announce.innerHTML = `<div class="big" style="color:${color}">${esc(big)}</div>${small ? `<div class="small">${esc(small)}</div>` : ''}`;
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => {
      this.el.announce.innerHTML = '';
    }, ms);
  }

  xpToast(amount, label) {
    const feed = $('xpFeed');
    const li = document.createElement('li');
    li.textContent = `+${amount} XP · ${label}`;
    feed.append(li);
    while (feed.children.length > 4) feed.firstChild.remove();
    setTimeout(() => li.remove(), 1900);
  }

  toggleScoreboard(show) {
    this.el.scoreboard.classList.toggle('hidden', !show);
    if (show && this.snap) this.renderScoreboard(this.el.scoreboard);
  }

  scoreboardHtml() {
    const snap = this.snap;
    return ['T', 'CT']
      .map((team) => {
        const rows = snap.p
          .filter((p) => p.tm === team)
          .sort((a, b) => b.k - a.k || a.dt - b.dt)
          .map(
            (p) => `<tr class="${p.id === this.selfId ? 'me' : ''} ${p.a ? '' : 'dead'}">
              <td>${esc(p.n)}</td><td>${p.k}</td><td>${p.dt}</td><td>${p.dn}</td><td>${p.a ? p.s.length / 2 : '—'}</td>
              <td>${esc((WEAPONS[p.w] || WEAPONS.pistol).name)}</td>${this.online ? `<td>${p.b ? 'BOT' : p.pg}</td>` : ''}</tr>`
          )
          .join('');
        const score = team === 'T' ? snap.sc[0] : snap.sc[1];
        return `<div class="sb-team ${team}"><h3>${team === 'T' ? 'Terroristes' : 'Anti-terroristes'} — ${score}</h3>
          <table><tr><th>Joueur</th><th>K</th><th>D</th><th>Soldats</th><th>🐍</th><th>Arme</th>${this.online ? '<th>Ping</th>' : ''}</tr>${rows}</table></div>`;
      })
      .join('');
  }

  renderScoreboard(target) {
    target.innerHTML = this.scoreboardHtml();
  }

  showMatchOver() {
    const snap = this.snap;
    const el = this.el.matchOver;
    const self = this.player(this.selfId);
    const title = snap.mw === 'draw' ? 'ÉGALITÉ' : self && self.tm === snap.mw ? 'VICTOIRE !' : 'DÉFAITE';
    const p = this.progress;
    let summary = '';
    if (p) {
      const s = p.s;
      const lines = [...p.match.lines].map(([label, xp]) => `<li>${esc(label)}<b>+${xp}</b></li>`).join('');
      summary = `<div class="xp-summary">
        <div class="xp-head">${badgeHtml(s.level)}<span><b>${esc(rankName(s.level))}</b> · Niv. ${s.level}${s.streak > 1 ? ` · <span class="streak">🔥 ${s.streak}</span>` : ''}</span><span class="gain">+${p.match.xp} XP</span></div>
        <span class="xpbar"><i style="width:${Math.round((100 * s.xp) / xpToNext(s.level))}%"></i></span>
        ${lines ? `<ul class="xp-lines">${lines}</ul>` : ''}
        <ul class="dailies">${dailiesHtml(p.dailies())}</ul>
      </div>`;
    }
    el.innerHTML = `<h2>${title}</h2>
      <div class="final-score"><span class="T">${snap.sc[0]}</span> — <span class="CT">${snap.sc[1]}</span></div>
      ${summary}
      ${this.scoreboardHtml()}
      <div class="end-buttons">
        ${this.online ? '<p class="muted">Nouveau match automatique dans quelques secondes…</p>' : '<button class="btn primary big" id="replayBtn">Rejouer</button>'}
        <button class="btn" id="endMenuBtn">Menu</button>
      </div>`;
    el.classList.remove('hidden');
    $('replayBtn')?.addEventListener('click', () => this.onReplay?.());
    $('endMenuBtn').addEventListener('click', () => this.onMenu?.());
  }
}
