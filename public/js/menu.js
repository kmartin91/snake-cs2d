import { store } from './audio.js';
import { KEY_HELP } from './input.js';

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
  constructor(actions) {
    this.actions = actions;
    this.el = $('menu');
    this.opts = {
      teamSize: '3',
      difficulty: 'normal',
      team: 'auto',
      winRounds: '5',
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
        });
      }
    }

    $('soloBtn').addEventListener('click', () =>
      actions.solo({
        name: this.name(),
        teamSize: Number(this.opts.teamSize),
        difficulty: this.opts.difficulty,
        team: this.opts.team,
        winRounds: Number(this.opts.winRounds)
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
    if (name === 'online') this.actions.refresh();
  }

  show() {
    this.el.classList.remove('hidden');
    this.setBusy(false);
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
