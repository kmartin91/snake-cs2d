import { CONFIG, WEAPONS, ZONE } from '../shared/config.js';
import { CALLOUTS, parseMap } from '../shared/map.js';
import { computeVision } from '../shared/vision.js';
import { WEAPON_KEYS } from '../shared/game.js';
import { Fx } from './fx.js';
import { skinById } from '../shared/skins.js';

export const TEAM_COLORS = {
  T: { main: '#ff7a45', dark: '#6e2410', light: '#ffc9a3', glow: 'rgba(255,122,69,0.35)' },
  CT: { main: '#45b5ff', dark: '#0d3560', light: '#c4e9ff', glow: 'rgba(69,181,255,0.35)' }
};

export function soldiersOf(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
}

const LOOT_LETTER = { smg: 'SMG', rifle: 'AK', shotgun: 'POMPE', sniper: 'AWP', golden: 'GOLD' };

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function bodyFill(ctx, skin, col, pts, c, now) {
  const stops = skin.rainbow
    ? Array.from({ length: 6 }, (_, i) => `hsl(${(now / 8 + i * 60) % 360} 90% 60%)`)
    : skin.gradient;
  if (!stops) return skin.body || col.main;
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 0.5) return stops[0];
  const g = ctx.createLinearGradient((a.x + 0.5) * c, (a.y + 0.5) * c, (b.x + 0.5) * c, (b.y + 0.5) * c);
  stops.forEach((color, i) => g.addColorStop(i / (stops.length - 1), color));
  return g;
}

export function paintSnake(ctx, pts, c, { team, skin: skinId, angle = 0, aim = null, isSelf = false, shield = false, flashed = false }, now) {
  const col = TEAM_COLORS[team];
  const skin = skinById(skinId);
  const X = (v) => (v + 0.5) * c;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(X(pts[0].x), X(pts[0].y));
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 2.5) ctx.moveTo(X(b.x), X(b.y));
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
    if (skin.glow) {
      ctx.strokeStyle = skin.glow;
      ctx.lineWidth = c * 1.3;
      ctx.stroke();
    }
    if (isSelf) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = c * 0.98;
      ctx.stroke();
    }
    ctx.strokeStyle = col.dark;
    ctx.lineWidth = c * 0.8;
    ctx.stroke();
    ctx.strokeStyle = bodyFill(ctx, skin, col, pts, c, now);
    ctx.lineWidth = c * 0.58;
    ctx.stroke();
    const dash = skin.dash || [0.32, 0.68];
    ctx.setLineDash(dash[1] === 0 ? [] : [c * dash[0], c * dash[1]]);
    ctx.lineDashOffset = 0;
    ctx.strokeStyle = skin.stripe || col.light;
    ctx.lineWidth = c * (skin.width || 0.22);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const h = pts[0];
  const hx = X(h.x);
  const hy = X(h.y);
  const f = { x: Math.cos(angle), y: Math.sin(angle) };
  const r = c * 0.47;

  if (aim !== null) {
    const ax = Math.cos(aim);
    const ay = Math.sin(aim);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#15191c';
    ctx.lineWidth = c * 0.24;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + ax * r * 1.75, hy + ay * r * 1.75);
    ctx.stroke();
    ctx.strokeStyle = '#5b666d';
    ctx.lineWidth = c * 0.08;
    ctx.beginPath();
    ctx.moveTo(hx + ax * r * 0.8, hy + ay * r * 0.8);
    ctx.lineTo(hx + ax * r * 1.7, hy + ay * r * 1.7);
    ctx.stroke();
    ctx.lineCap = 'round';
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

  if (shield) {
    ctx.strokeStyle = 'rgba(160,230,255,0.75)';
    ctx.lineWidth = Math.max(1.5, c * 0.07);
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.55, 0, Math.PI * 2);
    ctx.stroke();
  }

  const side = { x: -f.y, y: f.x };
  for (const s of [-1, 1]) {
    const ex = hx + f.x * r * 0.32 + side.x * r * 0.42 * s;
    const ey = hy + f.y * r * 0.32 + side.y * r * 0.42 * s;
    if (flashed) {
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
}

const PREVIEW_PATH = [
  { x: 0, y: 2 },
  { x: 1, y: 2 },
  { x: 2, y: 2 },
  { x: 2, y: 1 },
  { x: 3, y: 1 },
  { x: 4, y: 1 },
  { x: 4, y: 0 },
  { x: 5, y: 0 }
].reverse();

export function drawSkinPreview(canvas, skinId, team, now) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 96;
  const h = canvas.clientHeight || 52;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const c = Math.min(w / 6.4, h / 3.4);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.translate((w - 6 * c) / 2, (h - 3 * c) / 2);
  paintSnake(ctx, PREVIEW_PATH, c, { team, skin: skinId, angle: 0 }, now);
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
    this.bullets = [];
    const { width, height } = this.map;
    const n = width * height;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = width;
    this.fogCanvas.height = height;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(width, height);
    this.fogFrom = new Float32Array(n);
    this.fogTo = new Float32Array(n);
    this.fogShown = new Float32Array(n);
    this.visMask = new Uint8Array(n).fill(1);
    this.fogTick = -1;
    this.pings = [];
  }

  isWall(x, y) {
    const { width, height, wall } = this.map;
    return x < 0 || y < 0 || x >= width || y >= height || wall[y * width + x] === 1;
  }
  visible(x, y) {
    return this.visMask[y * this.map.width + x] === 1;
  }
  updateFog(curr, team) {
    if (curr.t === this.fogTick) return;
    this.fogTick = curr.t;
    this.fogFrom.set(this.fogShown);
    if (!curr.fog || !team) {
      this.visMask.fill(1);
      this.fogTo.fill(0);
      return;
    }
    const sources = [];
    for (const p of curr.p) {
      if (p.tm !== team || !p.a || !p.s.length) continue;
      sources.push({ x: p.s[0], y: p.s[1], r: CONFIG.visionLeader });
      for (let i = 2; i < p.s.length; i += 2) sources.push({ x: p.s[i], y: p.s[i + 1], r: CONFIG.visionFollower });
    }
    const smokes = curr.sm.map(([x, y]) => ({ x, y, r: CONFIG.smokeRadius }));
    computeVision(this.map, sources, smokes, this.visMask);
    for (let i = 0; i < this.visMask.length; i += 1) this.fogTo[i] = this.visMask[i] ? 0 : 0.8;
  }

  drawFog(t) {
    const data = this.fogImg.data;
    const k = Math.min(1, t * 1.6);
    let any = false;
    for (let i = 0; i < this.fogShown.length; i += 1) {
      const a = this.fogFrom[i] + (this.fogTo[i] - this.fogFrom[i]) * k;
      this.fogShown[i] = a;
      if (a > 0.01) any = true;
      data[i * 4] = 6;
      data[i * 4 + 1] = 10;
      data[i * 4 + 2] = 16;
      data[i * 4 + 3] = Math.round(a * 255);
    }
    if (!any) return;
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    const { width, height } = this.map;
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    if ('filter' in ctx) ctx.filter = `blur(${Math.max(2, this.cell * 0.45).toFixed(1)}px)`;
    ctx.drawImage(this.fogCanvas, 0, 0, width * this.cell, height * this.cell);
    if ('filter' in ctx) ctx.filter = 'none';
  }
  ping(x, y, kind) {
    if (document.hidden || this.pings.length > 40) return;
    this.pings.push({ x, y, kind, life: kind === 'shot' ? 0.9 : 1.1, max: kind === 'shot' ? 0.9 : 1.1 });
  }
  drawPings(dt) {
    const ctx = this.ctx;
    const c = this.cell;
    for (const p of this.pings) {
      p.life -= dt;
      const k = 1 - p.life / p.max;
      const shot = p.kind === 'shot';
      ctx.globalAlpha = Math.max(0, 1 - k) * (shot ? 0.9 : 0.7);
      ctx.strokeStyle = shot ? '#ffb347' : '#ff4b3a';
      ctx.lineWidth = Math.max(1.5, c * (shot ? 0.12 : 0.08));
      ctx.beginPath();
      ctx.arc((p.x + 0.5) * c, (p.y + 0.5) * c, c * (0.3 + k * (shot ? 1.6 : 1.1)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.pings = this.pings.filter((p) => p.life > 0);
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
      ctx.translate(x0 + c * 1.5, (y0 + y1) / 2 + c * 0.3);
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
    for (const [z, label, color] of [[ZONE.T, 'T SPAWN', 'rgba(150,50,20,0.4)'], [ZONE.CT, 'CT SPAWN', 'rgba(20,80,150,0.4)']]) {
      let sx = 0;
      let n = 0;
      let maxY = 0;
      for (let i = 0; i < zone.length; i += 1) {
        if (zone[i] !== z) continue;
        sx += i % width;
        n += 1;
        maxY = Math.max(maxY, Math.floor(i / width));
      }
      ctx.fillStyle = color;
      ctx.fillText(label, (sx / n + 0.5) * c, (maxY + 1.6) * c);
    }

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
  toCell(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.cell - 0.5, y: (clientY - r.top) / this.cell - 0.5 };
  }

  drawAim(aim) {
    const ctx = this.ctx;
    const c = this.cell;
    const hx = (aim.head.x + 0.5) * c;
    const hy = (aim.head.y + 0.5) * c;
    const len = Math.min(Math.max(aim.dist, 2), 10) * c;
    const ax = Math.cos(aim.angle);
    const ay = Math.sin(aim.angle);
    ctx.save();
    ctx.setLineDash([c * 0.25, c * 0.35]);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = Math.max(1, c * 0.06);
    ctx.beginPath();
    ctx.moveTo(hx + ax * c * 0.9, hy + ay * c * 0.9);
    ctx.lineTo(hx + ax * len, hy + ay * len);
    ctx.stroke();
    ctx.restore();
    if (!aim.target) return;
    const x = (aim.target.x + 0.5) * c;
    const y = (aim.target.y + 0.5) * c;
    const g = c * 0.28;
    const cross = () => {
      ctx.beginPath();
      ctx.moveTo(x - g * 2.2, y);
      ctx.lineTo(x - g, y);
      ctx.moveTo(x + g, y);
      ctx.lineTo(x + g * 2.2, y);
      ctx.moveTo(x, y - g * 2.2);
      ctx.lineTo(x, y - g);
      ctx.moveTo(x, y + g);
      ctx.lineTo(x, y + g * 2.2);
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = Math.max(3, c * 0.14);
    cross();
    ctx.strokeStyle = '#7dff7a';
    ctx.lineWidth = Math.max(1.5, c * 0.07);
    cross();
  }

  addBullets(list) {
    if (document.hidden) return;
    const delay = 0.05;
    for (const [id, x, y, a, speed, range, team, wi] of list) {
      const w = WEAPONS[WEAPON_KEYS[wi]] || WEAPONS.pistol;
      this.bullets.push({ id, x, y, vx: Math.cos(a), vy: Math.sin(a), speed, range, team, color: w.color, delay, age: 0 });
    }
    if (this.bullets.length > 400) this.bullets.splice(0, this.bullets.length - 400);
  }

  hitBullet(id, x, y) {
    const i = this.bullets.findIndex((b) => b.id === id);
    if (i >= 0) this.bullets.splice(i, 1);
    this.fx.burst(x, y, { n: 4, color: ['#fff3c4', '#ffd27a'], speed: 4, life: 0.18, size: 0.08 });
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      let travel = b.speed * dt;
      b.age += dt;
      while (travel > 0 && !b.dead) {
        const step = Math.min(0.25, travel);
        travel -= step;
        b.x += b.vx * step;
        b.y += b.vy * step;
        b.range -= step;
        if (this.isWall(Math.round(b.x), Math.round(b.y))) {
          b.dead = true;
          this.fx.burst(b.x - b.vx * 0.2, b.y - b.vy * 0.2, { n: 3, color: ['#e9d7a8', '#9b8a6a'], speed: 3, life: 0.2, size: 0.07 });
        } else if (b.range <= 0) {
          b.dead = true;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  drawBullets() {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.lineCap = 'round';
    for (const b of this.bullets) {
      if (b.delay > 0) continue;
      const tail = Math.min(0.9, b.age * b.speed);
      const x1 = (b.x + 0.5) * c;
      const y1 = (b.y + 0.5) * c;
      const x0 = (b.x - b.vx * tail + 0.5) * c;
      const y0 = (b.y - b.vy * tail + 0.5) * c;
      const grad = ctx.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, b.color);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(1.5, c * 0.12);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  squadPoints(prev, curr, t) {
    const prevById = new Map(prev ? prev.p.map((p) => [p.id, p]) : []);
    const out = new Map();
    for (const p of curr.p) {
      if (!p.a || !p.s.length) continue;
      const cur = soldiersOf(p.s);
      const pp = prevById.get(p.id);
      if (pp && pp.a && pp.sq === p.sq && pp.s.length) {
        const old = soldiersOf(pp.s);
        for (let i = 0; i < cur.length; i += 1) {
          const o = old[i];
          if (!o || Math.hypot(o.x - cur[i].x, o.y - cur[i].y) > 2) continue;
          cur[i] = { x: o.x + (cur[i].x - o.x) * t, y: o.y + (cur[i].y - o.y) * t };
        }
      }
      out.set(p.id, cur);
    }
    this.lastPaths = out;
    return out;
  }

  drawSquad(p, pts, isSelf, now) {
    const ctx = this.ctx;
    const c = this.cell;
    const col = TEAM_COLORS[p.tm];
    paintSnake(ctx, pts, c, { team: p.tm, skin: p.sk, angle: p.an, aim: p.am, isSelf, shield: p.sh, flashed: p.fx > 0 }, now);
    const ax = pts[0].x + Math.cos(p.am) * Math.max(3, p.ad || 6);
    const ay = pts[0].y + Math.sin(p.am) * Math.max(3, p.ad || 6);
    for (let i = 1; i < pts.length; i += 1) {
      const s = pts[i];
      const x = (s.x + 0.5) * c;
      const y = (s.y + 0.5) * c;
      const a = Math.atan2(ay - s.y, ax - s.x);
      ctx.strokeStyle = '#15191c';
      ctx.lineWidth = c * 0.16;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * c * 0.55, y + Math.sin(a) * c * 0.55);
      ctx.stroke();
      ctx.lineCap = 'round';
      ctx.fillStyle = col.dark;
      ctx.beginPath();
      ctx.arc(x, y, c * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col.light;
      ctx.beginPath();
      ctx.arc(x, y, c * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.arc(x - c * 0.05, y - c * 0.06, c * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTag(p, h, isSelf) {
    const ctx = this.ctx;
    const c = this.cell;
    const col = TEAM_COLORS[p.tm];
    const x = (h.x + 0.5) * c;
    const y = (h.y + 0.5) * c;
    const bw = c * 1.4;
    const by = y - c * 0.95;
    ctx.fillStyle = 'rgba(10,14,18,0.7)';
    ctx.fillRect(x - bw / 2 - 1, by - 1, bw + 2, c * 0.16 + 2);
    const ratio = Math.max(0, Math.min(1, p.hp / CONFIG.leaderHp));
    ctx.fillStyle = ratio > 0.5 ? '#7dff7a' : ratio > 0.25 ? '#ffd25e' : '#ff4b3a';
    ctx.fillRect(x - bw / 2, by, bw * ratio, c * 0.16);
    ctx.font = `700 ${Math.max(9, Math.round(c * 0.4))}px "Space Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(10,14,18,0.6)';
    const label = `${p.n} · ${p.s.length / 2}`;
    const tw = ctx.measureText(label).width + 8;
    ctx.fillRect(x - tw / 2, by - c * 0.55, tw, c * 0.5);
    ctx.fillStyle = isSelf ? '#ffe46b' : col.light;
    ctx.fillText(label, x, by - c * 0.08);
  }

  drawLoot(list, now) {
    const ctx = this.ctx;
    const c = this.cell;
    for (const [id, kind, w, lx, ly] of list) {
      const bob = Math.sin(now / 280 + id) * c * 0.06;
      const x = (lx + 0.5) * c;
      const y = (ly + 0.5) * c + bob;
      const glow = kind === 'golden' ? 'rgba(255,210,94,0.45)' : kind === 'medkit' ? 'rgba(255,90,90,0.25)' : 'rgba(255,255,255,0.18)';
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, c * (kind === 'golden' ? 0.95 + Math.sin(now / 150) * 0.12 : 0.55), 0, Math.PI * 2);
      ctx.fill();
      if (kind === 'recruit' || kind === 'tag') {
        ctx.fillStyle = kind === 'tag' ? '#b8c2c9' : '#e8f4ff';
        ctx.beginPath();
        ctx.arc(x, y, c * (kind === 'tag' ? 0.24 : 0.3), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1f7a3a';
        ctx.lineWidth = Math.max(2, c * 0.1);
        ctx.beginPath();
        ctx.moveTo(x - c * 0.15, y);
        ctx.lineTo(x + c * 0.15, y);
        ctx.moveTo(x, y - c * 0.15);
        ctx.lineTo(x, y + c * 0.15);
        ctx.stroke();
      } else if (kind === 'medkit') {
        ctx.fillStyle = '#f4f4f4';
        ctx.fillRect(x - c * 0.32, y - c * 0.26, c * 0.64, c * 0.52);
        ctx.fillStyle = '#e23b2a';
        ctx.fillRect(x - c * 0.07, y - c * 0.2, c * 0.14, c * 0.4);
        ctx.fillRect(x - c * 0.2, y - c * 0.07, c * 0.4, c * 0.14);
      } else if (kind === 'weapon' || kind === 'golden') {
        const wc = WEAPONS[w] ? WEAPONS[w].color : '#ccc';
        ctx.fillStyle = '#20262b';
        ctx.fillRect(x - c * 0.42, y - c * 0.13, c * 0.84, c * 0.26);
        ctx.fillRect(x - c * 0.1, y, c * 0.16, c * 0.3);
        ctx.fillStyle = wc;
        ctx.fillRect(x - c * 0.38, y - c * 0.09, c * 0.5, c * 0.12);
        ctx.font = `700 ${Math.max(8, Math.round(c * 0.34))}px "Black Ops One", system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = wc;
        ctx.fillText(LOOT_LETTER[w] || '', x, y - c * 0.22);
      } else {
        const colors = { he: '#4f6b2f', flash: '#e9eef0', smoke: '#8c959b' };
        ctx.fillStyle = colors[kind] || '#888';
        ctx.strokeStyle = '#1d2226';
        ctx.lineWidth = Math.max(1, c * 0.05);
        ctx.beginPath();
        ctx.arc(x, y, c * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1d2226';
        ctx.fillRect(x - c * 0.06, y - c * 0.34, c * 0.12, c * 0.12);
      }
    }
  }

  drawGrenades(prev, curr, t) {
    const ctx = this.ctx;
    const c = this.cell;
    const old = new Map(prev ? prev.gr.map((g) => [g[0], g]) : []);
    const colors = { he: '#4f6b2f', flash: '#e9eef0', smoke: '#8c959b' };
    for (const g of curr.gr) {
      const [id, type, x, y] = g;
      const o = old.get(id);
      const gx = o ? o[2] + (x - o[2]) * t : x;
      const gy = o ? o[3] + (y - o[3]) * t : y;
      ctx.fillStyle = colors[type];
      ctx.strokeStyle = '#1d2226';
      ctx.lineWidth = Math.max(1, c * 0.05);
      ctx.beginPath();
      ctx.arc((gx + 0.5) * c, (gy + 0.5) * c, c * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
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
      const age = CONFIG.smokeTime - ttl;
      const grow = Math.min(1, age / 1.2);
      const fade = Math.min(1, ttl / 2.4);
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
  draw({ prev, curr, t, selfId, now, dt, aim }) {
    const ctx = this.ctx;
    const c = this.cell;
    if (!this.staticLayer) this.buildStatic();
    this.fx.update(dt);
    this.updateBullets(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const sx = (Math.random() - 0.5) * this.fx.shake;
    const sy = (Math.random() - 0.5) * this.fx.shake;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);
    ctx.drawImage(this.staticLayer, 0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    if (!curr) return;

    const squads = this.squadPoints(prev, curr, t);
    const self = curr.p.find((p) => p.id === selfId);
    const team = self ? self.tm : null;
    this.updateFog(curr, team);

    this.drawLoot(curr.lt, now);
    this.fx.drawBelow(ctx, c);
    const ordered = [...curr.p].sort((a, b) => (a.id === selfId) - (b.id === selfId));
    for (const p of ordered) {
      const pts = squads.get(p.id);
      if (pts) this.drawSquad(p, pts, p.id === selfId, now);
    }
    this.drawBullets();
    this.drawGrenades(prev, curr, t);
    this.fx.drawAbove(ctx, c);
    this.drawSmokes(curr.sm, now);
    this.drawFog(t);
    this.drawPings(dt);
    for (const p of curr.p) {
      const pts = squads.get(p.id);
      if (!pts) continue;
      if (p.tm !== team && !this.visible(Math.round(pts[0].x), Math.round(pts[0].y))) continue;
      this.drawTag(p, pts[0], p.id === selfId);
    }
    this.fx.drawTexts(ctx, c);
    if (aim && self && self.a) this.drawAim(aim);
  }
}
