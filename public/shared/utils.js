export const enemyOf = (team) => (team === 'T' ? 'CT' : 'T');
export const opposite = (d) => (d + 2) % 4;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[rand(arr.length)];
export const same = (a, b) => a.x === b.x && a.y === b.y;
export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function minBy(arr, fn) {
  let best = null;
  let bestScore = Infinity;
  for (const item of arr) {
    const score = fn(item);
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export function flatten(cells) {
  const out = new Array(cells.length * 2);
  for (let i = 0; i < cells.length; i += 1) {
    out[i * 2] = cells[i].x;
    out[i * 2 + 1] = cells[i].y;
  }
  return out;
}
