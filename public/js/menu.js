import { store } from './audio.js';
import { KEY_HELP } from './input.js';
import { SKINS } from '../shared/skins.js';
import { drawSkinPreview } from './render.js';
import { SOLO_XP, badgeHtml, dailiesHtml, rankColor, rankName, rankShort, xpToNext } from './progress.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const PHASES = {
  freeze: 'freeze',
  live: 'en jeu',
  planted: 'bombe posée',
  over: 'fin de round',
  warmup: 'warmup',
  matchover: 'fin de match'
};

export class Menu {
  constructor(actions, progress) {
    this.actions = actions;
    this.progress = progress;
    this.el = $('menu');
    this.opts = {
      teamSize: '3',
      difficulty: 'normal',
      team: 'auto',
      scoreToWin: '25',
      roomSize: '4',
      roomBots: '1',
      roomPublic: '0',
      ...store.get('scs-opts', {})
    };

    const name = $('nameInput');
    name.value = store.get('scs-name', '');
    name.addEventListener('input', () => store.set('scs-name', name.value.trim()));

    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    }

    for (const seg of document.querySelectorAll('.seg')) {
      const key = seg.dataset.opt;
      for (const btn of seg.querySelectorAll('button')) {
        btn.classList.toggle('on', btn.dataset.v === String(this.opts[key] ?? btn.parentElement.querySelector('.on')?.dataset.v));
        btn.addEventListener('click', () => {
          for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', b === btn);
          this.opts[key] = btn.dataset.v;
          store.set('scs-opts', this.opts);
          this.updateXpHint();
        });
      }
    }

    $('soloBtn').addEventListener('click', () =>
      actions.solo({
        name: this.name(),
        teamSize: Number(this.opts.teamSize),
        difficulty: this.opts.difficulty,
        team: this.opts.team,
        scoreToWin: Number(this.opts.scoreToWin)
      })
    );
    $('quickBtn').addEventListener('click', () => actions.quick(this.name()));
    $('joinBtn').addEventListener('click', () => this.joinCode());
    $('codeInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.joinCode();
    });
    $('createBtn').addEventListener('click', () =>
      actions.create({
        name: this.name(),
        teamSize: Number(this.opts.roomSize),
        bots: this.opts.roomBots === '1',
        isPublic: this.opts.roomPublic === '1'
      })
    );
    $('refreshBtn').addEventListener('click', () => actions.refresh());
    $('profileCard').addEventListener('click', () => this.showTab('profile'));
    this.updateXpHint();
    this.renderProfile();

    const keys = KEY_HELP.map(([k, v]) => `<kbd>${esc(k)}</kbd><span>${esc(v)}</span>`).join('');
    $('menuKeys').innerHTML = keys;
    $('pauseKeys').innerHTML = keys;

    const roomParam = new URLSearchParams(location.search).get('room');
    if (roomParam) {
      $('codeInput').value = roomParam.toUpperCase().slice(0, 4);
      this.showTab('online');
    }
  }

  name() {
    const n = $('nameInput').value.trim();
    return n || `Snake${Math.floor(Math.random() * 900 + 100)}`;
  }

  joinCode() {
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length !== 4) {
      this.error('Le code fait 4 lettres');
      return;
    }
    this.actions.join(code, this.name());
  }

  showTab(name) {
    for (const tab of document.querySelectorAll('.tab')) tab.classList.toggle('active', tab.dataset.tab === name);
    $('tab-solo').classList.toggle('hidden', name !== 'solo');
    $('tab-online').classList.toggle('hidden', name !== 'online');
    $('tab-profile').classList.toggle('hidden', name !== 'profile');
    if (name === 'online') this.actions.refresh();
    if (name === 'profile') this.renderProfile();
  }

  show() {
    this.el.classList.remove('hidden');
    this.setBusy(false);
    this.renderProfile();
  }

  updateXpHint() {
    const mult = SOLO_XP[this.opts.difficulty] || 1;
    $('xpHint').textContent = `XP ×${mult}${mult > 1 ? ' — le Hardcore rapporte plus !' : mult < 1 ? ' — passe en Normal ou Hardcore pour plus d\'XP' : ''}`;
  }

  renderProfile() {
    const s = this.progress.s;
    const need = xpToNext(s.level);
    const badge = $('rankBadge');
    badge.textContent = rankShort(s.level);
    badge.style.setProperty('--rc', rankColor(s.level));
    $('rankName').textContent = rankName(s.level);
    $('levelNum').textContent = s.level;
    $('xpFill').style.width = `${Math.round((100 * s.xp) / need)}%`;
    const next = this.progress.nextUnlock();
    $('xpText').textContent = `${s.xp} / ${need} XP${next ? ` · Prochain skin : ${next.name} (niv. ${next.level})` : ''}`;
    $('streakTag').textContent = s.streak > 1 ? `🔥 ${s.streak} victoires` : '';

    const dailies = this.progress.dailies();
    $('dailyList').innerHTML = dailiesHtml(dailies);
    $('dailyReset').textContent = `${dailies.filter((d) => d.done).length}/3 · nouveaux défis à minuit`;

    const grid = $('skinGrid');
    grid.innerHTML = SKINS.map((sk) => {
      const locked = sk.level > s.level;
      return `<button class="skin ${sk.id === s.skin ? 'on' : ''} ${locked ? 'locked' : ''}" data-skin="${sk.id}" type="button">
        <canvas></canvas><span>${esc(sk.name)}</span><small class="muted">${locked ? `🔒 niv. ${sk.level}` : sk.id === s.skin ? 'Équipé' : 'Débloqué'}</small></button>`;
    }).join('');
    for (const btn of grid.querySelectorAll('.skin')) {
      drawSkinPreview(btn.querySelector('canvas'), btn.dataset.skin, 'T', 0);
      btn.addEventListener('click', () => {
        if (this.progress.setSkin(btn.dataset.skin)) this.renderProfile();
      });
    }

    const st = s.stats;
    const kd = (st.kills / Math.max(1, st.deaths)).toFixed(2);
    const cells = [
      ['Matchs', st.matches],
      ['Victoires', st.wins],
      ['Kills', st.kills],
      ['K/D', kd],
      ['Soldats abattus', st.downs || 0],
      ['Record kills', st.bestKills],
      ['Meilleure série', s.bestStreak],
      ['XP totale', s.total],
      ['Rang', badgeHtml(s.level, 'sm')]
    ];
    $('statsGrid').innerHTML = cells.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
  }

  hide() {
    this.el.classList.add('hidden');
    this.error('');
  }

  setBusy(busy) {
    for (const id of ['soloBtn', 'quickBtn', 'joinBtn', 'createBtn']) $(id).disabled = busy;
  }

  error(msg) {
    const el = $('menuError');
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
  }

  setServer(status) {
    const el = $('serverStatus');
    if (!status) {
      el.textContent = 'Serveur injoignable — le mode solo marche quand même.';
      $('quickBtn').disabled = true;
      return;
    }
    $('quickBtn').disabled = false;
    el.textContent = `🟢 ${status.players} joueur${status.players > 1 ? 's' : ''} en ligne · ${status.rooms} salle${status.rooms > 1 ? 's' : ''}`;
    const list = $('roomList');
    if (!status.rooms || !status.list.length) {
      list.innerHTML = '<li class="muted">Aucune salle publique — lance une partie rapide !</li>';
      return;
    }
    list.innerHTML = status.list
      .map(
        (r) => `<li><span><b>${esc(r.code)}</b> · ${r.humans}/${r.max} · ${r.teamSize}v${r.teamSize} · ${r.score[0]}-${r.score[1]} · ${PHASES[r.phase] || r.phase}</span>
        <button data-code="${esc(r.code)}">Rejoindre</button></li>`
      )
      .join('');
    for (const btn of list.querySelectorAll('button')) {
      btn.addEventListener('click', () => this.actions.join(btn.dataset.code, this.name()));
    }
  }
}
