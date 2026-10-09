export const FOG_PHASES = new Set(['countdown', 'live', 'warmup']);

function smokeMask(map, smokes) {
  if (!smokes.length) return null;
  const { width, height } = map;
  const mask = new Uint8Array(width * height);
  for (const s of smokes) {
    const r = Math.ceil(s.r);
    for (let y = Math.max(0, Math.floor(s.y) - r); y <= Math.min(height - 1, Math.ceil(s.y) + r); y += 1) {
      for (let x = Math.max(0, Math.floor(s.x) - r); x <= Math.min(width - 1, Math.ceil(s.x) + r); x += 1) {
        if (Math.hypot(x - s.x, y - s.y) <= s.r) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

function sees(map, smoke, x0, y0, x1, y1) {
  const { width, wall } = map;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    const i = y * width + x;
    if (x === x1 && y === y1) {
      return !(smoke && smoke[i] && Math.abs(x - x0) + Math.abs(y - y0) > 1);
    }
    if (wall[i]) return false;
    if (smoke && smoke[i] && Math.abs(x - x0) + Math.abs(y - y0) > 1) return false;
  }
  return true;
}

export function computeVision(map, sources, smokes, out) {
  const { width, height } = map;
  const mask = out || new Uint8Array(width * height);
  mask.fill(0);
  const smoke = smokeMask(map, smokes);
  for (const src of sources) {
    const hx = Math.round(src.x);
    const hy = Math.round(src.y);
    const r = src.r;
    const R = Math.ceil(r);
    const r2 = r * r;
    for (let dy = -R; dy <= R; dy += 1) {
      for (let dx = -R; dx <= R; dx += 1) {
        if (dx * dx + dy * dy > r2) continue;
        const x = hx + dx;
        const y = hy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = y * width + x;
        if (mask[i]) continue;
        if (sees(map, smoke, hx, hy, x, y)) mask[i] = 1;
      }
    }
  }
  return mask;
}
