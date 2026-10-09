const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0]
};

const NADE_KEYS = { KeyG: 'he', KeyF: 'flash', KeyC: 'smoke' };

export const KEY_HELP = [
  ['ZQSD / WASD / flèches', 'Diriger le leader (il avance toujours, l\'escouade suit)'],
  ['Souris', 'Viser — toute l\'escouade tire vers le viseur'],
  ['Clic / Espace', 'Tirer (plus précis en ligne droite)'],
  ['R', 'Recharger'],
  ['G · F · C', 'HE · Flash · Smoke vers le viseur'],
  ['Tab', 'Scores'],
  ['Entrée', 'Chat'],
  ['M', 'Couper le son'],
  ['Échap', 'Pause / menu']
];

const isTyping = (el) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

export function bindInput(canvas, h) {
  const held = { fire: false };
  const keys = new Set();
  let lastMove = '0,0';

  const set = (key, value) => {
    if (held[key] === value) return;
    held[key] = value;
    h[key](value);
  };

  const sendMove = () => {
    let x = 0;
    let y = 0;
    for (const code of keys) {
      x += MOVE_KEYS[code][0];
      y += MOVE_KEYS[code][1];
    }
    x = Math.sign(x);
    y = Math.sign(y);
    const key = `${x},${y}`;
    if (key === lastMove) return;
    lastMove = key;
    const len = Math.hypot(x, y) || 1;
    h.move(x / len, y / len);
  };

  const releaseAll = () => {
    set('fire', false);
    keys.clear();
    sendMove();
    h.scoreboard(false);
  };

  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    if (e.code === 'Escape') {
      h.escape();
      return;
    }
    if (!h.active()) return;
    if (e.code in MOVE_KEYS) {
      e.preventDefault();
      keys.add(e.code);
      sendMove();
      return;
    }
    if (e.code in NADE_KEYS) {
      h.nade(NADE_KEYS[e.code]);
      return;
    }
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        set('fire', true);
        break;
      case 'KeyR':
        h.reload();
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
    if (e.code in MOVE_KEYS) {
      keys.delete(e.code);
      sendMove();
      return;
    }
    if (e.code === 'Space') set('fire', false);
    if (e.code === 'Tab') h.scoreboard(false);
  });

  window.addEventListener('blur', releaseAll);
  window.addEventListener('mousemove', (e) => h.aimAt(e.clientX, e.clientY));
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && h.active()) set('fire', true);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) set('fire', false);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const stick = (padId, knobId, onMove, onEnd) => {
    const pad = document.getElementById(padId);
    const knob = document.getElementById(knobId);
    let pointer = null;
    const update = (e) => {
      const r = pad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const max = r.width * 0.32;
      const k = Math.min(d, max) / d;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      onMove(dx, dy, d, max);
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointer = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      pad.classList.add('active');
      update(e);
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointer) update(e);
    });
    const end = (e) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      knob.style.transform = '';
      pad.classList.remove('active');
      onEnd();
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  };

  stick(
    'movePad',
    'moveKnob',
    (dx, dy, d, max) => {
      if (!h.active() || d < 10) {
        h.move(0, 0);
        return;
      }
      const k = Math.min(1, d / max);
      h.move((dx / d) * k, (dy / d) * k);
    },
    () => h.move(0, 0)
  );
  stick(
    'aimPad',
    'aimKnob',
    (dx, dy, d) => {
      if (d > 12 && h.active()) {
        h.aimStick(Math.atan2(dy, dx));
        set('fire', true);
      } else {
        set('fire', false);
      }
    },
    () => set('fire', false)
  );

  const press = (btn, fn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('active');
      if (h.active()) fn();
    });
    const end = () => btn.classList.remove('active');
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end);
  };
  for (const btn of document.querySelectorAll('#touch [data-nade]')) press(btn, () => h.nade(btn.dataset.nade));
  press(document.getElementById('touchReload'), () => h.reload());

  return { releaseAll };
}
