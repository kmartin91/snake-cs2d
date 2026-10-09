import { ZONE } from './config.js';

export const MAP_ROWS = [
  '################################################',
  '#..............##..............................#',
  '#..............##............aaaaaaaa..........#',
  '#............................aaaaaaaa..........#',
  '#............................aaa##aaa..........#',
  '#........################....aaa##aaa.#........#',
  '#........################....aaaaaaaa.#........#',
  '#........################....aaaaaaaa.#........#',
  '#........################....aaaaaaaa.#........#',
  '#........################.............#........#',
  '#........################.............#........#',
  '#.tttttt...............##...#########...cccccc.#',
  '#.tttttt...............##...#########...cccccc.#',
  '#.tttttt.........##....##...#########...cccccc.#',
  '#.tttttt.........##.........#########...cccccc.#',
  '#.tttttt.........##.........#########...cccccc.#',
  '#.tttttt.........##....##...#########...cccccc.#',
  '#.tttttt...............##...#########...cccccc.#',
  '#.tttttt...............##...#########...cccccc.#',
  '#........################.............#........#',
  '#........################.............#........#',
  '#........################....bbbbbbbb.#........#',
  '#........################....bbbbbbbb.#........#',
  '#........################....bbbbbbbb.#........#',
  '#........################....bbb##bbb.#........#',
  '#............................bbb##bbb..........#',
  '#............................bbbbbbbb..........#',
  '#..............##............bbbbbbbb..........#',
  '#..............##..............................#',
  '################################################'
];

export function parseMap(rows = MAP_ROWS) {
  const height = rows.length;
  const width = rows[0].length;
  const wall = new Uint8Array(width * height);
  const zone = new Uint8Array(width * height);
  const sites = { A: [], B: [] };
  const floor = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ch = rows[y][x];
      const i = y * width + x;
      if (ch === '#') {
        wall[i] = 1;
        continue;
      }
      floor.push({ x, y });
      if (ch === 'a') {
        zone[i] = ZONE.A;
        sites.A.push({ x, y });
      } else if (ch === 'b') {
        zone[i] = ZONE.B;
        sites.B.push({ x, y });
      } else if (ch === 't') {
        zone[i] = ZONE.T;
      } else if (ch === 'c') {
        zone[i] = ZONE.CT;
      }
    }
  }

  const center = (cells) => ({
    x: cells.reduce((s, c) => s + c.x, 0) / cells.length,
    y: cells.reduce((s, c) => s + c.y, 0) / cells.length
  });

  return {
    width,
    height,
    wall,
    zone,
    sites,
    floor,
    siteCenter: { A: center(sites.A), B: center(sites.B) }
  };
}
