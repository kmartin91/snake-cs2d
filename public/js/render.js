import { CONFIG, DIRS, ZONE, timings } from '../shared/config.js';
import { parseMap } from '../shared/map.js';
import { Fx } from './fx.js';

export const TEAM_COLORS = {
  T: { main: '#ff7a45', dark: '#6e2410', light: '#ffc9a3', glow: 'rgba(255,122,69,0.35)' },
  CT: { main: '#45b5ff', dark: '#0d3560', light: '#c4e9ff', glow: 'rgba(69,181,255,0.35)' }
};

const CALLOUTS = [
  { x: 20.5, y: 2.5, text: 'LONG A' },
  { x: 12, y: 14.5, text: 'MID' },
  { x: 20.5, y: 26, text: 'TUNNELS B' },
  { x: 26.5, y: 8, text: 'SHORT', vertical: true },
  { x: 26.5, y: 22, text: 'SHORT', vertical: true },
  { x: 42.5, y: 9, text: 'CT' }
];

export function cellsOf(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
}

function samplePath(P, a, b) {
  const at = (s) => {
    const i = Math.max(0, Math.min(P.length - 1, Math.floor(s)));
    const j = Math.min(P.length - 1, i + 1);
    const f = s - Math.floor(s);
    return { x: P[i].x + (P[j].x - P[i].x) * f, y: P[i].y + (P[j].y - P[i].y) * f };
  };
  const pts = [at(a)];
  for (let i = Math.floor(a) + 1; i < b; i += 1) pts.push(P[i]);
  if (b > a) pts.push(at(b));
  return pts;
}

export function interpSnake(prev, curr, k, t) {
  const n = curr.length;
  if (!prev || !prev.length || k <= 0 || n === 0) return curr;
  if (n > k && (curr[k].x !== prev[0].x || curr[k].y !== prev[0].y)) return curr;
  let dropped = prev.slice(Math.max(0, n - k));
  if (dropped.length > k + 1) dropped = dropped.slice(0, k);
  const P = curr.concat(dropped);
  return samplePath(P, (1 - t) * k, n - 1 + (1 - t) * dropped.length);
}

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = parseMap();
    this.cell = 20;
    this.dpr = 1;
    this.staticLayer = null;
    this.fx = new Fx();
    this.smokeCache = new Map();
    this.lastPaths = new Map();
    this.T = timings();
    this.tickMs = 0;
  }

  resize(cssW, cssH) {
    const { width, height } = this.map;
    const cell = Math.max(6, Math.min(cssW / width, cssH / height));
    const w = Math.floor(width * cell);
    const h = Math.floor(height * cell);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.cell === cell && this.dpr === dpr && this.canvas.width === Math.floor(w * dpr)) return;
    this.cell = cell;
    this.dpr = dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.staticLayer = null;
  }

  buildStatic() {
    const { width, height, wall, zone } = this.map;
    const c = this.cell;
    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const ctx = layer.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = width * c;
    const H = height * c;
    const rnd = seeded(1337);

    const sand = ctx.createLinearGradient(0, 0, W, H);
    sand.addColorStop(0, '#dcbd84');
    sand.addColorStop(0.5, '#cfa96d');
    sand.addColorStop(1, '#bf975c');
    ctx.fillStyle = sand;
    ctx.fillRect(0, 0, W, H);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const v = rnd();
        ctx.fillStyle = v > 0.5 ? `rgba(255,240,200,${(v - 0.5) * 0.12})` : `rgba(90,60,25,${v * 0.1})`;
        ctx.fillRect(x * c, y * c, c, c);
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const z = zone[y * width + x];
        if (z === ZONE.T) ctx.fillStyle = 'rgba(255,110,60,0.13)';
        else if (z === ZONE.CT) ctx.fillStyle = 'rgba(60,160,255,0.13)';
        else if (z === ZONE.A || z === ZONE.B) ctx.fillStyle = 'rgba(190,40,25,0.13)';
        else continue;
        ctx.fillRect(x * c, y * c, c, c);
      }
    }

    ctx.strokeStyle = 'rgba(80,50,20,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 1) {
      ctx.moveTo(x * c + 0.5, 0);
      ctx.lineTo(x * c + 0.5, H);
    }
    for (let y = 0; y <= height; y += 1) {
      ctx.moveTo(0, y * c + 0.5);
      ctx.lineTo(W, y * c + 0.5);
    }
    ctx.stroke();

    for (let i = 0; i < 2200; i += 1) {
      ctx.fillStyle = `rgba(70,45,15,${(0.04 + rnd() * 0.08).toFixed(3)})`;
      const s = 0.6 + rnd() * 1.6;
      ctx.fillRect(rnd() * W, rnd() * H, s, s);
    }

    for (const site of ['A', 'B']) {
      const cells = this.map.sites[site];
      const xs = cells.map((p) => p.x);
      const ys = cells.map((p) => p.y);
      const x0 = Math.min(...xs) * c;
      const y0 = Math.min(...ys) * c;
      const x1 = (Math.max(...xs) + 1) * c;
      const y1 = (Math.max(...ys) + 1) * c;
      ctx.setLineDash([c * 0.4, c * 0.25]);
      ctx.strokeStyle = 'rgba(170,30,20,0.55)';
      ctx.lineWidth = Math.max(2, c * 0.1);
      ctx.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(30.6 * c, (site === 'A' ? 6.4 : 22.6) * c);
      ctx.rotate(-0.08);
      ctx.fillStyle = 'rgba(160,25,15,0.38)';
      ctx.font = `${Math.round(c * 3.4)}px "Black Ops One", system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(site, 0, 0);
      ctx.restore();
    }

    ctx.font = `${Math.round(c * 0.7)}px "Black Ops One", system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(70,45,20,0.28)';
    for (const co of CALLOUTS) {
      ctx.save();
      ctx.translate(co.x * c, co.y * c);
      if (co.vertical) ctx.rotate(-Math.PI / 2);
      ctx.fillText(co.text, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(150,50,20,0.4)';
    ctx.fillText('T SPAWN', 5 * c, 19.6 * c);
    ctx.fillStyle = 'rgba(20,80,150,0.4)';
    ctx.fillText('CT SPAWN', 43 * c, 19.6 * c);

    const isWall = (x, y) => x < 0 || y < 0 || x >= width || y >= height || wall[y * width + x] === 1;
    ctx.fillStyle = 'rgba(40,22,5,0.32)';
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isWall(x, y)) continue;
        ctx.fillRect(x * c + c * 0.22, y * c + c * 0.3, c, c);
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isWall(x, y)) continue;
        const v = rnd() * 12;
        ctx.fillStyle = `rgb(${112 + v},${84 + v},${54 + v})`;
        ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5);
        ctx.fillStyle = 'rgba(255,225,170,0.10)';
        ctx.fillRect(x * c, y * c + c * 0.48, c + 0.5, Math.max(1, c * 0.05));
        ctx.fillRect(x * c + ((y % 2) * 0.5 + 0.25) * c, y * c, Math.max(1, c * 0.05), c * 0.48);
        ctx.fillRect(x * c + (((y + 1) % 2) * 0.5 + 0.25) * c, y * c + c * 0.5, Math.max(1, c * 0.05), c * 0.5);
        if (!isWall(x, y + 1)) {
          ctx.fillStyle = '#4e3820';
          ctx.fillRect(x * c, y * c + c * 0.72, c + 0.5, c * 0.28 + 0.5);
        }
        ctx.fillStyle = 'rgba(255,230,180,0.45)';
        if (!isWall(x, y - 1)) ctx.fillRect(x * c, y * c, c + 0.5, Math.max(1.5, c * 0.1));
        ctx.fillStyle = 'rgba(40,25,8,0.45)';
        if (!isWall(x - 1, y)) ctx.fillRect(x * c, y * c, Math.max(1, c * 0.07), c);
        if (!isWall(x + 1, y)) ctx.fillRect(x * c + c - Math.max(1, c * 0.07), y * c, Math.max(1, c * 0.07), c);
      }
    }

    const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(30,15,0,0.35)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    this.staticLayer = layer;
  }

  snakePaths(prev, curr, t) {
    const prevById = new Map(prev ? prev.p.map((p) => [p.id, p]) : []);
    const out = new Map();
    for (const p of curr.p) {
      if (!p.a || !p.s.length) continue;
      const cells = cellsOf(p.s);
      const pp = prevById.get(p.id);
      const pts = pp && pp.a && pp.sq === p.sq ? interpSnake(cellsOf(pp.s), cells, p.mv, t) : cells;
      out.set(p.id, pts);
    }
    this.lastPaths = out;
    return out;
  }

  draw({ prev, curr, t, selfId, now, dt }) {
    const ctx = this.ctx;
    const c = this.cell;
    if (!this.staticLayer) this.buildStatic();
    this.fx.update(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const sx = (Math.random() - 0.5) * this.fx.shake;
    const sy = (Math.random() - 0.5) * this.fx.shake;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    ctx.drawImage(this.staticLayer, 0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    if (!curr) return;
    if (curr.tk !== this.tickMs) {
      this.tickMs = curr.tk;
      this.T = timings(curr.tk);
    }

    const paths = this.snakePaths(prev, curr, t);
    const self = curr.p.find((p) => p.id === selfId);

    this.drawBombZone(curr, now);
    this.drawPellets(curr.pe, now);
    this.drawCrates(curr.cr, now);
    this.fx.drawBelow(ctx, c);
    if (curr.bomb.s === 'ground') this.drawBomb(curr, now);

    const ordered = [...curr.p].sort((a, b) => (a.id === selfId) - (b.id === selfId));
    for (const p of ordered) {
      const pts = paths.get(p.id);
      if (pts) this.drawSnake(p, pts, p.id === selfId, now);
    }

    if (curr.bomb.s === 'planted') this.drawBomb(curr, now);
    this.drawBullets(curr.bu, t);
    this.drawGrenades(curr.gr, t, now);
    this.fx.drawAbove(ctx, c);
    this.drawSmokes(curr.sm, now);

    const compact = c < 13;
    for (const p of curr.p) {
      const pts = paths.get(p.id);
      if (!pts) continue;
      if (compact && p.id !== selfId && !p.hb && !p.ac) continue;
      this.drawTag(p, pts[0], p.id === selfId, curr, now);
    }
    if (self && self.a && curr.ph === 'freeze') {
      const pts = paths.get(self.id);
      if (pts) this.drawYou(pts[0], now);
    }
  }

  drawSnake(p, pts, isSelf, now) {
    const ctx = this.ctx;
    const c = this.cell;
    const col = TEAM_COLORS[p.tm];
    const X = (v) => (v + 0.5) * c;

    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(X(pts[0].x), X(pts[0].y));
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1.5) ctx.moveTo(X(b.x), X(b.y));
        else ctx.lineTo(X(b.x), X(b.y));
      }
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length > 1) {
      ctx.save();
      ctx.translate(c * 0.14, c * 0.2);
      trace();
      ctx.strokeStyle = 'rgba(30,15,0,0.28)';
      ctx.lineWidth = c * 0.78;
      ctx.stroke();
      ctx.restore();

      trace();
      if (isSelf) {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = c * 0.98;
        ctx.stroke();
      }
      ctx.strokeStyle = col.dark;
      ctx.lineWidth = c * 0.8;
      ctx.stroke();
      ctx.strokeStyle = col.main;
      ctx.lineWidth = c * 0.58;
      ctx.stroke();
      ctx.setLineDash([c * 0.32, c * 0.68]);
      ctx.lineDashOffset = 0;
      ctx.strokeStyle = col.light;
      ctx.lineWidth = c * 0.22;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const h = pts[0];
    const hx = X(h.x);
    const hy = X(h.y);
    const f = DIRS[p.d];
    const r = c * 0.47;

    if (p.bo) {
      ctx.fillStyle = col.glow;
      ctx.beginPath();
      ctx.arc(hx, hy, r * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isSelf) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(hx, hy, r + c * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.82, 0, Math.PI * 2);
    ctx.fill();

    if (p.ar) {
      const ang = Math.atan2(f.y, f.x);
      ctx.strokeStyle = '#3d4a52';
      ctx.lineWidth = c * 0.2;
      ctx.beginPath();
      ctx.arc(hx, hy, r * 0.78, ang + Math.PI * 0.55, ang + Math.PI * 1.45);
      ctx.stroke();
      ctx.strokeStyle = '#8fa3ae';
      ctx.lineWidth = c * 0.07;
      ctx.stroke();
    }

    const side = { x: -f.y, y: f.x };
    for (const s of [-1, 1]) {
      const ex = hx + f.x * r * 0.32 + side.x * r * 0.42 * s;
      const ey = hy + f.y * r * 0.32 + side.y * r * 0.42 * s;
      if (p.fx > 0) {
        ctx.strokeStyle = '#111';
        ctx.lineWidth = c * 0.07;
        ctx.beginPath();
        ctx.moveTo(ex - c * 0.08, ey - c * 0.08);
        ctx.lineTo(ex + c * 0.08, ey + c * 0.08);
        ctx.moveTo(ex + c * 0.08, ey - c * 0.08);
        ctx.lineTo(ex - c * 0.08, ey + c * 0.08);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex, ey, r * 0.27, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(ex + f.x * r * 0.1, ey + f.y * r * 0.1, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (p.hb && pts.length > 1) {
      const b = pts[Math.min(2, pts.length - 1)];
      this.drawC4(X(b.x), X(b.y), c * 0.55, now, 500);
    }
  }

  drawC4(x, y, size, now, period) {
    const ctx = this.ctx;
    ctx.fillStyle = '#2b2d1f';
    ctx.fillRect(x - size / 2, y - size * 0.32, size, size * 0.64);
    ctx.fillStyle = '#6b6f45';
    ctx.fillRect(x - size * 0.42, y - size * 0.24, size * 0.84, size * 0.48);
    ctx.fillStyle = '#1b1c12';
    ctx.fillRect(x - size * 0.3, y - size * 0.14, size * 0.4, size * 0.28);
    const on = Math.floor(now / period) % 2 === 0;
    ctx.fillStyle = on ? '#ff2a1a' : '#5a1510';
    ctx.beginPath();
    ctx.arc(x + size * 0.25, y, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  drawTag(p, h, isSelf, curr, now) {
    const ctx = this.ctx;
    const c = this.cell;
    const x = (h.x + 0.5) * c;
    const y = (h.y + 0.5) * c;
    const col = TEAM_COLORS[p.tm];

    if (p.ac) {
      const b = curr.bomb;
      const k = p.ac === 'plant' ? b.pp / this.T.plant : b.dp / b.dn;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = c * 0.22;
      ctx.beginPath();
      ctx.arc(x, y, c * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = p.ac === 'plant' ? '#ff4b2b' : '#4bd2ff';
      ctx.beginPath();
      ctx.arc(x, y, c * 0.95, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, k));
      ctx.stroke();
    }

    const label = p.n;
    ctx.font = `700 ${Math.max(9, Math.round(c * 0.42))}px "Space Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const ty = y - c * 0.7;
    const w = ctx.measureText(label).width + 8;
    ctx.fillStyle = 'rgba(10,14,18,0.55)';
    ctx.fillRect(x - w / 2, ty - c * 0.5, w, c * 0.52);
    ctx.fillStyle = isSelf ? '#ffe46b' : col.light;
    ctx.fillText(label, x, ty);
    if (p.ar || p.hb) {
      const icons = `${p.ar ? '🛡' : ''}${p.hb ? '💣' : ''}`;
      ctx.font = `${Math.max(9, Math.round(c * 0.38))}px system-ui`;
      ctx.fillText(icons, x + w / 2 + c * 0.35, ty);
    }
  }

  drawYou(h, now) {
    const ctx = this.ctx;
    const c = this.cell;
    const x = (h.x + 0.5) * c;
    const y = (h.y + 0.5) * c - c * 1.7 - Math.abs(Math.sin(now / 180)) * c * 0.4;
    ctx.fillStyle = '#ffe46b';
    ctx.beginPath();
    ctx.moveTo(x - c * 0.35, y - c * 0.3);
    ctx.lineTo(x + c * 0.35, y - c * 0.3);
    ctx.lineTo(x, y + c * 0.15);
    ctx.closePath();
    ctx.fill();
  }

  drawPellets(flat, now) {
    const ctx = this.ctx;
    const c = this.cell;
    for (let i = 0; i < flat.length; i += 2) {
      const x = (flat[i] + 0.5) * c;
      const y = (flat[i + 1] + 0.5) * c;
      const pulse = 1 + Math.sin(now / 200 + i) * 0.15;
      ctx.fillStyle = 'rgba(255,240,150,0.28)';
      ctx.beginPath();
      ctx.arc(x, y, c * 0.3 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3a8';
      ctx.beginPath();
      ctx.arc(x, y, c * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawCrates(flat, now) {
    const ctx = this.ctx;
    const c = this.cell;
    for (let i = 0; i < flat.length; i += 2) {
      const bob = Math.sin(now / 300 + i) * c * 0.05;
      const s = c * 0.78;
      const x = (flat[i] + 0.5) * c - s / 2;
      const y = (flat[i + 1] + 0.5) * c - s / 2 + bob;
      ctx.fillStyle = 'rgba(40,20,0,0.3)';
      ctx.fillRect(x + c * 0.12, y + c * 0.16, s, s);
      ctx.fillStyle = '#b37a3a';
      ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = '#5e3a14';
      ctx.lineWidth = Math.max(1.5, c * 0.07);
      ctx.strokeRect(x, y, s, s);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.stroke();
      ctx.fillStyle = '#ffe07a';
      ctx.fillRect(x + s * 0.35, y + s * 0.35, s * 0.3, s * 0.3);
    }
  }

  drawBombZone(curr, now) {
    const b = curr.bomb;
    if (b.s !== 'planted') return;
    const ctx = this.ctx;
    const c = this.cell;
    const urgency = 1 - b.t / this.T.bomb;
    const pulse = 0.5 + Math.sin(now / (120 - urgency * 80)) * 0.5;
    ctx.fillStyle = `rgba(255,40,20,${0.04 + urgency * 0.12 * pulse})`;
    ctx.beginPath();
    ctx.arc((b.x + 0.5) * c, (b.y + 0.5) * c, CONFIG.bombRadius * c, 0, Math.PI * 2);
    ctx.fill();
    ctx.setLineDash([c * 0.5, c * 0.35]);
    ctx.strokeStyle = `rgba(255,40,20,${0.25 + urgency * 0.5})`;
    ctx.lineWidth = Math.max(1.5, c * 0.08);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawBomb(curr, now) {
    const b = curr.bomb;
    const c = this.cell;
    const x = (b.x + 0.5) * c;
    const y = (b.y + 0.5) * c;
    if (b.s === 'ground') {
      const pulse = 1 + Math.sin(now / 160) * 0.2;
      this.ctx.fillStyle = 'rgba(255,220,80,0.3)';
      this.ctx.beginPath();
      this.ctx.arc(x, y, c * 0.8 * pulse, 0, Math.PI * 2);
      this.ctx.fill();
      this.drawC4(x, y, c * 0.85, now, 700);
    } else if (b.s === 'planted') {
      const period = Math.max(60, (b.t / this.T.bomb) * 500);
      const glow = Math.floor(now / period) % 2 === 0;
      if (glow) {
        this.ctx.fillStyle = 'rgba(255,40,20,0.35)';
        this.ctx.beginPath();
        this.ctx.arc(x, y, c * 0.9, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.strokeStyle = 'rgba(255,60,30,0.9)';
      this.ctx.lineWidth = Math.max(1.5, c * 0.08);
      this.ctx.beginPath();
      this.ctx.arc(x, y, c * 0.75, 0, Math.PI * 2);
      this.ctx.stroke();
      this.drawC4(x, y, c * 1.05, now, period);
    }
  }

  drawBullets(list, t) {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.lineCap = 'round';
    for (const [, x, y, px, py, team, done] of list) {
      if (done && t >= 1) continue;
      const k = Math.min(1, t);
      const cx = px + (x - px) * k;
      const cy = py + (y - py) * k;
      const dx = Math.sign(x - px);
      const dy = Math.sign(y - py);
      const tail = Math.min(1.8, Math.abs(x - px) + Math.abs(y - py)) * Math.max(0.4, k);
      const x1 = (cx + 0.5) * c;
      const y1 = (cy + 0.5) * c;
      const x0 = (cx - dx * tail + 0.5) * c;
      const y0 = (cy - dy * tail + 0.5) * c;
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(255,240,170,0)');
      grad.addColorStop(1, team === 0 ? '#ffd27a' : '#bfefff');
      ctx.strokeStyle = grad;
      ctx.lineWidth = c * 0.18;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x1, y1, c * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawGrenades(list, t, now) {
    const ctx = this.ctx;
    const c = this.cell;
    const colors = { he: '#4f6b2f', flash: '#e9eef0', smoke: '#8c959b' };
    for (const [, type, x, y, px, py] of list) {
      const cx = (px + (x - px) * t + 0.5) * c;
      const cy = (py + (y - py) * t + 0.5) * c;
      const moving = x !== px || y !== py;
      const lift = moving ? Math.sin(t * Math.PI) * c * 0.35 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(cx + c * 0.1, cy + c * 0.15, c * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors[type];
      ctx.strokeStyle = '#1d2226';
      ctx.lineWidth = Math.max(1, c * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy - lift, c * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!moving && Math.floor(now / 90) % 2 === 0) {
        ctx.fillStyle = type === 'he' ? '#ff3b1f' : '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, c * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawSmokes(list, now) {
    const ctx = this.ctx;
    const c = this.cell;
    const seen = new Set();
    for (const [x, y, ttl] of list) {
      const key = `${x},${y}`;
      seen.add(key);
      if (!this.smokeCache.has(key)) {
        const rnd = seeded(x * 73856093 + y * 19349663);
        const puffs = [];
        for (let i = 0; i < 16; i += 1) {
          const a = rnd() * Math.PI * 2;
          const d = Math.sqrt(rnd()) * CONFIG.smokeRadius * 0.72;
          puffs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: 1.1 + rnd() * 0.9, ph: rnd() * 6 });
        }
        this.smokeCache.set(key, puffs);
      }
      const age = this.T.smoke - ttl;
      const grow = Math.min(1, age / (this.T.smoke * 0.1));
      const fade = Math.min(1, ttl / (this.T.smoke * 0.17));
      for (const pf of this.smokeCache.get(key)) {
        const wob = Math.sin(now / 900 + pf.ph) * 0.15;
        const px = (x + pf.dx * grow + wob + 0.5) * c;
        const py = (y + pf.dy * grow - wob + 0.5) * c;
        const r = pf.r * c * (0.5 + grow * 0.5);
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(205,210,212,${0.95 * fade})`);
        g.addColorStop(0.65, `rgba(185,190,194,${0.85 * fade})`);
        g.addColorStop(1, 'rgba(170,175,180,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const key of this.smokeCache.keys()) if (!seen.has(key)) this.smokeCache.delete(key);
  }
}
