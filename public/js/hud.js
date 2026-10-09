import { CONFIG, SHOP, TICK_MS, ZONE } from '../shared/config.js';
import { parseMap } from '../shared/map.js';
import { badgeHtml, dailiesHtml, rankName, xpToNext } from './progress.js';

const $ = (id) => document.getElementById(id);

const HOW = {
  headshot: '🎯',
  cut: '✂️',
  body: '🐍',
  headon: '💥',
  wall: '🧱',
  self: '🌀',
  he: '🧨',
  bomb: '☢️'
};

const HOW_TEXT = {
  headshot: 'headshot',
  cut: 'découpé',
  body: 's\'est encastré',
  headon: 'tête contre tête',
  wall: 'dans le mur',
  self: 's\'est mordu',
  he: 'grenade HE',
  bomb: 'explosion'
};

const REASONS = {
  elim: (w) => `Tous les ${w === 'T' ? 'CT' : 'T'} sont morts`,
  time: () => 'Temps écoulé',
  bomb: () => 'La bombe a explosé',
  defuse: () => 'Bombe désamorcée'
};

const ITEMS = [
  ['ar', '🛡 Kevlar'],
  ['he', 'HE'],
  ['fl', 'FLASH'],
  ['sm', 'SMOKE'],
  ['kit', 'KIT'],
  ['hb', '💣 C4']
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (ticks, tickMs = TICK_MS) => {
  const s = Math.max(0, Math.ceil((ticks * tickMs) / 1000 - 0.05));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class Hud {
  constructor({ onBuy }) {
    this.map = parseMap();
    this.onBuy = onBuy;
    this.progress = null;
    this.onReplay = null;
    this.onMenu = null;
    this.el = {
      hud: $('hud'),
      scoreT: $('scoreT'),
      scoreCT: $('scoreCT'),
      dotsT: $('dotsT'),
      dotsCT: $('dotsCT'),
      timer: $('timer'),
      phase: $('phase'),
      roomTag: $('roomTag'),
      killfeed: $('killfeed'),
      announce: $('announce'),
      hint: $('hint'),
      deathCard: $('deathCard'),
      chatLog: $('chatLog'),
      len: $('len'),
      staminaBar: $('staminaBar'),
      money: $('money'),
      items: $('items'),
      buyMenu: $('buyMenu'),
      buyList: $('buyList'),
      buyMoney: $('buyMoney'),
      scoreboard: $('scoreboard'),
      matchOver: $('matchOver'),
      flash: $('flash')
    };
    this.announceTimer = null;
    this.lastKiller = null;
    this.snap = null;
    this.selfId = null;
    this.online = false;
    this.buildItems();
  }

  reset() {
    this.el.killfeed.innerHTML = '';
    this.el.chatLog.innerHTML = '';
    this.el.announce.innerHTML = '';
    this.el.matchOver.classList.add('hidden');
    this.el.scoreboard.classList.add('hidden');
    this.el.buyMenu.classList.add('hidden');
    this.lastKiller = null;
  }

  buildItems() {
    this.el.items.innerHTML = ITEMS.map(([k, label]) => `<span data-k="${k}">${label}</span>`).join('');
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
    for (const team of ['T', 'CT']) {
      const dots = snap.p
        .filter((p) => p.tm === team)
        .map((p) => `<i class="${p.a ? '' : 'dead'}" title="${esc(p.n)}"></i>`)
        .join('');
      const target = team === 'T' ? el.dotsT : el.dotsCT;
      if (target.innerHTML !== dots) target.innerHTML = dots;
    }

    const b = snap.bomb;
    el.timer.classList.toggle('planted', snap.ph === 'planted');
    el.timer.classList.toggle('low', snap.ph === 'live' && snap.tm * snap.tk < 10000);
    let phase = '';
    switch (snap.ph) {
      case 'freeze':
        el.timer.textContent = fmt(snap.tm, snap.tk);
        phase = `Round ${snap.rd} · freeze · B pour acheter`;
        break;
      case 'live':
        el.timer.textContent = fmt(snap.tm, snap.tk);
        phase = `Round ${snap.rd} · premier à ${snap.wr}`;
        break;
      case 'planted':
        el.timer.textContent = `💣 ${fmt(b.t, snap.tk)}`;
        phase = `Bombe posée sur ${b.site || '?'}`;
        break;
      case 'over':
        el.timer.textContent = '—';
        phase = 'Fin du round';
        break;
      case 'warmup':
        el.timer.textContent = 'WARMUP';
        phase = 'En attente d\'adversaires…';
        break;
      case 'matchover':
        el.timer.textContent = 'GG';
        phase = 'Fin du match';
        break;
      default:
        el.timer.textContent = '—';
    }
    el.phase.textContent = phase;

    if (self) {
      const len = self.a ? self.s.length / 2 : 0;
      el.len.textContent = len + (self.gb > 0 ? `+${self.gb}` : '');
      el.len.parentElement.classList.toggle('low', self.a && len < CONFIG.minFireLength + 1);
      el.staminaBar.style.width = `${self.st}%`;
      el.staminaBar.parentElement.classList.toggle('locked', self.st < CONFIG.boostRestart && !self.bo);
      el.money.textContent = `$${self.$}`;
      for (const span of el.items.children) span.classList.toggle('on', Boolean(self[span.dataset.k]));
      el.flash.style.opacity = self.fx > 0 ? Math.min(1, (self.fx * snap.tk) / 1600).toFixed(2) : '0';
    }

    this.updateHint(snap, self);
    this.updateDeathCard(snap, self);
    if (!el.buyMenu.classList.contains('hidden')) {
      if (snap.ph !== 'freeze' && snap.ph !== 'warmup') this.toggleBuy(false);
      else this.renderBuy();
    }
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
      const hx = self.s[0];
      const hy = self.s[1];
      const zone = this.map.zone[hy * this.map.width + hx];
      const onSite = zone === ZONE.A || zone === ZONE.B;
      const b = snap.bomb;
      const len = self.s.length / 2;
      if (snap.ph === 'freeze') {
        text = 'Choisis ta direction · B : acheter';
      } else if (self.tm === 'T' && self.hb) {
        if (self.ac === 'plant') text = 'Pose en cours… ne lâche pas E';
        else if (onSite && snap.ph === 'live') {
          text = 'Maintiens E pour poser la bombe';
          alert = true;
        } else text = 'Tu as la bombe : direction A ou B';
      } else if (self.tm === 'CT' && b.s === 'planted' && snap.ph === 'planted') {
        const near = Math.max(Math.abs(hx - b.x), Math.abs(hy - b.y)) <= 1;
        if (self.ac === 'defuse') text = `Désamorçage… ${self.kit ? '(kit)' : 'sans kit, c\'est long !'}`;
        else if (near) text = 'Maintiens E pour désamorcer';
        else text = `Bombe sur ${b.site} — fonce désamorcer !`;
        alert = true;
      } else if (self.tm === 'T' && b.s === 'ground') {
        text = 'La bombe est au sol — récupère-la !';
        alert = true;
      } else if (len < CONFIG.minFireLength) {
        text = 'Plus de munitions — mange des caisses !';
      }
    }
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('alert', alert);
  }

  updateDeathCard(snap, self) {
    const el = this.el.deathCard;
    const show = self && !self.a && (snap.ph === 'live' || snap.ph === 'planted' || snap.ph === 'warmup');
    if (!show) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    let html = '<b>MORT</b>';
    if (this.lastKiller) {
      const k = this.player(this.lastKiller.killer);
      html += k ? `Tué par ${this.nameTag(k)} (${HOW_TEXT[this.lastKiller.how] || this.lastKiller.how})<br>` : `${HOW_TEXT[this.lastKiller.how] || ''}<br>`;
    }
    html += snap.ph === 'warmup' ? `Respawn dans ${Math.max(0, Math.ceil((self.rs * snap.tk) / 1000))}s` : 'Tu observes jusqu\'au prochain round';
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
    li.innerHTML = killer
      ? `${this.nameTag(killer)}<span class="how">${icon}</span>${this.nameTag(victim)}${streak}`
      : `<span class="how">${icon}</span>${this.nameTag(victim)}`;
    this.el.killfeed.prepend(li);
    while (this.el.killfeed.children.length > 6) this.el.killfeed.lastChild.remove();
    setTimeout(() => li.remove(), 7000);
  }

  chat(ev) {
    const li = document.createElement('li');
    const p = this.player(ev.id);
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

  roundEnd(ev) {
    const color = ev.winner === 'T' ? 'var(--t)' : 'var(--ct)';
    const mvp = this.player(ev.mvp);
    const reason = (REASONS[ev.reason] || (() => ''))(ev.winner);
    this.announce(
      ev.winner === 'T' ? 'LES TERRORISTES GAGNENT' : 'LES ANTI-TERRORISTES GAGNENT',
      `${reason}${mvp ? ` · MVP : ${mvp.n}` : ''}`,
      color,
      4200
    );
  }

  isBuyOpen() {
    return !this.el.buyMenu.classList.contains('hidden');
  }

  toggleBuy(force) {
    const open = force ?? !this.isBuyOpen();
    if (open && this.snap && this.snap.ph !== 'freeze' && this.snap.ph !== 'warmup') return false;
    this.el.buyMenu.classList.toggle('hidden', !open);
    if (open) this.renderBuy();
    return open;
  }

  renderBuy() {
    const self = this.player(this.selfId);
    if (!self) return;
    const free = this.snap.ph === 'warmup';
    this.el.buyMoney.textContent = free ? 'GRATUIT' : `$${self.$}`;
    const owned = { armor: self.ar, he: self.he, flash: self.fl, smoke: self.sm, kit: self.kit, ext: 0 };
    const html = SHOP.map((item, i) => {
      const wrongTeam = item.team && item.team !== self.tm;
      const disabled = wrongTeam || owned[item.id] || (!free && self.$ < item.price) || !self.a;
      return `<button class="buy-item" data-item="${item.id}" ${disabled ? 'disabled' : ''}>
        <kbd>${i + 1}</kbd>
        <span>${esc(item.label)}<small>${esc(item.desc)}${wrongTeam ? ' · CT uniquement' : ''}</small></span>
        <span class="price">${owned[item.id] ? '✓' : `$${item.price}`}</span>
      </button>`;
    }).join('');
    if (this.el.buyList.dataset.html !== html) {
      this.el.buyList.innerHTML = html;
      this.el.buyList.dataset.html = html;
      for (const btn of this.el.buyList.querySelectorAll('button')) {
        btn.addEventListener('click', () => this.onBuy(btn.dataset.item));
      }
    }
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
              <td>${esc(p.n)}${p.hb ? ' 💣' : ''}</td><td>${p.k}</td><td>${p.dt}</td><td>${'★'.repeat(Math.min(p.mvp, 5)) || '·'}</td>
              <td>$${p.$}</td>${this.online ? `<td>${p.b ? 'BOT' : p.pg}</td>` : ''}</tr>`
          )
          .join('');
        const score = team === 'T' ? snap.sc[0] : snap.sc[1];
        return `<div class="sb-team ${team}"><h3>${team === 'T' ? 'Terroristes' : 'Anti-terroristes'} — ${score}</h3>
          <table><tr><th>Joueur</th><th>K</th><th>D</th><th>MVP</th><th>$</th>${this.online ? '<th>Ping</th>' : ''}</tr>${rows}</table></div>`;
      })
      .join('');
  }

  renderScoreboard(target) {
    target.innerHTML = this.scoreboardHtml();
  }

  xpToast(amount, label) {
    const feed = document.getElementById('xpFeed');
    const li = document.createElement('li');
    li.textContent = `+${amount} XP · ${label}`;
    feed.append(li);
    while (feed.children.length > 4) feed.firstChild.remove();
    setTimeout(() => li.remove(), 1900);
  }

  showMatchOver() {
    const snap = this.snap;
    const el = this.el.matchOver;
    const winner = snap.mw;
    const self = this.player(this.selfId);
    const won = self && self.tm === winner;
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
    el.innerHTML = `<h2>${won ? 'VICTOIRE !' : 'DÉFAITE'}</h2>
      <div class="final-score"><span class="T">${snap.sc[0]}</span> — <span class="CT">${snap.sc[1]}</span></div>
      ${summary}
      ${this.scoreboardHtml()}
      <div class="end-buttons">
        ${this.online ? '<p class="muted">Nouveau match automatique dans quelques secondes…</p>' : '<button class="btn primary big" id="replayBtn">Rejouer</button>'}
        <button class="btn" id="endMenuBtn">Menu</button>
      </div>`;
    el.classList.remove('hidden');
    document.getElementById('replayBtn')?.addEventListener('click', () => this.onReplay?.());
    document.getElementById('endMenuBtn').addEventListener('click', () => this.onMenu?.());
  }
}
