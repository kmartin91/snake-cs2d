import { ZONE } from './config.js';

export const MAP_ROWS = [
  '########################################',
  '#............##........................#',
  '#............##...........aaaaaaa#.....#',
  '#......##..............#..aaaaaaa#.....#',
  '#.........................aaa##aa#.....#',
  '#.......##############....aaa##aa#.....#',
  '#.......##############....aaaaaaa#.....#',
  '#.......##############....aaaaaaa......#',
  '#.......##############.................#',
  '#ttttt..##############............ccccc#',
  '#ttttt............##.....#######..ccccc#',
  '#ttttt............##.....#######..ccccc#',
  '#ttttt....##.............#######..ccccc#',
  '#ttttt....##.............#######..ccccc#',
  '#ttttt............##.....#######..ccccc#',
  '#ttttt............##.....#######..ccccc#',
  '#ttttt..##############............ccccc#',
  '#.......##############.................#',
  '#.......##############....bbbbbbb......#',
  '#.......##############....bbbbbbb#.....#',
  '#.........................bbb##bb#.....#',
  '#.........................bbb##bb#.....#',
  '#......##..............#..bbbbbbb#.....#',
  '#............##...........bbbbbbb#.....#',
  '#............##........................#',
  '########################################'
];

export const CALLOUTS = [
  { x: 18.5, y: 3.5, text: 'LONG A' },
  { x: 15, y: 13, text: 'MID' },
  { x: 18.5, y: 22.5, text: 'TUNNELS B' },
  { x: 23.5, y: 7.5, text: 'SHORT', vertical: true },
  { x: 23.5, y: 18.5, text: 'SHORT', vertical: true },
  { x: 36.5, y: 6, text: 'CT' }
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
