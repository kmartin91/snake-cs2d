# Snake CS2D

A multiplayer browser game that mixes Snake with Counter-Strike objectives.

## Gameplay Mix

- Players are auto-assigned to `T` (Terrorists) or `CT` (Counter-Terrorists).
- Each player is a snake that grows by collecting ammo crates.
- `T` players must pick up the bomb, enter center site zone, and hold `E` to plant.
- `CT` players must hold `E` on the planted bomb to defuse.
- Round timer is 45s, bomb timer is 15s, plant/defuse are 3s each.
- Mobile is supported with on-screen directional buttons and a hold action button.
- Snake collision rules still apply: hit a body/head, die, then respawn.
- Rounds score by objective and eliminations, first team to 13 rounds wins.
- Sides swap after 12 completed rounds.

## Run Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000)

Optional performance tuning:

- Set `TICK_MS` (default `110`) to tune server update rate.
- Example: `TICK_MS=66 npm run dev` for a faster feel.

## Multiplayer Hosting Strategy

This project has 2 parts:

- Frontend: static files in `public/`
- Realtime backend: `server.js` (Node + Socket.IO)

For the simplest setup, deploy only the backend (`server.js`) and open that URL directly: it serves both the page and Socket.IO.

## Suggested Deploy Setup

1. Deploy backend (`server.js`) to Render/Railway/Fly.
2. Open the backend URL and play directly.

## Render Blueprint

A ready-to-use Render blueprint is included:

- [render.yaml](/Users/k.martin/Documents/Dev/Javascript/Perso/SnakeCS2D/render.yaml)

It creates:

- `snakecs2d` (Node web service for Socket.IO)
