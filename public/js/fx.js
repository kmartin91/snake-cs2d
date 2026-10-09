const MAX_PARTS = 900;

export class Fx {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.shake = 0;
  }

  clear() {
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.shake = 0;
  }

  burst(x, y, { n = 10, color = '#ffd27a', speed = 6, life = 0.5, size = 0.12, drag = 3, grow = 0, kind = 'spark' } = {}) {
    if (document.hidden) return;
    for (let i = 0; i < n && this.parts.length < MAX_PARTS; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.75);
      const l = life * (0.6 + Math.random() * 0.6);
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: l,
        max: l,
        size: size * (0.6 + Math.random() * 0.8),
        color: Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color,
        drag,
        grow,
        kind
      });
    }
  }

  cone(x, y, dx, dy, { n = 6, color = '#fff2b0', speed = 9, life = 0.15, size = 0.1 } = {}) {
    if (document.hidden) return;
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n && this.parts.length < MAX_PARTS; i += 1) {
      const a = base + (Math.random() - 0.5) * 0.9;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size, color, drag: 6, grow: 0, kind: 'spark' });
    }
  }

  ring(x, y, radius, color, life = 0.5, width = 0.25) {
    if (document.hidden) return;
    this.rings.push({ x, y, radius, color, life, max: life, width });
  }

  text(x, y, str, color = '#fff', size = 1, life = 1.1) {
    if (document.hidden) return;
    this.texts.push({ x, y, str, color, size, life, max: life });
  }

  addShake(v) {
    this.shake = Math.min(28, this.shake + v);
  }

  update(dt) {
    for (const p of this.parts) {
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= dt * 1.1;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - dt * 60);
  }

  drawBelow(ctx, c) {
    for (const p of this.parts) {
      if (p.kind !== 'smoke') continue;
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc((p.x + 0.5) * c, (p.y + 0.5) * c, p.size * c, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawAbove(ctx, c) {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * c * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc((r.x + 0.5) * c, (r.y + 0.5) * c, Math.max(0.1, r.radius * c * (0.2 + k * 0.8)), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.parts) {
      if (p.kind === 'smoke') continue;
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size * c;
      if (p.kind === 'blob') {
        ctx.beginPath();
        ctx.arc((p.x + 0.5) * c, (p.y + 0.5) * c, s, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect((p.x + 0.5) * c - s / 2, (p.y + 0.5) * c - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx, c) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = Math.min(1, t.life / (t.max * 0.4));
      const pop = 1 + Math.max(0, (t.life - t.max + 0.15) / 0.15) * 0.4;
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(c * 0.62 * t.size * pop)}px "Black Ops One", system-ui`;
      ctx.lineWidth = Math.max(2, c * 0.12);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(t.str, (t.x + 0.5) * c, (t.y + 0.5) * c);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, (t.x + 0.5) * c, (t.y + 0.5) * c);
    }
    ctx.globalAlpha = 1;
  }
}
