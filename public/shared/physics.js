export function isWallCell(map, i, j) {
  return i < 0 || j < 0 || i >= map.width || j >= map.height || map.wall[j * map.width + i] === 1;
}

export function circleHitsWall(map, x, y, r) {
  for (let j = Math.round(y - r); j <= Math.round(y + r); j += 1) {
    for (let i = Math.round(x - r); i <= Math.round(x + r); i += 1) {
      if (!isWallCell(map, i, j)) continue;
      const cx = Math.max(i - 0.5, Math.min(x, i + 0.5));
      const cy = Math.max(j - 0.5, Math.min(y, j + 0.5));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}

export function pointAlong(points, d) {
  let left = d;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg >= left && seg > 0) {
      const k = left / seg;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

export function trimTrail(head, trail, maxLen) {
  let total = 0;
  let prev = head;
  for (let i = 0; i < trail.length; i += 1) {
    total += Math.hypot(trail[i].x - prev.x, trail[i].y - prev.y);
    prev = trail[i];
    if (total > maxLen) {
      trail.length = i + 1;
      return;
    }
  }
}

export function lineClear(map, ax, ay, bx, by, blocked) {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / 0.25));
  for (let s = 1; s < steps; s += 1) {
    const x = ax + ((bx - ax) * s) / steps;
    const y = ay + ((by - ay) * s) / steps;
    const i = Math.round(x);
    const j = Math.round(y);
    if (isWallCell(map, i, j)) return false;
    if (blocked && blocked(i, j)) return false;
  }
  return true;
}
