const DIR_KEYS = {
  KeyW: 0,
  ArrowUp: 0,
  KeyD: 1,
  ArrowRight: 1,
  KeyS: 2,
  ArrowDown: 2,
  KeyA: 3,
  ArrowLeft: 3
};

const NADE_KEYS = { KeyG: 'he', KeyF: 'flash', KeyC: 'smoke' };

export const KEY_HELP = [
  ['ZQSD / WASD / ↑←↓→', 'Diriger le serpent'],
  ['Espace / clic', 'Tirer (coûte 1 segment)'],
  ['Shift', 'Sprint'],
  ['E (maintenu)', 'Poser / désamorcer'],
  ['G · F · C', 'HE · Flash · Smoke'],
  ['B puis 1-6', 'Acheter (freeze time)'],
  ['Tab', 'Scores'],
  ['Entrée', 'Chat'],
  ['M', 'Couper le son'],
  ['Échap', 'Pause / menu']
];

const isTyping = (el) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

export function bindInput(canvas, h) {
  const held = { fire: false, boost: false, action: false };
  const set = (key, value) => {
    if (held[key] === value) return;
    held[key] = value;
    h[key](value);
  };
  const releaseAll = () => {
    set('fire', false);
    set('boost', false);
    set('action', false);
    h.scoreboard(false);
  };

  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    if (e.code === 'Escape') {
      h.escape();
      return;
    }
    if (!h.active()) return;
    if (e.code in DIR_KEYS) {
      e.preventDefault();
      if (!e.repeat) h.dir(DIR_KEYS[e.code]);
      return;
    }
    if (e.code in NADE_KEYS) {
      h.nade(NADE_KEYS[e.code]);
      return;
    }
    const digit = /^(Digit|Numpad)([1-6])$/.exec(e.code);
    if (digit) {
      h.buy(Number(digit[2]) - 1);
      return;
    }
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        set('fire', true);
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        set('boost', true);
        break;
      case 'KeyE':
        set('action', true);
        break;
      case 'KeyB':
        h.toggleBuy();
        break;
      case 'Tab':
        e.preventDefault();
        h.scoreboard(true);
        break;
      case 'Enter':
        e.preventDefault();
        releaseAll();
        h.chat();
        break;
      case 'KeyM':
        h.mute();
        break;
      default:
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'Space':
        set('fire', false);
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        set('boost', false);
        break;
      case 'KeyE':
        set('action', false);
        break;
      case 'Tab':
        h.scoreboard(false);
        break;
      default:
    }
  });

  window.addEventListener('blur', releaseAll);

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && h.active()) set('fire', true);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) set('fire', false);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  let swipe = null;
  canvas.addEventListener(
    'touchstart',
    (e) => {
      const t = e.changedTouches[0];
      swipe = { x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );
  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (!swipe || !h.active()) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipe.x;
      const dy = t.clientY - swipe.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      h.dir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      swipe = { x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );

  const press = (btn, down, up) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('active');
      down();
    });
    const end = (e) => {
      e.preventDefault();
      btn.classList.remove('active');
      if (up) up();
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end);
  };

  for (const btn of document.querySelectorAll('#touch [data-dir]')) {
    press(btn, () => h.active() && h.dir(Number(btn.dataset.dir)));
  }
  for (const btn of document.querySelectorAll('#touch [data-nade]')) {
    press(btn, () => h.active() && h.nade(btn.dataset.nade));
  }
  press(document.getElementById('touchFire'), () => set('fire', true), () => set('fire', false));
  press(document.getElementById('touchAct'), () => set('action', true), () => set('action', false));
  press(document.getElementById('touchBoost'), () => set('boost', true), () => set('boost', false));
  press(document.getElementById('touchBuy'), () => h.toggleBuy());

  return { releaseAll };
}
